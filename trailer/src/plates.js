/* Painted plates, made once at load with p5.brush (seeded, so every render
 * gets identical paint) and then moved around as ordinary 2D images. */
(function () {
  "use strict";
  const plates = new Map();

  // One p5 WEBGL canvas paints a plate per frame (p5.brush flushes at the end
  // of draw); the next frame copies it out before painting the following one.
  const CW = 1920, CH = 2120;
  function paintAll(jobs, onStep) {
    return new Promise((resolve) => {
      new p5((p) => {
        brush.instance(p);
        let k = -1, t0 = 0;
        p.setup = () => {
          p.createCanvas(CW, CH, p.WEBGL);
          p.pixelDensity(1);
          brush.scaleBrushes(4);
        };
        p.draw = () => {
          if (k >= 0) {
            const [name, w, h] = jobs[k];
            const out = document.createElement("canvas"); out.width = w; out.height = h;
            out.getContext("2d").drawImage(p.canvas, 0, 0, w, h, 0, 0, w, h);
            plates.set(name, finish(name, out));
            onStep(name, performance.now() - t0);
          }
          k++;
          if (k >= jobs.length) { p.noLoop(); p.remove(); resolve(); return; }
          const [, , , seed, fn] = jobs[k];
          t0 = performance.now();
          p.clear(); p.randomSeed(seed); p.noiseSeed(seed);
          p.push(); p.translate(-CW / 2, -CH / 2); fn(p); p.pop();
        };
      });
    });
  }

  // Post-processing after painting.
  function finish(name, c) {
    const g = c.getContext("2d"), w = c.width, h = c.height;
    if (name.startsWith("splat-")) {
      // Keep only the body of the blob: thin stray strokes and specks blur below the threshold.
      const m = document.createElement("canvas"); m.width = w; m.height = h;
      const mg = m.getContext("2d"); mg.filter = "blur(10px)"; mg.drawImage(c, 0, 0); mg.filter = "none";
      const d = mg.getImageData(0, 0, w, h), px = d.data;
      for (let i = 0; i < px.length; i += 4) { const a = px[i + 3] / 255, k = Math.min(1, Math.max(0, (a - 0.18) / 0.12)); px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = k * 255; }
      mg.putImageData(d, 0, 0);
      g.globalCompositeOperation = "destination-in"; g.drawImage(m, 0, 0); g.globalCompositeOperation = "source-over";
    }
    if (name === "maze") {
      // p5.brush paints pale: push the game blue and gold back to full saturation, then bake a neon glow.
      const s = document.createElement("canvas"); s.width = w; s.height = h;
      const sg = s.getContext("2d"); sg.filter = "saturate(5) brightness(0.8) contrast(1.15)"; sg.drawImage(c, 0, 0); sg.filter = "none";
      const m = document.createElement("canvas"); m.width = w; m.height = h;
      const mg = m.getContext("2d"); mg.filter = "blur(16px)"; mg.drawImage(s, 0, 0); mg.filter = "none";
      g.clearRect(0, 0, w, h);
      g.globalAlpha = 0.85; g.drawImage(m, 0, 0); g.globalAlpha = 1; g.drawImage(s, 0, 0);
      // The game's own pellet chips and GPU power pellets.
      const map = window.PacmanEngine.CLASSIC, chip = TR.img("sprites/chip"), gpu = TR.img("sprites/gpu");
      g.imageSmoothingEnabled = false;
      for (let y = 0; y < 31; y++) for (let x = 0; x < 28; x++) {
        const v = map.pellets[y * 28 + x], img = v === 2 ? gpu : chip;
        if (!v || !img) continue;
        const sc = v === 2 ? 1.7 : 2.4, cx = 60 + x * 64 + 32, cy = 60 + y * 64 + 32;
        g.drawImage(img, cx - 16 * sc, cy - 16 * sc, 32 * sc, 32 * sc);
      }
    }
    return c;
  }

  // Sunburst: alternating painted wedges.
  const rays = (c1, c2) => (p) => {
    const W = 1800, cx = W / 2, n = 22;
    brush.noStroke();
    brush.fill(c1, 255); brush.fillBleed(0.05); brush.fillTexture(0.35, 0.3);
    brush.circle(cx, cx, cx * 0.98);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = a + Math.PI / n;
      brush.fill(c2, 230); brush.fillBleed(0.12, "out"); brush.fillTexture(0.5, 0.4);
      brush.polygon([[cx, cx], [cx + Math.cos(a) * cx, cx + Math.sin(a) * cx], [cx + Math.cos(b) * cx, cx + Math.sin(b) * cx]]);
    }
    brush.noFill();
    brush.set("marker", "rgba(255,255,255,0.5)", 1.2);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; brush.line(cx + Math.cos(a) * 120, cx + Math.sin(a) * 120, cx + Math.cos(a) * cx * 0.95, cx + Math.sin(a) * cx * 0.95); }
  };

  // The classic maze, painted: wall outlines as marker runs plus gold dots.
  const maze = (p) => {
    const E = window.PacmanEngine, map = E.CLASSIC, T = 64, ox = 60, oy = 60;
    const wall = (x, y) => y < 0 || y >= 31 || x < 0 || x >= 28 ? false : map.kinds[y][x] === "wall";
    const runs = [];
    // Horizontal edges between a wall tile and open space.
    for (let y = 0; y <= 31; y++) for (const side of [-1, 1]) {
      let start = null;
      for (let x = 0; x <= 28; x++) {
        const edge = side < 0 ? wall(x, y) && !wall(x, y - 1) : wall(x, y - 1) && !wall(x, y);
        if (edge && start === null) start = x;
        if (!edge && start !== null) { runs.push([ox + start * T + 8, oy + y * T + side * -6, ox + x * T - 8, oy + y * T + side * -6]); start = null; }
      }
    }
    for (let x = 0; x <= 28; x++) for (const side of [-1, 1]) {
      let start = null;
      for (let y = 0; y <= 31; y++) {
        const edge = side < 0 ? wall(x, y) && !wall(x - 1, y) : wall(x - 1, y) && !wall(x, y);
        if (edge && start === null) start = y;
        if (!edge && start !== null) { runs.push([ox + x * T + side * -6, oy + start * T + 8, ox + x * T + side * -6, oy + y * T - 8]); start = null; }
      }
    }
    brush.noFill();
    // The game's SORA maze blue with a light neon core; gold pellets.
    brush.set("marker", "#284bff", 4.2);
    for (const [a, b, c, d] of runs) brush.line(a, b, c, d);
    brush.set("pen", "#8fb0ff", 1.6);
    for (const [a, b, c, d] of runs) brush.line(a, b, c, d);
    // Pellets are stamped from the game's sprites in finish().
  };

  // A watercolour splat for card backdrops.
  const splat = (color) => (p) => {
    const c = 450;
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = 260 + p.random(-70, 70) - k * 40; pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]); }
      brush.noStroke(); brush.fill(color, 150); brush.fillBleed(0.3, "out"); brush.fillTexture(0.6, 0.5);
      brush.polygon(pts);
    }
  };

  async function build(onStep = () => {}) {
    const jobs = [
      ["rays-gold", 1800, 1800, 11, rays("#ff9d00", "#ffd84a")],
      ["rays-red", 1800, 1800, 12, rays("#b3200f", "#f0552e")],
      ["rays-night", 1800, 1800, 13, rays("#0b0b26", "#1f1f5e")],
      // Neutral texture for tinted sunbursts (multiplied over any hue).
      ["rays-white", 1800, 1800, 15, rays("#c8c8c8", "#f4f4f4")],
      ["maze", 28 * 64 + 120, 31 * 64 + 120, 14, maze],
      ["splat-claude", 900, 900, 21, splat("#e8673c")],
      ["splat-muse", 900, 900, 22, splat("#ff9fb0")],
      ["splat-grok", 900, 900, 23, splat("#5b5f8a")],
      ["splat-gemini", 900, 900, 24, splat("#4fb8ff")],
    ];
    await paintAll(jobs, onStep);
  }
  TR.plates = { build, get: (n) => plates.get(n) };
})();
