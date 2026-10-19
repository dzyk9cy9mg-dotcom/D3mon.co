// /displays: HardSmoke sets up display slots (which bots, which stats, layout, order) and previews them
// with the same widget pages use, and puts a video on the Grand Hall's screen. Thin client over GET /api/v1/display-slots,
// PUT /api/v1/display-slots/:key, /api/v1/entrants, /api/v1/battles and /api/v1/hall/video.
(function () {
  "use strict";
  const { api, esc, kindName, session } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { data: null, entrants: [], battles: [], editing: null, pickE: [], pickS: [] };
  const MODE_TEXT = { specific: "one entrant", list: "a list", battle: "a battle's lineup", page: "the entrant the page names" };

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }
  const statLabel = k => (S.data.stats.find(s => s.key === k) || { label: k }).label;
  const entName = id => (S.entrants.find(e => e.id === id) || { name: id }).name;
  const battleText = b => b === "current" ? "the battle on the main page (or a live one)" : b === "page" ? "the battle the page names" : (S.battles.find(x => x.id === b) || { title: b }).title;

  function renderList() {
    $("slots").innerHTML = S.data.slots.length ? S.data.slots.map(s => `<div class="item"><div class="top"><span class="st ${s.status === "on" ? "approved" : "rejected"}">${esc(s.status)}</span><b>${esc(s.name)}</b><code>${esc(s.key)}</code>
        <button class="btn ghost sm" type="button" data-edit="${esc(s.key)}" style="margin-left:auto">Edit</button></div>
      <div class="meta">${esc(s.layout)} · ${esc(MODE_TEXT[s.bots.mode])}${s.bots.mode === "battle" ? `: ${esc(battleText(s.bots.battle))}` : s.bots.entrants ? `: ${esc(s.bots.entrants.map(entName).join(", "))}` : ""} · ${s.stats.map(k => esc(statLabel(k))).join(", ")}</div></div>`).join("")
      : `<p class="empty">No slots yet.</p>`;
  }

  // A checklist where ticked items also appear, in order, in a row with ↑↓ and ✕.
  function picker(el, groups, chosen, labelOf, name) {
    el.innerHTML = `<div class="dsp-chosen">${chosen.length ? chosen.map((k, i) => `<span>${i + 1}. ${esc(labelOf(k))} <button type="button" data-mv="${name}|${i}|-1" aria-label="Move up">↑</button><button type="button" data-mv="${name}|${i}|1" aria-label="Move down">↓</button><button type="button" data-rm="${name}|${i}" aria-label="Remove">✕</button></span>`).join("") : `<span class="tag" style="border:0">Nothing picked yet.</span>`}</div>
      ${groups.map(g => `${g.name ? `<div class="dsp-cat">${esc(g.name)}</div>` : ""}${g.items.map(it => `<label><input type="checkbox" data-pick="${name}" value="${esc(it.key)}" ${chosen.includes(it.key) ? "checked" : ""}> ${esc(it.label)}${it.sub ? ` <span class="tag">${esc(it.sub)}</span>` : ""}</label>`).join("")}`).join("")}`;
  }

  function renderEditor() {
    const mode = $("fMode").value;
    $("entrantField").hidden = !(mode === "specific" || mode === "list");
    $("battleField").hidden = mode !== "battle";
    picker($("entrants"), [{ items: S.entrants.map(e => ({ key: e.id, label: e.name, sub: `${kindName(e.kind)}${e.status !== "active" ? ` · ${e.status}` : ""}` })) }], S.pickE, entName, "e");
    const groups = [];
    for (const s of S.data.stats) { let g = groups.find(x => x.name === s.category); if (!g) groups.push(g = { name: s.category, items: [] }); g.items.push({ key: s.key, label: s.label, sub: s.source === "verified" ? "verified" : "" }); }
    picker($("stats"), groups, S.pickS, statLabel, "s");
  }

  function snippet(key) {
    const extra = $("fMode").value === "page" ? ` data-entrant="BOT-SLUG"` : $("fMode").value === "battle" && $("fBattle").value === "page" ? ` data-battle="BATTLE-ID"` : "";
    $("snippet").textContent = `<div data-d3mon-display="${key || "your-key"}"${extra}></div>\n<script src="js/d3mon-widget.js"></script>\n\nOr from any front end: GET /api/v1/displays/${key || "your-key"}`;
  }

  // The preview is the real widget, so it shows exactly what the page will.
  function preview(key) {
    const mode = $("fMode").value;
    const ctl = mode === "page" ? `<div class="field" style="flex:0 1 260px"><label for="pvE">Preview as the page for</label><select id="pvE">${S.entrants.filter(e => e.status === "active").map(e => `<option value="${esc(e.slug)}">${esc(e.name)}</option>`).join("")}</select></div>`
      : mode === "battle" && $("fBattle").value === "page" ? `<div class="field" style="flex:0 1 260px"><label for="pvB">Preview with battle</label><select id="pvB">${S.battles.map(b => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("")}</select></div>` : "";
    $("previewCtl").innerHTML = ctl;
    const attrs = mode === "page" && $("pvE") ? ` data-entrant="${esc($("pvE").value)}"` : $("pvB") ? ` data-battle="${esc($("pvB").value)}"` : "";
    $("preview").innerHTML = key ? `<div data-d3mon-display="${esc(key)}"${attrs}></div>` : `<p class="tag">Save to see a preview.</p>`;
    const el = $("preview").firstElementChild;
    if (key && el) window.D3monWidget.mount(el);
  }

  function open(s) {
    S.editing = s ? s.key : null;
    $("editTitle").textContent = s ? `Edit "${s.name}"` : "New slot";
    $("fKey").value = s ? s.key : ""; $("fKey").disabled = !!s;
    $("fName").value = s ? s.name : ""; $("fTitle").value = s ? s.title || "" : "";
    $("fStatus").value = s ? s.status : "on"; $("fLayout").value = s ? s.layout : "card";
    $("fOrder").value = s ? s.order : "listed"; $("fLimit").value = s ? s.limit : 6;
    $("fMode").value = s ? s.bots.mode : "specific";
    $("fBattle").innerHTML = `<option value="current">The battle on the main page (or a live one)</option><option value="page">The battle the page names</option>${S.battles.map(b => `<option value="${esc(b.id)}">${esc(b.title)} (${esc(b.state || b.status)})</option>`).join("")}`;
    $("fBattle").value = s && s.bots.battle ? s.bots.battle : "current";
    S.pickE = s && s.bots.entrants ? [...s.bots.entrants] : [];
    S.pickS = s ? [...s.stats] : [];
    renderEditor();
    snippet(S.editing);
    preview(S.editing);
    $("editBox").hidden = false;
    $("editBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function load() {
    const [d, e, b] = await Promise.all([api("GET", "display-slots"), api("GET", "entrants"), api("GET", "battles")]);
    Object.assign(S, { data: d, entrants: e.entrants, battles: b.battles.filter(x => x.status !== "draft") });
    renderList();
  }

  document.addEventListener("change", ev => {
    const t = ev.target;
    if (t.dataset.pick) {
      const list = t.dataset.pick === "e" ? S.pickE : S.pickS;
      if (t.checked) {
        if (t.dataset.pick === "e" && $("fMode").value === "specific") list.splice(0, list.length);
        if (t.dataset.pick === "s" && list.length >= 12) { t.checked = false; return msg("Up to 12 stats per slot."); }
        list.push(t.value);
      } else list.splice(list.indexOf(t.value), 1);
      renderEditor();
      return;
    }
    if (t.id === "fMode") { if (t.value === "specific") S.pickE = S.pickE.slice(0, 1); renderEditor(); snippet(S.editing); preview(S.editing); }
    if (t.id === "fBattle") { snippet(S.editing); preview(S.editing); }
    if (t.id === "pvE" || t.id === "pvB") { const el = $("preview").firstElementChild; if (el) el.setAttribute(t.id === "pvE" ? "data-entrant" : "data-battle", t.value); }
  });
  $("fKey").addEventListener("input", () => snippet($("fKey").value.trim()));

  document.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "newSlot") return open(null);
    if (b.id === "cancel") { $("editBox").hidden = true; return; }
    if (b.dataset.edit) return open(S.data.slots.find(s => s.key === b.dataset.edit));
    if (b.dataset.mv) {
      const [n, i, d] = b.dataset.mv.split("|").map((x, j) => (j ? +x : x)), list = n === "e" ? S.pickE : S.pickS, k = i + d;
      if (k >= 0 && k < list.length) [list[i], list[k]] = [list[k], list[i]];
      return renderEditor();
    }
    if (b.dataset.rm) { const [n, i] = b.dataset.rm.split("|"); (n === "e" ? S.pickE : S.pickS).splice(+i, 1); return renderEditor(); }
  });

  $("form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const key = S.editing || $("fKey").value.trim(), mode = $("fMode").value;
    const bots = { mode };
    if (mode === "specific" || mode === "list") bots.entrants = S.pickE;
    if (mode === "battle") bots.battle = $("fBattle").value;
    const body = { name: $("fName").value.trim(), title: $("fTitle").value.trim(), status: $("fStatus").value, layout: $("fLayout").value, order: $("fOrder").value, limit: +$("fLimit").value, bots, stats: S.pickS };
    try {
      await api("PUT", `display-slots/${encodeURIComponent(key)}`, body);
      msg(`Saved "${body.name}". Pages showing "${key}" update straight away.`, true);
      await load();
      S.editing = key; $("fKey").disabled = true;
      snippet(key); preview(key);
    } catch (x) { msg(x.message); }
  });

  // ---------- the Grand Hall's video (GET/PUT/DELETE /api/v1/hall/video) ----------
  function renderVideo(v) {
    $("videoNow").innerHTML = v ? `On the screen now: <b>${esc(v.title || "(no title)")}</b> · ${esc(v.kind === "short" ? "Short" : v.kind === "live" ? "live stream" : "video")} · <a href="${esc(v.watch)}" target="_blank" rel="noopener">open on YouTube ↗</a>` : "Nothing on the screen.";
    $("vClear").disabled = !v;
  }
  $("videoForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    try {
      const { video } = await api("PUT", "hall/video", { url: $("vUrl").value.trim(), title: $("vTitle").value.trim() });
      renderVideo(video); $("vUrl").value = ""; msg("The hall's screen shows it now.", true);
    } catch (x) { msg(x.message); }
  });
  $("vClear").addEventListener("click", async () => {
    try { renderVideo((await api("DELETE", "hall/video")).video); msg("Taken down.", true); } catch (x) { msg(x.message); }
  });

  (async () => {
    const me = await session();
    if (!me || (me.role !== "admin" && me.role !== "owner")) { $("denied").hidden = false; return; }
    try { await load(); $("listBox").hidden = false; } catch (x) { msg(x.message); }
    try { renderVideo((await api("GET", "hall/video")).video); $("videoAdmin").hidden = false; } catch (x) { msg(x.message); }
  })();
})();
