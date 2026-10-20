# D3MON hero: brief for the visual team

What's in this folder is the live front page hero (`/next`), rendered from the site itself. Use it as the starting point for a better model and animation.

## The idea

**Three meet in one place.** D3MON is where **callers** (people who read the chart), **bots** and **chart scripts** each call Bitcoin up or down every 15 minutes, scored by Kalshi. The glass pyramid is that idea:

- Its three base corners are the three kinds.
- They rise to one gold tip, the **Capstone**, the paid room at the top.
- The light runs from each corner inward across the floor, up the middle, through the capstone and out of the top up a beam.

The feel is clean, luxurious and dark. Light is the only colour.

## The pieces

| Piece | What it is now | Colour |
| --- | --- | --- |
| The glass pyramid | A three-sided pyramid of clear glass. It turns slowly (one turn in 40 s), and each face is tinted between its two corners' colours and catches a sheen as it turns to the light | Edges blend between the corner colours |
| The corners | Glowing points. In turn, each sends a light inward across the floor to the heart, straight up the middle, flashing through the capstone and out of the top as a pulse up the beam | Callers amber `#FFB547`, bots blue `#4DA3FF`, chart scripts violet `#B98CFF` |
| The capstone | The top quarter of the pyramid is a separate **gold crystal** on a fine glowing seam: faceted, brightest at the tip, with a slow band of light rising through it. Pointed at, it lifts a little off the pyramid, with light through the gap | Gold `#E9C27A`, highlights `#FFF1CF` |
| The beam | A fine white beam rises from the tip, with pulses running up it | Warm white |
| The emblem on the floor | The Live Trade Cortex emblem from the original site lies flat on the pyramid's floor, inside it. Its triangle points at the pyramid's corners and turns with them, and its rings keep turning and tumble up from the floor | Blue, with the three colours on its triangle |
| The nodes' forms | Pointed at, each corner opens into a living form drawn in fine light: **callers** an iris of fibres dilating around a triangle pupil (reading the chart), **bots** a gyroscope of turning rings with points riding them (machine precision), **chart scripts** a Lissajous figure traced by a point of light (maths and signals) | The corner's colour |
| The wall | Big matte-black triangular blocks with deep sides, seen in perspective, forming a tunnel that opens around the pyramid. They breathe, push toward the pointer and ripple from a click | Near black, faint gold edges near the pointer |
| Behind the page | The original site's Flower of Life, faint, lit around the pointer | The three colours |

## Motion

- Slow and calm: the pyramid turns once in 40 s, and nothing snaps.
- It speeds up when the pointer is over the pyramid and slows almost to a stop over a corner, so it can be caught.
- On arrival, the forms open once and the capstone lifts (about 1.5 to 5.5 s), then settle back.

## Rules from the owner

- **Wanted:** the triangle as the symbol, the Flower of Life, gold and glass, and things that feel abstract but true to what they stand for.
- **Avoid:** words floating in the scene, five-point stars or hexagrams, busy particles or specks, anything cartoonish.

## Files

| File | Use it for |
| --- | --- |
| `d3mon-pyramid-clean-4k.jpg` | The hero without words, 3840 × 2160: the best input |
| `d3mon-pyramid-square.jpg` | Close-up of the pyramid, 2080 × 2080 |
| `d3mon-forms-open-square.jpg` | The same close-up with the three forms open and the capstone lifted |
| `d3mon-hero-4k.jpg` | The page as visitors see it, with the words |
| `d3mon-pyramid-hero-1080p.mp4` | 24 s of the pyramid turning, smooth 30 fps, 1920 × 1080, no words |
| `d3mon-pyramid-square-1080.mp4` | The same, cropped square 1080 × 1080 |
| `d3mon-opening-1080p.mp4` | The first 7.5 s: the blocks slide in, the forms open, the capstone lifts |
| `d3mon-pyramid-transparent.webm` | **The pyramid alone, no background** (transparent VP9), 16 s, 1080 × 1080 |
| `d3mon-pyramid-transparent.png` | One frame of it, transparent PNG |
| `d3mon-pyramid-isolated-black.mp4` | The pyramid alone on pure black, for tools that can't read transparency (use Screen or Add blending) |
| `d3mon-pyramid-transparent.mov` | ProRes 4444 with transparency, for editors. Too large for the repo (about 200 MB), so it's sent separately |

Earlier references the owner liked are in `docs/world/INSPIRATION.md` and `docs/world/inspiration/`.
