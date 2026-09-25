/* Boot screen. The game loads behind "PRESS ANY KEY"; the press unlocks sound
 * (browsers allow audio only after a gesture), then Astra chomps across the bar
 * in time with the boot sound and the gold covers slide apart onto the title.
 * Timing comes from boot-timeline.js, which the boot sound was built from.
 * A second press skips to the title. */
(function (root) {
  "use strict";
  const overlay = document.getElementById("loader");
  const bar = document.getElementById("loader-bar");
  const label = document.getElementById("loader-label");
  const hint = overlay?.querySelector(".loader-hint");
  if (!overlay || !bar) return;
  const BOOT = root.AstraBootTimeline;
  const ctx = bar.getContext("2d");
  const W = bar.width, H = bar.height, { sprite: SPRITE, left: LEFT, right: RIGHT, chipGap: CHIP_GAP, firstChip, chipLimit } = BOOT.bar;
  const reduced = root.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const touch = root.matchMedia?.("(pointer: coarse)").matches;
  // Scripts arrive in document order; each global marks one more module ready.
  const MODULES = ["PacmanEngine", "AstraCharacters", "AstraItems", "PacmanArt", "PacmanSoundBank", "ArcadeAudio", "ArcadeControls", "game"];
  const tasks = [];
  // gate: waiting for the press; booting: pressed, waiting for the game and its
  // sound; waiting: the sound is decoding; intro: the timed sequence; done: covers opening or gone.
  let phase = "gate", shown = 0, finished = false, introStart = 0, sound = null, frames = new Map();
  const timers = [];

  function astraFrame(frame) {
    if (frames.has(frame)) return frames.get(frame);
    const pixels = root.AstraCharacters?.raster("pacman", { direction: 3, frame });
    if (!pixels) return null;
    const image = document.createElement("canvas");
    image.width = image.height = SPRITE;
    const c = image.getContext("2d");
    pixels.forEach((color, i) => { if (color) { c.fillStyle = color; c.fillRect(i % SPRITE, Math.floor(i / SPRITE), 1, 1); } });
    frames.set(frame, image);
    return image;
  }

  function loaded() {
    const modules = MODULES.filter(name => root[name]).length / MODULES.length;
    const settled = tasks.length ? tasks.filter(task => task.done).length / tasks.length : 1;
    return modules * (0.66 + 0.34 * settled);
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const x = LEFT + (RIGHT - LEFT) * shown, mid = H / 2;
    // Chips still ahead of Astra; the ones behind have been eaten.
    for (let cx = firstChip; cx < chipLimit; cx += CHIP_GAP) {
      if (cx < x + SPRITE / 2 + 2) continue;
      ctx.fillStyle = "#b87313"; ctx.fillRect(cx - 4, mid - 4, 8, 8);
      ctx.fillStyle = "#ffe52c"; ctx.fillRect(cx - 3, mid - 3, 6, 6);
      ctx.fillStyle = "#15141c"; ctx.fillRect(cx - 1, mid - 1, 2, 2);
    }
    // Astra waits with her mouth half open at the gate and chomps once booting.
    const cycle = [0, 1, 2, 3, 2, 1], still = phase === "gate" || phase === "booting" || phase === "waiting";
    const sprite = astraFrame(still ? 2 : cycle[Math.floor(time / 50) % cycle.length]);
    if (sprite) ctx.drawImage(sprite, Math.round(x), Math.round(mid - SPRITE / 2));
    else { ctx.fillStyle = "#ffe52c"; ctx.fillRect(Math.round(x) + 6, mid - 10, 20, 20); }
  }

  function setText(text, hintText) {
    if (label.textContent !== text) label.textContent = text;
    if (hint && hint.textContent !== hintText) hint.textContent = hintText;
  }

  function tick(now) {
    if (phase === "done") return;
    if (phase === "gate" || phase === "booting" || phase === "waiting") {
      const blink = reduced || Math.floor(now / 500) % 2 === 0;
      if (phase === "gate") setText(blink ? (touch ? "TAP TO BOOT" : "PRESS ANY KEY") : "", finished ? "READY" : "DENOISING " + Math.round(loaded() * 100) + "%");
      else setText("GENERATING", "DENOISING " + Math.round(loaded() * 100) + "%");
      if (phase === "booting" && finished) beginIntro();
    } else {
      const t = (now - introStart) / 1000;
      // The sweep is the boot sound's picture, so it always runs in time with it
      // (reduced motion only swaps the covers' slide for a fade).
      shown = BOOT.progress(t);
      setText(t >= BOOT.complete ? "GENERATION COMPLETE" : "DENOISING " + String(Math.round(shown * 100)).padStart(3, " ") + "%", touch ? "TAP TO SKIP" : "PRESS ANY KEY TO SKIP");
      if (t >= BOOT.reveal) reveal(BOOT.covers[0] - BOOT.reveal, BOOT.covers[1] - BOOT.covers[0]);
    }
    draw(now);
    if (phase !== "done") requestAnimationFrame(tick);
  }

  // The press: create and resume the audio context inside the gesture, so the
  // game's sound (which reuses it) is allowed to play.
  function boot() {
    if (phase !== "gate") return;
    phase = "booting";
    const Context = root.AudioContext || root.webkitAudioContext;
    if (Context && !root.AstraAudioContext) {
      try { root.AstraAudioContext = new Context(); Promise.resolve(root.AstraAudioContext.resume?.()).catch(() => {}); }
      catch (_) { /* No sound; the boot still plays silently. */ }
    }
    // Never strand the player: if the game never reports in, open anyway.
    timers.push(setTimeout(() => { if (phase === "booting") { finished = true; beginIntro(); } }, 10000));
  }

  function beginIntro() {
    if (phase !== "booting") return;
    // Wait (briefly) for the sound bank to decode, then start picture and sound together.
    const ready = sound ? Promise.race([Promise.resolve(sound.prepare()).catch(() => false), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
    phase = "waiting";
    ready.then(() => {
      if (phase !== "waiting") return;
      phase = "intro"; introStart = performance.now();
      sound?.play("bootIntro");
      timers.push(setTimeout(() => sound?.titleReady(), BOOT.menuBed * 1000));
    });
  }

  // The covers wait `delay` seconds, then part (or fade) over `time` seconds.
  function reveal(delay = reduced ? 0 : 0.3, time = reduced ? 0.3 : 1) {
    if (phase === "done") return;
    phase = "done"; shown = 1; draw(performance.now());
    overlay.style.setProperty("--cover-delay", delay * 1000 + "ms");
    overlay.style.setProperty("--cover-time", time * 1000 + "ms");
    overlay.classList.add("is-done");
    api.active = false;
    document.documentElement.classList.remove("is-loading");
    // Transitions end the overlay; a timer covers browsers that skip them.
    setTimeout(() => overlay.remove(), (delay + time) * 1000 + 100);
    root.dispatchEvent(new Event("astraloaded"));
  }

  // A second press skips the intro: the covers open now and the sting plays.
  function skipIntro() {
    timers.forEach(clearTimeout); timers.length = 0;
    if (phase === "intro") { sound?.stop("bootIntro"); sound?.play("titleSting"); }
    // The covers open with the sting and finish as it rings out.
    reveal(0, 1.1);
    timers.push(setTimeout(() => sound?.titleReady(), 900));
  }

  function checkDone() {
    if (!finished && root.game && tasks.every(task => task.done)) finished = true;
  }

  function press(event) {
    if (!api.active) return;
    // The loader owns input until the covers open; nothing reaches the game.
    if (event.type === "keydown") {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key === "Tab") return;
      event.preventDefault();
      if (event.repeat) return;
    }
    event.stopImmediatePropagation();
    if (phase === "gate") boot();
    else if (phase === "intro") skipIntro();
  }

  const api = {
    active: true,
    get phase() { return phase; },
    // Track a promise (or function returning one) as part of the load.
    track(work) {
      const task = { done: false };
      tasks.push(task);
      Promise.resolve().then(typeof work === "function" ? work : () => work)
        .catch(() => {}).finally(() => { task.done = true; checkDone(); });
    },
    // Called by game.js once every module is running.
    ready() { Promise.resolve().then(checkDone); setTimeout(checkDone, 0); },
    // game.js hands over its sound: prepare() decodes, play/stop(name) the boot cues,
    // titleReady() lets the title loop start.
    useSound(hooks) { sound = hooks; },
    // Test and embed hook: open straight onto the title, silently.
    skip() { finished = true; timers.forEach(clearTimeout); reveal(); sound?.titleReady(); },
  };
  root.AstraLoader = api;
  document.documentElement.classList.add("is-loading");
  // Click, not pointerdown: on touch only the release grants the activation audio needs.
  overlay.addEventListener("click", press, true);
  root.addEventListener("keydown", press, true);
  requestAnimationFrame(tick);
})(window);
