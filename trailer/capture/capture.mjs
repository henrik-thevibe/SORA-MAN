// Records real SORA-MAN gameplay as PNG sequences, frame-exact.
// The game clock is held; each output frame advances the fixed 60 Hz sim by
// two steps (30 fps) with the autopilot steering, then copies #screen.
//   node capture/capture.mjs            all clips
//   node capture/capture.mjs classic    only the named clip(s)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIPS, PAGE_HELPERS } from "./clips.mjs";
import { serve } from "./serve.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../out/clips");

async function record(browser, base, clip) {
  const dir = path.join(OUT, clip.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 950 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((storage) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  }, { "pacman1980-muted-v1": "true", "astra-visuals-v1": clip.visuals || "juicy", ...(clip.storage || {}) });
  await page.goto(`${base}index.html#${clip.hash || ""}`);
  await page.evaluate(() => window.AstraLoader?.skip());
  await page.waitForFunction(() => window.pacmanDebug?.snapshot().titleFontStatus === "ready");
  await page.addScriptTag({ path: path.join(HERE, "autopilot.js") });
  await page.addScriptTag({ content: PAGE_HELPERS });
  await page.addScriptTag({ path: path.join(HERE, "stage.js") });
  await page.evaluate(() => {
    window.__log = []; window.__frame = 0;
    const emit = game.emit.bind(game);
    game.emit = (name, data) => { window.__log.push({ frame: window.__frame, name, data: data ?? null }); emit(name, data); };
  });
  if (clip.start) await clip.start(page);
  await page.evaluate(() => pacmanDebug.hold(true));
  if (clip.setup) await page.evaluate(clip.setup, clip.args || {});
  const script = clip.script || {};
  const t0 = Date.now(), track = [];
  for (let f = 0; f < clip.frames; f++) {
    if (typeof script[f] === "string") await page.keyboard.press(script[f]);
    else if (script[f]) await page.evaluate(script[f], clip.args || {});
    const png = await page.evaluate(({ f, steps, immortal }) => {
      window.__frame = f;
      if (immortal && !game.__immortal) { game.__immortal = true; game.killPlayer = () => {}; }
      for (let i = 0; i < steps; i++) { window.__auto.steer(); window.__beforeStep?.(); pacmanDebug.step(1); }
      const pos = (game.players || []).map((p) => [+p.x.toFixed(2), +p.y.toFixed(2), p.alive ? 1 : 0]);
      const extra = { g: game.ghosts.map((g) => [g.id, +g.x.toFixed(2), +g.y.toFixed(2), g.state]) };
      const dream = game.ruleData && game.ruleData.hallucination;
      if (dream) extra.gl = +dream.glitchLine.toFixed(2);
      if (game.items?.length) extra.it = game.items.map((it) => [it.id || it.kind, +(+it.x).toFixed(2), +(+it.y).toFixed(2)]);
      pos.push(extra);
      return { png: document.getElementById("screen").toDataURL("image/png").slice(22), pos, state: game.state };
    }, { f, steps: clip.steps ?? 2, immortal: clip.immortal !== false });
    fs.writeFileSync(path.join(dir, String(f).padStart(5, "0") + ".png"), Buffer.from(png.png, "base64"));
    track.push([png.state, ...png.pos]);
    if (f % 150 === 0) process.stdout.write(`  ${clip.name} ${f}/${clip.frames}\r`);
  }
  const log = await page.evaluate(() => window.__log.filter((e) => !["munch", "pellet"].includes(e.name)));
  const snap = await page.evaluate(() => { const s = pacmanDebug.snapshot(); return { score: s.score, state: s.state, ruleset: s.ruleset, maze: s.maze }; });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ name: clip.name, frames: clip.frames, fps: 30, width: 448, height: 576, end: snap, events: log, errors, track }, null, 1));
  console.log(`  ${clip.name}: ${clip.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s, score ${snap.score}, ${log.length} events${errors.length ? ", ERRORS: " + errors.join(" | ") : ""}`);
  await context.close();
}

const only = process.argv.slice(2);
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  for (const clip of CLIPS) if (!only.length || only.includes(clip.name)) await record(browser, base, clip);
} finally {
  await browser.close();
  server.close();
}
