# Validation — 2026-09-25 (release fixes)

- **188 node tests pass** (`node --test` on every suite except the optional Playwright ones): engine, audio, art, effects, modes, meta, Sunset, Versus, the maze generator and the new input/lobby suite.
- **Headless Versus sims** (120 matches: 4 mazes × 10 seeds × 3 bot levels): no all-spirit stalls and no match left with nobody standing. Bot reversals are 0.5–1.2 per second (was 3.4).
- **Headless Sunset co-op sims:** no living player below the window.
- **In-app browser (HTTP):**
  - the title cards and the SOLO / LOCAL MULTIPLAYER row
  - the lobby with two keyboard schemes
  - emulated gamepads: join, ready, disconnect, the same pad reconnecting at a new index, and a takeover by another pad
  - seat binding in play
  - the results input guard and the rematch into the lobby
  - the pause seat list and the Versus results
  - the mobile (375 × 812) touch-only lobby
  - the new bonus art
- **Not certified here:** real controllers, real keyboard ghosting, Firefox and listening checks. See `docs/release-readiness.md`.

# Validation — 2026-09-23

## Astra-Man rework — 2026-09-23

- Refined Astra's eye against the supplied Sora reference: a slightly tilted four-point sparkle with tapered sides, retaining the original black-and-white palette. Moved the eye higher and behind the mouth opening. All nine artwork tests still pass, including exact whole-eye equality across all mouth openings in each direction. `outputs/astra-eye-detail.png` shows all four mouth poses.
- **23 engine, 17 audio and 9 artwork tests passed.** All 768 opponent state/direction/frame/blink combinations have valid 32px frames and transparent margins. Artwork checks also cover stable connected silhouettes, four distinct motion frames per character, state silhouette parity, Muse returning-eye consistency, Grok solid white eyes, Astra directions/death, and backing-pixel coordinate alignment.
- **56 Astra browser checks passed**, including the **30-check browser fixture**, using isolated Chromium profiles. Covered loaded Crackman Front, bitmap font failure fallback, cast mapping, 448 × 576 backing resolution, four viewports at DPR 1/1.25/2, real keyboard movement and pellet collection, pause pixel identity, fullscreen entry/exit, saved preferences and reduced-motion startup.
- **41 existing end-to-end browser checks passed** at DPR 1.25 in HTTP-only mode, including the 30-check fixture, actual sound decoding, transitions, delayed startup, focus loss, saved settings, intermission, silent failure, review controls and Web Audio mixing. Mix peak was 0.422, RMS 0.119; no unhandled errors.
- Inspected production screenshots of the title, complete sprite gallery, native/2x/4x blink gallery, adjacent cast, corridor corners, house gate, frightened/warning/returning states, tunnel wrapping, death, level clear, intermission and game over. Evidence is under `outputs/astra-*.png`.
- A live in-app browser playthrough exercised normal keyboard movement, buffered turns, pellet collection, death and respawn. The existing high score of 5910 remained intact. The game was left on its title screen.
- Live testing caught an old cached `art.js` paired with the new renderer (`Art.snap is not a function`). Versioned URLs now load the related changed scripts together; reloading the in-app browser confirmed the title and live maze render correctly.
- **Direct-file launch was not re-certified:** Browser Use blocks `file://` URLs. The font bytes and audio remain embedded, sprites are generated locally, and runtime scripts remain ordinary non-module scripts; this supports the direct-file design but is not a substitute for a direct-file browser run. Local HTTP launch passed.
- No gameplay-engine or audio-bank changes were made. Supplied rework assets remain untouched. The previous presentation and tests are backed up under `backups/before-astra-man-20260923-214905/`.

## Audio finishing pass

- Retained the previous agent's recorded-audio integration and completed its quality checks. Recut both chomps and all seven loops from steady sections of the pinned recordings; the earlier clips included editorial fade-ins. Removed the unequal chomp gain compensation and rebuilt all embedded assets and their hash manifest.
- **23 engine tests and 17 audio tests passed** using the dependency-free Node runners. The added audio regression checks that both bites have comparable full recording levels and loop cycles do not repeatedly swell in volume. Existing source hashes, loop seams, state selection, timing and failure checks still pass.
- **30 native-audio browser checks passed** in the Codex in-app browser through the new **Run audio checks** button. This exercised delayed decoding and duplicate Start, the complete opening and intermission, all five sirens, repeated power pellets, multiple returning ghosts, death cleanup, music pause/resume, mute/unmute, focus loss, silent device failure and embedded playback without MP3/WAV requests.
- **All 28 existing browser checks passed** in the same browser at native DPR **1.25**, including persistent score/mute preferences and the four existing viewport sizes. Both fixture runs restore the user's saved settings afterward.
- Production Web Audio graphs mixing each chomp with a normal siren and extra life produced peaks of **0.422** and **0.428**, with nonzero RMS and no clipping. These are actual `OfflineAudioContext` renders using the production audio class.
- Individual chomp controls and the complete 14-second sound-review sequence worked through their visible UI. The sequence returned to a stopped state on completion.
- The new browser fixture waits for asynchronous audio-state changes and keeps the test iframe in view to avoid Chromium throttling an off-screen game. Its first run caught an insufficient fixed-frame test wait; after correcting that test synchronization, all 30 checks passed.
- Direct-file launch was not re-certified in this pass because the browser tool blocks `file://` URLs. Local-server launch passed; the earlier agent's direct-file result is recorded below. The sound bank remains embedded and requires no runtime audio requests.
- Subjective pitch/rhythm, loudness balance and exact arcade fidelity still require a by-ear comparison. The individual sound buttons and reference players provide that comparison; automated checks do not establish that the audio sounds identical.

## Previous agent's recorded-audio continuation (historical results)

- **23 engine tests** in `tests/engine.test.js`: existing movement/rules regressions plus configurable presentation durations and paused intermission timers; the old 3.8-second intermission expectation now follows the complete recording.
- **16 audio tests** in `tests/audio.test.js`: all 15 embedded WAVs and 14 source MP3 hashes, loop seams, chomp alternation, exact siren thresholds, multi-ghost priority, repeated/zero-duration power effects, death cleanup, complete music durations, pause/mute offsets, idempotent preparation, rejected/missing audio and a five-second timeout.
- **42 end-to-end browser checks passed**, including all **28 existing fixture checks**, using isolated Chromium at DPR 1.25. Tested real buffer decoding with artificial startup delay, duplicate Start, direction queuing during loading, opening/intermission playback, pause/resume, focus loss during loading and music, mute, recorded state transitions, direct `file://` launch, visible silent fallback, individual sound buttons, and the full 14-second review sequence.
- Real Web Audio offline rendering of a siren + ghost effect + extra-life mix produced nonzero output with peak **0.425** and RMS **0.115** (below clipping). Gameplay makes no MP3/WAV requests because the sound bank is embedded.
- No unhandled browser errors. Tests use fresh browser storage and do not alter the user's saved game data.
- Run `node tests/engine.test.js` and `node tests/audio.test.js` without dependencies. For the optional end-to-end runner, make Playwright available to Node, install its Chromium browser, serve the project, then run `node tests/browser.test.js http://127.0.0.1:8766/`.
- **Listening acceptance remains manual:** exact arcade fidelity, subjective loudness and transitions must be compared using the 15 sound buttons and original reference players in `tests/browser.html`. Fullscreen and real OS-level tab switching were not re-certified in this audio continuation; the previous visual pass is recorded below.

## Earlier board/sprite validation (before the audio continuation)

- **22 engine regression tests passed** with `node tests/engine.test.js`. Includes all 244 pellets reachable, buffered turns, reversal, forced corners, both tunnel directions, frightened choices, returning ghosts, ordered events, fruit milestones across deaths, and controlled death/restart/level progression.
- **28 browser checks passed** using `tests/browser.html`. Covers start/resume, repeated keys, focused buttons, frozen pause animation, canceled sound sources, blur/focus behavior, saved scores and mute settings, and responsive canvas sizing.
- **Responsive layouts checked** at 720 × 640, 320 × 568, 900 × 440 and 280 × 320 with device pixel ratio 1.25.
- **Fullscreen checked in the game tab** at Windows 125% scaling. Canvas measured approximately 537.6 × 691.2 CSS pixels: 2.4× on both axes, or 3× device pixels. Returned to windowed mode afterward.
- **Visual review completed** for the title, maze and house gate, HUD, character directions and states, frightened/warning faces, returning eyes, skirt and chomp frames, death frames, tunnel wrapping, intermission and game-over presentation.
- No browser console warnings or errors were reported during the checks. Existing saved high score and sound preference were preserved.

Audio lifecycle and source cancellation were checked programmatically; subjective loudness and musical balance were not evaluated. Reduced-motion handling was checked in source, without changing the host preference.
