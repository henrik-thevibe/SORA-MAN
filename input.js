/* Local multiplayer input: devices, seats and the ready-up sequence. No DOM here,
 * so node tests cover every join, ready and disconnect case.
 *
 * A device is one physical way to play: a keyboard scheme ("kb:arrows",
 * "kb:wasd", "kb:ijkl", "kb:numpad"), a gamepad ("pad:<index>") or the touch
 * deck ("touch"). In a multiplayer game each seat is bound to exactly one
 * device and only that device drives it. */
(function (root) {
  "use strict";
  // Keys are matched by event.code (their position), so WASD works on AZERTY too.
  const KEY_SCHEMES = Object.freeze({
    arrows: Object.freeze({ name: "ARROWS", move: "ARROW KEYS", action: "/", dirs: { ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3 }, actions: ["Slash", "Period", "ShiftRight"] }),
    wasd: Object.freeze({ name: "WASD", move: "W A S D", action: "Q", dirs: { KeyW: 0, KeyA: 1, KeyS: 2, KeyD: 3 }, actions: ["KeyQ", "KeyE", "ShiftLeft"] }),
    ijkl: Object.freeze({ name: "IJKL", move: "I J K L", action: "U", dirs: { KeyI: 0, KeyJ: 1, KeyK: 2, KeyL: 3 }, actions: ["KeyU", "KeyO"] }),
    numpad: Object.freeze({ name: "NUMPAD", move: "NUM 8 4 5 6", action: "NUM 0", dirs: { Numpad8: 0, Numpad4: 1, Numpad5: 2, Numpad2: 2, Numpad6: 3 }, actions: ["Numpad0", "Numpad7", "Numpad9"] }),
  });
  const CODES = new Map();
  for (const [id, scheme] of Object.entries(KEY_SCHEMES)) {
    for (const [code, dir] of Object.entries(scheme.dirs)) CODES.set(code, Object.freeze({ device: "kb:" + id, kind: "dir", dir }));
    for (const code of scheme.actions) CODES.set(code, Object.freeze({ device: "kb:" + id, kind: "action" }));
  }
  // Some virtual keyboards report no code; arrows still work through the key name.
  const KEY_FALLBACK = { ArrowUp: "ArrowUp", ArrowLeft: "ArrowLeft", ArrowDown: "ArrowDown", ArrowRight: "ArrowRight" };
  function resolveKey(code, key) {
    return CODES.get(code) || (code ? null : CODES.get(KEY_FALLBACK[key])) || null;
  }

  // Gamepad direction with hysteresis: a stick must pass 0.5 to press a direction
  // and falls below 0.35 to release it, so a resting stick never chatters.
  const PRESS = 0.5, RELEASE = 0.35;
  function padDirection(pad, previous = -1) {
    const pressed = (i) => Boolean(pad.buttons[i] && pad.buttons[i].pressed);
    if (pressed(12)) return 0;
    if (pressed(14)) return 1;
    if (pressed(13)) return 2;
    if (pressed(15)) return 3;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const along = [-ay, -ax, ay, ax];
    if (previous >= 0 && along[previous] >= RELEASE && along[previous] * 1.5 >= Math.max(...along)) return previous;
    if (Math.max(Math.abs(ax), Math.abs(ay)) < PRESS) return -1;
    return Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 1 : 3) : (ay < 0 ? 0 : 2);
  }

  function describeDevice(device) {
    if (!device) return null;
    if (device.startsWith("kb:")) {
      const scheme = KEY_SCHEMES[device.slice(3)];
      return { kind: "keyboard", label: "KEYBOARD " + scheme.name, move: scheme.move, action: scheme.action, leave: "HOLD " + scheme.action + ": LEAVE" };
    }
    if (device.startsWith("pad:")) return { kind: "gamepad", label: "GAMEPAD " + (Number(device.slice(4)) + 1), move: "D-PAD", action: "A", leave: "B: LEAVE" };
    return { kind: "touch", label: "TOUCH PAD", move: "D-PAD", action: "START", leave: "" };
  }

  // Seats fill from P1 in join order. A leaving player's later seats move up, so
  // humans always sit in P1..Pn. A disconnected pad keeps its seat (orphaned)
  // until the same pad returns or another device claims it.
  function createSeats(count = 4) {
    let seats = [];
    const blank = (device, padId) => ({ device, padId: padId || null, pips: [false, false, false, false], ready: false, orphaned: false });
    const find = (device) => seats.findIndex((seat) => seat.device === device && !seat.orphaned);
    const api = {
      get count() { return count; },
      get list() { return seats.map((seat, index) => ({ index, ...seat, pips: seat.pips.slice() })); },
      get humans() { return seats.length; },
      seatOf: (device) => find(device),
      orphans: () => seats.map((seat, index) => seat.orphaned ? index : -1).filter((index) => index >= 0),
      verified: (index) => Boolean(seats[index] && seats[index].pips.every(Boolean)),
      join(device, padId) {
        if (find(device) >= 0) return -1;
        const orphan = seats.findIndex((seat) => seat.orphaned);
        if (orphan >= 0) { seats[orphan] = blank(device, padId); return orphan; }
        if (seats.length >= count) return -1;
        seats.push(blank(device, padId));
        return seats.length - 1;
      },
      leave(device) {
        const index = find(device);
        if (index < 0) return -1;
        seats.splice(index, 1);
        return index;
      },
      // One input from a device; returns what happened, for sound and messages:
      // "join", "pip", "ready", "unready", "needPips", "leave", "full" or null.
      press(device, input, padId) {
        const index = find(device);
        if (index < 0) {
          if (input.kind === "back") return null;
          return api.join(device, padId) >= 0 ? "join" : "full";
        }
        const seat = seats[index];
        if (input.kind === "back") { api.leave(device); return "leave"; }
        if (input.kind === "dir") {
          if (seat.ready || seat.pips[input.dir]) return null;
          seat.pips[input.dir] = true;
          return "pip";
        }
        if (seat.ready) { seat.ready = false; return "unready"; }
        if (!seat.pips.every(Boolean)) return "needPips";
        seat.ready = true;
        return "ready";
      },
      disconnect(device) {
        const index = find(device);
        if (index < 0) return -1;
        seats[index].orphaned = true; seats[index].ready = false;
        return index;
      },
      // The same pad (by id) coming back takes its seat again, even at a new index.
      reconnect(device, padId) {
        const index = seats.findIndex((seat) => seat.orphaned && padId && seat.padId === padId);
        if (index < 0 || find(device) >= 0) return -1;
        Object.assign(seats[index], { device, orphaned: false });
        return index;
      },
      // Another device takes over the lowest orphaned seat, keeping its checks.
      claim(device, padId) {
        const index = seats.findIndex((seat) => seat.orphaned);
        if (index < 0 || find(device) >= 0) return -1;
        Object.assign(seats[index], { device, padId: padId || null, orphaned: false, pips: [false, false, false, false] });
        return index;
      },
      allReady: () => seats.length > 0 && seats.every((seat) => seat.ready && !seat.orphaned),
      // Settings changed or a match ended: everyone confirms again. Pips that
      // proved a device's directions stay proven.
      resetReady() { for (const seat of seats) seat.ready = false; },
      clear() { seats = []; },
      devices: () => seats.map((seat) => seat.orphaned ? null : seat.device),
    };
    return api;
  }

  const api = Object.freeze({ KEY_SCHEMES, resolveKey, padDirection, describeDevice, createSeats, PRESS, RELEASE });
  root.AstraInput = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
