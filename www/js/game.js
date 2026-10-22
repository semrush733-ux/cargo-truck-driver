/* game.js — state machine, update loop, traffic/curve/bump/red-light rules, worker loading, easy-mode help,
   scoring, camera, speed effects and rendering. */
(function (CT) {
  'use strict';
  var D = CT.Draw;
  var K = CT.K;

  var S = {
    MAIN_MENU: 'MAIN_MENU', LOADING: 'LOADING', READY_TO_DRIVE: 'READY_TO_DRIVE', DRIVING: 'DRIVING',
    ARRIVED: 'ARRIVED', DELIVERING: 'DELIVERING', LEVEL_COMPLETE: 'LEVEL_COMPLETE', LEVEL_FAILED: 'LEVEL_FAILED', PAUSED: 'PAUSED'
  };
  var DRIVE_STATES = [S.READY_TO_DRIVE, S.DRIVING, S.ARRIVED];
  var PLAY_STATES = [S.LOADING, S.READY_TO_DRIVE, S.DRIVING, S.ARRIVED, S.DELIVERING];
  var CAMERAS = ['side', 'chase', 'cab'];
  var VIEW_H = 760;
  var PALLET_Y = 100;

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = S.MAIN_MENU;
    this.prevState = null;
    this.stateTime = 0;
    this.t = 0; this.lt = 0;
    this.effects = new CT.Effects();
    this.view3d = new CT.View3D();
    this.view = { W: 1, H: 1, dpr: 1, scale: 1, baseScale: 1, groundY: 1, camX: 0, camY: 0, t: 0, lt: 0, shakeX: 0, shakeY: 0 };
    this.shake = 0;
    this.fade = 0;
    this.speedFx = 0;
    this.level = null;
    this.timers = [];
    this.hintKey = '';
    this.zone = { inside: false, ready: false, show: false };
    this.camMode = CAMERAS.indexOf(CT.Storage.getSetting('camera')) >= 0 ? CT.Storage.getSetting('camera') : 'side';
    this.health = 100;
    this.assist = 0;
    this.setupMenuScene();
  }

  Game.STATES = S;
  Game.CAMERAS = CAMERAS;

  // ================================================================ setup
  Game.prototype.applyPaint = function () { CT.Garage.applyLook(); };
  var attemptSeq = 0;

  Game.prototype.setupMenuScene = function () {
    var L = CT.Levels.get(1);
    this.applyPaint();
    this.menuWorld = new CT.World(L);
    var tr = new CT.Truck({ maxSpeed: 200 * K, accel: 200 * K });
    tr.place(1900, this.menuWorld.heightAt);
    var cm = new CT.CargoManager({ cargo: { items: ['crate', 'barrel', 'box'], count: 3 } });
    cm.items.forEach(function (it, i) { cm.placeOnTruck(it, i); it.strap = 1; it.pop = 0; });
    tr.cargoWeight = cm.weightOnTruck();
    this.menuScene = { truck: tr, cargo: cm };
    this.view.camX = tr.x;
  };

  Game.prototype.startLevel = function (id) {
    var L = CT.Levels.get(id);
    if (!L || !L.implemented) return false;
    this.applyPaint();
    this.level = L;
    this.world = new CT.World(L);

    // easy-mode help after repeated failures
    var fails = CT.Storage.getFails(L.id);
    this.assist = L.tutorial ? 0 : fails >= 3 ? 2 : fails >= 2 ? 1 : 0;
    this.timeLimit = L.timeLimit ? Math.round(L.timeLimit * (1 + 0.3 * this.assist)) : null;
    this.par = Math.round(L.par * (1 + 0.12 * this.assist));
    this.damageAssist = 1 - 0.3 * this.assist;

    var tr = new CT.Truck(CT.Garage.truckConfig(L));
    tr.minX = L.road.start + 40 - CT.Truck.REAR;
    tr.maxX = L.road.end - 40 - CT.Truck.FRONT;
    tr.place(L.start.x, this.world.heightAt);
    var self = this;
    tr.onImpact = function (speed, dir) { self.onImpact(speed, dir); };
    this.truck = tr;

    var sx = L.start.x, zc = (L.destination.zone.x1 + L.destination.zone.x2) / 2;
    this.loadPallets = [0, 1, 2].map(function (i) { return { x: sx - 620 + i * 125, y: PALLET_Y }; });
    this.dropPallets = [0, 1, 2].map(function (i) { return { x: zc - 650 - i * 125, y: PALLET_Y }; });
    this.cargo = new CT.CargoManager(L, this.loadPallets);
    this.cargo.stability = tr.cfg.stability;
    this.cargo.onImpact = function (it, hit) { self.onCargoGround(it, hit); };
    this.fuelMax = tr.cfg.fuelCapacity; this.fuel = this.fuelMax;
    this.attemptId = (++attemptSeq) + '-' + Date.now();
    this.drag = null; this.tweens = [];
    this.knock = { curveT: 0, coneCd: 0, roughT: 0, lastLoss: -9 };
    this.noFuelT = 0; this.deliverTarget = 0; this.recoverable = null;
    this.loadCrew = new CT.Crew(this, 'load', this.loadPallets);
    this.loadCrew.assign(this.cargo.items);
    this.loadCrew.onItem = function (it, counted) { self.onLoaded(it, counted); };
    this.dropCrew = new CT.Crew(this, 'unload', this.dropPallets);
    this.dropCrew.onItem = function (it, counted) { self.onDelivered(it, counted); };

    this.traffic = L.traffic ? new CT.Traffic(L, this.world) : null;
    if (this.traffic) { this.traffic.densityMult = 1 - 0.3 * this.assist; this.traffic.init(tr); }
    this.stats = { time: 0, startX: L.start.x };
    this.health = 100;
    this.crashes = 0; this.violations = 0; this.curveHits = 0; this.bumpHits = 0;
    this.flags = { winShown: false, failShown: false, brakeSqueal: false, curveWarned: {}, timeWarned: false, fuelWarned: false, distRecorded: false, sectWarned: {} };
    this.winTimer = -1; this.failTimer = -1;
    this.smokeT = 0; this.dustT = 0; this.squealT = 0;
    this.lt = 0;
    this.timers = [];
    this.effects.clear();
    this.zone = { inside: false, ready: false, show: false };
    this.hintKey = '';
    this.shake = 0; this.fade = 1; this.speedFx = 0;
    this.result = null; this.failInfo = null;
    CT.Controls.releaseAll();
    this.view.camX = this.cameraTarget(S.LOADING);
    this.view.camY = tr.y;
    this.setState(S.LOADING);
    CT.UI.enterLevel(L, this);
    CT.UI.setCargo(0, this.cargo.required);
    // the player drags each load onto the bed, or taps LOAD and the workers do it
    if (this.assist > 0) {
      this.later(0.4, function () { CT.UI.toast(self.assist > 1 ? 'Easy mode+: more time, less traffic, tougher cargo' : 'Easy mode: more time and less traffic', 'info'); });
    }
    return true;
  };

  Game.prototype.toMenu = function () {
    this.recordDistanceOnce();
    this.drag = null;
    CT.Audio.engineOff();
    CT.Controls.releaseAll();
    this.level = null;
    this.traffic = null;
    this.effects.clear();
    this.timers = [];
    this.fade = 1;
    this.speedFx = 0;
    this.applyPaint();
    this.setState(S.MAIN_MENU);
    CT.UI.showMenu();
  };

  // ================================================================ state machine
  Game.prototype.setState = function (s) {
    var old = this.state;
    this.state = s;
    this.stateTime = 0;
    this.applyStateEffects();
    this.onEnter(s, old);
  };

  Game.prototype.applyStateEffects = function () {
    var s = this.state;
    CT.Controls.setEnabled(DRIVE_STATES.indexOf(s) >= 0);
    CT.Controls.captureKeys = PLAY_STATES.indexOf(s) >= 0;
    if (DRIVE_STATES.indexOf(s) >= 0 || s === S.DELIVERING) CT.Audio.engineOn(); else CT.Audio.engineOff();
    CT.UI.onState(s, this);
  };

  Game.prototype.onEnter = function (s, old) {
    var self = this;
    switch (s) {
      case S.READY_TO_DRIVE:
        if (old === S.LOADING) {
          CT.Audio.play('ready');
          this.later(0.5, function () { CT.Audio.play('horn'); });
          var p = this.truck.artToWorld(620, 260);
          this.effects.text(p.x, p.y - 40, 'READY!', '#ffd34a');
        }
        break;
      case S.ARRIVED:
        CT.Audio.play('zone'); CT.vibrate(30);
        break;
      case S.DELIVERING:
        this.cargo.items.forEach(function (it) { if (it.state === CT.CargoManager.STATE.TRUCK) it.strapTarget = 0; });
        CT.Audio.play('strap');
        var onTruck = this.cargo.items.filter(function (it) { return it.state === CT.CargoManager.STATE.TRUCK; })
          .sort(function (a, b) { return b.slot - a.slot; });               // rear slot to the nearest pallet
        this.deliverTarget = onTruck.length;
        this.dropCrew.assign(onTruck);
        this.later(0.35, function () { self.dropCrew.start(); });
        break;
      case S.LEVEL_COMPLETE:
      case S.LEVEL_FAILED:
        CT.Audio.engineOff();
        break;
    }
    if (s !== S.PAUSED) this.updateHints(true);
  };

  Game.prototype.isPlaying = function () { return PLAY_STATES.indexOf(this.state) >= 0; };
  Game.prototype.isDriving = function () {
    var s = this.state === S.PAUSED ? this.prevState : this.state;
    return DRIVE_STATES.indexOf(s) >= 0;
  };

  Game.prototype.pause = function () {
    if (!this.isPlaying()) return false;
    this.prevState = this.state;
    this.state = S.PAUSED;
    CT.Controls.releaseAll();
    this.applyStateEffects();
    CT.UI.showPause(true, this.prevState);
    return true;
  };

  Game.prototype.resume = function () {
    if (this.state !== S.PAUSED || !this.prevState) return;
    this.state = this.prevState;
    this.prevState = null;
    CT.Controls.releaseAll();
    this.applyStateEffects();
    CT.UI.showPause(false);
    this.updateHints(true);
  };

  Game.prototype.restart = function () {
    if (!this.level) return;
    CT.UI.showPause(false);
    CT.UI.hideWin(); CT.UI.hideFail();
    this.prevState = null;
    this.recordDistanceOnce();
    this.startLevel(this.level.id);
  };

  Game.prototype.resetTruck = function () {
    var from = this.state === S.PAUSED ? this.prevState : this.state;
    if (DRIVE_STATES.indexOf(from) < 0) return false;
    this.truck.place(this.level.start.x, this.world.heightAt);
    this.cargo.items.forEach(function (it) { it.dx = 0; it.dvx = 0; });
    this.effects.puff(this.truck.x, this.truck.y, 10);
    this.fade = 0.6;
    if (this.state === S.PAUSED) { this.prevState = S.READY_TO_DRIVE; this.resume(); }
    else this.setState(S.READY_TO_DRIVE);
    return true;
  };

  // ================================================================ player actions
  Game.prototype.action = function () {
    if (this.state === S.LOADING) this.requestLoad();
    else if (this.recoverable && this.isDriving()) this.requestRecover();
    else if (this.state === S.ARRIVED) this.requestDeliver();
  };

  /** LOAD button: the workers carry every load still on the pallets (the alternative to drag-and-drop). */
  Game.prototype.requestLoad = function () {
    if (this.state !== S.LOADING || this.loadCrew.started) return false;
    if (this.drag) this.cancelDrag();
    var ST = CT.CargoManager.STATE, used = {};
    this.cargo.items.forEach(function (it) { if (it.state === ST.TRUCK) used[it.slot] = true; });
    this.loadCrew.teams.forEach(function (tm) {
      if (!tm.item) return;
      if (tm.item.state !== ST.DOCK) { tm.item = null; return; }
      if (used[tm.slot]) { for (var s = 0; s < CT.Truck.SLOTS.length; s++) if (!used[s]) { tm.slot = s; break; } }
      used[tm.slot] = true;
    });
    CT.Audio.play('click');
    var ok = this.loadCrew.start();
    CT.UI.refreshAction(this);
    this.updateHints(true);
    return ok;
  };

  // ---------------------------------------------------------------- drag-and-drop loading
  Game.prototype.screenToWorld = function (sx, sy) {
    var v = this.view;
    return { x: (sx - v.W / 2 - v.shakeX) / v.scale + v.camX, y: (sy - v.groundY - v.shakeY) / v.scale + (v.camY || 0) };
  };
  Game.prototype.bedArea = function () {
    var tr = this.truck, SL = CT.Truck.SLOTS;
    var a = tr.artToWorld(SL[SL.length - 1] - 200, CT.Truck.BED_TOP), b = tr.artToWorld(SL[0] + 200, CT.Truck.BED_TOP);
    return { x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), y: a.y };
  };
  Game.prototype.freeSlotNear = function (x, prefer) {
    var ST = CT.CargoManager.STATE, used = {}, tr = this.truck, best = -1, bd = 1e9;
    this.cargo.items.forEach(function (o) { if (o.state === ST.TRUCK) used[o.slot] = true; });
    if (prefer != null && prefer < CT.Truck.SLOTS.length && !used[prefer] && Math.abs(tr.slotWorld(prefer).x - x) < 90) return prefer;
    for (var s = 0; s < CT.Truck.SLOTS.length; s++) {
      if (used[s]) continue;
      var d = Math.abs(tr.slotWorld(s).x - x);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  Game.prototype.pointerDown = function (sx, sy) {
    if (this.state !== S.LOADING || this.drag) return false;
    var w = this.screenToWorld(sx, sy), ST = CT.CargoManager.STATE, hit = null;
    this.cargo.items.forEach(function (it) {
      if (it.state !== ST.DOCK || it.tween) return;
      if (Math.abs(w.x - it.x) < 78 && w.y > it.y - 115 && w.y < it.y + 25) hit = it;
    });
    if (!hit) return false;
    if (this.loadCrew.started) { CT.UI.toast('The workers are already loading', 'info'); return false; }
    this.loadCrew.teams.forEach(function (tm) { if (tm.item === hit) tm.item = null; });
    hit.state = ST.CARRY;
    this.drag = { it: hit, ox: w.x - hit.x, oy: w.y - hit.y, home: { x: hit.pallet.x, y: hit.pallet.y } };
    CT.Audio.play('pickup'); CT.vibrate(15);
    this.updateHints(true);
    return true;
  };
  Game.prototype.pointerMove = function (sx, sy) {
    if (!this.drag) return;
    var w = this.screenToWorld(sx, sy), it = this.drag.it;
    it.x = w.x - this.drag.ox; it.y = Math.min(PALLET_Y, w.y - this.drag.oy);
    var bed = this.bedArea();
    this.drag.over = it.x > bed.x1 - 40 && it.x < bed.x2 + 40 && it.y < bed.y + 90;
  };
  Game.prototype.pointerUp = function () {
    var d = this.drag; if (!d) return;
    this.drag = null;
    var it = d.it, bed = this.bedArea();
    var over = it.x > bed.x1 - 40 && it.x < bed.x2 + 40 && it.y < bed.y + 90 && it.y > bed.y - 520;
    var slot = over ? this.freeSlotNear(it.x, it.id) : -1;
    if (slot < 0) {
      this.tweens.push({ it: it, x0: it.x, y0: it.y, x1: d.home.x, y1: d.home.y, t: 0, d: 0.35 });
      it.tween = true;
      CT.Audio.play('invalid'); CT.vibrate(40);
      CT.UI.toast(over ? 'No free space on the bed' : 'Drop the ' + it.name + ' on the truck bed', 'warn');
      return;
    }
    var lift = Math.max(-320, Math.min(0, (it.y - bed.y) / CT.Truck.S));
    var counted = this.cargo.placeOnTruck(it, slot, lift);
    this.onLoaded(it, counted);
  };
  Game.prototype.cancelDrag = function () {
    if (!this.drag) return;
    var it = this.drag.it; this.drag = null;
    it.state = CT.CargoManager.STATE.DOCK; it.x = it.pallet.x; it.y = it.pallet.y;
  };
  Game.prototype.updateTweens = function (dt) {
    for (var i = this.tweens.length - 1; i >= 0; i--) {
      var tw = this.tweens[i], it = tw.it; tw.t += dt;
      var u = Math.min(1, tw.t / tw.d), e = 1 - Math.pow(1 - u, 3);
      it.x = D.lerp(tw.x0, tw.x1, e); it.y = D.lerp(tw.y0, tw.y1, e) - Math.sin(u * Math.PI) * 40;
      if (u >= 1) { it.state = CT.CargoManager.STATE.DOCK; it.tween = false; it.pop = 1; this.tweens.splice(i, 1); }
    }
  };

  // ---------------------------------------------------------------- lost cargo & recovery
  /** Knocks one load off the bed (front load when thrown forward, rear load otherwise). */
  Game.prototype.loseItem = function (dir, why, forced) {
    if (this.level.tutorial || (!forced && this.lt - this.knock.lastLoss < 1.5)) return null;
    var ST = CT.CargoManager.STATE, pick = forced || null;
    if (!pick) this.cargo.items.forEach(function (it) {
      if (it.state !== ST.TRUCK || it.lift < -1) return;
      if (!pick || (dir > 0 ? it.slot < pick.slot : it.slot > pick.slot)) pick = it;
    });
    if (!pick) return null;
    this.knock.lastLoss = this.lt;
    this.cargo.knockOff(pick, this.truck, dir);
    this.truck.cargoWeight = this.cargo.weightOnTruck();
    this.health = this.cargo.condition(); CT.UI.setHealth(this.health, true);
    CT.Audio.play('crash'); CT.vibrate([60, 40, 60]);
    this.shake = Math.max(this.shake, 10);
    CT.UI.setCargo(this.cargo.onTruckCount(), this.cargo.required, true);
    if (pick.destroyed) CT.UI.toast('The ' + pick.name + ' was destroyed!', 'bad');
    else CT.UI.toast((why ? why + ' ' : '') + 'The ' + pick.name + ' fell off! Stop next to it and tap RECOVER', 'bad');
    this.checkCargoFail();
    return pick;
  };
  Game.prototype.onCargoGround = function (it, hit) {
    CT.Audio.play('bump');
    this.effects.puff(it.x, it.y, 8);
    if (hit >= 1) this.effects.text(it.x, it.y - 90, '-' + Math.round(hit) + '%', '#ff6b5e');
    this.health = this.cargo.condition(); CT.UI.setHealth(this.health, true);
    if (it.destroyed) { CT.UI.toast('The ' + it.name + ' broke when it hit the road', 'bad'); this.checkCargoFail(); }
  };
  Game.prototype.checkCargoFail = function () {
    if (this.level.tutorial) return;
    if (this.cargo.destroyedCount() > 1)
      this.fail('Cargo destroyed', 'More than one load was destroyed. Brake earlier, take bends and bumps slowly, and buy Cargo straps and Suspension upgrades in the garage.');
  };
  /** A fallen (not destroyed) load that has come to rest next to the stopped truck. */
  Game.prototype.findRecoverable = function () {
    var tr = this.truck, mid = tr.x + (CT.Truck.FRONT + CT.Truck.REAR) / 2, best = null;
    if (Math.abs(tr.v) > 30 * K) return null;
    this.cargo.fallenRecoverable().forEach(function (it) {
      if (!it.fall || !it.fall.rest) return;
      var d = Math.abs(it.x - mid);
      if (d < 520 && (!best || d < best.d)) best = { it: it, d: d };
    });
    return best ? best.it : null;
  };
  Game.prototype.requestRecover = function () {
    var it = this.findRecoverable(); if (!it) return false;
    var slot = this.cargo.recover(it);
    if (slot < 0) return false;
    this.truck.cargoWeight = this.cargo.weightOnTruck();
    this.health = this.cargo.condition(); CT.UI.setHealth(this.health);
    CT.Audio.play('pickup'); CT.vibrate(25);
    var p = this.truck.slotWorld(slot);
    this.effects.sparkle(p.x, p.y - 60, 12);
    CT.UI.setCargo(this.cargo.onTruckCount(), this.cargo.required, true);
    CT.UI.toast('The ' + it.name + ' is back on the truck', 'good');
    this.recoverable = null;
    CT.UI.refreshAction(this);
    return true;
  };
  Game.prototype.minDeliver = function () {
    return this.level.tutorial ? this.cargo.required : Math.max(1, this.cargo.required - 1);
  };
  Game.prototype.recordDistanceOnce = function () {
    if (!this.level || !this.truck || !this.flags || this.flags.distRecorded) return;
    this.flags.distRecorded = true;
    CT.Progress.recordDistance(Math.round(this.truck.distance * CT.Levels.METERS_PER_UNIT));
  };

  Game.prototype.cycleCamera = function () {
    var i = (CAMERAS.indexOf(this.camMode) + 1) % CAMERAS.length;
    this.setCamera(CAMERAS[i]);
  };
  Game.prototype.setCamera = function (m) {
    this.camMode = m;
    CT.Storage.setSetting('camera', m);
    CT.Audio.play('click');
    CT.UI.setCameraLabel(m);
    if (this.level && this.isDriving()) CT.UI.toast(m === 'cab' ? 'Cab view (FPP)' : m === 'chase' ? 'Chase view (TPP)' : 'Side view', 'info');
  };

  /** dir: undefined = toggle, 0 = right lane, 1 = left lane */
  Game.prototype.requestLane = function (dir) {
    if (!this.isDriving() || this.state === S.PAUSED) return false;
    var tr = this.truck;
    var target = dir == null ? 1 - tr.lane : dir;
    if (target === tr.lane) return false;
    if (this.traffic && !this.traffic.laneFree(tr, target)) {
      CT.Audio.play('horn');
      CT.UI.toast('Lane is busy — wait for a gap', 'warn');
      return false;
    }
    tr.lane = target;
    CT.Audio.play('blinker');
    return true;
  };

  Game.prototype.horn = function () { if (this.level) CT.Audio.play('horn'); };

  Game.prototype.onLoaded = function (it, counted) {
    this.truck.cargoWeight = this.cargo.weightOnTruck();
    this.truck.jolt(30);
    CT.Audio.play('clunk');
    var self = this;
    this.later(0.25, function () { CT.Audio.play('strap'); });
    if (counted) {
      var p = this.truck.slotWorld(it.slot);
      this.effects.sparkle(p.x, p.y - 60, 14);
      this.effects.text(p.x, p.y - 110, '+1', '#ffd34a');
      CT.UI.setCargo(this.cargo.loadedCount(), this.cargo.required, true);
      this.later(0.3, function () { CT.Audio.play('count'); });
      CT.vibrate(25);
    }
    this.updateHints(true);
  };

  Game.prototype.onDelivered = function (it, counted) {
    if (!counted) return;
    CT.Audio.play('deliver');
    this.effects.sparkle(it.x, it.y - 50, 16, '#7dff8a');
    this.effects.text(it.x, it.y - 110, this.cargo.deliveredCount() + '/' + this.cargo.required, '#7dff8a');
    CT.UI.setCargo(this.cargo.deliveredCount(), this.deliverTarget, true);
    CT.vibrate(25);
    this.updateHints(true);
  };

  Game.prototype.requestDeliver = function () {
    if (this.state !== S.ARRIVED || !this.zone.ready) return false;
    this.truck.v = 0;
    CT.Audio.play('click');
    this.setState(S.DELIVERING);
    return true;
  };

  // ================================================================ damage & rules
  /** Damage is spread over the loads on the bed by their sensitivity (glass and fridges suffer most). */
  Game.prototype.damage = function (amount) {
    var mult = this.truck.cfg.damageMult * this.damageAssist * (this.level.tutorial ? 0.5 : 1);
    if (!(amount * mult > 0)) return 0;
    var res = this.cargo.damageItems(amount, mult);
    if (!res) return 0;
    var self = this, ST = CT.CargoManager.STATE;
    this.health = this.cargo.condition();
    var p = this.truck.slotWorld(res.item.slot);
    if (res.amount >= 1) this.effects.text(p.x, p.y - 110, '-' + Math.round(res.amount) + '%', '#ff6b5e');
    CT.UI.setHealth(this.health, true);
    this.cargo.items.forEach(function (it) {
      if (it.state === ST.TRUCK && it.health <= 0 && !it.destroyed) {
        it.destroyed = true;
        if (self.level.tutorial) { it.health = 1; it.destroyed = false; return; }   // the tutorial never breaks cargo
        self.loseItem(1, null, it);
      }
    });
    return res.amount;
  };

  Game.prototype.onImpact = function (speed, dir) {
    var v = speed / K;
    if (v < 25) return;
    var k = Math.min(1, v / 300);
    this.cargo.jolt(v * 0.6, dir > 0 ? 1 : -1);
    this.truck.jolt(v * 0.4 * dir);
    this.shake = Math.max(this.shake, 4 + k * 10);
    CT.Audio.play('bump');
    CT.vibrate(Math.round(30 + k * 60));
    var x = this.truck.x + (dir > 0 ? CT.Truck.FRONT : CT.Truck.REAR);
    this.effects.puff(x, this.truck.y, 8);
    if (v > 120 && !this.level.tutorial) this.damage((v - 120) * 0.05);
    if (v > 80) CT.UI.toast('Bump! Use the brake to stop gently.', 'warn');
  };

  Game.prototype.crash = function (ev) {
    var rel = ev.rel / K;
    if (rel < 25) return;
    var k = Math.min(1, rel / 400);
    this.crashes++;
    this.cargo.jolt(rel * 0.8, ev.front ? 1 : -1);
    this.truck.jolt(rel * 0.5 * (ev.front ? 1 : -1));
    this.shake = Math.max(this.shake, 6 + k * 14);
    CT.Audio.play('crash');
    CT.vibrate([40, 30, Math.round(60 + k * 80)]);
    var x = this.truck.x + (ev.front ? CT.Truck.FRONT : CT.Truck.REAR);
    this.effects.puff(x, this.truck.y - 30, 14);
    this.effects.sparkle(x, this.truck.y - 50, 10, '#ffffff');
    this.damage(8 + rel * 0.07);
    if (rel > 150 + 35 * this.truck.cfg.stability) this.loseItem(ev.front ? 1 : -1, 'Crash!');
    else CT.UI.toast('Crash! Keep a safe distance from cars.', 'bad');
  };

  Game.prototype.checkRules = function (dt, prevFront, prevX) {
    var L = this.level, tr = this.truck, self = this;
    var front = tr.x + CT.Truck.FRONT;
    (L.lights || []).forEach(function (l) {
      var stop = l.x - 60;
      if (prevFront < stop && front >= stop && tr.v > 15 * K) {
        if (CT.Traffic.lightState(l, self.lt) === 'red') {
          self.violations++;
          CT.Audio.play('alarm');
          CT.UI.toast('You ran a red light!', 'bad');
          self.effects.text(stop, tr.y - 260, 'RED LIGHT!', '#ff6b5e');
        }
      }
    });
    (L.obstacles || []).forEach(function (o) {
      if (o.type !== 'bump') return;
      var wx = tr.x + 170, pw = prevX + 170;
      if ((pw < o.x && wx >= o.x) || (pw > o.x && wx <= o.x)) {
        var v = Math.abs(tr.v);
        tr.jolt(-Math.min(160, v / K * 0.25));
        CT.Audio.play('bump');
        if (v > o.limit) {
          self.bumpHits++;
          self.cargo.jolt(v / K * 0.4, 1);
          self.shake = Math.max(self.shake, 5);
          self.damage((v - o.limit) / K * 0.06);
          self.cargo.bounce((v - o.limit) / K * 0.5);
          if ((v - o.limit) / K > 140 + 30 * tr.cfg.stability) self.loseItem(-1, 'Too fast over the bump!');
          else CT.UI.toast('Too fast over the speed bump!', 'warn');
        }
      }
    });
    var c = this.world.curveAt(tr.x);
    if (c && Math.abs(tr.v) > c.limit + 12 * K) {
      var over = (Math.abs(tr.v) - c.limit) / K;
      this.damage(over * 0.032 * dt * (1.4 - (tr.cfg.grip || 1) * 0.4));
      this.cargo.jolt(over * dt * 6, c.dir);
      if (over > 70) { this.knock.curveT += dt; if (this.knock.curveT > 1.3 + 0.25 * tr.cfg.stability) { this.knock.curveT = 0; this.loseItem(c.dir, 'Too fast in the bend!'); } }
      this.squealT -= dt;
      if (this.squealT <= 0) { CT.Audio.play('squeal'); this.squealT = 0.6; }
      if (!this.flags.curveWarned[c.x1]) {
        this.flags.curveWarned[c.x1] = true;
        this.curveHits++;
        CT.UI.toast('Too fast for this bend! Slow to ' + Math.round(CT.Garage.kmh(c.limit)) + ' km/h', 'warn');
      }
    }
  };

  /** Road surfaces, narrow roadworks and potholes. */
  Game.prototype.checkRoad = function (dt, prevX) {
    var L = this.level, tr = this.truck, self = this, sec = this.world.sectionAt(tr.x + 170);
    var tyre = 1 - tr.cfg.tyres * 0.08, kmhNow = Math.abs(CT.Garage.kmh(tr.v)), surf = null;
    if (sec) {
      if (sec.type === 'mud') surf = { grip: 1 - 0.25 * tyre, drag: 1.5, cap: 1040 + tr.cfg.tyres * 40 };
      else if (sec.type === 'sand') surf = { grip: 1 - 0.2 * tyre, drag: 1, cap: 1180 + tr.cfg.tyres * 40 };
      else if (sec.type === 'ice') surf = { grip: 1 - 0.55 * tyre, drag: 0 };
      else if (sec.type === 'rough') surf = { grip: 0.95, drag: 0.5 };
      if (!this.flags.sectWarned[sec.x1]) {
        this.flags.sectWarned[sec.x1] = true;
        var MSG = { mud: 'Mud! The truck slows down', sand: 'Deep sand! Keep the gas on', ice: 'Ice! Brake early, the truck slides', rough: 'Rough road! Slow down to protect the cargo', narrow: 'Roadworks: left lane closed', bridge: 'Bridge' };
        if (MSG[sec.type] && sec.type !== 'bridge') CT.UI.toast(MSG[sec.type], sec.type === 'narrow' || sec.type === 'ice' ? 'warn' : 'info');
      }
      if (sec.type === 'rough' && kmhNow > 100) {
        this.knock.roughT -= dt;
        if (this.knock.roughT <= 0) {
          this.knock.roughT = 0.32;
          tr.jolt(-Math.min(60, (kmhNow - 100) * 0.4));
          this.cargo.bounce(20 + (kmhNow - 100) * 0.3);
          this.damage((kmhNow - 100) * 0.012);
        }
      }
      if (sec.type === 'narrow' && tr.laneT > 0.35) {
        this.knock.coneCd -= dt;
        if (this.knock.coneCd <= 0) {
          this.knock.coneCd = 1.2;
          tr.v *= 0.55; tr.lane = 0;
          tr.jolt(-40);
          this.cargo.jolt(Math.abs(tr.v) / K * 0.3, 1);
          this.damage(3 + kmhNow * 0.02);
          this.shake = Math.max(this.shake, 6);
          CT.Audio.play('bump');
          CT.UI.toast('You hit the cones! Keep to the RIGHT lane', 'bad');
        }
      }
    }
    tr.surface = surf;
    (L.obstacles || []).forEach(function (o) {
      if (o.type !== 'pothole') return;
      var wx = tr.x + 170, pw = prevX + 170;
      if (!((pw < o.x && wx >= o.x) || (pw > o.x && wx <= o.x))) return;
      if (tr.lanesOccupied().indexOf(o.lane) < 0) return;
      var v = Math.abs(tr.v);
      tr.jolt(-Math.min(140, v / K * 0.3));
      self.cargo.bounce(Math.min(160, v / K * 0.35));
      CT.Audio.play('bump');
      self.shake = Math.max(self.shake, 4);
      if (v > o.limit) {
        self.damage((v - o.limit) / K * 0.05);
        if ((v - o.limit) / K > 200 + 30 * tr.cfg.stability) self.loseItem(-1, 'Pothole!');
        else CT.UI.toast('Pothole! Steer around it or slow down', 'warn');
      }
    });
  };

  Game.prototype.updateFuel = function (dt, prevX, input) {
    var tr = this.truck, L = this.level;
    var moved = Math.abs(tr.x - prevX), w = this.cargo.weightOnTruck();
    var use = L.fuelRate * moved * (0.4 + 0.6 * tr.throttle + 0.3 * tr.revThrottle) * (1 + w * 0.025);
    if (this.state !== S.READY_TO_DRIVE) use += dt * 0.02;
    this.fuel = Math.max(0, this.fuel - use);
    var frac = this.fuel / this.fuelMax;
    if (frac < 0.2 && !this.flags.fuelWarned && this.fuel > 0) {
      this.flags.fuelWarned = true; CT.Audio.play('lowfuel'); CT.UI.toast('Low fuel! Drive smoothly to the hub', 'warn');
    }
    if (this.fuel <= 0 && !tr.noFuel) { tr.noFuel = true; CT.Audio.play('alarm'); CT.UI.toast('Out of fuel!', 'bad'); }
    if (tr.noFuel && Math.abs(tr.v) < 5 * K && !this.zone.inside) {
      this.noFuelT += dt;
      if (this.noFuelT > 1.5) this.fail('Out of fuel', 'The tank ran dry before the delivery. Hold the gas less, avoid driving back and forth, and buy a bigger Fuel tank in the garage.');
    } else this.noFuelT = 0;
  };

  Game.prototype.fail = function (title, text) {
    if (this.flags.failShown || this.flags.winShown) return;
    this.flags.failShown = true;
    this.drag = null;
    CT.Progress.recordFail();
    this.recordDistanceOnce();
    var n = CT.Storage.addFail(this.level.id);
    var help = '';
    if (!this.level.tutorial) {
      if (n === 2) help = ' Next try is easier: more time, less traffic and tougher cargo.';
      else if (n >= 3) help = ' Next try is extra easy, you can do it!';
      else help = ' Fail once more and the level gets easier.';
    }
    this.failInfo = { title: title, text: text + help, fails: n };
    this.setState(S.LEVEL_FAILED);
    CT.Audio.play('fail');
    CT.vibrate([80, 60, 80]);
    this.failTimer = 1.0;
  };

  Game.prototype.later = function (sec, fn) { this.timers.push({ t: sec, fn: fn }); };

  // ================================================================ update
  Game.prototype.tick = function (dt) {
    this.t += dt;
    this.view.t = this.t;
    if (this.state === S.PAUSED) { this.render(); return; }
    var input = CT.Controls.update();

    for (var i = this.timers.length - 1; i >= 0; i--) {
      var tm = this.timers[i]; tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }

    if (this.state === S.MAIN_MENU) this.updateMenu(dt);
    else this.updateLevel(dt, input);

    this.effects.update(dt);
    this.updateCamera(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 2.2);
    this.stateTime += dt;
    this.render();
  };

  Game.prototype.updateMenu = function (dt) {
    var m = this.menuScene;
    m.truck.update(dt, { gas: true, brake: false, reverse: false }, this.menuWorld.heightAt, true);
    m.cargo.update(dt, m.truck.accelSm, this.menuWorld.heightAt);
    if (m.truck.x > 9500) { m.truck.place(1900, this.menuWorld.heightAt); m.truck.v = 150 * K; this.view.camX = this.cameraTarget(S.MAIN_MENU); this.fade = 1; }
    this.emitDriveFx(m.truck, dt, 0.6);
  };

  Game.prototype.updateLevel = function (dt, input) {
    var st = this.state, tr = this.truck, L = this.level;
    var drive = DRIVE_STATES.indexOf(st) >= 0;
    var ended = st === S.LEVEL_COMPLETE || st === S.LEVEL_FAILED;

    if (!ended) { this.stats.time += dt; this.lt += dt; }
    this.view.lt = this.lt;

    var prevFront = tr.x + CT.Truck.FRONT, prevX = tr.x;
    tr.update(dt, input, this.world.heightAt, drive && !ended);
    if (this.traffic) {
      this.traffic.update(dt, tr, this.lt);
      if (drive) this.traffic.resolveTruck(tr).forEach(this.crash, this);
    }
    if (drive && !L.tutorial) { this.checkRules(dt, prevFront, prevX); this.checkRoad(dt, prevX); }
    if (drive && !ended) this.updateFuel(dt, prevX, input);
    this.cargo.update(dt, tr.accelSm, this.world.heightAt);
    this.updateTweens(dt);
    this.loadCrew.update(dt);
    this.dropCrew.update(dt);

    if (st === S.LOADING) {
      if (this.cargo.loadedCount() >= this.cargo.required && this.cargo.allStrapped()) this.setState(S.READY_TO_DRIVE);
      else if (this.loadCrew.started) CT.UI.setProgress(this.cargo.loadedCount() / this.cargo.required, this.loadCrew.remaining() + 0.4);
    } else if (st === S.READY_TO_DRIVE) {
      if (input.gas || input.reverse) this.setState(S.DRIVING);
    }

    var z = L.destination.zone;
    var rear = tr.x + CT.Truck.REAR, front = tr.x + CT.Truck.FRONT;
    this.zone.inside = rear >= z.x1 - 60 && front <= z.x2 + 60;
    this.zone.ready = this.zone.inside && Math.abs(tr.v) < L.delivery.maxSpeed && !input.gas && !input.reverse &&
      tr.laneIndex() !== -1 && this.cargo.onTruckCount() >= this.minDeliver();
    var rec = drive && !ended ? this.findRecoverable() : null;
    if (rec !== this.recoverable) { this.recoverable = rec; CT.UI.refreshAction(this); this.updateHints(true); }
    if (drive && !ended && !L.tutorial && this.cargo.onTruckCount() + this.cargo.fallenRecoverable().length < this.minDeliver())
      this.fail('Too much cargo lost', 'Too many loads fell off or broke. Slow down for bends, bumps and potholes, and buy Cargo straps in the garage.');
    this.zone.show = (st === S.READY_TO_DRIVE || st === S.DRIVING || st === S.ARRIVED);

    if (this.state === S.DRIVING && this.zone.ready) this.setState(S.ARRIVED);
    else if (this.state === S.ARRIVED && !this.zone.ready) this.setState(S.DRIVING);

    if (this.state === S.DELIVERING) {
      CT.UI.setProgress(this.cargo.deliveredCount() / this.deliverTarget, this.dropCrew.remaining());
      if (!this.flags.winShown && this.cargo.deliveredCount() >= this.deliverTarget) {
        this.flags.winShown = true;
        this.completeLevel();
      }
    }
    if (this.timeLimit && !ended && this.state !== S.DELIVERING && this.state !== S.LOADING) {
      var left = this.timeLimit - this.stats.time;
      if (left < 15 && !this.flags.timeWarned) { this.flags.timeWarned = true; CT.Audio.play('alarm'); CT.UI.toast('15 seconds left!', 'warn'); }
      if (left <= 0) this.fail("Time's up", 'The delivery took too long. Upgrade the engine for more speed, or take bends and lights more smoothly.');
    }
    if (this.winTimer > 0) { this.winTimer -= dt; if (this.winTimer <= 0) CT.UI.showWin(this.result); }
    if (this.failTimer > 0) { this.failTimer -= dt; if (this.failTimer <= 0) CT.UI.showFail(this.failInfo, this); }

    if (tr.braking && Math.abs(tr.v) > 200 * K) { if (!this.flags.brakeSqueal) { this.flags.brakeSqueal = true; CT.Audio.play('brake'); } }
    else if (!tr.braking) this.flags.brakeSqueal = false;

    if (drive || this.state === S.DELIVERING) CT.Audio.engineSet(tr.speedRatio(), tr.throttle + tr.revThrottle * 0.7);
    if (drive) this.emitDriveFx(tr, dt, 1);

    this.updateHints(false);
    CT.UI.updateHud(this);
  };

  Game.prototype.completeLevel = function () {
    var L = this.level, time = this.stats.time, C = this.cargo;
    var delivered = C.deliveredCount(), lost = C.required - delivered;
    var cond = Math.round(C.items.filter(function (it) { return C.delivered.has(it.id); })
      .reduce(function (s2, it) { return s2 + it.health; }, 0) / Math.max(1, delivered));
    var damagePct = 100 - cond;
    var safe = this.crashes === 0 && this.violations === 0 && cond >= 90 && lost === 0;
    var fast = time <= this.par;
    var stars = 1 + (safe ? 1 : 0) + (fast ? 1 : 0);
    var saved = CT.Storage.completeLevel(L.id, { stars: stars, time: time });
    CT.Storage.clearFails(L.id);
    var br = CT.Rewards.levelBreakdown(L, { safe: safe, fast: fast, lost: lost }, saved);
    var coins = CT.Rewards.grant('lvl:' + L.id + ':' + this.attemptId, br.total, false);
    this.recordDistanceOnce();
    CT.Progress.recordDelivery({ delivered: delivered, lost: lost, stars: stars, damagePct: damagePct, crashes: this.crashes, violations: this.violations, fast: fast });
    var next = CT.Levels.get(L.id + 1);
    var label = CT.CargoManager.label(L.cargo).toLowerCase();
    var why = [];
    if (lost) why.push(lost + ' load' + (lost > 1 ? 's' : '') + ' lost on the way');
    if (cond < 90) why.push('cargo condition ' + cond + '% (needs 90%)');
    if (this.crashes) why.push(this.crashes + ' crash' + (this.crashes > 1 ? 'es' : ''));
    if (this.violations) why.push(this.violations + ' red light' + (this.violations > 1 ? 's' : ''));
    if (!fast) why.push('slower than the ' + CT.UI.fmtTime(this.par) + ' target');
    this.result = {
      levelId: L.id, levelName: L.name,
      loaded: C.loadedCount(), delivered: delivered, required: C.required, lost: lost, condition: cond,
      distance: this.truck.distance * CT.Levels.METERS_PER_UNIT,
      time: time, par: this.par, stars: stars, isBest: saved.isBest, coins: coins, breakdown: br.lines,
      fuelLeft: Math.round(this.fuel / this.fuelMax * 100),
      health: cond, crashes: this.crashes, violations: this.violations,
      explain: stars === 3 ? 'Perfect run: every load arrived safely and on time!' : 'Missed stars: ' + why.join(', ') + '.',
      criteria: [
        { ok: true, title: 'Cargo delivered', detail: delivered + '/' + C.required + ' · ' + label + (lost ? ' · ' + lost + ' lost' : '') },
        { ok: safe, title: 'Safe driving', detail: 'Condition ' + cond + '% · ' + this.crashes + ' crash' + (this.crashes === 1 ? '' : 'es') + ' · ' + this.violations + ' red light' + (this.violations === 1 ? '' : 's') },
        { ok: fast, title: 'Fast delivery', detail: CT.UI.fmtTime(time) + ' (target ' + CT.UI.fmtTime(this.par) + ')' }
      ],
      hasNext: !!(next && next.implemented)
    };
    this.setState(S.LEVEL_COMPLETE);
    var cx = this.view.camX, halfW = this.view.W / 2 / this.view.scale;
    this.effects.burst(this.truck.x - 60, this.truck.y - 220, 70);
    this.effects.confetti(cx - halfW, cx + halfW, this.truck.y - 700, 120);
    CT.Audio.play('win');
    CT.vibrate([40, 60, 40, 60, 120]);
    CT.UI.flash();
    this.winTimer = 1.1;
  };

  Game.prototype.emitDriveFx = function (tr, dt, amount) {
    var sr = tr.speedRatio();
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      var ex = tr.exhaustWorld();
      this.effects.smoke(ex.x, ex.y, tr.throttle);
      this.smokeT = tr.throttle > 0.2 ? 0.09 : 0.45;
    }
    if (sr > 0.25 && (tr.throttle > 0.3 || tr.revThrottle > 0.3 || tr.braking)) {
      this.dustT -= dt * sr * amount;
      if (this.dustT <= 0) {
        var w = tr.rearWheelWorld();
        this.effects.dust(tr.v > 0 ? w.x - 20 : tr.x + CT.Truck.FRONT - 50, w.y, tr.v > 0 ? 1 : -1, sr);
        this.dustT = 0.06;
      }
    }
  };

  // ================================================================ hints
  Game.prototype.ahead = function () {
    var L = this.level, tr = this.truck, front = tr.x + CT.Truck.FRONT, out = {}, self = this;
    var look = 1100 * K;
    (L.lights || []).forEach(function (l) {
      var d = l.x - 60 - front;
      if (d > 0 && d < look * 1.4 && !out.light) { var s = CT.Traffic.lightState(l, self.lt); if (s !== 'green') out.light = { d: d, s: s }; }
    });
    (L.road.curves || []).forEach(function (c) { var d = c.x1 - front; if (d > 0 && d < look * 1.4 && !out.curve) out.curve = { d: d, c: c }; });
    (L.obstacles || []).forEach(function (o) { var d = o.x - front; if (d > 0 && d < look && !out.bump) out.bump = { d: d, o: o }; });
    if (this.traffic) {
      var lane = tr.laneIndex();
      this.traffic.cars.forEach(function (c) {
        if (CT.Traffic.carLanes(c).indexOf(lane) < 0) return;
        var d = c.x - c.len / 2 - front;
        if (d > 0 && d < 750 * K && c.v < tr.v - 40 * K && (!out.car || d < out.car.d)) out.car = { d: d, c: c };
      });
    }
    return out;
  };

  Game.prototype.updateHints = function (force) {
    if (!this.level) return;
    var st = this.state, L = this.level, tr = this.truck, z = L.destination.zone, key, title, sub = '', tone = '';
    var remaining = Math.max(0, ((z.x1 + z.x2) / 2 - tr.x) * CT.Levels.METERS_PER_UNIT);
    var kmh = function (v) { return Math.round(CT.Garage.kmh(v)); };
    var label = CT.CargoManager.label(L.cargo).toLowerCase();
    switch (st) {
      case S.LOADING:
        var n = this.cargo.loadedCount();
        if (n >= this.cargo.required) { key = 'load-strap'; title = 'Strapping the cargo…'; }
        else if (this.loadCrew.started) { key = 'load-' + n; title = 'Workers are loading ' + label; sub = n + '/' + this.cargo.required + ' on the truck'; }
        else if (this.drag) { key = 'drag'; title = 'Drop it on the truck bed'; sub = 'The green area shows where'; }
        else { key = 'loadp-' + n; title = 'Drag the ' + label + ' onto the truck'; sub = n + '/' + this.cargo.required + ' loaded · or tap LOAD for the workers'; }
        break;
      case S.READY_TO_DRIVE:
        key = 'ready'; title = "Cargo loaded! Let's drive."; sub = 'Hold GAS to drive to the ' + L.destination.name; tone = 'good';
        break;
      case S.DRIVING:
        var front = tr.x + CT.Truck.FRONT, rear = tr.x + CT.Truck.REAR, A = this.ahead(), cv = this.world.curveAt(tr.x);
        var fallen = this.cargo.fallenRecoverable(), secA = this.world.sectionAt(front + 400 * K);
        if (this.recoverable) { key = 'recover'; title = 'Cargo on the road!'; sub = 'Tap RECOVER to put the ' + this.recoverable.name + ' back'; tone = 'warn'; }
        else if (fallen.length && this.cargo.onTruckCount() < this.minDeliver()) { key = 'fallen'; title = 'Go back for the ' + fallen[0].name; sub = 'Stop next to it, then tap RECOVER'; tone = 'warn'; }
        else if (tr.noFuel) { key = 'nofuel'; title = 'Out of fuel'; sub = 'Roll into the green zone if you can'; tone = 'warn'; }
        else if (front > z.x2 + 60) { key = 'over'; title = 'A little too far!'; sub = 'Hold REVERSE to back into the green zone'; tone = 'warn'; }
        else if (this.zone.inside && Math.abs(tr.v) >= L.delivery.maxSpeed) { key = 'brake'; title = 'You are in the zone!'; sub = 'Hold BRAKE to stop'; tone = 'warn'; }
        else if (this.zone.inside && tr.laneIndex() === -1) { key = 'lanechg'; title = 'Finish the lane change'; }
        else if (this.zone.inside) { key = 'release'; title = 'Let go of the pedals'; sub = 'Stop completely to deliver'; }
        else if (rear < z.x1 - 60 && front > z.x1 - 1600 * K) { key = 'near'; title = 'Stop in the green zone'; sub = 'Ease off and use BRAKE'; }
        else if (cv && Math.abs(tr.v) > cv.limit + 12 * K) { key = 'curve-now'; title = 'Too fast for this bend!'; sub = 'Slow down to ' + kmh(cv.limit) + ' km/h'; tone = 'warn'; }
        else if (A.light && A.light.s === 'red') { key = 'red'; title = 'Red light ahead'; sub = 'Stop before the white line'; tone = 'warn'; }
        else if (A.light) { key = 'yellow'; title = 'Light is changing'; sub = 'Get ready to stop'; tone = 'warn'; }
        else if (A.car) { key = 'traffic'; title = 'Slow traffic ahead'; sub = 'Brake, or steer LEFT / RIGHT to overtake'; tone = 'warn'; }
        else if (secA && secA.type === 'narrow' && tr.lane === 1) { key = 'narrow'; title = 'Left lane closed ahead'; sub = 'Steer RIGHT before the cones'; tone = 'warn'; }
        else if (A.curve && Math.abs(tr.v) > A.curve.c.limit) { key = 'curve'; title = 'Bend ahead'; sub = 'Slow to ' + kmh(A.curve.c.limit) + ' km/h'; tone = 'warn'; }
        else if (A.bump && Math.abs(tr.v) > A.bump.o.limit) { key = 'bump'; title = 'Speed bump ahead'; sub = 'Slow to ' + kmh(A.bump.o.limit) + ' km/h'; tone = 'warn'; }
        else if (tr.x < L.start.x - 60) { key = 'wrong'; title = 'The hub is the other way'; sub = 'Hold GAS to drive forward'; tone = 'warn'; }
        else { key = 'drive'; title = 'Drive to the ' + L.destination.name; sub = Math.round(remaining) + ' m to go'; }
        break;
      case S.ARRIVED:
        key = this.recoverable ? 'recover' : 'arrived'; title = this.recoverable ? 'Cargo on the road!' : 'Perfect stop!';
        sub = this.recoverable ? 'Tap RECOVER first' : 'Tap DELIVER to unload'; tone = 'good';
        break;
      case S.DELIVERING:
        key = 'deliver-' + this.cargo.deliveredCount(); title = 'Workers are unloading…'; sub = this.cargo.deliveredCount() + '/' + this.cargo.required + ' delivered';
        break;
      case S.LEVEL_COMPLETE:
        key = 'done'; title = 'DELIVERY SUCCESSFUL!'; tone = 'good';
        break;
      case S.LEVEL_FAILED:
        key = 'failed'; title = this.failInfo ? this.failInfo.title : 'Level failed'; tone = 'warn';
        break;
      default: return;
    }
    if (key === 'drive' && this.hintKey === 'drive' && !force) { CT.UI.setBannerSub(sub); return; }
    if (key !== this.hintKey || force) {
      var popped = key !== this.hintKey;
      this.hintKey = key;
      CT.UI.setBanner(title, sub, tone, popped);
      CT.UI.refreshAction(this);
    }
  };

  // ================================================================ camera
  Game.prototype.cameraTarget = function (state) {
    var v = this.view, halfW = v.W / 2 / v.scale;
    if (state === S.MAIN_MENU) return this.menuScene.truck.x - halfW * 0.22;
    var L = this.level, tr = this.truck, target;
    var s = state === S.PAUSED ? this.prevState : state;
    if (s === S.LOADING) target = tr.x - 150;
    else if (s === S.DELIVERING || s === S.LEVEL_COMPLETE) target = tr.x - 300;
    else target = tr.x + Math.min(halfW * 0.3, 160) + D.clamp(tr.v * 0.2, -160, 480);
    var lo = L.road.start - 260 + halfW, hi = L.road.end + 320 - halfW;
    if (lo < hi) target = D.clamp(target, lo, hi);
    return target;
  };

  Game.prototype.updateCamera = function (dt) {
    var target = this.cameraTarget(this.state);
    var k = this.state === S.MAIN_MENU ? 4 : 2.6;
    var inLevel = this.state !== S.MAIN_MENU && this.truck;
    if (inLevel && Math.abs(this.truck.v) > 300 * K) k = 5;
    this.view.camX += (target - this.view.camX) * Math.min(1, dt * k);
    var ty = this.state === S.MAIN_MENU ? this.menuScene.truck.y : this.truck.y;
    this.view.camY += (ty - this.view.camY) * Math.min(1, dt * 3);
    // speed feel: zoom out a little and rumble at high speed
    var fx = inLevel ? D.clamp(Math.abs(CT.Garage.kmh(this.truck.v)) / 300, 0, 1) : 0;
    this.speedFx += (fx - this.speedFx) * Math.min(1, dt * 2);
    this.view.scale = this.view.baseScale * (1 - 0.14 * this.speedFx);
    var rumble = this.speedFx > 0.45 ? (this.speedFx - 0.45) * 3 : 0;
    var sh = this.shake + rumble;
    this.view.shakeX = sh ? (Math.random() - 0.5) * sh : 0;
    this.view.shakeY = sh ? (Math.random() - 0.5) * sh : 0;
  };

  Game.prototype.resize = function (w, h, dpr) {
    var v = this.view;
    v.W = w; v.H = h; v.dpr = dpr;
    var portrait = h > w * 1.05;
    var short = !portrait && h < 520;
    v.baseScale = Math.min(h / (short ? 900 : VIEW_H), w / 980);
    if (portrait) v.baseScale = w / 900;
    v.scale = v.baseScale * (1 - 0.14 * this.speedFx);
    v.groundY = portrait ? h * 0.6 : short ? h * 0.6 : h * 0.7;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  };

  // ================================================================ render
  Game.prototype.use3D = function () {
    return this.level && this.camMode !== 'side' && this.isDriving();
  };

  Game.prototype.render = function () {
    var ctx = this.ctx, v = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.use3D()) {
      this.view3d.render(ctx, v, this, this.camMode);
      if (this.fade > 0) this.drawFade(ctx);
      return;
    }
    var inMenu = this.state === S.MAIN_MENU;
    var world = inMenu ? this.menuWorld : this.world;
    var truck = inMenu ? this.menuScene.truck : this.truck;
    var cargo = inMenu ? this.menuScene.cargo : this.cargo;
    var ST = CT.CargoManager.STATE, night = !!world.theme.night, self = this;

    world.drawSky(ctx, v);
    world.drawVerge(ctx, v);
    world.drawProps(ctx, v);
    world.drawStations(ctx, v);
    world.drawRoad(ctx, v, inMenu ? null : this.zone);

    var drawTruck = function () {
      CT.World.setLayer(ctx, v, 1);
      truck.draw(ctx, {
        behindBed: function (c) { cargo.drawOnTruck(c); },
        overBed: function (c) { cargo.drawStraps(c); }
      }, { night: night, t: self.t });
    };
    var farTruck = truck.laneT >= 0.5;
    if (this.traffic && !inMenu) { CT.World.setLayer(ctx, v, 1); this.traffic.drawSide(ctx, v, 1, night); }
    if (farTruck) drawTruck();
    if (this.traffic && !inMenu) { CT.World.setLayer(ctx, v, 1); this.traffic.drawSide(ctx, v, 0, night); }
    if (!farTruck) drawTruck();

    world.drawForeground(ctx, v);
    CT.World.setLayer(ctx, v, 1);
    if (!inMenu) {
      this.loadCrew.drawPallets(ctx);
      this.dropCrew.drawPallets(ctx);
      var dragIt = this.drag ? this.drag.it : null;
      if (this.state === S.LOADING && !this.loadCrew.started && this.cargo.loadedCount() < this.cargo.required) this.drawDropZone(ctx);
      var crewFirst = !this.loadCrew.started;          // idle workers stand behind the loads so they are easy to grab
      if (crewFirst) this.loadCrew.draw(ctx, this.t);
      cargo.drawWorld(ctx, function (it) { return (it.state === ST.DOCK || it.state === ST.STORED || it.state === ST.FALLEN) && it !== dragIt; });
      if (!crewFirst) this.loadCrew.draw(ctx, this.t);
      this.dropCrew.draw(ctx, this.t);
      if (dragIt) { cargo.drawWorld(ctx, function (it) { return it === dragIt; }); }
      if (this.recoverable) this.drawRecoverMark(ctx, this.recoverable);
    }
    this.effects.draw(ctx, this.t);

    if (!inMenu && this.zone.show) world.drawGuide(ctx, v, this.zone);
    world.drawWeather(ctx, v);
    this.drawSpeedStreaks(ctx);
    if (!inMenu && (this.state === S.DRIVING || this.state === S.READY_TO_DRIVE)) this.drawEdgeIndicator(ctx);
    if (this.fade > 0) this.drawFade(ctx);
  };

  Game.prototype.drawDropZone = function (ctx) {
    var bed = this.bedArea(), pulse = 0.5 + 0.5 * Math.sin(this.t * 5), over = this.drag && this.drag.over;
    ctx.save();
    ctx.fillStyle = over ? 'rgba(80,230,110,' + (0.35 + 0.15 * pulse) + ')' : 'rgba(80,230,110,' + (this.drag ? 0.22 : 0.1 + 0.08 * pulse) + ')';
    ctx.strokeStyle = over ? '#2bd45a' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -this.t * 30;
    D.rr(ctx, bed.x1, bed.y - 110, bed.x2 - bed.x1, 110, 10); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    if (!this.drag) {
      var ST = CT.CargoManager.STATE, first = null;
      this.cargo.items.forEach(function (it) { if (it.state === ST.DOCK && !first) first = it; });
      if (first) {          // a bouncing hand points at the next load to drag
        var hy = first.y - 140 - Math.abs(Math.sin(this.t * 4)) * 22;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = D.INK; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(first.x, hy + 34); ctx.lineTo(first.x - 18, hy + 6); ctx.lineTo(first.x - 7, hy + 6); ctx.lineTo(first.x - 7, hy - 22);
        ctx.lineTo(first.x + 7, hy - 22); ctx.lineTo(first.x + 7, hy + 6); ctx.lineTo(first.x + 18, hy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  };
  Game.prototype.drawRecoverMark = function (ctx, it) {
    var y = it.y - 130 - Math.abs(Math.sin(this.t * 4)) * 16;
    ctx.save();
    ctx.fillStyle = '#ffc21a'; ctx.strokeStyle = D.INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(it.x, y, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = D.INK; ctx.font = '28px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', it.x, y + 1);
    ctx.restore();
  };

  /** Horizontal wind streaks in the side view at high speed. */
  Game.prototype.drawSpeedStreaks = function (ctx) {
    var fx = this.speedFx;
    if (fx < 0.4 || !this.truck || this.state === S.MAIN_MENU) return;
    var v = this.view, k = (fx - 0.4) / 0.6, n = Math.round(8 + 22 * k);
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var h1 = Math.abs(Math.sin(i * 91.7)) % 1, h2 = Math.abs(Math.sin(i * 37.3)) % 1;
      var y = v.H * (0.12 + 0.8 * h1);
      var len = v.W * (0.08 + 0.18 * k) * (0.5 + h2);
      var x = v.W - ((this.t * v.W * (1.6 + 2.4 * k) * (0.6 + h2) + h2 * v.W * 3) % (v.W + len * 2)) + len;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.1 + 0.25 * k) * (0.4 + h2 * 0.6) + ')';
      ctx.lineWidth = 1 + 2 * h2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }
  };

  Game.prototype.drawFade = function (ctx) {
    var v = this.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, this.fade) * 0.9 + ')';
    ctx.fillRect(0, 0, v.W, v.H);
  };

  Game.prototype.drawEdgeIndicator = function (ctx) {
    var v = this.view, z = this.level.destination.zone, cx = (z.x1 + z.x2) / 2;
    var sx = (cx - v.camX) * v.scale + v.W / 2;
    if (sx < v.W - 40) return;
    var meters = Math.max(0, Math.round((cx - this.truck.x) * CT.Levels.METERS_PER_UNIT));
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    var x = v.W - 24;
    var y = v.groundY - 290 * v.scale;
    var bob = Math.sin(this.t * 5) * 5;
    ctx.save(); ctx.translate(x + bob, y);
    ctx.fillStyle = '#35b54a'; ctx.strokeStyle = D.INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -24); ctx.lineTo(-30, -10); ctx.lineTo(-62, -10); ctx.lineTo(-62, 10); ctx.lineTo(-30, 10); ctx.lineTo(-30, 24); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = '20px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    var txt = meters >= 1000 ? (meters / 1000).toFixed(1) + ' km' : meters + ' m';
    ctx.lineWidth = 5; ctx.strokeText(txt, -70, 1); ctx.fillStyle = '#fff'; ctx.fillText(txt, -70, 1);
    ctx.restore();
  };

  CT.Game = Game;
})(window.CT);
