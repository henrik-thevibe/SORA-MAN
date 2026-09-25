// Renders the README's animated cast GIFs (docs/media/cast-*.gif) from the
// 64 x 64 hero sprites in ../src/hero-art.js. No browser needed: the hero
// rasteriser is pure pixel data once the game's character art is loaded.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
const { GIFEncoder, applyPalette } = gifenc;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/media");
const ctx = vm.createContext({ Math, Uint8Array, Array, Map });
ctx.window = ctx.globalThis = ctx; ctx.TR = {};
for (const f of ["character-art.js", "trailer/src/hero-art.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { raster, N } = ctx.TR.hero;

const BG = [10, 10, 20];
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const cache = new Map();
const sprite = (kind, o) => { const k = kind + JSON.stringify(o); if (!cache.has(k)) cache.set(k, raster(kind, o)); return cache.get(k); };

// One 2.4 s loop at 10 fps: Sora chomps four times (10 fps, as in the
// trailer), ghosts wobble three times (5 fps) and each blinks once.
const TICKS = 24, DELAY = 100;
const soraAt = (t) => sprite("sora", { frame: [0, 1, 2, 3, 2, 1][t % 6] });
const ghostAt = (id, t, { blink = "auto", scared = false, offset = 0 } = {}) => {
  const frame = Math.floor(t / 2) % 4;
  if (scared) return sprite("ghost", { id, frame: frame % 2, scared: true });
  const closed = blink === "auto" ? (t + offset) % TICKS === 0 : blink;
  return sprite("ghost", { id, frame: closed ? 0 : frame, blink: closed });
};

function gif(name, { cells, scale, gap, pad }) {
  const W = cells.length * N * scale + (cells.length + 1) * gap, H = N * scale + 2 * pad;
  const enc = GIFEncoder();
  const palette = allColours(cells);
  for (let t = 0; t < TICKS; t++) {
    const rgba = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) rgba.set([...BG, 255], i * 4);
    cells.forEach((cell, c) => {
      const px = cell(t), ox = gap + c * (N * scale + gap);
      for (let i = 0; i < N * N; i++) {
        if (!px[i]) continue;
        const rgb = hex(px[i]), X = ox + (i % N) * scale, Y = pad + Math.floor(i / N) * scale;
        for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) rgba.set(rgb, ((Y + y) * W + X + x) * 4);
      }
    });
    enc.writeFrame(applyPalette(rgba, palette), W, H, { palette, delay: DELAY, repeat: 0 });
  }
  enc.finish();
  fs.writeFileSync(path.join(OUT, name), enc.bytes());
  console.log(name, W + "x" + H, (enc.bytes().length / 1024).toFixed(0) + " KB");
}
// The sprites use few, fixed colours, so one exact palette covers every frame.
function allColours(cells) {
  const seen = new Set([BG.join()]);
  for (let t = 0; t < TICKS; t++) for (const cell of cells) for (const c of cell(t)) if (c) seen.add(hex(c).join());
  if (seen.size > 256) throw new Error(`${seen.size} colours; GIF allows 256`);
  return [...seen].map((c) => c.split(",").map(Number));
}

const IDS = ["blinky", "pinky", "inky", "clyde"];
gif("cast-lineup.gif", { scale: 5, gap: 24, pad: 24, cells: [soraAt, ...IDS.map((id, i) => (t) => ghostAt(id, t, { offset: 6 * i + 3 }))] });
gif("cast-states.gif", { scale: 3, gap: 12, pad: 12, cells: IDS.flatMap((id) => [
  (t) => ghostAt(id, t, { blink: false }), (t) => ghostAt(id, t, { blink: true }), (t) => ghostAt(id, t, { scared: true }),
]) });
gif("cast-sora.gif", { scale: 4, gap: 16, pad: 16, cells: [soraAt] });
