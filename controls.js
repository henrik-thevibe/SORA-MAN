/* Pixel-art arcade deck: bezel, D-pad and buttons, painted in code from the cast palettes. */
(function () {
  "use strict";
  const Art = window.PacmanArt;
  const { FONT, PALETTES } = Art;
  // Astra's gold (character-art.js GOLD), Claude's orange and Grok's silver-on-black.
  const GOLD = { body: "#ffe52c", shade: "#f4b91c", light: "#fff79a", edge: "#b87313", line: "#5e3605", ink: "#9a5a06" };
  const SKINS = {
    gold: GOLD,
    orange: { ...PALETTES.blinky, line: "#5c1d0c", ink: "#7a2710" },
    off: { body: "#3a4260", shade: "#2a3149", light: "#4b5578", edge: "#1b2135", line: "#0b0e1a", ink: "#1b2135" },
    slate: { body: "#3a3f52", shade: "#2a2d3a", light: "#5a5f75", edge: "#1d1f2a", line: "#05060b", ink: "#dfe4f5" },
  };
  // START wears the backdrop character's colours; `hi` is that character's highlight for every other control.
  const THEME_SKINS = {
    astra: { ...GOLD, hi: "#ffe52c" },
    claude: { ...PALETTES.blinky, line: "#5c1d0c", ink: "#7a2710", hi: "#ff9a66" },
    muse: { body: "#fff0d7", shade: "#ecd4b4", light: "#ffffff", edge: "#c9a37c", line: "#8a5a3c", ink: "#e0703f", press: "#5c3a22", hi: "#ffbe91" },
    grok: { body: "#b9c0d9", shade: "#8a90a8", light: "#eef1ff", edge: "#4a4e60", line: "#15161d", ink: "#15161d", press: "#000000", hi: "#dfe3f5" },
    gemini: { ...PALETTES.clyde, line: "#0c1a5a", ink: "#0c1a5a", hi: "#65e2ef" },
  };
  SKINS.theme = THEME_SKINS.astra;
  const KEY = { body: PALETTES.inky.body, rim: PALETTES.inky.light, edge: PALETTES.inky.edge, depth: "#2a2d3a", ink: "#dfe4f5", on: PALETTES.clyde.light, off: "#4b5578" };
  const INK = "#05060b";
  const TOUCH_KEY = "astra-touch-controls";
  const GLYPHS = {
    play: ["#....", "##...", "###..", "####.", "###..", "##...", "#...."],
    pause: ["##.##", "##.##", "##.##", "##.##", "##.##", "##.##", "##.##"],
    star: ["..#..", "..#..", "#####", ".###.", ".#.#.", "#...#", "....."],
    soundOn: ["...#..#..", "..##...#.", "####.#.#.", "####.#.#.", "####.#.#.", "..##...#.", "...#..#.."],
    soundOff: ["...#.....", "..##.....", "####.#.#.", "####..#..", "####.#.#.", "..##.....", "...#....."],
    full: ["###...###", "#.......#", ".........", ".........", ".........", "#.......#", "###...###"],
    exit: ["..#...#..", "###...###", ".........", ".........", ".........", "###...###", "..#...#.."],
    pad: [".#######.", "##.###.##", "#...#.#.#", "##.###.##", "#########", "###...###", "##.....##"],
    menu: [".........", "#########", ".........", "#########", ".........", "#########", "........."],
    graphics: ["#########", "#.......#", "#..#.#..#", "#...#...#", "#..#.#..#", "#########", "...###..."],
    juicy: ["....#....", "...###...", "#########", "..#####..", "..##.##..", ".##...##.", "........."],
    crt: ["#########", ".........", "#########", ".........", "#########", ".........", "#########"],
    purist: ["#########", "#.......#", "#.......#", "#.......#", "#.......#", "#.......#", "#########"],
    system: [".........", "##.....##", "..#...#..", "...###...", "..#...#..", "##.....##", "........."],
    reduced: [".........", "..#####..", ".#.....#.", ".#..#..#.", ".#.....#.", "..#####..", "........."],
    backdrop: ["#########", "#.......#", "#...#...#", "#..###..#", "#.#####.#", "#.......#", "#########"],
    cabinet: [".#######.", ".#.....#.", ".#######.", ".#.###.#.", ".#.###.#.", "#########", ".#######."],
    handheld: [".#######.", "#..###..#", "##.###.##", "#..###..#", "#.......#", ".#######.", "........."],
    carpet: ["#...#..#.", "..#...#..", ".#..#...#", "#...#.#..", "..#.....#", ".#..#.#..", "#..#...#."],
    maze: ["#########", "#...#...#", "#.#.#.#.#", "#.#...#.#", "#.#####.#", "#.......#", "#########"],
  };
  const THEME_SPRITES = { astra: ["pacman", "pacman"], claude: ["ghost", "blinky"], muse: ["ghost", "pinky"], grok: ["ghost", "inky"], gemini: ["ghost", "clyde"] };
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let handlers = {}, cabinet, frame, padEl, padCtx, bar, actions, picker = null;
  let buttons = {}, touchOn = false, tick = 0, layoutMode = "strip", themed = false;
  const pad = { pressed: -1, facing: 3, pointer: null, startDir: null, keys: new Set() };
  const view = { play: { label: "START", disabled: false }, pause: { disabled: true, latched: false }, action: { disabled: true }, menu: { disabled: true }, sound: { label: "SOUND ON", muted: false, unavailable: false }, fullscreen: false, level: 1, state: "ATTRACT" };

  function readStorage(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function writeStorage(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* Optional. */ } }

  // Each canvas is authored in art pixels; CSS scales it by an integer --u.
  function surface(canvas, w, h, density) {
    canvas.width = w * density; canvas.height = h * density;
    canvas.style.setProperty("--w", w); canvas.style.setProperty("--h", h);
    const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
    const put = (x, y, color) => { if (color) { ctx.fillStyle = color; ctx.fillRect(x * density, y * density, density, density); } };
    return { ctx, put, clear: () => ctx.clearRect(0, 0, canvas.width, canvas.height) };
  }
  function stamp(put, glyph, x0, y0, color) {
    glyph.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "#") put(x0 + x, y0 + y, color); });
  }
  // A full dark pixel outline keeps small captions legible on bright backdrops.
  function outlined(put, value, x, y, color) {
    for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) text(put, value, x + ox, y + oy, INK);
    text(put, value, x, y, color);
  }
  function text(put, value, x, y, color) {
    for (const character of String(value).toUpperCase()) {
      const rows = FONT[character] || FONT[" "];
      rows.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row[rx] === "1") put(x + rx, y + ry, color); });
      x += 6;
    }
  }

  /* ---------- 9-slice frames: the navy screen bezel with marquee bulbs, and dark control plates with pellet dots ---------- */
  const BEZEL = { lit: "#34406a", dim: "#161e32", body: "#202943", dots: (x, y, phase) => (x + y + phase) % 2 === 0 ? "#ffe52c" : "#3b3413", inner: "#000", fill: null };
  const PLATE = { lit: "#2a3150", dim: "#0e1222", body: "#0b0e1a", dots: (x, y) => (x + y) % 4 === 0 ? "#ffdfb6" : "#0b0e1a", inner: "#0b0e1a", fill: "#0b0e1a" };
  function frameImage(phase, palette = BEZEL) {
    const c = document.createElement("canvas"), { put } = surface(c, 16, 16, 1);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ring = Math.min(x, y, 15 - x, 15 - y), cx = Math.min(x, 15 - x), cy = Math.min(y, 15 - y);
      if (cx + cy < 2) continue;
      let color = null;
      if (ring === 0) color = INK;
      else if (ring === 1) color = (y <= x && y <= 15 - x) || (x < y && x <= 15 - y) ? palette.lit : palette.dim;
      else if (ring <= 3) color = palette.body;
      else if (ring === 4) color = palette.dots(x, y, phase);
      else if (ring === 5) color = palette.inner;
      else color = palette.fill;
      put(x, y, color);
    }
    return `url(${c.toDataURL()})`;
  }
  const FRAMES = [];

  /* ---------- D-pad: a raised gold cross with Astra in the hub ---------- */
  const PAD = 47, C = 23;
  function armAt(x, y) {
    const vertical = x >= 15 && x <= 31 && y >= 2 && y <= 44, horizontal = y >= 15 && y <= 31 && x >= 2 && x <= 44;
    if (!vertical && !horizontal) return -1;
    if ((y === 2 || y === 44) && (x === 15 || x === 31)) return -1;
    if ((x === 2 || x === 44) && (y === 15 || y === 31)) return -1;
    return y < 15 ? 0 : x < 15 ? 1 : y > 31 ? 2 : x > 31 ? 3 : 4;
  }
  const ARROWS = new Map();
  for (let dy = 0; dy < 3; dy++) for (let dx = -dy; dx <= dy; dx++) {
    ARROWS.set(`${C + dx},${7 + dy}`, 0); ARROWS.set(`${7 + dy},${C + dx}`, 1);
    ARROWS.set(`${C + dx},${39 - dy}`, 2); ARROWS.set(`${39 - dy},${C + dx}`, 3);
  }
  function padFace(x, y, down) {
    const arm = armAt(x, y), out = (dx, dy) => armAt(x + dx, y + dy) < 0;
    if (out(0, -1) || out(0, 1) || out(-1, 0) || out(1, 0)) return SKINS.theme.line;
    if (arm === 4) {
      // A concave thumb dimple: shadowed toward the light, lit on the far lip.
      const d = Math.hypot(x - C, y - C), toward = x - C + y - C < 0;
      if (d <= 7.6 && d > 6.4) return toward ? SKINS.theme.edge : SKINS.theme.light;
      if (d <= 6.4) return toward && d > 3 ? SKINS.theme.shade : SKINS.theme.body;
    }
    if (ARROWS.get(`${x},${y}`) === arm) return down ? SKINS.theme.press || "#fff" : SKINS.theme.ink;
    const tone = out(0, -2) || out(-2, 0) ? 3 : out(0, 2) || out(2, 0) ? 1 : 2;
    return [SKINS.theme.line, SKINS.theme.edge, SKINS.theme.shade, SKINS.theme.body, SKINS.theme.light][tone - (down ? 1 : 0) + 1];
  }
  function paintPad() {
    const { put, clear } = padCtx, p = pad.pressed;
    clear();
    for (let y = 0; y < PAD; y++) for (let x = 0; x < PAD; x++) {
      const d = Math.hypot(x - C, y - C);
      if (d <= 23.4) put(x, y, d > 22.4 ? INK : y > C && d > 21.2 ? "#1d2645" : "#0c1122");
      let color = null;
      if (p >= 0 && armAt(x, y - 1) === p) color = padFace(x, y - 1, true);
      else if (armAt(x, y) >= 0 && armAt(x, y) !== p) color = padFace(x, y, false);
      else if (armAt(x, y - 1) >= 0) color = SKINS.theme.edge;
      else if (armAt(x, y - 2) >= 0) color = SKINS.theme.line;
      put(x, y, color);
    }
  }

  /* ---------- Round arcade buttons and square keycaps ---------- */
  function paintRound(button) {
    const { skin, glyph, face, cap } = button, down = button.down || button.latched, s = SKINS[button.disabled && !button.latched ? "off" : skin];
    const { put, clear } = face; clear();
    const lift = down ? 0 : 1.5, c = 10.5, fy = c - lift;
    for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 11) put(x, y, d > 10.1 ? INK : d > 8.9 ? (y < c ? "#2b3454" : "#141a2e") : "#070912");
      let side = false;
      for (let t = 0; t <= lift; t += 0.5) if (Math.hypot(x - c, y - (c - t)) <= 7.6) side = true;
      const dx = x - c, dy = y - fy, r = Math.hypot(dx, dy);
      if (r <= 7.6) {
        let color = r > 6.7 ? s.line : dx + dy < -6 ? s.light : dx + dy > 5 ? s.shade : s.body;
        if (down && color === s.body) color = s.shade; else if (down && color === s.light) color = s.body;
        if (!down && !button.disabled && Math.round(dx) === -3 && (Math.round(dy) === -4 || Math.round(dy) === -3)) color = "#fff";
        put(x, y, color);
      } else if (side) put(x, y, y > fy ? s.edge : s.line);
    }
    stamp(put, GLYPHS[glyph], glyph === "play" ? 9 : 8, Math.round(fy - 3.5), down ? s.press || "#fff" : s.ink);
    const label = button.label, { put: cput, clear: cclear } = surface(cap, label.length * 6 + 1, 9, 1);
    cclear(); outlined(cput, label, 1, 1, button.disabled && !button.latched ? "#6d7aa0" : "#dfe4f5");
  }
  // Keycaps of any size (15 in the bar, 19 in the picker), holding a glyph or a character sprite.
  function paintKey(button) {
    const { put, clear, ctx } = button.face, n = button.size || 15, last = n - 1, down = button.down || button.latched;
    const top = down ? 1 : 0, bottom = top + n - 3;
    clear();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const chipped = (x === 0 || x === last) && (y === top || y === bottom || y === last);
      if (chipped) continue;
      if (y >= top && y <= bottom) {
        const rim = x === 0 || x === last || y === top || y === bottom;
        const lit = y === top || x === 0;
        put(x, y, rim ? (lit && !down ? KEY.rim : button.latched ? KEY.on : KEY.edge) : KEY.body);
      } else if (y > bottom) put(x, y, y === last ? INK : KEY.depth);
    }
    if (button.sprite) { ctx.drawImage(button.sprite, n - 16, top * 2 + 1); return; }
    const ink = button.disabled ? KEY.off : button.down ? "#fff" : button.active || button.latched ? KEY.on : KEY.ink;
    stamp(put, GLYPHS[button.glyph], (n - 9) >> 1, top + ((n - 9) >> 1), ink);
  }
  const paint = button => (button.kind === "round" ? paintRound : paintKey)(button);

  function build(id, kind, options) {
    const el = document.getElementById(id);
    el.classList.add("pix-btn", kind);
    const faceCanvas = document.createElement("canvas"); faceCanvas.className = "pix face";
    const sr = document.createElement("span"); sr.className = "sr-only";
    el.replaceChildren(faceCanvas);
    const button = { el, kind, sr, down: false, disabled: false, active: false, label: "", ...options };
    if (kind === "round") {
      button.face = surface(faceCanvas, 22, 22, 2);
      const cap = document.createElement("canvas"); cap.className = "pix cap"; cap.setAttribute("aria-hidden", "true");
      button.cap = cap; el.append(cap);
    } else button.face = surface(faceCanvas, button.size || 15, button.size || 15, 2);
    el.append(sr);
    const press = down => {
      if (down && el.disabled) return;
      if (button.down === down) return;
      button.down = down; paint(button);
      if (!down) { el.classList.remove("is-pop"); void el.offsetWidth; el.classList.add("is-pop"); }
    };
    button.press = press;
    el.addEventListener("pointerdown", () => press(true));
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(type, () => press(false));
    el.addEventListener("keydown", event => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) press(true); });
    el.addEventListener("keyup", () => press(false));
    el.addEventListener("blur", () => press(false));
    el.addEventListener("animationend", () => el.classList.remove("is-pop"));
    el.addEventListener("contextmenu", event => event.preventDefault());
    buttons[id] = button;
    return button;
  }
  function setLabel(button, label) { button.label = label; button.sr.textContent = label; }

  /* ---------- Readout in the arcade bitmap font: the level, or the mode's own measure ---------- */
  // view.readout = { label, value, spoken }; without one it shows the level.
  function paintLevel() {
    const el = document.getElementById("level"), readout = view.readout || { label: "LVL", value: String(view.level).padStart(2, "0") };
    const shown = readout.label + " " + readout.value, width = shown.length * 6 + 5;
    let canvas = el.querySelector("canvas"), sr = el.querySelector(".sr-only");
    if (!canvas) {
      canvas = document.createElement("canvas"); canvas.className = "pix lcd"; canvas.setAttribute("aria-hidden", "true");
      sr = document.createElement("span"); sr.className = "sr-only"; el.replaceChildren(canvas, sr);
    }
    sr.textContent = readout.spoken || shown;
    el.setAttribute("aria-label", readout.spoken || "Current level");
    const { put, clear } = surface(canvas, width, 11, 1);
    clear();
    for (let y = 0; y < 11; y++) for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === 10;
      if (!(edge && (x === 0 || x === width - 1) && (y === 0 || y === 10))) put(x, y, edge ? "#202943" : "#070912");
    }
    text(put, readout.label, 3, 2, "#91a4d3"); text(put, readout.value, 3 + (readout.label.length + 1) * 6, 2, KEY.on);
  }

  let themeId = null;
  function applyTheme(id) {
    themeId = id;
    const skin = THEME_SKINS[id] || THEME_SKINS.astra;
    SKINS.theme = skin; KEY.on = skin.hi;
    cabinet.style.setProperty("--accent", skin.hi);
    for (const button of Object.values(buttons)) paint(button);
    paintLevel(); paintPad();
  }

  /* ---------- Pointer steering: slide between arms without lifting ---------- */
  function setPressed(dir) {
    if (dir === pad.pressed) return;
    pad.pressed = dir;
    if (dir >= 0) { pad.facing = dir; navigator.vibrate?.(8); }
    padEl.classList.toggle("is-down", dir >= 0);
    paintPad();
  }
  function steer(event) {
    const r = padEl.getBoundingClientRect(), dx = event.clientX - (r.left + r.width / 2), dy = event.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.1) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 0 : 2);
    if (dir === pad.pressed) return;
    setPressed(dir);
    // Starting the game unlocks audio, which needs the activation that pointerup grants on touch.
    if (handlers.canSteer()) handlers.direction(dir); else pad.startDir = dir;
  }
  function bindPad() {
    padEl.addEventListener("pointerdown", event => {
      if (pad.pointer !== null) return;
      event.preventDefault(); pad.pointer = event.pointerId; pad.startDir = null;
      try { padEl.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic pointers cannot be captured. */ }
      steer(event);
    });
    padEl.addEventListener("pointermove", event => { if (event.pointerId === pad.pointer) steer(event); });
    const end = event => {
      if (event.pointerId !== pad.pointer) return;
      pad.pointer = null;
      if (pad.startDir !== null && event.type === "pointerup") handlers.direction(pad.startDir);
      pad.startDir = null; setPressed(-1);
    };
    padEl.addEventListener("pointerup", end); padEl.addEventListener("pointercancel", end);
    padEl.addEventListener("contextmenu", event => event.preventDefault());
  }

  /* ---------- Backdrop picker: a pixel popover with a style row and a character row ---------- */
  function buildPicker() {
    const B = window.ArcadeBackdrops;
    picker = document.createElement("div");
    picker.className = "backdrop-picker plate"; picker.hidden = true;
    picker.setAttribute("role", "dialog"); picker.setAttribute("aria-label", "Choose backdrop");
    cabinet.append(picker);
    for (const [kind, ids, title] of [["concept", B.CONCEPTS, "STYLE"], ["theme", B.THEMES, "THEME"]]) {
      const caption = document.createElement("canvas"); caption.className = "pix cap"; caption.setAttribute("aria-hidden", "true");
      const { put } = surface(caption, title.length * 6 - 1, 7, 1); text(put, title, 0, 0, "#91a4d3");
      const group = document.createElement("div"); group.className = "picker-row";
      group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", title);
      picker.append(caption, group);
      ids.forEach((id, index) => {
        const el = document.createElement("button"); el.type = "button"; el.id = `pick-${kind}-${id}`;
        el.setAttribute("role", "radio"); el.dataset.kind = kind; el.dataset.id = id;
        group.append(el);
        const [spriteKind, spriteId] = THEME_SPRITES[id] || [];
        const sprite = kind === "theme" ? Art.sprite(spriteKind, { id: spriteId, direction: spriteKind === "pacman" ? 3 : 2, frame: 1 }) : null;
        const button = build(el.id, "key", kind === "concept" ? { glyph: id, size: 19 } : { sprite, size: 19 });
        const name = B.names[kind === "concept" ? "concepts" : "themes"][id];
        setLabel(button, name); el.title = name;
        el.addEventListener("click", () => choose(kind, id));
        el.addEventListener("keydown", event => {
          const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
          if (step) {
            event.preventDefault();
            const next = ids[(index + step + ids.length) % ids.length];
            choose(kind, next); document.getElementById(`pick-${kind}-${next}`).focus();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const other = kind === "concept" ? "theme" : "concept";
            document.getElementById(`pick-${other}-${B.get()[other]}`).focus();
          } else if (event.key === "Escape") { event.preventDefault(); closePicker(true); }
        });
      });
    }
    document.addEventListener("pointerdown", event => {
      if (!picker.hidden && !picker.contains(event.target) && !buttons.backdrop.el.contains(event.target)) closePicker(false);
    }, true);
    window.addEventListener("resize", () => { if (!picker.hidden) placePicker(); });
  }
  function choose(kind, id) {
    const B = window.ArcadeBackdrops, current = B.get();
    B.set(kind === "concept" ? id : current.concept, kind === "theme" ? id : current.theme);
    refreshPicker();
  }
  function refreshPicker() {
    const current = window.ArcadeBackdrops.get();
    for (const el of picker.querySelectorAll("[role=radio]")) {
      const on = current[el.dataset.kind] === el.dataset.id, button = buttons[el.id];
      button.latched = on; el.setAttribute("aria-checked", String(on)); el.tabIndex = on ? 0 : -1; paint(button);
    }
  }
  // Pop-overs open under their button, or above it when there's no room below.
  function placeNear(popover, button) {
    const anchor = button.el.getBoundingClientRect(), w = popover.offsetWidth, h = popover.offsetHeight;
    const left = clamp(anchor.right - w, 8, window.innerWidth - w - 8);
    let top = anchor.bottom + 8;
    if (top + h > window.innerHeight - 8) top = anchor.top - h - 8;
    if (top < 8) top = Math.max(8, (window.innerHeight - h) / 2);
    popover.style.left = left + "px"; popover.style.top = top + "px";
  }
  const placePicker = () => placeNear(picker, buttons.backdrop);
  function openPicker() {
    if (!picker || !picker.hidden) return;
    closeOptions(false);
    handlers.pauseForMenu?.();
    picker.hidden = false; refreshPicker(); placePicker();
    const toggle = buttons.backdrop; toggle.el.setAttribute("aria-expanded", "true"); toggle.latched = true; paint(toggle);
    document.getElementById(`pick-concept-${window.ArcadeBackdrops.get().concept}`).focus();
    window.ArcadeBackdrops.relayout();
  }
  function closePicker(focusBack) {
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    const toggle = buttons.backdrop; toggle.el.setAttribute("aria-expanded", "false"); toggle.latched = false; paint(toggle);
    if (focusBack) toggle.el.focus();
    window.ArcadeBackdrops.relayout();
  }
  const togglePicker = () => (picker && !picker.hidden ? closePicker(true) : openPicker());

  /* ---------- Graphics picker: visuals and motion, for touch players (keyboards also have V and R) ---------- */
  // handlers.graphics = { rows(): [{ kind, title, ids, names, glyphs }], get(): { kind: id }, set(kind, id) }.
  let options = null, optionRows = [];
  function buildOptions() {
    const source = handlers.graphics;
    if (!source) return;
    optionRows = source.rows();
    options = document.createElement("div");
    options.className = "backdrop-picker plate"; options.hidden = true;
    options.setAttribute("role", "dialog"); options.setAttribute("aria-label", "Graphics settings");
    cabinet.append(options);
    for (const row of optionRows) {
      const width = Math.max(...row.ids.map(id => (row.title + ": " + row.names[id]).length)) * 6 - 1;
      row.caption = document.createElement("canvas"); row.caption.className = "pix cap"; row.caption.setAttribute("aria-hidden", "true");
      row.surface = surface(row.caption, width, 7, 1);
      const group = document.createElement("div"); group.className = "picker-row";
      group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", row.title);
      options.append(row.caption, group);
      row.ids.forEach((id, index) => {
        const el = document.createElement("button"); el.type = "button"; el.id = `opt-${row.kind}-${id}`;
        el.setAttribute("role", "radio"); el.dataset.kind = row.kind; el.dataset.id = id;
        group.append(el);
        const button = build(el.id, "key", { glyph: row.glyphs[id], size: 19 });
        setLabel(button, row.title + " " + row.names[id]); el.title = row.names[id];
        el.addEventListener("click", () => chooseOption(row.kind, id));
        el.addEventListener("keydown", event => {
          const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
          if (step) {
            event.preventDefault();
            const next = row.ids[(index + step + row.ids.length) % row.ids.length];
            chooseOption(row.kind, next); document.getElementById(`opt-${row.kind}-${next}`).focus();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const other = optionRows[(optionRows.indexOf(row) + 1) % optionRows.length];
            document.getElementById(`opt-${other.kind}-${source.get()[other.kind]}`).focus();
          } else if (event.key === "Escape") { event.preventDefault(); closeOptions(true); }
        });
      });
    }
    document.addEventListener("pointerdown", event => {
      if (!options.hidden && !options.contains(event.target) && !buttons.graphics.el.contains(event.target)) closeOptions(false);
    }, true);
    window.addEventListener("resize", () => { if (!options.hidden) placeNear(options, buttons.graphics); });
  }
  function chooseOption(kind, id) { handlers.graphics.set(kind, id); refreshOptions(); }
  function refreshOptions() {
    const current = handlers.graphics.get();
    for (const row of optionRows) {
      row.surface.clear(); text(row.surface.put, row.title + ": " + row.names[current[row.kind]], 0, 0, "#91a4d3");
    }
    for (const el of options.querySelectorAll("[role=radio]")) {
      const on = current[el.dataset.kind] === el.dataset.id, button = buttons[el.id];
      button.latched = on; el.setAttribute("aria-checked", String(on)); el.tabIndex = on ? 0 : -1; paint(button);
    }
  }
  function openOptions() {
    if (!options || !options.hidden) return;
    closePicker(false);
    handlers.pauseForMenu?.();
    options.hidden = false; refreshOptions(); placeNear(options, buttons.graphics);
    const toggle = buttons.graphics; toggle.el.setAttribute("aria-expanded", "true"); toggle.latched = true; paint(toggle);
    const first = optionRows[0];
    document.getElementById(`opt-${first.kind}-${handlers.graphics.get()[first.kind]}`).focus();
    window.ArcadeBackdrops?.relayout();
  }
  function closeOptions(focusBack) {
    if (!options || options.hidden) return;
    options.hidden = true;
    const toggle = buttons.graphics; toggle.el.setAttribute("aria-expanded", "false"); toggle.latched = false; paint(toggle);
    if (focusBack) toggle.el.focus();
    window.ArcadeBackdrops?.relayout();
  }
  const toggleOptions = () => (options && !options.hidden ? closeOptions(true) : openOptions());

  /* ---------- Layout: choose deck arrangement and art scale, report room left for the screen ---------- */
  function setTouch(on, save) {
    touchOn = on;
    if (save) writeStorage(TOUCH_KEY, on ? "on" : "off");
    const toggle = buttons["touch-toggle"];
    toggle.active = on; toggle.el.setAttribute("aria-pressed", String(on));
    toggle.el.setAttribute("aria-label", on ? "Hide touch controls" : "Show touch controls");
    setLabel(toggle, on ? "HIDE PAD" : "SHOW PAD"); paint(toggle);
  }
  function layout(areaW, areaH) {
    const mode = !touchOn ? "strip" : areaW / areaH > 1.1 ? "landscape" : "portrait";
    const px = mode === "strip" ? 2 : mode === "portrait" ? clamp(Math.floor(Math.min(areaW / 120, areaH / 200)), 2, 4) : clamp(Math.floor(Math.min(areaH / 115, areaW / 250)), 2, 4);
    const cpx = mode === "strip" ? (areaW < 420 ? 1 : 2) : px >= 4 ? 3 : 2;
    const fpx = mode === "strip" && areaW < 420 ? 1 : 2;
    layoutMode = mode; cabinet.dataset.layout = mode;
    // A themed backdrop paints its own bezel into a wider transparent ring around the screen.
    const bezel = (themed ? 10 : 6) * fpx;
    cabinet.style.setProperty("--px", px); cabinet.style.setProperty("--cpx", cpx); cabinet.style.setProperty("--fpx", fpx);
    cabinet.style.setProperty("--bezel", bezel + "px");
    const gap = parseFloat(getComputedStyle(cabinet).rowGap) || 0, border = bezel * 2;
    const deck = Math.max(padEl.offsetHeight, actions.offsetHeight);
    if (mode === "landscape") {
      // Equal side regions keep the board centred; each must hold its widest control.
      const side = Math.max(padEl.offsetWidth, bar.offsetWidth, actions.offsetWidth);
      return { width: areaW - side * 2 - gap * 2 - border, height: areaH - border };
    }
    if (mode === "portrait") return { width: areaW - border, height: areaH - bar.offsetHeight - deck - gap * 2 - border };
    return { width: areaW - border, height: areaH - Math.max(bar.offsetHeight, actions.offsetHeight) - gap - border };
  }

  function animate() {
    if (document.hidden) return;
    tick++;
    if (themed) return;
    const chase = !reduced.matches && ["ATTRACT", "GAME_OVER", "PAUSED"].includes(view.state);
    frame.style.borderImageSource = FRAMES[chase ? Math.floor(tick / 5) % 2 : 0];
  }

  function mount(settings) {
    handlers = settings;
    cabinet = document.querySelector(".cabinet"); frame = document.querySelector(".screen-frame");
    padEl = document.getElementById("pad"); bar = document.querySelector(".bezel-controls");
    actions = document.querySelector(".actions");
    FRAMES.push(frameImage(0), frameImage(1));
    themed = Boolean(window.ArcadeBackdrops?.active);
    frame.classList.toggle("is-themed", themed);
    if (!themed) frame.style.borderImageSource = FRAMES[0];
    document.querySelector(".arcade-frame").style.setProperty("--plate", frameImage(0, PLATE));
    const padCanvas = document.createElement("canvas"); padCanvas.className = "pix";
    padEl.replaceChildren(padCanvas); padCtx = surface(padCanvas, PAD, PAD, 2);
    build("play", "round", { skin: "theme", glyph: "play" });
    build("pause", "round", { skin: "slate", glyph: "pause" }); setLabel(buttons.pause, "PAUSE");
    // ACTION: the touch player's skill button (REMIX); it fires on press, not release.
    build("action", "round", { skin: "orange", glyph: "star" }); setLabel(buttons.action, "SKILL");
    buttons.action.el.addEventListener("pointerdown", event => { event.preventDefault(); if (!buttons.action.el.disabled) handlers.action?.(); });
    build("menu", "key", { glyph: "menu" }); setLabel(buttons.menu, "MENU");
    build("mute", "key", { glyph: "soundOn" });
    build("fullscreen", "key", { glyph: "full" }); setLabel(buttons.fullscreen, "FULLSCREEN");
    build("touch-toggle", "key", { glyph: "pad" });
    buttons["touch-toggle"].el.addEventListener("click", () => { setTouch(!touchOn, true); handlers.relayout?.(); });
    build("graphics", "key", { glyph: "graphics" }); setLabel(buttons.graphics, "GRAPHICS");
    buttons.graphics.el.addEventListener("click", toggleOptions); buildOptions();
    build("backdrop", "key", { glyph: "backdrop" }); setLabel(buttons.backdrop, "BACKDROP");
    if (window.ArcadeBackdrops) { buttons.backdrop.el.addEventListener("click", togglePicker); buildPicker(); }
    else buttons.backdrop.el.hidden = true;
    const stored = readStorage(TOUCH_KEY);
    setTouch(stored ? stored === "on" : window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0, false);
    bindPad(); paintPad(); applyTheme(window.ArcadeBackdrops?.get().theme); setState({});
    // Follow the backdrop's character however it is chosen: picker, keyboard or the API.
    window.addEventListener("backdropchange", event => { if (event.detail.theme !== themeId) applyTheme(event.detail.theme); });
    setInterval(animate, 100);
  }

  function setState(next) {
    for (const key of Object.keys(next)) view[key] = next[key] && typeof next[key] === "object" && key !== "readout" ? { ...view[key], ...next[key] } : next[key];
    const { play, pause, menu, mute, fullscreen, action } = buttons;
    action.disabled = action.el.disabled = view.action.disabled;
    menu.disabled = menu.el.disabled = view.menu.disabled;
    setLabel(play, view.play.label); play.disabled = play.el.disabled = view.play.disabled;
    play.el.classList.toggle("is-attract", !view.play.disabled && ["ATTRACT", "GAME_OVER", "PAUSED"].includes(view.state));
    pause.disabled = pause.el.disabled = view.pause.disabled;
    pause.latched = view.pause.latched; pause.el.setAttribute("aria-pressed", String(view.pause.latched));
    setLabel(mute, view.sound.label); mute.disabled = mute.el.disabled = view.sound.unavailable;
    mute.glyph = view.sound.muted || view.sound.unavailable ? "soundOff" : "soundOn"; mute.active = view.sound.muted;
    fullscreen.glyph = view.fullscreen ? "exit" : "full"; fullscreen.active = view.fullscreen;
    setLabel(fullscreen, view.fullscreen ? "EXIT FULL" : "FULLSCREEN");
    for (const button of Object.values(buttons)) paint(button);
    if ("level" in next || "readout" in next) paintLevel();
    // While paused or after a game over everything dims except START (RESUME / AGAIN), so the way back in stands out.
    cabinet.classList.toggle("is-paused", view.state === "PAUSED");
    cabinet.classList.toggle("is-over", view.state === "GAME_OVER");
  }

  function keyDirection(dir, down) {
    if (down) pad.keys.add(dir); else pad.keys.delete(dir);
    if (pad.pointer !== null) return;
    setPressed(pad.keys.size ? [...pad.keys].pop() : -1);
  }
  function flash(id) {
    const button = buttons[id];
    if (!button || button.el.disabled) return;
    button.press(true); setTimeout(() => button.press(false), 110);
  }

  window.ArcadeControls = Object.freeze({ mount, setState, layout, keyDirection, flash, togglePicker, toggleOptions, refreshOptions: () => options && !options.hidden && refreshOptions() });
})();
