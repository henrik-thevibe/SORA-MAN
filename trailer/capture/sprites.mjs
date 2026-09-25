// Exports the game's own pixel sprites (32 x 32 frames) to out/sprites/ for the edit.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/sprites");
fs.mkdirSync(OUT, { recursive: true });
const server = await serve();
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(() => window.AstraLoader?.skip());
  await page.waitForFunction(() => window.pacmanDebug?.snapshot().titleFontStatus === "ready");
  const sprites = await page.evaluate(() => {
    const Art = window.PacmanArt, out = {};
    const grab = (name, kind, opts) => { const c = Art.sprite(kind, opts); out[name] = (c.canvas || c).toDataURL(); };
    for (const skin of ["astra", "nova", "vega", "lyra"]) for (let frame = 0; frame < 4; frame++) grab(`pac-${skin}-${frame}`, "pacman", { skin, direction: 3, frame });
    for (const id of ["blinky", "pinky", "inky", "clyde"]) {
      for (let frame = 0; frame < 2; frame++) grab(`ghost-${id}-${frame}`, "ghost", { id, direction: 3, frame, state: "CHASE" });
      grab(`ghost-${id}-fright`, "ghost", { id, direction: 3, frame: 0, state: "FRIGHTENED" });
    }
    grab("gpu", "gpu", {}); grab("chip", "chip", {});
    for (const [id, p] of window.PacmanEngine.POWERUPS) grab(`pu-${id}`, "powerup", { name: p.name, color: p.color, icon: p.icon || "" });
    return out;
  });
  for (const [name, url] of Object.entries(sprites)) fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(url.split(",")[1], "base64"));
  console.log(Object.keys(sprites).length, "sprites");
} finally { await browser.close(); server.close(); }
