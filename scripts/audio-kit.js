"use strict";

// Shared helpers for the offline audio generators: WAV I/O, mixing, a small
// synthesis/effects toolkit and a frame-rate pitch tracker. Nothing here is
// loaded by the game.
const fs = require("node:fs");

const RATE = 44100;
// Pac-Man's sound hardware changes pitch once per video frame (60.606 Hz).
const TICK = 1 / 60.606;

const frames = (seconds) => Math.max(0, Math.round(seconds * RATE));
const noteHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const value = (v, t) => (typeof v === "function" ? v(t) : v);

// ---------------------------------------------------------------- WAV and mixing

function gainAndFade(input, peak = 0.72, fadeMs = 3) {
  const out = Float32Array.from(input);
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  const scale = max ? peak / max : 1;
  const fade = Math.min(Math.floor(RATE * fadeMs / 1000), Math.floor(out.length / 2));
  for (let i = 0; i < out.length; i++) {
    let envelope = 1;
    if (i < fade) envelope = i / fade;
    if (i >= out.length - fade) envelope = Math.min(envelope, (out.length - 1 - i) / fade);
    out[i] *= scale * Math.max(0, envelope);
  }
  return out;
}

function crossfadeLoop(input, frameCount = 176) {
  const data = Float32Array.from(input);
  frameCount = Math.min(frameCount, Math.floor(data.length / 4));
  const out = data.slice(0, data.length - frameCount);
  for (let i = 0; i < frameCount; i++) {
    const t = i / (frameCount - 1);
    // Fold the tail over the head, then omit that tail. The new final sample is
    // immediately before the new first sample in the original waveform.
    out[i] = data[data.length - frameCount + i] * (1 - t) + data[i] * t;
  }
  return gainAndFade(out, 0.54, 0);
}

function mix(parts, duration) {
  const out = new Float32Array(Math.ceil(duration * RATE));
  for (const { samples, at = 0, gain = 1 } of parts) {
    const start = Math.round(at * RATE);
    for (let i = 0; i < samples.length && start + i < out.length; i++) out[start + i] += samples[i] * gain;
  }
  return gainAndFade(out, 0.76, 8);
}

function wavBytes(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  }
  return buffer;
}

// Mono PCM16 reader; walks the chunk list so LIST/fact chunks are skipped.
function readWav(file) {
  const bytes = fs.readFileSync(file);
  let pos = 12, channels = 1, data = null;
  while (pos + 8 <= bytes.length) {
    const id = bytes.toString("ascii", pos, pos + 4), size = bytes.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      channels = bytes.readUInt16LE(pos + 10);
      if (bytes.readUInt16LE(pos + 22) !== 16 || bytes.readUInt32LE(pos + 12) !== RATE) throw new Error(`${file}: expected 44.1 kHz PCM16`);
    } else if (id === "data") data = bytes.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size & 1);
  }
  if (!data) throw new Error(`${file}: no data chunk`);
  const count = Math.floor(data.length / 2 / channels), out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
    out[i] = sum / channels / 32768;
  }
  return out;
}

function rms(x, from = 0, to = x.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}
function peak(x) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; }

// Scale to a loudness target. A soft knee keeps rare peaks under the ceiling
// instead of lowering the whole clip.
function loudness(x, target, ceiling = 0.97) {
  const scale = target / (rms(x) || 1), out = new Float32Array(x.length), knee = ceiling * 0.8;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * scale, a = Math.abs(v);
    out[i] = a <= knee ? v : Math.sign(v) * (knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee)));
  }
  return out;
}

function fadeEdges(x, inMs = 1, outMs = 4) {
  const out = Float32Array.from(x), a = frames(inMs / 1000), b = frames(outMs / 1000);
  for (let i = 0; i < a && i < out.length; i++) out[i] *= i / a;
  for (let i = 0; i < b && i < out.length; i++) out[out.length - 1 - i] *= i / b;
  return out;
}

// Sum layers: [samples, gain = 1, atSeconds = 0].
function layer(parts, duration) {
  const length = duration !== undefined ? frames(duration) :
    Math.max(...parts.map(([s, , at = 0]) => frames(at) + s.length));
  const out = new Float32Array(length);
  for (const [samples, gain = 1, at = 0] of parts) {
    const start = frames(at);
    for (let i = 0; i < samples.length && start + i < length; i++) out[start + i] += samples[i] * gain;
  }
  return out;
}

// ---------------------------------------------------------------- contours

// A per-frame pitch table played back as a function of time. `slew` glides
// into each new step (in seconds) so steps stay audible but never click.
function ticks(table, { tick = TICK, slew = 0 } = {}) {
  return (t) => {
    const i = clamp(Math.floor(t / tick), 0, table.length - 1);
    const within = t - i * tick;
    if (slew && i > 0 && within < slew) return table[i - 1] * Math.pow(table[i] / table[i - 1], within / slew);
    return table[i];
  };
}
function ramp(from, step, count) { return Array.from({ length: count }, (_, i) => from + step * i); }
function repeat(table, times) { return Array.from({ length: times }, () => table).flat(); }
// Triangle sweep in equal per-frame steps with single turning points, as the
// arcade's siren counts up and down.
function triangleTable(lo, hi, period) {
  const half = period / 2, step = (hi - lo) / half;
  return Array.from({ length: period }, (_, k) => lo + step * (k <= half ? k : period - k));
}
// Piecewise-linear envelope over [[time, level], ...].
function env(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t1, v1] = points[i];
      if (t <= t1) { const [t0, v0] = points[i - 1]; return v0 + (v1 - v0) * (t - t0) / Math.max(1e-9, t1 - t0); }
    }
    return points[points.length - 1][1];
  };
}

// ---------------------------------------------------------------- oscillators

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const frac = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;

// Each shape maps (unwrapped phase in cycles, cycles per sample, time) to a sample.
const shapes = {
  sine: () => (ph) => Math.sin(TAU * ph),
  tri: () => (ph) => 1 - 4 * Math.abs(frac(ph) - Math.floor(frac(ph) + 0.5)),
  // Band-limited pulse; the DC term is removed so duty sweeps don't thump.
  pulse: (duty = 0.5) => (ph, dt, t) => {
    const d = clamp(value(duty, t), 0.02, 0.98), f = frac(ph);
    let v = f < d ? 1 : -1;
    v += blep(f, Math.min(dt, 0.5));
    v -= blep(frac(f - d + 1), Math.min(dt, 0.5));
    return v - (2 * d - 1);
  },
  saw: () => (ph, dt) => { const f = frac(ph); return 2 * f - 1 - blep(f, Math.min(dt, 0.5)); },
  // Two-operator FM; `index` may be a function of time for bell decays.
  fm: (ratio = 2, index = 1) => (ph, dt, t) => Math.sin(TAU * ph + value(index, t) * Math.sin(TAU * ph * ratio)),
};

// Render one voice whose pitch follows freq(t) with continuous phase.
function voice(duration, { freq, shape, amp = 1, phase = 0 }) {
  const n = frames(duration), out = new Float32Array(n);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, f = value(freq, t), dt = f / RATE;
    out[i] = shape(ph, dt, t) * value(amp, t);
    ph += dt;
  }
  return out;
}

function noise(duration, seed = 1) {
  const r = mulberry32(seed), out = new Float32Array(frames(duration));
  for (let i = 0; i < out.length; i++) out[i] = r() * 2 - 1;
  return out;
}

// ---------------------------------------------------------------- effects

function applyEnv(x, amp) {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * value(amp, i / RATE);
  return out;
}
// Bit-depth reduction; fractional depths blend the two neighbouring grids.
function crush(x, bits) {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const b = value(bits, i / RATE), lo = Math.floor(b), mixHi = b - lo;
    const q = (n) => { const s = Math.pow(2, n - 1); return Math.round(x[i] * s) / s; };
    out[i] = mixHi ? q(lo) * (1 - mixHi) + q(lo + 1) * mixHi : q(lo);
  }
  return out;
}
// Sample-rate reduction by sample-and-hold; factor 1 is transparent.
function decimate(x, factor) {
  const out = new Float32Array(x.length);
  let acc = Infinity, held = 0;
  for (let i = 0; i < x.length; i++) {
    const f = Math.max(1, value(factor, i / RATE));
    if (++acc >= f) { acc = acc === Infinity ? 0 : acc - f; held = x[i]; }
    out[i] = held;
  }
  return out;
}
function lowpass(x, cutoff) {
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const a = 1 - Math.exp(-TAU * value(cutoff, i / RATE) / RATE);
    y += a * (x[i] - y); out[i] = y;
  }
  return out;
}
function highpass(x, cutoff) {
  const low = lowpass(x, cutoff), out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - low[i];
  return out;
}
// Feedback echo; `tail` extends the output so repeats can ring out.
function echo(x, { delay = 0.11, feedback = 0.25, wet = 0.2, tail = 0, damp = 5000 } = {}) {
  const d = frames(delay), out = new Float32Array(x.length + frames(tail)), line = new Float32Array(out.length);
  const a = 1 - Math.exp(-TAU * damp / RATE);
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    const dry = i < x.length ? x[i] : 0, back = i >= d ? line[i - d] : 0;
    y += a * (back - y);
    line[i] = dry + y * feedback;
    out[i] = dry + y * wet;
  }
  return out;
}
// Retrigger a short slice in place: a "stuck buffer" glitch.
function stutter(x, at, slice, repeats) {
  const out = Float32Array.from(x), start = frames(at), n = frames(slice);
  for (let r = 1; r <= repeats; r++) {
    for (let i = 0; i < n; i++) {
      const j = start + r * n + i;
      if (j < out.length && start + i < x.length) out[j] = x[start + i] * (1 - 0.12 * r);
    }
  }
  return out;
}

// Render a seamless loop: pitch is nudged (well under a cent) so one loop holds
// a whole number of cycles, and the loop is cut from the middle of three
// renders so filters and echoes wrap round in their steady state. The start is
// moved (within one frame) to a quiet point, and the last 2 ms fade into the
// audio that preceded the start, so even sample-and-hold effects join cleanly.
function seamlessLoop(duration, table, renderFn, { slew = 0.0015, crossfade = 88 } = {}) {
  const n = frames(duration), tick = duration / table.length;
  const tripled = (tbl) => ticks(repeat(tbl, 3), { tick, slew });
  const probe = tripled(table);
  let cycles = 0;
  for (let i = n; i < 2 * n; i++) cycles += probe(i / RATE) / RATE;
  const k = Math.round(cycles) / cycles, scaled = table.map((f) => f * k);
  const full = renderFn({ freq: tripled(scaled), tick, duration: duration * 3 });
  let start = n, best = Infinity;
  for (let i = n; i < n + frames(tick); i++) {
    const cost = Math.abs(full[i] - full[i - 1]) + 0.5 * Math.abs(full[i]);
    if (cost < best) { best = cost; start = i; }
  }
  const out = full.slice(start, start + n);
  for (let j = 0; j < crossfade; j++) {
    const w = (j + 1) / crossfade, i = n - crossfade + j;
    out[i] = out[i] * (1 - w) + full[start - crossfade + j] * w;
  }
  return out;
}

// ---------------------------------------------------------------- analysis

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// One fundamental estimate per arcade frame (0 = silent). A weighted harmonic
// sum picks the fundamental even when a bright timbre has strong overtones.
function tickPitches(x, { tick = TICK, fmin = 60, fmax = 3200, size = 8192, gate = 0.012 } = {}) {
  const n = Math.round(tick * RATE), out = [];
  const win = Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(TAU * i / (n - 1)));
  const binHz = RATE / size, lo = Math.ceil(fmin / binHz), hi = Math.floor(fmax / binHz);
  for (let start = 0; start + n <= x.length; start += n) {
    if (rms(x, start, start + n) < gate) { out.push(0); continue; }
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < n; i++) re[i] = x[start + i] * win[i];
    fft(re, im);
    const mag = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    let best = lo, bestScore = -1;
    for (let b = lo; b <= hi; b++) {
      let score = 0;
      for (let h = 1; h <= 4 && b * h < mag.length; h++) {
        let m = 0; for (let k = -2; k <= 2; k++) m = Math.max(m, mag[b * h + k] || 0);
        score += m / h;
      }
      if (score > bestScore) { bestScore = score; best = b; }
    }
    const a = mag[best - 1] || 0, b0 = mag[best], c = mag[best + 1] || 0, den = a - 2 * b0 + c;
    out.push((best + (den ? 0.5 * (a - c) / den : 0)) * binHz);
  }
  return out;
}

// Share of voiced reference frames that the test sound follows, trying small
// time offsets (a quicker attack must not count as drift). A frame matches
// within a semitone or 30 Hz. Reference frames under `minHz` are skipped: one
// arcade frame holds under 2.5 cycles there, too few to measure reliably.
// Loops compare circularly at any offset, because where a loop starts is arbitrary.
function contourMatch(reference, test, { maxLag = 3, circular = false, minHz = 150 } = {}) {
  let best = { within: 0, median: Infinity, lag: 0 };
  const voiced = reference.filter((f) => f >= minHz).length;
  const lags = circular ? Array.from({ length: test.length }, (_, i) => i) : Array.from({ length: 2 * maxLag + 1 }, (_, i) => i - maxLag);
  for (const lag of lags) {
    const diffs = [];
    let hits = 0;
    reference.forEach((f, i) => {
      const g = circular ? test[(i + lag) % test.length] : test[i + lag];
      if (!(f >= minHz && g > 0)) return;
      const d = Math.abs(12 * Math.log2(g / f));
      diffs.push(d);
      if (d <= 1 || Math.abs(g - f) <= 30) hits++;
    });
    if (!diffs.length || !voiced) continue;
    diffs.sort((p, q) => p - q);
    if (hits / voiced > best.within) best = { within: hits / voiced, median: diffs[Math.floor(diffs.length / 2)], lag };
  }
  return best;
}

module.exports = {
  RATE, TICK, frames, noteHz, clamp, value,
  gainAndFade, crossfadeLoop, mix, wavBytes, readWav, rms, peak, loudness, fadeEdges, layer,
  ticks, ramp, repeat, triangleTable, env,
  mulberry32, shapes, voice, noise,
  applyEnv, crush, decimate, lowpass, highpass, echo, stutter, seamlessLoop,
  tickPitches, contourMatch,
};
