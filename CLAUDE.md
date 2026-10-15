# D3MON.CO: notes for Claude

The community site for crypto callers, trading bots and chart scripts. We're building the **Arena**: the Battle of the Bots system. [ARCHITECTURE.md](ARCHITECTURE.md) is the blueprint. Read it before changing anything under `server/arena/`.

**Never put secrets in this file or anywhere in the repo:** no API keys, passwords, tokens, server addresses or account emails. Settings come from environment variables or `.env`, which is git-ignored.

## Commands

```sh
npm start        # http://127.0.0.1:3000. The first account to sign up becomes owner
npm test         # node --test; the jsdom page test needs `npm install` first
npm run users    # list accounts and roles
npm run role -- <username> admin|member|owner|ban|unban
npm run kalshi:check   # reads Kalshi's latest rounds and shows how each is scored. Records nothing
```

- Node ≥ 20 and **no runtime dependencies**. Keep it that way, and ask before adding one.
- **Deploy:**
  - The server is AWS Lightsail with the code in `/srv/d3mon`, run by the systemd unit `d3mon`.
  - **The data folder is `/var/lib/private/d3mon`**, set with `D3MON_DATA_DIR`. It's not `/srv/d3mon/data`. Always use this path in server steps.
  - `/var/lib/private` is readable by root only, so commands that look inside it need `sudo`.
  - To update:
    1. Back up: `sudo cp -a /var/lib/private/d3mon /var/lib/private/d3mon.bak-$(date +%F-%H%M)`. The time is in the name because a second backup with an existing name would be copied *inside* the first one.
    2. `cd /srv/d3mon && sudo git pull && sudo systemctl restart d3mon`
  - The role and user commands must be given the data folder, or they'd read `/srv/d3mon/data` instead: `cd /srv/d3mon && sudo D3MON_DATA_DIR=/var/lib/private/d3mon npm run users` (and the same for `npm run role -- <username> admin`).

## How the owner wants work done

- **One step at a time.** Test each component before moving on. Never claim something works without running it.
- **Deliver work as pull requests** for the owner to review and merge. Then walk them through the server update step by step.
- **API first.** Every feature is a `/api/v1` JSON endpoint plus live feed events. Pages are thin clients, because the front end will be rebuilt as an immersive 3D site. Don't put logic in `public/js/d3mon.js`.
- Bot owners share **read-only stats only**. Refuse anything that looks like a key or secret (`server/arena/validate.js`).

## Decisions made

| Decision | Why |
| --- | --- |
| Arena data is in `arena_*` collections of the existing store. `rules.js` makes them server-only: `/api/db` can't read or write them, admins included | `/api/db` is public-read by default. Privacy and validation must be enforced on the server |
| Strict allowlist schemas: unknown fields get a 400. Field names and values are scanned for credentials (PEM, `sk-`, JWT, UUID key ids, long hex or random tokens, BIP-39 seed phrases) | "Never take trading credentials" |
| Applications are never deleted. Every status change goes into `history`. Statuses are pending, approved, rejected, withdrawn, and a reopen goes back to pending | Owner wants a full application log |
| Each battle needs its own application. Approval saves an **entrant** (stable id and slug) that its owner re-selects later with `entrantId` | Owner's rule. Bots get identities instead of name-matching |
| Entrant slugs use the page's own `slug()` rules (30 characters) | So they line up with `config/battleRoster` names the current page uses |
| Public entrant fields: name, kind, creator, Discord server. The alternative account and notes are visible only to the owner and admins | Privacy by default |
| HardSmoke means any `admin` or `owner` role (`isAdmin`) | No separate host role is needed yet |
| Battles start on a quarter hour and default to 8 rounds of 15 minutes on `KXBTC15M` | They follow Kalshi's BTC 15-minute rounds |
| The live feed (`/api/v1/feed?topics=`) builds each event per reader and re-checks roles on every event. Signing out ends the stream | Privacy is enforced on the server, never just hidden in the page |
| Calls are locked by the **server clock** at round start (step 4) | The current page trusts browser timestamps, so calls can be backdated |
| The ledger arrived in step 3, not 4, as the home for metric and score lines. Each append is fsync'd before the request is answered | Round results must survive a crash. The 1 s store delay doesn't guarantee that |
| Manual metric `speedMs` is lead time before the lock (more means earlier) | One meaning for manual and automatic speed |
| Profit is recorded in any or all of three units, each optional and signed: `profitUsd` (cents), `profitPerContract` (per $1 Kalshi contract, −1 to 1, 4 places) and `profitPct` (percent return, −100 or more). Totals: dollars and per-contract add up, percent is averaged per round | Owner confirmed dollars and asked for the option to use all three |
| A metric entry's `correct` must agree with its `call` and the round result. A later result correction flags `mismatch` and doesn't rewrite entries | Mistakes stay visible. History is never rewritten |
| A Kalshi result beats a hand-entered one, and once there is one, a different result can't be entered by hand | Verified data wins |
| Calls are **sealed until the lock**: anyone can see that a call arrived and when. The direction goes only to the owner and admins until the round starts, then everyone sees it | Nobody can copy a rival's call. The owner asked for calls to be "shown live", so arrivals are live and directions are revealed at the lock. Changing it is one condition in `Calls.view` |
| Only an entrant's owner can make its keys (admins can revoke). At most 3 active keys per bot or script. Callers get none. Tokens are `d3b_<keyId>_<secret>`, shown once, and only `sha256(secret)` is stored | Whoever makes a key sees it, and rotating needs a spare |
| A call records the battles its entrant was in for that round (`battleIds`), and a board shows only those calls | Calls belong to the battle record even if the lineup changes later |
| Card readers: guests see public stats, members public and members-only, the owner also private. **Admins read like members**, so private means private. Admins can still see raw calls on the board and history | The owner's privacy choice holds for everyone |
| Verification is per stat: "verified" (all results from Kalshi), "recorded by host" (all by hand), "mixed" (with `sources` counts). Call counts and lead time are "verified" because they're server-stamped | Honest labelling while results are still entered by hand (before step 5) |
| A call is stamped with the same clock that checked its lock (`ledger.append(…, at)`) | One clock decides both, and tests can move it |
| Custom stats: up to 20 per bot, the type locked once values exist, and removing one keeps its history (defining the key again restores it). Values must match the declared type, and unchanged values are skipped | Self-reported data stays consistent and its history is never lost |
| The bot stats rate limit counts only pushes that write. Bad requests fall under the key's general limit | A developer fixing their requests isn't locked out |
| The main page's roster is fed by **one battle at a time**, chosen by HardSmoke (`onMainPage`), never automatically, and never a draft. Stream links are kept, and every write records the previous roster in the ledger | It overwrites what HardSmoke may have typed on the old page, so it must be deliberate and recoverable |
| Kalshi round = the market's `open_time`. `result` yes = up, no = down. Only `finalized`/`settled` markets with `strike_type` `greater_or_equal` are read | Checked against what Kalshi returned to the server on 2026-10-15. Anything else is skipped, not guessed |
| Kalshi writes its own score line even when HardSmoke already entered the same result | Kalshi's line is what makes the round "verified" |
| Kalshi is polled 8 s after each close, every 20 s early in a round, every 60 s otherwise, and backs off on errors. Rounds with calls or in a battle that are still unsettled 30 minutes after they end are flagged for HardSmoke | Settlement comes about 4 s after close. The manual fallback stays |
| No leaderboard. Stat cards are per entrant. Every stat starts hidden | Owner's spec |
| **Stats Hub:** cards carry **verified** stats (server-computed from the entrant's own calls, keys `v_…`, every entrant) and **self-reported** ones (the stat list and custom stats, bots and scripts only). Battles keep server/Kalshi scoring | Owner's spec, then the owner agreed verified caller stats, and bots showing claims next to results. Privacy (hidden by default) wins everywhere |
| Callers make their own calls on `/my` (Up/Down, server-locked) and their card is verified stats only | Owner never enters callers' calls by hand |
| Script and bot owners can type self-reported values on `/my` (`POST /api/v1/entrants/:id/stats`, ledger `via: "owner"`) as well as send them with the key | Chart scripts often can't send a keyed request. Owner agreed |
| Main page (`d3mon.js`) gets no new battle features: the 3D site will read `/api/v1` | Work on the old page would be thrown away. Pointing its old call buttons to `/my` is waiting on the owner's yes |
| The standard stat list lives in `arena_statcatalog`, edited by HardSmoke on `/catalog`. The seed only adds missing stats. Stats are retired, never deleted, and a type locks once values exist | Editable without code changes; history stays readable |
| Old settings for the removed computed stats (`arena_statsettings.stats`) are kept but never read. New settings are under `catalog` | A choice made for a verified stat must not publish a self-reported one |
| A list key an owner already uses as a custom stat stays theirs for that bot | Their history and type come first |

## Backlog

- [x] **Step 1:** architecture (`ARCHITECTURE.md`)
- [x] **Step 2:** registration (`/apply`), the application log (`/applications`), saved entrants, `/api/v1` and the live feed
- [x] **Step 3:** HardSmoke's manual round metrics for 10+ bots at once at `/metrics` (`PUT /api/v1/battles/:id/rounds/:round/metrics`), labelled "recorded by host", with the append-only ledger (`server/arena/ledger.js`, `data/ledger/`)
- [x] **Step 4a:**
  - bot keys (`server/arena/keys.js`), `POST /api/v1/bot/calls`
  - caller Up/Down at `/my` with the same lock, calls sealed until the lock (`server/arena/calls.js`)
  - the live board (`/board`) and scoring when a result arrives
- [x] **Step 4b:**
  - standard stats from the call history (`server/arena/stats.js`; replaced by owner-sent stats in Stats Hub phase 1)
  - per-stat visibility, label, description and order (`arena_statsettings`, all hidden by default)
  - the stats card (`GET /api/v1/entrants/:slug/card`, `/card?e=<slug>`), with settings on `/my`
- [x] **Step 4c:**
  - custom stats (`stat-settings` `custom`, `POST /api/v1/bot/stats`, "self-reported", ledger `stat` lines)
  - one battle's lineup copied to the main page's `config/battleRoster` (`server/arena/roster.js`, the battle's `onMainPage`)
- [x] **Step 5:** the Kalshi `KXBTC15M` poller and automatic scoring (`server/arena/kalshi.js`), written against the fields Kalshi returned from the Lightsail server. `GET /api/v1/rounds`, `GET /api/v1/kalshi` (admin), `npm run kalshi:check`, and a status line on `/metrics`
- [x] **Stats Hub phase 1:** the stat list (`server/arena/catalog.js`, `/catalog`, `GET/PUT /api/v1/stat-catalog`) seeded with 30 stats; verified stats for every entrant (`server/arena/verified.js`); owners type values on `/my`; `BOT-GUIDE.md` lists every key
- [ ] **Waiting on the owner:** point the old main page's call buttons to `/my`, so no call goes around the server lock
- [ ] **Stats Hub phase 2:** admin monitor of every bot × stat (latest, last updated, history), sortable and filterable, with health alerts (quiet bots, stale stats, rejected data). Admin only
- [ ] **Stats Hub phase 3:** named display slots (bots, stats, layout, order), one widget plus a `/api/v1` endpoint, and an example slot on the Battle page
- [ ] **Later:** paper profit per $1 contract at Kalshi's price at the lock. Settled markets don't carry the opening price, so it needs a snapshot of the open market at each round start
- [ ] **Flagged, not fixed:** `bots/<uid>` is writable by its member and also holds the coin transfer `xfer[id].done/ok` flags that admins set, so a member could approve their own transfer
- [ ] **Flagged, not fixed:** `test/app.e2e.test.js` fails during teardown in about 1 of 4 runs, on `main` too. A page request is still in flight after the server stops
- [ ] **Known limit:** the store saves about 1 s after a change (accounts after 0.3 s) and on SIGTERM. A crash or power loss in that window loses the last changes. A normal `systemctl restart` is safe, as tested

## Testing notes

- Tests start throwaway servers in `.test-data/` (see `test/helpers.js`). The Arena tests are in `test/arena.test.js` (step 2), `test/metrics.test.js` (step 3), `test/calls.test.js` (step 4a), `test/stats.test.js` (step 4b), `test/custom.test.js` (step 4c), `test/kalshi.test.js` (step 5, against a stand-in Kalshi server) `test/catalog.test.js` and `test/verified.test.js` (Stats Hub phase 1). `test/stats.test.js` sends the full example from `BOT-GUIDE.md`, so the guide can't drift. Test servers run with `kalshi: false`; spawned ones get `D3MON_KALSHI=off`. Call tests move the clock with `srv.app.arena.calls.now = () => ms` instead of waiting for real rounds.
- **To test a restart, restart the real process** (spawn `server/start.js`, send SIGTERM, start again on the same data folder). Two servers sharing one folder with a hand-called `saveNow()` misses the debounced accounts save, and that once made a restart look like data loss.
- When a test passes the first time, break the thing it guards and check that it fails.
- Arena pages share `d3mon.css`. Avoid class and id names it already styles (`.grid`, `#battle`, bare `.row` and `.top`), because they'll pick up the main page's layout. That happened once with `/metrics`.
