/* The profile screen: level and credits, a wardrobe of accessories per
 * character, power-up unlocks and the Hallucination loadout, and the
 * achievement list. Driven by abstract actions (up, down, left, right, select,
 * back) so keyboards, the touch pad and gamepads all work the same way. */
(function (root) {
  "use strict";
  const TABS = Object.freeze(["WARDROBE", "POWER-UPS", "ACHIEVEMENTS"]);
  const SKINS = Object.freeze(["astra", "nova", "vega", "lyra"]);
  const SKIN_COLORS = Object.freeze({ astra: "#ffe52c", nova: "#ff7ab4", vega: "#4fe3ff", lyra: "#6fe06a" });
  const DIM = "#7f8ab0", TEXT = "#fff6df", GOOD = "#3ef06a", GOLD = "#ffe29b";

  function createProfileScreen({ Art, Engine, Meta }) {
    const W = Art.WIDTH;
    let open = false, tab = 0, row = 0, skinIndex = 0, message = null, clock = 0;
    const wardrobe = () => [{ id: "default", name: "OWN LOOK" }, { id: "none", name: "NOTHING" }, ...Meta.ACCESSORIES];
    const powerUps = () => [...Engine.POWERUPS.values()];
    // Achievements for modes the title offers; the others stay hidden (their saved ids are kept).
    const achievements = () => Meta.ACHIEVEMENTS.filter((achievement) => !Meta.achievementAvailable || Meta.achievementAvailable(achievement));
    // Characters by their player names (the skin ids are internal).
    const nameOf = (skin) => (Engine.PLAYERS.find((player) => player.skin === skin) || { name: skin }).name;
    // Row 0 is the tab bar; the wardrobe's row 1 picks the character.
    function rowCount() {
      if (tab === 0) return 2 + wardrobe().length;
      if (tab === 1) return 1 + powerUps().length;
      return 1 + achievements().length;
    }
    // Blends two #rrggbb colours; t=0 gives a, t=1 gives b.
    function mixColor(a, b, t) {
      const ca = parseInt(a.slice(1), 16), cb = parseInt(b.slice(1), 16);
      return "#" + [16, 8, 0].map((s) => Math.round(((ca >> s) & 255) * (1 - t) + ((cb >> s) & 255) * t).toString(16).padStart(2, "0")).join("");
    }
    const say = (text, color = TEXT) => { message = { text, color, time: 2 }; };

    // Each result names the UI sound that fits it (see audio.js); none if nothing happened.
    function act(action, profile) {
      if (!open) return { changed: false };
      if (action === "back") { open = false; return { changed: false, closed: true, sound: "uiBack" }; }
      if (action === "up") row = (row + rowCount() - 1) % rowCount();
      else if (action === "down") row = (row + 1) % rowCount();
      else if ((action === "left" || action === "right") && row === 0) { tab = (tab + (action === "left" ? TABS.length - 1 : 1)) % TABS.length; row = 0; }
      else if ((action === "left" || action === "right") && tab === 0 && row === 1) skinIndex = (skinIndex + (action === "left" ? SKINS.length - 1 : 1)) % SKINS.length;
      else if (action === "select") return select(profile);
      else return { changed: false };
      return { changed: false, sound: action === "up" || action === "down" ? "uiMove" : "uiChange" };
    }
    function select(profile) {
      if (row === 0) { tab = (tab + 1) % TABS.length; return { changed: false, sound: "uiChange" }; }
      if (tab === 0 && row >= 2) {
        const item = wardrobe()[row - 2], skin = SKINS[skinIndex];
        let sound = "uiEquip";
        if (item.id !== "default" && item.id !== "none" && !profile.accessories.includes(item.id)) {
          const bought = Meta.buy(profile, "accessory", item.id);
          if (!bought.ok) { say(bought.reason, "#ff6474"); return { changed: false, sound: "uiDenied" }; }
          say("UNLOCKED " + item.name, GOOD); sound = "uiBuy";
        }
        Meta.equip(profile, skin, item.id);
        if (!message || message.color !== GOOD) say(item.name + " ON " + nameOf(skin));
        return { changed: true, sound };
      }
      if (tab === 1 && row >= 1) {
        const power = powerUps()[row - 1];
        if (!profile.powerUps.includes(power.id)) {
          const bought = Meta.buy(profile, "powerup", power.id);
          if (!bought.ok) { say(bought.reason, "#ff6474"); return { changed: false, sound: "uiDenied" }; }
          say("UNLOCKED " + power.name, GOOD);
          return { changed: true, sound: "uiBuy" };
        }
        Meta.toggleLoadout(profile, power.id);
        const added = profile.loadout.includes(power.id);
        say(added ? "ADDED TO LOADOUT" : "REMOVED FROM LOADOUT");
        return { changed: true, sound: added ? "uiLoadoutAdd" : "uiLoadoutRemove" };
      }
      return { changed: false };
    }

    // Laid out like play: the header in the score strip, the content in a
    // panel over the maze area, and the controls in the bottom strip.
    function draw(ctx, profile, { glyphText, blit, touch, pads, reducedMotion, dt = 0 }) {
      clock += dt;
      if (message && (message.time -= dt) <= 0) message = null;
      const top = Art.MAP_Y, bottom = Art.MAP_Y + Art.MAP_HEIGHT;
      ctx.fillStyle = "#05060c"; ctx.fillRect(0, 0, W, Art.HEIGHT);
      ctx.strokeStyle = "#2a3a6a"; ctx.lineWidth = 1; ctx.strokeRect(4.5, top + 0.5, W - 9, bottom - top - 1);
      glyphText("PROFILE", W / 2, 3, "#ffe52c");
      const level = Meta.levelInfo(profile.xp);
      glyphText("LV " + level.level, 10, 13, TEXT, 1, "left");
      ctx.fillStyle = "#1f2438"; ctx.fillRect(50, 15, 76, 3);
      ctx.fillStyle = "#8fe9ff"; ctx.fillRect(50, 15, Math.round(76 * level.into / level.need), 3);
      glyphText(profile.credits + " CREDITS", W - 10, 13, GOLD, 1, "right");
      // Tabs.
      let x = 12;
      TABS.forEach((name, i) => {
        const width = name.length * 6 - 1, on = i === tab;
        // While the tab row has focus the chosen tab pulses slowly: a glowing plate,
        // text brightening toward white and a thicker underline.
        const focus = on && row === 0, pulse = focus ? (reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(clock * 3)) : 0;
        if (focus) {
          ctx.save();
          ctx.globalAlpha = 0.18 + 0.3 * pulse; ctx.fillStyle = "#ff6fe0"; ctx.fillRect(x - 3, top + 4, width + 6, 13);
          ctx.globalAlpha = 0.5 + 0.5 * pulse; ctx.strokeStyle = "#ffb8ff"; ctx.lineWidth = 1; ctx.strokeRect(x - 2.5, top + 4.5, width + 5, 12);
          ctx.restore();
        }
        glyphText(name, x, top + 7, focus ? mixColor("#ffb8ff", "#ffffff", pulse) : on ? "#ffb8ff" : DIM, 1, "left");
        if (on) { ctx.fillStyle = focus ? mixColor("#ffb8ff", "#ffffff", pulse) : "#ffb8ff"; ctx.fillRect(x, top + 16, width, focus ? 2 : 1); }
        x += width + 12;
      });
      if (tab === 0) drawWardrobe(ctx, profile, glyphText, blit);
      else if (tab === 1) drawPowerUps(ctx, profile, glyphText, reducedMotion);
      else drawAchievements(ctx, profile, glyphText);
      if (message) glyphText(message.text, W / 2, bottom - 11, message.color);
      glyphText(pads ? "D-PAD MOVE  A PICK  B BACK" : touch ? "D-PAD MOVE  START PICK  PAUSE BACK" : "ARROWS MOVE  ENTER PICK  ESC BACK", W / 2, bottom + 6, DIM);
    }
    const cursor = (glyphText, y) => glyphText(">", 6, y, "#ffb8ff", 1, "left");

    function drawWardrobe(ctx, profile, glyphText, blit) {
      const skin = SKINS[skinIndex], items = wardrobe();
      const hovered = row >= 2 ? items[row - 2] : null;
      const worn = hovered ? hovered.id : profile.equipped[skin];
      if (row === 1) cursor(glyphText, 52);
      glyphText("<  " + nameOf(skin) + "  >", W / 2, 52, SKIN_COLORS[skin]);
      // The preview turns through all four facings so every angle of a piece shows.
      const frame = Math.floor(clock * 6) % 4, facing = [3, 2, 1, 0][Math.floor(clock / 1.5) % 4];
      blit(Art.sprite("pacman", { skin, accessory: worn, direction: facing, frame }), W / 2, 92, 4);
      items.forEach((item, i) => {
        const y = 130 + i * 12, selected = row === i + 2;
        if (selected) cursor(glyphText, y);
        const owned = item.id === "default" || item.id === "none" || profile.accessories.includes(item.id);
        const equipped = profile.equipped[skin] === item.id;
        glyphText(item.name, 16, y, selected ? TEXT : owned ? "#c4cced" : DIM, 1, "left");
        let status = equipped ? "WORN" : owned ? "OWNED" : item.cost + " CREDITS";
        if (!owned && Meta.levelInfo(profile.xp).level < item.level) status = "LV " + item.level;
        glyphText(status, W - 10, y, equipped ? GOOD : owned ? DIM : GOLD, 1, "right");
      });
    }
    function drawPowerUps(ctx, profile, glyphText, reducedMotion) {
      const list = powerUps();
      list.forEach((power, i) => {
        const y = 52 + i * 20, selected = row === i + 1;
        if (selected) cursor(glyphText, y);
        const owned = profile.powerUps.includes(power.id), loaded = profile.loadout.includes(power.id);
        // The pickup chip itself; locked ones are dimmed and the selected one bobs.
        const bob = selected && !reducedMotion ? Math.round(Math.sin(clock * 5)) : 0;
        ctx.save(); if (!owned) ctx.globalAlpha = 0.4;
        Art.drawPowerUp(ctx, power, 28, y + 3 + bob);
        ctx.restore();
        glyphText(power.name, 46, y, owned ? power.color : DIM, 1, "left");
        glyphText(loaded ? "LOADOUT" : owned ? "OWNED" : (Meta.POWERUP_COSTS[power.id] || 0) + " CREDITS", W - 10, y, loaded ? GOOD : owned ? DIM : GOLD, 1, "right");
      });
      // The selected power-up's description, full width under the list.
      const chosen = list[row - 1];
      if (chosen) {
        ctx.fillStyle = "#1f2438"; ctx.fillRect(16, 187, W - 32, 1);
        wrap(chosen.about, 16, 192, glyphText, "#a4aed1", 9, 3);
      }
      const loadout = profile.loadout.map((id) => Engine.POWERUPS.get(id)).filter(Boolean);
      // The loadout is what SUNSET brings; REMIX drops every power-up you own.
      const left = W / 2 - (83 + loadout.length * 28) / 2;
      glyphText("SUNSET LOADOUT", left, 234, "#8fe9ff", 1, "left");
      loadout.forEach((power, i) => Art.drawPowerUp(ctx, power, left + 101 + i * 28, 237));
    }
    function drawAchievements(ctx, profile, glyphText) {
      const list = achievements(), earned = list.filter((a) => profile.achievements[a.id]).length;
      glyphText(earned + " OF " + list.length + " EARNED", W / 2, 50, GOLD);
      const visible = 12, first = Math.max(0, Math.min(list.length - visible, row - 1 - Math.floor(visible / 2)));
      list.slice(first, first + visible).forEach((achievement, i) => {
        const index = first + i, y = 64 + i * 13, selected = row === index + 1, got = Boolean(profile.achievements[achievement.id]);
        if (selected) cursor(glyphText, y);
        glyphText(got ? "+" : "-", 16, y, got ? GOOD : DIM, 1, "left");
        glyphText(achievement.name, 26, y, got ? TEXT : "#a4aed1", 1, "left");
        glyphText(achievement.credits + " CREDITS", W - 10, y, got ? DIM : GOLD, 1, "right");
      });
      const current = list[row - 1];
      if (current) wrap(current.about.toUpperCase(), 16, 222, glyphText, "#8fe9ff");
    }
    // Word-wraps a line into two rows of 32 characters at most.
    function wrap(text, x, y, glyphText, color, gap = 9, count = 2) {
      const words = String(text).toUpperCase().replace(/[^A-Z0-9!.\-+:/ ]/g, "").split(" ");
      const lines = [""];
      for (const word of words) {
        if ((lines[lines.length - 1] + " " + word).trim().length > Math.floor((W - 10 - x) / 6)) lines.push(word);
        else lines[lines.length - 1] = (lines[lines.length - 1] + " " + word).trim();
      }
      lines.slice(0, count).forEach((line, i) => glyphText(line, x, y + i * gap, color, 1, "left"));
    }

    return {
      TABS, act, draw,
      open() { open = true; tab = 0; row = 1; message = null; },
      close() { open = false; },
      get isOpen() { return open; },
      get state() { return { tab: TABS[tab], row, skin: SKINS[skinIndex] }; },
    };
  }

  const api = Object.freeze({ createProfileScreen });
  root.AstraProfileScreen = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
