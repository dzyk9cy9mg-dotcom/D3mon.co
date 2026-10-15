// Battle metrics, the manual fallback (step 3): the ledger, recording a round for the whole lineup,
// corrections, results, privacy, the live feed, and surviving a crash.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { startServer, Client, readEvents } from "./helpers.js";
import { ROOT } from "../server/config.js";
import { Ledger } from "../server/arena/ledger.js";

const Q = 15 * 60000;
const thisRound = () => Math.floor(Date.now() / Q) * Q;

// A battle that started four rounds ago: rounds 0–3 are over, 4 is running, 5 hasn't started.
async function pastBattle(hs, n, prefix) {
  const startsAt = thisRound() - 4 * Q;
  const b = (await hs.post("/api/v1/battles", { title: `${prefix} battle`, startsAt, rounds: 6, status: "open" })).json.battle;
  const ids = [];
  for (let i = 0; i < n; i++) {
    const c = new Client(hs.base);
    await c.register(`${prefix}owner${i}`, "owner-pass-12", `${prefix} owner ${i}`);
    const a = (await c.post(`/api/v1/battles/${b.id}/applications`, { kind: "bot", name: `${prefix} bot ${i}`, creatorName: `Owner ${i}` })).json.application;
    ids.push((await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId);
  }
  await hs.req("PATCH", `/api/v1/battles/${b.id}`, { status: "live" });
  return { b, ids, round: i => startsAt + i * Q };
}

describe("ledger", () => {
  const dir = path.join(ROOT, ".test-data", `ledger-${crypto.randomBytes(4).toString("hex")}`);
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("appends lines, never rewrites them, and reads them back in order", () => {
    const l = new Ledger({ dir });
    l.load();
    const [a, b] = l.append([{ t: "metric", n: 1 }, { t: "metric", n: 2 }], "u1");
    assert.ok(a.id && a.at && a.by === "u1" && b.seq === 1);
    l.append([{ t: "score", n: 3 }], "u2");
    const again = new Ledger({ dir });
    again.load();
    assert.deepEqual(again.lines.map(x => x.n), [1, 2, 3]);
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^\d{4}-\d{2}\.jsonl$/);
  });

  test("a line cut off by a crash is skipped, and the next line still lands on its own", () => {
    const file = path.join(dir, fs.readdirSync(dir)[0]);
    fs.appendFileSync(file, '{"t":"metric","n":4,"at":1');
    const l = new Ledger({ dir });
    l.load();
    assert.deepEqual(l.lines.map(x => x.n), [1, 2, 3]);
    l.append([{ t: "metric", n: 5 }], "u1");
    const again = new Ledger({ dir });
    again.load();
    assert.deepEqual(again.lines.map(x => x.n), [1, 2, 3, 5]);
  });
});

describe("battle metrics", () => {
  let srv, hs, member, guest, B;
  const put = (c, i, body, b = B) => c.req("PUT", `/api/v1/battles/${b.b.id}/rounds/${b.round(i)}/metrics`, body);
  const view = (c, b = B, q = "") => c.get(`/api/v1/battles/${b.b.id}/metrics${q}`);

  before(async () => {
    srv = await startServer();
    hs = new Client(srv.base);
    member = new Client(srv.base);
    guest = new Client(srv.base);
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await member.register("odin", "odin-pass-12", "Odin");
    B = await pastBattle(hs, 12, "m");
  });
  after(() => srv.stop());

  test("HardSmoke records a whole round for 12 bots in one request", async () => {
    const entries = B.ids.map((id, i) => ({ entrantId: id, call: i % 3 ? "up" : "down", speedMs: 1000 * (i + 5), profitUsd: i % 3 ? 0.42 : -0.581 }));
    const r = await put(hs, 0, { result: "up", entries });
    assert.equal(r.status, 200);
    const round = r.json.round;
    assert.equal(round.result, "up");
    assert.equal(round.resultSource, "host");
    assert.equal(round.entries.length, 12);
    assert.deepEqual(round.entries.map(e => e.correct), B.ids.map((_, i) => i % 3 !== 0), "right or wrong follows the call and result");
    assert.equal(round.entries[0].profitUsd, -0.58, "rounded to the cent");
    assert.ok(round.entries.every(e => e.verification === "recorded by host" && e.source === "host"));
  });

  test("only admins record; members and guests can't", async () => {
    const body = { entries: [{ entrantId: B.ids[0], correct: true }] };
    assert.equal((await put(member, 1, body)).status, 403);
    assert.equal((await put(guest, 1, body)).status, 401);
    assert.equal((await member.db("query", { query: { collection: "arena_battles" } })).json.docs.length, 0);
  });

  test("rounds must belong to the battle and be over", async () => {
    assert.equal((await hs.req("PUT", `/api/v1/battles/${B.b.id}/rounds/${B.round(0) + 60000}/metrics`, { result: "up" })).status, 404);
    assert.equal((await put(hs, 6, { result: "up" })).status, 404, "past the last round");
    if (B.round(5) > Date.now()) assert.equal((await put(hs, 4, { result: "up" })).json.error.code, "round_not_over", "the running round");
    assert.equal((await put(hs, 5, { result: "up" })).json.error.code, "round_not_over", "a future round");
    const draft = (await hs.post("/api/v1/battles", { title: "Draft", startsAt: B.round(0), rounds: 2 })).json.battle;
    assert.equal((await hs.req("PUT", `/api/v1/battles/${draft.id}/rounds/${B.round(0)}/metrics`, { result: "up" })).json.error.code, "battle_draft");
    assert.equal((await guest.get(`/api/v1/battles/${draft.id}/metrics`)).status, 404, "drafts stay hidden");
  });

  test("bad entries are refused with the exact row, and nothing is written", async () => {
    const before = (await view(hs, B, "?history=1")).json.history.length;
    const cases = [
      [{ entries: [{ entrantId: B.ids[0], call: "up", correct: true }], result: "down" }, "entries[0].correct", "the call and result say otherwise"],
      [{ entries: [{ entrantId: B.ids[0], call: "up" }] }, "entries[0].correct", "no result to derive it from"],
      [{ entries: [{ entrantId: B.ids[0], correct: true }, { entrantId: B.ids[0], correct: false }] }, "entries[1].entrantId", "the same bot twice"],
      [{ entries: [{ entrantId: B.ids[0], void: true, correct: true }] }, "entries[0]", "clearing and setting at once"],
      [{ entries: [{ entrantId: "notInTheLineup1", correct: true }] }, "entries[0].entrantId", "not in the lineup"],
      [{ entries: [{ entrantId: B.ids[0], correct: true, stake: 5 }] }, "entries[0].stake", "an unknown field"],
      [{ entries: [{ entrantId: B.ids[0], correct: "yes" }] }, "entries[0].correct", "not a boolean"],
      [{ entries: [{ entrantId: B.ids[0], correct: true, speedMs: -1 }] }, "entries[0].speedMs", "negative speed"],
      [{ entries: [{ entrantId: B.ids[0], correct: true, profitUsd: "1.00" }] }, "entries[0].profitUsd", "profit as text"],
      [{ entries: [{ entrantId: B.ids[0], correct: true, profitPerContract: 1.5 }] }, "entries[0].profitPerContract", "more than a $1 contract can pay"],
      [{ entries: [{ entrantId: B.ids[0], correct: true, profitPct: -101 }] }, "entries[0].profitPct", "losing more than everything"],
      [{ entries: [{ entrantId: B.ids[0], correct: true, profit: 1 }] }, "entries[0].profit", "profit without a unit"],
      [{ entries: [{ entrantId: B.ids[0], correct: true, apiKey: "x" }] }, "entries[0].apiKey", "a credential field"],
      [{}, undefined, "nothing to record"],
    ];
    for (const [body, field, why] of cases) {
      const r = await put(hs, 1, body);
      assert.ok(r.status >= 400 && r.status < 500, why);
      if (field) assert.equal(r.json.error.field, field, why);
    }
    assert.equal((await put(hs, 1, { entries: Array.from({ length: 51 }, () => ({ entrantId: B.ids[0], correct: true })) })).status, 400, "at most 50 a round");
    assert.equal((await view(hs, B, "?history=1")).json.history.length, before, "nothing written");
  });

  test("corrections add to the history; the latest entry counts; saving the same thing adds nothing", async () => {
    const h0 = (await view(hs, B, "?history=1")).json.history.length;
    await put(hs, 1, { entries: [{ entrantId: B.ids[1], correct: true, profitUsd: 1 }] });
    await put(hs, 1, { entries: [{ entrantId: B.ids[1], correct: false, profitUsd: -1 }] });
    await put(hs, 1, { entries: [{ entrantId: B.ids[1], correct: false, profitUsd: -1 }] });
    const v = (await view(hs, B, "?history=1")).json;
    assert.equal(v.history.length, h0 + 2);
    const e = v.rounds[1].entries.find(x => x.entrantId === B.ids[1]);
    assert.deepEqual([e.correct, e.profitUsd], [false, -1]);
    assert.deepEqual(v.history.slice(-2).map(l => [l.correct, l.byName]), [[true, "HardSmoke"], [false, "HardSmoke"]]);
  });

  test("clearing an entry removes it from the record but not from the history", async () => {
    await put(hs, 1, { entries: [{ entrantId: B.ids[1], void: true }] });
    const v = (await view(hs, B, "?history=1")).json;
    assert.equal(v.rounds[1].entries.some(x => x.entrantId === B.ids[1]), false);
    assert.equal(v.history.at(-1).void, true);
    assert.deepEqual(v.history.filter(l => l.entrantId === B.ids[1] && l.round === B.round(1)).map(l => l.void ? "cleared" : l.correct), [true, false, "cleared"]);
  });

  test("a corrected result flags entries that no longer match instead of changing them", async () => {
    const r = (await put(hs, 0, { result: "down" })).json.round;
    assert.equal(r.result, "down");
    assert.equal(r.entries[0].correct, false, "kept as recorded");
    assert.equal(r.entries[0].mismatch, true, "down was called and the round went down");
    assert.equal(r.entries[1].mismatch, true);
    await put(hs, 0, { result: "up" });
  });

  test("the battle record adds up each entrant's rounds, in lineup order", async () => {
    await put(hs, 2, { result: "up", entries: [{ entrantId: B.ids[1], call: "up", speedMs: 9000, profitUsd: 0.5 }, { entrantId: B.ids[0], call: "up" }] });
    const t = (await view(guest)).json.totals;
    assert.deepEqual(t.map(x => x.entrantId), B.ids, "lineup order, not ranked");
    assert.deepEqual(t[1], { entrantId: B.ids[1], name: "m bot 1", slug: "m-bot-1", inLineup: true, recorded: 2, right: 2, wrong: 0, avgSpeedMs: 7500, profitUsd: 0.92, profitPerContract: null, avgProfitPct: null, source: "host", verification: "recorded by host" });
    assert.deepEqual([t[0].right, t[0].wrong, t[0].profitUsd], [1, 1, -0.58]);
  });

  test("profit can be recorded in dollars, per $1 contract, as a percent, or all three", async () => {
    // Round 3 for three bots: one unit alone each, and one bot with all three.
    const r = await put(hs, 2, { entries: [
      { entrantId: B.ids[6], call: "up", profitPerContract: 0.42 },
      { entrantId: B.ids[7], call: "down", profitPct: -100 },
      { entrantId: B.ids[8], call: "up", profitUsd: 4.2, profitPerContract: 0.123456, profitPct: 72.4137 },
    ] });
    assert.equal(r.status, 200);
    const all = r.json.round.entries.find(e => e.entrantId === B.ids[8]);
    assert.deepEqual([all.profitUsd, all.profitPerContract, all.profitPct], [4.2, 0.1235, 72.41], "cents, 4 places, 2 places");
    const only = r.json.round.entries.find(e => e.entrantId === B.ids[6]);
    assert.deepEqual([only.profitPerContract, only.profitUsd, only.profitPct], [0.42, undefined, undefined], "units not given stay empty");
    // Round 2 for the all-three bot too, so the totals have two rounds to combine.
    await put(hs, 1, { result: "up", entries: [{ entrantId: B.ids[8], call: "up", profitUsd: -1.2, profitPerContract: -0.0235, profitPct: -27.41 }] });
    const t = (await view(guest)).json.totals.find(x => x.entrantId === B.ids[8]);
    // Dollars include its $0.42 from round 1 (first test): 0.42 + 4.20 - 1.20. Percent averages only the
    // rounds that have one.
    assert.deepEqual([t.profitUsd, t.profitPerContract, t.avgProfitPct], [3.42, 0.1, 22.5], "dollars and per-contract add up; percent is averaged");
    const t7 = (await view(guest)).json.totals.find(x => x.entrantId === B.ids[7]);
    assert.deepEqual([t7.profitUsd, t7.profitPerContract, t7.avgProfitPct], [0.42, null, -100], "its $0.42 is from round 1; no per-contract figures at all");
    // Changing only one unit is a correction; re-saving the same values is not.
    const h = (await view(hs, B, "?history=1")).json.history.length;
    await put(hs, 2, { entries: [{ entrantId: B.ids[8], call: "up", profitUsd: 4.2, profitPerContract: 0.1235, profitPct: 72.41 }] });
    assert.equal((await view(hs, B, "?history=1")).json.history.length, h, "same values: nothing written");
    await put(hs, 2, { entries: [{ entrantId: B.ids[8], call: "up", profitUsd: 4.2, profitPerContract: 0.1235, profitPct: 70 }] });
    assert.equal((await view(hs, B, "?history=1")).json.history.length, h + 1);
  });

  test("anyone can see the battle record; only admins see who entered it and the history", async () => {
    const pub = (await view(guest)).json;
    assert.equal(pub.rounds[0].entries.length, 12);
    assert.equal(pub.rounds[0].entries[0].by, undefined);
    assert.equal(pub.rounds[0].entries[0].byName, undefined);
    assert.equal((await view(member, B, "?history=1")).status, 403);
    assert.equal((await view(hs)).json.rounds[0].entries[0].byName, "HardSmoke");
  });

  test("a Kalshi result takes precedence and can't be overridden by hand", async () => {
    srv.app.arena.ledger.append([{ t: "score", market: "KXBTC15M", round: B.round(3), result: "down", source: "kalshi" }], null);
    const r = await put(hs, 3, { result: "up" });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "kalshi_result");
    const ok = await put(hs, 3, { result: "down", entries: [{ entrantId: B.ids[2], call: "down" }] });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.json.round.result, ok.json.round.resultSource, ok.json.round.entries[0].correct], ["down", "kalshi", true]);
    // Even a hand-entered line written after Kalshi's (from an older server, or a race) doesn't win.
    srv.app.arena.ledger.append([{ t: "score", market: "KXBTC15M", round: B.round(3), result: "up", source: "admin" }], hs.user.id);
    const v = (await view(guest)).json.rounds[3];
    assert.deepEqual([v.result, v.resultSource], ["down", "kalshi"]);
  });

  test("entrants who leave the lineup keep their recorded rounds", async () => {
    const app = (await hs.get(`/api/v1/applications?battleId=${B.b.id}`)).json.applications.find(a => a.entrantId === B.ids[0]);
    await hs.req("PATCH", `/api/v1/battles/${B.b.id}`, { status: "open" });
    await hs.post(`/api/v1/applications/${app.id}/review`, { decision: "reopen" });
    const t = (await view(guest)).json.totals.find(x => x.entrantId === B.ids[0]);
    assert.equal(t.inLineup, false);
    assert.equal(t.recorded, 2);
    assert.equal((await put(hs, 2, { entries: [{ entrantId: B.ids[0], void: true }] })).status, 200, "their entries can still be cleared");
    await hs.post(`/api/v1/applications/${app.id}/review`, { decision: "approve" });
  });

  test("viewers see each saved round live, without the admin-only fields", async () => {
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=battle:${B.b.id},entrant:${B.ids[5]}`, { signal: ac.signal });
    const it = readEvents(res.body)[Symbol.asyncIterator]();
    const nextOf = async type => { for (;;) { const { value } = await it.next(); if (value.event === type) return JSON.parse(value.data); } };
    await nextOf("hello");
    await put(hs, 2, { entries: [{ entrantId: B.ids[5], call: "down" }] });
    const a = await nextOf("round.metrics"), b = await nextOf("round.metrics");
    const [battleEv, entrantEv] = a.topic.startsWith("battle:") ? [a, b] : [b, a];
    assert.equal(battleEv.data.index, 2);
    const e = battleEv.data.entries.find(x => x.entrantId === B.ids[5]);
    assert.deepEqual([e.call, e.correct, e.by], ["down", false, undefined]);
    assert.equal(entrantEv.data.battleId, B.b.id);
    ac.abort();
  });

  test("the metrics page is served", async () => {
    assert.equal((await guest.get("/metrics")).status, 200);
    assert.equal((await guest.get("/js/arena-metrics.js")).status, 200);
  });
});

// Entries are flushed to disk before the request is answered, so they survive a crash: here the server
// is killed with SIGKILL straight after recording, with no chance to save anything on the way out.
test("recorded rounds survive the server being killed", async () => {
  const dataDir = path.join(ROOT, ".test-data", `crash-${crypto.randomBytes(4).toString("hex")}`);
  const env = { ...process.env, D3MON_DOTENV: "off", D3MON_DATA_DIR: dataDir, PORT: "0", HOST: "127.0.0.1", D3MON_OWNER: "" };
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
  const stop = (child, sig) => new Promise(resolve => { child.on("exit", (code, signal) => resolve({ code, signal })); child.kill(sig); });
  try {
    // Set up the battle and lineup, then restart cleanly so they're on disk.
    let s = await boot();
    const hs = new Client(s.base);
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    const B = await pastBattle(hs, 3, "c");
    await stop(s.child, "SIGTERM");

    s = await boot();
    const hs2 = new Client(s.base);
    await hs2.post("/api/auth/login", { username: "hardsmoke", password: "smoke-pass-1" });
    const r = await hs2.req("PUT", `/api/v1/battles/${B.b.id}/rounds/${B.round(0)}/metrics`, { result: "up", entries: B.ids.map(id => ({ entrantId: id, call: "up", speedMs: 4000, profitUsd: 0.3 })) });
    assert.equal(r.status, 200);
    assert.deepEqual(await stop(s.child, "SIGKILL"), { code: null, signal: "SIGKILL" });

    s = await boot();
    try {
      const v = (await new Client(s.base).get(`/api/v1/battles/${B.b.id}/metrics`)).json;
      assert.equal(v.rounds[0].result, "up");
      assert.equal(v.rounds[0].entries.length, 3);
      assert.deepEqual(v.totals.map(t => [t.right, t.profitUsd]), [[1, 0.3], [1, 0.3], [1, 0.3]]);
    } finally {
      await stop(s.child, "SIGTERM");
    }
  } finally {
    for (const c of children) c.kill("SIGKILL"); // never leave a server running if something failed
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
