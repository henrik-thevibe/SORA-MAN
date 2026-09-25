"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const Modes = require("../modes.js");
const DT = 1 / 60;

function playing(ruleset = "classic", players = 1, maze = "classic", seed) {
  const g = new E.PacmanGame(0); g.startGame(players, maze, ruleset, { seed }); g.state = "PLAYING"; g.drainEvents();
  return g;
}
function park(g) { g.ghosts.forEach(ghost => Object.assign(ghost, { x: 13.5, y: 14.5, state: "HOUSE", leavingHouse: false, homeTimer: 99 })); }
function loose(ghost, x, y, state = "CHASE") { Object.assign(ghost, { x, y, state, homeTimer: 0, leavingHouse: false, dir: 1 }); }
const names = g => g.drainEvents().map(e => e.name);
const step = (g, n) => { for (let i = 0; i < n; i++) g.tick(DT); };

test("registries hold the modes, content and classic brains, and reject nameless entries", () => {
  assert.deepEqual([...E.RULESETS.keys()], ["classic", "benchmark", "remix", "hallucination", "versus"]);
  assert.deepEqual([...E.POWERUPS.keys()], ["token-beam", "rate-limit", "context-overflow", "scale-up", "rag", "hot-path", "incognito"]);
  assert.deepEqual([...E.BRAINS.keys()], ["blinky", "pinky", "inky", "clyde", "charger", "sleeper", "diver"]);
  assert.deepEqual([...E.SKILLS.keys()], ["star-dash", "supernova", "pulse-shield", "vine-snare"]);
  assert.throws(() => E.registerStatus({}), /needs an id/);
  for (const p of E.POWERUPS.values()) assert.ok(p.name && p.short.length === 2 && /^#[0-9a-f]{6}$/.test(p.color) && p.seconds > 0 && p.about, p.id);
});

test("classic passes every hook through: no skills, plain speeds, arcade values", () => {
  const g = playing();
  assert.equal(g.rules.id, "classic"); assert.equal(g.pacman.skill, null);
  assert.equal(g.speedScale(g.pacman), 1); assert.equal(g.speedScale(g.ghosts[0]), 1);
  assert.equal(g.useSkill(0), false);
  assert.equal(g.reduceHooks("ghostValue", 200, 0), 200);
  assert.ok(g.ghosts.every(ghost => ghost.brain === ghost.id));
  const unknown = playing("nonsense"); assert.equal(unknown.rules.id, "classic");
});

test("the seeded generator repeats per seed", () => {
  const a = playing("remix", 1, "classic", 42), b = playing("remix", 1, "classic", 42), c = playing("remix", 1, "classic", 43);
  const draw = g => Array.from({ length: 5 }, () => g.random());
  const first = draw(a);
  assert.deepEqual(first, draw(b)); assert.notDeepEqual(first, draw(c));
  assert.ok(first.every(v => v >= 0 && v < 1));
});

// ---- Benchmark Run ------------------------------------------------------------------

test("benchmark: every left half fits every right half", () => {
  const ids = Object.keys(Modes.HALVES);
  assert.equal(ids.length, 4);
  for (let l = 0; l < ids.length; l++) for (let r = 0; r < ids.length; r++) {
    const map = Modes.benchmarkMap(l, r, 0);
    assert.equal(E.analyzeMap({ rows: map.rows }).errors.length, 0, `${ids[l]}+${ids[r]}`);
    assert.deepEqual(map.house, E.CLASSIC.house); assert.deepEqual(map.spawn, [13.5, 23.5]);
  }
  assert.equal(Modes.benchmarkMap(0, 0, 0), Modes.benchmarkMap(0, 0, 0), "compiled once and cached");
});

test("benchmark: the five-minute clock runs only in play and ends with a results record", () => {
  const g = playing("benchmark"); park(g);
  const state = g.ruleState("benchmark");
  assert.equal(state.timeLeft, 300);
  g.state = "READY"; g.readyTimer = 99; step(g, 60); assert.equal(state.timeLeft, 300, "READY does not count");
  g.state = "PLAYING"; g.togglePause(); step(g, 60); assert.equal(state.timeLeft, 300, "pause does not count");
  g.togglePause(); state.timeLeft = 0.05; g.addScore(1234, g.pacman, "dot"); step(g, 10);
  assert.equal(g.state, "GAME_OVER"); assert.equal(g.result.reason, "TIME UP");
  assert.equal(g.result.stats.dot, 1234); assert.equal(g.gameOverTimer > 15, true);
  assert.ok(names(g).includes("timeUp"));
});

test("benchmark: dots climb from 10 to 50 points and reset when caught", () => {
  const g = playing("benchmark"); park(g);
  const state = g.ruleState("benchmark");
  assert.equal(g.reduceHooks("pelletValue", 10, g.pacman, "dot"), 10);
  state.dotsSinceDeath = 60; assert.equal(g.reduceHooks("pelletValue", 10, g.pacman, "dot"), 20);
  state.dotsSinceDeath = 1000; assert.equal(g.reduceHooks("pelletValue", 50, g.pacman, "power"), 50);
  loose(g.ghosts[0], g.pacman.x, g.pacman.y); g.checkCollisions();
  assert.equal(state.dotsSinceDeath, 0);
});

test("benchmark: speed climbs every 5000 points, and a death drops two steps", () => {
  const g = playing("benchmark"); park(g);
  const state = g.ruleState("benchmark");
  g.addScore(15000, g.pacman); step(g, 1);
  assert.equal(state.tier, 3); assert.ok(Math.abs(g.speedScale(g.pacman) - 1.135) < 1e-9);
  assert.ok(Math.abs(g.speedScale(g.ghosts[0]) - 1.135) < 1e-9);
  assert.ok(g.frightDuration < 6);
  loose(g.ghosts[0], g.pacman.x, g.pacman.y); g.checkCollisions();
  assert.equal(state.tier, 1);
});

test("benchmark: ghost chains keep climbing through a second power pellet", () => {
  const g = playing("benchmark"); park(g);
  g.beginFrightened(); g.ghostChain = 3; g.beginFrightened();
  assert.equal(g.ghostChain, 3, "a renewed power pellet keeps the chain");
  loose(g.ghosts[1], g.pacman.x, g.pacman.y, "FRIGHTENED"); g.checkCollisions();
  assert.equal(g.ghosts[1].eatenValue, 1600); assert.equal(g.freezeTimer, 0.6);
  assert.equal(g.reduceHooks("ghostValue", 0, 20), 3200);
});

test("benchmark: no reversals, no arcade fruit, and an extra life every 20000", () => {
  const g = playing("benchmark"); park(g);
  loose(g.ghosts[0], 6.5, 5.5); g.ghosts[0].dir = 3; g.ghosts[0].state = "SCATTER";
  g.modeTimer = 0.001; g.updateMode(DT);
  assert.equal(g.ghosts[0].dir, 3);
  g.dotsEaten = 200; g.updateFruit(); assert.equal(g.fruit, null);
  const lives = g.lives; g.addScore(40500, g.pacman); g.checkExtraLife();
  assert.equal(g.lives, lives + 2);
});

test("benchmark: clearing a half puts a bonus on the other side; eating it swaps in a new half", () => {
  const g = playing("benchmark", 2); park(g);
  const state = g.ruleState("benchmark");
  // Leave a single dot in the left half and eat it.
  let last = null;
  for (let y = 0; y < E.ROWS; y++) for (let x = 0; x < 14; x++) if (g.pellets[y * E.COLS + x]) {
    if (!last) { last = [x, y]; continue; }
    g.pellets[y * E.COLS + x] = 0; g.dotsRemaining -= 1;
  }
  g.eatPellet(last[0], last[1], g.pacman);
  const bonus = g.items.find(item => item.kind === "bench-bonus");
  assert.ok(bonus, "a bonus appears"); assert.equal(bonus.half, 0); assert.ok(bonus.x >= 14, "on the right half");
  assert.equal(bonus.value, 1000); assert.ok(bonus.persist);
  // Scatter everyone around the left half so the swap has to rescue some of them.
  const spots = [[1.5, 1.5], [6.5, 11.5], [3.5, 26.5], [9.5, 8.5], [5.5, 20.5], [12.5, 29.5]];
  [...g.players, ...g.ghosts.slice(0, 4)].forEach((actor, i) => { const [x, y] = spots[i]; Object.assign(actor, { x, y, state: actor.type === "ghost" ? "CHASE" : actor.state }); });
  const before = g.map;
  g.drainEvents();
  g.collectItem(bonus, g.players[1]);
  assert.notEqual(g.map, before); assert.notEqual(state.halves[0], 0);
  assert.ok(names(g).includes("halfRefresh"));
  assert.equal(g.stats.bonus, 1000); assert.equal(g.playerScores[1], 1000);
  let leftDots = 0;
  for (let y = 0; y < E.ROWS; y++) for (let x = 0; x < 14; x++) if (g.pellets[y * E.COLS + x]) leftDots += 1;
  assert.ok(leftDots > 100, "the new half is full of dots");
  assert.equal(g.dotsRemaining, g.pellets.filter(Boolean).length);
  for (const actor of [...g.players, ...g.ghosts]) assert.notEqual(E.tileKind(Math.floor(actor.x), Math.floor(actor.y), g.map), "wall");
});

test("benchmark: a bonus survives a lost life, and clearing both halves refreshes both", () => {
  const g = playing("benchmark"); park(g);
  g.spawnItem({ kind: "bench-bonus", x: 20.5, y: 5.5, half: 0, value: 1000, persist: true });
  g.spawnItem({ kind: "powerup", id: "rag", x: 5.5, y: 5.5 });
  g.startRound(true);
  assert.deepEqual(g.items.map(i => i.kind), ["bench-bonus"]);
  g.pellets.fill(0); g.pellets[1 * E.COLS + 1] = 1; g.dotsRemaining = 1;
  g.ruleState("benchmark").pending = [true, false];
  g.eatPellet(1, 1, g.pacman);
  assert.ok(g.dotsRemaining > 200); assert.equal(g.state, "PLAYING");
  assert.equal(g.items.filter(i => i.kind === "bench-bonus").length, 0);
});

// ---- Remix: power-ups -----------------------------------------------------------------

function remix(players = 1) { const g = playing("remix", players); park(g); return g; }
function give(g, id, pac = g.pacman) {
  g.spawnItem({ kind: "powerup", id, x: pac.x, y: pac.y }); g.updateItems(0);
  assert.ok(g.hasStatus(pac, id), id + " applied");
}

test("remix: a power-up appears every 40 dots, away from the players, and expires", () => {
  const g = remix();
  for (let i = 0; i < 39; i++) g.callHooks("onPellet", g.pacman, "dot", 1, 1);
  assert.equal(g.items.length, 0);
  g.callHooks("onPellet", g.pacman, "dot", 1, 1);
  const item = g.items[0];
  assert.equal(item.kind, "powerup"); assert.ok(E.POWERUPS.has(item.id));
  assert.ok((item.x - g.pacman.x) ** 2 + (item.y - g.pacman.y) ** 2 >= 49);
  for (let i = 0; i < 40; i++) g.callHooks("onPellet", g.pacman, "dot", 1, 1);
  assert.equal(g.items.length, 1, "only one pickup at a time");
  g.updateItems(10.1); assert.equal(g.items.length, 0);
});

test("token beam sends home a ghost standing in its line", () => {
  const g = remix();
  Object.assign(g.pacman, { x: 6.5, y: 5.5, dir: 3, wanted: 3 });
  give(g, "token-beam");
  loose(g.ghosts[0], 12.5, 5.5);
  g.updateStatuses(DT);
  assert.equal(g.ghosts[0].state, "EATEN"); assert.equal(g.stats.ghost, 200);
  assert.ok(g.getStatus(g.pacman, "token-beam").data.cells.length > 5);
  loose(g.ghosts[1], 6.5, 8.5); g.updateStatuses(DT); assert.equal(g.ghosts[1].state, "CHASE", "not beside the beam");
});

test("rate limit slows every ghost for its duration", () => {
  const g = remix(); loose(g.ghosts[0], 6.5, 5.5);
  give(g, "rate-limit");
  assert.equal(g.speedScale(g.ghosts[0]), 0.45);
  g.updateStatuses(6.1); assert.equal(g.speedScale(g.ghosts[0]), 1);
});

test("context overflow saves you from one touch and blasts nearby ghosts", () => {
  const g = remix();
  give(g, "context-overflow");
  loose(g.ghosts[0], g.pacman.x, g.pacman.y); loose(g.ghosts[1], g.pacman.x + 3, g.pacman.y); loose(g.ghosts[2], 1.5, 1.5);
  g.drainEvents(); g.checkCollisions();
  assert.ok(g.pacman.alive); assert.equal(g.state, "PLAYING");
  assert.deepEqual(g.ghosts.slice(0, 3).map(x => x.state), ["EATEN", "EATEN", "CHASE"]);
  assert.ok(names(g).includes("explosion")); assert.equal(g.hasStatus(g.pacman, "context-overflow"), false);
  const h = remix(); give(h, "context-overflow"); h.drainEvents(); h.updateStatuses(6.1);
  assert.ok(names(h).includes("explosion"), "the timer running out also detonates");
});

test("scale up flattens a chasing ghost instead of dying", () => {
  const g = remix(); give(g, "scale-up");
  loose(g.ghosts[0], g.pacman.x, g.pacman.y); g.checkCollisions();
  assert.ok(g.pacman.alive); assert.equal(g.ghosts[0].state, "EATEN"); assert.equal(g.freezeTimer, 0);
});

test("RAG vacuums nearby dots without the eating stall", () => {
  const g = remix(); Object.assign(g.pacman, { x: 6.5, y: 5.5 });
  const before = g.dotsRemaining;
  give(g, "rag"); g.updateStatuses(DT);
  assert.ok(before - g.dotsRemaining >= 8); assert.equal(g.pacman.stunTicks, 0);
});

test("hot path leaves flames that send ghosts home", () => {
  const g = remix(); Object.assign(g.pacman, { x: 6.5, y: 5.5 });
  give(g, "hot-path"); g.updateStatuses(DT);
  const flames = g.ruleState("hazards").list;
  assert.deepEqual(flames.map(f => [f.x, f.y]), [[6, 5]]);
  loose(g.ghosts[0], 6.5, 5.5); g.callHooks("onTick", DT);
  assert.equal(g.ghosts[0].state, "EATEN");
  g.callHooks("onTick", 3); assert.equal(g.ruleState("hazards").list.length, 0, "flames burn out");
});

test("incognito hides you from ghosts and lets them pass through", () => {
  const g = remix(2); give(g, "incognito");
  loose(g.ghosts[0], g.pacman.x + 1, g.pacman.y);
  assert.equal(g.preyFor(g.ghosts[0]), g.players[1]);
  g.players[1].alive = false; assert.equal(g.preyFor(g.ghosts[0]), null);
  g.ghosts[0].x = g.pacman.x; g.checkCollisions(); assert.ok(g.pacman.alive);
});

// ---- Remix: brains ----------------------------------------------------------------------

test("the charger rushes down a clear line of sight but not through walls", () => {
  const g = remix(); const muse = g.ghosts[1];
  assert.equal(muse.brain, "charger");
  Object.assign(g.pacman, { x: 12.5, y: 5.5 }); loose(muse, 3.5, 5.5);
  assert.deepEqual(g.targetForGhost(muse), [12.5, 5.5]); assert.equal(g.speedScale(muse), 1.55);
  // The wall block at columns 13-14 of row 1 stands between them.
  Object.assign(g.pacman, { x: 12.5, y: 1.5 }); loose(muse, 15.5, 1.5);
  g.targetForGhost(muse); assert.equal(g.speedScale(muse), 1, "a wall blocks the view");
  assert.equal(Modes.lineOfSight(g, { x: 6.5, y: 8.5 }, { x: 6.5, y: 1.5 }, 12), true, "column 6 is open");
  assert.equal(Modes.lineOfSight(g, { x: 1.5, y: 1.5 }, { x: 1.5, y: 29.5 }, 12), false, "too far");
});

test("the sleeper drifts slowly until a player comes close, then wakes to hunt", () => {
  const g = remix(); const grok = g.ghosts[2];
  assert.equal(grok.brain, "sleeper");
  loose(grok, 1.5, 1.5); Object.assign(g.pacman, { x: 12.5, y: 20.5 });
  E.BRAINS.get("sleeper").tick(g, grok, DT);
  assert.ok(!grok.brainState.awake); assert.equal(g.speedScale(grok), 0.55);
  Object.assign(g.pacman, { x: 4.5, y: 1.5 }); g.drainEvents();
  E.BRAINS.get("sleeper").tick(g, grok, DT);
  assert.equal(grok.brainState.awake, true); assert.ok(names(g).includes("ghostWakes"));
  assert.equal(g.speedScale(grok), 1.08);
  E.BRAINS.get("sleeper").tick(g, grok, 6.1); assert.equal(grok.brainState.awake, false);
});

// ---- Remix: skills ------------------------------------------------------------------------

test("Star Dash speeds Astra up and then needs to recharge", () => {
  const g = remix();
  assert.equal(g.pacman.skill, "star-dash");
  assert.equal(g.useSkill(0), true); assert.equal(g.speedScale(g.pacman), 1.75);
  assert.equal(g.useSkill(0), false, "cooling down");
  step(g, 60); assert.equal(g.speedScale(g.pacman), 1);
  step(g, 4 * 60 + 5); assert.equal(g.useSkill(0), true);
});

test("Supernova stuns nearby ghosts, which stop and cannot hurt", () => {
  const g = remix(2); const nova = g.players[1];
  assert.equal(nova.skill, "supernova");
  loose(g.ghosts[0], nova.x + 2, nova.y); loose(g.ghosts[3], nova.x + 9, nova.y);
  g.useSkill(1);
  assert.equal(g.speedScale(g.ghosts[0]), 0); assert.equal(g.hasStatus(g.ghosts[3], "stunned"), false);
  g.ghosts[0].x = nova.x; g.checkCollisions(); assert.ok(nova.alive);
});

test("Constellation: skills fired together link the players with a ghost-busting beam", () => {
  const g = remix(2); const [astra, nova] = g.players;
  g.drainEvents(); g.useSkill(0); step(g, 20); g.useSkill(1);
  assert.ok(names(g).includes("constellation"));
  assert.ok(g.hasStatus(astra, "linked") && g.hasStatus(nova, "linked"));
  loose(g.ghosts[0], 13.5, 23.5); g.updateStatuses(DT);
  assert.equal(g.ghosts[0].state, "EATEN");
  const late = remix(2); late.useSkill(0); step(late, 60); late.useSkill(1);
  assert.equal(late.hasStatus(late.players[0], "linked"), false, "too far apart in time");
});

test("long remix and benchmark games replay identically from the same seed", () => {
  for (const ruleset of ["remix", "benchmark"]) {
    const run = () => {
      const g = new E.PacmanGame(0); g.startGame(2, "neural", ruleset, { seed: 7 });
      for (let i = 0; i < 5400; i++) {
        if (g.state === "GAME_OVER") g.startGame(2, "neural", ruleset, { seed: 7 });
        if (i % 31 === 0) g.setDirection((i / 31) % 4, 0);
        if (i % 43 === 0) g.setDirection((i / 43 + 1) % 4, 1);
        if (i % 90 === 0) { g.useSkill(0); g.useSkill(1); }
        g.tick(DT); g.drainEvents();
        for (const actor of [...g.players.filter(p => p.alive), ...g.ghosts]) {
          assert.notEqual(E.tileKind(Math.floor(actor.x), Math.floor(actor.y), g.map), "wall", `${ruleset} tick ${i}`);
        }
      }
      return JSON.stringify({ score: g.score, players: g.players, ghosts: g.ghosts, items: g.items, data: g.ruleData });
    };
    assert.equal(run(), run(), ruleset);
  }
});

test("rate limit also slows ghosts that leave the house later, and a second pickup extends it", () => {
  const g = remix(); loose(g.ghosts[0], 6.5, 5.5);
  give(g, "rate-limit");
  g.updateStatuses(3);
  loose(g.ghosts[1], 20.5, 5.5);
  g.updateStatuses(0.1);
  assert.equal(g.speedScale(g.ghosts[1]), 0.45, "released after the pickup, still slowed");
  give(g, "rate-limit");
  for (let i = 0; i < 240; i++) g.updateStatuses(DT);
  assert.equal(g.speedScale(g.ghosts[0]), 0.45, "the refreshed pickup keeps the first ghost slow");
});
