/* levels3d.js — the 50 levels of the 3D game, as data (kept apart from the gameplay code).
   Each level has its own name, map style, time of day, weather, road shape, hand-picked hazards and a mission
   rule, and the difficulty rises level by level: longer roads, more traffic, tighter time, fewer guard rails.

   Level fields used by the game:
     theme     'country' | 'forest' | 'coast' | 'city' | 'desert' | 'canyon' | 'snow'
     time      'day' | 'sunset' | 'night'          weather 'clear' | 'rain' | 'fog'
     autumn    orange / red trees                  coast   'L' | 'R' side with water
     segments  [{ len, turn?, rise?, cliff?: 'L'|'R', rail? }]   (road geometry)
     sections  [{ type: 'mud'|'ice'|'rough'|'bridge'|'narrow'|'tunnel'|'slalom', s1, s2 }]
     obstacles [{ type: 'bump'|'pothole'|'light'|'rail'|'toll'|'block'|'herd'|'fuel', s, lane?, kind? }]
     rule      { minCond?, maxCrash?, noRed?, lowFuel?, noFall? }   timeLimit (s) or null
     traffic   { density 0..1 } or null                                                                     */
(function (CT) {
  'use strict';

  var TUTORIAL = {
    id: 1, name: 'First Delivery', tutorial: true, theme: 'country', time: 'day', weather: 'clear', chapter: 0,
    segments: [{ len: 330 }], sections: [], obstacles: [],
    cargo: ['box', 'box', 'box'], par: 70, timeLimit: null, fuel: 0.15, tips: true, traffic: null, rule: {},
    blurb: 'Learn to load, drive and deliver.'
  };

  var CHAPTERS = [
    { name: 'Green Valley', theme: 'country', from: 1, to: 10 },
    { name: 'Forests & Lakes', theme: 'forest', from: 11, to: 20 },
    { name: 'Big City', theme: 'city', from: 21, to: 30 },
    { name: 'Mountains & Canyons', theme: 'canyon', from: 31, to: 40 },
    { name: 'Snow Peaks', theme: 'snow', from: 41, to: 50 }
  ];

  /*  name, theme, time, weather, plan, features, rule, cargo, extra
      plan: flat | hills | curvy | highway | mountain | steep | canyon | coast | descent
      features: 'key:count' — bump, pothole, light, rail, toll, block, herd, fuel, bridge, mud, ice, rough, narrow, tunnel, slalom */
  var T = [
    null,
    ['Farm Lane',        'country', 'day',    'clear', 'flat',     'bump:1',                           {},                         'box crate box',      'An easy country lane past the farms.'],
    ['Sunny Hills',      'country', 'day',    'clear', 'hills',    'bump:2 pothole:1',                 {},                         'crate box sacks',    'Gentle hills and your first traffic.'],
    ['River Bridge',     'country', 'day',    'rain',  'curvy',    'bridge:1 mud:1',                   {},                         'sacks crate box',    'Rain, a muddy stretch and a river bridge.'],
    ['Cow Crossing',     'country', 'day',    'clear', 'flat',     'herd:1 bump:1',                    {},                         'fruit box fruit',    'Cows wander across the road. Stop and let them pass!'],
    ['Village Lights',   'country', 'sunset', 'clear', 'flat',     'light:2 bump:2',                   { noRed: true },            'box fruit box',      'Traffic lights in the village. Never run a red light.'],
    ['Glass Delivery',   'country', 'day',    'clear', 'hills',    'pothole:3 bump:2',                 { minCond: 75 },            'glass box glass',    'Fragile glass on a bumpy road. Keep it above 75%.'],
    ['Fallen Tree',      'country', 'day',    'clear', 'curvy',    'block:1 mud:1', { autumn: true },  'crate sacks crate',  'A storm knocked a tree onto the road. Go around it.'],
    ['Railway Crossing', 'country', 'day',    'clear', 'flat',     'rail:1 light:1',                   {},                         'box barrel box',     'Wait at the railway crossing while the train passes.'],
    ['Valley Finale',    'country', 'day',    'clear', 'hills',    'bridge:1 herd:1 rail:1 pothole:2', { time: 1 },            'crate fruit glass',  'Everything you learned, against the clock.'],

    ['Pine Forest',      'forest',  'day',    'clear', 'curvy',    'block:1 bump:2',                   {},                         'crate box crate',    'A narrow road through tall pines. A rock blocks one lane.'],
    ['Lakeside Drive',   'coast',   'day',    'clear', 'coast',    'bridge:1 pothole:2', { coast: 'L' }, 'fruit box fruit',  'Drive along the lake shore and over the water.'],
    ['Autumn Road',      'forest',  'day',    'rain',  'hills',    'mud:1 block:1', { autumn: true },  'sacks crate sacks',  'Wet leaves, mud and a fallen log.'],
    ['Misty Woods',      'forest',  'day',    'fog',   'curvy',    'herd:1 pothole:3',                 {},                         'box crate box',      'Thick fog. Animals may be on the road!'],
    ['Fuel Run',         'country', 'day',    'clear', 'highway',  'fuel:1 bump:2',                    { lowFuel: true },          'barrel barrel box',  'Your tank is almost empty. Stop at the fuel station!'],
    ['Logging Road',     'forest',  'day',    'clear', 'hills',    'mud:2 block:2 rough:1',            {},                         'steel crate steel',  'Heavy logs on a rough forest track.'],
    ['Sunset Shore',     'coast',   'sunset', 'clear', 'coast',    'bridge:1 light:2', { coast: 'R', noRed: true }, 'fruit glass fruit', 'Golden sunset by the sea. Mind the lights.'],
    ['Storm Crossing',   'country', 'day',    'rain',  'curvy',    'bridge:1 rail:1 mud:1',            {},                         'box sacks box',      'A storm, a muddy road, a bridge and a train.'],
    ['Night Forest',     'forest',  'night',  'clear', 'curvy',    'herd:1 pothole:3',                 {},                         'crate box crate',    'Drive through the dark forest with your headlights.'],
    ['Lake Loop Finale', 'coast',   'day',    'clear', 'coast',    'bridge:2 toll:1 rail:1', { coast: 'L', maxCrash: 1, time: 1 }, 'glass fruit box', 'Two bridges, a toll gate and a train. Max one crash.'],

    ['Downtown',         'city',    'day',    'clear', 'flat',     'light:3',                          { noRed: true },            'box box fridge',     'Your first city delivery. Stop at every red light.'],
    ['Rush Hour',        'city',    'day',    'clear', 'highway',  'light:2', { heavy: true, time: 1 }, 'box fridge box',  'Heavy traffic and a tight deadline.'],
    ['Roadworks',        'city',    'day',    'clear', 'flat',     'slalom:1 narrow:1',                {},                         'crate box crate',    'Weave through the roadworks cones.'],
    ['City Lights',      'city',    'night',  'clear', 'flat',     'light:3 pothole:2',                { noRed: true },            'fridge box fridge',  'The city at night. Lights, potholes, no red lights.'],
    ['Toll Highway',     'city',    'sunset', 'clear', 'highway',  'toll:2', { time: 1 },              'box crate box',      'Stop at two toll gates on the motorway.'],
    ['Glass Tower',      'city',    'day',    'clear', 'flat',     'light:3 bump:4', { minCond: 80 },  'glass glass box',    'Glass panels for a new tower. Keep them above 80%.'],
    ['Rainy Streets',    'city',    'day',    'rain',  'curvy',    'light:2 slalom:1 pothole:3',       {},                         'fridge crate box',   'Wet streets, roadworks and puddles.'],
    ['Freight Yard',     'city',    'day',    'clear', 'flat',     'rail:2 block:1',                   {},                         'steel barrel steel', 'Two railway crossings and a broken-down van.'],
    ['Midnight Express', 'city',    'night',  'clear', 'highway',  'light:3 rail:1', { time: 1, noRed: true }, 'box fridge glass', 'A night express delivery. No red lights, no time to waste.'],
    ['City Finale',      'city',    'sunset', 'clear', 'curvy',    'light:3 toll:1 slalom:1 rail:1', { maxCrash: 0 }, 'glass fridge glass', 'The whole city, and not a single crash.'],

    ['Mountain Pass',    'country', 'day',    'clear', 'mountain', 'bump:1',                           { rails: 0.9 },             'crate box crate',    'Climb a mountain road above the valley.'],
    ['Red Canyon',       'canyon',  'day',    'clear', 'canyon',   'block:1 rough:1',                  {},                         'barrel crate barrel','Red rock walls on both sides and a boulder in the way.'],
    ['Hairpin Heights',  'country', 'day',    'clear', 'steep',    'pothole:2',                        { rails: 0.6 },             'box crate box',      'Steep zig-zags with long drops. Slow down for every bend.'],
    ['Rockfall Road',    'canyon',  'day',    'clear', 'mountain', 'block:3',                          { rails: 0.6 },             'crate steel crate',  'Fallen rocks block the lanes. Watch for oncoming cars.'],
    ['Mountain Tunnel',  'country', 'day',    'clear', 'mountain', 'tunnel:1 bump:2',                  { rails: 0.6 },             'box barrel box',     'Drive through a long tunnel under the mountain.'],
    ['Desert Highway',   'desert',  'sunset', 'clear', 'highway',  'fuel:1 toll:1', { lowFuel: true }, 'barrel gas barrel',  'A long desert road and very little fuel.'],
    ['Cliff Edge',       'country', 'day',    'fog',   'mountain', 'pothole:2', { rails: 0.2, noFall: true }, 'glass crate box', 'Fog and drops with almost no rails. Do not fall!'],
    ['Canyon Night',     'canyon',  'night',  'clear', 'canyon',   'tunnel:1 block:2',                 {},                         'gas barrel gas',     'Canyon walls in the dark, with rocks on the road.'],
    ['Gold Mine Road',   'desert',  'day',    'clear', 'steep',    'rough:2 rail:1', { time: 1, rails: 0.5 }, 'steel steel steel', 'Heavy steel up a steep mine road, on time.'],
    ['Summit Finale',    'country', 'sunset', 'clear', 'steep',    'tunnel:1 block:2 rail:1 herd:1', { time: 1, rails: 0.4 }, 'glass crate fridge', 'To the summit: tunnel, rocks, a train and goats.'],

    ['First Snow',       'snow',    'day',    'clear', 'hills',    'ice:1 bump:1',                     {},                         'crate box crate',    'The first snow. Ice makes the truck slide.'],
    ['Frozen Lake',      'snow',    'day',    'clear', 'coast',    'bridge:1 ice:1', { coast: 'L' },   'box fridge box',     'Along a frozen lake and over an icy bridge.'],
    ['Snow Tunnel',      'snow',    'day',    'fog',   'mountain', 'tunnel:1 ice:1', { rails: 0.7 },   'crate barrel crate', 'Fog, ice and a tunnel through the peak.'],
    ['Avalanche Road',   'snow',    'day',    'clear', 'mountain', 'block:3', { rails: 0.3 },          'box crate box',      'An avalanche left snow boulders on the road.'],
    ['Blizzard',         'snow',    'day',    'fog',   'curvy',    'ice:2 pothole:2', { time: 1 },     'barrel crate fridge','White-out! Ice everywhere and a deadline.'],
    ['Ski Village',      'snow',    'sunset', 'clear', 'flat',     'light:3 herd:1 toll:1', { noRed: true }, 'fridge box glass', 'A busy ski village with lights, reindeer and a gate.'],
    ['Glacier Night',    'snow',    'night',  'clear', 'mountain', 'ice:1 tunnel:1', { rails: 0.3 },   'crate glass crate',  'A glacier road at night. Headlights on!'],
    ['Ice Bridge',       'snow',    'day',    'clear', 'curvy',    'bridge:2 ice:1 rail:1',            { maxCrash: 1 },            'glass box glass',    'Two icy bridges and a train. Max one crash.'],
    ['Fuel Freeze',      'snow',    'day',    'fog',   'highway',  'fuel:1 ice:2', { lowFuel: true },  'barrel barrel gas',  'Low fuel in a frozen fog. Find the station.'],
    ['Grand Finale',     'snow',    'night',  'clear', 'steep',    'tunnel:1 rail:1 toll:1 block:2 ice:1', { time: 1, maxCrash: 1, rails: 0.2 }, 'glass fridge glass', 'The ultimate delivery. Show what you can do!']
  ];

  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /** Road geometry for a plan. The heading stays within about ±55° so the road never folds back on itself. */
  function makeSegments(plan, total, d, R, rails, coast) {
    var segs = [{ len: 120 }], len = 120, heading = 0, cliffSide = R() < 0.5 ? 'R' : 'L';
    var turnTo = function (maxDeg) {
      var t = (8 + R() * maxDeg) * (R() < 0.5 ? -1 : 1);
      if (Math.abs(heading + t) > 55) t = -t;
      t = Math.max(-55 - heading, Math.min(55 - heading, t));
      heading += t; return Math.round(t);
    };
    while (len < total - 160) {
      var r = R(), seg;
      switch (plan) {
        case 'flat': seg = r < 0.6 ? { len: 80 + R() * 80 } : { len: 100 + R() * 60, turn: turnTo(18) }; break;
        case 'highway': seg = r < 0.7 ? { len: 140 + R() * 120 } : { len: 160 + R() * 80, turn: turnTo(15) }; break;
        case 'hills': seg = r < 0.5 ? { len: 100 + R() * 60, rise: (R() < 0.5 ? 1 : -1) * (6 + R() * (8 + d * 10)) } : { len: 90 + R() * 60, turn: turnTo(25) }; break;
        case 'curvy': case 'coast': seg = r < 0.25 ? { len: 60 + R() * 60 } : { len: 80 + R() * 50, turn: turnTo(plan === 'coast' ? 30 : 30 + d * 30) }; break;
        case 'canyon': seg = r < 0.3 ? { len: 70 + R() * 60 } : { len: 80 + R() * 50, turn: turnTo(35 + d * 20), rise: (R() - 0.5) * 6 }; break;
        case 'descent': seg = { len: 90 + R() * 50, turn: turnTo(40), rise: -(6 + R() * 10) }; break;
        case 'mountain': case 'steep':
          var steep = plan === 'steep';
          seg = { len: (steep ? 70 : 90) + R() * 50, turn: turnTo(steep ? 55 + d * 20 : 35 + d * 20), rise: (R() < 0.75 ? 1 : -0.6) * ((steep ? 10 : 6) + R() * (6 + d * 10)) };
          if (R() < 0.8) { seg.cliff = cliffSide; seg.rail = R() < rails; if (R() < 0.35) cliffSide = cliffSide === 'R' ? 'L' : 'R'; }
          break;
        default: seg = { len: 100 };
      }
      seg.len = Math.round(seg.len); if (seg.rise) seg.rise = Math.round(seg.rise);
      if (coast) delete seg.rise;
      segs.push(seg); len += seg.len;
    }
    segs.push({ len: 180 });
    return segs;
  }

  function build(id) {
    if (id === 1) return TUTORIAL;
    var row = T[id - 1]; if (!row) return null;
    var ch = CHAPTERS.filter(function (c) { return id >= c.from && id <= c.to; })[0];
    var d = (id - 2) / 48;                                   // 0 at level 2 .. 1 at level 50
    var R = rng(id * 7919 + 101);
    var rule = row[6] || {}, plan = row[4], theme = row[1];
    var total = Math.round(650 + d * 1350 + (plan === 'highway' ? 300 : 0));
    var segs = makeSegments(plan, total, d, R, rule.rails != null ? rule.rails : 0.8 - d * 0.5, rule.coast);
    var roadLen = segs.reduce(function (a, s) { return a + s.len; }, 0);
    // features: spread evenly between the depot and the delivery bay, never on top of each other
    var feats = [];
    row[5].split(' ').filter(Boolean).forEach(function (f) { var p = f.split(':'); for (var i = 0; i < +(p[1] || 1); i++) feats.push(p[0]); });
    var a = 150, b = roadLen - 200, n = feats.length, sections = [], obstacles = [];
    // shuffle the order a little but keep it deterministic
    for (var i = feats.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var tmp = feats[i]; feats[i] = feats[j]; feats[j] = tmp; }
    feats.forEach(function (f, i) {
      var s = Math.round(a + (b - a) * (i + 0.5) / n + (R() - 0.5) * 20);
      switch (f) {
        case 'bridge': sections.push({ type: 'bridge', s1: s - 50, s2: s + 50 }); break;
        case 'tunnel': sections.push({ type: 'tunnel', s1: s - 70, s2: s + 70 }); break;
        case 'mud': case 'ice': case 'rough': sections.push({ type: f, s1: s - 45, s2: s + 45 }); break;
        case 'narrow': sections.push({ type: 'narrow', s1: s - 55, s2: s + 55 }); break;
        case 'slalom': sections.push({ type: 'slalom', s1: s - 70, s2: s + 70 }); break;
        case 'pothole': obstacles.push({ type: 'pothole', s: s, lane: R() < 0.7 ? 'R' : 'L' }); break;
        case 'block': obstacles.push({ type: 'block', s: s, lane: R() < 0.75 ? 'R' : 'L', kind: theme === 'snow' ? 'snowball' : theme === 'city' ? 'van' : (theme === 'forest' || theme === 'country') && R() < 0.6 ? 'tree' : 'boulder' }); break;
        case 'herd': obstacles.push({ type: 'herd', s: s, kind: theme === 'snow' ? 'reindeer' : theme === 'canyon' || theme === 'desert' || plan === 'steep' ? 'goat' : 'cow' }); break;
        default: obstacles.push({ type: f, s: s });                    // bump, light, rail, toll, fuel
      }
    });
    var cargo = row[7].split(' ');
    var speed = 13 + d * 3, curves = segs.filter(function (s) { return s.turn; }).length;
    var WAIT = { light: 7, rail: 14, toll: 6, herd: 9, fuel: 10, block: 10 }, stops = 0;
    obstacles.forEach(function (o) { stops += WAIT[o.type] || 0; });
    (sections || []).forEach(function (sc) { if (sc.type === 'slalom') stops += 10; });
    var par = Math.round(roadLen / speed + curves * 1.2 + stops + 12);
    var tl = rule.time ? Math.round(par * (1.45 - 0.15 * d)) : id >= 8 ? Math.round(par * (2.0 - 0.5 * d)) : null;
    return {
      id: id, name: row[0], blurb: row[8], chapter: CHAPTERS.indexOf(ch), theme: theme,
      time: row[2], weather: row[3], autumn: !!rule.autumn, coast: rule.coast || null,
      segments: segs, sections: sections, obstacles: obstacles, cargo: cargo,
      traffic: id >= 3 ? { density: Math.min(1, 0.2 + d * 0.7 + (rule.heavy ? 0.35 : 0) + (theme === 'city' ? 0.15 : 0)) } : null,
      par: par, timeLimit: tl, fuel: 0.3 + d * 0.2, rule: rule
    };
  }

  var LEVELS = [];
  for (var id = 1; id <= 50; id++) LEVELS.push(build(id));

  CT.Levels3D = {
    LIST: LEVELS,
    CHAPTERS: CHAPTERS,
    COUNT: LEVELS.length,
    get: function (id) { return LEVELS[id - 1] || null; },
    isUnlocked: function (id) { return id === 1 || CT.UNLOCK_ALL || !!(CT.Storage.getLevel3d(id - 1) && CT.Storage.getLevel3d(id - 1).completed); },
    nextToPlay: function () {
      for (var i = 0; i < LEVELS.length; i++) { var r = CT.Storage.getLevel3d(LEVELS[i].id); if (!r || !r.completed) return LEVELS[i].id; }
      return 1;
    }
  };
})(window.CT);
