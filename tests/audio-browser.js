/* Real Web Audio integration checks, runnable from browser.html without a runner. */
(() => {
  const button = document.getElementById("runAudio"), result = document.getElementById("audioResults");
  const frame = document.getElementById("game");
  const frames = (count = 4) => new Promise(resolve => {
    function tick() { if (--count <= 0) resolve(); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  });
  // Most checks skip the boot screen; boot = true leaves it waiting for its press.
  const load = (boot = false) => new Promise(resolve => {
    frame.onload = () => { frame.scrollIntoView({ block: "center" }); if (!boot) frame.contentWindow.AstraLoader?.skip(); resolve(); };
    frame.src = "../index.html?audio-qa=" + Date.now();
  });
  const key = (w, value) => w.document.getElementById("screen").dispatchEvent(new w.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }));
  async function until(condition, timeout = 15000) {
    const end = performance.now() + timeout;
    while (!condition()) { if (performance.now() > end) throw new Error("Timed out waiting for game/audio transition"); await frames(1); }
  }
  button.onclick = async () => {
    const controls = [button, document.getElementById("run")]; controls.forEach(b => { b.disabled = true; });
    document.getElementById("stopSound").click();
    result.className = ""; result.textContent = "Checking actual browser playback…\n";
    const keys = ["pacman1980-high-score-v1", "pacman1980-muted-v1"];
    const saved = keys.map(key => localStorage.getItem(key)); let count = 0;
    const check = (condition, label) => { if (!condition) throw new Error(label); result.textContent += "PASS  " + label + "\n"; count++; };
    try {
      localStorage.setItem(keys[1], "false");
      await load(true); let w = frame.contentWindow, g = w.game;
      let snap = () => w.pacmanDebug.snapshot();
      check(w.AstraLoader.phase === "gate" && snap().audio.sources === 0, "the boot screen waits silently for a press");
      key(w, "Enter"); await until(() => w.AstraLoader.phase === "intro", 6000);
      check(snap().audio.channels.bootIntro === "bootIntro" && g.state === "ATTRACT", "the boot press plays the intro and does not reach the game");
      key(w, "Enter"); await frames(2);
      check(snap().audio.channels.titleSting === "titleSting" && !w.AstraLoader.active, "a second press skips to the title sting");
      await until(() => snap().audio.playingBed === "menuLoop", 4000);
      check(true, "the menu loop follows the sting");
      key(w, "ArrowDown"); await frames(1);
      check(snap().audio.channels.ui === "uiMove", "moving the title cursor ticks");
      key(w, "ArrowUp"); await frames(1);
      await load(); w = frame.contentWindow; g = w.game;
      check(snap().audio.sources === 0, "attract screen stays silent");
      // Delay native decoding to make startup races repeatable; this iframe alone is affected.
      const decode = w.AudioContext.prototype.decodeAudioData;
      w.AudioContext.prototype.decodeAudioData = function (bytes) {
        return new Promise(resolve => setTimeout(resolve, 250)).then(() => decode.call(this, bytes));
      };
      let starts = 0; const start = g.startGame.bind(g);
      g.startGame = () => { starts++; return start(); };
      w.document.getElementById("play").click(); key(w, "ArrowUp"); key(w, "Enter");
      check(snap().starting && g.state === "ATTRACT", "game waits for decoding before the READY countdown");
      await until(() => !snap().starting);
      check(starts === 1 && g.pacman.wanted === 0, "duplicate Start is serialized and the queued direction is kept");
      check(snap().audio.decodedClips === 36 && snap().audio.playingBed === "intro", "all 36 clips decode and opening music starts");
      await frames(12); key(w, "p"); await frames();
      const offset = snap().audio.musicOffset; await frames(12);
      check(g.state === "PAUSED" && snap().audio.sources === 0 && snap().audio.musicOffset === offset, "opening pause silences audio and freezes its offset");
      key(w, "Enter"); await until(() => !snap().resuming); await frames();
      check(g.state === "READY" && snap().audio.playingBed === "intro" && snap().audio.musicOffset >= offset, "opening resumes at the saved position");
      key(w, "m"); const mutedAt = snap().audio.musicOffset; await frames(12);
      check(snap().audio.sources === 0 && snap().audio.musicOffset > mutedAt, "muting is silent while music timing continues");
      key(w, "m"); await frames();
      check(snap().audio.playingBed === "intro", "unmute restores current music without restarting it");
      g.ghosts = []; await until(() => g.state === "PLAYING"); await frames();
      check(snap().audio.playingBed === "siren0", "complete opening finishes before normal play");
      check(!w.performance.getEntriesByType("resource").some(r => /\.(mp3|wav)(\?|$)/.test(r.name)), "gameplay requires no audio-file requests");

      g.tick = () => {}; g.startRound(false); g.state = "PLAYING"; g.drainEvents(); await frames();
      for (const [dots, clip] of [[0,"siren0"],[116,"siren1"],[180,"siren2"],[212,"siren3"],[228,"siren4"]]) {
        g.dotsEaten = dots; await until(() => snap().audio.playingBed === clip, 3000);
        check(snap().audio.playingBed === clip, "pellet progress selects " + clip);
      }
      g.beginFrightened(); await until(() => snap().audio.playingBed === "frightened", 3000);
      check(snap().audio.playingBed === "frightened", "power pellet selects the frightened loop");
      const before = snap().audio.starts; g.beginFrightened(); await frames();
      check(snap().audio.starts === before, "repeated power effect does not restart its loop");
      g.ghosts[0].state = g.ghosts[1].state = "EATEN"; g.emit("ghostEaten"); await until(() => snap().audio.playingBed === "returning", 3000);
      check(snap().audio.playingBed === "returning" && snap().audio.channels.effect === "ghost", "ghost capture plays its effect and returning-eyes loop");
      g.ghosts[0].state = "HOUSE"; g.emit("ghostHome"); await frames();
      check(snap().audio.playingBed === "returning", "first ghost home cannot silence another returning ghost");
      g.ghosts[1].state = "HOUSE"; g.emit("ghostHome"); await until(() => snap().audio.playingBed === "frightened", 3000);
      check(snap().audio.playingBed === "frightened", "last ghost home restores frightened audio");
      g.frightTimer = 0; g.finishFrightened(); await until(() => snap().audio.playingBed === "siren4", 3000);
      check(snap().audio.playingBed === "siren4", "power expiry restores the current siren stage");
      g.state = "DYING"; g.emit("death"); await until(() => snap().audio.channels.effect === "death", 3000);
      check(snap().audio.playingBed === null && snap().audio.channels.effect === "death", "death stops the loops and plays the death recording");

      delete g.tick; g.level = 2; g.advanceLevel(); await until(() => snap().audio.playingBed === "intermission", 3000);
      check(snap().audio.playingBed === "intermission", "intermission starts the complete music");
      w.dispatchEvent(new w.Event("blur")); await frames(); const intermissionAt = snap().audio.musicOffset;
      w.dispatchEvent(new w.Event("focus")); await frames();
      check(g.state === "PAUSED" && snap().audio.sources === 0 && snap().audio.musicOffset === intermissionAt, "focus loss pauses intermission and return requires explicit resume");
      key(w, "Enter"); await until(() => !snap().resuming); await frames();
      check(snap().audio.playingBed === "intermission", "intermission resumes from its saved position");
      await until(() => g.state === "READY");
      check(snap().audio.playingBed === null && g.readyKind === "round", "full intermission ends at a short silent READY");

      // Render the real production gain graph, not a separately recreated mix.
      for (const bite of [0, 1]) {
        const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
        const mixGame = new PacmanEngine.PacmanGame(0, PacmanSoundBank.timings);
        mixGame.state = "PLAYING";
        const audio = new ArcadeAudio(mixGame, { bank: PacmanSoundBank, contextFactory: () => ctx });
        await audio.prepare();
        // Offline contexts have no user-gesture activation; only bypass that guard.
        audio.canPlay = () => true; audio.waka = bite;
        audio.update(); audio.play("pellet"); audio.play("extraLife");
        const data = (await ctx.startRendering()).getChannelData(0);
        let peak = 0, sum = 0;
        for (const sample of data) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
        const rms = Math.sqrt(sum / data.length);
        check(peak > .1 && peak < .98 && rms > .02, `native mix with chomp ${bite ? "B" : "A"} has signal and headroom (peak ${peak.toFixed(3)})`);
      }
      await load(); w = frame.contentWindow; g = w.game;
      w.AudioContext = class { constructor() { throw new Error("Intentional audio QA device failure"); } };
      w.document.getElementById("play").click(); await until(() => !snap().starting);
      check(g.state === "READY" && snap().audio.status === "unavailable" && w.document.getElementById("mute").textContent === "NO AUDIO", "device failure reports NO AUDIO and still starts the game");
      g.readyTimer = 0; g.ghosts = []; await frames();
      check(g.state === "PLAYING", "silent fallback remains playable");
      result.className = "good"; result.textContent += `\nALL ${count} AUDIO BROWSER CHECKS PASSED\n`;
    } catch (error) {
      result.className = "bad"; result.textContent += "FAIL  " + error.message + "\n"; console.error(error);
    } finally {
      keys.forEach((key, i) => saved[i] === null ? localStorage.removeItem(key) : localStorage.setItem(key, saved[i]));
      await load(); controls.forEach(b => { b.disabled = false; }); result.scrollIntoView({ block: "center" });
    }
  };
})();
