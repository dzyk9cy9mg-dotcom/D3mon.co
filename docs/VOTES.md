# Member votes: the plan

Owner's spec, 2026-10-20. Every member can vote **Up** or **Down** on the Kalshi BTC 15-minute round during live trade sessions, Battle of the Bots and Capstone sessions. Votes are paper trades: D3MON never trades and never handles money.

## What a vote is

- A vote is a **paper trade on the round**: Up buys YES, Down buys NO, priced at **Kalshi's own price the moment it arrives**, from the same price reader as bot calls (`server/arena/prices.js`).
- A member can **cash out** before the round ends. The site prices the exit at Kalshi's bid for that side at that moment (what Kalshi would pay to sell). Profit per $1 contract = exit price − entry price.
- After cashing out, the member can **enter again** in the same round, **unlimited times**. Each entry and its exit is one **trade**.
- A trade still open when the round ends settles at Kalshi's result: 1 − paid when right, −paid when wrong.
- Profit is **per $1 contract only** (cents), never dollars: the site doesn't know how much anyone bet, and it keeps big and small traders comparable.

## The log

Every action is an append-only ledger line with the server's time. Nothing is ever overwritten or deleted.

| Line | When |
| --- | --- |
| `vote` `{ uid, round, session, dir, price }` | an entry (first or re-entry) |
| `vote_exit` `{ uid, round, session, vote, price }` | a cash out |
| `vote_exit` with `switch: true`, then `vote` with `switched: true` | a switch Up ↔ Down, only where the session allows changes: a cash out and a new entry at that moment's prices, written together, so it costs what it would on Kalshi |
| `vote_session`, `vote_badge`, `vote_privacy` | admins' session settings, admin-given badges, a member's public/private choice (the latest counts) |

## Sessions and admin controls

A vote belongs to a **session**:

- `live`: the everyday trade floor, every round, always on (unless an admin turns it off)
- `battle:<id>`: a Battle of the Bots event, its rounds only
- `capstone:<id>`: a Capstone session, its time only, and **only members with Capstone access** can vote

Admins set, per session:

- **Locked or changeable:** locked means one direction per entry; changeable allows switching Up ↔ Down (each switch logged)
- **Voting on or off by member category:** members, callers, bot owners, script owners

## Shown live

- Every vote shows **live to everyone in the session**, with the member's name and direction, and the running Up/Down split
- Feed topic `votes`, so the Live page, battles and the future 3D site all read the same thing

## Badges and notifications

- **Callers, bots and scripts get the badge automatically.** Admins can give it to any member and take it away (admin-given only)
- When a badge holder enters, **on every entry including re-entries**, everyone in the session gets a special notification: "HardSmoke called UP @ 58¢"
- Capstone: admins run it, **guest callers are the main speakers** (a guest caller role for the session)

## On the voter's profile

- **Calls made, success rate, average call time** (how far into the round), **average profit per contract**
- **Private by default.** The member can make their record public. Admins read like members: private means private

## API (all under `/api/v1`)

- `POST /votes { dir }`: enter (`session` optional, the live floor by default)
- `POST /votes/exit`: cash out the open trade
- `POST /votes/change { dir }`: switch, where allowed
- `GET /votes/round?session=`: this round's votes, live split, open trades
- `GET /votes/me`, `GET /members/:name/votes`: records (respecting privacy)
- `PUT /votes/settings { public }`: the member's own privacy switch
- Admin: `PUT /votes/sessions/:session` (locked/changeable, categories on/off), `POST /votes/badges`, `DELETE /votes/badges/:name`

## Status (2026-10-20)

**Built in one go at the owner's request ("let's make large leaps")**, all on branch `claude/member-votes`: the engine and API (`server/arena/votes.js`, tested in `test/votes.test.js`), and on the Live page the vote panel (Up, Down, Cash out, Switch where allowed), the floor's split, the latest votes, badge pop-ups, the member's record with the public switch, and admin controls for the live floor (switching, categories, badges). The odds are now two laser beams colliding (teal Above, rose Below, a white-gold burst). **Batch 2 (2026-10-20):** the same panel for a running battle (front page, Battle of the Bots section) and a running Capstone session (`/vip`), from `js/votes-widget.js` + `css/votes.css` (`<div data-votes="battle|capstone">`, hidden when nothing runs); admins name a Capstone session's guest callers in that panel; an entrant's profile shows its owner's floor record when the owner made it public (`GET /votes/entrant/:slug`, "The maker on the floor").

## Build steps (one at a time, each tested before the next)

1. **The log and the trade:** enter, cash out, re-enter, switch, priced at Kalshi; settlement at the result. Tests against the stand-in Kalshi
2. **Live:** the `votes` feed topic and Up / Down / Cash out buttons on the Live page with the running split
   - **Also here (owner, 2026-10-20):** restyle the Live page's battle of light (Kalshi's Up/Down odds) as **two laser beams colliding** at the odds line, in colours that suit the site better than plain red and green
3. **Records:** profile stats, private by default, the public switch
4. **Badges and notifications**
5. **Admin controls:** locked or changeable, categories, Capstone access, guest callers
