/* In-page autopilot for trailer capture. Steers every non-bot player toward
 * something worth filming: pickups first, then frightened ghosts, then dots,
 * while keeping clear of dangerous ghosts. Loaded with page.addScriptTag. */
(function () {
  "use strict";
  const E = window.PacmanEngine, COLS = 28, ROWS = 31;
  const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  const cfg = { upward: 0, hunt: true, items: true, dangerRadius: 2, focus: null };

  const wrapX = (x, y) => (game.map.tunnelRows.has(y) ? (x + COLS) % COLS : x);
  const open = (x, y, pac) => y >= 0 && y < ROWS && E.canEnter(wrapX(x, y), y, pac, undefined, game.map);
  const alive = (g) => g.state !== "EATEN" && g.state !== "HOUSE";
  const scary = (g) => alive(g) && g.state !== "FRIGHTENED" && !(g.status || []).some((s) => s.id === "stunned");

  function dangerSet(pac) {
    const set = new Set();
    if (game.hasStatus?.(pac, "incognito") || game.hasStatus?.(pac, "scale-up")) return set;
    const r = cfg.dangerRadius;
    for (const g of game.ghosts) {
      if (!scary(g)) continue;
      const gx = Math.floor(g.x), gy = Math.floor(g.y);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        set.add((gy + dy) * COLS + wrapX(gx + dx, gy + dy));
      }
    }
    return set;
  }

  // Breadth-first search; returns {dist, first} arrays indexed by tile.
  function flood(pac, blocked) {
    const sx = Math.floor(pac.x), sy = Math.floor(pac.y), start = sy * COLS + sx;
    const dist = new Int16Array(COLS * ROWS).fill(-1), first = new Int8Array(COLS * ROWS).fill(-1);
    dist[start] = 0;
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i], x = at % COLS, y = Math.floor(at / COLS);
      for (let d = 0; d < 4; d++) {
        const ny = y + DIRS[d][1], nx = wrapX(x + DIRS[d][0], ny);
        if (nx < 0 || nx >= COLS || !open(nx, ny, pac)) continue;
        const next = ny * COLS + nx;
        if (dist[next] >= 0 || (blocked.has(next) && dist[at] < 12)) continue;
        dist[next] = dist[at] + 1;
        first[next] = at === start ? d : first[at];
        queue.push(next);
      }
    }
    return { dist, first };
  }

  function best(field, score) {
    let pick = -1, value = Infinity;
    for (let i = 0; i < field.dist.length; i++) {
      if (field.dist[i] <= 0) continue;
      const s = score(i % COLS, Math.floor(i / COLS), field.dist[i]);
      if (s !== null && s < value) { value = s; pick = i; }
    }
    return pick < 0 ? -1 : field.first[pick];
  }

  function flee(pac) {
    const x = Math.floor(pac.x), y = Math.floor(pac.y);
    let dir = -1, far = -Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (!open(nx, ny, pac)) continue;
      const near = Math.min(99, ...game.ghosts.filter(scary).map((g) => Math.abs(g.x - nx - 0.5) + Math.abs(g.y - ny - 0.5)));
      if (near > far) { far = near; dir = d; }
    }
    return dir;
  }

  function think(pac) {
    const blocked = dangerSet(pac), field = flood(pac, blocked);
    const tileIs = (things) => new Set(things.map((t) => Math.floor(t.y) * COLS + wrapX(Math.floor(t.x), Math.floor(t.y))));
    let dir = -1;
    // Staged steering: a route of tiles, or charging a named ghost, ignores danger.
    if (pac.index === 0 && cfg.route && cfg.route.length) {
      const [tx, ty] = cfg.route[0];
      if (Math.floor(pac.x) === tx && Math.floor(pac.y) === ty) cfg.route.shift();
      if (cfg.route.length) {
        const [rx, ry] = cfg.route[0], free = flood(pac, new Set());
        dir = best(free, (x, y, d) => (x === rx && y === ry ? d : null));
        if (dir >= 0) { pac.wanted = dir; return; }
      }
    }
    if (pac.index === 0 && cfg.chase) {
      const g = [].concat(cfg.chase).map((id) => game.ghosts.find((k) => k.id === id && alive(k))).find(Boolean);
      if (g) {
        const free = flood(pac, new Set()), gx = Math.floor(g.x), gy = Math.floor(g.y);
        dir = best(free, (x, y, d) => (x === gx && y === gy ? d : null));
        if (dir >= 0) { pac.wanted = dir; return; }
      }
    }
    if (cfg.focus) {
      const f = cfg.focus;
      dir = best(field, (x, y, d) => (x === f[0] && y === f[1] ? d : null));
    }
    if (dir < 0 && cfg.items && game.items.length) {
      const items = tileIs(game.items);
      dir = best(field, (x, y, d) => (items.has(y * COLS + x) && d < 24 ? d : null));
    }
    if (dir < 0 && game.hasStatus?.(pac, "energized")) {
      const rivals = tileIs(game.players.filter((p) => p !== pac && p.alive && !p.out && !game.hasStatus(p, "energized")));
      dir = best(field, (x, y, d) => (rivals.has(y * COLS + x) ? d : null));
    }
    if (dir < 0 && cfg.hunt) {
      const prey = tileIs(game.ghosts.filter((g) => g.state === "FRIGHTENED"));
      if (prey.size) dir = best(field, (x, y, d) => (prey.has(y * COLS + x) && d < 16 ? d : null));
    }
    if (dir < 0) {
      const threat = game.ghosts.some((g) => scary(g) && Math.abs(g.x - pac.x) + Math.abs(g.y - pac.y) < 6);
      dir = best(field, (x, y, d) => {
        const p = game.pellets[y * COLS + x];
        if (!p) return null;
        return d + y * cfg.upward - (p === 2 && threat ? 30 : 0) + (p === 2 && !threat ? 8 : 0);
      });
    }
    if (dir < 0 && cfg.upward) dir = best(field, (x, y, d) => d * 0.3 + y * cfg.upward);
    const danger = blocked.has(Math.floor(pac.y) * COLS + Math.floor(pac.x));
    if (dir < 0 || (danger && dir < 0)) dir = flee(pac);
    if (dir >= 0) pac.wanted = dir;
  }

  // An open tile min..max steps ahead of the player, preferring its heading.
  function near(pac, min = 3, max = 6) {
    const field = flood(pac, new Set());
    let pick = null, value = Infinity;
    for (let i = 0; i < field.dist.length; i++) {
      const d = field.dist[i];
      if (d < min || d > max) continue;
      const s = (field.first[i] === pac.dir ? 0 : 10) + Math.abs(d - (min + max) / 2);
      if (s < value) { value = s; pick = { x: (i % COLS) + 0.5, y: Math.floor(i / COLS) + 0.5 }; }
    }
    return pick;
  }

  window.__auto = {
    cfg,
    near,
    spawn(id, min, max) {
      const spot = near(game.pacman, min, max);
      if (spot) game.spawnItem({ kind: "powerup", id, x: spot.x, y: spot.y, timeLeft: 10 });
      return spot;
    },
    steer() {
      if (cfg.hold || (game.state !== "PLAYING" && game.state !== "READY")) return;
      for (const pac of game.players) if (pac.alive && !pac.bot && !pac.out) think(pac);
    },
  };
})();
