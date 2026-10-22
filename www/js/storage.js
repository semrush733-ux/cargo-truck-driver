/* storage.js — versioned local save (offline-first). Every field is validated on load, so one bad field
   never wipes the rest of the save. Works in browsers and in the Capacitor WebView. */
window.CT = window.CT || {};
(function (CT) {
  'use strict';
  var KEY = 'cargoTruckDriver.save.v1';
  var SCHEMA = 2;

  var DEFAULT_SETTINGS = { sound: true, music: true, engine: true, vibrate: true, gyro: false, gyroSens: 15, camera: 'side' };
  var UPGRADE_KEYS = ['engine', 'tyres', 'suspension', 'brakes', 'stability', 'fuel'];
  var STAT_KEYS = ['deliveries', 'perfect', 'noLoss', 'itemsDelivered', 'itemsLost', 'distanceM', 'upgradesBought', 'crashes', 'starsEarned', 'levelsFailed', 'cosmeticsBought'];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function num(v, def, min, max) { v = Number(v); if (!isFinite(v)) return def; if (min != null && v < min) v = min; if (max != null && v > max) v = max; return v; }
  function bool(v, def) { return typeof v === 'boolean' ? v : def; }
  function str(v, def) { return typeof v === 'string' && v ? v : def; }
  function strArr(v, def) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : def; }

  function defaults() {
    var d = {
      schema: SCHEMA,
      settings: clone(DEFAULT_SETTINGS),
      levels: {}, fails: {},
      coins: 0,
      upgrades: {},
      paints: ['orange'], paint: 'orange',
      wheels: ['silver'], wheel: 'silver',
      accessories: [], equipped: [],
      stats: {},
      achievements: {},          // id -> unlock timestamp (ms)
      missions: { date: '', progress: {}, claimed: {} },
      rewardKeys: {}             // dedupe keys for one-off rewards
    };
    UPGRADE_KEYS.forEach(function (k) { d.upgrades[k] = 0; });
    STAT_KEYS.forEach(function (k) { d.stats[k] = 0; });
    return d;
  }

  /** Validates every field separately; unknown or broken fields fall back to defaults. */
  function normalise(p) {
    var d = defaults();
    if (!isObj(p)) return d;
    if (isObj(p.settings)) {
      var s = p.settings;
      d.settings.sound = bool(s.sound, true); d.settings.music = bool(s.music, true);
      d.settings.engine = bool(s.engine, true); d.settings.vibrate = bool(s.vibrate, true);
      d.settings.gyro = bool(s.gyro, false); d.settings.gyroSens = num(s.gyroSens, 15, 6, 30);
      d.settings.camera = ['side', 'chase', 'cab'].indexOf(s.camera) >= 0 ? s.camera : 'side';
    }
    if (isObj(p.levels)) {
      Object.keys(p.levels).forEach(function (id) {
        var l = p.levels[id];
        if (!isObj(l) || !(Number(id) >= 1 && Number(id) <= 999)) return;
        d.levels[id] = {
          completed: bool(l.completed, false), stars: num(l.stars, 0, 0, 3),
          bestTime: l.bestTime == null ? null : num(l.bestTime, null, 0), plays: num(l.plays, 0, 0), lastPlayed: num(l.lastPlayed, 0, 0)
        };
      });
    }
    if (isObj(p.fails)) Object.keys(p.fails).forEach(function (id) { var n = num(p.fails[id], 0, 0, 99); if (n) d.fails[id] = n; });
    d.coins = Math.floor(num(p.coins, 0, 0, 1e9));
    if (isObj(p.upgrades)) UPGRADE_KEYS.forEach(function (k) { d.upgrades[k] = Math.floor(num(p.upgrades[k], 0, 0, 5)); });
    d.paints = strArr(p.paints, d.paints); if (d.paints.indexOf('orange') < 0) d.paints.unshift('orange');
    d.paint = d.paints.indexOf(p.paint) >= 0 ? p.paint : 'orange';
    d.wheels = strArr(p.wheels, d.wheels); if (d.wheels.indexOf('silver') < 0) d.wheels.unshift('silver');
    d.wheel = d.wheels.indexOf(p.wheel) >= 0 ? p.wheel : 'silver';
    d.accessories = strArr(p.accessories, []);
    d.equipped = strArr(p.equipped, []).filter(function (a) { return d.accessories.indexOf(a) >= 0; });
    if (isObj(p.stats)) STAT_KEYS.forEach(function (k) { d.stats[k] = num(p.stats[k], 0, 0); });
    if (isObj(p.achievements)) Object.keys(p.achievements).forEach(function (k) { var ts = num(p.achievements[k], 0, 0); if (ts) d.achievements[k] = ts; });
    if (isObj(p.missions) && typeof p.missions.date === 'string') {
      d.missions.date = p.missions.date;
      if (isObj(p.missions.progress)) Object.keys(p.missions.progress).forEach(function (k) { d.missions.progress[k] = num(p.missions.progress[k], 0, 0); });
      if (isObj(p.missions.claimed)) Object.keys(p.missions.claimed).forEach(function (k) { if (p.missions.claimed[k] === true) d.missions.claimed[k] = true; });
    }
    if (isObj(p.rewardKeys)) Object.keys(p.rewardKeys).forEach(function (k) { if (p.rewardKeys[k]) d.rewardKeys[k] = 1; });
    return d;
  }

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return defaults();
      return normalise(JSON.parse(raw));
    } catch (e) { return defaults(); }
  }

  var data = read();
  var saveError = false;

  function write() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); saveError = false; }
    catch (e) { saveError = true; /* storage unavailable or full: keep playing from memory */ }
  }

  CT.Storage = {
    SCHEMA: SCHEMA,
    UPGRADE_KEYS: UPGRADE_KEYS,
    normalise: normalise,
    hasSaveError: function () { return saveError; },
    getSetting: function (k) { return data.settings[k]; },
    setSetting: function (k, v) { data.settings[k] = v; write(); },
    getLevel: function (id) { return data.levels[id] || null; },
    isCompleted: function (id) { var l = data.levels[id]; return !!(l && l.completed); },
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
    totalStars: function () { var s = 0; for (var k in data.levels) s += data.levels[k].stars || 0; return s; },
    completedCount: function () { var n = 0; for (var k in data.levels) if (data.levels[k].completed) n++; return n; },
    getFails: function (id) { return data.fails[id] || 0; },
    addFail: function (id) { data.fails[id] = (data.fails[id] || 0) + 1; write(); return data.fails[id]; },
    clearFails: function (id) { if (data.fails[id]) { delete data.fails[id]; write(); } },

    // coins: only CT.Rewards adds coins; purchases go through spend()
    getCoins: function () { return data.coins; },
    _addCoins: function (n) { data.coins = Math.max(0, Math.min(1e9, data.coins + Math.floor(n))); write(); return data.coins; },
    spend: function (n) {
      n = Math.floor(n);
      if (!(n >= 0) || data.coins < n) return false;
      data.coins -= n; write(); return true;
    },
    hasRewardKey: function (k) { return !!data.rewardKeys[k]; },
    setRewardKey: function (k) { data.rewardKeys[k] = 1; write(); },

    getUpgrade: function (k) { return data.upgrades[k] || 0; },
    getUpgrades: function () { return Object.assign({}, data.upgrades); },
    setUpgrade: function (k, lvl) { data.upgrades[k] = lvl; write(); },

    ownsPaint: function (p) { return data.paints.indexOf(p) >= 0; },
    addPaint: function (p) { if (!this.ownsPaint(p)) { data.paints.push(p); write(); } },
    getPaint: function () { return data.paint; },
    setPaint: function (p) { data.paint = p; write(); },
    ownsWheel: function (w) { return data.wheels.indexOf(w) >= 0; },
    addWheel: function (w) { if (!this.ownsWheel(w)) { data.wheels.push(w); write(); } },
    getWheel: function () { return data.wheel; },
    setWheel: function (w) { data.wheel = w; write(); },
    ownsAccessory: function (a) { return data.accessories.indexOf(a) >= 0; },
    addAccessory: function (a) { if (!this.ownsAccessory(a)) { data.accessories.push(a); write(); } },
    isEquipped: function (a) { return data.equipped.indexOf(a) >= 0; },
    toggleAccessory: function (a) {
      if (!this.ownsAccessory(a)) return false;
      var i = data.equipped.indexOf(a);
      if (i >= 0) data.equipped.splice(i, 1); else data.equipped.push(a);
      write(); return true;
    },
    getEquipped: function () { return data.equipped.slice(); },

    stat: function (k) { return data.stats[k] || 0; },
    addStat: function (k, n) { data.stats[k] = (data.stats[k] || 0) + n; write(); return data.stats[k]; },
    getAchievement: function (id) { return data.achievements[id] || 0; },
    unlockAchievement: function (id) { if (data.achievements[id]) return false; data.achievements[id] = Date.now(); write(); return true; },
    getMissions: function () { return data.missions; },
    setMissions: function (m) { data.missions = m; write(); },

    resetProgress: function () {
      var settings = data.settings;
      data = defaults(); data.settings = settings; write();
    },
    reload: function () { data = read(); },
    _raw: function () { return data; }
  };
})(window.CT);
