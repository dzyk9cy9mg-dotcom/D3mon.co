// /billing (admins): whether Stripe is connected, the prices (in dollars; stored in cents), who's paying, and the
// money in by month, with a CSV for bookkeeping. Thin client over /api/v1/billing.
(function () {
  "use strict";
  const A = window.Arena, $ = id => document.getElementById(id), esc = A.esc;
  const usd = c => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const day = ms => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const NAMES = { capstone: "Capstone", creator: "Creator", spotlight: "Creator Spotlight" }; // defaults, for the lists below
  const toCents = v => { v = String(v).trim().replace(/^\$/, ""); return v === "" ? null : Math.round(Number(v) * 100); };
  const toDollars = c => (c == null ? "" : (c / 100).toFixed(2));

  function render(d) {
    const s = d.stripe, nm = id => (d.plans[id] && d.plans[id].name) || NAMES[id] || id;
    $("status").innerHTML = `<h2>Stripe</h2>${s.mode === "off" ? `<p class="pr-bad">Not connected. Nothing can be sold yet.</p>` : `<p>Connected in <b>${s.mode === "live" ? "LIVE mode: real money" : "TEST mode: no real money"}</b>.</p>`}
      <ul class="pr-check"><li class="${s.key ? "ok" : ""}">Secret key ${s.key ? "set" : "missing"}</li><li class="${s.webhook ? "ok" : ""}">Webhook secret ${s.webhook ? "set" : "missing (payments won't switch access on)"}</li><li class="${s.site ? "ok" : ""}">Site address ${s.site ? esc(s.site) : "missing"}</li></ul>
      ${s.mode === "live" && s.key && s.webhook ? "" : `<p class="pr-help">Setting up Stripe takes a few steps on the server; the steps are in docs/PAYMENTS.md.</p>`}`;
    $("prices").innerHTML = Object.entries(d.plans).map(([id, p]) => `<fieldset data-id="${id}"><legend>${esc(p.name || p.defaultName)}</legend>
        <label class="pr-wide">Name <input name="name" maxlength="40" placeholder="${esc(p.defaultName)}" value="${esc(p.name || "")}"></label>
        <label class="pr-wide">Description <textarea name="blurb" maxlength="240" rows="2" placeholder="${esc(p.defaultBlurb)}">${esc(p.blurb || "")}</textarea></label>
        <label class="pr-on"><input type="checkbox" name="on" ${p.on ? "checked" : ""}> On sale</label>
        <label>Per month <input name="month" inputmode="decimal" placeholder="e.g. 39" value="${toDollars(p.month)}"></label>
        <label>Per year <input name="year" inputmode="decimal" placeholder="e.g. 390" value="${toDollars(p.year)}"></label>
        ${id === "capstone" ? `<label>Single pass <input name="pass" inputmode="decimal" placeholder="e.g. 12" value="${toDollars(p.pass)}"></label><label>Pass lasts (hours) <input name="passHours" inputmode="numeric" value="${p.passHours}"></label>` : ""}
      </fieldset>`).join("") + `<button class="s-amber" type="submit">Save prices</button>`;
    const months = Object.entries(d.months).sort().reverse();
    $("months").innerHTML = months.length ? `<ol class="pr-rows">${months.map(([m, c]) => `<li><span>${esc(m)}</span><b>${usd(c)}</b></li>`).join("")}</ol>` : `<p class="pr-help">No payments yet.</p>`;
    $("recent").innerHTML = d.recent.map(p => `<li><span>${esc(day(p.at))}</span><span>${esc(p.username)}</span><span>${esc(nm(p.plan))}${p.kind === "pass" ? " pass" : ""}</span><b>${usd(p.amount)}</b></li>`).join("") || "<li>None yet.</li>";
    $("subs").innerHTML = d.subscriptions.map(s => `<li><span>${esc(s.username)}</span><span>${esc(nm(s.plan))}${s.entrant ? ` · ${esc(s.entrant)}` : ""}</span></li>`).join("") || "<li>None yet.</li>";
    $("cap").innerHTML = d.capstone.map(c => `<li><span>${esc(c.username)}</span><span>until ${esc(day(c.until))}</span><span>${c.paid ? "paid" : "given by an admin"}</span></li>`).join("") || "<li>No one right now.</li>";
  }

  $("prices").addEventListener("submit", async e => {
    e.preventDefault(); $("msg").textContent = "";
    const body = {};
    for (const fs of $("prices").querySelectorAll("fieldset")) {
      const f = n => fs.querySelector(`[name="${n}"]`), id = fs.dataset.id;
      body[id] = { on: f("on").checked, name: f("name").value, blurb: f("blurb").value, month: toCents(f("month").value), year: toCents(f("year").value) };
      if (id === "capstone") { body[id].pass = toCents(f("pass").value); body[id].passHours = Number(f("passHours").value) || 24; }
    }
    try { render(await A.api("PUT", "billing/plans", body)); $("msg").textContent = "Prices saved."; }
    catch (err) { $("msg").textContent = err.message; }
  });

  A.api("GET", "billing").then(render).catch(e => { $("msg").textContent = e.status === 403 || e.status === 401 ? "Only admins can see this page." : e.message; });
})();
