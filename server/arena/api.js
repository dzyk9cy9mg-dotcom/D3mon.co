// /api/v1: the Arena's JSON API and live feed (ARCHITECTURE.md §9). It's independent of the page's
// own /api/db runtime, so any front end, including the planned 3D site, can be built on it.
import { readJson, sendJson, clientIp, RateLimiter } from "../http.js";
import { isAdmin } from "../rules.js";
import { ApiError } from "./validate.js";
import { Feed } from "./feed.js";
import { Registry } from "./registry.js";

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
      case "battles": return id === undefined;
      case "battle": case "entrant": return id !== undefined;
      case "me": return id === "applications" && !!ctx.uid;
      case "admin": return id === "applications" && isAdmin(ctx);
      default: return false;
    }
  }

  const feed = new Feed({ allow, ctxNow });
  const registry = new Registry({ store, feed, userName: uid => accounts.users.get(uid)?.name ?? null });
  const limits = {
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

  // Returns true when it handled the request.
  async function handle(req, res, pathname, url, ctx) {
    const route = `${req.method} ${pathname.slice("/api/v1".length)}`;
    const body = () => readJson(req, MAX_BODY);
    const ok = (data, status = 200) => sendJson(res, status, data);
    const writer = () => take(limits.writes, ctx.uid || clientIp(req, cfg.trustProxy));
    let m;

    if (route === "GET /feed") return openFeed(req, res, url, ctx);
    if (route === "GET /battles") return ok({ battles: registry.listBattles(ctx) });
    if (route === "POST /battles") { writer(); return ok({ battle: registry.battleView(registry.createBattle(ctx, await body()), ctx) }, 201); }
    if ((m = route.match(/^GET \/battles\/([A-Za-z0-9]+)$/))) return ok({ battle: registry.battleView(registry.battleFor(ctx, m[1]), ctx) });
    if ((m = route.match(/^PATCH \/battles\/([A-Za-z0-9]+)$/))) { writer(); return ok({ battle: registry.battleView(registry.updateBattle(ctx, m[1], await body()), ctx) }); }
    if ((m = route.match(/^POST \/battles\/([A-Za-z0-9]+)\/applications$/))) {
      if (ctx.uid) take(limits.apply, ctx.uid);
      return ok({ application: registry.appView(registry.apply(ctx, m[1], await body()), ctx) }, 201);
    }
    if (route === "GET /applications") return ok({ applications: registry.listApps(ctx, { battleId: url.searchParams.get("battleId"), status: url.searchParams.get("status") }) });
    if ((m = route.match(/^GET \/applications\/([A-Za-z0-9]+)$/))) return ok({ application: registry.getApp(ctx, m[1]) });
    if ((m = route.match(/^POST \/applications\/([A-Za-z0-9]+)\/withdraw$/))) { writer(); return ok({ application: registry.appView(registry.withdraw(ctx, m[1]), ctx) }); }
    if ((m = route.match(/^POST \/applications\/([A-Za-z0-9]+)\/review$/))) { writer(); return ok({ application: registry.appView(registry.review(ctx, m[1], await body()), ctx) }); }
    if (route === "GET /entrants") return ok({ entrants: registry.listEntrants(ctx, { mine: url.searchParams.get("mine") === "1" }) });
    if ((m = route.match(/^GET \/entrants\/([A-Za-z0-9-]+)$/))) return ok({ entrant: registry.getEntrant(ctx, m[1]) });
    throw new ApiError(404, "not_found", "No such endpoint.");
  }

  return { handle, feed, registry, close: () => feed.close() };
}
