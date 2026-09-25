/* Presentation-only "juice": glow, particles, cornering sparks, trails, shake,
 * dark mazes, glitch and CRT. It reads engine state and events and never
 * changes them, so the simulation stays deterministic. Purist mode keeps the
 * plain arcade look; dark mazes stay dark in every mode because they are part
 * of the maze's rules. */
(function (root) {
  "use strict";
  const MODES = Object.freeze(["juicy", "crt", "purist"]);
  const LABELS = Object.freeze({ juicy: "JUICY", crt: "JUICY + CRT", purist: "PURIST" });
  const PLAYER_COLORS = Object.freeze({ astra: "#ffe52c", nova: "#ff7ab4", vega: "#4fe3ff", lyra: "#6fe06a" });
  const GHOST_COLORS = Object.freeze({ blinky: "#ff8a4d", pinky: "#ffe0c0", inky: "#b8c0e0", clyde: "#45d8f0" });
  const FRIGHT_COLOR = "#4a74ff";
  const STREAKS = Object.freeze([16, 32, 64, 128, 256]);
  const MAX_PARTICLES = 500;
  const PALE_COLOR = "#e6e2ff";
  const REVEAL_TIME = 1.1, REVEAL_FADE = 0.35, DISSOLVE_TIME = 0.45;
  // An 8 x 8 ordered-dither matrix: the maze denoises in, and eaten ghosts
  // dissolve, one threshold stage at a time.
  const BAYER8 = Object.freeze([
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ]);
  // Which of the 64 cells are lit at a stage: stage 0 none, the last stage all.
  function ditherCells(stage, stages = 8) {
    const cells = new Uint8Array(64);
    for (let i = 0; i < 64; i++) cells[i] = BAYER8[i] < stage * 64 / stages ? 1 : 0;
    return cells;
  }

  function hexToRgb(hex) {
    const value = parseInt(String(hex || "#ffffff").replace("#", ""), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  // Rotates a colour's hue; each level of a maze gets its own wall colour.
  function rotateHue(hex, degrees) {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    }
    h = ((h * 60 + degrees) % 360 + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + [r1, g1, b1].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
  }

  function createEffects({ Art, Engine, doc = root.document }) {
    const { TILE, WIDTH: W, MAP_Y, MAP_HEIGHT } = Art;
    const DIRS = Engine.DIRECTIONS;
    let mode = "juicy", reducedMotion = false;
    let particles = [], rings = [], texts = [], toast = null;
    let shake = 0, shakeTime = 0, glitch = 0, clock = 0, seed = 0x2f6e2b1;
    const trails = new WeakMap(), streaks = new Map();
    const juicy = () => mode !== "purist";
    const motion = () => juicy() && !reducedMotion;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const canvas = (w, h) => { const c = doc.createElement("canvas"); c.width = w; c.height = h; return c; };
    const toPixels = (x, y) => Art.worldPoint(x, y);
    const mix = Art.mixHex;
    // Wall colours while ghosts are frightened: the lights drop to a dim fright
    // indigo (even blue mazes change), with a first-frame ramp and a pale
    // warning flash.
    const frightShades = color => {
      const fright = mix(mix(color, FRIGHT_COLOR, 0.7), "#000000", 0.45);
      return { ramp: mix(color, fright, 0.5), fright, pale: mix(color, PALE_COLOR, 0.6) };
    };
    let dissolve = null, lastReveal = null;
    const revealFrom = new WeakMap();

    // Cached soft light sprites, tinted per colour.
    const lights = new Map();
    function light(color, radius) {
      const key = color + ":" + radius;
      if (lights.has(key)) return lights.get(key);
      const size = radius * 2, c = canvas(size, size), g = c.getContext("2d");
      const [r, gr, b] = hexToRgb(color), gradient = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
      gradient.addColorStop(0, `rgba(${r},${gr},${b},1)`);
      gradient.addColorStop(0.35, `rgba(${r},${gr},${b},0.45)`);
      gradient.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = gradient; g.fillRect(0, 0, size, size);
      lights.set(key, c);
      return c;
    }
    function drawLight(ctx, color, radius, x, y, alpha) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(light(color, radius), x - radius, y - radius);
    }

    // Neon walls: the maze layer blurred by scaling down and back up. Neon
    // layers are drawn at backing resolution; their glow is still built at
    // logical size, so it keeps the same radius and costs no more to draw.
    const glows = new WeakMap();
    function mazeGlow(layer) {
      if (glows.has(layer)) return glows.get(layer);
      const width = W, height = Math.round(layer.height * W / layer.width);
      const out = canvas(width, height), o = out.getContext("2d");
      for (const [factor, alpha] of [[2, 0.55], [4, 0.6]]) {
        const small = canvas(Math.ceil(width / factor), Math.ceil(height / factor)), s = small.getContext("2d");
        s.imageSmoothingEnabled = true; s.drawImage(layer, 0, 0, small.width, small.height);
        o.imageSmoothingEnabled = true; o.globalAlpha = alpha; o.drawImage(small, 0, 0, width, height);
      }
      glows.set(layer, out);
      return out;
    }
    // Cached repeating dither tiles; `cell` is the size of one matrix cell in pixels.
    const patterns = new Map();
    function ditherPattern(stage, cell) {
      const key = stage + ":" + cell;
      if (patterns.has(key)) return patterns.get(key);
      const tile = canvas(8 * cell, 8 * cell), t = tile.getContext("2d"), cells = ditherCells(stage);
      t.fillStyle = "#fff";
      for (let i = 0; i < 64; i++) if (cells[i]) t.fillRect((i % 8) * cell, Math.floor(i / 8) * cell, cell, cell);
      const pattern = t.createPattern(tile, "repeat");
      patterns.set(key, pattern);
      return pattern;
    }

    function burst(x, y, colors, count, speed, life, options = {}) {
      if (!juicy()) return;
      const amount = reducedMotion ? Math.ceil(count / 3) : count;
      for (let i = 0; i < amount && particles.length < MAX_PARTICLES; i++) {
        const angle = options.angle !== undefined ? options.angle + (random() - 0.5) * (options.spread || Math.PI * 2) : random() * Math.PI * 2;
        const v = speed * (0.35 + random() * 0.65);
        particles.push({
          x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, age: 0, life: life * (0.6 + random() * 0.4),
          color: colors[i % colors.length], size: options.size || (random() < 0.3 ? 2 : 1), drag: options.drag ?? 3.5, gravity: options.gravity || 0,
        });
      }
    }
    function ring(x, y, color, radius, life) { if (juicy()) rings.push({ x, y, color, radius, life, age: 0 }); }
    function float(text, x, y, color, life = 1.1) { if (juicy()) texts.push({ text, x, y, color, life, age: 0 }); }
    function kick(amount) { if (motion()) { shake = Math.max(shake, amount); shakeTime = 0.28; } }
    const playerColor = pac => PLAYER_COLORS[pac?.skin] || PLAYER_COLORS.astra;

    function onEvent(event, game) {
      const data = event.data || {};
      const pac = game.players?.[data.player ?? 0];
      switch (event.name) {
        case "start": case "readyEnd": if (event.name === "start") reset(); break;
        case "pellet": {
          const [x, y] = Art.tilePoint(data.x, data.y);
          if (motion()) burst(x, y, ["#ffcf9a", "#fff4d0"], 2, 22, 0.18, { size: 1 });
          if (!pac) break;
          // Keyed by seat: players are rebuilt every round, seats are not.
          const streak = streaks.get(pac.index) || { count: 0, idle: 0 };
          streak.count += 1; streak.idle = 0; streaks.set(pac.index, streak);
          if (STREAKS.includes(streak.count)) {
            const [px, py] = toPixels(pac.x, pac.y);
            float(streak.count + " STREAK", px, py - 12, playerColor(pac));
          }
          break;
        }
        case "powerPellet": {
          const [x, y] = Art.tilePoint(data.x, data.y);
          ring(x, y, "#ffd27a", 46, 0.5); ring(x, y, FRIGHT_COLOR, 30, 0.4);
          burst(x, y, ["#ffd27a", "#fff4d0", FRIGHT_COLOR], 14, 70, 0.45);
          kick(1);
          break;
        }
        case "ghostZapped": case "ghostEaten": {
          const ghost = game.ghosts.find(g => g.id === data.ghost);
          if (!ghost) break;
          const [x, y] = toPixels(ghost.x, ghost.y);
          burst(x, y, [GHOST_COLORS[ghost.id], "#ffffff", FRIGHT_COLOR], 22, 90, 0.6);
          ring(x, y, GHOST_COLORS[ghost.id], 22, 0.35);
          kick(1.5);
          // The eaten ghost dematerialises beneath its score, shedding pixels upward.
          if (event.name === "ghostEaten" && motion()) {
            // The engine has already turned the eaten ghost around.
            dissolve = { ghost, id: ghost.id, x: ghost.x, y: ghost.y, direction: ghost.dir >= 0 ? (ghost.dir + 2) % 4 : 1, total: game.freezeTimer || Engine.GHOST_EAT_PAUSE };
            burst(x, y, [FRIGHT_COLOR, "#ffffff"], 6, 12, 0.6, { gravity: -25, size: 1, angle: -Math.PI / 2, spread: 2 });
          }
          break;
        }
        case "fruitEaten": {
          const [x, y] = toPixels(...game.map.fruit);
          const bonus = Engine.BONUS.find(b => b.name === event.data);
          burst(x, y, [bonus?.color || "#ffb8ff", "#ffffff"], 16, 70, 0.55);
          ring(x, y, bonus?.color || "#ffb8ff", 20, 0.35);
          break;
        }
        case "death": {
          if (!pac) break;
          const [x, y] = toPixels(pac.x, pac.y);
          burst(x, y, [playerColor(pac), "#ffffff", "#ff6474"], 26, 80, 0.8, { gravity: 40 });
          kick(2.5);
          if (motion()) glitch = 0.4;
          streaks.delete(pac.index);
          break;
        }
        case "playerRespawn": case "extraLife": {
          const who = pac || game.players?.[0];
          if (!who) break;
          const [x, y] = toPixels(who.x, who.y);
          ring(x, y, playerColor(who), 26, 0.5);
          if (event.name === "extraLife") float("1UP!", x, y - 14, "#3ef06a", 1.4);
          break;
        }
        case "explosion": {
          const [x, y] = toPixels(data.x, data.y);
          ring(x, y, "#ff8a3d", 40, 0.5); ring(x, y, "#ffd24a", 26, 0.35);
          burst(x, y, ["#ff8a3d", "#ffd24a", "#ffffff", "#ff5a2e"], 34, 120, 0.7);
          kick(2.2);
          break;
        }
        case "powerUp": {
          const powerUp = Engine.POWERUPS.get(data.id);
          if (!pac || !powerUp) break;
          const [x, y] = toPixels(pac.x, pac.y);
          burst(x, y, [powerUp.color, "#ffffff"], 18, 80, 0.5);
          ring(x, y, powerUp.color, 24, 0.4);
          float(powerUp.name, x, y - 14, powerUp.color, 1.3);
          break;
        }
        case "halfRefresh": {
          const halves = data.halves || [];
          for (const half of halves) {
            for (let i = 0; i < 24; i++) burst((half ? W / 2 : 0) + random() * W / 2, MAP_Y + random() * MAP_HEIGHT, ["#2ad4ff", "#ffffff", "#ffb8ff"], 1, 40, 0.6);
            float("NEW DATASET", half ? W * 0.75 : W * 0.25, MAP_Y + MAP_HEIGHT / 2, "#8fe9ff", 1.4);
          }
          kick(1);
          break;
        }
        case "speedUp": float("SPEED UP", W / 2, MAP_Y + 10, "#8fe9ff", 1.2); break;
        case "zone": float(data.name, W / 2, MAP_Y + 18, data.color || "#8fe9ff", 1.8); break;
        case "skill": {
          if (!pac) break;
          const [x, y] = toPixels(pac.x, pac.y);
          if (data.skill === "star-dash") { ring(x, y, playerColor(pac), 16, 0.3); burst(x, y, [playerColor(pac), "#ffffff"], 10, 90, 0.35); }
          if (data.skill === "pulse-shield") { ring(x, y, PLAYER_COLORS.vega, 14, 0.5); ring(x, y, "#ffffff", 10, 0.3); }
          break;
        }
        case "scroll": {
          // The camera moved up: keep particles where they were in the maze.
          const dy = (data.rows || 0) * TILE;
          for (const p of particles) p.y += dy;
          for (const r of rings) r.y += dy;
          for (const t of texts) t.y += dy;
          break;
        }
        case "chain": {
          if (!pac) break;
          const [x, y] = toPixels(pac.x, pac.y);
          float(data.chain === 256 ? "256!" : data.chain + " CHAIN", x, y - 14, data.chain === 256 ? "#ff4fd8" : "#ffb8ff", 1.3);
          if (data.chain === 256) { ring(x, y, "#ff4fd8", 60, 0.7); kick(2.5); if (motion()) glitch = 0.5; }
          break;
        }
        case "caught": case "swap": case "eliminated": {
          if (!pac) break;
          const [x, y] = toPixels(pac.x, pac.y);
          const color = event.name === "swap" ? playerColor(pac) : "#c4cced";
          burst(x, y, [color, "#ffffff"], event.name === "eliminated" ? 30 : 16, 80, 0.55);
          ring(x, y, color, 20, 0.4);
          float(event.name === "swap" ? "BACK!" : event.name === "eliminated" ? "OUT" : "CAUGHT", x, y - 14, color);
          if (event.name !== "swap") kick(1.2);
          break;
        }
        case "bugged": case "injected": case "injectionPassed": {
          const who = game.players[event.name === "injectionPassed" ? data.to : data.player];
          if (!who) break;
          const [x, y] = toPixels(who.x, who.y);
          ring(x, y, event.name === "bugged" ? "#65e2ef" : "#ff8a3d", 16, 0.4);
          if (event.name === "bugged") float("BUG: " + String(data.debuff).toUpperCase(), x, y - 14, "#65e2ef");
          if (event.name === "injected") float("INJECTED", x, y - 14, "#ff8a3d");
          break;
        }
        case "arenaWinner": if (data && data.name) float(data.name + " WINS", W / 2, MAP_Y + 40, "#ffe52c", 3); break;
        case "vineSnare": {
          const [x, y] = toPixels(data.x, data.y);
          ring(x, y, PLAYER_COLORS.lyra, 40, 0.6);
          burst(x, y, [PLAYER_COLORS.lyra, "#2f8f45", "#b8ff9a"], 22, 70, 0.6);
          break;
        }
        case "supernova": {
          const [x, y] = toPixels(data.x, data.y);
          ring(x, y, PLAYER_COLORS.nova, 38, 0.55); ring(x, y, "#ffffff", 22, 0.35);
          burst(x, y, [PLAYER_COLORS.nova, "#ffffff", "#ffe52c"], 26, 100, 0.55);
          kick(1.2);
          break;
        }
        case "constellation": {
          for (const player of game.players || []) {
            if (!player.alive) continue;
            const [x, y] = toPixels(player.x, player.y);
            ring(x, y, playerColor(player), 30, 0.5);
          }
          float("CONSTELLATION", W / 2, MAP_Y + 10, "#ffd27a", 1.4);
          break;
        }
        case "ghostWakes": {
          const ghost = game.ghosts.find(g => g.id === data.ghost);
          if (!ghost) break;
          const [x, y] = toPixels(ghost.x, ghost.y);
          ring(x, y, "#ff6474", 16, 0.35);
          break;
        }
        case "levelClear": {
          for (const player of game.players || []) {
            if (!player.alive) continue;
            const [x, y] = toPixels(player.x, player.y);
            burst(x, y, [playerColor(player), "#ffffff", "#3ef06a", "#3fc6ff"], 30, 110, 0.9, { gravity: 30 });
          }
          break;
        }
      }
    }

    function update(dt, game) {
      clock += dt;
      if (shakeTime > 0) { shakeTime = Math.max(0, shakeTime - dt); if (!shakeTime) shake = 0; }
      if (glitch > 0) glitch = Math.max(0, glitch - dt);
      for (const p of particles) {
        p.age += dt;
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp; p.vy = p.vy * damp + p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      particles = particles.filter(p => p.age < p.life);
      for (const r of rings) r.age += dt;
      rings = rings.filter(r => r.age < r.life);
      for (const t of texts) t.age += dt;
      texts = texts.filter(t => t.age < t.life);
      for (const streak of streaks.values()) { streak.idle += dt; if (streak.idle > 0.4) streak.count = 0; }
      if (!game || !["PLAYING", "LEVEL_CLEAR"].includes(game.state)) return;
      for (const pac of game.players || []) {
        const dashing = pac.status && pac.status.some(status => status.id === "dash");
        remember(pac, pac.alive && pac.moving && (game.frightTimer > 0 || dashing));
        // Championship Edition sparks: cutting a corner grazes the wall.
        if (motion() && pac.alive && pac.moving && pac.cornerAxis && DIRS[pac.dir]) {
          const d = DIRS[pac.dir], axis = pac.cornerAxis, other = axis === "x" ? "y" : "x";
          const toward = Math.sign(pac.cornerTarget - pac[axis]) || 1;
          const corner = { [axis]: pac.cornerTarget - toward * 0.5, [other]: pac[other] + (other === "x" ? d.x : d.y) * 0.45 };
          const [x, y] = toPixels(corner.x, corner.y);
          burst(x, y, ["#fff6c8", "#ffd24a", playerColor(pac)], 2, 70, 0.22, { angle: Math.atan2(-d.y, -d.x), spread: 1.6, size: 1, drag: 5 });
        }
      }
      for (const ghost of game.ghosts || []) remember(ghost, ghost.state === "EATEN");
    }
    // Afterimages: recent positions while powered up, and for returning eyes.
    function remember(actor, active) {
      let trail = trails.get(actor);
      if (!trail) trails.set(actor, trail = []);
      if (!active || !motion()) { trail.length = 0; return; }
      const last = trail[trail.length - 1];
      if (last && (Math.abs(last.x - actor.x) > 2 || Math.abs(last.y - actor.y) > 2)) trail.length = 0;
      trail.push({ x: actor.x, y: actor.y });
      if (trail.length > 13) trail.shift();
    }

    function shakeOffset() {
      if (!shake || !motion()) return [0, 0];
      const strength = shake * (shakeTime / 0.28);
      const snap = v => Math.round(v * 2) / 2;
      return [snap(Math.sin(clock * 91.7) * strength), snap(Math.cos(clock * 77.3) * strength)];
    }
    function wallColor(base, game) {
      const color = base || "#284bff";
      if (!juicy() || !game || game.level <= 1) return color;
      return rotateHue(color, ((game.level - 1) * 47) % 360);
    }
    // Walls answer the ghosts' fright: blue while frightened, flashing pale in
    // step with the ghosts' own warning blink (ghostSprite in game.js).
    function frightTint(color, game, time) {
      if (!juicy() || !game || !(game.frightTimer > 0)) return color;
      if (game.state !== "PLAYING" && !(game.state === "PAUSED" && game.pausedFrom === "PLAYING")) return color;
      const shades = frightShades(color);
      if ((game.frightDuration || 0) - game.frightTimer < 0.1) return shades.ramp;
      if (!reducedMotion && game.frightTimer < 2 && Math.floor(time * 4) % 2 === 0) return shades.pale;
      return shades.fright;
    }
    // Builds a maze's layers and glows ahead of time, so the first fright is free.
    function warmMaze(map, color) {
      if (!juicy()) return;
      const neon = { style: "neon" }, shades = frightShades(color);
      const colors = map.wallRows ? [color] : [color, shades.ramp, shades.fright, shades.pale];
      for (const each of colors) mazeGlow(Art.mazeLayer(false, each, map, neon));
      mazeGlow(Art.mazeLayer(true, color, map, neon));
    }
    function drawMazeGlow(ctx, layer, y) {
      if (!juicy()) return;
      const glow = mazeGlow(layer);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = layer.width > W ? 0.7 : 0.85; ctx.drawImage(glow, 0, y, W, glow.height);
      ctx.restore();
    }
    // A new maze denoises out of coloured latent noise during its READY, like
    // the boot screen. Keyed on the pellet array, which every new round replaces.
    function revealProgress(game) {
      if (!juicy() || !game || !game.isNewRound || !game.pellets) return null;
      if (game.state !== "READY" && !(game.state === "PAUSED" && game.pausedFrom === "READY")) return null;
      if (!revealFrom.has(game.pellets)) revealFrom.set(game.pellets, game.readyTimer);
      const p = (revealFrom.get(game.pellets) - game.readyTimer) / (reducedMotion ? REVEAL_FADE : REVEAL_TIME);
      return p >= 1 ? null : Math.max(0, p);
    }
    // A black cover with dither holes; the cells still hidden carry speckle.
    const covers = new Map();
    let coverColor = null;
    function cover(stage, color) {
      if (coverColor !== color) { covers.clear(); coverColor = color; }
      if (covers.has(stage)) return covers.get(stage);
      const c = canvas(W, MAP_HEIGHT), g = c.getContext("2d"), image = g.createImageData(W, MAP_HEIGHT), data = image.data;
      // A fixed pattern per stage, so a rebuilt cover looks the same.
      let s = (0x9e3779b9 ^ Math.imul(stage + 1, 0x85ebca6b)) >>> 0;
      const next = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const palette = [color, color, "#2ad4ff", "#ff4fd8", "#fff4d0"].map(hexToRgb), cells = ditherCells(stage);
      const density = 0.16;
      for (let y = 0, i = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < W; x++, i += 4) {
        if (cells[(y % 8) * 8 + (x % 8)]) continue;
        const speck = next() < density ? palette[Math.floor(next() * palette.length)] : null;
        if (speck) { data[i] = speck[0]; data[i + 1] = speck[1]; data[i + 2] = speck[2]; }
        data[i + 3] = 255;
      }
      g.putImageData(image, 0, 0);
      covers.set(stage, c);
      return c;
    }
    function drawReveal(ctx, game, color) {
      const p = revealProgress(game);
      lastReveal = null;
      if (p === null) return;
      if (reducedMotion) {
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = "#000"; ctx.fillRect(0, MAP_Y, W, MAP_HEIGHT); ctx.restore();
        lastReveal = 0;
        return;
      }
      lastReveal = Math.min(7, Math.floor(p * 8));
      ctx.drawImage(cover(lastReveal, color || "#284bff"), 0, MAP_Y);
    }
    // The eaten ghost's visible dither stage: 8 (whole) down to 0 (gone).
    function dissolveStage(game) {
      if (!dissolve || !motion() || !game || game.eatenGhost !== dissolve.ghost || !(game.freezeTimer > 0)) return null;
      const e = (dissolve.total - game.freezeTimer) / DISSOLVE_TIME;
      return e >= 1 ? null : 8 - Math.ceil(e * 8);
    }
    const dissolveFrames = new WeakMap();
    function drawDissolve(ctx, game, { blit }) {
      const stage = dissolveStage(game);
      if (!stage) return;
      const sprite = Art.sprite("ghost", { id: dissolve.id, direction: dissolve.direction, frame: 0, state: "FRIGHTENED" });
      let frames = dissolveFrames.get(sprite);
      if (!frames) dissolveFrames.set(sprite, frames = []);
      if (!frames[stage]) {
        const c = canvas(sprite.width, sprite.height), g = c.getContext("2d");
        g.drawImage(sprite, 0, 0);
        g.globalCompositeOperation = "destination-in";
        g.fillStyle = ditherPattern(stage, 2); g.fillRect(0, 0, c.width, c.height);
        frames[stage] = c;
      }
      ctx.save(); ctx.globalAlpha = 0.65;
      blit(frames[stage], ...toPixels(dissolve.x, dissolve.y));
      ctx.restore();
    }
    // Frightened ghosts shiver when their fear is about to run out: one backing
    // pixel, each ghost on its own beat. A draw offset only.
    function ghostShiver(ghost, index, game, time) {
      if (!motion() || !ghost || ghost.state !== "FRIGHTENED" || !game || !(game.frightTimer < 2) || game.freezeTimer > 0) return 0;
      return ((Math.floor(time * 20) + index) % 2) * 0.5;
    }
    // The arcade blinks 1UP during play, together with the power pellets. That
    // is arcade-faithful, so it applies in every visual mode.
    const hudLabelOn = (game, time) => reducedMotion || !game || game.state !== "PLAYING" || Math.floor(time * 3) % 2 === 0;
    // A shine sweeps the title logo every five seconds, clipped to its glyphs.
    let shineScratch = null, shineBand = null;
    function drawTitleShine(ctx, titleLayer, time) {
      if (!motion() || !titleLayer) return;
      const phase = (time % 5) / 0.7;
      if (phase >= 1) return;
      const w = titleLayer.width, h = titleLayer.height, bw = Math.round(w * 18 / W), skew = 0.5;
      if (!shineScratch || shineScratch.width !== w || shineScratch.height !== h) shineScratch = canvas(w, h);
      if (!shineBand || shineBand.height !== h) {
        shineBand = canvas(bw, h);
        const b = shineBand.getContext("2d"), gradient = b.createLinearGradient(0, 0, bw, 0);
        gradient.addColorStop(0, "rgba(255,255,255,0)"); gradient.addColorStop(0.5, "rgba(255,255,255,0.85)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
        b.fillStyle = gradient; b.fillRect(0, 0, bw, h);
      }
      const s = shineScratch.getContext("2d");
      s.globalCompositeOperation = "source-over"; s.clearRect(0, 0, w, h); s.drawImage(titleLayer, 0, 0);
      s.globalCompositeOperation = "source-atop";
      const x = -bw + phase * (w + 2 * bw + skew * h);
      s.save(); s.setTransform(1, 0, -skew, 1, x, 0); s.drawImage(shineBand, 0, 0); s.restore();
      s.globalCompositeOperation = "source-over";
      ctx.drawImage(shineScratch, 0, 13, W, 34);
    }
    // Dark mazes: black out everything but pools of light around the actors.
    let darkLayer = null;
    function drawDarkness(ctx, game) {
      if (!game.map?.dark || !["READY", "PLAYING", "DYING", "PAUSED"].includes(game.state)) return;
      if (game.state === "PAUSED" && game.pausedFrom === "INTERMISSION") return;
      darkLayer = darkLayer || canvas(W, MAP_HEIGHT);
      const d = darkLayer.getContext("2d");
      d.globalCompositeOperation = "source-over"; d.globalAlpha = 1;
      d.clearRect(0, 0, W, MAP_HEIGHT);
      // ENDLESS fades darkness in and out between zones.
      const amount = typeof game.map.darkness === "number" ? game.map.darkness : 1;
      d.fillStyle = `rgba(0,0,0,${(0.94 * amount).toFixed(3)})`; d.fillRect(0, 0, W, MAP_HEIGHT);
      d.globalCompositeOperation = "destination-out";
      const hole = (x, y, radius) => { const [px, py] = toPixels(x, y); d.drawImage(light("#ffffff", radius), px - radius, py - MAP_Y - radius); };
      const powered = game.frightTimer > 0;
      for (const pac of game.players || []) if (pac.alive || (pac.deathTimer !== null && pac.deathTimer < 1.45)) hole(pac.x, pac.y, powered ? 64 : 46);
      for (const ghost of game.ghosts || []) if (ghost.state !== "EATEN") hole(ghost.x, ghost.y, 16);
      if (game.fruit) hole(game.fruit.x, game.fruit.y, 16);
      const pellets = game.pellets;
      if (pellets) for (let i = 0; i < pellets.length; i++) if (pellets[i] === 2) hole(i % Engine.COLS + 0.5, Math.floor(i / Engine.COLS) + 0.5, 14);
      ctx.drawImage(darkLayer, 0, MAP_Y);
    }
    function drawTrails(ctx, game, { pacSprite, ghostSprite, blit }) {
      if (!motion()) return;
      ctx.save();
      const draw = (actor, sprite) => {
        const trail = trails.get(actor);
        if (!trail || trail.length < 4) return;
        [[4, 0.3], [7, 0.2], [10, 0.12], [13, 0.06]].forEach(([back, alpha]) => {
          const point = trail[trail.length - back];
          if (!point) return;
          ctx.globalAlpha = alpha;
          blit(sprite, ...toPixels(point.x, point.y));
        });
      };
      for (const pac of game.players || []) if (pac.alive) draw(pac, pacSprite(pac));
      (game.ghosts || []).forEach((ghost, i) => { if (ghost.state === "EATEN") draw(ghost, ghostSprite(ghost, i)); });
      ctx.restore();
    }
    function drawOverActors(ctx, game, { glyphText }) {
      if (!juicy()) return;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      // Characters light the maze in their own colours, as in Championship Edition.
      for (const pac of game.players || []) if (pac.alive) drawLight(ctx, playerColor(pac), 18, ...toPixels(pac.x, pac.y), 0.32);
      for (const ghost of game.ghosts || []) {
        if (ghost.state === "EATEN") continue;
        const color = ghost.state === "FRIGHTENED" ? FRIGHT_COLOR : GHOST_COLORS[ghost.id];
        drawLight(ctx, color, 15, ...toPixels(ghost.x, ghost.y), 0.24);
      }
      const pulse = 0.18 + 0.1 * Math.sin(clock * 8);
      const pellets = game.pellets;
      if (pellets && revealProgress(game) === null) for (let i = 0; i < pellets.length; i++) if (pellets[i] === 2) drawLight(ctx, "#ffb070", 11, ...Art.tilePoint(i % Engine.COLS, Math.floor(i / Engine.COLS)), pulse);
      if (game.fruit) drawLight(ctx, "#ffb8ff", 12, ...toPixels(game.fruit.x, game.fruit.y), 0.2);
      ctx.restore();
      ctx.save();
      for (const r of rings) {
        const t = r.age / r.life;
        ctx.globalAlpha = (1 - t) * 0.9; ctx.strokeStyle = r.color; ctx.lineWidth = 1.5 * (1 - t) + 0.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, 3 + r.radius * (1 - (1 - t) ** 3), 0, Math.PI * 2); ctx.stroke();
      }
      for (const p of particles) {
        ctx.globalAlpha = Math.min(1, 1.6 * (1 - p.age / p.life));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2, p.size, p.size);
      }
      ctx.restore();
      for (const t of texts) {
        const rise = reducedMotion ? 0 : Math.min(10, t.age * 16);
        if (t.age > t.life - 0.3 && Math.floor(t.age * 16) % 2) continue;
        glyphText(t.text, Math.max(20, Math.min(W - 20, t.x)), t.y - rise, t.color);
      }
    }
    // Score popups rise and pop in instead of sitting still.
    // A ghost's score doesn't count down during the ghost-eat pause, so its age
    // comes from the pause timer instead.
    function popupStyle(popup, game) {
      if (!juicy() || reducedMotion) return { dy: 0, scale: 1 };
      const ghostScore = popup.color === "#35e7eb";
      const age = ghostScore && game && game.freezeTimer > 0 ? Math.max(0, popup.timeLeft - game.freezeTimer)
        : Math.max(0, (ghostScore ? Engine.GHOST_EAT_PAUSE : 2) - popup.timeLeft);
      return { dy: -Math.min(6, age * 14), scale: age < 0.12 ? 2 : 1 };
    }
    // Whole-screen passes, in backing-store pixels.
    let scanlines = null, vignette = null;
    function drawScreen(ctx, target) {
      const w = target.width, h = target.height;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (glitch > 0 && motion()) {
        const strength = glitch / 0.4;
        for (let i = 0; i < 7; i++) {
          const y = Math.floor(random() * h), height = 4 + Math.floor(random() * 18), shift = Math.round((random() - 0.5) * 36 * strength);
          ctx.drawImage(target, 0, y, w, height, shift, y, w, height);
        }
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 * strength;
        for (const color of ["#ff2e88", "#20e0ff"]) { ctx.fillStyle = color; ctx.fillRect(0, Math.floor(random() * h), w, 2 + Math.floor(random() * 3)); }
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }
      if (mode === "crt") {
        if (!scanlines || scanlines.width !== w || scanlines.height !== h) {
          scanlines = canvas(w, h);
          const s = scanlines.getContext("2d");
          s.fillStyle = "rgba(0,0,0,0.22)";
          for (let y = 1; y < h; y += 2) s.fillRect(0, y, w, 1);
          const gradient = s.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
          gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, "rgba(0,0,0,0.55)");
          s.fillStyle = gradient; s.fillRect(0, 0, w, h);
        }
        ctx.drawImage(scanlines, 0, 0);
      }
      ctx.restore();
    }
    // Real-time interface pieces that keep moving while the game is paused.
    function tickUI(dt) { if (toast) { toast.age += dt; if (toast.age > 1.6) toast = null; } }
    function reset() {
      particles = []; rings = []; texts = []; shake = 0; shakeTime = 0; glitch = 0; dissolve = null;
      streaks.clear();
    }
    function setMode(next, announce = false) {
      mode = MODES.includes(next) ? next : "juicy";
      if (!juicy()) reset();
      if (announce) toast = { text: "VISUALS " + LABELS[mode], age: 0 };
      return mode;
    }
    const cycleMode = () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length], true);

    return {
      MODES, LABELS, onEvent, update, shakeOffset, wallColor, drawMazeGlow, drawDarkness, drawTrails, drawOverActors,
      popupStyle, drawScreen, reset, setMode, cycleMode, tickUI, warmGlow: (layer) => { if (juicy()) mazeGlow(layer); },
      frightTint, warmMaze, revealProgress, drawReveal, dissolveStage, drawDissolve, ghostShiver, hudLabelOn, drawTitleShine,
      get mazeStyle() { return juicy() ? "neon" : undefined; },
      get mode() { return mode; }, get label() { return LABELS[mode]; }, get toast() { return toast; },
      set reducedMotion(value) { reducedMotion = Boolean(value); },
      snapshot: () => ({ mode, particles: particles.length, rings: rings.length, texts: texts.length, shake, glitch, reveal: lastReveal, dissolve: dissolve ? dissolve.id : null, mazeStyle: juicy() ? "neon" : null }),
    };
  }

  const api = Object.freeze({ createEffects, rotateHue, hexToRgb, ditherCells, MODES });
  root.AstraEffects = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
