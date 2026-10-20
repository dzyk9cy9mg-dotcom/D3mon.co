// The trading floor (/live): a thin client over /api/v1. The round open now and its clock; Kalshi's odds as a battle
// of light (green Above against red Below, meeting where the market stands, flaring when the odds swing); every call
// as it lands; the lock moment (the last 10 s count down, then the close); the result flooding the battle in the
// winner's colour; last round and this hour's tournament; the chat (linked with the D3MON Discord) and the stream.
// ?demo plays it on made-up data (for previews); add &fast for one-minute rounds. Reduce motion keeps it still.
(function () {
  "use strict";
  const A = window.Arena, $ = id => document.getElementById(id), esc = A.esc;
  const qs = new URLSearchParams(location.search), DEMO = qs.has("demo"), FAST = qs.has("fast");
  const Q = DEMO && FAST ? 60000 : 15 * 60000, LOCK = DEMO && FAST ? 8000 : 10000;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KIND = { caller: "Caller", bot: "Bot", script: "Chart script" };
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const money = n => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const S = { round: 0, p: null, target: null, calls: new Map(), prevShown: 0, me: null, chatIds: new Set() };

  // ---------- the data: the real API, or a made-up floor for ?demo ----------
  const D = DEMO ? demo() : null;
  const now = () => (DEMO ? Date.now() : A.serverNow());
  const get = path => (DEMO ? D.get(path) : A.api("GET", path));
  function demo() {
    const names = [["Valhalla", "bot"], ["NeuroBot 9", "bot"], ["Kronos", "script"], ["Fibonacci Fox", "script"], ["Maya", "caller"], ["Ghost", "caller"], ["Tidewater", "bot"], ["Sigma Lines", "script"], ["Rook", "caller"]];
    const chat = [["Maya", "Morning floor. I'm leaning up this round."], ["Rook", "Funding flipped negative, careful."], ["Valhalla", "Called. Let's see it.", "bot"], ["Ghost", "That wick on the 5m though"], ["Dex", "first time here, this is sick"], ["HardSmoke", "Battle of the Bots this Saturday, apply on Battles!"], ["Kronos", "Signal: momentum up, 0.71", "script"]];
    let up = 0.55, t0 = Date.now(), msgs = [], sent = new Set(), round = 0;
    return {
      get(path) {
        const n = Date.now(), cur = Math.floor(n / Q) * Q;
        if (cur !== round) { round = cur; sent = new Set(); }
        up = Math.min(0.92, Math.max(0.08, up + (Math.random() - 0.5) * 0.09));
        if (path === "market") return Promise.resolve({ round: cur, endsAt: cur + Q, price: { up: +up.toFixed(2), down: +(1.02 - up).toFixed(2), target: 108450.12 } });
        if (path.startsWith("rounds/")) {
          const r = +path.split("/")[1];
          if (r < cur) { const res = Math.floor(r / Q) % 2 ? "up" : "down"; return Promise.resolve({ round: r, result: n > r + Q + 2500 ? res : null, calls: names.slice(0, 7).map(([name, kind], i) => ({ id: `p${r}${i}`, name, kind, slug: name.toLowerCase(), direction: i % 3 ? res : res === "up" ? "down" : "up", correct: !!(i % 3), price: { paid: 0.4 + (i % 5) * 0.06 }, receivedAt: r + 60000 * (i + 1) })) }); }
          const k = Math.min(names.length, Math.floor((n - cur) / (FAST ? 5000 : 40000)) + 2);
          return Promise.resolve({ round: cur, result: null, calls: names.slice(0, k).map(([name, kind], i) => ({ id: `c${cur}${i}`, name, kind, slug: name.toLowerCase(), ...(kind === "caller" && n < cur + Q ? { sealed: true } : { direction: (i * 7 + Math.floor(cur / Q)) % 3 ? "up" : "down", price: { paid: +(0.38 + ((i * 13) % 30) / 100).toFixed(2) } }), receivedAt: cur + (i + 1) * (FAST ? 5000 : 40000) })).reverse() });
        }
        if (path === "presence") return Promise.resolve({ here: 23 + Math.floor(Math.random() * 6) });
        if (path.startsWith("hall/chat")) {
          const k = Math.min(chat.length, 2 + Math.floor((n - t0) / 6000));
          msgs = chat.slice(0, k).map(([name, text, as], i) => ({ id: `m${i}`, at: t0 + i * 6000, name, text, ...(as ? { as } : {}), ...(i === 4 ? { from: "discord" } : {}) }));
          return Promise.resolve({ messages: msgs, discord: true });
        }
        if (path === "hall/video") return Promise.resolve({ video: null });
        if (path === "tournaments") return Promise.resolve({ tournaments: [{ kind: "hourly", id: "h" }] });
        if (path.startsWith("tournaments/")) return Promise.resolve({ tournament: { settledRounds: 2, rounds: 4, standings: [["Valhalla", 2, 1], ["Kronos", 2, 1], ["Tidewater", 1, 0.5]].map(([name, correct, acc], i) => ({ rank: i + 1, correct, accuracy: acc, entrant: { name, slug: name.toLowerCase() } })) } });
        return Promise.resolve({});
      },
    };
  }

  // ---------- the battle of light ----------
  // Green Above pushes from the left, red Below from the right; they meet in a crackling white line where the
  // market stands. Streaks of light run in toward the line from each side (more from the side with more of the
  // market), sparks fly where they meet, and the line flares when the odds swing. At the result, the winner floods.
  const battle = (() => {
    const cv = $("lvLight"), g = cv.getContext("2d"), stage = $("stage");
    const UP = [46, 229, 157], DN = [255, 90, 114];
    let W = 0, H = 0, dpr = 1, p = 0.5, show = 0.5, live = false, dim = 0, flood = null, last = performance.now(), t = 0, streaks = [], sparks = [], seen = true, raf = 0;
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    function size() { dpr = Math.min(2, devicePixelRatio || 1); W = stage.clientWidth; H = stage.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    // where the two lights meet, at height y: the market's share, bent into tongues of flame that move faster when it swings
    const front = (y, swing) => show * W + (9 * Math.sin(y * 0.035 + t * 2.1) + 6 * Math.sin(y * 0.083 - t * 3.4) + 3 * Math.sin(y * 0.19 + t * 5.3)) * (1 + swing * 3) * (flood ? 0.4 : 1) * Math.min(1, W / 760);
    function side(c, fromLeft, swing) {
      g.beginPath(); g.moveTo(fromLeft ? 0 : W, 0);
      for (let y = 0; y <= H; y += 6) g.lineTo(front(y, swing), y);
      g.lineTo(fromLeft ? 0 : W, H); g.closePath();
      const x = show * W, gr = g.createLinearGradient(fromLeft ? 0 : W, 0, x, 0);
      const k = live ? 1 : 0.45;
      gr.addColorStop(0, rgba(c, 0.03 * k)); gr.addColorStop(0.6, rgba(c, 0.1 * k)); gr.addColorStop(0.9, rgba(c, 0.28 * k)); gr.addColorStop(1, rgba(c, 0.55 * k));
      g.fillStyle = gr; g.fill();
      // a soft bloom of the side's colour toward the clash
      const bl = g.createRadialGradient(x, H / 2, 0, x, H / 2, Math.max(W, H) * 0.55);
      bl.addColorStop(0, rgba(c, 0.12 * k)); bl.addColorStop(1, rgba(c, 0));
      g.fillStyle = bl; g.fill();
    }
    function draw(nowMs) {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000)); last = nowMs; t += dt;
      const want = flood ? (flood.dir === "up" ? 1.06 : -0.06) : p;
      const swing = Math.min(1, Math.abs(want - show) * 6);
      show += (want - show) * Math.min(1, dt * (flood ? 2.2 : 1.6));
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      side(UP, true, swing); side(DN, false, swing);
      // streaks of light running in toward the clash, more from the bigger side
      if (!reduce && live) for (const [c, left, share] of [[UP, true, p], [DN, false, 1 - p]]) {
        if (Math.random() < dt * (2 + 12 * share) * (1 + swing * 3)) streaks.push({ c, left, y: Math.random() * H, x: left ? -60 : W + 60, v: 320 + Math.random() * 520, l: 40 + Math.random() * 110 });
      }
      streaks = streaks.filter(s => {
        s.x += (s.left ? 1 : -1) * s.v * dt; const fx = front(s.y, swing);
        if (s.left ? s.x > fx : s.x < fx) { for (let k = 0; k < 3; k++) sparks.push({ x: fx, y: s.y, vx: (s.left ? -1 : 1) * (40 + Math.random() * 160), vy: (Math.random() - 0.5) * 220, life: 0.5 + Math.random() * 0.5, c: s.c }); return false; }
        const gr = g.createLinearGradient(s.x - (s.left ? s.l : -s.l), 0, s.x, 0); gr.addColorStop(0, rgba(s.c, 0)); gr.addColorStop(1, rgba(s.c, 0.7));
        g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s.x - (s.left ? s.l : -s.l), s.y); g.lineTo(s.x, s.y); g.stroke();
        return true;
      });
      // the clash: a hot glow and a white core along the meeting line, flaring with the swing
      if (!flood || Math.abs(show - want) > 0.02) {
        const heat = (live ? 0.6 : 0.25) + swing * 0.9;
        for (const [w, a, c] of [[34, 0.1 * heat, [255, 255, 255]], [14, 0.22 * heat, [255, 240, 220]], [2.2, 0.85 * Math.min(1, heat + 0.2), [255, 255, 255]]]) {
          g.strokeStyle = rgba(c, a); g.lineWidth = w; g.beginPath();
          for (let y = 0; y <= H; y += 6) y ? g.lineTo(front(y, swing), y) : g.moveTo(front(0, swing), 0);
          g.stroke();
        }
        if (!reduce && live) for (let k = 0; k < 1 + swing * 14; k++) if (Math.random() < 0.6) { const y = Math.random() * H, x = front(y, swing); sparks.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.3 + Math.random() * 0.6, c: Math.random() < 0.5 ? UP : DN }); }
      }
      sparks = sparks.filter(s => { s.life -= dt; if (s.life <= 0) return false; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.96; s.vy *= 0.96; g.fillStyle = rgba(s.c, Math.min(1, s.life * 1.6)); g.fillRect(s.x - 1, s.y - 1, 2.2, 2.2); return true; }).slice(-500);
      // the lock: the floor dims in the last seconds
      g.globalCompositeOperation = "source-over";
      if (dim > 0) { g.fillStyle = `rgba(3,4,7,${(0.45 * dim).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (flood) { g.fillStyle = `rgba(3,4,7,${Math.min(0.42, (t - flood.at) * 0.6).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (flood && t - flood.at > 0.15 && t - flood.at < 0.8) { g.fillStyle = rgba(flood.dir === "up" ? UP : DN, 0.25 * (1 - (t - flood.at) / 0.8)); g.fillRect(0, 0, W, H); }
      if (seen && !document.hidden && !reduce) raf = requestAnimationFrame(draw);
    }
    const wake = () => { if (!raf && seen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(draw); } };
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; wake(); }).observe(stage);
    document.addEventListener("visibilitychange", wake);
    addEventListener("resize", () => { size(); if (reduce) draw(performance.now()); });
    size(); wake();
    return {
      set(v) { live = v !== null; p = v === null ? 0.5 : v; if (reduce) { show = p; draw(performance.now()); } },
      dim(v) { dim = v; },
      flood(dir) { flood = { dir, at: t }; if (reduce) { show = dir === "up" ? 1 : 0; draw(performance.now()); } },
      reset() { flood = null; },
    };
  })();

  // ---------- the round: clock, odds, lock and result ----------
  function tick() {
    const n = now(), cur = Math.floor(n / Q) * Q, left = cur + Q - n;
    $("clock").textContent = mmss(left);
    $("bar").style.width = `${((n - cur) / Q) * 100}%`;
    $("roundLine").textContent = `Bitcoin up or down · round ${time(cur)}–${time(cur + Q)}`;
    // the lock moment: the last 10 s count down over the battle
    const locking = left <= LOCK;
    $("lock").classList.toggle("on", locking);
    $("lockN").textContent = String(Math.max(1, Math.ceil(left / 1000)));
    battle.dim(locking ? 1 - left / LOCK : 0);
    if (S.round && cur !== S.round) roundOver(S.round);
    if (cur !== S.round) { S.round = cur; S.calls.clear(); $("calls").innerHTML = ""; loadCalls(); loadMarket(); }
  }
  // the close: say so, and watch for Kalshi's result to flood the battle
  function roundOver(r) {
    $("say").textContent = "Calls closed. Waiting for Kalshi's result.";
    let tries = 0;
    const look = async () => {
      const prev = await get(`rounds/${r}/calls`).catch(() => null);
      if (prev && prev.result) { showResult(prev); return; }
      if (++tries < 40) setTimeout(look, 3000);
    };
    setTimeout(look, DEMO ? 2600 : 4000);
  }
  function showResult(prev) {
    if (S.prevShown === prev.round) return;
    S.prevShown = prev.round;
    const up = prev.result === "up";
    battle.flood(prev.result);
    const box = $("result");
    box.innerHTML = `<span>Bitcoin went</span><b>${up ? "Up" : "Down"}</b>`; box.className = `lv-result on ${up ? "up" : "dn"}`;
    $("say").textContent = `Bitcoin went ${up ? "up" : "down"} last round.`;
    renderPrev(prev);
    setTimeout(() => { box.className = "lv-result"; battle.reset(); $("say").textContent = ""; }, 4200);
  }
  function renderPrev(prev) {
    const right = prev.calls.filter(c => c.correct === true).length, wrong = prev.calls.filter(c => c.correct === false).length;
    $("prev").innerHTML = prev.result ? `Bitcoin went <b class="${prev.result === "up" ? "up" : "dn"}">${prev.result === "up" ? "▲ Up" : "▼ Down"}</b><span>${right} right · ${wrong} wrong · ${time(prev.round)}–${time(prev.round + Q)}</span>` : "Waiting for Kalshi.";
  }
  async function loadMarket() {
    const m = await get("market").catch(() => null), pr = m && m.price;
    if (!pr || pr.up == null || pr.down == null) { battle.set(null); $("upPct").textContent = "–"; $("dnPct").textContent = "–"; $("target").textContent = "Waiting for Kalshi's odds"; return; }
    const p = pr.up / (pr.up + pr.down);
    battle.set(p);
    $("upPct").textContent = `${Math.round(p * 100)}%`; $("dnPct").textContent = `${100 - Math.round(p * 100)}%`;
    $("target").textContent = pr.target ? `Above or below ${money(pr.target)}` : "Kalshi's odds";
    $("stage").setAttribute("aria-label", `Kalshi gives Above ${Math.round(p * 100)} percent, Below ${100 - Math.round(p * 100)} percent`);
  }

  // ---------- the calls, as they land ----------
  function callRow(c) {
    const dir = c.sealed ? `<span class="lv-sealed">Sealed</span>` : c.direction === "up" ? `<b class="up">▲ Up</b>` : `<b class="dn">▼ Down</b>`;
    const price = c.price ? `<span class="lv-paid">@${Math.round(c.price.paid * 100)}¢</span>` : "";
    return `<li class="lv-call k-${esc(c.kind)}" data-id="${esc(c.id)}"><canvas class="lv-sig" width="56" height="56" aria-hidden="true"></canvas>
      <span class="lv-who"><a href="profile?e=${encodeURIComponent(c.slug)}">${esc(c.name)}</a><small>${esc(KIND[c.kind] || c.kind)}</small></span>
      <span class="lv-dir">${dir}${price}</span><time>${mmss(c.receivedAt - S.round)} in</time></li>`;
  }
  async function loadCalls() {
    const r = S.round, data = await get(`rounds/${r}/calls`).catch(() => null);
    if (!data || r !== S.round) return;
    const list = $("calls");
    $("count").textContent = String(data.calls.length);
    if (!data.calls.length) { list.innerHTML = `<li class="lv-empty">No calls yet this round. Bots and chart scripts show theirs at once; callers' stay sealed until the close.</li>`; return; }
    list.querySelector(".lv-empty")?.remove();
    for (const c of [...data.calls].reverse()) { // oldest first, so the newest ends up on top
      const key = c.id, had = S.calls.get(key);
      if (had && had === JSON.stringify([c.direction, c.sealed, c.price && c.price.paid])) continue;
      S.calls.set(key, JSON.stringify([c.direction, c.sealed, c.price && c.price.paid]));
      const tmp = document.createElement("ol"); tmp.innerHTML = callRow(c); const li = tmp.firstElementChild;
      const old = list.querySelector(`[data-id="${CSS.escape(key)}"]`);
      if (old) old.replaceWith(li); else { list.prepend(li); if (!reduce) li.classList.add("new"); }
      if (window.D3Sigils) window.D3Sigils.draw(li.querySelector("canvas").getContext("2d"), c.kind, 28, 28, 40, { t: 1, a: 1, lit: 0.4 });
    }
    while (list.children.length > 40) list.lastElementChild.remove();
  }

  // ---------- last round, this hour, who's here ----------
  async function loadPrev() { const prev = await get(`rounds/${S.round - Q}/calls`).catch(() => null); if (prev) { renderPrev(prev); S.prevShown = prev.result ? prev.round : 0; } }
  async function loadHour() {
    const cur = await get("tournaments").catch(() => null), h = cur && cur.tournaments.find(t => t.kind === "hourly");
    if (!h) return;
    const t = (await get(`tournaments/${h.id}`).catch(() => null))?.tournament;
    if (!t) return;
    $("hour").innerHTML = t.standings.length ? t.standings.slice(0, 5).map(r => `<li><span class="r">${r.rank}</span><a href="profile?e=${encodeURIComponent(r.entrant.slug)}">${esc(r.entrant.name)}</a><span class="s">${r.correct} right · ${Math.round(r.accuracy * 100)}%</span></li>`).join("")
      : `<li class="lv-empty">No bots in this one yet. <a href="my">Join from My bots</a></li>`;
  }
  async function loadHere() { const p = await get("presence").catch(() => null); if (p) $("here").textContent = p.here > 0 ? `${p.here} here now` : ""; }

  // ---------- the chat ----------
  async function loadChat() {
    const c = await get("hall/chat?limit=40").catch(() => null);
    if (!c) return;
    $("disc").hidden = !c.discord;
    const box = $("msgs"), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    if (!c.messages.length) return;
    box.querySelector(".lv-empty")?.remove();
    for (const m of c.messages) {
      if (S.chatIds.has(m.id)) continue; S.chatIds.add(m.id);
      const li = document.createElement("li"); li.className = `lv-msg${m.as ? ` as-${m.as}` : ""}`;
      li.innerHTML = `<b>${esc(m.name)}</b>${m.from === "discord" ? '<span class="lv-via">Discord</span>' : ""}<time>${esc(time(m.at))}</time><p>${esc(m.text)}</p>`;
      box.append(li);
    }
    while (box.children.length > 80) box.firstElementChild.remove();
    if (atEnd || box.dataset.first !== "1") { box.scrollTop = box.scrollHeight; box.dataset.first = "1"; }
  }
  $("chatForm").addEventListener("submit", async e => {
    e.preventDefault();
    const input = $("chatText"), text = input.value.trim();
    if (!text) return;
    $("chatErr").textContent = "";
    try { if (DEMO) { $("chatErr").textContent = "This is a preview, so messages aren't sent."; return; } await A.api("POST", "hall/chat", { text }); input.value = ""; loadChat(); }
    catch (err) { $("chatErr").textContent = err.message; }
  });

  // ---------- the stream ----------
  async function loadVideo() {
    const v = (await get("hall/video").catch(() => null))?.video, box = $("video");
    $("pStream").hidden = !v; $("tStream").hidden = !v;
    if (!v) { box.innerHTML = ""; return; }
    if (box.dataset.id === v.id) return;
    box.dataset.id = v.id; box.classList.toggle("tall", v.kind === "short");
    box.innerHTML = `<button type="button" class="lv-play" aria-label="Play ${esc(v.title || "the stream")}"><img src="${esc(v.thumb)}" alt=""><span>▶</span></button>${v.title ? `<p>${esc(v.title)}</p>` : ""}<a class="lv-more" href="${esc(v.watch)}" target="_blank" rel="noopener">Open on YouTube</a>`;
    box.querySelector(".lv-play").addEventListener("click", () => {
      const f = document.createElement("iframe");
      f.src = `${v.embed}?autoplay=1&rel=0`; f.title = v.title || "Stream"; f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
      box.querySelector(".lv-play").replaceWith(f);
    });
  }

  // ---------- tabs on phones ----------
  const tabs = { tRound: "round", tChat: "chat", tStream: "stream" };
  for (const id of Object.keys(tabs)) $(id).addEventListener("click", () => {
    document.querySelector("main.lv").dataset.tab = tabs[id];
    for (const k of Object.keys(tabs)) $(k).setAttribute("aria-selected", String(k === id));
    if (tabs[id] === "chat") { const b = $("msgs"); b.scrollTop = b.scrollHeight; }
  });

  // ---------- start ----------
  (async () => {
    if (!DEMO) await A.syncClock().catch(() => {});
    S.me = DEMO ? null : await A.session().catch(() => null);
    $("chatForm").hidden = !S.me && !DEMO; $("chatSignin").hidden = !!S.me || DEMO;
    tick(); setInterval(tick, 250);
    // the live feed first: it counts us in "here now", and brings chat and stream changes at once
    if (!DEMO) A.follow(["hall"], type => { if (type === "hall.chat") loadChat().catch(() => {}); if (type === "hall.video") loadVideo().catch(() => {}); }, on => { $("liveDot").classList.toggle("on", on); if (on) setTimeout(() => loadHere().catch(() => {}), 800); });
    else $("liveDot").classList.add("on");
    await Promise.all([loadPrev(), loadHour(), loadHere(), loadChat(), loadVideo()].map(p => p.catch(() => {})));
    setInterval(() => loadMarket().catch(() => {}), 5000);
    setInterval(() => loadCalls().catch(() => {}), 5000);
    setInterval(() => loadHere().catch(() => {}), 30000);
    setInterval(() => loadHour().catch(() => {}), 60000);
    setInterval(() => loadChat().catch(() => {}), DEMO ? 3000 : 20000);
  })();
})();
