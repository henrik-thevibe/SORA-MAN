"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { PacmanGame } = require("../engine.js");
const { ArcadeAudio, backgroundClip, bedFor } = require("../audio.js");
const bank = require("../sound-bank.js");
const manifest = require("../assets/audio/manifest.json");

class FakeParam {
  constructor() { this.value = 1; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class FakeContext {
  constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; this.voices = []; this.decodes = 0; this.resumes = 0; }
  createGain() { return { gain: new FakeParam(), connect() {}, disconnect() {} }; }
  decodeAudioData(bytes) {
    this.decodes++;
    return Promise.resolve({ duration: (bytes.byteLength - 44) / 2 / 44100 });
  }
  resume() { this.resumes++; this.state = "running"; return Promise.resolve(); }
  close() { this.state = "closed"; return Promise.resolve(); }
  createBufferSource() {
    const ctx = this;
    const source = {
      connect() {}, disconnect() {}, loop: false, end: Infinity, ended: false,
      start(when, offset) { this.when = when; this.offset = offset; this.end = this.loop ? Infinity : when + this.buffer.duration - offset; },
      stop(when = ctx.currentTime) { this.end = when; ctx.advance(0); },
    };
    this.voices.push(source); return source;
  }
  advance(seconds) {
    this.currentTime += seconds;
    for (const voice of this.voices) if (!voice.ended && voice.end <= this.currentTime) {
      voice.ended = true; voice.onended?.();
    }
  }
}
function game() { const g = new PacmanGame(0, bank.timings); g.startGame(); g.state = "PLAYING"; g.drainEvents(); return g; }
async function setup(g = game()) {
  const ctx = new FakeContext(), errors = [];
  const a = new ArcadeAudio(g, { bank, contextFactory: () => ctx, onError: error => errors.push(error) });
  assert.equal(await a.unlock(), true); return { g, a, ctx, errors };
}
function pump(g, a) { for (const event of g.drainEvents()) a.play(event.name, event.data); }
function step(g, a, ctx, count) { for (let i = 0; i < count; i++) { ctx.advance(1 / 60); g.tick(1 / 60); pump(g, a); a.update(); } }

test("bundled WAVs, base64 bank, manifest and pinned reference hashes agree", () => {
  const dir = path.join(__dirname, "../assets/audio");
  assert.equal(Object.keys(bank.clips).length, 39);
  for (const [key, clip] of Object.entries(bank.clips)) {
    const bytes = Buffer.from(clip.data, "base64"), meta = manifest.clips[key];
    assert.deepEqual(bytes, fs.readFileSync(path.join(dir, key + ".wav")));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), meta.sha256);
    assert.match(meta.source, /^generated:scripts\/generate-astra-(ui-)?audio\.js$/);
    assert.equal(clip.duration, meta.duration);
    assert.equal(clip.duration, meta.frames / meta.sampleRate);
    assert.equal(clip.loop, meta.loopEnd !== null);
    if (clip.loop) {
      assert.equal(meta.loopEnd, clip.duration);
      const seam = Math.abs(bytes.readInt16LE(44) - bytes.readInt16LE(bytes.length - 2)) / 32768;
      assert.ok(seam < 0.04, `${key} loop seam ${seam}`);
    }
  }
  // The arcade recordings are kept only as the generator's contour references.
  for (const source of require("../assets/audio/sources.json").sources) {
    const bytes = fs.readFileSync(path.join(dir, "reference", source.name + ".mp3"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
  }
  assert.ok(bank.timings.introDuration >= bank.clips.intro.duration);
  assert.ok(bank.timings.intermissionDuration >= bank.clips.intermission.duration);
});

test("chomps and loop cycles use steady recording levels instead of editorial fades", () => {
  function rms(bytes, from, to) {
    let sum = 0;
    for (let i = from; i < to; i++) sum += (bytes.readInt16LE(44 + i * 2) / 32768) ** 2;
    return Math.sqrt(sum / (to - from));
  }
  const bites = ["munchA", "munchB"].map(key => {
    const bytes = Buffer.from(bank.clips[key].data, "base64");
    return rms(bytes, 0, (bytes.length - 44) / 2);
  });
  assert.ok(Math.min(...bites) > 0.15, "both bites should contain full-level sound");
  assert.ok(Math.max(...bites) / Math.min(...bites) < 1.1, "alternating bites should have comparable level");
  for (const [key, clip] of Object.entries(bank.clips).filter(([, clip]) => clip.loop)) {
    const bytes = Buffer.from(clip.data, "base64"), count = (bytes.length - 44) / 2;
    const cycles = [0, 1, 2, 3].map(i => rms(bytes, Math.floor(i * count / 4), Math.floor((i + 1) * count / 4)));
    // The menu loop is a phrase, not four identical cycles, so its quarters may differ a little more.
    assert.ok(Math.max(...cycles) / Math.min(...cycles) < (key === "menuLoop" ? 1.25 : 1.12), `${key} must not repeat a fade-in`);
  }
});

test("prepare and concurrent unlock are idempotent; attract stays silent", async () => {
  const g = new PacmanGame(0), ctx = new FakeContext(); let factories = 0;
  const a = new ArcadeAudio(g, { bank, contextFactory: () => { factories++; return ctx; } });
  const p = a.prepare(); assert.equal(a.prepare(), p);
  const u = a.unlock(); assert.equal(a.unlock(), u);
  assert.equal(ctx.resumes, 1, "resume must execute synchronously inside the gesture");
  await u; await a.prepare(); a.update();
  assert.equal(factories, 1); assert.equal(ctx.decodes, 39); assert.equal(a.starts, 0);
});

test("pellets alternate one chomp voice; empty corridors and mode changes add no effects", async () => {
  const { g, a, ctx } = await setup(); a.update();
  for (const [i, name] of ["pellet", "pellet", "powerPellet", "pellet"].entries()) {
    a.play(name); assert.equal(a.channels.get("effect").key, i % 2 ? "munchB" : "munchA");
    ctx.advance(0.2); assert.equal(a.channels.has("effect"), false);
  }
  const starts = a.starts; g.pellets.fill(0); g.movePacman(1 / 60); pump(g, a);
  a.play("modeChange"); a.play("fruitAppear"); a.update();
  assert.equal(a.starts, starts); assert.equal(a.channels.size, 1);
});

test("all five siren thresholds are exact and survive death, resetting on the next level", async () => {
  const { g, a, ctx } = await setup();
  for (const [dots, key] of [[0,"siren0"],[115,"siren0"],[116,"siren1"],[179,"siren1"],[180,"siren2"],[211,"siren2"],[212,"siren3"],[227,"siren3"],[228,"siren4"],[243,"siren4"]]) {
    g.dotsEaten = dots; a.update(); ctx.advance(0.01); assert.equal(a.snapshot().playingBed, key);
    const starts = a.starts; a.update(); assert.equal(a.starts, starts);
  }
  g.startRound(true); g.state = "PLAYING"; a.update(); assert.equal(backgroundClip(g), "siren4");
  g.advanceLevel(); g.state = "PLAYING"; a.update(); assert.equal(backgroundClip(g), "siren0");
});

test("returning eyes override frightened until every eaten ghost reaches home", async () => {
  const { g, a, ctx } = await setup(); g.dotsEaten = 180; g.beginFrightened(); pump(g, a);
  assert.equal(a.snapshot().playingBed, "frightened");
  g.ghosts[0].state = g.ghosts[1].state = "EATEN"; a.play("ghostEaten");
  assert.equal(a.snapshot().playingBed, "returning");
  const starts = a.starts; g.beginFrightened(); pump(g, a); assert.equal(a.starts, starts);
  g.ghosts[0].state = "HOUSE"; a.play("ghostHome"); assert.equal(a.snapshot().playingBed, "returning");
  g.ghosts[1].state = "HOUSE"; a.play("ghostHome"); assert.equal(a.snapshot().playingBed, "frightened");
  g.frightTimer = 0; g.finishFrightened(); pump(g, a); ctx.advance(0.01);
  assert.equal(a.snapshot().playingBed, "siren2"); assert.equal(a.sources.size, 2);
});

test("repeated power pellets extend frightened without restarting its loop", async () => {
  const { g, a } = await setup(); g.beginFrightened(); pump(g, a);
  const bed = a.channels.get("bed"); g.frightTimer = 0.5;
  g.beginFrightened(); a.play("powerPellet"); pump(g, a);
  assert.equal(g.frightTimer, g.frightDuration); assert.equal(a.channels.get("bed"), bed);
});

test("zero-duration frightened levels chomp but never select the frightened loop", async () => {
  const { g, a } = await setup(); g.level = 17; g.startRound(false); g.state = "PLAYING";
  Object.assign(g.pacman, { x: 1.5, y: 3.5 }); g.consumeAtPacman(); pump(g, a);
  assert.equal(g.frightTimer, 0); assert.equal(a.snapshot().playingBed, "siren0");
  assert.equal(a.snapshot().lastEffect, "munchA");
});

test("power-ups and zaps have their own sounds; fruit keeps its own", async () => {
  const { a, ctx } = await setup();
  for (const [event, key] of [["powerUp", "powerUp"], ["fruitEaten", "fruit"], ["ghostZapped", "zap"], ["explosion", "zap"], ["ghostEaten", "ghost"]]) {
    a.play(event); assert.equal(a.channels.get("effect").key, key, event); ctx.advance(1);
  }
});

test("ghost and death effects have priority; extra life has its own voice", async () => {
  const { g, a, ctx } = await setup(); a.play("pellet"); a.play("ghostEaten"); a.play("fruitEaten"); a.play("pellet");
  assert.equal(a.channels.get("effect").key, "ghost");
  a.play("extraLife"); assert.equal(a.channels.get("bonus").key, "extraLife");
  ctx.advance(0.01); g.state = "DYING"; a.play("death");
  assert.deepEqual(a.snapshot().channels, { effect: "death" }); assert.equal(a.sources.size, 1);
  a.play("pellet"); assert.equal(a.channels.get("effect").key, "death");
  ctx.advance(2); assert.equal(a.sources.size, 0);
  g.state = "GAME_OVER"; a.play("gameOver");
  assert.deepEqual(a.snapshot().channels, { gameOver: "gameOver" }, "game over clears play and sounds its sting");
});

test("UI sounds use their own bus: heard while paused, silenced by mute, one nav voice at a time", async () => {
  const { a } = await setup();
  a.setHeld(true); assert.ok(a.ui("uiClick"), "a PAUSE click is heard while play is held");
  a.ui("uiMove"); a.ui("uiMove"); a.ui("tally");
  assert.deepEqual(a.snapshot().channels, { ui: "uiMove", tally: "tally" });
  a.setHeld(false); a.setHeld(true); assert.equal(a.channels.get("tally").key, "tally", "holding play keeps UI sounds");
  a.setMuted(true); assert.equal(a.sources.size, 0); assert.equal(a.ui("uiMove"), null);
  a.setMuted(false); assert.equal(a.ui("nonsense"), null);
});

test("the menu loop plays on the title only when allowed, and START replaces it", async () => {
  const { g, a } = await setup(new PacmanGame(0, bank.timings)); a.update();
  assert.equal(g.state, "ATTRACT");
  assert.equal(a.snapshot().playingBed, null, "the title is silent until game.js allows the loop");
  a.setMenuBed(true); assert.equal(a.snapshot().playingBed, "menuLoop");
  a.setMenuBed(false); assert.equal(a.snapshot().playingBed, null);
  a.setMenuBed(true); g.startGame(); pump(g, a); assert.equal(a.snapshot().playingBed, "intro");
});

test("opening starts at zero and completes before movement; later READY screens are silent", async () => {
  const g = game(); g.startGame(); const { a, ctx } = await setup(g); pump(g, a);
  assert.equal(a.channels.get("bed").key, "intro"); assert.equal(a.channels.get("bed").offset, 0);
  const x = g.pacman.x; step(g, a, ctx, 251);
  assert.equal(g.state, "READY"); assert.equal(g.pacman.x, x);
  step(g, a, ctx, 2); assert.equal(g.state, "PLAYING");
  g.state = "DYING"; g.deathTimer = 1.74; step(g, a, ctx, 1);
  assert.equal(g.readyKind, "round"); assert.equal(bedFor(g), null); assert.equal(a.sources.size, 0);
});

test("opening and intermission pause at their elapsed offsets and discard effects", async () => {
  for (const kind of ["intro", "intermission"]) {
    const { g, a, ctx } = await setup();
    if (kind === "intro") { g.startGame(); g.readyTimer -= 1.25; g.drainEvents(); }
    else { g.state = "INTERMISSION"; g.intermissionTimer = g.timings.intermissionDuration - 1.25; }
    a.update(); assert.equal(a.channels.get("bed").offset, 1.25);
    g.togglePause(); pump(g, a); const timer = a.snapshot().musicOffset;
    step(g, a, ctx, 120); assert.equal(a.sources.size, 0); assert.equal(a.snapshot().musicOffset, timer);
    g.togglePause(); pump(g, a);
    assert.equal(a.channels.get("bed").key, kind); assert.equal(a.channels.get("bed").offset, timer);
  }
});

test("mute advances music time; unmute restores the bed without replaying old effects", async () => {
  const { g, a, ctx } = await setup(); g.startGame(); pump(g, a); a.setMuted(true);
  step(g, a, ctx, 60); a.play("ghostEaten"); a.play("extraLife");
  assert.equal(a.sources.size, 0); a.setMuted(false);
  assert.equal(a.channels.size, 1); assert.equal(a.channels.get("bed").key, "intro");
  assert.ok(Math.abs(a.channels.get("bed").offset - 1) < 1e-8);
});

test("intermission music runs to completion, then returns to a short silent READY", async () => {
  const { g, a, ctx } = await setup(); g.level = 2; g.advanceLevel(); pump(g, a);
  step(g, a, ctx, 600); assert.equal(g.state, "INTERMISSION"); assert.equal(a.snapshot().playingBed, "intermission");
  step(g, a, ctx, 28); assert.equal(g.state, "READY"); assert.equal(g.readyKind, "round"); assert.equal(bedFor(g), null);
});

test("holds cancel even fading sources and never resurrect interrupted effects", async () => {
  const { a, g, ctx } = await setup(); a.play("pellet"); a.play("pellet"); g.frightTimer = 3; a.update();
  a.setHeld(true); assert.equal(a.sources.size, 0); assert.ok(ctx.voices.every(v => v.ended));
  a.setHeld(false); assert.deepEqual(a.snapshot().channels, { bed: "frightened" });
});

test("missing bank, broken context, bad decoding and rejected resume fail silently once", async () => {
  for (const options of [
    { bank: { clips: {} } },
    { contextFactory: () => { throw new Error("no device"); } },
    { contextFactory: () => Object.assign(new FakeContext(), { decodeAudioData: () => Promise.reject(new Error("bad clip")) }) },
    { contextFactory: () => Object.assign(new FakeContext(), { resume: () => Promise.reject(new Error("blocked")) }) },
  ]) {
    const errors = [], a = new ArcadeAudio(game(), { bank, contextFactory: () => new FakeContext(), ...options, onError: e => errors.push(e) });
    assert.equal(await a.unlock(), false); assert.equal(await a.unlock(), false);
    assert.equal(errors.length, 1); assert.equal(a.status, "unavailable");
    assert.doesNotThrow(() => { a.play("start"); a.update(); a.setHeld(true); a.setMuted(false); });
    assert.equal(a.sources.size, 0);
  }
});

test("a throwing failure reporter cannot reject game startup", async () => {
  const a = new ArcadeAudio(game(), { bank: {}, onError: () => { throw new Error("reporter"); } });
  assert.equal(await a.unlock(), false);
});

test("stalled audio decoding has a bounded silent fallback", async () => {
  const a = new ArcadeAudio(game(), { bank, contextFactory: () => Object.assign(new FakeContext(), { decodeAudioData: () => new Promise(() => {}) }), onError() {} });
  assert.equal(await a.unlock(), false); assert.match(a.error, /timed out/); assert.equal(a.context.state, "closed");
});

test("the ghost-eat pause silences the bed, then the returning eyes take over", async () => {
  const { g, a } = await setup(); g.state = "PLAYING"; g.beginFrightened();
  Object.assign(g.ghosts[0], { x: g.pacman.x, y: g.pacman.y, state: "FRIGHTENED" }); g.checkCollisions(); pump(g, a);
  assert.equal(a.snapshot().playingBed, null); assert.equal(a.snapshot().lastEffect, "ghost");
  for (let i = 0; i < 61; i++) g.tick(1 / 60);
  pump(g, a); assert.equal(a.snapshot().playingBed, "returning");
});

test("a co-op death with the partner still playing keeps the siren", async () => {
  const { g, a } = await setup(); g.startGame(2); g.state = "PLAYING"; g.drainEvents(); a.update();
  const bed = a.channels.get("bed"); assert.equal(bed.key, "siren0");
  const nova = g.players[1];
  Object.assign(g.ghosts[0], { x: nova.x, y: nova.y, state: "CHASE" }); g.checkCollisions(); pump(g, a);
  assert.equal(g.state, "PLAYING"); assert.equal(a.snapshot().lastEffect, "death");
  assert.equal(a.channels.get("bed"), bed, "the siren is not interrupted");
});
