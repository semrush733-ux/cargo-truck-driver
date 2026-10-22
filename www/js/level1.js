/* level1.js — Tutorial: three light boxes, short flat straight road, no traffic, big delivery zone.
   Levels 2–50 are generated in levels.js (CT.Levels.generateAll at the bottom of this file). */
(function (CT) {
  'use strict';
  var Z = 12000;
  var st = CT.Levels.stations(Z, 380, 'country');
  CT.Levels.register({
    id: 1,
    implemented: true,
    name: 'Tutorial',
    chapter: 0, chapterName: 'Green Valley',
    theme: 'country',
    seed: 11,
    tutorial: true,

    cargo: { type: 'box', count: 3 },
    truck: { maxSpeedCap: 360 * CT.K },   // ~130 km/h in the tutorial
    start: { x: 700 },

    road: {
      start: -760, end: Z + 690,
      terrain: [{ x: -2000, y: 0 }, { x: Z + 3000, y: 0 }],   // perfectly flat
      curves: []
    },

    loadStation: st.loadStation,
    destination: st.destination,

    signs: [
      { x: 1500, text: 'DELIVERY HUB', sub: '→ ' + Math.round((Z - 1500) * CT.Levels.METERS_PER_UNIT) + ' m', color: '#1f8a43', w: 250 },
      { x: 4200, style: 'speed', text: '120' },
      { x: 8400, text: 'HUB AHEAD', sub: 'Slow down →', color: '#2a6fd6', w: 220 },
      { x: Z - 1900, style: 'warning', text: 'STOP', sub: 'ZONE' }
    ],

    traffic: null,
    lights: [],
    obstacles: [],
    delivery: { maxSpeed: 14 * CT.K },
    par: 75,
    timeLimit: null
  });

  CT.Levels.generateAll();
})(window.CT);
