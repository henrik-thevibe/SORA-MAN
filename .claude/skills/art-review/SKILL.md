---
name: art-review
description: Render and inspect Astra-Man's pixel art (characters, ghosts, pickups, mazes) close up. Use when asked to review, compare or check sprites, animation frames or maze artwork, or after changing character-art.js, item-art.js or art.js.
---

# Review the pixel art

The art is procedural: `character-art.js` builds 32 × 32 colour grids, `item-art.js` builds the pickups and `art.js` caches them as canvases and draws the mazes. There are two ways to see it.

## A. In the browser (always available)
1. Start the `astra-man` preview from `.claude/launch.json` and wait for the title screen.
2. Draw sprite sheets on an overlay canvas with the page's own renderer:
   ```js
   const c = document.createElement("canvas"); c.width = 800; c.height = 600; c.id = "review";
   Object.assign(c.style, { position: "fixed", left: 0, top: 0, zIndex: 9999, imageRendering: "pixelated" });
   document.body.append(c); const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
   x.fillStyle = "#000"; x.fillRect(0, 0, 800, 600);
   for (let d = 0; d < 4; d++) x.drawImage(PacmanArt.sprite("pacman", { skin: "nova", direction: d, frame: 2 }), 10 + d * 130, 10, 128, 128);
   ```
   Useful sprite kinds:
   - `pacman` and `death`, with `skin` `astra` or `nova`;
   - `ghost`, with `id` and `state` (`CHASE`, `FRIGHTENED`, `WARNING` or `EATEN`);
   - `chip`, `gpu` and `bonus` (with `name`).

   A maze is `PacmanArt.mazeLayer(false, color, PacmanEngine.findMap(id))`.
3. To magnify part of the live game, copy a region of `#screen` onto an overlay scaled 3–4×. For a still frame, use `pacmanDebug.hold(true)` and `pacmanDebug.step(n)`.
4. The pane's screenshots can lag one frame. Take a second screenshot if the first one shows the previous state. Remove the overlay (`document.getElementById("review").remove()`) when done.

## B. Offline sheets (needs `@napi-rs/canvas`)
Run `node scripts/render-art-review.js`. It writes `outputs/astra-sprite-review.png`, `outputs/astra-eye-detail.png` and `outputs/items-review.png`. Open them with the Read tool.

## What to check
- Frames stay inside the 2–29 pixel margin.
- There are no detached pixels.
- Silhouettes are the same across frightened and warning states.
- Astra's eye stays on top when she faces left, and Nova's bow sits on her head in every direction.
- Colours read against black and the neon glow.

After art changes, run `node tests/art.test.js`, which checks margins, frame counts and the Nova rules.
