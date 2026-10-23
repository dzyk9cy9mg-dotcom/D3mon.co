// The founder waitlist panel (owner, 2026-10-22). Mount with <div data-waitlist></div> after js/arena.js.
// Visitors see it only while an admin has it open: an email box and the live count. Admins always see a small
// bar to open or close it and download the list. A thin client over GET/POST/PUT /api/v1/waitlist.
(function () {
  "use strict";
  const A = window.Arena, root = document.querySelector("[data-waitlist]");
  if (!A || !root) return;
  const esc = A.esc;
  // done: "" (not joined), "member" or "pro". Older visits stored "1" for the member list.
  let st = { open: false, count: 0 }, admin = false, done = "", hidden = false, err = "", pro = null;
  try { const v = localStorage.getItem("d3.waitlist"); done = v === "1" ? "member" : v || ""; hidden = sessionStorage.getItem("d3.waitlist.hide") === "1"; } catch (e) {}

  const n = c => `${c.toLocaleString()} ${c === 1 ? "person" : "people"} on the list`;

  function render() {
    const bar = admin ? `<div class="wl-admin"><span>Waitlist: <b>${st.open ? "open" : "closed"}</b> · ${st.count}${pro !== null ? ` (${pro} Pro)` : ""}</span>
      <button type="button" data-act="toggle">${st.open ? "Close it" : "Open it"}</button>
      <button type="button" data-act="csv"${st.count ? "" : " disabled"}>Download</button></div>` : "";
    const card = st.open && !hidden ? `<section class="wl-card" aria-label="Founder waitlist">
      <button type="button" class="wl-x" data-act="hide" aria-label="Hide">×</button>
      <p class="wl-kick">Founding members · Black Friday</p>
      <p class="wl-title">100 founders. Locked for life.</p>
      ${done ? `<p class="wl-done">You're on the ${done === "pro" ? "founding Pro list" : "list"}. You'll hear first, and get in 24 hours before everyone else.</p>`
        : `<p class="wl-sub">Join the waitlist and get in 24 hours before everyone else.</p>
      <form class="wl-form" novalidate><input type="email" name="email" autocomplete="email" inputmode="email" placeholder="you@email.com" aria-label="Email" maxlength="254" required>
      <button type="submit">Join</button></form>
      <label class="wl-pro"><input type="checkbox" name="pro"> I call, run a bot or write chart scripts. Put me on the founding Pro list.</label>
      <p class="wl-err" role="alert">${esc(err)}</p>`}
      <p class="wl-count" aria-live="polite">${st.count ? n(st.count) : ""}</p></section>` : "";
    root.innerHTML = bar + card;
  }

  root.addEventListener("submit", async e => {
    e.preventDefault();
    const input = e.target.querySelector("input"), btn = e.target.querySelector("button"), box = root.querySelector(".wl-pro input");
    btn.disabled = true; err = "";
    try {
      const r = await A.api("POST", "waitlist", { email: input.value, list: box?.checked ? "pro" : "member" });
      st = { open: r.open, count: r.count };
      done = r.list;
      try { localStorage.setItem("d3.waitlist", done); } catch (x) {}
    } catch (x) { err = x.message; }
    render();
  });

  root.addEventListener("click", async e => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "hide") { hidden = true; try { sessionStorage.setItem("d3.waitlist.hide", "1"); } catch (x) {} render(); }
    if (act === "toggle") { try { st = await A.api("PUT", "waitlist", { open: !st.open }); } catch (x) { alert(x.message); } render(); }
    if (act === "csv") {
      try {
        const { entries } = await A.api("GET", "waitlist/entries");
        const rows = [["email", "list", "joined", "member"], ...entries.map(x => [x.email, x.list, new Date(x.createdAt).toISOString(), x.uid ? "yes" : "no"])];
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `d3mon-waitlist-${new Date().toISOString().slice(0, 10)}.csv` });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (x) { alert(x.message); }
    }
  });

  (async () => {
    try { st = await A.api("GET", "waitlist"); } catch (e) {}
    const me = await A.session();
    admin = !!me && (me.role === "admin" || me.role === "owner");
    const proCount = async () => { if (admin) try { pro = (await A.api("GET", "waitlist/entries")).pro; } catch (e) {} };
    await proCount();
    render();
    A.follow(["waitlist"], async (type, data) => { if (type === "waitlist.changed" && data) { st = data; await proCount(); render(); } });
  })();
})();
