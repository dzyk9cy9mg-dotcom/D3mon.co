// The members' vote panel for a battle or a Capstone session (docs/VOTES.md), the same as the Live page's but on
// its own: put <div data-votes="battle"></div> or <div data-votes="capstone"></div> on a page and load this file
// (after js/arena.js). It finds the battle or Capstone session running now and shows Up, Down, Cash out (and Switch
// where the admins allow it), the floor's split, the latest votes and a pop-up when a badge holder calls. With
// nothing running it stays hidden. In a Capstone session, admins also get a box to name the guest callers.
(function () {
  "use strict";
  const A = window.Arena; if (!A) return;
  const esc = A.esc, roots = [...document.querySelectorAll("[data-votes]")];
  if (!roots.length) return;
  const Q = 15 * 60000;
  const cents = x => (x == null ? "" : `${Math.round(x * 100)}¢`);
  const signed = x => (x == null ? "" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}¢`);
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  let me = null, price = null, toasts = null;

  function toast(a) {
    if (!toasts) { toasts = document.createElement("div"); toasts.className = "vw-toasts"; toasts.setAttribute("aria-live", "polite"); document.body.append(toasts); }
    const el = document.createElement("div");
    el.className = `vw-toast ${a.dir === "up" ? "up" : "dn"}`;
    el.innerHTML = `<i aria-hidden="true">★</i><span>${a.badge === "guest" ? "Guest caller " : ""}<b>${esc(a.name)}</b> called <b class="d">${a.dir === "up" ? "▲ UP" : "▼ DOWN"}</b>${a.paid != null ? ` @ ${cents(a.paid)}` : ""}</span>`;
    toasts.append(el);
    setTimeout(() => el.classList.add("out"), 5200); setTimeout(() => el.remove(), 6000);
  }

  // the battle or Capstone session running now, or null
  async function findSession(kind) {
    const now = A.serverNow();
    if (kind === "battle") {
      const { battles } = await A.api("GET", "battles");
      const b = battles.find(x => x.status !== "draft" && now >= x.startsAt && now < x.endsAt);
      return b ? { session: `battle:${b.id}`, title: b.title, endsAt: b.endsAt } : null;
    }
    const v = await A.api("GET", "vip/sessions"), all = [...(v.upcoming || []), ...(v.past || [])];
    const s = all.find(x => now >= x.startsAt && now < x.endsAt);
    if (!s) return null;
    const info = await A.api("GET", "vip").catch(() => ({}));
    return { session: `capstone:${s.id}`, title: s.title, endsAt: s.endsAt, access: !!info.access, admin: !!info.admin };
  }

  function mount(root) {
    const kind = root.dataset.votes;
    const st = { s: null, data: null, busy: false, seen: new Set(), ready: false };
    root.classList.add("vw"); root.hidden = true;
    root.innerHTML = `<div class="vw-row"><h3 class="vw-h">Your call <span class="vw-t"></span></h3><span class="vw-crowd">The floor</span></div>
      <div class="vw-split" aria-hidden="true"><i class="up"></i><i class="dn"></i></div>
      <div class="vw-btns"><button type="button" class="vw-b up" data-a="up">▲ Up</button><button type="button" class="vw-b dn" data-a="down">▼ Down</button><button type="button" class="vw-b out" data-a="out" hidden>Cash out</button></div>
      <p class="vw-mine" aria-live="polite"></p><p class="vw-msg" hidden></p><p class="vw-err" role="alert"></p>
      <ol class="vw-feed"></ol>
      <form class="vw-guests" hidden autocomplete="off"><label>Guest callers this session (usernames, comma separated)</label><div><input maxlength="300" placeholder="e.g. freya, rook"><button class="btn" type="submit">Save</button></div><p class="vw-gmsg" role="status"></p></form>
      <p class="vw-note">Paper calls at live market prices. Played for pride, never for money. Not financial advice. D3MON never trades.</p>`;
    const $ = sel => root.querySelector(sel);

    function render() {
      const d = st.data; if (!d) return;
      const sp = d.split, total = sp.openUp + sp.openDown, up = total ? sp.openUp / total : 0.5;
      $(".vw-split .up").style.width = `${up * 100}%`; $(".vw-split .dn").style.width = `${(1 - up) * 100}%`;
      $(".vw-crowd").textContent = total ? `The floor: ${Math.round(up * 100)}% Up · ${total} in` : sp.entries ? `${sp.voters} voted this round` : "Be the first to call it";
      $(".vw-t").textContent = st.s.title ? `· ${st.s.title}` : "";
      const o = d.open, ch = d.mode === "changeable", msg = $(".vw-msg");
      let blocked = "";
      if (!me) blocked = `Sign in to make your call. <a href="login">Sign in</a>`;
      else if (kind === "capstone" && !st.s.access) blocked = "Voting in a Capstone session needs Capstone access.";
      else if (d.canVote === false) blocked = "Voting is off for you in this session.";
      msg.hidden = !blocked; msg.innerHTML = blocked; $(".vw-btns").hidden = !!blocked;
      const bUp = $('[data-a="up"]'), bDn = $('[data-a="down"]');
      $('[data-a="out"]').hidden = !o;
      if (o) {
        bUp.hidden = o.dir === "up" || !ch; bDn.hidden = o.dir === "down" || !ch;
        bUp.textContent = "Switch to ▲ Up"; bDn.textContent = "Switch to ▼ Down";
        const worth = price ? (o.dir === "up" ? (price.down != null ? 1 - price.down : null) : (price.up != null ? 1 - price.up : null)) : null;
        const pl = worth != null && o.paid != null ? worth - o.paid : null;
        $(".vw-mine").innerHTML = `You're in <b class="${o.dir === "up" ? "up" : "dn"}">${o.dir === "up" ? "▲ Up" : "▼ Down"}</b>${o.paid != null ? ` @ ${cents(o.paid)}` : ""}${pl != null ? ` · <span class="${pl >= 0 ? "up" : "dn"}">${signed(pl)} if you cash out now</span>` : ""}`;
      } else {
        bUp.hidden = bDn.hidden = false; bUp.textContent = "▲ Up"; bDn.textContent = "▼ Down";
        const done = (d.mine || []).filter(t => t.status === "cashed");
        $(".vw-mine").innerHTML = done.length ? `This round: ${done.map(t => t.profit == null ? "cashed out" : `<span class="${t.profit >= 0 ? "up" : "dn"}">${signed(t.profit)}</span>`).join(" · ")}` : blocked ? "" : "Call it: Up or Down by the end of the round.";
      }
      $(".vw-feed").innerHTML = d.actions.slice(-6).reverse().map(a => `<li${a.badge ? ' class="b"' : ""}>${a.username ? `<a href="profile?u=${encodeURIComponent(a.username)}"><b>${esc(a.name)}</b></a>` : `<b>${esc(a.name)}</b>`}${a.badge ? '<i aria-label="badge">★</i>' : ""} ${a.action === "exit" ? `cashed out${a.got != null ? ` @ ${cents(a.got)}` : ""}` : `${a.action === "switch" ? "switched to" : "called"} <span class="${a.dir === "up" ? "up" : "dn"}">${a.dir === "up" ? "▲ Up" : "▼ Down"}</span>${a.paid != null ? ` @ ${cents(a.paid)}` : ""}`}<time>${mmss(a.at - d.round)} in</time></li>`).join("") || `<li class="vw-empty">No calls from the floor yet. Be the first.</li>`;
      $(".vw-guests").hidden = !(kind === "capstone" && st.s.admin);
    }

    async function load() {
      if (!st.s) return;
      const d = await A.api("GET", `votes/round?session=${encodeURIComponent(st.s.session)}`).catch(() => null);
      if (!d) return;
      st.data = d; render();
      for (const a of d.actions) if (a.badge && a.action !== "exit" && !st.seen.has(a.id)) { st.seen.add(a.id); if (st.ready) toast(a); }
      st.ready = true;
    }
    async function refresh() {
      const s = await findSession(kind).catch(() => null);
      const changed = (s && s.session) !== (st.s && st.s.session);
      st.s = s; root.hidden = !s;
      if (s && changed) { st.ready = false; st.data = null; await load(); if (s.admin) loadGuests(); }
    }
    async function loadGuests() {
      const c = await A.api("GET", `votes/sessions/${encodeURIComponent(st.s.session)}`).catch(() => null);
      if (c) $(".vw-guests input").value = c.guests.join(", ");
    }
    async function act(path, body) {
      if (st.busy || !st.s) return;
      $(".vw-err").textContent = ""; st.busy = true;
      try { const r = await A.api("POST", path, { ...body, session: st.s.session }); st.data = r.round; render(); }
      catch (err) { $(".vw-err").textContent = err.message; }
      finally { st.busy = false; }
    }
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a, open = st.data && st.data.open;
      if (a === "out") act("votes/exit", {}); else act(open ? "votes/change" : "votes", { dir: a });
    });
    $(".vw-guests").addEventListener("submit", async e => {
      e.preventDefault();
      const names = $(".vw-guests input").value.split(",").map(x => x.trim().replace(/^@/, "")).filter(Boolean);
      try { await A.api("PUT", `votes/sessions/${encodeURIComponent(st.s.session)}`, { guests: names }); $(".vw-gmsg").textContent = names.length ? `Saved: ${names.join(", ")}` : "No guest callers."; }
      catch (err) { $(".vw-gmsg").textContent = err.message; }
    });
    return { refresh, load, onBadge(a) { if (st.s && a.session === st.s.session && !st.seen.has(a.id)) { st.seen.add(a.id); toast(a); } }, onAction(a) { if (st.s && (!a || a.session === st.s.session)) load(); } };
  }

  (async () => {
    await A.syncClock().catch(() => {});
    me = await A.session().catch(() => null);
    const panels = roots.map(mount);
    await Promise.all(panels.map(p => p.refresh()));
    const market = async () => { const m = await A.api("GET", "market").catch(() => null); price = m && m.price; };
    market();
    let t = 0;
    A.follow(["votes"], (type, data) => {
      if (type === "votes.badge") panels.forEach(p => p.onBadge(data));
      if (type === "votes.action" || type === "votes.session") { clearTimeout(t); t = setTimeout(() => panels.forEach(p => p.onAction(type === "votes.action" ? data : null)), 250); }
    });
    setInterval(() => panels.forEach(p => p.refresh()), 30000);
    setInterval(() => { market(); panels.forEach(p => p.load()); }, 20000);
  })();
})();
