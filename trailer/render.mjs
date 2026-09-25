// Headless renderer for the trailer.
//   node render.mjs                     render every frame (resumable) to out/frames/
//   node render.mjs --frames=10:20      only seconds 10..20
//   node render.mjs --workers=4         parallel pages
//   node render.mjs --at=3,17.5,40      single stills to out/snaps/
//   node render.mjs --contact           contact sheets (1 frame/s) from out/frames/
//   node render.mjs --encode [--draft]  mux out/frames + out/trailer.wav -> out/sora-man-trailer.mp4
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "./capture/serve.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const FPS = 30;

function ffmpeg(list) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...list], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}

async function openStudio(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error" || m.text().startsWith("[studio]")) console.log(m.text()); });
  await page.goto(`${base}trailer/studio.html?render`);
  await page.waitForFunction(() => window.studioReady === true, null, { timeout: 180000 });
  return page;
}
const grab = (page, t, type = "jpeg") => page.evaluate(async ({ t, type }) => {
  await window.renderFrame(t);
  return document.getElementById("out").toDataURL(type === "png" ? "image/png" : "image/jpeg", 0.95).split(",")[1];
}, { t, type });

if (args.encode) {
  const src = path.join(OUT, "frames", "%05d.jpg"), audio = path.join(OUT, "trailer.wav");
  const target = path.join(OUT, args.draft ? "sora-man-trailer-draft.mp4" : "sora-man-trailer.mp4");
  const video = args.draft ? ["-vf", "scale=960:540", "-c:v", "libx264", "-crf", "26", "-preset", "veryfast"] : ["-c:v", "libx264", "-crf", "20", "-preset", "slow"];
  // Master for YouTube: two-pass loudnorm to -14 LUFS integrated, -1.5 dBTP.
  let af = [];
  if (fs.existsSync(audio)) {
    const LN = "loudnorm=I=-14:TP=-1.5:LRA=11";
    const m = spawnSync("ffmpeg", ["-hide_banner", "-i", audio, "-af", LN + ":print_format=json", "-f", "null", "-"], { encoding: "utf8" });
    const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf("{"), m.stderr.lastIndexOf("}") + 1));
    console.log(`measured ${j.input_i} LUFS, ${j.input_tp} dBTP`);
    af = ["-af", `${LN}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`];
  }
  ffmpeg(["-framerate", String(FPS), "-i", src, ...(fs.existsSync(audio) ? ["-i", audio, ...af, "-c:a", "aac", "-b:a", "256k"] : []), ...video, "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-shortest", target]);
  console.log("wrote", target);
} else if (args.contact) {
  fs.mkdirSync(path.join(OUT, "contact"), { recursive: true });
  ffmpeg(["-framerate", String(FPS), "-i", path.join(OUT, "frames", "%05d.jpg"), "-vf", "select='not(mod(n\\,30))',scale=384:-1,tile=6x4", "-vsync", "vfr", path.join(OUT, "contact", "sheet-%02d.jpg")]);
  console.log("contact sheets in out/contact/");
} else {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-gpu"] });
  try {
    if (args.heroes) {
      const page = await openStudio(browser, base);
      const d = await page.evaluate(() => { window.heroSheet(); return document.getElementById("out").toDataURL("image/png").split(",")[1]; });
      fs.writeFileSync(path.join(OUT, "heroes.png"), Buffer.from(d, "base64"));
    } else if (args.plates) {
      fs.mkdirSync(path.join(OUT, "plates"), { recursive: true });
      const page = await openStudio(browser, base);
      const plates = await page.evaluate(() => ["rays-gold", "rays-white", "maze", "splat-claude", "splat-muse", "splat-grok", "splat-gemini"].map((n) => [n, TR.plates.get(n).toDataURL("image/png").split(",")[1]]));
      for (const [n, d] of plates) fs.writeFileSync(path.join(OUT, "plates", n + ".png"), Buffer.from(d, "base64"));
    } else if (args.at) {
      fs.mkdirSync(path.join(OUT, "snaps"), { recursive: true });
      const page = await openStudio(browser, base);
      for (const t of String(args.at).split(",").map(Number)) {
        const file = path.join(OUT, "snaps", `t${t.toFixed(2).padStart(6, "0")}.jpg`);
        fs.writeFileSync(file, Buffer.from(await grab(page, t), "base64"));
        console.log("snap", file);
      }
    } else {
      const duration = await (await openStudio(browser, base)).evaluate(() => window.TIMELINE.duration);
      const [from, to] = args.frames ? String(args.frames).split(":").map(Number) : [0, duration];
      const first = Math.round(from * FPS), last = Math.min(Math.round(to * FPS), Math.round(duration * FPS));
      const dir = path.join(OUT, "frames");
      fs.mkdirSync(dir, { recursive: true });
      const workers = Number(args.workers || 3), t0 = Date.now();
      let done = 0;
      await Promise.all(Array.from({ length: workers }, async (_, k) => {
        const page = await openStudio(browser, base);
        for (let i = first + k; i < last; i += workers) {
          const file = path.join(dir, String(i).padStart(5, "0") + ".jpg");
          if (!args.force && fs.existsSync(file)) continue;
          fs.writeFileSync(file, Buffer.from(await grab(page, i / FPS), "base64"));
          if (++done % 60 === 0) console.log(`  ${done} frames, ${((Date.now() - t0) / done).toFixed(0)} ms/frame`);
        }
      }));
      console.log(`rendered ${done} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } finally { await browser.close(); server.close(); }
}
