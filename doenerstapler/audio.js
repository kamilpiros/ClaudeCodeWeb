// DFAudio — prozedurale Tropical-House-Sound-Engine für Dönerfriitig (Web Audio API).
// Kein externes Audio-File: Beat, Bass, Pluck-Melodie, Pad + Reverb werden live erzeugt.
// AudioContext darf erst nach einer User-Geste starten -> DFAudio.unlock() bei erstem Tap aufrufen.
(function () {
  const TEMPO = 112;
  const STEP = (60 / TEMPO) / 4;          // 16tel-Dauer
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Akkord-Progression (4 Takte): C – G – Am – F
  const CHORDS = [
    { root: 36, triad: [48, 52, 55], pad: [60, 64, 67] }, // C
    { root: 31, triad: [43, 47, 50], pad: [55, 59, 62] }, // G
    { root: 33, triad: [45, 48, 52], pad: [57, 60, 64] }, // Am
    { root: 29, triad: [41, 45, 48], pad: [53, 57, 60] }, // F
  ];
  // Pluck-Pattern über einen Takt (16 Steps), Zahl = Index im Akkord-Triad, null = Pause
  const PLUCK = [0, null, null, 1, null, null, 2, null, 0, null, 2, null, 1, null, null, 2];

  let ctx = null, master = null, musicGain = null, reverb = null, noiseBuf = null;
  let muted = false, musicOn = false;
  let step = 0, nextTime = 0, timer = null;

  function makeNoise() {
    const b = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeReverb() {
    const len = ctx.sampleRate * 1.6;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const conv = ctx.createConvolver(); conv.buffer = b;
    return conv;
  }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    reverb = makeReverb();
    const revGain = ctx.createGain(); revGain.gain.value = 0.6;
    reverb.connect(revGain); revGain.connect(master);
    master._rev = reverb;
    musicGain = ctx.createGain(); musicGain.gain.value = 0.55; musicGain.connect(master);
    noiseBuf = makeNoise();
    return true;
  }

  // ---- Instrumente ----
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.22);
  }
  function hat(t, open) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = ctx.createGain();
    const dur = open ? 0.12 : 0.04;
    g.gain.setValueAtTime(open ? 0.22 : 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(hp); hp.connect(g); g.connect(musicGain); s.start(t); s.stop(t + dur + 0.02);
  }
  function clap(t) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    s.connect(bp); bp.connect(g); g.connect(musicGain);
    const rg = ctx.createGain(); rg.gain.value = 0.5; g.connect(rg); rg.connect(reverb);
    s.start(t); s.stop(t + 0.2);
  }
  function bass(t, freq) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(lp); lp.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.3);
  }
  function pad(t, midis, dur) {
    midis.forEach((m) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = midi(m);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicGain);
      const rg = ctx.createGain(); rg.gain.value = 0.5; g.connect(rg); rg.connect(reverb);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }
  // Tropical-Pluck: zwei leicht verstimmte Saws durch ein Lowpass mit schnellem Decay + Reverb
  function pluck(t, freq, gainScale, dest) {
    const out = ctx.createGain(); out.gain.value = (gainScale || 0.22);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    [0, 7].forEach((cent, i) => {
      const o = ctx.createOscillator(); o.type = i ? "triangle" : "sawtooth";
      o.frequency.value = freq; o.detune.value = cent;
      o.connect(g); o.start(t); o.stop(t + 0.36);
    });
    g.connect(lp); lp.connect(out); out.connect(dest || musicGain);
    const rg = ctx.createGain(); rg.gain.value = 0.45; out.connect(rg); rg.connect(reverb);
  }

  // ---- Sequencer ----
  function scheduleStep(s, t) {
    const chord = CHORDS[Math.floor(step / 16) % 4];
    if (s % 4 === 0) kick(t);
    if (s % 4 === 2) hat(t, true);
    if (s === 4 || s === 12) clap(t);
    if (s === 0 || s === 8) bass(t, midi(chord.root));
    if (s === 11) bass(t, midi(chord.root));
    if (s === 0) pad(t, chord.pad, STEP * 16);
    const pi = PLUCK[s];
    if (pi != null) pluck(t, midi(chord.triad[pi] + 12), 0.2);
  }
  function tick() {
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(step % 16, nextTime);
      nextTime += STEP; step++;
    }
  }

  const DFAudio = {
    get muted() { return muted; },
    unlock() {
      if (!ensure()) return;
      if (ctx.state === "suspended") ctx.resume();
    },
    startMusic() {
      if (!ensure() || musicOn) return;
      if (ctx.state === "suspended") ctx.resume();
      musicOn = true; step = 0; nextTime = ctx.currentTime + 0.08;
      timer = setInterval(tick, 25);
    },
    stopMusic() {
      musicOn = false; if (timer) { clearInterval(timer); timer = null; }
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
      return muted;
    },
    toggleMute() { return this.setMuted(!muted); },

    // ---- SFX ----
    hit(level) {
      if (!ensure()) return;
      const m = 60 + Math.min(level || 0, 24);
      pluck(ctx.currentTime, midi(m), 0.3);
    },
    perfect() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [60, 64, 67, 72].forEach((m, i) => pluck(t + i * 0.02, midi(m), 0.25));
    },
    over() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [67, 64, 60, 53].forEach((m, i) => pluck(t + i * 0.12, midi(m), 0.28));
    },
    tick() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = 1400;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(g); g.connect(master || ctx.destination); o.start(t); o.stop(t + 0.04);
    },
    win() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [60, 64, 67, 72, 76].forEach((m, i) => pluck(t + i * 0.09, midi(m), 0.32));
    },
    spin() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2;
      bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3500, t + 0.4);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      s.connect(bp); bp.connect(g); g.connect(master || ctx.destination); s.start(t); s.stop(t + 0.5);
    },
  };

  window.DFAudio = DFAudio;
})();
