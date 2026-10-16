# D3MON World: open questions

Decisions waiting on the owner. When one is answered, move it to **Decided** with the date and the answer, and update [PLAN.md](PLAN.md).

## Open

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
