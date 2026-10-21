/* audio.js — all sounds are synthesised with WebAudio (no audio files needed, works offline). */
(function (CT) {
  'use strict';
  var ctx = null, master = null, sfxBus = null, engineBus = null;
  var engine = null;
  var noiseBuf = null;

  function settingOn(k) { return CT.Storage.getSetting(k) !== false; }

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = settingOn('sound') ? 1 : 0; sfxBus.connect(master);
      engineBus = ctx.createGain(); engineBus.gain.value = 0; engineBus.connect(master);
      var len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }

  function tone(type, f0, f1, t0, dur, vol, dest) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, vol, freq, q, type) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq || 800; f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  var SFX = {
    click: function (t) { tone('triangle', 900, 600, t, 0.06, 0.25); },
    clunk: function (t) { tone('sine', 140, 60, t, 0.25, 0.7); noise(t, 0.12, 0.35, 500, 1.2); tone('square', 220, 110, t, 0.06, 0.08); },
    hook: function (t) { tone('square', 520, 520, t, 0.04, 0.08); tone('square', 780, 780, t + 0.05, 0.04, 0.06); },
    strap: function (t) { noise(t, 0.22, 0.25, 2400, 3, 'bandpass'); tone('sawtooth', 300, 900, t, 0.2, 0.05); tone('square', 1200, 1200, t + 0.22, 0.03, 0.08); },
    whir: function (t) { tone('sawtooth', 120, 180, t, 0.5, 0.05); },
    count: function (t) { tone('triangle', 660, 660, t, 0.1, 0.25); tone('triangle', 990, 990, t + 0.08, 0.14, 0.22); },
    ready: function (t) { [523, 659, 784].forEach(function (f, i) { tone('triangle', f, f, t + i * 0.09, 0.2, 0.25); }); },
    horn: function (t) { tone('sawtooth', 311, 311, t, 0.35, 0.12); tone('sawtooth', 392, 392, t, 0.35, 0.10); },
    bump: function (t) { tone('sine', 90, 45, t, 0.3, 0.8); noise(t, 0.2, 0.4, 300, 0.8, 'lowpass'); },
    zone: function (t) { tone('sine', 880, 880, t, 0.12, 0.18); tone('sine', 1320, 1320, t + 0.1, 0.18, 0.16); },
    deliver: function (t) { [784, 988, 1175].forEach(function (f, i) { tone('triangle', f, f, t + i * 0.07, 0.18, 0.22); }); },
    win: function (t) {
      var notes = [523, 659, 784, 1047, 784, 1047, 1319];
      var times = [0, 0.12, 0.24, 0.36, 0.56, 0.68, 0.82];
      notes.forEach(function (f, i) { tone('square', f, f, t + times[i], i === notes.length - 1 ? 0.6 : 0.16, 0.12); tone('triangle', f / 2, f / 2, t + times[i], 0.2, 0.15); });
      noise(t + 0.82, 0.8, 0.12, 6000, 0.6, 'highpass');
    },
    brake: function (t) { noise(t, 0.35, 0.12, 3000, 6, 'bandpass'); },
    star: function (t) { tone('triangle', 1047, 1568, t, 0.25, 0.22); }
  };

  CT.Audio = {
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    },
    play: function (name) {
      if (!ctx || !settingOn('sound') || ctx.state !== 'running') return;
      var fn = SFX[name]; if (fn) { try { fn(ctx.currentTime + 0.005); } catch (e) {} }
    },
    applySettings: function () {
      if (!ctx) return;
      sfxBus.gain.setTargetAtTime(settingOn('sound') ? 1 : 0, ctx.currentTime, 0.02);
      if (!settingOn('sound') || !settingOn('engine')) this.engineOff();
    },
    engineOn: function () {
      if (!ctx || engine || !settingOn('sound') || !settingOn('engine')) return;
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain(), filt = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square';
      o1.frequency.value = 42; o2.frequency.value = 21;
      lfo.frequency.value = 9; lfoGain.gain.value = 0.25;
      filt.type = 'lowpass'; filt.frequency.value = 380; filt.Q.value = 3;
      g.gain.value = 0.5;
      lfo.connect(lfoGain); lfoGain.connect(g.gain);
      o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(engineBus);
      o1.start(); o2.start(); lfo.start();
      engine = { o1: o1, o2: o2, lfo: lfo, filt: filt, g: g };
      engineBus.gain.setTargetAtTime(0.16, ctx.currentTime, 0.2);
    },
    engineSet: function (speedRatio, throttle) {
      if (!engine) return;
      var t = ctx.currentTime;
      var f = 38 + speedRatio * 48 + throttle * 14;
      engine.o1.frequency.setTargetAtTime(f, t, 0.12);
      engine.o2.frequency.setTargetAtTime(f / 2, t, 0.12);
      engine.lfo.frequency.setTargetAtTime(8 + speedRatio * 14 + throttle * 4, t, 0.12);
      engine.filt.frequency.setTargetAtTime(320 + throttle * 520 + speedRatio * 300, t, 0.1);
      engineBus.gain.setTargetAtTime(0.11 + throttle * 0.08 + speedRatio * 0.04, t, 0.15);
    },
    engineOff: function () {
      if (!engine) return;
      var e = engine; engine = null;
      try {
        engineBus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        setTimeout(function () { try { e.o1.stop(); e.o2.stop(); e.lfo.stop(); } catch (x) {} }, 400);
      } catch (x) {}
    },
    suspend: function () { if (ctx && ctx.state === 'running') ctx.suspend().catch(function () {}); },
    resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {}); }
  };

  CT.vibrate = function (pattern) {
    if (CT.Storage.getSetting('vibrate') === false) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  };
})(window.CT);
