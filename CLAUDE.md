# D3MON.CO: notes for Claude

The community site for crypto callers, trading bots and chart scripts. We're building the **Arena**: the Battle of the Bots system. [ARCHITECTURE.md](ARCHITECTURE.md) is the blueprint. Read it before changing anything under `server/arena/`.

**Never put secrets in this file or anywhere in the repo:** no API keys, passwords, tokens, server addresses or account emails. Settings come from environment variables or `.env`, which is git-ignored.

## Commands

```sh
npm start        # http://127.0.0.1:3000. The first account to sign up becomes owner
npm test         # node --test; the jsdom page test needs `npm install` first
npm run users    # list accounts and roles
npm run role -- <username> admin|member|owner|ban|unban
```

- Node ≥ 20 and **no runtime dependencies**. Keep it that way, and ask before adding one.
- **Deploy:** the server is AWS Lightsail with the code in `/srv/d3mon`, run by the systemd unit `d3mon`. To update: `cd /srv/d3mon && sudo git pull && sudo systemctl restart d3mon`. Data lives in `/srv/d3mon/data/`, so back it up before each update.

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
| No leaderboard. Stat cards are per entrant. Every stat starts hidden. Standard stats are "verified", custom ones "self-reported" | Owner's spec |

## Backlog

- [x] **Step 1:** architecture (`ARCHITECTURE.md`)
- [x] **Step 2:** registration (`/apply`), the application log (`/applications`), saved entrants, `/api/v1` and the live feed
- [x] **Step 3:** HardSmoke's manual round metrics for 10+ bots at once at `/metrics` (`PUT /api/v1/battles/:id/rounds/:round/metrics`), labelled "recorded by host", with the append-only ledger (`server/arena/ledger.js`, `data/ledger/`)
- [ ] **Step 4:**
  - bot API keys (hashed, one entrant each, revocable) and `POST /api/v1/bot/calls` and `/bot/stats`
  - caller Up/Down buttons with the same lock
  - standard stats, plus custom stat definitions with visibility settings
  - stat cards
  - mirroring lineups into `config/battleRoster`
- [ ] **Step 5:** a Kalshi `KXBTC15M` poller and automatic scoring. **Verify first, from the Lightsail server**, because the build sandbox can't reach Kalshi: `curl -s "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC15M&status=settled&limit=2"`. Write the scorer against the real field names it returns
- [ ] **Flagged, not fixed:** `bots/<uid>` is writable by its member and also holds the coin transfer `xfer[id].done/ok` flags that admins set, so a member could approve their own transfer
- [ ] **Flagged, not fixed:** `test/app.e2e.test.js` fails during teardown in about 1 of 4 runs, on `main` too. A page request is still in flight after the server stops
- [ ] **Known limit:** the store saves about 1 s after a change (accounts after 0.3 s) and on SIGTERM. A crash or power loss in that window loses the last changes. A normal `systemctl restart` is safe, as tested

## Testing notes

- Tests start throwaway servers in `.test-data/` (see `test/helpers.js`). The Arena tests are in `test/arena.test.js` (step 2) and `test/metrics.test.js` (step 3).
- **To test a restart, restart the real process** (spawn `server/start.js`, send SIGTERM, start again on the same data folder). Two servers sharing one folder with a hand-called `saveNow()` misses the debounced accounts save, and that once made a restart look like data loss.
- When a test passes the first time, break the thing it guards and check that it fails.
- Arena pages share `d3mon.css`. Avoid class and id names it already styles (`.grid`, `#battle`, bare `.row` and `.top`), because they'll pick up the main page's layout. That happened once with `/metrics`.
