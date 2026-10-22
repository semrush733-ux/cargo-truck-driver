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
  Game.prototype.applyPaint = function () { CT.Truck.setPaint(CT.Garage.paint(CT.Storage.getPaint())); };

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
    this.flags = { winShown: false, failShown: false, brakeSqueal: false, curveWarned: {}, timeWarned: false };
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
    // workers start by themselves
    this.later(0.9, function () { if (self.state === S.LOADING) self.loadCrew.start(); });
    if (this.assist > 0) {
      this.later(0.4, function () { CT.UI.toast(self.assist > 1 ? 'Easy mode+: more time, less traffic, tougher cargo' : 'Easy mode: more time and less traffic', 'info'); });
    }
    return true;
  };

  Game.prototype.toMenu = function () {
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
    else if (this.state === S.ARRIVED) this.requestDeliver();
  };

  /** Workers start on their own; tapping LOAD only starts them early. */
  Game.prototype.requestLoad = function () {
    if (this.state !== S.LOADING) return false;
    return this.loadCrew.start();
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
    CT.UI.setCargo(this.cargo.deliveredCount(), this.cargo.required, true);
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
  Game.prototype.damage = function (amount) {
    var mult = (this.cargo.fragile ? 1.8 : 1) * this.truck.cfg.damageMult * this.damageAssist;
    var d = amount * mult;
    if (d <= 0) return 0;
    this.health = Math.max(0, this.health - d);
    var p = this.truck.artToWorld(620, 260);
    if (d >= 1) this.effects.text(p.x, p.y - 60, '-' + Math.round(d) + '%', '#ff6b5e');
    CT.UI.setHealth(this.health, true);
    if (this.health <= 0) this.fail('Cargo destroyed', 'Too many hits damaged all the cargo. Drive gently, slow down for bends and bumps, and avoid crashes. Suspension upgrades help.');
    return d;
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
    CT.UI.toast('Crash! Keep a safe distance from cars.', 'bad');
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
          CT.UI.toast('Too fast over the speed bump!', 'warn');
        }
      }
    });
    var c = this.world.curveAt(tr.x);
    if (c && Math.abs(tr.v) > c.limit + 12 * K) {
      var over = (Math.abs(tr.v) - c.limit) / K;
      this.damage(over * 0.032 * dt * (1.4 - (tr.cfg.grip || 1) * 0.4));
      this.cargo.jolt(over * dt * 6, c.dir);
      this.squealT -= dt;
      if (this.squealT <= 0) { CT.Audio.play('squeal'); this.squealT = 0.6; }
      if (!this.flags.curveWarned[c.x1]) {
        this.flags.curveWarned[c.x1] = true;
        this.curveHits++;
        CT.UI.toast('Too fast for this bend! Slow to ' + Math.round(CT.Garage.kmh(c.limit)) + ' km/h', 'warn');
      }
    }
  };

  Game.prototype.fail = function (title, text) {
    if (this.flags.failShown || this.flags.winShown) return;
    this.flags.failShown = true;
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
    m.cargo.update(dt, m.truck.accelSm);
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
    if (drive && !L.tutorial) this.checkRules(dt, prevFront, prevX);
    this.cargo.update(dt, tr.accelSm);
    this.loadCrew.update(dt);
    this.dropCrew.update(dt);

    if (st === S.LOADING) {
      if (this.cargo.loadedCount() >= this.cargo.required && this.cargo.allStrapped()) this.setState(S.READY_TO_DRIVE);
      else CT.UI.setProgress(this.cargo.loadedCount() / this.cargo.required, this.loadCrew.remaining() + (this.loadCrew.started ? 0.4 : 1.3));
    } else if (st === S.READY_TO_DRIVE) {
      if (input.gas || input.reverse) this.setState(S.DRIVING);
    }

    var z = L.destination.zone;
    var rear = tr.x + CT.Truck.REAR, front = tr.x + CT.Truck.FRONT;
    this.zone.inside = rear >= z.x1 - 60 && front <= z.x2 + 60;
    this.zone.ready = this.zone.inside && Math.abs(tr.v) < L.delivery.maxSpeed && !input.gas && !input.reverse &&
      tr.laneIndex() !== -1 && this.cargo.onTruckCount() === this.cargo.required;
    this.zone.show = (st === S.READY_TO_DRIVE || st === S.DRIVING || st === S.ARRIVED);

    if (this.state === S.DRIVING && this.zone.ready) this.setState(S.ARRIVED);
    else if (this.state === S.ARRIVED && !this.zone.ready) this.setState(S.DRIVING);

    if (this.state === S.DELIVERING) {
      CT.UI.setProgress(this.cargo.deliveredCount() / this.cargo.required, this.dropCrew.remaining());
      if (!this.flags.winShown && this.cargo.deliveredCount() >= this.cargo.required) {
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
    var L = this.level, time = this.stats.time;
    var safe = this.crashes === 0 && this.violations === 0 && this.health >= 90;
    var fast = time <= this.par;
    var stars = 1 + (safe ? 1 : 0) + (fast ? 1 : 0);
    var saved = CT.Storage.completeLevel(L.id, { stars: stars, time: time });
    CT.Storage.clearFails(L.id);
    var coins = CT.Garage.reward(L, stars, saved);
    CT.Storage.addCoins(coins);
    var next = CT.Levels.get(L.id + 1);
    var label = CT.CargoManager.label(L.cargo).toLowerCase();
    this.result = {
      levelId: L.id, levelName: L.name,
      delivered: this.cargo.deliveredCount(), required: this.cargo.required,
      distance: this.truck.distance * CT.Levels.METERS_PER_UNIT,
      time: time, par: this.par, stars: stars, isBest: saved.isBest, coins: coins,
      health: this.health, crashes: this.crashes, violations: this.violations,
      criteria: [
        { ok: true, title: 'Cargo delivered', detail: this.cargo.deliveredCount() + '/' + this.cargo.required + ' · ' + label },
        { ok: safe, title: 'Safe driving', detail: 'Cargo ' + Math.round(this.health) + '% · ' + this.crashes + ' crash' + (this.crashes === 1 ? '' : 'es') + ' · ' + this.violations + ' red light' + (this.violations === 1 ? '' : 's') },
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
        else { key = 'load-' + n; title = 'Workers are loading ' + label; sub = n + '/' + this.cargo.required + ' on the truck'; }
        break;
      case S.READY_TO_DRIVE:
        key = 'ready'; title = "Cargo loaded! Let's drive."; sub = 'Hold GAS to drive to the ' + L.destination.name; tone = 'good';
        break;
      case S.DRIVING:
        var front = tr.x + CT.Truck.FRONT, rear = tr.x + CT.Truck.REAR, A = this.ahead(), cv = this.world.curveAt(tr.x);
        if (front > z.x2 + 60) { key = 'over'; title = 'A little too far!'; sub = 'Hold REVERSE to back into the green zone'; tone = 'warn'; }
        else if (this.zone.inside && Math.abs(tr.v) >= L.delivery.maxSpeed) { key = 'brake'; title = 'You are in the zone!'; sub = 'Hold BRAKE to stop'; tone = 'warn'; }
        else if (this.zone.inside && tr.laneIndex() === -1) { key = 'lanechg'; title = 'Finish the lane change'; }
        else if (this.zone.inside) { key = 'release'; title = 'Let go of the pedals'; sub = 'Stop completely to deliver'; }
        else if (rear < z.x1 - 60 && front > z.x1 - 1600 * K) { key = 'near'; title = 'Stop in the green zone'; sub = 'Ease off and use BRAKE'; }
        else if (cv && Math.abs(tr.v) > cv.limit + 12 * K) { key = 'curve-now'; title = 'Too fast for this bend!'; sub = 'Slow down to ' + kmh(cv.limit) + ' km/h'; tone = 'warn'; }
        else if (A.light && A.light.s === 'red') { key = 'red'; title = 'Red light ahead'; sub = 'Stop before the white line'; tone = 'warn'; }
        else if (A.light) { key = 'yellow'; title = 'Light is changing'; sub = 'Get ready to stop'; tone = 'warn'; }
        else if (A.car) { key = 'traffic'; title = 'Slow traffic ahead'; sub = 'Brake, or steer LEFT / RIGHT to overtake'; tone = 'warn'; }
        else if (A.curve && Math.abs(tr.v) > A.curve.c.limit) { key = 'curve'; title = 'Bend ahead'; sub = 'Slow to ' + kmh(A.curve.c.limit) + ' km/h'; tone = 'warn'; }
        else if (A.bump && Math.abs(tr.v) > A.bump.o.limit) { key = 'bump'; title = 'Speed bump ahead'; sub = 'Slow to ' + kmh(A.bump.o.limit) + ' km/h'; tone = 'warn'; }
        else if (tr.x < L.start.x - 60) { key = 'wrong'; title = 'The hub is the other way'; sub = 'Hold GAS to drive forward'; tone = 'warn'; }
        else { key = 'drive'; title = 'Drive to the ' + L.destination.name; sub = Math.round(remaining) + ' m to go'; }
        break;
      case S.ARRIVED:
        key = 'arrived'; title = 'Perfect stop!'; sub = 'Tap DELIVER to unload'; tone = 'good';
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
      cargo.drawWorld(ctx, function (it) { return it.state === ST.DOCK || it.state === ST.STORED; });
      this.loadCrew.draw(ctx, this.t);
      this.dropCrew.draw(ctx, this.t);
    }
    this.effects.draw(ctx, this.t);

    if (!inMenu && this.zone.show) world.drawGuide(ctx, v, this.zone);
    world.drawWeather(ctx, v);
    this.drawSpeedStreaks(ctx);
    if (!inMenu && (this.state === S.DRIVING || this.state === S.READY_TO_DRIVE)) this.drawEdgeIndicator(ctx);
    if (this.fade > 0) this.drawFade(ctx);
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
