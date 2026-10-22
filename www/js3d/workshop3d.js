/* workshop3d.js — cinematic engine-upgrade workshop. The purchase is charged and saved BEFORE the show starts
   (so an interruption can never lose or duplicate it); the scene then plays a fixed state machine:
   PURCHASE_CONFIRMED → WORKSHOP_ENTERING → SHUTTER_CLOSING → ENGINE_UPGRADING → SHUTTER_OPENING → TRUCK_EXITING → UPGRADE_COMPLETE
   Each state runs once. The player's own truck (model, paint, wheels, accessories) drives in and back out. */
(function (CT) {
  'use strict';
  var B = window.BABYLON, V3 = B.Vector3;
  var STATES = ['PURCHASE_CONFIRMED', 'WORKSHOP_ENTERING', 'SHUTTER_CLOSING', 'ENGINE_UPGRADING', 'SHUTTER_OPENING', 'TRUCK_EXITING', 'UPGRADE_COMPLETE'];
  var CONFIG = { upgradeMin: 3, upgradeMax: 5, shutter: 1.0, enterDrive: 2.6, exitDrive: 2.3 };
  var DOOR_W = 7.6, DOOR_H = 5.6, FRONT_Z = 9, SERVICE_Z = -1.5, START_Z = 30, SHOW_Z = 21;
  var MSGS = ['Installing engine parts', 'Tuning performance', 'Final testing'];

  function ease(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }
  function $(id) { return document.getElementById(id); }

  function Workshop(info) {
    this.info = info;                    // { from, to, kind }
    var env = CT.Mode3D.newScene({ indoor: false });
    this.scene = env.scene; this.kit = env.kit; this.sun = env.sun; this.hemi = env.hemi;
    var sc = this.scene, k = this.kit;
    sc.clearColor = new B.Color4(0.55, 0.75, 0.92, 1);
    sc.fogMode = B.Scene.FOGMODE_LINEAR; sc.fogColor = new B.Color3(0.75, 0.85, 0.93); sc.fogStart = 80; sc.fogEnd = 260;
    this.low = k.lowFx;
    this.buildYard();
    this.buildShop();
    this.truck = CT.Trucks3D.build(k, info.kind);
    this.truck.root.position.set(0, 0.02, START_Z);
    this.truck.root.rotation.y = Math.PI;               // faces the shutter (-z)
    this.camera = new B.FreeCamera('wsCam', new V3(10, 6, START_Z + 14), sc);
    this.camera.minZ = 0.2; this.camera.maxZ = 500;
    sc.activeCamera = this.camera;
    k.environment('day', { camera: this.camera });
    sc.fogStart = 120; sc.fogEnd = 600; sc.fogColor = new B.Color3(0.78, 0.86, 0.94);
    this.camPos = this.camera.position.clone(); this.camLook = new V3(0, 2, START_Z);
    this.upgradeTime = CONFIG.upgradeMin + Math.random() * (CONFIG.upgradeMax - CONFIG.upgradeMin);
    this.si = 0; this.st = 0; this.t = 0; this.shutterOpen = 0; this.ran = {};
    this.buildFx();
    this.buildUi();
    this.enterState(0);
  }
  Workshop.STATES = STATES;
  Workshop.CONFIG = CONFIG;

  // ------------------------------------------------------------------ scene
  Workshop.prototype.buildYard = function () {
    var k = this.kit, sc = this.scene;
    var concrete = k.tex('concrete', 256, 256, function (ctx) {
      ctx.fillStyle = '#b9bcc2'; ctx.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 1800; i++) { var g = 150 + Math.random() * 60 | 0; ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',.5)'; ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
      ctx.strokeStyle = 'rgba(90,92,98,.6)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, 256, 256);
    }, { mip: true });
    concrete.uScale = 14; concrete.vScale = 14;
    var g = B.MeshBuilder.CreateGround('yard', { width: 120, height: 120 }, sc);
    g.material = k.surface('concrete', 20, { env: 0.5 }); g.receiveShadows = true;
    concrete.dispose();
    var grass = B.MeshBuilder.CreateGround('grass', { width: 600, height: 600 }, sc);
    grass.position.y = -0.05; grass.material = k.surface('grass', 90, { tint: '#9ccf6a', env: 0.4 }); grass.receiveShadows = true;
    // lane markings to the door
    for (var z = FRONT_Z + 2; z < START_Z + 8; z += 3) k.box('dash', 0.25, 0.02, 1.6, 0, 0.02, z, null, '#ffffff');
    k.box('stopLine', DOOR_W, 0.02, 0.3, 0, 0.02, SHOW_Z - 4.5, null, '#ffd21a');
    var showPad = B.MeshBuilder.CreateDisc('pad', { radius: 6, tessellation: 40 }, sc);
    showPad.rotation.x = Math.PI / 2; showPad.position.set(0, 0.03, SHOW_Z); showPad.material = k.mat('#2f7fe0', { alpha: 0.35, emissive: '#10306a' });
    // a few trees
    var crown = B.MeshBuilder.CreateIcoSphere('crown', { radius: 2.2, subdivisions: 1 }, sc); crown.material = k.mat('#3f9a3c');
    var trunk = k.cyl('trunk', 0.5, 2.4, 0, 0, 0, null, '#7a4f2a', null, 6);
    [[-22, 10], [-26, 22], [22, 14], [27, 26], [-18, 34], [20, 38], [-30, -4], [30, 0]].forEach(function (p) {
      crown.thinInstanceAdd(B.Matrix.Translation(p[0], 4, p[1])); trunk.thinInstanceAdd(B.Matrix.Translation(p[0], 1.2, p[1]));
    });
  };

  Workshop.prototype.buildShop = function () {
    var k = this.kit, sc = this.scene, parts = [];
    var add = function (m) { parts.push(m); return m; };
    var W = 16, D = 22, H = 8.5, cz = FRONT_Z - D / 2;
    var wall = '#d9dde3', trim = '#2f6fd0';
    add(k.box('wallBack', W, H, 0.4, 0, H / 2, FRONT_Z - D, null, wall));
    add(k.box('wallL', 0.4, H, D, -W / 2, H / 2, cz, null, wall));
    add(k.box('wallR', 0.4, H, D, W / 2, H / 2, cz, null, wall));
    var side = (W - DOOR_W) / 2;
    add(k.box('frontL', side, H, 0.4, -(DOOR_W / 2 + side / 2), H / 2, FRONT_Z, null, wall));
    add(k.box('frontR', side, H, 0.4, DOOR_W / 2 + side / 2, H / 2, FRONT_Z, null, wall));
    add(k.box('frontTop', DOOR_W, H - DOOR_H, 0.4, 0, DOOR_H + (H - DOOR_H) / 2, FRONT_Z, null, wall));
    add(k.box('roof', W + 1, 0.5, D + 1, 0, H + 0.25, cz, null, '#3a3e47'));
    add(k.box('trimTop', W + 1.1, 0.5, 0.5, 0, H - 0.4, FRONT_Z + 0.05, null, trim));
    add(k.box('doorFrameL', 0.35, DOOR_H, 0.6, -DOOR_W / 2 - 0.1, DOOR_H / 2, FRONT_Z, null, '#ffcc00'));
    add(k.box('doorFrameR', 0.35, DOOR_H, 0.6, DOOR_W / 2 + 0.1, DOOR_H / 2, FRONT_Z, null, '#ffcc00'));
    for (var i = 0; i < 6; i++) add(k.box('hazard', 0.36, 0.45, 0.62, -DOOR_W / 2 - 0.1, 0.4 + i * 0.95, FRONT_Z, null, '#1d1d22'));
    for (var j = 0; j < 6; j++) add(k.box('hazard', 0.36, 0.45, 0.62, DOOR_W / 2 + 0.1, 0.4 + j * 0.95, FRONT_Z, null, '#1d1d22'));
    // interior: floor, service pit lines, tool cabinets, engine hoist
    add(k.box('floor', W - 0.4, 0.06, D - 0.4, 0, 0.03, cz, null, '#8e939b'));
    add(k.box('bayLineL', 0.2, 0.08, 12, -2.4, 0.05, SERVICE_Z, null, '#ffd21a'));
    add(k.box('bayLineR', 0.2, 0.08, 12, 2.4, 0.05, SERVICE_Z, null, '#ffd21a'));
    for (var c = 0; c < 4; c++) add(k.box('cabinet', 1.2, 1.6, 0.7, -W / 2 + 1, 0.8, cz - 6 + c * 1.4, null, c % 2 ? '#e23b30' : '#2f6fd0'));
    add(k.box('bench', 0.9, 1.0, 4, W / 2 - 1, 0.5, cz - 3, null, '#6b4a2b'));
    add(k.box('hoistPost', 0.3, 5, 0.3, 4.6, 2.5, -4, null, '#ffb21a'));
    add(k.box('hoistArm', 3, 0.3, 0.3, 3.3, 5, -4, null, '#ffb21a'));
    add(k.box('engineBlock', 1.2, 0.9, 1.0, 2.2, 1.2, -4.5, null, '#555c69'));
    // roof vents (smoke comes out of these)
    add(k.box('vent1', 1.4, 1.0, 1.4, -3.5, H + 1, cz + 2, null, '#5a5f6b'));
    add(k.box('vent2', 1.4, 1.0, 1.4, 3.5, H + 1, cz - 3, null, '#5a5f6b'));
    var merged = B.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    merged.receiveShadows = true;
    // windows high on the side walls (glow + flash during welding)
    this.windows = [];
    for (var w = 0; w < 3; w++) {
      var win = k.box('window', 0.1, 1.2, 2.6, W / 2 + 0.22, 5.8, cz + 6 - w * 5.5, null, '#2a3a52', { emissive: '#1a2a40' });
      this.windows.push(win);
    }
    // signs
    var sign = k.sign('wsSign', 'TRUCK SERVICE', 8, 1.3, '#1d3b6f', '#ffffff', null, { glow: '#9ab4e0' });
    sign.position.set(0, H - 0.45, FRONT_Z + 0.32); sign.rotation.y = Math.PI;
    this.ledSign = k.sign('ledSign', 'ENGINE UPGRADE', 4.4, 0.8, '#111', '#ff9a1f', null, { glow: '#ffffff' });
    this.ledSign.position.set(0, DOOR_H + 1.35, FRONT_Z + 0.32); this.ledSign.rotation.y = Math.PI; this.ledSign.visibility = 0.25;
    // warning beacons at both sides of the door + exit light
    this.beacons = [-1, 1].map(function (sgn) {
      var b = k.cyl('beacon', 0.4, 0.45, sgn * (DOOR_W / 2 + 0.9), DOOR_H + 0.5, FRONT_Z + 0.4, null, '#ff8a1f', { emissive: '#3a1a00' }, 10);
      return b;
    });
    this.exitLight = k.box('exitLight', 1.6, 0.5, 0.1, DOOR_W / 2 + 1.6, 3.2, FRONT_Z + 0.25, null, '#1d4a2a', { emissive: '#06200e' });
    // interior service lights (a point light that brightens)
    this.inLight = new B.PointLight('inLight', new V3(0, 7, -2), sc);
    this.inLight.intensity = 0; this.inLight.range = 26; this.inLight.diffuse = new B.Color3(1, 0.95, 0.85);
    this.lamps = [];
    for (var L = 0; L < 3; L++) this.lamps.push(k.box('lamp', 3, 0.15, 0.6, 0, H - 0.4, cz + 6 - L * 6, null, '#555555', { emissive: '#000000' }));
    // the roller shutter: a slatted panel that rolls up into a drum above the door
    var slats = k.tex('slats', 64, 256, function (ctx) {
      ctx.fillStyle = '#aeb6c0'; ctx.fillRect(0, 0, 64, 256);
      for (var y = 0; y < 256; y += 16) { ctx.fillStyle = '#8a929c'; ctx.fillRect(0, y, 64, 3); ctx.fillStyle = '#d4d9df'; ctx.fillRect(0, y + 3, 64, 2); }
    });
    slats.vScale = 3;
    this.shutterMat = k.texMat('shutterM', slats);
    this.shutter = B.MeshBuilder.CreateBox('shutter', { width: DOOR_W, height: DOOR_H, depth: 0.12 }, sc);
    this.shutter.material = this.shutterMat;
    this.shutter.position.set(0, DOOR_H / 2, FRONT_Z + 0.05);
    k.shadow(this.shutter);
    var drum = k.cyl('drum', 0.8, DOOR_W + 0.3, 0, DOOR_H + 0.35, FRONT_Z + 0.45, null, '#6b707b'); drum.rotation.z = Math.PI / 2;
    this.drum = drum;
  };

  Workshop.prototype.setShutter = function (open) {          // 0 closed .. 1 fully open
    this.shutterOpen = open;
    var h = Math.max(0.02, 1 - open);
    this.shutter.scaling.y = h;
    this.shutter.position.y = DOOR_H - DOOR_H * h / 2;
    this.shutterMat.albedoTexture.vScale = 3 * h;
    this.drum.rotation.x = open * 12;
  };

  Workshop.prototype.buildFx = function () {
    var k = this.kit, sc = this.scene, low = this.low;
    // grey-white steam rising from the roof vents (soft, light, fades out)
    var self = this;
    var mk = function (name, pos) {
      var sm = new B.ParticleSystem(name, low ? 30 : 90, sc);
      sm.particleTexture = k.dotTex();
      sm.emitter = pos;
      sm.minEmitBox = new V3(-0.4, 0, -0.4); sm.maxEmitBox = new V3(0.4, 0.2, 0.4);
      sm.direction1 = new V3(-0.3, 1.2, -0.3); sm.direction2 = new V3(0.4, 1.8, 0.3);
      sm.color1 = new B.Color4(0.92, 0.92, 0.94, 0.22); sm.color2 = new B.Color4(0.82, 0.82, 0.86, 0.16); sm.colorDead = new B.Color4(0.95, 0.95, 0.97, 0);
      sm.minSize = 0.6; sm.maxSize = 1.2; sm.minLifeTime = 1.6; sm.maxLifeTime = 2.6;
      sm.minEmitPower = 0.6; sm.maxEmitPower = 1.2; sm.emitRate = 0;
      sm.gravity = new V3(0.25, 0.5, 0);
      sm.addSizeGradient(0, 0.5); sm.addSizeGradient(1, 2.6);
      sm.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
      sm.start();
      return sm;
    };
    var smoke = mk('wsSmoke', new V3(-3.5, 9.6, FRONT_Z - 11 + 2)), smoke2 = mk('wsSmoke2', new V3(3.5, 9.6, FRONT_Z - 11 - 3));
    // welding sparks: short orange bursts from the side windows
    var sp = new B.ParticleSystem('sparks', low ? 60 : 220, sc);
    sp.particleTexture = k.dotTex();
    sp.emitter = new V3(8.3, 5.8, FRONT_Z - 11 + 6);
    sp.minEmitBox = new V3(0, -0.4, -1); sp.maxEmitBox = new V3(0, 0.4, 1);
    sp.color1 = new B.Color4(1, 0.75, 0.2, 1); sp.color2 = new B.Color4(1, 0.5, 0.1, 1); sp.colorDead = new B.Color4(1, 0.3, 0, 0);
    sp.minSize = 0.05; sp.maxSize = 0.14; sp.minLifeTime = 0.25; sp.maxLifeTime = 0.6;
    sp.direction1 = new V3(1.5, 2, -1.5); sp.direction2 = new V3(3, 4, 1.5); sp.minEmitPower = 1.5; sp.maxEmitPower = 3.5;
    sp.gravity = new V3(0, -9.8, 0); sp.emitRate = 0;
    sp.blendMode = B.ParticleSystem.BLENDMODE_ADD;
    sp.start();
    // exhaust (diesel truck only)
    if (this.truck && this.truck.exhaust) { /* set up after the truck is built */ }
    this.smokeFx = [smoke, smoke2]; this.sparks = sp;
  };

  Workshop.prototype.exhaustFx = function () {
    if (this.low || !this.truck.exhaust || this.exhaust) return;
    var ps = new B.ParticleSystem('wsExhaust', 80, this.scene);
    ps.particleTexture = this.kit.dotTex();
    var em = new B.TransformNode('wsExEm', this.scene); em.parent = this.truck.body; em.position.copyFrom(this.truck.exhaust);
    ps.emitter = em;
    ps.color1 = new B.Color4(0.55, 0.55, 0.58, 0.35); ps.color2 = new B.Color4(0.7, 0.7, 0.72, 0.2); ps.colorDead = new B.Color4(0.8, 0.8, 0.8, 0);
    ps.minSize = 0.3; ps.maxSize = 0.7; ps.minLifeTime = 0.6; ps.maxLifeTime = 1.1; ps.emitRate = 25;
    ps.direction1 = new V3(-0.2, 1.5, 0.3); ps.direction2 = new V3(0.2, 2, 0.6); ps.minEmitPower = 0.5; ps.maxEmitPower = 1;
    ps.start();
    this.exhaust = ps;
  };

  // ------------------------------------------------------------------ overlay UI
  Workshop.prototype.buildUi = function () {
    var d = $('wsUi');
    if (!d) {
      d = document.createElement('section');
      d.id = 'wsUi'; d.className = 'screen ws-ui';
      d.innerHTML = '<div class="ws-top"><span class="ws-chip" id="wsState"></span><button class="btn btn-small btn-ghost" type="button" id="wsSkip">SKIP ▶▶</button></div>' +
        '<div class="ws-prog" id="wsProg" hidden><div class="ws-title">UPGRADING ENGINE</div><div class="ws-bar"><i id="wsBar"></i></div><div class="ws-row"><span id="wsMsg"></span><b id="wsPct">0%</b></div></div>' +
        '<div class="ws-big" id="wsBig" hidden>ENGINE UPGRADE COMPLETE!</div>' +
        '<div class="ws-stats modal" id="wsStats" hidden></div>';
      $('app').appendChild(d);
    }
    d.hidden = false;
    $('wsProg').hidden = true; $('wsBig').hidden = true; $('wsStats').hidden = true;
    var self = this;
    $('wsSkip').onclick = function () { self.skip(); };
  };

  Workshop.prototype.statsHtml = function () {
    var a = CT.Garage.engineEffect(this.info.from), b = CT.Garage.engineEffect(this.info.to), base = CT.Garage.BASE3D[this.info.kind] || CT.Garage.BASE3D.classic;
    var pct = function (x, y) { return '+' + Math.round((y / x - 1) * 100) + '%'; };
    var row = function (label, before, after, delta) { return '<li><span>' + label + '</span><b>' + before + ' → ' + after + '</b><em>' + delta + '</em></li>'; };
    return '<h2 class="modal-title">ENGINE UPGRADED</h2><p class="ws-sub">' + b.label + '</p><ul class="ws-list">' +
      row('Engine level', this.info.from, this.info.to, '') +
      row('Acceleration', Math.round(a.accel * 100) + '%', Math.round(b.accel * 100) + '%', pct(a.accel, b.accel)) +
      row('Maximum speed', Math.round(base.top * a.top) + ' km/h', Math.round(base.top * b.top) + ' km/h', pct(a.top, b.top)) +
      row('Hill power', Math.round(a.hill * 100) + '%', Math.round(b.hill * 100) + '%', pct(a.hill, b.hill)) +
      '</ul><div class="modal-buttons"><button class="btn btn-green btn-big" type="button" id="wsDone">BACK TO GARAGE</button></div>';
  };

  // ------------------------------------------------------------------ state machine
  Workshop.prototype.enterState = function (i) {
    if (this.ran[i]) return;              // each state runs exactly once
    this.ran[i] = true;
    this.si = i; this.st = 0;
    var name = STATES[i], self = this;
    $('wsState').textContent = name.replace(/_/g, ' ');
    switch (name) {
      case 'PURCHASE_CONFIRMED': CT.Audio.play('coin'); break;
      case 'WORKSHOP_ENTERING':
        this.lightsOn(true); CT.Audio.play('shutter');
        CT.Audio.setEngineType(this.truck.spec.electric ? 'ev' : 'diesel'); CT.Audio.engineOn();
        break;
      case 'SHUTTER_CLOSING': CT.Audio.play('shutter'); CT.Audio.engineOff(); break;
      case 'ENGINE_UPGRADING':
        this.ledSign.visibility = 1;
        $('wsProg').hidden = false;
        this.truck.root.setEnabled(false);          // hidden behind the closed shutter anyway
        break;
      case 'SHUTTER_OPENING':
        $('wsProg').hidden = true;
        this.smokeFx.forEach(function (p) { p.emitRate = 0; }); this.sparks.emitRate = 0;
        this.truck.root.setEnabled(true);
        this.exitLight.material = this.kit.mat('#35d55a', { emissive: '#1fbf4a' });
        CT.Audio.play('complete'); CT.vibrate([30, 40, 80]);
        $('wsBig').hidden = false;
        CT.Audio.play('shutter');
        break;
      case 'TRUCK_EXITING':
        $('wsBig').hidden = true;
        this.truck.setHead(true);
        CT.Audio.engineOn(); CT.Audio.play(this.truck.spec.electric ? 'evRev' : 'rev');
        this.exhaustFx();
        break;
      case 'UPGRADE_COMPLETE':
        CT.Audio.engineOff();
        if (this.exhaust) this.exhaust.emitRate = 4;
        this.truck.setHead(false);
        var st = $('wsStats'); st.innerHTML = this.statsHtml(); st.hidden = false;
        $('wsSkip').hidden = true;
        $('wsDone').onclick = function () { self.finish(); };
        CT.Audio.play('upgrade');
        break;
    }
  };
  Workshop.prototype.next = function () { if (this.si < STATES.length - 1) this.enterState(this.si + 1); };
  Workshop.prototype.skip = function () {
    // jump straight to the end; the upgrade was saved at purchase time
    this.smokeFx.forEach(function (p) { p.emitRate = 0; }); this.sparks.emitRate = 0;
    $('wsProg').hidden = true; $('wsBig').hidden = true;
    this.truck.root.setEnabled(true);
    this.truck.root.position.z = SHOW_Z; this.setShutter(1);
    for (var i = this.si + 1; i < STATES.length - 1; i++) this.ran[i] = true;
    this.enterState(STATES.length - 1);
  };

  Workshop.prototype.lightsOn = function (on) {
    var k = this.kit;
    this.inLight.intensity = on ? 0.9 : 0;
    this.lamps.forEach(function (l) { l.material = k.mat(on ? '#fffbe6' : '#555555', { emissive: on ? '#fff3c0' : '#000000' }); });
    this.windows.forEach(function (w) { w.material = k.mat(on ? '#fff1b8' : '#2a3a52', { emissive: on ? '#a08840' : '#1a2a40' }); });
  };

  Workshop.prototype.driveTo = function (z0, z1, u) {
    var prev = this.truck.root.position.z, e = ease(u);
    this.truck.root.position.z = z0 + (z1 - z0) * e;
    this.truck.roll(Math.abs(this.truck.root.position.z - prev), 0);
    var v = Math.abs(this.truck.root.position.z - prev) * 60;
    CT.Audio.engineSet(Math.min(1, v / 8), u < 0.6 ? 0.5 : 0.1);
  };

  Workshop.prototype.update = function (dt) {
    this.t += dt; this.st += dt;
    var name = STATES[this.si], st = this.st, C = CONFIG, k = this.kit;
    var tz = this.truck.root.position.z;
    // blinking warning beacons while the shutter moves
    var moving = name === 'WORKSHOP_ENTERING' || name === 'SHUTTER_CLOSING' || name === 'SHUTTER_OPENING';
    var blink = moving && Math.floor(this.t * 4) % 2 === 0;
    this.beacons.forEach(function (b) { b.material = k.mat(blink ? '#ffb21a' : '#ff8a1f', { emissive: blink ? '#ff8a00' : '#3a1a00' }); b.rotation.y += dt * 6; });
    switch (name) {
      case 'PURCHASE_CONFIRMED':
        if (st > 0.4) this.next();
        break;
      case 'WORKSHOP_ENTERING':
        this.setShutter(ease(st / C.shutter));
        // the truck starts once the door is open high enough to pass under (no clipping)
        var u = (st - C.shutter * 0.75) / C.enterDrive;
        if (u > 0) this.driveTo(START_Z, SERVICE_Z, Math.min(1, u));
        if (u >= 1.05) { this.next(); }
        break;
      case 'SHUTTER_CLOSING':
        this.setShutter(1 - ease(st / C.shutter));
        if (st > C.shutter + 0.15) this.next();
        break;
      case 'ENGINE_UPGRADING':
        var p = Math.min(1, st / this.upgradeTime);
        $('wsBar').style.width = Math.round(p * 100) + '%';
        $('wsPct').textContent = Math.round(p * 100) + '%';
        $('wsMsg').textContent = MSGS[Math.min(MSGS.length - 1, Math.floor(p * MSGS.length))] + '…';
        var on = p < 0.97;
        this.smokeFx.forEach(function (ps) { ps.emitRate = on ? (k.lowFx ? 6 : 16) : 0; });
        // short welding bursts with window flashes
        var burst = on && Math.sin(st * 9) > 0.55 && Math.sin(st * 2.3) > -0.2;
        this.sparks.emitRate = burst ? (k.lowFx ? 60 : 260) : 0;
        var flash = burst && Math.random() < 0.5;
        this.windows.forEach(function (w) { w.material = k.mat(flash ? '#ffffff' : '#fff1b8', { emissive: flash ? '#cfe6ff' : '#a08840' }); });
        this.inLight.intensity = flash ? 1.6 : 0.9;
        if (burst && this.t - (this._weldT || 0) > 0.35) { this._weldT = this.t; CT.Audio.play('weld'); }
        if (!burst && on && this.t - (this._wrT || 0) > 0.8) { this._wrT = this.t; CT.Audio.play('wrench'); }
        if (p >= 1 && st > this.upgradeTime + 0.2) this.next();
        break;
      case 'SHUTTER_OPENING':
        this.setShutter(ease(st / C.shutter));
        if (st > C.shutter + 0.5) this.next();
        break;
      case 'TRUCK_EXITING':
        this.driveTo(SERVICE_Z, SHOW_Z, Math.min(1, st / C.exitDrive));
        if (st > C.exitDrive + 0.2) this.next();
        break;
    }
    this.updateCamera(dt, name, tz);
  };

  Workshop.prototype.updateCamera = function (dt, name, tz) {
    var pos, look, k = 2.4, portrait = window.innerHeight > window.innerWidth;
    this.camera.fov = portrait ? 1.1 : 0.85;
    if (name === 'PURCHASE_CONFIRMED' || name === 'WORKSHOP_ENTERING') {
      // follow behind the truck as it approaches the door
      pos = new V3(5.5, 5.2, tz + 13); look = new V3(0, 2.6, tz - 6);
      if (tz < FRONT_Z + 4) { pos = new V3(7, 5.5, FRONT_Z + 15); look = new V3(0, 3, FRONT_Z - 2); }
    } else if (name === 'SHUTTER_CLOSING' || name === 'ENGINE_UPGRADING' || name === 'SHUTTER_OPENING') {
      // framed shot of the building: shutter, signs, roof vents and the welding window
      pos = new V3(14, 9, FRONT_Z + 20); look = new V3(0, 4.5, FRONT_Z - 4); k = 1.6;
    } else {
      pos = new V3(-6.5, 4.2, tz + 10); look = new V3(0, 1.8, tz - 1);
      if (name === 'UPGRADE_COMPLETE') { var a = this.t * 0.25; pos = new V3(Math.sin(a) * 13, 4.5, SHOW_Z + Math.cos(a) * 13); look = new V3(0, 1.6, SHOW_Z); k = 3; }
    }
    this.camPos = V3.Lerp(this.camPos, pos, Math.min(1, dt * k));
    this.camLook = V3.Lerp(this.camLook, look, Math.min(1, dt * k * 1.3));
    this.camera.position.copyFrom(this.camPos);
    this.camera.setTarget(this.camLook);
  };

  Workshop.prototype.autoResume = true;            // the show simply continues when the app comes back
  Workshop.prototype.pause = function () { CT.Mode3D.paused = true; CT.Audio.engineOff(); };
  Workshop.prototype.back = function () { if (STATES[this.si] === 'UPGRADE_COMPLETE') this.finish(); else this.skip(); };

  Workshop.prototype.finish = function () {
    if (this.finished) return; this.finished = true;
    var el = $('wsUi'); if (el) el.hidden = true;
    CT.Mode3D.stop();
    CT.Workshop3D.running = false;
    if (CT.Menu3D) CT.Menu3D.show();
    var g = $('garage'); if (g) { CT.UI.openGarage(CT.Workshop3D.from || 'menu'); }
  };
  Workshop.prototype.dispose = function () {
    CT.Audio.engineOff();
    var el = $('wsUi'); if (el) el.hidden = true;
    this.scene.dispose();
  };

  CT.Workshop3D = {
    running: false,
    CONFIG: CONFIG,
    /** Plays the workshop for an engine upgrade that has ALREADY been paid for and saved. */
    play: function (info, from) {
      if (this.running) return false;
      this.running = true; this.from = from;
      var g = $('garage'); if (g) g.hidden = true;
      var m = $('menu'); if (m) m.hidden = true;
      var w = new Workshop(info);
      CT.Mode3D.start(w);
      return true;
    }
  };
})(window.CT);
