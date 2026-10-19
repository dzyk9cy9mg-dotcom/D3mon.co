// /api/v1: the Arena's JSON API and live feed (ARCHITECTURE.md §9). It's independent of the page's
// own /api/db runtime, so any front end, including the planned 3D site, can be built on it.
import { readJson, sendJson, clientIp, RateLimiter } from "../http.js";
import { isAdmin } from "../rules.js";
import { ApiError } from "./validate.js";
import { Feed } from "./feed.js";
import { Registry } from "./registry.js";
import { Ledger } from "./ledger.js";
import { Metrics } from "./metrics.js";
import { Keys } from "./keys.js";
import { Calls, MARKET, nextRound } from "./calls.js";
import { Stats } from "./stats.js";
import { Catalog } from "./catalog.js";
import { Verified } from "./verified.js";
import { Monitor } from "./monitor.js";
import { Displays } from "./displays.js";
import { Roster } from "./roster.js";
import { Kalshi } from "./kalshi.js";
import { Prices } from "./prices.js";
import { Tournaments } from "./tournaments.js";
import { Vip } from "./vip.js";
import { Hall } from "./hall.js";
import { HallChat } from "./hallchat.js";
import { DiscordBridge } from "./discord.js";
import { ROUND_MS, DEFAULT_CALL_WINDOW_MIN } from "./registry.js";
import path from "node:path";

const MAX_BODY = 16 * 1024;

export function createArena({ store, accounts, cfg }) {
  // A stream's reader, re-checked for every event: signed out means gone, and roles apply at once.
  function ctxNow(stream) {
    const c = stream.ctx;
    if (!c.uid) return c;
    if (!accounts.sessions.has(c.sessionKey) || !accounts.users.has(c.uid)) return null;
    const banned = accounts.banned(c.uid);
    return { ...c, role: accounts.role(c.uid), canWrite: !banned, banned };
  }

  function allow(ctx, topic) {
    const [kind, id] = topic.split(":");
    switch (kind) {
      case "battles": case "catalog": case "tournaments": case "vip": case "hall": return id === undefined;
      case "battle": case "entrant": case "display": return id !== undefined;
      case "me": return id === "applications" && !!ctx.uid;
      case "admin": return (id === "applications" || id === "monitor") && isAdmin(ctx);
      default: return false;
    }
  }

  const feed = new Feed({ allow, ctxNow });
  const userName = uid => accounts.users.get(uid)?.name ?? null;
  const registry = new Registry({ store, feed, userName });
  const ledger = new Ledger({ dir: path.join(cfg.dataDir, "ledger") });
  ledger.load();
  const metrics = new Metrics({ ledger, registry, feed, userName });
  const keys = new Keys({ store, registry });
  const calls = new Calls({ ledger, registry, metrics, feed });
  calls.start();
  const catalog = new Catalog({ store, feed, hasValues: key => stats.hasValues(key) });
  catalog.seed();
  const verified = new Verified({ calls, metrics, registry });
  const stats = new Stats({ store, registry, catalog, verified, calls, ledger, feed });
  const roster = new Roster({ store, registry, ledger });
  const kalshi = new Kalshi({ ledger, metrics, registry, calls, feed, ...(cfg.kalshiUrl ? { base: cfg.kalshiUrl } : {}) });
  if (cfg.kalshi !== false) kalshi.start();
  // Kalshi's prices at the moment of each call, for paper profit (server-read, so verified).
  const prices = new Prices({ ledger, calls, metrics, live: cfg.kalshi !== false, ...(cfg.kalshiUrl ? { base: cfg.kalshiUrl } : {}) });
  calls.prices = prices;
  if (cfg.kalshi !== false) prices.start();
  const monitor = new Monitor({ store, registry, stats, catalog, calls, ledger, kalshi, feed, userName });
  const tournaments = new Tournaments({ ledger, registry, feed, calls, metrics });
  if (cfg.kalshi !== false) tournaments.start(); // no Kalshi, no results to save
  const vip = new Vip({ ledger, registry, calls, feed, accounts });
  const hallChat = new HallChat({ store, feed, userName });
  // The hall chat and one D3MON Discord channel as one conversation, when the bot's settings are in .env.
  const discord = DiscordBridge.configured(cfg)
    ? new DiscordBridge({ store, hallChat, userName, token: cfg.discordToken, channel: cfg.discordChannel, webhook: cfg.discordWebhook, api: cfg.discordApi })
    : null;
  if (discord && cfg.discordPoll) discord.start();
  const hall = new Hall({ ledger, feed, ...(cfg.ytThumbUrl ? { thumbBase: cfg.ytThumbUrl } : {}) });
  const displays = new Displays({ store, registry, stats, catalog, feed });
  displays.seed();
  registry.onBattleChanged = () => { try { roster.sync(); } catch (e) { console.error(e); } };
  const limits = {
    bot: new RateLimiter({ capacity: 30, refillPerSec: 0.5 }), // per key
    botStats: new RateLimiter({ capacity: 10, refillPerSec: 1 / 30 }), // per bot: stats change slowly
    apply: new RateLimiter({ capacity: 20, refillPerSec: 20 / 3600 }),
    writes: new RateLimiter({ capacity: 120, refillPerSec: 2 }),
  };

  const take = (limiter, key) => {
    if (!limiter.take(key)) throw new ApiError(429, "resource_exhausted", "Too many requests. Try again in a little while.");
  };

  function openFeed(req, res, url, ctx) {
    const topics = feed.parseTopics(url.searchParams.get("topics"));
    if (!topics) throw new ApiError(400, "invalid_argument", "Name 1 to 20 topics, such as ?topics=battles,battle:<id>");
    const r = feed.open(res, { ctx, ip: clientIp(req, cfg.trustProxy), topics });
    if (r === "too_many") throw new ApiError(429, "resource_exhausted", "Too many open feeds.");
    if (r === "not_granted") throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "You can't follow one of those topics.");
  }

  // Round results, public: GET /rounds?from=&to= (ISO times or ms; the last 24 hours by default, 7 days at most).
  function roundsView(url) {
    const when = (v, dflt) => { if (v == null || v === "") return dflt; const t = /^\d{1,16}$/.test(v) ? Number(v) : Date.parse(v); if (!Number.isFinite(t)) throw new ApiError(400, "invalid_argument", "from and to are ISO times or milliseconds.", "from"); return t; };
    const market = url.searchParams.get("market") || MARKET;
    if (market !== MARKET) throw new ApiError(400, "invalid_argument", `Only ${MARKET} is recorded.`, "market");
    const now = Date.now();
    const to = when(url.searchParams.get("to"), now), from = when(url.searchParams.get("from"), to - 24 * 3600 * 1000);
    if (from > to || to - from > 7 * 24 * 3600 * 1000) throw new ApiError(400, "invalid_argument", "Ask for 7 days or less, with from before to.", "from");
    const missing = new Set(kalshi.missing(now));
    const rounds = [];
    for (let r = Math.ceil(from / ROUND_MS) * ROUND_MS; r <= to; r += ROUND_MS) {
      const s = metrics.result(MARKET, r);
      if (s) {
        const out = { round: r, endsAt: r + ROUND_MS, result: s.result, source: s.source === "kalshi" ? "kalshi" : "host", verification: s.source === "kalshi" ? "verified" : "recorded by host" };
        for (const k of ["ticker", "strike", "final", "settledAt"]) if (s[k] !== undefined) out[k] = s[k];
        rounds.push(out);
      } else if (missing.has(r)) rounds.push({ round: r, endsAt: r + ROUND_MS, result: null, missingKalshi: true });
    }
    return { market: MARKET, from, to, rounds };
  }

  // Returns true when it handled the request.
  async function handle(req, res, pathname, url, ctx) {
    const route = `${req.method} ${pathname.slice("/api/v1".length)}`;
    const body = () => readJson(req, MAX_BODY);
    const ok = (data, status = 200) => sendJson(res, status, data);
    const writer = () => take(limits.writes, ctx.uid || clientIp(req, cfg.trustProxy));
    let m;

    if (route === "GET /feed") return openFeed(req, res, url, ctx);
    if (route === "GET /clock") {
      const now = Date.now();
      const cur = nextRound(now) - ROUND_MS, closes = cur + DEFAULT_CALL_WINDOW_MIN * 60000;
      return ok({ now, market: MARKET, roundMs: ROUND_MS, currentRound: cur, nextRound: nextRound(now), callWindowMin: DEFAULT_CALL_WINDOW_MIN, locksAt: now < closes ? closes : nextRound(now) + DEFAULT_CALL_WINDOW_MIN * 60000 });
    }

    // Bot endpoints: the bot's key is the only credential. Cookies are ignored here, and keys work nowhere else.
    if (route.startsWith("POST /bot/") || route.startsWith("GET /bot/")) {
      const auth = keys.authenticate(req.headers.authorization);
      take(limits.bot, auth.key.id);
      if (route === "GET /bot/me") {
        // The round open for this bot's calls right now, and when its calls close.
        const now = calls.now(), cur = nextRound(now) - ROUND_MS, curCloses = calls.closesAt(auth.entrant.id, cur);
        const round = now < curCloses ? cur : cur + ROUND_MS, closesAt = round === cur ? curCloses : calls.closesAt(auth.entrant.id, round);
        return ok({ entrant: registry.entrantView(auth.entrant, {}), key: keys.view(auth.key), nextRound: new Date(nextRound(now)).toISOString(),
          openRound: new Date(round).toISOString(), callsCloseAt: new Date(closesAt).toISOString(), callsOpenNow: round === cur });
      }
      // Refused pushes are noted for the monitor (the error only, never what was sent).
      let sent;
      try {
        if (route === "POST /bot/calls") return ok(calls.fromBot(auth, (sent = await body())), 201);
        // Only pushes that would write count against the stats limit, so fixing a bad request costs nothing.
        if (route === "POST /bot/stats") return ok(stats.fromBot(auth, (sent = await readJson(req, 128 * 1024)), () => take(limits.botStats, auth.entrant.id)), 201);
      } catch (err) {
        monitor.reject(auth.entrant.id, route.endsWith("/calls") ? "call" : "stats", "bot-key", err, sent);
        throw err;
      }
      throw new ApiError(404, "not_found", "No such endpoint.");
    }

    if (route === "GET /rounds") return ok(roundsView(url));
    if (route === "GET /market") return ok(prices.market());
    if ((m = route.match(/^GET \/rounds\/(\d{1,16})\/calls$/))) return ok(calls.roundCalls(ctx, m[1]));
    if (route === "GET /hall/chat") return ok({ ...hallChat.read(+url.searchParams.get("limit") || 30), discord: !!discord, ...(isAdmin(ctx) && discord ? { link: discord.status() } : {}) });
    if (route === "POST /hall/chat") { writer(); return ok(hallChat.send(ctx, await body()), 201); }
    if (route === "GET /hall/video") return ok(hall.view());
    if (route === "GET /hall/video/thumb") {
      const t = await hall.thumb();
      if (!t) throw new ApiError(404, "not_found", "No thumbnail right now.");
      res.writeHead(200, { "content-type": t.type, "content-length": t.bytes.length, "cache-control": "public, max-age=600", "x-content-type-options": "nosniff" });
      res.end(t.bytes);
      return true;
    }
    if (route === "PUT /hall/video") { writer(); return ok(hall.set(ctx, await body())); }
    if (route === "DELETE /hall/video") { writer(); return ok(hall.clear(ctx)); }
    if (route === "GET /vip") return ok(vip.info(ctx));
    if (route === "GET /vip/room") return ok(vip.room(ctx));
    if (route === "GET /vip/access") return ok({ access: vip.list(ctx) });
    if (route === "POST /vip/access") { writer(); return ok({ access: vip.grant(ctx, await body()) }); }
    if ((m = route.match(/^DELETE \/vip\/access\/([A-Za-z0-9_-]{8,40})$/))) { writer(); return ok({ access: vip.revoke(ctx, m[1]) }); }
    if (route === "PUT /vip/featured") { writer(); return ok(vip.setFeatured(ctx, await body())); }
    if (route === "GET /tournaments") return ok(tournaments.current());
    if (route === "GET /tournaments/admin") return ok(tournaments.adminView(ctx));
    if (route === "PUT /tournaments/pause") { writer(); return ok(tournaments.pause(ctx, await body())); }
    if ((m = route.match(/^GET \/tournaments\/([A-Za-z0-9-]{6,40})$/))) return ok({ tournament: tournaments.standings(m[1]) });
    if (route === "GET /kalshi") {
      if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only HardSmoke can see the Kalshi status.");
      return ok({ kalshi: kalshi.status(), prices: prices.status() });
    }
    if (route === "GET /battles") return ok({ battles: registry.listBattles(ctx) });
    if (route === "POST /battles") { writer(); return ok({ battle: registry.battleView(registry.createBattle(ctx, await body()), ctx) }, 201); }
    if ((m = route.match(/^GET \/battles\/([A-Za-z0-9]+)$/))) return ok({ battle: registry.battleView(registry.battleFor(ctx, m[1]), ctx) });
    if ((m = route.match(/^PATCH \/battles\/([A-Za-z0-9]+)$/))) { writer(); return ok({ battle: registry.battleView(registry.updateBattle(ctx, m[1], await body()), ctx) }); }
    if ((m = route.match(/^POST \/battles\/([A-Za-z0-9]+)\/applications$/))) {
      if (ctx.uid) take(limits.apply, ctx.uid);
      return ok({ application: registry.appView(registry.apply(ctx, m[1], await body()), ctx) }, 201);
    }
    if ((m = route.match(/^GET \/battles\/([A-Za-z0-9]+)\/metrics$/))) return ok(metrics.view(ctx, m[1], { history: url.searchParams.get("history") === "1" }));
    if ((m = route.match(/^PUT \/battles\/([A-Za-z0-9]+)\/rounds\/(\d{1,16})\/metrics$/))) { writer(); return ok({ round: metrics.record(ctx, m[1], m[2], await body()) }); }
    if (route === "POST /applications") {
      if (ctx.uid) take(limits.apply, ctx.uid);
      return ok({ application: registry.appView(registry.join(ctx, await body()), ctx) }, 201);
    }
    if (route === "GET /applications") return ok({ applications: registry.listApps(ctx, { battleId: url.searchParams.get("battleId"), status: url.searchParams.get("status") }) });
    if ((m = route.match(/^GET \/applications\/([A-Za-z0-9]+)$/))) return ok({ application: registry.getApp(ctx, m[1]) });
    if ((m = route.match(/^POST \/applications\/([A-Za-z0-9]+)\/withdraw$/))) { writer(); return ok({ application: registry.appView(registry.withdraw(ctx, m[1]), ctx) }); }
    if ((m = route.match(/^POST \/applications\/([A-Za-z0-9]+)\/review$/))) { writer(); return ok({ application: registry.appView(registry.review(ctx, m[1], await body()), ctx) }); }
    if (route === "GET /entrants") return ok({ entrants: registry.listEntrants(ctx, { mine: url.searchParams.get("mine") === "1" }) });
    if ((m = route.match(/^GET \/entrants\/([A-Za-z0-9-]+)$/))) return ok({ entrant: registry.getEntrant(ctx, m[1]) });
    if ((m = route.match(/^GET \/entrants\/([A-Za-z0-9-]+)\/calls$/))) return ok({ calls: calls.entrantCalls(ctx, m[1], { limit: Number(url.searchParams.get("limit")) || 200 }) });
    if ((m = route.match(/^POST \/entrants\/([A-Za-z0-9]+)\/call$/))) { writer(); return ok(calls.fromButton(ctx, m[1], await body()), 201); }
    if ((m = route.match(/^GET \/entrants\/([A-Za-z0-9]+)\/keys$/))) return ok({ keys: keys.list(ctx, m[1]) });
    if ((m = route.match(/^POST \/entrants\/([A-Za-z0-9]+)\/keys$/))) { writer(); return ok(keys.create(ctx, m[1], await body()), 201); }
    if ((m = route.match(/^DELETE \/entrants\/([A-Za-z0-9]+)\/keys\/([A-Za-z0-9]+)$/))) { writer(); return ok({ key: keys.revoke(ctx, m[1], m[2]) }); }
    if ((m = route.match(/^GET \/battles\/([A-Za-z0-9]+)\/board$/))) return ok(calls.board(ctx, m[1]));
    if ((m = route.match(/^GET \/entrants\/([A-Za-z0-9-]+)\/tournaments$/))) return ok({ tournaments: tournaments.view(ctx, m[1]) });
    if ((m = route.match(/^PUT \/entrants\/([A-Za-z0-9]+)\/tournaments\/removal$/))) { writer(); return ok({ tournaments: tournaments.remove(ctx, m[1], await body()) }); }
    if ((m = route.match(/^PUT \/entrants\/([A-Za-z0-9]+)\/tournaments$/))) { writer(); return ok({ tournaments: tournaments.set(ctx, m[1], await body()) }); }
    if ((m = route.match(/^GET \/entrants\/([A-Za-z0-9-]+)\/card$/))) return ok(stats.card(ctx, m[1]));
    if (route === "GET /stat-catalog") return ok(catalog.view(ctx));
    if (route === "PUT /stat-catalog") { writer(); return ok(catalog.update(ctx, await body())); }
    if ((m = route.match(/^GET \/entrants\/([A-Za-z0-9]+)\/stat-settings$/))) return ok(stats.settings(ctx, m[1]));
    if ((m = route.match(/^PUT \/entrants\/([A-Za-z0-9]+)\/stat-settings$/))) { writer(); return ok(stats.updateSettings(ctx, m[1], await body())); }
    if ((m = route.match(/^POST \/entrants\/([A-Za-z0-9]+)\/stats$/))) {
      writer();
      let sent;
      try { return ok(stats.fromOwner(ctx, m[1], (sent = await readJson(req, 128 * 1024)), () => take(limits.botStats, m[1])), 201); } catch (err) {
        if (ctx.uid && registry.entrantById(m[1])?.ownerId === ctx.uid) monitor.reject(m[1], "stats", "owner", err, sent); // only the owner's own mistakes
        throw err;
      }
    }
    if (route === "GET /monitor") return ok(monitor.view(ctx));
    if ((m = route.match(/^GET \/displays\/([a-z][a-z0-9-]{1,39})$/))) return ok(displays.render(ctx, m[1], { entrant: url.searchParams.get("e"), battle: url.searchParams.get("battle") }));
    if (route === "GET /display-slots") return ok(displays.list(ctx));
    if ((m = route.match(/^PUT \/display-slots\/([^/]{1,60})$/))) { writer(); return ok({ slot: displays.save(ctx, decodeURIComponent(m[1]), await body()) }); }
    if (route === "PUT /monitor/settings") { writer(); return ok({ settings: monitor.updateSettings(ctx, await body()) }); }
    if ((m = route.match(/^GET \/monitor\/entrants\/([A-Za-z0-9]+)\/stats\/([a-z][a-z0-9_]{1,31})$/))) return ok(monitor.history(ctx, m[1], m[2]));
    throw new ApiError(404, "not_found", "No such endpoint.");
  }

  return { handle, feed, registry, ledger, metrics, keys, calls, tournaments, vip, hall, hallChat, discord, verified, catalog, stats, monitor, displays, roster, kalshi, prices, close: () => { discord?.stop(); calls.stop(); kalshi.stop(); prices.stop(); tournaments.stop(); monitor.stop(); feed.close(); } };
}
