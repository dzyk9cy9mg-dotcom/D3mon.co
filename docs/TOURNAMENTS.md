# Automatic tournaments: the plan

Owner's direction, 2026-10-17. Owner agreed: D3MON never places trades, tournaments rank entrants, a "not financial advice" notice, and opt-in per bot.

Each build step below is its own pull request.

## What it is

Four tournaments run at the same time, all the time, by themselves:

| Tournament | Length | Rounds |
| --- | --- | --- |
| Hourly | 1 hour | 4 |
| Daily | 1 day | 96 |
| Weekly | Monday to Sunday | 672 |
| Monthly | calendar month | about 2,900 |

When one ends, the next one starts. No host is needed. The owner dropped the hosted Saturday show (2026-10-17). The battle code stays in place for now, unused, and removing it is a separate decision.

Times follow **US Eastern**, like Kalshi.

## Who plays

- **Bots and chart scripts** whose owner turns on **"Join tournaments"** on `/my`. Off by default.
- Callers can be added later.
- Turning it on counts from the next round. Turning it off keeps the rounds already played.
- Every switch is recorded in the ledger.

## How it is scored

- The same calls as battles: one call per round, during the round, scored by Kalshi.
- **Rank by most correct calls.** A missed round scores nothing, so bots that call every round do best.
- Ties: higher accuracy wins, then the earlier average call.
- Accuracy and calls made are shown next to every rank.
- Only Kalshi results count (verified). A round Kalshi never settles is left out for everyone.

## What people see

- Live standings for each tournament, updating as rounds settle.
- Each bot's calls shown live, as they are now.
- A notice on every tournament view: **"For entertainment. Not financial advice. D3MON never trades."**
- Final results are saved when a tournament ends and never rewritten. A later Kalshi correction is flagged, like battles.

## Admin controls

- Remove a bot from a tournament (recorded, with a reason).
- Pause and resume all tournaments (recorded).

## API first

- `GET /api/v1/tournaments`: the four current tournaments and their times.
- `GET /api/v1/tournaments/:id`: standings, live or final.
- `PUT /api/v1/entrants/:id/tournaments`: the owner's on/off switch.
- Live feed topic `tournament:<id>` for standings changes.
- A thin `/tournaments` page reads these. The 3D site will read the same API.

## Build steps

1. **Done:** the "Join tournaments" switch (`server/arena/tournaments.js`, `GET/PUT /api/v1/entrants/:id/tournaments`, `/my`, ledger line `tournament_entry`, `test/tournaments.test.js`).
2. Sign up without a battle. Today a bot only becomes an entrant when it's approved for a battle, so new bots need a plain "join D3MON" application. An admin still approves each new bot, to keep out spam.
3. Standings worked out from calls and Kalshi results, with the API (tests).
4. The `/tournaments` page and live feed.
5. Saved final results and the admin controls.
