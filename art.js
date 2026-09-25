/* Cached Astra-Man sprites and original maze contours. No runtime dependencies. */
(function (root) {
  "use strict";
  const E = root.PacmanEngine || require("./engine.js");
  const Characters = root.AstraCharacters || require("./character-art.js");
  const Items = root.AstraItems || require("./item-art.js");
  const TILE = 8, WIDTH = 224, HEIGHT = 288, MAP_Y = 24, MAP_HEIGHT = 248;
  const { CAST, PALETTES, RENDER_SCALE, SIZE: SPRITE_SIZE, LOGICAL_SIZE: SPRITE_LOGICAL_SIZE } = Characters;
  const FONT = Object.freeze({
    A:["01110","10001","10001","11111","10001","10001","10001"], B:["11110","10001","10001","11110","10001","10001","11110"], C:["01111","10000","10000","10000","10000","10000","01111"], D:["11110","10001","10001","10001","10001","10001","11110"], E:["11111","10000","10000","11110","10000","10000","11111"], F:["11111","10000","10000","11110","10000","10000","10000"], G:["01111","10000","10000","10111","10001","10001","01111"], H:["10001","10001","10001","11111","10001","10001","10001"], I:["11111","00100","00100","00100","00100","00100","11111"], J:["00111","00010","00010","00010","10010","10010","01100"], K:["10001","10010","10100","11000","10100","10010","10001"], L:["10000","10000","10000","10000","10000","10000","11111"], M:["10001","11011","10101","10101","10001","10001","10001"], N:["10001","11001","10101","10011","10001","10001","10001"], O:["01110","10001","10001","10001","10001","10001","01110"], P:["11110","10001","10001","11110","10000","10000","10000"], Q:["01110","10001","10001","10001","10101","10010","01101"], R:["11110","10001","10001","11110","10100","10010","10001"], S:["01111","10000","10000","01110","00001","00001","11110"], T:["11111","00100","00100","00100","00100","00100","00100"], U:["10001","10001","10001","10001","10001","10001","01110"], V:["10001","10001","10001","10001","10001","01010","00100"], W:["10001","10001","10001","10101","10101","10101","01010"], X:["10001","10001","01010","00100","01010","10001","10001"], Y:["10001","10001","01010","00100","00100","00100","00100"], Z:["11111","00001","00010","00100","01000","10000","11111"],
    0:["01110","10001","10011","10101","11001","10001","01110"], 1:["00100","01100","00100","00100","00100","00100","01110"], 2:["01110","10001","00001","00010","00100","01000","11111"], 3:["11110","00001","00001","01110","00001","00001","11110"], 4:["00010","00110","01010","10010","11111","00010","00010"], 5:["11111","10000","10000","11110","00001","00001","11110"], 6:["01110","10000","10000","11110","10001","10001","01110"], 7:["11111","00001","00010","00100","01000","01000","01000"], 8:["01110","10001","10001","01110","10001","10001","01110"], 9:["01110","10001","10001","01111","00001","00001","01110"],
    "!":["00100","00100","00100","00100","00100","00000","00100"], "&":["01100","10010","10100","01000","10101","10010","01101"], ".":["00000","00000","00000","00000","00000","00110","00110"], "-": ["00000","00000","00000","11111","00000","00000","00000"], "+":["00000","00100","00100","11111","00100","00100","00000"], ":":["00000","00100","00100","00000","00100","00100","00000"], "/":["00001","00010","00010","00100","01000","01000","10000"], ">":["00000","01000","00100","00010","00100","01000","00000"], "[":["01110","01000","01000","01000","01000","01000","01110"], "]":["01110","00010","00010","00010","00010","00010","01110"], "?":["01110","10001","00001","00010","00100","00000","00100"], ",":["00000","00000","00000","00000","00110","00100","01000"], "'":["00100","00100","01000","00000","00000","00000","00000"], "=":["00000","00000","11111","00000","11111","00000","00000"], "(":["00010","00100","01000","01000","01000","00100","00010"], ")":["01000","00100","00010","00010","00010","00100","01000"], "·":["00000","00000","00000","00100","00000","00000","00000"], "↑":["00100","01110","10101","00100","00100","00100","00100"], "↓":["00100","00100","00100","00100","10101","01110","00100"], "←":["00000","00100","01000","11111","01000","00100","00000"], "→":["00000","00100","00010","11111","00010","00100","00000"],  "<":["00000","00010","00100","01000","00100","00010","00000"], " ":["00000","00000","00000","00000","00000","00000","00000"]
  });
  const snap = value => Math.round(value * RENDER_SCALE) / RENDER_SCALE;
  function worldPoint(x, y) { return [snap(x * TILE), snap(MAP_Y + y * TILE)]; }
  function tilePoint(x, y) { return worldPoint(x + 0.5, y + 0.5); }

  function mazeMasks(map = E.CLASSIC) {
    // The engine already resolved unreachable pockets to wall.
    const open = new Uint8Array(E.COLS * E.ROWS);
    for (let y = 0; y < E.ROWS; y++) for (let x = 0; x < E.COLS; x++) {
      if (E.tileKind(x, y, map) !== "wall") open[y * E.COLS + x] = 1;
    }
    // The pen is drawn explicitly, including a real opening for its gate.
    if (map.house) {
      const { x: hx, y: hy } = map.house;
      for (let y = hy; y < hy + 5; y++) for (let x = hx; x < hx + 8; x++) open[y * E.COLS + x] = 1;
    }

    const outer = new Uint8Array(open.length), boundary = [];
    for (let y = 0; y < E.ROWS; y++) for (let x = 0; x < E.COLS; x++) {
      const index = y * E.COLS + x;
      if (!open[index] && (x === 0 || y === 0 || x === E.COLS - 1 || y === E.ROWS - 1)) {
        outer[index] = 1;
        boundary.push([x, y]);
      }
    }
    for (let i = 0; i < boundary.length; i++) {
      const [x, y] = boundary[i];
      for (const d of E.DIRECTIONS) {
        const nx = x + d.x, ny = y + d.y, index = ny * E.COLS + nx;
        if (nx < 0 || nx >= E.COLS || ny < 0 || ny >= E.ROWS || open[index] || outer[index]) continue;
        outer[index] = 1;
        boundary.push([nx, ny]);
      }
    }

    function expandedCorridors(padding, outerOnly) {
      const mask = new Uint8Array(WIDTH * MAP_HEIGHT), line = new Uint8Array(WIDTH);
      // Build each tile row's pixel line once, then copy it down the tile.
      for (let ty = 0; ty < E.ROWS; ty++) {
        for (let tx = 0; tx < E.COLS; tx++) line.fill(outerOnly ? outer[ty * E.COLS + tx] : 1 - open[ty * E.COLS + tx], tx * TILE, (tx + 1) * TILE);
        for (let y = ty * TILE; y < Math.min(MAP_HEIGHT, (ty + 1) * TILE); y++) mask.set(line, y * WIDTH);
      }
      for (let ty = 0; ty < E.ROWS; ty++) for (let tx = 0; tx < E.COLS; tx++) {
        if (!open[ty * E.COLS + tx]) continue;
        const left = Math.max(0, tx * TILE - padding), right = Math.min(WIDTH, (tx + 1) * TILE + padding);
        for (let y = Math.max(0, ty * TILE - padding); y < Math.min(MAP_HEIGHT, (ty + 1) * TILE + padding); y++) {
          mask.fill(0, y * WIDTH + left, y * WIDTH + right);
        }
      }
      return mask;
    }
    return { primary: expandedCorridors(3, false), outer: expandedCorridors(6, true) };
  }

  function traceContours(mask) {
    const edges = [], outgoing = new Map(), incoming = new Set();
    const key = (x, y) => y * (WIDTH + 1) + x;
    function add(x1, y1, x2, y2) {
      const edge = { a: [x1, y1], b: [x2, y2], used: false };
      edges.push(edge);
      const start = key(x1, y1);
      if (!outgoing.has(start)) outgoing.set(start, []);
      outgoing.get(start).push(edge);
      incoming.add(key(x2, y2));
    }
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      if (!mask[i]) continue;
      // Outside the canvas stays solid: tunnel contours end at its edge.
      if (y > 0 && !mask[i - WIDTH]) add(x, y, x + 1, y);
      if (x < WIDTH - 1 && !mask[i + 1]) add(x + 1, y, x + 1, y + 1);
      if (y < MAP_HEIGHT - 1 && !mask[i + WIDTH]) add(x + 1, y + 1, x, y + 1);
      if (x > 0 && !mask[i - 1]) add(x, y + 1, x, y);
    }
    const contours = [];
    const starts = edges.filter(e => !incoming.has(key(...e.a))).concat(edges);
    for (const first of starts) {
      if (first.used) continue;
      const vertices = [first.a];
      let edge = first;
      while (edge && !edge.used) {
        edge.used = true;
        vertices.push(edge.b);
        edge = outgoing.get(key(...edge.b))?.find(e => !e.used);
      }
      const closed = key(...vertices[0]) === key(...vertices[vertices.length - 1]);
      if (closed) vertices.pop();
      const simplified = vertices.filter((p, i) => {
        if (!closed && (i === 0 || i === vertices.length - 1)) return true;
        const a = vertices[(i + vertices.length - 1) % vertices.length], b = vertices[(i + 1) % vertices.length];
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      }).map(([x, y]) => [Math.max(0, Math.min(WIDTH, x - 0.5)), y - 0.5]);
      if (simplified.length > 1) contours.push({ points: simplified, closed });
    }
    return contours;
  }

  function roundedContour(ctx, { points, closed }) {
    const toward = (a, b, distance) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = Math.min(distance, length / 2) / length;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    ctx.beginPath();
    if (closed) ctx.moveTo(...toward(points[0], points[points.length - 1], 2));
    else ctx.moveTo(...points[0]);
    for (let i = closed ? 0 : 1; i < points.length; i++) {
      const p = points[i];
      if (!closed && i === points.length - 1) { ctx.lineTo(...p); break; }
      const before = toward(p, points[(i + points.length - 1) % points.length], 2);
      const after = toward(p, points[(i + 1) % points.length], 2);
      ctx.lineTo(...before);
      ctx.quadraticCurveTo(...p, ...after);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  function mixHex(a, b, t) {
    const parse = hex => { const v = parseInt(String(hex).replace("#", ""), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const to = parse(b);
    return "#" + parse(a).map((v, i) => Math.round(v + (to[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  // Double pen walls; the row below the house is left completely clear.
  function houseWalls(ctx, map) {
    const { x: hx, y: hy } = map.house, gateLeft = (hx + 2.5) * TILE, gateRight = (hx + 5.5) * TILE;
    for (const inset of [0, 2]) {
      const left = hx * TILE + 3.5 + inset, right = (hx + 7) * TILE + 4.5 - inset;
      const top = hy * TILE + 3.5 + inset, bottom = (hy + 4) * TILE + 4.5 - inset;
      ctx.beginPath();
      ctx.moveTo(gateLeft, top); ctx.lineTo(left + 2, top);
      ctx.quadraticCurveTo(left, top, left, top + 2);
      ctx.lineTo(left, bottom - 2); ctx.quadraticCurveTo(left, bottom, left + 2, bottom);
      ctx.lineTo(right - 2, bottom); ctx.quadraticCurveTo(right, bottom, right, bottom - 2);
      ctx.lineTo(right, top + 2); ctx.quadraticCurveTo(right, top, right - 2, top);
      ctx.lineTo(gateRight, top); ctx.stroke();
    }
  }
  function houseGate(ctx, map, core) {
    const { x: hx, y: hy } = map.house, gateLeft = (hx + 2.5) * TILE, gateRight = (hx + 5.5) * TILE;
    ctx.fillStyle = "#ffb8de";
    ctx.fillRect(gateLeft, hy * TILE + 3, gateRight - gateLeft, 2);
    if (core) { ctx.fillStyle = "#ffe6f3"; ctx.fillRect(gateLeft, hy * TILE + 3.5, gateRight - gateLeft, 0.5); }
  }
  // Maps with a colour per row (ENDLESS zones) draw their walls as a vertical gradient.
  function rowGradient(ctx, rows, shade = c => c) {
    const gradient = ctx.createLinearGradient(0, 0, 0, MAP_HEIGHT);
    rows.forEach((rowColor, y) => gradient.addColorStop(Math.min(1, (y + 0.5) * TILE / MAP_HEIGHT), shade(rowColor)));
    return gradient;
  }

  // Per maze: traced contours, then one layer per wall colour. The "neon" style
  // (JUICY visuals) draws at backing resolution as a dim tube, the wall line and
  // a white-hot core; only its six most recent colours are kept per maze.
  const mazeCache = new WeakMap(), NEON_KEEP = 6;
  function mazeLayer(flash = false, color = "#284bff", map = E.CLASSIC, options = {}) {
    if (!mazeCache.has(map)) {
      const masks = mazeMasks(map);
      mazeCache.set(map, { geometry: [...traceContours(masks.primary), ...traceContours(masks.outer)], layers: new Map() });
    }
    const { geometry, layers } = mazeCache.get(map);
    const rows = !flash && map.wallRows, neon = options?.style === "neon";
    const key = (neon ? "neon:" : "") + (flash ? "flash" : rows ? "rows" : color);
    if (layers.has(key)) {
      const cached = layers.get(key);
      if (neon) { layers.delete(key); layers.set(key, cached); }
      return cached;
    }
    if (neon) return neonLayer(flash, color, map, geometry, layers, key);
    const layer = document.createElement("canvas");
    layer.width = WIDTH; layer.height = MAP_HEIGHT;
    const ctx = layer.getContext("2d");
    ctx.strokeStyle = rows ? rowGradient(ctx, rows) : flash ? "#fff4d7" : color;
    ctx.lineWidth = 1;
    geometry.forEach(path => roundedContour(ctx, path));
    if (!map.house) { layers.set(key, layer); return layer; }
    houseWalls(ctx, map);
    houseGate(ctx, map, false);
    layers.set(key, layer);
    return layer;
  }
  function neonLayer(flash, color, map, geometry, layers, key) {
    const layer = document.createElement("canvas");
    layer.width = WIDTH * RENDER_SCALE; layer.height = MAP_HEIGHT * RENDER_SCALE;
    const ctx = layer.getContext("2d");
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    const rows = !flash && map.wallRows, base = flash ? "#fff4d7" : color;
    const paint = shade => rows ? rowGradient(ctx, rows, shade) : shade(base);
    // The core is white-hot on a bright wall and dims with a darker one.
    const core = c => { const v = parseInt(c.replace("#", ""), 16); return mixHex(c, "#ffffff", 0.7 * Math.max(v >> 16, (v >> 8) & 255, v & 255) / 255); };
    // The core is one backing pixel wide; the nudge centres it on that pixel.
    for (const [width, alpha, style, nudge] of [[2.5, 0.35, paint(c => c), 0], [1, 1, paint(c => c), 0], [0.5, 1, flash ? "#ffffff" : paint(core), 0.25]]) {
      ctx.save();
      ctx.translate(nudge, nudge);
      ctx.globalAlpha = alpha; ctx.strokeStyle = style; ctx.lineWidth = width;
      geometry.forEach(path => roundedContour(ctx, path));
      if (map.house) houseWalls(ctx, map);
      ctx.restore();
    }
    if (map.house) houseGate(ctx, map, true);
    layers.set(key, layer);
    const neonKeys = [...layers.keys()].filter(k => k.startsWith("neon:"));
    for (let i = 0; i < neonKeys.length - NEON_KEEP; i++) layers.delete(neonKeys[i]);
    return layer;
  }

  const spriteCache = new Map();
  const ITEM_KINDS = new Set(["chip", "gpu", "bonus"]);
  function sprite(kind, { id = "blinky", direction = 3, frame = 0, state = "CHASE", blink = false, name = "", skin = "astra", accessory = "default", color = "", icon = "" } = {}) {
    const key = [kind, id, direction, frame, state, blink, name, skin, accessory, color, icon].join(":");
    if (spriteCache.has(key)) return spriteCache.get(key);
    // Power-up chips are wider than the square sprites; the rest are SPRITE_SIZE squares.
    const [width, height] = kind === "powerup" ? Items.POWERUP_SIZE : [SPRITE_SIZE, SPRITE_SIZE];
    const pixels = kind === "powerup" ? Items.powerUpRaster({ name, color, icon })
      : ITEM_KINDS.has(kind) ? Items.raster(kind, { name }) : Characters.raster(kind, { id, direction, frame, state, blink, skin, accessory });
    const image = document.createElement("canvas");
    image.width = width; image.height = height;
    const ctx = image.getContext("2d");
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const color = pixels[y * width + x];
      if (color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
    }
    spriteCache.set(key, image);
    return image;
  }

  // A power-up chip centred on (x, y) with a glow in its colour, at half its raster size.
  function drawPowerUp(ctx, powerUp, x, y, scale = 1) {
    const image = sprite("powerup", { name: powerUp.name, color: powerUp.color, icon: powerUp.icon });
    const w = image.width / 2 * scale, h = image.height / 2 * scale;
    ctx.save(); ctx.shadowColor = powerUp.color; ctx.shadowBlur = 5 * scale;
    ctx.drawImage(image, snap(x - w / 2), snap(y - h / 2), w, h);
    ctx.restore();
  }

  const api = { FONT, TILE, WIDTH, HEIGHT, MAP_Y, MAP_HEIGHT, CAST, PALETTES, RENDER_SCALE, SPRITE_SIZE, SPRITE_LOGICAL_SIZE, snap, worldPoint, tilePoint, mazeLayer, mixHex, sprite, drawPowerUp, mazeMasks, traceContours };
  root.PacmanArt = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
