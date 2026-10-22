/* game3d.js — one playable 3D delivery level: warehouse loading (drag a box onto the bed or tap LOAD for the
   forklift), driving with touch / keyboard / optional gyro steering, cargo that shifts, gets damaged, falls and
   can be recovered, drops off mountain roads with a fair respawn, fuel, the delivery bay, unloading, scoring,
   one-time rewards, the tutorial, pause / resume / restart, and premium demo-drive accounting. */
(function (CT) {
  'use strict';
  var B = window.BABYLON, V3 = B.Vector3;
  var ST = { LOADING: 'LOADING', READY: 'READY', DRIVING: 'DRIVING', ARRIVED: 'ARRIVED', DELIVERING: 'DELIVERING', COMPLETE: 'COMPLETE', FAILED: 'FAILED', FALLING: 'FALLING' };
  var CAMS = ['chase', 'far', 'cab'];
  var attemptSeq = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function $(id) { return document.getElementById(id); }

  // ------------------------------------------------------------------ HUD (built once, reused)
  var HUD_HTML =
    '<section id="hud3d" class="screen hud3d" hidden aria-label="3D driving controls">' +
    ' <div class="h3-top">' +
    '  <div class="hud-chip"><span class="lvl-num" id="h3Lvl">1</span><span class="lvl-name" id="h3Name">Tutorial</span><span id="h3Demo" class="demo-tag" hidden>DEMO 1/3</span></div>' +
    '  <div class="hud-chip cargo-chip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" fill="#d79a5c" stroke="#1d1d22" stroke-width="1.6" stroke-linejoin="round"/></svg><b id="h3Cargo">0/3</b><span class="health"><i id="h3Health"></i></span><span id="h3Pips" class="item-pips"></span></div>' +
    '  <div class="hud-chip fuel-chip" id="h3FuelChip"><span id="h3FuelIco" class="fuel-ico">⛽</span><span class="fuel"><i id="h3Fuel"></i></span></div>' +
    '  <div class="hud-chip"><span id="h3Dist">0 m</span></div>' +
    '  <span class="h3-grow"></span>' +
    '  <button class="btn btn-icon btn-pause" type="button" data-a3="cam" aria-label="Change camera"><span id="h3Cam">TPP</span></button>' +
    '  <button class="btn btn-icon btn-pause" type="button" data-a3="pause" aria-label="Pause"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button>' +
    ' </div>' +
    ' <div id="h3Banner" class="banner"><div id="h3Title" class="banner-title"></div><div id="h3Sub" class="banner-sub"></div><div id="h3Prog" class="banner-prog" hidden><div class="bp-track"><i id="h3Bar"></i></div><b id="h3Time">0:00</b></div></div>' +
    ' <div id="h3Tut" class="h3-tut" hidden><div id="h3TutText"></div><button type="button" class="btn btn-green btn-small" data-a3="tut">GOT IT</button></div>' +
    ' <div class="h3-gauge" aria-hidden="true"><svg viewBox="0 0 120 80"><path d="M12 70 A50 50 0 0 1 108 70" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="9" stroke-linecap="round"/>' +
    '  <path id="h3Arc" d="M12 70 A50 50 0 0 1 108 70" fill="none" stroke="#35d55a" stroke-width="9" stroke-linecap="round" stroke-dasharray="157" stroke-dashoffset="157"/>' +
    '  <line id="h3Needle" x1="60" y1="70" x2="60" y2="28" stroke="#ff4b3e" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="70" r="6" fill="#fff"/></svg>' +
    '  <b id="h3Speed">0</b><small>km/h</small></div>' +
    ' <div class="h3-left">' +
    '  <div class="h3-wheel" id="h3Wheel" role="slider" aria-label="Steering wheel: drag to turn"><svg id="h3WheelSvg" viewBox="0 0 200 200">' +
    '   <circle cx="100" cy="100" r="88" fill="none" stroke="#1d1f24" stroke-width="22"/><circle cx="100" cy="100" r="88" fill="none" stroke="#3a3e47" stroke-width="14"/>' +
    '   <circle cx="100" cy="100" r="30" fill="#2a2d34" stroke="#555c69" stroke-width="4"/><path d="M70 100 L18 100 M130 100 L182 100 M100 130 L100 186" stroke="#2a2d34" stroke-width="18" stroke-linecap="round"/>' +
    '   <rect x="94" y="6" width="12" height="20" rx="4" fill="#ffc21a"/><circle cx="100" cy="100" r="12" fill="#c9ced6"/></svg></div>' +
    '  <button class="h3-btn steer" type="button" data-k3="left" aria-label="Steer left"><svg viewBox="0 0 24 24"><path d="M15.5 4 7.5 12l8 8 2-2-6-6 6-6z"/></svg></button>' +
    '  <button class="h3-btn steer" type="button" data-k3="right" aria-label="Steer right"><svg viewBox="0 0 24 24"><path d="M8.5 4 6.5 6l6 6-6 6 2 2 8-8z"/></svg></button>' +
    ' </div>' +
    ' <div class="h3-center"><button id="h3Action" class="btn-action" type="button" data-a3="action" hidden><span id="h3ActText">LOAD</span></button><div id="h3ActHint" class="action-hint"></div></div>' +
    ' <div class="h3-right">' +
    '  <button class="h3-btn rev" type="button" data-k3="reverse" aria-label="Reverse"><b>R</b><small>REVERSE</small></button>' +
    '  <button class="h3-btn pedal3 brake" type="button" data-k3="brake" aria-label="Brake"><span>BRAKE</span></button>' +
    '  <button class="h3-btn pedal3 gas" type="button" data-k3="gas" aria-label="Accelerate"><span>GAS</span></button>' +
    ' </div>' +
    ' <div id="h3Gyro" class="h3-gyro" hidden>GYRO</div>' +
    '</section>' +
    '<section id="pause3d" class="screen modal-wrap" hidden aria-label="Paused"><div class="modal">' +
    ' <h2 class="modal-title">PAUSED</h2><div class="modal-buttons">' +
    '  <button class="btn btn-green" type="button" data-a3="resume">RESUME</button>' +
    '  <button class="btn btn-orange" type="button" data-a3="restart">RESTART LEVEL</button>' +
    '  <div class="setting"><span>Steering</span><div class="seg" role="group" aria-label="Steering"><button type="button" data-steer="wheel">WHEEL</button><button type="button" data-steer="buttons">BUTTONS</button></div></div>' +
    '  <label class="setting"><span>Gyro steering <small id="p3GyroNote">(tilt the phone)</small></span><input id="p3Gyro" type="checkbox" class="switch"></label>' +
    '  <label class="setting"><span>Gyro sensitivity <small id="p3SensVal"></small></span><input id="p3Sens" type="range" min="6" max="30" step="1" class="slider"></label>' +
    '  <button class="btn btn-blue" type="button" data-a3="calibrate">CALIBRATE GYRO (hold phone level)</button>' +
    '  <label class="setting"><span>Low effects <small>(faster on older phones)</small></span><input id="p3Low" type="checkbox" class="switch"></label>' +
    '  <button class="btn btn-ghost" type="button" data-a3="menu">MAIN MENU</button>' +
    ' </div></div></section>';

  var hud = null;
  function buildHud() {
    if (hud) return hud;
    var wrap = document.createElement('div');
    wrap.innerHTML = HUD_HTML;
    var app = $('app');
    while (wrap.firstChild) app.appendChild(wrap.firstChild);
    hud = { root: $('hud3d'), pause: $('pause3d'), keys: {}, pointers: {} };
    // hold-to-drive buttons (multi-touch with pointer capture)
    Array.prototype.forEach.call(hud.root.querySelectorAll('[data-k3]'), function (el) {
      var k = el.getAttribute('data-k3');
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault(); CT.Audio.unlock();
        try { el.setPointerCapture(e.pointerId); } catch (x) {}
        hud.pointers[e.pointerId] = k; el.classList.add('active');
        if (Game3D.cur) Game3D.cur.onControlTouch(k);
      });
      var up = function (e) { if (hud.pointers[e.pointerId]) { delete hud.pointers[e.pointerId]; el.classList.remove('active'); } };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    // steering wheel: drag around its centre; it springs back to straight when released
    var wheel = $('h3Wheel');
    hud.wheel = { angle: 0, id: null, grab: 0, start: 0 };
    var wAngle = function (e) { var r = wheel.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); };
    wheel.addEventListener('pointerdown', function (e) {
      e.preventDefault(); CT.Audio.unlock();
      try { wheel.setPointerCapture(e.pointerId); } catch (x) {}
      hud.wheel.id = e.pointerId; hud.wheel.grab = wAngle(e); hud.wheel.start = hud.wheel.angle;
      wheel.classList.add('active');
    });
    wheel.addEventListener('pointermove', function (e) {
      if (e.pointerId !== hud.wheel.id) return;
      var d = wAngle(e) - hud.wheel.grab;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      hud.wheel.angle = Math.max(-2.4, Math.min(2.4, hud.wheel.start + d));
      hud.wheel.grab = wAngle(e); hud.wheel.start = hud.wheel.angle;
    });
    var wUp = function (e) { if (e.pointerId === hud.wheel.id) { hud.wheel.id = null; wheel.classList.remove('active'); } };
    wheel.addEventListener('pointerup', wUp); wheel.addEventListener('pointercancel', wUp); wheel.addEventListener('lostpointercapture', wUp);
    Array.prototype.forEach.call(document.querySelectorAll('[data-steer]'), function (b) {
      b.addEventListener('click', function () { CT.Storage.setSetting('steerMode', b.getAttribute('data-steer')); CT.Audio.play('click'); if (Game3D.cur) Game3D.cur.applySteerMode(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-a3]'), function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); CT.Audio.unlock(); if (Game3D.cur) Game3D.cur.command(el.getAttribute('data-a3')); });
    });
    $('p3Gyro').addEventListener('change', function () { if (Game3D.cur) Game3D.cur.setGyro($('p3Gyro').checked); });
    $('p3Sens').addEventListener('input', function () { var v = parseInt($('p3Sens').value, 10); CT.Storage.setSetting('gyroSens', v); $('p3SensVal').textContent = '(full turn at ' + v + '°)'; });
    $('p3Low').addEventListener('change', function () { CT.Storage.setSetting('lowFx', $('p3Low').checked); CT.Mode3D.applyQuality(); });
    var KEYS = { ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'brake', KeyR: 'reverse', KeyX: 'reverse', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    window.addEventListener('keydown', function (e) {
      var g = Game3D.cur; if (!g || !CT.Mode3D.active) return;
      if (KEYS[e.code]) { hud.keys[e.code] = KEYS[e.code]; e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); g.command('action'); }
      else if (e.code === 'KeyC') { e.stopImmediatePropagation(); g.command('cam'); }
      else if (e.code === 'KeyP' || e.code === 'Escape') { e.stopImmediatePropagation(); g.command(g.paused ? 'resume' : 'pause'); }
      else if (e.code === 'KeyH') { e.stopImmediatePropagation(); CT.Audio.play('horn'); }
    }, true);
    window.addEventListener('keyup', function (e) { if (hud.keys[e.code]) delete hud.keys[e.code]; }, true);
    window.addEventListener('blur', function () { hud.keys = {}; hud.pointers = {}; });
    return hud;
  }
  function held(k) {
    for (var p in hud.pointers) if (hud.pointers[p] === k) return true;
    for (var c in hud.keys) if (hud.keys[c] === k) return true;
    return false;
  }

  // ------------------------------------------------------------------ level controller
  function Game3D(levelId, opts) {
    opts = opts || {};
    var L = CT.Levels3D.get(levelId) || CT.Levels3D.get(1);
    this.level = L;
    this.kind = opts.truck || (CT.Premium && CT.Premium.canDrive() ? CT.Storage.getTruck() : 'classic');
    this.demo = !!opts.demo;
    if (this.demo) this.kind = 'volt';
    this.attemptId = '3d-' + L.id + '-' + (++attemptSeq) + '-' + Date.now();
    var env = CT.Mode3D.newScene();
    this.scene = env.scene; this.kit = env.kit; this.sun = env.sun;
    this.road = new CT.Road3D(this.scene, this.kit, L);
    this.road.build();
    this.truck = CT.Trucks3D.build(this.kit, this.kind);
    var fails = CT.Storage.getFails('3d' + L.id) || 0;
    this.assist = L.tutorial ? 0 : fails >= 3 ? 2 : fails >= 2 ? 1 : 0;
    this.cfg = CT.Garage.truckConfig3d(this.kind, L);
    this.drive = new CT.Drive3D(this.truck, this.road, this.cfg);
    this.cargo = new CT.Cargo3D(this.scene, this.kit, this.road, this.truck, L);
    this.cargo.stability = this.cfg.stability;
    this.cargo.setupDock(this.drive);
    this.crowds = [new CT.Humans3D.Crowd(this.kit, this.road, this.road.startS), new CT.Humans3D.Crowd(this.kit, this.road, (this.road.zone.s1 + this.road.zone.s2) / 2, { seed: 3 })];
    this.traffic = L.traffic && CT.Traffic3D ? new CT.Traffic3D(this, { density: L.traffic.density * (1 - 0.3 * this.assist) }) : null;
    if (this.kit.shadowGen) this.kit.shadowGen.getShadowMap().refreshRate = this.kit.lowFx ? 2 : 1;
    this.camera = new B.FreeCamera('cam', new V3(0, 8, -12), this.scene);
    this.camera.minZ = 0.3; this.camera.maxZ = 1800;
    this.scene.activeCamera = this.camera;
    this.kit.environment(this.road.skyName(), { camera: this.camera, exposure: this.level.weather === 'clear' ? 1.05 : 1.2 });
    this.camMode = CAMS.indexOf(CT.Storage.getSetting('cam3d')) >= 0 ? CT.Storage.getSetting('cam3d') : 'chase';
    this.camPos = null; this.camLook = null;
    this.fuelMax = this.cfg.fuelCapacity; this.fuel = this.fuelMax;
    this.t = 0; this.time = 0; this.stateTime = 0;
    this.crashes = 0; this.falls = 0; this.safeS = this.road.startS; this.lastSafe = 0;
    this.health = 100; this.timers = []; this.flags = {}; this.paused = false; this.prevState = null;
    this.timeLimit = L.timeLimit ? Math.round(L.timeLimit * (1 + 0.3 * this.assist)) : null;
    this.par = Math.round(L.par * (1 + 0.12 * this.assist));
    this.damageAssist = 1 - 0.3 * this.assist;
    this.tutStep = 0;
    this.wireEvents();
    this.initSmoke();
    buildHud();
    this.setState(ST.LOADING);
  }
  Game3D.ST = ST;
  Game3D.cur = null;

  /** Starts a 3D level (loads Babylon first if needed). */
  Game3D.play = function (id, opts) {
    CT.Load3D.ensure(function () {
      var g = new Game3D(id, opts);
      Game3D.cur = g;
      CT.Mode3D.start(g);
      g.enter();
    });
  };

  Game3D.prototype.enter = function () {
    var L = this.level;
    ['menu', 'hud', 'pause', 'win', 'fail', 'levels', 'garage', 'missions', 'achievements'].forEach(function (k) { var e = $(k); if (e) e.hidden = true; });
    var lv3 = $('levels3d'); if (lv3) lv3.hidden = true;
    hud.root.hidden = false; hud.pause.hidden = true;
    $('h3Lvl').textContent = L.id; $('h3Name').textContent = L.name;
    $('h3FuelIco').textContent = this.cfg.electric ? '🔋' : '⛽';
    this.refreshDemoTag();
    this.updateCamLabel();
    this.syncGyroUi();
    CT.UI.resultOwner = '3d';
    CT.Audio.setEngineType && CT.Audio.setEngineType(this.cfg.electric ? 'ev' : 'diesel');
    if (this.assist) this.toast(this.assist > 1 ? 'Easy mode+: more time, softer cargo damage' : 'Easy mode: more time and softer cargo damage', 'info');
  };

  Game3D.prototype.wireEvents = function () {
    var self = this;
    this.cargo.onLoaded = function (it, counted) {
      CT.Audio.play('clunk'); setTimeout(function () { CT.Audio.play('strap'); }, 200);
      self.drive.cargoWeight = self.cargo.weightOnTruck();
      self.drive.kick(0.6);
      if (counted) { CT.Audio.play('count'); CT.vibrate(25); }
      self.updateCargoHud(true);
      self.hints(true);
    };
    this.cargo.onDelivered = function () { CT.Audio.play('deliver'); CT.vibrate(25); self.updateCargoHud(true); };
    this.cargo.onFall = function (it) {
      CT.Audio.play('crash'); CT.vibrate([60, 40, 60]);
      self.drive.cargoWeight = self.cargo.weightOnTruck();
      self.toast('The ' + it.name + ' fell off! Stop next to it and tap RECOVER', 'bad');
      self.updateCargoHud(true);
    };
    this.cargo.onGround = function (it, hit) {
      CT.Audio.play('bump');
      self.health = self.cargo.condition();
      if (it.destroyed) { self.toast('The ' + it.name + ' broke!', 'bad'); self.checkCargoFail(); }
      self.updateCargoHud(true);
    };
    this.drive.onImpact = function (v) { self.crash(v, 'Watch the end of the road!'); };
    this.drive.onScrape = function (v) {
      if (self.t - (self.flags.scrapeT || -9) < 0.6) return;
      self.flags.scrapeT = self.t;
      CT.Audio.play('bump'); CT.vibrate(20);
      if (v > 8) { self.damage((v - 8) * 0.4); self.cargo.jolt(0, (v - 8) * 0.15, 0.5); }
      if (!self.flags.scrapeToast || self.t - self.flags.scrapeToast > 4) { self.flags.scrapeToast = self.t; self.toast('Stay on the road!', 'warn'); }
    };
    this.drive.onFall = function () { self.onTruckFall(); };
  };

  // ------------------------------------------------------------------ states
  Game3D.prototype.setState = function (s) {
    var old = this.state;
    this.state = s; this.stateTime = 0;
    var drive = s === ST.READY || s === ST.DRIVING || s === ST.ARRIVED;
    this.drive.locked = !drive;
    hud.root.classList.toggle('locked', !drive);
    if (drive || s === ST.DELIVERING) CT.Audio.engineOn(); else CT.Audio.engineOff();
    if (s === ST.READY && old === ST.LOADING) { CT.Audio.play('ready'); var me = this; setTimeout(function () { CT.Audio.play('horn'); }, 400); this.tutorial(2); }
    if (s === ST.DRIVING && !this.flags.driveStarted) { this.flags.driveStarted = true; this.onDriveStarted(); }
    if (s === ST.ARRIVED) { CT.Audio.play('zone'); CT.vibrate(30); this.tutorial(4); }
    if (s === ST.DELIVERING) this.startUnload();
    if (s === ST.LOADING) this.tutorial(1);
    this.hints(true);
    this.refreshAction();
  };

  /** A drive really began: this is when a premium demo drive is counted (once per attempt). */
  Game3D.prototype.onDriveStarted = function () {
    if (this.demo && CT.Premium) { CT.Premium.countDemo(this.attemptId); this.refreshDemoTag(); }
  };
  Game3D.prototype.refreshDemoTag = function () {
    var tag = $('h3Demo');
    if (!this.demo) { tag.hidden = true; return; }
    var used = CT.Storage.getPremium().demoUsed, n = this.flags.driveStarted ? used : Math.min(3, used + 1);
    tag.hidden = false; tag.textContent = 'DEMO DRIVE ' + n + ' OF 3';
  };

  Game3D.prototype.command = function (c) {
    switch (c) {
      case 'pause': this.pause(); break;
      case 'resume': this.resume(); break;
      case 'restart': this.restart(); break;
      case 'menu': this.quit(); break;
      case 'cam': this.cycleCam(); break;
      case 'action': this.action(); break;
      case 'tut': $('h3Tut').hidden = true; break;
      case 'calibrate': CT.Controls.calibrate(); CT.Storage.setSetting('gyroNeutral', CT.Controls.neutral); CT.Audio.play('click'); this.toast('Gyro calibrated: this angle is straight ahead', 'good'); break;
    }
  };

  Game3D.prototype.action = function () {
    var s = this.state;
    if (s === ST.LOADING) this.requestLoad();
    else if (this.recoverable) this.requestRecover();
    else if (s === ST.ARRIVED) this.requestDeliver();
  };

  Game3D.prototype.requestLoad = function () {
    if (this.state !== ST.LOADING) return false;
    var docked = this.cargo.items.filter(function (it) { return it.state === CT.Cargo3D.ST.DOCK; });
    if (!docked.length || this.cargo.forkliftBusy()) return false;
    this.cancelDrag();
    this.cargo.queueForklift('load', docked);
    CT.Audio.play('click');
    this.flags.forklift = true;
    this.refreshAction(); this.hints(true);
    return true;
  };
  Game3D.prototype.requestDeliver = function () {
    if (this.state !== ST.ARRIVED) return false;
    this.drive.stop(); CT.Audio.play('click');
    this.setState(ST.DELIVERING);
    return true;
  };
  Game3D.prototype.requestRecover = function () {
    var it = this.recoverable; if (!it) return false;
    if (!this.cargo.recover(it)) return false;
    CT.Audio.play('pickup');
    this.recoverable = null;
    this.toast('The ' + it.name + ' is back on the truck', 'good');
    this.refreshAction();
    return true;
  };
  Game3D.prototype.startUnload = function () {
    var on = this.cargo.onTruck().sort(function (a, b) { return a.slot - b.slot; });
    this.deliverTarget = on.length;
    this.cargo.fl.s = this.drive.s; this.cargo.fl.lat = 12.5;
    this.cargo.queueForklift('unload', on);
    CT.Audio.play('strap');
  };

  // ---- drag & drop loading
  Game3D.prototype.bindPointer = function () {
    var self = this, canvas = CT.Mode3D.canvas;
    this._pd = function (e) {
      if (self.state !== ST.LOADING || self.paused || self.drag) return;
      var r = canvas.getBoundingClientRect();
      var pick = self.scene.pick(e.clientX - r.left, e.clientY - r.top, function (m) { return m.metadata && m.metadata.cargo && m.metadata.cargo.state === CT.Cargo3D.ST.DOCK; });
      if (!pick || !pick.hit) return;
      if (self.cargo.forkliftBusy()) { self.toast('The forklift is already loading', 'info'); return; }
      var it = pick.pickedMesh.metadata.cargo;
      it.state = CT.Cargo3D.ST.MOVE; it.anim = { fork: true };
      self.drag = { it: it, id: e.pointerId, plane: self.truck.bed.y + self.road.at(self.drive.s).y + 1.6 };
      CT.Audio.play('pickup'); CT.vibrate(15);
      self.hints(true);
      e.preventDefault();
    };
    this._pm = function (e) {
      var d = self.drag; if (!d || e.pointerId !== d.id) return;
      var r = canvas.getBoundingClientRect();
      var ray = self.scene.createPickingRay(e.clientX - r.left, e.clientY - r.top, B.Matrix.Identity(), self.camera);
      if (Math.abs(ray.direction.y) < 1e-3) return;
      var t = (d.plane - ray.origin.y) / ray.direction.y; if (t < 0) return;
      var p = ray.origin.add(ray.direction.scale(t));
      d.it.mesh.position.set(p.x, d.plane, p.z);
      var hit = self.cargo.bedHit(p);
      d.over = hit.inside; d.z = hit.z;
    };
    this._pu = function (e) {
      var d = self.drag; if (!d || e.pointerId !== d.id) return;
      self.drag = null;
      var it = d.it, slot = d.over ? self.cargo.freeSlot(it.id, d.z) : -1;
      if (slot < 0) {
        self.cargo.flyHome(it);
        CT.Audio.play('invalid'); CT.vibrate(40);
        self.toast(d.over ? 'No free space on the bed' : 'Drop the ' + it.name + ' on the truck bed', 'warn');
      } else self.cargo.flyToSlot(it, slot, 0.35);
      self.hints(true);
    };
    canvas.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointermove', this._pm, true);
    window.addEventListener('pointerup', this._pu, true);
    window.addEventListener('pointercancel', this._pu, true);
  };
  Game3D.prototype.cancelDrag = function () {
    if (!this.drag) return;
    var it = this.drag.it; this.drag = null; this.cargo.flyHome(it);
  };

  // ---- damage, crashes, falls
  Game3D.prototype.damage = function (amount) {
    var mult = this.cfg.damageMult * this.damageAssist * (this.level.tutorial ? 0.4 : 1);
    var res = this.cargo.damage(amount, mult);
    if (!res) return 0;
    var self = this;
    this.cargo.onTruck().forEach(function (it) {
      if (it.health <= 0 && !it.destroyed) {
        if (self.level.tutorial) { it.health = 1; return; }
        it.destroyed = true; self.cargo.knockOff(it, self.drive);
      }
    });
    this.health = this.cargo.condition();
    this.updateCargoHud(true);
    this.checkCargoFail();
    return res.amount;
  };
  Game3D.prototype.crash = function (v, msg) {
    if (v < 2.5) return;
    this.crashes++;
    CT.Audio.play('crash'); CT.vibrate([40, 30, 80]);
    this.shake = Math.min(1, v / 15);
    this.cargo.jolt(v * 0.45, 0, 1.5);
    this.damage(4 + v * 1.2);
    this.toast(msg || 'Crash!', 'bad');
  };
  Game3D.prototype.checkCargoFail = function () {
    if (this.level.tutorial || this.state === ST.FAILED || this.state === ST.COMPLETE) return;
    var C = this.cargo;
    if (C.destroyedCount() > 1) this.fail('Cargo destroyed', 'More than one load broke. Slow down for bends, bumps and potholes, and buy Cargo straps and Suspension in the garage.');
    else if (C.onTruck().length + C.fallen().length + C.items.filter(function (it) { return it.state === CT.Cargo3D.ST.MOVE; }).length < this.minDeliver())
      this.fail('Too much cargo lost', 'Too many loads were lost on the way. Drive gently and recover fallen loads.');
  };
  Game3D.prototype.minDeliver = function () { return this.level.tutorial ? this.cargo.required : Math.max(1, this.cargo.required - 1); };

  Game3D.prototype.onTruckFall = function () {
    this.falls++;
    this.prevFallState = this.state;
    this.state = ST.FALLING; this.stateTime = 0;
    CT.Audio.play('alarm'); CT.vibrate([100, 60, 160]);
    this.toast('Oh no! The truck went over the edge!', 'bad');
    hud.root.classList.add('locked');
  };
  Game3D.prototype.respawn = function () {
    var self = this;
    // cargo takes a knock but stays with the truck: fair, kid-friendly recovery
    this.cargo.items.forEach(function (it) {
      if (it.state === CT.Cargo3D.ST.TRUCK) it.health = Math.max(self.level.tutorial ? 1 : 0, it.health - 15 * it.sens * self.damageAssist);
      if (it.state === CT.Cargo3D.ST.FALLEN && !it.destroyed) { it.lost = false; it.rest = true; }
    });
    this.drive.respawn(Math.max(this.road.startS, this.safeS - 6));
    this.cargo.items.forEach(function (it) { if (it.state === CT.Cargo3D.ST.FALLEN && !it.destroyed) { var slot = self.cargo.freeSlot(it.id); if (slot >= 0) { it.mesh.rotation.set(0, 0, 0); self.cargo.attach(it, slot); } } });
    this.health = this.cargo.condition();
    this.camPos = null;
    if (this.falls >= 3 && !this.level.tutorial) {
      this.fail('Fell off the road', 'The truck went over the edge 3 times. Slow down before bends on mountain roads and keep away from the drop. Turn the gyro sensitivity down if steering feels too quick.');
      return;
    }
    this.state = ST.DRIVING; this.setState(ST.DRIVING);
    this.toast('Back on the road! Falls: ' + this.falls + (this.level.tutorial ? '' : ' of 3'), 'warn');
    this.updateCargoHud(true);
    this.checkCargoFail();
  };

  Game3D.prototype.fail = function (title, text) {
    if (this.state === ST.FAILED || this.state === ST.COMPLETE) return;
    var n = CT.Storage.addFail('3d' + this.level.id);
    var help = this.level.tutorial ? '' : n >= 2 ? ' The next try is easier.' : ' Fail once more and the level gets easier.';
    this.failInfo = { title: title, text: text + help };
    CT.Progress.recordFail();
    this.recordDistanceOnce();
    this.setState(ST.FAILED);
    CT.Audio.play('fail'); CT.vibrate([80, 60, 80]);
    var self = this;
    this.later(1.0, function () { hud.root.hidden = true; CT.UI.showFail(self.failInfo); });
    if (this.demo) this.later(1.1, function () { if (CT.Premium) CT.Premium.afterDemo(); });
  };
  Game3D.prototype.recordDistanceOnce = function () {
    if (this.flags.distRecorded) return;
    this.flags.distRecorded = true;
    CT.Progress.recordDistance(Math.round(this.drive.distance));
  };

  Game3D.prototype.complete = function () {
    if (this.state === ST.COMPLETE) return;
    var L = this.level, C = this.cargo, time = this.time;
    var delivered = C.deliveredCount(), lost = C.required - delivered;
    var cond = Math.round(C.items.filter(function (it) { return C.delivered[it.id]; }).reduce(function (s, it) { return s + it.health; }, 0) / Math.max(1, delivered));
    var safe = this.crashes === 0 && this.falls === 0 && cond >= 90 && lost === 0;
    var fast = time <= this.par;
    var stars = 1 + (safe ? 1 : 0) + (fast ? 1 : 0);
    var saved = CT.Storage.completeLevel3d(L.id, { stars: stars, time: time });
    CT.Storage.clearFails('3d' + L.id);
    var br = CT.Rewards.levelBreakdown({ id: L.id * 2, chapter: 0 }, { safe: safe, fast: fast, lost: lost }, saved);
    var coins = CT.Rewards.grant('l3d:' + L.id + ':' + this.attemptId, br.total, false);    // one grant per attempt
    this.recordDistanceOnce();
    CT.Progress.recordDelivery({ delivered: delivered, lost: lost, stars: stars, damagePct: 100 - cond, crashes: this.crashes, violations: 0, fast: fast });
    var why = [];
    if (lost) why.push(lost + ' load' + (lost > 1 ? 's' : '') + ' lost');
    if (cond < 90) why.push('cargo condition ' + cond + '% (needs 90%)');
    if (this.crashes) why.push(this.crashes + ' crash' + (this.crashes > 1 ? 'es' : ''));
    if (this.falls) why.push('fell off the road ' + this.falls + 'x');
    if (!fast) why.push('slower than the ' + CT.UI.fmtTime(this.par) + ' target');
    var next = CT.Levels3D.get(L.id + 1);
    this.result = {
      mode3d: true, levelId: L.id, levelName: '3D · ' + L.name + (this.demo ? ' · ' + this.truck.name + ' demo' : ''),
      loaded: C.loadedCount(), delivered: delivered, required: C.required, lost: lost, condition: cond,
      distance: this.drive.distance, time: time, par: this.par, stars: stars, isBest: saved.isBest, coins: coins, breakdown: br.lines,
      fuelLeft: Math.round(this.fuel / this.fuelMax * 100),
      explain: stars === 3 ? 'Perfect run: every load arrived safely and on time!' : 'Missed stars: ' + why.join(', ') + '.',
      criteria: [
        { ok: true, title: 'Cargo delivered', detail: delivered + '/' + C.required + (lost ? ' · ' + lost + ' lost' : '') },
        { ok: safe, title: 'Safe driving', detail: 'Condition ' + cond + '% · ' + this.crashes + ' crash' + (this.crashes === 1 ? '' : 'es') + ' · ' + this.falls + ' fall' + (this.falls === 1 ? '' : 's') },
        { ok: fast, title: 'Fast delivery', detail: CT.UI.fmtTime(time) + ' (target ' + CT.UI.fmtTime(this.par) + ')' }
      ],
      hasNext: !!next
    };
    this.setState(ST.COMPLETE);
    CT.Audio.play('win'); CT.vibrate([40, 60, 40, 60, 120]);
    var self = this;
    this.later(1.2, function () { hud.root.hidden = true; CT.UI.showWin(self.result); });
    if (this.demo) this.later(1.3, function () { if (CT.Premium) CT.Premium.afterDemo(self.result); });
  };

  Game3D.prototype.later = function (sec, fn) { this.timers.push({ t: sec, fn: fn }); };

  // ------------------------------------------------------------------ per-frame
  Game3D.prototype.input = function () {
    var steer = 0, W = hud.wheel;
    if (W.id === null && Math.abs(W.angle) > 0.001) W.angle *= Math.pow(0.0015, this.lastDt || 0.016);   // spring back to straight
    if (Math.abs(W.angle) < 0.01) W.angle = 0;
    if (W.id !== null || W.angle) steer = W.angle / 2.4;
    if (held('left')) steer = -1;
    if (held('right')) steer = 1;
    if (!steer && this.gyroOn && CT.Controls.gyroAvailable) {
      var g = CT.Controls.steerTilt;
      steer = Math.abs(g) < 0.06 ? 0 : g;
    }
    var inp = { gas: held('gas'), brake: held('brake'), reverse: held('reverse'), steer: steer };
    if (CT.botInput3d) inp = CT.botInput3d;
    return inp;
  };

  Game3D.prototype.update = function (dt) {
    this.lastDt = dt;
    if (!this._bound) { this._bound = true; this.bindPointer(); }
    this.t += dt; this.stateTime += dt;
    for (var i = this.timers.length - 1; i >= 0; i--) { var tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    var s = this.state, d = this.drive, L = this.level;
    var ended = s === ST.COMPLETE || s === ST.FAILED;
    if (!ended && s !== ST.LOADING) this.time += dt;
    var inp = this.input();

    if (s === ST.FALLING) {
      var ft = d.updateFall(dt);
      if (ft > 2.2) this.respawn();
    } else {
      var prevS = d.s;
      this.applySurface();
      var moved = d.update(dt, inp);
      if (!ended && (s === ST.READY || s === ST.DRIVING || s === ST.ARRIVED)) {
        this.checkRoad(prevS, d.s);
        this.updateFuel(dt, moved, inp);
        if (Math.abs(d.lat) < 3.2 && this.road.cliffAt(d.s) === null || Math.abs(d.lat - CT.Road3D.LANE_R) < 1.6) {
          if (d.s > this.safeS) this.safeS = d.s;            // last safe spot for a respawn
        }
      }
    }
    if (this.traffic) {
      this.traffic.update(dt, this.truck, d);
      if (s === ST.DRIVING || s === ST.ARRIVED || s === ST.READY) {
        var self = this;
        this.traffic.collide(this.truck, d).forEach(function (h) {
          d.v *= h.front ? 0.35 : 0.8;
          self.cargo.jolt(h.rel * 0.5 * (h.front ? 1 : -1), 0, 1.5);
          self.crash(h.rel, 'Crash! Keep a safe distance and overtake only when the left lane is clear');
        });
      }
    }
    var tp = this.truck.root.position, near = this.crowds.filter(function (c, i) { return i === 0 ? d.s < 120 : d.s > this.road.zone.s1 - 150; }, this);
    near.forEach(function (c) { c.update(dt, tp); });
    this.cargo.update(dt, d);
    this.road.update(this.t, this.truck.root);

    if (s === ST.LOADING) {
      var n = this.cargo.loadedCount();
      if (n >= this.cargo.required && !this.cargo.forkliftBusy() && this.stateTime > 0.2 && !this.cargo.items.some(function (it) { return it.state === CT.Cargo3D.ST.MOVE; })) this.setState(ST.READY);
      else if (this.cargo.forkliftBusy()) this.setProgress(n / this.cargo.required, this.cargo.forkliftRemaining());
    } else if (s === ST.READY) {
      if (inp.gas || inp.reverse) this.setState(ST.DRIVING);
    }
    if (s === ST.DRIVING || s === ST.ARRIVED || s === ST.READY) {
      var z = this.road.zone, inZone = d.s >= z.s1 - 1 && d.s <= z.s2 + 1 && d.lat > 0.2 && Math.abs(Math.sin(d.yaw - this.road.at(d.s).h)) < 0.45;
      this.inZone = inZone;
      var ready = inZone && Math.abs(d.v) < 0.8 && !inp.gas && !inp.reverse && this.cargo.onTruck().length >= this.minDeliver() &&
        !this.cargo.items.some(function (it) { return it.state === CT.Cargo3D.ST.MOVE; });
      if (this.state === ST.DRIVING && ready) this.setState(ST.ARRIVED);
      else if (this.state === ST.ARRIVED && !ready) this.setState(ST.DRIVING);
      var rec = this.cargo.recoverable(d);
      if (rec !== this.recoverable) { this.recoverable = rec; this.refreshAction(); this.hints(true); }
      if (z.s1 - d.s < 60 && !this.flags.tutNear) { this.flags.tutNear = true; this.tutorial(3); }
    }
    if (s === ST.DELIVERING) {
      this.setProgress(this.cargo.deliveredCount() / Math.max(1, this.deliverTarget), this.cargo.forkliftRemaining());
      if (this.cargo.deliveredCount() >= this.deliverTarget && !this.cargo.forkliftBusy()) this.complete();
    }
    if (this.timeLimit && !ended && s !== ST.LOADING && s !== ST.DELIVERING && s !== ST.FALLING) {
      var left = this.timeLimit - this.time;
      if (left < 15 && !this.flags.timeWarned) { this.flags.timeWarned = true; CT.Audio.play('alarm'); this.toast('15 seconds left!', 'warn'); }
      if (left <= 0) this.fail("Time's up", 'The delivery took too long. Upgrade the engine, and take bends smoothly.');
    }
    // engine sound + exhaust
    if (s === ST.READY || s === ST.DRIVING || s === ST.ARRIVED || s === ST.DELIVERING) CT.Audio.engineSet(Math.min(1, Math.abs(d.v) / d.cfg.top), d.throttle + d.rev * 0.7);
    if (d.rev > 0.2 && Math.abs(d.v) > 0.3 && this.t - (this.flags.beepT || 0) > 0.9) { this.flags.beepT = this.t; CT.Audio.play('reverse'); }
    if (d.braking && Math.abs(d.v) > 16 && !this.flags.squeal) { this.flags.squeal = true; CT.Audio.play('brake'); } else if (!d.braking) this.flags.squeal = false;
    this.updateSmoke(dt);
    this.updateCamera(dt);
    this.updateHud();
    this.hints(false);
  };

  Game3D.prototype.applySurface = function () {
    var d = this.drive, sec = this.road.sectionAt(d.s), tyre = 1 - this.cfg.tyres * 0.08, surf = null;
    if (sec) {
      if (sec.type === 'mud') surf = { grip: 1 - 0.25 * tyre, drag: 1.4, cap: (45 + this.cfg.tyres * 3) / 3.6 };
      else if (sec.type === 'ice') surf = { grip: 1 - 0.5 * tyre };
      else if (sec.type === 'rough') surf = { grip: 0.95, drag: 0.3, rough: true };
      if (!this.flags['sec' + sec.s1]) {
        this.flags['sec' + sec.s1] = true;
        var MSG = { mud: 'Mud! The truck slows down', ice: 'Ice! Brake early and steer gently', rough: 'Rough road! Slow down to protect the cargo', narrow: 'Roadworks: keep to the RIGHT lane', bridge: 'Bridge ahead' };
        if (MSG[sec.type]) this.toast(MSG[sec.type], sec.type === 'ice' || sec.type === 'narrow' ? 'warn' : 'info');
      }
    }
    var cl = this.road.cliffAt(d.s);
    if (cl && !this.flags['cl' + cl.s1]) { this.flags['cl' + cl.s1] = true; this.toast(cl.rail ? 'Mountain road: steep drop beside the rail' : 'Careful! Steep drop, no rail. Slow down!', 'warn'); }
    if (this.level.weather === 'rain') surf = Object.assign({ grip: 1 }, surf || {}, { grip: ((surf && surf.grip) || 1) * 0.92 });
    d.surface = surf;
  };

  Game3D.prototype.checkRoad = function (s0, s1) {
    var d = this.drive, self = this, kmh = Math.abs(d.v) * 3.6;
    var front = this.truck.halfLen - 0.9;
    this.road.obstacles.forEach(function (o) {
      var a = s0 + front, b = s1 + front;
      if (!((a < o.s && b >= o.s) || (a > o.s && b <= o.s))) return;
      if (o.type === 'bump') {
        d.kick(Math.min(3, 0.6 + kmh * 0.03));
        CT.Audio.play('bump');
        if (kmh > 30) {
          self.cargo.jolt((kmh - 30) * 0.05, 0, (kmh - 30) * 0.12);
          self.damage((kmh - 30) * 0.25);
          self.toast('Too fast over the speed bump!', 'warn');
        }
      } else if (o.type === 'pothole') {
        if (Math.abs(d.lat - o.lat) > 1.7) return;
        d.kick(Math.min(3, 0.8 + kmh * 0.035));
        CT.Audio.play('bump');
        self.cargo.jolt((kmh) * 0.02, 0, kmh * 0.08);
        if (kmh > 25) { self.damage((kmh - 25) * 0.3); self.toast('Pothole! Steer around it', 'warn'); }
      } else if (o.type === 'cone') {
        if (d.lat > o.lat + 1.2 + 0.3) return;
        if (!o.hit) { o.hit = true; d.v *= 0.6; self.damage(3 + kmh * 0.05); CT.Audio.play('bump'); self.toast('You hit the cones! Keep RIGHT', 'bad'); }
      }
    });
    var sec = this.road.sectionAt(d.s);
    if (sec && sec.type === 'rough' && kmh > 45 && this.t - (this.flags.roughT || 0) > 0.35) {
      this.flags.roughT = this.t;
      d.kick(0.5); this.cargo.jolt(0, 0, (kmh - 45) * 0.05); this.damage((kmh - 45) * 0.05);
    }
  };

  Game3D.prototype.updateFuel = function (dt, moved, inp) {
    var d = this.drive, use = this.level.fuel * 100 / this.road.length * moved * (0.5 + 0.7 * d.throttle + 0.3 * d.rev) * (1 + this.cargo.weightOnTruck() * 0.025);
    if (this.state !== ST.READY) use += dt * 0.02;
    this.fuel = Math.max(0, this.fuel - use);
    if (this.fuel / this.fuelMax < 0.2 && !this.flags.fuelWarn && this.fuel > 0) { this.flags.fuelWarn = true; CT.Audio.play('lowfuel'); this.toast(this.cfg.electric ? 'Battery low!' : 'Low fuel!', 'warn'); }
    if (this.fuel <= 0 && !d.noPower) { d.noPower = true; CT.Audio.play('alarm'); this.toast(this.cfg.electric ? 'Battery empty!' : 'Out of fuel!', 'bad'); }
    if (d.noPower && Math.abs(d.v) < 0.3 && !this.inZone) {
      this.flags.noFuelT = (this.flags.noFuelT || 0) + dt;
      if (this.flags.noFuelT > 1.5) this.fail(this.cfg.electric ? 'Battery empty' : 'Out of fuel', 'The truck ran out before the delivery. Drive smoothly and buy a bigger Fuel tank in the garage.');
    }
  };

  // ------------------------------------------------------------------ camera
  Game3D.prototype.cycleCam = function () {
    this.camMode = CAMS[(CAMS.indexOf(this.camMode) + 1) % CAMS.length];
    if (this.truck.driver) this.truck.driver.setEnabled(this.camMode !== 'cab');
    CT.Storage.setSetting('cam3d', this.camMode);
    this.camPos = null;
    CT.Audio.play('click');
    this.updateCamLabel();
  };
  Game3D.prototype.updateCamLabel = function () { $('h3Cam').textContent = { chase: 'TPP', far: 'HIGH', cab: 'FPP' }[this.camMode]; };

  Game3D.prototype.updateCamera = function (dt) {
    var d = this.drive, cam = this.camera, s = this.state, r = this.road;
    var tp = this.truck.root.position, fwd = new V3(Math.sin(d.yaw), 0, Math.cos(d.yaw));
    var portrait = window.innerHeight > window.innerWidth;
    var spd = Math.min(1, Math.abs(d.v) / 30);
    cam.fov = (portrait ? 1.15 : 0.88) + spd * 0.12;
    var pos, look, k = 3.5;
    if (s === ST.LOADING || s === ST.DELIVERING || (s === ST.COMPLETE && this.stateTime < 3)) {
      // side view over the dock: truck, pallets and forklift in frame
      // high view from across the road: truck, pallets, forklift and the warehouse behind them
      pos = r.world(d.s - (portrait ? 13 : 10), portrait ? -9 : -6.5, portrait ? 14 : 9.5);
      look = r.world(d.s + 1.5, 9, -0.5);
      k = 2.5;
    } else if (s === ST.FALLING) {
      pos = this.camPos ? this.camPos.clone() : tp.add(new V3(0, 8, 0));
      look = tp.clone(); k = 6;
    } else if (this.camMode === 'cab') {
      if (this.truck.driver && this.truck.driver.isEnabled()) this.truck.driver.setEnabled(false);
      this.truck.body.computeWorldMatrix(true);
      var m = this.truck.body.getWorldMatrix();
      pos = V3.TransformCoordinates(this.truck.cabCam, m);
      look = pos.add(fwd.scale(20)).add(new V3(0, -1.2, 0));
      cam.position.copyFrom(pos); cam.setTarget(look); this.camPos = pos; return;
    } else {
      var far = this.camMode === 'far', back = far ? 22 : 13.5, up = far ? 11 : 5.6;
      // look ahead along the road so bends are visible early
      var ahead = r.at(d.s + 14 + Math.abs(d.v) * 0.6);
      var aheadP = new V3(ahead.x + ahead.rx * d.lat, ahead.y, ahead.z + ahead.rz * d.lat);
      var dir = d.v < -0.5 ? fwd.scale(-1) : fwd;
      pos = tp.subtract(dir.scale(back)).add(new V3(0, up, 0));
      look = V3.Lerp(tp.add(new V3(0, 2.2, 0)), aheadP.add(new V3(0, 1.5, 0)), 0.45);
      if (d.v < -0.5) look = tp.add(new V3(0, 2, 0));
      k = 4;
    }
    // never let the camera dip under the ground
    var ground = r.at(r.project(pos.x, pos.z, d.s).s).y + 1.5;
    if (pos.y < ground) pos.y = ground;
    if (!this.camPos) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    var a = Math.min(1, dt * k);
    this.camPos = V3.Lerp(this.camPos, pos, a);
    this.camLook = V3.Lerp(this.camLook, look, Math.min(1, dt * k * 1.4));
    var sh = this.shake || 0;
    cam.position.copyFrom(this.camPos);
    if (sh > 0) { cam.position.x += (Math.random() - 0.5) * sh * 0.4; cam.position.y += (Math.random() - 0.5) * sh * 0.3; this.shake = Math.max(0, sh - dt * 2.5); }
    cam.setTarget(this.camLook);
    // the sun's shadow box follows the truck
    this.sun.position = tp.add(new V3(30, 60, -25));
  };

  // ------------------------------------------------------------------ exhaust smoke
  Game3D.prototype.initSmoke = function () {
    if (this.kit.lowFx || !this.truck.exhaust) return;
    var ps = new B.ParticleSystem('exhaust', 120, this.scene);
    ps.particleTexture = this.kit.dotTex();
    var em = new B.TransformNode('exEm', this.scene); em.parent = this.truck.body; em.position.copyFrom(this.truck.exhaust);
    ps.emitter = em;
    ps.color1 = new B.Color4(0.5, 0.5, 0.52, 0.22); ps.color2 = new B.Color4(0.6, 0.6, 0.62, 0.14); ps.colorDead = new B.Color4(0.7, 0.7, 0.72, 0);
    ps.minSize = 0.14; ps.maxSize = 0.32; ps.minLifeTime = 0.5; ps.maxLifeTime = 1.0;
    ps.emitRate = 12; ps.direction1 = new V3(-0.2, 1.5, -0.4); ps.direction2 = new V3(0.2, 2, -0.8);
    ps.minEmitPower = 0.6; ps.maxEmitPower = 1.2; ps.gravity = new V3(0, 0.6, 0);
    ps.start();
    this.smoke = ps;
  };
  Game3D.prototype.updateSmoke = function () {
    if (!this.smoke) return;
    this.smoke.emitRate = this.state === ST.COMPLETE || this.state === ST.FAILED ? 4 : 10 + this.drive.throttle * 40;
  };

  // ------------------------------------------------------------------ HUD
  Game3D.prototype.setProgress = function (frac, secs) {
    var p = $('h3Prog'); if (p.hidden) p.hidden = false;
    $('h3Bar').style.width = Math.round(clamp(frac, 0, 1) * 100) + '%';
    $('h3Time').textContent = CT.UI.fmtTime(Math.ceil(Math.max(0, secs)));
  };
  Game3D.prototype.toast = function (msg, tone) {
    this.toastUntil = performance.now() + 2200;
    this.banner(msg, '', tone || 'warn', true);
  };
  Game3D.prototype.banner = function (title, sub, tone, pop) {
    var b = $('h3Banner');
    b.className = 'banner' + (tone ? ' ' + tone : '');
    $('h3Title').textContent = title; $('h3Sub').textContent = sub || '';
    if (pop) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  };
  Game3D.prototype.hints = function (force) {
    if (performance.now() < (this.toastUntil || 0)) return;
    var s = this.state, d = this.drive, z = this.road.zone, key, t, sub = '', tone = '';
    var rem = Math.max(0, Math.round((z.s1 + z.s2) / 2 - d.s));
    switch (s) {
      case ST.LOADING:
        var n = this.cargo.loadedCount();
        if (this.drag) { key = 'drag'; t = 'Drop it on the truck bed'; sub = 'Move it over the truck and let go'; }
        else if (this.cargo.forkliftBusy()) { key = 'fl' + n; t = 'The forklift is loading'; sub = n + '/' + this.cargo.required + ' on the truck'; }
        else { key = 'ld' + n; t = 'Drag a box onto the truck'; sub = n + '/' + this.cargo.required + ' loaded · or tap LOAD'; }
        break;
      case ST.READY: key = 'ready'; t = 'Cargo loaded! Let’s go'; sub = 'Hold GAS to drive'; tone = 'good'; break;
      case ST.DRIVING:
        var fallen = this.cargo.fallen();
        if (this.recoverable) { key = 'rec'; t = 'Cargo on the road!'; sub = 'Tap RECOVER'; tone = 'warn'; }
        else if (fallen.length && this.cargo.onTruck().length < this.minDeliver()) { key = 'fallen'; t = 'Go back for the ' + fallen[0].name; sub = 'Stop next to it'; tone = 'warn'; }
        else if (this.inZone && Math.abs(d.v) >= 0.8) { key = 'brake'; t = 'You are in the bay!'; sub = 'Hold BRAKE to stop'; tone = 'warn'; }
        else if (this.inZone) { key = 'rel'; t = 'Let go of the pedals'; sub = 'Stop to deliver'; }
        else if (d.s > z.s2 + 1) { key = 'over'; t = 'A little too far!'; sub = 'Hold R to back into the bay'; tone = 'warn'; }
        else if (z.s1 - d.s < 80) { key = 'near'; t = 'Stop in the green bay'; sub = 'Slow down and BRAKE'; }
        else if (this.traffic && (this._ahead = this.traffic.ahead(d)) && this._ahead.d < 45 && this._ahead.car.dir > 0 && this._ahead.car.v < d.v + 1) { key = 'traffic'; t = 'Slow vehicle ahead'; sub = 'Brake, or overtake on the left when no car is coming'; tone = 'warn'; }
        else if (this.traffic && this._ahead && this._ahead.car.dir < 0 && this._ahead.d < 90) { key = 'oncoming'; t = 'Oncoming car!'; sub = 'Steer back to the RIGHT lane'; tone = 'bad'; }
        else { key = 'drive'; t = 'Drive to the ' + 'Delivery Hub'; sub = rem + ' m to go'; }
        break;
      case ST.ARRIVED: key = 'arr'; t = this.recoverable ? 'Cargo on the road!' : 'Perfect stop!'; sub = this.recoverable ? 'Tap RECOVER first' : 'Tap DELIVER to unload'; tone = 'good'; break;
      case ST.DELIVERING: key = 'del' + this.cargo.deliveredCount(); t = 'The forklift is unloading'; sub = this.cargo.deliveredCount() + '/' + this.deliverTarget + ' delivered'; break;
      case ST.FALLING: key = 'fall'; t = 'Over the edge!'; sub = 'Putting the truck back on the road…'; tone = 'bad'; break;
      case ST.COMPLETE: key = 'done'; t = 'DELIVERY SUCCESSFUL!'; tone = 'good'; break;
      case ST.FAILED: key = 'failed'; t = this.failInfo ? this.failInfo.title : 'Failed'; tone = 'bad'; break;
    }
    if (key === 'drive' && this.hintKey === 'drive' && !force) { $('h3Sub').textContent = sub; return; }
    if (key !== this.hintKey || force) {
      var pop = key !== this.hintKey;
      this.hintKey = key;
      this.banner(t, sub, tone, pop);
      if (s !== ST.LOADING && s !== ST.DELIVERING) $('h3Prog').hidden = true;
      this.refreshAction();
      this.pulse(key === 'ready' || key === 'drive' && this.level.tutorial ? 'gas' : key === 'brake' || key === 'near' ? 'brake' : key === 'over' ? 'reverse' : null);
    }
  };
  Game3D.prototype.pulse = function (k) {
    Array.prototype.forEach.call(hud.root.querySelectorAll('[data-k3]'), function (b) { b.classList.toggle('hint', b.getAttribute('data-k3') === k); });
  };
  Game3D.prototype.refreshAction = function () {
    var b = $('h3Action'), s = this.state, text = '', hint = '', mode = null, dis = false;
    if (s === ST.LOADING && !this.cargo.forkliftBusy() && this.cargo.loadedCount() < this.cargo.required && !this.drag) { mode = 'load'; text = 'LOAD'; hint = 'Forklift loads it for you'; }
    else if (this.recoverable && (s === ST.DRIVING || s === ST.ARRIVED || s === ST.READY)) { mode = 'recover'; text = 'RECOVER'; hint = 'Put the cargo back'; }
    else if (s === ST.ARRIVED) { mode = 'deliver'; text = 'DELIVER'; hint = 'Tap to unload'; }

    b.hidden = !mode;
    $('h3ActHint').textContent = mode ? hint : '';
    if (mode) {
      $('h3ActText').textContent = text; b.disabled = dis;
      b.className = 'btn-action ' + mode + (dis ? '' : ' glow');
    }
  };
  Game3D.prototype.updateCargoHud = function (bump) {
    var C = this.cargo, s = this.state;
    var n = s === ST.DELIVERING || s === ST.COMPLETE ? C.deliveredCount() : s === ST.LOADING ? C.loadedCount() : C.onTruck().length;
    $('h3Cargo').textContent = n + '/' + C.required;
    this.health = C.condition();
    var hb = $('h3Health'); hb.style.width = Math.max(0, this.health) + '%'; hb.style.background = this.health > 60 ? '#35d55a' : this.health > 30 ? '#ffc21a' : '#ff4b3e';
    $('h3Pips').innerHTML = C.items.map(function (it) {
      if (it.lost || it.destroyed) return '<i class="lost"></i>';
      if (it.state === CT.Cargo3D.ST.DOCK) return '<i style="opacity:.35"></i>';
      return '<i class="' + (it.health > 70 ? '' : it.health > 35 ? 'mid' : 'low') + '"></i>';
    }).join('');
  };
  Game3D.prototype.updateHud = function () {
    var d = this.drive, kmh = Math.round(Math.abs(d.v) * 3.6);
    if (this._kmh !== kmh) {
      this._kmh = kmh;
      $('h3Speed').textContent = kmh;
      var frac = clamp(kmh / Math.max(60, d.cfg.top * 3.6), 0, 1);
      $('h3Needle').setAttribute('transform', 'rotate(' + (-90 + frac * 180) + ' 60 70)');
      $('h3Arc').setAttribute('stroke-dashoffset', String(157 * (1 - frac)));
      $('h3Arc').setAttribute('stroke', frac > 0.85 ? '#ff4b3e' : frac > 0.6 ? '#ffc21a' : '#35d55a');
    }
    var ff = this.fuel / this.fuelMax, fw = Math.round(ff * 100);
    if (this._fw !== fw) { this._fw = fw; var fb = $('h3Fuel'); fb.style.width = fw + '%'; fb.style.background = ff > 0.4 ? (this.cfg.electric ? '#4fc3ff' : '#ffc21a') : ff > 0.2 ? '#ff8a1f' : '#ff4b3e'; $('h3FuelChip').classList.toggle('low', ff < 0.2); }
    var z = this.road.zone, m = Math.max(0, Math.round((z.s1 + z.s2) / 2 - d.s));
    var txt = this.inZone ? 'Arrived' : (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : m + ' m') + (this.timeLimit ? ' · ⏱ ' + CT.UI.fmtTime(Math.max(0, this.timeLimit - this.time)) : '');
    if (this._dt !== txt) { this._dt = txt; $('h3Dist').textContent = txt; }
    if (!this._cargoHud || this.t - this._cargoHud > 0.5) { this._cargoHud = this.t; this.updateCargoHud(false); }
    $('h3Gyro').hidden = !(this.gyroOn && CT.Controls.gyroAvailable);
    var wa = hud.wheel.id !== null ? hud.wheel.angle : d.steer / (d.cfg.steerMax || 0.55) * 2.4;
    var wr = Math.round(wa * 57.3);
    if (this._wr !== wr) { this._wr = wr; $('h3WheelSvg').style.transform = 'rotate(' + wr + 'deg)'; }
  };

  // ---- tutorial cards (level 1 only)
  Game3D.prototype.tutorial = function (step) {
    if (!this.level.tips || step <= this.tutStep) return;
    this.tutStep = step;
    var TXT = {
      1: '<b>Load the truck</b>Drag each box from the pallet onto the truck bed. Or tap <b>LOAD</b> and the forklift does it.',
      2: '<b>Drive</b>Hold <b>GAS</b> to go, <b>BRAKE</b> to slow down, <b>R</b> to reverse. Steer with <b>◀ ▶</b> (or turn on gyro in Pause).',
      3: '<b>Almost there</b>Slow down and stop inside the <b>green bay</b> by the Delivery Hub.',
      4: '<b>Deliver</b>Tap <b>DELIVER</b>. The forklift unloads your cargo.'
    };
    $('h3TutText').innerHTML = TXT[step];
    $('h3Tut').hidden = false;
    var self = this;
    clearTimeout(this._tutTimer);
    this._tutTimer = setTimeout(function () { if (self.tutStep === step) $('h3Tut').hidden = true; }, 7000);
  };
  Game3D.prototype.onControlTouch = function (k) {
    if (this.state === ST.LOADING && (k === 'gas' || k === 'reverse')) this.toast('Load all the cargo first', 'warn');
  };

  // ---- gyro
  Game3D.prototype.applySteerMode = function () {
    var mode = CT.Storage.getSetting('steerMode') === 'buttons' ? 'buttons' : 'wheel';
    hud.root.classList.toggle('steer-wheel', mode === 'wheel');
    hud.root.classList.toggle('steer-buttons', mode === 'buttons');
    Array.prototype.forEach.call(document.querySelectorAll('[data-steer]'), function (b) { b.classList.toggle('on', b.getAttribute('data-steer') === mode); });
  };
  Game3D.prototype.syncGyroUi = function () {
    this.applySteerMode();
    this.gyroOn = CT.Storage.getSetting('gyro') === true;
    CT.Controls.neutral = CT.Storage.getSetting('gyroNeutral') || 0;
    if (this.gyroOn) CT.Controls.enableGyro(true, function () {});
    $('p3Gyro').checked = this.gyroOn;
    var v = CT.Storage.getSetting('gyroSens') || 15;
    $('p3Sens').value = v; $('p3SensVal').textContent = '(full turn at ' + v + '°)';
    $('p3Low').checked = !!CT.Storage.getSetting('lowFx');
  };
  Game3D.prototype.setGyro = function (on) {
    var self = this;
    CT.Controls.enableGyro(on, function (ok) {
      self.gyroOn = ok;
      CT.Storage.setSetting('gyro', ok);
      $('p3Gyro').checked = ok;
      if (on && !ok) { $('p3GyroNote').textContent = '(not available: use ◀ ▶)'; self.toast('Gyro not available on this device. Using the steering buttons.', 'warn'); }
      else if (ok) { CT.Controls.calibrate(); CT.Storage.setSetting('gyroNeutral', CT.Controls.neutral); $('p3GyroNote').textContent = '(tilt the phone)'; }
    });
    setTimeout(function () { if (self.gyroOn && !CT.Controls.gyroAvailable) $('p3GyroNote').textContent = '(no tilt data yet: buttons still work)'; }, 1500);
  };

  // ---- pause / resume / restart / quit
  Game3D.prototype.pause = function () {
    if (this.paused || this.state === ST.COMPLETE || this.state === ST.FAILED) return;
    this.paused = true; CT.Mode3D.paused = true;
    hud.keys = {}; hud.pointers = {};
    CT.Audio.engineOff();
    this.cancelDrag();
    this.syncGyroUi();
    hud.pause.hidden = false;
  };
  Game3D.prototype.resume = function () {
    if (!this.paused) return;
    this.paused = false; CT.Mode3D.paused = false;
    hud.pause.hidden = true;
    var s = this.state;
    if (s === ST.READY || s === ST.DRIVING || s === ST.ARRIVED || s === ST.DELIVERING) CT.Audio.engineOn();
  };
  Game3D.prototype.restart = function () {
    var id = this.level.id, demo = this.demo;
    hud.pause.hidden = true; CT.Mode3D.paused = false;
    this.recordDistanceOnce();
    if (demo && CT.Premium && !CT.Premium.canDemo() && !CT.Premium.owned()) { this.quit(); CT.Premium.openPurchase(); return; }
    Game3D.play(id, { demo: demo });
  };
  Game3D.prototype.quit = function () {
    this.recordDistanceOnce();
    hud.pause.hidden = true; hud.root.hidden = true;
    CT.Mode3D.paused = false;
    CT.Mode3D.stop();
    Game3D.cur = null;
    CT.UI.resultOwner = '2d';
    CT.game.toMenu();
  };

  Game3D.prototype.back = function () {
    if (this.state === ST.COMPLETE || this.state === ST.FAILED) { CT.UI.hideWin(); CT.UI.hideFail(); this.quit(); }
    else if (this.paused) this.resume(); else this.pause();
  };

  Game3D.prototype.dispose = function () {
    var c = CT.Mode3D.canvas;
    if (this._pd) { c.removeEventListener('pointerdown', this._pd); window.removeEventListener('pointermove', this._pm, true); window.removeEventListener('pointerup', this._pu, true); window.removeEventListener('pointercancel', this._pu, true); }
    clearTimeout(this._tutTimer);
    if (hud) { hud.root.hidden = true; hud.pause.hidden = true; $('h3Tut').hidden = true; }
    this.timers = [];
    this.scene.dispose();
  };

  CT.Game3D = Game3D;
})(window.CT);
