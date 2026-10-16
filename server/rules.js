// Who may read and write which documents.
//
// On claude.ai any Contributor could write any shared document, and the page simply hid its admin
// tools from everyone else. On the open web that would let any member rewrite site settings from the
// browser console, so these rules enforce what the page itself lets each person do:
//
//   data/users/<uid>/…           that member only (prefs, notes, DM keys, read markers)
//   config, verified, streamers, results       admins (site settings, roles, round results)
//   bots, scripts, requests, rolereq, dcreq, reviewreq   /<uid> docs: that member or an admin,
//                                except coin transfers in bots: only admins set xfer[id].done/ok, and
//                                a finished transfer can't be changed or removed by its member
//   dmx                          the two people in the conversation (doc.p)
//   reviews                      the reviewer (doc.a) or an admin
//   subs, threads, posts, chat   the author (authorId) or an admin; anyone posting may bump a
//                                thread's lastActivity; a thread's author may delete its replies and
//                                a stream's host its chat (the page deletes them along with it)
//   streams                      the host (hostId) or an admin
//   lounge, boards, calls, cxcall   any member: shared logs that everyone writes into
//
//   arena_*                      nobody, admins included: the Arena's records (battles, applications,
//                                entrants, stats) change only through /api/v1, which checks every field
//                                and applies each reader's privacy (server/arena/)
//
// Anything else is admin-only to write. Everything except private areas, DMs and arena_* is public to read.

const ADMIN_ONLY = new Set(["config", "verified", "streamers", "results"]);
const OWN_DOC = new Set(["bots", "scripts", "requests", "rolereq", "dcreq", "reviewreq"]);
const AUTHORED = new Set(["subs", "threads", "posts", "chat"]);
const SHARED = new Set(["lounge", "boards", "calls", "cxcall"]);

export const isAdmin = ctx => ctx.role === "admin" || ctx.role === "owner";

const isServerOnly = segs => segs[0].startsWith("arena_");
const isPrivateArea = segs => segs[0] === "data" && segs[1] === "users" && segs.length >= 4;
const inConversation = (doc, uid) => !!doc && Array.isArray(doc.p) && doc.p.includes(uid);
// A non-admin's write to bots/<uid> must leave the coin transfers' admin decisions alone:
// no new or pending request may carry done/ok, and a finished one (an admin set done or ok)
// stays exactly as it is, so it can't be changed, removed, or lost by deleting the document.
// Pending requests can still be withdrawn.
const isObj = v => !!v && typeof v === "object";
const same = (a, b) => {
  if (!isObj(a) || !isObj(b)) return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
};
const isFinished = x => isObj(x) && (x.done !== undefined || x.ok !== undefined);
const keepsXferDecisions = (before, after) => {
  const was = isObj(before?.xfer) ? before.xfer : {}, now = isObj(after?.xfer) ? after.xfer : {};
  const finished = Object.keys(was).filter(id => isFinished(was[id]));
  return finished.every(id => Object.hasOwn(now, id) && same(was[id], now[id])) &&
    Object.keys(now).every(id => finished.includes(id) || !isFinished(now[id]));
};
const onlyKeys = (obj, keys) => !!obj && Object.keys(obj).length > 0 && Object.keys(obj).every(k => keys.includes(k));

// segs: the document path split on "/"; data: the document (undefined when it doesn't exist).
export function canRead(ctx, segs, data) {
  if (isServerOnly(segs)) return false;
  if (isPrivateArea(segs)) return !!ctx.uid && segs[2] === ctx.uid;
  if (segs[0] === "dmx" && segs.length === 2 && data !== undefined) return inConversation(data, ctx.uid);
  return true;
}

// Whether this person may ever write at this path, before looking at any document contents.
// Used for leases, which the page takes just before creating a document.
// Private areas and DMs come before the admin check: admins can't write into those either.
export function canWritePath(ctx, segs) {
  if (!ctx.uid || !ctx.canWrite || isServerOnly(segs)) return false;
  if (segs[0] === "data") return isPrivateArea(segs) ? segs[2] === ctx.uid : isAdmin(ctx);
  if (segs[0] === "dmx" && segs.length === 2) return true; // checked against the conversation in canWrite
  if (isAdmin(ctx)) return true;
  if (segs.length !== 2) return false;
  const [col, id] = segs;
  if (ADMIN_ONLY.has(col)) return false;
  if (OWN_DOC.has(col)) return id === ctx.uid;
  return col === "reviews" || col === "streams" || AUTHORED.has(col) || SHARED.has(col);
}

// write: { op: "set" | "merge" | "update" | "delete", segs, before, after, patch }
// lookup(path) returns another document's data, for rules that depend on a parent thread or stream.
export function canWrite(ctx, { op, segs, before, after, patch }, lookup) {
  if (!canWritePath(ctx, segs)) return false;
  const uid = ctx.uid, [col] = segs, deleting = after === undefined;
  if (col === "data") return true; // the path check was enough
  if (col === "dmx" && segs.length === 2) return (!before || inConversation(before, uid)) && (deleting || inConversation(after, uid));
  if (isAdmin(ctx)) return true;
  if (col === "bots") return keepsXferDecisions(before, after);
  if (OWN_DOC.has(col) || SHARED.has(col)) return true;
  if (col === "reviews") return (!before || before.a === uid) && (deleting || after.a === uid);
  if (col === "streams") {
    if (!before) return after.hostId === uid;
    return before.hostId === uid && (deleting || after.hostId === uid);
  }
  // subs, threads, posts, chat
  if (!before) return after.authorId === uid;
  if (before.authorId === uid) return deleting || after.authorId === uid;
  if (col === "threads" && op === "update" && onlyKeys(patch, ["lastActivity", "lastAuthorId"]) && patch.lastAuthorId === uid) return true;
  if (deleting && col === "posts") return lookup(`threads/${before.threadId}`)?.authorId === uid;
  if (deleting && col === "chat") return lookup(`streams/${before.streamId}`)?.hostId === uid;
  return false;
}
