/* Local multiplayer input: key schemes, gamepad directions, seats, ready-up and the lobby. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Input = require("../input.js");
const Lobby = require("../lobby.js");

const ready = (seats, device) => {
  for (const dir of [0, 1, 2, 3]) seats.press(device, { kind: "dir", dir });
  return seats.press(device, { kind: "action" });
};

test("each key belongs to exactly one scheme, matched by position", () => {
  const seen = new Map();
  for (const [id, scheme] of Object.entries(Input.KEY_SCHEMES)) {
    for (const code of [...Object.keys(scheme.dirs), ...scheme.actions]) {
      assert.ok(!seen.has(code), `${code} is in ${seen.get(code)} and ${id}`);
      seen.set(code, id);
    }
  }
  assert.deepEqual(Input.resolveKey("KeyW"), { device: "kb:wasd", kind: "dir", dir: 0 });
  assert.deepEqual(Input.resolveKey("KeyQ"), { device: "kb:wasd", kind: "action" });
  assert.deepEqual(Input.resolveKey("Numpad2"), { device: "kb:numpad", kind: "dir", dir: 2 });
  assert.equal(Input.resolveKey("Numpad3"), null, "Numpad3 is not a game key");
  assert.equal(Input.resolveKey("Enter"), null, "system keys stay global");
  assert.equal(Input.resolveKey("", "ArrowLeft").dir, 1, "arrow names work without a code");
});

test("gamepad sticks have hysteresis and d-pads win", () => {
  const pad = (ax, ay, dpad = -1) => ({ axes: [ax, ay], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === dpad })) });
  assert.equal(Input.padDirection(pad(0.4, 0)), -1);
  assert.equal(Input.padDirection(pad(0.6, 0)), 3);
  assert.equal(Input.padDirection(pad(0.4, 0), 3), 3, "held until it drops under the release point");
  assert.equal(Input.padDirection(pad(0.3, 0), 3), -1);
  assert.equal(Input.padDirection(pad(0.45, -0.5), 3), 3, "a wobble toward a diagonal keeps the held direction");
  assert.equal(Input.padDirection(pad(0.9, 0, 12)), 0);
});

test("seats fill from P1 in join order and one device holds one seat", () => {
  const seats = Input.createSeats(4);
  assert.equal(seats.press("pad:1", { kind: "action" }), "join");
  assert.equal(seats.press("kb:wasd", { kind: "dir", dir: 2 }), "join");
  assert.equal(seats.seatOf("pad:1"), 0);
  assert.equal(seats.seatOf("kb:wasd"), 1);
  assert.equal(seats.join("kb:wasd"), -1, "no second seat for the same device");
  seats.press("kb:ijkl", { kind: "action" }); seats.press("pad:0", { kind: "action" });
  assert.equal(seats.press("kb:numpad", { kind: "action" }), "full");
  assert.equal(seats.humans, 4);
});

test("ready needs all four directions and then ACTION, from that seat's own device", () => {
  const seats = Input.createSeats(4);
  seats.press("kb:arrows", { kind: "dir", dir: 0 });
  seats.press("kb:wasd", { kind: "dir", dir: 0 });
  assert.equal(seats.press("kb:arrows", { kind: "action" }), "needPips");
  for (const dir of [0, 0, 1, 2]) seats.press("kb:arrows", { kind: "dir", dir });
  assert.equal(seats.press("kb:arrows", { kind: "action" }), "needPips", "repeated presses of one direction don't count twice");
  assert.equal(seats.press("kb:arrows", { kind: "dir", dir: 3 }), "pip");
  assert.equal(seats.press("kb:arrows", { kind: "action" }), "ready");
  assert.equal(seats.list[1].ready, false, "another device's presses never ready P2");
  assert.equal(seats.allReady(), false);
  assert.equal(ready(seats, "kb:wasd"), "ready");
  assert.equal(seats.allReady(), true);
  assert.equal(seats.press("kb:wasd", { kind: "dir", dir: 1 }), null, "directions don't change a ready seat");
  assert.equal(seats.press("kb:wasd", { kind: "action" }), "unready");
});

test("leaving moves later seats up; rematches keep seats and verified pips", () => {
  const seats = Input.createSeats(4);
  for (const d of ["kb:arrows", "kb:wasd", "pad:0"]) { seats.press(d, { kind: "action" }); ready(seats, d); }
  assert.equal(seats.press("kb:wasd", { kind: "back" }), "leave");
  assert.equal(seats.seatOf("pad:0"), 1);
  seats.resetReady();
  assert.equal(seats.allReady(), false);
  assert.equal(seats.press("pad:0", { kind: "action" }), "ready", "a verified device only confirms again");
});

test("a disconnected pad keeps its seat until it returns or another device takes it over", () => {
  const seats = Input.createSeats(4);
  seats.press("pad:0", { kind: "action" }, "Xbox A"); ready(seats, "pad:0");
  seats.press("pad:1", { kind: "action" }, "Xbox B"); ready(seats, "pad:1");
  assert.equal(seats.disconnect("pad:0"), 0);
  assert.equal(seats.allReady(), false, "an orphaned seat blocks the start");
  assert.equal(seats.seatOf("pad:1"), 1, "the other pad keeps P2; seats never shift on disconnect");
  assert.equal(seats.reconnect("pad:2", "Xbox C"), -1, "a different pad is not rebound automatically");
  assert.equal(seats.reconnect("pad:2", "Xbox A"), 0, "the same pad at a new index returns to P1");
  assert.equal(seats.list[0].ready, false, "it must ready again");
  seats.disconnect("pad:2");
  assert.equal(seats.claim("kb:ijkl"), 0, "another device can claim the orphaned seat");
  assert.equal(seats.verified(0), false, "and must prove its own controls");
  assert.equal(seats.press("kb:numpad", { kind: "action" }), "join");
  assert.equal(seats.seatOf("kb:numpad"), 2);
});

test("the lobby counts down only while everyone is ready and cancels on any change", () => {
  const lobby = Lobby.createLobby({ versus: true });
  assert.equal(lobby.tick(1), null);
  lobby.press("kb:wasd", { kind: "action" });
  for (const dir of [0, 1, 2, 3]) lobby.press("kb:wasd", { kind: "dir", dir });
  lobby.press("kb:wasd", { kind: "action" });
  assert.equal(lobby.countdown, Lobby.COUNTDOWN);
  assert.equal(lobby.tick(1.01), "tick");
  lobby.press("pad:0", { kind: "action" });
  assert.equal(lobby.countdown, null, "a new player joining cancels the countdown");
  for (const dir of [0, 1, 2, 3]) lobby.press("pad:0", { kind: "dir", dir });
  lobby.press("pad:0", { kind: "action" });
  assert.equal(lobby.countdown, Lobby.COUNTDOWN);
  lobby.setBotLevel(1);
  assert.equal(lobby.botLevel, "hard");
  assert.equal(lobby.countdown, null, "changing the bots makes everyone confirm again");
  assert.equal(lobby.seats.allReady(), false);
  lobby.press("kb:wasd", { kind: "action" }); lobby.press("pad:0", { kind: "action" });
  lobby.disconnect("pad:0");
  assert.equal(lobby.countdown, null);
  lobby.reconnect("pad:3", null);
  lobby.leave("pad:0");
  let result = null;
  for (let i = 0; i < 400 && result !== "start"; i++) result = lobby.tick(1 / 60) || result;
  assert.equal(lobby.seats.orphans().length, 1, "leave only works for a live device; the orphan still blocks");
  assert.notEqual(result, "start");
});

test("a touch-only lobby seats one touch player and explains the desktop limit", () => {
  const lobby = Lobby.createLobby({ versus: true, touchOnly: true });
  assert.equal(lobby.press("kb:wasd", { kind: "action" }), "desktopOnly");
  assert.equal(lobby.press("touch", { kind: "dir", dir: 0 }), "join");
  assert.equal(lobby.seats.humans, 1);
});
