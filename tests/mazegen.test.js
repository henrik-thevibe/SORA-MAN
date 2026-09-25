"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../mazegen.js");
const COLS = 28;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
// A tile is open unless it's wall; tunnel rows (open at both edges) wrap.
function checker(rows) {
  const open = (x, y) => {
    if (y < 0 || y >= rows.length) return false;
    if (x < 0 || x >= COLS) {
      if (rows[y][0] === "#" || rows[y][COLS - 1] === "#") return false;
      x = (x + COLS) % COLS;
    }
    return rows[y][x] !== "#";
  };
  return open;
}
function assertArcade(rows, label) {
  const open = checker(rows);
  let count = 0, start = null;
  for (let y = 0; y < rows.length; y++) {
    const walls = rows[y].replace(/[^#]/g, ".");
    assert.equal(walls, [...walls].reverse().join(""), `${label}: row ${y} is mirrored`);
    for (let x = 0; x < COLS; x++) {
      if (!open(x, y)) continue;
      count++; start = start || [x, y];
      const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(x + dx, y + dy)).length;
      assert.ok(exits >= 2, `${label}: dead end at ${x},${y}\n${rows.join("\n")}`);
      if (x + 1 < COLS) assert.ok(!(open(x + 1, y) && open(x, y + 1) && open(x + 1, y + 1)), `${label}: open 2x2 at ${x},${y}`);
    }
  }
  const seen = new Set([start.join()]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let [x, y] = [queue[i][0] + dx, queue[i][1] + dy];
    if (!open(x, y)) continue;
    x = (x + COLS) % COLS;
    if (!seen.has(x + "," + y)) { seen.add(x + "," + y); queue.push([x, y]); }
  }
  assert.equal(seen.size, count, `${label}: every corridor joins up\n${rows.join("\n")}`);
}

test("every biome grows mirrored mazes with no dead ends, no open 2x2 and no islands", () => {
  for (const biome of G.BIOMES) {
    for (let seed = 1; seed <= 40; seed++) {
      const gen = G.createGenerator(seeded(seed * 97 + biome.rowGap));
      const rows = [...gen.nextChunk({ biome, start: true })];
      for (let i = 0; i < 12; i++) {
        const chunk = gen.nextChunk({ biome });
        assert.equal(chunk.length, 3 * biome.rowGap);
        const tunnels = chunk.filter((row) => row[0] !== "#").length;
        assert.ok(tunnels <= 1, "at most one tunnel per chunk");
        rows.unshift(...chunk);
      }
      rows.unshift(...gen.finish());
      assertArcade(rows, `${biome.id} seed ${seed}`);
      assert.ok(rows.at(-2).includes("  "), "the start chunk marks the start");
    }
  }
});

test("blended styles are still sound, and halfway blends sit between the two styles", () => {
  for (let i = 0; i < G.BIOMES.length; i++) {
    const a = G.BIOMES[i], b = G.BIOMES[(i + 1) % G.BIOMES.length];
    assert.equal(G.blendBiomes(a, b, 0, Math.random), a); assert.equal(G.blendBiomes(a, b, 1, Math.random), b);
    const half = G.blendBiomes(a, b, 0.5, () => 0.3);
    assert.ok(half.pDown >= Math.min(a.pDown, b.pDown) && half.pDown <= Math.max(a.pDown, b.pDown));
    for (let seed = 1; seed <= 15; seed++) {
      const random = seeded(seed * 31 + i), gen = G.createGenerator(random);
      const rows = [...gen.nextChunk({ biome: a, start: true })];
      for (let c = 0; c < 10; c++) rows.unshift(...gen.nextChunk({ biome: G.blendBiomes(a, b, c / 9, random) }));
      rows.unshift(...gen.finish());
      assertArcade(rows, `${a.id} to ${b.id} seed ${seed}`);
    }
  }
});

test("ASTRA style leaves some corridors without dots; the others are full", () => {
  const empty = (id) => {
    const gen = G.createGenerator(seeded(9)); gen.nextChunk({ start: true });
    let rows = 0;
    for (let i = 0; i < 30; i++) rows += gen.nextChunk({ biome: id }).filter((row) => row.includes(" ") && !row.includes(".")).length;
    return rows;
  };
  assert.ok(empty("astra") > 5);
  assert.equal(empty("classic"), 0);
});

test("the same seed grows the same maze", () => {
  const grow = () => { const gen = G.createGenerator(seeded(7)); return [gen.nextChunk({ start: true }), gen.nextChunk(), gen.nextChunk({ biome: "astra" })]; };
  assert.deepEqual(grow(), grow());
});

test("chunks carry ghost markers and editor previews fill the whole 28 x 31 window", () => {
  const gen = G.createGenerator(seeded(3)); gen.nextChunk({ start: true });
  for (let i = 0; i < 20; i++) assert.ok(gen.nextChunk().some((row) => row.includes("G")));
  for (const biome of G.BIOMES) for (let seed = 1; seed <= 10; seed++) {
    const rows = G.generatePreview(seeded(seed), biome.id);
    assert.equal(rows.length, 31); assert.ok(rows.every((row) => row.length === COLS));
    assertArcade(rows.map((row) => row.replace(/[GUP]/g, ".")), `preview ${biome.id} ${seed}`);
  }
});
