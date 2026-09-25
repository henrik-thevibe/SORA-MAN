"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const Art = require("../art.js");
const { createEffects, rotateHue, ditherCells, MODES } = require("../effects.js");
const DT = 1 / 60;

function playing(players = 1, maze = "classic") {
  const g = new E.PacmanGame(0); g.startGame(players, maze); g.state = "PLAYING"; g.drainEvents();
  return g;
}
const fx = (mode = "juicy") => { const f = createEffects({ Art, Engine: E, doc: {} }); f.setMode(mode); return f; };
const feed = (f, g) => { for (const event of g.drainEvents()) f.onEvent(event, g); };

test("visual modes cycle juicy, CRT and purist, and unknown modes fall back to juicy", () => {
  const f = fx();
  assert.deepEqual(MODES, ["juicy", "crt", "purist"]);
  assert.deepEqual([f.cycleMode(), f.cycleMode(), f.cycleMode()], ["crt", "purist", "juicy"]);
  assert.equal(f.toast.text, "VISUALS JUICY");
  f.tickUI(2); assert.equal(f.toast, null);
  assert.equal(f.setMode("nonsense"), "juicy");
});

test("eating a ghost bursts particles and shakes the screen; purist stays plain", () => {
  for (const [mode, expectParticles] of [["juicy", true], ["crt", true], ["purist", false]]) {
    const g = playing(), f = fx(mode);
    Object.assign(g.ghosts[1], { x: g.pacman.x, y: g.pacman.y, state: "FRIGHTENED" });
    g.checkCollisions(); feed(f, g);
    const snap = f.snapshot();
    assert.equal(snap.particles > 0, expectParticles, mode);
    assert.equal(snap.shake > 0, expectParticles, mode);
    assert.deepEqual(f.shakeOffset().every(v => Number.isFinite(v)), true);
  }
});

test("reduced motion keeps the glow but drops shake, glitch and most particles", () => {
  const g = playing(), f = fx(); f.reducedMotion = true;
  Object.assign(g.ghosts[0], { x: g.pacman.x, y: g.pacman.y, state: "CHASE" });
  g.checkCollisions(); feed(f, g);
  const snap = f.snapshot();
  assert.equal(snap.shake, 0); assert.equal(snap.glitch, 0); assert.deepEqual(f.shakeOffset(), [0, 0]);
  assert.ok(snap.particles > 0 && snap.particles <= 9);
});

test("a 16-dot streak floats a label; a pause in eating resets the count", () => {
  const g = playing(), f = fx();
  const eat = n => { for (let i = 0; i < n; i++) f.onEvent({ name: "pellet", data: { player: 0, x: 1, y: 1 } }, g); };
  eat(15); assert.equal(f.snapshot().texts, 0);
  eat(1); assert.equal(f.snapshot().texts, 1);
  f.update(0.5, g); eat(15); f.update(DT, g);
  assert.equal(f.snapshot().texts, 1, "the streak restarted after the pause");
});

test("effects expire and never touch the simulation", () => {
  const g = playing(2), f = fx();
  const before = JSON.stringify(g);
  f.onEvent({ name: "powerPellet", data: { player: 1, x: 1, y: 3 } }, g);
  f.onEvent({ name: "levelClear" }, g);
  assert.ok(f.snapshot().particles > 0 && f.snapshot().rings > 0);
  for (let i = 0; i < 120; i++) f.update(DT, g);
  assert.deepEqual(f.snapshot().particles, 0); assert.deepEqual(f.snapshot().rings, 0);
  assert.equal(JSON.stringify(g), before);
});

test("cornering throws sparks from the wall being cut", () => {
  const g = playing(), f = fx();
  Object.assign(g.pacman, { x: 5.5, y: 1.2, dir: 3, cornerAxis: "y", cornerTarget: 1.5, moving: true });
  f.update(DT, g);
  assert.ok(f.snapshot().particles > 0);
  const purist = fx("purist"); purist.update(DT, g); assert.equal(purist.snapshot().particles, 0);
});

test("wall colours shift hue by level only in the juicy modes", () => {
  assert.equal(rotateHue("#ff0000", 120), "#00ff00");
  assert.equal(rotateHue("#284bff", 360), "#284bff");
  const g = playing(), f = fx();
  assert.equal(f.wallColor("#284bff", g), "#284bff");
  g.level = 2; assert.notEqual(f.wallColor("#284bff", g), "#284bff");
  assert.equal(fx("purist").wallColor("#284bff", g), "#284bff");
  assert.equal(f.wallColor(undefined, { level: 1 }), "#284bff");
});

test("score popups rise and pop in, and sit still in purist", () => {
  const f = fx();
  assert.deepEqual(f.popupStyle({ color: "#35e7eb", timeLeft: E.GHOST_EAT_PAUSE }), { dy: -0, scale: 2 });
  const later = f.popupStyle({ color: "#35e7eb", timeLeft: 0.2 });
  assert.equal(later.scale, 1); assert.ok(later.dy < 0);
  assert.deepEqual(fx("purist").popupStyle({ color: "#ffb8ff", timeLeft: 1 }), { dy: 0, scale: 1 });
});

test("only the Server Room is dark, and dark mazes compile from the map flag", () => {
  assert.deepEqual(E.MAPS.filter(m => m.dark).map(m => m.id), ["server"]);
  assert.equal(E.analyzeMap({ rows: E.MAZE, spawn: [13.5, 23.5], dark: true }).map.dark, true);
});

// A canvas stand-in for the new drawing passes: every call is accepted.
function fakeDoc() {
  const context = () => new Proxy({}, { get: (t, k) => k in t ? t[k] : (w, h) => ({ addColorStop() {}, data: new Uint8ClampedArray(k === "createImageData" ? w * h * 4 : 0) }), set: (t, k, v) => { t[k] = v; return true; } });
  return { createElement: () => { const c = { width: 0, height: 0 }; c.getContext = () => c.ctx || (c.ctx = context()); return c; } };
}
const frightened = (f, g, timer) => { g.frightDuration = 6; g.frightTimer = timer; return f; };

test("dither stages light eight more cells each, from none to all", () => {
  let previous = ditherCells(0);
  assert.equal(previous.reduce((a, b) => a + b, 0), 0);
  for (let stage = 1; stage <= 8; stage++) {
    const cells = ditherCells(stage);
    assert.equal(cells.reduce((a, b) => a + b, 0), stage * 8);
    assert.ok(previous.every((on, i) => !on || cells[i]), "each stage keeps the last one's cells");
    previous = cells;
  }
});

test("walls dim while ghosts are frightened and flash pale with the warning blink", () => {
  const g = playing(), f = fx(), base = "#284bff";
  assert.equal(f.frightTint(base, g, 0), base);
  frightened(f, g, 5.95); const ramp = f.frightTint(base, g, 0);
  frightened(f, g, 5); const fright = f.frightTint(base, g, 0);
  frightened(f, g, 1.5); const pale = f.frightTint(base, g, 0);
  assert.equal(f.frightTint(base, g, 0.25), fright, "off-beat of the warning blink");
  assert.equal(new Set([base, ramp, fright, pale]).size, 4);
  // The same beat as the ghosts' WARNING sprite in game.js.
  for (let t = 0; t < 2; t += 0.05) assert.equal(f.frightTint(base, g, t) === pale, Math.floor(t * 4) % 2 === 0);
  const colours = new Set();
  for (let timer = 6; timer > 0; timer -= 0.1) for (let t = 0; t < 1; t += 0.1) colours.add(frightened(f, g, timer).frightTint(base, g, t));
  assert.ok(colours.size <= 3);
  assert.equal(fx("purist").frightTint(base, g, 0), base);
  g.state = "LEVEL_CLEAR"; assert.equal(f.frightTint(base, g, 0), base);
  g.state = "PLAYING"; f.reducedMotion = true; assert.equal(f.frightTint(base, g, 0), fright);
});

test("a new round's maze denoises in during READY, but not after a lost life", () => {
  const g = new E.PacmanGame(0); g.startGame(1, "classic");
  const f = fx();
  assert.equal(f.revealProgress(g), 0);
  for (let i = 0; i < 33; i++) g.tick(DT);
  assert.ok(Math.abs(f.revealProgress(g) - 0.5) < 0.02);
  g.togglePause(); for (let i = 0; i < 60; i++) g.tick(DT);
  assert.ok(Math.abs(f.revealProgress(g) - 0.5) < 0.02, "held while paused"); g.togglePause();
  for (let i = 0; i < 40; i++) g.tick(DT);
  assert.equal(f.revealProgress(g), null);
  assert.equal(fx("purist").revealProgress(new E.PacmanGame(0)), null);
  const again = new E.PacmanGame(0); again.startGame(1, "classic"); again.startRound(true); again.state = "READY";
  assert.equal(f.revealProgress(again), null);
  const calm = fx(); calm.reducedMotion = true;
  const fresh = new E.PacmanGame(0); fresh.startGame(1, "classic"); calm.revealProgress(fresh);
  for (let i = 0; i < 24; i++) fresh.tick(DT);
  assert.equal(calm.revealProgress(fresh), null, "reduced motion is a short fade");
});

test("an eaten ghost dissolves during the pause; purist and reduced motion just hide it", () => {
  for (const [mode, calm, expected] of [["juicy", false, "pinky"], ["purist", false, null], ["juicy", true, null]]) {
    const g = playing(), f = fx(mode); f.reducedMotion = calm;
    Object.assign(g.ghosts[1], { x: g.pacman.x, y: g.pacman.y, state: "FRIGHTENED" });
    g.checkCollisions(); feed(f, g);
    assert.equal(f.snapshot().dissolve, expected, mode);
    if (!expected) { assert.equal(f.dissolveStage(g), null); continue; }
    const stages = [];
    for (let i = 0; i < 30; i++) { stages.push(f.dissolveStage(g)); g.tick(DT); }
    assert.equal(stages[0], 8);
    const live = stages.filter(stage => stage !== null);
    assert.ok(live.every((stage, i) => i === 0 || stage <= live[i - 1]), "the ghost only fades");
    assert.equal(stages[stages.length - 1], null);
  }
});

test("frightened ghosts shiver by one backing pixel only as their fear runs out", () => {
  const g = playing(), f = fx(), ghost = Object.assign(g.ghosts[0], { state: "FRIGHTENED" });
  g.frightTimer = 3; assert.equal(f.ghostShiver(ghost, 0, g, 0.1), 0);
  g.frightTimer = 1.5;
  const offsets = new Set(); for (let t = 0; t < 1; t += 0.01) offsets.add(f.ghostShiver(ghost, 0, g, t));
  assert.deepEqual([...offsets].sort(), [0, 0.5]);
  assert.equal(f.ghostShiver(ghost, 0, g, 0.05), 0.5 - f.ghostShiver(ghost, 1, g, 0.05), "neighbours alternate");
  assert.equal(fx("purist").ghostShiver(ghost, 0, g, 0.05), 0);
  g.freezeTimer = 0.5; assert.equal(f.ghostShiver(ghost, 0, g, 0.05), 0);
  g.freezeTimer = 0; f.reducedMotion = true; assert.equal(f.ghostShiver(ghost, 0, g, 0.05), 0);
  ghost.state = "CHASE"; f.reducedMotion = false; assert.equal(f.ghostShiver(ghost, 0, g, 0.05), 0);
});

test("1UP blinks during play in every visual mode, and holds still otherwise", () => {
  const g = playing();
  for (const mode of MODES) {
    const f = fx(mode);
    assert.deepEqual([f.hudLabelOn(g, 0), f.hudLabelOn(g, 0.4)], [true, false], mode);
  }
  const f = fx();
  g.state = "READY"; assert.equal(f.hudLabelOn(g, 0.4), true);
  g.state = "PLAYING"; f.reducedMotion = true; assert.equal(f.hudLabelOn(g, 0.4), true);
});

test("ghost scores pop in and rise through the ghost-eat pause", () => {
  const f = fx(), popup = { color: "#35e7eb", timeLeft: 1 };
  assert.deepEqual(f.popupStyle(popup, { freezeTimer: 1 }), { dy: -0, scale: 2 });
  const later = f.popupStyle(popup, { freezeTimer: 0.5 });
  assert.equal(later.scale, 1); assert.equal(later.dy, -6);
});

test("the new drawing passes run and never touch the simulation", () => {
  const f = createEffects({ Art, Engine: E, doc: fakeDoc() }); f.setMode("juicy");
  const g = new E.PacmanGame(0); g.startGame(1, "classic");
  const before = JSON.stringify(g), ctx = fakeDoc().createElement().getContext();
  f.drawReveal(ctx, g, "#284bff");
  assert.equal(f.snapshot().reveal, 0);
  f.drawTitleShine(ctx, { width: 448, height: 68 }, 0.2);
  f.drawMazeGlow(ctx, { width: 448, height: 496 }, 24);
  assert.equal(f.snapshot().mazeStyle, "neon"); assert.equal(fx("purist").mazeStyle, undefined);
  assert.equal(JSON.stringify(g), before);
});
