/* The edit: one source of truth for shot timing, footage segments, transitions,
 * slow-motion and sound cues. Loaded by the studio (browser) and by
 * audio/score.mjs (node). 128 BPM: 1 beat = 0.46875 s, 1 bar = 1.875 s. */
(function (root) {
  "use strict";
  const BAR = 1.875, BEAT = BAR / 4, FPS = 30;
  const B = (n) => +(n * BAR).toFixed(5);

  // Shots in order: [name, start bar, end bar].
  const SHOTS = [
    ["open", 0, 4], ["hunters", 4, 9], ["title", 9, 11], ["classic", 11, 19], ["remix", 19, 31],
    ["sunset", 31, 40], ["versus", 40, 46], ["rapid", 46, 50], ["chase", 50, 52], ["tribute", 52, 55.5], ["end", 55.5, 59.5],
  ].map(([name, a, b]) => ({ name, t0: B(a), t1: B(b) }));

  // Transitions between shots, centred on the cut.
  const TRANSITIONS = [
    { at: B(4), dur: 0.7, type: "iris", from: "open", to: "hunters", focusA: [960, 520], focusB: [1290, 560] },
    { at: B(11), dur: 0.9, type: "chomp", from: "title", to: "classic" },
    { at: B(19), dur: 0.9, type: "chomp", from: "classic", to: "remix" },
    { at: B(31), dur: 0.8, type: "glitch", from: "remix", to: "sunset" },
    { at: B(40), dur: 0.8, type: "glitch", from: "sunset", to: "versus" },
    { at: B(46), dur: 0.7, type: "iris", from: "versus", to: "rapid", focusA: [960, 600], focusB: [560, 540] },
    { at: B(50), dur: 0.9, type: "chomp", from: "rapid", to: "chase" },
    { at: B(55.5), dur: 0.8, type: "iris", from: "tribute", to: "end", focusA: [960, 380], focusB: [960, 790] },
  ];

  // Footage segments: clip frame `f` is on screen at time `at`, played at `speed`.
  // `role` separates layers inside one shot (the remix showcases use "setup", "after" and "montage").
  const SEG = (shot, t0, t1, clip, at, f, o = {}) => ({ shot, t0, t1, clip, at, f, ...o });
  // VERSUS: the moment the game declares Sora the winner (clip frame 760), 2 s into the last beat.
  const VERSUS_WIN = B(44.5) + 2;
  // Back-to-back segments with continuous frames and varying speed: ramps = [[seconds, speed], ...].
  function ramp(shot, t0, clip, f0, ramps, o = {}) {
    const out = [];
    let t = t0, f = f0;
    for (const [dur, speed] of ramps) { out.push(SEG(shot, t, t + dur, clip, t, f, { speed, ...o })); t += dur; f += dur * FPS * speed; }
    return out;
  }
  // The remix showcases: pickup frame (the power-up is grabbed) and the frame of its effect.
  // Four heroes get two bars each; the rest whip past in a two-bar montage.
  const SHOWCASES = [
    { power: "token-beam", clip: "pu-token-beam", target: "blinky", pickup: 16, impact: 17 },
    { power: "scale-up", clip: "pu-scale-up", target: "blinky", pickup: 16, impact: 32 },
    { power: "hot-path", clip: "pu-hot-path", target: "blinky", pickup: 12, impact: 19 },
    { power: "context-overflow", clip: "pu-context-overflow", target: "blinky", pickup: 12, impact: 26 },
  ].map((s, i) => ({ ...s, t0: B(21 + i * 2), split: B(22 + i * 2), t1: B(23 + i * 2) }));
  const MONTAGE = [
    { power: "rate-limit", clip: "pu-rate-limit", impact: 30 },
    { power: "rag", clip: "pu-rag", impact: 30 },
    { power: "incognito", clip: "pu-incognito", impact: 20 },
    { power: "star-dash", clip: "pu-star-dash", impact: 27 },
  ].map((s, i) => ({ ...s, t0: B(29 + i / 2), t1: B(29 + (i + 1) / 2) }));
  const SLOWMO = [];
  const showcaseSegments = SHOWCASES.flatMap((s) => {
    // Bar 1: a beat of held setup, then the approach, landing the pickup on the bar line.
    const approach = s.split - (s.t0 + BEAT);
    // Frame 3 onward: the game's READY! has cleared by then.
    const co = { you: 1, item: 1, ring: s.target ? [s.target] : [] };
    const setup = [SEG("remix", s.t0, s.t0 + BEAT, s.clip, s.t0, 3, { speed: 0, role: "setup", power: s.power, callouts: co }),
      SEG("remix", s.t0 + BEAT, s.split, s.clip, s.t0 + BEAT, 3, { speed: (s.pickup - 3) / (approach * FPS), role: "setup", power: s.power, callouts: co })];
    // Bar 2: the same screen plays on from the pickup, slowing right through the impact, then snapping back.
    const lead = (s.impact - s.pickup) / FPS;
    const after = ramp("remix", s.split, s.clip, s.pickup, [[Math.min(0.35, lead), 1], [0.9, 0.4], [BAR - Math.min(0.35, lead) - 0.9, 1]], { role: "after", power: s.power, callouts: { you: 1 } });
    SLOWMO.push({ t0: after[1].t0, t1: after[1].t1 });
    return [...setup, ...after];
  });
  // Montage cuts: each lands a few frames before its effect.
  const montageSegments = MONTAGE.map((m) => SEG("remix", m.t0, m.t1, m.clip, m.t0, Math.max(3, m.impact - 8), { role: "montage", power: m.power, callouts: { you: 1 } }));

  const SEGMENTS = [
    // CLASSIC: chomp, the energizer on the bar, the 200-400-800-1600 chain, then Claude on Sora's tail.
    SEG("classic", B(11), B(13), "classic", B(11), 140, { zoom: 1.3, callouts: { you: 1, trail: 1 } }),
    // One energizer run: the pellet on beat 3, then 200, 400 and 800 (clip frames 512, 583, 619, 655).
    SEG("classic", B(13), B(16.5), "classic", B(13) + BEAT * 2, 512, { zoom: 1.6, callouts: { you: 1, trail: 1 } }),
    // The fourth eat of the same run, 1600, just after the cut (clip frame 778), with a 3-frame hit-stop on it.
    SEG("classic", B(16.5), B(16.5) + 7 / FPS, "classic", B(16.5), 772, { zoom: 1.8, callouts: { you: 1, trail: 1 } }),
    SEG("classic", B(16.5) + 7 / FPS, B(16.5) + 10 / FPS, "classic", B(16.5) + 7 / FPS, 779, { speed: 0, zoom: 1.8, zoomIn: false, callouts: { you: 1, trail: 1 } }),
    SEG("classic", B(16.5) + 10 / FPS, B(17), "classic", B(16.5) + 10 / FPS, 779, { zoom: 1.8, zoomIn: false, callouts: { you: 1, trail: 1 } }),
    SEG("classic", B(17), B(19), "claude-chase", B(17), 34, { zoom: 1.7, callouts: { you: 1, trail: 1, ring: ["blinky"] } }),
    // REMIX: intro, then eight showcases.
    SEG("remix", B(19), B(21), "remix", B(19), 12),
    ...showcaseSegments,
    ...montageSegments,
    // SUNSET: the climb, a 128 chain, the 256 clear, the glitch swallowing the maze.
    SEG("sunset", B(31), B(32), "sunset", B(31), 20),
    SEG("sunset", B(32), B(34), "sunset", B(32), 96),
    // The x128 run cuts straight to the clear, so the flash lands on the cut.
    SEG("sunset", B(34), B(36), "sunset", B(34) + BEAT * 2, 636, { zoom: 1.5 }),
    SEG("sunset", B(36), B(36.5), "sunset", B(36), 1141, { zoom: 1.3 }),
    SEG("sunset", B(36.5), B(40), "sunset-glitch", B(36.5), 88, { callouts: { you: 1, glitch: 1 } }),
    // VERSUS.
    SEG("versus", B(40), B(41), "versus", B(40), 10),
    // Sora eats Nova on beat 3 (clip frame 302), then Lyra (343).
    SEG("versus", B(41), B(43), "versus", B(41) + BEAT * 2, 302, { zoom: 1.3, callouts: { tags: 1 } }),
    // The edges closing in, the whole arena in view.
    SEG("versus", B(43), B(44.5), "versus", B(43), 500, { callouts: { tags: 1 } }),
    // The arena's last seconds; the cut lands before the results screen (game over at clip frame 895).
    // Close on Sora in the last safe tiles as the glitch takes the others (754-759), then the game's own
    // result: 1 SORA, STANDING (frame 760 on).
    SEG("versus", B(44.5), VERSUS_WIN, "versus", B(44.5), 700, { zoom: 1.6, callouts: { tags: 1 } }),
    SEG("versus", VERSUS_WIN, B(46), "versus", VERSUS_WIN, 760),
    // RAPID FIRE: six cuts of two-thirds of a bar.
    // Each cut shows what its checklist line says: mazes, the editor, co-op, the wardrobe, achievements, the menu.
    ...["maze-neural", "editor", "coop", "wardrobe", "achievements", "title"].map((clip, i) =>
      SEG("rapid", B(46 + i * 2 / 3), B(46 + (i + 1) * 2 / 3), clip, B(46 + i * 2 / 3), [40, 0, 90, 34, 20, 120][i])),
  ];

  // The terminal lines of the cold open; the key-click sounds read the same schedule.
  const TYPING = [
    { text: "SORA-MAN // AI ARCADE", at: 0.3, cps: 28 },
    { text: "DENOISING", at: 1.3, cps: 22 },
  ];
  const keyTimes = () => TYPING.flatMap((l) => [...l.text].map((c, i) => ({ t: l.at + i / l.cps, space: c === " " })));

  const DROP_HUSH = B(9) - BEAT / 2, STING = B(58);
  // Pellet-trail text reveals: start time and seconds per line.
  const REVEALS = {
    pack: { t0: B(8) + 0.3, per: 0.55 }, gpu: { t0: B(13) + 0.3, per: 0.45 }, claude: { t0: B(17.25) + 0.3, per: 0.35 },
    remix: { t0: B(19) + 0.5, per: 0.8 }, cta: { t0: B(56) + 0.3, per: 0.6 },
  };
  // Hand-placed sound cues (footage events and key clicks are added by audio/score.mjs).
  const CUES = [
    { t: 0.0, sfx: "static", gain: 0.45 },
    { t: B(1.5), sfx: "glitch", gain: 0.7 },
    { t: B(1.75), sfx: "sparkle", gain: 0.7 },
    { t: B(2), sfx: "boom", gain: 0.8 },
    // MEET SORA: one munch per chomp, from the slam to the cut.
    ...[0, 1, 2, 3].map((i) => ({ t: B(3) + i * BEAT, sfx: i % 2 ? "munchB" : "munchA", gain: 0.9 })),
    { t: B(4), sfx: "iris", gain: 0.7 },
    ...[0, 1, 2, 3].map((i) => ({ t: B(4 + i), sfx: "slam", gain: 1 })),
    ...[1, 2, 3].map((i) => ({ t: B(4 + i) - 0.12, sfx: "iris", gain: 0.5 })),
    { t: B(8), sfx: "slam", gain: 1 },
    // Silence before the drop: one lone waka, then the title.
    { t: DROP_HUSH, sfx: "munchA", gain: 1 },
    { t: B(9), sfx: "titleSting", gain: 0.9 }, { t: B(9), sfx: "boom", gain: 1 },
    { t: B(9.75), sfx: "slam", gain: 0.8 },
    // Chomp wipes travel left to right; showcase whips come in from the right.
    ...[11, 19, 50].map((n) => ({ t: B(n) - 0.3, sfx: "chomp", gain: 0.8, pan: [-0.85, 0.85] })),
    { t: B(19.5), sfx: "slam", gain: 0.9 },
    ...SHOWCASES.map((s) => ({ t: s.t0, sfx: "whoosh", gain: 0.5, pan: [0.8, -0.2] })),
    ...SHOWCASES.map((s) => ({ t: s.split, sfx: "slam", gain: 0.6 })),
    ...MONTAGE.map((m) => ({ t: m.t0, sfx: "whoosh", gain: 0.45, pan: [0.8, -0.2] })),
    { t: B(31) - 0.2, sfx: "glitch", gain: 0.9 },
    { t: B(39), sfx: "roar", gain: 1 },
    { t: B(40) - 0.2, sfx: "glitch", gain: 0.8 },
    { t: B(46), sfx: "iris", gain: 0.6 },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ t: B(46 + i * 2 / 3), sfx: "uiConfirm", gain: 0.6 })),
    { t: B(51) - BEAT, sfx: "frightened", gain: 0.8 },
    { t: B(52), sfx: "powerDown", gain: 0.9 },
    { t: B(52) + 1.6, sfx: "sparkle", gain: 0.25 },
    { t: B(53.7), sfx: "glitch", gain: 0.4 },
    { t: B(54.75), sfx: "sparkle", gain: 0.8 },
    { t: B(55.5), sfx: "munchA", gain: 1 }, { t: B(55.5), sfx: "boom", gain: 1 }, { t: B(55.5), sfx: "extraLife", gain: 0.7 },
    // Post-logo stinger: Claude peeks, Sora eats the PLAY NOW! badge.
    { t: STING, sfx: "munchA", gain: 1 }, { t: STING + BEAT / 2, sfx: "munchB", gain: 1 },
    { t: STING + BEAT * 2, sfx: "sparkle", gain: 0.6 },
    // Pellet-trail reveals: a quiet munch run under each.
    ...Object.values(REVEALS).map((r) => ({ t: r.t0, sfx: "chomp", gain: 0.3 })),
  ];

  // Motion-blur windows (5 sub-frames across a 180 degree shutter).
  const BLUR = [
    ...TRANSITIONS.map((x) => ({ t0: x.at - x.dur / 2, t1: x.at + x.dur / 2 })),
    ...SHOWCASES.map((s) => ({ t0: s.t0, t1: s.t0 + 0.32 })),
    ...MONTAGE.map((m) => ({ t0: m.t0, t1: m.t0 + 0.27 })),
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ t0: B(46 + i * 2 / 3), t1: B(46 + i * 2 / 3) + 0.27 })),
    { t0: B(50), t1: B(52) }, { t0: B(9), t1: B(11) },
    ...[B(11), B(11.5), B(12), B(19), B(32), B(32.5), B(33), B(36.5), B(37.25), B(40), B(41), B(43)].map((t) => ({ t0: t, t1: t + 0.25 })),
    { t0: STING - 0.2, t1: STING + 0.9 },
  ];
  // The big moments: a 2-frame, 6 px screen shake plus a chromatic punch. The 1600 eat, each showcase's
  // impact, 256 SCREEN CLEAR, DELETED and the stinger's GULP.
  const impactAt = (s) => { const lead = (s.impact - s.pickup) / FPS; return s.split + (lead <= 0.35 ? lead : 0.35 + (lead - 0.35) / 0.4); };
  const IMPACTS = [B(16.5) + 6 / FPS, ...SHOWCASES.map(impactAt), B(36), B(39), VERSUS_WIN, STING + BEAT / 2];
  const shakeAt = (t) => { for (const h of IMPACTS) if (t >= h && t < h + 2 / FPS) { const k = Math.floor((t - h) * FPS); return k ? [-6, 4] : [6, -4]; } return [0, 0]; };
  // Impacts that get a chromatic-aberration punch.
  const PUNCH = [...CUES.filter((c) => ["slam", "boom", "titleSting"].includes(c.sfx)).map((c) => c.t), ...IMPACTS];
  const blurAt = (t) => BLUR.some((w) => t >= w.t0 && t < w.t1);

  const duration = B(59.5);
  const shotAt = (t) => SHOTS.find((s) => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  const shotNamed = (name) => SHOTS.find((s) => s.name === name);
  const segmentAt = (t, shot, role) => SEGMENTS.find((s) => (!shot || s.shot === shot) && (role === undefined || s.role === role) && t >= s.t0 && t < s.t1) || null;
  const transitionAt = (t) => TRANSITIONS.find((x) => t >= x.at - x.dur / 2 && t < x.at + x.dur / 2) || null;
  const showcaseAt = (t) => SHOWCASES.find((s) => t >= s.t0 && t < s.t1) || null;
  const montageAt = (t) => MONTAGE.find((m) => t >= m.t0 && t < m.t1) || null;
  const api = { IMPACTS, VERSUS_WIN, shakeAt, REVEALS, DROP_HUSH, STING, BLUR, PUNCH, blurAt, BAR, BEAT, FPS, B, SHOTS, TRANSITIONS, SEGMENTS, SHOWCASES, MONTAGE, SLOWMO, TYPING, keyTimes, CUES, duration, shotAt, shotNamed, segmentAt, transitionAt, showcaseAt, montageAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TIMELINE = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
