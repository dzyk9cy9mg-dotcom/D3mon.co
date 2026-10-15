// Kalshi (step 5): polls Kalshi's public market data for the BTC 15-minute series and records each
// settled round in the ledger as a score line with source "kalshi". From there the existing modules do
// the rest: Kalshi's result takes precedence over one entered by hand (metrics.result), calls are
// scored (round.scored), and stats built from those rounds read "verified".
//
// Written against what Kalshi actually returned from the Lightsail server on 2026-10-15
// (GET /markets?series_ticker=KXBTC15M&status=settled):
//   { "ticker": "KXBTC15M-26OCT150245-45", "status": "finalized", "result": "yes",
//     "open_time": "2026-10-15T06:30:00Z", "close_time": "2026-10-15T06:45:00Z",
//     "settlement_ts": "2026-10-15T06:45:04.126246Z", "strike_type": "greater_or_equal",
//     "floor_strike": 80847.53, "expiration_value": "80849.65", ... }
// The round is the market's open_time (our rounds are named by their start). "yes" means BTC finished
// at or above the target (floor_strike), which is "up"; "no" is "down". The newest markets come first,
// and the response carries a cursor for older pages. No account or key is needed.
//
// Ledger line: { t: "score", market, round, result, source: "kalshi", ticker, strike, final, settledAt }
// A round already settled by Kalshi with the same result is never written twice.
import { ROUND_MS } from "./registry.js";
import { MARKET } from "./calls.js";

export const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const SETTLED = new Set(["finalized", "settled"]);
const RESULTS = { yes: "up", no: "down" };
const LOOKBACK_MS = 7 * 24 * 3600 * 1000; // older rounds are left to HardSmoke
const MISSING_AFTER_MS = 30 * 60000; // a round still without a Kalshi result this long after it ends is flagged
const MAX_PAGES = 10;
const PAGE = 20; // five hours of rounds
const DEEP_PAGE = 200; // when catching up
const TIMEOUT_MS = 15000;
const ms = v => (typeof v === "string" && v.length <= 40 ? Date.parse(v) : NaN);
const num = v => (typeof v === "number" ? v : typeof v === "string" && /^-?\d{1,12}(\.\d{1,8})?$/.test(v) ? Number(v) : NaN);

// One Kalshi market -> what we record, or { skip: reason } when it isn't a settled KXBTC15M round we understand.
export function parseMarket(m) {
  if (!m || typeof m !== "object") return { skip: "not_an_object" };
  const ticker = m.ticker;
  if (typeof ticker !== "string" || !/^KXBTC15M-[A-Z0-9-]{1,40}$/.test(ticker)) return { skip: "other_ticker" };
  if (!SETTLED.has(m.status)) return { skip: "not_settled", ticker };
  if (!(m.result in RESULTS)) return { skip: "no_result", ticker };
  if (m.strike_type !== "greater_or_equal") return { skip: "strike_type", ticker };
  const open = ms(m.open_time), close = ms(m.close_time);
  if (!Number.isFinite(open) || open % ROUND_MS !== 0 || close - open !== ROUND_MS) return { skip: "not_a_15_minute_round", ticker };
  const out = { market: MARKET, round: open, result: RESULTS[m.result], ticker };
  const strike = num(m.floor_strike), final = num(m.expiration_value), settledAt = ms(m.settlement_ts);
  if (Number.isFinite(strike)) out.strike = strike;
  if (Number.isFinite(final)) out.final = final;
  if (Number.isFinite(settledAt)) out.settledAt = settledAt;
  // Kalshi's result is the settlement; the prices are for display. Say so if they ever disagree.
  if (out.strike !== undefined && out.final !== undefined && (out.final >= out.strike ? "up" : "down") !== out.result) out.priceCheck = "disagrees";
  return out;
}

// When to poll next: soon after each round closes (Kalshi settles a few seconds later), every 20 s for
// the first three minutes of a round, then every 60 s. Errors back off up to ten minutes.
export function nextDelay(now, errors = 0) {
  if (errors) return Math.min(10 * 60000, 30000 * 2 ** (errors - 1));
  const sinceStart = now % ROUND_MS;
  const regular = sinceStart < 3 * 60000 ? 20000 : 60000;
  const afterClose = ROUND_MS - sinceStart + 8000; // 8 s after the next close
  return Math.max(1000, Math.min(regular, afterClose));
}

export class Kalshi {
  constructor({ ledger, metrics, registry, calls, feed, base = KALSHI_BASE, fetch = globalThis.fetch, now = () => Date.now() }) {
    Object.assign(this, { ledger, metrics, registry, calls, feed, base, fetch, now });
    this.timer = null;
    this.state = { lastPollAt: null, lastOkAt: null, lastError: null, errors: 0, recorded: 0 };
  }

  #has(round, result) {
    return (this.metrics.scores.get(`${MARKET}|${round}`) || []).some(l => l.source === "kalshi" && (!result || l.result === result));
  }

  // Rounds we need a result for: any with calls or in a battle, that have ended, within the lookback.
  needed(now = this.now()) {
    const out = new Set();
    const from = now - LOOKBACK_MS, until = now - ROUND_MS; // a round has ended once its start is a round ago
    for (const key of this.calls.byRound.keys()) {
      const [market, r] = key.split("|");
      if (market === MARKET && +r >= from && +r <= until) out.add(+r);
    }
    for (const b of this.registry.allBattles()) {
      if (b.status === "draft" || b.market !== MARKET) continue;
      for (let i = 0; i < b.rounds; i++) {
        const r = b.startsAt + i * b.roundMs;
        if (r >= from && r <= until) out.add(r);
      }
    }
    return [...out].filter(r => !this.#has(r)).sort((a, b) => a - b);
  }

  // Needed rounds Kalshi still hasn't settled 30 minutes after they ended: HardSmoke can enter them on /metrics.
  missing(now = this.now()) {
    return this.needed(now).filter(r => r + ROUND_MS + MISSING_AFTER_MS <= now);
  }

  async #page(cursor, limit) {
    const url = new URL(`${this.base}/markets`);
    url.searchParams.set("series_ticker", MARKET);
    url.searchParams.set("status", "settled");
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await this.fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Kalshi answered ${res.status}`);
    const body = await res.json();
    if (!body || !Array.isArray(body.markets)) throw new Error("Kalshi's answer had no markets list");
    return { markets: body.markets, cursor: typeof body.cursor === "string" && body.cursor ? body.cursor : null };
  }

  // Fetches the newest settled rounds, and older pages while a needed round is still unseen.
  async poll() {
    const now = this.now();
    this.state.lastPollAt = now;
    const oldest = this.needed(now)[0];
    const lines = [];
    const seen = new Set();
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { markets, cursor: next } = await this.#page(cursor, page ? DEEP_PAGE : PAGE);
      let earliest = Infinity;
      for (const m of markets) {
        const p = parseMarket(m);
        if (p.skip) continue;
        earliest = Math.min(earliest, p.round);
        if (seen.has(p.round) || this.#has(p.round, p.result)) continue;
        seen.add(p.round);
        if (p.priceCheck) console.warn(`Kalshi ${p.ticker}: result ${p.result} disagrees with its prices; recording Kalshi's result`);
        lines.push({ t: "score", ...p, source: "kalshi" });
      }
      cursor = next;
      if (!cursor || !markets.length || oldest === undefined || earliest <= oldest || earliest < now - LOOKBACK_MS) break;
    }
    // Oldest first, so the ledger reads in round order. Each line is fsync'd before we go on.
    lines.sort((a, b) => a.round - b.round);
    if (lines.length) this.ledger.append(lines, null);
    this.state.lastOkAt = this.now();
    this.state.recorded += lines.length;
    return lines;
  }

  // What HardSmoke sees: is the poller healthy, and which rounds need a hand-entered result.
  status() {
    const s = this.state;
    return {
      market: MARKET, polling: !!this.timer,
      lastPollAt: s.lastPollAt, lastOkAt: s.lastOkAt, lastError: s.lastError, consecutiveErrors: s.errors, recordedSinceStart: s.recorded,
      missing: this.missing().map(r => new Date(r).toISOString()),
    };
  }

  start() {
    const tick = async () => {
      try {
        await this.poll();
        if (this.state.errors) console.log(`Kalshi polling recovered after ${this.state.errors} failed attempts`);
        this.state.errors = 0;
        this.state.lastError = null;
      } catch (e) {
        this.state.errors++;
        this.state.lastError = String(e?.message || e).slice(0, 200);
        if (this.state.errors === 1 || this.state.errors % 10 === 0) console.error(`Kalshi polling failed (${this.state.errors}): ${this.state.lastError}`);
      }
      if (!this.timer) return; // stopped while polling
      this.timer = setTimeout(tick, nextDelay(this.now(), this.state.errors));
      this.timer.unref?.();
    };
    this.timer = setTimeout(tick, 2000);
    this.timer.unref?.();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
