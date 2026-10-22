/* truck.js — the flatbed cargo truck: driving physics (1D along the road) and Canvas artwork.
   Artwork is drawn in "art units" (a 1680 x 945 design grid) and scaled into the world by Truck.S. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;

  var S = 1 / 3;                   // art units -> world units
  var OX = 840, OY = 823;          // art-space anchor: truck centre at ground level
  var WHEELS = [354, 634, 1348];   // wheel centres (art x)
  var WHEEL_Y = 717, WHEEL_R = 106;
  var BED_TOP = 548;               // cargo rests on the bed floor at this art y
  var SLOTS = [1010, 620, 230];    // cargo slot centres (art x), loaded front first

  var DEFAULTS = {
    maxSpeed: 360 * CT.K,      // world units / s
    accel: 300 * CT.K,
    brake: 760 * CT.K,
    reverseMax: 150 * CT.K,
    reverseAccel: 210 * CT.K,
    rolling: 46 * CT.K,
    drag: 0.12,
    weightFactor: 0.07, // each unit of cargo weight slows acceleration a little
    gravity: 520 * CT.K
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
    this.lane = 0; this.laneT = 0; this.laneV = 0;
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
    this.lane = 0; this.laneT = 0; this.laneV = 0;
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

    var grip = c.grip || 1;
    if (wantBrake) decel += c.brake * (0.35 + 0.65 * grip);
    if (this.throttle > 0.01) {
      if (v < -5) decel += c.brake * 0.85 * this.throttle;           // gas while rolling back = brake first
      else a += (c.accel / mass) * (0.55 + 0.45 * grip) * this.throttle * Math.max(0, 1 - Math.pow(Math.max(0, v) / c.maxSpeed, 2));
    }
    if (this.revThrottle > 0.01) {
      if (v > 2) decel += c.brake * 0.85 * this.revThrottle;          // reverse while rolling forward = brake first
      else a -= (c.reverseAccel / mass) * this.revThrottle * Math.max(0, 1 - Math.pow(Math.max(0, -v) / c.reverseMax, 2));
    }
    decel += c.rolling + Math.abs(v) * c.drag;
    a += c.gravity * Math.sin(this.slope);          // uphill (slope < 0) slows the truck

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
    var targetPitch = D.clamp(-this.accelSm * 0.00007 / CT.K, -0.03, 0.03);
    this.pitchV += ((targetPitch - this.pitch) * 120 - this.pitchV * 10) * dt;
    this.pitch += this.pitchV * dt;
    var sr = Math.min(1, Math.abs(v) / c.maxSpeed);
    var road = Math.sin(this.distance * 0.045) * 0.9 * sr + Math.sin(this.distance * 0.13) * 0.5 * sr;
    this.bounceV += ((road - this.bounce) * 160 - this.bounceV * 12) * dt;
    this.bounce += this.bounceV * dt;

    this.brakeLight += ((this.braking ? 1 : 0) - this.brakeLight) * Math.min(1, dt * 12);

    // lane change animation
    var prevT = this.laneT;
    this.laneT = D.approach(this.laneT, this.lane, dt * 1.9);
    this.laneV = dt > 0 ? (this.laneT - prevT) / dt : 0;
  };

  /** 0 = near/right lane, 1 = far/left lane, -1 while changing lanes. */
  Truck.prototype.laneIndex = function () { return this.laneT < 0.2 ? 0 : this.laneT > 0.8 ? 1 : -1; };
  Truck.prototype.lanesOccupied = function () { var i = this.laneIndex(); return i === -1 ? [0, 1] : [i]; };
  Truck.prototype.laneY = function () { var t = this.laneT; return -34 * t * t * (3 - 2 * t); };

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
    return { x: this.x + lx * cs - ly * sn, y: this.y + this.laneY() + this.bounce + lx * sn + ly * cs };
  };

  Truck.prototype.slotWorld = function (i) { return this.artToWorld(SLOTS[i], BED_TOP); };

  // ------------------------------------------------------------------ drawing
  var OR = '#f8a619', OR_LT = '#ffc23d', OR_DK = '#d9820b', OR_LINE = '#c47208', LIP = '#ffd25e';
  var TIME = 0;
  Truck.setPaint = function (p) { OR = p.body; OR_LT = p.light; OR_DK = p.dark; OR_LINE = p.line; LIP = p.lip; };
  Truck.paintColors = function () { return { body: OR, light: OR_LT, dark: OR_DK, line: OR_LINE, lip: LIP }; };
  var SLATE = '#3b4250', SLATE_LT = '#545c6c';
  var POSTS = [36, 262, 498, 734, 970];

  function wheel(ctx, cx, cy, ang, blur) {
    D.circle(ctx, cx, cy, WHEEL_R, '#2b2f38', INK, 6);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = '#3a404b';
    for (var i = 0; i < 20; i++) { ctx.rotate(Math.PI / 10); ctx.fillRect(-7, -WHEEL_R + 4, 14, 11); }
    ctx.restore();
    D.circle(ctx, cx, cy, 86, '#353b46');
    ctx.beginPath(); ctx.arc(cx, cy, 95, Math.PI * 1.1, Math.PI * 1.5); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 6; ctx.stroke();
    var g = ctx.createRadialGradient(cx - 16, cy - 20, 6, cx, cy, 64);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#d3d6dc'); g.addColorStop(1, '#a3a8b2');
    D.circle(ctx, cx, cy, 62, g, '#5a5f69', 5);
    D.circle(ctx, cx, cy, 46, null, '#9095a0', 3);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    D.circle(ctx, 0, 0, 30, '#555c69', INK, 3);
    for (var j = 0; j < 6; j++) { var a = j * Math.PI / 3; D.circle(ctx, Math.cos(a) * 20, Math.sin(a) * 20, 4.5, '#2b2f38'); }
    for (var n = 0; n < 8; n++) { var b = n * Math.PI / 4 + 0.39; D.circle(ctx, Math.cos(b) * 52, Math.sin(b) * 52, 4, '#7d828d'); }
    ctx.restore();
    D.circle(ctx, cx, cy, 11, '#2b2f38');
    D.circle(ctx, cx - 4, cy - 4, 4, '#6a707c');
    if (blur > 0.05) {                       // motion blur on the rim at speed
      ctx.globalAlpha = Math.min(0.85, blur);
      var bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 64);
      bg.addColorStop(0, '#5a5f69'); bg.addColorStop(0.5, '#c9ccd3'); bg.addColorStop(1, '#9ea3ad');
      D.circle(ctx, cx, cy, 63, bg);
      ctx.strokeStyle = 'rgba(70,74,84,.6)'; ctx.lineWidth = 3;
      [24, 40, 54].forEach(function (r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
      ctx.globalAlpha = 1;
      D.circle(ctx, cx, cy, 13, '#2b2f38');
    }
  }

  function bodyBack(ctx, t) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // wheel wells
    ctx.fillStyle = '#16181d';
    WHEELS.forEach(function (wx, i) { ctx.beginPath(); ctx.arc(wx, WHEEL_Y, i === 2 ? 140 : 122, Math.PI, 0); ctx.fill(); });
    // chassis rail
    D.box(ctx, 64, 556, 1180, 56, 8, SLATE, INK, 5);
    ctx.fillStyle = SLATE_LT; ctx.fillRect(70, 562, 1168, 8);
    // rear bumper + tail light
    D.box(ctx, 28, 560, 56, 132, 9, SLATE, INK, 5);
    var tl = t.brakeLight;
    D.box(ctx, 34, 636, 30, 46, 6, tl > 0.05 ? 'rgb(255,' + Math.round(70 - tl * 40) + ',' + Math.round(55 - tl * 30) + ')' : '#d8352d', INK, 3);
    D.box(ctx, 38, 640, 9, 16, 3, 'rgba(255,190,180,.8)');
    if (tl > 0.05) {
      var gl = ctx.createRadialGradient(50, 660, 4, 50, 660, 90);
      gl.addColorStop(0, 'rgba(255,60,40,' + (0.55 * tl) + ')'); gl.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(50, 660, 90, 0, Math.PI * 2); ctx.fill();
    }
    // fuel tank + battery box
    D.box(ctx, 800, 606, 44, 74, 6, SLATE, INK, 4);
    D.box(ctx, 848, 604, 182, 96, 30, SLATE, INK, 5);
    ctx.fillStyle = SLATE_LT; D.rr(ctx, 862, 614, 154, 14, 7); ctx.fill();
    ctx.fillStyle = '#2b303b'; ctx.fillRect(892, 606, 12, 92); ctx.fillRect(976, 606, 12, 92);
    // frame piece behind the front wheel
    D.box(ctx, 1196, 600, 46, 130, 8, SLATE, INK, 4);
  }

  function fenders(ctx) {
    // tandem fender over the two rear axles
    ctx.fillStyle = SLATE; ctx.strokeStyle = INK; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(214, 700);
    ctx.arc(WHEELS[0], WHEEL_Y, 140, Math.PI * 1.03, Math.PI * 1.5);
    ctx.lineTo(WHEELS[1], WHEEL_Y - 140);
    ctx.arc(WHEELS[1], WHEEL_Y, 140, Math.PI * 1.5, Math.PI * 1.97);
    ctx.lineTo(774, 700);
    ctx.lineTo(752, 700);
    ctx.arc(WHEELS[1], WHEEL_Y, 118, Math.PI * 1.97, Math.PI * 1.5, true);
    ctx.lineTo(WHEELS[0], WHEEL_Y - 118);
    ctx.arc(WHEELS[0], WHEEL_Y, 118, Math.PI * 1.5, Math.PI * 1.03, true);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(WHEELS[0], WHEEL_Y, 131, Math.PI * 1.15, Math.PI * 1.5); ctx.lineTo(WHEELS[1], WHEEL_Y - 131); ctx.stroke();
    // marker lights
    D.box(ctx, 108, 576, 30, 16, 5, '#ff9a1f', INK, 3);
    D.box(ctx, 1146, 576, 30, 16, 5, '#ff9a1f', INK, 3);
  }

  function headboard(ctx) {
    // exhaust stack + front post of the cargo frame (behind the cab)
    D.box(ctx, 1188, 214, 26, 70, 7, '#2b303b', INK, 4);
    D.box(ctx, 1190, 250, 34, 360, 8, SLATE, INK, 5);
    ctx.fillStyle = SLATE_LT; ctx.fillRect(1196, 258, 6, 340);
  }

  function bed(ctx) {
    var x = 30, y = 395, w = 1180, h = 168;
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, OR_LT); g.addColorStop(0.18, OR); g.addColorStop(1, OR_DK);
    D.box(ctx, x, y, w, h, 8, g, INK, 6);
    // top lip
    ctx.fillStyle = LIP; ctx.fillRect(x + 6, y + 6, w - 12, 12);
    ctx.strokeStyle = OR_LINE; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 24); ctx.lineTo(x + w - 3, y + 24); ctx.stroke();
    // plank grooves
    [450, 505].forEach(function (yy) {
      ctx.strokeStyle = OR_LINE; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 6, yy); ctx.lineTo(x + w - 6, yy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,130,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 6, yy + 5); ctx.lineTo(x + w - 6, yy + 5); ctx.stroke();
    });
    // vertical stakes
    POSTS.concat([1170]).forEach(function (px) {
      D.box(ctx, px, y + 4, 30, h - 8, 4, OR, OR_LINE, 4);
      ctx.fillStyle = 'rgba(255,225,140,.75)'; ctx.fillRect(px + 6, y + 10, 5, h - 20);
    });
    // bottom lip
    ctx.fillStyle = 'rgba(150,80,0,.35)'; ctx.fillRect(x + 6, y + h - 16, w - 12, 10);
  }

  function rails(ctx) {
    // open cargo frame above the side panel (dark slate, like the reference)
    POSTS.concat([1170]).forEach(function (px) {
      D.box(ctx, px + 5, 282, 20, 116, 4, SLATE, INK, 4);
    });
    D.box(ctx, 30, 266, 1196, 24, 9, SLATE, INK, 5);
    ctx.fillStyle = SLATE_LT; D.rr(ctx, 40, 271, 1170, 6, 3); ctx.fill();
  }


  /** Bunny driver seen through the side window (facing right). */
  function bunnySide(ctx) {
    var blink = (TIME % 4.2) < 0.13;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    D.box(ctx, 1320, 320, 46, 150, 14, '#2b303b');                       // seat back
    ctx.fillStyle = '#3d7fe0'; ctx.strokeStyle = INK; ctx.lineWidth = 4;   // blue overalls
    ctx.beginPath(); ctx.ellipse(1426, 486, 72, 62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fbfaf7';
    ctx.beginPath(); ctx.ellipse(1430, 440, 30, 22, 0, 0, Math.PI * 2); ctx.fill();
    // ears (back ear first)
    ctx.save(); ctx.translate(1424, 300); ctx.rotate(-0.12);
    ctx.fillStyle = '#e9e4dc'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 50, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(1404, 304); ctx.rotate(-0.42);
    ctx.fillStyle = '#fbfaf7'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 54, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffb3c8'; ctx.beginPath(); ctx.ellipse(2, 4, 7, 38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // head
    D.circle(ctx, 1440, 376, 46, '#fbfaf7', INK, 4);
    // cap in the truck colour
    ctx.fillStyle = OR; ctx.beginPath(); ctx.arc(1440, 368, 47, Math.PI * 1.08, Math.PI * 1.98); ctx.closePath(); ctx.fill(); ctx.stroke();
    D.box(ctx, 1468, 352, 46, 12, 5, OR_DK, INK, 3);
    // face
    if (blink) { ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1460, 380); ctx.lineTo(1474, 380); ctx.stroke(); }
    else { D.circle(ctx, 1467, 380, 7, INK); D.circle(ctx, 1469, 377, 2.5, '#ffffff'); }
    D.circle(ctx, 1478, 398, 15, '#ffffff', INK, 3);
    D.circle(ctx, 1490, 391, 6, '#ff8fb1', INK, 2);
    ctx.fillStyle = 'rgba(255,140,170,.55)'; ctx.beginPath(); ctx.arc(1454, 402, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(1484, 404); ctx.quadraticCurveTo(1478, 412, 1472, 406); ctx.stroke();
    // steering wheel + paw
    ctx.strokeStyle = '#1d1f25'; ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(1532, 436, 12, 46, 0.2, 0, Math.PI * 2); ctx.stroke();
    D.circle(ctx, 1520, 422, 13, '#fbfaf7', INK, 3);
  }

  function cab(ctx) {
    ctx.lineJoin = 'round';
    // shell
    ctx.beginPath();
    ctx.moveTo(1214, 640);
    ctx.lineTo(1214, 244);
    ctx.quadraticCurveTo(1214, 210, 1248, 210);
    ctx.lineTo(1562, 210);
    ctx.quadraticCurveTo(1602, 210, 1616, 244);
    ctx.lineTo(1638, 330);
    ctx.quadraticCurveTo(1644, 352, 1644, 378);
    ctx.lineTo(1644, 640);
    ctx.lineTo(1471, 640);
    ctx.arc(1348, 717, 145, -0.559, -2.582, true);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, 210, 0, 640);
    g.addColorStop(0, OR_LT); g.addColorStop(0.35, OR); g.addColorStop(1, OR_DK);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
    // roof visor
    D.box(ctx, 1250, 178, 330, 36, 14, OR, INK, 5);
    ctx.fillStyle = LIP; D.rr(ctx, 1262, 184, 300, 9, 4); ctx.fill();
    // roof highlight
    ctx.strokeStyle = 'rgba(255,230,160,.8)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1232, 300); ctx.lineTo(1232, 252); ctx.quadraticCurveTo(1232, 230, 1254, 230); ctx.stroke();
    // door
    ctx.beginPath();
    ctx.moveTo(1290, 600); ctx.lineTo(1290, 270); ctx.quadraticCurveTo(1290, 250, 1312, 250);
    ctx.lineTo(1560, 250); ctx.quadraticCurveTo(1578, 250, 1582, 270);
    ctx.lineTo(1592, 380); ctx.lineTo(1592, 596); ctx.quadraticCurveTo(1592, 612, 1576, 612);
    ctx.lineTo(1304, 612); ctx.quadraticCurveTo(1290, 612, 1290, 600); ctx.closePath();
    ctx.strokeStyle = OR_LINE; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(29,29,34,.8)'; ctx.lineWidth = 3; ctx.stroke();
    // side window
    ctx.beginPath();
    ctx.moveTo(1332, 274); ctx.lineTo(1540, 274); ctx.quadraticCurveTo(1556, 274, 1558, 290);
    ctx.lineTo(1568, 436); ctx.quadraticCurveTo(1569, 452, 1553, 452);
    ctx.lineTo(1332, 452); ctx.quadraticCurveTo(1316, 452, 1316, 436);
    ctx.lineTo(1316, 290); ctx.quadraticCurveTo(1316, 274, 1332, 274); ctx.closePath();
    var wg = ctx.createLinearGradient(1316, 274, 1560, 452);
    wg.addColorStop(0, '#7fd0ff'); wg.addColorStop(1, '#2f8ee0');
    ctx.fillStyle = wg; ctx.fill();
    ctx.save(); ctx.clip();
    bunnySide(ctx);
    ctx.fillStyle = 'rgba(120,190,240,.2)'; ctx.fillRect(1300, 260, 280, 200);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(1400, 274); ctx.lineTo(1450, 274); ctx.lineTo(1350, 452); ctx.lineTo(1300, 452); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.beginPath(); ctx.moveTo(1475, 274); ctx.lineTo(1492, 274); ctx.lineTo(1392, 452); ctx.lineTo(1375, 452); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
    // handle
    D.box(ctx, 1320, 474, 60, 22, 9, SLATE, INK, 3);
    // mirror
    ctx.strokeStyle = INK; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(1540, 320); ctx.lineTo(1586, 300); ctx.moveTo(1540, 420); ctx.lineTo(1586, 440); ctx.stroke();
    ctx.strokeStyle = SLATE; ctx.lineWidth = 4; ctx.stroke();
    D.box(ctx, 1500, 290, 44, 166, 16, SLATE, INK, 5);
    ctx.fillStyle = SLATE_LT; D.rr(ctx, 1508, 300, 9, 140, 4); ctx.fill();
    // headlight
    var hg = ctx.createLinearGradient(1602, 512, 1644, 600);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#d4dde8');
    D.box(ctx, 1602, 512, 46, 88, 14, hg, INK, 5);
    // amber side marker
    D.box(ctx, 1520, 560, 46, 20, 8, '#ffad2a', INK, 3);
    // bumper + front lamp
    D.box(ctx, 1528, 640, 124, 108, 18, SLATE, INK, 6);
    ctx.fillStyle = SLATE_LT; ctx.fillRect(1538, 650, 104, 9);
    D.box(ctx, 1598, 668, 38, 26, 7, '#ffae2a', INK, 3);
    // front wheel arch flare
    ctx.strokeStyle = INK; ctx.lineWidth = 30;
    ctx.beginPath(); ctx.arc(1348, 717, 154, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
    ctx.strokeStyle = SLATE; ctx.lineWidth = 20;
    ctx.beginPath(); ctx.arc(1348, 717, 154, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  }

  /**
   * hooks.behindBed(ctx) / hooks.overBed(ctx) draw the cargo + straps in art space.
   */
  Truck.prototype.draw = function (ctx, hooks, opts) {
    TIME = (opts && opts.t) || 0;
    var ly = this.laneY();
    // ground shadow
    ctx.save();
    ctx.fillStyle = 'rgba(20,30,20,.28)';
    ctx.beginPath(); ctx.ellipse(this.x + 10, this.y + ly + 3, Truck.LENGTH * 0.52, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y + ly);
    if (opts && opts.night) {
      var hx = (1648 - OX) * S, hy = (556 - OY) * S;
      var hg = ctx.createLinearGradient(hx, 0, hx + 520, 0);
      hg.addColorStop(0, 'rgba(255,244,190,.55)'); hg.addColorStop(1, 'rgba(255,244,190,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(hx, hy - 8); ctx.lineTo(hx + 520, hy - 60); ctx.lineTo(hx + 520, hy + 70); ctx.lineTo(hx, hy + 10); ctx.closePath(); ctx.fill();
    }
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
    var blur = D.clamp((Math.abs(this.v) / (500 * CT.K) - 0.25) * 1.4, 0, 1);
    WHEELS.forEach(function (wx) { wheel(ctx, wx, WHEEL_Y, self.wheelAngle, blur); });

    ctx.save();
    ctx.translate(OX, OY + this.bounce / S); ctx.rotate(this.pitch); ctx.translate(-OX, -OY);
    fenders(ctx);
    headboard(ctx);
    if (hooks && hooks.behindBed) hooks.behindBed(ctx);
    bed(ctx);
    rails(ctx);
    if (hooks && hooks.overBed) hooks.overBed(ctx);
    cab(ctx);
    ctx.restore();

    ctx.restore();
  };

  /** world position of the exhaust stack tip (for smoke). */
  Truck.prototype.exhaustWorld = function () { return this.artToWorld(1201, 214); };
  Truck.prototype.rearWheelWorld = function () { return this.artToWorld(WHEELS[0], WHEEL_Y + WHEEL_R); };

  CT.Truck = Truck;
})(window.CT);
