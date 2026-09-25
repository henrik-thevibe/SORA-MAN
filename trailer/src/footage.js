/* Captured gameplay on screen: frame lookup by timeline anchor, pixel-exact
 * upscaling, punch-zoom onto a player, and a glowing arcade-screen frame. */
(function () {
  "use strict";
  const { clamp, lerp, PAL, FPS } = TR;
  const GW = 448, GH = 576; // capture size (2x the 224 x 288 logical screen)

  // Frame index for timeline time t, given a segment anchored so that clip
  // frame `f` shows at time `at` (speed 1 = real time).
  const indexAt = (seg, t) => seg.f + (t - seg.at) * FPS * (seg.speed ?? 1);

  // A player's position on the captured frame, in capture pixels.
  function focus(clip, index, player = 0) {
    const m = TR.meta(clip), row = m.track?.[Math.max(0, Math.min(m.frames - 1, Math.round(index)))];
    const p = row && row[1 + player];
    if (!p) return [GW / 2, GH / 2];
    return [p[0] * 16, p[1] * 16 + 48];
  }
  // Smoothed focus (average over a short window) so zooms don't jitter.
  function smoothFocus(clip, index, player = 0, span = 8) {
    let x = 0, y = 0, n = 0;
    for (let i = -span; i <= span; i += 2) { const [fx, fy] = focus(clip, index + i, player); x += fx; y += fy; n++; }
    return [x / n, y / n];
  }

  // Draw the game frame into a box of width w centred on (cx, cy).
  // zoom > 1 crops toward the focus; the crop keeps the 7:9 aspect.
  function screen(ctx, clip, index, cx, cy, w, o = {}) {
    const { zoom = 1, player = 0, rot = 0, frame = true, glow = PAL.neon, alpha = 1, crt = true, aspect = GW / GH, overlay = null, free = false } = o;
    const h = w / aspect;
    const img = TR.frame(clip, index);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(cx, cy); ctx.rotate(rot);
    if (frame) {
      // Bezel: black keyline, neon rim, soft outer glow.
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = 60;
      ctx.fillStyle = "#05050c"; roundRect(ctx, -w / 2 - 22, -h / 2 - 22, w + 44, h + 44, 26); ctx.fill();
      ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = glow; roundRect(ctx, -w / 2 - 12, -h / 2 - 12, w + 24, h + 24, 18); ctx.stroke();
      ctx.lineWidth = 10; ctx.strokeStyle = PAL.ink; roundRect(ctx, -w / 2 - 25, -h / 2 - 25, w + 50, h + 50, 30); ctx.stroke();
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
    let map = null;
    ctx.fillStyle = "#000"; ctx.fillRect(-w / 2, -h / 2, w, h);
    if (img) {
      ctx.imageSmoothingEnabled = zoom * w / GW < 1.5 ? true : false;
      let sw = GW / zoom, sh = sw / aspect;
      if (sh > GH) { sh = GH; sw = sh * aspect; }
      let sx = (GW - sw) / 2, sy = (GH - sh) / 2;
      if (zoom > 1.01) {
        const [fx, fy] = smoothFocus(clip, index, player);
        if (free) {
          // Centre on the player, letting the crop run up to 12% / 20% past the capture (black beyond it).
          sx = clamp(fx - sw / 2, -sw * 0.12, GW - sw * 0.88); sy = clamp(fy - sh / 2, -sh * 0.2, GH - sh * 0.8);
        } else {
          sx = clamp(fx - sw / 2, 0, GW - sw); sy = clamp(fy - sh / 2, Math.min(48, GH - sh), Math.max(0, GH - 34 - sh));
        }
      }
      // Draw only the part of the crop that lies on the capture.
      const x0 = Math.max(sx, 0), y0 = Math.max(sy, 0), x1 = Math.min(sx + sw, GW), y1 = Math.min(sy + sh, GH);
      if (x1 > x0 && y1 > y0) ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, -w / 2 + ((x0 - sx) * w) / sw, -h / 2 + ((y0 - sy) * h) / sh, ((x1 - x0) * w) / sw, ((y1 - y0) * h) / sh);
      // Capture pixels -> local screen coordinates, for overlays.
      map = (px, py) => [-w / 2 + ((px - sx) * w) / sw, -h / 2 + ((py - sy) * h) / sh];
      map.k = w / sw;
    }
    if (crt) {
      // Scanlines + glass sheen.
      const lines = Math.max(3, Math.round(w / 224));
      ctx.globalAlpha = 0.16; ctx.fillStyle = "#000";
      for (let y = -h / 2; y < h / 2; y += lines * 2) ctx.fillRect(-w / 2, y, w, lines);
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, "rgba(255,255,255,0.10)"); g.addColorStop(0.4, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
    // Overlays (callouts, stickers) draw in screen space, unclipped, so they can poke past the bezel.
    if (overlay && map) overlay(ctx, map, w, h);
    ctx.restore();
    return h;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Events in a clip between two frame indices.
  function events(clip, from, to, names) {
    return TR.meta(clip).events.filter((e) => e.frame >= from && e.frame < to && (!names || names.includes(e.name)));
  }

  TR.footage = { indexAt, focus, smoothFocus, screen, events, roundRect, GW, GH };
})();
