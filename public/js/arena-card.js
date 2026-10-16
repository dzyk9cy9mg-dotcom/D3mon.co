// /card?e=<slug>: one entrant's stats card, exactly as the server builds it for this reader. Every stat
// on it was sent by the owner's bot ("self-reported"). Hidden and private stats never reach the page. Thin client over GET /api/v1/entrants/:slug/card.
(function () {
  "use strict";
  const { api, follow, esc, kindName, statValue, verifTag, wide } = window.Arena;
  const $ = id => document.getElementById(id);
  const slug = new URLSearchParams(location.search).get("e") || "";

  async function load() {
    const c = await api("GET", `entrants/${encodeURIComponent(slug)}/card`);
    document.title = `${c.entrant.name} · Stats card · D3MON.CO`;
    $("name").textContent = c.entrant.name;
    $("sub").textContent = `${kindName(c.entrant.kind)} by ${c.entrant.creatorName}${c.viewer === "owner" ? " · you're seeing your own card, private stats included" : ""}`;
    $("stats").innerHTML = c.stats.length ? c.stats.map(st => `<div class="stat ${wide(st) ? "wide" : ""}">
        <div class="sl">${esc(st.label)} ${verifTag(st)}${st.visibility && st.visibility !== "public" ? ` <span class="tag">${esc(st.visibility)}</span>` : ""}</div>
        <div>${statValue(st)}</div>
        ${st.description ? `<div class="tag">${esc(st.description)}</div>` : ""}</div>`).join("")
      : `<p class="empty">Nothing to show yet. The owner hasn't shared any stats.</p>`;
    $("cardBox").hidden = false;
    return c;
  }

  (async () => {
    if (!slug) { $("msg").textContent = "No entrant chosen. Open a card from a bot's page."; return; }
    try {
      const c = await load();
      let t = null;
      follow([`entrant:${c.entrant.id}`, "catalog"], type => { if (type !== "stats.updated" && type !== "catalog.updated") return; clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 300); },
        on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
    } catch (e) { $("msg").textContent = e.message; }
  })();
})();
