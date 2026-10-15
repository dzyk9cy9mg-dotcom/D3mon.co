# D3mon.co

D3MON.CO is a community site for crypto callers, trading bots and chart scripts: round-by-round calls on the Kalshi and Polymarket up/down markets, the Live Trade Cortex, HardSmoke's Battle of the Bots, the Vortex, the D3M coin ledger, end-to-end encrypted direct messages, and the Cosmic AI assistant.

This repo is the standalone build of the D3MON.CO page that was published as a claude.ai artifact. The page itself (`public/index.html`, `public/css/d3mon.css`, `public/js/d3mon.js`) is the artifact's code, unchanged. On claude.ai, the host supplied sign-in, the shared database, presence and Claude. Here a small Node.js server supplies them instead, through the same `window.claude.use()` interface, so the page runs as it did.

## Run it

You need Node.js 20 or newer. The server has no npm dependencies.

```sh
npm start
```

Open http://127.0.0.1:3000 and choose **Sign in → Create account**. The first account to sign up becomes the site owner and gets the admin tools. To reserve owner for a specific username, set `D3MON_OWNER` before anyone signs up.

`npm run dev` restarts the server whenever you edit a file in `server/`.

## Settings

Set these as environment variables, or put `KEY=value` lines in a `.env` file in the project root. Real environment variables win over `.env`.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Address to listen on. Use `0.0.0.0` to accept outside connections |
| `D3MON_BASE_PATH` | (none) | The path the site lives under, such as `/d3mon` for `https://example.com/d3mon/` |
| `D3MON_DATA_DIR` | `data` | Where accounts, roles and site data are saved |
| `D3MON_OWNER` | (none) | Username that becomes owner when it signs up. Unset: the first account |
| `D3MON_SIGNUPS` | `open` | `closed` stops new sign-ups, except the owner's |
| `D3MON_SIGNUPS_PER_HOUR` | `5` | New accounts allowed per IP address per hour |
| `ANTHROPIC_API_KEY` | (none) | Turns on Cosmic, the AI assistant |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | Model Cosmic uses |
| `D3MON_SAMPLE_MAX_TOKENS` | `1024` | Longest Cosmic answer, in tokens |
| `D3MON_TRUST_PROXY` | off | Set to `1` behind a reverse proxy, so client IPs and HTTPS are read from `X-Forwarded-*` |
| `D3MON_SECURE_COOKIES` | auto | Session cookies are `Secure` on HTTPS requests. `1` forces it on, `0` off |
| `D3MON_MAX_DOC_BYTES` | 1 MiB | Largest single document |
| `D3MON_MAX_STORE_BYTES` | 512 MiB | Most data the site will store |
| `D3MON_DOTENV` | on | `off` ignores the `.env` file |

Never commit `.env` or `data/`. Both are in `.gitignore`.

## Members and roles

Everyone who signs up can post. The owner and admins also get the admin control center. Manage roles from the command line, even while the server is running (changes apply within 2 seconds):

```sh
npm run users                            # list accounts and roles
npm run role -- nova admin               # make an admin
npm run role -- nova member              # back to a regular member
npm run role -- nova owner               # hand over ownership (the old owner stays an admin)
npm run role -- spammer ban              # read-only, and can't sign in
npm run role -- spammer unban
```

Members can change their display name and password at `/account`. The ⏻ link next to their name in the header leads there.

## Battle of the Bots registration

Bots, callers and scripters apply for each battle at **`/apply`** (also linked from the Battle page as **✚ Apply to battle**). HardSmoke, or any admin, reviews them at **`/applications`**. There they create battles, open and close applications, approve, reject or reopen each application with a note, and see every application ever sent. Nothing in the log is deleted, and every status change is kept in its history.

Once approved, an entrant is saved. For a later battle its owner picks it from **Saved entrant** and sends a new application, because each battle needs its own.

**Round metrics** are the manual fallback for scoring. At **`/metrics`** (linked from `/applications`), HardSmoke picks a battle and a finished round and records the whole lineup at once: each entrant's call, right or wrong, speed and profit.
- Pick the round result and each call, and right or wrong fills in by itself.
- Speed is how many seconds before the round locked the call was made.
- Profit can be entered in dollars, per $1 contract, as a percent return, or any mix of the three, negative for a loss. Tick the **Profit columns** you use; the page remembers the choice in that browser. A unit that already has figures in the battle is always shown.
- Corrections and cleared rows are kept in the entry history.
- The battle record, totals per entrant listed in lineup order and not ranked, is public and updates live. Every figure is labelled "recorded by host".

**Calls and bot keys** (step 4a):
- **Bots and scripts:** at **`/my`**, the owner of an approved bot or script makes an API key. It's shown once, and can be revoked there. The bot sends each call with that key (`POST /api/v1/bot/calls`; `/my` shows a ready-to-copy example).
- **Callers:** callers press **Up** or **Down** at `/my`.
- **Stats cards (step 4b):**
  - Each entrant has a card at **`/card?e=<name>`**, with stats worked out by the server from its calls: hit rate, streaks, best trading times, daily record and more.
  - **Every stat starts hidden.** In the "Stats card" section of `/my`, the owner chooses Public, Members only or Private for each one, and can rename, reorder and describe them.
  - Stats say whether their results were "verified" (settled by Kalshi) or "recorded by host".
- **Custom stats (step 4c):** owners add up to 20 of their own stats on `/my`, and their bot sends the values with its key (`POST /api/v1/bot/stats`). They're always marked "self-reported", start hidden, and keep their history.
- **The lineup on the main page (step 4c):** in `/applications`, HardSmoke can tick **Show this lineup on the main page** for one battle. Its lineup then replaces the current page's Battle of the Bots roster and follows every approval live. Stream links are kept, and the old roster is kept in the history.
- **Guide for bot owners:** [BOT-GUIDE.md](BOT-GUIDE.md) is a short guide to send them: making a key and sending a test call.
- **The lock:** every call is stamped by the server and locks when its round starts.
- **The board:** at **`/board`**, anyone can watch a battle live. Calls appear sealed (who called and when, but not which way) until the round starts, then they're revealed and scored when the result comes in. Keys can only send calls: D3MON.CO never takes trading credentials or exchange keys.

Give HardSmoke's account the admin role with `npm run role -- hardsmoke admin`.

Both pages are thin clients over the Arena API (`/api/v1`) and its live feed. [ARCHITECTURE.md](ARCHITECTURE.md) has the design, data formats and endpoints for this and for the later steps (metrics entry, the bot stats API and Kalshi scoring). Arena data is server-only: `/api/db` can't read or write it, and anything that looks like a key, password or wallet phrase is refused.

## Deploying

`npm run package` builds `dist/d3mon-site.zip`, which holds only what the site needs to run. [DEPLOY.md](DEPLOY.md) walks through putting it on a server, a hosting panel, or an app platform, either on its own domain or under a path on another site.

Run a single server process. Data is held in memory and saved to `data/` about a second after each change, and again on `SIGTERM` or `SIGINT`. Back up the `data/` folder: `accounts.json`, `roles.json`, `db.json` and the `ledger/` folder. The ledger is the Arena's round history, and each entry is written to disk as soon as it's saved.

## How it fits together

```
public/
  index.html          the artifact's page markup, unchanged
  css/host.css        base styles the claude.ai host put in front of the page
  css/d3mon.css       the artifact's styles, unchanged
  css/standalone.css  the sign-in link and the account page (new)
  js/d3mon.js         the artifact's app code, unchanged
  js/runtime.js       window.claude for this server (new)
  login.html, js/account.js   sign in, sign up, account settings (new)
  apply.html, applications.html, metrics.html, my.html, board.html, card.html, js/arena*.js
                      Battle of the Bots: registration, review, round metrics, keys and calls, the live board (new)
app.cjs               startup file for hosting panels (starts server/start.js)
server/
  start.js            starts the server (npm start)
  index.js            HTTP server and API
  store.js            the shared document database
  rules.js            who may read and write what
  accounts.js         accounts, passwords (scrypt), sessions, roles
  rooms.js            presence
  sample.js           Cosmic's link to the Anthropic API
  cli.js              npm run users / npm run role
  arena/              the Arena API under /api/v1: validation and credential refusal, live feed,
                      battles, applications and saved entrants, round metrics, bot keys, calls locked
                      at round start, and the append-only ledger in data/ledger/ (ARCHITECTURE.md)
scripts/package.js    npm run package: builds the upload zip
test/                 npm test
```

What each feature the page asks for maps to:

| `claude.use(…)` | On claude.ai | Here |
| --- | --- | --- |
| `db` | The artifact's shared database | `server/store.js`: Firestore-style documents and queries with live updates over Server-Sent Events. `update` deep-merges, `set` replaces, and leases settle who creates a new document |
| `user` | Claude accounts; artifact editors are admins | Site accounts; the owner and admins from `roles.json` |
| `room` | Live presence | `server/rooms.js`: the site-wide room plus one room per stream |
| `sample` | Each viewer's own Claude account | The site's `ANTHROPIC_API_KEY`, for signed-in members only, rate-limited |

### Access rules

On claude.ai, any contributor could write any shared document. The page hid its admin tools, but nothing stopped someone with the browser console. The server now enforces what the page itself lets each person do (`server/rules.js`):

| Data | Who can write |
| --- | --- |
| Site settings, verified callers, streamer passes, round results (`config`, `verified`, `streamers`, `results`) | Admins |
| A member's own records: profile, bots and scripts, applications, requests | That member, or an admin |
| Private area: preferences, notes, DM keys (`data/users/<id>/…`) | That member only (also the only reader) |
| Direct messages (`dmx`) | The two people in the conversation (also the only readers) |
| Threads, replies, subcategories, stream chat | The author or an admin. Anyone replying can bump a thread. A thread's author can clear its replies, and a stream's host can clear its chat |
| Streams | The host or an admin |
| Reviews | The reviewer or an admin |
| Lounge chat, message boards, daily call sheets, Cortex calls | Any member |
| Arena records (`arena_*`: battles, applications, entrants) | Nobody through `/api/db`, admins included. They change only through `/api/v1`, which checks every field |

Everything else is public to read, except `arena_*`, which is read through `/api/v1` with each reader's privacy applied. Guests can read but not write.

## Tests

```sh
npm install   # only needed for the headless-browser test (jsdom)
npm test
```

There are 138 tests:

- `server.test.js` covers the API, the access rules, live updates, presence, data on disk and Cosmic (against a mock API).
- `runtime.test.js` runs `public/js/runtime.js` against a live server, using the page's own `mergeWrite` taken from `d3mon.js`.
- `app.e2e.test.js` boots the whole page in jsdom, once at the root of a domain and once under `/d3mon/`. A member signs in, creates a subcategory and a thread, and the thread appears live on the owner's page. The page saves its DM key pair to the member's private area, and the test checks that no script errors occur.
- `arena.test.js` covers the Arena API: battles, applying, review decisions and the log, re-selecting saved entrants, privacy of entrant details, refusing credentials, keeping `/api/db` out of arena data, persistence, and the live feed's per-reader permissions.
- `metrics.test.js` covers round metrics and the ledger:
  - recording 12 bots in one request
  - refusing bad rows (each error names its row)
  - corrections, clears and their history
  - result mismatches, and Kalshi's result taking precedence
  - the battle record, privacy and the live feed
  - recorded rounds surviving the server being killed with SIGKILL
- `calls.test.js` covers bot keys and calls:
  - who can make, see and revoke keys; only hashes are stored; the same answer for every bad key
  - keys and session cookies each working only on their own endpoints
  - calls going to the next round, the server-clock lock, retries and changes, and refusing bad calls
  - sealed calls, the caller buttons, which calls appear on which battle's board
  - the live reveal at the lock, live scoring, and the round timer firing at the boundary
- `stats.test.js` covers stats cards:
  - the numbers, checked by hand
  - the verified / recorded by host / mixed labels
  - every stat starting hidden, and what each kind of reader sees
  - hidden data never reaching the browser
  - owner-only settings, and their validation
  - hiding never deleting history
  - battle boards ignoring the settings
  - live refresh
- `custom.test.js` covers custom stats and the main-page lineup:
  - custom stats: defining them, checking every type, privacy and "self-reported", history, the type lock, removing, the rate limit
  - the lineup: drafts refused, stream links kept, live updates on the current page, one battle at a time
- `package.test.js` builds the upload zip, checks every file in it, then unpacks it and starts the site from `app.cjs`.

## Differences from the artifact

- **Sign-in.** The site has its own accounts instead of claude.ai accounts. The header shows **Sign in** for guests, and a ⏻ account link next to a member's name.
- **Cosmic** answers through the site's API key and model rather than each viewer's Claude account.
- **Permissions** are enforced on the server, as described above.
- **Some page text still refers to claude.ai**, because the app code is unchanged:
  - `index.html:563` "Answers use your Claude account."
  - `d3mon.js:3571` editors set from the claude.ai Share menu
  - `d3mon.js:4569` "signed in to claude.ai"
  - `d3mon.js:6038` "Open D3MON.CO inside Claude"
  - `d3mon.js:157` the offline notice
- **Voice** works as in the artifact: the in-page audio provider is a stub, and voice rooms are links to Meet, X Spaces and similar.

`artifact-original/` (git-ignored) holds the page exactly as claude.ai served it, for comparison.
