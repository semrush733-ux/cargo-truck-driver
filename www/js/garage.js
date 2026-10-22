/* garage.js — truck upgrades, paint jobs, coin rewards and the resulting truck stats. */
(function (CT) {
  'use strict';

  var UPGRADES = {
    engine:     { name: 'Engine',     icon: 'engine',  desc: 'Higher top speed and faster acceleration', costs: [400, 900, 1600, 2600, 4000] },
    tyres:      { name: 'Tyres',      icon: 'tyre',    desc: 'More grip on snow, sand and steep hills',   costs: [300, 750, 1300, 2100, 3200] },
    suspension: { name: 'Suspension', icon: 'spring',  desc: 'Less cargo damage on bumps, curves, crashes', costs: [350, 800, 1400, 2300, 3500] },
    brakes:     { name: 'Brakes',     icon: 'brake',   desc: 'Stops the truck in a shorter distance',     costs: [250, 600, 1100, 1800, 2800] }
  };
  var MAX_LEVEL = 5;

  var PAINTS = [
    { id: 'orange', name: 'Classic Orange', cost: 0,    body: '#f8a619', light: '#ffc23d', dark: '#d9820b', line: '#c47208', lip: '#ffd25e' },
    { id: 'blue',   name: 'Ocean Blue',     cost: 800,  body: '#2f7fe0', light: '#5ea2f2', dark: '#1d5cb0', line: '#174a8e', lip: '#8cc0ff' },
    { id: 'red',    name: 'Fire Red',       cost: 1200, body: '#e23b30', light: '#ff6a5c', dark: '#b4231b', line: '#8e1812', lip: '#ff9a8f' },
    { id: 'green',  name: 'Forest Green',   cost: 1500, body: '#2fae4f', light: '#5ccf74', dark: '#1f8338', line: '#176a2c', lip: '#8fe6a1' },
    { id: 'purple', name: 'Royal Purple',   cost: 2200, body: '#8a4fd8', light: '#ad7cf0', dark: '#6631ad', line: '#4f2589', lip: '#cfb0ff' },
    { id: 'black',  name: 'Midnight Gold',  cost: 3500, body: '#2a2d36', light: '#454a57', dark: '#16181e', line: '#d9a521', lip: '#f2c443' }
  ];

  var THEME_GRIP = { country: 1, city: 1, desert: 0.8, snow: 0.6, night: 0.95 };

  CT.Garage = {
    UPGRADES: UPGRADES,
    MAX_LEVEL: MAX_LEVEL,
    PAINTS: PAINTS,

    nextCost: function (key) {
      var lvl = CT.Storage.getUpgrade(key);
      return lvl >= MAX_LEVEL ? null : UPGRADES[key].costs[lvl];
    },

    buy: function (key) {
      var cost = this.nextCost(key);
      if (cost === null || !CT.Storage.spend(cost)) return false;
      CT.Storage.setUpgrade(key, CT.Storage.getUpgrade(key) + 1);
      return true;
    },

    paint: function (id) {
      for (var i = 0; i < PAINTS.length; i++) if (PAINTS[i].id === id) return PAINTS[i];
      return PAINTS[0];
    },

    buyPaint: function (id) {
      var p = this.paint(id);
      if (CT.Storage.ownsPaint(id)) { CT.Storage.setPaint(id); return true; }
      if (!CT.Storage.spend(p.cost)) return false;
      CT.Storage.addPaint(id); CT.Storage.setPaint(id);
      return true;
    },

    /** Truck physics for a level, from the upgrade levels and the level's terrain. */
    truckConfig: function (level, upgrades) {
      var u = upgrades || CT.Storage.getUpgrades();
      var grip = Math.min(1.05, (THEME_GRIP[level.theme] || 1) + u.tyres * 0.085);
      var cfg = {
        maxSpeed: (500 + u.engine * 66) * CT.K,   // 180 km/h … 299 km/h
        accel: (330 + u.engine * 46) * CT.K,
        brake: (920 + u.brakes * 170) * CT.K,
        reverseMax: 170 * CT.K,
        reverseAccel: 240 * CT.K,
        grip: grip,
        damageMult: 1 - u.suspension * 0.13,
        suspension: u.suspension
      };
      if (level.truck && level.truck.maxSpeedCap) cfg.maxSpeed = Math.min(cfg.maxSpeed, level.truck.maxSpeedCap);
      return cfg;
    },

    /** Coins for finishing a level. */
    reward: function (level, stars, save) {
      var base = save.firstTime ? 150 + level.id * 15 : 40;
      return base + save.newStars * 100;
    },

    kmh: function (unitsPerSecond) { return unitsPerSecond * CT.Levels.METERS_PER_UNIT * 3.6; }
  };
})(window.CT);
