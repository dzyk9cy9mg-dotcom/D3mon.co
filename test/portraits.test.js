// Moving profile pictures: owners upload 1 to 3 stills, only real images are kept, an admin approves each upload
// before anyone else can see it, and a newer upload replaces one still waiting. Also: an owner's public floor record
// on their entrant's profile.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const PNG = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]).toString("base64");
const JPG = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]).toString("base64");
const FAKE = "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64");

describe("profile pictures", () => {
  let srv, hs, odin, loki, guest, bot;
  before(async () => {
    srv = await startServer();
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    const app = (await odin.post("/api/v1/applications", { kind: "bot", name: "Valhalla", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${app.id}/review`, { decision: "approve" })).json.application.entrantId;
  });
  after(() => srv.stop());

  test("only the owner uploads, and only real images, 1 to 3 of them", async () => {
    assert.equal((await loki.req("POST", `/api/v1/entrants/${bot}/portrait`, { frames: [PNG] })).status, 404);
    assert.equal((await odin.req("POST", `/api/v1/entrants/${bot}/portrait`, { frames: [FAKE] })).status, 400);
    assert.equal((await odin.req("POST", `/api/v1/entrants/${bot}/portrait`, { frames: [] })).status, 400);
    assert.equal((await odin.req("POST", `/api/v1/entrants/${bot}/portrait`, { frames: [PNG, PNG, PNG, PNG] })).status, 400);
    const r = await odin.req("POST", `/api/v1/entrants/${bot}/portrait`, { frames: [PNG, JPG, PNG] });
    assert.equal(r.status, 201);
    assert.equal(r.json.pending.frames.length, 3);
    assert.equal(r.json.approved, null);
  });

  test("waiting pictures are hidden from everyone but the owner and admins", async () => {
    const st = (await odin.get(`/api/v1/entrants/${bot}/portrait`)).json, url = "/" + st.pending.frames[1];
    assert.equal((await odin.get(url)).status, 200);
    assert.equal((await hs.get(url)).status, 200);
    assert.equal((await guest.get(url)).status, 404);
    assert.equal((await guest.get("/api/v1/portraits/of/valhalla")).json.portrait, null);
  });

  test("a newer upload replaces one still waiting; admins approve; then everyone sees it", async () => {
    await odin.post(`/api/v1/entrants/${bot}/portrait`, { frames: [JPG, PNG] });
    const q = (await hs.get("/api/v1/portraits/queue")).json.queue;
    assert.equal(q.length, 1);
    assert.equal(q[0].frames.length, 2);
    assert.equal((await loki.req("GET", "/api/v1/portraits/queue")).status, 403);
    assert.equal((await loki.req("POST", `/api/v1/portraits/${q[0].set}/review`, { decision: "approve" })).status, 403);
    assert.equal((await hs.req("POST", `/api/v1/portraits/${q[0].set}/review`, { decision: "approve" })).status, 200);
    assert.equal((await hs.req("POST", `/api/v1/portraits/${q[0].set}/review`, { decision: "reject" })).status, 409);
    const pub = (await guest.get("/api/v1/portraits/of/valhalla")).json.portrait;
    assert.equal(pub.frames.length, 2);
    const img = await guest.get("/" + pub.frames[0]);
    assert.equal(img.status, 200);
  });

  test("a rejected upload leaves the approved picture in place and tells the owner why", async () => {
    await odin.post(`/api/v1/entrants/${bot}/portrait`, { frames: [PNG] });
    const set = (await hs.get("/api/v1/portraits/queue")).json.queue[0].set;
    await hs.post(`/api/v1/portraits/${set}/review`, { decision: "reject", note: "Please use your own art." });
    const st = (await odin.get(`/api/v1/entrants/${bot}/portrait`)).json;
    assert.equal(st.approved.frames.length, 2);
    assert.equal(st.rejected.note, "Please use your own art.");
    assert.equal(st.pending, null);
  });

  test("an owner's floor record shows on their profile only once they make it public", async () => {
    assert.equal((await guest.get("/api/v1/votes/entrant/valhalla")).json.private, true);
    await odin.req("PUT", "/api/v1/votes/settings", { public: true });
    const r = (await guest.get("/api/v1/votes/entrant/valhalla")).json;
    assert.equal(r.record.calls, 0);
  });
});
