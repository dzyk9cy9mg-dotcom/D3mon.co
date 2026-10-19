# D3MON World: the new look (concept v2, 2026-10-19)

Concept stills for the 3D redesign, made before building anything. **Nothing here is on the live site.** The owner asked for no live changes and no pull request for the redesign until they say "go".

## Where things stand

- The owner reviewed the first concept (the review artifact at https://claude.ai/artifact/VgX5YvbeiyVmYZBTw42N8E: stills, the full three.js source and a 6-second glide) and asked for these stills, blending it with their references.
- **The four stills are in [`stills/`](stills/):** `v2-hero.jpg` (the front page), `v2-close.jpg` (through the glass), `v2-crystal.jpg` (the crystal tip, the VIP Room) and `v2-hall.jpg` (the Grand Hall's screens). They were shown to the owner, who hasn't approved them or said "go" yet.
- **Round 2 (2026-10-19), `stills/v3-*.jpg`:** after a design check with the UI UX Pro Max skill (`.claude/skills/ui-ux-pro-max/`), the owner agreed: the crystal's light is a plain soft glow (no rays, nothing star-like); fewer, bigger screens inside the pyramid (5, one layer) and in the hall (4 behind); bigger labels on every screen; a darker backing behind the menu so the beam can't wash it out; no comet trail across the D3MON title; the top-right button is **Join D3MON** and the front page's one button is **Enter the Grand Hall**, with a **Skip the intro →** link beside it. The v2 stills are kept for comparison.
- **Next:** the owner's feedback on the v3 stills, then the build plan below, one step and one pull request at a time.

## What the owner wants in the look

From the first concept, keep:
- real glass (MeshPhysicalMaterial with transmission, iridescence and clearcoat);
- light that glows only where it's truly lit;
- a mirrored black floor with the Flower of Life engraved in light;
- the chrome D3MON wordmark with a gold 3;
- frosted-glass UI: nav pills, a live ticker bar, labels;
- the Grand Hall's frosted screens in thin frames, one big number each.

Blended with the owner's references (`docs/world/inspiration/`, mainly `00-shape-reference` and the 10118 video frames):
- clear, cool, blue-tinted glass;
- neon edges by corner: **amber at the back, blue on the left, violet on the right**, each running to white at the top;
- a **white-blue crystal capstone** with light bursting from it, and a laser out of the top;
- **layered holographic screens** (charts, code, maths);
- metal only as thin chrome or gold detail, never the main colour.

**Stars are fine.** The owner liked the sky's specks of light from the first concept, and they're kept. What the owner doesn't want is **five-point star shapes**, or anything shaped like them. Dust and sparks are fine too.

Known flaws to keep fixed:
- the first concept's core washed the glass milky; keep the core tight;
- a low bloom threshold, or bright additive lines, washes the whole scene out.

Two questions for the owner on these stills:
1. Does the crystal's light burst still read too much like a star? It could be a plain glow instead.
2. Are the screens inside the pyramid too busy?

The comet trails are beads of light; smooth streaks are an option.

## How the stills are made

Uses only the three.js 0.169.0 files vendored in `public/vendor/`; no new dependencies.

- Studio reflections built in code with `PMREMGenerator.fromScene`.
- Emissive or colour values above 1, with `UnrealBloomPass` threshold 1.0, so only lit parts glow.
- ACES tone mapping.
- A mirrored copy of the pyramid under a semi-transparent floor, which fades out at its edge.
- A vignette and grain pass.
- Screens behind the glass are drawn as cut-out lines (`alphaTest`), because three.js's transmission doesn't show transparent objects through glass.
- `?shot=` is one of `hero`, `close`, `crystal` or `hall`.

To render them again:

```sh
sh docs/world/concept-v2/fetch-fonts.sh      # once: Syncopate, Manrope, IBM Plex Mono into fonts/ (git-ignored)
node docs/world/concept-v2/render.mjs <out folder> hero close crystal hall
```

`render.mjs` serves the repo, opens `index.html` in headless Chromium with SwiftShader (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) and saves a 1600×1000 PNG per shot. For a video, render frames and join them with ffmpeg.

## The build plan, once the look is approved

One step at a time, each its own pull request:

1. Film-style lighting.
2. A hero that hits: text off the pyramid, one button.
3. Fix the crystal interior shot.
4. Screens readable across the room.
5. House bots, so the hall never looks empty (real calls, clearly named).
6. One front door: d3mon.co opens into the world.
7. The 2D sections redesigned in the same identity.

Keep throughout:
- no camera spin;
- reduce-motion support;
- Auto dropping to 2D on slow devices;
- all tests passing (`npm test`).

## Also for the design (owner, 2026-10-19)

- **A crowd vote every round:** an Up/Down button next to the round clock, only for people in the chat (the site's chat or the linked D3MON Discord). The results are shown to encourage taking part: the split during the round, then how the crowd did. See the backlog in `CLAUDE.md`.
- **Voice, video and streaming:** the owner expects about 200 people soon, with about 20 on video and the rest in text and voice.
  - Peer-to-peer can't carry that; it needs a media server.
  - The recommendation, which the owner hasn't decided yet, is to **use the D3MON Discord for voice and video now** (it's free, and about 25 people can be on camera at once), then build D3MON's own rooms on a self-hosted LiveKit server on a second Lightsail server.
  - Rough costs for one busy hour with 200 people (October 2026 public prices): Discord free; our own LiveKit server about $10–15, mostly traffic at $0.09/GB; LiveKit Cloud about $6 plus traffic; Daily about $48 with video.
  - Design the rooms into the world either way.
- The owner installed the **UI UX Pro Max** skill; the next session should use it for the 2D parts (menus, buttons, type, spacing, phones).
