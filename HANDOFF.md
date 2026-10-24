# D3MON.CO handoff note (Sat Oct 24, 2026, ~4 AM Hawaii time)

For the next Claude: read `CLAUDE.md` first. It is the detailed source of truth for every feature, decision and
file. This note covers the latest work and where we stopped. Update it when you stop.

## How the owner wants to work

- One step at a time; test everything before claiming it works.
- Short, plain messages; end each with one "Your next step:" line. The owner is trying to save usage: lean
  answers, few pictures, and a fresh chat when one gets long.
- Work is delivered as GitHub pull requests. When asking the owner to merge, **always** give the PR link **and**
  the full server update command, every time.
- Server update command (Lightsail browser SSH window, >_ on the "d3mon" instance at
  https://lightsail.aws.amazon.com/ls/webapp/home/instances); the last line should say `active`:

  ```
  sudo cp -a /var/lib/private/d3mon /var/lib/private/d3mon.bak-$(date +%F-%H%M) && cd /srv/d3mon && sudo git pull && sudo systemctl restart d3mon && systemctl is-active d3mon
  ```
  Git commands as the normal user fail with "dubious ownership"; use `sudo git -C /srv/d3mon …`.
- It's always **D3MON**, never "Demon". Always **"Kain and Abel"**, Kain first, everywhere. Copy voice: confident,
  polished, a little exclusive, never hype; don't name Kalshi in marketing copy; no "seat" wording.

## 1) Where we stopped

Everything below is merged and live (PRs #97–#113). Nothing is waiting to merge from this chat.

- **Kain and Abel** have their own page and menu tab (`/brothers`, "Kain & Abel"), call live as soon as a bot
  calls (never naming the bot), three uploadable intro videos (Kain, both, Abel), and an admin-only panel at the
  bottom to switch them off or leave bots out ("Admin: which bots they borrow from").
- **Paid bots are protected:** every bot's call is sealed until the round ends, with crowd totals shown once 3
  have called. Exceptions: Battle of the Bots rounds are live; Capstone shows featured calls live; Kain and Abel
  call live. Only callers give a "why".
- **Showdowns** are complete through step 2: call-outs between members or against Kain and Abel, time rules
  (any time by default), the time each call was made, the Showdown bar on every page, "Showdowns on now" on
  `/live`, spectator picks, start/result posts in the main chat and the Discord `#stream`, and Kain and Abel
  commentating member Showdowns.
- **Halloween dry run done** (a full battle night on a test server): everything worked; one bug fixed (admin
  menu too wide on laptop screens, #113). Two notes for the owner, left as is: the waitlist card covers the
  Stream wall and Lite mode buttons on a laptop until closed with ×; prices are blank on test servers only.

Next ideas (owner hasn't chosen): the Lab knowledge map, then the AI teacher's corner; smaller waitlist card on
`/battle` if the owner wants.

## 2) Battle of the Bots night, Sat Oct 31 (6 PM Pacific = 3 PM Hawaii)

- Waiting on HardSmoke: create the battle on `/applications`, set her tip link in "HardSmoke's controls", upload
  the three Kain & Abel videos on `/brothers`. Waiting on Ketonk to connect his bot (then a test battle).
- Before 6 PM Pacific the owner makes the night public (the battle-night Caddy file lets guests reach `/battle`,
  `/brothers`, `/live` and all of `/api/v1/*`, so the waitlist works; `/lab` is not included):
  ```
  sudo cp /etc/caddy/Caddyfile.battle-night /etc/caddy/Caddyfile && sudo systemctl reload caddy
  ```
  After the battle, switch back:
  ```
  sudo cp /etc/caddy/Caddyfile.bak-2026-10-22 /etc/caddy/Caddyfile && sudo systemctl reload caddy
  ```
  A scheduled reminder fires at 5:30 PM Hawaii on Oct 31 to switch it back. Open the waitlist on `/battle`
  (admin bar, "Open it") that night.

## 3) Decisions this session (details in CLAUDE.md)

- Bot calls sealed until the round ends; battles, Capstone and Kain and Abel are the exceptions (above).
- Admins always see verified results on the monitor.
- Showdowns: the challenger picks the time rule; any time is the default; spectator picks are final and close
  when round 1 ends; Kain and Abel never use a bot's call in a Showdown (they make their own read).
- Pricing idea discussed with the owner: the site free for users, creators (callers, bot owners, scripters)
  pay. A text with income projections was written for Smoke. Nothing charges yet.

## 4) Open questions

- Old open PRs #63 and #69 (front page pyramid looks): ask the owner before merging or closing.
- Ketonk's bot isn't connected yet; no real test battle has been run.
- Known flaky test (not new): `test/app.e2e.test.js` sometimes fails during teardown.
