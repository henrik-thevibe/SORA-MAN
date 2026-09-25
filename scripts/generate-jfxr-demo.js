"use strict";

// Standalone audition asset generator. Nothing here is loaded by the game.
// Jfxr source: tools/jfxr (BSD-3-Clause); generated sounds are unrestricted.
const fs = require("node:fs");
const path = require("node:path");

global.self = global;
const jfxr = require("../tools/jfxr/lib/dist/jfxr.min.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "outputs", "jfxr-demo-set");
const RATE = 44100;

function sound(name, values) {
  const s = new jfxr.Sound();
  s.name = name;
  for (const [key, value] of Object.entries(values)) {
    if (!s[key] || typeof s[key].value === "undefined") throw new Error(`Unknown Jfxr parameter: ${key}`);
    s[key].value = value;
  }
  return s;
}

function render(s) {
  return new Promise((resolve) => {
    new jfxr.Synth(s.serialize()).run((clip) => resolve(clip.toFloat32Array()));
  });
}

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

function crossfadeLoop(input, frames = 176) {
  const data = Float32Array.from(input);
  frames = Math.min(frames, Math.floor(data.length / 4));
  const out = data.slice(0, data.length - frames);
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    // Fold the tail over the head, then omit that tail. The new final sample is
    // immediately before the new first sample in the original waveform.
    out[i] = data[data.length - frames + i] * (1 - t) + data[i] * t;
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

function noteHz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

async function note(midi, length, voice = "square") {
  return render(sound(`note-${midi}`, {
    waveform: voice,
    attack: 0.004,
    sustain: Math.max(0.01, length - 0.07),
    decay: 0.065,
    frequency: noteHz(midi),
    squareDuty: 32,
    harmonics: voice === "triangle" ? 1 : 0,
    harmonicsFalloff: 0.3,
    bitCrush: 11,
    lowPassCutoff: 7200,
    normalization: true,
    amplification: 70,
  }));
}

async function melody(name, sequence, duration, bass = []) {
  const parts = [];
  for (const [at, midi, length, gain = 1] of sequence) parts.push({ samples: await note(midi, length), at, gain });
  for (const [at, midi, length, gain = 0.42] of bass) parts.push({ samples: await note(midi, length, "triangle"), at, gain });
  return { name, samples: mix(parts, duration), recipe: { kind: "sequenced-jfxr", duration, sequence, bass } };
}

const CLIPS = [
  ["munch-a", "Bite A — dry downward chip crunch", false, {
    waveform: "square", sustain: 0.055, decay: 0.045, frequency: 610, frequencySweep: -410,
    frequencyDeltaSweep: 160, squareDuty: 28, squareDutySweep: 18, bitCrush: 9,
    lowPassCutoff: 5200, highPassCutoff: 85, compression: 0.82, amplification: 64,
  }],
  ["munch-b", "Bite B — answering upward chip crunch", false, {
    waveform: "square", sustain: 0.052, decay: 0.048, frequency: 355, frequencySweep: 330,
    frequencyDeltaSweep: -120, squareDuty: 42, squareDutySweep: -16, bitCrush: 9,
    lowPassCutoff: 4900, highPassCutoff: 85, compression: 0.84, amplification: 64,
  }],
  ["frightened", "Frightened bed — low unstable warning pulse", true, {
    waveform: "breaker", sustain: 0.88, decay: 0.015, frequency: 118, frequencySweep: 42,
    repeatFrequency: 8, frequencyJump1Onset: 48, frequencyJump1Amount: 58,
    tremoloDepth: 24, tremoloFrequency: 8, bitCrush: 8, lowPassCutoff: 3100,
    compression: 0.78, amplification: 50,
  }],
  ["returning", "Returning bed — bright rapid data-return arpeggio", true, {
    waveform: "triangle", sustain: 0.92, decay: 0.015, frequency: 430, frequencySweep: 80,
    repeatFrequency: 15, frequencyJump1Onset: 28, frequencyJump1Amount: 82,
    frequencyJump2Onset: 64, frequencyJump2Amount: -25, harmonics: 2, harmonicsFalloff: 0.22,
    bitCrush: 10, highPassCutoff: 150, lowPassCutoff: 8200, amplification: 48,
  }],
  ["ghost-eat", "Ghost capture — compressed digital gulp", false, {
    waveform: "breaker", sustain: 0.18, decay: 0.27, frequency: 245, frequencySweep: 1040,
    frequencyDeltaSweep: -520, repeatFrequency: 11, frequencyJump1Onset: 42,
    frequencyJump1Amount: -38, flangerOffset: 3, flangerOffsetSweep: -2,
    bitCrush: 9, compression: 0.72, amplification: 58,
  }],
  ["fruit", "Artifact pickup — crystalline two-step ping", false, {
    waveform: "whistle", sustain: 0.08, decay: 0.27, frequency: 760, frequencySweep: 420,
    frequencyJump1Onset: 34, frequencyJump1Amount: 52, harmonics: 1, harmonicsFalloff: 0.3,
    bitCrush: 12, highPassCutoff: 180, amplification: 58,
  }],
  ["extra-life", "Extra process — celebratory rising packet", false, {
    waveform: "square", sustain: 0.72, decay: 0.18, frequency: 510, frequencySweep: 250,
    repeatFrequency: 8, frequencyJump1Onset: 25, frequencyJump1Amount: 50,
    frequencyJump2Onset: 62, frequencyJump2Amount: 90, squareDuty: 28,
    bitCrush: 10, lowPassCutoff: 7400, amplification: 54,
  }],
  ["death", "Crash — descending corrupted shutdown", false, {
    waveform: "sawtooth", sustain: 1.05, decay: 0.42, frequency: 1040, frequencySweep: -930,
    frequencyDeltaSweep: -180, repeatFrequency: 9, frequencyJump1Onset: 57,
    frequencyJump1Amount: -34, vibratoDepth: 36, vibratoFrequency: 14,
    bitCrush: 9, bitCrushSweep: -4, lowPassCutoff: 6900, lowPassCutoffSweep: -4700,
    compression: 0.9, amplification: 52,
  }],
];

for (let stage = 0; stage < 5; stage++) {
  CLIPS.push([`chase-${stage}`, `Chase ${stage + 1} — escalating compute-pressure loop`, true, {
    waveform: "breaker", sustain: 1.12 - stage * 0.08, decay: 0.015,
    frequency: 132 + stage * 31, frequencySweep: 92 + stage * 34,
    repeatFrequency: 4.4 + stage * 0.8, frequencyJump1Onset: 46,
    frequencyJump1Amount: 32 + stage * 3, tremoloDepth: 13,
    tremoloFrequency: 4.4 + stage * 0.8, harmonics: 1,
    harmonicsFalloff: 0.25, bitCrush: 9, lowPassCutoff: 3700 + stage * 650,
    compression: 0.83, amplification: 46,
  }]);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];

  const intro = await melody("ai-boot", [
    [0.00, 60, 0.20], [0.24, 67, 0.20], [0.48, 64, 0.20], [0.72, 71, 0.26],
    [1.08, 62, 0.18], [1.30, 69, 0.18], [1.52, 66, 0.18], [1.74, 74, 0.30],
    [2.18, 67, 0.18], [2.40, 71, 0.18], [2.62, 76, 0.18], [2.84, 79, 0.28],
    [3.25, 78, 0.15], [3.44, 79, 0.15], [3.63, 83, 0.42],
  ], 4.15, [[0, 36, 0.7], [1.08, 38, 0.7], [2.18, 43, 0.7], [3.25, 47, 0.72]]);

  const bootCandidates = [
    {
      cue: await melody("boot-01-terminal-handshake", [
        [0.00, 55, 0.08, 0.55], [0.11, 62, 0.08, 0.62], [0.22, 67, 0.10, 0.72],
        [0.48, 71, 0.09, 0.70], [0.60, 74, 0.09, 0.78], [0.72, 79, 0.14, 0.90],
        [1.08, 67, 0.08, 0.55], [1.19, 74, 0.08, 0.65], [1.30, 79, 0.08, 0.74],
        [1.41, 83, 0.08, 0.84], [1.52, 86, 0.30, 1.00],
      ], 2.05, [[0.00, 31, 0.34, 0.34], [0.48, 35, 0.34, 0.34], [1.08, 43, 0.55, 0.38]]),
      description: "Candidate 1 — terse terminal handshake; clean, technical, and quick",
    },
    {
      cue: await melody("boot-02-arcade-launch", [
        [0.00, 60, 0.10, 0.82], [0.12, 64, 0.10, 0.82], [0.24, 67, 0.10, 0.86],
        [0.36, 72, 0.13, 0.92], [0.58, 67, 0.08, 0.68], [0.68, 72, 0.08, 0.76],
        [0.78, 76, 0.08, 0.84], [0.88, 79, 0.22, 1.00], [1.23, 84, 0.34, 1.00],
      ], 1.82, [[0.00, 36, 0.42, 0.34], [0.58, 43, 0.42, 0.36], [1.23, 48, 0.42, 0.40]]),
      description: "Candidate 2 — rapid arcade launch; bright, compact, and energetic",
    },
    {
      cue: await melody("boot-03-confident-fanfare", [
        [0.00, 55, 0.18, 0.74], [0.22, 62, 0.18, 0.78], [0.44, 67, 0.24, 0.86],
        [0.82, 59, 0.16, 0.70], [1.02, 64, 0.16, 0.76], [1.22, 71, 0.26, 0.90],
        [1.66, 67, 0.13, 0.72], [1.83, 71, 0.13, 0.78], [2.00, 74, 0.13, 0.86],
        [2.17, 79, 0.46, 1.00],
      ], 2.90, [[0.00, 31, 0.62, 0.36], [0.82, 35, 0.62, 0.36], [1.66, 43, 0.78, 0.42]]),
      description: "Candidate 3 — confident digital fanfare; heroic without sounding ceremonial",
    },
    {
      cue: await melody("boot-04-neural-awakening", [
        [0.00, 48, 0.34, 0.45], [0.31, 55, 0.30, 0.50], [0.59, 63, 0.28, 0.58],
        [0.92, 70, 0.34, 0.65], [1.33, 58, 0.20, 0.52], [1.51, 65, 0.20, 0.60],
        [1.69, 72, 0.20, 0.70], [1.87, 77, 0.28, 0.82], [2.28, 67, 0.16, 0.58],
        [2.43, 74, 0.16, 0.68], [2.58, 79, 0.16, 0.82], [2.73, 84, 0.48, 1.00],
      ], 3.48, [[0.00, 24, 0.90, 0.24], [0.92, 34, 0.78, 0.28], [1.87, 41, 1.02, 0.34]]),
      description: "Candidate 4 — mysterious neural awakening; spacious and slightly uncanny",
    },
    {
      cue: await melody("boot-05-system-online", [
        [0.00, 43, 0.14, 0.76], [0.19, 50, 0.14, 0.76], [0.38, 55, 0.20, 0.82],
        [0.72, 45, 0.14, 0.74], [0.91, 52, 0.14, 0.78], [1.10, 57, 0.20, 0.84],
        [1.46, 50, 0.12, 0.72], [1.62, 57, 0.12, 0.78], [1.78, 62, 0.12, 0.84],
        [1.94, 67, 0.22, 0.94], [2.32, 62, 0.12, 0.72], [2.48, 67, 0.12, 0.80],
        [2.64, 71, 0.12, 0.88], [2.80, 74, 0.42, 1.00],
      ], 3.45, [[0.00, 31, 0.58, 0.40], [0.72, 33, 0.58, 0.40], [1.46, 38, 0.66, 0.43], [2.32, 43, 0.74, 0.46]]),
      description: "Candidate 5 — weighty system-online march; deliberate and powerful",
    },
  ];

  const intermissionSequence = [];
  const intermissionBass = [];
  const phrase = [64, 67, 71, 72, 71, 67, 66, 69, 72, 74, 72, 69, 67, 71, 74, 79];
  for (let bar = 0; bar < 4; bar++) {
    const base = bar * 2.4;
    for (let i = 0; i < phrase.length; i++) intermissionSequence.push([base + i * 0.15, phrase[i] + (bar === 2 ? 2 : 0), 0.115, i % 4 === 0 ? 0.92 : 0.68]);
    for (let beat = 0; beat < 8; beat++) intermissionBass.push([base + beat * 0.3, [40, 40, 43, 40, 45, 43, 38, 43][beat], 0.22, 0.34]);
  }
  const intermission = await melody("neural-break", intermissionSequence, 10.2, intermissionBass);

  const sequencedCues = [
    { cue: intro, description: "Previous AI boot jingle — rejected reference" },
    ...bootCandidates,
    { cue: intermission, description: "Original neural-break intermission cue" },
  ];
  for (const { cue, description } of sequencedCues) {
    const filename = `${cue.name}.wav`;
    fs.writeFileSync(path.join(OUT, filename), wavBytes(cue.samples));
    fs.writeFileSync(path.join(OUT, `${cue.name}.recipe.json`), JSON.stringify(cue.recipe, null, 2) + "\n");
    manifest.push({ id: cue.name, filename, description, loop: false, duration: cue.samples.length / RATE });
  }

  for (const [id, description, loop, values] of CLIPS) {
    const s = sound(id, values);
    const raw = await render(s);
    const samples = loop ? crossfadeLoop(raw) : gainAndFade(raw);
    fs.writeFileSync(path.join(OUT, `${id}.wav`), wavBytes(samples));
    fs.writeFileSync(path.join(OUT, `${id}.jfxr`), s.serialize() + "\n");
    manifest.push({ id, filename: `${id}.wav`, source: `${id}.jfxr`, description, loop, duration: samples.length / RATE });
  }

  const order = ["boot-01-terminal-handshake", "boot-02-arcade-launch", "boot-03-confident-fanfare", "boot-04-neural-awakening", "boot-05-system-online", "ai-boot", "munch-a", "munch-b", "chase-0", "chase-1", "chase-2", "chase-3", "chase-4", "frightened", "returning", "ghost-eat", "fruit", "extra-life", "death", "neural-break"];
  manifest.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ generatedBy: "Jfxr 0.13.0", integrated: false, sampleRate: RATE, clips: manifest }, null, 2) + "\n");

  const row = (clip) => `<article class="${clip.id === "ai-boot" ? "rejected" : ""}"><h2>${clip.id}</h2><p>${clip.description}</p><audio controls preload="metadata" ${clip.loop ? "loop" : ""} src="${clip.filename}"></audio><small>${clip.duration.toFixed(3)} s${clip.loop ? " · loops in player" : ""}${clip.source ? ` · <a href="${clip.source}">editable Jfxr source</a>` : ` · <a href="${clip.id}.recipe.json">sequencing recipe</a>`}</small></article>`;
  const bootRows = manifest.filter((clip) => clip.id.startsWith("boot-") || clip.id === "ai-boot").map(row).join("\n");
  const approvedRows = manifest.filter((clip) => !clip.id.startsWith("boot-") && clip.id !== "ai-boot").map(row).join("\n");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Astra-Man Jfxr demo set</title><style>body{max-width:860px;margin:32px auto;padding:0 20px;background:#090c18;color:#e8edff;font:16px/1.5 system-ui}h1{color:#ffd84a}h2.section{margin-top:2.4rem;color:#ff9fd8;font:22px system-ui}article{padding:14px 0;border-top:1px solid #29304d}article h2{margin:0;color:#75e7ff;font:18px ui-monospace,monospace}article.rejected{opacity:.58}p{margin:.25rem 0 .6rem}audio{width:100%}small{display:block;color:#aab4d3;margin-top:.35rem}a{color:#ff9fd8}.note{padding:10px 12px;border:1px solid #4a3b72;background:#151126}</style><h1>Astra-Man · Jfxr demo set</h1><p>Audition only. These files are not loaded by the game. Pause one player before starting another.</p><p class="note"><strong>Choose a new boot:</strong> Candidates 1–5 are new. The dimmed original is retained only as a rejected reference.</p><h2 class="section">New boot candidates</h2>${bootRows}<h2 class="section">Approved baseline sounds</h2>${approvedRows}</html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  fs.writeFileSync(path.join(OUT, "README.md"), `# Jfxr demo sound set\n\nAudition-only candidates generated with Jfxr 0.13.0. They are not integrated into Astra-Man.\n\n- Boot candidates 1–5 are new alternatives; \`ai-boot.wav\` is the rejected reference.\n- The other 14 sounds are the unchanged approved baseline.\n- Open \`index.html\` to audition every clip.\n- One-shot and loop sounds include editable \`.jfxr\` parameter files.\n- Music cues include JSON sequencing recipes.\n- WAV output is mono, 44.1 kHz, PCM16.\n- Jfxr states generated sounds may be used without restriction; its code is BSD-3-Clause.\n\nGenerator source: \`tools/jfxr\`\n`);
  console.log(JSON.stringify({ output: OUT, clips: manifest.length, wavBytes: manifest.reduce((sum, clip) => sum + fs.statSync(path.join(OUT, clip.filename)).size, 0) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
