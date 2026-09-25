# Handoff: refining multiplayer

This handoff covers local co-op (2–4 players), Versus Arena (four seats, bots fill the empty ones), and the groundwork for online play (Phase 6). Each item names the files involved and says when it counts as done. **Classic solo must stay arcade-exact.** The long deterministic-play test in `tests/engine.test.js` guards this; run all eight suites after every change:

```
node --test tests/engine.test.js tests/audio.test.js tests/art.test.js tests/effects.test.js tests/modes.test.js tests/meta.test.js tests/hallucination.test.js tests/versus.test.js
```

Back up first (`backups/before-<label>-<date>/`), and give each changed script a new `?v=` in `index.html`.

## Where things stand

| Area | What exists | Where |
|---|---|---|
| Players | Up to four: Astra, Nova, Vega, Lyra. Spawns use offsets 2, −2, 4, −4 from the maze spawn. | `engine.js` `PLAYERS`, `playerSpawn`, `startGame` |
| Lives | One shared pool: 3 solo, then `n + 3` (Versus uses `lives: {n: n}` so nobody is benched). | `engine.js` `startGame`, `modes.js` Versus ruleset |
| Death and respawn | A fallen player respawns after `RESPAWN_SECONDS` with a short immunity while a partner lives. Hallucination uses revive tokens instead (`autoRespawn` hook). | `engine.js` `updatePlayers`, `modes.js` Hallucination |
| Ghost targeting | Each ghost chases the nearest living, non-immune player. | `engine.js` `targetForGhost` |
| Keyboard | Arrows / WASD / IJKL / numpad 8456 for P1–P4; skills on `/ . RShift`, `Q E LShift`, `U O`, numpad `0 7 9`. Keys for an absent player steer P1. | `game.js` `KEY_DIR`, `CODE_DIR`, `SKILL_KEYS` |
| Gamepads | Polled every frame. Pads take seats in the order they connected, and connecting one raises the title's player count. | `game.js` `pollGamepads` |
| Title | The PLAY row picks 1–4 players (humans plus bots in Versus). | `game.js` `titleMenu`, `titleRow` |
| HUD | Four score columns for 3–4 players (BOT tags). Skill or boost bars sit under the scores. Life icons are capped by the space the mode's bottom-row readouts leave. | `game.js` `drawHUD`, `overlays.js` `drawHud` |
| Versus | Bots, the runaway power pellet, spirits, NPC roles (Claude catches, Muse bugs, Gemini injects), the closing arena and placements. | `modes.js` from the `VERSUS ARENA` comment |
| Determinism | All rules randomness goes through `game.random()`; no `Math.random` in `engine.js` or `modes.js`. Bots replay exactly (versus test). | `engine.js`, `tests/versus.test.js` |

## 1. Local input (do first; it limits everything else)

1. **Keyboard rollover.** Most keyboards can't register every combination of 3–4 players holding keys at once. Arrows + WASD + IJKL + numpad will ghost. So:
   - recommend gamepads for 3–4 players, and say so on the title when the PLAY row is above 2 and no pads are connected ("3+ PLAYERS WORK BEST WITH PADS");
   - add a tiny "input check" to the title: pressing any player's keys flashes their star.

   *Done when:* the hint shows, and every mapped key visibly lights its player on the title.
2. **Seat claiming (lobby).** Pads are seated by connection order today, and a pad and a key set can both drive seat 1. Add a join step after PLAY, like Party Royale's lobby:
   - any key set, pad or touch deck presses "go" to claim the next free seat, showing that seat's star and device icon;
   - it starts when the claimer of seat 1 confirms;
   - store the mapping in `game.options.seats`, so `setDirection` receives the seat and not the device.

   *Done when:* two pads plus WASD can take seats 2, 1 and 3 in any order, and each device steers only its seat.
3. **Absent-player keys.** Keys for a seat that isn't playing currently steer P1. That's handy solo but confusing in a 2P game where a third person mashes IJKL. Keep the fallback only for 1P games.
4. **Touch.** Multiplayer is keyboard or pad only. At minimum, the touch deck needs a skill button for Remix. Two-thumb split-screen touch is out of scope.

## 2. Co-op balance and clarity

1. **Scale difficulty with player count.** Four players with nearest-player targeting make classic ghosts easy. Options, each switchable in the ruleset (never in Classic solo):
   - fright time × `1 / sqrt(n)`;
   - Elroy thresholds earlier by 10 dots per extra player;
   - or one extra Claude (Blinky) at 4P.

   Expose it as ruleset data (`coopScaling`), and test that `n = 1` is untouched.
2. **Who is who.** Four stars of the same shape are told apart only by colour. Add a small `1`–`4` tag above each player for the first 3 s of each life and while respawning (`overlays.js` `drawPlayerMarks`). This also helps colour-blind players.
3. **Respawn placement.** Respawns use the spawn offsets and can land next to a ghost. Pick the free spawn tile farthest from the nearest non-frightened ghost; keep the immunity.
4. **Results for co-op.** Classic and Remix co-op end on a plain GAME OVER. Add the results panel for `playerCount > 1`: team score, per-player score bars, and an MVP line (most ghosts eaten). Reuse `drawResults`.
5. **Shared lives HUD.** Up to six icons show (three with bottom-row readouts). Past that, show `x7` next to the icons instead of dropping them silently.

## 3. Versus Arena tuning

1. **Constants into ruleset data.** Make these data fields so playtests can tune them without code edits:
   - `ROUND_SECONDS 120`, `CLOSE_AT 75`, `CLOSE_EVERY 3.2`, `MAX_MARGIN 11`;
   - `BOOST_PER_DOT 0.008`, `MAX_BOOST 0.4` and `CATCH_BOOST 0.2`.

   Playtest targets:
   - about one runner catch every 20 s;
   - most rounds decided in the closing phase;
   - no round where everyone is a spirit for more than 5 s.
2. **Bot difficulty.** There's one bot level: it thinks every 3 ticks and hesitates 6% of the time (`thinkBot`). Add EASY / NORMAL / HARD (hesitation 15 / 6 / 2%, thinking every 6 / 3 / 2 ticks, flee radius 4 / 5 / 6) and a title row for it when the mode is Versus. Keep bots on `game.random()` so replays stay exact.
3. **Bots never use items or skills.** Once Versus gets power-ups, give bots a simple "use it when a target is within N tiles" rule.
4. **Grok sits out.** It's filtered out at round start. Either give it an arena role (a sleeper that wakes when anyone passes, and steals boost) or document why it's absent in the mode's `about`.
5. **Per-player lives.** Versus fakes elimination with `lives: {n: n}` so no seat is benched. Add engine support for `livesMode: "each"` (a lives array per player) and move Versus to it. The results then show lives left instead of relying on `pac.out`.
6. **Human feedback.** With one human, tag them `YOU` in the HUD column. When a human becomes a spirit, show "TAG A STAR TO COME BACK" once per match.
7. **Rematch flow.** START after results replays with the same seats (it now uses `titleMenu.players`). Add "B / Esc = back to title" to the results footer.

## 4. Online multiplayer groundwork (Phase 6 prerequisites)

The plan is WebRTC between browsers, with Trystero room codes, no server of our own, and working inside itch's iframe. The engine needs these first. Each is testable in Node without any networking:

1. **Tick-stamped input queue.** `setDirection` (`engine.js` ~898) writes `pac.wanted` straight away, from outside the tick. Change it to push `{tick, player, dir}` onto a queue that the start of `tick()` drains. The same goes for `useSkill`.
   - Local play feels identical (a one-tick delay at most).
   - *Test:* inputs recorded with their ticks and replayed into a fresh game give identical state.
2. **A global frame counter.** `tickCount` only advances inside `tickPlaying` (`engine.js` ~981). Add a counter that advances every `tick()` whatever the state, and stamp inputs with it.
3. **Snapshot / restore.**
   - `game.snapshot()` returns plain data: players, ghosts (including `brainState`), pellets, items, statuses, timers, `ruleData`, the RNG state and counters.
   - `game.restore(data)` rebuilds the game from it.
   - Registries (rulesets, brains, statuses, power-ups) must be referenced by id only; no functions or closures in state.
   - *Test:* snapshot at tick N, run to M, restore, run to M again: the state must be deep-equal. Cover Classic, Remix, Hallucination and Versus.
4. **Checksum.** A cheap hash of the snapshot every 60 ticks, used to detect desync. On a mismatch the host sends a full snapshot. This also covers floating-point differences between browsers.
5. **Presentation from confirmed events only.** Effects, audio and notices consume `game.events`. With rollback, re-simulated ticks must not replay sounds or particles, so tag events with their tick and drop any already presented.
6. **Transport, in order:**
   1. delay-based lockstep for 2P co-op (2–4 frames of input delay);
   2. then Versus with bots simulated on every peer (deterministic);
   3. then rollback (keep about 8 snapshots) if cornering feels late.

   Invite by room code in the URL hash (`#room=ASTRA-7KQ2`).

## Suggested order

1. Items 1.1–1.3 (input: rollover hint, seat claiming, absent keys).
2. Items 4.1–4.3, which are pure engine work and unlock online play.
3. Items 2.1 and 2.2 (co-op scaling and player tags).
4. Items 3.1 and 3.2 (Versus data and bot difficulty), with a playtest.
5. Everything else, then Phase 6 transport.

## Watch out for

- **Line endings.** Most JS files and the engine tests use CRLF. `index.html`, `README.md` and the newer tests use LF. Keep each file's endings.
- **Classic solo stays exact.** Every co-op or Versus rule goes through ruleset hooks or `playerCount > 1` checks.
- **No `Math.random`** in rules or bots. Use `game.random()`.
- **Browser storage.** The high-score key is per ruleset and player count (`bestKey`), so a new seat model must not change those keys.
- **Optional browser suites.** `tests/browser.test.js` and `tests/astra-browser.test.js` need Playwright, which isn't installed here. They start games with Enter; a direction key on the title now moves the menu cursor instead of starting.
