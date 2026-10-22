/* workers.js — teams of two workers carry each load between the pallets (foreground) and the truck bed. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;
  var SKIN = ['#f1c27d', '#c68642', '#e0ac69', '#8d5524', '#f5d0a9', '#a0673c'];
  var SHIRT = ['#ff8a1f', '#ffc21a', '#ff8a1f', '#7fd34e'];
  var FEET = 112;            // feet line, on the near kerb in front of the truck
  var CARRY = -64;           // load bottom relative to feet while carried (shoulder height)
  var RAIL_ART = 262;        // art y just above the cargo-frame rail
  var HALF = 56;             // half width of a load in world units

  function Crew(game, mode, pallets) {
    this.g = game;
    this.mode = mode;            // 'load' | 'unload'
    this.pallets = pallets;
    this.teams = [];
    this.started = false;
    this.onItem = null;          // callback(item, counted)
    var rnd = D.rng((game.level ? game.level.id : 1) * 31 + (mode === 'load' ? 1 : 2));
    for (var i = 0; i < pallets.length; i++) {
      var p = pallets[i];
      this.teams.push({
        idx: i, pallet: p, x: mode === 'unload' ? p.x - 40 : pallets[pallets.length - 1].x + 95 + i * 34, dir: -1, phase: 'idle', t: 0,
        delay: i * 0.6, walk: rnd() * 6, item: null, slot: -1,
        skin: [SKIN[Math.floor(rnd() * SKIN.length)], SKIN[Math.floor(rnd() * SKIN.length)]],
        shirt: [SHIRT[Math.floor(rnd() * SHIRT.length)], SHIRT[Math.floor(rnd() * SHIRT.length)]],
        waveT: rnd() * 3
      });
    }
  }
  Crew.FEET = FEET;

  Crew.prototype.assign = function (items) {
    var self = this;
    items.forEach(function (it, i) { if (self.teams[i]) { self.teams[i].item = it; self.teams[i].slot = self.mode === 'load' ? i : it.slot; } });
  };

  Crew.prototype.start = function () {
    if (this.started) return false;
    this.started = true;
    this.teams.forEach(function (tm) { if (tm.item) { tm.phase = 'wait'; tm.t = 0; } });
    return true;
  };

  Crew.prototype.busy = function () {
    return this.teams.some(function (tm) { return tm.item && tm.phase !== 'back' && tm.phase !== 'rest' && tm.phase !== 'idle'; });
  };

  function walkSpeed(tm, carrying) {
    if (!carrying) return 230;
    return 185 / (1 + 0.22 * ((tm.item ? tm.item.weight : 1) - 1));
  }

  Crew.prototype.slotWorld = function (tm) {
    var tr = this.g.truck, ax = CT.Truck.SLOTS[tm.slot];
    var p = tr.artToWorld(ax, RAIL_ART);
    return { x: p.x, railY: p.y };
  };

  /** Seconds until all teams have handed over their load. */
  Crew.prototype.remaining = function () {
    var self = this, worst = 0;
    this.teams.forEach(function (tm) {
      if (!tm.item) return;
      var r = 0, sw = tm.slot >= 0 ? self.slotWorld(tm) : { x: tm.x };
      var dSlot = Math.abs(sw.x - tm.x), dPal = Math.abs(tm.pallet.x - tm.x);
      var full = Math.abs(sw.x - tm.pallet.x) / walkSpeed(tm, true);
      if (self.mode === 'load') {
        switch (tm.phase) {
          case 'idle': case 'wait': r = Math.max(0, tm.delay - (tm.phase === 'wait' ? tm.t : 0)) + 0.45 + full + 0.75; break;
          case 'pick': r = 0.45 - tm.t + full + 0.75; break;
          case 'carry': r = dSlot / walkSpeed(tm, true) + 0.75; break;
          case 'lift': r = 0.75 - tm.t; break;
        }
      } else {
        switch (tm.phase) {
          case 'idle': case 'wait': r = Math.max(0, tm.delay - (tm.phase === 'wait' ? tm.t : 0)) + Math.abs(sw.x - tm.x) / walkSpeed(tm, false) + 1.2 + full + 0.4; break;
          case 'go': r = dSlot / walkSpeed(tm, false) + 1.2 + full + 0.4; break;
          case 'reach': r = 0.5 - tm.t + 0.7 + full + 0.4; break;
          case 'take': r = 0.7 - tm.t + full + 0.4; break;
          case 'carry': r = dPal / walkSpeed(tm, true) + 0.4; break;
          case 'put': r = 0.4 - tm.t; break;
        }
      }
      worst = Math.max(worst, r);
    });
    return worst;
  };

  function moveTo(tm, x, speed, dt) {
    var d = x - tm.x, step = speed * dt;
    if (Math.abs(d) <= step) { tm.walk += Math.abs(d) / 20; tm.x = x; return true; }
    tm.dir = d > 0 ? 1 : -1;
    tm.x += tm.dir * step; tm.walk += step / 20;
    return false;
  }

  function arc(a, b, u, h) { return { x: D.lerp(a.x, b.x, u), y: D.lerp(a.y, b.y, u) - Math.sin(u * Math.PI) * h }; }

  Crew.prototype.update = function (dt) {
    var self = this, cargo = this.g.cargo, ST = CT.CargoManager.STATE;
    var liftArt = RAIL_ART - CT.Truck.BED_TOP;             // negative: raised above the bed floor
    this.teams.forEach(function (tm) {
      tm.t += dt; tm.waveT += dt;
      var it = tm.item;
      if (!it || !self.started) return;
      var carryY = FEET + CARRY;
      if (self.mode === 'load') {
        switch (tm.phase) {
          case 'wait':                         // walk over to the load first, then pick it up
            if (!moveTo(tm, tm.pallet.x, walkSpeed(tm, false), dt)) break;
            if (tm.t >= tm.delay) { tm.phase = 'pick'; tm.t = 0; it.state = ST.CARRY; tm.dir = 1; }
            break;
          case 'pick':
            var u = Math.min(1, tm.t / 0.45);
            it.x = tm.x; it.y = D.lerp(tm.pallet.y, carryY, u * u * (3 - 2 * u));
            if (u >= 1) { tm.phase = 'carry'; tm.t = 0; }
            break;
          case 'carry':
            var sw = self.slotWorld(tm);
            var arrived = moveTo(tm, sw.x, walkSpeed(tm, true), dt);
            it.x = tm.x; it.y = carryY + Math.abs(Math.sin(tm.walk * Math.PI)) * -3; it.rot = Math.sin(tm.walk * Math.PI) * 0.02;
            if (arrived) { tm.phase = 'lift'; tm.t = 0; tm.from = { x: it.x, y: it.y }; }
            break;
          case 'lift':
            var u2 = Math.min(1, tm.t / 0.75), sw2 = self.slotWorld(tm);
            var e = u2 * u2 * (3 - 2 * u2);
            var p = arc(tm.from, { x: sw2.x, y: sw2.railY }, e, 40);
            it.x = p.x; it.y = p.y; it.rot = Math.sin(u2 * Math.PI) * -0.05;
            if (u2 >= 1) {
              var counted = cargo.placeOnTruck(it, tm.slot, liftArt);
              if (self.onItem) self.onItem(it, counted);
              tm.phase = 'back'; tm.t = 0;
            }
            break;
          case 'back': if (moveTo(tm, tm.pallet.x - 30 + tm.idx * 4, walkSpeed(tm, false), dt)) { tm.phase = 'rest'; tm.dir = 1; tm.waveT = 0; } break;
        }
      } else {
        switch (tm.phase) {
          case 'wait': if (tm.t >= tm.delay && it.strap <= 0.02) { tm.phase = 'go'; tm.t = 0; } break;
          case 'go': if (moveTo(tm, self.slotWorld(tm).x, walkSpeed(tm, false), dt)) { tm.phase = 'reach'; tm.t = 0; } break;
          case 'reach':
            var r = Math.min(1, tm.t / 0.5);
            it.lift = liftArt * r * r;
            if (r >= 1) {
              var sw3 = self.slotWorld(tm);
              cargo.liftFromTruck(it);
              self.g.truck.cargoWeight = cargo.weightOnTruck();
              tm.from = { x: sw3.x, y: sw3.railY };
              tm.phase = 'take'; tm.t = 0;
            }
            break;
          case 'take':
            var u3 = Math.min(1, tm.t / 0.7), e3 = u3 * u3 * (3 - 2 * u3);
            var p3 = arc(tm.from, { x: tm.x, y: carryY }, e3, 30);
            it.x = p3.x; it.y = p3.y;
            if (u3 >= 1) { tm.phase = 'carry'; tm.t = 0; }
            break;
          case 'carry':
            var arrived2 = moveTo(tm, tm.pallet.x, walkSpeed(tm, true), dt);
            it.x = tm.x; it.y = carryY + Math.abs(Math.sin(tm.walk * Math.PI)) * -3; it.rot = Math.sin(tm.walk * Math.PI) * 0.02;
            if (arrived2) { tm.phase = 'put'; tm.t = 0; }
            break;
          case 'put':
            var u4 = Math.min(1, tm.t / 0.4);
            it.x = tm.pallet.x; it.y = D.lerp(carryY, tm.pallet.y, u4); it.rot = 0;
            if (u4 >= 1) {
              var c2 = cargo.markDelivered(it);
              if (self.onItem) self.onItem(it, c2);
              tm.phase = 'rest'; tm.t = 0; tm.waveT = 0; tm.dir = -1;
            }
            break;
        }
      }
    });
  };

  // ------------------------------------------------------------ drawing
  function pallet(ctx, x, y) {
    D.box(ctx, x - 60, y, 120, 12, 2, '#b8783e', INK, 2.5);
    ctx.fillStyle = '#8a5528';
    ctx.fillRect(x - 54, y + 4, 16, 6); ctx.fillRect(x - 8, y + 4, 16, 6); ctx.fillRect(x + 38, y + 4, 16, 6);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y + 14, 66, 5, 0, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * One worker, feet at (x, y). pose: 'walk' | 'carry' | 'lift' | 'idle' | 'wave'.
   * hand: point the hands reach for (world), used by carry/lift.
   */
  function worker(ctx, x, y, dir, walk, pose, skin, shirt, hand, t) {
    var moving = pose === 'walk' || pose === 'carry';
    var sw = moving ? Math.sin(walk * Math.PI) : 0;
    ctx.save(); ctx.translate(x, y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 2, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    var hipY = -50, legL = 48;
    var bend = pose === 'lift' ? 0.18 : 0;
    // legs
    [[sw * 0.5, '#24497f'], [-sw * 0.5, '#2f5d9e']].forEach(function (L, i) {
      var a = L[0] + (i ? bend : -bend);
      var fx = Math.sin(a) * legL * dir, fy = hipY + Math.cos(a) * legL;
      ctx.strokeStyle = INK; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(i ? 3 : -3, hipY); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = L[1]; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(i ? 3 : -3, hipY); ctx.lineTo(fx, fy); ctx.stroke();
      D.box(ctx, fx - 6 + dir * 3, fy - 5, 15, 9, 3, '#3a2a1e', INK, 2);
    });
    // torso (hi-vis vest)
    var bob = moving ? -Math.abs(sw) * 2 : 0;
    ctx.translate(0, bob);
    D.box(ctx, -15, -94, 30, 48, 10, shirt, INK, 3);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(-14, -74, 28, 5); ctx.fillRect(-14, -62, 28, 5);
    ctx.fillStyle = '#2f5d9e'; ctx.fillRect(-14, -52, 28, 6);
    // head + hard hat
    D.circle(ctx, dir * 2, -108, 14, skin, INK, 3);
    ctx.fillStyle = '#ffd21f'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(dir * 2, -112, 15, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dir * 2 - 13 * dir, -112); ctx.lineTo(dir * 2 + 22 * dir, -112); ctx.stroke();
    D.circle(ctx, dir * 9, -106, 2.4, INK);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(dir * 7, -101, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    // arms
    var sh = { x: 0, y: -86 };
    function arm(tx, ty, col) {
      ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(tx, ty); ctx.stroke();
      D.circle(ctx, tx, ty, 5.5, skin, INK, 2);
    }
    if ((pose === 'carry' || pose === 'lift') && hand) {
      arm(hand.x - x, hand.y - y - bob, shirt);
    } else if (pose === 'wave') {
      var wv = Math.sin(t * 10) * 10;
      arm(dir * 14 + wv, -130, shirt);
      arm(-dir * 8, -56, shirt);
    } else {
      arm(sw * 16 * dir, -52, shirt);
      arm(-sw * 16 * dir, -54, shirt);
    }
    ctx.restore();
  }
  Crew.drawWorker = worker;

  Crew.prototype.drawPallets = function (ctx) {
    this.pallets.forEach(function (p) { pallet(ctx, p.x, p.y); });
  };

  Crew.prototype.draw = function (ctx, t) {
    var self = this, ST = CT.CargoManager.STATE, S = CT.Truck.S;
    this.teams.forEach(function (tm) {
      var it = tm.item;
      var holding = it && it.state === ST.CARRY && (tm.phase === 'pick' || tm.phase === 'carry' || tm.phase === 'lift' || tm.phase === 'take' || tm.phase === 'put');
      var pose = holding ? (tm.phase === 'lift' || tm.phase === 'take' ? 'lift' : 'carry')
        : (tm.phase === 'go' || tm.phase === 'back') ? 'walk'
        : (tm.phase === 'reach') ? 'lift'
        : (tm.phase === 'rest' && tm.waveT < 2.2) || (tm.phase === 'idle' && Math.sin(tm.waveT * 0.7) > 0.85) ? 'wave' : 'idle';
      var spread = holding ? HALF + 16 : 34;
      var cx = holding ? it.x : tm.x;
      var front = { x: cx + spread * tm.dir, y: FEET }, back = { x: cx - spread * tm.dir, y: FEET };
      if (tm.phase === 'lift' || tm.phase === 'take' || tm.phase === 'reach') { front.x = tm.x + spread * tm.dir; back.x = tm.x - spread * tm.dir; }
      var hy = holding ? it.y - 40 : FEET - 150;
      var hb = { x: (holding ? it.x : tm.x) - HALF * tm.dir, y: hy }, hf = { x: (holding ? it.x : tm.x) + HALF * tm.dir, y: hy };
      if (tm.phase === 'reach') { var s = self.slotWorld(tm); hb = { x: s.x - HALF, y: s.railY - 30 }; hf = { x: s.x + HALF, y: s.railY - 30 }; }
      var reachable = function (h, w) { var dy = Math.max(h.y, w.y - 150); return { x: D.clamp(h.x, w.x - 46, w.x + 46), y: dy }; };
      worker(ctx, back.x, back.y, tm.dir, tm.walk + 0.5, pose, tm.skin[0], tm.shirt[0], reachable(hb, back), t + tm.idx);
      if (holding) {
        ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot); ctx.scale(S, S);
        CT.CargoManager.drawBox(ctx, 0, 0, { type: it.type, variant: it.variant });
        ctx.restore();
      }
      worker(ctx, front.x, front.y, tm.dir, tm.walk, pose, tm.skin[1], tm.shirt[1], reachable(hf, front), t + tm.idx + 0.4);
    });
  };

  CT.Crew = Crew;
})(window.CT);
