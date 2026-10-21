/* crane.js — gantry crane used at the depot (loading) and the hub (unloading). Runs one pick-and-place job at a time. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;

  function Crane(cfg) {
    this.towerX = cfg.towerX;
    this.boomLeft = cfg.boomLeft;
    this.boomRight = cfg.boomRight;
    this.boomY = cfg.boomY;
    this.restX = cfg.restX;
    this.restHook = this.boomY + 90;
    this.tx = this.restX;
    this.hookY = this.restHook;
    this.tv = 0;
    this.job = null;
    this.carry = null;
    this.swing = 0; this.swingV = 0;
    this.onSound = null;
  }

  Crane.prototype.busy = function () { return !!this.job; };

  /** from()/to() return {x, y} = world bottom-centre where the box rests. */
  Crane.prototype.start = function (job) {
    if (this.job) return false;
    job.phase = 'toPick';
    this.job = job;
    return true;
  };

  Crane.prototype.reset = function () {
    this.job = null; this.carry = null; this.tx = this.restX; this.hookY = this.restHook; this.swing = this.swingV = 0;
  };

  function step(cur, target, dt, max, gain) {
    var d = target - cur;
    var sp = Math.min(max, Math.abs(d) * gain + 40);
    var mv = sp * dt;
    if (Math.abs(d) <= mv) return { v: target, done: true, speed: 0 };
    return { v: cur + Math.sign(d) * mv, done: false, speed: Math.sign(d) * sp };
  }

  Crane.prototype.update = function (dt) {
    var BOX_H = CT.CargoManager.BOX_H * CT.Truck.S;
    var j = this.job, r;
    var prevTx = this.tx;
    if (!j) {
      this.tx = step(this.tx, this.restX, dt, 600, 3).v;
      this.hookY = step(this.hookY, this.restHook, dt, 500, 4).v;
    } else {
      var from = j.from(), to = j.to();
      var liftY = Math.min(from.y, to.y) - BOX_H - 90;   // carry height clears truck and dock
      switch (j.phase) {
        case 'toPick':
          r = step(this.tx, from.x, dt, 2200, 6); this.tx = r.v;
          var h = step(this.hookY, liftY, dt, 1500, 7); this.hookY = h.v;
          if (r.done && h.done) j.phase = 'lower';
          break;
        case 'lower':
          r = step(this.hookY, from.y - BOX_H, dt, 1600, 8); this.hookY = r.v;
          if (r.done) {
            this.carry = j.item; if (j.onAttach) j.onAttach(j.item);
            if (this.onSound) this.onSound('hook');
            j.phase = 'raise';
          }
          break;
        case 'raise':
          r = step(this.hookY, liftY, dt, 1500, 7); this.hookY = r.v;
          if (r.done) { j.phase = 'move'; if (this.onSound) this.onSound('whir'); }
          break;
        case 'move':
          r = step(this.tx, to.x, dt, 2000, 5.5); this.tx = r.v;
          if (r.done) j.phase = 'drop';
          break;
        case 'drop':
          this.tx = to.x;
          r = step(this.hookY, to.y - BOX_H, dt, 1400, 7); this.hookY = r.v;
          if (r.done) {
            var it = this.carry; this.carry = null;
            if (j.onRelease) j.onRelease(it);
            j.phase = 'up';
          }
          break;
        case 'up':
          r = step(this.hookY, liftY, dt, 1800, 9); this.hookY = r.v;
          if (r.done) { var done = j.onDone; this.job = null; if (done) done(); }
          break;
      }
    }
    // pendulum swing from trolley motion
    var tvel = dt > 0 ? (this.tx - prevTx) / dt : 0;
    var acc = dt > 0 ? (tvel - this.tv) / dt : 0;
    this.tv = tvel;
    this.swingV += (-this.swing * 40 - this.swingV * 5 - acc * 0.00012) * dt;
    this.swing = D.clamp(this.swing + this.swingV * dt, -0.12, 0.12);
    if (this.carry) {
      this.carry.x = this.tx + Math.sin(this.swing) * (this.hookY - this.boomY) * 0.25;
      this.carry.y = this.hookY + BOX_H;
      this.carry.rot = this.swing * 0.5;
    }
  };

  function lattice(ctx, x, y, w, h, vertical) {
    ctx.strokeStyle = '#b07d00'; ctx.lineWidth = 3;
    ctx.beginPath();
    if (vertical) {
      for (var yy = y; yy < y + h - 1; yy += w) { ctx.moveTo(x, yy); ctx.lineTo(x + w, Math.min(y + h, yy + w)); ctx.moveTo(x + w, yy); ctx.lineTo(x, Math.min(y + h, yy + w)); }
    } else {
      for (var xx = x; xx < x + w - 1; xx += h) { ctx.moveTo(xx, y + h); ctx.lineTo(Math.min(x + w, xx + h / 2), y); ctx.lineTo(Math.min(x + w, xx + h), y + h); }
    }
    ctx.stroke();
  }

  /** Static structure (drawn behind the road layer). */
  Crane.prototype.drawStructure = function (ctx) {
    var tx = this.towerX, by = this.boomY, top = by - 70, groundY = -44;
    ctx.lineJoin = 'round';
    // mast
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(tx - 18, groundY - 4, 64, 8);
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.fillStyle = '#ffc21a';
    ctx.fillRect(tx - 20, top, 6, groundY - top); ctx.strokeRect(tx - 20, top, 6, groundY - top);
    ctx.fillRect(tx + 14, top, 6, groundY - top); ctx.strokeRect(tx + 14, top, 6, groundY - top);
    lattice(ctx, tx - 14, by + 34, 28, groundY - by - 34, true);
    // base footing
    D.box(ctx, tx - 34, groundY - 14, 68, 18, 4, '#9aa0aa', INK, 3);
    // A-frame peak + ties
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx, top - 40); ctx.lineTo(this.boomLeft + 10, by); ctx.moveTo(tx, top - 40); ctx.lineTo(this.boomRight - 10, by); ctx.stroke();
    ctx.fillStyle = '#ffc21a';
    ctx.beginPath(); ctx.moveTo(tx - 20, by); ctx.lineTo(tx, top - 44); ctx.lineTo(tx + 20, by); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 4; ctx.stroke();
    // boom
    var bw = this.boomRight - this.boomLeft;
    ctx.fillStyle = '#ffc21a';
    ctx.fillRect(this.boomLeft, by - 3, bw, 7); ctx.strokeRect(this.boomLeft, by - 3, bw, 7);
    ctx.fillRect(this.boomLeft, by + 24, bw, 7); ctx.strokeRect(this.boomLeft, by + 24, bw, 7);
    lattice(ctx, this.boomLeft, by + 4, bw, 20, false);
    // counterweight
    D.box(ctx, this.boomLeft - 6, by - 6, 64, 54, 5, '#8c939e', INK, 4);
    ctx.fillStyle = '#ffc21a';
    for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(this.boomLeft + i * 16, by + 48); ctx.lineTo(this.boomLeft + i * 16 + 8, by + 48); ctx.lineTo(this.boomLeft + i * 16 + 18, by + 38); ctx.lineTo(this.boomLeft + i * 16 + 10, by + 38); ctx.fill(); }
    // operator cab
    D.box(ctx, tx + 18, by + 34, 50, 44, 6, '#ffc21a', INK, 4);
    D.box(ctx, tx + 34, by + 42, 28, 22, 4, '#8fd0ff', INK, 3);
  };

  /** Moving parts: trolley, cable, hook (drawn behind the truck so loaded boxes sink into the bed correctly). */
  Crane.prototype.drawRig = function (ctx) {
    var by = this.boomY, tx = this.tx;
    D.box(ctx, tx - 22, by + 26, 44, 18, 4, '#2b2f38', INK, 3);
    D.circle(ctx, tx - 12, by + 26, 5, '#555', INK, 2);
    D.circle(ctx, tx + 12, by + 26, 5, '#555', INK, 2);
    var hx = tx + Math.sin(this.swing) * (this.hookY - by) * 0.25;
    var hy = this.hookY;
    ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(tx - 5, by + 44); ctx.lineTo(hx - 5, hy - 26); ctx.moveTo(tx + 5, by + 44); ctx.lineTo(hx + 5, hy - 26); ctx.stroke();
    // hook block
    D.box(ctx, hx - 14, hy - 30, 28, 18, 4, '#ffc21a', INK, 3);
    ctx.save(); D.rr(ctx, hx - 14, hy - 30, 28, 18, 4); ctx.clip();
    ctx.fillStyle = INK; for (var i = -2; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx - 14 + i * 10, hy - 12); ctx.lineTo(hx - 8 + i * 10, hy - 30); ctx.lineTo(hx - 3 + i * 10, hy - 30); ctx.lineTo(hx - 9 + i * 10, hy - 12); ctx.fill(); }
    ctx.restore();
    if (this.carry) {
      var halfW = CT.CargoManager.BOX_W * CT.Truck.S * 0.42;
      ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, hy - 12); ctx.lineTo(hx - halfW, hy + 1); ctx.moveTo(hx, hy - 12); ctx.lineTo(hx + halfW, hy + 1); ctx.stroke();
    } else {
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy - 12); ctx.lineTo(hx, hy - 4); ctx.arc(hx - 5, hy - 4, 5, 0, Math.PI * 0.9); ctx.stroke();
    }
  };

  CT.Crane = Crane;
})(window.CT);
