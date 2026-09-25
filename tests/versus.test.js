"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
require("../modes.js");
const M = require("../meta.js");
const DT = 1 / 60;

function arena(humans = 1, seed = 5, maze = "classic") {
  const g = new E.PacmanGame(0); g.startGame(4, maze, "versus", { seed, humans }); g.state = "PLAYING"; g.drainEvents();
  return g;
}
const vs = g => g.ruleState("versus");
const has = (actor, id) => actor.status.some(s => s.id === id);
const calm = g => g.ghosts.forEach(ghost => Object.assign(ghost, { state: "HOUSE", homeTimer: 99, leavingHouse: false, x: 13.5, y: 14.5 }));
const place = (pac, x, y) => Object.assign(pac, { x, y, cornerAxis: null });

test("a full field of four: humans first, bots after, three arena ghosts and no power pellets", () => {
  const g = arena(2);
  assert.deepEqual(g.players.map(p => p.bot), [false, false, true, true]);
  assert.ok(g.players.every(p => p.alive));
  assert.deepEqual(g.ghosts.map(ghost => ghost.id), ["blinky", "pinky", "clyde"]);
  assert.ok(!g.pellets.includes(2));
  assert.equal(g.rules.results, true);
});

test("dots build speed, and only a fast enough player can catch the runaway pellet", () => {
  const g = arena(); calm(g); const astra = g.players[0];
  for (let i = 0; i < 10; i++) g.callHooks("onPellet", astra, "dot", 1, 1);
  assert.ok(Math.abs(g.speedScale(astra) - 1.08) < 1e-9);
  const runner = g.spawnItem({ kind: "runner", type: "runner", x: astra.x, y: astra.y, dir: 1 });
  g.updateItems(0); assert.ok(g.items.includes(runner), "too slow to catch it");
  vs(g).boost[0] = 0.2; g.updateItems(0);
  assert.ok(!g.items.includes(runner)); assert.ok(has(astra, "energized"));
});

test("the runner flees along corridors and stays out of walls", () => {
  const g = arena(); calm(g);
  const runner = g.spawnItem({ kind: "runner", type: "runner", x: 6.5, y: 5.5, dir: 1 });
  g.players.forEach((p, i) => place(p, 1.5 + i, 1.5));
  for (let i = 0; i < 300; i++) { g.callHooks("onTick", DT); assert.notEqual(E.tileKind(Math.floor(runner.x), Math.floor(runner.y), g.map), "wall"); }
  assert.ok((runner.x - 6.5) ** 2 + (runner.y - 5.5) ** 2 > 4, "it moved");
});

test("energised players eat rivals, who become spirits that can tag their way back", () => {
  const g = arena(2); calm(g); const [astra, nova] = g.players;
  g.addStatus(astra, "energized", 6);
  place(astra, 6.5, 5.5); place(nova, 6.5, 5.5); g.callHooks("onAfterMove", DT);
  assert.ok(has(nova, "spirit")); assert.equal(g.playerScores[0], 500);
  assert.equal(g.preyFor(g.ghosts[0]) === nova, false, "arena ghosts ignore spirits");
  assert.equal(g.reduceHooks("canEat", true, nova), false, "spirits cannot eat");
  g.removeStatus(astra, "energized"); nova.status = nova.status.filter(s => s.id !== "fresh"); astra.status = astra.status.filter(s => s.id !== "fresh");
  g.callHooks("onAfterMove", DT);
  assert.ok(!has(nova, "spirit") && has(astra, "spirit"), "the tag swaps them");
});

test("arena ghosts: Claude catches, Muse bugs you, Gemini plants an injection that must be passed on", () => {
  const g = arena(2); const [astra, nova] = g.players;
  const [claude, muse, gemini] = g.ghosts;
  for (const ghost of g.ghosts) Object.assign(ghost, { state: "CHASE", homeTimer: 0 });
  assert.equal(g.collisionOutcome("kill", astra, claude), "ignore"); assert.ok(has(astra, "spirit"));
  assert.equal(g.collisionOutcome("kill", nova, muse), "ignore");
  assert.ok(["inverted", "sluggish", "bait", "muzzled"].some(id => has(nova, id))); assert.equal(muse.state, "EATEN");
  const h = arena(2); const [a, b] = h.players, gem = h.ghosts[2]; Object.assign(gem, { state: "CHASE", homeTimer: 0 });
  h.collisionOutcome("kill", a, gem); assert.ok(has(a, "injected"));
  place(a, 6.5, 5.5); place(b, 6.5, 5.5); h.callHooks("onAfterMove", DT);
  assert.ok(!has(a, "injected") && has(b, "injected"), "passed on by touch");
  h.updateStatuses(10);
  assert.ok(has(b, "spirit"), "it goes off in the carrier's hands");
  assert.ok(!has(a, "spirit"));
});

test("the inverted bug flips steering; muzzled players cannot eat", () => {
  const g = arena(); const astra = g.players[0];
  g.addStatus(astra, "inverted", 5); g.setDirection(0, 0); assert.equal(astra.wanted, 2);
  g.addStatus(astra, "muzzled", 5); assert.equal(g.reduceHooks("canEat", true, astra), false);
});

test("eating every dot refills the arena", () => {
  const g = arena(); calm(g);
  g.pellets.fill(0); g.pellets[1 * E.COLS + 1] = 1; g.dotsRemaining = 1;
  g.eatPellet(1, 1, g.players[0]);
  assert.ok(g.dotsRemaining > 200); assert.ok(!g.pellets.includes(2));
});

test("the closing glitch eliminates players at the edges and the last star standing wins", () => {
  const g = arena(1); calm(g);
  vs(g).elapsed = 76;
  place(g.players[0], 13.5, 14.5); place(g.players[1], 13.5, 23.5);
  place(g.players[2], 0.5, 14.5); place(g.players[3], 27.5, 14.5);
  g.callHooks("onTick", DT);
  assert.deepEqual(g.players.map(p => Boolean(p.out)), [false, false, true, true]);
  vs(g).elapsed = 110; place(g.players[1], 3.5, 1.5); g.callHooks("onTick", DT);
  assert.equal(g.state, "GAME_OVER"); assert.equal(g.result.reason, "LAST STAR STANDING");
  assert.deepEqual(g.result.placements.slice(2).map(p => p.out), [true, true], "the eliminated place last");
  assert.equal(g.result.placements[0].name, "SORA"); assert.equal(g.result.placements[0].rank, 1);
  const profile = M.defaultProfile(), tracker = M.createTracker(profile);
  tracker.onEvent({ name: "gameOver" }, g);
  assert.ok(profile.achievements["arena-champion"]);
});

test("time runs out after two minutes; players still standing outrank spirits", () => {
  const g = arena(1); calm(g);
  g.addStatus(g.players[0], "spirit", Infinity);
  // Everyone huddles in the sanctuary the glitch leaves at the centre.
  [[12.5, 17.5], [15.5, 17.5], [12.5, 11.5], [15.5, 11.5]].forEach(([x, y], i) => place(g.players[i], x, y));
  vs(g).elapsed = 119.99; g.callHooks("onTick", DT);
  assert.equal(g.result.reason, "TIME UP");
  assert.equal(g.result.placements.at(-1).name, "SORA");
});

test("bot matches replay exactly, bots never enter walls, and they mostly outlast the glitch", () => {
  for (const maze of ["classic", "neural"]) {
    const run = () => {
      const g = new E.PacmanGame(0); g.startGame(4, maze, "versus", { seed: 9, humans: 0 });
      for (let i = 0; i < 60 * 125 && g.state !== "GAME_OVER"; i++) {
        g.tick(DT); g.drainEvents();
        for (const actor of [...g.players.filter(p => p.alive), ...g.ghosts]) assert.notEqual(E.tileKind(Math.floor(actor.x), Math.floor(actor.y), g.map), "wall");
      }
      return { state: g.state, snapshot: JSON.stringify([g.playerScores, g.result && g.result.placements]), elapsed: vs(g).elapsed };
    };
    const a = run(), b = run();
    assert.equal(a.snapshot, b.snapshot); assert.equal(a.state, "GAME_OVER");
    assert.ok(a.elapsed > 85, `bots lasted ${a.elapsed.toFixed(0)}s into the closing arena on ${maze}`);
  }
});

test("bots always have something to do: spirits and energised bots keep moving", () => {
  let samples = 0, still = 0;
  for (const seed of [3, 11]) {
    const g = new E.PacmanGame(0); g.startGame(4, "classic", "versus", { seed, humans: 0 });
    const last = g.players.map(p => [p.x, p.y]);
    for (let i = 1; i <= 60 * 100 && g.state !== "GAME_OVER"; i++) {
      g.tick(DT); g.drainEvents();
      if (i % 15 || g.state !== "PLAYING") continue;
      g.players.forEach((p, k) => {
        const moved = Math.hypot(p.x - last[k][0], p.y - last[k][1]) > 0.05;
        last[k] = [p.x, p.y];
        if (!p.bot || !p.alive || p.out) return;
        samples++; if (!moved) still++;
      });
    }
  }
  assert.ok(still / samples < 0.03, `bots stood still in ${(100 * still / samples).toFixed(1)}% of samples`);
});

// ---- Release fixes: endgame, spirits, bot behaviour and difficulty ----------------------
const Modes = require("../modes.js");
function botMatch(maze, seed, botLevel) {
  const g = new E.PacmanGame(0); g.startGame(4, maze, "versus", { seed, humans: 1, botLevel });
  g.players[0].bot = true; // the human seat plays itself too
  const stats = { reversals: 0, botSeconds: 0, allSpirit: 0, longestAllSpirit: 0, multiOut: 0 };
  const last = [null, null, null, null]; let run = 0;
  while (g.state !== "GAME_OVER") {
    g.tick(DT);
    const outs = g.drainEvents().filter(e => e.name === "eliminated").length;
    const standing = g.players.filter(p => p.alive && !p.out);
    if (outs > 1 && standing.length === 0) stats.multiOut++;
    if (g.state !== "PLAYING") continue;
    g.players.forEach((p, i) => { if (!p.alive || p.dir < 0) return; stats.botSeconds += DT; if (last[i] !== null && p.dir === E.opposite(last[i])) stats.reversals++; last[i] = p.dir; });
    if (standing.length && standing.every(p => has(p, "spirit"))) { run++; stats.allSpirit++; } else run = 0;
    stats.longestAllSpirit = Math.max(stats.longestAllSpirit, run * DT);
  }
  return { g, stats };
}

test("the arena stops closing at a connected loop of corridor on every maze", () => {
  for (const id of ["classic", "neural", "server", "astra"]) {
    const map = E.findMap(id), m = Modes.sanctuaryMargin(map, 11);
    assert.ok(m >= 6 && m <= 11, `${id}: sanctuary margin ${m}`);
  }
});

test("the closing glitch never swallows every player still standing in one step", () => {
  const g = arena(1); calm(g);
  vs(g).elapsed = 110; vs(g).margin = 0;
  g.players.forEach((p, i) => place(p, 0.5 + i, 1.5));
  g.callHooks("onTick", DT);
  assert.ok(g.players.some(p => !p.out), "it holds until someone is clear");
});

test("Claude can't turn the last live star into a spirit, and spirits re-form if no star is left", () => {
  const g = arena(1); calm(g);
  const [a, b, c, d] = g.players;
  for (const p of [b, c, d]) g.addStatus(p, "spirit", Infinity);
  const claude = g.ghosts[0]; Object.assign(claude, { state: "CHASE", homeTimer: 0 });
  assert.equal(g.collisionOutcome("kill", a, claude), "ignore");
  assert.ok(!has(a, "spirit"), "the last star shrugs Claude off"); assert.equal(claude.state, "EATEN");
  place(a, 0.5, 1.5); vs(g).elapsed = 80; vs(g).margin = 0;
  [b, c, d].forEach((p, i) => place(p, 13.5 + i, 11.5));
  g.callHooks("onTick", DT);
  assert.ok(a.out, "the last star went out in the glitch");
  assert.ok([b, c, d].every(p => !has(p, "spirit")), "the spirits re-formed as stars");
});

test("bot matches: no all-spirit stalls, no wipe-outs, little jitter, at every level", () => {
  for (const level of ["easy", "normal", "hard"]) {
    let reversals = 0, seconds = 0;
    for (const [maze, seed] of [["classic", 11], ["neural", 23], ["server", 37], ["astra", 41]]) {
      const { g, stats } = botMatch(maze, seed, level);
      assert.ok(stats.longestAllSpirit <= 5, `${level} ${maze}: everyone was a spirit for ${stats.longestAllSpirit.toFixed(1)}s`);
      assert.equal(stats.multiOut, 0, `${level} ${maze}: the last players were eliminated together`);
      assert.ok(!g.result.placements[0].out, `${level} ${maze}: the winner was still standing`);
      reversals += stats.reversals; seconds += stats.botSeconds;
    }
    assert.ok(reversals / seconds < (level === "hard" ? 1.6 : 1.0), `${level}: ${(reversals / seconds).toFixed(2)} reversals a second`);
  }
});

test("difficulty changes only bot decisions, never speeds, scores or rules", () => {
  const easy = arena(1), hard = new E.PacmanGame(0);
  hard.startGame(4, "classic", "versus", { seed: 5, humans: 1, botLevel: "hard" }); hard.state = "PLAYING";
  for (const i of [0, 1, 2, 3]) assert.equal(easy.speedScale(easy.players[i]), hard.speedScale(hard.players[i]));
  assert.equal(easy.speedScale(easy.ghosts[0]), hard.speedScale(hard.ghosts[0]));
  assert.deepEqual(Object.keys(Modes.BOT_LEVELS), ["easy", "normal", "hard"]);
  const again = () => { const r = botMatch("classic", 9, "hard"); return JSON.stringify([r.g.playerScores, r.g.result.placements]); };
  assert.equal(again(), again(), "bots replay exactly at a given level");
});

test("keyboard and pad input never steer a bot seat", () => {
  const g = arena(1); const nova = g.players[1];
  const before = nova.wanted;
  g.setDirection((before + 1) % 4, 1);
  assert.equal(nova.wanted, before);
  assert.equal(g.useSkill(1), false);
});
