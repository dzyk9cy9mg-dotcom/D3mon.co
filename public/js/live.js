// The trading floor (/live): a thin client over /api/v1. The round open now and its clock; Kalshi's odds as two laser
// beams colliding (teal Above against rose Below, meeting where the market stands, flaring when the odds swing); the
// members' own Up/Down votes (docs/VOTES.md) with cash out, the floor's split and badge holders' calls; every call
// as it lands; the lock moment (the last 10 s count down, then the close); the result flooding the battle in the
// winner's colour; last round and this hour's tournament; the Showdowns on now; the chat (linked with the D3MON Discord) and the stream.
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
          return Promise.resolve({ round: cur, result: null, calls: names.slice(0, k).map(([name, kind], i) => ({ id: `c${cur}${i}`, name, kind, slug: name.toLowerCase(), ...(n < cur + Q ? { sealed: true } : { direction: (i * 7 + Math.floor(cur / Q)) % 3 ? "up" : "down", price: { paid: +(0.38 + ((i * 13) % 30) / 100).toFixed(2) } }), receivedAt: cur + (i + 1) * (FAST ? 5000 : 40000) })).reverse() });
        }
        if (path === "presence") return Promise.resolve({ here: 23 + Math.floor(Math.random() * 6) });
        if (path.startsWith("hall/chat")) {
          const k = Math.min(chat.length, 2 + Math.floor((n - t0) / 6000));
          msgs = chat.slice(0, k).map(([name, text, as], i) => ({ id: `m${i}`, at: t0 + i * 6000, name, text, ...(as ? { as } : {}), ...(i === 4 ? { from: "discord" } : {}) }));
          return Promise.resolve({ messages: msgs, discord: true });
        }
        if (path === "hall/video") return Promise.resolve({ video: null });
        if (path === "votes/round") {
          const who = ["Maya", "Dex", "Rook", "Odin", "Lena", "Ghost", "Sky"], k = Math.min(who.length, 2 + Math.floor((n - t0) / 4000));
          const actions = who.slice(0, k).map((name, i) => ({ id: `v${cur}${i}`, name, action: "enter", dir: i % 3 ? "up" : "down", paid: +(0.4 + (i % 4) * 0.07).toFixed(2), at: cur + (i + 1) * 20000, badge: name === "Maya" || name === "Ghost" ? "auto" : name === "Odin" ? "admin" : null }));
          const ups = actions.filter(a => a.dir === "up").length;
          return Promise.resolve({ round: cur, mode: "locked", split: { up: ups, down: k - ups, openUp: ups, openDown: k - ups, entries: k, voters: k }, actions, mine: [], open: null, canVote: true });
        }
        if (path === "showdowns") {
          const d = (r, a, b, c) => ({ round: r, endsAt: r + Q, from: a, to: b, ...c });
          return Promise.resolve({ live: [
            { sid: "d1", state: "live", rounds: 3, from: { name: "Maya" }, to: { name: "Kain", ai: true }, score: { from: { right: 1 }, to: { right: 0 } }, detail: [d(cur - Q, {}, {}), d(cur, { sealed: true }, { sealed: true }), d(cur + Q, null, null)] },
            { sid: "d2", state: "live", rounds: 1, from: { name: "Rook" }, to: { name: "Ghost" }, score: { from: { right: 0 }, to: { right: 0 } }, detail: [d(cur, { sealed: true }, null)] },
            { sid: "d3", state: "starting", rounds: 5, startsAt: cur + Q, from: { name: "Dex" }, to: { name: "Abel", ai: true }, score: { from: { right: 0 }, to: { right: 0 } }, detail: [] },
          ] });
        }
        if (path === "tournaments") return Promise.resolve({ tournaments: [{ kind: "hourly", id: "h" }] });
        if (path.startsWith("tournaments/")) return Promise.resolve({ tournament: { settledRounds: 2, rounds: 4, standings: [["Valhalla", 2, 1], ["Kronos", 2, 1], ["Tidewater", 1, 0.5]].map(([name, correct, acc], i) => ({ rank: i + 1, correct, accuracy: acc, entrant: { name, slug: name.toLowerCase() } })) } });
        return Promise.resolve({});
      },
    };
  }

  // ---------- the battle of light: two laser beams colliding ----------
  // (owner, 2026-10-20: "more like two laser beams colliding", in colours that suit the site.) Above fires a teal
  // beam from the left, Below a rose beam from the right; they collide where the market stands, in a white-gold
  // burst (the site's gold) that throws sparks and shock rings, flaring when the odds swing. Each beam is thicker
  // the more of the market it holds, and pulses of light run along it into the collision. At the result, the
  // winner's beam drives straight through.
  const battle = (() => {
    const cv = $("lvLight"), g = cv.getContext("2d"), stage = $("stage");
    const UP = [54, 230, 195], DN = [255, 79, 122], GOLD = [255, 197, 106], WHITE = [255, 250, 240];
    let W = 0, H = 0, dpr = 1, p = 0.5, show = 0.5, live = false, dim = 0, flood = null, last = performance.now(), t = 0, pulses = [], sparks = [], rings = [], seen = true, raf = 0, ringAt = 0;
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    function size() { dpr = Math.min(2, devicePixelRatio || 1); W = stage.clientWidth; H = stage.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    const Y = () => H * 0.46; // the beams' line, a little above the clock
    // one beam from x0 to x1: a wide soft glow, a coloured body and a white-hot core, flickering slightly
    function beam(c, x0, x1, share, k) {
      const y = Y(), thick = (0.5 + share) * Math.min(1, H / 300), fl = 1 + 0.08 * Math.sin(t * 37 + x0) + 0.05 * Math.sin(t * 61);
      for (const [w, a, col] of [[46, 0.07, c], [20, 0.18, c], [8, 0.55, c], [2.6, 0.95, WHITE]]) {
        const gr = g.createLinearGradient(x0, 0, x1, 0);
        gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.18, rgba(col, a * 0.6 * k)); gr.addColorStop(1, rgba(col, a * k));
        g.strokeStyle = gr; g.lineWidth = w * thick * fl; g.lineCap = "round";
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      }
    }
    function draw(nowMs) {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000)); last = nowMs; t += dt;
      const want = flood ? (flood.dir === "up" ? 1.08 : -0.08) : p;
      const swing = Math.min(1, Math.abs(want - show) * 6);
      show += (want - show) * Math.min(1, dt * (flood ? 2.4 : 1.6));
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      const k = live ? 1 : 0.4, x = Math.max(-40, Math.min(W + 40, show * W)), y = Y();
      // a faint haze of each colour on its own side
      for (const [c, left] of [[UP, true], [DN, false]]) {
        const hz = g.createRadialGradient(left ? 0 : W, y, 0, left ? 0 : W, y, W * 0.7);
        hz.addColorStop(0, rgba(c, 0.07 * k)); hz.addColorStop(1, rgba(c, 0));
        g.fillStyle = hz; g.fillRect(left ? 0 : x, 0, left ? x : W - x, H);
      }
      beam(UP, 0, x, p, k); beam(DN, W, x, 1 - p, k);
      // pulses running along each beam into the collision, more on the side holding more of the market
      if (!reduce && live) for (const [c, left, share] of [[UP, true, p], [DN, false, 1 - p]]) {
        if (Math.random() < dt * (1.5 + 7 * share) * (1 + swing * 2)) pulses.push({ c, left, x: left ? -20 : W + 20, v: 700 + Math.random() * 600 });
      }
      pulses = pulses.filter(q => {
        q.x += (q.left ? 1 : -1) * q.v * dt;
        if (q.left ? q.x >= x : q.x <= x) { for (let n = 0; n < 6; n++) sparks.push(spark(x, y, q.c, q.left)); return false; }
        const gr = g.createRadialGradient(q.x, y, 0, q.x, y, 16); gr.addColorStop(0, rgba(WHITE, 0.9 * k)); gr.addColorStop(0.35, rgba(q.c, 0.55 * k)); gr.addColorStop(1, rgba(q.c, 0));
        g.fillStyle = gr; g.fillRect(q.x - 16, y - 16, 32, 32);
        return true;
      });
      // the collision: a white-gold burst, bigger when the odds swing
      if (!flood || Math.abs(show - want) > 0.02) {
        const heat = (live ? 0.75 : 0.3) + swing * 0.9, r = (26 + 30 * heat) * (1 + 0.12 * Math.sin(t * 23)) * Math.min(1.2, H / 260);
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
        gr.addColorStop(0, rgba(WHITE, Math.min(1, 0.95 * heat))); gr.addColorStop(0.12, rgba(GOLD, 0.7 * heat)); gr.addColorStop(0.4, rgba(GOLD, 0.16 * heat)); gr.addColorStop(1, rgba(GOLD, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.4, 0, 6.2832); g.fill();
        // a thin vertical flare through the collision
        const vf = g.createLinearGradient(0, y - r * 2.6, 0, y + r * 2.6); vf.addColorStop(0, rgba(GOLD, 0)); vf.addColorStop(0.5, rgba(WHITE, 0.55 * heat)); vf.addColorStop(1, rgba(GOLD, 0));
        g.fillStyle = vf; g.fillRect(x - 1.2, y - r * 2.6, 2.4, r * 5.2);
        if (!reduce && live) {
          for (let n = 0; n < 1 + swing * 10; n++) if (Math.random() < 0.7) sparks.push(spark(x, y, Math.random() < 0.5 ? UP : DN, Math.random() < 0.5));
          if (swing > 0.25 && t - ringAt > 0.35) { rings.push({ x, y, r: 6, a: 0.5 * swing }); ringAt = t; }
        }
      }
      rings = rings.filter(o => { o.r += 220 * dt; o.a -= 0.7 * dt; if (o.a <= 0) return false; g.strokeStyle = rgba(GOLD, o.a); g.lineWidth = 1.5; g.beginPath(); g.ellipse(o.x, o.y, o.r, o.r * 0.55, 0, 0, 6.2832); g.stroke(); return true; });
      sparks = sparks.filter(q => { q.life -= dt; if (q.life <= 0) return false; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; g.strokeStyle = rgba(q.c, Math.min(1, q.life * 1.8)); g.lineWidth = 1.4; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.025, q.y - q.vy * 0.025); g.stroke(); return true; }).slice(-400);
      // the lock: the floor dims in the last seconds; the result: the winner's colour washes over
      g.globalCompositeOperation = "source-over";
      if (dim > 0) { g.fillStyle = `rgba(3,4,7,${(0.45 * dim).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (flood) { g.fillStyle = `rgba(3,4,7,${Math.min(0.42, (t - flood.at) * 0.6).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (flood && t - flood.at > 0.15 && t - flood.at < 0.8) { g.fillStyle = rgba(flood.dir === "up" ? UP : DN, 0.22 * (1 - (t - flood.at) / 0.8)); g.fillRect(0, 0, W, H); }
      if (seen && !document.hidden && !reduce) raf = requestAnimationFrame(draw);
    }
    // a spark thrown back from the collision, mostly up and down and back along its own beam
    const spark = (x, y, c, left) => ({ x, y, c, vx: (left ? -1 : 1) * (60 + Math.random() * 260), vy: (Math.random() - 0.5) * 420, life: 0.25 + Math.random() * 0.5 });
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
    if (cur !== S.round) { S.round = cur; S.calls.clear(); $("calls").innerHTML = ""; loadCalls(); loadMarket(); loadVotes(); setTimeout(() => loadRecord().catch(() => {}), 20000); }
  }
  // the close: say so, and watch for Kalshi's result to flood the battle
  function roundOver(r) {
    $("say").textContent = "Calls are closed. Awaiting settlement.";
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
    $("prev").innerHTML = prev.result ? `Bitcoin went <b class="${prev.result === "up" ? "up" : "dn"}">${prev.result === "up" ? "▲ Up" : "▼ Down"}</b><span>${right} right · ${wrong} wrong · ${time(prev.round)}–${time(prev.round + Q)}</span>` : "Awaiting settlement.";
  }
  async function loadMarket() {
    const m = await get("market").catch(() => null), pr = m && m.price;
    if (!pr || pr.up == null || pr.down == null) { S.p = null; S.price = null; battle.set(null); $("upPct").textContent = "–"; $("dnPct").textContent = "–"; $("target").textContent = "Reading the market"; return; }
    const p = pr.up / (pr.up + pr.down);
    S.p = p; S.price = pr; battle.set(p); if (V.data) renderVotes();
    $("upPct").textContent = `${Math.round(p * 100)}%`; $("dnPct").textContent = `${100 - Math.round(p * 100)}%`;
    $("target").textContent = pr.target ? `Above or below ${money(pr.target)}` : "The market's odds";
    $("stage").setAttribute("aria-label", `The market gives Above ${Math.round(p * 100)} percent, Below ${100 - Math.round(p * 100)} percent`);
  }

  // ---------- the calls, as they land ----------
  function callRow(c) {
    const dir = c.sealed ? `<span class="lv-sealed">Revealed at the round's end</span>` : c.direction === "up" ? `<b class="up">▲ Up</b>` : `<b class="dn">▼ Down</b>`;
    const price = c.price ? `<span class="lv-paid">@${Math.round(c.price.paid * 100)}¢</span>` : "";
    return `<li class="lv-call k-${esc(c.kind)}" data-id="${esc(c.id)}"><canvas class="lv-sig" width="56" height="56" aria-hidden="true"></canvas>
      <span class="lv-who"><a href="profile?e=${encodeURIComponent(c.slug)}">${esc(c.name)}</a><small>${esc(KIND[c.kind] || c.kind)}</small></span>
      <span class="lv-dir">${dir}${price}</span><time>${mmss(c.receivedAt - S.round)} in</time>${c.why ? `<p class="lv-why">${esc(c.why)}</p>` : c.hasWhy ? `<p class="lv-why lv-why-sealed">Reasoning shown when the calls close</p>` : ""}</li>`;
  }
  async function loadCalls() {
    const r = S.round, data = await get(`rounds/${r}/calls`).catch(() => null);
    if (!data || r !== S.round) return;
    const list = $("calls");
    $("count").textContent = String(data.calls.length);
    // bots' and scripts' calls are hidden until the round ends (owner, 2026-10-23): only their totals show, from 3 calls
    const cr = data.crowd, bot = n => `${n} ${n === 1 ? "bot" : "bots"}`;
    $("tally").innerHTML = !cr || !cr.called ? "" : cr.up !== null
      ? `Bots and scripts so far: <b class="up">${cr.up} Up</b> · <b class="dn">${cr.down} Down</b>`
      : `${bot(cr.called)} called. Totals show once ${cr.min} have.`;
    if (!data.calls.length) { list.innerHTML = `<li class="lv-empty">No calls yet this round. Every call is revealed when the round ends.</li>`; return; }
    list.querySelector(".lv-empty")?.remove();
    for (const c of [...data.calls].reverse()) { // oldest first, so the newest ends up on top
      const key = c.id, had = S.calls.get(key);
      if (had && had === JSON.stringify([c.direction, c.sealed, c.price && c.price.paid, c.why])) continue;
      S.calls.set(key, JSON.stringify([c.direction, c.sealed, c.price && c.price.paid, c.why]));
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
  // ---------- Showdowns on now: 1-on-1s between members, or against Kain and Abel (calls stay sealed until they close) ----------
  function sdName(x) { return esc(x.name) + (x.ai ? ' <span class="ai">AI</span>' : ""); }
  async function loadShowdowns() {
    const d = await get("showdowns").catch(() => null);
    if (!d || !d.live) return;
    const t = now();
    $("sdCount").textContent = d.live.length;
    $("sdList").innerHTML = d.live.length ? d.live.slice(0, 8).map(s => {
      const i = s.detail.findIndex(r => t >= r.round && t < r.endsAt), n = i < 0 ? 0 : i + 1;
      const where = s.state === "starting" ? `Starts ${time(s.startsAt)}` : `Round ${n} of ${s.rounds}`;
      const r = i < 0 ? null : s.detail[i], called = r ? [r.from, r.to].filter(c => c && !c.missed).length : 0;
      const calls = r && s.state === "live" ? ` · ${called === 2 ? "both called" : called === 1 ? "1 called" : "no calls yet"}` : "";
      const np = s.picks ? s.picks.from + s.picks.to : 0, picks = np ? ` · ${np} pick${np > 1 ? "s" : ""}` : "";
      return `<li><a href="showdown?id=${s.sid}"><span class="vs">${sdName(s.from)} <b>${s.score.from.right}–${s.score.to.right}</b> ${sdName(s.to)}</span><span class="s">${where}${calls}${picks}</span></a></li>`;
    }).join("") : `<li class="lv-empty">No Showdowns on right now.</li>`;
  }
  async function loadHere() { const p = await get("presence").catch(() => null); if (p) $("here").textContent = p.here > 0 ? `${p.here} here now` : ""; }

  // ---------- the members' votes (docs/VOTES.md) ----------
  // Up or Down on the round, priced at Kalshi; cash out and go again. The floor's split, the latest votes, and a
  // pop-up whenever a badge holder (a caller, bot or script owner, or someone an admin chose) enters.
  const V = { data: null, busy: false, seenBadge: new Set() };
  const cents = x => (x == null ? "" : `${Math.round(x * 100)}¢`);
  const signed = x => (x == null ? "" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}¢`);
  function renderVotes() {
    const d = V.data; if (!d) return;
    const sp = d.split, total = sp.openUp + sp.openDown, up = total ? sp.openUp / total : 0.5;
    $("splitUp").style.width = `${up * 100}%`; $("splitDn").style.width = `${(1 - up) * 100}%`;
    $("crowd").textContent = total ? `The floor: ${Math.round(up * 100)}% Up · ${total} in` : sp.entries ? `${sp.voters} voted this round` : "Be the first to call it";
    const signedIn = !!S.me || DEMO, o = d.open;
    $("vSignin").hidden = signedIn; $("vbtns").hidden = !signedIn || d.canVote === false;
    $("vOff").hidden = d.canVote !== false;
    $("vUp").hidden = $("vDn").hidden = false;
    $("vOut").hidden = !o;
    if (o) {
      const changeable = d.mode === "changeable";
      $("vUp").hidden = o.dir === "up" || !changeable; $("vDn").hidden = o.dir === "down" || !changeable;
      $("vUp").textContent = "Switch to ▲ Up"; $("vDn").textContent = "Switch to ▼ Down";
      // what it's worth now: Kalshi's price to sell that side, read from the other side's ask
      const nowWorth = S.p == null ? null : o.dir === "up" ? S.price && S.price.down != null ? 1 - S.price.down : null : S.price && S.price.up != null ? 1 - S.price.up : null;
      const pl = nowWorth != null && o.paid != null ? nowWorth - o.paid : null;
      $("vMine").innerHTML = `You're in <b class="${o.dir === "up" ? "up" : "dn"}">${o.dir === "up" ? "▲ Up" : "▼ Down"}</b>${o.paid != null ? ` @ ${cents(o.paid)}` : ""}${pl != null ? ` · <span class="${pl >= 0 ? "up" : "dn"}">${signed(pl)} if you cash out now</span>` : ""}`;
    } else {
      $("vUp").textContent = "▲ Up"; $("vDn").textContent = "▼ Down";
      const done = (d.mine || []).filter(t => t.status === "cashed");
      $("vMine").innerHTML = done.length ? `This round: ${done.map(t => t.profit == null ? "cashed out" : `<span class="${t.profit >= 0 ? "up" : "dn"}">${signed(t.profit)}</span>`).join(" · ")}` : signedIn ? "Call it: Up or Down by the end of the round." : "";
    }
    $("vFeed").innerHTML = d.actions.slice(-8).reverse().map(a => `<li${a.badge ? ' class="b"' : ""}>${a.username ? `<a href="profile?u=${encodeURIComponent(a.username)}"><b>${esc(a.name)}</b></a>` : `<b>${esc(a.name)}</b>`}${a.badge ? '<i aria-label="badge">★</i>' : ""} ${a.action === "exit" ? `cashed out${a.got != null ? ` @ ${cents(a.got)}` : ""}` : `${a.action === "switch" ? "switched to" : "called"} <span class="${a.dir === "up" ? "up" : "dn"}">${a.dir === "up" ? "▲ Up" : "▼ Down"}</span>${a.paid != null ? ` @ ${cents(a.paid)}` : ""}`}<time>${mmss(a.at - d.round)} in</time></li>`).join("") || `<li class="lv-empty">No calls from the floor yet. Be the first.</li>`;
  }
  async function loadVotes() {
    const d = await get("votes/round").catch(() => null);
    if (!d) return;
    V.data = d; renderVotes();
    for (const a of d.actions) if (a.badge && a.action !== "exit" && !V.seenBadge.has(a.id)) { V.seenBadge.add(a.id); if (V.ready) toast(a); }
    V.ready = true;
  }
  // a badge holder's call pops up for everyone on the floor
  function toast(a) {
    const box = $("toasts"), el = document.createElement("div");
    el.className = `lv-toast ${a.dir === "up" ? "up" : "dn"}`;
    el.innerHTML = `<i aria-hidden="true">★</i><span>${a.badge === "guest" ? "Guest caller " : ""}<b>${esc(a.name)}</b> called <b>${a.dir === "up" ? "▲ UP" : "▼ DOWN"}</b>${a.paid != null ? ` @ ${cents(a.paid)}` : ""}</span>`;
    box.append(el);
    setTimeout(() => el.classList.add("out"), 5200); setTimeout(() => el.remove(), 6000);
  }
  // your record: calls, success, average call time and average profit; private until you show it
  async function loadRecord() {
    if (DEMO || !S.me) return;
    const r = await A.api("GET", "votes/me").catch(() => null), box = $("vRec");
    if (!r || !r.record) return;
    const x = r.record;
    box.hidden = !x.calls;
    box.innerHTML = `<span><b>Your record</b> ${x.calls} call${x.calls === 1 ? "" : "s"}${x.successRate != null ? ` · ${x.successRate}% right` : ""}${x.avgCallMin != null ? ` · ${x.avgCallMin} min in on average` : ""}${x.avgProfit != null ? ` · <span class="${x.avgProfit >= 0 ? "up" : "dn"}">${signed(x.avgProfit)}</span> a call` : ""}</span>
      <button type="button" class="lv-link" id="vPub">${r.public ? "Public · make it private" : "Private · make it public"}</button>`;
    $("vPub").onclick = async () => { await A.api("PUT", "votes/settings", { public: !r.public }).catch(e => { $("vErr").textContent = e.message; }); loadRecord(); };
  }
  // admins: locked or changeable, voting on or off by category, badges
  async function loadAdmin() {
    const admin = S.me && (S.me.role === "admin" || S.me.role === "owner");
    $("vAdm").hidden = !admin || DEMO;
    if (!admin || DEMO) return;
    const c = await A.api("GET", "votes/sessions/live").catch(() => null);
    if (!c) return;
    $("aChange").checked = c.mode === "changeable";
    for (const el of document.querySelectorAll("#vAdm [data-cat]")) el.checked = !c.off.includes(el.dataset.cat);
  }
  async function saveSession() {
    $("aErr").textContent = "";
    const off = [...document.querySelectorAll("#vAdm [data-cat]")].filter(el => !el.checked).map(el => el.dataset.cat);
    try { await A.api("PUT", "votes/sessions/live", { mode: $("aChange").checked ? "changeable" : "locked", off }); loadVotes(); }
    catch (err) { $("aErr").textContent = err.message; loadAdmin(); }
  }
  $("aChange").addEventListener("change", saveSession);
  for (const el of document.querySelectorAll("#vAdm [data-cat]")) el.addEventListener("change", saveSession);
  $("aBadge").addEventListener("submit", async e => {
    e.preventDefault(); $("aErr").textContent = ""; $("aErr").classList.remove("ok");
    const on = (e.submitter || {}).dataset?.on !== "0", username = $("aUser").value.trim();
    try { const r = await A.api("POST", "votes/badges", { username, on }); $("aErr").classList.add("ok"); $("aErr").textContent = r.badge ? `${username} has a badge (${r.badge === "auto" ? "automatic" : "given by an admin"}).` : `${username} has no badge.`; $("aUser").value = ""; }
    catch (err) { $("aErr").textContent = err.message; }
  });

  async function act(path, body) {
    if (V.busy) return;
    $("vErr").textContent = "";
    if (DEMO) { $("vErr").textContent = "This is a preview, so votes aren't sent."; return; }
    V.busy = true;
    try { const r = await A.api("POST", path, body); V.data = r.round; renderVotes(); loadRecord(); }
    catch (err) { $("vErr").textContent = err.message; }
    finally { V.busy = false; }
  }
  $("vUp").addEventListener("click", () => act(V.data && V.data.open ? "votes/change" : "votes", { dir: "up" }));
  $("vDn").addEventListener("click", () => act(V.data && V.data.open ? "votes/change" : "votes", { dir: "down" }));
  $("vOut").addEventListener("click", () => act("votes/exit", {}));

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
    let st = 0; const sdSoon = () => { clearTimeout(st); st = setTimeout(() => loadShowdowns().catch(() => {}), 400); };
    let vt = 0; const votesSoon = () => { clearTimeout(vt); vt = setTimeout(() => loadVotes().catch(() => {}), 250); };
    if (!DEMO) A.follow(["hall", "votes", "showdowns"], (type, data) => {
      if (type === "showdown.updated") sdSoon();
      if (type === "hall.chat") loadChat().catch(() => {}); if (type === "hall.video") loadVideo().catch(() => {});
      if (type === "votes.badge" && data && !V.seenBadge.has(data.id)) { V.seenBadge.add(data.id); toast(data); }
      if (type === "votes.action" || type === "votes.session") votesSoon();
    }, on => { $("liveDot").classList.toggle("on", on); if (on) setTimeout(() => loadHere().catch(() => {}), 800); });
    else $("liveDot").classList.add("on");
    await Promise.all([loadPrev(), loadHour(), loadHere(), loadChat(), loadVideo(), loadVotes(), loadRecord(), loadAdmin(), loadShowdowns()].map(p => p.catch(() => {})));
    setInterval(() => loadVotes().catch(() => {}), DEMO ? 4000 : 30000);
    setInterval(() => loadMarket().catch(() => {}), 5000);
    setInterval(() => loadCalls().catch(() => {}), 5000);
    setInterval(() => loadHere().catch(() => {}), 30000);
    setInterval(() => loadHour().catch(() => {}), 60000);
    setInterval(() => loadShowdowns().catch(() => {}), 30000);
    setInterval(() => loadChat().catch(() => {}), DEMO ? 3000 : 20000);
  })();
})();
