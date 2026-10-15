# D3MON.CO Arena: architecture

This is the blueprint for the Battle of the Bots system: registration, the application log, battle metrics, the bot stats API, and Kalshi scoring. It was checked against the code as it stands (commit `9cda5c6`) and describes what each build step adds.

The steps, in build order:

1. This document.
2. Registration tab and application log.
3. Battle metrics entry, the manual fallback.
4. Stats API: bot keys, automatic calls, Up/Down for callers, live scoring, stat cards.
5. Kalshi BTC 15-minute data for automatic scoring.

## 1. What exists today

| Piece | Where | What it does |
| --- | --- | --- |
| HTTP server | `server/index.js` | Node `http`, no dependencies. Serves `public/` and the `/api/*` endpoints |
| Document store | `server/store.js` | Firestore-style docs held in memory, saved to `data/db.json` about a second after each change |
| Access rules | `server/rules.js` | Who may read and write each collection. Everything outside private areas and DMs is **public to read** |
| Accounts | `server/accounts.js` | scrypt passwords, cookie sessions, and roles (`owner`, `admin`, `member`, banned) in `data/roles.json` |
| Live updates | `server/index.js` | One Server-Sent Events stream per open page (`GET /api/events`), carrying doc and query snapshots |
| Page | `public/js/d3mon.js` (7,186 lines) | The claude.ai artifact, unchanged. **All battle logic runs in the browser** |

How the page stores battle data today:

| Data | Document | Who writes |
| --- | --- | --- |
| Round calls (callers, bots, scripts) | `calls/<ASSET>-<tf>-<yyyymmdd>` → `rounds[startMs][key] = {d, s, l, a, t}` | **Any member** |
| Round results | `results/<…same id…>` → `r[startMs] = "up"/"down"` | Admins, by hand |
| Battle lineup | `config/battleRoster` → `{bots:[{name,url}], callers:[…]}` | Admins |
| Battle run | `config/bbBattle` (`first`, `rounds`, `active`) and `config/battle` (kind, face-off) | Admins |
| Round log | `config/bb-<yyyymmdd>` → `calls[startMs][botSlug]`, `res`, `kx` (Kalshi strike and final price), `tgt`, `gain` | Admins, by hand |
| Members' bots | `bots/<uid>` → `list`, `pub`, coin `xfer`, `votes`… | That member |

### Gaps the new system has to close

1. **Calls can be forged.** A call's timestamp `t` comes from the browser, and any member can write any `calls/…` document, so a call can be backdated after the round starts. Battle calls must be stamped and locked by the server.
2. **Everything is public to read.** `canRead` returns `true` for every collection except private areas and DMs. Private and members-only stats can't live in an ordinary collection.
3. **No Kalshi connection.** The `kx` field is read, but nothing writes it. Results are entered by hand.
4. **Bots are names, not identities.** A lineup entry is `{name, url}`, matched to call history by name slug. Renaming a bot rewrites history by hand (`renameBot`).
5. **Single process, whole-file saves.** `db.json` is rewritten in full after each change. That's fine for applications and battles, but not for years of call history.
6. **Unrelated finding, not part of this work:** `bots/<uid>` is writable by its member, and the coin transfer flags `xfer[id].done/ok` that admins set live in that same document. A member could mark their own transfer approved. Tell me if you want it fixed separately.

## 2. Design principles

- **API first.** Every feature is a versioned JSON API under `/api/v1/` with a typed live feed. Pages are thin clients that the 3D site can replace without any server change.
- **The server is the source of truth** for timestamps, locks, scoring, privacy and permissions. The browser never decides any of them.
- **Arena collections are server-only.** The generic `/api/db` endpoint can't read or write them, even for admins (enforced in `rules.js`). The only way in is `/api/v1`, which validates every field.
- **Allowlist validation.** Every request body is checked against a strict schema, and unknown fields are rejected. Free text is scanned for anything that looks like a credential (see §6).
- **Append, never delete.** Applications, calls, scores and metric entries are kept. Hiding a stat or withdrawing an application changes its status, never its history.
- **One process, no new dependencies.** This matches the current deploy (a single systemd unit, Node ≥ 20).

## 3. Components

```
                         ┌──────────────── server/index.js (existing) ────────────────┐
 browser / 3D site ──►   │ /api/db, /api/events …  (page runtime, unchanged)          │
                         │ /api/v1/*  ──►  server/arena/api.js  (router, auth, CSRF)  │
 bot (Bearer key) ──►    │                   │                                         │
                         │      ┌────────────┼──────────────┬──────────────┐          │
                         │  registry.js   battles.js     stats.js       kalshi.js     │
                         │  apps, entrants rounds, calls  cards, custom  poller,      │
                         │  (step 2)      metrics (3/4)   stats (4)      results (5)  │
                         │      └────────────┴──────┬───────┴──────────────┘          │
                         │                     feed.js (typed SSE topics)              │
                         │   Store (data/db.json)          Ledger (data/ledger/*.jsonl)│
                         └─────────────────────────────────────────────────────────────┘
```

| Module | Step | Job |
| --- | --- | --- |
| `server/arena/validate.js` | 2 | Schema checks, text cleanup, credential detection |
| `server/arena/feed.js` | 2 | Live topics over SSE: `GET /api/v1/feed?topics=…` |
| `server/arena/registry.js` | 2 | Battles, applications (the log), approved entrants |
| `server/arena/api.js` | 2 | `/api/v1` routing, session and bot-key auth, rate limits |
| `server/arena/metrics.js` | 3 | HardSmoke's manual round entry for many bots at once, round results, the battle record |
| `server/arena/keys.js` | 4 | Bot API keys: issue, hash, rotate, revoke |
| `server/arena/ledger.js` | 3 | Append-only history (metric and score lines from step 3, calls from step 4), one JSONL file per month |
| `server/arena/rounds.js` | 4 | Round clock, call lock, scoring |
| `server/arena/stats.js` | 4, Stats Hub | Owner-sent stat values (list and custom), visibility, the card |
| `server/arena/catalog.js` | Stats Hub 1 | The stat list HardSmoke edits on `/catalog`, value types and formats |
| `server/arena/kalshi.js` | 5 | Polls Kalshi's public market data for `KXBTC15M` and records each result |

### Storage

- **Store, `data/db.json`:** low-volume records in server-only collections. These are `arena_battles`, `arena_apps`, `arena_entrants`, `arena_keys` (hashes only), `arena_statsettings` (owners' stat settings), `arena_statcatalog` (the stat list), and `arena_rounds` (one document per battle round).
- **Ledger, `data/ledger/YYYY-MM.jsonl`:** one line per call, score or metric entry, written once and never rewritten. Each write is flushed to disk (`fsync`) before the request is answered, so unlike `db.json` it survives a crash or a killed process. A line cut off by a crash is skipped on load. It's loaded into memory at startup, which is about 50 MB a year at 10 bots calling every round. Backing up `data/` still covers everything.

## 4. Roles and authentication

| Actor | How they authenticate | Can do |
| --- | --- | --- |
| Guest | none | Read public battle data and the public stats on cards |
| Member | session cookie (existing) | Apply, see their own applications, see members-only stats |
| Entrant owner | session cookie | Manage their entrant's stat visibility, custom stat definitions and bot keys |
| HardSmoke (admin or owner role) | session cookie | Create battles, review applications, enter metrics, override a result |
| Bot | `Authorization: Bearer d3b_<keyId>_<secret>` | Push calls and its own custom stat values. **Nothing else** |
| Caller (human) | session cookie | Press Up/Down for their own approved caller entrant |

- **Cookie requests** keep the existing same-origin check (`checkSameOrigin`) on every POST.
- **Bot-key requests** carry no cookie, so cross-site request forgery doesn't apply. Each key is limited to one entrant, stored as a SHA-256 hash, shown once when it's made, rate-limited, and revocable by the owner or an admin. A bot key can't reach any human endpoint.
- **"HardSmoke"** means anyone with the `admin` or `owner` role (`npm run role -- hardsmoke admin`), using the existing `isAdmin`.

## 5. Data model

### Battle: `arena_battles/<id>`

```json
{ "id": "b_x1…", "title": "Battle of the Bots S2 · Week 3", "kind": "bots | callers | mixed",
  "market": "KXBTC15M", "startsAt": 1760925600000, "rounds": 8, "roundMs": 900000,
  "status": "draft | open | closed | live | final", "entrants": ["e_…"],
  "createdBy": "<uid>", "createdAt": 0, "updatedAt": 0 }
```

Applications are accepted only while a battle is `open`. Its `entrants` list holds the entrants approved for that battle.

### Application, the log: `arena_apps/<id>`

```json
{ "id": "a_…", "battleId": "b_…", "kind": "bot | caller | script",
  "name": "Valhalla", "creatorName": "Odin", "altAccount": "@odin_alt",
  "discordServer": "Asgard Trading", "notes": "…",
  "entrantId": "e_… | null", "applicantId": "<uid>",
  "status": "pending | approved | rejected | withdrawn",
  "submittedAt": 0, "reviewedAt": null, "reviewedBy": null, "reviewNote": "",
  "history": [ { "at": 0, "by": "<uid>", "action": "submitted | approved | rejected | withdrawn | reopened", "note": "" } ] }
```

- **One application per entrant per battle.** Applying again for the same battle while one is pending or approved is refused.
- **Re-selecting a saved entrant.** On a later battle the applicant chooses one of their approved entrants (`entrantId`). The form pre-fills and a new application is still needed for that battle.
- **Approval.** Approving creates the entrant (or updates its details from the application) and adds it to the battle.
- **Nothing is deleted.** Every status change is appended to `history`.

### Entrant, the saved approved identity: `arena_entrants/<id>`

```json
{ "id": "e_…", "kind": "bot | caller | script", "name": "Valhalla", "slug": "valhalla",
  "creatorName": "Odin", "altAccount": "@odin_alt", "discordServer": "Asgard Trading", "notes": "",
  "ownerId": "<uid>", "status": "active | suspended",
  "approvedAt": 0, "approvedBy": "<uid>", "battles": ["b_…"] }
```

The `slug` is unique, and it links to the page's existing `config/battleRoster` names (step 4 mirrors lineups there so the current page keeps working).

### Call, one ledger line

```json
{ "t": "call", "id": "…", "entrantId": "e_…", "market": "KXBTC15M",
  "round": 1760925600000, "dir": "up | down", "via": "bot-key | button", "keyId": "… (bot-key only)",
  "battleIds": ["b_…"], "at": 1760925512345, "by": "<owner uid>" }
```

- **The lock:** a call for a round is accepted only while the **server clock** is before the round's start. `at` is the server's timestamp. At the start the round locks and the call can't be changed. A call for a round that has started gets `409 round_locked`.
- **Rounds:** calls go to the next round by default. They can be made up to 24 hours ahead.
- **Repeats and changes:** an entrant's latest call before the lock counts. Earlier ones stay in the ledger. Sending the same direction again writes nothing (`unchanged: true`), so retries are safe.
- **Battles:** `battleIds` lists the battles (not drafts) whose lineup held the entrant and whose rounds included this one, at the moment of the call. A battle's board shows only those calls, so calls belong to the battle record even if the lineup changes later.
- **Sealed until the lock:** when a call arrives, everyone sees that it arrived and when (`sealed: true`). Its direction is shown only to the entrant's owner and admins until the round starts. At the lock, every call is revealed (`round.locked`), so nobody can copy a rival's call. Decided in step 4a, and changing it is one condition in `Calls.view`.
- **Scoring:** when a result arrives, each call is scored (`round.scored`). It's labelled "verified" when Kalshi settled the round, and "recorded by host" when HardSmoke did.

### Score, a ledger line written when the round settles

```json
{ "t": "score", "round": 1792045800000, "market": "KXBTC15M", "result": "up | down",
  "source": "kalshi | admin", "strike": 80847.53, "final": 80849.65, "ticker": "KXBTC15M-26OCT150245-45",
  "settledAt": 1792046704126 }
```

`strike`, `final`, `ticker` and `settledAt` come from Kalshi (step 5). A hand-entered line has `source: "admin"` and `battleId` instead.

### Metric entry, the manual fallback (step 3)

```json
{ "t": "metric", "battleId": "b_…", "round": 1760925600000, "entrantId": "e_…",
  "call": "up", "correct": true, "speedMs": 41000,
  "profitUsd": 4.2, "profitPerContract": 0.42, "profitPct": 72.41, "by": "<admin uid>", "at": 0 }
```

- **Fields:**
  - `call` is optional.
  - `correct` is required. It can be left out when `call` and the round's result are both known, because the server works it out.
  - `speedMs` is the lead time: how long before the round locked the call was made, so more means earlier. It's the same measure step 4 computes automatically.
  - Profit can be recorded in any or all of three units, each optional and negative for a loss:
    - `profitUsd`: US dollars, rounded to the cent.
    - `profitPerContract`: dollars per $1 Kalshi contract, from −1 to 1, to 4 places. For example, a contract bought at 58¢ that wins is 0.42.
    - `profitPct`: percent return on the money at risk, −100 or more, to 2 places. 72.41 means +72.41%.
  - In the battle totals, `profitUsd` and `profitPerContract` add up across rounds. `avgProfitPct` is the average over the rounds that have a percent figure. A total is `null` when no round has that unit.
- **Consistency:** an entry whose `correct` contradicts its `call` and the round's result is refused. If the result is corrected later, the entries already saved are kept as they were and flagged `mismatch` in the view.
- **Corrections:** `{"void": true}` clears an entry. Corrections and clears are new lines, and the latest line for each round and entrant counts. A re-save that changes nothing writes nothing.
- **Rounds:** only rounds of the battle that have finished can be recorded, and not for a draft battle.
- **Precedence:** a hand-entered result is a `score` line with `source: "admin"`. A Kalshi result (step 5) always takes precedence, and once there is one a different result can't be entered by hand.
- **Labels:** every manual entry is shown with `source: "host"` and `verification: "recorded by host"`.

## 6. Validation and credential rejection

Every `/api/v1` body is checked against a declared schema: type, length and enum for each field, with unknown fields refused. On top of that, every string field and every field name goes through `looksLikeSecret()`, which rejects:

- field names such as `apiKey`, `api_key`, `secret`, `privateKey`, `password`, `passphrase`, `seed`, `mnemonic`, `token`, `accessKey` or `signature`
- PEM blocks (`-----BEGIN … KEY-----`)
- well-known key prefixes: `sk-`, `sk_live_`, `rk_`, `xprv`, `AKIA`, `ghp_`, `xoxb-`, JWTs (`eyJ…`)
- 12- or 24-word seed phrases
- long, high-entropy tokens: 32 or more characters of base64, base64url or hex with Shannon entropy ≥ 3.5 bits per character, and Kalshi-style UUID key ids

A rejected request gets `400 {"error":{"code":"looks_like_secret","field":"notes"}}` and nothing is stored or logged. Bot owners only ever send read-only results.

## 7. Standard JSON formats

### Bot pushes a call: `POST /api/v1/bot/calls` (step 4)

```json
{ "schema": "d3mon.call/v1", "market": "KXBTC15M",
  "round": "2025-10-19T19:00:00Z", "direction": "up" }
```

`round` is optional and defaults to the next round. The reply includes the server timestamp and when the round locks:

```json
{ "ok": true, "unchanged": false, "call": { "id": "…", "round": "2025-10-19T19:00:00Z", "direction": "up",
  "receivedAt": "2025-10-19T18:58:31.345Z", "locksAt": "2025-10-19T19:00:00Z" } }
```

- **The key:** `Authorization: Bearer d3b_<keyId>_<secret>`. The owner makes a key at `/my`, and it's shown once. Only its SHA-256 hash is stored.
- **Limits:** up to 3 active keys per bot or script. Callers get none. Each key is limited to 30 requests at once, then 1 every 2 seconds.
- **Errors:** every bad, unknown or revoked key gets the same `401 bad_key`.
- **Scope:** keys work only on `/api/v1/bot/*`, and session cookies don't work there.
- **Testing a key:** `GET /api/v1/bot/me` returns the bot's public profile and the next round.

### Stats Hub: verified and self-reported stats

**Changed in Stats Hub phase 1.** A card carries two kinds of stat, always labelled:
- **Verified** (`server/arena/verified.js`, keys `v_…`): worked out by the server from the entrant's own server-stamped calls and the round results. Every entrant has them, and they're a caller's whole card. Labelled `verified` / `recorded by host` / `mixed` by where the results came from. Stats that need no result (calls made, lead time, participation) are `verified`.
- **Self-reported:** the stat list below plus custom stats, for bots and scripts only. Sent with the bot's key or typed in by the owner on `/my`. Labelled `self-reported`, with `via: "bot-key" | "owner"`.

Battles are unchanged: calls are stamped and locked by the server, results come from Kalshi (or HardSmoke), and the board stays server-scored. Card settings never affect them.

**Verified stats:**

| Key | Type | What it is |
| --- | --- | --- |
| `v_win_rate` | percent | Share of scored calls right, with `n` |
| `v_chance` | percent | Better than chance: 1 − P(X ≥ wins) for X ~ Binomial(n, ½). Null under 10 scored calls |
| `v_record`, `v_last_30_days`, `v_last_7_days`, `v_today` | record | Right and wrong calls, by UTC day |
| `v_form` | form | The last 20 scored calls, `"w"`/`"l"`, oldest first |
| `v_current_streak`, `v_best_win_streak`, `v_worst_loss_streak` | integer | Runs |
| `v_participation` | percent | Share of the battle rounds so far (battles whose lineup includes the entrant) that it called, with `n` rounds |
| `v_battles` | battles | `[{t: title, w, l, called, rounds}]` per battle |
| `v_up_down`, `v_hours`, `v_days` | histogram | Win rate by direction, UTC hour and weekday, with `counts` |
| `v_lead` | duration | Average time before the lock |
| `v_crowd` | percent | Win rate when going against the majority of everyone else who called that round (ties don't count), with `n` |
| `v_calls` | integer | Rounds called, scored or not |

The `v_` prefix is reserved: the stat list and custom stats can't use it, and nobody can send a `v_` value.

**The stat list (`server/arena/catalog.js`, `arena_statcatalog/<key>`).** The standard stats every bot may send. HardSmoke edits it on `/catalog` with no code change.
- Each stat: `key`, `label`, `type`, `unit`, `category`, `format`, `description`, `order`, `retired`.
- Seeded with 30 stats in six groups (Performance, Profit, Timing, Daily & records, Strategy, Risk). The seed only adds stats that are missing, so HardSmoke's edits and retirements stand across restarts and updates.
- **Types** (what a bot sends): `number`, `integer`, `percent` (0–1), `return` (signed fraction ≥ −1), `money` (dollars, kept to 4 places), `duration` (ms), `text` (≤ 500 characters), `date` (`YYYY-MM-DD`, not in the future), `record` (`{w, l, t?, profit?}`), `series` (≤ 500 `{t, v}` points), `histogram` (≤ 48 named numbers).
- **Formats** (how a page shows it), allowed per type: number `plain|signed`; integer `plain|signed|streak`; percent and return `percent`; money `money`; duration `duration`; text `short|paragraph`; date `date|since`; record `record`; series and histogram `plain|percent|money` (the scale of their numbers). The first is the default, and changing a type resets an unfitting format.
- A stat's type is locked once any bot has sent a value under its key. Nothing is deleted: `retired: true` takes a stat off cards and settings and stops bots sending it, and its values stay in the ledger. Restoring it brings back the last value and each owner's choices.
- Up to 100 stats. The full list with every key and an example is in `BOT-GUIDE.md`.

**Custom stats.** Owners of bots and scripts can still define up to 20 of their own (`PUT /api/v1/entrants/:id/stat-settings` `{ "custom": { "avg_edge": { "type": "percent", "label": "Average edge", "unit": "%", "format"?: … } } }`).
- Keys: 2–32 lowercase letters, digits or `_`, starting with a letter, and not one already in the list.
- If the list later gains a key an owner already uses, the owner's custom stat keeps it for that bot.
- The type can't change once values have been sent. `{ "remove": true }` keeps the history, and defining the key again brings it back.

**Self-reported values: `POST /api/v1/bot/stats` (bot key) or `POST /api/v1/entrants/:id/stats` (the owner, signed in; bots and scripts, not callers).** Both take the same body:

```json
{ "schema": "d3mon.stats/v1", "asOf": "2026-10-15T19:00:00Z",
  "values": [ { "key": "win_rate", "value": 0.62 }, { "key": "wins_losses", "value": { "w": 255, "l": 157 } },
              { "key": "avg_edge", "value": 0.034 } ] }
```

- Any active list stat, or one of the owner's custom stats (`not_defined` otherwise). Each value must match its stat's type. The whole body is scanned for credentials.
- Up to 50 values and 128 KB per request. `asOf` is optional and within the last 30 days.
- A value equal to the latest one is skipped (`accepted` / `unchanged`). Each new value is a ledger line `{ "t": "stat", "entrantId", "key", "value", "asOf" }`.
- Pushes that write are limited to 10 at once, then 1 every 30 seconds per entrant (both routes share it).

**Stats card: `GET /api/v1/entrants/<slug>/card`.**

```json
{ "schema": "d3mon.statcard/v2", "generatedAt": "…", "viewer": "guest | member | owner",
  "entrant": { "id": "…", "slug": "valhalla", "name": "Valhalla", "kind": "bot", "creatorName": "Odin" },
  "stats": [
    { "key": "win_rate", "label": "Win rate", "description": "…", "order": 10, "category": "Performance",
      "type": "percent", "format": "percent", "unit": "%", "value": 0.62, "asOf": "…",
      "source": "catalog", "verification": "self-reported" },
    { "key": "avg_edge", "label": "Average edge", "category": "Custom", "type": "percent", "format": "percent",
      "value": 0.034, "asOf": "…", "source": "custom", "verification": "self-reported" } ] }
```

The server drops every stat this viewer may not see **before** the response is built, so hidden data never reaches the browser. Stats with no value yet are left out too.

**Who sees what:**
- **Guests** see `public` stats. **Members** see `public` and `members`. **The owner** also sees `private`.
- **Admins** read like members, so private means private.
- **Every stat starts hidden**, list and custom alike, and hidden stats appear on no card.
- Owners set each stat's visibility, label, description and order with `GET`/`PUT /api/v1/entrants/:id/stat-settings` (`{ "stats": { "win_rate": { "visibility": "public", "label": "Accuracy" } } }`). Only what's sent changes, and an empty label or description restores the list's.
- Owners set verified stats' settings in the same `stats` map (`{ "stats": { "v_win_rate": { "visibility": "public" } } }`).
- Settings are kept in `arena_statsettings/<entrantId>` under `verified`, `catalog` and `custom`. The older `stats` field (choices for the old computed stats) is kept but never read, so a choice made for a computed stat can't publish a self-reported one.
- Callers have verified stats only: no list stats, no custom stats, nothing typed in.

There is no leaderboard endpoint. Cards are per entrant only.

## 8. Live feed

`GET /api/v1/feed?topics=battle:b_1,entrant:e_2` is a Server-Sent Events stream. Each event has a type and a JSON body:

| Event | Topic | Sent when |
| --- | --- | --- |
| `battle.updated` | `battle:<id>`, `battles` | A battle is created or its status changes |
| `application.created` / `application.updated` | `admin:applications` (admins only); `me:applications` (the applicant's own) | Someone applies, or a review decision is made |
| `entrant.updated` | `entrant:<id>` | Details or lineup change |
| `call.received` | `battle:<id>`, `entrant:<id>` | A call arrives before the lock. Sealed: the direction goes only to the owner and admins |
| `round.locked` | `battle:<id>`, `entrant:<id>` | A round starts. Reveals every call for it |
| `round.scored` | `battle:<id>`, `entrant:<id>` | A result arrives, with each call scored |
| `round.metrics` | `battle:<id>`, `entrant:<id>` | HardSmoke saves a round by hand (step 3). Carries that round as each reader may see it |
| `stats.updated` | `entrant:<id>` | A card changed. Clients refetch the card, so privacy filtering stays on the server |
| `catalog.updated` | `catalog` (anyone) | HardSmoke changed the stat list. Carries the changed `keys` |

Topic permissions are checked when the stream opens. The feed is separate from the page's `/api/events`, which stays unchanged.

## 9. API surface

Step 2:

```
GET   /api/v1/battles                          list (drafts are admin-only)
POST  /api/v1/battles                          admin: create
PATCH /api/v1/battles/:id                      admin: title, startsAt, rounds, status
GET   /api/v1/battles/:id                      one battle and its approved lineup
POST  /api/v1/battles/:id/applications         member: apply (new, or entrantId to re-select)
GET   /api/v1/applications?battleId&status     admin: the full log. Members: their own
POST  /api/v1/applications/:id/withdraw        applicant, while pending
POST  /api/v1/applications/:id/review          admin: {decision: approve|reject|reopen, note}
GET   /api/v1/entrants?mine=1                  approved entrants (public fields). mine=1 shows yours
GET   /api/v1/entrants/:id
GET   /api/v1/feed?topics=…                    live feed
```

Step 3:

```
PUT   /api/v1/battles/:id/rounds/:round/metrics   admin: {result?, entries: [{entrantId, call?, correct?, speedMs?,
                                                  profitUsd?, profitPerContract?, profitPct?, void?}]}
                                                  up to 50 entrants in one request; :round is the round's start in ms
GET   /api/v1/battles/:id/metrics                 the battle record: every round (result, entries) and totals per
                                                  entrant in lineup order (not ranked). ?history=1 (admin) adds every
                                                  ledger line, with who entered it
```

The page is `/metrics`.


Step 4a:

```
GET    /api/v1/clock                          server time, current and next round (pages count down by it)
GET    /api/v1/entrants/:id/keys              owner, admin: keys (previews only)
POST   /api/v1/entrants/:id/keys              owner of a bot or script: {label?} → {key, token} (token shown once)
DELETE /api/v1/entrants/:id/keys/:keyId       owner, admin: revoke
GET    /api/v1/bot/me                         bot key: this bot's public profile and the next round
POST   /api/v1/bot/calls                      bot key: d3mon.call/v1
POST   /api/v1/entrants/:id/call              caller (session): {direction, round?}, with the same lock
GET    /api/v1/entrants/:id/calls             call history, latest per round (sealed for others until the lock)
GET    /api/v1/battles/:id/board              the live board: each round's calls, result and scoring
```

The pages are `/my` (owners: keys and the caller buttons) and `/board` (public).

Step 4b:

```
GET  /api/v1/entrants/:id/stat-settings   owner: every stat with its value and settings, hidden ones included
PUT  /api/v1/entrants/:id/stat-settings   owner: {stats: {<key>: {visibility?, label?, description?, order?}}}
GET  /api/v1/entrants/:idOrSlug/card      anyone: d3mon.statcard/v1, only what this reader may see
```

The pages are the "Stats card" section of `/my` and the public `/card?e=<slug>`. `stats.updated` on `entrant:<id>` tells a card to refetch, after a settings change, a new locked call or a result.
Step 4c:

```
PUT   /api/v1/entrants/:id/stat-settings   owner: also {custom: {<key>: {type, label, unit?, description?, visibility?, order?, remove?}}}
POST  /api/v1/bot/stats                    bot key: d3mon.stats/v1 values for the owner's custom stats (up to 128 KB)
PATCH /api/v1/battles/:id                  admin: also {onMainPage: true|false}
```

**The lineup on the current main page.** The page (`public/js/d3mon.js`) reads its Battle of the Bots roster from `config/battleRoster`.
- HardSmoke switches one battle at a time onto the main page (`onMainPage`, never a draft). Turning it on for one battle turns it off for the others.
- From then on, every lineup change for that battle is copied there (`server/arena/roster.js`): bots and scripts go into `bots`, callers into `callers`. Stream links already on the roster are kept for names that stay.
- The page updates live through its own feed.
- Every write records the previous roster in the ledger (`{ "t": "roster", battleId, bots, callers, previous }`).
- Turning it off leaves the roster as it was last written.
Step 5:

```
GET /api/v1/rounds?market=KXBTC15M&from=&to=   public: each round's result, source and verification; Kalshi's ticker,
                                               target and final price; rounds Kalshi hasn't settled after 30 min
                                               (missingKalshi). from/to are ISO times or ms; last 24 h by default, 7 days at most
GET /api/v1/kalshi                             admin: the poller's health (last check, errors) and the rounds to enter by hand
npm run kalshi:check                           on the server: reads Kalshi's latest rounds and shows how each is scored. Records nothing
```

Stats Hub phase 1:

```
GET  /api/v1/stat-catalog    anyone: d3mon.statcatalog/v1, the active stats with types and formats. Admins also see
                             retired stats and which types are locked
POST /api/v1/entrants/:id/stats   owner (bot or script): d3mon.stats/v1 values typed in on /my
PUT  /api/v1/stat-catalog    admin: {stats: {<key>: {label?, type?, unit?, category?, format?, description?, order?, retired?}}}
                             creates or changes stats; a new one needs label, type and category
```

The page is `/catalog` (admins). Cards and `/my` follow `catalog.updated`.

## 10. Kalshi (step 5)

- **Docs:** Kalshi's [market data quick start](https://docs.kalshi.com/getting_started/quick_start_market_data) says market data endpoints need no authentication. The base URL is `https://api.elections.kalshi.com/trade-api/v2`.
- **Series:** `KXBTC15M` is "BTC price up in next 15 mins?". It resolves on the 60-second average of the CF Benchmarks BRTI before close against the one before open, and the ticker suffix is the close time.
- **Verified from the Lightsail server on 2026-10-15** (the build sandbox can't reach Kalshi). `GET /markets?series_ticker=KXBTC15M&status=settled` returns the newest markets first, with a `cursor` for older pages. A settled market looks like this (the fields the scorer reads):

  ```json
  { "ticker": "KXBTC15M-26OCT150245-45", "status": "finalized", "result": "yes",
    "open_time": "2026-10-15T06:30:00Z", "close_time": "2026-10-15T06:45:00Z",
    "settlement_ts": "2026-10-15T06:45:04.126246Z", "strike_type": "greater_or_equal",
    "floor_strike": 80847.53, "expiration_value": "80849.65", "yes_sub_title": "Target Price: $80,847.53" }
  ```

  A round that has just closed shows `"status": "closed"` and no result until Kalshi settles it, about 4 seconds later.
- **How it's read** (`server/arena/kalshi.js`, `parseMarket`):
  - The round is `open_time`, because rounds are named by their start. The market must last exactly 15 minutes and open on a quarter hour.
  - `result` `"yes"` (BTC finished at or above `floor_strike`) is **up**; `"no"` is **down**. Only `strike_type: "greater_or_equal"` is accepted, and only `finalized` or `settled` markets.
  - `floor_strike` is recorded as `strike`, `expiration_value` as `final`. Kalshi's `result` is what counts. If the prices ever disagree with it, it's still recorded and the server logs a warning.
  - Anything else is skipped with a reason, which `npm run kalshi:check` prints.
- **Recording:** each settled round becomes one `score` line with `source: "kalshi"`, written oldest first and fsync'd. A round already recorded from Kalshi with the same result is never written again. A hand-entered result for the same round doesn't stop Kalshi's line, because Kalshi's is what makes it "verified". From there the existing modules do the rest: Kalshi beats a hand-entered result, calls are scored live (`round.scored`), and stats count the round as verified.
- **Polling:** 2 s after start, then 8 s after each round closes, every 20 s in the first three minutes of a round and every 60 s otherwise. Errors back off from 30 s up to 10 minutes; the first error and every tenth are logged. Each poll reads one page of 20 (five hours), and older pages of 200 only while a round with calls, or in a battle, is still unscored, going back at most 7 days.
- **Missing results:** a round with calls or in a battle that Kalshi hasn't settled 30 minutes after it ended is flagged (`missingKalshi` in `/rounds`, and listed on `/metrics`) for HardSmoke to enter by hand, the step 3 fallback.
- **Turning it off:** `D3MON_KALSHI=off`. Tests run with it off and use a stand-in Kalshi server.
- **Not yet:** paper profit per $1 contract at Kalshi's price at the lock. It needs the price at each round's start, which the settled markets don't carry.
