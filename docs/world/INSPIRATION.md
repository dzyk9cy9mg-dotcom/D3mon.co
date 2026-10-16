# D3MON World: inspiration

Everything the owner has sent, and what we've learned from other sites, with what each piece means for D3MON. Add new items at the top of their section, with the date.

## From the owner

Files are in [`inspiration/`](inspiration/). They're AI-generated concept images; their on-screen text is gibberish.

| File | What to take from it |
| --- | --- |
| `00-shape-reference.png` | The shape reference made for Gemini: a tetrahedron with amber at the back, blue left, violet right and a white peak. |
| `01-interiors-and-corners.webp` | Arena with a **green/red tick ring (the round clock)**, a core with entrants beamed in, a glass walkway ring; **glass bridges** between chart walls; a light column from the arena to a crystal peak; amber spire with rings, blue **hexagon cells with crystal pods**, violet stacked chart panels. Simplify glass and railings into light lines for speed. |
| `02-exterior-tetrahedron.png` | **The opening shot.** Correct shape; dark-glass faces with faint holograms (the "idle" look for ad faces); arena glowing through the base; crystal capstone; flower-of-life horizon. The amber corner is at the back, so open from above and orbit. |
| `03-corners-arena-lounge.webp` | Callers spire with rings (pulse on a call); Bots **crystal sphere with small robots** (one robot per real bot); Chart Scripts **observatory dome with floating charts**; peak **lounge** (glass floor, wall screens: simplify the furniture into outlines). Places landmarks inside the pyramid, which is question 6. |
| `04-video-10118.mov` and `04-video-10118-frames.jpg` | The owner's 10-second portrait clip, and 12 frames from it: a **stadium arena** with tiers (show members online as lights in the stands), the camera gliding up a **spiral glass ramp**, hexagon **bot pods**, glass **caller booths** with a hologram and stat dials (real verified stats only), floating **formulas and code** for Chart Scripts, and a **golden geometric crown** at the peak. Shot in portrait, so the world must look right on phones held upright. Very dense: show live data only on screens near the camera. |

### Gemini prompts that worked

Images 02 and 03 came from Gemini (Nano Banana) with `00-shape-reference.png` attached. Image tools draw a square Egyptian pyramid whenever they see "pyramid", so name the shape and give the counts. Keep later prompts in the same chat so the style stays consistent.

```
Use the attached image as the exact shape and colour reference. Keep its geometry precisely: a TETRAHEDRON (triangular pyramid) with exactly 4 corners, 6 edges and 4 triangular faces. The base is a TRIANGLE, not a square. Three corners sit on the base and one corner is the single peak on top.
[then describe the scene: dark space void #05080C, neon edges with amber #FFB547 at the back, blue #4DA3FF on the left, violet #B98CFF on the right, white-blue crystal peak, dark glass faces with faint holographic charts, flower-of-life floor, premium minimal sci-fi (Tron: Legacy meets Apple), wide 16:9]
Do NOT draw: a square base, a four-sided pyramid, an Egyptian pyramid, stone, sand, desert, people, text, letters or logos.
```

If it still draws four sides, reply: *"Wrong shape. Only 3 corners on the base, exactly like the reference image. 4 corners total."*

## Lessons from award-winning 3D sites

From web searches only: this environment can't open the sites themselves. The sources are mostly secondary write-ups, so check before quoting any award or number publicly.

**Recent winners worth studying:**
- **Igloo Inc** (abeto): Awwwards Site of the Year 2024. A crypto company. Procedural crystal ice, shader-driven text effects.
- **Lusion's EverSwap**: a DeFi trading site, Site of the Day and Developer Award, June 2026.
- **Lusion's Oryzo**: Site of the Month, April 2026.
- **Bruno Simon's portfolio**: a driveable 3D world.
- **Cartier**: six scrollable 3D "alcoves".
- **Shopify Editions**: scroll as a product reveal.
- **DeepSee**: a descent through an underwater scene as you scroll.
- **Sébastien Lempens**: a scroll tour through a 3D Paris.

**Takeaways for D3MON:**
1. **One hero object carries the whole site.** Oryzo is built around a single object with real weight. For us, that's the pyramid.
2. **Scroll moves the camera through real depth,** not 2D layers sliding past (Oryzo, Lempens, DeepSee). This supports the spiral climb from the arena to the peak.
3. **Chapters with their own mood.** Cartier's alcoves suggest each place gets its own lighting, sound and pace, with clear "you are here" framing.
4. **Procedural detail looks expensive but is cheap to download.** Igloo grew its ice with a crystal-growth algorithm, with smaller files than images. We could do the same for the capstone crystal and the Bots sphere.
5. **The interface feels part of the world.** Igloo's text decodes with shader glitch and scramble effects. Labels and stats here could "decrypt" into place. We'd keep real HTML underneath for accessibility.
6. **Weight and inertia.** The camera eases with momentum, and objects respond to the cursor or touch. No instant jumps.
7. **Discoverable extras.** Bruno Simon's site has achievements, secrets and visitor messages. Ideas for us:
   - achievements for visiting every corner or watching a battle at the lock;
   - hidden easter eggs;
   - moderated community "whispers" floating in the space.
8. **Sound is part of the identity,** with a clear on/off control, off until the visitor turns it on (browsers block autoplaying sound anyway). The eerie score from the mockup is a start.
9. **The loading screen tells the story.** For example, the triangle draws itself as the page loads, then rises into the pyramid.
10. **Smooth scrolling synced with the 3D loop,** with masked text reveals and restrained, large type. Done in our own code, with no extra dependency.
11. **No page reloads inside the world.** Moving between places is a flight, not a new page.
12. **What judges score:**
    - The main areas are Design, Usability, Creativity and Content. Secondary sources say usability weighs heavily.
    - **Most entries fail on usability and speed** (Core Web Vitals), not on creativity.
    - The Developer Award also looks at accessibility and code quality.
    - So the fast first paint, the 2D fallback, clear navigation, phones held upright and reduce-motion support are what make it award-ready, not extras.
13. **Precedent:** EverSwap and Igloo Inc show that crypto and trading sites can win top awards when the craft is high.

**Sources:**
- [Awwwards Sites of the Year](https://www.awwwards.com/websites/sites_of_the_year/)
- [Igloo Inc on Awwwards](https://www.awwwards.com/sites/igloo-inc) and [its case study](https://www.awwwards.com/igloo-inc-case-study.html)
- [Igloo Inc techniques (webgpu.com)](https://webgpu.com/showcase/igloo-inc-procedural-crystals/)
- [EverSwap on Awwwards](https://www.awwwards.com/sites/everswap)
- [Lusion on Awwwards](https://www.awwwards.com/lusion/) and [Lusion on Codrops](https://tympanus.net/codrops/2026/04/13/lusion-where-digital-craft-meets-ambitious-experimentation/)
- [Best Three.js websites 2026 (Utsubo)](https://www.utsubo.com/blog/best-threejs-websites-2026)
- [What award judges look for (Utsubo)](https://www.utsubo.com/blog/award-winning-website-design-guide)
- [Awwwards judging criteria (hontran.dev)](https://www.hontran.dev/blog/awwwards-judging-criteria)
- [3D environment scroll navigation (Awwwards)](https://www.awwwards.com/inspiration/3d-environment-webgl-scroll-navigation)
- [Bruno Simon portfolio (Pastel)](https://usepastel.com/blog/how-a-design-portfolio-got-the-attention-of-400-000-visitors)
- [Lenis smooth scroll](https://cdn.jsdelivr.net/npm/lenis@1.3.23/README.md)
