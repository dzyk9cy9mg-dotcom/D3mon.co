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
    // Step 5: poll Kalshi's public market data for round results. D3MON_KALSHI=off turns it off.
    kalshi: flag(env.D3MON_KALSHI, true),
    kalshiUrl: (env.D3MON_KALSHI_URL || "").replace(/\/+$/, ""), // tests point this at a stand-in
    // The site chat's link with the D3MON Discord (server/arena/discord.js): the bot's key, and the main channel
    // and/or whole categories (the webhook is optional: the bot makes its own). Secrets stay in .env, never in the repo.
    discordToken: (env.D3MON_DISCORD_BOT_TOKEN || "").trim(),
    discordChannel: (env.D3MON_DISCORD_CHANNEL_ID || "").trim(),
    discordWebhook: (env.D3MON_DISCORD_WEBHOOK_URL || "").trim(),
    discordCategories: [env.D3MON_DISCORD_IDS, env.D3MON_DISCORD_CATEGORY_IDS].filter(Boolean).join(",").split(/[\s,]+/).map(x => x.trim()).filter(x => /^\d{5,25}$/.test(x)),
    discordApi: (env.D3MON_DISCORD_API || "https://discord.com/api/v10").replace(/\/+$/, ""), // tests point this at a stand-in
    discordPoll: flag(env.D3MON_DISCORD_POLL, true),
    // Voice and video rooms (server/arena/voice.js): the browsers' STUN servers (to find their own public address),
    // and TURN (a relay for strict networks: coturn on our server, its shared secret in .env). Space or comma separated.
    voiceStun: (env.D3MON_STUN_URLS ?? "stun:stun.cloudflare.com:3478").split(/[\s,]+/).filter(u => /^stuns?:/.test(u)),
    voiceTurn: (env.D3MON_TURN_URLS || "").split(/[\s,]+/).filter(u => /^turns?:/.test(u)),
    voiceTurnSecret: (env.D3MON_TURN_SECRET || "").trim(),
    ytThumbUrl: (env.D3MON_YT_THUMB_URL || "").replace(/\/+$/, ""), // YouTube's thumbnail host; tests point this at a stand-in
    // Payments (server/arena/billing.js, docs/BUSINESS.md): Stripe's secret key and webhook signing secret live in
    // .env, never in the repo. A sk_test_ key is Stripe's test mode: no real money moves. Unset: payments are off.
    stripeKey: (env.D3MON_STRIPE_SECRET_KEY || "").trim(),
    stripeWebhookSecret: (env.D3MON_STRIPE_WEBHOOK_SECRET || "").trim(),
    stripeApi: (env.D3MON_STRIPE_API || "https://api.stripe.com").replace(/\/+$/, ""), // tests point this at a stand-in
    siteUrl: (env.D3MON_SITE_URL || "").replace(/\/+$/, ""), // where Stripe sends people back, e.g. https://d3mon.co
    saveDelayMs: 1000,
  };
  return { ...cfg, ...overrides };
}
