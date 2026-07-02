// DFAudio — prozedurale Sound-Engine für Dönerfriitig (Web Audio API).
// Musik: entspannter Deep-House-Groove (~100 BPM) mit Swing, Sidechain-Pumping,
// tiefem Sub-Bass, m7-Akkord-Stabs und Vinyl-Textur. Kein externes Audio-File.
// AudioContext darf erst nach einer User-Geste starten -> DFAudio.unlock() beim ersten Tap.
(function () {
  const TEMPO = 100;
  const STEP = (60 / TEMPO) / 4;           // 16tel
  const SWING = STEP * 0.30;               // jede ungerade 16tel etwas nach hinten
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Progression: Am7 – Fmaj7 – Cmaj7 – G7 (je 1 Takt)
  const CHORDS = [
    { root: 33, notes: [57, 60, 64, 67] }, // Am7
    { root: 29, notes: [53, 57, 60, 64] }, // Fmaj7
    { root: 36, notes: [60, 64, 67, 71] }, // Cmaj7
    { root: 31, notes: [55, 59, 62, 65] }, // G7
  ];
  // Sub-Bass-Groove (Step -> Halbton-Offset vom Root, null = Pause)
  const BASSP = { 0: 0, 3: 12, 6: 0, 8: 0, 11: 7, 14: 12 };

  let ctx = null, master = null, musicGain = null, duck = null, reverb = null, noiseBuf = null, vinyl = null;
  let muted = false, musicOn = false;
  let step = 0, nextTime = 0, timer = null;

  function makeNoise() {
    const b = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeReverb() {
    const len = ctx.sampleRate * 1.8;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
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
    const revGain = ctx.createGain(); revGain.gain.value = 0.5;
    reverb.connect(revGain); revGain.connect(master);
    duck = ctx.createGain(); duck.gain.value = 1; duck.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(duck);
    noiseBuf = makeNoise();
    return true;
  }

  // ---- Drums ----
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(118, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    g.gain.setValueAtTime(0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.26);
    // Sidechain: alles andere duckt kurz weg
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.45, t);
    duck.gain.linearRampToValueAtTime(1.0, t + 0.24);
  }
  function hat(t, open) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 8200;
    const g = ctx.createGain();
    const dur = open ? 0.14 : 0.035;
    g.gain.setValueAtTime(open ? 0.16 : 0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(hp); hp.connect(g); g.connect(musicGain); s.start(t); s.stop(t + dur + 0.02);
  }
  function clap(t) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    s.connect(bp); bp.connect(g); g.connect(musicGain);
    const rg = ctx.createGain(); rg.gain.value = 0.6; g.connect(rg); rg.connect(reverb);
    s.start(t); s.stop(t + 0.22);
  }
  // ---- Tonales ----
  function bass(t, m) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    o.type = "sine"; o.frequency.value = midi(m);
    o2.type = "triangle"; o2.frequency.value = midi(m); o2.detune.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.55, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.38); o2.start(t); o2.stop(t + 0.38);
  }
  // House-Stab: m7-Akkord, Saws durch zufahrenden Lowpass, kurz und weich
  function stab(t, notes, vel) {
    const out = ctx.createGain(); out.gain.value = vel || 0.10;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(420, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    notes.forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.value = midi(m); o.detune.value = (i % 2 ? 6 : -6);
      o.connect(g); o.start(t); o.stop(t + 0.32);
    });
    g.connect(lp); lp.connect(out); out.connect(musicGain);
    const rg = ctx.createGain(); rg.gain.value = 0.55; out.connect(rg); rg.connect(reverb);
  }
  function pad(t, notes, dur) {
    notes.forEach((m) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = midi(m - 12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicGain);
      const rg = ctx.createGain(); rg.gain.value = 0.6; g.connect(rg); rg.connect(reverb);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }
  // weiche, spärliche Hook-Note
  function key(t, m, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    o.type = "triangle"; o.frequency.value = midi(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel || 0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(lp); lp.connect(g); g.connect(musicGain);
    const rg = ctx.createGain(); rg.gain.value = 0.7; g.connect(rg); rg.connect(reverb);
    o.start(t); o.stop(t + 0.55);
  }

  // ---- Sequencer ----
  function scheduleStep(s, t0) {
    const bar = Math.floor(step / 16) % 4;
    const chord = CHORDS[bar];
    const t = t0 + (s % 2 === 1 ? SWING : 0);
    if (s % 4 === 0) kick(t);
    if (s % 4 === 2) hat(t, true);
    if (s % 2 === 1) hat(t, false);
    if (s === 4 || s === 12) clap(t);
    const b = BASSP[s];
    if (b != null) bass(t, chord.root + b + 12);
    if (s === 2 || s === 10) stab(t, chord.notes, 0.09);
    if (s === 0) pad(t, chord.notes.slice(0, 3), STEP * 16);
    // Hook nur in Takt 2 und 4, sehr spärlich
    if (bar % 2 === 1) {
      if (s === 7) key(t, chord.notes[2] + 12, 0.10);
      if (s === 13) key(t, chord.notes[1] + 12, 0.08);
    }
  }
  function tick() {
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(step % 16, nextTime);
      nextTime += STEP; step++;
    }
  }
  function startVinyl() {
    if (vinyl) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.value = 0.012;
    s.connect(lp); lp.connect(g); g.connect(musicGain);
    s.start(); vinyl = s;
  }
  function stopVinyl() { if (vinyl) { try { vinyl.stop(); } catch {} vinyl = null; } }

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
      startVinyl();
      timer = setInterval(tick, 25);
    },
    stopMusic() {
      musicOn = false; if (timer) { clearInterval(timer); timer = null; }
      stopVinyl();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
      return muted;
    },
    toggleMute() { return this.setMuted(!muted); },

    // ---- SFX (dezenter als vorher) ----
    hit(level) {
      if (!ensure()) return;
      key(ctx.currentTime, 60 + Math.min(level || 0, 24), 0.18);
    },
    perfect() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [60, 64, 67].forEach((m, i) => key(t + i * 0.03, m + 12, 0.16));
    },
    over() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [64, 60, 55].forEach((m, i) => key(t + i * 0.11, m, 0.2));
    },
    tick() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = 1300;
      g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(g); g.connect(master || ctx.destination); o.start(t); o.stop(t + 0.04);
    },
    win() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [57, 60, 64, 69].forEach((m, i) => key(t + i * 0.09, m + 12, 0.2));
    },
    spin() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2;
      bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.4);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      s.connect(bp); bp.connect(g); g.connect(master || ctx.destination); s.start(t); s.stop(t + 0.5);
    },
  };

  window.DFAudio = DFAudio;
})();
