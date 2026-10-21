// /pricing: the plans the owner has switched on, priced in dollars, with a button that opens Stripe's checkout.
// Capstone is per member; Creator and Spotlight are for one of your own callers, bots or scripts. Your current
// plans, and Stripe's own page to cancel or change card. Thin client over /api/v1/billing.
(function () {
  "use strict";
  const A = window.Arena, $ = id => document.getElementById(id), esc = A.esc;
  const usd = c => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const when = ms => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const KIND = { caller: "Caller", bot: "Bot", script: "Chart script" };
  let me = null, mine = null;

  async function buy(btn) {
    $("msg").textContent = "";
    if (!me) { location.href = "login"; return; }
    const card = btn.closest("[data-plan]"), plan = card.dataset.plan, sel = card.querySelector("select");
    btn.disabled = true; btn.textContent = "Opening checkout…";
    try {
      const r = await A.api("POST", "billing/checkout", { plan, interval: btn.dataset.i, ...(sel ? { entrantId: sel.value } : {}) });
      location.href = r.url;
    } catch (e) { $("msg").textContent = e.message; btn.disabled = false; btn.textContent = btn.dataset.label; }
  }

  function card(p) {
    const opts = [p.month && ["month", `${usd(p.month)} a month`], p.year && ["year", `${usd(p.year)} a year`], p.pass && ["pass", `${usd(p.pass)} for ${p.passHours} hours`]].filter(Boolean);
    const forEntrant = p.id !== "capstone", ents = (mine && mine.entrants) || [];
    const pick = forEntrant && me ? (ents.length ? `<label class="pr-for">For<select>${ents.map(e => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(KIND[e.kind] || e.kind)})</option>`).join("")}</select></label>`
      : `<p class="pr-help">You'll need an approved caller, bot or chart script first. <a href="apply">Apply</a></p>`) : "";
    const can = !forEntrant || !me || ents.length;
    return `<article class="pr-card pr-${esc(p.id)}" data-plan="${esc(p.id)}">
      <h2>${esc(p.name)}</h2><p class="pr-blurb">${esc(p.blurb)}</p>
      <p class="pr-price">${usd(p.month || p.year || p.pass)}<span>${p.month ? "/month" : p.year ? "/year" : " a pass"}</span></p>
      ${pick}
      <div class="pr-buy">${can ? opts.map(([i, label], n) => `<button class="${n ? "btn ghost" : "s-amber"}" type="button" data-i="${i}" data-label="${esc(me ? label : "Sign in to buy")}">${esc(me ? label : n ? label : "Sign in to buy")}</button>`).join("") : ""}</div>
    </article>`;
  }

  function renderMine() {
    if (!mine) return;
    const rows = [];
    if (mine.capstone) rows.push(`<li><b>Capstone</b> until ${esc(when(mine.capstone.until))}</li>`);
    for (const e of mine.entrants) if (e.plan) rows.push(`<li><b>${e.plan === "spotlight" ? "Spotlight" : "Creator"}</b> for ${esc(e.name)} until ${esc(when(e.until))}</li>`);
    $("mine").hidden = !rows.length && !mine.manage;
    $("mineList").innerHTML = rows.join("") || "<li>No active plans.</li>";
    $("manage").hidden = !mine.manage;
  }

  $("plans").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) buy(b); });
  $("manage").addEventListener("click", async () => {
    try { location.href = (await A.api("POST", "billing/portal", {})).url; } catch (e) { $("msg").textContent = e.message; }
  });

  (async () => {
    const q = new URLSearchParams(location.search);
    if (q.has("paid")) $("msg").textContent = "Thank you! Your plan switches on as soon as Stripe confirms the payment (usually within a minute).";
    if (q.has("cancelled")) $("msg").textContent = "Checkout cancelled. Nothing was charged.";
    me = await A.session().catch(() => null);
    if (me) mine = await A.api("GET", "billing/me").catch(() => null);
    const { plans } = await A.api("GET", "billing/plans");
    $("soon").hidden = plans.length > 0;
    $("plans").innerHTML = plans.map(card).join("");
    renderMine();
    if (q.has("paid") && me) setTimeout(async () => { mine = await A.api("GET", "billing/me").catch(() => mine); renderMine(); }, 6000);
  })().catch(e => { $("msg").textContent = e.message; });
})();
