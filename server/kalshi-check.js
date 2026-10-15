// npm run kalshi:check: asks Kalshi for the latest settled BTC 15-minute rounds and shows how the
// scorer reads each one. Read-only: it records nothing and needs no account or key. Run it on the
// server to check Kalshi is reachable and that its answers still have the fields the scorer expects.
import { loadConfig } from "./config.js";
import { KALSHI_BASE, parseMarket } from "./arena/kalshi.js";

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
  process.exit(good ? 0 : 1);
} catch (e) {
  console.error(`Couldn't read Kalshi: ${e.message}`);
  process.exit(1);
}
