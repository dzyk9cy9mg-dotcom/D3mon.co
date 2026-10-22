// D3MON's own voice and video room (owner, 2026-10-21), a thin client over /api/v1/voice/<room>. Every browser in
// the room connects straight to every other (WebRTC); D3MON only introduces them over the live feed. Mount with
// <section data-voice="capstone"></section>. Microphone on joining, camera when you choose; mute, camera, leave;
// a ring lights round whoever is speaking. Admins can remove someone.
(function () {
  "use strict";
  const A = window.Arena;
  if (!A || !window.RTCPeerConnection) return;
  const { api, esc } = A;

  function mount(box) {
    const room = box.dataset.voice;
    const S = { me: null, peers: new Map(), list: [], cap: 6, local: null, cam: null, muted: false, es: null, beat: null, admin: false, ice: [], audio: null, meters: new Map() };
    box.classList.add("vc");
    box.innerHTML = `<div class="vc-head"><h2>Voice room</h2><span class="vc-count" aria-live="polite"></span></div>
      <p class="vc-lede">Talk live with the others in the room, with your camera if you like. Your voice goes straight to them, never through D3MON.</p>
      <div class="vc-tiles" role="list"></div>
      <div class="vc-acts">
        <button class="s-amber vc-join" type="button">Join with microphone</button>
        <button class="btn ghost vc-joincam" type="button">Join with camera</button>
        <button class="btn ghost vc-mute" type="button" hidden aria-pressed="false">Mute</button>
        <button class="btn ghost vc-cam" type="button" hidden aria-pressed="false">Camera on</button>
        <button class="btn ghost vc-leave" type="button" hidden>Leave</button>
      </div>
      <p class="vc-err" role="alert"></p>`;
    const $ = s => box.querySelector(s), err = t => { $(".vc-err").textContent = t || ""; };

    // ---------- the room's people as tiles: you first, then everyone else
    function tile(peer, name, me) {
      let el = $(`.vc-tile[data-peer="${peer}"]`);
      if (!el) {
        el = document.createElement("div"); el.className = "vc-tile"; el.dataset.peer = peer; el.setAttribute("role", "listitem");
        el.innerHTML = `<video playsinline autoplay></video><span class="vc-av" aria-hidden="true"></span><span class="vc-name"></span>`;
        $(".vc-tiles").appendChild(el);
      }
      // your own tile never plays your own voice back, and has no remove button (a tile can be made before you're known)
      el.querySelector("video").muted = me;
      const kick = el.querySelector(".vc-kick");
      if (S.admin && !me && !kick) el.insertAdjacentHTML("beforeend", `<button class="vc-kick" type="button" title="Remove ${esc(name)} from the room" aria-label="Remove ${esc(name)} from the room">✕</button>`);
      else if (me && kick) kick.remove();
      el.querySelector(".vc-name").textContent = me ? `${name} (you)` : name;
      el.querySelector(".vc-av").textContent = (name || "?").trim().charAt(0).toUpperCase();
      return el;
    }
    function render() {
      const inRoom = !!S.me;
      $(".vc-count").textContent = `${S.list.length} of ${S.cap} here`;
      $(".vc-join").hidden = $(".vc-joincam").hidden = inRoom;
      $(".vc-join").disabled = $(".vc-joincam").disabled = S.list.length >= S.cap;
      $(".vc-mute").hidden = $(".vc-cam").hidden = $(".vc-leave").hidden = !inRoom;
      $(".vc-mute").textContent = S.muted ? "Unmute" : "Mute"; $(".vc-mute").setAttribute("aria-pressed", String(S.muted));
      $(".vc-cam").textContent = S.cam ? "Camera off" : "Camera on"; $(".vc-cam").setAttribute("aria-pressed", String(!!S.cam));
      const keep = new Set();
      for (const p of S.list) {
        if (!inRoom && p.peer) { /* not in: show who's talking, without media */ }
        const me = p.peer === S.me, el = tile(p.peer, p.name, me);
        el.classList.toggle("muted", me ? S.muted : !!p.muted);
        el.classList.toggle("has-video", me ? !!S.cam : !!(S.peers.get(p.peer)?.video));
        keep.add(p.peer);
      }
      for (const el of box.querySelectorAll(".vc-tile")) if (!keep.has(el.dataset.peer)) el.remove();
      if (!S.list.length) $(".vc-tiles").innerHTML = `<p class="vc-empty">Nobody's talking yet. Be the first in.</p>`;
      else $(".vc-empty")?.remove();
    }

    // ---------- who's speaking: a ring lights while their sound is loud enough (yours measured here, theirs from
    // the level the connection reports)
    function meter(peer, stream) {
      if (!stream.getAudioTracks().length) return;
      try {
        S.audio = S.audio || new AudioContext();
        const an = S.audio.createAnalyser(); an.fftSize = 512;
        S.audio.createMediaStreamSource(stream).connect(an);
        S.meters.set(peer, { an, buf: new Uint8Array(an.fftSize) });
      } catch (e) { /* no meter, no ring */ }
    }
    (function loop() {
      for (const [peer, m] of S.meters) {
        m.an.getByteTimeDomainData(m.buf);
        let sum = 0; for (const v of m.buf) sum += (v - 128) ** 2;
        $(`.vc-tile[data-peer="${peer}"]`)?.classList.toggle("speaking", Math.sqrt(sum / m.buf.length) > 6);
      }
      // everyone else: the level their browser reports with the sound it receives
      for (const [peer, c] of S.peers) {
        let level = 0;
        for (const r of c.pc.getReceivers()) if (r.track?.kind === "audio") for (const x of r.getSynchronizationSources?.() || []) level = Math.max(level, x.audioLevel || 0);
        $(`.vc-tile[data-peer="${peer}"]`)?.classList.toggle("speaking", level > 0.03);
      }
      requestAnimationFrame(loop);
    })();

    // ---------- the connections: one to each other person ("perfect negotiation", so both sides may start)
    const send = (to, body) => api("POST", `voice/${room}/signal`, { peer: S.me, to, ...body }).catch(() => {});
    function connect(peer) {
      if (S.peers.has(peer) || peer === S.me) return S.peers.get(peer);
      const pc = new RTCPeerConnection({ iceServers: S.ice });
      const c = { pc, polite: S.me > peer, makingOffer: false, ignoreOffer: false, video: false };
      S.peers.set(peer, c);
      for (const t of S.local.getTracks()) pc.addTrack(t, S.local);
      if (S.cam) c.camSender = pc.addTrack(S.cam.getVideoTracks()[0], S.cam);
      pc.onnegotiationneeded = async () => {
        try { c.makingOffer = true; await pc.setLocalDescription(); send(peer, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }); }
        catch (e) { /* the next negotiation tries again */ } finally { c.makingOffer = false; }
      };
      pc.onicecandidate = ({ candidate }) => send(peer, { candidate: candidate ? candidate.toJSON() : null });
      pc.ontrack = ({ track, streams }) => {
        const el = $(`.vc-tile[data-peer="${peer}"]`); if (!el) return;
        const v = el.querySelector("video"), stream = streams[0] || new MediaStream([track]);
        if (track.kind === "audio") { if (!v.srcObject) v.srcObject = stream; }
        else {
          v.srcObject = stream; c.video = true; el.classList.add("has-video");
          const off = () => { c.video = false; el.classList.remove("has-video"); };
          track.onmute = off; track.onended = off; track.onunmute = () => { c.video = true; el.classList.add("has-video"); };
        }
        v.play?.().catch(() => {});
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") pc.restartIce(); };
      return c;
    }
    async function onSignal(d) {
      if (!S.me || d.to !== S.me) return;
      const c = connect(d.from); if (!c) return;
      const pc = c.pc;
      try {
        if (d.description) {
          const collision = d.description.type === "offer" && (c.makingOffer || pc.signalingState !== "stable");
          c.ignoreOffer = !c.polite && collision;
          if (c.ignoreOffer) return;
          await pc.setRemoteDescription(d.description);
          if (d.description.type === "offer") { await pc.setLocalDescription(); send(d.from, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }); }
        } else if (d.candidate !== undefined) {
          try { await pc.addIceCandidate(d.candidate || undefined); } catch (e) { if (!c.ignoreOffer) throw e; }
        }
      } catch (e) { /* a broken exchange recovers on the next negotiation */ }
    }
    function drop(peer) {
      const c = S.peers.get(peer); if (!c) return;
      c.pc.close(); S.peers.delete(peer); S.meters.delete(peer);
    }
    function onPeers(d) {
      S.list = d.peers; S.cap = d.cap;
      if (S.me && !d.peers.some(p => p.peer === S.me)) { leave(true); err("You were taken out of the room."); return; }
      if (S.me) {
        const here = new Set(d.peers.map(p => p.peer));
        for (const peer of [...S.peers.keys()]) if (!here.has(peer)) drop(peer);
        render();
        for (const p of d.peers) if (p.peer !== S.me) connect(p.peer);
      } else render();
    }

    // ---------- joining and leaving
    async function join(withCam) {
      err("");
      try {
        S.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (withCam) S.cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } });
      } catch (e) { stopMedia(); err("D3MON couldn't use your microphone or camera. Allow it in your browser and try again."); return; }
      try {
        const j = await api("POST", `voice/${room}/join`, { video: !!S.cam });
        S.me = j.peer; S.ice = j.iceServers || []; S.list = j.peers; S.cap = j.cap; S.muted = false;
        try { S.audio = S.audio || new AudioContext(); S.audio.resume(); } catch (e) { /* no speaking rings */ }
        render();
        const mine = tile(S.me, j.peers.find(p => p.peer === S.me)?.name || "You", true);
        mine.querySelector("video").srcObject = S.cam || S.local;
        meter(S.me, S.local);
        for (const p of j.peers) if (p.peer !== S.me) connect(p.peer);
        S.beat = setInterval(() => api("POST", `voice/${room}/beat`, { peer: S.me, muted: S.muted, video: !!S.cam }).catch(() => {}), j.beatMs || 10000);
      } catch (e) { stopMedia(); err(e.message); }
    }
    function stopMedia() { for (const s of [S.local, S.cam]) s?.getTracks().forEach(t => t.stop()); S.local = S.cam = null; }
    function leave(quiet) {
      if (!S.me) return;
      const me = S.me; S.me = null;
      clearInterval(S.beat);
      for (const peer of [...S.peers.keys()]) drop(peer);
      S.meters.clear(); stopMedia();
      if (!quiet) fetch(`api/v1/voice/${room}/leave`, { method: "POST", credentials: "same-origin", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ peer: me }) }).catch(() => {});
      S.list = S.list.filter(p => p.peer !== me);
      render();
    }
    async function toggleCam() {
      if (S.cam) {
        S.cam.getTracks().forEach(t => t.stop()); S.cam = null;
        for (const c of S.peers.values()) if (c.camSender) { c.pc.removeTrack(c.camSender); c.camSender = null; }
        $(`.vc-tile[data-peer="${S.me}"] video`).srcObject = S.local;
      } else {
        try { S.cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } }); }
        catch (e) { err("D3MON couldn't use your camera."); return; }
        for (const c of S.peers.values()) c.camSender = c.pc.addTrack(S.cam.getVideoTracks()[0], S.cam);
        $(`.vc-tile[data-peer="${S.me}"] video`).srcObject = S.cam;
      }
      render();
      api("POST", `voice/${room}/beat`, { peer: S.me, video: !!S.cam }).catch(() => {});
    }

    $(".vc-join").onclick = () => join(false);
    $(".vc-joincam").onclick = () => join(true);
    $(".vc-leave").onclick = () => leave(false);
    $(".vc-cam").onclick = toggleCam;
    $(".vc-mute").onclick = () => {
      S.muted = !S.muted;
      for (const t of S.local?.getAudioTracks() || []) t.enabled = !S.muted;
      render();
      api("POST", `voice/${room}/beat`, { peer: S.me, muted: S.muted }).catch(() => {});
    };
    box.addEventListener("click", e => {
      const k = e.target.closest(".vc-kick"); if (!k) return;
      api("POST", `voice/${room}/kick`, { peer: k.closest(".vc-tile").dataset.peer }).catch(x => err(x.message));
    });
    addEventListener("pagehide", () => leave(false));

    // the room's feed: who's in, and the connection messages meant for this browser
    (async () => {
      const [v, me] = await Promise.all([api("GET", `voice/${room}`).catch(() => null), A.session()]);
      if (!v || !v.peers) { box.hidden = true; return; } // no access: the room stays out of sight
      S.admin = !!me && (me.role === "admin" || me.role === "owner");
      S.list = v.peers; S.cap = v.cap; render(); box.hidden = false;
      const es = new EventSource(`api/v1/feed?topics=voice:${room}`);
      es.addEventListener("voice.peers", e => { try { onPeers(JSON.parse(e.data).data); } catch (x) {} });
      es.addEventListener("voice.signal", e => { try { onSignal(JSON.parse(e.data).data); } catch (x) {} });
      es.addEventListener("voice.kicked", e => { try { if (JSON.parse(e.data).data.peer === S.me) { leave(true); err("You were taken out of the room."); } } catch (x) {} });
      S.es = es;
    })();
  }

  const go = () => document.querySelectorAll("[data-voice]").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
