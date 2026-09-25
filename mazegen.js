/* Endless maze generator, after the piece-based generator in Shaun Williams'
 * Pac-Man remake (github.com/masonicGIT/pacman, src/mapgen.js).
 *
 * The left half of the maze is a grid of cells. Cells are joined into pieces
 * of up to a few cells; each piece becomes a block of wall and every boundary
 * between two pieces becomes a one-tile corridor. The half is then mirrored.
 * Unlike the arcade generator the grid never ends: it grows upward one band of
 * cells at a time, and pieces can reach across bands, so chunks have no seams.
 *
 * Deterministic: all randomness comes from the `random` function passed in. */
(function (root) {
  "use strict";
  const COLS = 28, HALF = COLS / 2;
  // Corridor lines in the left half. The last cell (tiles 13-14) spans the mirror line,
  // so there is never a two-wide corridor down the middle.
  const LINES = Object.freeze([1, 5, 9, 12]);
  const CELLS = LINES.length, CENTRE = CELLS - 1;
  // Pseudo-pieces: the side wall, and the solid floor and ceiling that close a maze.
  const BORDER = -1, FLOOR = -2, CEILING = -3;
  const MAX_BORDER_RUN = 2;

  // One biome per bundled maze (same ids as maps.js and CLASSIC in engine.js), tuned
  // to grow corridors in that maze's style. rowGap is the distance between corridor
  // rows; the p* values are how often a cell joins the piece below, beside it or the
  // side wall; sparse is how often a corridor row is left without dots.
  const BIOMES = Object.freeze([
    // The arcade original: mixed blocks, L and T shapes.
    Object.freeze({ id: "classic", rowGap: 3, maxPiece: 5, pDown: 0.45, pSide: 0.45, pBorder: 0.3, tunnel: 0.25, power: 0.3, sparse: 0 }),
    // NEURAL NET: a dense lattice of junctions, small blocks everywhere.
    Object.freeze({ id: "neural", rowGap: 3, maxPiece: 2, pDown: 0.25, pSide: 0.3, pBorder: 0.1, tunnel: 0.15, power: 0.35, sparse: 0 }),
    // SERVER ROOM: tall racks with long aisles between them, and plenty of tunnels.
    Object.freeze({ id: "server", rowGap: 3, maxPiece: 3, pDown: 0.85, pSide: 0.05, pBorder: 0.2, tunnel: 0.55, power: 0.3, sparse: 0 }),
    // ASTRA: wide bars and open, dotless corridors, after the Doodle logo maze.
    Object.freeze({ id: "astra", rowGap: 4, maxPiece: 4, pDown: 0.15, pSide: 0.7, pBorder: 0.35, tunnel: 0.3, power: 0.3, sparse: 0.35 }),
  ]);
  const biomeById = (id) => BIOMES.find((biome) => biome.id === id) || BIOMES[0];
  // A biome part way from `a` to `b` (t from 0 to 1), so one style can fade into the next.
  // Whole-number settings flip over at random, in proportion to t.
  function blendBiomes(a, b, t, random) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const mix = (key) => a[key] + (b[key] - a[key]) * t;
    const flip = (key) => random() < t ? b[key] : a[key];
    return {
      id: t < 0.5 ? a.id : b.id, rowGap: flip("rowGap"), maxPiece: flip("maxPiece"),
      pDown: mix("pDown"), pSide: mix("pSide"), pBorder: mix("pBorder"), tunnel: mix("tunnel"), power: mix("power"), sparse: mix("sparse"),
    };
  }

  // Corridor openness between cells. A band is one piece id per cell.
  const vertical = (band, i) => i === 0 ? band[0] !== BORDER : band[i - 1] !== band[i];
  // A block joined to the side wall also joins the floor or ceiling it touches.
  const solid = (id) => id === BORDER || id === FLOOR || id === CEILING;
  const horizontal = (low, high, col) => low[col] !== high[col] && !(solid(low[col]) && solid(high[col]));
  function nodeDegrees(low, high) {
    return LINES.map((_, i) => {
      const down = low[0] !== FLOOR && vertical(low, i);
      const up = high[0] !== CEILING && vertical(high, i);
      const left = i > 0 && horizontal(low, high, i - 1);
      return down + up + left + horizontal(low, high, i);
    });
  }
  const mirror = (half) => half.join("") + half.slice().reverse().join("");
  function lineRow(low, high) {
    const row = Array(HALF).fill("#");
    nodeDegrees(low, high).forEach((degree, i) => { if (degree) row[LINES[i]] = "."; });
    for (let col = 0; col < CELLS; col++) {
      if (!horizontal(low, high, col)) continue;
      const end = col < CENTRE ? LINES[col + 1] : HALF;
      for (let x = LINES[col] + 1; x < end; x++) row[x] = ".";
    }
    return mirror(row);
  }
  function interiorRow(band) {
    const row = Array(HALF).fill("#");
    LINES.forEach((x, i) => { if (vertical(band, i)) row[x] = "."; });
    return mirror(row);
  }

  // True when every open tile in `rows` (top first) reaches an open tile in the
  // last row, moving only through `rows` plus `below`, whose open tiles are known to connect.
  function connected(rows, below) {
    const grid = [...rows, ...below];
    const open = (x, y) => y >= 0 && y < grid.length && grid[y][(x + COLS) % COLS] !== "#";
    const seen = new Set(), queue = [];
    let last = grid.length - 1;
    while (last > 0 && !grid[last].split("").some((cell) => cell !== "#")) last--;
    for (let x = 0; x < COLS; x++) if (open(x, last)) { seen.add(last * COLS + x); queue.push([x, last]); }
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy;
        let nx = x + dx;
        if (nx < 0 || nx >= COLS) { if (grid[y][0] === "#" || grid[y][COLS - 1] === "#") continue; nx = (nx + COLS) % COLS; }
        if (!open(nx, ny) || seen.has(ny * COLS + nx)) continue;
        seen.add(ny * COLS + nx); queue.push([nx, ny]);
      }
    }
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < COLS; x++) if (open(x, y) && !seen.has(y * COLS + x)) return false;
    return true;
  }

  function createGenerator(random) {
    // Generator state; `save`/`load` let a rejected chunk leave no trace.
    let nextId = 0, borderRun = 0, below = null, lastRows = [];
    let pieces = new Map(); // id -> cells in the piece
    const save = () => ({ nextId, borderRun, below, lastRows, pieces: new Map(pieces) });
    const load = (s) => ({ nextId, borderRun, below, lastRows } = s, pieces = new Map(s.pieces));

    function newPiece() { pieces.set(nextId, 1); return nextId++; }
    function canJoin(id, biome, col) {
      if (id === BORDER) return col === 0 && borderRun < MAX_BORDER_RUN;
      return id >= 0 && pieces.get(id) < biome.maxPiece;
    }
    // After the arcade generator's growth: each cell joins the piece below, the piece
    // to its left, the side wall, or starts a new piece.
    function rollBand(biome, low, plain) {
      const band = [];
      for (let col = 0; col < CELLS; col++) {
        const options = [];
        if (!plain) {
          if (col === 0 && random() < biome.pBorder && canJoin(BORDER, biome, col)) options.push(BORDER);
          if (random() < biome.pDown && canJoin(low[col], biome, col)) options.push(low[col]);
          if (col > 0 && random() < biome.pSide && canJoin(band[col - 1], biome, col) && !options.includes(band[col - 1])) options.push(band[col - 1]);
        }
        const id = options.length ? options[Math.floor(random() * options.length)] : newPiece();
        if (options.length && id !== BORDER) pieces.set(id, pieces.get(id) + 1);
        band.push(id);
      }
      return band;
    }
    // A band whose corridor row below it has no dead ends.
    function nextBand(biome, plain) {
      for (let tries = 0; tries < 24 && !plain; tries++) {
        const before = { nextId, pieces: new Map(pieces) };
        const band = rollBand(biome, below, false);
        if (nodeDegrees(below, band).every((degree) => degree !== 1)) return band;
        nextId = before.nextId; pieces = before.pieces;
      }
      // Every cell a piece of its own opens every edge, which is always sound.
      return rollBand(biome, below, true);
    }

    // Scatters markers the ruleset turns into ghosts (G), power-ups (U) and power pellets (P).
    function placeMarkers(rows, lineRows, biome) {
      const spots = (ys) => {
        const found = [];
        for (const y of ys) for (let x = 3; x < COLS - 3; x++) if (rows[y][x] === ".") found.push([x, y]);
        return found;
      };
      const put = (list, mark) => {
        if (!list.length) return;
        const [x, y] = list[Math.floor(random() * list.length)];
        rows[y][x] = mark;
      };
      put(spots(lineRows), "G");
      if (random() < 0.5) put(spots(lineRows), "G");
      if (random() < 0.35) put(spots(lineRows), "U");
      if (random() < biome.power) put(spots(rows.map((_, y) => y).filter((y) => !lineRows.includes(y))), "P");
    }
    // Astra-style open corridors: some corridor rows carry no dots at all.
    function clearRows(rows, lineRows, biome) {
      for (const y of lineRows) if (random() < biome.sparse) rows[y] = rows[y].map((cell) => cell === "." ? " " : cell);
    }
    // After the arcade's createTunnels: now and then a corridor row runs out both sides.
    function cutTunnel(rows, lineRows, biome) {
      if (random() >= biome.tunnel) return;
      const ok = lineRows.filter((y) => rows[y][1] === ".");
      if (!ok.length) return;
      const y = ok[Math.floor(random() * ok.length)];
      rows[y][0] = rows[y][COLS - 1] = " ";
    }

    function build(biome, bands, start, gaps, plain) {
      const out = [], lineRows = []; // lowest first
      if (start || !below) {
        below = Array(CELLS).fill(FLOOR);
        borderRun = 0; lastRows = [];
        if (start) out.push("#".repeat(COLS));
      }
      for (let b = 0; b < bands; b++) {
        const band = nextBand(biome, plain);
        borderRun = band[0] === BORDER ? borderRun + 1 : 0;
        lineRows.push(out.length);
        out.push(lineRow(below, band));
        const gap = gaps ? gaps[b] : biome.rowGap;
        for (let y = 1; y < gap; y++) out.push(interiorRow(band));
        below = band;
        // Pieces that are not in the newest band can no longer grow.
        for (const id of [...pieces.keys()]) if (!band.includes(id)) pieces.delete(id);
      }
      const rows = out.reverse().map((row) => Array.from(row));
      const lines = lineRows.map((y) => rows.length - 1 - y);
      if (start) {
        const floor = rows.length - 2;
        rows[floor][13] = rows[floor][14] = " ";
        lines.splice(lines.indexOf(floor), 1);
      } else {
        cutTunnel(rows, lines, biome);
      }
      return { rows, lines };
    }

    // Emits `bands` new bands, each with the corridor row under it, top row first.
    // The start chunk sits on a solid floor, with the start marked in its lowest corridor.
    function nextChunk({ biome = BIOMES[0], bands = 3, start = false, gaps = null } = {}) {
      biome = typeof biome === "string" ? biomeById(biome) : biome;
      const before = save();
      let result = null;
      for (let tries = 0; tries < 12 && !result; tries++) {
        const attempt = build(biome, bands, start, gaps, false);
        if (connected(attempt.rows.map((r) => r.join("")), lastRows)) result = attempt;
        else load(before);
      }
      if (!result) result = build(biome, bands, start, gaps, true);
      if (!start) { placeMarkers(result.rows, result.lines, biome); clearRows(result.rows, result.lines, biome); }
      const rows = result.rows.map((row) => row.join(""));
      lastRows = rows.map((row) => row.replace(/[GUP]/g, "."));
      return rows;
    }
    // Closes the top of the maze with a corridor row and a wall row (for previews and tests).
    function finish() {
      return ["#".repeat(COLS), lineRow(below || Array(CELLS).fill(FLOOR), Array(CELLS).fill(CEILING))];
    }
    return { nextChunk, finish };
  }

  // A complete 28 x `height` maze for the editor: the start chunk, generated bands and a ceiling.
  function generatePreview(random, biome = BIOMES[0], height = 31) {
    biome = typeof biome === "string" ? biomeById(biome) : biome;
    const gen = createGenerator(random);
    const start = gen.nextChunk({ biome, start: true, bands: 1 });
    let room = height - start.length - 2;
    const gaps = [];
    while (room > 0) {
      const gap = room >= biome.rowGap + 2 || room === biome.rowGap ? biome.rowGap : Math.min(room, 5);
      gaps.push(gap); room -= gap;
    }
    const body = [];
    for (let i = 0; i < gaps.length; i += 3) {
      const slice = gaps.slice(i, i + 3);
      body.unshift(...gen.nextChunk({ biome, bands: slice.length, gaps: slice }));
    }
    return [...gen.finish(), ...body, ...start];
  }

  const api = Object.freeze({ COLS, LINES, BIOMES, biomeById, blendBiomes, createGenerator, generatePreview });
  root.AstraMazeGen = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
