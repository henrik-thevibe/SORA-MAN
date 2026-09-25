/* Scene transitions. Each composites the outgoing shot (A) and the incoming
 * shot (B), both already drawn to offscreen canvases, for progress p in 0..1. */
(function () {
  "use strict";
  const { W, H, PAL, clamp, lerp, ease, hash, staticNoise } = TR;

  // Sora chomps across the frame left to right, eating A to reveal B behind him.
  function chomp(ctx, A, B, p, tr, t) {
    const x = lerp(-420, W + 420, ease.inOutCubic(p));
    ctx.drawImage(A, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, Math.max(0, x - 40), H); ctx.clip();
    ctx.drawImage(B, 0, 0);
    ctx.restore();
    // A torn, bitten edge along the seam.
    ctx.save(); ctx.fillStyle = PAL.ink;
    ctx.beginPath(); ctx.moveTo(x - 40, 0);
    for (let y = 0; y <= H; y += 60) ctx.lineTo(x - 40 + (y / 60) % 2 * 26, y);
    ctx.lineTo(x - 40, H); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Crumbs of the old scene flying out of his mouth.
    for (let i = 0; i < 14; i++) {
      const k = (p * 3 + hash(i) ) % 1, cx = x + 120 + hash(i + 9) * 200 * k, cy = H / 2 + (hash(i + 4) - 0.5) * 380 * k;
      TR.cast.sprite(ctx, i % 5 ? "chip" : "gpu", cx, cy, i % 5 ? 4 : 2, { alpha: 1 - k, rot: k * 6 });
    }
    TR.cast.hero(ctx, TR.cast.heroFrame.sora(t, 16), x, H / 2, 9, { glow: "rgba(255,200,40,0.7)", glowSize: 60 });
  }

  // A circle closes on A's focus, then opens from B's focus.
  function iris(ctx, A, B, p, tr) {
    const closing = p < 0.5, k = closing ? ease.inCubic(p * 2) : ease.outCubic((p - 0.5) * 2);
    const [fx, fy] = closing ? tr.focusA || [W / 2, H / 2] : tr.focusB || [W / 2, H / 2];
    const r = closing ? lerp(2300, 0, k) : lerp(0, 2300, k);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.arc(fx, fy, Math.max(0, r), 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(closing ? A : B, 0, 0);
    ctx.restore();
    if (r > 2 && r < 2200) {
      ctx.save(); ctx.lineWidth = 14; ctx.strokeStyle = PAL.gold; ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = PAL.ink; ctx.beginPath(); ctx.arc(fx, fy, r + 10, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  // A breaks into pixel blocks and noise that resolve into B.
  function glitch(ctx, A, B, p, tr, t) {
    const S = 64, cols = Math.ceil(W / S), rows = Math.ceil(H / S);
    ctx.drawImage(A, 0, 0);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      // Blocks flip in a rough top-to-bottom wave with noise.
      const order = 0.55 * hash(x * 131 + y * 71) + 0.45 * (y / rows);
      if (order < p) ctx.drawImage(B, x * S, y * S, S, S, x * S, y * S, S, S);
    }
    // Displaced horizontal slices, strongest mid-transition.
    const f = Math.floor(t * 30), strength = Math.sin(Math.PI * p);
    for (let i = 0; i < 10; i++) {
      if (hash(f * 17 + i) > 0.7) continue;
      const sy = Math.floor(hash(f * 5 + i) * H), sh = 8 + Math.floor(hash(f + i * 3) * 70), off = (hash(f * 13 + i) - 0.5) * 260 * strength;
      ctx.drawImage(ctx.canvas, 0, sy, W, sh, off, sy, W, sh);
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.14 * strength;
    ctx.fillStyle = "#ff2bd6"; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = "overlay"; staticNoise(ctx, t, 0.5 * strength, 6); ctx.restore();
  }

  TR.transitions = { chomp, iris, glitch };
})();
