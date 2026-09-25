/* Optional end-to-end runner: requires Playwright in the test environment only.
 * Serve the project locally, then run: node tests/browser.test.js http://127.0.0.1:8765/ --http-only
 * Omit --http-only only when direct-file browser testing is permitted.
 * Browser storage is isolated; the user's profile and saved scores are untouched.
 */
"use strict";
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const base = process.argv[2] || "http://127.0.0.1:8766/";
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; console.log("PASS " + label); }
const snapshot = page => page.evaluate(() => pacmanDebug.snapshot());
const frames = (page, count = 4) => page.evaluate(count => new Promise(resolve => {
  function tick() { if (--count <= 0) resolve(); else requestAnimationFrame(tick); } requestAnimationFrame(tick);
}), count);
const settled = page => page.waitForFunction(() => !pacmanDebug.snapshot().starting && !pacmanDebug.snapshot().resuming);
// The boot screen waits for a press; these checks open straight onto the title.
const skipBoot = page => page.evaluate(() => window.AstraLoader?.skip());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 950 }, deviceScaleFactor: 1.25 });
  const page = await context.newPage(), errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => requests.push(request.url()));
  try {
    await page.addInitScript(() => {
      // Delay real decoding to expose repeated-input and background-loading races.
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function (bytes) {
        return new Promise(resolve => setTimeout(resolve, 250)).then(() => decode.call(this, bytes));
      };
    });
    await page.goto(base); await skipBoot(page);
    check((await snapshot(page)).audio.sources === 0, "attract screen is silent");
    await page.evaluate(() => {
      window.startsObserved = 0;
      const start = game.startGame.bind(game);
      game.startGame = () => { startsObserved++; return start(); };
    });
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    check((await snapshot(page)).starting, "startup waits for real buffer decoding");
    check((await snapshot(page)).state === "ATTRACT", "READY timer does not run while decoding");
    await settled(page);
    let s = await snapshot(page);
    check(await page.evaluate(() => startsObserved === 1), "duplicate Start inputs create exactly one game");
    check(s.audio.decodedClips === 15 && s.audio.enabled, "all 15 buffers decode and context unlocks on a real gesture");
    check(s.audio.playingBed === "intro" && s.audio.starts === 1, "opening music starts once, with no duplicate source");
    check(await page.evaluate(() => game.pacman.wanted === 0), "direction entered during loading is preserved");
    await page.keyboard.press("p");
    await frames(page);
    s = await snapshot(page);
    const introOffset = s.audio.musicOffset, beforePixels = await page.locator("canvas").screenshot();
    await frames(page, 15);
    check(s.state === "PAUSED" && s.audio.sources === 0, "pause immediately stops opening playback");
    check((await snapshot(page)).audio.musicOffset === introOffset, "paused opening offset stays frozen");
    check(Buffer.compare(beforePixels, await page.locator("canvas").screenshot()) === 0, "paused artwork remains pixel-identical");
    await page.keyboard.press("Enter"); await settled(page); await frames(page);
    s = await snapshot(page);
    check(s.state === "READY" && s.audio.playingBed === "intro" && s.audio.musicOffset >= introOffset, "explicit resume restores opening position");
    await page.keyboard.press("m"); const mutedOffset = (await snapshot(page)).audio.musicOffset;
    await frames(page, 15); s = await snapshot(page);
    check(s.audio.muted && s.audio.sources === 0 && s.audio.musicOffset > mutedOffset, "muted music remains silent while game time advances");
    await page.keyboard.press("m"); await frames(page);
    check((await snapshot(page)).audio.playingBed === "intro", "unmute restores the current opening position");
    await page.evaluate(() => { game.ghosts = []; game.setDirection(1); });
    await page.waitForFunction(() => game.state === "PLAYING", { timeout: 6500 });
    check((await snapshot(page)).audio.playingBed === "siren0", "full opening transitions to normal siren");
    check(!requests.some(url => /\.(wav|mp3)(\?|$)/.test(url)), "game makes no runtime audio-file requests");

    // Use actual gameplay events with stationary actors for controlled sound transitions.
    await page.evaluate(() => { game.tick = () => {}; game.startRound(false); game.state = "PLAYING"; game.drainEvents(); });
    await frames(page);
    await page.evaluate(() => { game.beginFrightened(); }); await frames(page);
    check((await snapshot(page)).audio.playingBed === "frightened", "power event selects frightened recording");
    await page.evaluate(() => { game.ghosts[0].state = game.ghosts[1].state = "EATEN"; game.emit("ghostEaten"); }); await frames(page);
    check((await snapshot(page)).audio.playingBed === "returning", "returning eyes override frightened");
    const startsBeforePower = (await snapshot(page)).audio.starts;
    await page.evaluate(() => game.beginFrightened()); await frames(page);
    check((await snapshot(page)).audio.starts === startsBeforePower, "repeated power event cannot stack or restart returning loop");
    await page.evaluate(() => { game.ghosts[0].state = "HOUSE"; game.emit("ghostHome"); }); await frames(page);
    check((await snapshot(page)).audio.playingBed === "returning", "first ghost home does not stop the remaining returning ghost");
    await page.evaluate(() => { game.ghosts[1].state = "HOUSE"; game.emit("ghostHome"); }); await frames(page);
    check((await snapshot(page)).audio.playingBed === "frightened", "last ghost home restores frightened");
    await page.evaluate(() => { game.frightTimer = 0; game.dotsEaten = 228; game.finishFrightened(); }); await frames(page);
    check((await snapshot(page)).audio.playingBed === "siren4", "frightened end restores the pellet-progress siren");
    await page.evaluate(() => { game.state = "DYING"; game.emit("death"); }); await frames(page);
    check(JSON.stringify((await snapshot(page)).audio.channels) === JSON.stringify({ effect: "death" }), "death clears loops and other sound channels");

    await page.evaluate(() => { delete game.tick; game.level = 2; game.advanceLevel(); }); await frames(page);
    check((await snapshot(page)).audio.playingBed === "intermission", "intermission starts its full recording");
    await page.keyboard.press("p"); await frames(page);
    const intermissionOffset = (await snapshot(page)).audio.musicOffset;
    check((await snapshot(page)).state === "PAUSED", "intermission can be paused from keyboard");
    await page.keyboard.press("Enter"); await settled(page); await frames(page);
    check((await snapshot(page)).audio.playingBed === "intermission", "intermission resumes rather than restarting READY");
    await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await frames(page);
    check((await snapshot(page)).state === "PAUSED" && (await snapshot(page)).audio.sources === 0, "intermission focus loss silences and pauses");
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await frames(page);
    check((await snapshot(page)).state === "PAUSED", "focus return requires explicit intermission resume");
    check((await snapshot(page)).audio.musicOffset >= intermissionOffset, "intermission offset survives pause and focus loss");
    await page.keyboard.press("Enter"); await settled(page);
    await page.evaluate(() => { game.intermissionTimer = 0.03; });
    await page.waitForFunction(() => game.state === "READY"); await frames(page);
    check((await snapshot(page)).audio.playingBed === null, "post-intermission READY is silent");

    // Losing focus during the delayed first Start must not launch music off-screen.
    await page.reload(); await skipBoot(page); await page.keyboard.press("Enter");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await settled(page);
    check((await snapshot(page)).state === "PAUSED" && (await snapshot(page)).audio.sources === 0, "focus loss during preparation leaves the new game paused and silent");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    check((await snapshot(page)).state === "PAUSED", "return after loading still requires explicit resume");

    // Existing fixture runs its own layout, storage and input assertions.
    await page.goto(base + "tests/browser.html"); await page.locator("#run").click();
    await page.waitForFunction(() => !document.getElementById("run").disabled, { timeout: 20000 });
    const result = await page.locator("#results").innerText();
    console.log(result);
    check(result.includes("ALL BROWSER CHECKS PASSED"), "existing browser fixture passes at DPR 1.25");
    check(await page.locator("#sounds button").count() === 36, "review fixture exposes every bundled clip");
    await page.locator('[data-clip="siren0"]').click();
    await page.waitForFunction(() => document.getElementById("soundStatus").textContent.includes("looping"));
    check(await page.evaluate(() => review.sources.size === 1), "review sound button plays a real looping source");
    await page.locator("#stopSound").click();
    check(await page.evaluate(() => review.sources.size === 0), "review Stop cancels playback");
    await page.locator("#sequence").click();
    await page.waitForFunction(() => document.getElementById("soundStatus").textContent === "Sequence complete.", { timeout: 18000 });
    check(await page.evaluate(() => review.sources.size === 0), "scripted full sound-state sequence finishes without leaked sources");

    // File launch: no HTTP server is needed for the bank.
    if (!process.argv.includes("--http-only")) {
    const direct = await context.newPage();
    direct.on("pageerror", e => errors.push(e.message));
    await direct.goto(pathToFileURL(path.join(__dirname, "../index.html")).href); await skipBoot(direct);
    await direct.keyboard.press("Enter"); await settled(direct);
    check((await snapshot(direct)).audio.decodedClips === 36 && (await snapshot(direct)).audio.playingBed === "intro", "direct file:// launch decodes and plays the embedded sound bank");
    await direct.close();
    } else console.log("SKIP direct file launch: HTTP-only browser run");

    // Failure injection uses a separate test context, not the user's browser settings.
    const failure = await context.newPage();
    failure.on("pageerror", e => errors.push(e.message));
    await failure.addInitScript(() => { window.AudioContext = class { constructor() { throw new Error("injected unavailable device"); } }; });
    await failure.goto(base); await skipBoot(failure); await failure.keyboard.press("Enter"); await settled(failure);
    check((await snapshot(failure)).state === "READY" && (await snapshot(failure)).audio.status === "unavailable", "audio device failure still starts a playable game");
    check(await failure.locator("#mute").innerText() === "NO AUDIO", "silent fallback is visibly reported");
    await failure.evaluate(() => { game.readyTimer = 0; game.ghosts = []; }); await frames(failure);
    check((await snapshot(failure)).state === "PLAYING", "silent fallback advances into active gameplay");
    await failure.close();

    // Render the same buffers through Web Audio offline to confirm actual signal and mix headroom.
    await page.bringToFront();
    const mix = await page.evaluate(async () => {
      const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
      const g = new PacmanEngine.PacmanGame(0), a = new ArcadeAudio(g, { bank: PacmanSoundBank, contextFactory: () => ctx });
      await a.prepare();
      const levels = { siren0: 1, ghost: 1.5, extraLife: .9 };
      for (const [key, gainValue] of Object.entries(levels)) {
        const source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = a.buffers.get(key); gain.gain.value = gainValue;
        source.connect(gain); gain.connect(a.master); source.start();
      }
      const rendered = await ctx.startRendering(), data = rendered.getChannelData(0);
      let peak = 0, sum = 0; for (const sample of data) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
      return { peak, rms: Math.sqrt(sum / data.length) };
    });
    check(mix.peak > .01 && mix.peak < 1 && mix.rms > .01, `real Web Audio mix is non-silent with headroom (peak ${mix.peak.toFixed(3)}, RMS ${mix.rms.toFixed(3)})`);
    check(errors.length === 0, "no unhandled browser errors: " + errors.join("; "));
    console.log(`ALL ${checks} E2E CHECKS PASSED`);
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
