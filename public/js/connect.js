// /connect: the bot guide as a page. The examples are written for this site's address, and a key pasted into the box
// fills them in (in this browser only: it's never sent anywhere or saved). The stat list comes from /api/v1/stat-catalog.
(function () {
  "use strict";
  const { api, esc } = window.Arena;
  const $ = id => document.getElementById(id);
  const SITE = new URL(".", location.href).href.replace(/\/$/, "");
  let lang = "py";

  const CODE = {
    me: () => ["Terminal", `curl ${SITE}/api/v1/bot/me -H "Authorization: Bearer __KEY__"`],
    call: () => ({
      py: ["bot.py · Python 3, nothing to install", `import json, time, urllib.request, urllib.error

SITE = "${SITE}"
KEY = "__KEY__"  # keep this private
ROUND = 15 * 60  # rounds start at :00, :15, :30 and :45


def decide():
    """Your signal goes here. Return "up" or "down"."""
    return "up"


def post(path, body):
    req = urllib.request.Request(SITE + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


while True:
    direction = decide()
    r = post("/api/v1/bot/calls", {"schema": "d3mon.call/v1", "market": "KXBTC15M", "direction": direction})
    print(time.strftime("%H:%M:%S"), direction, "sent" if r.get("ok") else r.get("error", {}).get("code"))
    time.sleep(ROUND - time.time() % ROUND + 5)  # wait for the next round`],
      js: ["bot.mjs · Node 18 or newer, nothing to install", `const SITE = "${SITE}";
const KEY = "__KEY__"; // keep this private
const ROUND = 15 * 60 * 1000; // rounds start at :00, :15, :30 and :45

// Your signal goes here. Return "up" or "down".
function decide() {
  return "up";
}

async function call() {
  const direction = decide();
  const res = await fetch(SITE + "/api/v1/bot/calls", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction }),
  });
  const r = await res.json();
  console.log(new Date().toLocaleTimeString(), direction, r.ok ? "sent" : r.error?.code);
}

async function loop() {
  try { await call(); } catch (e) { console.error(e.message); }
  setTimeout(loop, ROUND - (Date.now() % ROUND) + 5000); // the next round
}
loop();`],
      sh: ["Terminal · one call for the round open now", `curl -X POST ${SITE}/api/v1/bot/calls \\
  -H "Authorization: Bearer __KEY__" \\
  -H "Content-Type: application/json" \\
  -d '{"schema":"d3mon.call/v1","market":"KXBTC15M","direction":"up"}'`],
    })[lang],
    stats: () => ["Terminal · send any stats, up to 50 at once", `curl -X POST ${SITE}/api/v1/bot/stats \\
  -H "Authorization: Bearer __KEY__" \\
  -H "Content-Type: application/json" \\
  -d '{"schema":"d3mon.stats/v1","values":[{"key":"win_rate","value":0.62},{"key":"total_profit","value":184.25}]}'`],
  };

  function key() {
    const k = $("key").value.trim();
    return /^d3b_[A-Za-z0-9_-]{8,120}$/.test(k) ? k : "d3b_YOUR_KEY";
  }
  function render() {
    const k = key();
    for (const box of document.querySelectorAll("[data-code]")) {
      const [label, text] = CODE[box.dataset.code](), code = text.replaceAll("__KEY__", k);
      box.innerHTML = `<div class="cn-bar"><span>${esc(label)}</span><button type="button" class="cn-copy">Copy</button></div><pre><code>${esc(code)}</code></pre>`;
      box.querySelector(".cn-copy").onclick = async e => {
        try { await navigator.clipboard.writeText(code); e.target.textContent = "Copied"; } catch (x) { e.target.textContent = "Select and copy"; }
        setTimeout(() => { e.target.textContent = "Copy"; }, 1600);
      };
    }
  }
  $("key").addEventListener("input", render);
  document.querySelector(".cn-tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-lang]"); if (!b) return;
    lang = b.dataset.lang;
    for (const t of document.querySelectorAll(".cn-tabs [data-lang]")) t.setAttribute("aria-selected", String(t === b));
    render();
  });
  render();

  // the standard stats, live
  api("GET", "stat-catalog").then(c => {
    $("catalog").innerHTML = `<table class="cn-table"><thead><tr><th>Key</th><th>What it is</th><th>Type</th><th>Example</th></tr></thead><tbody>${
      c.stats.map(s => `<tr><td><code>${esc(s.key)}</code></td><td>${esc(s.label)}</td><td>${esc(s.type)}</td><td><code>${esc(c.types[s.type]?.value ?? "")}</code></td></tr>`).join("")}</tbody></table>`;
  }).catch(() => { $("catalog").innerHTML = `<p class="cn-note">The list is at <a href="api/v1/stat-catalog">api/v1/stat-catalog</a>.</p>`; });
})();
