/* trucks3d.js — original low-poly 3D trucks built from primitives (no imported models):
   - classic: the orange cargo truck from the 2D game (cab + flat bed with side rails, 3 axles)
   - volt:    the premium electric pickup "Volt Ranger" (faceted brushed-steel body, LED light strips)
   Both face +Z, wheels touch y = 0, and expose the same API so every mode works with either truck. */
(function (CT) {
  'use strict';
  var B = window.BABYLON;

  var BOX = 1.32;      // cargo box edge (m)

  function finish(kit, body, statics) {
    // merge every static part into one mesh (several materials) to save draw calls on phones
    var merged = B.Mesh.MergeMeshes(statics, true, true, undefined, false, true);
    if (merged) { merged.parent = body; merged.name = 'truckBody'; kit.shadow(merged); }
    return merged;
  }

  function wheel(kit, parent, x, y, z, r, w, look, list, side) {
    var pivot = kit.node('wheelPivot', parent, x, y, z);
    var tyre = kit.cyl('tyre', r * 2, w, 0, 0, 0, pivot, '#1d1f24', null, 18);
    tyre.rotation.z = Math.PI / 2;
    var rimC = look && look.rim ? look.rim[1] : '#d3d6dc';
    var rim = kit.cyl('rim', r * 1.18, w + 0.04, 0, 0, 0, pivot, rimC, { spec: 0.5 }, 12);
    rim.rotation.z = Math.PI / 2;
    var hub = kit.cyl('hub', r * 0.42, w + 0.08, 0, 0, 0, pivot, look && look.hub ? look.hub : '#555c69', null, 8);
    hub.rotation.z = Math.PI / 2;
    // spokes so the rotation is visible
    for (var i = 0; i < 3; i++) {
      var sp = kit.box('spoke', w + 0.06, r * 0.14, r * 1.1, 0, 0, 0, pivot, look && look.rim ? look.rim[2] : '#a3a8b2');
      sp.rotation.x = i * Math.PI / 3;
    }
    kit.shadow(tyre);
    list.push({ pivot: pivot, r: r, side: side });
    return pivot;
  }

  /** Low-poly bunny driver (the game's mascot) sitting in the cab. */
  function driver(kit, parent, x, y, z) {
    var n = kit.node('driver', parent, x, y, z);
    kit.box('torso', 0.42, 0.5, 0.32, 0, 0, 0, n, '#2f7fe0');
    var head = B.MeshBuilder.CreateSphere('head', { diameter: 0.42, segments: 6 }, kit.scene);
    head.parent = n; head.position.set(0, 0.42, 0.02); head.material = kit.mat('#f4f4f6');
    var e1 = kit.box('ear', 0.09, 0.42, 0.06, -0.09, 0.78, -0.02, n, '#f4f4f6'); e1.rotation.z = 0.15;
    var e2 = kit.box('ear', 0.09, 0.42, 0.06, 0.09, 0.78, -0.02, n, '#f4f4f6'); e2.rotation.z = -0.15;
    kit.box('earIn', 0.04, 0.3, 0.02, -0.09, 0.78, 0.015, n, '#ff9fb2').rotation.z = 0.15;
    kit.box('earIn', 0.04, 0.3, 0.02, 0.09, 0.78, 0.015, n, '#ff9fb2').rotation.z = -0.15;
    kit.box('eye', 0.06, 0.07, 0.02, -0.08, 0.46, 0.21, n, '#1d1d22');
    kit.box('eye', 0.06, 0.07, 0.02, 0.08, 0.46, 0.21, n, '#1d1d22');
    kit.box('cap', 0.44, 0.1, 0.46, 0, 0.6, 0, n, '#ffc21a');
    return n;
  }

  function lights(kit, parent, list, x, y, z, w, h, color, emissive) {
    var m = kit.box('lamp', w, h, 0.06, x, y, z, parent, color, { emissive: emissive || '#000000' });
    list.push(m);
    return m;
  }

  // ------------------------------------------------------------------ classic cargo truck
  function buildClassic(kit, look) {
    var paint = look.paint || { body: '#f8a619', dark: '#d9820b', light: '#ffc23d' };
    var bedCol = paint.id === 'orange' || !paint.id ? '#2f6fd0' : paint.dark;
    var root = kit.node('truck', null, 0, 0, 0);
    var body = kit.node('truckBodyNode', root, 0, 0, 0);       // suspension: pitch / roll / bounce
    var S = [];            // static meshes to merge
    var add = function (m) { m.parent = null; S.push(m); return m; };
    var k = kit;
    // chassis + bumpers
    add(k.box('chassis', 1.9, 0.32, 8.0, 0, 0.92, 0, null, '#2a2d34'));
    add(k.box('bumperF', 2.5, 0.38, 0.3, 0, 0.78, 4.18, null, '#2a2d34'));
    add(k.box('bumperR', 2.3, 0.22, 0.2, 0, 0.86, -4.1, null, '#2a2d34'));
    // cab
    add(k.box('cabLow', 2.46, 1.1, 2.3, 0, 1.62, 3.0, null, paint.body));
    add(k.box('cabUp', 2.42, 1.15, 2.05, 0, 2.72, 2.88, null, paint.body));
    add(k.box('cabRoof', 2.3, 0.14, 1.9, 0, 3.36, 2.85, null, paint.light));
    add(k.box('visor', 2.2, 0.4, 0.5, 0, 3.6, 2.6, null, paint.dark));
    add(k.box('glassF', 2.2, 0.95, 0.06, 0, 2.78, 3.92, null, '#1d4a7a', { spec: 0.6, alpha: 0.35 }));
    add(k.box('glassL', 0.06, 0.8, 1.2, -1.22, 2.8, 3.1, null, '#2a5f96', { spec: 0.6, alpha: 0.35 }));
    add(k.box('glassR', 0.06, 0.8, 1.2, 1.22, 2.8, 3.1, null, '#2a5f96', { spec: 0.6, alpha: 0.35 }));
    add(k.box('grille', 1.5, 0.62, 0.08, 0, 1.55, 4.16, null, '#1d1f24'));
    for (var g = 0; g < 4; g++) add(k.box('slat', 1.36, 0.06, 0.1, 0, 1.33 + g * 0.15, 4.2, null, '#5a5f6b'));
    add(k.box('step', 0.5, 0.08, 0.6, -1.25, 0.9, 2.4, null, '#2a2d34'));
    add(k.box('step', 0.5, 0.08, 0.6, 1.25, 0.9, 2.4, null, '#2a2d34'));
    add(k.box('mirrorArmL', 0.4, 0.06, 0.06, -1.42, 2.7, 3.7, null, '#1d1f24'));
    add(k.box('mirrorArmR', 0.4, 0.06, 0.06, 1.42, 2.7, 3.7, null, '#1d1f24'));
    add(k.box('mirrorL', 0.12, 0.55, 0.3, -1.62, 2.6, 3.7, null, '#1d1f24'));
    add(k.box('mirrorR', 0.12, 0.55, 0.3, 1.62, 2.6, 3.7, null, '#1d1f24'));
    add(k.box('arch', 2.56, 0.18, 1.4, 0, 1.25, 3.0, null, '#2a2d34'));
    // fuel tank + exhaust stack
    var tank = add(k.cyl('tank', 0.62, 1.3, -1.05, 0.95, 1.25, null, '#3a3e47', { spec: 0.4 })); tank.rotation.x = Math.PI / 2;
    add(k.cyl('stack', 0.16, 2.2, 1.1, 2.3, 1.72, null, '#8a909c', { spec: 0.5 }));
    // bed: floor, side boards, rails
    add(k.box('bedFloor', 2.44, 0.14, 5.9, 0, 1.3, -1.15, null, '#6b4a2b'));
    add(k.box('bedSideL', 0.08, 0.6, 5.9, -1.2, 1.66, -1.15, null, bedCol));
    add(k.box('bedSideR', 0.08, 0.6, 5.9, 1.2, 1.66, -1.15, null, bedCol));
    add(k.box('bedFront', 2.44, 1.2, 0.1, 0, 1.96, 1.78, null, bedCol));
    add(k.box('tailgate', 2.44, 0.6, 0.08, 0, 1.66, -4.08, null, bedCol));
    for (var p = 0; p < 5; p++) {
      var zz = 1.7 - p * 1.43;
      add(k.box('post', 0.1, 1.05, 0.1, -1.2, 2.3, zz, null, '#3a3e47'));
      add(k.box('post', 0.1, 1.05, 0.1, 1.2, 2.3, zz, null, '#3a3e47'));
    }
    add(k.box('railL', 0.1, 0.1, 5.9, -1.2, 2.82, -1.15, null, '#3a3e47'));
    add(k.box('railR', 0.1, 0.1, 5.9, 1.2, 2.82, -1.15, null, '#3a3e47'));
    add(k.box('railM', 0.06, 0.06, 5.9, -1.2, 2.3, -1.15, null, '#3a3e47'));
    add(k.box('railM', 0.06, 0.06, 5.9, 1.2, 2.3, -1.15, null, '#3a3e47'));
    // mud guards
    [[-1.6], [-2.85]].forEach(function (a) { add(k.box('guard', 2.5, 0.08, 1.2, 0, 1.18, a[0] - 0.62, null, '#2a2d34')); });
    // accessories (from the garage)
    var acc = look.acc || [];
    if (acc.indexOf('lightbar') >= 0) for (var l = 0; l < 4; l++) add(k.box('lb', 0.34, 0.16, 0.16, -0.6 + l * 0.4, 3.52, 3.55, null, '#ffb300', { emissive: '#9a5a00' }));
    if (acc.indexOf('horns') >= 0) { var h1 = add(k.cyl('horn', 0.14, 0.8, -0.5, 3.52, 2.4, null, '#e6ebf2', { spec: 0.8 })); h1.rotation.x = Math.PI / 2; var h2 = add(k.cyl('horn', 0.14, 0.6, -0.25, 3.52, 2.4, null, '#e6ebf2', { spec: 0.8 })); h2.rotation.x = Math.PI / 2; }
    if (acc.indexOf('bullbar') >= 0) { add(k.box('bb', 2.2, 0.1, 0.1, 0, 1.6, 4.45, null, '#c9d4e2', { spec: 0.6 })); add(k.box('bb', 2.2, 0.1, 0.1, 0, 1.05, 4.45, null, '#c9d4e2', { spec: 0.6 })); add(k.box('bb', 0.1, 0.65, 0.1, -0.7, 1.32, 4.45, null, '#c9d4e2')); add(k.box('bb', 0.1, 0.65, 0.1, 0.7, 1.32, 4.45, null, '#c9d4e2')); }
    if (acc.indexOf('flaps') >= 0) { add(k.box('flap', 0.5, 0.6, 0.04, -1.05, 0.62, -3.6, null, '#111214')); add(k.box('flap', 0.5, 0.6, 0.04, 1.05, 0.62, -3.6, null, '#111214')); }
    if (acc.indexOf('stripe') >= 0) { add(k.box('stripe', 0.03, 0.18, 2.2, -1.245, 1.9, 3.0, null, '#ffffff')); add(k.box('stripe', 0.03, 0.18, 2.2, 1.245, 1.9, 3.0, null, '#ffffff')); }
    var merged = finish(kit, body, S);

    var api = { root: root, body: body, mesh: merged, wheels: [], lamps: { head: [], tail: [] }, kind: 'classic', name: 'Classic Hauler' };
    api.driver = driver(kit, body, -0.55, 2.35, 3.0);
    // lamps (separate meshes: they glow when switched on)
    api.lamps.head.push(lights(kit, body, [], -0.95, 1.55, 4.2, 0.36, 0.26, '#fff7d6'));
    api.lamps.head.push(lights(kit, body, [], 0.95, 1.55, 4.2, 0.36, 0.26, '#fff7d6'));
    api.lamps.tail.push(lights(kit, body, [], -1.0, 1.0, -4.22, 0.32, 0.2, '#7a1010'));
    api.lamps.tail.push(lights(kit, body, [], 1.0, 1.0, -4.22, 0.32, 0.2, '#7a1010'));
    if (acc.indexOf('beacon') >= 0) {
      api.beacon = kit.cyl('beacon', 0.3, 0.28, 0.7, 3.55, 2.3, body, '#ff8a1f', { emissive: '#b04a00' }, 10);
    }
    var wl = look.wheel;
    [3.0, -1.6, -2.85].forEach(function (z) {
      wheel(kit, root, -1.08, 0.52, z, 0.52, 0.42, wl, api.wheels, -1);
      wheel(kit, root, 1.08, 0.52, z, 0.52, 0.42, wl, api.wheels, 1);
    });
    api.slots = [new B.Vector3(0, 1.37, 0.85), new B.Vector3(0, 1.37, -1.15), new B.Vector3(0, 1.37, -3.15)];
    api.bed = { y: 1.37, zMin: -4.05, zMax: 1.75, half: 1.15 };
    api.exhaust = new B.Vector3(1.1, 3.45, 1.72);
    kit.box('dash', 2.2, 0.35, 0.45, 0, 2.38, 3.62, body, '#1d1f24');
    api.cabCam = new B.Vector3(-0.55, 2.95, 3.25);
    api.length = 8.4; api.width = 2.5; api.halfLen = 4.25;
    api.spec = { topKmh: 110, accel: 1.0, brake: 1.0, capacity: '3 loads · 6 t', electric: false };
    return api;
  }

  // ------------------------------------------------------------------ premium electric pickup (original design)
  function buildVolt(kit, look) {
    var steel = '#b9c0c8', steelDk = '#8b939d', clad = '#24272d';
    var root = kit.node('truck', null, 0, 0, 0);
    var body = kit.node('truckBodyNode', root, 0, 0, 0);
    var S = [];
    var add = function (m) { m.parent = null; S.push(m); return m; };
    var k = kit, sp = { spec: 0.55 };
    add(k.box('skid', 2.0, 0.3, 6.8, 0, 0.62, 0, null, clad));
    add(k.box('lower', 2.3, 0.62, 6.9, 0, 1.0, 0, null, steel, sp));
    // faceted nose
    var nose = add(k.box('nose', 2.3, 0.5, 1.4, 0, 1.32, 2.95, null, steel, sp)); nose.rotation.x = 0.22;
    // cabin: sloped windshield, flat roof, sloped rear glass
    add(k.box('cabSide', 2.26, 0.75, 2.3, 0, 1.68, 0.95, null, steel, sp));
    var ws = add(k.box('wind', 2.1, 0.06, 1.55, 0, 2.08, 2.2, null, '#0f1d2c', { spec: 0.9, alpha: 0.4 })); ws.rotation.x = 0.62;
    add(k.box('roof', 2.1, 0.12, 1.5, 0, 2.5, 0.85, null, steelDk, sp));
    var rw = add(k.box('rearGlass', 2.1, 0.06, 0.9, 0, 2.22, -0.1, null, '#0f1d2c', { spec: 0.9, alpha: 0.4 })); rw.rotation.x = -0.75;
    add(k.box('sideGlassL', 0.05, 0.5, 1.7, -1.13, 2.15, 0.9, null, '#0f1d2c', { spec: 0.9, alpha: 0.4 }));
    add(k.box('sideGlassR', 0.05, 0.5, 1.7, 1.13, 2.15, 0.9, null, '#0f1d2c', { spec: 0.9, alpha: 0.4 }));
    // open bed
    add(k.box('bedFloor', 2.1, 0.1, 4.55, 0, 1.33, -1.95, null, '#30343b'));
    add(k.box('bedSideL', 0.1, 0.55, 4.6, -1.12, 1.6, -1.95, null, steel, sp));
    add(k.box('bedSideR', 0.1, 0.55, 4.6, 1.12, 1.6, -1.95, null, steel, sp));
    add(k.box('bedGate', 2.3, 0.55, 0.1, 0, 1.6, -4.25, null, steel, sp));
    // wheel arches (dark cladding) + black lower trim
    [2.15, -2.35].forEach(function (z) { add(k.box('arch', 2.42, 0.5, 1.45, 0, 1.05, z, null, clad)); });
    add(k.box('trimL', 0.04, 0.12, 6.9, -1.16, 0.74, 0, null, '#4fc3ff', { emissive: '#1a7fb8' }));
    add(k.box('trimR', 0.04, 0.12, 6.9, 1.16, 0.74, 0, null, '#4fc3ff', { emissive: '#1a7fb8' }));
    add(k.box('mirrorL', 0.25, 0.18, 0.12, -1.25, 1.95, 1.85, null, clad));
    add(k.box('mirrorR', 0.25, 0.18, 0.12, 1.25, 1.95, 1.85, null, clad));
    var merged = finish(kit, body, S);
    var api = { root: root, body: body, mesh: merged, wheels: [], lamps: { head: [], tail: [] }, kind: 'volt', name: 'Volt Ranger EV' };
    api.driver = driver(kit, body, -0.5, 1.72, 0.8);
    // full-width LED strips front and rear
    api.lamps.head.push(lights(kit, body, [], 0, 1.5, 3.62, 2.1, 0.07, '#e8f6ff', '#9fd8ff'));
    api.lamps.tail.push(lights(kit, body, [], 0, 1.62, -4.31, 2.1, 0.07, '#8a1414', '#5a0000'));
    var wl = look.wheel || { rim: ['#ffffff', '#3a3e47', '#22252c'], hub: '#9aa3b2' };
    [2.15, -2.35].forEach(function (z) {
      wheel(kit, root, -1.06, 0.5, z, 0.5, 0.4, wl, api.wheels, -1);
      wheel(kit, root, 1.06, 0.5, z, 0.5, 0.4, wl, api.wheels, 1);
    });
    api.slots = [new B.Vector3(0, 1.39, -0.45), new B.Vector3(0, 1.39, -1.95), new B.Vector3(0, 1.39, -3.45)];
    api.bed = { y: 1.39, zMin: -4.2, zMax: 0.3, half: 1.05 };
    api.exhaust = null;                                   // electric: no exhaust pipe
    kit.box('dash', 2.0, 0.28, 0.5, 0, 1.98, 1.7, body, '#16181d');
    kit.box('screen', 0.5, 0.3, 0.04, 0.1, 2.15, 1.5, body, '#4fc3ff', { emissive: '#2a9be0' });
    api.cabCam = new B.Vector3(-0.5, 2.32, 0.95);
    api.length = 7.0; api.width = 2.35; api.halfLen = 3.6;
    api.spec = { topKmh: 135, accel: 1.35, brake: 1.15, capacity: '3 loads · 2.5 t', electric: true };
    return api;
  }

  /** Builds the truck the player selected (or a given kind) with its garage paint, wheels and accessories. */
  function build(kit, kind) {
    var look = {
      paint: CT.Garage.paint(CT.Storage.getPaint()),
      wheel: CT.Garage.wheel(CT.Storage.getWheel()),
      acc: CT.Storage.getEquipped()
    };
    var t = kind === 'volt' ? buildVolt(kit, look) : buildClassic(kit, look);
    t.spin = 0;
    t.headOn = false;
    t.setHead = function (on) {
      if (t.headOn === on) return; t.headOn = on;
      t.lamps.head.forEach(function (m) { m.material = kit.mat(on ? '#ffffff' : (kind === 'volt' ? '#e8f6ff' : '#fff7d6'), { emissive: on ? '#fff3c0' : (kind === 'volt' ? '#9fd8ff' : '#000000') }); });
    };
    t.setBrake = function (on) {
      if (t.brakeOn === on) return; t.brakeOn = on;
      t.lamps.tail.forEach(function (m) { m.material = kit.mat(on ? '#ff3b30' : '#8a1414', { emissive: on ? '#ff2a1a' : '#3a0000' }); });
    };
    /** Rolls the wheels for a distance travelled (m) and steers the front pair. */
    t.roll = function (dist, steer) {
      t.spin += dist;
      t.wheels.forEach(function (w, i) {
        w.pivot.rotation.x = t.spin / w.r;
        if (i < 2) w.pivot.rotation.y = steer || 0;
      });
      if (t.beacon) t.beacon.rotation.y += 0.25;
    };
    t.dispose = function () { t.root.dispose(false, false); };
    t.setBrake(false);
    return t;
  }

  CT.Trucks3D = { build: build, BOX: BOX, SPECS: { classic: { topKmh: 110, accel: 1.0, brake: 1.0, capacity: '3 loads · 6 t' }, volt: { topKmh: 135, accel: 1.35, brake: 1.15, capacity: '3 loads · 2.5 t' } } };
})(window.CT);
