/* level1.js — Tutorial: three light boxes, short flat straight road, no traffic, big delivery zone.
   Levels 2–50 are generated in levels.js (CT.Levels.generateAll at the bottom of this file). */
(function (CT) {
  'use strict';
  var st = CT.Levels.stations(5610, 380, 'country');
  CT.Levels.register({
    id: 1,
    implemented: true,
    name: 'Tutorial',
    chapter: 0, chapterName: 'Green Valley',
    theme: 'country',
    seed: 11,
    tutorial: true,

    cargo: { type: 'box', label: 'Boxes', count: 3, weightEach: 1, fragile: false },
    truck: { maxSpeedCap: 420 },
    start: { x: 700 },

    road: {
      start: -760, end: 6300,
      terrain: [{ x: -2000, y: 0 }, { x: 8000, y: 0 }],   // perfectly flat
      curves: []
    },

    loadStation: st.loadStation,
    destination: st.destination,

    signs: [
      { x: 1500, text: 'DELIVERY HUB', sub: '→ 410 m', color: '#1f8a43', w: 250 },
      { x: 2700, style: 'speed', text: '120' },
      { x: 3900, text: 'HUB AHEAD', sub: 'Slow down →', color: '#2a6fd6', w: 220 },
      { x: 4520, style: 'warning', text: 'STOP', sub: 'ZONE' }
    ],

    traffic: null,
    lights: [],
    obstacles: [],
    delivery: { maxSpeed: 14 },
    par: 75,
    timeLimit: null
  });

  CT.Levels.generateAll();
})(window.CT);
