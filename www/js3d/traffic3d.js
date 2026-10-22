/* traffic3d.js — other vehicles on the 3D road: cars, vans and a bus in the right lane going your way (slower than
   you, so you overtake) and oncoming traffic in the left lane. They follow the road, keep their distance, brake
   for the truck, show brake lights, honk, and can be hit (a crash for the player). Cheap: about 10 cars per level. */
(function (CT) {
  'use strict';
  var B = window.BABYLON, V3 = B.Vector3;
  var PAINTS = ['#c62828', '#1565c0', '#f5f5f5', '#212121', '#9e9e9e', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#e65100'];

  function hash(n) { var x = Math.sin(n * 91.7) * 43758.5453; return x - Math.floor(x); }

  /** Builds one vehicle (all parts merged). kind: sedan | suv | van | bus. Faces +z, wheels on y = 0. */
  function buildCar(kit, kind, color, idx) {
    var sc = kit.scene, parts = [], n = kit.node('car', null, 0, 0, 0);
    var paint = kit.pbr(color, { metal: 0.35, rough: 0.3, coat: 0.7 });
    var glass = kit.pbr('#0f1820', { metal: 0.35, rough: 0.05, env: 1.6 });
    var black = kit.pbr('#18191c', { rough: 0.7 }), chrome = kit.pbr('#dfe3e8', { metal: 1, rough: 0.15 });
    var add = function (m, mat) { m.material = mat; parts.push(m); return m; };
    var L, W, H, r = 0.34, wb;
    if (kind === 'bus') {
      L = 11; W = 2.5; H = 3.1; r = 0.5; wb = 3.6;
      add(kit.profile('bus', [[-5.5, 0.5], [5.5, 0.5], [5.55, 2.9], [5.3, 3.15], [-5.4, 3.15], [-5.5, 2.9]], W, null, null, { bevel: 0.1 }), paint);
      add(kit.profile('busWin', [[-5.0, 1.75], [5.35, 1.75], [5.4, 2.85], [-5.0, 2.85]], W + 0.04, null, null, { bevel: 0.02 }), glass);
    } else if (kind === 'van') {
      L = 5.2; W = 2.0; H = 2.3; wb = 1.9;
      add(kit.profile('van', [[-2.6, 0.38], [2.5, 0.38], [2.6, 0.95], [2.1, 1.35], [1.6, 2.25], [-2.6, 2.25]], W, null, null, { bevel: 0.08 }), paint);
      add(kit.profile('vanWin', [[1.15, 1.35], [2.12, 1.35], [1.62, 2.12], [1.15, 2.12]], W + 0.03, null, null, { bevel: 0.02 }), glass);
    } else if (kind === 'suv') {
      L = 4.7; W = 1.95; H = 1.8; r = 0.38; wb = 1.45;
      add(kit.profile('suv', [[-2.35, 0.4], [2.3, 0.4], [2.38, 0.95], [1.4, 1.12], [0.75, 1.78], [-2.2, 1.8], [-2.35, 1.2]], W, null, null, { bevel: 0.1 }), paint);
      add(kit.profile('suvWin', [[-2.0, 1.16], [1.25, 1.16], [0.7, 1.68], [-2.05, 1.7]], W + 0.03, null, null, { bevel: 0.02 }), glass);
    } else {
      L = 4.5; W = 1.85; H = 1.45; wb = 1.35;
      add(kit.profile('sedan', [[-2.25, 0.36], [2.2, 0.36], [2.28, 0.82], [1.2, 0.95], [0.5, 1.45], [-1.2, 1.45], [-1.85, 1.0], [-2.25, 0.95]], W, null, null, { bevel: 0.12 }), paint);
      add(kit.profile('sedanWin', [[-1.75, 1.0], [1.12, 0.99], [0.47, 1.38], [-1.12, 1.38]], W + 0.03, null, null, { bevel: 0.02 }), glass);
    }
    add(B.MeshBuilder.CreateBox('bumperF', { width: W - 0.05, height: 0.22, depth: 0.12 }, sc), black).position.set(0, 0.45, L / 2);
    add(B.MeshBuilder.CreateBox('bumperR', { width: W - 0.05, height: 0.22, depth: 0.12 }, sc), black).position.set(0, 0.45, -L / 2);
    add(B.MeshBuilder.CreateBox('grille', { width: W * 0.45, height: 0.18, depth: 0.04 }, sc), chrome).position.set(0, kind === 'bus' ? 0.9 : 0.7, L / 2 + 0.02);
    [-1, 1].forEach(function (s) {
      add(B.MeshBuilder.CreateBox('head', { width: 0.32, height: 0.14, depth: 0.04 }, sc), kit.pbr('#fffbe8', { emissive: '#8a8060', glow: 0.6 })).position.set(s * (W / 2 - 0.3), kind === 'bus' ? 0.95 : 0.75, L / 2 + 0.02);
      [wb, -wb].forEach(function (z) {
        var t = add(B.MeshBuilder.CreateCylinder('tyre', { diameter: r * 2, height: 0.24, tessellation: 16 }, sc), black);
        t.rotation.z = Math.PI / 2; t.position.set(s * (W / 2 - 0.08), r, z);
        var h = add(B.MeshBuilder.CreateCylinder('hub', { diameter: r * 1.1, height: 0.26, tessellation: 12 }, sc), chrome);
        h.rotation.z = Math.PI / 2; h.position.set(s * (W / 2 - 0.07), r, z);
      });
    });
    var m = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    m.parent = n; m.isPickable = false; kit.shadow(m);
    // brake lights are separate so they can light up
    var tail = B.MeshBuilder.CreateBox('tail', { width: W - 0.3, height: 0.1, depth: 0.04 }, sc);
    tail.parent = n; tail.position.set(0, kind === 'bus' ? 0.95 : 0.8, -L / 2 - 0.02);
    return { node: n, tail: tail, L: L, W: W, kind: kind };
  }

  function Traffic3D(game, cfg) {
    this.g = game; this.road = game.road; this.kit = game.kit;
    this.density = cfg.density || 0.5;
    var k = this.kit;
    this.tailOff = k.pbr('#6a0c0c', { emissive: '#300000' });
    this.tailOn = k.pbr('#ff2a1a', { emissive: '#ff2010', glow: 2.2 });
    this.cars = [];
    var n = Math.round(4 + this.density * 8), kinds = ['sedan', 'sedan', 'suv', 'van', 'sedan', 'suv', 'bus', 'van', 'sedan', 'suv', 'sedan', 'van'];
    var seed = (game.level.id || 1) * 13;
    for (var i = 0; i < n; i++) {
      var kind = kinds[i % kinds.length];
      if (kind === 'bus' && this.density < 0.4) kind = 'van';
      var car = buildCar(k, kind, PAINTS[Math.floor(hash(seed + i) * PAINTS.length)], i);
      car.dir = i % 2 === 0 ? 1 : -1;                    // +1 going your way (right lane), -1 oncoming (left lane)
      car.lat = car.baseLat = car.dir > 0 ? CT.Road3D.LANE_R : CT.Road3D.LANE_L;
      car.cruise = (car.dir > 0 ? 11 + hash(seed + i * 3) * 7 : 14 + hash(seed + i * 5) * 8) * (kind === 'bus' ? 0.8 : 1);
      car.v = car.cruise; car.stop = 0; car.braking = false; car.honk = 0;
      car.node.setEnabled(false);
      this.cars.push(car);
    }
    this.placeAll(true);
  }

  /** Spreads the cars along the road ahead of the truck. */
  Traffic3D.prototype.placeAll = function () {
    var self = this, ts = this.g.drive.s, len = this.road.length;
    this.cars.forEach(function (c, i) {
      c.s = ts + 90 + i * (len / Math.max(1, self.cars.length)) * 0.55 + hash(i * 7) * 30;
      if (c.s > len - 90) c.s = ts + 60 + hash(i) * 200;
      c.active = self.allowed(c, c.s);
      c.node.setEnabled(c.active);
    });
  };
  /** No traffic near the depots, in the delivery bay or (oncoming) inside closed roadworks. */
  Traffic3D.prototype.allowed = function (c, s) {
    var r = this.road;
    if (s < r.startS + 40 || s > r.zone.s1 - 30 || s > r.length - 20) return false;
    var sec = r.sectionAt(s);
    if (sec && sec.type === 'narrow' && c.dir < 0) return false;
    if (sec && sec.type === 'slalom' && c.dir < 0) return false;      // cones across both lanes: oncoming cars wait outside
    var hz = this.g.hazards;
    if (hz && c.dir > 0 && hz.noTrafficAt(s)) return false;           // no queue at the toll gate
    return true;
  };

  Traffic3D.prototype.update = function (dt, truck, drive) {
    var self = this, r = this.road, ts = drive.s, tl = drive.lat;
    this.cars.forEach(function (c) {
      // recycle cars that fell far behind the truck to a spot well ahead
      if (c.s < ts - 70 || c.s > ts + 520 || !c.active) {
        var ns = ts + 260 + hash(c.s + self.g.t) * 220;
        c.s = ns; c.v = c.cruise; c.stop = 0; c.lat = c.baseLat;
        c.active = self.allowed(c, ns);
        c.node.setEnabled(c.active);
        if (!c.active) return;
      }
      // speed: cruise, but keep a gap to whatever is ahead in the same lane (other cars or the truck)
      var target = c.cruise, gapAhead = 1e9;
      self.cars.forEach(function (o) {
        if (o === c || !o.active || o.dir !== c.dir) return;
        var d = (o.s - c.s) * c.dir;
        if (d > 0 && d < gapAhead) gapAhead = d - (o.L + c.L) / 2;
      });
      var tInLane = Math.abs(tl - c.lat) < 2.4, dT = (ts - c.s) * c.dir - (truck.halfLen + c.L / 2);
      if (tInLane && dT > -2 && dT < gapAhead) gapAhead = dT;
      if (gapAhead < 60) target = Math.min(target, Math.max(0, (gapAhead - 6) * 0.6));
      // traffic lights, level crossings and animals: stop like a real driver
      var hz = self.g.hazards;
      if (hz) {
        var sAt = hz.carStop(c);
        if (sAt != null) { var gs = (sAt - c.s) * c.dir - c.L / 2; target = Math.min(target, Math.max(0, gs * 0.7)); if (gs < 0.5) target = 0; }
        // give way: when the truck waits behind a blocker in its own lane, oncoming cars stop and let it pass
        if (c.dir < 0) hz.items.forEach(function (o) {
          if (o.type !== 'block' || o.lat * c.baseLat > 0) return;
          var waiting = ts > o.s - 45 && (ts < o.s + 25 || tl < 0);
          var yieldAt = o.s + o.halfS + truck.halfLen + 26;
          if (waiting && c.s > yieldAt - 1 && c.s < yieldAt + 90) { var gy = c.s - yieldAt - c.L / 2; target = Math.min(target, Math.max(0, gy * 0.6)); if (gy < 0.5) target = 0; }
        });
        // a blocked lane: slow down and go round it in the other lane
        var blk = hz.blockedFor(c.s, c.baseLat, c.dir);
        var wantLat = c.baseLat;
        if (blk) {
          // go round only when the truck is not coming in the other lane; otherwise wait behind the blocker
          var tAhead = (ts - c.s) * c.dir, truckThere = Math.abs(tl + c.baseLat) < 2.8 && tAhead > -truck.halfLen - c.L && tAhead < 170;
          var bAhead = (blk.s - c.s) * c.dir, alongside = bAhead < blk.halfS + c.L / 2 + 1;
          if (truckThere && !alongside) {
            // not committed yet: stay (or go back) in our lane and wait behind the blocker
            var gb = bAhead - blk.halfS - c.L / 2 - 4;
            target = Math.min(target, Math.max(0, gb * 0.6)); if (gb < 0.5) target = 0;
          } else { wantLat = -c.baseLat; target = Math.min(target, alongside ? 9 : 7); }   // committed: finish passing quickly
        }
        if (c.lat !== wantLat && !c.inSlalom) { var dl = wantLat - c.lat, stepL = 2.2 * dt; c.lat = Math.abs(dl) < stepL ? wantLat : c.lat + Math.sign(dl) * stepL; }
      }
      // roadworks slalom: same-way cars weave slowly through the cones, oncoming cars wait at the far end
      c.inSlalom = false;
      r.sections.forEach(function (sc) {
        if (sc.type !== 'slalom') return;
        if (c.dir < 0 && c.s > sc.s2 - 2 && c.s < sc.s2 + 70) { var gw = c.s - (sc.s2 + 6) - c.L / 2; target = Math.min(target, Math.max(0, gw * 0.6)); if (gw < 0.5) target = 0; }
        if (c.dir > 0 && c.s > sc.s1 - 10 && c.s < sc.s2 + 4) {
          target = Math.min(target, 6); c.inSlalom = true;
          var nx = null; r.obstacles.forEach(function (o) { if (o.slalom && o.s > c.s - c.L / 2 - 1 && o.s < c.s + 26 && (!nx || o.s < nx.s)) nx = o; });
          var wl = nx ? (nx.lat > 0 ? -2.0 : 2.0) : c.baseLat, st = 3 * dt, dl2 = wl - c.lat;
          c.lat = Math.abs(dl2) < st ? wl : c.lat + Math.sign(dl2) * st;
        }
      });
      if (!self.allowed(c, c.s) && Math.abs(c.s - ts) > 45) { c.active = false; c.node.setEnabled(false); return; }
      if (c.stop > 0) { c.stop -= dt; target = 0; }
      c.braking = target < c.v - 0.5;
      c.v += Math.max(-9 * dt, Math.min(3 * dt, target - c.v));
      if (c.v < 0) c.v = 0;
      // honk at the truck when it blocks us
      if (tInLane && dT > 0 && dT < 25 && c.v < c.cruise * 0.6 && self.g.t - c.honk > 4) { c.honk = self.g.t; if (c.dir < 0) CT.Audio.play('horn'); }
      c.s += c.v * c.dir * dt;
      var f = r.at(c.s);
      c.node.position.set(f.x + f.rx * c.lat, f.y, f.z + f.rz * c.lat);
      c.node.rotation.y = f.h + (c.dir < 0 ? Math.PI : 0);
      c.node.rotation.x = -f.slope * c.dir;
      var want = c.braking || c.stop > 0 ? self.tailOn : self.tailOff;
      if (c.tail.material !== want) c.tail.material = want;
    });
  };

  /** Collision with the truck (road coordinates): returns hits with relative speed. */
  Traffic3D.prototype.collide = function (truck, drive) {
    var hits = [], ts = drive.s, tl = drive.lat, self = this;
    var tv = drive.v * Math.cos(drive.yaw - this.road.at(ts).h);
    this.cars.forEach(function (c) {
      if (!c.active) return;
      var ds = c.s - ts, dl = c.lat - tl;
      var ls = (truck.halfLen + c.L / 2) * 0.95, ll = (truck.width + c.W) / 2 * 0.9;
      if (Math.abs(ds) < ls && Math.abs(dl) < ll) {
        var rel = Math.abs(tv - c.v * c.dir);
        hits.push({ car: c, rel: rel, front: ds > 0 });
        // separate them: push the car out along the road and stop it for a moment
        c.s = ts + Math.sign(ds || 1) * (ls + 0.2);
        c.stop = 2.5; c.v = 0;
      }
    });
    return hits;
  };
  /** Distance to the nearest car ahead in the truck's lane (for hints and the autopilot). */
  Traffic3D.prototype.ahead = function (drive) {
    var best = null;
    this.cars.forEach(function (c) {
      if (!c.active || Math.abs(c.lat - drive.lat) > 2.4) return;
      var d = c.s - drive.s;
      if (d > 0 && (!best || d < best.d)) best = { d: d, car: c };
    });
    return best;
  };
  Traffic3D.prototype.dispose = function () { this.cars.forEach(function (c) { c.node.dispose(false, false); }); };

  CT.Traffic3D = Traffic3D;
})(window.CT);
