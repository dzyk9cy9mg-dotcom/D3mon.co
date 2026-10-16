// The display widget (Stats Hub phase 3). A page shows a display slot by name and nothing else:
//
//   <div data-d3mon-display="battle-sidebar"></div>
//   <script src="js/d3mon-widget.js"></script>
//
// Optional: data-entrant="<slug>" for slots that show "the entrant the page names" (a profile page),
// and data-battle="<id>" for slots that show "the battle the page names" (/board's selected battle).
// Changing either attribute redraws the widget. What to show (bots, stats, layout, order) is set by
// HardSmoke on /displays; the server applies each owner's privacy for this reader. It loads js/arena.js
// itself if the page hasn't, and updates live from the slot's, the stat list's and each entrant's feed.
(function () {
  "use strict";
  const ME = document.currentScript && document.currentScript.src;

  function withArena(then) {
    if (window.Arena) return then();
    let s = document.querySelector("script[data-d3mon-arena]");
    if (!s) {
      s = document.createElement("script");
      s.src = ME ? new URL("arena.js", ME).href : "js/arena.js";
      s.dataset.d3monArena = "";
      document.head.appendChild(s);
    }
    s.addEventListener("load", then, { once: true });
  }

  const SCALAR = new Set(["percent", "return", "money", "number", "integer", "duration"]);

  function render(root, d) {
    const { esc, statValue, statText, verifTag, wide, kindName } = window.Arena;
    const cols = d.columns, has = e => cols.some(c => e.values[c.key]);
    const shown = d.entrants.filter(has);
    const head = d.slot.title ? `<h3 class="d3w-title">${esc(d.slot.title)}${d.battle ? ` <span class="tag">${esc(d.battle.title)}</span>` : ""}</h3>` : "";
    if (!shown.length) {
      root.innerHTML = `${head}<p class="empty">${esc(d.note || (d.entrants.length ? "Nothing shared yet: owners choose which stats are shown." : "Nobody to show yet."))}</p>`;
      return;
    }
    const tag = st => `${verifTag(st)}`;
    // A verified and a self-reported stat can share a name ("Win rate"), so headings say which is which.
    const src = c => `<span class="tag d3w-src">${c.source === "verified" ? "verified" : "self-reported"}</span>`;
    let body = "";
    switch (d.slot.layout) {
      case "row":
        body = `<div class="tablewrap"><table class="mgrid d3w-row"><thead><tr><th>${d.battle ? "Lineup" : "Entrant"}</th>${cols.map(c => `<th>${esc(c.label)}<br>${src(c)}</th>`).join("")}</tr></thead>
          <tbody>${shown.map(e => `<tr><td><a href="card?e=${encodeURIComponent(e.slug)}"><b>${esc(e.name)}</b></a> <span class="tag">${esc(kindName(e.kind))}</span></td>${cols.map(c => {
            const st = e.values[c.key];
            return st ? `<td title="${esc(st.verification)}${st.asOf ? ` · ${esc(new Date(st.asOf).toLocaleString())}` : ""}">${esc(statText(st))}</td>` : `<td class="tag">–</td>`;
          }).join("")}</tr>`).join("")}</tbody></table></div>`;
        break;
      case "ticker": {
        const items = shown.map(e => `<span class="d3w-item"><b>${esc(e.name)}</b> ${cols.filter(c => e.values[c.key]).map(c => `${esc(e.values[c.key].label || c.label)}${c.source === "verified" ? " ✓" : "*"} <em>${esc(statText(e.values[c.key]))}</em>`).join(" · ")}</span>`).join("") + `<span class="d3w-item tag">✓ verified · * self-reported</span>`;
        body = `<div class="d3w-ticker" aria-label="${esc(d.slot.name)}"><div class="d3w-track">${items}${items}</div></div>`;
        break;
      }
      case "chart":
        body = cols.map(c => {
          const rows = shown.filter(e => e.values[c.key]);
          if (!rows.length) return "";
          if (SCALAR.has(c.type)) {
            const vals = rows.map(e => e.values[c.key].value), top = Math.max(...vals.map(v => Math.abs(v))) || 1;
            const w = v => Math.max(2, Math.round((c.type === "percent" ? Math.min(1, Math.abs(v)) : Math.abs(v) / top) * 100));
            return `<div class="d3w-chart"><div class="sl">${esc(c.label)} ${src(c)}</div>${rows.map(e => { const st = e.values[c.key]; return `<div class="d3w-bar"><span>${esc(e.name)}</span><i class="${st.value < 0 ? "neg" : ""}" style="width:${w(st.value)}%"></i><b>${esc(statText(st))}</b>${tag(st)}</div>`; }).join("")}</div>`;
          }
          return `<div class="d3w-chart"><div class="sl">${esc(c.label)} ${src(c)}</div>${rows.map(e => `<div class="stat"><div class="sl">${esc(e.name)} ${tag(e.values[c.key])}</div>${statValue(e.values[c.key])}</div>`).join("")}</div>`;
        }).join("");
        break;
      default: // card
        body = `<div class="d3w-cards">${shown.map(e => `<div class="d3w-card"><a class="d3w-name" href="card?e=${encodeURIComponent(e.slug)}">${esc(e.name)}</a> <span class="tag">${esc(kindName(e.kind))} by ${esc(e.creatorName)}</span>
          <div class="statgrid">${cols.filter(c => e.values[c.key]).map(c => { const st = e.values[c.key]; return `<div class="stat ${wide(st) ? "wide" : ""}"><div class="sl">${esc(st.label || c.label)} ${tag(st)}</div><div>${statValue(st)}</div></div>`; }).join("")}</div></div>`).join("")}</div>`;
    }
    root.innerHTML = `${head}${body}`;
  }

  function mount(root) {
    if (root.__d3w) return root.__d3w;
    const key = root.dataset.d3monDisplay;
    root.classList.add("arena", "d3w");
    const w = { es: null, topics: "", timer: null };
    async function load() {
      const q = new URLSearchParams();
      if (root.dataset.entrant) q.set("e", root.dataset.entrant);
      if (root.dataset.battle) q.set("battle", root.dataset.battle);
      try {
        const d = await window.Arena.api("GET", `displays/${encodeURIComponent(key)}${q.toString() ? `?${q}` : ""}`);
        root.dataset.layout = d.slot.layout;
        render(root, d);
        const topics = [`display:${key}`, "catalog", ...d.entrants.map(e => `entrant:${e.id}`)].slice(0, 20);
        if (topics.join() !== w.topics) {
          if (w.es) w.es.close();
          w.topics = topics.join();
          w.es = window.Arena.follow(topics, () => { clearTimeout(w.timer); w.timer = setTimeout(load, 400); });
        }
      } catch (e) { root.innerHTML = `<p class="empty">${window.Arena.esc(e.message)}</p>`; }
    }
    new MutationObserver(load).observe(root, { attributes: true, attributeFilter: ["data-entrant", "data-battle"] });
    w.load = load;
    root.__d3w = w;
    load();
    return w;
  }

  function mountAll() { document.querySelectorAll("[data-d3mon-display]").forEach(mount); }
  window.D3monWidget = { mount: el => withArena(() => mount(el)), mountAll: () => withArena(mountAll) };
  withArena(() => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mountAll) : mountAll()));
})();
