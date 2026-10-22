/* levels3d.js — data for the 3D levels, kept apart from the gameplay code.
   A road is a list of segments; each segment can turn (degrees over its length), climb (metres), and carry a
   surface type. Obstacles are placed by distance along the road (s, metres). New levels need only new data. */
(function (CT) {
  'use strict';

  /*  segment: { len, turn?, rise?, type? }   type: 'mud' | 'ice' | 'rough' | 'bridge' | 'narrow'
      obstacle: { type: 'bump' | 'pothole' | 'cone', s, lane?: 'L' | 'R' }
      weather: 'clear' | 'rain' | 'fog'      theme: 'country' | 'desert' | 'snow'                          */
  var LEVELS = [
    {
      id: 1, name: 'First Delivery', tutorial: true, theme: 'country', weather: 'clear',
      segments: [{ len: 330 }],                       // short, flat and straight
      obstacles: [],
      cargo: ['box', 'box', 'box'], par: 70, timeLimit: null, fuel: 0.15,
      tips: true
    },
    {
      id: 2, name: 'Valley Road', theme: 'country', weather: 'clear',
      segments: [{ len: 140 }, { len: 120, turn: 35 }, { len: 120, rise: 8 }, { len: 90 }, { len: 120, turn: -40 }, { len: 120, rise: -8 }, { len: 160 }],
      obstacles: [{ type: 'bump', s: 230 }, { type: 'bump', s: 640 }],
      cargo: ['box', 'crate', 'box'], par: 75, timeLimit: null, fuel: 0.3
    },
    {
      id: 3, name: 'River Crossing', theme: 'country', weather: 'rain',
      segments: [{ len: 140 }, { len: 110, turn: -30 }, { len: 120, type: 'bridge' }, { len: 100, turn: 30 }, { len: 120, type: 'mud' }, { len: 90, rise: 6 }, { len: 180 }],
      obstacles: [{ type: 'pothole', s: 210, lane: 'R' }, { type: 'pothole', s: 560, lane: 'R' }, { type: 'bump', s: 700 }],
      cargo: ['crate', 'barrel', 'box'], par: 85, timeLimit: null, fuel: 0.35
    },
    {
      id: 4, name: 'Roadworks', theme: 'desert', weather: 'clear',
      segments: [{ len: 150 }, { len: 120, rise: 10 }, { len: 160, type: 'narrow' }, { len: 120, turn: 55 }, { len: 120, rise: -10, type: 'rough' }, { len: 200 }],
      obstacles: [{ type: 'bump', s: 120 }, { type: 'pothole', s: 470, lane: 'R' }, { type: 'pothole', s: 720, lane: 'L' }],
      cargo: ['box', 'box', 'glass'], par: 90, timeLimit: 150, fuel: 0.4
    },
    {
      id: 5, name: 'Mountain Road', theme: 'country', weather: 'clear',
      // the road climbs high and winds around the mountain; the valley drop is on the right with no rail in places
      segments: [{ len: 130 }, { len: 120, rise: 12 }, { len: 110, turn: -65, rise: 10, cliff: 'R', rail: true }, { len: 90, rise: 8, cliff: 'R' },
        { len: 110, turn: 70, rise: 10, cliff: 'L' }, { len: 80, cliff: 'L', rail: true }, { len: 120, turn: -55, rise: 8, cliff: 'R' }, { len: 100, rise: -6, cliff: 'R', rail: true },
        { len: 120, turn: 40, rise: -12 }, { len: 180 }],
      obstacles: [{ type: 'bump', s: 100 }, { type: 'pothole', s: 470, lane: 'R' }],
      cargo: ['box', 'crate', 'box'], par: 105, timeLimit: null, fuel: 0.45
    },
    {
      id: 6, name: 'Snow Pass', theme: 'snow', weather: 'fog',
      segments: [{ len: 130 }, { len: 140, rise: 16 }, { len: 120, turn: -70, rise: 6, type: 'ice', cliff: 'L', rail: true }, { len: 110, type: 'bridge' }, { len: 120, turn: 60, cliff: 'R' }, { len: 150, rise: -22, type: 'ice' }, { len: 170 }],
      obstacles: [{ type: 'bump', s: 100 }, { type: 'pothole', s: 620, lane: 'R' }],
      cargo: ['barrel', 'crate', 'fridge'], par: 100, timeLimit: 170, fuel: 0.45
    }
  ];

  // ------------------------------------------------------------------ chapters + generated levels (2..30)
  var CHAPTERS = [
    { name: 'Green Valley', theme: 'country', from: 1, to: 6 },
    { name: 'Mountain Pass', theme: 'country', from: 7, to: 12, mountain: true },
    { name: 'City Streets', theme: 'city', from: 13, to: 18 },
    { name: 'Desert Run', theme: 'desert', from: 19, to: 24, mountain: true },
    { name: 'Snow Peaks', theme: 'snow', from: 25, to: 30, mountain: true }
  ];
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  var CARGO = { country: ['box', 'crate', 'sacks', 'fruit'], city: ['box', 'fridge', 'glass', 'crate'], desert: ['barrel', 'gas', 'crate', 'steel'], snow: ['crate', 'barrel', 'fridge', 'box'] };

  function generate(id) {
    var ch = CHAPTERS.filter(function (c) { return id >= c.from && id <= c.to; })[0] || CHAPTERS[0];
    var k = id - ch.from, d = Math.min(1, (id - 2) / 28), R = rng(id * 7919 + 17);
    var segs = [{ len: 110 }], total = 110, target = 600 + d * 1000, curves = 0, sideCliff = R() < 0.5 ? 'R' : 'L';
    while (total < target) {
      var r = R(), seg;
      if (r < 0.3) seg = { len: 70 + Math.round(R() * 90) };
      else if (r < 0.62) { seg = { len: 90 + Math.round(R() * 60), turn: Math.round((R() < 0.5 ? -1 : 1) * (18 + R() * (25 + d * 45))) }; curves++; }
      else seg = { len: 100 + Math.round(R() * 50), rise: Math.round((R() < 0.55 ? 1 : -1) * (5 + R() * (6 + d * 12))) };
      if (ch.mountain && (seg.turn || seg.rise > 0) && R() < 0.7) {
        seg.cliff = sideCliff; seg.rail = R() < (0.65 - d * 0.35); if (R() < 0.4) sideCliff = sideCliff === 'R' ? 'L' : 'R';
        if (!seg.rise) seg.rise = Math.round(4 + R() * 8);
      }
      var sr = R();
      if (sr < 0.16 && k > 0) seg.type = ch.theme === 'snow' ? 'ice' : ch.theme === 'city' ? 'narrow' : ch.theme === 'desert' ? 'rough' : 'mud';
      else if (sr < 0.24 && !seg.cliff && !seg.turn && ch.theme !== 'city') seg.type = 'bridge';
      else if (sr < 0.3 && ch.theme === 'city') seg.type = 'rough';
      if (seg.type === 'bridge') { delete seg.rise; }
      segs.push(seg); total += seg.len;
    }
    segs.push({ len: 170 });
    total += 170;
    var obstacles = [], nb = 1 + Math.round(d * 3) + (ch.theme === 'city' ? 2 : 0), np = Math.round(d * 3);
    for (var i = 0; i < nb; i++) obstacles.push({ type: 'bump', s: Math.round(150 + (total - 360) * (i + 0.5) / nb) });
    for (var j = 0; j < np; j++) obstacles.push({ type: 'pothole', s: Math.round(200 + R() * (total - 420)), lane: R() < 0.7 ? 'R' : 'L' });
    var pool = CARGO[ch.theme] || CARGO.country, cargo = [];
    for (var c = 0; c < 3; c++) cargo.push(pool[Math.floor(R() * (1 + Math.min(pool.length - 1, k)))]);
    var speed = 12 + d * 3;
    var par = Math.round(total / speed + curves * 1.5 + 12);
    var weather = ch.theme === 'snow' ? (R() < 0.5 ? 'fog' : 'clear') : ch.theme === 'desert' ? 'clear' : (R() < 0.18 + d * 0.15 ? 'rain' : 'clear');
    return {
      id: id, name: ch.name + ' ' + (k + 1), chapter: CHAPTERS.indexOf(ch), theme: ch.theme, weather: weather,
      segments: segs, obstacles: obstacles, cargo: cargo,
      traffic: id >= 3 ? { density: Math.min(1, 0.25 + d * 0.75 + (ch.theme === 'city' ? 0.2 : 0)) } : null,
      par: par, timeLimit: id >= 8 ? Math.round(par * 1.7) : null, fuel: 0.3 + d * 0.2
    };
  }
  var tutorial = LEVELS[0];
  LEVELS = [tutorial];
  for (var n = 2; n <= 30; n++) LEVELS.push(generate(n));

  CT.Levels3D = {
    LIST: LEVELS,
    CHAPTERS: CHAPTERS,
    generate: generate,
    COUNT: LEVELS.length,
    get: function (id) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i]; return null; },
    isUnlocked: function (id) { return id === 1 || CT.UNLOCK_ALL || !!(CT.Storage.getLevel3d(id - 1) && CT.Storage.getLevel3d(id - 1).completed); },
    nextToPlay: function () {
      for (var i = 0; i < LEVELS.length; i++) { var r = CT.Storage.getLevel3d(LEVELS[i].id); if (!r || !r.completed) return LEVELS[i].id; }
      return 1;
    }
  };
})(window.CT);
