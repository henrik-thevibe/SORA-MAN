"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const Modes = require("../modes.js");
const DT = 1 / 60;
const { COLS, ROWS } = E;

function dream(players = 1, seed = 11) {
  const g = new E.PacmanGame(0); g.startGame(players, "classic", "hallucination", { seed }); g.state = "PLAYING"; g.drainEvents();
  return g;
}
const state = g => g.ruleState("hallucination");
const open = (rows, x, y) => y >= 0 && y < rows.length && x >= 0 && x < COLS && rows[y][x] !== "#";

test("the window is a generated maze: mirrored walls, the start marked near the bottom", () => {
  const g = dream(); const rows = state(g).rows;
  assert.equal(rows.length, ROWS);
  for (const row of rows) { const walls = row.replace(/[^#]/g, "."); assert.equal(walls, [...walls].reverse().join("")); }
  assert.ok(rows.at(-2).includes("  "), "the start corridor is marked");
  assert.equal(rows.at(-1), "#".repeat(COLS));
});

test("the dream starts houseless with the players low on the screen and no ghosts near them", () => {
  const g = dream(2);
  assert.equal(g.map.house, null); assert.ok(g.map.houseless);
  for (const pac of g.players) { assert.ok(pac.y > 20); assert.notEqual(E.tileKind(Math.floor(pac.x), Math.floor(pac.y), g.map), "wall"); }
  assert.ok(g.ghosts.every(ghost => ghost.y < 16.5));
  assert.equal(g.mode, "CHASE"); assert.equal(g.modeTimer, Infinity);
});

test("every run starts with at least two ghosts hunting, Blinky among them, well away from the players", () => {
  for (let seed = 1; seed <= 30; seed++) for (const players of [1, 2]) {
    const g = dream(players, seed);
    assert.ok(g.ghosts.length >= Modes.START_GHOSTS, `seed ${seed}: ${g.ghosts.length} ghosts`);
    assert.ok(g.ghosts.some(ghost => ghost.id === "blinky"));
    for (const ghost of g.ghosts) {
      assert.notEqual(E.tileKind(Math.floor(ghost.x), Math.floor(ghost.y), g.map), "wall");
      for (const pac of g.players) assert.ok(Math.hypot(ghost.x - pac.x, ghost.y - pac.y) >= 5, `seed ${seed}: ghost too close`);
    }
  }
});

test("after a death the round restarts with ghosts on the board", () => {
  const g = dream();
  g.killPlayer(g.pacman);
  for (let i = 0; i < 400 && g.state !== "READY"; i++) g.tick(DT);
  assert.equal(g.state, "READY");
  assert.ok(g.ghosts.length >= Modes.START_GHOSTS);
});

test("ghosts that are eaten are replaced from the top after a few seconds", () => {
  const g = dream(); const s = state(g);
  for (const ghost of g.ghosts.slice()) g.removeGhost(ghost);
  Object.assign(g.pacman, { x: 13.5, y: 29.5 }); s.glitchLine = 100;
  let ticks = 0;
  for (; ticks < (Modes.REFILL_SECONDS + 0.5) / DT && !g.ghosts.length; ticks++) { s.glitchLine = 100; g.tick(DT); }
  assert.equal(g.ghosts.length, 1, "a ghost dropped in");
  assert.ok(ticks * DT >= Modes.REFILL_SECONDS - 0.1, "not straight away");
  assert.ok(g.ghosts[0].y < 9.5, "at the top of the screen");
});

test("climbing near the top scrolls the maze: rows, dots and actors move down together", () => {
  const g = dream(); const s = state(g);
  const probe = []; for (let x = 0; x < COLS; x++) if (g.pellets[5 * COLS + x]) probe.push(x);
  const rowAbove = s.rows[5];
  Object.assign(g.pacman, { x: 1.5, y: 10.5 });
  g.tick(DT);
  const events = g.drainEvents().map(e => e.name);
  assert.ok(events.includes("scroll"));
  assert.equal(s.distance, Modes.SHIFT); assert.ok(Math.abs(g.pacman.y - (10.5 + Modes.SHIFT)) < 0.3);
  assert.equal(s.rows[5 + Modes.SHIFT], rowAbove);
  for (const x of probe) assert.ok(g.pellets[(5 + Modes.SHIFT) * COLS + x], "dots moved with their row");
  assert.equal(g.dotsRemaining, g.pellets.filter(Boolean).length);
  assert.ok(!s.rows.some(row => /[GU]/.test(row)), "markers are consumed as rows arrive");
});

test("the glitch climbs, takes ghosts and pickups, and catches players who fall behind", () => {
  const g = dream(); const s = state(g);
  const before = s.glitchLine; g.tick(DT); assert.ok(s.glitchLine < before);
  const ghost = g.spawnGhost("blinky", 5.5, 23.5), item = g.spawnItem({ kind: "powerup", id: "rag", x: 7.5, y: 23.5 });
  s.glitchLine = 23;
  g.tick(DT);
  assert.equal(g.state, "DYING"); assert.ok(!g.ghosts.includes(ghost)); assert.ok(!g.items.includes(item));
  for (let i = 0; i < 120; i++) g.tick(DT);
  assert.equal(g.state, "READY"); assert.ok(s.glitchLine > ROWS, "a new life pushes the glitch back");
});

test("dot chains pay out at 16, 32, 64 and 128, reset when you stop eating, and 256 clears the screen", () => {
  const g = dream(); const s = state(g);
  const eat = n => { for (let i = 0; i < n; i++) g.callHooks("onPellet", g.pacman, "dot", 1, 1); };
  const before = g.score; eat(16);
  assert.equal(g.score - before, 160); assert.equal(s.bestChain, 16);
  g.pacman.moving = true; g.playTime += 1; g.callHooks("onTick", DT);
  assert.equal(s.chain[0], 0);
  g.spawnGhost("blinky", 5.5, 5.5); g.spawnGhost("pinky", 9.5, 5.5, { brain: "charger" });
  s.chain[0] = 255; eat(1);
  assert.equal(g.ghosts.length, 0, "256 zaps every ghost");
  assert.equal(s.bestChain, 256);
});

test("with no house, eaten and zapped ghosts vanish instead of going home", () => {
  const g = dream();
  const a = g.spawnGhost("blinky", g.pacman.x, g.pacman.y, { state: "FRIGHTENED" });
  g.checkCollisions(); assert.equal(a.state, "EATEN");
  g.tick(1.1); assert.ok(!g.ghosts.includes(a));
  const b = g.spawnGhost("inky", 3.5, 3.5, { brain: "sleeper" });
  g.zapGhost(b, g.pacman); assert.ok(!g.ghosts.includes(b));
});

test("co-op: a fallen player leaves a revive token instead of respawning on a timer", () => {
  const g = dream(2); const [astra, nova] = g.players;
  g.killPlayer(nova);
  const token = g.items.find(item => item.kind === "revive");
  assert.ok(token); assert.equal(token.player, 1);
  for (let i = 0; i < 300; i++) { astra.x = 13.5; astra.y = 23.5; g.tick(DT); }
  assert.equal(nova.alive, false, "no automatic respawn");
  g.collectItem(g.items.find(item => item.kind === "revive"), astra);
  assert.ok(nova.alive); assert.deepEqual([nova.x, nova.y], [token.x, token.y]); assert.ok(nova.invulnTimer > 0);
});

test("the diver brain always drops when it can", () => {
  const g = dream();
  const diver = g.spawnGhost("clyde", 5.5, 5.5, { brain: "diver" });
  assert.equal(E.BRAINS.get("diver").choose(g, diver, [1, 2, 3]), 2);
  assert.equal(E.BRAINS.get("diver").choose(g, diver, [1, 3]), g.pacman.x < 5.5 ? 1 : 3);
});

test("long dreams replay exactly from a seed and never put anyone in a wall", () => {
  for (const players of [1, 4]) {
    const run = () => {
      const g = new E.PacmanGame(0); g.startGame(players, "classic", "hallucination", { seed: 21 });
      let scrolls = 0;
      for (let i = 0; i < 6000 && g.state !== "GAME_OVER"; i++) {
        // Mostly up, with side steps, so the players climb past the ghosts.
        for (let p = 0; p < players; p++) if ((i + p * 7) % 11 === 0) g.setDirection([0, 0, 0, 1, 0, 3][(i / 11 + p) % 6 | 0], p);
        g.tick(DT);
        for (const e of g.drainEvents()) if (e.name === "scroll") scrolls++;
        for (const actor of [...g.players.filter(p => p.alive), ...g.ghosts]) assert.notEqual(E.tileKind(Math.floor(actor.x), Math.floor(actor.y), g.map), "wall", `tick ${i}`);
      }
      return { scrolls, snapshot: JSON.stringify([g.score, g.players, g.ghosts, g.items, g.ruleData]) };
    };
    const a = run(), b = run();
    assert.equal(a.snapshot, b.snapshot); assert.ok(a.scrolls > 0, "the camera moved");
  }
});

test("results report distance and the best chain", () => {
  const g = dream(); state(g).distance = 120; state(g).bestChain = 40;
  g.endGame("GAME OVER");
  assert.deepEqual(g.result.lines, [["120 ROWS", "CHAIN 40"]]);
});

test("zones follow the bundled mazes, in their colours, and blend smoothly into each other", () => {
  assert.deepEqual(Modes.ZONES.map(zone => zone.biome.id), ["classic", "neural", "server", "astra"]);
  for (const zone of Modes.ZONES.slice(1)) assert.equal(zone.wall, E.findMap(zone.biome.id).wall);
  const Z = Modes.ZONE_ROWS;
  assert.equal(Modes.wallAt(0), Modes.ZONES[0].wall);
  assert.equal(Modes.wallAt(Z), Modes.ZONES[1].wall);
  assert.equal(Modes.wallAt(4 * Z + 5), Modes.ZONES[0].wall, "the zones cycle");
  const rgb = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  for (let row = 0; row < 5 * Z; row++) {
    const [a, b] = [rgb(Modes.wallAt(row)), rgb(Modes.wallAt(row + 1))];
    assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= 24), `a gentle colour step at row ${row}`);
  }
  // SERVER ROOM is dark: the lights fade out on the way in and back on the way out.
  assert.equal(Modes.darknessAt(Z + 10), 0); assert.equal(Modes.darknessAt(2 * Z + 10), 1); assert.equal(Modes.darknessAt(3 * Z + 50), 0);
  const fade = Modes.darknessAt(2 * Z - Modes.BLEND_ROWS / 2);
  assert.ok(fade > 0.2 && fade < 0.8);
});

test("the window's walls carry a colour per row that scrolls with the maze, and new zones are announced", () => {
  const g = dream(); const s = state(g);
  assert.equal(g.map.wallRows.length, ROWS);
  const zones = [];
  for (let i = 0; i < 40; i++) {
    const before = g.map.wallRows;
    let x = 1; while (E.tileKind(x, 10, g.map) === "wall" && x < 26) x++;
    Object.assign(g.pacman, { x: x + 0.5, y: 10.5, cornerAxis: null, invulnTimer: 99 });
    s.glitchLine = 60; g.ghosts.length = 0;
    g.tick(DT);
    for (const e of g.drainEvents()) if (e.name === "zone") zones.push(e.data.id);
    if (s.distance % Modes.SHIFT === 0 && g.map.wallRows !== before) {
      for (let y = 0; y + Modes.SHIFT < ROWS; y++) assert.equal(g.map.wallRows[y + Modes.SHIFT], before[y]);
    }
  }
  assert.ok(s.distance >= 100, "climbed " + s.distance);
  assert.deepEqual(zones.slice(0, 1), ["neural"]);
});

test("co-op: a player left below the screen by the scroll is deleted, not stranded off-screen", () => {
  const g = dream(2); const [lead, lag] = g.players;
  Object.assign(lag, { y: ROWS - 1.5, x: Math.floor(lag.x) + 0.5 });
  Object.assign(lead, { y: 5.5 });
  g.drainEvents();
  g.callHooks("onTick", DT);
  assert.equal(lag.alive, false, "pushed off the bottom, the laggard is gone");
  assert.ok(g.players.every(p => !p.alive || p.y < ROWS), "nobody lives below the window");
});

test("co-op: a revive token appears only while a spare life remains", () => {
  const g = dream(2); const [a, b] = g.players;
  g.lives = 2; // one life each on the board, none spare
  g.killPlayer(a);
  assert.equal(g.items.filter(item => item.kind === "revive").length, 0, "no token without a spare life");
  const h = dream(2); h.lives = 3; h.killPlayer(h.players[0]);
  assert.equal(h.items.filter(item => item.kind === "revive").length, 1, "a spare life leaves a token");
});

test("a glitch closing in on a player sounds a warning", () => {
  const g = dream(); const pac = g.players[0];
  state(g).glitchLine = pac.y + 2;
  g.drainEvents(); g.callHooks("onTick", DT);
  assert.ok(g.drainEvents().some(e => e.name === "danger"));
});
