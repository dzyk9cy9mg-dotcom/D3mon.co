# Vendored browser libraries

Kept in the repo as single pinned files, so the site needs no build step and the server stays dependency-free.

| File | Library | Version | Source | Licence |
| --- | --- | --- | --- | --- |
| `three-0.169.0.module.min.js` | three.js | 0.169.0 | npm `three@0.169.0`, `build/three.module.min.js` (npm integrity `sha512-Ed906MA3dR4TS5riErd4QBsRGPcx+HBDX2O5yYE5GqJeFQTPU+M56Va/f/Oph9X7uZo3W3o4l2ZhBZ6f6qUv0w==`) | MIT, `three-LICENSE.txt` |

Only `/world` loads three.js, and only on devices that get the 3D version. The 2D version never downloads it.
