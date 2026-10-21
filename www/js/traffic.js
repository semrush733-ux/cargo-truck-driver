/* traffic.js — two-lane traffic: cars with simple car-following AI, traffic lights, lane changes and truck collisions. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;

  var TYPES = [
    { id: 'sedan',  len: 210, h: 66,  w: 1.0,  weight: 4 },
    { id: 'hatch',  len: 172, h: 64,  w: 0.95, weight: 3 },
    { id: 'pickup', len: 228, h: 76,  w: 1.05, weight: 2 },
    { id: 'van',    len: 236, h: 104, w: 1.05, weight: 2 },
    { id: 'bus',    len: 470, h: 150, w: 1.25, weight: 1 }
  ];
  var COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ecf0f1', '#9b59b6', '#34495e', '#e67e22', '#1abc9c', '#c0392b'];

  function lightState(l, t) {
    var cyc = l.green + l.yellow + l.red;
    var u = ((t + l.offset) % cyc + cyc) % cyc;
    return u < l.green ? 'green' : u < l.green + l.yellow ? 'yellow' : 'red';
  }

  function Traffic(level, world) {
    this.level = level;
    this.world = world;
    this.cfg = level.traffic;
    this.lights = level.lights || [];
    this.cars = [];
    this.rnd = D.rng((level.seed || 1) * 977 + 3);
    this.nextId = 1;
  }
  Traffic.lightState = lightState;
  Traffic.TYPES = TYPES;

  Traffic.prototype.pickType = function () {
    var total = 0, i; for (i = 0; i < TYPES.length; i++) total += TYPES[i].weight;
    var r = this.rnd() * total;
    for (i = 0; i < TYPES.length; i++) { r -= TYPES[i].weight; if (r <= 0) return TYPES[i]; }
    return TYPES[0];
  };

  Traffic.prototype.makeCar = function (x, lane, v) {
    var t = this.pickType(), c = this.cfg;
    var vMax = c.speedMin + this.rnd() * (c.speedMax - c.speedMin);
    if (lane === 1) vMax += 40;                 // left lane is a bit faster
    if (t.id === 'bus') vMax *= 0.8;
    return { id: this.nextId++, type: t, x: x, lane: lane, v: v == null ? vMax * 0.8 : v, vMax: vMax, len: t.len,
      color: COLORS[Math.floor(this.rnd() * COLORS.length)], wheel: 0, braking: false, alpha: 1, exiting: false };
  };

  Traffic.prototype.spaceFree = function (x, lane, len, truck) {
    var ok = this.cars.every(function (c) { return c.lane !== lane || Math.abs(c.x - x) > (c.len + len) / 2 + 220; });
    if (ok && truck) {
      var tl = truck.laneIndex();
      if (tl === lane || tl === -1) ok = x - len / 2 > truck.x + CT.Truck.FRONT + 250 || x + len / 2 < truck.x + CT.Truck.REAR - 250;
    }
    return ok;
  };

  Traffic.prototype.init = function (truck) {
    if (!this.cfg) return;
    var n = this.cfg.density;
    for (var i = 0; i < n * 3 && this.cars.length < n; i++) {
      var x = truck.x + 1600 + this.rnd() * 4200;
      var lane = this.rnd() < 0.5 ? 0 : 1;
      if (x < this.cfg.exitX - 300 && this.spaceFree(x, lane, 260, truck)) this.cars.push(this.makeCar(x, lane));
    }
  };

  Traffic.prototype.front = function (c) { return c.x + c.len / 2; };
  Traffic.prototype.rear = function (c) { return c.x - c.len / 2; };

  Traffic.prototype.update = function (dt, truck, t) {
    if (!this.cfg) return;
    var self = this, cars = this.cars, exitX = this.cfg.exitX;
    var tLane = truck.laneIndex();
    var tFront = truck.x + CT.Truck.FRONT, tRear = truck.x + CT.Truck.REAR;

    cars.forEach(function (c) {
      var target = c.vMax, cf = c.x + c.len / 2;
      // leader in the same lane (car or truck)
      var gap = Infinity, leadV = 0;
      cars.forEach(function (o) {
        if (o === c || o.lane !== c.lane || o.x <= c.x) return;
        var g = o.x - o.len / 2 - cf;
        if (g < gap) { gap = g; leadV = o.v; }
      });
      if ((tLane === c.lane || tLane === -1) && tRear > c.x) {
        var g2 = tRear - cf;
        if (g2 < gap) { gap = g2; leadV = Math.max(0, truck.v); }
      }
      var safe = 80 + c.v * 0.85;
      if (gap < safe) target = Math.min(target, Math.max(0, leadV * D.clamp((gap - 40) / safe, 0, 1)));
      if (gap < 40) target = 0;
      // traffic lights
      self.lights.forEach(function (l) {
        var stop = l.x - 60, dist = stop - cf;
        if (dist < -10 || dist > 600) return;
        var s = lightState(l, t);
        if (s === 'green') return;
        var stopDist = c.v * c.v / (2 * 600);
        if (s === 'yellow' && stopDist > dist - 5) return;     // too close to stop: go through
        target = Math.min(target, Math.max(0, (dist - 10) * 1.6));
      });
      if (c.v < target) c.v = Math.min(target, c.v + 230 * dt);
      else c.v = Math.max(target, c.v - 720 * dt);
      c.braking = target < c.v - 5 || (c.v < 5 && target < 5);
      c.x += c.v * dt;
      c.wheel += c.v * dt / 22;
      if (c.x > exitX && !c.exiting) c.exiting = true;
      if (c.exiting) c.alpha = Math.max(0, c.alpha - dt * 1.5);
    });

    // recycle cars far behind / exited, keep density around the truck
    for (var i = cars.length - 1; i >= 0; i--) {
      if (cars[i].alpha <= 0 || cars[i].x < truck.x - 3000) cars.splice(i, 1);
    }
    var need = this.cfg.density - cars.length;
    for (var k = 0; k < need && k < 2; k++) {
      var x = truck.x + 2600 + this.rnd() * 1800;
      var lane = this.rnd() < 0.5 ? 0 : 1;
      if (x < exitX - 300 && this.spaceFree(x, lane, 260, truck)) cars.push(this.makeCar(x, lane));
    }
  };

  /** Can the truck move into `lane` right now? */
  Traffic.prototype.laneFree = function (truck, lane) {
    var tf = truck.x + CT.Truck.FRONT + 60, tr = truck.x + CT.Truck.REAR - 60;
    return this.cars.every(function (c) {
      if (c.lane !== lane) return true;
      var cf = c.x + c.len / 2, cr = c.x - c.len / 2;
      if (cf > tr && cr < tf) return false;
      if (cf <= tr && c.v > truck.v + 60 && tr - cf < 220) return false;   // fast car right behind
      return true;
    });
  };

  /** Pushes the truck out of any car it overlaps; returns crash events [{rel, car, front}]. */
  Traffic.prototype.resolveTruck = function (truck) {
    var events = [];
    var lanes = truck.lanesOccupied();
    this.cars.forEach(function (c) {
      if (lanes.indexOf(c.lane) < 0 || c.exiting) return;
      var tf = truck.x + CT.Truck.FRONT, tr = truck.x + CT.Truck.REAR;
      var cf = c.x + c.len / 2, cr = c.x - c.len / 2;
      if (!(tf > cr && tr < cf)) return;
      if (truck.x < c.x) {                              // hit the car in front
        var rel = truck.v - c.v;
        truck.x = cr - CT.Truck.FRONT - 1;
        if (rel > 0) { c.v += rel * 0.45; truck.v = c.v - rel * 0.25; }
        events.push({ rel: Math.max(0, rel), car: c, front: true });
      } else {                                          // reversed into a car behind
        var rel2 = c.v - truck.v;
        truck.x = cf - CT.Truck.REAR + 1;
        if (rel2 > 0) { truck.v = c.v + rel2 * 0.2; c.v = Math.max(0, c.v - rel2 * 0.6); }
        events.push({ rel: Math.max(0, rel2), car: c, front: false });
      }
    });
    return events;
  };

  // ------------------------------------------------------------- side-view drawing
  Traffic.prototype.drawSide = function (ctx, view, lane, night) {
    var H = this.world.heightAt, half = view.W / 2 / view.scale + 600;
    this.cars.forEach(function (c) {
      if (c.lane !== lane || Math.abs(c.x - view.camX) > half) return;
      var y = H(c.x) + CT.World.LANE_Y[lane];
      var slope = Math.atan2(H(c.x + 60) - H(c.x - 60), 120);
      ctx.save(); ctx.globalAlpha = c.alpha;
      ctx.translate(c.x, y); ctx.rotate(slope);
      if (c.exiting) ctx.translate(0, -(1 - c.alpha) * 30);
      drawCarSide(ctx, c, night);
      ctx.restore();
    });
  };

  function drawCarSide(ctx, c, night) {
    var L = c.len, h = c.type.h, id = c.type.id, col = c.color;
    var r = id === 'bus' ? 26 : 21;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 2, L * 0.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.fillStyle = col;
    if (id === 'sedan' || id === 'hatch') {
      ctx.beginPath();
      ctx.moveTo(-L / 2 + 6, -12); ctx.lineTo(-L / 2, -36); ctx.quadraticCurveTo(-L / 2, -44, -L / 2 + 10, -44);
      ctx.lineTo(-L * 0.3, -46); ctx.lineTo(-L * 0.18, -h); ctx.lineTo(L * 0.12, -h); ctx.lineTo(L * 0.28, -46);
      ctx.lineTo(L / 2 - 8, -40); ctx.quadraticCurveTo(L / 2, -36, L / 2, -26); ctx.lineTo(L / 2 - 4, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9fd6f7';
      ctx.beginPath(); ctx.moveTo(-L * 0.26, -48); ctx.lineTo(-L * 0.165, -h + 6); ctx.lineTo(-L * 0.03, -h + 6); ctx.lineTo(-L * 0.03, -48); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L * 0.0, -48); ctx.lineTo(L * 0.0, -h + 6); ctx.lineTo(L * 0.1, -h + 6); ctx.lineTo(L * 0.23, -48); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (id === 'pickup') {
      ctx.beginPath();
      ctx.moveTo(-L / 2, -12); ctx.lineTo(-L / 2, -46); ctx.lineTo(-L * 0.05, -46); ctx.lineTo(-L * 0.02, -h); ctx.lineTo(L * 0.2, -h);
      ctx.lineTo(L * 0.3, -50); ctx.lineTo(L / 2 - 6, -46); ctx.quadraticCurveTo(L / 2, -40, L / 2, -28); ctx.lineTo(L / 2 - 4, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9fd6f7'; ctx.beginPath(); ctx.moveTo(L * 0.04, -50); ctx.lineTo(L * 0.06, -h + 7); ctx.lineTo(L * 0.18, -h + 7); ctx.lineTo(L * 0.26, -50); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.moveTo(-L / 2 + 6, -40); ctx.lineTo(-L * 0.08, -40); ctx.stroke();
    } else if (id === 'van') {
      ctx.beginPath();
      ctx.moveTo(-L / 2, -12); ctx.lineTo(-L / 2, -h + 8); ctx.quadraticCurveTo(-L / 2, -h, -L / 2 + 10, -h);
      ctx.lineTo(L * 0.22, -h); ctx.lineTo(L / 2 - 4, -52); ctx.lineTo(L / 2, -26); ctx.lineTo(L / 2 - 4, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9fd6f7'; ctx.beginPath(); ctx.moveTo(L * 0.12, -h + 10); ctx.lineTo(L * 0.22, -h + 10); ctx.lineTo(L * 0.44, -56); ctx.lineTo(L * 0.12, -56); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-L / 2 + 14, -h + 26, L * 0.5, 16);
    } else {   // bus
      D.rr(ctx, -L / 2, -h, L, h - 12, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9fd6f7';
      for (var wx = -L / 2 + 20; wx < L / 2 - 60; wx += 62) { D.rr(ctx, wx, -h + 18, 50, 46, 6); ctx.fill(); ctx.stroke(); }
      D.rr(ctx, L / 2 - 50, -h + 14, 40, 70, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-L / 2 + 10, -50, L - 20, 8);
    }
    // lights
    var front = L / 2 - 6, back = -L / 2 + 2;
    D.box(ctx, front - 6, -36, 10, 10, 3, night ? '#fffbe0' : '#fff2a8', INK, 2);
    D.box(ctx, back - 2, -38, 8, 12, 3, c.braking ? '#ff3b2f' : '#b3261e', INK, 2);
    if (c.braking) {
      var g = ctx.createRadialGradient(back, -32, 2, back, -32, 40);
      g.addColorStop(0, 'rgba(255,60,40,.6)'); g.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(back, -32, 40, 0, Math.PI * 2); ctx.fill();
    }
    if (night) {
      var hg = ctx.createLinearGradient(front, 0, front + 260, 0);
      hg.addColorStop(0, 'rgba(255,240,180,.45)'); hg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(front, -34); ctx.lineTo(front + 260, -60); ctx.lineTo(front + 260, 6); ctx.closePath(); ctx.fill();
    }
    // wheels
    var wxs = id === 'bus' ? [-L * 0.33, L * 0.3] : [-L * 0.3, L * 0.3];
    wxs.forEach(function (wx) {
      D.circle(ctx, wx, -r, r, '#22252c', INK, 3);
      D.circle(ctx, wx, -r, r * 0.5, '#b9bec8');
      ctx.save(); ctx.translate(wx, -r); ctx.rotate(c.wheel);
      ctx.fillStyle = '#5a5f69'; ctx.fillRect(-1.5, -r * 0.5, 3, r);
      ctx.restore();
    });
  }

  // ------------------------------------------------------------- back view (for chase / cab cameras)
  /** Draws a car seen from behind, bottom-centre at (x, y), w = pixel width. */
  Traffic.drawCarBack = function (ctx, c, x, y, w, night) {
    var id = c.type.id, col = c.color;
    var h = id === 'bus' ? w * 1.15 : id === 'van' ? w * 0.92 : id === 'pickup' ? w * 0.7 : w * 0.62;
    var lw = Math.max(1, w * 0.025);
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.55, w * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    // tyres
    D.box(ctx, x - w * 0.46, y - w * 0.17, w * 0.16, w * 0.17, w * 0.03, '#1d1f25');
    D.box(ctx, x + w * 0.30, y - w * 0.17, w * 0.16, w * 0.17, w * 0.03, '#1d1f25');
    ctx.fillStyle = col;
    if (id === 'sedan' || id === 'hatch' || id === 'pickup') {
      var bodyH = h * 0.55;
      D.rr(ctx, x - w / 2, y - w * 0.08 - bodyH, w, bodyH, w * 0.08); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - w * 0.42, y - w * 0.08 - bodyH + 2); ctx.lineTo(x - w * 0.32, y - h - w * 0.06); ctx.lineTo(x + w * 0.32, y - h - w * 0.06); ctx.lineTo(x + w * 0.42, y - w * 0.08 - bodyH + 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = id === 'pickup' ? '#2b303b' : '#6fb4e8';
      ctx.beginPath();
      ctx.moveTo(x - w * 0.34, y - w * 0.08 - bodyH - w * 0.02); ctx.lineTo(x - w * 0.27, y - h - w * 0.02); ctx.lineTo(x + w * 0.27, y - h - w * 0.02); ctx.lineTo(x + w * 0.34, y - w * 0.08 - bodyH - w * 0.02); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      D.rr(ctx, x - w / 2, y - w * 0.08 - h, w, h, w * 0.06); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6fb4e8'; D.rr(ctx, x - w * 0.38, y - h - w * 0.02, w * 0.76, h * (id === 'bus' ? 0.3 : 0.32), w * 0.03); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(x, y - w * 0.1); ctx.lineTo(x, y - h * 0.62); ctx.stroke();
    }
    // tail lights, plate, bumper
    var ty = y - w * 0.08 - h * (id === 'bus' || id === 'van' ? 0.35 : 0.42);
    var lc = c.braking ? '#ff3b2f' : '#b3261e';
    D.box(ctx, x - w * 0.47, ty, w * 0.16, w * 0.09, w * 0.02, lc, INK, lw);
    D.box(ctx, x + w * 0.31, ty, w * 0.16, w * 0.09, w * 0.02, lc, INK, lw);
    if (c.braking || night) {
      ctx.globalAlpha = c.braking ? 0.6 : 0.35;
      [x - w * 0.39, x + w * 0.39].forEach(function (lx) {
        var g = ctx.createRadialGradient(lx, ty + w * 0.045, 1, lx, ty + w * 0.045, w * 0.3);
        g.addColorStop(0, 'rgba(255,60,40,.9)'); g.addColorStop(1, 'rgba(255,60,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ty + w * 0.045, w * 0.3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    D.box(ctx, x - w * 0.13, y - w * 0.2, w * 0.26, w * 0.08, w * 0.015, '#f2f2f2', INK, lw * 0.7);
    D.box(ctx, x - w * 0.5, y - w * 0.11, w, w * 0.06, w * 0.02, '#2b303b');
  };

  CT.Traffic = Traffic;
})(window.CT);
