"use strict";

// Voices shared by the Astra audio generators, so every clip is built from the
// same parts: bit-clicks, data shimmer, the pulse-plus-bell lead, triangle bass,
// FM blips, and boot-03's notes (the home motif).
const {
  RATE, TICK, frames, noteHz, env, shapes, voice, noise, layer, applyEnv, highpass, mulberry32,
} = require("./audio-kit.js");

const T = TICK;

// Short bright "bit-click": the data-packet tick on the front of a friendly sound.
function bitClick(freq = 3200, length = 0.004, seed = 7) {
  const tone = voice(length, { freq, shape: shapes.sine(), amp: (t) => Math.exp(-t / 0.0012) });
  const hiss = applyEnv(highpass(noise(length, seed), 4000), (t) => 0.35 * Math.exp(-t / 0.0008));
  return layer([[tone], [hiss]]);
}

// Per-frame "data shimmer": random harmonics flicker above the fundamental.
// Indexed by frame-in-loop so a looped bed repeats exactly.
function shimmer(duration, freq, { tick = T, loopTicks = Infinity, chance = 0.3, seed = 3, harmonics = [2, 3, 4] } = {}) {
  const r = mulberry32(seed), pattern = Array.from({ length: Math.min(loopTicks, 4096) }, () => ({ on: r() < chance, h: harmonics[Math.floor(r() * harmonics.length)] }));
  const n = frames(duration), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, k = Math.floor(t / tick), step = pattern[k % pattern.length], within = (t - k * tick) / tick;
    ph += freq(t) * step.h / RATE;
    // Each flicker is a quick blip inside its frame so steps never click.
    out[i] = step.on ? Math.sin(2 * Math.PI * ph) * Math.sin(Math.PI * Math.min(1, within / 0.6)) : 0;
  }
  return out;
}

// A melodic note: pulse lead with an octave-up FM bell and long-note vibrato.
function leadNote(midi, length, { bell = 0.28, duty = 0.25, release = 0.06 } = {}) {
  const duration = length + release, base = noteHz(midi);
  const freq = (t) => base * Math.pow(2, (length > 0.3 && t > 0.12 ? 0.1 * Math.sin(2 * Math.PI * 5.5 * (t - 0.12)) : 0) / 12);
  const amp = env([[0, 0], [0.004, 1], [0.05, 0.78], [length, 0.7], [duration, 0]]);
  const pulse = voice(duration, { freq, shape: shapes.pulse(duty), amp });
  const sparkle = voice(duration, { freq: (t) => freq(t) * 2, shape: shapes.fm(1, (t) => 1.4 * Math.exp(-t / 0.05)), amp: (t) => amp(t) * Math.exp(-t / 0.18) });
  return layer([[pulse, 0.7], [sparkle, bell]]);
}
function bassNote(midi, length) {
  const duration = length + 0.04;
  return voice(duration, { freq: noteHz(midi), shape: shapes.tri(), amp: env([[0, 0], [0.004, 1], [length, 0.8], [duration, 0]]) });
}
function blip(midi, length = 0.05, index = 1.8) {
  return voice(length, { freq: noteHz(midi), shape: shapes.fm(2, (t) => index * Math.exp(-t / 0.02)), amp: (t) => Math.min(1, t / 0.002) * Math.exp(-t / (length / 3)) });
}
function hat(seed) { return applyEnv(highpass(noise(0.025, seed), 6000), (t) => Math.exp(-t / 0.006)); }

// boot-03-confident-fanfare (the approved boot) with its notes and timing kept,
// rebuilt with richer voices, a handshake pickup and a "system ready" ending.
const BOOT03 = {
  lead: [[0.00, 55, 0.18, 0.74], [0.22, 62, 0.18, 0.78], [0.44, 67, 0.24, 0.86], [0.82, 59, 0.16, 0.70], [1.02, 64, 0.16, 0.76],
    [1.22, 71, 0.26, 0.90], [1.66, 67, 0.13, 0.72], [1.83, 71, 0.13, 0.78], [2.00, 74, 0.13, 0.86], [2.17, 79, 0.46, 1.00]],
  bass: [[0.00, 31, 0.62, 0.36], [0.82, 35, 0.62, 0.36], [1.66, 43, 0.78, 0.42]],
};

module.exports = { bitClick, shimmer, leadNote, bassNote, blip, hat, BOOT03 };
