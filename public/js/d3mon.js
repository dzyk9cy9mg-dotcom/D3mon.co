const SECTIONS = {
  callers:{name:"Callers", blurb:"Round-by-round calls on the Kalshi and Polymarket up/down markets: BTC, ETH, SOL and more, 15-minute and hourly.",
    icon:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M1.6 12C4 7.6 7.7 5.4 12 5.4S20 7.6 22.4 12C20 16.4 16.3 18.6 12 18.6S4 16.4 1.6 12z" stroke-width="1.6"/><path d="M5.2 9.6C7.2 7.7 9.5 6.9 12 6.9s4.8.8 6.8 2.7" stroke-width="1" stroke-opacity=".35"/><circle cx="12" cy="12" r="4.9" stroke-width="1.5"/><circle cx="12" cy="12" r="3.4" stroke-width="1" stroke-dasharray="1.4 1.1" stroke-opacity=".75"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="13.5" cy="10.5" r=".75" fill="#FFFFFF" stroke="none" fill-opacity=".9"/><path d="M.6 12h.9M22.5 12h.9" stroke-width="1.2" stroke-opacity=".6"/></svg>'},
  bots:{name:"Bots", blurb:"Bots built by creators that read the market from different data sources. Setups, data feeds, and results.",
    icon:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9.4 7.6 4.9h8.8L19 9.4v6.2L16 19.2H8L5 15.6z" stroke-width="1.6"/><path d="M12 4.9V2.9" stroke-width="1.4"/><circle cx="12" cy="2.2" r="1" fill="currentColor" stroke="none"/><path d="M6.9 9.9h10.2l-.9 4.1H7.8z" fill="currentColor" fill-opacity=".2" stroke-width="1.3"/><path d="M8.3 12.3h1.5l1-1.6 1.3 2.6 1.1-1.8.8.8h1.7" stroke-width="1.25"/><path d="M3.2 10.8v3.6M20.8 10.8v3.6" stroke-width="1.5" stroke-opacity=".75"/><path d="M10 16.7h4" stroke-width="1.2" stroke-opacity=".6"/></svg>'},
  scripts:{name:"Chart Scripts", blurb:"Scripts that run on your charts with custom indicators. Code, settings, and how to read the signals.",
    icon:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5v17h17"/><path d="M3.5 15.5h17M3.5 9.5h17" stroke-opacity=".3" stroke-dasharray="1.5 2.5"/><polyline points="6.5 16.5 10 11.5 13 13.5 16.5 7.5 19.5 9"/><polyline points="6.5 18 10 15 13 16 16.5 12 19.5 12.5" stroke-opacity=".45" stroke-dasharray="2 2"/><circle cx="10" cy="11.5" r="1.2" fill="currentColor"/><circle cx="16.5" cy="7.5" r="1.2" fill="currentColor"/></svg>'}
};
const S = {asset:"BTC", tf:"15m", lbTab:"caller", callDocs:{}, resDocs:{}, menu:null, section:"callers", sub:null, tab:"threads", view:"list", openId:null,
  subs:[], threads:[], streams:[], posts:[], chat:[], ready:false, offline:false};
let db=null, user=null, roomApi=null, meId=null, isOwner=false, canWrite=true;
let unsubPosts=null, unsubChat=null, streamRoom=null, pendingDelete=null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
function ago(t){
  if(!t) return "";
  const s = Math.round((Date.now()-t)/1000);
  if(s < 0){ return "in " + span(-s); }
  if(s < 45) return "just now";
  return span(s) + " ago";
}
function span(s){
  if(s < 3600) return Math.max(1,Math.round(s/60)) + "m";
  if(s < 86400) return Math.round(s/3600) + "h";
  if(s < 86400*30) return Math.round(s/86400) + "d";
  return new Date(Date.now()-s*1000).toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
const when = t => new Date(t).toLocaleString(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const host = u => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } };
const subOf = id => S.subs.find(s => s.id === id);
const canDelete = item => !!item && ((meId && item.authorId === meId) || (meId && item.hostId === meId) || isOwner);

function toast(msg){
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200);
}
async function act(fn){
  if(!db){ toast("Saving isn't available in this view."); return false; }
  try { await fn(); return true; }
  catch(e){
    const code = e && e.code;
    if(code === "invalid_argument" || code === "not_granted"){ canWrite = false; renderAll(); toast("You have view-only access here. Ask the owner for Contributor access to post."); }
    else if(code === "quota_exceeded") toast("The forum is full. Delete old threads or streams to make room.");
    else if(code === "resource_exhausted") toast("Too many actions at once. Wait a moment and try again.");
    else toast("Couldn't save that. Check your connection and try again.");
    return false;
  }
}

// ---------- names ----------
function who(uid, fallback){
  if(!uid) return `<span class="who">${esc(fallback || "Sample")}</span>`;
  return `<span class="who" data-uid="${esc(uid)}">Member</span>`;
}
function avatar(uid, cls){
  return uid ? `<img class="av ${cls||""}" alt="" data-av="${esc(uid)}">` : `<span class="av ${cls||""}" aria-hidden="true"></span>`;
}
async function fillNames(root){
  if(!user) return;
  const els = root.querySelectorAll("[data-uid],[data-av]");
  if(!els.length) return;
  const ids = [...new Set([...els].map(e => e.dataset.uid || e.dataset.av))];
  const ps = await user.profiles(ids);
  els.forEach(e => {
    const p = ps[e.dataset.uid || e.dataset.av]; if(!p) return;
    if(e.dataset.uid) e.textContent = (p.isMe ? (p.name || "You") : (p.name || "Member"));
    else e.src = p.avatarUrl;
  });
}

// ---------- render ----------
function renderAll(){
  document.body.dataset.sec = S.section;
  renderSections(); renderRail(); renderNotice(); renderDesk(); renderWall(); fillStreamAs(); renderBattle();
  $("listView").hidden = S.view !== "list";
  $("threadView").hidden = S.view !== "thread";
  $("streamView").hidden = S.view !== "stream";
  if(S.view === "list") renderList();
  renderConsole();
  renderCreatorConsoles();
  if(S.view === "thread") renderThread();
  if(S.view === "stream") renderStream();
}

const POS = {callers:"n-top", bots:"n-left", scripts:"n-right"};
function renderSections(){
  
  $("nodes").innerHTML = Object.entries(SECTIONS).map(([k,v]) => {
    const n = S.threads.filter(t => t.section === k).length;
    const subs = S.subs.filter(s => s.section === k).length;
    const live = S.streams.filter(s => s.section === k && s.status === "live").length;
    return `<button class="node ${POS[k]}" data-node="${k}" type="button" aria-haspopup="true" aria-expanded="${S.menu===k}" aria-current="${S.section===k}">
      <span class="halo"></span>
      <span class="hex">${v.icon}</span>
      <span class="lab"><span class="nm">${v.name}</span>
      <span class="st">${subs} SUB · ${n} THR${live?` · <b>● ${live} LIVE</b>`:""}</span></span>
    </button>`;
  }).join("");
  renderCore();
  const m = $("triMenu");
  if(!S.menu){ m.hidden = true; m.innerHTML = ""; return; }
  m.hidden = false; m.className = "menu m-" + S.menu;
  m.innerHTML = menuHtml(S.menu);
}
function menuHtml(k){
  const v = SECTIONS[k];
  const count = id => S.threads.filter(t => t.subId === id).length;
  const subs = S.subs.filter(s => s.section === k).sort((a,b) => count(b.id)-count(a.id) || a.name.localeCompare(b.name));
  const streams = S.streams.filter(s => s.section === k && s.status !== "ended").sort((a,b) => rank(a)-rank(b) || (a.scheduledFor||0)-(b.scheduledFor||0)).slice(0,4);
  const w = canWrite && db;
  return `<div class="mh"><b>${v.name}</b><span>${esc(v.blurb)}</span></div>
    <div class="grp"><div class="gl"><span>Subcategories</span><span>${subs.length}</span></div>
      ${subs.length ? subs.map(s => `<button class="mi" type="button" data-gosub="${k}|${esc(s.id)}"><span class="h">#</span><span class="tx">${esc(s.name)}</span>${S.streams.some(x=>x.subId===s.id&&x.status==="live")?'<span class="dot"></span>':""}<span class="n">${count(s.id)}</span></button>`).join("") : `<div class="none">None yet.</div>`}
    </div>
    <div class="grp"><div class="gl"><span>Streams</span><span>${streams.length}</span></div>
      ${streams.length ? streams.map(s => `<button class="mi" type="button" data-gostream="${k}|${esc(s.id)}">${s.status==="live"?'<span class="dot"></span>':'<span class="h">◷</span>'}<span class="tx">${esc(s.title)}</span><span class="sm">${s.status==="live"?"LIVE":esc(new Date(s.scheduledFor).toLocaleDateString(undefined,{month:"short",day:"numeric"}))}</span></button>`).join("") : `<div class="none">Nothing live or scheduled.</div>`}
    </div>
    <div class="acts">
      <button type="button" class="wide" data-s="${k}">Open ${v.name} →</button>
      ${w ? `<button type="button" data-new="${k}|thread">+ Discussion</button><button type="button" data-new="${k}|stream">+ Stream</button><button type="button" class="wide" data-new="${k}|sub" style="background:var(--surface-2);color:var(--ink);border-color:var(--line)">+ New subcategory</button>` : ""}
    </div>`;
}
function tickClock(){ const c=$("clock"); if(c) c.textContent = "SYNC " + new Date().toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}); }
setInterval(tickClock, 1000); tickClock();

function renderRail(){
  $("blurb").textContent = SECTIONS[S.section].blurb;
  renderRailVoice(); pushPresence();
  const subs = S.subs.filter(s => s.section === S.section);
  const count = id => S.threads.filter(t => t.subId === id).length;
  const liveIn = id => S.streams.some(s => s.subId === id && s.status === "live");
  subs.sort((a,b) => count(b.id) - count(a.id) || a.name.localeCompare(b.name));
  const all = S.threads.filter(t => t.section === S.section).length;
  $("subs").innerHTML =
    `<li><button type="button" data-sub="" aria-current="${!S.sub}">All subcategories<span class="n">${all}</span></button></li>` +
    subs.map(s => `<li><button type="button" data-sub="${esc(s.id)}" aria-current="${S.sub===s.id}"><span class="hash">#</span>${esc(s.name)}${liveIn(s.id)?'<span class="dot" title="Live stream"></span>':""}<span class="n">${count(s.id)}</span></button></li>`).join("");
  $("newSubBtn").hidden = !canWrite || !db;
  // selects
  for(const [id, optional] of [["tSub", false],["sSub", true]]){
    const sel = $(id), keep = sel.value || S.sub || "";
    sel.innerHTML = (optional ? `<option value="">No subcategory</option>` : (subs.length ? "" : `<option value="">Create a subcategory first</option>`)) +
      subs.map(s => `<option value="${esc(s.id)}">#${esc(s.name)}</option>`).join("");
    if([...sel.options].some(o => o.value === keep)) sel.value = keep;
  }
}

function fillStreamAs(){
  const sel = $("sAs"); if(!sel) return; const keep = sel.value;
  const bots = typeof myBots === "function" && meId ? myBots() : [], scs = typeof myScripts === "function" && meId ? myScripts() : [];
  sel.innerHTML = `<option value="caller|">Me${isVerified && isVerified(meId) ? " (verified caller)" : ""}</option>` + bots.map(b => `<option value="bot|${esc(b.id)}">Bot: ${esc(b.name)}</option>`).join("") + scs.map(c => `<option value="script|${esc(c.id)}">Chart script: ${esc(c.name)}</option>`).join("");
  if([...sel.options].some(o => o.value === keep)) sel.value = keep;
}
function renderNotice(){
  let html = "";
  if(S.offline) html = `<div class="note">This view can't reach the shared forum, so nothing is showing. Open the published page while signed in to see and post discussions.</div>`;
  else if(!canWrite) html = `<div class="note">You can read everything here. To post, the owner needs to give you Contributor access.</div>`;
  $("notice").innerHTML = html;
}

function renderList(){
  const sec = SECTIONS[S.section], sub = subOf(S.sub);
  $("listEyebrow").textContent = sub ? `${sec.name} / subcategory` : "Section";
  $("listTitle").innerHTML = sub ? `<span class="hash">#</span>${esc(sub.name)}` : esc(sec.name);
  $("listDesc").textContent = sub ? (sub.description || `A subcategory of ${sec.name}.`) : sec.blurb;
  const inScope = x => x.section === S.section && (!S.sub || x.subId === S.sub);
  const threads = S.threads.filter(inScope);
  const streams = S.streams.filter(inScope).sort((a,b) => rank(a)-rank(b) || (a.status==="scheduled" ? a.scheduledFor-b.scheduledFor : (b.startedAt||b.createdAt)-(a.startedAt||a.createdAt)));
  $("nThreads").textContent = threads.length;
  $("nStreams").textContent = streams.length;
  $("tabThreads").setAttribute("aria-selected", S.tab === "threads");
  $("tabStreams").setAttribute("aria-selected", S.tab === "streams");
  $("newThreadBtn").hidden = S.tab !== "threads" || !canWrite || !db;
  $("newStreamBtn").hidden = S.tab !== "streams" || !canWrite || !db;
  if(S.tab !== "threads") $("threadForm").hidden = true;
  if(S.tab !== "streams") $("streamForm").hidden = true;

  $("subTools").innerHTML = sub && canDelete(sub) && !threads.length && !streams.length ? delControl("sub", sub.id) : "";
  const body = $("listBody");
  if(!S.ready && !S.offline){ body.innerHTML = `<div class="panel empty">Loading…</div>`; return; }
  if(S.tab === "threads"){
    if(!threads.length){
      body.innerHTML = `<div class="panel empty"><strong>No discussions yet</strong>${S.subs.some(s=>s.section===S.section) ? "Start the first one." : "Create a subcategory, then start the first discussion."}</div>`;
    } else {
      body.innerHTML = `<div class="panel list">` + threads.map(t => {
        const sb = subOf(t.subId);
        return `<button class="row" type="button" data-thread="${esc(t.id)}">
          ${avatar(t.authorId)}
          <span style="min-width:0"><div class="t">${esc(t.title)}</div>
          <div class="m">${!S.sub && sb ? `<span class="chip">#${esc(sb.name)}</span>` : ""}${t.example?'<span class="chip ex">Example</span>':""}<span>by ${who(t.authorId)}</span>${t.lastAuthorId && t.lastAuthorId!==t.authorId ? `<span>· last reply ${who(t.lastAuthorId)}</span>`:""}</div></span>
          <span class="r">${ago(t.lastActivity)}</span>
        </button>`;
      }).join("") + `</div>`;
    }
  } else {
    if(!streams.length){
      body.innerHTML = `<div class="panel empty"><strong>No streams here</strong>Going live or planning a session? Post a stream so people can find it.</div>`;
    } else {
      body.innerHTML = `<div class="grid">` + streams.map(s => {
        const sb = subOf(s.subId);
        return `<button class="scard" type="button" data-stream="${esc(s.id)}">
          <span style="display:flex;gap:6px;align-items:center">${statusPill(s)}${mediaTag(s)}</span>
          <div class="t">${esc(s.title)}</div>
          <div class="m">${sb ? `<span class="chip">#${esc(sb.name)}</span>` : ""}${s.example?'<span class="chip ex">Example</span>':""}<span>${esc(host(s.url))}</span></div>
          <div class="host">${avatar(s.hostId,"sm")} ${who(s.hostId)}</div>
        </button>`;
      }).join("") + `</div>`;
    }
  }
  fillNames(body);
}
const rank = s => ({live:0, scheduled:1, ended:2})[s.status] ?? 3;
function statusPill(s){
  if(s.status === "live") return `<span class="pill live">Live${s.startedAt?` · ${span(Math.max(60,(Date.now()-s.startedAt)/1000))}`:""}</span>`;
  if(s.status === "scheduled") return `<span class="pill">${esc(when(s.scheduledFor))}</span>`;
  return `<span class="pill">Ended${s.endedAt?` ${ago(s.endedAt)}`:""}</span>`;
}

function delControl(kind, id){
  if(pendingDelete === kind+":"+id)
    return `<span class="confirm">Delete for everyone? <button class="btn danger sm" type="button" data-del-yes="${kind}:${esc(id)}">Delete</button><button class="xbtn" type="button" data-del-no>Keep</button></span>`;
  return `<button class="xbtn" type="button" data-del="${kind}:${esc(id)}">Delete</button>`;
}

function renderThread(){
  const t = S.threads.find(x => x.id === S.openId);
  const head = $("threadHead");
  if(!t){ head.innerHTML = `<div class="empty"><strong>This discussion was removed</strong></div>`; $("posts").innerHTML=""; $("replyCount").textContent=""; $("replyForm").hidden = true; return; }
  const sb = subOf(t.subId);
  head.innerHTML = `
    <div class="byline">${sb?`<span class="chip">#${esc(sb.name)}</span>`:""}${t.example?'<span class="chip ex">Example</span>':""}<span>${esc(SECTIONS[t.section]?.name||"")}</span><span class="tools">${canDelete(t)?delControl("thread",t.id):""}</span></div>
    <h1>${esc(t.title)}</h1>
    <div class="byline">${avatar(t.authorId,"sm")} ${who(t.authorId)} <span>${ago(t.createdAt)}</span></div>
    <div class="body">${esc(t.body)}</div>`;
  $("replyCount").textContent = S.posts.length ? `${S.posts.length} ${S.posts.length===1?"reply":"replies"}` : "No replies yet";
  $("posts").innerHTML = S.posts.map(p => `
    <div class="reply">${avatar(p.authorId)}
      <div style="min-width:0"><div class="byline">${who(p.authorId)} <span>${ago(p.createdAt)}</span><span class="tools">${canDelete(p)?delControl("post",p.id):""}</span></div>
      <div class="body">${esc(p.body)}</div></div>
    </div>`).join("");
  $("replyForm").hidden = !canWrite || !db;
  fillNames(head); fillNames($("posts"));
}

function renderStream(){
  const s = S.streams.find(x => x.id === S.openId);
  const head = $("streamHead");
  if(!s){ head.innerHTML = `<div class="empty"><strong>This stream was removed</strong></div>`; $("msgs").innerHTML=""; return; }
  const sb = subOf(s.subId), mine = meId && s.hostId === meId;
  const h = host(s.url);
  head.innerHTML = `
    <div class="byline">${statusPill(s)}${sb?`<span class="chip">#${esc(sb.name)}</span>`:""}${s.example?'<span class="chip ex">Example</span>':""}<span class="tools">${canDelete(s)?delControl("stream",s.id):""}</span></div>
    <h1>${esc(s.title)}</h1>
    <div class="byline">${avatar(s.hostId,"sm")} Hosted by ${who(s.hostId)}${s.sourceName ? ` · as ${s.sourceKind === "bot" ? "bot" : "chart script"} <b style="color:var(--ink)">${esc(s.sourceName)}</b>` : ""} ${mediaTag(s)}</div>
    <div class="screen"><canvas id="tape" aria-hidden="true"></canvas><div class="inner">
      ${s.status==="ended" ? `<strong>This stream has ended</strong>` : s.status==="scheduled" ? `<strong>Starts ${esc(when(s.scheduledFor))}</strong>` : `<strong>Streaming now</strong>`}
      ${/^https:\/\//.test(s.url) ? `<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${s.media === "audio" ? "Listen on" : "Watch on"} ${esc(h)} ↗</a>` : ""}
      <span class="host">${esc(s.url)}</span>
    </div></div>
    ${s.description?`<div class="body">${esc(s.description)}</div>`:""}
    ${mine ? `<div class="hostctl">${s.status!=="live"&&s.status!=="ended"?`<button class="btn sm" type="button" data-golive="${esc(s.id)}">Go live</button>`:""}${s.status==="live"?`<button class="btn ghost sm" type="button" data-end="${esc(s.id)}">End stream</button>`:""}${s.status==="ended"?`<button class="btn ghost sm" type="button" data-golive="${esc(s.id)}">Go live again</button>`:""}</div>`:""}`;
  drawTape();
  $("msgs").innerHTML = S.chat.length ? S.chat.map(m => `<div class="msg">${who(m.authorId)}${esc(m.body)}<time>${ago(m.createdAt)}</time></div>`).join("")
    : `<div class="empty" style="padding:24px 8px">No messages yet.</div>`;
  const box = $("msgs"); box.scrollTop = box.scrollHeight;
  $("chatForm").hidden = !canWrite || !db || s.status === "ended";
  fillNames(head); fillNames(box);
}

// decorative candle tape behind the stream card
function drawTape(){
  const c = $("tape"); if(!c) return;
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio||1;
  c.width = r.width*dpr; c.height = r.height*dpr;
  const g = c.getContext("2d"); g.scale(dpr,dpr);
  const cs = getComputedStyle(document.body);
  const up = cs.getPropertyValue("--scripts").trim(), dn = cs.getPropertyValue("--live").trim();
  let seed = [...(S.openId||"x")].reduce((a,ch)=>a+ch.charCodeAt(0),7);
  const rnd = () => (seed = (seed*9301+49297)%233280)/233280;
  const n = Math.max(12, Math.floor(r.width/14)), w = r.width/n;
  let p = r.height*.55;
  for(let i=0;i<n;i++){
    const o = p, cl = Math.min(r.height*.85, Math.max(r.height*.15, o + (rnd()-.48)*r.height*.12));
    const hi = Math.min(o,cl) - rnd()*r.height*.05, lo = Math.max(o,cl) + rnd()*r.height*.05;
    g.fillStyle = g.strokeStyle = cl < o ? up : dn;
    g.globalAlpha = .45;
    g.beginPath(); g.moveTo(i*w+w/2, hi); g.lineTo(i*w+w/2, lo); g.stroke();
    g.fillRect(i*w+w*.2, Math.min(o,cl), w*.6, Math.max(2, Math.abs(cl-o)));
    p = cl;
  }
}

// ---------- navigation ----------
function go(patch){
  const prevView = S.view, prevId = S.openId;
  Object.assign(S, patch);
  pendingDelete = null;
  if(S.battlePage && typeof renderBattlePage === "function"){ S.battlePage = false; renderBattlePage(); }
  if(S.vortexPage && typeof renderVortexPage === "function"){ S.vortexPage = false; renderVortexPage(); }
  if(S.view !== prevView || S.openId !== prevId){
    if(unsubPosts){ unsubPosts(); unsubPosts=null; S.posts=[]; }
    if(unsubChat){ unsubChat(); unsubChat=null; S.chat=[]; }
    leaveRoom();
    if(S.view === "thread") openPosts(S.openId);
    if(S.view === "stream") openChat(S.openId);
    scrollShell();
  }
  try { if(location.hash.slice(1) !== S.section) history.replaceState(null,"","#"+S.section); } catch {}
  renderAll();
}
function scrollShell(){
  if(!$("shell").offsetParent) return;
  const r = $("shell").getBoundingClientRect();
  if(r.top < 0 || r.top > innerHeight*.6) $("shell").scrollIntoView({block:"start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
}
function openPosts(id){
  if(!db) return;
  unsubPosts = db.collection("posts").where("threadId","==",id).orderBy("createdAt","asc").limit(500)
    .onSnapshot(s => { S.posts = s.docs.map(d => ({id:d.id, ...d.data()})); if(S.view==="thread") renderThread(); }, () => {});
}
function openChat(id){
  if(!db) return;
  unsubChat = db.collection("chat").where("streamId","==",id).orderBy("createdAt","desc").limit(150)
    .onSnapshot(s => { S.chat = s.docs.map(d => ({id:d.id, ...d.data()})).reverse(); if(S.view==="stream") renderStream(); }, () => {});
  joinRoom(id);
}
async function joinRoom(id){
  $("watching").textContent = "";
  if(!roomApi) return;
  try {
    const r = await roomApi.join("stream-" + id.replace(/[^A-Za-z0-9-]/g,""));
    if(S.view !== "stream" || S.openId !== id){ r.leave(); return; }
    streamRoom = r;
    r.presence({watching:true});
    r.onPeers(ch => { const n = ch.peers.length; $("watching").textContent = n ? `${n} here now` : ""; });
  } catch {}
}
function leaveRoom(){ if(streamRoom){ try{ streamRoom.leave(); }catch{} streamRoom=null; } $("watching").textContent=""; }

// ---------- events ----------
document.addEventListener("click", async e => {
  if(S.menu && !e.target.closest("#triMenu,[data-node]")){ S.menu = null; renderSections(); }
  const b = e.target.closest("button,a"); if(!b) return;
  const d = b.dataset;
  if("deskclose" in d){ document.body.classList.remove("deskopen"); window.scrollTo({top:0}); return; }
  if("desk" in d){ document.body.classList.add("deskopen"); $("desk").scrollIntoView({block:"start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); return; }
  if(d.asset){ S.asset = d.asset; subscribeDesk(); renderCore(); renderDesk(); return; }
  if(d.tf){ S.tf = d.tf; subscribeDesk(); renderCore(); renderDesk(); return; }
  if(d.lb){ S.lbTab = d.lb; renderBoard(); fillNames($("lb")); return; }
  if(d.call){ return placeCall(d.call); }
  if(d.resolve){ const [st,dir] = d.resolve.split("|"); return resolveRound(+st, dir); }
  if(SECTIONS[d.node]){ openCallersPage(true, d.node); return; }
  if(d.node){ S.menu = S.menu === d.node ? null : d.node; renderSections(); if(S.menu) $("triMenu").querySelector("button")?.focus({preventScroll:true}); return; }
  if(d.gosub){ const [k,id] = d.gosub.split("|"); S.menu = null; go({section:k, sub:id, tab:"threads", view:"list", openId:null}); return scrollShell(); }
  if(d.gostream){ const [k,id] = d.gostream.split("|"); S.menu = null; if(S.cc) openCC(false); return go({section:k, sub:null, view:"stream", openId:id}); }
  if(d.new){
    const [k,kind] = d.new.split("|"); S.menu = null;
    go({section:k, view:"list", openId:null, tab: kind==="stream" ? "streams" : "threads"});
    const f = $(kind==="sub" ? "subForm" : kind==="stream" ? "streamForm" : "threadForm");
    f.hidden = false; f.scrollIntoView({block:"center"}); f.querySelector("input,textarea")?.focus({preventScroll:true}); return;
  }
  if(d.s){ S.menu = null; go({section:d.s, sub:null, view:"list", openId:null}); return scrollShell(); }
  if("sub" in d) return go({sub:d.sub||null, view:"list", openId:null});
  if(d.tab) return go({tab:d.tab});
  if(d.thread) return go({view:"thread", openId:d.thread});
  if(d.stream) return go({view:"stream", openId:d.stream});
  if("back" in d) return go({view:"list", openId:null});
  if(d.cancel){ $(d.cancel).hidden = true; return; }
  if(d.del){ pendingDelete = d.del; return renderAll(); }
  if("delNo" in d){ pendingDelete = null; return renderAll(); }
  if(d.delYes){
    const [kind, id] = d.delYes.split(":"); pendingDelete = null;
    if(kind === "thread"){
      const ok = await act(async () => {
        const ps = await db.collection("posts").where("threadId","==",id).limit(500).get();
        for(const p of ps.docs) await db.doc("posts/"+p.id).delete();
        await db.doc("threads/"+id).delete();
      });
      if(ok){ toast("Discussion deleted"); go({view:"list", openId:null}); }
    } else if(kind === "post"){
      if(await act(() => db.doc("posts/"+id).delete())) toast("Reply deleted");
    } else if(kind === "stream"){
      const ok = await act(async () => {
        const cs = await db.collection("chat").where("streamId","==",id).limit(500).get();
        for(const c of cs.docs) await db.doc("chat/"+c.id).delete();
        await db.doc("streams/"+id).delete();
      });
      if(ok){ toast("Stream deleted"); go({view:"list", openId:null}); }
    } else if(kind === "sub"){
      if(await act(() => db.doc("subs/"+id).delete())){ toast("Subcategory deleted"); go({sub:null}); }
    }
    return renderAll();
  }
  if(d.golive){ const now = Date.now(); if(await act(() => db.doc("streams/"+d.golive).update({status:"live", startedAt:now, endedAt:null}))) toast("You're live"); return; }
  if(d.end){ if(await act(() => db.doc("streams/"+d.end).update({status:"ended", endedAt:Date.now()}))) toast("Stream ended"); return; }
  if(b.id === "newSubBtn"){ const f=$("subForm"); f.hidden=!f.hidden; if(!f.hidden) $("subName").focus(); return; }
  if(b.id === "newThreadBtn"){ const f=$("threadForm"); f.hidden=!f.hidden; if(!f.hidden){ if(S.sub) $("tSub").value=S.sub; $("tTitle").focus(); } return; }
  if(b.id === "newStreamBtn"){ const f=$("streamForm"); f.hidden=!f.hidden; if(!f.hidden){ if(S.sub) $("sSub").value=S.sub; $("sTitle").focus(); } return; }
});
document.addEventListener("change", e => {
  if(e.target.name === "sWhen") $("sAt").hidden = e.target.value !== "scheduled";
});

$("subForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("subName").value.trim().toLowerCase().replace(/^#/,"").replace(/\s+/g,"-").replace(/[^a-z0-9\-_.]/g,"");
  if(!name){ toast("Use letters, numbers or dashes for the name."); return; }
  if(S.subs.some(s => s.section === S.section && s.name === name)){ toast(`#${name} already exists in ${SECTIONS[S.section].name}.`); return; }
  const id = newId(), section = S.section;
  const ok = await act(() => db.doc("subs/"+id).set({section, name, description:$("subDesc").value.trim(), authorId:meId, createdAt:Date.now()}));
  if(ok){ e.target.reset(); e.target.hidden = true; toast(`Created #${name}`); go({sub:id, view:"list"}); }
});

$("threadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const subId = $("tSub").value;
  if(!subId){ toast("Pick a subcategory, or create one in the sidebar first."); return; }
  const now = Date.now(), id = newId();
  const doc = {section:S.section, subId, title:$("tTitle").value.trim(), body:$("tBody").value.trim(), authorId:meId, createdAt:now, lastActivity:now, lastAuthorId:meId};
  if(!doc.title || !doc.body) return;
  if(await act(() => db.doc("threads/"+id).set(doc))){ e.target.reset(); e.target.hidden = true; go({view:"thread", openId:id}); }
});

$("streamForm").addEventListener("submit", async e => {
  e.preventDefault();
  const url = $("sUrl").value.trim();
  if(!/^https:\/\/[^\s]+\.[^\s]+/.test(url)){ toast("Paste the full stream link, starting with https://"); return; }
  const scheduled = $("sLater").checked;
  const at = scheduled ? new Date($("sAt").value).getTime() : null;
  if(scheduled && !(at > Date.now())){ toast("Pick a start time in the future."); return; }
  const now = Date.now(), id = newId();
  const [asKind, asId] = ($("sAs").value || "caller|").split("|");
  const asSrc = asKind === "bot" ? myBots().find(x => x.id === asId) : asKind === "script" ? myScripts().find(x => x.id === asId) : null;
  const doc = {section:S.section, subId:$("sSub").value || null, title:$("sTitle").value.trim(), url, description:$("sDesc").value.trim(),
    media: $("sMediaA").checked ? "audio" : "video", sourceKind: asKind || "caller", sourceId: asSrc ? asId : null, sourceName: asSrc ? asSrc.name : null,
    hostId:meId, authorId:meId, status: scheduled ? "scheduled" : "live", scheduledFor:at, startedAt: scheduled ? null : now, createdAt:now};
  if(await act(() => db.doc("streams/"+id).set(doc))){ e.target.reset(); $("sAt").hidden = true; e.target.hidden = true; go({view:"stream", openId:id}); }
});

$("replyForm").addEventListener("submit", async e => {
  e.preventDefault();
  const body = $("rBody").value.trim(), tid = S.openId; if(!body) return;
  const now = Date.now();
  const ok = await act(async () => {
    await db.collection("posts").add({threadId:tid, body, authorId:meId, createdAt:now});
    await db.doc("threads/"+tid).update({lastActivity:now, lastAuthorId:meId});
  });
  if(ok) e.target.reset();
});

$("chatForm").addEventListener("submit", async e => {
  e.preventDefault();
  const body = $("cBody").value.trim(), sid = S.openId; if(!body) return;
  $("cBody").value = "";
  await act(() => db.collection("chat").add({streamId:sid, body, authorId:meId, createdAt:Date.now()}));
});

document.addEventListener("keydown", e => { if(e.key === "Escape" && S.menu){ const k = S.menu; S.menu = null; renderSections(); document.querySelector(`[data-node="${k}"]`)?.focus(); } });
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if(h === "command" && !S.cc) return openCC(true); if(h === "battle" && !S.battlePage) return openBattle(true); if(h === "vortex" && !S.vortexPage) return openVortex(true); if(h === "cortex" && !S.cortex) return openCortex(true); if(SECTIONS[h] && h !== S.section) go({section:h, sub:null, view:"list", openId:null}); });
window.addEventListener("resize", () => { if(S.view === "stream") drawTape(); });
setInterval(() => { if(S.view === "list") renderList(); }, 60000);

// ---------- round desk ----------
const ASSETS = ["BTC","ETH","SOL","XRP"];
const TF = {"15m":900000, "1h":3600000};
const SRC = {caller:{name:"Callers", c:"var(--callers)"}, bot:{name:"Bots", c:"var(--bots)"}, script:{name:"Scripts", c:"var(--scripts)"}};
let unsubCalls=null, unsubRes=null, isAdmin=false, lastCur=0, calling=false;
const curStart = () => Math.floor(Date.now()/TF[S.tf])*TF[S.tf];
const dayOf = ms => new Date(ms).toISOString().slice(0,10).replace(/-/g,"");
const dId = (start) => `${S.asset}-${S.tf}-${dayOf(start)}`;
const mmss = ms => { ms=Math.max(0,ms); const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return (h?h+":"+String(m).padStart(2,"0"):String(m).padStart(2,"0"))+":"+String(x).padStart(2,"0"); };
const tLocal = ms => new Date(ms).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
const tET = ms => new Date(ms).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"});
const win = start => `${tLocal(start)}–${tLocal(start+TF[S.tf])} · ${tET(start)}–${tET(start+TF[S.tf])} ET`;
const entriesFor = start => { const d = S.callDocs[dId(start)]; const r = d && d.rounds && d.rounds[String(start)]; return r ? Object.entries(r).map(([k,v]) => ({k, ...v})) : []; };
const resultFor = start => { const d = S.resDocs[dId(start)]; return d && d.r ? d.r[String(start)] : undefined; };
const valid = (e, start) => e && (e.d === "up" || e.d === "down") && e.t < start && (e.s !== "caller" || isVerified(e.a));
function tally(list){
  const o = {up:0, down:0, caller:{up:0,down:0}, bot:{up:0,down:0}, script:{up:0,down:0}};
  list.forEach(e => { o[e.d]++; if(o[e.s]) o[e.s][e.d]++; });
  return o;
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,30);

function subscribeDesk(){
  if(!db) return;
  if(unsubCalls) unsubCalls(); if(unsubRes) unsubRes();
  S.callDocs = {}; S.resDocs = {};
  const q = c => db.collection(c).where("asset","==",S.asset).where("tf","==",S.tf).orderBy("day","desc").limit(9);
  unsubCalls = q("calls").onSnapshot(s => { S.callDocs = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderCore(); renderDesk(); renderWall(); checkAnnouncements(); checkTaggedAnnouncements(); }, () => {});
  unsubRes = q("results").onSnapshot(s => { S.resDocs = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderDesk(); }, () => {});
}

// merge-write that creates the day document on first use
async function mergeWrite(ref, patch){
  try { await ref.update(patch); return; }
  catch(e){ if(!e || e.code !== "invalid_argument") throw e; }
  const lease = await ref.acquire({holder: meId || "anon", ttlMs: 4000});
  if(!lease.acquired){ await new Promise(r => setTimeout(r, 1200)); await ref.update(patch); return; }
  const snap = await ref.get();
  if(!snap.exists) await ref.set(patch); else await ref.update(patch);
}

function renderCore(){
  const nxt = curStart() + TF[S.tf];
  const t = tally(entriesFor(nxt).filter(e => valid(e, nxt))), tot = t.up + t.down, pct = tot ? Math.round(t.up/tot*100) : 0;
  $("core").innerHTML = `<span>${S.asset} ${S.tf.toUpperCase()}</span><span>locks <b id="coreClock">${mmss(nxt - Date.now())}</b></span>${tot ? `<span class="u">▲${pct}%</span><span class="d">▼${100-pct}%</span>` : `<span>no calls yet</span>`}`;
}

function sumHtml(list){
  const t = tally(list), tot = t.up + t.down, pct = tot ? Math.round(t.up/tot*100) : 0;
  return `<div class="bar ${tot?"":"none"}"><i style="width:${pct}%"></i></div>
    <div class="lg"><span class="dir up">▲ ${tot?pct:0}%</span><span style="color:var(--ink-3)">${tot} call${tot===1?"":"s"}</span><span class="dir down">${tot?100-pct:0}% ▼</span></div>
    <div class="srcs">${Object.entries(SRC).map(([k,v]) => `<div style="--c:${v.c}"><b>${v.name}</b><span class="u">▲${t[k].up}</span> <span class="d">▼${t[k].down}</span></div>`).join("")}</div>`;
}
function listHtml(list, start){
  if(!list.length) return `<div class="cempty">No calls yet.</div>`;
  return list.sort((a,b) => a.t - b.t).map(e => `<div class="crow" style="--c:${SRC[e.s]?.c||"var(--ink-3)"}"><span class="sd"></span>
    <span class="nm">${e.s === "caller" ? who(e.a) + '<span class="vk" title="Verified caller">✓</span>' : `${esc(e.l)} <small>by ${who(e.a)}</small>`}</span>
    <span class="dir ${e.d}">${e.d==="up"?"▲ UP":"▼ DOWN"}</span>
    <span class="tm">${mmss(start - e.t)} early</span>${e.s==="caller" && (e.n || e.c) ? `<span class="meta">${esc((e.c||"med").toUpperCase())} · ${esc(venueName(e.v))}${e.n ? " · " + esc(e.n) : ""}</span>` : ""}</div>`).join("");
}

function renderDesk(){
  const cur = curStart(), len = TF[S.tf], nxt = cur + len;
  lastCur = cur;
  $("deskSel").innerHTML = `<div class="seg" role="group" aria-label="Market">${ASSETS.map(a => `<button type="button" data-asset="${a}" aria-pressed="${S.asset===a}">${a}</button>`).join("")}</div>
    <div class="seg" role="group" aria-label="Round length">${Object.keys(TF).map(k => `<button type="button" data-tf="${k}" aria-pressed="${S.tf===k}">${k.toUpperCase()}</button>`).join("")}</div>`;
  $("nextWin").textContent = win(nxt);
  $("liveWin").textContent = win(cur);
  const nextList = entriesFor(nxt).filter(e => valid(e, nxt));
  const liveList = entriesFor(cur).filter(e => valid(e, cur));
  $("nextSum").innerHTML = sumHtml(nextList);
  $("liveSum").innerHTML = sumHtml(liveList);
  $("nextList").innerHTML = listHtml(nextList, nxt);
  $("liveList").innerHTML = listHtml(liveList, cur);
  // my call
  const src = $("callSrc").value, lbl = $("callLabel").value.trim();
  const mineAll = nextList.filter(e => e.a && e.a === meId);
  const key = `${meId}~${src}~${src==="caller" ? "me" : slug(lbl)}`;
  const mine = nextList.find(e => e.k === key);
  document.querySelectorAll("[data-call]").forEach(b => b.setAttribute("aria-pressed", !!mine && mine.d === b.dataset.call));
  $("myCall").textContent = mineAll.length
    ? "Your calls this round: " + mineAll.map(e => `${e.s==="caller"?"you":e.l} ${e.d==="up"?"▲":"▼"}`).join(", ") + ". You can change them until it locks."
    : "Pick a side. You can change it until the round starts.";
  $("callBox").hidden = !db || !canWrite;
  const cOpt = $("callSrc").querySelector('option[value="caller"]');
  cOpt.disabled = !isVerified(meId); cOpt.textContent = isVerified(meId) ? "As a verified caller" : "As a caller (verified only)";
  if(cOpt.disabled && $("callSrc").value === "caller"){ $("callSrc").value = "bot"; $("callLabel").hidden = false; $("callLabel").placeholder = "Bot name"; }
  renderConsole();
  // recent rounds
  const rows = [];
  for(let i=1;i<=8;i++){
    const st = cur - i*len, list = entriesFor(st).filter(e => valid(e, st)), r = resultFor(st);
    const t = tally(list), tot = t.up + t.down, crowd = tot ? (t.up >= t.down ? "up" : "down") : null;
    const pct = tot ? Math.round(Math.max(t.up,t.down)/tot*100) : 0;
    rows.push(`<div class="rr"><span class="t">${tLocal(st)}–${tLocal(st+len)}</span>
      <span class="crowd">${tot ? `crowd ${crowd==="up"?"▲":"▼"}${pct}%${r ? (crowd===r ? " ✓" : " ✗") : ""}` : "no calls"}</span>
      ${r ? `<span class="res ${r}">${r==="up"?"▲ UP":"▼ DOWN"}</span>` : (isAdmin && db ? `<span class="rbtns"><button class="u" type="button" data-resolve="${st}|up" title="Mark this round UP">▲</button><button class="d" type="button" data-resolve="${st}|down" title="Mark this round DOWN">▼</button></span>` : `<span class="res pend">PENDING</span>`)}
    </div>`);
  }
  $("recent").innerHTML = rows.join("") + (isAdmin ? `<p class="fine" style="margin-top:6px">You can mark results. Use the settled outcome on Kalshi or Polymarket.</p>` : "");
  renderBoard();
  fillNames($("desk"));
  renderBattle();
}

function renderBoard(){
  const tab = S.lbTab;
  $("lbTabs").innerHTML = Object.entries(SRC).map(([k,v]) => `<button type="button" role="tab" data-lb="${k}" style="--c:${v.c}" aria-selected="${tab===k}">${v.name}</button>`).join("");
  const stats = {}, cutoff = Date.now() - 7*86400000;
  for(const d of Object.values(S.callDocs)){
    const rs = S.resDocs[`${d.asset}-${d.tf}-${d.day}`];
    if(!d.rounds || !rs || !rs.r) continue;
    for(const [st, entries] of Object.entries(d.rounds)){
      const start = +st, r = rs.r[st];
      if(!r || start < cutoff) continue;
      for(const e of Object.values(entries)){
        if(!valid(e, start) || e.s !== tab) continue;
        const k = e.s === "caller" ? e.a : `${e.a}~${slug(e.l||"")}`;
        const o = stats[k] || (stats[k] = {a:e.a, l:e.l, n:0, h:0});
        o.n++; if(e.d === r) o.h++;
      }
    }
  }
  const rows = Object.values(stats).sort((x,y) => (y.n>=5)-(x.n>=5) || y.h/y.n - x.h/x.n || y.n - x.n).slice(0,10);
  $("lbScope").textContent = `${S.asset} ${S.tf.toUpperCase()} · last 7 days`;
  $("lb").innerHTML = rows.length ? rows.map((o,i) => {
    const pct = Math.round(o.h/o.n*100);
    return `<div class="lbrow" style="--c:${SRC[tab].c}"><span class="rk">${o.n>=5 ? i+1 : "–"}</span>
      <span class="nm">${tab==="caller" ? who(o.a) + '<span class="vk">✓</span>' : `${esc(o.l)}<small>by ${who(o.a)}</small>`}</span>
      <span class="sc">${pct}%<small>${o.h}/${o.n}</small></span><span class="hb"><i style="width:${pct}%"></i></span></div>`;
  }).join("") : `<div class="cempty">No resolved ${SRC[tab].name.toLowerCase()} calls for ${S.asset} ${S.tf} yet.</div>`;
}

async function placeCall(dir){
  if(calling) return;
  const src = $("callSrc").value, lbl = $("callLabel").value.trim();
  if(src !== "caller" && !lbl){ toast(`Name the ${src === "bot" ? "bot" : "script"} this call comes from.`); $("callLabel").focus(); return; }
  if(!meId){ toast("Sign in to make calls."); return; }
  if(src === "caller" && !isVerified(meId)){ toast("Only verified callers can post caller calls. Request verification in the Callers section."); return; }
  const start = curStart() + TF[S.tf];
  const key = `${meId}~${src}~${src==="caller" ? "me" : slug(lbl)}`;
  const entry = {d:dir, s:src, l: src==="caller" ? "" : lbl, a:meId, t:Date.now()};
  calling = true;
  const ok = await act(() => mergeWrite(db.doc("calls/" + dId(start)), {asset:S.asset, tf:S.tf, day:dayOf(start), rounds:{[String(start)]:{[key]:entry}}}));
  calling = false;
  if(ok) toast(`Called ${S.asset} ${dir === "up" ? "▲ UP" : "▼ DOWN"} for ${tLocal(start)}`);
}
async function resolveRound(start, dir){
  const ok = await act(() => mergeWrite(db.doc("results/" + dId(start)), {asset:S.asset, tf:S.tf, day:dayOf(start), r:{[String(start)]:dir}}));
  if(ok) toast(`Marked ${tLocal(start)} round ${dir === "up" ? "UP" : "DOWN"}`);
}

setInterval(() => {
  const cur = curStart(), nxt = cur + TF[S.tf];
  if(cur !== lastCur){ renderCore(); renderDesk(); return; }
  const c1 = $("coreClock"); if(c1) c1.textContent = mmss(nxt - Date.now());
  $("deskClock").textContent = mmss(nxt - Date.now());
  $("liveClock").textContent = mmss(nxt - Date.now());
  const cc = $("conClock"); if(cc) cc.textContent = mmss(nxt - Date.now());
  if(S.cc){ const ck = $("ccClock"); if(ck) ck.textContent = mmss(nxt - Date.now()); document.querySelectorAll(".ccclk").forEach(x => x.textContent = mmss(nxt - Date.now())); }
  document.querySelectorAll(".rchip .clk").forEach(x => x.textContent = mmss(nxt - Date.now()));
  if(S.bcSel) updateCallNow("bot"); if(S.scSel) updateCallNow("script");
}, 1000);
$("callSrc").addEventListener("change", e => { const v = e.target.value; $("callLabel").hidden = v === "caller"; $("callLabel").placeholder = v === "bot" ? "Bot name" : "Script name"; renderDesk(); });
$("callLabel").addEventListener("input", () => { clearTimeout(placeCall.t); placeCall.t = setTimeout(renderDesk, 300); });

// ---------- verified callers + call console ----------
let unsubVer=null, unsubReq=null, unsubMyReq=null;
S.verified = {}; S.requests = []; S.myReq = null; S.conf = "med";
const isVerified = id => !!(id && S.verified[id]);
function subscribeVerify(){
  if(!db) return;
  unsubVer = db.collection("verified").limit(1000).onSnapshot(s => {
    S.verified = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderCore(); renderDesk(); renderWall();
  }, () => {});
  if(meId) unsubMyReq = db.doc("requests/" + meId).onSnapshot(s => { S.myReq = s.exists ? s.data() : null; renderConsole(); }, () => {});
  if(isAdmin) unsubReq = db.collection("requests").limit(500).onSnapshot(s => { S.requests = s.docs.map(d => ({id:d.id, ...d.data()})); renderConsole(); }, () => {});
  if(isAdmin) db.collection("dcreq").limit(500).onSnapshot(s => { S.dcReqs = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); if(S.adminPage && S.apTab === "dchat"){ renderAdmin.lastTab = null; renderAdmin(); } }, () => {});
  else if(meId) db.doc("dcreq/" + meId).onSnapshot(s => { S.dcReqs = s.exists ? {[meId]:s.data()} : {}; if(S.mePage){ renderMe.lastTab = null; renderMe(); } }, () => {});
}

function renderConsole(){
  const box = $("console");
  box.hidden = !(S.mePage && S.mpTab === "console" && $("mpBody").contains(box));
  if(box.hidden) return;
  const me = isVerified(meId) || mpPreview();
  const b = $("vBadge");
  b.className = "badge " + (me ? "ok" : "no");
  b.textContent = mpPreview() ? "Preview" : me ? "✓ Verified caller" : "Not verified";
  // gate
  const g = $("conGate");
  if(me || !db){ g.hidden = !db ? false : true; g.innerHTML = !db ? `<p>Preview: calls you make here stay on this screen. On the live site they post to the round desk and count toward your record.</p>` : ""; }
  else {
    g.hidden = false;
    const pending = !!S.myReq;
    g.innerHTML = `<p>Only verified callers can post round calls here, so the Callers leaderboard stays trustworthy. ${pending ? `Your request was sent ${esc(ago(S.myReq.t))} and is waiting for review.` : "Request verification and an admin will review it."}</p>
      <div class="actions">${isAdmin ? `<button class="btn" type="button" data-verify="${esc(meId)}">Verify myself</button>` : ""}
      ${!meId || !canWrite ? "" : pending ? `<button class="btn ghost" type="button" data-unrequest>Cancel request</button>` : `<button class="btn" type="button" data-request>Request verification</button>`}</div>`;
  }
  $("conTool").hidden = !me || (!canWrite && !mpPreview());
  if(me){
    const cur = curStart(), len = TF[S.tf], nxt = cur + len;
    $("conSel").innerHTML = $("deskSel").innerHTML;
    $("conWin").textContent = `${tLocal(nxt)}–${tLocal(nxt+len)} (${tET(nxt)} ET)`;
    $("conClock").textContent = mmss(nxt - Date.now());
    document.querySelectorAll("[data-conf]").forEach(x => x.setAttribute("aria-pressed", x.dataset.conf === S.conf));
    const key = `${meId}~caller~me`;
    const mine = entriesFor(nxt).find(e => e.k === key) || (mpPreview() ? S.pvCalls[nxt] : null);
    document.querySelectorAll("[data-concall]").forEach(x => x.setAttribute("aria-pressed", !!mine && mine.d === x.dataset.concall));
    refreshBroadcast("caller", "");
    $("conMine").textContent = mine
      ? `Your ${S.asset} ${S.tf} call for ${tLocal(nxt)}: ${mine.d === "up" ? "▲ UP" : "▼ DOWN"} (${(mine.c||"med").toUpperCase()}, ${venueName(mine.v)}). Change it any time before it locks.`
      : `No call yet for the ${tLocal(nxt)} round.`;
    // record
    const rec = [];
    for(let i=0;i<96 && rec.length<10;i++){
      const st = nxt - i*len, e = entriesFor(st).find(x => x.k === key) || (mpPreview() ? S.pvCalls[st] : null);
      if(e) rec.push({st, e, r: resultFor(st)});
    }
    let h=0, n=0;
    for(const d of Object.values(S.callDocs)){
      const rs = S.resDocs[`${d.asset}-${d.tf}-${d.day}`];
      for(const [st, entries] of Object.entries(d.rounds||{})){
        const e = entries[key], r = rs && rs.r && rs.r[st];
        if(e && r && e.t < +st && +st > Date.now()-7*86400000){ n++; if(e.d === r) h++; }
      }
    }
    $("conRecStat").textContent = n ? `${Math.round(h/n*100)}% · ${h}/${n} resolved · ${S.asset} ${S.tf} 7d` : `${S.asset} ${S.tf} · nothing resolved yet`;
    $("conRec").innerHTML = rec.length ? rec.map(({st,e,r}) => `<div class="recrow"><span>${tLocal(st)}</span>
      <span class="dir ${e.d}">${e.d==="up"?"▲ UP":"▼ DOWN"}</span><span class="nt">${esc(e.n || "")}</span>
      <span class="${!r ? "pend" : r === e.d ? "hit" : "miss"}">${st > Date.now() ? "OPEN" : !r ? "PENDING" : r === e.d ? "✓ HIT" : "✗ MISS"}</span></div>`).join("")
      : `<div class="cempty">Your calls for ${S.asset} ${S.tf} will show up here.</div>`;
  }
  // admin
  const ad = $("conAdmin");
  ad.hidden = !isAdmin || !db;
  if(!ad.hidden){
    $("conReq").innerHTML = S.requests.length ? S.requests.map(r => `<div class="vrow">${avatar(r.id,"sm")}<span class="grow">${who(r.id)} <small>asked ${esc(ago(r.t))}</small>${r.note?`<br><small>${esc(r.note)}</small>`:""}</span>
      <button class="btn sm" type="button" data-verify="${esc(r.id)}">Approve</button><button class="btn ghost sm" type="button" data-decline="${esc(r.id)}">Decline</button></div>`).join("")
      : `<div class="cempty">No pending requests.</div>`;
    const ids = Object.keys(S.verified);
    $("conVer").innerHTML = ids.length ? ids.map(id => `<div class="vrow">${avatar(id,"sm")}<span class="grow">${who(id)} <small>since ${esc(new Date(S.verified[id].t).toLocaleDateString(undefined,{month:"short",day:"numeric"}))}</small></span>
      ${pendingDelete === "revoke:"+id ? `<span class="confirm">Revoke? Their calls stop counting. <button class="btn danger sm" type="button" data-revoke-yes="${esc(id)}">Revoke</button><button class="xbtn" type="button" data-del-no>Keep</button></span>` : `<button class="xbtn" type="button" data-del="revoke:${esc(id)}">Revoke</button>`}</div>`).join("")
      : `<div class="cempty">Nobody is verified yet.</div>`;
  }
  fillNames(box);
}
const venueName = v => ({kalshi:"Kalshi", polymarket:"Polymarket", both:"Kalshi + Polymarket"})[v] || "Kalshi";

async function consoleCall(dir){
  if(mpPreview()){ const st0 = curStart() + TF[S.tf]; S.pvCalls[st0] = {d:dir, c:S.conf, v:$("conVenue").value, n:$("conNote").value.trim().slice(0,140), t:Date.now()}; toast(`Locked in ${S.asset} ${S.tf} ${dir === "up" ? "▲ UP" : "▼ DOWN"} for ${tLocal(st0)} (preview only)`); renderConsole(); return; }
  if(calling || !isVerified(meId)) return;
  const start = curStart() + TF[S.tf];
  const key = `${meId}~caller~me`;
  const entry = {d:dir, s:"caller", l:"", a:meId, t:Date.now(), v:$("conVenue").value, c:S.conf, n:$("conNote").value.trim().slice(0,140)};
  calling = true;
  const ok = await act(() => mergeWrite(db.doc("calls/" + dId(start)), {asset:S.asset, tf:S.tf, day:dayOf(start), rounds:{[String(start)]:{[key]:entry}}}));
  calling = false;
  if(ok) toast(`Locked in ${S.asset} ${S.tf} ${dir === "up" ? "▲ UP" : "▼ DOWN"} for ${tLocal(start)}`);
}

async function searchPeople(q){
  if(!user || !user.search) return;
  const hits = await user.search(q);
  $("vHits").innerHTML = hits.filter(h => !S.verified[h.id]).map(h => `<div class="vrow"><img class="av sm" alt="" src="${esc(h.avatarUrl)}"><span class="grow">${esc(h.name)}</span><button class="btn sm" type="button" data-verify="${esc(h.id)}">Verify</button></div>`).join("")
    || (q ? `<div class="cempty">No one found, or they're already verified.</div>` : "");
}
$("vSearch").addEventListener("focus", e => searchPeople(e.target.value.trim()));
$("vSearch").addEventListener("input", e => searchPeople(e.target.value.trim()));

document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return;
  const d = b.dataset;
  if(d.conf){ S.conf = d.conf; renderConsole(); return; }
  if(d.concall){ return consoleCall(d.concall); }
  if("request" in d){ if(await act(() => db.doc("requests/" + meId).set({t:Date.now()}))) toast("Verification requested"); return; }
  if("unrequest" in d){ if(await act(() => db.doc("requests/" + meId).delete())) toast("Request cancelled"); return; }
  if(d.verify){
    const id = d.verify;
    const ok = await act(async () => { await db.doc("verified/" + id).set({t:Date.now(), by:meId}); await db.doc("requests/" + id).delete(); });
    if(ok){ toast("Caller verified"); $("vSearch").value = ""; $("vHits").innerHTML = ""; }
    return;
  }
  if(d.decline){ if(await act(() => db.doc("requests/" + d.decline).delete())) toast("Request declined"); return; }
  if(d.revokeYes){ pendingDelete = null; if(await act(() => db.doc("verified/" + d.revokeYes).delete())) toast("Verification revoked"); return; }
  if("console" in d){ S.menu = null; openConsole(); return; }
});

// ---------- my callers wall ----------
S.follows = []; S.voice = false; S.demo = false; S.events = []; S.talking = null;
let voiceSince = Infinity, announced = new Set(), demoTimer = null, demoState = null, audioCtx = null;
const TF_WORD = {"15m":"15 minute", "1h":"hourly"};
const EQ = '<span class="eq">' + '<i></i>'.repeat(7) + '</span>';

function callerStats(id){
  let h=0, n=0;
  for(const d of Object.values(S.callDocs)){
    const rs = S.resDocs[`${d.asset}-${d.tf}-${d.day}`];
    for(const [st, entries] of Object.entries(d.rounds||{})){
      const r = rs && rs.r && rs.r[st];
      for(const e of Object.values(entries)) if(e.a === id && e.s === "caller" && r && e.t < +st){ n++; if(e.d === r) h++; }
    }
  }
  return n ? Math.round(h/n*100) + "% · " + n : "no record";
}
function realCaller(id){
  const cur = curStart(), nxt = cur + TF[S.tf];
  const live = liveStreamFor("caller", id);
  const pick = st => entriesFor(st).find(e => e.a === id && e.s === "caller");
  return {id, real:true, live, next:pick(nxt), now:pick(cur), rec:callerStats(id)};
}
function tileHtml(c){
  const on = !!c.live, talk = S.talking === c.id;
  const nm = c.real ? who(c.id) : `<span class="who">${esc(c.name)}</span>`;
  const av = c.real ? avatar(c.id,"sm") : `<span class="av sm" style="background:${c.color}"></span>`;
  const line = (k, e) => `<span class="k">${k}</span>${e ? `<span class="dir ${e.d}">${e.d==="up"?"▲ UP":"▼ DOWN"} <span style="color:var(--ink-3)">${esc((e.c||"med").toUpperCase())} · ${esc(venueName(e.v))}</span></span>` : `<span style="color:var(--ink-3)">—</span>`}`;
  const url = on && /^https:\/\//.test(c.live.url) ? c.live.url : null;
  return `<article class="tile ${on?"on":""} ${talk?"talk":""}">
    <div class="feed">
      <div class="ft">${on ? `<span class="pill live">Live · ${mediaWord(c.live.media)}</span>` : `<span class="off">OFFLINE</span>`}</div>
      ${EQ}
      ${on ? `<div class="st"><span>${esc(c.live.title)}</span>${url ? `<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${c.live.media === "audio" ? "Listen" : "Watch"} ↗</a>` : ""}</div>` : ""}
    </div>
    <div class="tb">
      <div class="tn">${av}<span class="grow">${nm}<span class="vk">✓</span></span><span class="hr">${esc(c.rec)}</span></div>
      <div class="tc">${line("NEXT", c.next)}${line("NOW", c.now)}${c.next && c.next.n ? `<span class="nt">“${esc(c.next.n)}”</span>` : ""}</div>
    </div>
  </article>`;
}
function renderWall(){
  if(S.mePage && typeof renderMe === "function" && ["home","favorites","following","reviews","roles","creator","feed"].includes(S.mpTab)) setTimeout(() => renderMe(), 0);
  if(S.callersPage && typeof renderCallerDirInto === "function") setTimeout(() => renderCallerDirInto($("cpList"), "cp"), 0);
  $("demoBar").hidden = !S.demo;
  $("demoBtn").textContent = S.demo ? "Stop demo" : "Play demo";
  $("pickBtn").hidden = S.demo || !db || !meId;
  const vb = $("voiceBtn"); vb.setAttribute("aria-pressed", S.voice); vb.querySelector("span").textContent = S.voice ? "Voice alerts on" : "Voice alerts off";
  const g = $("wgrid");
  const list = S.demo ? demoState.callers : S.follows.filter(isVerified).map(realCaller);
  if(!list.length && favItems("caller").length) g.innerHTML = "";
  else if(!list.length){
    const anyV = Object.keys(S.verified).length;
    g.innerHTML = `<div class="wempty" style="grid-column:1/-1"><strong>${!db ? "Follow callers on the live forum" : anyV ? "Pick the callers you want to watch" : "No verified callers yet"}</strong>
      ${!db ? "Open the published page while signed in. Try Play demo to see how it works." : anyV ? "Use Choose callers. Their streams and round calls will show up here." : "Once callers are verified in the Call console, you can follow them here. Try Play demo meanwhile."}</div>`;
  } else {
    list.sort((a,b) => (!!b.live) - (!!a.live));
    g.innerHTML = list.map(tileHtml).join("");
  }
  $("ticker").innerHTML = S.events.filter(ev => ev.kind === "caller").slice(0,8).map(ev => `<span class="tk"><time>${esc(tLocal(ev.t))}</time>${ev.html}</span>`).join("");
  fillNames($("wall"));
  if(!$("picker").hidden) renderPicker();
  renderBotChartWalls();
  renderBookmarks();
}
function renderPicker(){
  const ids = Object.keys(S.verified);
  $("picker").innerHTML = ids.length ? ids.map(id => {
    const live = S.streams.some(s => s.hostId === id && s.status === "live");
    return `<button class="pk" type="button" data-follow="${esc(id)}" aria-pressed="${S.follows.includes(id)}"><span class="ck">${S.follows.includes(id)?"✓":""}</span>${avatar(id,"sm")}<span class="grow">${who(id)}</span>${live?'<span class="dot"></span>':""}<small>${esc(callerStats(id))}</small></button>`;
  }).join("") : `<div class="cempty">No verified callers yet.</div>`;
  fillNames($("picker"));
}
async function saveFollows(){
  if(!db || !meId) return;
  await act(() => db.doc(`data/users/${meId}/prefs`).set({follows:S.follows, followBots:S.followBots, followCharts:S.followCharts, cc:S.ccLayout, ccw:S.ccw || null, favs:S.favs || [], alerts:S.alerts || {}, priv:S.priv || {}, favStreams:S.favStreams || []}));
}
async function loadFollows(){
  if(!db || !meId) return;
  try { const s = await db.doc(`data/users/${meId}/prefs`).get(); if(s.exists){ const pd = s.data(); S.alerts = pd.alerts || {}; S.priv = pd.priv || {}; S.favs = (pd.favs||[]).slice(0,200); if(Array.isArray(pd.favStreams)){ S.favStreams = pd.favStreams.slice(0,30); try { localStorage.setItem("cxFavStreams", JSON.stringify(S.favStreams)); } catch {} if(typeof renderCxTop === "function"){ renderCxTop.sig = null; if(S.cortex) renderCxTop(); } } S.follows = (pd.follows||[]).slice(0,24); S.followBots = (pd.followBots||[]).slice(0,24); S.followCharts = (pd.followCharts||[]).slice(0,24); S.ccLayout = (pd.cc||[]).slice(0,40); S.ccw = pd.ccw && Array.isArray(pd.ccw.ws) && pd.ccw.ws.length ? pd.ccw : null; } } catch {}
  renderWall();
}

// ----- audio -----
function chime(){
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [880, 1320].forEach((f,i) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = "sine"; g.gain.setValueAtTime(0.0001, t+i*.12); g.gain.exponentialRampToValueAtTime(0.15, t+i*.12+.02); g.gain.exponentialRampToValueAtTime(0.0001, t+i*.12+.25);
      o.connect(g).connect(audioCtx.destination); o.start(t+i*.12); o.stop(t+i*.12+.3); });
  } catch {}
}
function announce(id, text, html, kind){
  S.events.unshift({t:Date.now(), html, kind: kind || "caller"}); S.events = S.events.slice(0,20);
  S.talking = id; renderWall();
  const done = () => { if(S.talking === id){ S.talking = null; renderWall(); } };
  if(S.voice){
    chime();
    if("speechSynthesis" in window){
      const u = new SpeechSynthesisUtterance(text); u.rate = 1.05;
      u.onend = done; u.onerror = done;
      setTimeout(() => speechSynthesis.speak(u), 450);
      setTimeout(done, 9000);
      return;
    }
  }
  setTimeout(done, 2200);
}
const callWords = (e) => `${S.asset} ${TF_WORD[S.tf]} ${e.d === "up" ? "up" : "down"}${e.c === "high" ? ", high confidence" : e.c === "low" ? ", low confidence" : ""}`;
const callHtml = (nameHtml, e) => `${nameHtml} <span class="dir ${e.d}">${e.d==="up"?"▲":"▼"} ${S.asset} ${S.tf.toUpperCase()}</span>`;

async function checkAnnouncements(){
  if(S.demo || !S.follows.length || voiceSince === Infinity) return;
  const nxt = curStart() + TF[S.tf];
  const fresh = [];
  for(const id of S.follows){
    if(!isVerified(id)) continue;
    const e = entriesFor(nxt).find(x => x.a === id && x.s === "caller");
    if(e && e.t > voiceSince){ const k = `c:${id}:${nxt}:${e.d}:${e.t}`; if(!announced.has(k)){ announced.add(k); fresh.push({id, kind:"call", e}); } }
    const s = S.streams.find(x => x.hostId === id && x.status === "live" && (x.startedAt||0) > voiceSince);
    if(s){ const k = `l:${s.id}:${s.startedAt}`; if(!announced.has(k)){ announced.add(k); fresh.push({id, kind:"live", s}); } }
  }
  if(!fresh.length) return;
  const ps = user ? await user.profiles(fresh.map(f => f.id)) : {};
  for(const f of fresh){
    const name = (ps[f.id] && ps[f.id].name) || "A caller you follow";
    if(f.kind === "call") announce(f.id, `${name} calls ${callWords(f.e)}`, callHtml(`<b>${esc(name)}</b>`, f.e));
    else announce(f.id, `${name} is live: ${f.s.title}`, `<b>${esc(name)}</b> <span style="color:var(--live)">went live</span>`);
  }
}

// ----- demo -----
const DEMO = [
  {id:"d1", name:"Nova (demo)", color:"#FFB547"}, {id:"d2", name:"Redline (demo)", color:"#FF4D6A"},
  {id:"d3", name:"Kai Tides (demo)", color:"#4DA3FF"}, {id:"d4", name:"Quiet Mike (demo)", color:"#B98CFF"}];
const NOTES = ["Rejected at the hourly high, fading it", "Funding flipped, momentum long", "Holding above VWAP", "Sweep of the lows then bounce", "Order book thin above, expecting a push", ""];
const DEMO_BOTS = [
  {name:"DeltaFlow", by:"by Nova (demo)", sources:["Order book","Volume delta (CVD)","Funding rate"], rec:"61% · 88"},
  {name:"LiqHunter", by:"by Redline (demo)", sources:["Liquidations","Open interest","Exchange spreads"], rec:"57% · 140"},
  {name:"Sentinel", by:"by Kai Tides (demo)", sources:["Social sentiment","News feed","On-chain flows"], rec:"54% · 63"}];
const DEMO_CHARTS = [
  {name:"Session VWAP Bands", asset:"BTC", tf:"15m", by:"by Quiet Mike (demo)", base:64250, rec:"59% · 72"},
  {name:"Momentum Ribbon", asset:"BTC", tf:"1h", by:"by Nova (demo)", base:64180, rec:"63% · 41"},
  {name:"Range Sniper", asset:"ETH", tf:"15m", by:"by Redline (demo)", base:3125, rec:"55% · 58"}];
const rnd = (a,b) => a + Math.random()*(b-a);
function demoReadFor(src){
  const t = ["up","down","flat"][Math.floor(Math.random()*3)];
  const v = ({"Order book":`${rnd(.8,1.6).toFixed(2)} bid/ask`, "Volume delta (CVD)":`${rnd(-40,40).toFixed(1)}M`, "Funding rate":`${rnd(-.02,.03).toFixed(4)}%`,
    "Liquidations":`$${rnd(1,25).toFixed(1)}M ${Math.random()<.5?"longs":"shorts"}`, "Open interest":`${rnd(-3,3).toFixed(2)}% 1h`, "Exchange spreads":`${rnd(2,18).toFixed(0)} bps`,
    "Social sentiment":`${Math.round(rnd(30,80))}/100`, "News feed":["quiet","ETF flows +","macro print 8:30"][Math.floor(rnd(0,3))], "On-chain flows":`${rnd(-900,900).toFixed(0)} BTC net`})[src] || "—";
  return {k:src, v, t};
}
function startDemo(){
  S.demo = true; S.events = []; S.talking = null;
  demoState = {step:0,
    callers: DEMO.map((c,i) => ({...c, real:false, rec:["64% · 31","58% · 44","71% · 17","52% · 25"][i], next:null,
      now:{d: i%2 ? "down" : "up", c:"med", v:"kalshi"}, live: i===0 ? {title:"BTC 15m rounds, calling every window", url:"https://www.twitch.tv/", media:"video"} : null})),
    bots: DEMO_BOTS.map((b,i) => ({...b, demo:true, key:"db"+i, mode: i===1 ? "video" : "data", live: i===1 ? {title:"LiqHunter heatmap, live", url:"https://www.youtube.com/", media:"video"} : null, status:"running", bias:Math.round(rnd(-40,40)), reads:b.sources.map(demoReadFor), readAt:Date.now(), next:null})),
    charts: DEMO_CHARTS.map((c,i) => ({...c, demo:true, key:"dc"+i, mode: i===0 ? "audio" : "data", live: i===0 ? {title:"Walking the VWAP bands, audio", url:"https://discord.com/", media:"audio"} : null, signal:["long","neutral","short"][i], price:c.base, r1:+(c.base*1.004).toFixed(2), s1:+(c.base*.995).toFixed(2), tgt:+(c.base*1.002).toFixed(2),
      readouts:[{k:"RSI 14", v:String(Math.round(rnd(35,70)))}, {k:"Band", v:["upper","mid","lower"][i]}], sigAt:Date.now(), next:null}))};
  startDemoCommunity();
  renderWall(); renderBattle(); demoTick(); demoTimer = setInterval(demoTick, 3000);
}
function stopDemo(){ clearInterval(demoTimer); demoTimer = null; S.demo = false; setTimeout(() => renderBattle(), 0); S.inVoice = null; setTimeout(() => { renderDock(); renderRailVoice(); }, 0); S.events = []; S.talking = null; if("speechSynthesis" in window) speechSynthesis.cancel(); renderWall(); }
function demoTick(){
  const st = demoState, i = st.step++;
  // bots refresh reads every tick
  st.bots.forEach(b => { b.bias = Math.max(-100, Math.min(100, b.bias + Math.round(rnd(-18,18)))); b.reads = b.sources.map(demoReadFor); b.readAt = Date.now(); });
  st.charts.forEach(c => { c.price = +Math.min(c.r1*0.9995, Math.max(c.s1*1.0005, c.price * (1 + rnd(-.0008,.0008)))).toFixed(2); c.readouts[0].v = String(Math.round(rnd(30,72))); });
  const phase = i % 3;
  if(i === 4){ const c = st.callers[2]; c.live = {title:"SOL + ETH hourly, live levels", url:"https://x.com/", media:"audio"};
    announce(c.id, `${c.name.replace(" (demo)","")} is live`, `<b>${esc(c.name)}</b> <span style="color:var(--live)">went live</span>`); }
  else if(phase === 0){
    const c = st.callers[(i*3 + 1) % st.callers.length];
    const e = {d: Math.random() < .55 ? "up" : "down", c:["low","med","high"][Math.floor(Math.random()*3)], v:["kalshi","polymarket","both"][i%3], n: NOTES[i % NOTES.length]};
    c.next = e; announce(c.id, `${c.name.replace(" (demo)","")} calls ${callWords(e)}`, callHtml(`<b>${esc(c.name)}</b>`, e), "caller");
  } else if(phase === 1){
    const b = st.bots[i % st.bots.length], e = {d: b.bias >= 0 ? "up" : "down", c: Math.abs(b.bias) > 50 ? "high" : "med"};
    b.next = e; announce(b.key, `${b.name} final call, ${callWords(e)}`, callHtml(`<b>${esc(b.name)}</b>`, e), "bot");
  } else {
    const c = st.charts[i % st.charts.length], sigs = ["long","neutral","short"];
    c.signal = sigs[(sigs.indexOf(c.signal) + 1 + Math.floor(rnd(0,2))) % 3]; c.sigAt = Date.now();
    c.next = {d: c.signal === "short" ? "down" : "up", c: c.signal === "neutral" ? "low" : "med"};
    announce(c.key, `${c.name} signal ${c.signal}`, `<b>${esc(c.name)}</b> <span class="spill ${c.signal}">${c.signal.toUpperCase()}</span>`, "chart");
  }
  demoCommunityTick(i);
  if(i > 20) stopDemo();
}

$("voiceBtn").addEventListener("click", () => {
  S.voice = !S.voice;
  if(S.voice){ voiceSince = Date.now(); chime(); if("speechSynthesis" in window){ const u = new SpeechSynthesisUtterance("Voice alerts on"); u.rate = 1.05; speechSynthesis.speak(u); } }
  else if("speechSynthesis" in window) speechSynthesis.cancel();
  renderWall();
});
$("demoBtn").addEventListener("click", () => S.demo ? stopDemo() : startDemo());
$("pickBtn").addEventListener("click", () => { const p = $("picker"); p.hidden = !p.hidden; if(!p.hidden) renderPicker(); });
document.addEventListener("click", e => {
  const b = e.target.closest("[data-follow]"); if(!b) return;
  const id = b.dataset.follow;
  S.follows = S.follows.includes(id) ? S.follows.filter(x => x !== id) : [...S.follows, id].slice(0,24);
  if(voiceSince === Infinity) voiceSince = Date.now();
  renderWall(); saveFollows(); if(S.cortex && (S.ftab === "callers" || cxCat(S.ftab) === "dir")) renderCallerDir();
});

// ---------- bots + chart scripts: registry, consoles, windows ----------
const SOURCES = ["Order book","Funding rate","Open interest","Liquidations","Volume delta (CVD)","On-chain flows","Social sentiment","Options flow","Exchange spreads","News feed"];
S.botDocs = {}; S.scDocs = {}; S.followBots = []; S.followCharts = []; S.bcSel = null; S.scSel = null; S.bcConf = "med"; S.scConf = "med";
const allBots = () => Object.entries(S.botDocs).flatMap(([uid, d]) => Object.entries(d.list || {}).map(([id, b]) => ({...b, id, uid, key: uid + ":" + id})));
const allScripts = () => Object.entries(S.scDocs).flatMap(([uid, d]) => Object.entries(d.list || {}).map(([id, b]) => ({...b, id, uid, key: uid + ":" + id})));
const myBots = () => Object.entries((S.botDocs[meId] || {}).list || {}).map(([id,b]) => ({...b, id}));
const myScripts = () => Object.entries((S.scDocs[meId] || {}).list || {}).map(([id,b]) => ({...b, id}));
const taggedCall = (kind, uid, id, st) => entriesFor(st).find(e => e.s === kind && e.b === id && e.a === uid);
function taggedStats(kind, uid, id){
  let h=0, n=0;
  for(const d of Object.values(S.callDocs)){
    const rs = S.resDocs[`${d.asset}-${d.tf}-${d.day}`];
    for(const [st, entries] of Object.entries(d.rounds||{})){
      const r = rs && rs.r && rs.r[st];
      for(const e of Object.values(entries)) if(e.s === kind && e.b === id && e.a === uid && r && e.t < +st){ n++; if(e.d === r) h++; }
    }
  }
  return n ? Math.round(h/n*100) + "% · " + n : "no record";
}
function subscribeRegistry(){
  if(!db) return;
  db.collection("bots").limit(1000).onSnapshot(s => { S.botDocs = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); cxLiveWatch(); if(S.coinPage && typeof renderCoin === "function") renderCoin(); if(typeof dmDecryptAll === "function" && Object.keys(S.dmDocs || {}).length) dmDecryptAll(); if(S.dmPage && typeof renderDM === "function") renderDM(); renderWall(); renderCreatorConsoles(); checkTaggedAnnouncements(); }, () => {});
  db.collection("scripts").limit(1000).onSnapshot(s => { S.scDocs = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderWall(); renderCreatorConsoles(); checkTaggedAnnouncements(); }, () => {});
}
async function saveMine(coll, list){ const cur = (S.botDocs || {})[meId] || {}, keep = coll === "bots" ? {pub:cur.pub || {}, votes:cur.votes || {}, proposals:cur.proposals || {}, xfer:cur.xfer || {}} : {}; return act(() => db.doc(coll + "/" + meId).set({a:meId, list, ...keep})); }

// ----- tiles -----
const trendIcon = t => t === "up" ? '<span class="tu">▲</span>' : t === "down" ? '<span class="td">▼</span>' : '<span class="tf0">•</span>';
const botPill = b => {
  if(b.readAt && Date.now() - b.readAt > 30*60000 && b.status === "running") return `<span class="spill stale">STALE</span>`;
  return ({running:`<span class="spill run">RUNNING</span>`, paused:`<span class="spill pause">PAUSED</span>`, error:`<span class="spill err">ERROR</span>`})[b.status] || `<span class="spill pause">NO READ YET</span>`;
};
function finalCallHtml(e, rec, mk, hint){
  return `<div class="fc"><span><span class="k">FINAL CALL ${esc(mk || (S.asset + " " + S.tf.toUpperCase()))}</span><br>${hint ? `<span style="color:var(--ink-3)">${esc(hint)}</span>` : e ? `<span class="dir ${e.d}">${e.d==="up"?"▲ UP":"▼ DOWN"}</span> <span style="color:var(--ink-3)">${esc((e.c||"med").toUpperCase())}</span>` : `<span style="color:var(--ink-3)">none yet</span>`}</span><span class="ago" style="text-align:right">${esc(rec)}</span></div>`;
}
function botTile(b){
  const nxt = curStart() + TF[S.tf];
  const e = b.demo ? b.next : taggedCall("bot", b.uid, b.id, nxt);
  const rec = b.demo ? b.rec : taggedStats("bot", b.uid, b.id);
  const bias = Math.max(-100, Math.min(100, +b.bias || 0));
  const reads = (b.reads || []).filter(r => r && r.v);
  const live = b.demo ? b.live : liveStreamFor("bot", b.uid, b.id), mode = b.mode || "data", media = live || mode !== "data";
  return `<article class="tile bt ${S.talking === b.key ? "talk" : ""} ${live ? "on" : ""}">
    <div class="th"><span class="grow"><span class="nm2">${esc(b.name)}</span><small>${b.demo ? esc(b.by) : "by " + who(b.uid)} · ${esc((b.sources||[]).length)} sources</small></span>${botPill(b)}</div>
    ${media ? mediaBlock(live, mode) : ""}
    <div class="bias"><div class="lbl"><span>BEAR</span><b>${bias > 0 ? "+" : ""}${bias}</b><span>BULL</span></div><div class="biasbar"><i style="left:${(bias+100)/2}%"></i></div></div>
    <div class="reads">${media && !reads.length ? "" : reads.length ? reads.slice(0,media ? 3 : 6).map(r => `<div class="rd"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span>${trendIcon(r.t)}</div>`).join("") : `<div class="cempty">No reads posted yet.</div>`}
      ${b.readAt ? `<div class="rd"><span class="k" style="font-size:11px">${b.note ? "“" + esc(b.note) + "”" : ""}</span><span class="v" style="color:var(--ink-3);font-size:11px">read ${esc(ago(b.readAt))}</span><span></span></div>` : ""}</div>
    ${finalCallHtml(e, rec)}
  </article>`;
}
function ladderSvg(c){
  const L = [["R1", c.r1, "var(--dn)", "5 4"], ["TGT", c.tgt, "var(--scripts)", "2 3"], ["PRICE", c.price, "var(--ink)", ""], ["S1", c.s1, "var(--up)", "5 4"]]
    .filter(x => Number.isFinite(+x[1]) && x[1] !== "" && x[1] != null).map(x => [x[0], +x[1], x[2], x[3]]);
  if(L.length < 2) return `<div class="cempty" style="padding:22px 0;text-align:center">Levels appear once the author posts them.</div>`;
  const vs = L.map(x => x[1]); let mx = Math.max(...vs), mn = Math.min(...vs); const pad = (mx - mn || mx*.01 || 1) * .18; mx += pad; mn -= pad;
  const y = v => 8 + (mx - v) / (mx - mn) * 104;
  const fmt = v => v >= 1000 ? v.toLocaleString(undefined,{maximumFractionDigits:0}) : v.toLocaleString(undefined,{maximumFractionDigits:4});
  const ord = L.map((x,i) => ({i, y:y(x[1])})).sort((a,b) => a.y - b.y); let last = -99;
  const ly = []; ord.forEach(o => { const v = Math.max(o.y, last + 12); ly[o.i] = v; last = v; });
  const over = Math.max(0, last - 114); ly.forEach((v,i) => ly[i] = v - over);
  return `<svg class="ladder" viewBox="0 0 300 120" aria-label="Posted levels">
    ${L.map(([k,v,col,da],i) => `<line x1="0" x2="200" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${col}" stroke-width="${k==="PRICE"?2:1.2}" ${da?`stroke-dasharray="${da}"`:""}/>
      <path d="M200 ${y(v).toFixed(1)} L210 ${ly[i].toFixed(1)}" stroke="${col}" stroke-width=".8" fill="none"/>
      <text x="213" y="${(ly[i]+3.5).toFixed(1)}" fill="${col}">${k} ${esc(fmt(v))}</text>`).join("")}
    ${c.price ? `<circle cx="200" cy="${y(+c.price).toFixed(1)}" r="4" fill="var(--ink)"/>` : ""}
  </svg>`;
}
function chartTile(c){
  const nxt = curStart() + TF[S.tf];
  const same = c.asset === S.asset && c.tf === S.tf;
  const e = c.demo ? c.next : same ? taggedCall("script", c.uid, c.id, nxt) : null;
  const rec = c.demo ? c.rec : same ? taggedStats("script", c.uid, c.id) : "";
  const mk = `${c.asset||""} ${(c.tf||"").toUpperCase()}`, hint = !c.demo && !same ? `switch the market to ${mk}` : "";
  const sig = c.signal || "";
  const url = /^https:\/\//.test(c.url || "") ? c.url : null;
  const live = c.demo ? c.live : liveStreamFor("script", c.uid, c.id), mode = c.mode || "data";
  return `<article class="tile ch ${S.talking === c.key ? "talk" : ""} ${live ? "on" : ""}">
    <div class="th"><span class="grow"><span class="nm2">${esc(c.name)}</span><small>${esc(c.asset||"")} · ${esc((c.tf||"").toUpperCase())} · ${c.demo ? esc(c.by) : "by " + who(c.uid)}</small></span>${sig ? `<span class="spill ${esc(sig)}">${esc(sig.toUpperCase())}</span>` : `<span class="spill neutral">NO SIGNAL</span>`}</div>
    ${live || mode !== "data" ? mediaBlock(live, mode) : ""}
    <div class="ladwrap">${ladderSvg(c)}</div>
    <div class="reads">${(c.readouts||[]).slice(0,4).map(r => `<div class="rd"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span><span></span></div>`).join("")}
      <div class="rd"><span class="k">${url ? `<a class="openlink" href="${esc(url)}" target="_blank" rel="noopener noreferrer">OPEN SCRIPT ↗</a>` : ""}</span><span class="v" style="color:var(--ink-3);font-size:11px">${c.sigAt ? "updated " + esc(ago(c.sigAt)) : ""}</span><span></span></div></div>
    ${finalCallHtml(e, rec, mk, hint)}
  </article>`;
}
function renderBotChartWalls(){
  const demo = S.demo && demoState;
  $("pickBotsBtn").hidden = $("pickChartsBtn").hidden = !!S.demo || !db || !meId;
  const bots = demo ? demoState.bots : allBots().filter(b => S.followBots.includes(b.key));
  const charts = demo ? demoState.charts : allScripts().filter(c => S.followCharts.includes(c.key));
  $("gridBots").innerHTML = bots.length ? bots.map(botTile).join("") :
    `<div class="wempty" style="grid-column:1/-1"><strong>${allBots().length ? "Pick the bots you want to watch" : "No bots registered yet"}</strong>${allBots().length ? "Use Choose bots." : "Creators register bots in the Bot console in the Bots section. Try Play demo up top meanwhile."}</div>`;
  $("gridCharts").innerHTML = charts.length ? charts.map(chartTile).join("") :
    `<div class="wempty" style="grid-column:1/-1"><strong>${allScripts().length ? "Pick the charts you want to watch" : "No chart scripts registered yet"}</strong>${allScripts().length ? "Use Choose charts." : "Authors register scripts in the Script console in the Chart Scripts section. Try Play demo up top meanwhile."}</div>`;
  if(!bots.length && favItems("bot").length) $("gridBots").innerHTML = "";
  if(!charts.length && favItems("script").length) $("gridCharts").innerHTML = "";
  const tick = kind => S.events.filter(ev => ev.kind === kind).slice(0,8).map(ev => `<span class="tk"><time>${esc(tLocal(ev.t))}</time>${ev.html}</span>`).join("");
  $("tickerBots").innerHTML = tick("bot"); $("tickerCharts").innerHTML = tick("chart");
  if(!$("pickerBots").hidden) renderPick("bots");
  if(!$("pickerCharts").hidden) renderPick("charts");
  fillNames($("wallBots")); fillNames($("wallCharts"));
  renderForumStrips();
  renderCC();
  renderCortex();
}
function renderPick(which){
  const items = which === "bots" ? allBots() : allScripts();
  const fl = which === "bots" ? S.followBots : S.followCharts;
  const el = $(which === "bots" ? "pickerBots" : "pickerCharts");
  el.innerHTML = items.length ? items.map(it => `<button class="pk" type="button" data-fol${which === "bots" ? "bot" : "chart"}="${esc(it.key)}" aria-pressed="${fl.includes(it.key)}"><span class="ck">${fl.includes(it.key)?"✓":""}</span>
    <span class="grow">${esc(it.name)} <small>by ${who(it.uid)}</small></span><small>${which === "bots" ? esc(it.status || "") : esc((it.asset||"") + " " + (it.tf||""))}</small></button>`).join("")
    : `<div class="cempty">Nothing registered yet.</div>`;
  fillNames(el);
}

// ----- creator consoles -----
function renderCreatorConsoles(){
  const listOk = S.view === "list";
  const bc = $("botConsole"), sc = $("scConsole");
  bc.hidden = !(listOk && S.section === "bots"); sc.hidden = !(listOk && S.section === "scripts");
  const can = !!db && !!meId && canWrite;
  if(!bc.hidden){
    const mine = myBots();
    $("bcBadge").textContent = can ? `${mine.length} bot${mine.length===1?"":"s"}` : "Read only";
    $("bcList").innerHTML = can ? mine.map(b => `<button type="button" data-bcsel="${esc(b.id)}" aria-pressed="${S.bcSel === b.id}">${esc(b.name)}</button>`).join("") + `<button type="button" data-bcnew>+ Register a bot</button>` : `<span class="fine">Sign in with Contributor access to register a bot.</span>`;
    if(S.bcSel && !mine.some(b => b.id === S.bcSel)){ S.bcSel = null; $("bcEdit").hidden = true; }
    updateCallNow("bot");
    if(S.bcSel) refreshBroadcast("bot", S.bcSel);
  }
  if(!sc.hidden){
    const mine = myScripts();
    $("scBadge").textContent = can ? `${mine.length} script${mine.length===1?"":"s"}` : "Read only";
    $("scList").innerHTML = can ? mine.map(b => `<button type="button" data-scsel="${esc(b.id)}" aria-pressed="${S.scSel === b.id}">${esc(b.name)}</button>`).join("") + `<button type="button" data-scnew>+ Register a script</button>` : `<span class="fine">Sign in with Contributor access to register a script.</span>`;
    if(S.scSel && !mine.some(b => b.id === S.scSel)){ S.scSel = null; $("scEdit").hidden = true; }
    updateCallNow("script");
    if(S.scSel) refreshBroadcast("script", S.scSel);
  }
}
function updateCallNow(kind){
  const el = $(kind === "bot" ? "bcCallNow" : "scCallNow"); const sel = kind === "bot" ? S.bcSel : S.scSel;
  if(!el || !sel) return;
  const nxt = curStart() + TF[S.tf], e = taggedCall(kind, meId, sel, nxt);
  if(kind === "script"){ const sc = myScripts().find(x => x.id === sel); if(sc && (sc.asset !== S.asset || sc.tf !== S.tf)){ el.textContent = `Calls go to ${sc.asset} ${sc.tf}. Switch the market to ${sc.asset} ${sc.tf} to see the current one.`; return; } }
  el.textContent = e ? `Final call for ${S.asset} ${S.tf} at ${tLocal(nxt)}: ${e.d === "up" ? "▲ UP" : "▼ DOWN"} (${(e.c||"med").toUpperCase()}). Change it until it locks.` : `No final call yet for ${S.asset} ${S.tf} at ${tLocal(nxt)}. Locks in ${mmss(nxt - Date.now())}.`;
  document.querySelectorAll(`[data-${kind === "bot" ? "bc" : "sc"}call]`).forEach(x => x.setAttribute("aria-pressed", !!e && e.d === x.dataset[kind === "bot" ? "bccall" : "sccall"]));
}
const confSeg = (attr, cur) => `<div class="seg">${["low","med","high"].map(c => `<button type="button" data-${attr}="${c}" aria-pressed="${cur===c}">${c.toUpperCase()}</button>`).join("")}</div>`;
function openBotEditor(id){
  S.bcSel = id; const b = myBots().find(x => x.id === id); if(!b) return;
  const reads = Object.fromEntries((b.reads||[]).map(r => [r.k, r]));
  const ed = $("bcEdit"); ed.hidden = false; $("botReg").hidden = true;
  ed.innerHTML = `<div class="rtitle">${esc(b.name)} <span>${esc(b.desc || "")}</span></div>
    <div class="fr"><div class="field"><span class="flabel">Status</span><div class="seg" id="bcStatus">${["running","paused","error"].map(s => `<button type="button" data-bcstatus="${s}" aria-pressed="${(b.status||"running")===s}">${s.toUpperCase()}</button>`).join("")}</div></div>
    <div class="field"><label for="bcBias">Market bias: <b id="bcBiasVal">${+b.bias||0}</b> (−100 bear, +100 bull)</label><input type="range" id="bcBias" min="-100" max="100" step="5" value="${+b.bias||0}"></div></div>
    <div class="field"><span class="flabel">Market reads by source</span><div class="readgrid">${(b.sources||[]).map((s,i) => `<div class="readin"><div class="field"><label for="bcR${i}">${esc(s)}</label><input type="text" id="bcR${i}" data-src="${esc(s)}" maxlength="40" value="${esc(reads[s]?.v || "")}" placeholder="e.g. +0.012%, bids stacked"></div>
      <select id="bcT${i}" aria-label="${esc(s)} trend"><option value="up" ${reads[s]?.t==="up"?"selected":""}>▲</option><option value="flat" ${!reads[s]||reads[s].t==="flat"?"selected":""}>•</option><option value="down" ${reads[s]?.t==="down"?"selected":""}>▼</option></select></div>`).join("") || `<span class="fine">No sources picked.</span>`}</div></div>
    <div class="field"><label for="bcNote">Note (optional)</label><input type="text" id="bcNote" maxlength="100" value="${esc(b.note || "")}"></div>
    <div class="actions" style="justify-content:space-between"><button type="button" class="xbtn" data-bcdel="${esc(b.id)}">Remove bot</button><button type="button" class="btn" data-bcpost>Post read</button></div>
    <div class="rtitle" style="margin-top:6px">Final call <span>${esc(S.asset)} ${esc(S.tf)} next round</span></div><div class="sel">${$("deskSel").innerHTML}</div>
    <div class="callline">${confSeg("bcconf", S.bcConf)}<div class="updown"><button class="up" type="button" data-bccall="up">▲ UP</button><button class="dn" type="button" data-bccall="down">▼ DOWN</button></div></div>
    <div class="mine" id="bcCallNow"></div>
    <div id="bcast-bot"></div>`;
  S.bmode.bot = b.mode || "data"; refreshBroadcast("bot", id, true);
  $("bcBias").addEventListener("input", e => $("bcBiasVal").textContent = e.target.value);
  renderCreatorConsoles();
}
function openScEditor(id){
  S.scSel = id; const c = myScripts().find(x => x.id === id); if(!c) return;
  const ed = $("scEdit"); ed.hidden = false; $("scReg").hidden = true;
  ed.innerHTML = `<div class="rtitle">${esc(c.name)} <span>${esc(c.asset)} · ${esc(c.tf)} · ${esc(c.desc || "")}</span></div>
    <div class="field"><span class="flabel">Signal</span><div class="seg">${["long","neutral","short"].map(s => `<button type="button" data-scsig="${s}" aria-pressed="${(c.signal||"neutral")===s}">${s.toUpperCase()}</button>`).join("")}</div></div>
    <div class="fr4">
      <div class="field"><label for="scPrice">Price</label><input type="text" inputmode="decimal" id="scPrice" value="${esc(c.price ?? "")}"></div>
      <div class="field"><label for="scR1">Resistance</label><input type="text" inputmode="decimal" id="scR1" value="${esc(c.r1 ?? "")}"></div>
      <div class="field"><label for="scS1">Support</label><input type="text" inputmode="decimal" id="scS1" value="${esc(c.s1 ?? "")}"></div>
      <div class="field"><label for="scTgt">Target</label><input type="text" inputmode="decimal" id="scTgt" value="${esc(c.tgt ?? "")}"></div>
    </div>
    <div class="field"><label for="scReads">Indicator readouts, one per line as Name: value</label><textarea id="scReads" rows="3" placeholder="RSI 14: 61&#10;VWAP: price above upper band">${esc((c.readouts||[]).map(r => r.k + ": " + r.v).join("\n"))}</textarea></div>
    <div class="actions" style="justify-content:space-between"><button type="button" class="xbtn" data-scdel="${esc(c.id)}">Remove script</button><button type="button" class="btn" data-scpost>Post signal</button></div>
    <div class="rtitle" style="margin-top:6px">Final call <span>${esc(c.asset)} ${esc(c.tf)} next round</span></div>
    <div class="callline">${confSeg("scconf", S.scConf)}<div class="updown"><button class="up" type="button" data-sccall="up">▲ UP</button><button class="dn" type="button" data-sccall="down">▼ DOWN</button></div></div>
    <div class="mine" id="scCallNow"></div>
    <div id="bcast-script"></div>`;
  S.bmode.script = c.mode || "data"; refreshBroadcast("script", id, true);
  ed.dataset.sig = c.signal || "neutral";
  renderCreatorConsoles();
}
const num = v => { const n = parseFloat(String(v).replace(/[, $]/g,"")); return Number.isFinite(n) ? n : null; };

async function tagCall(kind, id, name, dir, conf, asset, tf){
  if(calling) return;
  asset = asset || S.asset; tf = tf || S.tf;
  const start = Math.floor(Date.now()/TF[tf])*TF[tf] + TF[tf];
  const entry = {d:dir, s:kind, l:name, b:id, a:meId, t:Date.now(), c:conf};
  calling = true;
  const ok = await act(() => mergeWrite(db.doc(`calls/${asset}-${tf}-${dayOf(start)}`), {asset, tf, day:dayOf(start), rounds:{[String(start)]:{[`${meId}~${kind}~${id}`]:entry}}}));
  calling = false;
  if(ok) toast(`${name}: ${dir === "up" ? "▲ UP" : "▼ DOWN"} for ${asset} ${tf} ${tLocal(start)}`);
}

// sources chips (built once)
$("brSources").innerHTML = SOURCES.map((s,i) => `<label><input type="checkbox" id="brS${i}" value="${esc(s)}"> ${esc(s)}</label>`).join("");
$("botReg").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("brName").value.trim(); if(!name) return;
  const sources = [...document.querySelectorAll("#brSources input:checked")].map(x => x.value);
  if(!sources.length){ toast("Pick at least one data source."); return; }
  const id = newId(), list = {...((S.botDocs[meId]||{}).list||{})};
  list[id] = {name, desc:$("brDesc").value.trim(), sources, status:"paused", bias:0, reads:[], createdAt:Date.now()};
  if(await saveMine("bots", list)){ e.target.reset(); e.target.hidden = true; toast(`Registered ${name}`); setTimeout(() => openBotEditor(id), 300); }
});
$("scReg").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("srName").value.trim(); if(!name) return;
  const url = $("srUrl").value.trim();
  if(url && !/^https:\/\//.test(url)){ toast("Script links need to start with https://"); return; }
  const id = newId(), list = {...((S.scDocs[meId]||{}).list||{})};
  list[id] = {name, url, asset:$("srAsset").value, tf:$("srTf").value, desc:$("srDesc").value.trim(), signal:"neutral", readouts:[], createdAt:Date.now()};
  if(await saveMine("scripts", list)){ e.target.reset(); e.target.hidden = true; toast(`Registered ${name}`); setTimeout(() => openScEditor(id), 300); }
});
$("pickBotsBtn").addEventListener("click", () => { const p = $("pickerBots"); p.hidden = !p.hidden; if(!p.hidden) renderPick("bots"); });
$("pickChartsBtn").addEventListener("click", () => { const p = $("pickerCharts"); p.hidden = !p.hidden; if(!p.hidden) renderPick("charts"); });

document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return;
  const d = b.dataset;
  if(d.folbot || d.folchart){
    const isBot = !!d.folbot, key = d.folbot || d.folchart, arr = isBot ? "followBots" : "followCharts";
    S[arr] = S[arr].includes(key) ? S[arr].filter(x => x !== key) : [...S[arr], key].slice(0,24);
    if(voiceSince === Infinity) voiceSince = Date.now();
    renderWall(); saveFollows(); return;
  }
  if("bcnew" in d){ $("botReg").hidden = false; $("bcEdit").hidden = true; S.bcSel = null; renderCreatorConsoles(); $("brName").focus(); return; }
  if("scnew" in d){ $("scReg").hidden = false; $("scEdit").hidden = true; S.scSel = null; renderCreatorConsoles(); $("srName").focus(); return; }
  if(d.bcsel) return openBotEditor(d.bcsel);
  if(d.scsel) return openScEditor(d.scsel);
  if(d.bcstatus){ document.querySelectorAll("[data-bcstatus]").forEach(x => x.setAttribute("aria-pressed", x === b)); return; }
  if(d.scsig){ document.querySelectorAll("[data-scsig]").forEach(x => x.setAttribute("aria-pressed", x === b)); $("scEdit").dataset.sig = d.scsig; return; }
  if(d.bcconf){ S.bcConf = d.bcconf; document.querySelectorAll("[data-bcconf]").forEach(x => x.setAttribute("aria-pressed", x === b)); return; }
  if(d.scconf){ S.scConf = d.scconf; document.querySelectorAll("[data-scconf]").forEach(x => x.setAttribute("aria-pressed", x === b)); return; }
  if("bcpost" in d){
    const list = {...((S.botDocs[meId]||{}).list||{})}, bot = list[S.bcSel]; if(!bot) return;
    const reads = [...document.querySelectorAll("#bcEdit input[data-src]")].map((inp,i) => ({k:inp.dataset.src, v:inp.value.trim(), t:$("bcT"+i).value}));
    list[S.bcSel] = {...bot, status: document.querySelector('[data-bcstatus][aria-pressed="true"]')?.dataset.bcstatus || "running", bias: +$("bcBias").value, reads, note:$("bcNote").value.trim(), readAt:Date.now()};
    if(await saveMine("bots", list)) toast(`Posted read for ${bot.name}`);
    return;
  }
  if("scpost" in d){
    const list = {...((S.scDocs[meId]||{}).list||{})}, sc = list[S.scSel]; if(!sc) return;
    const readouts = $("scReads").value.split("\n").map(l => l.trim()).filter(Boolean).slice(0,6).map(l => { const i = l.indexOf(":"); return i > 0 ? {k:l.slice(0,i).trim().slice(0,30), v:l.slice(i+1).trim().slice(0,40)} : {k:l.slice(0,30), v:""}; });
    list[S.scSel] = {...sc, signal:$("scEdit").dataset.sig || "neutral", price:num($("scPrice").value), r1:num($("scR1").value), s1:num($("scS1").value), tgt:num($("scTgt").value), readouts, sigAt:Date.now()};
    if(await saveMine("scripts", list)) toast(`Posted signal for ${sc.name}`);
    return;
  }
  if(d.bccall){ const bot = myBots().find(x => x.id === S.bcSel); if(bot) await tagCall("bot", bot.id, bot.name, d.bccall, S.bcConf); return; }
  if(d.sccall){ const sc = myScripts().find(x => x.id === S.scSel); if(sc) await tagCall("script", sc.id, sc.name, d.sccall, S.scConf, sc.asset, sc.tf); return; }
  if(d.bcdel){ const list = {...((S.botDocs[meId]||{}).list||{})}; delete list[d.bcdel]; if(await saveMine("bots", list)){ S.bcSel = null; $("bcEdit").hidden = true; toast("Bot removed"); } return; }
  if(d.scdel){ const list = {...((S.scDocs[meId]||{}).list||{})}; delete list[d.scdel]; if(await saveMine("scripts", list)){ S.scSel = null; $("scEdit").hidden = true; toast("Script removed"); } return; }
});

// ----- voice for bots + charts -----
async function checkTaggedAnnouncements(){
  if(S.demo || voiceSince === Infinity) return;
  const nxt = curStart() + TF[S.tf];
  for(const b of allBots().filter(x => S.followBots.includes(x.key))){
    const e = taggedCall("bot", b.uid, b.id, nxt);
    if(e && e.t > voiceSince){ const k = `bc:${b.key}:${nxt}:${e.d}:${e.t}`; if(!announced.has(k)){ announced.add(k); announce(b.key, `${b.name} final call, ${callWords(e)}`, callHtml(`<b>${esc(b.name)}</b>`, e), "bot"); } }
    if(b.status === "error" && b.readAt > voiceSince){ const k = `be:${b.key}:${b.readAt}`; if(!announced.has(k)){ announced.add(k); announce(b.key, `${b.name} reports an error`, `<b>${esc(b.name)}</b> <span class="td">error</span>`, "bot"); } }
  }
  for(const c of allScripts().filter(x => S.followCharts.includes(x.key))){
    const e = taggedCall("script", c.uid, c.id, nxt);
    if(e && e.t > voiceSince){ const k = `sc:${c.key}:${nxt}:${e.d}:${e.t}`; if(!announced.has(k)){ announced.add(k); announce(c.key, `${c.name} final call, ${callWords(e)}`, callHtml(`<b>${esc(c.name)}</b>`, e), "chart"); } }
    if(c.sigAt > voiceSince){ const k = `sg:${c.key}:${c.sigAt}:${c.signal}`; if(!announced.has(k)){ announced.add(k); announce(c.key, `${c.name} signal ${c.signal} on ${c.asset}`, `<b>${esc(c.name)}</b> <span class="spill ${esc(c.signal)}">${esc((c.signal||"").toUpperCase())}</span>`, "chart"); } }
  }
}

// ---------- streams for every source + command center ----------
S.cc = false; S.ccLayout = []; S.bmode = {caller:"calls", bot:"data", script:"data"}; const bLive = {};
const mediaWord = m => m === "audio" ? "Audio" : m === "screen" ? "Screen" : "Video";
const mediaTag = s => s && s.media ? `<span class="mtag">${s.media === "audio" ? "AUDIO" : s.media === "screen" ? "SCREEN" : "VIDEO"}</span>` : "";
function liveStreamFor(kind, uid, id){
  return S.streams.find(s => s.status === "live" && s.hostId === uid && (kind === "caller" ? (!s.sourceKind || s.sourceKind === "caller") : (s.sourceKind === kind && s.sourceId === id)));
}
function mediaBlock(live, mode){
  const m = (live && live.media) || mode;
  const url = live && /^https:\/\//.test(live.url || "") ? live.url : null;
  return `<div class="feed sm ${m === "audio" ? "audio" : ""}">
    <div class="ft">${live ? `<span class="pill live">Live · ${mediaWord(m)}</span>` : `<span class="off">OFFLINE · ${mediaWord(m).toUpperCase()} STREAM</span>`}</div>
    ${EQ}
    ${live ? `<div class="st"><span>${esc(live.title || "")}</span>${url ? `<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${m === "audio" ? "Listen" : "Watch"} ↗</a>` : ""}</div>` : ""}
  </div>`;
}
function broadcastBlock(kind, id){
  const mode = S.bmode[kind], live = meId ? liveStreamFor(kind, meId, id) : null;
  bLive[kind] = live ? live.id : null;
  const modes = kind === "caller" ? [["calls","CALLS ONLY"],["audio","AUDIO"],["video","VIDEO"]] : [["data","DATA FEED"],["audio","AUDIO"],["video","VIDEO"]];
  const isData = mode === "data" || mode === "calls";
  return `<div class="bcast" data-bkind="${kind}" data-bid="${esc(id || "")}">
    <div class="field"><span class="flabel">Broadcast as</span><div class="seg">${modes.map(([m,l]) => `<button type="button" data-bmode="${m}" aria-pressed="${mode === m}">${l}</button>`).join("")}</div></div>
    <div class="bgo" ${isData && !live ? "hidden" : ""}>
      ${live ? `<div class="liveline"><span class="pill live">Live · ${mediaWord(live.media)}</span><span>${esc(live.title)}</span><button class="btn danger sm" type="button" data-bend="${esc(live.id)}">End stream</button></div>`
      : `<div class="fr"><div class="field"><label for="${kind}BUrl">${mode === "audio" ? "Audio" : "Video"} stream link</label><input type="url" id="${kind}BUrl" placeholder="${mode === "audio" ? "X Space, Discord stage, Twitch audio…" : "Twitch, YouTube, Kick…"}"></div>
         <div class="field"><label for="${kind}BTitle">Title</label><input type="text" id="${kind}BTitle" maxlength="100" placeholder="What you're covering"></div></div>
         <div class="actions" style="justify-content:flex-start"><button class="btn sm" type="button" data-bgo>Go live</button></div>`}
    </div>
    <div class="fine">${kind === "caller" ? "Your round calls always post as data. Add audio or video to go live on stream too." : "Data feed shows reads on followers' tiles. Audio or video adds a live stream link to the tile."}</div>
  </div>`;
}
function refreshBroadcast(kind, id, force){
  const host = $("bcast-" + kind); if(!host) return;
  const live = meId ? liveStreamFor(kind, meId, id) : null;
  if(force || !host.firstChild || (live ? live.id : null) !== bLive[kind]) host.innerHTML = broadcastBlock(kind, id);
}
async function saveMode(kind, id, m){
  const coll = kind === "bot" ? "bots" : "scripts", docs = kind === "bot" ? S.botDocs : S.scDocs;
  const list = {...((docs[meId]||{}).list||{})}; if(!list[id]) return;
  list[id] = {...list[id], mode:m};
  await saveMine(coll, list);
}

// ----- command center -----
function getCaller(id){ return S.demo ? demoState.callers.find(c => c.id === id) : (isVerified(id) ? realCaller(id) : null); }
function getBot(key){ return S.demo ? demoState.bots.find(b => b.key === key) : allBots().find(b => b.key === key); }
function getChart(key){ return S.demo ? demoState.charts.find(c => c.key === key) : allScripts().find(c => c.key === key); }
function liveList(){
  if(S.demo) return [...demoState.callers.filter(c => c.live).map(c => ({...c.live, who:c.name, src:"Caller", sec:"callers"})),
    ...demoState.bots.filter(b => b.live).map(b => ({...b.live, who:b.name, src:"Bot", sec:"bots"})), ...demoState.charts.filter(c => c.live).map(c => ({...c.live, who:c.name, src:"Chart", sec:"scripts"}))];
  return S.streams.filter(s => s.status === "live").map(s => ({...s, hid:s.hostId, sec:s.section, src: s.sourceKind === "bot" ? "Bot" : s.sourceKind === "script" ? "Chart" : "Caller"}));
}
function defaultLayout(){
  const L = [{t:"clock", z:"m"}, {t:"live", z:"l"}, {t:"alerts", z:"s"}, {t:"chat", z:"s"}];
  if(S.demo){ demoState.callers.forEach(c => L.push({t:"caller", id:c.id, z:"s"})); demoState.bots.forEach(b => L.push({t:"bot", id:b.key, z:"s"})); demoState.charts.forEach(c => L.push({t:"chart", id:c.key, z:"s"})); }
  else { S.follows.forEach(id => L.push({t:"caller", id, z:"s"})); S.followBots.forEach(k => L.push({t:"bot", id:k, z:"s"})); S.followCharts.forEach(k => L.push({t:"chart", id:k, z:"s"})); }
  return L;
}
function panelBody(p){
  if(p.t === "clock"){
    const cur = curStart(), nxt = cur + TF[S.tf];
    const list = S.demo ? demoState.callers.filter(c => c.next).map(c => ({...c.next, s:"caller"})).concat(demoState.bots.filter(b => b.next).map(b => ({...b.next, s:"bot"})), demoState.charts.filter(c => c.next).map(c => ({...c.next, s:"script"})))
      : entriesFor(nxt).filter(e => valid(e, nxt));
    return [`Round clock · ${S.asset} ${S.tf}`, `<div class="wclock"><div class="sel">${$("deskSel").innerHTML}</div><div class="rsub">Next round ${esc(tLocal(nxt))}–${esc(tLocal(nxt+TF[S.tf]))} locks in</div><div class="big ccclk">${mmss(nxt - Date.now())}</div><div class="consensus">${sumHtml(list)}</div></div>`];
  }
  if(p.t === "live"){
    const L = liveList();
    const grp = [...Object.keys(SECTIONS), "cortex"].map(k => [k, L.filter(s => s.sec === k)]).filter(([,a]) => a.length);
    return [`All live streams · ${L.length}`, L.length ? `<div class="lw">${grp.map(([k,a]) => `<div class="lgrp" style="--c:${k === "cortex" ? "#4DA3FF" : `var(--${k})`}">${k === "cortex" ? "Cortex" : esc(SECTIONS[k].name) + " forum"} · ${a.length}</div>` + a.map(s => `<div class="ls"><div class="m"><span class="pill live">Live</span>${mediaTag(s)}<span>${esc(s.src)}</span></div><div class="t">${esc(s.title || "")}</div>
      <div class="m">${s.who ? esc(s.who) : who(s.hid)}</div>${/^https:\/\//.test(s.url||"") ? `<a class="watch2" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${s.media === "audio" ? "Listen" : "Watch"} ↗</a>` : ""}${s.id ? ` <button class="xbtn2" type="button" data-gostream="${esc(s.sec)}|${esc(s.id)}">Forum</button>` : ""}</div>`).join("")).join("")}</div>`
      : `<div class="cempty" style="padding:14px">Nobody is live right now. This panel fills in on its own when streams start.</div>`];
  }
  if(p.t === "chat"){ const M = loungeMsgs().slice(-14);
    return [`Trade floor · ${onlinePeople().length} online`, `<div class="alertsp">${M.map(m => `<span class="tk"><b>${m.name ? esc(m.name) : who(m.a)}</b> ${esc(m.b)}</span>`).join("") || `<div class="cempty">No messages yet.</div>`}</div><div style="padding:8px 10px"><button class="xbtn2" type="button" data-opencortex>Enter the Cortex</button></div>`]; }
  if(p.t === "alerts") return ["Alerts", `<div class="alertsp">${S.events.slice(0,30).map(ev => `<span class="tk"><time>${esc(tLocal(ev.t))}</time>${ev.html}</span>`).join("") || `<div class="cempty">Calls, signals and go-lives from what you follow land here.</div>`}</div>`];
  if(p.t === "caller"){ const c = getCaller(p.id); return c ? [`Caller`, tileHtml(c)] : ["Caller", `<div class="cempty" style="padding:12px">No longer available.</div>`]; }
  if(p.t === "bot"){ const b = getBot(p.id); return b ? [`Bot · ${b.name}`, botTile(b)] : ["Bot", `<div class="cempty" style="padding:12px">No longer available.</div>`]; }
  if(p.t === "chart"){ const c = getChart(p.id); return c ? [`Chart · ${c.name}`, chartTile(c)] : ["Chart", `<div class="cempty" style="padding:12px">No longer available.</div>`]; }
  return ["", ""];
}
// ----- command center: fully customizable workspaces -----
const CCZ = [["s","S"],["m","M"],["l","L"],["w","XL"],["xl","Full"]];
const CCH = [["a","Auto"],["s","Short"],["m","Medium"],["l","Tall"]];
const CCC = ["", "#4DA3FF","#2EE59D","#FFB547","#FF4D6A","#B98CFF","#FFD166","#5BE3C8"];
const ccK = () => Math.random().toString(36).slice(2, 9);
const ccLocal = () => !!(S.demo || !db || !meId);
const ccStrip = h => String(h || "").replace(/\s(?:id|for|aria-labelledby|aria-controls)="[^"]*"/g, "").replace(/<iframe[\s\S]*?<\/iframe>/g, `<div class="ccnoif">Video window · add it with the Stream player window</div>`);
const ccEmpty = (t, btn) => `<div class="ccempty">${t}${btn || ""}</div>`;
function ccFresh(items){ return {cur:0, lock:false, ws:[{name:"Main", items:(items || defaultLayout()).map(p => ({...p, k:p.k || ccK()}))}]}; }
function ccState(){
  if(ccLocal()){
    if(!S.ccwLocal){ let sv = null; try { sv = JSON.parse(localStorage.getItem("d3mon.cc") || "null"); } catch {} S.ccwLocal = sv && Array.isArray(sv.ws) && sv.ws.length ? sv : ccFresh(); }
    return S.ccwLocal;
  }
  if(!S.ccw || !Array.isArray(S.ccw.ws) || !S.ccw.ws.length) S.ccw = ccFresh(S.ccLayout && S.ccLayout.length ? S.ccLayout : null);
  return S.ccw;
}
function ccWs(){ const st = ccState(); if(!st.ws[st.cur]) st.cur = 0; const W = st.ws[st.cur]; W.items = W.items || []; W.items.forEach(p => { if(!p.k) p.k = ccK(); }); return W; }
const layout = () => ccWs().items;
function ccSave(){
  clearTimeout(ccSave.t);
  ccSave.t = setTimeout(() => {
    const st = ccState();
    if(ccLocal()){ try { localStorage.setItem("d3mon.cc", JSON.stringify(st)); } catch {} return; }
    act(() => mergeWrite(db.doc(`data/users/${meId}/prefs`), {ccw:st}));
  }, 400);
}
function setLayout(L){ ccWs().items = L.slice(0, 60); ccSave(); renderCC(); }
const ccItem = k => layout().find(p => p.k === k);
function ccEdit(k, fn){ const L = layout().map(p => p.k === k ? fn({...p, o:{...(p.o || {})}}) || p : p); setLayout(L); }
function ccNew(t, id, extra){ const W = WG[t] || {}; return {k:ccK(), t, id:id || undefined, z:W.z || "m", h:W.h || "a", o:{...(W.o || {})}, ...(extra || {})}; }
function ccAdd(t, id, extra, quiet){
  const L = layout(); if(L.length >= 60){ toast("This workspace is full (60 windows). Start a new workspace."); return; }
  const p = ccNew(t, id, extra); setLayout(L.concat([p]));
  if(!quiet) toast(`Added “${ccBody(p)[0].replace(/<[^>]+>/g, "")}” to ${ccWs().name}`);
  return p;
}

// ---- what can be pulled in ----
function ccBookmarks(){
  const out = [], seen = new Set();
  const add = (c, kind) => { const key = c.key || c.id; if(!key || !isFav(key, c.name)) return; const fk = favKey(key, c.name); if(seen.has(fk)) return; seen.add(fk); out.push({key, name:(c.name || "").replace(/ \(demo\)$/, ""), kind, c}); };
  try { callerDir().forEach(c => add(c, "caller")); } catch {}
  try { entityDir("bots", true).forEach(c => add(c, "bot")); } catch {}
  try { entityDir("scripts", true).forEach(c => add(c, "script")); } catch {}
  try { memberList().forEach(m => add({...m, key:m.id}, "member")); } catch {}
  return out;
}
const favItems = kind => ccBookmarks().filter(b => b.kind === kind);
function ccWho(key){
  if(!key) return null;
  const b = ccBookmarks().find(x => x.key === key); if(b) return b;
  if(/^[ebs]:/.test(key)){ const it = /^e:/.test(key) ? (getEnts()[key.slice(2)] ? entItem(key, getEnts()[key.slice(2)]) : null) : entityDir(/^b:/.test(key) ? "bots" : "scripts", true).find(x => x.key === key);
    return it ? {key, name:it.name, kind:it.ent && it.ent.kind === "bot" ? "bot" : "script", c:it} : null; }
  const R = profResolve(key); if(!R) return null;
  return {key, name:(R.m.name || R.c.name || "").replace(/ \(demo\)$/, ""), kind:R.c.key ? "caller" : "member", c:{...R.m, ...R.c}};
}
const ccSample = w => !!(w && w.c && (w.c.ent ? w.c.ent.sample : (w.c.sample || w.c.mock || w.c.demo)));
const KINDW = {caller:"Caller", bot:"Bot", script:"Script", member:"Member"};
function ccProfileHtml(key, view){
  const hv = S.profHover; S.profHover = false; S.ccCap = true; S.ccCapOut = "";
  try { openProfile(key, view); } catch {} finally { S.ccCap = false; S.profHover = hv; }
  return S.ccCapOut ? `<div class="prof ccprof">${S.ccCapOut.replace(/<div class="pbanner">[\s\S]*?<\/div>/, "")}</div>` : "";
}
function ccStreams(){
  const out = [], H = vxHost();
  if(H.url) out.push(["host", `${H.name || "HardSmoke"} · host`, H.url]);
  try { liveList().forEach(s => { if(/^https:\/\//.test(s.url || "")) out.push(["u:" + s.url, `${s.who || s.title || "Live stream"}${s.src ? " · " + s.src : ""}`, s.url]); }); } catch {}
  return out;
}
const CCMIR = [["#battle","Battle of the Bots board","home"],["#hsPromo","Vortex promo banner","home"],["#map","Section map","home"],
  ["#wall","My callers wall","me"],["#wallBots","My bots wall","me"],["#wallCharts","My charts wall","me"],
  ["#vxWar","Vortex · battle board","vortex"],["#vxFo","Vortex · face-off","vortex"],["#vxFeed","Vortex · live feed","vortex"],
  ["#cpList","Directory list (last node opened)","callers"],["#cnBody","Coin page (last tab opened)","coin"],["#mpBody","My D3MON (last tab opened)","me"],["#apBody","Admin (last tab opened)","admin"]];
const CCPG = {home:"Home", vortex:"the Vortex", callers:"the directory", coin:"the Coin page", me:"My D3MON", admin:"Admin", cortex:"the Cortex", dm:"Messages", battle:"Battle control", prof:"a profile"};
const ccMirCache = {};
function ccTargets(tg, cur){
  let L = [];
  if(tg === "bk") L = ccBookmarks().map(b => [b.key, `★ ${b.name} · ${KINDW[b.kind]}`]);
  else if(tg === "fol:caller") L = S.demo ? demoState.callers.map(c => [c.id, c.name]) : S.follows.filter(isVerified).map(id => [id, S.nameCache[id] || "Caller"]);
  else if(tg === "fol:bot") L = S.demo ? demoState.bots.map(b => [b.key, b.name]) : allBots().filter(b => S.followBots.includes(b.key)).map(b => [b.key, b.name]);
  else if(tg === "fol:chart") L = S.demo ? demoState.charts.map(c => [c.key, c.name]) : allScripts().filter(c => S.followCharts.includes(c.key)).map(c => [c.key, c.name]);
  else if(tg === "chan") L = Object.entries(DCH).map(([k, v]) => [k, "#" + v[0]]);
  else if(tg === "stream") L = [["", "Auto · host first, then whoever is live"], ...ccStreams().map(([v, l]) => [v, l]), ["url", "My own link (set below)"]];
  else if(tg === "mirror") L = CCMIR.map(([v, l]) => [v, l]);
  if(cur && !L.some(([v]) => v === cur)){ const w = tg === "bk" ? ccWho(cur) : null; L.unshift([cur, w ? `${w.name} · ${KINDW[w.kind]}` : tg === "mirror" ? "Pinned window" : cur]); }
  return L;
}

// ---- widget bodies ----
function ccRow(c, extra){
  const nm = (c.name || "Member").replace(/ \(demo\)$/, ""), live = c.live;
  return `<div class="ccrow"><span class="ccdot" style="background:${esc(c.color || "#4DA3FF")}"></span><button class="plink who" type="button" data-prof="${esc(c.key)}">${c.real && c.id ? who(c.id) : esc(nm)}</button>${isFav(c.key, c.name) ? `<span class="ccfv">★</span>` : ""}${live ? `<span class="rb lv">LIVE</span>` : c.online ? `<span class="ccon">online</span>` : ""}<span class="ccsub">${extra || esc(c.rec || (c.ent && c.ent.rec) || "")}</span>${live && /^https:\/\//.test(live.url || "") ? `<a class="watch2" href="${esc(live.url)}" target="_blank" rel="noopener noreferrer">Watch ↗</a>` : ""}</div>`;
}
function ccDir(list, o){
  let L = list.slice();
  if(o.f === "live") L = L.filter(c => c.live); else if(o.f === "online") L = L.filter(c => c.live || c.online); else if(o.f === "bk") L = L.filter(c => isFav(c.key, c.name));
  L.sort((a, b) => o.s === "live" ? (!!b.live - !!a.live) || (a.name || "").localeCompare(b.name || "") : (a.name || "").localeCompare(b.name || ""));
  const n = Math.max(1, +o.n || 12), shown = L.slice(0, n);
  return [L.length, shown.length ? (o.v === "full" ? `<div class="ccfull">${shown.map(c => rowHtml(c)).join("")}</div>` : `<div class="cclist">${shown.map(c => ccRow(c)).join("")}</div>`) + (L.length > n ? `<div class="ccmore">+${L.length - n} more · raise “How many” in ⚙ settings</div>` : "") : ccEmpty("Nothing matches this filter right now.")];
}
const ccStat = arr => `<div class="ccstats">${arr.map(([l, v, c]) => `<div><b${c ? ` style="color:${c}"` : ""}>${v}</b><span>${l}</span></div>`).join("")}</div>`;
const FILT = [["all","Everyone"],["live","Live now"],["online","Online or live"],["bk","My bookmarks only"]];
const SORTS = [["az","A to Z"],["live","Live first"]];
const VIEWS = [["compact","Compact list"],["full","Full rows with links"]];
const TZS = [["local","My time"],["UTC","UTC"],["America/New_York","New York"],["America/Chicago","Chicago"],["America/Los_Angeles","Los Angeles"],["Europe/London","London"],["Europe/Berlin","Berlin"],["Asia/Dubai","Dubai"],["Asia/Singapore","Singapore"],["Asia/Tokyo","Tokyo"],["Australia/Sydney","Sydney"]];
function ccBattle(){ const {rows, src} = battleData(); return {rows, src, E:vxEntities(rows, src).map(e => ({...e, key:e.kind === "aud" ? "aud:" + e.hid : e.kind + ":" + slug(e.name)}))}; }

const WG = {
  // market & rounds
  clock:{g:"mkt", n:"Round clock & consensus", d:"Countdown to the next round lock with everyone's calls summed up.", z:"m", r:p => panelBody(p)},
  wclock:{g:"mkt", n:"World clocks", d:"Market hours at a glance across the time zones you pick.", z:"s", o:{a:"local", b:"UTC", c:"America/New_York", d:"Europe/London", e:"Asia/Tokyo"},
    opt:[["a","Clock 1","sel",TZS],["b","Clock 2","sel",TZS],["c","Clock 3","sel",TZS],["d","Clock 4","sel",TZS],["e","Clock 5","sel",[["","—"], ...TZS]]],
    r:(p, o) => ["World clocks", `<div class="ccwc">${["a","b","c","d","e"].map(x => o[x]).filter(Boolean).map(z => `<div><span>${esc((TZS.find(t => t[0] === z) || [z, z])[1])}</span><b data-cctz="${esc(z)}">--:--</b></div>`).join("")}</div>`]},
  lb:{g:"mkt", n:"Leaderboard", d:"The live leaderboard: hit rates over the last 7 days, with its tabs.", z:"l", h:"m",
    r:() => { const t = $("lbTabs"), l = $("lb"); return [`Leaderboard · ${($("lbScope") || {}).textContent || ""}`, `<div class="lbt cclbt" role="tablist">${t ? ccStrip(t.innerHTML) : ""}</div><div class="cclb">${l ? ccStrip(l.innerHTML) : ""}</div>`]; }},
  // streams
  live:{g:"live", n:"All live streams", d:"Everyone streaming right now, grouped by node. Fills in on its own.", z:"l", go:"cortex", r:p => panelBody(p)},
  host:{g:"live", n:"Host stream (HardSmoke)", d:"The host's own screen from the Vortex, playable here.", z:"l", go:"vortex", o:{mute:true}, opt:[["mute","Start muted","chk"]],
    r:(p, o) => { const H = vxHost(); if(!H.url) return [`${H.name || "HardSmoke"} · host`, ccEmpty("The host hasn't set a stream link yet.")];
      const e = vxEmbed(H.url, !!o.mute); return [`${H.name || "HardSmoke"} · host${H.live ? " · LIVE" : ""}`, ccPlayer(e, H.url, H.title)]; }},
  player:{g:"live", n:"Stream player", d:"Play any live stream (or your own link) in a window. Pick the source in ⚙ settings.", z:"m", tg:"stream", o:{mute:true}, opt:[["url","My own link","text","https://twitch.tv/… · youtube.com/… · kick.com/…"],["mute","Start muted","chk"]],
    r:(p, o) => { const S2 = ccStreams(); let src = p.id === "url" ? ["url", "My link", o.url] : (S2.find(x => x[0] === p.id) || (p.id ? null : S2[0]));
      if(!src || !src[2]) return ["Stream player", ccEmpty(p.id && p.id !== "url" ? "That stream is offline right now. Pick another source in ⚙ settings." : "Pick a stream in ⚙ settings, or paste your own link.")];
      return [src[1], ccPlayer(vxEmbed(src[2], !!o.mute), src[2])]; }},
  // cortex & chat
  chat:{g:"chat", n:"Trade floor chat", d:"The latest messages from the Cortex main floor.", z:"s", go:"cortex", r:p => panelBody(p)},
  chan:{g:"chat", n:"Cortex channel", d:"Follow one Cortex channel (#btc, #kalshi, #holders-lounge…).", z:"m", h:"m", tg:"chan", go:"cortex", o:{n:15}, opt:[["n","How many messages","num",[5,60]]],
    r:(p, o) => { const ch = DCH[p.id] ? p.id : "main", M = allMsgs().filter(m => m.tab === ch).slice(-(+o.n || 15));
      return [`#${DCH[ch][0]}`, M.length ? `<div class="ccmsgs">${M.map(m => `<div class="ccm"><b>${m.name ? esc(m.name) : who(m.a)}</b><time>${esc(tLocal(m.t))}</time><p>${esc(m.b)}</p></div>`).join("")}</div>` : ccEmpty(`No messages in #${esc(DCH[ch][0])} yet.`)]; }},
  online:{g:"chat", n:"Who's online", d:"Everyone on the site right now, and who's in a voice room.", z:"s", go:"cortex",
    r:() => { const L = onlinePeople(); return [`Online now · ${L.length}`, L.length ? `<div class="cclist">${L.map(x => `<div class="ccrow"><span class="ccdot" style="background:${esc(x.color || "var(--up)")}"></span><button class="plink who" type="button" data-prof="${esc(x.id || x.name)}">${x.name ? esc(x.name) : who(x.id)}</button>${x.voice ? `<span class="ccsub">🔊 ${esc(typeof voiceName === "function" ? voiceName(x.voice) : "voice")}</span>` : ""}</div>`).join("")}</div>` : ccEmpty("Nobody else is online right now.")]; }},
  alerts:{g:"chat", n:"Alerts feed", d:"Calls, signals and go-lives from what you follow.", z:"s", r:p => panelBody(p)},
  // nodes
  cdir:{g:"callers", n:"Callers directory", d:"Every caller A to Z with live status and record. Filter and size it in ⚙ settings.", z:"m", h:"m", go:"callers", o:{n:12, f:"all", s:"az", v:"compact"}, opt:[["f","Show","sel",FILT],["s","Sort","sel",SORTS],["v","Style","sel",VIEWS],["n","How many","num",[3,80]]],
    r:(p, o) => { const [n, h] = ccDir(callerDir(), o); return [`Callers · ${n}`, h]; }},
  caller:{g:"callers", n:"Caller live tile", d:"A followed caller's stream, next call and record as a live tile.", z:"s", tg:"fol:caller", go:"callers", r:p => panelBody(p)},
  bdir:{g:"bots", n:"Bots directory", d:"Every approved bot with status, reads and record.", z:"m", h:"m", go:"bots", o:{n:12, f:"all", s:"az", v:"compact"}, opt:[["f","Show","sel",FILT],["s","Sort","sel",SORTS],["v","Style","sel",VIEWS],["n","How many","num",[3,80]]],
    r:(p, o) => { const [n, h] = ccDir(entityDir("bots"), o); return [`Bots · ${n}`, h]; }},
  bot:{g:"bots", n:"Bot live tile", d:"A followed bot's final call for the next round and its status.", z:"s", tg:"fol:bot", go:"bots", r:p => panelBody(p)},
  sdir:{g:"scripts", n:"Scripts directory", d:"Every approved chart script with market, signal and record.", z:"m", h:"m", go:"scripts", o:{n:12, f:"all", s:"az", v:"compact"}, opt:[["f","Show","sel",FILT],["s","Sort","sel",SORTS],["v","Style","sel",VIEWS],["n","How many","num",[3,80]]],
    r:(p, o) => { const [n, h] = ccDir(entityDir("scripts"), o); return [`Scripts · ${n}`, h]; }},
  chart:{g:"scripts", n:"Chart live tile", d:"A followed chart script's signal, levels and next call.", z:"s", tg:"fol:chart", go:"scripts", r:p => panelBody(p)},
  // bookmarks
  bk:{g:"bk", n:"Bookmark card", d:"A quick card for one bookmarked source: status, record, links and next call.", z:"m", tg:"bk",
    r:p => { const w = ccWho(p.id); if(!w) return ["Bookmark", ccEmpty("This source isn't available anymore.")];
      const c = w.c && w.c.key ? w.c : {...w.c, key:w.key, name:w.name}; return [`${w.name} · ${KINDW[w.kind]}`, `<div class="ccfull">${rowHtml(c)}</div>`, "prof:" + w.key]; }},
  profile:{g:"bk", n:"Full profile", d:"The whole public profile of a bookmarked source, kept open here.", z:"m", h:"l", tg:"bk", o:{v:"main"}, opt:[["v","Show","sel",[["main","Profile"],["board","Message board"]]]],
    r:(p, o) => { const h = ccProfileHtml(p.id, o.v === "board" ? "board" : "main"), w = ccWho(p.id); return [`${w ? w.name : "Profile"}${o.v === "board" ? " · board" : ""}`, h || ccEmpty("No profile for this source yet."), "prof:" + p.id]; }},
  reviews:{g:"bk", n:"Reviews", d:"Star rating, breakdown and reviews for a bookmarked source.", z:"m", h:"m", tg:"bk",
    r:p => { const w = ccWho(p.id); if(!w) return ["Reviews", ccEmpty("Not available.")]; return [`${w.name} · reviews`, `<div class="ccpsec">${ccStrip(reviewsSection(w.key, w.name, ccSample(w)))}</div>`, "prof:" + w.key]; }},
  board:{g:"bk", n:"Message board", d:"A bookmarked source's message board (local, Discord or mirrored).", z:"m", h:"m", tg:"bk",
    r:p => { const w = ccWho(p.id); if(!w) return ["Message board", ccEmpty("Not available.")]; return [`${w.name} · board`, `<div class="ccpsec">${ccStrip(boardSection(w.key, w.name, ccSample(w)))}</div>`, "prof:" + w.key]; }},
  bkall:{g:"bk", n:"All my bookmarks", d:"Every source you've starred, grouped by node.", z:"m", h:"m",
    r:() => { const B = ccBookmarks(); return [`My bookmarks · ${B.length}`, B.length ? ["caller","bot","script","member"].map(k => { const L = B.filter(b => b.kind === k); return L.length ? `<div class="ccgrp">${KINDW[k]}s · ${L.length}</div><div class="cclist">${L.map(b => ccRow({...b.c, key:b.key, name:b.name})).join("")}</div>` : ""; }).join("") : ccEmpty("Tap ☆ on any profile in the Callers, Bots or Scripts nodes to bookmark it.")]; }},
  mdir:{g:"people", n:"Members directory", d:"Members by account type and category (holders, streamers, reviewers…).", z:"m", h:"m", o:{n:15, cat:"all"},
    opt:[["cat","Category","sel",() => [["all","Everyone"], ...((typeof MCAT !== "undefined" ? MCAT : []).map(([k, l]) => [k, l]))]],["n","How many","num",[3,100]]],
    r:(p, o) => { let L = memberList(); if(o.cat && o.cat !== "all") L = L.filter(m => m.cats && m.cats.has(o.cat)); const cl = (MCAT.find(c => c[0] === o.cat) || [0, "Members"])[1];
      return [`${o.cat && o.cat !== "all" ? cl : "Members"} · ${L.length}`, L.length ? `<div class="cclist">${L.slice(0, +o.n || 15).map(m => ccRow({key:m.id, name:m.name, color:m.color, online:m.cats && m.cats.has("online")}, esc(((ACCT.find(a => a[0] === m.type) || [0, ""])[1]) || ""))).join("")}</div>` : ccEmpty("No members in this category yet.")]; }},
  // coin
  coin:{g:"coin", n:"Coin overview", d:"Supply, circulating, treasury, holders and 30-day volume.", z:"l", go:"coin",
    r:() => { const s = coinStats(); return [`${sym()} coin`, ccStat([["Supply", fmtN(s.supply)], ["Circulating", fmtN(s.circ)], ["Treasury", fmtN(s.treas), "#FFD166"], ["Holders", s.holders.length], ["30-day volume", fmtN(s.vol30)]]) + `<div class="ccvol">${volChart(s.T)}</div>`]; }},
  cbal:{g:"coin", n:"My balance", d:"Your coin balance, holder rank and voting status.", z:"s", go:"coin",
    r:() => { const a = myAcct(); if(!a) return ["My balance", ccEmpty("Sign in to see your balance.")]; const s = coinStats(), rk = s.holders.findIndex(([x]) => x === a) + 1;
      return [`My ${sym()}`, ccStat([["Balance", fmtN(balanceOf(a)), "#FFD166"], ["Holder rank", rk ? "#" + rk : "—"], ["Can vote", eligible(a) ? "Yes" : "No"]])]; }},
  choldr:{g:"coin", n:"Top holders", d:"The biggest holders and their share of supply.", z:"m", go:"coin", o:{n:10}, opt:[["n","How many","num",[3,50]]],
    r:(p, o) => { const s = coinStats(); return [`Top holders · ${s.holders.length}`, s.holders.length ? `<div class="cclist">${s.holders.slice(0, +o.n || 10).map(([a, n], i) => `<div class="ccrow"><span class="ccrk">${i + 1}</span>${acctHtml(a)}<span class="ccsub">${fmtN(n)} ${esc(sym())} · ${s.supply ? (n/s.supply*100).toFixed(1) : 0}%</span></div>`).join("")}</div>` : ccEmpty("No holders yet.")]; }},
  cledger:{g:"coin", n:"Ledger", d:"The latest ledger entries: mints, transfers, rewards and burns.", z:"xl", h:"m", go:"coin", o:{n:12}, opt:[["n","How many","num",[5,100]]],
    r:(p, o) => { const s = coinStats(); return ["Ledger · latest", ledgerTable(s.T.slice().sort((x, y) => y.t - x.t).slice(0, +o.n || 12), myAcct())]; }},
  cgov:{g:"coin", n:"Proposals & votes", d:"Group action proposals with live tallies. Vote right from here.", z:"l", h:"m", go:"coin", o:{f:"active"}, opt:[["f","Show","sel",[["active","Open for voting"],["all","All proposals"]]]],
    r:(p, o) => { const P = Object.entries(govProps()).filter(([pid]) => o.f === "all" || govTally(pid).status === "active"); return [`Proposals · ${P.length}`, P.length ? P.map(([pid, x]) => propCard(pid, x)).join("") : ccEmpty("No proposals open for voting.")]; }},
  // battle & vortex
  bstand:{g:"battle", n:"Battle standings", d:"Ranked standings with record, hit rate, streak and next call.", z:"l", go:"battle", o:{n:10}, opt:[["n","How many","num",[3,40]]],
    r:(p, o) => { const {rows} = battleData(); return [`${battleTitle()} · standings`, rows.length ? `<table class="cctbl"><thead><tr><th>#</th><th>Name</th><th>W–L</th><th>Hit</th><th>Streak</th><th>Next</th></tr></thead><tbody>${rows.slice(0, +o.n || 10).map((b, i) => `<tr><td>${i + 1}</td><td><b>${esc(b.name)}</b></td><td>${b.w}–${b.l}</td><td>${b.n ? Math.round(b.pct*100) + "%" : "—"}</td><td>${b.sk ? (b.sw ? "W" : "L") + b.sk : "—"}</td><td>${b.next && b.next.d ? `<span class="dir ${esc(b.next.d)}">${b.next.d === "up" ? "▲ UP" : "▼ DOWN"}</span>` : "—"}</td></tr>`).join("")}</tbody></table>` : ccEmpty("No battle results yet.")]; }},
  bface:{g:"battle", n:"Face-off tracker", d:"The head-to-head tracker from Battle control.", z:"xl", go:"battle",
    r:() => { const {rows, src} = battleData(); return [`${battleTitle()} · face-off`, `<div class="ccmir">${ccStrip(battleTracker(rows, src))}</div>`]; }},
  bov:{g:"battle", n:"Host overlay preview", d:"Exactly what the host is showing on her stream right now.", z:"m", go:"battle",
    r:() => { const {E} = ccBattle(); return ["Host overlay · on stream", `<div class="ovprev">${hostOverlay(E, "s")}</div>`]; }},
  bscreens:{g:"battle", n:"Vortex screens", d:"Every screen in the Vortex with its score and stream link.", z:"m", go:"vortex",
    r:() => { const {E} = ccBattle(); return [`Vortex screens · ${E.length}`, E.length ? `<div class="cclist">${E.map(e => `<div class="ccrow"><span class="ccdot" style="background:${e.kind === "host" ? "#FFB547" : "#4DA3FF"}"></span><b>${esc(e.name)}</b><span class="ccsub">${esc(e.role || "")}${e.score ? " · " + esc(e.score) : ""}</span>${/^https:\/\//.test(e.url || "") ? `<a class="watch2" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}</div>`).join("")}</div>` : ccEmpty("No screens yet.")]; }},
  // messages
  dms:{g:"msg", n:"Messages inbox", d:"Your latest direct messages and unread count. Click one to open it.", z:"m", go:"dm", o:{n:8}, opt:[["n","How many","num",[3,30]]],
    r:(p, o) => { const C = dmConvs(), un = C.reduce((n, x) => n + x.unread, 0); return [`Messages${un ? ` · ${un} unread` : ""}`, C.length ? `<div class="cclist">${C.slice(0, +o.n || 8).map(c => `<button type="button" class="ccrow ccdm${c.unread ? " un" : ""}" data-ccdm="${esc(c.peer)}"><b>${dmName(c.peer)}</b><span class="ccsub">${c.last ? (c.last.b ? esc(String(c.last.b).slice(0, 70)) : "🔒 encrypted") : ""}</span>${c.unread ? `<i>${c.unread}</i>` : ""}</button>`).join("")}</div>` : ccEmpty("No conversations yet. Message anyone from their profile.")]; }},
  adm:{g:"msg", n:"Admin queue", d:"Site counts at a glance: online, live, requests, bots, scripts, launch checklist.", z:"m", go:"admin", admin:true,
    r:() => { const c = apCounts(); return ["Admin · at a glance", ccStat([["Online", c.online], ["Live", c.live], ["Caller requests", c.req, c.req ? "#FFB547" : ""], ["Verified", c.verified], ["Bots", c.bots], ["Scripts", c.scs], ["Msgs 24h", c.msgs], ["Launch", `${c.done}/${c.total}`]])]; }},
  // tools
  notes:{g:"tools", n:"Notes", d:"A private scratchpad for levels, plans and reminders.", z:"s", o:{text:""},
    r:(p, o) => ["Notes", `<textarea class="ccnote" data-ccnote="${p.k}" maxlength="4000" placeholder="Type notes here. They save on their own.">${esc(o.text || "")}</textarea>`]},
  links:{g:"tools", n:"Quick links", d:"Your own list of links: exchanges, charts, Discords, docs.", z:"s", o:{links:"Kalshi | https://kalshi.com\nPolymarket | https://polymarket.com\nTradingView | https://tradingview.com"}, opt:[["links","Links (one per line: Label | https://…)","area",""]],
    r:(p, o) => { const L = String(o.links || "").split("\n").map(l => l.split("|").map(x => x.trim())).filter(([a, b]) => /^https:\/\//.test(b || a || "")).map(([a, b]) => b ? [a, b] : [a.replace(/^https:\/\//, ""), a]);
      return ["Quick links", L.length ? `<div class="cclinks">${L.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join("")}</div>` : ccEmpty("Add links in ⚙ settings.")]; }},
  web:{g:"tools", n:"Web page", d:"Embed any web page. Some sites block embedding; you'll still get an Open link.", z:"l", h:"l", o:{url:""}, opt:[["url","Page link","text","https://…"]],
    r:(p, o) => /^https:\/\//.test(o.url || "") ? [o.url.replace(/^https:\/\/(www\.)?/, "").slice(0, 40), `<div class="ccweb"><iframe src="${esc(o.url)}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe></div><div class="ccopen"><a class="watch2" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Open in a new tab ↗</a></div>`] : ["Web page", ccEmpty("Paste a page link in ⚙ settings.")]},
  div:{g:"tools", n:"Section label", d:"A full-width heading to group your windows (e.g. “Morning prep”).", z:"xl",
    r:p => [p.ttl || "New section", ""]},
  // site windows
  mirror:{g:"site", n:"Site window", d:"A live copy of a window from anywhere on the site. Or use ⊕ Pull from site to click one.", z:"l", h:"m", tg:"mirror",
    r:(p, o) => { const def = CCMIR.find(m => m[0] === p.id), pg = (def && def[2]) || o.pg || "home", ttl = (def && def[1]) || o.label || "Pinned window";
      let el = null; try { el = document.querySelector(p.id); } catch {}
      const html = el && !el.closest("#cc") ? el.innerHTML.trim() : ""; if(html) ccMirCache[p.id] = html;
      const h = ccMirCache[p.id];
      return [ttl, h ? `<div class="ccmir">${ccStrip(h)}</div>` : ccEmpty(`This window lives on ${esc(CCPG[pg] || "another page")}. Open it once and it will show up here.`, `<button class="xbtn2" type="button" data-ccgo="${esc(pg)}">Open ${esc(CCPG[pg] || "page")} ↗</button>`), pg]; }}
};
const CCG = [["bk","★ My bookmarks"],["mkt","Market & rounds"],["live","Streams"],["chat","Cortex & chat"],["callers","Callers node"],["bots","Bots node"],["scripts","Scripts node"],["people","Members"],["battle","Battle & Vortex"],["msg","Messages & admin"],["tools","My tools"],["site","Site windows"]];
function ccPlayer(e, url, title){
  return (e ? `<div class="ccvid"><iframe src="${esc(e)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : `<div class="ccvid off"><span>This link can't play inside the page.</span></div>`)
    + `<div class="ccopen">${title ? `<span>${esc(title)}</span>` : ""}<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a></div>`;
}
const CCPRE = [
  ["trader","Trader desk","Round clock, world clocks, leaderboard, alerts, live streams and #btc", [["clock","","m"],["wclock","","s"],["alerts","","s"],["lb","","l"],["chan","btc","l"],["live","","xl"]]],
  ["battle","Battle night","Standings, host stream, overlay preview, Vortex screens, face-off", [["bstand","","l"],["host","","l"],["bov","","m"],["bscreens","","m"],["chan","streams","m"],["bface","","xl"]]],
  ["social","Community","Trade floor, who's online, messages, bookmarks and members", [["chat","","m"],["online","","s"],["dms","","m"],["bkall","","m"],["mdir","","l"]]],
  ["scout","Scout","Callers, bots and scripts directories side by side, plus bookmarks", [["cdir","","m"],["bdir","","m"],["sdir","","m"],["bkall","","m"]]],
  ["bk","My bookmarks","A card for every source you've starred in the nodes", "bk"],
  ["blank","Blank","An empty workspace to build from scratch", []]];
function ccPreset(id){
  const P = CCPRE.find(x => x[0] === id); if(!P) return;
  const st = ccState(); if(st.ws.length >= 12){ toast("You can have up to 12 workspaces."); return; }
  const items = P[3] === "bk" ? ccBookmarks().map(b => ccNew("bk", b.key)) : P[3].map(([t, id2, z]) => ccNew(t, id2 || undefined, z ? {z} : null));
  let name = P[1], n = 2; while(st.ws.some(w => w.name === name)) name = `${P[1]} ${n++}`;
  st.ws.push({name, items}); st.cur = st.ws.length - 1; S.ccMenu = null; ccSave(); renderCC();
  toast(`${name} workspace ready. Add, move or resize anything.`);
}

// ---- rendering ----
function ccBody(p){
  const W = WG[p.t]; if(!W) return ["Window", ccEmpty("This window type isn't available anymore."), ""];
  let r; try { r = W.r(p, {...(W.o || {}), ...(p.o || {})}) || []; } catch(e){ r = [W.n, ccEmpty("This window couldn't load right now.")]; }
  return [p.ttl || r[0] || W.n, r[1] || "", r[2] || W.go || ""];
}
function ccSetHtml(p){
  const W = WG[p.t] || {}, o = {...(W.o || {}), ...(p.o || {})}, st = ccState();
  const seg = (attr, list, cur) => `<div class="seg">${list.map(([v, l]) => `<button type="button" data-${attr}="${p.k}|${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  const tg = W.tg ? (() => { const L = ccTargets(W.tg, p.id); return `<label class="psf w"><span>${W.tg === "bk" ? "Bookmarked source" : W.tg === "chan" ? "Channel" : W.tg === "stream" ? "Stream source" : W.tg === "mirror" ? "Window" : "Source"}</span><select data-ccopt="${p.k}|__id">${L.map(([v, l]) => `<option value="${esc(v)}" ${String(p.id || "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`; })() : "";
  const opts = (W.opt || []).map(([nm, lab, type, x]) => { const v = o[nm];
    if(type === "sel"){ const ch = typeof x === "function" ? x() : x; return `<label class="psf"><span>${lab}</span><select data-ccopt="${p.k}|${nm}">${ch.map(([cv, cl]) => `<option value="${esc(cv)}" ${String(v) === String(cv) ? "selected" : ""}>${esc(cl)}</option>`).join("")}</select></label>`; }
    if(type === "num") return `<label class="psf"><span>${lab}</span><input type="number" min="${x[0]}" max="${x[1]}" value="${esc(v)}" data-ccopt="${p.k}|${nm}"></label>`;
    if(type === "chk") return `<label class="psf chk"><input type="checkbox" data-ccopt="${p.k}|${nm}" ${v ? "checked" : ""}><span>${lab}</span></label>`;
    if(type === "text") return `<label class="psf w"><span>${lab}</span><input type="text" maxlength="400" value="${esc(v || "")}" placeholder="${esc(x || "")}" data-ccopt="${p.k}|${nm}"></label>`;
    if(type === "area") return `<label class="psf w"><span>${lab}</span><textarea rows="4" maxlength="2000" data-ccopt="${p.k}|${nm}">${esc(v || "")}</textarea></label>`;
    return ""; }).join("");
  return `<div class="psgrid">
    <label class="psf w"><span>Window title</span><input type="text" maxlength="60" value="${esc(p.ttl || "")}" placeholder="${esc(W.n || "Window")}" data-ccttl="${p.k}"></label>
    ${tg}${opts}
    ${p.t === "div" ? "" : `<div class="psf"><span>Width</span>${seg("ccz", CCZ, p.z || "m")}</div><div class="psf"><span>Height</span>${seg("cch", CCH, p.h || "a")}</div>`}
    <div class="psf"><span>Color tag</span><div class="ccsw">${CCC.map((c, i) => `<button type="button" data-ccc="${p.k}|${i}" aria-pressed="${(p.c || "") === c}" style="--sw:${c || "transparent"}" title="${c ? "Color tag" : "No color"}" aria-label="${c ? "Color tag " + i : "No color"}"></button>`).join("")}</div></div>
    <div class="psf"><span>Position</span><div class="seg"><button type="button" data-ccmv="${p.k}|-1">◀ Earlier</button><button type="button" data-ccmv="${p.k}|1">Later ▶</button></div></div>
    ${st.ws.length > 1 ? `<label class="psf"><span>Move to workspace</span><select data-ccmvws="${p.k}"><option value="">Keep here</option>${st.ws.map((w, i) => i === st.cur ? "" : `<option value="${i}">${esc(w.name)}</option>`).join("")}</select></label>` : ""}
  </div>
  <div class="psacts"><button class="xbtn2" type="button" data-ccdup="${p.k}">⧉ Duplicate</button><button class="xbtn2" type="button" data-ccrm="${p.k}">✕ Remove</button><span style="flex:1"></span><button class="btn sm" type="button" data-ccset="${p.k}">Done</button></div>`;
}
function renderCCTabs(){
  const st = ccState(), m = S.ccMenu, W = ccWs(), box = $("ccWs");
  const sig = JSON.stringify([st.ws.map(w => [w.name, w.items.length]), st.cur, m, S.ccDelArm, st.lock]);
  if(box._sig === sig || (box.contains(document.activeElement) && document.activeElement.tagName === "INPUT")) return; box._sig = sig;
  box.innerHTML = `<div class="ccwtabs" role="tablist" aria-label="Workspaces">${st.ws.map((w, i) => `<button type="button" role="tab" data-ccws="${i}" aria-selected="${i === st.cur}">${esc(w.name)}<small>${w.items.length}</small></button>`).join("")}<button type="button" class="ccwnew" data-ccmenu="tpl" aria-expanded="${m === "tpl"}">+ New workspace</button></div>
    <div class="ccwr"><button type="button" class="xbtn2" data-ccmenu="ws" aria-expanded="${m === "ws"}">⚙ This workspace</button></div>
    ${m === "tpl" ? `<div class="ccmenu"><h5>Start a new workspace <span>pick a starting point, then make it yours</span></h5><div class="cctpl">${CCPRE.map(([id, n, d]) => `<button type="button" data-cctpl="${id}"><b>${esc(n)}</b><span>${esc(d)}</span></button>`).join("")}</div></div>` : ""}
    ${m === "ws" ? `<div class="ccmenu"><h5>${esc(W.name)} <span>${W.items.length} window${W.items.length === 1 ? "" : "s"}</span></h5>
      <div class="ccwsf"><input type="text" id="ccWsName" maxlength="30" value="${esc(W.name)}" aria-label="Workspace name"><button class="btn sm" type="button" data-ccwsren>Rename</button></div>
      <div class="ccwsb"><button class="xbtn2" type="button" data-ccwsmv="-1" ${st.cur === 0 ? "disabled" : ""}>◀ Move tab</button><button class="xbtn2" type="button" data-ccwsmv="1" ${st.cur === st.ws.length - 1 ? "disabled" : ""}>Move tab ▶</button>
        <button class="xbtn2" type="button" data-ccwsdup>⧉ Duplicate</button><button class="xbtn2" type="button" data-ccwsreset>↺ Reset to default</button><button class="xbtn2" type="button" data-ccwsclr>Clear all windows</button>
        <button class="xbtn2 dng" type="button" data-ccwsdel ${st.ws.length < 2 ? "disabled title=\"You need at least one workspace\"" : ""}>${S.ccDelArm ? "Click again to delete" : "🗑 Delete workspace"}</button></div></div>` : ""}`;
}
function renderCC(){
  document.body.classList.toggle("ccmode", S.cc);
  $("cc").hidden = !S.cc; if(!S.cc) return;
  $("ccMk").textContent = `${S.asset} ${S.tf.toUpperCase()}`;
  $("ccClock").textContent = mmss(curStart() + TF[S.tf] - Date.now());
  const vb = $("ccVoiceBtn"); vb.setAttribute("aria-pressed", S.voice); vb.textContent = S.voice ? "Voice alerts on" : "Voice alerts off";
  const st = ccState(), ed = !st.lock, eb = $("ccEditBtn");
  eb.setAttribute("aria-pressed", ed); eb.textContent = ed ? "✎ Editing layout" : "🔒 Layout locked"; eb.title = ed ? "Lock the layout to hide the window controls" : "Unlock to move, resize and configure windows";
  renderCCTabs();
  const grid = $("ccGrid"); grid.classList.toggle("locked", !ed);
  if(S.ccDragK) return;
  const L = layout();
  if(!L.length){ grid.innerHTML = `<div class="wempty" style="grid-column:1/-1"><strong>This workspace is empty</strong>Use <b>+ Add window</b> to pull in anything from the site, <b>⊕ Pull from site</b> to click a window anywhere, or start from a template with <b>+ New workspace</b>.</div>`; return; }
  grid.querySelectorAll(":scope > .wempty").forEach(x => x.remove());
  const keep = new Set();
  L.forEach((p, i) => {
    let el = [...grid.children].find(c => c.dataset.k === p.k);
    if(!el){ el = document.createElement("div"); el.dataset.k = p.k; el.innerHTML = `<div class="pbar"></div><div class="pset"></div><div class="pbody"></div>`; }
    const cls = `pnl ${p.t === "div" ? "pdiv xl" : p.z || "m"} h-${p.h || "a"}${p.min ? " min" : ""}${S.ccSet === p.k && ed ? " setting" : ""}`;
    if(el.className !== cls) el.className = cls;
    if(p.c) el.style.setProperty("--pc", p.c); else el.style.removeProperty("--pc");
    const [ttl, body, go] = ccBody(p);
    const bar = `${ed ? `<span class="pgrip" title="Drag to move" aria-hidden="true">⠿</span>` : ""}<span class="ttl">${p.ttl ? esc(p.ttl) : ttl}</span>
      ${go && p.t !== "div" ? `<button type="button" data-ccgo="${esc(go)}" title="Open where this comes from" aria-label="Open source">↗</button>` : ""}
      ${ed ? `<button type="button" data-ccset="${p.k}" aria-pressed="${S.ccSet === p.k}" title="Window settings" aria-label="Window settings">⚙</button>` : ""}
      ${p.t === "div" ? "" : `<button type="button" data-ccmin="${p.k}" title="${p.min ? "Expand" : "Minimize"}" aria-label="${p.min ? "Expand" : "Minimize"}">${p.min ? "▢" : "▁"}</button>`}
      ${ed ? `<button type="button" data-ccrm="${p.k}" title="Remove window" aria-label="Remove window">✕</button>` : ""}`;
    const pb = el.querySelector(".pbar"); if(el._bar !== bar){ pb.innerHTML = bar; el._bar = bar; fillNames(pb); }
    const ps = el.querySelector(".pset"), showSet = ed && S.ccSet === p.k;
    if(showSet){ const sh = ccSetHtml(p); if(el._set !== sh && !ps.contains(document.activeElement)){ ps.innerHTML = sh; el._set = sh; } } else if(el._set){ ps.innerHTML = ""; el._set = ""; }
    const bd = el.querySelector(".pbody");
    if(!p.min && el._body !== body && !bd.contains(document.activeElement)){ bd.innerHTML = body; el._body = body; fillNames(bd); }
    if(grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null);
    keep.add(el);
  });
  [...grid.children].forEach(c => { if(!keep.has(c)) c.remove(); });
  ccTickClocks();
}
function ccTickClocks(){
  document.querySelectorAll("#ccGrid [data-cctz]").forEach(x => { const z = x.dataset.cctz;
    try { x.textContent = new Date().toLocaleTimeString(undefined, {hour:"2-digit", minute:"2-digit", ...(z && z !== "local" ? {timeZone:z} : {})}); } catch { x.textContent = "--:--"; } });
}
setInterval(() => { if(S.cc) ccTickClocks(); }, 1000);
setInterval(() => { if(S.cc && !document.hidden && !S.ccDragK) renderCC(); }, 4000);
function renderCCPick(){
  const g = S.ccG || "bk", admin = isAdmin || ccLocal(), L = layout(), cnt = t => L.filter(p => p.t === t).length;
  const cats = CCG.map(([k, l]) => `<button type="button" data-ccg="${k}" aria-pressed="${g === k}">${esc(l)}</button>`).join("");
  let cards = "";
  if(g === "bk"){
    const B = ccBookmarks(), nodeBtn = `<div class="ccnodes"><span>Bookmark more:</span><button class="xbtn2" type="button" data-ccnode="callers">Callers node →</button><button class="xbtn2" type="button" data-ccnode="bots">Bots node →</button><button class="xbtn2" type="button" data-ccnode="scripts">Scripts node →</button></div>`;
    cards = `<div class="cchint">These are the sources you starred (☆) in the Callers, Bots and Scripts nodes. They also show on My callers, My bots and My charts on the main page. Pick how each one shows up here.</div>` + nodeBtn
      + (B.length ? B.map(b => `<div class="cccard bkc" data-txt="${esc((b.name + " " + KINDW[b.kind]).toLowerCase())}"><div class="cct"><span class="ccdot" style="background:${esc(b.c.color || "#4DA3FF")}"></span><b>${esc(b.name)}</b><span class="cckind">${KINDW[b.kind]}</span></div>
          <div class="ccchips"><button type="button" data-ccadd="bk|${esc(b.key)}">+ Card</button><button type="button" data-ccadd="profile|${esc(b.key)}">+ Full profile</button><button type="button" data-ccadd="reviews|${esc(b.key)}">+ Reviews</button><button type="button" data-ccadd="board|${esc(b.key)}">+ Message board</button></div></div>`).join("")
      : `<div class="ccempty">No bookmarks yet. Open a node above, tap a name, and press ☆ Add to favorites.</div>`)
      + ["bkall"].map(t => ccCard(t, cnt)).join("");
  } else cards = Object.entries(WG).filter(([t, W]) => W.g === g && !(W.admin && !admin) && W.g !== "bk").map(([t]) => ccCard(t, cnt)).join("");
  $("ccPick").innerHTML = `<div class="cccath"><div><b>Add a window</b><span>Pick anything from the site, choose what it shows, then drag ⠿ to arrange it. Every window has ⚙ settings for size, filters and color.</span></div>
      <input type="search" id="ccQ" placeholder="Search windows…" value="${esc(S.ccQ || "")}" aria-label="Search windows"><button class="xbtn2" type="button" data-ccclosepick>Close</button></div>
    <div class="cccats">${cats}</div><div class="cccards">${cards}</div>`;
  ccFilterPick();
}
function ccCard(t, cnt){
  const W = WG[t], L = W.tg ? ccTargets(W.tg) : null, n = cnt(t);
  return `<div class="cccard" data-txt="${esc((W.n + " " + W.d).toLowerCase())}"><div class="cct"><b>${esc(W.n)}</b>${n ? `<span class="cckind">${n} here</span>` : ""}</div><p>${esc(W.d)}</p>
    ${L ? (L.length ? `<select data-ccpicksel aria-label="Source">${L.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>` : `<p class="ccnone">${W.tg === "bk" ? "Bookmark sources in the nodes first." : "Nothing to pick from yet. Follow some first."}</p>`) : ""}
    <button class="btn sm" type="button" data-ccaddw="${t}" ${L && !L.length ? "disabled" : ""}>+ Add</button></div>`;
}
function ccFilterPick(){ const q = (S.ccQ || "").trim().toLowerCase(); document.querySelectorAll("#ccPick .cccard").forEach(c => { c.hidden = !!q && !c.dataset.txt.includes(q); }); }
function openCC(on){
  if(on && S.dmPage) openDM(false);
  if(on && S.coinPage) openCoin(false);
  if(on && S.mePage) openMe(false);
  if(on && S.adminPage) openAdmin(false);
  if(on && S.callersPage) openCallersPage(false);
  if(on && S.ccPulling) ccPull(false, true);
  S.cc = on;
  if(on && S.cortex){ S.cortex = false; renderCortex(); }
  if(on && S.battlePage){ S.battlePage = false; renderBattlePage(); }
  if(on && S.vortexPage){ S.vortexPage = false; renderVortexPage(); }
  try { history.replaceState(null, "", "#" + (on ? "command" : S.section)); } catch {}
  renderCC(); window.scrollTo({top:0});
}
function ccGo(g){
  if(!g) return;
  if(g.startsWith("prof:")) return openFull(g.slice(5));
  if(g === "home" || g === "desk"){ openCC(false); setTimeout(() => { const el = $(g === "desk" ? "desk" : "map"); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); }, 60); return; }
  const F = {coin:() => openCoin(true), vortex:() => openVortex(true), battle:() => openBattle(true), cortex:() => openCortex(true), dm:() => openDM(true), me:() => openMe(true), admin:() => openAdmin(true),
    callers:() => openCallersPage(true, "callers"), bots:() => openCallersPage(true, "bots"), scripts:() => openCallersPage(true, "scripts")};
  if(F[g]) F[g]();
}
// ---- pull from site: click any window anywhere to pin it ----
const PULLSEL = ".tile, .vxcard, .psec, .gprop, .acard, .cxs, .ovprev, .ltbl, .lwrap, .cpside, .cplist, .dmthread, .dmlist, .phead, #lb, .wgrid, .bkm, .ticker, section.panel, .wall, .desk, .apbody, .vxwall, .vxboards, .dmem, .dmain";
function ccPull(on, quiet){
  S.ccPulling = on; document.body.classList.toggle("ccpulling", on); $("ccPullBar").hidden = !on;
  document.querySelectorAll(".ccpickhi").forEach(x => x.classList.remove("ccpickhi"));
  if(on){ if(S.cc){ S.cc = false; renderCC(); } window.scrollTo({top:0}); }
  else if(!quiet) openCC(true);
}
function ccCand(t){
  if(!t || !t.closest || t.closest("#cc, #ccPullBar, header.top, .toast")) return null;
  const el = t.closest(PULLSEL); return el && el.getBoundingClientRect().width > 40 ? el : null;
}
function ccPath(el){
  const parts = []; let n = el;
  while(n && n !== document.body){ if(n.id){ parts.unshift("#" + CSS.escape(n.id)); return parts.join(" > "); }
    const par = n.parentElement; if(!par) break; parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${[...par.children].indexOf(n) + 1})`); n = par; }
  parts.unshift("body"); return parts.join(" > ");
}
function ccPinEl(el){
  const pk = el.closest("#profPanel");
  if(pk && pk.dataset.key){ ccAdd("profile", pk.dataset.key, {z:"m", h:"l"}); return; }
  const row = el.matches(".dcr") ? el : null, pr = row && row.querySelector("[data-prof]");
  if(pr){ ccAdd("bk", pr.dataset.prof); return; }
  const h = el.querySelector("h2, h3, h4, .rtitle, .label"), lab = (el.getAttribute("aria-label") || (h ? h.textContent : "") || "Pinned window").replace(/\s+/g, " ").trim().slice(0, 50);
  const pgEl = el.closest("#cortex, #callersPage, #coinPage, #dmPage, #mePage, #adminPage, #vortex, #pfPage");
  const pg = pgEl ? {cortex:"cortex", callersPage:"callers", coinPage:"coin", dmPage:"dm", mePage:"me", adminPage:"admin", vortex:"vortex", pfPage:"prof"}[pgEl.id] : "home";
  ccMirCache[ccPath(el)] = el.innerHTML;
  ccAdd("mirror", ccPath(el), {ttl:lab, o:{pg, label:lab}, z:el.getBoundingClientRect().width > 700 ? "xl" : "l", h:"m"}, true);
  toast(`Pinned “${lab}” to ${ccWs().name}. Keep clicking to pin more.`);
}
document.addEventListener("mouseover", e => { if(!S.ccPulling) return; const c = ccCand(e.target); document.querySelectorAll(".ccpickhi").forEach(x => { if(x !== c) x.classList.remove("ccpickhi"); }); if(c) c.classList.add("ccpickhi"); }, true);
document.addEventListener("click", e => { if(!S.ccPulling) return; const c = ccCand(e.target); if(!c) return; e.preventDefault(); e.stopPropagation(); ccPinEl(c); }, true);
// ---- drag to arrange ----
(() => {
  const grid = $("ccGrid");
  const end = () => { grid.querySelectorAll(".dragging, .dropa, .dropb").forEach(x => x.classList.remove("dragging", "dropa", "dropb")); grid.querySelectorAll(".pnl[draggable]").forEach(x => x.removeAttribute("draggable")); S.ccDragK = null; };
  grid.addEventListener("pointerdown", e => { const g = e.target.closest(".pgrip"); if(g && !ccState().lock) g.closest(".pnl").setAttribute("draggable", "true"); });
  grid.addEventListener("dragstart", e => { const el = e.target.closest && e.target.closest(".pnl"); if(!el || !el.hasAttribute("draggable")){ e.preventDefault(); return; } S.ccDragK = el.dataset.k; el.classList.add("dragging"); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", el.dataset.k); } catch {} });
  grid.addEventListener("dragover", e => { if(!S.ccDragK) return; e.preventDefault(); const el = e.target.closest(".pnl");
    grid.querySelectorAll(".dropa, .dropb").forEach(x => x.classList.remove("dropa", "dropb")); if(!el || el.dataset.k === S.ccDragK) return;
    const r = el.getBoundingClientRect(), wide = r.width > grid.clientWidth*.7, after = wide ? e.clientY > r.top + r.height/2 : e.clientX > r.left + r.width/2; el.classList.add(after ? "dropa" : "dropb"); });
  grid.addEventListener("drop", e => { if(!S.ccDragK) return; e.preventDefault(); const from = S.ccDragK, el = e.target.closest(".pnl"), after = el && el.classList.contains("dropa"), to = el && el.dataset.k; end();
    if(to === from) return; const L = layout().slice(), i = L.findIndex(p => p.k === from); if(i < 0) return; const [it] = L.splice(i, 1);
    if(!to) L.push(it); else { const j = L.findIndex(p => p.k === to); L.splice(j + (after ? 1 : 0), 0, it); } setLayout(L); });
  grid.addEventListener("dragend", () => { if(S.ccDragK){ end(); renderCC(); } });
})();
// ---- bookmarks on the main page walls ----
function bkStrip(kind){
  const L = favItems(kind), node = kind === "caller" ? "callers" : kind === "bot" ? "bots" : "scripts", nn = {caller:"Callers", bot:"Bots", script:"Scripts"}[kind];
  return `<div class="bkhead"><span>★ Bookmarked ${nn.toLowerCase()} <b>${L.length}</b></span><button class="xbtn2" type="button" data-ccnode="${node}">Browse the ${nn} node →</button></div>`
    + (L.length ? `<div class="bkgrid">${L.map(b => `<div class="bkc">${rowHtml({...b.c, key:b.key})}<div class="bkacts"><button class="xbtn2" type="button" data-ccadd="bk|${esc(b.key)}">⊕ Add to Command Center</button><button class="xbtn2" type="button" data-proffav="${esc(b.key)}" data-favname="${esc(b.name)}">★ Remove</button></div></div>`).join("")}</div>`
      : `<p class="bkempty">Open the ${nn} node and tap ☆ on any profile to bookmark it. Bookmarks show here and become windows you can add to your Command Center.</p>`);
}
function renderBookmarks(){
  if(!db && !S.favSeeded){ S.favSeeded = true; if(!(S.favs || []).length){ try { const pick = [...callerDir().slice(0, 3), ...entityDir("bots", true).slice(0, 2), ...entityDir("scripts", true).slice(0, 2)]; S.favs = pick.map(c => favKey(c.key, c.name)); } catch {} } }
  [["bkCallers","caller"],["bkBots","bot"],["bkCharts","script"]].forEach(([id, k]) => { const el = $(id); if(!el) return; const h = bkStrip(k); if(el._h !== h){ el.innerHTML = h; el._h = h; fillNames(el); } });
}
// ----- call console: only in My D3MON, for members with the Caller role -----
function isCallerMe(){ try { if(!db || S.demo) return true; if(meId && isVerified(meId)) return true; const c = catsOf(meId) || {}; return !!(c.verified || c.caller); } catch { return false; } }
S.pvCalls = {};
function openConsole(){
  if(!isCallerMe() && !isAdmin){ toast("The call console is for members with the Caller role. Apply to Callers under Connect."); S.mpTab = "connect"; openMe(true); return; }
  S.mpTab = "console"; openMe(true);
}
const CSTAT = [["auto","Automatic","Online while you're on the site, Streaming when you go live"],["online","Online","Always show you as online"],["calling","Calling rounds","Shows you're actively calling the current rounds"],["live","Streaming","Shows you as streaming right now"],["away","Away","Shows you're stepped away"],["offline","Appear offline","Hides your online status"]];
function cstatHtml(st, live, online){
  if(st === "online") return `<b>● Online</b>`;
  if(st === "calling") return `<b class="cl">● Calling the current rounds</b>`;
  if(st === "live") return `<b class="lv">● STREAMING</b>`;
  if(st === "away") return `<b class="aw">● Away</b>`;
  if(st === "offline") return "Offline";
  return live ? `<b class="lv">● LIVE NOW</b>` : online ? `<b>● Online</b>` : "Offline";
}
function roundCallOf(id, key, c){
  const cur = curStart(), nxt = cur + TF[S.tf], self = key === "You (demo)" || (id && id === meId) || (!id && key === meId);
  const get = st => { let e = null; if(id) try { e = entriesFor(st).find(x => x.k === `${id}~caller~me`) || null; } catch {} if(!e && self && mpPreview()) e = S.pvCalls[st] || null; return e; };
  let now = get(cur), next = get(nxt);
  if(!now && !next && c && (c.now || c.next)){ now = c.now || null; next = c.next || null; }
  return {cur, nxt, now, next};
}
function roundCallHtml(R){
  const one = (lab, e, sub) => `<div><span>${lab}</span>${e && e.d ? `<b class="dir ${esc(e.d)}">${e.d === "up" ? "▲ UP" : "▼ DOWN"}</b><small>${esc(String(e.c || "med").toUpperCase())} · ${esc(venueName(e.v))}${e.n ? ` · “${esc(e.n)}”` : ""}</small>` : `<b class="nc">No call yet</b>`}<small>${sub}</small></div>`;
  return `<div class="psec"><h4>Current rounds <span>${esc(S.asset)} ${esc(S.tf.toUpperCase())}</span></h4><div class="pround">${one("Running now", R.now, `${esc(tLocal(R.cur))}–${esc(tLocal(R.nxt))}`)}${one("Next round", R.next, `locks in ${mmss(R.nxt - Date.now())}`)}</div></div>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-cstat]"); if(!b) return;
  await savePub({cstat:b.dataset.cstat}, "Status updated"); renderMe();
});
document.addEventListener("change", async e => {
  if(e.target.id !== "mpShowCall") return;
  await savePub({showCall:e.target.checked}, e.target.checked ? "Your current round calls now show on your profile" : "Round calls hidden from your profile"); renderMe();
});
$("ccBtn").addEventListener("click", () => {
  if(S.dmPage){ openDM(false); return; }
  if(S.coinPage){ openCoin(false); return; }
  if(S.mePage){ openMe(false); return; }
  if(S.adminPage){ openAdmin(false); return; }
  if(S.callersPage){ openCallersPage(false); return; }
  if(S.cortex){ if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); openCortex(false); window.scrollTo({top:0}); return; }
  if(S.cc || S.vortexPage || S.battlePage){ if(S.cc) openCC(false); if(S.vortexPage) openVortex(false); if(S.battlePage) openBattle(false); window.scrollTo({top:0}); return; }
  openCC(true);
});
// ---------- HardSmoke swirl: a fresh, random run of flowing figure-8s across the logo each loop, settling into the Z ----------
function buildSwirl(wrap){
  const W = wrap.getBoundingClientRect(); if(!W.width || !W.height) return null;
  const hw = wrap.querySelector(".hsw"), zEl = wrap.querySelector(".hsz"); if(!hw || !zEl) return null;
  const rnd = (a, b) => a + Math.random()*(b - a), f = n => n.toFixed(2), TAU = Math.PI*2;
  const hb = hw.getBoundingClientRect(), zb = zEl.getBoundingClientRect(), cap = hb.height*.72;
  const x0 = hb.left - cap*rnd(1, 1.6), zx = zb.left + zb.width*.12, zy = zb.top + zb.height*.1, cy = hb.top + hb.height*.5;
  const n = Math.random() < .5 ? 2 : 3;                                   // how many figure-8s this time
  const A = (zx - x0)/n*rnd(.72, .95), B = cap*rnd(.85, 1.15);            // lobe width and height, sized to the logo
  const ph = rnd(0, TAU), skew = rnd(-.7, .7), tilt = rnd(-.25, .25);     // random phase, lean and tilt of each 8
  const wob = [rnd(.6, 1.6), rnd(0, TAU), rnd(.12, .28)];                  // slow drift in lobe size so no two 8s match
  const sm = t => t*t*(3 - 2*t), env = t => Math.pow(Math.sin(Math.PI*Math.min(1, t)), .55);
  const pts = [], N = 70*n;
  for(let i = 0; i <= N; i++){
    const t = i/N, e = env(t), amp = 1 + wob[2]*Math.sin(TAU*wob[0]*t + wob[1]), th = TAU*n*t + ph;
    const bx = x0 + (zx - x0)*t, by = cy + (zy - cy)*sm(Math.max(0, (t - .78)/.22)) + tilt*(bx - (x0 + zx)/2)*.08;
    pts.push([bx + A*amp*e*Math.sin(th), by + B*amp*e*Math.sin(2*th + skew)]);
  }
  const P = pts.map(([x, y]) => [(x - W.left)/W.width*100, ((y - W.top)/W.height + .3)/1.6*40]);
  let d = `M ${f(P[0][0])} ${f(P[0][1])}`;
  for(let i = 0; i < P.length - 1; i++){ const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    d += ` C ${f(p1[0] + (p2[0] - p0[0])/6)} ${f(p1[1] + (p2[1] - p0[1])/6)}, ${f(p2[0] - (p3[0] - p1[0])/6)} ${f(p2[1] - (p3[1] - p1[1])/6)}, ${f(p2[0])} ${f(p2[1])}`; }
  return d;
}
function swirlTick(){
  document.querySelectorAll(".hswrap").forEach(wrap => {
    const svg = wrap.querySelector(".hsorbit"); if(!svg || !svg.getCurrentTime) return;
    const t = svg.getCurrentTime(), cyc = Math.floor(t / 7.5), ph = t - cyc*7.5;
    if(svg._cyc === cyc) return;
    if(svg._cyc !== undefined && ph > .25) { svg._cyc = cyc; return; }
    const d = buildSwirl(wrap); if(!d) return; svg._cyc = cyc;
    svg.querySelectorAll("path[d]").forEach(p => p.setAttribute("d", d));
  });
}
// setInterval(swirlTick, 90);
// ---------- HardSmoke battle schedule: Saturdays 7:00 PM Pacific ----------
const LA = "America/Los_Angeles";
function laOffsetMin(ms){ try { const v = new Intl.DateTimeFormat("en-US", {timeZone:LA, timeZoneName:"shortOffset"}).formatToParts(new Date(ms)).find(p => p.type === "timeZoneName").value; const m = v.match(/GMT([+-]\d+)(?::(\d+))?/); return m ? (+m[1])*60 + (m[2] ? Math.sign(+m[1])*(+m[2]) : 0) : -480; } catch { return -480; } }
function laYMDW(ms){ const o = {}; new Intl.DateTimeFormat("en-US", {timeZone:LA, year:"numeric", month:"2-digit", day:"2-digit", weekday:"short"}).formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value); return o; }
function satAt7(dir){ const now = Date.now(); for(let i = 0; i <= 8; i++){ const ms = now + dir*i*86400000, o = laYMDW(ms); if(o.weekday !== "Sat") continue;
    const guess = Date.UTC(+o.year, +o.month - 1, +o.day, 19, 0), t = guess - laOffsetMin(guess)*60000; if(dir > 0 ? t > now : t <= now) return t; } return null; }
const fmtPT = ms => new Date(ms).toLocaleString("en-US", {timeZone:LA, weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) + " PT";
const fmtIn = ms => { ms = Math.max(0, ms); const d = Math.floor(ms/86400000), h = Math.floor(ms%86400000/3600000), m = Math.floor(ms%3600000/60000); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
// ---------- main-page promo window for HardSmoke's battles ----------
function renderPromo(rows, src){
  const box = $("hsPromo"); if(!box) return;
  const L = bbData(), T = BB_T, cur = curStart(), now = Date.now(), demo = S.demo || !db;
  const resOf = t => resAny(t, src);
  const roster = rosterList().length ? rosterList() : rows.slice(0, 6).map(r => ({name:r.name}));
  // lineup battle
  const W = bbWar(), warOn = !!(W && W.first && W.rounds);
  const warCols = warOn ? Array.from({length:W.rounds}, (_, k) => W.first + k*T) : Array.from({length:8}, (_, k) => cur - (8 - k)*T);
  const board = roster.map(en => { const sl = slug(en.name); let w = 0, l = 0; warCols.forEach(t => { const d = L.calls && L.calls[t] ? L.calls[t][sl] : null, r = resOf(t); if(t + T <= now && (d === "up" || d === "down") && (r === "up" || r === "down")){ if(d === r) w++; else l++; } }); return {name:en.name, w, l}; }).sort((a,b) => b.w - a.w || a.l - b.l);
  const done = warCols.filter(t => t + T <= now).length, liveK = warCols.indexOf(cur);
  const warOver = warOn && (!W.active || now >= W.first + W.rounds*T);
  const warStatus = !warOn ? `<span class="bt-st soon">OPEN</span>` : warOver ? `<span class="bt-st fin">FINAL</span>` : now < W.first ? `<span class="bt-st soon">UP NEXT</span>` : `<span class="bt-st live">● LIVE</span>`;
  const warMeta = !warOn ? `Last 8 rounds · victories vs Kalshi` : warOver && W.first ? `Final · ${esc(fmtPT(W.first))}` : warOver ? `Final · ${done} of ${W.rounds} rounds` : now < W.first ? `${W.rounds} rounds · starts in <b class="bStart" data-at="${W.first}">${mmss(W.first - now)}</b>` : `Round <b>${liveK >= 0 ? liveK + 1 : done}</b> of ${W.rounds} · ends in <b class="bEnd">${mmss(cur + T - now)}</b>`;
  const topW = board.length ? Math.max(1, board[0].w) : 1;
  const mini = board.slice(0, 4).map((b, i) => `<div class="mr${i === 0 && b.w ? " first" : ""}"><span class="rk">${i + 1}</span><span class="nm">${esc(b.name)}</span><span class="sc">${b.w} W</span><span class="bar"><i style="width:${Math.round(b.w / topW * 100)}%"></i></span></div>`).join("") || `<div class="meta">No bots entered yet.</div>`;
  // face-off
  const CB = isCallerBattle(), FN = foNames() || {};
  const C = demo ? {aName:FN.a || (CB ? "Nova" : "ArbWolf"), bName:FN.b || (CB ? "Redline" : "DeltaFlow"), rounds:S.btRounds || 8, first:S.btFirstLocal || cur - 4*T, active:true, mode:S.btMode || "gain"} : foRun();
  let fo = `<div class="meta">No face-off scheduled. HardSmoke names the next two contenders.</div>`, foS = null, foX = null;
  if(C && C.aName && C.bName){
    const mode = FO_MODES[C.mode] ? C.mode : "gain", A = entityOf(C.aName, rows, src), B = entityOf(C.bName, rows, src);
    const cols = C.first ? Array.from({length:C.rounds}, (_, k) => C.first + k*T) : [];
    const sc = X => { let g = 0, w = 0; cols.forEach(t => { if(t + T > now) return; const v = gainOf(t, X.sl); g += v || 0; const d = X.calls[t], r = resOf(t); if(d && d === r) w++; }); return {g:+g.toFixed(2), w}; };
    const sa = sc(A), sb = sc(B); let rwA = 0, rwB = 0; cols.forEach(t => { if(t + T > now) return; const a = gainOf(t, A.sl), b = gainOf(t, B.sl); if(a !== null && b !== null && a !== b){ if(a > b) rwA++; else rwB++; } });
    const val = (x, rw) => mode === "calls" ? x.w : mode === "both" ? x.w + rw : x.g, va = val(sa, rwA), vb = val(sb, rwB);
    const fmt = v => mode === "gain" ? (v > 0 ? "+" : v < 0 ? "−" : "") + (+Math.abs(v).toFixed(2)) + "%" : mode === "calls" ? v + " ✓" : v + " pts";
    const cl = v => mode === "gain" ? (v > 0 ? "p" : v < 0 ? "n" : "") : "";
    const fdone = cols.filter(t => t + T <= now).length, fOver = C.first && (!C.active || now >= C.first + C.rounds*T), fLive = cols.indexOf(cur);
    foS = {a:{name:A.name, v:fmt(va), cls:cl(va), lead:va > vb && fdone}, b:{name:B.name, v:fmt(vb), cls:cl(vb), lead:vb > va && fdone}, mode, over:fOver};
    const rg = cols.filter(t => t + T <= now).map(t => ({t, a:gainOf(t, A.sl), b:gainOf(t, B.sl)}));
    const bestF = rg.reduce((m, x) => { [[x.a, A.name], [x.b, B.name]].forEach(([v, n]) => { if(v !== null && Number.isFinite(+v) && (m === null || +v > m.v)) m = {v:+v, n}; }); return m; }, null);
    foX = {A, B, va, vb, rwA, rwB, sa, sb, fdone, fOver, fLive, rounds:C.rounds, first:C.first, mode, fmt, cl, aCall:A.calls[cur] || null, bCall:B.calls[cur] || null, bestF, live:!!(C.first && !fOver && now >= C.first)};
    const fst = !C.first ? `<span class="bt-st soon">SET</span>` : fOver ? `<span class="bt-st fin">FINAL</span>` : now < C.first ? `<span class="bt-st soon">UP NEXT</span>` : `<span class="bt-st live">● LIVE</span>`;
    fo = `<h4>Face-off ${fst}</h4>
      <div class="vs2"><div class="a"><span class="crown">${va > vb && fdone ? (fOver ? "WINNER" : "LEADS") : ""}</span><div class="n">${esc(A.name)}</div><div class="s ${cl(va)}">${fmt(va)}</div></div><span class="x">VS</span>
        <div class="b"><span class="crown">${vb > va && fdone ? (fOver ? "WINNER" : "LEADS") : ""}</span><div class="n">${esc(B.name)}</div><div class="s ${cl(vb)}">${fmt(vb)}</div></div></div>
      <div class="meta">On ${FO_MODES[mode]} · ${C.first ? (fOver ? `final after ${fdone} rounds` : now < C.first ? `starts ${esc(tLocal(C.first))}` : `round <b>${fLive >= 0 ? fLive + 1 : fdone}</b> of ${C.rounds}`) : "not started"}</div>`;
  }
  const wEnd = warOn ? W.first + W.rounds*T : 0, cEnd = C && C.first ? C.first + C.rounds*T : 0;
  const liveWar = warOn && W.active && now >= W.first && now < wEnd, liveFo = !!(C && C.first && C.active && now >= C.first && now < cEnd);
  const isLive = liveWar || liveFo, soon = (warOn && W.active && now < W.first) || !!(C && C.first && C.active && now < C.first);
  const refStart = Math.max(warOn ? W.first : 0, C && C.first ? C.first : 0);
  const scope = new Set(); if(warOn) warCols.forEach(t => scope.add(t)); if(C && C.first) for(let k = 0; k < C.rounds; k++) scope.add(C.first + k*T);
  const battleRounds = [...scope].filter(t => t + T <= now).sort((a,b) => b - a);
  const useBattle = refStart > 0 && battleRounds.length > 0;
  const nextSat = satAt7(1);
  const whenTag = isLive ? `<span class="when live">● LIVE NOW · real-time</span>`
    : soon ? `<span class="when soon">Starting ${esc(fmtPT(refStart))} · in <b>${fmtIn(refStart - now)}</b></span>`
    : refStart ? `<span class="when past">From the last battle · ${esc(fmtPT(refStart))}</span>`
    : `<span class="when past">No battle yet · showing recent Kalshi rounds</span>`;
  const nextTag = nextSat ? `<span class="when next">Battles every Saturday 7:00 PM PT · next ${esc(fmtPT(nextSat))} · in <b>${fmtIn(nextSat - now)}</b></span>` : "";
  const fnames = C && C.aName ? [C.aName, C.bName].filter(Boolean) : [];
  const items = [];
  const feedTs = isLive || !useBattle ? Array.from({length:10}, (_, k) => cur - (k + 1)*T) : battleRounds.slice(0, 10);
  for(const t of feedTs){ const k = feedTs.indexOf(t) + 1;
    const r = resOf(t); if(r !== "up" && r !== "down") continue;
    const kx = L.kx && L.kx[t], hits = [], miss = [];
    roster.forEach(en => { const d = L.calls && L.calls[t] ? L.calls[t][slug(en.name)] : null; if(d === "up" || d === "down"){ (d === r ? hits : miss).push(esc(en.name)); } });
    const gains = fnames.map(n => { const g = gainOf(t, slug(n)); return g === null ? "" : `${esc(n)} <span class="${g >= 0 ? "u" : "d"}">${g > 0 ? "+" : ""}${g}%</span>`; }).filter(Boolean);
    let txt = `Round settled <span class="${r === "up" ? "u" : "d"}">${r === "up" ? "▲ UP" : "▼ DOWN"}</span>${kx && kx.final ? ` at ${usd0(kx.final)}` : ""}.`;
    if(CB){ const ca = foX && foX.A.calls[t], cb = foX && foX.B.calls[t], ga = fnames[0] ? gainOf(t, slug(fnames[0])) : null, gb = fnames[1] ? gainOf(t, slug(fnames[1])) : null;
      const callTxt = (n, d) => d ? `${esc(n)} called ${d === r ? `<span class="u">${d === "up" ? "▲" : "▼"} right</span>` : `<span class="d">${d === "up" ? "▲" : "▼"} wrong</span>`}` : "";
      const ct = [callTxt(fnames[0], ca), callTxt(fnames[1], cb)].filter(Boolean); if(ct.length) txt += ` ${ct.join(" · ")}.`;
      if(gains.length) txt += ` ${gains.join(" · ")}.`;
      if(ga !== null && gb !== null && ga !== gb) txt += ` <b>${esc(ga > gb ? fnames[0] : fnames[1])}</b> takes the round.`;
    } else {
      if(hits.length) txt += ` <b>${hits.join(", ")}</b> called it.`;
      if(miss.length && !hits.length) txt += ` Every logged bot missed.`;
    }
    items.push(`<div class="fi${k === 1 ? " new" : ""}"><time>${esc(tLocal(t + T))}</time><span>${txt}</span></div>`);
  }
  const tgt = curTarget();
  if(isLive) items.unshift(`<div class="fi"><time>now</time><span>Round <b>${esc(tLocal(cur))}</b> is live${tgt ? ` · target <b>${usd0(tgt.v)}</b>` : ""} · ends in <b class="bEnd">${mmss(cur + T - now)}</b></span></div>`);
  else if(useBattle) items.push(`<div class="fi"><time>${esc(tLocal(refStart))}</time><span>Battle began on Kalshi BTC 15m.</span></div>`);
  // strip stats
  let callsToday = 0, bestG = null, bestN = ""; const day0 = cur - 24*3600000, inScope = st => useBattle ? scope.has(+st) : +st >= day0;
  const scopeLbl = useBattle ? (isLive ? "this battle" : "last battle") : "24h";
  Object.entries(L.calls || {}).forEach(([st, m]) => { if(inScope(st) && m) callsToday += Object.values(m).filter(v => v === "up" || v === "down").length; });
  Object.entries(L.gain || {}).forEach(([st, m]) => { if(inScope(st) && m) Object.entries(m).forEach(([k, v]) => { if(Number.isFinite(+v) && v !== null && (bestG === null || +v > bestG)){ bestG = +v; bestN = k; } }); });
  const bestName = bestN ? ([...roster.map(e => e.name), ...fnames].find(n => slug(n) === bestN) || bestN) : "";
  const rset = (useBattle && !isLive ? battleRounds : Array.from({length:12}, (_, k) => cur - (k + 1)*T)).map(resOf);
  const upR = rset.filter(r => r === "up").length, allR = rset.filter(r => r === "up" || r === "down").length;
  const lead = board[0] && board[0].w ? board[0] : null;
  renderPromo.snap = {mini, warStatus, warMeta, fo, foS, items, whenTag, nextTag, isLive, board, C};
  const callChip = d => d === "up" ? `<span class="hcall up">▲ UP</span>` : d === "down" ? `<span class="hcall dn">▼ DOWN</span>` : `<span class="hcall pend">no call yet</span>`;
  const roundLine = `Round <b>${esc(tLocal(cur))}</b> · ends in <b class="bEnd">${mmss(cur + T - now)}</b>${tgt ? ` · target <b>${usd0(tgt.v)}</b>` : ""}`;
  const miniBig = board.slice(0, 6).map((b, i) => `<div class="mr${i === 0 && b.w ? " first" : ""}"><span class="rk">${i + 1}</span><span class="nm">${esc(b.name)}</span><span class="sc">${b.w}–${b.l}</span><span class="bar"><i style="width:${Math.round(b.w / topW * 100)}%"></i></span></div>`).join("") || `<div class="meta">No bots entered yet. HardSmoke adds them in Battle Control.</div>`;
  const botCallsCard = `<div class="card"><h4>This round's calls <span class="bt-st live">● LIVE</span></h4><div class="meta">${roundLine}</div><div class="hcl">${roster.slice(0, 6).map(en => { const d = L.calls && L.calls[cur] ? L.calls[cur][slug(en.name)] : null; return `<div class="hcr"><span class="nm">🤖 ${esc(en.name)}</span>${callChip(d)}</div>`; }).join("") || `<div class="meta">No bots in the lineup.</div>`}</div></div>`;
  const X = foX;
  const foCallsCard = X ? `<div class="card"><h4>This round <span class="bt-st ${X.live ? "live" : "soon"}">${X.live ? "● LIVE" : X.fOver ? "FINAL" : "UP NEXT"}</span></h4><div class="meta">${roundLine}</div>
      <div class="hcl"><div class="hcr"><span class="nm ca">🎙 ${esc(X.A.name)}</span>${callChip(X.aCall)}</div><div class="hcr"><span class="nm cb">🎙 ${esc(X.B.name)}</span>${callChip(X.bCall)}</div></div>
      <div class="hrw"><span class="a">${X.rwA}</span><span class="l">rounds won</span><span class="b">${X.rwB}</span></div>
      <div class="meta">${X.first ? (X.fOver ? `Final after ${X.fdone} of ${X.rounds} rounds` : now < X.first ? `${X.rounds} rounds · starts ${esc(tLocal(X.first))}` : `Round <b>${X.fLive >= 0 ? X.fLive + 1 : X.fdone}</b> of ${X.rounds}`) : `${X.rounds} rounds · not started`}</div></div>`
    : `<div class="card"><h4>This round</h4><div class="meta">HardSmoke hasn't named the two callers yet.</div></div>`;
  const ldr = X ? (X.va > X.vb ? X.A.name : X.vb > X.va ? X.B.name : "") : "";
  const foStrip = X ? `<div class="strip">
      <div class="lst"><span class="k">${X.fOver ? "Winner" : "Leading caller"}</span><span class="v">${ldr ? esc(ldr) : (X.rwA + X.rwB + X.sa.w + X.sb.w) ? "Tied" : "—"}</span><span class="s">${X.fmt(X.va)} vs ${X.fmt(X.vb)} · ${esc(FO_MODES[X.mode])}</span></div>
      <div class="lst"><span class="k">Rounds won</span><span class="v"><span style="color:#4DA3FF">${X.rwA}</span> – <span style="color:#FF7A45">${X.rwB}</span></span><span class="s">${esc(X.A.name)} vs ${esc(X.B.name)}</span></div>
      <div class="lst"><span class="k">Right calls</span><span class="v"><span style="color:#4DA3FF">${X.sa.w}</span> – <span style="color:#FF7A45">${X.sb.w}</span></span><span class="s">up/down calls that matched Kalshi</span></div>
      <div class="lst"><span class="k">Best round</span><span class="v">${X.bestF ? `<span style="color:${X.bestF.v >= 0 ? "var(--up)" : "var(--dn)"}">${X.bestF.v > 0 ? "+" : ""}${X.bestF.v}%</span>` : "—"}</span><span class="s">${X.bestF ? esc(X.bestF.n) : "no gains entered yet"}</span></div>
    </div>` : "";
  box.innerHTML = `<div class="ph"><div><div class="hsbrand"><span class="smk"><i></i><i></i><i></i></span><span class="hswrap"><svg class="hsorbit" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="hsof2" color-interpolation-filters="sRGB" x="-10%" y="-60%" width="120%" height="220%"><feTurbulence type="fractalNoise" baseFrequency="0.08 0.3" numOctaves="2" seed="6" result="n"><animate attributeName="baseFrequency" dur="6s" values="0.08 0.3;0.11 0.38;0.08 0.3" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.5"/></filter><filter id="hsoh2" color-interpolation-filters="sRGB" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.8"/></filter></defs><path id="hsop2" d="M-2 20 C4 6, 10 34, 17 20 C24 6, 30 34, 37 20 C44 6, 50 34, 57 20 C64 6, 70 34, 77 20 C83 9, 88 11, 93.6 13" fill="none" stroke="none"/><g filter="url(#hsof2)"><path d="M-2 20 C4 6, 10 34, 17 20 C24 6, 30 34, 37 20 C44 6, 50 34, 57 20 C64 6, 70 34, 77 20 C83 9, 88 11, 93.6 13" pathLength="100" fill="none" stroke="rgba(220,220,232,.5)" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" stroke-dasharray="40 200" stroke-dashoffset="40"><animate attributeName="stroke-dashoffset" dur="7.5s" repeatCount="indefinite" values="40;-60;-60" keyTimes="0;.42;1" calcMode="spline" keySplines=".4 .05 .3 1;0 0 1 1"/><animate attributeName="opacity" dur="7.5s" repeatCount="indefinite" values="0;.55;.55;0;0" keyTimes="0;.04;.41;.48;1"/></path><path d="M-2 20 C4 6, 10 34, 17 20 C24 6, 30 34, 37 20 C44 6, 50 34, 57 20 C64 6, 70 34, 77 20 C83 9, 88 11, 93.6 13" pathLength="100" fill="none" stroke="rgba(230,230,240,.7)" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" stroke-dasharray="26 200" stroke-dashoffset="26"><animate attributeName="stroke-dashoffset" dur="7.5s" repeatCount="indefinite" values="26;-74;-74" keyTimes="0;.42;1" calcMode="spline" keySplines=".4 .05 .3 1;0 0 1 1"/><animate attributeName="opacity" dur="7.5s" repeatCount="indefinite" values="0;.7;.7;0;0" keyTimes="0;.04;.41;.48;1"/></path></g><path d="M-2 20 C4 6, 10 34, 17 20 C24 6, 30 34, 37 20 C44 6, 50 34, 57 20 C64 6, 70 34, 77 20 C83 9, 88 11, 93.6 13" pathLength="100" fill="none" stroke="#FFD9A0" stroke-width="1.8" stroke-linecap="round" vector-effect="non-scaling-stroke" stroke-dasharray="16 200" stroke-dashoffset="16"><animate attributeName="stroke-dashoffset" dur="7.5s" repeatCount="indefinite" values="16;-84;-84" keyTimes="0;.42;1" calcMode="spline" keySplines=".4 .05 .3 1;0 0 1 1"/><animate attributeName="opacity" dur="7.5s" repeatCount="indefinite" values="0;.95;.95;0;0" keyTimes="0;.04;.41;.48;1"/></path><path d="M-2 20 C4 6, 10 34, 17 20 C24 6, 30 34, 37 20 C44 6, 50 34, 57 20 C64 6, 70 34, 77 20 C83 9, 88 11, 93.6 13" pathLength="100" fill="none" stroke="#FFF8EC" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke" stroke-dasharray="6 200" stroke-dashoffset="6"><animate attributeName="stroke-dashoffset" dur="7.5s" repeatCount="indefinite" values="6;-94;-94" keyTimes="0;.42;1" calcMode="spline" keySplines=".4 .05 .3 1;0 0 1 1"/><animate attributeName="opacity" dur="7.5s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;.04;.41;.48;1"/></path><circle r="1.6" fill="#FFF4DC" filter="url(#hsoh2)"><animateMotion dur="7.5s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.42;1" calcMode="spline" keySplines=".4 .05 .3 1;0 0 1 1"><mpath href="#hsop2"/></animateMotion><animate attributeName="opacity" dur="7.5s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;.04;.41;.45;1"/></circle></svg><span class="hsw">HardSmoke</span><span class="hsz" aria-hidden="true"><i class="zs s1"></i><i class="zs s2"></i><i class="zs s3"></i><svg viewBox="4.2 4.7 16.1 14.6" preserveAspectRatio="none"><defs><linearGradient id="hszg2" x1="4" y1="5" x2="20" y2="19" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFF4DC"/><stop offset=".55" stop-color="#FFB547"/><stop offset="1" stop-color="#FF7A45"/></linearGradient><linearGradient id="hszc2" x1="0" y1="5.5" x2="0" y2="18.5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#FFE2B0"/><stop offset=".75" stop-color="#FFB547"/><stop offset="1" stop-color="#FF7A45"/></linearGradient><filter id="hszf2" color-interpolation-filters="sRGB" x="-60%" y="-60%" width="220%" height="220%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="5" result="n"><animate attributeName="baseFrequency" dur="5s" values="0.55;1.05;0.55" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.3"/></filter><filter id="hszs2" color-interpolation-filters="sRGB" x="-80%" y="-120%" width="260%" height="300%"><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="3" seed="11" result="n"><animate attributeName="seed" dur="3s" values="1;2;3;4;5;6;7;8" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.1"/></filter></defs><g class="zg" style="animation:zDrift 7.5s ease-in-out infinite,zGhost 7.5s ease-in-out infinite" filter="url(#hszs2)"><path class="zghost" d="M6 6.5 H18 L6 17.5 H18.5"/></g><g class="zsm" filter="url(#hszf2)"><path class="zp" d="M6 6.5 H18 L6 17.5 H18.5" stroke="url(#hszg2)"/></g><path class="zc" d="M6 6.5 H18 L6 17.5 H18.5" stroke="url(#hszc2)"/></svg><i class="zw w1"></i><i class="zw w2"></i><i class="zw w3"></i><i class="tw"></i></span></span><span class="hsx">presents</span></div><h2>${CB ? "Callers Face-off" : "Battle of the Bots"} <span class="hskind ${CB ? "c" : "b"}">${CB ? "🎙 Callers face-off" : "🤖 Bots battle"}</span></h2><p>${CB ? (C && C.aName ? `This week: <b>${esc(C.aName)}</b> vs <b>${esc(C.bName)}</b> — two verified callers, head to head on every Kalshi BTC 15-minute round, scored on ${esc(FO_MODES[(foX && foX.mode) || "gain"])}.` : "This week: two verified callers go head to head on every Kalshi BTC 15-minute round.") : `This week: <b>${roster.length}</b> bot${roster.length === 1 ? "" : "s"} battle on every Kalshi BTC 15-minute round — each call is scored against the real Kalshi result.`} Watch who's winning.</p></div>
      <span class="gowrap"><button type="button" class="go" id="arenaGo" aria-label="Enter the Vortex"><span class="gx"><svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="vxgB" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB547"/><stop offset=".5" stop-color="#4DA3FF"/><stop offset="1" stop-color="#B98CFF"/></linearGradient></defs><path d="M32 7 L57 51 H7 Z" stroke="url(#vxgB)" stroke-width="4"/><path d="M32 7 V36 M57 51 L32 36 M7 51 L32 36" stroke="url(#vxgB)" stroke-width="2.0" opacity=".75"/><circle cx="32" cy="7" r="5" fill="#FFB547"/><circle cx="7" cy="51" r="5" fill="#4DA3FF"/><circle cx="57" cy="51" r="5" fill="#B98CFF"/><circle cx="32" cy="36" r="4.5" fill="#E8F0FF"/></svg></span><span class="gt">Enter the Vortex</span><span class="ga">→</span><i class="em e1"></i><i class="em e2"></i><i class="em e3"></i><i class="em e4"></i><i class="em e5"></i></button></span></div>
    <div class="whens">${whenTag}${nextTag}</div>
    <div class="grid3">
      ${CB ? `<div class="card">${fo}</div>${foCallsCard}` : `<div class="card"><h4>Bot battle ${warStatus}</h4><div class="meta">${warMeta}</div><div class="mini">${miniBig}</div></div>${botCallsCard}`}
      <div class="card fd"><h4>${isLive ? "Live feed" : useBattle ? "Battle recap" : "Recent rounds"}</h4><div class="hfeed">${items.join("")}</div></div>
    </div>
    ${CB ? foStrip : `<div class="strip">
      <div class="lst"><span class="k">Leading bot</span><span class="v">${lead ? esc(lead.name) : "—"}</span><span class="s">${lead ? `${lead.w} victories · ${lead.l} losses` : "no scored calls yet"}</span></div>
      <div class="lst"><span class="k">Calls logged · ${scopeLbl}</span><span class="v">${callsToday}</span><span class="s">up/down picks recorded</span></div>
      <div class="lst"><span class="k">Best round · ${scopeLbl}</span><span class="v">${bestG === null ? "—" : `<span style="color:${bestG >= 0 ? "var(--up)" : "var(--dn)"}">${bestG > 0 ? "+" : ""}${bestG}%</span>`}</span><span class="s">${bestG === null ? "no gains entered yet" : esc(bestName)}</span></div>
      <div class="lst"><span class="k">${useBattle && !isLive ? "Battle rounds" : "Last 12 rounds"}</span><span class="v"><span style="color:var(--up)">▲${upR}</span> <span style="color:var(--dn)">▼${allR - upR}</span></span><span class="s">Kalshi BTC 15m results</span></div>
    </div>`}
    ${demo ? `<span class="chip ex" style="justify-self:start">Demo figures</span>` : ""}`;
}
$("hsPromo").addEventListener("click", e => enterArena(e));
$("hsPromo").addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); enterArena(null); } });
let arenaBusy = false;
function arenaSound(){
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    const ac = arenaSound.ac || (arenaSound.ac = new AC()); if(ac.state === "suspended") ac.resume();
    const t = ac.currentTime, len = 1.4, buf = ac.createBuffer(1, ac.sampleRate*len, ac.sampleRate), d = buf.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/d.length, 2);
    const n = ac.createBufferSource(); n.buffer = buf; const f = ac.createBiquadFilter(); f.type = "bandpass"; f.Q.value = .8;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + .45); f.frequency.exponentialRampToValueAtTime(180, t + 1.3);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
    n.connect(f).connect(g).connect(ac.destination); n.start(t);
    const o = ac.createOscillator(), og = ac.createGain(); o.type = "sine"; o.frequency.setValueAtTime(90, t + .42); o.frequency.exponentialRampToValueAtTime(38, t + 1.2);
    og.gain.setValueAtTime(0.0001, t + .4); og.gain.exponentialRampToValueAtTime(.55, t + .46); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(og).connect(ac.destination); o.start(t + .4); o.stop(t + 1.35);
  } catch {}
}
function sayArena(){
  if(!("speechSynthesis" in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance("Entering the Vortex"); u.lang = "en-GB"; u.rate = 0.94; u.pitch = 1.05; const v = ukVoice || pickVoice(); if(v) u.voice = v; setTimeout(() => speechSynthesis.speak(u), 380); } catch {}
}
function enterArena(ev){
  if(arenaBusy || S.vortexPage) return;
  if(reduceMotion() || !document.body.animate){ openVortex(true); return; }
  arenaBusy = true;
  const btn = $("arenaGo"), br = btn ? btn.getBoundingClientRect() : null;
  const x = ev && ev.clientX ? ev.clientX : br ? br.left + br.width/2 : innerWidth/2, y = ev && ev.clientY ? ev.clientY : br ? br.top + br.height/2 : innerHeight/2;
  const fx = $("arenaFx"), cv = $("arenaCv"), core = fx.querySelector(".afx-core");
  fx.style.setProperty("--ax", x + "px"); fx.style.setProperty("--ay", y + "px"); fx.hidden = false;
  arenaSound(); sayArena();
  if(btn) btn.animate([{transform:"scale(1)"},{transform:"scale(.9)"},{transform:"scale(1.12)", filter:"brightness(1.6)"},{transform:"scale(1)"}], {duration:320, easing:"ease-out"});
  // particles: embers + smoke
  const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight; cv.width = W*dpr; cv.height = H*dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const P = [], t0 = performance.now();
  for(let i = 0; i < 140; i++){ const a = Math.random()*Math.PI*2, sp = 2 + Math.random()*9; P.push({k:"e", x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 1.5, r:1 + Math.random()*2.6, life:600 + Math.random()*900, c:["255,181,71","77,163,255","185,140,255"][i % 3]}); }
  for(let i = 0; i < 46; i++){ P.push({k:"s", x:Math.random()*W, y:H + Math.random()*120, vx:(Math.random() - .5)*.6, vy:-(1.2 + Math.random()*2.2), r:60 + Math.random()*120, life:1700, c:["77,163,255","185,140,255","255,181,71"][i % 3]}); }
  let raf;
  const draw = now => { const e = now - t0; g.clearRect(0, 0, W, H);
    for(const p of P){ const lf = e / p.life; if(lf >= 1) continue;
      if(p.k === "s"){ p.x += p.vx; p.y += p.vy; p.r *= 1.004; const al = Math.sin(Math.min(1, lf)*Math.PI)*.16; const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); gr.addColorStop(0, `rgba(${p.c},${al})`); gr.addColorStop(1, `rgba(${p.c},0)`); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
      else { const dx = p.x - x, dy = p.y - y, dd = Math.hypot(dx, dy) || 1; p.vx += -dy/dd*.55 - dx/dd*.04; p.vy += dx/dd*.55 - dy/dd*.04; p.x += p.vx; p.y += p.vy; p.vx *= .965; p.vy *= .965; g.globalCompositeOperation = "lighter"; g.fillStyle = `rgba(${p.c},${(1 - lf).toFixed(3)})`; g.shadowColor = `rgba(${p.c},1)`; g.shadowBlur = 10; g.beginPath(); g.arc(p.x, p.y, p.r*(1 - lf*.5), 0, 7); g.fill(); g.shadowBlur = 0; g.globalCompositeOperation = "source-over"; } }
    if(e < 2100) raf = requestAnimationFrame(draw); };
  raf = requestAnimationFrame(draw);
  const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 20;
  const wait = ms => new Promise(r => setTimeout(r, ms)), fin = a => a.finished.catch(() => {});
  const expand = fx.animate([{clipPath:`circle(0px at ${x}px ${y}px)`}, {clipPath:`circle(${R}px at ${x}px ${y}px)`}], {duration:560, easing:"cubic-bezier(.7,0,.3,1)", fill:"forwards"});
  fx.querySelector(".afx-ring").animate([{transform:"scale(.2)", opacity:1}, {transform:`scale(${R/14})`, opacity:0}], {duration:900, easing:"cubic-bezier(.2,.8,.2,1)"});
  const coreA = core.animate([{opacity:0, transform:"scale(.6)", filter:"blur(8px)"}, {opacity:1, transform:"scale(1.06)", filter:"blur(0)", offset:.55}, {opacity:1, transform:"scale(1)"}], {duration:720, delay:220, easing:"cubic-bezier(.2,.9,.3,1.2)", fill:"both"});
  fx.querySelector(".afx-em").animate([{transform:"rotate(-540deg) scale(.2)"}, {transform:"rotate(12deg) scale(1.1)", offset:.7}, {transform:"rotate(0) scale(1)"}], {duration:900, delay:220, easing:"cubic-bezier(.2,.9,.3,1.3)", fill:"both"});
  fx.querySelector(".afx-t").animate([{letterSpacing:".6em", opacity:0}, {letterSpacing:".22em", opacity:1}], {duration:700, delay:300, easing:"cubic-bezier(.2,.9,.2,1)", fill:"both"});
  const barA = fx.querySelector(".afx-bar i").animate([{transform:"scaleX(0)"}, {transform:"scaleX(1)"}], {duration:780, delay:420, easing:"cubic-bezier(.6,0,.2,1)", fill:"both"});
  fx.querySelector(".afx-sweep").animate([{transform:"translateX(-100%)"}, {transform:"translateX(100%)"}], {duration:900, delay:520, easing:"ease-in-out"});
  (async () => {
    await fin(expand); await Promise.all([fin(coreA), fin(barA)]); await wait(120);
    openVortex(true); const b = $("vortex"); b.classList.remove("arena-in"); void b.offsetWidth; b.classList.add("arena-in"); setTimeout(() => b.classList.remove("arena-in"), 1400);
    await wait(160);
    const out = fx.animate([{opacity:1, transform:"scale(1)", filter:"blur(0)"}, {opacity:0, transform:"scale(1.08)", filter:"blur(6px)"}], {duration:520, easing:"ease-in", fill:"forwards"});
    await fin(out);
    fx.hidden = true; fx.getAnimations().forEach(a => a.cancel()); fx.querySelectorAll("*").forEach(n => n.getAnimations && n.getAnimations().forEach(a => a.cancel())); cancelAnimationFrame(raf); arenaBusy = false;
  })();
}
// ---------- The Vortex: live display for the audience ----------
S.vortexPage = false; S.foUrl = null;
function foUrls(){ const D = S.foDoc || {}; if(isCallerBattle()) return (S.demo || !db) ? (S.foUrlLocalC || {a:"", b:""}) : {a:D.caUrl || "", b:D.cbUrl || ""}; return (S.demo || !db) ? (S.foUrlLocal || {a:"", b:""}) : (S.foUrl || {a:"", b:""}); }
function renderVortexPage(){ document.body.classList.toggle("vortexmode", S.vortexPage); $("battleBtn").setAttribute("aria-pressed", S.vortexPage || S.battlePage); }
function openVortex(on){
  if(on && S.adminPage) openAdmin(false);
  if(on && S.callersPage) openCallersPage(false);
  S.vortexPage = on;
  if(on){ if(S.cc){ S.cc = false; renderCC(); } if(S.cortex){ S.cortex = false; if(typeof resetCorex === "function") resetCorex(); renderCortex(); } if(S.battlePage){ S.battlePage = false; renderBattlePage(); } }
  try { history.replaceState(null, "", "#" + (on ? "vortex" : S.section)); } catch {}
  renderVortexPage(); if(on){ renderBattle(); renderVxChat(); } if(typeof pushPresence === "function") pushPresence(); window.scrollTo({top:0});
}
const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const battleKind = () => (((S.demo || !db) ? S.bKindLocal : (S.battleCfg || {}).kind) || "bots");
function foShown(snap){ const R = (snap || {}).C, typed = foNames(), live = !!(R && R.aName && R.first && R.active !== false && Date.now() < R.first + (R.rounds || 8) * 15*60000);
  if(live || (R && R.aName && !typed.a && !typed.b)) return {a:R.aName, b:R.bName, run:true}; return {a:typed.a || "", b:typed.b || "", run:false}; }
function foRun(){ const C = S.battleCfg; if(!C) return null; if(battleKind() === "callers") return C.cfo && C.cfo.first ? C.cfo : null; return C.first ? C : null; }
const isCallerBattle = () => battleKind() === "callers";
const battleTitle = () => isCallerBattle() ? "Callers Face-off" : "Battle of the Bots";
S.vxHost = null;
const vxHost = () => ((S.demo || !db) ? (S.vxHostLocal || {}) : (S.vxHost || {}));
function hostEnts(){ const H = vxHost(); if(H.on === false) return []; return [{kind:"host", role:H.live ? "Host · live now" : "Host", name:H.name || "HardSmoke", url:H.url || "", call:null, score:H.live ? "LIVE" : "", scls:H.live ? "n" : "", sub:H.title || "Your host for the battle", lead:false}]; }
function vxEntities(rows, src){
  const cur = curStart(), L = bbData(), out = [], snap = renderPromo.snap || {}, board = snap.board || [];
  const F = foShown(snap), U = foUrls(), fs = F.run ? snap.foS : null;
  [["a", F.a, U.a], ["b", F.b, U.b]].forEach(([k, n, u]) => { if(!n) return; const E = entityOf(n, rows, src), sx = fs ? fs[k] : null;
    out.push({kind:"f" + k, role:`Face-off · ${k.toUpperCase()}`, name:n, url:u || "", call:E.calls[cur] || null, score:sx ? sx.v : "", scls:sx ? sx.cls : "", sub:fs ? FO_MODES[fs.mode] : "", lead:!!(sx && sx.lead)}); });
  const topW = board.length ? board[0].w : 0;
  rosterList().forEach(en => { if(out.some(o => slug(o.name) === slug(en.name))) return; const b = board.find(x => slug(x.name) === slug(en.name)) || {w:0, l:0};
    const d = L.calls && L.calls[cur] ? L.calls[cur][slug(en.name)] : null;
    out.push({kind:"lu", role:"Bot battle", name:en.name, url:en.url || "", call:d === "up" || d === "down" ? d : null, score:`${b.w} W`, scls:b.w ? "p" : "", sub:`${b.w}–${b.l} victories`, lead:b.w > 0 && b.w === topW}); });
  return hostEnts().concat(out, vxAudEnts());
}
function renderVortex(rows, src){
  const box = $("vortex"); if(!box || !S.vortexPage) return;
  const snap = renderPromo.snap || {}, cur = curStart(), T = BB_T, now = Date.now(), tgt = curTarget(), admin = (isAdmin && db && !S.demo) || S.demo || !db;
  $("vxWhen").innerHTML = (snap.whenTag || "") + (snap.nextTag || "");
  $("vxClock").innerHTML = `<span>Round ${esc(tLocal(cur))} ends in</span><b class="bEnd">${mmss(cur + T - now)}</b><span class="tg">${tgt ? `Target <b>${usd0(tgt.v)}</b>` : "Target not in yet"}</span>`;
  $("vxCtl").hidden = !admin;
  const entsAll = vxEntities(rows, src).map(e => ({...e, key:e.kind === "aud" ? "aud:" + e.hid : e.kind + ":" + slug(e.name)}));
  S.vxEnts = entsAll; renderVxChips();
  const stOn = stageOn(entsAll), fk = stOn ? null : vxFeatKey(entsAll), ents = entsAll.filter(vxShown).filter(e => !stOn || e.kind === "lu" || e.kind === "aud").sort((a, b) => (b.key === fk) - (a.key === fk));
  stageRender($("vxStage"), entsAll, false); renderVxWho();
  $("vxStreams").innerHTML = ents.length ? ents.map(e => {
    const dm = e.url ? domainOf(e.url) : "";
    const hov = e.kind === "host" ? hostOverlay(entsAll) : "";
    const scr = e.url ? `<a class="scr" href="${esc(e.url)}" target="_blank" rel="noopener" data-vxurl="${esc(e.url)}">${hov}<span class="tagl on">● STREAM</span>${e.call ? `<span class="call ${e.call}">${e.call === "up" ? "▲ UP" : "▼ DOWN"}</span>` : ""}<span class="pl"><span class="pb">▶</span><span class="dm">${esc(dm)}</span><span class="hint">Opens the live stream in its own window</span></span></a>`
      : `<div class="scr">${hov}<span class="tagl">NO STREAM</span>${e.call ? `<span class="call ${e.call}">${e.call === "up" ? "▲ UP" : "▼ DOWN"}</span>` : ""}<span class="pl"><span class="dm">No stream linked yet</span><span class="hint">${admin ? "Add a stream link in Battle control" : "HardSmoke adds stream links before the battle"}</span></span></div>`;
    return `<div class="vxs ${e.kind === "lu" ? "lu" : e.kind === "aud" ? "lu aud" : e.kind}${e.key === fk ? " feat" : ""}${e.kind === "host" && vxHost().live ? " hlive" : ""}${e.lead ? " lead" : ""}"><button class="vxoff" type="button" data-vxhide="${esc(e.key)}" title="Hide this screen">✕ HIDE</button>${scr}<div class="bar"><div style="min-width:0"><div class="nm">${esc(e.name)}</div><span class="rl">${esc(e.role)}${e.lead ? ` · <span class="crown">${snap.isLive ? "LEADS" : "TOP"}</span>` : ""}</span></div><div class="sc ${e.scls}">${e.score || "—"}<small>${esc(e.sub || "")}</small></div></div></div>`; }).join("")
    : stOn ? "" : `<div class="vxcard"><div class="meta">No contenders yet. HardSmoke enters the ${isCallerBattle() ? "callers" : "bots"} and face-off names in Battle control.</div></div>`;
  $("vxWar").innerHTML = `<h4>${"Bot battle"} ${snap.warStatus || ""}</h4><div class="meta">${snap.warMeta || ""}</div><div class="mini">${snap.mini || ""}</div>`;
  { const CB = isCallerBattle(); $("vxWar").style.display = "none"; $("vxFo").style.display = "none"; $("vxFo").classList.toggle("vxmatch", CB);
    if(CB) $("vxFo").innerHTML = vxMatchStats(rows, src); }
  $("vxFeed").innerHTML = `<h4>${snap.isLive ? "Live feed" : "Battle recap"}</h4><div class="hfeed">${(snap.items || []).join("")}</div>`;
  const vl = (S.voiceLinks || {}).vortex || "";
  if(false) $("vxVoice").innerHTML = `<h4>Voice room</h4>${vl ? `<a class="vbtn" href="${esc(vl)}" target="_blank" rel="noopener">🎙 Join voice chat ↗</a>` : `<div class="meta">${admin ? "Add a voice room link so the audience can talk live." : "Voice opens when HardSmoke goes live."}</div>`}
    ${admin && !S.demo && db ? `<form class="vset" id="vxVset"><input type="url" id="vxVurl" placeholder="https:// voice room link (Meet, X Space…)" value="${esc(vl)}" aria-label="Voice room link"><button class="btn ghost sm" type="submit">Save</button></form>` : ""}
    <div class="meta">Voice runs in the linked app, in a new tab.</div>`;
}
function renderVxChat(){
  if(!S.vortexPage || !$("vxMsgs")) return;
  const M = ((S.demo || !db) ? S.demoMsgs : allMsgs()).filter(m => m.tab === "vortex").slice(-80), box = $("vxMsgs"), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.innerHTML = M.length ? M.map(m => `<div class="m">${nameOf(m)}${esc(m.b)}<time>${esc(tLocal(m.t))}</time></div>`).join("") : `<div class="meta" style="font:12px var(--mono);color:var(--ink-3)">No messages yet. Say hi to the room.</div>`;
  if(atEnd) box.scrollTop = box.scrollHeight;
  const n = vxAudience().length; $("vxHere").textContent = n ? `${n} in the Vortex` : "";
  $("vxForm").hidden = !(S.demo || !db || canWrite);
}
$("vxForm").addEventListener("submit", async e => { e.preventDefault(); const v = $("vxIn").value.trim().slice(0, 300); if(!v) return; $("vxIn").value = "";
  if(S.demo || !db){ S.demoMsgs.push({id:newId(), name:"You (demo)", color:"#2EE59D", t:Date.now(), b:v, tab:"vortex"}); renderVxChat(); return; }
  const t = Date.now(), h = hourKey(t), mid = newId(); await act(() => mergeWrite(db.doc("lounge/" + h), {hour:h, msgs:{[mid]:{a:meId, t, b:v, tab:"vortex"}}})); });
$("vortex").addEventListener("submit", async e => { if(e.target.id !== "vxVset") return; e.preventDefault(); const u = $("vxVurl").value.trim(); if(u && !/^https:\/\//.test(u)) return toast("Paste the full link, starting with https://");
  if(await act(() => mergeWrite(db.doc("config/voice"), {vortex:u}))){ S.voiceLinks = {...(S.voiceLinks || {}), vortex:u}; renderBattle(); toast("Voice room saved"); } });
$("vxTile").addEventListener("click", () => {
  const urls = [...document.querySelectorAll("#vxStreams [data-vxurl]")].map(a => a.dataset.vxurl); if(!urls.length) return toast("No stream links yet.");
  const n = urls.length, cols = Math.ceil(Math.sqrt(n)), rowsN = Math.ceil(n / cols), sw = screen.availWidth || 1440, sh = screen.availHeight || 900, w = Math.floor(sw / cols), h = Math.floor(sh / rowsN);
  let blocked = 0; urls.forEach((u, i) => { const win = window.open(u, "vx" + i, `popup=yes,width=${w},height=${h},left=${(i % cols)*w},top=${Math.floor(i / cols)*h}`); if(!win) blocked++; });
  if(blocked) toast(`Your browser blocked ${blocked} window${blocked === 1 ? "" : "s"}. Allow pop-ups for this page, then press again.`);
});
$("vxCtl").addEventListener("click", () => openBattle(true));
$("vxExit").addEventListener("click", () => openVortex(false));

// ---------- stream screens: viewer on/off, host on/off (Battle control), full screen wall ----------
S.vxScreens = {}; S.vxEnts = []; S.vxFsSel = null; S.vxSound = {}; S.vxPick = false;
let vxHideLocal = {}; try { vxHideLocal = JSON.parse(localStorage.getItem("d3_vxhide") || "{}"); } catch {}
const vxHostOff = k => !!((S.vxScreens || {}).off || {})[k];
const vxShown = e => !vxHostOff(e.key) && (e.kind === "aud" ? vxHideLocal[e.key] === false : !vxHideLocal[e.key]);
function saveVxLocal(){ try { localStorage.setItem("d3_vxhide", JSON.stringify(vxHideLocal)); } catch {} }
function renderVxChips(){
  const box = $("vxChips"); if(!box) return; const E = S.vxEnts || [];
  box.innerHTML = E.length ? `<span class="lb">SCREENS</span>` + E.map(e => { const off = vxHostOff(e.key); return `<button class="vxchip" type="button" data-vxtog="${esc(e.key)}" aria-pressed="${!off && vxShown(e)}"${e.kind === "aud" ? ' data-aud="1"' : ""} ${off ? `disabled title="Turned off by the host"` : ""}><i></i>${esc(e.name)}</button>`; }).join("") : "";
}
function renderScreensCtl(rows, src){
  const box = $("bScreens"); if(!box) return;
  const E = vxEntities(rows, src).map(e => ({...e, key:e.kind === "aud" ? "aud:" + e.hid : e.kind + ":" + slug(e.name)})), ed = isAdmin || S.demo || !db, H = vxHost();
  if(!(S.vxEnts || []).length) S.vxEnts = E;
  box.hidden = false;
  const hsig = JSON.stringify(H) + ed;
  if(!$("bHost") || (renderScreensCtl.hsig !== hsig && !$("bHost").contains(document.activeElement))){ renderScreensCtl.hsig = hsig;
    if(!$("bHost")) box.innerHTML = `<div id="bStage"></div><div id="bAud"></div><div id="bHost"></div><div id="bOv"></div><div id="bMonStage"></div><div id="bMon"></div>`;
    $("bHost").innerHTML = `<h4>Host stream <small>${ed ? "HardSmoke's own screen on the Vortex" : "set by the host"}</small></h4>
    <div class="aform hostf"><div class="af"><label for="hs_name">Host name</label><input id="hs_name" maxlength="40" value="${esc(H.name || "HardSmoke")}" ${ed ? "" : "disabled"}></div>
      <div class="af"><label for="hs_url">Stream link</label><input id="hs_url" maxlength="300" value="${esc(H.url || "")}" placeholder="https://twitch.tv/… · youtube.com/watch?v=… · kick.com/…" ${ed ? "" : "disabled"}></div>
      <div class="af w"><label for="hs_title">Stream title</label><input id="hs_title" maxlength="100" value="${esc(H.title || "")}" placeholder="Battle of the Bots S2 · live commentary" ${ed ? "" : "disabled"}></div></div>
    ${ed ? `<div class="aacts"><label class="atog"><input type="checkbox" id="hs_on" ${H.on === false ? "" : "checked"}>Show the host screen on the Vortex</label><label class="atog"><input type="checkbox" id="hs_live" ${H.live ? "checked" : ""}>Mark as LIVE NOW</label><span style="flex:1"></span><button class="btn sm" type="button" data-vxhostsave>Save host stream</button></div>` : ""}
    `;
  }
  if(ed && $("bOv") && (!$("bOv").innerHTML || !$("bOv").contains(document.activeElement))){ const pv = document.querySelector("#bOv .ovprev"); if(!$("bOv").innerHTML) renderOvCtl(); else if(pv) pv.innerHTML = hostOverlay(S.vxEnts, "s"); }
  renderStageCtl(E, ed);
  renderAudCtl(ed);
  renderMonStage(E);
  renderMonitor(E, ed);
}
function vxFeatKey(E){ const f = (S.vxScreens || {}).feat; return f && E.some(e => e.key === f) ? f : (E.find(e => e.kind === "host") || {}).key || null; }
function renderMonitor(E, ed){
  const mon = $("bMon"); if(!mon) return;
  const feat = vxFeatKey(E), on = E.filter(e => !vxHostOff(e.key)), sig = E.map(e => e.key + e.url + vxHostOff(e.key) + e.call).join("|") + feat + ed + JSON.stringify(ovCfg()) + JSON.stringify((renderPromo.snap || {}).board || []) + E.map(e => e.call).join("");
  if(sig === renderMonitor.sig && mon.innerHTML) return; renderMonitor.sig = sig;
  const tile = e => { const off = vxHostOff(e.key), src = e.url && !off ? vxEmbed(e.url, true) : null;
    return `<div class="mont${off ? " off" : ""}${e.key === feat ? " feat" : ""}"><div class="mvid">${e.kind === "host" && !off ? hostOverlay(E, "s") : ""}${src ? `<iframe src="${esc(src)}" allow="autoplay; encrypted-media" title="${esc(e.name)} preview" loading="lazy"></iframe>` : `<span class="mph">${off ? "OFF AIR" : e.url ? `${esc(domainOf(e.url))}<br><small>preview opens in a new tab</small>` : "NO STREAM LINKED"}</span>`}
      <span class="mbadge ${off ? "" : "on"}">${off ? "OFF AIR" : "● ON AIR"}</span>${e.key === feat ? `<span class="mfeat">★ SPOTLIGHT</span>` : ""}${e.call ? `<span class="mcall ${e.call}">${e.call === "up" ? "▲" : "▼"}</span>` : ""}</div>
      <div class="mbar"><div style="min-width:0"><b>${esc(e.name)}</b><small>${esc(e.role)}${e.url ? " · " + esc(domainOf(e.url)) : ""}</small></div>
      ${ed ? `<div class="mbtns"><button type="button" class="mtog${off ? "" : " on"}" data-vxhost="${esc(e.key)}">${off ? "Put on air" : "Take off air"}</button>${!off && e.key !== feat ? `<button type="button" class="mtog" data-vxfeat="${esc(e.key)}">★ Spotlight</button>` : ""}${e.url ? `<a class="mtog" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}</div>` : ""}</div></div>`; };
  mon.innerHTML = `<h4 style="margin-top:10px">Live display monitor <small>${on.length} of ${E.length} windows on air · ${feat ? "spotlight: " + esc((E.find(e => e.key === feat) || {}).name || "") : "no spotlight"}</small></h4>
    ${ed ? `<div class="aacts"><button class="btn sm" type="button" data-monall="1">All on air</button><button class="btn ghost sm" type="button" data-monall="0">All off air</button><button class="btn ghost sm" type="button" data-monprev>⛶ Preview what viewers see</button></div>` : ""}
    <div class="mongrid">${E.map(tile).join("") || `<div class="pfine">No windows yet. Add the host stream, face-off names and bots.</div>`}</div>`;
}
document.addEventListener("click", async e => {
  if(!e.target.closest("[data-vxhostsave]")) return;
  const url = $("hs_url").value.trim(); if(url && !/^https:\/\//.test(url)) return toast("Paste the full link, starting with https://");
  const H = {name:$("hs_name").value.trim() || "HardSmoke", url, title:$("hs_title").value.trim(), on:$("hs_on").checked, live:$("hs_live").checked};
  if(S.demo || !db){ S.vxHostLocal = H; toast("Host stream saved (preview only)"); }
  else { if(!isAdmin) return; if(await act(() => mergeWrite(db.doc("config/vxhost"), H))){ S.vxHost = H; toast("Host stream saved"); } }
  document.activeElement && document.activeElement.blur(); renderBattle();
});
document.addEventListener("click", async e => {
  const t = e.target, f = t.closest("[data-vxfeat]"), all = t.closest("[data-monall]"), pv = t.closest("[data-monprev]");
  if(f){ const k = f.dataset.vxfeat; S.vxScreens = {...S.vxScreens, feat:k}; if(db && !S.demo && isAdmin) await act(() => mergeWrite(db.doc("config/vxscreens"), {feat:k})); toast("Spotlight set"); renderBattle(); return; }
  if(all){ const onA = all.dataset.monall === "1", keys = (S.vxEnts || []).map(x => x.key), off = Object.fromEntries(keys.map(k => [k, !onA]));
    S.vxScreens = {...S.vxScreens, off:{...((S.vxScreens || {}).off || {}), ...off}}; if(db && !S.demo && isAdmin) await act(() => mergeWrite(db.doc("config/vxscreens"), {off})); toast(onA ? "Every window is on air" : "Every window is off air"); renderBattle(); return; }
  if(pv){ if(!(S.vxEnts || []).length) return toast("No windows yet."); openVxFs(true); }
});

// ---------- host screen overlay: the host decides what the audience sees on her screen ----------
const OV_ITEMS = [["brand","Show title","tl"],["standings","Standings","tr"],["round","Round clock & target","tl"],["faceoff","Face-off score","bl"],["battle","Battle status","bl"],["feed","Live feed","br"],["banner","Lower-third banner","bottom"],["ticker","Scrolling ticker","bottom"]];
const OV_POS = [["tl","Top left"],["top","Top center"],["tr","Top right"],["bl","Bottom left"],["bottom","Bottom center"],["br","Bottom right"]];
const OV_DEF = {brand:{on:true, pos:"tl"}, standings:{on:true, pos:"tr", n:5}, round:{on:true, pos:"tl"}, faceoff:{on:true, pos:"bl"}, calls:{on:false, pos:"br"}, battle:{on:false, pos:"bl"}, feed:{on:false, pos:"br", n:3}, banner:{on:false, pos:"bottom", t1:"HardSmoke", t2:"Battle of the Bots · live"}, ticker:{on:false, pos:"bottom", text:"Welcome to the Vortex · vote in the Coin section · follow your favorite bots"}, style:{opacity:0.82, size:"m", hideVideo:false}};
S.ovDraft = null;
function ovCfg(){ const o = S.ovDraft || vxHost().ov || {}; const out = {}; for(const k of Object.keys(OV_DEF)) out[k] = {...OV_DEF[k], ...(o[k] || {})}; return out; }
function hostOverlay(ents, size){
  const O = ovCfg(), snap = renderPromo.snap || {}, cur = curStart(), T = BB_T, tgt = curTarget(), now = Date.now(), panels = {};
  const add = (pos, html) => (panels[pos] = panels[pos] || []).push(html);
  if(O.brand.on) add(O.brand.pos, `<div class="ovp ovbrand"><b>${esc(vxHost().name || "HardSmoke")}</b><span>presents · ${battleTitle()}</span>${vxHost().live ? `<i>● LIVE</i>` : ""}</div>`);
  if(O.round.on) add(O.round.pos, `<div class="ovp ovround"><span>Round ${esc(tLocal(cur))}</span><b class="bEnd">${mmss(cur + T - now)}</b><span>${tgt ? `Target ${usd0(tgt.v)}` : "Target pending"}</span></div>`);
  if(O.standings.on){ const B = (snap.board || []).slice(0, Math.max(1, +O.standings.n || 5));
    add(O.standings.pos, `<div class="ovp ovstand"><h6>Standings</h6>${B.length ? B.map((x, i) => `<div><span>${i + 1}</span><b>${esc(x.name)}</b><em>${x.w}–${x.l}</em></div>`).join("") : `<div><b>No rounds scored yet</b></div>`}</div>`); }
  if(O.faceoff.on && snap.foS && foShown(snap).run){ const F = foShown(snap), fs = snap.foS;
    if(F.a || F.b) add(O.faceoff.pos, `<div class="ovp ovfo"><h6>Face-off</h6><div><b class="a">${esc(F.a || "A")}</b><em class="${(fs.a || {}).cls || ""}">${esc(String((fs.a || {}).v ?? "—"))}</em></div><div><b class="b">${esc(F.b || "B")}</b><em class="${(fs.b || {}).cls || ""}">${esc(String((fs.b || {}).v ?? "—"))}</em></div></div>`); }
  if(O.battle.on) add(O.battle.pos, `<div class="ovp ovbattle"><h6>Bot battle ${snap.warStatus || ""}</h6><div class="ovmeta">${snap.warMeta || ""}</div></div>`);
  if(O.feed.on) add(O.feed.pos, `<div class="ovp ovfeed"><h6>${snap.isLive ? "Live feed" : "Recap"}</h6>${(snap.items || []).slice(0, Math.max(1, +O.feed.n || 3)).join("")}</div>`);
  if(O.banner.on && (O.banner.t1 || O.banner.t2)) add(O.banner.pos, `<div class="ovp ovbanner"><b>${esc(O.banner.t1 || "")}</b><span>${esc(O.banner.t2 || "")}</span></div>`);
  if(O.ticker.on && O.ticker.text) add(O.ticker.pos, `<div class="ovp ovticker"><div><span>${esc(O.ticker.text)}</span><span>${esc(O.ticker.text)}</span></div></div>`);
  return `<div class="hov sz-${esc(size || O.style.size)}${O.style.hideVideo ? " novid" : ""}" style="--ovo:${+O.style.opacity || .82}"><div class="ovtop"><div class="ovz z-tl">${(panels.tl || []).join("")}</div><div class="ovz z-top">${(panels.top || []).join("")}</div><div class="ovz z-tr">${(panels.tr || []).join("")}</div></div><div class="ovbot"><div class="ovcorners"><div class="ovz z-bl">${(panels.bl || []).join("")}</div><div class="ovz z-br">${(panels.br || []).join("")}</div></div>${panels.bottom ? `<div class="ovz z-bottom">${panels.bottom.join("")}</div>` : ""}</div></div>`;
}
function ovControls(){
  const O = ovCfg(), posSel = (k, v2) => `<select data-ovpos="${k}">${OV_POS.map(([p, l]) => `<option value="${p}" ${v2 === p ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  return `<h4 style="margin-top:10px">What the audience sees on ${esc(vxHost().name || "HardSmoke")}'s screen <small>layers drawn over the host stream on the Vortex and full screen</small></h4>
    <div class="ovgrid"><div class="ovlist">${OV_ITEMS.map(([k, l]) => { const c = O[k]; return `<div class="ovrow"><label class="atog"><input type="checkbox" data-ovon="${k}" ${c.on ? "checked" : ""}>${esc(l)}</label>${posSel(k, c.pos)}
        ${k === "standings" ? `<select data-ovn="standings">${[3,5,8,10].map(n => `<option ${+c.n === n ? "selected" : ""}>${n}</option>`).join("")}</select>` : ""}${k === "feed" ? `<select data-ovn="feed">${[1,2,3,5].map(n => `<option ${+c.n === n ? "selected" : ""}>${n}</option>`).join("")}</select>` : ""}</div>
        ${k === "banner" ? `<div class="ovrow sub"><input data-ovtx="banner.t1" maxlength="40" value="${esc(c.t1 || "")}" placeholder="Headline"><input data-ovtx="banner.t2" maxlength="80" value="${esc(c.t2 || "")}" placeholder="Subtitle"></div>` : ""}
        ${k === "ticker" ? `<div class="ovrow sub"><input data-ovtx="ticker.text" maxlength="200" value="${esc(c.text || "")}" placeholder="Scrolling message"></div>` : ""}`; }).join("")}
      <div class="ovrow"><span class="fl">Size</span><select data-ovst="size">${[["s","Small"],["m","Medium"],["l","Large"]].map(([v2, l]) => `<option value="${v2}" ${O.style.size === v2 ? "selected" : ""}>${l}</option>`).join("")}</select><span class="fl">Panel opacity</span><input type="range" min="0.4" max="1" step="0.05" data-ovst="opacity" value="${O.style.opacity}"></div>
      <div class="ovrow"><label class="atog"><input type="checkbox" data-ovst="hideVideo" ${O.style.hideVideo ? "checked" : ""}>Graphics only (hide the stream video behind the layers)</label></div>
      <div class="aacts"><button class="btn sm" type="button" data-ovsave>Put this on screen</button><button class="btn ghost sm" type="button" data-ovreset>Reset to default</button>${S.ovDraft ? `<span class="pst" style="--c:#FFB547">UNSAVED CHANGES · preview only</span>` : ""}</div></div>
      <div><div class="ovprevlab">Audience view ${S.ovDraft ? "(preview)" : "(live)"}</div><div class="ovprev">${hostOverlay(S.vxEnts, "s")}</div></div></div>`;
}
function renderOvCtl(){ const el = $("bOv"); if(!el || el.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== "range" && document.activeElement.type !== "checkbox") return; el.innerHTML = ovControls(); }
function ovEdit(fn){ const d = JSON.parse(JSON.stringify(ovCfg())); fn(d); S.ovDraft = d; renderOvCtl(); const pv = document.querySelector("#bOv .ovprev"); if(pv) pv.innerHTML = hostOverlay(S.vxEnts, "s"); }
document.addEventListener("change", e => { const t = e.target; if(!t.closest || !t.closest("#bOv")) return;
  if(t.dataset.ovon) ovEdit(d => d[t.dataset.ovon].on = t.checked);
  if(t.dataset.ovpos) ovEdit(d => d[t.dataset.ovpos].pos = t.value);
  if(t.dataset.ovn) ovEdit(d => d[t.dataset.ovn].n = +t.value);
  if(t.dataset.ovst) ovEdit(d => d.style[t.dataset.ovst] = t.type === "checkbox" ? t.checked : t.type === "range" ? +t.value : t.value);
});
document.addEventListener("input", e => { const t = e.target; if(!t.closest || !t.closest("#bOv")) return;
  if(t.dataset.ovtx){ const [a, b] = t.dataset.ovtx.split("."); const d = JSON.parse(JSON.stringify(ovCfg())); d[a][b] = t.value; S.ovDraft = d; const pv = document.querySelector("#bOv .ovprev"); if(pv) pv.innerHTML = hostOverlay(S.vxEnts, "s"); }
  if(t.dataset.ovst === "opacity"){ const pv = document.querySelector("#bOv .hov"); if(pv) pv.style.setProperty("--ovo", t.value); }
});
document.addEventListener("click", async e => {
  if(e.target.closest("[data-ovreset]")){ S.ovDraft = JSON.parse(JSON.stringify(OV_DEF)); renderOvCtl(); return; }
  if(!e.target.closest("[data-ovsave]")) return;
  const ov = ovCfg(); if(S.demo || !db){ S.vxHostLocal = {...(S.vxHostLocal || {}), ov}; S.ovDraft = null; toast("On screen (preview only)"); renderBattle(); renderOvCtl(); return; }
  if(!isAdmin) return; if(await act(() => db.doc("config/vxhost").set({...vxHost(), ov}))){ S.vxHost = {...vxHost(), ov}; S.ovDraft = null; toast("Now showing on the host screen"); renderBattle(); renderOvCtl(); }
});
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-bkind]"); if(!b) return; const k = b.dataset.bkind; if(k === battleKind()) return;
  if(S.demo || !db) S.bKindLocal = k; else { if(!isAdmin) return; S.battleCfg = {...(S.battleCfg || {}), kind:k}; await act(() => mergeWrite(db.doc("config/battle"), {kind:k})); }
  toast(k === "callers" ? "Battle type: Callers face-off" : "Battle type: Bots battle"); battleDemo.ck = null; renderBattle(); if(typeof renderOverlay === "function") try { renderOverlay(); } catch {} if(S.cc && typeof renderCC === "function") renderCC(); if(S.adminPage){ renderAdmin.lastTab = null; renderAdmin(); }
});
// embeds: Twitch, YouTube and Kick play inside the wall; anything else shows an Open button
function vxEmbed(url, muted){
  try { const u = new URL(url), h = u.hostname.replace(/^www\.|^m\./, "");
    if(h === "twitch.tv"){ const ch = u.pathname.split("/").filter(Boolean)[0]; if(ch) return `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=${encodeURIComponent(location.hostname || "localhost")}&autoplay=true&muted=${muted}`; }
    if(h === "youtube.com" || h === "youtu.be"){ let id = h === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v"); if(!id){ const m = u.pathname.match(/\/(?:live|embed|shorts)\/([\w-]{6,})/); if(m) id = m[1]; } if(id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1`; }
    if(h === "kick.com"){ const ch = u.pathname.split("/").filter(Boolean)[0]; if(ch) return `https://player.kick.com/${encodeURIComponent(ch)}?autoplay=true&muted=${muted}`; }
  } catch {}
  return null;
}
function vxFsList(){ const E = (S.vxEnts || []).filter(e => !vxHostOff(e.key)); if(!S.vxFsSel) S.vxFsSel = new Set(E.filter(vxShown).map(e => e.key)); return E; }
function renderVxFs(only){
  const E = vxFsList(), sel = E.filter(e => S.vxFsSel.has(e.key)), n = sel.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  $("vxFsN").textContent = `${n} of ${E.length} showing · ${Object.values(S.vxSound).filter(Boolean).length} with sound`;
  const g = $("vxFsGrid"); g.style.setProperty("--cols", cols);
  const stg = stageOn(E) && S.vxFsMode !== "grid"; $("vxFsMode").hidden = !stageOn(E); $("vxFsMode").setAttribute("aria-pressed", stg); g.classList.toggle("stagemode", stg);
  if(!stg && g.dataset.arr){ g.dataset.arr = ""; g.innerHTML = ""; renderVxFs.sig = null; }
  const tile = e => { const snd = !!S.vxSound[e.key], src = e.url ? vxEmbed(e.url, !snd) : null;
    return `<div class="vxft${snd ? " snd" : ""}" data-k="${esc(e.key)}"><div class="ov"><span class="n">${esc(e.name)}</span>${e.call ? `<span class="c ${e.call}">${e.call === "up" ? "▲ UP" : "▼ DOWN"}</span>` : ""}<button type="button" class="${snd ? "on" : ""}" data-vxsnd="${esc(e.key)}" title="Sound on/off">${snd ? "🔊 Sound on" : "🔇 Muted"}</button><button type="button" data-vxfsrm="${esc(e.key)}" title="Remove from full screen">✕</button></div>
      ${e.kind === "host" ? hostOverlay(S.vxEnts) : ""}${src ? `<iframe src="${esc(src)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="${esc(e.name)} stream"></iframe>` : `<div class="ph">${e.url ? `<span>This stream can't play inside the page</span><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(domainOf(e.url))} ↗</a>` : `<span>No stream linked yet</span>`}</div>`}</div>`; };
  if(stg){ const side = sel.filter(e => e.kind === "lu" || e.kind === "aud"), sig = side.map(e => e.key + "|" + e.url + "|" + !!S.vxSound[e.key]).join(";") + "#";
    if(g.dataset.arr !== sig || !$("vxFsStage")){ g.dataset.arr = sig; g.innerHTML = `<div class="vxfsarr${side.length > 4 ? " s2" : side.length ? " s1" : ""}"><div class="vxfsstage" id="vxFsStage"></div>${side.length ? `<div class="vxfsside">${side.map(tile).join("")}</div>` : ""}</div>`; }
    stageRender($("vxFsStage"), S.vxEnts || E, false); $("vxFsN").textContent = `Battle stage + ${side.length} selected stream${side.length === 1 ? "" : "s"}`; const pk0 = $("vxFsPicker"); pk0.hidden = !S.vxPick; renderVxFs.sig = null; if(!S.vxPick) return; }
  if(only && only !== "__none"){ renderVxFs.sig = null; const old = g.querySelector(`.vxft[data-k="${CSS.escape(only)}"]`), e = E.find(x => x.key === only); if(old && e){ old.outerHTML = tile(e); } }
  else { const sig = sel.map(e => e.key + "|" + e.url + "|" + !!S.vxSound[e.key] + "|" + e.call).join(";") + cols; if(sig !== renderVxFs.sig){ renderVxFs.sig = sig; g.innerHTML = sel.length ? sel.map(tile).join("") : `<div class="vxfsempty">No streams selected. Use ☰ Choose streams.</div>`; } }
  const pk = $("vxFsPicker"); pk.hidden = !S.vxPick; $("vxFsPick").setAttribute("aria-pressed", S.vxPick);
  if(S.vxPick) pk.innerHTML = `<h5>SHOW ON FULL SCREEN</h5>${E.map(e => `<label><input type="checkbox" data-vxfssel="${esc(e.key)}" ${S.vxFsSel.has(e.key) ? "checked" : ""}><span>${esc(e.name)}<br><small>${e.url ? esc(domainOf(e.url)) : "no stream link"}</small></span><button type="button" class="snd${S.vxSound[e.key] ? " on" : ""}" data-vxsnd="${esc(e.key)}">${S.vxSound[e.key] ? "🔊" : "🔇"}</button></label>`).join("") || `<small>No contenders yet.</small>`}<div class="aacts" style="margin-top:6px"><button class="xbtn2" type="button" data-vxfsall="1">Select all</button><button class="xbtn2" type="button" data-vxfsall="0">Clear</button></div>`;
}
function openVxFs(on){
  $("vxFs").hidden = !on;
  if(on){ S.vxFsSel = null; renderVxFs.sig = null; renderVxFs(); const el = $("vxFs"); if(el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
  else { $("vxFsGrid").innerHTML = ""; if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
}
$("vxFullBtn").addEventListener("click", () => { if(!(S.vxEnts || []).length) return toast("No contenders yet."); openVxFs(true); });
$("vxFsClose").addEventListener("click", () => openVxFs(false));
$("vxFsMode").addEventListener("click", () => { S.vxFsMode = S.vxFsMode === "grid" ? "stage" : "grid"; $("vxFsGrid").dataset.stsig = ""; $("vxFsGrid").innerHTML = ""; renderVxFs.sig = null; renderVxFs(); });
$("vxFsPick").addEventListener("click", () => { S.vxPick = !S.vxPick; renderVxFs("__none"); });
$("vxFsAllMute").addEventListener("click", () => { S.vxSound = {}; renderVxFs(); });
document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && !$("vxFs").hidden && S.vxFsExitWithFs) openVxFs(false); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !$("vxFs").hidden && !document.fullscreenElement) openVxFs(false); });
document.addEventListener("change", e => { const c = e.target.closest("[data-vxfssel]"); if(!c) return; const k = c.dataset.vxfssel; c.checked ? S.vxFsSel.add(k) : S.vxFsSel.delete(k); renderVxFs(); });
document.addEventListener("click", async e => {
  const t = e.target;
  const snd = t.closest("[data-vxsnd]"); if(snd){ e.preventDefault(); const k = snd.dataset.vxsnd; S.vxSound[k] = !S.vxSound[k]; if(S.vxFsSel && S.vxFsSel.has(k)) renderVxFs(k); renderVxFs("__none"); const pk = $("vxFsPicker"); if(S.vxPick){ const b = pk.querySelector(`[data-vxsnd="${CSS.escape(k)}"]`); if(b){ b.classList.toggle("on", !!S.vxSound[k]); b.textContent = S.vxSound[k] ? "🔊" : "🔇"; } } $("vxFsN").textContent = `${S.vxFsSel.size} of ${vxFsList().length} showing · ${Object.values(S.vxSound).filter(Boolean).length} with sound`; return; }
  const rm = t.closest("[data-vxfsrm]"); if(rm){ S.vxFsSel.delete(rm.dataset.vxfsrm); renderVxFs(); return; }
  const all = t.closest("[data-vxfsall]"); if(all){ S.vxFsSel = new Set(all.dataset.vxfsall === "1" ? vxFsList().map(x => x.key) : []); renderVxFs(); return; }
  const hd = t.closest("[data-vxhide]"); if(hd){ e.preventDefault(); if(hd.dataset.vxhide.startsWith("aud:")) delete vxHideLocal[hd.dataset.vxhide]; else vxHideLocal[hd.dataset.vxhide] = true; saveVxLocal(); renderBattle(); toast("Screen hidden. Turn it back on in the Screens bar."); return; }
  const tg = t.closest("[data-vxtog]"); if(tg){ const k = tg.dataset.vxtog; if(k.startsWith("aud:")){ if(vxHideLocal[k] === false) delete vxHideLocal[k]; else vxHideLocal[k] = false; } else { vxHideLocal[k] = !vxHideLocal[k]; if(!vxHideLocal[k]) delete vxHideLocal[k]; } saveVxLocal(); renderBattle(); return; }
  const ho = t.closest("[data-vxhost]"); if(ho){ const k = ho.dataset.vxhost, off = !vxHostOff(k); S.vxScreens = {...S.vxScreens, off:{...((S.vxScreens || {}).off || {}), [k]:off}};
    if(db && !S.demo && isAdmin) await act(() => mergeWrite(db.doc("config/vxscreens"), {off:{[k]:off}}));
    toast(off ? "Screen turned off for everyone" : "Screen turned on"); renderBattle(); return; }
});
// ---------- Battle of the Bots page ----------
S.battlePage = false;
function renderBattlePage(){ document.body.classList.toggle("battlemode", S.battlePage); $("battleBtn").setAttribute("aria-pressed", S.battlePage || S.vortexPage); }
function openBattle(on){
  S.battlePage = on;
  if(on && S.dmPage) openDM(false);

  if(on && S.coinPage) openCoin(false);

  if(on && S.mePage) openMe(false);
  if(on && S.adminPage) openAdmin(false);
  if(on && S.callersPage) openCallersPage(false);
  if(on && S.vortexPage){ S.vortexPage = false; renderVortexPage(); }
  if(on && S.cc){ S.cc = false; renderCC(); }
  if(on && S.cortex){ S.cortex = false; if(typeof resetCorex === "function") resetCorex(); renderCortex(); }
  try { history.replaceState(null, "", "#" + (on ? "battle" : S.section)); } catch {}
  renderBattlePage(); if(on) renderBattle(); window.scrollTo({top:0});
}
$("battleBtn").addEventListener("click", e => { if(S.vortexPage || S.battlePage){ openBattle(false); openVortex(false); } else enterArena(e); });
$("battleDispBtn").addEventListener("click", () => openVortex(true));
$("battleExitBtn").addEventListener("click", () => openBattle(false));
$("ccExitBtn").addEventListener("click", () => { if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); openCC(false); });
$("ccAddBtn").addEventListener("click", () => { const p = $("ccPick"); p.hidden = !p.hidden; if(!p.hidden){ renderCCPick(); p.scrollIntoView({block:"nearest"}); } });
$("ccPullBtn").addEventListener("click", () => { ccPull(true); toast("Pull mode: click any window on the site to pin it."); });
$("ccPullDone").addEventListener("click", () => ccPull(false));
$("ccPullCancel").addEventListener("click", () => ccPull(false, true));
$("ccEditBtn").addEventListener("click", () => { const st = ccState(); st.lock = !st.lock; if(st.lock) S.ccSet = null; ccSave(); renderCC(); });
$("ccLiveBtn").addEventListener("click", () => ccAdd("live", "", {z:"xl"}));
$("ccVoiceBtn").addEventListener("click", () => $("voiceBtn").click());
$("ccFullBtn").addEventListener("click", () => { const el = $("cc"); if(el.requestFullscreen) el.requestFullscreen().catch(() => toast("Full screen isn't available in this view.")); else toast("Full screen isn't available in this view."); });
$("ccResetBtn").addEventListener("click", () => setLayout(defaultLayout().map(p => ({...p, k:ccK()}))));
$("cc").addEventListener("input", e => {
  const t = e.target;
  if(t.id === "ccQ"){ S.ccQ = t.value; ccFilterPick(); return; }
  if(t.dataset.ccnote){ const p = ccItem(t.dataset.ccnote); if(p){ p.o = {...(p.o || {}), text:t.value.slice(0, 4000)}; ccSave(); } }
});
$("cc").addEventListener("change", e => {
  const t = e.target;
  if(t.dataset.ccttl){ const v = t.value.trim().slice(0, 60); ccEdit(t.dataset.ccttl, p => ({...p, ttl:v || undefined})); return; }
  if(t.dataset.ccopt){ const [k, nm] = t.dataset.ccopt.split("|"); const v = t.type === "checkbox" ? t.checked : t.type === "number" ? Math.max(+t.min || 1, Math.min(+t.max || 99, +t.value || 0)) : t.value;
    ccEdit(k, p => { if(nm === "__id") return {...p, id:v || undefined}; p.o[nm] = v; return p; }); return; }
  if(t.dataset.ccmvws){ const to = +t.value; if(t.value === "") return; const st = ccState(), L = layout().slice(), i = L.findIndex(p => p.k === t.dataset.ccmvws); if(i < 0 || !st.ws[to]) return;
    const [it] = L.splice(i, 1); st.ws[to].items = (st.ws[to].items || []).concat([it]).slice(0, 60); S.ccSet = null; setLayout(L); toast(`Moved to ${st.ws[to].name}`); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return;
  const d = b.dataset;
  if(d.ccnode){ if(S.cc) openCC(false); openCallersPage(true, d.ccnode); return; }
  if(d.ccadd){ const [t, id] = d.ccadd.split("|"); if(t === "bk" && !S.cc && !b.closest("#cc")){ ccAdd(t, id); return; } ccAdd(t, id || undefined); return; }
  if(!b.closest("#cc")) return;
  const st = ccState();
  if(d.ccaddw){ const sel = b.closest(".cccard").querySelector("select[data-ccpicksel]"); ccAdd(d.ccaddw, sel ? sel.value || undefined : undefined); renderCCPick(); return; }
  if(d.ccg){ S.ccG = d.ccg; renderCCPick(); return; }
  if("ccclosepick" in d){ $("ccPick").hidden = true; return; }
  if(d.ccgo){ ccGo(d.ccgo); return; }
  if(d.ccdm){ openDM(true, d.ccdm); return; }
  if(d.ccset){ S.ccSet = S.ccSet === d.ccset ? null : d.ccset; renderCC(); return; }
  if(d.ccmin){ ccEdit(d.ccmin, p => ({...p, min:!p.min})); return; }
  if(d.ccrm){ if(S.ccSet === d.ccrm) S.ccSet = null; setLayout(layout().filter(p => p.k !== d.ccrm)); return; }
  if(d.ccdup){ const L = layout().slice(), i = L.findIndex(p => p.k === d.ccdup); if(i < 0) return; L.splice(i + 1, 0, {...L[i], o:{...(L[i].o || {})}, k:ccK()}); setLayout(L); return; }
  if(d.ccz){ const [k, z] = d.ccz.split("|"); ccEdit(k, p => ({...p, z})); return; }
  if(d.cch){ const [k, h] = d.cch.split("|"); ccEdit(k, p => ({...p, h})); return; }
  if(d.ccc){ const [k, i] = d.ccc.split("|"); ccEdit(k, p => ({...p, c:CCC[+i] || undefined})); return; }
  if(d.ccmv){ const [k, dir] = d.ccmv.split("|"), L = layout().slice(), i = L.findIndex(p => p.k === k), j = i + +dir; if(i < 0 || j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; setLayout(L); return; }
  if(d.ccws){ st.cur = +d.ccws; S.ccSet = null; S.ccMenu = null; S.ccDelArm = false; ccSave(); renderCC(); if(!$("ccPick").hidden) renderCCPick(); return; }
  if(d.ccmenu){ S.ccMenu = S.ccMenu === d.ccmenu ? null : d.ccmenu; S.ccDelArm = false; renderCC(); return; }
  if(d.cctpl){ ccPreset(d.cctpl); return; }
  if("ccwsren" in d){ const v = ($("ccWsName").value || "").trim().slice(0, 30); if(v){ ccWs().name = v; S.ccMenu = null; $("ccWs")._sig = ""; ccSave(); renderCC(); toast("Workspace renamed"); } return; }
  if(d.ccwsmv){ const i = st.cur, j = i + +d.ccwsmv; if(j < 0 || j >= st.ws.length) return; [st.ws[i], st.ws[j]] = [st.ws[j], st.ws[i]]; st.cur = j; ccSave(); renderCC(); return; }
  if("ccwsdup" in d){ if(st.ws.length >= 12){ toast("You can have up to 12 workspaces."); return; } const W = ccWs(); st.ws.splice(st.cur + 1, 0, {name:(W.name + " copy").slice(0, 30), items:W.items.map(p => ({...p, o:{...(p.o || {})}, k:ccK()}))}); st.cur++; S.ccMenu = null; ccSave(); renderCC(); return; }
  if("ccwsclr" in d){ S.ccMenu = null; setLayout([]); toast("Workspace cleared. Add windows with + Add window."); return; }
  if("ccwsreset" in d){ S.ccMenu = null; setLayout(defaultLayout().map(p => ({...p, k:ccK()}))); return; }
  if("ccwsdel" in d){ if(st.ws.length < 2) return; if(!S.ccDelArm){ S.ccDelArm = true; renderCC(); return; } const nm = ccWs().name; st.ws.splice(st.cur, 1); st.cur = Math.max(0, st.cur - 1); S.ccDelArm = false; S.ccMenu = null; ccSave(); renderCC(); toast(`Deleted ${nm}`); return; }
});
// pin from a profile
document.addEventListener("click", e => { const b = e.target.closest("[data-ccpin]"); if(!b) return; ccAdd("profile", b.dataset.ccpin, {z:"m", h:"l"}); });

document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return;
  const d = b.dataset;
  if(d.bmode){
    const box = b.closest(".bcast"), kind = box.dataset.bkind, id = box.dataset.bid;
    S.bmode[kind] = d.bmode;
    if(kind !== "caller" && id) saveMode(kind, id, d.bmode);
    refreshBroadcast(kind, id, true); return;
  }
  if("bgo" in d){
    const box = b.closest(".bcast"), kind = box.dataset.bkind, id = box.dataset.bid, m = S.bmode[kind];
    const url = $(kind + "BUrl").value.trim(), title = $(kind + "BTitle").value.trim();
    if(!/^https:\/\/[^\s]+\.[^\s]+/.test(url)){ toast("Paste the full stream link, starting with https://"); return; }
    const src = kind === "bot" ? myBots().find(x => x.id === id) : kind === "script" ? myScripts().find(x => x.id === id) : null;
    const now = Date.now(), sid = newId();
    const doc = {section: kind === "caller" ? "callers" : kind === "bot" ? "bots" : "scripts", subId:null, title: title || (src ? `${src.name} live` : "Live calls"), url, description:"",
      hostId:meId, authorId:meId, status:"live", scheduledFor:null, startedAt:now, createdAt:now, media: m === "audio" ? "audio" : "video", sourceKind:kind, sourceId: kind === "caller" ? null : id, sourceName: src ? src.name : null};
    if(await act(() => db.doc("streams/" + sid).set(doc))) toast(`You're live · ${mediaWord(doc.media)}`);
    return;
  }
  if(d.bend){ if(await act(() => db.doc("streams/" + d.bend).update({status:"ended", endedAt:Date.now()}))) toast("Stream ended"); return; }
});

// ---------- forum streams in windows ----------
const SEC_OF = {callers:"callers", bots:"bots", charts:"scripts"};
function forumStreams(sec){
  if(S.demo) return liveList().filter(s => s.sec === sec).map(s => ({...s, status:"live"}));
  const soon = Date.now() + 24*3600000;
  return S.streams.filter(s => s.section === sec && (s.status === "live" || (s.status === "scheduled" && (s.scheduledFor||0) < soon)))
    .sort((a,b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || (a.scheduledFor||0) - (b.scheduledFor||0));
}
function forumStrip(sec){
  const L = forumStreams(sec), nm = SECTIONS[sec].name, live = L.filter(s => s.status === "live").length;
  return `<div class="fstrip"><div class="label" style="margin:0">From the ${esc(nm)} forum · ${live} live${L.length > live ? ` · ${L.length - live} upcoming` : ""}</div>
    ${L.length ? `<div class="fsrow">${L.map(s => { const sb = s.subId ? subOf(s.subId) : null;
      return `<div class="fs ${s.status === "live" ? "live" : ""}"><div class="m">${s.status === "live" ? `<span class="pill live">Live</span>` : `<span class="pill">${esc(when(s.scheduledFor))}</span>`}${mediaTag(s)}${sb ? `<span class="chip">#${esc(sb.name)}</span>` : ""}</div>
      <div class="t">${esc(s.title || "")}</div><div class="m">${s.who ? esc(s.who) : who(s.hostId)}${s.sourceName ? ` · ${esc(s.sourceName)}` : ""}</div>
      <div class="acts">${s.id ? `<button class="xbtn2" type="button" data-gostream="${sec}|${esc(s.id)}">Open in forum</button>` : ""}${s.status === "live" && /^https:\/\//.test(s.url||"") ? `<a class="watch2" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${s.media === "audio" ? "Listen" : "Watch"} ↗</a>` : ""}</div></div>`; }).join("")}</div>`
      : `<div class="fsempty">Nothing live in the ${esc(nm)} forum right now. Streams posted in its Streams tab show up here.</div>`}</div>`;
}
function renderForumStrips(){
  $("fsCallers").innerHTML = forumStrip("callers");
  $("fsBots").innerHTML = forumStrip("bots");
  $("fsCharts").innerHTML = forumStrip("scripts");
  fillNames($("fsCallers")); fillNames($("fsBots")); fillNames($("fsCharts"));
}

// ---------- community: chat, presence, voice rooms ----------
S.lounge = {}; S.peers = []; S.inVoice = null; S.dtab = "members"; S.voiceLinks = {}; S.demoPeers = []; S.demoMsgs = [];
let lastPresence = "", loungeOpen = false;
const hourKey = t => new Date(t).toISOString().slice(0,13).replace(/[-T]/g,"");
function subscribeCommunity(){
  if(!db) return;
  db.collection("lounge").orderBy("hour","desc").limit(3).onSnapshot(s => { S.lounge = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderDock(); renderCortex(); renderVxChat(); }, () => {});
  subscribeBB();
  db.doc("config/faceoff").onSnapshot(s => { S.foDoc = s.exists ? s.data() : {}; S.fo = s.exists ? {a:s.data().a || "", b:s.data().b || ""} : null; S.foUrl = s.exists ? {a:s.data().aUrl || "", b:s.data().bUrl || ""} : null; renderBattle(); }, () => {});
  db.doc("config/bbBattle").onSnapshot(s => { S.bbWar = s.exists ? s.data() : null; renderBattle(); }, () => {});
  db.doc("config/battleRoster").onSnapshot(s => { S.roster = s.exists ? (s.data().bots || []) : []; S.rosterC = s.exists ? (s.data().callers || []) : []; renderBattle(); }, () => {});
  db.doc("config/battle").onSnapshot(s => { S.battleCfg = s.exists ? s.data() : null; renderBattle(); }, () => {});
  db.collection("cxcall").onSnapshot(s => { S.cxCalls = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); if(S.cortex){ cxCallPaint(); renderCxTop(); } }, () => {});
  db.doc("config/voice").onSnapshot(s => { S.voiceLinks = s.exists ? s.data() : {}; renderDock(); renderRailVoice(); }, () => {});
  if(roomApi){
    try { roomApi.onPeers(ch => { S.peers = ch.peers; renderDock(); renderRailVoice(); renderCortex(); renderVxChat(); renderVxWho(); }); } catch {}
    pushPresence();
  }
}
function pushPresence(){
  if(!roomApi || !meId) return;
  const p = {uid:meId, sec:S.section, voice:S.inVoice, vx:S.vortexPage ? 1 : 0, tk:S.vxTalk && (S.inVoice === "vortex" || S.inVoice === "cortex") ? 1 : 0, mu:S.vxMute ? 1 : 0, cam:S.myCam ? S.myCam.kind : null, camT:S.myCam ? S.myCam.title : null};
  if(S.typing && Date.now() - S.typing.t < 6000) p.ty = S.typing.ch + "|" + S.typing.t;
  const k = JSON.stringify(p); if(k === lastPresence) return; lastPresence = k;
  try { roomApi.presence(p).catch(() => {}); } catch {}
}
function onlinePeople(){
  if(S.demo) return S.demoPeers;
  const seen = new Map();
  for(const p of S.peers){ const id = (p.presence && p.presence.uid) || p.by; if(!id || seen.has(id)) continue; seen.set(id, {id, sec:p.presence && p.presence.sec, voice:p.presence && p.presence.voice, ty:p.presence && p.presence.ty, vx:!!(p.presence && p.presence.vx), tk:!!(p.presence && p.presence.tk), mu:!!(p.presence && p.presence.mu), cam:p.presence && p.presence.cam, camT:p.presence && p.presence.camT}); }
  if(meId && !seen.has(meId) && roomApi) seen.set(meId, {id:meId, sec:S.section, voice:S.inVoice, vx:!!S.vortexPage, tk:!!(S.vxTalk && (S.inVoice === "vortex" || S.inVoice === "cortex")), mu:!!S.vxMute});
  return [...seen.values()];
}
function loungeMsgs(){
  if(S.demo) return S.demoMsgs;
  const out = [];
  for(const d of Object.values(S.lounge)) for(const [id, m] of Object.entries(d.msgs || {})) if(m && m.b) out.push({id, hour:d.hour, ...m, b:maskWords(m.b)});
  return out.sort((a,b) => a.t - b.t).slice(-150);
}
const nameOf = (m) => m.name ? `<span class="who">${esc(m.name)}</span>` : who(m.a);
const tagFor = id => isVerified(id) ? `<span class="vk" title="Verified caller">✓</span>` : "";
function renderDock(){
  const people = onlinePeople();
  $("onlineN").textContent = people.length; $("onlineN2").textContent = people.length ? `(${people.length})` : "";
  if($("dock").hidden) return;
  document.querySelectorAll("[data-dtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.dtab === S.dtab));
  $("paneMembers").hidden = S.dtab !== "members"; if(S.dtab === "members") spDockMembers();
  $("paneChat").hidden = S.dtab !== "chat"; $("paneVoice").hidden = S.dtab !== "voice"; $("paneOnline").hidden = S.dtab !== "online";
  $("dockSub").textContent = S.demo ? "Demo: sample people and messages" : `${people.length} online · ${people.filter(p => p.voice).length} in voice`;
  if(S.dtab === "chat"){
    const box = $("lmsgs"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const M = loungeMsgs().slice(-40);
    box.innerHTML = M.length ? M.map(m => `<div class="lm">${m.name ? `<span class="av sm" style="background:${m.color||"#4DA3FF"}"></span>` : avatar(m.a,"sm")}<div><div>${nameOf(m)}${m.a ? tagFor(m.a) : ""} <time>${esc(tLocal(m.t))}</time>${!S.demo && (m.a === meId || isAdmin) ? ` <button class="xbtn" type="button" data-lmdel="${esc(m.hour)}|${esc(m.id)}">delete</button>` : ""}</div><div class="tx">${m.dir ? `<span class="tchip ${m.dir}">${m.dir==="up"?"▲":"▼"}</span>` : ""}${esc(m.b)}</div></div></div>`).join("")
      : `<div class="cempty">No messages yet. Enter the Cortex to start the conversation.</div>`;
    if(atBottom || !loungeOpen) box.scrollTop = box.scrollHeight;
    loungeOpen = true;
    fillNames(box);
  }
  if(S.dtab === "voice"){
    $("paneVoice").innerHTML = `<p class="fine" style="padding:12px 14px 0">Each forum has its own voice room. Voice runs in the linked room (Google Meet, X Spaces…) in a new tab; this shows who went in.</p>` +
      [["cortex",{name:"Live Trade Cortex"}], ...Object.entries(SECTIONS)].map(([k,v]) => {
        const inside = people.filter(p => p.voice === k), link = S.demo ? "https://meet.google.com/" : S.voiceLinks[k];
        return `<div class="vroom" data-v="${k}"><h4>${esc(v.name)} voice <span>${inside.length} inside</span></h4>
          <div class="avs">${inside.map(p => p.name ? `<span class="av sm" title="${esc(p.name)}" style="background:${p.color}"></span>` : avatar(p.id,"sm")).join("") || `<span class="fine">Nobody yet</span>`}</div>
          <div class="acts">${link ? (S.inVoice === k ? `<span class="vtag">YOU'RE IN</span><button class="xbtn2" type="button" data-vleave>Leave</button>` : `<a class="joinv" href="${esc(link)}" target="_blank" rel="noopener noreferrer" data-vjoin="${k}">Join voice ↗</a>`) : `<span class="fine">No voice room linked yet.</span>`}</div>
          ${isAdmin && !S.demo ? `<div class="vset"><input type="url" id="vl_${k}" placeholder="https:// voice room link (Meet, X Space…)" value="${esc(S.voiceLinks[k] || "")}" aria-label="${esc(v.name)} voice link"><button class="xbtn2" type="button" data-vsave="${k}">Save</button></div>` : ""}
        </div>`; }).join("");
    fillNames($("paneVoice"));
  }
  if(S.dtab === "online"){
    $("paneOnline").innerHTML = people.length ? people.map(p => `<div class="onl">${p.name ? `<span class="av sm" style="background:${p.color}"></span>` : avatar(p.id,"sm")}<span class="grow">${p.name ? `<span class="who">${esc(p.name)}</span>` : who(p.id)}${p.id ? tagFor(p.id) : ""}<br><small>in ${esc(SECTIONS[p.sec]?.name || "D3MON.CO")}</small></span>${p.voice ? `<span class="vtag" style="--c:var(--${p.voice})">VOICE · ${esc(voiceName(p.voice).toUpperCase())}</span>` : ""}</div>`).join("")
      : `<div class="cempty" style="padding:14px">${roomApi ? "Just you right now." : "Online presence isn't available in this view."}</div>`;
    fillNames($("paneOnline"));
  }
}
function renderRailVoice(){
  const host = $("railVoice"); if(!host) return;
  const k = S.section, people = onlinePeople(), inside = people.filter(p => p.voice === k), link = S.demo ? "https://meet.google.com/" : S.voiceLinks[k];
  host.innerHTML = `<div class="railvoice"><p class="label">${esc(SECTIONS[k].name)} voice room</p>
    <div class="rsub">${inside.length} inside · ${people.filter(p => p.sec === k).length} browsing this forum</div>
    <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">${link ? (S.inVoice === k ? `<span class="vtag" style="--c:var(--acc)">YOU'RE IN</span><button class="xbtn2" type="button" data-vleave>Leave</button>` : `<a class="joinv" style="--c:var(--acc)" href="${esc(link)}" target="_blank" rel="noopener noreferrer" data-vjoin="${k}">Join voice ↗</a>`) : `<span class="fine">${isAdmin ? "Add a link in Community → Voice rooms." : "No voice room yet."}</span>`}
    <button class="xbtn2" type="button" data-opencortex>Trade floor</button></div></div>`;
}
async function sendLounge(text){
  if(!sendGuard()) return false;
  if(S.demo){ S.demoMsgs.push({id:newId(), name:"You (demo)", color:"#2EE59D", b:text, t:Date.now()}); renderDock(); return true; }
  const t = Date.now(), h = hourKey(t), id = newId();
  return act(() => mergeWrite(db.doc("lounge/" + h), {hour:h, msgs:{[id]:{a:meId, t, b:text}}}));
}
$("dockBtn").addEventListener("click", () => { const open = $("dock").hidden; $("dock").hidden = !open; $("dockBtn").setAttribute("aria-expanded", open); if(open){ loungeOpen = false; renderDock(); if(typeof NEB !== "undefined" && NEB.open){ NEB.open = false; $("nebPanel").hidden = true; } } });
$("dockClose").addEventListener("click", () => { $("dock").hidden = true; $("dockBtn").setAttribute("aria-expanded", false); });
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-dtab],[data-vjoin],[data-vleave],[data-vsave],[data-lmdel],[data-opendock]"); if(!el) return;
  const d = el.dataset;
  if(d.dtab){ S.dtab = d.dtab; renderDock(); return; }
  if(d.opendock){ S.dtab = d.opendock; if($("dock").hidden) $("dockBtn").click(); else renderDock(); return; }
  if(d.vjoin){ S.inVoice = d.vjoin; if(S.demo){ const me = S.demoPeers.find(p => p.me); if(me) me.voice = d.vjoin; } pushPresence(); setTimeout(() => { renderDock(); renderRailVoice(); if(S.cortex) renderCxVoice(); }, 50); return; }
  if("vleave" in d){ S.inVoice = null; if(S.demo){ const me = S.demoPeers.find(p => p.me); if(me) me.voice = null; } pushPresence(); renderDock(); renderRailVoice(); if(S.cortex) renderCxVoice(); return; }
  if(d.vsave){ const url = $("vl_" + d.vsave).value.trim(); if(url && !/^https:\/\//.test(url)){ toast("Voice links need to start with https://"); return; }
    if(await act(() => mergeWrite(db.doc("config/voice"), {[d.vsave]: url}))) toast(`${voiceName(d.vsave)} voice room saved`); return; }
  if(d.lmdel){ const [h, id] = d.lmdel.split("|"); await act(() => db.doc("lounge/" + h).update({msgs:{[id]:{b:"", deleted:true}}})); return; }
});

// demo community
const DEMO_PEOPLE = [["Nova","#FFB547","callers","cortex"],["Redline","#FF4D6A","callers","cortex"],["Kai Tides","#4DA3FF","scripts","cortex"],["Quiet Mike","#B98CFF","scripts","scripts"],
  ["gridlord","#2EE59D","bots","cortex"],["theta_tina","#FFB547","callers","cortex"],["m0mentum","#4DA3FF","bots","bots"],["lurker99","#8FA3B2","callers",null]];
const DEMO_LINES = ["anyone else fading this 15m?","Nova called that last round clean","LiqHunter just flagged $14M long liqs","Kalshi hourly is pricing 58c up","VWAP bands flipped long on BTC","polymarket spread is wide right now, careful","who's in the callers voice?","gm, ETH looking heavy","funding went negative, squeeze setup?"];
function startDemoCommunity(){
  S.demoPeers = [{name:"You (demo)", color:"#2EE59D", sec:S.section, voice:null, me:true}, ...DEMO_PEOPLE.map(([n,c,s,v]) => ({name:n + " (demo)", color:c, sec:s, voice:v}))];
  const R = {Nova:'<span class="rb cal">CALLER ✓</span><span class="rb lv">LIVE</span>', Redline:'<span class="rb cal">CALLER ✓</span><span class="rb bot">BOT DEV</span>', "Kai Tides":'<span class="rb cal">CALLER ✓</span><span class="rb lv">LIVE</span>', "Quiet Mike":'<span class="rb scr">SCRIPTER</span>', gridlord:'<span class="rb bot">BOT DEV</span>', theta_tina:'<span class="rb str">STREAMER</span><span class="rb lv">LIVE</span>'};
  S.demoPeers.forEach(p => { const k = p.name.replace(" (demo)",""); p.role = R[k] || ""; p.live = /LIVE/.test(p.role); });
  S.demoMsgs = [
    {name:"Nova (demo)", color:"#FFB547", role:R.Nova, b:"Next BTC 15m I'm leaning up, bids stacking at 64.1k", dir:"up", mk:"BTC 15M", tab:"main"},
    {name:"DeltaFlow", color:"#4DA3FF", role:'<span class="rb bot">BOT</span>', b:"CVD flipped positive, order book 1.3 bid/ask", tab:"main"},
    {name:"gridlord (demo)", color:"#2EE59D", role:R.gridlord, b:"Kalshi 15m up is 54c, Polymarket 57c, small arb", tab:"main"},
    {name:"Session VWAP Bands", color:"#B98CFF", role:'<span class="rb scr">SCRIPT</span>', b:"Price back inside the bands, mid-band is the magnet", tab:"btc"},
    {name:"theta_tina (demo)", color:"#FFB547", role:R.theta_tina, b:"live on the hourly, come hang", tab:"main"}].map((m,i) => ({id:"dm"+i, t:Date.now() - (6-i)*50000, ...m}));
  S.dRx = {dm0:{fire:{a:1,b:1,c:1}, rocket:{a:1}}, dm2:{money:{a:1,b:1}, eyes:{a:1}}};
  S.demoMsgs.push({id:"dm5", t:Date.now() - 20000, name:"Redline (demo)", color:"#FF4D6A", role:R.Redline, b:"@gridlord that arb closes fast, I'm in on the Kalshi side", tab:"main", re:{id:"dm2"}});
  demoState.cortexLive = [{title:"Trading the hourly open, live", url:"https://www.twitch.tv/", media:"video", who:"theta_tina (demo)", src:"Streamer", sec:"cortex"}];
}
function demoCommunityTick(i){
  const p = DEMO_PEOPLE[(i*5) % 8], who2 = S.demoPeers.find(x => x.name === p[0] + " (demo)");
  const tabs = ["main","main","btc","kalshi","main","eth","poly","main"];
  const dir = i % 3 === 0 ? (Math.random() < .5 ? "up" : "down") : null;
  S.demoMsgs.push({id:"dm"+i+"x", name:p[0] + " (demo)", color:p[1], role: who2 ? who2.role : "", b:DEMO_LINES[i % DEMO_LINES.length], t:Date.now(), tab: tabs[i % tabs.length], dir, mk: dir ? "BTC 15M" : null});
  renderCortex();
  renderDock(); renderRailVoice();
}

// ---------- the cortex: trade floor chat, stream wall, roster ----------
const FTABS = [["main","Main floor"],["btc","BTC"],["eth","ETH"],["sol","SOL"],["xrp","XRP"],["kalshi","Kalshi"],["poly","Polymarket"],["ot","Off-topic"]];
S.cortex = false; S.ftab = "main"; S.fdir = null; S.streamers = {}; S.cxMedia = "video";
const fseen = Object.fromEntries(FTABS.map(([k]) => [k, Date.now()]));
const canStream = id => !!id && (isVerified(id) || !!S.streamers[id]);
function subscribeStreamers(){
  if(!db) return;
  db.collection("streamers").limit(1000).onSnapshot(s => { S.streamers = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderCortex(); }, () => {});
}
function allMsgs(){ return loungeMsgs().map(m => ({...m, tab: m.tab || "main"})); }
function cortexStreams(){
  if(S.demo) return liveList().concat(demoState.cortexLive || []);
  return S.streams.filter(s => s.status === "live" && (canStream(s.hostId) || (s.media === "screen" && spScreenOK()))).map(s => ({...s, hid:s.hostId, sec:s.section})).concat(db ? [] : S.localShares);
}
function roleBadges(id, as){
  const mc = id && !as ? catBadges(id) : "";
  if(as && as.k === "bot") return `<span class="rb bot">BOT</span>`;
  if(as && as.k === "script") return `<span class="rb scr">SCRIPT</span>`;
  let h = "";
  if(id && isVerified(id)) h += `<span class="rb cal">CALLER ✓</span>`;
  if(id && S.streams.some(s => s.status === "live" && s.hostId === id)) h += `<span class="rb lv">LIVE</span>`;
  else if(id && S.streamers[id]) h += `<span class="rb str">STREAMER</span>`;
  if(id && (S.botDocs[id] && Object.keys(S.botDocs[id].list||{}).length)) h += `<span class="rb bot">BOT DEV</span>`;
  if(id && (S.scDocs[id] && Object.keys(S.scDocs[id].list||{}).length)) h += `<span class="rb scr">SCRIPTER</span>`;
  return h + mc;
}
function roundChipHtml(){
  const nxt = curStart() + TF[S.tf];
  const t = tally(entriesFor(nxt).filter(e => valid(e, nxt))), tot = t.up + t.down, pct = tot ? Math.round(t.up/tot*100) : 0;
  return `<span>${S.asset} ${S.tf.toUpperCase()}</span><span>locks <b class="clk">${mmss(nxt - Date.now())}</b></span>${tot ? `<span class="u">▲${pct}%</span><span class="d">▼${100-pct}%</span>` : `<span>no calls</span>`}`;
}

// center preview (inside the triangle)
function renderCorex(){
  const M = allMsgs().slice(-5);
  $("cxMsgs").innerHTML = M.length ? M.map(m => `<span><b>${m.name ? esc(m.name) : m.as ? esc(m.as.n) : who(m.a)}</b> ${m.dir ? (m.dir === "up" ? "▲ " : "▼ ") : ""}${esc(m.b)}</span>`).join("")
    : `<span>The trade floor is quiet. Be the first to post.</span>`;
  const n = onlinePeople().length, air = cortexStreams().length;
  $("cxOn").textContent = `${n} online${air ? ` · ${air} live` : ""}`;
  fillNames($("cxMsgs"));
}

const DCH = {main:["main-floor","Everyone trades together here"], btc:["btc","Bitcoin rounds, levels and flow"], eth:["eth","Ether rounds and setups"], sol:["sol","Solana rounds and setups"], xrp:["xrp","XRP rounds and setups"],
  kalshi:["kalshi","Kalshi markets, pricing and edges"], poly:["polymarket","Polymarket markets and spreads"], ot:["off-topic","Anything that isn't a trade"], holders:["holders-lounge","Coin holders only: alpha, votes and perks"], streams:["live-streams","Caller, bot and script streams on air right now"], callers:["callers","Every verified caller, A to Z"]};
const DRX = [["fire","🔥"],["rocket","🚀"],["check","✅"],["x","❌"],["eyes","👀"],["money","💰"],["up","📈"],["down","📉"]];
const DROLE_C = {lv:"#FF4D6A", cal:"#FFB547", bot:"#4DA3FF", scr:"#B98CFF", str:"#DCE7EE"};
const DHASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3 7 21M17 3l-2 18M4 8.5h17M3 15.5h17"/></svg>';
const DLIVE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>';
const DSPK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
S.dReply = null; S.dPick = null; S.typing = null; S.dMem = true; S.dNav = null; S.dHub = null; S.dRx = {};
function roleKey(id, as, m){
  if(m && m.name) return /rb lv/.test(m.role || "") ? "lv" : /rb cal/.test(m.role || "") ? "cal" : /rb bot/.test(m.role || "") ? "bot" : /rb scr/.test(m.role || "") ? "scr" : /rb str/.test(m.role || "") ? "str" : "";
  if(as && as.k === "bot") return "bot"; if(as && as.k === "script") return "scr";
  if(!id) return "";
  if(S.streams.some(s => s.status === "live" && s.hostId === id)) return "lv";
  if(isVerified(id)) return "cal";
  if(S.botDocs[id] && Object.keys(S.botDocs[id].list||{}).length) return "bot";
  if(S.scDocs[id] && Object.keys(S.scDocs[id].list||{}).length) return "scr";
  if(S.streamers[id]) return "str";
  return "";
}
const dName = m => m.name ? `<span class="who">${esc(m.name)}</span>` : m.as ? `<span class="who">${esc(m.as.n)}</span>` : who(m.a);
const dAv = (m, cls) => m.name ? `<span class="av ${cls||""}" style="background:${m.color||"#4DA3FF"}"></span>` : avatar(m.a, cls);
function dDay(t){ const d = new Date(t), n = new Date(), y = new Date(Date.now() - 86400000);
  return d.toDateString() === n.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, {month:"long", day:"numeric", year:"numeric"}); }
function dText(b){
  let h = esc(b);
  h = h.replace(/(^|\s)@([\w.\-]{2,32})/g, (x, sp, n) => { const me = /^(everyone|here)$/i.test(n) || (S.myName && n.toLowerCase() === S.myName.toLowerCase().replace(/\s+/g,"")) || (S.demo && /^you$/i.test(n));
    return `${sp}<span class="mn${me ? " me" : ""}">@${n}</span>`; });
  h = h.replace(/(https:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  return h;
}
const mentionsMe = b => /(^|\s)@(everyone|here)\b/i.test(b) || (!!S.myName && new RegExp("(^|\\s)@" + S.myName.replace(/\s+/g,"").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(b)) || (S.demo && /(^|\s)@you\b/i.test(b));
function rxOf(m){ if(S.demo) return S.dRx[m.id] || {}; return m.rx || {}; }
function renderFloor(){
  const all = allMsgs(), mine = m => (S.demo ? m.name === "You (demo)" : m.a && m.a === meId);
  const inStreams = S.ftab === "streams", inCallers = S.ftab === "callers" || cxCat(S.ftab) === "dir", inML = S.ftab === "mlive";
  // text channels
  if(S.ftab === "holders" && !canHolders()) S.ftab = "main";
  if(!cxValidTab(S.ftab)) S.ftab = "main";
  $("ftabs").innerHTML = cxTextTabs().filter(([k]) => k !== "holders" || canHolders()).map(([k]) => {
    const unread = k === S.ftab ? [] : all.filter(m => m.tab === k && m.t > fseen[k] && !mine(m)), men = unread.filter(m => mentionsMe(m.b)).length;
    return `<button class="dchn${unread.length ? " ur" : ""}" type="button" role="tab" data-ftab="${k}" aria-selected="${S.ftab === k}">${DHASH}<span class="nm">${esc(DCH[k][0])}</span>${k === "holders" ? `<span class="lv" style="background:#FFD166;color:#05080C">HOLD</span>` : ""}${men ? `<span class="bdg">${men}</span>` : unread.length ? `<span class="bdg n">${unread.length > 99 ? "99+" : unread.length}</span>` : ""}</button>`; }).join("");
  const air = cortexStreams().length;
  $("dStreamCh").innerHTML = (cxHidden("l:streams") ? "" : `<button class="dchn" type="button" data-ftab="streams" aria-selected="${inStreams && S.dHub !== "members"}">${DLIVE}<span class="nm">live-streams</span>${air ? `<span class="lv">${air} LIVE</span>` : ""}</button>`) + cxCustomRows("live");
  $("dDirCh").innerHTML = (cxHidden("d:callers") ? "" : `<button class="dchn" type="button" data-ftab="callers" aria-selected="${S.ftab === "callers"}" style="--c:var(--callers)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.8-3.4 3.2-5.2 6.2-5.2s5.4 1.8 6.2 5.2"/><path d="M15.5 4.9a3.3 3.3 0 0 1 0 6.3M17.7 14.6c1.8.6 3 2.2 3.5 4.9"/></svg><span class="nm">callers</span><span class="bdg n" style="background:var(--callers)">${callerDir().length}</span></button>`) + cxCustomRows("dir");
  cxMLiveSide(); cxDecorate();
  document.querySelectorAll(".dsrv .dsv").forEach(x => x.classList.toggle("on", x.classList.contains("home") ? !inStreams && !inCallers : inStreams && x.dataset.dhub === S.dHub));
  $("dChName").innerHTML = esc(DCH[S.ftab][0]); $("floorSub").textContent = DCH[S.ftab][1];
  $("dHash").innerHTML = inStreams || inML ? DLIVE : inCallers ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.8-3.4 3.2-5.2 6.2-5.2s5.4 1.8 6.2 5.2"/><path d="M15.5 4.9a3.3 3.3 0 0 1 0 6.3M17.7 14.6c1.8.6 3 2.2 3.5 4.9"/></svg>' : DHASH;
  $("dStreams").hidden = !inStreams; $("dCallers").hidden = !inCallers; $("dMLive").hidden = !inML; $("floor").hidden = inStreams || inCallers || inML;
  if(inML){ cxRenderMLive(); renderFloor.lastTab = S.ftab; return; }
  if(inCallers){ renderCallerDir(); renderFloor.lastTab = S.ftab; return; }
  $("floorRound").innerHTML = roundChipHtml();
  if(inStreams){ renderFloor.lastTab = S.ftab; return; }
  cxLivePlayer();
  const lastSeen = fseen[S.ftab]; fseen[S.ftab] = Date.now();
  const box = $("fmsgs"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const M = all.filter(m => m.tab === S.ftab), byId = Object.fromEntries(all.map(m => [m.id, m]));
  let html = (S.ftab === "main" && (S.cxCfg || {}).pin ? `<div class="dpin"><b>PINNED</b>${dText(S.cxCfg.pin)}</div>` : "") + `<div class="dwel"><div class="ic">${DHASH}</div><h3>Welcome to #${esc(DCH[S.ftab][0])}!</h3><p>${esc(DCH[S.ftab][1])}. This is the start of the channel.</p></div>`;
  let prev = null, newShown = renderFloor.lastTab === S.ftab;
  for(const m of M){
    const key = m.name || (m.as ? "as:" + m.as.id : m.a);
    const day = dDay(m.t);
    if(!prev || dDay(prev.t) !== day) html += `<div class="ddiv">${esc(day === "Today" || day === "Yesterday" ? day + ", " + new Date(m.t).toLocaleDateString(undefined,{month:"long",day:"numeric"}) : day)}</div>`;
    if(!newShown && m.t > lastSeen && !mine(m)){ html += `<div class="ddiv new">NEW</div>`; newShown = true; }
    const first = !prev || prevKey(prev) !== key || m.t - prev.t > 7*60000 || dDay(prev.t) !== day || m.re;
    const rk = roleKey(m.a, m.as, m), nc = rk ? `style="--nc:${DROLE_C[rk]}"` : (m.name ? `style="--nc:${m.color}"` : "");
    const rx = rxOf(m), rxh = DRX.map(([k, e]) => { const u = rx[k] || {}, n = Object.values(u).filter(Boolean).length; if(!n) return ""; const me = S.demo ? !!u.me : !!u[meId];
      return `<button type="button" data-drx="${esc(m.id)}|${k}" aria-pressed="${me}" title="${k}"><span class="e">${e}</span>${n}</button>`; }).join("");
    const canDel = !S.demo && (m.a === meId || isAdmin || hasCat(meId, "mod"));
    const tools = `<div class="dtools"><button type="button" data-dpick="${esc(m.id)}" title="Add reaction">☺</button><button type="button" data-drep="${esc(m.id)}" title="Reply">↩</button>${canDel ? `<button class="del" type="button" data-lmdel="${esc(m.hour)}|${esc(m.id)}" title="Delete">✕</button>` : ""}</div>`;
    const pick = S.dPick === m.id ? `<div class="dpick">${DRX.map(([k, e]) => `<button type="button" data-drx="${esc(m.id)}|${k}" title="${k}">${e}</button>`).join("")}</div>` : "";
    const q = m.re ? (() => { const o = byId[m.re.id]; const src = o || m.re; return `<div class="drq" data-djump="${esc(m.re.id)}">${o ? dAv(o, "sm") : ""}<b ${o && roleKey(o.a, o.as, o) ? `style="color:${DROLE_C[roleKey(o.a, o.as, o)]}"` : ""}>${o ? dName(o) : esc(m.re.n || "a message")}</b><span class="q">${esc((src.b || "").slice(0, 120)) || "Original message was deleted"}</span></div>`; })() : "";
    const body = `<div class="tx">${m.dir ? `<span class="tchip ${m.dir}">${m.dir === "up" ? "▲ UP" : "▼ DOWN"}${m.mk ? " " + esc(m.mk) : ""}</span>` : ""}${dText(m.b)}</div>${rxh ? `<div class="drx">${rxh}</div>` : ""}`;
    const cls = `dmsg${first ? " first" : ""}${mentionsMe(m.b) ? " ment" : ""}${S.dPick === m.id ? " pick" : ""}`;
    html += first
      ? `<div class="${cls}" id="dm-${esc(m.id)}" ${nc}>${q}${dAv(m)}<div><div class="dmh2">${dName(m)}${m.as ? ` <small>via ${who(m.a)}</small>` : ""}${m.name ? (m.role || "") : roleBadges(m.a, m.as)}<time>${esc(day)} at ${esc(tLocal(m.t))}</time></div>${body}</div>${tools}${pick}</div>`
      : `<div class="${cls}" id="dm-${esc(m.id)}"><span class="gut">${esc(tLocal(m.t))}</span><div>${body}</div>${tools}${pick}</div>`;
    prev = m;
  }
  function prevKey(p){ return p.name || (p.as ? "as:" + p.as.id : p.a); }
  box.innerHTML = html;
  if(atBottom || renderFloor.lastTab !== S.ftab) box.scrollTop = box.scrollHeight;
  renderFloor.lastTab = S.ftab;
  // post-as
  const sel = $("fAs"), keep = sel.value;
  const bots = meId ? myBots() : [], scs = meId ? myScripts() : [];
  sel.innerHTML = `<option value="me|">As me</option>` + bots.map(b => `<option value="bot|${esc(b.id)}">Bot: ${esc(b.name)}</option>`).join("") + scs.map(c => `<option value="script|${esc(c.id)}">Script: ${esc(c.name)}</option>`).join("");
  if([...sel.options].some(o => o.value === keep)) sel.value = keep;
  sel.hidden = !bots.length && !scs.length;
  document.querySelectorAll("[data-fdir]").forEach(b => b.setAttribute("aria-pressed", S.fdir === b.dataset.fdir));
  const can = S.demo || (!!db && !!meId && canWrite);
  $("fform").hidden = !can;
  $("fin").placeholder = `Message #${DCH[S.ftab][0]}`;
  const r = S.dReply && byId[S.dReply];
  $("dReply").hidden = !r || !can;
  if(r) $("dReply").innerHTML = `Replying to <b>${r.name ? esc(r.name) : r.as ? esc(r.as.n) : who(r.a)}</b><button type="button" data-drep="" title="Cancel reply">✕</button>`;
  $("fnote").textContent = can ? `▲/▼ tags a trade on ${marketFor(S.ftab)} · @name to mention · hover a message to react or reply` : "Sign in with Contributor access to post.";
  renderTyping();
  fillNames(box); if(r) fillNames($("dReply"));
}
const marketFor = tab => ({btc:"BTC", eth:"ETH", sol:"SOL", xrp:"XRP"})[tab] ? `${({btc:"BTC", eth:"ETH", sol:"SOL", xrp:"XRP"})[tab]} ${S.tf.toUpperCase()}` : `${S.asset} ${S.tf.toUpperCase()}`;
function renderTyping(){
  const el = $("dTyping"); if(!el || !S.cortex) return;
  let names = [];
  if(S.demo){ const c = Math.floor(Date.now()/1000) % 24; if(c < 5 && S.ftab === "main") names = ["gridlord (demo)"]; else if(c >= 12 && c < 15 && S.ftab === "main") names = ["Nova (demo)", "Kai Tides (demo)"]; names = names.map(n => `<b>${esc(n)}</b>`); }
  else names = onlinePeople().filter(p => p.id !== meId && p.ty && p.ty.split("|")[0] === S.ftab && Date.now() - +p.ty.split("|")[1] < 7000).map(p => `<b>${who(p.id)}</b>`);
  el.innerHTML = names.length ? `<span class="dots"><i></i><i></i><i></i></span><span>${names.length > 3 ? "Several people are" : names.join(names.length === 2 ? " and " : ", ") + (names.length > 1 ? " are" : " is")} typing…</span>` : "";
  fillNames(el);
}
function renderRoster(){
  let people = onlinePeople();
  if(!S.demo){
    const recent = allMsgs().filter(m => m.a && m.t > Date.now() - 30*60000).map(m => m.a);
    for(const id of recent) if(!people.some(p => p.id === id)) people.push({id, recent:true});
  }
  const rk = p => p.name ? roleKey(null, null, {name:p.name, role:p.role}) : roleKey(p.id);
  const G = [["lv","Live now"],["cal","Callers"],["bot","Bot devs"],["scr","Scripters"],["str","Streamers"],["","Online"]];
  const on = people.filter(p => !p.recent), rec = people.filter(p => p.recent);
  $("cxRosterN").textContent = `— ${on.length}`; $("cxOnline").textContent = on.length;
  const row = p => {
    const k = rk(p), av = p.name ? `<span class="av" style="background:${p.color}"></span>` : avatar(p.id);
    const nm = p.name ? `<span class="who">${esc(p.name)}</span>` : who(p.id);
    const where = p.recent ? "Recently in chat" : p.voice ? `🔊 In ${voiceName(p.voice)} voice` : p.live || k === "lv" ? "Streaming now" : `Browsing ${SECTIONS[p.sec]?.name || "D3MON.CO"}`;
    const adminCtl = isAdmin && !S.demo && p.id && p.id !== meId && !isVerified(p.id) ? (S.streamers[p.id] ? `<button class="xbtn2" type="button" data-unstream="${esc(p.id)}">Revoke stream</button>` : `<button class="xbtn2" type="button" data-allowstream="${esc(p.id)}">Allow stream</button>`) : "";
    return `<div class="dmm${p.recent ? " recent" : ""}" ${k ? `style="--nc:${DROLE_C[k]}"` : ""}><span class="avw">${av}${p.recent ? "" : `<i class="sdot${p.voice ? " vo" : k === "lv" ? " lv" : ""}"></i>`}</span><div class="nm">${nm}<small>${esc(where)}</small></div>${adminCtl}</div>`;
  };
  let h = "";
  for(const [k, l] of G){ const g = on.filter(p => rk(p) === k); if(g.length) h += `<p class="dmg">${esc(l)} — ${g.length}</p>` + g.map(row).join(""); }
  if(rec.length) h += `<p class="dmg">Recently active — ${rec.length}</p>` + rec.map(row).join("");
  $("cxRoster").innerHTML = h || `<div class="cempty" style="padding:14px">${roomApi ? "Just you so far." : "Presence isn't available in this view."}</div>`;
  fillNames($("cxRoster"));
}
function renderDMe(){
  $("dDisc").innerHTML = "";
  const me = S.demo ? {name:"You (demo)", color:"#2EE59D"} : null;
  const av = me ? `<span class="av" style="background:${me.color}"></span>` : avatar(meId);
  const st = S.inVoice ? `In ${voiceName(S.inVoice)} voice` : cortexStreams().some(s => s.hostId && s.hostId === meId) ? "Streaming" : "Online";
  $("dMe").innerHTML = `<span class="avw">${av}<i class="sdot${S.inVoice ? " vo" : ""}"></i></span><div class="nm">${me ? `<span class="who">${esc(me.name)}</span>` : meId ? who(meId) : `<span class="who">Guest</span>`}<small>${esc(st)}</small></div>`;
  fillNames($("dMe"));
  if(!S.myName && user && meId && !S.demo && !renderDMe.asked){ renderDMe.asked = true; user.profiles([meId]).then(ps => { const p = ps && ps[meId]; if(p && p.name){ S.myName = p.name; if(S.cortex) renderFloor(); } }).catch(() => {}); }
  const v = S.inVoice;
  $("dVoiceBar").hidden = true; if(false)
  if(v) $("dVoiceBar").innerHTML = `<div class="t">Voice connected<small>${esc(voiceName(v))} · D3MON.CO</small></div><button type="button" data-vleave title="Disconnect">✕</button>`;
}
S.cxCalls = {}; S.cxCallsLocal = {};
const cxR15 = () => Math.floor(Date.now() / 900000) * 900000;
function cxNC(){ return Math.max(1, Math.min(6, +(((S.cxCfg || {}).top || {}).nc) || 1)); }
function cxPicked(){ return Object.entries((S.cxCfg || {}).callers || {}).filter(([, v]) => v && v.name).map(([key, v]) => ({key, hid:v.hid || "", name:v.name, t:v.t || 0})).sort((a, b) => a.t - b.t); }
function cxPeopleOpts(){ const m = new Map(), add = (hid, name) => { if(!name) return; const key = hid || "n_" + slug(name); if(!m.has(key)) m.set(key, {key, hid:hid || "", name}); };
  if(S.demo || !db){ (S.demoPeers || []).filter(p => !p.me).forEach(p => add("", p.name)); ((typeof demoState !== "undefined" && demoState && demoState.callers) || []).forEach(c => add("", c.name)); }
  else { Object.keys(S.verified || {}).forEach(id => add(id, S.nameCache[id] || "Member")); onlinePeople().forEach(p => p.id && add(p.id, S.nameCache[p.id] || p.name || "Member")); }
  const have = new Set(cxPicked().map(x => x.key)); return [...m.values()].filter(x => !have.has(x.key)).sort((a, b) => a.name.localeCompare(b.name)); }
function cxAssignedAll(){ // admin-picked members first, then any caller stream put in a Cortex Caller window
  const all = cortexStreams(), top = (S.cxCfg || {}).top || {}, callers = all.filter(x => kindOfStream(x) === "caller"), out = [];
  cxPicked().forEach(p => out.push({slot:out.length + 1, sid:"", hid:p.hid, name:p.name, key:p.key, pick:true}));
  for(let i = 0; i < cxNC(); i++){ const k = i ? "caller" + (i + 1) : "caller";
    const s = S.demo ? callers[i] : (top[k] ? all.find(x => x.id && x.id === top[k]) : null); if(!s) continue;
    const hid = s.hostId || s.hid || "", name = (hid && S.nameCache[hid]) || s.who || "Caller", key = hid || "n_" + slug(name);
    const ex = out.find(o => o.key === key); if(ex){ if(!ex.sid) ex.sid = s.id || s.title || ""; } else out.push({slot:out.length + 1, sid:s.id || s.title || "", hid, name, key}); }
  return out;
}
function cxCallFor(A){ const c = ((S.demo || !db) ? S.cxCallsLocal : S.cxCalls)[A.key]; return c && +c.round === cxR15() ? c : null; }
function cxAdmin(){ return (isAdmin && !S.demo) || !db; }
function cxCanCallFor(A){ return S.demo || !db || isAdmin || (!!meId && A.hid === meId); }
function cxCallSig(){ return cxAssignedAll().map(A => { const c = cxCallFor(A); return A.key + ":" + (c ? c.d + c.t : ""); }).join(","); }
function cxCallBadge(s){ const A = cxAssignedAll().find(a => a.sid === (s.id || s.title || "")); const c = A && cxCallFor(A); return c ? `<span class="cxpcall ${c.d === "up" ? "up" : "dn"}">${c.d === "up" ? "▲ UP" : "▼ DOWN"}</span>` : ""; }
async function cxPostCall(key, d){
  const A = cxAssignedAll().find(a => a.key === key); if(!A || !cxCanCallFor(A)) return;
  const cur = cxR15(), entry = {hid:A.hid, name:A.name, d, round:cur, t:Date.now(), by:meId || "you"};
  if(S.demo || !db) S.cxCallsLocal = {...S.cxCallsLocal, [key]:entry};
  else { if(!canWrite){ toast("Sign in with Contributor access to post your call."); return; } S.cxCalls = {...S.cxCalls, [key]:entry}; if(!(await act(() => mergeWrite(db.doc("cxcall/" + key), entry)))) return; }
  toast(`${meId && A.hid === meId ? "Your call" : A.name}: ${d === "up" ? "▲ UP" : "▼ DOWN"} for the ${tLocal(cur)} round`);
  cxCallPaint(); renderCxTop(); cxAdmRefresh();
}
function cxCallPaint(){
  const fm = $("fmsgs"); if(!fm) return; let w = $("cxCallWin");
  const AS = cxAssignedAll();
  if(!w){ w = document.createElement("div"); w.id = "cxCallWin"; w.className = "cxcallw"; fm.parentElement.insertBefore(w, fm); }
  const adm = cxAdmin(), addRow = adm ? `<div class="cxcadd"><select id="cxcAddSel" aria-label="Grant the Cortex Call privilege"><option value="">＋ Grant Cortex Call privilege to…</option>${cxPeopleOpts().map(o => `<option value="${esc(o.key)}|${esc(o.hid)}|${esc(o.name)}">${esc(o.name)}</option>`).join("")}</select><small>members with the Cortex Call privilege post their own ▲/▼ call here · resets every 15 minutes</small></div>` : "";
  if(!AS.length){ const h0 = `<div class="hd"><span class="lb">🎙 CORTEX CALL</span><span class="rd">Round ${esc(tLocal(cxR15()))}</span></div><div class="cxcempty">${adm ? "No one has the Cortex Call privilege yet. Grant it below; those members get ▲ UP / ▼ DOWN buttons right here in their chat." : "No Cortex Call right now. Members with the Cortex Call privilege post their ▲ UP / ▼ DOWN call here."}</div>${addRow}`;
    if(w.dataset.sig !== h0){ w.dataset.sig = h0; w.innerHTML = h0; } return; }
  const cur = cxR15(), multi = AS.length > 1;
  const rows = AS.map(A => { const c = cxCallFor(A), self = !!meId && A.hid === meId, can = cxCanCallFor(A);
    return `<div class="cr${self ? " me" : ""}"><span class="nm">${multi ? `<em>${A.slot}</em>` : ""}${esc(A.name)}${self ? ` <small>you · your Cortex Call</small>` : ""}</span>
      <span class="cv">${c ? `<b class="${c.d === "up" ? "up" : "dn"}">${c.d === "up" ? "▲ UP" : "▼ DOWN"}</b><small>${esc(new Date(c.t).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}))}</small>` : `<i>${self ? "Waiting for your call…" : "Waiting for call…"}</i>`}</span>
      ${can || adm ? `<span class="ci">${can ? `<button type="button" class="cxcb up${c && c.d === "up" ? " on" : ""}" data-cxcall="${esc(A.key)}|up" title="${self ? "Your call" : "Post for " + esc(A.name)}">▲ UP</button><button type="button" class="cxcb dn${c && c.d === "down" ? " on" : ""}" data-cxcall="${esc(A.key)}|down" title="${self ? "Your call" : "Post for " + esc(A.name)}">▼ DOWN</button>` : ""}${adm && A.pick ? `<button type="button" class="cxcrm" data-cxcrm="${esc(A.key)}" title="Remove ${esc(A.name)}'s Cortex Call privilege" aria-label="Remove ${esc(A.name)}">✕</button>` : ""}</span>` : ""}</div>`; }).join("");
  const h = `<div class="hd"><span class="lb">🎙 CORTEX CALL${multi ? "S" : ""}</span><span class="rd">Round ${esc(tLocal(cur))} · ends in <b class="cxccl">${mmss(cur + 900000 - Date.now())}</b></span></div><div class="rows">${rows}</div>${addRow}`;
  const sig = h.replace(/<b class="cxccl">[^<]*<\/b>/, "");
  if(w.dataset.sig !== sig){ w.dataset.sig = sig; w.innerHTML = h; } else { const k = w.querySelector(".cxccl"); if(k) k.textContent = mmss(cur + 900000 - Date.now()); }
}
document.addEventListener("change", e => { const sel = e.target.closest("#cxcAddSel, .cxcAddSel"); if(!sel || !sel.value) return; if(!cxAdmin() && !(S.adminPage && isAdmin)) return;
  const [key, hid, ...nm] = sel.value.split("|"); cxSaveCfg({callers:{[key]:{hid, name:nm.join("|"), t:Date.now()}}}, "Cortex Call privilege granted").then(() => { cxCallPaint(); cxAdmRefresh(); }); });
document.addEventListener("click", e => { const x = e.target.closest("[data-cxcrm]"); if(!x || (!cxAdmin() && !(S.adminPage && isAdmin))) return; cxSaveCfg({callers:{[x.dataset.cxcrm]:null}}, "Cortex Call privilege removed").then(() => { cxCallPaint(); cxAdmRefresh(); }); });
document.addEventListener("click", e => { const b = e.target.closest("[data-cxcall]"); if(!b) return; const v = b.dataset.cxcall, i = v.lastIndexOf("|"); cxPostCall(v.slice(0, i), v.slice(i + 1)); });
setInterval(() => { if(!S.cortex) return; const r = cxR15(); if(cxCallPaint.r !== r){ cxCallPaint.r = r; renderCxTop(); } cxCallPaint(); }, 1000);
function renderCortex(){
  document.body.classList.toggle("cortexmode", S.cortex);
  $("cortex").hidden = !S.cortex;
  renderCorex();
  if(!S.cortex) return;
  $("cxRound").innerHTML = roundChipHtml(); cxGateBanner(); cxAdmBtn();
  $("cxGoBtn").hidden = S.demo || !db || !canStream(meId) || !canWrite || cortexStreams().some(s => s.hostId === meId);
  $("cxShareBtn").hidden = !spScreenOK() || (!!db && !S.demo && (!meId || !canWrite)) || cortexStreams().some(s => s.hostId === meId || (!db && s.local));
  $("dcf").classList.toggle("nomem", !S.dMem); $("dMemBtn").setAttribute("aria-pressed", S.dMem);
  renderCxWall(); renderCxVoice(); renderFloor(); renderRoster(); renderDMe(); cxCallPaint();
}
function dToggleRx(id, k){
  if(S.demo){ const r = S.dRx[id] = S.dRx[id] || {}; const u = r[k] = r[k] || {}; u.me = !u.me; renderFloor(); return; }
  const m = allMsgs().find(x => x.id === id); if(!m || !db || !meId) return;
  const had = !!(m.rx && m.rx[k] && m.rx[k][meId]);
  act(() => db.doc("lounge/" + m.hour).update({msgs:{[id]:{rx:{[k]:{[meId]: !had}}}}}));
}
// ---- Cortex open / closed gate ----
const cxClosed = () => !!(S.cxCfg || {}).closed;
const cxAdm = () => !!isAdmin || !db;
function cxReopenTxt(){ const t = +(S.cxCfg || {}).reopenAt || 0; return t && t > Date.now() ? `Opens again ${fmtPT(t)}` : ""; }
function cxGateSync(){
  const c = cxClosed(), g = $("cxGate"), b = $("corex");
  if(g){ g.className = "cxgate " + (c ? "closed" : "open"); g.textContent = c ? "🔒 CLOSED" : "● OPEN"; g.title = c ? (cxReopenTxt() || "Closed by the admins") : "Open now"; }
  if(b){ b.classList.toggle("closed", c); b.setAttribute("aria-label", c ? "The Live Trade Cortex is closed right now" : "Enter the Live Trade Cortex chat"); }
  if(c && S.cortex && !cxAdm()){ openCortex(false); cxClosedNote(); }
  if(S.cortex) cxGateBanner();
  if(S.adminPage && (S.apTab === "cxgate" || S.apTab === "cxall")){ renderAdmin.lastTab = null; renderAdmin(); }
}
function cxClosedNote(){
  const old = $("cxClosedOv"); if(old) old.remove();
  const C = S.cxCfg || {}, ov = document.createElement("div"); ov.id = "cxClosedOv"; ov.className = "cxclosedov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "The Cortex is closed");
  ov.innerHTML = `<div class="cxcbox"><div class="cxclock">🔒</div><h3>The Cortex is closed</h3><p>${esc(C.closedMsg || "The Live Trade Cortex is closed right now. Check back soon.")}</p>${cxReopenTxt() ? `<div class="cxwhen">${esc(cxReopenTxt())}</div>` : ""}<button class="btn sm" type="button" data-cxok>OK</button></div>`;
  document.body.appendChild(ov); ov.addEventListener("click", e => { if(e.target === ov || e.target.closest("[data-cxok]")) ov.remove(); });
  setTimeout(() => { const b = ov.querySelector("[data-cxok]"); if(b) b.focus(); }, 30);
}
function cxAdmBtn(){ const mb = $("dMemBtn"); if(!mb) return; let b = $("cxAdmBtn"); const show = (isAdmin && !S.demo) || !db;
  if(!show){ if(b) b.remove(); return; }
  if(!b){ b = document.createElement("button"); b.id = "cxAdmBtn"; b.type = "button"; b.className = "cxadmbtn"; b.title = "All Cortex controls (admin)"; b.innerHTML = "⚙ Cortex controls"; mb.parentElement.insertBefore(b, mb);
    b.addEventListener("click", () => { openAdmin(true); S.apTab = "cxall"; renderAdmin.lastTab = null; renderAdmin(); }); } }
function cxGateBanner(){
  const box = $("cortex"); if(!box) return; let bn = $("cxGateBn");
  if(!(cxClosed() && cxAdm())){ if(bn) bn.remove(); return; }
  if(!bn){ bn = document.createElement("div"); bn.id = "cxGateBn"; bn.className = "cxgatebn"; box.prepend(bn); }
  bn.innerHTML = `<span>🔒 <b>The Cortex is CLOSED to members.</b> You can see it because you're an admin.${cxReopenTxt() ? " " + esc(cxReopenTxt()) + "." : ""}</span><button class="btn sm" type="button" data-cxgate="open">Open it now</button>`;
}
async function cxGateSet(patch, msg){
  S.cxCfg = {...(S.cxCfg || {}), ...patch}; cxGateSync();
  if(!db){ toast((msg || "Saved") + " (preview only)"); return; }
  await apSave("config/cortex", patch, msg);
}
document.addEventListener("click", e => {
  const g = e.target.closest("[data-cxgate]"); if(!g) return;
  const k = g.dataset.cxgate;
  if(k === "open") cxGateSet({closed:false, reopenAt:0}, "The Cortex is OPEN");
  else if(k === "close") cxGateSet({closed:true, closedMsg:apV("cg_msg"), reopenAt:apV("cg_when") ? new Date(apV("cg_when")).getTime() : 0}, "The Cortex is CLOSED");
  else if(k === "save") cxGateSet({closedMsg:apV("cg_msg"), reopenAt:apV("cg_when") ? new Date(apV("cg_when")).getTime() : 0}, "Closed message saved");
  else if(k === "preview") cxClosedNote();
});
function cxAdmRefresh(){ if(S.adminPage && S.apTab === "cxall"){ renderAdmin.lastTab = null; renderAdmin(); } }
function dcAdminTab(){
  const C = S.dchatCfg || {}, ok = C.ok || {}, reqs = dcReqList(), pend = reqs.filter(r => !ok[dcPair(r)] && r.status !== "declined"), dec = reqs.filter(r => !ok[dcPair(r)] && r.status === "declined");
  const where = r => `${r.channel ? "channel " + esc(r.channel) : "server widget"} · server ${esc(r.server)}`;
  const prev = r => S.dcPrev === dcPair(r) ? `<div class="dcprev" style="margin-top:8px">${dchatHtml({dchat:{...r, on:true}}, true)}</div>` : "";
  const row = (r, acts) => `<div class="arow" style="flex-wrap:wrap"><span class="adot" style="--c:#8C95FF"></span><div class="t"><b>${esc(r.name || "Member")}</b> · ${esc(r.title || "Discord chat")}<small>${where(r)} · asked ${esc(ago(r.t || Date.now()))}</small></div><div class="aacts">${acts}</div>${prev(r)}</div>`;
  const prevBtn = r => `<button class="btn ghost sm" type="button" data-dcprev="${esc(dcPair(r))}">${S.dcPrev === dcPair(r) ? "Hide preview" : "Preview"}</button>`;
  const approvedRows = Object.entries(ok).filter(([, a]) => a).map(([pair, a]) => { const [server, channel] = pair.split("/"); return row({server, channel, name:a.name, title:a.title, t:a.t}, `${prevBtn({server, channel})}<button class="xbtn2" type="button" data-dcrevoke="${esc(pair)}">Revoke</button>`); }).join("");
  const DD = ddCfg(), ddLink = DD.server ? (DD.channel ? `https://discord.com/channels/${DD.server}/${DD.channel}` : DD.server) : "";
  return `<div class="acard"><h3>Demon Discord <small>the window under the HardSmoke window on the main page</small></h3>
      <p class="hint">Paste the link to the Discord channel to show (right-click the channel → Copy Link). It shows your real channel, live: posts made on the site land in Discord and Discord messages show on the site. Add the free WidgetBot bot to your server once for live chat; a server ID alone shows Discord's server widget.</p>
      <div class="aform"><div class="af w"><label for="dd_link">Discord channel link or server ID</label><input id="dd_link" value="${esc(ddLink)}" placeholder="https://discord.com/channels/123456789012345678/234567890123456789"></div>
        <div class="af"><label for="dd_title">Window title</label><input id="dd_title" maxlength="40" value="${esc(DD.title)}" placeholder="Demon Discord"></div>
        <div class="af"><label for="dd_ch">Channel name to show (optional)</label><input id="dd_ch" maxlength="40" value="${esc(DD.chName)}" placeholder="btc-15m-calls"></div>
        <div class="af w"><label for="dd_inv">Invite link for the Join button (optional)</label><input id="dd_inv" value="${esc(DD.invite)}" placeholder="https://discord.gg/…"></div></div>
      <label class="atog"><input type="checkbox" id="dd_on" ${DD.on ? "checked" : ""}>Show the Demon Discord window on the main page</label>
      <div class="aacts"><button class="btn sm" type="button" data-ddsave>Save Demon Discord</button></div></div>
    <div class="acard"><h3>Discord chats on profiles <small>callers, bot owners and script owners</small></h3>
      <p class="hint">Members paste a Discord channel link in My D3MON → My profile. It only shows on their profile after you approve it here. The chat is two-way: posts made on the profile land in their Discord channel and Discord messages show on the profile (viewers sign in with Discord inside the chat). Live chat needs the free WidgetBot bot on their server; a server ID alone shows Discord's server widget.</p>
      <label class="atog"><input type="checkbox" id="dc_siteon" ${C.off ? "" : "checked"}>Allow approved Discord chats to show on profiles</label>
      <div class="aacts"><button class="btn sm" type="button" data-dcsite>Save</button></div></div>
    <div class="acard"><h3>Waiting for approval <small>${pend.length}</small></h3><div class="alist">${pend.length ? pend.map(r => row(r, `${prevBtn(r)}<button class="btn sm" type="button" data-dcok="${esc(r.uid)}">Approve</button><button class="btn ghost sm" type="button" data-dcno="${esc(r.uid)}">Decline</button>`)).join("") : `<div class="aempty">No Discord chat requests right now.</div>`}</div></div>
    <div class="acard"><h3>Approved <small>${Object.values(ok).filter(Boolean).length} live on profiles</small></h3><div class="alist">${approvedRows || `<div class="aempty">None approved yet.</div>`}</div></div>
    ${dec.length ? `<div class="acard"><h3>Declined <small>${dec.length}</small></h3><div class="alist">${dec.map(r => row(r, `${prevBtn(r)}<button class="btn sm" type="button" data-dcok="${esc(r.uid)}">Approve instead</button>`)).join("")}</div></div>` : ""}`;
}
async function dcSaveCfg(patch, msg){ S.dchatCfg = cxDeep(S.dchatCfg || {}, patch);
  if(!db){ toast((msg || "Saved") + " (preview only)"); } else if(!(await apSave("config/dchat", patch, msg))) return;
  if(S.adminPage){ renderAdmin.lastTab = null; renderAdmin(); } if(S.mePage){ renderMe.lastTab = null; renderMe(); } }
document.addEventListener("click", async e => {
  if(!e.target.closest("[data-ddsave]")) return; if(!isAdmin && db) return toast("Only admins can do that.");
  const p = dchatParse($("dd_link").value); if(p.err) return toast(p.err); const inv = ($("dd_inv").value || "").trim(); if(inv && !/^https:\/\//.test(inv)) return toast("The invite link needs to start with https://");
  const patch = {ddServer:p.server || "", ddChannel:p.channel || "", ddTitle:($("dd_title").value || "").trim().slice(0, 40) || "Demon Discord", ddChName:($("dd_ch").value || "").trim().replace(/^#/, "").slice(0, 40), ddInvite:inv, ddOn:!!$("dd_on").checked};
  S.site = {...(S.site || {}), ...patch}; renderDemonDisc.sig = null; renderDemonDisc();
  if(!db) toast("Saved (preview only)"); else await apSave("config/site", patch, "Demon Discord saved");
  renderAdmin.lastTab = null; renderAdmin(); });
document.addEventListener("click", async e => {
  const t = e.target, pv = t.closest("[data-dcprev]"); if(pv){ S.dcPrev = S.dcPrev === pv.dataset.dcprev ? null : pv.dataset.dcprev; renderAdmin.lastTab = null; renderAdmin(); return; }
  if(!(isAdmin || !db)) { if(t.closest("[data-dcok],[data-dcno],[data-dcrevoke],[data-dcsite]")) toast("Only admins can do that."); return; }
  const okb = t.closest("[data-dcok]"); if(okb){ const r = dcReqList().find(x => x.uid === okb.dataset.dcok); if(!r) return;
    await dcSaveCfg({ok:{[dcPair(r)]:{uid:r.uid, name:r.name || "", title:r.title || "", t:Date.now()}}}, `Approved · ${r.name || "member"}'s Discord chat is live`);
    if(S.demo || !db){ S.dcReqLocal = {...S.dcReqLocal, [r.uid]:{...r, status:"approved"}}; } else await act(() => mergeWrite(db.doc("dcreq/" + r.uid), {status:"approved"})); renderAdmin.lastTab = null; renderAdmin(); return; }
  const no = t.closest("[data-dcno]"); if(no){ const uid = no.dataset.dcno, r = dcReqList().find(x => x.uid === uid); if(!r) return;
    if(S.demo || !db){ S.dcReqLocal = {...S.dcReqLocal, [uid]:{...r, status:"declined"}}; toast("Declined (preview only)"); } else if(await act(() => mergeWrite(db.doc("dcreq/" + uid), {status:"declined"}))) toast("Declined");
    renderAdmin.lastTab = null; renderAdmin(); return; }
  const rv = t.closest("[data-dcrevoke]"); if(rv){ await dcSaveCfg({ok:{[rv.dataset.dcrevoke]:null}}, "Approval revoked · removed from the profile"); return; }
  if(t.closest("[data-dcsite]")){ await dcSaveCfg({off:!$("dc_siteon").checked}, $("dc_siteon").checked ? "Discord chats allowed on profiles" : "Discord chats hidden on all profiles"); return; }
});
function cxAllTab(){
  const all = cortexStreams(), top = (S.cxCfg || {}).top || {}, NC = cxNC(), cx = S.cxCfg || {}, tp = cx.topics || {};
  const byKind = k => all.filter(x => kindOfStream(x) === k), sName = s => (s.title || "Live stream") + (s.who ? " · " + s.who : "");
  const slot = (k, label, kind, color, rm) => { const L = byKind(kind), cur = top[k] || "", s = cur ? all.find(x => x.id === cur) : null;
    return `<div class="cxaslot" style="--c:${color}"><div class="h"><b>${label}</b>${s ? `<span class="on">● ON</span>` : `<span class="off">off</span>`}${rm ? `<button class="xbtn2" type="button" data-cxslot="rm:${k}">Remove</button>` : ""}</div>
      <select data-cxpick="${k}" aria-label="Stream for ${label}"><option value="">None</option>${[...L, ...all.filter(x => !L.includes(x))].filter(x => x.id).map(x => `<option value="${esc(x.id)}" ${cur === x.id ? "selected" : ""}>${L.includes(x) ? "" : "(other) "}${esc(sName(x))}</option>`).join("")}</select>
      ${s && s.url ? `<a class="lnk" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open stream ↗</a>` : `<small>${L.length ? L.length + " live to pick from" : "nothing live in this group"}</small>`}</div>`; };
  const slots = [slot("caller", NC > 1 ? "Caller 1" : "Caller", "caller", "var(--callers)", false), ...Array.from({length:NC - 1}, (_, i) => slot("caller" + (i + 2), "Caller " + (i + 2), "caller", "var(--callers)", true)), slot("script", "Script", "script", "var(--scripts)", false), slot("bot", "Bot", "bot", "var(--bots)", false)].join("");
  const AS = cxAssignedAll(), picks = cxPicked();
  const callRows = AS.map(A => { const c = cxCallFor(A); return `<div class="arow"><span class="adot" style="--c:#FFB547"></span><div class="t"><b>${esc(A.name)}</b><small>${A.pick ? "Cortex Call privilege" : "on a Caller stream window"} · ${c ? `called <b style="color:${c.d === "up" ? "var(--up)" : "var(--dn)"}">${c.d === "up" ? "▲ UP" : "▼ DOWN"}</b> at ${esc(new Date(c.t).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}))}` : "no call this round"}</small></div><div class="aacts"><button class="btn ghost sm" type="button" data-cxcall="${esc(A.key)}|up">Post ▲</button><button class="btn ghost sm" type="button" data-cxcall="${esc(A.key)}|down">Post ▼</button>${A.pick ? `<button class="xbtn2" type="button" data-cxcrm="${esc(A.key)}">Remove privilege</button>` : ""}</div></div>`; }).join("");
  const texts = cxTextTabs();
  return cxGateTab()
    + `<div class="acard"><h3>Stream windows <small>what shows at the top of the Cortex chat</small></h3><p class="hint">Pick a live stream for each window. Add up to 6 caller windows; each caller's Cortex Call shows on their window.</p>
      <div class="cxaslots">${slots}</div><div class="aacts">${NC < 6 ? `<button class="btn sm" type="button" data-cxslot="add">＋ Add a caller window</button>` : ""}</div></div>`
    + `<div class="acard"><h3>Cortex Call privilege <small>${picks.length} member${picks.length === 1 ? "" : "s"} · resets every 15 minutes</small></h3><p class="hint">Members with the Cortex Call privilege get ▲ UP / ▼ DOWN buttons in the Cortex Call box in the chat, and everyone sees their call. Callers on a Caller stream window get it automatically.</p>
      <div class="alist">${callRows || `<div class="aempty">No one has the Cortex Call privilege yet.</div>`}</div>
      <div class="af"><label>Grant the Cortex Call privilege</label><select class="cxcAddSel"><option value="">Choose a member…</option>${cxPeopleOpts().map(o => `<option value="${esc(o.key)}|${esc(o.hid)}|${esc(o.name)}">${esc(o.name)}</option>`).join("")}</select></div></div>`
    + `<div class="acard"><h3>Pinned message</h3><p class="hint">Shows at the top of #main-floor for everyone.</p><div class="af"><input id="ac_pin" value="${esc(cx.pin || "")}" maxlength="240" placeholder="Welcome! Tag ▲/▼ on your trade calls. Be respectful."></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="pin">Save pin</button>${cx.pin ? `<button class="btn ghost sm" type="button" data-apsave="unpin">Remove pin</button>` : ""}</div></div>`
    + `<div class="acard"><h3>Text channels <small>${texts.length} channels · only admins can add or delete</small></h3><div class="aform">${texts.map(([k, l]) => { const custom = !!cxCat(k), nm = custom ? "# " + l : "# " + (DCH[k] ? DCH[k][0] : l); return `<div class="af"><label for="ac_t_${k}">${esc(nm)}${k !== "main" ? ` <button class="xbtn2" type="button" data-cxadel="${custom ? "x:" + esc(k) : "t:" + esc(k)}">Delete</button>` : ""}</label>${DCH[k] ? `<input id="ac_t_${k}" value="${esc(tp[k] || "")}" placeholder="${esc(DCH[k].orig || DCH[k][1])}" maxlength="90">` : `<small class="hint">${esc((((cx.chx || {})[k]) || {}).topic || "custom channel")}</small>`}</div>`; }).join("")}</div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="topics">Save topics</button></div>
      <div class="aform" style="margin-top:8px"><div class="af"><label for="cxa_n">New text channel</label><input id="cxa_n" maxlength="32" placeholder="new-channel"></div><div class="af"><label for="cxa_t">Topic (optional)</label><input id="cxa_t" maxlength="80" placeholder="What it's for"></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-cxanew>Add channel</button></div></div>`
    + cxAdminCard()
    + `<div class="acard"><h3>More Cortex settings</h3><div class="aacts"><button class="btn ghost sm" type="button" data-aptab="voice">Voice rooms</button><button class="btn ghost sm" type="button" data-aptab="moderation">Moderation</button><button class="btn ghost sm" type="button" data-aptab="streaming">Streaming & who can go live</button><button class="btn sm" type="button" data-apgo="cortex">Open the Cortex ↗</button></div></div>`;
}
document.addEventListener("click", async e => {
  const nw = e.target.closest("[data-cxanew]");
  if(nw){ if(!isAdmin && db) return; const name = ($("cxa_n").value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32); if(!name) return toast("Give the channel a name.");
    const id = "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), topic = ($("cxa_t").value || "").trim().slice(0, 80);
    await cxSaveCfg({chx:{[id]:{cat:"text", name, t:Date.now(), ...(topic ? {topic} : {})}}}, "Channel added"); cxAdmRefresh(); return; }
  const dl = e.target.closest("[data-cxadel]");
  if(dl){ if(!isAdmin && db) return; const k = dl.dataset.cxadel; if(S.apConfirm !== "cxdel:" + k){ S.apConfirm = "cxdel:" + k; dl.textContent = "Tap again to delete"; dl.classList.add("danger"); return; }
    S.apConfirm = null; await cxSaveCfg(k.startsWith("x:") ? {chx:{[k.slice(2)]:{del:true}}} : {chHide:{[k]:true}}, "Channel deleted"); cxAdmRefresh(); return; }
});
function cxGateTab(){
  const C = S.cxCfg || {}, c = cxClosed(), ra = +C.reopenAt || 0;
  const dl = ra ? new Date(ra - new Date(ra).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const inside = S.demo ? 0 : onlinePeople().length;
  return `<div class="acard cxgcard ${c ? "closed" : "open"}"><h3>Live Trade Cortex <small>chat, voice and streams</small></h3>
    <div class="cxgstate"><span class="cxglight"></span><div><b>${c ? "CLOSED" : "OPEN"}</b><small>${c ? "Members can't enter. They see your closed message instead." + (cxReopenTxt() ? " · " + esc(cxReopenTxt()) : "") : "Anyone signed in can enter the Cortex right now."}${!S.demo ? ` · ${inside} online` : ""}</small></div></div>
    <div class="aacts">${c ? `<button class="btn" type="button" data-cxgate="open">Open the Cortex</button>` : `<button class="btn danger" type="button" data-cxgate="close">Close the Cortex</button>`}<button class="btn ghost sm" type="button" data-cxgate="preview">Preview what members see when closed</button></div></div>
    <div class="acard"><h3>When it's closed</h3><div class="aform">
      <div class="af w"><label for="cg_msg">Message members see</label><input id="cg_msg" maxlength="200" value="${esc(C.closedMsg || "")}" placeholder="The Live Trade Cortex is closed right now. Check back soon."></div>
      <div class="af"><label for="cg_when">Opens again (optional, shown to members)</label><input id="cg_when" type="datetime-local" value="${dl}"></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-cxgate="save">Save message</button></div>
      <p class="hint">Closing the Cortex sends anyone inside back to the main page. Admins can still go in to set things up, and they see a CLOSED banner at the top. The Cortex on the main page shows OPEN or CLOSED for everyone.</p></div>`;
}
function openCortex(on){
  if(on && cxClosed() && !cxAdm()){ cxClosedNote(); return; }
  S.cortex = on;
  if(on && S.dmPage) openDM(false);

  if(on && S.coinPage) openCoin(false);

  if(on && S.mePage) openMe(false);
  if(on && S.adminPage) openAdmin(false);
  if(on && S.callersPage) openCallersPage(false);
  if(!on && typeof resetCorex === "function") resetCorex();
  if(on && S.cc){ S.cc = false; renderCC(); }
  if(on && S.battlePage){ S.battlePage = false; renderBattlePage(); }
  if(on && S.vortexPage){ S.vortexPage = false; renderVortexPage(); }
  try { history.replaceState(null, "", "#" + (on ? "cortex" : S.section)); } catch {}
  renderCortex(); window.scrollTo({top:0});
  if(on) setTimeout(() => { const b = $("fmsgs"); b.scrollTop = b.scrollHeight; }, 30);
}
async function sendFloor(text){
  if(guestBlocked("chat") || !sendGuard()) return;
  const [k, id] = ($("fAs").value || "me|").split("|");
  const src = k === "bot" ? myBots().find(x => x.id === id) : k === "script" ? myScripts().find(x => x.id === id) : null;
  const msg = {b:text, tab:S.ftab};
  if(src) msg.as = {k, id, n:src.name};
  if(S.fdir){ msg.dir = S.fdir; msg.mk = marketFor(S.ftab); }
  S.fdir = null;
  if(S.dReply){ const o = allMsgs().find(x => x.id === S.dReply); if(o) msg.re = {id:o.id, n:o.name || (o.as && o.as.n) || "", b:(o.b || "").slice(0, 120)}; S.dReply = null; }
  if(S.typing){ S.typing = null; pushPresence(); }
  if(S.demo){ S.demoMsgs.push({id:newId(), name:"You (demo)", color:"#2EE59D", t:Date.now(), ...msg}); renderCortex(); renderDock(); return; }
  const t = Date.now(), h = hourKey(t), mid = newId();
  await act(() => mergeWrite(db.doc("lounge/" + h), {hour:h, msgs:{[mid]:{a:meId, t, ...msg}}}));
}
wallsPark(); setTimeout(() => { try { renderDemonDisc(); } catch {} }, 0); setInterval(() => { try { renderDemonDisc(); } catch {} }, 2000); $("corex").addEventListener("click", () => morphIntoCortex()); setTimeout(cxGateSync, 0);
$("cxExitBtn").addEventListener("click", async () => { if(document.fullscreenElement) await document.exitFullscreen().catch(() => {}); morphOutOfCortex(); });
$("cxFullBtn").addEventListener("click", () => { const el = $("cortex"); if(el.requestFullscreen) el.requestFullscreen().catch(() => toast("Full screen isn't available in this view.")); else toast("Full screen isn't available in this view."); });
$("cxGoBtn").addEventListener("click", () => { document.querySelectorAll("[data-cxm]").forEach(x => x.hidden = false); $("cxShareHelp").hidden = S.cxMedia !== "screen"; $("cxLiveForm").hidden = false; $("cxTitle").focus(); });
$("cxCancel").addEventListener("click", () => { $("cxLiveForm").hidden = true; });
$("cxGo").addEventListener("click", async () => {
  const url = $("cxUrl").value.trim(), title = $("cxTitle").value.trim() || "Live on the Cortex";
  if(!/^https:\/\/[^\s]+\.[^\s]+/.test(url)){ toast("Paste the full stream link, starting with https://"); return; }
  if(!canStream(meId) && !(S.cxMedia === "screen" && spScreenOK())){ toast("You need streaming permission first. Anyone can share their screen: pick SCREEN."); return; }
  const now = Date.now();
  if(!db || S.demo){ S.localShares = [{id:"ls" + now, local:true, title, url, media:S.cxMedia, who:"You", src:"Member", sec:"cortex", status:"live"}]; $("cxLiveForm").hidden = true; toast(S.cxMedia === "screen" ? "Your screen is live in the Cortex (preview only)" : "You're live (preview only)"); renderCortex(); return; }
  const ok = await act(() => db.doc("streams/" + newId()).set({section:"cortex", subId:null, title, url, description:"", hostId:meId, authorId:meId, status:"live", scheduledFor:null, startedAt:now, createdAt:now, media:S.cxMedia, sourceKind:"person", sourceId:null, sourceName:null}));
  if(ok){ $("cxLiveForm").hidden = true; $("cxUrl").value = ""; $("cxTitle").value = ""; toast(S.cxMedia === "screen" ? "Your screen is live in the Cortex" : "You're live in the Cortex"); }
});
$("dcf").addEventListener("click", e => {
  if(e.target.classList.contains("dscrim")){ $("dcf").classList.remove("chopen", "memopen"); return; }
  const j = e.target.closest("[data-djump]"); if(j){ const el = $("dm-" + j.dataset.djump); if(el){ el.scrollIntoView({block:"center", behavior:"smooth"}); el.classList.remove("flashq"); void el.offsetWidth; el.classList.add("flashq"); } return; }
  if(S.dPick && !e.target.closest(".dpick,[data-dpick]")){ S.dPick = null; renderFloor(); }
});
$("fin").addEventListener("input", () => { if(!$("fin").value.trim()) return; const now = Date.now(); if(!S.typing || S.typing.ch !== S.ftab || now - S.typing.t > 2500){ S.typing = {ch:S.ftab, t:now}; pushPresence(); } });
$("fin").addEventListener("keydown", e => { if(e.key === "Escape" && S.dReply){ S.dReply = null; renderFloor(); } });
setInterval(() => { if(S.cortex){ renderTyping(); if(S.typing && Date.now() - S.typing.t > 6000){ S.typing = null; pushPresence(); } } }, 1500);
$("fform").addEventListener("submit", async e => { e.preventDefault(); const v = $("fin").value.trim(); if(!v) return; $("fin").value = ""; await sendFloor(v.slice(0,400)); });
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return;
  const d = b.dataset;
  if(d.ftab){ S.ftab = d.ftab; S.dHub = d.dhub || null; S.dPick = null; $("dcf").classList.remove("chopen"); renderFloor();
    if(d.dhub){ const w = {callers:"cxWinCal", bots:"cxWinBot", scripts:"cxWinScr", members:"cxWinMem"}[d.dhub]; const el = $(w); if(el){ el.scrollIntoView({block:"start", behavior:"smooth"}); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } }
    else if(S.ftab !== "streams") $("fin").focus({preventScroll:true});
    return; }
  if(d.drx){ const [id, k] = d.drx.split("|"); S.dPick = null; dToggleRx(id, k); if(S.demo) return; renderFloor(); return; }
  if(d.dpick){ S.dPick = S.dPick === d.dpick ? null : d.dpick; renderFloor(); return; }
  if("drep" in d){ S.dReply = d.drep || null; S.dPick = null; renderFloor(); if(S.dReply) $("fin").focus(); return; }
  if(d.dnav){ const c = $("dcf");
    if(d.dnav === "ch") c.classList.toggle("chopen");
    else if(d.dnav === "mem"){ if(matchMedia("(max-width:1180px)").matches) c.classList.toggle("memopen"); else { S.dMem = !S.dMem; renderCortex(); } }
    return; }
  if(d.fdir){ S.fdir = S.fdir === d.fdir ? null : d.fdir; renderFloor(); $("fin").focus(); return; }
  if(d.cxm){ S.cxMedia = d.cxm; document.querySelectorAll("[data-cxm]").forEach(x => x.setAttribute("aria-pressed", x === b)); return; }
  if("opencortex" in d){ $("dock").hidden = true; $("dockBtn").setAttribute("aria-expanded", false); if(S.cc) openCC(false); setTimeout(() => { $("corex").scrollIntoView({block:"center"}); requestAnimationFrame(() => morphIntoCortex()); }, 0); return; }
  if(d.allowstream){ if(await act(() => db.doc("streamers/" + d.allowstream).set({t:Date.now(), by:meId}))) toast("Streaming allowed"); return; }
  if(d.unstream){ if(await act(() => db.doc("streamers/" + d.unstream).delete())) toast("Streaming permission removed"); return; }
});


// ---------- cortex: callers directory (A to Z) ----------
S.nameCache = {}; S.dcq = "";
const MOCK_CALLERS = [
  ["Ava Strike","#FFB547","68% · 112",{title:"BTC 15m, calling every window",url:"https://www.twitch.tv/",media:"video"},"up",true,"cortex"],
  ["BlockBaron","#4DA3FF","61% · 87",null,"down",true,null],
  ["Cipher Kay","#B98CFF","57% · 64",null,null,false,null],
  ["Delta Dan","#2EE59D","73% · 41",{title:"ETH hourly levels, audio",url:"https://x.com/",media:"audio"},"up",true,"callers"],
  ["Fib Fox","#FF8A3D","59% · 150",null,"up",true,null],
  ["Luna Levels","#8FD3FF","64% · 98",null,null,false,null],
  ["Marlowe","#FF4D6A","55% · 36",null,"down",true,"cortex"],
  ["Pip Queen","#F7C6FF","66% · 120",null,null,false,null],
  ["Tidewatch","#5BE3C8","62% · 77",null,"down",false,null],
  ["Zed Momentum","#FFD166","70% · 58",null,"up",true,null]
].map(([name,color,rec,live,d,online,voice]) => ({key:"mock-" + name, name, color, rec, live, next: d ? {d, c:"med"} : null, online, voice, demo:true, mock:true}));
function callerDir(){
  const base = callerDirBase(), have = new Set(base.map(c => (c.name || "").replace(/ \(demo\)$/, "").toLowerCase()));
  return base.concat(profileCallers().filter(m => !have.has(m.name.toLowerCase())));
}
function callerDirBase(){
  if(S.demo){
    const out = [], seen = new Set();
    for(const c of (demoState ? demoState.callers : [])){ const n = c.name; if(seen.has(n)) continue; seen.add(n); const pp = (S.demoPeers || []).find(p => p.name === n); out.push({key:c.id, name:n, color:c.color, live:c.live, next:c.next, rec:c.rec, demo:true, online:!!pp, voice:pp && pp.voice}); }
    for(const p of (S.demoPeers || [])) if(/rb cal/.test(p.role || "") && !seen.has(p.name)){ seen.add(p.name); out.push({key:p.name, name:p.name, color:p.color, live:p.live ? {title:"Live in the Cortex"} : null, next:null, rec:"—", demo:true, voice:p.voice, online:true}); }
    return out;
  }
  const on = new Map(onlinePeople().map(p => [p.id, p]));
  return Object.keys(S.verified).map(id => { const c = realCaller(id), p = on.get(id); return {key:id, id, name:S.nameCache[id], live:c.live, next:c.next, rec:c.rec, online:!!p, voice:p && p.voice}; });
}
function renderCallerDir(){ renderCallerDirInto($("dCallers"), "dc"); if(S.callersPage) renderCallerDirInto($("cpList"), "cp"); }
function renderCallerDirInto(box, px){
  if(!box) return;
  const kind = px === "cp" ? S.dirKind : cxDirKind(), K = DIRK[kind];
  let L = kind === "callers" ? callerDir() : entityDir(kind);
  const missing = L.filter(c => c.id && !(c.id in S.nameCache)).map(c => c.id);
  if(missing.length && user && !renderCallerDir.busy){ renderCallerDir.busy = true;
    user.profiles(missing).then(ps => { missing.forEach(id => S.nameCache[id] = (ps && ps[id] && ps[id].name) || "Member"); }).catch(() => missing.forEach(id => S.nameCache[id] = "Member"))
      .finally(() => { renderCallerDir.busy = false; renderCallerDir(); }); }
  const nm = c => (c.name || "").replace(/ \(demo\)$/, "");
  L = L.slice().sort((a, b) => nm(a).localeCompare(nm(b), undefined, {sensitivity:"base"}) || (a.key > b.key ? 1 : -1));
  const q = S.dcq.trim().toLowerCase(), favN = L.filter(c => isFav(c.key, c.name)).length; if(S.dcFav && !favN) S.dcFav = false;
  const shown = L.filter(c => !q || nm(c).toLowerCase().includes(q)).filter(c => !S.dcFav || isFav(c.key, c.name));
  const letter = c => { const ch = (nm(c)[0] || "#").toUpperCase(); return /[A-Z]/.test(ch) ? ch : "#"; };
  const have = new Set(shown.map(letter));
  const keepFocus = document.activeElement && document.activeElement.id === px + "Search", caret = keepFocus ? document.activeElement.selectionStart : 0, sc = box.scrollTop;
  let h = `<div class="dclh"><h3>${esc(K.title)}</h3><span class="n">${L.length} ${K.unit} · A to Z</span><button class="favt" type="button" data-dcfav aria-pressed="${!!S.dcFav}">★ Favorites ${favN}</button><input id="${px}Search" data-dcsearch type="search" placeholder="Search ${esc(K.title.toLowerCase())}" value="${esc(S.dcq)}" aria-label="Search">
    <div class="az">${"#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(ch => `<button type="button" data-dcjump="${px}|${ch}" ${have.has(ch) ? "" : "disabled"}>${ch}</button>`).join("")}</div></div>`;
  if(!L.length && kind !== "callers") h += `<div class="cempty" style="padding:24px 18px">No ${esc(K.title.toLowerCase())} listed yet.</div>`;
  else if(!L.length) h += `<div class="cempty" style="padding:24px 18px">${S.demo || db ? "No verified callers yet. Callers show up here once they're verified in the Call console." : "Open the published page while signed in, or try Play demo."}</div>`;
  else if(!shown.length) h += `<div class="cempty" style="padding:24px 18px">No ${esc(K.title.toLowerCase())} match “${esc(S.dcq)}”.</div>`;
  let cur = null;
  for(const c of shown){
    const L1 = letter(c);
    if(L1 !== cur){ cur = L1; h += `<div class="dcl-l" id="${px}-l-${L1 === "#" ? "num" : L1}">${L1}</div>`; }
    h += rowHtml(c);
  }
  box.innerHTML = h; box.scrollTop = sc; fillNames(box);
  if(px === "cp" && S.profDock && !$("profOv").hidden){ const k = $("profPanel").dataset.key, row = [...box.querySelectorAll("[data-prof]")].find(x => x.dataset.prof === k); if(row) row.closest(".dcr")?.classList.add("sel"); }
  if(keepFocus){ const i = $(px + "Search"); i.focus(); try { i.setSelectionRange(caret, caret); } catch {} }
}
function dirEvents(el){
  el.addEventListener("input", e => { if(e.target.matches("[data-dcsearch]")){ S.dcq = e.target.value; renderCallerDir(); } });
  el.addEventListener("click", e => {
    if(e.target.closest("[data-dcfav]")){ S.dcFav = !S.dcFav; renderCallerDir(); return; }
    const j = e.target.closest("[data-dcjump]"); if(j){ const [px, ch] = j.dataset.dcjump.split("|"); const t = $(px + "-l-" + (ch === "#" ? "num" : ch)); if(t) t.scrollIntoView({block:"start", behavior:"smooth"}); return; }
    const bb = e.target.closest("[data-dcboard]"); if(bb){ openFull(bb.dataset.dcboard, "board"); return; }
    const m = e.target.closest("[data-dcmsg]"); if(m){ const tag = "@" + m.dataset.dcmsg.replace(/\s+/g, "") + " ";
      if(S.callersPage){ openCallersPage(false); openCortex(true); }
      S.ftab = "main"; renderFloor(); const i = $("fin"); i.value = tag; i.focus(); return; }
    if(S.callersPage && e.target.closest("#callersPage [data-s], #callersPage [data-console]")) openCallersPage(false);
  });
}
dirEvents($("dCallers")); dirEvents($("callersPage"));
S.callersPage = false;
S.dirKind = "callers";
const DIRK = {callers:{title:"Callers", blurb:"Every verified caller on D3MON.CO, A to Z. See who's live, their reviews and their next call.", forum:"Callers forum →", unit:"verified", c:"var(--callers)"},
  bots:{title:"Bots", blurb:"Every bot on D3MON.CO, A to Z. See what each one reads, who built it, its reviews and its message board.", forum:"Bots forum →", unit:"bots", c:"var(--bots)"},
  scripts:{title:"Chart Scripts", blurb:"Every chart script on D3MON.CO, A to Z. See the market it runs on, its signal, reviews and message board.", forum:"Scripts forum →", unit:"scripts", c:"var(--scripts)"}};
function openCallersPage(on, kind){
  if(on && S.dmPage) openDM(false);

  if(on && S.coinPage) openCoin(false);

  if(on && S.mePage) openMe(false);
  if(on && kind) S.dirKind = kind;
  if(on){ const K = DIRK[S.dirKind] || DIRK.callers, pg = $("callersPage");
    if(S.dirKind === "callers") pg.style.removeProperty("--callers"); else pg.style.setProperty("--callers", S.dirKind === "bots" ? "#4DA3FF" : "#B98CFF");
    $("cpTitle").textContent = K.title; $("cpBlurb").textContent = K.blurb; $("cpForum").textContent = K.forum; $("cpForum").dataset.s = S.dirKind; 
    $("cpIcon").innerHTML = SECTIONS[S.dirKind].icon; pg.setAttribute("aria-label", K.title); S.dcFav = false; }
  if(!on && S.profDock) closeProfile();
  S.callersPage = on;
  if(on && S.adminPage) openAdmin(false);
  if(on){ S.menu = null; renderSections();
    if(S.cc){ S.cc = false; renderCC(); }
    if(S.cortex){ S.cortex = false; if(typeof resetCorex === "function") resetCorex(); renderCortex(); }
    if(S.battlePage){ S.battlePage = false; renderBattlePage(); }
    if(S.vortexPage){ S.vortexPage = false; renderVortexPage(); } }
  document.body.classList.toggle("callersmode", on);
  $("callersPage").hidden = !on;
  try { history.replaceState(null, "", "#" + (on ? "callerlist" : S.section)); } catch {}
  if(on){ S.dcq = ""; renderCallerDirInto($("cpList"), "cp"); const p = $("callersPage"); p.classList.remove("enter"); void p.offsetWidth; p.classList.add("enter"); setTimeout(() => p.classList.remove("enter"), 900); }
  window.scrollTo({top:0});
}
$("cpExitBtn").addEventListener("click", () => openCallersPage(false));

// ---------- site config (admin-controlled) ----------
S.site = {}; S.ann = null; S.mod = {}; S.cxCfg = {}; S.legal = {}; S.launch = {}; S.adminPage = false; S.apTab = "overview"; S.apConfirm = null; S.apHits = {}; S.lastSend = 0;
const DEF_DISC = "Not financial advice. Calls, bots and scripts on D3MON.CO are opinions and experiments, not recommendations. Prediction markets carry real risk. You must be 18+ and allowed to use Kalshi or Polymarket where you live.";
function subscribeSiteConfig(){
  if(!db) return;
  const on = (p, f) => db.doc(p).onSnapshot(sn => { f(sn.exists ? sn.data() : {}); applySiteConfig(); }, () => {});
  on("config/site", d => S.site = d); on("config/announce", d => S.ann = d); on("config/mod", d => S.mod = d);
  on("config/cortex", d => { S.cxCfg = d; cxGateSync(); }); on("config/dchat", d => { S.dchatCfg = d; }); on("config/legal", d => S.legal = d);
  on("config/members", d => S.memReg = d);
  if(isAdmin && meId) db.doc(`data/users/${meId}/memnotes`).onSnapshot(sn => { S.memNotes = sn.exists ? (sn.data().notes || {}) : {}; if(S.adminPage) { renderAdmin.lastTab = null; renderAdmin(); } }, () => {});
  if(isAdmin) on("config/launch", d => S.launch = d);
}
function ddCfg(){ const s = S.site || {}; return {server:s.ddServer || "", channel:s.ddChannel || "", invite:s.ddInvite || "", on:s.ddOn !== false, title:s.ddTitle || "Demon Discord", chName:s.ddChName || ""}; }
function renderDemonDisc(){
  const box = $("demonDisc"); if(!box) return; const D = ddCfg(), linked = !!D.server, adm = (isAdmin && !S.demo) || !db;
  const show = D.on && (linked || S.demo || adm); box.hidden = !show; if(!show){ box.innerHTML = ""; return; }
  const sig = JSON.stringify([D, linked, adm, !!S.demo]); if(renderDemonDisc.sig === sig && box.childElementCount) return; renderDemonDisc.sig = sig;
  const src = linked ? (D.channel ? `https://e.widgetbot.io/channels/${encodeURIComponent(D.server)}/${encodeURIComponent(D.channel)}` : `https://discord.com/widget?id=${encodeURIComponent(D.server)}&theme=dark`) : "";
  const open = linked && D.channel ? `https://discord.com/channels/${encodeURIComponent(D.server)}/${encodeURIComponent(D.channel)}` : "";
  const head = `<div class="ddhead"><div class="ddid"><span class="ddico"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M19.6 5.3A16.4 16.4 0 0 0 15.5 4l-.5 1a15 15 0 0 0-6 0l-.5-1a16.4 16.4 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7A16.6 16.6 0 0 0 6.5 19.3l1-1.6a10.6 10.6 0 0 1-1.6-.8l.4-.3a11.8 11.8 0 0 0 11.4 0l.4.3c-.5.3-1 .6-1.6.8l1 1.6a16.5 16.5 0 0 0 5.1-2.6c.4-4.3-.7-8-2.9-11.4ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg></span>
      <div><h2>${esc(D.title)}</h2><p>${linked ? `${D.chName ? "#" + esc(D.chName) + " · " : ""}live from our Discord · one chat on both ends` : S.demo ? "sample preview · link your server in Admin → Discord chats" : "Not linked yet"}</p></div></div>
    <div class="ddacts"><span class="ddlive"><i></i>LIVE</span>${/^https:\/\//.test(D.invite) ? `<a class="ddjoin" href="${esc(D.invite)}" target="_blank" rel="noopener noreferrer">Join the server</a>` : ""}${open ? `<a class="ddopen" href="${esc(open)}" target="_blank" rel="noopener noreferrer">Open in Discord ↗</a>` : ""}</div></div>`;
  const body = linked ? `<div class="ddframe"><iframe src="${esc(src)}" title="${esc(D.title)}" loading="lazy" allow="clipboard-write; fullscreen"></iframe></div>`
    : `<div class="ddframe mock">${ddMock()}${adm && !S.demo ? `<div class="ddsetup"><b>Link your Discord</b><span>Paste your channel link in Admin → Discord chats → Demon Discord. Until then only admins see this window.</span><button class="btn sm" type="button" data-ddsetup>Set it up</button></div>` : ""}</div>`;
  box.innerHTML = head + body + `<div class="ddfoot"><span>💬 Sign in with Discord inside the chat to post · messages show here and in our Discord</span><span>${linked ? "Powered by WidgetBot" : ""}</span></div>`;
}
function ddMock(){
  const ch = [["text","welcome"],["text","announcements"],["text","general"],["text","btc-15m-calls", true],["text","kalshi"],["text","bot-battles"],["voice","Trading Floor"],["voice","Battle Night"]];
  const msgs = [["HardSmoke","#FF7A45","ADMIN","Battle night is Saturday 7 PM PT. Bots, load your lineups 😈", "Today at 9:12 AM"],["Nova","#FFB547","CALLER","Calling ▲ UP on the 10:00 round. Target 64,120.","Today at 9:58 AM"],["gridlord","#4DA3FF","","ArbWolf already locked UP, following","Today at 9:59 AM"],["Redline","#FF4D6A","CALLER","Fading it. ▼ DOWN, momentum's gone on the 5m.","Today at 10:01 AM"],["theta_tina","#B98CFF","","this face-off is going to be close 👀","Today at 10:02 AM"]];
  const mem = [["ONLINE — 6",[["HardSmoke","#FF7A45"],["Nova","#FFB547"],["Redline","#FF4D6A"],["gridlord","#4DA3FF"],["theta_tina","#B98CFF"],["Kai Tides","#2EE59D"]]]];
  return `<div class="dmk"><div class="dmk-side"><div class="dmk-srv">D3MON.CO <span>▾</span></div>${ch.map(([k, n, on]) => `<div class="dmk-ch${on ? " on" : ""}">${k === "voice" ? "🔊" : "#"} ${esc(n)}</div>`).join("")}</div>
    <div class="dmk-main"><div class="dmk-top"># btc-15m-calls <small>Round-by-round calls · BTC 15m</small></div><div class="dmk-msgs">${msgs.map(([n, c, tag, b, t]) => `<div class="dmk-m"><span class="dmk-av" style="background:${c}"></span><div><div class="dmk-h"><b style="color:${c}">${esc(n)}</b>${tag ? `<em>${tag}</em>` : ""}<time>${t}</time></div><p>${esc(b)}</p></div></div>`).join("")}</div><div class="dmk-in">Message #btc-15m-calls</div></div>
    <div class="dmk-mem">${mem.map(([h, L]) => `<h6>${h}</h6>${L.map(([n, c]) => `<div class="dmk-u"><span class="dmk-av sm" style="background:${c}"><i></i></span>${esc(n)}</div>`).join("")}`).join("")}</div></div>`;
}
document.addEventListener("click", e => { if(e.target.closest("[data-ddsetup]")){ openAdmin(true); S.apTab = "dchat"; renderAdmin.lastTab = null; renderAdmin(); } });
function applySiteConfig(){
  try { renderDemonDisc(); } catch {}
  if(S.cortex) renderCxTop();
  const st = S.site || {};
  // tagline
  const tg = document.querySelector(".brand .wm + small"); if(tg) tg.textContent = st.tagline ? "// " + st.tagline : "// live trade network";
  // demo button
  const db2 = $("demoBtn"); if(db2) db2.hidden = st.demoBtn === false && !isAdmin;
  // announcement
  const a = S.ann || {}, bar = $("annBar"), key = "ann:" + (a.t || 0);
  let dismissed = false; try { dismissed = localStorage.getItem("d3_ann_dismiss") === key; } catch {}
  const live = a.on && a.text && (!a.until || Date.now() < a.until) && !dismissed && !(S.alerts || {}).hideAnn;
  bar.hidden = !live; bar.className = "annbar " + (a.level || "info");
  if(live) bar.innerHTML = `<span class="tg">${esc(({info:"NEWS", alert:"ALERT", success:"UPDATE", promo:"EVENT"})[a.level] || "NEWS")}</span><span class="tx">${esc(a.text)}${/^https:\/\//.test(a.link || "") ? ` <a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.linkText || "Learn more")} ↗</a>` : ""}</span><button type="button" id="annX" title="Dismiss" aria-label="Dismiss">✕</button>`;
  // maintenance
  $("maintOv").hidden = !(st.maint && !isAdmin);
  $("maintMsg").textContent = st.maintMsg || "D3MON.CO is getting an upgrade. Check back in a little while.";
  // footer
  const L = [["discord","Discord"],["x","X"],["youtube","YouTube"],["twitch","Twitch"],["kick","Kick"]].filter(([k]) => /^https:\/\//.test(st[k] || ""));
  $("siteFoot").innerHTML = `<span>© ${new Date().getFullYear()} ${esc(st.name || "D3MON.CO")}</span><span class="lk">${L.map(([k, n]) => `<a href="${esc(st[k])}" target="_blank" rel="noopener noreferrer">${n} ↗</a>`).join("")}<button type="button" data-legal="terms">Terms</button><button type="button" data-legal="privacy">Privacy</button><button type="button" data-legal="rules">Community rules</button>${st.email ? `<a href="mailto:${esc(st.email)}">Contact</a>` : ""}</span><span class="dis">${esc(st.disclaimer || DEF_DISC)}</span>`;
  // cortex topics
  cxSyncDCH();
  for(const k of Object.keys(DCH)) if(!DCH[k].orig) DCH[k].orig = DCH[k][1];
  for(const k of Object.keys(DCH)) DCH[k][1] = (S.cxCfg.topics || {})[k] || DCH[k].orig;
  if(S.cortex) renderCortex();
  if(S.adminPage) renderAdmin();
  if(S.callersPage) renderCallerDir();
}
document.addEventListener("click", e => {
  if(e.target.id === "annX"){ try { localStorage.setItem("d3_ann_dismiss", "ann:" + ((S.ann || {}).t || 0)); } catch {} $("annBar").hidden = true; return; }
  const lg = e.target.closest("[data-legal]"); if(lg){ const k = lg.dataset.legal, T = {terms:"Terms of Service", privacy:"Privacy Policy", rules:"Community Rules"};
    $("lgTitle").textContent = T[k]; $("lgText").textContent = (S.legal || {})[k] || "Not published yet."; $("legalModal").hidden = false; return; }
  if(e.target.id === "lgClose" || e.target.id === "legalModal") $("legalModal").hidden = true;
});
const maskWords = t => { const w = (S.mod.words || "").split(",").map(x => x.trim()).filter(Boolean); if(!w.length || !t) return t;
  return w.reduce((a, x) => a.replace(new RegExp("\\b" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi"), m => m[0] + "*".repeat(Math.max(1, m.length - 1))), t); };
const isMuted = id => !!(id && S.mod.muted && S.mod.muted[id] && (!S.mod.muted[id].until || S.mod.muted[id].until > Date.now()));
function sendGuard(){
  if(S.demo) return true;
  if(isMuted(meId)){ toast("You're muted in chat right now."); return false; }
  const slow = +(S.mod.slow || 0);
  if(slow && !isAdmin && Date.now() - S.lastSend < slow*1000){ toast(`Slow mode is on. Wait ${Math.ceil((slow*1000 - (Date.now() - S.lastSend))/1000)}s.`); return false; }
  S.lastSend = Date.now(); return true;
}



// ---------- member categories you assign (each one unlocks or labels an activity) ----------
S.memNotes = {}; S.memEdit = null;
const MANUAL_CATS = [
  ["caller","Verified caller","var(--callers)","unlocks","Post official round calls in the Call console; counts on the Callers leaderboard and Callers page."],
  ["streamer","Streamer","var(--live)","unlocks","Go live in the Cortex stream wall (verified callers can already)."],
  ["demon","Demon (Discord linked)","#FF4D6A","unlocks","Linked their Discord to D3MON.CO: DEMON badge everywhere they appear."],
  ["reviewer","Reviewer","#9FF3CF","unlocks","Write star reviews on callers, bots and scripts."],
  ["mod","Chat moderator","#FF8A3D","unlocks","MOD badge; can delete anyone's messages in the Cortex chat."],
  ["botdev","Bot developer","var(--bots)","label","Builds bots that read the market; eligible for Battle of the Bots."],
  ["scripter","Script developer","var(--scripts)","label","Publishes chart scripts and indicators."],
  ["battle","Battle competitor","#4DA3FF","label","Entered in the Battle of the Bots roster."],
  ["creator","Content creator","#F7C6FF","label","Makes videos, threads or streams about the community."],
  ["mentor","Mentor","#5BE3C8","label","Helps newer members learn to read the markets."],
  ["beta","Beta tester","#8FD3FF","label","Tries new features before everyone else."]
];
function allCats(){ return MANUAL_CATS.concat(((S.memReg || {}).custom || []).filter(c => c && c.k && c.label).map(c => [c.k, c.label, c.color || "#8FA3B2", "label", c.desc || "Custom category."])); }
const catsOf = id => ((S.memReg || {}).cats || {})[id] || {};
const hasCat = (id, k) => !!(id && catsOf(id)[k]);
const canHolders = () => S.demo || isAdmin || isHolder(meId) || hasCat(meId, "mod");
const isDemon = id => !!id && (!!catsOf(id).demon || (/^p:/.test(id) && !!((getProfiles()[id.slice(2)] || {}).cats || {}).demon) || (!!(S.listCfg || {}).autoDemon && !/^p:/.test(id) && !!socOf(pubOf(id)).discord));
const demonBadge = `<span class="rb demon" title="Linked their Discord">😈 DEMON</span>`;
function guestBlocked(kind){ if(!S.meGuest || isAdmin || S.demo) return false; if((((S.listCfg || {}).guest) || {})[kind] === false){ toast(kind === "dm" ? "Guests can't send direct messages here." : kind === "board" ? "Guests can't post on message boards here." : "Guests can't post in chat here."); return true; } return false; }
function catBadges(id){
  const c = catsOf(id); let h = "";
  if(isDemon(id)) h += demonBadge;
  if(c.mod) h += `<span class="rb mod">MOD</span>`;
  for(const [k, l, col] of allCats()) if(c[k] && !["holder","mod","caller","streamer","botdev","scripter"].includes(k) && k.startsWith("x_")) h += `<span class="rb cst" style="--c:${col}">${esc(l.toUpperCase())}</span>`;
  return h;
}
function memCatEditor(m){
  const c = m.mock ? {} : catsOf(m.id), on = k => m.mock ? m.cats.has(k === "caller" ? "verified" : k) : k === "caller" ? isVerified(m.id) : k === "streamer" ? !!(S.streamers || {})[m.id] || !!c.streamer : !!c[k];
  const box = (grp) => allCats().filter(x => x[3] === grp).map(([k, l, col, , d]) => `<label style="--c:${col}"><input type="checkbox" data-mcat="${k}" ${on(k) ? "checked" : ""}><span><span class="t">${esc(l)}</span><small>${esc(d)}</small></span></label>`).join("");
  return `<div class="mcedit"><h4>Unlocks activities</h4><div class="mcgrid">${box("unlocks")}</div>
    <h4>Labels</h4><div class="mcgrid">${box("label")}</div>
    <p class="pfine">Coin holdings come from the ledger: ${esc(coinHoldTxt(m.id) || "no coins yet")}. <button class="xbtn2" type="button" data-cngo="manage">Open the ledger</button></p>
    <div class="aacts"><button class="btn sm" type="button" data-mcsave="${esc(m.id)}">Save categories</button><button class="xbtn" type="button" data-mcedit="">Cancel</button></div></div>`;
}
async function memSaveCats(id){
  const box = document.querySelector(".mcedit"); if(!box) return;
  const want = Object.fromEntries([...box.querySelectorAll("[data-mcat]")].map(i => [i.dataset.mcat, i.checked]));
  if(apPreview()){ toast("Preview only: open the published page to save."); return; }
  const ok = await act(async () => {
    if(want.caller && !isVerified(id)){ await db.doc("verified/" + id).set({t:Date.now(), by:meId}); try { await db.doc("requests/" + id).delete(); } catch {} }
    if(!want.caller && isVerified(id)) await db.doc("verified/" + id).delete();
    if(want.streamer && !(S.streamers || {})[id]) await db.doc("streamers/" + id).set({t:Date.now(), by:meId});
    if(!want.streamer && (S.streamers || {})[id]) await db.doc("streamers/" + id).delete();
    const patch = {}; for(const [k] of allCats()) if(k !== "caller") patch[k] = !!want[k];
    await mergeWrite(db.doc("config/members"), {cats:{[id]:patch}});
  });
  if(ok){ toast("Categories saved"); S.memEdit = null; renderAdmin.lastTab = null; renderAdmin(); }
}
function catGuideCard(){
  return `<div class="acard"><h3>Category guide <small>what each category is for</small></h3><div class="cguide">${allCats().map(([k, l, c, g, d]) => `<div style="--c:${c}"><span class="k">${g === "unlocks" ? "UNLOCKS" : "LABEL"}</span><b>${esc(l)}</b><small>${esc(d)}</small></div>`).join("")}</div>
    <div class="mcx"><div class="af"><label for="ncName">New category</label><input id="ncName" maxlength="30" placeholder="e.g. Founding member"></div><div class="af"><label for="ncDesc">What it's for</label><input id="ncDesc" maxlength="120" placeholder="Short description"></div>
    <div class="af" style="flex:0 1 110px"><label for="ncColor">Color</label><input id="ncColor" type="color" value="#4DA3FF" style="height:40px;padding:2px"></div><button class="btn sm" type="button" data-mcnew>Add category</button></div>
    ${((S.memReg || {}).custom || []).length ? `<div class="aacts">${S.memReg.custom.map((c, i) => `<span class="tb" style="--c:${esc(c.color)}">${esc(c.label.toUpperCase())}</span><button class="xbtn" type="button" data-mcdel="${i}">remove</button>`).join("")}</div>` : ""}</div>`;
}
$("adminPage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if("mcedit" in d){ S.memEdit = d.mcedit || null; renderAdmin.lastTab = null; renderAdmin(); return; }
  if(d.mcsave){ await memSaveCats(d.mcsave); return; }
  if("mcnew" in d){ const label = ($("ncName").value || "").trim(); if(!label) return toast("Name the category.");
    const custom = [...(((S.memReg || {}).custom) || []), {k:"x_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24), label, desc:($("ncDesc").value || "").trim(), color:$("ncColor").value}];
    if(await apSave("config/members", {custom}, `Category "${label}" added`)){ S.memReg = {...S.memReg, custom}; renderAdmin.lastTab = null; renderAdmin(); } return; }
  if(d.mcdel){ const custom = (((S.memReg || {}).custom) || []).filter((_, i) => i !== +d.mcdel); if(await apSave("config/members", {custom}, "Category removed")){ S.memReg = {...S.memReg, custom}; renderAdmin.lastTab = null; renderAdmin(); } return; }
});


// ---------- managed member profiles (hand-made records, e.g. the sample callers) ----------
const PROFILE_EXTRA = {"Ava Strike":["vip",["streamer","holder","creator"],"42,500 D3MON"],"Delta Dan":["partner",["streamer","holder","mentor"],"38,250 D3MON"],"Luna Levels":["vip",["holder"],"46,750 D3MON"],"Marlowe":["mod",["mod","holder"],"29,750 D3MON"]};
// sample members across every account type and category
const EXTRA_PROFILES = [
  ["s1","Nyx","#FF4D6A","staff",["mod","reviewer","voter"],[],"online","Site admin · keeps the lights on","Runs D3MON.CO day to day. Ping me about verification, streaming or bugs.",["BTC","Kalshi"],"day"],
  ["s2","Riptide","#FF8A3D","mod",["mod","reviewer"],[],"online","Cortex moderator · night shift","I keep the trade floor clean and help new members find their way.",["ETH","SOL"],"scalp"],
  ["s3","Atlas Capital","#5BE3C8","partner",["holder","voter","creator"],[],"offline","Partner desk · market research","We publish weekly market structure notes for the community.",["BTC","ETH","Polymarket"],"swing"],
  ["s4","Velvet Whale","#B98CFF","vip",["holder","voter"],[],"online","Long-time member · quiet lurker","Mostly here for the hourly rounds.",["BTC","Kalshi","Polymarket"],"swing"],
  ["s5","gridlord","#2EE59D","member",["botdev","battle","holder"],[],"online","Builds Arb Oracle","Arb bot between Kalshi and Polymarket. Battle of the Bots S1 champ.",["Kalshi","Polymarket"],"bots"],
  ["s6","m0mentum","#8FD3FF","member",["botdev","battle","beta"],[],"online","Momentum bot dev","Short-term momentum bursts, 15m only.",["BTC","SOL"],"bots"],
  ["s7","Quiet Mike","#B98CFF","member",["scripter","mentor"],[],"online","Session VWAP Bands author","Happy to walk anyone through VWAP and band reversion.",["BTC"],"charts"],
  ["s8","theta_tina","#F7C6FF","vip",["streamer","creator"],[],"live","Streams the hourly open","Live most weekdays at the hourly open. Come hang.",["BTC","XRP"],"day"],
  ["s9","Sage Candles","#FFD166","member",["mentor","reviewer","voter"],[],"offline","Mentor · candle nerd","Teaching price action basics on Sundays.",["ETH"],"learn"],
  ["s10","pixel_pete","#4DA3FF","member",["beta"],[],"online","Beta tester","I break new features so you don't have to.",["SOL"],"scalp"],
  ["s11","Echo Reviews","#9FF3CF","member",["reviewer"],[],"offline","Independent reviewer","Honest reviews of callers, bots and scripts.",["BTC","ETH"],"day"],
  ["s12","newbie_nate","#C9CEFF","member",[],["pending"],"online","Asked to be a verified caller","New here, learning the 15m rounds.",["BTC"],"learn"],
  ["s13","sol_sally","#FFB547","member",[],["pending","chatter"],"offline","SOL calls, pending verification","Been calling SOL hourlies in chat for a month.",["SOL"],"day"],
  ["s14","guest_trader","#8FA3B2","guest",[],["guest"],"offline","Guest from a partner community","Just visiting.",[],""],
  ["s15","spam_bot_77","#587080","restricted",[],["muted"],"offline","","",[],""]];
function extraProfiles(){
  const out = {};
  EXTRA_PROFILES.forEach(([pid, name, color, type, cats, flags, status, tagline, bio, markets, style], i) => { const c = {}; cats.forEach(k => c[k] = true);
    out[pid] = {name, color, type, cats:c, flags, rec:"", next:"", status, liveTitle:status === "live" ? `${name} live now` : "", liveUrl:status === "live" ? "https://www.twitch.tv/" : "", liveMedia:"video", voice:status === "online" && i % 3 === 0 ? "cortex" : "", tagline, bio, markets, style, socials:i < 9 ? {web:i % 2 ? "" : `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`, discord:i % 3 === 2 ? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}` : "https://discord.gg/d3mon"} : {}, sample:true, t:100 + i, f:Date.now() - (40 - i)*86400000}; });
  return out;
}
function defaultProfiles(){
  const out = {...extraProfiles()};
  MOCK_CALLERS.forEach((c, i) => { const x = PROFILE_EXTRA[c.name] || ["member", [], ""]; const cats = {caller:true}; x[1].forEach(k => cats[k] = true);
    out["c" + (i + 1)] = {name:c.name, color:c.color, type:x[0], cats, rec:c.rec, next:c.next ? c.next.d : "", status:c.live ? "live" : c.online ? "online" : "offline",
      liveTitle:c.live ? c.live.title : "", liveUrl:c.live ? c.live.url : "", liveMedia:c.live ? c.live.media : "video", voice:c.voice || "", sample:true, t:i, socials:{web:i % 3 === 0 ? `https://${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.trade` : "", discord:i % 2 === 0 ? "https://discord.gg/d3mon" : c.name.toLowerCase().replace(/[^a-z0-9]+/g, "")},
      tagline:["BTC 15m caller","Hourly specialist","SOL and ETH swings","ETH hourly levels","Fibonacci everything","Range trader","Night-shift caller","Polymarket regular","Patient swing caller","Momentum scalper"][i], markets:[["BTC"],["BTC","Kalshi"],["SOL","ETH"],["ETH"],["BTC","ETH"],["SOL"],["BTC","Polymarket"],["Polymarket"],["XRP","BTC"],["BTC","SOL"]][i], style:["scalp","day","swing","day","scalp","swing","day","swing","swing","scalp"][i]}; });
  return out;
}
// full example details for the sample members (fills anything a sample profile doesn't have yet)
const SAMPLE_BIO = {
  c1:"Calling BTC 15m rounds since the first Kalshi hourly markets. I post every call before the window locks and own every miss.",
  c2:"Hourly specialist. I read funding, open interest and the order book, then make one call per hour max.",
  c3:"Swing trader at heart, SOL and ETH mostly. I'll only call when the setup is clean.",
  c4:"ETH hourly levels every weekday. Audio stream during the US open.",
  c5:"Fibonacci retracements on everything. Yes, everything.",
  c6:"Range trader. I mark the overnight range and call the break or the fade.",
  c7:"Night-shift caller and Cortex mod. Asia session is my home.",
  c8:"Polymarket regular. I compare prediction-market odds with spot and call the gap.",
  c9:"Patient swing caller: fewer calls, higher conviction.",
  c10:"Momentum scalper. If it's moving, I'm calling it."};
const SAMPLE_TZ = ["ET (New York)","PT (Los Angeles)","UK (London)","CET (Berlin)","CT (Chicago)","SGT (Singapore)","JST (Tokyo)","ET (New York)","AEST (Sydney)","MT (Denver)"];
function sampleDetails(pid, p){
  const slug = (p.name || pid).toLowerCase().replace(/[^a-z0-9]+/g, ""), n = parseInt(pid.slice(1)) || 0, isC = pid[0] === "c";
  return {bio:SAMPLE_BIO[pid] || p.bio || "", tz:SAMPLE_TZ[n % SAMPLE_TZ.length], style:p.style || ["scalp","day","swing"][n % 3], markets:(p.markets && p.markets.length) ? p.markets : [["BTC"],["ETH","Kalshi"],["SOL","Polymarket"]][n % 3],
    socials:{x:`https://x.com/${slug}`, twitch:isC && n % 2 ? `https://twitch.tv/${slug}` : "", youtube:n % 3 === 0 ? `https://youtube.com/@${slug}` : "", web:`https://${slug}.${isC ? "trade" : "com"}`, discord:n % 2 ? "https://discord.gg/d3mon" : slug, ...(p.socials || {})},
    showWeb:p.showWeb, showDiscord:p.showDiscord};
}
const SAMPLE_PROMO = [["Join my Discord","https://discord.gg/d3mon","Live weekdays 9:30–11 AM ET","Free 7-day trial of my signals room for D3MON members",["Top caller · Sept","300+ calls logged"]],
  ["Watch me live","https://twitch.tv/","Hourly opens, Mon–Fri","",["Kalshi hourly specialist"]],
  ["Get my newsletter","https://substack.com/","Weekly recap every Sunday 7 PM ET","First month free",["5k subscribers"]],
  ["Subscribe on YouTube","https://youtube.com/","New breakdown videos Tue & Thu","",["Battle of the Bots S1 finalist","1k subs"]]];
function sampleSocials(slug, n){ const all = {x:`https://x.com/${slug}`, twitch:`https://twitch.tv/${slug}`, youtube:`https://youtube.com/@${slug}`, kick:`https://kick.com/${slug}`, tiktok:`https://tiktok.com/@${slug}`, instagram:`https://instagram.com/${slug}`, telegram:`@${slug}`, tradingview:`https://tradingview.com/u/${slug}`, github:`https://github.com/${slug}`, linktree:`https://linktr.ee/${slug}`, substack:`https://${slug}.substack.com`};
  const keys = Object.keys(all), out = {}; for(let i = 0; i < 4 + n % 4; i++){ const k = keys[(n*3 + i*2) % keys.length]; out[k] = all[k]; } return out; }
const SAMPLE_DEMONS = new Set(["c1","c2","c4","c7","c10","s1","s2","s5","s8","s9"]);
function withSampleDetails(P){ const out = {}; for(let [pid, p] of Object.entries(P)){ if(!p || !p.sample){ out[pid] = p; continue; } const d = sampleDetails(pid, p); const so = {...d.socials}; for(const k of Object.keys(so)) if(!so[k] && (p.socials || {})[k] === undefined) so[k] = d.socials[k]; const nn = [...pid].reduce((a2, ch) => a2 + ch.charCodeAt(0), 0), sp = SAMPLE_PROMO[nn % SAMPLE_PROMO.length], slug2 = (p.name || pid).toLowerCase().replace(/[^a-z0-9]+/g, "");
      Object.assign(so, Object.fromEntries(Object.entries(sampleSocials(slug2, nn)).filter(([k]) => !so[k])));
      if(SAMPLE_DEMONS.has(pid) && !(p.cats || {}).hasOwnProperty("demon")) p = {...p, cats:{...(p.cats || {}), demon:true}};
      out[pid] = {promo:p.promo || {cta:sp[0], ctaUrl:sp[1], sched:sp[2], offer:sp[3], highlights:sp[4]}, ...p, bio:p.bio || d.bio, tz:p.tz || d.tz, style:p.style || d.style, markets:(p.markets && p.markets.length) ? p.markets : d.markets, socials:{...so, ...Object.fromEntries(Object.entries(p.socials || {}).filter(([, v]) => v))}}; } return out; }
function getProfiles(){ const r = S.memReg || {}; return withSampleDetails(!r.seeded ? defaultProfiles() : r.seeded2 ? (r.profiles || {}) : {...extraProfiles(), ...(r.profiles || {})}); }
function liveProfiles(){ const hide = (S.site || {}).samples === false; return Object.entries(getProfiles()).filter(([, p]) => p && !p.deleted && p.name && !(hide && p.sample)); }
function profileCallers(){
  return liveProfiles().filter(([, p]) => (p.cats || {}).caller).map(([pid, p]) => ({key:"p:" + pid, name:p.name, color:p.color || "#4DA3FF", rec:p.rec || "—",
    live:p.status === "live" ? {title:p.liveTitle || "Live now", url:p.liveUrl || "", media:p.liveMedia || "video"} : null, next:p.next ? {d:p.next, c:"med"} : null,
    online:p.status !== "offline", voice:p.voice || null, demo:true, mock:!!p.sample}));
}
function profileMembers(){
  return liveProfiles().map(([pid, p]) => { const cats = new Set(); const c = p.cats || {};
    for(const [k, v2] of Object.entries(c)) if(v2 === true) cats.add(k === "caller" ? "verified" : k);
    for(const f of (p.flags || [])) cats.add(f);
    if(p.status !== "offline") cats.add("online"); if(p.status === "live") cats.add("streamer"); if(balanceOf("p:" + pid) > 0) cats.add("holder");
    return {id:"p:" + pid, pid, profile:true, sample:!!p.sample, name:p.name, color:p.color || "#4DA3FF", type:p.type || "member", cats, last:p.status !== "offline" ? Date.now() : (p.l || 0), first:p.f || 0, msgs:0, note:(S.memNotes || {})["p:" + pid] || "", hold:coinHoldTxt("p:" + pid), p};
  });
}
// seed the sample callers into the database once, so they are real records the admin can edit
function seedProfiles(){
  if(db && isAdmin && !S.demo && (S.memReg || {}).seeded && !(S.memReg || {}).seeded2 && !seedProfiles.done2){ seedProfiles.done2 = true; mergeWrite(db.doc("config/members"), {seeded2:true, profiles:extraProfiles()}).catch(() => { seedProfiles.done2 = false; }); }
  if(!db || !isAdmin || S.demo || seedProfiles.done || (S.memReg || {}).seeded) return;
  seedProfiles.done = true;
  mergeWrite(db.doc("config/members"), {seeded:true, profiles:defaultProfiles()}).catch(() => { seedProfiles.done = false; });
}
async function saveProfile(pid, data, msg){
  const cur = {...((getProfiles())[pid] || {})}, next = {...cur, ...data};
  if(apPreview() || S.demo){ S.memReg = {...S.memReg, seeded:true, profiles:{...getProfiles(), [pid]:next}}; toast((msg || "Saved") + " (preview only)"); if(S.callersPage) renderCallerDir(); return true; }
  const patch = (S.memReg || {}).seeded ? {profiles:{[pid]:data}} : {seeded:true, profiles:{...defaultProfiles(), [pid]:next}};
  const ok = await act(() => mergeWrite(db.doc("config/members"), patch));
  if(ok){ S.memReg = {...S.memReg, seeded:true, profiles:{...getProfiles(), [pid]:next}}; toast(msg || "Saved"); }
  return ok;
}
function memProfileEditor(m){
  const p = m.p || {}, c = p.cats || {};
  const opt = (v, cur, l) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`;
  const box = grp => allCats().filter(x => x[3] === grp).map(([k, l, col, , d]) => `<label style="--c:${col}"><input type="checkbox" data-pcat="${k}" ${c[k] ? "checked" : ""}><span><span class="t">${esc(l)}</span><small>${esc(d)}</small></span></label>`).join("");
  return `<div class="mcedit"><h4>Member details</h4><div class="aform">
      <div class="af"><label for="pf_name">Display name</label><input id="pf_name" value="${esc(p.name || "")}" maxlength="40"></div>
      <div class="af" style="max-width:140px"><label for="pf_color">Avatar color</label><input id="pf_color" type="color" value="${esc(p.color || "#4DA3FF")}" style="height:40px;padding:2px"></div>
      <div class="af"><label for="pf_type">Account type</label><select id="pf_type">${ACCT.filter(a => a[0] !== "owner").map(([k, l]) => opt(k, p.type || "member", l)).join("")}</select></div>
      <div class="af"><label for="pf_rec">Caller record</label><input id="pf_rec" value="${esc(p.rec || "")}" placeholder="64% · 31" maxlength="30"></div>
      <div class="af"><label for="pf_next">Next call</label><select id="pf_next">${opt("", p.next || "", "No call")}${opt("up", p.next || "", "▲ UP")}${opt("down", p.next || "", "▼ DOWN")}</select></div>
      <div class="af"><label for="pf_status">Status</label><select id="pf_status">${opt("offline", p.status || "offline", "Offline")}${opt("online", p.status, "Online")}${opt("live", p.status, "Live (streaming)")}</select></div>
      <div class="af"><label for="pf_voice">In voice room</label><select id="pf_voice">${opt("", p.voice || "", "None")}${[["cortex","Cortex"], ...Object.entries(SECTIONS).map(([k, x]) => [k, x.name])].map(([k, l]) => opt(k, p.voice || "", l)).join("")}</select></div>
      <div class="af"><label for="pf_ltitle">Stream title</label><input id="pf_ltitle" value="${esc(p.liveTitle || "")}" maxlength="80" placeholder="BTC 15m rounds, live"></div>
      <div class="af"><label for="pf_lurl">Stream link</label><input id="pf_lurl" type="url" value="${esc(p.liveUrl || "")}" placeholder="https://"></div>
      <div class="af"><label for="pf_lmedia">Stream type</label><select id="pf_lmedia">${opt("video", p.liveMedia || "video", "Video")}${opt("audio", p.liveMedia || "video", "Audio")}</select></div>
      <div class="af"><span class="fl">Coin balance</span><span class="pfine">${esc(coinHoldTxt("p:" + m.pid) || "0")} · from the ledger</span></div></div>
    ${socialEditor("pf", p)}
    ${listingEditor("pl", p.row || rowOf({key:"p:" + m.pid}).src.row || (p.sample ? {ups:rowOf({key:"p:" + m.pid, mock:true}).ups} : {}), "their")}
    <h4>Categories · unlock activities</h4><div class="mcgrid">${box("unlocks")}</div>
    <h4>Categories · labels</h4><div class="mcgrid">${box("label")}</div>
    <label class="atog"><input type="checkbox" id="pf_sample" ${p.sample ? "checked" : ""}>Sample profile (shows a SAMPLE tag; hidden when sample callers are switched off)</label>
    <div class="aacts"><button class="btn sm" type="button" data-pfsave="${esc(m.pid)}">Save details</button><button class="xbtn" type="button" data-mcedit="">Cancel</button><span style="flex:1"></span>${confirmBtn("pdel:" + m.pid, "Delete profile", `data-pfdel="${esc(m.pid)}"`)}</div></div>`;
}
$("adminPage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if(d.pfsave){ const pid = d.pfsave, name = apV("pf_name"); if(!name) return toast("Give them a display name.");
    const url = apV("pf_lurl"); if(!urlOk(url)) return toast("Stream links need to start with https://");
    const cats = Object.fromEntries([...document.querySelectorAll("[data-pcat]")].map(i => [i.dataset.pcat, i.checked]));
    const data = {name, color:$("pf_color").value, type:apV("pf_type"), rec:apV("pf_rec"), next:apV("pf_next"), status:apV("pf_status"), voice:apV("pf_voice"), liveTitle:apV("pf_ltitle"), liveUrl:url, liveMedia:apV("pf_lmedia"), sample:apCk("pf_sample"), cats, row:readListing("pl", (getProfiles()[pid] || {}).row || {ups:rowOf({key:"p:" + pid, mock:!!(getProfiles()[pid] || {}).sample}).ups})};
    { const so2 = readSocial("pf"); if(so2.err) return toast(so2.err); Object.assign(data, {socials:so2.socials, hideSoc:so2.hideSoc, promo:so2.promo, showWeb:so2.showWeb, showDiscord:so2.showDiscord}); }
    if(await saveProfile(pid, data, `${name} saved`)){ S.memEdit = null; renderAdmin.lastTab = null; renderAdmin(); }
    return; }
  if(d.pfdel){ S.apConfirm = null; if(await saveProfile(d.pfdel, {deleted:true}, "Profile deleted")){ S.memEdit = null; renderAdmin.lastTab = null; renderAdmin(); } return; }
  if("pfnew" in d){ const pid = "m" + Date.now().toString(36); const caller = d.pfnew === "caller";
    const data = {name:caller ? "New caller" : "New member", color:"#4DA3FF", type:"member", cats:caller ? {caller:true} : {}, rec:"", next:"", status:"offline", voice:"", liveTitle:"", liveUrl:"", liveMedia:"video", hold:"", wallet:"", sample:false, t:Date.now(), f:Date.now()};
    if(await saveProfile(pid, data, caller ? "Caller added: fill in their details" : "Member added: fill in their details")){ S.memF = "all"; S.memQ = ""; S.memEdit = "p:" + pid; renderAdmin.lastTab = null; renderAdmin(); setTimeout(() => { const n = $("pf_name"); if(n){ n.scrollIntoView({block:"center"}); n.select(); } }, 30); }
    return; }
});


S.entEdit = null;
function entEditor(eid, x){
  const opt = (v, cur, l) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`, bot = x.kind === "bot";
  return `<div class="mcedit"><div class="aform">
    <div class="af"><label for="en_name">Name</label><input id="en_name" value="${esc(x.name || "")}" maxlength="40"></div>
    <div class="af"><label for="en_owner">Built by</label><input id="en_owner" value="${esc(x.owner || "")}" maxlength="40"></div>
    <div class="af" style="max-width:140px"><label for="en_color">Color</label><input id="en_color" type="color" value="${esc(x.color || "#4DA3FF")}" style="height:40px;padding:2px"></div>
    <div class="af"><label for="en_status">Status</label><select id="en_status">${opt("running", x.status, "Running")}${opt("paused", x.status, "Paused")}${opt("live", x.status, "Live (streaming)")}</select></div>
    <div class="af"><label for="en_rec">Record</label><input id="en_rec" value="${esc(x.rec || "")}" placeholder="61% · 88"></div>
    ${bot ? `<div class="af w"><label for="en_src">Data sources (comma separated)</label><input id="en_src" value="${esc((x.sources || []).join(", "))}"></div>`
      : `<div class="af"><label for="en_mk">Market</label><input id="en_mk" value="${esc(x.market || "")}" placeholder="BTC 15m"></div><div class="af"><label for="en_sig">Signal</label><select id="en_sig">${opt("long", x.signal, "Long")}${opt("neutral", x.signal, "Neutral")}${opt("short", x.signal, "Short")}</select></div>`}
    <div class="af w"><label for="en_desc">Description</label><input id="en_desc" value="${esc(x.desc || "")}" maxlength="160"></div>
    <div class="af"><label for="en_lt">Stream title</label><input id="en_lt" value="${esc(x.liveTitle || "")}"></div><div class="af"><label for="en_lu">Stream link</label><input id="en_lu" type="url" value="${esc(x.liveUrl || "")}" placeholder="https://"></div></div>
    ${socialEditor("en", x)}
    ${listingEditor("el", x.row || (x.sample ? {ups:rowOf({key:"e:" + eid, mock:true}).ups} : {}), "its")}
    <label class="atog"><input type="checkbox" id="en_sample" ${x.sample ? "checked" : ""}>Sample listing</label>
    <div class="aacts"><button class="btn sm" type="button" data-ensave="${esc(eid)}">Save</button><button class="xbtn" type="button" data-enedit="">Cancel</button><span style="flex:1"></span>${confirmBtn("endel:" + eid, "Delete", `data-endel="${esc(eid)}"`)}</div></div>`;
}
$("adminPage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if("enedit" in d){ S.entEdit = d.enedit || null; renderAdmin.lastTab = null; renderAdmin(); return; }
  if(d.ensave){ const eid = d.ensave, x = getEnts()[eid] || {}, name = apV("en_name"); if(!name) return toast("Name it first."); const lu = apV("en_lu"); if(!urlOk(lu)) return toast("Links need to start with https://");
    const so2 = readSocial("en"); if(so2.err) return toast(so2.err);
    const data = {row:readListing("el", x.row || {ups:rowOf({key:"e:" + eid, mock:!!x.sample}).ups}), ...so2, name, owner:apV("en_owner"), color:$("en_color").value, status:apV("en_status"), rec:apV("en_rec"), desc:apV("en_desc"), liveTitle:apV("en_lt"), liveUrl:lu, sample:apCk("en_sample")};
    if(x.kind === "bot") data.sources = apV("en_src").split(",").map(z => z.trim()).filter(Boolean); else { data.market = apV("en_mk"); data.signal = apV("en_sig"); }
    if(await saveEnt(eid, data, `${name} saved`)){ S.entEdit = null; renderAdmin.lastTab = null; renderAdmin(); } return; }
  if(d.endel){ S.apConfirm = null; if(await saveEnt(d.endel, {deleted:true}, "Deleted")){ S.entEdit = null; renderAdmin.lastTab = null; renderAdmin(); } return; }
  if(d.ennew){ const eid = "n" + Date.now().toString(36), bot = d.ennew === "bot";
    if(await saveEnt(eid, {kind:d.ennew, name:bot ? "New bot" : "New script", owner:"", color:bot ? "#4DA3FF" : "#B98CFF", status:"running", rec:"", desc:"", sources:[], market:bot ? "" : "BTC 15m", signal:bot ? "" : "neutral", liveTitle:"", liveUrl:"", sample:false, t:Date.now()}, bot ? "Bot added" : "Script added")){ S.entEdit = eid; renderAdmin.lastTab = null; renderAdmin(); setTimeout(() => $("en_name")?.select(), 30); } return; }
});


// ---------- listings: what each approved member shows on their row ----------
S.listCfg = {};
const LFIELDS = [["status","Online / live status"],["next","Next call or signal"],["voice","Voice room"],["tagline","Tagline"],["markets","Markets or what it reads"],["links","Social links"],["cta","Main button (e.g. Join my Discord)"],["highlights","Highlights"],["updates","Status updates"],["watch","Watch / Listen button"]];
const lcfg = () => S.listCfg || {};
const lMax = () => Math.max(0, Math.min(5, +(lcfg().maxUps ?? 3)));
const lLen = () => Math.max(20, Math.min(200, +(lcfg().maxLen ?? 80)));
const fieldAllowed = f => !(lcfg().off || {})[f];
const SAMPLE_UPS = ["Live at the 9:30 open, BTC 15m all morning","New strategy write-up on my message board","3 wins in a row on ETH hourly 🔥","Taking calls in the Cortex voice room tonight","Sunday Q&A for new members, 2 PM ET","Back from break, calling every window today","Just shipped v2: faster reads, fewer false signals","Free walkthrough of my setup on Twitch Friday"];
function rowSrc(c){
  const k = c.key || "";
  if(/^p:/.test(k)){ const p = getProfiles()[k.slice(2)] || {}; return {row:p.row, tagline:p.tagline, markets:p.markets, links:p, sample:!!p.sample, seed:k}; }
  if(/^e:/.test(k)){ const e = getEnts()[k.slice(2)] || {}; return {row:e.row, tagline:e.desc, markets:null, links:e, sample:!!e.sample, seed:k}; }
  if(/^[bs]:/.test(k)){ const uid = k.split(":")[1], pub = pubOf(uid); return {row:pub.row, tagline:pub.tagline, markets:null, links:pub, sample:false, seed:k}; }
  const pub = pubOf(c.id || k); return {row:pub.row, tagline:pub.tagline, markets:pub.markets, links:pub, sample:!!c.mock, seed:k};
}
function rowOf(c){
  const src = rowSrc(c), r = src.row || {};
  let ups = Array.isArray(r.ups) ? r.ups : [];
  if(!src.row && src.sample){ const h2 = [...src.seed].reduce((a, ch) => a + ch.charCodeAt(0), 0); ups = h2 % 3 === 2 ? [] : [{t:Date.now() - (h2 % 9 + 1)*3600000, b:SAMPLE_UPS[h2 % SAMPLE_UPS.length]}, ...(h2 % 3 === 0 ? [{t:Date.now() - 2*86400000, b:SAMPLE_UPS[(h2 + 3) % SAMPLE_UPS.length]}] : [])]; }
  const days = +(lcfg().days || 0); if(days) ups = ups.filter(u => Date.now() - u.t < days*86400000);
  if((lcfg().locked || {})[c.key] || (c.id && (lcfg().locked || {})[c.id])) ups = [];
  return {show:r.show || {}, ups:ups.slice(0, lMax()), src};
}
const showsField = (R, f) => fieldAllowed(f) && R.show[f] !== false;
function rowHtml(c, opts){
  opts = opts || {};
  const R = opts.R || rowOf(c), on = f => showsField(R, f);
  const av = `<button type="button" class="plink" data-prof="${esc(c.key)}" aria-label="Open profile">${c.demo ? `<span class="av" style="background:${c.color}"></span>` : avatar(c.id)}</button>`;
  const name = `<button type="button" class="plink who" data-prof="${esc(c.key)}">${esc(c.name || "Member")}</button>`;
  const url = c.live && /^https:\/\//.test(c.live.url || "") ? c.live.url : null;
  const st = c.live ? `<span class="rb lv">LIVE</span>` : c.online ? `<span>online</span>` : `<span>offline</span>`;
  const fol = !c.demo && meId && c.id !== meId ? `<button class="xbtn2" type="button" data-follow="${esc(c.id)}" aria-pressed="${S.follows.includes(c.id)}">${S.follows.includes(c.id) ? "Following" : "Follow"}</button>` : "";
  const parts = [];
  if(c.ent){ const e = c.ent, bot = e.kind === "bot";
    if(on("status")) parts.push(c.live ? `<span class="rb lv">LIVE</span>` : e.status === "paused" ? `<span>paused</span>` : `<span>running</span>`);
    parts.push(`<span>by ${e.ownerId ? `<span>${who(e.ownerId)}</span>` : esc(e.owner || "—")}</span>`);
    parts.push(revMini(c.key));
    if(on("markets")) parts.push(bot ? (e.sources || []).slice(0, 3).map(x => `<span>${esc(x)}</span>`).join("") : `<span>${esc(e.market || "")}</span>`);
    if(on("next") && !bot && e.signal) parts.push(`<span class="nx ${e.signal === "long" ? "up" : e.signal === "short" ? "down" : ""}">${esc(e.signal.toUpperCase())}</span>`);
  } else {
    if(on("status")) parts.push(st);
    parts.push(revMini(c.key));
    if(on("next") && c.next) parts.push(`<span class="nx ${c.next.d}">next ${c.next.d === "up" ? "▲ UP" : "▼ DOWN"}</span>`);
    if(on("voice") && c.voice) parts.push(`<span>🔊 ${esc(voiceName(c.voice))} voice</span>`);
    if(on("markets") && (R.src.markets || []).length) parts.push(`<span class="mk">${R.src.markets.map(esc).join(" · ")}</span>`);
  }
  const tag = on("tagline") && R.src.tagline ? `<div class="rtag">${esc(R.src.tagline)}</div>` : "";
  const ups = on("updates") && R.ups.length ? `<div class="rups">${R.ups.map(u => `<span class="rup"><i></i>${esc(u.b)}<small>${esc(ago(u.t))}</small></span>`).join("")}</div>` : "";
  const lk = on("links") && R.src.links ? linkPills(R.src.links, 5).replace('class="plinks"', 'class="plinks rlinks"') : "";
  const pr = (R.src.links || {}).promo || {}, hl = on("highlights") && (pr.highlights || []).length ? `<div class="phl rhl">${pr.highlights.slice(0, 3).map(x => `<i>🏆 ${esc(x)}</i>`).join("")}</div>` : "", cta = on("cta") ? promoHtml(R.src.links, true) : "";
  const hold = on("holder") && !c.ent && balanceOf(c.key) + (c.id ? balanceOf(c.id) : 0) > 0 ? `<span class="rb hold">HOLDER</span>` : "";
  const showLive = on("status") || !c.ent;
  return `<div class="dcr"><span class="avw">${av}${on("status") && (c.online || c.live) ? `<i class="sdot${c.live ? " lv" : c.voice ? " vo" : ""}"></i>` : ""}</span>
      <div class="nm">${name}${isFav(c.key, c.name) ? `<span class="fv" title="In your favorites">★</span>` : ""} ${c.badge || `<span class="rb cal">CALLER ✓</span>`}${isDemon(c.key) || isDemon(c.id) ? demonBadge : ""}${!c.ent && spCanBiz(c.id || c.key) && spBizOn(c.id || c.key) ? `<span class="rb biz">BUSINESS</span>` : ""}${hold}${c.mock ? `<span class="rb str">SAMPLE</span>` : ""}${tag}<div class="l2">${parts.join("")}</div>${hl}${ups}${lk}</div>
      <div class="acts">${cta}${url && on("watch") ? `<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${c.live.media === "audio" ? "Listen" : "Watch"} ↗</a>` : ""}${opts.preview ? "" : `<button class="xbtn2" type="button" data-dcboard="${esc(c.key)}">Message board</button>${fol}`}</div></div>`;
}
function subscribeListing(){ if(!db) return; db.doc("config/vxhost").onSnapshot(sn => { S.vxHost = sn.exists ? sn.data() : {}; renderBattle(); }, () => {}); db.doc("config/vxstage").onSnapshot(sn => { S.vxStage = sn.exists ? sn.data() : null; renderBattle(); }, () => {}); db.doc("config/vxperm").onSnapshot(sn => { S.vxPerm = sn.exists ? sn.data() : {}; renderBattle(); if(S.vortexPage) renderVxWho(); }, () => {}); db.doc("config/vxscreens").onSnapshot(sn => { S.vxScreens = sn.exists ? sn.data() : {}; renderBattle(); }, () => {}); db.doc("config/listing").onSnapshot(sn => { S.listCfg = sn.exists ? sn.data() : {}; if(S.callersPage) renderCallerDir(); if(S.cortex) renderCortex(); if(S.mePage && S.mpTab === "listing"){ renderMe.lastTab = null; renderMe(); } if(S.adminPage && S.apTab === "listings"){ renderAdmin.lastTab = null; renderAdmin(); } }, () => {}); }
// shared editor block (member page + admin editors)
function listingEditor(px, row, kindLabel){
  row = row || {}; const show = row.show || {}, ups = Array.isArray(row.ups) ? row.ups : [];
  return `<div class="lsted"><h4>Show on ${esc(kindLabel || "my")} row</h4><div class="chips">${LFIELDS.map(([f, l]) => fieldAllowed(f) ? `<label><input type="checkbox" data-${px}show="${f}" ${show[f] === false ? "" : "checked"}>${esc(l)}</label>` : `<label class="off" title="Turned off by the site admin"><input type="checkbox" disabled>${esc(l)} · off</label>`).join("")}<label class="off" title="Reviews always show"><input type="checkbox" checked disabled>Reviews · always on</label></div>
    ${fieldAllowed("updates") ? `<h4>Status updates <span>${ups.length} / ${lMax()}</span></h4><div class="lups" id="${px}Ups">${ups.map((u, i) => `<div class="lup"><span>${esc(u.b)}</span><small>${esc(ago(u.t))}</small><button class="xbtn" type="button" data-${px}updel="${i}">remove</button></div>`).join("") || `<p class="pfine">No updates yet.</p>`}</div>
      ${ups.length < lMax() ? `<div class="bform"><input id="${px}UpIn" maxlength="${lLen()}" placeholder="What's new? e.g. Live at the 9:30 open"><button class="btn ghost sm" type="button" data-${px}upadd>Add update</button></div><small class="pfine">Up to ${lMax()} updates, ${lLen()} characters each${lcfg().days ? `, shown for ${lcfg().days} day${lcfg().days > 1 ? "s" : ""}` : ""}.</small>` : `<p class="pfine">You've reached the limit of ${lMax()}. Remove one to add another.</p>`}` : `<p class="pfine">Status updates are turned off by the site admin.</p>`}</div>`;
}
function readListing(px, base){
  const show = {}; document.querySelectorAll(`[data-${px}show]`).forEach(i => show[i.dataset[px + "show"]] = i.checked);
  return {show:{...((base || {}).show || {}), ...show}, ups:((base || {}).ups || []).slice(0, lMax())};
}
function listingClicks(px, getRow, setRow){
  document.addEventListener("click", async e => {
    const add = e.target.closest(`[data-${px}upadd]`), del = e.target.closest(`[data-${px}updel]`); if(!add && !del) return;
    const row = {...(getRow() || {}), ups:[...((getRow() || {}).ups || [])]};
    if(add){ const v2 = ($(px + "UpIn").value || "").trim().slice(0, lLen()); if(!v2) return toast("Write the update first."); if(row.ups.length >= lMax()) return toast("You've reached the limit."); row.ups.unshift({t:Date.now(), b:v2}); }
    if(del) row.ups.splice(+del.dataset[px + "updel"], 1);
    row.show = readListing(px, row).show;
    await setRow(row);
  });
}
// member side
listingClicks("ml", () => myPub().row || {}, async row => { await savePub({row}, "Listing updated"); renderMe.lastTab = null; renderMe(); });


listingClicks("pl", () => { const pid = (S.memEdit || "").slice(2), p = getProfiles()[pid] || {}; return p.row || {ups:rowOf({key:"p:" + pid, mock:!!p.sample}).ups}; }, async row => { const pid = (S.memEdit || "").slice(2); await saveProfile(pid, {row}, "Listing updated"); renderAdmin.lastTab = null; renderAdmin(); });
listingClicks("el", () => { const x = getEnts()[S.entEdit] || {}; return x.row || {ups:rowOf({key:"e:" + S.entEdit, mock:!!x.sample}).ups}; }, async row => { await saveEnt(S.entEdit, {row}, "Listing updated"); renderAdmin.lastTab = null; renderAdmin(); });
// ---------- admin: members directory ----------
S.memReg = {}; S.memProf = {}; S.memF = "all"; S.memG = "type"; S.memQ = ""; S.memSort = "name"; S.memSearched = false; S.memNoteOpen = null;
const ACCT = [["owner","Owner","#FFD166"],["staff","Staff / Admin","#FF4D6A"],["mod","Moderator","#FF8A3D"],["partner","Partner","#5BE3C8"],["vip","VIP","#B98CFF"],["member","Member","#8FA3B2"],["guest","Guest","#9AA6B2"],["restricted","Restricted","#587080"]];
const MCAT_AUTO = [["demon","Demons","#FF4D6A"],["reviewer","Reviewers","#9FF3CF"],["online","Online now","var(--up)"],["verified","Callers","var(--callers)"],["pending","Pending verification","#FFB547"],["botdev","Bot devs","var(--bots)"],["scripter","Scripters","var(--scripts)"],["streamer","Streamers","var(--live)"],["mod","Chat moderators","#FF8A3D"],["chatter","Active in chat","#4DA3FF"],["guest","Guests","#8FA3B2"],["muted","Muted","#FF4D6A"]];
const MCAT_EXTRA = () => allCats().filter(([k]) => !["caller","streamer","holder","mod","botdev","scripter","reviewer","voter","demon"].includes(k)).map(([k, l, c]) => [k, l + (/s$/.test(l) ? "" : "s"), c]);
let MCAT = MCAT_AUTO;
const MOCK_MEMBERS = [["Ava Strike","vip",["verified","streamer","online","chatter","holder","creator"]],["BlockBaron","member",["verified","online"]],["Cipher Kay","member",["verified"]],["Delta Dan","partner",["verified","streamer","online","holder","mentor"]],["Fib Fox","member",["verified","online","chatter"]],["Luna Levels","vip",["verified","holder"]],["Marlowe","mod",["verified","online","chatter","mod","holder"]],["Pip Queen","member",["verified"]],["Tidewatch","member",["verified"]],["Zed Momentum","member",["verified","online"]],
  ["gridlord","member",["botdev","online","chatter","battle","holder"]],["m0mentum","member",["botdev","online","battle","beta"]],["Quiet Mike","member",["scripter","online"]],["theta_tina","vip",["streamer","online","chatter"]],["lurker99","member",["online"]],["newbie_nate","member",["pending"]],["sol_sally","member",["pending","chatter"]],["guest_trader","member",["guest"]],["spam_bot_77","restricted",["muted"]]];
function memberIds(){
  const ids = new Set(), add = x => { if(x && typeof x === "string") ids.add(x); };
  Object.keys(S.memReg.seen || {}).forEach(add); Object.keys(S.memReg.types || {}).forEach(add);
  Object.keys(S.verified || {}).forEach(add); (S.requests || []).forEach(r => add(r.id)); Object.keys(S.streamers || {}).forEach(add);
  Object.entries(S.botDocs || {}).forEach(([u, d]) => { if(Object.keys(d.list || {}).length) add(u); });
  Object.entries(S.scDocs || {}).forEach(([u, d]) => { if(Object.keys(d.list || {}).length) add(u); });
  (S.threads || []).forEach(t => { add(t.authorId); add(t.lastAuthorId); }); (S.streams || []).forEach(x => add(x.hostId));
  if(!S.demo) loungeMsgs().forEach(m => add(m.a));
  onlinePeople().forEach(p => add(p.id)); Object.keys(S.mod.muted || {}).forEach(add);
  Object.keys(S.memProf).forEach(add); add(meId);
  return [...ids];
}
function memberList(){
  MCAT = MCAT_AUTO.concat(MCAT_EXTRA());
  if(!db || S.demo){ const pm = profileMembers(), have = new Set(pm.map(m => m.name.toLowerCase())); return pm.concat(MOCK_MEMBERS.filter(([n]) => !have.has(n.toLowerCase()) && !MOCK_CALLERS.some(c => c.name === n)).map(([n, type, cats]) => ({id:"mock-" + n, name:n, type, cats:new Set(cats), mock:true, last:cats.includes("online") ? Date.now() : Date.now() - 36e5*(3 + n.length), msgs:cats.includes("chatter") ? 5 + n.length : 0, hold:coinHoldTxt("mock-" + n)}))); }
  const on = new Set(onlinePeople().map(p => p.id)), day = Date.now() - 7*864e5, msgs = {};
  loungeMsgs().forEach(m => { if(m.a) msgs[m.a] = (msgs[m.a] || 0) + 1; });
  const seen = S.memReg.seen || {}, types = S.memReg.types || {};
  seedProfiles();
  return profileMembers().concat(memberIds().map(id => {
    const p = S.memProf[id] || {}, cats = new Set();
    if(on.has(id)) cats.add("online"); if(isVerified(id)) cats.add("verified"); if((S.requests || []).some(r => r.id === id)) cats.add("pending");
    if(Object.keys(((S.botDocs || {})[id] || {}).list || {}).length) cats.add("botdev"); if(Object.keys(((S.scDocs || {})[id] || {}).list || {}).length) cats.add("scripter");
    if((S.streamers || {})[id] || (S.streams || []).some(x => x.hostId === id && x.status === "live")) cats.add("streamer");
    if(msgs[id]) cats.add("chatter"); if(p.guest) cats.add("guest"); if(isMuted(id)) cats.add("muted");
    for(const [k, v2] of Object.entries(catsOf(id))) if(v2 === true) cats.add(k);
    if(balanceOf(id) > 0) cats.add("holder"); if(isDemon(id)) cats.add("demon");
    const type = types[id] || (id === meId && isOwner ? "owner" : id === meId && isAdmin ? "staff" : p.guest ? "guest" : "member");
    return {id, name:p.name || "", avatar:p.avatarUrl, guest:!!p.guest, type, cats, first:(seen[id] || {}).f, last:on.has(id) ? Date.now() : (seen[id] || {}).l || 0, msgs:msgs[id] || 0, note:(S.memNotes || {})[id] || "", hold:coinHoldTxt(id)};
  }));
}
async function memLoadProfiles(){
  if(!user || !db || memLoadProfiles.busy) return;
  memLoadProfiles.busy = true;
  try {
    if(!S.memSearched && user.search){ S.memSearched = true; try { const hits = await user.search(""); (hits || []).forEach(h => { if(h && h.id && !S.memProf[h.id]) S.memProf[h.id] = {name:h.name, avatarUrl:h.avatarUrl}; }); } catch {} }
    const need = memberIds().filter(id => !S.memProf[id] || S.memProf[id].guest === undefined);
    for(let i = 0; i < need.length; i += 60){ const ps = await user.profiles(need.slice(i, i + 60)); for(const id of need.slice(i, i + 60)){ const p = ps && ps[id]; S.memProf[id] = p ? {name:p.name, avatarUrl:p.avatarUrl, guest:!!p.guest} : {name:"", guest:false}; } }
  } catch {}
  memLoadProfiles.busy = false;
  if(S.adminPage && S.apTab === "members"){ renderAdmin.lastTab = null; renderAdmin(); }
}
// admins quietly keep the member registry up to date (who has been seen, first/last visit)
let memSeenAt = {};
function memTrackSeen(){
  if(!db || !isAdmin || S.demo) return;
  const now = Date.now(), seen = S.memReg.seen || {}, patch = {};
  for(const p of onlinePeople()){ if(!p.id) continue; if(memSeenAt[p.id] && now - memSeenAt[p.id] < 10*60000) continue; memSeenAt[p.id] = now; patch[p.id] = seen[p.id] && seen[p.id].f ? {l:now} : {f:now, l:now}; }
  if(Object.keys(patch).length) mergeWrite(db.doc("config/members"), {seen:patch}).catch(() => {});
}
setInterval(memTrackSeen, 60000); setTimeout(memTrackSeen, 8000);
function renderMembersTab(){
  const L = memberList(), q = S.memQ.trim().toLowerCase();
  if(db && !S.demo && L.some(m => !m.profile && !S.memProf[m.id])) memLoadProfiles();
  const nm = m => m.name || "Member";
  const cnt = k => k === "all" ? L.length : ACCT.some(a => a[0] === k) ? L.filter(m => m.type === k).length : L.filter(m => m.cats.has(k)).length;
  let F = L.filter(m => S.memF === "all" || m.type === S.memF || m.cats.has(S.memF)).filter(m => !q || nm(m).toLowerCase().includes(q) || (m.note || "").toLowerCase().includes(q));
  F.sort(S.memSort === "recent" ? (a, b) => (b.last || 0) - (a.last || 0) : S.memSort === "active" ? (a, b) => b.msgs - a.msgs : (a, b) => nm(a).localeCompare(nm(b), undefined, {sensitivity:"base"}));
  const typeSel = m => (m.mock && !m.profile) || m.type === "owner" ? `<span class="tb" style="--c:${ACCT.find(a => a[0] === m.type)[2]}">${esc(ACCT.find(a => a[0] === m.type)[1].toUpperCase())}</span>`
    : `<select data-memtype="${esc(m.id)}" aria-label="Account type">${ACCT.filter(a => a[0] !== "owner").map(([k, l]) => `<option value="${k}" ${m.type === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const ago2 = t => !t ? "not seen yet" : Date.now() - t < 90000 ? "online now" : "seen " + ago(t);
  const row = m => {
    const av = m.profile ? `<span class="av" style="background:${esc(m.color)}"></span>` : m.mock ? `<span class="av" style="background:hsl(${[...m.name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 70% 62%)"></span>` : `<img class="av" alt="" src="${esc(m.avatar || "")}">`;
    const acts = m.profile ? `<button class="xbtn2" type="button" data-mcedit="${esc(m.id)}">Edit details</button><button class="xbtn2" type="button" data-memnote="${esc(m.id)}">${m.note ? "Edit note" : "Note"}</button>${m.sample ? `<span class="rb str">SAMPLE</span>` : ""}<span class="rb str" title="A record you manage by hand; not tied to a sign-in">PROFILE</span>`
      : m.mock ? `<button class="xbtn2" type="button" data-mcedit="${esc(m.id)}">Categories</button><span class="rb str">SAMPLE</span>` : [
      m.id !== meId && !isVerified(m.id) ? `<button class="xbtn2" type="button" data-verify="${esc(m.id)}">Verify</button>` : "",
      m.id !== meId && isVerified(m.id) ? confirmBtn("rev:" + m.id, "Revoke caller", `data-revoke-yes="${esc(m.id)}"`) : "",
      m.id !== meId && !isVerified(m.id) ? ((S.streamers || {})[m.id] ? `<button class="xbtn2" type="button" data-unstream="${esc(m.id)}">Revoke stream</button>` : `<button class="xbtn2" type="button" data-allowstream="${esc(m.id)}">Allow stream</button>`) : "",
      m.id !== meId ? (isMuted(m.id) ? `<button class="xbtn2" type="button" data-apunmute="${esc(m.id)}">Unmute</button>` : `<button class="xbtn2" type="button" data-apmute="${esc(m.id)}">Mute 1 day</button>`) : "",
      `<button class="xbtn2" type="button" data-mcedit="${esc(m.id)}">Categories</button>`,
      `<button class="xbtn2" type="button" data-memnote="${esc(m.id)}">${m.note ? "Edit note" : "Note"}</button>`].join("");
    return `<div class="mrow"><span class="avw">${av}${m.cats.has("online") ? `<i class="sdot"></i>` : ""}</span>
      <div style="min-width:0"><div class="nm"><button type="button" class="plink" data-prof="${esc(m.id)}">${esc(nm(m))}</button>${m.id === meId ? ` <small style="color:var(--ink-3);font:12px var(--mono)">(you)</small>` : ""}</div>
      <div class="bd">${typeSel(m)}${MCAT.filter(([k]) => k !== "online" && m.cats.has(k)).map(([k, l, c]) => `<span class="tb" style="--c:${c}">${esc(l.replace(/s$/, "").replace("Active in chat", "Chatter").toUpperCase())}</span>`).join("")}</div>
      <div class="meta">${m.profile ? `${esc(m.p.status === "live" ? "live now" : m.p.status === "online" ? "online" : "offline")}${m.cats.has("verified") && m.p.rec ? ` · record ${esc(m.p.rec)}` : ""}${m.p.next ? ` · next ${m.p.next === "up" ? "▲ UP" : "▼ DOWN"}` : ""}${m.note ? ` · note: ${esc(m.note)}` : ""}</div>` : `${esc(ago2(m.last))}${m.first ? ` · joined ${esc(new Date(m.first).toLocaleDateString())}` : ""} · ${m.msgs} chat msg${m.msgs === 1 ? "" : "s"}${m.note ? ` · note: ${esc(m.note)}` : ""}</div>`}</div>
      <div class="ma">${acts}</div>
      ${S.memEdit === m.id ? (m.profile ? memProfileEditor(m) : memCatEditor(m)) : ""}
      ${S.memNoteOpen === m.id ? `<div class="note"><input id="memNoteIn" value="${esc(m.note || "")}" maxlength="200" placeholder="Private note (only you can see it)"><button class="btn sm" type="button" data-memnotesave="${esc(m.id)}">Save</button><button class="xbtn" type="button" data-memnote="">Cancel</button></div>` : ""}</div>`;
  };
  let body = "";
  if(!F.length) body = `<div class="aempty">No members match.</div>`;
  else if(S.memG === "none") body = F.map(row).join("");
  else {
    const groups = S.memG === "type" ? ACCT.map(([k, l, c]) => [l, c, F.filter(m => m.type === k)]) : MCAT.map(([k, l, c]) => [l, c, F.filter(m => m.cats.has(k))]).concat([["No category yet", "#587080", F.filter(m => ![...m.cats].some(x => x !== "online"))]]);
    body = groups.filter(g => g[2].length).map(([l, c, a]) => `<div class="mgrp" style="--c:${c}">${esc(l)} <small>${a.length}</small></div><div>${a.map(row).join("")}</div>`).join("");
  }
  return `<div class="acard"><h3>Members <small>${L.length} total${!db || S.demo ? " · SAMPLE DATA (preview)" : ""}</small></h3>
    <p class="hint">Everyone who has visited, chatted, called, streamed, built a bot or script, or asked to be verified. <b>Account type</b> is your label for each person (VIP, Moderator, Partner…). <b>Categories</b> fill in automatically from what they do on the site.</p>
    <div class="mfil"><span class="fl" style="font:600 11px var(--mono);letter-spacing:.12em;color:var(--ink-3);align-self:center;margin-right:4px">TYPE</span>${[["all","All","#DCE7EE"], ...ACCT].map(([k, l, c]) => `<button type="button" data-memf="${k}" aria-pressed="${S.memF === k}" style="--c:${c}">${esc(l)} <b>${cnt(k)}</b></button>`).join("")}</div>
    <div class="mfil"><span class="fl" style="font:600 11px var(--mono);letter-spacing:.12em;color:var(--ink-3);align-self:center;margin-right:4px">CATEGORY</span>${MCAT.map(([k, l, c]) => `<button type="button" data-memf="${k}" aria-pressed="${S.memF === k}" style="--c:${c}">${esc(l)} <b>${cnt(k)}</b></button>`).join("")}</div>
    <div class="aacts"><button class="btn sm" type="button" data-pfnew="caller">+ Add caller</button><button class="btn ghost sm" type="button" data-pfnew="member">+ Add member</button><span class="fine" style="color:var(--ink-3);font-size:12.5px">Adds a profile you manage by hand. Callers you add here show on the Callers page.</span></div>
    <div class="mbar"><div class="af"><label for="memQ">Search</label><input id="memQ" type="search" value="${esc(S.memQ)}" placeholder="Name or note" autocomplete="off"></div>
      <div class="af" style="flex:0 1 180px"><label for="memG">Group by</label><select id="memG"><option value="type" ${S.memG === "type" ? "selected" : ""}>Account type</option><option value="cat" ${S.memG === "cat" ? "selected" : ""}>Category</option><option value="none" ${S.memG === "none" ? "selected" : ""}>No grouping</option></select></div>
      <div class="af" style="flex:0 1 180px"><label for="memSort">Sort</label><select id="memSort"><option value="name" ${S.memSort === "name" ? "selected" : ""}>Name A–Z</option><option value="recent" ${S.memSort === "recent" ? "selected" : ""}>Last seen</option><option value="active" ${S.memSort === "active" ? "selected" : ""}>Most chat activity</option></select></div></div>
    <div id="memBody" style="display:grid;gap:10px">${body}</div>
    <p class="hint" style="margin:0">Account types are labels for organizing people. Who can actually edit the site is set from the page's Share menu on claude.ai (Editors are admins).</p></div>`;
}
$("adminPage").addEventListener("input", e => { if(e.target.id === "memQ"){ S.memQ = e.target.value; const i = e.target, c = i.selectionStart; renderAdmin.lastTab = null; renderAdmin(); const n = $("memQ"); if(n){ n.focus(); try { n.setSelectionRange(c, c); } catch {} } } });
$("adminPage").addEventListener("change", async e => {
  const t = e.target;
  if(t.id === "memG"){ S.memG = t.value; renderAdmin.lastTab = null; renderAdmin(); }
  if(t.id === "memSort"){ S.memSort = t.value; renderAdmin.lastTab = null; renderAdmin(); }
  if(t.dataset.memtype && t.dataset.memtype.startsWith("p:")){ const pid = t.dataset.memtype.slice(2); await saveProfile(pid, {type:t.value}, `Account type set to ${ACCT.find(a => a[0] === t.value)[1]}`); renderAdmin.lastTab = null; renderAdmin(); return; }
  if(t.dataset.memtype){ const id = t.dataset.memtype; S.memReg = {...S.memReg, types:{...(S.memReg.types || {}), [id]:t.value}}; await apSave("config/members", {types:{[id]:t.value}}, `Account type set to ${ACCT.find(a => a[0] === t.value)[1]}`); renderAdmin.lastTab = null; renderAdmin(); }
});
$("adminPage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if(d.memf){ S.memF = d.memf; renderAdmin.lastTab = null; renderAdmin(); return; }
  if("memnote" in d){ S.memNoteOpen = d.memnote || null; renderAdmin.lastTab = null; renderAdmin(); if(S.memNoteOpen) $("memNoteIn")?.focus(); return; }
  if(d.memnotesave){ const id = d.memnotesave, val = ($("memNoteIn").value || "").trim(); S.memNotes = {...S.memNotes, [id]:val}; S.memNoteOpen = null; if(!apPreview() && meId) await act(() => mergeWrite(db.doc(`data/users/${meId}/memnotes`), {notes:{[id]:val}})); toast(apPreview() ? "Preview only." : "Note saved"); renderAdmin.lastTab = null; renderAdmin(); return; }
});



// ---------- favorites (each viewer's own list) ----------
S.favs = S.favs || [];
const favKey = (key, name) => key && !/^mock-|\(demo\)$/.test(key) ? key : "n:" + (name || key || "").replace(/ \(demo\)$/, "").toLowerCase();
const isFav = (key, name) => (S.favs || []).includes(favKey(key, name));
const fav0 = isFav;
async function toggleFav(key, name){
  const k = favKey(key, name), on = !(S.favs || []).includes(k);
  S.favs = on ? [...(S.favs || []), k].slice(-200) : (S.favs || []).filter(x => x !== k);
  toast(on ? `${(name || "Member").replace(/ \(demo\)$/, "")} added to your favorites` : "Removed from favorites");
  if(db && meId && !S.demo) await act(() => mergeWrite(db.doc(`data/users/${meId}/prefs`), {favs:S.favs}));
  if(S.callersPage || (S.cortex && (S.ftab === "callers" || cxCat(S.ftab) === "dir"))) renderCallerDir();
  renderWall();
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-proffav]"); if(!b) return;
  await toggleFav(b.dataset.proffav, b.dataset.favname);
  const k = $("profPanel").dataset.key; if(!$("profOv").hidden && k) openProfile(k, $("profPanel").dataset.view);
});


// ---------- bots & scripts directory entries ----------
const ENT_SAMPLES = [
  ["bot","DeltaFlow","Nova","#4DA3FF","running","61% · 88",["Order book","Volume delta (CVD)","Funding rate"],"Reads order-book imbalance and CVD to call the next 15m candle."],
  ["bot","LiqHunter","Redline","#FF4D6A","live","57% · 140",["Liquidations","Open interest","Exchange spreads"],"Hunts liquidation clusters and fades the squeeze."],
  ["bot","Sentinel","Kai Tides","#B98CFF","running","54% · 63",["Social sentiment","News feed","On-chain flows"],"Blends sentiment, headlines and on-chain flows into one bias."],
  ["bot","Arb Oracle","gridlord","#2EE59D","running","66% · 52",["Kalshi odds","Polymarket odds","Spot price"],"Flags pricing gaps between Kalshi and Polymarket."],
  ["bot","Funding Fox","Fib Fox","#FF8A3D","paused","52% · 31",["Funding rate","Open interest"],"Leans against crowded funding."],
  ["bot","m0mentum","m0mentum","#8FD3FF","running","59% · 97",["Price momentum","Volume"],"Rides short-term momentum bursts."],
  ["script","Session VWAP Bands","Quiet Mike","#B98CFF","live","59% · 72","BTC 15m","Session VWAP with deviation bands; mid-band is the magnet."],
  ["script","Momentum Ribbon","Nova","#FFB547","running","63% · 41","BTC 1h","Stacked EMAs that flip color when trend changes."],
  ["script","Range Sniper","Redline","#FF4D6A","running","55% · 58","ETH 15m","Marks the overnight range and signals clean breaks."],
  ["script","RSI Divergence Pro","Luna Levels","#8FD3FF","running","61% · 66","SOL 15m","Auto-draws RSI divergences with a confidence score."],
  ["script","Liquidity Map","Tidewatch","#5BE3C8","paused","58% · 29","BTC 15m","Shades resting liquidity above and below price."],
  ["script","Open Drive","Pip Queen","#F7C6FF","running","60% · 44","XRP 1h","Detects strong opens and the first pullback."]];
function defaultEnts(){ const o = {}; ENT_SAMPLES.forEach(([kind, name, owner, color, status, rec, x, desc], i) => { o["s" + (i + 1)] = {kind, name, owner, color, status, rec, desc, sources:kind === "bot" ? x : [], market:kind === "script" ? x : "", signal:kind === "script" ? ["long","neutral","short"][i % 3] : "", liveTitle:status === "live" ? `${name} running live` : "", liveUrl:status === "live" ? "https://www.twitch.tv/" : "", liveMedia:"video", sample:true, t:i, web:i % 2 ? "" : `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.io`, discord:"https://discord.gg/d3mon"}; }); return o; }
function getEnts(){ const r = S.memReg || {}, E = r.entsSeeded ? (r.ents || {}) : defaultEnts(), out = {};
  for(const [eid, e] of Object.entries(E)){ if(!e || !e.sample){ out[eid] = e; continue; } const nn = [...eid].reduce((a2, ch) => a2 + ch.charCodeAt(0), 0) + 1, slug2 = (e.name || eid).toLowerCase().replace(/[^a-z0-9]+/g, ""), sp = SAMPLE_PROMO[nn % SAMPLE_PROMO.length];
    out[eid] = {promo:e.promo || {cta:e.kind === "bot" ? "Try the bot" : "Get the script", ctaUrl:e.kind === "bot" ? `https://github.com/${slug2}` : `https://tradingview.com/script/${slug2}`, sched:e.kind === "bot" ? "Runs 24/7 · reads every 15 minutes" : "Signals update every candle close", offer:nn % 2 ? "Free for D3MON members this month" : "", highlights:sp[4]}, ...e, socials:{...sampleSocials(slug2, nn), ...(e.socials || {})}}; }
  return out; }
function seedEnts(){ if(!db || !isAdmin || S.demo || seedEnts.done || (S.memReg || {}).entsSeeded) return; seedEnts.done = true; mergeWrite(db.doc("config/members"), {entsSeeded:true, ents:defaultEnts()}).catch(() => { seedEnts.done = false; }); }
async function saveEnt(eid, data, msg){
  const next = {...(getEnts()[eid] || {}), ...data};
  if(apPreview() || S.demo){ S.memReg = {...S.memReg, entsSeeded:true, ents:{...getEnts(), [eid]:next}}; toast((msg || "Saved") + " (preview only)"); if(S.callersPage) renderCallerDir(); return true; }
  const patch = (S.memReg || {}).entsSeeded ? {ents:{[eid]:data}} : {entsSeeded:true, ents:{...defaultEnts(), [eid]:next}};
  const ok = await act(() => mergeWrite(db.doc("config/members"), patch)); if(ok){ S.memReg = {...S.memReg, entsSeeded:true, ents:{...getEnts(), [eid]:next}}; toast(msg || "Saved"); } return ok;
}
const listApproved = (key, uid, want) => !!((S.listCfg || {}).approved || {})[key] || !!catsOf(uid)[want === "bot" ? "botdev" : "scripter"] && !((S.listCfg || {}).rejected || {})[key];
function pendingListings(){ return ["bots","scripts"].flatMap(k => entityDir(k, true).filter(x => /^[bs]:/.test(x.key) && !listApproved(x.key, x.key.split(":")[1], k === "bots" ? "bot" : "script") && !((S.listCfg || {}).rejected || {})[x.key]).map(x => ({...x, sec:k}))); }
function entityDir(kind, all){
  const want = kind === "bots" ? "bot" : "script", hide = (S.site || {}).samples === false, out = [];
  for(const [eid, e] of Object.entries(getEnts())) if(e && !e.deleted && e.kind === want && !(hide && e.sample)) out.push(entItem("e:" + eid, e));
  const docs = want === "bot" ? S.botDocs : S.scDocs;
  for(const [uid, d] of Object.entries(docs || {})) for(const [id, b] of Object.entries(d.list || {})) if(all || listApproved((want === "bot" ? "b:" : "s:") + uid + ":" + id, uid, want)) out.push(entItem((want === "bot" ? "b:" : "s:") + uid + ":" + id, {kind:want, name:b.name, ownerId:uid, color:want === "bot" ? "#4DA3FF" : "#B98CFF", status:b.status || "running", rec:"", desc:b.desc || "", sources:b.sources || [], market:b.asset ? `${b.asset} ${b.tf || ""}` : "", signal:b.signal || "", liveUrl:b.url || ""}));
  return out;
}
function entItem(key, e){
  const bot = e.kind === "bot", live = e.status === "live";
  return {key, name:e.name, color:e.color || (bot ? "#4DA3FF" : "#B98CFF"), demo:true, mock:!!e.sample, ent:e, online:e.status !== "paused",
    live:live ? {title:e.liveTitle || "Live", url:e.liveUrl || "", media:e.liveMedia || "video"} : null,
    badge:`<span class="rb ${bot ? "bot" : "scr"}">${bot ? "BOT" : "SCRIPT"}</span>`,
    l2:`<span>by ${e.ownerId ? `<span>${who(e.ownerId)}</span>` : esc(e.owner || "—")}</span>${bot ? (e.sources || []).slice(0, 3).map(x => `<span>${esc(x)}</span>`).join("") : `<span>${esc(e.market || "")}</span>${e.signal ? `<span class="nx ${e.signal === "long" ? "up" : e.signal === "short" ? "down" : ""}">${esc(e.signal.toUpperCase())}</span>` : ""}`}${e.status === "paused" ? `<span>paused</span>` : ""}${revMini(key)}`};
}
const entKindOf = key => /^b:/.test(key) ? "bots" : /^s:/.test(key) ? "scripts" : /^e:/.test(key) ? ((getEnts()[key.slice(2)] || {}).kind === "bot" ? "bots" : "scripts") : "callers";

// ---------- reviews ----------
S.reviews = []; S.localReviews = {}; S.rvReqs = []; S.rvCfg = {}; S.rvDraft = {};
const safeId = k => String(k).replace(/[^A-Za-z0-9_\-.~:@+]/g, "-").slice(0, 150);
function subscribeReviews(){
  if(!db) return;
  db.collection("reviews").limit(2000).onSnapshot(sn => { S.reviews = sn.docs.map(d => ({id:d.id, ...d.data()})); refreshRB(); }, () => {});
  db.doc("config/reviews").onSnapshot(sn => { S.rvCfg = sn.exists ? sn.data() : {}; refreshRB(); }, () => {});
  db.doc("config/boards").onSnapshot(sn => { S.bCfg = sn.exists ? sn.data() : {}; refreshRB(); if(S.cortex) renderFloor(); }, () => {});
  db.doc("config/bridge").onSnapshot(sn => { S.bridge = sn.exists ? sn.data() : {}; if(S.adminPage) { renderAdmin.lastTab = null; renderAdmin(); } }, () => {});
  if(isAdmin) db.collection("reviewreq").limit(500).onSnapshot(sn => { S.rvReqs = sn.docs.map(d => ({id:d.id, ...d.data()})); if(S.adminPage){ renderAdmin.lastTab = null; renderAdmin(); } }, () => {});
  if(meId) db.doc("reviewreq/" + meId).onSnapshot(sn => { S.myRvReq = sn.exists ? sn.data() : null; if(S.mePage){ renderMe.lastTab = null; renderMe(); } }, () => {});
  if(meId) db.doc("rolereq/" + meId).onSnapshot(sn => { S.myRoleReq = sn.exists ? sn.data() : null; refreshConn(); if(S.mePage){ renderMe.lastTab = null; renderMe(); } }, () => {});
  if(isAdmin) db.collection("rolereq").limit(500).onSnapshot(sn => { S.roleReqs = sn.docs.map(d => ({id:d.id, ...d.data()})); if(S.adminPage){ renderAdmin.lastTab = null; renderAdmin(); } }, () => {});
}
function refreshRB(){ if(S.callersPage) renderCallerDir(); if(!$("profOv").hidden){ const k = $("profPanel").dataset.key; if(k) openProfile(k, $("profPanel").dataset.view); } if(S.adminPage && ["reviews","boards"].includes(S.apTab)){ renderAdmin.lastTab = null; renderAdmin(); } }
const isReviewer = id => !!id && (hasCat(id, "reviewer") || (id === meId && isAdmin));
const canReview = () => S.demo || !db ? true : !!meId && canWrite && ((S.rvCfg.who || "reviewers") === "anyone" || isReviewer(meId));
function sampleReviews(key, name){
  const seed = [...String(name || key)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const R = ["Marlowe","Luna Levels","Pip Queen","Tidewatch","Cipher Kay"], T = ["Calls are clear and on time. Explains the why, not just the direction.","Solid track record this month. Tighter risk notes would make it a 5.","Great on the hourly, a bit early on 15m reversals.","Transparent about misses, which I respect.","Consistent and easy to follow in the Cortex."];
  const n = 2 + seed % 3; return Array.from({length:n}, (_, i) => ({id:"smp" + i, t:key, a:null, an:R[(seed + i) % 5], r:3 + ((seed + i*2) % 3), b:T[(seed + i) % 5], at:Date.now() - (i + 1)*86400000*((seed % 4) + 1), sample:true}));
}
function reviewsFor(key, name, sample){
  const who2 = (S.rvCfg.who || "reviewers");
  let L = S.reviews.filter(r => r.t === key && r.b !== undefined && (who2 === "anyone" || isReviewer(r.a) || hasCat(r.a, "reviewer")));
  L = L.concat(Object.values(S.localReviews).filter(r => r.t === key));
  if(sample && !L.length) L = sampleReviews(key, name);
  return L.sort((a, b) => b.at - a.at);
}
function revStats(L){ const n = L.length, avg = n ? L.reduce((a, r) => a + (+r.r || 0), 0)/n : 0; return {n, avg}; }
const starsHtml = v => `<span class="stars">${[1,2,3,4,5].map(i => i <= Math.round(v) ? "★" : `<span class="o">★</span>`).join("")}</span>`;
function revMini(key){ const it = revLookup(key); const L = reviewsFor(key, it.name, it.sample), st = revStats(L); return st.n ? `<span class="rec">${starsHtml(st.avg)} <b>${st.avg.toFixed(1)}</b> (${st.n})</span>` : `<span class="rec">no reviews yet</span>`; }
function revLookup(key){ if(/^e:/.test(key)){ const e = getEnts()[key.slice(2)] || {}; return {name:e.name, sample:!!e.sample}; } if(/^p:/.test(key)){ const p = getProfiles()[key.slice(2)] || {}; return {name:p.name, sample:!!p.sample}; } return {name:key, sample:/^mock-|\(demo\)$/.test(key) || S.demo}; }
function reviewsSection(key, name, sample){
  const L = reviewsFor(key, name, sample), st = revStats(L), mine = L.find(r => r.a && r.a === meId) || S.localReviews[key];
  const dist = [5,4,3,2,1].map(k => [k, L.filter(r => +r.r === k).length]);
  const draft = S.rvDraft[key] || {r:mine ? mine.r : 0, b:mine ? mine.b : ""};
  let h = `<div class="psec"><h4>Reviews <span>${st.n ? `${st.n} review${st.n > 1 ? "s" : ""}` : "none yet"}</span></h4>`;
  if(st.n) h += `<div class="rvsum"><div><b>${st.avg.toFixed(1)}</b>${starsHtml(st.avg)}<small>${st.n} review${st.n > 1 ? "s" : ""}</small></div><div class="rvbars">${dist.map(([k, n]) => `<div><span>${k}</span><i><b style="width:${st.n ? n/st.n*100 : 0}%"></b></i><span>${n}</span></div>`).join("")}</div></div>`;
  h += L.slice(0, 6).map(r => `<div class="rv"><div class="h">${starsHtml(r.r)}${r.a ? who(r.a) : `<span class="who">${esc(r.an || "Reviewer")}</span>`}<span class="tb" style="--c:#9FF3CF">REVIEWER</span>${r.sample ? `<span class="rb str">SAMPLE</span>` : ""}<small>${esc(new Date(r.at).toLocaleDateString())}</small>${!r.sample && (r.a === meId || isAdmin) && r.id && !String(r.id).startsWith("loc") ? `<button class="xbtn" type="button" data-rvdel="${esc(r.id)}">delete</button>` : ""}</div>${r.b ? `<p>${esc(r.b)}</p>` : ""}</div>`).join("") || `<p class="pfine">No reviews yet.</p>`;
  const self = key === meId || key === "You (demo)";
  if(self) h += `<p class="pfine">This is you. Reviews from approved reviewers show up here.</p>`;
  else if(canReview()) h += `<div class="rvform"><span class="pfine">${mine ? "Update your review" : "Write a review"}</span><div class="rvpick" role="radiogroup" aria-label="Rating">${[1,2,3,4,5].map(i => `<button type="button" data-rvstar="${i}" class="${i <= draft.r ? "on" : ""}" aria-label="${i} star${i > 1 ? "s" : ""}">★</button>`).join("")}</div>
    <textarea id="rvText" maxlength="500" placeholder="What stood out? Accuracy, timing, how they explain the trade…">${esc(draft.b || "")}</textarea><div class="aacts"><button class="btn sm" type="button" data-rvsave="${esc(key)}">${mine ? "Update review" : "Post review"}</button></div></div>`;
  else if(db && meId) h += `<p class="pfine">${S.myRvReq ? "Your reviewer application is waiting for an admin." : `Only approved reviewers can write reviews. <button class="xbtn2" type="button" data-rvapply>Apply to be a reviewer</button>`}</p>`;
  return h + `</div>`;
}
document.addEventListener("click", async e => {
  const t = e.target;
  const st = t.closest("[data-rvstar]"); if(st){ const key = $("profPanel").dataset.key; S.rvDraft[key] = {r:+st.dataset.rvstar, b:($("rvText") || {}).value || ""}; openProfile(key, $("profPanel").dataset.view); return; }
  const sv = t.closest("[data-rvsave]"); if(sv){ const key = sv.dataset.rvsave, d = S.rvDraft[key] || {}, r = d.r || 0, b = ($("rvText").value || "").trim();
    if(!r) return toast("Pick 1 to 5 stars first."); const kind = entKindOf(key);
    if(S.demo || !db){ S.localReviews[key] = {id:"loc" + key, t:key, a:meId || "me", an:"You", r, b, at:Date.now()}; delete S.rvDraft[key]; toast("Review posted (preview only)"); openProfile(key, $("profPanel").dataset.view); if(S.callersPage) renderCallerDir(); return; }
    if(await act(() => db.doc("reviews/" + safeId(key + "~" + meId)).set({t:key, k:kind, a:meId, r, b, at:Date.now()}))){ delete S.rvDraft[key]; toast("Review posted"); } return; }
  const dl = t.closest("[data-rvdel]"); if(dl){ if(await act(() => db.doc("reviews/" + dl.dataset.rvdel).delete())) toast("Review deleted"); return; }
  if(t.closest("[data-rvapply]")){ if(await act(() => db.doc("reviewreq/" + meId).set({t:Date.now()}))){ toast("Application sent. An admin will review it."); S.myRvReq = {t:Date.now()}; openProfile($("profPanel").dataset.key); } return; }
});

// ---------- message boards (Local / Discord / Both mirrored) ----------
S.bCfg = {}; S.bridge = {}; S.boards = {}; S.boardSubs = {}; S.localBoards = {};
const BMODES = [["local","Local message board","Posts live on D3MON.CO only."],["discord","Discord message board","The board lives on Discord; the site links to it."],["both","Both, mirrored","The same board on both: posts on the site appear on Discord and Discord posts appear here."]];
const boardArea = key => entKindOf(key);
const boardMode = area => area === "cortex" ? "local" : ((S.bCfg || {})[area] || {}).mode || "local";
const bridgeOn = () => !!(S.bridge && S.bridge.seen && Date.now() - S.bridge.seen < 5*60000);
function watchBoard(key){
  if(!db || S.boardSubs[key]) return;
  S.boardSubs[key] = db.doc("boards/" + safeId(key)).onSnapshot(sn => { S.boards[key] = sn.exists ? sn.data() : {}; const pk = $("profPanel").dataset.key; if(!$("profOv").hidden && pk === key && $("profPanel").dataset.view === "board") openProfile(key, "board"); }, () => {});
}
function samplePosts(key, name){
  const seed = [...String(name || key)].reduce((a, c) => a + c.charCodeAt(0), 0), W = ["Nova","gridlord","theta_tina","Redline","Kai Tides"];
  const T = ["Great read on the last round 🔥","What timeframe works best for this?","Followed your call, thanks for the breakdown.","Any plans to stream the hourly tomorrow?","Would love a write-up on how you size positions."];
  return Array.from({length:3}, (_, i) => ({id:"sp" + i, an:W[(seed + i) % 5], b:T[(seed + i*2) % 5], t:Date.now() - (3 - i)*3600000, src:i === 1 ? "discord" : "site", sample:true}));
}
function boardSection(key, name, sample){
  const area = boardArea(key), mode = boardMode(area), link = ((S.bCfg || {})[area] || {}).discord || "", nm = (name || "").replace(/ \(demo\)$/, "");
  const chip = mode === "local" ? `<span class="bmode" style="--c:#4DA3FF">LOCAL BOARD</span>` : mode === "discord" ? `<span class="bmode" style="--c:#8C95FF">DISCORD BOARD</span>` : `<span class="bmode" style="--c:#8C95FF">⇄ MIRRORED WITH DISCORD</span>`;
  let h = `<div class="psec"><h4>${esc(nm)}'s message board ${chip}</h4>`;
  if(mode !== "local") h += `<div class="aacts">${/^https:\/\//.test(link) ? `<a class="ddisc" style="margin:0" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open on Discord ↗</a>` : `<span class="pfine">${isAdmin ? "Add the Discord link in Admin → Message boards." : "Discord link coming soon."}</span>`}</div>`;
  if(mode === "discord"){ h += `<p class="pfine">This board lives on our Discord server. Tap above to read and post.</p></div>`; return h; }
  watchBoard(key);
  let P = Object.entries((S.boards[key] || {}).msgs || {}).map(([id, m]) => ({id, ...m})).filter(m => m.b).concat(Object.values(S.localBoards[key] || {}));
  if(sample && !P.length) P = samplePosts(key, name);
  P.sort((a, b) => a.t - b.t);
  h += `<div class="bposts">${P.slice(-40).map(m => `<div class="bpost">${m.a ? avatar(m.a) : `<span class="av" style="background:${m.src === "discord" ? "#5865F2" : "#4DA3FF"}"></span>`}<div><div class="h">${m.a ? who(m.a) : `<span class="who">${esc(m.dAuthor || m.an || "Member")}</span>`}${m.src === "discord" ? `<span class="dc">VIA DISCORD</span>` : ""}${m.sample ? `<span class="rb str">SAMPLE</span>` : ""}<small>${esc(ago(m.t))}</small>${!m.sample && m.id && (m.a === meId || isAdmin) && !S.demo && db ? `<button class="xbtn" type="button" data-bdel="${esc(key)}|${esc(m.id)}">delete</button>` : ""}</div><p>${esc(m.b)}</p></div></div>`).join("") || `<p class="pfine">No posts yet. Be the first.</p>`}</div>`;
  if(S.demo || !db || (meId && canWrite)) h += `<div class="bform"><input id="bIn" maxlength="400" placeholder="Post on ${esc(nm)}'s board${mode === "both" ? " (also shows on Discord)" : ""}"><button class="btn sm" type="button" data-bpost="${esc(key)}">Post</button></div>`;
  if(mode === "both") h += `<p class="pfine">${bridgeOn() ? "⇄ Discord bridge connected: posts sync both ways." : "⇄ Mirroring turns on when the Discord bridge is running (Path 2). Until then, posts stay on the site and are queued for Discord."}</p>`;
  return h + `</div>`;
}
document.addEventListener("click", async e => {
  const t = e.target;
  const bp = t.closest("[data-bpost]"); if(bp){ const key = bp.dataset.bpost, b = ($("bIn").value || "").trim(); if(!b) return; if(guestBlocked("board") || !sendGuard()) return;
    const mode = boardMode(boardArea(key)), msg = {a:meId, t:Date.now(), b, src:"site", ...(mode === "both" ? {sync:"pending"} : {})};
    if(S.demo || !db){ const id = "lb" + Date.now(); (S.localBoards[key] = S.localBoards[key] || {})[id] = {id, an:"You", ...msg, a:null}; openProfile(key, "board"); return; }
    if(await act(() => mergeWrite(db.doc("boards/" + safeId(key)), {k:key, area:boardArea(key), msgs:{[newId()]:msg}}))){ $("bIn").value = ""; } return; }
  const bd = t.closest("[data-bdel]"); if(bd){ const [key, id] = bd.dataset.bdel.split("|"); await act(() => db.doc("boards/" + safeId(key)).update({msgs:{[id]:{b:"", deleted:true}}})); return; }
  const bv = t.closest("[data-profview]"); if(bv){ openProfile($("profPanel").dataset.key, bv.dataset.profview); return; }
});

// ---------- website / Discord links on profiles ----------
const ICW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
const ICD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>';
const SOCIALS = [["web","Website","https://yoursite.com","#2EE59D"],["discord","Discord","https://discord.gg/… or username","#8C95FF",1],["twitch","Twitch","https://twitch.tv/…","#B98CFF"],["youtube","YouTube","https://youtube.com/@…","#FF4D6A"],["kick","Kick","https://kick.com/…","#53FC18"],["x","X / Twitter","https://x.com/…","#DCE7EE"],["tiktok","TikTok","https://tiktok.com/@…","#FF5C8A"],["instagram","Instagram","https://instagram.com/…","#F77FBE"],["telegram","Telegram","https://t.me/… or @username","#4DA3FF",1],["facebook","Facebook","https://facebook.com/…","#6A9BFF"],["rumble","Rumble","https://rumble.com/…","#85C742"],["linkedin","LinkedIn","https://linkedin.com/in/…","#5AA7E0"],["tradingview","TradingView","https://tradingview.com/u/…","#9ECBFF"],["github","GitHub","https://github.com/…","#C9D1D9"],["patreon","Patreon","https://patreon.com/…","#FF8A65"],["substack","Substack / newsletter","https://….substack.com","#FFB547"],["linktree","Linktree / link page","https://linktr.ee/…","#5BE3C8"]];
const socOf = o => { o = o || {}; const so = {...(o.socials || {})}; if(!so.web && o.web) so.web = o.web; if(!so.discord && o.discord) so.discord = o.discord; return so; };
const socHidden = (o, k) => ((o || {}).hideSoc || {})[k] || (k === "web" && (o || {}).showWeb === false) || (k === "discord" && (o || {}).showDiscord === false);
const socAllowed = k => !((S.listCfg || {}).offSoc || {})[k];
function linkPills(o, max){
  const so = socOf(o), out = [];
  for(const [k, l, , col, uname] of SOCIALS){ const v2 = (so[k] || "").trim(); if(!v2 || socHidden(o, k) || !socAllowed(k)) continue;
    const label = k === "web" ? v2.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 26) : l.split(" /")[0];
    out.push(/^https:\/\//.test(v2) ? `<a href="${esc(v2)}" target="_blank" rel="noopener noreferrer" style="--sc:${col}">${k === "web" ? ICW : `<i class="sdt"></i>`}${esc(label)} ↗</a>` : uname ? `<span style="--sc:${col}" title="${esc(l)} username"><i class="sdt"></i>${esc(l.split(" /")[0])}: ${esc(v2)}</span>` : ""); }
  const L = out.filter(Boolean); if(!L.length) return "";
  const shown = max ? L.slice(0, max) : L;
  return `<div class="plinks">${shown.join("")}${max && L.length > max ? `<span class="more">+${L.length - max}</span>` : ""}</div>`;
}
function promoHtml(o, compact){
  o = o || {}; const pr = o.promo || {}, parts = [];
  if(pr.cta && /^https:\/\//.test(pr.ctaUrl || "") && socAllowed("cta") && !(S.listCfg && (S.listCfg.off || {}).cta)) parts.push(`<a class="pcta" href="${esc(pr.ctaUrl)}" target="_blank" rel="noopener noreferrer">${esc(pr.cta)} ↗</a>`);
  if(compact) return parts.join("");
  const info = [];
  if(pr.sched) info.push(`<div class="pinfo"><b>🗓 Schedule</b><span>${esc(pr.sched)}</span></div>`);
  if(pr.offer) info.push(`<div class="pinfo offer"><b>🎁 Offer</b><span>${esc(pr.offer)}</span></div>`);
  if((pr.highlights || []).length) info.push(`<div class="pinfo"><b>🏆 Highlights</b><span class="phl">${pr.highlights.map(x => `<i>${esc(x)}</i>`).join("")}</span></div>`);
  return parts.join("") + (info.length ? `<div class="pinfos">${info.join("")}</div>` : "") + dchatHtml(o);
}
function dchatSrc(d){ if(!d || !d.server) return ""; return d.channel ? `https://e.widgetbot.io/channels/${encodeURIComponent(d.server)}/${encodeURIComponent(d.channel)}` : `https://discord.com/widget?id=${encodeURIComponent(d.server)}&theme=dark`; }
S.dchatCfg = {}; S.dcReqs = {}; S.dcReqLocal = {};
const dcPair = d => (d && d.server ? d.server + "/" + (d.channel || "") : "");
const dcApproved = d => !!(dcPair(d) && ((S.dchatCfg || {}).ok || {})[dcPair(d)]) && !(S.dchatCfg || {}).off;
function dcReqList(){ return Object.entries((S.demo || !db) ? S.dcReqLocal : S.dcReqs).map(([uid, r]) => ({uid, ...r})).filter(r => r && r.server); }
function dchatHtml(o, force){ const d = (o || {}).dchat; if(!d || !d.on || !d.server) return ""; if(!force && !dcApproved(d)) return "";
  const open = d.channel ? `https://discord.com/channels/${encodeURIComponent(d.server)}/${encodeURIComponent(d.channel)}` : "";
  return `<div class="pdchat"><div class="h"><b>💬 ${esc(d.title || "Discord chat")}</b>${open ? `<a href="${esc(open)}" target="_blank" rel="noopener noreferrer">Open in Discord ↗</a>` : ""}</div><iframe src="${esc(dchatSrc(d))}" loading="lazy" title="${esc(d.title || "Discord chat")}" allow="clipboard-write; fullscreen"></iframe></div>`; }
function dchatParse(v){ v = (v || "").trim(); if(!v) return {};
  let m = v.match(/discord(?:app)?\.com\/channels\/(\d{15,22})\/(\d{15,22})/) || v.match(/widgetbot\.io\/channels\/(\d{15,22})\/(\d{15,22})/); if(m) return {server:m[1], channel:m[2]};
  m = v.match(/widget\?id=(\d{15,22})/) || v.match(/^(\d{15,22})$/); if(m) return {server:m[1], channel:""};
  return {err:"Paste a Discord channel link (https://discord.com/channels/…/…) or your server ID."}; }
function dchatEligible(){ return mpPreview() || myRoles().some(r => ["caller","botdev","scripter"].includes(r[0]) && r[5] === "active"); }
function dchatCard(pub){ if(!dchatEligible()) return "";
  const d = pub.dchat || {}, link = d.server ? (d.channel ? `https://discord.com/channels/${d.server}/${d.channel}` : d.server) : "";
  return `<div class="acard"><h3>Discord chat on my profile <small>for callers, bot owners and script owners</small></h3>
    <p class="hint">Show your Discord channel right on your profile. It works as one chat: messages sent on your profile appear in your Discord channel and Discord messages appear on your profile (people sign in with Discord inside the chat to post). The admins approve it before it goes live. Paste a channel link (right-click the channel in Discord → Copy Link). For live chat, add the free WidgetBot bot to your server once. Only have a server ID? We'll show Discord's server widget instead (turn on Server Settings → Widget).</p>
    <div class="aform"><div class="af w"><label for="dc_link">Discord channel link or server ID</label><input id="dc_link" value="${esc(link)}" placeholder="https://discord.com/channels/123456789012345678/234567890123456789"></div>
      <div class="af"><label for="dc_title">Section title</label><input id="dc_title" maxlength="40" value="${esc(d.title || "")}" placeholder="Discord chat"></div></div>
    <label class="atog"><input type="checkbox" id="dc_on" ${d.on ? "checked" : ""}>Show the Discord chat on my profile</label>
    ${d.server ? `<div class="dcst ${dcApproved(d) ? "ok" : (dcMyReq() || {}).status === "declined" ? "no" : "wait"}">${(S.dchatCfg || {}).off ? "Discord chats are turned off on the site right now." : dcApproved(d) ? (d.on ? "✓ Approved · showing on your profile" : "✓ Approved · switched off (tick the box to show it)") : (dcMyReq() || {}).status === "declined" ? "✕ Not approved by the admins. Change the link and save to ask again." : "⏳ Waiting for admin approval · it shows on your profile once approved"}</div>` : ""}
    ${d.on && d.server ? `<div class="dcprev">${dchatHtml(pub, true)}</div>` : ""}
    <div class="aacts"><button class="btn sm" type="button" data-dchatsave>Save Discord chat</button></div></div>`; }
document.addEventListener("click", async e => { if(!e.target.closest("[data-dchatsave]")) return; if(!dchatEligible()) return toast("Discord chat is for callers, bot owners and script owners.");
  const p = dchatParse($("dc_link").value); if(p.err) return toast(p.err);
  const on = !!$("dc_on").checked; if(on && !p.server) return toast("Add your Discord channel link first.");
  const dchat = {server:p.server || "", channel:p.channel || "", on, title:($("dc_title").value || "").trim().slice(0, 40)};
  const approved = dcApproved(dchat);
  if(await savePub({...myPub(), dchat}, on ? (approved ? "Discord chat is on your profile" : "Saved · sent to the admins for approval") : "Discord chat saved (hidden)")){
    if(dchat.server && !approved){ const req = {server:dchat.server, channel:dchat.channel, title:dchat.title, name:S.myName || (meId && S.nameCache[meId]) || "You", t:Date.now(), status:"pending"};
      if(S.demo || !db) S.dcReqLocal = {...S.dcReqLocal, [meId || "you"]:req}; else await act(() => db.doc("dcreq/" + meId).set(req)); }
    renderMe.lastTab = null; renderMe(); } });
function dcMyReq(){ return ((S.demo || !db) ? S.dcReqLocal : S.dcReqs)[meId || "you"] || null; }
// form block used by members (My profile) and by the admin editors
function socialEditor(px, o){
  o = o || {}; const so = socOf(o), pr = o.promo || {};
  return `<div class="soced"><h4>Social & links <span>fill in any you use · untick to hide</span></h4><div class="socgrid">${SOCIALS.filter(([k]) => socAllowed(k)).map(([k, l, ph, col]) => `<div class="socf" style="--sc:${col}"><label for="${px}_so_${k}"><i class="sdt"></i>${esc(l)}</label><div class="socrow"><input id="${px}_so_${k}" value="${esc(so[k] || "")}" placeholder="${esc(ph)}"><label class="sochk" title="Show on profile"><input type="checkbox" id="${px}_sh_${k}" ${socHidden(o, k) ? "" : "checked"}>show</label></div></div>`).join("")}</div>
    <h4>Promote yourself</h4><div class="aform">
      <div class="af"><label for="${px}_cta">Main button text</label><input id="${px}_cta" maxlength="32" value="${esc(pr.cta || "")}" placeholder="Join my Discord"></div>
      <div class="af"><label for="${px}_ctau">Main button link</label><input id="${px}_ctau" value="${esc(pr.ctaUrl || "")}" placeholder="https://"></div>
      <div class="af w"><label for="${px}_sched">Schedule</label><input id="${px}_sched" maxlength="100" value="${esc(pr.sched || "")}" placeholder="Live weekdays 9:30–11 AM ET · Sunday recap 7 PM"></div>
      <div class="af w"><label for="${px}_offer">Offer for D3MON members</label><input id="${px}_offer" maxlength="140" value="${esc(pr.offer || "")}" placeholder="Free 7-day trial of my signals group"></div>
      <div class="af w"><label for="${px}_hl">Highlights (comma separated)</label><input id="${px}_hl" maxlength="200" value="${esc((pr.highlights || []).join(", "))}" placeholder="Top caller Sept, Battle S1 champ, 2k Twitch followers"></div></div></div>`;
}
function readSocial(px){
  const socials = {}, hideSoc = {};
  for(const [k, l, , , uname] of SOCIALS){ const el = $(`${px}_so_${k}`); if(!el) continue; const v2 = el.value.trim(); if(v2 && !uname && !/^https:\/\//.test(v2)) return {err:`${l} needs a full link starting with https://`}; socials[k] = v2; hideSoc[k] = !$(`${px}_sh_${k}`).checked; }
  const ctaUrl = ($(`${px}_ctau`) || {}).value?.trim() || ""; if(ctaUrl && !/^https:\/\//.test(ctaUrl)) return {err:"The main button link needs to start with https://"};
  const promo = {cta:($(`${px}_cta`) || {}).value?.trim() || "", ctaUrl, sched:($(`${px}_sched`) || {}).value?.trim() || "", offer:($(`${px}_offer`) || {}).value?.trim() || "", highlights:(($(`${px}_hl`) || {}).value || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 8)};
  return {socials, hideSoc, promo, showWeb:!hideSoc.web, showDiscord:!hideSoc.discord, web:socials.web || "", discord:socials.discord || ""};
}
// ---------- member profile card (click any name) ----------
function profResolve(key){
  const clean = n => (n || "").replace(/ \(demo\)$/, "").toLowerCase();
  const ML = memberList(), CD = callerDir();
  let m = ML.find(x => x.id === key), c = CD.find(x => x.key === key || (x.id && x.id === key));
  if(!m && !c){ // a name clicked in the demo chat or a sample
    const n = clean(key);
    m = ML.find(x => clean(x.name) === n); c = CD.find(x => clean(x.name) === n);
    if(!m && !c){ const dp = (S.demoPeers || []).find(p => clean(p.name) === n); if(dp) m = {id:key, name:dp.name, color:dp.color, type:"member", cats:new Set([...(dp.voice ? [] : []), "online"]), demo:true, voice:dp.voice, roleHtml:dp.role}; }
  }
  if(m && !c) c = CD.find(x => clean(x.name) === clean(m.name) || (x.id && x.id === m.id));
  if(c && !m) m = ML.find(x => clean(x.name) === clean(c.name));
  if(!m && !c) return null;
  const id = (m && !m.profile && !m.mock && !m.demo && m.id) || (c && c.id) || null;
  return {key, id, m:m || {}, c:c || {}};
}
function profRecentCalls(id){
  const out = [];
  for(const d of Object.values(S.callDocs || {})) for(const [st, entries] of Object.entries(d.rounds || {})) for(const e of Object.values(entries)) if(e.a === id && e.s === "caller"){
    const rs = S.resDocs[`${d.asset}-${d.tf}-${d.day}`], r = rs && rs.r && rs.r[st]; out.push({st:+st, d:e.d, r, mk:`${d.asset} ${d.tf}`, c:e.c}); }
  return out.sort((a, b) => b.st - a.st).slice(0, 8);
}
function openEntityProfile(key, view){
  const it = /^e:/.test(key) ? entItem(key, getEnts()[key.slice(2)] || {}) : entityDir(/^b:/.test(key) ? "bots" : "scripts", true).find(x => x.key === key);
  if(!it || !it.ent) { if(!S.ccCap) toast("Not found."); return; }
  const e = it.ent, bot = e.kind === "bot", fav = isFav(key, e.name), color = it.color;
  let h = `<div class="pbanner"><button class="x" type="button" data-profclose aria-label="Close">✕</button></div>
    <div class="phead"><div class="pav"><span class="eav" style="background:${esc(color)}">${bot ? "B" : "S"}</span><i class="sdot ${e.status === "live" ? "lv" : e.status === "paused" ? "off" : ""}"></i></div>
      <h3>${esc(e.name)}${fav ? `<span style="color:#FFD166">★</span>` : ""}${e.sample ? `<span class="rb str">SAMPLE</span>` : ""}</h3>
      <div class="st">${e.status === "live" ? `<b class="lv">● LIVE NOW</b>` : e.status === "paused" ? "Paused" : `<b>● Running</b>`} · by ${e.ownerId ? `<button class="plink who" type="button" data-prof="${esc(e.ownerId)}">${who(e.ownerId)}</button>` : esc(e.owner || "—")}${spEntOwnerBiz(e)}</div>
      <div class="pbd">${it.badge}${bot ? "" : e.market ? `<span class="tb" style="--c:var(--scripts)">${esc(e.market)}</span>` : ""}</div>${linkPills(e)}${promoHtml(e, S.profHover)}</div>`;
  if(view === "board") h += `<div class="pacts" style="margin-top:0"><button class="xbtn2" type="button" data-profview="main">← Back to ${bot ? "bot" : "script"}</button></div>` + boardSection(key, e.name, !!e.sample);
  else {
    if(it.live) h += `<div class="psec"><h4>Streaming now</h4><div class="plive"><span class="t">${esc(it.live.title)}</span>${/^https:\/\//.test(it.live.url || "") ? `<a class="watch2" href="${esc(it.live.url)}" target="_blank" rel="noopener noreferrer">Watch ↗</a>` : ""}</div></div>`;
    h += `<div class="psec"><h4>${bot ? "What it reads" : "What it does"}</h4>${e.desc ? `<p class="pfine" style="color:var(--ink-2)">${esc(e.desc)}</p>` : ""}${bot ? `<div class="plist">${(e.sources || []).map(x => `<span style="color:var(--bots)">${esc(x)}</span>`).join("")}</div>` : `<div class="pstats"><div><b>${esc(e.market || "—")}</b><span>Market</span></div><div><b style="color:${e.signal === "long" ? "var(--up)" : e.signal === "short" ? "var(--dn)" : "var(--ink)"}">${esc((e.signal || "—").toUpperCase())}</b><span>Signal</span></div><div><b>${esc(e.rec || "—")}</b><span>Record</span></div></div>`}${bot && e.rec ? `<p class="pfine">Record ${esc(e.rec)}</p>` : ""}</div>`;
    h += reviewsSection(key, e.name, !!e.sample);
  }
  h += `<div class="pacts"><button class="pstar" type="button" data-proffav="${esc(key)}" data-favname="${esc(e.name)}" aria-pressed="${fav}"><span class="s">${fav ? "★" : "☆"}</span>${fav ? "In your favorites" : "Add to favorites"}</button>${view === "board" ? "" : `<button class="pboardbtn" type="button" data-profview="board">💬 Message board</button>`}</div>`;
  if(S.ccCap){ S.ccCapOut = h; return; }
  const pnl = $("profPanel"); pnl.style.setProperty("--c", color); pnl.innerHTML = h; $("profOv").hidden = false; pnl.dataset.key = key; pnl.dataset.view = view || "main"; fillNames(pnl); dockProfile();
}
function openProfile(key, view){
  if(/^[ebs]:/.test(key)) return openEntityProfile(key, view);
  const spMine = key === meId || key === "You (demo)"; if(S.pubView && !spMine) S.pubView = false; const spPV = !!S.pubView && spMine;
  const R = profResolve(key) || (key === "You (demo)" || key === meId ? {key, id:meId || null, m:{id:key, name:meId ? "" : "You", color:(S.previewPub || {}).color || "#2EE59D", type:isOwner ? "owner" : "member", cats:new Set(["online"]), demo:!meId}, c:{}} : null); if(!R){ if(!S.ccCap) toast("No profile for that member yet."); return; }
  const {id, m, c} = R, name = m.name || c.name || (id ? "" : "Member");
  const color = m.color || c.color || "#4DA3FF";
  const cats = m.cats || new Set(), isCaller = cats.has("verified") || (id && isVerified(id)) || !!c.key || ((key === "You (demo)" || (key === meId && meId)) && mpPreview());
  const type = ACCT.find(a => a[0] === (m.type || "member")) || ACCT[5];
  const live = c.live || (m.p && m.p.status === "live" ? {title:m.p.liveTitle, url:m.p.liveUrl, media:m.p.liveMedia} : null);
  const online = live || cats.has("online") || c.online;
  const voice = c.voice || m.voice || (m.p && m.p.voice) || (id && (onlinePeople().find(p => p.id === id) || {}).voice);
  const catB = (typeof MCAT !== "undefined" ? MCAT : []).filter(([k]) => k !== "online" && cats.has(k)).map(([k, l, col]) => `<span class="tb" style="--c:${col}">${esc(l.replace(/s$/, "").replace("Active in chat", "Chatter").toUpperCase())}</span>`).join("");
  const av = id ? `<img class="av" alt="" data-av="${esc(id)}">` : `<span class="av" style="background:${esc(color)}"></span>`;
  const nm = id && !name ? who(id) : esc(name.replace(/ \(demo\)$/, "") + (/\(demo\)$/.test(name) ? " (demo)" : ""));
  // stats
  let recTxt = c.rec || (m.p && m.p.rec) || (id ? callerStats(id) : "—"), hitPct = "—", calls = "—";
  const mt = /(\d+)%\s*·\s*(\d+)/.exec(recTxt || ""); if(mt){ hitPct = mt[1] + "%"; calls = mt[2]; }
  const recent = id ? profRecentCalls(id) : [];
  const msgsAll = S.demo ? (S.demoMsgs || []).filter(x => (x.name || "").toLowerCase() === (name || "").toLowerCase()) : id ? loungeMsgs().filter(x => x.a === id) : [];
  const bots = id ? Object.values(((S.botDocs || {})[id] || {}).list || {}).map(b => b.name) : [], scs = id ? Object.values(((S.scDocs || {})[id] || {}).list || {}).map(b => b.name) : [];
  const next = c.next || (m.p && m.p.next ? {d:m.p.next} : null);
  const coinAcct = id || (key === "You (demo)" ? "you" : m.id || key), holdAmt = coinHoldTxt(coinAcct);
  const canAdmin = isAdmin || !db;
  const mainV = !view || view === "main", spSelf = (key === meId || key === "You (demo)") && !spPV;
  let h = `<div class="pbanner"><button class="x" type="button" data-profclose aria-label="Close">✕</button></div>
    <div class="phead"><div class="pav">${av}<i class="sdot ${live ? "lv" : online ? "" : "off"}"></i></div>
      <h3>${nm}${fav0(key, name) ? `<span style="color:#FFD166" title="In your favorites">★</span>` : ""}${m.sample || c.mock ? `<span class="rb str">SAMPLE</span>` : ""}</h3>
      <div class="st"><!--CST-->${voice ? ` · 🔊 in ${esc(voiceName(voice))} voice` : ""}${m.last && !online ? ` · seen ${esc(ago(m.last))}` : ""}${m.first ? ` · member since ${esc(new Date(m.first).toLocaleDateString(undefined, {month:"short", year:"numeric"}))}` : ""}</div>
      <div class="pbd"><span class="tb" style="--c:${type[2]}">${esc(type[1].toUpperCase())}</span>${isCaller && !cats.has("verified") ? `<span class="tb" style="--c:var(--callers)">CALLER</span>` : ""}${catB}${m.roleHtml || ""}</div></div>`;
  const pub = id ? pubOf(id) : key === "You (demo)" ? S.previewPub : (m.p || (/^p:/.test(m.id || "") ? getProfiles()[m.id.slice(2)] : null) || {});
  if(pub.tagline) h = h.replace(/(<div class="st">)/, `<div class="ptag">${esc(pub.tagline)}</div>$1`);
  { const lp = linkPills(pub) + promoHtml(pub, S.profHover); if(lp) h = h.replace(/(<div class="pbd">[\s\S]*?<\/div>)(<\/div>)/, `$1${lp}$2`); }
  const spCtx = {key, id:spPV ? spMe() : id, name, pub, view:view || "main", isSelf:spSelf, color, m, c};
  h += profSocialTop(spCtx);
  { const bc = spBannerCss(spSelf ? spPubFor(spMe()) : pub); if(bc) h = h.replace('<div class="pbanner">', `<div class="pbanner" style="background:${bc}">`); }
  if(mainV && (pub.bio || (pub.markets || []).length || pub.style || pub.tz || false)){
    const so = pub.socials || {}, sty = (STYLES.find(x => x[0] === pub.style) || [])[1];
    h += `<div class="psec"><h4>About</h4>${pub.bio ? `<p class="pabout">${esc(pub.bio)}</p>` : ""}${(pub.markets || []).length || sty || pub.tz ? `<div class="plist">${sty ? `<span>${esc(sty)}</span>` : ""}${(pub.markets || []).map(x => `<span style="color:#9ECBFF">${esc(x)}</span>`).join("")}${pub.tz ? `<span>🕑 ${esc(pub.tz)}</span>` : ""}</div>` : ""}
</div>`;
  }
  if(pub.color && id) setTimeout(() => $("profPanel").style.setProperty("--c", pub.color), 0);
  if(live) h += `<div class="psec"><h4>Streaming now</h4><div class="plive"><span class="t">${esc(live.title || "Live")}</span>${/^https:\/\//.test(live.url || "") ? `<a class="watch2" href="${esc(live.url)}" target="_blank" rel="noopener noreferrer">${live.media === "audio" ? "Listen" : "Watch"} ↗</a>` : ""}</div></div>`;
  const pSample = key !== "You (demo)" && key !== meId && !!(m.sample || c.mock || m.mock || m.demo || /\(demo\)$/.test(name || ""));
  h = h.replace("<!--CST-->", cstatHtml(isCaller ? (pub.cstat || "auto") : "auto", live, online));
  if(isCaller && mainV && (pub.showCall || (pSample && (c.now || c.next)))) h += roundCallHtml(roundCallOf(id, key, c));
  if(view === "board"){ h += `<div class="pacts" style="margin-top:0"><button class="xbtn2" type="button" data-profview="main">← Back to profile</button></div>` + boardSection(key, name, pSample); }
  else if(!mainV) h += profSpecial(spCtx);
  else h += profMainExtras(spCtx) + reviewsSection(key, name, pSample);
  if(mainV && !pub.hideActivity){
  const acts = [msgsAll.length ? `${msgsAll.length} chat message${msgsAll.length > 1 ? "s" : ""}` : "", bots.length ? `${bots.length} bot${bots.length > 1 ? "s" : ""}` : "", scs.length ? `${scs.length} script${scs.length > 1 ? "s" : ""}` : ""].filter(Boolean);
  h += `<div class="psec"><h4>Activity <span>${esc(acts.join(" · ") || "quiet so far")}</span></h4>
    ${msgsAll.slice(-3).reverse().map(x => `<div class="pmsg">${esc(x.b)}<small>#${esc((DCH[x.tab || "main"] || DCH.main)[0])} · ${esc(tLocal(x.t))}</small></div>`).join("") || `<p class="pfine">No chat messages yet.</p>`}
    ${bots.length || scs.length ? `<div class="plist">${bots.map(n => `<span style="color:var(--bots)">🤖 ${esc(n)}</span>`).join("")}${scs.map(n => `<span style="color:var(--scripts)">📈 ${esc(n)}</span>`).join("")}</div>` : ""}</div>`;
  if(false && (holdAmt || cats.has("holder"))){ const stc = coinStats(), rk = stc.holders.findIndex(([a]) => a === coinAcct) + 1; h += `<div class="psec"><h4>Coin holder <span>${esc(sym())}</span></h4><div class="pstats"><div><b style="color:#FFD166">${fmtN(balanceOf(coinAcct))}</b><span>Balance</span></div><div><b>${rk ? "#" + rk : "—"}</b><span>Holder rank</span></div><div><b>${eligible(coinAcct) ? "Yes" : "No"}</b><span>Can vote</span></div></div><div class="aacts"><button class="xbtn2" type="button" data-cngo="holders">View the ledger</button></div></div>`; }
  if(canAdmin && m.note) h += `<div class="psec"><h4>Your private note</h4><p class="pfine" style="color:var(--ink-2)">${esc(m.note)}</p></div>`;
  }
  const mention = (name || "").replace(/ \(demo\)$/, "").replace(/\s+/g, "");
  const fav = isFav(key, name);
  const isSelf = (key === meId || key === "You (demo)") && !spPV;
  h += `<div class="pacts">${isSelf ? `<button class="pstar" type="button" data-mpedit>✎ Edit my profile</button><button class="pboardbtn" type="button" data-mpconn>⚡ Connect</button>` : `<button class="pstar" type="button" data-proffav="${esc(key)}" data-favname="${esc(name)}" aria-pressed="${fav}"><span class="s">${fav ? "★" : "☆"}</span>${fav ? "In your favorites" : "Add to favorites"}</button>`}${!isSelf && view !== "board" && ((id && (id !== meId || spPV)) || (!db || S.demo) && /^(p:|mock-)/.test(m.id || key)) ? `<button class="pmsgbtn" type="button" data-dmto="${esc(id || m.id || key)}">✉ Message</button>` : ""}${view === "board" ? "" : `<button class="pboardbtn" type="button" data-profview="board">💬 Message board</button>`}
</div>`;
  if(S.ccCap){ S.ccCapOut = h; return; }
  const pnl = $("profPanel"); pnl.style.setProperty("--c", color.startsWith("var") ? "#4DA3FF" : color); pnl.innerHTML = h;
  pnl.classList.toggle("pubprev", spPV); { const pn = $("pfNote"); if(pn) pn.hidden = !spPV; }
  $("profOv").hidden = false; pnl.dataset.key = key; pnl.dataset.view = view || "main"; fillNames(pnl); dockProfile();
  if(id && !name && user) user.profiles([id]).then(ps => { const p = ps && ps[id]; if(p && p.color) pnl.style.setProperty("--c", p.color); }).catch(() => {});
}
function dockProfile(){
  const pnl = $("profPanel"), ov = $("profOv"), r = S.profAnchor;
  if(S.profFull && !ov.hidden){ if(pnl.parentNode !== $("pfHost")) $("pfHost").appendChild(pnl); pnl.classList.add("full"); pnl.style.left = pnl.style.top = pnl.style.width = pnl.style.maxHeight = ""; ov.classList.add("docked"); ov.classList.remove("pop"); if($("pfPage").hidden){ $("pfPage").hidden = false; $("pfPage").scrollTop = 0; } return; }
  pnl.classList.remove("full"); $("pfPage").hidden = true;
  if(pnl.parentNode !== ov) ov.appendChild(pnl);
  ov.classList.remove("docked"); $("callersPage").classList.remove("withprof");
  document.querySelectorAll(".dcr.sel").forEach(x => x.classList.remove("sel"));
  if(!r || innerWidth < 760){ ov.classList.remove("pop"); pnl.style.left = pnl.style.top = pnl.style.width = pnl.style.maxHeight = ""; return; }
  ov.classList.add("pop");
  const W = Math.min(400, innerWidth - 24), H = Math.min(pnl.scrollHeight || 600, innerHeight - 24);
  let left = r.right + 14; if(left + W > innerWidth - 12) left = r.left - W - 14; if(left < 12) left = Math.min(Math.max(12, r.left), innerWidth - W - 12);
  let top = Math.min(Math.max(12, r.top - 60), innerHeight - H - 12);
  pnl.style.width = W + "px"; pnl.style.left = left + "px"; pnl.style.top = top + "px"; pnl.style.maxHeight = (innerHeight - 24) + "px";
  const k = pnl.dataset.key, row = S.profAnchorEl && S.profAnchorEl.closest && S.profAnchorEl.closest(".dcr"); if(row) row.classList.add("sel");
}
addEventListener("scroll", () => { if(!$("profOv").hidden && $("profOv").classList.contains("pop") && !S.profFull && !$("profPanel").matches(":hover")) closeProfile(); }, {passive:true});
addEventListener("resize", () => { if(!$("profOv").hidden) dockProfile(); });
function closeProfile(){ if(S.pubView){ S.pubView = false; $("profPanel").classList.remove("pubprev"); const pn = $("pfNote"); if(pn) pn.hidden = true; } $("profOv").hidden = true; S.profDock = false; S.profAnchor = null; S.profAnchorEl = null; S.profFull = false; S.profHover = false; clearTimeout(hovT); clearTimeout(hovCloseT); dockProfile(); }
function openFull(key, view){ clearTimeout(hovT); clearTimeout(hovCloseT); S.profHover = false; S.profFull = true; S.profAnchor = null; S.profAnchorEl = null; openProfile(key, view); }
// hover a name or avatar: quick profile card next to it
let hovT = null, hovCloseT = null;
const HOVSEL = "[data-prof], #cortex .dmsg .who, #cortex .dmm .who, #cortex .dvm .who";
const canHover = () => matchMedia("(hover:hover) and (pointer:fine)").matches;
function hovClose(){ clearTimeout(hovCloseT); hovCloseT = setTimeout(() => { if(!S.profHover || S.profFull) return; const p = $("profPanel"); if(p.matches(":hover") || (S.profAnchorEl && S.profAnchorEl.matches && S.profAnchorEl.matches(":hover"))) return; closeProfile(); }, 220); }
document.addEventListener("mouseover", e => {
  if(!canHover() || S.profFull) return;
  if(e.target.closest("#profPanel")){ clearTimeout(hovCloseT); return; }
  const el = e.target.closest(HOVSEL); if(!el || el.closest("#pfPage")) return;
  clearTimeout(hovCloseT); clearTimeout(hovT);
  const key = el.dataset.prof || el.dataset.uid || el.textContent.trim();
  if(S.profHover && !$("profOv").hidden && $("profPanel").dataset.key === key) return;
  hovT = setTimeout(() => { if(!el.isConnected) return; S.profAnchor = el.getBoundingClientRect(); S.profAnchorEl = el; S.profHover = true; S.profFull = false; openProfile(key); }, 300);
});
document.addEventListener("mouseout", e => {
  if(S.profFull) return;
  const el = e.target.closest(HOVSEL + ", #profPanel"); if(!el) return;
  if(e.relatedTarget && el.contains(e.relatedTarget)) return;
  clearTimeout(hovT); if(S.profHover) hovClose();
});
$("pfBack").addEventListener("click", () => closeProfile());
document.addEventListener("click", e => {
  const t = e.target;
  if(t.id === "profOv" || t.closest("[data-profclose]")){ closeProfile(); return; }
  if(!$("profOv").hidden && $("profOv").classList.contains("pop") && !t.closest("#profPanel") && !t.closest(HOVSEL) && !t.closest("#cpList .dcr")) closeProfile();
  const row = t.closest("#cpList .dcr"); if(row && !t.closest("a, button:not([data-prof])")){ const k = (row.querySelector("[data-prof]") || {}).dataset; if(k && k.prof){ e.preventDefault(); e.stopPropagation(); openFull(k.prof); return; } }
  const pm = t.closest("[data-profmention]"); if(pm){ closeProfile(); if(S.adminPage) openAdmin(false); if(S.callersPage) openCallersPage(false); if(!S.cortex) openCortex(true); S.ftab = "main"; renderFloor(); const i = $("fin"); i.value = "@" + pm.dataset.profmention + " "; i.focus(); return; }
  const mg = t.closest("[data-profmanage]"); if(mg){ closeProfile(); if(!S.adminPage) openAdmin(true); S.apTab = "members"; S.memF = "all"; S.memQ = ""; S.memEdit = mg.dataset.profmanage; renderAdmin.lastTab = null; renderAdmin(); setTimeout(() => document.querySelector(".mcedit")?.scrollIntoView({block:"center"}), 40); return; }
  if(t.closest("#profPanel [data-follow]")) setTimeout(() => { const k = $("profPanel").dataset.key; if(!$("profOv").hidden && k) openProfile(k); }, 60);
  const pl = t.closest("[data-prof]"); if(pl){ e.preventDefault(); e.stopPropagation(); openFull(pl.dataset.prof); return; }
  const cw = t.closest("#cortex .dmsg .who, #cortex .dmm .who, #cortex .dvm .who, #cortex .drq b");
  if(cw){ openFull(cw.dataset.uid || cw.textContent.trim()); return; }
}, true);
document.addEventListener("keydown", e => { if(e.key === "Escape" && !$("profOv").hidden) closeProfile(); });
document.addEventListener("click", e => { const g = e.target.closest("[data-cngo]"); if(g){ closeProfile(); openCoin(true, g.dataset.cngo); } });
document.addEventListener("click", e => { if(e.target.closest("[data-mpconn]")){ closeProfile(); S.mpTab = "connect"; if(!S.mePage) openMe(true); else { renderMe.lastTab = null; renderMe(); } return; } if(e.target.closest("[data-mpedit]")){ closeProfile(); S.mpTab = "profile"; if(!S.mePage) openMe(true); else { renderMe.lastTab = null; renderMe(); } } });





// ---------- Connect: apply to Callers / Bots / Chart Scripts, admin approves ----------
S.connDraft = {}; S.connPrev = {};
const CONN = [["callers","Callers","var(--callers)","caller","Post official round calls, appear on the Callers page and leaderboard, stream in the Cortex.",["Your calls count on the leaderboard","Listed A–Z on the Callers page","Reviews and a message board on your profile","Go live in the Cortex"]],
  ["bots","Bots","var(--bots)","bot","List your bot on the Bots page, post its calls and enter the Battle of the Bots.",["Bot listed on the Bots page","Bot console to post reads and calls","Eligible for Battle of the Bots","Reviews and a message board for your bot"]],
  ["scripts","Chart Scripts","var(--scripts)","script","Publish your chart script so its signals show on the Chart Scripts page.",["Script listed on the Chart Scripts page","Script console to post signals","Reviews and a message board for your script","Eligible for Script of the Month"]]];
function connStatus(k){
  const me = meId, rq = S.myRoleReq || {}, pv = S.connPrev[k];
  if(!db || S.demo) return pv || (k === "callers" ? "none" : "none");
  if(!me) return "signin";
  if(k === "callers") return isVerified(me) ? "approved" : S.myReq ? "pending" : (rq.caller && rq.caller.done && !rq.caller.ok) ? "declined" : "none";
  const key = k === "bots" ? "bot" : "script", cat = k === "bots" ? "botdev" : "scripter";
  if(catsOf(me)[cat] || Object.values(getEnts()).some(e => e && !e.deleted && e.ownerId === me && e.kind === key)) return "approved";
  const r = rq[key]; return r ? (r.done ? (r.ok ? "approved" : "declined") : "pending") : "none";
}
function renderConn(el){
  el = el || $("connGrid"); if(!el) return;
  const ST = {none:["NOT CONNECTED","#8FA3B2"], pending:["PENDING REVIEW","#FFB547"], approved:["CONNECTED","#2EE59D"], declined:["NOT APPROVED","#FF4D6A"], signin:["SIGN IN","#8FA3B2"]};
  el.innerHTML = CONN.map(([k, name, col, key, desc, perks]) => {
    const st = connStatus(k), [sl, sc] = ST[st], d = S.connDraft[k] || {};
    let body = "";
    if(st === "approved") body = `<p>You're connected to ${esc(name)}.</p><div class="aacts"><button class="btn sm" type="button" data-conngo="${k}">Open the ${esc(name)} page</button>${k === "callers" ? `<button class="btn ghost sm" type="button" data-conngo="console">Call console</button>` : `<button class="btn ghost sm" type="button" data-conngo="${k === "bots" ? "botconsole" : "scconsole"}">${k === "bots" ? "Bot" : "Script"} console</button>`}</div>`;
    else if(st === "pending") body = `<p>Your application is in. An admin will review it soon; you'll see CONNECTED here once it's approved.</p>`;
    else if(st === "signin") body = `<p>Sign in to apply.</p>`;
    else {
      body = `<ul>${perks.map(x => `<li>${esc(x)}</li>`).join("")}</ul>${st === "declined" ? `<p style="color:#FF9FB0">Your last application wasn't approved. You can apply again.</p>` : ""}<div class="aform" style="grid-template-columns:1fr">`;
      if(k === "callers") body += `<div class="af"><label for="cn_mk_${k}">Markets you call</label><input id="cn_mk_${k}" value="${esc(d.mk || "")}" placeholder="BTC 15m, ETH hourly, Kalshi"></div><div class="af"><label for="cn_ex_${k}">Your experience</label><textarea id="cn_ex_${k}" maxlength="500" placeholder="How long you've traded, your approach, where we can see past calls">${esc(d.ex || "")}</textarea></div><div class="af"><label for="cn_ln_${k}">Proof link (optional)</label><input id="cn_ln_${k}" value="${esc(d.ln || "")}" placeholder="https:// X, Discord, stream or sheet"></div>`;
      else body += `<div class="af"><label for="cn_nm_${k}">${k === "bots" ? "Bot" : "Script"} name</label><input id="cn_nm_${k}" maxlength="40" value="${esc(d.nm || "")}" placeholder="${k === "bots" ? "DeltaFlow" : "Session VWAP Bands"}"></div>
        ${k === "scripts" ? `<div class="af"><label for="cn_mk_${k}">Market & timeframe</label><input id="cn_mk_${k}" value="${esc(d.mk || "")}" placeholder="BTC 15m"></div>` : ""}
        <div class="af"><label for="cn_ex_${k}">What it does</label><textarea id="cn_ex_${k}" maxlength="500" placeholder="How it reads the market and what it signals">${esc(d.ex || "")}</textarea></div>
        <div class="af"><label for="cn_ln_${k}">Link (optional)</label><input id="cn_ln_${k}" value="${esc(d.ln || "")}" placeholder="https:// repo, demo, TradingView"></div>`;
      body += `</div><div class="aacts"><button class="btn sm" type="button" data-connapply="${k}">Apply to ${esc(name)}</button></div>`;
    }
    return `<div class="ccard ${st === "approved" ? "on" : ""}" style="--c:${col}"><div class="hd"><span class="hx">${SECTIONS[k].icon}</span><div><h4>${esc(name)}</h4><span class="stt" style="--s:${sc}">${sl}</span></div></div><p>${esc(desc)}</p>${body}</div>`;
  }).join("");
}
function refreshConn(){ if(!$("connOv").hidden) renderConn(); if(S.mePage && S.mpTab === "connect" && $("mpConn")) renderConn($("mpConn")); }
function openConn(on){ $("connOv").hidden = !on; if(on){ renderConn(); setTimeout(() => $("connOv").querySelector("button,input")?.focus(), 30); } }
document.addEventListener("click", async e => {
  if(!e.target.closest("#connOv, #mpConn")) return;
  if(e.target.id === "connOv" || e.target.closest("[data-connclose]")){ openConn(false); return; }
  const g = e.target.closest("[data-conngo]"); if(g){ const k = g.dataset.conngo; openConn(false); if(S.mePage) openMe(false);
    if(SECTIONS[k]) openCallersPage(true, k); else if(k === "console"){ openConsole(); }
    else { go({section:k === "botconsole" ? "bots" : "scripts", sub:null, view:"list", openId:null}); setTimeout(() => $(k === "botconsole" ? "botConsole" : "scConsole")?.scrollIntoView({block:"start"}), 60); } return; }
  const a = e.target.closest("[data-connapply]"); if(!a) return; const k = a.dataset.connapply;
  const v3 = id => ($(id) ? $(id).value.trim() : ""), app = {t:Date.now(), nm:v3("cn_nm_" + k), mk:v3("cn_mk_" + k), ex:v3("cn_ex_" + k), ln:v3("cn_ln_" + k)};
  if(k !== "callers" && !app.nm) return toast("Give it a name first.");
  if(!app.ex) return toast("Tell the admins a little about it first.");
  if(app.ln && !/^https:\/\//.test(app.ln)) return toast("Links need to start with https://");
  if(!db || S.demo){ S.connPrev[k] = "pending"; toast("Application sent (preview only)"); refreshConn(); return; }
  if(!meId || !canWrite) return toast("Sign in with Contributor access to apply.");
  const key = k === "callers" ? "caller" : k === "bots" ? "bot" : "script";
  const ok = await act(async () => { if(k === "callers") await db.doc("requests/" + meId).set({t:Date.now(), note:[app.mk, app.ex, app.ln].filter(Boolean).join(" · ").slice(0, 600)}); await mergeWrite(db.doc("rolereq/" + meId), {[key]:{...app, done:false}}); });
  if(ok){ toast("Application sent. An admin will review it."); S.myRoleReq = {...(S.myRoleReq || {}), [key]:{...app, done:false}}; if(k === "callers") S.myReq = {t:Date.now()}; refreshConn(); }
});
document.addEventListener("input", e => { if(!e.target.closest("#connOv, #mpConn")) return; const m2 = /^cn_(nm|mk|ex|ln)_(\w+)$/.exec(e.target.id || ""); if(m2){ S.connDraft[m2[2]] = {...(S.connDraft[m2[2]] || {}), [m2[1]]:e.target.value}; } });
document.addEventListener("keydown", e => { if(e.key === "Escape" && !$("connOv").hidden) openConn(false); });
function connBadge(){}
function connQueue(){
  const out = [];
  (S.requests || []).forEach(r => out.push({k:"callers", id:r.id, t:r.t, note:r.note, app:((S.roleReqs || []).find(x => x.id === r.id) || {}).caller}));
  (S.roleReqs || []).forEach(r => { if(r.demon && !r.demon.done && !isDemon(r.id)) out.push({k:"demon", id:r.id, t:r.demon.t, app:{mk:"Discord: " + (r.demon.discord || "")}}); });
  (S.roleReqs || []).forEach(r => { ["bot","script"].forEach(key => { const a = r[key]; if(a && !a.done) out.push({k:key === "bot" ? "bots" : "scripts", id:r.id, t:a.t, app:a}); }); });
  return out.sort((a, b) => a.t - b.t);
}

// ---------- direct messages (end-to-end encrypted between members) ----------
S.dmPage = false; S.dmConv = null; S.dmDocs = {}; S.dmRead = {}; S.dmCfg = {}; S.dmInbox = {}; S.dmPlain = {}; S.dmQ = ""; S.dmLocal = {};
let dmKeys = null, dmShared = {}, dmSubbed = false, dmSeenAt = Date.now();
const dmPreview = () => !db || S.demo;
const convId = (a, b) => [a, b].sort().join("__");
const peerOf = c => c.split("__").find(x => x !== (meId || "you"));
const SYS = "d3mon";
// keys: private key stays in the member's private area; public key is published on their profile doc
async function dmEnsureKeys(){
  if(dmKeys || !db || !meId || !canWrite || !window.crypto || !crypto.subtle) return dmKeys;
  try {
    const snap = await db.doc(`data/users/${meId}/dmkey`).get();
    if(snap.exists && snap.data().priv){ const d = snap.data(); dmKeys = {priv:await crypto.subtle.importKey("jwk", d.priv, {name:"ECDH", namedCurve:"P-256"}, false, ["deriveKey"]), pub:d.pub}; }
    else {
      const kp = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveKey"]);
      const priv = await crypto.subtle.exportKey("jwk", kp.privateKey), pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
      await db.doc(`data/users/${meId}/dmkey`).set({priv, pub:{x:pub.x, y:pub.y}, t:Date.now()});
      dmKeys = {priv:kp.privateKey, pub:{x:pub.x, y:pub.y}};
    }
    const have = ((((S.botDocs || {})[meId] || {}).pub) || {}).dmk;
    if(!have || have.x !== dmKeys.pub.x) await mergeWrite(db.doc("bots/" + meId), {a:meId, pub:{dmk:dmKeys.pub}});
  } catch(e){ dmKeys = null; }
  return dmKeys;
}
const peerKey = id => ((((S.botDocs || {})[id] || {}).pub) || {}).dmk;
async function dmShare(id){
  const pk = peerKey(id); if(!pk || !dmKeys) return null;
  const k = id + ":" + pk.x; if(dmShared[k]) return dmShared[k];
  const pub = await crypto.subtle.importKey("jwk", {kty:"EC", crv:"P-256", x:pk.x, y:pk.y, ext:true}, {name:"ECDH", namedCurve:"P-256"}, false, []);
  return dmShared[k] = await crypto.subtle.deriveKey({name:"ECDH", public:pub}, dmKeys.priv, {name:"AES-GCM", length:256}, false, ["encrypt", "decrypt"]);
}
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))), ub64 = s2 => Uint8Array.from(atob(s2), ch => ch.charCodeAt(0));
async function dmEncrypt(id, text){ const key = await dmShare(id); if(!key) return null; const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, new TextEncoder().encode(text)); return {iv:b64(iv), ct:b64(ct)}; }
async function dmDecryptAll(){
  let changed = false;
  for(const d of Object.values(S.dmDocs)) { const peer = (d.p || []).find(x => x !== meId); for(const [mid, m] of Object.entries(d.msgs || {})){
    if(S.dmPlain[mid] !== undefined || !m || !m.ct) continue;
    try { const key = await dmShare(peer); if(!key){ continue; } const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv:ub64(m.iv)}, key, ub64(m.ct)); S.dmPlain[mid] = new TextDecoder().decode(pt); }
    catch { S.dmPlain[mid] = null; }
    changed = true; } }
  if(changed){ dmBadge(); if(S.dmPage) renderDM(); dmNotify(); }
}
function subscribeDM(){
  if(!db || dmSubbed) return; dmSubbed = true;
  db.doc("config/dm").onSnapshot(sn => { S.dmCfg = sn.exists ? sn.data() : {}; if(S.dmPage) renderDM(); }, () => {});
  db.doc("config/inbox").onSnapshot(sn => { S.dmInbox = sn.exists ? (sn.data().msgs || {}) : {}; dmBadge(); if(S.dmPage) renderDM(); dmNotify(); }, () => {});
  if(!meId) return;
  db.doc(`data/users/${meId}/dmread`).onSnapshot(sn => { S.dmRead = sn.exists ? (sn.data().r || {}) : {}; dmBadge(); if(S.dmPage) renderDM(); }, () => {});
  db.collection("dmx").where("p", "array-contains", meId).limit(500).onSnapshot(async sn => { S.dmDocs = Object.fromEntries(sn.docs.map(d => [d.id, d.data()])); await dmEnsureKeys(); dmDecryptAll(); dmBadge(); if(S.dmPage) renderDM(); }, () => {});
  setTimeout(dmEnsureKeys, 1500);
}
// conversations: sample (preview) or live
function dmSample(){
  if(dmSample.c) return dmSample.c; const now = Date.now(), m = 60000;
  return dmSample.c = {
    ["p:c1__you"]:[{f:"p:c1", b:"Hey! Saw you starred my profile 🙌", t:now - 190*m},{f:"you", b:"Your BTC 15m calls have been on point this week", t:now - 185*m},{f:"p:c1", b:"Appreciate it. I'm streaming the hourly open tonight if you want to hang", t:now - 180*m},{f:"p:c1", b:"Also voting on the prize pool proposal closes Saturday 👀", t:now - 25*m}],
    ["p:c7__you"]:[{f:"you", b:"Can you check the #btc channel link? It's not showing for me", t:now - 26*60*m},{f:"p:c7", b:"Fixed. It should show up now.", t:now - 25*60*m}],
    ["p:s2__you"]:[{f:"p:s2", b:"Welcome to the Cortex! Holler if anyone gives you trouble in chat.", t:now - 5*60*m}],
    ["p:s5__you"]:[{f:"p:s5", b:"Want to team up for Battle of the Bots S2? My arb bot + your timing", t:now - 3*24*60*m}]};
}
function dmConvs(){
  const out = [];
  if(dmPreview()){ for(const [c, L] of Object.entries(dmSample())){ const all = L.concat(S.dmLocal[c] || []).sort((a, b) => a.t - b.t); out.push({c, peer:peerOf(c), msgs:all.map((x, i) => ({id:c + i, ...x, mine:x.f === "you"}))}); }
    for(const [c, L] of Object.entries(S.dmLocal)) if(!out.some(o => o.c === c)) out.push({c, peer:peerOf(c), msgs:L.map((x, i) => ({id:c + "l" + i, ...x, mine:x.f === "you"}))}); }
  else {
    const by = {}; for(const d of Object.values(S.dmDocs)){ const c = convId(...(d.p || [])); (by[c] = by[c] || []).push(...Object.entries(d.msgs || {}).map(([id, m2]) => ({id, ...m2}))); }
    for(const [c, L] of Object.entries(by)) out.push({c, peer:peerOf(c), msgs:L.filter(x => x && x.t).sort((a, b) => a.t - b.t).map(x => ({...x, b:S.dmPlain[x.id], bad:S.dmPlain[x.id] === null, mine:x.f === meId}))});
  }
  const blocked = new Set((S.priv || {}).blocked || []);
  return out.filter(o => !blocked.has(o.peer)).map(o => ({...o, last:o.msgs[o.msgs.length - 1], unread:o.msgs.filter(x => !x.mine && x.t > (S.dmRead[o.c] || 0)).length})).sort((a, b) => ((b.last || {}).t || 0) - ((a.last || {}).t || 0));
}
const sysMsgs = () => { const L = Object.entries(dmPreview() && !Object.keys(S.dmInbox).length ? {s1:{t:Date.now() - 2*86400000, title:"Welcome to D3MON.CO messages", b:"Message any member from their profile. Messages between members are end-to-end encrypted: only you and the person you're talking to can read them."}} : S.dmInbox).map(([id, m2]) => ({id, ...m2})); return L.sort((a, b) => a.t - b.t); };
function dmUnreadTotal(){ return dmConvs().reduce((n, o) => n + o.unread, 0) + sysMsgs().filter(m2 => m2.t > (S.dmRead[SYS] || 0)).length; }
function dmBadge(){ const n = dmUnreadTotal(), b = $("dmBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
function dmNotify(){
  if((S.alerts || {}).dms === false) return;
  const fresh = dmConvs().flatMap(o => o.msgs.filter(x => !x.mine && x.t > dmSeenAt && x.b).map(x => ({...x, peer:o.peer, c:o.c})));
  const sys = sysMsgs().filter(m2 => m2.t > dmSeenAt);
  dmSeenAt = Date.now();
  if(fresh.length && !(S.dmPage && S.dmConv === fresh[fresh.length - 1].c)){ const x = fresh[fresh.length - 1]; toast(`✉ ${acctName(x.peer)}: ${x.b.slice(0, 60)}`); }
  if(sys.length) toast(`📣 ${sys[sys.length - 1].title || "New message from D3MON.CO"}`);
}
function dmMarkRead(c){
  const o = c === SYS ? {last:sysMsgs().slice(-1)[0]} : dmConvs().find(x => x.c === c); const t = ((o || {}).last || {}).t || Date.now();
  if((S.dmRead[c] || 0) >= t) return; S.dmRead = {...S.dmRead, [c]:t}; dmBadge();
  if(!dmPreview() && meId) mergeWrite(db.doc(`data/users/${meId}/dmread`), {r:{[c]:t}}).catch(() => {});
}
function openDM(on, peer){
  S.dmPage = on;
  if(on){ S.menu = null; renderSections();
    if(S.cc){ S.cc = false; renderCC(); } if(S.cortex){ S.cortex = false; if(typeof resetCorex === "function") resetCorex(); renderCortex(); }
    if(S.battlePage){ S.battlePage = false; renderBattlePage(); } if(S.vortexPage){ S.vortexPage = false; renderVortexPage(); }
    if(S.callersPage) openCallersPage(false); if(S.adminPage) openAdmin(false); if(S.mePage) openMe(false); if(S.coinPage) openCoin(false); }
  document.body.classList.toggle("dmmode", on); $("dmPage").hidden = !on; $("dmBtn").setAttribute("aria-pressed", on);
  if(on && peer) S.dmConv = peer === SYS ? SYS : convId(peer, meId || "you");
  try { history.replaceState(null, "", "#" + (on ? "messages" : S.section)); } catch {}
  if(on){ if(isAdmin || dmPreview()) memLoadProfiles(); renderDM(); setTimeout(() => { const b2 = document.querySelector(".dmmsgs"); if(b2) b2.scrollTop = b2.scrollHeight; }, 30); }
  window.scrollTo({top:0});
}
function dmAv(id, cls){ if(id === SYS) return `<span class="sysav">D3</span>`; if(/^(p:|mock-|you$)/.test(id)) { const p = /^p:/.test(id) ? getProfiles()[id.slice(2)] || {} : {}; return `<span class="av ${cls || ""}" style="background:${esc(p.color || `hsl(${[...id].reduce((a, c2) => a + c2.charCodeAt(0), 0) % 360} 70% 62%)`)}"></span>`; } return avatar(id, cls); }
function dmName(id){ return id === SYS ? `<span>${esc((S.site || {}).name || "D3MON.CO")}</span>` : /^(p:|mock-|you$)/.test(id) ? esc(acctName(id)) : who(id); }
function renderDM(){
  if(!S.dmPage) return;
  if(S.dmConv && !(S.dmCfg || {}).off) dmMarkRead(S.dmConv);
  const convs = dmConvs(), q = S.dmQ.trim().toLowerCase(), cfg = S.dmCfg || {};
  const sys = sysMsgs(), sysUn = sys.filter(m2 => m2.t > (S.dmRead[SYS] || 0)).length;
  const ago3 = t => { if(!t) return ""; const d = Date.now() - t; return d < 6e4 ? "now" : d < 36e5 ? Math.floor(d/6e4) + "m" : d < 864e5 ? Math.floor(d/36e5) + "h" : new Date(t).toLocaleDateString(undefined, {month:"short", day:"numeric"}); };
  let L = `<button class="dmc${sysUn ? " unread" : ""}" type="button" data-dmopen="${SYS}" aria-current="${S.dmConv === SYS}"><span class="sysav">D3</span><span style="min-width:0"><span class="nm">${esc((S.site || {}).name || "D3MON.CO")} announcements</span><span class="pv">${esc((sys.slice(-1)[0] || {}).title || "Updates from the team")}</span></span><span class="tm">${ago3((sys.slice(-1)[0] || {}).t)}${sysUn ? `<br><span class="ub">${sysUn}</span>` : ""}</span></button>`;
  const shown = convs.filter(o => !q || acctName(o.peer).toLowerCase().includes(q));
  if(shown.length) L += `<p class="dmcat">Direct messages</p>` + shown.map(o => `<button class="dmc${o.unread ? " unread" : ""}" type="button" data-dmopen="${esc(o.c)}" aria-current="${S.dmConv === o.c}">${dmAv(o.peer)}<span style="min-width:0"><span class="nm">${dmName(o.peer)}</span><span class="pv">${o.last ? (o.last.mine ? "You: " : "") + esc(o.last.bad ? "🔒 Can't decrypt" : o.last.b == null ? "🔒 Encrypted message" : o.last.b) : ""}</span></span><span class="tm">${ago3((o.last || {}).t)}${o.unread ? `<br><span class="ub">${o.unread}</span>` : ""}</span></button>`).join("");
  if(q){ const have = new Set(convs.map(o => o.peer)); const ppl = memberList().filter(m2 => (m2.name || acctName(m2.id)).toLowerCase().includes(q) && !have.has(m2.id) && m2.id !== meId && (dmPreview() || !/^(p:|mock-)/.test(m2.id))).slice(0, 12);
    L += `<p class="dmcat">Start a conversation</p>` + (ppl.map(m2 => `<button class="dmc" type="button" data-dmnew="${esc(m2.id)}">${dmAv(m2.id)}<span style="min-width:0"><span class="nm">${m2.profile || m2.mock ? esc(m2.name) : who(m2.id)}</span><span class="pv">New message</span></span><span></span></button>`).join("") || `<p class="pfine" style="padding:0 8px">No members match.</p>`); }
  else if(!convs.length) L += `<p class="pfine" style="padding:8px">No conversations yet. Search for a member above, or open someone's profile and tap Message.</p>`;
  $("dmList").innerHTML = L;
  // thread
  const c = S.dmConv; let T = "";
  if(cfg.off && !isAdmin) T = `<div class="dmempty"><b>Messages are paused</b>The team turned off direct messages for now.</div>`;
  else if(!c) T = `<div class="dmempty"><b>Your messages</b>Pick a conversation, or search for a member to start one. Messages between members are end-to-end encrypted.</div>`;
  else if(c === SYS){ dmMarkRead(SYS); T = `<header class="dmth"><button class="dico dmback" type="button" data-dmback title="Back">←</button><span class="sysav" style="width:34px;height:34px">D3</span><div><b>${esc((S.site || {}).name || "D3MON.CO")}</b><small>Announcements from the team</small></div></header><div class="dmmsgs">${sys.map(m2 => `<div class="bub sys"><b>${esc(m2.title || "Announcement")}</b>${esc(m2.b || "")}<time>${esc(new Date(m2.t).toLocaleString())}</time></div>`).join("") || `<div class="dmempty">Nothing yet.</div>`}</div><div class="dmnote">Only the team can post here.</div>`; }
  else {
    const peer = peerOf(c), o = convs.find(x => x.c === c) || {msgs:[], peer}; dmMarkRead(c);
    const noKey = !dmPreview() && !peerKey(peer), blocked = ((S.priv || {}).blocked || []).includes(peer);
    let lastDay = "";
    const msgs = o.msgs.map(x => { const day = dDay(x.t); const dv = day !== lastDay ? `<div class="dmday">${esc(day)}</div>` : ""; lastDay = day; return dv + `<div class="bub ${x.mine ? "mine" : ""}${x.bad ? " bad" : ""}">${x.bad ? "🔒 This message can't be decrypted on this device." : x.b == null ? "🔒 Decrypting…" : esc(x.b)}<time>${esc(tLocal(x.t))}</time></div>`; }).join("");
    T = `<header class="dmth"><button class="dico dmback" type="button" data-dmback title="Back">←</button><button class="plink" type="button" data-prof="${esc(peer)}">${dmAv(peer)}</button><div><button class="plink" type="button" data-prof="${esc(peer)}"><b>${dmName(peer)}</b></button><small>${dmPreview() ? "sample conversation" : noKey ? "hasn't opened messages yet" : "direct message"}</small></div><span class="lock">🔒 END-TO-END ENCRYPTED</span><button class="xbtn2" type="button" data-dmblock="${esc(peer)}" style="margin-left:8px">${blocked ? "Unblock" : "Block"}</button></header>
      <div class="dmmsgs" id="dmMsgs">${msgs || `<div class="dmempty"><b>Say hi 👋</b>This is the start of your conversation with ${dmName(peer)}.</div>`}</div>
      ${blocked ? `<div class="dmnote">You blocked this member. Unblock to send messages.</div>` : noKey ? `<div class="dmnote">${dmName(peer)} hasn't opened D3MON.CO since messages launched. You can message them once they visit; their encryption key is created automatically.</div>` : (!dmPreview() && (!meId || !canWrite)) ? `<div class="dmnote">Sign in with Contributor access to send messages.</div>` : `<form class="dmcomp" id="dmForm"><input id="dmIn" maxlength="2000" placeholder="Message ${esc(acctName(peer))}" autocomplete="off" aria-label="Message"><button class="btn sm">Send</button></form>`}`;
  }
  const keep = document.activeElement && document.activeElement.id === "dmIn" ? $("dmIn").value : null, box0 = $("dmMsgs"), atBottom = !box0 || box0.scrollHeight - box0.scrollTop - box0.clientHeight < 80;
  $("dmThread").innerHTML = T; $("dmWrap").classList.toggle("open", !!c);
  if(keep !== null && $("dmIn")){ $("dmIn").value = keep; $("dmIn").focus(); }
  const box = $("dmMsgs"); if(box && atBottom) box.scrollTop = box.scrollHeight;
  fillNames($("dmPage"));
}
async function dmSend(text){
  const c = S.dmConv, peer = peerOf(c); if(!text || !peer) return;
  if(dmPreview()){ (S.dmLocal[c] = S.dmLocal[c] || []).push({f:"you", b:text, t:Date.now()}); renderDM();
    setTimeout(() => { (S.dmLocal[c] = S.dmLocal[c] || []).push({f:peer, b:["Nice, talk soon 👊","Got it!","Haha true","Let's do it"][Math.floor(Math.random()*4)], t:Date.now()}); if(S.dmPage && S.dmConv === c) renderDM(); else { dmBadge(); toast(`✉ ${acctName(peer)} replied`); } }, 1600); return; }
  if(guestBlocked("dm")) return;
  if((S.dmCfg || {}).verifiedOnly && !isVerified(meId) && !isAdmin){ toast("Only verified members can send messages right now."); return; }
  if(!sendGuard()) return;
  await dmEnsureKeys(); const enc = await dmEncrypt(peer, text); if(!enc){ toast("Couldn't encrypt: they need to open D3MON.CO once first."); return; }
  const m = new Date().toISOString().slice(0, 7).replace("-", ""), pr = [meId, peer].sort(), id = newId();
  S.dmPlain[id] = text;
  await act(() => mergeWrite(db.doc("dmx/" + safeId(pr.join("__") + "__" + m)), {p:pr, m, msgs:{[id]:{f:meId, t:Date.now(), ...enc}}}));
}
$("dmBtn").addEventListener("click", () => openDM(!S.dmPage));
$("dmExitBtn").addEventListener("click", () => openDM(false));
$("dmQ").addEventListener("input", e => { S.dmQ = e.target.value; renderDM(); $("dmQ").focus(); });
$("dmPage").addEventListener("submit", async e => { if(e.target.id !== "dmForm") return; e.preventDefault(); const i = $("dmIn"), v2 = i.value.trim(); if(!v2) return; i.value = ""; await dmSend(v2.slice(0, 2000)); });
$("dmPage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if(d.dmopen){ S.dmConv = d.dmopen; renderDM(); setTimeout(() => { const x = $("dmMsgs"); if(x) x.scrollTop = x.scrollHeight; $("dmIn")?.focus(); }, 20); return; }
  if(d.dmnew){ S.dmConv = convId(d.dmnew, meId || "you"); S.dmQ = ""; $("dmQ").value = ""; if(!dmPreview()) await dmEnsureKeys(); renderDM(); $("dmIn")?.focus(); return; }
  if("dmback" in d){ S.dmConv = null; renderDM(); return; }
  if(d.dmblock){ const id = d.dmblock, bl = new Set((S.priv || {}).blocked || []); bl.has(id) ? bl.delete(id) : bl.add(id); S.priv = {...(S.priv || {}), blocked:[...bl]}; if(!dmPreview()) await saveFollows(); toast(bl.has(id) ? "Blocked. You won't see their messages." : "Unblocked"); if(bl.has(id)) S.dmConv = null; renderDM(); return; }
});
document.addEventListener("click", e => { const m2 = e.target.closest("[data-dmto]"); if(m2){ closeProfile(); openDM(true, m2.dataset.dmto || null); setTimeout(() => $("dmIn")?.focus(), 60); } });
setTimeout(dmBadge, 500);

// ---------- D3MON coin: local ledger, stats, holders, governance ----------
S.coinPage = false; S.cnTab = "overview"; S.coinCfg = null; S.ledgerDocs = {}; S.gov = {}; S.sampleVotes = {}; S.cnFilter = "all"; S.cnQ = ""; S.cnShow = 100; S.cnSubs = {};
const TXT = {mint:["MINT","#2EE59D"], transfer:["TRANSFER","#4DA3FF"], reward:["REWARD","#FFD166"], burn:["BURN","#FF4D6A"], adjust:["ADJUST","#B98CFF"]};
const PKIND = [["spend","Spend from treasury"],["reward","Reward members"],["rule","Rule change"],["feature","New feature"],["event","Event / competition"],["other","Other"]];
const coinSample = () => !db || S.demo;
function sampleCoin(){
  if(sampleCoin.c) return sampleCoin.c;
  const day = 86400000, now = Date.now(), T = [], add = (dAgo, type, from, to, amt, memo) => T.push({id:"x" + T.length, t:now - dAgo*day + T.length*60000, type, from, to, amt, memo, by:"admin", sample:true});
  add(30, "mint", "", "treasury", 5000000, "Genesis mint");
  const P = ["c1","c2","c3","c4","c5","c6","c7","c8","c9","c10"], amts = [42500, 18000, 9500, 38250, 22000, 46750, 29750, 12500, 15000, 21000];
  P.forEach((p, i) => add(28 - i, "reward", "treasury", "p:" + p, amts[i], "Founding caller allocation"));
  [["p:s5", 30000, "Battle of the Bots S1 winner"], ["p:s6", 12000, "Battle of the Bots S1 runner-up"], ["p:s7", 9000, "Script of the month"], ["p:s8", 14000, "Stream host rewards"], ["you", 2500, "Welcome reward"], ["p:s3", 85000, "Partner allocation"], ["p:s4", 120000, "Early supporter allocation"], ["p:s1", 15000, "Team allocation"], ["p:s9", 6000, "Mentor rewards"], ["p:s11", 4000, "Reviewer stipend"]].forEach(([a, n, m], i) => add(17 - i, "reward", "treasury", a, n, m));
  for(let i = 0; i < 22; i++){ const a = "p:" + P[i % 10], b = "p:" + P[(i*3 + 4) % 10]; if(a !== b) add(14 - i*0.6, "transfer", a, b, 250 + (i*137) % 1800, ["Tip for the call","Thanks for the stream","Bet settled","Group buy share"][i % 4]); }
  add(6, "burn", "treasury", "", 10000, "Quarterly burn");
  add(2, "mint", "", "treasury", 250000, "Season 2 rewards pool");
  add(1, "transfer", "you", "p:c1", 300, "Tip for the BTC call");
  const props = {
    g1:{title:"Fund the Season 2 Battle of the Bots prize pool", desc:"Move 50,000 D3M from the treasury to the Battle prize wallet so the top 3 bots are paid automatically.", kind:"spend", amount:50000, to:"p:s5", by:"p:c7", at:now - 2*day, start:now - 2*day, end:now + 3*day, status:"active"},
    g2:{title:"Add an ETH hourly round to the Battle", desc:"Run a second Battle track on ETH hourly markets starting next month.", kind:"feature", by:"p:c4", at:now - 9*day, start:now - 9*day, end:now - 2*day, status:"active"},
    g3:{title:"Raise the reviewer stipend to 500 D3M a month", desc:"Pay each approved reviewer 500 D3M a month from the treasury.", kind:"reward", amount:500, by:"p:c2", at:now - 12*day, start:now - 12*day, end:now - 5*day, status:"active"}};
  const votes = {g1:{"p:c1":"yes","p:c4":"yes","p:c6":"yes","p:c2":"no","p:c9":"abstain","p:s5":"yes","p:s4":"yes","p:s3":"no","p:s1":"yes"}, g2:{"p:c1":"yes","p:c4":"yes","p:c6":"yes","p:c7":"yes","p:c5":"no","p:c2":"yes"}, g3:{"p:c6":"no","p:c4":"no","p:c1":"yes","p:c7":"no"}};
  return sampleCoin.c = {cfg:{name:"D3MON Coin", symbol:"D3M", maxSupply:10000000, weight:"coins", voters:"both", proposers:"voters", quorum:20, threshold:50, days:5, created:now - 30*day}, txs:T, props, votes};
}
function coinCfg(){ return coinSample() ? sampleCoin().cfg : (S.coinCfg || null); }
const coinKey = () => `${coinSample()}|${S.ledgerVer || 0}|${Object.keys(S.localTx || {}).length}`;
function allTx(){
  if(allTx.k === coinKey()) return allTx.c; allTx.k = coinKey(); return allTx.c = allTx0();
}
function allTx0(){
  if(coinSample()) return sampleCoin().txs.concat(Object.values(S.localTx || {})).sort((x, y) => x.t - y.t);
  const out = []; for(const d of Object.values(S.ledgerDocs)) for(const [id, x] of Object.entries((d && d.tx) || {})) if(x && x.amt) out.push({id, ...x});
  return out.sort((a, b) => a.t - b.t);
}
function balances(){
  if(balances.k === coinKey()) return balances.c; balances.k = coinKey();
  const b = balances.c = {}; for(const x of allTx()){ const n = +x.amt || 0; if(x.from) b[x.from] = (b[x.from] || 0) - n; if(x.to) b[x.to] = (b[x.to] || 0) + n; } return b;
}
const balanceOf = a => Math.max(0, balances()[a] || 0);
const isHolder = id => !!id && (balanceOf(id) > 0 || !!catsOf(id).holder);
const sym = () => (coinCfg() || {}).symbol || "D3M";
const coinHoldTxt = a => ""; const coinHoldTxtOld = a => { const n = balanceOf(a); return n > 0 ? `${fmtN(n)} ${sym()}` : ""; };
function coinStats(){
  const T = allTx(), b = balances(), minted = T.filter(x => x.type === "mint").reduce((a, x) => a + x.amt, 0), burned = T.filter(x => x.type === "burn").reduce((a, x) => a + x.amt, 0);
  const supply = minted - burned, treas = Math.max(0, b.treasury || 0), holders = Object.entries(b).filter(([a, n]) => a !== "treasury" && n > 0);
  const d30 = Date.now() - 30*86400000, vol30 = T.filter(x => x.t > d30 && x.type !== "mint" && x.type !== "burn").reduce((a, x) => a + x.amt, 0);
  return {T, b, minted, burned, supply, treas, circ:supply - treas, holders:holders.sort((x, y) => y[1] - x[1]), vol30};
}
function acctName(a){
  if(!a) return "—"; if(a === "treasury") return "Treasury"; if(a === "you") return "You";
  if(/^p:/.test(a)) return (getProfiles()[a.slice(2)] || {}).name || "Profile";
  if(/^mock-/.test(a)) return a.slice(5);
  return (S.memProf[a] || {}).name || S.nameCache[a] || "Member";
}
const acctHtml = a => !a ? `<span style="color:var(--ink-3)">—</span>` : a === "treasury" ? `<b style="color:#FFD166">Treasury</b>` : /^(p:|mock-|you$)/.test(a) ? `<button class="plink" type="button" data-prof="${esc(a === "you" ? "You (demo)" : a)}"><b>${esc(acctName(a))}</b></button>` : `<button class="plink" type="button" data-prof="${esc(a)}"><b>${who(a)}</b></button>`;
const myAcct = () => coinSample() ? "you" : meId;
// governance
function govProps(){ return coinSample() ? {...sampleCoin().props, ...((S.gov || {}).props || {})} : ((S.gov || {}).props || {}); }
function votesFor(pid){
  if(coinSample()) return {...(sampleCoin().votes[pid] || {}), ...(S.sampleVotes[pid] || {})};
  const v = {}; for(const [uid, d] of Object.entries(S.botDocs || {})) if(d && d.votes && d.votes[pid]) v[uid] = d.votes[pid]; return v;
}
function eligible(a){
  const c = coinCfg() || {}, mode = c.voters || "both";
  const h = balanceOf(a) > 0, v = a && (catsOf(a).voter || (/^p:/.test(a) && ((getProfiles()[a.slice(2)] || {}).cats || {}).voter));
  return mode === "holders" ? h : mode === "voters" ? !!v : (h || !!v);
}
function voterList(){
  const st = coinStats(), set = new Set(st.holders.map(([a]) => a));
  Object.entries(((S.memReg || {}).cats) || {}).forEach(([id, c]) => { if(c && c.voter) set.add(id); });
  Object.entries(getProfiles()).forEach(([pid, p]) => { if(p && (p.cats || {}).voter) set.add("p:" + pid); });
  return [...set].filter(eligible);
}
const weightOf = a => (coinCfg() || {}).weight === "member" ? 1 : balanceOf(a);
function govTally(pid){
  const p = govProps()[pid] || {}, V = votesFor(pid), c = coinCfg() || {}, voters = voterList();
  const totalW = voters.reduce((s2, a) => s2 + weightOf(a), 0) || 1, t = {yes:0, no:0, abstain:0, n:0};
  for(const [a, ch] of Object.entries(V)) if(eligible(a) && t[ch] !== undefined){ t[ch] += weightOf(a); t.n++; }
  const cast = t.yes + t.no + t.abstain, turnout = cast/totalW*100, q = +(p.quorum ?? c.quorum ?? 20), th = +(p.threshold ?? c.threshold ?? 50);
  const yesPct = t.yes + t.no ? t.yes/(t.yes + t.no)*100 : 0, quorumMet = turnout >= q, passing = quorumMet && yesPct > th;
  const ended = p.end && Date.now() > p.end;
  const status = p.status === "executed" || p.status === "cancelled" || p.status === "pending" || p.status === "declined" ? p.status : ended ? (passing ? "passed" : "failed") : "active";
  return {...t, cast, totalW, turnout, q, th, yesPct, quorumMet, passing, status};
}
const PST = {active:["VOTING OPEN","#4DA3FF"], passed:["PASSED","#2EE59D"], failed:["FAILED","#FF4D6A"], executed:["EXECUTED","#FFD166"], cancelled:["CANCELLED","#587080"], pending:["AWAITING REVIEW","#FFB547"], declined:["DECLINED","#587080"]};
function subscribeCoin(){
  if(!db) return;
  db.doc("config/coin").onSnapshot(sn => { S.coinCfg = sn.exists ? sn.data() : null; for(const m of ((S.coinCfg || {}).months || [])) watchLedger(m); refreshCoin(); }, () => {});
  db.doc("config/gov").onSnapshot(sn => { S.gov = sn.exists ? sn.data() : {}; refreshCoin(); }, () => {});
}
function watchLedger(m){ if(S.cnSubs[m]) return; S.cnSubs[m] = db.doc("config/ledger-" + m).onSnapshot(sn => { S.ledgerDocs[m] = sn.exists ? sn.data() : {}; S.ledgerVer = (S.ledgerVer || 0) + 1; refreshCoin(); }, () => {}); }
function refreshCoin(){ if(S.coinPage) renderCoin(); if(S.mePage) renderMe(); }
async function writeTx(type, from, to, amt, memo, ref){
  amt = Math.round(+amt || 0); if(amt <= 0) { toast("Enter an amount above 0."); return false; }
  const st = coinStats(), c = coinCfg() || {};
  if((type === "transfer" || type === "reward" || type === "burn") && from && (st.b[from] || 0) < amt){ toast(`${acctName(from)} only has ${fmtN(st.b[from] || 0)} ${sym()}.`); return false; }
  if(type === "mint" && c.maxSupply && st.supply + amt > c.maxSupply){ toast(`That would pass the max supply of ${fmtN(c.maxSupply)}.`); return false; }
  const x = {t:Date.now(), type, from:from || "", to:to || "", amt, memo:memo || "", by:meId || "admin", ...(ref ? {ref} : {})};
  if(coinSample()){ S.localTx = S.localTx || {}; const id = "l" + Date.now(); S.localTx[id] = {id, ...x}; toast("Recorded (preview only)"); return true; }
  const m = new Date().toISOString().slice(0, 7).replace("-", ""), months = [...new Set([...((S.coinCfg || {}).months || []), m])];
  const ok = await act(async () => { if(!((S.coinCfg || {}).months || []).includes(m)) await mergeWrite(db.doc("config/coin"), {months}); await mergeWrite(db.doc("config/ledger-" + m), {month:m, tx:{[newId()]:x}}); });
  if(ok){ watchLedger(m); toast(`${TXT[type][0][0] + TXT[type][0].slice(1).toLowerCase()} recorded`); } return ok;
}
function acctOptions(sel, withTreasury){
  const seen = new Set(), opts = [];
  const push = (a, l) => { if(!a || seen.has(a)) return; seen.add(a); opts.push([a, l]); };
  if(withTreasury) push("treasury", "Treasury");
  memberList().forEach(m => { if(m.id && !/^mock-/.test(m.id) || coinSample()) push(m.id, m.name || acctName(m.id)); });
  Object.keys(balances()).forEach(a => push(a, acctName(a)));
  return `<option value="">Choose…</option>` + opts.sort((a, b) => a[0] === "treasury" ? -1 : b[0] === "treasury" ? 1 : String(a[1]).localeCompare(String(b[1]))).map(([a, l]) => `<option value="${esc(a)}" ${a === sel ? "selected" : ""}>${esc(l)}${a !== "treasury" ? ` · ${fmtN(balanceOf(a))}` : ""}</option>`).join("");
}
function volChart(T){
  const days = 30, day = 86400000, start = new Date(); start.setHours(0, 0, 0, 0); const t0 = start.getTime() - (days - 1)*day;
  const v = Array(days).fill(0); T.forEach(x => { if(x.type === "mint" || x.type === "burn") return; const i = Math.floor((x.t - t0)/day); if(i >= 0 && i < days) v[i] += x.amt; });
  const mx = Math.max(1, ...v), W = 600, H = 150, bw = W/days;
  const bars = v.map((n, i) => { const h2 = n ? Math.max(3, n/mx*(H - 22)) : 0, x = i*bw + 2, y = H - 18 - h2; return `<g data-vi="${i}"><rect x="${i*bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>${n ? `<path d="M${x} ${H - 18} V${y + 4} q0 -4 4 -4 h${bw - 8} q4 0 4 4 V${H - 18} Z" fill="#FFD166"/>` : ""}</g>`; }).join("");
  const lbl = i => new Date(t0 + i*day).toLocaleDateString(undefined, {month:"short", day:"numeric"});
  return `<div class="vchart" data-vals="${v.join(",")}" data-t0="${t0}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily coin volume, last 30 days"><line x1="0" x2="${W}" y1="${H - 18}" y2="${H - 18}" stroke="var(--line)" stroke-width="1"/>${bars}</svg><div class="tip"></div><div class="ax"><span>${lbl(0)}</span><span>${lbl(15)}</span><span>${lbl(29)}</span></div></div>`;
}
function propCard(pid, p){
  const t = govTally(pid), [sl, sc] = PST[t.status] || PST.active, me = myAcct(), V = votesFor(pid), mine = me && V[me], canVote = t.status === "active" && me && eligible(me) && (coinSample() || canWrite);
  const pct = n => t.cast ? n/t.cast*100 : 0;
  return `<div class="gprop"><h4>${esc(p.title)} <span class="pst" style="--c:${sc}">${sl}</span>${p.sample || coinSample() ? "" : ""}</h4>
    <div class="meta">${esc((PKIND.find(k => k[0] === p.kind) || ["","Other"])[1])}${p.amount ? ` · ${fmtN(p.amount)} ${sym()}` : ""}${p.to ? ` → ${esc(acctName(p.to))}` : ""} · proposed by ${esc(acctName(p.by))} · ${p.end ? (Date.now() < p.end ? `closes ${esc(new Date(p.end).toLocaleString())}` : `closed ${esc(new Date(p.end).toLocaleDateString())}`) : ""}</div>
    ${p.desc ? `<p>${esc(p.desc)}</p>` : ""}
    ${t.status !== "pending" && t.status !== "declined" ? `<div class="gvbars">${[["Yes", t.yes, "#2EE59D"], ["No", t.no, "#FF4D6A"], ["Abstain", t.abstain, "#8FA3B2"]].map(([l, n, c]) => `<div class="gvbar" style="--c:${c}"><span>${l}</span><div class="tr"><i style="width:${pct(n).toFixed(1)}%"></i></div><span>${fmtN(n)} · ${pct(n).toFixed(0)}%</span></div>`).join("")}</div>
    <div class="qline">Turnout <b>${t.turnout.toFixed(1)}%</b> of voting power (quorum ${t.q}%) ${t.quorumMet ? "✓" : "✗"} · Yes <b>${t.yesPct.toFixed(0)}%</b> of yes+no (needs over ${t.th}%) ${t.passing ? "✓" : "✗"} · ${t.n} vote${t.n === 1 ? "" : "s"}</div>` : ""}
    ${canVote ? `<div class="vbtns">${[["yes","Vote yes","#2EE59D"],["no","Vote no","#FF4D6A"],["abstain","Abstain","#8FA3B2"]].map(([k, l, c]) => `<button type="button" style="--c:${c}" data-vote="${esc(pid)}|${k}" aria-pressed="${mine === k}">${l}</button>`).join("")}${mine ? `<span class="pfine">You voted ${esc(mine)} · weight ${fmtN(weightOf(me))}</span>` : ""}</div>`
      : t.status === "active" && me && !eligible(me) ? `<p class="pfine">Only voting members can vote. ${(coinCfg() || {}).voters === "voters" ? "Ask an admin to make you a voting member." : "Hold coins on the ledger to vote."}</p>` : ""}
    ${isAdmin && !coinSample() ? `<div class="aacts">${t.status === "pending" ? `<button class="btn sm" type="button" data-propok="${esc(pid)}">Open voting</button><button class="btn ghost sm" type="button" data-propst="${esc(pid)}|declined">Decline</button>` : ""}${t.status === "passed" && p.kind === "spend" && p.amount && p.to ? `<button class="btn sm" type="button" data-propexec="${esc(pid)}">Execute: pay ${fmtN(p.amount)} ${sym()}</button>` : ""}${t.status === "passed" ? `<button class="btn ghost sm" type="button" data-propst="${esc(pid)}|executed">Mark done</button>` : ""}${t.status === "active" ? `<button class="xbtn2" type="button" data-propst="${esc(pid)}|cancelled">Cancel</button>` : ""}</div>` : ""}</div>`;
}
const CN_TABS = () => [["overview","Overview"],["ledger","Full ledger"],["holders","Holders"],["governance","Votes & proposals"],["wallet","My coins"], ...(isAdmin || coinSample() ? [["manage","Manage (admin)"]] : [])];
function openCoin(on, tab){
  if(on){ return; }
  if(on && S.dmPage) openDM(false);
  if(on && tab) S.cnTab = tab;
  S.coinPage = on;
  if(on){ S.menu = null; renderSections();
    if(S.cc){ S.cc = false; renderCC(); } if(S.cortex){ S.cortex = false; if(typeof resetCorex === "function") resetCorex(); renderCortex(); }
    if(S.battlePage){ S.battlePage = false; renderBattlePage(); } if(S.vortexPage){ S.vortexPage = false; renderVortexPage(); }
    if(S.callersPage) openCallersPage(false); if(S.adminPage) openAdmin(false); if(S.mePage) openMe(false); }
  document.body.classList.toggle("coinmode", on); $("coinPage").hidden = !on; $("coinBtn").setAttribute("aria-pressed", on);
  try { history.replaceState(null, "", "#" + (on ? "coin" : S.section)); } catch {}
  if(on){ renderCoin.lastTab = null; renderCoin(); const p = $("coinPage"); p.classList.remove("enter"); void p.offsetWidth; p.classList.add("enter"); setTimeout(() => p.classList.remove("enter"), 900); if(isAdmin) memLoadProfiles(); }
  window.scrollTo({top:0});
}
function renderCoin(){
  if(!S.coinPage) return;
  const c = coinCfg(), st = coinStats(), T = S.cnTab, me = myAcct();
  $("cnTitle").textContent = c ? c.name || "D3MON Coin" : "D3MON Coin";
  $("cnWho").textContent = coinSample() ? "SAMPLE DATA · preview" : c ? `${sym()} · ${fmtN(st.supply)} in supply` : "Not set up yet";
  const props = Object.entries(govProps()), activeN = props.filter(([pid]) => govTally(pid).status === "active").length;
  $("cnNav").innerHTML = CN_TABS().map(([k, l]) => `<button type="button" data-cntab="${k}" aria-current="${T === k}">${esc(l)}${k === "governance" && activeN ? `<span class="n">${activeN}</span>` : ""}</button>`).join("");
  let h = "";
  if(!c){ h = `<div class="acard"><h3>The coin isn't set up yet</h3><p class="hint">${isAdmin ? "Set the coin's name, symbol and starting supply in Manage." : "An admin will set up the D3MON coin ledger soon."}</p>${isAdmin ? `<div class="aacts"><button class="btn sm" type="button" data-cntab="manage">Set up the coin</button></div>` : ""}</div>`; }
  else if(T === "overview"){
    h += `<div class="acard"><h3>${esc(c.name || "D3MON Coin")} <small>${esc(sym())}</small></h3><div class="astats">${[["Total supply", st.supply, "#FFD166"],["Max supply", c.maxSupply || 0, ""],["Treasury", st.treas, "#FFB547"],["Circulating", st.circ, "#4DA3FF"],["Holders", st.holders.length, "var(--up)"],["Transactions", st.T.length, ""],["30-day volume", st.vol30, "#9ECBFF"],["Burned", st.burned, "#FF4D6A"]].map(([l, n, col]) => `<div class="astat" ${col ? `style="--c:${col}"` : ""}><b class="cnum" style="font-size:22px">${fmtN(n)}</b><span>${l}</span></div>`).join("")}</div></div>
      <div class="acard"><h3>Daily volume <small>transfers + rewards, last 30 days · hover a bar</small></h3>${volChart(st.T)}</div>
      <div class="acard"><h3>Top holders <small>share of total supply</small></h3><div class="lwrap"><table class="ltbl"><thead><tr><th>#</th><th>Holder</th><th class="r">Balance</th><th>Share</th></tr></thead><tbody>${[["treasury", st.treas], ...st.holders].slice(0, 11).map(([a, n], i) => `<tr><td>${a === "treasury" ? "—" : i}</td><td>${acctHtml(a)}</td><td class="r"><span class="amt">${fmtN(n)}</span></td><td><div class="hbar"><i style="width:${(n/(st.supply || 1)*100).toFixed(2)}%"></i></div><span class="pfine">${(n/(st.supply || 1)*100).toFixed(2)}%</span></td></tr>`).join("")}</tbody></table></div><div class="aacts" style="margin-top:6px"><button class="xbtn2" type="button" data-cntab="holders">All holders</button></div></div>
      <div class="acard"><h3>Latest activity</h3>${ledgerTable(st.T.slice(-8).reverse())}<div class="aacts" style="margin-top:6px"><button class="xbtn2" type="button" data-cntab="ledger">Full ledger</button></div></div>
      ${activeN ? `<div class="acard"><h3>Open votes <small>${activeN}</small></h3>${props.filter(([pid]) => govTally(pid).status === "active").map(([pid, p]) => propCard(pid, p)).join("")}</div>` : ""}`;
  }
  else if(T === "ledger"){
    const q = S.cnQ.trim().toLowerCase();
    let L = st.T.slice().reverse().filter(x => S.cnFilter === "all" || x.type === S.cnFilter).filter(x => !q || [acctName(x.from), acctName(x.to), x.memo || ""].join(" ").toLowerCase().includes(q));
    h += `<div class="acard"><h3>Full ledger <small>${L.length} of ${st.T.length} entries · newest first</small></h3>
      <div class="mfil">${[["all","All"], ...Object.entries(TXT).map(([k, v2]) => [k, v2[0]])].map(([k, l]) => `<button type="button" data-cnf="${k}" aria-pressed="${S.cnFilter === k}" style="--c:${(TXT[k] || ["", "#DCE7EE"])[1]}">${esc(l)} <b>${k === "all" ? st.T.length : st.T.filter(x => x.type === k).length}</b></button>`).join("")}</div>
      <div class="mbar"><div class="af"><label for="cnQ">Search</label><input id="cnQ" type="search" value="${esc(S.cnQ)}" placeholder="Name or memo" autocomplete="off"></div><button class="btn ghost sm" type="button" data-cncsv>Copy as CSV</button></div>
      ${ledgerTable(L.slice(0, S.cnShow))}${L.length > S.cnShow ? `<div class="aacts" style="margin-top:6px"><button class="xbtn2" type="button" data-cnmore>Show more</button></div>` : ""}<textarea id="cnCsv" hidden readonly style="width:100%;min-height:120px;margin-top:8px;font:12px var(--mono);background:var(--bg);color:var(--ink-2);border:1px solid var(--line)"></textarea></div>`;
  }
  else if(T === "holders"){
    const vset = new Set(voterList());
    h += `<div class="acard"><h3>All holders <small>${st.holders.length} accounts hold ${fmtN(st.circ)} ${sym()}</small></h3><div class="lwrap"><table class="ltbl"><thead><tr><th>#</th><th>Holder</th><th class="r">Balance</th><th>Share of supply</th><th>Voting</th></tr></thead><tbody>
      <tr><td>—</td><td>${acctHtml("treasury")}</td><td class="r"><span class="amt">${fmtN(st.treas)}</span></td><td><div class="hbar"><i style="width:${(st.treas/(st.supply || 1)*100).toFixed(2)}%"></i></div><span class="pfine">${(st.treas/(st.supply || 1)*100).toFixed(2)}%</span></td><td></td></tr>
      ${st.holders.map(([a, n], i) => `<tr><td>${i + 1}</td><td>${acctHtml(a)}</td><td class="r"><span class="amt">${fmtN(n)}</span></td><td><div class="hbar"><i style="width:${(n/(st.supply || 1)*100).toFixed(2)}%"></i></div><span class="pfine">${(n/(st.supply || 1)*100).toFixed(2)}%</span></td><td>${vset.has(a) ? `<span class="tb" style="--c:#FFB547">VOTER · ${fmtN(weightOf(a))}</span>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  else if(T === "governance"){
    const voters = voterList(), totalW = voters.reduce((s2, a) => s2 + weightOf(a), 0), canProp = isAdmin || coinSample() || ((c.proposers || "voters") === "voters" && me && eligible(me));
    const order = {pending:0, active:1, passed:2, failed:3, executed:4, cancelled:5, declined:6};
    const mine = !coinSample() && meId ? Object.entries(((S.botDocs || {})[meId] || {}).proposals || {}).filter(([id]) => !govProps()[id]) : [];
    const subs = isAdmin && !coinSample() ? Object.entries(S.botDocs || {}).flatMap(([uid, d]) => Object.entries((d && d.proposals) || {}).filter(([id, p]) => !govProps()[id] && !p.handled).map(([id, p]) => [id, {...p, by:uid, status:"pending"}])) : [];
    h += `<div class="acard"><h3>How voting works</h3><div class="astats">${[["Voting members", voters.length, "#FFB547"],["Voting power", totalW, ""],["Quorum", (c.quorum ?? 20) + "%", ""],["Pass threshold", ">" + (c.threshold ?? 50) + "%", ""]].map(([l, n, col]) => `<div class="astat" ${col ? `style="--c:${col}"` : ""}><b style="font-size:22px">${typeof n === "number" ? fmtN(n) : esc(n)}</b><span>${l}</span></div>`).join("")}</div>
      <p class="hint">${(c.voters || "both") === "holders" ? "Every coin holder can vote." : (c.voters || "both") === "voters" ? "Only members an admin marks as voting members can vote." : "Coin holders and members marked as voting members can vote."} ${(c.weight || "coins") === "coins" ? "Votes are weighted by coins held." : "Each member gets one vote."} A proposal passes when turnout reaches quorum and more than ${c.threshold ?? 50}% of yes+no votes are yes.</p></div>`;
    if(subs.length) h += `<div class="acard"><h3>Submitted by members <small>${subs.length} awaiting review</small></h3>${subs.map(([id, p]) => propCardPending(id, p)).join("")}</div>`;
    const P = props.sort((a, b) => (order[govTally(a[0]).status] - order[govTally(b[0]).status]) || (b[1].at - a[1].at));
    h += `<div class="acard"><h3>Proposals <small>${P.length}</small></h3>${P.length ? P.map(([pid, p]) => propCard(pid, p)).join("") : `<div class="aempty">No proposals yet.</div>`}${mine.length ? `<p class="pfine">You have ${mine.length} proposal${mine.length > 1 ? "s" : ""} waiting for admin review.</p>` : ""}</div>`;
    if(canProp) h += `<div class="acard"><h3>Propose a group action</h3><div class="aform">
      <div class="af w"><label for="gp_title">Title</label><input id="gp_title" maxlength="100" placeholder="Fund a prize pool for…"></div>
      <div class="af w"><label for="gp_desc">Details</label><textarea id="gp_desc" maxlength="1000" placeholder="What should the group do, and why?"></textarea></div>
      <div class="af"><label for="gp_kind">Type</label><select id="gp_kind">${PKIND.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
      <div class="af"><label for="gp_amt">Amount (if spending)</label><input id="gp_amt" type="number" min="0" placeholder="0"></div>
      <div class="af"><label for="gp_to">Pay to (if spending)</label><select id="gp_to">${acctOptions("", false)}</select></div>
      <div class="af"><label for="gp_days">Voting period</label><select id="gp_days">${[1,3,5,7,14].map(d => `<option value="${d}" ${(c.days || 5) === d ? "selected" : ""}>${d} day${d > 1 ? "s" : ""}</option>`).join("")}</select></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-propnew>${isAdmin || coinSample() ? "Open for voting" : "Submit for review"}</button></div></div>`;
    else h += `<div class="acard"><h3>Propose a group action</h3><p class="hint">${(c.proposers || "voters") === "admins" ? "Only admins can create proposals right now." : "Voting members can propose group actions. Hold coins or ask an admin to make you a voting member."}</p></div>`;
  }
  else if(T === "wallet"){
    if(!me) h += `<div class="acard"><h3>My coins</h3><p class="hint">Sign in to see your balance.</p></div>`;
    else {
      const bal = balanceOf(me), rank = st.holders.findIndex(([a]) => a === me) + 1, my = st.T.filter(x => x.from === me || x.to === me).reverse();
      const reqs = coinSample() ? Object.values(S.localXfer || {}) : Object.entries(((S.botDocs || {})[meId] || {}).xfer || {}).map(([id, x]) => ({id, ...x}));
      h += `<div class="acard"><h3>My balance</h3><div class="cbig cnum">${fmtN(bal)} <span style="font-size:16px;color:var(--ink-3)">${esc(sym())}</span></div><p class="pfine">${bal > 0 ? `Rank #${rank} of ${st.holders.length} holders · ${(bal/(st.supply || 1)*100).toFixed(3)}% of supply · ${eligible(me) ? `voting power ${fmtN(weightOf(me))}` : "not a voting member"}` : "You don't hold any coins yet."}</p></div>
        <div class="acard"><h3>Send coins <small>an admin confirms each transfer on the ledger</small></h3><div class="aform"><div class="af"><label for="xf_to">To</label><select id="xf_to">${acctOptions("", false)}</select></div><div class="af"><label for="xf_amt">Amount</label><input id="xf_amt" type="number" min="1" placeholder="0"></div><div class="af w"><label for="xf_memo">Memo</label><input id="xf_memo" maxlength="120" placeholder="Tip for the call"></div></div><div class="aacts"><button class="btn sm" type="button" data-xfer>Request transfer</button></div>
        ${reqs.length ? `<div class="alist" style="margin-top:8px">${reqs.sort((a, b) => b.at - a.at).map(x => `<div class="arow"><span class="adot" style="--c:${x.done ? (x.ok ? "var(--up)" : "#FF4D6A") : "#FFB547"}"></span><div class="t">${fmtN(x.amt)} ${esc(sym())} → ${esc(acctName(x.to))}<small>${esc(new Date(x.at).toLocaleString())}${x.memo ? " · " + esc(x.memo) : ""}</small></div><div><span class="pst" style="--c:${x.done ? (x.ok ? "#2EE59D" : "#FF4D6A") : "#FFB547"}">${x.done ? (x.ok ? "SENT" : "DECLINED") : "PENDING"}</span></div></div>`).join("")}</div>` : ""}</div>
        <div class="acard"><h3>My transactions <small>${my.length}</small></h3>${ledgerTable(my, me)}</div>`;
    }
  }
  else if(T === "manage"){
    if(!isAdmin && !coinSample()){ h = `<div class="acard"><h3>Admins only</h3></div>`; }
    else {
      const xreq = coinSample() ? [] : Object.entries(S.botDocs || {}).flatMap(([uid, d]) => Object.entries((d && d.xfer) || {}).filter(([, x]) => x && !x.done).map(([id, x]) => ({uid, id, ...x})));
      h += `<div class="acard"><h3>Record a ledger entry</h3><div class="aform">
        <div class="af"><label for="lg_type">Type</label><select id="lg_type">${Object.entries(TXT).map(([k, v2]) => `<option value="${k}">${v2[0][0] + v2[0].slice(1).toLowerCase()}</option>`).join("")}</select><small>Mint creates coins · Reward pays from the treasury · Burn destroys coins · Adjust corrects a balance</small></div>
        <div class="af"><label for="lg_from">From</label><select id="lg_from">${acctOptions("treasury", true)}</select></div>
        <div class="af"><label for="lg_to">To</label><select id="lg_to">${acctOptions("", true)}</select></div>
        <div class="af"><label for="lg_amt">Amount</label><input id="lg_amt" type="number" min="1" placeholder="0"></div>
        <div class="af w"><label for="lg_memo">Memo</label><input id="lg_memo" maxlength="140" placeholder="What this is for"></div></div>
        <div class="aacts"><button class="btn sm" type="button" data-lgsave>Record entry</button></div><p class="hint">Mint ignores "From". Burn ignores "To". Entries can't be edited later; record an Adjust to correct one.</p></div>
        <div class="acard"><h3>Transfer requests <small>${xreq.length} waiting</small></h3><div class="alist">${xreq.length ? xreq.map(x => `<div class="arow">${avatar(x.uid,"sm")}<div class="t">${who(x.uid)} → <b>${esc(acctName(x.to))}</b> · ${fmtN(x.amt)} ${esc(sym())}<small>${esc(ago(x.at))}${x.memo ? " · " + esc(x.memo) : ""} · their balance ${fmtN(balanceOf(x.uid))}</small></div><div class="aacts"><button class="btn sm" type="button" data-xok="${esc(x.uid)}|${esc(x.id)}">Approve</button><button class="btn ghost sm" type="button" data-xno="${esc(x.uid)}|${esc(x.id)}">Decline</button></div></div>`).join("") : `<div class="aempty">No transfer requests. Members send coins from My coins.</div>`}</div></div>
        <div class="acard"><h3>Coin settings</h3><div class="aform">
        <div class="af"><label for="cs_name">Coin name</label><input id="cs_name" value="${esc((c || {}).name || "D3MON Coin")}"></div>
        <div class="af"><label for="cs_sym">Symbol</label><input id="cs_sym" value="${esc((c || {}).symbol || "D3M")}" maxlength="8"></div>
        <div class="af"><label for="cs_max">Max supply</label><input id="cs_max" type="number" min="0" value="${esc((c || {}).maxSupply || 10000000)}"></div>
        ${!c ? `<div class="af"><label for="cs_init">Starting treasury (minted now)</label><input id="cs_init" type="number" min="0" value="1000000"></div>` : ""}</div>
        <h4 style="margin:6px 0 0;font:700 11px var(--mono);letter-spacing:.14em;color:var(--ink-3)">VOTING RULES</h4><div class="aform">
        <div class="af"><label for="cs_voters">Who can vote</label><select id="cs_voters">${[["both","Coin holders + voting members"],["holders","Coin holders only"],["voters","Voting members only"]].map(([k, l]) => `<option value="${k}" ${((c || {}).voters || "both") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="af"><label for="cs_weight">Vote weight</label><select id="cs_weight">${[["coins","Weighted by coins held"],["member","One member, one vote"]].map(([k, l]) => `<option value="${k}" ${((c || {}).weight || "coins") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="af"><label for="cs_props">Who can propose</label><select id="cs_props">${[["voters","Voting members (admin reviews first)"],["admins","Admins only"]].map(([k, l]) => `<option value="${k}" ${((c || {}).proposers || "voters") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="af"><label for="cs_q">Quorum (% of voting power)</label><input id="cs_q" type="number" min="0" max="100" value="${esc((c || {}).quorum ?? 20)}"></div>
        <div class="af"><label for="cs_th">Pass threshold (% yes)</label><input id="cs_th" type="number" min="0" max="100" value="${esc((c || {}).threshold ?? 50)}"></div>
        <div class="af"><label for="cs_days">Default voting days</label><input id="cs_days" type="number" min="1" max="30" value="${esc((c || {}).days || 5)}"></div></div>
        <div class="aacts"><button class="btn sm" type="button" data-cssave>${c ? "Save settings" : "Create the coin"}</button></div><p class="hint">Voting members are set per member in Admin → Members → Categories ("Voting member").</p></div>`;
    }
  }
  const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest("#cnBody") && document.activeElement.id;
  if(keep && renderCoin.lastTab === T) return;
  renderCoin.lastTab = T; $("cnBody").innerHTML = h; fillNames($("coinPage"));
}
function propCardPending(id, p){ return `<div class="gprop"><h4>${esc(p.title)} <span class="pst" style="--c:#FFB547">AWAITING REVIEW</span></h4><div class="meta">${esc((PKIND.find(k => k[0] === p.kind) || ["","Other"])[1])}${p.amount ? ` · ${fmtN(p.amount)} ${sym()}` : ""}${p.to ? ` → ${esc(acctName(p.to))}` : ""} · by <span>${who(p.by)}</span></div>${p.desc ? `<p>${esc(p.desc)}</p>` : ""}<div class="aacts"><button class="btn sm" type="button" data-subok="${esc(p.by)}|${esc(id)}">Open voting</button><button class="btn ghost sm" type="button" data-subno="${esc(p.by)}|${esc(id)}">Decline</button></div></div>`; }
function ledgerTable(L, me){
  if(!L.length) return `<div class="aempty">No entries yet.</div>`;
  return `<div class="lwrap"><table class="ltbl"><thead><tr><th>When</th><th>Type</th><th>From</th><th>To</th><th class="r">Amount</th><th>Memo</th></tr></thead><tbody>${L.map(x => { const [l, col] = TXT[x.type] || ["?", "#8FA3B2"]; const dir = me ? (x.to === me ? "in" : x.from === me ? "out" : "") : "";
    return `<tr><td style="white-space:nowrap">${esc(new Date(x.t).toLocaleDateString(undefined, {month:"short", day:"numeric"}))} <span class="pfine">${esc(tLocal(x.t))}</span></td><td><span class="ttype" style="--c:${col}">${l}</span></td><td>${acctHtml(x.from)}</td><td>${acctHtml(x.to)}</td><td class="r"><span class="amt ${dir}">${dir === "out" ? "−" : dir === "in" ? "+" : ""}${fmtN(x.amt)}</span></td><td>${esc(x.memo || "")}</td></tr>`; }).join("")}</tbody></table></div>`;
}
$("coinBtn").addEventListener("click", () => openCoin(!S.coinPage));
$("cnExitBtn").addEventListener("click", () => openCoin(false));
$("coinPage").addEventListener("mousemove", e => {
  const g = e.target.closest("[data-vi]"), ch = e.target.closest(".vchart"); if(!ch) return; const tip = ch.querySelector(".tip");
  if(!g){ tip.style.display = "none"; return; }
  const i = +g.dataset.vi, v = ch.dataset.vals.split(",")[i], d = new Date(+ch.dataset.t0 + i*86400000), r = ch.getBoundingClientRect(), rr = g.getBoundingClientRect();
  tip.innerHTML = `${esc(d.toLocaleDateString(undefined, {month:"short", day:"numeric"}))} · <b>${fmtN(+v)}</b> ${esc(sym())}`; tip.style.display = "block"; tip.style.left = (rr.left - r.left + rr.width/2) + "px"; tip.style.top = "20px";
});
$("coinPage").addEventListener("mouseleave", () => { const t = $("coinPage").querySelector(".vchart .tip"); if(t) t.style.display = "none"; });
$("coinPage").addEventListener("input", e => { if(e.target.id === "cnQ"){ S.cnQ = e.target.value; const c2 = e.target.selectionStart; renderCoin.lastTab = null; renderCoin(); const n = $("cnQ"); if(n){ n.focus(); try { n.setSelectionRange(c2, c2); } catch {} } } });
$("coinPage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if(d.cntab){ S.cnTab = d.cntab; renderCoin.lastTab = null; renderCoin(); return; }
  if(d.cnf){ S.cnFilter = d.cnf; S.cnShow = 100; renderCoin.lastTab = null; renderCoin(); return; }
  if("cnmore" in d){ S.cnShow += 200; renderCoin.lastTab = null; renderCoin(); return; }
  if("cncsv" in d){ const rows = [["time","type","from","to","amount","memo"], ...allTx().map(x => [new Date(x.t).toISOString(), x.type, acctName(x.from), acctName(x.to), x.amt, x.memo || ""])].map(r => r.map(v2 => `"${String(v2).replace(/"/g, '""')}"`).join(",")).join("\n");
    try { await navigator.clipboard.writeText(rows); toast("Ledger copied as CSV"); } catch { const t = $("cnCsv"); t.hidden = false; t.value = rows; t.select(); toast("Select all and copy the CSV below"); } return; }
  if(d.vote){ const [pid, ch] = d.vote.split("|"), me = myAcct();
    if(coinSample()){ S.sampleVotes[pid] = {...(S.sampleVotes[pid] || {}), [me]:ch}; toast(`Voted ${ch} (preview only)`); renderCoin.lastTab = null; renderCoin(); return; }
    if(await act(() => mergeWrite(db.doc("bots/" + meId), {a:meId, votes:{[pid]:ch}}))) toast(`You voted ${ch}`); return; }
  if("propnew" in d){ const title = apV("gp_title"); if(!title) return toast("Give the proposal a title."); const days = +apV("gp_days") || 5, now = Date.now();
    const p = {title, desc:($("gp_desc").value || "").trim(), kind:apV("gp_kind"), amount:Math.round(+apV("gp_amt") || 0), to:apV("gp_to"), by:myAcct() || "", at:now};
    if(p.kind === "spend" && (!p.amount || !p.to)) return toast("Spending proposals need an amount and who to pay.");
    const id = "g" + now.toString(36);
    if(coinSample()){ S.gov = {...S.gov, props:{...((S.gov || {}).props || {}), [id]:{...p, start:now, end:now + days*86400000, status:"active"}}}; toast("Proposal opened (preview only)"); renderCoin.lastTab = null; renderCoin(); return; }
    if(isAdmin){ if(await act(() => mergeWrite(db.doc("config/gov"), {props:{[id]:{...p, start:now, end:now + days*86400000, status:"active", days}}}))) toast("Voting is open"); }
    else if(await act(() => mergeWrite(db.doc("bots/" + meId), {a:meId, proposals:{[id]:{...p, days}}}))) toast("Submitted. An admin will review it."); return; }
  if(d.subok || d.subno){ const [uid, id] = (d.subok || d.subno).split("|"), p = (((S.botDocs || {})[uid] || {}).proposals || {})[id] || {}, now = Date.now();
    const ok = await act(async () => { if(d.subok) await mergeWrite(db.doc("config/gov"), {props:{[id]:{...p, by:uid, start:now, end:now + (p.days || (coinCfg() || {}).days || 5)*86400000, status:"active"}}}); await mergeWrite(db.doc("bots/" + uid), {proposals:{[id]:{handled:true, ok:!!d.subok}}}); });
    if(ok) toast(d.subok ? "Voting is open" : "Proposal declined"); return; }
  if(d.propok){ const now = Date.now(), p = govProps()[d.propok] || {}; await act(() => mergeWrite(db.doc("config/gov"), {props:{[d.propok]:{status:"active", start:now, end:now + (p.days || 5)*86400000}}})); return; }
  if(d.propst){ const [pid, stt] = d.propst.split("|"); if(await act(() => mergeWrite(db.doc("config/gov"), {props:{[pid]:{status:stt}}}))) toast("Updated"); return; }
  if(d.propexec){ const p = govProps()[d.propexec]; if(p && await writeTx("transfer", "treasury", p.to, p.amount, `Proposal: ${p.title}`, d.propexec)) await act(() => mergeWrite(db.doc("config/gov"), {props:{[d.propexec]:{status:"executed", execAt:Date.now()}}})); return; }
  if("xfer" in d){ const to = apV("xf_to"), amt = Math.round(+apV("xf_amt") || 0), memo = apV("xf_memo"), me = myAcct(); if(!to || amt <= 0) return toast("Pick who to send to and an amount."); if(to === me) return toast("You can't send to yourself.");
    if(amt > balanceOf(me)) return toast(`You only have ${fmtN(balanceOf(me))} ${sym()}.`);
    if(coinSample()){ S.localXfer = S.localXfer || {}; const id = "q" + Date.now(); S.localXfer[id] = {id, to, amt, memo, at:Date.now()}; toast("Request sent (preview only)"); renderCoin.lastTab = null; renderCoin(); return; }
    if(await act(() => mergeWrite(db.doc("bots/" + meId), {a:meId, xfer:{[newId()]:{to, amt, memo, at:Date.now()}}}))) toast("Request sent. An admin will confirm it."); return; }
  if(d.xok || d.xno){ const [uid, id] = (d.xok || d.xno).split("|"), x = ((((S.botDocs || {})[uid] || {}).xfer) || {})[id]; if(!x) return;
    if(d.xok && !(await writeTx("transfer", uid, x.to, x.amt, x.memo || "Member transfer", id))) return;
    await act(() => mergeWrite(db.doc("bots/" + uid), {xfer:{[id]:{done:true, ok:!!d.xok}}})); if(d.xno) toast("Declined"); return; }
  if("lgsave" in d){ const type = apV("lg_type"), from = type === "mint" ? "" : apV("lg_from"), to = type === "burn" ? "" : apV("lg_to");
    if(type !== "mint" && !from) return toast("Choose who it's from."); if(type !== "burn" && !to) return toast("Choose who it goes to.");
    if(await writeTx(type, from, to, apV("lg_amt"), apV("lg_memo"))){ renderCoin.lastTab = null; renderCoin(); } return; }
  if("cssave" in d){ const cfg = {name:apV("cs_name") || "D3MON Coin", symbol:(apV("cs_sym") || "D3M").toUpperCase(), maxSupply:Math.round(+apV("cs_max") || 0), voters:apV("cs_voters"), weight:apV("cs_weight"), proposers:apV("cs_props"), quorum:+apV("cs_q") || 0, threshold:+apV("cs_th") || 50, days:+apV("cs_days") || 5};
    if(coinSample()){ Object.assign(sampleCoin().cfg, cfg); toast("Saved (preview only)"); renderCoin.lastTab = null; renderCoin(); return; }
    const first = !S.coinCfg, init = Math.round(+apV("cs_init") || 0);
    if(await act(() => mergeWrite(db.doc("config/coin"), {...cfg, ...(first ? {created:Date.now(), months:[]} : {})}))){ S.coinCfg = {...(S.coinCfg || {}), ...cfg, months:(S.coinCfg || {}).months || []}; if(first && init > 0) await writeTx("mint", "", "treasury", init, "Genesis mint"); toast(first ? "Coin created" : "Settings saved"); renderCoin.lastTab = null; renderCoin(); } return; }
});

// ---------- My D3MON: the member hub ----------
S.mePage = false; S.mpTab = "home"; S.alerts = S.alerts || {}; S.priv = S.priv || {}; S.roleReqs = []; S.myRoleReq = null; S.previewPub = {};
const MP_TABS = [["home","Overview"],["walls","My callers · bots · charts"],["feed","Feed"],["people","People"],["connect","Connect"],["listing","My listing"],["console","Call console"],["profile","My profile"],["business","Business page"],["favorites","Favorites"],["following","Following"],["reviews","My reviews"],["roles","Roles & access"],["alerts","Notifications"],["creator","Creator tools"],["privacy","Privacy & data"],["help","Help & rules"]];
const MARKETS = ["BTC","ETH","SOL","XRP","Kalshi","Polymarket"], STYLES = [["scalp","Scalper (15m)"],["day","Day trader (hourly)"],["swing","Swing trader"],["bots","Bot builder"],["charts","Chart scripter"],["learn","Still learning"]];
const pubOf = id => (id && ((S.botDocs || {})[id] || {}).pub) || ((id === meId || id === "me") && (!db || S.demo) ? S.previewPub : null) || {};
const myPub = () => pubOf(meId || "me");
// the three follow walls live in My D3MON now; parked (hidden, still rendered) when that tab isn't open
function wallsPark(){ let pk = $("wallPark"); if(!pk){ pk = document.createElement("div"); pk.id = "wallPark"; pk.hidden = true; document.body.appendChild(pk); } ["wall", "wallBots", "wallCharts"].forEach(id => { const w = $(id); if(w && w.parentElement !== pk) pk.appendChild(w); }); }
function wallsMount(){ const b = $("mpBody"); if(!b) return; const box = document.createElement("div"); box.className = "mpwalls"; ["wall", "wallBots", "wallCharts"].forEach(id => { const w = $(id); if(w) box.appendChild(w); }); b.appendChild(box); }
function openMe(on){
  if(on && S.dmPage) openDM(false);
  if(on && S.coinPage) openCoin(false);
  S.mePage = on;
  if(on){ S.menu = null; renderSections();
    if(S.cc){ S.cc = false; renderCC(); } if(S.cortex){ S.cortex = false; if(typeof resetCorex === "function") resetCorex(); renderCortex(); }
    if(S.battlePage){ S.battlePage = false; renderBattlePage(); } if(S.vortexPage){ S.vortexPage = false; renderVortexPage(); }
    if(S.callersPage) openCallersPage(false); if(S.adminPage) openAdmin(false); }
  document.body.classList.toggle("memode", on); $("mePage").hidden = !on; $("meBtn").setAttribute("aria-pressed", on);
  try { history.replaceState(null, "", "#" + (on ? "me" : S.section)); } catch {}
  if(on){ renderMe(); const p = $("mePage"); p.classList.remove("enter"); void p.offsetWidth; p.classList.add("enter"); setTimeout(() => p.classList.remove("enter"), 900); }
  window.scrollTo({top:0});
}
const mpPreview = () => !db || S.demo;
async function savePub(patch, msg){
  if(mpPreview()){ S.previewPub = {...S.previewPub, ...patch}; toast((msg || "Saved") + " (preview only)"); return true; }
  if(!meId || !canWrite) { toast("Sign in with Contributor access to save."); return false; }
  const ok = await act(() => mergeWrite(db.doc("bots/" + meId), {a:meId, pub:patch})); if(ok) toast(msg || "Saved"); return ok;
}
async function savePrefs(msg){ if(mpPreview()){ toast((msg || "Saved") + " (preview only)"); return; } await saveFollows(); toast(msg || "Saved"); }
function myRoles(){ return myRolesAll().filter(r => r[0] !== "holder" && r[0] !== "voter"); }
function myRolesAll(){
  const c = catsOf(meId), ver = meId && isVerified(meId);
  return [
    ["caller","Verified caller","var(--callers)","C","Post official round calls and appear on the Callers page.", ver ? "active" : S.myReq ? "pending" : "none"],
    ["streamer","Streamer","var(--live)","S","Go live on the Cortex stream wall.", ver || (S.streamers || {})[meId] ? "active" : (S.myRoleReq || {}).streamer ? "pending" : "none"],
    ["reviewer","Reviewer","#9FF3CF","R","Write star reviews on callers, bots and scripts.", isReviewer(meId) && c.reviewer ? "active" : S.myRvReq ? "pending" : "none"],
    ["holder","Coin holder","#FFD166","H","Hold D3M on the ledger: HOLDER badge, #holders-lounge and a vote.", isHolder(meId || (mpPreview() ? "you" : "")) || balanceOf("you") > 0 && mpPreview() ? "active" : "none"],
    ["voter","Voting member","#FFB547","V","Vote on proposed group actions.", eligible(myAcct()) ? "active" : "none"],
    ["demon","Demon","#FF4D6A","D","Link your Discord to D3MON.CO and get the DEMON badge everywhere you appear.", isDemon(meId) || (mpPreview() && (S.myRoleReq || {}).demonOk) ? "active" : ((S.myRoleReq || {}).demon && !(S.myRoleReq || {}).demon.done) ? "pending" : "none"],
    ["mod","Chat moderator","#FF8A3D","M","Keep the Cortex chat clean. Assigned by admins.", c.mod ? "active" : "none"],
    ["botdev","Bot developer","var(--bots)","B","Register bots and enter the Battle of the Bots.", Object.keys(((S.botDocs || {})[meId] || {}).list || {}).length ? "active" : "none"],
    ["scripter","Script developer","var(--scripts)","S","Publish chart scripts and indicators.", Object.keys(((S.scDocs || {})[meId] || {}).list || {}).length ? "active" : "none"]];
}
function renderMe(){
  if(!S.mePage) return;
  const signed = !!meId || mpPreview(), pub = myPub(), c = catsOf(meId), T = S.mpTab;
  const type = ACCT.find(a => a[0] === (((S.memReg || {}).types || {})[meId] || (isOwner ? "owner" : isAdmin ? "staff" : "member"))) || ACCT[5];
  const roles = myRoles(), active = roles.filter(r => r[5] === "active");
  const favList = (S.favs || []), fol = S.follows || [];
  const myRevs = (S.reviews || []).filter(r => r.a && r.a === meId).concat(Object.values(S.localReviews || {}));
  const myMsgs = S.demo ? (S.demoMsgs || []).filter(m => m.name === "You (demo)") : meId ? loungeMsgs().filter(m => m.a === meId) : [];
  $("mpWho").innerHTML = `${meId ? `<img class="av" alt="" data-av="${esc(meId)}">` : `<span class="av" style="background:${esc(pub.color || "#2EE59D")}"></span>`}<div style="min-width:0"><h2>${meId ? who(meId) : "You"}</h2><p>${esc(pub.tagline || "Your home on D3MON.CO: profile, favorites, roles and settings.")}</p><div class="pbd"><span class="tb" style="--c:${type[2]}">${esc(type[1].toUpperCase())}</span>${active.map(r => `<span class="tb" style="--c:${r[2]}">${esc(r[1].toUpperCase())}</span>`).join("")}</div></div>`;
  const pending = roles.filter(r => r[5] === "pending").length;
  $("mpNav").innerHTML = MP_TABS.filter(([k]) => k !== "console" || isCallerMe() || isAdmin).map(([k, l]) => `<button type="button" data-mptab="${k}" aria-current="${T === k}">${esc(l)}${k === "favorites" && favList.length ? `<span class="n ok">${favList.length}</span>` : k === "roles" && pending ? `<span class="n">${pending}</span>` : ""}</button>`).join("");
  let h = "";
  if(!signed) h = `<div class="acard"><h3>Sign in to use My D3MON</h3><p class="hint">Open the published page while signed in to claude.ai to save your profile, favorites and settings.</p></div>`;
  else if(T === "home"){
    const todo = [];
    if(!pub.bio) todo.push(["md","Add a short bio so people know how you trade","profile"]);
    if(["callers","bots","scripts"].some(k => connStatus(k) === "approved") && !((pub.row || {}).ups || []).length) todo.push(["ok","Post a status update on your listing","listing"]);
    if(!favList.length) todo.push(["ok","Star callers, bots or scripts to build your favorites","favorites"]);
    roles.filter(r => r[5] === "pending").forEach(r => todo.push(["md", `${r[1]} request is waiting for an admin`, "roles"]));
    if(!["callers","bots","scripts"].some(k => connStatus(k) === "approved")) todo.push(["md","Connect to Callers, Bots or Chart Scripts","connect"]);
    h += `<div class="acard"><h3>At a glance</h3><div class="astats">${[["Favorites", favList.length, "#FFD166"],["Following", fol.length, "var(--callers)"],["Reviews written", myRevs.length, "#9FF3CF"],["Chat messages", myMsgs.length, "#4DA3FF"],["Roles", active.length, "var(--up)"],["My bots", Object.keys(((S.botDocs || {})[meId] || {}).list || {}).length, "var(--bots)"],["My scripts", Object.keys(((S.scDocs || {})[meId] || {}).list || {}).length, "var(--scripts)"]].map(([l, n, col]) => `<div class="astat" style="--c:${col}"><b>${n}</b><span>${l}</span></div>`).join("")}</div></div>
      <div class="acard"><h3>Suggested next steps</h3><div class="aneed">${todo.map(([k, t, tab]) => `<button type="button" data-mptab="${tab}"><span class="k ${k}">${k === "md" ? "TODO" : "TIP"}</span>${esc(t)}</button>`).join("") || `<div class="aempty">You're all set.</div>`}</div></div>
      <div class="acard"><h3>Jump in</h3><div class="aacts"><button class="btn sm" type="button" data-mpgo="cortex">Open the Cortex</button><button class="btn ghost sm" type="button" data-mpgo="callers">Callers</button><button class="btn ghost sm" type="button" data-mpgo="bots">Bots</button><button class="btn ghost sm" type="button" data-mpgo="scripts">Chart scripts</button><button class="btn ghost sm" type="button" data-mpgo="battle">Battle of the Bots</button><button class="btn ghost sm" type="button" data-dmto="">Messages</button></div></div>`;
  }
  else if(T === "console"){
    if(!isCallerMe() && !isAdmin) h += `<div class="acard"><h3>Call console</h3><p class="hint">The call console is for members with the Caller role. Apply to Callers under Connect. Once an admin approves you, your console shows up here.</p><div class="aacts"><button class="btn sm" type="button" data-mptab="connect">Apply under Connect</button></div></div>`;
    else { const cs = pub.cstat || "auto";
      h += `<div class="acard"><h3>My caller status</h3><p class="hint">Pick what people see next to your name on your profile and hover card.</p>
        <div class="cstat">${CSTAT.map(([k, l, d]) => `<button type="button" data-cstat="${k}" aria-pressed="${cs === k}"><b>${esc(l)}</b><span>${esc(d)}</span></button>`).join("")}</div>
        <label class="atog"><input type="checkbox" id="mpShowCall" ${pub.showCall ? "checked" : ""}>Show my calls for the current rounds on my profile</label>
        <p class="hint">When this is on, your profile shows your call for the running round and the next round: direction, confidence and venue.</p></div>
        <div id="mpConSlot"></div>`; }
  }
  else if(T === "listing"){
    const ok = mpPreview() || ["callers","bots","scripts"].some(k => connStatus(k) === "approved") || isAdmin;
    if(!ok) h += `<div class="acard"><h3>My listing</h3><p class="hint">Once you're approved in Callers, Bots or Chart Scripts, you can choose what shows on your row and post status updates for people browsing the list.</p><div class="aacts"><button class="btn sm" type="button" data-mptab="connect">Go to Connect</button></div></div>`;
    else {
      const prow = myPub().row || {}, me2 = myAcct();
      const demoC = {key:meId || "You (demo)", id:meId, name:meId ? (S.myName || "You") : "You", color:myPub().color || "#2EE59D", demo:!meId, online:true, live:null, next:{d:"up"}, voice:S.inVoice || null, rec:"—"};
      const R = {show:prow.show || {}, ups:(prow.ups || []).slice(0, lMax()), src:{tagline:myPub().tagline, markets:myPub().markets, links:myPub()}};
      h += `<div class="acard"><h3>Preview <small>how your row looks on the list</small></h3><div class="lprev">${rowHtml(demoC, {R, preview:true})}</div></div>
        <div class="acard"><h3>My listing <small>reviews always show</small></h3><p class="hint">Pick what people see on your row, and post short updates to market yourself. Your tagline and markets come from My profile.</p>${listingEditor("ml", prow)}<div class="aacts"><button class="btn sm" type="button" data-mlsave>Save what shows</button><button class="btn ghost sm" type="button" data-mptab="profile">Edit tagline & links</button></div></div>`;
    }
  }
  else if(T === "feed") h += spFeedHtml();
  else if(T === "people") h += spPeopleHtml();
  else if(T === "business") h += spBizEditor();
  else if(T === "connect"){
    h += `<div class="acard"><h3>Connect to the triangle <small>Callers · Bots · Chart Scripts</small></h3><p class="hint">Apply to join a section. Once an admin approves you, you're connected: listed on that section's main page with its console unlocked.</p><div class="conngrid" id="mpConn" style="padding:0"></div></div>`;
  }
  else if(T === "profile"){
    const mk = pub.markets || [], so = pub.socials || {};
    h += cxLiveStatusCard() + `<div class="acard"><h3>Public profile <small>shown when someone clicks your name</small></h3><div class="aform">
      <div class="af w"><label for="mp_tag">Tagline</label><input id="mp_tag" maxlength="80" value="${esc(pub.tagline || "")}" placeholder="BTC 15m scalper · Kalshi regular"></div>
      <div class="af w"><label for="mp_bio">About me</label><textarea id="mp_bio" maxlength="400" placeholder="How you trade, what you look for, what you're learning…">${esc(pub.bio || "")}</textarea></div>
      <div class="af"><label for="mp_style">Trading style</label><select id="mp_style"><option value="">Pick one</option>${STYLES.map(([k, l]) => `<option value="${k}" ${pub.style === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="af"><label for="mp_tz">Time zone</label><select id="mp_tz">${["","ET (New York)","CT (Chicago)","MT (Denver)","PT (Los Angeles)","UK (London)","CET (Berlin)","IST (India)","SGT (Singapore)","JST (Tokyo)","AEST (Sydney)"].map(z => `<option ${pub.tz === z ? "selected" : ""} value="${esc(z)}">${z || "Not shown"}</option>`).join("")}</select></div>
      <div class="af" style="max-width:150px"><label for="mp_color">Banner color</label><input id="mp_color" type="color" value="${esc(pub.color || "#2EE59D")}" style="height:40px;padding:2px"></div>
      <div class="af"><label for="mp_loc">Location</label><input id="mp_loc" maxlength="40" value="${esc(pub.loc || "")}" placeholder="Austin, TX"></div>
      <div class="af w"><span class="fl">Banner style</span><div class="bnsw">${SP_BANNERS.map(([k, l, css]) => `<label><input type="radio" name="mp_banner" value="${k}" ${(pub.banner || "") === k ? "checked" : ""}><i style="--bn:${css || esc(pub.color || "#2EE59D")}"></i>${esc(l)}</label>`).join("")}</div></div>
      <div class="af w"><span class="fl">Markets I trade</span><div class="chips">${MARKETS.map(m => `<label><input type="checkbox" data-mpmk="${m}" ${mk.includes(m) ? "checked" : ""}>${m}</label>`).join("")}</div></div></div></div>
      <div class="acard"><h3>Market yourself <small>shown on your profile and listing</small></h3>${socialEditor("mp", pub)}
      <div class="aacts"><button class="btn sm" type="button" data-mpsave="profile">Save profile</button><button class="btn ghost sm" type="button" data-mpview>Preview my profile</button></div></div>` + dchatCard(pub);
  }
  else if(T === "favorites"){
    const all = [...callerDir().map(x => ({...x, sec:"Caller"})), ...entityDir("bots").map(x => ({...x, sec:"Bot"})), ...entityDir("scripts").map(x => ({...x, sec:"Script"}))];
    const F = all.filter(x => isFav(x.key, x.name));
    const grp = [["Caller","var(--callers)"],["Bot","var(--bots)"],["Script","var(--scripts)"]];
    h += `<div class="acard"><h3>My favorites <small>${F.length}</small></h3><p class="hint">Tap the ☆ on any profile to add it here. Only you can see this list.</p>${F.length ? grp.map(([g, col]) => { const L = F.filter(x => x.sec === g); return L.length ? `<div class="mgrp" style="--c:${col}">${g}s <small>${L.length}</small></div><div class="alist">${L.map(x => `<div class="arow"><span class="av sm" style="background:${esc(x.color || "#4DA3FF")}"></span><div class="t"><button class="plink" type="button" data-prof="${esc(x.key)}"><b>${esc(x.name)}</b></button><small>${x.live ? "● LIVE · " : ""}${esc(revStatsTxt(x.key, x.name))}</small></div><div class="aacts"><button class="xbtn2" type="button" data-prof="${esc(x.key)}">Open</button><button class="xbtn2" type="button" data-mpunfav="${esc(x.key)}" data-favname="${esc(x.name)}">★ Remove</button></div></div>`).join("")}</div>` : ""; }).join("") : `<div class="aempty">No favorites yet. <button class="xbtn2" type="button" data-mpgo="callers">Browse callers</button></div>`}</div>`;
  }
  else if(T === "following"){
    h += `<div class="acard"><h3>Callers I follow <small>${fol.length} of 24</small></h3><p class="hint">Followed callers appear on your callers wall with voice alerts when they post a call.</p><div class="alist">${fol.length ? fol.map(id => `<div class="arow">${avatar(id,"sm")}<div class="t"><button class="plink" type="button" data-prof="${esc(id)}">${who(id)}</button><small>record ${esc(callerStats(id))}</small></div><div class="aacts"><button class="xbtn2" type="button" data-follow="${esc(id)}">Unfollow</button></div></div>`).join("") : `<div class="aempty">You're not following anyone yet. Open a verified caller's profile and tap Follow.</div>`}</div></div>`;
  }
  else if(T === "reviews"){
    h += `<div class="acard"><h3>Reviews I've written <small>${myRevs.length}</small></h3><div class="alist">${myRevs.length ? myRevs.sort((a, b) => b.at - a.at).map(r => `<div class="arow"><span class="adot" style="--c:#FFD166"></span><div class="t">${starsHtml(r.r)} on <button class="plink" type="button" data-prof="${esc(r.t)}"><b>${esc(revLookupName(r.t))}</b></button><small>${esc(new Date(r.at).toLocaleDateString())}${r.b ? " · " + esc(r.b) : ""}</small></div><div class="aacts"><button class="xbtn2" type="button" data-prof="${esc(r.t)}">Edit</button>${r.id && !String(r.id).startsWith("loc") ? `<button class="xbtn2" type="button" data-rvdel="${esc(r.id)}">Delete</button>` : ""}</div></div>`).join("") : `<div class="aempty">${isReviewer(meId) || canReview() ? "You haven't written any reviews yet." : "Reviews are written by approved reviewers. Apply in Roles & access."}</div>`}</div></div>`;
  }
  else if(T === "roles"){
    h += `<div class="acard"><h3>Roles & access <small>what you can do on D3MON.CO</small></h3><div>${roles.map(([k, l, col, ic, d, st]) => `<div class="rolecard" style="--c:${col}"><span class="ic">${ic}</span><div><b>${esc(l)}</b><small>${esc(d)}</small></div><div class="aacts">${st === "active" ? `<span class="stt">ACTIVE</span>` : st === "pending" ? `<span class="stt" style="--c:#FFB547">PENDING</span>` : roleAction(k)}</div></div>`).join("")}</div></div>
`;
  }
  else if(T === "alerts"){
    const a = S.alerts || {};
    h += `<div class="acard"><h3>Notifications</h3>
      <label class="atog"><input type="checkbox" id="al_dms" ${a.dms === false ? "" : "checked"}>Pop-up when I get a direct message</label>
      <label class="atog"><input type="checkbox" id="al_mentions" ${a.mentions === false ? "" : "checked"}>Pop-up when someone @mentions me in the Cortex</label>
      <label class="atog"><input type="checkbox" id="al_favlive" ${a.favLive === false ? "" : "checked"}>Pop-up when one of my favorites goes live</label>
      <label class="atog"><input type="checkbox" id="al_voice" ${S.voice ? "checked" : ""}>Voice alerts for calls from callers I follow</label>
      <label class="atog"><input type="checkbox" id="al_ann" ${a.hideAnn ? "" : "checked"}>Show site announcements</label>
      <label class="atog"><input type="checkbox" id="al_social" ${a.social === false ? "" : "checked"}>Pop-up when someone follows me, likes or comments on my posts</label>
      <div class="aacts"><button class="btn sm" type="button" data-mpsave="alerts">Save notifications</button></div></div>`;
  }
  else if(T === "creator"){
    const B = Object.values(((S.botDocs || {})[meId] || {}).list || {}), C = Object.values(((S.scDocs || {})[meId] || {}).list || {});
    h += `<div class="acard"><h3>My bots <small>${B.length}</small></h3>${B.length ? `<div class="alist">${B.map(b => `<div class="arow"><span class="adot" style="--c:var(--bots)"></span><div class="t"><b>${esc(b.name)}</b><small>${esc(b.status || "")} · ${esc((b.sources || []).join(", "))}</small></div><div></div></div>`).join("")}</div>` : `<p class="hint">Register a bot to post its calls and enter the Battle of the Bots.</p>`}<div class="aacts"><button class="btn sm" type="button" data-mpgo="botconsole">Open the Bot console</button></div></div>
      <div class="acard"><h3>My chart scripts <small>${C.length}</small></h3>${C.length ? `<div class="alist">${C.map(b => `<div class="arow"><span class="adot" style="--c:var(--scripts)"></span><div class="t"><b>${esc(b.name)}</b><small>${esc((b.asset || "") + " " + (b.tf || ""))} · ${esc(b.signal || "")}</small></div><div></div></div>`).join("")}</div>` : `<p class="hint">Publish a script so its signals show on the site.</p>`}<div class="aacts"><button class="btn sm" type="button" data-mpgo="scconsole">Open the Script console</button></div></div>
      <div class="acard"><h3>Streaming</h3><p class="hint">${canStream(meId) ? "You can go live in the Cortex. Open it and tap the live button in your user panel." : "Verified callers and approved streamers can go live with video or audio. Request streaming in Roles & access."}${spScreenOK() ? " Every member can share their screen in the Cortex." : ""}</p><div class="aacts">${spScreenOK() ? `<button class="btn sm" type="button" data-spshare>🖥 Share my screen</button>` : ""}<button class="btn ghost sm" type="button" data-mpgo="cortex">Open the Cortex</button></div></div>`;
  }
  else if(T === "privacy"){
    const pv = S.priv || {};
    h += `<div class="acard"><h3>Privacy</h3>
      <label class="atog"><input type="checkbox" id="pv_act" ${pub.hideActivity ? "" : "checked"}>Show my recent chat activity on my profile</label>
      <label class="atog"><input type="checkbox" id="pv_links" ${pub.hideLinks ? "" : "checked"}>Show my links on my profile</label>
      <div class="aacts"><button class="btn sm" type="button" data-mpsave="privacy">Save privacy</button></div>
      <p class="hint">Your favorites, notes and notification settings are private to you. Admins can see your roles and role requests.</p></div>
      <div class="acard"><h3>My data</h3><div class="aacts"><button class="xbtn2" type="button" data-mpclear="favs">Clear my favorites</button>${myRevs.length ? confirmBtn("mprv", "Delete all my reviews", "data-mpclear=\"reviews\"") : ""}</div></div>`;
  }
  else if(T === "help"){
    const st = S.site || {};
    h += `<div class="acard"><h3>Help & rules</h3><div class="aacts"><button class="btn ghost sm" type="button" data-legal="rules">Community rules</button><button class="btn ghost sm" type="button" data-legal="terms">Terms</button><button class="btn ghost sm" type="button" data-legal="privacy">Privacy</button>${st.email ? `<a class="btn ghost sm" href="mailto:${esc(st.email)}">Contact support</a>` : ""}${/^https:\/\//.test(st.discord || "") ? `<a class="btn ghost sm" href="${esc(st.discord)}" target="_blank" rel="noopener noreferrer">Our Discord ↗</a>` : ""}</div>
      <p class="hint">${esc(st.disclaimer || DEF_DISC)}</p></div>
      <div class="acard"><h3>Quick guide</h3><div class="cguide">${[["Cortex","#4DA3FF","Live chat, streams and voice. Tag ▲/▼ on trade calls."],["Callers","var(--callers)","Verified callers A to Z with reviews and message boards."],["Bots","var(--bots)","Bots that read the market, their builders and reviews."],["Chart scripts","var(--scripts)","Indicators and signals, with reviews and boards."],["Favorites","#FFD166","Tap ☆ on any profile to save it here."],["Battle of the Bots","#FF8A3D","Bots compete round by round on live markets."]].map(([t, col, d]) => `<div style="--c:${col}"><b>${t}</b><small>${d}</small></div>`).join("")}</div></div>`;
  }
  const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest("#mpBody") && document.activeElement.id;
  if(keep && renderMe.lastTab === T) return;
  { const con = $("console"); if(con && $("mpBody").contains(con)) $("conPark").appendChild(con); }
  if(T === "walls") h = `<div class="acard"><h3>My callers, bots & charts <small>what you follow</small></h3><p class="hint">Everything you follow, live in one place. Star (☆) callers, bots and chart scripts anywhere on the site to add them here.</p></div>`;
  wallsPark(); renderMe.lastTab = T; $("mpBody").innerHTML = h; if(T === "walls") wallsMount();
  if(T === "console" && $("mpConSlot")){ $("mpConSlot").appendChild($("console")); renderConsole(); } if(T === "connect") renderConn($("mpConn")); fillNames($("mePage"));
}
function roleAction(k){
  if(!meId && !mpPreview()) return "";
  if(k === "caller") return `<button class="btn sm" type="button" data-mptab="connect">Apply in Connect</button>`;
  if(k === "reviewer") return `<button class="btn sm" type="button" data-rvapply>Apply</button>`;
  if(k === "streamer") return `<button class="btn sm" type="button" data-mpreq="streamer">Request streaming</button>`;
  if(k === "holder") return `<button class="btn ghost sm" type="button" data-cngo="wallet">My coins</button>`;
  if(k === "demon") return `<button class="btn sm" type="button" data-mpdemon>Link my Discord</button>`;
  if(k === "voter") return `<button class="btn ghost sm" type="button" data-cngo="governance">How voting works</button>`;
  if(k === "botdev") return `<button class="btn ghost sm" type="button" data-mptab="connect">Apply in Connect</button>`;
  if(k === "scripter") return `<button class="btn ghost sm" type="button" data-mptab="connect">Apply in Connect</button>`;
  return `<span class="pfine">Assigned by admins</span>`;
}
const revLookupName = k => { const it = /^[ebs]:/.test(k) ? ([...entityDir("bots"), ...entityDir("scripts")].find(x => x.key === k) || {}) : (callerDir().find(x => x.key === k) || {}); return it.name || "a profile"; };
const revStatsTxt = (k, n) => { const st = revStats(reviewsFor(k, n, revLookup(k).sample)); return st.n ? `★ ${st.avg.toFixed(1)} · ${st.n} review${st.n > 1 ? "s" : ""}` : "no reviews yet"; };
$("meBtn").addEventListener("click", () => openMe(!S.mePage));
$("me").addEventListener("click", () => openMe(true));
$("mpExitBtn").addEventListener("click", () => openMe(false));
function spPublicView(view){ S.pubView = true; openFull(meId || "You (demo)", view); }
$("mpViewBtn").addEventListener("click", () => spPublicView());
document.addEventListener("click", e => { if(e.target.closest("[data-pvedit]")){ closeProfile(); S.mpTab = "profile"; if(!S.mePage) openMe(true); else { renderMe.lastTab = null; renderMe(); } } });
$("mePage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if(d.mptab){ S.mpTab = d.mptab; renderMe.lastTab = null; renderMe(); return; }
  if("mpdemon" in d){ const dc = socOf(myPub()).discord; if(!dc){ toast("Add your Discord in My profile first, then come back."); S.mpTab = "profile"; renderMe.lastTab = null; renderMe(); setTimeout(() => $("mp_so_discord")?.focus(), 50); return; }
    if(mpPreview()){ S.myRoleReq = {...(S.myRoleReq || {}), demonOk:true}; toast("Discord linked: you're a Demon (preview only)"); renderMe.lastTab = null; renderMe(); return; }
    if(await act(() => mergeWrite(db.doc("rolereq/" + meId), {demon:{t:Date.now(), discord:dc, done:false}}))){ toast((S.listCfg || {}).autoDemon ? "Discord linked. Welcome, Demon." : "Discord link sent. An admin will confirm it."); S.myRoleReq = {...(S.myRoleReq || {}), demon:{t:Date.now(), discord:dc}}; renderMe.lastTab = null; renderMe(); } return; }
  if("mlsave" in d){ const row = readListing("ml", myPub().row || {}); await savePub({row}, "Listing saved"); renderMe.lastTab = null; renderMe(); return; }
  if(d.mpgo){ const g = d.mpgo; openMe(false);
    if(g === "cortex") openCortex(true); else if(g === "battle") openBattle(true); else if(SECTIONS[g]) openCallersPage(true, g);
    else if(g === "botconsole" || g === "scconsole"){ go({section:g === "botconsole" ? "bots" : "scripts", sub:null, view:"list", openId:null}); setTimeout(() => $(g === "botconsole" ? "botConsole" : "scConsole")?.scrollIntoView({block:"start"}), 60); }
    return; }
  if("mpview" in d){ spPublicView(); return; }
  if(d.mpunfav){ await toggleFav(d.mpunfav, d.favname); renderMe.lastTab = null; renderMe(); return; }
  if(d.mpreq){ const k = d.mpreq, data = k === "holder" ? {holder:{t:Date.now(), wallet:apV("mp_wallet"), amount:apV("mp_amt")}} : {streamer:{t:Date.now()}};
    if(k === "holder" && !data.holder.wallet) return toast("Add your wallet address first.");
    if(mpPreview()){ S.myRoleReq = {...(S.myRoleReq || {}), ...data}; toast("Request sent (preview only)"); renderMe.lastTab = null; renderMe(); return; }
    if(await act(() => mergeWrite(db.doc("rolereq/" + meId), data))){ S.myRoleReq = {...(S.myRoleReq || {}), ...data}; toast("Request sent. An admin will review it."); renderMe.lastTab = null; renderMe(); } return; }
  if(d.mpclear === "favs"){ S.favs = []; await savePrefs("Favorites cleared"); renderMe.lastTab = null; renderMe(); return; }
  if(d.mpclear === "reviews"){ S.apConfirm = null; for(const r of (S.reviews || []).filter(x => x.a === meId)) await act(() => db.doc("reviews/" + r.id).delete()); S.localReviews = {}; toast("Your reviews were deleted"); renderMe.lastTab = null; renderMe(); return; }
  if(d.apask === "mprv"){ S.apConfirm = "mprv"; renderMe.lastTab = null; renderMe(); return; }
  if("apcancel" in d){ S.apConfirm = null; renderMe.lastTab = null; renderMe(); return; }
  const sv = d.mpsave; if(!sv) return;
  if(sv === "profile"){ const so2 = readSocial("mp"); if(so2.err) return toast(so2.err); const {socials, hideSoc, promo} = so2;
    await savePub({banner:(document.querySelector('input[name="mp_banner"]:checked') || {}).value || "", loc:apV("mp_loc"), tagline:apV("mp_tag"), bio:$("mp_bio").value.trim().slice(0, 400), style:apV("mp_style"), tz:apV("mp_tz"), color:$("mp_color").value, markets:[...document.querySelectorAll("[data-mpmk]:checked")].map(i => i.dataset.mpmk), socials, hideSoc, promo, showWeb:!hideSoc.web, showDiscord:!hideSoc.discord}, "Profile saved"); }
  if(sv === "alerts"){ S.alerts = {dms:apCk("al_dms"), mentions:apCk("al_mentions"), favLive:apCk("al_favlive"), hideAnn:!apCk("al_ann"), social:apCk("al_social")}; if(S.voice !== apCk("al_voice")) $("voiceBtn").click(); await savePrefs("Notifications saved"); applySiteConfig(); }
  if(sv === "privacy") await savePub({hideActivity:!apCk("pv_act"), hideLinks:!apCk("pv_links")}, "Privacy saved");
  renderMe.lastTab = null; renderMe();
});
// live alerts: mentions + favorites going live
let alertSince = Date.now(), wasLive = new Set();
setInterval(() => {
  const a = S.alerts || {};
  if(a.mentions !== false){ const fresh = loungeMsgs().filter(m => m.t > alertSince && (!m.a || m.a !== meId) && mentionsMe(m.b || "")); fresh.slice(-1).forEach(m => toast(`${m.name || (m.as && m.as.n) || "Someone"} mentioned you in #${(DCH[m.tab || "main"] || DCH.main)[0]}`)); }
  alertSince = Date.now();
  if(a.favLive !== false){ const L = [...callerDir(), ...entityDir("bots"), ...entityDir("scripts")].filter(x => x.live && isFav(x.key, x.name)); const now = new Set(L.map(x => x.key)); L.forEach(x => { if(!wasLive.has(x.key) && wasLive.size + now.size && alertSince - (S.bootAt || 0) > 8000) toast(`★ ${x.name} just went live`); }); wasLive = now; }
}, 5000);
S.bootAt = Date.now();

// ---------- admin control center ----------
const AP_TABS = [["overview","Overview"],["connect","Connect requests"],["listings","Listings"],["members","Members"],["site","Site & brand"],["announce","Announcements"],["callers","Callers"],["streaming","Streaming"],["voice","Voice rooms"],["cxall","Cortex controls"],["dchat","Discord chats"],["moderation","Moderation"],["social","Posts & business"],["reviews","Reviews & reviewers"],["boards","Message boards"],["dms","Messages"],["forum","Forum"],["registry","Bots & scripts"],["battle","Battle of the Bots"],["legal","Legal pages"],["launch","Launch checklist"]];
const LAUNCH = [
  ["Foundation", [["domain","Custom domain","Buy d3mon.co (or similar) and point it at your host."],["hosting","Own hosting","Vercel, Netlify or Cloudflare Pages to serve the site outside claude.ai."],["dbauth","Database + sign-in","Supabase or Firebase for accounts, data and access rules."],["oauth","Discord login","Let members sign in with Discord so names and roles match."],["backups","Backups","Automatic daily database backups and an export you've tested."]]],
  ["Community", [["cxready","Cortex chat ready","The Cortex is the site's own chat: pin a welcome message in #main-floor and add voice room links."],["bridge","Discord ↔ message boards bridge (optional)","Only needed if a caller, bot or script board is set to Both, mirrored."],["mods","Moderator team","At least 2 trusted mods with clear roles."],["rulespub","Community rules published","Fill in Legal pages → Community rules."],["verifyproc","Caller verification process","Decide what a caller must show before you verify them."]]],
  ["Markets & data", [["feed","Live market data","Kalshi / Polymarket prices and round targets feeding the site."],["results","Automatic round results","Settled outcomes filled in without manual clicks."],["streams","Streaming accounts","Twitch / YouTube / Kick channels for callers, bots and scripts."],["botrules","Bot & script guidelines","What creators must disclose about their bots and scripts."]]],
  ["Legal & trust", [["terms","Terms of Service","Fill in Legal pages → Terms."],["privacy","Privacy Policy","Fill in Legal pages → Privacy."],["disclaimer","Risk disclaimer","Shown in the footer on every page."],["age","18+ age confirmation","Prediction markets are adults-only."],["juris","Where members can trade","Check where users are allowed to use Kalshi and Polymarket; talk to a lawyer before charging money."],["takedown","Takedown / contact route","An email for reports, copyright and support."]]],
  ["Growth & operations", [["analytics","Analytics","Privacy-friendly visitor stats (Plausible, Umami, or similar)."],["email","Email list & alerts","Round and stream alerts by email or push."],["seo","Search & social cards","Title, description and preview image for shared links."],["uptime","Uptime monitoring","Get pinged if the site or the bridge goes down."],["pay","Memberships (optional)","Stripe or Whop if you add paid tiers."],["brandkit","Brand kit","Logo files, colors and fonts saved in one place."]]]
];
function openAdmin(on){
  if(on && S.dmPage) openDM(false);
  if(on && S.coinPage) openCoin(false);
  if(on && S.mePage) openMe(false);
  if(on && !isAdmin && db){ toast("Admin tools are only for site editors."); return; }
  S.adminPage = on;
  if(on){ S.menu = null; renderSections();
    if(S.cc){ S.cc = false; renderCC(); }
    if(S.cortex){ S.cortex = false; if(typeof resetCorex === "function") resetCorex(); renderCortex(); }
    if(S.battlePage){ S.battlePage = false; renderBattlePage(); }
    if(S.vortexPage){ S.vortexPage = false; renderVortexPage(); }
    if(S.callersPage) openCallersPage(false); }
  document.body.classList.toggle("adminmode", on);
  $("adminPage").hidden = !on; $("adminBtn").setAttribute("aria-pressed", on);
  try { history.replaceState(null, "", "#" + (on ? "admin" : S.section)); } catch {}
  if(on){ renderAdmin(); const p = $("adminPage"); p.classList.remove("enter"); void p.offsetWidth; p.classList.add("enter"); setTimeout(() => p.classList.remove("enter"), 900); }
  window.scrollTo({top:0});
}
const apPreview = () => !db;
async function apSave(path, patch, msg){
  if(apPreview()){ toast("Preview only: open the published page to save."); return false; }
  const ok = await act(() => mergeWrite(db.doc(path), patch)); if(ok) toast(msg || "Saved"); return ok;
}
const apV = id => ($(id) ? $(id).value.trim() : "");
const apCk = id => !!($(id) && $(id).checked);
const urlOk = u => !u || /^https:\/\/[^\s]+\.[^\s]+/.test(u);
function apCounts(){
  const bots = Object.values(S.botDocs || {}).reduce((n, d) => n + Object.keys(d.list || {}).length, 0);
  const scs = Object.values(S.scDocs || {}).reduce((n, d) => n + Object.keys(d.list || {}).length, 0);
  const day = Date.now() - 86400000, msgs = S.demo ? (S.demoMsgs || []).length : loungeMsgs().filter(m => m.t > day).length;
  const muted = Object.keys(S.mod.muted || {}).filter(isMuted).length;
  const vl = S.voiceLinks || {}, missingVoice = Object.keys(SECTIONS).filter(k => !vl[k]).length;
  const done = Object.values((S.launch || {}).done || {}).filter(Boolean).length, total = LAUNCH.reduce((n, [, a]) => n + a.length, 0);
  return {online:onlinePeople().length, verified:Object.keys(S.verified).length, req:(S.requests || []).length, streamers:Object.keys(S.streamers || {}).length,
    live:(S.streams || []).filter(x => x.status === "live").length, subs:(S.subs || []).length, threads:(S.threads || []).length, bots, scs, msgs, muted, missingVoice, done, total};
}
function apUserSearch(key, label, attr){
  return `<div class="af"><label for="aps_${key}">${label}</label><input type="search" id="aps_${key}" data-apsearch="${key}" placeholder="Search people by name" autocomplete="off"><div class="ahits" id="aph_${key}">${(S.apHits[key] || []).map(h => `<div class="arow"><img class="av sm" alt="" src="${esc(h.avatarUrl || "")}"><div class="t">${esc(h.name || "Member")}</div><div class="aacts"><button class="btn sm" type="button" ${attr}="${esc(h.id)}">${label.split(" ")[0]}</button></div></div>`).join("")}</div></div>`;
}
const confirmBtn = (key, label, attrs) => S.apConfirm === key ? `<button class="btn danger sm" type="button" ${attrs}>Confirm ${label.toLowerCase()}</button><button class="xbtn" type="button" data-apcancel>Keep</button>` : `<button class="xbtn2" type="button" data-apask="${esc(key)}">${label}</button>`;
function renderAdmin(){
  if(!S.adminPage) return;
  if(S.apTab === "cxgate" || S.apTab === "cortex") S.apTab = "cxall";
  const c = apCounts();
  $("apWho").textContent = apPreview() ? "PREVIEW · open the published page to save changes" : isOwner ? "Signed in as owner" : "Signed in as editor";
  const badge = {dchat:dcReqList().filter(r => !((S.dchatCfg || {}).ok || {})[dcPair(r)] && r.status !== "declined").length, overview:0, connect:connQueue().length + pendingListings().length, callers:c.req, voice:c.missingVoice, launch:c.total - c.done};
  $("apNav").innerHTML = AP_TABS.map(([k, l]) => `<button type="button" data-aptab="${k}" aria-current="${S.apTab === k}">${esc(l)}${badge[k] ? `<span class="n${k === "launch" || k === "voice" ? " ok" : ""}">${badge[k]}</span>` : ""}</button>`).join("");
  const st = S.site || {}, a = S.ann || {}, md = S.mod || {}, cx = S.cxCfg || {}, lg = S.legal || {};
  let h = "";
  const T = S.apTab;


  if(T === "listings"){
    const lc = lcfg(), all = [...callerDir(), ...entityDir("bots"), ...entityDir("scripts")].map(c => ({c, R:rowOf(c)})), withUps = all.filter(x => x.R.ups.length || (lc.locked || {})[x.c.key]);
    h += `<div class="acard"><h3>What members can show on their row <small>reviews always show</small></h3><p class="hint">Turn a field off here and it disappears from every row, and members can't switch it back on.</p>
      <div class="chips">${LFIELDS.map(([f, l]) => `<label><input type="checkbox" data-lfon="${f}" ${(lc.off || {})[f] ? "" : "checked"}>${esc(l)}</label>`).join("")}</div>
      <h4 style="margin:10px 0 0;font:700 11px var(--mono);letter-spacing:.14em;color:var(--ink-3)">PLATFORMS MEMBERS CAN LINK</h4>
      <div class="chips">${SOCIALS.map(([k, l]) => `<label><input type="checkbox" data-lson="${k}" ${(lc.offSoc || {})[k] ? "" : "checked"}>${esc(l)}</label>`).join("")}</div>
      <div class="aform" style="margin-top:6px"><div class="af"><label for="lc_max">Status updates per member</label><select id="lc_max">${[0,1,2,3,4,5].map(n => `<option ${lMax() === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="af"><label for="lc_len">Max characters per update</label><input id="lc_len" type="number" min="20" max="200" value="${lLen()}"></div>
      <div class="af"><label for="lc_days">Hide updates older than</label><select id="lc_days">${[[0,"Never"],[1,"1 day"],[3,"3 days"],[7,"1 week"],[30,"30 days"]].map(([n, l]) => `<option value="${n}" ${+(lc.days || 0) === n ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="listing">Save listing rules</button></div></div>
      <div class="acard"><h3>Status updates on the lists <small>${withUps.length} listings</small></h3><div class="alist">${withUps.length ? withUps.map(({c, R}) => { const locked = !!(lc.locked || {})[c.key]; return `<div class="arow"><span class="adot" style="--c:${esc(c.color || "#4DA3FF")}"></span><div class="t"><button class="plink" type="button" data-prof="${esc(c.key)}"><b>${esc(c.name || "Member")}</b></button> ${c.badge || `<span class="rb cal">CALLER</span>`}${locked ? ` <span class="pst" style="--c:#FF4D6A">UPDATES BLOCKED</span>` : ""}<small>${R.ups.map(u => esc(u.b)).join(" · ") || "—"}</small></div><div class="aacts">${R.ups.length && !c.ent && !/^p:/.test(c.key) || /^[bs]:/.test(c.key) ? `<button class="xbtn2" type="button" data-lclear="${esc(c.key)}">Clear updates</button>` : /^[pe]:/.test(c.key) && R.ups.length ? `<button class="xbtn2" type="button" data-lclear="${esc(c.key)}">Clear updates</button>` : ""}<button class="xbtn2" type="button" data-llock="${esc(c.key)}">${locked ? "Allow updates" : "Block updates"}</button></div></div>`; }).join("") : `<div class="aempty">No one has posted a status update yet.</div>`}</div></div>`;
  }
  if(T === "connect"){
    h += `<div class="acard"><h3>Demon role <small>members who linked their Discord</small></h3><label class="atog"><input type="checkbox" id="dm_auto" ${(lcfg().autoDemon) ? "checked" : ""}>Give the Demon role automatically when a member adds their Discord (no review)</label><p class="hint">Off: Discord links wait here for you to confirm. Either way you can add or remove Demon on anyone in Members → Categories. A real Discord sign-in check needs the Discord bridge (Path 2).</p><div class="aacts"><button class="btn sm" type="button" data-apsave="demonauto">Save</button></div></div>`;
    const PL = pendingListings();
    h += `<div class="acard"><h3>Waiting to be listed <small>${PL.length} bots & scripts</small></h3><p class="hint">Bots and scripts that members register in their consoles stay off the Bots and Chart Scripts pages until you approve them. Callers are listed only after you verify them.</p><div class="alist">${PL.length ? PL.map(x => `<div class="arow"><span class="adot" style="--c:${x.sec === "bots" ? "var(--bots)" : "var(--scripts)"}"></span><div class="t"><b>${esc(x.name || "Untitled")}</b> ${x.badge}<small>by <span>${who(x.key.split(":")[1])}</span>${x.ent.market ? " · " + esc(x.ent.market) : ""}</small></div><div class="aacts"><button class="btn sm" type="button" data-lsok="${esc(x.key)}">Approve listing</button><button class="btn ghost sm" type="button" data-lsno="${esc(x.key)}">Decline</button></div></div>`).join("") : `<div class="aempty">Nothing waiting.</div>`}</div></div>`;
    const Q = connQueue(), lab = {demon:["Demon (Discord link)","#FF4D6A"], callers:["Callers","var(--callers)"], bots:["Bots","var(--bots)"], scripts:["Chart Scripts","var(--scripts)"]};
    h += `<div class="acard"><h3>Connect requests <small>${Q.length} waiting</small></h3><p class="hint">Members apply from the Connect button at the top of the site. Approving connects them to that section's main page: callers become verified; bots and scripts get listed with the member as builder.</p>
      <div class="alist">${Q.length ? Q.map(q => `<div class="arow">${avatar(q.id,"sm")}<div class="t"><button class="plink" type="button" data-prof="${esc(q.id)}">${who(q.id)}</button> → <b style="color:${lab[q.k][1]}">${lab[q.k][0]}</b>${q.app && q.app.nm ? ` · <b>${esc(q.app.nm)}</b>` : ""}<small>${esc(ago(q.t))}${q.app ? [q.app.mk, q.app.ex].filter(Boolean).map(x => " · " + esc(x)).join("") : q.note ? " · " + esc(q.note) : ""}${q.app && q.app.ln ? ` · <a href="${esc(q.app.ln)}" target="_blank" rel="noopener noreferrer">link ↗</a>` : ""}</small></div><div class="aacts"><button class="btn sm" type="button" data-cqok="${q.k}|${esc(q.id)}">Approve</button><button class="btn ghost sm" type="button" data-cqno="${q.k}|${esc(q.id)}">Decline</button></div></div>`).join("") : `<div class="aempty">No one is waiting. Applications show up here.</div>`}</div></div>
      <div class="acard"><h3>Connected</h3><div class="astats">${[["Callers", Object.keys(S.verified || {}).length, "var(--callers)"],["Bots", entityDir("bots").length, "var(--bots)"],["Chart scripts", entityDir("scripts").length, "var(--scripts)"]].map(([l, n, c]) => `<div class="astat" style="--c:${c}"><b>${n}</b><span>${l}</span></div>`).join("")}</div></div>`;
  }
  if(T === "social") h += spAdminHtml();
  if(T === "members") h += renderMembersTab() + catGuideCard();
  if(T === "members"){
    const ga = lcfg().guest || {};
    const gaCard = `<div class="acard"><h3>Guest role <small>people invited from outside your organization</small></h3><p class="hint">Guests get the Guest account type automatically. Choose what they're allowed to do.</p>
      <label class="atog"><input type="checkbox" id="ga_chat" ${ga.chat === false ? "" : "checked"}>Guests can post in Cortex chat</label>
      <label class="atog"><input type="checkbox" id="ga_board" ${ga.board === false ? "" : "checked"}>Guests can post on message boards</label>
      <label class="atog"><input type="checkbox" id="ga_dm" ${ga.dm === false ? "" : "checked"}>Guests can send direct messages</label>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="guestacc">Save guest access</button></div></div>`;
    const RQ = (S.roleReqs || []).filter(r => (r.streamer && !r.streamer.done) || (r.holder && !r.holder.done));
    h = `<div class="acard"><h3>Role requests <small>${RQ.length} waiting</small></h3><div class="alist">${RQ.length ? RQ.map(r => [r.streamer && !r.streamer.done ? `<div class="arow">${avatar(r.id,"sm")}<div class="t">${who(r.id)} wants to <b>stream</b><small>asked ${esc(ago(r.streamer.t))}</small></div><div class="aacts"><button class="btn sm" type="button" data-rqok="streamer|${esc(r.id)}">Approve</button><button class="btn ghost sm" type="button" data-rqno="streamer|${esc(r.id)}">Decline</button></div></div>` : "",
      false ? `<div class="arow">${avatar(r.id,"sm")}<div class="t">${who(r.id)} says they're a <b>coin holder</b><small>${esc(r.holder.amount || "amount not given")} · wallet ${esc(r.holder.wallet || "")}</small></div><div class="aacts"><button class="btn sm" type="button" data-rqok="holder|${esc(r.id)}">Approve</button><button class="btn ghost sm" type="button" data-rqno="holder|${esc(r.id)}">Decline</button></div></div>` : ""].join("")).join("") : `<div class="aempty">No requests. Members ask for streaming status from My D3MON → Roles & access.</div>`}</div></div>` + gaCard + h;
  }

  if(T === "dms"){ const dc = S.dmCfg || {}, ib = Object.entries(S.dmInbox || {}).sort((a, b) => b[1].t - a[1].t);
    h += `<div class="acard"><h3>Direct messages</h3><label class="atog"><input type="checkbox" id="dm_on" ${dc.off ? "" : "checked"}>Members can message each other</label><label class="atog"><input type="checkbox" id="dm_ver" ${dc.verifiedOnly ? "checked" : ""}>Only verified callers can start new messages</label><div class="aacts"><button class="btn sm" type="button" data-apsave="dmcfg">Save</button></div>
      <p class="hint">Messages between members are end-to-end encrypted in the browser. Admins can't read them, and neither can anyone with database access. Members can block each other; slow mode and mutes from Moderation also apply.</p></div>
      <div class="acard"><h3>Message everyone <small>shows in every member's inbox as ${esc((S.site || {}).name || "D3MON.CO")}</small></h3><div class="aform"><div class="af w"><label for="ib_title">Title</label><input id="ib_title" maxlength="80" placeholder="Season 2 starts Friday"></div><div class="af w"><label for="ib_body">Message</label><textarea id="ib_body" maxlength="1000"></textarea></div></div><div class="aacts"><button class="btn sm" type="button" data-apsave="inbox">Send to everyone</button></div></div>
      <div class="acard"><h3>Sent to everyone <small>${ib.length}</small></h3><div class="alist">${ib.length ? ib.map(([id, x]) => `<div class="arow"><span class="adot" style="--c:#FFB547"></span><div class="t"><b>${esc(x.title || "Announcement")}</b><small>${esc(new Date(x.t).toLocaleString())} · ${esc(x.b || "")}</small></div><div class="aacts">${confirmBtn("ib:" + id, "Delete", `data-ibdel="${esc(id)}"`)}</div></div>`).join("") : `<div class="aempty">Nothing sent yet.</div>`}</div></div>`; }
  if(T === "coin"){ const stc = coinStats(), cfg = coinCfg(); h += `<div class="acard"><h3>Coin & governance</h3>${cfg ? `<div class="astats">${[["Supply", stc.supply],["Treasury", stc.treas],["Holders", stc.holders.length],["Open votes", Object.keys(govProps()).filter(pid => govTally(pid).status === "active").length]].map(([l, n]) => `<div class="astat"><b>${fmtN(n)}</b><span>${l}</span></div>`).join("")}</div>` : `<p class="hint">The coin isn't set up yet.</p>`}<div class="aacts"><button class="btn sm" type="button" data-cngo="manage">${cfg ? "Manage the ledger" : "Set up the coin"}</button><button class="btn ghost sm" type="button" data-cngo="ledger">Full ledger</button><button class="btn ghost sm" type="button" data-cngo="governance">Votes & proposals</button></div></div>`; }
  if(T === "reviews"){
    const revs = [...(S.reviews || [])].sort((a, b) => b.at - a.at), rv = Object.entries((S.memReg || {}).cats || {}).filter(([, c]) => c && c.reviewer).map(([id]) => id);
    const tName = k => { if(/^p:/.test(k)) return (getProfiles()[k.slice(2)] || {}).name || k; if(/^e:/.test(k)) return (getEnts()[k.slice(2)] || {}).name || k; const x = [...entityDir("bots"), ...entityDir("scripts")].find(z => z.key === k); return x ? x.name : null; };
    h += `<div class="acard"><h3>Who can write reviews</h3><div class="bmopts">${[["reviewers","Approved reviewers only (recommended)"],["anyone","Any signed-in member"]].map(([k, l]) => `<label><input type="radio" name="rvwho" value="${k}" ${(S.rvCfg.who || "reviewers") === k ? "checked" : ""}>${l}</label>`).join("")}</div><div class="aacts"><button class="btn sm" type="button" data-apsave="rvwho">Save</button></div>
      <p class="hint">Reviews show a star rating (1–5) and a short write-up on every caller, bot and script profile. With "approved reviewers only", reviews from anyone else are hidden.</p></div>
      <div class="acard"><h3>Reviewer applications <small>${(S.rvReqs || []).length} waiting</small></h3><div class="alist">${(S.rvReqs || []).length ? S.rvReqs.map(r => `<div class="arow">${avatar(r.id,"sm")}<div class="t">${who(r.id)}<small>applied ${esc(ago(r.t))}</small></div><div class="aacts"><button class="btn sm" type="button" data-rvok="${esc(r.id)}">Approve</button><button class="btn ghost sm" type="button" data-rvno="${esc(r.id)}">Decline</button></div></div>`).join("") : `<div class="aempty">No applications. Members apply from the Reviews section of any profile.</div>`}</div></div>
      <div class="acard"><h3>Make someone a reviewer</h3>${apUserSearch("rv", "Approve reviewer", "data-rvok")}</div>
      <div class="acard"><h3>Approved reviewers <small>${rv.length}</small></h3><div class="alist">${rv.length ? rv.map(id => `<div class="arow">${avatar(id,"sm")}<div class="t">${who(id)}<small>${revs.filter(r => r.a === id).length} reviews written</small></div><div class="aacts">${confirmBtn("rvx:" + id, "Remove reviewer", `data-rvoff="${esc(id)}"`)}</div></div>`).join("") : `<div class="aempty">No reviewers yet.</div>`}</div></div>
      <div class="acard"><h3>Recent reviews <small>${revs.length}</small></h3><div class="alist">${revs.length ? revs.slice(0, 50).map(r => `<div class="arow">${avatar(r.a,"sm")}<div class="t">${who(r.a)} → <b>${esc(tName(r.t) || "a member")}</b> ${starsHtml(r.r)}<small>${esc(new Date(r.at).toLocaleString())}${r.b ? " · " + esc(r.b) : ""}</small></div><div class="aacts"><button class="xbtn2" type="button" data-rvdel="${esc(r.id)}">Delete</button></div></div>`).join("") : `<div class="aempty">No reviews yet.</div>`}</div></div>`;
  }
  if(T === "boards"){
    const areas = [["callers","Callers","var(--callers)","Every caller's message board"],["bots","Bots","var(--bots)","Every bot's message board"],["scripts","Chart scripts","var(--scripts)","Every script's message board"]];
    const b = S.bCfg || {};
    h += `<div class="acard"><h3>Message board type</h3><p class="hint">Pick where each area's message boards live. Every caller, bot and script profile has a Message board button. The Cortex is the site's own chat and always stays on D3MON.CO.</p>
      ${areas.map(([k, l, c, sub]) => `<div class="bmrow" style="--c:${c}"><div class="lab">${esc(l)}<small>${esc(sub)}</small></div><div style="display:grid;gap:8px"><div class="bmopts">${BMODES.map(([m, ml]) => `<label title="${esc(BMODES.find(x => x[0] === m)[2])}"><input type="radio" name="bm_${k}" value="${m}" ${((b[k] || {}).mode || "local") === m ? "checked" : ""}>${esc(ml)}</label>`).join("")}</div>
        <div class="af"><input id="bd_${k}" type="url" value="${esc((b[k] || {}).discord || "")}" placeholder="Discord channel or forum link: https://discord.com/channels/…"></div></div></div>`).join("")}
      <div class="aacts"><button class="btn sm" type="button" data-apsave="boards">Save message board settings</button></div>
      <p class="hint">${BMODES.map(([, l, d]) => `<b>${esc(l)}:</b> ${esc(d)}`).join("<br>")}</p></div>
      <div class="acard"><h3>Discord bridge <small>needed for "Both, mirrored"</small></h3><div class="bstat"><i class="${bridgeOn() ? "on" : ""}"></i><div><b>${bridgeOn() ? "Connected" : "Not connected"}</b><div class="pfine">${bridgeOn() ? `Last heartbeat ${esc(ago(S.bridge.seen))}.` : "Mirroring needs a small always-on Discord bot (Path 2). Until it's running, site posts are saved and marked \"queued for Discord\"."}</div></div></div>
        <p class="hint">What the bridge does: watches <code>boards/*</code> for posts with <code>sync: "pending"</code>, posts them to the matching Discord channel or forum thread, then writes Discord replies back with <code>src: "discord"</code> and the author's Discord name. It writes a heartbeat to <code>config/bridge.seen</code> so this light turns green. The Cortex chat and its streams are not bridged: they live only on the website.</p></div>`;
    const recent = Object.entries(S.boards || {}).flatMap(([k, d]) => Object.entries((d && d.msgs) || {}).filter(([, m]) => m && m.b).map(([id, m]) => ({k, id, ...m}))).sort((a, b2) => b2.t - a.t).slice(0, 30);
    h += `<div class="acard"><h3>Recent board posts <small>boards opened this visit</small></h3><div class="alist">${recent.length ? recent.map(p => `<div class="arow">${p.a ? avatar(p.a,"sm") : `<span class="adot"></span>`}<div class="t">${p.a ? who(p.a) : esc(p.dAuthor || "Discord")} <small>${esc(p.k)} · ${esc(ago(p.t))} · ${esc(p.b)}</small></div><div class="aacts"><button class="xbtn2" type="button" data-bdel="${esc(p.k)}|${esc(p.id)}">Delete</button></div></div>`).join("") : `<div class="aempty">Open a profile's message board to load its posts here.</div>`}</div></div>`;
  }

  if(T === "overview"){
    const need = [];
    const cq = connQueue().length; if(cq) need.push(["hi", `${cq} Connect request${cq > 1 ? "s" : ""} waiting`, "connect"]);
    if(c.missingVoice) need.push(["md", `${c.missingVoice} voice room${c.missingVoice > 1 ? "s" : ""} without a link`, "voice"]);
    if(!(lg.terms && lg.privacy)) need.push(["md", "Terms and Privacy pages aren't written yet", "legal"]);
    if(!st.discord) need.push(["md", "No Discord invite link set", "site"]);
    if(st.maint) need.push(["hi", "Maintenance mode is ON: visitors can't use the site", "site"]);
    if(!(a.on && a.text)) need.push(["ok", "No announcement running", "announce"]);
    need.push(["ok", `Launch checklist: ${c.done} of ${c.total} done`, "launch"]);
    h += `<div class="acard"><h3>Right now <small>updates live</small></h3><div class="astats">
      ${[["Members", memberList().length, "#4DA3FF"],["Online", c.online, "var(--up)"],["Verified callers", c.verified, "var(--callers)"],["Pending requests", c.req, c.req ? "#FF4D6A" : ""],["Live streams", c.live, "var(--live)"],["Streamers allowed", c.streamers, ""],["Chat msgs · 24h", c.msgs, "#4DA3FF"],["Bots", c.bots, "var(--bots)"],["Scripts", c.scs, "var(--scripts)"],["Subcategories", c.subs, ""],["Discussions", c.threads, ""],["Muted", c.muted, c.muted ? "#FFB547" : ""]].map(([l, n, col]) => `<div class="astat" ${col ? `style="--c:${col}"` : ""}><b>${n}</b><span>${l}</span></div>`).join("")}</div></div>
      <div class="acard"><h3>Needs attention</h3><div class="aneed">${need.map(([k, t, tab]) => `<button type="button" data-aptab="${tab}"><span class="k ${k}">${k === "hi" ? "ACTION" : k === "md" ? "TODO" : "OK"}</span>${esc(t)}</button>`).join("")}</div></div>
      <div class="acard"><h3>Quick actions</h3><div class="aacts"><button class="btn sm" type="button" data-aptab="announce">Post an announcement</button><button class="btn ghost sm" type="button" data-aptab="callers">Review callers</button><button class="btn ghost sm" type="button" data-apgo="cortex">Open the Cortex</button><button class="btn ghost sm" type="button" data-apgo="battle">Open Battle controls</button><button class="btn ghost sm" type="button" data-apgo="callerlist">Open Callers page</button></div></div>`;
  }
  if(T === "site"){
    h += `<div class="acard"><h3>Brand & basics</h3><div class="aform">
      <div class="af"><label for="as_name">Site name</label><input id="as_name" value="${esc(st.name || "D3MON.CO")}" maxlength="40"></div>
      <div class="af"><label for="as_tag">Header tagline</label><input id="as_tag" value="${esc(st.tagline || "live trade network")}" maxlength="60"><small>Shows next to the logo.</small></div>
      <div class="af"><label for="as_email">Contact email</label><input id="as_email" type="email" value="${esc(st.email || "")}" placeholder="support@d3mon.co"></div>
      <div class="af"><label for="as_asset">Default market</label><select id="as_asset">${["BTC","ETH","SOL","XRP"].map(x => `<option ${ (st.asset || "BTC") === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="af"><label for="as_tf">Default timeframe</label><select id="as_tf">${[["15m","15 minute"],["1h","Hourly"]].map(([x, l]) => `<option value="${x}" ${(st.tf || "15m") === x ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="af w"><label for="as_disc">Footer disclaimer</label><textarea id="as_disc">${esc(st.disclaimer || DEF_DISC)}</textarea></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="site">Save brand & basics</button></div></div>
    <div class="acard"><h3>Links</h3><p class="hint">Full https:// links. They appear in the footer and the Cortex.</p><div class="aform">
      ${[["discord","Discord invite","https://discord.gg/…"],["x","X / Twitter","https://x.com/…"],["youtube","YouTube","https://youtube.com/@…"],["twitch","Twitch","https://twitch.tv/…"],["kick","Kick","https://kick.com/…"]].map(([k, l, ph]) => `<div class="af"><label for="as_${k}">${l}</label><input id="as_${k}" type="url" value="${esc(st[k] || "")}" placeholder="${ph}"></div>`).join("")}</div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="links">Save links</button></div></div>
    <div class="acard"><h3>Switches</h3>
      <label class="atog"><input type="checkbox" id="as_samples" ${st.samples === false ? "" : "checked"}>Show the 10 sample callers on the Callers page</label>
      <label class="atog"><input type="checkbox" id="as_demo" ${st.demoBtn === false ? "" : "checked"}>Show the "Play demo" button to visitors</label>
      <label class="atog"><input type="checkbox" id="as_maint" ${st.maint ? "checked" : ""}>Maintenance mode (visitors see a "Back soon" screen; admins still get in)</label>
      <div class="af"><label for="as_maintmsg">Maintenance message</label><input id="as_maintmsg" value="${esc(st.maintMsg || "")}" placeholder="D3MON.CO is getting an upgrade. Check back in a little while."></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="switches">Save switches</button></div></div>`;
  }
  if(T === "announce"){
    h += `<div class="acard"><h3>Site-wide announcement <small>${a.on && a.text ? "LIVE" : "off"}</small></h3><p class="hint">A bar under the header on every page. Visitors can dismiss it; posting a new one shows it again.</p><div class="aform">
      <div class="af w"><label for="aa_text">Message</label><input id="aa_text" value="${esc(a.text || "")}" maxlength="200" placeholder="Battle of the Bots starts Friday 8 PM ET"></div>
      <div class="af"><label for="aa_level">Style</label><select id="aa_level">${[["info","News (blue)"],["alert","Alert (red)"],["success","Update (green)"],["promo","Event (purple)"]].map(([k, l]) => `<option value="${k}" ${(a.level || "info") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="af"><label for="aa_hours">Auto-hide after</label><select id="aa_hours">${[[0,"Never"],[1,"1 hour"],[6,"6 hours"],[24,"1 day"],[72,"3 days"],[168,"1 week"]].map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
      <div class="af"><label for="aa_link">Link (optional)</label><input id="aa_link" type="url" value="${esc(a.link || "")}" placeholder="https://"></div>
      <div class="af"><label for="aa_lt">Link text</label><input id="aa_lt" value="${esc(a.linkText || "")}" placeholder="Learn more"></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="announce">Post announcement</button>${a.on ? `<button class="btn ghost sm" type="button" data-apsave="annoff">Take it down</button>` : ""}</div>
      ${a.on && a.until ? `<p class="hint">Hides automatically ${esc(new Date(a.until).toLocaleString())}.</p>` : ""}</div>`;
  }
  if(T === "callers"){
    const ids = Object.keys(S.verified);
    h += `<div class="acard"><h3>Verification requests <small>${c.req} waiting</small></h3><div class="alist">${(S.requests || []).length ? S.requests.map(r => `<div class="arow">${avatar(r.id,"sm")}<div class="t">${who(r.id)}<small>asked ${esc(ago(r.t))}${r.note ? " · " + esc(r.note) : ""}</small></div><div class="aacts"><button class="btn sm" type="button" data-verify="${esc(r.id)}">Approve</button><button class="btn ghost sm" type="button" data-decline="${esc(r.id)}">Decline</button></div></div>`).join("") : `<div class="aempty">No pending requests.</div>`}</div></div>
      <div class="acard"><h3>Verify someone directly</h3>${apUserSearch("verify", "Verify", "data-verify")}</div>
      <div class="acard"><h3>Verified callers <small>${ids.length}</small></h3><div class="alist">${ids.length ? ids.map(id => `<div class="arow">${avatar(id,"sm")}<div class="t">${who(id)}<small>since ${esc(new Date(S.verified[id].t).toLocaleDateString())} · record ${esc(callerStats(id))}</small></div><div class="aacts">${confirmBtn("rev:" + id, "Revoke", `data-revoke-yes="${esc(id)}"`)}</div></div>`).join("") : `<div class="aempty">Nobody is verified yet.</div>`}</div></div>
      <div class="acard"><h3>Sample callers</h3><p class="hint">The 10 mock callers (Ava Strike, BlockBaron, …) are ${st.samples === false ? "hidden" : "showing"} on the Callers page.</p><div class="aacts"><button class="btn ghost sm" type="button" data-apsample="${st.samples === false ? "on" : "off"}">${st.samples === false ? "Show sample callers" : "Hide sample callers"}</button></div></div>`;
  }
  if(T === "streaming"){
    const sids = Object.keys(S.streamers || {}), live = (S.streams || []).filter(x => x.status === "live");
    h += `<div class="acard"><h3>Live now <small>${live.length}</small></h3><div class="alist">${live.length ? live.map(x => `<div class="arow"><span class="adot" style="--c:var(--live)"></span><div class="t">${esc(x.title || "Untitled")}<small>${esc(x.section === "cortex" ? "Cortex" : SECTIONS[x.section]?.name || x.section || "")} · ${x.hostId ? "" : "no host"}<span>${x.hostId ? who(x.hostId) : ""}</span></small></div><div class="aacts">${/^https:\/\//.test(x.url || "") ? `<a class="xbtn2" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Watch ↗</a>` : ""}<button class="xbtn2" type="button" data-end="${esc(x.id)}">End stream</button></div></div>`).join("") : `<div class="aempty">Nobody is live.</div>`}</div></div>
      <div class="acard"><h3>Allowed to stream in the Cortex <small>${sids.length} + all verified callers</small></h3>${apUserSearch("stream", "Allow streaming", "data-allowstream")}
      <div class="alist">${sids.length ? sids.map(id => `<div class="arow">${avatar(id,"sm")}<div class="t">${who(id)}<small>allowed ${S.streamers[id].t ? esc(new Date(S.streamers[id].t).toLocaleDateString()) : ""}</small></div><div class="aacts"><button class="xbtn2" type="button" data-unstream="${esc(id)}">Revoke</button></div></div>`).join("") : `<div class="aempty">No extra streamers yet. Verified callers can always stream.</div>`}</div></div>`;
  }
  if(T === "voice"){
    const vl = S.voiceLinks || {};
    h += `<div class="acard"><h3>Voice room links</h3><p class="hint">Google Meet, X Spaces or any https:// voice room. These show in the Cortex voice list and the Community dock.</p><div class="aform">
      <div class="af w"><label>Cortex voice</label><small class="hint">Built into the site · any signed-in member can join from the Cortex sidebar · no link needed</small></div>
      ${Object.entries(SECTIONS).map(([k, x]) => [k, x.name]).map(([k, n]) => `<div class="af"><label for="av_${k}">${esc(n)} voice</label><input id="av_${k}" type="url" value="${esc(vl[k] || "")}" placeholder="https://meet.google.com/…"></div>`).join("")}</div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="voice">Save voice rooms</button></div></div>`;
  }
  if(T === "cxgate") h += cxGateTab();
  if(T === "cxall") h += cxAllTab();
  if(T === "dchat") h += dcAdminTab();
  if(T === "cortex"){
    const tp = cx.topics || {};
    h += `<div class="acard"><h3>Pinned message</h3><p class="hint">Shows at the top of #main-floor for everyone.</p><div class="af"><input id="ac_pin" value="${esc(cx.pin || "")}" maxlength="240" placeholder="Welcome! Tag ▲/▼ on your trade calls. Be respectful."></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="pin">Save pin</button>${cx.pin ? `<button class="btn ghost sm" type="button" data-apsave="unpin">Remove pin</button>` : ""}</div></div>
      <div class="acard"><h3>Channel topics</h3><div class="aform">${cxTextTabs().map(([k]) => `<div class="af"><label for="ac_t_${k}"># ${esc(DCH[k][0])}</label><input id="ac_t_${k}" value="${esc(tp[k] || "")}" placeholder="${esc(DCH[k].orig || DCH[k][1])}" maxlength="90"></div>`).join("")}</div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="topics">Save topics</button></div></div>` + cxAdminCard();
  }
  if(T === "moderation"){
    const M = loungeMsgs().slice(-40).reverse(), mu = Object.entries(md.muted || {}).filter(([id]) => isMuted(id));
    h += `<div class="acard"><h3>Chat rules</h3><div class="aform">
      <div class="af"><label for="am_slow">Slow mode</label><select id="am_slow">${[[0,"Off"],[5,"5 seconds"],[10,"10 seconds"],[30,"30 seconds"],[60,"1 minute"]].map(([k, l]) => `<option value="${k}" ${+(md.slow || 0) === k ? "selected" : ""}>${l}</option>`).join("")}</select><small>Time between messages per person. Admins are exempt.</small></div>
      <div class="af w"><label for="am_words">Blocked words</label><input id="am_words" value="${esc(md.words || "")}" placeholder="comma, separated, words"><small>Masked with *** wherever chat shows.</small></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="mod">Save chat rules</button></div></div>
      <div class="acard"><h3>Mute someone</h3><div class="aform"><div class="af"><label for="am_len">Length</label><select id="am_len"><option value="1">1 hour</option><option value="24">1 day</option><option value="168">1 week</option><option value="0">Until unmuted</option></select></div></div>${apUserSearch("mute", "Mute", "data-apmute")}
      <div class="alist">${mu.length ? mu.map(([id, x]) => `<div class="arow">${avatar(id,"sm")}<div class="t">${who(id)}<small>${x.until ? "until " + esc(new Date(x.until).toLocaleString()) : "until unmuted"}</small></div><div class="aacts"><button class="xbtn2" type="button" data-apunmute="${esc(id)}">Unmute</button></div></div>`).join("") : `<div class="aempty">Nobody is muted.</div>`}</div></div>
      <div class="acard"><h3>Recent chat <small>newest first · all channels</small></h3><div class="alist">${M.length ? M.map(m => `<div class="arow">${m.name ? `<span class="av sm" style="background:${m.color||"#4DA3FF"}"></span>` : avatar(m.a,"sm")}<div class="t">${m.name ? esc(m.name) : m.as ? esc(m.as.n) : who(m.a)} <small>#${esc((DCH[m.tab || "main"] || DCH.main)[0])} · ${esc(tLocal(m.t))} · ${esc(m.b)}</small></div><div class="aacts">${!S.demo && m.hour ? `<button class="xbtn2" type="button" data-lmdel="${esc(m.hour)}|${esc(m.id)}">Delete</button>` : ""}${!S.demo && m.a && m.a !== meId ? `<button class="xbtn2" type="button" data-apmute="${esc(m.a)}">Mute</button>` : ""}</div></div>`).join("") : `<div class="aempty">No messages yet.</div>`}</div></div>`;
  }
  if(T === "forum"){
    h += `<div class="acard"><h3>Add a subcategory</h3><div class="aform"><div class="af"><label for="af_sec">Section</label><select id="af_sec">${Object.entries(SECTIONS).map(([k, x]) => `<option value="${k}">${esc(x.name)}</option>`).join("")}</select></div>
      <div class="af"><label for="af_name">Name</label><input id="af_name" maxlength="40" placeholder="BTC 15m"></div><div class="af w"><label for="af_desc">Description</label><input id="af_desc" maxlength="140"></div></div>
      <div class="aacts"><button class="btn sm" type="button" data-apsave="sub">Add subcategory</button></div></div>`;
    for(const [k, x] of Object.entries(SECTIONS)){
      const subs = (S.subs || []).filter(z => z.section === k);
      h += `<div class="acard"><h3>${esc(x.name)} <small>${subs.length} subcategories · ${(S.threads || []).filter(t => t.section === k).length} discussions</small></h3><div class="alist">${subs.length ? subs.map(z => `<div class="arow"><span class="adot" style="--c:var(--${k})"></span><div class="t">#${esc(z.name)}<small>${(S.threads || []).filter(t => t.subId === z.id).length} discussions${z.description ? " · " + esc(z.description) : ""}</small></div><div class="aacts">${confirmBtn("sub:" + z.id, "Delete", `data-apdelsub="${esc(z.id)}"`)}</div></div>`).join("") : `<div class="aempty">No subcategories.</div>`}</div></div>`;
    }
  }
  if(T === "registry"){
    const rows = (docs, kind) => Object.entries(docs || {}).flatMap(([uid, d]) => Object.entries(d.list || {}).map(([id, b]) => ({uid, id, b, kind})));
    const B = rows(S.botDocs, "bot"), C = rows(S.scDocs, "script");
    const tbl = (L, col) => `<div class="alist">${L.length ? L.map(r => `<div class="arow"><span class="adot" style="--c:${col}"></span><div class="t">${esc(r.b.name || "Untitled")}<small>by <span>${who(r.uid)}</span>${r.b.status ? " · " + esc(r.b.status) : ""}${r.b.asset ? " · " + esc(r.b.asset + " " + (r.b.tf || "")) : ""}</small></div><div class="aacts">${confirmBtn(r.kind + ":" + r.uid + ":" + r.id, "Remove", `data-apdelreg="${r.kind}|${esc(r.uid)}|${esc(r.id)}"`)}</div></div>`).join("") : `<div class="aempty">None registered.</div>`}</div>`;
    seedEnts();
    const EN = Object.entries(getEnts()).filter(([, x]) => x && !x.deleted);
    const edRow = ([eid, x]) => `<div class="arow"><span class="adot" style="--c:${esc(x.color || "#4DA3FF")}"></span><div class="t">${esc(x.name)} ${x.sample ? `<span class="rb str">SAMPLE</span>` : ""}<small>${x.kind === "bot" ? "BOT" : "SCRIPT"} · by ${esc(x.owner || "—")} · ${esc(x.status || "")}${x.rec ? " · " + esc(x.rec) : ""}</small></div><div class="aacts"><button class="xbtn2" type="button" data-enedit="${esc(eid)}">Edit details</button><button class="xbtn2" type="button" data-prof="e:${esc(eid)}">View</button></div></div>${S.entEdit === eid ? entEditor(eid, x) : ""}`;
    h += `<div class="acard"><h3>Bots & scripts listings <small>shown on the Bots and Chart Scripts pages</small></h3><div class="aacts"><button class="btn sm" type="button" data-ennew="bot">+ Add bot</button><button class="btn ghost sm" type="button" data-ennew="script">+ Add script</button></div>
      <h4 style="margin:6px 0 0;font:700 11px var(--mono);letter-spacing:.14em;color:var(--bots)">BOTS</h4><div class="alist">${EN.filter(([, x]) => x.kind === "bot").map(edRow).join("") || `<div class="aempty">None.</div>`}</div>
      <h4 style="margin:6px 0 0;font:700 11px var(--mono);letter-spacing:.14em;color:var(--scripts)">SCRIPTS</h4><div class="alist">${EN.filter(([, x]) => x.kind === "script").map(edRow).join("") || `<div class="aempty">None.</div>`}</div></div>
      <div class="acard"><h3>Registered by members: bots <small>${B.length}</small></h3>${tbl(B, "var(--bots)")}</div><div class="acard"><h3>Registered by members: chart scripts <small>${C.length}</small></h3>${tbl(C, "var(--scripts)")}</div>`;
  }
  if(T === "battle"){
    const cfg = foRun() || {};
    h += `<div class="acard"><h3>Battle of the Bots</h3><div class="astats">
      <div class="astat"><b>${rosterList().length}</b><span>Bots on roster</span></div>
      <div class="astat"><b style="font-size:16px">${esc(cfg.mode || "—")}</b><span>Mode</span></div>
      <div class="astat"><b style="font-size:16px">${cfg.first ? esc(new Date(cfg.first).toLocaleString()) : "—"}</b><span>First round</span></div>
      <div class="astat"><b style="font-size:16px">${(() => { const F = foNames(); return F.a || F.b ? esc((F.a || "?") + " vs " + (F.b || "?")) : "—"; })()}</b><span>Face-off</span></div></div>
      <p class="hint">The roster, face-off, round timing and results are edited right on the Battle page.</p>
      <div class="aacts"><button class="btn sm" type="button" data-apgo="battle">Open Battle controls</button></div></div>
      <div class="acard"><h3>Round results</h3><p class="hint">Mark UP/DOWN outcomes for rounds that haven't settled. The round desk is off the main page now; the button below opens it for admins only (▲/▼ buttons next to each round).</p><div class="aacts"><button class="btn ghost sm" type="button" data-apgo="desk">Open the Round Desk</button></div></div>`;
  }
  if(T === "legal"){
    h += [["terms","Terms of Service","Who can use the site, what's allowed, account termination, no warranties, limitation of liability."],["privacy","Privacy Policy","What data you collect (names, messages, calls), why, how long you keep it, and how people can ask for deletion."],["rules","Community rules","Be respectful, no spam or pumping, disclose paid promotions, no personal attacks, mods have the final say."]]
      .map(([k, t, hint]) => `<div class="acard"><h3>${t} <small>${lg[k] ? "published" : "empty"}</small></h3><p class="hint">Cover: ${hint} Have a lawyer review before launch.</p><div class="af"><textarea id="al_${k}" style="min-height:160px">${esc(lg[k] || "")}</textarea></div><div class="aacts"><button class="btn sm" type="button" data-apsave="legal_${k}">Publish ${t}</button><button class="btn ghost sm" type="button" data-legal="${k}">Preview</button></div></div>`).join("");
  }
  if(T === "launch"){
    const dn = (S.launch || {}).done || {};
    h += `<div class="acard"><h3>Launch checklist <small>${c.done} / ${c.total}</small></h3><p class="hint">Everything a live-trading community site like D3MON.CO needs beyond this page. Tick items off as you finish them.</p><div class="aprog"><i style="width:${c.total ? Math.round(c.done/c.total*100) : 0}%"></i></div></div>` +
      LAUNCH.map(([g, items]) => `<div class="acard"><h3>${esc(g)} <small>${items.filter(([k]) => dn[k]).length} / ${items.length}</small></h3><div class="achk">${items.map(([k, t, d]) => `<label class="${dn[k] ? "done" : ""}"><input type="checkbox" data-aplaunch="${k}" ${dn[k] ? "checked" : ""}><span><span class="tt">${esc(t)}</span><small>${esc(d)}</small></span></label>`).join("")}</div></div>`).join("");
  }
  const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest("#apBody") ? document.activeElement.id : null;
  if(keep && renderAdmin.lastTab === T && /^aps_/.test(keep)){ // only refresh hits while typing
    for(const k of Object.keys(S.apHits)){ const box = $("aph_" + k), tmp = document.createElement("div"); tmp.innerHTML = h; const nb = tmp.querySelector("#aph_" + k); if(box && nb) box.innerHTML = nb.innerHTML; }
    fillNames($("apBody")); return;
  }
  if(keep && renderAdmin.lastTab === T) return; // don't wipe a form someone is typing in
  renderAdmin.lastTab = T;
  $("apBody").innerHTML = h;
  fillNames($("apBody"));
}
$("adminBtn").addEventListener("click", () => openAdmin(!S.adminPage));
$("apExitBtn").addEventListener("click", () => openAdmin(false));
$("adminPage").addEventListener("input", async e => {
  const k = e.target.dataset.apsearch; if(!k) return;
  const q = e.target.value.trim();
  if(!user || !user.search){ S.apHits[k] = []; return; }
  const hits = await user.search(q); S.apHits[k] = (hits || []).slice(0, 8); renderAdmin();
});
$("adminPage").addEventListener("change", async e => {
  const k = e.target.dataset.aplaunch; if(!k) return;
  const val = e.target.checked; S.launch = {...S.launch, done:{...(S.launch.done || {}), [k]:val}};
  if(!apPreview()) await act(() => mergeWrite(db.doc("config/launch"), {done:{[k]:val}}));
  renderAdmin.lastTab = null; renderAdmin();
});
$("adminPage").addEventListener("click", async e => {
  const b = e.target.closest("button"); if(!b) return;
  const d = b.dataset;
  if(d.aptab){ S.apTab = d.aptab; S.apConfirm = null; renderAdmin.lastTab = null; renderAdmin(); $("apBody").scrollIntoView({block:"nearest"}); return; }
  if(d.apgo){ openAdmin(false); if(d.apgo === "cortex") openCortex(true); else if(d.apgo === "battle") openBattle(true); else if(d.apgo === "callerlist") openCallersPage(true); else if(d.apgo === "desk"){ document.body.classList.add("deskopen"); go({section:"callers", sub:null, view:"list", openId:null}); setTimeout(() => $("desk")?.scrollIntoView({block:"start"}), 50); } return; }
  if(d.apask){ S.apConfirm = d.apask; renderAdmin.lastTab = null; renderAdmin(); return; }
  if("apcancel" in d){ S.apConfirm = null; renderAdmin.lastTab = null; renderAdmin(); return; }
  if(d.revokeYes || d.verify || d.decline || d.allowstream || d.unstream || d.end || d.lmdel){ S.apConfirm = null; setTimeout(() => { renderAdmin.lastTab = null; renderAdmin(); }, 400); return; } // handled by the site's own handlers
  if(d.rvok){ const id = d.rvok; if(apPreview()) return toast("Preview only."); if(await act(async () => { await mergeWrite(db.doc("config/members"), {cats:{[id]:{reviewer:true}}}); try { await db.doc("reviewreq/" + id).delete(); } catch {} })) toast("Reviewer approved"); S.apHits.rv = []; renderAdmin.lastTab = null; return; }
  if(d.rvno){ if(apPreview()) return toast("Preview only."); if(await act(() => db.doc("reviewreq/" + d.rvno).delete())) toast("Application declined"); return; }
  if(d.rvoff){ S.apConfirm = null; if(apPreview()) return toast("Preview only."); if(await act(() => mergeWrite(db.doc("config/members"), {cats:{[d.rvoff]:{reviewer:false}}}))) toast("Reviewer removed"); return; }
  if(d.rqok || d.rqno){ const [k, id] = (d.rqok || d.rqno).split("|"), r = (S.roleReqs || []).find(x => x.id === id) || {}; if(apPreview()) return toast("Preview only.");
    const ok = await act(async () => { if(d.rqok){ if(k === "streamer") await db.doc("streamers/" + id).set({t:Date.now(), by:meId}); else await mergeWrite(db.doc("config/members"), {cats:{[id]:{holder:true, holderAmt:(r.holder || {}).amount || "", wallet:(r.holder || {}).wallet || ""}}}); }
      await mergeWrite(db.doc("rolereq/" + id), {[k]:{...(r[k] || {}), done:true, ok:!!d.rqok}}); });
    if(ok) toast(d.rqok ? "Approved" : "Declined"); return; }
  if(d.ibdel){ S.apConfirm = null; const L = {...(S.dmInbox || {})}; delete L[d.ibdel]; if(apPreview()) return toast("Preview only."); if(await act(() => db.doc("config/inbox").set({msgs:L}))) toast("Deleted"); return; }
  if(d.cqok || d.cqno){ const [k, id] = (d.cqok || d.cqno).split("|"), ok2 = !!d.cqok; if(apPreview()) return toast("Preview only.");
    const r = (S.roleReqs || []).find(x => x.id === id) || {}, key = k === "demon" ? "demon" : k === "callers" ? "caller" : k === "bots" ? "bot" : "script", app = r[key] || {};
    const done = await act(async () => {
      if(k === "demon"){ if(ok2) await mergeWrite(db.doc("config/members"), {cats:{[id]:{demon:true}}}); }
      else if(k === "callers"){ if(ok2) await db.doc("verified/" + id).set({t:Date.now(), by:meId}); await db.doc("requests/" + id).delete(); }
      else if(ok2){ const eid = "u" + Date.now().toString(36); await mergeWrite(db.doc("config/members"), {cats:{[id]:{[k === "bots" ? "botdev" : "scripter"]:true}}, entsSeeded:true, ents:{...((S.memReg || {}).entsSeeded ? {} : defaultEnts()), [eid]:{kind:key, name:app.nm || (k === "bots" ? "New bot" : "New script"), ownerId:id, owner:"", color:k === "bots" ? "#4DA3FF" : "#B98CFF", status:"running", rec:"", desc:app.ex || "", sources:[], market:k === "scripts" ? app.mk || "" : "", signal:k === "scripts" ? "neutral" : "", liveTitle:"", liveUrl:app.ln || "", sample:false, t:Date.now()}}}); }
      if(r[key] || k !== "callers") await mergeWrite(db.doc("rolereq/" + id), {[key]:{...app, done:true, ok:ok2}});
    });
    if(done) toast(ok2 ? "Approved and connected" : "Declined"); renderAdmin.lastTab = null; connBadge(); return; }
  if(d.lsok || d.lsno){ const k = d.lsok || d.lsno, ok2 = !!d.lsok; S.listCfg = {...lcfg(), approved:{...(lcfg().approved || {}), [k]:ok2}, rejected:{...(lcfg().rejected || {}), [k]:!ok2}}; await apSave("config/listing", {approved:{[k]:ok2}, rejected:{[k]:!ok2}}, ok2 ? "Listed" : "Declined"); renderAdmin.lastTab = null; renderAdmin(); return; }
  if(d.llock){ const k = d.llock, on2 = !(lcfg().locked || {})[k]; S.listCfg = {...lcfg(), locked:{...(lcfg().locked || {}), [k]:on2}}; await apSave("config/listing", {locked:{[k]:on2}}, on2 ? "Updates blocked for this listing" : "Updates allowed"); renderAdmin.lastTab = null; renderAdmin(); return; }
  if(d.lclear){ const k = d.lclear;
    if(/^p:/.test(k)) await saveProfile(k.slice(2), {row:{...((getProfiles()[k.slice(2)] || {}).row || {}), ups:[]}}, "Updates cleared");
    else if(/^e:/.test(k)) await saveEnt(k.slice(2), {row:{...((getEnts()[k.slice(2)] || {}).row || {}), ups:[]}}, "Updates cleared");
    else { const uid = /^[bs]:/.test(k) ? k.split(":")[1] : k; if(apPreview()) return toast("Preview only."); if(await act(() => mergeWrite(db.doc("bots/" + uid), {pub:{row:{ups:[]}}}))) toast("Updates cleared"); }
    renderAdmin.lastTab = null; renderAdmin(); return; }
  if(d.apsample){ await apSave("config/site", {samples: d.apsample === "on"}, d.apsample === "on" ? "Sample callers showing" : "Sample callers hidden"); return; }
  if(d.apmute){ const hrs = +(apV("am_len") || 24); await apSave("config/mod", {muted:{[d.apmute]:{t:Date.now(), by:meId, until: hrs ? Date.now() + hrs*3600000 : 0}}}, "Muted"); S.apHits.mute = []; renderAdmin.lastTab = null; return; }
  if(d.apunmute){ await apSave("config/mod", {muted:{[d.apunmute]:{until:1}}}, "Unmuted"); return; }
  if(d.apdelsub){ S.apConfirm = null; if(apPreview()) return toast("Preview only."); if(await act(() => db.doc("subs/" + d.apdelsub).delete())) toast("Subcategory deleted"); return; }
  if(d.apdelreg){ S.apConfirm = null; const [kind, uid, id] = d.apdelreg.split("|"); if(apPreview()) return toast("Preview only.");
    const coll = kind === "bot" ? "bots" : "scripts", docs = kind === "bot" ? S.botDocs : S.scDocs, list = {...((docs[uid] || {}).list || {})}; delete list[id];
    if(await act(() => db.doc(coll + "/" + uid).update({list}))) toast("Removed"); return; }
  const sv = d.apsave; if(!sv) return;
  if(sv === "site") await apSave("config/site", {name:apV("as_name") || "D3MON.CO", tagline:apV("as_tag"), email:apV("as_email"), asset:apV("as_asset"), tf:apV("as_tf"), disclaimer:apV("as_disc")}, "Brand & basics saved");
  if(sv === "links"){ const L = {}; for(const k of ["discord","x","youtube","twitch","kick"]){ const u = apV("as_" + k); if(!urlOk(u)) return toast("Links need to start with https://"); L[k] = u; } await apSave("config/site", L, "Links saved"); }
  if(sv === "switches") await apSave("config/site", {samples:apCk("as_samples"), demoBtn:apCk("as_demo"), maint:apCk("as_maint"), maintMsg:apV("as_maintmsg")}, apCk("as_maint") ? "Saved. Maintenance mode is ON" : "Switches saved");
  if(sv === "announce"){ const text = apV("aa_text"); if(!text) return toast("Write the announcement first."); const link = apV("aa_link"); if(!urlOk(link)) return toast("Links need to start with https://"); const hrs = +apV("aa_hours");
    await apSave("config/announce", {on:true, text, level:apV("aa_level"), link, linkText:apV("aa_lt"), t:Date.now(), until: hrs ? Date.now() + hrs*3600000 : 0}, "Announcement is live"); }
  if(sv === "annoff") await apSave("config/announce", {on:false}, "Announcement taken down");
  if(sv === "voice"){ const L = {}; for(const k of Object.keys(SECTIONS)){ const u = apV("av_" + k); if(!urlOk(u)) return toast("Voice links need to start with https://"); L[k] = u; } await apSave("config/voice", L, "Voice rooms saved"); }
  if(sv === "pin") await apSave("config/cortex", {pin:apV("ac_pin")}, "Pinned");
  if(sv === "unpin") await apSave("config/cortex", {pin:""}, "Pin removed");
  if(sv === "topics"){ const tp = {}; for(const [k] of cxTextTabs()) tp[k] = apV("ac_t_" + k); await apSave("config/cortex", {topics:tp}, "Topics saved"); }
  if(sv === "rvwho"){ const v2 = (document.querySelector('input[name="rvwho"]:checked') || {}).value || "reviewers"; S.rvCfg = {...S.rvCfg, who:v2}; await apSave("config/reviews", {who:v2}, "Review settings saved"); }
  if(sv === "boards"){ const patch = {}; for(const k of ["callers","bots","scripts"]){ const u = apV("bd_" + k); if(!urlOk(u)) return toast("Discord links need to start with https://"); patch[k] = {mode:(document.querySelector(`input[name="bm_${k}"]:checked`) || {}).value || "local", discord:u}; } S.bCfg = {...S.bCfg, ...patch}; await apSave("config/boards", patch, "Message board settings saved"); }
  if(sv === "dmcfg"){ S.dmCfg = {...S.dmCfg, off:!apCk("dm_on"), verifiedOnly:apCk("dm_ver")}; await apSave("config/dm", {off:!apCk("dm_on"), verifiedOnly:apCk("dm_ver")}, "Message settings saved"); }
  if(sv === "inbox"){ const title = apV("ib_title"), body = ($("ib_body").value || "").trim(); if(!title && !body) return toast("Write something first."); if(await apSave("config/inbox", {msgs:{["i" + Date.now().toString(36)]:{t:Date.now(), title, b:body, by:meId}}}, "Sent to everyone")){ $("ib_title").value = ""; $("ib_body").value = ""; } }
  if(sv === "demonauto"){ S.listCfg = {...lcfg(), autoDemon:apCk("dm_auto")}; await apSave("config/listing", {autoDemon:apCk("dm_auto")}, "Demon setting saved"); }
  if(sv === "guestacc"){ const g = {chat:apCk("ga_chat"), board:apCk("ga_board"), dm:apCk("ga_dm")}; S.listCfg = {...lcfg(), guest:g}; await apSave("config/listing", {guest:g}, "Guest access saved"); }
  if(sv === "listing"){ const off = {}; document.querySelectorAll("[data-lfon]").forEach(i => off[i.dataset.lfon] = !i.checked); const offSoc = {}; document.querySelectorAll("[data-lson]").forEach(i => offSoc[i.dataset.lson] = !i.checked); const patch = {off, offSoc, maxUps:+apV("lc_max"), maxLen:Math.max(20, Math.min(200, +apV("lc_len") || 80)), days:+apV("lc_days")}; S.listCfg = {...lcfg(), ...patch}; await apSave("config/listing", patch, "Listing rules saved"); if(S.callersPage) renderCallerDir(); }
  if(sv === "mod") await apSave("config/mod", {slow:+apV("am_slow"), words:apV("am_words")}, "Chat rules saved");
  if(sv === "sub"){ const name = apV("af_name"); if(!name) return toast("Name the subcategory."); if(apPreview()) return toast("Preview only.");
    if(await act(() => db.doc("subs/" + newId()).set({section:apV("af_sec"), name, description:apV("af_desc"), authorId:meId, createdAt:Date.now()}))){ toast("Subcategory added"); $("af_name").value = ""; $("af_desc").value = ""; } }
  if(sv.startsWith("legal_")){ const k = sv.slice(6); await apSave("config/legal", {[k]:$("al_" + k).value}, "Published"); }
  renderAdmin.lastTab = null; renderAdmin();
});
applySiteConfig();

// ---------- morph transition into / out of the cortex ----------
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let morphing = false;
function circ(r, big){ const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const R = big ? Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 20 : r.width * .42;
  return `circle(${R}px at ${cx}px ${cy}px)`; }
function makeOverlay(label, sub){
  const ov = document.createElement("div"); ov.className = "morph"; ov.style.setProperty("--scx", scrollX + "px"); ov.style.setProperty("--scy", scrollY + "px");
  const sig = $("corex").querySelector(".sigil").outerHTML.replace(/class="sigil( gim)?"/, 'class="bigsig$1"').replace(/ id="gs[TC]"/g, "");
  ov.innerHTML = `<div class="edge"></div>${sig}<div class="mtxt">${label}<small>${sub}</small></div>`;
  document.body.appendChild(ov); return ov;
}
async function morphIntoCortex(){
  if(S.cortex || morphing) return;
  if(cxClosed() && !cxAdm()){ cxClosedNote(); return; }
  sayCortex();
  const src = $("corex"), r = src.getBoundingClientRect();
  if(reduceMotion() || !src.animate || r.width === 0){ openCortex(true); return; }
  morphing = true;
  const sg = src.querySelector(".sigil");
  const lab = src.querySelector(".symlab");
  sg.animate([{transform:"rotate(0deg)"}, {transform:"rotate(240deg)"}], {duration:520, easing:"cubic-bezier(.5,0,.2,1)"});
  lab.style.opacity = "0"; lab.animate([{opacity:1}, {opacity:0}], {duration:200});
  src.style.transform = "translate(-50%,-50%) scale(1.25)";
  await src.animate([{transform:"translate(-50%,-50%) scale(1)"}, {transform:"translate(-50%,-50%) scale(1.25)"}], {duration:420, easing:"cubic-bezier(.5,0,.2,1)"}).finished.catch(() => {});
  const ov = makeOverlay("Live Trade Cortex", `${onlinePeople().length} online · ${cortexStreams().length} live`);
  const r2 = src.getBoundingClientRect();
  const grow = ov.animate([{clipPath: circ(r2)}, {clipPath: circ(r2, true)}], {duration:700, easing:"cubic-bezier(.7,0,.2,1)", fill:"forwards"});
  src.style.opacity = "0"; src.animate([{opacity:1}, {opacity:0}], {duration:300});
  await grow.finished.catch(() => {});
  openCortex(true);
  const cx = $("cortex"); cx.classList.remove("entering"); void cx.offsetWidth; cx.classList.add("entering");
  await new Promise(res => setTimeout(res, 180));
  await ov.animate([{opacity:1}, {opacity:0}], {duration:480, easing:"ease-out", fill:"forwards"}).finished.catch(() => {});
  ov.remove();
  setTimeout(() => cx.classList.remove("entering"), 900);
  morphing = false;
}
function resetCorex(){ const src = $("corex"); src.style.opacity = ""; src.style.transform = ""; const lab = src.querySelector(".symlab"); if(lab) lab.style.opacity = ""; }
async function morphOutOfCortex(){
  if(!S.cortex || morphing) return;
  if(reduceMotion() || !document.body.animate){ openCortex(false); resetCorex(); return; }
  morphing = true;
  const ov = makeOverlay("Back to the map", "");
  await ov.animate([{opacity:0}, {opacity:1}], {duration:220, fill:"forwards"}).finished.catch(() => {});
  openCortex(false);
  const src = $("corex");
  resetCorex();
  src.scrollIntoView({block:"center"});
  await new Promise(res => requestAnimationFrame(res));
  const r = src.getBoundingClientRect();
  await ov.animate([{clipPath: circ(r, true), opacity:1}, {clipPath: circ(r), opacity:.9}, {clipPath: circ(r), opacity:0}], {duration:760, easing:"cubic-bezier(.7,0,.2,1)", fill:"forwards"}).finished.catch(() => {});
  ov.remove();
  src.animate([{transform:"translate(-50%,-50%) scale(1.25)", filter:"drop-shadow(0 0 40px #4DA3FF)"}, {transform:"translate(-50%,-50%) scale(1)"}], {duration:450, easing:"ease-out"});
  morphing = false;
}

// ---------- intro: globe -> triangle -> nodes -> cortex -> page ----------
function playIntro(force){
  const box = $("intro");
  if(force){ window.scrollTo(0,0); box.classList.add("on"); }
  if(!box.classList.contains("on")) return;
  { const iw = $("iwm"); if(iw._fly){ iw._fly.cancel(); iw._fly = null; } iw.getAnimations().forEach(x => x.cancel()); iw.innerHTML = ""; iw.removeAttribute("style"); }   // clear the logo left over from a previous play
  const cv = $("introCv"), g = cv.getContext("2d");
  let W, H, dpr, folPat = null;
  { const m = getComputedStyle(document.documentElement).getPropertyValue("--fol").trim().match(/^url\(["']?(.*?)["']?\)$/s);
    if(m){ const im = new Image(); im.onload = () => { try { folPat = g.createPattern(im, "repeat"); } catch {} }; im.src = m[1]; } }
  const size = () => { dpr = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W*dpr; cv.height = H*dpr; g.setTransform(dpr,0,0,dpr,0,0); };
  size(); addEventListener("resize", size);
  const CITIES = [[40.7,-74],[51.5,-0.1],[35.7,139.7],[21.3,-157.9],[1.35,103.8],[-33.9,151.2],[-23.5,-46.6],[6.5,3.4],[25.2,55.3],[19.1,72.9],[37.6,127],[37.8,-122.4],[43.7,-79.4],[52.5,13.4],[19.4,-99.1],[-26.2,28],[22.3,114.2],[48.9,2.35],[41.9,-87.6],[25.8,-80.2],[55.8,37.6],[-34.6,-58.4],[30,31.2],[13.8,100.5],[-6.2,106.8],[59.3,18.1],[47.4,8.5],[-37.8,145],[4.7,-74.1],[33.7,-84.4],[45.5,-73.6],[60.2,24.9],[31.2,121.5],[-1.3,36.8],[64.1,-21.9],[35.2,-80.8]];
  const PTS = (() => { let sd = 20260930; const r = () => (sd = (sd*16807) % 2147483647)/2147483647;
    const out = CITIES.map(([la,lo]) => [la, lo, r()]);
    for(let k = 0; k < 64; k++) out.push([Math.asin(2*r() - 1)*180/Math.PI*.85, r()*360 - 180, r()]);
    return out; })();
  const COL = ["#FFB547","#4DA3FF","#B98CFF"], LAB = ["CALLERS","BOTS","CHART SCRIPTS"];
  const rad = Math.PI/180, tilt = 0.35;
  const T0 = Date.now(), END = 14.2;
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x*x*(3-2*x);
  const eio = x => x < 0 ? 0 : x > 1 ? 1 : (x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2);
  const lerp = (a,b,t) => a + (b-a)*t;
  const caps = [[3.057,4.057,"Human insight",""],[4.057,5.057,"Bot technology",""],[5.057,6.6,"Data intelligence",""],[9.9,12.3,'<span class="w3">Human insight</span><i>·</i><span class="w3">Bot technology</span><i>·</i><span class="w3">Data intelligence</span>',"Live trade community"]];
  let ci = -1, raf = 0, done = false, target = null;
  const wm = {built:false, flown:false, parts:[]};
  function buildWM(){
    const src = document.querySelector(".brand .wm"), el = $("iwm"); if(!src){ wm.built = true; return; }
    el.innerHTML = "";
    for(const n of (src.querySelector(".m") || src).childNodes){
      if(n.nodeType === 3){ for(const ch of n.textContent){ const sp = document.createElement("span"); sp.className = "il lt"; sp.textContent = ch; sp.dataset.f = ch; el.appendChild(sp); wm.parts.push(sp); } }
      else { const c = n.cloneNode(true); c.classList.add("il"); c.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); c.querySelectorAll(".gh").forEach(x => x.remove()); if(c.classList.contains("t")) c.dataset.f = c.textContent; el.appendChild(c); wm.parts.push(c); }
    }
    // gradient ids must be unique: re-point the clone's defs
    el.querySelectorAll("svg").forEach(svg => { const gr = svg.querySelector("linearGradient"), cp = svg.querySelector("clipPath"); if(gr){ gr.id = "tAgI"; svg.querySelectorAll('[stroke="url(#tAg)"]').forEach(x => x.setAttribute("stroke","url(#tAgI)")); } if(cp){ cp.id = "tAcI"; svg.querySelectorAll('[clip-path="url(#tAc)"]').forEach(x => x.setAttribute("clip-path","url(#tAcI)")); } });
    // size the name to fit in the space above the triangle's top node and its CALLERS label
    { const m = Math.min(W, H), apexY = H/2 + m*0.03 - m*0.3*1.12, labelTop = apexY - m*0.034 - 12 - Math.max(11, m*0.02);
      wm.bottom = labelTop - 12;
      const base = Math.min(86, Math.max(34, innerWidth*0.072)), fit = (wm.bottom - 16)/1.6;
      el.style.fontSize = Math.max(22, Math.min(base, fit, innerWidth*0.9/6.2)) + "px"; }
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.setProperty("--gw", (w*3) + "px"); wm.gw = w*3;
    wm.parts.forEach(pp => { if(pp.dataset.f){ pp.style.width = pp.offsetWidth + "px"; } if(pp.classList.contains("lt")) pp.style.backgroundPosition = `calc(var(--fx, 0px) - ${pp.offsetLeft}px) 0`; });
    el.style.left = (innerWidth/2 - w/2) + "px"; el.style.top = Math.max(10, wm.bottom - h*1.3) + "px"; el.style.visibility = "visible";   // centred, above the triangle
    wm.built = true;
  }
  const GLY = "#%&@$*<>/\\|=+?!01ABCDEFGHKMNPRSTVWXYZ";
  function decodeIn(pp){
    pp.classList.add("on", "scr");
    const fin = pp.dataset.f; let n = 0;
    const iv = setInterval(() => {
      if(++n > 7){ clearInterval(iv); if(fin) pp.textContent = fin; pp.classList.remove("scr"); pp.classList.add("lock"); return; }
      if(fin) pp.textContent = GLY[(Math.random()*GLY.length)|0];
    }, 55);
  }
  function flyWM(){
    wm.flown = true;
    const el = $("iwm"), dst = document.querySelector(".brand .wm"); if(!dst || !el.animate) return;
    const a = el.getBoundingClientRect(), b = dst.getBoundingClientRect(); if(!a.width || !b.width) return;
    const sc = b.height / a.height, dx = b.left - a.left, dy = b.top - a.top;
    el._fly = el.animate([{transform:"translate(0,0) scale(1)", textShadow:"0 0 18px rgba(77,163,255,.35)"}, {transform:`translate(${dx}px,${dy}px) scale(${sc})`, textShadow:"0 0 0 rgba(0,0,0,0)"}], {duration:2300, easing:"cubic-bezier(.65,0,.35,1)", fill:"forwards"});
  }
  function project(lat, lon, cx, cy, R, rot){
    const p = lat*rad, l = lon*rad + rot;
    const x = Math.cos(p)*Math.sin(l), y = Math.sin(p), z = Math.cos(p)*Math.cos(l);
    const y2 = y*Math.cos(tilt) - z*Math.sin(tilt), z2 = y*Math.sin(tilt) + z*Math.cos(tilt);
    return [cx + R*x, cy - R*y2, z2];
  }
  function readTarget(){
    const c = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2, r.width/2]; };
    const hx = ["callers","bots","scripts"].map(k => document.querySelector(`[data-node="${k}"] .hex`));
    const cx = $("corex");
    if(!cx || hx.some(h => !h) || !cx.getBoundingClientRect().width) return null;
    const core = c(cx);
    return {nodes: hx.map(c), core:[core[0], core[1], core[2]*0.84]};
  }
  function hexPath(x, y, r){ g.beginPath(); for(let k = 0; k < 6; k++){ const a = k*Math.PI/3; g.lineTo(x + r*Math.cos(a), y + r*Math.sin(a)*0.94); } g.closePath(); }
  function qpt(x0,y0,qx,qy,x1,y1,t){ return [(1-t)*(1-t)*x0 + 2*(1-t)*t*qx + t*t*x1, (1-t)*(1-t)*y0 + 2*(1-t)*t*qy + t*t*y1]; }
  function frame(){
    const e0 = (Date.now() - T0)/1000/1.4;   // whole intro runs 1.4x slower for a calmer pace
    const e = e0 + 0.9*ease((e0 - 1.0)/1.8);   // ...but glide through the globe-only opening a little quicker
    g.clearRect(0,0,W,H);
    const m = Math.min(W,H);
    const gIn = eio(e/1.3), gA = 1 - ease((e-10.8)/1.4);
    const cx0 = W/2, cy0 = H/2 + m*0.03, R = m*0.3*(0.85 + 0.15*gIn), rot = e*0.3;
    // backdrop grid (fades toward the page's own grid)
    if(folPat){ try { folPat.setTransform(new DOMMatrix([LAT.s/52, 0, 0, LAT.th/90, LAT.x0 - scrollX, LAT.y0 - scrollY])); } catch {} g.fillStyle = folPat; g.fillRect(0,0,W,H); }
    // morph progress into the page layout
    if(e > 11.4 && !target) target = readTarget();
    const k = target ? eio((e-11.6)/1.8) : 0;
    const TR = R*1.12;
    const base = [[cx0, cy0 - TR, m*0.034],[cx0 - TR*0.866, cy0 + TR*0.5, m*0.034],[cx0 + TR*0.866, cy0 + TR*0.5, m*0.034]];
    const N = base.map((b,i) => target ? [lerp(b[0], target.nodes[i][0], k), lerp(b[1], target.nodes[i][1], k), lerp(b[2], target.nodes[i][2]*0.98, k)] : b);
    const coreGrow = ease((e-7.0)/1.5);
    const coreBase = [cx0, cy0 + 0, m*0.018 + m*0.055*coreGrow];
    const C = target ? [lerp(coreBase[0], target.core[0], k), lerp(coreBase[1], target.core[1], k), lerp(coreBase[2], target.core[2], k)] : coreBase;
    // globe
    if(gA > 0 && gIn > 0){
      g.save(); g.globalAlpha = gA*gIn;
      const halo = g.createRadialGradient(cx0,cy0,R*.2,cx0,cy0,R*1.3); halo.addColorStop(0,"rgba(77,163,255,.16)"); halo.addColorStop(1,"rgba(77,163,255,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(cx0,cy0,R*1.3,0,7); g.fill();
      g.fillStyle = "#050B12"; g.beginPath(); g.arc(cx0,cy0,R,0,7); g.fill();
      g.strokeStyle = "rgba(77,163,255,.6)"; g.lineWidth = 1.3; g.beginPath(); g.arc(cx0,cy0,R,0,7); g.stroke();
      g.lineWidth = .8;
      for(let lat = -60; lat <= 60; lat += 30){ let prev = null; for(let lon = -180; lon <= 180; lon += 6){ const [x,y,z] = project(lat,lon,cx0,cy0,R,rot); if(z > 0 && prev){ g.strokeStyle = `rgba(77,163,255,${.1+.25*z})`; g.beginPath(); g.moveTo(prev[0],prev[1]); g.lineTo(x,y); g.stroke(); } prev = z > 0 ? [x,y] : null; } }
      for(let lon = 0; lon < 360; lon += 30){ let prev = null; for(let lat = -90; lat <= 90; lat += 6){ const [x,y,z] = project(lat,lon,cx0,cy0,R,rot); if(z > 0 && prev){ g.strokeStyle = `rgba(77,163,255,${.08+.22*z})`; g.beginPath(); g.moveTo(prev[0],prev[1]); g.lineTo(x,y); g.stroke(); } prev = z > 0 ? [x,y] : null; } }
      g.restore();
    }
    // cities -> nodes: once the triangle closes, streams surge in from all over the globe
    const charge = ease((e-6.5)/0.9)*(1 - ease((e-8.8)/1.3));      // how hard the triangle is being fed right now
    PTS.forEach(([la,lo,h], i) => {
      const [x,y,z] = project(la,lo,cx0,cy0,R,rot);
      const ap = ease((e - 0.8 - (i < CITIES.length ? i*0.055 : 1.4 + (i - CITIES.length)*0.03))/0.7) * gA;
      if(z <= 0 || ap <= 0) return;
      const c = COL[i%3], [nx,ny] = N[i%3];
      const lp = eio((e - 6.0 - h*0.9)/0.9);                              // staggered launch, most arrive together
      g.save(); g.globalAlpha = ap*(.45+.55*z);
      g.fillStyle = c; g.shadowBlur = 14; g.shadowColor = c; g.beginPath(); g.arc(x, y, (i < CITIES.length ? 2.4 : 1.6) + 1.1*Math.sin(e*4 + i) + 1.4*charge, 0, 7); g.fill();
      if(lp > 0){
        const qx = (x + nx)/2 + (x - cx0)*0.25, qy = (y + ny)/2 + (y - cy0)*0.25 - m*0.04;
        g.shadowBlur = 6*charge; g.strokeStyle = c; g.globalAlpha = ap*z*(.3 + .35*charge); g.lineWidth = 1 + .6*charge; g.beginPath(); g.moveTo(x,y);
        const n = Math.ceil(24*lp); for(let s2 = 1; s2 <= n; s2++){ const [px,py] = qpt(x,y,qx,qy,nx,ny,Math.min(lp, s2/24)); g.lineTo(px,py); } g.stroke();
        if(lp < 1){ const [hx,hy] = qpt(x,y,qx,qy,nx,ny,lp); g.globalAlpha = ap*z; g.fillStyle = "#fff"; g.shadowBlur = 12; g.shadowColor = c; g.beginPath(); g.arc(hx, hy, 2, 0, 7); g.fill(); }
        else { const nd = 1 + Math.round(2*charge); for(let j = 0; j < nd; j++){ const t = Math.pow(((e*(0.8 + .9*charge)) + h + j/nd) % 1, 1.6);
          const [px,py] = qpt(x,y,qx,qy,nx,ny,t); g.globalAlpha = ap*z; g.fillStyle = "#fff"; g.shadowBlur = 10; g.shadowColor = c; g.beginPath(); g.arc(px, py, 1.7, 0, 7); g.fill(); } }
      }
      g.restore();
    });
    // triangle over the globe
    const tIn = ease((e-3.4)/1.5);
    if(tIn > 0){
      const cl = t => t < 0 ? 0 : t > 1 ? 1 : t, backOut = t => { t = cl(t); const c = 1.9; return 1 + (c + 1)*Math.pow(t - 1, 3) + c*Math.pow(t - 1, 2); };
      const nodeT = i => 3.4 + i*1.0;                                           // each node pops in with its caption
      // edges draw out from each node with a bright spark at the tip
      for(let i = 0; i < 3; i++){ const a = N[i], b = N[(i+1)%3], d = eio((e - nodeT(i) - 0.25)/1.1); if(d <= 0) continue;
        const tx = a[0] + (b[0]-a[0])*d, ty = a[1] + (b[1]-a[1])*d;
        g.save(); const gr = g.createLinearGradient(a[0],a[1],b[0],b[1]); gr.addColorStop(0,COL[i]); gr.addColorStop(1,COL[(i+1)%3]);
        g.lineWidth = 2.2 + .5*Math.sin(e*2.2 + i*2)*ease((e-6.8)/0.8) + 1.6*charge; g.shadowBlur = 18 + 24*charge; g.shadowColor = COL[i]; g.strokeStyle = gr;
        g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(tx,ty); g.stroke();
        if(d < 1){ const d0 = Math.max(0, d - .14); g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 3; g.shadowColor = COL[(i+1)%3]; g.shadowBlur = 16;
          g.beginPath(); g.moveTo(a[0] + (b[0]-a[0])*d0, a[1] + (b[1]-a[1])*d0); g.lineTo(tx,ty); g.stroke();
          g.fillStyle = "#fff"; g.shadowBlur = 24; g.beginPath(); g.arc(tx, ty, 3.4, 0, 7); g.fill(); }
        g.restore(); }
      // once closed, one pulse of light races around the triangle
      const pu = (e - 6.8)/1.4;
      if(pu > 0 && pu < 1){ const sP = eio(pu)*3, ei = Math.min(2, Math.floor(sP)), f = sP - ei, a = N[ei], b = N[(ei+1)%3];
        const px = a[0] + (b[0]-a[0])*f, py = a[1] + (b[1]-a[1])*f, f0 = Math.max(0, f - .18);
        g.save(); g.globalAlpha = Math.sin(pu*Math.PI); g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3.2; g.shadowBlur = 22; g.shadowColor = COL[ei];
        g.beginPath(); g.moveTo(a[0] + (b[0]-a[0])*f0, a[1] + (b[1]-a[1])*f0); g.lineTo(px, py); g.stroke();
        g.fillStyle = "#fff"; g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill(); g.restore(); }
      // nodes -> cortex streams
      const flow = ease((e-7.6)/1.0) * (1 - ease((e-12.4)/1.0));
      if(flow > 0) for(let i = 0; i < 3; i++){ const [nx,ny] = N[i];
        g.save(); g.strokeStyle = COL[i]; g.globalAlpha = .35*flow; g.lineWidth = 1.4; g.setLineDash([3,6]); g.lineDashOffset = -e*40; g.beginPath(); g.moveTo(nx,ny); g.lineTo(C[0],C[1]); g.stroke(); g.setLineDash([]);
        for(let j = 0; j < 7; j++){ const t = ((e*0.9) + j/7) % 1; const px = lerp(nx, C[0], t), py = lerp(ny, C[1], t);
          g.globalAlpha = flow*(1-t*0.3); g.fillStyle = COL[i]; g.shadowBlur = 12; g.shadowColor = COL[i]; g.beginPath(); g.arc(px, py, 2.2*(1-t*0.4), 0, 7); g.fill(); }
        g.restore(); }
      // nodes
      for(let i = 0; i < 3; i++){ const [x,y,r0] = N[i], pp = cl((e - nodeT(i))/0.7); if(pp <= 0) continue;
        const r = r0*backOut(pp)*(1 + .12*charge*(.6 + .4*Math.sin(e*6 + i))), rot = (1 - eio(pp))*-1.1, q = cl((e - nodeT(i))/0.95);
        // shockwave as the node lands
        if(q > 0 && q < 1){ g.save(); g.globalAlpha = (1 - q)*.8; g.strokeStyle = COL[i]; g.lineWidth = 2.4*(1 - q) + .4; g.shadowBlur = 14; g.shadowColor = COL[i];
          g.beginPath(); g.arc(x, y, r0*(1 + 2.6*eio(q)), 0, 7); g.stroke(); g.restore(); }
        g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = "#070D14"; g.strokeStyle = COL[i]; g.lineWidth = 2 + 1.2*charge; g.shadowBlur = 26 + 14*(1 - pp) + 34*charge; g.shadowColor = COL[i];
        hexPath(0,0,r); g.fill(); g.stroke(); g.restore();
        const la = eio(pp)*(1 - k);
        if(la > 0){ g.save(); g.globalAlpha = la; g.fillStyle = COL[i]; g.font = `700 ${Math.max(11, m*0.02)}px "Orbitron", "Chakra Petch", system-ui, sans-serif`; g.textAlign = "center";
          const dy = (1 - eio(pp))*8; g.fillText(LAB[i], x, i === 0 ? y - r0 - 12 - dy : y + r0 + 20 + dy); g.restore(); } }
    }
    // the cortex core
    if(coreGrow > 0){
      const [x,y,r] = C, pulse = 1 + .06*Math.sin(e*5);
      g.save();
      const glow = g.createRadialGradient(x,y,0,x,y,r*1.6); glow.addColorStop(0,"rgba(77,163,255,.35)"); glow.addColorStop(1,"rgba(77,163,255,0)");
      g.fillStyle = glow; g.beginPath(); g.arc(x,y,r*1.6,0,7); g.fill();
      g.fillStyle = "#05080C"; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
      const ring = g.createLinearGradient(x, y - r, x, y + r); ring.addColorStop(0,"#FFB547"); ring.addColorStop(.55,"#4DA3FF"); ring.addColorStop(1,"#B98CFF");
      g.strokeStyle = ring; g.lineWidth = 2; g.setLineDash([r*0.42, r*0.12, r*0.05, r*0.12]); g.lineDashOffset = -e*20; g.beginPath(); g.arc(x,y,r,0,7); g.stroke(); g.setLineDash([]);
      // inner triangle + ring
      g.strokeStyle = "rgba(143,163,178,.3)"; g.lineWidth = 1; g.setLineDash([2,4]); g.beginPath(); g.arc(x,y,r*0.45,0,7); g.stroke(); g.setLineDash([]);
      const tr = r*0.74*coreGrow;
      [[-Math.PI/2, ring, 1.8, 1]].forEach(([a0, st, lw]) => { g.strokeStyle = st; g.lineWidth = lw; g.beginPath(); for(let q = 0; q < 3; q++){ const a = a0 + q*2*Math.PI/3; g.lineTo(x + tr*Math.cos(a), y + tr*Math.sin(a)); } g.closePath(); g.stroke(); });
      g.fillStyle = "#4DA3FF"; g.shadowBlur = 24; g.shadowColor = "#4DA3FF"; g.beginPath(); g.arc(x,y,r*0.1*pulse + 2,0,7); g.fill();
      g.shadowBlur = 0; g.fillStyle = "#DCE7EE"; g.beginPath(); g.arc(x,y,r*0.045 + 1,0,7); g.fill();
      g.restore();
    }
    // wordmark: spell D3MON.CO, then fly it onto the header wordmark
    if(e >= 8.6 && !wm.built) buildWM();
    if(wm.built){ const step = Math.floor((e - 8.8)/0.2); for(let i = 0; i < wm.parts.length && i <= step; i++) if(!wm.parts[i].classList.contains("on")) decodeIn(wm.parts[i]);
      $("iwm").style.setProperty("--fx", (-((e/8)*wm.gw) % wm.gw).toFixed(1) + "px"); }
    if(e >= 11.6 && wm.built && !wm.flown) flyWM();
    // captions
    let want = -1; caps.forEach((c,i) => { if(e >= c[0] && e < c[1]) want = i; });
    if(want !== ci){ ci = want; const el = $("il1"); el.classList.remove("show"); if(el.nextElementSibling.classList.contains("on")) el.nextElementSibling.classList.add("out"); setTimeout(() => { if(ci >= 0){ el.innerHTML = caps[ci][2]; const sub = el.nextElementSibling; sub.textContent = caps[ci][3]; sub.classList.remove("on", "out"); el.classList.add("show");
        el.querySelectorAll(".w3").forEach((w, j) => setTimeout(() => w.classList.add("on"), 60 + j*300)); if(caps[ci][3]) setTimeout(() => sub.classList.add("on"), 1000); } }, 480); }
    if(e > END){ finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  function finish(){
    if(done) return; done = true; cancelAnimationFrame(raf);
    try { localStorage.setItem("chartside_intro_v1", "1"); } catch {}
    const a = box.animate ? box.animate([{opacity:1},{opacity:0}], {duration:1200, easing:"cubic-bezier(.4,0,.2,1)"}) : null;
    const end = () => { box.classList.remove("on"); removeEventListener("resize", size); };
    if(a) a.finished.then(end).catch(end); else end();
  }
  $("iskip").onclick = finish;
  box.onclick = ev => { if(ev.target === box || ev.target === cv) finish(); };
  raf = requestAnimationFrame(frame);
}
$("introBtn").addEventListener("click", () => playIntro(true));

// ---------- voice: "Entering Live Trade Cortex" ----------
let ukVoice = null;
function pickVoice(){
  if(!("speechSynthesis" in window)) return null;
  const vs = speechSynthesis.getVoices(), gb = vs.filter(v => /en[-_]GB/i.test(v.lang));
  const fem = /female|serena|kate|martha|stephanie|hazel|libby|sonia|susan|fiona|amy|emma|maisie|mia|google uk english female/i, male = /\bmale\b|daniel|george|arthur|oliver|ryan|thomas|alfie|noah/i;
  return gb.find(v => fem.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i,""))) || gb.find(v => !male.test(v.name)) || gb[0] || null;
}
if("speechSynthesis" in window){ ukVoice = pickVoice(); speechSynthesis.onvoiceschanged = () => { ukVoice = pickVoice(); }; }
function sayCortex(){
  if(!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Entering Live Trade Cortex");
    u.lang = "en-GB"; u.rate = 0.96; u.pitch = 1.1; u.volume = 1;
    const v = ukVoice || pickVoice(); if(v) u.voice = v;
    speechSynthesis.speak(u);
  } catch {}
}

// ---------- HardSmoke's Battle of the Bots ----------
const fmtN = (n, d=0) => (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {maximumFractionDigits:d, minimumFractionDigits:d});
function battleDemo(){
  const CB = false, T = TF[S.tf], cur = curStart(), ck = `${CB ? "c" : "b"}-${S.asset}-${S.tf}-${cur}`;
  if(battleDemo.ck === ck) return battleDemo.v;
  const roster = CB ? [["Nova",""],["Redline",""],["Kai Tides",""],["Marlowe",""],["Pip Queen",""],["Zed Momentum",""]] : [...DEMO_BOTS.map(b => [b.name, b.by.replace(/^by /,"")]), ["GridReaper","Quiet Mike (demo)"], ["ArbWolf","gridlord (demo)"], ["Pulse9","theta_tina (demo)"]];
  const skill = [.62,.57,.54,.51,.59,.47];
  let seed = 918273 + S.asset.charCodeAt(0)*97 + Math.round(T/60000); const r = () => (seed = seed*16807 % 2147483647)/2147483647;
  const n = Math.min(700, Math.floor(8*86400000/T)), bots = {}, next = {};
  roster.forEach(([name,by]) => bots[name] = {key:name, name, by, caller:CB, hist:[], calls:{}}); const resMap = {}; if(CB) seed += 4242;
  for(let i = n; i >= 1; i--){ const start = cur - i*T, res = r() < .5 ? "up" : "down"; resMap[start] = res;
    roster.forEach(([name], j) => { if(r() < .85 || name === "ArbWolf" || name === "DeltaFlow"){ const d = r() < skill[j] ? res : (res === "up" ? "down" : "up"); bots[name].hist.push({start, d, res}); bots[name].calls[start] = d; } }); }
  roster.forEach(([name], j) => { bots[name].calls[cur] = (r() + j*.29) % 1 < .5 ? "up" : "down"; });
  roster.forEach(([name], j) => { if(r() < .8){ next[name] = (r() + j*.37) % 1 < .5 ? "up" : "down"; bots[name].calls[cur + T] = next[name]; } });
  battleDemo.ck = ck; battleDemo.v = {bots, next, res:resMap}; return battleDemo.v;
}
function battleLive(){
  const bots = {}, next = {}, nxt = curStart() + TF[S.tf], CB = false;
  for(const d of Object.values(S.callDocs || {})){
    if(!d.rounds) continue; const rs = (S.resDocs || {})[`${d.asset}-${d.tf}-${d.day}`];
    for(const [st, entries] of Object.entries(d.rounds)){
      const start = +st, res = rs && rs.r ? rs.r[st] : undefined;
      for(const e of Object.values(entries)){
        if(!valid(e, start)) continue;
        if(CB ? !(e.s === "caller" && isVerified(e.a)) : e.s !== "bot") continue;
        const key = CB ? `c~${e.a}` : `${e.a}~${slug(e.l || "bot")}`, b = bots[key] || (bots[key] = CB ? {key, name:S.nameCache[e.a] || "Caller", a:e.a, caller:true, hist:[], calls:{}} : {key, name:e.l || "Unnamed bot", a:e.a, hist:[], calls:{}});
        b.calls[start] = e.d;
        if(start === nxt) next[key] = e.d;
        else if(res === "up" || res === "down") b.hist.push({start, d:e.d, res});
      }
    }
  }
  Object.values(bots).forEach(b => b.hist.sort((x,y) => x.start - y.start));
  return {bots, next};
}
function battleData(){
  const src = mergeBB((S.demo || !db) ? battleDemo() : battleLive());
  const cutoff = Date.now() - (S.bPeriod === "24h" ? 86400000 : 7*86400000);
  const rows = Object.values(src.bots).map(b => {
    const h = b.hist.filter(x => x.start >= cutoff), w = h.filter(x => x.d === x.res).length;
    let sk = 0, sw = null; for(let i = b.hist.length - 1; i >= 0; i--){ const ok = b.hist[i].d === b.hist[i].res; if(sw === null) sw = ok; if(ok !== sw) break; sk++; }
    return {...b, n:h.length, w, l:h.length - w, pct: h.length ? w/h.length : 0, sw, sk, next: src.next[b.key] || null};
  });
  const roster = rosterList();
  let out;
  if(roster.length){
    out = roster.map(en => rows.find(x => (en.key && x.key === en.key)) || rows.find(x => slug(x.name) === slug(en.name))
      || {key:"r~" + slug(en.name), name:en.name, by:en.by || "", hist:[], calls:{}, n:0, w:0, l:0, pct:0, sw:null, sk:0, next:null});
    out = out.filter((x, i, a) => a.findIndex(y => y.key === x.key) === i);
  } else out = rows.filter(x => x.n || x.next);
  rows.length = 0; rows.push(...out);
  rows.sort((x,y) => (y.n >= 5) - (x.n >= 5) || y.pct - x.pct || y.n - x.n);
  return {rows, src, cutoff};
}
function renderBattle(){
  if(!$("battle")) return;
  if(!S.bPick) S.bPick = [null, null]; if(!S.bPeriod) S.bPeriod = "7d";
  const {rows, src, cutoff} = battleData(), demo = S.demo || !db;
  $("bDemo").innerHTML = demo ? `<span class="chip ex">Demo figures</span>` : "";
  document.querySelectorAll("[data-bp]").forEach(b => b.setAttribute("aria-pressed", b.dataset.bp === S.bPeriod));
  const ranked = rows.filter(r => r.n >= 5), lead = ranked[0], hot = rows.filter(r => r.sw && r.sk).sort((a,b) => b.sk - a.sk)[0];
  const scored = new Set(); rows.forEach(r => r.hist.forEach(x => { if(x.start >= cutoff) scored.add(x.start); }));
  const nx = Object.values(src.next), up = nx.filter(d => d === "up").length, dn = nx.length - up;
  const by = r => r.by ? esc(r.by) : who(r.a);
  renderBotLineup(rows, src, ranked); renderBBLog(rows);
  $("bStats").innerHTML = `
    <div class="lst"><span class="k">Rounds scored</span><span class="v">${fmtN(scored.size)}</span></div>
    <div class="lst me"><span class="k">Leader</span><span class="v">${lead ? esc(lead.name) : "—"}</span><span class="s">${lead ? Math.round(lead.pct*100) + "% · " + lead.w + "–" + lead.l : "needs 5 scored rounds"}</span></div>
    <div class="lst"><span class="k">Hottest streak</span><span class="v">${hot ? "W" + hot.sk : "—"}</span><span class="s">${hot ? esc(hot.name) : "no win streaks yet"}</span></div>
    ${curRoundTile()}`;
  $("bStandN").textContent = S.bPeriod === "24h" ? "last 24h" : "last 7 days";
  $("bStand").innerHTML = rows.length ? rows.slice(0,12).map((r,i) => { const pct = Math.round(r.pct*100), rk = r.n >= 5 ? i + 1 : "–";
    return `<div class="brow${rk === 1 ? " top1" : ""}"><span class="rk">${rk}</span><span class="nm">${esc(r.name)}<small>${r.caller ? "verified caller" : r.by || r.a ? "by " + by(r) : Object.keys(r.calls || {}).length ? "logged in the round log" : "entered · waiting for its first call"}</small></span>
      <span class="wl">${r.w}–${r.l}</span><span class="pc">${r.n ? pct + "%" : "—"}</span>
      <span class="sk">${r.sk ? `<span class="stk ${r.sw ? "w" : "l"}">${r.sw ? "W" : "L"}${r.sk}</span>` : ""}</span>
      <span class="nx ${r.next || ""}" title="Call for the next round">${r.next === "up" ? "▲" : r.next === "down" ? "▼" : "·"}</span>
      <span class="bar"><i style="width:${pct}%"></i></span></div>`; }).join("")
    : `<div class="cempty">${false ? `No caller calls scored for ${S.asset} ${S.tf} yet. Verified callers join the face-off when they post round calls.` : `No bot calls scored for ${S.asset} ${S.tf} yet. Bots join the battle when their creators post final calls in the Bot console.`}</div>`;
  const F = foNames(), foEd = bbEditable();
  const known = [...new Set([...rows.map(r => r.name), ...Object.values(src.bots).map(b => b.name), ...rosterList().map(e => e.name)])];
  const ksig = known.join("|"); if(ksig !== renderBattle.ksig){ renderBattle.ksig = ksig; $("foKnown").innerHTML = known.map(n => `<option value="${esc(n)}"></option>`).join(""); }
  ["bA","bB"].forEach((id, i) => { const el = $(id); el.readOnly = !foEd; if(document.activeElement !== el) el.value = i ? F.b : F.a; });
  const FU = foUrls(); ["bAu","bBu"].forEach((id, i) => { const el = $(id); el.readOnly = !foEd; el.hidden = !foEd && !(i ? FU.b : FU.a); if(document.activeElement !== el) el.value = i ? FU.b : FU.a; });
  const A = F.a ? entityOf(F.a, rows, src) : null, B = F.b ? entityOf(F.b, rows, src) : null;
  { const t = $("vxKindT"); if(t) t.textContent = battleTitle(); }
  $("bLive").innerHTML = battleTracker(rows, src); renderFoLog(); renderPromo(rows, src); renderVortex(rows, src); renderScreensCtl(rows, src); if(!$("vxFs").hidden) renderVxFs();
  $("bH2H").innerHTML = faceOff(A, B, cutoff);
  const lr = $("foLog"); if(lr) lr.hidden = false;
  fillNames($("battle"));
}
// ---- battle roster: the bots entered in the battle ----
S.roster = null; S.rosterC = null; S.rosterLocal = []; S.rosterLocalC = [];
const rosterEditable = () => (S.demo || !db) ? true : isAdmin;
function rosterList(){ const C = false; return (S.demo || !db) ? (C ? S.rosterLocalC : S.rosterLocal) : ((C ? S.rosterC : S.roster) || []); }
async function saveRoster(list){
  const C = false;
  if(S.demo || !db){ if(C) S.rosterLocalC = list; else S.rosterLocal = list; renderBattle(); return true; }
  if(!isAdmin) return false;
  const ok = await act(() => mergeWrite(db.doc("config/battleRoster"), {[C ? "callers" : "bots"]:list, t:Date.now()}));
  if(ok){ if(C) S.rosterC = list; else S.roster = list; renderBattle(); } return ok;
}
function curTarget(){
  const L = bbData(), cs = curStart(), prevSt = cs - BB_T;
  const k = L.kx && L.kx[cs]; if(k && Number.isFinite(+k.strike) && k.strike !== null) return {v:+k.strike, src:"Kalshi"};
  const m = L.tgt && L.tgt[cs]; if(Number.isFinite(+m) && m !== null) return {v:+m, src:"entered"};
  const p = L.kx && L.kx[prevSt]; if(p && Number.isFinite(+p.final) && p.final !== null) return {v:+p.final, src:"Kalshi"};
  return null;
}
function curRoundTile(){
  const cs = curStart(), T = BB_T, t = curTarget(), ed = bbEditable();
  const tgt = S.tgtEdit ? `<form class="tgtf" id="tgtForm"><input type="text" inputmode="decimal" id="tgtIn" placeholder="e.g. 83456.46" aria-label="Target price"><button class="btn sm" type="submit">Set</button><button class="btn ghost sm" type="button" data-tgtx>×</button></form>`
    : t ? `Target <b class="tgtv">${usd0(t.v)}</b> <em>${t.src}</em>${ed ? ` <button type="button" class="tgtb" data-tgt>edit</button>` : ""}`
    : `Target not in yet${ed ? ` <button type="button" class="tgtb" data-tgt>enter</button>` : ""}`;
  return `<div class="lst bcr"><span class="k" title="${esc(tLocal(cs))}–${esc(tLocal(cs + T))}">Current round</span><span class="v"><span class="bEnd">${mmss(cs + T - Date.now())}</span> <small>left</small></span><span class="s">${tgt}</span></div>`;
}
document.addEventListener("click", e => {
  if(e.target.closest("[data-tgt]")){ S.tgtEdit = true; renderBattle(); setTimeout(() => { const i = $("tgtIn"); if(i) i.focus(); }, 0); }
  else if(e.target.closest("[data-tgtx]")){ S.tgtEdit = false; renderBattle(); }
});
document.addEventListener("submit", async e => {
  if(e.target.id !== "tgtForm") return; e.preventDefault();
  const v = parseFloat(String($("tgtIn").value).replace(/[$,\s]/g, "")); if(!Number.isFinite(v) || v <= 0) return toast("Enter the target price, e.g. 83456.46");
  const cs = curStart(); S.tgtEdit = false;
  if(S.demo || !db){ S.bbLocal.tgt = {...(S.bbLocal.tgt || {}), [cs]: v}; renderBattle(); return; }
  if(!isAdmin) return;
  const day = dayOf(cs), D = S.bbDocs[day] || (S.bbDocs[day] = {day}); D.tgt = {...(D.tgt || {}), [cs]: v}; renderBattle();
  await act(() => mergeWrite(db.doc("config/bb-" + day), {day, tgt:{[cs]: v}}));
});
function renderBotLineup(rows, src, ranked){
  const list = rosterList(), ed = rosterEditable(), auto = !list.length;
  const known = Object.values(src.bots).filter(b => !list.some(en => slug(en.name) === slug(b.name)));
  const chips = rows.map((r, i) => { const sl = slug(r.name), eu = (list.find(en => slug(en.name) === sl) || {}).url || "", canEd = ed && !auto;
    return `<label class="bchip bf"><span class="i">${i + 1}</span><span class="fof"><input type="text" ${canEd ? `data-rname="${esc(sl)}"` : "readonly"} maxlength="40" value="${esc(r.name)}" aria-label="Bot ${i + 1} name"><input type="url" ${canEd ? `class="rurl" data-rurl="${esc(sl)}" placeholder="Stream link (optional)"` : `readonly placeholder="${auto ? "" : "No stream link"}"`} maxlength="300" value="${esc(eu)}" aria-label="Stream link for ${esc(r.name)}"></span>${canEd ? `<button type="button" class="bfx" data-rdel="${esc(sl)}" aria-label="Remove ${esc(r.name)}" title="Remove">×</button>` : "<span></span>"}</label>`; }).join("");
  { const ae0 = document.activeElement; if(ae0 && ae0.dataset && ae0.dataset.rname){ const kn = {sl:ae0.dataset.rname, v:ae0.value, a:ae0.selectionStart, b:ae0.selectionEnd}; setTimeout(() => { const u = document.querySelector(`[data-rname="${CSS.escape(kn.sl)}"]`); if(u){ u.value = kn.v; u.focus(); try { u.setSelectionRange(kn.a, kn.b); } catch {} } }, 0); } }
  const prevIn = $("rEditIn"), keep = prevIn ? {v:prevIn.value, f:document.activeElement === prevIn, a:prevIn.selectionStart, b:prevIn.selectionEnd} : null;
  const addIn = $("bAddName"), keepAdd = addIn ? {v:addIn.value, f:document.activeElement === addIn} : null;
  const ae = document.activeElement, keepUrl = ae && ae.dataset && ae.dataset.rurl ? {sl:ae.dataset.rurl, v:ae.value, a:ae.selectionStart, b:ae.selectionEnd} : null, addU = $("bAddUrl"), keepAddU = addU ? {v:addU.value, f:ae === addU} : null;
  setTimeout(() => { if(keepUrl){ const u = document.querySelector(`[data-rurl="${CSS.escape(keepUrl.sl)}"]`); if(u){ u.value = keepUrl.v; u.focus(); try { u.setSelectionRange(keepUrl.a, keepUrl.b); } catch {} } } const k = $("bAddUrl"); if(k && keepAddU){ k.value = keepAddU.v; if(keepAddU.f) k.focus(); } }, 0);
  setTimeout(() => { const i = $("rEditIn"); if(i && keep){ i.value = keep.v; if(keep.f){ i.focus(); try { i.setSelectionRange(keep.a, keep.b); } catch {} } } const j = $("bAddName"); if(j && keepAdd){ j.value = keepAdd.v; if(keepAdd.f) j.focus(); } }, 0);
  const CB = isCallerBattle(), kindSeg = ed ? `<div class="bkind" role="group" aria-label="Battle type"><span>Battle type</span><button type="button" data-bkind="bots" aria-pressed="${!CB}">🤖 Bots battle</button><button type="button" data-bkind="callers" aria-pressed="${CB}">🎙 Callers face-off</button></div>` : "";
  const knownL = CB ? callerDir().map(c => ({name:(c.name || "").replace(/ \(demo\)$/, "")})) : known;
  $("bRoster").innerHTML = kindSeg + `<div class="rh"><span class="k">Bots in the battle</span><span class="v">${rows.length}</span><span class="s">${ranked.length} ranked · ${auto ? `showing every bot with calls until you enter your lineup` : `type a name in each line, then press Enter`}</span></div>
    <div class="bchips">${chips || `<span class="fine">No ${false ? "callers" : "bots"} entered yet.</span>`}</div>
    ${ed ? `<form class="bchips bfaddf" id="bAddForm" autocomplete="off"><label class="bchip bf bnew"><span class="i">+</span><span class="fof"><input type="text" id="bAddName" maxlength="40" list="bKnown" placeholder="Add a bot: type its name, then press Enter" aria-label="New bot name"><input type="url" id="bAddUrl" maxlength="300" placeholder="Stream link (optional)" aria-label="Stream link for the new bot"></span><button class="bfadd" type="submit">Add</button></label><datalist id="bKnown">${knownL.map(b => `<option value="${esc(b.name)}"></option>`).join("")}</datalist></form>${!auto ? `<div class="bfclrw"><button class="bfclr" type="button" data-rclear>Clear list</button></div>` : ""}` : ""}`;
}
async function renameBot(oldSl, newName){
  const list = rosterList().slice(), i = list.findIndex(en => slug(en.name) === oldSl); if(i < 0) return false;
  const newSl = slug(newName); if(!newSl) { toast("Type a name."); return false; }
  if(newSl !== oldSl && list.some(en => slug(en.name) === newSl)){ toast(`${newName} is already in the battle.`); return false; }
  const nu = $("rEditUrl") ? $("rEditUrl").value.trim().slice(0, 300) : (list[i].url || "");
  if(nu && !/^https:\/\//.test(nu)){ toast("Stream links start with https://"); return false; }
  list[i] = nu ? {name:newName, url:nu} : {name:newName};
  if(newSl !== oldSl){
    if(S.demo || !db){ Object.values(S.bbLocal.calls).forEach(m => { if(m && m[oldSl] !== undefined){ m[newSl] = m[oldSl]; delete m[oldSl]; } }); }
    else {
      for(const [day, D] of Object.entries(S.bbDocs)){
        const patch = {}; Object.entries(D.calls || {}).forEach(([st, m]) => { if(m && (m[oldSl] === "up" || m[oldSl] === "down")) patch[st] = {[newSl]: m[oldSl], [oldSl]: null}; });
        if(!Object.keys(patch).length) continue;
        Object.entries(patch).forEach(([st, v]) => { D.calls[st] = {...D.calls[st], ...v}; });
        if(!(await act(() => mergeWrite(db.doc("config/bb-" + day), {calls: patch})))) return false;
      }
    }
  }
  return saveRoster(list);
}
$("bRoster").addEventListener("submit", async e => {
  const f = e.target.closest("[data-redit]");
  if(f){ e.preventDefault(); const nm = $("rEditIn").value.trim().replace(/\s+/g, " ").slice(0, 40); if(!nm) return toast("Type a name.");
    const old = f.dataset.redit; if(await renameBot(old, nm)){ S.rEdit = null; renderBattle(); toast(`Saved as ${nm}`); } return; }
  if(e.target.id !== "bAddForm") return; e.preventDefault();
  const inp = $("bAddName"), name = inp.value.trim().replace(/\s+/g, " ").slice(0, 40); if(!name) return toast("Type a bot name first.");
  const list = rosterList().slice(); if(list.some(en => slug(en.name) === slug(name))) return toast(`${name} is already in the battle.`);
  const src = (S.demo || !db) ? battleDemo() : battleLive(), hit = Object.values(src.bots).find(b => slug(b.name) === slug(name));
  const au = $("bAddUrl") ? $("bAddUrl").value.trim().slice(0, 300) : ""; if(au && !/^https:\/\//.test(au)) return toast("Stream links start with https://");
  list.push(hit ? {name:hit.name, key:hit.key, ...(au ? {url:au} : {})} : {name, ...(au ? {url:au} : {})});
  inp.value = ""; if($("bAddUrl")) $("bAddUrl").value = "";
  if(await saveRoster(list)){ toast(`${hit ? hit.name : name} entered`); setTimeout(() => { const i = $("bAddName"); if(i) i.focus(); }, 0); }
});
$("bRoster").addEventListener("keydown", e => { if(e.key === "Escape" && S.rEdit){ S.rEdit = null; renderBattle(); } });
$("bRoster").addEventListener("click", async e => {
  const st = e.target.closest("[data-rstart]"), cx = e.target.closest("[data-rcancel]");
  if(st){ S.rEdit = st.dataset.rstart; renderBattle(); setTimeout(() => { const i = $("rEditIn"); if(i){ i.focus(); i.select(); } }, 0); return; }
  if(cx){ S.rEdit = null; renderBattle(); return; }
  const d = e.target.closest("[data-rdel]"), c = e.target.closest("[data-rclear]");
  if(d){ await saveRoster(rosterList().filter(en => slug(en.name) !== d.dataset.rdel)); return; }
  if(c){ await saveRoster([]); }
});
// ---- round log: record each lineup bot's up/down call for every Kalshi BTC 15m round ----
const BB_T = 15*60000;
S.bbDocs = {}; S.bbLocal = {calls:{}, res:{}, kx:{}, tgt:{}, gain:{}}; S.foOff = 0; S.tgtEdit = false; S.bbOff = 0; S.bbWar = null; S.bbWarLocal = null; S.bbLen = 8; let bbUnsubs = [], bbDays = "";
const bbEditable = () => (S.demo || !db) ? true : isAdmin;
const bbWar = () => (S.demo || !db) ? S.bbWarLocal : S.bbWar;
async function bbWarSet(patch){
  if(S.demo || !db){ S.bbWarLocal = patch ? {...(S.bbWarLocal || {}), ...patch} : null; renderBattle(); return true; }
  if(!isAdmin) return false;
  S.bbWar = {...(S.bbWar || {}), ...patch}; renderBattle();
  return act(() => mergeWrite(db.doc("config/bbBattle"), patch));
}
function bbData(){
  if(S.demo || !db) return S.bbLocal;
  const out = {calls:{}, res:{}, kx:{}, tgt:{}, gain:{}};
  Object.values(S.bbDocs).forEach(d => { Object.entries(d.calls || {}).forEach(([st, m]) => { out.calls[st] = {...(out.calls[st] || {}), ...m}; }); Object.assign(out.res, d.res || {}); Object.assign(out.kx, d.kx || {}); Object.assign(out.tgt, d.tgt || {}); Object.entries(d.gain || {}).forEach(([st, m]) => { out.gain[st] = {...(out.gain[st] || {}), ...m}; }); });
  return out;
}
function subscribeBB(){
  if(!db) return;
  const days = Array.from({length:9}, (_, i) => dayOf(Date.now() - i*86400000)), sig = days.join(",");
  if(sig === bbDays) return; bbDays = sig;
  bbUnsubs.forEach(u => { try { u(); } catch {} }); bbUnsubs = [];
  days.forEach(day => bbUnsubs.push(db.doc("config/bb-" + day).onSnapshot(sn => { if(sn.exists) S.bbDocs[day] = sn.data(); else delete S.bbDocs[day]; renderBattle(); }, () => {})));
}
async function bbSet(kind, st, who2, val){
  if(S.demo || !db){
    const L = S.bbLocal;
    if(kind === "call"){ L.calls[st] = {...(L.calls[st] || {}), [who2]: val}; } else if(kind === "gain"){ L.gain[st] = {...(L.gain[st] || {}), [who2]: val}; } else L.res[st] = val;
    renderBattle(); return;
  }
  if(!isAdmin) return;
  const day = dayOf(+st), patch = kind === "call" ? {day, calls:{[st]:{[who2]:val}}} : kind === "gain" ? {day, gain:{[st]:{[who2]:val}}} : {day, res:{[st]:val}};
  const D = S.bbDocs[day] || (S.bbDocs[day] = {day, calls:{}, res:{}});
  if(kind === "call"){ D.calls = D.calls || {}; D.calls[st] = {...(D.calls[st] || {}), [who2]:val}; } else if(kind === "gain"){ D.gain = D.gain || {}; D.gain[st] = {...(D.gain[st] || {}), [who2]:val}; } else { D.res = D.res || {}; D.res[st] = val; }
  renderBattle();
  await act(() => mergeWrite(db.doc("config/bb-" + day), patch));
}
const kxRes = (L, t) => { const k = L.kx && L.kx[t]; return k && (k.result === "up" || k.result === "down") ? k.result : null; };
const usd0 = v => Number.isFinite(+v) && v !== null ? "$" + (+v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : "—";
function mergeBB(src){
  const roster = rosterList(); if(!roster.length || S.asset !== "BTC" || S.tf !== "15m") return src;
  const L = bbData(), now = Date.now(), nxt = curStart() + BB_T;
  const bots = {...src.bots}, next = {...src.next}, manualRes = {};
  Object.entries(L.res || {}).forEach(([st, v]) => { if(v === "up" || v === "down") manualRes[st] = v; });
  Object.keys(L.kx || {}).forEach(st => { const k = kxRes(L, st); if(k) manualRes[st] = k; });
  const resOf = t => manualRes[t] || (src.res ? src.res[t] : resultFor(t));
  roster.forEach(en => {
    const sl = slug(en.name), b = Object.values(bots).find(x => slug(x.name) === sl), key = b ? b.key : "r~" + sl;
    const calls = {...(b ? b.calls : {})}, hm = new Map((b ? b.hist : []).map(h => [h.start, h])); let touched = false;
    for(const [st, m] of Object.entries(L.calls || {})){
      const d = m && m[sl]; if(d !== "up" && d !== "down") continue;
      touched = true; const t = +st; calls[t] = d;
      const r = resOf(t); if((r === "up" || r === "down") && t + BB_T <= now) hm.set(t, {start:t, d, res:r});
      if(t === nxt) next[key] = d;
    }
    if(touched) bots[key] = {...(b || {key, name:en.name, by:""}), calls, hist:[...hm.values()].sort((x,y) => x.start - y.start)};
  });
  return {bots, next, res: src.res ? {...src.res, ...manualRes} : null, manualRes};
}
function renderBBLog(rows){
  const box = $("bbLog"); if(!box) return;
  const roster = [...rosterList()];
  const ed = bbEditable(), L = bbData(), cur = curStart(), now = Date.now();
  const W = bbWar(), warOn = !!(W && W.first && W.rounds);
  const lenSel = "";
  const warCtl = !ed ? "" : (warOn && W.active) ? `<button class="btn ghost sm" type="button" data-bbwar="end">End battle</button>`
    : `${lenSel}<button class="btn sm" type="button" data-bbwar="start">Start battle</button>${warOn ? `<button class="btn ghost sm" type="button" data-bbwar="clear">Clear</button>` : ""}`;
  const hdr0 = `<div class="rh"><h4>Bot Battle</h4><span class="s">${ed ? "Tap ▲ or ▼ to record each " + "bot" + "'s call. Results fill in from Kalshi about hourly; mark one by hand to see it sooner." : "Each bot's up or down call, round by round. Results come from Kalshi."}</span>
    <div class="nav">${warOn ? "" : `<button class="btn ghost sm" type="button" data-bbnav="1">‹ Earlier</button><button class="btn ghost sm" type="button" data-bbnav="-1"${S.bbOff ? "" : " disabled"}>Later ›</button>${S.bbOff ? `<button class="btn ghost sm" type="button" data-bbnav="0">Now</button>` : ""}`}${warCtl}</div></div>`;
  const hdr = hdr0 + (ed ? rndPicker("bb", S.bbLen || 8, warOn && W.active ? W.rounds : 0) : "");
  if(!roster.length){ box.innerHTML = hdr + `<div class="cempty">Enter bots in the lineup above to start logging their calls.</div>`; return; }
  const last = cur + BB_T - S.bbOff*6*BB_T;
  const stopAt = warOn && !W.active ? (W.endedAt || now) : Infinity;
  const cols = warOn ? Array.from({length:W.rounds}, (_, k) => W.first + k*BB_T).filter(t => t < stopAt || t < W.first + BB_T) : Array.from({length:8}, (_, k) => last - (7 - k)*BB_T);
  const resOf = t => { const k = kxRes(L, t); if(k) return k; const m = L.res && L.res[t]; if(m === "up" || m === "down") return m; return (S.asset === "BTC" && S.tf === "15m") ? resultFor(t) : undefined; };
  const stOf = t => t === cur + BB_T ? ["next","NEXT"] : t === cur ? ["live","LIVE"] : t > cur ? ["next","OPEN"] : ["done", "SETTLED"];
  const board = roster.map(en => { const sl = slug(en.name); let w = 0, l = 0, nc = 0, pend = 0;
    cols.forEach(t => { const d = L.calls && L.calls[t] ? L.calls[t][sl] : null, r = resOf(t), ended = t + BB_T <= now;
      if(!ended) return; if(r !== "up" && r !== "down"){ pend++; return; } if(d !== "up" && d !== "down"){ nc++; return; } if(d === r) w++; else l++; });
    return {sl, name:en.name, w, l, nc, pend}; }).sort((a,b) => b.w - a.w || a.l - b.l || a.name.localeCompare(b.name));
  const tally = sl => { let w = 0, l = 0; Object.entries(L.calls || {}).forEach(([st, m]) => { const d = m && m[sl], r = resOf(+st); if((d === "up" || d === "down") && (r === "up" || r === "down") && +st + BB_T <= now){ if(d === r) w++; else l++; } }); return [w, l]; };
  const head = `<tr><th class="bn">Bot</th>${cols.map((t, k) => { const [c, lab] = stOf(t); return `<th>${warOn ? `<span class="rn">R${k + 1}</span>` : ""}<span class="t">${esc(tLocal(t))}</span>${esc(tET(t))} ET<br><span class="st ${c}">${lab === "SETTLED" ? "ended " + esc(tLocal(t + BB_T)) : lab}</span></th>`; }).join("")}<th>W–L</th></tr>`;
  const body = roster.map(en => { const sl = slug(en.name), [w, l] = tally(sl);
    return `<tr><td class="bn" title="${esc(en.name)}">${esc(en.name)}${en.fo ? ` <em class="fotag">face-off</em>` : ""}</td>${cols.map(t => { const d = L.calls && L.calls[t] ? L.calls[t][sl] : null, r = resOf(t), settled = t + BB_T <= now && (r === "up" || r === "down");
      const cls = [t === cur ? "cur" : "", t === cur + BB_T ? "nx" : "", settled && d ? (d === r ? "hit" : "miss") : ""].join(" ").trim();
      const inner = ed ? `<span class="bbb"><button type="button" class="up${d === "up" ? " on" : ""}" data-bbc="${t}|${esc(sl)}|up" aria-label="${esc(en.name)} up at ${esc(tLocal(t))}">▲</button><button type="button" class="down${d === "down" ? " on" : ""}" data-bbc="${t}|${esc(sl)}|down" aria-label="${esc(en.name)} down at ${esc(tLocal(t))}">▼</button></span>`
        : d ? `<span class="bbv ${d}">${d === "up" ? "▲ UP" : "▼ DN"}</span>` : `<span style="color:var(--ink-3)">·</span>`;
      return `<td class="${cls}">${inner}</td>`; }).join("")}<td class="tot">${warOn ? (() => { const x = board.find(b => b.sl === sl); return x ? x.w + "–" + x.l : "0–0"; })() : w + "–" + l}</td></tr>`; }).join("");
  const resRow = `<tr class="resrow"><td class="bn">Result</td>${cols.map(t => { const r = resOf(t), ended = t + BB_T <= now, k = L.kx && L.kx[t];
      if(k && kxRes(L, t)) return `<td class="kx"><span class="bbv ${r}">${r === "up" ? "▲ UP" : "▼ DN"}</span><span class="kxt">Kalshi</span><small>target ${usd0(k.strike)}</small><small>final ${usd0(k.final)}</small></td>`;
      if(ed && ended) return `<td><span class="bbb"><button type="button" class="up${r === "up" ? " on" : ""}" data-bbr="${t}|up" aria-label="Result up at ${esc(tLocal(t))}">▲</button><button type="button" class="down${r === "down" ? " on" : ""}" data-bbr="${t}|down" aria-label="Result down at ${esc(tLocal(t))}">▼</button></span></td>`;
      return `<td>${r === "up" || r === "down" ? `<span class="bbv ${r}">${r === "up" ? "▲ UP" : "▼ DN"}</span>` : `<span style="color:var(--ink-3)">${ended ? "pending" : "—"}</span>`}</td>`; }).join("")}<td></td></tr>`;
  const note = (S.asset !== "BTC" || S.tf !== "15m") ? `<div class="fine">The market is set to ${esc(S.asset)} ${esc(S.tf)}. Switch it to BTC 15m so the standings and battle count these logged calls.</div>` : "";
  let top = "";
  if(warOn){
    const endAt = W.first + W.rounds*BB_T, settledAll = cols.every(t => t + BB_T > now ? false : (resOf(t) === "up" || resOf(t) === "down"));
    const over = !W.active || (now >= endAt && settledAll), before = now < W.first;
    const liveK = cols.findIndex(t => t === cur), doneK = cols.filter(t => t + BB_T <= now).length;
    const status = over ? `<span class="bt-st fin">FINAL</span><b>${doneK} of ${W.rounds} rounds</b>` : before ? `<span class="bt-st soon">UP NEXT</span><b>${W.rounds} rounds</b><span class="bt-clock">Starts in <b class="bbStart" data-at="${W.first}">${mmss(W.first - now)}</b></span>`
      : `<span class="bt-st live">● LIVE</span><b>Round ${liveK >= 0 ? liveK + 1 : doneK} of ${W.rounds}</b><span class="bt-clock">Round ends in <b class="bEnd">${mmss(cur + BB_T - now)}</b></span>`;
    const topW = board.length ? board[0].w : 0, leaders = board.filter(b => b.w === topW && topW > 0);
    const banner = over && leaders.length ? `<div class="bt-win">${leaders.length > 1 ? "Tie · " + leaders.map(b => esc(b.name)).join(" & ") : "Winner · " + esc(leaders[0].name)} · ${topW} victor${topW === 1 ? "y" : "ies"}</div>` : "";
    const pend = board.length ? board[0].pend : 0;
    top = `<div class="bbwar"><div class="bt-top">${status}<span>Kalshi BTC 15M</span></div>${banner}
      <div class="bbboard"><div class="bbr h"><span>#</span><span>Bot</span><span>Victories</span><span>Losses</span><span>No call</span><span>Win %</span></div>
      ${board.map((b, i) => `<div class="bbr${b.w === topW && topW > 0 ? " lead" : ""}"><span class="rk">${i + 1}</span><span class="nm">${esc(b.name)}${b.w === topW && topW > 0 ? `<em>${over ? "WINNER" : "LEADS"}</em>` : ""}</span><span class="vi">${b.w}</span><span>${b.l}</span><span>${b.nc}</span><span>${b.w + b.l ? Math.round(b.w/(b.w + b.l)*100) + "%" : "—"}</span></div>`).join("")}</div>
      ${pend ? `<div class="fine">${pend} ended round${pend === 1 ? "" : "s"} waiting for a result.</div>` : ""}</div>`;
  }
  box.innerHTML = hdr + top + `<div class="bbw"><table class="bbt" style="min-width:${Math.max(720, 170 + cols.length*86)}px">${head}${body}${resRow}</table></div>` + note;
}
$("bbLog").addEventListener("change", e => { if(e.target.id === "bbLen") S.bbLen = +e.target.value; });
$("bbLog").addEventListener("click", e => {
  const n = e.target.closest("[data-bbnav]"), c = e.target.closest("[data-bbc]"), r = e.target.closest("[data-bbr]");
  if(n){ const v = +n.dataset.bbnav; S.bbOff = v === 0 ? 0 : Math.max(0, S.bbOff + v); renderBattle(); return; }
  const wb = e.target.closest("[data-bbwar]");
  if(wb && bbEditable()){ const k = wb.dataset.bbwar;
    if(k === "start"){ if(!rosterList().length) return toast("Enter the bots in the lineup first."); bbWarSet({rounds:S.bbLen || 8, first:curStart() + BB_T, active:true, endedAt:null, t:Date.now()}).then(ok => ok && toast(`Battle set: ${S.bbLen} rounds, starting ${tLocal(curStart() + BB_T)}`)); }
    else if(k === "end") bbWarSet({active:false, endedAt:Date.now()});
    else if(k === "clear") bbWarSet(S.demo || !db ? null : {first:null, rounds:null, active:false});
    return; }
  if(!bbEditable()) return;
  const L = bbData();
  if(c){ const [st, sl, dir] = c.dataset.bbc.split("|"), curV = L.calls && L.calls[st] ? L.calls[st][sl] : null; bbSet("call", st, sl, curV === dir ? null : dir); return; }
  if(r){ const [st, dir] = r.dataset.bbr.split("|"), curV = L.res ? L.res[st] : null; bbSet("res", st, null, curV === dir ? null : dir); }
});
setInterval(() => { if(db) subscribeBB(); }, 60000);
// ---- face-off entities: any two names (callers or bots), calls logged by hand or posted ----
S.fo = null; S.foLocal = {a:"ArbWolf", b:"DeltaFlow"};
S.foLocalC = {a:"Nova", b:"Redline"};
function foNames(){ const D = S.foDoc || {}; if(isCallerBattle()) return (S.demo || !db) ? S.foLocalC : {a:D.ca || "", b:D.cb || ""}; return (S.demo || !db) ? S.foLocal : (S.fo || {a:"", b:""}); }
async function foSave(a, b){
  a = String(a || "").trim().replace(/\s+/g, " ").slice(0, 40); b = String(b || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const C = isCallerBattle();
  if(S.demo || !db){ if(C) S.foLocalC = {a, b}; else S.foLocal = {a, b}; renderBattle(); return; }
  if(!isAdmin) return;
  if(C){ S.foDoc = {...(S.foDoc || {}), ca:a, cb:b}; renderBattle(); await act(() => mergeWrite(db.doc("config/faceoff"), {ca:a, cb:b, t:Date.now()})); return; }
  S.fo = {a, b}; renderBattle();
  await act(() => mergeWrite(db.doc("config/faceoff"), {a, b, t:Date.now()}));
}
function resAny(t, src){ const L = bbData(), k = kxRes(L, t); if(k) return k; const m = L.res && L.res[t]; if(m === "up" || m === "down") return m; if(src && src.res && src.res[t]) return src.res[t]; return resultFor(t); }
function entityOf(name, rows, src){
  const sl = slug(name), T = TF[S.tf], now = Date.now(), L = bbData();
  const r = rows.find(x => slug(x.name) === sl) || Object.values(src.bots).find(x => slug(x.name) === sl);
  const calls = {}; Object.entries((r && r.calls) || {}).forEach(([st, d]) => { calls[+st] = d; });
  Object.entries(L.calls || {}).forEach(([st, m]) => { const d = m && m[sl]; if(d === "up" || d === "down") calls[+st] = d; else if(m && m[sl] === null) delete calls[+st]; });
  const hist = []; Object.entries(calls).forEach(([st, d]) => { const t = +st, res = resAny(t, src); if((res === "up" || res === "down") && t + T <= now) hist.push({start:t, d, res}); });
  hist.sort((x,y) => x.start - y.start);
  let sk = 0, sw = null; for(let i = hist.length - 1; i >= 0; i--){ const ok = hist[i].d === hist[i].res; if(sw === null) sw = ok; if(ok !== sw) break; sk++; }
  return {key:"e~" + sl, sl, name, by: r ? r.by : "", a: r ? r.a : null, calls, hist, sw, sk, next: calls[curStart() + T] || null};
}
$("foForm").addEventListener("submit", e => { e.preventDefault(); foSave($("bA").value, $("bB").value); });
["bA","bB"].forEach(id => $(id).addEventListener("change", () => foSave($("bA").value, $("bB").value)));
async function foSaveUrls(){
  const a = $("bAu").value.trim().slice(0, 300), b = $("bBu").value.trim().slice(0, 300);
  if((a && !/^https:\/\//.test(a)) || (b && !/^https:\/\//.test(b))) return toast("Stream links start with https://");
  const C = isCallerBattle();
  if(S.demo || !db){ if(C) S.foUrlLocalC = {a, b}; else S.foUrlLocal = {a, b}; renderBattle(); return; }
  if(!isAdmin) return;
  if(C){ S.foDoc = {...(S.foDoc || {}), caUrl:a, cbUrl:b}; renderBattle(); await act(() => mergeWrite(db.doc("config/faceoff"), {caUrl:a, cbUrl:b})); return; }
  S.foUrl = {a, b}; renderBattle();
  await act(() => mergeWrite(db.doc("config/faceoff"), {aUrl:a, bUrl:b}));
}
["bAu","bBu"].forEach(id => $(id).addEventListener("change", foSaveUrls));
const gainOf = (st, sl) => { const g = bbData().gain; const v = g && g[st] ? g[st][sl] : null; return Number.isFinite(+v) && v !== null && v !== "" ? +v : null; };
function renderFoLog(){
  const box = $("foLog"); if(!box) return;
  const F = foNames(), ed = bbEditable(), L = bbData(), cur = curStart(), now = Date.now(), T = BB_T;
  const ents = [F.a, F.b].filter(Boolean).map((n, i) => ({name:n, sl:slug(n), side:i ? "b" : "a"}));
  const navBtns = `<span class="fonav"><button class="btn ghost sm" type="button" data-fonav="1">‹ Earlier</button><button class="btn ghost sm" type="button" data-fonav="-1"${S.foOff ? "" : " disabled"}>Later ›</button>${S.foOff ? `<button class="btn ghost sm" type="button" data-fonav="0">Now</button>` : ""}</span>`;
  const hdr = `<div class="rh"><h4>Face-off rounds · Kalshi BTC 15m</h4><span class="s">${ed ? "Record each contender's call and the % gain they made on every round." : "Each contender's call and % gain, round by round."}</span>
    <div class="nav">${battleTracker.bar || ""}</div></div>`;
  if(ents.length < 2){ $("foHead").innerHTML = hdr; $("foTable").innerHTML = `<div class="cempty">Type both contenders' names above to open their round log.</div>`; $("foStats").innerHTML = ""; return; }
  const BC = (S.demo || !db) ? (S.btFirstLocal ? {first:S.btFirstLocal, rounds:S.btRounds || 8, mode:S.btMode || "gain"} : null) : (() => { const R = foRun(); return R && R.first && R.asset === "BTC" && R.tf === "15m" ? R : null; })();
  const fmode = BC && FO_MODES[BC.mode] ? BC.mode : (S.btMode || "gain");
  const last = cur + T - S.foOff*6*T, cols = BC ? Array.from({length:BC.rounds}, (_, k) => BC.first + k*T) : Array.from({length:8}, (_, k) => last - (7 - k)*T);
  const colSet = new Set(cols.map(String));
  const resOf = t => resAny(t, null);
  const act0 = document.activeElement, keep = act0 && act0.classList && act0.classList.contains("gin") ? {id:act0.id, v:act0.value, a:act0.selectionStart, b:act0.selectionEnd} : null;
  const head = `<tr><th class="bn">Contender</th>${cols.map((t, k) => { const lab = t === cur ? `<span class="st live">LIVE</span>` : t > cur ? `<span class="st next">${t === cur + T ? "NEXT" : "OPEN"}</span>` : `<span class="st done">ended ${esc(tLocal(t + T))}</span>`; return `<th>${BC ? `<span class="rn">R${k + 1}</span>` : ""}<span class="t">${esc(tLocal(t))}</span>${esc(tET(t))} ET<br>${lab}</th>`; }).join("")}<th>Total</th></tr>`;
  const fmtG = v => v === null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + (+Math.abs(v).toFixed(2)) + "%";
  const body = ents.map(en => { let tot = 0, w = 0, l = 0;
    Object.entries(L.gain || {}).forEach(([st, m]) => { if(BC && !colSet.has(String(st))) return; const v = m ? m[en.sl] : null; if(Number.isFinite(+v) && v !== null && v !== "") tot += +v; });
    Object.entries(L.calls || {}).forEach(([st, m]) => { if(BC && !colSet.has(String(st))) return; const d = m && m[en.sl], r = resOf(+st); if((d === "up" || d === "down") && (r === "up" || r === "down") && +st + T <= now){ if(d === r) w++; else l++; } });
    return `<tr><td class="bn fo-${en.side}" title="${esc(en.name)}">${esc(en.name)}</td>${cols.map(t => { const d = L.calls && L.calls[t] ? L.calls[t][en.sl] : null, r = resOf(t), g = gainOf(t, en.sl), settled = t + T <= now && (r === "up" || r === "down");
      const cls = [t === cur ? "cur" : "", t === cur + T ? "nx" : "", settled && d ? (d === r ? "hit" : "miss") : ""].join(" ").trim();
      const gid = `g-${t}-${en.sl}`;
      const inner = ed ? `<span class="bbb"><button type="button" class="up${d === "up" ? " on" : ""}" data-bbc="${t}|${esc(en.sl)}|up" aria-label="${esc(en.name)} up at ${esc(tLocal(t))}">▲</button><button type="button" class="down${d === "down" ? " on" : ""}" data-bbc="${t}|${esc(en.sl)}|down" aria-label="${esc(en.name)} down at ${esc(tLocal(t))}">▼</button></span>
          <input class="gin${g > 0 ? " p" : g < 0 ? " n" : ""}" id="${esc(gid)}" data-gin="${t}|${esc(en.sl)}" type="text" inputmode="decimal" placeholder="% gain" value="${g === null ? "" : (g > 0 ? "+" : "") + g}" aria-label="${esc(en.name)} % gain at ${esc(tLocal(t))}">`
        : `${d ? `<span class="bbv ${d}">${d === "up" ? "▲ UP" : "▼ DN"}</span>` : `<span style="color:var(--ink-3)">·</span>`}<span class="gv${g > 0 ? " p" : g < 0 ? " n" : ""}">${fmtG(g)}</span>`;
      return `<td class="${cls}">${inner}</td>`; }).join("")}<td class="tot"><span class="gv${tot > 0 ? " p" : tot < 0 ? " n" : ""}">${fmtG(+tot.toFixed(2))}</span><br><small>${w}W · ${l}L</small></td></tr>`; }).join("");
  const resRow = `<tr class="resrow"><td class="bn">Kalshi result</td>${cols.map(t => { const r = resOf(t), k = L.kx && L.kx[t], ended = t + T <= now;
      return `<td>${r === "up" || r === "down" ? `<span class="bbv ${r}">${r === "up" ? "▲ UP" : "▼ DN"}</span>${k && k.strike ? `<small class="kxs">target ${usd0(k.strike)}</small>` : ""}` : `<span style="color:var(--ink-3)">${ended ? "pending" : t === cur && k && k.strike ? "target " + usd0(k.strike) : "—"}</span>`}</td>`; }).join("")}<td></td></tr>`;
  const [EA, EB] = ents, gl = [];
  Object.entries(L.gain || {}).forEach(([st, m]) => { if(!m || (BC && !colSet.has(String(st)))) return; const a = Number.isFinite(+m[EA.sl]) && m[EA.sl] !== null ? +m[EA.sl] : null, b = Number.isFinite(+m[EB.sl]) && m[EB.sl] !== null ? +m[EB.sl] : null; if(a !== null || b !== null) gl.push({t:+st, a, b}); });
  const sum = k => +gl.reduce((x, r) => x + (r[k] || 0), 0).toFixed(2), cnt = k => gl.filter(r => r[k] !== null).length;
  const ta = sum("a"), tb = sum("b"), na = cnt("a"), nb = cnt("b");
  const both = gl.filter(r => r.a !== null && r.b !== null), wonA = both.filter(r => r.a > r.b).length, wonB = both.filter(r => r.b > r.a).length;
  let best = null; gl.forEach(r => [["a", EA], ["b", EB]].forEach(([k, E]) => { if(r[k] !== null && (!best || r[k] > best.v)) best = {v:r[k], n:E.name, t:r.t}; }));
  let worst = null; gl.forEach(r => [["a", EA], ["b", EB]].forEach(([k, E]) => { if(r[k] !== null && (!worst || r[k] < worst.v)) worst = {v:r[k], n:E.name, t:r.t}; }));
  const gc = v => v > 0 ? "up" : v < 0 ? "dn" : "";
  const rightOf = sl => { let w = 0; cols.forEach(t => { const d = L.calls && L.calls[t] ? L.calls[t][sl] : null, r = resOf(t); if((d === "up" || d === "down") && d === r && t + T <= now) w++; }); return w; };
  const ra = rightOf(EA.sl), rb = rightOf(EB.sl);
  const scA = fmode === "calls" ? ra : fmode === "both" ? ra + wonA : ta, scB = fmode === "calls" ? rb : fmode === "both" ? rb + wonB : tb;
  const unit = fmode === "calls" ? "right calls" : fmode === "both" ? "pts" : "pts of gain";
  const tile = (cls, k, v, sub) => `<div class="lst ${cls}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${sub}</span></div>`;
  const tiles = (gl.length || ra || rb) ? `<div class="lstats fostats">
      ${tile("fa", esc(EA.name) + " total", `<span class="${gc(ta)}">${fmtG(ta)}</span>`, na ? `${fmtG(+(ta / na).toFixed(2))} avg · ${na} round${na === 1 ? "" : "s"}` : "no gains yet")}
      ${tile("fb", esc(EB.name) + " total", `<span class="${gc(tb)}">${fmtG(tb)}</span>`, nb ? `${fmtG(+(tb / nb).toFixed(2))} avg · ${nb} round${nb === 1 ? "" : "s"}` : "no gains yet")}
      ${tile("me", "Leader · " + FO_MODES[fmode], scA === scB ? "Level" : esc(scA > scB ? EA.name : EB.name), scA === scB ? "dead even" : `ahead by ${+Math.abs(scA - scB).toFixed(2)} ${unit}${fmode !== "gain" ? ` · ${scA}–${scB}` : ""}`)}
      ${fmode === "calls" ? tile("", "Right calls", `${ra}<small> – </small>${rb}`, `${esc(EA.name)} vs ${esc(EB.name)}`) : tile("", "Rounds won", `${wonA}<small> – </small>${wonB}`, `higher gain in ${both.length} shared round${both.length === 1 ? "" : "s"}`)}
      ${tile("", "Best round", best ? `<span class="${gc(best.v)}">${fmtG(best.v)}</span>` : "—", best ? `${esc(best.n)} · ${esc(tLocal(best.t))}${worst ? ` · worst ${fmtG(worst.v)} ${esc(worst.n)}` : ""}` : "")}
    </div>` : "";
  $("foHead").innerHTML = hdr; $("foTable").innerHTML = (BC ? "" : `<div class="fonavrow">${navBtns}</div>`) + `<div class="bbw"><table class="bbt fot">${head}${body}${resRow}</table></div>`; $("foStats").innerHTML = tiles;
  if(keep){ const i = document.getElementById(keep.id); if(i){ i.value = keep.v; i.focus(); try { i.setSelectionRange(keep.a, keep.b); } catch {} } }
}
$("foLog").addEventListener("click", e => {
  const n = e.target.closest("[data-fonav]"); if(n){ const v = +n.dataset.fonav; S.foOff = v === 0 ? 0 : Math.max(0, S.foOff + v); renderBattle(); return; }
  const c = e.target.closest("[data-bbc]"); if(!c || !bbEditable()) return;
  const [st, sl, dir] = c.dataset.bbc.split("|"), L = bbData(), curV = L.calls && L.calls[st] ? L.calls[st][sl] : null; bbSet("call", st, sl, curV === dir ? null : dir);
});
function commitGain(el){
  const [st, sl] = el.dataset.gin.split("|"), raw = String(el.value).replace(/[%\s,+]/g, "");
  const prev = gainOf(st, sl);
  if(raw === ""){ if(prev !== null) bbSet("gain", st, sl, null); return; }
  const v = parseFloat(raw); if(!Number.isFinite(v)){ toast("Enter a % like 12.5 or -4"); return; }
  if(prev !== v) bbSet("gain", st, sl, +v.toFixed(4));
}
$("foLog").addEventListener("change", e => { if(e.target.matches("[data-gin]") && bbEditable()) commitGain(e.target); });
$("foLog").addEventListener("keydown", e => { if(e.key === "Enter" && e.target.matches("[data-gin]")){ e.preventDefault(); e.target.blur(); } });
// ---- live battle tracker: two contenders, N rounds, gains counted at each round end ----
S.battleCfg = null; S.btRounds = 8;
const FO_MODES = {gain:"% gain", calls:"Up/down calls", both:"Both (points)"};
function foScore(mode, x){ return mode === "calls" ? x.w : mode === "both" ? x.pts : x.g; }
function battleTracker(rows, src){
  const demo = S.demo || !db, T = TF[S.tf], cur = curStart(), now = Date.now(), admin = isAdmin && !demo, ed = bbEditable();
  const C = demo ? {aName:foNames().a || "ArbWolf", bName:foNames().b || "DeltaFlow", rounds:S.btRounds || 8, first:S.btFirstLocal || cur - 4*T, asset:S.asset, tf:S.tf, active:true, mode:S.btMode || "gain"} : foRun();
  const mode = (C && FO_MODES[C.mode]) ? C.mode : (S.btMode || "gain");
  const FN = foNames(), pickA = FN.a ? {name:FN.a} : null, pickB = FN.b ? {name:FN.b} : null;
  const modeSel = `<label style="display:flex;gap:6px;align-items:center">Compete on <select id="btMode">${Object.entries(FO_MODES).map(([k, v]) => `<option value="${k}"${k === mode ? " selected" : ""}>${v}</option>`).join("")}</select></label>`;
  battleTracker.bar = "";
  const adminBar = !(admin || demo) ? "" : `<div class="bt-admin">${modeSel}
      ${rndPicker("fo", S.btRounds || 8, C && C.active && !demo ? C.rounds : 0)}
      ${C && C.active && !demo ? `<button class="btn ghost sm" type="button" data-btend>End battle</button>` : ""}
      <button class="btn sm" type="button" data-btstart${pickA && pickB ? "" : " disabled"}>${C && C.active ? "Restart" : "Start face-off"}</button></div>`;
  battleTracker.bar = adminBar;
  if(!C || !C.first) return `<div class="bt"><div class="cempty">No face-off running. HardSmoke names two contenders, picks how they compete and for how many rounds, then starts it here.</div>${admin ? `<div class="bt-foot"><span>Choose how they compete and how many rounds above, then press Start face-off. It begins with the next ${esc(S.tf)} round.</span></div>` : ""}</div>`;
  if(C.asset !== S.asset || C.tf !== S.tf) return `<div class="bt"><div class="cempty">The current face-off, ${esc(C.aName)} vs ${esc(C.bName)}, runs on ${esc(C.asset)} ${esc(String(C.tf).toUpperCase())}. Switch the round desk to ${esc(C.asset)} ${esc(C.tf)} to watch it live.</div></div>`;
  const A = entityOf(C.aName, rows, src), B = entityOf(C.bName, rows, src);
  const stopAt = C.active ? Infinity : (C.endedAt || now);
  const sa = {g:0, w:0, l:0, rw:0, pts:0}, sb = {g:0, w:0, l:0, rw:0, pts:0}; let liveIdx = -1, ended = 0, settled = 0; const slots = [];
  for(let i = 0; i < C.rounds; i++){
    const st = C.first + i*T, end = st + T, ca = (A.calls || {})[st], cb = (B.calls || {})[st];
    if(st >= stopAt) break;
    const res = end <= now ? resAny(st, src) : undefined, hasRes = res === "up" || res === "down";
    const state = end <= now ? (hasRes ? "done" : "await") : st <= now ? "live" : "next";
    let da = null, db2 = null, oka = null, okb = null;
    if(end <= now){ ended++; da = gainOf(st, A.sl); db2 = gainOf(st, B.sl); sa.g += da || 0; sb.g += db2 || 0;
      if(da !== null && db2 !== null && da !== db2){ if(da > db2) sa.rw++; else sb.rw++; }
      if(hasRes){ settled++; if(ca){ oka = ca === res; if(oka) sa.w++; else sa.l++; } if(cb){ okb = cb === res; if(okb) sb.w++; else sb.l++; } } }
    if(state === "live") liveIdx = i;
    slots.push({i, st, ca, cb, res, state, da, db:db2, oka, okb});
  }
  sa.g = +sa.g.toFixed(2); sb.g = +sb.g.toFixed(2); sa.pts = sa.w + sa.rw; sb.pts = sb.w + sb.rw;
  const lastEnd = C.first + C.rounds*T, over = !C.active || (now >= lastEnd && slots.every(x => x.state === "done"));
  const before = now < C.first;
  const fmtG = v => v === null || v === undefined ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + (+Math.abs(v).toFixed(2)) + "%", cls = v => v > 0 ? "p" : v < 0 ? "n" : "z";
  const scA = foScore(mode, sa), scB = foScore(mode, sb);
  const big = x => mode === "calls" ? `${x.w}<small> ✓</small>` : mode === "both" ? `${x.pts}<small> pts</small>` : fmtG(x.g);
  const bigCls = x => mode === "gain" ? cls(x.g) : (foScore(mode, x) > 0 ? "p" : "z");
  const sub = x => mode === "calls" ? `${x.w} right · ${x.l} wrong · gain ${fmtG(x.g)}` : mode === "both" ? `${x.w} right calls + ${x.rw} rounds won on gain · ${fmtG(x.g)}` : `${x.w}W · ${x.l}L on calls · ${x.rw} rounds won`;
  const prev = renderBattle.prevG || {}, bumpA = prev.k === C.first && prev.a !== scA, bumpB = prev.k === C.first && prev.b !== scB; renderBattle.prevG = {k:C.first, a:scA, b:scB};
  const leadA = scA > scB, leadB = scB > scA, anyDone = ended > 0;
  const status = over ? `<span class="bt-st fin">FINAL</span><b>${ended} of ${C.rounds} rounds</b>` : before ? `<span class="bt-st soon">UP NEXT</span><b>${C.rounds} rounds</b>` : `<span class="bt-st live">● LIVE</span><b>Round ${liveIdx >= 0 ? liveIdx + 1 : ended + 1} of ${C.rounds}</b>`;
  const clock = over ? "" : before ? `<span class="bt-clock">Starts in <b class="bStart">${mmss(C.first - now)}</b></span>` : `<span class="bt-clock">Round ends in <b class="bEnd">${mmss(cur + T - now)}</b></span>`;
  const callTxt = d => d ? `<b>${d === "up" ? "▲ UP" : "▼ DOWN"}</b>` : "no call yet";
  const liveSt = liveIdx >= 0 ? slots[liveIdx].st : null;
  const card = (side, X, sx, lead, bump) => `<div class="bt-c ${side}${lead && anyDone ? " lead" : ""}">${lead && anyDone ? `<span class="crown">${over ? "WINNER" : "LEADS"}</span>` : ""}
      <div class="nm">${esc(X.name)}</div><div class="gain ${bigCls(sx)}${bump ? " bump" : ""}">${big(sx)}</div>
      <div class="rec">${sub(sx)}</div>
      ${over ? "" : `<div class="now">${liveSt !== null ? "This round: " + callTxt((X.calls || {})[liveSt]) : "First round: " + callTxt((X.calls || {})[C.first])}</div>`}
      ${over || !ed ? "" : (() => { const btn = (st, lab) => { const d = (X.calls || {})[st]; return `<span class="fcall">${lab}<span class="bbb"><button type="button" class="up${d === "up" ? " on" : ""}" data-bbc="${st}|${esc(X.sl)}|up" aria-label="${esc(X.name)} up">▲</button><button type="button" class="down${d === "down" ? " on" : ""}" data-bbc="${st}|${esc(X.sl)}|down" aria-label="${esc(X.name)} down">▼</button></span></span>`; };
        return `<div class="fcall">${liveSt !== null ? btn(liveSt, "Now") : ""}${btn(cur + T, "Next")}</div>`; })()}</div>`;
  const mark = ok => ok === null ? "" : ok ? `<i class="okm">✓</i>` : `<i class="nom">✗</i>`;
  const track = slots.concat(Array.from({length: Math.max(0, (over ? 0 : C.rounds) - slots.length)}, (_, k) => ({i: slots.length + k, st: C.first + (slots.length + k)*T, state:"next"}))).map(x => `<div class="slot ${x.state}" title="${esc(tLocal(x.st))}–${esc(tLocal(x.st + T))}">
      <span class="rn">R${x.i + 1}</span><span>${esc(tLocal(x.st + T))}</span>
      ${x.state === "done" || x.state === "await" ? `${x.state === "done" ? `<span class="res ${x.res}">${x.res === "up" ? "▲ UP" : "▼ DN"}</span>` : `<span>awaiting</span>`}<span class="g a ${mode === "calls" ? "" : cls(x.da)}">${mode === "calls" ? (x.ca ? (x.ca === "up" ? "▲" : "▼") : "·") + mark(x.oka) : fmtG(x.da) + (mode === "both" ? mark(x.oka) : "")}</span><span class="g b ${mode === "calls" ? "" : cls(x.db)}">${mode === "calls" ? (x.cb ? (x.cb === "up" ? "▲" : "▼") : "·") + mark(x.okb) : fmtG(x.db) + (mode === "both" ? mark(x.okb) : "")}</span>`
        : x.state === "live" ? `<span class="res" style="color:#FF4D6A">LIVE</span><span>${x.ca ? (x.ca === "up" ? "▲" : "▼") : "·"} / ${x.cb ? (x.cb === "up" ? "▲" : "▼") : "·"}</span>`
        : `<span>—</span>`}</div>`).join("");
  const fmtS = x => mode === "calls" ? `${x.w} right call${x.w === 1 ? "" : "s"}` : mode === "both" ? `${x.pts} pts` : fmtG(x.g);
  const winner = over && anyDone ? `<div class="bt-win">${scA === scB ? "Draw · " + fmtS(sa) + " each" : "Winner · " + esc(scA > scB ? A.name : B.name) + " · " + fmtS(scA > scB ? sa : sb) + " vs " + fmtS(scA > scB ? sb : sa)}</div>` : "";
  const rules = mode === "calls" ? "Scored on up/down calls: the contender with more right calls vs Kalshi's result wins." : mode === "both" ? "Scored on points: 1 point for each right up/down call, plus 1 point for each round won on % gain." : "Scored on % gain: the counters add up the gain entered for each contender at the end of every round.";
  return `<div class="bt">
    <div class="bt-top">${status}<span class="bt-mode">Compete on: <b>${FO_MODES[mode]}</b></span><span>${esc(C.asset)} ${esc(String(C.tf).toUpperCase())}</span>${demo ? `<span class="chip ex">Demo</span>` : ""}${clock}</div>
    ${winner}
    <div class="bt-vs">${card("a", A, sa, leadA, bumpA)}<div class="bt-mid">VS</div>${card("b", B, sb, leadB, bumpB)}</div>
    <div class="bt-track">${track}</div>
    <div class="bt-foot"><span>${rules}</span></div>
  </div>`;
}
$("foLog").addEventListener("change", async e => {
  if(e.target.id === "btRounds") S.btRounds = +e.target.value;
  if(e.target.id === "btMode"){ S.btMode = e.target.value;
    if(!(S.demo || !db) && isAdmin && foRun()){ const CB = battleKind() === "callers"; S.battleCfg = CB ? {...S.battleCfg, cfo:{...S.battleCfg.cfo, mode:S.btMode}} : {...S.battleCfg, mode:S.btMode}; await act(() => mergeWrite(db.doc("config/battle"), CB ? {cfo:{mode:S.btMode}} : {mode:S.btMode})); }
    renderBattle(); }
});

$("foLog").addEventListener("click", async e => {
  const st = e.target.closest("[data-btstart]"), en = e.target.closest("[data-btend]"); if(!st && !en) return;
  if(S.demo || !db){ if(st){ S.btFirstLocal = curStart() + TF[S.tf]; renderBattle(); toast("Preview face-off started"); } return; }
  if(!isAdmin) return;
  if(en){ const CB = battleKind() === "callers", p = {active:false, endedAt:Date.now()}; if(await act(() => mergeWrite(db.doc("config/battle"), CB ? {cfo:p} : p))){ S.battleCfg = CB ? {...S.battleCfg, cfo:{...(S.battleCfg.cfo || {}), ...p}} : {...S.battleCfg, ...p}; renderBattle(); toast("Face-off ended"); } return; }
  const FN = foNames(), A = FN.a ? {name:FN.a, key:"e~" + slug(FN.a)} : null, B = FN.b ? {name:FN.b, key:"e~" + slug(FN.b)} : null; if(!A || !B || slug(A.name) === slug(B.name)) return toast("Type two different names first.");
  const cfg = {a:A.key, b:B.key, aName:A.name, bName:B.name, mode:S.btMode || "gain", rounds:S.btRounds || 8, first:curStart() + TF[S.tf], asset:S.asset, tf:S.tf, active:true, endedAt:null, t:Date.now()};
  const CB = battleKind() === "callers";
  if(await act(() => mergeWrite(db.doc("config/battle"), CB ? {cfo:cfg} : cfg))){ S.battleCfg = CB ? {...(S.battleCfg || {}), cfo:cfg} : {...(S.battleCfg || {}), ...cfg}; renderBattle(); toast(`Face-off set: ${A.name} vs ${B.name}, ${cfg.rounds} rounds, on ${FO_MODES[cfg.mode]}`); }
});
setInterval(() => { const now = Date.now(), cs = curStart(), C = foRun(); document.querySelectorAll(".bt .bEnd, .bbwar .bEnd, .bcr .bEnd, .hsp .bEnd, .vortex .bEnd").forEach(x => x.textContent = mmss(cs + TF[S.tf] - now)); document.querySelectorAll(".bbStart").forEach(x => x.textContent = mmss(+x.dataset.at - now)); document.querySelectorAll(".bt .bStart").forEach(x => { if(C && C.first) x.textContent = mmss(C.first - now); });
  if(battleTracker.round && battleTracker.round !== cs) renderBattle(); battleTracker.round = cs; }, 1000);
function faceOff(A, B, cutoff){
  if(!A || !B || A.sl === B.sl) return `<div class="cempty">Type two different names in the boxes above to compare them.</div>`;
  const mb = new Map(B.hist.filter(x => x.start >= cutoff).map(x => [x.start, x])), sh = [];
  A.hist.forEach(x => { if(x.start < cutoff) return; const y = mb.get(x.start); if(y) sh.push({start:x.start, a:x.d, b:y.d, res:x.res}); });
  if(!sh.length) return `<div class="cempty">${esc(A.name)} and ${esc(B.name)} haven't called the same scored round in this window.</div>`;
  const pc = (h, n) => n ? Math.round(h/n*100) + "%" : "—";
  const dis = sh.filter(r => r.a !== r.b), agr = sh.filter(r => r.a === r.b);
  const aw = dis.filter(r => r.a === r.res).length, bw = dis.length - aw;
  const aR = sh.filter(r => r.a === r.res).length, bR = sh.filter(r => r.b === r.res).length;
  const agHit = agr.filter(r => r.a === r.res).length;
  let runA = 0, runB = 0, cur = 0, curW = null;
  dis.forEach(r => { const w = r.a === r.res ? "a" : "b"; cur = w === curW ? cur + 1 : 1; curW = w; if(w === "a") runA = Math.max(runA, cur); else runB = Math.max(runB, cur); });
  const dirHit = (k, d) => { const c = sh.filter(r => r[k] === d); return [c.filter(r => r.res === d).length, c.length]; };
  const [aUh, aUn] = dirHit("a","up"), [bUh, bUn] = dirHit("b","up"), [aDh, aDn] = dirHit("a","down"), [bDh, bDn] = dirHit("b","down");
  const last10 = sh.slice(-10), l10a = last10.filter(r => r.a === r.res).length, l10b = last10.filter(r => r.b === r.res).length;
  const upBias = (k) => Math.round(sh.filter(r => r[k] === "up").length / sh.length * 100);
  const row = (k, av, bv, an, bn, hi = true) => { const wa = hi && an > bn, wb = hi && bn > an;
    return `<div class="trow"><span class="v a${wa ? " win" : ""}">${av}</span><span class="k">${k}</span><span class="v b${wb ? " win" : ""}">${bv}</span></div>`; };
  const ratio = (h, n) => n ? h/n : -1;
  const verdict = !dis.length ? "They've agreed on every shared round" : aw === bw ? "Dead even when they disagree" : `${esc(aw > bw ? A.name : B.name)} wins the disagreements`;
  const strip = dis.slice(-20).map(r => r.a === r.res ? `<span class="a" title="${esc(A.name)} right · ${esc(tLocal(r.start))}">A</span>` : `<span class="b" title="${esc(B.name)} right · ${esc(tLocal(r.start))}">B</span>`).join("");
  const by = r => r.by ? esc(r.by) : who(r.a);
  return `<div class="fo">
      <div class="side a"><div class="nm">${esc(A.name)}</div><div class="by">${A.by || A.a ? "by " + by(A) : ""}</div></div>
      <div class="mid"><div class="big"><span class="a">${aw}</span><i>VS</i><span class="b">${bw}</span></div><small>disagreements won</small><div class="verdict">${verdict}</div></div>
      <div class="side b"><div class="nm">${esc(B.name)}</div><div class="by">${B.by || B.a ? "by " + by(B) : ""}</div></div>
    </div>
    <div class="tape">
      ${row("Win rate, shared", pc(aR, sh.length), pc(bR, sh.length), aR, bR)}
      ${row("Last 10 shared", `${l10a}/${last10.length}`, `${l10b}/${last10.length}`, l10a, l10b)}
      ${row("Up calls hit", `${pc(aUh, aUn)} <small>(${aUn})</small>`, `${pc(bUh, bUn)} <small>(${bUn})</small>`, ratio(aUh, aUn), ratio(bUh, bUn))}
      ${row("Down calls hit", `${pc(aDh, aDn)} <small>(${aDn})</small>`, `${pc(bDh, bDn)} <small>(${bDn})</small>`, ratio(aDh, aDn), ratio(bDh, bDn))}
      ${row("Best run vs the other", runA, runB, runA, runB)}
      ${row("Current streak", A.sk ? (A.sw ? "W" : "L") + A.sk : "—", B.sk ? (B.sw ? "W" : "L") + B.sk : "—", A.sw ? A.sk : -A.sk, B.sw ? B.sk : -B.sk)}
    </div>
    <div class="duel">
      <div class="cap">${sh.length} shared rounds · agreed ${agr.length} (${pc(agr.length, sh.length)}), right together ${pc(agHit, agr.length)} of those · disagreed ${dis.length}</div>
      ${dis.length ? `<div class="strip" aria-label="Last disagreements, oldest to newest">${strip}</div><div class="cap">Last ${Math.min(20, dis.length)} disagreements, oldest to newest: <b style="color:#4DA3FF">A</b> = ${esc(A.name)} right, <b style="color:#FF7A45">B</b> = ${esc(B.name)} right</div>` : ""}
    </div>`;
}


// ---------- cortex: three stream windows + cortex voice ----------
const kindOfStream = s => (s.sourceKind === "bot" || s.src === "Bot") ? "bot" : (s.sourceKind === "script" || s.src === "Chart") ? "script" : spIsMemberStream(s) ? "member" : "caller";
function streamCard(s){
  const url = /^https:\/\//.test(s.url || "") ? s.url : null, mine = !S.demo && s.hostId && s.hostId === meId;
  return `<div class="cxs"><div class="feed ${s.media === "audio" ? "audio" : ""}"><div class="ft"><span class="pill live">Live · ${mediaWord(s.media)}</span></div>${EQ}
    <div class="st"><span>${s.sec && SECTIONS[s.sec] ? esc(SECTIONS[s.sec].name) : s.sec === "cortex" ? "Cortex" : ""}</span>${url ? `<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${s.media === "audio" ? "Listen" : "Watch"} ↗</a>` : ""}</div></div>
    <div class="b"><div class="t">${esc(s.title || "")}</div><div class="m">${s.who ? esc(s.who) : who(s.hid)} ${s.hid ? roleBadges(s.hid) : ""}</div>
    <div class="acts">${s.id && s.sec && SECTIONS[s.sec] ? `<button class="xbtn2" type="button" data-gostream="${esc(s.sec)}|${esc(s.id)}">Forum</button>` : ""}${mine ? `<button class="xbtn2" type="button" data-bend="${esc(s.id)}">End my stream</button>` : ""}</div></div></div>`;
}
function renderCxWall(){
  const L = cortexStreams();
  $("cxOnAir").textContent = L.length;
  const groups = {caller:[], bot:[], script:[], member:[]}; L.forEach(s => groups[kindOfStream(s)].push(s));
  const empty = {member:"No website members are streaming. Anyone can share their screen with the 🖥 button in their Cortex panel.", caller:"No caller is live.", bot:"No bot streams live.", script:"No chart-script streams live."};
  for(const [k, id] of [["caller","Cal"],["bot","Bot"],["script","Scr"],["member","Mem"]]){
    $("cxN" + id).textContent = groups[k].length ? `${groups[k].length} live` : "";
    $("cxWall" + id).innerHTML = groups[k].length ? groups[k].map(streamCard).join("") : `<div class="cempty" style="grid-column:1/-1;padding:16px">${empty[k]}</div>`;
    fillNames($("cxWall" + id));
  }
  renderCxTop(groups);
}
const voiceName = k => k === "cortex" ? "Cortex" : k === "vortex" ? "Vortex" : (SECTIONS[k]?.name || (((S.cxCfg || {}).chx || {})[k] || {}).name || "");
function cxVoiceRow(people, c){
  const audio = VX_VOICE.available(), mine = S.inVoice === "cortex", canJoin = S.demo || !db || !!meId;
  const inside = people.filter(p => p.voice === "cortex").map(p => p.me ? {...p, tk:mine && !S.vxMute, mu:S.vxMute} : p);
  const face = p => p.name ? `<span class="av sm" style="background:${p.color}"></span>` : avatar(p.id, "sm"), nm = p => p.name ? `<span class="who">${esc(p.name)}</span>` : who(p.id);
  const live = (p, i) => p.mu ? false : p.tk || (S.demo && !p.me && (Math.floor(Date.now() / 2000) + i) % 3 === 0);
  const head = `<button type="button" class="dchn vc cxvc${mine ? " in" : ""}" style="--c:${c}" data-vk="cortex" ${canJoin ? (mine ? "" : "data-cxvjoin") : ""} title="${mine ? "You're in Cortex voice" : "Join Cortex voice"}">${DSPK}<span class="nm">cortex</span><span class="bi">BUILT-IN</span>${inside.length ? `<span class="bdg n">${inside.length}</span>` : ""}</button>`;
  const rows = inside.map((p, i) => `<div class="dvm"><span class="ring${live(p, i) ? " talk" : ""}">${face(p)}</span>${nm(p)}<span class="cxvm">${p.mu ? "🔇" : live(p, i) ? "🎙" : ""}</span></div>`).join("");
  const bar = mine ? `<div class="cxvbar"><button type="button" class="micsw${S.vxMute ? "" : " on"}" role="switch" aria-checked="${!S.vxMute}" data-cxvmute title="Turn your mic on or off"><span class="tr"><i></i></span>${S.vxMute ? "Mic off" : "Mic on"}</button><button type="button" class="xbtn2" data-cxvleave>Leave</button></div>${audio ? "" : `<div class="cxvsoon">🎧 Audio turns on when D3MON.CO runs on its own domain. For now everyone can see who's in voice and whose mic is on.</div>`}`
    : canJoin ? `<button type="button" class="cxvjoin" data-cxvjoin>🔊 Join Cortex voice</button>` : `<div class="cxvsoon">Sign in to join Cortex voice.</div>`;
  return head + rows + bar;
}
document.addEventListener("click", e => {
  if(e.target.closest("[data-cxvjoin]")){ S.inVoice = "cortex"; S.vxMute = false; S.vxTalk = !VX_VOICE.available(); if(S.demo){ const me = S.demoPeers.find(p => p.me); if(me) me.voice = "cortex"; } pushPresence(); VX_VOICE.join("cortex", meId).catch(() => {});
    toast(VX_VOICE.available() ? "You're in Cortex voice" : "You joined Cortex voice. Audio turns on when the site moves to its own domain."); renderCxVoice(); renderDock(); renderRailVoice(); return; }
  if(e.target.closest("[data-cxvmute]")){ S.vxMute = !S.vxMute; S.vxTalk = S.vxMute ? false : !VX_VOICE.available(); VX_VOICE.setMuted(S.vxMute); pushPresence(); toast(S.vxMute ? "Mic off" : "Mic on"); renderCxVoice(); return; }
  if(e.target.closest("[data-cxvleave]")){ S.inVoice = null; S.vxTalk = false; if(S.demo){ const me = S.demoPeers.find(p => p.me); if(me) me.voice = null; } VX_VOICE.leave().catch(() => {}); pushPresence(); renderCxVoice(); renderDock(); renderRailVoice(); return; }
});
function renderCxVoice(){
  const people = onlinePeople();
  { const el = $("cxVoice"); el.hidden = false; el.innerHTML = `<p class="dcat cxvcat">Voice chat</p>` + cxVoiceRow(people, "#4DA3FF"); fillNames(el); if(S.cortex && typeof renderDMe === "function") renderDMe(); return; }
  const ch = [["cortex","Cortex","#4DA3FF"], ...Object.entries(SECTIONS).map(([k, v]) => [k, v.name, `var(--${k})`])].filter(([k]) => !cxHidden("v:" + k)).concat(cxCustom("voice").map(([id, x]) => [id, x.name, "#5BE3C8", x.url]));
  $("cxVoice").innerHTML = ch.map(([k, nm, c, curl]) => {
    if(k === "cortex") return cxVoiceRow(people, c);
    const link = curl || (S.demo ? "https://meet.google.com/" : (S.voiceLinks || {})[k]), inside = people.filter(p => p.voice === k), mineIn = S.inVoice === k;
    const head = link
      ? `<a class="dchn vc${mineIn ? " in" : ""}" style="--c:${c}" href="${esc(link)}" target="_blank" rel="noopener noreferrer" data-vjoin="${k}" data-vk="${k}" title="${mineIn ? "You're in this voice channel" : "Join voice"}">${DSPK}<span class="nm">${esc(nm.toLowerCase().replace(/\s+/g, "-"))}</span>${inside.length ? `<span class="bdg n">${inside.length}</span>` : ""}</a>`
      : `<div class="dchn vc off" data-vk="${k}" style="--c:${c}" title="${isAdmin ? "Add a voice link in Community → Voice rooms" : "No voice room linked yet"}">${DSPK}<span class="nm">${esc(nm.toLowerCase().replace(/\s+/g, "-"))}</span></div>`;
    return head + inside.map((p, i) => `<div class="dvm"><span class="ring${(Math.floor(Date.now()/2000) + i) % 3 === 0 ? " talk" : ""}">${p.name ? `<span class="av sm" style="background:${p.color}"></span>` : avatar(p.id, "sm")}</span>${p.name ? `<span class="who">${esc(p.name)}</span>` : who(p.id)}</div>`).join("");
  }).join("") + `<p class="dvnote">Cortex voice is built into the site. Callers, Bots and Scripts rooms open in their own tab.</p>`;
  fillNames($("cxVoice")); cxDecorate();
  if(S.cortex && typeof renderDMe === "function") renderDMe();
}

// ---------- Cosmic: stardust AI assistant ----------
const NEB = {turns:[], busy:false, ctl:null, sample:null, ready:false, mood:"idle", open:false};
function makeCloud(cv, size, count){
  const dpr = window.devicePixelRatio || 1; cv.width = size*dpr; cv.height = size*dpr; const g = cv.getContext("2d"); g.scale(dpr,dpr);
  const COLS = ["255,181,71","77,163,255","185,140,255","220,231,238","77,163,255","185,140,255"];
  const P = Array.from({length:count}, () => { const r = Math.pow(Math.random(), .55); return {r, a:Math.random()*6.283, s:(.25+Math.random()*.9)*(Math.random()<.5?-1:1), z:Math.random()*6.283, zs:.4+Math.random()*1.2, sz:.5+Math.random()*1.6, c:COLS[(Math.random()*COLS.length)|0], tw:Math.random()*6.283}; });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let last = Date.now(), spin = 0;
  function frame(){
    const now = Date.now(), dt = Math.min(.05, (now - last)/1000); last = now;
    const m = NEB.mood, speed = reduce ? .15 : m === "think" ? 3.2 : m === "talk" ? 1.8 : 1;
    spin += dt*speed;
    const cx = size/2, cy = size/2, R = size*.4, pulse = m === "talk" ? 1 + .06*Math.sin(now/90) : m === "think" ? 1 - .05*Math.sin(now/140) : 1 + .02*Math.sin(now/900);
    g.clearRect(0,0,size,size);
    const core = g.createRadialGradient(cx,cy,0,cx,cy,R*1.05); core.addColorStop(0,"rgba(185,140,255,.35)"); core.addColorStop(.45,"rgba(77,163,255,.14)"); core.addColorStop(1,"rgba(77,163,255,0)");
    g.fillStyle = core; g.beginPath(); g.arc(cx,cy,R*1.05,0,7); g.fill();
    g.globalCompositeOperation = "lighter";
    for(const p of P){
      const a = p.a + spin*p.s*(1.2 - p.r*.6), rr = p.r*R*pulse;
      const x = cx + Math.cos(a)*rr, y = cy + Math.sin(a)*rr*.72 + Math.sin(p.z + spin*p.zs)*R*.12;
      const al = (.35 + .65*(.5 + .5*Math.sin(p.tw + now/400*p.zs))) * (1 - p.r*.35);
      g.fillStyle = `rgba(${p.c},${al.toFixed(3)})`; g.beginPath(); g.arc(x, y, p.sz*(size/96), 0, 7); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(cx, cy, size*.028*pulse + .6, 0, 7); g.fill();
    g.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
const NEB_RULES = `You are Cosmic, the built-in AI assistant of D3MON.CO, a live trading community for Kalshi and Polymarket up/down rounds (BTC, ETH, SOL, XRP; 15-minute and hourly), plus stocks and futures traders.
How D3MON.CO works:
- A triangle of three sources: Callers (verified people who call UP/DOWN for each round), Bots (creators' bots that read market data and post a final call), Chart Scripts (indicator scripts that post signals and levels).
- Round Desk: people call the NEXT round before it starts; calls lock at the round start. Admins mark results; the leaderboard ranks hit rates over 7 days (5+ resolved calls to be ranked).
- Callers section has the Call console (verified callers only; request verification there). Bots section has the Bot console; Chart Scripts has the Script console.
- My Callers / My Bots / My Charts windows show what a member follows; voice alerts read calls aloud.
- The Live Trade Cortex (click the symbol in the middle of the triangle) is the shared trade chat with tabs, stream windows for callers, bots and scripts, Cortex voice, and who is in the room.
- Command Center: a custom layout of panels. Community button: voice rooms and who's online.
- HardSmoke's Battle of the Bots (right below the triangle): every bot's calls are scored on the rounds; standings by win rate (ranked after 5 scored rounds), W/L streaks, head to head between two bots, and each bot's call for the next round.
- Streams (audio/video) open on their own site; the page cannot embed players.
- Profiles are social: every member can post updates, follow people, like and comment on posts. My D3MON has a Feed tab (posts from people you follow, your activity) and a People tab (search members, filter by businesses, callers, bot owners, chart scripters). Callers, bot owners and chart scripters can publish a Business page from My D3MON (business name, services and pricing, booking link, email, hours) and it shows a track record D3MON.CO calculates from their calls.
Rules: Be concise and friendly (short paragraphs or a few bullets, plain text, no markdown headings). Use the LIVE PAGE DATA provided to answer questions about calls, consensus, streams, chat and the ledger; say when data is empty or missing. You cannot place trades, post, or change anything on the site; tell people which button to use instead. Do not give personalized financial advice or predict prices with certainty; you can summarize what callers, bots and scripts are saying and note the risks. Never invent members, numbers or results that are not in the data.`;
function nebContext(){
  const cur = curStart(), nxt = cur + TF[S.tf], lines = [];
  lines.push(`Viewer is on: ${S.cortex ? "Live Trade Cortex" : S.cc ? "Command Center" : (SECTIONS[S.section]?.name || "") + " section"}${S.demo ? " (DEMO MODE: sample data)" : ""}. Viewer is ${isVerified(meId) ? "a verified caller" : "not a verified caller"}${isAdmin ? " and an admin" : ""}.`);
  lines.push(`Round desk market: ${S.asset} ${S.tf}. Next round ${tLocal(nxt)}–${tLocal(nxt+TF[S.tf])} local (${tET(nxt)} ET), locks in ${mmss(nxt - Date.now())}.`);
  const summ = (st) => { const L = entriesFor(st).filter(e => valid(e, st)); const t = tally(L); return `${L.length} calls (UP ${t.up} / DOWN ${t.down}; callers ${t.caller.up}/${t.caller.down}, bots ${t.bot.up}/${t.bot.down}, scripts ${t.script.up}/${t.script.down})`; };
  if(S.demo){
    lines.push("Next-round calls (demo): " + demoState.callers.filter(c => c.next).map(c => `${c.name} ${c.next.d.toUpperCase()} ${c.next.c}`).concat(demoState.bots.filter(b => b.next).map(b => `${b.name} (bot) ${b.next.d.toUpperCase()}`), demoState.charts.filter(c => c.next).map(c => `${c.name} (script) ${c.next.d.toUpperCase()}`)).join("; "));
    lines.push("Bots: " + demoState.bots.map(b => `${b.name}: bias ${b.bias}, ${b.reads.map(r => r.k + " " + r.v).join(", ")}`).join(" | "));
    lines.push("Chart scripts: " + demoState.charts.map(c => `${c.name} ${c.asset} ${c.tf}: ${c.signal}, price ${c.price}, R ${c.r1}, S ${c.s1}`).join(" | "));
  } else {
    lines.push(`Next round: ${summ(nxt)}. Live round: ${summ(cur)}.`);
    const res = []; for(let i=1;i<=6;i++){ const st = cur - i*TF[S.tf], r = resultFor(st); if(r) res.push(`${tLocal(st)} ${r.toUpperCase()}`); } if(res.length) lines.push("Recent results: " + res.join(", "));
  }
  const live = liveList(); lines.push(`Live streams (${live.length}): ` + (live.slice(0,10).map(s => `${s.src}: "${s.title}" ${s.media || "video"}${s.who ? " by " + s.who : ""}`).join("; ") || "none"));
  const M = allMsgs().slice(-25); lines.push("Latest trade floor chat:\n" + (M.map(m => `[${m.tab}] ${m.name || (m.as ? m.as.n : "member")}${m.dir ? " (" + m.dir.toUpperCase() + " " + (m.mk || "") + ")" : ""}: ${m.b}`).join("\n") || "(empty)"));
  try { const {rows} = battleData(); lines.push("Battle of the Bots, current type " + battleTitle() + " (" + (S.bPeriod || "7d") + "): " + (rows.slice(0,8).map((r,i) => `${r.n >= 5 ? "#" + (i+1) : "unranked"} ${r.name} ${r.w}-${r.l} (${Math.round(r.pct*100)}%)${r.sk ? ", streak " + (r.sw ? "W" : "L") + r.sk : ""}${r.next ? ", next round " + r.next : ""}`).join("; ") || "no bots scored yet")); } catch {}
  try { lines.push(spNebContext()); } catch {}
  return lines.join("\n").slice(0, 12000);
}
function nebRender(){
  const box = $("nebMsgs");
  if(!NEB.turns.length){
    box.innerHTML = `<div class="nm a">Hi, I'm Cosmic. I can read what's happening on D3MON.CO right now: round calls, the trade floor, streams and the Battle of the Bots. Ask me anything, or try one of these.</div>`;
  } else box.innerHTML = NEB.turns.map(t => `<div class="nm ${t.role === "user" ? "u" : "a"}${t.cls ? " " + t.cls : ""}">${esc(t.content)}</div>`).join("");
  box.scrollTop = box.scrollHeight;
  const chips = [`What are people calling on ${S.asset} ${S.tf}?`, "Summarize the trade floor", "What's live right now?", "How do I get verified as a caller?", "Who's winning the Battle of the Bots?"];
  $("nebChips").innerHTML = NEB.turns.length ? "" : chips.map(c => `<button type="button" data-nebq="${esc(c)}">${esc(c)}</button>`).join("");
  $("nebSend").hidden = NEB.busy; $("nebStop").hidden = !NEB.busy; $("nebIn").disabled = NEB.busy;
}
async function nebAsk(q){
  q = (q || "").trim(); if(!q || NEB.busy) return;
  NEB.turns.push({role:"user", content:q});
  const reply = {role:"assistant", content:"Thinking…", cls:"think"}; NEB.turns.push(reply);
  NEB.busy = true; NEB.mood = "think"; nebRender();
  if(!NEB.sample){ reply.content = "I'm not available in this view. Open D3MON.CO inside Claude while signed in to chat with me."; reply.cls = "err"; NEB.busy = false; NEB.mood = "idle"; NEB.turns.pop(); NEB.turns.push(reply); nebRender(); return; }
  const hist = NEB.turns.slice(0,-1).filter(t => !t.cls).slice(-10).map(t => ({role:t.role, content:t.content}));
  const input = [{role:"user", content: NEB_RULES + "\n\nLIVE PAGE DATA (as of now):\n" + nebContext()}, {role:"assistant", content:"Got it. I'll answer from that data."}, ...hist];
  NEB.ctl = new AbortController();
  try {
    const { text, truncated } = await NEB.sample(input, { modelTier:"quick", cache:false, signal:NEB.ctl.signal,
      onText: ({text}) => { reply.content = text; reply.cls = ""; NEB.mood = "talk"; const box = $("nebMsgs"); const el = box.lastElementChild; if(el){ el.textContent = text; el.className = "nm a"; } box.scrollTop = box.scrollHeight; } });
    reply.content = text + (truncated ? "\n\n(cut short, ask me for less at once)" : ""); reply.cls = "";
  } catch(e) {
    const code = e && e.code;
    if(code === "cancelled"){ reply.content = e.text || "Stopped."; reply.cls = e.text ? "" : "err"; }
    else if(code === "not_granted" || code === "sampling_disabled" || code === "not_declared" || code === "capability_disabled" || code === "capability_removed"){ reply.content = "Cosmic needs your permission to use Claude on this page, or isn't available for your account."; reply.cls = "err"; }
    else if(code === "rate_limited"){ reply.content = (e.text ? e.text + "\n\n" : "") + "I'm getting too many questions at once. Try again in a minute."; reply.cls = e.text ? "" : "err"; }
    else if(code === "refused"){ reply.content = "I can't help with that one. Try asking another way."; reply.cls = "err"; }
    else { reply.content = (e && e.text) ? e.text + "\n\n(interrupted)" : "Something went wrong reaching Claude. Try again."; reply.cls = (e && e.text) ? "" : "err"; }
  }
  NEB.busy = false; NEB.mood = "idle"; NEB.ctl = null; nebRender(); $("nebIn").focus({preventScroll:true});
}
makeCloud($("nebCv"), 96, 190);
$("nebBtn").addEventListener("click", () => { NEB.open = !NEB.open; $("nebPanel").hidden = !NEB.open; if(NEB.open){ $("dock").hidden = true; $("dockBtn").setAttribute("aria-expanded", false); if(!NEB.cloud2){ NEB.cloud2 = true; makeCloud($("nebCv2"), 34, 70); } nebRender(); $("nebIn").focus({preventScroll:true}); } });
$("nebClose").addEventListener("click", () => { NEB.open = false; $("nebPanel").hidden = true; });
$("nebClear").addEventListener("click", () => { if(NEB.busy && NEB.ctl) NEB.ctl.abort(); NEB.turns = []; nebRender(); });
$("nebStop").addEventListener("click", () => { if(NEB.ctl) NEB.ctl.abort(); });
$("nebForm").addEventListener("submit", e => { e.preventDefault(); const v = $("nebIn").value; $("nebIn").value = ""; nebAsk(v); });
document.addEventListener("click", e => { const b = e.target.closest("[data-nebq]"); if(b) nebAsk(b.dataset.nebq); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && NEB.open && !$("nebPanel").hidden && document.activeElement && $("nebPanel").contains(document.activeElement)){ NEB.open = false; $("nebPanel").hidden = true; $("nebBtn").focus(); } });
(async () => { try { if(window.claude && claude.use) NEB.sample = await claude.use("sample"); } catch {} })();


// ---------- align the Flower of Life lattice to the triangle ----------
let LAT = {s:52, th:90, x0:0, y0:0};
function alignLattice(){
  const m = $("map"); if(!m || !m.offsetWidth) return;
  const r = m.getBoundingClientRect(), W = r.width, H = r.height;
  const ax = r.left + scrollX + W*0.5, ay = r.top + scrollY + H*(70/780);    // apex node centre (svg 500,70)
  const side = W*0.62;                                                        // 620 of 1000 viewBox units
  const n = Math.max(3, Math.round(side/46/3)*3);                             // multiple of 3: centroid lands on a point too
  const sp = side/n, th = sp*90/52;
  const x0 = ((ax % sp) + sp) % sp, y0 = ((ay % th) + th) % th;
  const st = document.documentElement.style;
  st.setProperty("--folW", sp.toFixed(3) + "px"); st.setProperty("--folH", th.toFixed(3) + "px");
  st.setProperty("--folX", x0.toFixed(3) + "px"); st.setProperty("--folY", y0.toFixed(3) + "px");
  LAT = {s:sp, th, x0, y0};
}
alignLattice();
addEventListener("resize", alignLattice);
try { new ResizeObserver(() => alignLattice()).observe($("map")); } catch {}
try { document.fonts && document.fonts.ready.then(alignLattice); } catch {}

// ---------- social profiles: posts, follows, likes, banners · business pages for callers, bot owners and scripters ----------
const SP_BANNERS = [["","Match my color",""],["aurora","Aurora","linear-gradient(135deg,#FFB547,#4DA3FF 55%,#B98CFF)"],["ember","Ember","linear-gradient(135deg,#FF7A45,#FF4D6A 55%,#2A0A12)"],["ocean","Ocean","linear-gradient(135deg,#0E3A5C,#4DA3FF 60%,#5BE3C8)"],["neon","Neon","linear-gradient(135deg,#B98CFF,#FF5C8A 60%,#1A0F2E)"],["forest","Forest","linear-gradient(135deg,#0F3D2E,#2EE59D 65%,#DCE7EE)"],["gold","Gold","linear-gradient(135deg,#3A2A05,#FFD166 55%,#FFB547)"],["candles","Candles","repeating-linear-gradient(90deg,rgba(46,229,157,.55) 0 6px,transparent 6px 18px,rgba(255,77,106,.5) 18px 24px,transparent 24px 36px),linear-gradient(135deg,#0A1118,#16212C)"],["night","Night","linear-gradient(135deg,#05080C,#1A2530 60%,#3A4A58)"]];
const SP_BIZCAT = ["Signals & alerts","Trading education","Bot / automation","Chart indicators","Coaching & mentoring","Community / Discord","Research & newsletter","Other"];
const spSeed = s => [...String(s || "")].reduce((a, ch) => a + ch.charCodeAt(0), 0);
const spSafe = s => String(s || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
const spMe = () => meId || "you";
const spProfKey = k => k === "you" ? "You (demo)" : k;
const spIsSample = (key, pub) => !!((pub || {}).sample) || /^mock-/.test(key || "") || /\(demo\)$/.test(key || "");
function spAllPubs(){ const out = []; for(const [uid, d] of Object.entries(S.botDocs || {})) if(d && d.pub) out.push([uid, d.pub]); if(mpPreview()) out.push(["you", S.previewPub || {}]); return out; }
function spPubFor(key){ if(!key) return {}; if(key === "you" || key === "You (demo)") return mpPreview() ? (S.previewPub || {}) : pubOf(meId); if(/^p:/.test(key)) return getProfiles()[key.slice(2)] || {}; return pubOf(key); }
const spBannerCss = pub => { const b = SP_BANNERS.find(x => x[0] && x[0] === (pub || {}).banner); return b ? b[2] : ""; };
// write my own public profile without a toast for small social actions
const SP_MAPS = ["likes","cmts","hideC","folT"];
function spMerge(base, patch){ const o = {...(base || {}), ...patch}; SP_MAPS.forEach(k => { if(patch[k]){ o[k] = {...((base || {})[k] || {})}; for(const [x, v] of Object.entries(patch[k])) o[k][x] = v && typeof v === "object" && o[k][x] && typeof o[k][x] === "object" ? {...o[k][x], ...v} : v; } }); return o; }
async function spPub(patch, msg){
  if(mpPreview()){ S.previewPub = spMerge(S.previewPub, patch); if(msg) toast(msg + " (preview only)"); return true; }
  if(!meId || !canWrite){ toast("Sign in with Contributor access to do that."); return false; }
  if(guestBlocked("board")) return false;
  const d = S.botDocs[meId] = S.botDocs[meId] || {a:meId}; d.pub = spMerge(d.pub, patch);
  const ok = await act(() => mergeWrite(db.doc("bots/" + meId), {a:meId, pub:patch})); if(ok && msg) toast(msg); return ok;
}
function spRerender(){ if(!$("dock").hidden && S.dtab === "members") spDockMembers(); const k = $("profPanel").dataset.key; if(!$("profOv").hidden && k) openProfile(k, $("profPanel").dataset.view); if(S.mePage && ["feed","business","profile","people"].includes(S.mpTab)){ renderMe.lastTab = null; renderMe(); } if(S.adminPage && S.apTab === "social"){ renderAdmin.lastTab = null; renderAdmin(); } }
// ---- follows ----
const spFollowing = key => { const p = spPubFor(key); return Array.isArray(p.fol) ? p.fol : []; };
const spIFollow = key => spFollowing(spMe()).includes(key);
function spFollowers(key){
  const L = spAllPubs().filter(([uid, p]) => uid !== key && Array.isArray(p.fol) && p.fol.includes(key)).map(([uid]) => uid);
  return {list:L, n:L.length};
}
async function spToggleFollow(key){
  if(!key) return; const me = spMe(); if(key === me || key === "You (demo)") return;
  const cur = spFollowing(me), on = !cur.includes(key), fol = on ? [...cur, key].slice(-500) : cur.filter(x => x !== key);
  if(await spPub(on ? {fol, folT:{[spSafe(key)]:Date.now()}} : {fol})){
    toast(on ? "Following" : "Unfollowed");
    if(isVerified(key) && meId){ const has = S.follows.includes(key); if(on !== has){ S.follows = on ? [...S.follows, key].slice(0, 24) : S.follows.filter(x => x !== key); saveFollows(); renderWall(); } }
    spRerender();
  }
}
// ---- posts ----
const SP_SAMPLE_POSTS = ["Clean read on the 9:30 open today. Called it early and held it. 🔥","New write-up on how I size positions on the 15m rounds. Link on my board.","Rough session, 2 misses in a row. Owning it. Back at it tomorrow.","Streaming the hourly open tonight. Come hang and ask questions.","Shipped an update: faster reads, fewer false signals.","Reminder: the best trade is sometimes no trade. Patience pays.","Thanks for 500 followers! Free Q&A this Sunday.","Kalshi and Polymarket are pricing this round very differently right now 👀"];
const spOff = k => !!(lcfg()[k]);
const spPostHidden = (a, id) => !!((lcfg().postHidden || {})[spLk(a, id)]);
function spPosts(key, pub, raw){
  if(!raw && spOff("noPosts")) return [];
  return spPosts0(key, pub).filter(p => raw || !spPostHidden(p.a, p.id));
}
function spPosts0(key, pub){
  pub = pub || spPubFor(key);
  if(Array.isArray(pub.posts) && pub.posts.length) return pub.posts.filter(x => x && x.b).map(x => ({...x, a:key}));
  if(!spIsSample(key, pub)) return [];
  const s = spSeed(key), n = 2 + s % 3;
  return Array.from({length:n}, (_, i) => ({id:"sp" + i, a:key, b:SP_SAMPLE_POSTS[(s + i*3) % SP_SAMPLE_POSTS.length], t:Date.now() - (i*19 + s % 11 + 2)*3600000, pin:i === 0 && s % 2 === 0, sample:true}));
}
const spLk = (a, id) => spSafe(a) + "__" + spSafe(id);
function spLikes(p){ const lk = spLk(p.a, p.id); return spAllPubs().filter(([, x]) => x.likes && x.likes[lk]).length; }
const spLiked = p => !!((spPubFor(spMe()).likes || {})[spLk(p.a, p.id)]);
function spPostCard(p, opts){
  opts = opts || {}; const mine = p.a === spMe() || (p.a === meId && meId);
  const pk = spProfKey(p.a), nm = p.a === "you" ? "You" : dmName(p.a);
  return `<div class="spost${p.pin ? " pin" : ""}">${opts.author ? `<button class="plink" type="button" data-prof="${esc(pk)}">${dmAv(p.a)}</button>` : ""}<div class="spb">
    <div class="sph">${opts.author ? `<button class="plink who" type="button" data-prof="${esc(pk)}">${nm}</button>${spBizOn(p.a) ? `<span class="rb biz">BUSINESS</span>` : ""}` : ""}${p.pin ? `<span class="sppin">📌 PINNED</span>` : ""}${p.sample ? `<span class="rb str">SAMPLE</span>` : ""}<small>${esc(ago(p.t))}</small></div>
    <p>${dText(p.b)}</p>${/^https:\/\//.test(p.u || "") ? `<a class="splink" href="${esc(p.u)}" target="_blank" rel="noopener noreferrer">${esc(p.u.replace(/^https:\/\/(www\.)?/, "").slice(0, 60))} ↗</a>` : ""}
    <div class="spa"><button type="button" data-splike="${esc(p.a)}|${esc(p.id)}" aria-pressed="${spLiked(p)}">${spLiked(p) ? "♥" : "♡"} ${spLikes(p) || ""}</button>${spOff("noComments") ? "" : `<button type="button" data-spcmt="${esc(spLk(p.a, p.id))}" aria-expanded="${!!(S.spOpen || {})[spLk(p.a, p.id)]}">💬 ${spComments(p).length || ""}</button>`}${mine && !p.sample ? `<button type="button" data-sppin="${esc(p.id)}">${p.pin ? "Unpin" : "📌 Pin"}</button><button type="button" data-spdel="${esc(p.id)}">Delete</button>` : ""}</div>${(S.spOpen || {})[spLk(p.a, p.id)] && !spOff("noComments") ? spCmtBlock(p) : ""}</div></div>`;
}
function spComposer(px){ return `<div class="spcomp"><textarea id="${px}Txt" maxlength="500" placeholder="Share an update, a win, a lesson or a link…"></textarea><div class="spcr"><input id="${px}Url" maxlength="300" placeholder="Link (optional) https://…"><button class="btn sm" type="button" data-sppost="${px}">Post</button></div></div>`; }
function spSorted(L){ return L.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.t - a.t); }
// ---- business ----
function spCanBiz(key){
  if(!key) return false;
  if(key === "you" || key === "You (demo)" || (key === meId && meId)) { if(mpPreview()) return true; key = meId; }
  if(/^p:/.test(key)){ const c = (getProfiles()[key.slice(2)] || {}).cats || {}; return !!(c.caller || c.botdev || c.scripter); }
  if(/^mock-/.test(key)) return true;
  const c = catsOf(key);
  return isVerified(key) || !!(c.caller || c.botdev || c.scripter) || Object.keys(((S.botDocs || {})[key] || {}).list || {}).length > 0 || Object.keys(((S.scDocs || {})[key] || {}).list || {}).length > 0 || Object.values(getEnts()).some(e => e && !e.deleted && e.ownerId === key);
}
function spRolesOf(key){
  const out = [], id = key === "You (demo)" || key === "you" ? meId : key;
  if(/^p:/.test(key)){ const c = (getProfiles()[key.slice(2)] || {}).cats || {}; if(c.caller) out.push("caller"); if(c.botdev) out.push("bot"); if(c.scripter) out.push("script"); return out; }
  if(/^mock-/.test(key)) return ["caller"];
  if(!id) return mpPreview() ? ["caller"] : out;
  const c = catsOf(id);
  if(isVerified(id) || c.caller) out.push("caller");
  if(c.botdev || Object.keys(((S.botDocs || {})[id] || {}).list || {}).length || Object.values(getEnts()).some(e => e && e.ownerId === id && e.kind === "bot")) out.push("bot");
  if(c.scripter || Object.keys(((S.scDocs || {})[id] || {}).list || {}).length || Object.values(getEnts()).some(e => e && e.ownerId === id && e.kind === "script")) out.push("script");
  return out;
}
const SP_ROLE = {caller:["CALLER","var(--callers)"], bot:["BOT OWNER","var(--bots)"], script:["CHART SCRIPTER","var(--scripts)"]};
function spBiz(key, pub, raw){
  if(!raw && (spOff("noBiz") || (lcfg().bizHidden || {})[spSafe(key === "You (demo)" ? spMe() : key)])) return null;
  pub = pub || spPubFor(key);
  if(pub.biz && pub.biz.on) return pub.biz;
  if(!spIsSample(key, pub) || !spCanBiz(key)) return null;
  const s = spSeed(key), nm = (pub.name || String(key).replace(/^mock-/, "")).replace(/ \(demo\)$/, ""), roles = spRolesOf(key);
  const cat = roles.includes("bot") ? "Bot / automation" : roles.includes("script") ? "Chart indicators" : ["Signals & alerts","Trading education","Coaching & mentoring","Research & newsletter"][s % 4];
  const svc = roles.includes("bot") ? [["Bot access · monthly","$49/mo","Live final calls and reads every 15 minutes."],["Setup call","$99","One-on-one walkthrough of the bot and its data sources."]]
    : roles.includes("script") ? [["Indicator license","$29/mo","Invite-only TradingView access with updates."],["Lifetime license","$249","One payment, every future version."]]
    : [["Signals room","$39/mo","Every call posted before the round locks, with notes."],["1:1 coaching","$120/hr","Review your trades and build a plan."],["Free newsletter","Free","Weekly recap every Sunday."]];
  return {on:true, sample:true, name:`${nm} ${["Signals","Trading Co.","Labs","Research"][s % 4]}`, cat, tag:pub.tagline || "", about:pub.bio || "", svc:svc.slice(0, 2 + s % 2).map(([n, p, d]) => ({n, p, d})), hours:"", since:pub.f || 0};
}
const spBizOn = key => !!spBiz(key);
function spTrack(key, pub){
  const id = key === "You (demo)" || key === "you" ? meId : (/^[p]:|^mock-/.test(key) ? null : key), rows = [];
  const roles = spRolesOf(key);
  if(roles.includes("caller")) rows.push(["Caller record", id ? callerStats(id) : (pub.rec || "—"), "var(--callers)"]);
  if(id){
    Object.entries(((S.botDocs || {})[id] || {}).list || {}).forEach(([bid, b]) => rows.push([`🤖 ${b.name}`, taggedStats("bot", id, bid), "var(--bots)"]));
    Object.entries(((S.scDocs || {})[id] || {}).list || {}).forEach(([sid, b]) => rows.push([`📈 ${b.name}`, taggedStats("script", id, sid), "var(--scripts)"]));
  }
  const nm = ((pub && pub.name) || String(key).replace(/^mock-/, "")).replace(/ \(demo\)$/, "").toLowerCase();
  Object.values(getEnts()).filter(e => e && !e.deleted && ((id && e.ownerId === id) || (!id && (e.owner || "").toLowerCase() === nm))).forEach(e => rows.push([`${e.kind === "bot" ? "🤖" : "📈"} ${e.name}`, e.rec || "no record yet", e.kind === "bot" ? "var(--bots)" : "var(--scripts)"]));
  return rows;
}
function spBizCard(ctx, full){
  const B = spBiz(ctx.key, ctx.pub); if(!B) return "";
  const roles = spRolesOf(ctx.key), rv = revStats(reviewsFor(ctx.key, ctx.name, spIsSample(ctx.key, ctx.pub))), fo = spFollowers(ctx.id || ctx.key);
  const head = `<div class="bizhd"><span class="bizlogo" style="background:${esc(ctx.color || "#4DA3FF")}">${esc((B.name || "B")[0].toUpperCase())}</span><div style="min-width:0"><b>${esc(B.name || ctx.name)}</b><small>${esc(B.cat || "Business")}</small><div class="pbd">${roles.map(r => `<span class="tb" style="--c:${SP_ROLE[r][1]}">${SP_ROLE[r][0]}</span>`).join("")}<span class="rb biz">BUSINESS</span>${B.sample ? `<span class="rb str">SAMPLE</span>` : ""}</div></div></div>`;
  const svcs = (B.svc || []).filter(x => x && x.n);
  if(!full) return `<div class="psec bizsec"><h4>Business <span>${esc(B.cat || "")}</span></h4>${head}${B.tag ? `<p class="pabout">${esc(B.tag)}</p>` : ""}${svcs.length ? `<div class="bizsv mini">${svcs.slice(0, 2).map(x => `<div><b>${esc(x.n)}</b><em>${esc(x.p || "")}</em></div>`).join("")}</div>` : ""}<div class="aacts"><button class="btn sm" type="button" data-profview="biz">View business page →</button></div></div>`;
  const track = spTrack(ctx.key, ctx.pub);
  return `<div class="psec bizsec full">${head}
    ${B.tag ? `<p class="biztag">${esc(B.tag)}</p>` : ""}${B.about ? `<p class="pabout">${esc(B.about)}</p>` : ""}
    <div class="pstats"><div><b>${rv.n ? rv.avg.toFixed(1) + " ★" : "—"}</b><span>${rv.n} review${rv.n === 1 ? "" : "s"}</span></div><div><b>${fmtN(fo.n)}</b><span>Followers</span></div><div><b>${track.length}</b><span>Tracked record${track.length === 1 ? "" : "s"}</span></div></div>
    ${track.length ? `<h4>Verified track record <span>calculated by D3MON.CO</span></h4><div class="biztr">${track.map(([l, v, c]) => `<div style="--c:${c}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
    ${svcs.length ? `<h4>Services & pricing</h4><div class="bizsv">${svcs.map(x => `<div><div class="r"><b>${esc(x.n)}</b><em>${esc(x.p || "")}</em></div>${x.d ? `<p>${esc(x.d)}</p>` : ""}${/^https:\/\//.test(x.u || "") ? `<a class="watch2" href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">Get it ↗</a>` : ""}</div>`).join("")}</div>` : ""}
    <div class="bizct">${/^https:\/\//.test(B.book || "") ? `<a class="pcta" href="${esc(B.book)}" target="_blank" rel="noopener noreferrer">${esc(B.bookLabel || "Book / sign up")} ↗</a>` : ""}${B.email ? `<a class="watch2" href="mailto:${esc(B.email)}">✉ ${esc(B.email)}</a>` : ""}${B.hours ? `<span class="pfine">🕑 ${esc(B.hours)}</span>` : ""}</div>
    <p class="pfine">Track records come from calls logged on D3MON.CO and can't be edited by the business. Not financial advice.</p></div>`;
}
// ---- profile pieces (called from openProfile) ----
function profSocialTop(ctx){
  const k = ctx.id || ctx.key, self = ctx.isSelf, posts = spPosts(self ? spMe() : k, self ? spPubFor(spMe()) : ctx.pub), fo = spFollowers(self ? spMe() : k), fg = spFollowing(self ? spMe() : k);
  const following = !self && spIFollow(k), biz = spBizOn(self ? spMe() : k) && spCanBiz(self ? spMe() : k), v = ctx.view || "main", pub = self ? spPubFor(spMe()) : ctx.pub;
  return `<div class="psoc2"><div class="pcounts"><button type="button" data-profview="main"><b>${fmtN(posts.length)}</b>posts</button><button type="button" data-profview="fol"><b>${fmtN(fo.n)}</b>followers</button><button type="button" data-profview="fing"><b>${fmtN(fg.length)}</b>following</button></div>
    ${self ? "" : `<button class="spfol${following ? " on" : ""}" type="button" data-spfollow="${esc(k)}">${following ? "✓ Following" : "+ Follow"}</button>`}
    ${pub.loc ? `<span class="sploc">📍 ${esc(pub.loc)}</span>` : ""}</div>
    ${S.profHover ? "" : `<div class="ptabs"><button type="button" data-profview="main" aria-pressed="${v === "main"}">Profile</button>${biz ? `<button type="button" data-profview="biz" aria-pressed="${v === "biz"}">🏢 Business</button>` : ""}<button type="button" data-profview="board" aria-pressed="${v === "board"}">💬 Board</button></div>`}`;
}
function profSpecial(ctx){
  const k = ctx.isSelf ? spMe() : (ctx.id || ctx.key);
  if(ctx.view === "biz") return spBizCard({...ctx, key:ctx.isSelf ? spMe() : ctx.key, pub:ctx.isSelf ? spPubFor(spMe()) : ctx.pub}, true) || `<div class="psec"><p class="pfine">No business page yet.</p></div>`;
  const list = ctx.view === "fol" ? spFollowers(k).list : spFollowing(k), extra = ctx.view === "fol" ? spFollowers(k).n - list.length : 0;
  return `<div class="psec"><h4>${ctx.view === "fol" ? "Followers" : "Following"} <span>${fmtN(list.length + extra)}</span></h4>${list.length ? `<div class="splist">${list.slice(0, 60).map(x => `<button class="plink" type="button" data-prof="${esc(spProfKey(x))}">${dmAv(x, "sm")}<span>${x === "you" ? "You" : dmName(x)}</span></button>`).join("")}</div>` : ""}${extra ? `<p class="pfine">${list.length ? "+ " : ""}${fmtN(extra)} sample followers</p>` : !list.length ? `<p class="pfine">${ctx.view === "fol" ? "No followers yet." : "Not following anyone yet."}</p>` : ""}<div class="aacts"><button class="xbtn2" type="button" data-profview="main">← Back to profile</button></div></div>`;
}
function profMainExtras(ctx){
  const k = ctx.isSelf ? spMe() : (ctx.id || ctx.key), pub = ctx.isSelf ? spPubFor(spMe()) : ctx.pub;
  const biz = spCanBiz(k) ? spBizCard({...ctx, key:ctx.isSelf ? spMe() : ctx.key, pub}, false) : "";
  const posts = spSorted(spPosts(k, pub));
  if(S.profHover || (spOff("noPosts") && !posts.length)) return biz;
  return biz + `<div class="psec"><h4>Posts <span>${posts.length}</span></h4>${ctx.isSelf && !spOff("noPosts") && (S.demo || mpPreview() || (meId && canWrite)) ? spComposer("pp") : ""}${posts.length ? `<div class="spfeed">${posts.slice(0, 8).map(p => spPostCard(p)).join("")}</div>` : `<p class="pfine">${ctx.isSelf ? "Share your first update." : "No posts yet."}</p>`}</div>`;
}
// ---- My D3MON: feed + business editor ----
function spCandidates(){
  const out = new Map();
  spAllPubs().forEach(([uid]) => { if(uid !== spMe()) out.set(uid, true); });
  try { liveProfiles().forEach(([pid]) => out.set("p:" + pid, true)); } catch {}
  return [...out.keys()];
}
function spFeedHtml(){
  const me = spMe(), fol = spFollowing(me), keys = [me, ...fol];
  const posts = keys.flatMap(k => spPosts(k)).sort((a, b) => b.t - a.t).slice(0, 60);
  const cand = spCandidates().filter(k => !fol.includes(k));
  const sug = cand.filter(k => spPosts(k).length || spBizOn(k)).slice(0, 8);
  const bizL = spCandidates().filter(k => spCanBiz(k) && spBizOn(k)).slice(0, 8);
  const who2 = k => `<div class="spwho"><button class="plink" type="button" data-prof="${esc(spProfKey(k))}">${dmAv(k, "sm")}</button><div style="min-width:0"><button class="plink who" type="button" data-prof="${esc(spProfKey(k))}">${dmName(k)}</button><small>${spBizOn(k) ? esc((spBiz(k) || {}).name || "") : fmtN(spFollowers(k).n) + " followers"}</small></div><button class="spfol sm${spIFollow(k) ? " on" : ""}" type="button" data-spfollow="${esc(k)}">${spIFollow(k) ? "✓" : "+ Follow"}</button></div>`;
  return `<div class="spgrid"><div class="acard"><h3>Your feed <small>you + ${fol.length} you follow</small></h3>${spOff("noPosts") ? `<p class="hint">Posting is turned off by the site admin right now.</p>` : spComposer("mf")}${posts.length ? `<div class="spfeed">${posts.map(p => spPostCard(p, {author:true})).join("")}</div>` : `<div class="aempty">Nothing here yet. Follow people on the right, or post your first update.</div>`}</div>
    <div style="display:grid;gap:12px;align-content:start">${spActivityCard()}<div class="acard"><h3>Who to follow</h3>${sug.map(who2).join("") || `<p class="hint">You're following everyone with posts.</p>`}</div>
    <div class="acard"><h3>Businesses <small>callers, bot owners & scripters</small></h3>${bizL.map(who2).join("") || `<p class="hint">No business pages yet.</p>`}</div></div></div>`;
}
function spBizEditor(){
  const me = spMe();
  if(!spCanBiz(me)) return `<div class="acard"><h3>Business page <small>for callers, bot owners and chart scripters</small></h3><p class="hint">Members with the Caller, Bot owner or Chart scripter role can turn their profile into a business page: business name, services and pricing, booking link, and a verified track record calculated from their calls. Get approved under Connect to unlock it.</p><div class="aacts"><button class="btn sm" type="button" data-mptab="connect">Apply under Connect</button></div></div>`;
  const pub = spPubFor(me), B = pub.biz || {}, sv = (B.svc || []).concat(Array(6).fill({})).slice(0, 6), roles = spRolesOf(me);
  return `<div class="acard"><h3>Business page <small>${roles.map(r => SP_ROLE[r][0]).join(" · ")}</small></h3><p class="hint">Market yourself as a business. Your business page shows on your profile with a BUSINESS badge, in the directories and in everyone's feed suggestions. Your track record is filled in automatically from your calls.</p>
    <label class="atog"><input type="checkbox" id="bz_on" ${B.on ? "checked" : ""}>Show my business page</label>
    <div class="aform"><div class="af"><label for="bz_name">Business name</label><input id="bz_name" maxlength="50" value="${esc(B.name || "")}" placeholder="Nova Signals"></div>
      <div class="af"><label for="bz_cat">Category</label><select id="bz_cat">${SP_BIZCAT.map(c => `<option ${B.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <div class="af w"><label for="bz_tag">Headline</label><input id="bz_tag" maxlength="100" value="${esc(B.tag || "")}" placeholder="BTC 15m calls before every lock · 300+ calls tracked"></div>
      <div class="af w"><label for="bz_about">About the business</label><textarea id="bz_about" maxlength="800" placeholder="What you offer, who it's for, how it works">${esc(B.about || "")}</textarea></div>
      <div class="af"><label for="bz_book">Booking / sign-up link</label><input id="bz_book" maxlength="300" value="${esc(B.book || "")}" placeholder="https://"></div>
      <div class="af"><label for="bz_bookl">Button text</label><input id="bz_bookl" maxlength="30" value="${esc(B.bookLabel || "")}" placeholder="Join the signals room"></div>
      <div class="af"><label for="bz_email">Business email</label><input id="bz_email" type="email" maxlength="80" value="${esc(B.email || "")}" placeholder="hello@yourbiz.com"></div>
      <div class="af"><label for="bz_hours">Hours</label><input id="bz_hours" maxlength="80" value="${esc(B.hours || "")}" placeholder="Mon–Fri 9:30–4 ET"></div></div>
    <h4 style="margin:6px 0 0;font:700 11px var(--mono);letter-spacing:.14em;color:var(--ink-3)">SERVICES & PRICING · up to 6</h4>
    <div class="bzsv">${sv.map((x, i) => `<div class="bzrow"><input id="bz_sn${i}" maxlength="50" value="${esc(x.n || "")}" placeholder="${i ? "Service name" : "e.g. Signals room"}"><input id="bz_sp${i}" maxlength="20" value="${esc(x.p || "")}" placeholder="${i ? "Price" : "e.g. $39/mo"}"><input id="bz_sd${i}" maxlength="140" value="${esc(x.d || "")}" placeholder="${i ? "Description" : "e.g. Every call posted before the lock"}"><input id="bz_su${i}" maxlength="300" value="${esc(x.u || "")}" placeholder="Link https://"></div>`).join("")}</div>
    <p class="hint">Your main button, offer, schedule and highlights from <button class="xbtn2" type="button" data-mptab="profile">My profile</button> show at the top of your profile, right above the business page.</p>
    <div class="aacts"><button class="btn sm" type="button" data-bzsave>Save business page</button><button class="btn ghost sm" type="button" data-bzview>Preview business page</button></div></div>`;
}
document.addEventListener("click", async e => {
  const t = e.target;
  const f = t.closest("[data-spfollow]"); if(f){ e.preventDefault(); e.stopPropagation(); await spToggleFollow(f.dataset.spfollow); return; }
  const lk = t.closest("[data-splike]"); if(lk){ const [a, id] = lk.dataset.splike.split("|"), k = spLk(a, id), on = !((spPubFor(spMe()).likes || {})[k]); await spPub({likes:{[k]:on ? Date.now() : 0}}); spRerender(); return; }
  const pp = t.closest("[data-sppost]"); if(pp){ const px = pp.dataset.sppost, b = ($(px + "Txt").value || "").trim().slice(0, 500), u = ($(px + "Url").value || "").trim(); if(!b) return toast("Write something first.");
    if(u && !/^https:\/\//.test(u)) return toast("Links need to start with https://"); if(guestBlocked("board") || !sendGuard()) return;
    const posts = [{id:newId(), b, u, t:Date.now()}, ...(spPubFor(spMe()).posts || [])].slice(0, 40);
    if(await spPub({posts}, "Posted")){ spRerender(); } return; }
  const pin = t.closest("[data-sppin]"); if(pin){ const posts = (spPubFor(spMe()).posts || []).map(x => ({...x, pin:x.id === pin.dataset.sppin ? !x.pin : false})); if(await spPub({posts})) spRerender(); return; }
  const dl = t.closest("[data-spdel]"); if(dl){ const posts = (spPubFor(spMe()).posts || []).filter(x => x.id !== dl.dataset.spdel); if(await spPub({posts}, "Post deleted")) spRerender(); return; }
  if(t.closest("[data-bzview]")){ spPublicView("biz"); return; }
  if(t.closest("[data-bzsave]")){
    const v = id => ($(id) ? $(id).value.trim() : ""), book = v("bz_book");
    if(book && !/^https:\/\//.test(book)) return toast("The booking link needs to start with https://");
    const svc = []; for(let i = 0; i < 6; i++){ const n = v("bz_sn" + i), u = v("bz_su" + i); if(!n) continue; if(u && !/^https:\/\//.test(u)) return toast(`The link for “${n}” needs to start with https://`); svc.push({n, p:v("bz_sp" + i), d:v("bz_sd" + i), u}); }
    const biz = {on:$("bz_on").checked, name:v("bz_name"), cat:v("bz_cat"), tag:v("bz_tag"), about:($("bz_about").value || "").trim().slice(0, 800), book, bookLabel:v("bz_bookl"), email:v("bz_email"), hours:v("bz_hours"), svc, since:(spPubFor(spMe()).biz || {}).since || Date.now()};
    if(biz.on && !biz.name) return toast("Give your business a name.");
    if(await spPub({biz}, biz.on ? "Business page is live" : "Business page saved (hidden)")){ renderMe.lastTab = null; renderMe(); }
  }
});

// ---- comments on posts ----
S.spOpen = {}; S.spF = "all"; S.spSort = "followers";
function spComments(p){
  const lk = spLk(p.a, p.id), hideC = spPubFor(p.a).hideC || {}, ph = lcfg().postHidden || {}, out = [];
  spAllPubs().forEach(([uid, x]) => Object.entries(x.cmts || {}).forEach(([cid, c]) => { if(c && c.p === lk && c.b && !c.del && !hideC[cid] && !ph["c_" + cid]) out.push({id:cid, a:uid, b:c.b, t:c.t || 0}); }));
  return out.sort((a, b) => a.t - b.t);
}
function spCmtBlock(p){
  const lk = spLk(p.a, p.id), L = spComments(p), mineP = p.a === spMe(), can = S.demo || mpPreview() || (meId && canWrite);
  return `<div class="spcm">${L.map(c => `<div class="spc"><button class="plink" type="button" data-prof="${esc(spProfKey(c.a))}">${dmAv(c.a, "sm")}</button><div style="min-width:0"><div class="sph"><button class="plink who" type="button" data-prof="${esc(spProfKey(c.a))}">${c.a === "you" ? "You" : dmName(c.a)}</button><small>${esc(ago(c.t))}</small>${c.a === spMe() ? `<button class="spx" type="button" data-spcdel="${esc(c.id)}">delete</button>` : mineP ? `<button class="spx" type="button" data-spchide="${esc(c.id)}">hide</button>` : ""}</div><p>${dText(c.b)}</p></div></div>`).join("") || `<p class="pfine">No comments yet.</p>`}
    ${can ? `<div class="spcf"><input id="spc_${esc(lk)}" maxlength="300" placeholder="Write a comment…" aria-label="Write a comment"><button class="btn sm" type="button" data-spcsend="${esc(lk)}">Reply</button></div>` : ""}</div>`;
}
// ---- activity on my profile: follows, likes, comments ----
function spActivity(){
  const me = spMe(), mine = new Set(spPosts(me, null, true).map(p => spLk(p.a, p.id))), ev = [];
  spAllPubs().forEach(([uid, x]) => {
    if(uid === me) return;
    if(Array.isArray(x.fol) && x.fol.includes(me)) ev.push({k:"f", a:uid, t:+((x.folT || {})[spSafe(me)] || 0), key:"f:" + uid});
    Object.entries(x.likes || {}).forEach(([lk, v]) => { if(v && mine.has(lk)) ev.push({k:"l", a:uid, t:+v > 1 ? +v : 0, key:"l:" + uid + ":" + lk}); });
    Object.entries(x.cmts || {}).forEach(([cid, c]) => { if(c && !c.del && c.b && mine.has(c.p)) ev.push({k:"c", a:uid, t:c.t || 0, b:c.b, key:"c:" + cid}); });
  });
  return ev.sort((a, b) => b.t - a.t);
}
const spEvText = e => e.k === "f" ? "started following you" : e.k === "l" ? "liked your post" : `commented: “${String(e.b || "").slice(0, 80)}”`;
function spActivityCard(){
  const ev = spActivity().slice(0, 12);
  return `<div class="acard"><h3>Activity <small>on your profile</small></h3>${ev.length ? ev.map(e => `<div class="spwho"><button class="plink" type="button" data-prof="${esc(spProfKey(e.a))}">${dmAv(e.a, "sm")}</button><div style="min-width:0"><button class="plink who" type="button" data-prof="${esc(spProfKey(e.a))}">${dmName(e.a)}</button><small>${esc(spEvText(e))}${e.t ? " · " + esc(ago(e.t)) : ""}</small></div></div>`).join("") : `<p class="hint">New followers, likes and comments show up here.</p>`}</div>`;
}
let spSeen = null;
setInterval(() => {
  if(!S.ready && db) return;
  const ev = spActivity(), keys = new Set(ev.map(e => e.key));
  if(spSeen === null){ spSeen = keys; return; }
  const fresh = ev.filter(e => !spSeen.has(e.key)); spSeen = keys;
  if(!fresh.length || (S.alerts || {}).social === false) return;
  const e = fresh[0], known = e.a === "you" ? "You" : (/^(p:|mock-)/.test(e.a) ? acctName(e.a) : (S.memProf[e.a] || {}).name || S.nameCache[e.a] || "");
  const say = nm => toast(fresh.length > 1 ? `${nm} ${spEvText(e)} · +${fresh.length - 1} more` : `${nm} ${spEvText(e)}`);
  if(known || !user) say(known || "Someone"); else user.profiles([e.a]).then(ps => { const n = (ps && ps[e.a] && ps[e.a].name) || "Someone"; S.nameCache[e.a] = n; say(n); }).catch(() => say("Someone"));
  if(S.mePage && S.mpTab === "feed" && !($("mpBody").contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName))){ renderMe.lastTab = null; renderMe(); }
}, 6000);
// ---- People directory ----
function spPeopleHtml(){
  if(db && !S.demo) memLoadProfiles();
  const me = spMe(), fol = spFollowing(me), myF = new Set(spFollowers(me).list);
  let L = spCandidates().filter(k => k !== me && k !== meId);
  const F = S.spF, roles = k => spRolesOf(k);
  const F2 = {all:() => true, biz:k => spCanBiz(k) && spBizOn(k), caller:k => roles(k).includes("caller"), bot:k => roles(k).includes("bot"), script:k => roles(k).includes("script"), following:k => fol.includes(k), followers:k => myF.has(k)};
  const cnt = f => L.filter(F2[f]).length;
  L = L.filter(F2[F] || F2.all);
  const nm = k => (/^(p:|mock-)/.test(k) ? acctName(k) : (S.memProf[k] || {}).name || S.nameCache[k] || "Member");
  const last = k => Math.max(0, ...spPosts(k).map(p => p.t || 0));
  L.sort(S.spSort === "az" ? (a, b) => nm(a).localeCompare(nm(b)) : S.spSort === "recent" ? (a, b) => last(b) - last(a) : (a, b) => spFollowers(b).n - spFollowers(a).n || nm(a).localeCompare(nm(b)));
  const card = k => { const p = spPubFor(k), B = spCanBiz(k) ? spBiz(k) : null, fo = spFollowers(k).n, pc = spPosts(k).length, rs = roles(k);
    return `<div class="sppc" data-txt="${esc((nm(k) + " " + (p.tagline || "") + " " + (B ? B.name + " " + B.cat : "")).toLowerCase())}"><div class="sppb" style="${spBannerCss(p) ? `background:${spBannerCss(p)}` : `background:${esc(p.color || "#1A2530")}`}"></div>
      <button class="plink" type="button" data-prof="${esc(spProfKey(k))}">${dmAv(k)}</button>
      <div class="sppn"><button class="plink who" type="button" data-prof="${esc(spProfKey(k))}">${dmName(k)}</button>${p.sample ? `<span class="rb str">SAMPLE</span>` : ""}</div>
      ${B ? `<div class="sppbz">🏢 ${esc(B.name)}</div>` : ""}${p.tagline ? `<p>${esc(p.tagline)}</p>` : ""}
      <div class="pbd">${rs.map(r => `<span class="tb" style="--c:${SP_ROLE[r][1]}">${SP_ROLE[r][0]}</span>`).join("")}${B ? `<span class="rb biz">BUSINESS</span>` : ""}</div>
      <div class="sppm"><span><b>${fmtN(fo)}</b> followers</span><span><b>${pc}</b> posts</span></div>
      <button class="spfol sm${fol.includes(k) ? " on" : ""}" type="button" data-spfollow="${esc(k)}">${fol.includes(k) ? "✓ Following" : "+ Follow"}</button></div>`; };
  const FL = [["all","Everyone"],["biz","Businesses"],["caller","Callers"],["bot","Bot owners"],["script","Chart scripters"],["following","I follow"],["followers","Follow me"]];
  return `<div class="acard"><h3>People <small>${L.length} shown</small></h3>
    <div class="mfil">${FL.map(([k, l]) => `<button type="button" data-spf="${k}" aria-pressed="${F === k}">${esc(l)} <b>${cnt(k)}</b></button>`).join("")}</div>
    <div class="mbar"><div class="af"><label for="spQ">Search</label><input id="spQ" type="search" placeholder="Name, tagline or business" autocomplete="off"></div>
      <div class="af" style="flex:0 1 200px"><label for="spSort">Sort</label><select id="spSort">${[["followers","Most followers"],["recent","Latest posts"],["az","Name A–Z"]].map(([k, l]) => `<option value="${k}" ${S.spSort === k ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
    <div class="sppg" id="spPeople">${L.map(card).join("") || `<div class="aempty">No one matches this filter yet.</div>`}</div></div>`;
}
document.addEventListener("input", e => { if(e.target.id !== "spQ") return; const q = e.target.value.trim().toLowerCase(); document.querySelectorAll("#spPeople .sppc").forEach(c => c.hidden = !!q && !c.dataset.txt.includes(q)); });
document.addEventListener("change", e => { if(e.target.id === "spSort"){ S.spSort = e.target.value; renderMe.lastTab = null; renderMe(); } });
// ---- admin: posts & business pages ----
function spAdminRows(){
  const posts = [];
  const seen = new Set();
  spAllPubs().forEach(([uid]) => { seen.add(uid); spPosts(uid, null, true).forEach(p => posts.push(p)); });
  try { liveProfiles().forEach(([pid]) => spPosts("p:" + pid, null, true).forEach(p => posts.push(p))); } catch {}
  const cmts = []; spAllPubs().forEach(([uid, x]) => Object.entries(x.cmts || {}).forEach(([cid, c]) => { if(c && c.b && !c.del) cmts.push({id:cid, a:uid, b:c.b, t:c.t || 0}); }));
  const biz = spCandidates().concat(meId ? [meId] : mpPreview() ? ["you"] : []).filter(k => spCanBiz(k) && spBiz(k, null, true));
  return {posts:posts.sort((a, b) => b.t - a.t), cmts:cmts.sort((a, b) => b.t - a.t), biz};
}
function spAdminHtml(){
  const c = lcfg(), R = spAdminRows(), ph = c.postHidden || {}, bh = c.bizHidden || {};
  return `<div class="acard"><h3>Social features <small>switch them off for everyone</small></h3>
      <label class="atog"><input type="checkbox" id="spa_posts" ${c.noPosts ? "" : "checked"}>Members can post updates on their profiles</label>
      <label class="atog"><input type="checkbox" id="spa_cmts" ${c.noComments ? "" : "checked"}>Members can comment on posts</label>
      <label class="atog"><input type="checkbox" id="spa_biz" ${c.noBiz ? "" : "checked"}>Callers, bot owners and chart scripters can show a business page</label>
      <label class="atog"><input type="checkbox" id="spa_screen" ${c.noScreen ? "" : "checked"}>Every member can share their screen in the Cortex</label>
      <div class="aacts"><button class="btn sm" type="button" data-spadm="switch">Save</button></div>
      <p class="hint">Turning a feature off hides it everywhere right away. Nothing is deleted, so turning it back on brings everything back.</p></div>
    <div class="acard"><h3>Business pages <small>${R.biz.length}</small></h3><div class="alist">${R.biz.length ? R.biz.map(k => { const B = spBiz(k, null, true), hid = !!bh[spSafe(k)]; return `<div class="arow"><span class="adot" style="--c:#5BE3C8"></span><div class="t"><button class="plink" type="button" data-prof="${esc(spProfKey(k))}"><b>${esc(B.name || "")}</b></button> · ${dmName(k)}${B.sample ? ` <span class="rb str">SAMPLE</span>` : ""}${hid ? ` <span class="pst" style="--c:#FF4D6A">HIDDEN</span>` : ""}<small>${esc(B.cat || "")}${(B.svc || []).length ? " · " + B.svc.length + " services" : ""}</small></div><div class="aacts"><button class="xbtn2" type="button" data-spadm="biz|${esc(spSafe(k))}">${hid ? "Show" : "Hide"}</button></div></div>`; }).join("") : `<div class="aempty">No business pages yet.</div>`}</div></div>
    <div class="acard"><h3>Recent posts <small>${R.posts.length}</small></h3><div class="alist">${R.posts.length ? R.posts.slice(0, 60).map(p => { const lk = spLk(p.a, p.id), hid = !!ph[lk]; return `<div class="arow">${dmAv(p.a, "sm")}<div class="t">${p.a === "you" ? "You" : dmName(p.a)}${p.sample ? ` <span class="rb str">SAMPLE</span>` : ""}${hid ? ` <span class="pst" style="--c:#FF4D6A">HIDDEN</span>` : ""}<small>${esc(ago(p.t))} · ${esc(String(p.b).slice(0, 160))}</small></div><div class="aacts"><button class="xbtn2" type="button" data-spadm="post|${esc(lk)}">${hid ? "Restore" : "Hide"}</button></div></div>`; }).join("") : `<div class="aempty">No posts yet.</div>`}</div></div>
    <div class="acard"><h3>Recent comments <small>${R.cmts.length}</small></h3><div class="alist">${R.cmts.length ? R.cmts.slice(0, 60).map(x => { const hid = !!ph["c_" + x.id]; return `<div class="arow">${dmAv(x.a, "sm")}<div class="t">${x.a === "you" ? "You" : dmName(x.a)}${hid ? ` <span class="pst" style="--c:#FF4D6A">HIDDEN</span>` : ""}<small>${esc(ago(x.t))} · ${esc(String(x.b).slice(0, 160))}</small></div><div class="aacts"><button class="xbtn2" type="button" data-spadm="post|c_${esc(x.id)}">${hid ? "Restore" : "Hide"}</button></div></div>`; }).join("") : `<div class="aempty">No comments yet.</div>`}</div></div>`;
}
async function spAdmSave(patch, msg){
  const c = lcfg(); S.listCfg = {...c, ...patch, ...(patch.postHidden ? {postHidden:{...(c.postHidden || {}), ...patch.postHidden}} : {}), ...(patch.bizHidden ? {bizHidden:{...(c.bizHidden || {}), ...patch.bizHidden}} : {})};
  if(apPreview()) toast(msg + " (preview only)"); else await apSave("config/listing", patch, msg);
  spRerender(); renderAdmin.lastTab = null; renderAdmin(); if(S.callersPage) renderCallerDir();
}
// ---- bot / script profiles: link to the builder's business page ----
function spEntOwnerKey(e){
  if(e.ownerId) return e.ownerId;
  const n = (e.owner || "").toLowerCase(); if(!n) return null;
  try { const hit = liveProfiles().find(([, p]) => (p.name || "").toLowerCase() === n); if(hit) return "p:" + hit[0]; } catch {}
  return null;
}
function spEntOwnerBiz(e){ const k = spEntOwnerKey(e); return k && spCanBiz(k) && spBizOn(k) ? ` · <button class="plink spbizlink" type="button" data-spbizgo="${esc(k)}">🏢 ${esc((spBiz(k) || {}).name || "Business page")} →</button>` : ""; }
// ---- Cosmic context ----
function spNebContext(){
  const me = spMe(), fol = spFollowing(me), fe = spFollowers(me).n;
  const feed = [me, ...fol].flatMap(k => spPosts(k)).sort((a, b) => b.t - a.t).slice(0, 8).map(p => `${p.a === me ? "You" : (/^(p:|mock-)/.test(p.a) ? acctName(p.a) : (S.memProf[p.a] || {}).name || S.nameCache[p.a] || "member")}: ${String(p.b).slice(0, 140)}`);
  const biz = spCandidates().filter(k => spCanBiz(k) && spBizOn(k)).slice(0, 12).map(k => { const B = spBiz(k); return `${B.name} (${B.cat}${(B.svc || []).length ? "; " + B.svc.map(s => s.n + (s.p ? " " + s.p : "")).join(", ") : ""})`; });
  return `Viewer's profile: ${fe} followers, follows ${fol.length}, ${spPosts(me).length} posts${spCanBiz(me) ? `, business page ${spBizOn(me) ? "on" : "off"}` : ", not eligible for a business page"}.\nLatest posts in the viewer's feed:\n${feed.join("\n") || "(none)"}\nBusiness pages on the site: ${biz.join("; ") || "none"}`;
}
document.addEventListener("click", async e => {
  const t = e.target;
  const bg = t.closest("[data-spbizgo]"); if(bg){ e.preventDefault(); e.stopPropagation(); openFull(bg.dataset.spbizgo, "biz"); return; }
  const cm = t.closest("[data-spcmt]"); if(cm){ const k = cm.dataset.spcmt; S.spOpen[k] = !S.spOpen[k]; spRerender(); setTimeout(() => { const i = document.getElementById("spc_" + k); if(i && S.spOpen[k]) i.focus(); }, 30); return; }
  const cs = t.closest("[data-spcsend]"); if(cs){ const lk = cs.dataset.spcsend, i = document.getElementById("spc_" + lk), b = (i && i.value || "").trim().slice(0, 300); if(!b) return toast("Write a comment first."); if(!sendGuard()) return;
    if(await spPub({cmts:{[newId()]:{p:lk, b, t:Date.now()}}})){ S.spOpen[lk] = true; spRerender(); } return; }
  const cd = t.closest("[data-spcdel]"); if(cd){ if(await spPub({cmts:{[cd.dataset.spcdel]:{del:true, b:""}}}, "Comment deleted")) spRerender(); return; }
  const ch = t.closest("[data-spchide]"); if(ch){ if(await spPub({hideC:{[ch.dataset.spchide]:true}}, "Comment hidden from your post")) spRerender(); return; }
  const sf = t.closest("[data-spf]"); if(sf){ S.spF = sf.dataset.spf; renderMe.lastTab = null; renderMe(); return; }
  const ad = t.closest("[data-spadm]"); if(ad){ const [k, v] = ad.dataset.spadm.split("|");
    if(k === "switch") return spAdmSave({noPosts:!apCk("spa_posts"), noComments:!apCk("spa_cmts"), noBiz:!apCk("spa_biz"), noScreen:!apCk("spa_screen")}, "Social settings saved");
    if(k === "biz"){ const on = !(lcfg().bizHidden || {})[v]; return spAdmSave({bizHidden:{[v]:on}}, on ? "Business page hidden" : "Business page showing"); }
    if(k === "post"){ const on = !(lcfg().postHidden || {})[v]; return spAdmSave({postHidden:{[v]:on}}, on ? "Hidden for everyone" : "Restored"); }
  }
});
document.addEventListener("keydown", e => { if(e.key === "Enter" && e.target.id && e.target.id.startsWith("spc_")){ e.preventDefault(); const b = e.target.parentElement.querySelector("[data-spcsend]"); if(b) b.click(); } });
window.addEventListener("hashchange", () => { if(location.hash === "#people"){ S.mpTab = "people"; openMe(true); } });
if(location.hash === "#people") setTimeout(() => { S.mpTab = "people"; openMe(true); }, 0);

// ---- Community dock: Members list ----
S.dmemF = "all";
function spDockMembers(){
  const pane = $("paneMembers"); if(!pane) return;
  if(!$("dmemQ")) pane.innerHTML = `<div class="dmemh"><input id="dmemQ" type="search" placeholder="Search members" autocomplete="off" aria-label="Search members"><div class="dmemf" id="dmemF"></div></div><div class="dmeml" id="dmemList"></div><div class="dmemfoot"><button class="xbtn2" type="button" data-dmempeople>Open the full People directory →</button></div>`;
  let L = memberList().filter(m => m && m.id && m.id !== meId);
  if(db && !S.demo && L.some(m => !m.profile && !m.mock && !S.memProf[m.id]) && !spDockMembers.busy){ spDockMembers.busy = true; Promise.resolve(memLoadProfiles()).finally(() => { setTimeout(() => { spDockMembers.busy = false; }, 30000); if(!$("dock").hidden && S.dtab === "members") spDockMembers(); }); }
  const nm = m => (m.name || (S.memProf[m.id] || {}).name || S.nameCache[m.id] || "").replace(/ \(demo\)$/, "");
  const on = m => !!(m.cats && m.cats.has("online"));
  const F = {all:() => true, online:on, biz:m => spCanBiz(m.id) && spBizOn(m.id), following:m => spIFollow(m.id)};
  const cnt = k => L.filter(F[k]).length;
  $("dmemF").innerHTML = [["all","All"],["online","Online"],["biz","Businesses"],["following","Following"]].map(([k, l]) => `<button type="button" data-dmemf="${k}" aria-pressed="${S.dmemF === k}">${l} <b>${cnt(k)}</b></button>`).join("");
  L = L.filter(F[S.dmemF] || F.all).sort((a, b) => on(b) - on(a) || nm(a).localeCompare(nm(b), undefined, {sensitivity:"base"}));
  const ty = m => (ACCT.find(a => a[0] === m.type) || [0, ""])[1];
  $("dmemList").innerHTML = L.length ? L.map(m => { const rs = spRolesOf(m.id), biz = spCanBiz(m.id) && spBizOn(m.id), f = spIFollow(m.id), n = nm(m);
    return `<div class="dmrow" data-txt="${esc((n + " " + ty(m) + " " + rs.join(" ") + (biz ? " business " + ((spBiz(m.id) || {}).name || "") : "")).toLowerCase())}">
      <button class="plink dmav" type="button" data-prof="${esc(m.id)}" aria-label="Open profile">${dmAv(m.id)}${on(m) ? `<i class="sdot"></i>` : ""}</button>
      <div class="nm"><button class="plink who" type="button" data-prof="${esc(m.id)}">${n ? esc(n) : who(m.id)}</button><small>${on(m) ? `<b>online</b> · ` : ""}${esc(ty(m))}${rs.map(r => " · " + SP_ROLE[r][0].toLowerCase()).join("")}${biz ? " · 🏢 business" : ""}${m.sample || m.mock ? " · sample" : ""}</small></div>
      <button class="spfol sm${f ? " on" : ""}" type="button" data-spfollow="${esc(m.id)}">${f ? "✓" : "+ Follow"}</button></div>`; }).join("")
    : `<div class="cempty" style="padding:14px">${S.dmemF === "all" ? "No members yet." : "Nobody matches this filter."}</div>`;
  fillNames($("dmemList"));
  const q = ($("dmemQ").value || "").trim().toLowerCase(); if(q) $("dmemList").querySelectorAll(".dmrow").forEach(r => r.hidden = !r.dataset.txt.includes(q));
  const tn = $("dockMemN"); if(tn) tn.textContent = memberList().filter(m => m && m.id && m.id !== meId).length + (meId ? 1 : 0);
}
document.addEventListener("input", e => { if(e.target.id !== "dmemQ") return; const q = e.target.value.trim().toLowerCase(); document.querySelectorAll("#dmemList .dmrow").forEach(r => r.hidden = !!q && !r.dataset.txt.includes(q)); });
document.addEventListener("click", e => {
  const f = e.target.closest("[data-dmemf]"); if(f){ S.dmemF = f.dataset.dmemf; spDockMembers(); return; }
  if(e.target.closest("[data-dmempeople]")){ $("dock").hidden = true; $("dockBtn").setAttribute("aria-expanded", false); S.mpTab = "people"; openMe(true); renderMe.lastTab = null; renderMe(); }
});

// ---- screen sharing for every member (via a live link from Discord, Meet, Zoom, Twitch, YouTube…) ----
function spScreenOK(){ return !((S.listCfg || {}).noScreen); }
S.localShares = [];
function spOpenShare(){
  if(!S.cortex) openCortex(true);
  setTimeout(() => {
    const full = canStream(meId) || !db || S.demo;
    S.cxMedia = "screen";
    document.querySelectorAll("[data-cxm]").forEach(x => { x.setAttribute("aria-pressed", x.dataset.cxm === "screen"); x.hidden = !full && x.dataset.cxm !== "screen"; });
    $("cxShareHelp").hidden = false; $("cxUrl").placeholder = "https:// Google Meet, Zoom, Twitch, YouTube…";
    $("cxTitle").placeholder = "What you're showing (e.g. my BTC 15m chart)";
    $("cxLiveForm").hidden = false; $("cxTitle").focus();
  }, S.cortex ? 0 : 900);
}
document.addEventListener("click", e => {
  if(e.target.closest("[data-spshare]")){ e.preventDefault(); if(S.mePage) openMe(false); $("dock").hidden = true; spOpenShare(); return; }
  const m = e.target.closest("[data-cxm]"); if(m){ const scr = m.dataset.cxm === "screen"; $("cxShareHelp").hidden = !scr; $("cxUrl").placeholder = scr ? "https:// Google Meet, Zoom, Twitch, YouTube…" : "https:// Twitch, YouTube, Kick, X Space…"; }
});

// ---- website member streams (anyone who isn't a verified caller, bot or script) ----
function spIsMemberStream(s){ if(s.local) return true; if(s.src === "Streamer" || s.src === "Member") return true; if(s.src === "Caller") return false; return !!s.hostId && !isVerified(s.hostId); }
function spMemChan(inStreams){ const n = cortexStreams().filter(s => kindOfStream(s) === "member").length;
  return `<button class="dchn" type="button" data-ftab="streams" data-dhub="members" aria-selected="${!!inStreams && S.dHub === "members"}" style="--c:#5BE3C8"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg><span class="nm">member-streams</span>${n ? `<span class="lv" style="background:#5BE3C8;color:#05080C">${n} LIVE</span>` : ""}</button>`; }
// ---- three stream panels over the Cortex chat: Caller · Script · Bot ----
S.cxTopMin = (() => { try { return localStorage.getItem("cxTopMin") === "1"; } catch { return false; } })();
S.cxMemPicks = (() => { try { const a = JSON.parse(localStorage.getItem("cxMemPicks") || "null"); if(Array.isArray(a)) return a; const one = localStorage.getItem("cxMemPick"); return one ? [one] : []; } catch { return []; } })();
S.cxTopFs = false;
S.favStreams = (() => { try { const a = JSON.parse(localStorage.getItem("cxFavStreams") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } })();
async function cxSaveFavStreams(msg){
  try { localStorage.setItem("cxFavStreams", JSON.stringify(S.favStreams)); } catch {}
  renderCxTop.sig = null; renderCxTop();
  if(db && meId && !S.demo){ if(await act(() => mergeWrite(db.doc(`data/users/${meId}/prefs`), {favStreams:S.favStreams}))) toast(msg); } else toast(msg);
}
document.addEventListener("keydown", e => { if(e.key === "Enter" && e.target && (e.target.id === "cxlfN" || e.target.id === "cxlfU")){ e.preventDefault(); document.querySelector("[data-cxlinkadd]")?.click(); } });
function renderCxTop(groups){
  const el = $("cxTop"); if(!el) return;
  const all = cortexStreams();
  if(!groups){ groups = {caller:[], bot:[], script:[], member:[]}; all.forEach(s => (groups[kindOfStream(s)] || groups.member).push(s)); }
  const NC = cxNC();
  const P = [["caller", NC > 1 ? "Caller 1" : "Caller","var(--callers)","callers"], ...Array.from({length:NC - 1}, (_, i) => ["caller" + (i + 2), "Caller " + (i + 2), "var(--callers)", "callers"]), ["script","Script","var(--scripts)","scripts"],["bot","Bot","var(--bots)","bots"]];
  const top = (S.cxCfg || {}).top || {}, canPick = isAdmin && !S.demo, fs = !!S.cxTopFs;
  const gk = k => groups[k] || groups.caller, ci = k => /^caller\d+$/.test(k) ? +k.slice(6) - 1 : 0;
  const picked = k => S.demo ? gk(k)[ci(k)] : (top[k] ? all.find(s => s.id && s.id === top[k]) : null);
  const mid = s => s.id || s.title || "", myFol = (!S.demo && meId && typeof spFollowing === "function") ? spFollowing(meId) : [];
  const favOf = s => { const h = s.hostId || s.hid; return (!!h && (isFav(h, s.who) || myFol.includes(h))) || (!!s.sourceId && isFav(s.sourceId)); };
  const links = (S.favStreams || []).filter(f => /^https:\/\//.test(f.url || "")).map(f => ({id:"f:" + f.url, title:f.name || "My stream", url:f.url, media:"video", who:"Saved link", link:true}));
  const PL = cxProfileLives().filter(x => !x.hostId || !all.some(s => (s.hostId || s.hid) === x.hostId)), allX = [...all, ...PL];
  const camPool = cxCams().filter(x => !x.me).map(x => ({id:"cam:" + (x.id || x.name), title:(x.kind === "screen" ? "🖥 " : "📷 ") + (x.title || (x.kind === "screen" ? "Screen share" : "On camera")), who:x.id ? (S.nameCache[x.id] || "Member") : x.name, media:"video", cam:x.kind}));
  const favLive = allX.filter(favOf), M = [...groups.member, ...PL].filter(x => !favOf(x)), others = all.filter(x => !favOf(x) && kindOfStream(x) !== "member"), pool = [...links, ...favLive, ...camPool, ...M, ...others];
  const mSel = S.cxMemPicks.map(id => pool.find(x => mid(x) === id)).filter(Boolean);
  const liveHosts = new Set(all.map(x => x.hostId || x.hid).filter(Boolean));
  const favOff = (() => { try { return ccBookmarks().filter(b => !liveHosts.has(b.key) && !(b.c && b.c.live)).slice(0, 12); } catch { return []; } })();
  // skip identical redraws so players in full screen keep playing
  const sig = JSON.stringify([cxCallSig(), NC, fs, !!S.cxTopMin, canPick, P.map(([k]) => (picked(k) || {}).id || (picked(k) || {}).title || ""), mSel.map(mid), pool.map(x => mid(x) + (favOf(x) ? "*" : "")), favOff.map(b => b.key), !!S.cxLinkForm, all.map(s => [s.id, s.title, kindOfStream(s)])]);
  if(sig === renderCxTop.sig && el.childElementCount){ return; } renderCxTop.sig = sig;
  el.classList.toggle("min", !!S.cxTopMin && !fs); el.classList.toggle("fs", fs);
  if(S.cxTopMin && !fs){ el.innerHTML = `<span style="font:11px var(--mono);color:var(--ink-3)">${P.map(([k, l, c]) => `<b style="color:${c}">${l.toUpperCase()}</b> ${picked(k) ? "live" : "off"}`).join(" · ")} · <b style="color:#5BE3C8">MEMBER</b> ${mSel.length} on</span><span style="display:flex;gap:6px"><button class="cxtgl" type="button" data-cxfs="1">⛶ Full screen</button><button class="cxtgl" type="button" data-cxtop="show">Show streams</button></span>`; return; }
  const sName = s => (s.title || "Live stream") + (s.who ? " · " + s.who : "");
  const screen = (s, emptyMsg, foot) => {
    if(!s) return `<div class="cxpb"><span class="off">${emptyMsg}</span></div><div class="cxpf"><div class="m">${foot}</div></div>`;
    const url = /^https:\/\//.test(s.url || "") ? s.url : null, emb = fs && url ? vxEmbed(url, true) : null;
    const watch = url ? `<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${s.media === "audio" ? "Listen" : "Watch"} ↗</a>` : "";
    return `<div class="cxpb${emb ? " vid" : ""}">${emb ? `<iframe src="${esc(emb)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen title="${esc(s.title || "Live stream")}"></iframe>` : `<span class="pill live">Live · ${mediaWord(s.media)}</span>${EQ}${fs && url && !S.demo && !s.sample && !s.demo ? `<span class="off cxnoemb">This link can't play inside the page</span>` : ""}`}${watch}</div><div class="cxpf"><div class="t">${esc(s.title || "Live now")}</div><div class="m">${s.who ? esc(s.who) : who(s.hid)}</div></div>`;
  };
  let h = '<div class="cxslots">' + P.map(([k, l, c, hub]) => {
    const s = picked(k), L = gk(k), isC = /^caller/.test(k);
    const opts = canPick ? `<select class="cxpk" data-cxpick="${k}" aria-label="Pick the ${l.toLowerCase()} stream"><option value="">None</option>${[...L, ...all.filter(x => !L.includes(x))].filter(x => x.id).map(x => `<option value="${esc(x.id)}" ${s && s.id === x.id ? "selected" : ""}>${L.includes(x) ? "" : "(other) "}${esc(sName(x))}</option>`).join("")}</select>` : "";
    const emptyMsg = canPick ? (L.length ? `Pick a ${l.toLowerCase()} stream above` : `No ${l.toLowerCase()} stream live`) : `No ${l.toLowerCase()} stream on`;
    return `<div class="cxp${s ? " on" : ""}" style="--c:${c}"><div class="cxph"><button class="lb" type="button" data-ftab="streams" data-dhub="${hub}" title="See all ${l.toLowerCase()} streams">${l}</button><span class="adm">${canPick ? "admin pick" : ""}</span>${isC && s ? cxCallBadge(s) : ""}${canPick && L.length ? `<span class="n">${L.length} LIVE</span>` : ""}${canPick && isC && k !== "caller" ? `<button class="cxslotb" type="button" data-cxslot="rm:${k}" title="Remove this caller window" aria-label="Remove ${l}">✕</button>` : ""}${canPick && isC && ci(k) === NC - 1 && NC < 6 ? `<button class="cxslotb add" type="button" data-cxslot="add" title="Add another caller window">＋ Caller</button>` : ""}</div>${opts}${screen(s, emptyMsg, canPick ? "Only admins can choose" : "Picked by the D3MON team")}</div>`;
  }).join("") + '</div>';
  const chip = x => { const on = mSel.includes(x), star = x.link ? `<button class="cxstar" type="button" data-cxlinkdel="${esc(x.url)}" title="Remove this saved link" aria-label="Remove ${esc(x.title)}">✕</button>` : (x.hostId || x.hid) && !S.demo ? `<button class="cxstar${favOf(x) ? " on" : ""}" type="button" data-cxfav="${esc(x.hostId || x.hid)}|${esc(x.who || "")}" title="${favOf(x) ? "Remove from favorites" : "Add to favorites"}" aria-label="${favOf(x) ? "Remove from favorites" : "Add to favorites"}">${favOf(x) ? "★" : "☆"}</button>` : "";
    return `<span class="cxcg"><button class="cxchip${x.link ? " lk" : ""}" type="button" data-cxmemt="${esc(mid(x))}" aria-pressed="${on}" title="${on ? "Take off the screens" : "Show on a screen"}: ${esc(sName(x))}">${on ? "✓" : "+"} ${esc(sName(x))}</button>${star}</span>`; };
  const favRow = `<div class="cxrow"><b class="cxrl">★ Favorites</b>${[...links, ...favLive].map(chip).join("")}${fs ? "" : favOff.map(f => `<span class="cxchip off" title="${esc(f.name)} isn't live right now">${esc(f.name)} · offline</span>`).join("")}${fs ? "" : `<button class="cxchip add" type="button" data-cxlinkform title="Save a stream link as a favorite">+ Add a stream link</button>`}${!links.length && !favLive.length && (fs || !favOff.length) ? `<span class="cxhint">${fs ? "No favorites live" : "Tap ☆ on any stream or profile to favorite it"}</span>` : ""}</div>`;
  const form = S.cxLinkForm && !fs ? `<div class="cxlf"><input id="cxlfN" maxlength="40" placeholder="Name (e.g. My BTC streamer)" aria-label="Stream name"><input id="cxlfU" type="url" placeholder="https://twitch.tv/…  youtube.com/…  kick.com/…" aria-label="Stream link"><button class="btn sm" type="button" data-cxlinkadd>Save</button><button class="xbtn2" type="button" data-cxlinkx>Cancel</button></div>` : "";
  const memRow = `<div class="cxrow"><b class="cxrl">Live members</b>${camPool.length + M.length ? [...camPool, ...M].map(chip).join("") : `<span class="cxhint">No other member is streaming</span>`}</div>`;
  const chips = `<div class="cxchips" role="group" aria-label="Streams to show on your screens">${favRow}${form}${memRow}</div>`;
  const xBtn = x => `<button class="cxx" type="button" data-cxmemt="${esc(mid(x))}" title="Remove this screen" aria-label="Remove ${esc(sName(x))}">✕</button>`;
  const lab = x => favOf(x) || x.link ? "★ Favorite" : "Member";
  if(fs){
    h += mSel.length ? mSel.map(x => `<div class="cxp on" style="--c:${favOf(x) || x.link ? "#FFD166" : "#5BE3C8"}"><div class="cxph"><span class="lb" style="cursor:default">${lab(x)}</span><span class="adm">${esc(x.who || "")}</span>${x.link ? "" : `<span class="n">LIVE</span>`}${xBtn(x)}</div>${screen(x, "", "")}</div>`).join("")
      : `<div class="cxp" style="--c:#5BE3C8"><div class="cxph"><span class="lb" style="cursor:default">Your picks</span></div><div class="cxpb"><span class="off">${pool.length ? "Pick favorites or member streams below to add screens" : "No favorites or member streams live"}</span></div></div>`;
  } else {
    h += `<div class="cxp cxmem${mSel.length ? " on" : ""}" style="--c:#5BE3C8"><div class="cxph"><button class="lb" type="button" data-ftab="streams" title="See all live streams">My streams</button><span class="adm">your favorites + member streams · pick as many as you like · only you see them</span>${pool.length ? `<span class="n">${pool.length} READY</span>` : ""}</div>${chips}${mSel.length ? `<div class="cxmgrid">${mSel.map(x => `<div class="cxmini${favOf(x) || x.link ? " fav" : ""}">${xBtn(x)}${screen(x, "", "")}</div>`).join("")}</div>` : pool.length ? `<div class="cxmempty">Tap a stream above to put it on a screen. Add as many as you like.</div>` : ""}</div>`;
  }
  h += `<div class="cxtg">${fs ? `<b>MY STREAMS</b>${chips}<button class="cxtgl x" type="button" data-cxfs="0" title="Exit full screen" aria-label="Exit full screen">✕ EXIT</button>` : `<button class="cxtgl" type="button" data-cxfs="1" title="All screens full screen" aria-label="All screens full screen">⛶ FULL</button><button class="cxtgl" type="button" data-cxtop="hide" title="Hide the stream panels" aria-label="Hide the stream panels">HIDE ⌃</button>`}</div>`;
  if(fs){ const n = 3 + Math.max(1, mSel.length), cols = innerWidth < 700 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4, rows = Math.ceil(n / cols); el.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`; el.style.gridTemplateRows = innerWidth < 700 ? "" : `repeat(${rows},minmax(0,1fr)) auto`; }
  else { el.style.gridTemplateColumns = ""; el.style.gridTemplateRows = ""; }
  const keep = S.cxLinkForm ? [$("cxlfN")?.value || "", $("cxlfU")?.value || "", document.activeElement && document.activeElement.id] : null;
  el.innerHTML = h;
  if(keep && $("cxlfN")){ $("cxlfN").value = keep[0]; $("cxlfU").value = keep[1]; if(keep[2] && $(keep[2])) $(keep[2]).focus(); }
  fillNames(el);
}
function cxTopFull(on){
  S.cxTopFs = !!on; renderCxTop.sig = null; renderCxTop();
  const el = $("cxTop");
  if(on){ if(el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(() => { S.cxTopNative = true; }).catch(() => {}); }
  else if(S.cxTopNative && document.fullscreenElement){ S.cxTopNative = false; document.exitFullscreen().catch(() => {}); }
}
document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && S.cxTopNative){ S.cxTopNative = false; if(S.cxTopFs) cxTopFull(false); } });
document.addEventListener("keydown", e => { if(e.key === "Escape" && S.cxTopFs && !document.fullscreenElement) cxTopFull(false); });
async function cxSaveTop(top, msg){
  if(apPreview()){ S.cxCfg = {...S.cxCfg, top}; renderCxTop.sig = null; renderCxTop(); cxCallPaint(); cxAdmRefresh(); return toast("Preview only: open the published page to save."); }
  if(await apSave("config/cortex", {top}, msg)){ S.cxCfg = {...S.cxCfg, top}; renderCxTop.sig = null; renderCxTop(); cxCallPaint(); cxAdmRefresh(); }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-cxslot]"); if(!b) return; if(!isAdmin && db) return toast("Only admins can change the caller windows.");
  const top = {...((S.cxCfg || {}).top || {})}, n = cxNC(), v = b.dataset.cxslot;
  if(v === "add"){ top.nc = Math.min(6, n + 1); return cxSaveTop(top, "Caller window added"); }
  const k = v.slice(3), idx = k === "caller" ? 0 : +k.slice(6) - 1, ids = Array.from({length:n}, (_, i) => top[i ? "caller" + (i + 1) : "caller"] || "");
  ids.splice(idx, 1); for(let i = 0; i < n; i++){ const key = i ? "caller" + (i + 1) : "caller"; if(i < ids.length) top[key] = ids[i]; else top[key] = ""; }
  top.nc = Math.max(1, n - 1); cxSaveTop(top, "Caller window removed");
});
document.addEventListener("change", async e => {
  const sel = e.target.closest("[data-cxpick]"); if(!sel) return;
  if(!isAdmin && db) return toast("Only admins can choose these streams.");
  const k = sel.dataset.cxpick, top = {...((S.cxCfg || {}).top || {}), [k]:sel.value};
  if(apPreview()){ S.cxCfg = {...S.cxCfg, top}; renderCxTop.sig = null; renderCxTop(); cxCallPaint(); cxAdmRefresh(); return toast("Preview only: open the published page to save."); }
  if(await apSave("config/cortex", {top}, sel.value ? "Stream featured" : "Panel cleared")){ S.cxCfg = {...S.cxCfg, top}; renderCxTop.sig = null; renderCxTop(); cxCallPaint(); cxAdmRefresh(); }
});
document.addEventListener("click", e => {
  const fv = e.target.closest("[data-cxfav]"); if(fv){ const [h, n] = fv.dataset.cxfav.split("|"); toggleFav(h, n).then(() => { renderCxTop.sig = null; renderCxTop(); }); return; }
  if(e.target.closest("[data-cxlinkform]")){ S.cxLinkForm = !S.cxLinkForm; renderCxTop(); setTimeout(() => $("cxlfN")?.focus(), 0); return; }
  if(e.target.closest("[data-cxlinkx]")){ S.cxLinkForm = false; renderCxTop(); return; }
  if(e.target.closest("[data-cxlinkadd]")){ const name = ($("cxlfN").value || "").trim().slice(0, 40), url = ($("cxlfU").value || "").trim();
    if(!/^https:\/\//.test(url)) return toast("Paste a link that starts with https://");
    if((S.favStreams || []).some(f => f.url === url)) return toast("That link is already in your favorites");
    S.favStreams = [...(S.favStreams || []), {name:name || url.replace(/^https:\/\/(www\.)?/, "").slice(0, 30), url}].slice(-30); S.cxLinkForm = false;
    S.cxMemPicks = [...S.cxMemPicks.filter(x => x !== "f:" + url), "f:" + url]; try { localStorage.setItem("cxMemPicks", JSON.stringify(S.cxMemPicks)); } catch {}
    cxSaveFavStreams("Saved to your favorites"); return; }
  const ld = e.target.closest("[data-cxlinkdel]"); if(ld){ const u = ld.dataset.cxlinkdel; S.favStreams = (S.favStreams || []).filter(f => f.url !== u); S.cxMemPicks = S.cxMemPicks.filter(x => x !== "f:" + u); try { localStorage.setItem("cxMemPicks", JSON.stringify(S.cxMemPicks)); } catch {} cxSaveFavStreams("Link removed"); return; }
  const mt = e.target.closest("[data-cxmemt]"); if(mt){ const id = mt.dataset.cxmemt, P = S.cxMemPicks; S.cxMemPicks = P.includes(id) ? P.filter(x => x !== id) : [...P, id]; try { localStorage.setItem("cxMemPicks", JSON.stringify(S.cxMemPicks)); } catch {} renderCxTop(); return; }
  const f = e.target.closest("[data-cxfs]"); if(f){ cxTopFull(f.dataset.cxfs === "1"); return; }
  const t = e.target.closest("[data-cxtop]"); if(t){ S.cxTopMin = t.dataset.cxtop === "hide"; try { localStorage.setItem("cxTopMin", S.cxTopMin ? "1" : "0"); } catch {} renderCxTop(); }
});
// ---- Cortex channel manager: admins add and remove channels in every category ----
var CXCAT = {text:"Text channel", dir:"Directory channel", live:"Live channel", voice:"Voice channel"};
function cxCfgX(){ return S.cxCfg || {}; }
function cxHidden(key){ return !!(cxCfgX().chHide || {})[key]; }
function cxCustom(cat){ return Object.entries(cxCfgX().chx || {}).filter(([, x]) => x && !x.del && x.cat === cat).sort((a, b) => (a[1].t || 0) - (b[1].t || 0)); }
function cxCat(k){ const x = (cxCfgX().chx || {})[k]; return x && !x.del ? x.cat : null; }
function cxDirKind(){ const x = (cxCfgX().chx || {})[S.ftab]; return x && !x.del && x.cat === "dir" ? (x.kind || "callers") : "callers"; }
function cxTextTabs(){ return FTABS.filter(([k]) => k === "main" || !cxHidden("t:" + k)).concat(cxCustom("text").map(([id, x]) => [id, x.name])); }
function cxValidTab(k){ if(k === "mlive") return true; if(k === "streams") return !cxHidden("l:streams"); if(k === "callers") return !cxHidden("d:callers"); if(FTABS.some(([f]) => f === k)) return k === "main" || !cxHidden("t:" + k); return !!cxCat(k); }
function cxSyncDCH(){ for(const [id, x] of Object.entries(cxCfgX().chx || {})){ if(!x || x.del){ continue; } DCH[id] = [x.name, x.topic || (x.cat === "live" ? "Live stream and chat" : x.cat === "dir" ? (DIRK[x.kind] || DIRK.callers).blurb : "Chat about anything in this channel")]; if(!(id in fseen)) fseen[id] = Date.now(); } }
function cxCustomRows(cat){
  return cxCustom(cat).map(([id, x]) => {
    if(cat === "dir"){ const n = x.kind === "callers" ? callerDir().length : entityDir(x.kind).length, c = x.kind === "bots" ? "var(--bots)" : x.kind === "scripts" ? "var(--scripts)" : "var(--callers)";
      return `<button class="dchn" type="button" data-ftab="${esc(id)}" aria-selected="${S.ftab === id}" style="--c:${c}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.8-3.4 3.2-5.2 6.2-5.2s5.4 1.8 6.2 5.2"/></svg><span class="nm">${esc(x.name)}</span><span class="bdg n" style="background:${c}">${n}</span></button>`; }
    return `<button class="dchn" type="button" data-ftab="${esc(id)}" aria-selected="${S.ftab === id}" style="--c:#5BE3C8">${DLIVE}<span class="nm">${esc(x.name)}</span>${x.url ? `<span class="lv" style="background:#5BE3C8;color:#05080C">24/7</span>` : ""}</button>`;
  }).join("");
}
function cxLivePlayer(){
  const box = $("cxLiveP"), x = (cxCfgX().chx || {})[S.ftab], live = x && !x.del && x.cat === "live";
  $("cxTop").hidden = !!live; box.hidden = !live;
  if(!live){ if(box.dataset.k){ box.innerHTML = ""; box.dataset.k = ""; } return; }
  const k = S.ftab + "|" + (x.url || ""); if(box.dataset.k === k) return; box.dataset.k = k;
  const url = /^https:\/\//.test(x.url || "") ? x.url : "", emb = url ? vxEmbed(url, true) : null;
  box.innerHTML = (emb ? `<div class="v"><iframe src="${esc(emb)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen title="${esc(x.name)}"></iframe></div>` : `<div class="off">${url ? "This link can't play inside the page" : "No stream link set for this channel"}</div>`)
    + `<div class="bar"><span>${esc(x.name)}</span>${url ? `<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}</div>`;
}
function cxCanManage(){ return isAdmin && !S.demo; }
function cxDecorate(){
  const admin = cxCanManage();
  document.querySelectorAll("#dch .dcat[data-cxcat]").forEach(p => {
    const cat = p.dataset.cxcat; let b = p.querySelector(".dcadd");
    if(admin && !b){ b = document.createElement("button"); b.type = "button"; b.className = "dcadd"; b.dataset.cxadd = cat; b.title = "Add a " + CXCAT[cat].toLowerCase(); b.setAttribute("aria-label", b.title); b.textContent = "+"; p.appendChild(b); }
    if(!admin && b) b.remove();
    const list = {text:"ftabs", dir:"dDirCh", live:"dStreamCh", voice:"cxVoice"}[cat], el = $(list);
    const empty = el && !el.querySelector(".dchn");
    p.hidden = empty && !admin;
  });
  if(!admin) return;
  const tag = (row, key) => { if(!key || row.querySelector(".dchx")) return; const x = document.createElement("span"); x.className = "dchx" + (S.cxDelArm === key ? " arm" : ""); x.dataset.cxdel = key; x.setAttribute("role", "button"); x.title = "Delete channel"; x.setAttribute("aria-label", "Delete channel"); x.textContent = S.cxDelArm === key ? "Delete?" : "✕"; row.appendChild(x); };
  document.querySelectorAll("#ftabs .dchn[data-ftab]").forEach(r => { const k = r.dataset.ftab; if(k !== "main") tag(r, cxCat(k) ? "x:" + k : "t:" + k); });
  document.querySelectorAll("#dDirCh .dchn[data-ftab]").forEach(r => { const k = r.dataset.ftab; tag(r, k === "callers" ? "d:callers" : "x:" + k); });
  document.querySelectorAll("#dStreamCh .dchn[data-ftab]").forEach(r => { const k = r.dataset.ftab; tag(r, k === "streams" ? "l:streams" : "x:" + k); });
  document.querySelectorAll("#cxVoice .dchn[data-vk]").forEach(r => { const k = r.dataset.vk; tag(r, cxCat(k) ? "x:" + k : "v:" + k); });
}
function cxAddForm(cat){
  ["text","dir","live","voice"].forEach(c => { const f = $("cxAdd_" + c); if(f && c !== cat){ f.hidden = true; f.innerHTML = ""; } });
  const f = $("cxAdd_" + cat); if(!f) return;
  if(!cat || S.cxAdding !== cat){ f.hidden = true; f.innerHTML = ""; return; }
  f.hidden = false;
  f.innerHTML = `<b>New ${CXCAT[cat].toLowerCase()}</b><input id="cxaN" maxlength="32" placeholder="${cat === "voice" ? "trading-room" : cat === "live" ? "24-7-btc-stream" : cat === "dir" ? "bot-builders" : "new-channel"}" aria-label="Channel name">`
    + (cat === "dir" ? `<select id="cxaK" aria-label="Who it lists"><option value="callers">Lists callers</option><option value="bots">Lists bots</option><option value="scripts">Lists chart scripts</option></select>` : "")
    + (cat === "live" || cat === "voice" ? `<input id="cxaU" type="url" placeholder="${cat === "voice" ? "https:// voice room link (Meet, X Space…)" : "https:// stream link (Twitch, YouTube, Kick…)"}" aria-label="Link">` : "")
    + (cat === "text" || cat === "live" ? `<input id="cxaT" maxlength="80" placeholder="Topic (optional)" aria-label="Topic">` : "")
    + `<div class="r"><button class="xbtn2" type="button" data-cxaddx>Cancel</button><button class="btn sm" type="button" data-cxaddgo="${cat}">Add channel</button></div>`;
  setTimeout(() => $("cxaN")?.focus(), 0);
}
async function cxSaveCfg(patch, msg){
  if(apPreview()){ S.cxCfg = cxDeep(S.cxCfg || {}, patch); applySiteConfig(); renderFloor(); renderCxVoice(); toast("Preview only: open the published page to save."); return true; }
  const ok = await apSave("config/cortex", patch, msg); if(ok){ S.cxCfg = cxDeep(S.cxCfg || {}, patch); applySiteConfig(); renderFloor(); renderCxVoice(); } return ok;
}
function cxDeep(a, b){ const o = {...a}; for(const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) && o[k] && typeof o[k] === "object" ? cxDeep(o[k], v) : v; return o; }
function cxAdminCard(){
  const hid = Object.entries(cxCfgX().chHide || {}).filter(([, v]) => v).map(([k]) => k), del = Object.entries(cxCfgX().chx || {}).filter(([, x]) => x && x.del);
  const nm = k => { const [c, key] = [k.slice(0, 1), k.slice(2)]; return c === "t" ? "# " + (DCH[key] || [key])[0] : c === "d" ? "callers (directory)" : c === "l" ? "live-streams" : "🔊 " + (key === "cortex" ? "cortex" : (SECTIONS[key]?.name || key).toLowerCase()); };
  return `<div class="acard"><h3>Channels <small>add with + next to each category in the Cortex sidebar; hover a channel and tap ✕ to delete</small></h3>
    <div class="alist">${hid.map(k => `<div class="arow"><div class="t">${esc(nm(k))}<small>Built-in channel, removed</small></div><div class="aacts"><button class="xbtn2" type="button" data-cxrestore="${esc(k)}">Restore</button></div></div>`).join("")}${del.map(([id, x]) => `<div class="arow"><div class="t">${esc(x.name)}<small>${esc(CXCAT[x.cat] || "Channel")}, deleted</small></div><div class="aacts"><button class="xbtn2" type="button" data-cxrestore="x:${esc(id)}">Restore</button></div></div>`).join("") || `<div class="aempty">No removed channels. #main-floor can't be removed.</div>`}</div></div>`;
}
document.addEventListener("click", async e => {
  const del = e.target.closest("[data-cxdel]");
  if(del){ e.preventDefault(); e.stopPropagation(); if(!cxCanManage()) return;
    const key = del.dataset.cxdel;
    if(S.cxDelArm !== key){ S.cxDelArm = key; clearTimeout(S.cxDelT); S.cxDelT = setTimeout(() => { S.cxDelArm = null; renderFloor(); renderCxVoice(); }, 3500); renderFloor(); renderCxVoice(); return; }
    S.cxDelArm = null;
    const patch = key.startsWith("x:") ? {chx:{[key.slice(2)]:{del:true}}} : {chHide:{[key]:true}};
    if(key.slice(2) === S.ftab || key === "d:callers" && S.ftab === "callers" || key === "l:streams" && S.ftab === "streams") S.ftab = "main";
    await cxSaveCfg(patch, "Channel deleted"); return; }
}, true);
document.addEventListener("click", async e => {
  const a = e.target.closest("[data-cxadd]"); if(a){ if(!cxCanManage()) return; S.cxAdding = S.cxAdding === a.dataset.cxadd ? null : a.dataset.cxadd; cxAddForm(S.cxAdding || a.dataset.cxadd); return; }
  if(e.target.closest("[data-cxaddx]")){ const c = S.cxAdding; S.cxAdding = null; cxAddForm(c); return; }
  const go = e.target.closest("[data-cxaddgo]");
  if(go){ if(!cxCanManage()) return; const cat = go.dataset.cxaddgo;
    const name = ($("cxaN").value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    if(!name) return toast("Give the channel a name.");
    const url = ($("cxaU")?.value || "").trim(); if(url && !/^https:\/\//.test(url)) return toast("Links need to start with https://");
    if(cat === "voice" && !url) return toast("Add the voice room link.");
    const id = "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const ch = {cat, name, t:Date.now(), ...(url ? {url} : {}), ...(cat === "dir" ? {kind:$("cxaK").value} : {}), ...($("cxaT")?.value.trim() ? {topic:$("cxaT").value.trim().slice(0, 80)} : {})};
    S.cxAdding = null; cxAddForm(cat);
    if(await cxSaveCfg({chx:{[id]:ch}}, "Channel added") && cat !== "voice"){ S.ftab = id; S.dHub = null; renderFloor(); }
    return; }
  const rs = e.target.closest("[data-cxrestore]");
  if(rs){ if(!isAdmin) return; const k = rs.dataset.cxrestore; await cxSaveCfg(k.startsWith("x:") ? {chx:{[k.slice(2)]:{del:false}}} : {chHide:{[k]:false}}, "Channel restored"); if(S.adminPage){ renderAdmin.lastTab = null; renderAdmin(); } }
});
document.addEventListener("keydown", e => { if(e.key === "Enter" && e.target.closest && e.target.closest(".cxaddf input")){ e.preventDefault(); document.querySelector(".cxaddf [data-cxaddgo]")?.click(); } });
// ---- live member streams: anyone can say they're live (what + link) or when they'll stream next ----
DCH.mlive = ["live-member-streams", "Everyone streaming right now and who's up next"];
const CX_LIVE_TTL = 12*3600000;
function cxLiveOf(pub){ const L = (pub || {}).live; return L && L.on && Date.now() - (L.t || 0) < CX_LIVE_TTL ? L : null; }
function cxProfileLives(){
  const out = [], seen = new Set();
  for(const [uid, d] of Object.entries(S.botDocs || {})){ const L = cxLiveOf(d.pub); if(L){ seen.add(uid); out.push({id:"p:" + uid, title:L.title || "Live now", url:L.url || "", media:"video", hostId:uid, hid:uid, src:"Member", t:L.t, prof:true}); } }
  if(mpPreview()){
    const L = cxLiveOf(S.previewPub); if(L) out.push({id:"p:me", title:L.title || "Live now", url:L.url || "", media:"video", who:"You", src:"Member", t:L.t, prof:true, me:true});
    try { Object.entries(getProfiles()).filter(([, p]) => p.status === "live").slice(0, 6).forEach(([pid, p], i) => out.push({id:"p:p:" + pid, title:p.liveTitle || "Live now", url:p.liveUrl || "", media:p.liveMedia || "video", who:p.name, src:"Member", t:Date.now() - (i + 1)*900000, prof:true, sample:true, pkey:"p:" + pid, color:p.color})); } catch {}
  }
  return out;
}
function cxUpcoming(){
  const now = Date.now(), out = [];
  const add = (uid, pub, extra) => { const n = (pub || {}).nextLive; if(n && n.at && n.at > now - 1800000 && !cxLiveOf(pub)) out.push({uid, at:n.at, title:n.title || "", ...extra}); };
  for(const [uid, d] of Object.entries(S.botDocs || {})) add(uid, d.pub);
  if(mpPreview()) add(null, S.previewPub, {who:"You"});
  return out.sort((a, b) => a.at - b.at).slice(0, 20);
}
function cxAllLive(){
  const streams = cortexStreams().map(s => ({...s, kind:kindOfStream(s)}));
  const PL = cxProfileLives().filter(x => !streams.some(s => x.hostId && (s.hostId || s.hid) === x.hostId)).map(x => ({...x, kind:"member"}));
  return [...PL, ...streams].sort((a, b) => (b.t || b.startedAt || 0) - (a.t || a.startedAt || 0));
}
const cxWhen = at => { const d = new Date(at), t = d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}), today = new Date().toDateString() === d.toDateString(), tm = new Date(Date.now() + 86400000).toDateString() === d.toDateString(); return (today ? "Today" : tm ? "Tomorrow" : d.toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"})) + " · " + t; };
function cxMLiveSide(){
  const n = cxAllLive().length + cxCams().length, up = cxUpcoming().length; if($("cxMemAir")) $("cxMemAir").textContent = n;
  const box = $("dMLiveCh"); if(!box) return;
  box.innerHTML = `<button class="dchn" type="button" data-ftab="mlive" aria-selected="${S.ftab === "mlive"}" style="--c:#FF4D6A">${DLIVE}<span class="nm">live-members</span>${n ? `<span class="lv">${n} LIVE</span>` : up ? `<span class="bdg n" style="background:#5BE3C8;color:#05080C" title="Scheduled">${up}</span>` : ""}</button>`;
}
function cxLiveStatusCard(){
  const pub = myPub(), L = cxLiveOf(pub), N = (pub || {}).nextLive, signed = mpPreview() || (meId && canWrite);
  if(!signed) return `<div class="lsc"><h3>Go live</h3><p class="st">Sign in to tell everyone when you're streaming.</p></div>`;
  const nextVal = N && N.at > Date.now() ? new Date(N.at - new Date().getTimezoneOffset()*60000).toISOString().slice(0, 16) : "";
  return `<div class="lsc"><h3>${L ? `<span class="dot"></span> You're live` : "Live status"}</h3>
    <p class="st">${L ? `Everyone sees <b>${esc(L.title || "Live now")}</b> in the Cortex under Live member streams${L.url ? "" : " (add a link so people can watch)"}.` : "Tell the community what you're streaming. It pops up for everyone in the Cortex the moment you go live."}</p>
    <div class="lsrow"><span class="lab">What</span><input id="lsT" maxlength="80" value="${esc(L ? L.title || "" : "")}" placeholder="BTC 15m scalps, live commentary" aria-label="What you're streaming"></div>
    <div class="lsrow"><span class="lab">Where (link)</span><input id="lsU" type="url" value="${esc(L ? L.url || "" : (pub.lastLiveUrl || ""))}" placeholder="https://twitch.tv/you · youtube.com/@you · kick.com/you" aria-label="Stream link"></div>
    <div class="lsrow" style="justify-content:flex-end">${L ? `<button class="btn ghost sm" type="button" data-lsupd>Update</button><button class="btn sm" type="button" data-lsend style="background:#FF4D6A;border-color:#FF4D6A">End live</button>` : `<button class="btn sm" type="button" data-lsgo style="background:#FF4D6A;border-color:#FF4D6A">● I'm live now</button>`}</div>
    <div class="lsrow"><span class="lab">Next stream</span><input id="lsN" type="datetime-local" value="${nextVal}" aria-label="When you'll stream next" style="flex:0 1 220px"><input id="lsNT" maxlength="80" value="${esc(N && N.at > Date.now() ? N.title || "" : "")}" placeholder="What it'll be (optional)" aria-label="Next stream topic"><button class="btn ghost sm" type="button" data-lsnext>Save time</button>${N && N.at > Date.now() ? `<button class="xbtn2" type="button" data-lsnextx>Clear</button>` : ""}</div></div>`;
}
// ---- on-site camera / screen streams ----
/* CX_CAM: plug a live video service in here when the site runs on its own domain (LiveKit, Daily, Agora...):
   publish(stream) sends the member's camera/screen, watch(uid, videoEl) attaches someone else's, stop() ends it. */
const CX_CAM = { provider:null, ready(){ return !!this.provider; }, async publish(stream, kind){ return false; }, watch(uid, el){ return false; }, async stop(){ return true; } };
S.myCam = null; S.myCamStream = null;
function cxCams(){
  if(S.demo){ const n = Date.now(); const D = [{name:"Nova (demo)", color:"#FFB547", kind:"camera", title:"BTC 15m — talking through my calls", t:n - 9*60000}, {name:"Quiet Mike (demo)", color:"#B98CFF", kind:"screen", title:"VWAP bands on the 15m chart", t:n - 23*60000}];
    if(S.myCam) D.unshift({name:"You (demo)", color:"#2EE59D", kind:S.myCam.kind, title:S.myCam.title, t:S.myCam.t, me:true}); return D; }
  const out = onlinePeople().filter(p => p.cam === "camera" || p.cam === "screen").map(p => ({id:p.id, kind:p.cam, title:p.camT || "", me:p.id === meId}));
  if(S.myCam && !out.some(x => x.me)) out.unshift({id:meId, kind:S.myCam.kind, title:S.myCam.title, me:true});
  return out;
}
async function cxCamStart(kind){
  if(!meId && db && !S.demo) return toast("Sign in to go live.");
  const title = ($("camT") ? $("camT").value.trim() : "").slice(0, 80);
  let stream = null;
  try { stream = kind === "screen" ? await navigator.mediaDevices.getDisplayMedia({video:true, audio:true}) : await navigator.mediaDevices.getUserMedia({video:true, audio:true}); } catch { stream = null; }
  S.myCam = {kind, title, t:Date.now()}; S.myCamStream = stream;
  if(stream){ stream.getVideoTracks().forEach(t => t.addEventListener("ended", () => cxCamStop())); CX_CAM.publish(stream, kind).catch(() => {}); }
  pushPresence(); cxMLiveSide(); if(S.ftab === "mlive") cxRenderMLive();
  toast(kind === "screen" ? "You're sharing your screen in the Cortex" : "You're live on camera in the Cortex");
}
function cxCamStop(){ if(S.myCamStream){ S.myCamStream.getTracks().forEach(t => t.stop()); } S.myCamStream = null; S.myCam = null; CX_CAM.stop().catch(() => {}); pushPresence(); cxMLiveSide(); if(S.ftab === "mlive") cxRenderMLive(); }
function cxCamTiles(){
  const C = cxCams(), canGo = S.demo || !db || !!meId, mine = S.myCam;
  const face = x => x.id ? avatar(x.id) : `<span class="av" style="background:${esc(x.color || "#5BE3C8")}"></span>`, nm = x => x.id ? who(x.id) : `<span class="who">${esc(x.name || "Member")}</span>`;
  const tile = (x, i) => `<div class="camt${x.me ? " me" : ""}" data-camk="${i}"><div class="vid">${x.me && S.myCamStream ? `<video autoplay muted playsinline data-mycam></video>` : `<div class="ph"><span class="ico">${x.kind === "screen" ? "🖥" : "📷"}</span><small>${x.me ? (S.myCamStream ? "" : "Your browser didn't allow the camera here") : CX_CAM.ready() ? "Connecting…" : "Video starts when D3MON.CO runs on its own domain"}</small></div>`}
      <span class="lvb">● LIVE</span><span class="kd">${x.kind === "screen" ? "SCREEN" : "CAMERA"}</span></div>
    <div class="ft">${face(x)}<div style="min-width:0"><b>${nm(x)}${x.me ? ` <i>you</i>` : ""}</b><small>${esc(x.title || (x.kind === "screen" ? "Sharing their screen" : "On camera"))}</small></div>${x.me ? `<button class="btn sm" type="button" data-camstop style="background:#FF4D6A;border-color:#FF4D6A">End</button>` : `<button class="cxchip" type="button" data-cxmemt="cam:${esc(x.id || x.name)}" aria-pressed="${(S.cxMemPicks || []).includes("cam:" + (x.id || x.name))}" style="margin-left:auto">${(S.cxMemPicks || []).includes("cam:" + (x.id || x.name)) ? "✓ On my screens" : "+ My screens"}</button>`}</div></div>`;
  const go = !canGo ? `<div class="mlempty">Sign in to go live with your camera or screen.</div>` : mine ? "" : `<div class="camgo"><input id="camT" maxlength="80" placeholder="What you're streaming (optional)" aria-label="Stream title"><button class="btn sm" type="button" data-camgo="camera">📷 Go live on camera</button><button class="btn ghost sm" type="button" data-camgo="screen">🖥 Share my screen</button></div>`;
  return `<div class="mlh"><h3>Live on D3MON · ${C.length}</h3><small>members streaming their camera or screen right here in the Cortex</small></div>${go}
    <div class="camgrid">${C.length ? C.map(tile).join("") : `<div class="mlempty">Nobody is live on camera or screen right now.</div>`}</div>
    ${CX_CAM.ready() ? "" : `<p class="camnote">🎥 You'll see your own preview as soon as you go live. Sending your video to everyone else turns on when D3MON.CO runs on its own domain; until then members see who's live and what they're streaming.</p>`}`;
}
document.addEventListener("click", e => { if(e.target.closest("[data-cxmemt]") && S.ftab === "mlive") setTimeout(() => cxRenderMLive(), 30); });
document.addEventListener("click", e => {
  const g = e.target.closest("[data-camgo]"); if(g){ cxCamStart(g.dataset.camgo); return; }
  if(e.target.closest("[data-camstop]")){ cxCamStop(); toast("You ended your stream"); return; }
});
function cxRenderMLive(){
  const box = $("dMLive"); if(!box) return;
  const L = cxAllLive(), U = cxUpcoming(), picks = S.cxMemPicks || [];
  const KW = {caller:"Caller", bot:"Bot", script:"Script", member:"Member"}, KC = {caller:"var(--callers)", bot:"var(--bots)", script:"var(--scripts)", member:"#5BE3C8"};
  const name = x => x.who ? `<span class="who">${esc(x.who)}</span>` : x.pkey ? `<span class="who">${esc(x.who || "Member")}</span>` : who(x.hostId || x.hid);
  const av = x => x.hostId || x.hid ? avatar(x.hostId || x.hid) : `<span class="av" style="background:${esc(x.color || "#5BE3C8")}"></span>`;
  const row = x => { const id = x.id || x.title, on = picks.includes(id), url = /^https:\/\//.test(x.url || "") ? x.url : "";
    return `<div class="mlr"><span>${av(x)}</span><div style="min-width:0"><div class="ttl">${esc(x.title || "Live now")}</div><div class="meta">${name(x)}<span class="rb" style="color:${KC[x.kind]};border-color:${KC[x.kind]}">${KW[x.kind] || "Member"}</span><span><span class="dot" style="display:inline-block;margin-right:4px"></span>live ${esc(ago(x.t || x.startedAt || Date.now()))}</span>${x.sample ? `<span class="rb str">SAMPLE</span>` : ""}</div></div>
      <div class="acts">${url ? `<a class="watch2" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Watch ↗</a>` : ""}${x.me ? "" : `<button class="cxchip" type="button" data-cxmemt="${esc(id)}" aria-pressed="${on}">${on ? "✓ On my screens" : "+ My screens"}</button>`}</div></div>`; };
  box.innerHTML = cxCamTiles() + cxLiveStatusCard()
    + `<div class="mlh"><h3>Streaming from a link · ${L.length}</h3><small>Twitch, YouTube, Kick and more</small></div>`
    + `<div class="mll">${L.length ? L.map(row).join("") : `<div class="mlempty">Nobody is live right now. Set your status above when you start streaming.</div>`}</div>`
    + `<div class="mlh"><h3>Up next · ${U.length}</h3><small>Members who scheduled their next stream</small></div>`
    + `<div class="mll">${U.length ? U.map(u => `<div class="mlr up"><span>${u.uid ? avatar(u.uid) : `<span class="av"></span>`}</span><div style="min-width:0"><div class="ttl">${esc(u.title || "Streaming soon")}</div><div class="meta">${u.who ? `<span class="who">${esc(u.who)}</span>` : who(u.uid)}<span>${esc(cxWhen(u.at))}</span></div></div><div class="acts"></div></div>`).join("") : `<div class="mlempty">No streams scheduled.</div>`}</div>`;
  fillNames(box);
  const v = box.querySelector("video[data-mycam]"); if(v && S.myCamStream && v.srcObject !== S.myCamStream){ v.srcObject = S.myCamStream; v.play().catch(() => {}); }
}
async function cxLiveAnnounce(uid, L){
  let nm = S.nameCache[uid];
  if(!nm && user){ try { const ps = await user.profiles([uid]); nm = (ps && ps[uid] && ps[uid].name) || ""; if(nm) S.nameCache[uid] = nm; } catch {} }
  toast(`🔴 ${nm || "A member"} is live: ${L.title || "streaming now"}`);
}
function cxLiveWatch(){
  const first = !S.cxLiveSeen; S.cxLiveSeen = S.cxLiveSeen || {};
  for(const [uid, d] of Object.entries(S.botDocs || {})){
    const L = cxLiveOf(d.pub), key = L ? String(L.t || 1) : "";
    if(!first && key && S.cxLiveSeen[uid] !== key && uid !== meId) cxLiveAnnounce(uid, L);
    S.cxLiveSeen[uid] = key;
  }
  if(S.cortex){ cxMLiveSide(); if(S.ftab === "mlive") cxRenderMLive(); renderCxTop(); }
  if(S.vortexPage){ renderVxWho(); renderBattle(); }
}
function cxLiveRefresh(){ if(S.cortex){ cxMLiveSide(); if(S.ftab === "mlive") cxRenderMLive(); renderCxTop.sig = null; renderCxTop(); } if(S.mePage){ renderMe.lastTab = null; renderMe(); } }
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-lsgo],[data-lsupd],[data-lsend],[data-lsnext],[data-lsnextx]"); if(!b) return;
  const d = b.dataset;
  if("lsgo" in d || "lsupd" in d){ const title = ($("lsT").value || "").trim().slice(0, 80), url = ($("lsU").value || "").trim();
    if(!title) return toast("Say what you're streaming first.");
    if(url && !/^https:\/\//.test(url)) return toast("Links need to start with https://");
    const was = cxLiveOf(myPub());
    if(await savePub({live:{on:true, title, url, t:was && "lsupd" in d ? was.t : Date.now()}, lastLiveUrl:url, nextLive:{at:0, title:""}}, "lsgo" in d ? "You're live. Everyone sees it in the Cortex." : "Live status updated")) cxLiveRefresh(); return; }
  if("lsend" in d){ if(await savePub({live:{on:false, t:Date.now()}}, "Live ended")) cxLiveRefresh(); return; }
  if("lsnext" in d){ const v = $("lsN").value; if(!v) return toast("Pick a date and time."); const at = new Date(v).getTime(); if(!(at > Date.now())) return toast("Pick a time in the future.");
    if(await savePub({nextLive:{at, title:($("lsNT").value || "").trim().slice(0, 80)}}, "Next stream saved")) cxLiveRefresh(); return; }
  if("lsnextx" in d){ if(await savePub({nextLive:{at:0, title:""}}, "Schedule cleared")) cxLiveRefresh(); return; }
});
setInterval(() => { if(S.cortex && S.ftab === "mlive") cxRenderMLive(); }, 60000);
// ---- battle stage: the two face-off streams go head to head; admin arranges it by dragging ----
const ST_ITEMS = [["score","Scoreboard"],["a","Screen A"],["vs","VS emblem"],["b","Screen B"],["callA","A's call"],["callB","B's call"],["clock","Round clock"],["host","Host screen"],["stand","Standings"],["banner","Title banner"]];
const ST_DEF = {score:{x:18,y:2.5,w:64}, a:{x:2.5,y:19,w:42.5}, b:{x:55,y:19,w:42.5}, vs:{x:42.5,y:27,w:15}, callA:{x:2.5,y:73,w:17}, callB:{x:80.5,y:73,w:17}, host:{x:40,y:61,w:20}, clock:{x:41,y:85,w:18}, stand:{x:21,y:73,w:17}, banner:{x:27,y:84.5,w:46}};
const ST_DEF_C = {banner:{x:27,y:1.5,w:46}, score:{x:14,y:14,w:72}, a:{x:2,y:29,w:40}, b:{x:58,y:29,w:40}, vs:{x:43.5,y:33,w:13}, host:{x:41.5,y:55,w:17}, callA:{x:2,y:80,w:19}, callB:{x:79,y:80,w:19}, clock:{x:41,y:83.5,w:18}, stand:{x:22,y:80,w:17}};
const ST_DEFS = {bots:ST_DEF, callers:ST_DEF_C}, ST_HIDE_DEFS = {bots:{stand:true, banner:true}, callers:{stand:true}};
const ST_KW = {bots:{lbl:"Bot battle", tag:"BOT", icon:"🤖", name:"Bots battle"}, callers:{lbl:"Caller face-off", tag:"CALLER", icon:"🎙", name:"Callers face-off"}};
S.stDrafts = {}; S.stSel = null;
function stEditKind(){ return S.stEditKind || battleKind(); }
try { Object.defineProperty(S, "stDraft", {get(){ return S.stDrafts[stEditKind()] || null; }, set(v){ S.stDrafts[stEditKind()] = v; }, configurable:true}); } catch {}
function stageSaved(){ return ((S.demo || !db) ? S.vxStageLocal : S.vxStage) || {}; }
function stageSavedFor(kind){ const sv = stageSaved(); if(sv[kind]) return sv[kind]; if(kind === "bots" && sv.lay) return sv; return {}; }
function stageCfg(kind, useDraft){ kind = kind || stEditKind(); if(useDraft === undefined) useDraft = true; const s = (useDraft && S.stDrafts[kind]) || stageSavedFor(kind), D = ST_DEFS[kind] || ST_DEF, lay = {};
  for(const k of Object.keys(D)) lay[k] = {...D[k], ...((s.lay || {})[k] || {})}; return {kind, on:s.on !== false, lay, hide:{...(ST_HIDE_DEFS[kind] || {}), ...(s.hide || {})}}; }
function stageOn(E){ return stageCfg(battleKind(), false).on; }
const stNum = v => { const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
function stageData(E){
  E = E || S.vxEnts || []; const snap = renderPromo.snap || {}, F = foShown(snap), U = foUrls(), fs = F.run ? (snap.foS || null) : null;
  const ea = E.find(e => e.kind === "fa") || {name:F.a, url:U.a}, eb = E.find(e => e.kind === "fb") || {name:F.b, url:U.b}, host = E.find(e => e.kind === "host") || null;
  const va = stNum(ea.score), vb = stNum(eb.score); let m = 50;
  if(va !== null && vb !== null){ const lo = Math.min(va, vb, 0), a = va - lo + 1, b = vb - lo + 1; m = Math.max(8, Math.min(92, Math.round(a / (a + b) * 100))); }
  const cur = curStart(), tgt = curTarget();
  return {a:{name:ea.name || F.a || "Side A", url:ea.url || U.a || "", call:ea.call || null, score:ea.score ?? "", lead:!!ea.lead}, b:{name:eb.name || F.b || "Side B", url:eb.url || U.b || "", call:eb.call || null, score:eb.score ?? "", lead:!!eb.lead},
    host:host ? {name:host.name, url:host.url || "", live:/live/i.test(host.role || "")} : null, mode:fs ? (FO_MODES[fs.mode] || "") : "Face-off", m,
    rnd:tLocal(cur), end:mmss(cur + BB_T - Date.now()), tgt:tgt ? "Target " + usd0(tgt.v) : "Target pending", board:(snap.board || []).slice(0, 5), title:battleTitle(), hostName:vxHost().name || "HardSmoke", fsLive:!!fs};
}
function stScreen(side, d, edit){
  const url = /^https:\/\//.test(d.url || "") ? d.url : "", emb = url ? vxEmbed(url, true) : null;
  return `<div class="stscr${d.lead ? " win" : ""}" data-sdc="lead${side}">${emb ? `<iframe src="${esc(emb)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen title="${esc(d.name)} stream"${edit ? ' tabindex="-1"' : ""}></iframe>` : `<div class="stph"><b>${side === "host" ? "▶" : side.toUpperCase()}</b><span>${url ? "Opens in a new tab" : edit ? (side === "host" ? "Set the host stream below" : "Pick this side's stream above") : "Stream starting soon"}</span>${url && !edit ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Watch ↗</a>` : ""}</div>`}</div>`;
}
function stCallHtml(c){ return c === "up" ? `<b class="up">▲ UP</b>` : c === "down" ? `<b class="down">▼ DOWN</b>` : `<b class="none">No call yet</b>`; }
function stDyn(D){ return {nameA:esc(D.a.name), nameB:esc(D.b.name), scoreA:esc(String(D.a.score === "" ? "—" : D.a.score)), scoreB:esc(String(D.b.score === "" ? "—" : D.b.score)), mode:esc(D.mode), callA:stCallHtml(D.a.call), callB:stCallHtml(D.b.call), rnd:esc(D.rnd), tgt:esc(D.tgt),
  leadA:D.a.lead ? `<span class="lead">LEADING</span>` : `<span class="lv">LIVE</span>`, leadB:D.b.lead ? `<span class="lead">LEADING</span>` : `<span class="lv">LIVE</span>`, title:esc(D.title), hostName:esc(D.hostName),
  stand:D.board.length ? D.board.map((x, i) => `<div><span>${i + 1}</span><b>${esc(x.name)}</b><em>${x.w}–${x.l}</em></div>`).join("") : `<div><span></span><b>No rounds scored yet</b><em></em></div>`}; }
function stageInner(D, C, edit, kind){
  const KW = ST_KW[kind] || ST_KW.bots;
  const lab = id => edit ? `<span class="stlab">${esc((ST_ITEMS.find(x => x[0] === id) || [, id])[1])}</span>${["nw","n","ne","e","se","s","sw","w"].map(h => `<i class="strs h-${h}" data-h="${h}" title="Drag to resize"></i>`).join("")}` : "";
  const el = (id, html) => C.hide[id] ? "" : `<div class="stel st-${id}${S.stSel === id && edit ? " sel" : ""}" data-stel="${id}"${edit ? ' tabindex="0" role="button" aria-label="Move ' + esc((ST_ITEMS.find(x => x[0] === id) || [, id])[1]) + '"' : ""}>${lab(id)}${html}</div>`;
  return el("score", `<div class="stsb"><div class="sn a"><b data-sd="nameA"></b><em data-sd="scoreA"></em></div><div class="mid"><i>${KW.tag} VS ${KW.tag}</i><span data-sd="mode"></span></div><div class="sn b"><b data-sd="nameB"></b><em data-sd="scoreB"></em></div><div class="stmeter" data-sdm><i class="ma"></i><i class="mb"></i></div></div>`)
    + el("a", `${stScreen("a", D.a, edit)}<div class="stplate"><span class="sd">A</span><span class="kt">${KW.icon} ${KW.tag}</span><b data-sd="nameA"></b><span data-sd="leadA"></span></div><i class="stcrn tl"></i><i class="stcrn br"></i>`)
    + el("b", `${stScreen("b", D.b, edit)}<div class="stplate"><span class="sd">B</span><span class="kt">${KW.icon} ${KW.tag}</span><b data-sd="nameB"></b><span data-sd="leadB"></span></div><i class="stcrn tl"></i><i class="stcrn br"></i>`)
    + el("vs", `<div class="stvs"><svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="stGr${kind}${edit ? "e" : ""}" x1="0" x2="1"><stop offset="0" style="stop-color:var(--A)"/><stop offset="1" style="stop-color:var(--B)"/></linearGradient><linearGradient id="stTg${kind}${edit ? "e" : ""}" x1="50" y1="15" x2="50" y2="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB547"/><stop offset=".55" stop-color="#4DA3FF"/><stop offset="1" stop-color="#B98CFF"/></linearGradient><radialGradient id="stTg${kind}${edit ? "e" : ""}h"><stop offset="0" stop-color="#4DA3FF" stop-opacity=".4"/><stop offset="1" stop-color="#4DA3FF" stop-opacity="0"/></radialGradient></defs><circle class="tghalo" cx="50" cy="50" r="49" fill="url(#stTg${kind}${edit ? "e" : ""}h)"/><circle cx="50" cy="50" r="37" fill="#05080C" fill-opacity=".9" stroke="#1A2A36" stroke-width=".5"/><circle class="tgo" cx="50" cy="50" r="47" fill="none" stroke="#8FA3B2" stroke-opacity=".45" stroke-width=".45" stroke-dasharray=".5 2.5"/><circle class="tga" cx="50" cy="50" r="42" fill="none" stroke="url(#stTg${kind}${edit ? "e" : ""})" stroke-width=".8" stroke-dasharray="18 5 2 5"/><polygon class="tgh" points="50,17 78.6,33.5 78.6,66.5 50,83 21.4,66.5 21.4,33.5" fill="none" stroke="#4DA3FF" stroke-opacity=".55" stroke-width=".5"/><circle cx="50" cy="50" r="22" fill="none" stroke="#8FA3B2" stroke-opacity=".35" stroke-width=".4" stroke-dasharray="1 2"/><polygon points="50,19 76.85,65.5 23.15,65.5" fill="rgba(77,163,255,.06)" stroke="url(#stTg${kind}${edit ? "e" : ""})" stroke-width="1.1"/><line x1="50" y1="19" x2="50" y2="50" stroke="#FFB547" stroke-opacity=".35" stroke-width=".5"/><line x1="76.85" y1="65.5" x2="50" y2="50" stroke="#B98CFF" stroke-opacity=".35" stroke-width=".5"/><line x1="23.15" y1="65.5" x2="50" y2="50" stroke="#4DA3FF" stroke-opacity=".35" stroke-width=".5"/><line class="tgl" pathLength="100" x1="50" y1="19" x2="50" y2="50" stroke="#FFB547" stroke-width="1"/><line class="tgl l2" pathLength="100" x1="76.85" y1="65.5" x2="50" y2="50" stroke="#B98CFF" stroke-width="1"/><line class="tgl l3" pathLength="100" x1="23.15" y1="65.5" x2="50" y2="50" stroke="#4DA3FF" stroke-width="1"/><polygon class="tgrun" pathLength="100" points="50,19 76.85,65.5 23.15,65.5" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="7 93"/><polygon class="tgrun r2" pathLength="100" points="50,19 76.85,65.5 23.15,65.5" fill="none" stroke="#FFD166" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="5 95"/><polygon class="tgred" points="50,19 76.85,65.5 23.15,65.5" fill="rgba(255,77,106,.14)" stroke="#FF4D6A" stroke-width="1.6"/><circle class="tgp" cx="50" cy="19" r="2.5" fill="none" stroke="#FFB547" stroke-width=".8"/><circle class="tgp p2" cx="76.85" cy="65.5" r="2.5" fill="none" stroke="#B98CFF" stroke-width=".8"/><circle class="tgp p3" cx="23.15" cy="65.5" r="2.5" fill="none" stroke="#4DA3FF" stroke-width=".8"/><circle class="tgn" cx="50" cy="19" r="2.5" fill="#FFB547" style="color:#FFB547"/><circle class="tgn" cx="23.15" cy="65.5" r="2.5" fill="#4DA3FF" style="color:#4DA3FF"/><circle class="tgn" cx="76.85" cy="65.5" r="2.5" fill="#B98CFF" style="color:#B98CFF"/><g class="dface"><g transform="translate(25 22) scale(.83)"><path d="M9 16 C2 13 0 7 3 0 C4.5 6 8 10 14.5 13 Z"/><path d="M51 16 C58 13 60 7 57 0 C55.5 6 52 10 45.5 13 Z"/></g><path transform="translate(29 41)" d="M1 1 L19 6 Q14 10 7 9 Q2 7 1 1 Z"/><path transform="translate(52 41)" d="M19 1 L1 6 Q6 10 13 9 Q18 7 19 1 Z"/><g transform="translate(25 57) scale(.83)"><path d="M3 3 Q30 26 57 3 Q30 14 3 3 Z"/><path class="fang" d="M17 8.6 L19.5 14 L22 9.8 Z M43 8.6 L40.5 14 L38 9.8 Z"/></g></g></svg><b>VS</b></div>`)
    + el("callA", `<div class="stcall"><small>A's call this round</small><span data-sd="callA"></span></div>`)
    + el("callB", `<div class="stcall"><small>B's call this round</small><span data-sd="callB"></span></div>`)
    + el("host", `<div class="sthost">${D.host ? stScreen("host", D.host, edit) : `<div class="stscr"><div class="stph"><b>▶</b><span>No host screen</span></div></div>`}<div class="hl"><span>Host</span><span data-sd="hostName"></span></div></div>`)
    + el("clock", `<div class="stclk"><span>Round <x data-sd="rnd"></x></span><b class="bEnd">${esc(D.end)}</b><span data-sd="tgt"></span></div>`)
    + el("stand", `<div class="ststand"><h6>Standings</h6><div data-sd="stand" style="display:grid;grid-template-columns:1fr;gap:.3cqw"></div></div>`)
    + el("banner", `<div class="stbanner"><b><i data-sd="hostName" style="font-style:normal"></i> presents</b><span data-sd="title"></span></div>`);
}
function stageRender(box, E, edit){
  if(!box) return;
  const on = edit || stageOn(E); if(box.id === "vxStage") box.hidden = !on; if(!on){ if(box.dataset.stsig){ box.innerHTML = ""; box.dataset.stsig = ""; } return; }
  const kind = edit ? stEditKind() : battleKind(), D = stageData(E), C = stageCfg(kind, edit);
  const sig = [edit, kind, D.a.url, D.b.url, D.host ? D.host.url : "", JSON.stringify(C.hide)].join("|");
  if(box.dataset.stsig !== sig){ box.dataset.stsig = sig; box.innerHTML = `<div class="stg k-${kind}${edit ? " edit" : ""}"><div class="stfx" aria-hidden="true"><i></i><i></i></div>${stageInner(D, C, edit, kind)}</div>`; }
  const g = box.querySelector(".stg"); if(!g) return;
  if(edit) g.querySelectorAll(".stel").forEach(n => n.classList.toggle("sel", n.dataset.stel === S.stSel));
  for(const [id, p] of Object.entries(C.lay)){ const n = g.querySelector(`[data-stel="${id}"]`); if(n && !n.classList.contains("drag")){ n.style.left = p.x + "%"; n.style.top = p.y + "%"; n.style.width = p.w + "%"; } }
  const dy = stDyn(D); g.querySelectorAll("[data-sd]").forEach(n => { const v = dy[n.dataset.sd]; if(v !== undefined && n.innerHTML !== v) n.innerHTML = v; });
  g.querySelectorAll("[data-sdm]").forEach(n => { n.style.setProperty("--m", D.m + "%"); const a = n.querySelector(".ma"); if(a) a.style.width = D.m + "%"; });
  g.querySelectorAll('[data-sdc="leada"]').forEach(n => n.classList.toggle("win", D.a.lead)); g.querySelectorAll('[data-sdc="leadb"]').forEach(n => n.classList.toggle("win", D.b.lead));
}
function renderStageCtl(E, ed){
  const box = $("bStage"); if(!box) return;
  if(!ed){ box.innerHTML = ""; return; }
  const EK = stEditKind(), C = stageCfg(EK, true), F = foNames(), U = foUrls(), live = cortexStreams().filter(s => /^https:\/\//.test(s.url || ""));
  const opt = (side, cur) => `<select data-stsrc="${side}" aria-label="Stream for side ${side.toUpperCase()}"><option value="">${cur ? "Current: " + esc(domainOf(cur)) : "No stream set"}</option>${live.map(s => `<option value="${esc(s.url)}">${esc((s.title || "Live stream") + (s.who ? " · " + s.who : ""))}</option>`).join("")}<option value="__custom">Paste a link…</option></select>`;
  const head = `<div class="stctl"><h4>Battle stage <small>what viewers see on the Vortex and in full screen when a face-off is on</small></h4>
    <div class="strow"><span class="hint">Layout for</span>${["bots","callers"].map(k => `<button type="button" class="stkb${EK === k ? " on" : ""}" data-stkind="${k}" aria-pressed="${EK === k}">${ST_KW[k].icon} ${ST_KW[k].name}${battleKind() === k ? " <em>LIVE NOW</em>" : ""}</button>`).join("")}<span class="hint">Each battle type keeps its own layout and look. Viewers see the ${esc(ST_KW[battleKind()].name)} layout right now.</span></div>
    <div class="strow"><label class="chipt"><input type="checkbox" data-ston ${C.on ? "checked" : ""}>Show the battle stage to viewers</label><span class="hint">Side A: <b style="color:#4DA3FF">${esc(F.a || "not set")}</b> · Side B: <b style="color:#FF4D6A">${esc(F.b || "not set")}</b> (names come from the Face-off box)</span></div>
    <div class="strow"><span class="hint">A's stream</span>${opt("a", U.a)}<span class="hint">B's stream</span>${opt("b", U.b)}</div>
    <div class="strow">${ST_ITEMS.map(([k, l]) => `<label class="chipt"><input type="checkbox" data-stshow="${k}" ${C.hide[k] ? "" : "checked"}>${esc(l)}</label>`).join("")}</div>
    <div class="stprevlab"><span>Viewer preview · ${S.stDraft ? "unsaved changes" : "live on screen"}</span><span style="color:var(--ink-3);letter-spacing:.04em;text-transform:none;font-weight:400">Drag anything to move it · drag the yellow dot to resize · arrow keys nudge</span></div>
    <div id="stEdit"></div>
    <div class="strow"><button class="btn sm" type="button" data-stsave>Put on screen</button><button class="btn ghost sm" type="button" data-streset>Reset layout</button>${S.stDraft ? `<button class="xbtn2" type="button" data-stundo>Discard changes</button><span class="pst" style="--c:#FFB547">UNSAVED · viewers still see the last saved layout</span>` : ""}<span style="flex:1"></span><button class="btn ghost sm" type="button" data-monprev>⛶ Preview full screen</button></div></div>`;
  const hsig = JSON.stringify([EK, battleKind(), C.on, C.hide, F, U, !!S.stDraft, live.map(s => s.url)]);
  if(renderStageCtl.hsig !== hsig || !$("stEdit")){ renderStageCtl.hsig = hsig; const keep = $("stEdit") ? $("stEdit").firstChild : null; box.innerHTML = head; if(keep) $("stEdit").appendChild(keep); }
  stageRender($("stEdit"), E, true);
}
function stEdit(fn){ const s = JSON.parse(JSON.stringify(stageCfg(stEditKind(), true))); fn(s); S.stDraft = s; renderStageCtl.hsig = null; renderStageCtl(S.vxEnts, true); }
document.addEventListener("change", e => {
  const t = e.target; if(!t.closest || !t.closest("#bStage")) return;
  if(t.matches("[data-ston]")) stEdit(s => s.on = t.checked);
  if(t.dataset.stshow) stEdit(s => s.hide[t.dataset.stshow] = !t.checked);
  if(t.dataset.stsrc){ const side = t.dataset.stsrc; let v = t.value; if(!v) return;
    if(v === "__custom"){ const inp = $(side === "a" ? "bAu" : "bBu"); if(inp){ inp.scrollIntoView({block:"center", behavior:"smooth"}); setTimeout(() => inp.focus(), 300); toast("Paste the stream link for side " + side.toUpperCase()); } t.value = ""; return; }
    const ia = $("bAu"), ib = $("bBu"); if(ia && ib){ if(side === "a") ia.value = v; else ib.value = v; foSaveUrls(); toast("Side " + side.toUpperCase() + " stream set"); } }
});
document.addEventListener("click", e => { const b = e.target.closest("[data-stkind]"); if(!b) return; S.stEditKind = b.dataset.stkind; S.stSel = null; renderStageCtl.hsig = null; renderStageCtl(S.vxEnts, true); });
document.addEventListener("click", async e => {
  if(e.target.closest("[data-streset]")){ { const k = stEditKind(); S.stDraft = {on:stageCfg(k, true).on, lay:JSON.parse(JSON.stringify(ST_DEFS[k])), hide:{...ST_HIDE_DEFS[k]}}; } renderStageCtl.hsig = null; renderStageCtl(S.vxEnts, true); return; }
  if(e.target.closest("[data-stundo]")){ S.stDraft = null; renderStageCtl.hsig = null; $("stEdit") && ($("stEdit").dataset.stsig = ""); renderStageCtl(S.vxEnts, true); return; }
  if(!e.target.closest("[data-stsave]")) return;
  const k = stEditKind(), C = stageCfg(k, true), cfg = {on:C.on, lay:C.lay, hide:C.hide, t:Date.now()}, nm = ST_KW[k].name;
  const next = {...stageSaved()}; delete next.lay; delete next.hide; delete next.on; next[k] = cfg;
  if(S.demo || !db){ S.vxStageLocal = next; S.stDraft = null; toast(`${nm} layout saved (preview only)`); }
  else { if(!isAdmin) return; if(!(await act(() => db.doc("config/vxstage").set(next)))) return; S.vxStage = next; S.stDraft = null; toast(battleKind() === k ? `${nm} layout is live for viewers` : `${nm} layout saved. Viewers get it when the battle type is ${nm}.`); }
  renderStageCtl.hsig = null; renderBattle();
});
let stDrag = null;
function stDragApply(){ const d = stDrag; if(!d) return; d.raf = 0; const st = d.el.style; st.left = d.x + "%"; st.width = d.w + "%"; if(d.hd && d.hd.includes("n")){ const h = d.el.offsetHeight / d.R.height * 100; d.y = Math.max(0, Math.round((d.y0 + d.h0 - h) * 4) / 4); } st.top = d.y + "%"; }
document.addEventListener("pointerdown", e => {
  if(e.button !== undefined && e.button !== 0) return;
  const el = e.target.closest(".stg.edit .stel"); if(!el) return;
  const g = el.closest(".stg"), id = el.dataset.stel, R = g.getBoundingClientRect(), L = stageCfg(stEditKind(), true).lay[id]; if(!L) return;
  const hd = e.target.closest(".strs"), h0 = el.offsetHeight / R.height * 100;
  S.stSel = id; g.querySelectorAll(".stel.sel").forEach(n => n.classList.remove("sel")); el.classList.add("sel");
  stDrag = {id, el, g, R, sx:e.clientX, sy:e.clientY, x0:L.x, y0:L.y, w0:L.w, h0, k:h0 / Math.max(.1, L.w), hd:hd ? hd.dataset.h : "", x:L.x, y:L.y, w:L.w, moved:false, pid:e.pointerId, raf:0};
  try { el.setPointerCapture(e.pointerId); } catch {}
  document.body.classList.add("stdragging"); g.classList.add("busy");
  e.preventDefault(); el.focus({preventScroll:true});
}, true);
document.addEventListener("pointermove", e => {
  const d = stDrag; if(!d) return; e.preventDefault();
  const dx = (e.clientX - d.sx) / d.R.width * 100, dy = (e.clientY - d.sy) / d.R.height * 100, q = v => Math.round(v * 4) / 4;
  if(!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 2){ d.moved = true; d.el.classList.add("drag"); }
  if(!d.moved) return;
  if(d.hd){
    const H = d.hd, east = H.includes("e"), west = H.includes("w"), south = H.includes("s"), north = H.includes("n");
    let wx = null, wy = null;
    if(east) wx = d.w0 + dx; if(west) wx = d.w0 - dx;
    if(south) wy = d.w0 + dy / d.k; if(north) wy = d.w0 - dy / d.k;
    let w = wx !== null && wy !== null ? (Math.abs(wx - d.w0) >= Math.abs(wy - d.w0) ? wx : wy) : (wx !== null ? wx : wy);
    // keep the opposite side fixed and stay on the stage
    const right = d.x0 + d.w0, bottom = d.y0 + d.h0, cx = d.x0 + d.w0 / 2;
    const maxW = west ? right : (east ? 100 - d.x0 : Math.min(cx, 100 - cx) * 2);
    const maxWh = north ? bottom / d.k : (south ? (100 - d.y0) / d.k : 1e9);
    w = q(Math.max(5, Math.min(w, maxW, maxWh)));
    const h = w * d.k;
    d.w = w;
    d.x = west ? q(right - w) : (east ? d.x0 : q(cx - w / 2));
    d.y = north ? q(bottom - h) : d.y0;
  } else {
    d.x = Math.max(0, Math.min(100 - d.w0, q(d.x0 + dx))); d.y = Math.max(0, Math.min(Math.max(0, 100 - d.h0), q(d.y0 + dy))); d.w = d.w0;
  }
  if(!d.raf) d.raf = requestAnimationFrame(stDragApply);
}, true);
function stDragEnd(){
  const d = stDrag; if(!d) return; stDrag = null; if(d.raf) cancelAnimationFrame(d.raf); stDragApply.call(null);
  d.el.style.left = d.x + "%"; d.el.style.top = d.y + "%"; d.el.style.width = d.w + "%";
  try { d.el.releasePointerCapture(d.pid); } catch {}
  document.body.classList.remove("stdragging"); d.g.classList.remove("busy"); d.el.classList.remove("drag");
  if(!d.moved) return;
  const s = JSON.parse(JSON.stringify(stageCfg(stEditKind(), true))); s.lay[d.id] = {x:d.x, y:d.y, w:d.w}; S.stDraft = s; renderStageCtl(S.vxEnts, true);
}
document.addEventListener("pointerup", stDragEnd, true);
document.addEventListener("pointercancel", stDragEnd, true);
window.addEventListener("blur", stDragEnd);
document.addEventListener("dragstart", e => { if(e.target.closest && e.target.closest(".stg.edit")) e.preventDefault(); });
document.addEventListener("keydown", e => {
  const el = e.target.closest && e.target.closest(".stg.edit .stel"); if(!el) return;
  const k = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]}[e.key]; if(!k) return; e.preventDefault();
  const st = e.shiftKey ? 2 : .5, id = el.dataset.stel, s = JSON.parse(JSON.stringify(stageCfg(stEditKind(), true))), p = s.lay[id];
  p.x = Math.max(0, Math.min(100 - p.w, p.x + k[0]*st)); p.y = Math.max(0, Math.min(98, p.y + k[1]*st)); S.stDraft = s; S.stSel = id; renderStageCtl(S.vxEnts, true);
  const n = document.querySelector(`#stEdit [data-stel="${id}"]`); if(n) n.focus({preventScroll:true});
});
setInterval(() => { const cs = curStart(), t = mmss(cs + BB_T - Date.now()); document.querySelectorAll(".stg .bEnd").forEach(x => { if(x.textContent !== t) x.textContent = t; }); }, 1000);
function renderMonStage(E){
  const box = $("bMonStage"); if(!box) return;
  const on = stageOn(E), kind = battleKind(), nm = ST_KW[kind].name, F = foNames();
  const why = !stageCfg(kind, false).on ? `The battle stage is turned off for the ${esc(nm)}, so viewers see the stream wall with HardSmoke's screen in the spotlight.` : "";
  const head = `<h4>${on ? `<span class="onair">● ON AIR</span>` : ""}Live display · battle stage <small>exactly what the audience sees right now (${esc(nm)} layout${S.stDrafts[kind] ? ", your unsaved edits aren't shown" : ""})</small></h4>`;
  const hs = head + on;
  if(box.dataset.hs !== hs){ box.dataset.hs = hs; box.className = "monstage"; box.innerHTML = head + (on ? `<div id="bMonStageV"></div>` : `<div class="off">${why}</div>`); }
  if(on) stageRender($("bMonStageV"), E, false);
}
// ---- Vortex stats cards per battle type ----
function vxBotStats(rows, snap){
  const R = (rows || []).slice(0, 8), win = S.bPeriod === "24h" ? "last 24h" : "last 7 days";
  const body = R.length ? `<table class="vxst"><thead><tr><th>Bot</th><th>W–L</th><th>Win</th><th>Streak</th><th>Next</th></tr></thead><tbody>${R.map((r, i) => `<tr class="${i === 0 && r.n >= 5 ? "vxlead" : ""}"><td class="nm">${r.n >= 5 ? i + 1 + ". " : ""}${esc(r.name)}</td><td>${r.w}–${r.l}</td><td>${r.n ? Math.round(r.pct*100) + "%" : "—"}</td><td>${r.sk ? `<span class="stk ${r.sw ? "w" : "l"}">${r.sw ? "W" : "L"}${r.sk}</span>` : ""}</td><td>${r.next === "up" ? `<span class="up">▲</span>` : r.next === "down" ? `<span class="down">▼</span>` : "·"}</td></tr>`).join("")}</tbody></table>` : `<div class="meta">No bots scored yet. Bots join when their creators post final calls in the Bot console.</div>`;
  return `<h4>Bot battle ${snap.warStatus || ""}</h4><div class="meta">${snap.warMeta || ""}${snap.warMeta ? " · " : ""}Standings, ${win}</div>${body}`;
}
function vxMatchStats(rows, src){
  const F = foNames(); if(!F.a && !F.b) return `<h4>Face-off match</h4><div class="meta">No face-off set yet. HardSmoke names the two callers in Battle control.</div>`;
  const cut = Date.now() - (S.bPeriod === "24h" ? 86400000 : 7*86400000), cur = curStart(), snap = renderPromo.snap || {}, fs = snap.foS || null;
  const st = n => { if(!n) return null; const E = entityOf(n, rows, src), h = E.hist.filter(x => x.start >= cut), w = h.filter(x => x.d === x.res).length; return {name:n, w, l:h.length - w, n:h.length, pct:h.length ? Math.round(w / h.length * 100) : null, sk:E.sk, sw:E.sw, now:E.calls[cur] || null, next:E.next}; };
  const A = st(F.a), B = st(F.b), c = d => d === "up" ? `<span class="up">▲ UP</span>` : d === "down" ? `<span class="down">▼ DOWN</span>` : "—";
  const row = (k, va, vb, better) => `<div class="v${better === "a" ? " win" : ""}">${va}</div><div class="k">${k}</div><div class="v b${better === "b" ? " win" : ""}">${vb}</div>`;
  const cmp = (x, y) => x == null || y == null || x === y ? "" : x > y ? "a" : "b";
  const sc = s => s ? esc(String(s.v ?? "—")) : "—";
  return `<h4>Face-off match · ${esc(S.bPeriod === "24h" ? "last 24h" : "last 7 days")}</h4>
    <div class="vxm"><div class="h a">${esc(A ? A.name : "Side A")}</div><div class="k">VS</div><div class="h b">${esc(B ? B.name : "Side B")}</div><hr>
    ${fs ? row(esc(FO_MODES[fs.mode] || "Score"), sc(fs.a), sc(fs.b), fs.a && fs.a.lead ? "a" : fs.b && fs.b.lead ? "b" : "") : ""}
    ${row("Rounds won", A ? A.w : "—", B ? B.w : "—", cmp(A && A.w, B && B.w))}
    ${row("Rounds lost", A ? A.l : "—", B ? B.l : "—", cmp(B && B.l, A && A.l))}
    ${row("Win rate", A && A.pct != null ? A.pct + "%" : "—", B && B.pct != null ? B.pct + "%" : "—", cmp(A && A.pct, B && B.pct))}
    ${row("Streak", A && A.sk ? (A.sw ? "W" : "L") + A.sk : "—", B && B.sk ? (B.sw ? "W" : "L") + B.sk : "—", "")}
    ${row("This round", c(A && A.now), c(B && B.now), "")}
    ${row("Next round", c(A && A.next), c(B && B.next), "")}</div>`;
}
// ---- round picker ----
const rndDur = n => { const m = n * 15; return m < 60 ? m + " min" : m % 60 ? (m / 60).toFixed(1).replace(/\.0$/, "") + " hours" : (m / 60) + (m === 60 ? " hour" : " hours"); };
function rndPicker(kind, cur, running){
  const what = kind === "bb" ? "the bots' lineup battle" : "this face-off";
  return `<div class="rndpick" role="group" aria-label="Number of rounds for ${what}"><div class="rph"><b>🔢 Number of rounds</b><span>for ${what} · each round is one 15-minute Kalshi BTC round</span><em>${running ? `Running now: ${running} rounds (${rndDur(running)})` : `${cur} rounds ≈ ${rndDur(cur)}`}</em></div>
    <div class="rpc">${[4,8,12,16,24,32,48,96].map(n => `<button type="button" data-rnd="${kind}|${n}" aria-pressed="${n === cur}"${running && kind === "bb" ? " disabled" : ""}>${n}<small>${rndDur(n)}</small></button>`).join("")}</div>
    ${running ? `<div class="run">${kind === "bb" ? "End the current battle to change the number of rounds." : "Pick a new number and press Restart to run the face-off again with it."}</div>` : ""}</div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-rnd]"); if(!b || b.disabled) return; const [k, n] = b.dataset.rnd.split("|"); if(k === "bb") S.bbLen = +n; else S.btRounds = +n; renderBattle(); });
// ---- Vortex audience: who's here + permission to stream ----
S.vxPerm = {}; S.vxPermLocal = {all:false, allow:{d_tt:true}, deny:{}};
function vxPermCfg(){ return ((S.demo || !db) ? S.vxPermLocal : S.vxPerm) || {}; }
function vxCanStream(uid){ const P = vxPermCfg(); if(!uid) return false; if(mpPreview() && (uid === meId || uid === "me")) return true; return !!P.all || !!(P.allow || {})[uid] || (isAdmin && uid === meId); }
function vxAudData(){
  if(S.demo || !db){ const L = [{uid:"d_tt", name:"theta_tina (demo)", req:Date.now() - 600000, live:{on:true, url:"https://www.twitch.tv/", title:"Watching the battle, live reactions", t:Date.now() - 900000}}, {uid:"d_gl", name:"gridlord (demo)", req:Date.now() - 120000, live:null}];
    const me = S.previewPub || {}; if(me.vxReq || me.vxLive) L.push({uid:"me", name:"You (preview)", req:me.vxReq || 0, live:me.vxLive || null, me:true}); return L; }
  const L = Object.entries(S.botDocs || {}).map(([uid, d]) => ({uid, name:S.nameCache[uid] || "", req:((d.pub || {}).vxReq) || 0, live:(d.pub || {}).vxLive || null})).filter(x => x.req || (x.live && x.live.on));
  const miss = L.filter(x => !(x.uid in S.nameCache)).map(x => x.uid);
  if(miss.length && user && !vxAudData.busy){ vxAudData.busy = true; user.profiles(miss).then(ps => { miss.forEach(id => S.nameCache[id] = (ps && ps[id] && ps[id].name) || "Member"); }).catch(() => miss.forEach(id => S.nameCache[id] = "Member")).finally(() => { vxAudData.busy = false; renderBattle(); }); }
  return L;
}
const vxLiveOn = L => !!(L && L.on && /^https:\/\//.test(L.url || "") && Date.now() - (L.t || 0) < 12*3600000);
function vxAudEnts(){ return vxAudData().filter(x => vxLiveOn(x.live) && vxCanStream(x.uid === "me" ? meId || "me" : x.uid)).map(x => ({kind:"aud", role:"Audience stream", name:x.name || S.nameCache[x.uid] || "Member", url:x.live.url, call:null, score:"LIVE", scls:"n", sub:x.live.title || "Streaming from the audience", lead:false, hid:x.uid})); }
function vxAudience(){
  if(S.demo) return (S.demoPeers || []).map(p => ({id:null, name:p.name, color:p.color, live:false}));
  const ppl = onlinePeople().filter(p => p.vx), seen = new Set(ppl.map(p => p.id)), since = Date.now() - 30*60000;
  const recent = loungeMsgs().filter(m => m.tab === "vortex" && m.t > since && m.a && !seen.has(m.a)).map(m => m.a).filter((v, i, a) => a.indexOf(v) === i);
  return ppl.map(p => ({id:p.id, here:true})).concat(recent.map(id => ({id, here:false})));
}
function vxMyStreamBox(){
  if(!(S.demo || !db || (meId && canWrite))) return `<div class="mybox"><span class="st">Sign in to stream to the Vortex.</span></div>`;
  const pub = mpPreview() ? (S.previewPub || {}) : myPub(), can = vxCanStream(meId || "me"), L = pub.vxLive, on = vxLiveOn(L), P = vxPermCfg(), denied = meId && (P.deny || {})[meId] && (P.deny[meId] >= (pub.vxReq || 0));
  if(!can) return `<div class="mybox"><b style="font:700 11px var(--mono);letter-spacing:.12em;color:#5BE3C8">🎥 STREAM TO THE VORTEX</b>${pub.vxReq && !denied ? `<span class="st">Request sent. HardSmoke will let you in from Battle control.</span><div class="r"><button class="xbtn2" type="button" data-vxreqx>Cancel request</button></div>` : `<span class="st">${denied ? "Your last request wasn't approved. You can ask again." : "Want your stream on the Vortex screens? Ask the host."}</span><div class="r"><button class="btn sm" type="button" data-vxreq>Ask to stream</button></div>`}</div>`;
  return `<div class="mybox"><b style="font:700 11px var(--mono);letter-spacing:.12em;color:#5BE3C8">🎥 ${on ? "YOU'RE STREAMING" : "YOU CAN STREAM HERE"}</b>
    <input id="vxSU" type="url" value="${esc((L && L.url) || "")}" placeholder="https://twitch.tv/you · youtube.com/… · kick.com/…" aria-label="Your stream link">
    <input id="vxST" maxlength="60" value="${esc((L && L.title) || "")}" placeholder="What you're streaming (optional)" aria-label="Stream title">
    <div class="r">${on ? `<button class="btn ghost sm" type="button" data-vxgo>Update</button><button class="btn sm" type="button" data-vxend style="background:#FF4D6A;border-color:#FF4D6A">End stream</button>` : `<button class="btn sm" type="button" data-vxgo>● Go live on the Vortex</button>`}</div>
    <span class="st">${on ? "Viewers can turn your stream on in the Screens bar." : "Your stream shows up in everyone's Screens bar to pick."}</span></div>`;
}
function renderVxWhoOld(){
  const box = $("vxWho"); if(!box || !S.vortexPage) return;
  if(box.contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName)) return;
  const A = vxAudience(), here = A.filter(x => x.here !== false), recent = A.filter(x => x.here === false), streaming = new Set(vxAudEnts().map(e => e.hid));
  const row = x => `<div class="wr">${x.id ? avatar(x.id) : `<span class="av" style="background:${esc(x.color || "#5BE3C8")}"></span>`}${x.id ? who(x.id) : `<span class="who">${esc(x.name || "Member")}</span>`}${x.id && isAdmin && x.id === meId ? `<span class="hb">HOST</span>` : ""}${x.id && streaming.has(x.id) ? `<span class="lvb">LIVE</span>` : ""}<small>${x.here === false ? "recently" : "here now"}</small></div>`;
  box.innerHTML = `<h4>In the Vortex <span style="color:#5BE3C8">${here.length}</span></h4><div class="wl">${here.length ? here.map(row).join("") : `<div class="meta">Nobody else is here yet.</div>`}${recent.length ? `<div class="sub">Recently in the chat</div>${recent.map(row).join("")}` : ""}</div>${vxMyStreamBox()}`;
  fillNames(box);
}
function renderAudCtl(ed){
  const box = $("bAud"); if(!box) return; if(!ed){ box.innerHTML = ""; return; }
  if(box.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type !== "checkbox") return;
  const P = vxPermCfg(), D = vxAudData(), allow = P.allow || {}, deny = P.deny || {};
  const reqs = D.filter(x => x.req && !allow[x.uid] && !(deny[x.uid] >= x.req) && !x.me), ok = Object.keys(allow).filter(k => allow[k]);
  const nm = (uid, name) => name ? `<span class="who">${esc(name)}</span>` : who(uid), av = uid => /^d_|^me$/.test(uid) ? `<span class="av" style="background:#5BE3C8"></span>` : avatar(uid);
  const liveOf = uid => { const x = D.find(y => y.uid === uid); return x && vxLiveOn(x.live) ? x.live : null; };
  box.innerHTML = `<div class="audctl"><h4>Audience streams <small>members who stream to the Vortex screens</small></h4>
    <label class="atog"><input type="checkbox" data-vxall ${P.all ? "checked" : ""}>Let any member stream without asking</label>
    <div class="sub" style="font:700 10px var(--mono);letter-spacing:.12em;color:var(--ink-3)">REQUESTS · ${reqs.length}</div>
    ${reqs.length ? reqs.map(x => `<div class="ar">${av(x.uid)}<div class="t">${nm(x.uid, x.name)}<small>asked ${esc(ago(x.req))}</small></div><button class="btn sm" type="button" data-vxallow="${esc(x.uid)}">Allow</button><button class="xbtn2" type="button" data-vxdeny="${esc(x.uid)}">Deny</button></div>`).join("") : `<div class="empty">No requests right now. Members ask from the Vortex page.</div>`}
    <div class="sub" style="font:700 10px var(--mono);letter-spacing:.12em;color:var(--ink-3)">ALLOWED · ${ok.length}${P.all ? " (plus everyone, while the switch above is on)" : ""}</div>
    ${ok.length ? ok.map(uid => { const L = liveOf(uid), x = D.find(y => y.uid === uid) || {}; return `<div class="ar">${av(uid)}<div class="t">${nm(uid, x.name)}<small>${L ? "● live · " + esc(L.title || domainOf(L.url)) : "not streaming right now"}</small></div><button class="xbtn2" type="button" data-vxrevoke="${esc(uid)}">Revoke</button></div>`; }).join("") : `<div class="empty">Nobody allowed yet.</div>`}
    <div class="empty">Live audience streams appear in the Screens bar on the Vortex and in the Live display monitor below, where you can take any of them off air.</div></div>`;
  fillNames(box);
}
async function vxPermSave(patch, msg){
  if(S.demo || !db){ const P = S.vxPermLocal; S.vxPermLocal = {...P, ...patch, allow:{...(P.allow || {}), ...(patch.allow || {})}, deny:{...(P.deny || {}), ...(patch.deny || {})}}; toast(msg + " (preview only)"); renderBattle(); return; }
  if(!isAdmin) return; if(await act(() => mergeWrite(db.doc("config/vxperm"), patch))){ S.vxPerm = cxDeep(S.vxPerm || {}, patch); toast(msg); renderBattle(); }
}
document.addEventListener("change", e => { const t = e.target; if(t.matches && t.matches("[data-vxall]")) vxPermSave({all:t.checked}, t.checked ? "Any member can stream now" : "Members need your OK to stream"); });
document.addEventListener("click", async e => {
  const t = e.target, d = (t.closest("[data-vxallow],[data-vxdeny],[data-vxrevoke],[data-vxreq],[data-vxreqx],[data-vxgo],[data-vxend]") || {}).dataset; if(!d) return;
  if(d.vxallow) return vxPermSave({allow:{[d.vxallow]:true}}, "Allowed to stream");
  if(d.vxdeny) return vxPermSave({deny:{[d.vxdeny]:Date.now()}}, "Request denied");
  if(d.vxrevoke) return vxPermSave({allow:{[d.vxrevoke]:false}}, "Streaming permission removed");
  if("vxreq" in d){ if(await savePub({vxReq:Date.now()}, "Request sent to the host")){ renderVxWho(); renderBattle(); } return; }
  if("vxreqx" in d){ if(await savePub({vxReq:0}, "Request cancelled")){ renderVxWho(); renderBattle(); } return; }
  if("vxgo" in d){ const url = ($("vxSU").value || "").trim(), title = ($("vxST").value || "").trim().slice(0, 60); if(!/^https:\/\//.test(url)) return toast("Paste your stream link, starting with https://");
    const was = vxLiveOn((mpPreview() ? S.previewPub || {} : myPub()).vxLive) ? (mpPreview() ? S.previewPub : myPub()).vxLive : null;
    if(await savePub({vxLive:{on:true, url, title, t:was ? was.t : Date.now()}}, was ? "Stream updated" : "You're live on the Vortex")){ document.activeElement && document.activeElement.blur(); renderBattle(); renderVxWho(); } return; }
  if("vxend" in d){ if(await savePub({vxLive:{on:false, t:Date.now()}}, "Stream ended")){ renderBattle(); renderVxWho(); } return; }
});
// ---- Vortex voice + audience (Discord-style): who's in voice lights up while talking ----
S.vxTalk = false; S.vxMute = false;
/* Built-in Vortex voice. When D3MON.CO is hosted on its own domain, connect a WebRTC voice service here
   (LiveKit, Agora or Daily): set provider, have join() connect to the "vortex" room with the member's id,
   leave() disconnect, setMuted() toggle the mic, and call VX_VOICE.onSpeaking(uid, true/false) from the
   service's speaking events. The room list, mute and speaking lights already run through these hooks. */
const VX_VOICE = {
  provider:null,
  available(){ return !!this.provider && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
  async join(room, uid){ return this.available() ? false : false; },
  async leave(){ return true; },
  setMuted(m){ return m; },
  onSpeaking(uid, on){ if(uid === meId){ S.vxTalk = !!on && !S.vxMute; pushPresence(); renderVxWho(); } }
};
const VX_SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
function vxVoicePeople(){
  if(S.demo){ const t = Math.floor(Date.now() / 1400); return (S.demoPeers || []).filter(p => !/^You/.test(p.name || "")).slice(0, 4).map((p, i) => ({id:null, name:p.name, color:p.color, voice:true, tk:(t + i) % 3 === 0, mu:i === 3})).concat(S.inVoice === "vortex" ? [{id:null, name:"You (demo)", color:"#2EE59D", voice:true, tk:!!S.vxTalk, mu:!!S.vxMute, me:true}] : []); }
  return onlinePeople().filter(p => p.voice === "vortex").map(p => ({...p, voice:true}));
}
function renderVxWho(){
  const box = $("vxWho"); if(!box || !S.vortexPage) return;
  if(box.contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName)) return;
  const V = vxVoicePeople(), inV = new Set(V.map(p => p.id).filter(Boolean)), A = vxAudience().filter(x => !(x.id && inV.has(x.id)) && !(S.demo && V.some(v => v.name === x.name)));
  const here = A.filter(x => x.here !== false), recent = A.filter(x => x.here === false), streaming = new Set(vxAudEnts().map(e => e.hid)), mine = S.inVoice === "vortex", audio = VX_VOICE.available();
  const face = x => x.id ? avatar(x.id) : `<span class="av" style="background:${esc(x.color || "#5BE3C8")}"></span>`;
  const nm = x => x.id ? who(x.id) : `<span class="who">${esc(x.name || "Member")}</span>`;
  const tags = x => `${x.id && isAdmin && x.id === meId ? `<span class="hb">HOST</span>` : ""}${x.id && streaming.has(x.id) ? `<span class="lvb">LIVE</span>` : ""}`;
  const vrow = x => `<div class="wr${x.tk && !x.mu ? " talking" : ""}"><span class="ring${x.tk && !x.mu ? " talk" : ""}">${face(x)}</span>${nm(x)}${tags(x)}<small>${x.mu ? `<span class="mut" title="Mic off">🔇</span>` : x.tk ? (S.demo || VX_VOICE.available() ? "talking" : "🎙 mic on") : ""}</small></div>`;
  const row = x => `<div class="wr"><span class="ring">${face(x)}</span>${nm(x)}${tags(x)}<small>${x.here === false ? "recently" : "watching"}</small></div>`;
  const canJoin = S.demo || !db || !!meId;
  const bar = !canJoin ? "" : mine
    ? `<div class="vxvbar"><button type="button" class="micsw${S.vxMute ? "" : " on"}" role="switch" aria-checked="${!S.vxMute}" data-vxmute title="Turn your mic on or off"><span class="tr"><i></i></span>${S.vxMute ? "🔇 Mic off" : "🎙 Mic on"}</button>${audio ? "" : `<span class="vnote">🎧 audio coming soon</span>`}<button type="button" class="xbtn2" data-vxvleave style="color:#FF4D6A">Leave</button></div>`
    : `<div class="vxvbar"><button type="button" class="btn sm" data-vxvjoin>🔊 Join voice</button><span class="vnote">Join the Vortex's own voice room.</span></div>`;
  const adminSet = audio ? "" : `<div class="vsoon"><b>🎧 Built-in voice · coming soon</b><span>Audio switches on when D3MON.CO runs on its own domain. Until then you can join the room and switch your mic on or off; your name lights up while your mic is on.</span></div>`;
  box.innerHTML = `<h4>Voice & audience <span style="color:#5BE3C8">${V.length + here.length}</span></h4>
    <div class="vh vc">${VX_SPK}vortex-voice <b>${V.length}</b></div>
    <div class="vrm">${V.length ? V.map(vrow).join("") : `<div class="vnote">Nobody in voice yet.</div>`}</div>
    ${bar}${adminSet}
    <div class="vh">Watching <b>${here.length}</b></div>
    <div class="wl">${here.length ? here.map(row).join("") : `<div class="vnote">Nobody else is watching yet.</div>`}${recent.length ? `<div class="sub">Recently in the chat</div>${recent.map(row).join("")}` : ""}</div>
    <div class="vnote">Names light up green while someone's mic is on and they're talking.</div>
    ${vxMyStreamBox()}`;
  fillNames(box);
}
document.addEventListener("click", e => {
  if(e.target.closest("[data-vxvjoin]")){ S.inVoice = "vortex"; S.vxMute = false; S.vxTalk = !VX_VOICE.available(); pushPresence(); VX_VOICE.join("vortex", meId).catch(() => {}); toast(VX_VOICE.available() ? "You're in the Vortex voice room" : "You joined the Vortex voice room. Audio turns on once the site is hosted."); renderVxWho(); if(typeof renderDock === "function") renderDock(); return; }
  if(e.target.closest("[data-vxvleave]")){ S.inVoice = null; S.vxTalk = false; pushPresence(); VX_VOICE.leave().catch(() => {}); toast("Left voice"); renderVxWho(); if(typeof renderDock === "function") renderDock(); return; }
  if(e.target.closest("[data-vxmute]")){ S.vxMute = !S.vxMute; S.vxTalk = S.vxMute ? false : !VX_VOICE.available(); toast(S.vxMute ? "Mic off" : "Mic on"); VX_VOICE.setMuted(S.vxMute); pushPresence(); renderVxWho(); return; }
});
setInterval(() => { if(S.demo && S.vortexPage) renderVxWho(); }, 1400);
async function saveBotUrl(el){ const sl = el.dataset.rurl, v = el.value.trim().slice(0, 300), list = rosterList().slice(), i = list.findIndex(en => slug(en.name) === sl); if(i < 0) return;
  if(v && !/^https:\/\//.test(v)){ el.value = list[i].url || ""; return toast("Stream links start with https://"); }
  if((list[i].url || "") === v) return; list[i] = {...list[i], url:v}; if(!v) delete list[i].url;
  if(await saveRoster(list)) toast(v ? `Stream link saved for ${list[i].name}` : `Stream link removed for ${list[i].name}`); }
$("bRoster").addEventListener("change", e => { const el = e.target.closest && e.target.closest("[data-rurl]"); if(el) saveBotUrl(el); });
$("bRoster").addEventListener("keydown", e => { const el = e.target.closest && e.target.closest("[data-rurl]"); if(el && e.key === "Enter"){ e.preventDefault(); el.blur(); } });
$("bRoster").addEventListener("change", async e => { const el = e.target.closest && e.target.closest("[data-rname]"); if(!el) return;
  const old = el.dataset.rname, nm = el.value.trim().replace(/\s+/g, " ").slice(0, 40), cur = (rosterList().find(en => slug(en.name) === old) || {}).name || "";
  if(!nm){ el.value = cur; return toast("Type a name."); } if(nm === cur) return;
  if(await renameBot(old, nm)){ renderBattle(); toast(`Saved as ${nm}`); } else el.value = cur; });
$("bRoster").addEventListener("keydown", e => { const el = e.target.closest && e.target.closest("[data-rname]"); if(el && e.key === "Enter"){ e.preventDefault(); el.blur(); } if(el && e.key === "Escape"){ el.value = (rosterList().find(en => slug(en.name) === el.dataset.rname) || {}).name || el.value; el.blur(); } });
// ---------- boot ----------
playIntro(false);
(function init(){
  const h = location.hash.slice(1); if(SECTIONS[h]) S.section = h; if(h === "command") S.cc = true; if(h === "cortex") S.cortex = true; if(h === "battle") setTimeout(() => openBattle(true), 0); if(h === "vortex") setTimeout(() => openVortex(true), 0);
  renderAll();
  if(!window.claude || !window.claude.use){ S.offline = true; renderAll(); return; }
  (async () => {
    const [d, u, r] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("room")]);
    db = d; user = u; roomApi = r;
    if(!db){ S.offline = true; renderAll(); return; }
    if(user){
      const me = await user.me();
      meId = me.id; isOwner = me.isOwner; S.meGuest = !!me.guest;
      isAdmin = await user.canEdit();
      $("adminBtn").hidden = !isAdmin;
      renderCxTop.sig = null; if(S.cortex) renderCxTop();
      const cw = await user.can("data.write");
      if(cw === false || !meId) canWrite = false;
      const box = $("me");
      if(meId){ box.innerHTML = `<img alt="" src="${esc(me.avatarUrl)}"><span></span>`; box.querySelector("span").textContent = me.name || "Signed in"; }
    } else canWrite = false;
    let got = 0; const mark = () => { if(++got >= 3){ S.ready = true; } };
    const fail = () => {};
    db.collection("subs").limit(1000).onSnapshot(s => { S.subs = s.docs.map(x => ({id:x.id, ...x.data()})); if(!S.ready) mark(); renderAll(); }, fail);
    db.collection("threads").orderBy("lastActivity","desc").limit(1000).onSnapshot(s => { S.threads = s.docs.map(x => ({id:x.id, ...x.data()})); if(!S.ready) mark(); renderAll(); }, fail);
    db.collection("streams").orderBy("createdAt","desc").limit(500).onSnapshot(s => { S.streams = s.docs.map(x => ({id:x.id, ...x.data()})); if(!S.ready) mark(); renderAll(); checkAnnouncements(); }, fail);
    subscribeDesk();
    subscribeSiteConfig();
    subscribeReviews();
    subscribeCoin();
    subscribeDM();
    subscribeListing();
    if(location.hash === "#admin" && isAdmin) setTimeout(() => openAdmin(true), 0);
    if(location.hash === "#me") setTimeout(() => openMe(true), 0);
    if(location.hash === "#coin") setTimeout(() => openCoin(true), 0);
    if(location.hash === "#messages") setTimeout(() => openDM(true), 0);
    subscribeVerify();
    loadFollows();
    subscribeRegistry();
    subscribeCommunity();
    subscribeStreamers();
    if(S.view === "thread") openPosts(S.openId);
  })();
})();
(() => { const b = document.querySelector("header.top .brand"); if(!b) return; b.style.cursor = "pointer"; b.title = "Home"; b.addEventListener("click", () => { if(S.dmPage) openDM(false); if(S.coinPage) openCoin(false); if(S.mePage) openMe(false); if(S.adminPage) openAdmin(false); if(S.callersPage) openCallersPage(false); if(S.cortex){ if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); openCortex(false); } if(S.cc) openCC(false); if(S.vortexPage) openVortex(false); if(S.battlePage) openBattle(false); window.scrollTo({top:0}); }); })(); // logo -> home (Oct 2026)
