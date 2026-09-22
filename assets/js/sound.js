/* Game-show sounds synthesized with Web Audio — no audio files to load. */
(function () {
  'use strict';
  const S = (window.FEUD_SOUND = { ctx: null, out: null });

  S.unlock = function () {
    if (!S.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      S.ctx = new AC();
      const comp = S.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      S.out = S.ctx.createGain();
      S.out.gain.value = 0.9;
      S.out.connect(comp).connect(S.ctx.destination);
    }
    if (S.ctx.state === 'suspended') S.ctx.resume();
    return true;
  };

  S.ready = () => !!S.ctx && S.ctx.state === 'running';

  function tone(freq, at, dur, opts) {
    const o = Object.assign({ type: 'sine', gain: 0.2, attack: 0.008, slideTo: 0, filter: 0 }, opts);
    const c = S.ctx;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc.connect(g);
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node = g.connect(f);
    }
    node.connect(S.out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const guard = (fn) => function () { if (S.ready()) fn.apply(null, arguments); };

  // Bright two-note "ding" for a correct answer.
  S.ding = guard(function () {
    tone(1318.5, 0, 0.5, { gain: 0.22 });
    tone(2637, 0, 0.35, { gain: 0.05 });
    tone(1760, 0.11, 0.9, { gain: 0.24 });
    tone(3520, 0.11, 0.5, { gain: 0.04 });
  });

  // Gentle chime for answers revealed after the round (no points).
  S.chime = guard(function () {
    tone(880, 0, 0.5, { gain: 0.1, type: 'triangle' });
  });

  // Harsh game-show buzzer for strikes.
  S.buzz = guard(function () {
    tone(92, 0, 0.8, { type: 'sawtooth', gain: 0.26, filter: 1400 });
    tone(97, 0, 0.8, { type: 'square', gain: 0.16, filter: 1100 });
    tone(184, 0, 0.8, { type: 'sawtooth', gain: 0.08, filter: 1800 });
  });

  // Rising arpeggio when a team wins a round.
  S.win = guard(function () {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.32, { type: 'triangle', gain: 0.18 }));
    [1046.5, 1318.5, 1568].forEach((f) => tone(f, 0.38, 1.1, { type: 'triangle', gain: 0.1 }));
  });

  // Steal success: quick whoop + win.
  S.steal = guard(function () {
    tone(300, 0, 0.35, { type: 'sawtooth', gain: 0.1, slideTo: 1200, filter: 3000 });
    setTimeout(S.win, 280);
  });

  // Title-screen / new round jingle.
  S.jingle = guard(function () {
    const n = [392, 523.25, 659.25, 587.33, 523.25, 783.99];
    const d = [0, 0.14, 0.28, 0.42, 0.56, 0.74];
    n.forEach((f, i) => tone(f, d[i], i === n.length - 1 ? 0.8 : 0.2, { type: 'triangle', gain: 0.17 }));
    tone(196, 0.74, 0.8, { type: 'sine', gain: 0.15 });
  });

  // Grand finale.
  S.fanfare = guard(function () {
    const seq = [523.25, 523.25, 523.25, 698.46, 880, 1046.5];
    const at = [0, 0.13, 0.26, 0.42, 0.62, 0.86];
    seq.forEach((f, i) => tone(f, at[i], i === seq.length - 1 ? 1.6 : 0.24, { type: 'sawtooth', gain: 0.08, filter: 2600 }));
    seq.forEach((f, i) => tone(f, at[i], i === seq.length - 1 ? 1.6 : 0.24, { type: 'triangle', gain: 0.14 }));
    [261.63, 329.63, 392].forEach((f) => tone(f, 0.86, 1.6, { type: 'triangle', gain: 0.1 }));
  });

  S.tick = guard(function () {
    tone(1200, 0, 0.06, { type: 'square', gain: 0.04 });
  });
})();
