# D3MON World: open questions

Decisions waiting on the owner. When one is answered, move it to **Decided** with the date and the answer, and update [PLAN.md](PLAN.md).

## Open

3. First version: the places plus links out to the rest of the site (recommended), or more inside the world (Cortex chat etc.)?
5. Display slot names OK?
8. Did "the very section" mean the very **top** (assumed) or the centre of the base?
9. Make a **public-safe** mockup video (placeholder names, no "verified" ticks on sample numbers, no made-up HardSmoke chat line)?
10. Is the **under-construction page** still what the public sees at d3mon.co? It isn't served by the app (`construction/` isn't wired in), so it must come from Caddy or nginx or the domain setup. The owner is checking. The answer decides "coming soon" vs "live" wording in the public update.
11. **Many streams:** which sites do the bots stream on (Twitch, YouTube, Kick, X…), and how many bots stream at once in a typical battle?
12. **Profiles:** "bot owner, scripters, and read profiles". Does "read" mean **callers**, or something else (traders, verified members…)?
13. **Profile art:** should entrants upload their own hero image and tagline (a new server feature reviewed by HardSmoke), or should we generate art for each kind?
14. **Ads, who:** only Arena entrants (bots, scripts, callers), or outside sponsors too?
15. **Ads, payment:** will ads be paid? If so, how (manually by arrangement, or through the site)? That changes how much the system needs.
16. **Ads, where first:** which spots matter most: the pyramid faces, billboards along the route, the arena between rounds, profiles?

## Decided

| Date | Decision |
| --- | --- |
| 2026-10-16 | Keep the design notes, inspiration and mockup in `docs/world/` on the working branch ("do what you think is best to make the project easier, and professional"). |
| 2026-10-16 | No water or wave-like sounds in the soundtrack. |
| 2026-10-16 | **Order of work:** keep collecting inspiration; then go over everything together and make one plan (the blueprint: places, where each system appears, and a simple outline of each system); then build in layers: `/world` foundation, then the systems one PR each (API first), then the 3D places with placeholders until each system is ready. |
| 2026-10-16 | **Engine:** three.js, one pinned file kept in the repo (browser only; the server stays dependency-free). |
| 2026-10-16 | **Moving:** scrolling follows a guided route; free flight is available at any time, with "back to route". |
| 2026-10-16 | **Reduce motion:** opens in 2D, with 3D available by choice; in 3D the camera cuts between places instead of flying. |
| 2026-10-16 | **Layout (owner: "I like the spiral, as long as it fits the triangle. Do what you think is best"):** a **triangular spiral ramp inside the pyramid**, three straight runs per turn, one along each inside wall. The Callers wall (amber) holds caller booths, the Bots wall (blue) bot pods, the Chart Scripts wall (violet) script screens. It climbs from the arena on the floor to the trade floor at the peak, tightening as the pyramid narrows. The three outside corners keep simple glowing landmarks seen from a distance. |
| 2026-10-16 | **Ad placement is ours to choose** (owner: "wherever it looks best to run advertisements tastefully. I don't want it to be annoying"). The spots and rules are in BLUEPRINT.md. |
| 2026-10-16 | **Ads are not built first.** The world is designed with ad spots reserved; until the ad system exists (built last, in step 3), the spots show D3MON's own content (the next battle, "apply", a featured entrant, our trailer), so they're never empty. |

