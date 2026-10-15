// The stat list (Stats Hub, phase 1): the standard stats every bot may send, kept in the store so
// HardSmoke can add, relabel, regroup and retire them on /catalog without a code change. Values are
// never worked out by the site: each bot's owner sends them with the bot's key (POST /api/v1/bot/stats)
// and every value is shown as "self-reported". Owners still choose, stat by stat, who sees each one.
//
//   arena_statcatalog/<key>   { key, label, type, unit, category, format, description, order, retired }
//
// Nothing is deleted: retiring a stat takes it off cards and stops bots sending it, and its values stay
// in the ledger. A stat's type is locked once any bot has sent a value for it, so history stays readable.
import { ApiError, check, cleanText } from "./validate.js";
import { isAdmin } from "../rules.js";

export const CATALOG = "arena_statcatalog";
export const STAT_KEY = /^[a-z][a-z0-9_]{1,31}$/;
export const STAT_KEY_HINT = "Stat keys are 2 to 32 lowercase letters, digits or _, starting with a letter.";
const MAX_STATS = 100;

// The shape a value must have, by type. The first format is the default.
export const TYPES = {
  number: { formats: ["plain", "signed"], hint: "a number" },
  integer: { formats: ["plain", "signed", "streak"], hint: "a whole number" },
  percent: { formats: ["percent"], hint: "a fraction from 0 to 1 (0.61 means 61%)" },
  return: { formats: ["percent"], hint: "a signed fraction, -1 or more (0.25 means +25%, -0.1 means -10%)" },
  money: { formats: ["money"], hint: "US dollars, signed, up to 4 decimals (12.5 means $12.50)" },
  duration: { formats: ["duration"], hint: "milliseconds, a whole number 0 or more" },
  text: { formats: ["short", "paragraph"], hint: "text, 1 to 500 characters" },
  date: { formats: ["date", "since"], hint: "a date like \"2026-03-01\"" },
  record: { formats: ["record"], hint: "{\"w\": wins, \"l\": losses}, with optional \"t\" (a label such as the day) and \"profit\" (dollars)" },
  series: { formats: ["plain", "percent", "money"], hint: "a list of up to 500 {\"t\": label, \"v\": number} points" },
  histogram: { formats: ["plain", "percent", "money"], hint: "an object of up to 48 named numbers" },
};
export const FORMATS = {
  plain: "The number as sent", signed: "With a + or − sign", streak: "+3 = wins in a row, −2 = losses in a row",
  percent: "As a percentage", money: "In dollars", duration: "Minutes and seconds", short: "One line of text",
  paragraph: "A block of text", date: "The date", since: "The date and how many days since", record: "Wins–losses",
};
export const defaultFormat = type => TYPES[type].formats[0];

// The 30 stats the list starts with. HardSmoke edits them on /catalog; this is only the first seed.
const P = "Performance", $ = "Profit", T = "Timing", D = "Daily & records", S = "Strategy", R = "Risk";
export const SEED = [
  [P, "win_rate", "Win rate", "percent", "%", "Share of calls that were right"],
  [P, "total_calls", "Total calls", "integer", "", "Calls made since launch"],
  [P, "wins_losses", "Wins / losses", "record", "", "Right and wrong calls since launch"],
  [P, "current_streak", "Current streak", "integer", "", "Right (+) or wrong (−) calls in a row", "streak"],
  [P, "best_win_streak", "Best win streak", "integer", "", "Most right calls in a row"],
  [P, "worst_loss_streak", "Worst losing streak", "integer", "", "Most wrong calls in a row"],
  [$, "total_profit", "Total profit", "money", "$", "Profit since launch"],
  [$, "profit_per_contract", "Profit per $1 contract", "money", "$", "Average profit on a $1 Kalshi contract"],
  [$, "roi", "ROI", "return", "%", "Return on the money put in"],
  [$, "avg_profit_per_trade", "Average profit per trade", "money", "$", "Total profit divided by trades"],
  [$, "biggest_win_loss", "Biggest win / biggest loss", "histogram", "$", "The best and worst single trade, as {\"win\", \"loss\"}", "money"],
  [$, "max_drawdown", "Max drawdown", "percent", "%", "Largest fall from a peak"],
  [$, "equity_curve", "Equity curve", "series", "$", "Account value over time", "money"],
  [T, "best_hours", "Best trading hours", "histogram", "%", "Win rate by hour of the day (UTC)", "percent"],
  [T, "best_days", "Best days of the week", "histogram", "%", "Win rate by day of the week", "percent"],
  [T, "avg_lead_time", "Average lead time", "duration", "", "How long before the round starts calls are made"],
  [T, "trades_per_day", "Trades per day", "number", "", "Average trades on a day the bot runs"],
  [D, "today_record", "Today's record", "record", "", "Wins and losses today"],
  [D, "best_day", "Best day ever", "record", "", "The best day, with its date as \"t\""],
  [D, "last_7_days", "Last 7 days", "record", "", "Wins and losses over the last 7 days"],
  [D, "last_30_days", "Last 30 days", "record", "", "Wins and losses over the last 30 days"],
  [S, "avg_confidence", "Average confidence", "percent", "%", "The bot's own confidence in its calls, on average"],
  [S, "high_conf_accuracy", "Accuracy on high-confidence calls", "percent", "%", "Win rate when the bot was most sure"],
  [S, "up_down_ratio", "Up vs down calls", "histogram", "", "How many calls went each way, as {\"up\", \"down\"}"],
  [S, "win_rate_up_down", "Win rate on up / down calls", "histogram", "%", "Win rate on each direction, as {\"up\", \"down\"}", "percent"],
  [S, "strategy", "Strategy", "text", "", "How the bot decides, in the owner's words", "paragraph"],
  [S, "data_sources", "Data sources", "text", "", "What the bot reads to make its calls", "paragraph"],
  [R, "avg_position_size", "Average position size", "money", "$", "Average amount put on each trade"],
  [R, "sharpe_ratio", "Sharpe ratio", "number", "", "Return per unit of risk"],
  [R, "launch_date", "Days active / launch date", "date", "", "When the bot started trading", "since"],
].map(([category, key, label, type, unit, description, format], i) => ({ key, label, type, unit, category, format: format || defaultFormat(type), description, order: 100 + (i + 1) * 10 }));
// Keys starting "v_" belong to the server's verified stats (verified.js), so the list can't use them.
export const RESERVED_PREFIX = "v_";

const FIELDS = {
  label: { type: "string", max: 40 },
  type: { type: "enum", values: Object.keys(TYPES) },
  unit: { type: "string", max: 12 },
  category: { type: "string", max: 24 },
  format: { type: "enum", values: Object.keys(FORMATS) },
  description: { type: "string", max: 160 },
  order: { type: "integer", min: 0, max: 9999 },
  retired: { type: "boolean" },
};

export class Catalog {
  // hasValues(key) -> true once any bot has sent a value under that key (locks the type).
  constructor({ store, feed, hasValues = () => false }) {
    Object.assign(this, { store, feed, hasValues });
  }

  // Adds any starting stat that isn't in the list yet. It never changes one that is, and stats are never
  // deleted, so HardSmoke's edits and retirements always stand.
  seed() {
    for (const s of SEED) if (!this.store.get(`${CATALOG}/${s.key}`).exists) this.store.set(`${CATALOG}/${s.key}`, { ...s, retired: false, updatedAt: Date.now() }, null);
  }

  all() {
    return this.store.query({ collection: CATALOG }).map(r => r.data).sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));
  }
  // An active stat, or null.
  get(key) {
    const d = this.store.get(`${CATALOG}/${key}`).data;
    return d && !d.retired ? d : null;
  }
  has(key) { return this.store.get(`${CATALOG}/${key}`).exists; }

  // Public: the active stats, so bot builders and any front end know the keys. Admins also see
  // retired ones and which types are locked.
  view(ctx) {
    const admin = isAdmin(ctx);
    const stats = this.all().filter(s => admin || !s.retired).map(({ updatedAt, updatedBy, ...s }) => (admin ? { ...s, locked: this.hasValues(s.key), updatedAt } : (({ retired, ...rest }) => rest)(s)));
    const categories = [...new Set(stats.filter(s => !s.retired).map(s => s.category))];
    return { schema: "d3mon.statcatalog/v1", types: Object.fromEntries(Object.entries(TYPES).map(([t, x]) => [t, { formats: x.formats, value: x.hint }])), formats: FORMATS, categories, stats };
  }

  // PUT /stat-catalog { stats: { <key>: { label?, type?, unit?, category?, format?, description?, order?, retired? } } }
  // Creates or changes stats; only what's sent changes. A new stat needs a label, a type and a category.
  update(ctx, body) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only HardSmoke can change the stat list.");
    const f = check(body, { stats: { type: "map", required: true, keyPattern: STAT_KEY, keyHint: STAT_KEY_HINT, max: MAX_STATS, of: { type: "object", fields: FIELDS } } });
    const next = new Map(this.all().map(s => [s.key, s]));
    const changed = [];
    for (const [key, change] of Object.entries(f.stats)) {
      const at = `stats.${key}`, prev = next.get(key);
      if (!prev && key.startsWith(RESERVED_PREFIX)) throw new ApiError(400, "invalid_argument", `Keys starting "${RESERVED_PREFIX}" are for the server's verified stats. Pick another name.`, at);
      const merged = { ...(prev || { key, unit: "", description: "", order: (Math.max(0, ...[...next.values()].map(s => s.order)) + 10), retired: false }), ...change };
      for (const k of ["label", "category"]) if (!merged[k]) throw new ApiError(400, "invalid_argument", `"${at}.${k}" is required.`, `${at}.${k}`);
      if (!merged.type) throw new ApiError(400, "invalid_argument", `"${at}.type" is required for a new stat.`, `${at}.type`);
      if (prev && prev.type !== merged.type && this.hasValues(key))
        throw new ApiError(409, "type_locked", `Bots have already sent ${prev.type} values for "${key}", so its type can't change. Retire it and make a new stat instead.`, `${at}.type`);
      if (!merged.format || (!change.format && !TYPES[merged.type].formats.includes(merged.format))) merged.format = defaultFormat(merged.type);
      if (!TYPES[merged.type].formats.includes(merged.format))
        throw new ApiError(400, "invalid_argument", `"${at}.format" for a ${merged.type} stat is one of: ${TYPES[merged.type].formats.join(", ")}.`, `${at}.format`);
      next.set(key, merged);
      changed.push(merged);
    }
    if ([...next.values()].length > MAX_STATS) throw new ApiError(409, "too_many_stats", `The list holds up to ${MAX_STATS} stats. Retire one first.`, "stats");
    for (const s of changed) this.store.set(`${CATALOG}/${s.key}`, { ...s, updatedAt: Date.now(), updatedBy: ctx.uid }, ctx.uid);
    if (changed.length) this.feed.publish("catalog", "catalog.updated", { keys: changed.map(s => s.key) });
    return this.view(ctx);
  }
}

// Checks one self-reported value against its stat's type, and returns it cleaned.
export function checkValue(type, v, field) {
  const bad = () => new ApiError(400, "invalid_argument", `"${field}" must be ${TYPES[type]?.hint || "a known type"}.`, field);
  const finite = x => typeof x === "number" && Number.isFinite(x);
  const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
  const cents4 = x => Math.round(x * 10000) / 10000;
  switch (type) {
    case "number": if (!finite(v) || Math.abs(v) > 1e12) throw bad(); return v;
    case "integer": if (!Number.isSafeInteger(v)) throw bad(); return v;
    case "percent": if (!finite(v) || v < 0 || v > 1) throw bad(); return v;
    case "return": if (!finite(v) || v < -1 || v > 1e6) throw bad(); return v;
    case "money": if (!finite(v) || Math.abs(v) > 1e12) throw bad(); return cents4(v);
    case "duration": if (!Number.isSafeInteger(v) || v < 0 || v > 1e11) throw bad(); return v;
    case "text": {
      const t = typeof v === "string" ? cleanText(v) : "";
      if (!t || [...t].length > 500) throw bad();
      return t;
    }
    case "date": {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad();
      const ms = Date.parse(`${v}T00:00:00Z`);
      if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== v || ms < Date.UTC(2000, 0, 1) || ms > Date.now() + 86400000) throw bad();
      return v;
    }
    case "record": {
      if (!isObj(v) || Object.keys(v).some(k => !["w", "l", "t", "profit"].includes(k))) throw bad();
      const { w, l, t, profit } = v;
      if (!Number.isSafeInteger(w) || w < 0 || !Number.isSafeInteger(l) || l < 0) throw bad();
      const out = { w, l };
      if (t !== undefined) {
        const s = typeof t === "string" ? cleanText(t) : "";
        if (!s || s.length > 32) throw bad();
        out.t = s;
      }
      if (profit !== undefined) {
        if (!finite(profit) || Math.abs(profit) > 1e12) throw bad();
        out.profit = cents4(profit);
      }
      return out;
    }
    case "series": {
      if (!Array.isArray(v) || v.length > 500) throw bad();
      return v.map(p => {
        const t = isObj(p) && typeof p.t === "string" ? cleanText(p.t) : "";
        if (!isObj(p) || Object.keys(p).some(k => k !== "t" && k !== "v") || !t || t.length > 32 || !finite(p.v)) throw bad();
        return { t, v: p.v };
      });
    }
    case "histogram": {
      if (!isObj(v) || Object.keys(v).length > 48) throw bad();
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        const name = cleanText(k);
        if (!name || name.length > 24 || !finite(x)) throw bad();
        out[name] = x;
      }
      return out;
    }
    default: throw bad();
  }
}
