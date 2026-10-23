// Sign in, sign up and account settings for the standalone site (served at /login and /account).
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let me = null;
  // An invite link (/login?invite=CODE#new) lets one person sign up while sign-ups are closed.
  const invite = new URLSearchParams(location.search).get("invite") || "";

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }

  async function call(path, body) {
    const res = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
    let json = {};
    try { json = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((json.error && json.error.message) || "Something went wrong. Try again.");
    return json;
  }

  function onSubmit(form, fn) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const controls = form.querySelectorAll("button, input");
      controls.forEach(el => (el.disabled = true));
      msg("");
      try { await fn(); } catch (err) { msg(err.message); } finally { controls.forEach(el => (el.disabled = false)); }
    });
  }

  function showTab(signUp) {
    $("tabIn").setAttribute("aria-selected", String(!signUp));
    $("tabUp").setAttribute("aria-selected", String(signUp));
    $("inForm").hidden = signUp;
    $("upForm").hidden = !signUp;
    msg("");
    (signUp ? $("upUser") : $("inUser")).focus();
  }

  function showMember(u) {
    me = { ...me, ...u };
    $("meAv").src = me.avatarUrl;
    $("meName").textContent = me.name;
    $("meUser").textContent = "@" + me.username;
    $("nmIn").value = me.name;
  }

  $("tabIn").addEventListener("click", () => showTab(false));
  $("tabUp").addEventListener("click", () => showTab(true));

  onSubmit($("inForm"), async () => {
    await call("api/auth/login", { username: $("inUser").value, password: $("inPass").value });
    location.href = "./";
  });
  onSubmit($("upForm"), async () => {
    await call("api/auth/register", { username: $("upUser").value, name: $("upName").value, password: $("upPass").value, ...(invite ? { invite } : {}) });
    location.href = "./";
  });
  onSubmit($("nameForm"), async () => {
    showMember((await call("api/auth/profile", { name: $("nmIn").value })).user);
    msg("Name saved.", true);
  });
  onSubmit($("passForm"), async () => {
    await call("api/auth/password", { current: $("pwCur").value, next: $("pwNew").value });
    $("passForm").reset();
    msg("Password changed. Your other devices were signed out.", true);
  });
  $("outBtn").addEventListener("click", async () => {
    try { await call("api/auth/logout"); } catch (e) {}
    location.href = "./";
  });

  fetch("api/session", { credentials: "same-origin", cache: "no-store" })
    .then(r => r.json())
    .then(async s => {
      if (s.user) {
        document.title = "Account · D3MON.CO";
        $("member").hidden = false;
        showMember(s.user);
        return;
      }
      $("guest").hidden = false;
      let invited = false;
      if (invite) {
        try { invited = (await (await fetch(`api/auth/invite?code=${encodeURIComponent(invite)}`, { credentials: "same-origin" })).json()).valid === true; } catch (e) {}
        if (invited) $("inviteNote").hidden = false;
        else msg("This invite link has been used, has expired or isn't valid. Ask for a new one.");
      }
      const canJoin = !!s.signups || invited;
      if (!canJoin) $("tabUp").hidden = true;
      showTab(canJoin && (invited || location.hash === "#new"));
    })
    .catch(() => msg("Couldn't reach the server. Refresh to try again."));
})();
