// /my: an owner's approved entrants. Bots and scripts: API keys (made, shown once, revoked) and how to
// send calls. Callers: Up/Down buttons for the next round, locked by the server at the round's start.
// Thin client over /api/v1 (entrants, keys, calls, clock) and the live feed.
(function () {
  "use strict";
  const { api, follow, esc, when, kindName, session, syncClock, serverNow, nextRound, mmss } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { entrants: [], keys: {}, calls: {}, token: null, busy: false };

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
      const res = c.result ? `${dirText(c.result)} · ${c.correct ? "✓ right" : "✗ wrong"} <span class="tag">${esc(c.verification)}</span>` : c.locked ? `<span class="tag">waiting for the result</span>` : `<span class="tag">locks ${esc(fmtTime(c.round))}</span>`;
      return `<tr><td>${esc(when(c.round))}</td><td>${esc(dirText(c.direction))}</td><td>${esc(new Date(c.receivedAt).toLocaleTimeString())}${c.via === "button" ? "" : ' <span class="tag">bot key</span>'}</td><td>${res}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function callerBox(e) {
    const round = nextRound(), mine = callFor(e.id, round);
    return `<div class="callbox">
      <div class="meta">Next round <b>${esc(fmtTime(round))}–${esc(fmtTime(round + 15 * 60000))}</b> · locks in <b class="lock" data-lock="${round}">${mmss(round - serverNow())}</b></div>
      <div class="bigcall seg2" role="group" aria-label="Your call for the next round">
        <button type="button" class="up" data-callbtn="${esc(e.id)}|up" aria-pressed="${mine?.direction === "up"}">▲ UP</button>
        <button type="button" class="down" data-callbtn="${esc(e.id)}|down" aria-pressed="${mine?.direction === "down"}">▼ DOWN</button>
      </div>
      <div class="meta">${mine ? `Your call: <b>${dirText(mine.direction)}</b>, sent ${esc(new Date(mine.receivedAt).toLocaleTimeString())}. You can change it until the lock. Others see that you've called, but not which way, until then.` : "No call yet for this round."}</div>
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
        <p class="tag">Send each call before the round starts. The latest call before the lock counts. Leave out "round" to call the next round.</p>
        <pre class="code">curl -X POST ${esc(base)} \\
  -H "Authorization: Bearer d3b_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"schema":"d3mon.call/v1","market":"KXBTC15M","direction":"up"}'</pre>
      </details>`;
  }

  function render() {
    $("none").hidden = S.entrants.length > 0;
    $("entrants").innerHTML = S.entrants.map(e => `<section class="panel" data-ent="${esc(e.id)}">
      <h2>${esc(e.name)} <span class="st">${esc(kindName(e.kind))}</span>${e.status !== "active" ? ` <span class="st rejected">${esc(e.status)}</span>` : ""}</h2>
      ${e.kind === "caller" ? callerBox(e) : keysBox(e)}
      <h3 class="sub">Recent calls</h3>${callsTable(e)}
    </section>`).join("");
  }

  async function loadEntrant(e) {
    const [c, k] = await Promise.all([api("GET", `entrants/${e.id}/calls?limit=12`), e.kind === "caller" ? null : api("GET", `entrants/${e.id}/keys`)]);
    S.calls[e.id] = c.calls;
    if (k) S.keys[e.id] = k.keys;
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
      const [id, direction] = d.callbtn.split("|");
      S.busy = true;
      try {
        const r = await api("POST", `entrants/${id}/call`, { direction });
        msg(r.unchanged ? "That's already your call." : `Called ${dirText(direction)} for ${fmtTime(r.call.round)}.`, true);
        await loadEntrant(S.entrants.find(x => x.id === id)); render();
      } catch (e) { msg(e.message); } finally { S.busy = false; }
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
    if ("hidetoken" in d) { S.token = null; render(); }
  });

  document.addEventListener("submit", async ev => {
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
    const r = nextRound();
    if (lastRound !== null && r !== lastRound) load().catch(() => {});
    lastRound = r;
  }, 1000);

  window.addEventListener("beforeunload", e => { if (S.token) e.preventDefault(); });

  (async () => {
    const me = await session();
    if (!me) { $("guest").hidden = false; return; }
    try {
      await syncClock();
      await load();
      if (S.entrants.length) {
        let t = null;
        follow(S.entrants.map(e => `entrant:${e.id}`).slice(0, 20), () => { clearTimeout(t); t = setTimeout(() => Promise.all(S.entrants.map(loadEntrant)).then(render).catch(() => {}), 200); },
          on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
      }
    } catch (e) { msg(e.message); }
  })();
})();
