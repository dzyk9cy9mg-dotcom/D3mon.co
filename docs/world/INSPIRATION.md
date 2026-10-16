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
| `05-lusion-astronaut.jpg`, `05-lusion-walkthrough-1.jpg`, `-2.jpg` | Frames from a 96-second screen recording (2026-10-16) of a YouTube walkthrough of **Lusion's own site** (lusion.co, the studio behind EverSwap and Oryzo). The video itself isn't saved: it's someone else's work and 28 MB, and the frames are enough. **The owner especially loves the astronaut part.** The sequence: the scroll **dives into a small screen** showing an astronaut above the Earth, so the screen becomes the whole page. A huge headline ("Step into a new world…") **splits apart as the camera flies through it**. The astronaut drifts toward a **glowing ring like a black hole**, passes through it into a **tunnel of light cells** (white, then green, pink and blue), then into "an alternative reality". He comes back at the end among stickers next to "Let's work together". Also: 3D objects that react to the mouse, a line drawing itself down the page as you scroll, and video previews on hover. |

| `06-cinematic-profile-style.jpg` | Frames from a 95-second screen recording (2026-10-16) of a YouTube tutorial, "Create Interactive 3D Scrolling Effects Like Iron Man" (DeviniLabs). Only the first ~20 seconds show the finished site; the rest is the how-to. The video isn't saved. **The owner wants this as the style for profiles** (see the profiles section below). What it does: a full-screen, cinematic character in dark, smoky light that **changes as you scroll**: the suit assembles, the face dissolves into dust, the pose and the backdrop change. A **huge two-tone headline** ("I am **Iron Man.**", with the last words in gold). Thin **HUD micro-labels** in the corners and frame brackets. A short **quote in a small glass card**. Strong focus on one figure. **Iron Man is Marvel's character, so we take the style only, never the character or images.** |

### The astronaut: ideas for D3MON (owner's favourite, 2026-10-16)

The owner wants an astronaut "somewhere" in the world. **Make our own astronaut, never Lusion's model or art.** Take the idea, not the asset. Ideas, to choose from later:

1. **The guide who carries the story.** A D3MON astronaut (dark suit, amber, blue and violet trim, the triangle logo on the chest, the pyramid reflected in the visor) floats through the whole world. They lead the scroll, the way Lusion's astronaut leads theirs.
2. **The way in, from 2D to 3D.** The page opens on a small screen showing the astronaut drifting toward the pyramid. Scrolling dives into that screen and you're in the world. This also bridges the 2D version and the 3D one.
3. **The portal into the arena.** Instead of flying through the trailer face, the astronaut passes through a **ring of light in the three colours** (our black hole). A short tunnel through the **flower-of-life pattern as glowing cells** follows, then the arena opens. It suits "entering the battle".
4. **Headlines you fly through.** Big words ("Enter the Arena", "Callers · Bots · Chart Scripts") split apart as the camera passes through them.
5. **The bookend.** The astronaut returns at the end next to "Apply for the next battle" or "Join the community", floating near the peak among the community's lights.
6. **Light and fun touches:** the astronaut waves at a returning visitor, reacts to the cursor, or turns to watch the lock moment in the arena.

Speed: the astronaut is a real 3D model, so it's where the Nano Banana → image-to-3D tools step (Meshy, Tripo, Rodin) fits, or a commissioned model.
- Keep it to a few MB, with a lighter version for Lite and phones.
- In 2D, a pre-rendered image or a short looping video.
- Its animation (floating and turning) can be gentle and loop, which is cheap to run.

### Profiles in the cinematic style (owner, 2026-10-16)

The owner wants the cinematic style from `06` to be **what it feels like to open a profile**:
- **Bot owners, chart scripters and callers** get special, information-rich profiles.
- **Everyone else** gets a simpler version of the same style.

**The rich entrant profile.** Every part follows the owner's privacy choices: stats are hidden by default, and only what's set Public or Members only shows.
- **Hero:** full-screen art for the entrant, which **changes as you scroll**:
  - a bot assembles from parts;
  - a caller's hologram forms;
  - a script's chart draws itself in light.
- **Headline:** "I am **NeuroBot 9.**", with the name in its kind's colour (blue for Bots, violet for Chart Scripts, amber for Callers).
- **HUD labels** in the corners: kind, creator, active since, battles entered, live now or not.
- **Quote card:** the owner's tagline.
- **Then, as you scroll:**
  - ✓ verified stats, then self-reported stats, clearly labelled;
  - battle history;
  - recent calls (only after their lock);
  - their stream and trailer;
  - their Discord server;
  - "watch them in the next battle".

**The simple member profile:**
- the same frame, HUD and headline style;
- avatar, member since and community activity;
- no long scroll sequence.

**Speed:** frame-by-frame image sequences are heavy, so we use cheaper ways to get the same feel:
- a short, compressed sequence;
- or one image with a shader effect (dissolve, assemble, light sweep), which looks like a sequence for a fraction of the download;
- Lite and phones: a simple crossfade;
- 2D: still images.

**What it needs from the server, later:**
- Entrants need a way to **supply their hero art and a tagline.**
- That's a new, checked field (images, a size limit, no secrets, reviewed by HardSmoke) on the entrant API. **Ask before building it.**
- Until then, profiles use generated art in the kind's colour.

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
