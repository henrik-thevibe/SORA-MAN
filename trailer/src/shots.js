/* Shot artwork. Each shot draws the whole frame for global time t. */
(function () {
  "use strict";
  const { W, H, PAL, BEAT, clamp, lerp, inv, ease, pop, hash, shake, burst, posterText, label, mono, typed, halftone, flash, sunburst, speedLines, starPath, exit, staticNoise } = TR;
  const { B, BAR, SEGMENTS, TYPING } = TIMELINE;
  const C = TR.cast, K = TR.cards, F = TR.footage;
  const HF = C.heroFrame, REV = TIMELINE.REVEALS;
  // Sora's in-game palette (backdrops.js, astra).
  const SUN = { paint: "#ffd31a", shade: "#e0a812", light: "#fff27a", ink: "#3a2606", deep: "#0f0b04" };

  // ---- shared bits -----------------------------------------------------------
  function fill(ctx, color) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); }
  function plate(ctx, name, x, y, scale = 1, rot = 0, alpha = 1) {
    const p = TR.plates.get(name);
    if (!p) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.drawImage(p, -p.width / 2, -p.height / 2);
    ctx.restore();
  }
  function tone(ctx, color = "rgba(0,0,0,0.22)", cell = 12, dot = 0.32) { ctx.fillStyle = halftone(ctx, color, cell, dot); ctx.fillRect(0, 0, W, H); }
  function mazeBack(ctx, t, dim = 0.2, rot = -0.14, scale = 0.95, dx = 0, soft = 0) {
    fill(ctx, "#04071c");
    ctx.save(); if (soft) ctx.filter = `blur(${soft}px)`;
    plate(ctx, "maze", W / 2 + dx + Math.sin(t * 0.2) * 40, H / 2 + Math.cos(t * 0.17) * 30, scale, rot);
    ctx.restore();
    fill(ctx, `rgba(4,8,40,${dim})`);
  }
  // Local darkening behind a footage screen, so a bright background never fights the gameplay.
  function shade(ctx, x, y, r, a = 0.7) {
    const g = ctx.createRadialGradient(x, y, r * 0.35, x, y, r);
    g.addColorStop(0, `rgba(2,4,20,${a})`); g.addColorStop(1, "rgba(2,4,20,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // Crisp vector sunburst with a painted plate multiplied over it for texture.
  const RAYS = { "rays-gold": ["#ff9d00", "#ffcf2e"], "rays-red": ["#b3200f", "#ef4b2a"], "rays-night": ["#08081e", "#15154a"] };
  // Happy hues, only darkened so the characters pop (Sora gold, game blue, sunset, remix).
  const HUE = { gold: ["#6e3c00", "#9a5a00"], title: ["#7a4200", "#a86400"], blue: ["#0e1f8a", "#1a34c0"], sunset: ["#5a0e3a", "#8a2438"], remix: ["#2e0c5c", "#4a1590"] };
  function rayBack(ctx, name, x, y, scale, rot, alpha = 1, colors = RAYS[name]) {
    ctx.save(); ctx.globalAlpha *= alpha;
    sunburst(ctx, x, y, 22, 2600, rot, colors[0], colors[1]);
    ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha *= 0.6;
    plate(ctx, name, x, y, scale * 1.2, rot);
    plate(ctx, name, x, y, scale * 2.6, -rot * 0.5);
    ctx.restore();
  }
  function glowSpot(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, color.replace("A", a)); g.addColorStop(1, color.replace("A", 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const idx = (seg, t) => F.indexAt(seg, t);
  const eventTime = (seg, frame) => seg.at + (frame - seg.f) / 30 / (seg.speed ?? 1);
  function segEvents(seg, names) {
    if (seg.speed === 0) return [];
    const from = idx(seg, seg.t0), to = idx(seg, seg.t1);
    return F.events(seg.clip, from, to, names).map((e) => ({ ...e, t: eventTime(seg, e.frame) }));
  }
  function ghostValue(clip, frame) {
    let n = 0;
    for (const e of TR.meta(clip).events) { if (e.frame > frame) break; if (e.name === "powerPellet") n = 0; if (e.name === "ghostEaten") n++; }
    return 200 * Math.pow(2, Math.max(0, n - 1));
  }
  function hitShake(t, hits, power = 16) {
    let x = 0, y = 0;
    for (const h of hits) { const [a, b] = shake(t, h, power, 0.35, Math.round(h * 10)); x += a; y += b; }
    return [x, y];
  }
  // Cut flashes are skipped while a transition is compositing the shot.
  const cutFlash = (ctx, t, t0, dur = 0.12, color = "#fff") => { if (t >= t0 && !TR.inTransition) flash(ctx, (1 - (t - t0) / dur) * 0.85, color); };
  function glitchText(ctx, text, x, y, size, t, o = {}) {
    const j = (k) => (hash(Math.floor(t * 20) * 13 + k) - 0.5) * size * 0.12;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    posterText(ctx, text, x + j(1), y + j(2), size, { fill: "#ff2bd6", shadows: [], keyline: "rgba(0,0,0,0)", line: 0, ...o });
    posterText(ctx, text, x + j(3), y + j(4), size, { fill: "#2bf0ff", shadows: [], keyline: "rgba(0,0,0,0)", line: 0, ...o });
    ctx.restore();
    posterText(ctx, text, x, y, size, { fill: "#fff", shadows: ["#ff2bd6", "#3a0a5a"], ...o });
    const f = Math.floor(t * 12);
    for (let i = 0; i < 3; i++) {
      if (hash(f * 7 + i) < 0.55) continue;
      const sy = y - size * 0.6 + hash(f * 3 + i) * size * 1.2, sh = 6 + hash(f + i * 5) * size * 0.2, off = (hash(f * 11 + i) - 0.5) * 80;
      ctx.drawImage(ctx.canvas, 0, sy, W, sh, off, sy, W, sh);
    }
  }
  // An iris mask on the current frame: black outside a circle of radius r.
  function irisMask(ctx, x, y, r) {
    ctx.save(); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2, true); ctx.fill("evenodd");
    if (r > 2) { ctx.lineWidth = 12; ctx.strokeStyle = PAL.gold; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  // Mouth frame for a chomp synced to the beat.
  const chompFrame = (t, left = false) => `sora-${Math.round(Math.abs(Math.sin((t * Math.PI) / BEAT)) * 3)}${left ? "-l" : ""}`;
  // A small tag box ("POWER-UP", "SLOW-MO").
  function tag(ctx, text, x, y, size, fillC, textC = PAL.ink, scale = 1, rot = -0.03) {
    if (scale <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.font = `${size}px Impact, sans-serif`; ctx.letterSpacing = "2px";
    const w = ctx.measureText(text).width + size * 0.9, h = size * 1.35;
    ctx.fillStyle = "#000"; ctx.fillRect(-w / 2 + 6, -h / 2 + 7, w, h);
    ctx.fillStyle = fillC; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.strokeRect(-w / 2, -h / 2, w, h);
    label(ctx, text, 0, 2, size, { fill: textC, stroke: null, spacing: 2 });
    ctx.restore();
  }
  // Generic footage draw for the segment at time t (optionally by role).
  // Sound stickers are rationed: in each shot only the first event of each kind gets one, and never
  // within two bars of the previous sticker. Built once from the whole edit, so it's deterministic.
  let stickerOK = null;
  function stickerAllowed(seg, e) {
    if (!stickerOK) {
      stickerOK = new Set();
      for (const shot of TIMELINE.SHOTS) {
        const all = SEGMENTS.filter((sg) => sg.shot === shot.name).flatMap((sg) => segEvents(sg, Object.keys(TR.fx.STICKER)).map((ev) => ({ ...ev, sg })));
        all.sort((a, b) => a.t - b.t);
        const used = new Set();
        let last = -99;
        for (const ev of all) {
          const text = TR.fx.STICKER[ev.name][0];
          if (used.has(text) || ev.t - last < 2 * BAR) continue;
          used.add(text); last = ev.t;
          stickerOK.add(`${ev.sg.clip}:${ev.frame}:${ev.name}`);
        }
      }
    }
    return stickerOK.has(`${seg.clip}:${e.frame}:${e.name}`);
  }
  function footage(ctx, t, shot, o) {
    const seg = TIMELINE.segmentAt(t, shot, o.role);
    if (!seg) return null;
    const i = idx(seg, t);
    const hits = segEvents(seg, o.hitEvents || []).map((e) => e.t).filter((h) => h <= t);
    const [sx, sy] = hitShake(t, hits, o.shake ?? 14);
    const punch = hits.length ? 1 + 0.04 * Math.max(0, 1 - (t - hits[hits.length - 1]) / 0.25) : 1;
    const z = seg.zoom || o.zoom || 1;
    const zoom = z > 1 && !o.noZoomIn && seg.zoomIn !== false ? lerp(z * 0.9, z, ease.outCubic(inv(seg.t0, seg.t0 + 0.4, t))) : z;
    // The screen lights the room around it in the footage's own colour.
    if (o.spill !== false && o.w >= 450) TR.fx.spill(ctx, seg.clip, i, o.x, o.y, o.w * 1.3, 0.3 * (o.alpha ?? 1));
    // Callouts and sound stickers ride on the screen, in its own coordinates.
    const events = o.stickers === false || o.w < 450 ? [] : segEvents(seg, Object.keys(TR.fx.STICKER)).filter((e) => stickerAllowed(seg, e));
    const overlay = (c, map, w) => {
      if (seg.callouts) TR.fx.callouts(c, map, seg.clip, i, seg.callouts, t);
      if (events.length) TR.fx.eventStickers(c, map, w, seg.clip, events, t);
    };
    ctx.save(); ctx.translate(o.x + sx, o.y + sy); ctx.scale(punch * (o.scale ?? 1), punch * (o.scale ?? 1));
    if (o.filter) ctx.filter = o.filter;
    F.screen(ctx, seg.clip, i, 0, 0, o.w, { zoom, rot: o.rot || 0, glow: o.glow, alpha: o.alpha ?? 1, overlay, free: o.free });
    ctx.restore();
    if (o.flash !== false) cutFlash(ctx, t, seg.t0, 0.08);
    return { seg, i, hits };
  }

  // ---- OPEN: a terminal boots the world simulator, the static denoises into Sora ----
  function open(ctx, t) {
    fill(ctx, "#050302");
    const lit = inv(B(2), B(2) + 0.35, t);
    rayBack(ctx, "rays-white", W / 2, H / 2 + 40, 1.2 + t * 0.01, t * 0.05, lit, HUE.gold);
    if (lit > 0) { tone(ctx, "rgba(0,0,0,0.3)"); glowSpot(ctx, W / 2, 470, 700, "rgba(255,190,40,A)", 0.4 * lit); }
    // Sora: glint first, then the whole star; he lights up at B3 and chomps only with MEET SORA (one munch per chomp).
    const push = lerp(1, 1.08, ease.inOutCubic(inv(B(2), B(4), t)));
    const bob = Math.sin(t * 2.2) * 8, sy = 470 + bob;
    if (t >= B(2)) {
      const squash = t < B(2) + 0.25 ? 0.1 * (1 - (t - B(2)) / 0.25) : 0;
      const first = t < B(2) + BEAT ? `sora-${Math.round(Math.sin(Math.PI * clamp((t - B(2)) / BEAT)) * 3)}` : "sora-0";
      C.hero(ctx, t >= B(3) ? chompFrame(t - B(3)) : first, W / 2, sy, 8.4 * push, { dim: 1 - lit, squash, glow: lit > 0.5 ? "rgba(255,190,40,0.6)" : null, glowSize: 80 });
    }
    if (t >= B(1.75)) {
      const flick = t < B(2) ? (hash(Math.floor(t * 14)) > 0.25 ? 1 : 0.3) : 1 - lit;
      C.hero(ctx, "sora-glint", W / 2, sy, 8.4 * push, { alpha: flick * ease.outBack(clamp((t - B(1.75)) / 0.3)), glow: "#fff6b0", glowSize: 50 });
    }
    // The hunters' eyes glint at the edges of the dark.
    const eyesAt = B(3.5);
    [[250, 290, "#e8673c"], [1650, 320, "#ffd8c2"], [230, 790, "#b0b4ff"], [1690, 770, "#6fd3ff"]].forEach(([x, y, c], i) => {
      const a = inv(eyesAt + i * 0.12, eyesAt + i * 0.12 + 0.15, t);
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = c; ctx.shadowBlur = 30; ctx.fillStyle = "#fff";
      for (const dx of [-26, 26]) ctx.fillRect(x + dx - 14, y - 22, 28, 44);
      ctx.fillStyle = "#101020"; ctx.shadowBlur = 0;
      const look = Math.sign(W / 2 - x) * 6;
      for (const dx of [-26, 26]) ctx.fillRect(x + dx - 7 + look, y - 6, 14, 22);
      ctx.restore();
    });
    K.slam(ctx, "MEET SORA.", t, B(3), W / 2, 868, 92, { hold: B(4) - B(3) - 0.3, rot: -0.03 });
    // Static that denoises at B(1.5), with a glitch burst.
    const s = t < B(1.5) ? 0.85 : 0.85 * (1 - inv(B(1.5), B(1.5) + 0.45, t));
    staticNoise(ctx, t, s, t < B(1.5) ? 4 : 8);
    if (t >= B(1.5) - 0.1 && t < B(1.5) + 0.35) {
      const f = Math.floor(t * 30);
      for (let i = 0; i < 8; i++) { const yy = hash(f * 9 + i) * H, hh = 10 + hash(f + i) * 90; ctx.drawImage(ctx.canvas, 0, yy, W, hh, (hash(f * 3 + i) - 0.5) * 300, yy, W, hh); }
    }
    // The terminal.
    const termOut = exit(t, B(1.5) - 0.05, 0.2), termIn = pop(t, 0.05, 0.3);
    if (termOut > 0 && termIn > 0) {
      const k = termIn * termOut, px = 960, py = 420, pw = 1320, ph = 350;
      ctx.save(); ctx.translate(px, py); ctx.scale(k, k);
      ctx.fillStyle = "#000"; ctx.fillRect(-pw / 2 + 14, -ph / 2 + 16, pw, ph);
      ctx.fillStyle = "rgba(15,11,4,0.95)"; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = SUN.ink; ctx.fillRect(-pw / 2, -ph / 2, pw, 48);
      ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-pw / 2 + 22 + i * 36, -ph / 2 + 14, 20, 20); });
      mono(ctx, "sora-term", 0, -ph / 2 + 25, 22, { fill: SUN.shade, spacing: 6 });
      ctx.lineWidth = 6; ctx.strokeStyle = SUN.paint; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.lineWidth = 8; ctx.strokeStyle = PAL.ink; ctx.strokeRect(-pw / 2 - 7, -ph / 2 - 7, pw + 14, ph + 14);
      let cursor = null;
      TYPING.forEach((line, i) => {
        const shown = typed(line.text, t, line.at, line.cps), y = -ph / 2 + 118 + i * 92, x = -pw / 2 + 96;
        if (t < line.at) return;
        // A pixel chevron prompt (the title font has no ">").
        ctx.fillStyle = "#000"; ctx.fillRect(x - 58, y - 20, 34, 40);
        ctx.fillStyle = SUN.shade; for (let r = 0; r < 4; r++) { ctx.fillRect(x - 54 + r * 6, y - 16 + r * 6, 8, 6); ctx.fillRect(x - 54 + r * 6, y + 10 - r * 6, 8, 6); }
        if (!shown) return;
        mono(ctx, shown, x, y, 48, { align: "left", fill: i === TYPING.length - 1 ? "#ff9d00" : SUN.light, stroke: "#000", line: 10, spacing: 5 });
        ctx.font = `48px "AstraTitle"`; ctx.letterSpacing = "5px";
        cursor = [x + ctx.measureText(shown).width + 10, y, shown.length < line.text.length];
        if (i === TYPING.length - 1 && shown.length === line.text.length) {
          const prog = inv(B(1), B(1.45), t), bx = cursor[0] + 20, bw = 420;
          ctx.fillStyle = "#000"; ctx.fillRect(bx - 5, y - 22, bw + 10, 44);
          ctx.fillStyle = "#ff9d00"; for (let b = 0; b < Math.floor(prog * 12); b++) ctx.fillRect(bx + b * 35, y - 16, 29, 32);
          mono(ctx, Math.round(prog * 100) + "%", bx + bw + 30, y, 36, { align: "left", fill: "#ff9d00", stroke: "#000", line: 8 });
          cursor = null;
        }
      });
      if (cursor && (cursor[2] || Math.floor(t * 3) % 2 === 0)) { ctx.fillStyle = SUN.light; ctx.fillRect(cursor[0], cursor[1] - 24, 26, 48); }
      ctx.globalAlpha = 0.12; ctx.fillStyle = "#000"; for (let y = -ph / 2; y < ph / 2; y += 6) ctx.fillRect(-pw / 2, y, pw, 3);
      ctx.restore();
    }
    cutFlash(ctx, t, B(2), 0.3, "#fff6c8");
  }

  // ---- HUNTERS: one bar per ghost, iris between them, then the pack ----------------
  function hunters(ctx, t) {
    const u = t - B(4), i = Math.floor(u / BAR);
    if (i < 4) {
      const c = TR.CAST[i], lu = u - i * BAR, side = i % 2 ? -1 : 1, gx = W / 2 + side * 340, gy = H / 2 + 20;
      sunburst(ctx, gx, gy, 20, 1500, lu * 0.25 * side, c.bg[1], c.bg[0]);
      tone(ctx, "rgba(0,0,0,0.16)", 14, 0.34);
      plate(ctx, "splat-" + c.id, gx, gy, 1.05 + lu * 0.04, lu * 0.1);
      const k = ease.outBack(clamp(lu / 0.32), 1.6), out = exit(t, B(5 + i) - 0.3, 0.2);
      const [sx, sy] = shake(t, B(4 + i), 22, 0.35, i + 3);
      ctx.save(); ctx.translate(sx, sy);
      C.hero(ctx, HF.ghost(c.ghost, t, 6), gx + side * (1 - k) * 800, gy + Math.sin(t * 3) * 10, 9 * (0.9 + 0.1 * k));
      const nx = W / 2 - side * 430, nk = ease.outBack(clamp((lu - 0.06) / 0.3), 2.2) * out;
      ctx.save(); ctx.translate(nx - side * (1 - out) * 300, H / 2 - 40); ctx.scale(nk, nk);
      posterText(ctx, c.name, 0, 0, c.name.length > 5 ? 150 : 180, { fill: c.color, shadows: [PAL.ink, "#000"], rot: -0.06, depth: 10 });
      ctx.restore();
      const sk = clamp((lu - 0.2) / 0.2);
      label(ctx, c.sub, nx - side * (1 - out) * 300, H / 2 + 90 + (1 - ease.outBack(sk)) * 16, 54, { fill: PAL.cream, alpha: clamp(sk * 3) * out, rot: -0.06, line: 10 });
      ctx.restore();
      // Iris out onto the ghost, iris in on the next one.
      if (lu > BAR - 0.24) irisMask(ctx, gx, gy, lerp(1400, 0, ease.inCubic((lu - (BAR - 0.24)) / 0.24)));
      if (lu < 0.24 && i > 0) irisMask(ctx, gx, gy, lerp(0, 1400, ease.outCubic(lu / 0.24)));
      return;
    }
    // The hush before the drop: black, one lone chomp in the middle.
    if (t >= TIMELINE.DROP_HUSH) {
      fill(ctx, "#000");
      C.hero(ctx, chompFrame(t - TIMELINE.DROP_HUSH), W / 2, H / 2, 3, { glow: "rgba(255,200,40,0.5)", glowSize: 30 });
      TR.fx.sticker(ctx, "WAKA!", W / 2 + 190, H / 2 - 140, 64, t, TIMELINE.DROP_HUSH + 0.02, PAL.gold, { hold: 0.2, rot: 0.12 });
      return;
    }
    // The pack.
    const lu = u - 4 * BAR;
    mazeBack(ctx, t, 0.15, -0.12, 0.72 + lu * 0.03);
    speedLines(ctx, t, W / 2, H / 2, "rgba(120,160,255,0.25)", 40, 520);
    const zoom = 1 + lu * 0.05;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
    TR.CAST.forEach((c, j) => {
      const k = ease.outBack(clamp((lu - j * 0.06) / 0.3));
      const rim = c.id === "grok" ? { glow: "rgba(255,243,214,0.95)", glowSize: 16 } : {};
      C.hero(ctx, HF.ghost(c.ghost, t + j * 0.4, 6), 330 + j * 420, 450 + Math.abs(j - 1.5) * 50 + Math.sin(t * 3 + j) * 12 + (1 - k) * 700, j === 0 ? 6.3 : 5.5, rim);
    });
    ctx.restore();
    K.callout(ctx, W / 2, H - 170, 1080, 180, [{ text: "FOUR AIs. ONE MAZE.", size: 96 }], { scale: pop(t, B(8) + 0.1, 0.3), rot: -0.02, reveal: [t, REV.pack.t0, REV.pack.per] });
    if (lu < 0.24) irisMask(ctx, W / 2, H / 2, lerp(0, 1400, ease.outCubic(lu / 0.24)));
  }

  // ---- TITLE DROP: dark, so the gold pops ---------------------------------------------
  function title(ctx, t) {
    const u = t - B(9);
    rayBack(ctx, "rays-white", W / 2, H * 0.4, 1.4, u * 0.18, 1, HUE.title);
    glowSpot(ctx, W / 2, 330, 900, "rgba(255,200,60,A)", 0.4);
    tone(ctx, "rgba(0,0,0,0.25)", 14, 0.34);
    const [sx, sy] = shake(t, B(9), 30, 0.5, 9);
    ctx.save(); ctx.translate(sx, sy);
    const lane = H - 200, x0 = lerp(180, W + 300, u / (B(11) - B(9)));
    for (let x = 60; x < W; x += 90) if (x > x0 + 40) (Math.round(x / 90) % 7 === 3 ? TR.fx.gpu(ctx, x, lane, 2.2, 1, Math.sin(t * 5) * 0.1) : TR.fx.chip(ctx, x, lane, 4));
    ["blinky", "pinky", "inky", "clyde"].forEach((g, i) => C.sprite(ctx, `ghost-${g}-${Math.floor(t * 8) % 2}`, x0 - 330 - i * 190, lane, 6));
    C.hero(ctx, HF.sora(u, 14), x0, lane, 4.2, { glow: "rgba(255,200,40,0.6)", glowSize: 40 });
    burst(ctx, t, B(9), W / 2, 330, 3);
    K.logo(ctx, W / 2, 320, 190, t, { reveal: clamp(u / 0.8), shine: inv(B(9) + 0.95, B(9) + 1.6, t) });
    label(ctx, "THE AI ARCADE", W / 2, 540, 64, { fill: PAL.cream, alpha: clamp((u - 0.9) / 0.2), line: 12, spacing: 8 });
    ctx.restore();
    // Top-right, clear of the marquee's arc.
    K.badge(ctx, 1680, 210, 125, ["PLAY", "NOW!"], { scale: pop(t, B(9.75), 0.35), spin: u * 0.3 });
    cutFlash(ctx, t, B(9), 0.35);
  }

  // ---- CLASSIC ------------------------------------------------------------------
  function classic(ctx, t) {
    mazeBack(ctx, t, 0.6, 0.1, 1.1, 300, 8);
    tone(ctx, "rgba(0,0,0,0.2)");
    shade(ctx, 600, H / 2, 700, 0.75); shade(ctx, 1370, 520, 700, 0.45);
    const r = footage(ctx, t, "classic", { x: 600, y: H / 2 + 10, w: 700, rot: -0.03, hitEvents: ["ghostEaten", "powerPellet"] });
    // Break the frame: Claude leans over the top-right corner of the cabinet, watching.
    const lk = ease.outBack(clamp((t - B(11) - 0.3) / 0.35)) * exit(t, B(17) - 0.3, 0.25);
    if (lk > 0) C.hero(ctx, HF.ghost("blinky", t, 6), 945 + (1 - lk) * 160, 95 - (1 - lk) * 140, 4.2, { rot: 0.32 });
    const cx = 1370;
    K.slam(ctx, "CHOMP.", t, B(11), cx, 330, 150, { hold: B(13) - B(11) - 0.25 });
    K.slam(ctx, "DODGE.", t, B(11.5), cx, 520, 150, { hold: B(13) - B(11.5) - 0.25, fill: PAL.cream, shadows: [PAL.blue, PAL.ink] });
    K.slam(ctx, "SURVIVE.", t, B(12), cx, 710, 150, { hold: B(13) - B(12) - 0.25, fill: PAL.cream, shadows: [PAL.red, PAL.ink] });
    if (t >= B(13) && t < B(17)) {
      const k = pop(t, B(13) + 0.05) * exit(t, B(17) - 0.25);
      K.callout(ctx, cx + 40, 250, 900, 200, [{ text: "EAT POWERFUL GRAPHICS CARDS.", size: 52 }, { text: "TURN THE TABLES!", size: 76, color: PAL.red }], { scale: k, rot: 0.03, reveal: [t, REV.gpu.t0, REV.gpu.per] });
    }
    // The chain's value badges: 200, 400, 800, 1600. The 1600 outlives the cut to Claude, then clears for the question.
    if (t >= B(13) && t < B(17.5)) {
      for (const seg of SEGMENTS) if (seg.shot === "classic" && seg.clip === "classic") for (const e of segEvents(seg, ["ghostEaten"])) {
        if (t < e.t || t > e.t + 1.1) continue;
        const v = ghostValue(seg.clip, e.frame), kk = pop(t, e.t, 0.25) * exit(t, Math.min(e.t + 0.9, B(17.5) - 0.2), 0.2);
        ctx.save(); ctx.translate(cx + (v >= 1600 ? 0 : (hash(e.frame) - 0.5) * 200), 650); ctx.scale(kk, kk);
        starPath(ctx, 0, 0, 14, v >= 1600 ? 300 : 230, v >= 1600 ? 220 : 170, t); ctx.fillStyle = v >= 1600 ? PAL.red : "#1d2cff"; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = PAL.ink; ctx.stroke();
        posterText(ctx, String(v), 0, 0, v >= 1600 ? 150 : 120, { fill: v >= 1600 ? PAL.gold : PAL.cyan, shadows: [PAL.ink], rot: -0.08 });
        ctx.restore();
      }
    }
    if (t >= B(17)) {
      // Claude on Sora's tail, then the question.
      const k = pop(t, B(17.25), 0.3);
      K.callout(ctx, cx, 560, 840, 360, [{ text: "CAN YOU", size: 96 }, { text: "OUTRUN", size: 96 }, { text: "CLAUDE?", size: 110, color: PAL.red }], { scale: k, rot: 0.04, reveal: [t, REV.claude.t0, REV.claude.per] });
      C.hero(ctx, HF.ghost("blinky", t, 8), cx + 380, 330 + Math.sin(t * 5) * 10, 4 * k, { rot: 0.2 });
      tag(ctx, "HE'S RIGHT BEHIND YOU", cx - 20, 180, 40, PAL.red, PAL.cream, pop(t, B(17) + 0.1));
    }
  }

  // ---- REMIX ----------------------------------------------------------------
  const POWERS = {
    "token-beam": ["TOKEN BEAM", "#3fc6ff", "FIRE A BEAM. SEND GHOSTS HOME."],
    "scale-up": ["SCALE UP", "#ffe52c", "GROW HUGE. FLATTEN EVERY GHOST."],
    "hot-path": ["HOT PATH", "#ff5a2e", "LEAVE A TRAIL OF FIRE BEHIND YOU."],
    "rate-limit": ["RATE LIMIT", "#9fe6ff", "EVERY GHOST SLOWS TO A CRAWL."],
    "context-overflow": ["CONTEXT OVERFLOW", "#ff8a3d", "ONE TOUCH. ONE BIG BOOM."],
    "rag": ["RAG", "#3ef06a", "PULL IN EVERY DOT NEARBY."],
    "incognito": ["INCOGNITO", "#c9a6ff", "GHOSTS LOSE TRACK OF YOU."],
    "star-dash": ["STAR DASH", "#ffd21f", "SORA'S SKILL: A BURST OF SPEED."],
  };
  function remix(ctx, t) {
    const s = TIMELINE.showcaseAt(t) || TIMELINE.montageAt(t), power = s && POWERS[s.power], color = power ? power[1] : "#b35cff";
    TR.fx.pelletGrid(ctx, t, HUE.remix[0], HUE.remix[1]);
    if (power) glowSpot(ctx, W * 0.66, H / 2, 900, "rgba(255,255,255,A)", 0.05);
    if (!s) {
      // Intro.
      const u = t - B(19), out = exit(t, B(21) - 0.28), sub = exit(t, B(21) - 0.42, 0.18);
      footage(ctx, t, "remix", { x: 1450 - (1 - out) * 1500, y: H / 2, w: 560, rot: 0.04, glow: "#b35cff" });
      K.slam(ctx, "REMIX", t, B(19), 600, 380, 260, { hold: B(21) - B(19) - 0.3, fill: "#ff5ad8", shadows: [PAL.gold, PAL.blue] });
      label(ctx, "MODE", 600, 560, 90, { fill: PAL.cream, alpha: clamp((u - 0.15) / 0.2) * sub, spacing: 30, line: 14 });
      ctx.save(); ctx.globalAlpha *= sub; ctx.translate(600, 700); ctx.font = "46px Impact, 'Arial Black', sans-serif";
      const rl = "7 POWER-UPS  ·  4 SKILLS  ·  NEW GHOST BRAINS", rw = ctx.measureText(rl).width;
      TR.fx.revealLine(ctx, rw, 46, TR.fx.lineP(t, REV.remix.t0, 0, REV.remix.per), t, () => label(ctx, rl, 0, 0, 46, { fill: PAL.gold, line: 10 }));
      ctx.restore();
      const gk = ease.outBack(clamp((u - 0.2) / 0.35)) * sub;
      if (gk > 0) C.hero(ctx, HF.sora(t, 8, true), 1180 - (1 - gk) * 200, 905, 4.2 * gk, { rot: -0.25, glow: "rgba(255,200,40,0.5)" });
      // Between the title and the cabinet, clear of both (and of the cabinet's score).
      K.badge(ctx, 1060, 590, 90, ["POWERED", "UP!"], { scale: pop(t, B(19.5)) * sub, fill: "#ff2bd6", text: PAL.cream });
      return;
    }
    const [name, , desc] = power;
    const whip = ease.outCubic(clamp((t - s.t0) / (s.split ? 0.3 : 0.2))), wx = (1 - whip) * 1400;
    if (!s.split) {
      // The montage: four quick cuts, one screen and one name each.
      const M0 = TIMELINE.MONTAGE, lastCut = s === M0[M0.length - 1], leave = lastCut ? 0 : ease.inCubic(inv(s.t1 - 0.12, s.t1, t)) * 1400;
      footage(ctx, t, "remix", { role: "montage", x: 620 + wx - leave, y: H / 2 + 10, w: 720, rot: -0.03, glow: color, zoom: 1.6, noZoomIn: true, flash: false, stickers: false, free: true });
      const M = TIMELINE.MONTAGE, mout = exit(t, M[M.length - 1].t1 - 0.2, 0.2);
      tag(ctx, "AND MORE…", 1390, 150, 40, PAL.cream, PAL.ink, pop(t, M[0].t0 + 0.05, 0.25) * mout, -0.04);
      const k = pop(t, s.t0 + 0.05, 0.2);
      ctx.save(); ctx.translate(1390, 340); ctx.scale(k, k);
      if (s.power === "star-dash") C.hero(ctx, HF.sora(t, 12), 0, 0, 3.2, { glow: color, glowSize: 40 });
      else { ctx.shadowColor = color; ctx.shadowBlur = 40; C.sprite(ctx, "pu-" + s.power, 0, 0, 6, { rot: -0.05 }); }
      ctx.restore();
      const nk = pop(t, s.t0 + 0.08, 0.22);
      ctx.save(); ctx.translate(1390, 600); ctx.scale(nk, nk);
      posterText(ctx, name, 0, 0, 130, { fill: color, shadows: [PAL.ink, "#000"], rot: -0.04, depth: 9 });
      ctx.restore();
      return;
    }
    // Two bars on one continuous screen: the setup lands the pickup on the bar line, then the
    // effect plays on from the pickup, slowing through the impact while the camera pushes in.
    const after = t >= s.split, out = exit(t, s.t1 - 0.22, 0.22), leave = ease.inCubic(inv(s.t1 - 0.2, s.t1, t)) * 1400;
    const slow = TIMELINE.SLOWMO.find((w) => w.t0 >= s.split && w.t0 < s.t1);
    const push = after && slow ? ease.inOutCubic(inv(slow.t0 - 0.15, slow.t1, t)) * (1 - ease.inOutCubic(inv(slow.t1, s.t1 - 0.05, t))) : 0;
    const r = footage(ctx, t, "remix", {
      role: after ? "after" : "setup", x: 620 + wx - leave, y: H / 2 + 10, w: 720, rot: -0.03, glow: color, zoom: 1.6 + 0.35 * push, noZoomIn: true, flash: false, stickers: false, free: true,
      hitEvents: after ? ["ghostZapped", "explosion", "skill", "ghostEaten"] : [],
    });
    if (t < s.t0 + BEAT) fill(ctx, "rgba(0,0,0,0.12)");
    if (after && t < s.split + 0.1) flash(ctx, (1 - (t - s.split) / 0.1) * 0.3, "#fff");
    // The right-hand column stays up across both bars, so the line can be read while the effect plays.
    TR.fx.pelletLine(ctx, 1000 + wx, 300, 1290, 300, t, s.t0 + 0.3, 0.3, out);
    const k = pop(t, s.t0 + 0.3, 0.3) * out;
    ctx.save(); ctx.translate(1390, 300); ctx.scale(k, k);
    ctx.shadowColor = color; ctx.shadowBlur = 40; C.sprite(ctx, "pu-" + s.power, 0, 0, 6, { rot: -0.05 });
    ctx.restore();
    const nk = pop(t, s.t0 + 0.4, 0.3) * out;
    ctx.save(); ctx.translate(1390, 560); ctx.scale(nk, nk);
    posterText(ctx, name, 0, 0, name.length > 12 ? 96 : 140, { fill: color, shadows: [PAL.ink, "#000"], rot: -0.04, depth: 9 });
    ctx.restore();
    // The line rises into place (a 6-frame ease-out-back), rather than fading through the whip's motion blur.
    const dk = clamp((t - s.t0 - 0.55) / 0.2);
    label(ctx, desc, 1390, 690 + (1 - ease.outBack(dk)) * 16, 46, { fill: PAL.cream, alpha: clamp(dk * 3) * out, rot: -0.04, line: 10 });
    tag(ctx, "POWER-UP", 1390, 150, 34, color, PAL.ink, pop(t, s.t0 + 0.3, 0.25) * out, -0.04);
    // Bar 2: Sora peeks over the cabinet, and SLOW-MO flags the impact.
    const pk = after ? ease.outBack(clamp((t - s.split - 0.05) / 0.35)) * out : 0;
    if (pk > 0) C.hero(ctx, HF.sora(t, 10), 985, 118 + (1 - pk) * 60, 2.6 * pk, { rot: 0.3, glow: "rgba(255,200,40,0.5)", glowSize: 20 });
    if (slow && t >= slow.t0 && t < slow.t1) {
      speedLines(ctx, t, 620, H / 2, `${color}44`, 28, 600);
      tag(ctx, "◀◀ SLOW-MO", 860, 1000, 34, PAL.ink, color, Math.floor(t * 6) % 2 ? 1 : 0.85, 0.03);
    }
    if (s.power === "context-overflow" && r) { const e = segEvents(r.seg, ["explosion"])[0]; if (e && t >= e.t) flash(ctx, (1 - (t - e.t) / 0.4) * 0.7, "#ffb070"); }
  }

  // ---- SUNSET -----------------------------------------------------------------
  function glitchBand(ctx, t, top, alpha = 1, bottom = H) {
    const f = Math.floor(t * 24);
    for (let y = Math.max(-20, Math.floor(top / 10) * 10); y < bottom; y += 10) {
      const k = clamp((y - top) / 300);
      for (let x = 0; x < W; x += 40) {
        const h = hash(x * 13 + y * 7 + f * 101);
        if (h > 0.2 + (1 - k) * 0.55) { ctx.fillStyle = h > 0.93 ? "#ffffff" : h > 0.8 ? "#2bf0ff" : "#ff2bd6"; ctx.globalAlpha = alpha * (0.3 + k * 0.6); ctx.fillRect(x + (hash(f + y) - 0.5) * 30, y, 40 * (0.3 + h), 8); }
      }
    }
    ctx.globalAlpha = 1;
  }
  function sunset(ctx, t) {
    TR.fx.synthwave(ctx, t);
    if (t < B(32)) {
      glitchBand(ctx, t, H - 80);
      footage(ctx, t, "sunset", { x: 1440, y: H / 2, w: 560, rot: 0.04, glow: "#ff2bd6" });
      const u = t - B(31), out = exit(t, B(32) - 0.2);
      const ck = ease.outBack(clamp((u - 0.25) / 0.35)) * out;
      if (ck > 0) C.hero(ctx, HF.sora(t, 9), 1560, 185 - (1 - ck) * 120, 3.4 * ck, { rot: 0.05, glow: "rgba(255,200,40,0.5)" });
      glitchText(ctx, "SUNSET", 620, 380, 240, t, { rot: -0.04 });
      label(ctx, "ENDLESS MODE", 620, 560, 70, { fill: PAL.cream, alpha: clamp(u / 0.2) * out, spacing: 16, line: 12 });
      if (Math.floor(t * 4) % 2 === 0) mono(ctx, "DELETE PENDING", 620, 690, 54, { fill: "#ff3b5c", spacing: 10, stroke: "#000", line: 8, alpha: out });
      return;
    }
    const swallow = t >= B(36.5);
    const SX = W / 2, SY = H / 2 + 6, SW = 720, SH = SW / (448 / 576);
    // The glitch rides the in-game line during the swallow beat and floods the frame at the end.
    let band = H - lerp(60, 200, inv(B(32), B(36.5), t));
    if (swallow) {
      const seg = TIMELINE.segmentAt(t, "sunset"), m = TR.meta(seg.clip), row = m.track[Math.min(m.frames - 1, Math.round(idx(seg, t)))];
      const gl = row[row.length - 1].gl ?? 31;
      band = SY - SH / 2 + ((gl * 16 + 48) / 576) * SH;
      band = lerp(band, -260, ease.inCubic(inv(B(39), B(40) - 0.1, t)));
    }
    if (!swallow) glitchBand(ctx, t, band);
    const r = footage(ctx, t, "sunset", { x: SX, y: SY, w: SW, glow: "#ff2bd6", hitEvents: ["ghostEaten", "ghostZapped", "powerUp"], stickers: !(t >= B(35.5) && t < B(36.5)) });
    if (swallow) {
      // Leaks out of the cabinet on both sides, then covers everything.
      const flood = inv(B(39), B(40) - 0.1, t);
      ctx.save();
      if (flood < 0.02) { ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(SX - SW / 2, SY - SH / 2, SW, SH); ctx.clip("evenodd"); }
      glitchBand(ctx, t, band, 1);
      ctx.restore();
      if (flood > 0) { ctx.save(); ctx.globalAlpha = flood * 0.9; ctx.fillStyle = "#12001c"; ctx.fillRect(0, Math.max(0, band + 200), W, H); ctx.restore(); }
    }
    // Words sit in fixed columns either side of the cabinet, never over its edges.
    const L = 282, R = W - 282;
    if (!swallow) {
      K.slam(ctx, "CLIMB.", t, B(32), L, 330, 124, { hold: B(34) - B(32) - 0.25, fill: PAL.cream, shadows: ["#ff2bd6", PAL.ink] });
      K.slam(ctx, "CHAIN.", t, B(32.5), R, 450, 118, { hold: B(34) - B(32.5) - 0.25, fill: PAL.cream, shadows: ["#2bf0ff", PAL.ink] });
      K.slam(ctx, "DON'T", t, B(33), L, 650, 120, { hold: B(34) - B(33) - 0.25, fill: "#ff3b5c", shadows: [PAL.ink] });
      K.slam(ctx, "LOOK", t, B(33.25), L, 770, 104, { hold: B(34) - B(33.25) - 0.25, fill: "#ff3b5c", shadows: [PAL.ink] });
      K.slam(ctx, "DOWN.", t, B(33.5), L, 890, 104, { hold: B(34) - B(33.5) - 0.25, fill: "#ff3b5c", shadows: [PAL.ink] });
      if (r) for (const e of segEvents(r.seg, ["chain"])) {
        if (t < e.t || t > e.t + 1.6) continue;
        const n = e.data.chain, k = pop(t, e.t, 0.3) * exit(t, e.t + 1.35), big = n >= 256;
        if (big) { const u = t - e.t; ctx.save(); ctx.globalCompositeOperation = "lighter"; flash(ctx, u < 0.067 ? 1 : 1 - (u - 0.067) / 0.33, "#fff"); ctx.restore(); }
        ctx.save(); ctx.translate(big ? W / 2 : R, big ? H / 2 : 700); ctx.scale(k, k);
        starPath(ctx, 0, 0, 18, big ? 420 : 250, big ? 300 : 180, t * 0.5); ctx.fillStyle = big ? "#ff2bd6" : "#1d2cff"; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = PAL.ink; ctx.stroke();
        posterText(ctx, big ? "256!" : "×" + n, 0, big ? -30 : 0, big ? 230 : 130, { fill: big ? PAL.cream : PAL.cyan, shadows: [PAL.ink], rot: -0.07 });
        label(ctx, big ? "SCREEN CLEAR" : "DOT CHAIN", 0, big ? 140 : 110, big ? 64 : 44, { fill: big ? PAL.gold : PAL.cream, line: 12 });
        ctx.restore();
      }
    } else {
      K.slam(ctx, "IT'S", t, B(36.5), L, 330, 110, { hold: B(38) - B(36.5) - 0.25, fill: "#ff3b5c", shadows: [PAL.ink] });
      K.slam(ctx, "RISING.", t, B(36.5) + BEAT / 2, L, 460, 110, { hold: B(38) - B(36.5) - BEAT / 2 - 0.25, fill: "#ff3b5c", shadows: [PAL.ink] });
      K.slam(ctx, "RUN.", t, B(37.25), R, 270, 150, { hold: B(38) - B(37.25) - 0.25, fill: PAL.cream, shadows: ["#ff2bd6", PAL.ink] });
      const k = pop(t, B(38)) * exit(t, B(39) - 0.2);
      // In the left column, so the cabinet's HUD stays clear.
      K.callout(ctx, L, 540, 480, 330, [{ text: "CLIMB —", size: 84 }, { text: "OR BE", size: 84 }, { text: "DELETED.", size: 84, color: "#ff2bd6" }], { scale: k, rot: -0.03, fill: PAL.cream, border: "#ff2bd6" });
      if (t >= B(39) && Math.floor(t * 8) % 2 === 0) glitchText(ctx, "DELETED", W / 2, H / 2, 220, t, { rot: -0.05 });
    }
  }

  // ---- VERSUS ---------------------------------------------------------------------
  const STARS = [["SORA", "astra", "1UP", PAL.gold], ["NOVA", "nova", "2UP", "#ff6fb5"], ["VEGA", "vega", "3UP", PAL.cyan], ["LYRA", "lyra", "4UP", "#5cf07a"]];
  function versus(ctx, t) {
    TR.fx.arena(ctx, t);
    if (t < B(41)) {
      footage(ctx, t, "versus", { x: W / 2, y: H / 2 + 110, w: 470, glow: PAL.cyan });
      const out = exit(t, B(41) - 0.42, 0.18);
      K.slam(ctx, "VERSUS", t, B(40) + 0.15, W / 2, 150, 170, { hold: B(41) - B(40) - 0.4, fill: PAL.cyan, shadows: [PAL.pink, PAL.ink] });
      STARS.forEach(([name, skin, up, color], i) => {
        const side = i < 2 ? -1 : 1, row = i % 2, k = pop(t, B(40) + 0.3 + i * BEAT * 0.5, 0.3) * out;
        const x = W / 2 + side * 640, y = 470 + row * 300;
        ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
        C.sprite(ctx, `pac-${skin}-${Math.floor(t * 10) % 4}`, 0, -20, 7, { flip: side > 0 });
        label(ctx, name, 0, 120, 60, { fill: color, line: 12 });
        ctx.restore();
      });
      label(ctx, "4-PLAYER BATTLE ROYALE", W / 2, 1010, 52, { fill: PAL.gold, alpha: clamp((t - B(40) - 0.5) / 0.2) * out, line: 10 });
      return;
    }
    footage(ctx, t, "versus", { x: W / 2, y: H / 2 + 70, w: 700, glow: PAL.cyan, hitEvents: ["caught", "eliminated"] });
    STARS.forEach(([, skin, up, color], i) => {
      const side = i < 2 ? -1 : 1, row = i % 2, x = W / 2 + side * 430, y = 330 + row * 440, k = pop(t, B(41) + i * 0.05);
      C.sprite(ctx, `pac-${skin}-${Math.floor(t * 10 + i) % 4}`, x, y, 8 * k, { flip: side > 0, rot: side * 0.12 });
    });
    K.slam(ctx, "EAT YOUR RIVALS.", t, B(41), W / 2, 85, 96, { hold: B(43) - B(41) - 0.25, fill: PAL.gold });
    const WIN = TIMELINE.VERSUS_WIN, close = inv(B(43), B(43) + 0.3, t) * (1 - inv(WIN - 0.3, WIN, t));
    if (close > 0) {
      const sw = 700, sh = sw / (448 / 576), cx = W / 2, cy = H / 2 + 70;
      ctx.save(); ctx.strokeStyle = "#ff3b5c"; ctx.shadowColor = "#ff3b5c"; ctx.shadowBlur = 24;
      for (let j = 0; j < 3; j++) {
        const p = ((t - B(43)) * 0.9 + j / 3) % 1, inset = p * 150;
        ctx.globalAlpha = close * (1 - p) * 0.9; ctx.lineWidth = 10 - p * 6;
        ctx.strokeRect(cx - sw / 2 + inset, cy - sh / 2 + inset, sw - inset * 2, sh - inset * 2);
      }
      ctx.restore();
    }
    K.slam(ctx, "THE ARENA CLOSES IN.", t, B(43), W / 2, 85, 88, { hold: B(44.5) - B(43) - 0.25, fill: "#ff3b5c", shadows: [PAL.ink, "#000"] });
    if (t >= B(44.5)) K.callout(ctx, W / 2, 85, 1200, 140, [{ text: "LAST STAR STANDING.", size: 96 }], { scale: pop(t, B(44.5) + BEAT * 2) * exit(t, WIN - 0.2, 0.2), rot: -0.015 });
  }

  // ---- RAPID FIRE ----------------------------------------------------------------
  const CHECK = [
    { text: "RACE THROUGH 4 MAZES", icon: "pac-astra-1" },
    { text: "BUILD YOUR OWN IN THE EDITOR", icon: "ghost-blinky-0" },
    { text: "TEAM UP WITH UP TO 4 PLAYERS", icon: "pac-nova-1" },
    { text: "DRESS UP WITH 7 ACCESSORIES", icon: "pac-vega-1" },
    { text: "HUNT 18 ACHIEVEMENTS", icon: "ghost-clyde-0", color: PAL.gold },
    { text: "PLAY WITH KEYBOARD, TOUCH OR GAMEPAD", icon: "pac-lyra-1" },
  ];
  function rapid(ctx, t) {
    rayBack(ctx, "rays-gold", 560, H / 2, 1.3, t * 0.5);
    tone(ctx, "rgba(160,60,0,0.2)", 14, 0.34);
    const seg = TIMELINE.segmentAt(t, "rapid"), n = SEGMENTS.filter((s) => s.shot === "rapid").indexOf(seg);
    const whip = seg ? ease.outCubic(clamp((t - seg.t0) / 0.25)) : 1;
    footage(ctx, t, "rapid", { x: 540 - (1 - whip) * 900, y: H / 2, w: 620, rot: n % 2 ? 0.05 : -0.05, glow: PAL.red, flash: false });
    K.checklist(ctx, 1390, H / 2, 960, CHECK.map((c, i) => ({ ...c, at: B(46 + i * 2 / 3) + 0.05 })), t, { size: 40, gap: 118 });
  }

  // ---- CHASE: the intermission homage, all pixel ---------------------------------------
  function chase(ctx, t) {
    const u = t - B(50), turn = BAR - BEAT;
    mazeBack(ctx, t, 0.3, 0, 0.9);
    const lane = H / 2 + 60;
    if (u < turn) {
      const x = lerp(W + 150, 620, u / turn);
      for (let dx = 340; dx < W; dx += 90) if (dx < x - 80) TR.fx.chip(ctx, dx, lane, 4);
      TR.fx.gpu(ctx, 250, lane, 2.6, 1, Math.sin(t * 6) * 0.1);
      C.hero(ctx, HF.sora(u, 14, true), x, lane, 4, { glow: "rgba(255,200,40,0.5)" });
      ["blinky", "pinky", "inky", "clyde"].forEach((g, i) => C.hero(ctx, g === "inky" || g === "pinky" ? `${g}-left` : HF.ghost(g, t + i, 8), x + 320 + i * 250, lane + Math.sin(t * 9 + i) * 10, 3.5));
      speedLines(ctx, t, W / 2, lane, "rgba(255,255,255,0.18)", 26, 700);
    } else {
      const v = u - turn, x = lerp(250, W + 650, v / (B(52) - B(50) - turn));
      flash(ctx, 1 - v / 0.2, "#fff");
      ["blinky", "pinky", "inky", "clyde"].forEach((g, i) => C.hero(ctx, HF.scared(g, t + i), x + 300 + i * 230, lane + Math.sin(t * 12 + i) * 10, 3.5));
      C.hero(ctx, HF.sora(v, 16), x - 300, lane - 40, 11, { glow: "rgba(255,200,40,0.6)", glowSize: 70 });
      speedLines(ctx, t, W / 2, lane, "rgba(255,210,31,0.35)", 40, 600);
    }
  }

  // ---- TRIBUTE -------------------------------------------------------------------
  function tribute(ctx, t) {
    fill(ctx, "#020205");
    const b0 = B(52), rev = B(54.75), off = B(53.7);
    const back = inv(rev, rev + 0.5, t);
    glowSpot(ctx, W / 2, 400, 520, "rgba(255,190,60,A)", 0.04 + back * 0.25);
    const glint = t < rev ? Math.max(0, 0.45 - (t - b0) * 0.12) * (hash(Math.floor(t * 12)) > 0.3 ? 1 : 0.2) : ease.outBack(clamp((t - rev) / 0.35));
    C.hero(ctx, t < rev ? "sora-0" : chompFrame((t - rev) * 0.5), W / 2, 400, 6, { dim: lerp(0.85, 0, back), glow: back > 0.3 ? "rgba(255,190,40,0.5)" : null, glowSize: 60 });
    C.hero(ctx, "sora-glint", W / 2, 400, 6, { alpha: glint, glow: "#fff6b0", glowSize: 40 });
    const a1 = inv(b0 + 0.8, b0 + 1.2, t) * (1 - inv(rev - 0.15, rev, t));
    mono(ctx, "FOR SORA", W / 2, 676, 62, { fill: PAL.cream, alpha: a1, spacing: 16 });
    label(ctx, typed("2024.02.15 — 2026.09.24", t, b0 + 1.5, 20), W / 2, 762, 32, { fill: "#b4b4c8", alpha: a1 * 0.75, spacing: 6, stroke: null });
    const offA = inv(off, off + 0.1, t) * (1 - inv(rev - 0.15, rev, t));
    if (offA > 0 && hash(Math.floor(t * 20)) > 0.08) mono(ctx, "THE PRODUCT MAY BE OFFLINE.", W / 2 + (hash(Math.floor(t * 25)) - 0.5) * (t < off + 0.4 ? 20 : 0), 860, 56, { fill: "#ff4a5c", alpha: offA, spacing: 10 });
    if (t >= off && t < off + 0.35) staticNoise(ctx, t, 0.35 * (1 - (t - off) / 0.35), 6);
    const on = inv(rev, rev + 0.2, t);
    if (on > 0) { ctx.save(); ctx.shadowColor = PAL.gold; ctx.shadowBlur = 30; mono(ctx, "BUT NOTHING IS EVER REALLY GONE.", W / 2, 860, 62, { fill: PAL.gold, alpha: on, spacing: 10 }); ctx.restore(); }
    cutFlash(ctx, t, rev, 0.25, "#fff6c8");
  }

  // ---- END CARD, then the post-logo stinger --------------------------------------------
  function end(ctx, t) {
    const u = t - B(55.5), S = TIMELINE.STING;
    rayBack(ctx, "rays-white", W / 2, H * 0.45, 1.5, u * 0.15, 1, HUE.title);
    glowSpot(ctx, W / 2, 330, 1000, "rgba(255,200,60,A)", 0.38);
    tone(ctx, "rgba(0,0,0,0.22)", 14, 0.34);
    const [sx, sy] = shake(t, B(55.5), 34, 0.5, 21), [tx, ty] = shake(t, S, 18, 0.3, 5);
    ctx.save(); ctx.translate(sx + tx, sy + ty);
    ["blinky", "pinky", "inky", "clyde"].forEach((g, i) => {
      const gather = ease.inOutCubic(clamp((t - TIMELINE.STING) / 0.5)), k = pop(t, B(55.5) + 0.25 + i * 0.07, 0.35);
      const x = lerp([260, 540, 1380, 1660][i], [540, 820, 1100, 1380][i], gather);
      C.hero(ctx, HF.ghost(g, t + i * 0.5, 6), x, 840 + (1 - k) * 500 + Math.sin(t * 3 + i) * 8, 4);
    });
    burst(ctx, t, B(55.5), W / 2, 300, 7);
    K.logo(ctx, W / 2, 290, 180, t, { reveal: clamp(u / 0.5), shine: Math.max(inv(B(55.5) + 0.7, B(55.5) + 1.3, t), inv(B(57) - 0.1, B(57) + 0.5, t)) });
    // The call to action. The link itself goes in the post the trailer is shared with.
    K.callout(ctx, W / 2, 545, 860, 110, [{ text: "PLAY FREE IN YOUR BROWSER", size: 58 }], { scale: pop(t, B(56)), rot: -0.015, reveal: [t, REV.cta.t0, REV.cta.per] });
    // The PLAY NOW! badge (top-right, clear of the marquee's arc), until Sora eats it.
    const bx = 1680, by = 210, eaten = t >= S + BEAT * 0.5;
    if (!eaten) K.badge(ctx, bx, by, 125, ["PLAY", "NOW!"], { scale: pop(t, B(56.25)) * (t >= S ? 1 - clamp((t - S) / (BEAT * 0.5)) * 0.5 : 1), spin: u * 0.3 });
    // Sora: waits in the lineup, then leaps up to the badge and chomps it.
    // Sora: waits in the lineup, then leaps up, eats the badge and takes its place.
    const leap = ease.inOutCubic(clamp((t - (S - 0.35)) / 0.35));
    const hx = lerp(W / 2, bx - 40, leap), hy = lerp(820, by + 10, leap) - Math.sin(Math.PI * leap) * 120;
    const skey = t >= S - 0.05 && t < S + BEAT ? chompFrame(t - S) : HF.sora(u, 8);
    C.hero(ctx, skey, hx, hy, lerp(5.2, 4, leap), { glow: "rgba(255,200,40,0.6)", glowSize: 60, squash: u < 0.2 ? 0.1 * (1 - u / 0.2) : 0 });
    if (t >= S) burst(ctx, t, S + BEAT * 0.5, bx - 20, by, 11, { n: 26, life: 1 });
    TR.fx.sticker(ctx, "GULP!", bx - 230, by - 100, 44, t, S + BEAT * 0.5, PAL.cream, { hold: 0.6, side: -1, rot: -0.1 });
    // The wink: his star eye flares.
    const wink = S + BEAT * 2, wk = t >= wink ? Math.sin(Math.PI * clamp((t - wink) / 0.5)) : 0;
    if (wk > 0) C.hero(ctx, "sora-glint", hx, hy, 4 * (1 + wk * 0.25), { alpha: wk, glow: "#fff6b0", glowSize: 60 });
    ctx.restore();
    label(ctx, "UNOFFICIAL FAN TRIBUTE · NOT AFFILIATED WITH OR ENDORSED BY OPENAI", W / 2, 1046, 26, { fill: "rgba(255,243,214,0.8)", stroke: "rgba(0,0,0,0.6)", line: 5, font: "Arial, sans-serif", weight: "bold", spacing: 2 });
    flash(ctx, inv(TIMELINE.duration - 0.6, TIMELINE.duration - 0.05, t), "#000");
  }

  TR.shots = { open, hunters, title, classic, remix, sunset, versus, rapid, chase, tribute, end };
})();
