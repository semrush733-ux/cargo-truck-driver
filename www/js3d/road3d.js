/* road3d.js — builds the 3D world for a level config: a road path (curves, hills, bridges, roadworks, mud, ice,
   potholes, speed bumps), terrain that follows the road, trees, signs, the loading warehouse, the delivery
   warehouse with its marked unloading zone, and the weather. Exposes queries the truck controller needs. */
(function (CT) {
  'use strict';
  var B = window.BABYLON;
  var STEP = 2;                       // path sample spacing (m)
  var HALF = 4.6;                     // half width of the asphalt (2 lanes of 3.5 m + kerb strips)
  var LANE_R = 1.85, LANE_L = -1.85;  // lateral centre of the right / left lane (positive = right side)

  var THEMES = {
    country: { grass: [0.36, 0.62, 0.25], grass2: [0.45, 0.7, 0.3], far: [0.32, 0.55, 0.3], sky: '#8fd0f7', fog: '#cfe8f7', trees: 'green' },
    desert: { grass: [0.86, 0.72, 0.46], grass2: [0.9, 0.78, 0.52], far: [0.8, 0.6, 0.4], sky: '#f2d9a6', fog: '#f5e3c0', trees: 'cactus' },
    snow: { grass: [0.92, 0.95, 0.98], grass2: [0.85, 0.9, 0.96], far: [0.78, 0.84, 0.92], sky: '#bcd3ea', fog: '#dfe9f3', trees: 'pine' },
    city: { grass: [0.5, 0.5, 0.5], grass2: [0.55, 0.55, 0.55], far: [0.5, 0.5, 0.5], sky: '#a9c6e0', fog: '#c8d3dd', trees: 'none' }
  };

  function smooth(u) { return u * u * (3 - 2 * u); }
  function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
  function noise1(x) { var i = Math.floor(x), f = x - i; return hash(i) + (hash(i + 1) - hash(i)) * smooth(f); }

  function Road(scene, kit, level) {
    this.scene = scene; this.kit = kit; this.level = level;
    this.theme = THEMES[level.theme] || THEMES.country;
    this.buildPath();
    this.meshes = [];
  }
  Road.STEP = STEP; Road.HALF = HALF; Road.LANE_R = LANE_R; Road.LANE_L = LANE_L;

  // ------------------------------------------------------------------ path
  Road.prototype.buildPath = function () {
    var L = this.level, pts = [], x = 0, z = 0, y = 0, h = 0, s = 0, sections = [];
    pts.push({ x: x, y: y, z: z, h: h, s: 0, type: null });
    L.segments.forEach(function (seg) {
      var n = Math.max(1, Math.round(seg.len / STEP)), turn = (seg.turn || 0) * Math.PI / 180, rise = seg.rise || 0, y0 = y;
      if (seg.type) sections.push({ type: seg.type, s1: s, s2: s + n * STEP });
      if (seg.cliff) sections.push({ type: 'cliff', side: seg.cliff === 'L' ? -1 : 1, s1: s, s2: s + n * STEP, rail: !!seg.rail });
      for (var i = 1; i <= n; i++) {
        h += turn / n;
        x += Math.sin(h) * STEP; z += Math.cos(h) * STEP; s += STEP;
        y = y0 + rise * smooth(i / n);
        pts.push({ x: x, y: y, z: z, h: h, s: s, type: seg.type || null, cliff: seg.cliff === 'L' ? -1 : seg.cliff === 'R' ? 1 : 0, wall: seg.cliff ? 1 : 0 });
      }
    });
    this.pts = pts;
    this.length = s;
    this.sections = sections;
    this.startS = 26;                                   // truck parks here for loading
    this.zone = { s1: s - 70, s2: s - 52 };             // unloading bay before the delivery warehouse
  };

  /** Interpolated frame at distance s: position, heading, right vector, height, slope. */
  Road.prototype.at = function (s) {
    var P = this.pts, f = Math.max(0, Math.min(P.length - 1.001, s / STEP)), i = Math.floor(f), u = f - i;
    var a = P[i], b = P[i + 1] || a;
    var h = a.h + (b.h - a.h) * u;
    return {
      x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, h: h,
      rx: Math.cos(h), rz: -Math.sin(h), slope: Math.atan2(b.y - a.y, STEP), type: a.type
    };
  };

  /** Closest path distance to a world point, searching near a hint (fast, frame-to-frame). */
  Road.prototype.project = function (px, pz, hintS) {
    var P = this.pts, i0 = Math.max(0, Math.round((hintS || 0) / STEP) - 12), i1 = Math.min(P.length - 1, i0 + 24), best = i0, bd = 1e18;
    if (hintS == null) { i0 = 0; i1 = P.length - 1; }
    for (var i = i0; i <= i1; i++) { var dx = px - P[i].x, dz = pz - P[i].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    // refine along the segment
    var a = P[best], b = P[Math.min(P.length - 1, best + 1)], c = P[Math.max(0, best - 1)];
    var seg = function (p, q) {
      var ex = q.x - p.x, ez = q.z - p.z, len2 = ex * ex + ez * ez || 1;
      var t = Math.max(0, Math.min(1, ((px - p.x) * ex + (pz - p.z) * ez) / len2));
      var qx = p.x + ex * t, qz = p.z + ez * t;
      return { s: p.s + t * STEP, d2: (px - qx) * (px - qx) + (pz - qz) * (pz - qz) };
    };
    var r1 = seg(a, b), r2 = seg(c, a), r = r1.d2 < r2.d2 ? r1 : r2;
    var f = this.at(r.s);
    var lat = (px - f.x) * f.rx + (pz - f.z) * f.rz;            // + is right of the road centre
    return { s: r.s, lat: lat, f: f };
  };

  Road.prototype.sectionAt = function (s) {
    for (var i = 0; i < this.sections.length; i++) { var sc = this.sections[i]; if (sc.type !== 'cliff' && s >= sc.s1 && s <= sc.s2) return sc; }
    return null;
  };
  /** Side with a drop at distance s (-1 left, 1 right, 0 none) and whether a guard rail protects it. */
  Road.prototype.cliffAt = function (s) {
    for (var i = 0; i < this.sections.length; i++) { var sc = this.sections[i]; if (sc.type === 'cliff' && s >= sc.s1 - 3 && s <= sc.s2 + 3) return sc; }
    return null;
  };
  Road.prototype.halfWidth = function () { return HALF; };
  Road.prototype.world = function (s, lat, up) {
    var f = this.at(s);
    return new B.Vector3(f.x + f.rx * lat, f.y + (up || 0), f.z + f.rz * lat);
  };

  // ------------------------------------------------------------------ meshes
  Road.prototype.build = function () {
    this.buildSky();
    this.buildRoadMesh();
    this.buildTerrain();
    this.buildBridges();
    this.buildCliffEdges();
    this.buildObstacles();
    this.buildProps();
    this.loadDock = this.buildWarehouse(this.startS - 2, 'CARGO DEPOT', '#e85d3a');
    this.dropDock = this.buildWarehouse((this.zone.s1 + this.zone.s2) / 2, 'DELIVERY HUB', '#2f7fe0');
    this.buildZone();
    this.buildWeather();
  };

  /** Which real sky photo this level uses, and its haze/fog. */
  Road.prototype.skyName = function () {
    var L = this.level;
    return L.weather === 'rain' || L.weather === 'fog' ? 'overcast' : L.theme === 'snow' ? 'clear' : 'day';
  };
  Road.prototype.buildSky = function () {
    var sc = this.scene, L = this.level;
    sc.clearColor = new B.Color4(0.72, 0.8, 0.9, 1);
    sc.fogMode = B.Scene.FOGMODE_LINEAR;
    sc.fogColor = B.Color3.FromHexString(L.weather === 'fog' ? '#c9d0d6' : L.weather === 'rain' ? '#8f9aa6' : L.theme === 'desert' ? '#e3d6bd' : '#c4d6e8');
    sc.fogStart = L.weather === 'fog' ? 20 : L.weather === 'rain' ? 60 : 180;
    sc.fogEnd = L.weather === 'fog' ? 130 : L.weather === 'rain' ? 280 : 700;
  };

  Road.prototype.buildRoadMesh = function () {
    var P = this.pts, pos = [], uv = [], ind = [], nrm = [], W = HALF * 2;
    for (var i = 0; i < P.length; i++) {
      var p = P[i], rx = Math.cos(p.h), rz = -Math.sin(p.h);
      pos.push(p.x - rx * HALF, p.y + 0.03, p.z - rz * HALF, p.x + rx * HALF, p.y + 0.03, p.z + rz * HALF);
      uv.push(0, p.s / W, 1, p.s / W);                   // square photo tiles across the full width
      if (i > 0) { var a = (i - 1) * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    var m = new B.Mesh('road', this.scene), vd = new B.VertexData();
    vd.positions = pos; vd.indices = ind; vd.uvs = uv;
    B.VertexData.ComputeNormals(pos, ind, nrm); vd.normals = nrm;
    vd.applyToMesh(m);
    var wet = this.level.weather === 'rain';
    var mat = this.kit.surface('asphalt', 1, { env: wet ? 1 : 0.5, tint: wet ? '#8e9196' : '#d8d8d8' });
    if (wet) mat.roughness = 0.45;                       // wet asphalt reflects the sky
    m.material = mat; m.receiveShadows = true;
    this.meshes.push(m);
    // painted markings: solid white edge lines and a dashed yellow centre line
    var white = this.kit.pbr('#f4f4f2', { rough: 0.55 }), yellow = this.kit.pbr('#f2c230', { rough: 0.55 });
    this.lines(0, this.length, -HALF + 0.42, 0.16, 0, 0, white);
    this.lines(0, this.length, HALF - 0.42, 0.16, 0, 0, white);
    this.lines(0, this.length, 0, 0.14, 3, 6, yellow);
    // surface patches: photo-textured mud, ice and broken asphalt
    var self = this;
    this.sections.forEach(function (sc) {
      if (sc.type !== 'mud' && sc.type !== 'ice' && sc.type !== 'rough') return;
      var mm = sc.type === 'mud' ? self.kit.surface('mud', 1, { env: 0.4 }) : sc.type === 'ice' ? self.kit.surface('snow', 1, { tint: '#d8ecff', env: 1.2, rough: 0.25 }) : self.kit.surface('asphalt', 0.7, { tint: '#7d7f84', bump: 2.5, env: 0.35 });   // worn, patched asphalt
      self.strip('sect', sc.s1, sc.s2, -HALF + 0.3, HALF - 0.3, 0.05, null, 1, mm);
    });
  };

  /** Painted road line: continuous (dash = 0) or dashed, as one mesh. */
  Road.prototype.lines = function (s1, s2, lat, w, dash, gap, mat) {
    var pos = [], ind = [], nrm = [], n = 0, self = this;
    var quad = function (a, b) {
      for (var s = a; s <= b + 0.01; s += Math.min(STEP, b - a || STEP)) {
        var f = self.at(Math.min(s, b));
        pos.push(f.x + f.rx * (lat - w / 2), f.y + 0.045, f.z + f.rz * (lat - w / 2), f.x + f.rx * (lat + w / 2), f.y + 0.045, f.z + f.rz * (lat + w / 2));
        if (s > a) { var k = (n - 1) * 2; ind.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        n++;
        if (s >= b) break;
      }
    };
    if (!dash) quad(s1, s2);
    else for (var s = s1; s < s2; s += dash + gap) { quad(s, Math.min(s2, s + dash)); }
    var m = new B.Mesh('line', this.scene), vd = new B.VertexData();
    vd.positions = pos; vd.indices = ind; B.VertexData.ComputeNormals(pos, ind, nrm); vd.normals = nrm; vd.applyToMesh(m);
    m.material = mat; m.receiveShadows = true;
    this.meshes.push(m);
    return m;
  };

  /** Flat strip on the road between s1..s2 and lateral a..b (with UVs for photo textures). */
  Road.prototype.strip = function (name, s1, s2, a, b, up, hex, alpha, material) {
    var pos = [], ind = [], nrm = [], uv = [], n = 0, wdt = Math.abs(b - a);
    for (var s = s1; s <= s2 + 0.01; s += STEP) {
      var f = this.at(s);
      pos.push(f.x + f.rx * a, f.y + up, f.z + f.rz * a, f.x + f.rx * b, f.y + up, f.z + f.rz * b);
      uv.push(0, (s - s1) / wdt, 1, (s - s1) / wdt);
      if (n > 0) { var k = (n - 1) * 2; ind.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      n++;
    }
    var m = new B.Mesh(name, this.scene), vd = new B.VertexData();
    vd.positions = pos; vd.indices = ind; vd.uvs = uv; B.VertexData.ComputeNormals(pos, ind, nrm); vd.normals = nrm; vd.applyToMesh(m);
    m.material = material || this.kit.mat(hex, { alpha: alpha || 1 });
    m.receiveShadows = true;
    this.meshes.push(m);
    return m;
  };

  Road.prototype.terrainHeight = function (p, lat) {
    var a = Math.abs(lat), side = lat < 0 ? -1 : 1, bridge = p.type === 'bridge';
    var base = p.y;
    if (a <= HALF + 1) return base - 0.04;
    if (a > 300) return base + (this.level.theme === 'city' ? 0 : 20 + 45 * noise1(p.s * 0.004 + side * 3));   // distant hills on the horizon
    // keep the ground flat around both warehouses
    if (lat > 0 && a < 48 && (Math.abs(p.s - this.startS) < 30 || Math.abs(p.s - (this.zone.s1 + this.zone.s2) / 2) < 30)) return base - 0.04;
    var hill = (noise1(p.s * 0.012 + side * 7.3) - 0.35) * (this.level.theme === 'snow' ? 26 : this.level.theme === 'desert' ? 8 : this.level.theme === 'city' ? 0 : 14);
    var u = Math.min(1, (a - HALF - 1) / 60);
    var hgt = base - 0.3 + smooth(u) * Math.max(0, hill) + u * 2;
    if (bridge) hgt = Math.min(hgt, base - 8 + u * 4);
    if (p.cliff) {
      if (side === p.cliff) {                       // the drop: a steep fall into the valley
        var v = Math.min(1, (a - HALF - 1) / 10);
        hgt = base - 0.3 - v * 28 - u * 18;
      } else {                                      // the mountain side: a rock wall going up
        hgt = base - 0.3 + Math.min(1, (a - HALF - 1) / 6) * 9 + u * 30 + Math.max(0, hill);
      }
    }
    return hgt;
  };

  /** Ground and rock meshes that follow the road, with photo textures (grass / sand / snow and rock faces). */
  Road.prototype.buildTerrain = function () {
    var P = this.pts, COLS = [-420, -160, -90, -50, -30, -18, -10, -(HALF + 1.6), -(HALF + 0.2), HALF + 0.2, HALF + 1.6, 10, 18, 30, 50, 90, 160, 420];
    var ROADGAP = 8;                                           // the road itself sits between columns 7 and 8
    var pos = [], col = [], uv = [], indG = [], indR = [], self = this, stride = COLS.length, row = 0, rockAt = [];
    var rows = [];
    for (var e = -14; e < 0; e++) rows.push(Object.assign({}, P[0], { x: P[0].x + Math.sin(P[0].h) * STEP * 2 * e, z: P[0].z + Math.cos(P[0].h) * STEP * 2 * e, s: e * STEP * 2 }));
    rows = rows.concat(P.filter(function (p, i) { return i % 2 === 0; }));
    var last = P[P.length - 1];
    for (var e2 = 1; e2 <= 30; e2++) rows.push(Object.assign({}, last, { x: last.x + Math.sin(last.h) * STEP * e2 * 2, z: last.z + Math.cos(last.h) * STEP * e2 * 2, s: last.s + e2 * STEP * 2 }));
    rows.forEach(function (p) {
      var rx = Math.cos(p.h), rz = -Math.sin(p.h);
      COLS.forEach(function (lat, c) {
        var y = self.terrainHeight(p, lat), x = p.x + rx * lat, z = p.z + rz * lat;
        pos.push(x, y, z);
        uv.push(p.s / 9, (Math.abs(lat) + y) / 9);              // along the road / up the slope: no stretching on walls
        var v = 0.86 + 0.14 * noise1(p.s * 0.05 + c * 3.1);           // gentle colour variation
        var shoulder = Math.abs(lat) <= HALF + 1.7;
        if (shoulder) col.push(0.78, 0.72, 0.62, 1); else col.push(v, v, v * (0.95 + 0.05 * noise1(p.s * 0.02)), 1);
        rockAt.push(!!(p.cliff && Math.abs(lat) > HALF + 2 && Math.abs(lat) < 60));
      });
      if (row > 0) {
        for (var c2 = 0; c2 < stride - 1; c2++) {
          if (c2 === ROADGAP) continue;
          var a = (row - 1) * stride + c2, b = row * stride + c2;
          var rock = rockAt[a] || rockAt[a + 1] || rockAt[b] || rockAt[b + 1];
          // steep quads also get rock (natural hill sides)
          if (!rock) { var dy = Math.abs(pos[(a + 1) * 3 + 1] - pos[a * 3 + 1]), dl = Math.abs(COLS[c2 + 1] - COLS[c2]); rock = dy / dl > 0.75; }
          (rock ? indR : indG).push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      row++;
    });
    var k = this.kit, th = this.level.theme;
    var groundName = th === 'desert' ? 'sand' : th === 'snow' ? 'snow' : th === 'city' ? 'concrete' : 'grass';
    var groundMat = k.surface(groundName, 1, { env: th === 'snow' ? 0.9 : 0.35, tint: th === 'country' ? '#a6dd72' : undefined });
    var rockMat = k.surface(th === 'desert' ? 'rock' : 'cliff', 1, { env: 0.45, tint: th === 'desert' ? '#d8b48a' : th === 'snow' ? '#c9cfd6' : undefined });
    var mk = function (name, ind, mat) {
      if (!ind.length) return;
      var m = new B.Mesh(name, self.scene), vd = new B.VertexData(), nrm = [];
      vd.positions = pos; vd.colors = col; vd.uvs = uv; vd.indices = ind; B.VertexData.ComputeNormals(pos, ind, nrm); vd.normals = nrm;
      vd.applyToMesh(m);
      m.material = mat; m.useVertexColors = true; m.receiveShadows = true;
      m.freezeWorldMatrix();
      self.meshes.push(m);
    };
    mk('terrain', indG, groundMat);
    mk('rocks', indR, rockMat);
  };

  Road.prototype.buildBridges = function () {
    var self = this, k = this.kit;
    this.sections.forEach(function (sc) {
      if (sc.type !== 'bridge') return;
      var mid = self.at((sc.s1 + sc.s2) / 2);
      // water under the bridge
      var w = B.MeshBuilder.CreateGround('water', { width: 120, height: sc.s2 - sc.s1 + 40 }, self.scene);
      w.position.set(mid.x, mid.y - 6, mid.z); w.rotation.y = mid.h;
      w.material = k.mat('#3a8fd0', { spec: 0.6, alpha: 0.92 });
      self.meshes.push(w);
      // deck sides + railings
      self.strip('deckL', sc.s1, sc.s2, -HALF - 0.5, -HALF, 0.6, '#9aa3ad');
      self.strip('deckR', sc.s1, sc.s2, HALF, HALF + 0.5, 0.6, '#9aa3ad');
      var post = k.box('railPost', 0.15, 1.1, 0.15, 0, 0, 0, null, '#d64c3c');
      var rail = k.box('railBar', 0.12, 0.12, STEP * 2 + 0.05, 0, 0, 0, null, '#f0f0f0');
      var pier = k.box('pier', 1.2, 8, 1.2, 0, 0, 0, null, '#8a8f98');
      for (var s = sc.s1; s <= sc.s2; s += STEP * 2) {
        var f = self.at(s);
        [-HALF - 0.25, HALF + 0.25].forEach(function (lat) {
          var mtx = B.Matrix.RotationY(f.h).multiply(B.Matrix.Translation(f.x + f.rx * lat, f.y + 0.6 + 0.55, f.z + f.rz * lat));
          post.thinInstanceAdd(mtx);
          var mr = B.Matrix.RotationY(f.h).multiply(B.Matrix.Translation(f.x + f.rx * lat + Math.sin(f.h) * STEP, f.y + 1.6, f.z + f.rz * lat + Math.cos(f.h) * STEP));
          rail.thinInstanceAdd(mr);
        });
      }
      for (var s2 = sc.s1 + 20; s2 < sc.s2 - 10; s2 += 30) {
        var f2 = self.at(s2);
        pier.thinInstanceAdd(B.Matrix.Translation(f2.x, f2.y - 4.2, f2.z));
      }
      self.meshes.push(post, rail, pier);
    });
  };

  /** Red-white reflector posts along drops; a guard rail where the level asks for one. */
  Road.prototype.buildCliffEdges = function () {
    var self = this, k = this.kit;
    var postW = null, postR = null, rail = null;
    this.sections.forEach(function (sc) {
      if (sc.type !== 'cliff') return;
      if (!postW) { postW = k.box('edgePost', 0.18, 0.9, 0.18, 0, 0, 0, null, '#f4f4f4'); postR = k.box('edgeCap', 0.2, 0.22, 0.2, 0, 0, 0, null, '#e23b30', { emissive: '#601010' }); self.meshes.push(postW, postR); }
      for (var s = sc.s1; s <= sc.s2; s += sc.rail ? 4 : 12) {
        var f = self.at(s), lat = sc.side * (HALF + 0.9);
        var x = f.x + f.rx * lat, z = f.z + f.rz * lat;
        postW.thinInstanceAdd(B.Matrix.Translation(x, f.y + 0.45, z));
        postR.thinInstanceAdd(B.Matrix.Translation(x, f.y + 0.95, z));
        if (sc.rail) {
          if (!rail) { rail = k.box('guardRail', 0.12, 0.32, 4.05, 0, 0, 0, null, '#c9d0d8', { spec: 0.5 }); self.meshes.push(rail); }
          var f2 = self.at(s + 2);
          rail.thinInstanceAdd(B.Matrix.RotationY(f2.h).multiply(B.Matrix.Translation(f2.x + f2.rx * lat, f2.y + 0.7, f2.z + f2.rz * lat)));
        }
      }
      self.signPost(sc.s1 - 40, sc.side > 0 ? 'DROP >' : '< DROP', '#ffcc33', '#1d1d22');
    });
    [postW, postR, rail].forEach(function (m) { if (m) m.alwaysSelectAsActiveMesh = true; });
  };

  Road.prototype.buildObstacles = function () {
    var self = this, k = this.kit, L = this.level;
    this.obstacles = (L.obstacles || []).map(function (o) { return Object.assign({}, o, { hit: false }); });
    // roadworks: cones close the LEFT lane in narrow sections
    this.sections.forEach(function (sc) {
      if (sc.type !== 'narrow') return;
      for (var s = sc.s1; s <= sc.s2; s += 8) self.obstacles.push({ type: 'cone', s: s, lat: -0.4, hit: false });
      self.strip('closed', sc.s1, sc.s2, -HALF + 0.3, -0.2, 0.045, '#ff8a1f', 0.35);
    });
    var cone = null;
    this.obstacles.forEach(function (o) {
      var f = self.at(o.s);
      if (o.type === 'bump') {
        var b = k.box('bump', HALF * 2 - 0.4, 0.14, 0.9, 0, 0, 0, null, '#ffcc33');
        b.position.set(f.x, f.y + 0.07, f.z); b.rotation.y = f.h;
        for (var i = -3; i <= 3; i += 2) { var st = k.box('bumpStripe', 0.7, 0.15, 0.92, i * 0.6, 0, 0, b, '#1d1d22'); st.position.y = 0.005; }
        self.meshes.push(b);
        self.signPost(o.s - 45, 'BUMP', '#ffcc33', '#1d1d22');
      } else if (o.type === 'pothole') {
        o.lat = o.lane === 'L' ? LANE_L : LANE_R;
        var d = B.MeshBuilder.CreateDisc('pothole', { radius: 0.9, tessellation: 10 }, self.scene);
        d.rotation.x = Math.PI / 2; d.scaling.y = 0.7;
        d.position = self.world(o.s, o.lat, 0.06); d.rotation.y = f.h;
        d.material = k.mat('#24262b');
        self.meshes.push(d);
      } else if (o.type === 'cone') {
        if (!cone) { cone = B.MeshBuilder.CreateCylinder('cone', { diameterTop: 0.08, diameterBottom: 0.5, height: 0.75, tessellation: 8 }, self.scene); cone.material = k.mat('#ff7a1a'); cone.position.y = 0; self.meshes.push(cone); }
        var p = self.world(o.s, o.lat, 0.38);
        cone.thinInstanceAdd(B.Matrix.Translation(p.x, p.y, p.z));
      }
    });
    this.sections.forEach(function (sc) {
      var label = { mud: 'MUD', ice: 'ICE', rough: 'ROUGH', bridge: 'BRIDGE', narrow: 'ROADWORKS' }[sc.type];
      if (label) self.signPost(sc.s1 - 50, label, sc.type === 'narrow' ? '#ff8a1f' : '#ffcc33', '#1d1d22');
    });
    // curve warnings
    var P = this.pts;
    for (var i2 = 20; i2 < P.length - 20; i2 += 5) {
      var dh = P[i2 + 10].h - P[i2].h;
      if (Math.abs(dh) > 0.18 && !(this._curveSign && P[i2].s - this._curveSign < 120)) {
        this._curveSign = P[i2].s;
        this.signPost(P[i2].s - 40, dh > 0 ? 'BEND >' : '< BEND', '#ffcc33', '#1d1d22');
      }
    }
  };

  /** Road-side sign on a post, on the right verge, facing the driver. */
  Road.prototype.signPost = function (s, text, bg, fg) {
    if (s < 5) return;
    var f = this.at(s), k = this.kit;
    var n = k.node('signPost', null, f.x + f.rx * (HALF + 2.2), f.y, f.z + f.rz * (HALF + 2.2));
    n.rotation.y = f.h;                                // sign faces drivers coming along the road
    k.cyl('pole', 0.12, 2.8, 0, 1.4, 0, n, '#9aa3ad');
    var sg = k.sign('sign', text, 1.9, 0.9, bg, fg, n);
    sg.position.set(0, 2.8, -0.08);
    this.meshes.push(n);
  };

  /** Tree / cactus / rock prototypes, merged per kind so each kind draws in one call (thin instances). */
  Road.prototype.propKinds = function () {
    var k = this.kit, sc = this.scene, th = this.level.theme, kinds = [];
    var bark = k.surface('bark', 1, { env: 0.3, v: 2 });
    var leaf = function (hex) { return k.pbr(hex, { rough: 0.85, env: 0.5 }); };
    var lumpy = function (m, amt, seed) {            // roughen a sphere so foliage and rocks look natural
      var p = m.getVerticesData(B.VertexBuffer.PositionKind);
      for (var i = 0; i < p.length; i += 3) { var f = 1 + (hash(seed + i * 0.37) - 0.5) * amt; p[i] *= f; p[i + 1] *= f; p[i + 2] *= f; }
      m.updateVerticesData(B.VertexBuffer.PositionKind, p); var n = []; B.VertexData.ComputeNormals(p, m.getIndices(), n); m.updateVerticesData(B.VertexBuffer.NormalKind, n);
      return m;
    };
    var merge = function (parts, name) { var m = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true); m.name = name; m.alwaysSelectAsActiveMesh = true; m.isPickable = false; return m; };
    if (th === 'desert') {
      var c = [], body = B.MeshBuilder.CreateCapsule('cBody', { radius: 0.32, height: 3.6, tessellation: 10 }, sc); body.position.y = 1.8; body.material = leaf('#4f8a3c'); c.push(body);
      [[-1, 2.0, 1.0], [1, 2.4, 0.9]].forEach(function (a) {
        var h = B.MeshBuilder.CreateCapsule('cArmH', { radius: 0.2, height: 0.9, tessellation: 8 }, sc); h.rotation.z = Math.PI / 2; h.position.set(a[0] * 0.45, a[1], 0); h.material = body.material; c.push(h);
        var v = B.MeshBuilder.CreateCapsule('cArmV', { radius: 0.2, height: a[2] + 0.4, tessellation: 8 }, sc); v.position.set(a[0] * 0.8, a[1] + a[2] / 2, 0); v.material = body.material; c.push(v);
      });
      kinds.push(merge(c, 'cactus'));
      var bush = lumpy(B.MeshBuilder.CreateIcoSphere('bush', { radius: 0.8, subdivisions: 2 }, sc), 0.35, 3); bush.scaling.y = 0.6; bush.position.y = 0.35; bush.material = leaf('#8a8a4a');
      kinds.push(merge([bush], 'bush'));
    } else if (th === 'snow') {
      [0, 1].forEach(function (v) {
        var t = [], tr = B.MeshBuilder.CreateCylinder('trunk', { diameterTop: 0.22, diameterBottom: 0.38, height: 2.4, tessellation: 8 }, sc); tr.position.y = 1.2; tr.material = bark; t.push(tr);
        for (var i = 0; i < 4; i++) {
          var cone = B.MeshBuilder.CreateCylinder('pine', { diameterTop: 0.1, diameterBottom: 3.6 - i * 0.75, height: 2.4, tessellation: 9 }, sc);
          cone.position.y = 2.2 + i * 1.45; cone.material = leaf(v ? '#24533c' : '#2c5f45'); t.push(cone);
          var snow = B.MeshBuilder.CreateCylinder('snow', { diameterTop: 0.05, diameterBottom: (3.6 - i * 0.75) * 0.75, height: 1.0, tessellation: 9 }, sc);
          snow.position.y = 2.95 + i * 1.45; snow.material = k.pbr('#f3f7fb', { rough: 0.6 }); t.push(snow);
        }
        kinds.push(merge(t, 'pine' + v));
      });
    } else {
      [0, 1, 2].forEach(function (v) {
        var t = [], tr = B.MeshBuilder.CreateCylinder('trunk', { diameterTop: 0.28, diameterBottom: 0.5, height: 3.2, tessellation: 9 }, sc); tr.position.y = 1.6; tr.material = bark; t.push(tr);
        var greens = ['#3d7a2e', '#4a8a34', '#56953a', '#35702a'];
        for (var i = 0; i < 5; i++) {
          var r = 1.25 + hash(v * 9 + i) * 0.6;
          var blob = lumpy(B.MeshBuilder.CreateIcoSphere('leaves', { radius: r, subdivisions: 2 }, sc), 0.28, v * 31 + i * 7);
          var a = i / 5 * Math.PI * 2 + v;
          blob.position.set(i ? Math.cos(a) * 1.0 : 0, 4.0 + (i ? hash(v + i * 3) * 1.2 : 1.1), i ? Math.sin(a) * 1.0 : 0);
          blob.material = leaf(greens[(i + v) % greens.length]); t.push(blob);
        }
        kinds.push(merge(t, 'tree' + v));
      });
    }
    var rock = lumpy(B.MeshBuilder.CreateIcoSphere('rock', { radius: 1, subdivisions: 2 }, sc), 0.45, 77);
    rock.scaling.set(1.3, 0.7, 1); rock.material = k.surface(th === 'desert' ? 'rock' : 'cliff', 0.5, { env: 0.4, tint: th === 'desert' ? '#d8b48a' : undefined });
    kinds.push(merge([rock], 'rockProp'));
    return kinds;
  };

  Road.prototype.buildProps = function () {
    var P = this.pts, self = this, th = this.level.theme;
    if (th === 'city') { this.buildCity(); return; }
    var kinds = this.propKinds(), rockKind = kinds[kinds.length - 1], plants = kinds.slice(0, -1);
    var avoid = [[this.startS - 45, this.startS + 35], [this.zone.s1 - 45, this.zone.s2 + 45]];
    this.sections.forEach(function (s) { if (s.type === 'bridge') avoid.push([s.s1 - 10, s.s2 + 10]); });
    for (var i = 0; i < P.length; i += 3) {
      var p = P[i];
      if (avoid.some(function (r) { return p.s > r[0] && p.s < r[1]; })) continue;
      for (var side = -1; side <= 1; side += 2) {
        if (hash(i * 3.7 + side) < (th === 'desert' ? 0.7 : 0.3)) continue;
        if (p.cliff === side) continue;                        // nothing grows on the drop
        var lat = side * (HALF + (p.cliff ? 14 : 6) + hash(i * 1.3 + side * 9) * 40), f = this.at(p.s + hash(i + side) * 5);
        var x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = this.terrainHeight(Object.assign({}, f, { s: p.s, cliff: p.cliff, type: p.type }), lat) - 0.1;
        var sz = 0.75 + hash(i * 7.7 + side) * 0.7, rot = B.Matrix.RotationY(hash(i * 2.1) * 6.28);
        var isRock = hash(i * 5.3 + side) < 0.22;
        var kind = isRock ? rockKind : plants[Math.floor(hash(i * 1.9 + side) * plants.length)];
        kind.thinInstanceAdd(B.Matrix.Scaling(sz, sz * (isRock ? 0.8 : 1), sz).multiply(rot).multiply(B.Matrix.Translation(x, y, z)), false);
      }
    }
    kinds.forEach(function (m) { m.thinInstanceBufferUpdated('matrix'); m.thinInstanceRefreshBoundingInfo(false); self.meshes.push(m); });
    // distance markers to the hub
    for (var dm = 200; dm < this.length - 100; dm += 200) {
      var sl = this.zone.s1 - dm;
      if (sl > 60) this.signPost(sl, Math.round(dm) + ' m', '#2f9e44', '#ffffff');
    }
  };

  /** City: blocks of buildings with lit windows, pavements and street lights on both sides. */
  Road.prototype.buildCity = function () {
    var k = this.kit, sc = this.scene, P = this.pts, self = this;
    var winTex = k.tex('windows', 256, 512, function (ctx, w, h) {
      ctx.fillStyle = '#8f96a0'; ctx.fillRect(0, 0, w, h);
      for (var y = 10; y < h; y += 42) for (var x = 12; x < w; x += 40) {
        var lit = Math.random() < 0.3; ctx.fillStyle = lit ? '#f5e3a0' : '#2c3a4a'; ctx.fillRect(x, y, 26, 28);
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, 26, 4);
      }
    }, { mip: true });
    var colors = ['#c9b79c', '#a7b4c2', '#d6cbb8', '#9aa3ad', '#c2a48a', '#b8c0c8'];
    var blocks = colors.map(function (c, i) {
      var b = B.MeshBuilder.CreateBox('bld' + i, { size: 1 }, sc);
      var m = new B.PBRMaterial('bldM' + i, sc); m.albedoTexture = winTex; m.albedoColor = B.Color3.FromHexString(c).toLinearSpace(); m.metallic = 0.1; m.roughness = 0.6; m.environmentIntensity = 0.6;
      m.emissiveTexture = winTex; m.emissiveColor = new B.Color3(0.12, 0.1, 0.06);
      b.material = m; b.alwaysSelectAsActiveMesh = true; b.isPickable = false; return b;
    });
    var walk = k.surface('concrete', 1, { env: 0.4 });
    this.strip('pavementL', 0, this.length, -HALF - 4.5, -HALF, 0.12, null, 1, walk);
    this.strip('pavementR', 0, this.length, HALF, HALF + 4.5, 0.12, null, 1, walk);
    var pole = B.MeshBuilder.CreateCylinder('lampPole', { diameter: 0.16, height: 7, tessellation: 8 }, sc); pole.material = k.pbr('#3a3e47', { metal: 0.7, rough: 0.4 });
    var arm = B.MeshBuilder.CreateBox('lampArm', { width: 1.6, height: 0.1, depth: 0.1 }, sc); arm.material = pole.material;
    var bulb = B.MeshBuilder.CreateBox('lampBulb', { width: 0.6, height: 0.12, depth: 0.3 }, sc); bulb.material = k.pbr('#fff4cc', { emissive: '#ffe9a0', glow: 1.2 });
    var avoid = [[this.startS - 45, this.startS + 35], [this.zone.s1 - 45, this.zone.s2 + 45]];
    for (var s = 10; s < this.length; s += 14) {
      var f = this.at(s);
      [-1, 1].forEach(function (side) {
        if (avoid.some(function (r) { return s > r[0] && s < r[1]; }) && side > 0) return;
        var lat = side * (HALF + 12 + hash(s + side) * 6), w = 10 + hash(s * 3 + side) * 6, d = 12 + hash(s * 7) * 6, h = 8 + hash(s * 1.7 + side) * 26;
        var x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = f.y;
        blocks[Math.floor(hash(s * 2.3 + side) * blocks.length)].thinInstanceAdd(B.Matrix.Scaling(w, h, d).multiply(B.Matrix.RotationY(f.h)).multiply(B.Matrix.Translation(x, y + h / 2 - 0.5, z)), false);
      });
      if (Math.round(s / 14) % 2 === 0) [-1, 1].forEach(function (side) {
        var lx = f.x + f.rx * side * (HALF + 1.2), lz = f.z + f.rz * side * (HALF + 1.2);
        pole.thinInstanceAdd(B.Matrix.Translation(lx, f.y + 3.5, lz), false);
        var rot = B.Matrix.RotationY(f.h);
        arm.thinInstanceAdd(rot.multiply(B.Matrix.Translation(lx - f.rx * side * 0.75, f.y + 6.95, lz - f.rz * side * 0.75)), false);
        bulb.thinInstanceAdd(rot.multiply(B.Matrix.Translation(lx - f.rx * side * 1.4, f.y + 6.85, lz - f.rz * side * 1.4)), false);
      });
    }
    blocks.concat([pole, arm, bulb]).forEach(function (m) { m.thinInstanceBufferUpdated('matrix'); m.thinInstanceRefreshBoundingInfo(false); m.alwaysSelectAsActiveMesh = true; self.meshes.push(m); });
  };

  /** Warehouse beside the right verge at distance s, with a loading dock and pallets. */
  Road.prototype.buildWarehouse = function (s, label, roofCol) {
    var k = this.kit, f = this.at(s), sc = this.scene;
    var n = k.node('warehouse', null, f.x + f.rx * (HALF + 22), f.y, f.z + f.rz * (HALF + 22));
    n.rotation.y = f.h;                                 // local +x points away from the road, local -x faces it
    var parts = [];
    var add = function (m) { parts.push(m); return m; };
    add(k.box('whBase', 18, 0.6, 26, 0, 0.3, 0, n, '#9aa3ad'));
    add(k.box('whWallB', 0.4, 7, 24, 8.6, 4.1, 0, n, '#e7e2d4'));
    add(k.box('whWallS1', 17, 7, 0.4, 0, 4.1, 12, n, '#e7e2d4'));
    add(k.box('whWallS2', 17, 7, 0.4, 0, 4.1, -12, n, '#e7e2d4'));
    add(k.box('whFrontTop', 0.4, 2.2, 24, -8.4, 6.5, 0, n, '#e7e2d4'));
    add(k.box('whPillar', 0.4, 4.8, 2, -8.4, 3, 11, n, '#e7e2d4'));
    add(k.box('whPillar', 0.4, 4.8, 2, -8.4, 3, -11, n, '#e7e2d4'));
    add(k.box('whPillar', 0.4, 4.8, 1.2, -8.4, 3, 0, n, '#e7e2d4'));
    add(k.box('whRoof', 19, 0.5, 26, 0, 7.8, 0, n, roofCol));
    add(k.box('whDark', 0.2, 4.6, 20, -7.9, 3, 0, n, '#3a3e47'));     // dark interior
    add(k.box('dock', 3, 1.3, 22, -9.9, 0.65, 0, n, '#b3b8c0'));
    for (var i = -10; i <= 10; i += 2) add(k.box('dockStripe', 0.05, 1.3, 1, -11.42, 0.65, i, n, i % 4 === 0 ? '#ffcc00' : '#1d1d22'));
    // stacked decorative boxes inside
    for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) add(k.box('stock', 1.3, 1.3, 1.3, -4 + r * 1.6, 1.25 + (c % 2) * 1.32, -8 + c * 1.6, n, c % 2 ? '#c98c4b' : '#d79a5c'));
    for (var r2 = 0; r2 < 2; r2++) add(k.box('stock', 1.3, 1.3, 1.3, -4 + r2 * 1.6, 1.25, 7, n, '#d79a5c'));
    var sign = k.sign('whSign', label, 9, 1.6, '#ffffff', '#1d3b6f', n, { glow: '#8a8a8a' });
    sign.position.set(-8.65, 6.5, 0); sign.rotation.y = Math.PI / 2;
    var merged = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    if (merged) { merged.receiveShadows = true; this.meshes.push(merged); }     // vertices are already in world space
    this.meshes.push(n);
    return { node: n, s: s };
  };

  Road.prototype.buildZone = function () {
    var z = this.zone, k = this.kit, self = this;
    this.zoneMesh = this.strip('zone', z.s1, z.s2, 0.1, HALF - 0.2, 0.06, '#35d55a', 0.5);
    this.zoneMesh.material = k.mat('#35d55a', { alpha: 0.5, emissive: '#1f7a33' });
    // chevrons pointing into the bay
    for (var s = z.s1 - 30; s < z.s1; s += 7) {
      var f = this.at(s), c = k.box('chev', 1.6, 0.03, 0.35, 0, 0, 0, null, '#ffffff', { emissive: '#777777' });
      c.position = this.world(s, LANE_R, 0.06); c.rotation.y = f.h + 0.6;
      var c2 = k.box('chev', 1.6, 0.03, 0.35, 0, 0, 0, null, '#ffffff', { emissive: '#777777' });
      c2.position = this.world(s, LANE_R, 0.06); c2.rotation.y = f.h - 0.6;
      c.position.x -= Math.sin(f.h - 0.6) * 0; self.meshes.push(c, c2);
    }
    // a tall marker arch with a flag so the bay is visible from far away
    var fm = this.at(z.s2 + 1), n = k.node('zoneArch', null, fm.x, fm.y, fm.z); n.rotation.y = fm.h;
    k.cyl('archL', 0.25, 6, 0.1, 3, 0, n, '#35d55a');
    k.cyl('archR', 0.25, 6, HALF - 0.2, 3, 0, n, '#35d55a');
    var top = k.sign('archSign', 'DELIVER HERE', HALF - 0.1, 0.9, '#35d55a', '#ffffff', n, { glow: '#2a8a3a' });
    top.position.set(HALF / 2, 5.6, 0);
    this.zoneArch = n;
    this.meshes.push(n);
    // floating arrow above the bay
    var arrow = B.MeshBuilder.CreateCylinder('zoneArrow', { diameterTop: 0, diameterBottom: 1.4, height: 1.4, tessellation: 4 }, this.scene);
    arrow.rotation.x = Math.PI; arrow.material = k.mat('#ffd21f', { emissive: '#a07800' });
    arrow.position = this.world((z.s1 + z.s2) / 2, LANE_R, 6);
    this.zoneArrowY = arrow.position.y;
    this.zoneArrow = arrow;
    this.meshes.push(arrow);
  };

  Road.prototype.buildWeather = function () {
    var L = this.level, k = this.kit;
    if (L.weather !== 'rain' || k.lowFx) return;
    var ps = new B.ParticleSystem('rain', 1600, this.scene);
    ps.particleTexture = k.dotTex();
    ps.minSize = 0.05; ps.maxSize = 0.08; ps.minScaleY = 8; ps.maxScaleY = 12;
    ps.color1 = new B.Color4(0.8, 0.85, 1, 0.55); ps.color2 = new B.Color4(0.7, 0.8, 1, 0.4); ps.colorDead = new B.Color4(0.7, 0.8, 1, 0);
    ps.emitRate = 1400; ps.minLifeTime = 0.6; ps.maxLifeTime = 0.8;
    ps.direction1 = new B.Vector3(-0.5, -30, 0); ps.direction2 = new B.Vector3(0.5, -34, 0);
    ps.minEmitBox = new B.Vector3(-25, 16, -15); ps.maxEmitBox = new B.Vector3(25, 18, 35);
    ps.minEmitPower = 1; ps.maxEmitPower = 1;
    ps.billboardMode = B.ParticleSystem.BILLBOARDMODE_STRETCHED;
    this.rain = ps;
  };

  Road.prototype.update = function (t, follow) {
    if (this.zoneArrow) { this.zoneArrow.position.y = this.zoneArrowY + Math.sin(t * 3) * 0.4; this.zoneArrow.rotation.y = t * 1.5; }
    if (this.rain && follow) this.rain.emitter = follow;
  };

  Road.prototype.dispose = function () {
    if (this.rain) this.rain.dispose();
    this.meshes.forEach(function (m) { try { m.dispose(false, true); } catch (e) {} });
    this.meshes = [];
  };

  CT.Road3D = Road;
})(window.CT);
