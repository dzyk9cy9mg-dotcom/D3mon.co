// /board: the live battle board. Rows are entrants (lineup order), columns are rounds. Calls arrive
// sealed, are revealed when the round locks, and are scored when the result comes in.
// Thin client over GET /api/v1/battles/:id/board and the battle's live feed.
(function () {
  "use strict";
  const { api, follow, esc, when, syncClock, serverNow, nextRound, mmss } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { battles: [], id: null, board: null, es: null };

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }
  const fmtTime = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  function cell(c) {
    if (!c) return `<td class="bc empty-c">–</td>`;
    const t = `${c.name}: sent ${new Date(c.receivedAt).toLocaleTimeString()}${c.via === "button" ? "" : " by bot key"}`;
    if (c.sealed) return `<td class="bc sealed" title="${esc(t)}. Sealed until the round starts.">●</td>`;
    const mark = c.correct === true ? ' <span class="ok">✓</span>' : c.correct === false ? ' <span class="no">✗</span>' : "";
    return `<td class="bc ${esc(c.direction)}" title="${esc(t)}${c.verification ? ` · ${esc(c.verification)}` : ""}">${c.direction === "up" ? "▲" : "▼"}${mark}</td>`;
  }

  function render() {
    const b = S.board;
    $("boardBox").hidden = !b;
    if (!b) return;
    $("boardTitle").textContent = `${b.title} · ${b.status}`;
    $("boardHead").innerHTML = `<tr><th>Entrant</th>${b.rounds.map(r => `<th class="${r.locked && !r.over ? "now" : ""}" title="${esc(when(r.round))}">${r.index + 1}<br><span class="tag">${esc(fmtTime(r.round))}</span></th>`).join("")}<th>Right</th><th>Wrong</th></tr>
      <tr class="resrow"><th>Result</th>${b.rounds.map(r => `<th>${r.result ? `${r.result === "up" ? "▲" : "▼"} <span class="tag">${r.verification === "verified" ? "Kalshi" : "host"}</span>` : r.over ? '<span class="tag">pending</span>' : ""}</th>`).join("")}<th></th><th></th></tr>`;
    $("boardRows").innerHTML = b.entrants.map(e => `<tr><td><b>${esc(e.name)}</b>${e.inLineup ? "" : ' <span class="tag">left</span>'}</td>${b.rounds.map(r => cell(r.calls.find(c => c.entrantId === e.entrantId))).join("")}<td>${e.right}</td><td>${e.wrong}</td></tr>`).join("")
      || `<tr><td colspan="${b.rounds.length + 3}" class="empty">Nobody is in this battle's lineup yet.</td></tr>`;
  }

  async function load() {
    if (!S.id) return;
    S.board = await api("GET", `battles/${S.id}/board`);
    render();
  }

  function pick(id) {
    S.id = id;
    try { history.replaceState(null, "", `?battle=${encodeURIComponent(id)}`); } catch (e) {}
    if (S.es) S.es.close();
    let t = null;
    S.es = follow([`battle:${id}`], () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 150); },
      on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
    return load();
  }

  $("battleSel").addEventListener("change", () => pick($("battleSel").value).catch(e => msg(e.message)));

  // The countdown to the next lock, and a reload at each round start (the board reveals calls then).
  let lastRound = null;
  setInterval(() => {
    const r = nextRound();
    $("clock").textContent = `${fmtTime(r)} · in ${mmss(r - serverNow())}`;
    if (lastRound !== null && r !== lastRound) setTimeout(() => load().catch(() => {}), 500);
    lastRound = r;
  }, 1000);

  (async () => {
    try {
      await syncClock();
      S.battles = (await api("GET", "battles")).battles.filter(b => b.status !== "draft");
      if (!S.battles.length) { $("battleSel").innerHTML = `<option value="">No battles yet</option>`; return; }
      $("battleSel").innerHTML = S.battles.map(b => `<option value="${esc(b.id)}">${esc(b.title)} · ${esc(b.status)}</option>`).join("");
      const want = new URLSearchParams(location.search).get("battle");
      const first = S.battles.find(b => b.id === want) || S.battles.find(b => b.status === "live") || S.battles[0];
      $("battleSel").value = first.id;
      await pick(first.id);
    } catch (e) { msg(e.message); }
  })();
})();
