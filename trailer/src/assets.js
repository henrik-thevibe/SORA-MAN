/* Asset loading. Stills are preloaded; footage frames load on demand: a draw
 * that touches a missing frame records it, and renderFrame loads and redraws. */
(function () {
  "use strict";
  const images = new Map(), metas = new Map(), frames = new Map(), missing = new Set();
  const CLIPS = ["classic", "remix", "sunset", "versus", "coop", "maze-neural", "maze-server", "maze-astra", "title", "wardrobe", "claude-chase", "sunset-glitch", "editor", "achievements",
    ...["token-beam", "scale-up", "hot-path", "rate-limit", "context-overflow", "rag", "incognito", "star-dash"].map((p) => "pu-" + p)];
  const STILLS = [
    ...["astra", "nova", "vega", "lyra"].flatMap((s) => [0, 1, 2, 3].map((f) => [`sprites/pac-${s}-${f}`, `out/sprites/pac-${s}-${f}.png`])),
    ...["blinky", "pinky", "inky", "clyde"].flatMap((g) => ["0", "1", "fright"].map((f) => [`sprites/ghost-${g}-${f}`, `out/sprites/ghost-${g}-${f}.png`])),
    ["sprites/gpu", "out/sprites/gpu.png"], ["sprites/chip", "out/sprites/chip.png"],
    ...["token-beam", "scale-up", "hot-path", "rate-limit", "context-overflow", "rag", "incognito"].map((p) => [`sprites/pu-${p}`, `out/sprites/pu-${p}.png`]),
  ];
  const load = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("load " + src)); i.src = src; });

  async function loadAll() {
    await Promise.all(STILLS.map(async ([key, src]) => images.set(key, await load(src))));
    await Promise.all(CLIPS.map(async (c) => metas.set(c, await (await fetch(`out/clips/${c}/meta.json`)).json())));
    await document.fonts.load('64px "AstraTitle"', "SORA-MAN");
  }
  const img = (key) => images.get(key);
  const meta = (clip) => metas.get(clip);
  function frame(clip, index) {
    const m = metas.get(clip);
    const i = Math.max(0, Math.min(m.frames - 1, Math.round(index)));
    const key = clip + "/" + i;
    const got = frames.get(key);
    if (got) return got;
    missing.add(key);
    return null;
  }
  async function fill() {
    if (!missing.size) return false;
    const keys = [...missing]; missing.clear();
    await Promise.all(keys.map(async (key) => {
      const [clip, i] = key.split("/");
      frames.set(key, await load(`out/clips/${clip}/${String(i).padStart(5, "0")}.png`));
    }));
    // Keep memory bounded: drop the oldest frames.
    if (frames.size > 400) for (const k of [...frames.keys()].slice(0, frames.size - 300)) frames.delete(k);
    return true;
  }
  Object.assign(TR, { loadAll, img, meta, frame, fill });
})();
