/* The local multiplayer lobby: devices join seats, every human proves their
 * controls (all four directions, then ACTION) and readies up, and a short
 * countdown starts the match. Bots fill empty Versus seats and never ready.
 * createLobby is pure (node-tested); drawLobby paints it on the game canvas. */
(function (root) {
  "use strict";
  const Input = root.AstraInput || require("./input.js");
  const BOT_LEVELS = Object.freeze(["easy", "normal", "hard"]);
  const COUNTDOWN = 3;

  function createLobby({ versus = false, touchOnly = false, botLevel = "normal", seats = null } = {}) {
    const table = seats || Input.createSeats(4);
    let countdown = null, level = BOT_LEVELS.includes(botLevel) ? botLevel : "normal";
    const refresh = () => {
      if (table.allReady()) { if (countdown === null) countdown = COUNTDOWN; }
      else countdown = null;
    };
    const api = {
      seats: table, versus, touchOnly,
      get botLevel() { return level; },
      get countdown() { return countdown; },
      // Any change to who plays or how cancels a running countdown.
      press(device, input, padId) {
        if (touchOnly && device !== "touch") return "desktopOnly";
        if (touchOnly && table.seatOf(device) < 0 && table.humans >= 1) return "full";
        const result = table.press(device, input, padId);
        if (result === "join" || result === "leave" || result === "unready") countdown = null;
        refresh();
        return result;
      },
      setBotLevel(step) {
        if (!versus) return level;
        level = BOT_LEVELS[(BOT_LEVELS.indexOf(level) + step + BOT_LEVELS.length) % BOT_LEVELS.length];
        table.resetReady(); countdown = null;
        return level;
      },
      disconnect(device) { const index = table.disconnect(device); countdown = null; refresh(); return index; },
      leave(device) { const index = table.leave(device); countdown = null; refresh(); return index; },
      reconnect(device, padId) { const index = table.reconnect(device, padId); refresh(); return index; },
      // Seconds pass; returns "tick" on each whole second of the countdown and "start" at zero.
      tick(dt) {
        if (countdown === null) return null;
        const shown = Math.ceil(countdown);
        countdown -= dt;
        if (countdown <= 0) { countdown = null; return "start"; }
        return Math.ceil(countdown) !== shown ? "tick" : null;
      },
      rematch() { table.resetReady(); countdown = null; },
    };
    return api;
  }

  // ---- Drawing -------------------------------------------------------------------
  const COLORS = Object.freeze(["#ffe52c", "#ff7ab4", "#4fe3ff", "#6fe06a"]);
  const ARROWS = ["↑", "←", "↓", "→"];
  function drawLobby(ctx, lobby, { Art, Engine, glyphText, blit, time, title, rules, reducedMotion, accessoryFor, keyboardSeats }) {
    const W = Art.WIDTH, blink = reducedMotion || Math.floor(time * 3) % 2 === 0;
    ctx.fillStyle = "#05060c"; ctx.fillRect(0, 0, W, Art.HEIGHT);
    glyphText(title, W / 2, 4, "#ffe52c", 2);
    glyphText(lobby.touchOnly ? "SOLO ON THIS DEVICE · BOTS FILL IN" : "LOCAL MULTIPLAYER · DESKTOP ONLY", W / 2, 21, "#a4aed1");
    const list = lobby.seats.list;
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 114 : 6, y = i < 2 ? 32 : 124, seat = list[i], color = COLORS[i];
      const player = Engine.PLAYERS[i];
      ctx.fillStyle = seat && seat.ready ? "#0f2a18" : "#10142a"; ctx.fillRect(x, y, 104, 88);
      ctx.fillStyle = seat ? color : "#2a3150"; ctx.fillRect(x, y, 104, 1); ctx.fillRect(x, y + 87, 104, 1); ctx.fillRect(x, y, 1, 88); ctx.fillRect(x + 103, y, 1, 88);
      glyphText("P" + (i + 1), x + 5, y + 5, color, 2, "left");
      glyphText(player.name, x + 30, y + 9, seat ? color : "#7f8ab0", 1, "left");
      const human = seat && !seat.orphaned, bot = !seat && lobby.versus;
      const sprite = Art.sprite(bot ? "spirit" : "pacman", { skin: player.skin, accessory: accessoryFor(player.skin), direction: 3, frame: human ? Math.floor(time * 9) % 4 : 2 });
      ctx.save(); if (!seat && !bot) ctx.globalAlpha = 0.35; blit(sprite, x + 88, y + 12); ctx.restore();
      const lines = [];
      if (!seat) {
        if (bot) lines.push(["BOT · " + lobby.botLevel.toUpperCase(), "#c4cced"]);
        if (lobby.touchOnly && i > 0) lines.push(["MORE PLAYERS:", "#7f8ab0"], ["DESKTOP ONLY", "#7f8ab0"]);
        else if (i === lobby.seats.humans) lines.push([bot ? "OR JOIN:" : "TO JOIN, PRESS", "#a4aed1"], [lobby.touchOnly ? "THE D-PAD" : "A DIRECTION OR A", blink ? "#fff6df" : "#a4aed1"]);
        else if (!bot) lines.push(["OPEN SEAT", "#4c557a"]);
      } else if (seat.orphaned) {
        lines.push(["DISCONNECTED", "#ff6474"], ["RECONNECT, OR", "#a4aed1"], ["JOIN ANOTHER", "#a4aed1"], ["DEVICE", "#a4aed1"]);
      } else {
        const info = Input.describeDevice(seat.device);
        lines.push([info.label, "#8fe9ff"], ["MOVE " + info.move, "#a4aed1"]);
        if (seat.ready) lines.push(["READY!", "#3ef06a", 2], [info.action + ": NOT READY", "#7f8ab0"]);
        else if (!seat.pips.every(Boolean)) lines.push(["PRESS EACH ARROW", "#fff6df"], ["PIPS", "pips"]);
        else lines.push(["PRESS " + info.action, blink ? "#ffe52c" : "#fff6df"], ["TO READY UP", "#fff6df"]);
        if (info.leave) lines.push([info.leave, "#4c557a"]);
      }
      let ly = y + 26;
      for (const [text, lineColor, scale] of lines) {
        if (lineColor === "pips") {
          seat.pips.forEach((on, d) => {
            const px = x + 22 + d * 16;
            ctx.fillStyle = on ? color : "#1f2438"; ctx.fillRect(px - 5, ly - 2, 11, 11);
            glyphText(ARROWS[d], px, ly, on ? "#05060c" : "#7f8ab0");
          });
          ly += 13; continue;
        }
        glyphText(text, x + 52, ly, lineColor, scale || 1);
        ly += scale === 2 ? 16 : 10;
      }
    }
    // Rules, bot level, warnings and the countdown under the seats.
    let y = 218;
    if (lobby.countdown !== null) glyphText("STARTING IN " + Math.ceil(lobby.countdown), W / 2, 222, "#3ef06a", 2);
    else for (const line of rules) { glyphText(line, W / 2, y, "#c4cced"); y += 9; }
    if (lobby.versus) glyphText((lobby.touchOnly ? "TAP HERE  BOTS: " : "[ ] OR LB/RB  BOTS: ") + lobby.botLevel.toUpperCase(), W / 2, 248, "#ffb8ff");
    if (keyboardSeats >= 3) glyphText("3+ ON ONE KEYBOARD MAY MISS KEYS", W / 2, 258, "#ffb44d");
    const waiting = lobby.seats.humans === 0 ? "WAITING FOR PLAYERS" : lobby.seats.allReady() ? "ALL READY!" : "WAITING FOR EVERYONE TO READY UP";
    glyphText(waiting, W / 2, 268, lobby.seats.allReady() ? "#3ef06a" : "#fff6df");
    glyphText(lobby.touchOnly ? "MENU: BACK" : "ESC / BACKSPACE: BACK TO TITLE", W / 2, 279, "#7f8ab0");
  }

  const api = Object.freeze({ createLobby, drawLobby, BOT_LEVELS, COUNTDOWN });
  root.AstraLobby = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
