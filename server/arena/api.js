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
import { Roster } from "./roster.js";
import { Kalshi } from "./kalshi.js";
import { ROUND_MS } from "./registry.js";
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
      case "battles": case "catalog": return id === undefined;
      case "battle": case "entrant": return id !== undefined;
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
  const monitor = new Monitor({ store, registry, stats, catalog, calls, ledger, kalshi, feed, userName });
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
      return ok({ now, market: MARKET, roundMs: ROUND_MS, currentRound: nextRound(now) - ROUND_MS, nextRound: nextRound(now), locksAt: nextRound(now) });
    }

    // Bot endpoints: the bot's key is the only credential. Cookies are ignored here, and keys work nowhere else.
    if (route.startsWith("POST /bot/") || route.startsWith("GET /bot/")) {
      const auth = keys.authenticate(req.headers.authorization);
      take(limits.bot, auth.key.id);
      if (route === "GET /bot/me") return ok({ entrant: registry.entrantView(auth.entrant, {}), key: keys.view(auth.key), nextRound: new Date(nextRound(Date.now())).toISOString() });
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
    if (route === "GET /kalshi") {
      if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only HardSmoke can see the Kalshi status.");
      return ok({ kalshi: kalshi.status() });
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
    if (route === "PUT /monitor/settings") { writer(); return ok({ settings: monitor.updateSettings(ctx, await body()) }); }
    if ((m = route.match(/^GET \/monitor\/entrants\/([A-Za-z0-9]+)\/stats\/([a-z][a-z0-9_]{1,31})$/))) return ok(monitor.history(ctx, m[1], m[2]));
    throw new ApiError(404, "not_found", "No such endpoint.");
  }

  return { handle, feed, registry, ledger, metrics, keys, calls, catalog, stats, monitor, roster, kalshi, close: () => { calls.stop(); kalshi.stop(); monitor.stop(); feed.close(); } };
}
