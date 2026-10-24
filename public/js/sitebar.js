// One menu on every page (owner, 2026-10-20: one site, one look). Builds the front page's top bar (css/site.css)
// in place of each page's old one: the D3MON mark, the main parts (Live, Battles, Marketplace, Tournaments,
// Capstone, My bots), an Admin menu for admins, the account link and Join D3MON; on phones the parts fold into a
// Menu button. It also gives each page a real title (from its <title>) and a skip link. Pages load it at the end
// of <body>. HOME is the front page (the new one, at "/" since 2026-10-22; the original is at /classic).
(function () {
  "use strict";
  const HOME = "./";
  const MAIN = [["live", "Live"], ["battle", "Battles"], ["calendar", "Calendar"], [`${HOME}#market`, "Marketplace"], ["tournaments", "Tournaments"], ["lab", "Lab"], ["vip", "Capstone"], ["my", "My bots"]];
  const ADMIN = [
    ["Bots and stats", [["applications", "Applications"], ["vip", "VIP access"], ["billing", "Payments"], ["monitor", "Stats monitor"], ["catalog", "Stat list"], ["displays", "Displays and hall video"]]],
    ["Battle show", [["battle", "Battle cockpit (HardSmoke's controls)"], ["metrics", "Round metrics"], ["board", "Battle board"]]],
    ["Site", [["classic", "Classic site (admin control center, chat, streams)"]]],
  ];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const here = location.pathname.split("/").pop() || "./";
  const link = ([href, text]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ""}>${esc(text)}</a>`;

  function build() {
    const main = document.querySelector("main");
    if (!main || document.querySelector(".s-bar")) return;
    if (!main.id) main.id = "main";
    // the old menus and brand marks give way to the shared bar
    document.querySelectorAll("header.w-bar, nav.anav, main > .acct-brand").forEach(n => n.remove());
    const bar = document.createElement("header");
    bar.className = "s-bar";
    bar.innerHTML = `<a class="s-mark" href="${HOME}" aria-label="D3MON home">D<b>3</b>MON</a>
      <button type="button" class="s-menu" aria-expanded="false" aria-controls="s-nav">Menu</button>
      <nav class="s-nav" id="s-nav" aria-label="Main">${MAIN.map(link).join("")}
        <details class="s-admin" hidden><summary>Admin</summary><div class="s-drop">${ADMIN.map(([g, ls]) => `<b>${esc(g)}</b>${ls.map(link).join("")}`).join("")}</div></details>
        <a class="s-phone" id="acctPhone" href="login">Sign in</a>
      </nav>
      <div class="s-acts"><a class="s-link" id="acctBtn" href="login">Sign in</a><a class="s-amber" id="joinBtn" href="apply">Join D3MON</a></div>`;
    const skip = document.createElement("a");
    skip.className = "s-skip"; skip.href = `#${main.id}`; skip.textContent = "Skip to the page";
    document.body.prepend(skip, bar);
    // the small print at the foot of every page (owner, 2026-10-20: privacy and terms before sign-ups open)
    if (!document.querySelector(".n-foot, .s-foot")) {
      const foot = document.createElement("footer");
      foot.className = "s-foot";
      foot.innerHTML = `<span>Paper trades only. Not financial advice. D3MON never trades.</span><nav aria-label="The small print"><a href="connect">Connect your bot</a><a href="pricing">Pricing</a><a href="privacy">Privacy</a><a href="terms">Terms</a></nav>`;
      document.body.append(foot);
    }
    // a real page title, taken from the document title ("Tournaments · D3MON.CO" → "Tournaments"), unless the page has one
    if (!main.querySelector("h1") && main.matches(".arena, .acct")) {
      const h = document.createElement("h1"); h.className = "s-title";
      h.textContent = main.matches(".acct") ? "Account" : document.title.split("·")[0].trim();
      main.prepend(h);
    }
    const adm = bar.querySelector(".s-admin");
    if (ADMIN.some(([, ls]) => ls.some(([href]) => href === here))) adm.classList.add("here");
    const menu = bar.querySelector(".s-menu"), open = on => { menu.setAttribute("aria-expanded", String(on)); bar.classList.toggle("open", on); };
    menu.addEventListener("click", () => open(menu.getAttribute("aria-expanded") !== "true"));
    addEventListener("keydown", e => { if (e.key === "Escape") { open(false); adm.open = false; } });
    document.addEventListener("click", e => { if (adm.open && !adm.contains(e.target)) adm.open = false; });
    fetch("api/session", { credentials: "same-origin" }).then(r => r.json()).then(({ user: me }) => {
      if (!me) return;
      for (const a of bar.querySelectorAll("#acctBtn, #acctPhone")) { a.textContent = me.name || me.username || "Account"; if (me.username) a.href = `profile?u=${encodeURIComponent(me.username)}`; } // your name opens your profile
      bar.querySelector("#joinBtn").hidden = true; // members have My bots in the menu
      if (me.role === "admin" || me.role === "owner") adm.hidden = false;
    }).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
  // the notification bell (js/bell.js) rides along on every page with the shared bar
  if (!document.querySelector('script[src="js/bell.js"]')) { const s = document.createElement("script"); s.src = "js/bell.js"; s.defer = true; document.head.append(s); }
})();
