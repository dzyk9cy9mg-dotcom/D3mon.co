// /brothers: the Brothers' Desk. You make your call on this round (the floor's Up/Down vote, session "live"); Kain's and
// Abel's calls appear live as they make them, then the recent rounds and the scoreboard show who called it right.
// A thin client over GET /api/v1/brothers, GET/POST /api/v1/votes… and GET /api/v1/market.
(function () {
  "use strict";
  const A = window.Arena, { api, esc } = A;
  const $ = id => document.getElementById(id);
  const S = { me: null, data: null, round: null, market: null, period: "daily", busy: false };
  const cents = x => (x == null ? "–" : `${Math.round(x * 100)}¢`);
  const signed = x => (x == null ? "" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}¢`);
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const arrow = d => (d === "up" ? "▲ Up" : d === "down" ? "▼ Down" : "");
  const err = t => { $("err").textContent = t || ""; };

  // ---------- your call this round
  function youSlot() {
    const r = S.round, p = S.market && S.market.price;
    if (!S.me) { $("youSlot").innerHTML = `<p class="bro-who">You</p><p class="bro-sealed">Sign in to make your call.</p><a class="btn sm" href="login">Sign in</a>`; return; }
    if (r && r.canVote === false) { $("youSlot").innerHTML = `<p class="bro-who">You</p><p class="bro-sealed">Voting is off for you right now.</p>`; return; }
    const open = r && r.open, done = r ? r.mine.filter(t => t.status !== "open") : [];
    const total = done.filter(t => t.profit != null).reduce((a, t) => a + t.profit, 0);
    $("youSlot").innerHTML = `<p class="bro-who">You</p>
      ${open ? `<p class="bro-call ${open.dir}">${arrow(open.dir)}${open.paid != null ? ` <small>@ ${cents(open.paid)}</small>` : ""}</p>
        <button type="button" class="btn ghost sm" data-act="exit">Cash out</button>`
      : `<div class="bro-btns"><button type="button" class="bro-up" data-act="up">▲ Up <small>${cents(p && p.up)}</small></button>
        <button type="button" class="bro-dn" data-act="down">▼ Down <small>${cents(p && p.down)}</small></button></div>`}
      ${done.length ? `<p class="meta">Cashed out ${done.length}× this round${total ? ` · ${signed(total)}` : ""}</p>` : ""}`;
  }

  // ---------- Kain's and Abel's calls this round, live as they make them
  function brotherSlots() {
    const calls = (S.data.now && S.data.now.calls) || {};
    for (const [k, name] of [["kain", "Kain"], ["abel", "Abel"]]) {
      const c = calls[k];
      $(`${k}Slot`).innerHTML = `<p class="bro-who">${name}</p>` + (c
        ? `<p class="bro-call ${c.dir}">${arrow(c.dir)}${c.paid != null ? ` <small>@ ${cents(c.paid)}</small>` : ""}</p>${c.from ? `<p class="meta bro-from">from ${esc(c.from.name)} (admins only)</p>` : ""}`
        : `<p class="bro-sealed">${S.data.on ? "Waiting for his read" : "Sitting this one out"}</p>`);
    }
  }

  // ---------- the intro videos (admins upload a file for each brother)
  const sending = {}; // brother -> "Uploading 40%" while a file goes up
  function intros() {
    // left to right: Kain, both brothers (the smaller one in the middle), Abel
    const list = [["kain", "Kain", "introKain"], ["both", "Kain & Abel", "introBoth"], ["abel", "Abel", "introAbel"]];
    const vids = S.data.videos || Object.fromEntries(S.data.brothers.map(b => [b.key, b.video]));
    $("intros").hidden = !S.admin && !list.some(([k]) => vids[k]);
    for (const [k, name, id] of list) {
      const v = vids[k], box = $(id);
      const want = v ? v.url : "", now = box.dataset.src || "";
      if (want === now && box.dataset.admin === String(S.admin) && !sending[k] && box.dataset.sending !== "1") continue;
      box.dataset.src = want; box.dataset.admin = String(S.admin); box.dataset.sending = sending[k] ? "1" : "";
      box.hidden = !v && !S.admin;
      const what = k === "both" ? "The brothers' video" : `${name}'s intro video`;
      box.innerHTML = `<figcaption class="bro-name">${name} <span class="bro-ai">AI</span></figcaption>
        ${v ? `<video controls playsinline preload="metadata" src="${esc(v.url)}" aria-label="${esc(what)}"></video>`
          : `<div class="bro-novid">${esc(what)} goes here.</div>`}
        ${S.admin ? `<div class="bro-up-ctl"><label class="btn ghost sm">${v ? "Replace video" : "Upload a video"}<input type="file" accept="video/mp4,video/webm,video/quicktime" data-upload="${k}"></label>
          ${v ? `<button type="button" class="btn ghost sm" data-unvid="${k}">Remove</button>` : ""}
          <p class="meta" id="upNote-${k}">${esc(sending[k] || "MP4 or WebM, up to 200 MB. Admins only.")}</p></div>` : ""}`;
    }
  }
  function upload(k, file) {
    const note = t => { sending[k] = t; const el = $(`upNote-${k}`); if (el) el.textContent = t; };
    if (file.size > 200 * 1024 * 1024) { err("That video is over 200 MB. Make a smaller copy and try again."); return; }
    err(""); note("Uploading 0%");
    const x = new XMLHttpRequest();
    x.open("PUT", `api/v1/brothers/video/${k}`);
    x.setRequestHeader("content-type", file.type || "video/mp4");
    x.upload.onprogress = e => { if (e.lengthComputable) note(`Uploading ${Math.floor(e.loaded / e.total * 100)}%`); };
    x.onload = () => {
      delete sending[k];
      if (x.status >= 200 && x.status < 300) load();
      else { let m = "The upload didn't work."; try { m = JSON.parse(x.responseText).error.message; } catch (e) {} err(m); load(); }
    };
    x.onerror = () => { delete sending[k]; err("The upload stopped. Check your connection and try again."); load(); };
    x.send(file);
  }
  document.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.upload; if (k && e.target.files[0]) upload(k, e.target.files[0]); });

  // ---------- recent rounds
  function mark(c) {
    if (!c) return `<span class="bro-dash">sat out</span>`;
    const res = c.correct === true ? `<b class="ok">✓</b>` : c.correct === false ? `<b class="no">✗</b>` : "";
    return `${res} <span class="bro-d ${c.dir}">${arrow(c.dir)}</span> <small>${c.profit != null ? signed(c.profit) : cents(c.paid)}</small>${c.from ? ` <small class="bro-from">(${esc(c.from.name)})</small>` : ""}`;
  }
  function markYou(y) {
    if (!S.me) return `<span class="bro-dash">–</span>`;
    if (!y) return `<span class="bro-dash">no call</span>`;
    const res = y.won === true ? `<b class="ok">✓</b>` : y.won === false ? `<b class="no">✗</b>` : "";
    return `${res} ${y.dirs.map(d => `<span class="bro-d ${d}">${arrow(d)}</span>`).join(" / ")} <small>${y.profit != null ? signed(y.profit) : ""}</small>`;
  }
  function recent() {
    const rows = S.data.rounds;
    $("recent").innerHTML = rows.length ? rows.map(r => `<tr><td>${esc(time(r.round))}</td><td>${r.result ? `<span class="bro-d ${r.result}">${arrow(r.result)}</span>` : `<span class="bro-dash">waiting</span>`}</td>
        <td>${markYou(r.you)}</td><td>${mark(r.calls.kain)}</td><td>${mark(r.calls.abel)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="empty">No rounds yet. Kain and Abel play every round that bots call.</td></tr>`;
  }

  // ---------- scoreboard
  function score() {
    const s = S.data.standings[S.period];
    const who = [["you", "You"], ["kain", "Kain"], ["abel", "Abel"]].filter(([k]) => s[k]);
    const best = Math.max(...who.map(([k]) => s[k].wins));
    $("score").innerHTML = who.map(([k, name]) => { const t = s[k];
      return `<div class="bro-sc ${k}${t.wins === best && best > 0 ? " lead" : ""}"><p class="bro-who">${name}</p>
        <p class="bro-big">${t.wins}<small> / ${t.decided}</small></p><p class="meta">${t.winRate != null ? `${t.winRate}% right` : "No decided rounds yet"}</p>
        <p class="meta">${t.profit != null ? `Paper ${signed(t.profit)}` : ""}</p></div>`; }).join("")
      + (S.me ? "" : `<p class="tag">Sign in to see your own score here.</p>`);
  }

  function clock() {
    const end = S.data ? S.data.now.endsAt : 0, left = end - A.serverNow();
    if (left <= 0 && S.data) { load(); return; }
    const s = Math.max(0, Math.floor(left / 1000));
    $("clock").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  async function load() {
    try {
      const [d, r, m] = await Promise.all([api("GET", "brothers"), api("GET", "votes/round?session=live").catch(() => null), api("GET", "market").catch(() => null)]);
      S.data = d; S.round = r; S.market = m;
      for (const b of d.brothers) if ($(`${b.key}Tag`)) $(`${b.key}Tag`).textContent = b.tagline;
      $("notice").textContent = d.notice;
      $("roundTime").textContent = `${time(d.now.round)} to ${time(d.now.endsAt)} · Calls stay open all round`;
      if (!d.on) err("Kain and Abel are taking a break right now. You can still make your call.");
      youSlot(); brotherSlots(); intros(); recent(); score(); clock();
    } catch (e) { err(e.message); }
  }

  document.addEventListener("click", async e => {
    const p = e.target.closest("[data-p]");
    if (p) { S.period = p.dataset.p; for (const b of $("periods").children) { const on = b === p; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); } score(); return; }
    const un = e.target.closest("[data-unvid]")?.dataset.unvid;
    if (un) { if (confirm("Take this video down?")) { try { await api("DELETE", `brothers/video/${un}`); load(); } catch (x) { err(x.message); } } return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act || S.busy) return;
    S.busy = true; err("");
    try {
      if (act === "exit") S.round = (await api("POST", "votes/exit", { session: "live" })).round;
      else S.round = (await api("POST", "votes", { session: "live", dir: act })).round;
      youSlot();
    } catch (x) { err(x.message); } finally { S.busy = false; }
  });

  // ---------- admins: which bots Kain and Abel may borrow calls from, and the on/off switch
  const KINDS = { bot: "Bot", script: "Chart script" };
  async function loadAdmin() {
    const d = await api("GET", "brothers/settings");
    $("adm").hidden = false;
    $("admOn").checked = d.on;
    $("admBots").innerHTML = d.bots.length ? d.bots.map(b => `<li><label class="bro-chk"><input type="checkbox" data-bot="${esc(b.id)}" ${b.excluded ? "" : "checked"}> ${esc(b.name)} <span class="tag">${esc(KINDS[b.kind] || b.kind)}</span></label></li>`).join("")
      : `<li class="tag">No active bots or scripts yet.</li>`;
    const out = d.bots.filter(b => b.excluded).length;
    $("admNote").textContent = `${d.bots.length - out} of ${d.bots.length} can be borrowed from.`;
  }
  async function saveAdmin() {
    const exclude = [...$("admBots").querySelectorAll("input[data-bot]")].filter(i => !i.checked).map(i => i.dataset.bot);
    $("admNote").textContent = "Saving…";
    try { await api("PUT", "brothers/settings", { on: $("admOn").checked, exclude }); await loadAdmin(); $("admNote").textContent += " Saved."; }
    catch (x) { $("admNote").textContent = x.message; await loadAdmin().catch(() => {}); }
  }
  $("adm").addEventListener("change", e => { if (e.target.matches("input[type=checkbox]")) saveAdmin(); });

  (async () => {
    await A.syncClock?.().catch(() => {});
    S.me = await A.session();
    S.admin = !!S.me && (S.me.role === "admin" || S.me.role === "owner");
    await load();
    if (S.admin) loadAdmin().catch(() => {});
    setInterval(clock, 1000);
    setInterval(() => api("GET", "market").then(m => { S.market = m; if (!(S.round && S.round.open)) youSlot(); }).catch(() => {}), 10000);
    A.follow(["brothers", "votes"], type => { if (type === "brothers.called" || type === "brothers.video") load(); }, () => {});
  })();
})();
