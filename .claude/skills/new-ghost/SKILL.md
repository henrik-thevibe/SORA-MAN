---
name: new-ghost
description: Add a ghost behaviour ("brain") to Astra-Man and give it to a ghost in a mode. Use when asked for a new ghost AI, enemy behaviour, or to change how a ghost hunts.
---

# Add a ghost brain

A brain decides how a ghost hunts. The four arcade brains (`blinky`, `pinky`, `inky`, `clyde`) live in `engine.js`. New ones go in `modes.js` and are assigned per mode through a ruleset's `brains` map, for example `{ inky: "sleeper" }`. The ghost keeps its art and name; only its behaviour changes.

## 1. Back up
Run the `backup` skill with the label `before-brain-<id>`.

## 2. Register it in `modes.js`, in the Ghost brains section
```js
E.registerBrain({
  id: "kebab-case-id",
  about: "One sentence.",
  target(game, ghost, pac) { return [x, y]; },      // chase target in tile units; pac is the nearest visible player
  choose(game, ghost, choices) { return undefined; }, // optional: return a direction from choices to override targeting
  speed(game, ghost) { return 1; },                 // optional multiplier
  tick(game, ghost, dt) {},                         // optional, every playing tick; keep state in ghost.brainState
});
```

Rules the engine keeps for you:
- Scatter mode still sends ghosts to their corners, so `target` runs only in chase.
- Frightened ghosts wander randomly.
- Eaten ghosts head home.
- `game.randomChoice(ghost, choices)` is the ghost's seeded random pick.
- `lineOfSight(game, a, b, range)` and `tileTarget(pac)` are ready in `modes.js`.

Emit an event (`game.emit("ghostWakes", { ghost: ghost.id })`) when the behaviour changes, so effects and sound can react. If players need a cue, add a mark in `overlays.js` `drawGhostMarks`, like the sleeper's `Z` or the charger's `!`.

## 3. Use it
Add it to a ruleset's `brains`, for example REMIX in `modes.js`, or make a new mode with the `new-mode` skill. Classic must keep the arcade brains.

## 4. Test
- Add a test to `tests/modes.test.js` that puts the ghost and a player in a known spot with the `loose()` helper, then checks `g.targetForGhost(ghost)` and `g.speedScale(ghost)`, or calls the brain's `tick` directly.
- Update the id list in the "registries hold…" test.
- Run all five suites.
- Watch it in the browser with `pacmanDebug.hold(true)` and `pacmanDebug.step(n)`.
