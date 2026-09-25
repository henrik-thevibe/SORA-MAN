/* Core helpers: timing, easing, seeded noise, poster type, halftone, camera. */
(function (root) {
  "use strict";
  const W = 1920, H = 1080, FPS = 30, BPM = 128;
  const BEAT = 60 / BPM, BAR = BEAT * 4;
  const bar = (n) => n * BAR;
  const beat = (n) => n * BEAT;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => clamp((v - a) / (b - a));
  const ease = {
    linear: (t) => t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t, s = 1.9) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
    outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  };
  // A pop-in: 0 before `at`, overshoots to 1 over `dur` seconds.
  const pop = (t, at, dur = 0.35) => (t < at ? 0 : ease.outBack(clamp((t - at) / dur)));
  const fade = (t, a, b) => inv(a, b, t);

  // Deterministic hash noise: same input, same output, every render.
  function hash(n) {
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  const rand = (a, b = 0) => hash(Math.floor(a * 1000) * 7919 + b * 104729);
  function noise1(x, seed = 0) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(hash(i * 31 + seed * 977), hash((i + 1) * 31 + seed * 977), u) * 2 - 1;
  }
  // Camera shake that decays after a hit at `at`.
  function shake(t, at, power = 18, dur = 0.4, seed = 1) {
    if (t < at || t > at + dur) return [0, 0];
    const k = Math.pow(1 - (t - at) / dur, 2) * power;
    return [noise1(t * 40, seed) * k, noise1(t * 40, seed + 7) * k];
  }

  const PAL = {
    ink: "#0a0a14", night: "#11112a", gold: "#ffd21f", goldHi: "#fff27a", goldDeep: "#f29a12", amber: "#c85a0a",
    red: "#e8352b", blue: "#2a4fff", neon: "#4f7bff", cyan: "#35e7eb", pink: "#ff6fb5", cream: "#fff3d6",
    claude: "#e8673c", muse: "#ffd8c2", grok: "#1b1b22", gemini: "#6fd3ff", glitch: "#ff2bd6",
  };

  // Poster display type: Crackman with a black keyline and stacked colour extrusions.
  function posterText(ctx, text, x, y, size, o = {}) {
    const { fill = PAL.gold, shadows = [PAL.red, PAL.blue], depth = size * 0.06, line = size * 0.09, align = "center", font = "AstraTitle", skew = 0, rot = 0, spacing = 0, keyline = PAL.ink, glow = null } = o;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.font = `${size}px "${font}"`;
    ctx.textAlign = align; ctx.textBaseline = "middle";
    if (spacing) ctx.letterSpacing = `${spacing}px`;
    ctx.lineJoin = "round"; ctx.miterLimit = 2;
    shadows.forEach((c, i) => {
      const d = depth * (shadows.length - i);
      ctx.lineWidth = line; ctx.strokeStyle = keyline; ctx.strokeText(text, d, d);
      ctx.fillStyle = c; ctx.fillText(text, d, d);
    });
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.4; }
    ctx.lineWidth = line; ctx.strokeStyle = keyline; ctx.strokeText(text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // Heavy condensed sans for poster sub-lines.
  function label(ctx, text, x, y, size, o = {}) {
    const { fill = PAL.cream, align = "center", font = "Impact, 'Arial Black', sans-serif", stroke = PAL.ink, line = size * 0.14, rot = 0, spacing = 1, alpha = 1, weight = "" } = o;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.letterSpacing = `${spacing}px`;
    ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.strokeText(text, 0, 0); }
    ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // Monospace terminal text (boot lines, tribute), with an optional keyline.
  function mono(ctx, text, x, y, size, o = {}) {
    const { fill = PAL.cream, align = "center", alpha = 1, spacing = 4, stroke = null, line = size * 0.22 } = o;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `${size}px "AstraTitle"`;
    ctx.letterSpacing = `${spacing}px`;
    ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
    ctx.restore();
  }
  // Exit envelope: 1 until `at`, then eases to 0 over `dur`.
  const exit = (t, at, dur = 0.22) => (at === undefined ? 1 : 1 - ease.inCubic(clamp((t - at) / dur)));
  // Static noise ("denoise") at low resolution, scaled up.
  let noiseCanvas = null;
  function staticNoise(ctx, t, alpha, block = 4) {
    if (alpha <= 0) return;
    const w = Math.ceil(W / block), h = Math.ceil(H / block);
    if (!noiseCanvas || noiseCanvas.width !== w) { noiseCanvas = document.createElement("canvas"); noiseCanvas.width = w; noiseCanvas.height = h; }
    const g = noiseCanvas.getContext("2d"), img = g.createImageData(w, h), f = Math.floor(t * 30);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const v = hash(i * 7 + f * 100003) * 255, c = hash(i + f * 31);
      img.data[p] = v * (c < 0.1 ? 1.2 : 1); img.data[p + 1] = v * (c > 0.9 ? 0.6 : 1); img.data[p + 2] = v * (c > 0.5 ? 1.15 : 1); img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    ctx.save(); ctx.globalAlpha = clamp(alpha); ctx.imageSmoothingEnabled = false; ctx.drawImage(noiseCanvas, 0, 0, W, H); ctx.restore();
  }
  // Typewriter reveal of `text` from `at` at `cps` characters per second.
  const typed = (text, t, at, cps = 24) => text.slice(0, Math.max(0, Math.floor((t - at) * cps)));

  // Cached halftone dot patterns.
  const patterns = new Map();
  function halftone(ctx, color, cell = 10, dot = 0.35) {
    const key = color + cell + dot;
    if (!patterns.has(key)) {
      const c = document.createElement("canvas"); c.width = c.height = cell;
      const g = c.getContext("2d"); g.fillStyle = color;
      g.beginPath(); g.arc(cell / 2, cell / 2, cell * dot, 0, Math.PI * 2); g.fill();
      patterns.set(key, ctx.createPattern(c, "repeat"));
    }
    return patterns.get(key);
  }
  function scanlines(ctx, alpha = 0.18, gap = 4) {
    const key = "scan" + gap;
    if (!patterns.has(key)) {
      const c = document.createElement("canvas"); c.width = 1; c.height = gap;
      const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 1, gap / 2);
      patterns.set(key, ctx.createPattern(c, "repeat"));
    }
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = patterns.get(key); ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function vignette(ctx, strength = 0.65) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function flash(ctx, a, color = "#fff") {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  // Film grain from a small noise tile, offset per frame.
  let grainTile = null;
  function grain(ctx, t, alpha = 0.07) {
    if (!grainTile) {
      grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256;
      const g = grainTile.getContext("2d"), img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) { const v = hash(i) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }
    const f = Math.floor(t * FPS);
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = "overlay";
    ctx.translate(-(hash(f) * 256) | 0, -(hash(f + 3) * 256) | 0);
    ctx.fillStyle = ctx.createPattern(grainTile, "repeat"); ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  }
  // Radial sunburst rays (poster backdrop).
  function sunburst(ctx, x, y, rays, r, rot, c1, c2) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c2;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2, w = Math.PI / rays;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a, a + w); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // Starburst badge path.
  function starPath(ctx, x, y, points, r1, r2, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (i / (points * 2)) * Math.PI * 2, r = i % 2 ? r2 : r1;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  // Speed lines radiating from a focus point.
  function speedLines(ctx, t, x, y, color = "rgba(255,255,255,0.5)", n = 48, inner = 380) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineCap = "round";
    const f = Math.floor(t * 15);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(i + f * 97) * 0.1, len = 200 + hash(i * 3 + f) * 600, r = inner + hash(i * 5 + f) * 200;
      ctx.lineWidth = 2 + hash(i * 7) * 5;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * (r + len), y + Math.sin(a) * (r + len)); ctx.stroke();
    }
    ctx.restore();
  }

  // A deterministic burst of pellets, power pellets and spark streaks from (x, y), fired at t0.
  function burst(ctx, t, t0, x, y, seed = 1, o = {}) {
    const u = t - t0, life = o.life ?? 1.6, n = o.n ?? 46;
    if (u < 0 || u > life) return;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const a = hash(seed * 97 + i) * Math.PI * 2, sp = 700 + hash(seed * 31 + i * 7) * 1300, drag = Math.exp(-u * 2.2);
      const d = (sp * (1 - drag)) / 2.2, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8 + 380 * u * u;
      const k = 1 - u / life, kind = i % 7;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (kind === 0) {
        // Streak along its motion.
        ctx.strokeStyle = "#fff6c8"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(a) * 70 * drag, py - Math.sin(a) * 56 * drag); ctx.stroke();
      } else {
        // The game's own art: GPU chips (power pellets) and pellet chips.
        const rot = u * (hash(i) * 8 - 4);
        TR.cast.sprite(ctx, kind === 1 ? "gpu" : "chip", px, py, kind === 1 ? 2 : 4, { rot });
      }
    }
    ctx.restore();
  }

  // ---- post pass: one grade over the whole film ---------------------------------
  const post = { small: null, tmp: null };
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  function bloom(ctx, amount = 0.35) {
    post.small = post.small || mk(W / 4, H / 4);
    const g = post.small.getContext("2d");
    g.filter = "brightness(0.75) contrast(2.6) blur(6px)"; g.globalCompositeOperation = "copy";
    g.drawImage(ctx.canvas, 0, 0, W / 4, H / 4); g.filter = "none"; g.globalCompositeOperation = "source-over";
    ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = amount; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(post.small, 0, 0, W, H); ctx.restore();
  }
  function grade(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.14;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#ffcf7a"); g.addColorStop(1, "#ffb060");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Lift the blacks a touch toward blue, so shadows stay rich rather than dead.
    ctx.globalCompositeOperation = "lighten"; ctx.globalAlpha = 1; ctx.fillStyle = "#07061a"; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // Red/cyan channel split, offset px each way.
  function aberration(ctx, px) {
    if (px < 0.5) return;
    post.tmp = post.tmp || mk(W, H);
    const g = post.tmp.getContext("2d");
    g.globalCompositeOperation = "copy"; g.drawImage(ctx.canvas, 0, 0);
    g.globalCompositeOperation = "multiply"; g.fillStyle = "#ff0000"; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-in"; g.drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "#00ffff"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "copy"; ctx.drawImage(ctx.canvas, -px, 0);
    ctx.globalCompositeOperation = "lighter"; ctx.drawImage(post.tmp, px, 0);
    ctx.restore();
  }
  function letterbox(ctx, k) {
    if (k <= 0) return;
    const h = Math.round(138 * k);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
  }

  root.TR = Object.assign(root.TR || {}, { burst, bloom, grade, aberration, letterbox, W, H, FPS, BPM, BEAT, BAR, bar, beat, clamp, lerp, inv, ease, pop, fade, hash, rand, noise1, shake, PAL, posterText, label, mono, typed, halftone, scanlines, vignette, flash, grain, sunburst, starPath, speedLines, exit, staticNoise });
})(typeof globalThis !== "undefined" ? globalThis : this);
