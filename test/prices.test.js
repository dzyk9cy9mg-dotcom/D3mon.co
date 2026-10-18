// Prices: Kalshi's price for the side called, read by the server when each call arrives (or from Kalshi's
// one-minute price history for older calls), and the paper result of a $1 contract bought at that price.
// A stand-in Kalshi server answers in Kalshi's format: prices as dollar strings, as seen on 2026-10-15.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer, Client } from "./helpers.js";
import { dollars, parseQuote, parseCandle, paidFor, paper } from "../server/arena/prices.js";

const Q = 15 * 60000, MIN = 60000;
const iso = ms => new Date(ms).toISOString().replace(".000Z", "Z");

describe("reading Kalshi's prices", () => {
  test("dollar strings are read, cents are the fallback, and empty or $1 sides are no price", () => {
    assert.equal(dollars({ yes_ask_dollars: "0.6200" }, "yes_ask"), 0.62);
    assert.equal(dollars({ yes_ask: 62 }, "yes_ask"), 0.62, "older answers in cents");
    assert.equal(dollars({ yes_ask_dollars: "0.6200", yes_ask: 10 }, "yes_ask"), 0.62, "dollars win");
    for (const v of ["0.0000", "1.0000", "abc", "", null, undefined]) assert.equal(dollars({ yes_ask_dollars: v }, "yes_ask"), null, String(v));
    assert.equal(dollars({ yes_ask: 0 }, "yes_ask"), null);
    assert.equal(dollars(null, "yes_ask"), null);
  });

  test("an open market gives its round and all four sides, filling NO's ask from YES's bid", () => {
    const q = parseQuote({ ticker: "KXBTC15M-26OCT150300-00", status: "open", open_time: "2026-10-15T06:45:00Z", yes_bid_dollars: "0.5800", yes_ask_dollars: "0.6200", last_price_dollars: "0.6000" });
    assert.deepEqual(q, { round: Date.parse("2026-10-15T06:45:00Z"), ticker: "KXBTC15M-26OCT150300-00", yesBid: 0.58, yesAsk: 0.62, noBid: null, noAsk: 0.42, last: 0.6 });
    assert.equal(parseQuote({ ticker: "KXETH15M-X", open_time: "2026-10-15T06:45:00Z" }), null, "another series");
    assert.equal(parseQuote({ ticker: "KXBTC15M-X", open_time: "2026-10-15T06:46:00Z" }), null, "not a round start");
  });

  test("a call pays the ask of the side it backed; right pays $1", () => {
    const b = { yesBid: 0.58, yesAsk: 0.62, noBid: 0.38, noAsk: 0.42, last: 0.6 };
    assert.equal(paidFor("up", b), 0.62);
    assert.equal(paidFor("down", b), 0.42);
    assert.equal(paidFor("up", { yesAsk: null, noAsk: null, last: 0.55 }), 0.55, "no asks: the last trade");
    assert.equal(paidFor("down", { yesAsk: null, noAsk: null, last: 0.55 }), 0.45);
    assert.equal(paidFor("up", { yesAsk: null, noAsk: null, last: null }), null);
    assert.equal(paper(0.62, true), 0.38);
    assert.equal(paper(0.62, false), -0.62);
  });

  test("a candle gives the prices at its open and its close", () => {
    const c = parseCandle({ end_period_ts: 1760510760, yes_bid: { open_dollars: "0.5000", close_dollars: "0.5500" }, yes_ask: { open: 52, close: 57 }, price: { close_dollars: "0.5600" } });
    assert.equal(c.end, 1760510760000);
    assert.deepEqual(c.close, { yesBid: 0.55, yesAsk: 0.57, noBid: null, noAsk: 0.45, last: 0.56 });
    assert.equal(c.open.yesAsk, 0.52);
    assert.equal(parseCandle({}), null);
  });
});

// Stand-in Kalshi: open markets, settled markets and one-minute candles.
function fakeKalshi() {
  const k = { open: [], settled: [], candles: {}, failOpen: false, requests: [] };
  k.server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    k.requests.push(u.pathname + u.search);
    const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const m = u.pathname.match(/^\/series\/KXBTC15M\/markets\/([^/]+)\/candlesticks$/);
    if (m) return send(200, { ticker: m[1], candlesticks: k.candles[decodeURIComponent(m[1])] || [] });
    if (u.pathname === "/markets" && u.searchParams.get("status") === "open") return k.failOpen ? send(503, { error: "busy" }) : send(200, { cursor: "", markets: k.open });
    if (u.pathname === "/markets") return send(200, { cursor: "", markets: k.settled });
    send(404, {});
  });
  return new Promise(r => k.server.listen(0, "127.0.0.1", () => { k.base = `http://127.0.0.1:${k.server.address().port}`; r(k); }));
}

describe("pricing calls", () => {
  let k, srv, hs, odin, guest, battle, bots = [], tokens = [];
  const now = Date.now(), CUR = Math.floor(now / Q) * Q, OLD = CUR - 2 * Q;
  const arena = () => srv.app.arena;
  const priceLines = () => arena().ledger.lines.filter(l => l.t === "call_price");
  const call = async (i, round, direction, at) => {
    if (at) arena().calls.now = () => at;
    const r = await fetch(`${srv.base}/api/v1/bot/calls`, { method: "POST", headers: { authorization: `Bearer ${tokens[i]}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction, round: new Date(round).toISOString() }) });
    assert.equal(r.status, 201, await r.text());
    arena().calls.now = () => Date.now();
    return r;
  };
  const until = async fn => { for (let i = 0; i < 100 && !fn(); i++) await new Promise(r => setTimeout(r, 20)); return fn(); };

  before(async () => {
    k = await fakeKalshi();
    srv = await startServer({ kalshiUrl: k.base });
    [hs, odin, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    battle = (await hs.post("/api/v1/battles", { title: "Price night", startsAt: OLD, rounds: 8, status: "open" })).json.battle;
    for (const name of ["Valhalla", "Bifrost", "Mjolnir"]) {
      const a = (await odin.post(`/api/v1/battles/${battle.id}/applications`, { kind: "bot", name, creatorName: "Odin" })).json.application;
      const id = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
      bots.push(id);
      tokens.push((await odin.post(`/api/v1/entrants/${id}/keys`, {})).json.token);
    }
  });
  after(async () => { await srv.stop(); k.server.close(); });

  test("off on test servers: no price is asked for", async () => {
    assert.equal(arena().prices.live, false);
    assert.equal(arena().prices.timers.length, 0);
  });

  test("an earlier call is priced from Kalshi's candles once the round is settled, and scored on paper", async () => {
    // Valhalla called Up 5½ minutes into OLD; Bifrost called Down in its first half minute.
    await call(0, OLD, "up", OLD + 5.5 * MIN);
    await call(1, OLD, "down", OLD + 20000);
    const ticker = "KXBTC15M-OLD-00";
    k.settled = [{ ticker, status: "finalized", result: "yes", open_time: iso(OLD), close_time: iso(OLD + Q), strike_type: "greater_or_equal", floor_strike: 80000, expiration_value: "80010.00" }];
    k.candles[ticker] = Array.from({ length: 15 }, (_, i) => ({ end_period_ts: (OLD + (i + 1) * MIN) / 1000,
      yes_bid: { open_dollars: (0.40 + i * 0.02).toFixed(4), close_dollars: (0.42 + i * 0.02).toFixed(4) },
      yes_ask: { open_dollars: (0.44 + i * 0.02).toFixed(4), close_dollars: (0.46 + i * 0.02).toFixed(4) } }));
    assert.equal(arena().prices.unpriced().size, 0, "not until Kalshi has settled it (we need the market's ticker)");
    await arena().kalshi.poll();
    assert.equal(arena().prices.unpriced().size, 1);
    assert.equal(await arena().prices.backfill(), 2);
    const [v, b] = [bots[0], bots[1]].map(id => priceLines().find(l => l.entrantId === id));
    assert.deepEqual([v.source, v.side, v.paid, v.quotedAt], ["candle", "yes", 0.54, OLD + 5 * MIN], "the minute that ended before the call: minute 5's close");
    assert.deepEqual([b.source, b.side, b.paid, b.quotedAt], ["candle", "no", 0.6, OLD], "in the first minute: the first minute's open (NO ask = 1 − YES bid)");
    assert.equal(await arena().prices.backfill(), 0, "never priced twice");

    const board = (await guest.get(`/api/v1/battles/${battle.id}/board`)).json;
    const cells = board.rounds[0].calls;
    const val = cells.find(c => c.entrantId === bots[0]), bif = cells.find(c => c.entrantId === bots[1]);
    assert.deepEqual([val.price.paid, val.paperPerContract], [0.54, 0.46], "Up was right: paid 54¢, won 46¢");
    assert.deepEqual([bif.price.paid, bif.paperPerContract], [0.6, -0.6], "Down was wrong: lost the 60¢");
    const row = board.entrants.find(e => e.entrantId === bots[0]);
    assert.deepEqual([row.priced, row.paperPerContract, row.avgPaid], [1, 0.46, 0.54]);
  });

  test("the verified stats carry the paper results, labelled verified", () => {
    const v = arena().verified.compute(bots[0]);
    assert.deepEqual([v.v_paper.value, v.v_avg_paid.value, v.v_edge.value, v.v_paper.verification], [0.46, 0.54, 0.46, "verified"], "right once at 54¢: beat the odds by 46 points");
    const w = arena().verified.compute(bots[1]);
    assert.deepEqual([w.v_paper.value, w.v_edge.value], [-0.6, -0.6]);
  });

  test("a call in the open round is priced live, the moment it arrives", async () => {
    arena().prices.live = true;
    k.open = [{ ticker: "KXBTC15M-CUR-00", status: "open", open_time: iso(CUR), close_time: iso(CUR + Q), yes_bid_dollars: "0.5800", yes_ask_dollars: "0.6200", no_bid_dollars: "0.3800", no_ask_dollars: "0.4200" }];
    await call(0, CUR, "down");
    const l = await until(() => priceLines().find(x => x.entrantId === bots[0] && x.round === CUR));
    assert.ok(l, "priced");
    assert.deepEqual([l.source, l.side, l.paid, l.ticker], ["live", "no", 0.42, "KXBTC15M-CUR-00"]);
    assert.ok(l.lagMs >= 0 && l.lagMs < 5000, `asked Kalshi straight after the call (${l.lagMs} ms)`);
    const c = (await guest.get(`/api/v1/rounds/${CUR}/calls`)).json.calls.find(x => x.entrantId === bots[0]);
    assert.equal(c.price.paid, 0.42, "shown with the call on the trading floor");
    assert.equal(c.paperPerContract, undefined, "no result yet");
  });

  test("if Kalshi can't be reached, the last price read for that round (up to a minute old) is used", async () => {
    k.failOpen = true;
    await call(1, CUR, "up");
    const l = await until(() => priceLines().find(x => x.entrantId === bots[1] && x.round === CUR));
    assert.deepEqual([l.source, l.paid], ["snapshot", 0.62]);
    arena().prices.snapshot.at -= 2 * MIN; // too old to trust
    await call(2, CUR, "up");
    await new Promise(r => setTimeout(r, 200));
    assert.equal(priceLines().find(x => x.entrantId === bots[2] && x.round === CUR), undefined, "left for the candles");
    assert.match(arena().prices.status().lastError, /503/);
    k.failOpen = false;
    arena().prices.live = false;
  });

  test("a caller's sealed call never shows its price before the close (it would give the direction away)", async () => {
    const a = (await odin.post(`/api/v1/battles/${battle.id}/applications`, { kind: "caller", name: "Freya", creatorName: "Odin" })).json.application;
    const freya = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    arena().prices.live = true;
    const r = await odin.post(`/api/v1/entrants/${freya}/call`, { direction: "up" });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.ok(await until(() => priceLines().find(x => x.entrantId === freya)), "priced on the server");
    const seen = (await guest.get(`/api/v1/rounds/${CUR}/calls`)).json.calls.find(x => x.entrantId === freya);
    assert.equal(seen.sealed, true);
    assert.equal(seen.price, undefined);
    const own = (await odin.get(`/api/v1/rounds/${CUR}/calls`)).json.calls.find(x => x.entrantId === freya);
    assert.equal(own.price.paid, 0.62, "its owner sees it");
    arena().prices.live = false;
  });
});

describe("npm run kalshi:check shows the call prices", () => {
  let k;
  before(async () => { k = await fakeKalshi(); });
  after(() => k.server.close());
  test("the open round's prices and a settled round's candles, with the raw fields", async () => {
    const { spawn } = await import("node:child_process");
    const { ROOT } = await import("../server/config.js");
    const R = Math.floor(Date.now() / Q) * Q;
    k.settled = [{ ticker: "KXBTC15M-S-00", status: "finalized", result: "no", open_time: iso(R - Q), close_time: iso(R), strike_type: "greater_or_equal", floor_strike: 1, expiration_value: "0.5" }];
    k.open = [{ ticker: "KXBTC15M-O-00", status: "open", open_time: iso(R), close_time: iso(R + Q), yes_bid_dollars: "0.4800", yes_ask_dollars: "0.5100" }];
    k.candles["KXBTC15M-S-00"] = [{ end_period_ts: R / 1000 - 840, yes_bid: { close_dollars: "0.3000" }, yes_ask: { close_dollars: "0.3300" } }];
    const out = await new Promise(resolve => {
      const child = spawn(process.execPath, ["server/kalshi-check.js"], { cwd: ROOT, env: { ...process.env, D3MON_DOTENV: "off", D3MON_KALSHI_URL: k.base }, stdio: ["ignore", "pipe", "pipe"] });
      let s = ""; child.stdout.on("data", d => (s += d)); child.stderr.on("data", d => (s += d)); child.on("exit", () => resolve(s));
    });
    assert.match(out, /raw {3}KXBTC15M-O-00 \{"yes_bid_dollars":"0.4800","yes_ask_dollars":"0.5100"\}/);
    assert.match(out, /OK {4}Up costs 0.51, Down costs 0.52/);
    assert.match(out, /OK {4}1 of 1 minutes read; the last: Up 0.33, Down 0.7/);
    assert.match(out, /Call prices will work/);
  });
});

describe("Kalshi's placeholder asks in the candles", () => {
  test("an ask far from the traded price (nobody offering) gives way to the traded price", async () => {
    const { paidForCandle } = await import("../server/arena/prices.js");
    // The real first minute seen on the server: YES ask opened at 99.9¢ while trades opened at 55¢.
    const first = parseCandle({ end_period_ts: 1792363560, price: { open_dollars: "0.5500", close_dollars: "0.4700" }, yes_ask: { open_dollars: "0.9990", close_dollars: "0.4800" }, yes_bid: { open_dollars: "0.0000", close_dollars: "0.4700" } });
    assert.deepEqual(paidForCandle("up", first.open), { paid: 0.55, from: "trade" });
    assert.deepEqual(paidForCandle("down", first.open), { paid: 0.45, from: "trade" }, "no YES bid, so NO's ask falls back too");
    assert.deepEqual(paidForCandle("up", first.close), { paid: 0.48, from: "ask" }, "a real ask is kept");
    assert.deepEqual(paidForCandle("down", first.close), { paid: 0.53, from: "ask" });
    assert.equal(paidForCandle("up", { yesAsk: null, noAsk: null, last: null }), null);
  });
});

describe("correcting a candle price written before the placeholder rule", () => {
  let k, srv, hs, odin, bot, token;
  const R = Math.floor(Date.now() / Q) * Q - 2 * Q, ticker = "KXBTC15M-FIX-00";
  before(async () => {
    k = await fakeKalshi();
    srv = await startServer({ kalshiUrl: k.base });
    [hs, odin] = [new Client(srv.base), new Client(srv.base)];
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    const b = (await hs.post("/api/v1/battles", { title: "Fix", startsAt: R, rounds: 8, status: "open" })).json.battle;
    const a = (await odin.post(`/api/v1/battles/${b.id}/applications`, { kind: "bot", name: "Early", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
  });
  after(async () => { await srv.stop(); k.server.close(); });

  test("the old 99.9¢ price gets a correcting line at the traded price, once; the old line stays", async () => {
    const A = srv.app.arena;
    A.calls.now = () => R + 20000; // in the first minute
    const r = await fetch(`${srv.base}/api/v1/bot/calls`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction: "up", round: new Date(R).toISOString() }) });
    assert.equal(r.status, 201);
    A.calls.now = () => Date.now();
    const call = A.ledger.lines.find(l => l.t === "call" && l.entrantId === bot);
    // What the first version wrote: the placeholder ask.
    const [old] = A.ledger.append([{ t: "call_price", callId: call.id, entrantId: bot, round: R, side: "yes", paid: 0.999, quotedAt: R, source: "candle", ticker }], null);
    k.settled = [{ ticker, status: "finalized", result: "yes", open_time: iso(R), close_time: iso(R + Q), strike_type: "greater_or_equal", floor_strike: 1, expiration_value: "2" }];
    k.candles[ticker] = [{ end_period_ts: (R + MIN) / 1000, price: { open_dollars: "0.5500", close_dollars: "0.4700" }, yes_ask: { open_dollars: "0.9990", close_dollars: "0.4800" }, yes_bid: { open_dollars: "0.0000", close_dollars: "0.4700" } }];
    await A.kalshi.poll();
    assert.equal(await A.prices.backfill(), 1);
    const p = A.prices.forCall(call.id);
    assert.deepEqual([p.paid, p.from, p.corrects], [0.55, "trade", old.id]);
    assert.ok(A.ledger.lines.some(l => l.id === old.id), "the old line is still in the history");
    assert.equal(await A.prices.backfill(), 0, "checked once");
  });
});
