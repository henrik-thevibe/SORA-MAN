---
name: new-map
description: Add a new bundled maze to Astra-Man. Use when asked to design, add or import a maze, level layout or map (including one pasted as a share link or code from the maze editor).
---

# Add a maze

Mazes are data in `maps.js`. The engine derives everything else from the rows, and `analyzeMap` in `engine.js` is the rulebook.

## 1. Back up
Run the `backup` skill first, with the label `before-map-<id>`.

## 2. Get the rows
- **From a share link or code**, for example `index.html#map=1.29w…`: decode it with `node -e "console.log(JSON.stringify(require('./maps.js').decodeRows('<code>'), null, 1))"`.
- **From scratch**, write 31 strings of 28 characters:

  | Character | Meaning |
  |---|---|
  | `.` | dot |
  | `P` | power pellet (use four) |
  | space | empty corridor |
  | `--` | the ghost-house gate |
  | `SS` | the player start |
  | anything else, conventionally `#` | wall |

  The ghost house is the 8 × 5 pen whose top row holds the gate at columns 3–4 of the pen. Its interior must be spaces, and its walls must be solid.

  Mirroring a 14-column half keeps a maze symmetric: `row + [...row].reverse().join("")`.

Design rules the validator enforces:
- Every pellet is reachable.
- There are **no dead ends**.
- Each tunnel is open at both edges of its row.
- The tile above the gate, the bonus spot (the row under the pen) and both co-op starts (two tiles either side of the start) are on reachable corridors.

It warns about 2 × 2 open areas and about any power-pellet count other than four. Keep corridors one tile wide and wall blocks at least two tiles thick.

## 3. Validate while iterating
```bash
node -e "const E=require('./engine.js');const r=E.analyzeMap({rows:require('./rows.json')});console.log(r.errors,r.warnings,r.map&&r.map.total)"
```
Fix every error. An error names its tile (`Dead end at 12,20`) as column,row.

## 4. Add it to `maps.js`
Append an entry to `MAPS` with these fields:
- `id`: lower-case, used in `#maze=<id>`;
- `name`: upper case, 16 characters at most, drawn in the bitmap font. It supports A–Z, 0–9 and the symbols `! . - + : /`;
- `wall`: a hex colour that reads well against black and isn't gold, which is Astra's colour;
- `about`: one sentence;
- `rows`.

Add `dark: true` only for a lights-out maze. `maps.js` uses CRLF line endings, so keep them.

## 5. Test and look
- Run `node tests/engine.test.js`. It validates every bundled maze and plays each one solo and co-op, so the list of ids in the test "every bundled maze is valid…" must be updated.
- Run the other suites: `node tests/art.test.js`, `node tests/effects.test.js` and `node tests/modes.test.js`.
- Start the `astra-man` preview from `.claude/launch.json`. Open `index.html#maze=<id>`, press Enter and take a screenshot. `pacmanDebug.hold(true)` and `pacmanDebug.step(n)` make frames repeatable.
- Update the maze table in `README.md`.
