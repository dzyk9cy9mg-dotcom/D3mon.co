// Request checking for /api/v1: every body is matched against a declared schema (unknown fields are
// refused), text is cleaned, and anything that looks like a key, password or wallet seed is refused
// before it is stored or logged. Bot owners share read-only results, never credentials.
import { HttpError } from "../http.js";
import { isPlainObject } from "../store.js";
import { BIP39_WORDS } from "./bip39-words.js";

export class ApiError extends HttpError {
  constructor(status, code, message, field) {
    super(status, code, message);
    if (field) this.field = field;
  }
}

const SECRET_NAME = /(api[\W_]?key|secret|private[\W_]?key|passw(or)?d|passphrase|pass[\W_]?code|seed|mnemonic|token|access[\W_]?key|signature|credential)/i;

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*(KEY|CERTIFICATE)[A-Z ]*-----/, // PEM blocks (RSA keys, as Kalshi issues)
  /\bsk-[A-Za-z0-9_-]{16,}/, // sk-… API keys
  /\b[sr]k_(live|test)_[A-Za-z0-9]{10,}/, // Stripe-style keys
  /\b[xt]prv[1-9A-HJ-NP-Za-km-z]{20,}/, // extended private keys
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key ids
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub tokens
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./, // JWTs
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, // UUIDs, the shape of Kalshi API key ids
  /\b(0x)?[0-9a-fA-F]{32,}\b/, // hex keys (wallet private keys are 64 hex digits)
];

function entropy(s) {
  const counts = new Map();
  for (const c of s) counts.set(c, (counts.get(c) || 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

// Long random-looking runs: base64/base64url tokens mixing letters and digits.
function hasRandomToken(text) {
  for (const tok of text.match(/[A-Za-z0-9+/_=-]{32,}/g) || []) {
    if (/[A-Za-z]/.test(tok) && /[0-9]/.test(tok) && entropy(tok) >= 3.5) return true;
  }
  return false;
}

// Twelve or more wallet words in a row is a seed phrase, not a sentence.
function hasSeedPhrase(text) {
  let run = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (!w) continue;
    run = BIP39_WORDS.has(w) ? run + 1 : 0;
    if (run >= 12) return true;
  }
  return false;
}

export function looksLikeSecret(text) {
  const s = String(text);
  return SECRET_PATTERNS.some(re => re.test(s)) || hasRandomToken(s) || hasSeedPhrase(s);
}

// Walks a whole body, names and values, before any schema check so the reason given is the right one.
export function rejectSecrets(value, where = "") {
  if (typeof value === "string") {
    if (looksLikeSecret(value)) throw secretError(where);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => rejectSecrets(v, `${where}[${i}]`));
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      const at = where ? `${where}.${k}` : k;
      if (SECRET_NAME.test(k)) throw secretError(at);
      rejectSecrets(v, at);
    }
  }
}

const secretError = field =>
  new ApiError(400, "looks_like_secret", `"${field || "body"}" looks like a key, password or wallet phrase. D3MON.CO never takes trading credentials or exchange keys. Remove it and send only read-only stats.`, field || "body");

// Collapses whitespace, strips control and invisible formatting characters. Newlines survive when allowed.
export function cleanText(v, { multiline = false } = {}) {
  let s = String(v ?? "").normalize("NFKC").replace(/[\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, "");
  if (multiline) {
    s = s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
    return s.split("\n").map(l => l.trim()).join("\n").trim();
  }
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

// schema: { field: { type: "string"|"integer"|"number"|"boolean"|"enum"|"array"|"object", required, min,
// max, decimals, values, multiline, of, fields } }. "array" takes `of` (the rule for each item); "object"
// takes `fields` (a nested schema); "map" is an object with keys of the sender's choosing, each matching
// `keyPattern`, at most `max` of them, and each value checked against `of`. Returns only the declared fields, cleaned. `partial` allows any subset
// (for PATCH).
export function check(body, schema, { partial = false } = {}) {
  if (!isPlainObject(body)) throw new ApiError(400, "invalid_argument", "Send a JSON object.");
  rejectSecrets(body);
  return checkFields(body, schema, partial, "");
}

function checkFields(body, schema, partial, prefix) {
  for (const k of Object.keys(body)) if (!Object.hasOwn(schema, k)) throw new ApiError(400, "invalid_argument", `Unknown field "${prefix + k}".`, prefix + k);
  const out = {};
  for (const [k, rule] of Object.entries(schema)) {
    const at = prefix + k;
    const present = body[k] !== undefined && body[k] !== null && !(rule.type === "string" && cleanText(body[k], rule) === "");
    if (!present) {
      if (rule.required && !partial) throw new ApiError(400, "invalid_argument", `"${at}" is required.`, at);
      if (k in body && rule.type === "string" && !rule.required) out[k] = "";
      else if (!partial && rule.default !== undefined) out[k] = structuredClone(rule.default);
      continue;
    }
    out[k] = checkOne(at, body[k], rule);
  }
  return out;
}

function checkOne(k, v, rule) {
  const bad = msg => new ApiError(400, "invalid_argument", msg, k);
  switch (rule.type) {
    case "string": {
      if (typeof v !== "string") throw bad(`"${k}" must be text.`);
      const s = cleanText(v, rule);
      if (rule.min && [...s].length < rule.min) throw bad(`"${k}" needs at least ${rule.min} characters.`);
      if (rule.max && [...s].length > rule.max) throw bad(`"${k}" can be at most ${rule.max} characters.`);
      if (rule.pattern && !rule.pattern.test(s)) throw bad(`"${k}" isn't in the expected format.`);
      return s;
    }
    case "integer": {
      if (!Number.isSafeInteger(v)) throw bad(`"${k}" must be a whole number.`);
      if (rule.min !== undefined && v < rule.min) throw bad(`"${k}" must be at least ${rule.min}.`);
      if (rule.max !== undefined && v > rule.max) throw bad(`"${k}" must be at most ${rule.max}.`);
      return v;
    }
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) throw bad(`"${k}" must be a number.`);
      if (rule.min !== undefined && v < rule.min) throw bad(`"${k}" must be at least ${rule.min}.`);
      if (rule.max !== undefined && v > rule.max) throw bad(`"${k}" must be at most ${rule.max}.`);
      return rule.decimals === undefined ? v : Math.round(v * 10 ** rule.decimals) / 10 ** rule.decimals;
    }
    case "boolean":
      if (typeof v !== "boolean") throw bad(`"${k}" must be true or false.`);
      return v;
    case "enum":
      if (!rule.values.includes(v)) throw bad(`"${k}" must be one of: ${rule.values.join(", ")}.`);
      return v;
    case "object":
      if (!isPlainObject(v)) throw bad(`"${k}" must be an object.`);
      return checkFields(v, rule.fields, false, `${k}.`);
    case "map": {
      if (!isPlainObject(v)) throw bad(`"${k}" must be an object.`);
      const keys = Object.keys(v);
      if (rule.max !== undefined && keys.length > rule.max) throw bad(`"${k}" can have at most ${rule.max} entries.`);
      const out = {};
      for (const key of keys) {
        if (!rule.keyPattern.test(key)) throw new ApiError(400, "invalid_argument", `"${k}.${key}" isn't an allowed name. ${rule.keyHint || ""}`.trim(), `${k}.${key}`);
        out[key] = v[key] === null && rule.nullable ? null : checkOne(`${k}.${key}`, v[key], rule.of);
      }
      return out;
    }
    case "array": {
      if (!Array.isArray(v)) throw bad(`"${k}" must be a list.`);
      if (rule.min !== undefined && v.length < rule.min) throw bad(`"${k}" needs at least ${rule.min} item${rule.min === 1 ? "" : "s"}.`);
      if (rule.max !== undefined && v.length > rule.max) throw bad(`"${k}" can have at most ${rule.max} items.`);
      const items = v.map((x, i) => checkOne(`${k}[${i}]`, x, rule.of));
      return rule.unique ? [...new Set(items)] : items;
    }
    case "any": // checked by the caller (credentials were already scanned for)
      return v;
    default:
      throw new Error(`unknown rule type ${rule.type}`);
  }
}

// The same slug the page uses (slug() in d3mon.js), so entrants line up with its battle roster names.
export const slugify = s => cleanText(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
