# D3MON World: design notes (not built yet)

Notes for the 3D redesign so nothing is lost between sessions. **No decisions here are final** until the owner answers the open questions. Nothing in this folder is served by the site.

## The owner's direction

- Keep the original background (near-black `#05080C`, faint blue flower-of-life circles, soft blue glow at the top) and the **Callers / Bots / Chart Scripts triangle** as the core concept. Everything else can change, labels included (Cortex and Vortex don't have to keep their names). It should look world-class.
- The whole site becomes an **immersive 3D world**: scrolling and moving interact with the scene, and visitors fly freely between sections.
- **Must stay fast.** A tester's laptop struggled with heavy animations before. Lighter versions per device, a 2D fallback, and respect for reduce-motion.
- Use the existing `/api/v1` data and the Stats Hub display slots, so live battle data and bot stats appear in the world.
- Build it on a separate preview page (`/world`) so the live site isn't affected. Deliver as PRs, then walk the owner through each server update.

## The owner's vision: the pyramid

The triangle becomes a **tetrahedron** (a three-sided pyramid with a triangular base: 4 corners, 6 edges, 4 triangular faces). Seen from directly above it looks exactly like today's logo: the base is the triangle and the edges rising to the peak look like the spokes.

- **The peak:** the live trade floor, the community space where all three come together (today's Cortex).
- **Inside:** usable space, and room for the **Battle of the Bots** experience (today's Vortex).
- **The outside faces:** usable too, especially for **ads and trailers** advertising the bots.

## Proposed so far (waiting on the owner)

- **Engine:** three.js, vendored as one pinned file in `public/vendor/` (browser only; the server stays dependency-free). Alternative: hand-written WebGL.
- **Device levels:** Full / Lite / Mobile Lite / 2D. **Start at Lite** and step up only after the device proves smooth. Weak or low-memory devices, software rendering, reduce-motion, battery or data saver all go to 2D. A visible Quality switch (Auto / Full / Lite / 2D). Pause when the tab is hidden or nothing moves. 2D never downloads the 3D code. Test with CPU throttling ×4 and ×6, plus `/world?fps` for real devices.
- **Text stays real HTML** placed over the scene (sharp, accessible, reuses `d3mon-widget.js` and the privacy rules). Calls stay sealed until the lock; the world draws only what the server sends each reader.
- **Ads and trailers:** YouTube, Twitch and similar links placed on the faces as embedded players (no server bandwidth). Only the face in view plays. Lite and phones show a still image until tapped. Choosing ads needs a small admin page like `/displays`: a later, separate PR, and **ask before building it**.
- **Display slot names:** `world-callers`, `world-bots`, `world-scripts`, `world-arena`, made by HardSmoke on `/displays`.
- **Suggested names** (owner may replace): the trade floor is the Nexus or the Trade Floor; the battle is the Arena; Callers is the Spire, Bots the Forge, Chart Scripts the Observatory.
- **Proposed PR order:** (1) `/world` page, device levels and 2D version; (2) pyramid outside, corners and flying; (3) inside: arena, walls and live data; (4) trade floor at the peak; (5) ad and trailer faces with their admin page. A concept board comes before PR 1.

## Open questions for the owner

1. Engine: three.js vendored (recommended) or hand-written WebGL?
2. Moving: scroll follows a route with free flight any time (recommended), or free flight only?
3. First version: the places plus links out to the rest of the site (recommended), or more inside the world (Cortex chat etc.)?
4. Reduce-motion: open in 2D with 3D by choice (recommended), or a still 3D view?
5. Display slot names OK?
6. Landmarks **outside at the base corners**, or **inside** the pyramid? The 10118 video suggests inside along a ramp, with the outside corners as distant landmarks only.
7. **Spiral glass ramp** as the scroll path (from the 10118 video)?
8. Did "the very section" mean the very **top** (assumed) or the centre of the base?
9. Make a **public-safe** mockup video (placeholder names, no "verified" ticks on sample numbers, no made-up HardSmoke chat line)?
10. Is the **under-construction page** still what the public sees at d3mon.co? It isn't served by the app (`construction/` isn't wired in), so it must come from Caddy or nginx or the domain setup. The owner is checking. The answer decides "coming soon" vs "live" wording in the public update.

## Inspiration received

Files are in [`inspiration/`](inspiration/). They're AI-generated concept images; their on-screen text is gibberish.

| File | What to take from it |
| --- | --- |
| `00-shape-reference.png` | The shape reference made for Gemini: a tetrahedron with amber at the back, blue left, violet right and a white peak. |
| `01-interiors-and-corners.webp` | Arena with a **green/red tick ring (the round clock)**, a core with entrants beamed in, a glass walkway ring; **glass bridges** between chart walls; a light column from the arena to a crystal peak; amber spire with rings, blue **hexagon cells with crystal pods**, violet stacked chart panels. Simplify glass and railings into light lines for speed. |
| `02-exterior-tetrahedron.png` | **The opening shot.** Correct shape; dark-glass faces with faint holograms (the "idle" look for ad faces); arena glowing through the base; crystal capstone; flower-of-life horizon. The amber corner is at the back, so open from above and orbit. |
| `03-corners-arena-lounge.webp` | Callers spire with rings (pulse on a call); Bots **crystal sphere with small robots** (one robot per real bot); Chart Scripts **observatory dome with floating charts**; peak **lounge** (glass floor, wall screens: simplify the furniture into outlines). Places landmarks inside the pyramid, which is question 6. |
| `04-video-10118-frames.jpg` | 12 frames from a 10-second portrait clip: a **stadium arena** with tiers (show members online as lights in the stands), the camera gliding up a **spiral glass ramp**, hexagon **bot pods**, glass **caller booths** with a hologram and stat dials (real verified stats only), floating **formulas and code** for Chart Scripts, and a **golden geometric crown** at the peak. Shot in portrait, so the world must look right on phones held upright. Very dense: show live data only on screens near the camera. |

## The mockup

[`mockup/`](mockup/) is the prototype behind the sample videos sent to the owner (52 s, sample data, labelled as a mockup). It's for reference only, not the real build.

- `index.html`: the three.js scene, with a camera path, overlays and sample battle data. It runs one frame per `window.frame(t)` call.
- `capture.mjs`: records it with Playwright frame by frame.
- `sound.py`: the synthesized eerie soundtrack (numpy). The owner asked for **no water or wave-like noise**.

To rebuild a video:

1. `npm install three@0.169.0` next to `index.html`.
2. Serve the folder on port 8765.
3. Run `node capture.mjs video frames 30 0 52`.
4. Join the frames into an MP4 with ffmpeg, and mux in `python3 sound.py score.wav` (the echo filters used were `aecho=0.8:0.6:380|820|1450:0.28|0.18|0.1,highpass=f=28,loudnorm=I=-18:TP=-1.5:LRA=14`).
