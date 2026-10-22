/* garage.js — upgrades, paint, wheels, accessories and the truck stats they produce. Every upgrade changes gameplay. */
(function (CT) {
  'use strict';

  var UPGRADES = {
    engine:     { name: 'Engine',          icon: '⚙️', desc: 'Higher top speed and faster acceleration',          costs: [400, 900, 1600, 2600, 4000] },
    brakes:     { name: 'Brakes',          icon: '🛑', desc: 'Stops the truck in a shorter distance',             costs: [250, 600, 1100, 1800, 2800] },
    tyres:      { name: 'Tyres',           icon: '🛞', desc: 'More grip on snow, ice, mud, rain and hills',       costs: [300, 750, 1300, 2100, 3200] },
    suspension: { name: 'Suspension',      icon: '🔩', desc: 'Less cargo damage on bumps, potholes, rough roads', costs: [350, 800, 1400, 2300, 3500] },
    stability:  { name: 'Cargo straps',    icon: '🪢', desc: 'Cargo slides less and does not fall off as easily', costs: [300, 700, 1200, 2000, 3000] },
    fuel:       { name: 'Fuel tank',       icon: '⛽', desc: 'Bigger tank: drive further before running dry',     costs: [200, 500, 900, 1500, 2400] }
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

  var WHEELS = [
    { id: 'silver', name: 'Silver',       cost: 0,    rim: ['#ffffff', '#d3d6dc', '#a3a8b2'], hub: '#555c69' },
    { id: 'black',  name: 'Matte Black',  cost: 400,  rim: ['#6b707b', '#3a3e47', '#22252c'], hub: '#9aa3b2' },
    { id: 'red',    name: 'Racing Red',   cost: 800,  rim: ['#ff9a8f', '#e23b30', '#a3201a'], hub: '#2b2f38' },
    { id: 'chrome', name: 'Chrome',       cost: 1000, rim: ['#ffffff', '#e8f2ff', '#8fa6c2'], hub: '#c9d4e2' },
    { id: 'gold',   name: 'Gold',         cost: 1500, rim: ['#fff6b0', '#ffd21f', '#c98a00'], hub: '#7a4a00' }
  ];

  var ACCESSORIES = [
    { id: 'lightbar', name: 'Roof light bar', cost: 500,  desc: 'Amber lights on the cab roof' },
    { id: 'horns',    name: 'Air horns',      cost: 400,  desc: 'Chrome horns (louder horn)' },
    { id: 'bullbar',  name: 'Bull bar',       cost: 700,  desc: 'Steel guard on the bumper' },
    { id: 'flaps',    name: 'Mud flaps',      cost: 300,  desc: 'Flaps behind the rear wheels' },
    { id: 'beacon',   name: 'Rotating beacon',cost: 900,  desc: 'Flashing orange beacon' },
    { id: 'stripe',   name: 'Racing stripe',  cost: 600,  desc: 'Stripe along the cab' }
  ];

  var THEME_GRIP = { country: 1, city: 1, desert: 0.8, snow: 0.6, night: 0.95 };

  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }

  CT.Garage = {
    UPGRADES: UPGRADES,
    MAX_LEVEL: MAX_LEVEL,
    PAINTS: PAINTS,
    WHEELS: WHEELS,
    ACCESSORIES: ACCESSORIES,

    nextCost: function (key) {
      var lvl = CT.Storage.getUpgrade(key);
      return lvl >= MAX_LEVEL ? null : UPGRADES[key].costs[lvl];
    },

    /** Buys the next upgrade level. Coins are taken only after every check passes; no double charging. */
    buy: function (key) {
      if (!UPGRADES[key]) return false;
      var cost = this.nextCost(key);
      if (cost === null || CT.Storage.getCoins() < cost) return false;
      if (!CT.Storage.spend(cost)) return false;
      CT.Storage.setUpgrade(key, CT.Storage.getUpgrade(key) + 1);
      CT.Storage.addStat('upgradesBought', 1);
      if (CT.Progress) CT.Progress.check();
      return true;
    },

    paint: function (id) { return find(PAINTS, id); },
    wheel: function (id) { return find(WHEELS, id); },

    buyPaint: function (id) {
      var p = find(PAINTS, id);
      if (p.id !== id) return false;
      if (CT.Storage.ownsPaint(id)) { CT.Storage.setPaint(id); return true; }
      if (!CT.Storage.spend(p.cost)) return false;
      CT.Storage.addPaint(id); CT.Storage.setPaint(id);
      CT.Storage.addStat('cosmeticsBought', 1); if (CT.Progress) CT.Progress.check();
      return true;
    },
    buyWheel: function (id) {
      var w = find(WHEELS, id);
      if (w.id !== id) return false;
      if (CT.Storage.ownsWheel(id)) { CT.Storage.setWheel(id); return true; }
      if (!CT.Storage.spend(w.cost)) return false;
      CT.Storage.addWheel(id); CT.Storage.setWheel(id);
      CT.Storage.addStat('cosmeticsBought', 1); if (CT.Progress) CT.Progress.check();
      return true;
    },
    buyAccessory: function (id) {
      var a = find(ACCESSORIES, id);
      if (a.id !== id) return false;
      if (CT.Storage.ownsAccessory(id)) return CT.Storage.toggleAccessory(id);
      if (!CT.Storage.spend(a.cost)) return false;
      CT.Storage.addAccessory(id); CT.Storage.toggleAccessory(id);
      CT.Storage.addStat('cosmeticsBought', 1); if (CT.Progress) CT.Progress.check();
      return true;
    },

    /** Applies paint, wheels and accessories to the truck artwork. */
    applyLook: function () {
      CT.Truck.setPaint(this.paint(CT.Storage.getPaint()));
      CT.Truck.setCosmetics({ wheel: this.wheel(CT.Storage.getWheel()), acc: CT.Storage.getEquipped() });
    },

    /** Truck physics for a level, from the upgrade levels and the level's terrain. */
    truckConfig: function (level, upgrades) {
      var u = Object.assign({ engine: 0, brakes: 0, tyres: 0, suspension: 0, stability: 0, fuel: 0 }, upgrades || CT.Storage.getUpgrades());
      var grip = Math.min(1.05, (THEME_GRIP[level.theme] || 1) + u.tyres * 0.085);
      if (level.weather === 'rain') grip *= 0.88;
      var cfg = {
        maxSpeed: (500 + u.engine * 66) * CT.K,   // 180 km/h … 299 km/h
        accel: (330 + u.engine * 46) * CT.K,
        brake: (920 + u.brakes * 170) * CT.K,
        reverseMax: 170 * CT.K,
        reverseAccel: 240 * CT.K,
        grip: grip,
        tyres: u.tyres,
        damageMult: 1 - u.suspension * 0.13,
        suspension: u.suspension,
        stability: u.stability,                    // 0..5: less sliding, higher fall-off threshold
        fuelCapacity: 100 * (1 + u.fuel * 0.15)    // litres
      };
      if (level.truck && level.truck.maxSpeedCap) cfg.maxSpeed = Math.min(cfg.maxSpeed, level.truck.maxSpeedCap);
      return cfg;
    },

    kmh: function (unitsPerSecond) { return unitsPerSecond * CT.Levels.METERS_PER_UNIT * 3.6; }
  };
})(window.CT);
