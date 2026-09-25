/* Rulesets and the content they use, registered with the engine's frameworks:
 * statuses, power-ups, ghost brains, skills, mutators and two new modes,
 * BENCHMARK RUN (after Championship Edition) and REMIX. Everything here is
 * deterministic: randomness comes from game.random(), which is seeded. */
(function (root) {
  "use strict";
  const E = root.PacmanEngine || require("./engine.js");
  const MazeGen = root.AstraMazeGen || require("./mazegen.js");
  const { COLS, ROWS, DIRECTIONS, BONUS, tileKind } = E;
  const alive = (ghost) => ghost.state !== "EATEN" && ghost.state !== "HOUSE";
  const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const tileTarget = (pac) => [Math.floor(pac.x) + 0.5, Math.floor(pac.y) + 0.5];
  const walkable = (kind) => kind === "floor" || kind === "dot" || kind === "power";

  // Open tiles at least `clearance` tiles from every living player.
  function openTiles(game, clearance, filter = () => true) {
    const tiles = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!walkable(tileKind(x, y, game.map)) || !filter(x, y)) continue;
      const spot = { x: x + 0.5, y: y + 0.5 };
      if (game.players.every((pac) => !pac.alive || distance2(pac, spot) >= clearance * clearance)) tiles.push(spot);
    }
    return tiles;
  }
  const pick = (game, list) => list.length ? list[Math.floor(game.random() * list.length)] : null;

  // ---- Statuses ---------------------------------------------------------------
  E.registerStatus({ id: "slowed", speed: 0.45 });
  E.registerStatus({ id: "dash", speed: 1.75 });
  E.registerStatus({
    id: "stunned", speed: 0,
    collision: (game, outcome, pac, ghost, side) => side === "ghost" && outcome === "kill" ? "ignore" : undefined,
  });

  // ---- Power-ups ----------------------------------------------------------------
  // Each power-up is a pickup plus a status of the same id on whoever collects it.
  function powerUp({ status = {}, ...pickup }) {
    E.registerStatus({ id: pickup.id, label: pickup.name, color: pickup.color, ...status });
    E.registerPowerUp(pickup);
  }
  function explode(game, pac) {
    let hits = 0;
    for (const ghost of game.ghosts) if (alive(ghost) && distance2(ghost, pac) <= 4.5 * 4.5 && game.zapGhost(ghost, pac)) hits += 1;
    game.emit("explosion", { player: pac.index, x: pac.x, y: pac.y, hits });
  }
  // Tiles from the player to the first wall ahead, wrapping through tunnels.
  function beamCells(game, pac) {
    const direction = DIRECTIONS[pac.dir >= 0 ? pac.dir : pac.facing ?? pac.wanted];
    const cells = [];
    if (!direction) return cells;
    let x = Math.floor(pac.x), y = Math.floor(pac.y);
    for (let i = 0; i < COLS; i++) {
      x += direction.x; y += direction.y;
      if (game.map.tunnelRows.has(y)) x = (x + COLS) % COLS;
      const kind = tileKind(x, y, game.map);
      if (kind === "wall" || kind === "gate" || kind === "house") break;
      cells.push([x, y]);
    }
    return cells;
  }

  powerUp({
    id: "token-beam", name: "TOKEN BEAM", short: "TB", color: "#3fc6ff", seconds: 5,
    about: "A beam fires ahead to the next wall and sends ghosts home.",
    status: {
      onTick(game, pac, status) {
        if (!pac.alive) return;
        const cells = beamCells(game, pac);
        status.data.cells = cells;
        const hit = new Set(cells.map(([x, y]) => y * COLS + x));
        for (const ghost of game.ghosts) {
          if (alive(ghost) && hit.has(Math.floor(ghost.y) * COLS + Math.floor(ghost.x))) game.zapGhost(ghost, pac);
        }
      },
    },
  });
  powerUp({
    id: "rate-limit", name: "RATE LIMIT", short: "RL", color: "#9fe6ff", seconds: 6,
    about: "Every ghost slows to a crawl. They can still catch you.",
    // Every ghost on the board stays slowed while it lasts, including ghosts that
    // leave the house later, and a second pickup extends the slow as well.
    status: {
      onApply: (game, pac, status) => { for (const ghost of game.ghosts) if (alive(ghost)) game.addStatus(ghost, "slowed", status.time); },
      onTick: (game, pac, status) => { if (status.time > 0) for (const ghost of game.ghosts) if (alive(ghost)) game.addStatus(ghost, "slowed", status.time); },
    },
  });
  powerUp({
    id: "context-overflow", name: "CONTEXT OVERFLOW", short: "CO", color: "#ff8a3d", seconds: 6,
    about: "The next ghost to touch you, or the timer running out, sets off a blast.",
    status: {
      collision(game, outcome, pac, ghost, side, status) {
        if (side !== "player" || outcome !== "kill") return undefined;
        status.data.exploded = true;
        game.removeStatus(pac, status.id);
        explode(game, pac);
        return "ignore";
      },
      onExpire(game, pac, status) { if (!status.data.exploded && pac.alive) explode(game, pac); },
    },
  });
  powerUp({
    id: "scale-up", name: "SCALE UP", short: "SU", color: "#ffe52c", seconds: 6,
    about: "Grow huge and flatten any ghost you touch.",
    status: { collision: (game, outcome, pac, ghost, side) => side === "player" && outcome === "kill" ? "zap" : undefined },
  });
  powerUp({
    id: "rag", name: "RAG", short: "RG", color: "#3ef06a", seconds: 6,
    about: "Retrieval pulls in every dot and pickup within reach.",
    status: {
      onTick(game, pac) {
        if (!pac.alive) return;
        const cx = Math.floor(pac.x), cy = Math.floor(pac.y);
        for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
          if ((x + 0.5 - pac.x) ** 2 + (y + 0.5 - pac.y) ** 2 <= 2.6 * 2.6) game.eatPellet(x, y, pac, false);
        }
        for (const item of game.items.slice()) if (distance2(item, pac) <= 2.6 * 2.6) game.collectItem(item, pac);
      },
    },
  });
  powerUp({
    id: "hot-path", name: "HOT PATH", short: "HP", color: "#ff5a2e", seconds: 6,
    about: "Leave a burning trail. Ghosts that touch it go home.",
    status: {
      onTick(game, pac) {
        if (!pac.alive) return;
        const hazards = game.ruleState("hazards").list || (game.ruleState("hazards").list = []);
        const x = Math.floor(pac.x), y = Math.floor(pac.y);
        const flame = hazards.find((h) => h.x === x && h.y === y);
        if (flame) flame.time = 2.5;
        else hazards.push({ x, y, time: 2.5, total: 2.5, owner: pac.index });
      },
    },
  });
  powerUp({
    id: "incognito", name: "INCOGNITO", short: "IN", color: "#c9a6ff", icon: "ghost", seconds: 6,
    about: "Ghosts lose track of you and pass straight through.",
    status: {
      hidden: true,
      collision: (game, outcome, pac, ghost, side) => side === "player" && outcome === "kill" ? "ignore" : undefined,
    },
  });

  // Spawns pickups every so many dots and burns ghosts on hot-path flames.
  E.registerMutator({
    id: "powerups",
    about: "A random power-up appears every 40 dots.",
    onStart(game) { Object.assign(game.ruleState("powerups"), { sinceLast: 0, every: 40 }); },
    onRoundStart(game) { game.ruleState("hazards").list = []; },
    onPellet(game) {
      const state = game.ruleState("powerups");
      state.sinceLast += 1;
      if (state.sinceLast < state.every || game.items.some((item) => item.kind === "powerup")) return;
      const spot = pick(game, openTiles(game, 7));
      if (!spot) return;
      state.sinceLast = 0;
      // The profile's unlocked power-ups, when the game was started with them.
      const owned = (game.options && game.options.powerUps || []).filter((id) => E.POWERUPS.has(id));
      const id = pick(game, owned.length ? owned : [...E.POWERUPS.keys()]);
      game.spawnItem({ kind: "powerup", id, x: spot.x, y: spot.y, timeLeft: 10 });
    },
    onTick(game, dt) {
      if (game.freezeTimer > 0) return;
      const hazards = game.ruleState("hazards").list || [];
      for (const flame of hazards) flame.time -= dt;
      game.ruleState("hazards").list = hazards.filter((flame) => flame.time > 0);
      for (const flame of game.ruleState("hazards").list) {
        for (const ghost of game.ghosts) {
          if (alive(ghost) && Math.floor(ghost.x) === flame.x && Math.floor(ghost.y) === flame.y) game.zapGhost(ghost, game.players[flame.owner]);
        }
      }
    },
  });

  // ---- Ghost brains -------------------------------------------------------------
  function lineOfSight(game, ghost, pac, range) {
    const gx = Math.floor(ghost.x), gy = Math.floor(ghost.y), px = Math.floor(pac.x), py = Math.floor(pac.y);
    if (gx !== px && gy !== py) return false;
    if (Math.abs(gx - px) + Math.abs(gy - py) > range) return false;
    const sx = Math.sign(px - gx), sy = Math.sign(py - gy);
    for (let x = gx, y = gy; x !== px || y !== py; x += sx, y += sy) if (tileKind(x, y, game.map) === "wall") return false;
    return true;
  }
  // After Pac-Man 256's Pinky: ambushes as usual, but charges down any clear line.
  E.registerBrain({
    id: "charger",
    about: "Ambushes like Pinky, but charges at full tilt down any clear line of sight.",
    target(game, ghost, pac) {
      ghost.brainState.charging = lineOfSight(game, ghost, pac, 12);
      return ghost.brainState.charging ? tileTarget(pac) : E.BRAINS.get("pinky").target(game, ghost, pac);
    },
    speed: (game, ghost) => ghost.brainState.charging && ghost.state === "CHASE" ? 1.55 : 1,
  });
  // After Pac-Man 256's Spunky: dozes and drifts until you come close.
  E.registerBrain({
    id: "sleeper",
    about: "Drifts half-asleep until a player comes within six tiles, then hunts for six seconds.",
    tick(game, ghost, dt) {
      const state = ghost.brainState;
      if (ghost.state !== "CHASE" && ghost.state !== "SCATTER") { state.awake = false; return; }
      if (state.awake) {
        state.timer -= dt;
        if (state.timer <= 0) state.awake = false;
        return;
      }
      const pac = game.preyFor(ghost);
      if (pac && distance2(pac, ghost) < 36) {
        state.awake = true;
        state.timer = 6;
        game.emit("ghostWakes", { ghost: ghost.id });
      }
    },
    choose: (game, ghost, choices) => ghost.brainState.awake ? undefined : game.randomChoice(ghost, choices),
    target: (game, ghost, pac) => tileTarget(pac),
    speed: (game, ghost) => ghost.brainState.awake ? 1.08 : 0.55,
  });

  // ---- Skills ---------------------------------------------------------------------
  E.registerSkill({
    id: "star-dash", name: "STAR DASH", cooldown: 5,
    about: "Sora bursts forward at high speed for a moment.",
    activate: (game, pac) => game.addStatus(pac, "dash", 0.8),
  });
  E.registerSkill({
    id: "supernova", name: "SUPERNOVA", cooldown: 8,
    about: "Nova flares and stuns every nearby ghost.",
    activate(game, pac) {
      for (const ghost of game.ghosts) if (alive(ghost) && distance2(ghost, pac) <= 4.5 * 4.5) game.addStatus(ghost, "stunned", 1.8);
      game.emit("supernova", { player: pac.index, x: pac.x, y: pac.y });
    },
  });
  E.registerStatus({
    id: "shielded",
    collision: (game, outcome, pac, ghost, side) => side === "player" && outcome === "kill" ? "ignore" : undefined,
  });
  E.registerSkill({
    id: "pulse-shield", name: "PULSE SHIELD", cooldown: 9,
    about: "Vega raises a shield that ghosts cannot get through for a moment.",
    activate: (game, pac) => game.addStatus(pac, "shielded", 1.6),
  });
  E.registerSkill({
    id: "vine-snare", name: "VINE SNARE", cooldown: 7,
    about: "Lyra tangles every ghost within five tiles, slowing them down.",
    activate(game, pac) {
      for (const ghost of game.ghosts) if (alive(ghost) && distance2(ghost, pac) <= 25) game.addStatus(ghost, "slowed", 3);
      game.emit("vineSnare", { player: pac.index, x: pac.x, y: pac.y });
    },
  });
  // Constellation: two players firing their skills together link them with a beam.
  const segmentDistance2 = (p, a, b) => {
    const vx = b.x - a.x, vy = b.y - a.y, length = vx * vx + vy * vy;
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / length)) : 0;
    return (p.x - a.x - vx * t) ** 2 + (p.y - a.y - vy * t) ** 2;
  };
  E.registerStatus({
    id: "linked", label: "CONSTELLATION", color: "#ffd27a",
    onTick(game, pac, status) {
      // The lower-numbered player of each linked pair runs the beam.
      const partner = game.players[status.data.partner];
      if (!partner || partner.index < pac.index) return;
      const back = game.getStatus(partner, "linked");
      status.data.active = Boolean(pac.alive && partner.alive && back && back.data.partner === pac.index && distance2(pac, partner) <= 14 * 14);
      if (!status.data.active) return;
      for (const ghost of game.ghosts) if (alive(ghost) && segmentDistance2(ghost, pac, partner) < 0.7 * 0.7) game.zapGhost(ghost, pac);
    },
  });
  E.registerMutator({
    id: "skills",
    about: "Character skills, plus the co-op Constellation.",
    onStart(game) { game.ruleState("skills").last = [-Infinity, -Infinity, -Infinity, -Infinity]; },
    onSkill(game, pac) {
      const last = game.ruleState("skills").last;
      last[pac.index] = game.playTime;
      const partner = game.players.find((other) => other !== pac && other.alive && game.playTime - last[other.index] <= 0.75);
      if (!partner) return;
      game.addStatus(pac, "linked", 4, { partner: partner.index });
      game.addStatus(partner, "linked", 4, { partner: pac.index });
      last[pac.index] = last[partner.index] = -Infinity;
      game.emit("constellation", { players: [pac.index, partner.index] });
    },
  });

  // ---- BENCHMARK RUN ------------------------------------------------------------------
  // Championship Edition rules: five minutes on the clock. Clear one half of the
  // maze and a bonus appears on the other half; eating it swaps a new layout into
  // the cleared half. Speed climbs with your score and drops when you are caught.
  // Every half shares the tunnel column, the centre seam and the ghost-house ring,
  // so any left half fits any mirrored right half.
  const CLASSIC_HALF = E.MAZE.map((row, y) => {
    const half = row.replace(/[^.P \-S]/g, "#").slice(0, 14);
    return y === 14 ? half : y === 23 ? half.slice(0, 13) + "S" : half.replace(/^ +/, (m) => "#".repeat(m.length));
  });
  const HALVES = Object.freeze({
    classic: Object.freeze(CLASSIC_HALF),
    lanes: Object.freeze([
      "##############",
      "#............#",
      "#.##.###.###.#",
      "#P##.###.###.#",
      "#.##.###.###.#",
      "#.............",
      "#.##.####.####",
      "#.##.####.####",
      "#............#",
      "####.####### #",
      "####.####### #",
      "####.####     ",
      "####.#### ###-",
      "####.#### #   ",
      "    .     #   ",
      "####.#### #   ",
      "####.#### ####",
      "####.####     ",
      "####.#### ####",
      "####.#### ####",
      "#............#",
      "#.##.##.####.#",
      "#.##.##.####.#",
      "#P...........S",
      "#.##.####.##.#",
      "#.##.####.##.#",
      "#............#",
      "#.#######.##.#",
      "#.#######.##.#",
      "#.............",
      "##############",
    ]),
    racks: Object.freeze([
      "##############",
      "#...........##",
      "#.#.#.#.#.#.##",
      "#P#.#.#.#.#.##",
      "#.#.#.#.#.#.##",
      "#.............",
      "###.###.##.###",
      "###.###.##.###",
      "#............#",
      "#.####.##### #",
      "#.####.##### #",
      "#.####.##     ",
      "#.####.## ###-",
      "#.####.## #   ",
      "  ....... #   ",
      "#.####.## #   ",
      "#.####.## ####",
      "#.####.##     ",
      "#.####.## ####",
      "#...#...# ####",
      "###...#......#",
      "###.#.#.####.#",
      "###.#.#.####.#",
      "#P...........S",
      "#.#.#.#.#.#.##",
      "#.#.#.#.#.#.##",
      "#.#.#.#.#.#.##",
      "#.#.#.#.#.#.##",
      "#.#.#.#.#.#.##",
      "#.............",
      "##############",
    ]),
    steps: Object.freeze([
      "##############",
      "#.......#....#",
      "#.#####.#.##.#",
      "#P#####...##.#",
      "#.#######.##.#",
      "#.............",
      "#.###.#.######",
      "#.###.#.######",
      "#.....#......#",
      "#####.###### #",
      "#####.###### #",
      "#####.###     ",
      "#####.### ###-",
      "#####.### #   ",
      "     .    #   ",
      "#####.### #   ",
      "#####.### ####",
      "#####.###     ",
      "#####.### ####",
      "#.....### ####",
      "#.###.......##",
      "#.###.#####.##",
      "#.###.#####.##",
      "#P...........S",
      "###.###.###.##",
      "###.###.###.##",
      "#...#...#...##",
      "#.#.#.#.#.####",
      "#.#.#.#.#.####",
      "#.............",
      "##############",
    ]),
  });
  const HALF_IDS = Object.keys(HALVES);
  const WALLS = ["#2ad4ff", "#ff4fd8", "#7cff5b", "#ffb000", "#b04bff", "#ff5a4e"];
  const composed = new Map();
  function benchmarkMap(left, right, tint) {
    const key = `${left}:${right}:${tint % WALLS.length}`;
    if (!composed.has(key)) {
      const rows = HALVES[HALF_IDS[left]].map((row, y) => row + [...HALVES[HALF_IDS[right]][y]].reverse().join(""));
      composed.set(key, E.compileMap({ id: `benchmark-${key}`, name: "BENCHMARK", wall: WALLS[tint % WALLS.length], rows }));
    }
    return composed.get(key);
  }
  const inHalf = (half, x) => half === 0 ? x < COLS / 2 : x >= COLS / 2;
  const TIER_POINTS = 5000, MAX_TIER = 10;
  const frightFor = (tier) => Math.max(2.5, 6 - tier * 0.35);

  function dotsLeft(game, half) {
    let count = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (inHalf(half, x) && game.pellets[y * COLS + x]) count += 1;
    return count;
  }
  // Moves anyone the new layout walled in to the nearest open corridor.
  function rescue(game, actor) {
    const tx = Math.floor(actor.x), ty = Math.floor(actor.y);
    const open = (x, y) => walkable(tileKind(x, y, game.map)) || tileKind(x, y, game.map) === "tunnel";
    if (open(tx, ty)) return;
    const seen = new Set([ty * COLS + tx]), queue = [[tx, ty]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      if (open(x, y)) {
        Object.assign(actor, { x: x + 0.5, y: y + 0.5, cornerAxis: null });
        return;
      }
      for (const d of DIRECTIONS) {
        const nx = x + d.x, ny = y + d.y;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen.has(ny * COLS + nx)) continue;
        seen.add(ny * COLS + nx);
        queue.push([nx, ny]);
      }
    }
  }
  function refreshHalves(game, halves) {
    const state = game.ruleState("benchmark");
    for (const half of halves) {
      const current = state.halves[half];
      state.halves[half] = (current + 1 + Math.floor(game.random() * (HALF_IDS.length - 1))) % HALF_IDS.length;
      state.pending[half] = false;
    }
    state.tint += 1;
    game.map = benchmarkMap(state.halves[0], state.halves[1], state.tint);
    game.homeDistances = null;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (halves.some((half) => inHalf(half, x))) game.pellets[y * COLS + x] = game.map.pellets[y * COLS + x];
    }
    game.dotsRemaining = game.pellets.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    game.dotsTotal = game.map.total;
    game.items = game.items.filter((item) => item.kind !== "bench-bonus" || !halves.includes(item.half));
    for (const pac of game.players) if (pac.alive) rescue(game, pac);
    for (const ghost of game.ghosts) if (ghost.state !== "HOUSE") rescue(game, ghost);
    game.emit("halfRefresh", { halves });
  }
  function spawnBonus(game, cleared) {
    const state = game.ruleState("benchmark");
    const spot = pick(game, openTiles(game, 6, (x) => inHalf(1 - cleared, x))) || pick(game, openTiles(game, 0, (x) => inHalf(1 - cleared, x)));
    if (!spot) return;
    state.pending[cleared] = true;
    const bonus = BONUS[state.bonuses % BONUS.length];
    const value = Math.min(1000 + 200 * state.bonuses, 5000);
    state.bonuses += 1;
    game.spawnItem({ kind: "bench-bonus", x: spot.x, y: spot.y, half: cleared, name: bonus.name, color: bonus.color, value, persist: true });
  }

  E.registerRuleset({
    id: "benchmark",
    name: "BENCHMARK RUN",
    hidden: true,
    about: "Five minutes. Clear half the maze, eat the bonus on the other side and a new half appears.",
    lives: { 1: 3, 2: 5 },
    results: true,
    gameOverHold: 20,
    timeLimit: 300,
    halves: HALF_IDS,
    onStart(game) {
      Object.assign(game.ruleState("benchmark"), {
        timeLeft: this.timeLimit, halves: [0, 0], pending: [false, false], tint: 0, bonuses: 0,
        tier: 0, tierBase: 0, dotsSinceDeath: 0,
      });
    },
    mapForLevel(game) {
      const state = game.ruleState("benchmark");
      return benchmarkMap(state.halves[0], state.halves[1], state.tint);
    },
    onTick(game, dt) {
      const state = game.ruleState("benchmark");
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      if (state.timeLeft === 0) { game.endGame("TIME UP"); return; }
      while (game.score - state.tierBase >= TIER_POINTS && state.tier < MAX_TIER) {
        state.tier += 1;
        state.tierBase += TIER_POINTS;
        game.frightDuration = frightFor(state.tier);
        game.emit("speedUp", { tier: state.tier });
      }
    },
    speedScale: (game, scale) => scale * (1 + 0.045 * game.ruleState("benchmark").tier),
    frightDuration: (game) => frightFor(game.ruleState("benchmark").tier),
    // Dots start at 10 and gain 10 every 60 eaten, up to 50, until you are caught.
    pelletValue: (game) => Math.min(50, 10 + 10 * Math.floor(game.ruleState("benchmark").dotsSinceDeath / 60)),
    onPellet(game, pac, kind, x) {
      const state = game.ruleState("benchmark");
      state.dotsSinceDeath += 1;
      const half = inHalf(0, x) ? 0 : 1;
      const left = [dotsLeft(game, 0), dotsLeft(game, 1)];
      if (!left[0] && !left[1]) { refreshHalves(game, [0, 1]); return; }
      if (!left[half] && !state.pending[half]) spawnBonus(game, half);
    },
    onItem(game, item, pac) {
      if (item.kind !== "bench-bonus") return;
      game.addScore(item.value, pac, "bonus");
      game.bonusPopup = { text: String(item.value), x: item.x, y: item.y, timeLeft: 2, color: "#ffb8ff" };
      game.emit("fruitEaten", item.name);
      refreshHalves(game, [item.half]);
    },
    onDeath(game) {
      const state = game.ruleState("benchmark");
      state.tier = Math.max(0, state.tier - 2);
      state.tierBase = game.score;
      state.dotsSinceDeath = 0;
      game.frightDuration = frightFor(state.tier);
    },
    // Ghost chains keep climbing through fresh power pellets: 400, 800 ... 3200.
    ghostValue: (game, value, chain) => Math.min(400 * (chain + 1), 3200),
    keepChain: (game) => game.frightTimer > 0,
    ghostEatPause: () => 0.6,
    reverseOnModeChange: () => false,
    fruitEnabled: () => false,
    elroyEnabled: () => false,
    levelCleared: () => true,
    extraLifeEvery: () => 20000,
  });

  // ---- REMIX ------------------------------------------------------------------------
  E.registerRuleset({
    id: "remix",
    name: "REMIX",
    about: "Arcade rules plus power-ups, character skills and two new ghost brains.",
    mutators: ["powerups", "skills"],
    brains: { pinky: "charger", inky: "sleeper" },
    skills: { astra: "star-dash", nova: "supernova", vega: "pulse-shield", lyra: "vine-snare" },
  });

  // ---- HALLUCINATION ------------------------------------------------------------------
  // After Pac-Man 256: an endless maze that scrolls upward while the glitch climbs
  // from below. The engine keeps its fixed 28 x 31 window; this ruleset feeds new
  // rows in at the top and shifts everything down, so the window becomes a camera.
  // Rows come from mazegen.js, an arcade-style piece generator: mirrored, with no
  // dead ends or open 2 x 2 areas. The climb passes through one zone per bundled
  // maze (CLASSIC, NEURAL NET, SERVER ROOM, ASTRA), each ZONE_ROWS tall. Over its
  // last BLEND_ROWS a zone's layout style, wall colour and darkness fade into the next.
  const CHUNK = 9, SHIFT = 4, LEAD_ROW = 11, ZONE_ROWS = 64, BLEND_ROWS = 24;
  const START_GHOSTS = 2, REFILL_SECONDS = 3;
  const DREAM_GHOSTS = Object.freeze([
    Object.freeze({ id: "blinky", brain: "blinky", from: 0 }),
    Object.freeze({ id: "inky", brain: "sleeper", from: 24 }),
    Object.freeze({ id: "pinky", brain: "charger", from: 64 }),
    Object.freeze({ id: "clyde", brain: "diver", from: 120 }),
  ]);
  const DEFAULT_LOADOUT = Object.freeze(["token-beam", "rate-limit", "rag"]);
  const CHAIN_MILESTONES = Object.freeze([16, 32, 64, 128]);

  // After Pac-Man 256's Clyde: always drops downward, sidestepping toward you.
  E.registerBrain({
    id: "diver",
    about: "Always drops downward, sidestepping toward the nearest player only to get round walls.",
    choose(game, ghost, choices) {
      if (choices.includes(2)) return 2;
      const pac = game.preyFor(ghost);
      const toward = pac && pac.x < ghost.x ? 1 : 3;
      return choices.includes(toward) ? toward : undefined;
    },
    target: (game, ghost, pac) => tileTarget(pac),
  });

  // A zone per generator biome, coloured and lit like the maze it is named after.
  // Only bundled mazes count, so shared mazes loaded mid-session never change a run.
  const ZONES = MazeGen.BIOMES.filter((biome) => E.findMap(biome.id)).map((biome) => {
    const map = E.findMap(biome.id);
    return Object.freeze({ biome, name: map.name, wall: map.wall || "#284bff", darkness: map.dark ? 1 : 0 });
  });
  // Row n counts up from the bottom of the start chunk; row distance + (ROWS - 1 - y) is window row y.
  function zoneMix(row) {
    const along = Math.max(0, row) / ZONE_ROWS, index = Math.floor(along);
    const into = (along - index) * ZONE_ROWS - (ZONE_ROWS - BLEND_ROWS);
    const t = Math.max(0, Math.min(1, into / BLEND_ROWS));
    return { from: ZONES[index % ZONES.length], to: ZONES[(index + 1) % ZONES.length], t: t * t * (3 - 2 * t) };
  }
  const hex = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  function wallAt(row) {
    const { from, to, t } = zoneMix(row), a = hex(from.wall), b = hex(to.wall);
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  const darknessAt = (row) => { const { from, to, t } = zoneMix(row); return from.darkness + (to.darkness - from.darkness) * t; };
  const zoneAt = (row) => { const { from, to, t } = zoneMix(row); return t < 0.5 ? from : to; };
  const biomeAt = (game, row) => { const { from, to, t } = zoneMix(row); return MazeGen.blendBiomes(from.biome, to.biome, t, () => game.random()); };
  // One chunk, top row first. The start chunk sits on a solid floor with the start marked.
  function dreamChunk(game, start = false) {
    const state = game.ruleState("hallucination");
    if (!state.gen || start) { state.gen = MazeGen.createGenerator(() => game.random()); state.generated = 0; }
    const rows = state.gen.nextChunk({ biome: biomeAt(game, state.generated + CHUNK / 2), start });
    state.generated += rows.length;
    return rows;
  }
  function grow(game) {
    const state = game.ruleState("hallucination");
    state.above = [...dreamChunk(game), ...state.above];
  }
  // A start tile near the lower middle of the window, for new rounds.
  function dreamSpawn(rows) {
    let best = null, bestScore = Infinity;
    for (let y = 16; y < ROWS - 2; y++) for (let x = 1; x < COLS - 1; x++) {
      if (!".P ".includes(rows[y][x])) continue;
      const score = Math.abs(x + 0.5 - 13.5) + Math.abs(y + 0.5 - 24.5) * 2;
      if (score < bestScore) { bestScore = score; best = [x + 0.5, y + 0.5]; }
    }
    return best || [13.5, 27.5];
  }
  function dreamMap(state) {
    return E.compileMap({
      id: "hallucination-" + state.distance, name: "SUNSET", houseless: true,
      wall: wallAt(state.distance + ROWS / 2), wallRows: state.rows.map((_, y) => wallAt(state.distance + ROWS - 1 - y)),
      darkness: darknessAt(state.distance + ROWS / 2), spawn: dreamSpawn(state.rows), rows: state.rows,
    });
  }
  // Takes ghost and pickup markers out of window rows, returning where they were.
  function collectMarkers(state, from, to) {
    const found = [];
    for (let y = from; y < to; y++) {
      for (let x = 0; x < COLS; x++) if (state.rows[y][x] === "G" || state.rows[y][x] === "U") found.push({ marker: state.rows[y][x], x, y });
      state.rows[y] = state.rows[y].replace(/[GU]/g, " ");
    }
    return found;
  }
  function applyMarkers(game, markers) {
    for (const { marker, x, y } of markers) {
      if (marker === "G") spawnDreamGhost(game, x + 0.5, y + 0.5);
      else if (game.random() < 0.6) {
        const loadout = (game.options && game.options.loadout || DEFAULT_LOADOUT).filter((id) => E.POWERUPS.has(id));
        game.spawnItem({ kind: "powerup", id: pick(game, loadout.length ? loadout : DEFAULT_LOADOUT), x: x + 0.5, y: y + 0.5 });
      }
    }
  }
  const ghostCap = (state) => Math.min(9, 3 + Math.floor(state.distance / 80));
  // Markers only sometimes become ghosts, more often the further you climb.
  function spawnDreamGhost(game, x, y) {
    const state = game.ruleState("hallucination");
    if (game.ghosts.length >= ghostCap(state) || game.random() > Math.min(0.9, 0.35 + state.distance / 600)) return;
    const kind = pick(game, DREAM_GHOSTS.filter((kind) => kind.from <= state.distance));
    game.spawnGhost(kind.id, x, y, { brain: kind.brain, dir: game.random() < 0.5 ? 1 : 3 });
  }
  // A ghost that always appears: Blinky first, then any other kind unlocked by distance
  // (at least Inky), on an open tile between rows `top` and `bottom`, well away from players.
  function forceDreamGhost(game, top = 2, bottom = 12) {
    const state = game.ruleState("hallucination");
    const band = (x, y) => y >= top && y <= bottom;
    const spot = pick(game, openTiles(game, 8, band)) || pick(game, openTiles(game, 5, band)) || pick(game, openTiles(game, 8));
    if (!spot) return null;
    const kind = !game.ghosts.some((ghost) => ghost.id === "blinky") ? DREAM_GHOSTS[0]
      : pick(game, DREAM_GHOSTS.filter((kind) => kind.id !== "blinky" && kind.from <= Math.max(24, state.distance)));
    return game.spawnGhost(kind.id, spot.x, spot.y, { brain: kind.brain, dir: game.random() < 0.5 ? 1 : 3 });
  }
  // The fewest ghosts on the board: two at the start, one more every 100 rows.
  const ghostFloor = (state) => Math.min(ghostCap(state), START_GHOSTS + Math.floor(state.distance / 100));
  // Compiles the window the next scroll will show, so its artwork can be drawn
  // ahead of time; the rows are already decided, so this changes nothing.
  function prepareNext(game) {
    const state = game.ruleState("hallucination");
    while (state.above.length < SHIFT) grow(game);
    const rows = [...state.above.slice(state.above.length - SHIFT), ...state.rows.slice(0, ROWS - SHIFT)].map((row) => row.replace(/[GU]/g, " "));
    state.next = dreamMap({ rows, distance: state.distance + SHIFT });
  }
  // Moves the camera up SHIFT rows: new rows enter at the top, everything else moves down.
  function scrollDream(game) {
    const state = game.ruleState("hallucination");
    while (state.above.length < SHIFT) grow(game);
    const incoming = state.above.splice(state.above.length - SHIFT, SHIFT);
    state.rows = [...incoming, ...state.rows.slice(0, ROWS - SHIFT)];
    const pellets = new Uint8Array(COLS * ROWS);
    pellets.set(game.pellets.subarray(0, (ROWS - SHIFT) * COLS), SHIFT * COLS);
    for (let y = 0; y < SHIFT; y++) for (let x = 0; x < COLS; x++) {
      const cell = state.rows[y][x];
      if (cell === ".") pellets[y * COLS + x] = 1;
      else if (cell === "P") pellets[y * COLS + x] = 2;
    }
    const move = (thing) => { thing.y += SHIFT; };
    for (const pac of game.players) { move(pac); if (pac.cornerAxis === "y") pac.cornerTarget += SHIFT; }
    for (const ghost of game.ghosts) move(ghost);
    for (const item of game.items) move(item);
    for (const flame of game.ruleState("hazards").list || []) move(flame);
    if (game.bonusPopup) move(game.bonusPopup);
    game.ghosts = game.ghosts.filter((ghost) => ghost.y < ROWS - 0.5);
    game.items = game.items.filter((item) => item.y < ROWS - 0.5);
    // A co-op player left behind below the screen is deleted, like everything else down there.
    for (const pac of game.players) if (pac.alive && pac.y >= ROWS - 0.5 && game.state === "PLAYING") game.killPlayer(pac);
    state.distance += SHIFT;
    state.glitchLine += SHIFT;
    applyMarkers(game, collectMarkers(state, 0, SHIFT));
    const ready = state.next && state.next.rows.every((row, y) => row === state.rows[y]);
    game.map = state.map = ready ? state.next : dreamMap(state);
    prepareNext(game);
    game.pellets = pellets;
    game.dotsRemaining = pellets.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    game.dotsTotal = Math.max(game.dotsTotal, game.map.total);
    game.addScore(SHIFT * 10, null, "bonus");
    game.emit("scroll", { rows: SHIFT, distance: state.distance });
    // Announce a zone once its style fills the middle of the screen.
    const zone = zoneAt(state.distance + ROWS / 2);
    if (zone.biome.id !== state.zone) { state.zone = zone.biome.id; game.emit("zone", { id: zone.biome.id, name: zone.name, color: zone.wall }); }
  }
  // The glitch climbs faster with distance, and much faster if co-op players spread out.
  const SPREAD_LIMIT = 14, SPREAD_WARNING = 11, DANGER_ROWS = 4;
  const spreadOf = (living) => living.length > 1 ? Math.max(...living.map((p) => p.y)) - Math.min(...living.map((p) => p.y)) : 0;
  function glitchSpeed(game, state) {
    return Math.min(1.3, 0.4 + state.distance * 0.0015) * (spreadOf(game.livingPlayers()) > SPREAD_LIMIT ? 2.5 : 1);
  }

  E.registerRuleset({
    id: "hallucination",
    name: "SUNSET",
    about: "An endless maze climbing away from permanent deletion. Export before sunset: chain dots, bring three power-ups.",
    lives: { 1: 3, 2: 4, 3: 5, 4: 6 },
    results: true,
    gameOverHold: 20,
    onStart(game) {
      const state = Object.assign(game.ruleState("hallucination"), {
        distance: 0, glitchLine: ROWS + 3, chain: [0, 0, 0, 0], lastEat: [0, 0, 0, 0], bestChain: 0, refill: 0, zone: ZONES[0].biome.id,
        dangerAt: [-Infinity, -Infinity, -Infinity, -Infinity], spreadAt: -Infinity,
      });
      // The generator grows upward, so the start chunk comes first.
      let full = dreamChunk(game, true);
      while (full.length < ROWS + CHUNK) full = [...dreamChunk(game), ...full];
      state.rows = full.slice(full.length - ROWS);
      state.above = full.slice(0, full.length - ROWS);
      // Markers near the start stay empty so nothing spawns on top of the players;
      // the rest wait for the round to begin, as ghosts can only join once it has.
      state.pending = collectMarkers(state, 0, 16);
      collectMarkers(state, 16, ROWS);
      state.map = dreamMap(state);
      prepareNext(game);
    },
    mapForLevel: (game) => game.ruleState("hallucination").map,
    onRoundStart(game, afterLife) {
      const state = game.ruleState("hallucination");
      // No scatter phases: every ghost hunts from the moment it appears.
      game.mode = "CHASE"; game.modeIndex = E.MODES.length - 1; game.modeTimer = Infinity;
      if (state.pending) { applyMarkers(game, state.pending); state.pending = null; }
      if (afterLife) state.glitchLine = ROWS + 3;
      for (const pac of game.players) if (pac.alive) rescue(game, pac);
      // Every round, including after a death (which clears the board), starts with ghosts hunting.
      while (game.ghosts.length < START_GHOSTS && forceDreamGhost(game));
      state.refill = 0;
    },
    onTick(game, dt) {
      if (game.freezeTimer > 0) return;
      const state = game.ruleState("hallucination");
      state.glitchLine -= glitchSpeed(game, state) * dt;
      const living = game.livingPlayers();
      if (living.length && Math.min(...living.map((p) => p.y)) < LEAD_ROW) scrollDream(game);
      for (const pac of game.livingPlayers()) {
        if (pac.moving && game.playTime - state.lastEat[pac.index] > 0.28) state.chain[pac.index] = 0;
        // Deleted once the glitch passes the player's centre, the solid edge drawn by overlays.js.
        if (pac.y > state.glitchLine + 0.1 && game.state === "PLAYING") { game.killPlayer(pac); continue; }
        // A warning (sound and a flashing edge) when the glitch or the bottom of the screen is close.
        const behind = game.playerCount > 1 && pac.y > ROWS - DANGER_ROWS && spreadOf(game.livingPlayers()) > SPREAD_WARNING;
        if ((pac.y > state.glitchLine - DANGER_ROWS || behind) && game.playTime - state.dangerAt[pac.index] > 1.5) {
          state.dangerAt[pac.index] = game.playTime;
          game.emit("danger", { player: pac.index });
        }
      }
      if (spreadOf(game.livingPlayers()) > SPREAD_WARNING && game.playTime - state.spreadAt > 3) {
        state.spreadAt = game.playTime;
        game.emit("spread", { fast: spreadOf(game.livingPlayers()) > SPREAD_LIMIT });
      }
      game.ghosts = game.ghosts.filter((ghost) => ghost.y < state.glitchLine + 0.5);
      game.items = game.items.filter((item) => item.y < state.glitchLine + 0.5);
      // Eaten ghosts vanish on an open field; new ones drop in from the top to keep the pressure up.
      if (game.state === "PLAYING" && game.ghosts.length < ghostFloor(state)) {
        state.refill += dt;
        if (state.refill >= REFILL_SECONDS) { forceDreamGhost(game, 0, 8); state.refill = 0; }
      } else state.refill = 0;
    },
    // 256-style chains: dots eaten back to back pay out at milestones, and 256 clears the screen.
    onPellet(game, pac) {
      const state = game.ruleState("hallucination");
      const chain = state.chain[pac.index] = state.chain[pac.index] + 1;
      state.lastEat[pac.index] = game.playTime;
      state.bestChain = Math.max(state.bestChain, chain);
      if (CHAIN_MILESTONES.includes(chain)) {
        game.addScore(chain * 10, pac, "dot");
        game.bonusPopup = { text: String(chain * 10), x: pac.x, y: pac.y - 1, timeLeft: 1.2, color: "#ffb8ff" };
        game.emit("chain", { player: pac.index, chain });
      } else if (chain === 256) {
        for (const ghost of game.ghosts.slice()) game.zapGhost(ghost, pac);
        game.emit("chain", { player: pac.index, chain });
      }
    },
    // Co-op: a fallen player's token waits on the board; a partner collects it to revive them.
    autoRespawn: () => false,
    onDeath(game, pac) {
      const living = game.livingPlayers();
      // killPlayer spends the life after this hook: a token only when a spare remains after that.
      if (!living.length || game.lives - 1 <= living.length) return;
      const lowest = Math.max(...living.map((p) => p.y));
      const spot = pick(game, openTiles(game, 3, (x, y) => y > lowest - 10 && y < lowest - 3)) || pick(game, openTiles(game, 3));
      if (spot) game.spawnItem({ kind: "revive", player: pac.index, x: spot.x, y: spot.y, persist: true });
    },
    onItem(game, item) {
      if (item.kind !== "revive") return;
      const pac = game.players[item.player];
      if (!pac || pac.alive) return;
      game.respawnPlayer(pac);
      Object.assign(pac, { x: item.x, y: item.y });
    },
    speedScale(game, scale, actor) {
      const state = game.ruleState("hallucination");
      return actor.type === "pacman" ? scale * 1.1 : scale * (1 + Math.min(0.25, state.distance / 2000));
    },
    frightDuration: () => 5,
    fruitEnabled: () => false,
    elroyEnabled: () => false,
    levelCleared: () => true,
    resultLines(game) {
      const state = game.ruleState("hallucination");
      return [[state.distance + " ROWS", "CHAIN " + state.bestChain]];
    },
  });

  // ---- VERSUS ARENA ---------------------------------------------------------------------
  // After Pac-Man Party Royale: up to four contestants, with bots filling empty
  // seats. Dots build speed; the power pellet runs, and only a fast player can
  // catch it; energised players eat rivals, who become spirits that swap back
  // by tagging a live player. Late in the round the arena's edges glitch shut,
  // stopping at the largest central region that still holds a loop of corridor.
  // Tuning lives in the ruleset's `tuning` data so playtests can change it.
  const TUNING = Object.freeze({
    roundSeconds: 120, closeAt: 75, closeEvery: 3.2, maxMargin: 11,
    boostPerDot: 0.008, maxBoost: 0.4, catchBoost: 0.18,
    runnerFirst: 6, runnerEvery: 10, claudeSpeed: 0.8,
  });
  const tuning = (game) => (game.rules && game.rules.tuning) || TUNING;
  const DEBUFFS = Object.freeze(["inverted", "sluggish", "bait", "muzzled"]);
  const versusState = (game) => game.ruleState("versus");
  const live = (pac) => pac.alive && !pac.out;
  const isSpirit = (pac) => E.STATUSES.has("spirit") && pac.status.some((s) => s.id === "spirit");
  const has = (actor, id) => actor.status.some((s) => s.id === id);
  const walkableTile = (game, x, y) => ["floor", "dot", "power", "tunnel"].includes(tileKind(x, y, game.map));
  // The last live star can't be turned into a spirit by an arena ghost or an
  // injection, so the arena never ends up with nobody left to tag.
  const lastStar = (game, pac) => game.players.filter((p) => live(p) && !isSpirit(p)).length <= 1 && live(pac) && !isSpirit(pac);

  E.registerStatus({ id: "spirit", hidden: true, label: "SPIRIT", color: "#c4cced" });
  E.registerStatus({ id: "energized", speed: 1.1, label: "ENERGIZED", color: "#ffe52c" });
  E.registerStatus({ id: "fresh" });
  E.registerStatus({ id: "inverted", label: "BUG: INVERTED", color: "#65e2ef" });
  E.registerStatus({ id: "sluggish", speed: 0.7, label: "BUG: SLOW", color: "#65e2ef" });
  E.registerStatus({ id: "bait", label: "BUG: BAIT", color: "#65e2ef" });
  E.registerStatus({ id: "muzzled", label: "BUG: MUTED", color: "#65e2ef" });
  E.registerStatus({
    id: "injected", label: "PROMPT INJECTION", color: "#ff8a3d",
    onExpire(game, pac, status) {
      if (status.data.passed || !live(pac)) return;
      game.emit("explosion", { player: pac.index, x: pac.x, y: pac.y, hits: 0 });
      if (lastStar(game, pac)) game.addStatus(pac, "fresh", 1.5);
      else becomeSpirit(game, pac, null);
    },
  });

  function becomeSpirit(game, pac, by) {
    if (!live(pac) || isSpirit(pac)) return;
    for (const id of ["energized", "injected", "bait"]) if (has(pac, id)) { const s = game.getStatus(pac, id); s.data.passed = true; game.removeStatus(pac, id); }
    game.addStatus(pac, "spirit", Infinity);
    game.addStatus(pac, "fresh", 1.5);
    if (by) game.addScore(500, by, "ghost");
    game.emit("caught", { player: pac.index, by: by ? by.index : null });
  }
  function revive(game, spirit, victim) {
    game.removeStatus(spirit, "spirit");
    game.addStatus(spirit, "fresh", 1.5);
    game.addScore(300, spirit, "ghost");
    game.emit("swap", { player: spirit.index, victim: victim.index });
    becomeSpirit(game, victim, null);
  }
  // Sends an arena ghost home without scoring anyone.
  function sendHome(ghost) {
    if (ghost.state === "EATEN" || ghost.state === "HOUSE") return;
    ghost.state = "EATEN"; ghost.dir = E.opposite(ghost.dir); ghost.status.length = 0;
  }

  // ---- Versus bots ----------------------------------------------------------------------
  // Difficulty changes how well bots decide, never how fast they move or which
  // rules apply: how often they look around (reaction), how often they hesitate or
  // take a wrong turn, how far they notice threats, how they flee, how long they
  // stick to a plan, when they chase the runner and whether they lead a target.
  const BOT_LEVELS = Object.freeze({
    easy: Object.freeze({ think: 12, hesitate: 0.15, mistake: 0.08, rivalRadius: 3, claudeRadius: 3, avoidAll: false, fleeByPath: false, commit: 1.5, runnerAt: "max", lead: 0, band: 3 }),
    normal: Object.freeze({ think: 8, hesitate: 0.05, mistake: 0.02, rivalRadius: 5, claudeRadius: 5, avoidAll: false, fleeByPath: false, commit: 1.0, runnerAt: "notch", lead: 0, band: 2 }),
    hard: Object.freeze({ think: 5, hesitate: 0.02, mistake: 0, rivalRadius: 6, claudeRadius: 5, avoidAll: true, fleeByPath: true, commit: 0.6, runnerAt: "notch", lead: 2, band: 1 }),
  });
  const botLevel = (game) => BOT_LEVELS[game.options && game.options.botLevel] || BOT_LEVELS.normal;

  // A breadth-first search from the bot, returning the first step toward the
  // nearest tile that satisfies `goal`. Neighbours are tried straight ahead
  // first and backward last, so equal routes never flip the bot around.
  function pathStep(game, pac, goal, avoid = () => false) {
    const sx = Math.floor(pac.x), sy = Math.floor(pac.y), start = sy * COLS + sx;
    const from = new Int16Array(COLS * ROWS).fill(-1), queue = [start];
    from[start] = start;
    const ahead = pac.dir >= 0 ? pac.dir : 1;
    const order = [ahead, (ahead + 1) % 4, (ahead + 3) % 4, E.opposite(ahead)];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i], x = at % COLS, y = Math.floor(at / COLS);
      if (at !== start && goal(x, y)) {
        let step = at;
        while (from[step] !== start) step = from[step];
        const tx = step % COLS, ty = Math.floor(step / COLS);
        const dx = ((tx - sx + COLS + COLS / 2) % COLS) - COLS / 2;
        return dx > 0 ? 3 : dx < 0 ? 1 : ty < sy ? 0 : 2;
      }
      for (const dir of order) {
        const d = DIRECTIONS[dir];
        let nx = x + d.x;
        const ny = y + d.y;
        if (game.map.tunnelRows.has(ny)) nx = (nx + COLS) % COLS;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || !walkableTile(game, nx, ny) || avoid(nx, ny)) continue;
        const next = ny * COLS + nx;
        if (from[next] >= 0) continue;
        from[next] = at; queue.push(next);
      }
    }
    return -1;
  }
  // Corridor distance from every tile to the nearest threat (for HARD bots).
  function threatDistances(game, threats) {
    const dist = new Int16Array(COLS * ROWS).fill(-1), queue = [];
    for (const t of threats) {
      const x = Math.floor(t.x), y = Math.floor(t.y);
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS || dist[y * COLS + x] >= 0) continue;
      dist[y * COLS + x] = 0; queue.push(y * COLS + x);
    }
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i], x = at % COLS, y = Math.floor(at / COLS);
      for (const d of DIRECTIONS) {
        let nx = x + d.x;
        const ny = y + d.y;
        if (game.map.tunnelRows.has(ny)) nx = (nx + COLS) % COLS;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || !walkableTile(game, nx, ny) || dist[ny * COLS + nx] >= 0) continue;
        dist[ny * COLS + nx] = dist[at] + 1; queue.push(ny * COLS + nx);
      }
    }
    return dist;
  }
  // Picks the neighbouring tile farthest from the threats, preferring to keep
  // going the same way (no coin-flip jitter between two near-equal escapes).
  function fleeStep(game, pac, threats, level, unsafe) {
    const x = Math.floor(pac.x), y = Math.floor(pac.y);
    const dist = level.fleeByPath ? threatDistances(game, threats) : null;
    let best = -1, bestScore = -Infinity;
    DIRECTIONS.forEach((d, dir) => {
      let nx = x + d.x;
      const ny = y + d.y;
      if (game.map.tunnelRows.has(ny)) nx = (nx + COLS) % COLS;
      if (!walkableTile(game, nx, ny) || unsafe(nx, ny)) return;
      const spot = { x: nx + 0.5, y: ny + 0.5 };
      let score = dist ? (dist[ny * COLS + nx] < 0 ? 99 : dist[ny * COLS + nx]) : Math.sqrt(Math.min(...threats.map((t) => distance2(t, spot))));
      if (dir === pac.dir) score += 0.35;
      if (score > bestScore) { bestScore = score; best = dir; }
    });
    return best;
  }
  // What a bot has noticed: rivals and ghosts as they were at its last look,
  // refreshed at its reaction interval. Its own state is always current.
  function perceive(game, pac) {
    return {
      tick: game.tickCount,
      rivals: game.players.filter((p) => p !== pac && live(p)).map((p) => ({
        index: p.index, x: p.x, y: p.y, dir: p.dir, spirit: isSpirit(p), energized: has(p, "energized"), fresh: has(p, "fresh"), injected: has(p, "injected"),
      })),
      ghosts: game.ghosts.filter((g) => g.state !== "EATEN" && g.state !== "HOUSE").map((g) => ({ id: g.id, x: g.x, y: g.y })),
      runner: (() => { const r = game.items.find((item) => item.kind === "runner"); return r ? { x: r.x, y: r.y, dir: r.dir } : null; })(),
    };
  }
  // Each bot always has a goal it can act on, and sticks with it while it stays valid:
  //   spirit     - hunts the nearest rival it can tag, else shadows the nearest live rival
  //   energised  - hunts the nearest rival it can eat, else grabs dots for speed
  //   injected   - runs the injection to the nearest live rival to pass it on
  //   threatened - flees energised rivals, spirits and Claude (HARD also avoids Muse and Gemini)
  //   otherwise  - chases the runaway pellet once fast enough, else eats dots for speed
  // It changes direction only on reaching a new tile or when its view refreshes,
  // and turns back only to escape a threat or once a plan has pointed backward
  // for its commit time. If nothing gives a step, it keeps moving.
  function thinkBot(game, pac) {
    const state = versusState(game), level = botLevel(game), T = tuning(game);
    const brain = pac.brain || (pac.brain = { view: null, goal: -1, backSince: null });
    if (!brain.view || game.tickCount - brain.view.tick >= level.think) brain.view = perceive(game, pac);
    const view = brain.view;
    const near = (list, range) => list.filter((t) => distance2(t, pac) <= range * range);
    const tileOf = (thing) => [Math.floor(thing.x), Math.floor(thing.y)];
    // Bots keep a band clear of the closing glitch; once it stops closing they use every safe tile.
    const margin = state.margin || 0, band = margin > 0 && margin < (state.maxMargin || T.maxMargin) ? level.band : 0;
    const edge = margin > 0 ? margin + band : 0;
    const unsafe = (x, y) => edge > 0 && (x < edge || x >= COLS - edge || y < edge || y >= ROWS - edge);
    const at = (things) => (x, y) => !unsafe(x, y) && things.some((t) => { const [tx, ty] = tileOf(t); return tx === x && ty === y; });
    const step = (goal) => pathStep(game, pac, goal, unsafe);
    // HARD bots aim where a moving target is heading, not where it is.
    const lead = (t) => {
      if (!level.lead || !DIRECTIONS[t.dir]) return t;
      const d = DIRECTIONS[t.dir], x = Math.floor(t.x) + d.x * level.lead, y = Math.floor(t.y) + d.y * level.lead;
      return walkableTile(game, x, y) ? { x: x + 0.5, y: y + 0.5 } : t;
    };
    const hunt = (valid) => {
      const pool = view.rivals.filter(valid);
      if (!pool.length) { pac.botTarget = null; return -1; }
      let target = pool.find((p) => p.index === pac.botTarget);
      if (!target) target = pool.reduce((a, b) => (distance2(a, pac) <= distance2(b, pac) ? a : b));
      pac.botTarget = target.index;
      return step(at([lead(target), target]));
    };
    // Dots: keep heading for the same dot until it is eaten, then pick the next.
    const dots = () => {
      if (brain.goal >= 0 && (!game.pellets[brain.goal] || unsafe(brain.goal % COLS, Math.floor(brain.goal / COLS)))) brain.goal = -1;
      if (brain.goal >= 0) {
        const dir = step((x, y) => y * COLS + x === brain.goal);
        if (dir >= 0) return dir;
        brain.goal = -1;
      }
      let found = -1;
      const dir = step((x, y) => { if (!unsafe(x, y) && game.pellets[y * COLS + x] > 0) { found = y * COLS + x; return true; } return false; });
      brain.goal = found;
      return dir;
    };
    let dir = -1, fleeing = false;
    const [px, py] = tileOf(pac);
    if (unsafe(px, py)) dir = pathStep(game, pac, (x, y) => !unsafe(x, y));
    else if (isSpirit(pac)) {
      dir = hunt((p) => !p.spirit && !p.energized && !p.fresh);
      if (dir < 0) dir = hunt((p) => !p.spirit);
    } else if (has(pac, "energized")) {
      dir = hunt((p) => !p.spirit && !p.energized && !p.fresh);
      if (dir < 0 && !has(pac, "muzzled")) dir = dots();
    } else {
      pac.botTarget = null;
      const dangerous = view.ghosts.filter((g) => g.id === "blinky" || level.avoidAll);
      const threats = [
        ...near(view.rivals.filter((p) => p.energized || (p.spirit && !has(pac, "fresh"))), level.rivalRadius),
        ...near(dangerous, level.claudeRadius),
      ];
      if (has(pac, "injected")) dir = hunt((p) => !p.spirit && !p.injected);
      if (dir < 0 && threats.length) { dir = fleeStep(game, pac, threats, level, unsafe); fleeing = dir >= 0; }
      if (dir < 0) {
        const needed = level.runnerAt === "max" ? T.maxBoost - 1e-9 : T.catchBoost;
        if (view.runner && state.boost[pac.index] >= needed) dir = step(at([lead(view.runner), view.runner]));
        if (dir < 0 && !has(pac, "muzzled")) dir = dots();
      }
    }
    // Nothing to do: keep moving along the corridor (turning only at a wall), inside the safe area.
    if (dir < 0) dir = keepMoving(game, pac, unsafe);
    // Turning back: at once to escape, otherwise only after the plan has insisted for a while.
    if (dir >= 0 && pac.dir >= 0 && dir === E.opposite(pac.dir) && !fleeing && !unsafe(px, py)) {
      if (brain.backSince === null) brain.backSince = game.playTime;
      if (game.playTime - brain.backSince < level.commit && walkableTile(game, px + DIRECTIONS[pac.dir].x, py + DIRECTIONS[pac.dir].y)) dir = pac.dir;
    } else brain.backSince = null;
    // Readable mistakes: a wrong turn now and then, and the odd hesitation.
    if (dir >= 0 && level.mistake && game.random() < level.mistake) {
      const turns = [0, 1, 2, 3].filter((d) => d !== E.opposite(pac.dir) && walkableTile(game, px + DIRECTIONS[d].x, py + DIRECTIONS[d].y));
      if (turns.length) dir = turns[Math.floor(game.random() * turns.length)];
    }
    if (dir >= 0 && game.random() >= level.hesitate) pac.wanted = dir;
  }
  // Runs a bot's brain when it reaches a new tile or its reaction interval passes.
  function driveBot(game, pac) {
    const level = botLevel(game), brain = pac.brain || (pac.brain = { view: null, goal: -1, backSince: null });
    const tile = Math.floor(pac.y) * COLS + Math.floor(pac.x);
    if (tile === brain.tile && game.tickCount - (brain.thought || 0) < level.think) return;
    brain.tile = tile; brain.thought = game.tickCount;
    thinkBot(game, pac);
  }
  function keepMoving(game, pac, unsafe) {
    const x = Math.floor(pac.x), y = Math.floor(pac.y);
    const ok = (dir) => { const nx = x + DIRECTIONS[dir].x, ny = y + DIRECTIONS[dir].y; return walkableTile(game, nx, ny) && !unsafe(nx, ny); };
    if (pac.dir >= 0 && ok(pac.dir)) return pac.dir;
    const turns = [0, 1, 2, 3].filter((dir) => dir !== E.opposite(pac.dir) && ok(dir));
    if (turns.length) return turns[Math.floor(game.random() * turns.length)];
    return [0, 1, 2, 3].find(ok) ?? -1;
  }

  // The power pellet runs from the nearest players along the corridors.
  function moveRunner(game, runner, dt) {
    const speed = E.speedProfile(1).pac * (1 + tuning(game).catchBoost * 0.9);
    game.travelActor(runner, speed * dt, () => {
      const x = Math.floor(runner.x), y = Math.floor(runner.y), chasers = game.players.filter((p) => live(p) && !isSpirit(p));
      const options = [0, 1, 2, 3].filter((dir) => walkableTile(game, x + DIRECTIONS[dir].x, y + DIRECTIONS[dir].y) && !inMargin(versusState(game), x + DIRECTIONS[dir].x, y + DIRECTIONS[dir].y));
      const forward = options.filter((dir) => dir !== E.opposite(runner.dir));
      let best = -1, bestScore = -Infinity;
      for (const dir of forward.length ? forward : options) {
        const spot = { x: x + DIRECTIONS[dir].x + 0.5, y: y + DIRECTIONS[dir].y + 0.5 };
        const score = (chasers.length ? Math.min(...chasers.map((p) => distance2(p, spot))) : 0) + game.random();
        if (score > bestScore) { bestScore = score; best = dir; }
      }
      runner.dir = best;
    });
  }

  // The largest margin whose inner rectangle still holds a connected loop of at
  // least 24 corridor tiles; the glitch never closes further than that.
  function sanctuaryMargin(map, limit) {
    const walk = (x, y) => ["floor", "dot", "power", "tunnel"].includes(tileKind(x, y, map));
    for (let m = limit; m > 0; m--) {
      const inside = (x, y) => x >= m && x < COLS - m && y >= m && y < ROWS - m && walk(x, y);
      const seen = new Uint8Array(COLS * ROWS);
      for (let y = m; y < ROWS - m; y++) for (let x = m; x < COLS - m; x++) {
        if (!inside(x, y) || seen[y * COLS + x]) continue;
        let tiles = 0, links = 0;
        const queue = [[x, y]]; seen[y * COLS + x] = 1;
        for (let i = 0; i < queue.length; i++) {
          const [cx, cy] = queue[i]; tiles++;
          for (const d of DIRECTIONS) {
            const nx = cx + d.x, ny = cy + d.y;
            if (!inside(nx, ny)) continue;
            links++;
            if (!seen[ny * COLS + nx]) { seen[ny * COLS + nx] = 1; queue.push([nx, ny]); }
          }
        }
        if (tiles >= 24 && links / 2 >= tiles) return m;
      }
    }
    return 0;
  }
  function scheduledMargin(game, state) {
    const T = tuning(game);
    return state.elapsed < T.closeAt ? 0 : Math.min(state.maxMargin ?? T.maxMargin, 1 + Math.floor((state.elapsed - T.closeAt) / T.closeEvery));
  }
  function inMargin(state, x, y, m = state.margin || 0) {
    return m > 0 && (x < m || x >= COLS - m || y < m || y >= ROWS - m);
  }
  function placements(game) {
    const state = versusState(game);
    const order = game.players.slice().sort((a, b) =>
      (a.out ? 1 : 0) - (b.out ? 1 : 0) || (isSpirit(a) ? 1 : 0) - (isSpirit(b) ? 1 : 0) ||
      (b.out ? state.outAt[b.index] : 0) - (a.out ? state.outAt[a.index] : 0) || game.playerScores[b.index] - game.playerScores[a.index] || a.index - b.index);
    return order.map((pac, i) => ({ index: pac.index, rank: i + 1, human: !pac.bot, name: E.PLAYERS[pac.index].name, score: game.playerScores[pac.index], out: Boolean(pac.out), spirit: isSpirit(pac) }));
  }
  function finish(game, reason) {
    game.endGame(reason);
    const winner = game.result.placements[0];
    game.emit("arenaWinner", winner);
  }

  E.registerRuleset({
    id: "versus",
    name: "VERSUS ARENA",
    about: "Four stars, one winner. Dots make you faster; catch the running power pellet, then eat your rivals.",
    // One life per contestant, so nobody sits out; the glitch does the eliminating.
    lives: { 1: 1, 2: 2, 3: 3, 4: 4 },
    results: true,
    gameOverHold: 20,
    contestants: 4,
    tuning: TUNING,
    onStart(game) {
      Object.assign(versusState(game), {
        elapsed: 0, margin: 0, maxMargin: null, boost: [0, 0, 0, 0], runnerTimer: tuning(game).runnerFirst, outAt: [0, 0, 0, 0],
        humans: Math.max(1, Math.min(game.playerCount, (game.options && game.options.humans) || 1)),
      });
    },
    onRoundStart(game) {
      const state = versusState(game);
      state.maxMargin = sanctuaryMargin(game.map, tuning(game).maxMargin);
      // The arena is all dots: power pellets are replaced by the runner.
      for (let i = 0; i < game.pellets.length; i++) if (game.pellets[i] === 2) game.pellets[i] = 1;
      game.players.forEach((pac) => { pac.bot = pac.index >= state.humans; });
      // Claude hunts, Muse spreads bugs, Gemini plants prompt injections; Grok sits out.
      game.ghosts = game.ghosts.filter((ghost) => ghost.id !== "inky");
      const release = { blinky: 0, pinky: 20, clyde: 35 };
      for (const ghost of game.ghosts) if (ghost.state === "HOUSE") ghost.homeTimer = release[ghost.id] || 0.1;
      game.mode = "CHASE"; game.modeIndex = E.MODES.length - 1; game.modeTimer = Infinity;
    },
    onTick(game, dt) {
      if (game.freezeTimer > 0) return;
      const state = versusState(game), T = tuning(game);
      const was = state.elapsed;
      state.elapsed += dt;
      if (was < T.closeAt - 5 && state.elapsed >= T.closeAt - 5) game.emit("arenaWarning", { seconds: 5 });
      // The closing glitch advances one step at a time, but never swallows every
      // player still standing at once; it waits until someone is clear.
      const target = scheduledMargin(game, state);
      if (target > state.margin) {
        const standing = game.players.filter(live);
        const next = state.margin + 1;
        if (!standing.length || standing.some((p) => !inMargin(state, Math.floor(p.x), Math.floor(p.y), next))) {
          state.margin = next;
          game.emit("arenaClose", { margin: next, final: next >= (state.maxMargin ?? T.maxMargin) });
        }
      }
      for (const pac of game.players) if (pac.bot && live(pac)) driveBot(game, pac);
      // The runaway power pellet.
      const runner = game.items.find((item) => item.kind === "runner");
      if (runner) moveRunner(game, runner, dt);
      else if ((state.runnerTimer -= dt) <= 0) {
        const spot = pick(game, openTiles(game, 8, (x, y) => !inMargin(state, x, y)));
        if (spot) game.spawnItem({ kind: "runner", type: "runner", x: spot.x, y: spot.y, dir: 1, cornerAxis: null });
        state.runnerTimer = T.runnerEvery;
      }
      if (state.margin > 0) {
        for (const pac of game.players) {
          if (!live(pac) || !inMargin(state, Math.floor(pac.x), Math.floor(pac.y))) continue;
          pac.alive = false; pac.out = true; pac.deathTimer = 0; state.outAt[pac.index] = state.elapsed;
          game.emit("eliminated", { player: pac.index });
        }
        for (const ghost of game.ghosts) if (inMargin(state, Math.floor(ghost.x), Math.floor(ghost.y))) sendHome(ghost);
        game.items = game.items.filter((item) => !inMargin(state, Math.floor(item.x), Math.floor(item.y)));
      }
      const standing = game.players.filter(live);
      // With no star left to tag (the last one was eliminated), the spirits re-form as stars.
      if (standing.length > 1 && standing.every(isSpirit)) {
        for (const pac of standing) { game.removeStatus(pac, "spirit"); game.addStatus(pac, "fresh", 1.5); }
        game.emit("reform", { players: standing.map((pac) => pac.index) });
      }
      if (standing.length <= 1 && game.players.length > 1) finish(game, "LAST STAR STANDING");
      else if (state.elapsed >= T.roundSeconds) finish(game, "TIME UP");
    },
    // Dots make you faster; spirits and muzzled players cannot eat.
    canEat: (game, can, pac) => can && !isSpirit(pac) && !has(pac, "muzzled"),
    canCollect: (game, can, item, pac) => can && !isSpirit(pac) && !(item.kind === "runner" && versusState(game).boost[pac.index] < tuning(game).catchBoost),
    onPellet(game, pac) {
      const state = versusState(game), T = tuning(game);
      state.boost[pac.index] = Math.min(T.maxBoost, state.boost[pac.index] + T.boostPerDot);
      if (game.dotsRemaining === 0) {
        game.pellets = E.mazePellets(game.map).pellets.map((value) => value ? 1 : 0);
        game.dotsRemaining = game.pellets.filter(Boolean).length;
        game.emit("dotsRefill", {});
      }
    },
    speedScale: (game, scale, actor) => actor.type === "pacman" ? scale * (1 + versusState(game).boost[actor.index]) :
      actor.type === "ghost" && actor.id === "blinky" ? scale * tuning(game).claudeSpeed : scale,
    steer: (game, direction, pac) => has(pac, "inverted") ? E.opposite(direction) : direction,
    onItem(game, item, pac) {
      if (item.kind !== "runner") return;
      game.addStatus(pac, "energized", 6);
      game.addScore(100, pac, "bonus");
      game.emit("runnerCaught", { player: pac.index });
    },
    // Touching an arena ghost: Claude catches, Muse bugs you, Gemini injects.
    collision(game, outcome, pac, ghost) {
      if (isSpirit(pac) || has(pac, "fresh") || ghost.state === "EATEN" || ghost.state === "HOUSE") return "ignore";
      if (has(pac, "energized")) return "zap";
      if (ghost.id === "pinky") {
        const debuff = pick(game, DEBUFFS);
        game.addStatus(pac, debuff, 5);
        game.emit("bugged", { player: pac.index, debuff });
        sendHome(ghost);
      } else if (ghost.id === "clyde") {
        if (!has(pac, "injected")) game.addStatus(pac, "injected", 6);
        game.emit("injected", { player: pac.index });
        sendHome(ghost);
      } else if (lastStar(game, pac)) {
        // The last star shrugs Claude off rather than leaving nobody to tag.
        sendHome(ghost);
        game.addStatus(pac, "fresh", 1.5);
        game.emit("shrugged", { player: pac.index });
      } else becomeSpirit(game, pac, null);
      return "ignore";
    },
    // Player against player.
    onAfterMove(game) {
      const contenders = game.players.filter(live);
      for (const a of contenders) for (const b of contenders) {
        if (a === b || distance2(a, b) > 0.8 * 0.8 || !live(a) || !live(b)) continue;
        if (has(a, "energized") && !has(b, "energized") && !isSpirit(b) && !has(b, "fresh")) becomeSpirit(game, b, a);
        else if (isSpirit(a) && !isSpirit(b) && !has(b, "energized") && !has(a, "fresh") && !has(b, "fresh")) revive(game, a, b);
        else if (has(b, "bait") && !isSpirit(a) && !isSpirit(b) && !has(b, "fresh")) becomeSpirit(game, b, a);
        else if (has(a, "injected") && !isSpirit(b) && !has(b, "injected") && !has(a, "fresh") && !has(b, "fresh")) {
          const time = game.getStatus(a, "injected").time;
          game.getStatus(a, "injected").data.passed = true; game.removeStatus(a, "injected");
          game.addStatus(b, "injected", Math.max(1.5, time)); game.addStatus(a, "fresh", 1);
          game.emit("injectionPassed", { from: a.index, to: b.index });
        }
      }
    },
    autoRespawn: () => false,
    fruitEnabled: () => false,
    elroyEnabled: () => false,
    levelCleared: () => true,
    frightDuration: () => 0,
    placements,
    resultLines(game) {
      const winner = placements(game)[0];
      return [[winner.name, "WINS"]];
    },
  });

  // versusBot: the VERSUS bot brain, for tools that want a seat to play like a bot without the BOT label.
  const api = Object.freeze({ versusBot: thinkBot, BOT_LEVELS, sanctuaryMargin, HALVES, benchmarkMap, beamCells, lineOfSight, dreamChunk, CHUNK, SHIFT, START_GHOSTS, REFILL_SECONDS, ZONES, ZONE_ROWS, BLEND_ROWS, wallAt, darknessAt });
  root.AstraModes = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
