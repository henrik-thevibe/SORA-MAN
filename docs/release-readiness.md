# SORA-MAN release-readiness report (2026-09-25)

Full pre-release diagnostics pass. Tags: [code] confirmed by tracing code, [sim] confirmed by headless simulation, [RT] needs a runtime check. Fix status is tracked at the end of this file.

# PART A: Release-readiness report

Each finding lists: where · what/repro · why it matters · root cause · fix · what else it affects · how to verify.

## BLOCKERS

**B1 · Confirmed bug [code] · Input: keys and pads drive the wrong seat; one device drives several players**
- **Where:** game.js:25-28 `keyPlayer`, :598-613 `pollGamepads`, :806 skill routing.
- **What / repro:**
  - **Versus, 1 human:** press WASD. It steers **bot Nova** (index 1 < playerCount 4), while Sora ignores it. The title and index.html both advertise "ARROWS / WASD MOVE".
  - **Classic 2P:** IJKL and the number pad both steer P1.
  - Pad 1 and the arrows both steer P1; pad 2 and WASD both steer P2.
  - With 2 keyboard players and 2 pads, the pads collide with P1/P2. **P3 and P4 can never be pads.**
  - Any pad beyond the player count steers P1.
- **Why:** multiplayer is fundamentally unusable, and the most common scheme doesn't work in Versus.
- **Root cause:** there is no device→seat binding. The key set decides the seat index, the absent-seat fallback goes to P1, and the pad's array position decides its seat.
- **Fix:** add an explicit seat model (Part B, phases 1–3):
  - Every input resolves to a *device* (`kb:arrows`, `kb:wasd`, `kb:ijkl`, `kb:numpad`, `pad:<index>`, `touch`), and only a seated device drives its seat.
  - Solo non-Versus keeps "any device → P1".
  - The engine ignores `setDirection` and `useSkill` for bot seats.
- **Affects:** title navigation, the profile screen and pause keys (must stay device-agnostic), and the tests that start games with Enter.
- **Verify:**
  - `tests/input.test.js` covers the binding matrix.
  - In the browser: dispatch keydown with `code:"KeyW"` in 1-human Versus and assert that `players[0].wanted` changes and `players[1].wanted` doesn't.

**B2 · Confirmed bug [code] · Multiplayer flow: no join, no ready-up, and seats can have no controller**
- **Where:**
  - game.js:278-307 (the PLAY row), :837-839 (`2`/`3`/`4` start at once), :617-618 (pad), :361-368 and :867-873 (click starts)
  - engine `startGame`
- **What / repro:**
  - Pick 4 PLAYERS and press Enter with one keyboard: P2–P4 have no device, idle, die, and drain the **shared** life pool.
  - Pressing Numpad3 (key "3") on the title or results screen starts a 3-player game.
  - On a phone, the PLAY row still offers 2–4.
- **Why:** you required that play never starts until every human has readied; today it's impossible to enforce.
- **Root cause:** the player count is a number chosen before anyone proves they have a device.
- **Fix:** the lobby (Part B, phase 2):
  - Seats are claimed by devices; each human readies with ↑↓←→ + ACTION.
  - A 3-second countdown starts and cancels on any change.
  - Bots fill empty seats (Versus only).
  - `2`/`3`/`4`, clicks and pad Start open the lobby and never start a game.
- **Affects:** the title menu layout, the `beginGame` signature, results rematch, the `bestKey` player count, and the tracker's player count.
- **Verify:**
  - Unit tests for the seat state machine.
  - A browser run that joins with 2 schemes plus 2 emulated pads and asserts no start until all four are ready.

**B3 · Confirmed bug [code] · Gamepad seats shift on disconnect; connecting a pad silently changes the next game's player count**
- **Where:** game.js:585 (`connectedPads` filters, so positions shift), :632-637 (connect raises `titleMenu.players`, even mid-game).
- **What / repro:**
  - In 2P, unplug pad 1. Pad 2 becomes position 0 and now drives P1; P2 is uncontrolled, and **the game doesn't pause**.
  - During a solo run, a pad wakes up (bumped, or Steam Input). "AGAIN" then starts 2P co-op with an idle P2.
- **Why:** it corrupts state and punishes players unfairly.
- **Root cause:** no stable device identity, and no handling for a disconnect or reconnect.
- **Fix:**
  - Bind pads by `index` and remember `id`.
  - When a seated pad disconnects, auto-pause with a panel: "P2 GAMEPAD DISCONNECTED: RECONNECT, OR PRESS ACTION ON ANOTHER DEVICE TO TAKE OVER".
  - The same `id` reconnecting rebinds automatically.
  - Connecting a pad only shows a notice ("GAMEPAD CONNECTED · JOIN IN THE LOBBY") and never changes counts.
- **Affects:** pause/resume gating (resume is blocked while a seat is orphaned) and the rematch flow.
- **Verify:** emulate `navigator.getGamepads` in the page, then disconnect and reconnect with the same and a different id.

**B4 · Confirmed bug [sim] · Versus "everyone is a spirit" deadlock**
- **Where:** modes.js:839-853 (`becomeSpirit` / `revive`), :1071-1085 (Claude catches).
- **What:** over 20 bot matches:
  - Claude (or an injection) caught someone **17.1 times a minute**.
  - All live contestants were spirits for **22% of match time**; the longest stretch was **72 s**.
  - Spirits can only swap by tagging a live star, so nothing can happen until the arena closes.
- **Why:** matches stall; your own handoff targets "no round where everyone is a spirit for more than 5 s".
- **Root cause:** nothing protects the last live star; Claude hunts at full rules; bots flee Claude only inside 4 tiles by straight-line distance.
- **Fix:**
  - (a) Claude and injection blasts can't turn the **last** live star into a spirit: Claude goes home instead, and the star gets 1.5 s of `fresh`.
  - (b) Move the tuning constants into ruleset data (`ROUND_SECONDS`, `CLOSE_*`, `BOOST_*`, plus a new `claudeSpeed` of about 0.85 in Versus) and tune until the sims show ≤ 8 Claude catches a minute.
- **Affects:** Versus placements, the bot "spirit" logic, the tracker's `won`.
- **Verify:** a new versus test runs 40 seeded matches and asserts no all-spirit stretch longer than 5 s and a Claude-catch rate within the target.

**B5 · Confirmed bug [sim] · The closing arena ends in simultaneous mass elimination with an arbitrary winner**
- **Where:** modes.js:814 (`MAX_MARGIN 11`), :913 (bots' `unsafe` = margin + 2), :980-1049.
- **What:**
  - In 16 of 48 matches, 3 or 4 contestants were eliminated within 0.2 s of each other, at about 104 s (Classic, Neural) or about 98 s (Astra).
  - In 3 matches **all four** went out together, and the "winner" was whoever died a tick later.
  - The final sanctuary is only 1–2 **disconnected 6-tile horizontal strips** (ghost-house rows). Bots' +2 safety band covers all of it from margin 10 on, so they plan nowhere and roll into the glitch.
  - On Server Room the closing phase eliminated nobody in 11 of 12 matches.
- **Why:** the headline endgame looks broken.
- **Root cause:** the margin schedule ignores maze topology.
- **Fix:**
  - At round start, compute a per-maze `maxMargin`: the largest margin whose inner rectangle still holds a **connected** walkable component of at least 24 tiles containing a loop. Clamp the schedule to it.
  - The bots' safety band shrinks to +0 at `maxMargin`.
  - If one margin step would eliminate every standing player, hold the margin instead.
  - Tie-break placements with equal `outAt` by score.
- **Affects:** bot `unsafe`, `drawArenaEdge`, and the HUD "ARENA CLOSING".
- **Verify:** sim test on all 4 mazes: no single tick eliminates more than one contestant unless others are already out, and the final region is connected.

**B6 · Confirmed bug [sim] · Endless co-op: a lagging player is scrolled off-screen and stays alive, invisible and stuck**
- **Where:** modes.js:668-702 (`scrollDream` moves players down by 4 and never culls them), :751-754.
- **What:** P1 climbs, P2 idles. P2 was alive below the window (y up to 83) for up to **28.6 s**, frozen, because tiles outside the window read as wall. They hold a life and can't be revived.
- **Why:** it breaks co-op Endless and traps a player.
- **Fix:**
  - A living player pushed below `ROWS - 0.5` by a scroll is deleted (`killPlayer`), which matches "anything below is gone".
  - Add an edge warning: a flashing "P2 · KEEP UP!" plus an audio cue (A-H10) when a player is within 4 rows of the bottom or the glitch.
- **Affects:** the revive-token logic (B6 + H12 together), the achievements tracker.
- **Verify:** add the sim to `tests/hallucination.test.js`: no living player has `y > ROWS` at any tick.

**B7 · Known release blocker [code] · Brand look-alike bonus art**
- **Where:** item-art.js:101-110 (the GITHUB and HUGGINGFACE rasters), engine.js:75-76, the `scripts/build-itch.py` BLOCKERS list.
- **What:** your own build script flags these as must-fix before a public release (trademark look-alikes).
- **Fix:**
  - Redraw both as generic pixel icons: `REPOS` (a folder with a branch glyph) and `MODELS` (a stacked-layers chip).
  - Rename the `BONUS` entries and keep `LEGACY_NAMES` mapping for any old references.
  - Update tests/engine.test.js:269 and the README table.
- **Verify:** the art-review skill contact sheet, art.test, and a build-itch run with no blocker lines.

## HIGH

**H1 · Confirmed [sim] · AI: bots jitter, about 3 direction reversals a second, with superhuman 50 ms reactions**
- **Measured reversals per bot-second:** dots 3.42, spirit 3.06, fleeing 2.91, energised 2.32.
- **Root cause:**
  - `thinkBot` re-plans every 3 ticks from `floor(x, y)`.
  - It re-picks the nearest goal with no commitment (the next-nearest dot is often behind).
  - BFS ties break by direction order.
  - `fleeStep` scores straight-line distance plus `random()*0.5`.
  - The engine applies a reverse `wanted` at once (engine.js:1107).
- **Fix:**
  - Decide only on entering a new tile.
  - Keep the goal until it's eaten or unreachable.
  - Break ties toward the current direction.
  - Reverse only for a threat, or when the path to the goal has pointed backward for at least the commit time.
  - Flee by path distance on HARD.
  - Target: **< 0.6 reversals per bot-second** at NORMAL.
- **Verify:** a reversal-rate assertion in versus.test.js.

**H2 · Design [code] · AI: no difficulty levels**
- Bots exist only in Versus, and they're simultaneously superhuman (reaction) and irrational (jitter). Difficulty levels are worth adding after H1. See the difficulty section below.

**H3 · Confirmed [code] · State/input: results can be skipped by carry-over input**
- **Where:** game.js:618 (pad A or Start on GAME_OVER calls `beginGame` immediately), :873 (a canvas click on GAME_OVER restarts), :844 (Enter).
- **Repro:** mash A for a skill as the last life goes, and the results never show.
- **Fix:**
  - A central `inputGuard`: a 1.2 s minimum on results, and actions need a fresh press after the guard (pad memory is re-latched on every screen change).
  - Results footer: "ACTION/ENTER REMATCH · B/BACKSPACE TITLE".
- **Verify:** a scripted held A through game over leaves the state at GAME_OVER for at least 1.2 s.

**H4 · Confirmed [code] · Gamepad parity gaps**
- **Problems:**
  - There's no pad mapping for quit or back-to-title: `menuPress` is never called from `pollGamepads`.
  - The title hint says "B BACK" but B does nothing there.
  - Pause shows "ENTER TO RESUME / BACKSPACE TO QUIT" only.
  - Results say "ENTER…" only.
  - The boot gate (loader.js:175) only listens for key and click.
- **Fix:**
  - Pause: Start resumes; Select, or B held for 0.6 s, quits.
  - Results: A = rematch, B = title.
  - Title: B = the MENU action (no-op text removed).
  - Draw texts per device class ("START/A", "ENTER").
  - The loader also polls pads (with the note that browsers may still need one click or key for audio).
- **Verify:** emulated pad in the browser.

**H5 · Confirmed [code] · UX/copy: rules are never explained**
- There's no objective text, no how-to-play, and no mode descriptions (`about` is never drawn). Power-up effects appear only in the profile; skills are never described.
- The Versus mechanics (runner notch, spirits, bugs, injections, closing arena) and the Endless glitch are unexplained.
- **Fix (Part B, phase 5):**
  - A **mode card** replaces the cast panel while the MODE row is focused.
  - A one-time **HOW TO PLAY** card before the first run of each mode (profile flag `seenHowTo`).
  - The Versus lobby shows the rules.
  - One-time contextual toasts: first power-up (its `about`), first spirit ("TAG A STAR TO COME BACK"), first injection ("TOUCH A RIVAL TO PASS IT ON"), the runner ("FILL YOUR BAR PAST THE NOTCH TO CATCH IT"), Endless start ("THE GLITCH DELETES EVERYTHING · CLIMB!").

**H6 · Confirmed [code] · Platform/UX: multiplayer is not visible, and desktop-only is not stated**
- The PLAY row cycles "1 PLAYER…4 PLAYERS" with no word "multiplayer" and no scheme help. On touch it still allows 2–4.
- `touchDeck()` measures the *deck toggle*, not the device, so touch laptops get touch UI.
- **Fix:**
  - Rows become PLAY `SOLO` / `LOCAL MULTIPLAYER` (Versus: `VS BOTS · 1–4 HUMANS`).
  - Capability check `multiplayerAvailable()`: `(any-pointer: fine)`, or a physical keydown seen, or a gamepad connected.
  - Without it, the row shows `MULTIPLAYER · DESKTOP ONLY` (dimmed) and activating it shows "LOCAL MULTIPLAYER NEEDS A DESKTOP KEYBOARD OR GAMEPADS". Never "online".
  - The meta description and aria text mention "local multiplayer on desktop".

**H7 · Confirmed [code] · Data: high scores and progression are polluted**
- `bestKey` (game.js:39): Classic 3P/4P write to the **solo** key (`players===2` is the only co-op case), which overwrites the solo best.
- Versus reads its best from `…-1p` (the human count) but saves `game.score` (a team total **including bots**) to `…-4p` (`game.playerCount`).
- XP and credits (meta.js:225), plus "10K/50K TOKENS", count bot points. "FULL PARTY" unlocks from any solo Versus (playerCount is always 4).
- **Fix:**
  - Classic 3P/4P use `astra-classic-high-3p-v1` / `-4p-v1`; the existing keys are untouched, so saves stay valid.
  - Versus saves no team high score; the title shows the win count instead.
  - The tracker uses the human-only score and the human count (`options.humans`).

**H8 · Likely [RT] · Input: button focus swallows the game keys**
- **Where:** game.js:796 ignores keydown whose target is a button. MUTE (:856), FULLSCREEN (:863), SHOW PAD and BACKDROP never return focus to the canvas.
- **Repro:** on Windows Chromium, click MUTE, then press arrows: nothing happens, and Space re-toggles mute.
- **Fix:** refocus the canvas after every bezel button action (picker excepted), and handle game keys when the target is one of the bezel buttons, except Enter/Space.

**H9 · Confirmed [code] · Audio: many events are silent**
- **Where:** audio.js:178-197 maps only pellet, power, ghost, zap, fruit, powerUp, extraLife and death.
- **Silent today:**
  - Versus: **runner caught** (collectItem emits nothing for `runner`), caught/spirit, swap, eliminated, bugged, injected, injection passed.
  - Skill use (Star Dash, Supernova, Pulse Shield, Vine Snare) and Constellation.
  - Endless: chain milestones, zone change, revive token, and **glitch proximity**.
  - Sleeper wakes, power-up spawn, **arena closing**, time up.
- **Other audio problems:**
  - A Versus **win plays the Game Over sting**.
  - Versus plays the "returning eyes" loop after Muse or Gemini are sent home (not eaten), which is misleading.
- **Fix:** map events to existing clips now (table in phase 6), then add 3 new generated clips: `alarm` (arena closing / glitch near), `victory`, and `join/ready`.

**H10 · Confirmed [code] · Endless: the danger isn't telegraphed and the power-up timer is hidden**
- The 2.5× glitch speed when co-op players spread more than 14 rows apart (modes.js:707) is invisible.
- There's no proximity cue.
- The active power-up HUD is excluded in Endless (overlays.js:223).
- **Fix:**
  - A "STAY TOGETHER" warning when spread exceeds 11.
  - The glitch edge brightens and pulses when a player is within 3 rows, plus the alarm cue.
  - Per-player power-up timers under each score, in every mode.

**H11 · Confirmed [code] · Progression: 4 of 18 achievements can't be earned from the UI**
- OVERFIT (8-ghost chain): `ghostChain` resets on every energizer outside Benchmark.
- BENCHMARKED and NEW DATASET: Benchmark is hidden.
- DAILY DRIVER: daily runs aren't reachable.
- **Fix:** add an `available()` predicate. Hide unavailable ones from the list and the "N OF M" count; saved ids are kept.

**H12 · Confirmed [code] · Endless co-op: a revive token spawns off-by-one, giving an extra life**
- **Where:** modes.js:782 checks `lives <= living` *before* `killPlayer` decrements.
- **Fix:** `game.lives - 1 <= living.length`.
- **Verify:** a unit test where 2P with 2 lives loses one player: no token.

**H13 · Confirmed [code] · Touch: Remix skills can't be used**
- There's no skill button, but the skill bars show. The title hint "SKILLS / Q U NUMPAD 0" is cryptic.
- **Fix:**
  - Add an `ACTION` round button to the touch deck (controls.js), shown when the ruleset has skills.
  - Per-seat skill keys are listed in the lobby and on pause.

**H14 · Balancing [sim] · Versus is dominated by Claude tag**
- Per minute: Claude catches 17.1, rivals eaten 1.4, runner catches 1.7.
- **Fix:** covered by the B4 data-driven tuning, plus: runner every 10 s (from 12), `CATCH_BOOST` 0.16. Re-run the sims.
- **Playtest targets (handoff):** a runner catch about every 20 s; most rounds decided while closing.

**H15 · Accessibility/UX [code] · Players are told apart only by colour**
- There are no P1–P4 tags. HUD labels blink. Accessories can be removed (NOTHING).
- **Fix:**
  - `drawPlayerMarks`: a `P1`–`P4` tag above each star for 3 s at each round start, each respawn, whenever paused, and always in the lobby.
  - HUD columns show `P1 SORA`-style labels.
  - In Versus, a `YOU` tag when exactly one human plays.

## MEDIUM

| ID | Type | Where | Problem → Fix | Verify |
|---|---|---|---|---|
| M1 | Likely [RT] | game.js:804 | Firefox Quick Find: `/` and `'` aren't prevented outside PLAYING, so the find bar steals the keyboard → always `preventDefault` mapped scheme keys. | Firefox manual test |
| M2 | Confirmed [code] | game.js:18-32 | WASD/IJKL match `event.key`, so AZERTY breaks and Q (Nova's skill) is left on AZERTY → switch to `event.code` (positional); keep labels. | unit test on the code map |
| M3 | Confirmed [code] | game.js:837, 361-368 | Numpad3/digits start games; any desktop canvas click starts → digits open the lobby only; a click on empty title space does nothing on desktop. | browser |
| M4 | Confirmed [code] | modes.js:80 | Collecting RATE LIMIT again refreshes the player timer, not the ghosts' slow; ghosts released later aren't slowed despite "Every ghost" → re-apply on refresh (addStatus `onRefresh`), and slow newly released ghosts while any RL is active. | modes test |
| M5 | Confirmed [code] | overlays.js:216-230 | The HUD shows only `active[0]` of any player → a per-player chip under each score column, plus a tooltip label for the newest. | screenshot |
| M6 | Confirmed [code] | overlays.js:248 | Co-op Classic/Remix end on a plain GAME OVER with no per-player results → a results panel when `playerCount>1` (team score, per-player bars, MVP). | browser |
| M7 | UX [code] | modes.js:1047 | An eliminated human watches bots for up to about 45 s → "SPECTATING · ENTER/A TO SKIP TO RESULTS" once no human is live; skipping fast-forwards the sim with no rendering (deterministic). | versus test |
| M8 | Confirmed [code] | game.js:586-594 | Stick: 0.5 deadzone with no hysteresis; diagonal wobble changes row and value → press 0.5 / release 0.35 and dominant-axis hysteresis; ignore `mapping!=="standard"` pads with a notice. | unit test |
| M9 | Design [code] | engine.js:1197 | Co-op respawn can land next to a ghost → pick the candidate spawn tile farthest from the nearest dangerous ghost (co-op only; solo unchanged). | engine test, solo determinism test |
| M10 | Accessibility [code] | game.js, effects.js | No volume control, no in-game motion/flash toggle, low-contrast key hints (#4c557a), the screen reader reads "ATTRACT"/"DYING" → pause options: `-`/`=` volume, `R` REDUCED MOTION (overrides the OS setting; saved), hint colour #7f8ab0, friendly status names. | browser |
| M11 | Fairness [code] | modes.js:753, overlays.js:168 | The glitch kills at `glitchLine-0.2` while the drawn edge jitters ±3 px → kill at `glitchLine+0.1`; draw the solid edge at the kill line and the noise only below it. | screenshot |
| M12 | Audio [code] | audio.js:17 | Versus bed: "returning" after `sendHome`, and the siren saturates → Versus uses a fixed arena bed (siren1), plus alarm stages when closing. | audio test |
| M13 | UX [code] | overlays.js:253-265 | Versus results have no P-number, device or YOU; the LVL readout is meaningless in Versus/Endless → add tags; show "ROUND"/"DIST" instead. | screenshot |
| M14 | Copy [code] | profile-screen.js:116,53; meta.js:162-163 | The wardrobe shows "ASTRA" ("BOW ON ASTRA"); achievements mix "Endless" and "Sunset" → use `Engine.PLAYERS[i].name`; say "Sunset" everywhere. | grep |
| M15 | Copy [code] | game.js:314-321 | Title cast descriptions are Classic-only (in Versus Muse bugs you and Grok sits out) → the mode card overrides them per mode. | screenshot |
| M16 | UX [RT] | — | Keyboard ghosting with 3–4 keyboard seats → the lobby warns "3+ ON ONE KEYBOARD MAY MISS KEYS · GAMEPADS RECOMMENDED"; the input-check pips show held keys live. | manual |

## LOW

| ID | Type | Problem → Fix |
|---|---|---|
| L1 | Balance [code] | SCALE UP draws at 1.6× but the hitbox is unchanged → state "flatten ghosts you touch" only; draw at 2× (integer). |
| L2 | Edge [code] | Simultaneous pickups and fruit go to the lower player index (engine.js:725, 1507) → award to the nearest. |
| L3 | Visual [code] | Two co-op deaths in one tick hide the first player's death animation (game.js:182-186) → draw both. |
| L4 | Copy [code] | Debuff naming: "BUG: SLUGGISH/MUZZLED" floats vs "BUG: SLOW" / "SLOW"/"MUTE" tags → use SLOW and MUTED everywhere. |
| L5 | Visual [code] | Nova is #ff7ab4 in game/overlays/profile but #ff5fa2 in effects.js:10 → a single shared palette. |
| L6 | Visual [code] | Non-integer sprite scales (title cast/Sora 1.5×, runner/bonus pulse, Scale Up 1.6×) make uneven pixel widths → only 1×/2× blits; pulse via a glow ring, not scale. |
| L7 | Release [code] | `window.game` and `window.pacmanDebug` are exposed. Backdrops and browser tests depend on them → keep (a single-player console "cheat" is harmless); document. |
| L8 | Tests [code] | The versus test "mostly outlast the glitch" passes despite B5; there are no input or seat tests; tests/VALIDATION.md is stale → new tests (phase 9). |
| L9 | Docs [code] | The README describes absent-key fallback, the `2`/`3`/`4` keys and old names → update. |
| L10 | Perf [code] | `saveScore` writes localStorage on every scoring tick above best → write on game over, pause and quit only. |
| L11 | Perf [code] | FX `streaks` Map keeps stale player objects per round → key by `pac.index`. |
| L12 | Copy [code] | Title "LV 3 ▮ 120 CR" is unlabelled → "PROFILE LV 3 · 120 CREDITS" when the PROFILE row is focused. |

## Diagnostics by area (what I verified works; what's broken above)

- **Multiplayer and input:**
  - Arrows/WASD/IJKL/numpad don't overlap each other, **but** skill `ShiftLeft`/`ShiftRight` both need Shift. That's fine by `event.code`.
  - `P` (pause) sits next to `O` (Vega's skill) and `M` (mute) next to `J`/`K`, a slip risk for IJKL players. Keep them, but the lobby shows the IJKL legend.
  - The `event.repeat` guard exists for system keys, but direction and skill keys run before it, so held skill keys spam (cooldown-gated, harmless).
  - Failures: B1, B2, B3, H4, H8, M1, M2, M3, M8, M16.
- **Ready-up and lobby:** none exists (B2). The design is in phase 2, and every desync scenario you listed is a test case there.
- **Bots and AI:**
  - Verified: no stuck bots (max stationary 0.1 s over 68 matches); bots never enter walls (existing test); pathfinding cost is a small BFS per bot every 3 ticks (fine).
  - Problems: jitter (H1), reaction time (H2), the endgame (B5), the Claude balance (B4/H14).
  - Bots use full-map knowledge. That's acceptable for arcade play, but HARD shouldn't add more, only better use of it.
  - Bots ignore Muse/Gemini as threats. Intended at EASY/NORMAL; HARD avoids them.
- **Maze and navigation:**
  - `analyzeMap` enforces reachability, two-ended tunnels and no dead ends; all 4 bundled mazes pass.
  - Movement is tile-centre based. Arcade pre-turn cornering is optional, never required.
  - The Endless generator is mirrored, has no dead ends and checks connectivity (mazegen tests pass).
  - Issues found: the Versus sanctuary topology (B5) and off-screen culling (B6).
  - Route variety: SERVER ROOM's long aisles give obvious dominant loops. That's acceptable by design. Post-release idea: per-maze Versus sanctuaries.
- **Power-ups:**
  - Durations are from the registry (5–6 s). The same power-up refreshes via `max` (fine, except M4).
  - Different power-ups stack (status list).
  - Precedence: statuses resolve in collection order, so SCALE UP + CONTEXT OVERFLOW means whichever was taken first decides a touch. Documented, acceptable.
  - Dying or changing rounds clears all statuses (players are rebuilt). The freeze pauses status timers.
  - RAG can chain-collect items (intended).
  - Incognito at alpha 0.35 is hard to see in co-op; raise it to 0.55 and add an outline.
  - Bots have no power-ups (Versus has none). The runner is the only bot pickup.
  - Balance flags: TOKEN BEAM and HOT PATH are strongest (200 per ghost, no pause); RATE LIMIT is weakest (M4). Note for a playtest, no change.
- **Endless / death wave:**
  - Spawn 3 rows below the window. Speed `0.4 + 0.0015·dist`, capped at 1.3 rows/s (×2.5 when co-op is spread out).
  - It pauses during READY and the ghost-eat freeze and resets to the window bottom after a wipe. It kills regardless of immunity (consistent).
  - Issues: B6, H10, H12, M11.
- **Graphics and animation:**
  - Integer device scaling is correct (resizeScreen); pixelated rendering is everywhere; the HUD fits 4 columns at 224 px.
  - Issues: L3, L5, L6, the Incognito alpha, H15.
  - Needs a runtime sweep (phase 10) at 1280×720, 1920×1080, 2560×1440, 800×600, 375×812 and 812×375, in fullscreen, at DPR 1/1.25/2.
- **Audio:**
  - Channel and priority design is sound; loops stop on pause, mute and quit; there's no instance leak (`onended` cleanup); `start` resets.
  - Issues: H9, M12. The menu loop never plays over the quit outro (verified).
- **UI/UX and copy:** H5, H6, M5, M6, M13–M15, L4, L12. The copy table is in phase 5.
- **Accessibility:** H15, M10. Reduced motion is honoured throughout (verified), but only from the OS.
- **Performance and memory:**
  - Maze layers are cached in a `WeakMap`, with neon layers capped at 6 per maze (no leak).
  - Sprite and light caches are bounded by their key space. Listeners are registered once (no duplication on restart). Particles are capped at 500.
  - Endless compiles a map, traces contours and builds a neon layer on every 4-row scroll. Measure frame time in phase 10 [RT].
  - L10, L11.
- **Browser and platform:**
  - Blur and hide pause and require an explicit resume (verified). The fixed-step accumulator handles 30–240 Hz (clamped to 15 steps).
  - Body `overflow:hidden` plus preventDefault stops scroll from arrows and Space.
  - Issues: M1 (Firefox), H8 (focus), pad detection (Chrome exposes pads only after a press, so the lobby must tolerate late connects), the audio gesture (the boot gate needs a key or click).
- **State management:**
  - `startGame` fully resets engine state (verified). `returnToTitle` sets `state` directly but the next `startGame` resets everything (acceptable).
  - Issues: H3 (carry-over), B3 (counts leaking into rematch), all ready/seat states (phase 2).
  - Rematch keeps seats and clears ready.
- **Code-quality risks:**
  - Player colours are duplicated in 5 files (L5). `titleMenu.players` is overloaded as seat count, pad count and rematch count (B2/B3).
  - Versus constants are hard-coded (B4). Engine `lives` is used for Versus elimination (handoff 3.5, post-release).
  - game.js is 930 lines, so the new lobby goes in a separate module.
- **Release-build cleanup:**
  - No console spam (only `console.warn` on audio failure).
  - Hidden modes are reachable only by URL hash (fine).
  - B7 art. Keep the disclaimer on the itch page. L7 is accepted.

## Difficulty recommendation (Versus bots only)

Multiple levels are worth it: bots are the only opponents in solo Versus, and today's single level is both too sharp (reaction) and too sloppy (jitter).

Difficulty never touches player or bot speed, scoring, pickups, collision or rules. It lives in `game.options.botLevel`, saved as `astra-bot-level-v1` (validated; bad values fall back to NORMAL).

| Parameter | EASY | NORMAL (default, intended experience) | HARD |
|---|---|---|---|
| Reaction (think interval) | 12 ticks (200 ms) | 8 ticks (133 ms) | 5 ticks (83 ms) |
| Hesitation / wrong turn at a junction | 15% / 8% | 5% / 2% | 2% / 0% |
| Threat awareness radius (rivals, Claude) | 3 / 3 | 5 / 4 | 6 / 5, plus Muse and Gemini |
| Flee scoring | straight line | straight line, avoids dead-end pockets | BFS path distance, 2-tile lookahead |
| Goal commitment | 1.5 s | 1.0 s | 0.6 s (re-targets more precisely) |
| Runner pursuit | only at MAX boost | at the notch | at the notch, intercepts the runner's next junction |
| Hunting | targets the rival's tile | the rival's tile | predicts 2 tiles ahead |
| Closing awareness | band +3 | band +2 | band +1, pre-positions at 70 s |

All randomness stays on `game.random()`, so replays stay exact.

---


---

# Fix status (2026-09-25)

Backup before the fixes: `backups/before-release-fixes-20260925/`.

| ID | Status | What changed |
|---|---|---|
| B1 | Fixed | New `input.js`: every key and pad resolves to a device (`kb:arrows`, `kb:wasd`, `kb:ijkl`, `kb:numpad`, `pad:<index>`, `touch`), matched by `event.code`. Multiplayer matches take input only from each seat's own device; solo accepts any device. The engine ignores `setDirection`/`useSkill` on bot seats. Verified in the browser: WASD steers Sora in solo Versus, and unseated keys and bot seats are ignored. |
| B2 | Fixed | New `lobby.js`: join by pressing a direction or A; ready with all four directions, then ACTION; a 3-second countdown that cancels on any change; bots fill empty Versus seats. The `2`/`3`/`4` quick-starts and desktop click-to-start are gone. |
| B3 | Fixed | Pads keep their `index` and remember their `id`. A seated pad's disconnect pauses the match, and resume is blocked until the pad is back or another device takes over. The same pad reconnecting at any index rebinds. Connecting a pad never changes the player count. Verified with emulated pads. |
| B4 | Fixed | Claude and injections can't turn the last live star into a spirit, and spirits re-form if the last star is eliminated. Sims: all-spirit time went from 22% of match time (longest stretch 72 s) to 0 s. Claude runs at 80% speed in Versus. |
| B5 | Fixed | The glitch stops at the largest central region holding a connected loop (`sanctuaryMargin`: margin 9 on all bundled mazes). It closes one ring at a time and never closes a ring that would eliminate every standing player. Sims: no match ended with nobody standing (0 of 120). |
| B6 | Fixed | A living co-op player pushed below the window by a scroll is deleted; "P2 KEEP UP!" and an alarm warn first. Sim: no ticks with an alive off-screen player (was up to 28.6 s). |
| B7 | Withdrawn | The GITHUB and HUGGINGFACE look-alikes are kept on purpose as homages, and the rule is removed from `build-itch.py`'s blocker list. |
| H1, H2 | Fixed | Bots decide on each new tile or at their reaction interval, keep their goal, prefer straight-ahead routes, and turn back only to flee or after their commit time. EASY/NORMAL/HARD (`BOT_LEVELS` in modes.js) are chosen in the lobby and saved as `astra-bot-level-v1`. Reversals per bot-second: 3.4 before, now about 0.5 (EASY), 0.75 (NORMAL) and 1.2 (HARD, mostly escapes). |
| H3 | Fixed | An input guard on every screen change; results stay up for at least 1.2 s, and pad buttons are re-latched between screens. Verified: mashing A during game over no longer restarts. |
| H4 | Fixed | Pads: Start pauses and resumes, Select quits while paused, A or Start rematches, B returns to the title from results, and LB/RB change the bot level in the lobby. Pause, results and outro texts name pad buttons when a pad is connected. The boot gate still needs one key press or click, because browsers allow audio only after one. |
| H5 | Fixed | Title cards: HOW TO PLAY (goal, keys, multiplayer) on the PLAY row and a mode card on the MODE row. Lobby rules. One-time in-game tips: glitch, stay together, runner, spirit, injection, bug, each power-up's effect, respawn, revive token and spectating. |
| H6 | Fixed | The PLAY row is SOLO / LOCAL MULTIPLAYER. Without a keyboard, gamepad or fine pointer it reads "MULTI: DESKTOP ONLY" and explains why. Touch-only Versus seats one touch player. The meta description and aria text mention local desktop multiplayer. |
| H7 | Fixed | Classic 3P/4P high scores have their own keys. Versus keeps no team high score; the title shows arena wins instead. XP, credits and score achievements count only human points, and FULL PARTY needs four humans. |
| H8 | Fixed | Game keys work while a bezel button has focus (only Enter, Space and Tab stay with the button); MUTE, FULLSCREEN and SHOW PAD hand focus back to the game. |
| H9 | Fixed | Mode events now have sounds, with new clips `alarm`, `victory` and `readyUp`. A human Versus win plays the victory fanfare instead of the game-over sting. |
| H10 | Fixed | A STAY TOGETHER warning. Within 4 rows, the glitch edge flashes with "CLIMB! CLIMB!" and the alarm plays. Every timed effect drains as a bar under its player, in every mode. |
| H11 | Fixed | Achievements that need Benchmark Run or daily runs are hidden from the list and the count while those are unreachable; saved ids are kept. |
| H12 | Fixed | Revive tokens appear only when a spare life remains after the death. |
| H13 | Fixed | A touch SKILL button on the deck in modes with skills. |
| H14 | Tuned | `tuning` data on the Versus ruleset: runner every 10 s, catch at 0.18 boost, Claude at 80% speed. Bot-only sims still show about 10 Claude catches a minute; the handoff targets need a playtest with humans. |
| H15 | Fixed | P1–P4 tags (YOU in solo Versus) above the stars at round start, respawn and pause. HUD columns read "P1 SORA" and "BOT NOVA". |
| M1–M3 | Fixed | Quick-find keys are prevented, keys are matched by position, and digits no longer start games. |
| M4 | Fixed | RATE LIMIT keeps every ghost slowed while it lasts, including ghosts released later and refreshed pickups. |
| M5 | Fixed | The HUD shows the newest effect with its owner ("P2 ..."), plus bars under each player. |
| M6 | Fixed | A co-op results panel with per-player scores and an MVP line; co-op results stay up for 20 s. |
| M7 | Fixed | When every human is out of a Versus match, Enter, A or Start skips to the results, and the simulation finishes the match. |
| M8 | Fixed | Stick hysteresis (press 0.5, release 0.35), and a notice for non-standard pad mappings. |
| M9 | Fixed | Co-op respawns take the start slot farthest from a dangerous ghost. |
| M10 | Fixed | Volume (- / =, saved), a reduced-motion override (R, saved), brighter key hints and friendly screen-reader state names. |
| M11 | Fixed | The glitch deletes at its solid edge; the noise only frays downward. |
| M12 | Fixed | Versus plays a steady arena siren (higher once closing) instead of "returning eyes". |
| M13 | Fixed | Versus results mark YOU, P# or BOT. The bezel readout shows TIME left in Versus and Benchmark Run, ROW climbed in Sunset, and LVL elsewhere (screen readers hear the same). |
| M14, M15 | Fixed | The wardrobe shows SORA, achievements say Sunset, and the mode card replaces the classic-only ghost descriptions while MODE is chosen. |
| M16 | Fixed | The lobby warns when three or more players share one keyboard. |
| L1–L6 | Fixed | Scale Up draws at 2x; the nearest player wins pickup ties; simultaneous deaths both draw; there's one Nova colour; the title draws Sora at 2x and the cast at 1x; the runner and bonus pulse with a glow instead of scaling. |
| L7 | Kept | `window.game` and `window.pacmanDebug` stay, because the backdrop and test fixtures use them. |
| L8 | Fixed | New `tests/input.test.js`, plus new Versus, Sunset and Remix regression tests; 188 node tests pass. |
| L9 | Fixed | README updated. |
| L10, L11 | Fixed | High scores are written on pause, game over, quit and page hide; FX streaks are keyed by seat. |
| L12 | Fixed | "CR" is spelled out as CREDITS on the title, profile, shop prices, results, outro and achievement notices. |

Added after review: a GRAPHICS keycap in the bezel opens a picker with VISUALS (JUICY, JUICY + CRT, PURIST) and MOTION (SYSTEM, REDUCED), so touch and mouse players can change what V and R change on a keyboard. The touch pause screen points to it.

Also fixed while verifying:
- The backdrop no longer throws when the window is 0 × 0.
- Queued notices are capped and cleared when results appear.

**Still needs a person (can't be automated here):**
- Real keyboards with 3–4 players (ghosting depends on the keyboard).
- Real controllers: Xbox, DualSense and a generic pad, in Chrome and Firefox, including a pad pressed before the page loads.
- Firefox quick find (`/` and `'`).
- Listening to the alarm, victory and ready-up clips, and to the whole mix.
- A Versus playtest with humans against the handoff targets: a runner catch about every 20 s, and most rounds decided while the arena closes.
- A colour-blind check of the P-tags and HUD.
- Frame time over a long Sunset run on a low-end machine.
