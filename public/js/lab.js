// /lab: the D3MON Lab. Daily shorts from the AI teacher, then Showcase, Help Desk, Library and Experiments: a list of
// posts, one post with its replies (#p=<id>), and the form to write or edit one. A thin client over /api/v1/lab.
(function () {
  "use strict";
  const { api, esc, session, follow } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { me: null, admin: false, sections: [], posts: [], tab: "all", q: "", post: null, editing: null };
  let busy = false;

  const msg = (t, ok) => { $("msg").textContent = t || ""; $("msg").classList.toggle("ok", !!ok); };
  const when = ms => {
    const d = (Date.now() - ms) / 60000;
    if (d < 1) return "just now"; if (d < 60) return `${Math.floor(d)} min ago`; if (d < 1440) return `${Math.floor(d / 60)} h ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const secName = k => (S.sections.find(s => s.key === k) || {}).name || k;

  // Plain text in, safe HTML out: ``` blocks become code, blank lines split paragraphs, https links become links.
  function rich(text) {
    return String(text).split(/```/).map((part, i) => {
      if (i % 2) return `<pre class="lab-code"><code>${esc(part.replace(/^[\w+-]*\n/, "").replace(/\n$/, ""))}</code></pre>`;
      return part.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
        .map(p => `<p>${esc(p).replace(/https:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, "<br>")}</p>`).join("");
    }).join("");
  }
  // A video shows its thumbnail first; a click swaps in the player (nothing loads from YouTube until then).
  const video = (v, big) => v ? `<button type="button" class="lab-video${v.kind === "short" ? " short" : ""}${big ? " big" : ""}" data-play="${esc(v.embed)}" aria-label="Play the video">
      <img src="${esc(v.thumb)}" alt="" loading="lazy"><span class="lab-play" aria-hidden="true">▶</span></button>` : "";

  // ---------- the Daily strip ----------
  function daily() {
    const list = S.all.filter(p => p.section === "daily").slice(0, 8);
    $("daily").hidden = !list.length;
    $("dailyStrip").innerHTML = list.map(p => `<article class="lab-day">${video(p.video)}<a href="#p=${esc(p.id)}" class="lab-day-t">${esc(p.title)}</a><span class="meta">${esc(when(p.at))}</span></article>`).join("");
  }

  // ---------- the list ----------
  function tabs() {
    const all = [{ key: "all", name: "Everything" }, ...S.sections.filter(s => s.key !== "daily")];
    $("tabs").innerHTML = all.map(s => `<button type="button" role="tab" class="lab-tab${S.tab === s.key ? " on" : ""}" aria-selected="${S.tab === s.key}" data-tab="${esc(s.key)}">${esc(s.name)}${s.posts ? ` <small>${s.posts}</small>` : ""}</button>`).join("");
    const sec = S.sections.find(s => s.key === S.tab);
    $("sectionBlurb").textContent = sec ? sec.blurb : "Everything in the Lab, newest activity first.";
    $("newBtn").hidden = !S.me || (sec && sec.adminOnly && !S.admin);
  }
  function list() {
    const posts = S.posts.filter(p => p.section !== "daily" || S.tab === "daily");
    $("posts").innerHTML = posts.length ? posts.map(p => `<a class="item lab-row s-${esc(p.section)}" href="#p=${esc(p.id)}">
        <div class="top"><span class="st">${esc(secName(p.section))}</span>${p.pinned ? `<span class="st lab-pin">Pinned</span>` : ""}${p.solved ? `<span class="st lab-solved">Solved</span>` : ""}${p.video ? `<span class="st">Video</span>` : ""}
        <b class="lab-t">${esc(p.title)}</b></div>
        <div class="meta">${esc(p.by.name)} · ${esc(when(p.at))} · ${p.replies} ${p.replies === 1 ? "reply" : "replies"}</div></a>`).join("")
      : `<p class="empty">${S.q ? "Nothing matches that search." : "Nothing here yet. Be the first to post."}</p>`;
  }
  async function loadList() {
    const qs = new URLSearchParams();
    if (S.tab !== "all") qs.set("section", S.tab);
    if (S.q) qs.set("q", S.q);
    const r = await api("GET", `lab?${qs}`);
    S.sections = r.sections; S.posts = r.posts;
    if (S.tab === "all" && !S.q) S.all = r.posts; else if (!S.all) S.all = (await api("GET", "lab")).posts;
    tabs(); list(); daily();
  }

  // ---------- one post ----------
  async function openPost(id) {
    try { S.post = (await api("GET", `lab/${id}`)).post; } catch (e) { msg(e.message); location.hash = ""; return; }
    const p = S.post;
    $("postView").innerHTML = `<p><a href="#" class="lab-back">← Back to the Lab</a></p>
      <div class="top"><span class="st">${esc(secName(p.section))}</span>${p.pinned ? `<span class="st lab-pin">Pinned</span>` : ""}${p.solved ? `<span class="st lab-solved">Solved</span>` : ""}${p.removed ? `<span class="st rejected">Removed</span>` : ""}</div>
      <h2 class="lab-ptitle">${esc(p.title)}</h2>
      <p class="meta">${esc(p.by.name)} · ${esc(when(p.at))}${p.editedAt ? " · edited" : ""}</p>
      ${video(p.video, true)}
      <div class="lab-body-text">${rich(p.body)}</div>
      ${p.link ? `<p><a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.link)} ↗</a></p>` : ""}
      <div class="actions lab-acts">
        ${p.canEdit && !p.removed ? `<button type="button" class="btn ghost sm" data-act="edit">Edit</button><button type="button" class="btn ghost sm" data-act="remove">Remove</button>` : ""}
        ${p.section === "help" && p.canEdit ? `<button type="button" class="btn ghost sm" data-act="solved">${p.solved ? "Mark unsolved" : "Mark solved"}</button>` : ""}
        ${S.admin ? `<button type="button" class="btn ghost sm" data-act="pin">${p.pinned ? "Unpin" : "Pin"}</button>` : ""}
        ${S.admin && p.section === "daily" ? `<button type="button" class="btn ghost sm" data-act="archive">Move to the Library</button>` : ""}
      </div>
      <h3 class="sub">${p.replies.filter(r => !r.removed).length ? "Replies" : "No replies yet"}</h3>
      <div class="list">${p.replies.map(r => `<div class="item lab-reply${r.removed ? " gone" : ""}"><div class="meta">${esc(r.by.name)} · ${esc(when(r.at))}${r.removed ? " · removed" : ""}
        ${r.canRemove && !r.removed ? `<button type="button" class="lab-x" data-rm="${esc(r.id)}">Remove</button>` : ""}</div><div class="lab-body-text">${rich(r.body)}</div></div>`).join("")}</div>
      ${S.me && !p.removed ? `<form id="replyForm" class="lab-form"><div class="field"><label for="rBody">Your reply</label><textarea id="rBody" required minlength="2" maxlength="4000" rows="4"></textarea></div><button class="btn" type="submit">Reply</button></form>`
        : !S.me ? `<p><a class="btn ghost sm" href="login">Sign in to reply</a></p>` : ""}`;
    show("postView");
  }

  // ---------- writing ----------
  function openForm(edit) {
    S.editing = edit || null;
    const choices = S.sections.filter(s => S.admin || !s.adminOnly);
    $("fSection").innerHTML = choices.map(s => `<option value="${esc(s.key)}">${esc(s.name)}</option>`).join("");
    $("fSection").value = edit ? edit.section : (choices.some(s => s.key === S.tab) ? S.tab : choices[0].key);
    $("fSection").disabled = !!edit && !S.admin;
    $("fTitle").value = edit ? edit.title : ""; $("fBody").value = edit ? edit.body : "";
    $("fLink").value = edit ? edit.link : ""; $("fVideo").value = edit && edit.video ? edit.video.watch : "";
    $("formTitle").textContent = edit ? "Edit post" : "New post"; $("fSubmit").textContent = edit ? "Save" : "Post";
    show("formView"); $("fTitle").focus();
  }
  function show(id) { for (const v of ["listView", "postView", "formView"]) $(v).hidden = v !== id; window.scrollTo({ top: 0 }); }

  async function route() {
    msg("");
    const m = /^#p=([a-f0-9]{16})$/.exec(location.hash);
    if (m) return openPost(m[1]);
    show("listView"); await loadList();
  }

  // ---------- events ----------
  document.addEventListener("click", async e => {
    const play = e.target.closest("[data-play]");
    if (play) { play.outerHTML = `<div class="lab-video${play.classList.contains("short") ? " short" : ""}${play.classList.contains("big") ? " big" : ""}"><iframe src="${esc(play.dataset.play)}?autoplay=1&rel=0" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`; return; }
    const tab = e.target.closest("[data-tab]");
    if (tab) { S.tab = tab.dataset.tab; await loadList(); return; }
    if (e.target.closest(".lab-back")) { e.preventDefault(); location.hash = ""; return; }
    if (e.target.id === "newBtn") return openForm();
    if (e.target.id === "fCancel") return S.editing ? openPost(S.editing.id) : route();
    const act = e.target.closest("[data-act]")?.dataset.act, p = S.post;
    const rm = e.target.closest("[data-rm]")?.dataset.rm;
    if ((!act && !rm) || busy) return;
    busy = true;
    try {
      if (act === "edit") openForm(p);
      else if (act === "remove") { if (confirm("Remove this post?")) { await api("DELETE", `lab/${p.id}`); msg("Removed.", true); location.hash = ""; } }
      else if (act === "solved") { await api("PUT", `lab/${p.id}/solved`, { on: !p.solved }); await openPost(p.id); }
      else if (act === "pin") { await api("PUT", `lab/${p.id}/pin`, { on: !p.pinned }); await openPost(p.id); }
      else if (act === "archive") { await api("PATCH", `lab/${p.id}`, { section: "library" }); msg("Moved to the Library.", true); await openPost(p.id); }
      else if (rm) { await api("DELETE", `lab/${p.id}/replies/${rm}`); await openPost(p.id); }
    } catch (x) { msg(x.message); } finally { busy = false; }
  });
  $("postForm").addEventListener("submit", async e => {
    e.preventDefault(); if (busy) return; busy = true;
    const body = { title: $("fTitle").value, body: $("fBody").value, link: $("fLink").value.trim(), video: $("fVideo").value.trim() };
    try {
      const r = S.editing
        ? await api("PATCH", `lab/${S.editing.id}`, { ...body, ...(S.admin ? { section: $("fSection").value } : {}) })
        : await api("POST", "lab", { ...body, section: $("fSection").value, ...(body.link ? {} : { link: undefined }), ...(body.video ? {} : { video: undefined }) });
      msg(S.editing ? "Saved." : "Posted.", true);
      if (location.hash === `#p=${r.post.id}`) await openPost(r.post.id); else location.hash = `p=${r.post.id}`;
    } catch (x) { msg(x.message); } finally { busy = false; }
  });
  document.addEventListener("submit", async e => {
    if (e.target.id !== "replyForm") return;
    e.preventDefault(); if (busy) return; busy = true;
    try { await api("POST", `lab/${S.post.id}/replies`, { body: $("rBody").value }); await openPost(S.post.id); }
    catch (x) { msg(x.message); } finally { busy = false; }
  });
  $("searchForm").addEventListener("submit", async e => { e.preventDefault(); S.q = $("q").value.trim(); location.hash = ""; show("listView"); await loadList(); });
  window.addEventListener("hashchange", route);

  (async () => {
    const me = await session();
    S.me = me; S.admin = !!me && (me.role === "admin" || me.role === "owner");
    await route().catch(x => msg(x.message));
    follow(["lab"], type => { if (type === "lab.updated" && !$("listView").hidden) loadList().catch(() => {}); });
  })();
})();
