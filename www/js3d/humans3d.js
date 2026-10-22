/* humans3d.js — simple, human-proportioned people built from capsules and spheres (no imported models):
   the truck driver (seated, hands on the wheel), the forklift operator and standing workers in hi-vis vests. */
(function (CT) {
  'use strict';
  var B = window.BABYLON;
  var SKINS = ['#e0ac69', '#c68642', '#8d5524', '#f1c27d', '#a0673c'];
  var HAIR = ['#2b1a10', '#1a1a1a', '#4a2a14', '#3b2a1a'];

  function cap(kit, name, r, h, parent, mat) {
    var m = B.MeshBuilder.CreateCapsule(name, { radius: r, height: h, tessellation: 10, subdivisions: 2, capSubdivisions: 4 }, kit.scene);
    m.parent = parent; m.material = mat;
    return m;
  }
  function ball(kit, name, d, parent, mat, seg) {
    var m = B.MeshBuilder.CreateSphere(name, { diameter: d, segments: seg || 10 }, kit.scene);
    m.parent = parent; m.material = mat;
    return m;
  }

  /**
   * opt: { pose: 'drive' | 'stand' | 'sit', shirt, pants, skin, hair, helmet, vest, seed }
   * Origin = hips (seated) or feet (standing). The person faces +z.
   */
  function make(kit, opt) {
    opt = opt || {};
    var seed = opt.seed || 1;
    var skin = kit.pbr(opt.skin || SKINS[seed % SKINS.length], { rough: 0.65 });
    var hair = kit.pbr(opt.hair || HAIR[seed % HAIR.length], { rough: 0.8 });
    var shirt = kit.pbr(opt.shirt || '#2f6fd0', { rough: 0.85 });
    var pants = kit.pbr(opt.pants || '#2a3240', { rough: 0.9 });
    var dark = kit.pbr('#16181c', { rough: 0.5 });
    var n = new B.TransformNode('human', kit.scene);
    var sitting = opt.pose !== 'stand';
    var hipY = sitting ? 0 : 0.92;
    // torso + head
    var torso = cap(kit, 'torso', 0.17, 0.62, n, shirt);
    torso.position.set(0, hipY + 0.32, 0); torso.scaling.set(1.15, 1, 0.75);
    if (opt.vest) { var v = cap(kit, 'vest', 0.18, 0.5, n, kit.pbr('#e8ff3a', { rough: 0.7, emissive: '#2a3000' })); v.position.set(0, hipY + 0.34, 0); v.scaling.set(1.18, 1, 0.8); }
    var neck = cap(kit, 'neck', 0.05, 0.14, n, skin); neck.position.set(0, hipY + 0.66, 0);
    var head = ball(kit, 'head', 0.22, n, skin, 14); head.position.set(0, hipY + 0.8, 0.01); head.scaling.set(0.92, 1.08, 1);
    var hr = ball(kit, 'hair', 0.235, n, hair, 12); hr.position.set(0, hipY + 0.84, -0.015); hr.scaling.set(0.95, 0.85, 1.02);
    var nose = ball(kit, 'nose', 0.04, n, skin, 6); nose.position.set(0, hipY + 0.79, 0.11);
    [-0.04, 0.04].forEach(function (x) { var e = ball(kit, 'eye', 0.022, n, dark, 6); e.position.set(x, hipY + 0.82, 0.095); });
    [-0.11, 0.11].forEach(function (x) { var ear = ball(kit, 'ear', 0.05, n, skin, 6); ear.position.set(x, hipY + 0.8, 0); ear.scaling.set(0.5, 1, 0.8); });
    if (opt.helmet) { var hm = ball(kit, 'helmet', 0.26, n, kit.pbr(opt.helmet, { rough: 0.35 }), 12); hm.position.set(0, hipY + 0.87, 0); hm.scaling.set(1, 0.72, 1.08); var brim = B.MeshBuilder.CreateCylinder('brim', { diameter: 0.3, height: 0.015, tessellation: 16 }, kit.scene); brim.parent = n; brim.position.set(0, hipY + 0.84, 0.02); brim.material = hm.material; }
    // arms
    var arm = function (side) {
      var sh = new B.TransformNode('shoulder', kit.scene); sh.parent = n; sh.position.set(side * 0.21, hipY + 0.55, 0);
      var up = cap(kit, 'upperArm', 0.05, 0.3, sh, shirt); up.position.y = -0.13;
      var el = new B.TransformNode('elbow', kit.scene); el.parent = sh; el.position.y = -0.27;
      var lo = cap(kit, 'forearm', 0.042, 0.28, el, skin); lo.position.y = -0.12;
      var hand = ball(kit, 'hand', 0.08, el, skin, 8); hand.position.y = -0.26;
      if (opt.pose === 'drive' || opt.pose === 'sit') { sh.rotation.x = -0.85; sh.rotation.z = side * 0.18; el.rotation.x = -0.7; }
      else { sh.rotation.z = side * 0.08; el.rotation.x = -0.1; }
      return { sh: sh, el: el };
    };
    var L = arm(-1), R = arm(1);
    // legs
    var leg = function (side) {
      var hp = new B.TransformNode('hip', kit.scene); hp.parent = n; hp.position.set(side * 0.1, hipY, 0);
      var th = cap(kit, 'thigh', 0.07, 0.44, hp, pants); th.position.y = -0.2;
      var kn = new B.TransformNode('knee', kit.scene); kn.parent = hp; kn.position.y = -0.42;
      var sh = cap(kit, 'shin', 0.058, 0.44, kn, pants); sh.position.y = -0.2;
      var ft = B.MeshBuilder.CreateBox('shoe', { width: 0.1, height: 0.07, depth: 0.24 }, kit.scene); ft.parent = kn; ft.position.set(0, -0.43, 0.05); ft.material = dark;
      if (sitting) { hp.rotation.x = -1.45; kn.rotation.x = 1.35; }
      return { hp: hp, kn: kn };
    };
    var LL = leg(-1), LR = leg(1);
    n.metadata = { arms: [L, R], legs: [LL, LR], head: head };
    // shadows for the visible parts
    [torso, head].forEach(function (m) { kit.shadow(m); });
    return n;
  }

  /** Walk cycle for a standing person (phase in radians). */
  function walk(person, phase, amount) {
    var md = person.metadata; if (!md) return;
    var a = Math.sin(phase) * 0.5 * amount;
    md.legs[0].hp.rotation.x = a; md.legs[1].hp.rotation.x = -a;
    md.legs[0].kn.rotation.x = Math.max(0, -a) * 0.8; md.legs[1].kn.rotation.x = Math.max(0, a) * 0.8;
    md.arms[0].sh.rotation.x = -a * 0.7; md.arms[1].sh.rotation.x = a * 0.7;
  }

  /** Waving arm (right arm up, swinging). */
  function wave(person, t) {
    var md = person.metadata; if (!md) return;
    md.arms[1].sh.rotation.z = -2.6; md.arms[1].sh.rotation.x = 0;
    md.arms[1].el.rotation.z = Math.sin(t * 8) * 0.5; md.arms[1].el.rotation.x = 0;
  }
  function rest(person) {
    var md = person.metadata; if (!md) return;
    md.legs[0].hp.rotation.x = md.legs[1].hp.rotation.x = 0; md.legs[0].kn.rotation.x = md.legs[1].kn.rotation.x = 0;
    md.arms[0].sh.rotation.x = md.arms[1].sh.rotation.x = 0; md.arms[1].sh.rotation.z = 0.08; md.arms[1].el.rotation.z = 0;
  }

  /**
   * A few people around a depot: a walker going back and forth, a guide who waves the truck in, and one standing.
   * at(s, lat) gives a world position; h is the road heading there.
   */
  function Crowd(kit, road, s, opt) {
    opt = opt || {};
    var self = this;
    this.people = [];
    var spots = [
      { mode: 'walk', a: [s - 9, 9.5], b: [s + 9, 9.5], shirt: '#2f6fd0', helmet: '#ffd21a' },
      { mode: 'wave', a: [s + 7.5, 5.2], shirt: '#ff8a1f', helmet: '#ffffff' },
      { mode: 'idle', a: [s - 6, 11.5], shirt: '#3a7d44', helmet: '#ffd21a' },
      { mode: 'walk', a: [s + 12, 13], b: [s - 12, 12], shirt: '#8a4fd8', helmet: '#ff8a1f' }
    ];
    spots.slice(0, opt.count || 4).forEach(function (sp, i) {
      var p = make(kit, { pose: 'stand', shirt: sp.shirt, vest: true, helmet: sp.helmet, seed: i + (opt.seed || 0) });
      self.people.push({ node: p, sp: sp, t: i * 1.7, u: Math.random() });
    });
    this.road = road;
    this.update(0, null);
  }
  Crowd.prototype.update = function (dt, truckPos) {
    var road = this.road;
    this.people.forEach(function (pp) {
      var sp = pp.sp, pos, yaw;
      pp.t += dt;
      if (sp.mode === 'walk') {
        var len = Math.abs(sp.b[0] - sp.a[0]) + Math.abs(sp.b[1] - sp.a[1]), speed = 1.3;
        pp.u = (pp.u + dt * speed / len) % 2;
        var k = pp.u < 1 ? pp.u : 2 - pp.u, from = pp.u < 1 ? sp.a : sp.b, to = pp.u < 1 ? sp.b : sp.a;
        var s1 = sp.a[0] + (sp.b[0] - sp.a[0]) * k, l1 = sp.a[1] + (sp.b[1] - sp.a[1]) * k;
        pos = road.world(s1, l1, 0);
        var f = road.at(s1), ds = to[0] - from[0], dl = to[1] - from[1];
        var dx = Math.sin(f.h) * ds + f.rx * dl, dz = Math.cos(f.h) * ds + f.rz * dl;
        yaw = Math.atan2(dx, dz);
        walk(pp.node, pp.t * 6.5, 1);
      } else {
        pos = road.world(sp.a[0], sp.a[1], 0);
        var fa = road.at(sp.a[0]);
        yaw = fa.h - Math.PI / 2;                                   // face the road
        if (truckPos) yaw = Math.atan2(truckPos.x - pos.x, truckPos.z - pos.z);
        if (sp.mode === 'wave') wave(pp.node, pp.t); else rest(pp.node);
      }
      pp.node.position.copyFrom(pos);
      pp.node.rotation.y = yaw;
    });
  };
  Crowd.prototype.dispose = function () { this.people.forEach(function (p) { p.node.dispose(false, false); }); };

  CT.Humans3D = { make: make, walk: walk, wave: wave, Crowd: Crowd };
})(window.CT);
