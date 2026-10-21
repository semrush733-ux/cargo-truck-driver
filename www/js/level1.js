/* level1.js — Tutorial: three light boxes, short flat straight road, big delivery zone. */
(function (CT) {
  'use strict';
  CT.Levels.register({
    id: 1,
    implemented: true,
    name: 'Tutorial',
    subtitle: 'First Delivery',
    seed: 11,
    tutorial: true,

    cargo: { type: 'box', count: 3, weightEach: 1, secured: true },
    truck: { type: 'flatbed', maxSpeed: 360, accel: 300, brake: 760, reverseMax: 150, reverseAccel: 210 },
    start: { x: 700 },

    road: {
      start: -760, end: 6300, difficulty: 'easy',
      terrain: [{ x: -2000, y: 0 }, { x: 8000, y: 0 }]   // perfectly flat
    },

    loadStation: {
      name: 'Cargo Depot',
      dock: { x: 140, w: 470, top: -104 },
      building: { x1: -700, x2: 430, height: 300, wall: '#efe0bf', wallLine: 'rgba(160,120,60,.22)', roof: '#d0473b', sign: 'CARGO DEPOT', signColor: '#f7901e', signX: -420, signW: 330 },
      door: { x: 140, w: 330, h: 230 },
      crane: { towerX: -190, boomLeft: -290, boomRight: 900, boomY: -476, restX: 330 },
      bay: { x1: 400, x2: 1010 }
    },

    destination: {
      name: 'Delivery Hub',
      zone: { x1: 5230, x2: 5990 },
      dock: { x: 5070, w: 470, top: -104 },
      building: { x1: 4640, x2: 6260, height: 310, wall: '#e3ecf6', wallLine: 'rgba(60,100,160,.18)', roof: '#2a6fd6', sign: 'DELIVERY HUB', signColor: '#1f8a43', signX: 6000, signW: 340, flags: [4720, 4900, 6080, 6200] },
      door: { x: 5070, w: 330, h: 230 },
      crane: { towerX: 4780, boomLeft: 4690, boomRight: 5720, boomY: -476, restX: 5300 }
    },

    signs: [
      { x: 1500, text: 'DELIVERY HUB', sub: '→ 100 m', color: '#1f8a43', w: 250 },
      { x: 2700, style: 'speed', text: '30' },
      { x: 3900, text: 'HUB AHEAD', sub: 'Slow down →', color: '#2a6fd6', w: 220 },
      { x: 4520, style: 'warning', text: 'STOP', sub: 'ZONE' }
    ],

    obstacles: [],
    delivery: { maxSpeed: 14, requireAll: true },
    timeLimit: null,
    stars: { mode: 'fixed', value: 3 }
  });
})(window.CT);
