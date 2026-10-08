// Member accounts, passwords and sessions. On claude.ai the page got each person's identity from their
// Claude sign-in; the standalone site keeps its own member list in data/accounts.json.
// Roles live in data/roles.json ({ owner, admins, banned } as user ids) so `npm run role` can change
// them while the server is running.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 30 * 24 * 3600 * 1000;
const COLORS = ["#FFB547", "#4DA3FF", "#B98CFF", "#2EE59D", "#FF4D6A", "#5BE3C8", "#F7D154", "#FF8A5B"];

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;

export class AccountError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const sha256 = s => crypto.createHash("sha256").update(s).digest("base64url");

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password).normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || "").split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  if (want.length < 16) return false;
  const key = await scrypt(String(password).normalize("NFKC"), Buffer.from(salt, "base64url"), want.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(want, key);
}

export function cleanName(name) {
  return String(name ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function readRoles(file) {
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    return { owner: typeof r.owner === "string" ? r.owner : null, admins: Array.isArray(r.admins) ? r.admins.map(String) : [], banned: Array.isArray(r.banned) ? r.banned.map(String) : [] };
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`Couldn't read ${file}: ${e.message}`);
    return { owner: null, admins: [], banned: [] };
  }
}

export const writeRoles = (file, roles) => writeJsonAtomic(file, roles);

export class Accounts {
  constructor({ dir, owner = "", signups = "open" }) {
    this.file = path.join(dir, "accounts.json");
    this.rolesFile = path.join(dir, "roles.json");
    this.ownerName = owner;
    this.signups = signups;
    this.users = new Map(); // id -> { id, username, name, pass, color, created }
    this.byName = new Map(); // lowercase username -> id
    this.sessions = new Map(); // sha256(token) -> { uid, created, seen, expires }
    this.roles = { owner: null, admins: [], banned: [] };
    this.rolesStamp = null;
    this.rolesChecked = 0;
    this.saveTimer = null;
    this.dummyHash = null;
  }

  async load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
      for (const u of saved.users || []) {
        this.users.set(u.id, u);
        this.byName.set(u.username.toLowerCase(), u.id);
      }
      const now = Date.now();
      for (const [h, s] of Object.entries(saved.sessions || {})) if (s.expires > now && this.users.has(s.uid)) this.sessions.set(h, s);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    this.#refreshRoles(true);
    // Unknown usernames still pay for one hash, so response time doesn't reveal which names exist.
    this.dummyHash = await hashPassword(crypto.randomBytes(12).toString("base64url"));
  }

  #refreshRoles(force = false) {
    const now = Date.now();
    if (!force && now - this.rolesChecked < 2000) return;
    this.rolesChecked = now;
    let stamp = null;
    try {
      const st = fs.statSync(this.rolesFile);
      stamp = `${st.mtimeMs}:${st.size}`;
    } catch {}
    if (stamp !== this.rolesStamp) {
      this.rolesStamp = stamp;
      this.roles = readRoles(this.rolesFile);
    }
  }

  role(uid) {
    this.#refreshRoles();
    if (!uid) return "guest";
    if (this.roles.owner === uid) return "owner";
    return this.roles.admins.includes(uid) ? "admin" : "member";
  }

  banned(uid) {
    this.#refreshRoles();
    return this.roles.banned.includes(uid);
  }

  hasOwner() {
    this.#refreshRoles();
    return !!this.roles.owner;
  }

  #scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
    this.saveTimer.unref();
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    writeJsonAtomic(this.file, { version: 1, users: [...this.users.values()], sessions: Object.fromEntries(this.sessions) });
  }

  async register({ username, password, name }) {
    username = String(username ?? "").trim();
    const key = username.toLowerCase();
    if (this.signups === "closed" && this.users.size && key !== this.ownerName) throw new AccountError("signups_closed", "New sign-ups are closed.", 403);
    if (!USERNAME_RE.test(username)) throw new AccountError("bad_username", "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.");
    if (typeof password !== "string" || password.length < 8 || password.length > 200) throw new AccountError("bad_password", "Passwords need at least 8 characters.");
    const display = cleanName(name) || username;
    if (this.byName.has(key)) throw new AccountError("username_taken", "That username is taken.", 409);
    const pass = await hashPassword(password);
    if (this.byName.has(key)) throw new AccountError("username_taken", "That username is taken.", 409);
    const user = { id: crypto.randomBytes(12).toString("base64url"), username, name: display, pass, color: COLORS[crypto.randomInt(COLORS.length)], created: Date.now() };
    this.users.set(user.id, user);
    this.byName.set(key, user.id);
    this.#scheduleSave();
    // The site owner is the configured username, or the first account ever made when none is configured.
    this.#refreshRoles(true);
    if (!this.roles.owner && (this.ownerName ? key === this.ownerName : this.users.size === 1)) {
      this.roles = { ...this.roles, owner: user.id };
      writeRoles(this.rolesFile, this.roles);
      this.#refreshRoles(true);
    }
    return user;
  }

  async login({ username, password }) {
    const id = this.byName.get(String(username ?? "").trim().toLowerCase());
    const user = id ? this.users.get(id) : null;
    const ok = await verifyPassword(String(password ?? ""), user ? user.pass : this.dummyHash);
    if (!user || !ok) throw new AccountError("bad_login", "Wrong username or password.", 401);
    if (this.banned(user.id)) throw new AccountError("banned", "This account is suspended.", 403);
    return user;
  }

  async changePassword(uid, current, next) {
    const user = this.users.get(uid);
    if (!user || !(await verifyPassword(String(current ?? ""), user.pass))) throw new AccountError("bad_login", "Your current password is wrong.", 401);
    if (typeof next !== "string" || next.length < 8 || next.length > 200) throw new AccountError("bad_password", "Passwords need at least 8 characters.");
    user.pass = await hashPassword(next);
    this.#scheduleSave();
  }

  rename(uid, name) {
    const user = this.users.get(uid);
    const display = cleanName(name);
    if (!user || !display) throw new AccountError("bad_name", "Enter a display name.");
    user.name = display;
    this.#scheduleSave();
    return user;
  }

  createSession(uid) {
    const token = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    this.sessions.set(sha256(token), { uid, created: now, seen: now, expires: now + SESSION_MS });
    this.#scheduleSave();
    return token;
  }

  sessionKey(token) {
    return typeof token === "string" && token.length > 20 && token.length < 200 ? sha256(token) : null;
  }

  sessionUser(token) {
    const key = this.sessionKey(token);
    const s = key && this.sessions.get(key);
    if (!s) return null;
    const now = Date.now();
    if (s.expires < now || !this.users.has(s.uid)) {
      this.sessions.delete(key);
      this.#scheduleSave();
      return null;
    }
    if (now - s.seen > 3600 * 1000) {
      s.seen = now;
      s.expires = now + SESSION_MS;
      this.#scheduleSave();
    }
    return this.users.get(s.uid);
  }

  endSession(token) {
    const key = this.sessionKey(token);
    if (key && this.sessions.delete(key)) this.#scheduleSave();
    return key;
  }

  endOtherSessions(uid, keepToken) {
    const keep = this.sessionKey(keepToken);
    for (const [k, s] of this.sessions) if (s.uid === uid && k !== keep) this.sessions.delete(k);
    this.#scheduleSave();
  }

  profile(user, meId) {
    // Relative, so it works wherever the site is mounted (see D3MON_BASE_PATH).
    return { id: user.id, name: user.name, avatarUrl: `api/avatar/${user.id}.svg?v=${encodeURIComponent(sha256(user.name + user.color).slice(0, 8))}`, isMe: user.id === meId, guest: false, color: user.color };
  }

  search(q, limit = 60) {
    const needle = cleanName(q).toLowerCase();
    const out = [];
    for (const u of [...this.users.values()].sort((a, b) => b.created - a.created)) {
      if (this.banned(u.id)) continue;
      if (needle && !u.name.toLowerCase().includes(needle) && !u.username.toLowerCase().includes(needle)) continue;
      out.push(u);
      if (out.length >= limit) break;
    }
    return out;
  }
}
