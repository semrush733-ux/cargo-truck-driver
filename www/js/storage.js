/* storage.js — progress & settings saved in localStorage (works in browser and Capacitor WebView). */
window.CT = window.CT || {};
(function (CT) {
  'use strict';
  var KEY = 'cargoTruckDriver.save.v1';
  var DEFAULTS = { settings: { sound: true, engine: true, vibrate: true }, levels: {} };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      var p = JSON.parse(raw) || {};
      return {
        settings: Object.assign({}, DEFAULTS.settings, p.settings || {}),
        levels: (p.levels && typeof p.levels === 'object') ? p.levels : {}
      };
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
    completeLevel: function (id, result) {
      var prev = data.levels[id] || {};
      var isBest = !prev.bestTime || result.time < prev.bestTime;
      data.levels[id] = {
        completed: true,
        stars: Math.max(prev.stars || 0, result.stars),
        bestTime: isBest ? result.time : prev.bestTime,
        plays: (prev.plays || 0) + 1,
        lastPlayed: Date.now()
      };
      write();
      return { isBest: isBest && !!prev.bestTime, record: data.levels[id] };
    },
    resetProgress: function () { data.levels = {}; write(); },
    reload: function () { data = read(); }
  };
})(window.CT);
