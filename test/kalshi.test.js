// Step 5: Kalshi results for the BTC 15-minute rounds, read from Kalshi's public market data and used to
// score calls automatically. A stand-in Kalshi server answers in the format Kalshi returned to the
// Lightsail server on 2026-10-15.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { startServer, Client } from "./helpers.js";
import { ROOT } from "../server/config.js";
import { parseMarket, nextDelay } from "../server/arena/kalshi.js";

const Q = 15 * 60000;
const iso = ms => new Date(ms).toISOString().replace(".000Z", "Z");

// Two markets exactly as Kalshi returned them (the fields the scorer reads), and a round still closing.
const REAL = [
  { ticker: "KXBTC15M-26OCT150245-45", event_ticker: "KXBTC15M-26OCT150245", status: "finalized", result: "yes", open_time: "2026-10-15T06:30:00Z", close_time: "2026-10-15T06:45:00Z", expiration_time: "2026-10-22T06:45:00Z", settlement_ts: "2026-10-15T06:45:04.126246Z", floor_strike: 80847.53, cap_strike: null, strike_type: "greater_or_equal", expiration_value: "80849.65", yes_sub_title: "Target Price: $80,847.53" },
  { ticker: "KXBTC15M-26OCT150230-30", event_ticker: "KXBTC15M-26OCT150230", status: "finalized", result: "yes", open_time: "2026-10-15T06:15:00Z", close_time: "2026-10-15T06:30:00Z", expiration_time: "2026-10-22T06:30:00Z", settlement_ts: "2026-10-15T06:30:04.123711Z", floor_strike: 80638.42, cap_strike: null, strike_type: "greater_or_equal", expiration_value: "80847.53", yes_sub_title: "Target Price: $80,638.42" },
];
const CLOSING = { ticker: "KXBTC15M-26OCT150300-00", status: "closed", open_time: "2026-10-15T06:45:00Z", close_time: "2026-10-15T07:00:00Z", floor_strike: 80849.65, yes_sub_title: "Target Price: $80,849.65", yes_bid_dollars: "0.0000", yes_ask_dollars: "0.0010", last_price_dollars: "0.0010" };

// A settled market for the round starting at r, in Kalshi's format.
const market = (r, result, extra = {}) => {
  const strike = 80000 + (r / Q) % 1000, final = result === "yes" ? strike + 12.5 : strike - 12.5;
  return { ticker: `KXBTC15M-T${r / 1000}-00`, status: "finalized", result, open_time: iso(r), close_time: iso(r + Q), settlement_ts: new Date(r + Q + 4126).toISOString(), floor_strike: strike, cap_strike: null, strike_type: "greater_or_equal", expiration_value: final.toFixed(2), ...extra };
};

// Stand-in for Kalshi's GET /markets: newest first, with limit and an opaque cursor.
function fakeKalshi() {
  const k = { markets: [], requests: [], fail: null };
  k.server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    k.requests.push(Object.fromEntries(u.searchParams));
    if (k.fail) { res.writeHead(k.fail.status, { "content-type": "application/json" }); return res.end(k.fail.body); }
    const start = u.searchParams.get("cursor") ? Number(Buffer.from(u.searchParams.get("cursor"), "base64url").toString()) : 0;
    const limit = Number(u.searchParams.get("limit")) || 100;
    const markets = k.markets.slice(start, start + limit);
    const cursor = start + limit < k.markets.length ? Buffer.from(String(start + limit)).toString("base64url") : "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ cursor, markets }));
  });
  return new Promise(r => k.server.listen(0, "127.0.0.1", () => { k.base = `http://127.0.0.1:${k.server.address().port}`; r(k); }));
}

describe("reading Kalshi's markets", () => {
  test("the real settled markets are read as up, with the round named by its start", () => {
    const p = parseMarket(REAL[0]);
    assert.deepEqual(p, { market: "KXBTC15M", round: Date.parse("2026-10-15T06:30:00Z"), result: "up", ticker: "KXBTC15M-26OCT150245-45", strike: 80847.53, final: 80849.65, settledAt: Date.parse("2026-10-15T06:45:04.126Z") });
    assert.equal(parseMarket(REAL[1]).round, Date.parse("2026-10-15T06:15:00Z"));
    assert.equal(parseMarket({ ...REAL[0], result: "no", expiration_value: "80800.00" }).result, "down");
  });

  test("anything not a settled KXBTC15M round is skipped, and says why", () => {
    for (const [m, why] of [
      [CLOSING, "not_settled"], [{ ...REAL[0], result: "" }, "no_result"], [{ ...REAL[0], result: "void" }, "no_result"],
      [{ ...REAL[0], status: "determined" }, "not_settled"], [{ ...REAL[0], strike_type: "less" }, "strike_type"],
      [{ ...REAL[0], ticker: "KXETH15M-26OCT150245-45" }, "other_ticker"], [{ ...REAL[0], ticker: 5 }, "other_ticker"],
      [{ ...REAL[0], open_time: "2026-10-15T06:31:00Z" }, "not_a_15_minute_round"], [{ ...REAL[0], close_time: "2026-10-15T07:30:00Z" }, "not_a_15_minute_round"],
      [{ ...REAL[0], open_time: "soon" }, "not_a_15_minute_round"], [null, "not_an_object"], ["x", "not_an_object"],
    ]) assert.equal(parseMarket(m).skip, why, JSON.stringify(m)?.slice(0, 60));
  });

  test("odd prices never block the result; a disagreement is flagged", () => {
    const p = parseMarket({ ...REAL[0], floor_strike: "n/a", expiration_value: { v: 1 }, settlement_ts: 7 });
    assert.equal(p.result, "up");
    assert.deepEqual([p.strike, p.final, p.settledAt], [undefined, undefined, undefined]);
    assert.equal(parseMarket({ ...REAL[0], expiration_value: "80000.00" }).priceCheck, "disagrees");
    assert.equal(parseMarket(REAL[0]).priceCheck, undefined);
  });

  test("polls soon after each round closes, every 20 s early in a round, then every 60 s, and backs off on errors", () => {
    const r = Date.parse("2026-10-15T06:30:00Z");
    assert.equal(nextDelay(r + 10000), 20000);
    assert.equal(nextDelay(r + 5 * 60000), 60000);
    assert.equal(nextDelay(r + Q - 30000), 38000, "8 s after the close, not 60 s later");
    assert.deepEqual([1, 2, 3, 6, 9].map(n => nextDelay(r, n)), [30000, 60000, 120000, 600000, 600000]);
  });
});

describe("Kalshi scoring", () => {
  let k, srv, hs, odin, guest, battle, bot, token;
  const P = Math.floor(Date.now() / Q) * Q - 4 * Q; // the battle started 4 rounds ago; it runs 8
  const R = n => P + n * Q;
  const OLD = R(-200); // a call about two days ago, beyond the first page
  const kalshi = () => srv.app.arena.kalshi;
  const scoreLines = () => srv.app.arena.ledger.lines.filter(l => l.t === "score");
  const call = async (round, direction) => {
    srv.app.arena.calls.now = () => round - 60000;
    const r = await fetch(`${srv.base}/api/v1/bot/calls`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction, round: new Date(round).toISOString() }) });
    assert.equal(r.status, 201, await r.text());
    srv.app.arena.calls.now = () => Date.now();
  };

  before(async () => {
    k = await fakeKalshi();
    srv = await startServer({ kalshiUrl: k.base });
    [hs, odin, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    battle = (await hs.post("/api/v1/battles", { title: "Kalshi night", startsAt: P, rounds: 8, status: "open" })).json.battle;
    const a = (await odin.post(`/api/v1/battles/${battle.id}/applications`, { kind: "bot", name: "Valhalla", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
    await call(R(0), "up");
    await call(R(1), "down");
    await call(R(2), "up");
    await call(OLD, "down");
    // Kalshi: everything from the round before last back to well past OLD, newest first. R(3) is still closing.
    k.markets = [{ ...CLOSING, ticker: "KXBTC15M-T3-00", open_time: iso(R(3)), close_time: iso(R(4)) }];
    for (let r = R(2); r >= R(-260); r -= Q) k.markets.push(market(r, r === R(1) ? "no" : "yes"));
  });
  after(async () => { await srv.stop(); k.server.close(); });

  test("the poller is off in tests and on by default", () => {
    assert.equal(kalshi().timer, null);
  });

  test("a round still waiting for Kalshi 30 minutes after it ends is flagged for HardSmoke", async () => {
    const r = await guest.get(`/api/v1/rounds?from=${OLD - Q}&to=${OLD + Q}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.rounds, [{ round: OLD, endsAt: OLD + Q, result: null, missingKalshi: true }]);
    assert.ok(kalshi().missing().includes(OLD));
    assert.ok(!kalshi().missing().includes(R(3)), "R(3) ended less than 30 minutes ago");
  });

  test("HardSmoke enters a result by hand before Kalshi has one", async () => {
    // R(1) by hand disagrees with what Kalshi will say; R(0) agrees, and still needs Kalshi's own line.
    for (const [n, result] of [[1, "up"], [0, "up"]]) {
      const r = await hs.req("PUT", `/api/v1/battles/${battle.id}/rounds/${R(n)}/metrics`, { result });
      assert.equal(r.status, 200, JSON.stringify(r.json));
    }
    const c = (await odin.get(`/api/v1/entrants/${bot}/calls`)).json.calls.find(x => x.round === R(1) || x.round === iso(R(1)) || x.round === new Date(R(1)).toISOString());
    assert.equal(c.verification, "recorded by host");
  });

  test("a poll records each settled round once, going back pages only as far as a needed round", async () => {
    const lines = await kalshi().poll();
    assert.deepEqual(k.requests.map(q => [q.series_ticker, q.status, q.limit, !!q.cursor]), [["KXBTC15M", "settled", "20", false], ["KXBTC15M", "settled", "200", true]]);
    assert.ok(lines.length >= 203, `${lines.length} rounds`);
    const rounds = lines.map(l => l.round);
    assert.ok(rounds.includes(OLD) && rounds.includes(R(0)) && rounds.includes(R(2)));
    assert.ok(!rounds.includes(R(3)), "R(3) isn't settled yet");
    assert.deepEqual(rounds, [...rounds].sort((a, b) => a - b), "written oldest first");
    assert.equal(new Set(rounds).size, rounds.length);
    const l = scoreLines().find(x => x.round === R(1) && x.source === "kalshi");
    assert.deepEqual(Object.keys(l).sort(), ["at", "by", "final", "id", "market", "result", "round", "seq", "settledAt", "source", "strike", "t", "ticker"].sort());
    assert.deepEqual([l.t, l.source, l.result, l.market], ["score", "kalshi", "down", "KXBTC15M"]);
    assert.equal(kalshi().missing().length, 0);
    assert.ok(scoreLines().some(x => x.round === R(0) && x.source === "kalshi"), "a matching hand result doesn't stop Kalshi's");

    k.requests.length = 0;
    const before = scoreLines().length;
    assert.deepEqual(await kalshi().poll(), [], "nothing new");
    assert.equal(scoreLines().length, before);
    assert.equal(k.requests.length, 1, "one page is enough once nothing old is needed");
  });

  test("calls are scored from Kalshi's result and read verified; Kalshi beats the hand-entered result", async () => {
    const calls = (await guest.get(`/api/v1/entrants/${bot}/calls`)).json.calls;
    const byRound = new Map(calls.map(c => [typeof c.round === "number" ? c.round : Date.parse(c.round), c]));
    assert.deepEqual([R(0), R(1), R(2), OLD].map(r => [byRound.get(r).result, byRound.get(r).correct, byRound.get(r).verification]), [
      ["up", true, "verified"], ["down", true, "verified"], ["up", true, "verified"], ["up", false, "verified"],
    ]);
    const m = (await guest.get(`/api/v1/battles/${battle.id}/metrics`)).json;
    assert.equal(m.rounds[1].result, "down");
    assert.equal(m.rounds[1].resultSource, "kalshi");
    const r = await hs.req("PUT", `/api/v1/battles/${battle.id}/rounds/${R(0)}/metrics`, { result: "down" });
    assert.deepEqual([r.status, r.json.error.code], [409, "kalshi_result"]);
  });

  test("GET /rounds lists the results, with Kalshi's target and final prices", async () => {
    const r = (await guest.get(`/api/v1/rounds?from=${new Date(R(0)).toISOString()}&to=${R(3)}`)).json;
    assert.deepEqual(r.rounds.map(x => [x.round, x.result, x.source, x.verification]), [[R(0), "up", "kalshi", "verified"], [R(1), "down", "kalshi", "verified"], [R(2), "up", "kalshi", "verified"]]);
    const m = market(R(1), "no");
    assert.deepEqual([r.rounds[1].ticker, r.rounds[1].strike, r.rounds[1].final], [m.ticker, m.floor_strike, Number(m.expiration_value)]);
    assert.equal(r.rounds[1].by, undefined, "who wrote it isn't public");
    for (const q of ["from=yesterday", `from=${R(0)}&to=${R(0) - 1}`, `from=${R(0) - 8 * 24 * 3600000}&to=${R(0)}`, "market=KXETH15M"])
      assert.equal((await guest.get(`/api/v1/rounds?${q}`)).status, 400, q);
    assert.equal((await guest.get("/api/v1/rounds")).status, 200, "the last 24 hours by default");
  });

  test("the scored event reaches the live feed", async () => {
    // A round settled while someone watches: Kalshi reports R(3) once it settles.
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=battle:${battle.id}`, { signal: ac.signal });
    const reader = res.body.getReader();
    let text = "";
    await call(R(3), "up");
    k.markets[0] = market(R(3), "no");
    const lines = await kalshi().poll();
    assert.deepEqual(lines.map(l => l.round), [R(3)]);
    const end = Date.now() + 2000;
    while (!text.includes("round.scored") && Date.now() < end) text += new TextDecoder().decode((await reader.read()).value);
    ac.abort();
    assert.match(text, /event: round\.scored/);
    const { data } = JSON.parse(text.split("event: round.scored\ndata: ")[1].split("\n")[0]);
    assert.deepEqual([data.round, data.result, data.calls.length], [R(3), "down", 1]);
    assert.deepEqual([data.calls[0].direction, data.calls[0].correct, data.calls[0].verification], ["up", false, "verified"]);
  });

  test("Kalshi being down writes nothing; the poller backs off and HardSmoke can see why", async () => {
    const before = scoreLines().length;
    k.fail = { status: 503, body: "{}" };
    await assert.rejects(kalshi().poll(), /503/);
    k.fail = { status: 200, body: "<html>" };
    await assert.rejects(kalshi().poll());
    k.fail = { status: 200, body: '{"markets":"nope"}' };
    await assert.rejects(kalshi().poll(), /no markets list/);
    assert.equal(scoreLines().length, before);

    k.fail = { status: 503, body: "{}" };
    kalshi().start();
    await new Promise(r => setTimeout(r, 2400));
    const st = (await hs.get("/api/v1/kalshi")).json.kalshi;
    kalshi().stop();
    assert.equal(st.polling, true);
    assert.equal(st.consecutiveErrors, 1);
    assert.match(st.lastError, /503/);
    assert.equal((await odin.get("/api/v1/kalshi")).status, 403);
    assert.equal((await guest.get("/api/v1/kalshi")).status, 401);
    k.fail = null;
  });

  test("odd entries in Kalshi's answer are skipped without stopping the rest", async () => {
    srv.app.arena.calls.now = () => R(5) - 60000;
    await call(R(5), "up");
    k.markets.unshift(market(R(5), "yes"), null, { ticker: "KXBTC15M-BAD", status: "finalized", result: "yes" }, market(R(4), "no", { strike_type: "between" }));
    const lines = await kalshi().poll();
    assert.deepEqual(lines.map(l => l.round), [R(5)]);
  });
});

describe("npm run kalshi:check", () => {
  let k;
  before(async () => { k = await fakeKalshi(); });
  after(() => k.server.close());
  const run = () => new Promise(resolve => {
    const child = spawn(process.execPath, ["server/kalshi-check.js"], { cwd: ROOT, env: { ...process.env, D3MON_DOTENV: "off", D3MON_KALSHI_URL: k.base }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (out += d));
    child.on("exit", code => resolve({ code, out }));
  });

  test("shows how each round reads", async () => {
    k.markets = [CLOSING, ...REAL];
    const { code, out } = await run();
    assert.equal(code, 0, out);
    assert.match(out, /SKIP {2}KXBTC15M-26OCT150300-00 +not_settled/);
    assert.match(out, /OK {4}KXBTC15M-26OCT150245-45 +round 2026-10-15T06:30:00.000Z {2}up +target 80847.53, final 80849.65/);
    assert.match(out, /2 of 3 rounds read correctly/);
  });

  test("fails clearly when Kalshi can't be read", async () => {
    k.fail = { status: 403, body: "{}" };
    const { code, out } = await run();
    assert.equal(code, 1);
    assert.match(out, /Couldn't read Kalshi: Kalshi answered 403/);
    k.fail = null;
  });
});
