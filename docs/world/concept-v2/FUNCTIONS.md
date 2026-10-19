# The new look: what each part must do (2026-10-19)

A working-site check of the v3 stills against what `/api/v1` and today's `/world` already do. The stills are pictures, so this lists what the real pages need before any of it is built.

## Every part of the stills, and where its data comes from

| Part | Does | Data | Status |
| --- | --- | --- | --- |
| D3MON mark | Opens the map of the places (as today's `/world` logo) | none | Built |
| Menu (World, Grand Hall, Tournaments, VIP, Build a bot) | Glides to a place, or opens a page | none | Built as the Menu panel; on phones one Menu button (44 px) |
| Join D3MON | Starts joining: `apply` | `POST /applications` | Built |
| LIVE · round 12:30–12:45 | The open round and its times | `GET /clock`, `GET /rounds` | Built |
| Round closes in | Counts down to the calls close, not the round end, when a battle closes calls early | `GET /bot/me` has `callsCloseAt`; the page has the round end | Built (the round end) |
| Calls sealed / calls this round | How many calls this round, callers' directions sealed | `GET /rounds/:round/calls` | Built |
| 62% "the crowd says up" | Kalshi's price for Up | `GET /market` | Built. **Rename to "Kalshi: 62% up"**: "crowd" is for the planned crowd vote |
| Leader today | Daily tournament's leader | `GET /tournaments/:id` | Built. **Needs the "not financial advice" notice** wherever standings show |
| Enter the Grand Hall | Glides down to the hall | none | Built (the scroll) |
| Skip the intro → | Jumps straight to the hall and remembers it next time | `localStorage` | Today's skip link exists; remembering it is new |
| Bots / Chart scripts / Callers tags | Leader by kind; callers' count this round | `GET /tournaments/:id`, `GET /rounds/:round/calls` | Built; the split by kind is done in the page |
| Hall: Kalshi screen | Up and Down prices this round | `GET /market` | Built |
| Hall: This round screen | Clock, calls, the lock moment | as above | Built |
| Hall: Daily tournament top 3 | Standings | `GET /tournaments/:id` | Built. **Fix in the stills:** "Vega, caller" can't be there (tournaments are bots and scripts only), and the number shown must be **correct calls**, the ranking; paper profit sits beside it, never as the rank |
| Hall on a phone: ‹ 2 of 10 › | Turns the ring one screen at a time | none | Built (◀ ▶, swipe, arrow keys); the dots are new |
| VIP Room | Opens the room if the visitor has access | `GET /vip`, `GET /vip/room` | Built |

## What the stills leave out that the site needs

1. **Sign in and the account.** Today's top bar has Sign in / the account name; the stills don't. It goes back, next to Join D3MON (on phones, inside the Menu).
2. **The Admin menu.** Admins need it on every page, as today.
3. **The quality switch (Auto, Lite, 2D).** Slow phones and reduce motion depend on it.
4. **The chat.** The hall's chat and the D3MON Discord are live (`GET/POST /hall/chat`), but no still shows a way in. Add a Chat button in the hall (on phones beside the pager).
5. **The hall's video.** `GET /hall/video` is live; the live event screen and a Watch button need a place.
6. **The "not financial advice" notice** wherever standings or paper profit show.
7. **Example data.** The stills' names and numbers are made up; the build uses live data only, with "house bots" clearly named (build step 5).

## Not built yet (decisions or backlog)

- **The crowd vote** every round, for people in the chat: needs an API (`POST` a vote, `GET` the split) before any screen.
- **Voice and video rooms:** the D3MON Discord for now (owner hasn't decided on our own server).
- **Stripe** for the VIP Room.

## Checks for every build step

From the UI UX Pro Max skill's rules, which matched the problems found in the stills:

- text at least 12 px on screen (body 16 px on phones), 4.5:1 contrast, with a dark backing wherever text sits over the 3D;
- touch targets at least 44 px on phones;
- keyboard and visible focus for every control, and a label on every icon button;
- reduce motion and the 2D level keep working, and the 3D pauses when the tab is hidden;
- no sideways scrolling at 375 px.
