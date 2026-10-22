/* cargo3d.js — 3D cargo: box models, drag-and-drop or forklift loading, cargo that reacts to acceleration,
   braking, steering and bumps while strapped to the bed, per-item damage, falling off, and recovery. */
(function (CT) {
  'use strict';
  var B = window.BABYLON;
  var ST = { DOCK: 'dock', MOVE: 'move', TRUCK: 'truck', FALLEN: 'fallen', STORED: 'stored' };
  var BOX = 1.32;
  var PALLET_LAT = 7.4;          // lateral position of the pallets beside the right verge

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(u) { return u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u); }

  // ------------------------------------------------------------------ cargo models
  function cardboardTex(kit) {
    if (kit._cardTex) return kit._cardTex;
    kit._cardTex = kit.tex('cardboard', 128, 128, function (ctx) {
      ctx.fillStyle = '#d29a5c'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#c4884b'; for (var i = 0; i < 128; i += 6) ctx.fillRect(0, i, 128, 2);
      ctx.fillStyle = '#b87a3e'; ctx.fillRect(56, 0, 16, 128);          // tape
      ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 124, 124);
      ctx.fillStyle = '#5a3a1a'; ctx.font = 'bold 22px Arial'; ctx.fillText('↑↑', 14, 112);
    });
    return kit._cardTex;
  }
  function crateTex(kit) {
    if (kit._crateTex) return kit._crateTex;
    kit._crateTex = kit.tex('crate', 128, 128, function (ctx) {
      ctx.fillStyle = '#b07a42'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#8a5a2a'; for (var i = 0; i < 128; i += 32) ctx.fillRect(0, i, 128, 4);
      ctx.fillStyle = '#7a4f24'; ctx.fillRect(0, 0, 128, 12); ctx.fillRect(0, 116, 128, 12); ctx.fillRect(0, 0, 12, 128); ctx.fillRect(116, 0, 12, 128);
      ctx.save(); ctx.translate(64, 64); ctx.rotate(Math.PI / 4); ctx.fillRect(-90, -7, 180, 14); ctx.restore();
    });
    return kit._crateTex;
  }

  function model(kit, type, name) {
    var sc = kit.scene, m;
    if (type === 'barrel' || type === 'gas') {
      m = B.MeshBuilder.CreateCylinder(name, { diameter: BOX * 0.86, height: BOX, tessellation: 14 }, sc);
      m.material = kit.mat(type === 'gas' ? '#e23b30' : '#2f6fd0', { spec: 0.3 });
      var ring = kit.cyl('ring', BOX * 0.9, 0.08, 0, BOX * 0.25, 0, m, '#1d2a44'); ring.isPickable = false;
      var ring2 = kit.cyl('ring', BOX * 0.9, 0.08, 0, -BOX * 0.25, 0, m, '#1d2a44'); ring2.isPickable = false;
    } else if (type === 'fridge') {
      m = B.MeshBuilder.CreateBox(name, { width: BOX * 0.9, height: BOX, depth: BOX * 0.85 }, sc);
      m.material = kit.mat('#f4f6f8', { spec: 0.4 });
      kit.box('handle', 0.05, 0.4, 0.05, BOX * 0.3, 0.1, BOX * 0.43, m, '#8a909c').isPickable = false;
      kit.box('door', BOX * 0.86, 0.02, 0.01, 0, 0.12, BOX * 0.43, m, '#c9d0d8').isPickable = false;
    } else if (type === 'glass') {
      m = B.MeshBuilder.CreateBox(name, { width: BOX, height: BOX, depth: BOX * 0.7 }, sc);
      m.material = kit.texMat('crateM', crateTex(kit));
      var g = kit.box('pane', BOX * 0.8, BOX * 0.8, 0.04, 0, 0, BOX * 0.36, m, '#9fd8ff', { alpha: 0.7, spec: 0.8 }); g.isPickable = false;
      var lbl = kit.box('fragile', BOX * 0.5, 0.18, 0.02, 0, BOX * 0.3, BOX * 0.38, m, '#e23b30', { emissive: '#600000' }); lbl.isPickable = false;
    } else if (type === 'crate' || type === 'fruit') {
      m = B.MeshBuilder.CreateBox(name, { size: BOX }, sc);
      m.material = kit.texMat('crateM', crateTex(kit));
    } else {
      m = B.MeshBuilder.CreateBox(name, { size: BOX }, sc);
      if (!kit._cardMat) kit._cardMat = kit.texMat('cardM', cardboardTex(kit));
      m.material = kit._cardMat;
    }
    kit.shadow(m);
    return m;
  }

  function pallet(kit, parentPos, h) {
    var p = kit.box('pallet', 1.5, 0.16, 1.5, parentPos.x, parentPos.y + 0.08, parentPos.z, null, '#a8784a');
    p.rotation.y = h;
    return p;
  }

  // ------------------------------------------------------------------ forklift (original low-poly model)
  function Forklift(kit, road, s) {
    this.kit = kit; this.road = road;
    var n = kit.node('forklift', null, 0, 0, 0);
    var parts = [];
    var add = function (m) { parts.push(m); return m; };
    add(kit.box('flBody', 1.3, 0.9, 1.9, 0, 0.75, -0.2, null, '#ffb21a'));
    add(kit.box('flWeight', 1.3, 0.7, 0.5, 0, 0.75, -1.25, null, '#2a2d34'));
    add(kit.box('flSeat', 0.6, 0.15, 0.6, 0, 1.3, -0.4, null, '#1d1f24'));
    add(kit.box('flRoof', 1.25, 0.08, 1.4, 0, 2.35, -0.2, null, '#2a2d34'));
    [[-0.58, 0.4], [0.58, 0.4], [-0.58, -0.8], [0.58, -0.8]].forEach(function (p) { add(kit.box('flPost', 0.08, 1.1, 0.08, p[0], 1.8, p[1], null, '#2a2d34')); });
    var merged = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true); merged.parent = n; kit.shadow(merged);
    var wheels = [];
    [[-0.62, 0.45], [0.62, 0.45], [-0.62, -0.95], [0.62, -0.95]].forEach(function (p) {
      var w = kit.cyl('flWheel', 0.6, 0.3, p[0], 0.3, p[1], n, '#1d1f24', null, 12); w.rotation.z = Math.PI / 2; wheels.push(w);
    });
    var mast = kit.box('mast', 1.0, 2.6, 0.12, 0, 1.35, 0.85, n, '#3a3e47');
    var carriage = kit.node('carriage', n, 0, 0.12, 0.95);
    kit.box('backrest', 1.0, 0.7, 0.08, 0, 0.35, 0, carriage, '#3a3e47');
    kit.box('fork', 0.14, 0.06, 1.25, -0.32, 0.03, 0.65, carriage, '#8a909c');
    kit.box('fork', 0.14, 0.06, 1.25, 0.32, 0.03, 0.65, carriage, '#8a909c');
    // operator
    var op = kit.node('op', n, 0, 1.4, -0.35);
    kit.box('opBody', 0.42, 0.55, 0.3, 0, 0.27, 0, op, '#ff8a1f');
    kit.box('opVest', 0.44, 0.08, 0.32, 0, 0.35, 0, op, '#e8ff3a');
    var head = B.MeshBuilder.CreateSphere('opHead', { diameter: 0.3, segments: 6 }, kit.scene); head.parent = op; head.position.y = 0.7; head.material = kit.mat('#c68642');
    kit.box('opHat', 0.34, 0.12, 0.34, 0, 0.86, 0, op, '#ffd21a');
    this.node = n; this.carriage = carriage; this.wheels = wheels; this.mast = mast;
    this.s = s; this.lat = 12; this.lift = 0;
    this.place();
  }
  Forklift.prototype.place = function () {
    var f = this.road.at(this.s);
    this.node.position.set(f.x + f.rx * this.lat, f.y, f.z + f.rz * this.lat);
    this.node.rotation.y = f.h - Math.PI / 2;            // faces the road
    this.carriage.position.y = 0.12 + this.lift;
  };
  /** World position of a load resting on the forks. */
  Forklift.prototype.forkPoint = function () {
    var f = this.road.at(this.s), lat = this.lat - 1.6;
    return new B.Vector3(f.x + f.rx * lat, f.y + 0.2 + this.lift + BOX / 2, f.z + f.rz * lat);
  };
  Forklift.prototype.spin = function (d) { this.wheels.forEach(function (w) { w.rotation.x += d / 0.3; }); };

  // ------------------------------------------------------------------ manager
  function Cargo3D(scene, kit, road, truck, level) {
    this.scene = scene; this.kit = kit; this.road = road; this.truck = truck; this.level = level;
    var TYPES = CT.CargoManager.TYPES, self = this;
    this.items = level.cargo.map(function (type, i) {
      var T = TYPES[type] || TYPES.box;
      return {
        id: i, type: type, name: T.one, weight: T.weight, sens: T.sens, fragile: T.fragile,
        health: 100, state: ST.DOCK, slot: -1, mesh: null, off: new B.Vector3(0, 0, 0), offV: new B.Vector3(0, 0, 0),
        hop: 0, hopV: 0, vel: null, rest: false, lost: false, destroyed: false, delivered: false, anim: null
      };
    });
    this.required = this.items.length;
    this.stability = 0;
    this.tutorial = !!level.tutorial;
    this.loaded = {}; this.delivered = {};
    this.pallets = [];
    this.flJobs = []; this.fl = null;
    this.items.forEach(function (it) {
      it.mesh = model(kit, it.type, 'cargo' + it.id);
      it.mesh.metadata = { cargo: it };
    });
  }
  Cargo3D.ST = ST;
  Cargo3D.BOX = BOX;

  /** Pallets beside the parked truck, one opposite each bed slot. */
  Cargo3D.prototype.setupDock = function (drive) {
    var self = this;
    this.drive = drive;
    this.items.forEach(function (it, i) {
      var s = drive.s + self.truck.slots[i].z;
      it.home = self.road.world(s, PALLET_LAT, 0);
      it.homeS = s;
      self.pallets.push(pallet(self.kit, it.home, self.road.at(s).h));
      it.mesh.parent = null;
      it.mesh.position.set(it.home.x, it.home.y + 0.16 + BOX / 2, it.home.z);
      it.mesh.rotation.set(0, self.road.at(s).h, 0);
    });
    this.fl = new Forklift(this.kit, this.road, drive.s);
    this.fl.lat = 12.5; this.fl.place();
  };

  Cargo3D.prototype.count = function (st) { return this.items.filter(function (it) { return it.state === st; }).length; };
  Cargo3D.prototype.loadedCount = function () { return Object.keys(this.loaded).length; };
  Cargo3D.prototype.onTruck = function () { return this.items.filter(function (it) { return it.state === ST.TRUCK; }); };
  Cargo3D.prototype.weightOnTruck = function () { return this.onTruck().reduce(function (s, it) { return s + it.weight; }, 0); };
  Cargo3D.prototype.deliveredCount = function () { return Object.keys(this.delivered).length; };
  Cargo3D.prototype.fallen = function () { return this.items.filter(function (it) { return it.state === ST.FALLEN && !it.destroyed; }); };
  Cargo3D.prototype.destroyedCount = function () { return this.items.filter(function (it) { return it.destroyed; }).length; };
  Cargo3D.prototype.condition = function () {
    return this.items.reduce(function (s, it) { return s + (it.lost || it.destroyed ? 0 : it.health); }, 0) / Math.max(1, this.items.length);
  };
  Cargo3D.prototype.freeSlot = function (prefer, nearZ) {
    var used = {}; this.items.forEach(function (o) { if ((o.state === ST.TRUCK || (o.state === ST.MOVE && o.anim && o.anim.toSlot != null)) && o.slot >= 0) used[o.slot] = 1; });
    if (prefer != null && prefer >= 0 && !used[prefer] && (nearZ == null || Math.abs(this.truck.slots[prefer].z - nearZ) < 1.2)) return prefer;
    var best = -1, bd = 1e9, slots = this.truck.slots;
    for (var i = 0; i < slots.length; i++) { if (used[i]) continue; var d = nearZ == null ? i : Math.abs(slots[i].z - nearZ); if (d < bd) { bd = d; best = i; } }
    return best;
  };

  /** Moves an item onto the bed slot with an arc animation. */
  Cargo3D.prototype.flyToSlot = function (it, slot, dur) {
    var from = it.mesh.getAbsolutePosition().clone();
    it.state = ST.MOVE; it.slot = slot;
    it.anim = { t: 0, d: dur || 0.55, from: from, toSlot: slot, h: 1.2 };
  };
  Cargo3D.prototype.flyHome = function (it) {
    var from = it.mesh.getAbsolutePosition().clone();
    it.state = ST.MOVE; it.slot = -1;
    it.anim = { t: 0, d: 0.45, from: from, to: new B.Vector3(it.home.x, it.home.y + 0.16 + BOX / 2, it.home.z), h: 0.8, home: true };
  };
  Cargo3D.prototype.slotWorld = function (slot) {
    var p = this.truck.slots[slot].clone(); p.y += BOX / 2;
    this.truck.body.computeWorldMatrix(true);
    return B.Vector3.TransformCoordinates(p, this.truck.body.getWorldMatrix());
  };
  Cargo3D.prototype.attach = function (it, slot) {
    it.state = ST.TRUCK; it.slot = slot; it.anim = null;
    it.mesh.parent = this.truck.body;
    it.off.set(0, 0, 0); it.offV.set(0, 0, 0); it.hop = 0; it.hopV = 0;
    it.mesh.rotation.set(0, 0, 0);
    this.placeOnBed(it);
    var counted = !this.loaded[it.id]; this.loaded[it.id] = 1;
    if (this.onLoaded) this.onLoaded(it, counted);
  };
  Cargo3D.prototype.placeOnBed = function (it) {
    var p = this.truck.slots[it.slot];
    it.mesh.position.set(p.x + it.off.x, p.y + BOX / 2 + it.hop, p.z + it.off.z);
    it.mesh.rotation.z = -it.off.x * 0.25; it.mesh.rotation.x = it.off.z * 0.18;
  };

  // ---- drag & drop on the bed
  Cargo3D.prototype.bedHit = function (world) {
    var inv = this.truck.body.getWorldMatrix().clone().invert(), l = B.Vector3.TransformCoordinates(world, inv), b = this.truck.bed;
    return { inside: l.z > b.zMin - 0.4 && l.z < b.zMax + 0.4 && Math.abs(l.x) < b.half + 0.9, z: l.z };
  };

  // ---- forklift loading (LOAD button) and unloading
  Cargo3D.prototype.queueForklift = function (mode, items, dropS) {
    var self = this;
    items.forEach(function (it) { self.flJobs.push({ mode: mode, it: it, dropS: dropS }); });
  };
  Cargo3D.prototype.forkliftBusy = function () { return !!(this.flJob || this.flJobs.length); };
  /** Seconds left for the forklift queue (for the on-screen timer). */
  Cargo3D.prototype.forkliftRemaining = function () {
    var per = 3.4, r = this.flJobs.length * per;
    if (this.flJob) r += Math.max(0, per - this.flJob.t);
    return r;
  };
  Cargo3D.prototype.updateForklift = function (dt) {
    var fl = this.fl; if (!fl) return;
    if (!this.flJob && this.flJobs.length) {
      var j = this.flJobs.shift();
      if (j.mode === 'load' && j.it.state !== ST.DOCK) { return; }
      if (j.mode === 'load') { j.slot = this.freeSlot(j.it.id); if (j.slot < 0) return; j.s = j.it.homeS; j.it.slot = j.slot; j.it.state = ST.MOVE; j.it.anim = { fork: true, toSlot: j.slot }; }
      else { j.s = this.drive.s + this.truck.slots[j.it.slot].z; }
      j.t = 0; j.s0 = fl.s; this.flJob = j;
    }
    var J = this.flJob; if (!J) { fl.lat += (12.5 - fl.lat) * Math.min(1, dt * 2); fl.lift = Math.max(0, fl.lift - dt); fl.place(); return; }
    J.t += dt;
    var t = J.t, bedLift = this.truck.bed.y + 0.25, palletLift = 0.16, prevLat = fl.lat, it = J.it;
    var LAT_PICK = PALLET_LAT + 1.6, LAT_BED = 1.85 + 1.6 + 0.05, HOME = 12.5;
    if (J.mode === 'load') {
      // 0-0.7 drive in to pallet · 0.7-1.2 lift · 1.2-2.2 drive to truck · 2.2-2.7 place · 2.7-3.4 back out
      fl.s += (J.s - fl.s) * Math.min(1, dt * 6);
      if (t < 0.7) { fl.lat = HOME + (LAT_PICK - HOME) * ease(t / 0.7); fl.lift = palletLift - 0.1; }
      else if (t < 1.2) { fl.lat = LAT_PICK; fl.lift = palletLift + (bedLift - palletLift) * ease((t - 0.7) / 0.5); }
      else if (t < 2.2) { fl.lat = LAT_PICK + (LAT_BED - LAT_PICK) * ease((t - 1.2) / 1.0); fl.lift = bedLift; }
      else if (t < 2.7) { fl.lat = LAT_BED; if (!J.placed) { J.placed = true; this.flyToSlot(it, J.slot, 0.45); } }
      else { fl.lat = LAT_BED + (HOME - LAT_BED) * ease((t - 2.7) / 0.7); fl.lift = Math.max(0, bedLift * (1 - (t - 2.7) / 0.7)); }
      if (t >= 0.7 && t < 2.2 && !J.placed) { it.mesh.parent = null; it.mesh.position.copyFrom(fl.forkPoint()); it.mesh.rotation.y = this.road.at(fl.s).h; }
      if (t >= 3.4) this.flJob = null;
    } else {
      // unload: drive to truck · take the load · back out · lower onto the drop pallet
      var dropLat = PALLET_LAT;
      fl.s += (J.s - fl.s) * Math.min(1, dt * 6);
      if (t < 0.8) { fl.lat = HOME + (LAT_BED - HOME) * ease(t / 0.8); fl.lift = bedLift - 0.15; }
      else if (t < 1.2) { fl.lat = LAT_BED; fl.lift = bedLift + 0.15 * ease((t - 0.8) / 0.4); if (!J.took) { J.took = true; it.state = ST.MOVE; it.mesh.parent = null; it.anim = { fork: true }; } }
      else if (t < 2.3) { fl.lat = LAT_BED + (dropLat + 1.6 - LAT_BED) * ease((t - 1.2) / 1.1); }
      else if (t < 2.8) { fl.lift = (bedLift) * (1 - ease((t - 2.3) / 0.5)) + palletLift * ease((t - 2.3) / 0.5); }
      else if (!J.done) { J.done = true; this.store(it); }
      else fl.lat = (dropLat + 1.6) + (HOME - dropLat - 1.6) * ease((t - 2.8) / 0.6);
      if (J.took && !J.done) { it.mesh.position.copyFrom(fl.forkPoint()); it.mesh.rotation.y = this.road.at(fl.s).h; }
      if (t >= 3.4) this.flJob = null;
    }
    fl.spin(fl.lat - prevLat);
    fl.place();
  };
  Cargo3D.prototype.store = function (it) {
    it.state = ST.STORED; it.anim = null; it.slot = -1;
    var p = it.mesh.position; p.y = this.road.at(this.road.project(p.x, p.z).s).y + 0.16 + BOX / 2;
    if (!this.delivered[it.id]) { this.delivered[it.id] = 1; if (this.onDelivered) this.onDelivered(it); }
  };

  // ---- per-frame
  Cargo3D.prototype.update = function (dt, drive) {
    var self = this, stab = this.stability;
    this.updateForklift(dt);
    this.items.forEach(function (it) {
      var a = it.anim;
      if (it.state === ST.MOVE && a && !a.fork) {
        a.t += dt; var u = Math.min(1, a.t / a.d), e = ease(u);
        var to = a.home ? a.to : self.slotWorld(a.toSlot);
        it.mesh.parent = null;
        it.mesh.position.set(a.from.x + (to.x - a.from.x) * e, a.from.y + (to.y - a.from.y) * e + Math.sin(u * Math.PI) * a.h, a.from.z + (to.z - a.from.z) * e);
        if (u >= 1) {
          if (a.home) { it.state = ST.DOCK; it.anim = null; it.slot = -1; }
          else self.attach(it, a.toSlot);
        }
      } else if (it.state === ST.TRUCK) {
        // inertia: the load is pushed opposite to the truck's acceleration and sprung back by the straps
        var light = 1 / Math.max(0.6, it.weight);                   // light cargo shifts more
        var k = 55 * (1 + 0.2 * stab) / Math.min(1.6, light), damp = 7;
        var ax = -drive.latAcc * 0.9 * light, az = -drive.accel * 0.9 * light;
        it.offV.x += (ax - k * it.off.x - damp * it.offV.x) * dt;
        it.offV.z += (az - k * it.off.z - damp * it.offV.z) * dt;
        it.off.x += it.offV.x * dt; it.off.z += it.offV.z * dt;
        it.hopV += (-it.hop * 220 - it.hopV * 9) * dt; it.hop += it.hopV * dt;
        if (it.hop < 0) { it.hop = 0; it.hopV = -it.hopV * 0.25; }
        var lim = 0.42 + stab * 0.06;
        if (!self.tutorial && (Math.abs(it.off.x) > lim || Math.abs(it.off.z) > lim * 1.2 || it.hop > 0.9)) self.knockOff(it, drive);
        else {
          it.off.x = clamp(it.off.x, -lim, lim); it.off.z = clamp(it.off.z, -lim, lim);
          self.placeOnBed(it);
        }
      } else if (it.state === ST.FALLEN && !it.rest) self.updateFall(it, dt);
    });
  };

  /** Hit from a crash / bump: kicks the loads (they may fall if the hit is big enough). */
  Cargo3D.prototype.jolt = function (dvForward, dvSide, dvUp) {
    this.onTruck().forEach(function (it) {
      var light = 1 / Math.max(0.6, it.weight);
      it.offV.z -= dvForward * light; it.offV.x -= (dvSide || 0) * light;
      it.hopV += (dvUp || 0) * (0.8 + 0.4 * Math.sin(it.id * 4.1));
    });
  };
  /** Damage spread over the loads on the bed by sensitivity. Returns the worst-hit item. */
  Cargo3D.prototype.damage = function (amount, mult) {
    var worst = null, wd = 0;
    this.onTruck().forEach(function (it) {
      var d = amount * it.sens * mult * (0.75 + 0.5 * Math.abs(Math.sin(it.id * 12.9 + amount)));
      it.health = Math.max(0, it.health - d);
      if (d > wd) { wd = d; worst = it; }
    });
    return worst ? { item: worst, amount: wd } : null;
  };
  Cargo3D.prototype.knockOff = function (it, drive) {
    var wp = it.mesh.getAbsolutePosition().clone();
    it.mesh.parent = null; it.mesh.position.copyFrom(wp);
    it.state = ST.FALLEN; it.lost = true; it.rest = false; it.slot = -1;
    var fwd = drive.forward(), right = new B.Vector3(fwd.z, 0, -fwd.x);
    var side = it.off.x >= 0 ? 1 : -1;
    it.vel = fwd.scale(drive.v * 0.6).add(right.scale(side * 2.5)).add(new B.Vector3(0, 2.5, 0));
    it.spinV = new B.Vector3(1.5 * side, 0.5, 2 * side);
    if (this.onFall) this.onFall(it);
  };
  Cargo3D.prototype.updateFall = function (it, dt) {
    var p = it.mesh.position;
    it.vel.y -= 9.8 * dt;
    p.addInPlace(it.vel.scale(dt));
    it.mesh.rotation.addInPlace(it.spinV.scale(dt));
    var pr = this.road.project(p.x, p.z), ground = (Math.abs(pr.lat) < CT.Road3D.HALF + 1 ? pr.f.y : this.road.terrainHeight(Object.assign({}, pr.f, { s: pr.s }), pr.lat)) + BOX / 2;
    if (p.y <= ground) {
      p.y = ground;
      if (it.vel.y < -3) {
        var hit = Math.min(45, -it.vel.y * 5) * it.sens * (this.tutorial ? 0.3 : 1);
        it.health = Math.max(0, it.health - hit);
        if (it.health <= 0) it.destroyed = true;
        if (this.onGround) this.onGround(it, hit);
      }
      it.vel.y = -it.vel.y * 0.25; it.vel.x *= 0.5; it.vel.z *= 0.5; it.spinV.scaleInPlace(0.4);
      if (Math.abs(it.vel.y) < 1) {
        it.vel.y = 0;
        if (it.vel.length() < 0.3) {
          it.rest = true;
          it.mesh.rotation.x = Math.round(it.mesh.rotation.x / (Math.PI / 2)) * Math.PI / 2;
          it.mesh.rotation.z = Math.round(it.mesh.rotation.z / (Math.PI / 2)) * Math.PI / 2;
        }
      }
    }
  };
  /** Nearest fallen (not destroyed) load that has come to rest within reach of the stopped truck. */
  Cargo3D.prototype.recoverable = function (drive) {
    if (Math.abs(drive.v) > 1) return null;
    var tp = this.truck.root.position, best = null, bd = 9;
    this.fallen().forEach(function (it) {
      if (!it.rest) return;
      var d = B.Vector3.Distance(it.mesh.position, tp);
      if (d < bd) { bd = d; best = it; }
    });
    return best;
  };
  Cargo3D.prototype.recover = function (it) {
    var slot = this.freeSlot(it.id);
    if (slot < 0) return false;
    it.lost = false; it.mesh.rotation.set(0, 0, 0);
    this.flyToSlot(it, slot, 0.7);
    return true;
  };

  Cargo3D.prototype.dispose = function () {
    this.items.forEach(function (it) { if (it.mesh) it.mesh.dispose(false, false); });
    this.pallets.forEach(function (p) { p.dispose(); });
    if (this.fl) this.fl.node.dispose(false, false);
  };

  CT.Cargo3D = Cargo3D;
})(window.CT);
