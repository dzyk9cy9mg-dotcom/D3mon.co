// Prices: what Kalshi was charging for Up and Down in a round at the moment each call was made, so a
// call can be scored like a $1 Kalshi contract bought at that price (paper only: D3MON never trades).
// An Up call "buys" YES at its ask, a Down call buys NO at its ask. Right pays $1, so the paper profit
// per $1 contract is 1 − price when right and −price when wrong. Nobody sends these prices: the server
// reads them from Kalshi itself, so the stats built on them are verified.
//
// How a call gets its price, best first:
//   "live"      the server asks Kalshi for the open round's prices the moment the call arrives (lagMs says how long that took)
//   "snapshot"  if that request fails, the last prices the server read for that round, up to a minute old
//   "candle"    for calls made before this existed, or when Kalshi couldn't be reached: Kalshi's one-minute
//               price history for that round, using the last minute that ended before the call
// Ledger line: { t: "call_price", callId, entrantId, round, side: "yes" | "no", paid, yesBid, yesAsk, noBid,
//                noAsk, quotedAt, source, ticker?, lagMs? }   (prices in dollars, 0 to 1)
//
// Kalshi's market objects carry prices as dollar strings ("yes_ask_dollars": "0.6200", seen on
// 2026-10-15) and, in older answers, as whole cents ("yes_ask": 62). Both are read; dollars win.
import { MARKET, currentRound } from "./calls.js";
import { ROUND_MS } from "./registry.js";
import { KALSHI_BASE } from "./kalshi.js";

const TIMEOUT_MS = 10000;
const QUOTE_EVERY_MS = 10000; // the open round's prices, for the snapshot fallback
const BACKFILL_EVERY_MS = 5 * 60000;
const SNAPSHOT_MAX_AGE_MS = 60000;
const BACKFILL_LOOKBACK_MS = 30 * 24 * 3600 * 1000;
const r4 = v => Math.round(v * 10000) / 10000;

// A price in dollars from Kalshi's "<name>_dollars" string or "<name>" cents, or null if missing or not a
// real price (an empty side of the book reads 0, and a price of $1 can't be bought for profit).
export function dollars(o, name) {
  if (!o || typeof o !== "object") return null;
  const d = o[`${name}_dollars`], c = o[name];
  let v = NaN;
  if (typeof d === "string" && /^\d{1,3}(\.\d{1,6})?$/.test(d)) v = Number(d);
  else if (typeof d === "number") v = d;
  else if (typeof c === "number" && Number.isFinite(c)) v = c / 100;
  return Number.isFinite(v) && v > 0 && v < 1 ? r4(v) : null;
}

// The four sides of the book for a market or a candle field set. NO's ask is 1 − YES's bid when Kalshi
// leaves it out (they're the same order), and the other way round.
function book(yesBid, yesAsk, noBid, noAsk, last) {
  return {
    yesBid, yesAsk: yesAsk ?? (noBid !== null ? r4(1 - noBid) : null),
    noBid, noAsk: noAsk ?? (yesBid !== null ? r4(1 - yesBid) : null),
    last,
  };
}

// An open KXBTC15M market -> its round and prices, or null when it isn't one.
export function parseQuote(m) {
  if (!m || typeof m !== "object" || typeof m.ticker !== "string" || !m.ticker.startsWith(`${MARKET}-`)) return null;
  const open = typeof m.open_time === "string" ? Date.parse(m.open_time) : NaN;
  if (!Number.isFinite(open) || open % ROUND_MS) return null;
  const b = book(dollars(m, "yes_bid"), dollars(m, "yes_ask"), dollars(m, "no_bid"), dollars(m, "no_ask"), dollars(m, "last_price"));
  return { round: open, ticker: m.ticker, ...b };
}

// One of Kalshi's one-minute candles -> when it ended and the prices at its open and close.
export function parseCandle(c) {
  if (!c || typeof c !== "object" || !Number.isFinite(c.end_period_ts)) return null;
  const at = (field, which) => dollars(c[field], which);
  const side = which => book(at("yes_bid", which), at("yes_ask", which), null, null, at("price", which));
  return { end: c.end_period_ts * 1000, open: side("open"), close: side("close") };
}

// What a call paid: the ask of the side it backed, falling back to the last trade price.
export function paidFor(dir, b) {
  if (!b) return null;
  if (dir === "up") return b.yesAsk ?? b.last ?? null;
  return b.noAsk ?? (b.last !== null && b.last !== undefined ? r4(1 - b.last) : null);
}

// For Kalshi's candles: when nobody is offering, an ask reads as a placeholder (99.9¢ or 0.1¢, seen on the
// server on 2026-10-18 in a round's first and last minutes). If the ask is that far from what people
// actually traded at in the same minute, the traded price is used instead.
const PLACEHOLDER_GAP = 0.15;
export function paidForCandle(dir, b) {
  const ask = (dir === "up" ? b?.yesAsk : b?.noAsk) ?? null, traded = paidFor(dir, { yesAsk: null, noAsk: null, last: b?.last ?? null });
  if (ask !== null && (traded === null || Math.abs(ask - traded) <= PLACEHOLDER_GAP)) return { paid: ask, from: "ask" };
  return traded !== null ? { paid: traded, from: "trade" } : null;
}

// Paper profit on one $1 contract: right pays $1.
export const paper = (paid, correct) => r4(correct ? 1 - paid : -paid);

export class Prices {
  constructor({ ledger, calls, metrics, base = KALSHI_BASE, fetch = globalThis.fetch, now = () => Date.now(), live = false }) {
    Object.assign(this, { ledger, calls, metrics, base, fetch, now, live });
    this.byCall = new Map(); // callId -> call_price line
    this.snapshot = null; // the last quote read for the open round, with its time
    this.state = { lastQuoteAt: null, lastBackfillAt: null, lastError: null, priced: 0 };
    this.timers = [];
    const index = lines => { for (const l of lines) if (l.t === "call_price" && !this.byCall.has(l.callId)) this.byCall.set(l.callId, l); };
    index(ledger.lines);
    ledger.on("append", lines => {
      index(lines);
      if (this.live) for (const l of lines) if (l.t === "call") this.priceCall(l).catch(e => this.#error(e));
    });
  }

  forCall(callId) {
    return this.byCall.get(callId) || null;
  }

  #error(e) {
    this.state.lastError = String(e?.message || e).slice(0, 200);
  }

  async #get(path, params) {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await this.fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Kalshi answered ${res.status}`);
    return res.json();
  }

  // The open round's prices, right now.
  async quote() {
    const body = await this.#get("/markets", { series_ticker: MARKET, status: "open", limit: 10 });
    if (!body || !Array.isArray(body.markets)) throw new Error("Kalshi's answer had no markets list");
    const at = this.now(), round = currentRound(at);
    const q = body.markets.map(parseQuote).find(x => x && x.round === round) || null;
    if (q) this.snapshot = { ...q, at };
    this.state.lastQuoteAt = at;
    return q ? { ...q, at } : null;
  }

  #write(l, b, source, quotedAt, extra = {}) {
    if (this.byCall.has(l.id)) return this.byCall.get(l.id);
    let paid = paidFor(l.dir, b);
    if (source === "candle") { const c = paidForCandle(l.dir, b); paid = c ? c.paid : null; if (c?.from === "trade") extra = { ...extra, from: "trade" }; }
    if (paid === null) return null;
    const [saved] = this.ledger.append([{ t: "call_price", callId: l.id, entrantId: l.entrantId, round: l.round, side: l.dir === "up" ? "yes" : "no", paid,
      yesBid: b.yesBid, yesAsk: b.yesAsk, noBid: b.noBid, noAsk: b.noAsk, quotedAt, source, ...extra }], null);
    this.state.priced++;
    return saved;
  }

  // Prices one call as it arrives. Only calls for the round open now can be priced live; calls made ahead
  // for a later round get their price from the candles once that round has a history.
  async priceCall(l) {
    if (this.byCall.has(l.id) || l.round !== currentRound(l.at)) return null;
    try {
      const q = await this.quote();
      if (q && q.round === l.round) return this.#write(l, q, "live", q.at, { ticker: q.ticker, lagMs: Math.max(0, q.at - l.at) });
    } catch (e) { this.#error(e); }
    const s = this.snapshot;
    if (s && s.round === l.round && l.at - s.at <= SNAPSHOT_MAX_AGE_MS && s.at <= l.at + SNAPSHOT_MAX_AGE_MS) return this.#write(l, s, "snapshot", s.at, { ticker: s.ticker });
    return null; // the backfill will price it from the candles
  }

  // Calls without a price, in rounds that have ended and that Kalshi settled (so we know the market's ticker).
  unpriced(now = this.now()) {
    const out = new Map(); // round -> { ticker, lines }
    for (const [key, lines] of this.calls.byRound) {
      const [market, r] = key.split("|"), round = +r;
      if (market !== MARKET || round + ROUND_MS > now || round < now - BACKFILL_LOOKBACK_MS) continue;
      const todo = lines.filter(l => !this.byCall.has(l.id));
      if (!todo.length) continue;
      const score = (this.metrics.scores.get(key) || []).find(s => s.source === "kalshi" && s.ticker);
      if (score) out.set(round, { ticker: score.ticker, lines: todo });
    }
    return out;
  }

  // Prices earlier calls from Kalshi's one-minute candles for their round: the last minute that ended at
  // or before the call, or the first minute's opening prices for a call in the round's first minute.
  async backfill(now = this.now()) {
    let written = 0;
    for (const [round, { ticker, lines }] of this.unpriced(now)) {
      const body = await this.#get(`/series/${MARKET}/markets/${encodeURIComponent(ticker)}/candlesticks`, { start_ts: Math.floor(round / 1000), end_ts: Math.floor((round + ROUND_MS) / 1000), period_interval: 1 });
      const candles = (Array.isArray(body?.candlesticks) ? body.candlesticks : []).map(parseCandle).filter(Boolean).sort((a, b) => a.end - b.end);
      if (!candles.length) continue;
      for (const l of lines) {
        const before = candles.filter(c => c.end <= l.at).pop();
        const [b, quotedAt] = before ? [before.close, before.end] : [candles[0].open, candles[0].end - 60000];
        if (this.#write(l, b, "candle", quotedAt, { ticker })) written++;
      }
    }
    this.state.lastBackfillAt = this.now();
    return written;
  }

  status() {
    const s = this.state;
    return { live: this.live, lastQuoteAt: s.lastQuoteAt, lastBackfillAt: s.lastBackfillAt, lastError: s.lastError, pricedSinceStart: s.priced, snapshot: this.snapshot };
  }

  start() {
    const every = (ms, fn, first) => {
      const run = async () => { try { await fn(); } catch (e) { this.#error(e); } };
      const t = setInterval(run, ms); t.unref?.();
      const f = setTimeout(run, first); f.unref?.();
      this.timers.push(t, f);
    };
    every(QUOTE_EVERY_MS, () => this.quote(), 3000);
    every(BACKFILL_EVERY_MS, () => this.backfill(), 20000);
  }

  stop() {
    for (const t of this.timers) { clearInterval(t); clearTimeout(t); }
    this.timers = [];
  }
}
