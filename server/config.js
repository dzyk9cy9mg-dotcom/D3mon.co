// Settings come from environment variables, optionally loaded from a .env file in the project root.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env reader: KEY=VALUE per line, # comments, optional quotes. Real environment variables win.
function loadDotEnv(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

const flag = (v, dflt) => v === undefined || v === "" ? dflt : /^(1|true|yes|on)$/i.test(v);
const int = (v, dflt) => Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : dflt;

// "/d3mon" for a site at https://example.com/d3mon/; "" for one at the root of its domain.
function basePath(v) {
  const p = String(v || "").trim().replace(/\/+$/, "");
  if (p && !/^(\/[A-Za-z0-9._~-]+)+$/.test(p)) throw new Error(`D3MON_BASE_PATH should look like /d3mon (got "${v}")`);
  return p;
}

export function loadConfig(overrides = {}) {
  // D3MON_DOTENV=off: use only real environment variables (hosts that inject them, tests).
  if (!overrides.skipDotEnv && process.env.D3MON_DOTENV !== "off") loadDotEnv(path.join(ROOT, ".env"));
  const env = process.env;
  const cfg = {
    port: int(env.PORT, 3000),
    host: env.HOST || "127.0.0.1",
    basePath: basePath(env.D3MON_BASE_PATH),
    publicDir: path.join(ROOT, "public"),
    dataDir: path.resolve(ROOT, env.D3MON_DATA_DIR || "data"),
    // Username that becomes the site owner when it registers. Unset: the first account to register is the owner.
    owner: (env.D3MON_OWNER || "").trim().toLowerCase(),
    signups: (env.D3MON_SIGNUPS || "open").toLowerCase() === "closed" ? "closed" : "open",
    signupsPerHour: int(env.D3MON_SIGNUPS_PER_HOUR, 5), // new accounts per IP address per hour
    trustProxy: flag(env.D3MON_TRUST_PROXY, false),
    // "auto" marks cookies Secure when the request arrived over HTTPS.
    secureCookies: env.D3MON_SECURE_COOKIES === undefined ? "auto" : flag(env.D3MON_SECURE_COOKIES, false),
    anthropicKey: env.ANTHROPIC_API_KEY || "",
    anthropicModel: env.ANTHROPIC_MODEL || "claude-haiku-5-5",
    anthropicUrl: (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, ""),
    sampleMaxTokens: int(env.D3MON_SAMPLE_MAX_TOKENS, 1024),
    maxDocBytes: int(env.D3MON_MAX_DOC_BYTES, 1024 * 1024),
    maxStoreBytes: int(env.D3MON_MAX_STORE_BYTES, 512 * 1024 * 1024),
    saveDelayMs: 1000,
  };
  return { ...cfg, ...overrides };
}
