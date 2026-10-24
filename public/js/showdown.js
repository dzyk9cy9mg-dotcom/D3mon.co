// /showdown: the Showdowns hub (call out, answer, yours, live ones) and, with ?id=, one Showdown: the score, this
// round's call, the rounds and the talk (Kain and Abel answer quick replies). A thin client over /api/v1/showdowns.
(function () {
  "use strict";
  const A = window.Arena, { api, esc } = A;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search), sid = qs.get("id");
  const S = { me: null, sd: null, busy: false, lastClose: 0 };
  const QUICK = { lol: "😂", watch: "Watch this", done: "You're done", lucky: "Lucky", gg: "GG" };
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const cents = x => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}¢`;
  const err = t => { $("err").textContent = t || ""; };
  const who = p => p.ai ? `${esc(p.name)} <span class="sd-ai">AI</span>` : p.username ? `<a href="profile?u=${encodeURIComponent(p.username)}">${esc(p.name)}</a>` : esc(p.name);
  const rule = v => v.anyTime ? "call any time in the round" : `calls close ${v.callMin} min into each round`;
  const into = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")} in`;
  const STATE = { pending: "Waiting for an answer", starting: "Starts next round", live: "Live", scoring: "Waiting for the last result", final: "Final", declined: "Declined", expired: "Expired", cancelled: "Taken back" };

  async function act(fn) {
    if (S.busy) return; S.busy = true; err("");
    try { await fn(); } catch (x) { err(x.message); } finally { S.busy = false; }
  }

  // ---------- the hub
  function card(v, extra = "") {
    const sc = v.score, scored = v.detail.some(r => r.result);
    return `<div class="sd-card s-${esc(v.state)}"><a class="sd-card-main" href="showdown?id=${esc(v.sid)}">
      <span class="sd-card-vs"><b>${esc(v.from.name)}</b> <span class="sd-v">vs</span> <b>${esc(v.to.name)}</b>${v.to.ai ? ' <span class="sd-ai">AI</span>' : ""}</span>
      <span class="meta">${v.rounds} round${v.rounds > 1 ? "s" : ""} · ${esc(rule(v))} · ${esc(STATE[v.state] || v.state)}${scored ? ` · ${sc.from.right}–${sc.to.right}` : ""}</span>
      ${v.message ? `<span class="sd-card-msg">“${esc(v.message)}”</span>` : ""}</a>${extra}</div>`;
  }
  async function loadHub() {
    $("hub").hidden = false;
    const d = await api("GET", "showdowns");
    $("live").innerHTML = d.live.length ? d.live.map(v => card(v)).join("") : `<p class="empty">No Showdowns on right now. Start one.</p>`;
    if (!S.me) { $("coForm").querySelector("button[type=submit]").textContent = "Sign in to call out"; return; }
    const show = (sec, box, list, extra) => { $(sec).hidden = !list.length; $(box).innerHTML = list.map(v => card(v, extra ? extra(v) : "")).join(""); };
    show("inSec", "incoming", d.incoming, v => `<div class="sd-acts"><button class="s-amber sm" data-ans="${esc(v.sid)}|1">Accept</button><button class="btn ghost sm" data-ans="${esc(v.sid)}|0">Decline</button><button class="btn ghost sm" data-ans="${esc(v.sid)}|block">Decline and block</button></div>`);
    show("actSec", "active", d.active);
    show("outSec", "outgoing", d.outgoing, v => `<div class="sd-acts"><button class="btn ghost sm" data-cancel="${esc(v.sid)}">Take it back</button></div>`);
    show("recSec", "recent", d.recent);
  }

  // ---------- one Showdown
  function render() {
    const v = S.sd, now = A.serverNow(), mine = v.me;
    $("match").hidden = false;
    document.title = `${v.from.name} vs ${v.to.name} · Showdown · D3MON`;
    $("state").textContent = `${v.rounds}-round Showdown · ${rule(v)} · ${STATE[v.state] || v.state}`;
    $("state").className = `sd-state s-${v.state}`;
    $("vsH").innerHTML = `${who(v.from)} <span class="sd-v">vs</span> ${who(v.to)}`;
    $("msg").hidden = !v.message; $("msg").textContent = v.message ? `“${v.message}” · ${v.from.name}` : "";
    // answering, or waiting
    const ans = $("answer");
    ans.hidden = !["pending"].includes(v.state);
    ans.innerHTML = v.canAnswer ? `<p>${esc(v.from.name)} called you out: ${v.rounds} round${v.rounds > 1 ? "s" : ""}, ${esc(rule(v))}. Answer by ${esc(time(v.answerBy))}.</p><div class="sd-acts"><button class="s-amber" data-ans="${esc(v.sid)}|1">Accept</button><button class="btn ghost" data-ans="${esc(v.sid)}|0">Decline</button><button class="btn ghost" data-ans="${esc(v.sid)}|block">Decline and block</button></div>`
      : v.canCancel ? `<p>Waiting for ${esc(v.to.name)} to answer (until ${esc(time(v.answerBy))}).</p><button class="btn ghost" data-cancel="${esc(v.sid)}">Take it back</button>`
      : `<p>Waiting for ${esc(v.to.name)} to answer.</p>`;
    // the score
    const sc = v.score, lead = v.winner || (sc.from.right > sc.to.right ? "from" : sc.to.right > sc.from.right ? "to" : null);
    $("board").innerHTML = ["from", "to"].map(k => `<div class="sd-side ${lead === k ? "lead" : ""} ${v.winner === k ? "won" : ""}"><p class="sd-name">${who(v[k])}${mine === k ? ' <span class="sd-you">you</span>' : ""}</p>
      <p class="sd-big">${sc[k].right}<small> right</small></p><p class="meta">Paper ${cents(sc[k].paper)}</p>${v.winner === k ? '<p class="sd-crown">Winner</p>' : ""}</div>`).join(`<div class="sd-mid">${v.state === "final" && !v.winner ? "Draw" : "vs"}</div>`);
    // this round
    const r = v.detail.find(x => now >= x.round && now < x.endsAt);
    $("nowSec").hidden = !(v.state === "live" && r) && v.state !== "starting";
    if (v.state === "starting") { $("nowNote").textContent = `Round 1 starts at ${time(v.startsAt)}. One call a round; ${rule(v)}.`; $("callBtns").hidden = true; }
    else if (r) {
      const myCall = mine ? r[mine] : null, open = now < r.closesAt;
      $("callBtns").hidden = !(mine && open && !(myCall && myCall.dir));
      $("nowNote").textContent = open ? (myCall && myCall.dir ? `You called ${myCall.dir === "up" ? "Up" : "Down"} at ${into(myCall.intoMs)}. ${v.anyTime ? "Their call shows when the round ends." : `Calls close at ${time(r.closesAt)}.`}` : v.anyTime ? `Call any time until ${time(r.endsAt)}. One call, final when made.` : `Calls close at ${time(r.closesAt)}. One call, final when made.`) : `Calls are closed for this round.${v.detail.indexOf(r) < v.detail.length - 1 ? ` Next round opens at ${time(r.endsAt)}.` : " Sweat it out."}`;
    }
    // the rounds
    $("thFrom").textContent = v.from.name; $("thTo").textContent = v.to.name;
    const cell = c => !c ? `<span class="sd-dash">–</span>` : c.missed ? `<span class="sd-dash">missed</span>` : c.sealed ? `<span class="sd-dash">sealed</span> <small class="sd-when">${into(c.intoMs)}</small>`
      : `${c.right === true ? '<b class="ok">✓</b> ' : c.right === false ? '<b class="no">✗</b> ' : ""}<span class="${c.dir === "up" ? "up" : "dn"}">${c.dir === "up" ? "▲ Up" : "▼ Down"}</span>${c.paid != null ? ` <small>@${Math.round(c.paid * 100)}¢</small>` : ""} <small class="sd-when">${into(c.intoMs)}</small>`;
    $("rounds").innerHTML = v.detail.length ? v.detail.map((x, i) => `<tr><td>${i + 1} · ${esc(time(x.round))}</td><td>${cell(x.from)}</td><td>${cell(x.to)}</td><td>${x.result ? `<span class="${x.result === "up" ? "up" : "dn"}">${x.result === "up" ? "▲ Up" : "▼ Down"}</span>` : `<span class="sd-dash">${now < x.endsAt ? "…" : "waiting"}</span>`}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">The rounds appear once it's accepted.</td></tr>`;
    // the talk
    const lines = $("lines"), atEnd = lines.scrollHeight - lines.scrollTop - lines.clientHeight < 40;
    lines.innerHTML = v.chat.length ? v.chat.map(c => `<li class="${c.ai ? "ai" : ""} ${c.who === v.from.uid ? "f" : "t"}"><b>${esc(c.name)}${c.ai ? ' <span class="sd-ai">AI</span>' : ""}</b> ${esc(c.text)}</li>`).join("") : `<li class="empty">No talk yet.</li>`;
    if (atEnd) lines.scrollTop = lines.scrollHeight;
    $("talk").hidden = !v.canTalk;
    $("quick").innerHTML = Object.entries(QUICK).map(([k, t]) => `<button type="button" class="btn ghost sm" data-quick="${k}">${esc(t)}</button>`).join("");
    // after it's over
    const other = mine === "from" ? v.to : mine === "to" ? v.from : null;
    $("after").hidden = !(v.state === "final" && other);
    if (other) $("after").innerHTML = `<button class="s-amber" data-rematch="${esc(other.ai ? other.key : other.username)}|${v.rounds}">Rematch ${esc(other.name)}</button>`;
  }
  async function loadMatch() {
    S.sd = (await api("GET", `showdowns/${encodeURIComponent(sid)}`)).showdown;
    if (!S.lastClose) S.lastClose = A.serverNow();
    render();
  }
  function clock() {
    const v = S.sd; if (!v) return;
    const now = A.serverNow(), r = v.detail.find(x => now >= x.round && now < x.endsAt);
    $("clock").textContent = v.state === "starting" ? mmss(v.startsAt - now) : r ? mmss(r.endsAt - now) : "–:––";
    // reload at the moments that change what's shown: a round starting, calls closing, a round ending
    const marks = v.detail.flatMap(x => [x.round, x.closesAt, x.endsAt + 15000]).concat(v.startsAt || []);
    const due = marks.filter(m => m <= now && m > S.lastClose);
    if (due.length) { S.lastClose = Math.max(...due); loadMatch().catch(() => {}); }
    else if (r) render();
  }

  // ---------- actions
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-ans],[data-cancel],[data-call],[data-quick],[data-bro],[data-rematch]");
    if (!t) return;
    if (t.dataset.bro) { $("coTo").value = t.dataset.bro; $("coMsg").focus(); return; }
    act(async () => {
      if (t.dataset.ans) { const [id, a] = t.dataset.ans.split("|"); await api("POST", `showdowns/${id}/answer`, { accept: a === "1", ...(a === "block" ? { block: true } : {}) }); }
      else if (t.dataset.cancel) await api("POST", `showdowns/${t.dataset.cancel}/cancel`);
      else if (t.dataset.call) S.sd = (await api("POST", `showdowns/${sid}/call`, { dir: t.dataset.call })).showdown;
      else if (t.dataset.quick) S.sd = (await api("POST", `showdowns/${sid}/say`, { quick: t.dataset.quick })).showdown;
      else if (t.dataset.rematch) { const [to, rounds] = t.dataset.rematch.split("|"); const r = await api("POST", "showdowns", { to, rounds: +rounds }); location.href = `showdown?id=${r.showdown.sid}`; return; }
      if (sid) await loadMatch(); else await loadHub();
    });
  });
  $("coForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!S.me) { location.href = "login"; return; }
    act(async () => {
      const rounds = +new FormData($("coForm")).get("rounds"), callMin = +$("coRule").value, message = $("coMsg").value.trim();
      const r = await api("POST", "showdowns", { to: $("coTo").value.trim(), rounds, callMin, ...(message ? { message } : {}) });
      location.href = `showdown?id=${r.showdown.sid}`;
    });
  });
  $("sayForm").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("sayText").value.trim(); if (!text) return;
    act(async () => { S.sd = (await api("POST", `showdowns/${sid}/say`, { text })).showdown; $("sayText").value = ""; render(); });
  });

  (async () => {
    await A.syncClock?.().catch(() => {});
    S.me = await A.session();
    if (qs.get("to")) $("coTo").value = qs.get("to");
    try { sid ? await loadMatch() : await loadHub(); } catch (x) { err(x.message); }
    if (sid) setInterval(clock, 1000);
    A.follow(["showdowns"], (type, data) => {
      if (type !== "showdown.updated") return;
      if (sid ? data && data.sid === sid : true) (sid ? loadMatch() : loadHub()).catch(() => {});
    }, () => {});
  })();
})();
