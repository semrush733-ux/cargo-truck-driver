/* hazards3d.js — the special challenges placed on a level's road:
     light  traffic signal with a stop line (running a red light is a violation)
     rail   railway crossing: barriers, flashing lights and a real train that crosses the road
     toll   checkpoint gate: stop in front of it and it opens
     block  fallen tree / boulder / snow boulder / broken-down van closing one lane
     herd   cows, goats or reindeer slowly crossing the road
     fuel   fuel station with a refuelling bay
   The game asks this module where the truck must stop, what blocks a lane and whether it hit something. */
(function (CT) {
  'use strict';
  var B = window.BABYLON, V3 = B.Vector3;
  var HALF, LANE_R, LANE_L;

  function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
  function ease(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }

  function Hazards(game) {
    HALF = CT.Road3D.HALF; LANE_R = CT.Road3D.LANE_R; LANE_L = CT.Road3D.LANE_L;
    this.g = game; this.road = game.road; this.kit = game.kit; this.scene = game.scene;
    this.t = 0; this.meshes = []; this.items = [];
    var self = this, k = this.kit;
    this.mat = {
      red: k.pbr('#ff2a1a', { emissive: '#ff2010', glow: 2.5, live: true }), redOff: k.pbr('#3a0808', { rough: 0.4 }),
      yel: k.pbr('#ffc21a', { emissive: '#ffb000', glow: 2.5 }), yelOff: k.pbr('#3a2a08', { rough: 0.4 }),
      grn: k.pbr('#2aff6a', { emissive: '#10e050', glow: 2.5 }), grnOff: k.pbr('#083a18', { rough: 0.4 }),
      black: k.pbr('#1a1b1e', { rough: 0.6 }), steel: k.pbr('#9aa3ad', { metal: 0.8, rough: 0.35 }),
      white: k.pbr('#f2f2f2', { rough: 0.5 }), stripe: k.pbr('#e23b30', { rough: 0.5 })
    };
    (this.road.obstacles || []).forEach(function (o, i) {
      var fn = self['build_' + o.type];
      if (fn) { o.idx = i; o.off = hash(i * 7.7 + (game.level.id || 0)) * 30; fn.call(self, o); self.items.push(o); }
    });
  }

  Hazards.prototype.post = function (s, lat, h) {
    var f = this.road.at(s);
    return { p: new V3(f.x + f.rx * lat, f.y, f.z + f.rz * lat), f: f };
  };
  Hazards.prototype.add = function (m) { this.meshes.push(m); return m; };

  // ------------------------------------------------------------------ traffic light
  Hazards.prototype.build_light = function (o) {
    var k = this.kit, sc = this.scene, P = this.post(o.s, HALF + 0.9), n = k.node('signal', null, P.p.x, P.p.y, P.p.z);
    n.rotation.y = P.f.h; this.add(n);
    var pole = B.MeshBuilder.CreateCylinder('sigPole', { diameter: 0.2, height: 6.4, tessellation: 10 }, sc); pole.parent = n; pole.position.y = 3.2; pole.material = this.mat.black;
    var arm = B.MeshBuilder.CreateBox('sigArm', { width: 4.2, height: 0.15, depth: 0.15 }, sc); arm.parent = n; arm.position.set(-2.1, 6.2, 0); arm.material = this.mat.black;
    var head = B.MeshBuilder.CreateBox('sigHead', { width: 0.55, height: 1.6, depth: 0.4 }, sc); head.parent = n; head.position.set(-2.9, 5.4, 0); head.material = this.mat.black;
    var low = B.MeshBuilder.CreateBox('sigHead2', { width: 0.4, height: 1.2, depth: 0.3 }, sc); low.parent = n; low.position.set(0, 3.0, -0.22); low.material = this.mat.black;
    o.lamps = [];
    [[1, 'red'], [0, 'yel'], [-1, 'grn']].forEach(function (c) {
      var a = B.MeshBuilder.CreateCylinder('lamp', { diameter: 0.38, height: 0.06, tessellation: 14 }, sc);
      a.parent = n; a.rotation.x = Math.PI / 2; a.position.set(-2.9, 5.4 + c[0] * 0.48, -0.22);
      var b2 = B.MeshBuilder.CreateCylinder('lamp2', { diameter: 0.28, height: 0.05, tessellation: 12 }, sc);
      b2.parent = n; b2.rotation.x = Math.PI / 2; b2.position.set(0, 3.0 + c[0] * 0.36, -0.38);
      o.lamps.push({ c: c[1], meshes: [a, b2] });
    }, this);
    var line = this.road.strip('stopLine', o.s - 0.4, o.s + 0.4, 0.2, HALF - 0.3, 0.05, '#f4f4f2', 1);
    this.road.signPost(o.s - 55, 'SIGNAL', '#ffcc33', '#1d1d22');
    o.cycle = { g: 9 + hash(o.idx) * 3, y: 2.5, r: 7 + hash(o.idx + 3) * 2 };
    o.state = null;
  };
  Hazards.prototype.lightState = function (o) {
    var c = o.cycle, T = c.g + c.y + c.r, u = ((this.t + o.off) % T + T) % T;
    return u < c.g ? 'green' : u < c.g + c.y ? 'yellow' : 'red';
  };
  Hazards.prototype.lightLeft = function (o) {       // seconds until this light changes
    var c = o.cycle, T = c.g + c.y + c.r, u = ((this.t + o.off) % T + T) % T;
    return u < c.g ? c.g - u : u < c.g + c.y ? c.g + c.y - u : T - u;
  };

  // ------------------------------------------------------------------ railway crossing + train
  var RAIL_P = 30;
  Hazards.prototype.build_rail = function (o) {
    var k = this.kit, sc = this.scene, f = this.road.at(o.s), self = this;
    o.f = f;
    var trackMat = this.mat.steel, sleeperMat = k.surface('planks', 0.5, { tint: '#7a5a3a', env: 0.3 });
    var sleeper = B.MeshBuilder.CreateBox('sleeper', { width: 0.3, height: 0.14, depth: 2.6 }, sc); sleeper.material = sleeperMat;
    for (var x = -160; x <= 160; x += 0.9) {
      var w = new V3(f.x + f.rx * x, this.road.terrainHeight(Object.assign({}, f, { s: o.s }), x) + 0.07, f.z + f.rz * x);
      if (Math.abs(x) < HALF + 1) w.y = f.y + 0.06;
      sleeper.thinInstanceAdd(B.Matrix.RotationY(f.h + Math.PI / 2).multiply(B.Matrix.Translation(w.x, w.y, w.z)), false);
    }
    sleeper.thinInstanceBufferUpdated('matrix'); sleeper.thinInstanceRefreshBoundingInfo(false); sleeper.alwaysSelectAsActiveMesh = true; this.add(sleeper);
    [-0.72, 0.72].forEach(function (off) {
      var r = B.MeshBuilder.CreateBox('rail', { width: 320, height: 0.12, depth: 0.1 }, sc);
      r.position.set(f.x + Math.sin(f.h) * off, f.y + 0.14, f.z + Math.cos(f.h) * off); r.rotation.y = f.h; r.material = trackMat; self.add(r);
    });
    this.road.strip('railPlank', o.s - 1.4, o.s + 1.4, -HALF, HALF, 0.1, '#4a3a2a', 1);
    // barriers: before the crossing on the right (our side) and after it on the left (oncoming side)
    o.arms = [];
    [[-1, HALF + 0.8, 1], [1, -(HALF + 0.8), -1]].forEach(function (c) {
      var P = self.post(o.s + c[0] * 4, c[1]), n = k.node('barrier', null, P.p.x, P.p.y, P.p.z); n.rotation.y = f.h; self.add(n);
      var post = B.MeshBuilder.CreateBox('bPost', { width: 0.35, height: 1.3, depth: 0.35 }, sc); post.parent = n; post.position.y = 0.65; post.material = self.mat.black;
      var piv = k.node('armPivot', n, 0, 1.15, 0);
      var arm = B.MeshBuilder.CreateBox('bArm', { width: HALF + 0.6, height: 0.14, depth: 0.1 }, sc); arm.parent = piv; arm.position.x = -c[2] * (HALF + 0.6) / 2; arm.material = self.mat.stripe;
      for (var i = 0; i < 4; i++) { var wb = B.MeshBuilder.CreateBox('bWhite', { width: 0.5, height: 0.15, depth: 0.11 }, sc); wb.parent = piv; wb.position.x = -c[2] * (0.6 + i * 1.2); wb.material = self.mat.white; }
      var cross = k.sign('xing', 'RAILWAY', 1.8, 0.5, '#ffffff', '#c62828', n); cross.position.set(0, 3.0, -0.1);
      var pole = B.MeshBuilder.CreateCylinder('xPole', { diameter: 0.12, height: 3.2 }, sc); pole.parent = n; pole.position.y = 1.6; pole.material = self.mat.steel;
      var l1 = B.MeshBuilder.CreateCylinder('xl', { diameter: 0.3, height: 0.05, tessellation: 12 }, sc); l1.parent = n; l1.rotation.x = Math.PI / 2; l1.position.set(-0.3, 2.4, -0.12);
      var l2 = l1.clone('xl2'); l2.parent = n; l2.position.x = 0.3;
      o.arms.push({ piv: piv, dir: c[2], lamps: [l1, l2] });
    });
    this.road.signPost(o.s - 60, 'TRAIN', '#ffcc33', '#1d1d22');
    // the train: locomotive + wagons, moving along the track (perpendicular to the road)
    var parts = [], loco = B.MeshBuilder.CreateBox('loco', { width: 2.9, height: 3.6, depth: 16 }, sc); loco.position.y = 2.3; loco.material = k.pbr(['#c62828', '#1565c0', '#2e7d32'][o.idx % 3], { metal: 0.3, rough: 0.35, coat: 0.5 }); parts.push(loco);
    var cab = B.MeshBuilder.CreateBox('locoWin', { width: 2.95, height: 0.8, depth: 3 }, sc); cab.position.set(0, 3.3, 6); cab.material = k.pbr('#101820', { metal: 0.4, rough: 0.05 }); parts.push(cab);
    var stripe = B.MeshBuilder.CreateBox('locoStripe', { width: 2.95, height: 0.3, depth: 16.02 }, sc); stripe.position.y = 1.4; stripe.material = this.mat.white; parts.push(stripe);
    for (var wgn = 1; wgn <= 4; wgn++) {
      var wb2 = B.MeshBuilder.CreateBox('wagon', { width: 2.8, height: 3.0, depth: 13 }, sc); wb2.position.set(0, 2.0, -wgn * 14.2); wb2.material = k.pbr(['#6b4a2b', '#5a606b', '#8a5a2a', '#3a6b4a'][wgn % 4], { rough: 0.7 }); parts.push(wb2);
    }
    for (var wh = 0; wh < 10; wh++) { var wl = B.MeshBuilder.CreateCylinder('tw', { diameter: 0.9, height: 3.0, tessellation: 12 }, sc); wl.rotation.z = Math.PI / 2; wl.position.set(0, 0.45, 6 - wh * 7.2); wl.material = this.mat.black; parts.push(wl); }
    var train = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    var tn = k.node('train', null, 0, 0, 0); train.parent = tn; k.shadow(train);
    tn.rotation.y = f.h + Math.PI / 2;                       // runs along the track
    o.train = tn; o.trainLen = 72; this.add(tn);
    o.phase = -1; o.horned = false;
  };
  /** 0..RAIL_P: 0-13 open, 13-16 closing (bells), 16-26 train passes, 26-29 opening. */
  Hazards.prototype.railPhase = function (o) { return ((this.t + o.off) % RAIL_P + RAIL_P) % RAIL_P; };
  Hazards.prototype.railClosed = function (o) { var u = this.railPhase(o); return u >= 13 && u < 29; };
  Hazards.prototype.trainX = function (o) { var u = this.railPhase(o); return u >= 16 && u < 26 ? -170 + (u - 16) / 10 * 340 : 9999; };

  // ------------------------------------------------------------------ toll / checkpoint gate
  Hazards.prototype.build_toll = function (o) {
    var k = this.kit, sc = this.scene, f = this.road.at(o.s), self = this;
    var P = this.post(o.s, HALF + 2.6), n = k.node('toll', null, P.p.x, P.p.y, P.p.z); n.rotation.y = f.h; this.add(n);
    var booth = B.MeshBuilder.CreateBox('booth', { width: 2.4, height: 2.8, depth: 3 }, sc); booth.parent = n; booth.position.y = 1.4; booth.material = k.pbr('#e8e4da', { rough: 0.5 });
    var win = B.MeshBuilder.CreateBox('boothWin', { width: 0.05, height: 1, depth: 2 }, sc); win.parent = n; win.position.set(-1.22, 1.8, 0); win.material = k.pbr('#101820', { metal: 0.4, rough: 0.05 });
    var roof = B.MeshBuilder.CreateBox('canopy', { width: HALF * 2 + 6, height: 0.4, depth: 6 }, sc); roof.parent = n; roof.position.set(-(HALF + 2.6), 5.6, 0); roof.material = k.pbr('#2f6fd0', { rough: 0.4 });
    [-1, 1].forEach(function (s2) { var c = B.MeshBuilder.CreateBox('canopyPost', { width: 0.4, height: 5.6, depth: 0.4 }, sc); c.parent = n; c.position.set(s2 > 0 ? 0 : -(HALF * 2 + 5.2), 2.8, s2 * 2.6); c.material = self.mat.steel; });
    var sign = k.sign('tollSign', 'STOP · TOLL', HALF * 1.6, 0.9, '#ffcc33', '#1d1d22', n, { glow: '#806010' }); sign.position.set(-(HALF + 2.6), 5.0, -3.05);
    var piv = k.node('tollPivot', n, -1.4, 1.1, -1.6);
    var arm = B.MeshBuilder.CreateBox('tollArm', { width: HALF + 0.4, height: 0.16, depth: 0.12 }, sc); arm.parent = piv; arm.position.x = -(HALF + 0.4) / 2; arm.material = this.mat.stripe;
    o.piv = piv; o.open = 0; o.wait = 0; o.state = 'closed';
    this.road.strip('tollLine', o.s - 6.5, o.s - 6.0, 0.2, HALF - 0.3, 0.05, '#ffcc33', 1);
    this.road.signPost(o.s - 70, 'TOLL 200m', '#2f6fd0', '#ffffff');
  };

  // ------------------------------------------------------------------ lane blockers
  Hazards.prototype.build_block = function (o) {
    var k = this.kit, sc = this.scene, f = this.road.at(o.s), parts = [], self = this;
    o.lat = o.lane === 'L' ? LANE_L : LANE_R;
    var P = this.post(o.s, o.lat);
    var lumpy = function (m, amt, seed) {
      var p = m.getVerticesData(B.VertexBuffer.PositionKind);
      for (var i = 0; i < p.length; i += 3) { var q = 1 + (hash(seed + i * 0.37) - 0.5) * amt; p[i] *= q; p[i + 1] *= q; p[i + 2] *= q; }
      m.updateVerticesData(B.VertexBuffer.PositionKind, p); var nn = []; B.VertexData.ComputeNormals(p, m.getIndices(), nn); m.updateVerticesData(B.VertexBuffer.NormalKind, nn);
      return m;
    };
    if (o.kind === 'tree') {
      var trunk = B.MeshBuilder.CreateCylinder('logT', { diameterTop: 0.5, diameterBottom: 0.8, height: 9, tessellation: 10 }, sc);
      trunk.rotation.z = Math.PI / 2; trunk.rotation.y = 0.25; trunk.position.y = 0.45; trunk.material = k.surface('bark', 1, { v: 3, env: 0.3 }); parts.push(trunk);
      for (var i = 0; i < 4; i++) { var b = lumpy(B.MeshBuilder.CreateIcoSphere('logLeaves', { radius: 1.1 + hash(i) * 0.5, subdivisions: 2 }, sc), 0.3, i * 9); b.position.set(2.5 + i * 0.6, 0.9, (hash(i * 3) - 0.5) * 2); b.material = k.pbr(this.g.level.autumn ? '#c4471f' : '#3d7a2e', { rough: 0.85 }); parts.push(b); }
      o.halfS = 1.6; o.halfL = 2.4;
    } else if (o.kind === 'van') {
      var van = B.MeshBuilder.CreateBox('bVan', { width: 2.0, height: 2.3, depth: 5 }, sc); van.position.y = 1.4; van.material = k.pbr('#e8e8e8', { metal: 0.3, rough: 0.35, coat: 0.5 }); parts.push(van);
      var vw = B.MeshBuilder.CreateBox('bVanWin', { width: 2.02, height: 0.8, depth: 1 }, sc); vw.position.set(0, 2.0, 2.0); vw.material = k.pbr('#101820', { metal: 0.4, rough: 0.05 }); parts.push(vw);
      [[-1, 1.6], [1, 1.6], [-1, -1.6], [1, -1.6]].forEach(function (w) { var t = B.MeshBuilder.CreateCylinder('bvw', { diameter: 0.7, height: 0.25 }, sc); t.rotation.z = Math.PI / 2; t.position.set(w[0] * 0.95, 0.35, w[1]); t.material = k.pbr('#1a1b1e', { rough: 0.8 }); parts.push(t); });
      var tri = B.MeshBuilder.CreateCylinder('warnTri', { diameter: 0.9, height: 0.05, tessellation: 3 }, sc); tri.rotation.x = Math.PI / 2; tri.position.set(0, 0.45, -8); tri.material = this.mat.stripe; parts.push(tri);
      o.halfS = 2.6; o.halfL = 1.2; o.hazard = true;
    } else {
      var snow = o.kind === 'snowball';
      for (var r = 0; r < 3; r++) {
        var rock = lumpy(B.MeshBuilder.CreateIcoSphere('boulder', { radius: r ? 1.0 : 1.75, subdivisions: 2 }, sc), 0.4, r * 17 + o.idx);
        rock.position.set((r - 1) * 1.15, r ? 0.75 : 1.25, (hash(r + 2) - 0.5) * 1.6); rock.scaling.y = 0.8;
        rock.material = snow ? k.pbr('#f3f7fb', { rough: 0.6 }) : k.surface(this.g.level.theme === 'canyon' || this.g.level.theme === 'desert' ? 'rock' : 'cliff', 0.5, { env: 0.4, tint: this.g.level.theme === 'canyon' ? '#c8764a' : undefined });
        parts.push(rock);
      }
      o.halfS = 1.8; o.halfL = 1.7;
    }
    var m = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    m.position.copyFrom(P.p); m.rotation.y = f.h; k.shadow(m); m.receiveShadows = true; this.add(m);
    o.blink = [];
    if (o.hazard) o.blink = [-0.8, 0.8].map(function (x) { var bl = B.MeshBuilder.CreateBox('hz', { width: 0.25, height: 0.12, depth: 0.06 }, sc); bl.parent = m; bl.position.set(x, 1.0, -2.53); return bl; });
    // a striped "road closed" barrier with flashing lamps in front of the blocker (seen from the lane's own traffic)
    var dirS = o.lat > 0 ? -1 : 1, Pb = this.post(o.s + dirS * (o.halfS + 0.7), o.lat), bn = k.node('closedBar', null, Pb.p.x, Pb.p.y, Pb.p.z);
    bn.rotation.y = Pb.f.h + (dirS > 0 ? Math.PI : 0); this.add(bn);
    var board = B.MeshBuilder.CreateBox('closedBoard', { width: 3.0, height: 0.45, depth: 0.08 }, sc); board.parent = bn; board.position.y = 1.0; board.material = this.mat.stripe;
    for (var w2 = -1; w2 <= 1; w2++) { var wb3 = B.MeshBuilder.CreateBox('closedW', { width: 0.45, height: 0.46, depth: 0.09 }, sc); wb3.parent = bn; wb3.position.set(w2 * 0.95, 1.0, 0); wb3.rotation.z = 0.5; wb3.material = this.mat.white; wb3.scaling.x = 0.6; }
    [-1.3, 1.3].forEach(function (x) {
      var leg = B.MeshBuilder.CreateBox('closedLeg', { width: 0.1, height: 1.0, depth: 0.1 }, sc); leg.parent = bn; leg.position.set(x, 0.5, 0); leg.material = self.mat.black;
      var lamp = B.MeshBuilder.CreateSphere('closedLamp', { diameter: 0.26, segments: 8 }, sc); lamp.parent = bn; lamp.position.set(x, 1.38, 0); o.blink.push(lamp);
    });
    this.road.signPost(o.s - 55, o.lane === 'L' ? 'LEFT LANE BLOCKED' : 'LANE BLOCKED', '#ff8a1f', '#1d1d22');
  };

  // ------------------------------------------------------------------ animals crossing
  function animal(k, kind, seed) {
    var sc = k.scene, parts = [], n = k.node('animal', null, 0, 0, 0);
    var coat = kind === 'cow' ? (seed % 2 ? '#f4f1ea' : '#6b4a2b') : kind === 'goat' ? '#d8c8a8' : '#8a5a3a';
    var size = kind === 'cow' ? 1 : kind === 'goat' ? 0.6 : 0.85;
    var body = B.MeshBuilder.CreateCapsule('aBody', { radius: 0.45 * size, height: 1.9 * size, tessellation: 10 }, sc); body.rotation.x = Math.PI / 2; body.position.y = 1.15 * size; body.material = k.pbr(coat, { rough: 0.85 }); parts.push(body);
    if (kind === 'cow' && seed % 2) { [0.2, -0.4].forEach(function (z) { var sp = B.MeshBuilder.CreateSphere('spot', { diameter: 0.5, segments: 6 }, sc); sp.position.set(0.3, 1.3, z); sp.scaling.set(0.5, 0.8, 1); sp.material = k.pbr('#1d1d1d', { rough: 0.8 }); parts.push(sp); }); }
    var head = B.MeshBuilder.CreateBox('aHead', { width: 0.42 * size, height: 0.45 * size, depth: 0.6 * size }, sc); head.position.set(0, 1.45 * size, 1.15 * size); head.material = body.material; parts.push(head);
    var nose = B.MeshBuilder.CreateBox('aNose', { width: 0.36 * size, height: 0.25 * size, depth: 0.12 }, sc); nose.position.set(0, 1.35 * size, 1.47 * size); nose.material = k.pbr(kind === 'cow' ? '#e8a8a0' : '#3a2a1a', { rough: 0.7 }); parts.push(nose);
    [[-0.22, 0.6], [0.22, 0.6], [-0.22, -0.6], [0.22, -0.6]].forEach(function (l) {
      var leg = B.MeshBuilder.CreateCylinder('aLeg', { diameter: 0.14 * size, height: 0.9 * size }, sc); leg.position.set(l[0] * size, 0.45 * size, l[1] * size); leg.material = body.material; parts.push(leg);
    });
    if (kind !== 'cow' || true) {
      [-1, 1].forEach(function (s) {
        var horn = B.MeshBuilder.CreateCylinder('aHorn', { diameterTop: 0.01, diameterBottom: 0.07, height: kind === 'reindeer' ? 0.7 : 0.3 }, sc);
        horn.position.set(s * 0.15 * size, 1.8 * size, 1.05 * size); horn.rotation.z = s * -0.5; horn.material = k.pbr('#e8e0c8', { rough: 0.6 }); parts.push(horn);
      });
    }
    var m = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true); m.parent = n; k.shadow(m);
    return n;
  }
  Hazards.prototype.build_herd = function (o) {
    var self = this;
    o.animals = [];
    for (var i = 0; i < 4; i++) {
      var a = animal(this.kit, o.kind || 'cow', i);
      this.add(a);
      o.animals.push({ node: a, ds: (i - 1.5) * 3, lat: -14 + hash(i * 3 + o.idx) * 28, dir: i % 2 ? 1 : -1, speed: 0.9 + hash(i * 5) * 0.6, wait: hash(i * 7) * 3 });
    }
    this.road.signPost(o.s - 60, o.kind === 'goat' ? 'GOATS' : o.kind === 'reindeer' ? 'REINDEER' : 'ANIMALS', '#ffcc33', '#1d1d22');
    o.mooT = -9;
  };

  // ------------------------------------------------------------------ fuel station
  Hazards.prototype.build_fuel = function (o) {
    var k = this.kit, sc = this.scene, f = this.road.at(o.s), self = this;
    var P = this.post(o.s, HALF + 5), n = k.node('fuelStation', null, P.p.x, P.p.y, P.p.z); n.rotation.y = f.h; this.add(n);
    var roof = B.MeshBuilder.CreateBox('fRoof', { width: 14, height: 0.6, depth: 14 }, sc); roof.parent = n; roof.position.set(-3.5, 5.5, 0); roof.material = k.pbr('#f2f2f2', { rough: 0.4 });
    var band = B.MeshBuilder.CreateBox('fBand', { width: 14.1, height: 0.5, depth: 14.1 }, sc); band.parent = n; band.position.set(-3.5, 5.3, 0); band.material = k.pbr('#2fae4f', { rough: 0.4, emissive: '#0a3a14' });
    [[-9, -6], [-9, 6], [2, -6], [2, 6]].forEach(function (p) { var c = B.MeshBuilder.CreateBox('fPost', { width: 0.4, height: 5.3, depth: 0.4 }, sc); c.parent = n; c.position.set(p[0], 2.65, p[1]); c.material = self.mat.white; });
    [-3, 3].forEach(function (z) {
      var pump = B.MeshBuilder.CreateBox('pump', { width: 0.8, height: 1.8, depth: 0.6 }, sc); pump.parent = n; pump.position.set(0.5, 0.9, z); pump.material = k.pbr('#e23b30', { rough: 0.4, coat: 0.4 });
      var scr = B.MeshBuilder.CreateBox('pumpScr', { width: 0.82, height: 0.4, depth: 0.3 }, sc); scr.parent = n; scr.position.set(0.5, 1.4, z); scr.material = k.pbr('#101820', { emissive: '#2a6a3a' });
    });
    var shop = B.MeshBuilder.CreateBox('fShop', { width: 6, height: 3.5, depth: 9 }, sc); shop.parent = n; shop.position.set(6.5, 1.75, 0); shop.material = k.pbr('#e8e4da', { rough: 0.6 });
    var sign = k.sign('fuelSign', 'FUEL', 3, 1.2, '#2fae4f', '#ffffff', n, { glow: '#2a8a3a' }); sign.position.set(-3.5, 6.6, -7.1);
    this.road.strip('fuelBay', o.s - 8, o.s + 8, 0.3, HALF - 0.3, 0.05, '#ffcc33', 0.45);
    this.road.signPost(o.s - 160, 'FUEL 150m', '#2fae4f', '#ffffff');
    o.bay = { s1: o.s - 8, s2: o.s + 8 };
  };

  // ------------------------------------------------------------------ per-frame animation
  Hazards.prototype.update = function (dt) {
    this.t += dt;
    var self = this, d = this.g.drive, M = this.mat;
    this.items.forEach(function (o) {
      if (o.type === 'light') {
        var st = self.lightState(o);
        if (st !== o.state) {
          o.state = st;
          o.lamps.forEach(function (l) {
            var on = (l.c === 'red' && st === 'red') || (l.c === 'yel' && st === 'yellow') || (l.c === 'grn' && st === 'green');
            l.meshes.forEach(function (m) { m.material = on ? M[l.c] : M[l.c + 'Off']; });
          });
        }
      } else if (o.type === 'rail') {
        var u = self.railPhase(o), down = u < 13 ? 0 : u < 16 ? ease((u - 13) / 2.5) : u < 26 ? 1 : u < 29 ? 1 - ease((u - 26) / 2.5) : 0;
        o.arms.forEach(function (a) {
          a.piv.rotation.z = a.dir * (1 - down) * 1.45;
          var fl = u >= 12.5 && u < 29 && Math.floor(self.t * 3) % 2;
          a.lamps[0].material = fl ? M.red : M.redOff; a.lamps[1].material = u >= 12.5 && u < 29 && !fl ? M.red : M.redOff;
        });
        var x = self.trainX(o);
        o.train.setEnabled(x < 9000);
        if (x < 9000) {
          var f = o.f, tf = self.road.terrainHeight(Object.assign({}, f, { s: o.s }), x);
          o.train.position.set(f.x + f.rx * x, Math.max(f.y, Math.abs(x) < HALF + 1 ? f.y : tf) + 0.15, f.z + f.rz * x);
          if (!o.horned && Math.abs(x) < 120 && d && Math.abs(d.s - o.s) < 150) { o.horned = true; CT.Audio.play('horn'); setTimeout(function () { CT.Audio.play('horn'); }, 350); }
        } else o.horned = false;
        if (u >= 12.5 && u < 13 + dt && d && Math.abs(d.s - o.s) < 120) CT.Audio.play('alarm');
      } else if (o.type === 'toll') {
        o.open += ((o.state === 'open' ? 1 : 0) - o.open) * Math.min(1, dt * 3);
        o.piv.rotation.z = -o.open * 1.45;
      } else if (o.type === 'block' && o.blink && o.blink.length) {
        var on = Math.floor(self.t * 2.5) % 2 === 0;
        o.blink.forEach(function (b) { b.material = on ? M.yel : M.yelOff; });
      } else if (o.type === 'herd') {
        o.animals.forEach(function (a, i) {
          if (a.wait > 0) a.wait -= dt;
          else {
            a.lat += a.dir * a.speed * dt;
            if (a.lat > 14 || a.lat < -14) { a.dir = -a.dir; a.wait = 2 + hash(i + self.t) * 3; }
          }
          var P = self.post(o.s + a.ds, a.lat);
          var ground = Math.abs(a.lat) < HALF + 1 ? P.f.y : self.road.terrainHeight(Object.assign({}, P.f, { s: o.s + a.ds }), a.lat);
          a.node.position.set(P.p.x, ground + (a.wait > 0 ? 0 : Math.abs(Math.sin(self.t * 6 + i)) * 0.05), P.p.z);
          a.node.rotation.y = P.f.h + (a.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        });
      }
    });
  };

  // ------------------------------------------------------------------ rules for the truck
  /** Called each frame while the truck drives. s0/s1 are the truck centre before/after the move. */
  Hazards.prototype.check = function (s0, s1) {
    var self = this, g = this.g, d = g.drive, half = g.truck.halfLen, front0 = s0 + half, front1 = s1 + half;
    this.items.forEach(function (o) {
      if (o.type === 'light') {
        if (front0 < o.s && front1 >= o.s && d.v > 1.5 && d.lat > -1 && self.lightState(o) === 'red') g.onRedLight(o);
      } else if (o.type === 'rail') {
        var x = self.trainX(o), onX = Math.abs(d.s - o.s) < half + 1.8;
        if (onX && x + 8 > d.lat - g.truck.width / 2 - 0.5 && x - 63 < d.lat + g.truck.width / 2 + 0.5) {   // loco front at x+8, last wagon ends at x-63
          g.hazardCrash(Math.max(8, d.v), 'The train hit you! Wait while the barrier is down', o.s - half - 4);
          return;
        }
        var u = self.railPhase(o);
        if (u >= 15.5 && u < 28 && front0 < o.s - 4 && front1 >= o.s - 4 && d.lat > -1) g.hazardCrash(d.v, 'Stop! The barrier is down, a train is coming', o.s - 4 - half - 0.5);
      } else if (o.type === 'toll') {
        var gap = o.s - 1.5 - front1;
        if (o.state !== 'open' && d.lat > -0.5) {
          if (gap < 0 && front0 < o.s - 1.5) { g.hazardCrash(d.v, 'Stop at the toll gate and wait for it to open', o.s - 1.5 - half - 0.3); return; }
          if (gap >= 0 && gap < 14 && Math.abs(d.v) < 0.6) {
            o.wait += g.lastDt || 0.016;
            if (o.wait > 1.0) { o.state = 'open'; CT.Audio.play('coin'); g.toast('Gate open, have a good trip!', 'good'); }
          } else o.wait = 0;
        }
        if (o.state === 'open' && d.s - half > o.s + 3) o.state = 'closed';
      } else if (o.type === 'block') {
        if (Math.abs(d.s - o.s) < half + o.halfS && Math.abs(d.lat - o.lat) < g.truck.width / 2 + o.halfL - 0.2) {
          var back = d.s < o.s ? o.s - o.halfS - half - 0.4 : o.s + o.halfS + half + 0.4;
          if (Math.abs(d.v) < 2.2) { d.pushTo(back); d.stop(); if (g.t - (o.touchT || -9) > 3) { o.touchT = g.t; g.toast('Road blocked! Reverse a little, then pass on the other lane', 'warn'); } }
          else g.hazardCrash(Math.abs(d.v), 'Road blocked! Use the other lane when it is clear', back);
        }
      } else if (o.type === 'herd') {
        o.animals.forEach(function (a) {
          if (Math.abs(d.s - (o.s + a.ds)) < half + 0.9 && Math.abs(d.lat - a.lat) < g.truck.width / 2 + 0.6) {
            var back2 = d.s < o.s + a.ds ? o.s + a.ds - half - 1.2 : o.s + a.ds + half + 1.2;
            if (Math.abs(d.v) > 1 && g.t - o.mooT > 2) { o.mooT = g.t; g.hazardCrash(Math.max(3, Math.abs(d.v)) * 0.6, 'Moo! Stop and let the animals cross', back2); }
            else d.v = 0;
          }
        });
      } else if (o.type === 'fuel') {
        if (d.s + half > o.bay.s1 && d.s - half < o.bay.s2 && d.lat > 0 && Math.abs(d.v) < 0.5) g.refuel(o);
      }
    });
  };

  /** Where the truck should stop right now (nearest ahead), for hints and the autopilot. */
  Hazards.prototype.stopAhead = function (lookahead) {
    var self = this, g = this.g, d = g.drive, front = d.s + g.truck.halfLen, best = null;
    this.items.forEach(function (o) {
      var stopAt = null, why = '';
      if (o.type === 'light') {
        var st = self.lightState(o), dist = o.s - front;
        if (dist > -0.5 && (st === 'red' || (st === 'yellow' && dist > d.v * 1.2) || (st === 'green' && self.lightLeft(o) < dist / Math.max(4, d.v) - 1))) { stopAt = o.s - 1; why = st === 'red' ? 'Red light: stop at the line' : 'Light changing: stop'; }
      } else if (o.type === 'rail') {
        var u = self.railPhase(o);
        if ((u >= 11 && u < 29) && o.s - 4 - front > -1) { stopAt = o.s - 5; why = 'Train coming: wait at the barrier'; }
      } else if (o.type === 'toll') {
        if (o.state !== 'open' && o.s - front > -0.5) { stopAt = o.s - 3; why = 'Stop at the toll gate'; }
      } else if (o.type === 'herd') {
        var onRoad = o.animals.some(function (a) { return Math.abs(a.lat) < HALF + 2.5; });
        if (onRoad && o.s - 6 - front > -2) { stopAt = o.s - 8; why = 'Animals on the road: wait'; }
      }
      if (stopAt != null && stopAt - front < (lookahead || 90) && (!best || stopAt < best.s)) best = { s: stopAt, why: why, o: o };
    });
    return best;
  };
  /** The nearest blocker ahead in the truck's lane. */
  Hazards.prototype.blockAhead = function (lookahead) {
    var d = this.g.drive, best = null;
    this.items.forEach(function (o) {
      if (o.type !== 'block') return;
      var dist = o.s - d.s;
      if (dist > -o.halfS - 6 && dist < (lookahead || 90) && (!best || dist < best.dist)) best = { o: o, dist: dist };
    });
    return best;
  };
  /** For traffic cars: the s where a car moving in direction dir must stop, or null. */
  Hazards.prototype.carStop = function (c) {
    var self = this, best = null;
    this.items.forEach(function (o) {
      var ahead = (o.s - c.s) * c.dir;
      if (ahead < -1 || ahead > 60) return;
      var stop = false;
      if (o.type === 'light' && c.dir > 0) { var st = self.lightState(o); stop = st === 'red' || (st === 'yellow' && ahead > 8); }
      else if (o.type === 'rail') { var u = self.railPhase(o); stop = u >= 12 && u < 29; }
      else if (o.type === 'herd') stop = o.animals.some(function (a) { return Math.abs(a.lat - c.lat) < 2.5; });
      if (stop) { var sAt = o.s - c.dir * (o.type === 'light' ? 2 : 7); if (best == null || (sAt - c.s) * c.dir < (best - c.s) * c.dir) best = sAt; }
    });
    return best;
  };
  /** For traffic cars: is there a blocker in this lane just ahead (so the car swerves)? */
  Hazards.prototype.blockedFor = function (s, lat, dir) {
    var hit = null;
    this.items.forEach(function (o) {
      if (o.type !== 'block') return;
      var ahead = (o.s - s) * dir;
      if (ahead > -o.halfS - 4 && ahead < 35 && Math.abs(o.lat - lat) < 2) hit = o;
    });
    return hit;
  };
  /** No traffic is spawned near toll gates. */
  Hazards.prototype.noTrafficAt = function (s) {
    return this.items.some(function (o) { return o.type === 'toll' && Math.abs(o.s - s) < 70; });
  };
  /** Mission card lines for this level's challenges. */
  Hazards.prototype.summary = function () {
    var c = {}; this.items.forEach(function (o) { c[o.type] = (c[o.type] || 0) + 1; });
    var out = [];
    if (c.light) out.push('🚦 ' + c.light + ' traffic light' + (c.light > 1 ? 's' : ''));
    if (c.rail) out.push('🚂 ' + c.rail + ' railway crossing' + (c.rail > 1 ? 's' : ''));
    if (c.toll) out.push('🛑 ' + c.toll + ' toll gate' + (c.toll > 1 ? 's' : ''));
    if (c.block) out.push('🪨 ' + c.block + ' blocked lane' + (c.block > 1 ? 's' : ''));
    if (c.herd) out.push('🐄 Animals crossing');
    if (c.fuel) out.push('⛽ Fuel station on the way');
    return out;
  };
  Hazards.prototype.dispose = function () { this.meshes.forEach(function (m) { try { m.dispose(false, false); } catch (e) {} }); };

  CT.Hazards3D = Hazards;
})(window.CT);
