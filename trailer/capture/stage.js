/* Staging helpers for trailer clips, injected after autopilot.js. They only
 * move actors and set timers through the public game object; nothing in the
 * game source changes. Coordinates are tiles (x, y), directions 0 up 1 left 2 down 3 right. */
(function () {
  "use strict";
  const E = window.PacmanEngine;
  // Invisible speed tweaks: statuses without a label draw nothing in the HUD.
  for (const [id, speed] of [["trailer-slow", 0.78], ["trailer-fast", 1.35], ["trailer-crawl", 0.55]]) {
    if (!E.STATUSES.has(id)) E.registerStatus({ id, speed });
  }
  const put = (actor, x, y, dir) => { actor.x = x + 0.5; actor.y = y + 0.5; actor.dir = dir; actor.decisionTile = null; if ("wanted" in actor) actor.wanted = dir; };

  window.stage = {
    // Skip READY, stop the random power-up spawns, and hold every ghost in the house.
    begin({ keepGhosts = [], mode = "CHASE" } = {}) {
      game.readyTimer = Math.min(game.readyTimer, 0.05);
      if (game.ruleState) { const p = game.ruleState("powerups"); if (p) p.every = 1e9; }
      game.mode = mode; game.modeTimer = 1e9;
      for (const g of game.ghosts) if (!keepGhosts.includes(g.id)) { g.state = "HOUSE"; g.leavingHouse = false; g.homeTimer = 1e9; g.releaseThreshold = 1e9; }
    },
    sora(x, y, dir) { put(game.pacman, x, y, dir); },
    ghost(id, x, y, dir, state = "CHASE") {
      const g = game.ghosts.find((k) => k.id === id);
      if (!g) return;
      put(g, x, y, dir);
      Object.assign(g, { state, leavingHouse: false, homeTimer: 0, releaseThreshold: 0 });
    },
    item(id, x, y) { game.spawnItem({ kind: "powerup", id, x: x + 0.5, y: y + 0.5, timeLeft: 60 }); },
    status(actor, id, seconds) { game.addStatus(actor === "sora" ? game.pacman : game.ghosts.find((g) => g.id === actor), id, seconds); },
    clearStatus(actor, id) { game.removeStatus(actor === "sora" ? game.pacman : game.ghosts.find((g) => g.id === actor), id); },
    route(tiles) { __auto.cfg.route = tiles.map((t) => t.slice()); },
  };
})();
