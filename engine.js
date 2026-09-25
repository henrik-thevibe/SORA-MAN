/*
 * PAC-MAN (1980) inspired deterministic maze engine.
 * Original arcade rules are used where they can be represented faithfully in
 * a small, dependency-free browser game; simulation runs at a fixed 60 Hz.
 */
(function (root) {
  "use strict";

  const COLS = 28;
  const ROWS = 31;
  const DIRECTIONS = Object.freeze([
    Object.freeze({ name: "up", x: 0, y: -1, key: "UP" }),
    Object.freeze({ name: "left", x: -1, y: 0, key: "LEFT" }),
    Object.freeze({ name: "down", x: 0, y: 1, key: "DOWN" }),
    Object.freeze({ name: "right", x: 1, y: 0, key: "RIGHT" }),
  ]);
  const MODES = Object.freeze([
    Object.freeze({ name: "SCATTER", duration: 7 }),
    Object.freeze({ name: "CHASE", duration: 20 }),
    Object.freeze({ name: "SCATTER", duration: 7 }),
    Object.freeze({ name: "CHASE", duration: 20 }),
    Object.freeze({ name: "SCATTER", duration: 5 }),
    Object.freeze({ name: "CHASE", duration: 20 }),
    Object.freeze({ name: "SCATTER", duration: 5 }),
    Object.freeze({ name: "CHASE", duration: Infinity }),
  ]);
  // Original board map: Namco maze tile codes. Dots, power pellets, empty
  // corridor, and the gate are preserved; all other symbols are wall tiles.
  const MAZE = Object.freeze([
    "0UUUUUUUUUUUU45UUUUUUUUUUUU1",
    "L............rl............R",
    "L.ebbf.ebbbf.rl.ebbbf.ebbf.R",
    "LPr  l.r   l.rl.r   l.r  lPR",
    "L.guuh.guuuh.gh.guuuh.guuh.R",
    "L..........................R",
    "L.ebbf.ef.ebbbbbbf.ef.ebbf.R",
    "L.guuh.rl.guuyxuuh.rl.guuh.R",
    "L......rl....rl....rl......R",
    "2BBBBf.rzbbf rl ebbwl.eBBBB3",
    "     L.rxuuh gh guuyl.R     ",
    "     L.rl          rl.R     ",
    "     L.rl mjs--tjn rl.R     ",
    "UUUUUh.gh i      q gh.gUUUUU",
    "      .   i      q   .      ",
    "BBBBBf.ef i      q ef.eBBBBB",
    "     L.rl okkkkkkp rl.R     ",
    "     L.rl          rl.R     ",
    "     L.rl ebbbbbbf rl.R     ",
    "0UUUUh.gh guuyxuuh gh.gUUUU1",
    "L............rl............R",
    "L.ebbf.ebbbf.rl.ebbbf.ebbf.R",
    "L.guyl.guuuh.gh.guuuh.rxuh.R",
    "LP..rl.......  .......rl..PR",
    "6bf.rl.ef.ebbbbbbf.ef.rl.eb8",
    "7uh.gh.rl.guuyxuuh.rl.gh.gu9",
    "L......rl....rl....rl......R",
    "L.ebbbbwzbbf.rl.ebbwzbbbbf.R",
    "L.guuuuuuuuh.gh.guuuuuuuuh.R",
    "L..........................R",
    "2BBBBBBBBBBBBBBBBBBBBBBBBBB3",
  ]);

  if (MAZE.length !== ROWS || MAZE.some((row) => row.length !== COLS)) {
    throw new Error("The arcade maze must be exactly 28 by 31 tiles.");
  }

  const GHOSTS = Object.freeze([
    Object.freeze({ id: "blinky", name: "BLINKY", nickname: "SHADOW", color: "#ff2424", spawn: [13.5, 11.5], release: 0, corner: [26.5, -3.5], seed: 0x15a31 }),
    Object.freeze({ id: "pinky", name: "PINKY", nickname: "SPEEDY", color: "#ff88c8", spawn: [13.5, 14.5], release: 0, corner: [1.5, -3.5], seed: 0x28b42 }),
    Object.freeze({ id: "inky", name: "INKY", nickname: "BASHFUL", color: "#35e7eb", spawn: [11.5, 14.5], release: 30, corner: [26.5, 34.5], seed: 0x39c53 }),
    Object.freeze({ id: "clyde", name: "CLYDE", nickname: "POKEY", color: "#ffad53", spawn: [15.5, 14.5], release: 60, corner: [1.5, 34.5], seed: 0x4ad64 }),
  ]);
  const BONUS = Object.freeze([
    Object.freeze({ name: "BOOKS", value: 100, color: "#ff5a4e" }),
    Object.freeze({ name: "GITHUB", value: 300, color: "#dfe3ee" }),
    Object.freeze({ name: "HUGGINGFACE", value: 500, color: "#ffd21e" }),
    Object.freeze({ name: "WEIGHTS", value: 700, color: "#b4b9c9" }),
    Object.freeze({ name: "SKILLS", value: 1000, color: "#9fb2d9" }),
    Object.freeze({ name: "API KEY", value: 2000, color: "#ffd21e" }),
    Object.freeze({ name: "BROWSER", value: 3000, color: "#2ccff7" }),
    Object.freeze({ name: "ROOT", value: 5000, color: "#3ef06a" }),
  ]);

  function opposite(direction) {
    return direction < 0 ? -1 : (direction + 2) % 4;
  }

  function tileCenter(position) {
    return Math.round(position - 0.5) + 0.5;
  }

  function tileAt(position) {
    return Math.floor(position);
  }

  const EPSILON = 1e-8;
  function isCentered(actor) {
    return Math.abs(actor.x - tileCenter(actor.x)) < EPSILON &&
      Math.abs(actor.y - tileCenter(actor.y)) < EPSILON;
  }

  // The target is the next HALF-integer, even after crossing a tile boundary.
  function centerAhead(position, sign) {
    return sign > 0 ? Math.floor(position - 0.5 + EPSILON) + 1.5 :
      Math.ceil(position - 0.5 - EPSILON) - 0.5;
  }

  // ---- Maps ------------------------------------------------------------------
  // Legend: "." dot, "P" power pellet, " " empty, "--" the ghost-house
  // gate, "SS" the player start (optional; `spawn` may be given instead), and
  // any other character is wall. The ghost house is a fixed 8x5 pen found from
  // its gate. Open space counts only when reachable from the start, so pockets
  // inside wall islands stay solid, and a row whose two edge tiles are both
  // reachable becomes a wrap-around tunnel.
  const HOUSE_WIDTH = 8, HOUSE_HEIGHT = 5;
  // Blinky waits above the gate; the others sit inside, relative to the pen.
  const GHOST_OFFSETS = Object.freeze([[3.5, -0.5], [3.5, 2.5], [1.5, 2.5], [5.5, 2.5]]);
  const CLASSIC_DOTS = 244;
  const OPEN_CELLS = new Set([".", "P", " ", "-", "S"]);

  // Open-field maps (`houseless: true`) have no ghost house: rulesets spawn
  // their own ghosts, and eaten ghosts vanish. They skip the arcade layout
  // rules because a scrolling ruleset rebuilds them from generated rows.
  function compileOpenField(def, rows) {
    const errors = [];
    if (!Array.isArray(def.spawn)) errors.push("An open-field map needs a spawn point.");
    const kinds = rows.map((row) => Array.from(row, (cell) => {
      if (cell === ".") return "dot";
      if (cell === "P") return "power";
      return OPEN_CELLS.has(cell) && cell !== "-" ? "floor" : "wall";
    }));
    const tunnelRows = new Set();
    for (let y = 0; y < ROWS; y += 1) if (kinds[y][0] !== "wall" && kinds[y][COLS - 1] !== "wall") tunnelRows.add(y);
    for (const y of tunnelRows) {
      for (let x = 0; x < COLS && kinds[y][x] === "floor"; x += 1) kinds[y][x] = "tunnel";
      for (let x = COLS - 1; x >= 0 && kinds[y][x] === "floor"; x -= 1) kinds[y][x] = "tunnel";
    }
    const pellets = new Uint8Array(COLS * ROWS);
    let total = 0;
    rows.forEach((row, y) => {
      for (let x = 0; x < COLS; x += 1) {
        if (row[x] === ".") { pellets[y * COLS + x] = 1; total += 1; }
        else if (row[x] === "P") { pellets[y * COLS + x] = 2; total += 1; }
      }
    });
    if (errors.length) return { errors, warnings: [], map: null };
    const spawn = Object.freeze([def.spawn[0], def.spawn[1]]);
    return {
      errors, warnings: [],
      map: Object.freeze({
        id: String(def.id || "open"), name: String(def.name || "OPEN").toUpperCase(),
        wall: typeof def.wall === "string" ? def.wall : null, houseless: true,
        // Optional: one wall colour per row (drawn as a gradient) and a darkness strength from 0 to 1.
        wallRows: Array.isArray(def.wallRows) && def.wallRows.length === ROWS ? Object.freeze(def.wallRows.slice()) : null,
        dark: def.dark === true || def.darkness > 0,
        darkness: typeof def.darkness === "number" ? Math.max(0, Math.min(1, def.darkness)) : def.dark === true ? 1 : 0,
        rows: Object.freeze(rows.slice()), kinds: Object.freeze(kinds.map((row) => Object.freeze(row))), tunnelRows,
        house: null, ghostSpawns: Object.freeze([]), spawn,
        fruit: Object.freeze(Array.isArray(def.fruit) ? [def.fruit[0], def.fruit[1]] : spawn.slice()), pellets, total,
      }),
    };
  }

  function analyzeMap(def) {
    const errors = [], warnings = [];
    const result = (map = null) => ({ errors, warnings, map });
    const fail = (message) => { errors.push(message); return result(); };
    const rows = def && def.rows;
    if (!Array.isArray(rows) || rows.length !== ROWS || rows.some((row) => typeof row !== "string" || row.length !== COLS)) {
      return fail(`The maze must be exactly ${COLS} by ${ROWS} tiles.`);
    }
    if (def.houseless) return compileOpenField(def, rows);
    const gates = [], starts = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < COLS; x += 1) {
        if (row[x] === "-") gates.push([x, y]);
        if (row[x] === "S") starts.push([x, y]);
      }
    });
    const pair = (cells) => cells.length === 2 && cells[0][1] === cells[1][1] && cells[1][0] === cells[0][0] + 1;
    if (!pair(gates)) return fail("The ghost house needs exactly two gate tiles (--) side by side.");
    const hx = gates[0][0] - 3, hy = gates[0][1];
    if (hx < 1 || hx + HOUSE_WIDTH > COLS - 1 || hy < 2 || hy + HOUSE_HEIGHT >= ROWS - 1) {
      return fail("The ghost house must sit inside the maze, with room for a corridor above and below it.");
    }
    const inHouse = (x, y) => x > hx && x < hx + HOUSE_WIDTH - 1 && y > hy && y < hy + HOUSE_HEIGHT - 1;
    for (let y = hy; y < hy + HOUSE_HEIGHT; y += 1) {
      for (let x = hx; x < hx + HOUSE_WIDTH; x += 1) {
        const cell = rows[y][x];
        if (inHouse(x, y) && cell !== " ") return fail(`The inside of the ghost house must be empty (tile ${x},${y}).`);
        if (!inHouse(x, y) && cell !== "-" && OPEN_CELLS.has(cell)) return fail(`The ghost house wall has a hole at ${x},${y}.`);
      }
    }
    let spawn;
    if (starts.length) {
      if (!pair(starts)) return fail("The player start needs exactly two S tiles side by side.");
      spawn = [starts[0][0] + 0.5, starts[0][1] + 0.5];
    } else if (Array.isArray(def.spawn)) spawn = [def.spawn[0], def.spawn[1]];
    else return fail("Mark the player start with two S tiles side by side.");

    const kinds = rows.map((row, y) => Array.from(row, (cell, x) => {
      if (cell === ".") return "dot";
      if (cell === "P") return "power";
      if (cell === "-") return "gate";
      if (cell === " " || cell === "S") return inHouse(x, y) ? "house" : "open";
      return "wall";
    }));
    const passable = (x, y) => kinds[y][x] !== "wall" && kinds[y][x] !== "house" && kinds[y][x] !== "gate";
    const [sx, sy] = [Math.floor(spawn[0]), Math.floor(spawn[1])];
    if (sx < 0 || sx >= COLS || sy < 0 || sy >= ROWS || !passable(sx, sy)) return fail("The player start must be on an open corridor.");

    // Flood from the start; a second pass may cross the tunnels it found.
    const reached = new Uint8Array(COLS * ROWS);
    const tunnelRows = new Set();
    const flood = (wrap) => {
      const queue = [];
      for (let i = 0; i < reached.length; i += 1) if (reached[i]) queue.push([i % COLS, Math.floor(i / COLS)]);
      if (!queue.length) { reached[sy * COLS + sx] = 1; queue.push([sx, sy]); }
      for (let i = 0; i < queue.length; i += 1) {
        const [x, y] = queue[i];
        for (const d of DIRECTIONS) {
          let nx = x + d.x;
          const ny = y + d.y;
          if (wrap && tunnelRows.has(ny)) nx = (nx + COLS) % COLS;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || reached[ny * COLS + nx] || !passable(nx, ny)) continue;
          reached[ny * COLS + nx] = 1;
          queue.push([nx, ny]);
        }
      }
    };
    flood(false);
    const isReached = (x, y) => reached[y * COLS + x] === 1;
    for (let y = 0; y < ROWS; y += 1) {
      const left = isReached(0, y), right = isReached(COLS - 1, y);
      if (left && right) tunnelRows.add(y);
      else if (left || right) errors.push(`Row ${y} opens at one edge only; a tunnel needs both ends open.`);
    }
    flood(true);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const kind = kinds[y][x];
        if (kind === "open") kinds[y][x] = isReached(x, y) ? "floor" : "wall";
        else if ((kind === "dot" || kind === "power") && !isReached(x, y)) errors.push(`The ${kind} at ${x},${y} can't be reached.`);
      }
    }
    // Ghosts slow down on the empty run leading into each tunnel mouth.
    for (const y of tunnelRows) {
      for (let x = 0; x < COLS && kinds[y][x] === "floor"; x += 1) kinds[y][x] = "tunnel";
      for (let x = COLS - 1; x >= 0 && kinds[y][x] === "floor"; x -= 1) kinds[y][x] = "tunnel";
    }

    const door = [hx + 3.5, hy - 0.5];
    const fruit = Array.isArray(def.fruit) ? [def.fruit[0], def.fruit[1]] : [hx + 3.5, hy + HOUSE_HEIGHT + 0.5];
    const mustReach = [["The tile above the gate", door], ["The bonus spot", fruit],
      ["Nova's co-op start", [spawn[0] - 2, spawn[1]]], ["Sora's co-op start", [spawn[0] + 2, spawn[1]]]];
    for (const [label, [x, y]] of mustReach) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS || !isReached(tx, ty)) errors.push(`${label} (${tx},${ty}) must be on a reachable corridor.`);
    }
    // Arcade mazes have no dead ends: ghosts never turn back of their own accord.
    let openBlocks = 0;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!isReached(x, y)) continue;
        let exits = 0;
        for (const d of DIRECTIONS) {
          let nx = x + d.x;
          const ny = y + d.y;
          if (tunnelRows.has(ny)) nx = (nx + COLS) % COLS;
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && isReached(nx, ny)) exits += 1;
        }
        if (exits < 2) errors.push(`Dead end at ${x},${y}.`);
        if (x < COLS - 1 && y < ROWS - 1 && isReached(x + 1, y) && isReached(x, y + 1) && isReached(x + 1, y + 1)) openBlocks += 1;
      }
    }
    if (openBlocks) warnings.push(`${openBlocks} open 2x2 area(s); arcade corridors are one tile wide.`);

    const pellets = new Uint8Array(COLS * ROWS);
    let total = 0, powers = 0;
    rows.forEach((row, y) => {
      for (let x = 0; x < COLS; x += 1) {
        if (row[x] === ".") { pellets[y * COLS + x] = 1; total += 1; }
        else if (row[x] === "P") { pellets[y * COLS + x] = 2; total += 1; powers += 1; }
      }
    });
    if (powers !== 4) warnings.push(`${powers} power pellets; the arcade uses 4.`);
    if (total < 120) warnings.push(`Only ${total} pellets; rounds will be very short.`);
    if (errors.length) return result();
    return result(Object.freeze({
      id: String(def.id || "custom"),
      name: String(def.name || "CUSTOM").toUpperCase(),
      wall: typeof def.wall === "string" ? def.wall : null,
      // Dark mazes are lit only by the characters, power pellets and bonus items.
      dark: def.dark === true,
      rows: Object.freeze(rows.slice()),
      kinds: Object.freeze(kinds.map((row) => Object.freeze(row))),
      tunnelRows,
      house: Object.freeze({ x: hx, y: hy, door: Object.freeze(door), home: Object.freeze([hx + 3, hy + 2]) }),
      ghostSpawns: Object.freeze(GHOST_OFFSETS.map(([ox, oy]) => Object.freeze([hx + ox, hy + oy]))),
      spawn: Object.freeze(spawn),
      fruit: Object.freeze(fruit),
      pellets,
      total,
    }));
  }

  function compileMap(def) {
    const { errors, map } = analyzeMap(def);
    if (errors.length) throw new Error(`Maze "${def && def.id}": ${errors[0]}`);
    return map;
  }

  const CLASSIC = compileMap({ id: "classic", name: "CLASSIC", rows: MAZE, spawn: [13.5, 23.5] });
  const MAPS = [CLASSIC];
  const bundledMaps = root.AstraMaps || (typeof module !== "undefined" && module.exports ? require("./maps.js") : null);
  for (const def of (bundledMaps && bundledMaps.MAPS) || []) MAPS.push(compileMap(def));

  function findMap(id) {
    return MAPS.find((map) => map.id === id) || null;
  }

  // Adds or replaces a maze (for example one shared from the editor).
  function registerMap(def) {
    const report = analyzeMap(def);
    if (report.map) {
      const index = MAPS.findIndex((map) => map.id === report.map.id);
      if (index === 0) return { ...report, map: null, errors: ["The classic maze can't be replaced."] };
      if (index > 0) MAPS[index] = report.map;
      else MAPS.push(report.map);
    }
    return report;
  }

  function tileKind(tx, ty, map = CLASSIC) {
    if (tx < 0 || tx >= COLS) return map.tunnelRows.has(ty) ? "tunnel" : "wall";
    if (ty < 0 || ty >= ROWS) return "wall";
    return map.kinds[ty][tx];
  }

  function canEnter(tx, ty, actor, options, map = CLASSIC) {
    const kind = tileKind(tx, ty, map);
    if (kind === "wall") return false;
    if (kind === "gate") return actor.type === "ghost" && (actor.state === "HOUSE" || actor.state === "EATEN" || options?.leavingHouse === true);
    if (kind === "house") return actor.type === "ghost" && (actor.state === "HOUSE" || actor.state === "EATEN");
    return true;
  }

  function moveOneCell(actor, direction, options, map) {
    const vector = DIRECTIONS[direction];
    return canEnter(tileAt(actor.x) + vector.x, tileAt(actor.y) + vector.y, actor, options, map);
  }

  function directionCandidates(actor, allowReverse, options, map) {
    const reverse = opposite(actor.dir);
    const result = [];
    for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
      if (!allowReverse && direction === reverse) continue;
      if (moveOneCell(actor, direction, options, map)) result.push(direction);
    }
    if (result.length === 0 && reverse >= 0 && moveOneCell(actor, reverse, options, map)) result.push(reverse);
    return result;
  }

  function mazePellets(map = CLASSIC) {
    return { pellets: map.pellets.slice(), total: map.total };
  }

  // Arcade speeds are percentages of 75.75757625 px/s; a tile is 8 px. The
  // dot-eating slowdown is not a separate speed: Pac-Man stalls one frame per
  // dot and three per energizer, which yields the arcade's 71%/79%/87% figures.
  const FULL_SPEED = 75.75757625 / 8;
  const SPEED_TABLE = Object.freeze([
    // [first level, pac, pac frightened, ghost, ghost frightened, ghost tunnel]
    [1, 0.80, 0.90, 0.75, 0.50, 0.40],
    [2, 0.90, 0.95, 0.85, 0.55, 0.45],
    [5, 1.00, 1.00, 0.95, 0.60, 0.50],
    [21, 0.90, 0.90, 0.95, 0.60, 0.50],
  ]);
  // Cruise Elroy: Blinky speeds up when this many dots remain (stage 1, stage 2).
  const ELROY_TABLE = Object.freeze([
    [1, 20, 0.80, 10, 0.85], [2, 30, 0.90, 15, 0.95], [3, 40, 0.90, 20, 0.95],
    [5, 40, 1.00, 20, 1.05], [6, 50, 1.00, 25, 1.05], [9, 60, 1.00, 30, 1.05],
    [12, 80, 1.00, 40, 1.05], [15, 100, 1.00, 50, 1.05], [19, 120, 1.00, 60, 1.05],
  ]);
  const FRIGHT_SECONDS = Object.freeze([6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1]);
  const GHOST_EAT_PAUSE = 1;
  const FRUIT_SECONDS = 9.5;

  function rowForLevel(table, level) {
    let row = table[0];
    for (const candidate of table) if (level >= candidate[0]) row = candidate;
    return row;
  }

  function speedProfile(level) {
    const [, pac, pacFright, ghost, frightened, tunnel] = rowForLevel(SPEED_TABLE, level);
    const [, elroyDots1, elroy1, elroyDots2, elroy2] = rowForLevel(ELROY_TABLE, level);
    return {
      pac: pac * FULL_SPEED, pacFright: pacFright * FULL_SPEED, ghost: ghost * FULL_SPEED,
      frightened: frightened * FULL_SPEED, tunnel: tunnel * FULL_SPEED,
      elroy1: elroy1 * FULL_SPEED, elroy2: elroy2 * FULL_SPEED, elroyDots1, elroyDots2,
    };
  }

  function frightenedDuration(level) {
    return FRIGHT_SECONDS[Math.max(1, level) - 1] ?? 0;
  }

  // ---- Rulesets and extension registries -----------------------------------
  // New content is registered, not written into the engine. A ruleset (a game
  // mode) is data plus optional hook methods, and mutators are reusable bundles
  // of hooks that rulesets list by id. The engine calls hooks at fixed points;
  // with nothing registered every hook passes its value through unchanged, so
  // the classic rules stay exact.
  //   Notifications: onStart, onRoundStart(afterLife), onTick(dt), onPellet(pac,
  //     kind, x, y), onGhostEaten(ghost, pac, value), onDeath(pac), onItem(item,
  //     pac), onSkill(pac), onAfterMove(dt) (after collisions; player-versus-player).
  //   Values (return a replacement): pelletValue(value, pac, kind),
  //     ghostValue(value, chain), keepChain(false), collision(outcome, pac,
  //     ghost), speedScale(scale, actor), reverseOnModeChange(true),
  //     fruitEnabled(true), elroyEnabled(true), frightDuration(seconds),
  //     extraLifeEvery(null), levelCleared(false), mapForLevel(map, level),
  //     ghostEatPause(seconds), zapValue(points), canEat(true, pac),
  //     autoRespawn(true, pac) (false: the ruleset revives fallen co-op players itself),
  //     steer(direction, pac) (input), canCollect(true, item, pac).
  //   Ruleset data: lives {n: count}, mutators, brains, skills, results,
  //     gameOverHold, resultLines(game) -> [[label, value]], placements(game).
  // Statuses are timed effects on actors: { speed, hidden, collision, onApply,
  // onTick, onExpire }. Brains steer ghosts: { target, choose, speed, tick }.
  // Power-ups are pickups that apply the status of the same id. Skills are
  // player abilities on a cooldown: { cooldown, activate }.
  const RULESETS = new Map(), MUTATORS = new Map(), STATUSES = new Map();
  const BRAINS = new Map(), POWERUPS = new Map(), SKILLS = new Map();
  function registrar(registry, kind) {
    return (definition) => {
      if (!definition || typeof definition.id !== "string" || !definition.id) throw new Error(`A ${kind} needs an id.`);
      const frozen = Object.freeze({ ...definition });
      registry.set(frozen.id, frozen);
      return frozen;
    };
  }
  const registerRuleset = registrar(RULESETS, "ruleset");
  const registerMutator = registrar(MUTATORS, "mutator");
  const registerStatus = registrar(STATUSES, "status");
  const registerBrain = registrar(BRAINS, "ghost brain");
  const registerPowerUp = registrar(POWERUPS, "power-up");
  const registerSkill = registrar(SKILLS, "skill");

  registerRuleset({ id: "classic", name: "CLASSIC", about: "The arcade rules, exactly." });

  // The arcade's four targeting schemes, as brains.
  const tileTarget = (pac) => [Math.floor(pac.x) + 0.5, Math.floor(pac.y) + 0.5];
  registerBrain({ id: "blinky", target: (game, ghost, pac) => tileTarget(pac) });
  registerBrain({
    id: "pinky",
    target(game, ghost, pac) {
      const direction = DIRECTIONS[pac.dir < 0 ? pac.wanted : pac.dir];
      let x = Math.floor(pac.x) + 0.5 + direction.x * 4;
      const y = Math.floor(pac.y) + 0.5 + direction.y * 4;
      // The original 8-bit coordinate overflow sends Pinky four left as well as four up.
      if (pac.dir === 0 || (pac.dir < 0 && pac.wanted === 0)) x -= 4;
      return [x, y];
    },
  });
  registerBrain({
    id: "inky",
    target(game, ghost, pac) {
      const direction = DIRECTIONS[pac.dir < 0 ? pac.wanted : pac.dir];
      let pivotX = Math.floor(pac.x) + 0.5 + direction.x * 2;
      const pivotY = Math.floor(pac.y) + 0.5 + direction.y * 2;
      if (pac.dir === 0 || (pac.dir < 0 && pac.wanted === 0)) pivotX -= 2;
      const blinky = game.ghosts[0] && game.ghosts[0].id === "blinky" ? game.ghosts[0] : game.ghosts.find((g) => g.id === "blinky") || ghost;
      return [blinky.x + (pivotX - blinky.x) * 2, blinky.y + (pivotY - blinky.y) * 2];
    },
  });
  registerBrain({
    id: "clyde",
    target(game, ghost, pac) {
      const dx = ghost.x - pac.x, dy = ghost.y - pac.y;
      return dx * dx + dy * dy < 64 ? ghost.corner : tileTarget(pac);
    },
  });

  // Player characters, in join order: arrows drive Astra, WASD drives Nova.
  const PLAYERS = Object.freeze([
    Object.freeze({ skin: "astra", name: "SORA" }),
    Object.freeze({ skin: "nova", name: "NOVA" }),
    Object.freeze({ skin: "vega", name: "VEGA" }),
    Object.freeze({ skin: "lyra", name: "LYRA" }),
  ]);
  const MAX_PLAYERS = PLAYERS.length;
  const RESPAWN_SECONDS = 3;
  const RESPAWN_IMMUNITY = 2;

  // Solo play keeps the arcade start; co-op spreads players either side of it,
  // two tiles out for the first pair and four for the second, sliding along the
  // start row to the nearest open tile when a maze has a wall there.
  const SPAWN_OFFSETS = Object.freeze([2, -2, 4, -4]);
  function playerSpawn(index, playerCount, map = CLASSIC) {
    const [x, y] = map.spawn;
    if (playerCount < 2) return { x, y, dir: 1 };
    const offset = SPAWN_OFFSETS[index] ?? 0, sign = offset < 0 ? -1 : 1;
    const open = (tx) => ["floor", "dot", "power", "tunnel"].includes(tileKind(Math.floor(tx), Math.floor(y), map));
    for (const nudge of [0, sign, -sign, 2 * sign, -2 * sign, 3 * sign]) {
      if (open(x + offset + nudge)) return { x: x + offset + nudge, y, dir: sign > 0 ? 3 : 1 };
    }
    return { x, y, dir: sign > 0 ? 3 : 1 };
  }

  function makePacman(index = 0, playerCount = 1, map = CLASSIC) {
    const spawn = playerSpawn(index, playerCount, map);
    return {
      type: "pacman",
      index,
      skin: PLAYERS[index].skin,
      x: spawn.x,
      y: spawn.y,
      dir: spawn.dir,
      wanted: spawn.dir,
      decisionTile: null,
      alive: true,
      deathTimer: null,
      respawnTimer: 0,
      invulnTimer: 0,
      stepFrame: 0,
      stunTicks: 0,
      moving: false,
      status: [],
      skill: null,
      skillCooldown: 0,
      // While cutting a corner, the off-axis coordinate still being corrected.
      cornerAxis: null,
      cornerTarget: 0,
    };
  }

  function makeGhost(definition, index, releaseThreshold, map = CLASSIC) {
    const spawn = map.ghostSpawns[index];
    return {
      type: "ghost",
      id: definition.id,
      name: definition.name,
      nickname: definition.nickname,
      color: definition.color,
      x: spawn[0],
      y: spawn[1],
      dir: index === 0 ? 0 : 3,
      decisionTile: null,
      state: index === 0 ? "SCATTER" : "HOUSE",
      releaseThreshold,
      index,
      corner: definition.corner,
      seed: definition.seed >>> 0,
      leavingHouse: false,
      homeTimer: 0,
      eatenValue: 0,
      stepFrame: 0,
      moving: true,
      brain: definition.id,
      brainState: {},
      status: [],
    };
  }

  class PacmanGame {
    constructor(highScore, presentation = {}) {
      this.timings = Object.freeze({
        introDuration: Number.isFinite(presentation.introDuration) && presentation.introDuration > 0 ? presentation.introDuration : 4.2,
        intermissionDuration: Number.isFinite(presentation.intermissionDuration) && presentation.intermissionDuration > 0 ? presentation.intermissionDuration : 10.45,
      });
      this.highScore = Math.max(0, Number(highScore) || 0);
      this.state = "ATTRACT";
      this.attractTime = 0;
      this.pausedFrom = "PLAYING";
      this.lastEvent = null;
      this.eventSerial = 0;
      this.events = [];
      this.startGame();
      this.state = "ATTRACT";
      this.events.length = 0;
      this.lastEvent = null;
    }

    emit(name, data) {
      this.lastEvent = { name, data: data ?? null, serial: ++this.eventSerial };
      this.events.push(this.lastEvent);
    }

    drainEvents() {
      return this.events.splice(0);
    }

    get pacman() {
      return this.players[0];
    }

    set pacman(actor) {
      this.players[0] = actor;
    }

    livingPlayers() {
      return this.players.filter((pac) => pac.alive);
    }

    // Sources: "dot", "ghost" or "bonus"; results screens chart them.
    addScore(value, pac, source) {
      this.score += value;
      if (pac) this.playerScores[pac.index] += value;
      if (source && this.stats) this.stats[source] = (this.stats[source] || 0) + value;
    }

    // "tour" plays every maze in turn, one per level.
    mapForLevel(level) {
      const map = this.mapChoice === "tour" ? MAPS[(level - 1) % MAPS.length] : findMap(this.mapChoice) || CLASSIC;
      return this.reduceHooks("mapForLevel", map, level);
    }

    // ---- Hooks, statuses, items and randomness for rulesets ----------------
    callHooks(name, ...args) {
      for (const module of this.modules) if (typeof module[name] === "function") module[name](this, ...args);
    }

    reduceHooks(name, value, ...args) {
      for (const module of this.modules) {
        if (typeof module[name] !== "function") continue;
        const next = module[name](this, value, ...args);
        if (next !== undefined) value = next;
      }
      return value;
    }

    // Per-ruleset scratch state, reset with each game.
    ruleState(id) {
      if (!this.ruleData[id]) this.ruleData[id] = {};
      return this.ruleData[id];
    }

    // Seeded xorshift32: every random choice a ruleset makes is repeatable.
    random() {
      let x = this.rngState >>> 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.rngState = x >>> 0;
      return this.rngState / 4294967296;
    }

    addStatus(actor, id, seconds, data = {}) {
      const definition = STATUSES.get(id);
      if (!definition) throw new Error(`Unknown status "${id}".`);
      const existing = actor.status.find((status) => status.id === id);
      if (existing) {
        existing.time = Math.max(existing.time, seconds);
        existing.total = Math.max(existing.total, existing.time);
        Object.assign(existing.data, data);
        return existing;
      }
      const status = { id, time: seconds, total: seconds, data: { ...data } };
      actor.status.push(status);
      if (definition.onApply) definition.onApply(this, actor, status);
      return status;
    }

    getStatus(actor, id) {
      return actor.status.find((status) => status.id === id) || null;
    }

    hasStatus(actor, id) {
      return actor.status.some((status) => status.id === id);
    }

    removeStatus(actor, id) {
      const index = actor.status.findIndex((status) => status.id === id);
      if (index < 0) return;
      const [status] = actor.status.splice(index, 1);
      const definition = STATUSES.get(id);
      if (definition && definition.onExpire) definition.onExpire(this, actor, status);
    }

    updateStatuses(dt) {
      for (const actor of [...this.players, ...this.ghosts]) {
        for (const status of actor.status.slice()) {
          if (!actor.status.includes(status)) continue;
          const definition = STATUSES.get(status.id);
          status.time -= dt;
          if (definition && definition.onTick) definition.onTick(this, actor, status, dt);
          if (status.time <= 0 && actor.status.includes(status)) this.removeStatus(actor, status.id);
        }
      }
    }

    isHidden(actor) {
      return actor.status.some((status) => STATUSES.get(status.id)?.hidden);
    }

    speedScale(actor) {
      let scale = this.reduceHooks("speedScale", 1, actor);
      for (const status of actor.status) {
        const speed = STATUSES.get(status.id)?.speed;
        if (speed !== undefined) scale *= typeof speed === "function" ? speed(this, actor, status) : speed;
      }
      if (actor.type === "ghost") {
        const brain = BRAINS.get(actor.brain);
        if (brain && brain.speed) scale *= brain.speed(this, actor);
      }
      return scale;
    }

    // Pickups on the board. `persist` items survive a lost life.
    spawnItem(item) {
      const placed = { timeLeft: Infinity, persist: false, ...item };
      this.items.push(placed);
      this.emit("itemAppear", { kind: placed.kind, id: placed.id ?? null });
      return placed;
    }

    updateItems(dt) {
      for (const item of this.items.slice()) {
        item.timeLeft -= dt;
        if (item.timeLeft <= 0) {
          this.items.splice(this.items.indexOf(item), 1);
          continue;
        }
        // Two players on one pickup: the nearer one gets it, not the lower-numbered one.
        let pac = null, nearest = 0.58;
        for (const player of this.players) {
          const distance = (player.x - item.x) ** 2 + (player.y - item.y) ** 2;
          if (player.alive && distance < nearest && this.reduceHooks("canCollect", true, item, player)) { pac = player; nearest = distance; }
        }
        if (pac) this.collectItem(item, pac);
      }
    }

    collectItem(item, pac) {
      const index = this.items.indexOf(item);
      if (index < 0) return;
      this.items.splice(index, 1);
      if (item.kind === "powerup") {
        const powerUp = POWERUPS.get(item.id);
        if (powerUp) {
          this.counters.powerUps += 1;
          if (powerUp.collect) powerUp.collect(this, pac, item);
          else this.addStatus(pac, item.id, powerUp.seconds);
          this.emit("powerUp", { id: item.id, player: pac.index });
        }
      }
      this.callHooks("onItem", item, pac);
    }

    // Adds a ghost mid-game, for rulesets that populate open-field maps.
    spawnGhost(id, x, y, { brain = id, state = "CHASE", dir = 1 } = {}) {
      const index = Math.max(0, GHOSTS.findIndex((definition) => definition.id === id));
      const ghost = makeGhost(GHOSTS[index], index, 0, { ghostSpawns: [[x, y], [x, y], [x, y], [x, y]] });
      const mixed = (GHOSTS[index].seed ^ Math.floor(this.random() * 0xffffffff)) >>> 0;
      Object.assign(ghost, { state, dir, brain, seed: mixed || GHOSTS[index].seed });
      this.ghosts.push(ghost);
      this.emit("ghostSpawn", { ghost: ghost.id, x, y });
      return ghost;
    }

    removeGhost(ghost) {
      const index = this.ghosts.indexOf(ghost);
      if (index >= 0) this.ghosts.splice(index, 1);
    }

    // Sends a ghost home without the frightened rules (power-ups and skills).
    zapGhost(ghost, pac, value = this.reduceHooks("zapValue", 200)) {
      if (ghost.state === "EATEN" || ghost.state === "HOUSE") return false;
      ghost.state = "EATEN";
      ghost.eatenValue = value;
      ghost.dir = opposite(ghost.dir);
      ghost.status.length = 0;
      this.addScore(value, pac, "ghost");
      this.bonusPopup = { text: String(value), x: ghost.x, y: ghost.y, timeLeft: 1, color: "#35e7eb" };
      this.emit("ghostZapped", { ghost: ghost.id, value, player: pac ? pac.index : 0 });
      if (!this.map.house) this.removeGhost(ghost);
      return true;
    }

    useSkill(player = 0) {
      if (this.state !== "PLAYING" || this.freezeTimer > 0) return false;
      const pac = this.players[player];
      if (!pac || pac.bot || !pac.alive || !pac.skill || pac.skillCooldown > 0) return false;
      const skill = SKILLS.get(pac.skill);
      if (!skill) return false;
      pac.skillCooldown = skill.cooldown;
      skill.activate(this, pac);
      this.emit("skill", { player: pac.index, skill: skill.id });
      this.callHooks("onSkill", pac);
      return true;
    }

    // Ends the game early, for example when a timed ruleset runs out of time.
    endGame(reason) {
      this.result = {
        reason, score: this.score, playerScores: this.playerScores.slice(), stats: { ...this.stats }, ruleset: this.rules.id,
        counters: { ...this.counters }, daily: this.daily, lines: this.rules.resultLines ? this.rules.resultLines(this) : [],
        placements: this.rules.placements ? this.rules.placements(this) : null,
      };
      this.state = "GAME_OVER";
      // Co-op keeps the results up long enough to read; the arcade game over stays short.
      this.gameOverTimer = this.rules.gameOverHold || (this.playerCount > 1 ? 20 : 3.4);
      if (reason === "TIME UP") this.emit("timeUp");
      this.emit("gameOver");
    }

    equipPlayer(pac) {
      pac.skill = this.rules.skills ? this.rules.skills[pac.skin] || null : null;
      pac.skillCooldown = 0;
      return pac;
    }

    startGame(playerCount = 1, mapChoice = this.mapChoice || "classic", rulesetId = this.rulesetId || "classic", options = {}) {
      this.events.length = 0;
      this.rules = RULESETS.get(rulesetId) || RULESETS.get("classic");
      this.rulesetId = this.rules.id;
      this.modules = [this.rules, ...(this.rules.mutators || []).map((id) => MUTATORS.get(id)).filter(Boolean)];
      this.ruleData = {};
      this.rngState = (Number(options.seed) >>> 0) || 0x9e3779b9;
      // An explicit seed also varies the ghosts' frightened wandering.
      this.seedMix = options.seed ? Math.imul((Number(options.seed) >>> 0) ^ 0x5bd1e995, 0x27d4eb2d) >>> 0 : 0;
      this.options = options;
      this.daily = options.daily || null;
      this.counters = { corners: 0, powerUps: 0 };
      this.stats = { dot: 0, ghost: 0, bonus: 0 };
      this.result = null;
      this.items = [];
      this.playTime = 0;
      this.map = null;
      this.pellets = null;
      this.mapChoice = mapChoice === "tour" || findMap(mapChoice) ? mapChoice : "classic";
      this.playerCount = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(Number(playerCount)) || 1));
      this.playerScores = new Array(this.playerCount).fill(0);
      this.level = 1;
      this.score = 0;
      // Co-op shares one pool of lives; each player on the board holds one.
      this.lives = (this.rules.lives && this.rules.lives[this.playerCount]) || (this.playerCount === 1 ? 3 : this.playerCount + 3);
      this.tickCount = 0;
      this.nextExtraLife = null;
      this.callHooks("onStart");
      this.extraLifeAwarded = false;
      this.fruitHistory = [];
      this.fruit = null;
      this.startRound(false);
      this.state = "READY";
      this.readyKind = "intro";
      this.readyTimer = this.timings.introDuration;
      this.emit("start");
    }

    startRound(afterLife) {
      this.readyKind = "round";
      if (!afterLife || !this.pellets) {
        const map = this.mapForLevel(this.level);
        if (map !== this.map) {
          this.map = map;
          this.homeDistances = null;
        }
        const board = mazePellets(this.map);
        this.dotsTotal = board.total;
        this.pellets = board.pellets;
        this.dotsRemaining = board.total;
        this.dotsEaten = 0;
        this.fruitSpawnIndex = 0;
      }
      this.fruit = null;
      this.items = afterLife && this.items ? this.items.filter((item) => item.persist) : [];
      this.releaseProgress = 0;
      this.releaseThresholds = afterLife ? [0, 7, 17, 32] : [0, 0, 30, 60];
      this.players = [];
      for (let index = 0; index < this.playerCount; index += 1) {
        const pac = this.equipPlayer(makePacman(index, this.playerCount, this.map));
        // With fewer lives than players, the rest sit out until a life frees up.
        if (index >= this.lives) {
          pac.alive = false;
          pac.x = -10;
        }
        this.players.push(pac);
      }
      this.dyingPlayer = null;
      this.eatenBy = null;
      this.ghosts = !this.map.house ? [] : GHOSTS.map((definition, index) => {
        const ghost = makeGhost(definition, index, this.releaseThresholds[index], this.map);
        if (this.rules.brains && this.rules.brains[ghost.id]) ghost.brain = this.rules.brains[ghost.id];
        if (this.seedMix) ghost.seed = (ghost.seed ^ this.seedMix) >>> 0 || ghost.seed;
        return ghost;
      });
      if (this.ghosts[0]) this.ghosts[0].dir = 1;
      this.modeIndex = 0;
      this.mode = MODES[0].name;
      this.modeTimer = MODES[0].duration;
      this.frightTimer = 0;
      this.frightDuration = this.reduceHooks("frightDuration", frightenedDuration(this.level));
      this.ghostChain = 0;
      this.freezeTimer = 0;
      this.eatenGhost = null;
      // After a death Blinky stays at normal speed until Clyde has left the house.
      this.elroySuspended = Boolean(afterLife);
      this.bonusPopup = null;
      this.deathTimer = 0;
      this.clearTimer = 0;
      this.flashCount = 0;
      this.isNewRound = !afterLife;
      this.callHooks("onRoundStart", afterLife);
    }

    setDirection(direction, player = 0) {
      if (!Number.isInteger(direction) || direction < 0 || direction > 3) return;
      if (this.state === "ATTRACT") {
        return;
      }
      if (this.state !== "READY" && this.state !== "PLAYING") return;
      const pac = this.players[player];
      // Bot seats steer themselves; no keyboard or pad input reaches them.
      if (pac && !pac.bot) pac.wanted = this.reduceHooks("steer", direction, pac);
    }

    togglePause() {
      if (this.state === "PLAYING" || this.state === "READY" || this.state === "INTERMISSION") {
        this.pausedFrom = this.state;
        this.state = "PAUSED";
        this.emit("pause");
      } else if (this.state === "PAUSED") {
        this.state = this.pausedFrom;
        this.emit("resume");
      }
    }

    tickAttract(dt) {
      this.attractTime += dt;
    }

    tick(dt) {
      if (this.state === "ATTRACT") {
        this.tickAttract(dt);
        return;
      }
      if (this.state === "PAUSED") return;
      if (this.state === "READY") {
        this.readyTimer -= dt;
        if (this.readyTimer <= 0) {
          this.state = "PLAYING";
          this.emit("readyEnd");
        }
        return;
      }
      if (this.state === "PLAYING") {
        this.tickPlaying(dt);
        return;
      }
      if (this.state === "DYING") {
        this.deathTimer += dt;
        if (this.dyingPlayer) this.dyingPlayer.deathTimer = this.deathTimer;
        if (this.deathTimer >= 1.75) {
          this.lives -= 1;
          if (this.lives <= 0) {
            this.endGame("GAME OVER");
          } else {
            this.startRound(true);
            this.state = "READY";
            this.readyTimer = 1.75;
            this.emit("lifeLost");
          }
        }
        return;
      }
      if (this.state === "LEVEL_CLEAR") {
        this.clearTimer += dt;
        if (this.clearTimer >= 1.65) this.advanceLevel();
        return;
      }
      if (this.state === "INTERMISSION") {
        this.intermissionTimer -= dt;
        if (this.intermissionTimer <= 0) {
          this.startRound(false);
          this.state = "READY";
          this.readyTimer = 1.8;
        }
        return;
      }
      if (this.state === "GAME_OVER") {
        this.gameOverTimer -= dt;
        if (this.gameOverTimer <= 0) {
          this.state = "ATTRACT";
          this.attractTime = 0;
        }
      }
    }

    tickPlaying(dt) {
      this.tickCount += 1;
      this.playTime += dt;
      this.callHooks("onTick", dt);
      if (this.state !== "PLAYING") return;
      if (this.freezeTimer > 0) {
        this.tickGhostEatPause(dt);
        return;
      }
      this.updateMode(dt);
      if (this.frightTimer > 0) {
        this.frightTimer = Math.max(0, this.frightTimer - dt);
        if (this.frightTimer === 0) this.finishFrightened();
      }

      if (this.fruit) {
        this.fruit.timeLeft -= dt;
        if (this.fruit.timeLeft <= 0) this.fruit = null;
      }
      if (this.bonusPopup) {
        this.bonusPopup.timeLeft -= dt;
        if (this.bonusPopup.timeLeft <= 0) this.bonusPopup = null;
      }

      this.updatePlayers(dt);
      this.movePacman(dt);
      this.consumeAtPacman();
      this.updateHouseRelease(dt);
      for (const ghost of this.ghosts) {
        const brain = BRAINS.get(ghost.brain);
        if (brain && brain.tick) brain.tick(this, ghost, dt);
        this.moveGhost(ghost, dt);
      }
      this.updateStatuses(dt);
      this.checkCollisions();
      if (this.state === "PLAYING") this.updateItems(dt);
      if (this.state === "PLAYING") this.callHooks("onAfterMove", dt);
      this.updateFruit();
      this.checkExtraLife();

      if (this.state === "PLAYING" && this.dotsRemaining === 0 && !this.reduceHooks("levelCleared", false)) {
        this.state = "LEVEL_CLEAR";
        this.clearTimer = 0;
        this.emit("levelClear");
      }
    }

    // Arcade ghost-eat pause: Pac-Man and the eaten ghost vanish behind the
    // score, and every timer holds. Eyes already returning home keep moving.
    tickGhostEatPause(dt) {
      this.freezeTimer = Math.max(0, this.freezeTimer - dt);
      for (const ghost of this.ghosts) {
        if (ghost !== this.eatenGhost && ghost.state === "EATEN") this.moveGhost(ghost, dt);
      }
      if (this.freezeTimer === 0) {
        // With no house to return to, eaten ghosts simply vanish.
        if (!this.map.house) this.ghosts = this.ghosts.filter((ghost) => ghost.state !== "EATEN");
        this.eatenGhost = null;
        this.eatenBy = null;
        this.bonusPopup = null;
        this.emit("ghostEatPauseEnd");
      }
    }

    updateMode(dt) {
      if (this.frightTimer > 0 || this.modeTimer === Infinity) return;
      this.modeTimer -= dt;
      if (this.modeTimer > 0) return;
      this.modeIndex = Math.min(this.modeIndex + 1, MODES.length - 1);
      this.mode = MODES[this.modeIndex].name;
      this.modeTimer = MODES[this.modeIndex].duration;
      const reverse = this.reduceHooks("reverseOnModeChange", true);
      for (const ghost of this.ghosts) {
        if (ghost.state === "SCATTER" || ghost.state === "CHASE" || ghost.state === "FRIGHTENED") {
          if (reverse) ghost.dir = opposite(ghost.dir);
          if (ghost.state !== "FRIGHTENED") ghost.state = this.mode;
        }
      }
      this.emit("modeChange", this.mode);
    }

    // Pac-Man is never slowed by the tunnel; only ghosts are.
    speedForPacman() {
      const profile = speedProfile(this.level);
      return this.frightTimer > 0 ? profile.pacFright : profile.pac;
    }

    tileIsTunnel(x, y) {
      return tileKind(tileAt(x), tileAt(y), this.map) === "tunnel";
    }

    // Arcade cornering: a perpendicular turn may start anywhere within half a
    // tile of the turn tile's center, before it (pre-turn) or after (post-turn).
    // Pac-Man then moves diagonally, correcting onto the new lane while already
    // travelling along it, so early inputs gain ground on the ghosts.
    tryCorner(pac = this.pacman) {
      const vector = DIRECTIONS[pac.dir];
      if (!vector || pac.cornerAxis || pac.wanted === pac.dir || pac.wanted === opposite(pac.dir)) return false;
      const axis = vector.x ? "x" : "y";
      const sign = vector.x || vector.y;
      let center = centerAhead(pac[axis], sign);
      if (Math.abs(center - pac[axis]) > 0.5 + EPSILON) center -= sign;
      if (Math.abs(center - pac[axis]) > 0.5 + EPSILON) return false;
      const tx = tileAt(axis === "x" ? center : pac.x);
      const ty = tileAt(axis === "y" ? center : pac.y);
      const turn = DIRECTIONS[pac.wanted];
      if (!canEnter(tx, ty, pac, null, this.map) || !canEnter(tx + turn.x, ty + turn.y, pac, null, this.map)) return false;
      pac.dir = pac.wanted;
      pac.cornerAxis = axis;
      pac.cornerTarget = center;
      this.counters.corners += 1;
      // The arcade eats by tile, so the corner's dot goes even though the
      // diagonal path never touches its exact center.
      this.eatPellet(tx, ty, pac);
      return true;
    }

    movePacman(dt) {
      for (const pac of this.players) if (pac.alive) this.movePlayer(pac, dt);
    }

    movePlayer(pac, dt) {
      pac.moving = false;
      if (pac.dir >= 0 && pac.wanted === opposite(pac.dir)) pac.dir = pac.wanted;
      if (pac.stunTicks > 0) {
        pac.stunTicks -= 1;
        return;
      }
      this.travelActor(pac, this.speedForPacman() * this.speedScale(pac) * dt, () => {
        this.consumeAt(pac);
        if (moveOneCell(pac, pac.wanted, null, this.map)) pac.dir = pac.wanted;
      }, () => this.tryCorner(pac));
      if (pac.moving) pac.stepFrame += 1;
    }

    // Spend the complete frame budget, making a fresh decision at each center.
    // Neither simulation positions nor distance budgets are rounded to pixels.
    // tryCorner, when given, may turn the actor between centers; the travel
    // then stops at each tile's edge so a corner starts the moment it is legal.
    travelActor(actor, distance, chooseDirection, tryCorner) {
      let remaining = distance;
      while (remaining > EPSILON) {
        if (isCentered(actor)) {
          actor.x = tileCenter(actor.x);
          actor.y = tileCenter(actor.y);
          if (chooseDirection() === false) break;
        } else if (tryCorner && tryCorner() && actor.stunTicks > 0) {
          break;
        }
        const vector = DIRECTIONS[actor.dir];
        if (!vector) break;
        actor.facing = actor.dir;
        const axis = vector.x ? "x" : "y";
        const sign = vector.x || vector.y;
        const next = centerAhead(actor[axis], sign);
        const cornering = actor.cornerAxis && actor.cornerAxis !== axis;
        const tx = tileAt(axis === "x" ? next : cornering ? actor.cornerTarget : actor.x);
        const ty = tileAt(axis === "y" ? next : cornering ? actor.cornerTarget : actor.y);
        if (!canEnter(tx, ty, actor, { leavingHouse: actor.leavingHouse }, this.map)) {
          actor.dir = -1;
          break;
        }
        let stop = next;
        const edge = next - sign * 0.5;
        if (tryCorner && !actor.cornerAxis && (edge - actor[axis]) * sign > EPSILON) stop = edge;
        const segment = Math.abs(stop - actor[axis]);
        const travel = Math.min(remaining, segment);
        actor[axis] += sign * travel;
        remaining -= travel;
        if (segment <= travel + EPSILON) actor[axis] = stop;
        if (actor.cornerAxis === axis) actor.cornerAxis = null;
        else if (actor.cornerAxis) {
          const other = actor.cornerAxis, error = actor.cornerTarget - actor[other];
          if (Math.abs(error) <= travel + EPSILON) {
            actor[other] = actor.cornerTarget;
            actor.cornerAxis = null;
          } else actor[other] += Math.sign(error) * travel;
        }
        this.wrapTunnel(actor);
        actor.moving = true;
        if (actor.type === "pacman") this.consumeAt(actor);
      }
    }

    wrapTunnel(actor) {
      if (!this.map.tunnelRows.has(tileAt(actor.y))) return;
      actor.x = ((actor.x % COLS) + COLS) % COLS;
    }

    consumeAtPacman() {
      for (const pac of this.players) if (pac.alive) this.consumeAt(pac);
    }

    consumeAt(pac) {
      if (!isCentered(pac)) return;
      this.eatPellet(tileAt(pac.x), tileAt(pac.y), pac);
    }

    // Co-op bookkeeping: death animations, respawns and spawn immunity.
    updatePlayers(dt) {
      for (const pac of this.players) if (pac.skillCooldown > 0) pac.skillCooldown = Math.max(0, pac.skillCooldown - dt);
      if (this.playerCount < 2) return;
      for (const pac of this.players) {
        if (pac.alive) {
          if (pac.invulnTimer > 0) pac.invulnTimer = Math.max(0, pac.invulnTimer - dt);
          continue;
        }
        if (pac.deathTimer !== null) pac.deathTimer += dt;
        if (pac.respawnTimer > 0) pac.respawnTimer = Math.max(0, pac.respawnTimer - dt);
        if (pac.respawnTimer === 0 && this.lives > this.livingPlayers().length && this.reduceHooks("autoRespawn", true, pac)) this.respawnPlayer(pac);
      }
    }

    respawnPlayer(pac) {
      Object.assign(pac, this.equipPlayer(makePacman(pac.index, this.playerCount, this.map)), { invulnTimer: RESPAWN_IMMUNITY });
      // Co-op respawns take whichever start slot is farthest from the nearest dangerous ghost.
      const danger = this.ghosts.filter((ghost) => ghost.state === "CHASE" || ghost.state === "SCATTER");
      if (danger.length) {
        let best = null, bestDistance = -1;
        for (let index = 0; index < this.playerCount; index += 1) {
          const spot = playerSpawn(index, this.playerCount, this.map);
          const distance = Math.min(...danger.map((ghost) => (ghost.x - spot.x) ** 2 + (ghost.y - spot.y) ** 2));
          if (distance > bestDistance) { bestDistance = distance; best = spot; }
        }
        if (best) Object.assign(pac, { x: best.x, y: best.y, dir: best.dir, wanted: best.dir });
      }
      this.emit("playerRespawn", { player: pac.index });
    }

    killPlayer(pac) {
      pac.alive = false;
      pac.deathTimer = 0;
      pac.stunTicks = 0;
      const partnerAlive = this.livingPlayers().length > 0;
      this.emit("death", { player: pac.index, partial: partnerAlive });
      this.callHooks("onDeath", pac);
      if (partnerAlive) {
        // The partner plays on; this life is spent now and a spare revives later.
        this.lives -= 1;
        pac.respawnTimer = RESPAWN_SECONDS;
        return;
      }
      this.state = "DYING";
      this.deathTimer = 0;
      this.dyingPlayer = pac;
    }

    // `stall` is the arcade's eating stall; pickups that vacuum dots skip it.
    eatPellet(tx, ty, pac = this.pacman, stall = true) {
      if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
      if (!this.reduceHooks("canEat", true, pac)) return;
      const index = ty * COLS + tx;
      const pellet = this.pellets[index];
      if (!pellet) return;
      this.pellets[index] = 0;
      this.dotsRemaining -= 1;
      this.dotsEaten += 1;
      this.releaseProgress += 1;
      const kind = pellet === 2 ? "power" : "dot";
      this.addScore(this.reduceHooks("pelletValue", pellet === 2 ? 50 : 10, pac, kind), pac, "dot");
      if (stall) pac.stunTicks = pellet === 2 ? 3 : 1;
      this.emit(pellet === 2 ? "powerPellet" : "pellet", { player: pac.index, x: tx, y: ty });
      this.callHooks("onPellet", pac, kind, tx, ty);
      if (pellet === 2) this.beginFrightened();
    }

    beginFrightened() {
      // Even on levels without a fright period, an energizer reverses the ghosts.
      for (const ghost of this.ghosts) {
        if (ghost.state === "SCATTER" || ghost.state === "CHASE" || ghost.state === "FRIGHTENED") {
          ghost.dir = opposite(ghost.dir);
          if (this.frightDuration > 0) ghost.state = "FRIGHTENED";
        }
      }
      if (this.frightDuration <= 0) return;
      if (!this.reduceHooks("keepChain", false)) this.ghostChain = 0;
      this.frightTimer = this.frightDuration;
      this.emit("frightened", this.frightDuration);
    }

    finishFrightened() {
      for (const ghost of this.ghosts) {
        if (ghost.state === "FRIGHTENED") ghost.state = this.mode;
      }
      this.emit("frightenedEnd");
    }

    updateHouseRelease() {
      for (const ghost of this.ghosts) {
        if (ghost.homeTimer > 0) continue;
        if (ghost.state === "HOUSE" && (ghost.forceRelease || this.releaseProgress >= ghost.releaseThreshold)) {
          ghost.leavingHouse = true;
          ghost.forceRelease = false;
        }
      }
    }

    moveGhost(ghost, dt) {
      if (ghost.state === "HOUSE" && ghost.homeTimer > 0) {
        ghost.homeTimer -= dt;
        if (ghost.homeTimer <= 0) {
          ghost.leavingHouse = true;
          ghost.forceRelease = true;
        }
        return;
      }
      if (ghost.state === "HOUSE" && !ghost.leavingHouse) {
        ghost.stepFrame += 1;
        return;
      }
      if (ghost.state === "EATEN" && !this.map.house) return;
      const profile = speedProfile(this.level);
      let speed = profile.ghost;
      if (ghost.state === "EATEN") speed = 12;
      else if (this.tileIsTunnel(ghost.x, ghost.y)) speed = profile.tunnel;
      else if (ghost.state === "FRIGHTENED") speed = profile.frightened;
      else if (ghost.id === "blinky" && this.elroyStage() === 2) speed = profile.elroy2;
      else if (ghost.id === "blinky" && this.elroyStage() === 1) speed = profile.elroy1;
      if (ghost.state !== "EATEN") speed *= this.speedScale(ghost);
      if (ghost.state === "HOUSE") speed = Math.min(speed, 3.5);
      ghost.moving = false;
      this.travelActor(ghost, speed * dt, () => {
        const tileX = tileAt(ghost.x), tileY = tileAt(ghost.y);
        const house = this.map.house || { home: [-1, -1], y: -1 };
        if (ghost.state === "EATEN" && tileX === house.home[0] && tileY === house.home[1]) {
          ghost.state = "HOUSE";
          ghost.leavingHouse = false;
          ghost.homeTimer = 1.05;
          ghost.dir = 0;
          this.emit("ghostHome", ghost.id);
          return false;
        }
        if (ghost.state === "HOUSE" && ghost.leavingHouse && tileY < house.y) {
          ghost.leavingHouse = false;
          ghost.state = this.frightTimer > 0 ? "FRIGHTENED" : this.mode;
          ghost.dir = 1;
          if (ghost.id === "clyde") this.elroySuspended = false;
          this.emit("ghostReleased", ghost.id);
        }
        const options = { leavingHouse: ghost.state === "HOUSE" && ghost.leavingHouse };
        if (ghost.state === "HOUSE") {
          ghost.dir = this.chooseHouseDirection(ghost, options);
        } else if (ghost.state === "EATEN") {
          ghost.dir = this.chooseReturnDirection(ghost);
        } else {
          const choices = directionCandidates(ghost, false, options, this.map);
          const brain = BRAINS.get(ghost.brain);
          const chosen = ghost.state !== "FRIGHTENED" && choices.length > 1 && brain && brain.choose ? brain.choose(this, ghost, choices) : undefined;
          if (choices.length <= 1) ghost.dir = choices[0] ?? -1;
          else if (ghost.state === "FRIGHTENED") ghost.dir = this.randomChoice(ghost, choices);
          else if (choices.includes(chosen)) ghost.dir = chosen;
          else ghost.dir = this.chooseTargetDirection(ghost, choices);
        }
      });
      if (ghost.moving) ghost.stepFrame += 1;
    }

    chooseReturnDirection(ghost) {
      // Returning eyes must find home even around a wall that defeats a greedy
      // distance target. Cache the maze's shortest-path distances to the house.
      if (!this.homeDistances) {
        const distances = new Int16Array(COLS * ROWS).fill(-1);
        const [homeX, homeY] = this.map.house.home;
        const queue = [[homeX, homeY]];
        distances[homeY * COLS + homeX] = 0;
        for (let i = 0; i < queue.length; i++) {
          const [x, y] = queue[i];
          for (const d of DIRECTIONS) {
            let nx = x + d.x, ny = y + d.y;
            if (this.map.tunnelRows.has(ny)) nx = (nx + COLS) % COLS;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
            const index = ny * COLS + nx;
            if (distances[index] >= 0 || !canEnter(nx, ny, ghost, null, this.map)) continue;
            distances[index] = distances[y * COLS + x] + 1;
            queue.push([nx, ny]);
          }
        }
        this.homeDistances = distances;
      }
      const choices = directionCandidates(ghost, true, null, this.map);
      let best = -1, nearest = Infinity;
      for (const direction of choices) {
        const d = DIRECTIONS[direction];
        let x = tileAt(ghost.x) + d.x, y = tileAt(ghost.y) + d.y;
        if (this.map.tunnelRows.has(y)) x = (x + COLS) % COLS;
        const distance = this.homeDistances[y * COLS + x];
        if (distance >= 0 && distance < nearest) {
          nearest = distance;
          best = direction;
        }
      }
      return best;
    }

    chooseHouseDirection(ghost, options) {
      const choices = directionCandidates(ghost, true, options, this.map);
      if (!choices.length) return -1;
      const [doorX, doorY] = this.map.house.door;
      return this.chooseDirectionToward(ghost, doorX, doorY, true, choices);
    }

    chooseDirectionToward(ghost, targetX, targetY, allowReverse, supplied) {
      const choices = supplied || directionCandidates(ghost, allowReverse, { leavingHouse: ghost.state === "HOUSE" && ghost.leavingHouse }, this.map);
      if (!choices.length) return -1;
      let best = choices[0];
      let bestDistance = Infinity;
      for (const direction of choices) {
        const vector = DIRECTIONS[direction];
        const x = tileAt(ghost.x) + vector.x + 0.5;
        const y = tileAt(ghost.y) + vector.y + 0.5;
        const distance = (x - targetX) ** 2 + (y - targetY) ** 2;
        if (distance < bestDistance) {
          best = direction;
          bestDistance = distance;
        }
      }
      return best;
    }

    // Each ghost hunts the nearest vulnerable player, re-chosen at every decision.
    preyFor(ghost) {
      if (this.players.length === 1) return this.isHidden(this.players[0]) ? null : this.players[0];
      let prey = null, nearest = Infinity;
      for (const pac of this.players) {
        if (!pac.alive || pac.invulnTimer > 0 || this.isHidden(pac)) continue;
        const distance = (pac.x - ghost.x) ** 2 + (pac.y - ghost.y) ** 2;
        if (distance < nearest) {
          nearest = distance;
          prey = pac;
        }
      }
      return prey;
    }

    targetForGhost(ghost) {
      const pac = this.preyFor(ghost);
      if (!pac) return ghost.corner;
      if (ghost.state === "SCATTER" && !(ghost.id === "blinky" && this.isElroy())) return ghost.corner;
      const brain = BRAINS.get(ghost.brain) || BRAINS.get(ghost.id);
      return brain.target(this, ghost, pac);
    }

    elroyStage() {
      if (this.elroySuspended || !this.reduceHooks("elroyEnabled", true)) return 0;
      const profile = speedProfile(this.level);
      if (this.dotsRemaining <= profile.elroyDots2) return 2;
      return this.dotsRemaining <= profile.elroyDots1 ? 1 : 0;
    }

    isElroy() {
      return this.elroyStage() > 0;
    }

    chooseTargetDirection(ghost, choices) {
      const target = this.targetForGhost(ghost);
      return this.chooseDirectionToward(ghost, target[0], target[1], false, choices);
    }

    randomChoice(ghost, choices) {
      let x = ghost.seed >>> 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      ghost.seed = x >>> 0;
      return choices.length ? choices[ghost.seed % choices.length] : -1;
    }

    checkCollisions() {
      for (const pac of this.players) {
        if (pac.alive && this.checkPlayerCollisions(pac)) return;
      }
    }

    // Returns true when the collision ends this tick's checks.
    checkPlayerCollisions(pac) {
      for (const ghost of this.ghosts) {
        let dx = Math.abs(pac.x - ghost.x);
        if (tileAt(pac.y) === tileAt(ghost.y) && this.map.tunnelRows.has(tileAt(pac.y))) dx = Math.min(dx, Math.abs(COLS - dx));
        const dy = Math.abs(pac.y - ghost.y);
        if (dx * dx + dy * dy > 0.64) continue;
        let outcome = ghost.state === "FRIGHTENED" ? "eat" :
          ghost.state !== "EATEN" && ghost.state !== "HOUSE" && !(pac.invulnTimer > 0) ? "kill" : "ignore";
        outcome = this.collisionOutcome(outcome, pac, ghost);
        if (outcome === "eat") {
          const value = this.reduceHooks("ghostValue", Math.min(200 * (2 ** this.ghostChain), 1600), this.ghostChain);
          const pause = this.reduceHooks("ghostEatPause", GHOST_EAT_PAUSE);
          this.ghostChain += 1;
          this.addScore(value, pac, "ghost");
          ghost.state = "EATEN";
          ghost.eatenValue = value;
          ghost.dir = opposite(ghost.dir);
          ghost.status.length = 0;
          this.bonusPopup = { text: String(value), x: ghost.x, y: ghost.y, timeLeft: pause, color: "#35e7eb" };
          this.freezeTimer = pause;
          this.eatenGhost = ghost;
          this.eatenBy = pac;
          this.emit("ghostEaten", { ghost: ghost.id, value, player: pac.index });
          this.callHooks("onGhostEaten", ghost, pac, value);
          // One ghost per pause; a second ghost on the same spot is eaten after it.
          return true;
        } else if (outcome === "zap") {
          this.zapGhost(ghost, pac);
        } else if (outcome === "kill") {
          this.killPlayer(pac);
          return this.state === "DYING";
        }
      }
      return false;
    }

    // "eat", "zap" (sent home, no pause), "kill" or "ignore": rulesets, then
    // the player's statuses, then the ghost's statuses may change the outcome.
    collisionOutcome(outcome, pac, ghost) {
      outcome = this.reduceHooks("collision", outcome, pac, ghost);
      for (const [actor, side] of [[pac, "player"], [ghost, "ghost"]]) {
        for (const status of actor.status.slice()) {
          const collide = STATUSES.get(status.id)?.collision;
          if (collide) outcome = collide(this, outcome, pac, ghost, side, status) || outcome;
        }
      }
      return outcome;
    }

    updateFruit() {
      if (!this.fruit && this.fruitSpawnIndex < 2 && this.reduceHooks("fruitEnabled", true)) {
        // The arcade's 70th and 170th dots, scaled to this maze's dot count.
        const threshold = Math.round((this.fruitSpawnIndex === 0 ? 70 : 170) * this.dotsTotal / CLASSIC_DOTS);
        if (this.dotsEaten >= threshold) {
          this.fruit = { bonus: this.bonusForLevel(), timeLeft: FRUIT_SECONDS, x: this.map.fruit[0], y: this.map.fruit[1] };
          this.fruitSpawnIndex += 1;
          this.emit("fruitAppear", this.fruit.bonus.name);
        }
      }
      if (!this.fruit) return;
      for (const pac of this.players) {
        if (!pac.alive) continue;
        const dx = pac.x - this.fruit.x;
        const dy = pac.y - this.fruit.y;
        if (dx * dx + dy * dy >= 0.58) continue;
        this.addScore(this.fruit.bonus.value, pac, "bonus");
        this.bonusPopup = { text: String(this.fruit.bonus.value), x: this.fruit.x, y: this.fruit.y, timeLeft: 2, color: "#ffb8ff" };
        this.emit("fruitEaten", this.fruit.bonus.name);
        this.fruit = null;
        return;
      }
    }

    bonusForLevel() {
      if (this.level <= 2) return BONUS[this.level - 1];
      if (this.level <= 4) return BONUS[2];
      if (this.level <= 6) return BONUS[3];
      if (this.level <= 8) return BONUS[4];
      if (this.level <= 10) return BONUS[5];
      if (this.level <= 12) return BONUS[6];
      return BONUS[7];
    }

    checkExtraLife() {
      const every = this.reduceHooks("extraLifeEvery", null);
      if (every) {
        if (this.nextExtraLife === null) this.nextExtraLife = every;
        while (this.score >= this.nextExtraLife) {
          this.nextExtraLife += every;
          this.lives += 1;
          this.emit("extraLife");
        }
        return;
      }
      if (!this.extraLifeAwarded && this.score >= 10000) {
        this.extraLifeAwarded = true;
        this.lives += 1;
        this.emit("extraLife");
      }
    }

    advanceLevel() {
      const cleared = this.level;
      const bonus = this.bonusForLevel();
      this.fruitHistory.push(bonus);
      if (this.fruitHistory.length > 7) this.fruitHistory.shift();
      this.level += 1;
      if ([2, 5, 9].includes(cleared)) {
        this.state = "INTERMISSION";
        this.intermissionTimer = this.timings.intermissionDuration;
        this.intermissionId = cleared === 2 ? 1 : cleared === 5 ? 2 : 3;
        this.emit("intermission", this.intermissionId);
      } else {
        this.startRound(false);
        this.state = "READY";
        this.readyTimer = 1.8;
      }
    }

    forcePelletForTest(tx, ty, value) {
      const index = ty * COLS + tx;
      if (!this.pellets[index]) {
        this.pellets[index] = value === 2 ? 2 : 1;
        this.dotsRemaining += 1;
      }
    }

    forceClearForTest() {
      this.pellets.fill(0);
      this.dotsRemaining = 0;
    }
  }

  const api = {
    COLS,
    ROWS,
    DIRECTIONS,
    MODES,
    MAZE,
    MAPS,
    CLASSIC,
    CLASSIC_DOTS,
    analyzeMap,
    compileMap,
    registerMap,
    findMap,
    BONUS,
    GHOSTS,
    PLAYERS,
    MAX_PLAYERS,
    RESPAWN_SECONDS,
    RESPAWN_IMMUNITY,
    PacmanGame,
    RULESETS,
    MUTATORS,
    STATUSES,
    BRAINS,
    POWERUPS,
    SKILLS,
    registerRuleset,
    registerMutator,
    registerStatus,
    registerBrain,
    registerPowerUp,
    registerSkill,
    tileAt,
    tileKind,
    canEnter,
    mazePellets,
    speedProfile,
    frightenedDuration,
    opposite,
    GHOST_EAT_PAUSE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PacmanEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
