// Stats Hub phase 1: the stat list (catalog). Seeded with 30 standard stats, edited by HardSmoke on
// /catalog without a code change, read by anyone through /api/v1/stat-catalog. Bots send values for
// list stats; retiring one keeps its history; a stat's type is locked once values exist.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { startServer, Client, readEvents } from "./helpers.js";
import { ROOT } from "../server/config.js";
import { SEED } from "../server/arena/catalog.js";

const Q = 15 * 60000;
const nextQuarter = (k = 1) => Math.floor(Date.now() / Q) * Q + k * Q;

describe("the stat list", () => {
  let srv, hs, odin, guest, bot, token;
  const list = (c = guest) => c.get("/api/v1/stat-catalog");
  const edit = (stats, c = hs) => c.req("PUT", "/api/v1/stat-catalog", { stats });
  const push = values => fetch(`${srv.base}/api/v1/bot/stats`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.stats/v1", values }),
  }).then(async r => ({ status: r.status, json: await r.json() }));
  const settings = () => odin.get(`/api/v1/entrants/${bot}/stat-settings`).then(r => r.json);

  before(async () => {
    srv = await startServer();
    [hs, odin, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    const b = (await hs.post("/api/v1/battles", { title: "Night one", startsAt: nextQuarter(), status: "open" })).json.battle;
    const a = (await odin.post(`/api/v1/battles/${b.id}/applications`, { kind: "bot", name: "Valhalla", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
  });
  after(() => srv.stop());

  test("it starts with the 30 standard stats in six groups", async () => {
    const r = await list();
    assert.equal(r.status, 200);
    assert.equal(r.json.schema, "d3mon.statcatalog/v1");
    assert.equal(r.json.stats.length, 30);
    assert.deepEqual(r.json.categories, ["Performance", "Profit", "Timing", "Daily & records", "Strategy", "Risk"]);
    const byKey = Object.fromEntries(r.json.stats.map(s => [s.key, s]));
    assert.deepEqual(["label", "type", "unit", "category", "format"].map(k => byKey.win_rate[k]), ["Win rate", "percent", "%", "Performance", "percent"]);
    assert.deepEqual([byKey.equity_curve.type, byKey.equity_curve.format], ["series", "money"]);
    assert.deepEqual([byKey.launch_date.type, byKey.launch_date.format], ["date", "since"]);
    assert.deepEqual([byKey.strategy.type, byKey.strategy.format], ["text", "paragraph"]);
    assert.ok(r.json.stats.every(s => r.json.types[s.type].formats.includes(s.format)), "every format fits its type");
    assert.ok(!("locked" in byKey.win_rate) && !("retired" in byKey.win_rate), "guests see the list, not its admin details");
    assert.equal((await odin.db("get", { path: "arena_statcatalog/win_rate" })).status, 403, "/api/db can't read it");
  });

  test("only HardSmoke changes it", async () => {
    assert.equal((await edit({ win_rate: { label: "Mine" } }, guest)).status, 401);
    assert.equal((await edit({ win_rate: { label: "Mine" } }, odin)).status, 403);
    assert.equal((await list()).json.stats.find(s => s.key === "win_rate").label, "Win rate");
  });

  test("HardSmoke adds stats and edits labels, groups, units and formats", async () => {
    let r = await edit({ kelly_fraction: { label: "Kelly fraction", type: "percent", category: "Risk", unit: "%", description: "Share of the bankroll per trade" } });
    assert.equal(r.status, 200);
    const k = r.json.stats.find(s => s.key === "kelly_fraction");
    assert.deepEqual([k.format, k.locked, k.retired], ["percent", false, false], "the type's default format");
    assert.ok(k.order > 300, "added at the end");
    r = await edit({ trades_per_day: { label: "Trades a day", category: "Activity", format: "signed" }, current_streak: { format: "plain" } });
    const t = r.json.stats.find(s => s.key === "trades_per_day");
    assert.deepEqual([t.label, t.category, t.format, t.type], ["Trades a day", "Activity", "signed", "number"]);
    assert.ok(r.json.categories.includes("Activity"));
    // The owner's settings page and the bot both follow the change straight away.
    const st = (await settings()).stats.find(s => s.key === "trades_per_day");
    assert.deepEqual([st.label, st.category, st.source], ["Trades a day", "Activity", "catalog"]);
    assert.equal((await push([{ key: "kelly_fraction", value: 0.05 }])).status, 201);
  });

  test("bad changes are refused", async () => {
    for (const [stats, field, code = "invalid_argument"] of [
      [{ newstat: { label: "No type", category: "Risk" } }, "stats.newstat.type"],
      [{ newstat: { type: "number", category: "Risk" } }, "stats.newstat.label"],
      [{ newstat: { type: "number", label: "x" } }, "stats.newstat.category"],
      [{ newstat: { type: "colour", label: "x", category: "Risk" } }, "stats.newstat.type"],
      [{ newstat: { type: "number", label: "x", category: "Risk", format: "money" } }, "stats.newstat.format"],
      [{ win_rate: { format: "money" } }, "stats.win_rate.format"],
      [{ win_rate: { colour: "red" } }, "stats.win_rate.colour"],
      [{ win_rate: { label: "" } }, "stats.win_rate.label"],
      [{ "Bad-Key": { type: "number", label: "x", category: "Risk" } }, "stats.Bad-Key"],
      [{ api_key: { type: "number", label: "x", category: "Risk" } }, "stats.api_key", "looks_like_secret"],
    ]) {
      const r = await edit(stats);
      assert.equal(r.status, 400, JSON.stringify(stats));
      assert.deepEqual([r.json.error.code, r.json.error.field], [code, field]);
    }
    assert.equal((await hs.req("PUT", "/api/v1/stat-catalog", {})).json.error.field, "stats");
  });

  test("changing a type resets the format, until bots have sent values: then the type is locked", async () => {
    let r = await edit({ sharpe_ratio: { type: "histogram" } });
    assert.equal(r.json.stats.find(s => s.key === "sharpe_ratio").format, "plain");
    r = await edit({ sharpe_ratio: { type: "number", format: "signed" } });
    assert.equal(r.json.stats.find(s => s.key === "sharpe_ratio").format, "signed");
    assert.equal((await push([{ key: "sharpe_ratio", value: 1.8 }])).status, 201);
    r = await edit({ sharpe_ratio: { type: "integer" } });
    assert.deepEqual([r.status, r.json.error.code], [409, "type_locked"]);
    assert.equal((await list(hs)).json.stats.find(s => s.key === "sharpe_ratio").locked, true);
    assert.equal((await edit({ sharpe_ratio: { label: "Sharpe", format: "plain" } })).status, 200, "relabelling is fine");
  });

  test("retiring a stat takes it off cards and stops bots sending it, but keeps its history", async () => {
    await odin.req("PUT", `/api/v1/entrants/${bot}/stat-settings`, { stats: { sharpe_ratio: { visibility: "public" } } });
    assert.ok((await guest.get("/api/v1/entrants/valhalla/card")).json.stats.some(s => s.key === "sharpe_ratio"));
    const lines = srv.app.arena.ledger.lines.length;
    await edit({ sharpe_ratio: { retired: true } });
    assert.ok(!(await list()).json.stats.some(s => s.key === "sharpe_ratio"), "gone from the public list");
    assert.equal((await list(hs)).json.stats.find(s => s.key === "sharpe_ratio").retired, true, "HardSmoke still sees it");
    assert.ok(!(await guest.get("/api/v1/entrants/valhalla/card")).json.stats.some(s => s.key === "sharpe_ratio"));
    assert.ok(!(await settings()).stats.some(s => s.key === "sharpe_ratio"));
    assert.equal((await push([{ key: "sharpe_ratio", value: 2 }])).json.error.code, "not_defined");
    assert.equal(srv.app.arena.ledger.lines.length, lines, "nothing deleted, nothing written");
    await edit({ sharpe_ratio: { retired: false } });
    const back = (await guest.get("/api/v1/entrants/valhalla/card")).json.stats.find(s => s.key === "sharpe_ratio");
    assert.deepEqual([back.value, back.verification], [1.8, "self-reported"], "back with its last value and the owner's choice");
  });

  test("an owner's own custom stat keeps its key when the list gains the same one", async () => {
    await odin.req("PUT", `/api/v1/entrants/${bot}/stat-settings`, { custom: { avg_edge: { type: "number", label: "My edge" } } });
    assert.equal((await odin.req("PUT", `/api/v1/entrants/${bot}/stat-settings`, { custom: { win_rate: { type: "number", label: "Mine" } } })).json.error.field, "custom.win_rate", "list keys are taken");
    await edit({ avg_edge: { type: "percent", label: "Average edge", category: "Strategy" } });
    const mine = (await settings()).stats.filter(s => s.key === "avg_edge");
    assert.deepEqual(mine.map(s => [s.source, s.label, s.type]), [["custom", "My edge", "number"]]);
    assert.equal((await push([{ key: "avg_edge", value: 3.5 }])).status, 201, "checked against the owner's type, not the list's");
  });

  test("list changes go out live", async () => {
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=catalog`, { signal: ac.signal });
    const it = readEvents(res.body)[Symbol.asyncIterator]();
    const next = async () => { for (;;) { const { value } = await it.next(); if (value.event !== "hello") return value; } };
    await edit({ roi: { label: "Return on investment" } });
    const e = await next();
    assert.equal(e.event, "catalog.updated");
    assert.deepEqual(JSON.parse(e.data).data.keys, ["roi"]);
    ac.abort();
  });

  test("the catalog page is served", async () => {
    for (const p of ["/catalog", "/js/arena-catalog.js"]) assert.equal((await guest.get(p)).status, 200, p);
  });
});

// The seed only adds missing stats: a stat HardSmoke retired or relabelled stays that way after a restart. Restarts the real process, as the testing notes ask.
test("the seed never undoes HardSmoke's changes: they survive a restart", async () => {
  const dataDir = path.join(ROOT, ".test-data", `catalog-${crypto.randomBytes(4).toString("hex")}`);
  const env = { ...process.env, D3MON_DOTENV: "off", D3MON_DATA_DIR: dataDir, PORT: "0", HOST: "127.0.0.1", D3MON_OWNER: "", D3MON_KALSHI: "off" };
  const children = new Set();
  const boot = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server/start.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    child.on("exit", () => children.delete(child));
    let out = "";
    const fail = setTimeout(() => reject(new Error(`didn't start: ${out}`)), 10000);
    child.stdout.on("data", c => {
      out += c;
      const m = out.match(/running at (http:\/\/127\.0\.0\.1:\d+)\//);
      if (m) { clearTimeout(fail); resolve({ child, base: m[1] }); }
    });
    child.stderr.on("data", c => (out += c));
  });
  const stop = child => new Promise(resolve => { child.on("exit", resolve); child.kill("SIGTERM"); });
  try {
    let s = await boot();
    const hs = new Client(s.base);
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    assert.equal((await hs.req("PUT", "/api/v1/stat-catalog", { stats: { sharpe_ratio: { retired: true }, roi: { label: "Return" } } })).status, 200);
    await stop(s.child);
    s = await boot();
    try {
      const stats = (await new Client(s.base).get("/api/v1/stat-catalog")).json.stats;
      assert.equal(stats.length, SEED.length - 1, "the retired stat stays retired");
      assert.equal(stats.find(x => x.key === "roi").label, "Return");
    } finally {
      await stop(s.child);
    }
  } finally {
    for (const c of children) c.kill("SIGKILL");
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
