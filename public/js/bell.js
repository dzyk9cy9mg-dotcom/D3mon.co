// The bell (owner, 2026-10-21): a signed-in member's notifications (event reminders, admin announcements) in the
// menu bar. Mounts next to the account link in the shared bar (.s-acts) or the front page's bar (.n-acts).
// Opening it marks everything read. Checks for new notes every minute. Thin client over /api/v1/notifications.
(function () {
  "use strict";
  if (window.__d3bell) return;
  window.__d3bell = true;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const css = `.d3bell{position:relative;display:inline-flex}
.d3bell>button{position:relative;min-width:44px;min-height:44px;display:inline-grid;place-items:center;background:none;border:1px solid transparent;border-radius:999px;color:inherit;cursor:pointer}
.d3bell>button:hover,.d3bell>button[aria-expanded="true"]{border-color:rgba(170,200,240,.26)}
.d3bell svg{width:20px;height:20px}
.d3bell .n{position:absolute;top:4px;right:2px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#FF4F7A;color:#fff;font:700 11px/18px Manrope,sans-serif;text-align:center}
.d3bell .n[hidden]{display:none}
.d3bell .pop{position:absolute;right:0;top:calc(100% + 8px);z-index:80;width:min(340px,calc(100vw - 32px));max-height:min(420px,70vh);overflow:auto;background:rgba(8,11,17,.97);border:1px solid rgba(170,200,240,.2);box-shadow:0 18px 50px rgba(0,0,0,.5);text-align:left}
.d3bell .pop[hidden]{display:none}
.d3bell .hd{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(170,200,240,.12);font:600 13px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase}
.d3bell .hd a{font:600 13px Manrope,sans-serif;letter-spacing:0;text-transform:none;color:#FFC56A}
.d3bell .it{display:block;padding:12px 14px;border-bottom:1px solid rgba(170,200,240,.08);color:inherit;text-decoration:none;font:500 14px/1.4 Manrope,sans-serif}
.d3bell a.it:hover{background:rgba(170,200,240,.06)}
.d3bell .it.new{border-left:3px solid #FFC56A}
.d3bell .it small{display:block;margin-top:3px;font:500 12px "IBM Plex Mono",monospace;color:#8494A8}
.d3bell .none{padding:18px 14px;color:#8494A8;font:500 14px Manrope,sans-serif}`;
  const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(ms).toLocaleDateString(); };

  async function get(path, method = "GET") {
    const r = await fetch(`api/v1/${path}`, { method, credentials: "same-origin", headers: method === "GET" ? {} : { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  function mount(host) {
    const st = document.createElement("style"); st.textContent = css; document.head.append(st);
    const w = document.createElement("div");
    w.className = "d3bell";
    w.innerHTML = `<button type="button" aria-expanded="false" aria-label="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="n" hidden></span></button><div class="pop" hidden></div>`;
    host.prepend(w);
    const btn = w.querySelector("button"), badge = w.querySelector(".n"), pop = w.querySelector(".pop");
    let notes = [], unread = 0;
    const paint = () => {
      badge.hidden = !unread; badge.textContent = unread > 9 ? "9+" : String(unread);
      btn.setAttribute("aria-label", unread ? `Notifications, ${unread} new` : "Notifications");
      pop.innerHTML = `<div class="hd">Notifications<a href="calendar">Calendar</a></div>` + (notes.length ? notes.slice(0, 30).map(n => {
        const ext = /^https:/.test(n.link), body = `${esc(n.text)}<small>${esc(ago(n.at))}</small>`;
        return n.link ? `<a class="it${n.read ? "" : " new"}" href="${esc(n.link)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${body}</a>` : `<div class="it${n.read ? "" : " new"}">${body}</div>`;
      }).join("") : `<div class="none">Nothing yet. Press Remind me on the calendar to hear when things start.</div>`);
    };
    const refresh = async () => { try { ({ notes, unread } = await get("notifications")); paint(); } catch (e) {} };
    const open = on => { pop.hidden = !on; btn.setAttribute("aria-expanded", String(on)); };
    btn.addEventListener("click", async () => {
      const on = pop.hidden; open(on);
      if (on && unread) { try { await get("notifications/read", "POST"); unread = 0; badge.hidden = true; } catch (e) {} }
      if (!on) { notes = notes.map(n => ({ ...n, read: true })); paint(); }
    });
    document.addEventListener("click", e => { if (!pop.hidden && !w.contains(e.target)) { open(false); notes = notes.map(n => ({ ...n, read: true })); paint(); } });
    addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { open(false); btn.focus(); } });
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  }

  function start() {
    fetch("api/session", { credentials: "same-origin" }).then(r => r.json()).then(({ user }) => {
      if (!user) return;
      const host = document.querySelector(".s-acts, .n-acts");
      if (host) mount(host);
    }).catch(() => {});
  }
  // the shared bar is built by sitebar.js, possibly after this runs: wait for a place to mount
  const ready = () => document.querySelector(".s-acts, .n-acts");
  if (ready()) start();
  else { let n = 0; const t = setInterval(() => { if (ready() || ++n > 40) { clearInterval(t); if (ready()) start(); } }, 100); }
})();
