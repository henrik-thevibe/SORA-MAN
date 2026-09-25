/* The meta game: daily runs, shareable score codes, the saved profile (XP,
 * levels, compute credits, unlocks, loadout) and achievements. Nothing here
 * touches the simulation; a tracker watches a game's events and awards
 * progress when it ends. Profiles live in browser storage only. */
(function (root) {
  "use strict";
  const E = root.PacmanEngine || require("./engine.js");
  const PROFILE_KEY = "astra-profile-v1";

  function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  // ---- Daily runs --------------------------------------------------------------
  const DAILY_RULESETS = Object.freeze(["benchmark", "remix", "hallucination"]);
  const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
  // Everyone gets the same mode, maze and seed on the same UTC day.
  function daily(date = new Date()) {
    const id = dateKey(date), h = hash("astra-daily:" + id);
    const rulesets = DAILY_RULESETS.filter((rules) => E.RULESETS.has(rules));
    const mazes = E.MAPS.filter((map) => !map.id.startsWith("benchmark") && map.id !== "custom").map((map) => map.id);
    return Object.freeze({
      id, seed: h || 1, ruleset: rulesets[h % rulesets.length], maze: mazes[(h >>> 8) % mazes.length],
      name: "DAILY " + id,
    });
  }

  // Score codes: AM1-<yyyymmdd>-<mode letter><players>-<score>-<check>. The
  // check catches typos and casual edits; it is not tamper-proof.
  const LETTERS = Object.freeze({ classic: "C", benchmark: "B", remix: "R", hallucination: "H", versus: "V" });
  const check = (payload) => (hash(payload + "|astra-man") & 0xfffff).toString(36).toUpperCase().padStart(4, "0");
  function scoreCode({ date, ruleset, players, score }) {
    const payload = `AM1-${date.replace(/-/g, "")}-${LETTERS[ruleset] || "X"}${players}-${Math.max(0, Math.floor(score)).toString(36).toUpperCase()}`;
    return `${payload}-${check(payload)}`;
  }
  function readScoreCode(code) {
    const match = /^(AM1-(\d{8})-([A-Z])([1-4])-([0-9A-Z]+))-([0-9A-Z]{4})$/.exec(String(code || "").trim().toUpperCase());
    if (!match || check(match[1]) !== match[6]) return { valid: false };
    const ruleset = Object.keys(LETTERS).find((key) => LETTERS[key] === match[3]) || null;
    const d = match[2];
    return { valid: true, date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, ruleset, players: Number(match[4]), score: parseInt(match[5], 36) };
  }

  // ---- Unlocks -------------------------------------------------------------------
  const ACCESSORIES = Object.freeze([
    Object.freeze({ id: "bow", name: "BOW", cost: 0, level: 1 }),
    Object.freeze({ id: "visor", name: "COOL SHADES", cost: 0, level: 1 }),
    Object.freeze({ id: "leaf", name: "LEAF CREST", cost: 0, level: 1 }),
    Object.freeze({ id: "antenna", name: "ANTENNA", cost: 250, level: 1 }),
    Object.freeze({ id: "headphones", name: "HEADPHONES", cost: 300, level: 2 }),
    Object.freeze({ id: "halo", name: "HALO", cost: 400, level: 3 }),
    Object.freeze({ id: "crown", name: "CROWN", cost: 600, level: 5 }),
  ]);
  const POWERUP_COSTS = Object.freeze({ "token-beam": 0, "rate-limit": 0, "rag": 0, "scale-up": 0, "context-overflow": 300, "hot-path": 350, "incognito": 450 });
  const LOADOUT_SIZE = 3;

  function defaultProfile() {
    return {
      version: 1, xp: 0, credits: 0, games: 0, arenaWins: 0,
      accessories: ACCESSORIES.filter((a) => a.cost === 0).map((a) => a.id),
      powerUps: Object.keys(POWERUP_COSTS).filter((id) => POWERUP_COSTS[id] === 0),
      equipped: { astra: "default", nova: "default", vega: "default", lyra: "default" },
      loadout: ["token-beam", "rate-limit", "rag"],
      achievements: {}, mazesCleared: [],
    };
  }
  // Accepts anything stored (old, partial or corrupt) and returns a sound profile.
  function normalizeProfile(raw) {
    const base = defaultProfile();
    if (!raw || typeof raw !== "object") return base;
    const list = (value, fallback, valid) => Array.isArray(value) ? [...new Set(value.filter(valid))] : fallback;
    const profile = {
      version: 1,
      xp: Math.max(0, Math.floor(Number(raw.xp)) || 0),
      credits: Math.max(0, Math.floor(Number(raw.credits)) || 0),
      games: Math.max(0, Math.floor(Number(raw.games)) || 0),
      arenaWins: Math.max(0, Math.floor(Number(raw.arenaWins)) || 0),
      accessories: list(raw.accessories, base.accessories, (id) => ACCESSORIES.some((a) => a.id === id)),
      powerUps: list(raw.powerUps, base.powerUps, (id) => id in POWERUP_COSTS),
      equipped: { ...base.equipped },
      loadout: list(raw.loadout, base.loadout, (id) => id in POWERUP_COSTS),
      achievements: raw.achievements && typeof raw.achievements === "object" ? { ...raw.achievements } : {},
      mazesCleared: list(raw.mazesCleared, [], (id) => typeof id === "string"),
    };
    for (const id of base.accessories) if (!profile.accessories.includes(id)) profile.accessories.push(id);
    for (const id of base.powerUps) if (!profile.powerUps.includes(id)) profile.powerUps.push(id);
    for (const skin of Object.keys(base.equipped)) {
      const wanted = raw.equipped && raw.equipped[skin];
      if (wanted === "default" || wanted === "none" || profile.accessories.includes(wanted)) profile.equipped[skin] = wanted;
    }
    profile.loadout = profile.loadout.filter((id) => profile.powerUps.includes(id)).slice(0, LOADOUT_SIZE);
    return profile;
  }
  function loadProfile(storage) {
    try { return normalizeProfile(JSON.parse(storage.getItem(PROFILE_KEY) || "null")); } catch (_) { return defaultProfile(); }
  }
  function saveProfile(storage, profile) {
    try { storage.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; } catch (_) { return false; }
  }

  // Level n needs 400 + 200 (n - 1) more XP than level n - 1.
  function levelInfo(xp) {
    let level = 1, floor = 0, need = 400;
    while (xp >= floor + need) { floor += need; level += 1; need = 400 + 200 * (level - 1); }
    return { level, into: xp - floor, need };
  }

  function buy(profile, kind, id) {
    if (kind === "accessory") {
      const item = ACCESSORIES.find((a) => a.id === id);
      if (!item) return { ok: false, reason: "UNKNOWN" };
      if (profile.accessories.includes(id)) return { ok: false, reason: "OWNED" };
      if (levelInfo(profile.xp).level < item.level) return { ok: false, reason: "LEVEL " + item.level };
      if (profile.credits < item.cost) return { ok: false, reason: "NEED " + item.cost + " CREDITS" };
      profile.credits -= item.cost; profile.accessories.push(id);
      return { ok: true };
    }
    if (kind === "powerup") {
      if (!(id in POWERUP_COSTS)) return { ok: false, reason: "UNKNOWN" };
      if (profile.powerUps.includes(id)) return { ok: false, reason: "OWNED" };
      if (profile.credits < POWERUP_COSTS[id]) return { ok: false, reason: "NEED " + POWERUP_COSTS[id] + " CREDITS" };
      profile.credits -= POWERUP_COSTS[id]; profile.powerUps.push(id);
      return { ok: true };
    }
    return { ok: false, reason: "UNKNOWN" };
  }
  function equip(profile, skin, accessory) {
    if (!(skin in profile.equipped)) return false;
    if (accessory !== "default" && accessory !== "none" && !profile.accessories.includes(accessory)) return false;
    profile.equipped[skin] = accessory;
    return true;
  }
  // Hallucination brings the loadout: up to three owned power-ups.
  function toggleLoadout(profile, id) {
    if (!profile.powerUps.includes(id)) return false;
    const at = profile.loadout.indexOf(id);
    if (at >= 0) { if (profile.loadout.length > 1) profile.loadout.splice(at, 1); return true; }
    if (profile.loadout.length >= LOADOUT_SIZE) profile.loadout.shift();
    profile.loadout.push(id);
    return true;
  }

  // ---- Achievements ------------------------------------------------------------------
  const bundledMazes = () => E.MAPS.filter((map) => !map.id.startsWith("benchmark") && map.id !== "custom").map((map) => map.id);
  const ACHIEVEMENTS = Object.freeze([
    { id: "hello-world", name: "HELLO WORLD", about: "Finish your first game.", credits: 50, test: (t) => t.finished },
    { id: "10k-tokens", name: "10K TOKENS", about: "Score 10,000 in one game.", credits: 100, test: (t) => t.score >= 10000 },
    { id: "50k-tokens", name: "50K TOKENS", about: "Score 50,000 in one game.", credits: 250, test: (t) => t.score >= 50000 },
    { id: "four-of-a-kind", name: "FOUR OF A KIND", about: "Eat four ghosts on one power pellet.", credits: 150, test: (t) => t.pelletGhosts >= 4 },
    { id: "overfit", name: "OVERFIT", about: "Chain eight ghosts in a row.", credits: 200, test: (t) => t.bestChain >= 8 },
    { id: "root-access", name: "ROOT ACCESS", about: "Eat the ROOT bonus.", credits: 200, test: (t) => t.fruits.has("ROOT") },
    { id: "clean-run", name: "CLEAN RUN", about: "Clear a level without getting caught.", credits: 100, test: (t) => t.cleanClears > 0 },
    { id: "world-tour", name: "WORLD TOUR", about: "Clear a level on every bundled maze.", credits: 300, test: (t, profile) => bundledMazes().every((id) => profile.mazesCleared.includes(id)) },
    { id: "benchmarked", name: "BENCHMARKED", about: "Last the full five minutes of a Benchmark Run.", credits: 150, test: (t) => t.finished && t.ruleset === "benchmark" && t.reason === "TIME UP" },
    { id: "new-dataset", name: "NEW DATASET", about: "Swap in five maze halves in one Benchmark Run.", credits: 150, test: (t) => t.halfRefreshes >= 5 },
    { id: "constellation", name: "CONSTELLATION", about: "Link two players with Constellation.", credits: 100, test: (t) => t.constellation },
    { id: "power-user", name: "POWER USER", about: "Collect ten power-ups in one game.", credits: 150, test: (t) => t.powerUps >= 10 },
    { id: "sparkster", name: "SPARKSTER", about: "Cut fifty corners in one game.", credits: 75, test: (t) => t.corners >= 50 },
    { id: "daily-driver", name: "DAILY DRIVER", about: "Finish a daily run.", credits: 100, test: (t) => t.finished && t.daily },
    { id: "full-party", name: "FULL PARTY", about: "Play with four human players.", credits: 100, test: (t) => t.players >= 4 },
    { id: "deep-dream", name: "DEEP DREAM", about: "Climb 500 rows in Sunset.", credits: 250, test: (t) => t.distance >= 500 },
    { id: "chain-256", name: "256", about: "Eat a 256-dot chain in Sunset.", credits: 300, test: (t) => t.bestDotChain >= 256 },
    { id: "arena-champion", name: "ARENA CHAMPION", about: "Win a Versus Arena match.", credits: 200, test: (t) => t.won },
  ].map(Object.freeze));
  // Achievements that need a mode the title doesn't offer (Benchmark Run is hidden,
  // daily runs aren't reachable) stay out of the list until that mode is.
  const NEEDS = Object.freeze({ overfit: "benchmark", benchmarked: "benchmark", "new-dataset": "benchmark", "daily-driver": "daily" });
  function achievementAvailable(achievement, { daily = false } = {}) {
    const need = NEEDS[achievement.id];
    if (!need) return true;
    if (need === "daily") return daily;
    const ruleset = E.RULESETS.get(need);
    return Boolean(ruleset && !ruleset.hidden);
  }

  // Watches one game. Achievements unlock the moment they are earned; XP and
  // credits for the game itself are paid when it ends.
  const humanCount = (game) => (game.players || []).filter((pac) => !pac.bot).length || game.playerCount || 1;
  const humanScore = (game) => (game.players || []).some((pac) => pac.bot)
    ? game.players.reduce((sum, pac) => sum + (pac.bot ? 0 : game.playerScores[pac.index] || 0), 0) : game.score;
  function createTracker(profile) {
    const t = {
      finished: false, reason: null, score: 0, players: 1, ruleset: "classic", daily: false,
      pelletGhosts: 0, bestChain: 0, fruits: new Set(), levelDeaths: 0, cleanClears: 0, halfRefreshes: 0,
      constellation: false, powerUps: 0, corners: 0, distance: 0, bestDotChain: 0, won: false,
    };
    const unlocked = [];
    let done = false;
    function evaluate() {
      for (const achievement of ACHIEVEMENTS) {
        if (profile.achievements[achievement.id] || !achievement.test(t, profile)) continue;
        profile.achievements[achievement.id] = new Date().toISOString().slice(0, 10);
        profile.credits += achievement.credits;
        unlocked.push(achievement);
      }
    }
    function sync(game) {
      // Bots' points and seats don't count toward a human's progress.
      t.score = humanScore(game); t.players = humanCount(game); t.ruleset = game.rulesetId; t.daily = Boolean(game.daily);
      t.powerUps = game.counters ? game.counters.powerUps : 0; t.corners = game.counters ? game.counters.corners : 0;
      const dream = game.ruleData && game.ruleData.hallucination;
      if (dream) { t.distance = Math.max(t.distance, dream.distance || 0); t.bestDotChain = Math.max(t.bestDotChain, dream.bestChain || 0); }
    }
    return {
      onEvent(event, game) {
        if (done) return [];
        const before = unlocked.length;
        sync(game);
        const data = event.data || {};
        switch (event.name) {
          case "frightened": t.pelletGhosts = 0; break;
          case "ghostEaten": t.pelletGhosts += 1; t.bestChain = Math.max(t.bestChain, game.ghostChain); break;
          case "fruitEaten": t.fruits.add(event.data); break;
          case "death": t.levelDeaths += 1; break;
          case "levelClear":
            if (!t.levelDeaths) t.cleanClears += 1;
            t.levelDeaths = 0;
            if (game.map && bundledMazes().includes(game.map.id) && !profile.mazesCleared.includes(game.map.id)) profile.mazesCleared.push(game.map.id);
            break;
          case "halfRefresh": t.halfRefreshes += (data.halves || []).length; break;
          case "constellation": t.constellation = true; break;
          case "gameOver":
            t.finished = true; t.reason = game.result ? game.result.reason : "GAME OVER";
            t.won = Boolean(game.result && game.result.placements && game.result.placements[0] && game.result.placements[0].human && game.result.placements[0].rank === 1);
            break;
        }
        evaluate();
        return unlocked.slice(before);
      },
      // Pays out the game: XP from score and effort, credits from score. A run
      // quit from the menu earns only its score's share, so quitting at once pays nothing.
      finish(game, { quit = false } = {}) {
        if (done) return null;
        done = true;
        sync(game);
        evaluate();
        const before = levelInfo(profile.xp).level;
        const score = humanScore(game);
        const xp = Math.floor(score / 50) + (quit ? 0 : 50 + (game.daily ? 100 : 0));
        const credits = Math.floor(score / 250) + (quit ? 0 : 10);
        profile.xp += xp; profile.credits += credits; profile.games += 1;
        if (!quit && t.won) profile.arenaWins = (profile.arenaWins || 0) + 1;
        return { xp, credits, levelBefore: before, level: levelInfo(profile.xp).level, achievements: unlocked.slice() };
      },
      get unlocked() { return unlocked.slice(); },
      state: t,
    };
  }

  const api = Object.freeze({
    PROFILE_KEY, DAILY_RULESETS, ACCESSORIES, POWERUP_COSTS, LOADOUT_SIZE, ACHIEVEMENTS,
    hash, dateKey, daily, scoreCode, readScoreCode,
    achievementAvailable, humanScore, defaultProfile, normalizeProfile, loadProfile, saveProfile, levelInfo, buy, equip, toggleLoadout, createTracker,
  });
  root.AstraMeta = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
