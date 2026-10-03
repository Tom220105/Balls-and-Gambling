/* ==========================================================================
   SLING HEROES — music
   Generated live with the Web Audio API, no music files:
   * town: calm and friendly (C major, pads, a plucked arpeggio, soft bass)
   * battle: driving (A minor, bass line, kick, snare, fast arpeggio)
   * boss: darker and faster (D minor)
   A small scheduler plans the notes a moment ahead on the audio clock, so
   the beat stays steady even when the game is busy.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  const A = SH.audio;
  const MOODS = {
    town: { bpm: 92, root: 48, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], arp: [0, 1, 2, 1, 2, 3, 2, 1], drums: 0.3, pad: 0.06, bass: 0.09, lead: 0.035, wave: 'triangle' },
    battle: { bpm: 126, root: 45, chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], arp: [0, 1, 2, 3, 2, 1, 2, 3], drums: 1, pad: 0.04, bass: 0.13, lead: 0.03, wave: 'square' },
    boss: { bpm: 138, root: 50, chords: [[0, 3, 7], [8, 12, 15], [10, 14, 17], [7, 11, 14]], arp: [0, 2, 1, 3, 0, 2, 3, 1], drums: 1.2, pad: 0.05, bass: 0.15, lead: 0.03, wave: 'sawtooth' },
  };
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let mood = null, bus = null, step = 0, nextT = 0, timer = null, want = 'town';
  function chain() {
    const g = A.ctx.createGain();
    g.gain.value = 0;
    g.connect(A.musicBus);
    return g;
  }
  function note(type, f, t, dur, vol, opts) {
    const ctx = A.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (opts && opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    const at = (opts && opts.attack) || 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (opts && opts.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opts.lp; fl.Q.value = opts.q || 0.7; g.connect(fl); out = fl; }
    o.connect(g);
    out.connect(bus);
    if (opts && opts.verb) out.connect(A.verb);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function hit(t, vol, f, dur, type) {
    const ctx = A.ctx;
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type || 'highpass'; fl.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function schedule() {
    if (!mood || !A.ctx) return;
    const M = MOODS[mood];
    const spb = 60 / M.bpm / 2;   // eighth notes
    while (nextT < A.ctx.currentTime + 0.25) {
      const t = nextT;
      const bar = Math.floor(step / 8) % M.chords.length, s8 = step % 8;
      const ch = M.chords[bar];
      // pad at the start of each bar
      if (s8 === 0) ch.forEach((n) => note(M.wave === 'square' ? 'sawtooth' : 'triangle', freq(M.root + 12 + n), t, spb * 8.2, M.pad, { attack: 0.4, lp: 1400, verb: true }));
      // bass
      if (mood === 'town') { if (s8 === 0 || s8 === 4) note('sine', freq(M.root - 12 + ch[0]), t, spb * 3.5, M.bass, { lp: 600 }); }
      else note('sawtooth', freq(M.root - 12 + ch[s8 % 4 === 3 ? 2 : 0]), t, spb * 0.9, M.bass, { lp: 420 + (s8 % 2) * 300, q: 4 });
      // arpeggio (16ths in battle)
      const sub = mood === 'town' ? 1 : 2;
      for (let k = 0; k < sub; k++) {
        const idx = M.arp[(s8 * sub + k) % M.arp.length];
        const n = idx < 3 ? ch[idx] : ch[0] + 12;
        note(mood === 'town' ? 'triangle' : 'square', freq(M.root + 24 + n), t + k * spb / sub, spb / sub * 0.9, M.lead, { lp: mood === 'town' ? 2600 : 1800, verb: mood === 'town' });
      }
      // drums
      if (M.drums) {
        if (mood === 'town') { if (s8 % 2 === 1) hit(t, 0.025 * M.drums, 7000, 0.05); }
        else {
          if (s8 === 0 || s8 === 4 || (mood === 'boss' && s8 === 6)) note('sine', 150, t, 0.25, 0.35 * M.drums, { slide: 40 });
          if (s8 === 2 || s8 === 6) hit(t, 0.12 * M.drums, 1800, 0.14, 'bandpass');
          hit(t, 0.03 * M.drums, 8000, 0.04);
        }
      }
      step++;
      nextT += spb;
    }
  }
  function start(m) {
    if (!A.ready) { want = m; return; }
    if (mood === m) return;
    const old = bus;
    if (old) { old.gain.setTargetAtTime(0, A.ctx.currentTime, 0.4); setTimeout(() => old.disconnect(), 2500); }
    mood = m;
    bus = chain();
    bus.gain.setTargetAtTime(1, A.ctx.currentTime + 0.1, 0.6);
    step = 0;
    nextT = A.ctx.currentTime + 0.15;
    if (!timer) timer = setInterval(schedule, 60);
  }
  SH.music = {
    play(m) { want = m; if (SH.settings.music <= 0) return; start(m); },
    volume() { A.volumes(); if (SH.settings.music > 0 && !mood) start(want); },
    get mood() { return mood; },
  };
  A.onReady = () => { if (SH.settings.music > 0) start(want); };
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return;
    if (document.hidden) A.ctx.suspend(); else A.ctx.resume();
  });
})();
