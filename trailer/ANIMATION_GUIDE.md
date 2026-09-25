# SORA-MAN trailer: animation guide

> **What's in the public repository:** the pipeline's source and documentation only. The painted cast renders (`assets/cast/`), captured footage, rendered frames and the finished video (`out/`) are not included, and neither is `node_modules/`.
>
> - `capture/`, `audio/score.mjs` and `render.mjs` regenerate everything under `out/` from the game.
> - `assets/cast/` held four concept renders cut by `tools/prep-cast.py`, used only by the retired `TR.cast.ghost`. No shot uses them, and nothing preloads them any more, so the studio runs without them.

The look is 80s arcade cabinet art: halftone dots, starburst badges, tilted callout boxes, stacked colour extrusions on the type, and black fields with neon maze lines. It takes that style from the posters in `../../posters/` but none of their branding. The motion follows the Claude animation base: every frame is a pure function of `t`, the edit is on the beat, and contact sheets are used for self-review.

## Pipeline
```bash
npm install                                 # playwright + p5.brush (Chrome is used via channel "chrome")
node capture/capture.mjs                    # real gameplay -> out/clips/<clip>/*.png + meta.json
node capture/sprites.mjs                    # the game's pixel sprites, GPU chip and power-up chips -> out/sprites/
node render.mjs --heroes                    # review sheet: 64px hero sprites beside the in-game 32px ones
node audio/score.mjs                        # music + SFX -> out/trailer.wav
node render.mjs --at=15,40,60               # stills to out/snaps/ for review
node render.mjs --workers=4                 # every frame -> out/frames/ (resumable)
node render.mjs --contact                   # 1 frame/s contact sheets
node render.mjs --encode [--draft]          # -> out/sora-man-trailer.mp4
```
To preview it, serve `sol/` (`python -m http.server 8765` in `sol/`) and open `/trailer/studio.html?t=15`.

## Rules
- **Determinism.** Draw code may only use `t`, `TR.hash` and the seeded plates. Never use `Math.random` or wall-clock time.
- **Footage is real.** `capture.mjs` holds the game clock (`pacmanDebug.hold`) and steps the fixed 60 Hz sim twice per 30 fps frame. The autopilot (`capture/autopilot.js`) steers, following a `route` of tiles or charging a ghost (`chase`) when a clip asks for it.
- **Staging** (`capture/stage.js`) only uses the public `game` object. It can:
  - place Sora and ghosts, and hold the rest in the house
  - spawn pickups
  - skip READY
  - apply invisible, unlabelled speed statuses (`trailer-slow` / `trailer-fast`)
  - disable death (`immortal`)
  - fast-forward the Versus clock and the Sunset chain counter, and pin the Sunset glitch just under Sora

  The game source is never modified. Every clip's `meta.json` records events plus per-frame player and ghost positions and the glitch line (`track`).
- **Events on beats.** A segment says "clip frame `f` is on screen at time `at`". Pick `at` on a beat and `f` at an event from `meta.json` (`ghostEaten`, `powerUp`, `chain`…). Cards and SFX read the same events, so picture, cards and sound stay locked together.
- **Transitions** are in `TIMELINE.TRANSITIONS` and composited in `main.js` from two offscreen shots:
  - **chomp:** a giant pixel Sora eats the old scene
  - **iris:** closes on one focus, opens on another
  - **glitch:** a block dissolve with slices and noise

  Inside shots, the hunters iris between ghosts, footage whips in, and cards exit with `TR.exit` (scale-out). Nothing just vanishes.
- **Slow motion** uses `ramp()` segments with varying `speed`. `TIMELINE.SLOWMO` drives both the ◀◀ SLOW-MO tag and the music dip in `score.mjs`.
- **Power-up showcases** (`TIMELINE.SHOWCASES`) are two bars each on one continuous screen. Bar 1 is the setup: a held beat, then the approach timed so the pickup lands on the bar line. Bar 2 plays on from the pickup, 0.4× through the impact, while the camera pushes in. `TIMELINE.MONTAGE` whips four more past at half a bar each.
- **Title-safe labels.** Keep every label inside the frame with a margin of about 54 px. Callouts flip sides near an edge; place badges and words so they never overlap a title or the cabinet.
- **Pixel art stays pixel-exact.** Footage and every character draw with smoothing off. Only the backgrounds (plates, sunbursts) are painterly.

## Palette (`TR.PAL`)
Ink `#0a0a14` · gold `#ffd21f` · deep gold `#f29a12` · poster red `#e8352b` · neon blue `#2a4fff` · cyan `#35e7eb` · pink `#ff6fb5` · glitch magenta `#ff2bd6` · cream `#fff3d6`. The cast colours come from the master renders: Claude `#e8673c`, Muse `#ffd8c2`, Grok `#1b1b22`, Gemini rainbow.

### Scene hues (revision 3)
Never swap the happy hues for navy or black. For contrast, darken the scene's own hue: Sora gold `#6e3c00`/`#9a5a00` and `#7a4200`/`#a86400`, game blue `#0e1f8a`/`#1a34c0`, sunset `#5a0e3a`/`#8a2438`, remix `#2e0c5c`/`#4a1590`. Draw them over the neutral `rays-white` texture, and put a glow or a local `shade()` behind characters and footage. Sora's own palette (the terminal and badges) comes from `backdrops.js` astra: `#ffd31a`, `#e0a812`, `#fff27a`, `#3a2606`.

### Post pass and motion
- `main.js` draws the picture, then applies bloom, grade, aberration on `TIMELINE.PUNCH` hits, vignette, grain and the letterbox (open only).
- Motion blur applies only inside `TIMELINE.BLUR` windows. Add a window whenever you add a fast move.
- The pre-drop hush (`TIMELINE.DROP_HUSH`) is gated in the score as well as blacked out in the picture. Keep the two in step.

### Visual language (revision 4, `src/fx.js`)
- **Point at the action.** Gameplay segments carry `callouts: { you, trail, ring: [ghostIds], item, tags, glitch }`. `F.screen`'s `overlay` hook passes `map(px, py)` (capture pixels to screen space), so callouts follow zoom and rotation exactly. Item positions come from `track` extras (`it`).
- **Stickers** fire from footage events (`TR.fx.STICKER`), rationed to the first of each kind per shot and at least two bars apart. They sit beside the action, never on it.
- **Impacts** go in `TIMELINE.IMPACTS`, which drives both the screen shake and the chromatic punch. Add a moment there rather than hand-shaking a shot.
- **Pellets are always the game's sprites** (`chip`, `gpu`); never draw generic dots.
- **Type:** AstraTitle for headlines, Impact for supporting lines, tags and stickers, and Crackman only for diegetic text (terminal, DELETE PENDING, tribute). One headline group plus one supporting line at a time.

## Type
- Display type is **Crackman** (`AstraTitle`, the game's title font), drawn with `posterText`: a black keyline plus 1–2 offset colour extrusions.
- Sub-lines use Impact via `label`, with a black keyline.
- Terminal and tribute lines use Crackman with wide letter-spacing via `mono`.

## Characters: all pixel art, consistent with the game
- **Hero sprites (64×64)** come from `src/hero-art.js`, a port of the game's mask painter in `../character-art.js`. It uses the same shapes, palettes and shading rules in the game's 32-pixel design space, sampled twice as finely.
  - Frames: Sora chomp 0–3 (plus left-facing) and `sora-glint`; each ghost's skirt or arm 0–3, blink, left-facing and frightened blue.
  - Drawn with `TR.cast.hero(ctx, key, x, y, scale, { dim, glow, squash })`. `TR.cast.heroFrame` picks animated frames.
- **In-game sprites (32×32)** are exported straight from the game via `TR.cast.sprite`. They include the GPU chip and the power-up chips.
- The old painted Sora (`TR.cast.sora`) and the glossy renders (`TR.cast.ghost`) stay in `cast.js`, but no shot uses them.

## Painted plates
`src/plates.js` paints them once at load with p5.brush in a single WEBGL canvas, seeded so every render gets identical paint:
- sunburst washes, used as a multiply texture over crisp vector rays
- the classic maze in marker strokes
- watercolour splats

## Tone
Cheerful and loud all the way to the chase, then one honest, quiet beat for Sora, then the slam. The disclaimer stays on the end card: *unofficial fan tribute, not affiliated with or endorsed by OpenAI*.
