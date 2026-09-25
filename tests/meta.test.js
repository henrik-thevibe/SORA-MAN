"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
require("../modes.js");
const M = require("../meta.js");
const DT = 1 / 60;

// ---- Four players ---------------------------------------------------------------

test("up to four players: Vega and Lyra join at the outer co-op starts", () => {
  const g = new E.PacmanGame(0); g.startGame(4);
  assert.deepEqual(g.players.map(p => p.skin), ["astra", "nova", "vega", "lyra"]);
  assert.deepEqual(g.players.map(p => p.x), [15.5, 11.5, 17.5, 9.5]);
  assert.equal(g.lives, 7);
  const three = new E.PacmanGame(0); three.startGame(3); assert.equal(three.lives, 6); assert.equal(three.players.length, 3);
  const many = new E.PacmanGame(0); many.startGame(9); assert.equal(many.playerCount, 4);
  const one = new E.PacmanGame(0); one.startGame(0); assert.equal(one.playerCount, 1);
});

test("co-op starts slide to open floor on every maze, and each input steers its own player", () => {
  for (const map of E.MAPS) {
    const g = new E.PacmanGame(0); g.startGame(4, map.id); g.state = "PLAYING";
    for (const pac of g.players) assert.notEqual(E.tileKind(Math.floor(pac.x), Math.floor(pac.y), map), "wall", `${map.id} ${pac.skin}`);
    g.setDirection(0, 2); g.setDirection(2, 3);
    assert.deepEqual(g.players.map(p => p.wanted).slice(2), [0, 2]);
  }
});

test("four-player games play without anyone entering a wall", () => {
  const g = new E.PacmanGame(0); g.startGame(4, "classic", "remix", { seed: 3 });
  for (let i = 0; i < 3600 && g.state !== "GAME_OVER"; i++) {
    for (let p = 0; p < 4; p++) if ((i + p * 11) % 37 === 0) g.setDirection((i / 37 + p) % 4 | 0, p);
    if (i % 120 === 0) for (let p = 0; p < 4; p++) g.useSkill(p);
    g.tick(DT); g.drainEvents();
    for (const actor of [...g.players.filter(p => p.alive), ...g.ghosts]) assert.notEqual(E.tileKind(Math.floor(actor.x), Math.floor(actor.y), g.map), "wall");
  }
});

test("Pulse Shield blocks a catch; Vine Snare slows nearby ghosts", () => {
  const g = new E.PacmanGame(0); g.startGame(4, "classic", "remix"); g.state = "PLAYING"; g.drainEvents();
  g.ghosts.forEach(ghost => Object.assign(ghost, { x: 13.5, y: 14.5, state: "HOUSE", homeTimer: 99 }));
  const [, , vega, lyra] = g.players;
  assert.equal(vega.skill, "pulse-shield"); assert.equal(lyra.skill, "vine-snare");
  g.useSkill(2);
  Object.assign(g.ghosts[0], { x: vega.x, y: vega.y, state: "CHASE", homeTimer: 0 }); g.checkCollisions();
  assert.ok(vega.alive);
  Object.assign(g.ghosts[1], { x: lyra.x + 3, y: lyra.y, state: "CHASE", homeTimer: 0 });
  g.useSkill(3); assert.equal(g.speedScale(g.ghosts[1]), 0.45);
});

test("Constellation links any two players who fire together, not only the first pair", () => {
  const g = new E.PacmanGame(0); g.startGame(4, "classic", "remix"); g.state = "PLAYING"; g.drainEvents();
  g.useSkill(3); g.tick(DT); g.useSkill(2);
  const events = g.drainEvents().map(e => e.name);
  assert.ok(events.includes("constellation"));
  assert.equal(g.getStatus(g.players[2], "linked").data.partner, 3);
  assert.equal(g.getStatus(g.players[3], "linked").data.partner, 2);
  assert.equal(g.hasStatus(g.players[0], "linked"), false);
});

test("Remix only drops the power-ups the profile has unlocked", () => {
  const g = new E.PacmanGame(0); g.startGame(1, "classic", "remix", { powerUps: ["rag"] }); g.state = "PLAYING";
  for (let n = 0; n < 5; n++) {
    for (let i = 0; i < 40; i++) g.callHooks("onPellet", g.pacman, "dot", 1, 1);
    assert.equal(g.items[0].id, "rag"); g.items.length = 0;
  }
});

// ---- Daily runs and score codes ------------------------------------------------------

test("a daily run is the same for everyone on a date and changes day to day", () => {
  const a = M.daily(new Date("2026-09-24T03:00:00Z")), b = M.daily(new Date("2026-09-24T22:00:00Z"));
  assert.deepEqual(a, b);
  assert.equal(a.id, "2026-09-24"); assert.ok(E.RULESETS.has(a.ruleset)); assert.ok(E.findMap(a.maze));
  const days = Array.from({ length: 30 }, (_, i) => M.daily(new Date(Date.UTC(2026, 8, 1 + i))));
  assert.equal(new Set(days.map(d => d.seed)).size, 30);
  assert.ok(new Set(days.map(d => d.ruleset)).size >= 2);
});

test("seeded daily games replay exactly, and the seed changes how ghosts wander", () => {
  const run = seed => {
    const g = new E.PacmanGame(0); g.startGame(1, "classic", "remix", { seed });
    for (let i = 0; i < 2400; i++) { if (i % 41 === 0) g.setDirection((i / 41) % 4 | 0); g.tick(DT); g.drainEvents(); }
    return JSON.stringify([g.score, g.players, g.ghosts, g.items]);
  };
  assert.equal(run(99), run(99));
  const plain = new E.PacmanGame(0); plain.startGame(1);
  const seeded = new E.PacmanGame(0); seeded.startGame(1, "classic", "classic", { seed: 5 });
  assert.equal(plain.ghosts[1].seed, E.GHOSTS[1].seed, "unseeded games keep the arcade seeds");
  assert.notEqual(seeded.ghosts[1].seed, E.GHOSTS[1].seed);
});

test("score codes round-trip and catch typos", () => {
  const code = M.scoreCode({ date: "2026-09-24", ruleset: "benchmark", players: 1, score: 123456 });
  assert.match(code, /^AM1-20260924-B1-[0-9A-Z]+-[0-9A-Z]{4}$/);
  assert.deepEqual(M.readScoreCode(code), { valid: true, date: "2026-09-24", ruleset: "benchmark", players: 1, score: 123456 });
  assert.equal(M.readScoreCode(code.toLowerCase()).valid, true);
  assert.equal(M.readScoreCode(code.replace("-B1-", "-B2-")).valid, false);
  assert.equal(M.readScoreCode("nonsense").valid, false);
});

// ---- Profile, unlocks and achievements ---------------------------------------------------

test("profiles survive junk in storage and keep the free unlocks", () => {
  for (const raw of [null, 5, "x", { xp: -4, credits: "lots", accessories: ["crown", "bogus"], equipped: { nova: "crown", vega: "bogus" }, loadout: ["incognito"] }]) {
    const p = M.normalizeProfile(raw);
    assert.ok(p.xp >= 0 && p.credits >= 0);
    for (const id of ["bow", "visor", "leaf"]) assert.ok(p.accessories.includes(id));
    assert.ok(!p.accessories.includes("bogus"));
    assert.equal(p.equipped.vega, "default");
    assert.ok(p.loadout.every(id => p.powerUps.includes(id)));
  }
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = M.loadProfile(storage); p.credits = 42; M.saveProfile(storage, p);
  assert.equal(M.loadProfile(storage).credits, 42);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(M.loadProfile(broken), M.defaultProfile()); assert.equal(M.saveProfile(broken, p), false);
});

test("levels, purchases, equipping and the three-slot loadout", () => {
  assert.deepEqual(M.levelInfo(0), { level: 1, into: 0, need: 400 });
  assert.equal(M.levelInfo(400).level, 2); assert.equal(M.levelInfo(999).level, 2); assert.equal(M.levelInfo(1000).level, 3);
  const p = M.defaultProfile();
  assert.equal(M.buy(p, "accessory", "antenna").reason, "NEED 250 CREDITS");
  p.credits = 1000;
  assert.equal(M.buy(p, "accessory", "crown").reason, "LEVEL 5");
  assert.equal(M.buy(p, "accessory", "antenna").ok, true); assert.equal(p.credits, 750);
  assert.equal(M.buy(p, "accessory", "antenna").reason, "OWNED");
  assert.equal(M.equip(p, "astra", "antenna"), true); assert.equal(M.equip(p, "astra", "crown"), false);
  assert.equal(M.buy(p, "powerup", "incognito").ok, true);
  M.toggleLoadout(p, "incognito");
  assert.deepEqual(p.loadout, ["rate-limit", "rag", "incognito"]);
  M.toggleLoadout(p, "rag"); assert.deepEqual(p.loadout, ["rate-limit", "incognito"]);
  assert.equal(M.toggleLoadout(p, "hot-path"), false, "not owned");
});

test("the tracker awards achievements as they happen and pays out at the end", () => {
  const profile = M.defaultProfile();
  const g = new E.PacmanGame(0); g.startGame(1, "classic", "benchmark"); g.state = "PLAYING"; g.drainEvents();
  const tracker = M.createTracker(profile);
  const feed = () => g.drainEvents().flatMap(e => tracker.onEvent(e, g)).map(a => a.id);
  g.ghosts.forEach(ghost => Object.assign(ghost, { x: 13.5, y: 14.5, state: "HOUSE", homeTimer: 99 }));
  g.beginFrightened(); feed();
  let got = [];
  for (let i = 0; i < 4; i++) {
    Object.assign(g.ghosts[i], { x: g.pacman.x, y: g.pacman.y, state: "FRIGHTENED", homeTimer: 0 });
    g.checkCollisions(); got = got.concat(feed()); g.freezeTimer = 0;
  }
  assert.ok(got.includes("four-of-a-kind"));
  assert.equal(profile.credits, M.ACHIEVEMENTS.find(a => a.id === "four-of-a-kind").credits);
  g.addScore(12000, g.pacman); g.ruleState("benchmark").timeLeft = 0.01; g.tick(DT);
  got = feed();
  assert.ok(got.includes("10k-tokens") && got.includes("hello-world") && got.includes("benchmarked"), got.join());
  const report = tracker.finish(g);
  assert.ok(report.xp > 200 && report.credits > 40); assert.equal(profile.games, 1);
  assert.equal(tracker.finish(g), null, "paid once");
  const again = M.createTracker(profile); assert.deepEqual(again.onEvent({ name: "gameOver" }, g), []);
});

test("World Tour remembers mazes cleared across games", () => {
  const profile = M.defaultProfile();
  for (const map of E.MAPS) {
    const g = new E.PacmanGame(0); g.startGame(1, map.id); g.state = "PLAYING"; g.drainEvents();
    const tracker = M.createTracker(profile);
    g.forceClearForTest(); g.tick(DT);
    for (const e of g.drainEvents()) tracker.onEvent(e, g);
  }
  assert.deepEqual([...profile.mazesCleared].sort(), E.MAPS.map(m => m.id).sort());
  assert.ok(profile.achievements["world-tour"] && profile.achievements["clean-run"]);
});
