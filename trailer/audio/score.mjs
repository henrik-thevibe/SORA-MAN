// Composes the trailer score (original 128 BPM chiptune/synthwave in A minor)
// and lays the game's own SFX on the edit, then writes out/trailer.wav (stereo).
// Timing comes from src/timeline.js; footage SFX come from the clips' event logs.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const K = require("../../scripts/audio-kit.js");
const TL = require("../src/timeline.js");
const { RATE, shapes, voice, noise, applyEnv, lowpass, highpass, echo, crush, decimate, env, noteHz, readWav } = K;
const { B, BEAT, BAR } = TL;
const S16 = BEAT / 4;
const LEN = Math.ceil((TL.duration + 1.5) * RATE);

// ---- buses ---------------------------------------------------------------------
const bus = () => [new Float32Array(LEN), new Float32Array(LEN)];
const DRUMS = bus(), MUSIC = bus(), SFX = bus(), SEND = bus(), TRIB = bus();
// pan is a number, or [from, to] to sweep across the sound's length.
function add(target, samples, at, gain = 1, pan = 0, send = 0) {
  const start = Math.round(at * RATE), sweep = Array.isArray(pan);
  let l = Math.cos(((sweep ? pan[0] : pan) + 1) * Math.PI / 4) * gain, r = Math.sin(((sweep ? pan[0] : pan) + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < samples.length; i++) {
    const j = start + i;
    if (j < 0 || j >= LEN) continue;
    if (sweep && i % 64 === 0) { const q = pan[0] + (pan[1] - pan[0]) * (i / samples.length); l = Math.cos((q + 1) * Math.PI / 4) * gain; r = Math.sin((q + 1) * Math.PI / 4) * gain; }
    target[0][j] += samples[i] * l; target[1][j] += samples[i] * r;
    if (send) { SEND[0][j] += samples[i] * l * send; SEND[1][j] += samples[i] * r * send; }
  }
}
const T = (bar, step = 0) => B(bar) + step * S16;

// ---- instruments -------------------------------------------------------------------
const adsr = (dur, a = 0.005, d = 0.08, s = 0.7, r = 0.06) => env([[0, 0], [a, 1], [a + d, s], [Math.max(a + d, dur), s], [dur + r, 0]]);
function lead(midi, dur, { bright = 6000, oct = 0 } = {}) {
  const f = noteHz(midi + oct * 12), vib = (t) => f * (1 + (t > 0.14 ? 0.006 * Math.sin(2 * Math.PI * 5.5 * t) : 0));
  const a = voice(dur + 0.08, { freq: vib, shape: shapes.pulse(0.5), amp: adsr(dur, 0.004, 0.1, 0.65) });
  const b = voice(dur + 0.08, { freq: (t) => vib(t) * 1.004, shape: shapes.pulse(0.25), amp: adsr(dur, 0.004, 0.1, 0.5) });
  for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.5 + b[i] * 0.35;
  return lowpass(a, bright);
}
function bass(midi, dur) {
  const f = noteHz(midi);
  const top = voice(dur + 0.03, { freq: f, shape: shapes.pulse(0.3), amp: adsr(dur, 0.002, 0.12, 0.55, 0.03) });
  const sub = voice(dur + 0.03, { freq: f / 2, shape: shapes.sine(), amp: adsr(dur, 0.002, 0.1, 0.8, 0.03) });
  const out = lowpass(top, 1100);
  for (let i = 0; i < out.length; i++) out[i] = out[i] * 0.6 + sub[i] * 0.7;
  return out;
}
const arp = (midi, dur = 0.11) => lowpass(voice(dur, { freq: noteHz(midi), shape: shapes.pulse(0.125), amp: env([[0, 0], [0.002, 1], [dur, 0]]) }), 5200);
function pad(midis, dur, cutoff = 1400, attack = 0.5) {
  const out = new Float32Array(Math.round((dur + 1) * RATE));
  for (const m of midis) for (const det of [-0.006, 0, 0.007]) {
    const v = voice(dur + 1, { freq: noteHz(m) * (1 + det), shape: shapes.saw(), amp: env([[0, 0], [attack, 1], [dur, 0.85], [dur + 1, 0]]) });
    for (let i = 0; i < out.length; i++) out[i] += v[i] * 0.12;
  }
  return lowpass(out, cutoff);
}
const bell = (midi, dur = 2.4) => voice(dur, { freq: noteHz(midi), shape: shapes.fm(3.5, (t) => 2.2 * Math.exp(-t * 3)), amp: env([[0, 0], [0.003, 1], [dur, 0]]) }).map((v, i) => v * Math.exp(-i / RATE * 1.6));
function kick(punch = 1) {
  const k = voice(0.42, { freq: (t) => 45 + 120 * Math.exp(-t * 28), shape: shapes.sine(), amp: (t) => Math.exp(-t * 7) });
  const click = highpass(noise(0.012, 7), 2000);
  for (let i = 0; i < click.length; i++) k[i] += click[i] * 0.4 * (1 - i / click.length);
  return k.map((v) => Math.tanh(v * 1.6 * punch));
}
function snare() {
  const n = lowpass(highpass(noise(0.22, 3), 1400), 8000).map((v, i) => v * Math.exp(-i / RATE * 16));
  const tone = voice(0.1, { freq: (t) => 200 - t * 300, shape: shapes.tri(), amp: (t) => Math.exp(-t * 30) });
  for (let i = 0; i < tone.length; i++) n[i] += tone[i] * 0.6;
  return n;
}
const hat = (open = false, seed = 5) => highpass(noise(open ? 0.3 : 0.05, seed), 7500).map((v, i) => v * Math.exp(-i / RATE * (open ? 9 : 70)));
const crash = () => highpass(noise(2.2, 11), 4500).map((v, i) => v * Math.exp(-i / RATE * 1.8) * 0.8);
function riser(dur) {
  const n = noise(dur, 13), out = new Float32Array(n.length);
  let y = 0;
  for (let i = 0; i < n.length; i++) { const t = i / RATE, a = 1 - Math.exp(-2 * Math.PI * (300 + 9000 * Math.pow(t / dur, 2)) / RATE); y += a * (n[i] - y); out[i] = y * Math.pow(t / dur, 1.5); }
  const saw = voice(dur, { freq: (t) => 110 * Math.pow(8, t / dur), shape: shapes.saw(), amp: (t) => 0.25 * Math.pow(t / dur, 2) });
  for (let i = 0; i < out.length; i++) out[i] += saw[i];
  return out;
}
function boom() {
  const sub = voice(1.8, { freq: (t) => 30 + 70 * Math.exp(-t * 6), shape: shapes.sine(), amp: (t) => Math.exp(-t * 2.2) });
  const n = lowpass(noise(1.2, 17), 900).map((v, i) => v * Math.exp(-i / RATE * 4));
  for (let i = 0; i < n.length; i++) sub[i] += n[i] * 0.9;
  return sub.map((v) => Math.tanh(v * 1.4));
}
function slam() {
  const n = lowpass(noise(0.35, 19), 3500).map((v, i) => v * Math.exp(-i / RATE * 14));
  const k = kick(1.3);
  for (let i = 0; i < n.length; i++) k[i] = (k[i] || 0) * 0.9 + n[i] * 0.8;
  return k;
}
function glitch() {
  const out = new Float32Array(Math.round(0.6 * RATE)), r = K.mulberry32(23);
  for (let s = 0; s < 8; s++) {
    const at = Math.floor(r() * 0.5 * RATE), len = Math.floor((0.02 + r() * 0.05) * RATE);
    const burst = decimate(crush(voice(len / RATE, { freq: 200 + r() * 1800, shape: shapes.pulse(0.3) }), 3), 6);
    for (let i = 0; i < len && at + i < out.length; i++) out[at + i] += burst[i] * 0.5;
  }
  return out;
}
function sparkle() {
  const out = new Float32Array(Math.round(1.6 * RATE));
  [88, 93, 96, 100].forEach((m, k) => { const b = bell(m, 1.2); const at = Math.round(k * 0.06 * RATE); for (let i = 0; i < b.length && at + i < out.length; i++) out[at + i] += b[i] * 0.35; });
  return out;
}
const staticNoise = (dur) => { const n = highpass(noise(dur, 29), 900), lo = lowpass(n, 6000); return n.map((v, i) => (v * 0.5 + lo[i] * 0.5) * 0.175 * Math.min(1, (dur - i / RATE) / 0.4)); };
const click = (seed) => highpass(noise(0.018, seed), 2500).map((v, i) => v * Math.exp(-i / RATE * 260) * 0.9);
function whoosh() { const n = noise(0.5, 31), out = new Float32Array(n.length); let y = 0; for (let i = 0; i < n.length; i++) { const t = i / RATE, a = 1 - Math.exp(-2 * Math.PI * (400 + 5000 * Math.sin(Math.PI * t / 0.5)) / RATE); y += a * (n[i] - y); out[i] = y * Math.sin(Math.PI * t / 0.5) * 0.8; } return out; }
const irisBoop = () => voice(0.28, { freq: (t) => 300 + 1400 * t / 0.28, shape: shapes.pulse(0.25), amp: (t) => 0.4 * (1 - t / 0.28) });
function chompRun() { const out = new Float32Array(Math.round(0.8 * RATE)); for (let k = 0; k < 6; k++) { const m = readWav(path.join(ROOT, "..", "assets", "audio", (k % 2 ? "munchB" : "munchA") + ".wav")), at = Math.round(k * 0.12 * RATE); for (let i = 0; i < m.length && at + i < out.length; i++) out[at + i] += m[i]; } return out; }
function roar() { const n = decimate(crush(noise(1.9, 37), 4), 4), out = new Float32Array(n.length); for (let i = 0; i < n.length; i++) { const t = i / RATE; out[i] = n[i] * Math.min(1, t / 1.2) * (t > 1.7 ? (1.9 - t) / 0.2 : 1) * 0.6; } const sub = boom(); for (let i = 0; i < Math.min(sub.length, out.length); i++) out[i] += sub[i] * 0.4; return out; }
const powerDown = () => voice(1.3, { freq: (t) => 880 * Math.pow(0.08, t / 1.3), shape: shapes.pulse(0.4), amp: (t) => 0.5 * (1 - t / 1.3) });

// ---- the song ---------------------------------------------------------------------
const Am = [57, 60, 64], F = [53, 57, 60], C = [48, 55, 60, 64], G = [55, 59, 62], E = [52, 56, 59], Dm = [50, 53, 57];
const ROOT_OF = new Map([[Am, 45], [F, 41], [C, 48], [G, 43], [E, 40], [Dm, 38]]);
const PROG = [Am, F, C, G];
// The hook (original): [step, midi, length in 16ths], two bars each.
const HOOK_A = [[0, 69, 2], [3, 72, 2], [6, 76, 3], [9, 74, 1], [10, 72, 2], [12, 69, 4], [16, 77, 2], [19, 76, 2], [22, 72, 3], [25, 74, 1], [26, 72, 2], [28, 67, 4]];
const HOOK_B = [[0, 72, 2], [3, 76, 2], [6, 79, 3], [9, 77, 1], [10, 76, 2], [12, 74, 4], [16, 74, 2], [19, 76, 2], [22, 79, 2], [24, 81, 6], [30, 79, 2]];
const kicks = [];
function hook(notes, bar, o = {}) {
  const { oct = 0, gain = 0.34, pan = 0, send = 0.25, bright } = o;
  for (const [s, m, l] of notes) add(MUSIC, lead(m, l * S16 * 0.92, { oct, bright }), T(bar, s), gain, pan, send);
}
function beat4(from, to, o = {}) {
  const { hats = 8, snareOn = true, open = false, kickEvery = 4 } = o;
  for (let bar = from; bar < to; bar++) {
    for (let q = 0; q < 4; q += 4 / kickEvery) { add(DRUMS, kick(), T(bar, q * 4), 0.95); kicks.push(T(bar, q * 4)); }
    if (snareOn) for (const q of [1, 3]) add(DRUMS, snare(), T(bar, q * 4), 0.55, 0, 0.12);
    for (let h = 0; h < hats; h++) add(DRUMS, hat(open && h % 2 === 1, 5 + h), T(bar, h * (16 / hats)), open && h % 2 ? 0.16 : 0.11, (h % 2 ? 0.3 : -0.3));
  }
}
function bassLine(from, to, prog, pattern = [0, 2, 4, 6, 8, 10, 12, 14], oct = 0) {
  for (let bar = from; bar < to; bar++) {
    const root = ROOT_OF.get(prog[(bar - from) % prog.length]) + oct;
    for (const s of pattern) add(MUSIC, bass(root + (s % 8 === 6 ? 12 : 0), S16 * 1.6), T(bar, s), 0.42);
  }
}
function arps(from, to, prog, o = {}) {
  const { gain = 0.1, up = 12, every = 1 } = o;
  for (let bar = from; bar < to; bar++) {
    const ch = prog[(bar - from) % prog.length];
    for (let s = 0; s < 16; s += every) add(MUSIC, arp(ch[s % ch.length] + up + (s % 8 >= 4 ? 12 : 0)), T(bar, s), gain, Math.sin(s) * 0.6, 0.3);
  }
}
function pads(from, to, prog, o = {}) {
  const { gain = 0.5, cutoff = 1400 } = o;
  for (let bar = from; bar < to; bar++) add(MUSIC, pad(prog[(bar - from) % prog.length], BAR, cutoff, 0.05), T(bar), gain, 0, 0.4);
}

// 0-4 OPEN: drone under the terminal, the denoise, heartbeat kicks and a rising arp.
add(MUSIC, pad([45, 52], B(4), 450, 3), 0, 0.85, 0, 0.5);
add(MUSIC, pad([57, 60, 64], B(2), 900, 1.2), B(2), 0.5, 0, 0.5);
for (const bar of [2, 3]) for (const s of [0, 3]) { add(DRUMS, kick(0.9), T(bar, s * 1.5), 0.8); }
for (let bar = 3; bar < 4; bar++) for (let s = 0; s < 16; s++) add(MUSIC, lowpass(arp([57, 60, 64, 69][s % 4] + 12), 1800 + s * 180), T(bar, s), 0.09, Math.sin(s) * 0.5, 0.3);
// 4-9 HUNTERS: half-time, a bass stab per ghost, snare roll and riser into the drop.
for (let bar = 4; bar < 8; bar++) { add(DRUMS, kick(), T(bar), 0.95); kicks.push(T(bar)); add(DRUMS, snare(), T(bar, 8), 0.6, 0, 0.2); for (let h = 0; h < 8; h++) add(DRUMS, hat(false, h), T(bar, h * 2), 0.08, 0.3); }
[45, 41, 48, 43].forEach((m, i) => add(MUSIC, bass(m, 0.9), B(4 + i), 0.6));
arps(4, 8.75, [Am, F, C, G], { gain: 0.07 });
add(DRUMS, kick(1.2), T(8), 1); kicks.push(T(8));
for (let s = 0; s < 12; s++) add(DRUMS, snare(), T(8, s), 0.25 + s * 0.035, 0, 0.1);
add(SFX, riser(BAR * 0.82), T(8) + BAR * 0.05, 0.45, 0, 0.2); // ends right into the hush
// 9-11 TITLE DROP.
add(DRUMS, crash(), T(9), 0.5, -0.2, 0.2);
beat4(9, 11, { hats: 8, open: true });
bassLine(9, 11, [Am, F]);
pads(9, 11, [Am, F], { gain: 0.35, cutoff: 2200 });
hook(HOOK_A, 9, { gain: 0.36 });
// 11-19 CLASSIC.
add(DRUMS, crash(), T(11), 0.35);
beat4(11, 19, { hats: 8 });
bassLine(11, 19, PROG);
pads(11, 19, PROG, { gain: 0.25, cutoff: 1800 });
hook(HOOK_A, 11); hook(HOOK_B, 13); hook(HOOK_A, 15); hook(HOOK_B, 17, { gain: 0.36 });
// 19-31 REMIX: intro, eight bars of showcases, then a two-bar montage; brighter, arps, octave hooks.
add(DRUMS, crash(), T(19), 0.45);
beat4(19, 31, { hats: 16, open: true });
bassLine(19, 31, PROG, [0, 2, 3, 6, 8, 10, 11, 14]);
arps(19, 31, PROG, { gain: 0.07 });
pads(19, 31, PROG, { gain: 0.2, cutoff: 2400 });
hook(HOOK_A, 19, { oct: 1, gain: 0.24, send: 0.35 });
for (let bar = 21; bar < 29; bar += 4) { hook(HOOK_A, bar, { gain: 0.26, send: 0.3 }); hook(HOOK_B, bar + 2, { oct: bar % 8 === 1 ? 1 : 0, gain: bar % 8 === 1 ? 0.22 : 0.26, send: 0.3 }); }
for (const sc of TL.SHOWCASES) add(DRUMS, crash(), sc.split, 0.25, 0.3, 0.2);
// The montage: the hook an octave up over the four quick cuts, and a snare roll into SUNSET.
hook(HOOK_A, 29, { oct: 1, gain: 0.22, send: 0.3 });
for (let s = 8; s < 16; s++) add(DRUMS, snare(), T(30, s), 0.2 + s * 0.02);
// 31-40 SUNSET: darker, crushed bass, glitch arps, E major tension; the swallow builds to a roar.
const SUN = [Am, Am, F, E];
add(DRUMS, crash(), T(31), 0.4);
beat4(31, 39, { hats: 8 });
beat4(36.5, 39, { hats: 16, snareOn: false });
for (let bar = 31; bar < 40; bar++) {
  const ch = SUN[(bar - 31) % 4], root = ROOT_OF.get(ch);
  for (let s = 0; s < 16; s += 2) add(MUSIC, decimate(crush(bass(root, S16 * 1.8), 5), 3), T(bar, s), 0.36);
  for (let s = 0; s < 16; s++) if ((s * 7 + bar) % 5 !== 0) add(MUSIC, crush(arp(ch[s % 3] + 24, 0.08), 4), T(bar, s), 0.06, (s % 2 ? 0.5 : -0.5), 0.3);
}
pads(31, 40, SUN, { gain: 0.3, cutoff: 900 });
const SUN_HOOK = [[0, 76, 4], [4, 77, 4], [8, 76, 2], [10, 72, 2], [12, 71, 4], [16, 69, 8], [24, 68, 8]];
hook(SUN_HOOK, 32, { gain: 0.22, send: 0.5 }); hook(SUN_HOOK, 34, { gain: 0.22, send: 0.5 });
add(SFX, boom(), B(36), 0.9, 0, 0.3); add(DRUMS, crash(), B(36), 0.5);
add(SFX, riser(BAR), B(38), 0.45, 0, 0.2);
for (let s = 0; s < 16; s++) add(DRUMS, snare(), T(38, s), 0.15 + s * 0.03, 0, 0.1);
// 40-46 VERSUS.
const VS = [Dm, Am, E, Am];
add(DRUMS, crash(), T(40), 0.4);
beat4(40, 46, { hats: 16 });
bassLine(40, 46, VS, [0, 3, 6, 8, 10, 11, 14]);
arps(41, 46, VS, { gain: 0.06, every: 2 });
for (const bar of [41, 43]) hook([[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 80, 2], [10, 76, 2], [12, 71, 4], [16, 72, 2], [18, 76, 2], [20, 81, 4], [24, 83, 2], [26, 84, 6]], bar, { gain: 0.3 });
add(SFX, boom(), B(44.5), 0.5, 0, 0.3);
// 46-50 RAPID: build.
beat4(46, 49, { hats: 16, open: true });
bassLine(46, 50, [F, G, Am, Am], [0, 2, 4, 6, 8, 10, 12, 14]);
arps(46, 50, [F, G, Am, Am], { gain: 0.09 });
for (let s = 0; s < 16; s++) add(DRUMS, snare(), T(49, s), 0.18 + s * 0.03, 0, 0.1);
add(DRUMS, kick(), T(49), 0.9); kicks.push(T(49));
add(SFX, riser(BAR * 0.95), T(49) + BAR * 0.05, 0.4, 0, 0.2);
// 50-52 CHASE: the hook at full power.
add(DRUMS, crash(), T(50), 0.55);
beat4(50, 52, { hats: 16, open: true });
bassLine(50, 52, [Am, F]);
hook(HOOK_A, 50, { gain: 0.34 }); hook(HOOK_A, 50, { gain: 0.16, oct: 1 });
pads(50, 52, [Am, F], { gain: 0.35, cutoff: 2600 });
// 52-55.5 TRIBUTE: silence, then a music box.
add(TRIB, pad([45, 52, 57], B(55.5) - B(52), 600, 1.5), B(52) + 0.3, 0.35, 0, 0.6);
[[0, 69], [2, 72], [4, 76], [6, 74], [8, 72], [10, 69]].forEach(([q, m]) => { if (B(52) + 0.8 + q * BEAT < B(53.7)) add(TRIB, bell(m + 12), B(52) + 0.8 + q * BEAT, 0.22, (q % 4 ? 0.3 : -0.3), 0.6); });
[[0, 77], [2, 76], [3, 72], [4, 74], [6, 81]].forEach(([q, m]) => add(TRIB, bell(m + 12, 3), B(54.75) + q * BEAT * 0.5, 0.26, 0, 0.6));
add(TRIB, pad([57, 60, 64, 71], B(55.5) - B(54.75), 3000, 0.6), B(54.75), 0.35, 0, 0.5);
add(SFX, riser(B(55.5) - B(54.75)), B(54.75), 0.35, 0, 0.2);
// 55.5-59 END: the slam and a final chord.
add(DRUMS, crash(), B(55.5), 0.7, 0, 0.3); add(DRUMS, kick(1.3), B(55.5), 1); kicks.push(B(55.5));
add(MUSIC, pad([45, 57, 60, 64, 71, 76], BAR * 2, 3200, 0.01), B(55.5), 0.6, 0, 0.6);
add(MUSIC, lead(81, BAR * 1.6), B(55.5), 0.3, 0, 0.5);
add(MUSIC, bass(33, BAR * 1.5), B(55.5), 0.6);
for (const s of [4, 6, 8]) { add(DRUMS, snare(), T(55.5, s), 0.5); add(MUSIC, pad([57, 60, 64], S16 * 1.5, 3000, 0.005), T(55.5, s), 0.4); }
add(DRUMS, kick(1.2), T(55.5, 8), 1); kicks.push(T(55.5, 8));

// ---- sound effects ----------------------------------------------------------------------
const WAV = (n) => readWav(path.join(ROOT, "..", "assets", "audio", n + ".wav"));
const LIB = {
  ghost: WAV("ghost"), powerUp: WAV("powerUp"), zap: WAV("zap"), death: WAV("death"), achievement: WAV("achievement"),
  levelUp: WAV("levelUp"), titleSting: WAV("titleSting"), extraLife: WAV("extraLife"), frightened: WAV("frightened"),
  uiConfirm: WAV("uiConfirm"), munchA: WAV("munchA"), munchB: WAV("munchB"),
  static: staticNoise(B(1.5)), sparkle: sparkle(), boom: boom(), slam: slam(), glitch: glitch(), powerDown: powerDown(),
  whoosh: whoosh(), iris: irisBoop(), chomp: chompRun(), roar: roar(), click: click(99),
};
// Terminal key clicks on every typed character.
TL.keyTimes().forEach((k, i) => { if (!k.space) add(SFX, click(40 + i), k.t, 0.5, (i % 2 ? 0.15 : -0.15)); });
for (const c of TL.CUES) add(SFX, LIB[c.sfx], c.t, c.gain * 0.8, c.pan ?? 0, 0.15);
// Footage events inside each segment's window, at their on-screen times.
const MAP = { ghostEaten: ["ghost", 0.55], powerPellet: ["frightened", 0.4], powerUp: ["powerUp", 0.5], ghostZapped: ["zap", 0.35], explosion: ["boom", 0.6], skill: ["zap", 0.4], caught: ["ghost", 0.3], eliminated: ["death", 0.3], chain: ["achievement", 0.45] };
let placed = 0;
for (const seg of TL.SEGMENTS) {
  const metaFile = path.join(ROOT, "out", "clips", seg.clip, "meta.json");
  if (!fs.existsSync(metaFile)) continue;
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  const speed = seg.speed ?? 1;
  if (speed === 0) continue;
  const f0 = seg.f + (seg.t0 - seg.at) * 30 * speed, f1 = seg.f + (seg.t1 - seg.at) * 30 * speed;
  const seen = new Set();
  for (const e of meta.events) {
    if (e.frame < f0 || e.frame >= f1 || !MAP[e.name]) continue;
    const key = e.frame + e.name;
    if (seen.has(key)) continue; seen.add(key);
    const [sfx, gain] = e.name === "chain" && e.data?.chain >= 256 ? ["levelUp", 0.6] : MAP[e.name];
    add(SFX, LIB[sfx], seg.at + (e.frame - seg.f) / 30 / speed, gain, 0, 0.1);
    placed++;
  }
}
// Hard stop for the tribute: kill everything but the tribute layers at the cut.
function gate(b, from, to, fade = 0.02) {
  const a = Math.round(from * RATE), z = Math.round(to * RATE), f = Math.round(fade * RATE);
  for (const ch of b) for (let i = a; i < Math.min(z, LEN); i++) ch[i] *= i < a + f ? 1 - (i - a) / f : 0;
}
for (const b of [DRUMS, MUSIC, SEND]) gate(b, B(52), B(55.5) - 0.01);
// The hush before the drop: everything but the lone waka drops out for half a beat.
for (const b of [DRUMS, MUSIC, SEND]) gate(b, TL.DROP_HUSH, B(9) - 0.004, 0.012);
// A one-beat breath before SUNSET's first downbeat (only the glitch transition sound is left).
for (const b of [DRUMS, MUSIC, SEND]) gate(b, B(31) - BEAT, B(31) - 0.004, 0.02);
// Into DELETED: the band is swept shut (low-pass 8 kHz -> 400 Hz over two beats), then silence for the last
// bar of SUNSET, leaving the glitch roar and a sub drop.
function sweepShut(b, from, to, f0, f1) {
  const a = Math.round(from * RATE), z = Math.min(LEN, Math.round(to * RATE));
  for (const ch of b) {
    let y = 0;
    for (let i = a; i < z; i++) {
      const k = (i - a) / (z - a), fc = f0 * Math.pow(f1 / f0, k), g = 1 - Math.exp(-2 * Math.PI * fc / RATE);
      y += g * (ch[i] - y); ch[i] = y;
    }
  }
}
for (const b of [DRUMS, MUSIC, SEND]) sweepShut(b, B(39) - 2 * BEAT, B(39), 8000, 400);
for (const b of [DRUMS, MUSIC, SEND]) gate(b, B(39), B(40) - 0.004, 0.03);
add(SFX, voice(1.7, { freq: (t) => 25 + 45 * Math.exp(-t * 1.6), shape: shapes.sine(), amp: (t) => Math.min(1, t / 0.02) * Math.exp(-t * 1.4) }).map((v) => Math.tanh(v * 1.6)), B(39), 0.75);
// A reverse-cymbal swell out of the silence into VERSUS.
const swell = crash().reverse();
add(SFX, swell, B(40) - swell.length / RATE, 0.4, 0, 0.3);
// Slow-motion: the music dips and darkens under every slowed impact.
for (const w of TL.SLOWMO) {
  const a = Math.round(w.t0 * RATE), z = Math.round(w.t1 * RATE), edge = Math.round(0.08 * RATE);
  for (const ch of [...MUSIC, ...DRUMS]) {
    let y = 0;
    for (let i = a; i < Math.min(z, LEN); i++) {
      const k = Math.min(1, (i - a) / edge, (z - i) / edge), cut = 1 - Math.exp(-2 * Math.PI * (6000 - 5300 * k) / RATE);
      y += cut * (ch[i] - y); ch[i] = ch[i] * (1 - k) + y * k * 0.7;
    }
  }
}

// Section dynamics: the verses sit under the peaks (title drop, the SUNSET swallow, the chase, the end card),
// so the drops land as drops. [bar, gain] points, eased over a quarter bar.
const DYN = [[0, 1], [11, 1], [11.25, 0.58], [29.75, 0.58], [30, 0.8], [31, 0.6], [35.75, 0.6], [36, 0.85], [40, 0.85], [40.25, 0.6], [46, 0.62], [49.75, 0.95], [50, 1]];
function dynAt(t) {
  for (let k = 1; k < DYN.length; k++) {
    const [b0, g0] = DYN[k - 1], [b1, g1] = DYN[k], t0 = B(b0), t1 = B(b1);
    if (t < t1) { const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return g0 + (g1 - g0) * (u * u * (3 - 2 * u)); }
  }
  return DYN[DYN.length - 1][1];
}
{
  const g = new Float32Array(LEN);
  for (let i = 0; i < LEN; i += 64) { const v = dynAt(i / RATE); for (let j = i; j < Math.min(LEN, i + 64); j++) g[j] = v; }
  for (const b of [DRUMS, MUSIC, SEND]) for (const ch of b) for (let i = 0; i < LEN; i++) ch[i] *= g[i];
}

// ---- mixdown ----------------------------------------------------------------------------
// Sidechain pump on the music bus from every kick.
const duck = new Float32Array(LEN).fill(1);
for (const k of kicks) { const a = Math.round(k * RATE); for (let i = 0; i < 0.22 * RATE && a + i < LEN; i++) duck[a + i] = Math.min(duck[a + i], 0.45 + 0.55 * Math.pow(i / (0.22 * RATE), 0.7)); }
for (const ch of MUSIC) for (let i = 0; i < LEN; i++) ch[i] *= duck[i];
// Stereo Schroeder reverb on the send bus.
function reverb(x, seedOffset) {
  const combs = [1557, 1617, 1491, 1422].map((n) => n + seedOffset), out = new Float32Array(x.length);
  for (const n of combs) { const buf = new Float32Array(n); let idx = 0, lp = 0; for (let i = 0; i < x.length; i++) { const y = buf[idx]; lp = y * 0.7 + lp * 0.3; buf[idx] = x[i] + lp * 0.8; idx = (idx + 1) % n; out[i] += y * 0.25; } }
  for (const n of [225, 556].map((n) => n + seedOffset)) { const buf = new Float32Array(n); let idx = 0; for (let i = 0; i < out.length; i++) { const b = buf[idx], y = -out[i] + b; buf[idx] = out[i] + b * 0.5; out[i] = y; idx = (idx + 1) % n; } }
  return out;
}
for (let i = 0; i < LEN; i++) { SEND[0][i] += TRIB[0][i] * 0.6; SEND[1][i] += TRIB[1][i] * 0.6; }
const wetL = reverb(SEND[0], 0), wetR = reverb(SEND[1], 23);
const L = new Float32Array(LEN), R = new Float32Array(LEN);
for (let i = 0; i < LEN; i++) {
  L[i] = DRUMS[0][i] * 0.9 + MUSIC[0][i] + TRIB[0][i] + SFX[0][i] + wetL[i] * 0.35;
  R[i] = DRUMS[1][i] * 0.9 + MUSIC[1][i] + TRIB[1][i] + SFX[1][i] + wetR[i] * 0.35;
}
// Soft-clip master, normalise to -1 dBFS, fade the tail.
let peak = 0;
for (let i = 0; i < LEN; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.891 / (peak || 1), tail = Math.round((TL.duration - 0.8) * RATE);
const buf = Buffer.alloc(44 + LEN * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(buf.length - 8, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  const f = i < tail ? 1 : Math.max(0, 1 - (i - tail) / (RATE * 1.2));
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * f)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * f)) * 32767), 46 + i * 4);
}
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "out", "trailer.wav"), buf);
console.log(`trailer.wav: ${(LEN / RATE).toFixed(2)}s stereo, ${placed} footage SFX, ${TL.CUES.length} cues, peak ${peak.toFixed(2)}`);
