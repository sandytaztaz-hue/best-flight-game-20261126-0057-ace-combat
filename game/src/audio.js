// SKY FALCON — Ace Combat Run: WebAudio music and sound effects.
// Everything is synthesised; no audio files, no network. Safe to call when
// AudioContext is missing (headless render): every method guards itself.
window.SF = window.SF || {};
SF.Audio = (function () {
  let ctx = null, master = null, engineOsc = null, engineGain = null;
  let muted = false, musicTimer = null, musicStep = 0;
  // A short, driving menu riff: bass notes with a bright lead on top.
  const RIFF = [110, 0, 110, 131, 0, 165, 0, 131, 110, 0, 98, 110, 0, 147, 165, 0];
  const LEAD = [440, 0, 523, 659, 0, 523, 440, 0, 392, 440, 0, 587, 659, 587, 523, 0];

  function ensure() {
    if (ctx || muted) return !!ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) { /* headless: ignore */ }
  }

  function noise(dur, vol, low) {
    if (!ensure()) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low || 900;
      const g = ctx.createGain(); g.gain.value = vol || 0.4;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch (e) { /* headless: ignore */ }
  }

  return {
    unlock: function () { ensure(); },
    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.35;
      if (muted) this.stopMusic();
    },
    isMuted: function () { return muted; },
    startEngine: function () {
      if (!ensure() || engineOsc) return;
      try {
        engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 55;
        engineGain = ctx.createGain(); engineGain.gain.value = 0.05;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
        engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
        engineOsc.start();
      } catch (e) { engineOsc = null; }
    },
    setThrottle: function (t, boost) {
      if (!engineOsc || !ctx) return;
      try {
        engineOsc.frequency.value = 45 + t * 70 + (boost ? 45 : 0);
        engineGain.gain.value = 0.03 + t * 0.05 + (boost ? 0.03 : 0);
      } catch (e) { /* ignore */ }
    },
    stopEngine: function () {
      if (!engineOsc) return;
      try { engineOsc.stop(); } catch (e) { /* ignore */ }
      engineOsc = null; engineGain = null;
    },
    gun: function () { noise(0.09, 0.25, 2400); tone(180, 0.08, 'square', 0.10, 60); },
    missile: function () { noise(0.5, 0.3, 1400); tone(300, 0.5, 'sawtooth', 0.08, 900); },
    splash: function () { noise(0.8, 0.35, 500); tone(140, 0.5, 'sine', 0.2, 40); },
    thunder: function () { noise(1.4, 0.3, 220); tone(60, 1.2, 'sine', 0.18, 28); },
    lockTick: function (level) { tone(880 + level * 700, 0.07, 'sine', 0.12); },
    lockFull: function () { tone(1320, 0.12, 'sine', 0.16); tone(1760, 0.18, 'sine', 0.14); },
    explosion: function (big) { noise(big ? 1.1 : 0.7, big ? 0.55 : 0.4, 700); tone(90, 0.6, 'sine', 0.25, 30); },
    flare: function () { noise(0.25, 0.18, 3000); },
    hit: function () { tone(220, 0.15, 'square', 0.18, 110); },
    warning: function () { tone(520, 0.2, 'square', 0.12); tone(520, 0.2, 'square', 0.12); },
    radio: function () { tone(1200, 0.05, 'sine', 0.08); tone(1500, 0.05, 'sine', 0.08); },
    coin: function () { tone(988, 0.1, 'sine', 0.14); tone(1319, 0.16, 'sine', 0.14); },
    startMusic: function () {
      if (!ensure() || musicTimer) return;
      musicStep = 0;
      musicTimer = setInterval(function () {
        if (muted) return;
        const b = RIFF[musicStep % RIFF.length];
        const l = LEAD[musicStep % LEAD.length];
        if (b) tone(b, 0.22, 'triangle', 0.12);
        if (l && musicStep % 2 === 0) tone(l, 0.2, 'square', 0.045);
        musicStep++;
      }, 210);
    },
    stopMusic: function () {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
  };
})();
