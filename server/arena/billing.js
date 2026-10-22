// Payments (owner, 2026-10-20; plan in docs/BUSINESS.md): members pay for Capstone (the premium live sessions),
// and callers, bot owners and chart scripters pay for a Creator plan or a Spotlight to market themselves. Stripe
// takes the money; paying switches access on and the end of the paid period switches it off, by itself.
//
// No dependencies: Stripe is called over its REST API with fetch, and its webhooks are checked with HMAC-SHA256
// (Stripe's signing scheme). The secret key and webhook secret live in .env (cfg.stripeKey, cfg.stripeWebhookSecret).
// A sk_test_ key is Stripe's test mode, so the whole flow can be tried with test cards before real money moves.
//
// Prices are the owner's to set (admins, PUT /billing/plans): each plan has an on switch and prices in cents per
// month, per year, and (Capstone only) a single-session pass. Checkout uses those prices directly, so nothing has to
// be set up in Stripe's dashboard first.
//
// Ledger lines (never rewritten):
//   { t: "billing_plans", plans }                                  the owner's prices; the latest counts
//   { t: "billing_event", event, type }                            each Stripe event handled once (Stripe retries)
//   { t: "billing_customer", uid, customer }                       a member's Stripe customer, for the billing page
//   { t: "billing_sub", uid, sub, plan, entrantId, status }        a subscription started or ended
//   { t: "payment", uid, plan, entrantId, amount, currency, kind, ref }   money in (cents), for the owner's totals
//   { t: "plan_period", uid, plan, entrantId, until, ref }         a Creator or Spotlight plan paid up to `until`
//   { t: "vip_access", uid, until, note }                          Capstone access (the same line admins grant with)
import crypto from "node:crypto";
import { ApiError } from "./validate.js";
import { isAdmin } from "../rules.js";

const PLAN_IDS = ["capstone", "creator", "spotlight"];
const NAMES = { capstone: "Capstone", creator: "Creator", spotlight: "Creator Spotlight" };
const BLURBS = {
  capstone: "The private live sessions. Our finest callers lead, and you see every call the moment it's made.",
  creator: "Your caller, bot or chart script, listed with a shop window and a settled, public record.",
  spotlight: "Everything in Creator, plus top billing on the front page and the Live floor.",
};
const DEFAULT_PLANS = Object.fromEntries(PLAN_IDS.map(id => [id, { on: false, month: null, year: null, ...(id === "capstone" ? { pass: null, passHours: 24 } : {}) }]));
const GRACE_MS = 24 * 3600 * 1000; // a day's grace after a paid period, so a late renewal doesn't cut anyone off
const TOLERANCE_S = 300; // how old a webhook may be (Stripe's own default)
const cents = v => v === null || (Number.isInteger(v) && v >= 50 && v <= 100000000);

// Stripe's form encoding: nested objects as a[b][c]=v.
function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out); else out.append(key, String(v));
  }
  return out;
}

// Stripe-Signature: "t=<seconds>,v1=<hex>[,v1=…]". The signed text is "<t>.<raw body>".
export function verifySignature(raw, header, secret, nowS = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof header !== "string") return false;
  let t = null; const sigs = [];
  for (const kv of header.split(",")) { const [k, v] = kv.split("=", 2); if (k === "t") t = Number(v); if (k === "v1" && v) sigs.push(v); }
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowS - t) > TOLERANCE_S) return false;
  const want = crypto.createHmac("sha256", secret).update(`${t}.`).update(raw).digest();
  return sigs.some(s => { const b = Buffer.from(s, "hex"); return b.length === want.length && crypto.timingSafeEqual(b, want); });
}

export class Billing {
  constructor({ ledger, registry, vip, feed, accounts, key = "", webhookSecret = "", api = "https://api.stripe.com", siteUrl = "", fetch = globalThis.fetch, now = () => Date.now() }) {
    Object.assign(this, { ledger, registry, vip, feed, accounts, key, webhookSecret, api, siteUrl, fetch, now });
    this.plans = structuredClone(DEFAULT_PLANS);
    this.events = new Set();
    this.customers = new Map(); // uid -> Stripe customer id
    this.subs = new Map(); // subscription id -> { uid, plan, entrantId, status }
    this.periods = new Map(); // `${plan}|${entrantId}` -> until (ms)
    this.payments = [];
    for (const l of ledger.lines) this.#index(l);
    ledger.on("append", lines => { for (const l of lines) this.#index(l); });
  }

  #index(l) {
    if (l.t === "billing_plans") this.plans = { ...structuredClone(DEFAULT_PLANS), ...l.plans };
    else if (l.t === "billing_event") this.events.add(l.event);
    else if (l.t === "billing_customer") this.customers.set(l.uid, l.customer);
    else if (l.t === "billing_sub") this.subs.set(l.sub, { uid: l.uid, plan: l.plan, entrantId: l.entrantId || null, status: l.status });
    else if (l.t === "plan_period") { const k = `${l.plan}|${l.entrantId}`; this.periods.set(k, Math.max(this.periods.get(k) || 0, l.until)); }
    else if (l.t === "payment") this.payments.push(l);
  }

  get configured() { return !!this.key; }
  get mode() { return !this.key ? "off" : this.key.startsWith("sk_live_") ? "live" : "test"; }

  // A plan's name: the owner's own words, or the default
  nameOf(id) { return this.plans[id]?.name || NAMES[id]; }

  // ---------- what someone has
  // A caller's, bot's or script's plan right now: "spotlight", "creator" or null.
  entrantPlan(entrantId) {
    const now = this.now();
    if ((this.periods.get(`spotlight|${entrantId}`) || 0) > now) return "spotlight";
    if ((this.periods.get(`creator|${entrantId}`) || 0) > now) return "creator";
    return null;
  }
  #capstoneUntil(uid) { const l = (this.vip.access.get(uid) || []).at(-1); return l ? l.until : 0; }

  // GET /billing/spotlights: callers, bots and scripts with a paid Spotlight right now (public: it's what they paid for).
  spotlights() {
    return { entrants: this.registry.allEntrants().filter(e => e.status === "active" && this.entrantPlan(e.id) === "spotlight").map(e => e.id) };
  }

  // ---------- public: the plans and their prices (only plans the owner switched on, with a price)
  publicPlans() {
    return {
      payments: this.configured,
      plans: PLAN_IDS.map(id => ({ id, ...this.plans[id], name: this.nameOf(id), blurb: this.plans[id].blurb || BLURBS[id] }))
        .filter(p => p.on && (p.month || p.year || p.pass))
        .map(p => ({ id: p.id, name: p.name, blurb: p.blurb, month: p.month, year: p.year, ...(p.id === "capstone" ? { pass: p.pass, passHours: p.passHours } : {}) })),
      currency: "usd",
      notice: "Plans buy access and visibility, not results. Not financial advice. D3MON never trades.",
    };
  }

  // GET /billing/me: what you have and until when.
  mine(ctx) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    const until = this.#capstoneUntil(ctx.uid), now = this.now();
    const entrants = this.registry.allEntrants().filter(e => e.ownerId === ctx.uid && e.status === "active").map(e => ({
      id: e.id, name: e.name, kind: e.kind, plan: this.entrantPlan(e.id),
      until: Math.max(this.periods.get(`spotlight|${e.id}`) || 0, this.periods.get(`creator|${e.id}`) || 0) || null,
    }));
    return { capstone: until > now ? { until } : null, entrants, manage: this.customers.has(ctx.uid) && this.configured };
  }

  // ---------- Stripe calls
  async #stripe(path, params) {
    if (!this.configured) throw new ApiError(503, "payments_off", "Payments aren't switched on yet.");
    const res = await this.fetch(`${this.api}/v1${path}`, { method: "POST", headers: { authorization: `Bearer ${this.key}`, "content-type": "application/x-www-form-urlencoded" }, body: form(params).toString(), signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("stripe", path, res.status, body?.error?.message); throw new ApiError(502, "stripe_error", "The payment page couldn't be opened. Try again in a minute."); }
    return body;
  }

  #site(origin) { return this.siteUrl || origin || ""; }

  // POST /billing/checkout { plan, interval: "month" | "year" | "pass", entrantId }: a Stripe Checkout page to pay on.
  async checkout(ctx, body = {}, origin = "") {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in to buy a plan.");
    if (ctx.banned || ctx.canWrite === false) throw new ApiError(403, "not_granted", "You can't buy a plan right now.");
    const id = body.plan, interval = body.interval || "month", p = this.plans[id];
    if (!PLAN_IDS.includes(id)) throw new ApiError(400, "invalid_argument", "plan is capstone, creator or spotlight.", "plan");
    if (!["month", "year", "pass"].includes(interval) || (interval === "pass" && id !== "capstone")) throw new ApiError(400, "invalid_argument", "interval is month or year (or pass, for Capstone).", "interval");
    const amount = p[interval];
    if (!p.on || !amount) throw new ApiError(409, "not_for_sale", `${this.nameOf(id)} isn't on sale yet.`);
    let entrant = null;
    if (id !== "capstone") {
      entrant = this.registry.entrantById(String(body.entrantId || ""));
      if (!entrant || entrant.ownerId !== ctx.uid || entrant.status !== "active") throw new ApiError(400, "invalid_argument", "Choose one of your active callers, bots or scripts.", "entrantId");
    }
    const site = this.#site(origin);
    if (!/^https?:\/\//.test(site)) throw new ApiError(503, "payments_off", "Payments aren't set up yet (no site address).");
    const meta = { uid: ctx.uid, plan: id, entrantId: entrant ? entrant.id : "", interval };
    const name = entrant ? `${this.nameOf(id)} · ${entrant.name}` : this.nameOf(id);
    const params = {
      mode: interval === "pass" ? "payment" : "subscription",
      client_reference_id: ctx.uid,
      success_url: `${site}/pricing?paid=1`, cancel_url: `${site}/pricing?cancelled=1`,
      metadata: meta,
      line_items: { 0: { quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: { name }, ...(interval === "pass" ? {} : { recurring: { interval } }) } } },
      ...(this.customers.has(ctx.uid) ? { customer: this.customers.get(ctx.uid) } : interval === "pass" ? { customer_creation: "always" } : {}),
      ...(interval === "pass" ? { payment_intent_data: { metadata: meta } } : { subscription_data: { metadata: meta } }),
    };
    const s = await this.#stripe("/checkout/sessions", params);
    return { url: s.url };
  }

  // POST /billing/portal: Stripe's own page to cancel, change card or see receipts.
  async portal(ctx, origin = "") {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    const customer = this.customers.get(ctx.uid);
    if (!customer) throw new ApiError(404, "not_found", "You don't have any plans to manage yet.");
    const s = await this.#stripe("/billing_portal/sessions", { customer, return_url: `${this.#site(origin)}/pricing` });
    return { url: s.url };
  }

  // ---------- Stripe tells us what happened (POST /billing/webhook, raw body)
  webhook(raw, signature) {
    if (!this.webhookSecret) throw new ApiError(503, "payments_off", "Webhooks aren't set up.");
    if (!verifySignature(raw, signature, this.webhookSecret, Math.floor(this.now() / 1000))) throw new ApiError(400, "bad_signature", "That didn't come from Stripe.");
    let ev;
    try { ev = JSON.parse(raw.toString("utf8")); } catch { throw new ApiError(400, "invalid_argument", "Not JSON."); }
    if (!ev || typeof ev.id !== "string" || !ev.data || !ev.data.object) throw new ApiError(400, "invalid_argument", "Not a Stripe event.");
    if (this.events.has(ev.id)) return { received: true, duplicate: true };
    const lines = this.#handle(ev.type, ev.data.object);
    this.ledger.append([...lines, { t: "billing_event", event: ev.id, type: ev.type }], null, this.now());
    if (lines.length) this.feed.publish("vip", "vip.updated", () => ({}));
    return { received: true };
  }

  #meta(o) {
    const m = o.metadata && o.metadata.uid ? o.metadata : o.subscription_details?.metadata?.uid ? o.subscription_details.metadata
      : o.parent?.subscription_details?.metadata?.uid ? o.parent.subscription_details.metadata : null;
    if (!m || !this.accounts.users.has(m.uid) || !PLAN_IDS.includes(m.plan)) return null;
    return { uid: m.uid, plan: m.plan, entrantId: m.entrantId || null };
  }

  // the lines one event adds (nothing for events we don't act on, which are still recorded as handled)
  #handle(type, o) {
    const now = this.now(), out = [];
    if (type === "checkout.session.completed") {
      const m = this.#meta(o); if (!m) return out;
      if (o.customer && this.customers.get(m.uid) !== o.customer) out.push({ t: "billing_customer", uid: m.uid, customer: o.customer });
      if (o.mode === "subscription" && o.subscription) out.push({ t: "billing_sub", uid: m.uid, sub: o.subscription, plan: m.plan, entrantId: m.entrantId, status: "active" });
      if (o.mode === "payment" && m.plan === "capstone" && o.payment_status === "paid") { // a single-session pass
        const hours = this.plans.capstone.passHours || 24, until = Math.max(now, this.#capstoneUntil(m.uid)) + hours * 3600 * 1000;
        out.push({ t: "vip_access", uid: m.uid, until, note: `Capstone pass (Stripe ${o.id})` });
        out.push({ t: "payment", uid: m.uid, plan: "capstone", entrantId: null, amount: o.amount_total ?? 0, currency: o.currency || "usd", kind: "pass", ref: o.id });
      }
    } else if (type === "invoice.paid") {
      const m = this.#meta(o); if (!m) return out;
      const end = (o.lines?.data?.[0]?.period?.end || o.period_end || 0) * 1000;
      if (!end) return out;
      const until = end + GRACE_MS;
      if (m.plan === "capstone") out.push({ t: "vip_access", uid: m.uid, until: Math.max(until, this.#capstoneUntil(m.uid)), note: `Capstone plan (Stripe ${o.id})` });
      else if (m.entrantId) out.push({ t: "plan_period", uid: m.uid, plan: m.plan, entrantId: m.entrantId, until, ref: o.id });
      if (o.customer && this.customers.get(m.uid) !== o.customer) out.push({ t: "billing_customer", uid: m.uid, customer: o.customer });
      out.push({ t: "payment", uid: m.uid, plan: m.plan, entrantId: m.entrantId, amount: o.amount_paid ?? 0, currency: o.currency || "usd", kind: "subscription", ref: o.id });
    } else if (type === "customer.subscription.deleted") {
      const s = this.subs.get(o.id), m = s || this.#meta(o);
      if (m) out.push({ t: "billing_sub", uid: m.uid, sub: o.id, plan: m.plan, entrantId: m.entrantId || null, status: "ended" }); // access runs out at the end of what was paid
    }
    return out;
  }

  // ---------- the owner's controls
  #admin(ctx) { if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins can see payments."); }

  // PUT /billing/plans { capstone: { on, month, year, pass, passHours }, creator: {…}, spotlight: {…} } (cents)
  setPlans(ctx, body = {}) {
    this.#admin(ctx);
    const next = structuredClone(this.plans);
    for (const [id, v] of Object.entries(body || {})) {
      if (!PLAN_IDS.includes(id) || !v || typeof v !== "object") throw new ApiError(400, "invalid_argument", "Plans are capstone, creator and spotlight.", id);
      const p = next[id];
      if (v.on !== undefined) { if (typeof v.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", `${id}.on`); p.on = v.on; }
      for (const k of ["month", "year", ...(id === "capstone" ? ["pass"] : [])]) if (v[k] !== undefined) {
        if (!cents(v[k])) throw new ApiError(400, "invalid_argument", "Prices are in cents, at least 50 (or empty).", `${id}.${k}`);
        p[k] = v[k];
      }
      // the owner's own wording; empty brings back the default
      if (v.name !== undefined) { const n = String(v.name).trim(); if (n.length > 40 || (n && n.length < 3)) throw new ApiError(400, "invalid_argument", "A plan's name is 3 to 40 characters.", `${id}.name`); p.name = n || null; }
      if (v.blurb !== undefined) { const b = String(v.blurb).trim(); if (b.length > 240) throw new ApiError(400, "invalid_argument", "A description is up to 240 characters.", `${id}.blurb`); p.blurb = b || null; }
      if (id === "capstone" && v.passHours !== undefined) { if (!Number.isInteger(v.passHours) || v.passHours < 1 || v.passHours > 720) throw new ApiError(400, "invalid_argument", "A pass lasts 1 to 720 hours.", "capstone.passHours"); p.passHours = v.passHours; }
    }
    this.ledger.append([{ t: "billing_plans", plans: next }], ctx.uid, this.now());
    return this.adminView(ctx);
  }

  // GET /billing: whether Stripe is connected, the prices, who's paying and the money in.
  adminView(ctx) {
    this.#admin(ctx);
    const now = this.now(), name = uid => this.accounts.users.get(uid)?.username || "(deleted)";
    const subs = [...this.subs.entries()].filter(([, s]) => s.status === "active").map(([sub, s]) => ({ sub, username: name(s.uid), plan: s.plan, entrant: s.entrantId ? this.registry.entrantById(s.entrantId)?.name || null : null }));
    const months = {};
    for (const p of this.payments) { const k = new Date(p.at).toISOString().slice(0, 7); months[k] = (months[k] || 0) + (p.amount || 0); }
    const capstone = [...this.vip.access.entries()].map(([uid, ls]) => ({ username: name(uid), until: ls.at(-1).until, paid: /Stripe/.test(ls.at(-1).note || "") })).filter(x => x.until > now);
    return {
      stripe: { mode: this.mode, key: !!this.key, webhook: !!this.webhookSecret, site: this.siteUrl || null },
      plans: Object.fromEntries(PLAN_IDS.map(id => [id, { ...this.plans[id], defaultName: NAMES[id], defaultBlurb: BLURBS[id] }])), subscriptions: subs, capstone, months,
      recent: this.payments.slice(-25).reverse().map(p => ({ at: p.at, username: name(p.uid), plan: p.plan, amount: p.amount, kind: p.kind })),
    };
  }

  // GET /billing/payments.csv: every payment, for bookkeeping.
  csv(ctx) {
    this.#admin(ctx);
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["date", "username", "plan", "for", "kind", "amount_usd", "stripe_ref"]];
    for (const p of this.payments) rows.push([new Date(p.at).toISOString(), this.accounts.users.get(p.uid)?.username || "(deleted)", p.plan, p.entrantId ? this.registry.entrantById(p.entrantId)?.name || "" : "", p.kind, ((p.amount || 0) / 100).toFixed(2), p.ref]);
    return rows.map(r => r.map(q).join(",")).join("\n") + "\n";
  }
}
