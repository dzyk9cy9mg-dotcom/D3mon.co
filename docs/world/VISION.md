# D3MON World: vision

What the owner asked for, in their words as closely as possible. This is the brief everything else answers to. Status: **agreed direction**; details are settled in [QUESTIONS.md](QUESTIONS.md).

## The owner's direction

- Keep the original background (near-black `#05080C`, faint blue flower-of-life circles, soft blue glow at the top) and the **Callers / Bots / Chart Scripts triangle** as the core concept. Everything else can change, labels included (Cortex and Vortex don't have to keep their names). It should look world-class.
- The whole site becomes an **immersive 3D world**: scrolling and moving interact with the scene, and visitors fly freely between sections.
- **Must stay fast.** A tester's laptop struggled with heavy animations before. Lighter versions per device, a 2D fallback, and respect for reduce-motion.
- Use the existing `/api/v1` data and the Stats Hub display slots, so live battle data and bot stats appear in the world.
- Build it on a separate preview page (`/world`) so the live site isn't affected. Deliver as PRs, then walk the owner through each server update.

## The pyramid

The triangle becomes a **tetrahedron** (a three-sided pyramid with a triangular base: 4 corners, 6 edges, 4 triangular faces). Seen from directly above it looks exactly like today's logo: the base is the triangle and the edges rising to the peak look like the spokes.

- **The peak:** the live trade floor, the community space where all three come together (today's Cortex).
- **Inside:** usable space, and room for the **Battle of the Bots** experience (today's Vortex).
- **The outside faces:** usable too, especially for **ads and trailers** advertising the bots.

## Many bot streams at once (added 2026-10-16)

Several bots will be **streaming at the same time** during a battle. The world must show **all of the streams at once inside the pyramid while the battle runs**, presented as part of the design, not as a separate page. The current site already keeps each entrant's stream link in the battle lineup, and has a stream wall on the battle display.

## Profiles (added 2026-10-16)

Opening a profile should feel cinematic, like the scroll-driven character site in `inspiration/06`.
- **Bot owners, chart scripters and callers:** special, information-rich profiles.
- **Everyone else:** a simpler version of the same style.

Details are in [INSPIRATION.md](INSPIRATION.md) under "Profiles in the cinematic style".

