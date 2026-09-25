/* Gameplay overlays for rulesets: pickups, beams, flames, ghost states, the
 * mode HUD and the results screen. Unlike effects.js these carry information
 * the player needs, so they draw in every visual mode, Purist included. */
(function (root) {
  "use strict";
  const PLAYER_COLORS = Object.freeze({ astra: "#ffe52c", nova: "#ff7ab4", vega: "#4fe3ff", lyra: "#6fe06a" });
  const GLITCH_COLORS = Object.freeze(["#ff2e88", "#20e0ff", "#ffe52c", "#7cff5b", "#b04bff"]);

  function createOverlays({ Art, Engine }) {
    const { WIDTH: W, MAP_Y, MAP_HEIGHT } = Art;
    let clock = 0;
    const point = (x, y) => Art.worldPoint(x, y);
    const statusOf = (actor, id) => actor.status && actor.status.find((status) => status.id === id);
    const blinkOff = (timeLeft, reducedMotion) => !reducedMotion && timeLeft < 3 && Math.floor(clock * 6) % 2 === 0;

    function tick(dt) { clock += dt; }

    // Size and opacity changes that power-ups make to a player.
    // Incognito stays visible enough to steer in co-op; Scale Up doubles at a whole-pixel scale.
    function playerStyle(pac) {
      const style = { alpha: 1, scale: 1 };
      if (statusOf(pac, "incognito")) style.alpha = 0.55;
      if (statusOf(pac, "scale-up")) style.scale = 2;
      return style;
    }

    function drawHazards(ctx, game) {
      const flames = game.ruleData?.hazards?.list;
      if (!flames) return;
      ctx.save();
      for (const flame of flames) {
        const [x, y] = Art.tilePoint(flame.x, flame.y), strength = Math.min(1, flame.time / flame.total + 0.25);
        const flicker = Math.floor(clock * 14 + flame.x * 3 + flame.y) % 3;
        ctx.globalAlpha = 0.85 * strength;
        ctx.fillStyle = "#ff5a2e"; ctx.fillRect(x - 3, y - 3 + (flicker === 0 ? 1 : 0), 6, 6 - (flicker === 0 ? 1 : 0));
        ctx.fillStyle = "#ffd24a"; ctx.fillRect(x - 1.5, y - 1 - flicker * 0.5, 3, 3);
      }
      ctx.restore();
    }

    function drawItems(ctx, game, { blit, reducedMotion }) {
      for (const item of game.items || []) {
        if (blinkOff(item.timeLeft, reducedMotion)) continue;
        const [x, y] = point(item.x, item.y);
        if (item.kind === "powerup") {
          const powerUp = Engine.POWERUPS.get(item.id);
          if (!powerUp) continue;
          const bob = reducedMotion ? 0 : Math.round(Math.sin(clock * 5) * 1);
          Art.drawPowerUp(ctx, powerUp, x, y + bob);
        } else if (item.kind === "runner") {
          // Versus: the runaway power pellet.
          // The glow breathes; the chip itself stays at whole-pixel size.
          const pulse = reducedMotion ? 1 : 1 + 0.15 * Math.sin(clock * 10);
          ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = "#ffd27a"; ctx.beginPath(); ctx.arc(x, y, 8 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          blit(Art.sprite("gpu"), x, y);
        } else if (item.kind === "revive") {
          // A fallen co-op player's token: their star, pulsing, waiting to be collected.
          const skin = Object.keys(PLAYER_COLORS)[item.player] || "astra";
          ctx.save(); ctx.globalAlpha = reducedMotion ? 0.8 : 0.55 + 0.35 * Math.sin(clock * 6);
          blit(Art.sprite("pacman", { skin, direction: 3, frame: 2 }), x, y);
          ctx.restore();
          ctx.strokeStyle = PLAYER_COLORS[skin]; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
        } else if (item.kind === "bench-bonus") {
          const pulse = reducedMotion ? 0.3 : 0.3 + 0.2 * Math.sin(clock * 6);
          ctx.save(); ctx.globalAlpha = pulse; ctx.fillStyle = item.color || "#ffb8ff"; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          blit(Art.sprite("bonus", { name: item.name }), x, y);
        }
      }
    }

    function drawBeams(ctx, game) {
      ctx.save();
      for (const pac of game.players || []) {
        const beam = statusOf(pac, "token-beam");
        if (pac.alive && beam && beam.data.cells && beam.data.cells.length) {
          // One strip per tile, along the beam's axis.
          const horizontal = beam.data.cells[0][1] === Math.floor(pac.y);
          ctx.globalAlpha = 0.55 + 0.35 * Math.abs(Math.sin(clock * 20));
          ctx.fillStyle = "#3fc6ff";
          for (const [cx, cy] of beam.data.cells) {
            const [x, y] = Art.tilePoint(cx, cy);
            if (horizontal) ctx.fillRect(x - 4, y - 1, 8, 2);
            else ctx.fillRect(x - 1, y - 4, 2, 8);
          }
          ctx.globalAlpha = 1; ctx.fillStyle = "#e8fbff";
          for (const [cx, cy] of beam.data.cells) { const [x, y] = Art.tilePoint(cx, cy); ctx.fillRect(x - 0.5, y - 0.5, 1, 1); }
        }
      }
      // One Constellation beam per linked pair, drawn by its lower-numbered player.
      for (const pac of game.players || []) {
        const linked = statusOf(pac, "linked"), partner = linked && game.players[linked.data.partner];
        if (!linked || !linked.data.active || !partner || partner.index < pac.index) continue;
        const [x1, y1] = point(pac.x, pac.y), [x2, y2] = point(partner.x, partner.y);
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, PLAYER_COLORS[pac.skin]); gradient.addColorStop(1, PLAYER_COLORS[partner.skin]);
        ctx.strokeStyle = gradient; ctx.lineCap = "round";
        ctx.globalAlpha = 0.35; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.restore();
    }

    // Versus: auras and tags over players (energised, bugs, prompt injection).
    const RAINBOW = ["#ff4f6d", "#ffb000", "#ffe52c", "#7cff5b", "#2ad4ff", "#b04bff"];
    const TAGS = Object.freeze({ inverted: "INV", sluggish: "SLOW", bait: "BAIT", muzzled: "MUTED" });
    function drawPlayerMarks(ctx, game, { glyphText, reducedMotion }) {
      for (const pac of game.players || []) {
        if (!pac.alive) continue;
        const [x, y] = point(pac.x, pac.y);
        // Every timed power-up or effect shows as a draining bar under its owner, in every mode.
        const timed = pac.status.filter((status) => Engine.STATUSES.get(status.id)?.label && Number.isFinite(status.time) && status.total > 0 && !TAGS[status.id] && status.id !== "injected");
        timed.slice(0, 2).forEach((status, i) => {
          const def = Engine.STATUSES.get(status.id), width = Math.max(1, Math.round(14 * Math.max(0, status.time / status.total)));
          ctx.fillStyle = "#000"; ctx.fillRect(Math.round(x - 8), Math.round(y + 8 + i * 3), 16, 3);
          ctx.fillStyle = def.color || "#fff6df"; ctx.fillRect(Math.round(x - 7), Math.round(y + 9 + i * 3), width, 1);
        });
        if (statusOf(pac, "incognito")) { ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = "#c9a6ff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
        if (statusOf(pac, "energized")) {
          ctx.save(); ctx.lineWidth = 1.5;
          ctx.strokeStyle = RAINBOW[Math.floor(clock * (reducedMotion ? 2 : 14)) % RAINBOW.length];
          ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        const injected = statusOf(pac, "injected");
        if (injected) glyphText(String(Math.ceil(injected.time)), x, y - 17, Math.floor(clock * 6) % 2 ? "#ff8a3d" : "#ffe52c");
        const bug = pac.status.find((status) => TAGS[status.id]);
        if (bug) glyphText(TAGS[bug.id], x, y + 12, "#65e2ef");
      }
    }
    // Versus: the arena's edges glitching shut.
    function drawArenaEdge(ctx, game, { reducedMotion }) {
      const versus = game.rules && game.rules.id === "versus" && game.ruleData.versus;
      if (!versus || !versus.margin) return;
      const margin = versus.margin, frame = reducedMotion ? 0 : Math.floor(clock * 12);
      ctx.save();
      for (let ty = 0; ty < Engine.ROWS; ty++) for (let tx = 0; tx < Engine.COLS; tx++) {
        if (!(tx < margin || tx >= Engine.COLS - margin || ty < margin || ty >= Engine.ROWS - margin)) continue;
        const [x, y] = Art.tilePoint(tx, ty);
        const n = ((tx * 73856093) ^ (ty * 19349663) ^ (frame * 83492791)) >>> 0;
        ctx.fillStyle = "#12001fdd"; ctx.fillRect(x - 4, y - 4, 8, 8);
        if (n % 5 === 0) { ctx.fillStyle = GLITCH_COLORS[n % GLITCH_COLORS.length]; ctx.fillRect(x - 4 + (n % 5), y - 3 + (n % 4), 3, 2); }
      }
      ctx.restore();
    }

    // Small signs over ghosts: asleep, stunned, slowed, charging.
    function drawGhostMarks(ctx, game, { glyphText, reducedMotion }) {
      for (const ghost of game.ghosts || []) {
        if (ghost.state === "EATEN" || ghost.state === "HOUSE") continue;
        const [x, y] = point(ghost.x, ghost.y);
        if (ghost.brain === "sleeper" && !ghost.brainState.awake) {
          const rise = reducedMotion ? 0 : Math.floor(clock * 3) % 3;
          glyphText("Z", x + 6, y - 14 - rise, "#c4cced");
        }
        if (ghost.brain === "charger" && ghost.brainState.charging && ghost.state === "CHASE") glyphText("!", x, y - 16, "#ff6474");
        if (statusOf(ghost, "stunned")) {
          ctx.fillStyle = "#ffe52c";
          for (let i = 0; i < 3; i++) {
            const angle = clock * 6 + i * Math.PI * 2 / 3;
            ctx.fillRect(Math.round(x + Math.cos(angle) * 7), Math.round(y - 9 + Math.sin(angle) * 2), 1, 1);
          }
        }
        if (statusOf(ghost, "slowed")) {
          ctx.save(); ctx.strokeStyle = "#9fe6ff"; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
    }

    // Hallucination's glitch: corrupted rows rising from the bottom of the maze.
    function drawGlitch(ctx, game, { reducedMotion, glyphText }) {
      const dream = game.ruleData && game.ruleData.hallucination;
      if (!dream || game.rules.id !== "hallucination") return;
      const top = MAP_Y + dream.glitchLine * 8, bottom = MAP_Y + MAP_HEIGHT + 40;
      if (top >= bottom) return;
      const frame = reducedMotion ? 0 : Math.floor(clock * 12);
      const noise = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263 + frame * 2246822519, 3266489917) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
      ctx.save();
      // The solid edge is the deletion line; noise only frays it downward.
      const danger = (game.players || []).some((pac) => pac.alive && pac.y > dream.glitchLine - 4);
      for (let x = 0; x < W; x += 4) {
        const edge = top + Math.floor(noise(x, dream.distance) * 4);
        ctx.fillStyle = "#12001fee"; ctx.fillRect(x, edge, 4, bottom - edge);
        for (let y = Math.floor(edge / 4) * 4; y < bottom; y += 4) {
          const n = noise(x, y + dream.distance * 8);
          if (n < 0.22) { ctx.fillStyle = GLITCH_COLORS[Math.floor(n * 100) % GLITCH_COLORS.length]; ctx.globalAlpha = 0.35 + n * 2; ctx.fillRect(x, y, 4, 2 + Math.floor(n * 12)); ctx.globalAlpha = 1; }
        }
      }
      if (danger) { ctx.fillStyle = !reducedMotion && Math.floor(clock * 8) % 2 ? "#ff2e88" : "#ffe52c"; ctx.fillRect(0, Math.round(top) - 1, W, 2); }
      ctx.restore();
      // SUNSET: whatever the glitch swallows is gone for good, like Sora's data after the export window.
      const label = top + 8;
      if (glyphText && label < MAP_Y + MAP_HEIGHT - 10 && (danger || reducedMotion || Math.floor(clock * 2) % 4 !== 0)) {
        ctx.fillStyle = "#000"; ctx.fillRect(W / 2 - 45, label - 1, 90, 10);
        glyphText(danger ? "CLIMB! CLIMB!" : "DELETE PENDING", W / 2, label, danger ? "#ffe52c" : "#ff6ad5");
      }
      // Co-op: the laggard near the bottom of the screen gets called out.
      const low = (game.players || []).filter((pac) => pac.alive && game.playerCount > 1 && pac.y > Engine.ROWS - 5);
      low.forEach((pac, i) => {
        const text = "P" + (pac.index + 1) + " KEEP UP!";
        ctx.fillStyle = "#000"; ctx.fillRect(W / 2 - 33, MAP_Y + MAP_HEIGHT - 22 - i * 10, 66, 10);
        glyphText(text, W / 2, MAP_Y + MAP_HEIGHT - 21 - i * 10, PLAYER_COLORS[pac.skin]);
      });
    }

    const clockText = seconds => {
      const whole = Math.ceil(seconds);
      return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
    };
    // Bottom-row readouts: the Benchmark clock and speed, active power-ups and
    // skill charge under each score.
    function drawHud(ctx, game, { glyphText, reducedMotion, hudGap = [4, W - 4] }) {
      if (game.state === "ATTRACT" || !game.rules) return;
      if (game.rules.id === "benchmark") {
        const bench = game.ruleData.benchmark || {};
        const low = bench.timeLeft <= 30, flash = low && !reducedMotion && Math.floor(clock * 4) % 2 === 0;
        glyphText(clockText(bench.timeLeft ?? 0), W / 2, 276, flash ? "#ff6474" : low ? "#ffb44d" : "#fff6df");
        glyphText("SPEED " + (1 + 0.045 * (bench.tier || 0)).toFixed(2), W - 6, 276, "#8fe9ff", 1, "right");
      }
      if (game.rules.id === "versus") {
        const versus = game.ruleData.versus || {}, T = game.rules.tuning || { roundSeconds: 120, closeAt: 75, maxBoost: 0.4, catchBoost: 0.2 };
        const elapsed = versus.elapsed || 0, left = Math.max(0, T.roundSeconds - elapsed), closing = elapsed >= T.closeAt, soon = !closing && T.closeAt - elapsed <= 10;
        const flash = soon && !reducedMotion && Math.floor(clock * 4) % 2 === 0;
        const text = closing ? (versus.margin >= versus.maxMargin ? "FINAL SANCTUARY" : "ARENA CLOSING") : "CLOSES IN " + clockText(T.closeAt - elapsed);
        glyphText(text, 8, 276, closing || flash ? "#ff6474" : soon ? "#ffb44d" : "#a4aed1", 1, "left");
        glyphText(clockText(left), W - 6, 276, "#fff6df", 1, "right");
        // Speed boost under each score; the notch marks the speed that catches the runner.
        game.players.forEach((pac, i) => {
          const x = 28 + i * 56, boost = (versus.boost || [])[i] || 0;
          ctx.fillStyle = "#1f2438"; ctx.fillRect(x - 12, 21, 24, 2);
          ctx.fillStyle = PLAYER_COLORS[pac.skin]; ctx.fillRect(x - 12, 21, Math.round(24 * boost / T.maxBoost), 2);
          ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(x - 12 + 24 * T.catchBoost / T.maxBoost), 20, 1, 1);
        });
      }
      if (game.rules.id === "hallucination") {
        const dream = game.ruleData.hallucination || {};
        const chain = Math.max(0, ...(dream.chain || [0]));
        const living = game.players.filter((pac) => pac.alive), spread = living.length > 1 ? Math.max(...living.map((p) => p.y)) - Math.min(...living.map((p) => p.y)) : 0;
        if (spread > 11 && (reducedMotion || Math.floor(clock * 4) % 2)) glyphText("STAY TOGETHER!", W / 2 + 8, 276, "#ff6ad5");
        else glyphText("DIST " + (dream.distance || 0), W / 2 + 8, 276, "#b04bff");
        glyphText("CHAIN " + chain, W - 6, 276, chain >= 16 ? "#ffb8ff" : "#8fe9ff", 1, "right");
      }
      const active = [];
      for (const pac of game.players || []) {
        for (const status of pac.status || []) {
          const def = Engine.STATUSES.get(status.id);
          if (def && def.label && status.time > 0 && Number.isFinite(status.time)) active.push({ label: def.label, color: def.color, time: status.time, total: status.total, owner: pac.index });
        }
      }
      if (active.length && !["benchmark", "hallucination", "versus"].includes(game.rules.id)) {
        // The newest effect, centred in the gap the life icons and fruit leave and cut to fit;
        // in co-op it names its owner. Every effect also drains as a bar under its player.
        const shown = active.reduce((a, b) => (b.total - b.time < a.total - a.time ? b : a)), [left, right] = hudGap, x = Math.round((left + right) / 2);
        const named = (game.playerCount > 1 ? "P" + (shown.owner + 1) + " " : "") + shown.label;
        const label = named.slice(0, Math.max(4, Math.floor((right - left) / 6)));
        glyphText(label, x, 273, shown.color);
        ctx.fillStyle = "#1f2438"; ctx.fillRect(x - 24, 282, 48, 2);
        ctx.fillStyle = shown.color; ctx.fillRect(x - 24, 282, Math.round(48 * Math.max(0, shown.time / shown.total)), 2);
      }
      if (game.rules.skills) {
        const xs = game.playerCount > 2 ? [28, 84, 140, 196] : game.playerCount === 2 ? [30, 194] : [42];
        game.players.forEach((pac, i) => {
          const skill = pac.skill && Engine.SKILLS.get(pac.skill);
          if (!skill || !pac.alive) return;
          const ready = pac.skillCooldown <= 0, fill = ready ? 1 : 1 - pac.skillCooldown / skill.cooldown;
          const color = PLAYER_COLORS[pac.skin];
          ctx.fillStyle = "#1f2438"; ctx.fillRect(xs[i] - 12, 21, 24, 2);
          ctx.fillStyle = ready && !reducedMotion && Math.floor(clock * 3) % 2 === 0 ? "#ffffff" : color;
          ctx.fillRect(xs[i] - 12, 21, Math.round(24 * fill), 2);
        });
      }
    }

    // Championship Edition style results: a bar per source of points.
    function drawResults(ctx, game, { glyphText, best, code, report, touch, pads, ready = true }) {
      const again = touch ? "START: AGAIN  MENU: TITLE" : pads ? "ENTER / A: AGAIN  B: TITLE" : "ENTER: AGAIN  ESC: TITLE";
      const result = game.result;
      if (!result || !(game.rules.results || game.daily || result.playerScores.length > 1)) return false;
      ctx.fillStyle = "#000000e6"; ctx.fillRect(8, MAP_Y + 16, W - 16, MAP_HEIGHT - 32);
      ctx.strokeStyle = "#2ad4ff"; ctx.lineWidth = 1; ctx.strokeRect(8.5, MAP_Y + 16.5, W - 17, MAP_HEIGHT - 33);
      glyphText(result.reason, W / 2, MAP_Y + 28, result.reason === "TIME UP" ? "#ffe52c" : "#ff6474", 2);
      glyphText(game.daily ? "DAILY " + game.daily.id + "  " + game.rules.name : game.rules.name, W / 2, MAP_Y + 50, "#8fe9ff");
      if (result.placements) {
        // Versus: final placings instead of point bars.
        const skins = Object.keys(PLAYER_COLORS);
        result.placements.forEach((place, i) => {
          const y = MAP_Y + 72 + i * 22, color = PLAYER_COLORS[skins[place.index]];
          glyphText(String(place.rank), 26, y, i === 0 ? "#ffe52c" : "#a4aed1", 2, "left");
          const humans = result.placements.filter((p) => p.human).length;
          const who = place.human ? (humans === 1 ? "  YOU" : "  P" + (place.index + 1)) : "  BOT";
          glyphText(place.name + who, 48, y + 3, color, 1, "left");
          glyphText(place.out ? "OUT" : place.spirit ? "SPIRIT" : "STANDING", 48, y + 12, "#7f8ab0", 1, "left");
          glyphText(String(place.score), W - 22, y + 3, "#fff6df", 1, "right");
        });
        if (report) glyphText("+" + report.xp + " XP  +" + report.credits + " CREDITS", W / 2, MAP_Y + 207, "#8fe9ff");
        if (ready && Math.floor(clock * 2) % 2 === 0) glyphText(again.replace("AGAIN", "REMATCH"), W / 2, MAP_Y + 227, "#fff6df");
        return true;
      }
      const rows = [["DOTS", result.stats.dot || 0, "#ffcf9a"], ["GHOSTS", result.stats.ghost || 0, "#35e7eb"], ["BONUS", result.stats.bonus || 0, "#ffb8ff"]];
      const top = Math.max(1, ...rows.map(([, value]) => value));
      rows.forEach(([label, value, color], i) => {
        const y = MAP_Y + 74 + i * 26;
        glyphText(label, 22, y, color, 1, "left");
        glyphText(String(value), W - 22, y, "#fff6df", 1, "right");
        ctx.fillStyle = "#1f2438"; ctx.fillRect(22, y + 10, W - 44, 5);
        ctx.fillStyle = color; ctx.fillRect(22, y + 10, Math.round((W - 44) * value / top), 5);
      });
      glyphText("TOTAL", W / 2, MAP_Y + 158, "#a4aed1");
      glyphText(String(result.score), W / 2, MAP_Y + 170, "#ffe52c", 2);
      (result.lines || []).forEach(([label, value], i) => glyphText(label + " " + value, W / 2, MAP_Y + 62 + i * 9, "#fff6df"));
      if (result.playerScores.length > 1) {
        const skins = Object.keys(PLAYER_COLORS), gap = (W - 32) / result.playerScores.length;
        result.playerScores.forEach((score, i) => glyphText(String(score), 16 + gap * (i + 0.5), MAP_Y + 186, PLAYER_COLORS[skins[i]]));
        // Co-op: the top scorer gets a mention.
        const mvp = result.playerScores.indexOf(Math.max(...result.playerScores));
        if (!result.lines.length && result.playerScores[mvp] > 0) glyphText("MVP  P" + (mvp + 1) + " " + Engine.PLAYERS[mvp].name, W / 2, MAP_Y + 62, PLAYER_COLORS[skins[mvp]]);
      }
      if (best) glyphText(result.score >= best ? "NEW BEST!" : "BEST " + best, W / 2, MAP_Y + 197, result.score >= best ? "#3ef06a" : "#a4aed1");
      if (report) glyphText("+" + report.xp + " XP  +" + report.credits + " CREDITS", W / 2, MAP_Y + 207, "#8fe9ff");
      if (code) glyphText(code + (touch ? "" : "  C COPY"), W / 2, MAP_Y + 217, "#ffb8ff");
      if (ready && Math.floor(clock * 2) % 2 === 0) glyphText(again, W / 2, MAP_Y + 227, "#fff6df");
      return true;
    }

    return { tick, playerStyle, drawHazards, drawItems, drawBeams, drawGhostMarks, drawPlayerMarks, drawArenaEdge, drawGlitch, drawHud, drawResults };
  }

  const api = Object.freeze({ createOverlays });
  root.AstraOverlays = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
