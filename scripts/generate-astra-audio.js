"use strict";

// Astra-Man sound set v2. Every gameplay sound keeps the arcade original's
// per-frame pitch contour and rhythm (measured from assets/audio/reference with
// kit.tickPitches) and replaces only the timbre. Player sounds are friendly and
// bright; threat sounds are glitchy. The boot and intermission are original music.
//
//   node scripts/generate-astra-audio.js            audition set in outputs/astra-audio-v2
//   node scripts/generate-astra-audio.js --check    contour/loop checks only
//   node scripts/generate-astra-audio.js --install  write the game's clips to assets/audio,
//                                                    then run python scripts/build-audio.py
const fs = require("node:fs");
const path = require("node:path");
const kit = require("./audio-kit.js");
const {
  RATE, TICK, frames, noteHz, env, ticks, ramp, repeat, triangleTable, shapes, voice, noise, layer,
  applyEnv, crush, decimate, lowpass, highpass, echo, stutter, seamlessLoop, loudness, fadeEdges,
} = kit;

const { bitClick, shimmer, leadNote, bassNote, blip, hat, BOOT03 } = require("./astra-voices.js");
const { auditionPage, contourSvg } = require("./audition-page.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "outputs", "astra-audio-v2");
const AUDIO = path.join(ROOT, "assets", "audio");
const REFERENCE = path.join(AUDIO, "reference");
// The arcade recordings are not distributed (see scripts/AUDIO.md). Without them the
// contour check and the "original" audition players are skipped; the sounds themselves
// are built from CONTOUR and need nothing external.
const HAVE_REFERENCE = fs.existsSync(REFERENCE);

// ---------------------------------------------------------------- measured contours (Hz per frame)

const CONTOUR = {
  munchA: [359, 518, 605, 677, 801, 885],
  munchB: [978, 913, 763, 626, 548, 420],
  // [low, high, frames per wee-oo cycle]; four cycles per loop, like the originals.
  sirens: [[388, 926, 24], [490, 1091, 22], [566, 1264, 20], [715, 1431, 18], [857, 1581, 16]],
  frightened: ramp(280, 281.5, 8),
  // Rotated so the loop starts mid-sweep, where the original loop starts.
  returning: [1321, 1180, 1038, 897, 757, 614, 478, 376, 2445, 2304, 2164, 2023, 1880, 1739, 1599, 1457],
  ghost: ramp(162, 46, 29),
  fruit: [515, 470, 423, 377, 329, 282, 235, 189, 142, 96, 80, 91, 139, 186, 233, 281, 327, 374, 421, 468, 515, 562, 609],
  extraLife: 375,
  // Six descending wobbles, then the two rising "bwoop" sweeps.
  death: [724, 704, 680, 657, 634, 656, 680, 704, 726, 749, 774, 681, 657, 634, 610, 586, 563, 586, 608, 632, 656, 680, 703,
    634, 610, 586, 563, 540, 516, 540, 563, 586, 609, 633, 657, 587, 563, 539, 515, 492, 469, 493, 515, 539, 563, 585, 610,
    540, 516, 492, 469, 446, 422, 445, 469, 492, 516, 539, 562, 492, 469, 446, 423, 399, 375, 398, 422,
    ...ramp(187.5, 187.5, 12), ...ramp(187.5, 187.5, 12)],
};

// Loudness as heard in game today (clip RMS x the old per-clip gain), so the new
// set drops in without re-balancing the mix.
const TARGET_RMS = {
  intro: 0.188, intermission: 0.242, death: 0.182, fruit: 0.092, ghost: 0.085, extraLife: 0.093,
  munchA: 0.186, munchB: 0.186, siren0: 0.173, siren1: 0.164, siren2: 0.159, siren3: 0.157, siren4: 0.157,
  frightened: 0.125, returning: 0.17, powerUp: 0.095, zap: 0.1,
};

// ---------------------------------------------------------------- building blocks

const T = TICK;

function finish(key, samples, { fadeIn = 1, fadeOut = 6 } = {}) {
  return loudness(fadeEdges(samples, fadeIn, fadeOut), TARGET_RMS[key]);
}

// ---------------------------------------------------------------- player sounds (friendly)

function munch(key) {
  const table = CONTOUR[key], rising = key === "munchA", duration = 0.1;
  const freq = ticks(table, { slew: 0.002 });
  // Duty opens as the bite progresses: the "mouth" of the waka.
  const core = voice(duration, { freq, shape: shapes.pulse((t) => 0.2 + 0.28 * t / duration) });
  const body = voice(duration, { freq: (t) => freq(t) / 2, shape: shapes.tri() });
  const sparkle = voice(duration, { freq: (t) => freq(t) * 2, shape: shapes.fm(1, 0.8), amp: env([[0, 0.5], [0.05, 0.15], [0.1, 0]]) });
  let bite = layer([[core, 0.62], [body, 0.3], [sparkle, 0.14], [bitClick(rising ? 3400 : 2900, 0.004, rising ? 11 : 12), 0.5]]);
  bite = lowpass(crush(bite, 9), 7000);
  bite = applyEnv(bite, env([[0, 0], [0.0015, 1], [0.082, 0.92], [0.1, 0]]));
  return finish(key, bite, { fadeOut: 2 });
}

function fruit() {
  const tail = 0.14, duration = CONTOUR.fruit.length * T + 0.02;
  const freq = ticks(CONTOUR.fruit, { slew: 0.004 });
  // Ratio-1 FM keeps every harmonic, so the bell stays bright without blurring the pitch.
  const bell = voice(duration, { freq, shape: shapes.fm(1, (t) => 2.4 * Math.exp(-t / 0.15) + 0.8) });
  const edge = voice(duration, { freq, shape: shapes.pulse(0.3) });
  const body = voice(duration, { freq, shape: shapes.tri() });
  // The sparkle blooms after the attack so the swoop's pitch lands first.
  const crystal = applyEnv(shimmer(duration, freq, { tick: T / 2, chance: 0.6, seed: 21, harmonics: [5, 7, 9] }), env([[0, 0], [0.05, 1]]));
  let s = layer([[bell, 0.55], [edge, 0.18], [body, 0.3], [crystal, 0.2], [bitClick(4200, 0.004, 5), 0.35]]);
  s = applyEnv(s, env([[0, 0], [0.003, 1], [duration - 0.04, 0.95], [duration, 0]]));
  s = echo(s, { delay: 0.07, feedback: 0.3, wet: 0.28, tail, damp: 6000 });
  return finish("fruit", s, { fadeOut: 10 });
}

function extraLife() {
  // Confirmation chirps every 12 frames, as in the arcade's steady beeping. Each
  // one decays but keeps sounding into the next, so the tone never drops out.
  const period = 12 * T, count = 10, duration = 1.9, parts = [];
  for (let b = 0; b < count; b++) {
    const chirp = voice(Math.min(period + 0.01, duration - b * period), {
      // Each chirp lands with a tiny upward "ok!" flick into the arcade's pitch.
      freq: (t) => CONTOUR.extraLife * Math.pow(2, (t < 0.012 ? -2 + 2 * t / 0.012 : 0) / 12),
      shape: shapes.fm(2, (t) => 2.2 * Math.exp(-t / 0.035) + 0.9),
      amp: (t) => Math.min(1, t / 0.002) * (0.3 + 0.7 * Math.exp(-t / 0.06)) * Math.min(1, (period + 0.01 - t) / 0.01),
    });
    const tick = bitClick(b % 2 ? 3900 : 3300, 0.003, 30 + b);
    parts.push([chirp, 0.55 + 0.45 * Math.min(1, b / 3), b * period], [tick, 0.25, b * period]);
  }
  const s = echo(layer(parts, duration), { delay: 0.1, feedback: 0.2, wet: 0.16 });
  return finish("extraLife", applyEnv(s, env([[0, 1], [duration - 0.12, 1], [duration, 0]])), { fadeOut: 12 });
}

function powerUp() {
  // "Equip": three quick rising steps, a lock-in glide and a closing click.
  const steps = [84, 88, 91], stepLen = 0.048, glide = 0.09, duration = steps.length * stepLen + glide + 0.12;
  const freq = (t) => {
    const i = Math.floor(t / stepLen);
    if (i < steps.length) return noteHz(steps[i]);
    return noteHz(91 + 12 * Math.min(1, (t - steps.length * stepLen) / glide));
  };
  const lead = voice(duration, { freq, shape: shapes.pulse(0.25) });
  const bell = voice(duration, { freq, shape: shapes.fm(1, (t) => 1.2 * Math.exp(-(t % stepLen) / 0.02) + 0.2) });
  let s = layer([[lead, 0.35], [bell, 0.55], [bitClick(5200, 0.004, 9), 0.4, steps.length * stepLen + glide]]);
  s = applyEnv(s, env([[0, 0], [0.002, 1], [steps.length * stepLen + glide, 0.9], [duration, 0]]));
  s = echo(s, { delay: 0.06, feedback: 0.25, wet: 0.2, tail: 0.08 });
  return finish("powerUp", lowpass(s, 9000), { fadeOut: 10 });
}

// ---------------------------------------------------------------- threat sounds (glitch)

function siren(stage) {
  const [lo, hi, period] = CONTOUR.sirens[stage], table = repeat(triangleTable(lo, hi, period), 4);
  const duration = table.length * T;
  const glitch = stage / 4;
  const loop = seamlessLoop(duration, table, ({ freq, duration: d, tick }) => {
    const core = voice(d, { freq, shape: shapes.fm(1, 0.55 + 0.35 * glitch) });
    const edge = voice(d, { freq, shape: shapes.tri() });
    const data = shimmer(d, freq, { tick, loopTicks: table.length, chance: 0.18 + 0.2 * glitch, seed: 40 + stage, harmonics: [2, 3] });
    let s = layer([[core, 0.55], [edge, 0.45], [data, 0.13 + 0.07 * glitch]]);
    // Pressure rises with the stage: coarser bits and a lower sample rate.
    s = decimate(crush(s, 9 - 3.5 * glitch), Math.round(1 + 2 * glitch));
    // Two poles keep the sample-and-hold images from whining over a long bed.
    return lowpass(lowpass(s, 6500 - 2000 * glitch), 7000 - 2000 * glitch);
  });
  return loudness(loop, TARGET_RMS["siren" + stage]);
}

function frightened() {
  const table = repeat(CONTOUR.frightened, 4), duration = table.length * T, cycle = 8 * T;
  const loop = seamlessLoop(duration, table, ({ freq, duration: d }) => {
    const core = voice(d, { freq, shape: shapes.pulse(0.5) });
    const sub = voice(d, { freq: (t) => freq(t) / 2, shape: shapes.tri() });
    let s = layer([[core, 0.6], [sub, 0.3]]);
    // Each zip corrupts as it rises: the sample rate collapses towards the top.
    s = decimate(s, (t) => 1 + 5 * ((t % cycle) / cycle) ** 2);
    s = crush(s, 6);
    // Every other cycle, the last frame sticks like a stuck buffer.
    for (let c = 1; c < 12; c += 2) s = stutter(s, c * cycle + 7 * T, T / 3, 2);
    return lowpass(s, 7000);
  });
  return loudness(loop, TARGET_RMS.frightened);
}

function returning() {
  const table = repeat(CONTOUR.returning, 4), duration = table.length * T, cycle = 16 * T, packet = 8 * T;
  const loop = seamlessLoop(duration, table, ({ freq, duration: d }) => {
    const core = voice(d, { freq, shape: shapes.fm(1, 1.1) });
    const low = voice(d, { freq: (t) => freq(t) / 2, shape: shapes.tri() });
    // A modem "ack" as every sweep restarts at the top: data coming home.
    const acks = [];
    for (let at = packet; at < d; at += cycle) acks.push([bitClick(4200, 0.004, Math.round(at * 1000)), 0.4, at], [bitClick(5100, 0.003, 3), 0.28, at + 0.012]);
    return echo(layer([[core, 0.62], [low, 0.22], ...acks], d), { delay: 0.045, feedback: 0.2, wet: 0.18 });
  });
  return loudness(loop, TARGET_RMS.returning);
}

function ghostEaten() {
  const duration = CONTOUR.ghost.length * T + 0.03, freq = ticks(CONTOUR.ghost, { slew: 0.002 });
  const core = voice(duration, { freq, shape: shapes.pulse(0.33) });
  const bell = voice(duration, { freq, shape: shapes.fm(1, 0.9) });
  let s = layer([[core, 0.45], [bell, 0.5]]);
  // "Compressed" on capture: crunchy at the bottom, resolving to clean as it uploads.
  const progress = (t) => Math.min(1, t / (CONTOUR.ghost.length * T));
  s = crush(decimate(s, (t) => 1 + 9 * (1 - progress(t)) ** 1.5), (t) => 4 + 6 * progress(t));
  s = layer([[lowpass(s, 8000)], [bitClick(4800, 0.004, 17), 0.3, duration - 0.035]]);
  s = applyEnv(s, env([[0, 0], [0.004, 1], [duration - 0.05, 1], [duration, 0]]));
  return finish("ghost", echo(s, { delay: 0.055, feedback: 0.22, wet: 0.2, tail: 0.06 }), { fadeOut: 10 });
}

function death() {
  const wobble = 67 * T, duration = CONTOUR.death.length * T + 0.04, freq = ticks(CONTOUR.death, { slew: 0.002 });
  const core = voice(duration, { freq, shape: shapes.tri() });
  const edge = voice(duration, { freq, shape: shapes.pulse((t) => 0.5 - 0.35 * Math.min(1, t / wobble)) });
  let s = layer([[core, 0.55], [edge, 0.4]]);
  // Shutdown: bit depth, sample rate and bandwidth collapse across the wobble,
  // then the two sweeps come through clean as a failed reboot.
  const decay = (t) => Math.min(1, t / wobble);
  const broken = lowpass(decimate(crush(s, (t) => 10 - 6.5 * decay(t)), (t) => 1 + 6 * decay(t) ** 1.4), (t) => 8000 - 5500 * decay(t));
  const reboot = voice(duration, { freq, shape: shapes.fm(1, 0.8) });
  const n = s.length, fadeStart = frames(wobble - 0.02), fadeEnd = frames(wobble + 0.01);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = i < fadeStart ? 0 : i >= fadeEnd ? 1 : (i - fadeStart) / (fadeEnd - fadeStart);
    out[i] = broken[i] * (1 - w) * (0.75 + 0.25 * decay(i / RATE)) + reboot[i] * w * 0.85;
  }
  // The second sweep stutters out: the reboot fails.
  let final = stutter(out, (67 + 12 + 9) * T, T / 3, 3);
  final = applyEnv(final, env([[0, 0], [0.004, 1], [duration - 0.05, 1], [duration, 0]]));
  return finish("death", final, { fadeOut: 12 });
}

function zap() {
  // Candidate for ghostZapped/explosion: a crushed laser with a bass thump.
  const duration = 0.34, freq = (t) => 2200 * Math.pow(180 / 2200, Math.min(1, t / 0.28));
  const laser = decimate(crush(voice(duration, { freq, shape: shapes.pulse(0.3) }), 5), 2);
  const thump = voice(duration, { freq: (t) => 110 * Math.exp(-t / 0.08) + 45, shape: shapes.sine(), amp: (t) => Math.exp(-t / 0.07) });
  const burst = applyEnv(highpass(noise(0.05, 99), 1800), (t) => Math.exp(-t / 0.012));
  let s = layer([[laser, 0.5], [thump, 0.7], [burst, 0.4]]);
  s = applyEnv(s, env([[0, 0], [0.002, 1], [0.26, 0.7], [duration, 0]]));
  return finish("zap", s, { fadeOut: 10 });
}

// ---------------------------------------------------------------- music

function boot() {
  const shift = 0.3, duration = 4.18, parts = [];
  // Handshake: three packet blips spelling the home chord, into the first note.
  [[0, 79], [0.085, 86], [0.17, 91]].forEach(([at, m], i) => parts.push([blip(m, 0.06), 0.4, at], [bitClick(3600 + 500 * i, 0.003, 60 + i), 0.25, at]));
  for (const [at, midi, length, gain] of BOOT03.lead) parts.push([leadNote(midi, length, { bell: length > 0.3 ? 0.35 : 0.25 }), gain * 0.9, at + shift]);
  for (const [at, midi, length, gain] of BOOT03.bass) parts.push([bassNote(midi, length), gain * 1.1, at + shift]);
  // Ready chord: a soft G major pad under the final note, then a shimmering
  // arpeggio that thins out, and the "online" ping.
  const padStart = 2.17 + shift, padLen = 1.45;
  for (const m of [55, 59, 62, 67]) {
    const pad = voice(padLen, { freq: noteHz(m) * (m % 2 ? 1.002 : 0.998), shape: shapes.pulse(0.5), amp: env([[0, 0], [0.08, 1], [0.7, 0.7], [padLen, 0]]) });
    parts.push([lowpass(pad, 2200), 0.12, padStart]);
  }
  parts.push([bassNote(31, 1.3), 0.4, padStart]);
  const arp = [79, 83, 86, 91], step = 0.055;
  for (let i = 0; i < 14; i++) parts.push([blip(arp[i % 4], 0.05, 1.2), 0.3 * (1 - i / 16), 2.72 + i * step]);
  parts.push([blip(91, 0.42, 2.4), 0.55, 3.62], [blip(98, 0.3, 1.2), 0.22, 3.64], [bitClick(5200, 0.004, 77), 0.3, 3.62]);
  const s = echo(layer(parts, duration), { delay: 0.11, feedback: 0.28, wet: 0.2 });
  return finish("intro", applyEnv(s, env([[0, 1], [duration - 0.25, 1], [duration, 0]])), { fadeOut: 20 });
}

// Original intermission: 138 bpm, six bars (10.43 s). A bouncing octave bass and
// call-and-response between the lead and the AI's echo blips. Nods to Coffee
// Break's mood and length only; no notes are borrowed.
const INTERMISSION = {
  bpm: 138,
  // One row per bar: eight eighth-notes, null = rest.
  melody: [
    [76, null, 79, 76, 72, null, 74, 76],
    [81, null, 79, 76, 74, null, 72, null],
    [77, null, 81, 77, 72, null, 74, 77],
    [79, null, 77, 74, 71, null, 67, null],
    [72, 76, 79, 84, null, 81, null, 76],
    [77, 81, null, 79, 83, null, 84, null],
  ],
  // Bass root per eighth pair (four per bar).
  roots: [[48, 48, 48, 48], [45, 45, 45, 45], [41, 41, 41, 41], [43, 43, 43, 43], [48, 48, 45, 45], [41, 43, 48, 48]],
};
function intermission() {
  const eighth = 60 / INTERMISSION.bpm / 2, duration = 10.44, parts = [];
  let previous = null;
  INTERMISSION.melody.forEach((bar, b) => bar.forEach((midi, i) => {
    const at = (b * 8 + i) * eighth, last = b === 5 && i === 6;
    if (midi === null) {
      // The machine answers in the gaps, echoing the lead an octave up.
      if (previous !== null && b < 5) parts.push([blip(previous + 12, 0.07, 1.6), 0.32, at + 0.02]);
      return;
    }
    const legato = bar[i + 1] === null;
    const length = last ? eighth * 2.4 : eighth * (legato ? 1.5 : 0.8);
    parts.push([leadNote(midi, length, { bell: last ? 0.4 : 0.22 }), 0.62, at]);
    previous = midi;
  }));
  INTERMISSION.roots.forEach((roots, b) => roots.forEach((root, q) => {
    for (let h = 0; h < 2; h++) {
      const at = (b * 8 + q * 2 + h) * eighth, lastBar = b === 5 && q >= 2;
      if (lastBar && h) continue;
      parts.push([bassNote(root - 12 + 12 * h, eighth * (lastBar ? 1.8 : 0.55)), 0.45, at]);
    }
  }));
  for (let e = 1; e < 45; e += 2) parts.push([hat(200 + e), 0.09, e * eighth]);
  // Closing chord hit under the final note.
  for (const m of [60, 64, 67, 72]) parts.push([blip(m + 12, 0.5, 1), 0.14, 44 * eighth]);
  const s = echo(layer(parts, duration), { delay: eighth * 1.5, feedback: 0.22, wet: 0.14 });
  return finish("intermission", applyEnv(s, env([[0, 1], [duration - 0.3, 1], [duration, 0]])), { fadeOut: 20 });
}

// ---------------------------------------------------------------- catalogue

// id: [render, loop, reference clip (for contour/loudness), v1 file, intent]
const CLIPS = [
  ["intro", boot, false, "intro", "boot-03-confident-fanfare.wav", "Boot. boot-03's notes and timing, rebuilt: a handshake pickup, a pulse lead with an octave bell, and a G-major ready chord ending on an 'online' ping. Ends at 4.18 s, so READY timing is unchanged."],
  ["munchA", () => munch("munchA"), false, "munchA", "munch-a.wav", "Bite A. The waka's rising half (360→885 Hz in six frames): an opening pulse 'mouth', a sub body and a tiny bit-click."],
  ["munchB", () => munch("munchB"), false, "munchB", "munch-b.wav", "Bite B. The falling half (980→420 Hz). Same voice, so the pair reads as one chomp."],
  ...[0, 1, 2, 3, 4].map((s) => [`siren${s}`, () => siren(s), true, `siren${s}`, `chase-${s}.wav`,
    `Siren ${s + 1}. The arcade wee-oo (${CONTOUR.sirens[s][0]}↔${CONTOUR.sirens[s][1]} Hz, ${CONTOUR.sirens[s][2]}-frame cycle) as an FM core with a data shimmer. Bits and sample rate drop as the stage rises: the machine under pressure.`]),
  ["frightened", frightened, true, "frightened", "frightened.wav", "Frightened. Rising zips 280→2250 Hz. Each zip corrupts towards the top, and every other one sticks like a stuck buffer."],
  ["returning", returning, true, "returning", "returning.wav", "Returning eyes. Falling sweeps 2450→375 Hz in a clean FM voice, with a modem 'ack' on every restart: data going home."],
  ["ghost", ghostEaten, false, "ghost", "ghost-eat.wav", "Ghost eaten. The rising capture sweep (160→1450 Hz), crunchy at the bottom and resolving to clean: the ghost gets compressed and uploaded."],
  ["fruit", fruit, false, "fruit", "fruit.wav", "Fruit / artifact. The down-then-up swoop as a glassy FM bell with crystal sparkle and a short echo."],
  ["extraLife", extraLife, false, "extraLife", "extra-life.wav", "Extra life. The arcade's steady 375 Hz beeps as ten friendly FM chirps with a small 'ok!' flick and a build-up."],
  ["death", death, false, "death", "death.wav", "Death. The six descending wobbles decay as bits, sample rate and bandwidth collapse. The two bwoops return clean as a reboot that stutters out."],
  ["intermission", intermission, false, "intermission", "neural-break.wav", "Intermission. An original 138 bpm tune (not Coffee Break's melody): bouncing octave bass, and the AI answering the lead with echo blips. 10.44 s."],
  ["powerUp", powerUp, false, null, null, "NEW: REMIX power-up pickup. Three quick rising steps, a lock-in glide and a click. Clearly different from fruit."],
  ["zap", zap, false, null, null, "CANDIDATE: ghostZapped / explosion. A crushed laser with a bass thump. Goes into the game only if you pick it; otherwise these events keep the ghost-eaten sound."],
];

// Contour checks exclude the music, where the notes are new on purpose.
const CONTOUR_CHECKED = new Set(["munchA", "munchB", "siren0", "siren1", "siren2", "siren3", "siren4", "frightened", "returning", "ghost", "fruit", "extraLife", "death"]);
const MIN_MATCH = 0.85;

// ---------------------------------------------------------------- original clips (trim rules from build-audio.py)

const SHOTS = { intro: "start-music", intermission: "coffee-break-music", death: "miss", fruit: "eating-fruit", ghost: "eating-ghost", extraLife: "extend" };
const SLICES = {
  munchA: ["eating", 131340, 135740], munchB: ["eating", 137940, 142340],
  siren0: ["ghost-normal-move", 140060, 210040], siren1: ["ghost-spurt-move-1", 143164, 207224],
  siren2: ["ghost-spurt-move-2", 149275, 207528], siren3: ["ghost-spurt-move-3", 169354, 221769],
  siren4: ["ghost-spurt-move-4", 168287, 214901], frightened: ["ghost-turn-to-blue", 216205, 239644],
  returning: ["ghost-return-to-home", 170130, 216749],
};
function originalClip(key) {
  if (SLICES[key]) {
    const [name, start, end] = SLICES[key];
    // Loops drop the 88-frame head that build-audio.py crossfades into the tail.
    const loop = key.startsWith("siren") || key === "frightened" || key === "returning";
    return kit.readWav(path.join(REFERENCE, name + ".wav")).slice(start + (loop ? 88 : 0), end);
  }
  const data = kit.readWav(path.join(REFERENCE, SHOTS[key] + ".wav"));
  let first = -1, last = -1;
  for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > 98 / 32768) { if (first < 0) first = i; last = i; }
  return data.slice(Math.max(0, first - 132), Math.min(data.length, last + 221));
}

// ---------------------------------------------------------------- checks

function checkClip(id, samples, loop, refKey) {
  const report = { id, duration: samples.length / RATE, rms: kit.rms(samples), peak: kit.peak(samples), problems: [] };
  if (report.peak > 0.99) report.problems.push(`peak ${report.peak.toFixed(3)}`);
  if (loop) {
    report.seam = Math.abs(samples[0] - samples[samples.length - 1]);
    const n = samples.length, cycles = [0, 1, 2, 3].map((i) => kit.rms(samples, Math.floor(i * n / 4), Math.floor((i + 1) * n / 4)));
    report.cycleRatio = Math.max(...cycles) / Math.min(...cycles);
    if (report.seam >= 0.04) report.problems.push(`loop seam ${report.seam.toFixed(3)}`);
    if (report.cycleRatio >= 1.12) report.problems.push(`cycle loudness ratio ${report.cycleRatio.toFixed(3)}`);
  }
  if (refKey && HAVE_REFERENCE && CONTOUR_CHECKED.has(id)) {
    const ref = kit.tickPitches(originalClip(refKey)), test = kit.tickPitches(samples);
    report.contour = { ...kit.contourMatch(ref, test, { circular: loop }), ref, test };
    if (report.contour.within < MIN_MATCH) report.problems.push(`contour only ${(report.contour.within * 100).toFixed(0)}% within a semitone`);
  }
  return report;
}

// ---------------------------------------------------------------- montage

// ~24 s of play on one timeline, mixed the way audio.js does it: one bed, one
// effect channel (higher priority wins while playing), a bonus channel, master 0.65.
const MONTAGE = (() => {
  const events = [["bed", "intro", 0]], chomp = (from, to, every = 0.135) => { for (let t = from; t < to; t += every) events.push(["munch", null, t]); };
  events.push(["bed", "siren0", 4.2]); chomp(4.3, 6.4); chomp(6.9, 8.2);
  events.push(["bed", "siren1", 7.4]);
  events.push(["effect", "munchA", 8.4], ["bed", "frightened", 8.4]); chomp(8.55, 9.6);
  events.push(["effect", "ghost", 9.7], ["bed", null, 9.7], ["bed", "returning", 10.25]); chomp(10.3, 11.8);
  events.push(["bed", "frightened", 11.9]); chomp(12.0, 12.9);
  events.push(["bed", "siren2", 13.0]); chomp(13.1, 14.6);
  events.push(["effect", "fruit", 14.7]); chomp(15.2, 16.4);
  events.push(["effect", "powerUp", 16.5], ["bonus", "extraLife", 17.3]); chomp(17.0, 18.8);
  events.push(["bed", "siren4", 18.9]); chomp(19.0, 20.3);
  events.push(["effect", "zap", 20.4]); chomp(20.8, 21.4);
  events.push(["stop", null, 21.6], ["effect", "death", 21.6]);
  return { events, duration: 23.4 };
})();
const PRIORITY = { munchA: 1, munchB: 1, fruit: 2, powerUp: 2, ghost: 3, zap: 3, death: 4 };
const OLD_GAIN = { fruit: 1.5, ghost: 1.5, death: 1.8, extraLife: 0.9 };

function montage(clips, gains, substitute = {}) {
  const out = new Float32Array(frames(MONTAGE.duration)), channels = {};
  let waka = 0;
  const cut = (ch, at) => { if (channels[ch]) channels[ch].end = Math.min(channels[ch].end, frames(at)); };
  const voices = [];
  const events = [...MONTAGE.events].sort((a, b) => a[2] - b[2]);
  for (let [channel, key, at] of events) {
    if (channel === "stop") { for (const ch of Object.keys(channels)) cut(ch, at); continue; }
    if (channel === "munch") { channel = "effect"; key = waka++ % 2 ? "munchB" : "munchA"; }
    key = substitute[key] || key;
    const start = frames(at), current = channels[channel];
    if (channel === "effect" && current && current.end > start && (PRIORITY[current.key] || 0) > (PRIORITY[key] || 0)) continue;
    cut(channel, at);
    if (!key) { delete channels[channel]; continue; }
    const samples = clips[key], loop = channel === "bed" && !["intro"].includes(key);
    const v = { key, samples, start, end: loop ? Infinity : start + samples.length, loop, gain: (gains[key] || 1) * 0.65 };
    channels[channel] = v; voices.push(v);
  }
  for (const v of voices) {
    const end = Math.min(out.length, v.end);
    for (let i = v.start; i < end; i++) {
      const j = i - v.start, s = v.loop ? v.samples[j % v.samples.length] : v.samples[j];
      if (s === undefined) break;
      // 3 ms ramps on cut, like audio.js.
      const ramp = Math.min(1, (end - i) / frames(0.003), (i - v.start + 1) / frames(0.003));
      out[i] += s * v.gain * ramp;
    }
  }
  return out;
}

// ---------------------------------------------------------------- audition page

function page(rows, montageFiles) {
  return auditionPage({
    heading: "Astra-Man · Sound set v2",
    lede: "Every gameplay sound keeps the arcade original's exact pitch shape and rhythm, measured frame by frame, and gets a new AI voice. Player sounds are friendly and bright; threat sounds glitch and corrupt. The graph under each sound compares the original's pitch (wide pale band) with v2's (thin line). Loops repeat in the player. Pause one player before starting another.",
    legend: '<p class="legend"><i></i>original pitch per frame <i class="n"></i>v2 pitch per frame</p>',
    storageKey: "astra-audio-v2-verdicts", verdictTitle: "Astra v2 verdicts",
    sections: [
      { heading: "In context", lede: "The same 23-second run of play (boot, chomping over the siren, power pellet, ghost eaten, eyes returning, fruit, power-up, extra life, zap, death), mixed the way the game mixes it.",
        players: [{ label: "Original", file: montageFiles.original }, { label: "Astra v2", file: montageFiles.v2 }] },
      { heading: "Sounds", rows: rows.map((r) => ({
        id: r.id, intent: r.intent, extra: contourSvg(r.contour),
        badge: r.contour && `${Math.round(r.contour.within * 100)}% shape match`, badgeTitle: "Frames within a semitone of the original",
        players: [{ label: "Original", file: r.original, loop: r.loop }, { label: "Jfxr v1", file: r.v1, loop: r.loop }, { label: "Astra v2", file: r.v2, loop: r.loop }],
        options: [["keep", "Keep"], ["revise", "Revise"], ["v1", "Prefer v1"]],
      })) },
    ],
  });
}

// ---------------------------------------------------------------- main

function main() {
  const checkOnly = process.argv.includes("--check");
  const rendered = {}, reports = [];
  if (!HAVE_REFERENCE) console.warn(`No reference recordings in ${REFERENCE}: skipping the contour check (see scripts/AUDIO.md).`);
  for (const [id, render, loop, refKey] of CLIPS) {
    const samples = render();
    rendered[id] = samples;
    reports.push(checkClip(id, samples, loop, refKey));
  }
  for (const r of reports) {
    const bits = [`${r.id.padEnd(12)} ${r.duration.toFixed(3)} s  rms ${r.rms.toFixed(3)}  peak ${r.peak.toFixed(3)}`];
    if (r.contour) bits.push(`shape ${(r.contour.within * 100).toFixed(0)}% (median ${r.contour.median.toFixed(2)} st, lag ${r.contour.lag})`);
    if (r.seam !== undefined) bits.push(`seam ${r.seam.toFixed(4)} cycles ${r.cycleRatio.toFixed(3)}`);
    if (r.problems.length) bits.push("PROBLEM: " + r.problems.join("; "));
    console.log(bits.join("  "));
  }
  const failed = reports.filter((r) => r.problems.length);
  if (checkOnly) { if (failed.length) process.exitCode = 1; return; }
  if (process.argv.includes("--install")) {
    if (failed.length) { console.error(`${failed.length} clip(s) failed checks; nothing installed`); process.exitCode = 1; return; }
    for (const [id] of CLIPS) fs.writeFileSync(path.join(AUDIO, id + ".wav"), kit.wavBytes(rendered[id]));
    console.log(`installed ${CLIPS.length} clips in ${AUDIO}; now run python scripts/build-audio.py`);
    return;
  }

  for (const dir of ["v2", "original", "v1"]) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  const originals = {}, rows = [];
  for (const [id, , loop, refKey, v1File, intent] of CLIPS) {
    fs.writeFileSync(path.join(OUT, "v2", id + ".wav"), kit.wavBytes(rendered[id]));
    let original = null, v1 = null;
    if (refKey && HAVE_REFERENCE) {
      // Trimmed from the reference recordings, as the game used to ship them.
      originals[refKey] = kit.fadeEdges(originalClip(refKey), 0.5, 0.5);
      fs.writeFileSync(path.join(OUT, "original", refKey + ".wav"), kit.wavBytes(originals[refKey]));
      original = `original/${refKey}.wav`;
    }
    if (v1File && fs.existsSync(path.join(ROOT, "outputs", "jfxr-demo-set", v1File))) { fs.copyFileSync(path.join(ROOT, "outputs", "jfxr-demo-set", v1File), path.join(OUT, "v1", v1File)); v1 = `v1/${v1File}`; }
    const report = reports.find((r) => r.id === id);
    rows.push({ id, loop, intent, original, v1, v2: `v2/${id}.wav`, contour: report.contour });
  }
  // Originals have no power-up or zap: they used fruit and ghost for those.
  const v2Montage = montage(rendered, {});
  fs.writeFileSync(path.join(OUT, "montage-v2.wav"), kit.wavBytes(v2Montage));
  if (HAVE_REFERENCE) {
    const origMontage = montage(originals, OLD_GAIN, { powerUp: "fruit", zap: "ghost" });
    fs.writeFileSync(path.join(OUT, "montage-original.wav"), kit.wavBytes(origMontage));
    console.log(`montage peaks: original ${kit.peak(origMontage).toFixed(3)}, v2 ${kit.peak(v2Montage).toFixed(3)}`);
  }

  const recipes = {
    generatedBy: "scripts/generate-astra-audio.js", sampleRate: RATE, frameRate: 60.606,
    contours: CONTOUR, targetRms: TARGET_RMS, boot: BOOT03, intermission: INTERMISSION,
    clips: reports.map(({ contour, problems, ...r }) => ({ ...r, shapeMatch: contour ? +contour.within.toFixed(3) : null })),
  };
  fs.writeFileSync(path.join(OUT, "recipes.json"), JSON.stringify(recipes, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "index.html"), page(rows, { original: HAVE_REFERENCE ? "montage-original.wav" : null, v2: "montage-v2.wav" }));
  fs.writeFileSync(path.join(OUT, "README.md"), `# Astra-Man sound set v2 (audition)

Open \`index.html\` to compare each sound: the original arcade clip, Jfxr v1 and Astra v2. All 17 v2 clips were approved and are now the game's sound bank.

- Gameplay sounds keep the original's per-frame pitch contour and rhythm (checked automatically: at least ${MIN_MATCH * 100}% of frames within a semitone) and replace the timbre.
- Player sounds (munch, fruit, extra life, power-up) are friendly and bright; threat sounds (sirens, frightened, death) glitch and corrupt.
- \`intro\` is boot-03-confident-fanfare rebuilt; \`intermission\` is an original tune. Neither uses Pac-Man melodies.
- \`powerUp\` is new; \`zap\` is a candidate for ghostZapped/explosion.
- \`montage-*.wav\` play the same stretch of gameplay with each set, mixed as the game mixes it.
- Loudness matches what the game plays today, so no per-clip gain is needed.
- Mono, 44.1 kHz, PCM16. \`recipes.json\` lists contours, targets and measurements. Rebuild with \`node scripts/generate-astra-audio.js\`.
`);
  console.log(`wrote ${OUT}`);
  if (failed.length) { console.error(`${failed.length} clip(s) failed checks`); process.exitCode = 1; }
}

if (require.main === module) main();
else module.exports = { CLIPS, CONTOUR, TARGET_RMS, originalClip, checkClip };
