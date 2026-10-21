/* levels.js — level registry + config normaliser. Add a new level by creating js/levelN.js that calls CT.Levels.register({...}).
 *
 * Level config fields:
 *   id, name, subtitle, implemented
 *   cargo:       { type, count, weightEach, secured }
 *   truck:       { type, maxSpeed, accel, brake, reverseMax, reverseAccel }       (overrides Truck defaults)
 *   start:       { x }                                                             truck start position
 *   road:        { start, end, length, difficulty, terrain: [{x,y}, ...] }         y<0 is uphill
 *   loadStation: { dock, dockSlots, building, door, crane, bay }
 *   destination: { name, zone:{x1,x2}, dock, dockSlots, building, door, crane }
 *   obstacles:   [ ... ]   (reserved for later levels; Level 1 has none)
 *   delivery:    { maxSpeed, requireAll }
 *   timeLimit:   seconds or null
 *   stars:       { mode: 'fixed', value: 3 } | { mode: 'time', three, two }
 *   tutorial:    true shows the step-by-step hints
 */
(function (CT) {
  'use strict';
  var list = [];

  function makeSlots(dock, n) {
    var spacing = 125, out = [];
    var first = dock.x - spacing * (n - 1) / 2;
    for (var i = 0; i < n; i++) out.push({ x: first + i * spacing, y: dock.top - 10 });   // boxes sit on 10-unit pallets
    return out;
  }

  function normalise(cfg) {
    if (!cfg.implemented) return cfg;
    cfg.road.length = cfg.road.end - cfg.road.start;
    cfg.obstacles = cfg.obstacles || [];
    cfg.delivery = Object.assign({ maxSpeed: 14, requireAll: true }, cfg.delivery || {});
    cfg.stars = cfg.stars || { mode: 'fixed', value: 3 };
    [cfg.loadStation, cfg.destination].forEach(function (st) {
      st.dockSlots = st.dockSlots || makeSlots(st.dock, cfg.cargo.count);
    });
    return cfg;
  }

  CT.Levels = {
    METERS_PER_UNIT: 1 / 40,
    register: function (cfg) { list.push(normalise(cfg)); list.sort(function (a, b) { return a.id - b.id; }); },
    all: function () { return list.slice(); },
    get: function (id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; },
    isUnlocked: function (id) {
      var lv = this.get(id);
      if (!lv || !lv.implemented) return false;
      if (id === 1) return true;
      return CT.Storage.isCompleted(id - 1);
    },
    starsFor: function (lv, time) {
      var s = lv.stars;
      if (s.mode === 'fixed') return s.value;
      if (time <= s.three) return 3;
      if (time <= s.two) return 2;
      return 1;
    }
  };

  // Placeholders for future content. They stay locked and are shown as "Coming soon" — nothing is playable here yet.
  [2, 3, 4].forEach(function (id) { CT.Levels.register({ id: id, implemented: false, name: 'Coming soon' }); });
})(window.CT);
