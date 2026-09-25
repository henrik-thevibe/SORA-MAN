// Records the maze editor carving a maze, for the trailer's "BUILD YOUR OWN" line.
// The top third of a bundled maze is walled over, then real mouse drags carve its
// corridors back (mirror on), and the game preview switches on at the end.
// Frames are 448x576 like the gameplay clips, with the 448x496 grid centred.
//   node capture/editor.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { serve, GAME } from "./serve.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../out/clips/editor");
const { MAPS, encodeRows } = createRequire(import.meta.url)(path.join(GAME, "maps.js"));
const COLS = 28, CARVE_ROWS = 12, PER_FRAME = 3, PREVIEW_AT = 27, FRAMES = 60;

// The maze with its top-left block of corridors (rows 1-11, left half) walled over.
const target = MAPS[0].rows.map((row) => row.split(""));
const start = target.map((row, y) => row.map((c, x) => (y >= 1 && y < CARVE_ROWS && x >= 1 && x < COLS / 2 && (c === "." || c === "P") ? "#" : c)));
// Carve order: horizontal runs row by row, then the single tiles that link rows.
const runs = [];
for (let y = 1; y < CARVE_ROWS; y++) {
  let run = null;
  for (let x = 1; x < COLS / 2; x++) {
    const open = start[y][x] === "#" && target[y][x] !== "#";
    if (open) { if (!run) run = { y, x0: x, x1: x }; else run.x1 = x; }
    else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
}
const tiles = runs.flatMap((r) => Array.from({ length: r.x1 - r.x0 + 1 }, (_, i) => ({ x: r.x0 + i, y: r.y, first: i === 0, last: r.x0 + i === r.x1 })));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${base}tools/maze-editor.html`);
  await page.waitForSelector("#grid");
  await page.fill("#code", encodeRows(start.map((r) => r.join(""))));
  await page.click("#import");
  await page.keyboard.press("2"); // the dot brush
  const box = await page.locator("#grid").boundingBox();
  const at = (t) => [box.x + (t.x + 0.5) * (box.width / COLS), box.y + (t.y + 0.5) * (box.height / 31)];
  const grab = () => page.evaluate(() => {
    const out = document.createElement("canvas"); out.width = 448; out.height = 576;
    const g = out.getContext("2d"); g.fillStyle = "#05050c"; g.fillRect(0, 0, 448, 576);
    g.drawImage(document.getElementById("grid"), 0, 40);
    return out.toDataURL("image/png").slice(22);
  });
  let next = 0;
  for (let f = 0; f < FRAMES; f++) {
    for (let k = 0; k < PER_FRAME && next < tiles.length; k++, next++) {
      const t = tiles[next];
      await page.mouse.move(...at(t));
      if (t.first) await page.mouse.down();
      if (t.last) await page.mouse.up();
    }
    if (f === PREVIEW_AT) await page.keyboard.press("v");
    fs.writeFileSync(path.join(OUT, String(f).padStart(5, "0") + ".png"), Buffer.from(await grab(), "base64"));
  }
  // No gameplay track: the trailer frames the whole screen.
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ name: "editor", frames: FRAMES, fps: 30, width: 448, height: 576, events: [], errors: [], track: [] }, null, 1));
  console.log(`  editor: ${FRAMES} frames, ${tiles.length} tiles carved (mirrored)`);
} finally {
  await browser.close();
  server.close();
}
