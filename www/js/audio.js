/* audio.js — all sounds are synthesised with WebAudio (no audio files needed, works offline). */
(function (CT) {
  'use strict';
  var ctx = null, master = null, sfxBus = null, engineBus = null, musicBus = null;
  var musicTimer = null, musicStep = 0, musicNext = 0;
  // calm 4-chord loop (C – Am – F – G), original
  var CHORDS = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
  var BASS = [130.8, 110.0, 87.3, 98.0];
  function musicTick() {
    if (!ctx || !musicBus) return;
    var beat = 60 / 96, now = ctx.currentTime;
    if (musicNext < now) musicNext = now + 0.05;
    while (musicNext < now + 0.4) {
      var bar = Math.floor(musicStep / 8) % 4, st = musicStep % 8, t = musicNext;
      if (st === 0) CHORDS[bar].forEach(function (f) { mtone('triangle', f, t, beat * 7.5, 0.035); });
      if (st % 2 === 0) mtone('sine', BASS[bar] * (st === 4 ? 1.5 : 1), t, beat * 0.9, 0.09);
      var arp = CHORDS[bar][(st * 2) % 3] * 2;
      if (st % 2 === 1) mtone('square', arp, t, beat * 0.35, 0.012);
      musicStep++; musicNext += beat / 2;
    }
  }
  function mtone(type, f, t0, dur, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(musicBus); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  var engine = null, engineType = 'diesel';
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
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
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
    star: function (t) { tone('triangle', 1047, 1568, t, 0.25, 0.22); tone('sine', 2093, 2093, t + 0.08, 0.3, 0.08); },
    crash: function (t) { noise(t, 0.5, 0.9, 900, 0.6, 'lowpass'); tone('sawtooth', 160, 50, t, 0.4, 0.35); noise(t + 0.05, 0.4, 0.4, 3500, 1.5, 'bandpass'); },
    blinker: function (t) { tone('square', 1800, 1800, t, 0.02, 0.07); tone('square', 1500, 1500, t + 0.32, 0.02, 0.07); },
    alarm: function (t) { tone('square', 880, 880, t, 0.12, 0.12); tone('square', 660, 660, t + 0.14, 0.12, 0.12); },
    squeal: function (t) { noise(t, 0.45, 0.18, 2600, 9, 'bandpass'); tone('sawtooth', 1300, 1100, t, 0.4, 0.03); },
    fail: function (t) { [523, 440, 349, 262].forEach(function (f, i) { tone('triangle', f, f * 0.97, t + i * 0.18, 0.3, 0.2); }); },
    coin: function (t) { tone('square', 988, 988, t, 0.06, 0.1); tone('square', 1319, 1319, t + 0.06, 0.18, 0.1); },
    shutter: function (t) { noise(t, 2.2, 0.25, 160, 0.7, 'lowpass'); for (var i = 0; i < 16; i++) tone('square', 90, 70, t + i * 0.13, 0.05, 0.05); },
    weld: function (t) { for (var i = 0; i < 6; i++) noise(t + i * 0.07 + Math.random() * 0.04, 0.06, 0.3, 3200 + Math.random() * 2400, 2, 'bandpass'); },
    wrench: function (t) { tone('square', 1800, 1700, t, 0.05, 0.08); tone('square', 2400, 2300, t + 0.09, 0.05, 0.06); noise(t, 0.08, 0.2, 2500, 4); },
    rev: function (t) { tone('sawtooth', 50, 140, t, 0.7, 0.18); tone('square', 25, 70, t, 0.7, 0.1); tone('sawtooth', 140, 70, t + 0.7, 0.5, 0.12); },
    evRev: function (t) { tone('sine', 220, 1400, t, 0.9, 0.12); tone('triangle', 440, 2800, t, 0.9, 0.05); },
    complete: function (t) { tone('square', 880, 880, t, 0.08, 0.1); [523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, f, t + 0.12 + i * 0.1, 0.3, 0.22); }); },
    unlock: function (t) { [784, 988, 1175, 1568, 1976].forEach(function (f, i) { tone('triangle', f, f * 1.01, t + i * 0.07, 0.35, 0.18); }); noise(t, 0.6, 0.08, 6000, 1, 'highpass'); },
    reverse: function (t) { tone('square', 1250, 1250, t, 0.16, 0.08); },
    lowfuel: function (t) { tone('triangle', 440, 440, t, 0.15, 0.18); tone('triangle', 440, 440, t + 0.22, 0.15, 0.18); },
    invalid: function (t) { tone('square', 220, 160, t, 0.18, 0.12); },
    achieve: function (t) { [659, 880, 1047, 1319].forEach(function (f, i) { tone('triangle', f, f, t + i * 0.08, 0.22, 0.2); }); },
    pickup: function (t) { tone('triangle', 330, 660, t, 0.25, 0.2); },
    upgrade: function (t) { [392, 523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, f, t + i * 0.06, 0.16, 0.2); }); }
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
    music: function (on) {
      if (!ensure()) return;
      var want = on && settingOn('music');
      musicBus.gain.setTargetAtTime(want ? 0.55 : 0, ctx.currentTime, 0.4);
      if (want && !musicTimer) { musicNext = ctx.currentTime + 0.1; musicTimer = setInterval(musicTick, 120); }
      if (!want && musicTimer) { var tm = musicTimer; musicTimer = null; setTimeout(function () { if (!musicTimer) clearInterval(tm); }, 600); }
    },
    applySettings: function () {
      if (!ctx) return;
      if (!settingOn('music') && musicTimer) this.music(false);
      sfxBus.gain.setTargetAtTime(settingOn('sound') ? 1 : 0, ctx.currentTime, 0.02);
      if (!settingOn('sound') || !settingOn('engine')) this.engineOff();
    },
    engineOn: function () {
      if (!ctx || engine || !settingOn('sound') || !settingOn('engine')) return;
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain(), filt = ctx.createBiquadFilter(), g = ctx.createGain();
      var ev = engineType === 'ev';
      o1.type = ev ? 'sine' : 'sawtooth'; o2.type = ev ? 'triangle' : 'square';
      o1.frequency.value = ev ? 180 : 42; o2.frequency.value = ev ? 362 : 21;
      lfo.frequency.value = ev ? 3 : 9; lfoGain.gain.value = ev ? 0.06 : 0.25;
      filt.type = ev ? 'bandpass' : 'lowpass'; filt.frequency.value = ev ? 900 : 380; filt.Q.value = ev ? 1.2 : 3;
      g.gain.value = 0.5;
      lfo.connect(lfoGain); lfoGain.connect(g.gain);
      o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(engineBus);
      o1.start(); o2.start(); lfo.start();
      engine = { o1: o1, o2: o2, lfo: lfo, filt: filt, g: g, ev: ev };
      engineBus.gain.setTargetAtTime(0.16, ctx.currentTime, 0.2);
    },
    engineSet: function (speedRatio, throttle) {
      if (!engine) return;
      var t = ctx.currentTime;
      if (engine.ev) {                                  // electric motor: a smooth rising whine, no rumble
        var fe = 160 + speedRatio * 980 + throttle * 60;
        engine.o1.frequency.setTargetAtTime(fe, t, 0.1);
        engine.o2.frequency.setTargetAtTime(fe * 2.01, t, 0.1);
        engine.filt.frequency.setTargetAtTime(700 + speedRatio * 1600, t, 0.1);
        engineBus.gain.setTargetAtTime(0.05 + throttle * 0.05 + speedRatio * 0.05, t, 0.15);
        return;
      }
      var f = 38 + speedRatio * 48 + throttle * 14;
      engine.o1.frequency.setTargetAtTime(f, t, 0.12);
      engine.o2.frequency.setTargetAtTime(f / 2, t, 0.12);
      engine.lfo.frequency.setTargetAtTime(8 + speedRatio * 14 + throttle * 4, t, 0.12);
      engine.filt.frequency.setTargetAtTime(320 + throttle * 520 + speedRatio * 300, t, 0.1);
      engineBus.gain.setTargetAtTime(0.11 + throttle * 0.08 + speedRatio * 0.04, t, 0.15);
    },
    setEngineType: function (type) {
      type = type === 'ev' ? 'ev' : 'diesel';
      if (type === engineType) return;
      engineType = type;
      if (engine) { this.engineOff(); var self = this; setTimeout(function () { self.engineOn(); }, 450); }
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
