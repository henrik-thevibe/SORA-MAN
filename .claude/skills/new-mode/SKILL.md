---
name: new-mode
description: Add a game mode (ruleset) or a reusable mutator to Astra-Man, such as a timed mode, an endless mode or a twist on the arcade rules. Use when asked for a new mode, rule change, mutator or challenge.
---

# Add a mode or mutator

A **ruleset** is a game mode: data plus hook methods, registered with `E.registerRuleset` in `modes.js`. A **mutator** is a reusable bundle of hooks (`E.registerMutator`) that rulesets list in `mutators: [...]`. The G key on the title screen cycles modes in registration order. High scores are kept per mode automatically.

## 1. Back up
Run the `backup` skill with the label `before-mode-<id>`.

## 2. Pick the hooks
The engine calls them at fixed points. The full list is documented above `RULESETS` in `engine.js`.

**Notifications:**

| Hook | When |
|---|---|
| `onStart(game)` | a game begins |
| `onRoundStart(game, afterLife)` | a round begins |
| `onTick(game, dt)` | every playing tick, including the ghost-eat pause, so check `game.freezeTimer` |
| `onPellet(game, pac, kind, x, y)` | a pellet is eaten |
| `onGhostEaten(game, ghost, pac, value)` | a frightened ghost is eaten |
| `onDeath(game, pac)` | a player is caught |
| `onItem(game, item, pac)` | a pickup is collected |
| `onSkill(game, pac)` | a skill is used |

**Values** (return a replacement, or `undefined` to leave it):

| Hook | Changes |
|---|---|
| `pelletValue(game, value, pac, kind)` | points for a pellet |
| `ghostValue(game, value, chain)` | points for a ghost |
| `keepChain` | whether a new power pellet keeps the ghost chain |
| `collision(game, outcome, pac, ghost)` | what a touch does: `"eat"`, `"zap"`, `"kill"` or `"ignore"` |
| `speedScale(game, scale, actor)` | speed multiplier |
| `reverseOnModeChange` | whether ghosts reverse on scatter/chase changes |
| `fruitEnabled` | whether arcade fruit appears |
| `elroyEnabled` | whether Cruise Elroy applies |
| `frightDuration` | fright time |
| `extraLifeEvery` | points per extra life, or `null` for the single arcade extra life |
| `levelCleared` | return `true` to take over what happens when the board is empty |
| `mapForLevel(game, map, level)` | which maze to play |
| `ghostEatPause` | length of the ghost-eat pause |
| `zapValue` | points for a zapped ghost |
| `canEat(game, true, pac)` | whether a player may eat dots |
| `canCollect(game, true, item, pac)` | whether a player may pick up an item |
| `steer(game, direction, pac)` | rewrites player input, for example inverted controls |
| `autoRespawn(game, true, pac)` | `false` to handle co-op revives yourself |

`onAfterMove(game, dt)` runs after movement and collisions each tick; use it for player-versus-player contact.

**Ruleset data fields:**
- `name` and `about`;
- `lives: {1, 2}`;
- `mutators`;
- `brains: { ghostId: brainId }`;
- `skills: { astra, nova }`;
- `results: true`, which gives the results screen at game over;
- `gameOverHold`, in seconds;
- `contestants`, which seats a full field and flags players beyond the humans as `pac.bot`;
- `resultLines(game)`, which returns `[[label, value]]` for the results screen;
- `placements(game)`, which gives a ranked results list instead of point bars.

**Open-field maps.** A map compiled with `houseless: true` has no ghost house. Add ghosts with `game.spawnGhost(id, x, y, { brain })`; eaten ghosts vanish. Hallucination is the worked example: it scrolls by rebuilding its 28 × 31 window, and Versus Arena shows bots and player-versus-player rules.

**Tools:**
- `game.ruleState(id)` for per-game state;
- `game.random()`, which is seeded, so never use `Math.random`;
- `game.spawnItem({ kind, x, y, timeLeft, persist })`;
- `game.addScore(value, pac, "dot" | "ghost" | "bonus")`;
- `game.endGame(reason)`;
- `game.emit(name, data)`.

Benchmark Run in `modes.js` is the worked example: a timer, swapping maze halves, a speed ramp, custom scoring and a results screen.

## 3. Keep Classic exact
Never change a hook's default behaviour. Classic must play identically; the long deterministic-play test in `tests/engine.test.js` guards this.

## 4. HUD and visuals
- Mode-specific readouts, such as Benchmark's clock and speed, go in `overlays.js` `drawHud`.
- Flourishes for new events go in `effects.js` `onEvent`.

## 5. Test
- Add a section to `tests/modes.test.js` that covers each hook you used.
- Include a seeded determinism check like the one in the final test.
- Update the ruleset id list in the "registries hold…" test.
- Run all five suites.
- Check the title's mode line and a full game in the browser, then update `README.md`.
