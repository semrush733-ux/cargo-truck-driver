/* trucks3d.js — original 3D trucks built in code with physically based materials (no imported models):
   - classic: a cab-over cargo truck with a rounded cab, chrome grille, glass, flat bed with wooden floor and side
     boards, three axles with proper tyres and rims (inspired by the user's reference truck: orange cab, blue bed)
   - volt:    "Volt Ranger EV", an original faceted brushed-steel electric pickup with LED light strips
   Both face +Z with wheels on y = 0 and share one API, so every mode works with either truck. */
(function (CT) {
  'use strict';
  var B = window.BABYLON, V3 = B.Vector3;
  var BOX = 1.32;

  function merge(kit, parent, parts, name) {
    var m = B.Mesh.MergeMeshes(parts.filter(Boolean), true, true, undefined, false, true);
    if (m) { m.parent = parent; m.name = name || 'truckBody'; kit.shadow(m); m.receiveShadows = true; }
    return m;
  }

  /** Tyre with rounded sidewalls, a rim in the chosen finish, hub and lug nuts. */
  function wheel(kit, parent, x, y, z, r, w, look, list, side) {
    var pivot = kit.node('wheelPivot', parent, x, y, z);
    var sc = kit.scene, parts = [];
    var rubber = kit.pbr('#1b1c1f', { rough: 0.92 });
    var tread = B.MeshBuilder.CreateCylinder('tread', { diameter: r * 2, height: w * 0.86, tessellation: 28 }, sc);
    tread.rotation.z = Math.PI / 2; tread.material = rubber; parts.push(tread);
    [-1, 1].forEach(function (s) {
      var wall = B.MeshBuilder.CreateTorus('wall', { diameter: r * 1.62, thickness: r * 0.42, tessellation: 28 }, sc);
      wall.rotation.z = Math.PI / 2; wall.position.x = s * w * 0.32; wall.scaling.y = 0.55; wall.material = rubber; parts.push(wall);
    });
    var rimHex = look && look.rim ? look.rim[1] : '#c9ced6';
    var rimMat = kit.pbr(rimHex, { metal: 0.9, rough: 0.28 });
    var o = side;
    var dish = B.MeshBuilder.CreateCylinder('rim', { diameter: r * 1.22, height: 0.06, tessellation: 24 }, sc);
    dish.rotation.z = Math.PI / 2; dish.position.x = o * (w * 0.47); dish.material = rimMat; parts.push(dish);
    var ring = B.MeshBuilder.CreateTorus('rimLip', { diameter: r * 1.22, thickness: 0.06, tessellation: 24 }, sc);
    ring.rotation.z = Math.PI / 2; ring.position.x = o * (w * 0.49); ring.material = rimMat; parts.push(ring);
    var hub = B.MeshBuilder.CreateCylinder('hub', { diameter: r * 0.46, height: 0.1, tessellation: 16 }, sc);
    hub.rotation.z = Math.PI / 2; hub.position.x = o * (w * 0.52); hub.material = kit.pbr(look && look.hub ? look.hub : '#5a606b', { metal: 0.8, rough: 0.35 }); parts.push(hub);
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2, nut = B.MeshBuilder.CreateCylinder('nut', { diameter: 0.045, height: 0.05, tessellation: 6 }, sc);
      nut.rotation.z = Math.PI / 2; nut.position.set(o * (w * 0.55), Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32); nut.material = kit.pbr('#e3e6ea', { metal: 1, rough: 0.2 }); parts.push(nut);
    }
    var mesh = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    mesh.parent = pivot; kit.shadow(mesh);
    list.push({ pivot: pivot, r: r, side: side });
    return pivot;
  }

  function steeringWheel(kit, parent, x, y, z, tilt) {
    var n = kit.node('steer', parent, x, y, z);
    var t = B.MeshBuilder.CreateTorus('steerRing', { diameter: 0.42, thickness: 0.035, tessellation: 20 }, kit.scene);
    t.parent = n; t.rotation.x = Math.PI / 2 - tilt; t.material = kit.pbr('#1a1a1c', { rough: 0.5 });
    var c = B.MeshBuilder.CreateCylinder('steerCol', { diameter: 0.05, height: 0.4 }, kit.scene);
    c.parent = n; c.rotation.x = Math.PI / 2 - tilt; c.position.z = 0.15; c.position.y = -0.08; c.material = t.material;
    return n;
  }

  // ------------------------------------------------------------------ classic cargo truck
  function buildClassic(kit, look) {
    var paint = look.paint || { body: '#f8a619', dark: '#d9820b', light: '#ffc23d', id: 'orange' };
    var bedHex = !paint.id || paint.id === 'orange' ? '#2f6fd0' : paint.dark;
    var root = kit.node('truck', null, 0, 0, 0), body = kit.node('truckBodyNode', root, 0, 0, 0);
    var P = function (hex) { return kit.pbr(hex, { metal: 0.25, rough: 0.32, coat: 0.8 }); };
    var paintM = P(paint.body), bedM = P(bedHex);
    var black = kit.pbr('#1d1f23', { rough: 0.6 }), plastic = kit.pbr('#2a2d33', { rough: 0.75 });
    var chrome = kit.pbr('#e8ecf0', { metal: 1, rough: 0.12 });
    var glass = kit.pbr('#101b26', { metal: 0.35, rough: 0.05, env: 1.6 });      // tinted glass: dark with sky reflections
    var wood = kit.surface('planks', 2, { tint: '#c89a6a', env: 0.4 });
    var S = [], G = [];
    var add = function (m, mat) { if (mat) m.material = mat; S.push(m); return m; };
    var k = kit, sc = kit.scene;
    add(k.profile('cab', [[1.95, 1.0], [4.06, 1.0], [4.24, 1.18], [4.27, 2.05], [4.2, 2.32], [3.96, 3.2], [3.74, 3.4], [2.18, 3.4], [1.95, 3.18]], 2.48, null, null, { bevel: 0.08 }), paintM);
    add(k.profile('deflector', [[2.2, 3.38], [3.58, 3.38], [3.2, 3.78], [2.3, 3.84]], 2.24, null, null, { bevel: 0.05 }), P(paint.light || paint.body));
    var ws = add(B.MeshBuilder.CreateBox('windshield', { width: 2.12, height: 0.88, depth: 0.03 }, sc));
    ws.position.set(0, 2.75, 4.11); ws.rotation.x = -0.265; G.push(ws);
    [-1, 1].forEach(function (s) {
      var sw = B.MeshBuilder.CreateBox('sideWin', { width: 0.03, height: 0.74, depth: 1.25 }, sc);
      sw.position.set(s * 1.245, 2.8, 3.15); G.push(sw); S.push(sw);
      add(B.MeshBuilder.CreateBox('doorSeamF', { width: 0.012, height: 1.95, depth: 0.025 }, sc), black).position.set(s * 1.247, 2.0, 3.86);
      add(B.MeshBuilder.CreateBox('doorSeamB', { width: 0.012, height: 1.95, depth: 0.025 }, sc), black).position.set(s * 1.247, 2.0, 2.22);
      add(B.MeshBuilder.CreateBox('handle', { width: 0.03, height: 0.05, depth: 0.22 }, sc), chrome).position.set(s * 1.26, 2.15, 2.5);
      add(B.MeshBuilder.CreateBox('step', { width: 0.28, height: 0.05, depth: 0.55 }, sc), black).position.set(s * 1.2, 0.72, 3.0);
      add(B.MeshBuilder.CreateBox('mirArm', { width: 0.42, height: 0.04, depth: 0.04 }, sc), black).position.set(s * 1.44, 2.62, 3.9);
      add(k.profile('mirror', [[3.78, 2.22], [4.0, 2.22], [4.02, 2.95], [3.8, 2.97]], 0.12, null, null, { bevel: 0.02 }), black).position.x = s * 1.66;
      var f = add(B.MeshBuilder.CreateCylinder('fender', { diameter: 1.32, height: 0.5, arc: 0.5, tessellation: 20, enclosed: true }, sc), black);
      f.rotation.z = Math.PI / 2; f.position.set(s * 1.0, 0.56, 3.0);
    });
    G.forEach(function (g) { g.material = glass; });
    add(k.profile('grille', [[4.2, 1.2], [4.29, 1.2], [4.29, 2.02], [4.2, 2.02]], 1.5, null, null, { bevel: 0.02 }), black);
    for (var g = 0; g < 5; g++) add(B.MeshBuilder.CreateBox('bar', { width: 1.42, height: 0.045, depth: 0.04 }, sc), chrome).position.set(0, 1.32 + g * 0.16, 4.3);
    add(k.profile('bumper', [[3.98, 0.6], [4.36, 0.6], [4.44, 0.74], [4.44, 1.02], [4.0, 1.06]], 2.52, null, null, { bevel: 0.1 }), plastic);
    add(B.MeshBuilder.CreateBox('plate', { width: 0.52, height: 0.13, depth: 0.02 }, sc), kit.pbr('#f2f2f2', { rough: 0.4 })).position.set(0, 0.8, 4.45);
    [-0.48, 0.48].forEach(function (x) { add(B.MeshBuilder.CreateBox('rail', { width: 0.16, height: 0.28, depth: 8.1 }, sc), black).position.set(x, 0.88, -0.05); });
    var tank = add(B.MeshBuilder.CreateCylinder('tank', { diameter: 0.62, height: 1.25, tessellation: 22 }, sc), chrome); tank.rotation.x = Math.PI / 2; tank.position.set(-1.0, 0.9, 1.05);
    [-0.6, 0.6].forEach(function (z) { add(B.MeshBuilder.CreateBox('strap', { width: 0.66, height: 0.66, depth: 0.05 }, sc), black).position.set(-1.0, 0.9, 1.05 + z * 0.75); });
    add(B.MeshBuilder.CreateBox('battery', { width: 0.5, height: 0.5, depth: 0.9 }, sc), black).position.set(1.0, 0.88, 1.15);
    add(B.MeshBuilder.CreateCylinder('stack', { diameter: 0.15, height: 2.3, tessellation: 14 }, sc), chrome).position.set(1.08, 2.25, 1.78);
    add(B.MeshBuilder.CreateCylinder('stackTop', { diameter: 0.19, height: 0.25, tessellation: 14 }, sc), black).position.set(1.08, 3.45, 1.78);
    var floor = B.MeshBuilder.CreateBox('bedFloor', { width: 2.44, height: 0.12, depth: 5.9 }, sc); floor.position.set(0, 1.3, -1.15); floor.material = wood; S.push(floor);
    add(B.MeshBuilder.CreateBox('bedFrame', { width: 2.5, height: 0.18, depth: 5.95 }, sc), black).position.set(0, 1.17, -1.15);
    [-1, 1].forEach(function (s) {
      add(B.MeshBuilder.CreateBox('side', { width: 0.07, height: 0.62, depth: 5.9 }, sc), bedM).position.set(s * 1.21, 1.67, -1.15);
      for (var r = 0; r < 3; r++) add(B.MeshBuilder.CreateBox('rib', { width: 0.03, height: 0.05, depth: 5.86 }, sc), bedM).position.set(s * 1.25, 1.47 + r * 0.19, -1.15);
      for (var p = 0; p < 5; p++) add(B.MeshBuilder.CreateBox('post', { width: 0.09, height: 1.1, depth: 0.09 }, sc), black).position.set(s * 1.22, 2.3, 1.66 - p * 1.43);
      var rail = add(B.MeshBuilder.CreateCylinder('topRail', { diameter: 0.08, height: 5.9, tessellation: 10 }, sc), black); rail.rotation.x = Math.PI / 2; rail.position.set(s * 1.22, 2.84, -1.15);
      var mid = add(B.MeshBuilder.CreateCylinder('midRail', { diameter: 0.05, height: 5.9, tessellation: 8 }, sc), black); mid.rotation.x = Math.PI / 2; mid.position.set(s * 1.22, 2.3, -1.15);
      add(B.MeshBuilder.CreateBox('guard', { width: 0.6, height: 0.06, depth: 2.6 }, sc), black).position.set(s * 1.0, 1.14, -2.2);
      add(B.MeshBuilder.CreateBox('lampHouse', { width: 0.42, height: 0.24, depth: 0.12 }, sc), black).position.set(s * 0.95, 1.0, -4.18);
      add(B.MeshBuilder.CreateBox('reflector', { width: 0.1, height: 0.06, depth: 0.05 }, sc), kit.pbr('#ff8a1f', { rough: 0.3, emissive: '#401800' })).position.set(s * 1.24, 1.0, 0.2);
    });
    add(B.MeshBuilder.CreateBox('headboard', { width: 2.44, height: 1.25, depth: 0.08 }, sc), bedM).position.set(0, 2.0, 1.78);
    for (var hb = 0; hb < 5; hb++) add(B.MeshBuilder.CreateBox('hbBar', { width: 0.06, height: 1.2, depth: 0.1 }, sc), black).position.set(-0.96 + hb * 0.48, 2.0, 1.8);
    add(B.MeshBuilder.CreateBox('tailgate', { width: 2.44, height: 0.62, depth: 0.07 }, sc), bedM).position.set(0, 1.67, -4.1);
    add(B.MeshBuilder.CreateBox('rearBumper', { width: 2.3, height: 0.16, depth: 0.16 }, sc), black).position.set(0, 0.78, -4.15);
    var acc = look.acc || [];
    if (acc.indexOf('lightbar') >= 0) { add(B.MeshBuilder.CreateBox('lb', { width: 1.6, height: 0.14, depth: 0.2 }, sc), black).position.set(0, 3.9, 3.0); for (var l = 0; l < 4; l++) add(B.MeshBuilder.CreateBox('lbl', { width: 0.32, height: 0.1, depth: 0.05 }, sc), kit.pbr('#ffb300', { emissive: '#ff8a00', glow: 0.6 })).position.set(-0.6 + l * 0.4, 3.9, 3.11); }
    if (acc.indexOf('horns') >= 0) [-0.45, -0.2].forEach(function (x, i) { var h = add(B.MeshBuilder.CreateCylinder('horn', { diameterTop: 0.05, diameterBottom: 0.16, height: 0.7 - i * 0.15, tessellation: 12 }, sc), chrome); h.rotation.x = Math.PI / 2; h.position.set(x, 3.5, 2.5); });
    if (acc.indexOf('bullbar') >= 0) { [1.62, 1.12].forEach(function (y) { var t = add(B.MeshBuilder.CreateCylinder('bb', { diameter: 0.08, height: 2.2 }, sc), chrome); t.rotation.z = Math.PI / 2; t.position.set(0, y, 4.58); }); [-0.7, 0.7].forEach(function (x) { add(B.MeshBuilder.CreateCylinder('bbv', { diameter: 0.08, height: 0.75 }, sc), chrome).position.set(x, 1.3, 4.58); }); }
    if (acc.indexOf('flaps') >= 0) [-1, 1].forEach(function (s) { add(B.MeshBuilder.CreateBox('flap', { width: 0.5, height: 0.62, depth: 0.03 }, sc), black).position.set(s * 1.0, 0.6, -3.6); });
    if (acc.indexOf('stripe') >= 0) [-1, 1].forEach(function (s) { add(B.MeshBuilder.CreateBox('stripe', { width: 0.012, height: 0.14, depth: 2.2 }, sc), kit.pbr('#ffffff', { rough: 0.3, coat: 0.6 })).position.set(s * 1.25, 1.8, 3.05); });
    var mesh = merge(kit, body, S);

    var api = { root: root, body: body, mesh: mesh, wheels: [], lamps: { head: [], tail: [] }, kind: 'classic', name: 'Classic Hauler' };
    var seat = B.MeshBuilder.CreateBox('seat', { width: 0.55, height: 0.5, depth: 0.5 }, sc); seat.parent = body; seat.position.set(-0.55, 2.0, 2.75); seat.material = plastic;
    var dash = B.MeshBuilder.CreateBox('dash', { width: 2.2, height: 0.35, depth: 0.45 }, sc); dash.parent = body; dash.position.set(0, 2.38, 3.72); dash.material = plastic;
    steeringWheel(kit, body, -0.55, 2.55, 3.45, 0.5);
    api.driver = CT.Humans3D.make(kit, { pose: 'drive', shirt: '#2f6fd0', seed: 2 });
    api.driver.parent = body; api.driver.position.set(-0.55, 2.28, 2.85);
    var lamp = function (name, x, y, z, w, h, list) {
      var m = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: 0.05 }, sc); m.parent = body; m.position.set(x, y, z); list.push(m); return m;
    };
    [-0.95, 0.95].forEach(function (x) {
      var bez = B.MeshBuilder.CreateBox('bezel', { width: 0.42, height: 0.32, depth: 0.04 }, sc); bez.parent = body; bez.position.set(x, 1.55, 4.27); bez.material = chrome;
      lamp('head', x, 1.55, 4.3, 0.36, 0.26, api.lamps.head);
      lamp('tail', x, 1.0, -4.25, 0.32, 0.17, api.lamps.tail);
      var fog = B.MeshBuilder.CreateCylinder('fog', { diameter: 0.14, height: 0.03, tessellation: 14 }, sc); fog.parent = body; fog.rotation.x = Math.PI / 2; fog.position.set(x * 0.95, 0.84, 4.45); fog.material = kit.pbr('#fff6d6', { emissive: '#665a30' });
    });
    [-0.55, 0.55].forEach(function (x) { var mk = B.MeshBuilder.CreateBox('marker', { width: 0.14, height: 0.06, depth: 0.06 }, sc); mk.parent = body; mk.position.set(x, 3.8, 3.3); mk.material = kit.pbr('#ffb300', { emissive: '#a05a00' }); });
    if (acc.indexOf('beacon') >= 0) { api.beacon = B.MeshBuilder.CreateCylinder('beacon', { diameter: 0.3, height: 0.26, tessellation: 14 }, sc); api.beacon.parent = body; api.beacon.position.set(0.75, 3.98, 2.6); api.beacon.material = kit.pbr('#ff8a1f', { emissive: '#ff6a00', glow: 0.8 }); }
    var wl = look.wheel;
    [3.0, -1.6, -2.85].forEach(function (z) {
      wheel(kit, root, -1.04, 0.52, z, 0.52, 0.4, wl, api.wheels, -1);
      wheel(kit, root, 1.04, 0.52, z, 0.52, 0.4, wl, api.wheels, 1);
    });
    api.slots = [new V3(0, 1.36, 0.85), new V3(0, 1.36, -1.15), new V3(0, 1.36, -3.15)];
    api.bed = { y: 1.36, zMin: -4.05, zMax: 1.75, half: 1.15 };
    api.exhaust = new V3(1.08, 3.6, 1.78);
    api.cabCam = new V3(-0.35, 2.95, 4.32);              // driver's-eye view from the windscreen
    api.length = 8.6; api.width = 2.5; api.halfLen = 4.3;
    api.spec = { topKmh: 110, accel: 1.0, brake: 1.0, capacity: '3 loads · 6 t', electric: false };
    return api;
  }

  // ------------------------------------------------------------------ premium electric pickup (original design)
  function buildVolt(kit, look) {
    var root = kit.node('truck', null, 0, 0, 0), body = kit.node('truckBodyNode', root, 0, 0, 0);
    var sc = kit.scene, k = kit, S = [];
    var add = function (m, mat) { if (mat) m.material = mat; S.push(m); return m; };
    var steel = kit.pbr('#c3c8ce', { metal: 0.92, rough: 0.3 }), steelDk = kit.pbr('#8e959e', { metal: 0.9, rough: 0.38 });
    var clad = kit.pbr('#1c1e22', { rough: 0.7 }), glass = kit.pbr('#0b1219', { metal: 0.35, rough: 0.04, env: 1.7 });
    var blue = kit.pbr('#4fc3ff', { emissive: '#2aa8ff', glow: 1.2 });
    add(k.profile('vBody', [[-3.55, 0.48], [3.4, 0.48], [3.58, 0.82], [3.5, 1.2], [2.4, 1.42], [-3.55, 1.42]], 2.3, null, null, { bevel: 0.07 }), steel);
    add(k.profile('vCabin', [[-0.5, 1.4], [2.35, 1.4], [1.25, 2.38], [-0.15, 2.42], [-0.5, 2.05]], 2.14, null, null, { bevel: 0.1 }), steelDk);
    var ws = add(B.MeshBuilder.CreateBox('vWind', { width: 1.9, height: 1.42, depth: 0.03 }, sc), glass); ws.position.set(0, 1.9, 1.82); ws.rotation.x = -0.84;
    var rw = add(B.MeshBuilder.CreateBox('vRear', { width: 1.8, height: 0.55, depth: 0.03 }, sc), glass); rw.position.set(0, 2.2, -0.36); rw.rotation.x = 0.82;
    [-1, 1].forEach(function (s) {
      add(B.MeshBuilder.CreateBox('vSideWin', { width: 0.03, height: 0.55, depth: 1.75 }, sc), glass).position.set(s * 1.075, 1.85, 0.85);
      add(B.MeshBuilder.CreateBox('vBedSide', { width: 0.1, height: 0.45, depth: 3.9 }, sc), steel).position.set(s * 1.1, 1.62, -1.6);
      add(B.MeshBuilder.CreateBox('vTrim', { width: 0.03, height: 0.07, depth: 6.8 }, sc), blue).position.set(s * 1.16, 0.62, 0);
      [2.15, -2.35].forEach(function (z) { var a = add(B.MeshBuilder.CreateCylinder('vArch', { diameter: 1.3, height: 0.3, arc: 0.5, tessellation: 16, enclosed: true }, sc), clad); a.rotation.z = Math.PI / 2; a.position.set(s * 1.05, 0.52, z); });
      add(B.MeshBuilder.CreateBox('vMirror', { width: 0.24, height: 0.14, depth: 0.12 }, sc), clad).position.set(s * 1.22, 1.75, 1.8);
      add(B.MeshBuilder.CreateBox('vHandle', { width: 0.02, height: 0.03, depth: 0.2 }, sc), clad).position.set(s * 1.16, 1.3, 0.9);
    });
    add(B.MeshBuilder.CreateBox('vBedFloor', { width: 2.1, height: 0.08, depth: 3.9 }, sc), kit.pbr('#2a2d33', { rough: 0.85 })).position.set(0, 1.36, -1.6);
    add(B.MeshBuilder.CreateBox('vGate', { width: 2.3, height: 0.45, depth: 0.08 }, sc), steel).position.set(0, 1.62, -3.55);
    add(B.MeshBuilder.CreateBox('vSkid', { width: 1.9, height: 0.12, depth: 6.6 }, sc), clad).position.set(0, 0.42, 0);
    var mesh = merge(kit, body, S);
    var api = { root: root, body: body, mesh: mesh, wheels: [], lamps: { head: [], tail: [] }, kind: 'volt', name: 'Volt Ranger EV' };
    var seat = B.MeshBuilder.CreateBox('seat', { width: 0.55, height: 0.45, depth: 0.5 }, sc); seat.parent = body; seat.position.set(-0.5, 1.3, 0.5); seat.material = clad;
    var dash = B.MeshBuilder.CreateBox('dash', { width: 1.9, height: 0.22, depth: 0.5 }, sc); dash.parent = body; dash.position.set(0, 1.86, 1.55); dash.material = clad;
    var scr = B.MeshBuilder.CreateBox('screen', { width: 0.45, height: 0.28, depth: 0.03 }, sc); scr.parent = body; scr.position.set(0.15, 2.02, 1.38); scr.rotation.x = -0.3; scr.material = kit.pbr('#4fc3ff', { emissive: '#1a8fe0', glow: 0.8 });
    steeringWheel(kit, body, -0.5, 1.98, 1.28, 0.55);
    api.driver = CT.Humans3D.make(kit, { pose: 'drive', shirt: '#1d1f24', seed: 4 });
    api.driver.parent = body; api.driver.position.set(-0.5, 1.5, 0.6);
    var strip = function (z, y, list) { var m = B.MeshBuilder.CreateBox('led', { width: 2.1, height: 0.06, depth: 0.04 }, sc); m.parent = body; m.position.set(0, y, z); list.push(m); return m; };
    strip(3.56, 1.12, api.lamps.head);
    strip(-3.6, 1.36, api.lamps.tail);
    var wl = look.wheel || { rim: ['#ffffff', '#3a3e47', '#22252c'], hub: '#9aa3b2' };
    [2.15, -2.35].forEach(function (z) {
      wheel(kit, root, -1.04, 0.5, z, 0.5, 0.38, wl, api.wheels, -1);
      wheel(kit, root, 1.04, 0.5, z, 0.5, 0.38, wl, api.wheels, 1);
    });
    api.slots = [new V3(0, 1.4, -0.3), new V3(0, 1.4, -1.65), new V3(0, 1.4, -3.0)];
    api.bed = { y: 1.4, zMin: -3.5, zMax: 0.3, half: 1.0 };
    api.exhaust = null;
    api.cabCam = new V3(-0.35, 1.98, 2.55);
    api.length = 7.1; api.width = 2.35; api.halfLen = 3.6;
    api.spec = { topKmh: 135, accel: 1.35, brake: 1.15, capacity: '3 loads · 2.5 t', electric: true };
    return api;
  }

  function build(kit, kind) {
    var look = { paint: CT.Garage.paint(CT.Storage.getPaint()), wheel: CT.Garage.wheel(CT.Storage.getWheel()), acc: CT.Storage.getEquipped() };
    var t = kind === 'volt' ? buildVolt(kit, look) : buildClassic(kit, look);
    var headOff = kind === 'volt' ? kit.pbr('#dff2ff', { emissive: '#7fc8ff', glow: 0.6 }) : kit.pbr('#f4f1e6', { rough: 0.1, metal: 0.2 });
    var headOn = kit.pbr('#ffffff', { emissive: '#fff6d8', glow: 2.2 });
    var tailOff = kit.pbr('#7a0d0d', { rough: 0.2, emissive: '#300000' }), tailOn = kit.pbr('#ff2a1a', { emissive: '#ff2010', glow: 2 });
    t.spin = 0; t.headOn = null; t.brakeOn = null;
    t.setHead = function (on) { if (t.headOn === on) return; t.headOn = on; t.lamps.head.forEach(function (m) { m.material = on ? headOn : headOff; }); };
    t.setBrake = function (on) { if (t.brakeOn === on) return; t.brakeOn = on; t.lamps.tail.forEach(function (m) { m.material = on ? tailOn : tailOff; }); };
    t.roll = function (dist, steer) {
      t.spin += dist;
      t.wheels.forEach(function (w, i) { w.pivot.rotation.x = t.spin / w.r; if (i < 2) w.pivot.rotation.y = steer || 0; });
      if (t.beacon) t.beacon.rotation.y += 0.25;
    };
    t.dispose = function () { t.root.dispose(false, false); };
    t.setHead(false); t.setBrake(false);
    return t;
  }

  CT.Trucks3D = { build: build, BOX: BOX };
})(window.CT);
