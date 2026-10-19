import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
// Renders the concept stills headless. From the repo root: node docs/world/concept-v2/render.mjs <out folder> hero close crystal hall
const ROOT = new URL("../../../", import.meta.url).pathname, [OUT, ...shots] = process.argv.slice(2);
const types = { ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(b); }); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const s of shots) {
  const phone = s.endsWith("-phone"); // "<shot>-phone" renders at a phone's size (390×844, 2× pixels)
  const p = await b.newPage(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1600, height: 1000 } }); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${port}/docs/world/concept-v2/index.html?shot=${s.replace("-phone", "")}${phone ? "&pr=2" : ""}`); await p.waitForFunction(() => window.__ready, null, { timeout: 240000 });
  await p.screenshot({ path: `${OUT}/${s}.png` }); console.log(s, errs.slice(0, 5)); await p.close();
}
await b.close(); srv.close();
