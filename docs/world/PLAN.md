# D3MON World: technical plan

How we propose to build it. Status: **proposed, not approved.** Items waiting on the owner are listed in [QUESTIONS.md](QUESTIONS.md).

- **Engine:** three.js, vendored as one pinned file in `public/vendor/` (browser only; the server stays dependency-free). Alternative: hand-written WebGL.
- **Device levels:** Full / Lite / Mobile Lite / 2D. **Start at Lite** and step up only after the device proves smooth. Weak or low-memory devices, software rendering, reduce-motion, battery or data saver all go to 2D. A visible Quality switch (Auto / Full / Lite / 2D). Pause when the tab is hidden or nothing moves. 2D never downloads the 3D code. Test with CPU throttling ×4 and ×6, plus `/world?fps` for real devices.
- **Text stays real HTML** placed over the scene (sharp, accessible, reuses `d3mon-widget.js` and the privacy rules). Calls stay sealed until the lock; the world draws only what the server sends each reader.
- **Ads and trailers:** YouTube, Twitch and similar links placed on the faces as embedded players (no server bandwidth). Only the face in view plays. Lite and phones show a still image until tapped. Choosing ads needs a small admin page like `/displays`: a later, separate PR, and **ask before building it**.
- **Display slot names:** `world-callers`, `world-bots`, `world-scripts`, `world-arena`, made by HardSmoke on `/displays`.
- **Suggested names** (owner may replace): the trade floor is the Nexus or the Trade Floor; the battle is the Arena; Callers is the Spire, Bots the Forge, Chart Scripts the Observatory.
- **Proposed PR order:** (1) `/world` page, device levels and 2D version; (2) pyramid outside, corners and flying; (3) inside: arena, walls and live data; (4) trade floor at the peak; (5) ad and trailer faces with their admin page. A concept board comes before PR 1.
