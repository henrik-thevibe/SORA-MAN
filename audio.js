/* Astra-Man sound set (sound-bank.js). No network requests or external audio library at runtime. */
(function (root) {
  "use strict";
  const MASTER_GAIN = 0.65, RAMP = 0.003;
  const SIREN_THRESHOLDS = Object.freeze([116, 180, 212, 228]);
  const REQUIRED_CLIPS = Object.freeze(["intro", "intermission", "death", "fruit", "ghost", "extraLife", "munchA", "munchB", "siren0", "siren1", "siren2", "siren3", "siren4", "frightened", "returning", "powerUp", "zap",
    "bootIntro", "titleSting", "menuLoop", "uiMove", "uiChange", "uiConfirm", "uiBack", "uiClick", "soundOn", "soundOff", "uiBuy", "uiEquip", "uiLoadoutAdd", "uiLoadoutRemove", "uiDenied", "tally", "levelUp", "achievement", "gameOver", "alarm", "victory", "readyUp"]);
  // Menu and button sounds share one voice, so a fast cursor never stacks up.
  // Longer cues (boot, sting, results) each get their own channel and can overlap.
  const UI_NAV = Object.freeze(new Set(["uiMove", "uiChange", "uiConfirm", "uiBack", "uiClick", "soundOn", "soundOff", "uiBuy", "uiEquip", "uiLoadoutAdd", "uiLoadoutRemove", "uiDenied"]));
  const MENU_FADE = 1.2;

  function backgroundClip(game) {
    if (game.state !== "PLAYING") return null;
    // The ghost-eat pause is silent apart from the eating sound itself.
    if (game.freezeTimer > 0) return null;
    // Versus has no fright and its ghosts are sent home, not eaten: a steady arena
    // siren that climbs once the edges start closing.
    if (game.rulesetId === "versus") return (game.ruleData.versus && game.ruleData.versus.margin) ? "siren3" : "siren1";
    if (game.ghosts.some(ghost => ghost.state === "EATEN")) return "returning";
    if (game.frightTimer > 0) return "frightened";
    // Thresholds are the arcade's dot counts, scaled to the current maze.
    const scale = (game.dotsTotal || 244) / 244;
    return "siren" + SIREN_THRESHOLDS.filter(count => game.dotsEaten >= count * scale).length;
  }
  // The title loop plays only when game.js allows it (after the boot or sting, not over the quit outro).
  function bedFor(game, { menuBed = false } = {}) {
    if (game.state === "ATTRACT") return menuBed ? { key: "menuLoop", offset: 0, loop: true, fadeIn: MENU_FADE } : null;
    if (game.state === "READY" && game.readyKind === "intro") {
      return { key: "intro", offset: Math.max(0, game.timings.introDuration - game.readyTimer), loop: false };
    }
    if (game.state === "INTERMISSION") {
      return { key: "intermission", offset: Math.max(0, game.timings.intermissionDuration - game.intermissionTimer), loop: false };
    }
    const key = backgroundClip(game);
    return key ? { key, offset: 0, loop: true } : null;
  }
  function withDeadline(promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Audio preparation timed out.")), 5000);
      Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }
  function bytesFromBase64(value) {
    const binary = root.atob(value), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  class ArcadeAudio {
    constructor(game, options = {}) {
      this.game = game;
      this.bank = options.bank || root.PacmanSoundBank;
      this.contextFactory = options.contextFactory || (() => {
        // The boot screen creates the context inside its "press any key" gesture.
        if (root.AstraAudioContext) return root.AstraAudioContext;
        const Context = root.AudioContext || root.webkitAudioContext;
        if (!Context) throw new Error("Web Audio is unavailable.");
        return new Context();
      });
      this.onError = options.onError || (error => console.warn("Sound unavailable:", error.message));
      this.context = null; this.master = null; this.uiBus = null;
      this.buffers = new Map(); this.channels = new Map(); this.sources = new Set(); this.uiSources = new Set();
      this.enabled = false; this.held = false; this.muted = false; this.menuBed = false; this.volume = 1;
      this.status = "idle"; this.error = null; this.waka = 0;
      this.preparation = null; this.activation = null;
      this.starts = 0; this.lastEffect = null;
    }

    prepare() {
      if (this.preparation) return this.preparation;
      this.status = "loading";
      // Initialize synchronously so unlock() can resume inside the original user gesture.
      let decoding;
      try {
        if (!this.bank?.clips || REQUIRED_CLIPS.some(key => !this.bank.clips[key]?.data)) throw new Error("The sound bank is missing or incomplete.");
        this.context = this.contextFactory();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted || this.held ? 0 : MASTER_GAIN * this.volume;
        this.master.connect(this.context.destination);
        // UI sounds bypass the pause hold (a PAUSE click is still heard) but not mute.
        this.uiBus = this.context.createGain();
        this.uiBus.gain.value = this.muted ? 0 : MASTER_GAIN * this.volume;
        this.uiBus.connect(this.context.destination);
        decoding = Promise.all(Object.entries(this.bank.clips).map(async ([key, clip]) => {
          const buffer = await this.context.decodeAudioData(bytesFromBase64(clip.data));
          return [key, buffer];
        }));
      } catch (error) { decoding = Promise.reject(error); }
      this.preparation = withDeadline(decoding).then(entries => {
        if (this.status === "unavailable") return false;
        this.buffers = new Map(entries); this.status = "ready"; return true;
      }).catch(error => { this.fail(error); return false; });
      return this.preparation;
    }

    unlock() {
      const preparation = this.prepare();
      if (this.status === "unavailable") return Promise.resolve(false);
      if (this.activation) return this.activation;
      let resuming;
      try { resuming = this.context.state === "suspended" ? this.context.resume() : Promise.resolve(); }
      catch (error) { resuming = Promise.reject(error); }
      this.activation = Promise.all([preparation, withDeadline(resuming)]).then(([ready]) => {
        this.enabled = ready && this.status === "ready" && this.context.state === "running";
        return this.enabled;
      }).catch(error => { this.fail(error); return false; }).finally(() => { this.activation = null; });
      return this.activation;
    }

    fail(error) {
      this.enabled = false; this.status = "unavailable"; this.stopVoices();
      if (!this.error) {
        this.error = String(error?.message || error);
        try { this.onError(error); } catch (_) { /* Reporting must not prevent silent play. */ }
        try { Promise.resolve(this.context?.close()).catch(() => {}); } catch (_) { /* Already closed. */ }
      }
    }
    canPlay() { return this.enabled && !this.muted && !this.held && this.context?.state === "running"; }
    canPlayUi() { return this.enabled && !this.muted && this.context?.state === "running"; }

    startVoice(key, channel, { offset = 0, loop = false, priority = 0, bus = "game", fadeIn = RAMP } = {}) {
      const buffer = this.buffers.get(key);
      if (!(bus === "ui" ? this.canPlayUi() : this.canPlay()) || !buffer || (!loop && offset >= buffer.duration)) return null;
      const previous = this.channels.get(channel), now = this.context.currentTime;
      if (previous && previous.end > now && previous.priority > priority) return null;
      this.stopChannel(channel);
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; source.loop = loop;
      if (loop) { source.loopStart = 0; source.loopEnd = buffer.duration; }
      gain.gain.setValueAtTime(0, now); // Clips are generated at their in-game loudness; the master leaves room for all three voices.
      gain.gain.linearRampToValueAtTime(1, now + fadeIn);
      source.connect(gain); gain.connect(bus === "ui" ? this.uiBus : this.master);
      const voice = { source, gain, key, priority, bus, started: now, offset, loop, end: loop ? Infinity : now + buffer.duration - offset };
      this.channels.set(channel, voice); this.sources.add(source);
      if (bus === "ui") this.uiSources.add(source);
      source.onended = () => {
        this.sources.delete(source); this.uiSources.delete(source);
        if (this.channels.get(channel) === voice) this.channels.delete(channel);
        source.disconnect(); gain.disconnect();
      };
      source.start(now, offset); this.starts++;
      if (channel !== "bed" && bus !== "ui") this.lastEffect = key;
      return voice;
    }
    stopChannel(channel, immediate = false) {
      const voice = this.channels.get(channel);
      if (!voice) return;
      this.channels.delete(channel);
      const now = this.context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      if (immediate) {
        voice.gain.gain.setValueAtTime(0, now);
        voice.source.stop(now); this.sources.delete(voice.source);
      } else {
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + RAMP);
        voice.source.stop(now + RAMP);
      }
    }
    stopVoices(keepUi = false) {
      for (const [channel, voice] of [...this.channels]) if (!(keepUi && voice.bus === "ui")) this.stopChannel(channel, true);
      // Also cancel sources that were already fading during a state transition.
      for (const source of [...this.sources]) {
        if (keepUi && this.uiSources.has(source)) continue;
        try { source.stop(); } catch (_) { /* Already ended. */ }
        this.sources.delete(source); this.uiSources.delete(source);
      }
    }
    // Boot, menu, button and results sounds, on the UI bus.
    ui(name) {
      if (!this.buffers.has(name)) return null;
      return this.startVoice(name, UI_NAV.has(name) ? "ui" : name, { bus: "ui" });
    }
    stopUi(name) { if (this.channels.get(name)?.bus === "ui") this.stopChannel(name); }
    setMenuBed(value) {
      if (this.menuBed === Boolean(value)) return;
      this.menuBed = Boolean(value); this.update();
    }

    play(name, data) {
      if (name === "pause") { this.setHeld(true); return; }
      if (name === "resume") { this.setHeld(false); return; }
      if (name === "start") { this.stopVoices(); this.waka = 0; this.update(); return; }
      // A co-op death while the partner plays on keeps the siren running.
      const partialDeath = name === "death" && data?.partial;
      if (["death", "levelClear", "gameOver", "intermission", "lifeLost"].includes(name) && !partialDeath) this.stopVoices();
      if (name === "gameOver") this.ui("gameOver");
      if (name === "pellet" || name === "powerPellet") {
        const key = this.waka++ % 2 === 0 ? "munchA" : "munchB";
        this.startVoice(key, "effect", { priority: 1 });
      } else if (name === "ghostEaten") this.startVoice("ghost", "effect", { priority: 3 });
      else if (name === "ghostZapped" || name === "explosion") this.startVoice("zap", "effect", { priority: 3 });
      else if (name === "fruitEaten") this.startVoice("fruit", "effect", { priority: 2 });
      else if (name === "powerUp") this.startVoice("powerUp", "effect", { priority: 2 });
      else if (name === "extraLife") this.startVoice("extraLife", "bonus");
      else if (name === "death") this.startVoice("death", "effect", { priority: 4 });
      // Mode events, so what happened is audible while eyes are on the maze.
      else if (name === "runnerCaught" || name === "skill") this.startVoice("powerUp", "effect", { priority: 2 });
      else if (name === "caught" || name === "shrugged" || name === "supernova" || name === "vineSnare") this.startVoice("zap", "effect", { priority: 3 });
      else if (name === "eliminated") this.startVoice("death", "effect", { priority: 4 });
      else if (name === "swap" || name === "reform" || name === "playerRespawn" || name === "constellation") this.startVoice("extraLife", "bonus");
      else if (name === "bugged" || name === "injected") this.startVoice("uiDenied", "effect", { priority: 2 });
      else if (name === "injectionPassed" || name === "itemAppear") this.startVoice("uiChange", "effect", { priority: 1 });
      else if (name === "chain") this.startVoice("fruit", "effect", { priority: 2 });
      else if (name === "zone" || name === "ghostWakes") this.startVoice("uiConfirm", "effect", { priority: 1 });
      else if (name === "danger" || name === "arenaWarning" || (name === "arenaClose" && data?.margin === 1)) this.startVoice("alarm", "alarm", { priority: 1 });
      else if (name === "arenaWinner" && data?.human) { this.stopUi("gameOver"); this.ui("victory"); }
      // State selects the bed; power/frightened/home events cannot override returning eyes.
      this.update();
    }

    update() {
      const desired = bedFor(this.game, { menuBed: this.menuBed }), current = this.channels.get("bed");
      if (!this.canPlay() || !desired) { this.stopChannel("bed", !this.canPlay()); return; }
      if (current?.key === desired.key) return;
      this.stopChannel("bed");
      this.startVoice(desired.key, "bed", desired);
    }
    setHeld(value) {
      this.held = Boolean(value);
      if (value) this.stopVoices(true);
      this.refreshGain();
      if (!value) this.update();
    }
    setMuted(value) {
      this.muted = Boolean(value);
      if (value) this.stopVoices();
      this.refreshGain();
      if (!value) this.update();
    }
    // Player volume from 0 to 1 over the mixed master level; bad stored values fall back to full.
    setVolume(value) {
      const volume = Number(value);
      this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
      this.refreshGain();
    }
    refreshGain() {
      if (!this.master) return;
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.muted || this.held ? 0 : MASTER_GAIN * this.volume, now);
      this.uiBus.gain.cancelScheduledValues(now);
      this.uiBus.gain.setValueAtTime(this.muted ? 0 : MASTER_GAIN * this.volume, now);
    }
    snapshot() {
      const bed = this.channels.get("bed"), effective = this.game.state === "PAUSED" ? this.game.pausedFrom : this.game.state;
      return {
        status: this.status, error: this.error, enabled: this.enabled, muted: this.muted, held: this.held,
        sources: this.sources.size, decodedClips: this.buffers.size, background: backgroundClip(this.game),
        playingBed: bed?.key || null, channels: Object.fromEntries([...this.channels].map(([channel, voice]) => [channel, voice.key])),
        musicOffset: effective === "READY" && this.game.readyKind === "intro" ? Math.max(0, this.game.timings.introDuration - this.game.readyTimer) :
          effective === "INTERMISSION" ? Math.max(0, this.game.timings.intermissionDuration - this.game.intermissionTimer) : null,
        starts: this.starts, lastEffect: this.lastEffect,
      };
    }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { ArcadeAudio, backgroundClip, bedFor };
  else root.ArcadeAudio = ArcadeAudio;
})(globalThis);
