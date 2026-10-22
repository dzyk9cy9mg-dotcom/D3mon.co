// A member's own profile fields (owner, 2026-10-21, starting with HardSmoke's profile as the showcase): a tagline and
// their links (YouTube, Twitch, Kick, X, Instagram, TikTok, Discord), written by the member; and the Host title, which
// only admins give (HardSmoke hosts the Battle of the Bots). Shown on /profile?u=<username> with their moving picture.
//
// Ledger lines (the latest one for a member wins, nothing is rewritten):
//   { t: "member_profile", uid, tagline, links: [url, …] }
//   { t: "member_host", uid, on }
// Links keep only the site and the page: a share link's tracking (?si=, ?igsh=, ?sr= …) is never kept.
import { ApiError, check, rejectSecrets } from "./validate.js";
import { isAdmin } from "../rules.js";

const SITES = [
  ["youtube", "YouTube", ["youtube.com", "youtu.be"]],
  ["twitch", "Twitch", ["twitch.tv"]],
  ["kick", "Kick", ["kick.com"]],
  ["x", "X", ["x.com", "twitter.com"]],
  ["instagram", "Instagram", ["instagram.com"]],
  ["tiktok", "TikTok", ["tiktok.com"]],
  ["discord", "Discord", ["discord.gg", "discord.com"]],
];
const MAX_LINKS = 7;
const FIELDS = { tagline: { type: "string", max: 80 } };

// A link someone pastes, made clean: https, one of SITES, the page only. Returns { site, label, url } or throws.
export function memberLink(text, field = "links") {
  let u;
  try { u = new URL(String(text).trim()); } catch { throw new ApiError(400, "invalid_argument", "Each link must start with https://.", field); }
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) throw new ApiError(400, "invalid_argument", "Each link must be an https:// link.", field);
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const site = SITES.find(([, , hosts]) => hosts.some(h => host === h || host.endsWith(`.${h}`)));
  if (!site) throw new ApiError(400, "invalid_argument", `Links can be to ${SITES.map(s => s[1]).join(", ")}.`, field);
  const path = u.pathname.replace(/\/+$/, "");
  if (!path || path.length > 120 || !/^[\w@.~%/-]+$/.test(path)) throw new ApiError(400, "invalid_argument", `That ${site[1]} link doesn't point to a page.`, field);
  // a YouTube video link needs its video id; nothing else from the query is kept
  const v = site[0] === "youtube" && path === "/watch" && /^[\w-]{11}$/.test(u.searchParams.get("v") || "") ? `?v=${u.searchParams.get("v")}` : "";
  if (site[0] === "youtube" && path === "/watch" && !v) throw new ApiError(400, "invalid_argument", "That YouTube link doesn't point to a page.", field);
  const keepHost = host === "twitter.com" ? "x.com" : host;
  return { site: site[0], label: site[1], url: `https://${["youtube.com", "twitch.tv", "instagram.com", "tiktok.com"].includes(keepHost) ? "www." : ""}${keepHost}${path}${v}` };
}

export class Members {
  constructor({ ledger, accounts, now = () => Date.now() }) {
    Object.assign(this, { ledger, accounts, now });
    this.profiles = new Map(); // uid -> { tagline, links }
    this.hosts = new Map(); // uid -> bool
    const index = lines => {
      for (const l of lines) {
        if (l.t === "member_profile") this.profiles.set(l.uid, { tagline: l.tagline || "", links: l.links || [] });
        else if (l.t === "member_host") this.hosts.set(l.uid, !!l.on);
        else if (l.t === "member_deleted") { this.profiles.delete(l.uid); this.hosts.delete(l.uid); }
      }
    };
    index(ledger.lines);
    ledger.on("append", index);
  }

  // What the profile page shows for a member.
  view(uid) {
    const p = this.profiles.get(uid) || { tagline: "", links: [] };
    return { tagline: p.tagline, links: p.links.map(url => memberLink(url)), host: !!this.hosts.get(uid) };
  }

  // PUT /members/me/profile { tagline?, links? }: your own. Each field sent replaces the old ("" or [] clears it).
  set(ctx, body = {}) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't make changes.");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_argument", "Send a JSON object.");
    // links are cleaned before the secret check: a share link's tracking (?si=…) looks like a token, and is dropped
    const { links, ...rest } = body;
    const f = check(rest, FIELDS, { partial: true });
    if (links !== undefined) f.links = links;
    const cur = this.profiles.get(ctx.uid) || { tagline: "", links: [] }, next = { ...cur };
    if ("tagline" in f) next.tagline = f.tagline;
    if ("links" in f) {
      if (!Array.isArray(f.links) || f.links.length > MAX_LINKS || f.links.some(x => typeof x !== "string" || x.length > 400)) throw new ApiError(400, "invalid_argument", `"links" is a list of up to ${MAX_LINKS} links.`, "links");
      next.links = [...new Set(f.links.filter(x => x.trim()).map(x => memberLink(x).url))];
      rejectSecrets(next.links, "links");
    }
    this.ledger.append([{ t: "member_profile", uid: ctx.uid, tagline: next.tagline, links: next.links }], ctx.uid, this.now());
    return this.view(ctx.uid);
  }

  // PUT /members/:username/host { on }: admins give or take the Host title.
  setHost(ctx, uid, body = {}) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins can do that.");
    if (typeof body.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", "on");
    if (!!this.hosts.get(uid) !== body.on) this.ledger.append([{ t: "member_host", uid, on: body.on }], ctx.uid, this.now());
    return this.view(uid);
  }
}
