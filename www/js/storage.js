/* storage.js — progress, coins, upgrades and settings saved in localStorage (browser + Capacitor WebView). */
window.CT = window.CT || {};
(function (CT) {
  'use strict';
  var KEY = 'cargoTruckDriver.save.v1';
  var DEFAULTS = {
    settings: { sound: true, engine: true, vibrate: true, gyro: false, camera: 'side' },
    levels: {},
    coins: 0,
    upgrades: { engine: 0, tyres: 0, suspension: 0, brakes: 0 },
    paints: ['orange'],
    paint: 'orange',
    fails: {}
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      var p = JSON.parse(raw) || {};
      var d = clone(DEFAULTS);
      d.settings = Object.assign(d.settings, p.settings || {});
      d.levels = (p.levels && typeof p.levels === 'object') ? p.levels : {};
      d.coins = typeof p.coins === 'number' && p.coins >= 0 ? Math.floor(p.coins) : 0;
      d.upgrades = Object.assign(d.upgrades, p.upgrades || {});
      d.paints = Array.isArray(p.paints) && p.paints.length ? p.paints : ['orange'];
      d.paint = typeof p.paint === 'string' ? p.paint : 'orange';
      d.fails = (p.fails && typeof p.fails === 'object') ? p.fails : {};
      return d;
    } catch (e) { return clone(DEFAULTS); }
  }

  var data = read();

  function write() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable: keep in memory */ }
  }

  CT.Storage = {
    getSetting: function (k) { return data.settings[k]; },
    setSetting: function (k, v) { data.settings[k] = v; write(); },
    getLevel: function (id) { return data.levels[id] || null; },
    isCompleted: function (id) { var l = data.levels[id]; return !!(l && l.completed); },
    /** Saves a finished level; returns best-time flag and how many stars are new (for coin rewards). */
    completeLevel: function (id, result) {
      var prev = data.levels[id] || {};
      var isBest = !prev.bestTime || result.time < prev.bestTime;
      var newStars = Math.max(0, result.stars - (prev.stars || 0));
      data.levels[id] = {
        completed: true,
        stars: Math.max(prev.stars || 0, result.stars),
        bestTime: isBest ? result.time : prev.bestTime,
        plays: (prev.plays || 0) + 1,
        lastPlayed: Date.now()
      };
      write();
      return { isBest: isBest && !!prev.bestTime, firstTime: !prev.completed, newStars: newStars, record: data.levels[id] };
    },
    totalStars: function () {
      var s = 0; for (var k in data.levels) s += data.levels[k].stars || 0; return s;
    },
    completedCount: function () {
      var n = 0; for (var k in data.levels) if (data.levels[k].completed) n++; return n;
    },
    getFails: function (id) { return data.fails[id] || 0; },
    addFail: function (id) { data.fails[id] = (data.fails[id] || 0) + 1; write(); return data.fails[id]; },
    clearFails: function (id) { if (data.fails[id]) { delete data.fails[id]; write(); } },
    getCoins: function () { return data.coins; },
    addCoins: function (n) { data.coins = Math.max(0, data.coins + Math.floor(n)); write(); return data.coins; },
    spend: function (n) { if (data.coins < n) return false; data.coins -= n; write(); return true; },
    getUpgrade: function (k) { return data.upgrades[k] || 0; },
    getUpgrades: function () { return Object.assign({}, data.upgrades); },
    setUpgrade: function (k, lvl) { data.upgrades[k] = lvl; write(); },
    ownsPaint: function (p) { return data.paints.indexOf(p) >= 0; },
    addPaint: function (p) { if (!this.ownsPaint(p)) { data.paints.push(p); write(); } },
    getPaint: function () { return data.paint; },
    setPaint: function (p) { data.paint = p; write(); },
    resetProgress: function () {
      var settings = data.settings;
      data = clone(DEFAULTS); data.settings = settings; write();
    },
    reload: function () { data = read(); }
  };
})(window.CT);
