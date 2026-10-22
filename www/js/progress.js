/* progress.js — daily missions (same 3 missions all day, new ones each calendar date, offline) and achievements. */
(function (CT) {
  'use strict';

  // ------------------------------------------------------------------ daily missions
  var MISSION_POOL = [
    { id: 'deliver3', name: 'Busy day',        desc: 'Complete 3 deliveries',                      target: 3,    reward: 300 },
    { id: 'perfect1', name: 'Handle with care', desc: 'Deliver with less than 10% cargo damage',   target: 1,    reward: 250 },
    { id: 'noloss2',  name: 'Nothing left behind', desc: 'Deliver twice without losing any cargo', target: 2,    reward: 250 },
    { id: 'dist5',    name: 'Long haul',       desc: 'Drive 5 km',                                 target: 5000, reward: 300, unit: 'm' },
    { id: 'items9',   name: 'Heavy lifting',   desc: 'Deliver 9 cargo items',                      target: 9,    reward: 250 },
    { id: 'stars6',   name: 'Star collector',  desc: 'Earn 6 stars in deliveries',                 target: 6,    reward: 300 },
    { id: 'clean1',   name: 'Model driver',    desc: 'Deliver with no crashes and no red lights',  target: 1,    reward: 300 },
    { id: 'fast1',    name: 'Express',         desc: 'Beat the target time once',                  target: 1,    reward: 300 }
  ];

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function missionsFor(date) {
    var rnd = CT.Draw.rng(hash('missions:' + date)), pool = MISSION_POOL.slice(), out = [];
    while (out.length < 3) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  }

  function state() {
    var m = CT.Storage.getMissions(), d = today();
    if (m.date !== d) { m = { date: d, progress: {}, claimed: {} }; CT.Storage.setMissions(m); }
    return m;
  }

  // ------------------------------------------------------------------ achievements
  var ACH = [
    { id: 'first_delivery', name: 'First Delivery',      desc: 'Complete your first delivery',             stat: 'deliveries',     target: 1,      reward: 200 },
    { id: 'first_perfect',  name: 'Perfect Delivery',    desc: 'Deliver with less than 10% cargo damage',  stat: 'perfect',        target: 1,      reward: 300 },
    { id: 'deliveries_10',  name: 'Regular Driver',      desc: 'Complete 10 deliveries',                   stat: 'deliveries',     target: 10,     reward: 500 },
    { id: 'deliveries_50',  name: 'Road Veteran',        desc: 'Complete 50 deliveries',                   stat: 'deliveries',     target: 50,     reward: 1500 },
    { id: 'items_100',      name: 'Hundred Items',       desc: 'Deliver 100 cargo items',                  stat: 'itemsDelivered', target: 100,    reward: 1000 },
    { id: 'no_loss_10',     name: 'Nothing Lost',        desc: 'Finish 10 deliveries without losing cargo', stat: 'noLoss',        target: 10,     reward: 600 },
    { id: 'first_upgrade',  name: 'Mechanic',            desc: 'Buy your first truck upgrade',             stat: 'upgradesBought', target: 1,      reward: 200 },
    { id: 'stylist',        name: 'Stylist',             desc: 'Buy a paint, wheel or accessory',          stat: 'cosmeticsBought', target: 1,     reward: 200 },
    { id: 'distance_25',    name: '25 km Club',          desc: 'Drive 25 km in total',                     stat: 'distanceM',      target: 25000,  reward: 500, unit: 'm' },
    { id: 'distance_100',   name: '100 km Club',         desc: 'Drive 100 km in total',                    stat: 'distanceM',      target: 100000, reward: 1500, unit: 'm' },
    { id: 'stars_30',       name: 'Rising Star',         desc: 'Hold 30 stars across all levels',          fn: function () { return CT.Storage.totalStars3d(); }, target: 30, reward: 500 },
    { id: 'chapter_1',      name: 'Valley Master',       desc: 'Finish all Green Valley levels',           fn: function () { var r = CT.Storage.getLevel3d(6); return r && r.completed ? 1 : 0; }, target: 1, reward: 800 },
    { id: 'all_levels',     name: 'Legend of the Road',  desc: 'Finish all 30 levels',                     fn: function () { var n = 0; for (var i = 1; i <= 30; i++) { var r = CT.Storage.getLevel3d(i); if (r && r.completed) n++; } return n; }, target: 30, reward: 5000 }
  ];

  function achValue(a) { return a.fn ? a.fn() : CT.Storage.stat(a.stat); }

  CT.Progress = {
    MISSION_POOL: MISSION_POOL,
    ACHIEVEMENTS: ACH,
    today: today,
    missionsFor: missionsFor,
    listeners: [],
    onUnlock: function (fn) { this.listeners.push(fn); },

    missions: function () {
      var st = state();
      return missionsFor(st.date).map(function (m) {
        var p = Math.min(m.target, st.progress[m.id] || 0);
        return Object.assign({}, m, { progress: p, done: p >= m.target, claimed: !!st.claimed[m.id] });
      });
    },
    unclaimedCount: function () { return this.missions().filter(function (m) { return m.done && !m.claimed; }).length; },

    addMission: function (id, n) {
      var st = state();
      var active = missionsFor(st.date).map(function (m) { return m.id; });
      if (active.indexOf(id) < 0 || st.claimed[id]) return;
      st.progress[id] = (st.progress[id] || 0) + n;
      CT.Storage.setMissions(st);
    },

    claim: function (id) {
      var st = state(), m = missionsFor(st.date).filter(function (x) { return x.id === id; })[0];
      if (!m || st.claimed[id] || (st.progress[id] || 0) < m.target) return 0;
      var got = CT.Rewards.grant('mission:' + st.date + ':' + id, m.reward, true);
      st.claimed[id] = true;
      CT.Storage.setMissions(st);
      return got;
    },

    achievements: function () {
      return ACH.map(function (a) {
        var v = achValue(a), ts = CT.Storage.getAchievement(a.id);
        return Object.assign({}, a, { value: Math.min(a.target, v), unlocked: !!ts, at: ts });
      });
    },

    /** Unlocks any achievement whose condition is met (each only once). */
    check: function () {
      var self = this, out = [];
      ACH.forEach(function (a) {
        if (CT.Storage.getAchievement(a.id) || achValue(a) < a.target) return;
        if (CT.Storage.unlockAchievement(a.id)) {
          var got = CT.Rewards.grant('ach:' + a.id, a.reward, true);
          out.push({ a: a, coins: got });
          self.listeners.forEach(function (fn) { fn(a, got); });
        }
      });
      return out;
    },

    /** Called once per finished delivery. */
    recordDelivery: function (r) {
      var S = CT.Storage;
      S.addStat('deliveries', 1);
      S.addStat('itemsDelivered', r.delivered);
      S.addStat('itemsLost', r.lost);
      S.addStat('starsEarned', r.stars);
      if (r.lost === 0) S.addStat('noLoss', 1);
      if (r.damagePct < 10 && r.lost === 0) S.addStat('perfect', 1);
      this.addMission('deliver3', 1);
      this.addMission('items9', r.delivered);
      this.addMission('stars6', r.stars);
      if (r.lost === 0) this.addMission('noloss2', 1);
      if (r.damagePct < 10 && r.lost === 0) this.addMission('perfect1', 1);
      if (r.crashes === 0 && r.violations === 0) this.addMission('clean1', 1);
      if (r.fast) this.addMission('fast1', 1);
      this.check();
    },
    recordDistance: function (meters) {
      if (!(meters > 0)) return;
      CT.Storage.addStat('distanceM', meters);
      this.addMission('dist5', meters);
      this.check();
    },
    recordFail: function () { CT.Storage.addStat('levelsFailed', 1); }
  };
})(window.CT);
