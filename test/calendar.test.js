// The calendar and notifications (owner, 2026-10-21): battles, Capstone sessions and admin events in one list,
// "Remind me" with a note 15 minutes before and at the start, and admin announcements to every member.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const MIN = 60000, Q = 15 * MIN;

describe("calendar and notifications", () => {
  let srv, hs, odin, guest, cal, battle, cap, ev;
  const T0 = Math.ceil(Date.now() / Q) * Q + 4 * Q; // an hour or so from now, on a quarter hour

  before(async () => {
    srv = await startServer();
    [hs, odin, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    cal = srv.app.arena.calendar;
    battle = (await hs.post("/api/v1/battles", { title: "Halloween battle", startsAt: T0, rounds: 4, status: "open" })).json.battle;
    await hs.post("/api/v1/battles", { title: "Secret draft", startsAt: T0, rounds: 4, status: "draft" });
    cap = (await hs.post("/api/v1/vip/sessions", { title: "Capstone one", startsAt: T0 + 2 * Q, minutes: 60 })).json;
  });
  after(() => srv.stop());

  test("admins add events; members can't", async () => {
    assert.equal((await odin.post("/api/v1/calendar/events", { title: "Floor", startsAt: T0 + Q })).status, 403);
    assert.equal((await guest.post("/api/v1/calendar/events", { title: "Floor", startsAt: T0 + Q })).status, 401);
    assert.equal((await hs.post("/api/v1/calendar/events", { title: "Floor", startsAt: T0 + Q, link: "javascript:alert(1)" })).status, 400);
    assert.equal((await hs.post("/api/v1/calendar/events", { title: "Old", startsAt: Date.now() - 3 * 3600000, minutes: 60 })).status, 400);
    const r = await hs.post("/api/v1/calendar/events", { title: "Live floor night", kind: "live", startsAt: T0 + Q, minutes: 90, link: "live", note: "Bring your calls" });
    assert.equal(r.status, 201);
    ev = r.json.event;
    assert.equal(ev.label, "Live trading floor");
  });

  test("everyone sees one list, soonest first, without drafts", async () => {
    const { events } = (await guest.get("/api/v1/calendar")).json;
    assert.deepEqual(events.map(e => e.title), ["Halloween battle", "Live floor night", "Capstone one"]);
    assert.deepEqual(events.map(e => e.type), ["battle", "event", "capstone"]);
    assert.ok(events.every(e => e.remind === false));
  });

  test("members turn reminders on and off; guests can't", async () => {
    assert.equal((await guest.req("PUT", "/api/v1/calendar/remind", { key: `battle:${battle.id}`, on: true })).status, 401);
    assert.equal((await odin.req("PUT", "/api/v1/calendar/remind", { key: "battle:nope", on: true })).status, 404);
    assert.equal((await odin.req("PUT", "/api/v1/calendar/remind", { key: `battle:${battle.id}`, on: true })).json.remind, true);
    assert.equal((await odin.req("PUT", "/api/v1/calendar/remind", { key: ev.key, on: true })).json.remind, true);
    assert.equal((await odin.req("PUT", "/api/v1/calendar/remind", { key: ev.key, on: false })).json.remind, false);
    const { events } = (await odin.get("/api/v1/calendar")).json;
    assert.deepEqual(events.filter(e => e.remind).map(e => e.title), ["Halloween battle"]);
  });

  test("reminders go out 15 minutes before and at the start, once each", async () => {
    assert.equal((await odin.get("/api/v1/notifications")).json.unread, 0);
    cal.remindDue(T0 - 16 * MIN, T0 - 14 * MIN);
    cal.remindDue(T0 - 16 * MIN, T0 - 14 * MIN); // a repeat (a restart) sends nothing new
    let n = (await odin.get("/api/v1/notifications")).json;
    assert.deepEqual([n.unread, n.notes[0].text, n.notes[0].link], [1, "Halloween battle starts in 15 minutes.", "battle"]);
    cal.remindDue(T0 - MIN, T0 + 10);
    n = (await odin.get("/api/v1/notifications")).json;
    assert.deepEqual(n.notes.map(x => x.text), ["Halloween battle is live now.", "Halloween battle starts in 15 minutes."]);
    assert.equal((await hs.get("/api/v1/notifications")).json.unread, 0, "only members who asked");
    assert.equal((await odin.post("/api/v1/notifications/read", {})).json.unread, 0);
    assert.equal((await odin.get("/api/v1/notifications")).json.unread, 0);
    assert.equal((await guest.get("/api/v1/notifications")).status, 401);
  });

  test("admins announce to every member", async () => {
    assert.equal((await odin.post("/api/v1/notifications/announce", { text: "Hello all" })).status, 403);
    assert.equal((await hs.post("/api/v1/notifications/announce", { text: "Battle night is Saturday!", link: "battle" })).json.sent, 2);
    assert.equal((await odin.get("/api/v1/notifications")).json.notes[0].text, "Battle night is Saturday!");
    assert.equal((await hs.get("/api/v1/notifications")).json.unread, 1);
  });

  test("a cancelled event leaves the calendar; reminders and notes can't be read through /api/db", async () => {
    assert.equal((await hs.req("DELETE", `/api/v1/calendar/events/${ev.key.split(":")[1]}`)).status, 200);
    assert.ok(!(await guest.get("/api/v1/calendar")).json.events.some(e => e.key === ev.key));
    for (const collection of ["arena_reminders", "arena_notes"]) {
      const r = await hs.db("query", { query: { collection } });
      assert.ok(r.status >= 400 || !(r.json.docs || []).length, collection);
    }
  });
});
