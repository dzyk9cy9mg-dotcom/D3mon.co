import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const [,, mode, outDir, fps = "30", from = "0", to = "46"] = process.argv;
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("console", m => console.log("console:", m.text())); p.on("pageerror", e => console.log("pageerror:", e.message));
await p.goto("http://127.0.0.1:8765/index.html"); await p.waitForFunction("window.ready === true", null, { timeout: 60000 });
await p.evaluate(() => document.fonts.ready);
const times = mode === "stills" ? [38.5, 40, 41.5, 43, 45, 47] : null;
const list = times || Array.from({ length: Math.round((+to - +from) * +fps) }, (_, i) => +from + i / +fps);
let n = 0; const t0 = Date.now();
for (const t of list) {
  await p.evaluate(t => window.frame(t), t);
  await p.screenshot({ path: `${outDir}/${mode === "stills" ? "s_" + t : String(Math.round(t * +fps)).padStart(5, "0")}.png` });
  n++; if (n % 60 === 0) console.log(n, "frames", ((Date.now() - t0) / n).toFixed(0), "ms/frame");
}
await b.close();
