/* Bundled mazes beyond the arcade original, plus the share-code format.
 * Every maze is 28 by 31 tiles. Legend: "#" (or any other symbol) wall,
 * "." dot, "P" power pellet, " " empty corridor, "--" the ghost-house gate,
 * "SS" the player start. The ghost house is an 8x5 pen around its gate; see
 * analyzeMap in engine.js for every rule, and tools/maze-editor.html to draw one. */
(function (root) {
  "use strict";
  const MAPS = Object.freeze([
    Object.freeze({
      id: "neural",
      name: "NEURAL NET",
      wall: "#b04bff",
      about: "A dense lattice of junctions around a raised ghost house.",
      rows: Object.freeze([
        "############################",
        "#.....#..............#.....#",
        "#.###.#.####.##.####.#.###.#",
        "#P###.#.####.##.####.#.###P#",
        "#..........................#",
        "#.##.###.##.####.##.###.##.#",
        "#.##.###.##.####.##.###.##.#",
        "#....###....####....###....#",
        "####.####.########.####.####",
        "####.####.########.####.####",
        "####.....          .....####",
        "####.#### ###--### ####.####",
        "####.#### #      # ####.####",
        "    .     #      #     .    ",
        "####.#### #      # ####.####",
        "####.#### ######## ####.####",
        "####.....          .....####",
        "####.####.########.####.####",
        "####.####.########.####.####",
        "#..........................#",
        "#.##.##.####.##.####.##.##.#",
        "#.##.##.####.##.####.##.##.#",
        "#............SS............#",
        "#.####.####.####.####.####.#",
        "#.####.####.####.####.####.#",
        "#......##..........##......#",
        "###.##.##.##.##.##.##.##.###",
        "#P..##.......##.......##..P#",
        "#.#.##.#####.##.#####.##.#.#",
        "#............##............#",
        "############################",
      ]),
    }),
    Object.freeze({
      id: "server",
      name: "SERVER ROOM",
      wall: "#18c98f",
      about: "Rack rows and long aisles, with two tunnels, in the dark.",
      dark: true,
      rows: Object.freeze([
        "############################",
        "#..........................#",
        "#.##.##.##.######.##.##.##.#",
        "#P##.##.##.######.##.##.##P#",
        "#.##.##.##.######.##.##.##.#",
        "#.##.##.##.######.##.##.##.#",
        "#.##.##.##.######.##.##.##.#",
        "#.##.##.##.######.##.##.##.#",
        "#..........................#",
        "####.##.##.######.##.##.####",
        "    .##.##.######.##.##.    ",
        "####.##.##.######.##.##.####",
        "#....##.##.######.##.##....#",
        "#.##.##.##.######.##.##.##.#",
        "#.........        .........#",
        "#.##.#### ###--### ####.##.#",
        "#.##.#### #      # ####.##.#",
        "#.##.#### #      # ####.##.#",
        "#.##.#### #      # ####.##.#",
        "#.##.#### ######## ####.##.#",
        "#.........        .........#",
        "####.##.##.######.##.##.####",
        "    .##.##.######.##.##.    ",
        "####.##.##.######.##.##.####",
        "#............SS............#",
        "#.##.##.##.######.##.##.##.#",
        "#.##.##.##.######.##.##.##.#",
        "#P##.##.##.######.##.##.##P#",
        "#.##.##.##.######.##.##.##.#",
        "#..........................#",
        "############################",
      ]),
    }),
    Object.freeze({
      id: "astra",
      name: "ASTRA",
      wall: "#3fc6ff",
      about: "Astra's name spelled in dots, after the Google Doodle logo maze.",
      rows: Object.freeze([
        "############################",
        "##P                      P##",
        "## ## #### # ## # #### ## ##",
        "##....#....#....#....#....##",
        "##.##.#.#####.###.##.#.##.##",
        "##....#....##.###....#....##",
        "##.##.####.##.###.#.##.##.##",
        "##.##.#....##.###.#..#.##.##",
        "## ## # ##### ### ## # ## ##",
        "##                        ##",
        "##.###.##############.###.##",
        "##.###...          ...###.##",
        "##.###.## ###--### ##.###.##",
        "##.###.## #      # ##.###.##",
        "  ....... #      # .......  ",
        "##.###.## #      # ##.###.##",
        "##.###.## ######## ##.###.##",
        "##.......          .......##",
        "##.###.####.####.####.###.##",
        "#..........................#",
        "#.##.##.####.##.####.##.##.#",
        "#.##.##.####.##.####.##.##.#",
        "#............SS............#",
        "#.####.####.####.####.####.#",
        "#.####.####.####.####.####.#",
        "#......##..........##......#",
        "###.##.##.##.##.##.##.##.###",
        "#P..##.......##.......##..P#",
        "#.#.##.#####.##.#####.##.#.#",
        "#............##............#",
        "############################",
      ]),
    }),
  ]);

  // Share codes: run-length encoded tiles, safe inside a URL fragment.
  const CODE_VERSION = "1";
  const TO_CODE = { ".": "d", P: "p", " ": "e", "-": "g", S: "s" };
  const FROM_CODE = { w: "#", d: ".", p: "P", e: " ", g: "-", s: "S" };

  function encodeRows(rows) {
    const tiles = rows.join("").split("").map((cell) => TO_CODE[cell] || "w");
    let code = "";
    for (let i = 0; i < tiles.length;) {
      let run = 1;
      while (tiles[i + run] === tiles[i]) run += 1;
      code += (run > 1 ? run : "") + tiles[i];
      i += run;
    }
    return CODE_VERSION + "." + code;
  }

  // Returns 31 rows of 28 tiles, or null for a malformed code.
  function decodeRows(code, cols = 28, rowCount = 31) {
    const match = /^1\.((?:\d*[wdpegs])+)$/.exec(String(code || "").trim());
    if (!match) return null;
    let tiles = "";
    for (const [, run, tile] of match[1].matchAll(/(\d*)([wdpegs])/g)) {
      const count = run ? Number(run) : 1;
      if (tiles.length + count > cols * rowCount) return null;
      tiles += FROM_CODE[tile].repeat(count);
    }
    if (tiles.length !== cols * rowCount) return null;
    return Array.from({ length: rowCount }, (_, y) => tiles.slice(y * cols, (y + 1) * cols));
  }

  const api = Object.freeze({ MAPS, encodeRows, decodeRows });
  root.AstraMaps = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
