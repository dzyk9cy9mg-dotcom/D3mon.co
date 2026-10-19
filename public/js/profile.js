// /profile?e=<slug>: an entrant's profile in the cinematic style (docs/world/BLUEPRINT.md section 7), the shop
// window its owner sells from (docs/world/USERS.md). "I am NAME." in its kind's colour, a generated emblem,
// HUD labels, its winner badges, its verified record, the owner's tagline, shop and stream links, and its
// recent calls. Thin client over /api/v1: the entrant, its stats card, its calls. Only what the owner made
// public shows; the server decides.
(function () {
  "use strict";
  const { api, esc, kindName, statValue, statText, verifTag, wide, session } = window.Arena;
  const $ = id => document.getElementById(id);
  const slug = new URLSearchParams(location.search).get("e") || "";
  const COLOR = { bot: "#4DA3FF", script: "#B98CFF", caller: "#FFB547" };
  const RGB = { bot: "77,163,255", script: "185,140,255", caller: "255,181,71" };
  const when = ms => new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const time = ms => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // The emblem: engraved rings and the kind's mark (a hexagon for bots, a square chart frame for scripts, a
  // circle for callers) around one D3MON triangle, in the kind's colour. Never a star shape.
  function drawEmblem(kind) {
    const cv = $("emblem"), dpr = Math.min(2, devicePixelRatio || 1), size = Math.min(900, Math.max(cv.clientWidth, cv.clientHeight));
    cv.width = cv.height = Math.round(size * dpr);
    const g = cv.getContext("2d"), C = cv.width / 2, R = C * 0.92, ink = a => `rgba(${RGB[kind] || RGB.bot},${a})`;
    let seed = 23; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.translate(C, C);
    const poly = (n, r, rot) => { g.beginPath(); for (let i = 0; i <= n; i++) { const t = rot + i / n * Math.PI * 2; g[i ? "lineTo" : "moveTo"](Math.cos(t) * r, Math.sin(t) * r); } g.stroke(); };
    for (let ring = 0; ring < 3; ring++) {
      const r0 = R * (0.62 + ring * 0.12), r1 = r0 + R * 0.07;
      for (let i = 0; i < 300; i++) { const t = i / 300 * Math.PI * 2; g.strokeStyle = ink(0.12 + 0.16 * rand()); g.lineWidth = dpr; g.beginPath(); g.moveTo(Math.cos(t) * r0, Math.sin(t) * r0); g.lineTo(Math.cos(t) * r1, Math.sin(t) * r1); g.stroke(); }
      g.strokeStyle = ink(0.6); g.lineWidth = 1.5 * dpr; g.beginPath(); g.arc(0, 0, r0, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, r1, 0, 7); g.stroke();
    }
    g.lineWidth = 2 * dpr;
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = ink(0.9 - k * 0.11); const r = R * (0.56 - k * 0.05);
      if (kind === "caller") { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } else poly(kind === "script" ? 4 : 6, r, kind === "script" ? Math.PI / 4 : Math.PI / 6);
    }
    g.lineWidth = 3 * dpr; g.strokeStyle = ink(1); poly(3, R * 0.4, -Math.PI / 2);
    g.lineWidth = 1.5 * dpr; g.strokeStyle = ink(0.55); poly(3, R * 0.35, -Math.PI / 2);
    for (let r = R * 0.04; r < R * 0.2; r += R * 0.02) { g.strokeStyle = ink(0.3 + r / R); g.lineWidth = dpr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.16); core.addColorStop(0, "rgba(235,246,255,1)"); core.addColorStop(0.35, ink(0.6)); core.addColorStop(1, ink(0));
    g.fillStyle = core; g.beginPath(); g.arc(0, 0, R * 0.16, 0, 7); g.fill();
  }

  async function load() {
    const [{ entrant: e }, card, calls] = await Promise.all([
      api("GET", `entrants/${encodeURIComponent(slug)}`),
      api("GET", `entrants/${encodeURIComponent(slug)}/card`).catch(() => ({ stats: [] })),
      api("GET", `entrants/${encodeURIComponent(slug)}/calls?limit=12`).then(r => r.calls).catch(() => []),
    ]);
    document.title = `${e.name} · ${kindName(e.kind)} · D3MON.CO`;
    document.body.style.setProperty("--kc", COLOR[e.kind] || COLOR.bot);
    const now = Date.now(), cur = Math.floor(now / 900000) * 900000, live = calls.some(c => c.round === cur);
    $("eyebrow").innerHTML = `<i aria-hidden="true" class="${live ? "" : "off"}"></i><span>${esc(kindName(e.kind))}${live ? " · called this round" : ""}</span>`;
    $("nameEm").textContent = `${e.name}.`;
    // A long name shrinks to fit its line rather than breaking mid-word.
    const em = $("nameEm"); em.style.removeProperty("--fit");
    requestAnimationFrame(() => { const room = $("pName").clientWidth, need = em.scrollWidth; if (need > room) em.style.setProperty("--fit", (room / need).toFixed(3)); });
    $("by").innerHTML = `Made by <b>${esc(e.creatorName)}</b>.${e.discordServer ? ` Discord: <b>${esc(e.discordServer)}</b>.` : ""}`;
    $("badges").innerHTML = (e.badges || []).map(b => `<span class="p-badge" title="Won ${esc(b.title)}${b.shared ? " (shared)" : ""}">Winner · ${esc(b.title)}</span>`).join("");
    // The hero shows the first few stats as plain numbers; the full record is below.
    const top = card.stats.filter(st => !wide(st) && st.value !== null).slice(0, 4);
    $("topStats").innerHTML = top.map(st => `<div><small>${esc(st.label)}</small><b>${esc(statText ? statText(st) : String(st.value))}</b></div>`).join("");
    $("ver").innerHTML = top.length ? `<span class="pos">✓ ${top.some(st => st.verification === "self-reported") ? "Verified and self-reported" : "Verified by Kalshi"}</span> · shown because the owner made them public · not financial advice` : "";
    $("actions").innerHTML = [
      e.shopUrl ? `<a class="w-join" href="${esc(e.shopUrl)}" target="_blank" rel="sponsored noopener">Get ${esc(e.name)} →</a>` : "",
      e.streamUrl ? `<a class="w-btn" href="${esc(e.streamUrl)}" target="_blank" rel="noopener">Watch the stream ↗</a>` : "",
      `<a class="w-btn" href="world#hall">See it in the Grand Hall</a>`,
    ].join("");
    $("quote").hidden = !e.tagline;
    $("tagline").textContent = e.tagline ? `“${e.tagline}”` : "";
    $("tagBy").textContent = `${e.name}'s tagline`;
    $("hudTL").innerHTML = `${esc(kindName(e.kind).toUpperCase())} · D3MON ENTRANT<br><b>${esc(e.name.toUpperCase())}</b>`;
    $("hudBR").innerHTML = `ACTIVE SINCE <b>· ${esc(when(e.approvedAt).toUpperCase())}</b><br>BATTLES <b>· ${(e.battles || []).length}</b><br>WINS <b>· ${(e.badges || []).length}</b>`;
    $("allStats").innerHTML = card.stats.length ? card.stats.map(st => `<div class="stat ${wide(st) ? "wide" : ""}"><div class="sl">${esc(st.label)} ${verifTag(st)}</div><div>${statValue(st)}</div>${st.description ? `<div class="tag">${esc(st.description)}</div>` : ""}</div>`).join("")
      : `<p class="empty">The owner hasn't made any stats public yet.</p>`;
    $("calls").innerHTML = calls.length ? calls.map(c => `<li><time>${esc(time(c.round))}</time><span>${c.sealed ? '<span class="w-seal">sealed until the close</span>' : c.direction === "up" ? '<b class="up">▲ Up</b>' : '<b class="dn">▼ Down</b>'}${c.price ? ` <span class="w-paid">@${Math.round(c.price.paid * 100)}¢</span>` : ""}</span>
        <span>${c.correct === true ? '<b class="up">Right</b>' : c.correct === false ? '<b class="dn">Wrong</b>' : '<span class="w-k">waiting</span>'}${c.verification ? ` <span class="w-k">${esc(c.verification)}</span>` : ""}</span></li>`).join("")
      : `<li class="w-empty">No calls yet.</li>`;
    drawEmblem(e.kind);
  }

  (async () => {
    const me = await session().catch(() => null);
    if (me) { $("acctBtn").textContent = me.name || me.username || "Account"; }
    if (!slug) { $("msg").textContent = "No one chosen. Open a profile from the Grand Hall or the Helix."; return; }
    try { await load(); } catch (e) { $("msg").textContent = e.message; }
    let t = null;
    addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 300); });
  })();
})();
