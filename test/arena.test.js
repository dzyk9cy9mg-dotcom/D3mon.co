// The Arena API (step 2): battles, applications and the log, saved entrants, credential refusal,
// server-only storage, and the live feed.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client, readEvents } from "./helpers.js";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "../server/config.js";
import { looksLikeSecret, rejectSecrets } from "../server/arena/validate.js";
import { readRoles, writeRoles } from "../server/accounts.js";

const QUARTER = 15 * 60000;
const nextQuarter = (daysAhead = 1) => Math.ceil(Date.now() / QUARTER) * QUARTER + daysAhead * 86400000;

// Opens /api/v1/feed for a client. next(match) waits for the first matching event not yet taken.
async function feed(client, topics) {
  const ac = new AbortController();
  const res = await fetch(`${client.base}/api/v1/feed?topics=${encodeURIComponent(topics)}`, { headers: client.cookie ? { cookie: client.cookie } : {}, signal: ac.signal });
  if (res.status !== 200) {
    ac.abort();
    return { status: res.status };
  }
  const queue = [];
  let wake = null, ended = false;
  (async () => {
    try {
      for await (const e of readEvents(res.body)) {
        queue.push({ event: e.event, ...JSON.parse(e.data) });
        if (wake) wake();
      }
    } catch {}
    ended = true;
    if (wake) wake();
  })();
  async function next(match, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = queue.findIndex(match);
      if (i >= 0) return queue.splice(i, 1)[0];
      const left = deadline - Date.now();
      if (left <= 0 || ended) return null;
      await new Promise(r => { const t = setTimeout(r, left); wake = () => { clearTimeout(t); wake = null; r(); }; });
    }
  }
  await next(e => e.event === "hello");
  return { status: 200, next, queue, ended: () => ended, close: () => ac.abort() };
}

describe("credential detection", () => {
  test("refuses keys, secrets and seed phrases", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
    for (const s of [
      pem, "my key is sk-ant-api03-abcdefghijklmnopqrstu", "sk_live_51HxYzAbCdEfGhIj", "AKIAIOSFODNN7EXAMPLE",
      "ghp_1234567890abcdefghijklmnopqrstuvwx", "xoxb-1234567890-abcdefghij", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig",
      "a952bc0d-7e5f-4c35-9f1b-1f0d6a9b2c3e", "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
      "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A", "kalshi secret: 9fK2xQ7vB1mN8pL3sD6hJ4tY0wR5zC2a",
      "abandon ability able about above absent absorb abstract absurd abuse access accident",
    ]) assert.ok(looksLikeSecret(s), s);
  });

  test("lets ordinary notes, names and links through", () => {
    for (const s of [
      "Valhalla", "BTC 15m momentum bot v2.3, trades the London and New York opens", "https://discord.gg/asgard",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://twitch.tv/hardsmoke_live", "@odin_alt",
      "It reads funding, open interest and liquidations, then calls up or down before each round locks.",
      "this bot will call every round and track the price action over the whole session with care",
      "Asgard Trading 2025", "Win rate 61% over 1,240 rounds since 2024-03-01",
    ]) assert.ok(!looksLikeSecret(s), s);
  });

  test("refuses secret-sounding field names anywhere in a body", () => {
    for (const body of [{ apiKey: "x" }, { notes: "ok", nested: { private_key: "x" } }, { list: [{ password: "x" }] }, { kalshiSecret: "x" }, { seedPhrase: "x" }]) {
      assert.throws(() => rejectSecrets(body), e => e.code === "looks_like_secret", JSON.stringify(body));
    }
    assert.doesNotThrow(() => rejectSecrets({ name: "Valhalla", creatorName: "Odin", notes: "fine" }));
  });
});

describe("Arena API", () => {
  let srv, hs, odin, freya, guest, battle;
  const apply = (c, body, b = battle) => c.post(`/api/v1/battles/${b.id}/applications`, body);
  const review = (id, decision, note) => hs.post(`/api/v1/applications/${id}/review`, { decision, ...(note ? { note } : {}) });
  const rolesFile = () => path.join(srv.dataDir, "roles.json");
  const VALHALLA = { kind: "bot", name: "Valhalla", creatorName: "Odin", altAccount: "@odin_alt", discordServer: "Asgard", notes: "Momentum bot" };

  before(async () => {
    srv = await startServer();
    hs = new Client(srv.base);
    odin = new Client(srv.base);
    freya = new Client(srv.base);
    guest = new Client(srv.base);
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
  });
  after(() => srv.stop());

  describe("battles", () => {
    test("only admins create them, on a quarter hour, with known fields only", async () => {
      const startsAt = nextQuarter();
      assert.equal((await odin.post("/api/v1/battles", { title: "Mine", startsAt })).status, 403);
      assert.equal((await guest.post("/api/v1/battles", { title: "Mine", startsAt })).status, 401);
      const off = await hs.post("/api/v1/battles", { title: "Off grid", startsAt: startsAt + 60000 });
      assert.equal(off.status, 400);
      assert.equal(off.json.error.field, "startsAt");
      assert.equal((await hs.post("/api/v1/battles", { title: "Extra", startsAt, prize: 100 })).json.error.field, "prize");
      const r = await hs.post("/api/v1/battles", { title: "Battle of the Bots · Week 1", startsAt, status: "open" });
      assert.equal(r.status, 201);
      battle = r.json.battle;
      assert.deepEqual({ market: battle.market, rounds: battle.rounds, roundMs: battle.roundMs, kinds: battle.kinds, entrants: battle.entrants },
        { market: "KXBTC15M", rounds: 8, roundMs: QUARTER, kinds: ["bot", "caller", "script"], entrants: [] });
      assert.equal(battle.endsAt, startsAt + 8 * QUARTER);
    });

    test("drafts are visible to admins only", async () => {
      const d = (await hs.post("/api/v1/battles", { title: "Secret draft", startsAt: nextQuarter(2) })).json.battle;
      assert.equal(d.status, "draft");
      assert.ok((await hs.get("/api/v1/battles")).json.battles.some(b => b.id === d.id));
      assert.ok(!(await guest.get("/api/v1/battles")).json.battles.some(b => b.id === d.id));
      assert.equal((await odin.get(`/api/v1/battles/${d.id}`)).status, 404);
      assert.equal((await apply(odin, VALHALLA, d)).status, 404);
      assert.equal((await odin.req("PATCH", `/api/v1/battles/${d.id}`, { status: "open" })).status, 403);
    });
  });

  describe("applications", () => {
    let app;

    test("guests must sign in; secrets and unknown fields are refused", async () => {
      assert.equal((await apply(guest, VALHALLA)).status, 401);
      const leak = await apply(odin, { ...VALHALLA, notes: "Here's my Kalshi key id a952bc0d-7e5f-4c35-9f1b-1f0d6a9b2c3e" });
      assert.equal(leak.status, 400);
      assert.deepEqual([leak.json.error.code, leak.json.error.field], ["looks_like_secret", "notes"]);
      assert.equal((await apply(odin, { ...VALHALLA, apiSecret: "x" })).json.error.code, "looks_like_secret");
      assert.equal((await apply(odin, { ...VALHALLA, wallet: "x" })).json.error.field, "wallet");
      assert.equal((await apply(odin, { ...VALHALLA, creatorName: "" })).json.error.field, "creatorName");
      assert.equal((await apply(odin, { ...VALHALLA, kind: "robot" })).json.error.field, "kind");
      assert.equal((await odin.get("/api/v1/applications")).json.applications.length, 0, "nothing stored");
    });

    test("a member applies; the application is pending and logged", async () => {
      const r = await apply(odin, { ...VALHALLA, name: "  Valhalla​  " });
      assert.equal(r.status, 201);
      app = r.json.application;
      assert.equal(app.name, "Valhalla", "cleaned");
      assert.equal(app.slug, "valhalla");
      assert.equal(app.status, "pending");
      assert.equal(app.history[0].action, "submitted");
      const again = await apply(odin, VALHALLA);
      assert.equal(again.status, 409);
      assert.equal(again.json.error.code, "already_applied");
    });

    test("members see only their own applications; admins see the whole log with names", async () => {
      await apply(freya, { kind: "caller", name: "Freya Calls", creatorName: "Freya" });
      const mine = (await odin.get("/api/v1/applications")).json.applications;
      assert.deepEqual(mine.map(a => a.name), ["Valhalla"]);
      assert.equal(mine[0].applicantName, undefined);
      const all = (await hs.get("/api/v1/applications")).json.applications;
      assert.equal(all.length, 2);
      assert.equal(all.find(a => a.name === "Valhalla").applicantName, "Odin");
      assert.equal((await freya.get(`/api/v1/applications/${app.id}`)).status, 404);
      assert.equal((await hs.get(`/api/v1/applications?status=pending&battleId=${battle.id}`)).json.applications.length, 2);
    });

    test("only admins review; approving saves the entrant and adds it to the lineup", async () => {
      assert.equal((await odin.post(`/api/v1/applications/${app.id}/review`, { decision: "approve" })).status, 403);
      const r = await review(app.id, "approve", "Welcome to the arena");
      assert.equal(r.status, 200);
      assert.equal(r.json.application.status, "approved");
      assert.equal(r.json.application.reviewNote, "Welcome to the arena");
      assert.deepEqual(r.json.application.history.map(h => h.action), ["submitted", "approved"]);
      const b = (await guest.get(`/api/v1/battles/${battle.id}`)).json.battle;
      assert.deepEqual(b.entrants.map(e => e.name), ["Valhalla"]);
      assert.equal((await review(app.id, "approve")).status, 409, "only pending can be approved");
    });

    test("the public sees an entrant's profile; the owner and admins also see the private details", async () => {
      const pub = (await guest.get("/api/v1/entrants/valhalla")).json.entrant;
      assert.deepEqual(Object.keys(pub).sort(), ["approvedAt", "badges", "battles", "creatorName", "discordServer", "id", "kind", "name", "shopUrl", "slug", "status", "streamUrl", "tagline"]);
      const own = (await odin.get(`/api/v1/entrants/${pub.id}`)).json.entrant;
      assert.equal(own.altAccount, "@odin_alt");
      assert.equal(own.mine, true);
      assert.equal((await hs.get(`/api/v1/entrants/${pub.id}`)).json.entrant.notes, "Momentum bot");
      assert.equal((await freya.get(`/api/v1/entrants/${pub.id}`)).json.entrant.altAccount, undefined);
    });

    test("another member can't take a saved entrant's name", async () => {
      const r = await apply(freya, { kind: "bot", name: "VALHALLA!", creatorName: "Freya" });
      assert.equal(r.status, 409);
      assert.equal(r.json.error.code, "name_taken");
    });

    test("reject, reopen and withdraw are all kept in the log", async () => {
      const f = (await hs.get("/api/v1/applications?status=pending")).json.applications.find(a => a.name === "Freya Calls");
      assert.equal((await review(f.id, "reject", "Not verified yet")).json.application.status, "rejected");
      assert.equal((await review(f.id, "reopen")).json.application.status, "pending");
      const w = await freya.post(`/api/v1/applications/${f.id}/withdraw`, {});
      assert.equal(w.json.application.status, "withdrawn");
      assert.deepEqual(w.json.application.history.map(h => h.action), ["submitted", "rejected", "reopened", "withdrawn"]);
      assert.equal((await odin.post(`/api/v1/applications/${f.id}/withdraw`, {})).status, 404, "only the applicant withdraws");
      assert.ok((await hs.get("/api/v1/applications")).json.applications.some(a => a.id === f.id), "still in the log");
    });

    test("reopening an approved application takes the entrant out of the lineup but keeps it saved", async () => {
      await review(app.id, "reopen", "Checking something");
      assert.equal((await guest.get(`/api/v1/battles/${battle.id}`)).json.battle.entrants.length, 0);
      assert.equal((await guest.get("/api/v1/entrants/valhalla")).status, 200);
      await review(app.id, "approve");
      assert.equal((await guest.get(`/api/v1/battles/${battle.id}`)).json.battle.entrants.length, 1);
    });

    test("a closed battle takes no applications; the battle's kinds are enforced", async () => {
      await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { status: "closed" });
      assert.equal((await apply(freya, { kind: "bot", name: "Brisingr", creatorName: "Freya" })).json.error.code, "applications_closed");
      await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { status: "open" });
      const callersOnly = (await hs.post("/api/v1/battles", { title: "Callers night", startsAt: nextQuarter(3), kinds: ["caller"], status: "open" })).json.battle;
      assert.equal((await apply(freya, { kind: "bot", name: "Brisingr", creatorName: "Freya" }, callersOnly)).json.error.code, "kind_not_allowed");
    });

    test("an approved entrant is re-selected for the next battle with a new application", async () => {
      const week2 = (await hs.post("/api/v1/battles", { title: "Week 2", startsAt: nextQuarter(7), status: "open" })).json.battle;
      const saved = (await odin.get("/api/v1/entrants?mine=1")).json.entrants;
      assert.deepEqual(saved.map(e => e.name), ["Valhalla"]);
      assert.equal((await apply(freya, { entrantId: saved[0].id, creatorName: "Freya" }, week2)).status, 404, "not hers to re-select");
      const r = await apply(odin, { entrantId: saved[0].id, creatorName: "Odin", discordServer: "Asgard 2", name: "Ignored" }, week2);
      assert.equal(r.status, 201);
      assert.equal(r.json.application.name, "Valhalla");
      assert.equal(r.json.application.entrantId, saved[0].id);
      assert.equal((await guest.get(`/api/v1/battles/${week2.id}`)).json.battle.entrants.length, 0, "not entered until approved");
      await review(r.json.application.id, "approve");
      const e = (await odin.get(`/api/v1/entrants/${saved[0].id}`)).json.entrant;
      assert.deepEqual(e.battles.sort(), [battle.id, week2.id].sort());
      assert.equal(e.discordServer, "Asgard 2", "details follow the latest application");
      assert.equal((await odin.get("/api/v1/entrants?mine=1")).json.entrants.length, 1, "still one entrant");
    });
  });

  describe("storage", () => {
    test("arena collections are server-only: /api/db can't read or write them, even for admins", async () => {
      for (const c of [hs, odin, guest]) {
        assert.deepEqual((await c.db("query", { query: { collection: "arena_apps" } })).json, { docs: [] });
        assert.equal((await c.db("query", { query: { collection: "arena_entrants" } })).json.docs.length, 0);
      }
      const id = (await hs.get("/api/v1/applications")).json.applications[0].id;
      assert.equal((await hs.db("get", { path: `arena_apps/${id}` })).status, 403);
      assert.equal((await hs.db("update", { path: `arena_apps/${id}`, data: { status: "approved" } })).status, 403);
      assert.equal((await hs.db("delete", { path: `arena_apps/${id}` })).status, 403);
      assert.equal((await odin.db("set", { path: "arena_entrants/fake12345", data: { name: "x" } })).status, 403);
      assert.equal((await hs.db("acquire", { path: `arena_battles/${battle.id}` })).status, 403);
    });

    test("cross-site writes are blocked", async () => {
      const r = await odin.post(`/api/v1/battles/${battle.id}/applications`, VALHALLA, { origin: "https://evil.example" });
      assert.equal(r.status, 403);
    });

    // A real restart, as `systemctl restart d3mon` does it: the server process gets SIGTERM and a new
    // one starts on the same data folder. Nothing is saved by hand, so this checks the shutdown path.
    test("everything survives a restart of the server process", async () => {
      const dataDir = path.join(srv.dataDir, "restart");
      const env = { ...process.env, D3MON_DOTENV: "off", D3MON_DATA_DIR: dataDir, PORT: "0", HOST: "127.0.0.1", D3MON_OWNER: "", D3MON_KALSHI: "off" };
      const boot = () => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["server/start.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        const fail = setTimeout(() => reject(new Error(`didn't start: ${out}`)), 10000);
        child.stdout.on("data", c => {
          out += c;
          const m = out.match(/running at (http:\/\/127\.0\.0\.1:\d+)\//);
          if (m) { clearTimeout(fail); resolve({ child, base: m[1] }); }
        });
        child.stderr.on("data", c => (out += c));
      });
      const stop = child => new Promise(resolve => { child.on("exit", (code, signal) => resolve({ code, signal })); child.kill("SIGTERM"); });

      const one = await boot();
      const admin = new Client(one.base), member = new Client(one.base);
      await admin.register("hardsmoke", "smoke-pass-1", "HardSmoke");
      await member.register("odin", "odin-pass-12", "Odin");
      const b = (await admin.post("/api/v1/battles", { title: "Restart night", startsAt: nextQuarter(), status: "open" })).json.battle;
      const a = (await apply(member, VALHALLA, b)).json.application;
      await admin.post(`/api/v1/applications/${a.id}/review`, { decision: "approve", note: "In" });
      await apply(member, { kind: "script", name: "Rune Script", creatorName: "Odin" }, b); // left pending
      const before = {
        apps: (await admin.get("/api/v1/applications")).json.applications,
        battle: (await admin.get(`/api/v1/battles/${b.id}`)).json.battle,
        mine: (await member.get("/api/v1/entrants?mine=1")).json.entrants,
      };
      assert.equal(before.apps.length, 2);
      // Restart straight away, well inside the server's save delays.
      assert.deepEqual(await stop(one.child), { code: 0, signal: null }, "a clean shutdown on SIGTERM");

      const two = await boot();
      try {
        const admin2 = new Client(two.base), member2 = new Client(two.base);
        assert.equal((await admin2.post("/api/auth/login", { username: "hardsmoke", password: "smoke-pass-1" })).status, 200);
        assert.equal((await member2.post("/api/auth/login", { username: "odin", password: "odin-pass-12" })).status, 200);
        const apps = (await admin2.get("/api/v1/applications")).json.applications;
        assert.deepEqual(apps, before.apps, "the whole application log, history included");
        assert.deepEqual(apps.map(x => x.status).sort(), ["approved", "pending"]);
        assert.deepEqual((await admin2.get(`/api/v1/battles/${b.id}`)).json.battle, before.battle, "the battle and its lineup");
        assert.deepEqual((await member2.get("/api/v1/entrants?mine=1")).json.entrants, before.mine, "the saved entrant, ready to re-select");
      } finally {
        await stop(two.child);
      }
    });
  });

  describe("live feed", () => {
    test("topics are checked when the feed opens", async () => {
      assert.equal((await feed(guest, "admin:applications")).status, 401);
      assert.equal((await feed(odin, "admin:applications")).status, 403);
      assert.equal((await feed(guest, "me:applications")).status, 401);
      assert.equal((await feed(odin, "nonsense")).status, 403);
      assert.equal((await feed(guest, "")).status, 400);
    });

    test("admins see every application live; applicants see only their own", async () => {
      const b = (await hs.post("/api/v1/battles", { title: "Live test", startsAt: nextQuarter(10), status: "open" })).json.battle;
      const adminFeed = await feed(hs, "admin:applications");
      const odinFeed = await feed(odin, "me:applications");
      const freyaFeed = await feed(freya, "me:applications");
      const a = (await apply(odin, { kind: "script", name: "Rune Script", creatorName: "Odin" }, b)).json.application;
      const seen = await adminFeed.next(e => e.type === "application.created" && e.data.id === a.id);
      assert.equal(seen.data.applicantName, "Odin", "admins get the admin view");
      const own = await odinFeed.next(e => e.type === "application.created");
      assert.equal(own.data.id, a.id);
      assert.equal(own.data.applicantName, undefined, "each reader gets their own view");
      await review(a.id, "approve");
      assert.equal((await odinFeed.next(e => e.type === "application.updated")).data.status, "approved");
      assert.equal(await freyaFeed.next(() => true, 300), null, "nothing about other people's applications");
      for (const f of [adminFeed, odinFeed, freyaFeed]) f.close();
    });

    test("draft battles reach admins only; battle changes reach everyone once open", async () => {
      const gFeed = await feed(guest, "battles");
      const aFeed = await feed(hs, "battles");
      const d = (await hs.post("/api/v1/battles", { title: "Hidden", startsAt: nextQuarter(12) })).json.battle;
      assert.ok(await aFeed.next(e => e.data.id === d.id));
      assert.equal(await gFeed.next(e => e.data.id === d.id, 300), null);
      await hs.req("PATCH", `/api/v1/battles/${d.id}`, { status: "open" });
      const open = await gFeed.next(e => e.data.id === d.id);
      assert.equal(open.data.status, "open");
      assert.equal(open.data.applications, undefined, "guests don't get admin counts");
      gFeed.close(); aFeed.close();
    });

    test("losing the admin role stops admin events without reconnecting", async () => {
      const mod = new Client(srv.base);
      await mod.register("loki", "loki-pass-12", "Loki");
      const roles = readRoles(rolesFile());
      writeRoles(rolesFile(), { ...roles, admins: [...roles.admins, mod.user.id] });
      await new Promise(r => setTimeout(r, 2100)); // roles.json is re-read every 2 seconds
      const f = await feed(mod, "admin:applications");
      assert.equal(f.status, 200);
      writeRoles(rolesFile(), roles);
      await new Promise(r => setTimeout(r, 2100));
      const b = (await hs.get("/api/v1/battles")).json.battles.find(x => x.status === "open");
      await apply(freya, { kind: "bot", name: "Gungnir", creatorName: "Freya" }, b);
      assert.equal(await f.next(() => true, 300), null);
      f.close();
    });

    test("signing out ends that session's feeds", async () => {
      const c = new Client(srv.base);
      await c.post("/api/auth/login", { username: "odin", password: "odin-pass-12" });
      const f = await feed(c, "me:applications");
      await c.post("/api/auth/logout", {});
      await f.next(() => false, 300);
      assert.ok(f.ended(), "stream closed");
    });
  });

  test("serves the registration and review pages", async () => {
    for (const p of ["/apply", "/applications", "/js/arena.js", "/js/arena-apply.js", "/js/arena-admin.js"]) assert.equal((await guest.get(p)).status, 200, p);
    assert.match((await guest.get("/")).text, /href="apply"/);
  });

  test("the front page is the new one; the original lives on at /classic", async () => {
    const home = (await guest.get("/")).text, next = (await guest.get("/next")).text, classic = await guest.get("/classic");
    assert.equal(home, next);
    assert.equal(classic.status, 200);
    assert.notEqual(classic.text, home);
    assert.match(classic.text, /id="intro"/);
  });
});
