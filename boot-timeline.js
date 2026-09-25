/* Timing shared by the boot screen (loader.js) and its sound, bootIntro (from
 * scripts/generate-astra-ui-audio.js), so every chomp lands on a chip. Times are
 * seconds after the boot press. */
(function (root) {
  "use strict";
  const W = 448, SPRITE = 32, LEFT = 10, CHIP_GAP = 24;
  const bar = Object.freeze({
    width: W, sprite: SPRITE, left: LEFT, right: W - LEFT - SPRITE, chipGap: CHIP_GAP,
    firstChip: LEFT + SPRITE + 4, chipLimit: W - 12,
  });
  const sweepStart = 0.3, sweepDuration = 3.2;
  // Chip centres, and when Astra's mouth reaches each one (a chip is eaten once
  // it is within 2 px of the sprite's middle).
  const chips = [];
  for (let cx = bar.firstChip; cx < bar.chipLimit; cx += CHIP_GAP) chips.push(cx);
  const progressAt = x => (x - LEFT) / (bar.right - LEFT);
  const chomps = chips.map(cx => progressAt(cx - SPRITE / 2 - 2))
    .filter(p => p > 0 && p < 1).map(p => sweepStart + p * sweepDuration);
  const timeline = Object.freeze({
    bar, chips: Object.freeze(chips), chomps: Object.freeze(chomps),
    sweepStart, sweepDuration,
    complete: sweepStart + sweepDuration + 0.1, // LOADING 100%: the "online" ping
    reveal: 3.8, // the panel fades and the covers are released
    whoosh: [4.1, 5.1], // the zip and whoosh in the boot sound
    sting: 5.0, // the title sting
    end: 6.25, // the boot sound's last sample
    covers: [4.1, 6.25], // the covers part through the sting and finish as the sound ends
    menuBed: 6.1, // the menu loop fades in under the sting's tail
    progress(t) { return Math.max(0, Math.min(1, (t - sweepStart) / sweepDuration)); },
  });
  if (typeof module !== "undefined" && module.exports) module.exports = timeline;
  else root.AstraBootTimeline = timeline;
})(globalThis);
