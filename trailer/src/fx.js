/* Visual communication layer: callouts that point at the action inside the
 * gameplay, pop-art sound stickers, pellet-trail text reveals, cabinet light
 * spill, and the section backgrounds (pellet grid, synthwave, arena). */
(function () {
  "use strict";
  const { W, H, PAL, clamp, lerp, ease, hash, label, starPath, halftone } = TR;
  const F = TR.footage, C = TR.cast;

  // In-game pellet art.
  const chip = (ctx, x, y, s = 3, a = 1) => C.sprite(ctx, "chip", x, y, s, { alpha: a });
  const gpu = (ctx, x, y, s = 2, a = 1, rot = 0) => C.sprite(ctx, "gpu", x, y, s, { alpha: a, rot });

  // ---- callouts on the gameplay ----------------------------------------------
  const GHOST = {
    blinky: ["CLAUDE", "#ff7a3d"], pinky: ["MUSE", "#ffb89a"], inky: ["GROK", "#cfd3ff"], clyde: ["GEMINI", "#58e0ff"],
  };
  const PLAYERS = [["SORA", PAL.gold], ["NOVA", "#ff6fb5"], ["VEGA", PAL.cyan], ["LYRA", "#5cf07a"]];
  const row = (clip, i) => { const m = TR.meta(clip); return m.track?.[clamp(Math.round(i), 0, m.frames - 1)]; };
  const at = (p) => [p[0] * 16, p[1] * 16 + 48];

  // A small tag box in local space.
  function tagBox(ctx, text, x, y, size, fill, ink = PAL.ink) {
    ctx.save(); ctx.font = `${size}px Impact, sans-serif`; ctx.letterSpacing = "1px";
    const w = ctx.measureText(text).width + size * 0.7, h = size * 1.3;
    ctx.fillStyle = "#000"; ctx.fillRect(x - w / 2 + 4, y - h / 2 + 5, w, h);
    ctx.fillStyle = fill; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    label(ctx, text, x, y + 1, size, { fill: ink, stroke: null, spacing: 1 });
    ctx.restore();
  }
  function ring(ctx, x, y, r, color, t, dashed = false) {
    ctx.save();
    ctx.lineWidth = 9; ctx.strokeStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18;
    if (dashed) { ctx.setLineDash([r * 0.35, r * 0.25]); ctx.lineDashOffset = -t * 60; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // Pixel arrow pointing down at (x, y).
  function arrow(ctx, x, y, s, color) {
    const px = [[0, 0, 5], [1, 1, 3], [2, 2, 1]];
    ctx.save(); ctx.translate(Math.round(x), Math.round(y));
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass ? color : PAL.ink;
      const o = pass ? 0 : s * 0.6;
      ctx.fillRect(-s * 1.5 - o, -s * 5 - o, s * 3 + o * 2, s * 2.2 + o * 2);
      for (const [r, dx, n] of px) ctx.fillRect(-s * 2.5 + dx * s - o, -s * 2.8 + r * s - o, n * s + o * 2, s + o * 2);
    }
    ctx.restore();
  }

  // Labels stay this far inside the frame (the title-safe margin).
  const SAFE = 54;
  const tagSize = (ctx, text, size) => { ctx.save(); ctx.font = `${size}px Impact, sans-serif`; ctx.letterSpacing = "1px"; const w = ctx.measureText(text).width + size * 0.7; ctx.restore(); return [w, size * 1.3]; };

  function callouts(ctx, map, clip, i, spec, t) {
    const r = row(clip, i);
    if (!r) return;
    const k = map.k, extra = r[r.length - 1] || {};
    // Neon trail behind Sora.
    if (spec.trail) {
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      let prev = null;
      for (let j = 18; j >= 1; j--) {
        const q = row(clip, i - j), p = q && q[1];
        if (!p) { prev = null; continue; }
        const cur = map(...at(p));
        if (prev && Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) < 40 * k) {
          const a = 1 - j / 19;
          ctx.strokeStyle = `rgba(255,210,40,${0.85 * a})`; ctx.lineWidth = 12 * k * a + 2; ctx.shadowColor = "#ffd31a"; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.moveTo(...prev); ctx.lineTo(...cur); ctx.stroke();
        }
        prev = cur;
      }
      ctx.restore();
    }
    if (spec.item && extra.it) for (const it of extra.it) {
      const [x, y] = map(...at([it[1], it[2]]));
      ring(ctx, x, y, 17 * k, PAL.cream, t, true);
    }
    // Labels never change sides mid-shot. Where YOU sits is decided once per continuous run of
    // footage (see youSide), and each name tag keeps one fixed direction; near a frame edge a label
    // slides back inside the title-safe area instead of flipping.
    const p = r[1];
    if (spec.you && p && p[2]) {
      const [x, y] = map(...at(p)), b = Math.abs(Math.sin(t * 7)) * 8;
      const as = Math.max(8, 3.6 * k), ts = Math.max(30, 14 * k), [tw, th] = tagSize(ctx, "YOU", ts), rr = 18 * k + b, len = as * 5.5;
      const s = youSide(clip, t, x < 0 ? 1 : -1);
      ctx.save(); ctx.translate(x + s * rr, y); ctx.rotate(s < 0 ? -Math.PI / 2 : Math.PI / 2); arrow(ctx, 0, 0, as, PAL.gold); ctx.restore();
      const [cx, cy] = keepSafe(ctx, x + s * (rr + len + tw / 2), y, tw, th);
      tagBox(ctx, "YOU", cx, cy, ts, PAL.gold);
    }
    // Name tags: ghosts are named below; each versus star has its own side, so four tags never pile up.
    const nameTag = (text, x, y, gap, size, color, dir = 2) => {
      const [tw, th] = tagSize(ctx, text, size), d = DIRS4[dir];
      const [cx, cy] = keepSafe(ctx, x + d[0] * (gap + tw / 2), y + d[1] * (gap + th / 2), tw, th);
      tagBox(ctx, text, cx, cy, size, color);
    };
    if (spec.ring) for (const g of extra.g || []) {
      if (!spec.ring.includes(g[0])) continue;
      const [name, color] = GHOST[g[0]], [x, y] = map(...at([g[1], g[2]]));
      ring(ctx, x, y, (17 + Math.sin(t * 10) * 2) * k, color, t);
      nameTag(name, x, y, 22 * k + 4, Math.max(28, 13 * k), color, 2);
    }
    if (spec.tags) r.slice(1, -1).forEach((q, n) => {
      if (!q || !q[2]) return;
      const [x, y] = map(...at(q)), [name, color] = PLAYERS[n];
      ring(ctx, x, y, 15 * k, color, t);
      nameTag(name, x, y, 18 * k + 4, Math.max(24, 11 * k), color, TAG_DIR[n]);
    });
    if (spec.glitch && extra.gl !== undefined) {
      const [, y] = map(0, extra.gl * 16 + 48), x = map(448, 0)[0];
      ctx.save(); ctx.translate(x + 30, y); ctx.rotate(Math.PI / 2); arrow(ctx, 0, 0, 10, "#ff3b5c"); ctx.restore();
      tagBox(ctx, "GLITCH", x + 150, y, 44, "#ff3b5c", PAL.cream);
    }
  }

  // Up, left, down, right; versus tags: SORA above, NOVA below, VEGA right, LYRA left.
  const DIRS4 = [[0, -1], [-1, 0], [0, 1], [1, 0]], TAG_DIR = [0, 2, 3, 1];
  // Shift a label (centre cx, cy, local size w x h) just enough to sit inside the title-safe area.
  function keepSafe(ctx, cx, cy, w, h) {
    const m = ctx.getTransform(), pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => m.transformPoint(new DOMPoint(cx + sx * w / 2, cy + sy * h / 2)));
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const dx = Math.max(0, SAFE - Math.min(...xs)) - Math.max(0, Math.max(...xs) - (W - SAFE));
    const dy = Math.max(0, SAFE - Math.min(...ys)) - Math.max(0, Math.max(...ys) - (H - SAFE));
    if (!dx && !dy) return [cx, cy];
    const inv = m.inverse(), o = inv.transformPoint(new DOMPoint(0, 0)), v = inv.transformPoint(new DOMPoint(dx, dy));
    return [cx + v.x - o.x, cy + v.y - o.y];
  }

  // Which side of Sora the YOU label takes (+1 right, -1 left), fixed for each continuous run of
  // footage: consecutive segments of the same clip whose frames follow on. The label goes away from
  // the ghost that's ringed in that run, or else toward the maze's centre, judged over the whole run.
  let runs = null;
  function buildRuns() {
    runs = [];
    const segs = TIMELINE.SEGMENTS.filter((s) => s.callouts && s.callouts.you).slice().sort((a, b) => a.t0 - b.t0);
    for (const s of segs) {
      const f0 = F.indexAt(s, s.t0), f1 = F.indexAt(s, s.t1 - 1 / 60), last = runs[runs.length - 1];
      if (last && last.clip === s.clip && Math.abs(last.t1 - s.t0) < 1e-3 && Math.abs(last.f1 - f0) <= 3) { last.t1 = s.t1; last.f1 = f1; last.lo = Math.min(last.lo, f0, f1); last.hi = Math.max(last.hi, f0, f1); if (s.callouts.ring) last.ring = s.callouts.ring; }
      else runs.push({ clip: s.clip, t0: s.t0, t1: s.t1, f1, lo: Math.min(f0, f1), hi: Math.max(f0, f1), ring: s.callouts.ring || null });
    }
    for (const run of runs) {
      let px = 0, rel = 0, n = 0, m = 0;
      for (let f = Math.floor(run.lo); f <= Math.ceil(run.hi); f++) {
        const q = row(run.clip, f), s = q && q[1];
        if (!s || !s[2]) continue;
        px += s[0]; n++;
        const g = run.ring && ((q[q.length - 1] || {}).g || []).find((e) => run.ring.includes(e[0]));
        if (g) { rel += g[1] - s[0]; m++; }
      }
      run.side = m && Math.abs(rel / m) > 0.75 ? -Math.sign(rel / m) : n ? (px / n < 14 ? 1 : -1) : 0;
    }
  }
  function youSide(clip, t, fallback) {
    if (!runs) buildRuns();
    const run = runs.find((r) => r.clip === clip && t >= r.t0 - 1e-3 && t < r.t1 + 1e-3);
    return run && run.side ? run.side : fallback;
  }

  // ---- pop-art sound stickers -------------------------------------------------
  const STICKER = {
    ghostEaten: ["GULP!", PAL.cream], powerPellet: ["WAKA WAKA!", PAL.gold], powerUp: ["POWER UP!", "#ff6fd8"],
    ghostZapped: ["ZAP!", PAL.cyan], explosion: ["BOOM!", "#ff8a3d"], caught: ["CHOMP!", "#ff4a3a"], eliminated: ["OUT!", "#ff4a3a"],
  };
  function sticker(ctx, text, x, y, size, t, t0, color, o = {}) {
    const IN = 4 / 30, OUT = 6 / 30, u = t - t0, hold = o.hold ?? IN + 10 / 30;
    if (u < 0 || u > hold + OUT) return;
    const k = u < IN ? ease.outBack(u / IN, 1.9) : u > hold ? 1 - ease.inCubic((u - hold) / OUT) : 1;
    const rot = o.rot ?? (hash(Math.round(t0 * 10)) - 0.5) * 0.3, side = o.side ?? 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k);
    ctx.font = `${size}px Impact, sans-serif`;
    const w = ctx.measureText(text).width, rx = w * 0.62 + size * 0.5, ry = size * 0.95;
    // One continuous outline: the ellipse opens where the tail starts, runs out to the tip and back,
    // so the tail grows out of the balloon instead of sitting on top of it.
    const tc = Math.PI / 2 + side * 0.5, half = 0.16;
    const bubble = (dx, dy) => {
      ctx.beginPath();
      ctx.ellipse(dx, dy, rx, ry, 0, tc + half, tc - half + Math.PI * 2);
      ctx.lineTo(dx - side * rx * 0.72, dy + ry * 1.6);
      ctx.closePath();
    };
    ctx.lineJoin = "round";
    ctx.fillStyle = "#000"; bubble(8, 10); ctx.fill();
    ctx.fillStyle = color; bubble(0, 0); ctx.fill();
    ctx.save(); bubble(0, 0); ctx.clip(); ctx.fillStyle = halftone(ctx, "rgba(0,0,0,0.16)", 10, 0.3); ctx.fillRect(-rx * 2, -ry * 2, rx * 4, ry * 4); ctx.restore();
    ctx.lineWidth = 7; ctx.strokeStyle = PAL.ink; bubble(0, 0); ctx.stroke();
    label(ctx, text, 0, 4, size, { fill: PAL.ink, stroke: null, spacing: 1 });
    ctx.restore();
  }
  // Stickers for footage events in view (drawn inside a screen overlay).
  function eventStickers(ctx, map, w, clip, events, t) {
    for (const e of events) {
      const s = STICKER[e.name];
      if (!s || t < e.t || t > e.t + 0.8) continue;
      const q = row(clip, e.frame), p = q && (q[1] || [14, 17]);
      const [x0, y0] = map(...at(p));
      // Travel direction over the last few frames; the sticker sits behind it (or toward the screen's centre).
      const pq = row(clip, e.frame - 4), pp = pq && pq[1];
      // Near a screen edge it always goes toward the centre, clear of the cabinet's corner furniture.
      const dx = pp ? p[0] - pp[0] : 0, away = Math.abs(x0) > w * 0.2 || Math.abs(dx) <= 0.05 ? (x0 > 0 ? -1 : 1) : -Math.sign(dx);
      // Clear the action by 1.5 tiles plus the balloon's own half-width, so its near edge never covers the event.
      const size = Math.max(34, w * 0.07);
      ctx.save(); ctx.font = `${size}px Impact, sans-serif`; const half = ctx.measureText(s[0]).width * 0.62 + size * 0.5; ctx.restore();
      const off = 24 * map.k + half + 10;
      const x = clamp(x0 + away * off, -w * 0.36, w * 0.36), y = clamp(y0 - 24 * map.k - size * 0.6, -w * 0.58, w * 0.58);
      sticker(ctx, s[0], x, y, size, t, e.t, s[1], { side: x >= x0 ? 1 : -1 });
    }
  }

  // ---- pellet-trail reveal ------------------------------------------------------
  // Sora eats a row of in-game pellets across a line of text (centred at 0,0 in the
  // caller's space); the words appear behind him. p: 0..1 across the line.
  function revealLine(ctx, width, size, p, t, draw, o = {}) {
    if (p >= 1) return draw();
    const x0 = -width / 2 - size * 0.3, x1 = width / 2 + size * 0.3, hx = lerp(x0, x1, p);
    if (p > 0) { ctx.save(); ctx.beginPath(); ctx.rect(-5000, -size * 2, hx + 5000, size * 4); ctx.clip(); draw(); ctx.restore(); }
    const step = size * 0.55, s = Math.max(2, size / 18);
    for (let x = x0 + step * 0.5; x < x1; x += step) if (x > hx + size * 0.3) chip(ctx, x, 0, s);
    if (o.gpuEnd && hx < x1 - size * 0.3) gpu(ctx, x1, 0, s * 0.7, 1, Math.sin(t * 6) * 0.1);
    if (p > 0) C.hero(ctx, `sora-${Math.round(Math.abs(Math.sin(t * 22)) * 3)}`, hx, 0, (size * 1.3) / 64, { glow: "rgba(255,200,40,0.6)", glowSize: 20 });
  }
  // Progress for line n of a reveal starting at t0 (each line takes `per` seconds).
  const lineP = (t, t0, n, per) => clamp((t - t0 - n * per) / per);

  // A dotted pellet trail drawn from a to b over `dur`, ending on a GPU.
  function pelletLine(ctx, ax, ay, bx, by, t, t0, dur = 0.3, a = 1) {
    const p = clamp((t - t0) / dur);
    if (p <= 0) return;
    const d = Math.hypot(bx - ax, by - ay), n = Math.floor(d / 44);
    for (let j = 0; j <= n * p; j++) chip(ctx, lerp(ax, bx, j / n), lerp(ay, by, j / n), 3, a);
  }

  // ---- cabinet light spill ------------------------------------------------------
  const probe = document.createElement("canvas"); probe.width = probe.height = 1;
  const pg = probe.getContext("2d", { willReadFrequently: true });
  function spill(ctx, clip, i, x, y, r, strength = 0.35) {
    const img = TR.frame(clip, i);
    if (!img) return;
    pg.clearRect(0, 0, 1, 1); pg.drawImage(img, 0, 0, 1, 1);
    let [cr, cg, cb] = pg.getImageData(0, 0, 1, 1).data;
    const m = Math.max(cr, cg, cb, 1);
    [cr, cg, cb] = [cr, cg, cb].map((v) => Math.round((v / m) * 255));
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${strength})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // ---- backgrounds ----------------------------------------------------------------
  function pelletGrid(ctx, t, c0, c1) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const S = 96, ox = (t * 40) % S, oy = (t * 24) % S;
    for (let y = -S; y < H + S; y += S) for (let x = -S; x < W + S; x += S) {
      const ix = Math.round((x - ox) / S), iy = Math.round((y - oy) / S);
      if ((ix * 7 + iy * 3) % 11 === 0) gpu(ctx, x + ox, y + oy, 1.4, 0.35);
      else chip(ctx, x + ox, y + oy, 3, 0.4);
    }
    ctx.fillStyle = halftone(ctx, "rgba(0,0,0,0.25)", 14, 0.34); ctx.fillRect(0, 0, W, H);
  }
  function synthwave(ctx, t) {
    const hz = H * 0.64;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, "#1c0530"); sky.addColorStop(0.55, "#6a1248"); sky.addColorStop(1, "#c2385a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
    // Striped setting sun.
    const sx = W / 2, sy = hz - 40, sr = 360;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip();
    const sun = ctx.createLinearGradient(0, sy - sr, 0, sy + sr * 0.3);
    sun.addColorStop(0, "#ffd31a"); sun.addColorStop(0.55, "#ff8a3d"); sun.addColorStop(1, "#ff2bd6");
    ctx.shadowColor = "#ff8a3d"; ctx.shadowBlur = 80; ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#8a1a4e";
    for (let i = 0; i < 7; i++) { const yy = sy - 40 + i * 44 + ((t * 20) % 44), hh = 6 + i * 3; ctx.fillRect(sx - sr, yy, sr * 2, hh); }
    ctx.restore();
    // Ground with a perspective grid scrolling toward the viewer.
    const gr = ctx.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, "#2a0726"); gr.addColorStop(1, "#0c0210");
    ctx.fillStyle = gr; ctx.fillRect(0, hz, W, H - hz);
    ctx.save(); ctx.strokeStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 12;
    for (let i = 0; i < 14; i++) {
      const z = ((i + (t * 1.2) % 1) / 14), y = hz + (H - hz) * z * z;
      ctx.globalAlpha = 0.25 + 0.6 * z; ctx.lineWidth = 1 + 3 * z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 40, hz); ctx.lineTo(W / 2 + i * 260, H); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = "#ffd31a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
  }
  function arena(ctx, t) {
    ctx.fillStyle = "#0a1560"; ctx.fillRect(0, 0, W, H);
    const S = 120, o = (t * 30) % (S * 2);
    for (let y = -S * 2; y < H + S; y += S) for (let x = -S * 2; x < W + S; x += S) {
      if (((Math.round((x - o) / S) + Math.round(y / S)) & 1) === 0) continue;
      ctx.fillStyle = "#1330b0"; ctx.fillRect(x + o, y, S, S);
    }
    for (let y = 0; y < H + S; y += S) for (let x = -S * 2; x < W + S; x += S) chip(ctx, x + o, y, 3, 0.35);
    const corners = [[0, 0, PAL.gold], [0, H, "#ff6fb5"], [W, 0, PAL.cyan], [W, H, "#5cf07a"]];
    for (const [x, y, c] of corners) {
      const g = ctx.createRadialGradient(x, y, 50, x, y, 900); g.addColorStop(0, c + "55"); g.addColorStop(1, c + "00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = halftone(ctx, "rgba(0,0,0,0.25)", 14, 0.34); ctx.fillRect(0, 0, W, H);
  }

  TR.fx = { chip, gpu, callouts, sticker, eventStickers, revealLine, lineP, pelletLine, spill, pelletGrid, synthwave, arena, tagBox, STICKER };
})();
