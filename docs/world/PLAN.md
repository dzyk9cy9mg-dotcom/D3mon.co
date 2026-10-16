# D3MON World: technical plan

How we propose to build it. Status: **proposed, not approved.** Items waiting on the owner are listed in [QUESTIONS.md](QUESTIONS.md).

- **Engine (decided):** three.js, vendored as one pinned file in `public/vendor/` (browser only; the server stays dependency-free).
- **Layout (decided):** a triangular spiral ramp inside the pyramid, one wall per kind, climbing from the arena to the trade floor. Outside corners as distant landmarks. See QUESTIONS.md.
- **Device levels:** Full / Lite / Mobile Lite / 2D. **Start at Lite** and step up only after the device proves smooth. Weak or low-memory devices, software rendering, reduce-motion, battery or data saver all go to 2D. A visible Quality switch (Auto / Full / Lite / 2D). Pause when the tab is hidden or nothing moves. 2D never downloads the 3D code. Test with CPU throttling ×4 and ×6, plus `/world?fps` for real devices.
- **Text stays real HTML** placed over the scene (sharp, accessible, reuses `d3mon-widget.js` and the privacy rules). Calls stay sealed until the lock; the world draws only what the server sends each reader.
- **Ads and trailers:** YouTube, Twitch and similar links placed on the faces as embedded players (no server bandwidth). Only the face in view plays. Lite and phones show a still image until tapped. Choosing ads needs a small admin page like `/displays`: a later, separate PR, and **ask before building it**.
- **Display slot names:** `world-callers`, `world-bots`, `world-scripts`, `world-arena`, made by HardSmoke on `/displays`.
- **Suggested names** (owner may replace): the trade floor is the Nexus or the Trade Floor; the battle is the Arena; Callers is the Spire, Bots the Forge, Chart Scripts the Observatory.
- **Proposed PR order:** (1) `/world` page, device levels and 2D version; (2) pyramid outside, corners and flying; (3) inside: arena, walls and live data; (4) trade floor at the peak; (5) ad and trailer faces with their admin page. A concept board comes before PR 1.

## Showing many streams during a battle (first thoughts, not decided)

- **Where:** the three inner walls of the pyramid become the stream wall. Each wall carries the streams of entrants of its colour (Callers amber, Bots blue, Chart Scripts violet), with the arena and round clock below. In the stadium version, the screens ring the tiers.
- **Focus:** one stream at a time can be pulled into a large "spotlight" screen over the arena. Pick it with a click, or have it follow the entrant that just called. The others stay visible around it.
- **Live status on each screen:** name, kind colour, call status (sealed until the lock, then the revealed direction), and a glow while live. All from `/api/v1` and the feed.
- **Speed:** every live video player is heavy, so we limit how many play at once:
  - Full: up to about 4–6 playing, the rest as live preview images that refresh.
  - Lite and phones: 1–2 playing, the others as stills; tap to swap.
  - 2D: a normal responsive grid of streams.
  - Players are created only when a wall is in view, and removed when it isn't.
- **How:** stream players (Twitch, YouTube, Kick…) are placed in 3D over the walls as real embedded players. Their own pages can't be drawn into the 3D scene directly. Sound comes from the spotlight stream only.
- **To check when building:** which streaming sites the bots use, and each site's embed rules (some need the site's domain registered, e.g. Twitch's `parent=` parameter).

## The advertisement system (first thoughts, not decided)

Built as its own feature, API first, like the display slots. **Ask before building any of it.**

- **Ad spots ("placements"):** named places in the world, such as the pyramid faces, billboards along the route, a screen in the arena between rounds, the trade floor, or a banner on profiles. Each has a name, a shape (16:9, vertical, banner) and a position. In 2D each becomes a simple video or image card in the page.
- **Ads:** a video link (YouTube, Twitch clip…) or an uploaded image or short video. Each has a title, the entrant it promotes (links to their profile), dates it runs, and the spots it may appear in. Every ad is **clearly labelled "Ad" or "Sponsored"**.
- **Who decides:** HardSmoke approves every ad before it shows, and chooses where and when. It's a page like `/displays`, with a log of every change, like applications.
- **Rotation:** several ads per spot take turns, so no spot shows the same ad all day.
- **Speed:**
  - Only the ads in view play, muted, with a still image until then.
  - Phones and Lite show the still until tapped.
  - Videos come from embeds where possible, to save the server's bandwidth.
- **Counting:** simple views and clicks per ad, so advertisers can see results. Counts only, no tracking of individual visitors.
- **Rules for content** (trading ads need care):
  - no promised or guaranteed profits;
  - no performance claims that aren't the bot's verified stats;
  - no links that ask for keys or wallets;
  - the same secret-scanning as the rest of the Arena.

