/* Cabinet backdrops drawn with p5.js: four retro styles × five character themes, all pixel art painted in code. */
(function () {
  "use strict";
  const Art = window.PacmanArt, E = window.PacmanEngine;
  const UNIT = 2;   // CSS px per art pixel: fine enough for lit shading, still unmistakably pixel art.
  const STORE = "astra-backdrop";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  const THEMES = {
    astra: { name: "SORA", maze: "#284bff", paint: "#ffd31a", shade: "#e0a812", light: "#fff27a", ink: "#3a2606", deep: "#0f0b04", wall: "#e0a812",
      accent: "#2a4bff", dash: "#ffd31a", line2: "#35bfe9", neon: ["#ffe52c", "#fff79a", "#ffb847", "#ff8a1c", "#ffffff"], motif: "star" },
    claude: { name: "CLAUDE", maze: "#e8683a", paint: "#f5824d", shade: "#d25b35", light: "#ffb879", ink: "#4a1608", deep: "#120604", wall: "#f5824d",
      accent: "#ff9a66", dash: "#ff9a66", line2: "#ffd3a8", neon: ["#ff9a66", "#ffb879", "#ffd3a8", "#ff6a3d", "#fff0e0"], motif: "sun" },
    muse: { name: "MUSE", maze: "#ffa877", paint: "#fff0d7", shade: "#ecd4b4", light: "#fffaf0", ink: "#8a5a3c", deep: "#130e0a", wall: "#ffbe91",
      accent: "#ffbe91", dash: "#ffbe91", line2: "#ff8a55", neon: ["#ffe9c5", "#ffbe91", "#fff6e6", "#ff9d7a", "#ffd9b8"], motif: "shell" },
    grok: { name: "GROK", maze: "#8a90a8", paint: "#1d1f2a", shade: "#101119", light: "#343849", ink: "#b9c0d9", deep: "#06070b", wall: "#8a90a8",
      accent: "#b9c0d9", dash: "#dfe3f5", line2: "#707586", neon: ["#c4c9e0", "#ffffff", "#8a90a8", "#e8ecff", "#707586"], motif: "slash" },
    gemini: { name: "GEMINI", maze: "#35bfe9", paint: "#16205a", shade: "#0d1438", light: "#26348a", ink: "#65e2ef", deep: "#050820", wall: "#35bfe9",
      accent: "#35bfe9", dash: "#ffe94a", line2: "#35bfe9", neon: ["#ff5a7a", "#ffb13b", "#ffe94a", "#5de07a", "#35bfe9", "#9b7bff"], motif: "shard" },
  };
  for (const [id, theme] of Object.entries(THEMES)) theme.id = id;
  const THEME_CAST = { claude: "blinky", muse: "pinky", grok: "inky", gemini: "clyde" };
  const MOTIFS = {
    star: ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."],
    sun: ["#..#..#", ".#.#.#.", "..###..", "###.###", "..###..", ".#.#.#.", "#..#..#"],
    shell: [".###.", "#####", "#.#.#", "#####", "#.#.#"],
    slash: ["....##", "...##.", "..##..", ".##...", "##...."],
    shard: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
  };
  const TWINKLE = [".#.", "###", ".#."];
  const CAST = ["blinky", "pinky", "inky", "clyde"];

  /* ---------- Pixel helpers (coordinates in art pixels) ---------- */
  function box(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
  function glyph(ctx, rows, x, y, color, s = 1) {
    rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === "#") box(ctx, x + rx * s, y + ry * s, s, s, color); });
  }
  // Solid-colour copies of an image, for outlines, drop shadows and glows.
  const silhouettes = new Map();
  function silhouette(image, color) {
    const byColor = silhouettes.get(image) || new Map();
    silhouettes.set(image, byColor);
    if (byColor.has(color)) return byColor.get(color);
    const s = document.createElement("canvas"); s.width = image.width; s.height = image.height;
    const c = s.getContext("2d"); c.drawImage(image, 0, 0); c.globalCompositeOperation = "source-in"; c.fillStyle = color; c.fillRect(0, 0, s.width, s.height);
    byColor.set(color, s);
    return s;
  }
  // Rounded rectangles as pixel spans: the inset of row y for a box of radius r.
  function rowInset(y0, y1, r, y) {
    const dy = y < y0 + r ? y0 + r - y - 0.5 : y >= y1 - r ? y - (y1 - r) + 0.5 : 0;
    return dy > 0 ? Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
  }
  function roundRect(ctx, x0, y0, x1, y1, r, color) {
    ctx.fillStyle = color;
    for (let y = y0; y < y1; y++) { const i = rowInset(y0, y1, r, y); ctx.fillRect(x0 + i, y, x1 - x0 - i * 2, 1); }
  }
  // A one-pixel rounded ring d pixels outside rectangle S. The colour may depend on position;
  // an optional mask thins it into dithered glows and dotted lines.
  function ring(ctx, S, d, r, color, mask) {
    const x0 = S.x0 - d - 1, y0 = S.y0 - d - 1, x1 = S.x1 + d + 1, y1 = S.y1 + d + 1, rr = Math.max(0, r + d);
    const put = (a, b, y) => {
      for (let x = a; x <= b; x++) {
        const c = typeof color === "function" ? color(x, y, x0, y0, x1, y1) : color;
        if (c && (!mask || mask(x, y))) box(ctx, x, y, 1, 1, c);
      }
    };
    for (let y = y0; y < y1; y++) {
      const l = x0 + rowInset(y0, y1, rr, y), rgt = x1 - 1 - rowInset(y0, y1, rr, y);
      if (y === y0 || y === y1 - 1) { put(l, rgt, y); continue; }
      const il = x0 + 1 + rowInset(y0 + 1, y1 - 1, Math.max(0, rr - 1), y), ir = x1 - 2 - rowInset(y0 + 1, y1 - 1, Math.max(0, rr - 1), y);
      put(l, Math.max(l, il - 1), y); put(Math.min(rgt, ir + 1), rgt, y);
    }
  }
  const mix = (a, b, t) => {
    const p = [a, b].map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
    return "#" + p[0].map((v, i) => Math.round(v + (p[1][i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  function castSprite(id, opts) { return id === "pacman" ? Art.sprite("pacman", opts) : Art.sprite("ghost", { id, ...opts }); }
  function reactState(react, t) {
    if (!react.frightened) return "CHASE";
    return react.warning && Math.floor(t * 4) % 2 === 0 ? "WARNING" : "FRIGHTENED";
  }
  // Bezel lines turn frightened-blue while a power pellet is active, flashing pale as it runs out.
  function bezelColor(color, react, t) {
    if (!react.frightened) return color;
    return react.warning && Math.floor(t * 4) % 2 === 0 ? "#fff2dc" : "#305bea";
  }

  /* ---------- Styles: each has a base, ambient motion and a bezel that frames the game screen ---------- */
  const CONCEPTS = {
    // Midway-style cabinet side: glossy paint, black T-molding, Yamashita speed lines, a pellet chase and a monitor bezel.
    cabinet: {
      name: "CABINET",
      build(ctx, W, H, T, p) {
        box(ctx, 0, 0, W, H, T.paint);
        // Paint depth: a dithered falloff toward the bottom, then two gloss streaks.
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const fall = y / H, d = (x + y * 0.7) % 520;
          if (fall > 0.55 && bayer(x, y) < (fall - 0.55) * 1.2) box(ctx, x, y, 1, 1, T.shade);
          if (d < 26 || (d < 36 && bayer(x, y) < (36 - d) / 10) || (d > 60 && d < 66)) box(ctx, x, y, 1, 1, T.light);
        }
        for (let i = 0; i < Math.round(W * H / 16000); i++) glyph(ctx, MOTIFS[T.motif], Math.floor(p.random(16, W - 32)), Math.floor(p.random(16, H - 32)), T.shade, 2);
        const edge = "#0b0b10", rim = "#45485a";
        box(ctx, 0, 0, W, 8, edge); box(ctx, 0, H - 8, W, 8, edge); box(ctx, 0, 0, 8, H, edge); box(ctx, W - 8, 0, 8, H, edge);
        box(ctx, 2, 2, W - 4, 1, rim); box(ctx, 2, 2, 1, H - 4, rim); box(ctx, 5, H - 6, W - 10, 1, "#1b1c24");
        const lines = [];
        for (let i = 0; i < Math.max(3, Math.round(H / 90)); i++) {
          const y = Math.floor(p.random(24, H - 60)), count = Math.floor(p.random(3, 6)), x = Math.floor(p.random(0, W * 0.8));
          for (let k = 0; k < count; k++) lines.push({ y: y + k * 6, x: x + k * 10, span: Math.floor(p.random(80, 240)), dash: Math.floor(p.random(12, 28)), gap: Math.floor(p.random(6, 12)), speed: p.random(12, 28) });
        }
        return { lines };
      },
      animate(ctx, scene, W, H, T, t, react, free) {
        for (const l of scene.lines) {
          if (!free(l.x, l.y, l.x + l.span, l.y + 2)) continue;
          const period = l.dash + l.gap, shift = (t * l.speed) % period;
          for (let x = -period; x < l.span; x += period) {
            const a = Math.max(0, x + shift), b = Math.min(l.span, x + shift + l.dash);
            if (b > a) box(ctx, Math.round(l.x + a), l.y, Math.round(b - a), 2, T.ink);
          }
        }
        // A chase along the bottom trim: Astra eats a pellet trail, pursued by the cast.
        const y = H - 44, loop = 26, lead = Math.round(-80 + ((t % loop) / loop) * (W + 320));
        for (let x = 20; x < W - 16; x += 16) if (x > lead + 20) box(ctx, x, y + 14, 4, 4, T.ink);
        ctx.drawImage(Art.sprite("pacman", { direction: 3, frame: [0, 1, 2, 3, 2, 1][Math.floor(t * 12) % 6] }), lead, y, 32, 32);
        const chasers = T.id === "astra" ? CAST : [THEME_CAST[T.id]];
        chasers.forEach((id, i) => ctx.drawImage(castSprite(id, { direction: 3, frame: Math.floor(t * 8 + i) % 4, state: reactState(react, t) }), lead - 60 - i * 40, y, 32, 32));
      },
      // A black monitor bezel with a maze-wall double line, a ring of pellet dots and blinking power pellets.
      bezel(ctx, S, T, t, react, R) {
        const wall = bezelColor(T.accent, react, t);
        for (let d = 0; d < R; d++) ring(ctx, S, d, 3, d === R - 1 ? "#45485a" : d === R - 2 ? "#000" : "#0b0b10");
        ring(ctx, S, 1, 3, wall); ring(ctx, S, 3, 3, wall);
        ring(ctx, S, R - 4, 3, "#ffdfb6", (x, y) => (x + y) % 6 === 0);
        if (Math.floor(t * 2.5) % 2 === 0 || reduced.matches) {
          for (const [x, y] of [[S.x0 - R + 1, S.y0 - R + 1], [S.x1 + R - 5, S.y0 - R + 1], [S.x0 - R + 1, S.y1 + R - 5], [S.x1 + R - 5, S.y1 + R - 5]]) {
            box(ctx, x + 1, y, 2, 4, "#ffdfb6"); box(ctx, x, y + 1, 4, 2, "#ffdfb6");
          }
        }
      },
    },

    // Pocket handheld: moulded shell with bevels and texture, screws, a speaker grille and a recessed screen window.
    handheld: {
      name: "HANDHELD",
      build(ctx, W, H, T, p) {
        box(ctx, 0, 0, W, H, "#06070e");
        const r = Math.min(56, Math.round(Math.min(W, H) * 0.09));
        roundRect(ctx, 0, 0, W, H, r, "#07080c");
        roundRect(ctx, 2, 2, W - 2, H - 2, r - 2, T.shade);
        roundRect(ctx, 2, 2, W - 5, H - 5, r - 2, T.light);
        roundRect(ctx, 5, 5, W - 5, H - 5, r - 5, T.paint);
        // Moulded plastic: faint speckle and a soft dithered shade toward the lower edge.
        for (let y = r; y < H - r; y++) for (let x = 8; x < W - 8; x++) {
          if (y > H * 0.7 && bayer(x, y) < (y / H - 0.7) * 0.9) box(ctx, x, y, 1, 1, T.shade);
          else if (p.random() < 0.012) box(ctx, x, y, 1, 1, p.random() < 0.5 ? T.shade : T.light);
        }
        const corner = Math.round(r * 0.45) + 10;
        for (const [sx, sy] of [[corner, corner], [W - corner - 14, corner], [corner, H - corner - 14], [W - corner - 14, H - corner - 14]]) {
          roundRect(ctx, sx - 1, sy - 1, sx + 15, sy + 15, 8, T.shade);
          roundRect(ctx, sx, sy, sx + 14, sy + 14, 7, T.light);
          roundRect(ctx, sx + 2, sy + 2, sx + 12, sy + 12, 5, T.paint);
          for (let k = 0; k < 9; k++) box(ctx, sx + 3 + k, sy + 11 - k, 1, 1, T.ink);
          box(ctx, sx + 4, sy + 3, 2, 1, "#ffffff88");
        }
        return { r, grilleSpots: [[W - r - 150, H - r - 60], [r + 12, H - r - 60], [W - r - 150, corner + 22]] };
      },
      animate(ctx, scene, W, H, T, t, react, free) {
        const grille = scene.grilleSpots.find(([gx, gy]) => free(gx - 4, gy - 4, gx + 152, gy + 44));
        if (grille) for (let i = 0; i < 8; i++) for (let k = 0; k < 40; k++) {
          const x = grille[0] + i * 17 + Math.floor(k * 0.55), y = grille[1] + k;
          box(ctx, x - 1, y, 1, 1, T.shade); box(ctx, x, y, 6, 1, T.ink); box(ctx, x + 6, y, 1, 1, T.light);
        }
        const cycle = t % 9;
        if (cycle < 1.6) {
          const pos = -H + (cycle / 1.6) * (W + H * 2);
          for (let yy = scene.r; yy < H - scene.r; yy++) {
            const x0 = Math.round(pos - yy * 0.6);
            for (let q = 0; q < 12; q++) if (bayer(x0 + q, yy) < 0.5) box(ctx, x0 + q, yy, 1, 1, T.light);
          }
        }
      },
      // A recessed dark window around the screen, with the dashed and solid lines of a pocket player.
      bezel(ctx, S, T, t, react, R) {
        for (let d = 0; d < R; d++) ring(ctx, S, d, 6, "#1a1c26");
        // Recessed: the upper-left edges fall in shadow, the lower-right lip catches the light.
        const lit = (a, b) => (x, y, x0, y0, x1, y1) => (x - x0 + y - y0 < x1 - x + y1 - y ? a : b);
        ring(ctx, S, R - 1, 6, lit("#0c0d13", "#2b2e3b"));
        ring(ctx, S, R, 6, lit(T.shade, T.light));
        ring(ctx, S, 0, 6, "#0c0d13");
        const dash = bezelColor(T.dash, react, t), solid = bezelColor(T.line2, react, t);
        ring(ctx, S, 3, 6, dash, (x, y) => (x + y) % 7 < 4);
        ring(ctx, S, R - 4, 6, solid);
      },
    },

    // 80s arcade carpet: neon confetti, pellets and tiny cast members on a dark weave, drifting slowly.
    carpet: {
      name: "CARPET",
      build(ctx, W, H, T, p) {
        box(ctx, 0, 0, W, H, T.deep);
        const weave = mix(T.deep, "#ffffff", 0.05);
        const tiles = [0, 1].map(() => {
          const size = 128, c = document.createElement("canvas");
          c.width = c.height = size;
          const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
          box(g, 0, 0, size, size, T.deep);
          for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if ((x + y * 3) % 8 === 0) box(g, x, y, 1, 1, weave);
          const pick = () => T.neon[Math.floor(p.random(T.neon.length))];
          for (let i = 0; i < 9; i++) box(g, Math.floor(p.random(4, size - 8)), Math.floor(p.random(4, size - 8)), 4, 4, pick());
          for (let i = 0; i < 2; i++) { const x = Math.floor(p.random(8, size - 16)), y = Math.floor(p.random(8, size - 16)), c2 = pick(); box(g, x + 2, y, 4, 8, c2); box(g, x, y + 2, 8, 4, c2); box(g, x + 2, y + 2, 2, 2, "#ffffff"); }
          for (let i = 0; i < 3; i++) {
            const x = Math.floor(p.random(4, size - 24)), y = Math.floor(p.random(8, size - 16)), c2 = pick(), kind = Math.floor(p.random(3));
            if (kind === 0) for (let k = 0; k < 10; k++) box(g, x + k * 2, y + (k % 4 < 2 ? k % 2 : 1 - (k % 2)) * 2, 2, 2, c2);
            else if (kind === 1) glyph(g, [".###.", "#...#", "#...#", "#...#", ".###."], x, y, c2, 2);
            else glyph(g, ["..#..", ".#.#.", "#...#", "#####"], x, y, c2, 2);
          }
          glyph(g, MOTIFS[T.motif], Math.floor(p.random(8, size - 24)), Math.floor(p.random(8, size - 24)), pick(), 2);
          const who = T.id === "astra" ? ["pacman", ...CAST][Math.floor(p.random(5))] : THEME_CAST[T.id];
          g.drawImage(castSprite(who, { direction: Math.floor(p.random(4)), frame: 1 }), Math.floor(p.random(8, size - 40)), Math.floor(p.random(8, size - 40)), 32, 32);
          return c;
        });
        const stars = Array.from({ length: Math.round(W * H / 10000) }, () => ({ x: Math.floor(p.random(W)), y: Math.floor(p.random(H)), phase: p.random(6), color: T.neon[Math.floor(p.random(T.neon.length))] }));
        return { tiles, stars };
      },
      animate(ctx, scene, W, H, T, t) {
        const off = (t * 6) % 128;
        for (let row = -1; row * 128 - off / 2 < H; row++) for (let col = -1; col * 128 - off < W; col++) {
          ctx.drawImage(scene.tiles[(row + col + 64) % 2], Math.round(col * 128 - off + 128), Math.round(row * 128 - off / 2 + 128));
        }
        for (const s of scene.stars) if ((t * 1.5 + s.phase) % 6 < 0.6) glyph(ctx, TWINKLE, s.x, s.y, s.color, 2);
      },
      // A double neon tube with a dithered glow, over a dark apron so the weave never touches the screen.
      bezel(ctx, S, T, t, react, R) {
        for (let d = 0; d < R + 6; d++) ring(ctx, S, d, 6, T.deep, d >= R ? (x, y) => bayer(x, y) < (R + 6 - d) / 7 : null);
        if (!reduced.matches && Math.floor(t * 15) % 97 === 3) return; // a rare neon flicker
        const a = bezelColor(T.neon[0], react, t), b = bezelColor(T.neon[T.id === "gemini" ? 4 : 2], react, t);
        const tube = Math.max(3, R - 6);
        for (const [d, lvl] of [[tube - 1, 0.35], [tube + 2, 0.5], [tube + 4, 0.3], [tube + 5, 0.14]]) ring(ctx, S, d, 6, a, (x, y) => bayer(x, y) < lvl);
        ring(ctx, S, tube, 6, a); ring(ctx, S, tube + 1, 6, mix(a, "#ffffff", 0.55));
        ring(ctx, S, 1, 6, b, (x, y) => bayer(x, y) < 0.5);
      },
    },

    // Maze wallpaper: the real maze tiled and dimmed; the screen becomes the ghost house, gate and all.
    maze: {
      name: "MAZE",
      build(ctx, W, H, T) {
        box(ctx, 0, 0, W, H, T.deep);
        const MW = Art.WIDTH * 2, MH = Art.MAP_HEIGHT * 2, maze = silhouette(Art.mazeLayer(false), T.wall);
        const ox = Math.round(((W - MW) / 2) % MW) - MW, oy = Math.round(((H - MH) / 2) % MH) - MH;
        const powers = [], parades = [];
        let best = { row: 1, run: 0 };
        for (let y = 0; y < E.ROWS; y++) {
          let run = 0;
          for (let x = 0; x < E.COLS; x++) run = E.tileKind(x, y) === "wall" ? 0 : run + 1;
          if (run > best.run) best = { row: y, run };
        }
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 0.4;
        for (let y = oy; y < H; y += MH) for (let x = ox; x < W; x += MW) {
          ctx.drawImage(maze, x, y, MW, MH);
          for (let ty = 0; ty < E.ROWS; ty++) for (let tx = 0; tx < E.COLS; tx++) {
            const kind = E.tileKind(tx, ty);
            if (kind === "dot") box(ctx, x + tx * 16 + 7, y + ty * 16 + 7, 3, 3, "#ffdfb6");
            else if (kind === "power") powers.push({ x: x + tx * 16, y: y + ty * 16 });
          }
          if (x === ox) parades.push(y + best.row * 16 - 8);
        }
        ctx.globalAlpha = 1;
        return { powers, parades: parades.filter(py => py > 16 && py < H - 48) };
      },
      animate(ctx, scene, W, H, T, t, react) {
        if (Math.floor(t * 2.5) % 2 === 0) for (const pw of scene.powers) roundRect(ctx, pw.x + 2, pw.y + 2, pw.x + 14, pw.y + 14, 6, "#ffdfb688");
        scene.parades.forEach((y, i) => {
          const loop = 20, lead = Math.round(-240 + (((t + i * 7) % loop) / loop) * (W + 480)), reverse = react.frightened;
          ["pacman", ...CAST].forEach((id, k) => {
            const x = reverse ? W - lead + k * 40 : lead - k * 40;
            const opts = id === "pacman" ? { direction: reverse ? 1 : 3, frame: [0, 1, 2, 3, 2, 1][Math.floor(t * 12) % 6] }
              : { direction: reverse ? 1 : 3, frame: Math.floor(t * 8 + k) % 4, state: reactState(react, t) };
            ctx.drawImage(castSprite(id, opts), x, y, 32, 32);
          });
        });
      },
      // The ghost-house wall at full brightness, with the pink gate across the top.
      bezel(ctx, S, T, t, react, R) {
        for (let d = 0; d < R + 4; d++) ring(ctx, S, d, 4, T.deep);
        const wall = bezelColor(T.wall, react, t);
        const gateL = Math.round(S.x0 + (S.x1 - S.x0) * 0.36), gateR = Math.round(S.x1 - (S.x1 - S.x0) * 0.36);
        const open = (x, y) => y > S.y0 - 2 || x < gateL || x > gateR;
        ring(ctx, S, 2, 4, wall, open); ring(ctx, S, 3, 4, wall, open);
        ring(ctx, S, R - 2, 4, wall, open); ring(ctx, S, R - 1, 4, wall, open);
        box(ctx, gateL - 1, S.y0 - R, 2, R - 2, wall); box(ctx, gateR, S.y0 - R, 2, R - 2, wall);
        box(ctx, gateL + 1, S.y0 - Math.round(R / 2) - 1, gateR - gateL - 1, 3, "#ffb8de");
      },
    },
  };

  /* ---------- Game reactions, read only ---------- */
  function readGame() {
    const g = window.game;
    if (!g) return { state: "ATTRACT", frightened: false, warning: false, level: 1 };
    const frightened = Boolean(g.ghosts?.some(x => x.state === "FRIGHTENED"));
    return { state: g.state, frightened, warning: frightened && g.frightTimer < 2, level: g.level };
  }
  function readChoice() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE));
      if (CONCEPTS[v?.concept] && THEMES[v?.theme]) return v;
    } catch (_) { /* Storage is optional. */ }
    return { concept: "handheld", theme: "astra" };
  }

  /* ---------- One backdrop instance: the page uses a fixed full-viewport one; review pages make many ---------- */
  function create(host, options = {}) {
    const { fixed = false, keepOut = () => [], screen = () => null, read = readGame } = options;
    const choice = { concept: options.concept || "handheld", theme: options.theme || "astra" };
    let rects = [], S = null, R = 8;
    const free = (l, t2, r, b) => !rects.some(k => l < k.r && k.l < r && t2 < k.b && k.t < b);
    let W = 1, H = 1, layer = null, scene = null, t = options.time || 0, lastLevel = null, flourish = -9, instance = null, canvas = null;
    const animated = () => options.animate !== false && (options.forceMotion || !reduced.matches);

    function size() {
      const cssW = fixed ? window.innerWidth : options.width, cssH = fixed ? window.innerHeight : options.height;
      // A hidden or not-yet-laid-out window reports 0 x 0; p5 cannot draw a zero-size layer.
      W = Math.max(1, Math.ceil(cssW / UNIT)); H = Math.max(1, Math.ceil(cssH / UNIT));
      instance.resizeCanvas(W, H);
      canvas.style.width = W * UNIT + "px"; canvas.style.height = H * UNIT + "px";
      rebuild();
    }
    function rebuild() {
      const T = THEMES[choice.theme], concept = CONCEPTS[choice.concept];
      layer = document.createElement("canvas"); layer.width = W; layer.height = H;
      const ctx = layer.getContext("2d"); ctx.imageSmoothingEnabled = false;
      instance.randomSeed([...choice.concept + choice.theme].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 100000);
      scene = concept.build(ctx, W, H, T, instance);
      place(); instance.redraw();
    }
    // The screen and its bezel ring; decorations route around the board and the controls.
    function place() {
      const art = r => ({ x0: Math.floor(r.left / UNIT), y0: Math.floor(r.top / UNIT), x1: Math.ceil(r.right / UNIT), y1: Math.ceil(r.bottom / UNIT) });
      const outs = keepOut(), sr = screen();
      S = sr ? art(sr) : null;
      R = sr && outs[0] ? clamp(Math.round((sr.left - outs[0].left) / UNIT), 4, 16) : 8;
      const m = 12;
      rects = outs.map(r => ({ l: r.left / UNIT - m, t: r.top / UNIT - m, r: r.right / UNIT + m, b: r.bottom / UNIT + m }));
    }
    const sketch = p => {
      // p5 listens for device motion/orientation and reads screen.orientation.type, which some browsers
      // (older iOS Safari, some webviews) lack; every motion event would then throw. Backdrops never use it.
      p._ondevicemotion = p._ondeviceorientation = () => {};
      p.setup = () => {
        const c = p.createCanvas(2, 2);
        canvas = c.elt; canvas.classList.add("backdrop-canvas"); canvas.setAttribute("aria-hidden", "true");
        if (fixed) canvas.classList.add("is-fixed");
        p.pixelDensity(1); p.noSmooth(); p.frameRate(15);
        size();
        if (!animated()) p.noLoop();
      };
      p.draw = () => {
        if (!layer) return;
        const react = read(), T = THEMES[choice.theme], concept = CONCEPTS[choice.concept];
        if (animated() && react.state !== "PAUSED" && react.state !== "GAME_OVER") t += Math.min(0.1, p.deltaTime / 1000);
        if (lastLevel !== null && react.level > lastLevel) flourish = t;
        lastLevel = react.level;
        const ctx = p.drawingContext;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1;
        ctx.drawImage(layer, 0, 0);
        concept.animate(ctx, scene, W, H, T, t, react, free);
        if (S) { concept.bezel(ctx, S, T, t, react, R); box(ctx, S.x0, S.y0, S.x1 - S.x0, S.y1 - S.y0, "#000"); }
        const age = t - flourish;
        if (age >= 0 && age < 1.5) {
          p.randomSeed(Math.floor(flourish * 1000));
          for (let i = 0; i < 70; i++) {
            const sx = Math.floor(p.random(W)), sy = Math.floor(p.random(H)), when = p.random(1.1);
            if (age > when && age < when + 0.4 && free(sx, sy, sx + 14, sy + 14)) glyph(ctx, age - when < 0.2 ? TWINKLE : MOTIFS.star, sx, sy, i % 3 ? "#ffffff" : T.neon[0], 2);
          }
        }
        canvas.dataset.mood = react.state === "PAUSED" ? "paused" : react.state === "GAME_OVER" ? "over" : "";
      };
      if (fixed) p.windowResized = () => size();
    };
    instance = new window.p5(sketch, host);
    // Without a loop (reduced motion, review stills), redraw only when something visible changes.
    let signature = "";
    const watch = setInterval(() => {
      if (animated() || !layer) return;
      const r = read(), next = [r.state, r.frightened, r.warning, r.level].join();
      if (next !== signature) { signature = next; instance.redraw(); }
    }, 400);
    reduced.addEventListener("change", () => { if (animated()) instance.loop(); else instance.noLoop(); });

    return {
      set(concept, theme) {
        if (CONCEPTS[concept]) choice.concept = concept;
        if (THEMES[theme]) choice.theme = theme;
        if (layer) rebuild();
        return { ...choice };
      },
      get: () => ({ ...choice }),
      relayout() { if (layer) { place(); instance.redraw(); } },
      setMotion(on) { options.animate = on; if (animated()) instance.loop(); else { instance.noLoop(); instance.redraw(); } },
      remove() { clearInterval(watch); instance.remove(); },
    };
  }

  let page = null;
  function mountPage() {
    const host = document.querySelector(".arcade-frame");
    if (!host || !window.p5) return;
    const rectOf = s => { const el = document.querySelector(s); return el && el.offsetWidth ? el.getBoundingClientRect() : null; };
    const keepOut = () => [".screen-frame", "#pad", ".actions", ".bezel-controls", ".backdrop-picker:not([hidden])"].map(rectOf).filter(Boolean);
    page = create(host, { fixed: true, keepOut, screen: () => rectOf("#screen"), ...readChoice() });
  }
  const api = {
    CONCEPTS: Object.keys(CONCEPTS), THEMES: Object.keys(THEMES), create,
    names: { concepts: Object.fromEntries(Object.entries(CONCEPTS).map(([k, v]) => [k, v.name])), themes: Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.name])) },
    get active() { return Boolean(page); },
    get: () => page ? page.get() : readChoice(),
    // The in-game maze walls follow the character theme; Astra keeps the classic arcade blue.
    mazeColor: () => THEMES[page ? page.get().theme : readChoice().theme]?.maze,
    set(concept, theme) {
      const next = page ? page.set(concept, theme) : { concept, theme };
      try { localStorage.setItem(STORE, JSON.stringify(next)); } catch (_) { /* Optional. */ }
      window.dispatchEvent(new CustomEvent("backdropchange", { detail: next }));
      return next;
    },
    relayout: () => page?.relayout(),
  };
  window.ArcadeBackdrops = Object.freeze(api);
  if (document.querySelector(".arcade-frame")) mountPage();
})();
