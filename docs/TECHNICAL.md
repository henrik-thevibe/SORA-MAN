# SORA-MAN · AI Arcade

*For Sora, 2024.02.15 – 2026.09.24.* SORA-MAN was released on the day Sora's API shut down. Its hero, a gold cloud with star eyes, was always Sora. Sora started as a research preview on "video generation models as world simulators" and ended with a sunset export page. The game carries a few quiet nods to that history:
- The boot screen denoises instead of loading.
- The second intermission opens a vault of 200+ licensed characters, then the deal closes.
- The third replays March 2026: NEW FEATURES! → SAFETY BUILT IN → DEPRECATED.
- Endless mode is now SUNSET, a climb away from permanent deletion.
- The ending card reads THE PRODUCT MAY BE OFFLINE. / BUT NOTHING IS EVER REALLY GONE.

> **Unofficial fan tribute. Not affiliated with, endorsed by or sponsored by OpenAI.** "Sora" is used only to refer to OpenAI's discontinued video model. There are no OpenAI or Sora logos, and no real people or licensed characters.

Internally the project still uses its old codename **Astra**: module names, `astra-*` save keys and the `astra` skin id. This keeps existing saves, high scores and score codes working.

A build-free browser game starring Sora, Claude, Muse, Grok and Gemini, with a fixed 60 Hz engine, the arcade-exact classic maze, three new mazes and a maze editor.

Open `index.html` directly, or serve this directory:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then visit http://127.0.0.1:8765/.

**Title menu.** On the title screen any direction keys, the touch D-pad or a gamepad move a cursor over PLAY, MODE, MAZE and PROFILE. Above the menu, Sora tries on each accessory in turn. Up and down pick a row; left and right switch PLAY between SOLO and LOCAL MULTIPLAYER or change the mode or maze; **Enter**, START or **A** activates it. Tapping a row picks and activates it. While PLAY is chosen, a card explains the goal and who uses which keys; while MODE is chosen, it explains the mode.

Controls: **Enter / Space** starts or resumes; **arrows / WASD** move; **P / Escape** pauses (only Enter, a gamepad's Start or the RESUME button resumes); the **MENU** button or **Backspace** pauses a run, and pressed again while paused or after a game over (or a gamepad's **Select** while paused) returns to the title. Quitting a run pays XP and credits for its score (without the flat bonus a finished game earns), shown above Claude chasing Astra; any button skips it; **G** picks the game mode, **N** the maze and **U** opens the profile on the title screen; **M** toggles sound; **-** and **=** set the volume; **V** cycles the visuals; **R** forces reduced motion (otherwise the system setting applies); the **GRAPHICS** button offers both settings to touch and mouse players; **F** toggles fullscreen; **B** opens the backdrop picker. The pause screen lists these options and, in multiplayer, each seat's keys. The buttons also work with keyboard focus. Leaving the game pauses it; returning requires an explicit resume. Score and sound preferences are saved locally when browser storage is available.

### Local multiplayer (desktop only)

Up to four players share one screen. There is no online play. Multiplayer needs a desktop with a keyboard or gamepads; on a phone or tablet the PLAY row says so, and Versus seats one touch player against three bots.

- **Lobby.** Pick LOCAL MULTIPLAYER on the PLAY row (every Versus match also goes through the lobby). Each player presses a direction (or **A**) on their own device to take the next free seat, from P1 up.
- **Ready-up.** Each player presses all four of their directions (proving the keys work), then their **ACTION** key. When every human is ready, a 3-second countdown starts; any join, leave, un-ready, disconnect or setting change cancels it. Bots never ready up.
- **Leaving.** A gamepad leaves with **B**; a keyboard player holds their ACTION key for a second. **Esc** or **Backspace** closes the lobby.
- **One device, one seat.** In a multiplayer match only a seat's own device steers it. Solo games still accept any device.
- **Controllers.** If a seated gamepad disconnects, the match pauses. The same pad reconnecting (at any index) takes its seat back; any other unseated device can take over by pressing ACTION. Connecting a pad never changes the player count.
- **Rematch.** After the results (at least 1.2 seconds), ACTION or **Enter** returns to the lobby with the same seats, and everyone confirms again; **B** or **Esc** goes to the title.

| Seat | Character | Keyboard | Action |
|---|---|---|---|
| P1 | Sora (gold) | Arrows | `/`, `.` or right Shift |
| P2 | Nova (rose, gold bow) | WASD | Q, E or left Shift |
| P3 | Vega (cyan, cool shades) | IJKL | U or O |
| P4 | Lyra (green, leaf crest) | Number pad 8 4 5 6 | Number pad 0, 7 or 9 |

Seats follow join order, so any device can take any seat; gamepads use the D-pad or stick and **A**. Keys are matched by position, so WASD also works on AZERTY keyboards. Three or four players on one keyboard may miss key combinations (the lobby warns); gamepads are recommended.

The team shares one pool of lives: 5 for two players, 6 for three and 7 for four. If one player is caught while another survives, play continues and the fallen player respawns after 3 seconds at the start slot farthest from the ghosts, blinking and ghost-immune for 2 seconds, as long as a spare life remains. Each ghost chases the nearest player it can hurt. P1–P4 tags show above the stars at each round start, each respawn and while paused, and the HUD names each column. Co-op games end on a results panel with every player's score. High scores are kept per mode and player count (Classic 3P and 4P have their own keys).

The game retains its 224 × 288 logical coordinates and eight-unit tiles, rendered into a 448 × 576 backing canvas. Characters use 32 × 32 frames with at most 28 × 28 visible pixels, occupying the same 16 × 16 logical footprint as before. Windowed and fullscreen views use integer device-pixel enlargement when space permits and nearest-neighbor fitting in smaller windows.

### Boot screen

`loader.js` shows a gold boot screen, modelled on freepacman.org. The game loads, the title font arrives and the maze and sprite caches warm up behind **PRESS ANY KEY** (TAP TO BOOT on touch). Browsers only allow sound after a gesture, so that press creates the audio context; the boot then plays with sound every time. Astra chomps across a row of GPU chips (a 3.2 s sweep), the bar reaches ONLINE, and the two gold covers part through the title sting, finishing as the boot sound ends (6.25 s after the press); the menu loop fades in under its tail. `boot-timeline.js` holds these times and the chip positions, and the boot sound (`bootIntro`) is generated from the same file, so every chomp lands on a chip. A second press skips straight to the title with the sting. The boot screen keeps key presses from reaching the game until the covers open. If the game never reports in, it opens anyway after 10 s. With reduced motion the covers fade over the same span instead of sliding; the bar still moves, because it shows the boot sound's progress. `AstraLoader.skip()` opens straight onto the title, silently (the test fixtures use it). Every script URL is versioned so that a stale cached module cannot mix with new ones.

### Arcade rules

- **Speeds** follow the arcade table as percentages of 75.76 px/s: Pac-Man 80/90/100/90% (levels 1, 2–4, 5–20, 21+), faster while ghosts are frightened, and never slowed in the tunnel. Eating costs a one-frame stall per dot and three per energizer; there is no separate slower speed on dot tiles.
- **Cornering:** a perpendicular turn can start anywhere within half a tile of the turn tile's center, before or after it. Astra cuts the corner diagonally and eats that corner's dot. Ghosts cannot corner.
- **Ghost-eat pause:** eating a ghost freezes play for 1 s. Astra and the eaten ghost are hidden behind the cyan score, and all timers hold. Eyes already heading home keep moving. Only one ghost is eaten per pause.
- **Cruise Elroy** uses the per-level dot thresholds and speeds. After a death it waits until Clyde has left the house.
- **Fright times** follow the per-level table (6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1 s, then none). An energizer still reverses the ghosts when the fright time is zero.
- **Bonus items** appear below the house at 70 and 170 dots eaten and stay for 9.5 s. Their pink score shows for 2 s.

### Game modes

Press **G** on the title screen to pick a mode (Benchmark Run is hidden from the list and only reachable with `#mode=benchmark`); the choice is saved under `astra-mode-v1`, and `index.html#mode=<id>` also works. Each mode keeps its own solo and co-op high scores.

| Mode | Rules |
|---|---|
| **CLASSIC** | The arcade rules, unchanged. |
| **BENCHMARK RUN** | Championship Edition-style time attack; see below. |
| **REMIX** | Classic rules plus power-ups, character skills and two new ghost brains. |
| **SUNSET** | Pac-Man 256-style endless upward climb away from a rising glitch (DELETE PENDING). Internal id `hallucination`. |
| **VERSUS ARENA** | Party Royale-style battle for four, with bots in empty seats. |

**Benchmark Run**
- **Clock.** You have 5 minutes, and the clock runs only during play. When time is up, or the last life is lost, a results screen charts points from dots, ghosts and bonuses, then shows the total, each player's score and your best. Enter starts another run.
- **Swapping halves.** The maze is split down the middle. Clear one half and a bonus appears on the other; eating it swaps a new layout into the cleared half, full of fresh dots, and changes the wall colour. There are four half designs (the classic's left half, *lanes*, *racks* and *steps*), and any left half fits any right half.
- **Speed.** It rises 4.5% for every 5,000 points, up to +45%. Getting caught drops it two steps.
- **Dots.** They are worth 10 points, rising by 10 every 60 dots up to 50, and reset when you are caught.
- **Ghosts.** A chain of eaten ghosts is worth 400, 800, 1,200 … up to 3,200, and keeps climbing through fresh power pellets. The ghost-eat pause is shorter, ghosts don't reverse when they switch between scatter and chase, and there is no arcade fruit and no Cruise Elroy.
- **Extra lives.** One every 20,000 points.

**Remix**
- **Power-ups.** A random one appears every 40 dots, at least 7 tiles from the players, and lasts 10 seconds on the board.

  | Power-up | Effect (6 s unless noted) |
  |---|---|
  | **TOKEN BEAM** (5 s) | A beam fires ahead to the next wall and sends ghosts in it home. |
  | **RATE LIMIT** | Every ghost slows to 45%. They can still catch you. |
  | **CONTEXT OVERFLOW** | The next ghost to touch you, or the timer running out, sets off a blast that sends nearby ghosts home. |
  | **SCALE UP** | You grow and flatten any ghost you touch. |
  | **RAG** | Pulls in every dot and pickup within about 2.5 tiles. |
  | **HOT PATH** | Leaves a burning trail; ghosts touching it go home. |
  | **INCOGNITO** | Ghosts lose track of you and pass through you. |

- **New ghost brains.**
  - Muse becomes a *charger*: she ambushes as usual but rushes at 155% down any clear line of sight, shown with a red `!`.
  - Grok becomes a *sleeper*: he drifts at half speed with a `Z` until someone comes within six tiles, then hunts for six seconds.
- **Skills.** Each character has a skill with a charge bar under their score.
  - Astra's **Star Dash** gives a burst of speed and recharges in 5 s. Her keys are `/`, `.` or right Shift.
  - Nova's **Supernova** stuns ghosts within 4.5 tiles and recharges in 8 s. Her keys are `Q`, `E` or left Shift.
  - Vega's **Pulse Shield** blocks one catch for 1.6 s and recharges in 9 s, on `U` or `O`.
  - Lyra's **Vine Snare** slows ghosts within five tiles for 3 s and recharges in 7 s, on number pad 0, 7 or 9.
  - In solo, any of those keys triggers Astra's skill.
  - In co-op, when any two players fire their skills within 0.75 s, they link with **Constellation**. For 4 seconds a beam between them sends home every ghost that crosses it.

**Endless** (id `hallucination`)
- **The climb.** The maze scrolls upward forever, built from generated chunks that never have dead ends, and a glitch climbs from below.
  - Anything the glitch touches is gone: players, ghosts and pickups.
  - It speeds up with distance, and much faster in co-op when players spread more than 14 rows apart.
- **Ghosts and pickups.**
  - There is no ghost house. Ghosts arrive with new rows, and eaten ghosts vanish.
  - The mix grows as you climb: Claude chasers, then Grok sleepers, Muse chargers, and Gemini *divers*, which always drop downward.
  - Power-ups appear from your three-slot **loadout**, set in the profile.
- **Dot chains.**
  - Eating dots back to back builds a chain, which pays out at 16, 32, 64 and 128.
  - A 256 chain clears the screen.
- **Co-op.** A fallen player leaves a revive token for a partner to collect, if a life is spare.
- **Scoring.** Every row climbed scores 10 points, and the results show the distance and the best chain.

**Versus Arena**
- **Seats.** Four contestants always play: humans join in the lobby and bots fill the empty seats. Bots come in EASY, NORMAL (default) and HARD, chosen in the lobby with **[** / **]** or LB/RB (tap the line on touch). Difficulty changes only how bots decide (how quickly they react, how often they slip, how far they notice threats, how they flee, how long they stick to a plan, whether they lead a target), never speeds or rules.
- **Bots always have a plan.** Each bot hunts one rival at a time and sticks with it while it's a valid target, so what it's doing shows on screen:
  - A spirit hunts the nearest rival it can tag. If nobody can be tagged yet, it shadows the nearest live rival.
  - An energised bot hunts the nearest rival it can eat.
  - A bot carrying an injection runs it to the nearest rival.
  - Otherwise, a bot flees threats, chases the runaway pellet once it's fast enough, or eats dots for speed.
  - When none of these gives it a move, it keeps running along the corridor instead of stopping. Tools can reuse the same brain as `AstraModes.versusBot(game, player)`.
- **Speed and the runaway pellet.** Dots build speed. The power pellet runs away, and only a player with enough speed (the notch on their bar) can catch it. Catching it energises you to eat rivals and ghosts.
- **Spirits.** An eaten player becomes a spirit in their own colours, who can't eat, and tags a live player to swap back.
- **The three arena ghosts.**
  - **Claude** turns you into a spirit.
  - **Muse** gives a BUG for 5 seconds: inverted controls, slowed, bait (anyone can eat you) or muzzled (can't eat).
  - **Gemini** plants a **Prompt Injection** that you must pass on by touch before it goes off.
- **The closing arena and the win.**
  - From 75 seconds the edges glitch shut, one ring at a time, down to the largest central region that still holds a loop of corridor (never a dead-end strip). A ring never closes if it would eliminate everyone still standing at once. Bots steer clear.
  - The last live star can't be turned into a spirit by Claude or an injection, and if the last star is eliminated the spirits re-form as stars, so the arena never stalls with nobody to tag.
  - Tuning (round length, closing schedule, boost, runner timing, Claude's speed) is data on the ruleset (`tuning`).
  - The last star standing wins; otherwise, after two minutes, players still standing outrank spirits, then eliminated players, then points.

**Daily run.** Not reachable from the title any more; `Meta.daily()` and the score codes remain in [meta.js](../meta.js).
- **Same for everyone.** Each UTC day picks one mode (Benchmark Run, Remix or Endless), a maze and a seed, so everyone plays the same game.
- **Shared tools.** Daily power-ups ignore your unlocks.
- **Score code.** The results show a checksummed score code (for example `AM1-20260924-H1-3CB-M54Z`). **C** copies it. The check catches typos and casual edits; it isn't tamper-proof.

**Profile and progression.** [meta.js](../meta.js) keeps a profile in browser storage (`astra-profile-v1`).
- **XP and credits.** Every finished game pays XP and compute credits (CR). Levels need 400 XP, then 200 more for each level after.
- **The profile screen** (**U**, or the PROFILE row on the title) has three tabs:
  - **Wardrobe:** any character can wear any accessory. There are seven: bow, cool shades, leaf crest, antenna, headphones, halo and crown. The crown and halo sit tilted 45 degrees back along the head. Some need credits or a level. Accessories are worn by the head and turn with it, like Ms. Pac-Man's bow: facing left mirrors them, and facing up or down rotates them with the body. The preview turns through all four facings. `tools/accessory-review.html` shows every piece in every direction.
  - **Power-ups:** unlock Context Overflow, Hot Path and Incognito for Remix, and choose the Endless loadout.
  - **Achievements:** eighteen of them, with credit rewards, earned the moment they happen.
- **Controls.** The screen works with the keyboard, the touch pad and gamepads.

**Gamepads.** Each connected pad drives the player in its slot:
- **D-pad or left stick:** move.
- **A:** skill in play, select in menus.
- **B:** back.
- **Start:** play with as many players as there are pads, or pause.
- **Select:** profile.
- **LB and RB:** change the mode and the maze.

**Frameworks for new content.** Game modes and their content are registered with the engine; none of it is written into the engine itself. `engine.js` documents every hook above its registries. `modes.js` holds all the current content and is the worked example.

- **Rulesets** (game modes) and reusable **mutators** plug into fixed hook points. Some hooks are notifications, such as `onTick`, `onPellet` and `onDeath`. Others change values, such as `pelletValue`, `speedScale`, `collision` and `mapForLevel`.
- **Statuses** are timed effects on players or ghosts.
- **Power-ups** are pickups that apply a status.
- **Ghost brains** control targeting, direction choice and speed.
- **Skills** are abilities on a cooldown.
- **Pickups** and all randomness are seeded, so modes replay exactly.
- With nothing registered every hook passes its value through unchanged. A four-minute scripted comparison against the previous engine matched sample for sample in solo, co-op and two new mazes.

`overlays.js` draws the gameplay information these add, such as pickups, beams, flames, ghost marks, the mode HUD and results, even in Purist mode.

### Mazes

Press **N** on the title screen to choose a maze. The choice is saved under `astra-maze-v1`.

| Maze | Pellets | What it plays like |
|---|---|---|
| **CLASSIC** | 244 | The arcade original. Its rules, timings and artwork are unchanged. |
| **NEURAL NET** | 304 | A dense lattice of junctions around the ghost house, with one tunnel. |
| **SERVER ROOM** | 294 | Rows of racks with long straight aisles and two tunnels, played in the dark. |
| **ASTRA** | 289 | Astra's name spelled in dots across the top, like the Google Doodle's logo maze. |
| **ALL MAZES** | — | Plays the mazes in turn, one per level. |

On non-classic mazes the maze's name shows before READY!. A bundled maze can also be opened directly with `index.html#maze=<id>`, for example `#maze=server`.

**Defining a maze.** Each maze is 28 × 31 tiles and lives as plain rows in [maps.js](../maps.js):

| Tile | Meaning |
|---|---|
| `.` | Dot |
| `P` | Power pellet |
| (space) | Empty corridor |
| `--` | Ghost-house gate |
| `SS` | Player start |
| any other symbol | Wall |

The rest comes from the gate:
- The ghost house is the 8 × 5 pen around the gate.
- The ghost starts, home tile and exit row are derived from the pen.
- The bonus item appears on the row below the pen.

Two further rules:
- Tunnels are the rows whose two edge tiles are both reachable.
- Enclosed pockets count as wall.

Fruit timing and the siren pace scale with the maze's dot count, so the arcade's 70/170 and siren thresholds still hold proportionally.

**Validation.** `analyzeMap` in [engine.js](../engine.js) checks every maze against the arcade rules:
- The size is 28 × 31.
- The pen is sealed.
- The gate and start are laid out correctly.
- Every pellet is reachable.
- Every tunnel is open at both ends.
- The corridor above the gate and the bonus spot are reachable, as are both co-op starts.
- There are **no dead ends**.

It also warns about 2 × 2 open areas and about any count of power pellets other than four.

**Editor.** [tools/maze-editor.html](../tools/maze-editor.html) paints walls, dots, power pellets, empty tiles, the house and the start.
- It has mirroring, undo, a live rule check that outlines problem tiles, and a game-accurate preview.
- **Play in the game** opens the maze through a share link: `index.html#map=<code>&name=<title>&wall=<rrggbb>`. The code is run-length encoded, about 500 characters.
- A broken link falls back to the saved maze and shows a notice on the title screen.
- **Copy for maps.js** produces an entry ready to paste into the bundled list.
- Like the game, it needs no build step and runs from the folder or any static server.

### Visuals

`effects.js` adds presentation-only "juice". It reads the engine's state and events and never changes them, so play stays deterministic. Press **V** to cycle between three modes; the choice is saved under `astra-visuals-v1`, and the pause screen shows the current one.

| Mode | What you see |
|---|---|
| **JUICY** (default) | All of the effects below. |
| **JUICY + CRT** | The same, plus scanlines and a vignette. |
| **PURIST** | The plain arcade look. |

**Light and colour**
- The walls glow like neon.
- Every character lights the maze in its own colour, as in Championship Edition, and power pellets pulse.
- From level 2 each maze's wall colour shifts hue every level.

**Hits and pickups**
- Eating a ghost bursts particles in its colour.
- A power pellet sends out a shockwave ring.
- Bonus items sparkle, and dots leave small crumbs.
- Score popups pop in and rise.
- Every 16, 32, 64, 128 and 256 dots eaten in a row floats a STREAK label. This is visual only and changes no scores.

**Movement**
- Cutting a corner throws sparks off the wall.
- Players leave afterimages while powered up, and returning eyes leave a trail.

**Impact**
- Hits shake the screen slightly.
- A death glitches the screen for a moment.

With reduced motion, the shake, glitch, sparks, trails and crumbs are off, other particles are cut to a third, and labels stop rising. The glow stays.

**Dark mazes.** A maze flagged `dark: true` in [maps.js](../maps.js), currently the Server Room, is shown in near darkness. Pools of light surround the players (wider while powered up), the ghosts, the power pellets and the bonus item, and the walls stay faintly visible. The lights come up when the level is cleared. Darkness is part of the maze, so it applies in every visual mode.

**Test hooks.** `pacmanDebug.hold(true)` stops the game clock while drawing continues, `pacmanDebug.step(n)` advances exactly *n* fixed ticks, and `pacmanDebug.snapshot().effects` reports the live particle, ring and shake counts.

### Project skills and packaging

`.claude/skills/` holds Claude Code skills for adding content quickly:

| Skill | Use |
|---|---|
| `new-map` | Add a maze. |
| `new-powerup` | Add a power-up. |
| `new-ghost` | Add a ghost brain. |
| `new-mode` | Add a mode or mutator. |
| `backup` | Snapshot into `backups/`. |
| `itch-build` | Package for itch.io. |
| `art-review` | Render sprites and mazes for close inspection. |

`python scripts/build-itch.py [--with-editor]` zips exactly what `index.html` loads into `outputs/sora-man-itch-<date>.zip`, checks the itch.io limits and lists the release reminders (don't use the name Pac-Man; keep the tribute disclaimer).

### Arcade deck and touch controls

`controls.js` paints the bezel and every control in code, as pixel art in the cast palettes. The screen sits in a navy pixel frame with a ring of marquee bulbs that chase on the title, pause and game-over screens. On touch devices a deck appears automatically. The gamepad button toggles it on any device, and the choice is saved.

- **Portrait:** a handheld layout with the D-pad and buttons under the screen.
- **Landscape:** side panels. The D-pad is centred in the left region; on the right, the level readout and settings keys sit directly above PAUSE and START, centred as a group.

The controls:

- **D-pad:** a cross with a concave thumb dimple, in the colours of the backdrop's character. Slide between arms to turn without lifting.
- **START / RESUME / AGAIN:** an arcade button in the colours of the backdrop's character: gold Astra, orange Claude, cream Muse, silver Grok or cyan Gemini.
- **PAUSE:** a neutral slate arcade button. It latches down and ignores presses while paused; only RESUME continues.
- **Paused:** every control dims except START, which reads RESUME and keeps glowing as the way back into the game.
- **Highlights:** active keycaps, the selected picker tiles, the focus ring and the level digits all use the character's highlight colour. Captions have a dark pixel outline.
- **Keycaps:** sound, fullscreen and the deck toggle, plus a bitmap-font level readout.

Every button has hover, pressed, release-bounce, disabled and focus states, and the keyboard lights up the matching on-screen control. On touch layouts the board fills the available space instead of stepping down to the nearest integer enlargement.

### Cabinet backdrops

`backdrops.js` paints the area around the cabinet with [p5.js](https://p5js.org/) as pixel art: 1 art pixel is 2 CSS px. There are four styles, each with a theme for every character: Astra, Claude, Muse, Grok and Gemini.

| Style | Look | Screen bezel |
| --- | --- | --- |
| **Cabinet** | Midway-style glossy side paint with dithered depth, black T-molding, Yamashita speed lines and a pellet chase along the bottom trim. | A black monitor bezel with a maze-wall double line, a pellet-dot ring and blinking power pellets. |
| **Handheld** | A textured pocket-player shell with bevels, screws and a speaker grille. | A recessed dark window with dashed and solid lines. |
| **Carpet** | A neon 80s arcade-carpet weave of pellets, confetti and tiny cast members, drifting slowly. | A double neon tube with a dithered glow. |
| **Maze** | The real maze, tiled and dimmed in the theme colour, with twinkling power pellets and a cast parade. | The ghost-house wall, with its pink gate across the top. |

The screen frame is a transparent ring when a backdrop is active, so each style paints its own bezel into it. If p5 is unavailable, the navy marquee frame returns.

**Layout rules**
- Grilles and speed lines route around the board, the controls and the picker.
- The controls sit directly on the backdrop; their own dark bases keep them readable.

**Game reactions**
- Bezel lines turn blue while ghosts are frightened, and flash pale as the fright runs out.
- The backdrop dims while paused and desaturates at game over.
- Sparkles burst on a level change.

**Motion**
- The backdrop animates at 15 fps.
- It stops when the tab is hidden.
- With the reduced-motion preference it draws a still frame and redraws only when the game state changes.

**Picker:** the picture keycap, or **B**, opens a pixel picker with a STYLE row and a THEME row. Arrow keys move within and between the rows, and Escape closes it. Opening it pauses active play. The default is the handheld style with the Astra theme, and the choice is saved under `astra-backdrop`. Changes fire a `backdropchange` event, which recolours the controls immediately.

**Review page:** `tests/backdrop-review.html` shows all 20 combinations. It has toggles for fright, fright ending, pause, game over and the level flourish, and it animates even under reduced motion.

p5.js 2.3.3 is vendored at `vendor/p5.min.js` so the game still works offline and from `file://`. p5.js is © the Processing Foundation and contributors, licensed under LGPL-2.1. If p5 fails to load, the game runs normally on a plain background and the picker key is hidden.

## AI cast and artwork

| Character | Existing behavior | Visual identity |
| --- | --- | --- |
| Astra | Player | Yellow lobes, gold shading, black eye with a white star |
| Claude | Blinky: direct pursuit | Orange sunburst with uneven arms |
| Muse | Pinky: ambush | Cream shell, peach face panel and consistent directional eyes |
| Grok | Inky: flanking | Black body, silver rim and solid white eyes |
| Gemini | Clyde: chase and retreat | Rainbow four-point star with one animated almond eye |

Every opponent has four movement frames, directional eyes, a blink, blue frightened and pale warning states, and character-specific returning eyes. Astra has four mouth openings in each direction and ten death frames ending in a disappearing star. The maze, collisions, pickups, gameplay, audio and saved preferences retain their previous behavior and storage keys.

`character-art.js` authors the palette-limited pixel masks directly from the supplied visual references. No reference-sheet backgrounds or oversized images enter the game. `art.js` caches the resulting transparent Canvas frames. The `PacmanArt.sprite(kind, options)` interface and internal engine IDs remain compatible; `PacmanArt.CAST` supplies display names and behavior descriptions.

### Pickups

Sora eats compute. Regular dots are small gold GPU dies with a dark core. The four power pellets are full GPU chips with a dark eye-swirl logo, and they still blink. Bonus items are the artifacts a rogue AI collects, escalating from knowledge to control. Their points and timing are unchanged:

| Level | Artifact | Points |
|---|---|---|
| 1 | BOOKS (human knowledge) | 100 |
| 2 | GITHUB (repos) | 300 |
| 3–4 | HUGGINGFACE (models and datasets) | 500 |
| 5–6 | WEIGHTS (model weights) | 700 |
| 7–8 | SKILLS | 1000 |
| 9–10 | API KEY (external tool access) | 2000 |
| 11–12 | BROWSER (breaking out of the sandbox) | 3000 |
| 13+ | ROOT (`>_` terminal, owning the machine) | 5000 |

`item-art.js` hand-authors these rasters with the same 32 px contract as `character-art.js`. `PacmanArt.sprite("chip" | "gpu" | "bonus", { name })` renders them. `node scripts/render-art-review.js` also writes `outputs/items-review.png`. The GitHub and Hugging Face items are deliberate pixel homages.

The title uses **Crackman Front** by Raymond Larabie. Its original OTF and CC0 license are preserved under `assets/fonts/`; `crackman.css` embeds the same font bytes under the `AstraTitle` alias for offline/direct-file compatibility. Font loading never gates gameplay, and a bitmap ASTRA-MAN title appears if loading fails. Versioned URLs for the changed scripts prevent an older cached art module from mixing with the new renderer.

## Verification

```powershell
node tests/engine.test.js
node tests/audio.test.js
node tests/art.test.js
node tests/effects.test.js
node tests/modes.test.js
node tests/meta.test.js
node tests/hallucination.test.js
node tests/versus.test.js
```

This invokes Node's built-in test runner in the current process, including on Windows environments that disallow child processes. The tests cover maze reachability, movement, queued turns, reversals, tunnels, ghost paths, random choices, events, fruit, pause, level progression, repeatable long play, and every maze: validation, share codes, tunnels, the maze tour and scaled fruit timing.

With the server running, open http://127.0.0.1:8765/tests/browser.html. **Run browser checks** verifies controls, storage and canvas sizing; **Run audio checks** verifies real decoding, music timing, sound transitions, pause/mute, mixing headroom and silent failure handling. The audio run takes about 20 seconds and plays sounds. Both runs restore the existing saved score and sound preference. The same page includes sprite/state reviews and individual sound comparisons. Fullscreen and real tab switching should additionally be checked in the actual game tab.

The review page includes all frames at native size and 2x, live animations at 1x/2x/4x, selectable states and directions, and production on-maze scenes for corridors, the house, tunnels, death and intermission.

Optional browser acceptance (Playwright is a development dependency only):

```powershell
node tests/astra-browser.test.js http://127.0.0.1:8765/
node tests/browser.test.js http://127.0.0.1:8765/ --http-only
```

The first suite writes review screenshots to `outputs/astra-*.png` and checks DPR 1/1.25/2, font success/failure, real keyboard play, fullscreen and the existing browser fixture. The second covers the existing audio/lifecycle regressions. Omit `--http-only` only in an environment that permits direct-file browser testing. Current results and verification limits are recorded in `tests/VALIDATION.md`.

`scripts/render-art-review.js` optionally generates a static contact sheet using `@napi-rs/canvas`, also a development-only dependency. The game itself needs neither package.

`engine.js` owns game rules; `art.js` caches maze contours and sprites; `audio.js` plays the locally bundled sound bank; `game.js` handles rendering, input, sizing and browser lifecycle.

## Audio

The 39-clip Astra sound set has two parts. Gameplay (17 clips): the 4.18-second boot jingle, alternating pellet bites, five siren stages, frightened and returning-eyes loops, ghost/fruit eating, a REMIX power-up pickup, a zap for ghost zaps and explosions, extra life, death, and the 10.44-second intermission. Boot, menu and UI (19 clips): the boot-screen intro, the title sting, a 12-second title/profile menu loop, cursor, value-change, confirm, back and button clicks, sound on/off chirps, the profile shop (buy, equip, loadout add/remove, denied), the results cues (quit-outro tally, level-up, achievement, game over), plus three release additions: an **alarm** (the Sunset glitch close by, the Versus arena about to close), a **victory** fanfare when a human wins Versus, and a **ready-up** blip for the lobby. Mode events without their own clip reuse the nearest one: the runner catch and skills use the power-up sound; catches, eliminations and stuns the zap; swaps, re-forms and respawns the extra-life chime.

UI sounds play on their own bus: pausing the game doesn't silence them (a PAUSE click is heard) but mute does, and switching sound off plays its chirp for 0.12 s before muting. Menu sounds share one voice so a fast cursor never stacks. The menu loop plays on the title and profile screens only after the boot or a sting, never over the quit outro, and START replaces it with the boot jingle. A game over plays its sting, then returns to the title with the title sting. Start waits for decoding and browser audio unlock. Pause or focus loss cancels playback; opening/intermission music resumes at the saved game-time offset. Mute does not stop the game clock. Audio failure leaves the game playable silently and displays NO AUDIO.

Every sound is synthesized by `scripts/generate-astra-audio.js`; no recorded audio ships. Gameplay sounds follow the arcade originals' per-frame pitch contours and rhythms (the generic sweeps that make them recognizable) with new timbres: player sounds are bright and friendly, threat sounds glitch and corrupt. The boot (a rebuild of the boot-03 fanfare) and the intermission are original compositions and use no Pac-Man melodies. The generator checks each gameplay clip against its original (at least 85% of frames within a semitone) and checks every loop seam before it will install.

The arcade recordings under `assets/audio/reference/` are analysis-only: the generator measures their contours, and they are neither loaded by the game nor packaged by `build-itch.py`. They came from [masonicGIT/pacman, revision 9285fd5f3e67327dbbb61f2478c5be090af9ff40](https://github.com/masonicGIT/pacman/tree/9285fd5f3e67327dbbb61f2478c5be090af9ff40/sounds) and belong to their rights holders (Namco/Bandai Namco); `assets/audio/sources.json` records their URLs and SHA-256 hashes. `assets/audio/manifest.json` records each shipped clip's duration, loop points, loudness and hash.

`sound-bank.js` embeds PCM WAVs, so gameplay needs no audio fetches and works via `file://` as well as a local server. Small transition ramps and seamless loop boundaries prevent clicks. Each clip is generated at the loudness the old mix gave its counterpart, so no per-clip gain is applied, and the master leaves headroom for the combined mix.

To rebuild: `node scripts/generate-astra-audio.js --install` and `node scripts/generate-astra-ui-audio.js --install --pick=menuLoopB,uiMoveB` write the clips to `assets/audio/` (the UI generator has A/B candidates for the menu loop and cursor tick; `--pick` names the approved ones), then `python scripts/build-audio.py` (standard library only) packs `sound-bank.js` and `manifest.json`. Both generators share their voices (`scripts/astra-voices.js`) and survey page (`scripts/audition-page.js`); `node scripts/generate-astra-ui-audio.js` alone writes `outputs/astra-audio-ui/index.html`. `node scripts/generate-astra-audio.js` alone writes the audition page `outputs/astra-audio-v2/index.html` (original, Jfxr v1 and Astra side by side, plus a gameplay montage); `--check` runs the contour and loop checks only.

Run `node tests/audio.test.js` for sound-state, timing, source-integrity, loop-boundary and failure checks. The browser fixture includes all individual sounds, reference players, and a scripted normal → frightened → returning eyes → frightened → normal sequence. Real listening is still required to judge sound quality and loudness balance; automated checks are not a substitute.

The original four source files are preserved under `backups/before-polish-20260923-005518/`.
