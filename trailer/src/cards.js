/* Poster furniture: starburst badges, callout boxes, the SORA-MAN logo,
 * a checklist panel and big slammed words. */
(function () {
  "use strict";
  const { PAL, clamp, ease, lerp, posterText, label, starPath, hash } = TR;

  function badge(ctx, x, y, r, lines, o = {}) {
    const { rot = -0.2, fill = PAL.red, text = PAL.gold, scale = 1, spin = 0 } = o;
    if (scale <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(rot);
    starPath(ctx, 6, 8, 16, r, r * 0.78, spin); ctx.fillStyle = "#000"; ctx.fill();
    starPath(ctx, 0, 0, 16, r, r * 0.78, spin); ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = TR.halftone(ctx, "rgba(0,0,0,0.18)", 9, 0.3); ctx.fill();
    const size = (r * 0.62) / Math.max(1, lines.length * 0.72);
    lines.forEach((line, i) => label(ctx, line, 0, (i - (lines.length - 1) / 2) * size * 1.02, size, { fill: text, line: size * 0.16 }));
    ctx.restore();
  }

  function callout(ctx, x, y, w, h, lines, o = {}) {
    const { rot = 0.03, fill = PAL.gold, border = PAL.red, scale = 1, size = 70 } = o;
    if (scale <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.fillStyle = "#000"; ctx.fillRect(-w / 2 + 14, -h / 2 + 16, w, h);
    ctx.fillStyle = fill; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = TR.halftone(ctx, "rgba(160,70,0,0.18)", 12, 0.28); ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = 12; ctx.strokeStyle = border; ctx.strokeRect(-w / 2 + 14, -h / 2 + 14, w - 28, h - 28);
    ctx.lineWidth = 8; ctx.strokeStyle = PAL.ink; ctx.strokeRect(-w / 2, -h / 2, w, h);
    // Each line takes its own height, so mixed sizes never overprint.
    const specs = lines.map((line) => (typeof line === "string" ? { text: line } : line)), hs = specs.map((sp) => (sp.size || size) * 1.02);
    const total = hs.reduce((a, b) => a + b, 0);
    let acc = -total / 2;
    const ys = hs.map((h) => { const y = acc + h / 2 + 4; acc += h; return y; });
    specs.forEach((spec, i) => {
      const sz = spec.size || size, ly = ys[i];
      const draw = () => label(ctx, spec.text, 0, ly, sz, { fill: spec.color || PAL.ink, stroke: null });
      if (!o.reveal) return draw();
      // Pellet-trail reveal: Sora eats across each line in turn.
      const [t, t0, per] = o.reveal;
      ctx.font = `${sz}px Impact, 'Arial Black', sans-serif`;
      const lw = ctx.measureText(spec.text).width;
      ctx.save(); ctx.translate(0, ly);
      TR.fx.revealLine(ctx, lw, sz, TR.fx.lineP(t, t0, i, per), t, () => { ctx.translate(0, -ly); draw(); ctx.translate(0, ly); }, { gpuEnd: i === lines.length - 1 });
      ctx.restore();
    });
    ctx.restore();
  }

  // SORA-MAN logo: jaunty letters with stacked extrusions, like the cabinet marquee.
  // The logo, optionally with a glint band sweeping across it (shine = 0..1 progress).
  // The glint is composited source-atop on an offscreen layer, so it only lights logo pixels.
  let logoLayer = null;
  function logo(ctx, x, y, size, t, o = {}) {
    if (o.shine === undefined || o.shine <= 0 || o.shine >= 1) return logoDraw(ctx, x, y, size, t, o);
    if (!logoLayer) { logoLayer = document.createElement("canvas"); logoLayer.width = TR.W; logoLayer.height = TR.H; }
    const g = logoLayer.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, TR.W, TR.H);
    g.setTransform(ctx.getTransform());
    logoDraw(g, x, y, size, t, o);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-atop";
    const sx = lerp(x - size * 5, x + size * 5, ease.inOutCubic(o.shine)), band = size * 0.9;
    const grad = g.createLinearGradient(sx - band, y - size, sx + band, y + size);
    grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(0.45, "rgba(255,255,240,0.15)"); grad.addColorStop(0.5, "rgba(255,255,255,0.95)"); grad.addColorStop(0.55, "rgba(255,255,240,0.15)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, TR.W, TR.H);
    g.globalCompositeOperation = "source-over";
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(logoLayer, 0, 0); ctx.restore();
  }
  function logoDraw(ctx, x, y, size, t, o = {}) {
    const { reveal = 1, bounce = 1, banner = true } = o;
    const text = "SORA-MAN";
    ctx.save(); ctx.translate(x, y);
    ctx.font = `${size}px "AstraTitle"`;
    const widths = [...text].map((c) => ctx.measureText(c).width), total = widths.reduce((a, b) => a + b, 0) + size * 0.04 * (text.length - 1);
    if (banner) {
      // Arched blue banner behind the word.
      const bw = total * 0.62 + size * 0.5, bh = size * 0.62;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, size * 1.9, bw * 1.15, size * 2.55, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.ellipse(0, size * 1.9, bw * 1.15 - bh, size * 2.55 - bh, 0, Math.PI * 1.92, Math.PI * 1.08, true); ctx.closePath();
      ctx.globalAlpha = clamp(reveal * 1.5);
      ctx.fillStyle = "#2b1f8a"; ctx.fill(); ctx.lineWidth = size * 0.1; ctx.strokeStyle = PAL.cyan; ctx.stroke();
      ctx.lineWidth = size * 0.04; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.restore();
    }
    let cx = -total / 2;
    [...text].forEach((c, i) => {
      const w = widths[i], at = i * 0.045;
      const k = ease.outBack(clamp((reveal - at) / 0.5), 2.4);
      if (k <= 0) { cx += w + size * 0.04; return; }
      const wob = Math.sin(t * 3.2 + i * 1.3) * size * 0.025 * bounce;
      const arc = -Math.cos(((cx + w / 2) / total) * Math.PI) * 0 + Math.pow((cx + w / 2) / (total / 2), 2) * size * 0.18;
      const rot = ((cx + w / 2) / (total / 2)) * 0.12 + (hash(i * 13) - 0.5) * 0.12;
      ctx.save(); ctx.translate(cx + w / 2, arc + wob); ctx.scale(k, k);
      posterText(ctx, c, 0, 0, size, { rot, fill: c === "-" ? PAL.red : PAL.gold, shadows: [PAL.red, PAL.blue], depth: size * 0.05, line: size * 0.07 });
      ctx.restore();
      cx += w + size * 0.04;
    });
    ctx.restore();
  }

  // Poster checklist panel with icon bullets; items appear at their times.
  function checklist(ctx, x, y, w, items, t, o = {}) {
    const { size = 46, gap = 70, scale = 1 } = o;
    const full = items.length * gap + 60, top = -full / 2;
    if (scale <= 0) return;
    // The panel grows a line at a time from its top edge, easing to fit what's been listed.
    const shown = items.reduce((n, it) => n + ease.outCubic(clamp((t - it.at + 0.05) / 0.2)), 0);
    const h = Math.max(1, shown) * gap + 60;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(-0.02);
    ctx.fillStyle = "rgba(10,10,20,0.92)"; ctx.fillRect(-w / 2, top, w, h);
    ctx.setLineDash([2, 16]); ctx.lineCap = "round"; ctx.lineWidth = 9; ctx.strokeStyle = PAL.red; ctx.strokeRect(-w / 2 + 14, top + 14, w - 28, h - 28);
    ctx.setLineDash([]);
    items.forEach((item, i) => {
      const u = t - item.at, k = ease.outBack(clamp(u / 0.3));
      if (k <= 0) return;
      // The tick: a quick 1 -> 1.15 -> 1 pop over 8 frames once the line has landed.
      const tick = 1 + 0.15 * Math.sin(Math.PI * clamp((u - 0.2) / 0.27));
      const iy = top + 30 + gap * (i + 0.5);
      ctx.save(); ctx.translate(-w / 2 + 70, iy); ctx.scale(k * tick, k * tick);
      TR.cast.sprite(ctx, item.icon, 0, 0, 2.2);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = clamp(k);
      label(ctx, item.text, -w / 2 + 120 + (1 - k) * 60, iy, size, { align: "left", fill: item.color || PAL.cream, stroke: PAL.ink });
      ctx.restore();
    });
    ctx.restore();
  }

  // A word that slams in (big -> size), holds, then kicks out.
  function slam(ctx, text, t, at, x, y, size, o = {}) {
    const { hold = 1, fill = PAL.gold, shadows = [PAL.red, PAL.blue], rot = -0.05, out = 0.18, font = "AstraTitle", glow = null } = o;
    const u = t - at;
    if (u < 0 || u > hold + out) return;
    const kin = clamp(u / 0.16), k = u < hold ? lerp(2.6, 1, ease.outCubic(kin)) : lerp(1, 0.2, ease.inCubic(clamp((u - hold) / out)));
    const a = u < hold ? clamp(kin * 3) : 1 - clamp((u - hold) / out);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(k, k);
    posterText(ctx, text, 0, 0, size, { fill, shadows, rot, font, glow });
    ctx.restore();
  }

  TR.cards = { badge, callout, logo, checklist, slam };
})();
