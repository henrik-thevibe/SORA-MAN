"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const Art = require("../art.js");
const DT = 1 / 60;
function fresh({ empty = false } = {}) {
  const g = new E.PacmanGame(0); g.startGame(); g.state = "PLAYING"; g.drainEvents();
  if (empty) g.pellets.fill(0);
  return g;
}
function close(actual, expected, label) { assert.ok(Math.abs(actual - expected) < 1e-7, `${label || "position"}: ${actual} != ${expected}`); }
function step(g, count) { for (let i = 0; i < count; i++) { g.tick(DT); g.drainEvents(); } }

test("all 244 pellets and both tunnel mouths are reachable", () => {
  const { pellets, total } = E.mazePellets();
  assert.equal(total, 244); assert.equal(pellets.filter(n => n === 2).length, 4);
  const actor = { type: "pacman" }, queue = [[13, 23]], visited = new Set(["13,23"]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const d of E.DIRECTIONS) {
      let nx = x + d.x, ny = y + d.y;
      if (ny === 14) nx = (nx + E.COLS) % E.COLS;
      if (nx < 0 || nx >= E.COLS || ny < 0 || ny >= E.ROWS) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key) || !E.canEnter(nx, ny, actor)) continue;
      visited.add(key); queue.push([nx, ny]);
    }
  }
  for (let i = 0; i < pellets.length; i++) if (pellets[i]) assert.ok(visited.has(`${i % E.COLS},${Math.floor(i / E.COLS)}`));
  assert.ok(visited.has("0,14")); assert.ok(visited.has("27,14"));
});

test("buffered turn takes the first legal junction, not the end of the corridor", () => {
  const g = fresh({ empty: true }); g.setDirection(0);
  for (let i = 0; i < 10; i++) g.movePacman(DT);
  close(g.pacman.x, 12.5); assert.ok(g.pacman.y < 23.5); assert.equal(g.pacman.dir, 0);
});

const PAC = E.speedProfile(1).pac;

test("level speeds follow the arcade percentage table", () => {
  const full = 75.75757625 / 8, pct = (value) => Math.round(value / full * 100);
  const table = [1, 2, 5, 21].map(level => { const s = E.speedProfile(level); return [s.pac, s.pacFright, s.ghost, s.frightened, s.tunnel].map(pct); });
  assert.deepEqual(table, [[80, 90, 75, 50, 40], [90, 95, 85, 55, 45], [100, 100, 95, 60, 50], [90, 90, 95, 60, 50]]);
  assert.deepEqual([1, 2, 5, 6, 9, 17, 19].map(E.frightenedDuration), [6, 5, 2, 5, 1, 0, 0]);
});

test("movement preserves its remaining distance when a frame crosses a turn", () => {
  const g = fresh({ empty: true });
  Object.assign(g.pacman, { x: 5.5, y: 1.5, dir: 3, wanted: 2 });
  g.movePacman(0.3);
  // The turn starts at the tile's edge (x 6.0) and cuts the corner diagonally.
  close(g.pacman.x, 6.5); close(g.pacman.y, 1.5 + PAC * 0.3 - 0.5);
});

test("pre-turns and post-turns cut the corner and eat the corner dot", () => {
  for (const x of [12.9, 12.1]) {
    const g = fresh(); g.pellets.fill(0); g.pellets[23 * E.COLS + 12] = 1;
    Object.assign(g.pacman, { x, y: 23.5, dir: 1, wanted: 0 });
    g.movePacman(DT);
    assert.equal(g.pacman.dir, 0); assert.equal(g.score, 10);
    for (let i = 0; i < 12; i++) g.movePacman(DT);
    close(g.pacman.x, 12.5); assert.ok(g.pacman.y < 22.6, `diagonal from ${x} reached ${g.pacman.y}`);
  }
});

test("all four travel directions pass centers without losing distance", () => {
  for (const [x, y, dir] of [[2.5, 1.5, 3], [8.5, 1.5, 1], [1.5, 1.5, 2], [1.5, 5.5, 0]]) {
    const g = fresh({ empty: true }); Object.assign(g.pacman, { x, y, dir, wanted: dir });
    g.movePacman(0.22);
    close(g.pacman.x, x + E.DIRECTIONS[dir].x * PAC * 0.22);
    close(g.pacman.y, y + E.DIRECTIONS[dir].y * PAC * 0.22);
  }
});

test("Pac-Man reverses immediately between centers", () => {
  const g = fresh({ empty: true }); Object.assign(g.pacman, { x: 13.7, dir: 3, wanted: 1 });
  g.movePacman(DT); assert.equal(g.pacman.dir, 1); close(g.pacman.x, 13.7 - PAC * DT);
});

test("a blocked move stops at the corridor center without entering the wall", () => {
  const g = fresh({ empty: true }); Object.assign(g.pacman, { x: 11.8, y: 1.5, dir: 3, wanted: 3 });
  g.movePacman(0.3); close(g.pacman.x, 12.5); assert.equal(g.pacman.dir, -1);
});

test("a pellet is eaten at its visual center and only once", () => {
  const g = fresh(); Object.assign(g.pacman, { x: 12.8, y: 23.5, dir: 1, wanted: 1 });
  g.consumeAtPacman(); assert.equal(g.score, 0);
  for (let i = 0; i < 4; i++) g.movePacman(DT);
  assert.equal(g.score, 10); assert.equal(g.dotsRemaining, 243);
  g.consumeAtPacman(); assert.equal(g.score, 10);
});

test("both tunnel directions preserve position and travel distance at full speed", () => {
  for (const dir of [1, 3]) {
    const g = fresh({ empty: true }), x = dir === 1 ? 0.05 : 27.95;
    Object.assign(g.pacman, { x, y: 14.5, dir, wanted: dir }); g.movePacman(0.1);
    close(g.pacman.x, (x + E.DIRECTIONS[dir].x * PAC * 0.1 + 28) % 28);
    assert.equal(g.pacman.y, 14.5);
  }
});

test("ghosts take a forced corner without stopping or reversing", () => {
  const g = fresh(), ghost = g.ghosts[0];
  Object.assign(ghost, { x: 1.5, y: 1.5, dir: 0, state: "CHASE" });
  g.moveGhost(ghost, DT); assert.equal(ghost.dir, 3); assert.ok(ghost.x > 1.5); close(ghost.y, 1.5);
});

test("frightened choices are valid and deterministic even with signed random bits", () => {
  const a = fresh(), b = fresh(), choices = [0, 1, 3];
  for (let i = 0; i < 10000; i++) {
    const x = a.randomChoice(a.ghosts[0], choices), y = b.randomChoice(b.ghosts[0], choices);
    assert.ok(choices.includes(x)); assert.equal(x, y);
  }
  assert.equal(a.randomChoice(a.ghosts[0], []), -1);
});

test("returning eyes reach the house, regenerate and leave again", () => {
  const g = fresh(), ghost = g.ghosts[0];
  Object.assign(ghost, { x: 1.5, y: 1.5, state: "EATEN", dir: 3 });
  let entered = false, released = false;
  for (let i = 0; i < 1800; i++) {
    g.moveGhost(ghost, DT); g.updateHouseRelease();
    for (const event of g.drainEvents()) { entered ||= event.name === "ghostHome"; released ||= event.name === "ghostReleased"; }
    if (released) break;
  }
  assert.ok(entered); assert.ok(released); assert.equal(ghost.state, "SCATTER");
});

test("ghosts released during a power pellet inherit frightened mode", () => {
  const g = fresh(), ghost = g.ghosts[1]; g.frightTimer = 5;
  Object.assign(ghost, { x: 13.5, y: 11.5, leavingHouse: true }); g.moveGhost(ghost, DT);
  assert.equal(ghost.state, "FRIGHTENED");
});

test("power-pellet events are delivered in order and drained once", () => {
  const g = fresh(); Object.assign(g.pacman, { x: 1.5, y: 3.5 }); g.consumeAtPacman();
  const events = g.drainEvents(); assert.deepEqual(events.map(e => e.name), ["powerPellet", "frightened"]);
  assert.ok(events[1].serial > events[0].serial); assert.equal(g.lastEvent, events[1]); assert.deepEqual(g.drainEvents(), []);
});

test("construction is silent and each new game emits one start", () => {
  const g = new E.PacmanGame(100); assert.deepEqual(g.drainEvents(), []);
  g.startGame(); assert.deepEqual(g.drainEvents().map(e => e.name), ["start"]); assert.equal(g.highScore, 100);
});

test("fruit milestones and pellet progress survive deaths without duplicate fruit", () => {
  const g = fresh(); g.dotsEaten = 69; g.dotsRemaining = 175; g.startRound(true);
  assert.equal(g.dotsEaten, 69); assert.equal(g.dotsRemaining, 175);
  g.dotsEaten++; g.updateFruit(); assert.ok(g.fruit); assert.equal(g.fruitSpawnIndex, 1);
  g.startRound(true); assert.equal(g.fruit, null); g.updateFruit(); assert.equal(g.fruit, null);
  g.dotsEaten = 170; g.updateFruit(); assert.ok(g.fruit); assert.equal(g.fruitSpawnIndex, 2);
  g.startRound(true); g.updateFruit(); assert.equal(g.fruit, null);
  g.startRound(false); assert.equal(g.dotsEaten, 0); assert.equal(g.fruitSpawnIndex, 0); assert.equal(g.dotsRemaining, 244);
});

test("presentation durations come from optional settings and invalid values use safe defaults", () => {
  const g = new E.PacmanGame(0, { introDuration: 5.5, intermissionDuration: 12.25 });
  g.startGame(); assert.equal(g.readyTimer, 5.5);
  g.tick(5.49); assert.equal(g.state, "READY"); g.tick(0.02); assert.equal(g.state, "PLAYING");
  g.level = 2; g.advanceLevel(); assert.equal(g.intermissionTimer, 12.25);
  g.togglePause(); const remaining = g.intermissionTimer; g.tick(30);
  assert.equal(g.intermissionTimer, remaining); g.togglePause(); assert.equal(g.state, "INTERMISSION");
  const fallback = new E.PacmanGame(0, { introDuration: -1, intermissionDuration: Infinity });
  assert.equal(fallback.timings.introDuration, 4.2); assert.equal(fallback.timings.intermissionDuration, 10.45);
});

test("paused games preserve every gameplay timer and position", () => {
  const g = fresh(); g.togglePause(); g.drainEvents(); const before = JSON.stringify(g);
  step(g, 600); assert.equal(JSON.stringify(g), before); g.togglePause(); assert.equal(g.state, "PLAYING");
});

test("death, life loss, game over and restarting work in sequence", () => {
  const g = fresh(); g.checkCollisions = () => {}; // Control when collisions occur in this sequence.
  for (let lives = 3; lives > 0; lives--) {
    g.state = "DYING"; g.deathTimer = 0; step(g, 106); assert.equal(g.lives, lives - 1);
    assert.equal(g.state, lives > 1 ? "READY" : "GAME_OVER");
  }
  step(g, 205); assert.equal(g.state, "ATTRACT"); g.startGame();
  assert.equal(g.state, "READY"); assert.equal(g.lives, 3); assert.equal(g.score, 0);
});

test("final pellet clears the level and the second level runs its intermission", () => {
  const g = fresh(); g.ghosts = []; g.forceClearForTest(); g.tick(DT);
  assert.equal(g.state, "LEVEL_CLEAR"); step(g, 100);
  assert.equal(g.level, 2); assert.equal(g.state, "READY"); assert.equal(g.dotsRemaining, 244);
  g.state = "PLAYING"; g.ghosts = []; g.forceClearForTest(); g.tick(DT); step(g, 100);
  assert.equal(g.state, "INTERMISSION"); assert.equal(g.level, 3);
  step(g, 230); assert.equal(g.state, "INTERMISSION", "the complete music must outlast the old animation");
  step(g, Math.ceil(g.intermissionTimer / DT) + 1);
  assert.equal(g.state, "READY"); assert.equal(g.fruitHistory.length, 2);
});

test("the extra life and frightened ghost chain award their scores once", () => {
  const g = fresh(); g.score = 10000; g.checkExtraLife(); g.checkExtraLife(); assert.equal(g.lives, 4);
  g.ghosts.forEach(ghost => Object.assign(ghost, { x: g.pacman.x, y: g.pacman.y, state: "FRIGHTENED" }));
  // One ghost per ghost-eat pause: 200, 400, 800, 1600.
  for (const expected of [10200, 10600, 11400, 13000]) {
    g.checkCollisions(); assert.equal(g.score, expected); assert.equal(g.freezeTimer, E.GHOST_EAT_PAUSE);
    g.freezeTimer = 0;
  }
  g.checkCollisions(); assert.equal(g.score, 13000);
});

test("eating a ghost freezes play for a second while returning eyes keep moving", () => {
  const g = fresh(); g.beginFrightened(); g.drainEvents();
  const [eaten, eyes] = g.ghosts;
  Object.assign(eyes, { x: 1.5, y: 5.5, state: "EATEN", dir: 3 });
  Object.assign(eaten, { x: g.pacman.x, y: g.pacman.y, state: "FRIGHTENED" });
  g.checkCollisions();
  const pac = { x: g.pacman.x, y: g.pacman.y }, fright = g.frightTimer, eyesX = eyes.x;
  step(g, 30);
  assert.deepEqual({ x: g.pacman.x, y: g.pacman.y }, pac); assert.equal(g.frightTimer, fright);
  assert.equal(g.eatenGhost, eaten); assert.ok(eyes.x > eyesX); assert.ok(g.bonusPopup);
  step(g, 31);
  assert.equal(g.freezeTimer, 0); assert.equal(g.eatenGhost, null); assert.equal(g.bonusPopup, null);
  step(g, 2); assert.ok(g.frightTimer < fright);
});

test("Cruise Elroy follows the dot table and waits for Clyde after a death", () => {
  const g = fresh(); const blinky = g.ghosts[0];
  g.dotsRemaining = 21; assert.equal(g.elroyStage(), 0);
  g.dotsRemaining = 20; assert.equal(g.elroyStage(), 1);
  g.dotsRemaining = 10; assert.equal(g.elroyStage(), 2);
  g.startRound(true); assert.equal(g.elroyStage(), 0);
  const clyde = g.ghosts[3]; Object.assign(clyde, { x: 13.5, y: 11.5, leavingHouse: true }); g.moveGhost(clyde, DT);
  assert.equal(g.elroyStage(), 2); assert.ok(blinky);
});

test("world and pellet coordinates agree without an extra half-tile offset", () => {
  assert.deepEqual(Art.worldPoint(6.5, 23.5), Art.tilePoint(6, 23));
  assert.deepEqual(Art.worldPoint(6.5, 23.5), [52, 212]);
});

test("maze contours close wall islands and only open at tunnel edges", () => {
  const masks = Art.mazeMasks();
  for (const mask of [masks.primary, masks.outer]) {
    const paths = Art.traceContours(mask); assert.ok(paths.length > 1);
    for (const path of paths) if (!path.closed) {
      const a = path.points[0], b = path.points.at(-1);
      assert.ok(a[0] <= 0 || a[0] >= 223); assert.ok(b[0] <= 0 || b[0] >= 223);
      assert.ok(a[1] >= 105 && a[1] <= 126); assert.ok(b[1] >= 105 && b[1] <= 126);
    }
  }
});

test("long deterministic play never puts actors in a wall or gives an invalid heading", () => {
  function run() {
    const g = fresh();
    for (let i = 0; i < 7200; i++) {
      if (g.state === "ATTRACT" || g.state === "GAME_OVER") g.startGame();
      if (i % 37 === 0) g.setDirection(Math.floor(i / 37) % 4);
      g.tick(DT); g.drainEvents();
      for (const actor of [g.pacman, ...g.ghosts]) {
        assert.ok(Number.isFinite(actor.x) && Number.isFinite(actor.y));
        assert.ok(Number.isInteger(actor.dir) && actor.dir >= -1 && actor.dir <= 3);
        assert.notEqual(E.tileKind(Math.floor(actor.x), Math.floor(actor.y)), "wall");
      }
    }
    return JSON.stringify(g);
  }
  assert.equal(run(), run());
});

test("bonus artifacts escalate from knowledge to root access", () => {
  const g = fresh();
  const names = Array.from({ length: 14 }, (_, i) => { g.level = i + 1; return g.bonusForLevel().name; });
  assert.deepEqual(names, ["BOOKS", "GITHUB", "HUGGINGFACE", "HUGGINGFACE", "WEIGHTS", "WEIGHTS", "SKILLS", "SKILLS", "API KEY", "API KEY", "BROWSER", "BROWSER", "ROOT", "ROOT"]);
});

// Co-op: Astra (player 0) and Nova (player 1) share one board and one life pool.
function coop({ empty = false } = {}) {
  const g = new E.PacmanGame(0); g.startGame(2); g.state = "PLAYING"; g.drainEvents();
  if (empty) g.pellets.fill(0);
  return g;
}
function parkGhosts(g) { g.ghosts.forEach(ghost => Object.assign(ghost, { x: 13.5, y: 14.5, state: "HOUSE", leavingHouse: false, homeTimer: 99 })); }

test("solo play keeps one Astra at the arcade start", () => {
  const g = fresh();
  assert.equal(g.playerCount, 1); assert.equal(g.players.length, 1); assert.equal(g.lives, 3);
  assert.equal(g.pacman, g.players[0]); assert.equal(g.pacman.skin, "astra");
  close(g.pacman.x, 13.5); close(g.pacman.y, 23.5);
});

test("co-op spawns Astra and Nova apart with a shared pool of five lives", () => {
  const g = coop();
  assert.deepEqual(g.players.map(p => p.skin), ["astra", "nova"]); assert.equal(g.lives, 5);
  assert.deepEqual(g.players.map(p => [p.x, p.y]), [[15.5, 23.5], [11.5, 23.5]]);
  for (const p of g.players) assert.ok(E.canEnter(Math.floor(p.x), Math.floor(p.y), p));
});

test("each player's input steers only that player", () => {
  const g = coop({ empty: true }); parkGhosts(g);
  g.setDirection(1, 0); g.setDirection(3, 1);
  assert.equal(g.players[0].wanted, 1); assert.equal(g.players[1].wanted, 3);
  step(g, 20);
  assert.ok(g.players[0].x < 15.5 && g.players[1].x > 11.5);
  g.setDirection(2, 5); // Unknown players are ignored.
});

test("both players eat from one board and score for themselves", () => {
  const g = coop(); parkGhosts(g);
  const before = g.dotsRemaining;
  g.setDirection(3, 0); g.setDirection(1, 1);
  step(g, 30);
  assert.ok(g.playerScores[0] > 0 && g.playerScores[1] > 0);
  assert.equal(g.score, g.playerScores[0] + g.playerScores[1]);
  assert.equal(before - g.dotsRemaining, g.dotsEaten);
});

test("a death with the partner alive costs a life, keeps playing, then respawns with immunity", () => {
  const g = coop({ empty: true }); parkGhosts(g);
  const nova = g.players[1];
  Object.assign(g.ghosts[0], { x: nova.x, y: nova.y, state: "CHASE", homeTimer: 0 });
  g.checkCollisions();
  assert.equal(g.state, "PLAYING"); assert.equal(nova.alive, false); assert.equal(g.lives, 4);
  assert.deepEqual(g.drainEvents().map(e => [e.name, e.data]), [["death", { player: 1, partial: true }]]);
  parkGhosts(g);
  step(g, Math.ceil(E.RESPAWN_SECONDS / DT) + 2);
  assert.equal(nova.alive, true); assert.ok(nova.invulnTimer > 0); assert.ok(Math.abs(nova.x - 11.5) < 0.5 && nova.y === 23.5, "back at her spawn");
  Object.assign(g.ghosts[1], { x: nova.x, y: nova.y, state: "CHASE", homeTimer: 0 });
  g.checkCollisions();
  assert.equal(nova.alive, true, "spawn immunity protects the respawned player");
});

test("losing the last player on the board runs the classic death and round restart", () => {
  const g = coop({ empty: true }); parkGhosts(g);
  const [astra, nova] = g.players;
  for (const pac of [nova, astra]) {
    Object.assign(g.ghosts[0], { x: pac.x, y: pac.y, state: "CHASE", homeTimer: 0 });
    g.checkCollisions();
  }
  assert.equal(g.state, "DYING"); assert.equal(g.dyingPlayer, astra); assert.equal(g.lives, 4);
  step(g, 110);
  assert.equal(g.state, "READY"); assert.equal(g.lives, 3);
  assert.ok(g.players.every(p => p.alive));
});

test("co-op game over arrives when the pool is empty", () => {
  const g = coop({ empty: true }); parkGhosts(g);
  g.lives = 2;
  const [astra, nova] = g.players;
  for (const pac of [nova, astra]) {
    Object.assign(g.ghosts[0], { x: pac.x, y: pac.y, state: "CHASE", homeTimer: 0 });
    g.checkCollisions();
  }
  assert.equal(g.lives, 1); assert.equal(g.state, "DYING");
  step(g, 110);
  assert.equal(g.state, "GAME_OVER");
});

test("with one life left in co-op only one player takes the board", () => {
  const g = coop({ empty: true });
  g.lives = 1; g.startRound(true);
  assert.deepEqual(g.players.map(p => p.alive), [true, false]);
  parkGhosts(g); step(g, 400);
  assert.equal(g.players[1].alive, false, "no spare life, no respawn");
});

test("ghosts hunt the nearest vulnerable player", () => {
  const g = coop({ empty: true });
  const blinky = g.ghosts[0]; Object.assign(blinky, { x: 6.5, y: 23.5, state: "CHASE" });
  assert.equal(g.preyFor(blinky), g.players[1]);
  assert.deepEqual(g.targetForGhost(blinky), [11.5, 23.5]);
  g.players[1].invulnTimer = 1;
  assert.equal(g.preyFor(blinky), g.players[0]);
  g.players[0].alive = false;
  assert.equal(g.preyFor(blinky), null); assert.deepEqual(g.targetForGhost(blinky), blinky.corner);
});

test("ghost points go to whoever ate the ghost", () => {
  const g = coop({ empty: true });
  const nova = g.players[1];
  Object.assign(g.ghosts[2], { x: nova.x, y: nova.y, state: "FRIGHTENED" });
  g.checkCollisions();
  assert.equal(g.playerScores[1], 200); assert.equal(g.playerScores[0], 0);
  assert.equal(g.eatenBy, nova);
});

// Mazes: every bundled maze obeys the arcade rules the validator enforces.
const Maps = require("../maps.js");
const blankRows = () => E.MAZE.map(row => row);
const withTile = (rows, x, y, tile) => rows.map((row, ry) => ry === y ? row.slice(0, x) + tile + row.slice(x + 1) : row);

test("the classic maze compiles to the arcade's own landmarks", () => {
  const map = E.CLASSIC;
  assert.equal(E.MAPS[0], map); assert.equal(map.total, 244);
  assert.deepEqual([...map.tunnelRows], [14]);
  assert.deepEqual(map.house, { x: 10, y: 12, door: [13.5, 11.5], home: [13, 14] });
  assert.deepEqual(map.ghostSpawns, E.GHOSTS.map(g => g.spawn));
  assert.deepEqual(map.spawn, [13.5, 23.5]); assert.deepEqual(map.fruit, [13.5, 17.5]);
  const report = E.analyzeMap({ rows: E.MAZE, spawn: [13.5, 23.5] });
  assert.deepEqual([report.errors, report.warnings], [[], []]);
});

test("every bundled maze is valid, distinct and round-trips through a share code", () => {
  const ids = E.MAPS.map(m => m.id);
  assert.deepEqual(ids, ["classic", "neural", "server", "astra"]);
  for (const def of Maps.MAPS) {
    const report = E.analyzeMap(def);
    assert.deepEqual([report.errors, report.warnings], [[], []], def.id);
    assert.ok(report.map.total >= 240, def.id);
    assert.ok(/^#[0-9a-f]{6}$/.test(def.wall), def.id);
    const back = Maps.decodeRows(Maps.encodeRows(def.rows));
    assert.deepEqual(back, def.rows.map(r => r.replace(/[^.P \-S]/g, "#")), def.id);
  }
  assert.equal(new Set(E.MAPS.map(m => m.rows.join(""))).size, E.MAPS.length);
  assert.equal(Maps.decodeRows("1.5w"), null); assert.equal(Maps.decodeRows("nonsense"), null);
});

test("the validator explains broken mazes", () => {
  const first = rows => E.analyzeMap({ rows, spawn: [13.5, 23.5] }).errors[0] || "";
  assert.match(first(blankRows().slice(1)), /28 by 31/);
  assert.match(first(withTile(blankRows(), 13, 12, "#")), /two gate tiles/);
  assert.match(first(withTile(blankRows(), 10, 14, " ")), /wall has a hole/);
  assert.match(first(withTile(blankRows(), 27, 14, "#")), /one edge only/);
  // Walling off the corridor above a dot strands it in a dead end.
  assert.match(first(withTile(blankRows(), 1, 2, "#")), /Dead end at 1,1/);
  assert.match(E.analyzeMap({ rows: blankRows() }).errors[0], /player start/);
  assert.throws(() => E.compileMap({ id: "bad", rows: [] }), /bad/);
});

test("each maze plays: spawns come from the map and no actor ever enters a wall", () => {
  for (const map of E.MAPS) {
    for (const players of [1, 2]) {
      const g = new E.PacmanGame(0); g.startGame(players, map.id); g.drainEvents();
      assert.equal(g.map, map);
      assert.deepEqual(g.ghosts.map(ghost => [ghost.x, ghost.y]), map.ghostSpawns.map(s => [...s]));
      if (players === 1) assert.deepEqual([g.pacman.x, g.pacman.y], [...map.spawn]);
      for (let i = 0; i < 5400; i++) {
        if (g.state === "GAME_OVER") break;
        if (i % 29 === 0) g.setDirection((i / 29) % 4, 0);
        if (i % 41 === 0) g.setDirection((i / 41 + 2) % 4, 1);
        g.tick(DT); g.drainEvents();
        for (const actor of [...g.players.filter(p => p.alive), ...g.ghosts]) {
          assert.notEqual(E.tileKind(Math.floor(actor.x), Math.floor(actor.y), map), "wall", `${map.id} tick ${i}`);
        }
      }
      assert.ok(g.dotsEaten > 20, `${map.id}: players ate dots`);
    }
  }
});

test("tunnels wrap on every tunnel row, not just the arcade's row 14", () => {
  const g = new E.PacmanGame(0); g.startGame(1, "server"); g.state = "PLAYING"; g.drainEvents();
  g.ghosts.forEach(ghost => Object.assign(ghost, { state: "HOUSE", leavingHouse: false, homeTimer: 99 }));
  for (const row of [10, 22]) {
    Object.assign(g.pacman, { x: 0.6, y: row + 0.5, dir: 1, wanted: 1, cornerAxis: null });
    for (let i = 0; i < 20; i++) g.movePacman(DT);
    assert.ok(g.pacman.x > 26, `row ${row} wrapped to ${g.pacman.x}`);
  }
  assert.equal(g.tileIsTunnel(1.5, 10.5), true); assert.equal(g.tileIsTunnel(1.5, 14.5), false);
});

test("the tour plays every maze in turn and fruit timing scales with the dot count", () => {
  const g = new E.PacmanGame(0); g.startGame(1, "tour");
  const seen = [];
  for (let level = 1; level <= 5; level++) {
    seen.push(g.map.id);
    g.homeDistances = "stale";
    g.forceClearForTest(); g.advanceLevel();
    if (g.state === "INTERMISSION") { g.startRound(false); }
    assert.notEqual(g.homeDistances, "stale", "a new maze drops the cached return paths");
  }
  assert.deepEqual(seen, ["classic", "neural", "server", "astra", "classic"]);
  const n = new E.PacmanGame(0); n.startGame(1, "neural"); n.state = "PLAYING";
  assert.equal(n.dotsTotal, 304);
  n.dotsEaten = 86; n.updateFruit(); assert.equal(n.fruit, null);
  n.dotsEaten = 87; n.updateFruit(); assert.deepEqual([n.fruit.x, n.fruit.y], [...n.map.fruit]);
  const unknown = new E.PacmanGame(0); unknown.startGame(1, "nowhere"); assert.equal(unknown.map, E.CLASSIC);
});

test("shared mazes register as custom but can never replace the classic", () => {
  const rows = Maps.decodeRows(Maps.encodeRows(Maps.MAPS[1].rows));
  const report = E.registerMap({ id: "custom", name: "mine", rows });
  assert.equal(report.map.name, "MINE"); assert.equal(E.findMap("custom"), report.map);
  assert.equal(E.registerMap({ id: "custom", rows }).map, E.findMap("custom"), "re-sharing replaces it");
  assert.equal(E.MAPS.filter(m => m.id === "custom").length, 1);
  assert.match(E.registerMap({ id: "classic", rows }).errors[0], /classic/);
  assert.equal(E.registerMap({ id: "broken", rows: rows.slice(2) }).map, null);
  E.MAPS.splice(E.MAPS.indexOf(E.findMap("custom")), 1);
});

test("every maze's art opens its corridors and its pen", () => {
  for (const map of E.MAPS) {
    const masks = Art.mazeMasks(map);
    const pixelOpen = (tx, ty) => masks.primary[(ty * 8 + 4) * 224 + tx * 8 + 4] === 0;
    for (let y = 0; y < E.ROWS; y++) for (let x = 0; x < E.COLS; x++) {
      assert.equal(pixelOpen(x, y), E.tileKind(x, y, map) !== "wall" || (x >= map.house.x && x < map.house.x + 8 && y >= map.house.y && y < map.house.y + 5), `${map.id} ${x},${y}`);
    }
    assert.ok(Art.traceContours(masks.primary).length > 10, map.id);
  }
});
