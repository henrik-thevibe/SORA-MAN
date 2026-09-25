import { createRequire } from "node:module";
// Clip recipes for capture.mjs. Frames are at 30 fps (two 60 Hz sim steps each).
// `setup` and `script[frame]` run in the page (game, pacmanDebug, __auto are globals).

const play = (key = "Enter") => async (page) => {
  await page.keyboard.press(key);
  await page.waitForFunction(() => game.state === "READY" || game.state === "PLAYING");
};
const skipReady = () => { game.readyTimer = Math.min(game.readyTimer, 0.3); };
const spawn = (id) => new Function(`__auto.spawn(${JSON.stringify(id)}, 3, 6);`);

const require = createRequire(import.meta.url);
function achievementsProfile() {
  const M = require("../../meta.js"), profile = M.defaultProfile();
  for (const id of ["hello-world", "10k-tokens", "arena-champion", "sparkster", "full-party"]) if (M.ACHIEVEMENTS.some((a) => a.id === id)) profile.achievements[id] = "2026-09-24";
  M.ACHIEVEMENTS.slice(0, 7).forEach((a) => { profile.achievements[a.id] = "2026-09-24"; });
  profile.xp = 1840; profile.credits = 610;
  return JSON.stringify(profile);
}

export const CLIPS = [
  { name: "classic", hash: "mode=classic&maze=classic", frames: 1200, start: play() },
  {
    name: "remix", hash: "mode=remix&maze=classic", frames: 1260, start: play(), setup: skipReady,
    script: {
      60: spawn("token-beam"), 210: spawn("scale-up"), 360: spawn("hot-path"), 510: spawn("rate-limit"),
      660: spawn("context-overflow"), 810: spawn("rag"), 960: spawn("incognito"),
      1110: () => game.useSkill(0), 1180: () => game.useSkill(0),
    },
  },
  {
    name: "sunset", hash: "mode=hallucination", frames: 1500, start: play(), setup: () => { __auto.cfg.upward = 1.2; skipReadyInPage(); },
    script: {
      600: () => { game.ruleState("hallucination").chain[0] = 118; game.ruleState("hallucination").lastEat[0] = game.playTime; },
      1100: () => { game.ruleState("hallucination").chain[0] = 246; game.ruleState("hallucination").lastEat[0] = game.playTime; },
    },
  },
  // VERSUS: Sora (1UP) against the game's three real bots. Sora plays with the same bot brain
  // (AstraModes.versusBot) so the match is fair and replays exactly in node: seed 113 was picked by
  // a headless search as a match Sora wins, eating Nova and Lyra early and outlasting the glitch.
  // From frame 450 the arena clock runs 3x so the edges visibly close within the clip.
  {
    name: "versus", hash: "mode=versus&maze=classic", frames: 800, start: play(), immortal: false,
    setup: () => {
      game.startGame(4, "classic", "versus", { seed: 113, humans: 1 });
      game.readyTimer = Math.min(game.readyTimer, 0.3);
      __auto.cfg.hold = true;
      window.__beforeStep = () => {
        if (game.state !== "PLAYING") return;
        if (window.__frame >= 450 && game.freezeTimer <= 0) game.ruleState("versus").elapsed += (1 / 60) * 2;
        const sora = game.players[0];
        if (sora.alive && !sora.out && game.tickCount % 3 === 0) AstraModes.versusBot(game, sora);
      };
    },
    script: { 450: () => { const st = game.ruleState("versus"); st.elapsed = Math.max(st.elapsed, 74); } },
  },
  { name: "coop", hash: "mode=remix&maze=astra", frames: 330, start: play("4"), setup: () => skipReadyInPage() },
  { name: "maze-neural", hash: "mode=classic&maze=neural", frames: 240, start: play(), setup: () => skipReadyInPage() },
  { name: "maze-server", hash: "mode=classic&maze=server", frames: 240, start: play(), setup: () => skipReadyInPage() },
  { name: "maze-astra", hash: "mode=classic&maze=astra", frames: 240, start: play(), setup: () => skipReadyInPage() },
  { name: "title", hash: "mode=classic&maze=classic", frames: 360 },
  // The profile's achievements tab, on a profile with a handful unlocked.
  { name: "achievements", hash: "mode=classic&maze=classic", frames: 150, storage: { "astra-profile-v1": achievementsProfile() },
    start: async (page) => { await page.keyboard.press("u"); },
    script: { 8: "ArrowUp", 16: "ArrowLeft", 40: "ArrowDown", 56: "ArrowDown", 72: "ArrowDown", 88: "ArrowDown", 104: "ArrowDown", 120: "ArrowDown" } },
  { name: "wardrobe", hash: "mode=classic&maze=classic", frames: 330, start: async (page) => { await page.keyboard.press("u"); },
    script: { 40: "ArrowRight", 80: "ArrowRight", 120: "ArrowRight", 160: "ArrowDown", 190: "ArrowDown", 220: "ArrowDown", 260: "ArrowDown" } },

  // ---- Revision 2: staged clips ------------------------------------------------------
  // Claude hunts Sora down the bottom corridor; Sora slips up the corner at x=12.
  {
    name: "claude-chase", hash: "mode=classic&maze=classic", frames: 240, start: play(),
    setup: () => {
      stage.begin({ keepGhosts: ["blinky"] }); stage.sora(22, 29, 1); stage.ghost("blinky", 26, 29, 1);
      stage.status("sora", "trailer-slow", 30); stage.route([[12, 29], [12, 26], [9, 26], [9, 23], [6, 23], [6, 8], [6, 5], [1, 5]]);
      // Claude closes to just over a tile, then Sora finds his speed again at the corner.
      let freed = false;
      window.__beforeStep = () => { const p = game.pacman, g = game.ghosts.find((k) => k.id === "blinky"); if (!freed && Math.hypot(g.x - p.x, g.y - p.y) < 1.3) { freed = true; stage.clearStatus("sora", "trailer-slow"); } };
    },
  },
  ...[
    ["token-beam", () => { stage.begin({ keepGhosts: ["blinky", "pinky"] }); stage.sora(2, 5, 3); stage.item("token-beam", 6, 5); stage.ghost("blinky", 16, 5, 1); stage.ghost("pinky", 22, 5, 1); stage.route([[6, 5], [9, 5]]); }],
    ["scale-up", () => { stage.begin({ keepGhosts: ["blinky", "inky"] }); stage.sora(2, 29, 3); stage.item("scale-up", 6, 29); stage.ghost("blinky", 17, 29, 1); stage.ghost("inky", 23, 29, 1); stage.route([[6, 29]]); __auto.cfg.chase = ["blinky", "inky"]; }],
    ["hot-path", () => { stage.begin({ keepGhosts: ["blinky"] }); stage.sora(21, 29, 1); stage.item("hot-path", 18, 29); stage.ghost("blinky", 25, 29, 1); stage.status("blinky", "trailer-fast", 4); stage.route([[18, 29], [12, 29], [12, 26], [9, 26], [9, 23]]); }],
    ["rate-limit", () => { stage.begin({ keepGhosts: ["blinky", "pinky", "clyde"] }); stage.sora(12, 5, 3); stage.item("rate-limit", 15, 5); stage.ghost("blinky", 6, 5, 3); stage.ghost("pinky", 24, 5, 1); stage.ghost("clyde", 21, 2, 2); stage.route([[15, 5], [18, 5], [18, 8], [15, 8]]); }],
    ["context-overflow", () => { stage.begin({ keepGhosts: ["blinky", "pinky", "inky"] }); stage.sora(2, 29, 3); stage.item("context-overflow", 5, 29); stage.ghost("blinky", 14, 29, 1); stage.ghost("pinky", 17, 29, 1); stage.ghost("inky", 12, 26, 2); stage.route([[5, 29], [22, 29]]); }],
    ["rag", () => { stage.begin({ keepGhosts: ["blinky"] }); stage.sora(2, 5, 3); stage.item("rag", 4, 5); stage.ghost("blinky", 26, 29, 1); stage.route([[4, 5], [6, 5], [6, 1], [12, 1], [12, 5], [21, 5]]); }],
    ["incognito", () => { stage.begin({ keepGhosts: ["blinky", "inky"] }); stage.sora(2, 5, 3); stage.item("incognito", 5, 5); stage.ghost("blinky", 11, 5, 1); stage.ghost("inky", 19, 5, 1); stage.route([[5, 5], [26, 5]]); }],
    ["star-dash", () => {
      stage.begin({ keepGhosts: ["blinky"] }); stage.sora(21, 29, 1); stage.ghost("blinky", 25, 29, 1); stage.status("blinky", "trailer-fast", 30); stage.route([[1, 29], [1, 26]]);
      let used = false;
      window.__beforeStep = () => { const p = game.pacman, g = game.ghosts.find((k) => k.id === "blinky"); if (!used && Math.abs(g.x - p.x) < 1.6) { used = true; game.useSkill(0); stage.clearStatus("blinky", "trailer-fast"); } };
    }],
  ].map(([id, setup]) => ({ name: "pu-" + id, hash: "mode=remix&maze=classic", frames: 240, start: play(), setup })),
  // SUNSET: the glitch rides up right under Sora and deletes the ghosts behind.
  {
    name: "sunset-glitch", hash: "mode=hallucination", frames: 420, start: play(),
    setup: () => {
      __auto.cfg.upward = 1.2; skipReadyInPage();
      window.__beforeStep = () => {
        const st = game.ruleState("hallucination"), p = game.pacman;
        if (game.playTime > 2.5) st.glitchLine = Math.min(st.glitchLine - 0.02, p.y + 3.6);
      };
    },
    script: {
      120: () => { const E = PacmanEngine, p = game.pacman; for (const [id, brain, dy] of [["inky", "sleeper", 2], ["clyde", "diver", 3]]) { const y = Math.floor(p.y) + dy; for (let x = 1; x < 27; x++) if (E.canEnter(x, y, { type: "ghost", state: "CHASE" }, undefined, game.map) && Math.abs(x - p.x) > 3) { game.spawnGhost(id, x + 0.5, y + 0.5, { brain }); break; } } },
    },
  },
];

// Page-side helper installed by capture.mjs before setup runs.
export const PAGE_HELPERS = `window.skipReadyInPage = () => { game.readyTimer = Math.min(game.readyTimer, 0.3); };`;
