// The Showdown bar (owner, 2026-10-23: players shouldn't have to sit on the Showdown page to play). While a
// signed-in member has a Showdown on, a small bar sits at the bottom of every page: the opponent, the score, the
// clock, and Up/Down right there while their call for the round is still to make. Loaded by sitebar.js and the front
// page. Self-contained (no arena.js). A thin client over GET /api/v1/showdowns and POST /api/v1/showdowns/:sid/call.
(function () {
  "use strict";
  if (window.__d3sdbar || /\/showdown$/.test(location.pathname)) return; // the Showdown page has its own controls
  window.__d3sdbar = true;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const css = `.d3sd{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:12px;flex-wrap:nowrap;max-width:calc(100vw - 24px);margin:0;padding:10px 10px 10px 16px;background:rgba(8,11,17,.97);border:1px solid rgba(255,181,71,.45);box-shadow:0 14px 40px rgba(0,0,0,.55);color:#EEF3F8;font:500 14px/1.3 Manrope,sans-serif;white-space:nowrap;box-sizing:border-box}
.d3sd[hidden]{display:none}
.d3sd span,.d3sd b,.d3sd a,.d3sd p{margin:0;padding:0;background:none;border:0;box-shadow:none;font-family:inherit;color:inherit}
.d3sd .d3sd-k{font:600 11px "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:#FFB547}
.d3sd .d3sd-vs b{font-weight:700}.d3sd .d3sd-sc{font:700 15px "IBM Plex Mono",monospace;margin-left:6px;color:#EEF3F8}
.d3sd .d3sd-t{font:600 14px "IBM Plex Mono",monospace;color:#B4C1D0}
.d3sd .d3sd-bt{display:inline-flex;gap:6px}
.d3sd button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:40px;min-width:44px;padding:0 14px;border:1px solid;font:700 14px Manrope,sans-serif;cursor:pointer}
.d3sd button:focus-visible{outline:2px solid #FFB547;outline-offset:2px}
.d3sd .d3sd-up{color:#36E6C3;border-color:rgba(54,230,195,.6)}.d3sd .d3sd-dn{color:#FF4F7A;border-color:rgba(255,79,122,.6)}
.d3sd .d3sd-up:hover{background:rgba(54,230,195,.12)}.d3sd .d3sd-dn:hover{background:rgba(255,79,122,.12)}
.d3sd a{color:#FFC56A;font-weight:600;text-decoration:underline}
.d3sd .d3sd-x{border:0;color:#8494A8;min-width:36px;padding:0;font-size:18px}
.d3sd .d3sd-e{position:absolute;left:0;right:0;bottom:calc(100% + 6px);color:#FF8A8A;font-size:13px;text-align:center;white-space:normal}.d3sd .d3sd-e:empty{display:none}
@media (max-width:640px){.d3sd{bottom:8px;gap:8px;padding:8px;flex-wrap:wrap;justify-content:center;white-space:normal;width:calc(100vw - 16px)}.d3sd .d3sd-k{display:none}.d3sd .d3sd-bt{flex:1 1 100%}.d3sd .d3sd-bt button{flex:1}}`;
  let skew = 0, list = [], busy = false, el, timer;
  const now = () => Date.now() + skew;
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const hideKey = (sid, r) => `d3sd.hide.${sid}.${r}`;
  const hidden = (sid, r) => { try { return sessionStorage.getItem(hideKey(sid, r)) === "1"; } catch (e) { return false; } };

  async function api(path, body) {
    const r = await fetch(`api/v1/${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || "Something went wrong.");
    return j;
  }

  // The Showdown that matters most right now: one waiting for my call first, then any that's on.
  function pick() {
    const t = now(), on = [];
    for (const v of list) {
      if (v.state !== "live" && v.state !== "starting") continue;
      const r = v.detail.find(x => t >= x.round && t < x.endsAt), mine = v.me && r ? r[v.me] : null;
      const needs = !!(r && t < r.closesAt && !(mine && mine.dir));
      on.push({ v, r, needs });
    }
    on.sort((a, b) => b.needs - a.needs);
    return { top: on[0] || null, more: Math.max(0, on.length - 1) };
  }

  function paint() {
    const { top, more } = pick();
    if (!top || (top.r && hidden(top.v.sid, top.r.round))) { el.hidden = true; return; }
    const { v, r, needs } = top, t = now(), other = v.me === "from" ? v.to : v.from, sc = v.score, me = v.me || "from", them = me === "from" ? "to" : "from";
    const n = r ? v.detail.indexOf(r) + 1 : 0, mine = r ? r[me] : null;
    const status = v.state === "starting" ? `Starts in <span class="d3sd-t">${mmss(v.startsAt - t)}</span>`
      : needs ? `Round ${n}/${v.rounds} · calls close <span class="d3sd-t">${mmss(r.closesAt - t)}</span>`
      : mine && mine.dir ? `You called ${mine.dir === "up" ? "▲ Up" : "▼ Down"} · round ends <span class="d3sd-t">${mmss(r.endsAt - t)}</span>`
      : `Round ${n}/${v.rounds} · ends <span class="d3sd-t">${mmss(r.endsAt - t)}</span>`;
    el.innerHTML = `<span class="d3sd-k">Showdown</span><span class="d3sd-vs">vs <b>${esc(other.name)}</b><span class="d3sd-sc">${sc[me].right}–${sc[them].right}</span></span>
      <span>${status}</span>${needs ? `<span class="d3sd-bt"><button type="button" class="d3sd-up" data-dir="up">▲ Up</button><button type="button" class="d3sd-dn" data-dir="down">▼ Down</button></span>` : ""}
      <a href="showdown?id=${esc(v.sid)}">Open${more ? ` (+${more})` : ""}</a>${r ? `<button type="button" class="d3sd-x" data-hide="${esc(v.sid)}|${r.round}" aria-label="Hide for this round">×</button>` : ""}<p class="d3sd-e" role="alert"></p>`;
    el.dataset.sid = v.sid;
    el.hidden = false;
  }

  async function load() {
    try { list = (await api("showdowns")).active || []; } catch (e) { list = []; }
    paint();
    clearTimeout(timer);
    // check often while a Showdown is on, rarely otherwise
    timer = setTimeout(load, list.length ? 20000 : 90000);
  }

  function start() {
    const st = document.createElement("style"); st.textContent = css; document.head.append(st);
    el = document.createElement("div"); el.className = "d3sd"; el.hidden = true; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Your Showdown");
    document.body.append(el);
    el.addEventListener("click", async e => {
      const h = e.target.closest("[data-hide]");
      if (h) { const [sid, r] = h.dataset.hide.split("|"); try { sessionStorage.setItem(hideKey(sid, r), "1"); } catch (x) {} paint(); return; }
      const b = e.target.closest("[data-dir]");
      if (!b || busy) return;
      busy = true;
      try {
        const v = (await api(`showdowns/${el.dataset.sid}/call`, { dir: b.dataset.dir })).showdown;
        list = list.map(x => (x.sid === v.sid ? v : x)); paint();
      } catch (x) { const p = el.querySelector(".d3sd-e"); if (p) p.textContent = x.message; } finally { busy = false; }
    });
    let lastSecond = 0;
    setInterval(() => {
      if (el.hidden && !list.length) return;
      paint();
      // reload when a round starts, calls close or a round ends, so the bar never shows a stale moment
      const t = now(), marks = list.flatMap(v => v.detail.flatMap(x => [x.round, x.closesAt, x.endsAt]).concat(v.startsAt || []));
      if (marks.some(m => m > lastSecond && m <= t)) load();
      lastSecond = t;
    }, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    fetch("api/v1/clock", { credentials: "same-origin" }).then(r => r.json()).then(c => { skew = c.now - Date.now(); }).catch(() => {}).finally(load);
  }

  fetch("api/session", { credentials: "same-origin" }).then(r => r.json()).then(({ user }) => { if (user) start(); }).catch(() => {});
})();
