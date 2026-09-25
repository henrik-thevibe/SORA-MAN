---
name: new-powerup
description: Add a power-up (a pickup that grants a timed ability) to Astra-Man's REMIX mode. Use when asked for a new power-up, pickup, buff or ability item.
---

# Add a power-up

A power-up is a pickup plus a **status** of the same id on whoever collects it. Both are registered in `modes.js` through the `powerUp({...})` helper. The engine does the rest:
- it spawns the pickups through the `powerups` mutator;
- it applies the status and ticks it;
- it shows the name and timer in the HUD through `overlays.js`;
- it plays the collect effect through `effects.js`.

## 1. Back up
Run the `backup` skill with the label `before-powerup-<id>`.

## 2. Register it in `modes.js`
Add it next to the others, in the Power-ups section:

```js
powerUp({
  id: "kebab-case-id",
  name: "SHORT NAME",   // HUD label and the pickup chip's label: A-Z 0-9 -; the chip fits two lines of 8
  short: "SN",          // exactly two letters, for the profile screen's loadout list
  icon: "ghost",        // optional: prints an icon from item-art.js LABEL_ICONS on the chip instead of the name
  color: "#rrggbb",
  seconds: 6,
  about: "One sentence for the README.",
  status: {
    // Any of these; `game` is the PacmanGame.
    speed: 1.2,                                    // multiplies the holder's speed (number or fn)
    hidden: true,                                  // ghosts stop targeting the holder
    collision(game, outcome, pac, ghost, side) {}, // return "eat" | "zap" | "kill" | "ignore" to change a touch
    onApply(game, pac, status) {},
    onTick(game, pac, status, dt) {},              // runs every tick while active, after movement
    onExpire(game, pac, status) {},
  },
});
```

Useful engine helpers:
- `game.zapGhost(ghost, pac)` sends a ghost home and scores it;
- `game.addStatus(actor, id, seconds)`;
- `game.eatPellet(x, y, pac, false)` eats without the arcade stall;
- `game.collectItem(item, pac)`;
- `game.random()` is seeded, so never use `Math.random` in rules;
- `game.emit(name, data)` feeds sound and effects;
- `game.ruleState(id)` gives per-game scratch state.

Helpers in `modes.js` itself: `alive(ghost)`, `distance2(a, b)`, `beamCells(game, pac)` and `openTiles(game, clearance)`.

## 3. Visuals and sound, if needed
- Anything the player must see goes in `overlays.js`, because it draws even in Purist mode. Examples: `drawBeams`, `drawHazards` and `playerStyle`.
- Pure flourish goes in `effects.js` `onEvent`, keyed on any new event you emit.
- Map new events to a clip in `audio.js` `play()`.

## 4. Test
- Add a test to `tests/modes.test.js` in the style of the existing ones. Use `give(g, "<id>")` to collect it, then assert its effect.
- Update the id list in the "registries hold…" test.
- Run all five suites: `engine`, `audio`, `art`, `effects` and `modes`.
- Check it in the browser in REMIX mode. Spawn it next to Astra with `game.spawnItem({kind:"powerup", id:"<id>", x: game.pacman.x, y: game.pacman.y})`.
- Add it to the power-up table in `README.md`.
