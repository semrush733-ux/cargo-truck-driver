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

  CT.Levels3D = {
    LIST: LEVELS,
    COUNT: LEVELS.length,
    get: function (id) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i]; return null; },
    isUnlocked: function (id) { return id === 1 || CT.UNLOCK_ALL || !!(CT.Storage.getLevel3d(id - 1) && CT.Storage.getLevel3d(id - 1).completed); },
    nextToPlay: function () {
      for (var i = 0; i < LEVELS.length; i++) { var r = CT.Storage.getLevel3d(LEVELS[i].id); if (!r || !r.completed) return LEVELS[i].id; }
      return 1;
    }
  };
})(window.CT);
