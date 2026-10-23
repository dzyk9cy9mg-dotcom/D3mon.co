// Boots the real page (index.html, runtime.js and the unchanged d3mon.js) in jsdom against a live server,
// and checks the page signs people in, renders, and shares what members post: once at the root of a
// domain and once mounted under a path. Needs the jsdom dev dependency (npm install); skipped without it.
// Only this site's files load: no fonts or embeds.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client, eventSourceFor } from "./helpers.js";

let jsdom = null;
try { jsdom = await import("jsdom"); } catch {}

// A canvas 2D context that accepts every call; jsdom has no canvas.
const fakeContext = () =>
  new Proxy(function () {}, {
    get: (_, p) => (p === Symbol.toPrimitive ? () => 0 : p === "then" ? undefined : fakeContext()),
    set: () => true,
    apply: () => fakeContext(),
  });

async function openPage(origin, pageUrl, client, { skipIntro = false } = {}) {
  const errors = [];
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on("jsdomError", e => {
    // jsdom can't lay out pages or parse some modern CSS; neither comes from the site's code.
    if (/Not implemented|Could not parse CSS/.test(e.message)) return;
    errors.push(e.detail || e);
  });
  class SiteOnly extends jsdom.ResourceLoader {
    fetch(url, options) {
      return url.startsWith(origin) ? super.fetch(url, options) : Promise.resolve(Buffer.from(""));
    }
  }
  const EventSource = eventSourceFor(pageUrl, client);
  const dom = await jsdom.JSDOM.fromURL(pageUrl, {
    runScripts: "dangerously",
    resources: new SiteOnly(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      if (skipIntro) window.localStorage.setItem("chartside_intro_v1", "1");
      window.fetch = (url, opts = {}) => fetch(new URL(url, window.location.href), { ...opts, headers: client.cookie ? { ...opts.headers, cookie: client.cookie } : opts.headers });
      window.EventSource = EventSource;
      window.AbortController = AbortController;
      window.TextDecoder = TextDecoder;
      Object.defineProperty(window, "crypto", { value: globalThis.crypto });
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.ResizeObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.HTMLCanvasElement.prototype.getContext = () => fakeContext();
      window.HTMLCanvasElement.prototype.toDataURL = () => "data:,";
      // jsdom has no Web Animations API, which the intro uses (every current browser has it).
      const animation = () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, pause() {}, play() {}, addEventListener() {} });
      window.Element.prototype.animate = animation;
      window.Element.prototype.getAnimations = window.Document.prototype.getAnimations = () => [];
      window.Element.prototype.scrollIntoView = function () {};
      window.Element.prototype.scrollTo = window.Element.prototype.scrollBy = function () {};
      window.scrollTo = window.scrollBy = () => {};
    },
  });
  const { window } = dom;
  return {
    window,
    errors,
    $: id => window.document.getElementById(id),
    app: expr => window.eval(expr),
    close() {
      EventSource.closeAll();
      window.close();
    },
  };
}

// jsdom is slow at drawing the intro, and slower still when other test files share the CPU.
async function until(check, what, ms = 45000) {
  const end = Date.now() + ms;
  for (;;) {
    let v;
    try { v = check(); } catch {}
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

for (const { where, basePath } of [{ where: "at the root of a domain", basePath: "" }, { where: "mounted at /d3mon/", basePath: "/d3mon" }])
describe(`the D3MON.CO page in a headless browser, ${where}`, { skip: !jsdom && "jsdom isn't installed (npm install)" }, () => {
  let srv, ownerC, memberC, owner, member, guest;
  // Rejections in the pages' code while the tests run count as failures. Once teardown starts,
  // requests still in flight fail as the server stops; a browser would only log those.
  const rejections = [];
  let tearingDown = false;
  const onRejection = e => { if (!tearingDown) rejections.push(e); };

  before(async () => {
    process.on("unhandledRejection", onRejection);
    srv = await startServer({ basePath });
    const site = srv.base + basePath, pageUrl = `${site}/classic`; // the original page (the front page moved to next.html, 2026-10-22)
    ownerC = new Client(site);
    memberC = new Client(site);
    await ownerC.register("owner", "owner-pass-1", "Site Owner");
    await memberC.register("nova", "nova-pass-12", "Nova");
    [owner, member, guest] = await Promise.all([
      openPage(srv.base, pageUrl, ownerC, { skipIntro: !!basePath }), // the intro plays once, in the first suite
      openPage(srv.base, pageUrl, memberC, { skipIntro: true }),
      openPage(srv.base, pageUrl, new Client(site), { skipIntro: true }),
    ]);
  });

  after(async () => {
    tearingDown = true;
    for (const p of [owner, member, guest]) p?.close();
    await srv.stop();
    await new Promise(r => setTimeout(r, 500)); // let this server's leftover requests fail before the next suite
  });

  test("boots, signs the member in and shows their name", async () => {
    await until(() => member.$("me").textContent.includes("Nova"), "the member's name in the header");
    assert.ok(member.$("me").querySelector("img").src.includes(`${basePath}/api/avatar/${memberC.user.id}.svg`));
    assert.ok(member.$("me").querySelector("a.d3-out[href='account']"), "the account link sits next to the name");
    assert.equal(member.$("adminBtn").hidden, true, "members don't get the admin button");
    assert.equal(member.app("S.offline"), false);
    await until(() => member.app("S.ready"), "the first live data");
  });

  test("the owner gets the admin tools", async () => {
    await until(() => owner.$("me").textContent.includes("Site Owner"), "the owner's name");
    assert.equal(owner.$("adminBtn").hidden, false);
    assert.equal(owner.app("isAdmin"), true);
    assert.equal(owner.app("isOwner"), true);
  });

  test("guests see a sign-in link and read-only access", async () => {
    await until(() => guest.$("me").querySelector("a.d3-auth[href='login']"), "the sign-in link");
    assert.equal(guest.app("canWrite"), false);
    assert.equal(guest.app("meId"), null);
    assert.equal(guest.app("S.offline"), false);
  });

  test("a member's new thread reaches the owner's page live", async () => {
    await until(() => member.app("S.ready") && owner.app("S.ready"), "both pages to load");
    member.$("subName").value = "grid-bots";
    member.$("subDesc").value = "Grid bot setups";
    member.$("subForm").dispatchEvent(new member.window.Event("submit", { cancelable: true }));
    const sub = await until(() => member.app("S.subs").find(s => s.name === "grid-bots"), "the new subcategory");
    assert.equal(sub.authorId, memberC.user.id);

    await until(() => [...member.$("tSub").options].some(o => o.value === sub.id), "the subcategory in the thread form");
    member.$("tSub").value = sub.id;
    member.$("tTitle").value = "BTC 15m grid settings";
    member.$("tBody").value = "What spacing are you all running?";
    member.$("threadForm").dispatchEvent(new member.window.Event("submit", { cancelable: true }));

    const thread = await until(() => owner.app("S.threads").find(t => t.title === "BTC 15m grid settings"), "the thread on the owner's page");
    assert.equal(thread.authorId, memberC.user.id);
    const stored = (await ownerC.db("get", { path: `threads/${thread.id}` })).json.data;
    assert.equal(stored.body, "What spacing are you all running?");
    assert.equal(member.$("toast").hidden || !/view-only|Couldn't save/.test(member.$("toast").textContent), true);
  });

  test("the member's encryption key for direct messages lands in their private area", async () => {
    // The page makes its key pair once its first DM snapshot arrives: it saves the private half first,
    // then publishes the public half on the member's profile. The private half must stay private.
    let key, profile;
    for (let i = 0; i < 200 && !(key?.exists && profile?.exists); i++) {
      key = (await memberC.db("get", { path: `data/users/${memberC.user.id}/dmkey` })).json;
      profile = (await ownerC.db("get", { path: `bots/${memberC.user.id}` })).json;
      if (!(key.exists && profile.exists)) await new Promise(r => setTimeout(r, 50));
    }
    assert.ok(key.exists && key.data.priv && key.data.pub, "the page saved its key pair");
    assert.equal((await ownerC.db("get", { path: `data/users/${memberC.user.id}/dmkey` })).status, 403, "nobody else can read it");
    assert.equal(profile.data.pub.dmk.x, key.data.pub.x, "the public half is on the member's profile");
  });

  test("no script errors along the way", () => {
    const all = [...owner.errors, ...member.errors, ...guest.errors];
    assert.deepEqual(all.map(e => String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")), []);
    assert.deepEqual(rejections.map(e => String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")), []);
  });
});
