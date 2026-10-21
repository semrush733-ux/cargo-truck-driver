/* view3d.js — pseudo-3D road renderer for the TPP (chase) and FPP (cab) cameras.
   Same world as the side view: road distance = world x, lanes left/right, hills from the terrain, cosmetic bends from road.curves. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;
  var SEG = 60, N = 96;                 // 96 segments x 60 units ahead
  var ROAD_HALF = 205, LANE = 75;       // lane centres at +75 (right/near) and -75 (left/far)
  var BUNNY = '#fbfaf7';

  function hash(x) { var s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); }
  function mix(a, b, t) { return a + (b - a) * t; }

  function View3D() { this.pts = []; for (var i = 0; i <= N + 1; i++) this.pts.push({}); }

  View3D.prototype.curvature = function (road, z) {
    var cs = road.curves;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (z >= c.x1 && z <= c.x2) {
        var f = Math.min(1, (z - c.x1) / 260, (c.x2 - z) / 260);
        return c.dir * c.sharp * 0.00042 * f;
      }
    }
    return 0;
  };

  /** Lateral position of the truck for its lane (right lane = +75). */
  function truckLat(tr) { var t = tr.laneT; t = t * t * (3 - 2 * t); return mix(LANE, -LANE, t); }
  View3D.truckLat = truckLat;

  View3D.prototype.render = function (ctx, v, g, mode) {
    var W = v.W, Hh = v.H, world = g.world, tr = g.truck, th = world.theme, L = g.level;
    var elev = function (x) { return -world.heightAt(x); };
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    var cab = mode === 'cab';
    var F = Math.min(W, Hh * 1.8) * (cab ? 0.78 : 0.95);
    var tl = truckLat(tr);
    var camZ = cab ? tr.x + CT.Truck.FRONT - 50 : tr.x + CT.Truck.REAR - 620;
    var camLat = cab ? tl - 24 : tl * 0.7;
    var camY = Math.max(elev(camZ), elev(tr.x)) + (cab ? 118 : 175) + tr.bounce * 0.6;
    var hz = Hh * (cab ? 0.47 : 0.36);
    // look slightly up/down with the slope ahead so hills read well
    hz += D.clamp((elev(camZ + 700) - elev(camZ)) / 700 * F * 0.55, -Hh * 0.08, Hh * 0.08);

    // ---- segment table
    var pts = this.pts, zBase = Math.floor((camZ + 8) / SEG) * SEG, xo = 0, dx = 0;
    for (var j = 0; j <= N; j++) {
      var p = pts[j], z = zBase + j * SEG, d = z - camZ;
      p.z = z; p.d = d; p.xo = xo; p.e = elev(z);
      dx += this.curvature(L.road, z) * SEG; xo += dx * SEG * 0.5;
      if (d > 1) { p.s = F / d; p.sx = W / 2 + (p.xo - camLat) * p.s; p.sy = hz - (p.e - camY) * p.s; }
      else { p.s = 0; }
    }
    var farShift = pts[N].xo;

    this.drawSky(ctx, v, th, hz, -farShift * 0.08 - tr.x * 0.01);

    // ---- sprites in range
    var zMin = camZ + 15, zMax = zBase + N * SEG;
    var sprites = [];
    world.props.forEach(function (pr) {
      if (pr.x < zMin - 400 || pr.x > zMax) return;
      var h = hash(pr.x);
      switch (pr.kind) {
        case 'lamp': sprites.push({ z: pr.x, lat: -ROAD_HALF - 40, k: 'lamp' }); break;
        case 'sign': sprites.push({ z: pr.x, lat: ROAD_HALF + 70, k: 'sign', p: pr }); break;
        case 'signal': sprites.push({ z: pr.light.x, lat: ROAD_HALF + 46, k: 'signal', p: pr }); break;
        case 'fence': break;
        default:
          sprites.push({ z: pr.x, lat: -(ROAD_HALF + 150 + h * 520), k: pr.kind, p: pr });
          sprites.push({ z: pr.x + 157, lat: ROAD_HALF + 170 + hash(pr.x + 3) * 560, k: pr.kind, p: pr });
      }
    });
    if (g.traffic) g.traffic.cars.forEach(function (c) {
      var z = c.x - c.len / 2;
      if (z > zMin && z < zMax) sprites.push({ z: z, lat: c.lane === 0 ? LANE : -LANE, k: 'car', c: c });
    });
    if (!cab) sprites.push({ z: tr.x + CT.Truck.REAR, lat: tl, k: 'truck' });
    sprites.sort(function (a, b) { return b.z - a.z; });

    // ---- draw far → near, segment by segment, sprites interleaved
    var si = 0, night = !!th.night;
    var zone = L.destination.zone, stations = [L.loadStation, L.destination];
    for (j = N - 1; j >= 0; j--) {
      var a = pts[j], b = pts[j + 1];
      if (a.d > 1 && b.d > 1) {
        var alt = Math.floor(a.z / SEG) % 2 === 0;
        var fog = Math.pow(Math.min(1, a.d / (N * SEG)), 1.7);
        // ground
        ctx.fillStyle = th.grass[0];
        ctx.fillRect(0, b.sy, W, a.sy - b.sy + 1);
        if (!alt) { ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(0, b.sy, W, a.sy - b.sy + 1); }
        // rumble strips + road + markings
        this.quad(ctx, a, b, -ROAD_HALF * 1.12, ROAD_HALF * 1.12, alt ? '#e8e8e8' : (th.snow ? '#9fb4c7' : '#d8352d'));
        this.quad(ctx, a, b, -ROAD_HALF, ROAD_HALF, alt ? th.road[0] : th.road[1]);
        this.quad(ctx, a, b, -ROAD_HALF + 10, -ROAD_HALF + 18, '#f2f2f2');
        this.quad(ctx, a, b, ROAD_HALF - 18, ROAD_HALF - 10, '#ffd34a');
        if (alt) this.quad(ctx, a, b, -4, 4, '#f2f2f2');
        if (a.z >= zone.x1 && a.z < zone.x2) this.quad(ctx, a, b, -ROAD_HALF, ROAD_HALF, g.zone.ready ? 'rgba(80,230,100,.6)' : 'rgba(60,210,90,.38)');
        var lb = L.loadStation.bay;
        if (a.z >= lb.x1 && a.z < lb.x2) this.quad(ctx, a, b, -ROAD_HALF, ROAD_HALF, 'rgba(255,211,74,.25)');
        (L.lights || []).forEach(function (l) {
          var stop = l.x - 60;
          if (stop >= a.z && stop < a.z + SEG) this.quadZ(ctx, stop - 6, stop + 6, a, b, -ROAD_HALF, ROAD_HALF, '#ffffff');
          if (a.z >= stop + 20 && a.z < stop + 120) for (var zl = -ROAD_HALF + 20; zl < ROAD_HALF - 20; zl += 44) this.quad(ctx, a, b, zl, zl + 22, 'rgba(255,255,255,.8)');
        }, this);
        (L.obstacles || []).forEach(function (o) {
          if (o.type === 'bump' && o.x >= a.z && o.x < a.z + SEG) {
            this.quadZ(ctx, o.x - 20, o.x + 20, a, b, -ROAD_HALF, ROAD_HALF, '#ffc21a');
            for (var bl = -ROAD_HALF; bl < ROAD_HALF; bl += 60) this.quadZ(ctx, o.x - 20, o.x + 20, a, b, bl, bl + 30, INK);
          }
        }, this);
        // warehouses as walls on the left
        stations.forEach(function (st) {
          var bd = st.building;
          if (a.z >= bd.x1 && a.z < bd.x2) this.wall(ctx, a, b, -ROAD_HALF - 130, bd.height + 20, bd, night, alt);
        }, this);
        if (fog > 0.02) { ctx.fillStyle = th.fog; ctx.globalAlpha = fog * 0.85; ctx.fillRect(0, b.sy - 2, W, a.sy - b.sy + 3); ctx.globalAlpha = 1; }
      }
      while (si < sprites.length && sprites[si].z >= a.z) {
        this.sprite(ctx, sprites[si], pts, camZ, camLat, camY, F, hz, W, g, night, Math.pow(Math.min(1, (sprites[si].z - camZ) / (N * SEG)), 1.7));
        si++;
      }
    }
    while (si < sprites.length) { this.sprite(ctx, sprites[si], pts, camZ, camLat, camY, F, hz, W, g, night, 0); si++; }

    if (night) this.headlights(ctx, pts, tl, camLat, cab);
    world.drawWeather(ctx, v);
    if (cab) this.cabInterior(ctx, v, g, tl);
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  };

  // ------------------------------------------------------------ primitives
  View3D.prototype.quad = function (ctx, a, b, l1, l2, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(a.sx + l1 * a.s, a.sy); ctx.lineTo(a.sx + l2 * a.s, a.sy);
    ctx.lineTo(b.sx + l2 * b.s, b.sy); ctx.lineTo(b.sx + l1 * b.s, b.sy);
    ctx.closePath(); ctx.fill();
  };
  /** Quad between two z values inside one segment. */
  View3D.prototype.quadZ = function (ctx, z1, z2, a, b, l1, l2, col) {
    var t1 = D.clamp((z1 - a.z) / SEG, 0, 1), t2 = D.clamp((z2 - a.z) / SEG, 0, 1);
    var p1 = lerpPt(a, b, t1), p2 = lerpPt(a, b, t2);
    this.quad(ctx, p1, p2, l1, l2, col);
  };
  function lerpPt(a, b, t) {
    return { sx: mix(a.sx, b.sx, t), sy: mix(a.sy, b.sy, t), s: mix(a.s, b.s, t) };
  }

  View3D.prototype.wall = function (ctx, a, b, lat, h, bd, night, alt) {
    var ax = a.sx + lat * a.s, bx = b.sx + lat * b.s;
    var aTop = a.sy - h * a.s, bTop = b.sy - h * b.s;
    ctx.fillStyle = bd.wall;
    ctx.beginPath(); ctx.moveTo(ax, a.sy); ctx.lineTo(bx, b.sy); ctx.lineTo(bx, bTop); ctx.lineTo(ax, aTop); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = bd.roof;
    var r = 26;
    ctx.beginPath(); ctx.moveTo(ax, aTop); ctx.lineTo(bx, bTop); ctx.lineTo(bx, bTop - r * b.s); ctx.lineTo(ax, aTop - r * a.s); ctx.closePath(); ctx.fill();
    if (alt) {
      ctx.fillStyle = night ? '#ffd56a' : '#9fd6f7';
      var mx = mix(ax, bx, 0.25), mx2 = mix(ax, bx, 0.75);
      var y1 = mix(aTop, bTop, 0.5) + 50 * a.s, y2 = y1 + 46 * a.s;
      ctx.fillRect(Math.min(mx, mx2), y1, Math.abs(mx2 - mx), y2 - y1);
    }
  };

  // ------------------------------------------------------------ sky & horizon
  View3D.prototype.drawSky = function (ctx, v, th, hz, shift) {
    var W = v.W, H = v.H;
    var g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.7, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 2);
    ctx.fillStyle = th.grass[1]; ctx.fillRect(0, hz, W, H - hz);
    var sx = W * 0.8 + shift * 0.3, sy = hz * 0.35;
    if (th.night) {
      for (var i = 0; i < 70; i++) { ctx.globalAlpha = 0.4 + 0.6 * hash(i * 3.3); D.circle(ctx, hash(i) * W, hash(i + 9) * hz * 0.8, 1 + hash(i + 2) * 1.4, '#fff'); }
      ctx.globalAlpha = 1;
      D.circle(ctx, sx, sy, 26, th.sun); D.circle(ctx, sx + 10, sy - 5, 23, th.sky[0]);
    } else {
      var sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 120);
      sg.addColorStop(0, 'rgba(255,245,190,.85)'); sg.addColorStop(1, 'rgba(255,245,190,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 120, 0, Math.PI * 2); ctx.fill();
      D.circle(ctx, sx, sy, 30, th.sun);
    }
    // mountains / skyline
    ctx.fillStyle = th.far;
    ctx.beginPath(); ctx.moveTo(0, hz + 2);
    for (var x = 0; x <= W + 10; x += 10) {
      var u = (x + shift) * 0.004;
      ctx.lineTo(x, hz - (0.09 + 0.05 * Math.sin(u * 1.3) + 0.03 * Math.sin(u * 3.1 + 1)) * H);
    }
    ctx.lineTo(W, hz + 2); ctx.closePath(); ctx.fill();
    if (th.snow) {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.moveTo(0, hz);
      for (x = 0; x <= W + 10; x += 10) { var u2 = (x + shift) * 0.004; ctx.lineTo(x, hz - (0.09 + 0.05 * Math.sin(u2 * 1.3) + 0.03 * Math.sin(u2 * 3.1 + 1)) * H + 12); }
      ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = th.hill;
    if (th.skyline) {
      for (x = -((shift * 1.6) % 70 + 70); x < W + 70; x += 70) {
        var k = hash(Math.floor((x + shift * 1.6) / 70)), hgt = (0.05 + k * 0.1) * H;
        ctx.fillStyle = k > 0.5 ? th.hill : th.hillDot; ctx.fillRect(x, hz - hgt, 62, hgt + 2);
        if (th.night) { ctx.fillStyle = 'rgba(255,214,120,.7)'; for (var wy = hz - hgt + 6; wy < hz - 6; wy += 12) for (var wx = x + 6; wx < x + 56; wx += 12) if (hash(wx * 7 + wy) > 0.5) ctx.fillRect(wx, wy, 5, 6); }
      }
    } else {
      ctx.beginPath(); ctx.moveTo(0, hz + 2);
      for (x = 0; x <= W + 10; x += 10) { var u3 = (x + shift * 1.8) * 0.006; ctx.lineTo(x, hz - (0.03 + 0.02 * Math.sin(u3 * 1.7) + 0.012 * Math.sin(u3 * 4)) * H); }
      ctx.lineTo(W, hz + 2); ctx.closePath(); ctx.fill();
    }
  };

  // ------------------------------------------------------------ sprites
  View3D.prototype.project = function (pts, z, lat, camZ, camLat, camY, F, hz, W, world) {
    var d = z - camZ;
    if (d < 8) return null;
    var j = Math.floor((z - pts[0].z) / SEG), t;
    if (j < 0) j = 0; if (j >= N) j = N - 1;
    t = (z - pts[j].z) / SEG;
    var xo = mix(pts[j].xo, pts[j + 1].xo, t);
    var s = F / d;
    return { s: s, x: W / 2 + (xo + lat - camLat) * s, y: hz - (-world.heightAt(z) - camY) * s };
  };

  View3D.prototype.sprite = function (ctx, sp, pts, camZ, camLat, camY, F, hz, W, g, night, fog) {
    var P = this.project(pts, sp.z, sp.lat, camZ, camLat, camY, F, hz, W, g.world);
    if (!P) return;
    var s = P.s, x = P.x, y = P.y;
    if (x < -600 * s - 200 || x > W + 600 * s + 200) return;
    ctx.save();
    if (fog > 0.5) ctx.globalAlpha = Math.max(0.15, 1 - (fog - 0.5) * 1.6);
    var dNear = sp.z - camZ;
    if (sp.k !== 'car' && sp.k !== 'truck' && dNear < 320) ctx.globalAlpha *= D.clamp((dNear - 90) / 230, 0, 1);   // fade props passing the camera
    if (ctx.globalAlpha <= 0.01) { ctx.restore(); return; }
    switch (sp.k) {
      case 'car':
        ctx.globalAlpha *= sp.c.alpha;
        CT.Traffic.drawCarBack(ctx, sp.c, x, y, sp.c.type.w * 98 * s, night);
        break;
      case 'truck': drawTruckBack(ctx, x, y + g.truck.bounce * s, 112 * s, g, night); break;
      case 'lamp': spriteLamp(ctx, x, y, s, night); break;
      case 'sign': spriteSign(ctx, x, y, s, sp.p); break;
      case 'signal': spriteSignal(ctx, x, y, s, sp.p.light, g.lt); break;
      default: spriteTree(ctx, x, y, s * (sp.p.s || 1), sp.k, g.world.theme); break;
    }
    ctx.restore();
  };

  function spriteTree(ctx, x, y, s, kind, th) {
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 3 * s);
    if (kind === 'pine' || kind === 'snowpine') {
      D.box(ctx, x - 8 * s, y - 40 * s, 16 * s, 40 * s, 2, '#7a4c22');
      ctx.fillStyle = kind === 'snowpine' ? '#2c6b48' : '#2f8040';
      for (var i = 0; i < 3; i++) {
        var by = y - (30 + i * 45) * s, hw = (75 - i * 16) * s;
        ctx.beginPath(); ctx.moveTo(x - hw, by); ctx.lineTo(x, by - 85 * s); ctx.lineTo(x + hw, by); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (kind === 'snowpine') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - hw * 0.5, by - 40 * s); ctx.lineTo(x, by - 85 * s); ctx.lineTo(x + hw * 0.5, by - 40 * s); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#2c6b48'; }
      }
    } else if (kind === 'cactus') {
      ctx.fillStyle = '#4c9a4a';
      D.rr(ctx, x - 14 * s, y - 140 * s, 28 * s, 140 * s, 14 * s); ctx.fill(); ctx.stroke();
      D.rr(ctx, x - 50 * s, y - 100 * s, 22 * s, 56 * s, 11 * s); ctx.fill(); ctx.stroke();
      D.rr(ctx, x + 28 * s, y - 116 * s, 22 * s, 50 * s, 11 * s); ctx.fill(); ctx.stroke();
    } else if (kind === 'rock') {
      ctx.fillStyle = '#b98a5a'; ctx.beginPath(); ctx.moveTo(x - 60 * s, y); ctx.lineTo(x - 30 * s, y - 60 * s); ctx.lineTo(x + 30 * s, y - 50 * s); ctx.lineTo(x + 60 * s, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'house') {
      D.box(ctx, x - 90 * s, y - 130 * s, 180 * s, 130 * s, 2, '#e9a46b', INK, Math.max(1, 3 * s));
      ctx.fillStyle = '#b5473b'; ctx.beginPath(); ctx.moveTo(x - 104 * s, y - 130 * s); ctx.lineTo(x, y - 200 * s); ctx.lineTo(x + 104 * s, y - 130 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = th.night ? '#ffd56a' : '#9fd6f7'; ctx.fillRect(x - 60 * s, y - 100 * s, 40 * s, 32 * s); ctx.fillRect(x + 20 * s, y - 100 * s, 40 * s, 32 * s);
    } else if (kind === 'bush') {
      ctx.fillStyle = th.snow ? '#5b8a6a' : '#3f9c3a';
      ctx.beginPath(); ctx.arc(x - 25 * s, y - 20 * s, 26 * s, Math.PI, 0); ctx.arc(x + 15 * s, y - 26 * s, 30 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'palm') {
      ctx.strokeStyle = '#a0743f'; ctx.lineWidth = 12 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 * s, y - 180 * s); ctx.stroke();
      ctx.fillStyle = '#3f9c3a'; for (var k = 0; k < 5; k++) { var an = -Math.PI + k * Math.PI / 4; ctx.beginPath(); ctx.ellipse(x + 18 * s + Math.cos(an) * 45 * s, y - 180 * s + Math.sin(an) * 20 * s + 10 * s, 50 * s, 12 * s, an, 0, Math.PI * 2); ctx.fill(); }
    } else {
      D.box(ctx, x - 10 * s, y - 80 * s, 20 * s, 80 * s, 2, '#8a5a2b');
      ctx.fillStyle = '#2f7d2c';
      ctx.beginPath(); ctx.arc(x - 36 * s, y - 104 * s, 40 * s, 0, Math.PI * 2); ctx.arc(x + 34 * s, y - 108 * s, 42 * s, 0, Math.PI * 2); ctx.arc(x, y - 150 * s, 50 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4aa63c';
      ctx.beginPath(); ctx.arc(x - 30 * s, y - 108 * s, 32 * s, 0, Math.PI * 2); ctx.arc(x + 30 * s, y - 112 * s, 34 * s, 0, Math.PI * 2); ctx.arc(x, y - 154 * s, 42 * s, 0, Math.PI * 2); ctx.fill();
    }
  }

  function spriteLamp(ctx, x, y, s, night) {
    ctx.fillStyle = '#59606e';
    ctx.fillRect(x - 5 * s, y - 300 * s, 10 * s, 300 * s);
    ctx.strokeStyle = '#59606e'; ctx.lineWidth = 8 * s;
    ctx.beginPath(); ctx.moveTo(x, y - 296 * s); ctx.quadraticCurveTo(x + 10 * s, y - 330 * s, x + 110 * s, y - 330 * s); ctx.stroke();
    D.box(ctx, x + 90 * s, y - 336 * s, 50 * s, 12 * s, 3, '#3a3f4a');
    if (night) {
      var g = ctx.createRadialGradient(x + 115 * s, y - 326 * s, 2, x + 115 * s, y - 326 * s, 90 * s);
      g.addColorStop(0, 'rgba(255,230,150,.95)'); g.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 115 * s, y - 326 * s, 90 * s, 0, Math.PI * 2); ctx.fill();
    }
  }

  function spriteSign(ctx, x, y, s, p) {
    ctx.fillStyle = '#9aa3b2'; ctx.fillRect(x - 4 * s, y - 170 * s, 8 * s, 170 * s);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var lw = Math.max(1, 3 * s);
    if (p.style === 'curve' || p.style === 'bump' || p.style === 'warning') {
      ctx.save(); ctx.translate(x, y - 200 * s); ctx.rotate(Math.PI / 4);
      D.box(ctx, -40 * s, -40 * s, 80 * s, 80 * s, 6 * s, '#ffc21a', INK, lw); ctx.restore();
      ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      if (p.style === 'curve') {
        ctx.beginPath(); ctx.moveTo(x - 8 * p.dir * s, y - 176 * s); ctx.lineTo(x - 8 * p.dir * s, y - 200 * s); ctx.quadraticCurveTo(x - 8 * p.dir * s, y - 218 * s, x + 14 * p.dir * s, y - 220 * s); ctx.stroke();
      } else if (p.style === 'bump') {
        ctx.beginPath(); ctx.moveTo(x - 24 * s, y - 188 * s); ctx.quadraticCurveTo(x, y - 222 * s, x + 24 * s, y - 188 * s); ctx.closePath(); ctx.fill();
      }
      if (p.style !== 'warning' && s > 0.05) {
        D.box(ctx, x - 32 * s, y - 148 * s, 64 * s, 28 * s, 4 * s, '#fff', INK, lw);
        ctx.fillStyle = INK; ctx.font = Math.round(19 * s) + 'px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(p.text, x, y - 133 * s);
      }
      return;
    }
    if (p.style === 'speed') {
      D.circle(ctx, x, y - 200 * s, 42 * s, '#fff', '#d8352d', 9 * s);
      if (s > 0.05) { ctx.fillStyle = INK; ctx.font = Math.round(26 * s) + 'px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(p.text, x, y - 198 * s); }
      return;
    }
    var w = (p.w || 230) * s;
    D.box(ctx, x - w / 2, y - 260 * s, w, 92 * s, 10 * s, p.color || '#1f8a43', INK, lw);
    if (s > 0.06) {
      ctx.fillStyle = '#fff'; ctx.font = Math.round(25 * s) + 'px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(p.text, x, y - 230 * s);
      ctx.font = '800 ' + Math.round(18 * s) + 'px Nunito, sans-serif'; ctx.fillText(p.sub || '', x, y - 196 * s);
    }
  }

  function spriteSignal(ctx, x, y, s, l, t) {
    var st = CT.Traffic.lightState(l, t);
    ctx.fillStyle = '#3b4250';
    ctx.fillRect(x - 6 * s, y - 330 * s, 12 * s, 330 * s);
    ctx.fillRect(x - (ROAD_HALF + 40) * s, y - 330 * s, (ROAD_HALF + 46) * s, 10 * s);       // overhead arm
    var bx = x - (ROAD_HALF * 0.55) * s;
    [bx, x - 10 * s].forEach(function (cx) {
      D.box(ctx, cx - 20 * s, y - 322 * s, 40 * s, 100 * s, 8 * s, '#2b303b', INK, Math.max(1, 2 * s));
      var cols = { red: '#ff3b2f', yellow: '#ffc21a', green: '#2fe05a' };
      ['red', 'yellow', 'green'].forEach(function (c, i) {
        var on = st === c, cy = y - 304 * s + i * 30 * s;
        if (on) {
          var gr = ctx.createRadialGradient(cx, cy, 1, cx, cy, 40 * s);
          gr.addColorStop(0, cols[c]); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, 40 * s, 0, Math.PI * 2); ctx.fill();
        }
        D.circle(ctx, cx, cy, 10 * s, on ? cols[c] : '#454b57');
      });
    });
  }

  // ------------------------------------------------------------ the truck seen from behind
  function drawTruckBack(ctx, x, y, w, g, night) {
    var tr = g.truck, P = CT.Truck.paintColors(), u = w / 100;
    var lw = Math.max(1, 1.2 * u);
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y, 58 * u, 6 * u, 0, 0, Math.PI * 2); ctx.fill();
    var roll = -tr.laneV * 0.05;
    ctx.save(); ctx.translate(x, y); ctx.rotate(roll);
    // dual tyres
    [-1, 1].forEach(function (sd) {
      D.box(ctx, sd * 50 * u - (sd > 0 ? 12 * u : 0), -24 * u, 12 * u, 24 * u, 3 * u, '#22252c', INK, lw);
      D.box(ctx, sd * 36 * u - (sd > 0 ? 11 * u : 0), -24 * u, 11 * u, 24 * u, 3 * u, '#22252c', INK, lw);
      ctx.fillStyle = '#3a404b'; ctx.fillRect(sd * 50 * u - (sd > 0 ? 9 * u : -3 * u), -20 * u, 6 * u, 3 * u);
    });
    // axle + mud flaps
    ctx.fillStyle = '#1d1f25'; ctx.fillRect(-26 * u, -16 * u, 52 * u, 6 * u);
    D.box(ctx, -40 * u, -22 * u, 9 * u, 16 * u, 1.5 * u, '#1d1f25');
    D.box(ctx, 31 * u, -22 * u, 9 * u, 16 * u, 1.5 * u, '#1d1f25');
    // cab peeking above the cargo frame
    var bedTop = -76 * u;
    D.box(ctx, -45 * u, bedTop - 34 * u, 90 * u, 30 * u, 5 * u, P.body, INK, lw);
    D.box(ctx, -40 * u, bedTop - 40 * u, 80 * u, 8 * u, 3 * u, P.body, INK, lw);
    // mirrors on arms (left mirror shows the bunny driver)
    [-1, 1].forEach(function (sd) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4 * u;
      ctx.beginPath(); ctx.moveTo(sd * 45 * u, bedTop - 14 * u); ctx.lineTo(sd * 57 * u, bedTop - 10 * u); ctx.stroke();
      var mx = sd * 62 * u, my = bedTop - 20 * u;
      D.box(ctx, mx - 7 * u, my, 14 * u, 30 * u, 3.5 * u, '#3b4250', INK, lw);
      ctx.save(); D.rr(ctx, mx - 5 * u, my + 2 * u, 10 * u, 26 * u, 2.5 * u); ctx.clip();
      var mg = ctx.createLinearGradient(0, my, 0, my + 28 * u);
      mg.addColorStop(0, '#bfe4ff'); mg.addColorStop(1, '#5aa6e8');
      ctx.fillStyle = mg; ctx.fillRect(mx - 6 * u, my, 12 * u, 30 * u);
      if (sd < 0) drawBunnyFace(ctx, mx + 1 * u, my + 17 * u, 5.2 * u, g.t, P);
      else { ctx.fillStyle = 'rgba(80,80,90,.6)'; ctx.beginPath(); ctx.moveTo(mx - 5 * u, my + 28 * u); ctx.lineTo(mx, my + 14 * u); ctx.lineTo(mx + 5 * u, my + 28 * u); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(mx - 4 * u, my + 3 * u, 2 * u, 22 * u);
      ctx.restore();
    });
    // cargo tops between the rails
    if (g.cargo && g.cargo.onTruckCount() > 0) {
      D.box(ctx, -40 * u, bedTop - 16 * u, 80 * u, 18 * u, 2 * u, '#d49a5e', INK, lw);
      ctx.fillStyle = '#c9894c'; ctx.fillRect(-6 * u, bedTop - 16 * u, 12 * u, 10 * u);
    }
    // cargo frame (rails)
    ctx.fillStyle = '#3b4250';
    [-50, -2, 46].forEach(function (px) { D.box(ctx, px * u, bedTop - 20 * u, 4 * u, 22 * u, 1 * u, '#3b4250', INK, lw * 0.8); });
    D.box(ctx, -51 * u, bedTop - 24 * u, 102 * u, 5 * u, 2 * u, '#3b4250', INK, lw);
    // tailgate panel
    var gg = ctx.createLinearGradient(0, bedTop, 0, bedTop + 38 * u);
    gg.addColorStop(0, P.light); gg.addColorStop(0.25, P.body); gg.addColorStop(1, P.dark);
    D.box(ctx, -51 * u, bedTop, 102 * u, 38 * u, 3 * u, gg, INK, lw * 1.2);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.4 * u;
    [13, 25].forEach(function (yy) { ctx.beginPath(); ctx.moveTo(-49 * u, bedTop + yy * u); ctx.lineTo(49 * u, bedTop + yy * u); ctx.stroke(); });
    [-47, -2, 43].forEach(function (px) { D.box(ctx, px * u, bedTop + 1 * u, 4 * u, 36 * u, 1 * u, P.body, P.line, 1); });
    ctx.fillStyle = P.lip; ctx.fillRect(-49 * u, bedTop + 2 * u, 98 * u, 3 * u);
    // chassis, tail lights, plate
    D.box(ctx, -50 * u, -38 * u, 100 * u, 12 * u, 2 * u, '#3b4250', INK, lw);
    var lc = tr.brakeLight > 0.1 ? '#ff3b2f' : '#c22a22';
    D.box(ctx, -49 * u, -36 * u, 13 * u, 8 * u, 1.5 * u, lc, INK, lw * 0.8);
    D.box(ctx, 36 * u, -36 * u, 13 * u, 8 * u, 1.5 * u, lc, INK, lw * 0.8);
    D.box(ctx, -33 * u, -36 * u, 5 * u, 8 * u, 1 * u, '#ff9a1f');
    D.box(ctx, 28 * u, -36 * u, 5 * u, 8 * u, 1 * u, '#ff9a1f');
    if (tr.brakeLight > 0.1 || night) {
      ctx.globalAlpha = tr.brakeLight > 0.1 ? 0.7 * tr.brakeLight : 0.3;
      [-42, 42].forEach(function (lx) {
        var rg = ctx.createRadialGradient(lx * u, -32 * u, 1, lx * u, -32 * u, 30 * u);
        rg.addColorStop(0, 'rgba(255,60,40,.95)'); rg.addColorStop(1, 'rgba(255,60,40,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(lx * u, -32 * u, 30 * u, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    D.box(ctx, -12 * u, -26 * u, 24 * u, 8 * u, 1.5 * u, '#f2f2f2', INK, lw * 0.6);
    if (u > 1.2) { ctx.fillStyle = INK; ctx.font = Math.round(5.5 * u) + 'px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CTD 001', 0, -21.8 * u); }
    ctx.restore();
  }

  /** Bunny face (used in mirrors). */
  function drawBunnyFace(ctx, x, y, r, t, P) {
    var blink = (t % 4.2) < 0.13;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.12);
    [-1, 1].forEach(function (sd) {
      ctx.save(); ctx.translate(x + sd * r * 0.42, y - r * 1.25); ctx.rotate(sd * 0.18);
      ctx.fillStyle = BUNNY; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.95, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3c8'; ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 0.14, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    D.circle(ctx, x, y, r, BUNNY, INK, Math.max(1, r * 0.12));
    ctx.fillStyle = P ? P.body : '#f8a619';
    ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 1.02, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (blink) {
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * 0.1); ctx.lineTo(x - r * 0.2, y + r * 0.1); ctx.moveTo(x + r * 0.2, y + r * 0.1); ctx.lineTo(x + r * 0.5, y + r * 0.1); ctx.stroke();
    } else {
      D.circle(ctx, x - r * 0.36, y + r * 0.1, r * 0.16, INK); D.circle(ctx, x + r * 0.36, y + r * 0.1, r * 0.16, INK);
      D.circle(ctx, x - r * 0.31, y + r * 0.04, r * 0.06, '#fff'); D.circle(ctx, x + r * 0.41, y + r * 0.04, r * 0.06, '#fff');
    }
    D.circle(ctx, x, y + r * 0.42, r * 0.13, '#ff8fb1');
    ctx.fillStyle = 'rgba(255,140,170,.5)';
    ctx.beginPath(); ctx.arc(x - r * 0.62, y + r * 0.45, r * 0.16, 0, Math.PI * 2); ctx.arc(x + r * 0.62, y + r * 0.45, r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath(); ctx.moveTo(x - r * 0.18, y + r * 0.62); ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 0.18, y + r * 0.62); ctx.stroke();
  }
  View3D.drawBunnyFace = drawBunnyFace;

  View3D.prototype.headlights = function (ctx, pts, tl, camLat, cab) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var a = null, b = null;
    for (var j = 0; j < N; j++) { if (pts[j].d > 30) { if (!a) a = pts[j]; if (pts[j].d > 1000) { b = pts[j]; break; } } }
    if (a && b) {
      var g = ctx.createLinearGradient(0, a.sy, 0, b.sy);
      g.addColorStop(0, 'rgba(255,240,180,.28)'); g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a.sx + (tl - 60) * a.s, a.sy); ctx.lineTo(a.sx + (tl + 60) * a.s, a.sy);
      ctx.lineTo(b.sx + (tl + 160) * b.s, b.sy); ctx.lineTo(b.sx + (tl - 160) * b.s, b.sy); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  // ------------------------------------------------------------ FPP cab interior with the bunny driver
  View3D.prototype.cabInterior = function (ctx, v, g, tl) {
    var W = v.W, H = v.H, tr = g.truck, P = CT.Truck.paintColors(), t = g.t;
    var steer = D.clamp(-tr.laneV * 1.1 - this.curvature(g.level.road, tr.x + 600) * 900, -0.9, 0.9) + Math.sin(t * 1.3) * 0.02;
    // roof + sun visors
    ctx.fillStyle = '#2b303b'; ctx.fillRect(0, 0, W, H * 0.07);
    ctx.fillStyle = '#3b4250';
    D.rr(ctx, W * 0.1, H * 0.04, W * 0.28, H * 0.07, 10); ctx.fill();
    D.rr(ctx, W * 0.62, H * 0.04, W * 0.28, H * 0.07, 10); ctx.fill();
    // A-pillars
    ctx.fillStyle = '#2b303b';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.075, 0); ctx.lineTo(W * 0.125, H * 0.7); ctx.lineTo(0, H * 0.74); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W * 0.925, 0); ctx.lineTo(W * 0.875, H * 0.7); ctx.lineTo(W, H * 0.74); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.dark;
    ctx.beginPath(); ctx.moveTo(W * 0.06, 0); ctx.lineTo(W * 0.075, 0); ctx.lineTo(W * 0.125, H * 0.7); ctx.lineTo(W * 0.11, H * 0.7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W * 0.94, 0); ctx.lineTo(W * 0.925, 0); ctx.lineTo(W * 0.875, H * 0.7); ctx.lineTo(W * 0.89, H * 0.7); ctx.closePath(); ctx.fill();
    // side mirrors (outside, rear view)
    this.sideMirror(ctx, W * 0.012, H * 0.26, W * 0.085, H * 0.22, g, 1);
    this.sideMirror(ctx, W * 0.903, H * 0.26, W * 0.085, H * 0.22, g, 0);
    // interior rear-view mirror with the bunny's reflection
    var mw = Math.min(W * 0.24, 300), mh = mw * 0.32, mx = W / 2 - mw / 2, my = H * 0.075;
    ctx.fillStyle = '#1d1f25'; ctx.fillRect(W / 2 - 4, 0, 8, my + 4);
    D.box(ctx, mx - 5, my - 5, mw + 10, mh + 10, 14, '#1d1f25');
    ctx.save(); D.rr(ctx, mx, my, mw, mh, 10); ctx.clip();
    var ig = ctx.createLinearGradient(0, my, 0, my + mh); ig.addColorStop(0, '#5d6676'); ig.addColorStop(1, '#3b4250');
    ctx.fillStyle = ig; ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#9fd0f2'; ctx.fillRect(mx + mw * 0.08, my + mh * 0.12, mw * 0.84, mh * 0.34);   // rear window
    drawBunnyFace(ctx, mx + mw * 0.66, my + mh * 0.72, mh * 0.3, t, P);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(mx + mw * 0.1, my); ctx.lineTo(mx + mw * 0.25, my); ctx.lineTo(mx + mw * 0.12, my + mh); ctx.lineTo(mx - mw * 0.03, my + mh); ctx.closePath(); ctx.fill();
    ctx.restore();
    // little pine air freshener swinging
    var sw = Math.sin(t * 2.2) * 0.25 - steer * 0.3;
    ctx.save(); ctx.translate(mx + mw * 0.2, my + mh + 4); ctx.rotate(sw);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, mh * 0.5); ctx.stroke();
    ctx.fillStyle = '#2fae4f'; ctx.beginPath(); ctx.moveTo(0, mh * 0.45); ctx.lineTo(-mh * 0.18, mh * 0.95); ctx.lineTo(mh * 0.18, mh * 0.95); ctx.closePath(); ctx.fill();
    ctx.restore();

    // dashboard
    var dy = H * 0.72;
    var dg = ctx.createLinearGradient(0, dy, 0, H); dg.addColorStop(0, '#3a404c'); dg.addColorStop(1, '#16181d');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.moveTo(0, dy + H * 0.04); ctx.quadraticCurveTo(W * 0.5, dy - H * 0.03, W, dy + H * 0.04); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, dy + H * 0.04); ctx.quadraticCurveTo(W * 0.5, dy - H * 0.03, W, dy + H * 0.04); ctx.stroke();
    // gauges behind the wheel
    var gx = W * 0.33, gy = H * 0.83, gr = Math.min(H * 0.085, W * 0.06);
    var kmh = Math.abs(CT.Garage.kmh(tr.v));
    this.gauge(ctx, gx - gr * 1.15, gy, gr, kmh / 300, Math.round(kmh), 'km/h');
    var rpm = 0.15 + 0.75 * (tr.throttle * 0.6 + (Math.abs(tr.v) / tr.cfg.maxSpeed) * 0.4);
    this.gauge(ctx, gx + gr * 1.15, gy, gr, rpm, (rpm * 4).toFixed(1), 'x1000');
    // centre screen: cargo condition + lane indicator
    var cx = W * 0.62, cy = H * 0.8, cw = Math.min(W * 0.16, 200), chh = H * 0.1;
    D.box(ctx, cx, cy, cw, chh, 8, '#0d1a2b', '#000', 2);
    ctx.fillStyle = '#7fd0ff'; ctx.font = '800 ' + Math.round(chh * 0.2) + 'px Nunito, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('CARGO ' + Math.round(g.health) + '%', cx + 10, cy + 8);
    D.box(ctx, cx + 10, cy + chh * 0.45, cw - 20, chh * 0.16, 4, '#1f3550');
    D.box(ctx, cx + 10, cy + chh * 0.45, (cw - 20) * g.health / 100, chh * 0.16, 4, g.health > 60 ? '#35d55a' : g.health > 30 ? '#ffc21a' : '#ff4b3e');
    var blink = Math.floor(t * 4) % 2 === 0 && Math.abs(tr.laneT - tr.lane) > 0.02;
    ctx.fillStyle = blink ? '#35d55a' : '#2a3a4f';
    var ay = cy + chh * 0.82;
    if (tr.lane === 1) { ctx.beginPath(); ctx.moveTo(cx + 14, ay); ctx.lineTo(cx + 26, ay - 7); ctx.lineTo(cx + 26, ay + 7); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(cx + cw - 14, ay); ctx.lineTo(cx + cw - 26, ay - 7); ctx.lineTo(cx + cw - 26, ay + 7); ctx.fill(); }
    // steering wheel + bunny paws
    var wx = W * 0.33, wy = H * 1.02, wr = Math.min(H * 0.3, W * 0.2);
    ctx.save(); ctx.translate(wx, wy); ctx.rotate(steer);
    ctx.strokeStyle = '#111317'; ctx.lineWidth = wr * 0.2; ctx.beginPath(); ctx.arc(0, 0, wr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = wr * 0.13; ctx.beginPath(); ctx.arc(0, 0, wr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = wr * 0.03; ctx.beginPath(); ctx.arc(0, 0, wr * 0.96, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = '#22252c'; ctx.lineWidth = wr * 0.12;
    ctx.beginPath(); ctx.moveTo(-wr, 0); ctx.lineTo(wr, 0); ctx.moveTo(0, 0); ctx.lineTo(0, wr); ctx.stroke();
    D.circle(ctx, 0, 0, wr * 0.26, '#2b2f38', '#111317', wr * 0.04);
    drawBunnyFace(ctx, 0, -wr * 0.02, wr * 0.11, 0.5, P);
    // paws gripping at 10 and 2 o'clock
    [-1, 1].forEach(function (sd) {
      var an = -Math.PI / 2 + sd * 0.95, px = Math.cos(an) * wr, py = Math.sin(an) * wr;
      ctx.save(); ctx.translate(px, py); ctx.rotate(an + Math.PI / 2);
      ctx.fillStyle = '#3d7fe0'; ctx.strokeStyle = INK; ctx.lineWidth = wr * 0.025;
      ctx.beginPath(); ctx.ellipse(0, wr * 0.32, wr * 0.16, wr * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();      // sleeve
      ctx.fillStyle = BUNNY;
      ctx.beginPath(); ctx.ellipse(0, 0, wr * 0.17, wr * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3c8';
      [-0.08, 0, 0.08].forEach(function (k) { ctx.beginPath(); ctx.arc(k * wr, -wr * 0.08, wr * 0.03, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore();
    });
    ctx.restore();
  };

  View3D.prototype.gauge = function (ctx, x, y, r, frac, label, unit) {
    D.circle(ctx, x, y, r * 1.08, '#0d0f13');
    D.circle(ctx, x, y, r, '#1a2230', '#5a6273', 2);
    var a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 2;
    for (var i = 0; i <= 10; i++) {
      var a = a0 + (a1 - a0) * i / 10;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); ctx.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); ctx.stroke();
    }
    ctx.strokeStyle = '#ff4b3e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r * 0.86, a0 + (a1 - a0) * 0.8, a1); ctx.stroke();
    var an = a0 + (a1 - a0) * D.clamp(frac, 0, 1);
    ctx.strokeStyle = '#ff9a1f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * r * 0.8, y + Math.sin(an) * r * 0.8); ctx.stroke();
    D.circle(ctx, x, y, r * 0.1, '#ff9a1f');
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = Math.round(r * 0.34) + 'px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(label, x, y + r * 0.42);
    ctx.fillStyle = '#9aa6bb'; ctx.font = '800 ' + Math.round(r * 0.17) + 'px Nunito, sans-serif'; ctx.fillText(unit, x, y + r * 0.68);
  };

  /** Outside mirror: a tiny rear view of the lane on that side. side 1 = left lane, 0 = right lane. */
  View3D.prototype.sideMirror = function (ctx, x, y, w, h, g, side) {
    var th = g.world.theme, tr = g.truck;
    D.box(ctx, x - 4, y - 4, w + 8, h + 8, 12, '#2b303b', INK, 2);
    ctx.save(); D.rr(ctx, x, y, w, h, 9); ctx.clip();
    var hz = y + h * 0.42;
    ctx.fillStyle = th.sky[1]; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = th.grass[0]; ctx.fillRect(x, hz, w, h);
    var vx = side === 1 ? x + w * 0.62 : x + w * 0.38;
    ctx.fillStyle = th.road[0];
    ctx.beginPath(); ctx.moveTo(vx - w * 0.04, hz); ctx.lineTo(vx + w * 0.04, hz); ctx.lineTo(vx + w * 0.9, y + h); ctx.lineTo(vx - w * 0.9, y + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(vx, hz); ctx.lineTo(vx + (side === 1 ? w * 0.3 : -w * 0.3), y + h); ctx.stroke(); ctx.setLineDash([]);
    // truck body edge
    ctx.fillStyle = CT.Truck.paintColors().body;
    if (side === 1) ctx.fillRect(x + w * 0.82, y, w * 0.2, h); else ctx.fillRect(x - w * 0.02, y, w * 0.2, h);
    // cars behind
    if (g.traffic) {
      var rear = tr.x + CT.Truck.REAR;
      g.traffic.cars.forEach(function (c) {
        var dist = rear - (c.x + c.len / 2);
        if (dist < 20 || dist > 1500) return;
        var k = 60 / (dist + 60);
        var laneOff = (c.lane === 1 ? -1 : 1) * (side === 1 ? -1 : 1);
        var cx = vx + laneOff * w * 0.35 * k * 2.2, cw = w * 0.9 * k * 1.6;
        var cyb = hz + (h * 0.58) * Math.min(1, k * 2.2);
        D.box(ctx, cx - cw / 2, cyb - cw * 0.6, cw, cw * 0.6, 3, c.color, INK, 1);
        D.circle(ctx, cx - cw * 0.32, cyb - cw * 0.22, cw * 0.08, '#fff7c2');
        D.circle(ctx, cx + cw * 0.32, cyb - cw * 0.22, cw * 0.08, '#fff7c2');
      });
    }
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + w * 0.1, y, w * 0.12, h);
    ctx.restore();
  };

  CT.View3D = View3D;
})(window.CT);
