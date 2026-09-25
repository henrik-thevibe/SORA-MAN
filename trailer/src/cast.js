/* The cast: a painted SORA (drawn procedurally, glossy like the master renders),
 * the ghost renders with a poster keyline, and the game's own pixel sprites. */
(function () {
  "use strict";
  const { PAL, clamp, hash } = TR;

  // --- SORA: a gold cloud with star eyes ------------------------------------
  const LOBES = 9;
  function cloudPath(g, r, wobble = 0, t = 0) {
    g.beginPath();
    const steps = 180;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      // Scalloped edge: nine soft lobes, bottom slightly flatter.
      const lobe = Math.pow(Math.abs(Math.cos((a * LOBES) / 2)), 0.6);
      let rr = r * (0.9 + 0.1 * lobe) * (1 + wobble * Math.sin(a * 3 + t * 5) * 0.02);
      if (Math.sin(a) > 0) rr *= 1 - 0.06 * Math.sin(a);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }
  function star4(g, x, y, r, rot = 0) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.26 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }
  let soraCanvas = null;
  // mouth: 0 closed .. 1 wide; eyes: 0 dark .. 1 lit; look: -1..1 pupil shift
  function sora(ctx, x, y, size, o = {}) {
    const { mouth = 0.5, eyes = 1, dir = 1, t = 0, glow = 0.6, wobble = 1, squash = 0, dim = 0, rot = 0 } = o;
    const S = Math.ceil(size * 1.5);
    if (!soraCanvas || soraCanvas.width !== S) { soraCanvas = document.createElement("canvas"); soraCanvas.width = soraCanvas.height = S; }
    const g = soraCanvas.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    const r = size / 2;
    g.translate(S / 2, S / 2);
    g.scale(1 + squash, 1 - squash);
    // Body.
    cloudPath(g, r, wobble, t);
    const body = g.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
    body.addColorStop(0, PAL.goldHi); body.addColorStop(0.45, PAL.gold); body.addColorStop(0.85, PAL.goldDeep); body.addColorStop(1, PAL.amber);
    g.fillStyle = body; g.fill();
    g.lineWidth = r * 0.07; g.strokeStyle = "#8a3a06"; g.stroke();
    // Specular highlights.
    g.save(); g.globalAlpha = 0.55; g.fillStyle = "#fffbe0";
    g.beginPath(); g.ellipse(-r * 0.38, -r * 0.5, r * 0.28, r * 0.13, -0.6, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.35; g.beginPath(); g.ellipse(-r * 0.62, -r * 0.15, r * 0.06, r * 0.12, -0.3, 0, Math.PI * 2); g.fill();
    g.restore();
    // Mouth: a wedge cut out, facing `dir` (+1 right, -1 left).
    const open = clamp(mouth) * 0.62;
    if (open > 0.02) {
      g.save(); g.globalCompositeOperation = "destination-out";
      const base = dir > 0 ? 0 : Math.PI;
      g.beginPath(); g.moveTo(-dir * r * 0.05, r * 0.02); g.arc(0, 0, r * 1.3, base - open, base + open); g.closePath(); g.fill();
      g.restore();
      // Inner mouth rim so the cut reads as a mouth.
      g.save(); g.beginPath(); g.moveTo(-dir * r * 0.05, r * 0.02);
      g.lineTo(Math.cos(base - open) * r * 0.95, Math.sin(base - open) * r * 0.95);
      g.moveTo(-dir * r * 0.05, r * 0.02); g.lineTo(Math.cos(base + open) * r * 0.95, Math.sin(base + open) * r * 0.95);
      g.lineWidth = r * 0.06; g.strokeStyle = "#8a3a06"; g.lineCap = "round"; g.stroke(); g.restore();
    }
    // Star eye (the sparkle is drawn after dimming, so it can shine in the dark).
    const ex = dir * r * 0.18, ey = -r * 0.38;
    g.fillStyle = "#120c06"; g.beginPath(); g.ellipse(ex, ey, r * 0.17, r * 0.21, 0, 0, Math.PI * 2); g.fill();
    if (dim > 0) { g.globalCompositeOperation = "source-atop"; g.fillStyle = `rgba(6,6,14,${clamp(dim)})`; g.fillRect(-S, -S, S * 2, S * 2); g.globalCompositeOperation = "source-over"; }
    if (eyes > 0) {
      g.save(); g.globalAlpha = clamp(eyes);
      g.shadowColor = "#fff6b0"; g.shadowBlur = r * 0.25 * eyes;
      g.fillStyle = "#ffffff"; star4(g, ex + dir * r * 0.02, ey, r * 0.13 * (0.85 + 0.15 * Math.sin(t * 6)), t * 0.6);
      g.fill(); g.restore();
    }
    // Composite with a warm glow.
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (glow > 0 && dim < 0.9) { ctx.shadowColor = `rgba(255,190,40,${glow})`; ctx.shadowBlur = size * 0.35; }
    ctx.drawImage(soraCanvas, -S / 2, -S / 2);
    ctx.restore();
  }

  // --- Ghost renders with a poster keyline and halftone drop shadow ----------
  const keyed = new Map();
  function outlined(img, line, color) {
    const key = img.src + line + color;
    if (keyed.has(key)) return keyed.get(key);
    const c = document.createElement("canvas"); c.width = img.width + line * 4; c.height = img.height + line * 4;
    const g = c.getContext("2d");
    // Silhouette in the keyline colour, stamped around a circle.
    const sil = document.createElement("canvas"); sil.width = img.width; sil.height = img.height;
    const s = sil.getContext("2d"); s.drawImage(img, 0, 0); s.globalCompositeOperation = "source-in"; s.fillStyle = color; s.fillRect(0, 0, sil.width, sil.height);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.drawImage(sil, line * 2 + Math.cos(a) * line, line * 2 + Math.sin(a) * line); }
    g.drawImage(img, line * 2, line * 2);
    keyed.set(key, c);
    return c;
  }
  function ghost(ctx, name, x, y, h, o = {}) {
    const { rot = 0, alpha = 1, line = 10, key = PAL.ink, shadow = true, flip = false, tint = null } = o;
    const img = TR.img(`cast/${name}`);
    if (!img) return;
    const c = outlined(img, line, key), s = h / img.height;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(flip ? -s : s, s);
    if (shadow) {
      ctx.save(); ctx.translate(26, 30); ctx.globalAlpha *= 0.55;
      ctx.drawImage(silhouette(c, "#000"), -c.width / 2, -c.height / 2);
      ctx.restore();
    }
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    if (tint) { ctx.globalAlpha *= o.tintAmount ?? 0.85; ctx.drawImage(silhouette(c, tint), -c.width / 2, -c.height / 2); }
    ctx.restore();
  }
  const sils = new Map();
  function silhouette(c, color) {
    const key = c.width + "x" + c.height + color + (c.__id || (c.__id = Math.random()));
    if (sils.has(key)) return sils.get(key);
    const s = document.createElement("canvas"); s.width = c.width; s.height = c.height;
    const g = s.getContext("2d"); g.drawImage(c, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = color; g.fillRect(0, 0, s.width, s.height);
    sils.set(key, s);
    return s;
  }

  // --- Pixel sprites, nearest-neighbour ------------------------------------
  function sprite(ctx, name, x, y, scale, o = {}) {
    const img = TR.img(`sprites/${name}`);
    if (!img) return;
    const { flip = false, alpha = 1, rot = 0 } = o;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(flip ? -scale : scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  // --- Hero pixel sprites (64 x 64), nearest-neighbour -----------------------
  // dim darkens toward black (0..1); glow adds a coloured bloom behind.
  function hero(ctx, key, x, y, scale, o = {}) {
    const img = TR.hero.get(key);
    if (!img) return;
    const { alpha = 1, dim = 0, flip = false, rot = 0, glow = null, glowSize = 40, squash = 0 } = o;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale((flip ? -scale : scale) * (1 + squash), scale * (1 - squash));
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = glowSize; }
    if (dim > 0) ctx.filter = `brightness(${Math.max(0, 1 - dim)})`;
    ctx.drawImage(img, -32, -32);
    ctx.restore();
  }
  // Frame keys for animated heroes.
  const heroFrame = {
    sora: (t, rate = 10, left = false) => `sora-${[0, 1, 2, 3, 2, 1][Math.floor(t * rate) % 6]}${left ? "-l" : ""}`,
    ghost: (id, t, rate = 6, blinkEvery = 2.3) => ((t % blinkEvery) < 0.12 ? `${id}-blink` : `${id}-${Math.floor(t * rate) % 4}`),
    scared: (id, t) => `${id}-scared-${Math.floor(t * 6) % 2}`,
  };
  TR.cast = { sora, ghost, sprite, star4, hero, heroFrame };
  TR.CAST = [
    { id: "claude", ghost: "blinky", name: "CLAUDE", sub: "DIRECT PURSUIT", color: PAL.claude, bg: ["#ff9a4a", "#e8552b"] },
    { id: "muse", ghost: "pinky", name: "MUSE", sub: "THE AMBUSHER", color: "#ffb89a", bg: ["#ffd3c2", "#ff8fa8"] },
    { id: "grok", ghost: "inky", name: "GROK", sub: "THE FLANKER", color: "#cfd3ff", bg: ["#6a5c8c", "#3a3052"] },
    { id: "gemini", ghost: "clyde", name: "GEMINI", sub: "CHASE AND RETREAT", color: PAL.gemini, bg: ["#58e0ff", "#7a5bff"] },
  ];
})();
