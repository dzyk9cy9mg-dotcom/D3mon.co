// /my: an owner's approved entrants. Bots and scripts: API keys (made, shown once, revoked), how to
// send calls and stats, and who sees each stat on the card. Callers: Up/Down buttons for the next round, locked by the server at the round's start.
// Thin client over /api/v1 (entrants, keys, calls, clock) and the live feed.
(function () {
  "use strict";
  const { api, follow, esc, when, kindName, session, syncClock, serverNow, nextRound, openRound, mmss, statValue, verifTag } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { entrants: [], keys: {}, calls: {}, stats: {}, tour: {}, token: null, busy: false };
  const SHOWS = { hidden: "Hidden", private: "Private (only you)", members: "Members only", public: "Public" };

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }
  const fmtTime = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dirText = d => d === "up" ? "▲ Up" : d === "down" ? "▼ Down" : "";
  const callFor = (id, round) => (S.calls[id] || []).find(c => c.round === round) || null;

  function callsTable(e) {
    const list = (S.calls[e.id] || []).slice(0, 12);
    if (!list.length) return `<p class="empty">No calls yet.</p>`;
    return `<div class="tablewrap"><table class="mgrid"><thead><tr><th>Round</th><th>Call</th><th>Sent</th><th>Result</th></tr></thead><tbody>${list.map(c => {
      const res = c.result ? `${dirText(c.result)} · ${c.correct ? "✓ right" : "✗ wrong"} <span class="tag">${esc(c.verification)}</span>` : c.locked ? `<span class="tag">waiting for the result</span>` : `<span class="tag">sealed until ${esc(fmtTime(c.locksAt || c.round))}</span>`;
      return `<tr><td>${esc(when(c.round))}</td><td>${esc(dirText(c.direction))}</td><td>${esc(new Date(c.receivedAt).toLocaleTimeString())}${c.via === "button" ? "" : ' <span class="tag">bot key</span>'}</td><td>${res}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function callerBox(e) {
    const { round, closesAt, open } = openRound(), mine = callFor(e.id, round);
    return `<div class="callbox">
      <div class="meta">${open ? "Round" : "Next round"} <b>${esc(fmtTime(round))}–${esc(fmtTime(round + 15 * 60000))}</b> · calls close in <b class="lock" data-lock="${closesAt}">${mmss(closesAt - serverNow())}</b></div>
      <div class="bigcall seg2" role="group" aria-label="Your call for this round">
        <button type="button" class="up" data-callbtn="${esc(e.id)}|up|${round}" aria-pressed="${mine?.direction === "up"}" ${mine ? "disabled" : ""}>▲ UP</button>
        <button type="button" class="down" data-callbtn="${esc(e.id)}|down|${round}" aria-pressed="${mine?.direction === "down"}" ${mine ? "disabled" : ""}>▼ DOWN</button>
      </div>
      <div class="meta">${mine ? `Your call: <b>${dirText(mine.direction)}</b>, sent ${esc(new Date(mine.receivedAt).toLocaleTimeString())}. It's final: one call per round. Others see that you've called, but not which way, until the calls close.` : "No call yet for this round. One call per round, and it's final."}</div>
    </div>`;
  }

  function keysBox(e) {
    const ks = S.keys[e.id] || [], base = new URL("api/v1/bot/calls", location.href).href;
    const fresh = S.token && S.token.entrantId === e.id ? `<div class="item keynew"><b>Your new key. Copy it now: it won't be shown again.</b>
        <code id="tokenText">${esc(S.token.token)}</code>
        <div class="actions"><button class="btn sm" type="button" data-copy>Copy key</button><button class="btn ghost sm" type="button" data-hidetoken>I've saved it</button></div></div>` : "";
    return `<h3 class="sub">API keys</h3>${fresh}
      <div class="list">${ks.length ? ks.map(k => `<div class="item"><div class="top"><span class="st ${k.active ? "approved" : "rejected"}">${k.active ? "active" : "revoked"}</span><code>${esc(k.preview)}</code><span class="meta">${esc(k.label || "no label")} · made ${esc(when(k.createdAt))}${k.lastUsedAt ? ` · last used ${esc(when(k.lastUsedAt))}` : " · never used"}</span>
        ${k.active ? `<button class="btn ghost sm" type="button" data-revoke="${esc(e.id)}|${esc(k.id)}" style="margin-left:auto">Revoke</button>` : ""}</div></div>`).join("") : `<p class="empty">No keys yet.</p>`}</div>
      <form class="row" data-newkey="${esc(e.id)}" style="margin-top:10px"><div class="field"><label for="kl-${esc(e.id)}">Label (optional)</label><input id="kl-${esc(e.id)}" maxlength="40" placeholder="e.g. production server"></div><button class="btn" type="submit">Make a new key</button></form>
      <details style="margin-top:12px"><summary class="tag">How to send a call</summary>
        <p class="tag">Send one call per round, during the round, any time until it ends, unless the battle closes calls earlier. It's final. Leave out "round" to call the round that's open now.</p>
        <pre class="code">curl -X POST ${esc(base)} \\
  -H "Authorization: Bearer d3b_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"schema":"d3mon.call/v1","market":"KXBTC15M","direction":"up"}'</pre>
      </details>`;
  }

  // The "Join tournaments" switch. It counts from the next round; leaving keeps the rounds already played.
  function tourBox(e) {
    const t = S.tour[e.id];
    if (!t || !t.eligible) return "";
    if (t.removed) return `<h3 class="sub">Tournaments</h3><div class="callbox"><div class="meta"><b>Removed by an admin</b>${t.removal && t.removal.reason ? `: ${esc(t.removal.reason)}` : ""}. Your bot's calls don't count in the tournaments until an admin restores it. Ask an admin about it.</div></div>`;
    const pending = t.on !== t.playingNow;
    const state = t.on ? (pending ? `Joined. Counts from the round at <b>${esc(fmtTime(t.from))}</b>.` : "<b>In the tournaments.</b> Your bot's calls count every round.")
      : (pending ? `Leaving at <b>${esc(fmtTime(t.from))}</b>. Rounds already played still count.` : "Not in the tournaments.");
    return `<h3 class="sub">Tournaments</h3>
      <div class="callbox"><div class="meta">Hourly, daily, weekly and monthly tournaments run all the time, scored by Kalshi. ${state}</div>
      <div class="actions"><button class="btn${t.on ? " ghost" : ""} sm" type="button" data-tour="${esc(e.id)}|${t.on ? "off" : "on"}">${t.on ? "Leave tournaments" : "Join tournaments"}</button></div>
      <div class="meta">For entertainment. Not financial advice. D3MON never trades.</div></div>`;
  }

  // The owner's stat settings: who sees each stat, and its label, description and order. Grouped as in
  // HardSmoke's stat list, with the owner's custom stats last.
  function statsBox(e) {
    const st = S.stats[e.id];
    if (!st) return "";
    const caller = e.kind === "caller";
    // A bot or script with no calls yet has nothing verified to show: one line instead of 18 empty rows.
    const noCalls = !caller && st.stats.some(x => x.key === "v_calls" && x.value === null);
    const groups = [];
    for (const x of st.stats) {
      if (noCalls && x.source === "verified") continue;
      let g = groups.find(g => g.name === x.category);
      if (!g) groups.push(g = { name: x.category, list: [] });
      g.list.push(x);
    }
    const row = x => `<tr>
        <td><input data-st="${esc(e.id)}|${esc(x.key)}|label" maxlength="40" value="${esc(x.label === x.defaultLabel ? "" : x.label)}" placeholder="${esc(x.defaultLabel)}" aria-label="Label for ${esc(x.defaultLabel)}">
          <input data-st="${esc(e.id)}|${esc(x.key)}|description" maxlength="160" value="${esc(x.description === x.defaultDescription ? "" : x.description)}" placeholder="${esc(x.defaultDescription)}" aria-label="Description for ${esc(x.defaultLabel)}" class="desc">
          <div class="tag"><code>${esc(x.key)}</code> · ${esc(x.type)}${x.source === "custom" ? ` · custom <button class="btn ghost sm" type="button" data-rmstat="${esc(e.id)}|${esc(x.key)}">Remove</button>` : ""}</div></td>
        <td><select data-st="${esc(e.id)}|${esc(x.key)}|visibility" data-group="${esc(x.category)}" aria-label="Who sees ${esc(x.defaultLabel)}">${Object.entries(SHOWS).map(([v, t]) => `<option value="${v}" ${v === x.visibility ? "selected" : ""}>${t}</option>`).join("")}</select></td>
        <td><input type="number" min="0" max="9999" data-st="${esc(e.id)}|${esc(x.key)}|order" value="${x.order}" aria-label="Order for ${esc(x.defaultLabel)}" style="width:80px"></td>
        <td>${statValue(x)} ${verifTag(x)}${x.source === "verified" ? "" : x.asOf ? `<div class="tag">${x.via === "owner" ? "typed in" : "sent"} ${esc(when(Date.parse(x.asOf)))}</div>` : `<div class="tag">no value yet</div>`}</td>
        ${caller ? "" : `<td>${x.source === "verified" ? `<span class="tag">from your calls</span>` : valueInput(e, x)}</td>`}</tr>`;
    const cols = caller ? 4 : 5;
    return `<h3 class="sub">Stats card</h3>
      <p class="tag">${caller ? `Your stats are worked out by D3MON.CO from your calls and Kalshi's results, so they're "verified".` : `"Verified" stats are worked out by D3MON.CO from your calls. The rest are self-reported: your bot sends them with its key, or you type them in below and click Save values.`} Every stat starts hidden: choose who sees each one, and only stats with a value appear. Hiding a stat never deletes anything. <a href="card?e=${encodeURIComponent(e.slug)}">View your card →</a></p>${noCalls ? `<p class="tag">Verified stats, worked out from this entrant's own calls, appear here once it makes some.</p>` : ""}
      <div class="tablewrap"><table class="mgrid stats"><thead><tr><th>Stat</th><th>Who sees it</th><th>Order</th><th>Latest value</th>${caller ? "" : "<th>New value</th>"}</tr></thead><tbody>${groups.map(g => `<tr><th colspan="${cols}" class="catgroup">${esc(g.name)}
          <select data-groupset="${esc(e.id)}|${esc(g.name)}" aria-label="Set everything in ${esc(g.name)}" style="width:auto;margin-left:10px"><option value="">Set all to…</option>${Object.entries(SHOWS).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></th></tr>${g.list.map(row).join("")}`).join("")}</tbody></table></div>
      <div class="actions" style="margin-top:10px"><button class="btn" type="button" data-savestats="${esc(e.id)}">Save stats card</button>${caller ? "" : `<button class="btn" type="button" data-savevals="${esc(e.id)}">Save values</button>`}</div>
      ${caller ? "" : customForm(e, st)}`;
  }

  // Typing a self-reported value in. Percent and return are typed as percentages, durations in seconds,
  // records as "wins-losses"; series and histograms as JSON, the same shape a bot sends.
  const VAL_HINT = { number: "1.8", integer: "412", percent: "62 (%)", return: "23.7 (%)", money: "184.25 ($)", duration: "95 (seconds)", text: "text", date: "", record: "12-7", series: '[{"t":"…","v":1}]', histogram: '{"up":0.6}' };
  function valueInput(e, x) {
    const attrs = `data-val="${esc(e.id)}|${esc(x.key)}|${esc(x.type)}" aria-label="New value for ${esc(x.label)}"`;
    if (x.type === "date") return `<input type="date" class="newval" ${attrs}>`;
    return `<input class="newval" ${attrs} placeholder="${esc(VAL_HINT[x.type] || "")}">`;
  }
  function parseValue(type, raw) {
    const n = Number(raw.replace(/[$,%\s]/g, ""));
    switch (type) {
      case "percent": case "return": return Math.round(n * 100) / 10000;
      case "duration": return Math.round(n * 1000);
      case "integer": case "number": case "money": return n;
      case "text": case "date": return raw;
      case "record": { const m = raw.match(/^\s*(\d+)\s*[-–\/]\s*(\d+)\s*$/); if (!m) throw new Error(`Type a record as wins-losses, like 12-7.`); return { w: +m[1], l: +m[2] }; }
      default: try { return JSON.parse(raw); } catch (x) { throw new Error(`That ${type} needs to be JSON, like ${VAL_HINT[type]}.`); }
    }
  }

  // Defining a custom stat the bot will send. Its values are always shown as "self-reported".
  function customForm(e, st) {
    const n = st.stats.filter(x => x.source === "custom").length, base = new URL("api/v1/bot/stats", location.href).href;
    return `<h3 class="sub">Add a custom stat <span class="tag">${n} of ${st.maxCustom}</span></h3>
      <form class="row" data-newstat="${esc(e.id)}" autocomplete="off">
        <div class="field"><label>Key (your bot sends this)</label><input name="key" maxlength="32" placeholder="avg_edge" pattern="[a-z][a-z0-9_]{1,31}" required></div>
        <div class="field"><label>Label</label><input name="label" maxlength="40" placeholder="Average edge" required></div>
        <div class="field" style="flex:0 1 150px"><label>Type</label><select name="type">${st.customTypes.map(t => `<option>${t}</option>`).join("")}</select></div>
        <div class="field" style="flex:0 1 100px"><label>Unit</label><input name="unit" maxlength="12" placeholder="%"></div>
        <div class="field"><label>Description</label><input name="description" maxlength="160" placeholder="optional"></div>
        <button class="btn" type="submit">Add stat</button>
      </form>
      ${st.removedCustom.length ? `<p class="tag">Removed (history kept; add the same key again to bring one back): ${st.removedCustom.map(r => `<code>${esc(r.key)}</code>`).join(", ")}</p>` : ""}
      <details style="margin-top:8px"><summary class="tag">How your bot sends stats</summary>
        <p class="tag">Types: number, integer, percent (0 to 1), return (signed, -1 or more), money (dollars), duration (ms), text (up to 500 characters), date ("2026-03-01"), record ({"w", "l"}), series (a list of {"t", "v"} points), histogram ({"name": number}). Standard stats use their key from the list above; custom ones only once defined here. Send whenever values change; unchanged values are skipped. The bot guide lists every key.</p>
        <pre class="code">curl -X POST ${esc(base)} \\
  -H "Authorization: Bearer d3b_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"schema":"d3mon.stats/v1","values":[{"key":"win_rate","value":0.62},{"key":"avg_edge","value":0.034}]}'</pre>
      </details>`;
  }

  // Background updates (live events, a new round) redraw the page, unless the owner has unsaved stat
  // edits: then the new data waits, so their typing isn't wiped.
  function refresh() {
    if (S.statsDirty) return msg("New activity arrived. Save your stats card to see it.");
    render();
  }

  // The public profile (/profile?e=<slug>): the owner's tagline, shop link (with D3MON's referral code) and
  // stream link. Saved with PUT /entrants/:id/profile; an empty field clears it.
  function profileBox(e) {
    return `<h3 class="sub">Profile <a class="meta" href="profile?e=${encodeURIComponent(e.slug)}">see it →</a></h3>
      <form class="callbox" data-profile="${esc(e.id)}">
        <label>Tagline <span class="meta">(up to 140 characters)</span><input name="tagline" maxlength="140" value="${esc(e.tagline || "")}" placeholder="Trend first, then the crowd."></label>
        <label>Shop link <span class="meta">(https://…, with D3MON's referral code; shown as "Get ${esc(e.name)}")</span><input name="shopUrl" maxlength="300" value="${esc(e.shopUrl || "")}" placeholder="https://"></label>
        <label>Stream link <span class="meta">(YouTube, Twitch, Kick or Discord)</span><input name="streamUrl" maxlength="300" value="${esc(e.streamUrl || "")}" placeholder="https://"></label>
        <div class="actions"><button class="btn sm" type="submit">Save profile</button></div>
      </form>`;
  }

  function render() {
    $("none").hidden = S.entrants.length > 0;
    $("entrants").innerHTML = S.entrants.map(e => `<section class="panel" data-ent="${esc(e.id)}">
      <h2>${esc(e.name)} <span class="st">${esc(kindName(e.kind))}</span>${e.status !== "active" ? ` <span class="st rejected">${esc(e.status)}</span>` : ""}</h2>
      ${e.kind === "caller" ? callerBox(e) : keysBox(e)}
      ${tourBox(e)}
      ${profileBox(e)}
      <h3 class="sub">Recent calls</h3>${callsTable(e)}
      ${statsBox(e)}
    </section>`).join("");
  }

  async function loadEntrant(e) {
    const [c, k, st, t] = await Promise.all([api("GET", `entrants/${e.id}/calls?limit=12`), e.kind === "caller" ? null : api("GET", `entrants/${e.id}/keys`), api("GET", `entrants/${e.id}/stat-settings`),
      e.kind === "caller" ? null : api("GET", `entrants/${e.id}/tournaments`)]);
    if (t) S.tour[e.id] = t.tournaments;
    S.calls[e.id] = c.calls;
    if (k) S.keys[e.id] = k.keys;
    S.stats[e.id] = st;
  }

  async function load() {
    S.entrants = (await api("GET", "entrants?mine=1")).entrants;
    await Promise.all(S.entrants.map(loadEntrant));
    render();
  }

  document.addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.callbtn) {
      if (S.busy) return;
      const [id, direction, round] = d.callbtn.split("|");
      S.busy = true;
      try {
        // The round on screen, so a click at the very end of a window never lands on another round.
        const r = await api("POST", `entrants/${id}/call`, { direction, round: new Date(+round).toISOString() });
        msg(r.unchanged ? "That's already your call." : `Called ${dirText(direction)} for ${fmtTime(r.call.round)}.`, true);
        await loadEntrant(S.entrants.find(x => x.id === id)); render();
      } catch (e) { msg(e.message); } finally { S.busy = false; }
      return;
    }
    if (d.tour) {
      const [id, to] = d.tour.split("|");
      try {
        S.tour[id] = (await api("PUT", `entrants/${id}/tournaments`, { on: to === "on" })).tournaments;
        msg(to === "on" ? `Joined. Counts from the round at ${fmtTime(S.tour[id].from)}.` : "Left the tournaments. Rounds already played still count.", true);
        render();
      } catch (e) { msg(e.message); }
      return;
    }
    if (d.revoke) {
      const [id, keyId] = d.revoke.split("|");
      if (!confirm("Revoke this key? Any bot using it stops being able to send calls straight away.")) return;
      try { await api("DELETE", `entrants/${id}/keys/${keyId}`); msg("Key revoked.", true); await loadEntrant(S.entrants.find(x => x.id === id)); render(); } catch (e) { msg(e.message); }
      return;
    }
    if ("copy" in d) {
      try { await navigator.clipboard.writeText(S.token.token); msg("Key copied.", true); } catch (e) { msg("Select the key and copy it by hand."); }
      return;
    }
    if ("hidetoken" in d) { S.token = null; render(); return; }
    if (d.savestats) {
      const id = d.savestats, cur = Object.fromEntries(S.stats[id].stats.map(x => [x.key, x])), changes = {}, custom = {};
      document.querySelectorAll(`[data-st^="${CSS.escape(id)}|"]`).forEach(el => {
        const [, key, field] = el.dataset.st.split("|"), x = cur[key];
        let v = el.value, was = x[field];
        if (field === "order") { v = Number(v); if (!Number.isInteger(v)) return; }
        if (field === "label" || field === "description") was = x[field] === x[field === "label" ? "defaultLabel" : "defaultDescription"] ? "" : x[field];
        if (v === was || (x.source === "custom" && field === "label" && v === "")) return; // a custom stat always keeps a label
        ((x.source === "custom" ? custom : changes)[key] ||= {})[field] = v;
      });
      if (!Object.keys(changes).length && !Object.keys(custom).length) { S.statsDirty = false; return msg("Nothing to save."); }
      const body = {};
      if (Object.keys(changes).length) body.stats = changes;
      if (Object.keys(custom).length) body.custom = custom;
      try { S.stats[id] = await api("PUT", `entrants/${id}/stat-settings`, body); S.statsDirty = false; msg("Stats card saved.", true); render(); } catch (e) { msg(e.message); }
      return;
    }
    if (d.savevals) {
      const id = d.savevals, values = [];
      try {
        document.querySelectorAll(`[data-val^="${CSS.escape(id)}|"]`).forEach(el => {
          const raw = el.value.trim();
          if (!raw) return;
          const [, key, type] = el.dataset.val.split("|");
          values.push({ key, value: parseValue(type, raw) });
        });
      } catch (x) { return msg(x.message); }
      if (!values.length) return msg("Type a value in the New value column first.");
      try {
        const r = await api("POST", `entrants/${id}/stats`, { schema: "d3mon.stats/v1", values });
        S.statsDirty = false;
        msg(`Saved ${r.accepted.length} value${r.accepted.length === 1 ? "" : "s"}${r.unchanged.length ? `, ${r.unchanged.length} unchanged` : ""}.`, true);
        await loadEntrant(S.entrants.find(x => x.id === id)); render();
      } catch (x) { msg(x.message); }
      return;
    }
    if (d.rmstat) {
      const [id, key] = d.rmstat.split("|");
      if (!confirm(`Remove "${key}" from your card? Its history is kept, and your bot can no longer send it. Add the same key again to bring it back.`)) return;
      try { S.stats[id] = await api("PUT", `entrants/${id}/stat-settings`, { custom: { [key]: { remove: true } } }); msg("Stat removed. Its history is kept.", true); render(); } catch (e) { msg(e.message); }
    }
  });

  document.addEventListener("submit", async ev => {
    const pf = ev.target.closest("[data-profile]");
    if (pf) {
      ev.preventDefault();
      const id = pf.dataset.profile, v = n => pf.elements[n].value.trim();
      try {
        const e = (await api("PUT", `entrants/${id}/profile`, { tagline: v("tagline"), shopUrl: v("shopUrl"), streamUrl: v("streamUrl") })).entrant;
        Object.assign(S.entrants.find(x => x.id === id), { tagline: e.tagline, shopUrl: e.shopUrl, streamUrl: e.streamUrl });
        msg("Profile saved. It's public now.", true); render();
      } catch (e) { msg(e.message); }
      return;
    }
    const ns = ev.target.closest("[data-newstat]");
    if (ns) {
      ev.preventDefault();
      const id = ns.dataset.newstat, v = n => ns.elements[n].value.trim(), def = { type: v("type"), label: v("label") };
      if (v("unit")) def.unit = v("unit");
      if (v("description")) def.description = v("description");
      try { S.stats[id] = await api("PUT", `entrants/${id}/stat-settings`, { custom: { [v("key")]: def } }); msg(`Added "${v("key")}". It starts hidden: choose who sees it, then have your bot send values.`, true); render(); } catch (e) { msg(e.message); }
      return;
    }
    const f = ev.target.closest("[data-newkey]");
    if (!f) return;
    ev.preventDefault();
    const id = f.dataset.newkey;
    try {
      const r = await api("POST", `entrants/${id}/keys`, { label: f.querySelector("input").value });
      S.token = { entrantId: id, token: r.token };
      msg("Key made. Copy it now: it's only shown once.", true);
      await loadEntrant(S.entrants.find(x => x.id === id)); render();
    } catch (e) { msg(e.message); }
  });

  // Countdown to the lock; at each round start, reload so the buttons move on to the next round.
  let lastRound = null;
  setInterval(() => {
    document.querySelectorAll("[data-lock]").forEach(el => (el.textContent = mmss(+el.dataset.lock - serverNow())));
    const r = openRound().round;
    if (lastRound !== null && r !== lastRound) Promise.all(S.entrants.map(loadEntrant)).then(refresh).catch(() => {});
    lastRound = r;
  }, 1000);

  const markDirty = ev => { if (ev.target.dataset && (ev.target.dataset.st || ev.target.dataset.val)) S.statsDirty = true; };
  // "Set all to…" on a group sets each of its stats (saved with Save stats card, like any other edit).
  document.addEventListener("change", ev => {
    const g = ev.target.dataset && ev.target.dataset.groupset;
    if (!g || !ev.target.value) return;
    const [id, name] = g.split("|");
    document.querySelectorAll(`[data-st^="${CSS.escape(id)}|"][data-group]`).forEach(el => { if (el.dataset.group === name) el.value = ev.target.value; });
    ev.target.value = "";
    S.statsDirty = true;
  });
  document.addEventListener("input", markDirty);
  document.addEventListener("change", markDirty);

  window.addEventListener("beforeunload", e => { if (S.token || S.statsDirty) e.preventDefault(); });

  (async () => {
    const me = await session();
    if (!me) { $("guest").hidden = false; return; }
    try {
      await syncClock();
      await load();
      if (S.entrants.length) {
        let t = null;
        follow(S.entrants.map(e => `entrant:${e.id}`).slice(0, 20), () => { clearTimeout(t); t = setTimeout(() => Promise.all(S.entrants.map(loadEntrant)).then(refresh).catch(() => {}), 200); },
          on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
      }
    } catch (e) { msg(e.message); }
  })();
})();
