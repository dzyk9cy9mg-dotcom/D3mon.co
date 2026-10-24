# D3MON.CO handoff note (Fri Oct 23, 2026, ~5:20 PM Hawaii time)

For the next Claude: read `CLAUDE.md` first. It is the detailed source of truth for every feature, decision and
file. This note covers the latest work and where we stopped. Update or remove it once it's out of date.

## How the owner wants to work

- One step at a time; test everything before claiming it works.
- Short, plain messages; end each with one "Your next step:" line.
- Work is delivered as GitHub pull requests. When asking the owner to merge, **always** give the PR link **and**
  the full server update command, every time.
- Server update command (Lightsail browser SSH window on the "d3mon" instance); the last line should say `active`:

  ```
  sudo cp -a /var/lib/private/d3mon /var/lib/private/d3mon.bak-$(date +%F-%H%M) && cd /srv/d3mon && sudo git pull && sudo systemctl restart d3mon && systemctl is-active d3mon
  ```
- It's always D3MON, never "Demon". Copy voice: confident, polished, a little exclusive, never hype; don't name
  Kalshi in marketing copy; no "seat" wording; don't overuse "community".

## 1) Where we stopped

- Last thing done: **The Lab, step 1** (PR #96, branch `claude/lab`), which also adds this file.
- Next build step (owner agreed to a 3-step Lab plan):
  - Step 2: the Lab **knowledge map** (Obsidian-style dots and lines connecting lessons, bots, scripts, ideas).
  - Step 3: the **AI teacher's corner** (daily lessons/shorts; step 1 already has a "Daily" section for these).
- Waiting on other people (nothing to build):
  - HardSmoke: create the Halloween battle on `/applications` (Sat Oct 31, 6:00 PM Pacific, 8 rounds, keep as
    draft for now) and paste her tip page link into "HardSmoke's controls > Tip link" on `/battle`.
  - Ketonk: plugging in his bot. Then he applies to the battle, an admin approves, and the owner runs a test
    battle with HardSmoke.

## 2) Changes this session (details in CLAUDE.md)

Finished and live:
- **PR #86 Founder waitlist** (`server/arena/waitlist.js`, `public/js/waitlist.js`, `public/css/waitlist.css`,
  `test/waitlist.test.js`, privacy page). Hidden until an admin presses "Open it" on `/battle`. Another chat
  added a free list and a founding Pro list (PR #89).
- **PR #95 Subtle tip link** (`server/arena/cockpit.js` `tip`, `public/battle.html`, `public/js/battle.js`,
  `public/css/battle.css`, `test/cockpit.test.js`). One quiet grey "Tip HardSmoke" link at the end of the fine
  print under the cockpit, gold on hover, shown only once a tip link is set. Tip sites only. Money goes straight
  to her.

In PR #96 (merge to make live):
- **The Lab step 1** (`server/arena/lab.js`, `public/lab.html`, `public/js/lab.js`, `public/css/lab.css`,
  `test/lab.test.js`; small edits to `server/arena/api.js`, `server/index.js`, `server/arena/validate.js`
  (new `code` text option that keeps indentation), `public/js/sitebar.js` (Lab in the menu),
  `public/js/arena.js`). Sections: Daily (admins; the AI teacher's YouTube shorts in a sideways strip),
  Showcase, Help Desk, Library (admins), Experiments. Replies, Solved, Pin, edit/remove own posts, search,
  "Move to the Library", spam limits, secrets refused.

Closed as a duplicate: PR #87 (another chat built the same feature as #88, merged). Branches
`claude/call-methods` and `claude/waitlist` are leftovers and can be deleted.

Merged this week by other chats: #88 call method per battle, #89 waitlist Pro list, #90 Battle page Lite mode,
#91 invite links, #92 copy cleanup, #93 front page swap (new front page at `/`, original at `/classic`),
#94 calendar and notifications.

Old open PRs not touched this session: #69 "Front page pyramid: the gold look" and #63 "/next: a crystal
capstone...". Check with the owner before merging either.

Non-code work: the launch marketing plan; the "D3MON Launch Campaign" Claude doc; a countdown spreadsheet; the
owner's own "D3MON Launch Schedule" Claude doc (week-by-week checklist).

## 3) Code not in the repo

None known. Everything was pushed as branches with PRs.

## 4) Server

Already run by the owner: the update command after PR #86 and after PR #95 (both `active`).

Still to run:
- The update command after merging PR #96.
- Oct 31, battle night (prepared in another chat, from the Launch Schedule doc), to make the Battle page public
  for the night:

  ```
  sudo cp /etc/caddy/Caddyfile.battle-night /etc/caddy/Caddyfile && sudo systemctl reload caddy
  ```
  After the battle, switch back:
  ```
  sudo cp /etc/caddy/Caddyfile.bak-2026-10-22 /etc/caddy/Caddyfile && sudo systemctl reload caddy
  ```
  If server settings change before Oct 31 (e.g. Stripe), rebuild the battle-night file first.

Not done yet (owner's choice, later): Stripe with Connect; coturn (ask first); lawyer consult.

## 5) Decisions

Some of these may already be in the owner's "D3MON.CO Project Brief", which I haven't seen.

- **Halloween Sat Oct 31, 6 PM Pacific** (3 PM Hawaii): Battle of the Bots with HardSmoke, free to watch;
  the founder waitlist opens that night.
- **Grand opening Black Friday Fri Nov 27, 2026.** The waitlist gets checkout 24 hours early: Thanksgiving
  Nov 26, 6 PM Pacific.
- Core angle: **"The reasoning behind every call."** Arc: Halloween "See it", Black Friday "Own it". Tagline:
  "The only Black Friday deal that never expires."
- Countdown themes by week: Nov 1-7 the record; Nov 8-14 the Lab; Nov 15-21 the pyramid city; Nov 22-26 final
  countdown.
- **No public announcements yet.** The owner wants to keep building first.
- Founding creators to recruit: CrazyLion, Ketonk, HardSmoke (host), Cterc, Wok.
- Pricing (Oct 22): Guest free; Member $19/month; 100 founders $13/month locked for life; Pro add-on
  $15.99/month; Capstone about $19/session (founders 10% off); creator room commission 13% (10% locked for
  founding creators); referral "bring one, save half" (2 paying referrals = free; never cash).
- Tips: a subtle link to HardSmoke's own tip page (StreamElements suggested), not a big button ("not
  begging"). YouTube Super Chat and Twitch Bits stay too. An on-site Stripe tip button comes later, after a
  lawyer check.
- Lab: built before launch; Daily section for the AI teacher's shorts (some become Library lessons); later a
  knowledge map and the AI teacher's corner. The AI teacher: working first name Cyrus, last name not chosen,
  pyramid/high-tech theme, clearly labelled as AI.

## 6) Open questions and problems

- Not known yet whether the Halloween battle has been created (waiting on HardSmoke).
- Ketonk's bot isn't connected yet; no test battle has been run.
- **Check before Oct 31:** does the battle-night Caddy file let guests reach `/api/v1/waitlist` (the waitlist
  panel)? Should `/lab` and `/api/v1/lab` be public that night too? The file was prepared in another chat and
  hasn't been checked against these.
- HardSmoke still needs to choose and set up her tip page.
- The Lab's Daily strip uses YouTube thumbnails (`i.ytimg.com`). They couldn't be seen in the test environment;
  check them on the live site after deploying.
- Known flaky test (not new): `test/app.e2e.test.js` sometimes fails during teardown.

## 7) Unsure

- Whether old PRs #63 and #69 are still wanted.
- What's in the "D3MON.CO Project Brief".
- Whether the owner's partner (who works on D3MON with her own Claude) has unmerged work in progress.
