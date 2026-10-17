# D3MON World: blueprint

**Status: draft for the owner's approval (rewritten 2026-10-17).** This is the one design that every build step follows. It turns the [vision](VISION.md), the [inspiration](INSPIRATION.md) and the [decisions](QUESTIONS.md) into a single world.

This version replaces the walkable spiral ramp: the owner found climbing it dizzy and the stairs too literal. The spiral idea lives on as the **Helix**.

**Pictures:**
- [`blueprint/helix-1.png`](blueprint/helix-1.png), the pyramid with the Helix;
- [`blueprint/helix-2.png`](blueprint/helix-2.png), browsing the Helix;
- [`blueprint/helix-3.png`](blueprint/helix-3.png), filtered to Bots.

`map-top.svg` and `section-side.svg` show the old ramp layout and are kept only for the record.

## 1. The idea in one line

The D3MON triangle is a **pyramid of light in deep space**, with three levels inside:
- the **Grand Hall** on the floor, where the battle happens;
- the **Helix** of every Caller, Bot and Chart Script, hanging above it like a great chandelier;
- the **Trade Floor** at the peak, where the community meets.

## 2. The look

- **Space and floor:** the original background: near-black `#05080C`, the faint blue flower-of-life pattern, now a floor of light stretching to the horizon, and the soft blue glow above.
- **Colours with meaning:** amber `#FFB547` Callers, blue `#4DA3FF` Bots, violet `#B98CFF` Chart Scripts, green `#2EE59D` up, red `#FF4D6A` down. White-blue where the three meet.
- **Light, not stuff:** edges and walls are **lines of light and dark glass**. Solid, heavy objects are rare. That's the look, and it's what keeps it fast.
- **Engraved line art** (from `inspiration/08`): our emblems are intricate engraved line art in the three colours on black: the triangle, the pyramid, the astronaut, and the Callers, Bots and Scripts marks. It's used on the loading screen, profile frames, billboard frames and in the 2D version, and it glows on the glass in 3D.
- **Type:** Orbitron for big titles, Rajdhani for text, Share Tech Mono for HUD labels. Huge two-tone headlines (from `inspiration/06`): "I am **NeuroBot 9.**"
- **Motion:** slow, weighted, with momentum; nothing snaps. Particles of light carry each change from one place to the next (from `inspiration/07`).
- **Sound:** off until the visitor turns it on. An eerie, echoing score with no water-like sounds. A deep cue for the lock moment.

## 3. The journey

Scrolling glides through these moments. Free flight is available at any time, with "back to route". A **level switch** (Hall · Helix · Trade Floor) jumps straight to a level. The **astronaut** (our own, never Lusion's) is the guide at the key moments.

| # | Moment | What happens |
| --- | --- | --- |
| 1 | **Arrival** | The loading screen draws the triangle in engraved line art. Seen from above, it's the logo. |
| 2 | **The rise** | Particles of light lift the triangle into the pyramid, and the camera eases down to the opening shot (from `inspiration/02`). The astronaut drifts past toward it. |
| 3 | **Outside** | A slow, gentle pass showing the three corner landmarks and the billboard faces. |
| 4 | **The portal** | The astronaut flies through a ring of light in the three colours and a short tunnel of glowing flower-of-life cells (from `inspiration/05`). We arrive in the Grand Hall. |
| 5 | **The Grand Hall** | We land on the **balcony**, overlooking the battle (section 5). |
| 6 | **The Helix** | A smooth lift up to the Helix balcony. Scrolling turns the Helix past a steady camera (section 4). |
| 7 | **The Trade Floor** | A smooth lift to the peak, under the golden crown. The community space. |
| 8 | **The bookend** | The astronaut returns beside "Apply for a battle" and "Join the community". |

## 4. Places

### Outside

- **The pyramid:** six edges of light, dark glass faces, particles flowing along the edges, and the crystal capstone.
- **The corner landmarks:** each base corner glows in its colour with its emblem in line art: the Callers **spire** with broadcast rings, the Bots **crystal**, the Chart Scripts **dome**. They're landmarks seen from a distance.
- **The faces:** the three outside faces are the main **billboards** (section 8).

### The Grand Hall (the lower half)

The battle is the main event inside the pyramid: **a grand room** (owner's wish). It's open and spacious, with nothing standing in the middle.

- **The round clock** is inlaid in the centre of the floor: the green and red ring of the last 24 hours of rounds, with the current round filling up.
- **Entrant stations** stand around the clock in their colours, one per entrant in the battle:
  - Callers in glass booths with a hologram silhouette;
  - Bots in hexagon pods;
  - Chart Scripts as floating chart screens.

  Each shows the entrant's name and call status: sealed until the lock, then Up or Down.
- **The stream walls:** the three inner faces show the live streams. Each wall holds its colour's entrants (Callers amber, Bots blue, Chart Scripts violet), facing the balcony.
- **The spotlight screen** hangs over the clock and enlarges one stream. The viewer picks it, or it follows whoever just called.
- **The stadium tiers** rise around the floor, with the members online right now shown as small lights in the stands.
- **The balcony:** a raised ring where visitors watch from (section 5).

### The Helix (the upper half)

- **A triple helix hanging from the peak like a chandelier,** ending above the Grand Hall. Three strands twist together:
  - an **amber strand of Callers**;
  - a **blue strand of Bots**;
  - a **violet strand of Chart Scripts**.

  The three kinds woven into one is the triangle idea in motion.
- **Every entrant is a card on its strand,** in engraved line-art frames, ordered as listed or by name, **never ranked by a stat**. Cards always turn to face the viewer, so no text is ever seen mirrored.
- **Scrolling turns and raises the Helix past a steady camera.** The content moves and the visitor doesn't, so it never makes anyone dizzy.
- **Filtering:**
  - **Filter chips** (All · Callers · Bots · Chart Scripts): the chosen strand glows and comes forward while the others dim.
  - **Tap a card** to see the entrant's details, then tap again to open their cinematic profile (section 7).
- **The Helix balcony** is a ring at the Helix's middle where visitors browse from.

### The Trade Floor (the peak)

- The chamber at the very top, under a **golden geometric crown** (from `inspiration/04`).
- A glass floor looks down through the Helix into the Grand Hall.
- Wall screens show the community chat, the current round and live streams.
- It's the community's space, and **ad-free**.

## 5. The battle

These are the four Grand Hall decisions, made on 2026-10-17.

1. **Viewpoint:**
   - Visitors watch from the **balcony**, overlooking the whole hall: the clock, every station and all the stream walls at once.
   - **Tap anything** (a stream, a station, the clock) and the view eases in close with its details. Tap back to return to your seat.
   - On phones, the balcony view fits portrait and a tap opens a full-screen panel.
2. **Between battles:**
   - The hall shows **the next battle filling up:** a countdown over the clock, approved entrants at their stations, and empty stations glowing **"Apply for this battle"**.
   - **The last battle's highlights replay on one wall screen, labelled REPLAY**, never the whole hall.
3. **The lock moment, every 15 minutes:**
   - In the last 10 seconds the hall dims and a countdown fills the clock.
   - At the lock, a deep sound plays (if sound is on) and every sealed call flips at once to green Up or red Down. About 3 seconds, then back to normal.
   - The camera never moves on its own. Reduce motion gets the flip without the dimming.
4. **Moving between levels:** scroll glides like a quiet lift, with no spinning, and the level switch jumps straight to a level. Both are also in the Menu.

**The signature moment:** when a battle starts, its entrants **peel off their strands in the Helix and descend** into the Grand Hall to take their stations around the clock. When the battle ends, they rise back up into the Helix.

**The sealed-call rule holds everywhere:** before the lock, everyone sees *that* an entrant called, but only the owner and admins see which way. The world draws only what the server sends each reader.

## 6. Live data: what comes from where

All of it is read from what the server already offers (`/api/v1` plus the live feed). Every privacy rule stays on the server.

| In the world | Comes from |
| --- | --- |
| Entrants, the Helix cards, stations | `GET /api/v1/entrants`, battle lineups |
| Stats on stations, cards and profiles | Display slots (`world-callers`, `world-bots`, `world-scripts`, `world-arena`) and stat cards |
| The battle, the lineup, calls and results | `GET /api/v1/battles`, `/battles/:id/board`, the feed |
| The round clock | `GET /api/v1/rounds` |
| Streams | The stream links kept in battle lineups |

## 7. Profiles

The cinematic style from `inspiration/06`:
- **Rich profiles for Bots, Chart Scripts and Callers:**
  - full-screen hero art that changes as you scroll;
  - "I am **NAME.**" in the kind's colour, with HUD labels and the tagline in a glass card;
  - then verified stats, self-reported stats, battle history, recent calls (after their lock), their stream and trailer, and their Discord.
- **Simple profiles for members:** the same frame and type, with avatar, member-since date and activity.
- **One standard template for every rich profile:** the same layout, line-art frame, type and HUD. The hero image inside is our generated engraved line-art emblem in the kind's colour by default, or the owner's own image once HardSmoke approves it (a later server feature; we'll ask first). Uploads get the D3MON treatment automatically (tinted to the kind's colour, the line-art frame and glow on top), so every profile stays on-brand.

## 8. Advertising: tasteful by design

**The owner's rules:**
- never annoying;
- for scripters, callers and bot owners only;
- free at first, paid later.

So ads live **only on surfaces that belong to the world**, never on top of it.

| Spot | How it behaves |
| --- | --- |
| **The three outside faces** (the main billboards) | Seen on arrival and in free flight. Only the face you're looking at plays. |
| **The Helix balcony** (two billboards) | On the walls beside the Helix balcony, away from the cards. |
| **The Grand Hall intermission screen** | The spotlight screen shows ads **only between rounds**, after a round settles and before the next lock countdown. **Never during a lock, a reveal or a live stream someone has picked.** |
| **An entrant's own profile** | Their own trailer as a "Watch trailer" card. No other advertisers on someone's profile. |

**Never:**
- pop-ups, overlays or anything covering the view;
- sound unless the visitor clicks;
- ads in the opening, the portal, on the Trade Floor or over live streams during a round;
- ads on sign-in, applications or any working page.

**Always:**
- every ad is labelled "Ad";
- muted, starting from a still image;
- several ads take turns per spot;
- on phones and Lite, a still image until tapped;
- in 2D, at most one ad card per section.

**When there are no ads,** the spots show D3MON's own content: the next battle, "apply now", a featured entrant (as listed, never "top"), or our trailer. Spots are never empty, so the ad system can come last.

## 9. Navigation: clean, few buttons

The owner wants a tidy site with far fewer buttons, grouped menus, a proper button for applicants and one for admins.

- **One slim top bar:**
  - the D3MON triangle logo (it opens the map of the places);
  - **"Apply for a battle"**, the one highlighted button for visitors;
  - the **"HardSmoke" control button**, for admins only;
  - the account menu.
- **"Apply for a battle"** is always in the top bar, and also appears beside the next battle in the Grand Hall, on empty stations, and in the astronaut's closing scene. After applying, it shows "Your application: pending / approved".
- **The "HardSmoke" button** opens one admin hub with **Applications first**, then battles, metrics, the Stats Hub pages and the rest of the Admin panel. Today's stop-gap is the Admin panel's "Arena pages" tab and the "☰ Applications" button in Battle control (PR #12).
- **One "Menu" drop-down holds everything else,** grouped:
  - **World:** the places and the level switch;
  - **Battles:** the live board, the schedule, apply;
  - **Community:** chat, messages, coin;
  - **My D3MON:** profile, my bots and keys, settings.
- **The Quality switch and the sound toggle** are two small icons in a corner.
- **No toolbars inside the world:** actions appear only on hover or tap.
- **Phones and 2D:** the same menu, opening as a full-screen sheet.
- **Every page, not only the world,** gets the same tidy-up: the same top bar and menu, grouped sections, and rarely used controls folded into menus or "More" panels. **Every existing control stays.** Each page's controls are listed before its redesign and checked off after.

## 10. Comfort and device levels

- **Comfort rules everywhere:**
  - no continuous camera spin;
  - a level horizon;
  - vertical moves are slow lifts;
  - the content moves rather than the visitor;
  - reduce motion gets instant cuts.
- **Device levels:** **Full**, **Lite**, **Mobile Lite** and **2D**, starting at Lite and stepping up only once the device proves smooth. Reduce motion opens in 2D. See the [plan](PLAN.md).
- **The 2D version is a complete site,** not an error page: the same journey as a scrolling page, with the original background, the line-art emblems, every panel and live data. The 3D code is never downloaded there.

## 11. Build order

Each step is its own pull request, tested, with the server update walked through step by step.

1. **This blueprint:** approved by the owner, after a user's-eye video of the Grand Hall, the Helix and the Trade Floor.
2. **The `/world` foundation:**
   - the page, device levels and the Quality switch;
   - the new **top bar and Menu**, with the applicant and admin buttons;
   - the complete 2D version with the live panels.
3. **The 3D world, outside:** space, floor, the pyramid, the corners, the opening and the portal.
4. **The Grand Hall:** the clock, stations, stream walls, spotlight screen, balcony and the lock moment.
5. **The Helix and the Trade Floor:** filtering, cards to profiles, the descent at battle start, and the astronaut.
6. **Rich profiles,** using generated art first.
7. **The site-wide tidy-up of the existing pages,** one page per pull request, every control kept and checked off.
8. **The systems that need new server work, one at a time,** asking first about each:
   - profile art uploads;
   - then the **ad system:** spots, HardSmoke approval, rotation, labels and simple counts, with payment left for later.

## 12. Still to confirm

Nothing that changes the design. Streams: YouTube, Twitch and Kick play on the walls, and X, Discord and others show as "Watch live" cards (decided 2026-10-17).
