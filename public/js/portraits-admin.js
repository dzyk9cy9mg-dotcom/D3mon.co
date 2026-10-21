// Admins approve moving profile pictures (owner, 2026-10-20: "uploaded profile pictures need admin approval").
// Shown on the Applications page: every upload waiting, its frames side by side, Approve or Reject with a note.
(function () {
  "use strict";
  const A = window.Arena, box = document.getElementById("portraitBox");
  if (!A || !box) return;
  const list = box.querySelector(".plist"), esc = A.esc;
  async function load() {
    const r = await A.api("GET", "portraits/queue").catch(() => null);
    if (!r) return; // not an admin
    box.hidden = false;
    list.innerHTML = r.queue.length ? r.queue.map(q => `<div class="pq" data-set="${esc(q.set)}">
        <p><b>${esc(q.entrant ? q.entrant.name : "Unknown")}</b> <span class="st">${esc(q.entrant ? A.kindName(q.entrant.kind) : "")}</span> <span class="meta">${esc(A.when(q.at))}</span></p>
        <div class="pthumbs">${q.frames.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Frame" width="120" height="120"></a>`).join("")}</div>
        <div class="row"><input class="pnote" maxlength="200" placeholder="Note to the owner if you reject (optional)"><button class="btn sm" data-d="approve" type="button">Approve</button><button class="btn sm ghost" data-d="reject" type="button">Reject</button></div>
      </div>`).join("") : `<p class="meta">Nothing waiting.</p>`;
  }
  list.addEventListener("click", async e => {
    const b = e.target.closest("[data-d]"); if (!b) return;
    const card = b.closest("[data-set]");
    try { await A.api("POST", `portraits/${card.dataset.set}/review`, { decision: b.dataset.d, note: card.querySelector(".pnote").value.trim() }); load(); }
    catch (err) { alert(err.message); }
  });
  load();
  setInterval(load, 60000);
})();
