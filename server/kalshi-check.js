// npm run kalshi:check: asks Kalshi for the latest settled BTC 15-minute rounds and shows how the
// scorer reads each one, then the open round's live prices and a settled round's one-minute price
// history, as the call pricer reads them (the raw price fields are printed too, to check their names).
// Read-only: it records nothing and needs no account or key. Run it on the server to check Kalshi is
// reachable and that its answers still have the fields the scorer and the pricer expect.
import { loadConfig } from "./config.js";
import { KALSHI_BASE, parseMarket } from "./arena/kalshi.js";
import { parseQuote, parseCandle } from "./arena/prices.js";

const base = loadConfig().kalshiUrl || KALSHI_BASE;
const url = `${base}/markets?series_ticker=KXBTC15M&status=settled&limit=8`;
try {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Kalshi answered ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.markets)) throw new Error("Kalshi's answer had no markets list");
  let good = 0;
  for (const m of body.markets) {
    const p = parseMarket(m);
    if (p.skip) { console.log(`SKIP  ${String(m?.ticker).padEnd(26)} ${p.skip}`); continue; }
    good++;
    const extra = [p.strike !== undefined && `target ${p.strike}`, p.final !== undefined && `final ${p.final}`, p.priceCheck && "PRICES DISAGREE"].filter(Boolean).join(", ");
    console.log(`OK    ${p.ticker.padEnd(26)} round ${new Date(p.round).toISOString()}  ${p.result.padEnd(4)}  ${extra}`);
  }
  console.log(good ? `\n${good} of ${body.markets.length} rounds read correctly. Kalshi scoring will work.` : "\nNo rounds could be read. Kalshi scoring won't work until this is fixed.");
  await checkPrices(body.markets.map(parseMarket).find(p => !p.skip)); // reported, but scoring decides the exit code
  process.exit(good ? 0 : 1);
} catch (e) {
  console.error(`Couldn't read Kalshi: ${e.message}`);
  process.exit(1);
}

// The prices each call is priced at: the open round now, and one settled round's candles.
async function checkPrices(settled) {
  const get = async path => { const r = await fetch(`${base}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`Kalshi answered ${r.status}`); return r.json(); };
  const priceFields = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => /bid|ask|price/.test(k)));
  let ok = true;
  console.log("\nLive prices (the open round):");
  try {
    const open = (await get("/markets?series_ticker=KXBTC15M&status=open&limit=5")).markets || [];
    if (!open.length) console.log("  No open round right now.");
    for (const m of open.slice(0, 2)) {
      const q = parseQuote(m);
      console.log(`  raw   ${m.ticker} ${JSON.stringify(priceFields(m))}`);
      console.log(q && (q.yesAsk !== null || q.noAsk !== null) ? `  OK    Up costs ${q.yesAsk ?? "?"}, Down costs ${q.noAsk ?? "?"}` : "  NONE  no prices could be read from this market");
      if (!q || (q.yesAsk === null && q.noAsk === null)) ok = false;
    }
  } catch (e) { console.log(`  Couldn't read the open round: ${e.message}`); ok = false; }
  if (settled) {
    console.log(`\nPrice history (${settled.ticker}, one-minute candles):`);
    try {
      const from = Math.floor(settled.round / 1000), body = await get(`/series/KXBTC15M/markets/${encodeURIComponent(settled.ticker)}/candlesticks?start_ts=${from}&end_ts=${from + 900}&period_interval=1`);
      const list = Array.isArray(body?.candlesticks) ? body.candlesticks : [];
      if (list[0]) console.log(`  raw   ${JSON.stringify(list[0]).slice(0, 400)}`);
      const read = list.map(parseCandle).filter(c => c && (c.close.yesAsk !== null || c.close.last !== null));
      console.log(read.length ? `  OK    ${read.length} of ${list.length} minutes read; the last: Up ${read.at(-1).close.yesAsk ?? "?"}, Down ${read.at(-1).close.noAsk ?? "?"}` : `  NONE  ${list.length} candles, none readable`);
      if (!read.length) ok = false;
    } catch (e) { console.log(`  Couldn't read the price history: ${e.message}`); ok = false; }
  }
  console.log(ok ? "\nCall prices will work." : "\nCall prices need a fix: send this output to Claude.");
  return ok;
}
