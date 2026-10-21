// Payments (docs/BUSINESS.md) against a stand-in Stripe: the owner's prices, Checkout pages opened with those
// prices and the buyer's details, Stripe's signed webhooks switching Capstone and Creator/Spotlight on until the
// paid period ends, each event handled once, forged events refused, and the owner's totals and CSV.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { startServer, Client } from "./helpers.js";

const WHSEC = "whsec_test_123", DAY = 86400000;

describe("payments", () => {
  let srv, hs, odin, loki, guest, bot, stripe;
  const sent = []; // what the stand-in Stripe received
  const billing = () => srv.app.arena.billing;
  const sign = (body, t = Math.floor(Date.now() / 1000), secret = WHSEC) => `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  const hook = async (event, sig) => {
    const body = JSON.stringify(event);
    const res = await fetch(srv.base + "/api/v1/billing/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig ?? sign(body) }, body });
    return { status: res.status, json: await res.json() };
  };
  before(async () => {
    stripe = http.createServer((req, res) => {
      let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
        sent.push({ path: req.url, auth: req.headers.authorization, params: new URLSearchParams(b) });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(req.url.includes("checkout") ? { id: "cs_test_1", url: "https://checkout.stripe.test/pay/cs_test_1" } : { url: "https://billing.stripe.test/p/1" }));
      });
    });
    await new Promise(r => stripe.listen(0, "127.0.0.1", r));
    srv = await startServer({ stripeKey: "sk_test_abc", stripeWebhookSecret: WHSEC, stripeApi: `http://127.0.0.1:${stripe.address().port}`, siteUrl: "https://d3mon.test" });
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    const app = (await odin.post("/api/v1/applications", { kind: "bot", name: "Valhalla", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${app.id}/review`, { decision: "approve" })).json.application.entrantId;
  });
  after(async () => { await srv.stop(); stripe.close(); });

  test("nothing is for sale until the owner sets prices and switches a plan on", async () => {
    assert.deepEqual((await guest.get("/api/v1/billing/plans")).json.plans, []);
    assert.equal((await loki.req("POST", "/api/v1/billing/checkout", { plan: "capstone" })).status, 409);
    assert.equal((await loki.req("PUT", "/api/v1/billing/plans", { capstone: { on: true, month: 3900 } })).status, 403);
    assert.equal((await hs.req("PUT", "/api/v1/billing/plans", { capstone: { month: 12 } })).status, 400); // too small
    const r = await hs.req("PUT", "/api/v1/billing/plans", { capstone: { on: true, month: 3900, year: 39000, pass: 1200, passHours: 24 }, spotlight: { on: true, month: 4900 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.stripe.mode, "test");
    const pub = (await guest.get("/api/v1/billing/plans")).json.plans;
    assert.deepEqual(pub.map(p => p.id), ["capstone", "spotlight"]);
    assert.equal(pub[0].month, 3900);
    // the owner's own wording, and empty brings the default back
    assert.equal((await hs.req("PUT", "/api/v1/billing/plans", { capstone: { name: "x" } })).status, 400);
    await hs.req("PUT", "/api/v1/billing/plans", { capstone: { name: "The Capstone Room", blurb: "Trade live with the best callers." } });
    let c = (await guest.get("/api/v1/billing/plans")).json.plans[0];
    assert.deepEqual([c.name, c.blurb, c.month], ["The Capstone Room", "Trade live with the best callers.", 3900]);
    await hs.req("PUT", "/api/v1/billing/plans", { capstone: { name: "", blurb: "" } });
    c = (await guest.get("/api/v1/billing/plans")).json.plans[0];
    assert.equal(c.name, "Capstone");
  });

  test("checkout opens a Stripe page with the owner's price and the buyer's details", async () => {
    assert.equal((await guest.req("POST", "/api/v1/billing/checkout", { plan: "capstone" })).status, 401);
    const r = await loki.post("/api/v1/billing/checkout", { plan: "capstone", interval: "month" });
    assert.equal(r.json.url, "https://checkout.stripe.test/pay/cs_test_1");
    const s = sent.at(-1);
    assert.equal(s.auth, "Bearer sk_test_abc");
    assert.equal(s.params.get("mode"), "subscription");
    assert.equal(s.params.get("line_items[0][price_data][unit_amount]"), "3900");
    assert.equal(s.params.get("line_items[0][price_data][recurring][interval]"), "month");
    assert.equal(s.params.get("subscription_data[metadata][plan]"), "capstone");
    assert.equal(s.params.get("success_url"), "https://d3mon.test/pricing?paid=1");
    // a Spotlight is for one of your own callers, bots or scripts
    assert.equal((await loki.req("POST", "/api/v1/billing/checkout", { plan: "spotlight", entrantId: bot })).status, 400);
    assert.equal((await odin.req("POST", "/api/v1/billing/checkout", { plan: "creator", entrantId: bot })).status, 409); // creator not on sale
    await odin.post("/api/v1/billing/checkout", { plan: "spotlight", entrantId: bot });
    assert.equal(sent.at(-1).params.get("subscription_data[metadata][entrantId]"), bot);
    // a pass is a one-time payment
    await loki.post("/api/v1/billing/checkout", { plan: "capstone", interval: "pass" });
    assert.equal(sent.at(-1).params.get("mode"), "payment");
    assert.equal(sent.at(-1).params.get("line_items[0][price_data][unit_amount]"), "1200");
  });

  test("forged or stale webhooks are refused", async () => {
    const ev = { id: "evt_x", type: "invoice.paid", data: { object: {} } };
    assert.equal((await hook(ev, sign(JSON.stringify(ev), undefined, "whsec_wrong"))).status, 400);
    assert.equal((await hook(ev, sign(JSON.stringify(ev), Math.floor(Date.now() / 1000) - 3600))).status, 400);
    assert.equal((await hook(ev, "nonsense")).status, 400);
  });

  test("a paid Capstone subscription switches access on until the period ends; events count once", async () => {
    const lokiId = billing().accounts.users.get([...billing().accounts.users.values()].find(u => u.username === "loki").id).id;
    const meta = { uid: lokiId, plan: "capstone", entrantId: "", interval: "month" };
    assert.equal((await hook({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "subscription", subscription: "sub_1", customer: "cus_loki", metadata: meta } } })).status, 200);
    assert.equal((await loki.get("/api/v1/vip")).json.access, false); // not until the invoice is paid
    const end = Math.floor((Date.now() + 30 * DAY) / 1000);
    const inv = { id: "evt_2", type: "invoice.paid", data: { object: { id: "in_1", customer: "cus_loki", amount_paid: 3900, currency: "usd", subscription_details: { metadata: meta }, lines: { data: [{ period: { end } }] } } } };
    assert.equal((await hook(inv)).status, 200);
    assert.equal((await loki.get("/api/v1/vip")).json.access, true);
    const me = (await loki.get("/api/v1/billing/me")).json;
    assert.ok(me.capstone.until > end * 1000);
    assert.equal(me.manage, true);
    assert.equal((await hook(inv)).json.duplicate, true); // Stripe retries; counted once
    assert.equal(srv.app.arena.ledger.lines.filter(l => l.t === "payment").length, 1);
    assert.equal((await loki.post("/api/v1/billing/portal", {})).json.url, "https://billing.stripe.test/p/1");
    assert.equal(sent.at(-1).params.get("customer"), "cus_loki");
  });

  test("access ends by itself once the paid period (and a day's grace) is over", async () => {
    const now = Date.now();
    srv.app.arena.vip.now = () => now + 32 * DAY;
    assert.equal((await loki.get("/api/v1/vip")).json.access, false);
    srv.app.arena.vip.now = () => Date.now();
  });

  test("a Spotlight payment marks the bot; a single pass gives a day of Capstone", async () => {
    const odinId = [...billing().accounts.users.values()].find(u => u.username === "odin").id;
    const end = Math.floor((Date.now() + 30 * DAY) / 1000);
    await hook({ id: "evt_3", type: "invoice.paid", data: { object: { id: "in_2", amount_paid: 4900, currency: "usd", parent: { subscription_details: { metadata: { uid: odinId, plan: "spotlight", entrantId: bot } } }, lines: { data: [{ period: { end } }] } } } });
    assert.equal(billing().entrantPlan(bot), "spotlight");
    assert.equal((await odin.get("/api/v1/billing/me")).json.entrants[0].plan, "spotlight");
    assert.deepEqual((await guest.get("/api/v1/billing/spotlights")).json.entrants, [bot]);
    await hook({ id: "evt_4", type: "checkout.session.completed", data: { object: { id: "cs_2", mode: "payment", payment_status: "paid", amount_total: 1200, currency: "usd", customer: "cus_odin", metadata: { uid: odinId, plan: "capstone", entrantId: "", interval: "pass" } } } });
    assert.equal((await odin.get("/api/v1/vip")).json.access, true);
    const until = (await odin.get("/api/v1/billing/me")).json.capstone.until;
    assert.ok(until > Date.now() + 23 * 3600000 && until < Date.now() + 25 * 3600000);
  });

  test("the owner sees who's paying and the money in, and can download it", async () => {
    assert.equal((await loki.req("GET", "/api/v1/billing")).status, 403);
    const a = (await hs.get("/api/v1/billing")).json;
    assert.equal(Object.values(a.months).reduce((x, y) => x + y, 0), 3900 + 4900 + 1200);
    assert.equal(a.subscriptions.length, 1);
    const csv = await (await fetch(srv.base + "/api/v1/billing/payments.csv", { headers: { cookie: hs.cookie } })).text();
    assert.equal(csv.trim().split("\n").length, 4);
    assert.ok(csv.includes('"loki","capstone"'));
  });
});
