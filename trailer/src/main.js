/* Studio: loads everything, exposes renderFrame(t) for the headless renderer,
 * and gives a scrub/play preview when opened in a browser. */
(async function () {
  "use strict";
  const canvas = document.getElementById("out"), ctx = canvas.getContext("2d");
  const params = new URLSearchParams(location.search);
  if (params.has("render")) document.body.classList.add("render");

  // Offscreen layers for transitions.
  const layer = () => { const c = document.createElement("canvas"); c.width = TR.W; c.height = TR.H; return c; };
  const LA = layer(), LB = layer();
  function drawShot(target, name, t) {
    const g = target.getContext("2d");
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.imageSmoothingEnabled = true; g.filter = "none";
    g.fillStyle = "#000"; g.fillRect(0, 0, TR.W, TR.H);
    TR.shots[name](g, t);
    g.restore();
  }
  // One picture (shot or transition) at time t, no post.
  function drawPicture(target, t) {
    const tr = TIMELINE.transitionAt(t);
    let shot = TIMELINE.shotAt(t);
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0); target.globalAlpha = 1; target.globalCompositeOperation = "source-over"; target.filter = "none";
    if (tr) {
      const from = TIMELINE.shotNamed(tr.from), to = TIMELINE.shotNamed(tr.to);
      TR.inTransition = true;
      drawShot(LA, tr.from, Math.min(t, from.t1 - 1 / 30));
      drawShot(LB, tr.to, Math.max(t, to.t0));
      TR.inTransition = false;
      const p = TR.clamp((t - (tr.at - tr.dur / 2)) / tr.dur);
      TR.transitions[tr.type](target, LA, LB, p, tr, t);
      shot = p < 0.5 ? from : to;
    } else {
      target.fillStyle = "#000"; target.fillRect(0, 0, TR.W, TR.H);
      const [kx, ky] = TIMELINE.shakeAt(t);
      if (kx || ky) { target.translate(TR.W / 2 + kx, TR.H / 2 + ky); target.scale(1.01, 1.01); target.translate(-TR.W / 2, -TR.H / 2); }
      TR.shots[shot.name](target, t);
    }
    target.restore();
    return shot;
  }
  // Motion blur: inside a blur window, average sub-frames across a 180 degree shutter.
  const SUB = layer(), SAMPLES = 5;
  function draw(t) {
    let shot;
    if (TIMELINE.blurAt(t) && !params.has("noblur")) {
      const sg = SUB.getContext("2d");
      for (let k = 0; k < SAMPLES; k++) {
        const st = t + ((k + 0.5) / SAMPLES - 0.5) / 60;
        const s = drawPicture(k === 0 ? ctx : sg, st);
        if (k === Math.floor(SAMPLES / 2)) shot = s;
        if (k > 0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 / (k + 1); ctx.drawImage(SUB, 0, 0); ctx.restore(); }
      }
    } else shot = drawPicture(ctx, t);
    // Post: bloom, grade, impact aberration, vignette, grain, letterbox.
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    TR.bloom(ctx, 0.3);
    TR.grade(ctx);
    let ca = 0;
    for (const h of TIMELINE.PUNCH) if (t >= h && t < h + 0.22) ca = Math.max(ca, 10 * (1 - (t - h) / 0.22));
    TR.aberration(ctx, ca);
    TR.vignette(ctx, shot.name === "tribute" ? 0.8 : 0.5);
    TR.grain(ctx, t, 0.09);
    // Cinematic bars through the cold open, snapping away into the first ghost.
    const cut = TIMELINE.shotNamed("hunters").t0;
    TR.letterbox(ctx, t < cut - 0.1 ? 1 : 1 - TR.ease.inCubic(TR.clamp((t - (cut - 0.1)) / 0.15)));
    ctx.restore();
    return shot;
  }
  // Draw; if footage frames were missing, load them and draw again.
  async function renderFrame(t) {
    let shot = draw(t);
    for (let i = 0; i < 3 && (await TR.fill()); i++) shot = draw(t);
    return shot.name;
  }

  const t0 = performance.now();
  await TR.loadAll();
  TR.hero.build();
  // Review sheet: each hero beside its in-game 32px sprite at the same size.
  window.heroSheet = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#0a0a14"; ctx.fillRect(0, 0, TR.W, TR.H); ctx.imageSmoothingEnabled = false;
    const rows = [["sora-0", "pac-astra-0"], ["sora-2", "pac-astra-2"], ["blinky-0", "ghost-blinky-0"], ["pinky-0", "ghost-pinky-0"], ["inky-0", "ghost-inky-0"], ["clyde-0", "ghost-clyde-0"], ["blinky-scared-0", "ghost-blinky-fright"], ["clyde-blink", null]];
    rows.forEach(([h, s], i) => {
      const x = 40 + (i % 4) * 470, y = 60 + Math.floor(i / 4) * 500;
      ctx.drawImage(TR.hero.get(h), x, y, 256, 256);
      if (s) ctx.drawImage(TR.img("sprites/" + s), x + 270, y + 64, 128, 128);
      TR.label(ctx, h, x + 128, y + 300, 28, { fill: "#fff", stroke: null });
    });
    ["blinky", "pinky", "inky", "clyde", "sora"].forEach((id, i) => { for (let f = 0; f < 4; f++) ctx.drawImage(TR.hero.get(id === "sora" ? `sora-${f}` : `${id}-${f}`), 40 + i * 370 + f * 88, 930, 80, 80); });
  };
  await TR.plates.build((name, ms) => console.log(`[studio] plate ${name} ${ms.toFixed(0)}ms`));
  console.log(`[studio] ready in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  window.renderFrame = renderFrame;
  window.studioReady = true;
  if (params.has("render")) return;

  // Preview UI.
  const scrub = document.getElementById("scrub"), clock = document.getElementById("clock"), label = document.getElementById("shot"), play = document.getElementById("play");
  scrub.max = TIMELINE.duration;
  let playing = false, start = 0, from = Number(params.get("t") || 0);
  async function show(t) { const name = await renderFrame(t); scrub.value = t; clock.textContent = t.toFixed(2); label.textContent = name; }
  scrub.addEventListener("input", () => { playing = false; play.textContent = "Play"; show(Number(scrub.value)); });
  play.addEventListener("click", () => { playing = !playing; play.textContent = playing ? "Pause" : "Play"; from = Number(scrub.value); start = performance.now(); if (playing) loop(); });
  async function loop() {
    if (!playing) return;
    const t = from + (performance.now() - start) / 1000;
    if (t >= TIMELINE.duration) { playing = false; play.textContent = "Play"; return; }
    await show(t);
    requestAnimationFrame(loop);
  }
  show(from);
})();
