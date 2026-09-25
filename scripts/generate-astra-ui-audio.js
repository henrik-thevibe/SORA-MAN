"use strict";

// Astra-Man sound set v3: the boot intro, the title/menu loop and the UI sounds.
// Built from the same parts as the gameplay set (scripts/astra-voices.js) and in
// its key (G major, boot-03's home motif), so the whole game has one voice:
// friendly bells and bit-clicks for the player, crushed glitches for trouble.
//
//   node scripts/generate-astra-ui-audio.js            audition set in outputs/astra-audio-ui
//   node scripts/generate-astra-ui-audio.js --check    loop/sync/level checks only
//   node scripts/generate-astra-ui-audio.js --install  write the approved clips to assets/audio,
//                                                       then run python scripts/build-audio.py
const fs = require("node:fs");
const path = require("node:path");
const kit = require("./audio-kit.js");
const {
  RATE, TICK, frames, noteHz, env, ticks, ramp, repeat, triangleTable, shapes, voice, noise, layer,
  applyEnv, crush, decimate, lowpass, highpass, echo, seamlessLoop, loudness, fadeEdges, gainAndFade, mulberry32,
} = kit;
const { bitClick, shimmer, leadNote, bassNote, blip, BOOT03 } = require("./astra-voices.js");
const { auditionPage } = require("./audition-page.js");
const { CONTOUR } = require("./generate-astra-audio.js");
const BOOT = require("../boot-timeline.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "outputs", "astra-audio-ui");
const AUDIO = path.join(ROOT, "assets", "audio");
const T = TICK;

// Short UI sounds are levelled by peak (RMS means little over 30 ms); the loop
// and longer cues by RMS, a step below the gameplay beds (siren ~0.16).
const PEAK = {
  bootIntro: 0.62, titleSting: 0.55, uiMoveA: 0.24, uiMoveB: 0.24, uiChange: 0.26, uiConfirm: 0.32, uiBack: 0.26,
  uiClick: 0.28, soundOn: 0.3, soundOff: 0.28, uiBuy: 0.38, uiEquip: 0.32, uiLoadoutAdd: 0.25, uiLoadoutRemove: 0.23,
  uiDenied: 0.24, tally: 0.36, levelUp: 0.5, achievement: 0.42, gameOver: 0.55,
  alarm: 0.24, victory: 0.52, readyUp: 0.3,
};
const LOOP_RMS = 0.06;

const byPeak = (key, s, fadeMs = 4) => gainAndFade(fadeEdges(s, 0.5, fadeMs), PEAK[key], 0);

// ---------------------------------------------------------------- small parts

// Half-size waka: a few frames of a munch contour, the chomp's pulse "mouth" and click.
function miniMunch(table, { length = table.length * T, click = 3400, seed = 11 } = {}) {
  const freq = ticks(table, { slew: 0.002 });
  const core = voice(length, { freq, shape: shapes.pulse((t) => 0.2 + 0.28 * t / length) });
  const body = voice(length, { freq: (t) => freq(t) / 2, shape: shapes.tri() });
  const s = layer([[core, 0.62], [body, 0.3], [bitClick(click, 0.004, seed), 0.5]]);
  return applyEnv(lowpass(crush(s, 9), 7000), env([[0, 0], [0.0015, 1], [length * 0.8, 0.9], [length, 0]]));
}
// The boot's "online" ping (end of the in-game boot jingle): the home chord's top G.
function onlinePing() {
  return layer([[blip(91, 0.42, 2.4), 0.55], [blip(98, 0.3, 1.2), 0.22, 0.02], [bitClick(5200, 0.004, 77), 0.3]]);
}
function thump(freq = 140, length = 0.05) {
  return voice(length, { freq: (t) => freq * Math.exp(-t / 0.03) + freq / 2, shape: shapes.sine(), amp: (t) => Math.exp(-t / (length / 4)) });
}
function whoosh(length, seed = 5) {
  // Filtered noise whose band sweeps up as the covers part.
  const n = noise(length, seed), band = highpass(lowpass(n, (t) => 400 + 5600 * (t / length) ** 1.5), 200);
  return applyEnv(band, (t) => Math.sin(Math.PI * Math.min(1, t / length)) ** 1.5);
}
// Stepped zip in arcade frames, like the returning eyes' sweeps.
function zip(from, to, length, { decimateBy = 2 } = {}) {
  const count = Math.max(2, Math.round(length / T)), table = ramp(from, (to - from) / (count - 1), count);
  const s = voice(length, { freq: ticks(table, { slew: 0.002 }), shape: shapes.fm(1, 0.9) });
  return decimate(crush(s, 7), decimateBy);
}

// ---------------------------------------------------------------- boot and title

function titleSting() {
  // boot-03's opening G–D–G, an octave up and quick, landing on a held G with its bell.
  const parts = [], notes = [[0, 67, 0.07], [0.075, 74, 0.07], [0.15, 79, 0.5]];
  for (const [at, midi, length] of notes) parts.push([leadNote(midi, length, { bell: length > 0.3 ? 0.45 : 0.3 }), 0.8, at]);
  parts.push([bassNote(43, 0.6), 0.45, 0.15], [bassNote(31, 0.7), 0.3, 0.15], [bitClick(4600, 0.004, 21), 0.35, 0.15]);
  for (const m of [83, 86, 91]) parts.push([blip(m, 0.35, 1), 0.12, 0.17]);
  const s = echo(layer(parts, 1.25), { delay: 0.11, feedback: 0.28, wet: 0.2 });
  return byPeak("titleSting", applyEnv(s, env([[0, 1], [1.0, 1], [1.25, 0]])), 20);
}

function bootIntro() {
  const duration = BOOT.end, parts = [];
  // Power on: a low thump and a hum that swells in as the machine wakes.
  parts.push([thump(90, 0.3), 0.8, 0], [bitClick(2600, 0.004, 3), 0.4, 0]);
  const humEnd = BOOT.complete + 0.3;
  const hum = voice(humEnd, { freq: noteHz(43), shape: shapes.fm(2, 0.6), amp: env([[0, 0], [0.35, 1], [humEnd - 0.3, 0.8], [humEnd, 0]]) });
  parts.push([lowpass(hum, 900), 0.22, 0]);
  // Loading riser: the siren's rise, stretched across the bar, soft and low.
  const [lo, hi] = CONTOUR.sirens[0], riseTicks = Math.round(BOOT.sweepDuration / T);
  const riseTable = ramp(lo / 2, (hi - lo) / 2 / (riseTicks - 1), riseTicks);
  const riseFreq = ticks(riseTable, { slew: 0.002 });
  const riser = voice(BOOT.sweepDuration, { freq: riseFreq, shape: shapes.fm(1, 0.5), amp: env([[0, 0], [0.4, 0.6], [BOOT.sweepDuration - 0.1, 1], [BOOT.sweepDuration, 0]]) });
  const sparkle = shimmer(BOOT.sweepDuration, riseFreq, { chance: 0.25, seed: 71, harmonics: [3, 4, 6] });
  parts.push([lowpass(riser, 2500), 0.2, BOOT.sweepStart], [sparkle, 0.05, BOOT.sweepStart]);
  // A half-size waka for every chip Astra eats, alternating the two bites.
  BOOT.chomps.forEach((at, i) => {
    const table = i % 2 ? CONTOUR.munchB.slice(1, 4) : CONTOUR.munchA.slice(2, 5);
    parts.push([miniMunch(table, { click: i % 2 ? 2900 : 3400, seed: 90 + i }), 0.5, at]);
  });
  parts.push([onlinePing(), 0.9, BOOT.complete]);
  // Covers part: a rising stepped zip over a whoosh.
  const [open, opened] = BOOT.whoosh, span = opened - open;
  parts.push([applyEnv(zip(376, 2445, span), (t) => Math.sin(Math.PI * Math.min(1, t / span))), 0.24, open], [lowpass(whoosh(span, 13), 3500), 0.2, open]);
  parts.push([titleSting(), 1.0, BOOT.sting]);
  const s = echo(layer(parts, duration), { delay: 0.11, feedback: 0.22, wet: 0.14 });
  return byPeak("bootIntro", s, 20);
}

// ---------------------------------------------------------------- menu loop (two candidates)

// A: the siren's wee-oo slowed eightfold and an octave down, as a soft pad over a
// G pedal, with sparse G-pentatonic data blips. Four slow cycles, ~12.7 s.
function menuLoopA() {
  const [lo, hi, period] = CONTOUR.sirens[0], slow = 8;
  const cycle = triangleTable(lo / 2, hi / 2, period);
  const table = repeat(cycle.flatMap((f) => Array(slow).fill(f)), 4);
  const duration = table.length * T;
  const blipGrid = period * T, pent = [79, 81, 83, 86, 88, 91], r = mulberry32(5);
  const blips = [];
  for (let at = blipGrid; at < duration - 0.2; at += blipGrid) if (r() < 0.22) blips.push([at, pent[Math.floor(r() * pent.length)]]);
  const loop = seamlessLoop(duration, table, ({ freq, duration: d }) => {
    const pad = voice(d, { freq, shape: shapes.tri() });
    const air = voice(d, { freq: (t) => freq(t) * 2, shape: shapes.sine() });
    const pedal = voice(d, { freq: noteHz(43), shape: shapes.tri(), amp: (t) => 0.8 + 0.2 * Math.sin(2 * Math.PI * t / duration) });
    const parts = [[lowpass(pad, 1400), 0.5], [air, 0.08], [lowpass(pedal, 600), 0.3]];
    for (let copy = 0; copy < 3; copy++) for (const [at, m] of blips) parts.push([blip(m, 0.09, 1.2), 0.18, copy * duration + at]);
    return echo(layer(parts, d), { delay: blipGrid * 0.75, feedback: 0.35, wet: 0.3, damp: 3500 });
  }, { slew: 0.02 });
  return loudness(loop, LOOP_RMS);
}

// B: a gentle 80 bpm data arpeggio in the intermission's voice over I–vi–IV–V in G.
const MENU_B = { bpm: 80, chords: [[55, 59, 62, 66], [52, 55, 59, 62], [48, 52, 55, 59], [50, 54, 57, 60]], roots: [43, 40, 36, 38] };
function menuLoopB() {
  const sixteenth = 60 / MENU_B.bpm / 4, bar = sixteenth * 16, duration = bar * 4;
  const loop = seamlessLoop(duration, [noteHz(43)], ({ duration: d }) => {
    const parts = [];
    for (let copy = 0; copy < 3; copy++) MENU_B.chords.forEach((chord, b) => {
      const base = copy * duration + b * bar, order = [0, 1, 2, 3, 2, 1];
      for (let i = 0; i < 16; i++) {
        const midi = chord[order[i % order.length]] + 12 + (i >= 12 ? 12 : 0);
        parts.push([blip(midi, 0.16, 0.7), i % 4 ? 0.14 : 0.2, base + i * sixteenth]);
      }
      parts.push([bassNote(MENU_B.roots[b], bar * 0.45), 0.3, base], [bassNote(MENU_B.roots[b] + 7, bar * 0.2), 0.18, base + bar / 2]);
    });
    return echo(layer(parts, d), { delay: sixteenth * 3, feedback: 0.3, wet: 0.25, damp: 4000 });
  });
  return loudness(loop, LOOP_RMS);
}

// ---------------------------------------------------------------- UI

const uiMoveA = () => byPeak("uiMoveA", layer([[blip(91, 0.025, 1.5), 1], [bitClick(4200, 0.003, 31), 0.5]]));
const uiMoveB = () => byPeak("uiMoveB", lowpass(voice(0.045, { freq: noteHz(86), shape: shapes.fm(1, (t) => 0.6 * Math.exp(-t / 0.01)), amp: (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.012) }), 3000), 8);
const uiChange = () => byPeak("uiChange", miniMunch(CONTOUR.munchA.slice(2, 4)));
function twoNote(key, a, b, { index = 1.8, click = 0.35, gap = 0.05 } = {}) {
  const parts = [[blip(a, 0.07, index), 0.8, 0], [blip(b, 0.14, index), 1, gap]];
  if (click) parts.push([bitClick(4400, 0.003, 41), click, 0]);
  return byPeak(key, echo(layer(parts), { delay: 0.06, feedback: 0.2, wet: 0.15, tail: 0.06 }), 10);
}
const uiConfirm = () => twoNote("uiConfirm", 86, 91);
const uiBack = () => twoNote("uiBack", 91, 86, { index: 1.1, click: 0 });
const uiClick = () => byPeak("uiClick", layer([[thump(150, 0.04), 0.9], [bitClick(3000, 0.004, 51), 0.6]]));
function blips(key, notes, step = 0.045, fade = false) {
  const parts = notes.map((m, i) => [blip(m, 0.06, 1.5), fade ? 1 - i * 0.25 : 0.8 + i * 0.1, i * step]);
  return byPeak(key, layer([...parts, [bitClick(4000, 0.003, 61), 0.3]]), 8);
}
const soundOn = () => blips("soundOn", [79, 83, 86]);
const soundOff = () => blips("soundOff", [86, 83, 79], 0.045, true);
function uiBuy() {
  // Ka-ching: the classic coin fourth (B6 → E7) as bright FM bells, with the fruit's sparkle.
  const second = voice(0.32, { freq: noteHz(100), shape: shapes.fm(1, (t) => 2.4 * Math.exp(-t / 0.08) + 0.5), amp: (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.11) });
  const sparkle = applyEnv(shimmer(0.3, () => noteHz(100), { tick: T / 2, chance: 0.6, seed: 23, harmonics: [2, 3] }), (t) => Math.exp(-t / 0.1));
  const s = layer([[blip(95, 0.07, 2.2), 0.8], [second, 0.9, 0.07], [sparkle, 0.15, 0.08], [bitClick(5000, 0.004, 71), 0.35]]);
  return byPeak("uiBuy", echo(s, { delay: 0.07, feedback: 0.3, wet: 0.25, tail: 0.12 }), 12);
}
function uiEquip() {
  // Snap: a click-clack, then a small rising "fits!" glide.
  const clack = (seed) => layer([[applyEnv(highpass(noise(0.012, seed), 1500), (t) => Math.exp(-t / 0.003)), 0.6], [voice(0.012, { freq: 1200, shape: shapes.pulse(0.3), amp: (t) => Math.exp(-t / 0.004) }), 0.4]]);
  const glide = voice(0.08, { freq: (t) => noteHz(86 + 5 * Math.min(1, t / 0.05)), shape: shapes.fm(1, 1), amp: (t) => Math.min(1, t / 0.003) * Math.exp(-t / 0.035) });
  return byPeak("uiEquip", layer([[clack(81), 1, 0], [clack(82), 0.8, 0.028], [glide, 0.7, 0.05]]), 8);
}
function loadout(key, steps, glideTo) {
  // The power-up's "equip" steps, shortened.
  const stepLen = 0.04, glide = 0.05, n = steps.length, duration = n * stepLen + glide + 0.06;
  const freq = (t) => { const i = Math.floor(t / stepLen); return i < n ? noteHz(steps[i]) : noteHz(steps[n - 1] + (glideTo - steps[n - 1]) * Math.min(1, (t - n * stepLen) / glide)); };
  const s = layer([[voice(duration, { freq, shape: shapes.pulse(0.25) }), 0.3], [voice(duration, { freq, shape: shapes.fm(1, (t) => 1.1 * Math.exp(-(t % stepLen) / 0.02) + 0.2) }), 0.55]]);
  return byPeak(key, applyEnv(lowpass(s, 9000), env([[0, 0], [0.002, 1], [n * stepLen + glide, 0.85], [duration, 0]])), 8);
}
const uiLoadoutAdd = () => loadout("uiLoadoutAdd", [84, 88], 91);
const uiLoadoutRemove = () => loadout("uiLoadoutRemove", [88, 84], 79);
function uiDenied() {
  // Threat palette: two crushed square blips a tritone apart.
  const hit = (midi) => voice(0.06, { freq: noteHz(midi), shape: shapes.pulse(0.5), amp: env([[0, 0], [0.002, 1], [0.05, 0.8], [0.06, 0]]) });
  const s = layer([[hit(67), 1, 0], [hit(61), 1, 0.085]]);
  return byPeak("uiDenied", lowpass(decimate(crush(s, 4), 3), 4000), 6);
}
function tally() {
  // Numbers counting in: ticks that speed up and climb in arcade frame steps, resolving on the online ping.
  const parts = [];
  let at = 0;
  for (let i = 0; i < 16; i++) { parts.push([blip(79 + Math.floor(i / 2), 0.03, 1.4), 0.55, at]); at += 0.07 - i * 0.0028; }
  parts.push([onlinePing(), 1, at + 0.04]);
  return byPeak("tally", echo(layer(parts), { delay: 0.09, feedback: 0.2, wet: 0.15, tail: 0.1 }), 20);
}
function levelUp() {
  // boot-03-style: G–B–D–G up quickly, then a held G with bells over a G bass.
  const parts = [[67, 0], [71, 0.06], [74, 0.12]].map(([m, at]) => [leadNote(m, 0.055), 0.75, at]);
  parts.push([leadNote(79, 0.4, { bell: 0.45 }), 0.9, 0.18], [bassNote(43, 0.5), 0.4, 0.18], [bitClick(4800, 0.004, 91), 0.3, 0.18]);
  for (let i = 0; i < 6; i++) parts.push([blip([79, 83, 86, 91][i % 4] + 12, 0.04, 1), 0.18 * (1 - i / 7), 0.3 + i * 0.05]);
  return byPeak("levelUp", echo(layer(parts), { delay: 0.11, feedback: 0.25, wet: 0.18, tail: 0.2 }), 20);
}
function achievement() {
  const ping = blip(95, 0.4, 2.6);
  const sparkle = applyEnv(shimmer(0.4, () => noteHz(95), { tick: T / 2, chance: 0.5, seed: 29, harmonics: [2, 3] }), (t) => Math.exp(-t / 0.15));
  return byPeak("achievement", echo(layer([[ping, 1], [sparkle, 0.15], [bitClick(5200, 0.004, 99), 0.3]]), { delay: 0.12, feedback: 0.38, wet: 0.35, tail: 0.45 }), 30);
}
function gameOver() {
  // The home motif falls in G minor and degrades like death; then a clean, soft
  // low G settles underneath once the glitching stops.
  const notes = [[0, 79], [0.24, 74], [0.48, 70], [0.72, 67]], duration = 2.1, motifEnd = 1.05, parts = [];
  for (const [at, midi] of notes) parts.push([leadNote(midi, 0.2, { bell: 0.2 }), 0.8, at]);
  parts.push([bassNote(43, 0.9), 0.5, 0]);
  const decay = (t) => Math.min(1, t / 0.96);
  const motif = lowpass(decimate(crush(layer(parts, motifEnd), (t) => 10 - 5.5 * decay(t)), (t) => 1 + 5 * decay(t) ** 1.4), (t) => 7000 - 5000 * decay(t));
  const low = voice(1.15, { freq: noteHz(55), shape: shapes.tri(), amp: env([[0, 0], [0.03, 1], [1.15, 0]]) });
  const s = layer([[applyEnv(motif, env([[0, 1], [motifEnd - 0.08, 1], [motifEnd, 0]])), 1], [bassNote(31, 1.05), 0.5, 0.96], [lowpass(low, 800), 0.35, 0.96]], duration);
  return byPeak("gameOver", applyEnv(echo(s, { delay: 0.12, feedback: 0.25, wet: 0.18 }), env([[0, 1], [duration - 0.4, 1], [duration, 0]])), 20);
}

// ---------------------------------------------------------------- warnings and multiplayer

function alarm() {
  // Danger close (the SUNSET glitch, the closing arena): a crushed two-tone klaxon in the threat palette.
  const hit = (midi, at) => [voice(0.11, { freq: noteHz(midi), shape: shapes.pulse(0.5), amp: env([[0, 0], [0.003, 1], [0.09, 0.7], [0.11, 0]]) }), 1, at];
  const s = layer([hit(76, 0), hit(70, 0.14), hit(76, 0.28), hit(70, 0.42)]);
  return byPeak("alarm", lowpass(decimate(crush(s, 5), 2), 5000), 6);
}
function victory() {
  // A human wins the arena: the level-up run carried on to a held high G chord, bells ringing out.
  const parts = [[67, 0], [71, 0.08], [74, 0.16], [79, 0.24]].map(([m, at]) => [leadNote(m, 0.07), 0.75, at]);
  parts.push([leadNote(83, 0.7, { bell: 0.5 }), 0.85, 0.34], [leadNote(79, 0.7, { bell: 0.3 }), 0.45, 0.34], [bassNote(43, 0.8), 0.45, 0.34], [bitClick(4800, 0.004, 93), 0.3, 0.34]);
  for (let i = 0; i < 8; i++) parts.push([blip([79, 83, 86, 91][i % 4] + 12, 0.04, 1), 0.16 * (1 - i / 9), 0.44 + i * 0.06]);
  return byPeak("victory", echo(layer(parts), { delay: 0.12, feedback: 0.3, wet: 0.22, tail: 0.3 }), 30);
}
function readyUp() {
  // A player readies up in the lobby: three quick rising blips and a click.
  return blips("readyUp", [79, 86, 91], 0.035);
}

// ---------------------------------------------------------------- catalogue

// [id, render, loop, section, intent, installAs (for A/B candidates)]
const CLIPS = [
  ["bootIntro", bootIntro, false, "boot", `The boot press to the title, in time with the loading screen: power-on thump and hum; a half-size waka for each of the ${BOOT.chomps.length} chips Astra eats, over the siren's rise stretched across the bar; the boot's "online" ping at 100%; a stepped zip and whoosh as the covers part; the title sting.`],
  ["titleSting", titleSting, false, "boot", "boot-03's opening G–D–G, an octave up and quick, landing on a held G with bells. Plays at the end of the intro, if you skip it, and when a game-over returns to the title."],
  ["menuLoopA", menuLoopA, true, "menu", "Candidate A for the title/profile loop: the siren's wee-oo slowed eightfold and an octave down as a soft pad, a G pedal, and sparse data blips. The machine idling. 12.7 s.", "menuLoop"],
  ["menuLoopB", menuLoopB, true, "menu", "Candidate B: a gentle 80 bpm data arpeggio (G–Em–C–D) in the intermission's blip voice with a soft bass. More musical. 12 s.", "menuLoop"],
  ["uiMoveA", uiMoveA, false, "menu", "Cursor up/down, candidate A: a crisp 25 ms bell tick with a bit-click.", "uiMove"],
  ["uiMoveB", uiMoveB, false, "menu", "Cursor up/down, candidate B: a softer, rounder tick with no click.", "uiMove"],
  ["uiChange", uiChange, false, "menu", "Left/right on players, mode or maze, and profile tabs: a two-frame waka, a tiny chomp."],
  ["uiConfirm", uiConfirm, false, "menu", "Open the profile / pick an item: rising D6→G6 bells with a click."],
  ["uiBack", uiBack, false, "menu", "Close / back: the same bells falling G6→D6, softer."],
  ["uiClick", uiClick, false, "buttons", "PAUSE, MENU, FULLSCREEN, SHOW PAD and BACKDROP: a low thump with a bit-click."],
  ["soundOn", soundOn, false, "buttons", "Sound switched on: three rising blips (G–B–D)."],
  ["soundOff", soundOff, false, "buttons", "Sound switched off: the same blips falling and fading; muting waits for it (0.15 s)."],
  ["uiBuy", uiBuy, false, "shop", "Unlock / buy: a 'ka-ching' coin fourth (B6→E7) in FM bells with the fruit's sparkle."],
  ["uiEquip", uiEquip, false, "shop", "Wear an accessory: a click-clack snap and a small rising 'fits!' glide."],
  ["uiLoadoutAdd", uiLoadoutAdd, false, "shop", "Add a power-up to the loadout: the power-up pickup's steps, shortened, going up."],
  ["uiLoadoutRemove", uiLoadoutRemove, false, "shop", "Remove from the loadout: the same steps going down."],
  ["uiDenied", uiDenied, false, "shop", "Can't afford it: two crushed square blips a tritone apart (the threat palette)."],
  ["tally", tally, false, "results", "Quit outro: ticks that speed up and climb as the score, XP and credits count in, resolving on the online ping."],
  ["levelUp", levelUp, false, "results", "Level up during the outro: boot-03's G–B–D–G up quickly, then a held G with bells."],
  ["achievement", achievement, false, "results", "Achievement unlocked during the outro: a single bright ping with a long echo."],
  ["alarm", alarm, false, "results", "Danger close: the SUNSET glitch nearly on you, or the Versus arena starting to close. A crushed two-tone klaxon."],
  ["victory", victory, false, "results", "A human wins Versus Arena: the level-up run carried on to a held high chord with bells."],
  ["readyUp", readyUp, false, "menu", "A player readies up in the multiplayer lobby: three quick rising blips."],
  ["gameOver", gameOver, false, "results", "Game over: the home motif falls in G minor (G–D–B♭–G) and degrades the way death does, settling on a soft low G."],
];
const SECTIONS = [
  ["boot", "Boot and title"], ["menu", "Title menu"], ["buttons", "Buttons under the game"], ["shop", "Profile shop"], ["results", "Run results"],
];

// ---------------------------------------------------------------- montages

// Mixed like audio.js: a bed channel and a UI channel (a new sound replaces the
// previous one on its channel, with 3 ms ramps), both at the 0.65 master.
function montage(clips, events, duration) {
  const out = new Float32Array(frames(duration)), channels = {}, voices = [];
  for (const [channel, key, at] of [...events].sort((a, b) => a[2] - b[2])) {
    if (channels[channel]) channels[channel].end = Math.min(channels[channel].end, frames(at));
    if (!key) continue;
    const loop = key.startsWith("menuLoop"), samples = clips[key];
    const v = { samples, loop, start: frames(at), end: loop ? Infinity : frames(at) + samples.length };
    channels[channel] = v; voices.push(v);
  }
  for (const v of voices) {
    const end = Math.min(out.length, v.end);
    for (let i = v.start; i < end; i++) {
      const j = i - v.start, s = v.loop ? v.samples[j % v.samples.length] : v.samples[j];
      if (s === undefined) break;
      const fadeIn = v.loop ? Math.min(1, j / frames(1.2)) : 1; // the loop fades in under the sting
      out[i] += s * 0.65 * fadeIn * Math.min(1, (end - i) / frames(0.003));
    }
  }
  return out;
}
function launchEvents(v) {
  const m = "uiMove" + v, e = [["ui", "bootIntro", 0], ["bed", "menuLoop" + v, BOOT.menuBed]];
  for (const [at, key] of [[7.0, m], [7.35, m], [7.7, "uiChange"], [8.05, "uiChange"], [8.6, m], [9.1, "uiConfirm"], [9.8, "uiChange"],
    [10.3, m], [10.65, m], [11.1, "uiBuy"], [12.0, "uiEquip"], [12.7, m], [13.2, "uiDenied"], [14.0, "uiLoadoutAdd"], [14.8, "uiBack"], [15.6, "uiClick"]]) e.push(["ui", key, at]);
  return e;
}
const MONTAGES = [
  ["launch-A", "First launch with loop A and tick A", launchEvents("A"), 17.5],
  ["launch-B", "First launch with loop B and tick B", launchEvents("B"), 17.5],
  ["run-ends", "A run ends: game over, back to the title; then quitting a run (MENU click, tally, level-up, achievement)",
    [["ui", "gameOver", 0], ["ui", "titleSting", 3.4], ["bed", "menuLoopA", 4.2], ["ui", "uiClick", 8.0], ["bed", null, 8.0],
      ["ui", "tally", 8.1], ["ui", "levelUp", 9.2], ["ui", "achievement", 9.7], ["ui", "titleSting", 13.6], ["bed", "menuLoopA", 14.4]], 17.5],
];

// ---------------------------------------------------------------- checks and main

function checkClip(id, samples, loop) {
  const r = { id, duration: samples.length / RATE, rms: kit.rms(samples), peak: kit.peak(samples), problems: [] };
  if (r.peak > 0.99) r.problems.push(`peak ${r.peak.toFixed(3)}`);
  if (loop) {
    r.seam = Math.abs(samples[0] - samples[samples.length - 1]);
    const n = samples.length, cycles = [0, 1, 2, 3].map((i) => kit.rms(samples, Math.floor(i * n / 4), Math.floor((i + 1) * n / 4)));
    r.cycleRatio = Math.max(...cycles) / Math.min(...cycles);
    if (r.seam >= 0.04) r.problems.push(`loop seam ${r.seam.toFixed(3)}`);
    if (r.cycleRatio >= 1.25) r.problems.push(`loop quarters differ ${r.cycleRatio.toFixed(2)}x in loudness`);
  }
  return r;
}
function checkSync() {
  const problems = [];
  if (BOOT.chomps.length !== BOOT.chips.length - 1) problems.push(`expected every chip but the last to be eaten, got ${BOOT.chomps.length}/${BOOT.chips.length}`);
  if (BOOT.chomps.some((t) => t < BOOT.sweepStart || t > BOOT.sweepStart + BOOT.sweepDuration)) problems.push("a chomp falls outside the sweep");
  if (!(BOOT.complete < BOOT.whoosh[0] && BOOT.whoosh[1] <= BOOT.sting + 0.2)) problems.push("boot timeline events out of order");
  if (BOOT.covers[1] !== BOOT.end || BOOT.reveal > BOOT.covers[0]) problems.push("the covers must finish opening as the boot sound ends");
  return problems;
}

function main() {
  const rendered = {}, reports = [];
  for (const [id, render, loop] of CLIPS) { rendered[id] = render(); reports.push(checkClip(id, rendered[id], loop)); }
  for (const r of reports) {
    const bits = [`${r.id.padEnd(16)} ${r.duration.toFixed(3)} s  rms ${r.rms.toFixed(3)}  peak ${r.peak.toFixed(3)}`];
    if (r.seam !== undefined) bits.push(`seam ${r.seam.toFixed(4)} quarters ${r.cycleRatio.toFixed(3)}`);
    if (r.problems.length) bits.push("PROBLEM: " + r.problems.join("; "));
    console.log(bits.join("  "));
  }
  const sync = checkSync();
  console.log(`boot sync: ${BOOT.chomps.length} chomps at ${BOOT.chomps.map((t) => t.toFixed(2)).join(" ")}${sync.length ? "  PROBLEM: " + sync.join("; ") : ""}`);
  const failed = reports.filter((r) => r.problems.length).length + (sync.length ? 1 : 0);
  if (process.argv.includes("--check")) { if (failed) process.exitCode = 1; return; }
  if (process.argv.includes("--install")) {
    // Candidates install under their game name; pass the picks as --pick=menuLoopA,uiMoveA.
    const picks = (process.argv.find((a) => a.startsWith("--pick=")) || "").slice(7).split(",").filter(Boolean);
    if (failed) { console.error("checks failed; nothing installed"); process.exitCode = 1; return; }
    // --only=alarm,victory installs just those clips and leaves the rest untouched.
    const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
    for (const [id, , , , , installAs] of CLIPS) {
      if (installAs && !picks.includes(id)) continue;
      if (only.length && !only.includes(id)) continue;
      fs.writeFileSync(path.join(AUDIO, (installAs || id) + ".wav"), kit.wavBytes(rendered[id]));
    }
    console.log(`installed in ${AUDIO}; now run python scripts/build-audio.py`);
    return;
  }

  fs.mkdirSync(path.join(OUT, "clips"), { recursive: true });
  for (const [id] of CLIPS) fs.writeFileSync(path.join(OUT, "clips", id + ".wav"), kit.wavBytes(rendered[id]));
  const montageFiles = {};
  for (const [id, , events, duration] of MONTAGES) {
    const mixed = montage(rendered, events, duration);
    fs.writeFileSync(path.join(OUT, `montage-${id}.wav`), kit.wavBytes(mixed));
    montageFiles[id] = `montage-${id}.wav`;
    console.log(`montage ${id}: peak ${kit.peak(mixed).toFixed(3)}`);
  }
  const report = (id) => reports.find((r) => r.id === id);
  const pairs = { menuLoopA: "menuLoop", menuLoopB: "menuLoop", uiMoveA: "uiMove", uiMoveB: "uiMove" };
  const sections = [{
    heading: "In context",
    lede: "Three stretches of the game, mixed the way the game mixes them. The two first-launch runs are identical except for the A/B candidates, so compare those first.",
    players: MONTAGES.map(([id, label]) => ({ label, file: montageFiles[id] })),
  }];
  for (const [key, heading] of SECTIONS) {
    const rows = [];
    for (const [id, , loop, section, intent] of CLIPS) {
      if (section !== key || (pairs[id] && id.endsWith("B"))) continue;
      if (pairs[id]) {
        const b = id.slice(0, -1) + "B";
        rows.push({ id: pairs[id], intent: `${intent} ${CLIPS.find((c) => c[0] === b)[4]}`, badge: `${report(id).duration.toFixed(2)} s / ${report(b).duration.toFixed(2)} s`,
          players: [{ label: "Candidate A", file: `clips/${id}.wav`, loop }, { label: "Candidate B", file: `clips/${b}.wav`, loop }],
          options: [["A", "Pick A"], ["B", "Pick B"], ["revise", "Revise both"]] });
      } else {
        rows.push({ id, intent, badge: `${report(id).duration.toFixed(2)} s`, players: [{ label: "Astra", file: `clips/${id}.wav`, loop }],
          options: [["keep", "Keep"], ["revise", "Revise"], ["cut", "Cut"]] });
      }
    }
    sections.push({ heading, rows });
  }
  fs.writeFileSync(path.join(OUT, "index.html"), auditionPage({
    heading: "Astra-Man · Boot, menu and UI sounds",
    lede: "The boot intro, the title loop and every menu, button, shop and results sound, built from the same voices as the gameplay set: G major, boot-03's home motif, FM bells and bit-clicks for the player, crushed glitches for trouble. Two sounds have A/B candidates (the menu loop and the cursor tick) because you'll hear them most. Loops repeat in the player.",
    storageKey: "astra-audio-ui-verdicts", verdictTitle: "Astra UI verdicts", sections,
  }));
  fs.writeFileSync(path.join(OUT, "recipes.json"), JSON.stringify({
    generatedBy: "scripts/generate-astra-ui-audio.js", sampleRate: RATE, bootTimeline: BOOT, peaks: PEAK, loopRms: LOOP_RMS, menuB: MENU_B, boot03: BOOT03,
    clips: reports.map(({ problems, ...r }) => r),
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "README.md"), `# Astra-Man boot, menu and UI sounds (audition)

Open \`index.html\` to listen and give a verdict per sound; "Copy my verdicts" copies them for the chat. Not yet integrated into the game.

- \`bootIntro\` follows \`boot-timeline.js\`, which the loading screen will also use, so each chomp lands on a chip.
- \`menuLoop\` and \`uiMove\` have A/B candidates; the others are single.
- \`montage-*.wav\`: a first launch with each A/B set, and a run ending (game over, then quitting with the results tally).
- Mono, 44.1 kHz, PCM16. Rebuild with \`node scripts/generate-astra-ui-audio.js\`.
`);
  console.log(`wrote ${OUT}`);
  if (failed) { console.error(`${failed} check(s) failed`); process.exitCode = 1; }
}

if (require.main === module) main();
else module.exports = { CLIPS };
