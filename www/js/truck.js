/* truck.js — the flatbed cargo truck: driving physics (1D along the road) and Canvas artwork.
   Artwork is drawn in "art units" (a 1680 x 945 design grid) and scaled into the world by Truck.S. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;

  var S = 1 / 3;                   // art units -> world units
  var OX = 840, OY = 823;          // art-space anchor: truck centre at ground level
  var WHEELS = [248, 523, 1260];   // wheel centres (art x)
  var WHEEL_Y = 707, WHEEL_R = 116;
  var BED_TOP = 410;               // cargo rests on this art y
  var SLOTS = [842, 532, 223];     // cargo slot centres (art x), loaded front first

  var DEFAULTS = {
    maxSpeed: 360,      // world units / s
    accel: 300,
    brake: 760,
    reverseMax: 150,
    reverseAccel: 210,
    rolling: 46,
    drag: 0.12,
    weightFactor: 0.07, // each unit of cargo weight slows acceleration a little
    gravity: 900
  };

  function Truck(cfg) {
    this.cfg = Object.assign({}, DEFAULTS, cfg || {});
    this.x = 0; this.v = 0; this.y = 0; this.slope = 0;
    this.throttle = 0; this.revThrottle = 0; this.braking = false;
    this.accelSm = 0;
    this.pitch = 0; this.pitchV = 0; this.bounce = 0; this.bounceV = 0;
    this.wheelAngle = 0; this.distance = 0;
    this.minX = -Infinity; this.maxX = Infinity;
    this.cargoWeight = 0;
    this.onImpact = null;
    this.brakeLight = 0;
  }

  Truck.S = S;
  Truck.SLOTS = SLOTS;
  Truck.BED_TOP = BED_TOP;
  Truck.LENGTH = (1650 - 30) * S;
  Truck.REAR = (30 - OX) * S;
  Truck.FRONT = (1650 - OX) * S;
  Truck.WHEEL_R = WHEEL_R * S;

  Truck.prototype.place = function (x, terrain) {
    this.x = x; this.v = 0; this.throttle = this.revThrottle = 0;
    this.accelSm = 0; this.pitch = this.pitchV = this.bounce = this.bounceV = 0;
    this.followTerrain(terrain);
  };

  Truck.prototype.followTerrain = function (terrain) {
    var xr = this.x + ((WHEELS[0] + WHEELS[1]) / 2 - OX) * S;
    var xf = this.x + (WHEELS[2] - OX) * S;
    var yr = terrain ? terrain(xr) : 0, yf = terrain ? terrain(xf) : 0;
    this.slope = Math.atan2(yf - yr, xf - xr);
    this.y = yr + (yf - yr) * ((this.x - xr) / (xf - xr));
  };

  /**
   * input: {gas, brake, reverse}; drive=false holds the truck still (parking brake).
   */
  Truck.prototype.update = function (dt, input, terrain, drive) {
    var c = this.cfg;
    var wantGas = drive && input.gas && !input.brake;
    var wantRev = drive && input.reverse && !input.brake && !input.gas;
    var wantBrake = drive ? input.brake : true;
    var k = Math.min(1, dt * 7);
    this.throttle += ((wantGas ? 1 : 0) - this.throttle) * k;
    this.revThrottle += ((wantRev ? 1 : 0) - this.revThrottle) * k;
    this.braking = wantBrake && Math.abs(this.v) > 1;

    var mass = 1 + this.cargoWeight * c.weightFactor;
    var v0 = this.v, v = this.v, a = 0, decel = 0;

    if (wantBrake) decel += c.brake;
    if (this.throttle > 0.01) {
      if (v < -2) decel += c.brake * 0.85 * this.throttle;           // gas while rolling back = brake first
      else a += (c.accel / mass) * this.throttle * Math.max(0, 1 - Math.pow(Math.max(0, v) / c.maxSpeed, 2));
    }
    if (this.revThrottle > 0.01) {
      if (v > 2) decel += c.brake * 0.85 * this.revThrottle;          // reverse while rolling forward = brake first
      else a -= (c.reverseAccel / mass) * this.revThrottle * Math.max(0, 1 - Math.pow(Math.max(0, -v) / c.reverseMax, 2));
    }
    decel += c.rolling + Math.abs(v) * c.drag;
    a -= c.gravity * Math.sin(this.slope);

    v += a * dt;
    var dv = decel * dt;
    if (v > 0) v = Math.max(0, v - dv); else if (v < 0) v = Math.min(0, v + dv);
    if (Math.abs(v) < 0.5 && this.throttle < 0.05 && this.revThrottle < 0.05) v = 0;

    var oldX = this.x;
    this.x += v * dt;

    // soft walls at both road ends: bounce back gently, never fail the player
    if (this.x > this.maxX) {
      this.x = this.maxX;
      if (v > 0) { if (this.onImpact) this.onImpact(v, 1); v = -v * 0.18; }
    } else if (this.x < this.minX) {
      this.x = this.minX;
      if (v < 0) { if (this.onImpact) this.onImpact(-v, -1); v = -v * 0.18; }
    }
    this.v = v;

    var moved = this.x - oldX;
    this.distance += Math.abs(moved);
    this.wheelAngle += moved / (WHEEL_R * S);
    this.followTerrain(terrain);

    // longitudinal acceleration (for body pitch + cargo inertia)
    var acc = dt > 0 ? (v - v0) / dt : 0;
    this.accelSm += (acc - this.accelSm) * Math.min(1, dt * 10);

    // suspension springs
    var targetPitch = D.clamp(-this.accelSm * 0.00007, -0.03, 0.03);
    this.pitchV += ((targetPitch - this.pitch) * 120 - this.pitchV * 10) * dt;
    this.pitch += this.pitchV * dt;
    var sr = Math.min(1, Math.abs(v) / c.maxSpeed);
    var road = Math.sin(this.distance * 0.045) * 0.9 * sr + Math.sin(this.distance * 0.13) * 0.5 * sr;
    this.bounceV += ((road - this.bounce) * 160 - this.bounceV * 12) * dt;
    this.bounce += this.bounceV * dt;

    this.brakeLight += ((this.braking ? 1 : 0) - this.brakeLight) * Math.min(1, dt * 12);
  };

  Truck.prototype.jolt = function (strength) {
    this.pitchV += strength * 0.004;
    this.bounceV -= strength * 0.25;
  };

  Truck.prototype.speedRatio = function () { return Math.min(1, Math.abs(this.v) / this.cfg.maxSpeed); };

  /** Art-space point -> world point (includes body pitch + bounce). */
  Truck.prototype.artToWorld = function (ax, ay) {
    var ang = this.slope + this.pitch;
    var lx = (ax - OX) * S, ly = (ay - OY) * S;
    var cs = Math.cos(ang), sn = Math.sin(ang);
    return { x: this.x + lx * cs - ly * sn, y: this.y + this.bounce + lx * sn + ly * cs };
  };

  Truck.prototype.slotWorld = function (i) { return this.artToWorld(SLOTS[i], BED_TOP); };

  // ------------------------------------------------------------------ drawing
  function wheel(ctx, cx, cy, ang) {
    D.circle(ctx, cx, cy, WHEEL_R, '#1f1f24', INK, 6);
    // tread blocks
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = '#2f2f37';
    for (var i = 0; i < 22; i++) {
      ctx.rotate(Math.PI * 2 / 22);
      ctx.fillRect(-7, -WHEEL_R + 4, 14, 12);
    }
    ctx.restore();
    D.circle(ctx, cx, cy, 96, '#2a2a31');
    ctx.beginPath(); ctx.arc(cx, cy, 104, Math.PI * 1.1, Math.PI * 1.5); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 6; ctx.stroke();
    var g = ctx.createRadialGradient(cx - 18, cy - 22, 8, cx, cy, 74);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#d9dce2'); g.addColorStop(1, '#9ea3ad');
    D.circle(ctx, cx, cy, 72, g, '#4b4e57', 5);
    D.circle(ctx, cx, cy, 54, null, '#8d929c', 4);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    for (var j = 0; j < 10; j++) {
      var a = j * Math.PI / 5;
      D.circle(ctx, Math.cos(a) * 62, Math.sin(a) * 62, 7, '#2b2b30');
    }
    for (var n = 0; n < 6; n++) {
      var b = n * Math.PI / 3;
      D.circle(ctx, Math.cos(b) * 38, Math.sin(b) * 38, 5, '#5a5e67');
    }
    ctx.restore();
    D.circle(ctx, cx, cy, 27, '#1f1f24', '#3a3a42', 3);
    D.circle(ctx, cx - 6, cy - 7, 8, '#55565e');
  }

  function bodyBack(ctx, t) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // chassis rail + under-cab frame
    D.box(ctx, 88, 572, 1050, 44, 8, '#1b1b20');
    D.box(ctx, 1108, 560, 70, 140, 10, '#1d1d22');
    // rear wheel liner (dark well behind the tyres)
    ctx.fillStyle = '#121216';
    ctx.beginPath(); ctx.arc(248, 707, 132, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(523, 707, 132, Math.PI, 0); ctx.fill();
    // front wheel arch liner
    ctx.beginPath(); ctx.arc(1260, 707, 146, Math.PI, 0); ctx.fill();
    // side box / fuel tank + step
    D.box(ctx, 705, 603, 346, 90, 12, '#26262c', INK, 5);
    ctx.fillStyle = '#3a3a43'; ctx.fillRect(712, 610, 332, 12);
    D.box(ctx, 878, 603, 16, 90, 3, '#3d3d46');
    D.box(ctx, 688, 692, 390, 22, 9, '#4b4b54', INK, 5);
    // rear bumper + tail light
    D.box(ctx, 38, 598, 66, 96, 9, '#232328', INK, 5);
    var tl = t.brakeLight;
    D.box(ctx, 44, 606, 24, 48, 6, tl > 0.05 ? 'rgb(255,' + Math.round(70 - tl * 40) + ',' + Math.round(55 - tl * 30) + ')' : '#d8352d', INK, 3);
    D.box(ctx, 48, 610, 8, 18, 3, 'rgba(255,190,180,.8)');
    if (tl > 0.05) {
      var gl = ctx.createRadialGradient(56, 630, 4, 56, 630, 90);
      gl.addColorStop(0, 'rgba(255,60,40,' + (0.55 * tl) + ')'); gl.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(56, 630, 90, 0, Math.PI * 2); ctx.fill();
    }
  }

  function fenders(ctx) {
    // tandem fenders: a thick arc over each rear tyre, outlined
    [248, 523].forEach(function (cx) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = INK; ctx.lineWidth = 34;
      ctx.beginPath(); ctx.arc(cx, 707, 137, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
      ctx.strokeStyle = '#2c2c34'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.arc(cx, 707, 137, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, 707, 143, Math.PI * 1.2, Math.PI * 1.6); ctx.stroke();
    });
    ctx.lineCap = 'round';
    // marker lights
    D.box(ctx, 98, 583, 26, 13, 5, '#ff9a1f', INK, 3);
    D.box(ctx, 648, 583, 26, 13, 5, '#ff9a1f', INK, 3);
    D.box(ctx, 994, 583, 26, 13, 5, '#ff9a1f', INK, 3);
  }

  function headboard(ctx) {
    D.box(ctx, 1082, 210, 46, 372, 10, '#202026', INK, 5);
    D.box(ctx, 1034, 138, 50, 446, 16, '#2263c9', INK, 6);
    ctx.fillStyle = '#4d8ff0'; D.rr(ctx, 1043, 150, 12, 420, 6); ctx.fill();
    ctx.fillStyle = '#1a4ea3'; ctx.fillRect(1070, 160, 6, 410);
  }

  function bed(ctx) {
    // main side panel
    D.box(ctx, 30, 406, 1014, 174, 10, '#2668d2', INK, 6);
    ctx.fillStyle = '#4a8cf0'; ctx.fillRect(36, 412, 1002, 18);
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(33, 432); ctx.lineTo(1041, 432); ctx.stroke();
    // inner frame + slats
    ctx.strokeStyle = '#174a9e'; ctx.lineWidth = 5;
    D.rr(ctx, 56, 444, 962, 116, 6); ctx.stroke();
    ctx.lineWidth = 4;
    [482, 520].forEach(function (y) {
      ctx.strokeStyle = '#1a55b0'; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(1014, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,175,255,.55)'; ctx.beginPath(); ctx.moveTo(60, y + 4); ctx.lineTo(1014, y + 4); ctx.stroke();
    });
    // vertical posts
    [62, 368, 678, 980].forEach(function (x) {
      D.box(ctx, x, 438, 26, 128, 5, '#2f74de', '#174a9e', 4);
      ctx.fillStyle = 'rgba(140,190,255,.6)'; ctx.fillRect(x + 5, 444, 5, 116);
    });
    // lower lip
    ctx.fillStyle = '#1d58b8'; ctx.fillRect(36, 562, 1002, 14);
    // tie-down hooks
    [75, 380, 690, 992].forEach(function (x) { D.box(ctx, x - 9, 552, 22, 18, 4, '#1d1d22'); });
  }

  function cab(ctx) {
    ctx.lineJoin = 'round';
    // cab shell
    ctx.beginPath();
    ctx.moveTo(1120, 585);
    ctx.lineTo(1120, 215);
    ctx.quadraticCurveTo(1120, 160, 1176, 160);
    ctx.lineTo(1414, 160);
    ctx.quadraticCurveTo(1452, 160, 1478, 196);
    ctx.lineTo(1598, 392);
    ctx.quadraticCurveTo(1626, 432, 1626, 472);
    ctx.lineTo(1626, 606);
    ctx.lineTo(1550, 606);
    ctx.lineTo(1550, 700);
    ctx.lineTo(1412, 700);
    ctx.arc(1260, 707, 152, Math.PI * 2 - 0.05, Math.PI + 0.43, true);
    ctx.lineTo(1120, 645);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, 160, 0, 700);
    g.addColorStop(0, '#ffa63a'); g.addColorStop(0.45, '#f7901e'); g.addColorStop(1, '#e27a0c');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();

    // roof highlight
    ctx.strokeStyle = 'rgba(255,214,150,.75)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(1140, 230); ctx.quadraticCurveTo(1140, 180, 1185, 178); ctx.lineTo(1405, 178); ctx.stroke();

    // door
    ctx.beginPath();
    ctx.moveTo(1172, 548);
    ctx.lineTo(1172, 230); ctx.quadraticCurveTo(1172, 200, 1202, 200);
    ctx.lineTo(1438, 200); ctx.quadraticCurveTo(1456, 200, 1463, 216);
    ctx.lineTo(1540, 418);
    ctx.lineTo(1540, 540); ctx.quadraticCurveTo(1540, 560, 1520, 560);
    ctx.lineTo(1186, 560); ctx.quadraticCurveTo(1172, 560, 1172, 548);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(160,80,0,.55)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();

    // side window
    ctx.beginPath();
    ctx.moveTo(1208, 232); ctx.quadraticCurveTo(1208, 218, 1222, 218);
    ctx.lineTo(1428, 218);
    ctx.lineTo(1504, 432); ctx.quadraticCurveTo(1506, 444, 1494, 442);
    ctx.lineTo(1222, 376); ctx.quadraticCurveTo(1208, 372, 1208, 358);
    ctx.closePath();
    var wg = ctx.createLinearGradient(1208, 218, 1460, 440);
    wg.addColorStop(0, '#8fd0ff'); wg.addColorStop(1, '#4a97e6');
    ctx.fillStyle = wg; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath(); ctx.moveTo(1300, 218); ctx.lineTo(1360, 218); ctx.lineTo(1250, 440); ctx.lineTo(1190, 440); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(1385, 218); ctx.lineTo(1405, 218); ctx.lineTo(1300, 440); ctx.lineTo(1280, 440); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();

    // windscreen sliver
    ctx.beginPath();
    ctx.moveTo(1484, 210); ctx.lineTo(1594, 392); ctx.quadraticCurveTo(1600, 410, 1588, 410);
    ctx.lineTo(1556, 404); ctx.closePath();
    ctx.fillStyle = '#5fb0f2'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();

    // handle
    D.box(ctx, 1188, 442, 78, 34, 13, '#1d1d22');
    D.box(ctx, 1200, 450, 52, 9, 4, '#4a4a54');
    // mirror arm + mirrors
    ctx.strokeStyle = INK; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(1500, 310); ctx.lineTo(1528, 345); ctx.moveTo(1498, 400); ctx.lineTo(1528, 370); ctx.stroke();
    D.box(ctx, 1448, 284, 54, 84, 14, '#1d1d22', INK, 4);
    D.box(ctx, 1456, 292, 14, 50, 5, '#3c3c46');
    D.box(ctx, 1450, 374, 50, 54, 12, '#1d1d22', INK, 4);
    // headlight
    ctx.beginPath();
    ctx.moveTo(1558, 526); ctx.quadraticCurveTo(1558, 516, 1568, 516);
    ctx.lineTo(1612, 516); ctx.quadraticCurveTo(1626, 518, 1626, 536);
    ctx.lineTo(1626, 600); ctx.lineTo(1568, 600); ctx.quadraticCurveTo(1558, 600, 1558, 590); ctx.closePath();
    var hg = ctx.createLinearGradient(1558, 516, 1626, 600);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#d5e3f3');
    ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
    // amber side marker
    D.box(ctx, 1478, 562, 52, 25, 11, '#ffad2a', INK, 4);
    // bumper, step, front indicator
    D.box(ctx, 1544, 606, 106, 102, 16, '#232328', INK, 6);
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(1552, 616, 90, 10);
    D.box(ctx, 1584, 646, 42, 30, 7, '#ffae2a', INK, 3);
    D.box(ctx, 1404, 682, 146, 24, 8, '#232328', INK, 5);
    // black arch trim over front wheel
    ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(1260, 707, 158, Math.PI * 1.06, Math.PI * 1.97); ctx.stroke();
  }

  function exhaustCap(ctx) {
    D.box(ctx, 1036, 132, 46, 14, 6, '#1a4ea3', INK, 4);
  }

  /**
   * hooks.behindBed(ctx) / hooks.overBed(ctx) draw the cargo + straps in art space.
   */
  Truck.prototype.draw = function (ctx, hooks) {
    // ground shadow
    ctx.save();
    ctx.fillStyle = 'rgba(20,30,20,.28)';
    ctx.beginPath(); ctx.ellipse(this.x + 10, this.y + 3, Truck.LENGTH * 0.52, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.slope);
    ctx.scale(S, S);
    ctx.translate(-OX, -OY);

    // body (pitch + bounce applied around truck centre)
    ctx.save();
    ctx.translate(OX, OY + this.bounce / S); ctx.rotate(this.pitch); ctx.translate(-OX, -OY);
    bodyBack(ctx, this);
    ctx.restore();

    // wheels stay on the ground
    var self = this;
    WHEELS.forEach(function (wx) { wheel(ctx, wx, WHEEL_Y, self.wheelAngle); });

    ctx.save();
    ctx.translate(OX, OY + this.bounce / S); ctx.rotate(this.pitch); ctx.translate(-OX, -OY);
    fenders(ctx);
    headboard(ctx);
    if (hooks && hooks.behindBed) hooks.behindBed(ctx);
    bed(ctx);
    if (hooks && hooks.overBed) hooks.overBed(ctx);
    cab(ctx);
    exhaustCap(ctx);
    ctx.restore();

    ctx.restore();
  };

  /** world position of the exhaust stack tip (for smoke). */
  Truck.prototype.exhaustWorld = function () { return this.artToWorld(1058, 132); };
  Truck.prototype.rearWheelWorld = function () { return this.artToWorld(248, WHEEL_Y + WHEEL_R); };

  CT.Truck = Truck;
})(window.CT);
