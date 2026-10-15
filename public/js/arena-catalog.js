// /catalog: HardSmoke's stat list. Add stats, edit their label, group, type, format, unit, description
// and order, and retire or restore them. Thin client over GET/PUT /api/v1/stat-catalog and the
// "catalog" live topic; the server checks every rule (types locked once values exist, formats per type).
(function () {
  "use strict";
  const { api, follow, esc, session } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { cat: null, edits: {} };

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }
  const formatsFor = type => S.cat.types[type].formats;
  const opts = (list, cur, label = x => x) => list.map(v => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label(v))}</option>`).join("");
  const fmtLabel = f => `${f} – ${S.cat.formats[f]}`;
  // A stat as it would be saved: the server's copy with this page's unsaved edits on top.
  const current = s => ({ ...s, ...(S.edits[s.key] || {}) });

  function render() {
    const fc = $("fCat").value, ft = $("fText").value.trim().toLowerCase(), showRetired = $("fRetired").checked;
    const cats = [...new Set(S.cat.stats.map(s => s.category))];
    $("fCat").innerHTML = `<option value="">All groups</option>${opts(cats, fc)}`;
    $("cats").innerHTML = cats.map(c => `<option value="${esc(c)}">`).join("");
    const shown = S.cat.stats.filter(s => (showRetired || !s.retired) && (!fc || s.category === fc) && (!ft || s.key.includes(ft) || s.label.toLowerCase().includes(ft)));
    const active = S.cat.stats.filter(s => !s.retired).length;
    $("count").textContent = `${active} active${S.cat.stats.length > active ? ` · ${S.cat.stats.length - active} retired` : ""}`;
    $("rows").innerHTML = shown.length ? shown.map(s0 => {
      const s = current(s0), k = esc(s.key), dirty = S.edits[s.key] ? " dirty" : "";
      return `<tr class="${s.retired ? "retired" : ""}${dirty}">
        <td style="white-space:nowrap"><code>${k}</code></td>
        <td style="min-width:220px"><input data-f="${k}|label" maxlength="40" value="${esc(s.label)}" aria-label="Label for ${k}">
          <input data-f="${k}|description" maxlength="160" value="${esc(s.description)}" placeholder="no description" class="desc" aria-label="Description for ${k}"></td>
        <td><input data-f="${k}|category" maxlength="24" list="cats" value="${esc(s.category)}" aria-label="Group for ${k}" style="min-width:120px"></td>
        <td><select data-f="${k}|type" aria-label="Type of ${k}" style="min-width:110px" ${s0.locked ? "disabled title=\"Bots have sent values, so the type is locked\"" : ""}>${opts(Object.keys(S.cat.types), s.type)}</select>${s0.locked ? `<div class="tag">locked</div>` : ""}</td>
        <td><select data-f="${k}|format" aria-label="Format of ${k}">${opts(formatsFor(s.type), formatsFor(s.type).includes(s.format) ? s.format : formatsFor(s.type)[0], fmtLabel)}</select></td>
        <td><input data-f="${k}|unit" maxlength="12" value="${esc(s.unit)}" aria-label="Unit for ${k}" style="width:70px"></td>
        <td><input type="number" min="0" max="9999" data-f="${k}|order" value="${s.order}" aria-label="Order of ${k}" style="width:80px"></td>
        <td>${s.retired ? `<span class="st rejected">retired</span>` : `<span class="st approved">active</span>`}
          <button class="btn ghost sm" type="button" data-retire="${k}|${s.retired ? "0" : "1"}">${s.retired ? "Restore" : "Retire"}</button></td></tr>`;
    }).join("") : `<tr><td colspan="8" class="empty">No stats match.</td></tr>`;
    showDirty();
  }
  function showDirty() {
    const n = Object.keys(S.edits).length;
    $("dirty").textContent = n ? `${n} stat${n === 1 ? "" : "s"} changed, not saved yet` : "";
  }

  function addFormats() {
    const t = $("aType").value;
    $("aFormat").innerHTML = opts(formatsFor(t), formatsFor(t)[0], fmtLabel);
    $("typeHelp").textContent = `A ${t} value is ${S.cat.types[t].value}.`;
  }

  async function load() {
    S.cat = await api("GET", "stat-catalog");
    if (!$("aType").options.length) { $("aType").innerHTML = opts(Object.keys(S.cat.types), "number"); addFormats(); }
    render();
  }

  // Records an edit, keeping only what differs from the saved stat.
  function edit(key, field, value) {
    const s = S.cat.stats.find(x => x.key === key);
    const e = { ...(S.edits[key] || {}), [field]: value };
    if (field === "type" && !formatsFor(value).includes(current(s).format)) e.format = formatsFor(value)[0];
    for (const f of Object.keys(e)) if (e[f] === s[f]) delete e[f];
    if (Object.keys(e).length) S.edits[key] = e; else delete S.edits[key];
  }

  document.addEventListener("change", ev => {
    const f = ev.target.dataset && ev.target.dataset.f;
    if (f) {
      const [key, field] = f.split("|");
      edit(key, field, field === "order" ? Number(ev.target.value) : ev.target.value);
      ev.target.closest("tr").classList.toggle("dirty", !!S.edits[key]);
      if (field === "type") render(); else showDirty(); // a full redraw would move the cursor away
      return;
    }
    if (ev.target.id === "aType") addFormats();
    if (["fCat", "fRetired"].includes(ev.target.id)) render();
  });
  $("fText").addEventListener("input", render);

  async function save(stats, done) {
    try { S.cat = await api("PUT", "stat-catalog", { stats }); for (const k of Object.keys(stats)) delete S.edits[k]; msg(done, true); render(); return true; }
    catch (e) { msg(e.message); return false; }
  }

  document.addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "save") {
      if (!Object.keys(S.edits).length) return msg("Nothing to save.");
      return save({ ...S.edits }, "Saved. Cards and bots use the new list straight away.");
    }
    if (b.dataset.retire) {
      const [key, on] = b.dataset.retire.split("|");
      if (on === "1" && !confirm(`Retire "${key}"? It comes off every card and bots can't send it any more. Its history is kept, and Restore brings it back.`)) return;
      return save({ [key]: { retired: on === "1" } }, on === "1" ? `Retired "${key}". Its history is kept.` : `Restored "${key}".`);
    }
  });

  $("addForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = ev.target.elements, v = n => f[n].value.trim();
    const def = { label: v("label"), category: v("category"), type: v("type"), format: v("format") };
    if (v("unit")) def.unit = v("unit");
    if (v("description")) def.description = v("description");
    if (S.cat.stats.some(s => s.key === v("key"))) return msg(`"${v("key")}" is already in the list. Edit it above instead.`);
    if (await save({ [v("key")]: def }, `Added "${v("key")}". Bots can send it now, and owners choose who sees it.`)) ev.target.reset(), addFormats();
  });

  window.addEventListener("beforeunload", e => { if (Object.keys(S.edits).length) e.preventDefault(); });

  (async () => {
    const me = await session();
    if (!me || (me.role !== "admin" && me.role !== "owner")) { $("denied").hidden = false; return; }
    try {
      await load();
      $("listBox").hidden = $("addBox").hidden = false;
      // Another admin's change: refetch, keeping this page's unsaved edits on top.
      follow(["catalog"], type => { if (type === "catalog.updated") load().catch(() => {}); },
        on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
    } catch (e) { msg(e.message); }
  })();
})();
