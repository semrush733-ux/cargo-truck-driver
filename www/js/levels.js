/* levels.js — level registry, station layout helper and the generator for levels 2–50.
 *
 * Level config fields:
 *   id, name, chapter, theme ('country' | 'city' | 'desert' | 'snow' | 'night'), implemented, tutorial
 *   cargo:       { type, count } or { items: [type, type, type], count } (mixed load); kinds in cargo.js
 *   truck:       { maxSpeedCap }                      optional cap (tutorial)
 *   start:       { x }
 *   road:        { start, end, terrain: [{x,y}], curves: [{x1,x2,dir,sharp,limit}] }   y<0 is uphill
 *   loadStation / destination                        built by CT.Levels.stations()
 *   traffic:     { density, speedMin, speedMax, exitX } density = cars kept around the truck
 *   lights:      [{ x, green, yellow, red, offset }]
 *   obstacles:   [{ type: 'bump', x }]
 *   delivery:    { maxSpeed }
 *   par:         seconds for the "fast delivery" star
 *   timeLimit:   seconds or null (level fails when it runs out)
 */
(function (CT) {
  'use strict';
  var list = [];
  var D = CT.Draw;

  var CHAPTERS = [
    { theme: 'country', name: 'Green Valley' },
    { theme: 'city',    name: 'Metro City' },
    { theme: 'desert',  name: 'Sahara Run' },
    { theme: 'snow',    name: 'Frozen Pass' },
    { theme: 'night',   name: 'Night Express' }
  ];
  // single-type loads cycle through these; every 3rd level is a mixed load
  var CARGO = ['box', 'sacks', 'fruit', 'crate', 'barrel', 'gas', 'glass', 'fridge', 'steel'];
  var MIX = ['box', 'sacks', 'fruit', 'crate', 'barrel', 'gas', 'fridge'];

  function makeSlots(dock, n) {
    var spacing = 125, out = [];
    var first = dock.x - spacing * (n - 1) / 2;
    for (var i = 0; i < n; i++) out.push({ x: first + i * spacing, y: dock.top - 10 });   // boxes sit on 10-unit pallets
    return out;
  }

  var THEME_BUILD = {
    country: { load: ['#efe0bf', 'rgba(160,120,60,.22)', '#d0473b'], dest: ['#e3ecf6', 'rgba(60,100,160,.18)', '#2a6fd6'] },
    city:    { load: ['#d9dde4', 'rgba(60,70,90,.18)', '#4a5568'],   dest: ['#e3ecf6', 'rgba(60,100,160,.18)', '#2a6fd6'] },
    desert:  { load: ['#f1d9a8', 'rgba(150,100,40,.22)', '#b5562b'], dest: ['#f6e7c8', 'rgba(150,100,40,.2)', '#c06a2b'] },
    snow:    { load: ['#e8eef6', 'rgba(60,90,130,.18)', '#8a3b3b'],  dest: ['#eef3f9', 'rgba(60,100,160,.18)', '#2a6fd6'] },
    night:   { load: ['#9aa6bb', 'rgba(20,30,50,.25)', '#5a3040'],   dest: ['#a6b4c9', 'rgba(20,30,50,.25)', '#24508f'] }
  };

  /** Depot near the start + delivery hub around zone centre Z (same layout as the tutorial). */
  function stations(Z, zoneHalf, theme) {
    var c = THEME_BUILD[theme] || THEME_BUILD.country;
    return {
      loadStation: {
        name: 'Cargo Depot',
        dock: { x: 140, w: 470, top: -104 },
        building: { x1: -700, x2: 430, height: 300, wall: c.load[0], wallLine: c.load[1], roof: c.load[2], sign: 'CARGO DEPOT', signColor: '#f7901e', signX: -420, signW: 330 },
        door: { x: 140, w: 330, h: 230 },
        crane: { towerX: -190, boomLeft: -290, boomRight: 900, boomY: -476, restX: 330 },
        bay: { x1: 400, x2: 1010 }
      },
      destination: {
        name: 'Delivery Hub',
        zone: { x1: Z - zoneHalf, x2: Z + zoneHalf },
        dock: { x: Z - 540, w: 470, top: -104 },
        building: { x1: Z - 970, x2: Z + 650, height: 310, wall: c.dest[0], wallLine: c.dest[1], roof: c.dest[2], sign: 'DELIVERY HUB', signColor: '#1f8a43', signX: Z + 390, signW: 340, flags: [Z - 890, Z - 710, Z + 470, Z + 590] },
        door: { x: Z - 540, w: 330, h: 230 },
        crane: { towerX: Z - 830, boomLeft: Z - 920, boomRight: Z + 110, boomY: -476, restX: Z - 310 }
      }
    };
  }

  function normalise(cfg) {
    if (!cfg.implemented) return cfg;
    cfg.road.length = cfg.road.end - cfg.road.start;
    cfg.road.curves = cfg.road.curves || [];
    cfg.obstacles = cfg.obstacles || [];
    cfg.lights = cfg.lights || [];
    cfg.traffic = cfg.traffic || null;
    cfg.delivery = Object.assign({ maxSpeed: 14 * CT.K }, cfg.delivery || {});
    [cfg.loadStation, cfg.destination].forEach(function (st) {
      st.dockSlots = st.dockSlots || makeSlots(st.dock, cfg.cargo.count);
    });
    return cfg;
  }

  // ------------------------------------------------------------------ generator for levels 2..50
  function generate(n) {
    var rnd = D.rng(n * 7919 + 13);
    var ch = Math.floor((n - 1) / 10), chapter = CHAPTERS[ch];
    var theme = chapter.theme;
    var k = (n - 2) / 48;                       // overall difficulty 0..1
    var local = ((n - 1) % 10) / 9;             // difficulty inside the chapter 0..1
    var diff = Math.min(1, 0.12 + 0.6 * k + 0.28 * local);
    var start = 700;
    var L = Math.round((6200 + n * 400 + rnd() * 1200) * 2.1);
    var Z = start + L;
    var zoneHalf = Math.round(380 - 55 * diff);

    // ---- terrain: flat at both stations, rolling hills in between
    var hillAmp = { country: 1, city: 0.45, desert: 0.8, snow: 1.35, night: 0.9 }[theme];
    var amp = n < 3 ? 0 : (60 + 260 * diff) * hillAmp;
    var maxSlope = 0.06 + 0.09 * diff;
    var terrain = [{ x: -2500, y: 0 }, { x: 1400, y: 0 }];
    var x = 1400, y = 0;
    while (x < Z - 4000) {
      var step = 1300 + rnd() * 1400;
      var target = (rnd() * 2 - 1) * amp;
      if (target < -amp * 0.9) target = -amp * 0.9;
      var dy = D.clamp(target - y, -maxSlope * step, maxSlope * step);
      x += step; y += dy;
      terrain.push({ x: Math.round(x), y: Math.round(y) });
    }
    var back = Math.max(900, Math.abs(y) / maxSlope);
    terrain.push({ x: Math.round(Math.max(x + back, Z - 2400)), y: 0 });
    terrain.push({ x: Z + 3000, y: 0 });

    // ---- features placed in the middle stretch without overlapping
    var used = [];
    function freeSpot(len, from, to) {
      for (var tries = 0; tries < 40; tries++) {
        var p = from + rnd() * (to - from - len);
        if (used.every(function (u) { return p + len < u[0] - 1200 || p > u[1] + 1200; })) { used.push([p, p + len]); return p; }
      }
      return null;
    }
    var midFrom = 3000, midTo = Z - 4200;

    var curves = [];
    var nCurves = n < 4 ? 0 : 1 + Math.floor(diff * 4 + rnd());
    for (var i = 0; i < nCurves; i++) {
      var clen = 1500 + rnd() * 1900;
      var cx = freeSpot(clen, midFrom, midTo);
      if (cx === null) continue;
      var sharp = 0.35 + rnd() * 0.65 * (0.4 + diff * 0.6);
      var limit = Math.round((430 - 230 * sharp) / 10) * 10 * CT.K;   // ~155 … ~70 km/h
      curves.push({ x1: Math.round(cx), x2: Math.round(cx + clen), dir: rnd() < 0.5 ? -1 : 1, sharp: sharp, limit: limit });
    }

    var lights = [];
    var lightEvery = { country: 18000, city: 7500, desert: 22000, snow: 16000, night: 8500 }[theme];
    var nLights = n < 3 ? 0 : Math.max(theme === 'city' || theme === 'night' ? 2 : 1, Math.floor(L / lightEvery * (0.6 + diff)));
    for (i = 0; i < nLights; i++) {
      var lx = freeSpot(200, midFrom, midTo);
      if (lx === null) continue;
      var green = Math.round(7 - 2.5 * diff), red = Math.round(4 + 2 * diff);
      lights.push({ x: Math.round(lx + 100), green: green, yellow: 2, red: red, offset: rnd() * 10 });
    }

    var obstacles = [];
    var nBumps = n < 6 ? 0 : Math.floor(diff * 5 + rnd());
    for (i = 0; i < nBumps; i++) {
      var bx = freeSpot(60, midFrom, midTo);
      if (bx !== null) obstacles.push({ type: 'bump', x: Math.round(bx + 30), limit: 240 * CT.K });
    }
    lights.sort(function (a, b) { return a.x - b.x; });
    curves.sort(function (a, b) { return a.x1 - b.x1; });
    obstacles.sort(function (a, b) { return a.x - b.x; });

    // ---- traffic
    var dens = { country: 0.8, city: 1.5, desert: 0.6, snow: 0.7, night: 1.3 }[theme];
    var traffic = n < 2 ? null : {
      density: Math.round((2 + 7 * diff) * dens),
      speedMin: (170 + 40 * diff) * CT.K,
      speedMax: (330 + 60 * diff) * CT.K,
      weave: 0.25 + 0.75 * diff,
      exitX: Z - 3200
    };

    // ---- timing: par for the 3rd star, optional time limit
    var cruise = (380 - (theme === 'snow' ? 60 : theme === 'desert' ? 30 : 0)) * CT.K;
    var driveTime = L / cruise + curves.length * 2.5 + lights.length * 3.5 + obstacles.length * 1.5 + (traffic ? traffic.density * 0.6 : 0);
    var par = Math.round(driveTime + 19);
    var timeLimit = n >= 8 ? Math.round(par * (n >= 30 ? 1.45 : 1.65)) : null;

    var cargo;
    if (n % 3 === 0) {
      var items = [];
      for (var ci = 0; ci < 3; ci++) items.push(MIX[Math.floor(rnd() * MIX.length)]);
      if (items[0] === items[1] && items[1] === items[2]) items[2] = MIX[(MIX.indexOf(items[2]) + 3) % MIX.length];
      cargo = { items: items, count: 3 };
    } else {
      cargo = { type: CARGO[(n * 2 + ch) % CARGO.length], count: 3 };
    }
    var st = stations(Z, zoneHalf, theme);
    var meters = Math.round((Z - 1500) * CT.Levels.METERS_PER_UNIT);

    return {
      id: n, implemented: true, tutorial: false,
      name: chapter.name + ' ' + (((n - 1) % 10) + 1),
      chapter: ch, chapterName: chapter.name, theme: theme, seed: n * 31 + 5,
      cargo: cargo,
      truck: {},
      start: { x: start },
      road: { start: -760, end: Z + 690, terrain: terrain, curves: curves },
      loadStation: st.loadStation,
      destination: st.destination,
      signs: [{ x: 1500, text: 'DELIVERY HUB', sub: '→ ' + meters + ' m', color: '#1f8a43', w: 260 }],
      traffic: traffic,
      lights: lights,
      obstacles: obstacles,
      delivery: { maxSpeed: 14 * CT.K },
      par: par,
      timeLimit: timeLimit
    };
  }

  CT.Levels = {
    METERS_PER_UNIT: 0.04,
    COUNT: 50,
    CHAPTERS: CHAPTERS,
    stations: stations,
    register: function (cfg) { list.push(normalise(cfg)); list.sort(function (a, b) { return a.id - b.id; }); },
    all: function () { return list.slice(); },
    get: function (id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; },
    isUnlocked: function (id) {
      var lv = this.get(id);
      if (!lv || !lv.implemented) return false;
      if (id === 1 || CT.UNLOCK_ALL) return true;
      return CT.Storage.isCompleted(id - 1);
    },
    /** Highest unlocked level that is not finished yet (or the last one). */
    nextToPlay: function () {
      for (var i = 1; i <= this.COUNT; i++) { if (!CT.Storage.isCompleted(i) && this.isUnlocked(i)) return i; }
      return this.COUNT;
    },
    generateAll: function () {
      for (var n = 2; n <= this.COUNT; n++) this.register(generate(n));
    }
  };
})(window.CT);
