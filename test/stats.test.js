// Stats cards (Stats Hub phase 1): a card shows only stats the owner's bot sent, every one
// "self-reported". The site no longer works card stats out from calls, while battles keep their
// server scoring. Every stat starts hidden and the owner picks who sees each one.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer, Client, readEvents } from "./helpers.js";
import { ROOT } from "../server/config.js";

const Q = 15 * 60000;

// The "full example" request in BOT-GUIDE.md, so the guide can't drift from what the server accepts.
function guideExample() {
  const md = fs.readFileSync(path.join(ROOT, "BOT-GUIDE.md"), "utf8");
  const m = md.match(/### A full example[\s\S]*?```json\n([\s\S]*?)```/);
  return JSON.parse(m[1]);
}

describe("stats cards", () => {
  let srv, hs, odin, loki, guest, battle, bot, token, P;
  const R = n => P + n * Q;
  const card = c => c.get("/api/v1/entrants/valhalla/card");
  const settings = c => c.get(`/api/v1/entrants/${bot}/stat-settings`);
  const put = (c, stats) => c.req("PUT", `/api/v1/entrants/${bot}/stat-settings`, { stats });
  const push = (body, tok = token) => fetch(`${srv.base}/api/v1/bot/stats`, {
    method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, json: await r.json() }));
  const valueOf = (s, key) => s.stats.find(x => x.key === key);
  async function callRound(n, direction) {
    srv.app.arena.calls.now = () => R(n) - 30000;
    const r = await fetch(`${srv.base}/api/v1/bot/calls`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction, round: new Date(R(n)).toISOString() }) });
    srv.app.arena.calls.now = () => Date.now();
    assert.equal(r.status, 201);
  }

  before(async () => {
    srv = await startServer();
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    P = Math.floor(Date.now() / Q) * Q - 10 * Q;
    battle = (await hs.post("/api/v1/battles", { title: "History night", startsAt: P, rounds: 12, status: "open" })).json.battle;
    const a = (await odin.post(`/api/v1/battles/${battle.id}/applications`, { kind: "bot", name: "Valhalla", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
    // Battle history: rounds 0–3 called and scored (W W L W), by hand and by Kalshi.
    const calls = ["up", "up", "down", "up"], results = ["up", "up", "up", "up"];
    for (let i = 0; i < 4; i++) await callRound(i, calls[i]);
    for (let i = 0; i < 2; i++) await hs.req("PUT", `/api/v1/battles/${battle.id}/rounds/${R(i)}/metrics`, { result: results[i] });
    srv.app.arena.ledger.append([2, 3].map(i => ({ t: "score", market: "KXBTC15M", round: R(i), result: results[i], source: "kalshi" })), null);
  });
  after(() => srv.stop());

  test("self-reported stats: there's nothing until the bot sends some", async () => {
    const s = (await settings(odin)).json, list = s.stats.filter(x => x.source === "catalog");
    assert.equal(list.length, 30, "the 30 list stats");
    assert.ok(list.every(x => x.value === null && x.verification === "self-reported" && x.visibility === "hidden"));
    assert.ok(s.stats.every(x => x.source === "catalog" || x.key.startsWith("v_")), "the rest are the verified ones, kept apart");
    for (const old of ["hit_rate", "calls", "wins", "avg_lead", "daily_record"]) assert.ok(!valueOf(s, old), `${old} is gone`);
    await put(odin, { win_rate: { visibility: "public" } });
    assert.deepEqual((await card(guest)).json.stats, [], "a public stat with no value isn't shown");
  });

  test("the bot sends every standard stat (the guide's full example)", async () => {
    const body = guideExample();
    assert.equal(body.values.length, 30);
    const r = await push(body);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.accepted.length, 30);
    const s = (await settings(odin)).json;
    assert.deepEqual(valueOf(s, "wins_losses").value, { w: 255, l: 157 });
    assert.deepEqual(valueOf(s, "biggest_win_loss").value, { win: 12.4, loss: -8.1 });
    assert.equal(valueOf(s, "launch_date").value, "2026-03-01");
    assert.ok(s.stats.filter(x => x.source === "catalog").every(x => x.value !== null && x.asOf));
  });

  test("each value must match its stat's type", async () => {
    const before = srv.app.arena.ledger.lines.length;
    for (const [key, value] of [
      ["win_rate", 1.2], ["win_rate", "0.5"], ["total_calls", 3.5], ["total_profit", "12"], ["total_profit", Infinity],
      ["roi", -1.5], ["avg_lead_time", -1], ["strategy", ""], ["strategy", "x".repeat(501)],
      ["launch_date", "2026-02-30"], ["launch_date", "2099-01-01"], ["launch_date", "March 1"],
      ["wins_losses", { w: -1, l: 2 }], ["wins_losses", { w: 1 }], ["wins_losses", { w: 1, l: 2, draws: 0 }], ["best_day", { w: 1, l: 2, t: "" }],
      ["equity_curve", [{ t: "a", v: "1" }]], ["best_hours", { "13:00": "high" }], ["up_down_ratio", [1, 2]],
    ]) {
      const r = await push({ schema: "d3mon.stats/v1", values: [{ key, value }] });
      assert.equal(r.status, 400, `${key}=${JSON.stringify(value).slice(0, 40)}`);
      assert.equal(r.json.error.field, "values[0].value");
    }
    assert.equal((await push({ schema: "d3mon.stats/v1", values: [{ key: "strategy", value: "uses sk-ant-api03-abcdefghijklmnopqrstu" }] })).json.error.code, "looks_like_secret");
    assert.equal((await push({ schema: "d3mon.stats/v1", values: [{ key: "hit_rate", value: 0.5 }] })).json.error.code, "not_defined", "the old computed keys aren't stats");
    assert.equal(srv.app.arena.ledger.lines.length, before, "nothing written");
    const money = await push({ schema: "d3mon.stats/v1", values: [{ key: "avg_position_size", value: 25.123456 }] });
    assert.equal(money.status, 201);
    assert.equal(valueOf((await settings(odin)).json, "avg_position_size").value, 25.1235, "dollars are kept to 4 places");
  });

  test("every stat starts hidden, and the owner chooses who sees each one", async () => {
    await put(odin, { win_rate: { visibility: "public", label: "Accuracy" }, total_profit: { visibility: "members" }, max_drawdown: { visibility: "private" }, best_hours: { visibility: "public" } });
    const keys = async c => (await card(c)).json.stats.map(x => x.key).sort();
    assert.deepEqual(await keys(guest), ["best_hours", "win_rate"]);
    assert.deepEqual(await keys(loki), ["best_hours", "total_profit", "win_rate"]);
    assert.deepEqual(await keys(hs), ["best_hours", "total_profit", "win_rate"], "admins read like members: private means private");
    assert.deepEqual(await keys(odin), ["best_hours", "max_drawdown", "total_profit", "win_rate"]);
    const g = (await card(guest)).json;
    assert.deepEqual([g.schema, g.viewer], ["d3mon.statcard/v2", "guest"]);
    const wr = g.stats.find(x => x.key === "win_rate");
    assert.deepEqual([wr.label, wr.value, wr.source, wr.verification, wr.category, wr.format, wr.visibility], ["Accuracy", 0.62, "catalog", "self-reported", "Performance", "percent", undefined]);
    const raw = JSON.stringify(g);
    for (const hidden of ["total_profit", "max_drawdown", "strategy", "Momentum", "Kraken"]) assert.ok(!raw.includes(hidden), `${hidden} never reaches a guest`);
  });

  test("settings left from the old computed stats don't apply to the new ones", async () => {
    const p = `arena_statsettings/${bot}`, saved = srv.app.store.get(p).data;
    const legacy = { best_days: { visibility: "public" }, current_streak: { visibility: "public" }, hit_rate: { visibility: "public" } };
    srv.app.store.set(p, { entrantId: bot, stats: legacy }); // a settings doc from before the stat list
    assert.deepEqual((await card(guest)).json.stats, []);
    assert.ok((await settings(odin)).json.stats.every(x => x.visibility === "hidden"));
    srv.app.store.set(p, { ...saved, stats: legacy });
    await put(odin, { roi: { visibility: "public" } });
    assert.deepEqual(srv.app.store.get(p).data.stats, legacy, "kept, unused");
  });

  test("labels, descriptions and order are the owner's; clearing them restores the list's", async () => {
    await put(odin, { best_hours: { order: 1, description: "UTC, since launch" }, win_rate: { order: 2 } });
    let c = (await card(odin)).json.stats;
    assert.deepEqual(c.slice(0, 2).map(x => x.key), ["best_hours", "win_rate"]);
    assert.equal(c[0].description, "UTC, since launch");
    await put(odin, { win_rate: { label: "" }, best_hours: { description: "" } });
    c = (await card(odin)).json.stats;
    assert.equal(c.find(x => x.key === "win_rate").label, "Win rate");
    assert.equal(c.find(x => x.key === "best_hours").description, "Win rate by hour of the day (UTC)");
  });

  test("only the owner changes settings, and only with valid values", async () => {
    assert.equal((await put(guest, { win_rate: { visibility: "public" } })).status, 401);
    assert.equal((await put(loki, { win_rate: { visibility: "public" } })).status, 404);
    assert.equal((await put(hs, { win_rate: { visibility: "public" } })).status, 404, "not even admins");
    assert.equal((await settings(loki)).status, 404);
    for (const [stats, field] of [
      [{ made_up_stat: { visibility: "public" } }, "stats.made_up_stat"], [{ win_rate: { visibility: "everyone" } }, "stats.win_rate.visibility"],
      [{ win_rate: { label: "x".repeat(41) } }, "stats.win_rate.label"], [{ win_rate: { order: -1 } }, "stats.win_rate.order"],
      [{ win_rate: { colour: "red" } }, "stats.win_rate.colour"], [{ win_rate: { label: "sk-ant-api03-abcdefghijklmnopqrstu" } }, "stats.win_rate.label"],
    ]) {
      const r = await put(odin, stats);
      assert.equal(r.status, 400, field);
      assert.equal(r.json.error.field, field);
    }
    assert.equal((await odin.db("get", { path: `arena_statsettings/${bot}` })).status, 403, "/api/db can't read settings");
  });

  test("hiding a stat never deletes its history", async () => {
    const lines = srv.app.arena.ledger.lines.length;
    await put(odin, { win_rate: { visibility: "hidden" } });
    assert.ok(!(await card(guest)).json.stats.some(x => x.key === "win_rate"));
    assert.equal(srv.app.arena.ledger.lines.length, lines);
    await put(odin, { win_rate: { visibility: "public" } });
    assert.equal((await card(guest)).json.stats.find(x => x.key === "win_rate").value, 0.62, "back, unchanged");
  });

  test("battles keep their server scoring, verified, whatever the card says", async () => {
    await push({ schema: "d3mon.stats/v1", values: [{ key: "wins_losses", value: { w: 999, l: 0 } }] });
    const b = (await guest.get(`/api/v1/battles/${battle.id}/board`)).json;
    assert.deepEqual(b.entrants.map(e => [e.right, e.wrong]), [[3, 1]], "the board counts the real calls, not what the bot says");
    const mine = (await odin.get(`/api/v1/entrants/${bot}/calls`)).json.calls;
    assert.deepEqual(mine.filter(c => c.result).map(c => c.verification).sort(), ["recorded by host", "recorded by host", "verified", "verified"]);
  });

  test("cards refresh live when values or settings change", async () => {
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=entrant:${bot}`, { signal: ac.signal });
    const it = readEvents(res.body)[Symbol.asyncIterator]();
    const next = async () => { for (;;) { const { value } = await it.next(); if (value.event !== "hello") return value; } };
    await put(odin, { total_calls: { visibility: "public" } });
    assert.equal((await next()).event, "stats.updated");
    await push({ schema: "d3mon.stats/v1", values: [{ key: "total_calls", value: 413 }] });
    assert.equal((await next()).event, "stats.updated");
    ac.abort();
  });

  test("a suspended entrant's card is gone for everyone but its owner and admins", async () => {
    const p = `arena_entrants/${bot}`, e = srv.app.store.get(p).data;
    srv.app.store.set(p, { ...e, status: "suspended" });
    assert.equal((await card(guest)).status, 404);
    assert.equal((await card(odin)).status, 200);
    srv.app.store.set(p, e);
  });

  test("the card page is served", async () => {
    for (const p of ["/card", "/js/arena-card.js"]) assert.equal((await guest.get(p)).status, 200, p);
  });
});
