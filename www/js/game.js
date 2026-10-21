/* game.js — state machine, update loop, traffic/curve/bump/red-light rules, scoring, camera and rendering. */
(function (CT) {
  'use strict';
  var D = CT.Draw;

  var S = {
    MAIN_MENU: 'MAIN_MENU', LOADING: 'LOADING', READY_TO_DRIVE: 'READY_TO_DRIVE', DRIVING: 'DRIVING',
    ARRIVED: 'ARRIVED', DELIVERING: 'DELIVERING', LEVEL_COMPLETE: 'LEVEL_COMPLETE', LEVEL_FAILED: 'LEVEL_FAILED', PAUSED: 'PAUSED'
  };
  var DRIVE_STATES = [S.READY_TO_DRIVE, S.DRIVING, S.ARRIVED];
  var PLAY_STATES = [S.LOADING, S.READY_TO_DRIVE, S.DRIVING, S.ARRIVED, S.DELIVERING];
  var CAMERAS = ['side', 'chase', 'cab'];
  var VIEW_H = 760;

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = S.MAIN_MENU;
    this.prevState = null;
    this.stateTime = 0;
    this.t = 0; this.lt = 0;
    this.effects = new CT.Effects();
    this.view3d = new CT.View3D();
    this.view = { W: 1, H: 1, dpr: 1, scale: 1, groundY: 1, camX: 0, camY: 0, t: 0, lt: 0, shakeX: 0, shakeY: 0 };
    this.shake = 0;
    this.fade = 0;
    this.level = null;
    this.timers = [];
    this.hintKey = '';
    this.zone = { inside: false, ready: false, show: false };
    this.camMode = CAMERAS.indexOf(CT.Storage.getSetting('camera')) >= 0 ? CT.Storage.getSetting('camera') : 'side';
    this.health = 100;
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
    var tr = new CT.Truck({ maxSpeed: 260, accel: 200 });
    tr.place(1900, this.menuWorld.heightAt);
    var cm = new CT.CargoManager(L);
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
    var tr = new CT.Truck(CT.Garage.truckConfig(L));
    tr.minX = L.road.start + 40 - CT.Truck.REAR;
    tr.maxX = L.road.end - 40 - CT.Truck.FRONT;
    tr.place(L.start.x, this.world.heightAt);
    var self = this;
    tr.onImpact = function (speed, dir) { self.onImpact(speed, dir); };
    this.truck = tr;
    this.cargo = new CT.CargoManager(L);
    this.loadCrane = new CT.Crane(L.loadStation.crane);
    this.dropCrane = new CT.Crane(L.destination.crane);
    this.loadCrane.onSound = this.dropCrane.onSound = function (n) { CT.Audio.play(n); };
    this.traffic = L.traffic ? new CT.Traffic(L, this.world) : null;
    if (this.traffic) this.traffic.init(tr);
    this.stats = { time: 0, startX: L.start.x };
    this.health = 100;
    this.crashes = 0; this.violations = 0; this.curveHits = 0; this.bumpHits = 0;
    this.flags = { winShown: false, failShown: false, brakeSqueal: false, curveWarned: {}, timeWarned: false };
    this.unloadIndex = 0;
    this.loadQueue = 0;
    this.unloadDelay = 0;
    this.winTimer = -1; this.failTimer = -1;
    this.smokeT = 0; this.dustT = 0; this.squealT = 0;
    this.lt = 0;
    this.timers = [];
    this.effects.clear();
    this.zone = { inside: false, ready: false, show: false };
    this.hintKey = '';
    this.shake = 0; this.fade = 1;
    this.result = null; this.failInfo = null;
    CT.Controls.releaseAll();
    this.view.camX = this.cameraTarget(S.LOADING);
    this.view.camY = tr.y;
    this.setState(S.LOADING);
    CT.UI.enterLevel(L, this.cargo.required);
    CT.UI.setCargo(0, this.cargo.required, 'Cargo');
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
        this.unloadDelay = 0.7;
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

  Game.prototype.cycleCamera = function () {
    var i = (CAMERAS.indexOf(this.camMode) + 1) % CAMERAS.length;
    this.setCamera(CAMERAS[i]);
  };
  Game.prototype.setCamera = function (m) {
    this.camMode = m;
    CT.Storage.setSetting('camera', m);
    CT.Audio.play('click');
    CT.UI.setCameraLabel(m);
    if (this.level && this.isDriving() && m !== 'side') CT.UI.toast(m === 'cab' ? 'Cab view (FPP)' : 'Chase view (TPP)', 'info');
    else if (this.level && this.isDriving()) CT.UI.toast('Side view', 'info');
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

  Game.prototype.horn = function () {
    if (!this.level) return;
    CT.Audio.play('horn');
  };

  /** Boxes still on the dock that the player has not asked for yet. */
  Game.prototype.loadsAvailable = function () {
    var onDock = this.cargo.items.filter(function (i) { return i.state === CT.CargoManager.STATE.DOCK; }).length;
    var j = this.loadCrane.job;
    var pendingNow = j && (j.phase === 'toPick' || j.phase === 'lower') ? 1 : 0;
    return onDock - pendingNow - this.loadQueue;
  };

  Game.prototype.requestLoad = function () {
    if (this.state !== S.LOADING) return false;
    if (this.loadsAvailable() <= 0) return false;
    CT.Audio.play('click');
    if (this.loadCrane.busy()) { this.loadQueue++; CT.UI.refreshAction(this); return true; }
    return this.startLoadJob();
  };

  Game.prototype.startLoadJob = function () {
    var item = this.cargo.nextOnDock();
    var slot = this.cargo.freeSlot();
    if (!item || slot < 0) return false;
    var self = this, ST = CT.CargoManager.STATE;
    this.loadCrane.start({
      item: item,
      from: function () { return { x: item.dock.x, y: item.dock.y }; },
      to: function () { return self.truck.slotWorld(slot); },
      onAttach: function (it) { it.state = ST.CRANE; },
      onRelease: function (it) {
        var counted = self.cargo.placeOnTruck(it, slot);
        self.truck.cargoWeight = self.cargo.weightOnTruck();
        self.truck.jolt(30);
        CT.Audio.play('clunk');
        self.later(0.18, function () { CT.Audio.play('strap'); });
        if (counted) {
          var p = self.truck.slotWorld(slot);
          self.effects.sparkle(p.x, p.y - 60, 14);
          self.effects.text(p.x, p.y - 110, '+1', '#ffd34a');
          CT.UI.setCargo(self.cargo.loadedCount(), self.cargo.required, 'Cargo', true);
          self.later(0.25, function () { CT.Audio.play('count'); });
          CT.vibrate(25);
        }
      },
      onDone: function () {
        if (self.loadQueue > 0 && self.state === S.LOADING) { self.loadQueue--; self.startLoadJob(); }
        CT.UI.refreshAction(self);
        self.updateHints(true);
      }
    });
    CT.UI.refreshAction(this);
    this.updateHints(true);
    return true;
  };

  Game.prototype.requestDeliver = function () {
    if (this.state !== S.ARRIVED || !this.zone.ready) return false;
    this.truck.v = 0;
    CT.Audio.play('click');
    this.setState(S.DELIVERING);
    return true;
  };

  Game.prototype.startNextUnload = function () {
    var self = this;
    var item = this.cargo.nextOnTruck();
    if (!item || item.strap > 0.02) return;
    var slot = item.slot;
    var target = this.level.destination.dockSlots[this.unloadIndex++];
    this.dropCrane.start({
      item: item,
      from: function () { return self.truck.slotWorld(slot); },
      to: function () { return { x: target.x, y: target.y }; },
      onAttach: function (it) { self.cargo.liftFromTruck(it); self.truck.cargoWeight = self.cargo.weightOnTruck(); self.truck.jolt(-14); },
      onRelease: function (it) {
        it.x = target.x; it.y = target.y; it.rot = 0;
        if (self.cargo.markDelivered(it)) {
          CT.Audio.play('deliver');
          self.effects.sparkle(it.x, it.y - 50, 16, '#7dff8a');
          self.effects.text(it.x, it.y - 110, self.cargo.deliveredCount() + '/' + self.cargo.required, '#7dff8a');
          CT.UI.setCargo(self.cargo.deliveredCount(), self.cargo.required, 'Delivered', true);
          CT.vibrate(25);
        }
        self.updateHints(true);
      }
    });
  };

  // ================================================================ damage & rules
  Game.prototype.damage = function (amount, label) {
    var L = this.level;
    var mult = (L.cargo.fragile ? 1.8 : 1) * this.truck.cfg.damageMult;
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
    if (speed < 25) return;
    var k = Math.min(1, speed / 300);
    this.cargo.jolt(speed * 0.6, dir > 0 ? 1 : -1);
    this.truck.jolt(speed * 0.4 * dir);
    this.shake = Math.max(this.shake, 4 + k * 10);
    CT.Audio.play('bump');
    CT.vibrate(Math.round(30 + k * 60));
    var x = this.truck.x + (dir > 0 ? CT.Truck.FRONT : CT.Truck.REAR);
    this.effects.puff(x, this.truck.y, 8);
    if (speed > 120 && !this.level.tutorial) this.damage((speed - 120) * 0.05, 'wall');
    if (speed > 80) CT.UI.toast('Bump! Use the brake to stop gently.', 'warn');
  };

  Game.prototype.crash = function (ev) {
    var rel = ev.rel;
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
    this.damage(8 + rel * 0.07, 'crash');
    CT.UI.toast('Crash! Keep a safe distance from cars.', 'bad');
  };

  Game.prototype.checkRules = function (dt, prevFront, prevX) {
    var L = this.level, tr = this.truck, self = this;
    var front = tr.x + CT.Truck.FRONT;
    // red lights
    (L.lights || []).forEach(function (l) {
      var stop = l.x - 60;
      if (prevFront < stop && front >= stop && tr.v > 15) {
        if (CT.Traffic.lightState(l, self.lt) === 'red') {
          self.violations++;
          CT.Audio.play('alarm');
          CT.UI.toast('You ran a red light!', 'bad');
          self.effects.text(stop, tr.y - 260, 'RED LIGHT!', '#ff6b5e');
        }
      }
    });
    // speed bumps (front axle)
    (L.obstacles || []).forEach(function (o) {
      if (o.type !== 'bump') return;
      var wx = tr.x + 170;          // front wheel
      var pw = prevX + 170;
      if ((pw < o.x && wx >= o.x) || (pw > o.x && wx <= o.x)) {
        var v = Math.abs(tr.v);
        tr.jolt(-Math.min(160, v * 0.25));
        CT.Audio.play('bump');
        if (v > o.limit) {
          self.bumpHits++;
          self.cargo.jolt(v * 0.4, 1);
          self.shake = Math.max(self.shake, 5);
          self.damage((v - o.limit) * 0.06, 'bump');
          CT.UI.toast('Too fast over the speed bump!', 'warn');
        }
      }
    });
    // curves
    var c = this.world.curveAt(tr.x);
    if (c && Math.abs(tr.v) > c.limit + 12) {
      var over = Math.abs(tr.v) - c.limit;
      this.damage(over * 0.032 * dt * (1.4 - (tr.cfg.grip || 1) * 0.4), 'curve');
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
    this.failInfo = { title: title, text: text };
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
    if (m.truck.x > 4200) { m.truck.place(1900, this.menuWorld.heightAt); m.truck.v = 220; this.view.camX = this.cameraTarget(S.MAIN_MENU); this.fade = 1; }
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
    this.loadCrane.update(dt);
    this.dropCrane.update(dt);

    if (st === S.LOADING) {
      if (this.cargo.loadedCount() >= this.cargo.required && !this.loadCrane.busy() && this.cargo.allStrapped()) this.setState(S.READY_TO_DRIVE);
    } else if (st === S.READY_TO_DRIVE) {
      if (input.gas || input.reverse) this.setState(S.DRIVING);
    }

    // destination detection
    var z = L.destination.zone;
    var rear = tr.x + CT.Truck.REAR, front = tr.x + CT.Truck.FRONT;
    this.zone.inside = rear >= z.x1 - 60 && front <= z.x2 + 60;
    this.zone.ready = this.zone.inside && Math.abs(tr.v) < L.delivery.maxSpeed && !input.gas && !input.reverse &&
      tr.laneIndex() !== -1 && this.cargo.onTruckCount() === this.cargo.required;
    this.zone.show = (st === S.READY_TO_DRIVE || st === S.DRIVING || st === S.ARRIVED);

    if (this.state === S.DRIVING && this.zone.ready) this.setState(S.ARRIVED);
    else if (this.state === S.ARRIVED && !this.zone.ready) this.setState(S.DRIVING);

    if (this.state === S.DELIVERING) {
      if (this.unloadDelay > 0) this.unloadDelay -= dt;
      else if (!this.dropCrane.busy() && this.cargo.onTruckCount() > 0) this.startNextUnload();
      if (!this.flags.winShown && this.cargo.deliveredCount() >= this.cargo.required && !this.dropCrane.busy()) {
        this.flags.winShown = true;
        this.completeLevel();
      }
    }
    // time limit
    if (L.timeLimit && !ended && this.state !== S.DELIVERING) {
      var left = L.timeLimit - this.stats.time;
      if (left < 15 && !this.flags.timeWarned) { this.flags.timeWarned = true; CT.Audio.play('alarm'); CT.UI.toast('15 seconds left!', 'warn'); }
      if (left <= 0) this.fail("Time's up", 'The delivery took too long. Upgrade the engine for more speed, or take bends and lights more smoothly.');
    }
    if (this.winTimer > 0) { this.winTimer -= dt; if (this.winTimer <= 0) CT.UI.showWin(this.result); }
    if (this.failTimer > 0) { this.failTimer -= dt; if (this.failTimer <= 0) CT.UI.showFail(this.failInfo, this); }

    if (tr.braking && Math.abs(tr.v) > 200) { if (!this.flags.brakeSqueal) { this.flags.brakeSqueal = true; CT.Audio.play('brake'); } }
    else if (!tr.braking) this.flags.brakeSqueal = false;

    if (drive || this.state === S.DELIVERING) CT.Audio.engineSet(tr.speedRatio(), tr.throttle + tr.revThrottle * 0.7);
    if (drive) this.emitDriveFx(tr, dt, 1);

    this.updateHints(false);
    CT.UI.updateHud(this);
  };

  Game.prototype.completeLevel = function () {
    var L = this.level, time = this.stats.time;
    var safe = this.crashes === 0 && this.violations === 0 && this.health >= 90;
    var fast = time <= L.par;
    var stars = 1 + (safe ? 1 : 0) + (fast ? 1 : 0);
    var saved = CT.Storage.completeLevel(L.id, { stars: stars, time: time });
    var coins = CT.Garage.reward(L, stars, saved);
    CT.Storage.addCoins(coins);
    var next = CT.Levels.get(L.id + 1);
    this.result = {
      levelId: L.id, levelName: L.name,
      delivered: this.cargo.deliveredCount(), required: this.cargo.required,
      distance: this.truck.distance * CT.Levels.METERS_PER_UNIT,
      time: time, par: L.par, stars: stars, isBest: saved.isBest, coins: coins,
      health: this.health, crashes: this.crashes, violations: this.violations,
      criteria: [
        { ok: true, title: 'Cargo delivered', detail: this.cargo.deliveredCount() + '/' + this.cargo.required + ' ' + (L.cargo.label || 'boxes').toLowerCase() },
        { ok: safe, title: 'Safe driving', detail: 'Cargo ' + Math.round(this.health) + '% · ' + this.crashes + ' crash' + (this.crashes === 1 ? '' : 'es') + ' · ' + this.violations + ' red light' + (this.violations === 1 ? '' : 's') },
        { ok: fast, title: 'Fast delivery', detail: CT.UI.fmtTime(time) + ' (target ' + CT.UI.fmtTime(L.par) + ')' }
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
        this.dustT = 0.07;
      }
    }
  };

  // ================================================================ hints
  Game.prototype.ahead = function () {
    var L = this.level, tr = this.truck, front = tr.x + CT.Truck.FRONT, out = {}, self = this;
    (L.lights || []).forEach(function (l) {
      var d = l.x - 60 - front;
      if (d > 0 && d < 1100 && !out.light) { var s = CT.Traffic.lightState(l, self.lt); if (s !== 'green') out.light = { d: d, s: s }; }
    });
    (L.road.curves || []).forEach(function (c) { var d = c.x1 - front; if (d > 0 && d < 1300 && !out.curve) out.curve = { d: d, c: c }; });
    (L.obstacles || []).forEach(function (o) { var d = o.x - front; if (d > 0 && d < 900 && !out.bump) out.bump = { d: d, o: o }; });
    if (this.traffic) {
      var lane = tr.laneIndex();
      this.traffic.cars.forEach(function (c) {
        if (c.lane !== lane) return;
        var d = c.x - c.len / 2 - front;
        if (d > 0 && d < 700 && c.v < tr.v - 40 && (!out.car || d < out.car.d)) out.car = { d: d, c: c };
      });
    }
    return out;
  };

  Game.prototype.updateHints = function (force) {
    if (!this.level) return;
    var st = this.state, L = this.level, tr = this.truck, z = L.destination.zone, key, title, sub = '', tone = '';
    var remaining = Math.max(0, ((z.x1 + z.x2) / 2 - tr.x) * CT.Levels.METERS_PER_UNIT);
    var kmh = function (v) { return Math.round(CT.Garage.kmh(v)); };
    switch (st) {
      case S.LOADING:
        var n = this.cargo.loadedCount();
        if (this.loadCrane.busy()) { key = 'loading-busy'; title = 'Loading ' + (L.cargo.label || 'cargo').toLowerCase() + ' ' + Math.min(this.cargo.required, n + 1) + ' of ' + this.cargo.required + '…'; sub = 'The crane is placing it on your truck'; }
        else if (n === 0) { key = 'load-0'; title = 'Load the cargo onto your truck.'; sub = 'Tap LOAD to lift each item with the crane'; }
        else if (n < this.cargo.required) { key = 'load-' + n; title = 'Nice! ' + n + '/' + this.cargo.required + ' loaded'; sub = 'Tap LOAD again'; }
        else { key = 'load-strap'; title = 'Strapping the cargo…'; }
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
        else if (rear < z.x1 - 60 && front > z.x1 - 1600) { key = 'near'; title = 'Stop in the green zone'; sub = 'Ease off and use BRAKE'; }
        else if (cv && Math.abs(tr.v) > cv.limit + 12) { key = 'curve-now'; title = 'Too fast for this bend!'; sub = 'Slow down to ' + kmh(cv.limit) + ' km/h'; tone = 'warn'; }
        else if (A.light && A.light.s === 'red') { key = 'red'; title = 'Red light ahead'; sub = 'Stop before the white line'; tone = 'warn'; }
        else if (A.light) { key = 'yellow'; title = 'Light is changing'; sub = 'Get ready to stop'; tone = 'warn'; }
        else if (A.car) { key = 'traffic'; title = 'Slow traffic ahead'; sub = 'Brake, or tap LANE to overtake'; tone = 'warn'; }
        else if (A.curve && Math.abs(tr.v) > A.curve.c.limit) { key = 'curve'; title = 'Bend ahead'; sub = 'Slow to ' + kmh(A.curve.c.limit) + ' km/h'; tone = 'warn'; }
        else if (A.bump && Math.abs(tr.v) > A.bump.o.limit) { key = 'bump'; title = 'Speed bump ahead'; sub = 'Slow to ' + kmh(A.bump.o.limit) + ' km/h'; tone = 'warn'; }
        else if (tr.x < L.start.x - 60) { key = 'wrong'; title = 'The hub is the other way'; sub = 'Hold GAS to drive forward'; tone = 'warn'; }
        else { key = 'drive'; title = 'Drive to the ' + L.destination.name; sub = Math.round(remaining) + ' m to go'; }
        break;
      case S.ARRIVED:
        key = 'arrived'; title = 'Perfect stop!'; sub = 'Tap DELIVER to unload'; tone = 'good';
        break;
      case S.DELIVERING:
        key = 'deliver-' + this.cargo.deliveredCount(); title = 'Unloading… ' + this.cargo.deliveredCount() + '/' + this.cargo.required; sub = 'The hub crane is taking your cargo';
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
    if (s === S.LOADING) target = (L.loadStation.dock.x + tr.x) / 2 + 40;
    else if (s === S.DELIVERING || s === S.LEVEL_COMPLETE) target = (L.destination.dock.x + tr.x) / 2 + 30;
    else target = tr.x + Math.min(halfW * 0.3, 160) + D.clamp(tr.v * 0.45, -160, 320);
    var lo = L.road.start - 260 + halfW, hi = L.road.end + 320 - halfW;
    if (lo < hi) target = D.clamp(target, lo, hi);
    return target;
  };

  Game.prototype.updateCamera = function (dt) {
    var target = this.cameraTarget(this.state);
    var k = this.state === S.MAIN_MENU ? 4 : 2.6;
    if (this.state !== S.MAIN_MENU && Math.abs(this.truck.v) > 400) k = 4;
    this.view.camX += (target - this.view.camX) * Math.min(1, dt * k);
    var ty = this.state === S.MAIN_MENU ? this.menuScene.truck.y : this.truck.y;
    this.view.camY += (ty - this.view.camY) * Math.min(1, dt * 3);
    this.view.shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.view.shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0;
  };

  Game.prototype.resize = function (w, h, dpr) {
    var v = this.view;
    v.W = w; v.H = h; v.dpr = dpr;
    var portrait = h > w * 1.05;
    var short = !portrait && h < 520;
    v.scale = Math.min(h / (short ? 900 : VIEW_H), w / 980);
    if (portrait) v.scale = w / 900;
    v.groundY = portrait ? h * 0.6 : short ? h * 0.63 : h * 0.745;
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
      CT.World.setLayer(ctx, v, 1);
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

    CT.World.setLayer(ctx, v, 1);
    if (!inMenu) { this.loadCrane.drawStructure(ctx); this.dropCrane.drawStructure(ctx); }
    else this.drawMenuCranes(ctx);
    cargo.drawWorld(ctx, function (it) { return it.state === ST.DOCK || it.state === ST.STORED; });

    world.drawRoad(ctx, v, inMenu ? null : this.zone);

    CT.World.setLayer(ctx, v, 1);
    if (!inMenu) {
      this.loadCrane.drawRig(ctx);
      this.dropCrane.drawRig(ctx);
      cargo.drawWorld(ctx, function (it) { return it.state === ST.CRANE; });
    }
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
    this.effects.draw(ctx, this.t);

    if (!inMenu && this.zone.show) world.drawGuide(ctx, v, this.zone);
    world.drawWeather(ctx, v);
    if (!inMenu && (this.state === S.DRIVING || this.state === S.READY_TO_DRIVE)) this.drawEdgeIndicator(ctx);
    if (this.fade > 0) this.drawFade(ctx);
  };

  Game.prototype.drawFade = function (ctx) {
    var v = this.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, this.fade) * 0.9 + ')';
    ctx.fillRect(0, 0, v.W, v.H);
  };

  Game.prototype.drawMenuCranes = function (ctx) {
    if (!this._menuCranes) {
      var L = CT.Levels.get(1);
      this._menuCranes = [new CT.Crane(L.loadStation.crane), new CT.Crane(L.destination.crane)];
    }
    this._menuCranes.forEach(function (c) { c.drawStructure(ctx); c.drawRig(ctx); });
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
    ctx.lineWidth = 5; ctx.strokeText(meters + ' m', -70, 1); ctx.fillStyle = '#fff'; ctx.fillText(meters + ' m', -70, 1);
    ctx.restore();
  };

  CT.Game = Game;
})(window.CT);
