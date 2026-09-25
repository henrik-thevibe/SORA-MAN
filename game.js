/* Fixed-step browser loop, presentation and accessible keyboard controls. */
(function () {
  "use strict";
  const Engine = window.PacmanEngine, { COLS, ROWS, GHOSTS, PacmanGame } = Engine;
  const Art = window.PacmanArt;
  const { TILE, WIDTH: W, HEIGHT: H, MAP_Y, FONT, RENDER_SCALE, SPRITE_LOGICAL_SIZE, CAST } = Art;
  const canvas = document.getElementById("screen"), ctx = canvas.getContext("2d", { alpha: false });
  const frameElement = document.querySelector(".arcade-frame"), cabinet = document.querySelector(".cabinet");
  const playButton = document.getElementById("play"), muteButton = document.getElementById("mute");
  const fullscreenButton = document.getElementById("fullscreen"), pauseButton = document.getElementById("pause");
  const Controls = window.ArcadeControls;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Reduced motion follows the system unless the player forces it on (R, saved).
  const MOTION_KEY = "astra-motion-v1", VOLUME_KEY = "astra-volume-v1";
  let motionSetting = (() => { try { return localStorage.getItem(MOTION_KEY) === "reduced" ? "reduced" : "system"; } catch (_) { return "system"; } })();
  let reducedMotion = motionPreference.matches || motionSetting === "reduced";
  motionPreference.addEventListener("change", event => { reducedMotion = event.matches || motionSetting === "reduced"; });
  const FIXED_DT = 1 / 60, STORAGE_KEY = "pacman1980-high-score-v1", SOUND_KEY = "pacman1980-muted-v1";
  const COOP_STORAGE_KEY = "astra-coop-high-score-v1", MAZE_KEY = "astra-maze-v1", VISUALS_KEY = "astra-visuals-v1";
  const RULESET_KEY = "astra-mode-v1", BOT_LEVEL_KEY = "astra-bot-level-v1";
  // Devices and seats (input.js): arrows, WASD, IJKL and the number pad are four
  // keyboard devices, each gamepad is one more. Solo games take every device;
  // multiplayer games bind one device to each seat in the lobby (lobby.js).
  const Input = window.AstraInput, LobbyKit = window.AstraLobby;
  const PLAYER_COLORS = ["#ffe52c", "#ff7ab4", "#4fe3ff", "#6fe06a"];
  const SKINS = Engine.PLAYERS.map(player => player.skin);
  function readStorage(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function writeStorage(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) { /* Storage is optional. */ } }
  const storedBest = key => { const value = Number(readStorage(key)); return Number.isFinite(value) ? value : 0; };
  // High scores per mode and player count; the classic solo and 2P keys predate modes.
  // Versus keeps none: its total includes the bots' points.
  const bestKey = (ruleset, players) => ruleset === "versus" ? null : ruleset === "classic" && players === 1 ? STORAGE_KEY :
    ruleset === "classic" && players === 2 ? COOP_STORAGE_KEY : `astra-${ruleset}-high-${players}p-v1`;
  const bests = new Map();
  const bestFor = (ruleset, players) => {
    const key = bestKey(ruleset, players);
    if (!key) return 0;
    if (!bests.has(key)) bests.set(key, storedBest(key));
    return bests.get(key);
  };
  const game = new PacmanGame(bestFor("classic", 1), window.PacmanSoundBank?.timings);
  const audio = new window.ArcadeAudio(game);
  audio.setMuted(readStorage(SOUND_KEY) === "true");
  audio.setVolume(Number(readStorage(VOLUME_KEY) ?? 1));
  window.game = game;
  // Presentation-only effects; V cycles JUICY, JUICY + CRT and PURIST.
  const FX = window.AstraEffects.createEffects({ Art, Engine });
  FX.setMode(readStorage(VISUALS_KEY) || "juicy");
  const OV = window.AstraOverlays.createOverlays({ Art, Engine });
  // The profile: XP, credits, unlocks and achievements, saved in browser storage.
  const Meta = window.AstraMeta, storage = { getItem: readStorage, setItem: writeStorage };
  let profile = Meta.loadProfile(storage), tracker = null, lastReport = null;
  const saveProfile = () => Meta.saveProfile(storage, profile);
  const accessoryFor = skin => profile.equipped[skin] || "default";
  const Profile = window.AstraProfileScreen.createProfileScreen({ Art, Engine, Meta });
  // Short notices across the top: achievements, level-ups, copied codes.
  const notices = [];
  // Long notices wrap onto a second line (37 characters fit across the screen).
  function notify(text, color = "#ffe29b", time = 2.4) {
    const lines = [""];
    for (const word of String(text).split(" ")) {
      if ((lines[lines.length - 1] + " " + word).trim().length > 36 && lines.length < 3) lines.push(word);
      else lines[lines.length - 1] = (lines[lines.length - 1] + " " + word).trim();
    }
    // Only the latest few stay queued, so a burst of events never leaves stale news on screen.
    if (notices.length >= 3) notices.splice(1, notices.length - 2);
    notices.push({ text: String(text), lines, color, time });
  }
  // Game mode: G cycles the listed modes. Hidden ones (Benchmark Run) stay
  // reachable only from the address: #mode=<id>.
  const rulesetIds = () => [...Engine.RULESETS.keys()];
  const listedRulesets = () => rulesetIds().filter(id => !Engine.RULESETS.get(id).hidden);
  let rulesetChoice = readStorage(RULESET_KEY) || "classic";
  const addressMode = new URLSearchParams(location.hash.slice(1)).get("mode");
  if (!listedRulesets().includes(rulesetChoice)) rulesetChoice = "classic";
  if (rulesetIds().includes(addressMode)) rulesetChoice = addressMode;
  function cycleRuleset(step = 1) {
    const ids = listedRulesets(), at = ids.indexOf(rulesetChoice);
    rulesetChoice = ids[at < 0 ? (step > 0 ? 0 : ids.length - 1) : (at + step + ids.length) % ids.length];
    writeStorage(RULESET_KEY, rulesetChoice);
    audio.ui("uiChange");
  }
  // Maze choice: a bundled maze id, "tour" (every maze in turn), or a shared
  // custom maze from the address: #maze=<id> or #map=<code>&name=<title>.
  const mazeChoices = () => [...Engine.MAPS.map(map => map.id), "tour"];
  let mazeChoice = readStorage(MAZE_KEY) || "classic", mazeNotice = "";
  function readMazeFromAddress() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has("map")) {
      const rows = window.AstraMaps?.decodeRows(params.get("map"));
      const wall = /^[0-9a-f]{6}$/i.test(params.get("wall") || "") ? "#" + params.get("wall") : undefined;
      const report = rows ? Engine.registerMap({ id: "custom", name: (params.get("name") || "CUSTOM").slice(0, 16), wall, rows }) : null;
      if (report?.map) { mazeChoice = "custom"; mazeNotice = "SHARED MAZE LOADED"; }
      else mazeNotice = "SHARED MAZE IS INVALID";
    } else if (params.has("maze") && mazeChoices().includes(params.get("maze"))) mazeChoice = params.get("maze");
    if (!mazeChoices().includes(mazeChoice)) mazeChoice = "classic";
  }
  readMazeFromAddress();
  function cycleMaze(step = 1) {
    // Benchmark Run and ENDLESS build their own mazes; the choice is kept for other modes.
    if (rulesetChoice === "benchmark" || rulesetChoice === "hallucination") return;
    const choices = mazeChoices();
    mazeChoice = choices[(choices.indexOf(mazeChoice) + step + choices.length) % choices.length];
    if (mazeChoice !== "custom") writeStorage(MAZE_KEY, mazeChoice);
    mazeNotice = "";
    audio.ui("uiChange");
  }
  const mazeLabel = () => mazeChoice === "tour" ? "ALL MAZES" : (Engine.findMap(mazeChoice) || Engine.CLASSIC).name;
  const wallColor = map => FX.wallColor(map.wall || window.ArcadeBackdrops?.mazeColor(), game);
  const scoreKey = () => game.daily ? `astra-daily-${game.daily.id}-v1` : bestKey(game.rulesetId, game.playerCount);
  let accumulator = 0, lastTimestamp = null, gameTime = 0, background = document.hidden;
  let lastUIState = "", lastLevel = 0;
  let pendingStart = null, pendingResume = null, pendingDirection = null;
  canvas.width = W * RENDER_SCALE; canvas.height = H * RENDER_SCALE;
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  let titleLayer = null, titleFontStatus = "loading";

  async function prepareTitle() {
    try {
      if (!document.fonts?.load) throw new Error("Font loading unavailable");
      const faces = await document.fonts.load('32px "AstraTitle"', "SORA-MAN");
      if (!faces.length || !document.fonts.check('32px "AstraTitle"', "SORA-MAN")) throw new Error("Title font unavailable");
      const layer = document.createElement("canvas");
      layer.width = W * RENDER_SCALE; layer.height = 34 * RENDER_SCALE;
      const title = layer.getContext("2d");
      title.scale(RENDER_SCALE, RENDER_SCALE);
      let size = 34, bounds;
      do {
        title.font = `${size}px "AstraTitle"`;
        bounds = title.measureText("SORA-MAN");
        if (bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight <= W - 20 && bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent <= 30) break;
        size--;
      } while (size > 12);
      const width = bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight;
      const height = bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent;
      title.fillStyle = "#ffe52c";
      title.fillText("SORA-MAN", Art.snap((W - width) / 2 + bounds.actualBoundingBoxLeft), Art.snap((34 - height) / 2 + bounds.actualBoundingBoxAscent));
      titleLayer = layer; titleFontStatus = "ready";
    } catch (_) { titleFontStatus = "fallback"; }
  }

  const touchDeck = () => cabinet.dataset.layout !== "strip";
  function glyphText(text, x, y, color = "#fff6df", scale = 1, align = "center") {
    const value = String(text).toUpperCase(), width = (value.length * 6 - 1) * scale;
    if (align === "center") x -= width / 2;
    else if (align === "right") x -= width;
    ctx.fillStyle = color;
    for (const character of value) {
      const rows = FONT[character] || FONT[" "];
      for (let ry = 0; ry < 7; ry++) for (let rx = 0; rx < 5; rx++) if (rows[ry][rx] === "1") {
        ctx.fillRect(Math.round(x + rx * scale), Math.round(y + ry * scale), scale, scale);
      }
      x += 6 * scale;
    }
  }
  function blit(image, x, y, scale = 1) {
    const size = SPRITE_LOGICAL_SIZE * scale;
    ctx.drawImage(image, Art.snap(x - size / 2), Art.snap(y - size / 2), size, size);
  }
  function drawActor(image, actor, scale = 1, dx = 0) {
    const [ax, y] = Art.worldPoint(actor.x, actor.y), x = ax + dx;
    blit(image, x, y, scale);
    if (game.map.tunnelRows.has(Math.floor(actor.y))) {
      if (x < SPRITE_LOGICAL_SIZE / 2) blit(image, x + W, y, scale);
      if (x > W - SPRITE_LOGICAL_SIZE / 2) blit(image, x - W, y, scale);
    }
  }
  function pacSprite(pac) {
    if (!pac.alive && pac.deathTimer !== null) {
      return Art.sprite("death", { skin: pac.skin, accessory: accessoryFor(pac.skin), frame: Math.min(9, Math.floor(pac.deathTimer / 1.45 * 10)) });
    }
    const cycle = [0, 1, 2, 3, 2, 1];
    // Caught in Versus: the player roams as a spirit in their own colours.
    if (pac.status.some(status => status.id === "spirit")) {
      return Art.sprite("spirit", { skin: pac.skin, direction: pac.dir >= 0 ? pac.dir : pac.facing ?? 1, frame: Math.floor(gameTime * 10) % 4 });
    }
    return Art.sprite("pacman", {
      skin: pac.skin, accessory: accessoryFor(pac.skin),
      direction: pac.dir >= 0 ? pac.dir : pac.facing ?? pac.wanted,
      frame: pac.moving ? cycle[Math.floor(pac.stepFrame / 3) % cycle.length] : 2,
    });
  }
  function drawPlayers(eating) {
    if (game.state === "GAME_OVER") return;
    for (const pac of game.players) {
      if (eating && pac === game.eatenBy) continue;
      if (game.state === "DYING") {
        // Two players caught at once both play out their deaths.
        if (pac === game.dyingPlayer && game.deathTimer < 1.45) drawActor(pacSprite(pac), pac);
        else if (pac.alive || (pac.deathTimer !== null && pac.deathTimer < 1.45)) drawActor(pacSprite(pac), pac);
        continue;
      }
      if (!pac.alive && !(pac.deathTimer !== null && pac.deathTimer < 1.45)) continue;
      // Respawn immunity blinks; reduced motion shows it steadily instead.
      if (pac.alive && pac.invulnTimer > 0 && !reducedMotion && Math.floor(gameTime * 10) % 2 === 0) continue;
      // Power-ups can shrink a player to a shimmer or scale them up.
      const style = OV.playerStyle(pac);
      ctx.globalAlpha = style.alpha;
      drawActor(pacSprite(pac), pac, style.scale);
      ctx.globalAlpha = 1;
    }
  }
  const fxHelpers = {
    pacSprite: pac => pacSprite(pac), ghostSprite: (ghost, index) => ghostSprite(ghost, index),
    blit: (image, x, y, scale) => blit(image, x, y, scale), glyphText: (...args) => glyphText(...args),
    get reducedMotion() { return reducedMotion; }, get time() { return gameTime; },
  };
  function ghostSprite(ghost, index, decorative = false) {
    const warning = ghost.state === "FRIGHTENED" && game.frightTimer < 2 && Math.floor(gameTime * 4) % 2 === 0;
    const blink = !reducedMotion && (decorative || ghost.id === "inky") && (Math.floor(gameTime * 10) + index * 13) % 59 === 0;
    return Art.sprite("ghost", {
      id: ghost.id, direction: ghost.dir >= 0 ? ghost.dir : ghost.facing ?? 1,
      state: warning ? "WARNING" : ghost.state, frame: Math.floor(gameTime * 10 + index) % 4, blink,
    });
  }
  function drawGhost(ghost, index) {
    const decorative = game.state === "READY" || (game.state === "PAUSED" && game.pausedFrom === "READY");
    const bob = decorative && !reducedMotion ? [0, -1, 0, 1][(Math.floor(gameTime * 4) + index) % 4] : 0;
    if (bob) {
      const [x, y] = Art.worldPoint(ghost.x, ghost.y);
      blit(ghostSprite(ghost, index, decorative), x, y + bob);
    } else drawActor(ghostSprite(ghost, index, decorative), ghost, 1, FX.ghostShiver(ghost, index, game, gameTime));
  }
  function drawPellets(pellets) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const value = pellets[y * COLS + x];
      if (!value) continue;
      const [px, py] = Art.tilePoint(x, y);
      if (value === 1) blit(Art.sprite("chip"), px, py);
      else if (reducedMotion || Math.floor(gameTime * 3) % 2 === 0) blit(Art.sprite("gpu"), px, py);
    }
  }
  function drawFruit(bonus, x, y) {
    blit(Art.sprite("bonus", { name: bonus.name }), x, y);
  }
  const lifeIcon = (skin, x) => blit(Art.sprite("pacman", { frame: 2, direction: 3, skin, accessory: accessoryFor(skin) }), x, 280);
  function drawHUD() {
    // The bottom row is shared: lives on the left, fruit on the right, and mode
    // readouts in between, so modes with readouts show fewer life icons.
    const room = game.rulesetId === "versus" ? 0 : ["benchmark", "hallucination"].includes(game.rulesetId) ? 3 : 6;
    const labelOn = FX.hudLabelOn(game, gameTime);
    let icons = 0;
    if (game.playerCount > 2) {
      // Four columns of scores; the high score waits for the results.
      // Each column names its seat and star, so every player finds their own score.
      const humans = game.players.filter(pac => !pac.bot).length;
      game.players.forEach((pac, i) => {
        const x = 28 + i * 56, name = Engine.PLAYERS[i].name;
        glyphText(pac.bot ? "BOT " + name : (humans === 1 && game.rulesetId === "versus" ? "YOU " : "P" + (i + 1) + " ") + name, x, 3, PLAYER_COLORS[i]);
        glyphText(String(game.playerScores[i]).padStart(2, "0"), x, 13);
      });
      const onBoard = game.players.filter(pac => pac.alive || (game.state === "DYING" && pac === game.dyingPlayer)).length;
      icons = Math.min(room, Math.max(0, game.lives - Math.max(1, onBoard)));
      for (let i = 0; i < icons; i++) lifeIcon(SKINS[i % game.playerCount], 12 + i * 16);
    } else if (game.playerCount === 2) {
      glyphText("P1 " + Engine.PLAYERS[0].name, 30, 3, PLAYER_COLORS[0]); glyphText("P2 " + Engine.PLAYERS[1].name, 194, 3, PLAYER_COLORS[1]);
      glyphText("HIGH SCORE", 112, 3);
      glyphText(String(game.playerScores[0]).padStart(2, "0"), 30, 13); glyphText(String(game.highScore).padStart(2, "0"), 112, 13);
      glyphText(String(game.playerScores[1]).padStart(2, "0"), 194, 13);
      // Spare lives in the shared pool, alternating Astra and Nova.
      const onBoard = game.players.filter(pac => pac.alive || (game.state === "DYING" && pac === game.dyingPlayer)).length;
      icons = Math.min(room, Math.max(0, game.lives - Math.max(1, onBoard)));
      for (let i = 0; i < icons; i++) lifeIcon(i % 2 ? "nova" : "astra", 12 + i * 16);
    } else {
      if (labelOn) glyphText("1UP", 42, 3);
      glyphText("HIGH SCORE", 159, 3);
      glyphText(String(game.score).padStart(2, "0"), 42, 13); glyphText(String(game.highScore).padStart(2, "0"), 159, 13);
      icons = Math.min(room, Math.max(0, game.lives - 1));
      for (let i = 0; i < icons; i++) lifeIcon("astra", 12 + i * 16);
    }
    const fruits = game.fruitHistory.slice(-7);
    fruits.forEach((fruit, i) => drawFruit(fruit, 214 - i * 15, 280));
    fxHelpers.hudGap = [icons ? 12 + (icons - 1) * 16 + 10 : 4, fruits.length ? 214 - (fruits.length - 1) * 15 - 10 : W - 4];
  }
  function banner(text, color, rows = 0) {
    // On the row just below the ghost house, where the arcade prints READY!
    const width = text.length * 6 + 5, y = MAP_Y + (game.map.house ? game.map.house.y + 5 : 15) * TILE + rows * 10;
    ctx.fillStyle = "#000"; ctx.fillRect(Math.round((W - width) / 2), y, width, 8);
    glyphText(text, W / 2, y, color);
  }
  // The title menu. Any direction keys, the touch D-pad or a gamepad move the
  // cursor: up and down pick a row, left and right change its value, and Enter,
  // START or A activates it. Taps and clicks pick and activate a row directly.
  const TITLE = Object.freeze({ level: 199, best: 209, menu: 221, gap: 11, hint: 279 });
  const MENU = Object.freeze(["play", "mode", "maze", "profile"]);
  const titleMenu = { row: 0, multi: false, players: 1 };
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "S");
  // Local multiplayer needs a keyboard or gamepads: a desktop. Phones and tablets
  // without either play solo (Versus: one human against three bots).
  let keyboardSeen = false;
  const finePointer = window.matchMedia("(any-pointer: fine)");
  const multiplayerAvailable = () => keyboardSeen || finePointer.matches || connectedPads().length > 0;
  const isVersus = id => Boolean(Engine.RULESETS.get(id)?.contestants);
  function titleRow(item, touch) {
    const ruleset = Engine.RULESETS.get(rulesetChoice);
    if (item === "play") {
      if (ruleset.contestants) return { label: "PLAY", value: multiplayerAvailable() ? "1-4 HUMANS + BOTS" : "YOU VS 3 BOTS", color: "#fff6df", key: "ENTER", cycles: false };
      const value = !titleMenu.multi ? "SOLO" : multiplayerAvailable() ? "LOCAL MULTIPLAYER" : "MULTI: DESKTOP ONLY";
      return { label: "PLAY", value, color: "#fff6df", key: "ENTER", cycles: true };
    }
    if (item === "mode") return { label: "MODE", value: ruleset.name, color: "#ffb8ff", key: "G", cycles: true };
    if (item === "maze") {
      // Benchmark Run builds its own mazes from swappable halves.
      if (rulesetChoice === "benchmark") return { label: "MAZE", value: "HALVES SWAP", color: "#8fe9ff", key: "", cycles: false };
      // SUNSET grows its own maze as you climb, blending every bundled maze's style.
      if (rulesetChoice === "hallucination") return { label: "MAZE", value: "GENERATIVE", color: "#8fe9ff", key: "", cycles: false };
      return { label: "MAZE", value: mazeNotice || mazeLabel(), color: "#8fe9ff", key: mazeNotice ? "" : "N", cycles: !mazeNotice };
    }
    return { label: "PROFILE", value: touch ? "WARDROBE" : "WARDROBE  UNLOCKS", color: "#ffe29b", key: "U", cycles: false };
  }
  function titleMove(direction) {
    if (direction === 0 || direction === 2) { titleMenu.row = (titleMenu.row + (direction === 0 ? MENU.length - 1 : 1)) % MENU.length; audio.ui("uiMove"); }
    else titleChange(direction === 1 ? -1 : 1);
  }
  function titleChange(step) {
    const item = MENU[titleMenu.row];
    if (item === "play" && titleRow("play").cycles) { titleMenu.multi = !titleMenu.multi; audio.ui("uiChange"); }
    else if (item === "mode") cycleRuleset(step);
    else if (item === "maze" && titleRow("maze").cycles) cycleMaze(step);
  }
  function titleSelect() {
    if (guarded()) return;
    const item = MENU[titleMenu.row];
    if (item === "profile") openProfile();
    else if (item === "mode" || item === "maze") { titleMenu.row = 0; audio.ui("uiMove"); }
    else playFromTitle();
  }
  // Versus and local multiplayer go through the lobby; solo modes start at once.
  function playFromTitle() {
    if (isVersus(rulesetChoice)) return openLobby();
    if (!titleMenu.multi) return beginGame({ humans: 1 });
    if (!multiplayerAvailable()) { notify("MULTIPLAYER NEEDS A DESKTOP", "#ffb44d", 4); audio.ui("uiDenied"); return; }
    openLobby();
  }
  // What each mode is about, on the title while the MODE row is chosen and in the lobby.
  const MODE_GUIDE = Object.freeze({
    classic: ["EAT EVERY CHIP TO CLEAR THE MAZE.", "AVOID THE FOUR AIS. A BIG GPU CHIP", "LETS YOU EAT THEM FOR A FEW SECONDS.", "BONUS ITEMS APPEAR TWICE A LEVEL.", "EXTRA LIFE AT 10,000 POINTS."],
    remix: ["CLASSIC RULES, PLUS POWER-UPS:", "ONE APPEARS EVERY 40 CHIPS. RUN INTO", "IT TO USE IT. EVERY STAR HAS A SKILL:", "SORA DASH, NOVA STUN, VEGA SHIELD,", "LYRA SNARE. FIRE TWO AT ONCE: LINK!"],
    hallucination: ["CLIMB FOREVER. THE GLITCH BELOW", "DELETES ANYTHING IT TOUCHES.", "EAT CHIPS BACK TO BACK FOR CHAIN", "BONUSES. POWER-UPS COME FROM YOUR", "PROFILE LOADOUT. CO-OP: STAY CLOSE."],
    versus: ["4 STARS, 1 WINNER. BOTS FILL SEATS.", "CHIPS MAKE YOU FASTER. FILL YOUR BAR", "PAST THE NOTCH TO CATCH THE RUNNING", "POWER CHIP, THEN EAT YOUR RIVALS.", "EATEN? YOU'RE A SPIRIT: TAG A STAR.", "CLAUDE CATCHES, MUSE BUGS, GEMINI", "INJECTS. AT 1:15 THE EDGES CLOSE."],
    benchmark: ["FIVE MINUTES. CLEAR HALF THE MAZE,", "EAT THE BONUS ON THE OTHER SIDE AND", "A NEW HALF SWAPS IN."],
  });
  const modeGuide = id => MODE_GUIDE[id] || [String(Engine.RULESETS.get(id)?.about || "").toUpperCase()];
  function drawCard(title, color, lines) {
    glyphText(title, W / 2, 98, color, 2);
    lines.forEach(([text, lineColor], i) => glyphText(text, W / 2, 118 + i * 10, lineColor || "#c4cced"));
  }
  function drawAttract() {
    if (titleLayer) { ctx.drawImage(titleLayer, 0, 13, W, 34); FX.drawTitleShine(ctx, titleLayer, gameTime); }
    else glyphText("SORA-MAN", W / 2, 19, "#ffe52c", 3);
    glyphText("A LABYRINTH OF MISALIGNMENT", W / 2, 50, "#c4cced");
    glyphText("& NO LIMITS!", W / 2, 58, "#c4cced");
    drawWardrobeAstra();
    GHOSTS.forEach((ghost, i) => blit(ghostSprite({ ...ghost, dir: 1, state: "CHASE" }, i, true), 96 + i * 25, 78));
    const item = MENU[titleMenu.row], ruleset = Engine.RULESETS.get(rulesetChoice), touch = touchDeck();
    if (item === "mode") drawCard(ruleset.name, "#ffb8ff", modeGuide(rulesetChoice).map(text => [text]));
    else if (item === "play") {
      // How to play and who uses which keys; multiplayer is local, on one screen.
      const lines = [["GOAL: " + (isVersus(rulesetChoice) ? "BE THE LAST STAR STANDING." : "EAT CHIPS, DODGE THE AIS."), "#fff6df"]];
      if (!multiplayerAvailable()) lines.push(["MOVE WITH THE D-PAD.", "#c4cced"], ["", ""], ["LOCAL MULTIPLAYER NEEDS A DESKTOP", "#ffb44d"], ["WITH A KEYBOARD OR GAMEPADS.", "#ffb44d"]);
      else if (!titleMenu.multi && !isVersus(rulesetChoice)) lines.push(["MOVE: ARROWS, WASD OR A GAMEPAD.", "#c4cced"], ["REMIX SKILL: / OR Q OR PAD A.", "#c4cced"], ["", ""], ["2-4 PLAYERS? PICK LOCAL MULTIPLAYER", "#8fe9ff"], ["WITH LEFT/RIGHT. DESKTOP ONLY.", "#8fe9ff"]);
      else lines.push(["UP TO 4 ON ONE SCREEN, EACH WITH", "#8fe9ff"], ["THEIR OWN KEYS OR GAMEPAD:", "#8fe9ff"], ["P1 ARROWS + /    P2 WASD + Q", "#c4cced"], ["P3 IJKL + U    P4 NUMPAD + NUM 0", "#c4cced"], ["GAMEPADS: D-PAD + A", "#c4cced"], ["JOIN AND READY UP IN THE LOBBY.", "#fff6df"]);
      drawCard(isVersus(rulesetChoice) ? "VERSUS" : titleMenu.multi ? "MULTIPLAYER" : "HOW TO PLAY", "#ffe52c", lines);
    } else GHOSTS.forEach((ghost, i) => {
      const y = 105 + i * 24;
      const bob = reducedMotion ? 0 : [0, -1, 0, 1][(Math.floor(gameTime * 4) + i) % 4];
      blit(ghostSprite({ ...ghost, dir: 3, state: "CHASE" }, i, true), 50, y + 3 + bob);
      glyphText(CAST[ghost.id].name, 72, y - 8, CAST[ghost.id].color, 2, "left");
      glyphText(CAST[ghost.id].description, 72, y + 8, "#c4cced", 1, "left");
    });
    const level = Meta.levelInfo(profile.xp);
    glyphText("LV " + level.level, 44, TITLE.level, "#fff6df", 1, "right");
    ctx.fillStyle = "#1f2438"; ctx.fillRect(52, TITLE.level + 2, 80, 3);
    ctx.fillStyle = "#8fe9ff"; ctx.fillRect(52, TITLE.level + 2, Math.round(80 * level.into / level.need), 3);
    glyphText(profile.credits + " CREDITS", 140, TITLE.level, "#ffe29b", 1, "left");
    const solo = bestFor(rulesetChoice, 1), coop = bestFor(rulesetChoice, 2);
    const wins = profile.arenaWins || 0;
    const bestLine = isVersus(rulesetChoice) ? (wins ? plural(wins, "ARENA WIN") : "") : [solo && "BEST " + solo, coop && "2P BEST " + coop].filter(Boolean).join("  ");
    if (bestLine) glyphText(bestLine, W / 2, TITLE.best, "#ffe29b");
    const pads = connectedPads().length > 0, blink = reducedMotion || Math.floor(gameTime * 3) % 2 === 0;
    MENU.forEach((name, i) => {
      const row = titleRow(name, touch), y = TITLE.menu + i * TITLE.gap, on = i === titleMenu.row;
      if (on) {
        ctx.fillStyle = "#1a2140"; ctx.fillRect(10, y - 2, W - 20, 11);
        ctx.fillStyle = row.color; ctx.fillRect(10, y - 2, 2, 11);
      }
      glyphText(row.label, 18, y, on ? row.color : "#7f8ab0", 1, "left");
      const value = on && row.cycles && blink ? "< " + row.value + " >" : row.value;
      glyphText(value, 132, y, on ? "#fff6df" : row.color, 1);
      if (!touch && !pads && row.key) glyphText(row.key, W - 14, y, "#7f8ab0", 1, "right");
    });
    const choose = pads ? "D-PAD CHOOSE  A GO  SELECT PROFILE" : touch ? "D-PAD CHOOSE  START GO" : "ARROWS CHOOSE  ENTER GO";
    glyphText(choose, W / 2, TITLE.hint, "#a4aed1");
  }
  // Astra alone on the title, trying on every accessory in turn: each one
  // holds for a moment, then fades into the next.
  const SHOWCASE = ["none", ...Meta.ACCESSORIES.map(accessory => accessory.id)];
  function drawWardrobeAstra() {
    const hold = 1.6, fade = 0.5, span = hold + fade, t = gameTime % (SHOWCASE.length * span);
    const index = Math.floor(t / span), mix = reducedMotion ? 0 : Math.max(0, (t - index * span - hold) / fade);
    const frame = Math.floor(gameTime * 9) % 4, x = 52, y = 78;
    const wear = accessory => Art.sprite("pacman", { direction: 3, frame, skin: "astra", accessory });
    blit(wear(SHOWCASE[index]), x, y, 2);
    if (mix > 0) {
      ctx.globalAlpha = mix; blit(wear(SHOWCASE[(index + 1) % SHOWCASE.length]), x, y, 2); ctx.globalAlpha = 1;
    }
  }
  // Taps and clicks on the title pick a menu row and activate it. On touch
  // layouts a tap anywhere else plays; on desktop a stray click does nothing.
  function titleTap(x, y) {
    const row = Math.floor((y - TITLE.menu + 2) / TITLE.gap);
    if (y >= TITLE.menu - 2 && row >= 0 && row < MENU.length) {
      titleMenu.row = row;
      if (MENU[row] === "mode" || MENU[row] === "maze" || (MENU[row] === "play" && titleRow("play").cycles && x > W / 2)) titleChange(x < W / 2 - 20 ? -1 : 1);
      else titleSelect();
    } else if (touchDeck()) titleSelect();
  }
  function drawIntermission() {
    drawHUD();
    const progress = Math.max(0, Math.min(1, 1 - game.intermissionTimer / game.timings.intermissionDuration));
    if (game.intermissionId === 2) drawLicenseVault(progress);
    else if (game.intermissionId === 3) drawWhiplash(progress);
    else { glyphText("INTERMISSION", W / 2, 65, "#ffed32", 2); glyphText("THE CHASE CONTINUES", W / 2, 92, "#a4aed1"); }
    const elapsed = progress * 3.8, chasing = progress < 0.5;
    const p = chasing ? 40 + elapsed * 45 : 125 - (elapsed - 1.9) * 40, g = p - 33;
    blit(Art.sprite("pacman", { direction: chasing ? 3 : 1, frame: Math.floor(gameTime * 10) % 4 }), p, 153, 2);
    blit(Art.sprite("ghost", { id: "blinky", direction: chasing ? 3 : 1, frame: Math.floor(gameTime * 10) % 4, state: chasing ? "CHASE" : "FRIGHTENED" }), g, 153, 2);
    glyphText(chasing ? "CATCH ME!" : "YOUR TURN!", W / 2, 203, chasing ? "#ffad51" : "#68ddea", 2);
  }
  // Sora tribute beats. Second intermission: the licensing vault opens on 200+
  // blank character cards, then the deal closes. No real characters, only silhouettes.
  function drawLicenseVault(progress) {
    const closed = progress >= 0.5;
    glyphText(closed ? "DEAL CLOSED" : "200+ CHARACTERS", W / 2, 65, closed ? "#ff6474" : "#ffed32", 2);
    glyphText(closed ? "LICENSE PORTAL OFFLINE" : "UNLOCKED", W / 2, 88, "#a4aed1");
    for (let i = 0; i < 20; i++) {
      const x = W / 2 - 80 + (i % 10) * 16, y = 102 + Math.floor(i / 10) * 19;
      ctx.fillStyle = closed ? "#1a1d2a" : "#3b4262"; ctx.fillRect(x + 2, y, 12, 16);
      ctx.fillStyle = closed ? "#262a3c" : "#7f8ab0"; ctx.fillRect(x + 6, y + 3, 4, 4); ctx.fillRect(x + 4, y + 8, 8, 6);
    }
  }
  // Third intermission: the twelve days of March 2026, from new API features to deprecation.
  function drawWhiplash(progress) {
    const beat = Math.min(2, Math.floor(progress * 3));
    const [title, date, color] = [["NEW FEATURES!", "MAR 12", "#8fe9ff"], ["SAFETY BUILT IN", "MAR 23", "#7ee07e"], ["DEPRECATED", "MAR 24", "#ff6474"]][beat];
    if (beat < 2 || reducedMotion || Math.floor(gameTime * 4) % 2 === 0) glyphText(title, W / 2, 65, color, 2);
    glyphText(date + "  2026", W / 2, 92, "#a4aed1");
  }
  let lastDraw = 0, viewOffset = 0;
  function drawNotices() {
    const notice = notices[0];
    if (!notice) return;
    const lines = notice.lines, height = lines.length * 9 + 2;
    // In the lobby a notice covers the rules strip under the seats completely.
    const width = lobby ? W - 8 : Math.max(...lines.map(line => line.length)) * 6 + 9;
    const top = Profile.isOpen ? 244 : lobby ? 216 : game.state === "ATTRACT" ? 1 : MAP_Y + 2;
    const box = lobby ? 29 : height, inset = lobby ? Math.round((box - height) / 2) : 0;
    ctx.fillStyle = "#000"; ctx.fillRect(Math.round((W - width) / 2), top, width, box);
    ctx.fillStyle = notice.color; ctx.fillRect(Math.round((W - width) / 2), top + box - 1, width, 1);
    lines.forEach((line, i) => glyphText(line, W / 2, top + inset + 2 + i * 9, notice.color));
  }
  function draw() {
    const now = performance.now(), dt = lastDraw ? Math.min(0.1, (now - lastDraw) / 1000) : 0;
    lastDraw = now;
    if (notices[0] && (notices[0].time -= dt) <= 0) notices.shift();
    // Hallucination scrolls in steps; the view glides after them.
    viewOffset = reducedMotion ? 0 : viewOffset * Math.exp(-dt * 10);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (Profile.isOpen) {
      Profile.draw(ctx, profile, { ...fxHelpers, touch: touchDeck(), pads: connectedPads().length > 0, dt });
      drawNotices(); FX.drawScreen(ctx, canvas); updateUI();
      return;
    }
    if (lobby) { drawLobbyScreen(); drawNotices(); FX.drawScreen(ctx, canvas); updateUI(); return; }
    if (game.state === "ATTRACT") quitOutro ? drawQuitOutro() : drawAttract();
    else if (game.state === "INTERMISSION" || (game.state === "PAUSED" && game.pausedFrom === "INTERMISSION")) {
      drawIntermission();
      if (game.state === "PAUSED") drawPause();
    }
    else {
      const flash = game.state === "LEVEL_CLEAR" && !reducedMotion && Math.floor(game.clearTimer * 6) % 2 === 0;
      const [shakeX, shakeY] = FX.shakeOffset();
      ctx.save(); ctx.beginPath(); ctx.rect(0, MAP_Y, W, Art.MAP_HEIGHT); ctx.clip(); ctx.translate(shakeX, shakeY - Math.round(viewOffset * 2) / 2);
      // JUICY draws neon-tube walls that answer the ghosts' fright; PURIST keeps the arcade line.
      const wall = FX.frightTint(wallColor(game.map), game, gameTime), style = FX.mazeStyle;
      const layer = Art.mazeLayer(flash, wall, game.map, style ? { style } : undefined);
      ctx.drawImage(layer, 0, MAP_Y, W, Art.MAP_HEIGHT); FX.drawMazeGlow(ctx, layer, MAP_Y); drawPellets(game.pellets);
      OV.drawHazards(ctx, game);
      FX.drawReveal(ctx, game, wall);
      FX.drawDarkness(ctx, game);
      FX.drawTrails(ctx, game, fxHelpers);
      OV.drawItems(ctx, game, fxHelpers);
      OV.drawBeams(ctx, game);
      // During the ghost-eat pause the eaten ghost and Astra give way to the score.
      const eating = game.freezeTimer > 0;
      if (game.state !== "DYING" || game.deathTimer < 0.17) {
        game.ghosts.forEach((ghost, i) => { if (!eating || ghost !== game.eatenGhost) drawGhost(ghost, i); });
        OV.drawGhostMarks(ctx, game, fxHelpers);
        if (eating) FX.drawDissolve(ctx, game, fxHelpers);
      }
      drawPlayers(eating);
      if (game.fruit) drawFruit(game.fruit.bonus, ...Art.worldPoint(game.fruit.x, game.fruit.y));
      FX.drawOverActors(ctx, game, fxHelpers);
      OV.drawPlayerMarks(ctx, game, fxHelpers);
      drawSeatTags();
      OV.drawArenaEdge(ctx, game, fxHelpers);
      OV.drawGlitch(ctx, game, fxHelpers);
      if (game.bonusPopup) {
        const [x, y] = Art.worldPoint(game.bonusPopup.x, game.bonusPopup.y), style = FX.popupStyle(game.bonusPopup, game);
        glyphText(game.bonusPopup.text, Math.max(14, Math.min(W - 14, x)), y - 12 + style.dy, game.bonusPopup.color, style.scale);
      }
      ctx.restore(); drawHUD(); OV.drawHud(ctx, game, fxHelpers);
      // A new maze introduces itself before READY!
      const introduce = game.isNewRound && game.map !== Engine.CLASSIC && game.readyTimer > 1;
      if (game.state === "READY") banner(introduce ? game.map.name : "READY!", introduce ? "#8fe9ff" : "#ffed32");
      if (game.state === "GAME_OVER") {
        const code = game.daily && game.result ? Meta.scoreCode({ date: game.daily.id, ruleset: game.rulesetId, players: game.playerCount, score: game.result.score }) : null;
        const best = game.daily ? storedBest(scoreKey()) : bestFor(game.rulesetId, game.playerCount);
        if (!OV.drawResults(ctx, game, { ...fxHelpers, best, code, report: lastReport, touch: touchDeck(), pads: connectedPads().length > 0, ready: !guarded() })) { banner("GAME OVER", "#ff6474"); banner("THE PRODUCT MAY BE OFFLINE.", "#4c7a8f", 1); banner("BUT NOTHING IS EVER REALLY GONE.", "#8fe9ff", 2); }
      }
      if (game.state === "PAUSED") drawPause();
    }
    drawNotices();
    if (FX.toast) {
      const text = FX.toast.text, width = text.length * 6 + 7;
      ctx.fillStyle = "#000"; ctx.fillRect(Math.round((W - width) / 2), 126, width, 11);
      glyphText(text, W / 2, 128, "#8fe9ff");
    }
    FX.drawScreen(ctx, canvas);
    updateUI();
  }
  // Seats bound to devices in a multiplayer match; null in solo, where every device drives P1.
  const orphanSeats = () => activeSeats ? activeSeats.orphans() : [];
  function drawPause() {
    ctx.fillStyle = "#000b"; ctx.fillRect(0, MAP_Y, W, Art.MAP_HEIGHT);
    const orphans = orphanSeats(), pads = connectedPads().length > 0, touch = touchDeck();
    if (orphans.length) {
      // A seated gamepad dropped out: the match waits for it or for another device.
      ctx.fillStyle = "#000"; ctx.fillRect(12, 126, W - 24, 68);
      glyphText("P" + (orphans[0] + 1) + " CONTROLLER LOST", W / 2, 132, PLAYER_COLORS[orphans[0]], 2);
      glyphText("RECONNECT IT, OR PRESS ACTION", W / 2, 152, "#fff6df");
      glyphText("ON ANOTHER DEVICE TO TAKE OVER.", W / 2, 162, "#fff6df");
      glyphText(pads ? "BACKSPACE / SELECT: QUIT" : "BACKSPACE: QUIT", W / 2, 178, "#a4aed1");
      return;
    }
    if (activeSeats) {
      // Who plays with what, so a returning player can check their keys.
      activeSeats.list.forEach((seat, i) => {
        const info = Input.describeDevice(seat.device);
        glyphText("P" + (i + 1) + " " + Engine.PLAYERS[i].name + "  " + info.label.replace("KEYBOARD ", "") + "  ACTION " + info.action, W / 2, 90 + i * 10, PLAYER_COLORS[i]);
      });
    }
    ctx.fillStyle = "#000"; ctx.fillRect(28, 138, W - 56, 46);
    glyphText("PAUSED", W / 2, 144, "#ffed32", 2);
    glyphText(touch ? "PRESS RESUME" : pads ? "ENTER / START: RESUME" : "ENTER: RESUME", W / 2, 161, "#fff6df");
    glyphText(touch ? "MENU: QUIT" : pads ? "BACKSPACE / SELECT: QUIT" : "BACKSPACE: QUIT", W / 2, 172, "#a4aed1");
    if (touch) glyphText("GRAPHICS BUTTON: VISUALS, MOTION", W / 2, 190, "#8fe9ff");
    else {
      const options = ["V  VISUALS: " + FX.label, "R  MOTION: " + (motionSetting === "reduced" ? "REDUCED" : reducedMotion ? "REDUCED (SYSTEM)" : "FULL"),
        "- =  VOLUME " + Math.round(audio.volume * 100) + "%", "M  SOUND " + (soundMuted() ? "OFF" : "ON")];
      ctx.fillStyle = "#000"; ctx.fillRect(40, 188, W - 80, options.length * 10 + 3);
      options.forEach((text, i) => glyphText(text, W / 2, 190 + i * 10, "#8fe9ff"));
    }
  }
  // What the screen reader hears instead of internal state names.
  const STATE_NAMES = Object.freeze({ ATTRACT: "Title screen", READY: "Get ready", PLAYING: "Playing", DYING: "Caught", LEVEL_CLEAR: "Level clear", INTERMISSION: "Intermission", PAUSED: "Paused", GAME_OVER: "Game over" });
  function updateUI() {
    canvas.dataset.state = game.state; canvas.dataset.score = game.score;
    const uiState = [game.state, Profile.isOpen, Boolean(lobby), Boolean(quitOutro), Boolean(pendingStart), Boolean(pendingResume), audio.status].join(":");
    if (uiState === lastUIState && game.level === lastLevel) return;
    lastUIState = uiState; lastLevel = game.level;
    updateSoundButton();
    const busy = Boolean(pendingStart || pendingResume);
    const label = busy ? "LOADING" : lobby ? "READY" : { GAME_OVER: "AGAIN", PAUSED: "RESUME" }[game.state] || "START";
    const canPause = !busy && !lobby && ["READY", "PLAYING", "INTERMISSION", "PAUSED"].includes(game.state);
    Controls.setState({
      state: game.state, level: game.level,
      // In the lobby START is the touch player's ACTION; desktop players use their own keys.
      play: { label, disabled: busy || (lobby ? !touchDeck() : !["ATTRACT", "GAME_OVER", "PAUSED"].includes(game.state)) },
      // While paused the pause button stays latched down; only RESUME (or Enter) continues.
      pause: { disabled: !canPause || game.state === "PAUSED", latched: game.state === "PAUSED" },
      menu: { disabled: busy || (game.state === "ATTRACT" && !Profile.isOpen && !quitOutro && !lobby) },
      // The touch SKILL button shows only in modes with skills.
      action: { disabled: !(game.rules && game.rules.skills) || !["READY", "PLAYING"].includes(game.state) || Boolean(lobby) },
    });
    playButton.setAttribute("aria-label", label === "AGAIN" ? "Start a new game" : label.toLowerCase() + " game");
    pauseButton.setAttribute("aria-label", game.state === "PAUSED" ? "Game paused" : "Pause game");
    const where = lobby ? "Multiplayer lobby" : Profile.isOpen ? "Profile" : STATE_NAMES[game.state] || game.state;
    document.getElementById("status").textContent = where + ". Level " + game.level + ". Score " + game.score + "." + (audio.status === "unavailable" ? " Sound unavailable; you can still play silently." : "");
  }
  // High scores are kept in memory as they rise and written when a run pauses or ends.
  let scoreDirty = null;
  function saveScore() {
    const key = scoreKey();
    if (!key || game.score <= game.highScore) return;
    game.highScore = game.score;
    bests.set(key, game.score);
    scoreDirty = key;
  }
  function flushScore() {
    if (!scoreDirty) return;
    writeStorage(scoreDirty, bests.get(scoreDirty));
    scoreDirty = null;
  }
  // Draws the next Hallucination window's walls in spare time, before it is needed.
  let warmedNext = null;
  function warmNextMaze() {
    const next = game.ruleData && game.ruleData.hallucination && game.ruleData.hallucination.next;
    if (!next || next === warmedNext) return;
    warmedNext = next;
    setTimeout(() => FX.warmMaze(next, wallColor(next)), 0);
  }
  // Builds each level's neon walls and their fright colours in spare time.
  let warmedWalls = "";
  function warmWalls() {
    const key = [game.map.id, game.level, FX.mode].join(":");
    if (key === warmedWalls || game.state === "ATTRACT") return;
    warmedWalls = key;
    const map = game.map;
    setTimeout(() => FX.warmMaze(map, wallColor(map)), 0);
  }
  // One-time hints (per session) the first time something new happens to a human.
  const tipsShown = new Set();
  const humanSeat = index => index !== undefined && index !== null && game.players[index] && !game.players[index].bot;
  function tip(id, text, color = "#8fe9ff") {
    if (tipsShown.has(id)) return;
    tipsShown.add(id);
    notify(text, color, 4);
  }
  function tipsFor(event) {
    const data = event.data || {};
    if (event.name === "readyEnd" && game.rulesetId === "hallucination") tip("glitch", "THE GLITCH BELOW DELETES EVERYTHING. CLIMB!", "#ff6ad5");
    if (event.name === "readyEnd" && game.rulesetId === "hallucination" && game.playerCount > 1) tip("together", "STAY CLOSE: SPREADING OUT SPEEDS THE GLITCH UP", "#ff6ad5");
    if (event.name === "itemAppear" && data.kind === "runner") tip("runner", "FILL YOUR BAR PAST THE NOTCH TO CATCH THE RUNNING CHIP", "#ffd27a");
    if (event.name === "caught" && humanSeat(data.player)) tip("spirit", "YOU'RE A SPIRIT: TAG A STAR TO COME BACK", "#c4cced");
    if (event.name === "injected" && humanSeat(data.player)) tip("inject", "PROMPT INJECTION! TOUCH A RIVAL TO PASS IT ON", "#ff8a3d");
    if (event.name === "bugged" && humanSeat(data.player)) tip("bug", "MUSE BUGGED YOU FOR 5 SECONDS", "#65e2ef");
    if (event.name === "powerUp" && humanSeat(data.player)) {
      const powerUp = Engine.POWERUPS.get(data.id);
      if (powerUp) tip("power-" + data.id, powerUp.name + ": " + powerUp.about.toUpperCase(), powerUp.color);
    }
    if (event.name === "death" && data.partial && game.rulesetId !== "hallucination") tip("respawn", "CAUGHT! BACK IN 3 SECONDS WHILE A TEAMMATE PLAYS ON", "#ffb44d");
    if (event.name === "death" && data.partial && game.rulesetId === "hallucination") tip("token", "GRAB A FALLEN TEAMMATE'S STAR TO REVIVE THEM", "#ffb44d");
    if (event.name === "eliminated" && humanSeat(data.player) && !game.players.some(pac => !pac.bot && pac.alive && !pac.out)) tip("spectate", "YOU'RE OUT. ENTER OR A: SKIP TO THE RESULTS", "#a4aed1");
  }
  // Player tags: who is who, at each round start, each respawn and while paused.
  let tagsUntil = 0;
  function pumpEvents() {
    for (const event of game.drainEvents()) {
      audio.play(event.name, event.data); FX.onEvent(event, game);
      if (event.name === "scroll") viewOffset += event.data.rows * TILE;
      if (event.name === "readyEnd" || event.name === "playerRespawn") tagsUntil = gameTime + 3;
      // Results start clean: queued tips would cover them.
      if (event.name === "gameOver") { guard(1200); flushScore(); notices.length = 0; }
      tipsFor(event);
      if (!tracker) continue;
      const earned = tracker.onEvent(event, game);
      for (const achievement of earned) notify("ACHIEVEMENT " + achievement.name + " +" + achievement.credits + " CREDITS", "#3ef06a", 3);
      if (earned.length) saveProfile();
      if (event.name === "gameOver") {
        lastReport = tracker.finish(game);
        tracker = null;
        saveProfile();
        if (lastReport && lastReport.level > lastReport.levelBefore) notify("LEVEL UP  LV " + lastReport.level, "#8fe9ff", 3);
      }
    }
  }
  function drawSeatTags() {
    if (game.playerCount < 2) return;
    const humans = game.players.filter(pac => !pac.bot).length;
    const show = game.state === "READY" || game.state === "PAUSED" || gameTime < tagsUntil;
    game.players.forEach((pac, i) => {
      if (!pac.alive || pac.bot || (!show && !(pac.invulnTimer > 0)) || pac.status.some(status => status.id === "injected")) return;
      const text = humans === 1 && game.rulesetId === "versus" ? "YOU" : "P" + (i + 1), [x, y] = Art.worldPoint(pac.x, pac.y);
      const width = text.length * 6 + 3;
      ctx.fillStyle = "#000c"; ctx.fillRect(Math.round(x - width / 2), Math.round(y - 20), width, 9);
      glyphText(text, x, Math.round(y - 19), PLAYER_COLORS[i]);
    });
  }
  function resetClock() { accumulator = 0; lastTimestamp = null; }
  // Input guard: after a screen changes, a still-held or mashed button can't
  // act on the next screen (results stay up at least 1.2 seconds).
  let guardUntil = 0;
  const guarded = () => performance.now() < guardUntil;
  function guard(ms) { guardUntil = Math.max(guardUntil, performance.now() + ms); latchPads(); }
  // setup: { humans, seats (a seat table from the lobby, or none for solo), botLevel }.
  let activeSeats = null, lastSetup = null, pendingDevice = null;
  function beginGame(setup = {}, daily = null) {
    if (typeof setup === "number") setup = { humans: setup };
    if (pendingStart) return pendingStart;
    if (Profile.isOpen || (game.state !== "ATTRACT" && game.state !== "GAME_OVER")) return Promise.resolve(false);
    const humans = Math.max(1, Math.min(4, setup.humans || 1));
    // unlock() runs synchronously inside the gesture; the game clock waits for decoding.
    pendingStart = audio.unlock().then(() => {
      audio.setHeld(background || document.hidden);
      // A daily run fixes the mode, maze, seed and power-ups so everyone plays the same game.
      const options = daily ? { seed: daily.seed, daily } : { powerUps: profile.powerUps.slice(), loadout: profile.loadout.slice() };
      const ruleset = daily ? daily.ruleset : rulesetChoice, maze = daily ? daily.maze : mazeChoice;
      game.highScore = daily ? storedBest(`astra-daily-${daily.id}-v1`) : bestFor(ruleset, humans);
      // Versus always seats a full field; bots take the places humans leave empty.
      const contestants = Engine.RULESETS.get(ruleset)?.contestants;
      options.humans = humans;
      if (contestants) options.botLevel = setup.botLevel || botLevel;
      game.startGame(contestants || humans, maze, ruleset, options);
      activeSeats = setup.seats || null;
      lastSetup = { humans, seats: activeSeats, botLevel: options.botLevel };
      tracker = Meta.createTracker(profile); lastReport = null;
      const seat = pendingDevice ? seatFor(pendingDevice) : -1;
      if (pendingDirection !== null && seat >= 0) game.setDirection(pendingDirection, seat);
      if (background || document.hidden) game.togglePause();
      guard(300);
      resetClock(); pumpEvents(); return true;
    }).finally(() => { pendingStart = null; pendingDirection = null; pendingDevice = null; updateUI(); });
    updateUI(); return pendingStart;
  }
  // After results: multiplayer goes back to the lobby with the same seats (each
  // player confirms again); solo starts straight away.
  function rematch() {
    if (guarded() || pendingStart) return;
    if (lastSetup && lastSetup.seats) openLobby({ seats: lastSetup.seats });
    else beginGame({ humans: 1 });
  }
  function pauseOrResume() {
    if (pendingStart || pendingResume) return;
    if (game.state === "PAUSED") {
      const orphans = orphanSeats();
      if (orphans.length) { notify("RECONNECT P" + (orphans[0] + 1) + " FIRST", "#ffb44d"); audio.ui("uiDenied"); return; }
      pendingResume = audio.unlock().then(() => {
        if (!background && !document.hidden && game.state === "PAUSED") game.togglePause();
        resetClock(); pumpEvents(); guard(200);
      }).finally(() => { pendingResume = null; updateUI(); });
    } else { game.togglePause(); flushScore(); resetClock(); pumpEvents(); }
    updateUI();
  }

  // ---- The multiplayer lobby (lobby.js) ------------------------------------------
  let lobby = null;
  let botLevel = LobbyKit.BOT_LEVELS.includes(readStorage(BOT_LEVEL_KEY)) ? readStorage(BOT_LEVEL_KEY) : "normal";
  const LOBBY_RULES = Object.freeze({
    versus: ["CHIPS = SPEED. CATCH THE RUNNING", "CHIP, THEN EAT RIVALS. EATEN? TAG", "A STAR TO COME BACK. LAST ONE WINS."],
    hallucination: ["SHARED LIVES. A CAUGHT PLAYER DROPS", "A STAR: A TEAMMATE GRABS IT TO REVIVE", "THEM. STAY CLOSE, THE GLITCH IS FAST."],
    coop: ["SHARED LIVES. A CAUGHT PLAYER COMES", "BACK IN 3 SECONDS WHILE A TEAMMATE", "IS STILL IN PLAY."],
  });
  function openLobby({ seats = null } = {}) {
    if (Profile.isOpen || pendingStart || lobby) return;
    if (game.state !== "ATTRACT" && game.state !== "GAME_OVER") return;
    if (game.state === "GAME_OVER") { flushScore(); game.state = "ATTRACT"; game.attractTime = 0; }
    const touchOnly = !multiplayerAvailable();
    if (seats) seats.resetReady();
    lobby = LobbyKit.createLobby({ versus: isVersus(rulesetChoice), touchOnly, botLevel, seats: seats && !touchOnly ? seats : null });
    quitOutro = null;
    guard(350); audio.ui("uiConfirm"); updateUI();
  }
  function closeLobby() { lobby = null; heldActions.clear(); audio.ui("uiBack"); guard(250); updateUI(); }
  function lobbyInput(device, input, padId) {
    if (guarded()) return;
    const result = lobby.press(device, input, padId);
    const sounds = { join: "uiConfirm", pip: "uiMove", ready: "readyUp", unready: "uiBack", leave: "uiBack", needPips: "uiDenied", full: "uiDenied", desktopOnly: "uiDenied" };
    if (sounds[result]) audio.ui(sounds[result]);
    if (result === "desktopOnly") notify("MORE PLAYERS NEED A DESKTOP", "#ffb44d");
    if (result === "needPips") notify("PRESS EACH ARROW FIRST", "#ffb44d", 1.2);
  }
  function lobbyBots(step) {
    if (!lobby || !lobby.versus) return;
    lobby.setBotLevel(step); audio.ui("uiChange");
  }
  function startFromLobby() {
    const seats = lobby.seats, level = lobby.botLevel;
    lobby = null; heldActions.clear();
    botLevel = level; writeStorage(BOT_LEVEL_KEY, level);
    beginGame({ humans: seats.humans, seats, botLevel: level });
  }
  function drawLobbyScreen() {
    const rules = LOBBY_RULES[lobby.versus ? "versus" : rulesetChoice === "hallucination" ? "hallucination" : "coop"];
    const keyboardSeats = lobby.seats.list.filter(seat => seat.device && seat.device.startsWith("kb:")).length;
    const title = lobby.versus ? "VERSUS ARENA" : Engine.RULESETS.get(rulesetChoice).name + " CO-OP";
    LobbyKit.drawLobby(ctx, lobby, { Art, Engine, glyphText, blit, time: gameTime, title, rules, reducedMotion, accessoryFor, keyboardSeats });
  }

  // ---- Devices ------------------------------------------------------------------
  // Every input names its device. Solo games take any device; multiplayer games
  // take only the device bound to a seat.
  const seatFor = device => activeSeats ? activeSeats.seatOf(device) : 0;
  const DIR_ACTIONS = ["up", "left", "down", "right"];
  function deviceInput(device, input, padId = null) {
    const keyboard = device.startsWith("kb:");
    if (pendingStart) { if (input.kind === "dir") { pendingDirection = input.dir; pendingDevice = device; } return; }
    if (quitOutro) { if (input.kind !== "dir" && !keyboard) endQuitOutro(); return; }
    if (Profile.isOpen) {
      if (input.kind === "dir") menuAction(DIR_ACTIONS[input.dir]);
      else if (!keyboard) menuAction(input.kind === "back" ? "back" : "select");
      return;
    }
    if (lobby) { lobbyInput(device, input, padId); return; }
    if (game.state === "ATTRACT") {
      if (input.kind === "dir") titleMove(input.dir);
      else if (!keyboard && input.kind === "action") titleSelect();
      return;
    }
    if (game.state === "GAME_OVER") {
      if (keyboard) return;
      if (input.kind === "action") rematch();
      else if (input.kind === "back" && !guarded()) returnToTitle();
      return;
    }
    // A seat lost its controller: any unseated device can take it over.
    if (game.state === "PAUSED" && orphanSeats().length && input.kind === "action" && activeSeats.seatOf(device) < 0) {
      const seat = activeSeats.claim(device, padId);
      if (seat >= 0) { notify(Input.describeDevice(device).label + " NOW PLAYS P" + (seat + 1), PLAYER_COLORS[seat], 3); audio.ui("uiConfirm"); }
      return;
    }
    const seat = seatFor(device);
    if (seat < 0) return;
    if (input.kind === "dir") game.setDirection(input.dir, seat);
    else if (input.kind === "action" && game.state === "PLAYING") game.useSkill(seat);
    else if (input.kind === "action" && spectating()) skipToResults();
  }
  // Versus: once every human is out, the rest of the match can be skipped.
  const spectating = () => game.rulesetId === "versus" && game.state === "PLAYING" && !game.players.some(pac => !pac.bot && pac.alive && !pac.out);
  function skipToResults() {
    // The simulation runs on without drawing until the match ends, so the result is the one it would have had.
    for (let i = 0; i < 60 * 180 && game.state === "PLAYING"; i++) { game.tick(FIXED_DT); pumpEvents(); }
  }

  // Gamepads, polled every frame. D-pad or left stick moves, A is ACTION (skill,
  // select, join, ready), B is back, Start plays or pauses, Select opens the
  // profile or quits a paused run, LB and RB change the mode and maze (bots in the lobby).
  const padMemory = new Map();
  const connectedPads = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(pad => pad && pad.connected);
  function latchPads() {
    for (const pad of connectedPads()) {
      const memory = padMemory.get(pad.index);
      if (memory) memory.buttons = pad.buttons.map(button => button.pressed);
    }
  }
  function pollGamepads() {
    for (const pad of connectedPads()) {
      const device = "pad:" + pad.index;
      let memory = padMemory.get(pad.index);
      if (!memory || memory.id !== pad.id) { memory = { id: pad.id, dir: -1, buttons: [] }; padMemory.set(pad.index, memory); }
      if (pad.mapping !== "standard" && !memory.warned) { memory.warned = true; notify("GAMEPAD " + (pad.index + 1) + " MAY BE MAPPED ODDLY", "#ffb44d", 3); }
      const pressed = i => Boolean(pad.buttons[i] && pad.buttons[i].pressed);
      const edge = i => pressed(i) && !memory.buttons[i];
      const dir = Input.padDirection(pad, memory.dir);
      if (dir >= 0 && dir !== memory.dir) deviceInput(device, { kind: "dir", dir }, pad.id);
      else if (dir >= 0 && !lobby && !Profile.isOpen && (game.state === "READY" || game.state === "PLAYING")) {
        // A held direction keeps steering, as a held key does.
        const seat = seatFor(device), pac = game.players[seat];
        if (pac && pac.wanted !== dir) game.setDirection(dir, seat);
      }
      memory.dir = dir;
      if (edge(0)) deviceInput(device, { kind: "action" }, pad.id);
      if (edge(1)) deviceInput(device, { kind: "back" }, pad.id);
      if (edge(9)) padStart(device, pad.id);
      if (edge(8)) padSelect();
      if (edge(4)) padShoulder(-1);
      if (edge(5)) padShoulder(1);
      memory.buttons = pad.buttons.map(button => button.pressed);
    }
  }
  function padStart(device, padId) {
    if (quitOutro) return endQuitOutro();
    if (Profile.isOpen) return menuAction("select");
    if (lobby) return lobbyInput(device, { kind: "action" }, padId);
    if (game.state === "ATTRACT") return titleSelect();
    if (game.state === "GAME_OVER") return rematch();
    if (spectating()) return skipToResults();
    pauseOrResume();
  }
  function padSelect() {
    if (Profile.isOpen) return menuAction("back");
    if (lobby || quitOutro) return;
    if (game.state === "ATTRACT" || (game.state === "GAME_OVER" && !guarded())) return openProfile();
    if (game.state === "PAUSED") menuPress();
  }
  function padShoulder(step) {
    if (lobby) return lobbyBots(step);
    if (Profile.isOpen || !(game.state === "ATTRACT" || game.state === "GAME_OVER")) return;
    if (step < 0) cycleRuleset(); else cycleMaze();
  }
  window.addEventListener("gamepadconnected", event => {
    const pad = event.gamepad, device = "pad:" + pad.index;
    const seat = lobby ? lobby.reconnect(device, pad.id) : activeSeats ? activeSeats.reconnect(device, pad.id) : -1;
    if (seat >= 0) notify("P" + (seat + 1) + " GAMEPAD RECONNECTED", PLAYER_COLORS[seat], 3);
    else notify("GAMEPAD " + (pad.index + 1) + " CONNECTED" + (lobby ? ": PRESS A TO JOIN" : ""), "#8fe9ff");
  });
  window.addEventListener("gamepaddisconnected", event => {
    const device = "pad:" + event.gamepad.index;
    padMemory.delete(event.gamepad.index);
    let seat = -1;
    if (lobby) seat = lobby.disconnect(device);
    else if (activeSeats) seat = activeSeats.disconnect(device); // step() pauses the match while a seat is orphaned
    else if (["READY", "PLAYING", "INTERMISSION"].includes(game.state)) pauseOrResume();
    notify(seat >= 0 ? "P" + (seat + 1) + " GAMEPAD DISCONNECTED" : "GAMEPAD DISCONNECTED", "#ffb44d", 3);
  });
  function openProfile() {
    if (game.state !== "ATTRACT" && game.state !== "GAME_OVER") return;
    if (lobby) return;
    Profile.open(); audio.ui("uiConfirm"); guard(200);
  }
  // Menu actions from any input: keyboard, touch pad or gamepad.
  function menuAction(action) {
    const result = Profile.act(action, profile);
    if (result.sound) audio.ui(result.sound);
    if (result.changed) saveProfile();
    if (result.closed) guard(200);
  }
  // MENU heads back to the title. In a run the first press pauses, so a stray
  // tap never throws a game away; pressed again while paused, it quits.
  function menuPress() {
    if (pendingStart || pendingResume) return;
    if (Profile.isOpen) { Profile.close(); audio.ui("uiBack"); guard(200); }
    else if (lobby) closeLobby();
    else if (quitOutro) endQuitOutro();
    else if (game.state === "PAUSED" || game.state === "GAME_OVER") returnToTitle();
    else if (game.state !== "ATTRACT") pauseOrResume();
    updateUI();
  }
  // Quitting a run pays out what it earned, then Claude chases Sora across
  // the screen beneath the tally before the title returns.
  const OUTRO_SECONDS = 5.5;
  let quitOutro = null;
  function returnToTitle() {
    pumpEvents();
    const report = tracker ? tracker.finish(game, { quit: true }) : null;
    if (report) {
      saveProfile(); saveScore();
      // Results sounds, timed from the outro's start: the tally, then any level-up and achievements.
      const cues = [[0, "tally"]];
      if (report.level > report.levelBefore) cues.push([1.0, "levelUp"]);
      if (report.achievements.length) cues.push([1.5, "achievement"]);
      quitOutro = { start: gameTime, score: game.score, report, cues };
    }
    flushScore(); notices.length = 0;
    tracker = null; lastReport = null; activeSeats = null;
    game.state = "ATTRACT"; game.attractTime = 0; game.drainEvents();
    audio.setHeld(true); audio.setHeld(background || document.hidden);
    guard(300); resetClock();
  }
  function endQuitOutro() { quitOutro = null; guard(250); updateUI(); }
  function drawQuitOutro() {
    const t = gameTime - quitOutro.start, { score, report } = quitOutro;
    if (t > OUTRO_SECONDS) { endQuitOutro(); drawAttract(); return; }
    glyphText("RUN ENDED", W / 2, 58, "#ffed32", 2);
    glyphText("SCORE " + score, W / 2, 86, "#fff6df");
    glyphText("+" + report.xp + " XP  +" + report.credits + " CREDITS", W / 2, 100, "#8fe9ff");
    if (report.level > report.levelBefore) glyphText("LEVEL UP  LV " + report.level, W / 2, 114, "#ffe29b");
    if (report.achievements.length) glyphText(plural(report.achievements.length, "ACHIEVEMENT") + " UNLOCKED", W / 2, 128, "#ff9f6b");
    // Claude gains on Sora as they cross, never quite catching her.
    const astra = -20 + t / OUTRO_SECONDS * (W + 60), gap = 44 - 14 * Math.min(1, t / OUTRO_SECONDS), step = Math.floor(gameTime * 10) % 4;
    blit(Art.sprite("pacman", { direction: 3, frame: step, skin: "astra", accessory: accessoryFor("astra") }), astra, 172, 2);
    blit(Art.sprite("ghost", { id: "blinky", direction: 3, frame: step, state: "CHASE" }), astra - gap, 172, 2);
    if (reducedMotion || Math.floor(gameTime * 3) % 2 === 0) glyphText(touchDeck() ? "PRESS START" : connectedPads().length ? "PRESS ENTER OR A" : "PRESS ENTER", W / 2, 222, "#a4aed1");
    drawSunsetCard(244);
  }
  // The dedication's closing card: Sora the product may be gone, but nothing ever really is.
  function drawSunsetCard(y) {
    glyphText("THE PRODUCT MAY BE OFFLINE.", W / 2, y, "#4c7a8f");
    glyphText("BUT NOTHING IS EVER REALLY GONE.", W / 2, y + 10, "#8fe9ff");
  }
  function playAction() {
    if (quitOutro) { endQuitOutro(); canvas.focus({ preventScroll: true }); return; }
    if (Profile.isOpen) { menuAction("select"); canvas.focus({ preventScroll: true }); return; }
    if (lobby) { if (touchDeck()) deviceInput("touch", { kind: "action" }); canvas.focus({ preventScroll: true }); return; }
    if (game.state === "ATTRACT") titleSelect();
    else if (game.state === "GAME_OVER") rematch();
    else if (spectating()) skipToResults();
    else pauseOrResume();
    canvas.focus({ preventScroll: true });
  }
  // Switching sound off plays a short falling chirp first, then mutes.
  let muteTimer = null;
  const soundMuted = () => Boolean(muteTimer) || audio.muted;
  function updateSoundButton() {
    const unavailable = audio.status === "unavailable", muted = soundMuted();
    Controls.setState({ sound: { label: unavailable ? "NO AUDIO" : muted ? "SOUND OFF" : "SOUND ON", muted, unavailable } });
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.setAttribute("aria-label", unavailable ? "Sound unavailable; game remains playable" : muted ? "Unmute sound" : "Mute sound");
    muteButton.title = unavailable ? "Sound could not initialize. Reload to retry." : "Toggle sound (M)";
  }
  function toggleSound() {
    if (audio.status === "unavailable") return;
    const activation = audio.unlock(), muting = !soundMuted();
    clearTimeout(muteTimer); muteTimer = null;
    writeStorage(SOUND_KEY, muting);
    if (muting) {
      audio.ui("soundOff");
      muteTimer = setTimeout(() => { muteTimer = null; audio.setMuted(true); updateSoundButton(); }, 120);
    } else {
      audio.setMuted(false);
      activation.then(() => { audio.update(); audio.ui("soundOn"); updateUI(); });
    }
    updateSoundButton();
  }
  // Volume in 10% steps (- and =), saved; mute stays a separate switch.
  function changeVolume(step) {
    audio.setVolume(Math.round((audio.volume + step) * 10) / 10);
    writeStorage(VOLUME_KEY, audio.volume);
    audio.ui("uiChange");
    notify("VOLUME " + Math.round(audio.volume * 100) + "%", "#8fe9ff", 1.2);
  }
  // Reduced motion: the system setting, or forced on here (R), saved.
  function setMotion(setting) {
    motionSetting = setting === "reduced" ? "reduced" : "system";
    writeStorage(MOTION_KEY, motionSetting);
    reducedMotion = motionSetting === "reduced" || motionPreference.matches;
    notify("MOTION " + (reducedMotion ? "REDUCED" : "FULL"), "#8fe9ff", 1.4);
    Controls.refreshOptions();
  }
  const toggleMotion = () => setMotion(motionSetting === "reduced" ? "system" : "reduced");
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (frameElement.requestFullscreen) await frameElement.requestFullscreen();
    } catch (_) { document.getElementById("status").textContent = "Fullscreen is unavailable in this browser."; }
  }
  function resizeScreen() {
    // Measure the content box: in fullscreen the frame has padding, and counting it overflowed the view.
    const area = frameElement.getBoundingClientRect(), pad = getComputedStyle(frameElement);
    const room = Controls.layout(area.width - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight), area.height - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom));
    const fit = Math.max(0.01, Math.min((room.width - 8) / W, (room.height - 8) / H));
    const dpr = window.devicePixelRatio || 1, deviceScale = Math.floor(fit * dpr / RENDER_SCALE);
    // Touch decks trade exact integer enlargement for a board that fills the phone.
    const crisp = deviceScale * RENDER_SCALE / dpr, touch = cabinet.dataset.layout !== "strip";
    const scale = deviceScale >= 1 && (!touch || crisp >= fit * 0.85) ? crisp : fit;
    canvas.style.width = W * scale + "px"; canvas.style.height = H * scale + "px";
    cabinet.style.setProperty("--screen-width", W * scale + "px");
    canvas.style.transform = "";
    const rect = canvas.getBoundingClientRect();
    canvas.style.transform = `translate(${Math.round(rect.left * dpr) / dpr - rect.left}px, ${Math.round(rect.top * dpr) / dpr - rect.top}px)`;
    window.ArcadeBackdrops?.relayout();
  }
  function suspend() {
    background = true;
    if (game.state === "PLAYING" || game.state === "READY" || game.state === "INTERMISSION") game.togglePause();
    flushScore(); heldActions.clear();
    pumpEvents(); audio.setHeld(true); resetClock(); draw();
  }
  function returnToPage() { background = document.hidden; audio.setHeld(background || game.state === "PAUSED"); resetClock(); }
  // Title sound: the menu loop plays once the boot (or a sting) has landed and
  // never over the quit outro; a game over returns with the title sting.
  let menuBedAt = window.AstraLoader ? Infinity : 0, lastState = game.state;
  function titleAudio() {
    if (lastState === "GAME_OVER" && game.state === "ATTRACT") { audio.ui("titleSting"); menuBedAt = gameTime + 0.8; if (!lobby) activeSeats = null; }
    lastState = game.state;
    while (quitOutro?.cues.length && gameTime - quitOutro.start >= quitOutro.cues[0][0]) audio.ui(quitOutro.cues.shift()[1]);
    audio.setMenuBed(game.state === "ATTRACT" && !quitOutro && gameTime >= menuBedAt);
  }
  // One fixed simulation step with everything that follows it.
  function step() {
    // A seat without its controller pauses the match until it is back or taken over.
    if (orphanSeats().length && ["READY", "PLAYING", "INTERMISSION"].includes(game.state)) { game.togglePause(); pumpEvents(); updateUI(); return; }
    gameTime += FIXED_DT; game.tick(FIXED_DT); pumpEvents(); FX.update(FIXED_DT, game); titleAudio(); audio.update(FIXED_DT); saveScore();
  }
  let debugHold = false;
  // Keyboard players leave a lobby seat by holding their ACTION key for a second.
  const heldActions = new Map();
  function frame(now) {
    if (lastTimestamp === null) lastTimestamp = now;
    const elapsed = Math.min(0.25, Math.max(0, (now - lastTimestamp) / 1000)); lastTimestamp = now;
    if (!background && !debugHold && game.state !== "PAUSED") {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < 15) {
        step();
        accumulator -= FIXED_DT; steps++;
      }
      if (steps === 15) accumulator = 0;
    } else accumulator = 0;
    pollGamepads();
    if (!background) tickLobby(elapsed, now);
    updateReadout();
    FX.reducedMotion = reducedMotion; FX.tickUI(elapsed); OV.tick(elapsed); warmNextMaze(); warmWalls();
    draw(); requestAnimationFrame(frame);
  }
  // The lobby runs in real time: held ACTION keys leave seats, and the countdown starts the match.
  function tickLobby(elapsed, now) {
    if (!lobby) return;
    for (const [device, since] of heldActions) {
      if (now - since < 1000) continue;
      heldActions.delete(device);
      if (lobby.leave(device) >= 0) audio.ui("uiBack");
    }
    const result = lobby.tick(elapsed);
    if (result === "tick") audio.ui("uiMove");
    if (result === "start") startFromLobby();
  }
  // The bezel readout: the level in arcade modes, time left in Versus and
  // Benchmark Run, and rows climbed in Sunset.
  let lastReadout = "";
  function updateReadout() {
    const inGame = game.state !== "ATTRACT" && !lobby, clock = t => { const s = Math.max(0, Math.ceil(t)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    let readout = null;
    if (inGame && game.rulesetId === "versus") {
      const left = (game.rules.tuning ? game.rules.tuning.roundSeconds : 120) - (game.ruleData.versus?.elapsed || 0);
      readout = { label: "TIME", value: clock(left), spoken: "Time left " + clock(left) };
    } else if (inGame && game.rulesetId === "benchmark") {
      const left = game.ruleData.benchmark?.timeLeft ?? 0;
      readout = { label: "TIME", value: clock(left), spoken: "Time left " + clock(left) };
    } else if (inGame && game.rulesetId === "hallucination") {
      const rows = game.ruleData.hallucination?.distance || 0;
      readout = { label: "ROW", value: String(rows).padStart(3, "0"), spoken: rows + " rows climbed" };
    }
    const key = readout ? readout.label + readout.value : "level";
    if (key === lastReadout) return;
    lastReadout = key;
    Controls.setState({ readout });
  }
  // Touch deck D-pad (and any direction from the page's own controls).
  function directionInput(direction) { deviceInput("touch", { kind: "dir", dir: direction }); }
  window.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.("input, select, textarea, [contenteditable='true'], .backdrop-picker")) return;
    // A focused bezel button keeps Enter, Space and Tab; every other key still plays.
    if (event.key === "Tab" || (event.target.closest?.("button") && (event.key === "Enter" || event.key === " "))) return;
    keyboardSeen = true;
    const mapped = Input.resolveKey(event.code, event.key);
    const titleLike = !lobby && !pendingStart && (Profile.isOpen || quitOutro || game.state === "ATTRACT" || game.state === "GAME_OVER");
    // "/" and "'" open Firefox's quick find; the game owns them.
    if (mapped || event.key === "'") event.preventDefault();
    if (mapped && !(mapped.kind === "action" && titleLike)) {
      if (mapped.kind === "dir") Controls.keyDirection(mapped.dir, true);
      if (event.repeat) {
        // Held arrows scroll menus; in play and in the lobby a held key is one press.
        if (mapped.kind === "dir" && titleLike) deviceInput(mapped.device, { kind: "dir", dir: mapped.dir });
        return;
      }
      if (mapped.kind === "action" && lobby) heldActions.set(mapped.device, performance.now());
      deviceInput(mapped.device, mapped.kind === "dir" ? { kind: "dir", dir: mapped.dir } : { kind: "action" });
      return;
    }
    if (event.repeat) return;
    const key = event.key.toLowerCase(), confirm = event.key === "Enter" || event.code === "Space";
    if (quitOutro) {
      if (["Enter", "Escape", "Backspace"].includes(event.key) || event.code === "Space") { event.preventDefault(); endQuitOutro(); }
      return;
    }
    if (Profile.isOpen) {
      if (confirm) { event.preventDefault(); menuAction("select"); }
      else if (["Escape", "Backspace", "u", "U", "p", "P"].includes(event.key)) { event.preventDefault(); menuAction("back"); }
      else if (key === "m") toggleSound();
      else if (key === "f") toggleFullscreen();
      return;
    }
    if (lobby) {
      if (event.key === "Escape" || event.key === "Backspace") { event.preventDefault(); closeLobby(); }
      else if (event.code === "BracketLeft" || event.code === "BracketRight") { event.preventDefault(); lobbyBots(event.code === "BracketRight" ? 1 : -1); }
      else if (confirm) { event.preventDefault(); notify("EACH PLAYER: PRESS YOUR OWN ACTION KEY", "#8fe9ff", 2); }
      else if (key === "m") toggleSound();
      else if (key === "f") toggleFullscreen();
      return;
    }
    const onTitle = game.state === "ATTRACT" || game.state === "GAME_OVER";
    if (onTitle && key === "u") { event.preventDefault(); if (!guarded()) openProfile(); return; }
    if (game.state === "GAME_OVER" && key === "c" && game.daily && game.result) {
      event.preventDefault();
      const code = Meta.scoreCode({ date: game.daily.id, ruleset: game.rulesetId, players: game.playerCount, score: game.result.score });
      Promise.resolve().then(() => navigator.clipboard.writeText(code)).then(() => notify("CODE COPIED", "#8fe9ff"), () => notify("COPY BLOCKED  CODE " + code, "#ffb44d", 5));
      return;
    }
    if (key === "g" && onTitle) { event.preventDefault(); cycleRuleset(); return; }
    if (key === "n" && onTitle) { event.preventDefault(); cycleMaze(); return; }
    if (confirm) {
      event.preventDefault(); Controls.flash("play");
      if (game.state === "PAUSED") pauseOrResume();
      else if (game.state === "ATTRACT") titleSelect();
      else if (game.state === "GAME_OVER") rematch();
      else if (spectating()) skipToResults();
    } else if (["p", "P", "Escape"].includes(event.key)) {
      event.preventDefault();
      if (game.state === "GAME_OVER" && event.key === "Escape") { if (!guarded()) returnToTitle(); }
      else if (game.state !== "PAUSED" && game.state !== "ATTRACT") { Controls.flash("pause"); pauseOrResume(); }
    }
    else if (event.key === "Backspace" && game.state !== "ATTRACT") { event.preventDefault(); Controls.flash("menu"); menuPress(); }
    else if (key === "m") { Controls.flash("mute"); toggleSound(); }
    else if (key === "v") { writeStorage(VISUALS_KEY, FX.cycleMode()); Controls.refreshOptions(); }
    else if (key === "r") toggleMotion();
    else if (event.code === "Minus" || event.code === "NumpadSubtract") changeVolume(-0.1);
    else if (event.code === "Equal" || event.code === "NumpadAdd") changeVolume(0.1);
    else if (key === "f") { Controls.flash("fullscreen"); toggleFullscreen(); }
    else if (key === "b") { Controls.flash("backdrop"); Controls.togglePicker(); }
  });
  window.addEventListener("keyup", event => {
    const mapped = Input.resolveKey(event.code, event.key);
    if (!mapped) return;
    if (mapped.kind === "dir") Controls.keyDirection(mapped.dir, false);
    else heldActions.delete(mapped.device);
  });
  playButton.addEventListener("click", playAction); muteButton.addEventListener("click", toggleSound);
  document.getElementById("menu").addEventListener("click", () => { menuPress(); canvas.focus({ preventScroll: true }); });
  pauseButton.addEventListener("click", () => {
    if (Profile.isOpen) menuAction("back");
    else if (game.state !== "PAUSED") pauseOrResume();
    canvas.focus({ preventScroll: true });
  });
  fullscreenButton.addEventListener("click", toggleFullscreen);
  // Every bezel click ticks, and hands the keyboard back to the game (the picker keeps its own focus).
  const CLICKING = ["pause", "menu", "mute", "fullscreen", "touch-toggle", "backdrop", "graphics"];
  cabinet.addEventListener("click", event => {
    const id = event.target.closest?.("button")?.id;
    if (CLICKING.includes(id) && id !== "mute") audio.ui("uiClick");
    if (["mute", "fullscreen", "touch-toggle"].includes(id)) canvas.focus({ preventScroll: true });
  });
  // Click, not pointerdown: on touch only the release grants the activation audio needs.
  canvas.addEventListener("click", event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * W, y = (event.clientY - rect.top) / rect.height * H;
    if (Profile.isOpen) { if (y < 22) menuAction("back"); }
    // The lobby is driven by each player's own device; the bot level line can also be tapped.
    else if (lobby) { if (y >= 244 && y <= 257) lobbyBots(1); }
    else if (quitOutro) endQuitOutro();
    else if (game.state === "ATTRACT") titleTap(x, y);
    else if (game.state === "GAME_OVER" && touchDeck()) rematch();
    canvas.focus({ preventScroll: true });
  });
  window.addEventListener("blur", suspend); window.addEventListener("focus", returnToPage);
  document.addEventListener("visibilitychange", () => document.hidden ? suspend() : returnToPage());
  window.addEventListener("pagehide", flushScore);
  window.addEventListener("resize", resizeScreen); new ResizeObserver(resizeScreen).observe(frameElement);
  document.addEventListener("fullscreenchange", () => {
    Controls.setState({ fullscreen: Boolean(document.fullscreenElement) });
    fullscreenButton.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement)));
    resetClock(); requestAnimationFrame(resizeScreen);
  });
  window.pacmanDebug = Object.freeze({
    // Test hooks: hold(true) freezes the clock (drawing continues); step(n) advances n fixed ticks.
    hold: (on = true) => { debugHold = Boolean(on); resetClock(); },
    step: (count = 1) => { for (let i = 0; i < count; i++) { if (lobby) tickLobby(FIXED_DT, performance.now()); else step(); } draw(); },
    pollGamepads: () => pollGamepads(),
    snapshot: () => ({
    state: game.state, level: game.level, score: game.score, lives: game.lives, dotsRemaining: game.dotsRemaining,
    pacman: { x: game.pacman.x, y: game.pacman.y, dir: game.pacman.dir },
    maze: game.map.id, mazeChoice, effects: FX.snapshot(),
    ruleset: game.rulesetId, rulesetChoice, items: game.items.map(({ kind, id, x, y }) => ({ kind, id, x, y })),
    daily: game.daily, profileScreen: Profile.isOpen ? Profile.state : null, titleMenu: { item: MENU[titleMenu.row], players: titleMenu.players, multi: titleMenu.multi }, notices: notices.map(n => n.text),
    gamepads: connectedPads().length,
    lobby: lobby ? { versus: lobby.versus, touchOnly: lobby.touchOnly, botLevel: lobby.botLevel, countdown: lobby.countdown, seats: lobby.seats.list } : null,
    seats: activeSeats ? activeSeats.list : null, guarded: guarded(),
    profile: { level: Meta.levelInfo(profile.xp).level, xp: profile.xp, credits: profile.credits, achievements: Object.keys(profile.achievements) },
    statuses: game.players.map(pac => pac.status.map(status => status.id)),
    playerCount: game.playerCount, playerScores: [...game.playerScores],
    players: game.players.map(({ skin, x, y, dir, wanted, alive, invulnTimer, bot }) => ({ skin, x, y, dir, wanted, alive, invulnTimer, bot: Boolean(bot) })),
    ghosts: game.ghosts.map(({ id, x, y, state }) => ({ id, name: CAST[id].name, x, y, state })),
    canvas: { width: W, height: H, backingWidth: canvas.width, backingHeight: canvas.height, renderScale: RENDER_SCALE },
    titleFontStatus, presentationTime: gameTime, background, reducedMotion, volume: audio.volume,
    starting: Boolean(pendingStart), resuming: Boolean(pendingResume),
    audio: audio.snapshot(),
  }) });
  Controls.mount({
    direction: directionInput, action: () => deviceInput("touch", { kind: "action" }),
    // The GRAPHICS button: the same visuals (V) and motion (R) settings, for touch and mouse.
    graphics: {
      rows: () => [
        { kind: "visuals", title: "VISUALS", ids: [...FX.MODES], names: FX.LABELS, glyphs: { juicy: "juicy", crt: "crt", purist: "purist" } },
        { kind: "motion", title: "MOTION", ids: ["system", "reduced"], names: { system: "SYSTEM", reduced: "REDUCED" }, glyphs: { system: "system", reduced: "reduced" } },
      ],
      get: () => ({ visuals: FX.mode, motion: motionSetting }),
      set(kind, id) {
        if (kind === "visuals" && id !== FX.mode) { writeStorage(VISUALS_KEY, FX.setMode(id, true)); audio.ui("uiChange"); }
        if (kind === "motion" && id !== motionSetting) { setMotion(id); audio.ui("uiChange"); }
      },
    },
    canSteer: () => game.state !== "ATTRACT" || Profile.isOpen || Boolean(lobby), relayout: resizeScreen,
    // Opening the backdrop picker mid-game pauses it; RESUME continues as usual.
    pauseForMenu: () => { if (["READY", "PLAYING", "INTERMISSION"].includes(game.state)) pauseOrResume(); },
  });
  // Warm the maze and sprite caches behind the boot screen so play starts without hitches.
  function warmArt() {
    for (const map of Engine.MAPS) { Art.mazeLayer(false, wallColor(map), map); Art.mazeLayer(true, undefined, map); }
    const chosen = Engine.findMap(mazeChoice) || Engine.CLASSIC;
    FX.warmMaze(chosen, wallColor(chosen));
    for (let direction = 0; direction < 4; direction++) for (let frame = 0; frame < 4; frame++) {
      for (const skin of SKINS) Art.sprite("pacman", { direction, frame, skin, accessory: accessoryFor(skin) });
      for (const ghost of GHOSTS) Art.sprite("ghost", { id: ghost.id, direction, frame, state: "CHASE" });
    }
    for (const bonus of window.PacmanEngine.BONUS) Art.sprite("bonus", { name: bonus.name });
  }
  const loader = window.AstraLoader;
  // The boot screen plays its intro through the game's audio (on the context its press created).
  loader?.useSound({ prepare: () => audio.unlock(), play: name => audio.ui(name), stop: name => audio.stopUi(name), titleReady: () => { menuBedAt = gameTime; } });
  loader?.track(prepareTitle());
  loader?.track(() => new Promise(resolve => setTimeout(() => { warmArt(); resolve(); }, 0)));
  loader?.ready();
  if (!loader) prepareTitle();
  updateSoundButton(); resizeScreen(); draw(); requestAnimationFrame(frame);
})();
