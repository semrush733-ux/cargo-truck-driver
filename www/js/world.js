/* world.js — side-view scenery: themed sky, parallax backgrounds, roadside props, depot + delivery hub,
   terrain-following road with lanes, traffic-light poles, curve and bump signs, delivery zone. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;
  var ROAD_TOP = -42, ROAD_BOTTOM = 58;
  var LANE_Y = [0, -34];          // wheel contact line for lane 0 (near) and lane 1 (far)

  var THEMES = {
    country: { sky: ['#4aa8ec', '#9ad7fb', '#d9f2ff'], sun: '#fff3b0', far: '#a9cde8', farHaze: 'rgba(225,242,255,.65)', hill: '#8fd06f', hillDot: '#7cc25e',
               verge: ['#86cc63', '#6fb94f'], grass: ['#76c653', '#4e9b3b'], tuft: '#3f8a2f', trees: ['tree', 'tree', 'pine', 'bush'], fog: '#d9f2ff', road: ['#565a66', '#474b56'] },
    city:    { sky: ['#5aa6e0', '#a7d3f2', '#e2f1fb'], sun: '#fff3b0', far: '#9db2c9', farHaze: 'rgba(226,241,251,.55)', hill: '#7f93ab', hillDot: '#6d8199', skyline: true,
               verge: ['#c9ccd3', '#b4b8c1'], grass: ['#8fc46e', '#5f9a48'], tuft: '#4f8a3a', trees: ['tree', 'house', 'house', 'bush'], fog: '#e2f1fb', road: ['#4f535e', '#41444e'] },
    desert:  { sky: ['#f0a35e', '#fbd29b', '#ffeccc'], sun: '#fff1c9', far: '#e2a76c', farHaze: 'rgba(255,236,204,.55)', hill: '#e8c27f', hillDot: '#d9ae66',
               verge: ['#ebcb8c', '#dcb56d'], grass: ['#e8c47c', '#c99b50'], tuft: '#a8803a', trees: ['cactus', 'cactus', 'rock', 'palm'], fog: '#ffeccc', road: ['#6a625a', '#59524b'] },
    snow:    { sky: ['#8fb9e0', '#cfe3f4', '#f2f8fd'], sun: '#ffffff', far: '#c4d7ea', farHaze: 'rgba(242,248,253,.7)', hill: '#eef4fa', hillDot: '#c9dceb',
               verge: ['#f4f8fc', '#e2eaf3'], grass: ['#f2f7fb', '#cfdbe7'], tuft: '#9fb4c7', trees: ['snowpine', 'snowpine', 'snowpine', 'bush'], fog: '#f2f8fd', snow: true, road: ['#5d6370', '#4c515d'] },
    night:   { sky: ['#071028', '#14254d', '#2e4677'], sun: '#f4f1d8', far: '#1e2f52', farHaze: 'rgba(46,70,119,.5)', hill: '#1d3b3a', hillDot: '#163130', moon: true, skyline: true,
               verge: ['#2c5233', '#22432a'], grass: ['#2b5a2e', '#1b3c1f'], tuft: '#1a3a1d', trees: ['tree', 'house', 'pine', 'bush'], fog: '#2e4677', night: true, road: ['#3c404a', '#30333c'] }
  };

  function World(level) {
    this.level = level;
    this.road = level.road;
    this.theme = THEMES[level.theme] || THEMES.country;
    var pts = (level.road.terrain && level.road.terrain.length) ? level.road.terrain : [{ x: level.road.start, y: 0 }, { x: level.road.end, y: 0 }];
    this.terrainPts = pts;
    var self = this;
    this.heightAt = function (x) { return self._height(x); };
    this.props = [];
    this.tufts = [];
    this.clouds = [];
    this.starsBg = [];
    this._build();
  }

  World.ROAD_TOP = ROAD_TOP;
  World.ROAD_BOTTOM = ROAD_BOTTOM;
  World.LANE_Y = LANE_Y;
  World.THEMES = THEMES;

  World.prototype._height = function (x) {
    var p = this.terrainPts;
    if (x <= p[0].x) return p[0].y;
    for (var i = 1; i < p.length; i++) {
      if (x <= p[i].x) {
        var t = (x - p[i - 1].x) / (p[i].x - p[i - 1].x);
        t = t * t * (3 - 2 * t);                       // smooth hill tops and valleys
        return p[i - 1].y + (p[i].y - p[i - 1].y) * t;
      }
    }
    return p[p.length - 1].y;
  };

  World.prototype.curveAt = function (x) {
    var cs = this.road.curves;
    for (var i = 0; i < cs.length; i++) if (x >= cs[i].x1 && x <= cs[i].x2) return cs[i];
    return null;
  };

  World.prototype._build = function () {
    var L = this.level, rnd = D.rng(L.seed || 7), th = this.theme;
    var blocked = [
      [L.loadStation.building.x1 - 60, L.loadStation.building.x2 + 40],
      [L.destination.building.x1 - 40, L.destination.building.x2 + 80]
    ];
    (L.lights || []).forEach(function (l) { blocked.push([l.x - 160, l.x + 160]); });
    function free(x, pad) { pad = pad || 0; return !blocked.some(function (b) { return x > b[0] - pad && x < b[1] + pad; }); }
    var x, start = this.road.start - 900, end = this.road.end + 900;

    for (x = start; x < end; x += 170 + rnd() * 260) {
      if (!free(x, 40)) continue;
      var kind = th.trees[Math.floor(rnd() * th.trees.length)];
      this.props.push({ kind: kind, x: x, s: 0.8 + rnd() * 0.45, v: Math.floor(rnd() * 3), y: -64 - rnd() * 14, c: Math.floor(rnd() * 5) });
    }
    if (L.theme !== 'desert') {
      for (x = start; x < end; x += 900) {
        if (rnd() < 0.5) {
          var len = 300 + rnd() * 300;
          if (free(x) && free(x + len)) this.props.push({ kind: 'fence', x: x, len: len, y: -54 });
        }
      }
    }
    var lampGap = L.theme === 'city' || L.theme === 'night' ? 560 : 820;
    for (x = this.road.start + 300; x < this.road.end; x += lampGap) {
      if (free(x, 20)) this.props.push({ kind: 'lamp', x: x, y: -44 });
    }
    (L.signs || []).forEach(function (s) { this.props.push(Object.assign({ kind: 'sign', y: -44 }, s)); }, this);
    // automatic warning signs
    var kmh = function (v) { return Math.round(v * CT.Levels.METERS_PER_UNIT * 3.6 / 10) * 10; };
    (L.road.curves || []).forEach(function (c) {
      this.props.push({ kind: 'sign', style: 'curve', x: c.x1 - 650, y: -44, dir: c.dir, text: kmh(c.limit) });
    }, this);
    (L.obstacles || []).forEach(function (o) {
      if (o.type === 'bump') this.props.push({ kind: 'sign', style: 'bump', x: o.x - 520, y: -44, text: kmh(o.limit) });
    }, this);
    (L.lights || []).forEach(function (l) { this.props.push({ kind: 'signal', x: l.x + 40, y: -46, light: l }); }, this);
    if (L.traffic) this.props.push({ kind: 'sign', x: L.traffic.exitX, y: -44, text: 'EXIT', sub: 'Traffic only ↗', color: '#1f8a43', w: 210 });
    this.props.sort(function (a, b) { return a.y - b.y; });

    for (x = start; x < end; x += 40 + rnd() * 110) {
      this.tufts.push({ x: x, y: 82 + rnd() * 70, s: 0.7 + rnd() * 0.7, f: rnd() < 0.22 ? Math.floor(rnd() * 3) + 1 : 0, rock: rnd() < 0.06 });
    }
    for (var i = 0; i < 9; i++) this.clouds.push({ x: i * 520 + rnd() * 260, y: -620 + rnd() * 170, s: 0.7 + rnd() * 0.7 });
    for (i = 0; i < 90; i++) this.starsBg.push({ x: rnd(), y: rnd() * 0.6, r: 0.6 + rnd() * 1.6, p: rnd() * 6 });
  };

  // ------------------------------------------------------------- layer helpers
  function setLayer(ctx, view, f) {
    var s = view.scale * view.dpr;
    ctx.setTransform(s, 0, 0, s, view.dpr * (view.W / 2 - view.camX * f * view.scale + view.shakeX),
      view.dpr * (view.groundY + view.shakeY - (view.camY || 0) * f * view.scale));
  }
  World.setLayer = setLayer;

  function band(ctx, x0, x1, step, topFn, botFn) {
    ctx.beginPath();
    var x;
    for (x = x0; x <= x1 + step; x += step) ctx.lineTo(x, topFn(x));
    for (x = Math.floor((x1 + step - x0) / step) * step + x0; x >= x0; x -= step) ctx.lineTo(x, botFn(x));
    ctx.closePath();
  }
  World.band = band;

  // ------------------------------------------------------------- sky & far layers
  World.prototype.drawSky = function (ctx, view) {
    var th = this.theme;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, view.groundY);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.65, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, view.W, view.H);
    var t = view.t;
    if (th.night) {
      this.starsBg.forEach(function (s) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
        D.circle(ctx, s.x * view.W, s.y * view.groundY, s.r, '#ffffff');
      });
      ctx.globalAlpha = 1;
    }
    var sx = view.W * 0.86, sy = Math.max(70, view.groundY * 0.22), sr = 46 * view.scale + 18;
    if (th.moon) {
      var mg = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 2.6);
      mg.addColorStop(0, 'rgba(240,240,210,.35)'); mg.addColorStop(1, 'rgba(240,240,210,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(sx, sy, sr * 2.6, 0, Math.PI * 2); ctx.fill();
      D.circle(ctx, sx, sy, sr * 0.8, th.sun);
      D.circle(ctx, sx + sr * 0.32, sy - sr * 0.16, sr * 0.7, th.sky[0]);
    } else {
      var sg = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr * 3.2);
      sg.addColorStop(0, 'rgba(255,245,190,.9)'); sg.addColorStop(0.35, 'rgba(255,240,170,.35)'); sg.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr * 3.2, 0, Math.PI * 2); ctx.fill();
      D.circle(ctx, sx, sy, sr, th.sun);
    }

    if (!th.night) {
      setLayer(ctx, view, 0.08);
      var wrap = 9 * 520, base = view.camX * 0.08 + view.t * 9;
      var half = view.W / 2 / view.scale + 300;
      var cy = (view.camY || 0) * 0.08;
      this.clouds.forEach(function (c) {
        var cx = ((c.x - base) % wrap + wrap) % wrap - wrap / 2 + view.camX * 0.08;
        if (Math.abs(cx - view.camX * 0.08) > half) return;
        drawCloud(ctx, cx, c.y + cy, c.s, th.snow ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.95)');
      });
    }

    this.drawRange(ctx, view, 0.16, -150, function (x) { return 170 + 70 * Math.sin(x * 0.0019 + 1.3) + 45 * Math.sin(x * 0.0047) + 20 * Math.sin(x * 0.011); }, th.far, null, true);
    if (th.skyline) this.drawSkyline(ctx, view, 0.38);
    else this.drawRange(ctx, view, 0.38, -60, function (x) { return 95 + 40 * Math.sin(x * 0.0028 + 0.4) + 22 * Math.sin(x * 0.0071 + 2); }, th.hill, th.hillDot, false);
  };

  function drawCloud(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, 34 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x + 40 * s, y - 26 * s, 38 * s, Math.PI, Math.PI * 1.9);
    ctx.arc(x + 92 * s, y - 14 * s, 32 * s, Math.PI * 1.2, Math.PI * 2.1);
    ctx.arc(x + 120 * s, y + 4 * s, 30 * s, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(200,225,245,.5)';
    ctx.fillRect(x, y + 22 * s, 120 * s, 12 * s);
  }

  World.prototype.drawRange = function (ctx, view, f, baseY, fn, fill, detail, far) {
    setLayer(ctx, view, f);
    var half = view.W / 2 / view.scale + 40;
    var cx = view.camX * f, x0 = cx - half, x1 = cx + half;
    var bottom = baseY + 900;
    ctx.beginPath(); ctx.moveTo(x0, bottom);
    for (var x = x0; x <= x1 + 24; x += 24) ctx.lineTo(x, baseY - fn(x));
    ctx.lineTo(x1 + 24, bottom); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (far) {
      var hg = ctx.createLinearGradient(0, baseY - 260, 0, baseY + 120);
      hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(1, this.theme.farHaze);
      ctx.fillStyle = hg; ctx.fill();
      if (this.theme.snow) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath(); ctx.moveTo(x0, baseY - 260);
        for (x = x0; x <= x1 + 24; x += 24) ctx.lineTo(x, baseY - fn(x) + 26);
        ctx.lineTo(x1 + 24, baseY - 400); ctx.lineTo(x0, baseY - 400); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else if (detail) {
      ctx.fillStyle = detail;
      var step = 140;
      for (x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        var yy = baseY - fn(x) + 8, k = (Math.sin(x * 12.9898) * 43758.5453) % 1;
        if (k < 0.15 && k > -0.15) continue;
        ctx.beginPath(); ctx.arc(x, yy, 13, 0, Math.PI * 2); ctx.arc(x + 16, yy + 4, 10, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  World.prototype.drawSkyline = function (ctx, view, f) {
    setLayer(ctx, view, f);
    var th = this.theme, half = view.W / 2 / view.scale + 60;
    var cx = view.camX * f, x0 = Math.floor((cx - half) / 90) * 90, x1 = cx + half;
    ctx.fillStyle = th.hill; ctx.fillRect(cx - half, -70, half * 2, 900);
    for (var x = x0; x <= x1; x += 90) {
      var k = Math.abs(Math.sin(x * 0.0173) * 1000) % 1, k2 = Math.abs(Math.sin(x * 0.091) * 1000) % 1;
      var h = 120 + k * 260, w = 70 + k2 * 30;
      ctx.fillStyle = k2 > 0.5 ? th.hill : th.hillDot;
      ctx.fillRect(x, -60 - h, w, h + 10);
      ctx.fillStyle = th.night ? 'rgba(255,214,120,.75)' : 'rgba(255,255,255,.28)';
      for (var wy = -60 - h + 16; wy < -80; wy += 26) {
        for (var wx = x + 10; wx < x + w - 14; wx += 18) {
          var on = Math.abs(Math.sin(wx * 3.1 + wy * 7.7)) > (th.night ? 0.45 : 0.3);
          if (on) ctx.fillRect(wx, wy, 8, 12);
        }
      }
    }
  };

  // ------------------------------------------------------------- main layer (behind road)
  World.prototype.drawVerge = function (ctx, view) {
    setLayer(ctx, view, 1);
    var H = this.heightAt, half = view.W / 2 / view.scale + 80, x0 = view.camX - half, x1 = view.camX + half;
    var g = ctx.createLinearGradient(0, (view.camY || 0) - 120, 0, (view.camY || 0) + ROAD_TOP);
    g.addColorStop(0, this.theme.verge[0]); g.addColorStop(1, this.theme.verge[1]);
    ctx.fillStyle = g;
    band(ctx, x0, x1, 40, function (x) { return H(x) - 110; }, function (x) { return H(x) + ROAD_TOP + 2; });
    ctx.fill();
  };

  World.prototype.drawProps = function (ctx, view) {
    setLayer(ctx, view, 1);
    var half = view.W / 2 / view.scale + 260;
    var cam = view.camX, self = this, H = this.heightAt, th = this.theme;
    this.props.forEach(function (p) {
      if (p.x + (p.len || 0) < cam - half || p.x > cam + half) return;
      var q = Object.assign({}, p, { y: p.y + H(p.x) });
      switch (p.kind) {
        case 'tree': drawTree(ctx, q); break;
        case 'pine': drawPine(ctx, q, false); break;
        case 'snowpine': drawPine(ctx, q, true); break;
        case 'bush': drawBush(ctx, q.x, q.y, q.s, th.snow); break;
        case 'cactus': drawCactus(ctx, q); break;
        case 'rock': drawRock(ctx, q); break;
        case 'palm': drawPalm(ctx, q); break;
        case 'house': drawHouse(ctx, q, th.night); break;
        case 'fence': drawFence(ctx, q, H); break;
        case 'lamp': drawLamp(ctx, q, th.night); break;
        case 'sign': self.drawSign(ctx, q); break;
        case 'signal': drawSignal(ctx, q, view.lt || 0); break;
      }
    });
  };

  function drawTree(ctx, p) {
    var s = p.s, x = p.x, y = p.y;
    var cols = [['#3f9c3a', '#5cbf4a', '#2f7d2c'], ['#4aa63c', '#6ccb50', '#347f2a'], ['#5aa83a', '#86cf55', '#3e8a2a']][p.v];
    D.box(ctx, x - 9 * s, y - 70 * s, 18 * s, 72 * s, 4, '#8a5a2b', INK, 3);
    ctx.fillStyle = cols[2]; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    var blobs = [[-32, -92, 34], [30, -96, 36], [0, -132, 44]];
    blobs.forEach(function (b) { ctx.beginPath(); ctx.arc(x + b[0] * s, y + b[1] * s, b[2] * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = cols[0];
    ctx.beginPath(); blobs.forEach(function (b) { ctx.moveTo(x + (b[0] + b[2] - 3) * s, y + b[1] * s); ctx.arc(x + b[0] * s, y + b[1] * s, (b[2] - 3) * s, 0, Math.PI * 2); }); ctx.fill();
    ctx.fillStyle = cols[1];
    ctx.beginPath(); ctx.arc(x - 12 * s, y - 146 * s, 18 * s, 0, Math.PI * 2); ctx.arc(x - 40 * s, y - 102 * s, 12 * s, 0, Math.PI * 2); ctx.arc(x + 22 * s, y - 108 * s, 14 * s, 0, Math.PI * 2); ctx.fill();
  }

  function drawPine(ctx, p, snowy) {
    var s = p.s, x = p.x, y = p.y;
    D.box(ctx, x - 7 * s, y - 34 * s, 14 * s, 36 * s, 3, '#7a4c22', INK, 3);
    var layers = [[y - 30 * s, 62], [y - 70 * s, 50], [y - 106 * s, 38]];
    layers.forEach(function (l, i) {
      ctx.beginPath(); ctx.moveTo(x - l[1] * s, l[0]); ctx.lineTo(x, l[0] - 70 * s); ctx.lineTo(x + l[1] * s, l[0]); ctx.closePath();
      ctx.fillStyle = snowy ? '#2c6b48' : (i === 2 ? '#3b9a48' : '#2f8040'); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      if (snowy) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(x - l[1] * 0.55 * s, l[0] - 30 * s); ctx.lineTo(x, l[0] - 70 * s); ctx.lineTo(x + l[1] * 0.55 * s, l[0] - 30 * s);
        ctx.quadraticCurveTo(x, l[0] - 22 * s, x - l[1] * 0.55 * s, l[0] - 30 * s); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(160,230,140,.35)';
        ctx.beginPath(); ctx.moveTo(x - 6 * s, l[0] - 8 * s); ctx.lineTo(x, l[0] - 62 * s); ctx.lineTo(x - l[1] * 0.55 * s, l[0] - 8 * s); ctx.closePath(); ctx.fill();
      }
    });
  }

  function drawBush(ctx, x, y, s, snowy) {
    ctx.fillStyle = snowy ? '#5b8a6a' : '#3f9c3a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x - 22 * s, y - 14 * s, 20 * s, Math.PI, 0); ctx.arc(x + 4 * s, y - 24 * s, 24 * s, Math.PI, 0); ctx.arc(x + 30 * s, y - 12 * s, 18 * s, Math.PI, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = snowy ? '#ffffff' : '#62c450'; ctx.beginPath(); ctx.arc(x - 2 * s, y - 38 * s, 12 * s, Math.PI, 0); ctx.fill();
  }

  function drawCactus(ctx, p) {
    var s = p.s, x = p.x, y = p.y;
    ctx.fillStyle = '#4c9a4a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    D.rr(ctx, x - 12 * s, y - 120 * s, 24 * s, 122 * s, 12 * s); ctx.fill(); ctx.stroke();
    D.rr(ctx, x - 44 * s, y - 92 * s, 18 * s, 50 * s, 9 * s); ctx.fill(); ctx.stroke();
    D.rr(ctx, x - 44 * s, y - 52 * s, 40 * s, 16 * s, 8 * s); ctx.fill(); ctx.stroke();
    D.rr(ctx, x + 26 * s, y - 104 * s, 18 * s, 44 * s, 9 * s); ctx.fill(); ctx.stroke();
    D.rr(ctx, x + 6 * s, y - 70 * s, 38 * s, 16 * s, 8 * s); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 110 * s); ctx.lineTo(x - 4 * s, y - 10 * s); ctx.stroke();
  }
  function drawRock(ctx, p) {
    var s = p.s, x = p.x, y = p.y;
    ctx.fillStyle = '#b98a5a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 50 * s, y); ctx.lineTo(x - 38 * s, y - 34 * s); ctx.lineTo(x - 6 * s, y - 52 * s); ctx.lineTo(x + 30 * s, y - 40 * s); ctx.lineTo(x + 52 * s, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.moveTo(x - 36 * s, y - 30 * s); ctx.lineTo(x - 6 * s, y - 48 * s); ctx.lineTo(x - 10 * s, y - 30 * s); ctx.closePath(); ctx.fill();
  }
  function drawPalm(ctx, p) {
    var s = p.s, x = p.x, y = p.y;
    ctx.strokeStyle = INK; ctx.lineWidth = 16 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10 * s, y - 80 * s, x + 24 * s, y - 160 * s); ctx.stroke();
    ctx.strokeStyle = '#a0743f'; ctx.lineWidth = 10 * s; ctx.stroke();
    ctx.fillStyle = '#3f9c3a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + (i - 2.5) * 0.55;
      ctx.beginPath(); ctx.moveTo(x + 24 * s, y - 160 * s);
      ctx.quadraticCurveTo(x + 24 * s + Math.cos(a - 0.4) * 60 * s, y - 160 * s + Math.sin(a - 0.4) * 60 * s, x + 24 * s + Math.cos(a) * 90 * s, y - 150 * s + Math.sin(a) * 50 * s + 30 * s);
      ctx.quadraticCurveTo(x + 24 * s + Math.cos(a + 0.3) * 50 * s, y - 160 * s + Math.sin(a + 0.3) * 30 * s, x + 24 * s, y - 160 * s);
      ctx.fill(); ctx.stroke();
    }
  }
  function drawHouse(ctx, p, night) {
    var s = p.s, x = p.x, y = p.y;
    var walls = ['#e9a46b', '#8fb8de', '#e6d17a', '#c99ad6', '#9ccf9a'];
    var w = 150 * s, h = 120 * s;
    D.box(ctx, x - w / 2, y - h, w, h, 4, walls[p.c], INK, 3);
    ctx.fillStyle = '#b5473b'; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 12 * s, y - h); ctx.lineTo(x, y - h - 60 * s); ctx.lineTo(x + w / 2 + 12 * s, y - h); ctx.closePath(); ctx.fill(); ctx.stroke();
    var win = night ? '#ffd56a' : '#9fd6f7';
    D.box(ctx, x - w / 2 + 16 * s, y - h + 22 * s, 36 * s, 30 * s, 3, win, INK, 2.5);
    D.box(ctx, x + w / 2 - 52 * s, y - h + 22 * s, 36 * s, 30 * s, 3, win, INK, 2.5);
    D.box(ctx, x - 16 * s, y - 56 * s, 32 * s, 56 * s, 3, '#7a4c22', INK, 2.5);
  }

  function drawFence(ctx, p, H) {
    ctx.fillStyle = '#c98a4a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    var y0 = H(p.x) + p.y - (p.y + H(p.x)) + p.y;   // base y handled per post below
    for (var r = 0; r < 2; r++) {
      var off = r ? -18 : -36;
      ctx.beginPath();
      for (var x = p.x; x <= p.x + p.len; x += 20) ctx.lineTo(x, H(x) - 54 + off);
      for (x = p.x + p.len; x >= p.x; x -= 20) ctx.lineTo(x, H(x) - 54 + off + 7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (x = p.x; x <= p.x + p.len; x += 46) {
      var y = H(x) - 54;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 6, y - 44); ctx.lineTo(x, y - 52); ctx.lineTo(x + 6, y - 44); ctx.lineTo(x + 6, y); ctx.closePath();
      ctx.fillStyle = '#e0a25e'; ctx.fill(); ctx.stroke();
    }
    return y0;
  }

  function drawLamp(ctx, p, night) {
    var x = p.x, y = p.y;
    if (night) {
      var g = ctx.createRadialGradient(x + 58, y - 312, 4, x + 58, y - 312, 70);
      g.addColorStop(0, 'rgba(255,230,150,.9)'); g.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 58, y - 312, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,150,.13)';
      ctx.beginPath(); ctx.moveTo(x + 44, y - 306); ctx.lineTo(x + 72, y - 306); ctx.lineTo(x + 170, y + 60); ctx.lineTo(x - 50, y + 60); ctx.closePath(); ctx.fill();
    }
    D.box(ctx, x - 6, y - 300, 12, 302, 4, '#59606e', INK, 3);
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - 290); ctx.quadraticCurveTo(x + 6, y - 318, x + 50, y - 318); ctx.stroke();
    ctx.strokeStyle = '#59606e'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, y - 290); ctx.quadraticCurveTo(x + 6, y - 318, x + 50, y - 318); ctx.stroke();
    D.box(ctx, x + 36, y - 324, 44, 14, 6, '#3a3f4a', INK, 3);
    D.box(ctx, x + 42, y - 312, 32, 7, 3, night ? '#fff2b0' : '#fff6c2');
    D.box(ctx, x - 14, y - 10, 28, 12, 3, '#59606e', INK, 3);
  }

  function drawSignal(ctx, p, t) {
    var l = p.light, x = p.x, y = p.y;
    var st = CT.Traffic ? CT.Traffic.lightState(l, t) : 'green';
    D.box(ctx, x - 6, y - 250, 12, 252, 4, '#3b4250', INK, 3);
    D.box(ctx, x - 22, y - 330, 44, 108, 10, '#2b303b', INK, 4);
    var cols = { red: '#ff3b2f', yellow: '#ffc21a', green: '#2fe05a' };
    ['red', 'yellow', 'green'].forEach(function (c, i) {
      var on = st === c, cy = y - 306 + i * 32;
      if (on) {
        var g = ctx.createRadialGradient(x, cy, 4, x, cy, 40);
        g.addColorStop(0, cols[c]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, 40, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      D.circle(ctx, x, cy, 11, on ? cols[c] : '#454b57', INK, 2);
    });
    D.box(ctx, x - 16, y - 8, 32, 10, 3, '#3b4250', INK, 2);
  }

  World.prototype.drawSign = function (ctx, p) {
    var x = p.x, y = p.y;
    D.box(ctx, x - 5, y - 150, 10, 152, 3, '#9aa3b2', INK, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (p.style === 'warning' || p.style === 'curve' || p.style === 'bump') {
      ctx.save(); ctx.translate(x, y - 196); ctx.rotate(Math.PI / 4);
      D.box(ctx, -42, -42, 84, 84, 8, '#ffc21a', INK, 4);
      ctx.restore();
      ctx.fillStyle = INK; ctx.strokeStyle = INK;
      if (p.style === 'curve') {
        ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var d = p.dir;
        ctx.beginPath(); ctx.moveTo(x - 10 * d, y - 168); ctx.lineTo(x - 10 * d, y - 196); ctx.quadraticCurveTo(x - 10 * d, y - 216, x + 12 * d, y - 220); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 4 * d, y - 230); ctx.lineTo(x + 18 * d, y - 220); ctx.lineTo(x + 4 * d, y - 210); ctx.stroke();
      } else if (p.style === 'bump') {
        ctx.beginPath(); ctx.moveTo(x - 26, y - 184); ctx.quadraticCurveTo(x, y - 222, x + 26, y - 184); ctx.closePath(); ctx.fill();
      } else {
        ctx.font = '22px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(p.text, x, y - 200);
        ctx.font = '800 13px Nunito, sans-serif'; ctx.fillText(p.sub || '', x, y - 178);
      }
      if (p.style !== 'warning') {
        D.box(ctx, x - 34, y - 140, 68, 30, 6, '#ffffff', INK, 3);
        ctx.fillStyle = INK; ctx.font = '20px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(p.text, x, y - 124);
      }
      return;
    }
    if (p.style === 'speed') {
      D.circle(ctx, x, y - 190, 44, '#fff', '#d8352d', 10);
      ctx.beginPath(); ctx.arc(x, y - 190, 49, 0, Math.PI * 2); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = INK; ctx.font = '30px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(p.text, x, y - 188);
      return;
    }
    var w = p.w || 230;
    D.box(ctx, x - w / 2, y - 238, w, 92, 12, p.color || '#1f8a43', INK, 4);
    D.rr(ctx, x - w / 2 + 6, y - 232, w - 12, 80, 8); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '26px "Lilita One", "Arial Black", sans-serif';
    ctx.fillText(p.text, x, y - 208);
    ctx.font = '800 20px Nunito, "Segoe UI", sans-serif';
    ctx.fillText(p.sub || '', x, y - 175);
  };

  // ------------------------------------------------------------- stations
  function drawWarehouse(ctx, st, t, night) {
    var b = st.building, x1 = b.x1, x2 = b.x2, base = -46, top = base - b.height;
    var w = x2 - x1;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x1 + 10, base - 4, w, 8);
    D.box(ctx, x1, top, w, b.height, 6, b.wall, INK, 5);
    ctx.save(); D.rr(ctx, x1, top, w, b.height, 6); ctx.clip();
    ctx.strokeStyle = b.wallLine; ctx.lineWidth = 3;
    ctx.beginPath(); for (var x = x1 + 14; x < x2; x += 20) { ctx.moveTo(x, top); ctx.lineTo(x, base); } ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x1, base - 40, w, 40);
    ctx.restore();
    D.box(ctx, x1 - 14, top - 26, w + 28, 32, 6, b.roof, INK, 5);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x1 - 8, top - 22, w + 16, 6);
    var doorL = st.door.x - st.door.w / 2 - 30, doorR = st.door.x + st.door.w / 2 + 30;
    for (x = x1 + 40; x < x2 - 70; x += 120) {
      if (x + 70 > doorL && x < doorR) continue;
      if (b.signX && x + 70 > b.signX - b.signW / 2 - 10 && x < b.signX + b.signW / 2 + 10) continue;
      D.box(ctx, x, top + 50, 70, 46, 5, night ? '#ffd56a' : '#9fd6f7', INK, 4);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + 8, top + 56, 12, 34);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 35, top + 50); ctx.lineTo(x + 35, top + 96); ctx.stroke();
    }
    var d = st.door, dx1 = d.x - d.w / 2, dTop = base - d.h;
    D.box(ctx, dx1 - 10, dTop - 12, d.w + 20, d.h + 12, 6, '#5d6676', INK, 5);
    D.box(ctx, dx1, dTop, d.w, d.h, 3, '#252a35');
    ctx.save(); D.rr(ctx, dx1, dTop, d.w, d.h, 3); ctx.clip();
    var ig = ctx.createLinearGradient(0, dTop, 0, base); ig.addColorStop(0, '#1a1e27'); ig.addColorStop(1, night ? '#5a5030' : '#3a4150');
    ctx.fillStyle = ig; ctx.fillRect(dx1, dTop, d.w, d.h);
    ctx.fillStyle = '#4a5262';
    for (var sy = dTop + 70; sy < base - 10; sy += 60) ctx.fillRect(dx1, sy, d.w, 6);
    var rr = D.rng(Math.floor(d.x));
    for (sy = dTop + 70; sy < base - 10; sy += 60) {
      for (var sx = dx1 + 10; sx < dx1 + d.w - 40; sx += 44 + rr() * 20) {
        var bw = 30 + rr() * 14, bh = 22 + rr() * 22;
        ctx.fillStyle = rr() < 0.5 ? '#8a6440' : '#7a5636'; ctx.fillRect(sx, sy - bh, bw, bh);
      }
    }
    ctx.fillStyle = '#9aa3b2'; ctx.fillRect(dx1, dTop, d.w, 46);
    ctx.strokeStyle = '#6c7584'; ctx.lineWidth = 3;
    for (sy = dTop + 8; sy < dTop + 46; sy += 9) { ctx.beginPath(); ctx.moveTo(dx1, sy); ctx.lineTo(dx1 + d.w, sy); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(dx1 - 10, dTop - 12, 10, d.h + 12); ctx.rect(dx1 + d.w, dTop - 12, 10, d.h + 12); ctx.clip();
    ctx.fillStyle = '#ffc21a'; ctx.fillRect(dx1 - 10, dTop - 12, d.w + 20, d.h + 12);
    ctx.fillStyle = INK; for (sy = dTop - 30; sy < base; sy += 26) { ctx.beginPath(); ctx.moveTo(dx1 - 12, sy); ctx.lineTo(dx1 + d.w + 12, sy); ctx.lineTo(dx1 + d.w + 12, sy + 12); ctx.lineTo(dx1 - 12, sy + 12); ctx.fill(); }
    ctx.restore();
    if (b.sign) {
      var sw = b.signW, sxc = b.signX, syy = top + 26;
      D.box(ctx, sxc - sw / 2, syy, sw, 62, 12, b.signColor, INK, 5);
      D.rr(ctx, sxc - sw / 2 + 6, syy + 6, sw - 12, 50, 8); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '34px "Lilita One", "Arial Black", sans-serif';
      ctx.fillText(b.sign, sxc, syy + 33);
    }
    if (b.flags) {
      b.flags.forEach(function (fx, i) {
        ctx.strokeStyle = INK; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(fx, top - 26); ctx.lineTo(fx, top - 120); ctx.stroke();
        ctx.fillStyle = i % 2 ? '#f7901e' : '#35b54a';
        ctx.beginPath(); ctx.moveTo(fx, top - 118);
        for (var k = 0; k <= 6; k++) ctx.lineTo(fx + k * 9, top - 118 + Math.sin(t * 6 + k * 0.8 + i) * 4);
        for (k = 6; k >= 0; k--) ctx.lineTo(fx + k * 9, top - 86 + Math.sin(t * 6 + k * 0.8 + i) * 4);
        ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      });
    }
  }

  function drawDock(ctx, st) {
    var dk = st.dock, x1 = dk.x - dk.w / 2, top = dk.top, base = -46;
    D.box(ctx, x1, top, dk.w, base - top + 4, 4, '#b9bec8', INK, 5);
    ctx.fillStyle = '#9aa0ab'; ctx.fillRect(x1 + 4, top + 16, dk.w - 8, base - top - 12);
    ctx.save(); ctx.beginPath(); ctx.rect(x1 + 3, top + 3, dk.w - 6, 12); ctx.clip();
    ctx.fillStyle = '#ffc21a'; ctx.fillRect(x1, top, dk.w, 16);
    ctx.fillStyle = INK; for (var x = x1 - 20; x < x1 + dk.w; x += 26) { ctx.beginPath(); ctx.moveTo(x, top + 16); ctx.lineTo(x + 12, top); ctx.lineTo(x + 24, top); ctx.lineTo(x + 12, top + 16); ctx.fill(); }
    ctx.restore();
    [x1 + 30, x1 + dk.w - 50].forEach(function (bx) { D.box(ctx, bx, top + 22, 20, 30, 4, '#1d1d22'); });
    st.dockSlots.forEach(function (s, i) {
      D.box(ctx, s.x - 56, s.y, 112, 10, 2, '#b8783e', INK, 3);
      ctx.fillStyle = '#8a5528'; ctx.fillRect(s.x - 50, s.y + 3, 14, 5); ctx.fillRect(s.x - 7, s.y + 3, 14, 5); ctx.fillRect(s.x + 36, s.y + 3, 14, 5);
      // stock waiting in the warehouse
      var cols = ['#d49a5e', '#c8894a', '#d8a066'];
      for (var r = 0; r < 2 - (i % 2); r++) {
        D.box(ctx, s.x - 48 + r * 8, s.y - 40 - r * 40, 96 - r * 16, 40, 3, cols[(i + r) % 3], INK, 3);
        ctx.fillStyle = 'rgba(120,70,20,.35)'; ctx.fillRect(s.x - 6 + r * 0, s.y - 40 - r * 40, 12, 40);
      }
    });
  }

  World.prototype.drawStations = function (ctx, view) {
    setLayer(ctx, view, 1);
    var half = view.W / 2 / view.scale + 400, night = !!this.theme.night;
    var L = this.level;
    [L.loadStation, L.destination].forEach(function (st) {
      if (st.building.x2 < view.camX - half || st.building.x1 > view.camX + half) return;
      drawWarehouse(ctx, st, view.t, night);
      drawDock(ctx, st);
    });
  };

  // ------------------------------------------------------------- road
  function quad(ctx, H, xa, xb, ya, yb) {
    ctx.beginPath();
    ctx.moveTo(xa, H(xa) + ya); ctx.lineTo(xb, H(xb) + ya); ctx.lineTo(xb, H(xb) + yb); ctx.lineTo(xa, H(xa) + yb); ctx.closePath();
  }
  World.quad = quad;

  World.prototype.drawRoad = function (ctx, view, zoneState) {
    setLayer(ctx, view, 1);
    var H = this.heightAt, th = this.theme;
    var half = view.W / 2 / view.scale + 60, x0 = view.camX - half, x1 = view.camX + half;
    var L = this.level, x, st;
    // far kerb
    ctx.fillStyle = '#d3d6dc';
    band(ctx, x0, x1, 40, function (x) { return H(x) + ROAD_TOP - 8; }, function (x) { return H(x) + ROAD_TOP + 2; }); ctx.fill();
    // asphalt
    var g = ctx.createLinearGradient(0, (view.camY || 0) + ROAD_TOP, 0, (view.camY || 0) + ROAD_BOTTOM);
    g.addColorStop(0, th.road[0]); g.addColorStop(1, th.road[1]);
    ctx.fillStyle = g;
    band(ctx, x0, x1, 40, function (x) { return H(x) + ROAD_TOP + 2; }, function (x) { return H(x) + ROAD_BOTTOM; }); ctx.fill();
    // speckles
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    st = Math.floor(x0 / 37) * 37;
    for (x = st; x < x1; x += 37) {
      var k = Math.abs(Math.sin(x * 0.731) * 1000) % 1;
      ctx.fillRect(x, H(x) + ROAD_TOP + 10 + k * 80, 5, 3);
    }
    // lane divider dashes
    ctx.fillStyle = '#f2f2f2';
    st = Math.floor(x0 / 130) * 130;
    for (x = st; x < x1; x += 130) {
      if (x > L.road.start && x < L.road.end) { quad(ctx, H, x, x + 70, -20, -14); ctx.fill(); }
    }
    // near edge line
    ctx.fillStyle = '#ffd34a';
    band(ctx, Math.max(x0, L.road.start), Math.min(x1, L.road.end), 40, function (x) { return H(x) + ROAD_BOTTOM - 14; }, function (x) { return H(x) + ROAD_BOTTOM - 9; }); ctx.fill();

    // loading bay
    var lb = L.loadStation.bay;
    if (lb.x2 > x0 && lb.x1 < x1) {
      ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 6;
      ctx.strokeRect(lb.x1, ROAD_TOP + 10, lb.x2 - lb.x1, ROAD_BOTTOM - ROAD_TOP - 26);
      ctx.save(); ctx.beginPath(); ctx.rect(lb.x1, ROAD_TOP + 10, lb.x2 - lb.x1, ROAD_BOTTOM - ROAD_TOP - 26); ctx.clip();
      ctx.strokeStyle = 'rgba(255,211,74,.28)'; ctx.lineWidth = 10;
      for (x = lb.x1 - 100; x < lb.x2 + 100; x += 40) { ctx.beginPath(); ctx.moveTo(x, ROAD_BOTTOM); ctx.lineTo(x + 80, ROAD_TOP); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '22px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LOADING BAY', lb.x2 - 110, ROAD_BOTTOM - 30);
    }

    // traffic-light stop lines + zebra crossings
    (L.lights || []).forEach(function (l) {
      if (l.x < x0 - 200 || l.x > x1 + 200) return;
      var sl = l.x - 60;
      ctx.fillStyle = '#ffffff'; quad(ctx, H, sl - 10, sl + 4, ROAD_TOP + 4, ROAD_BOTTOM - 6); ctx.fill();
      for (var zx = sl + 20; zx < sl + 120; zx += 22) { ctx.fillStyle = 'rgba(255,255,255,.75)'; quad(ctx, H, zx, zx + 12, ROAD_TOP + 6, ROAD_BOTTOM - 8); ctx.fill(); }
    });
    // speed bumps
    (L.obstacles || []).forEach(function (o) {
      if (o.type !== 'bump' || o.x < x0 - 50 || o.x > x1 + 50) return;
      var y = H(o.x);
      ctx.fillStyle = '#ffc21a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(o.x - 22, y + ROAD_BOTTOM - 4); ctx.quadraticCurveTo(o.x, y + ROAD_BOTTOM - 22, o.x + 22, y + ROAD_BOTTOM - 4); ctx.lineTo(o.x + 22, y + ROAD_TOP + 2); ctx.lineTo(o.x - 22, y + ROAD_TOP + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = INK; for (var by = y + ROAD_TOP + 8; by < y + ROAD_BOTTOM - 10; by += 18) ctx.fillRect(o.x - 22, by, 44, 8);
    });

    // delivery zone
    var z = L.destination.zone;
    if (z.x2 > x0 && z.x1 < x1) {
      var pulse = 0.5 + 0.5 * Math.sin(view.t * 5);
      var inside = zoneState && zoneState.inside, ok = zoneState && zoneState.ready;
      ctx.fillStyle = ok ? 'rgba(80,230,100,' + (0.45 + pulse * 0.2) + ')' : inside ? 'rgba(80,220,100,.4)' : 'rgba(60,200,90,' + (0.22 + pulse * 0.12) + ')';
      ctx.fillRect(z.x1, ROAD_TOP + 4, z.x2 - z.x1, ROAD_BOTTOM - ROAD_TOP - 8);
      ctx.save(); ctx.beginPath(); ctx.rect(z.x1, ROAD_TOP + 4, z.x2 - z.x1, ROAD_BOTTOM - ROAD_TOP - 8); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 10;
      for (x = z.x1 + 30; x < z.x2; x += 70) { ctx.beginPath(); ctx.moveTo(x, ROAD_TOP + 8); ctx.lineTo(x + 26, 8); ctx.lineTo(x, ROAD_BOTTOM - 8); ctx.stroke(); }
      ctx.restore();
      [z.x1, z.x2].forEach(function (lx) {
        for (var yy = ROAD_TOP + 4; yy < ROAD_BOTTOM - 4; yy += 16) {
          ctx.fillStyle = ((yy - ROAD_TOP) / 16) % 2 < 1 ? '#ffffff' : '#35b54a';
          ctx.fillRect(lx - 6, yy, 12, 16);
        }
      });
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '26px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DELIVERY ZONE', (z.x1 + z.x2) / 2, ROAD_BOTTOM - 26);
    }
    [L.road.start, L.road.end].forEach(function (bx) {
      if (bx < x0 - 100 || bx > x1 + 100) return;
      drawBarrier(ctx, bx, H(bx));
    });
  };

  function drawBarrier(ctx, x, h) {
    ctx.save(); ctx.translate(0, h);
    D.box(ctx, x - 70, -60, 10, 110, 3, '#e8e8ea', INK, 3);
    D.box(ctx, x + 60, -60, 10, 110, 3, '#e8e8ea', INK, 3);
    ctx.save(); D.rr(ctx, x - 90, -80, 180, 30, 6); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 90, -80, 180, 30);
    ctx.fillStyle = '#e2382f';
    for (var i = -6; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x - 90 + i * 28, -50); ctx.lineTo(x - 76 + i * 28, -80); ctx.lineTo(x - 62 + i * 28, -80); ctx.lineTo(x - 76 + i * 28, -50); ctx.fill(); }
    ctx.restore();
    D.rr(ctx, x - 90, -80, 180, 30, 6); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
    D.circle(ctx, x - 70, -88, 8, '#ff9a1f', INK, 3);
    D.circle(ctx, x + 70, -88, 8, '#ff9a1f', INK, 3);
    ctx.restore();
  }

  // ------------------------------------------------------------- foreground
  World.prototype.drawForeground = function (ctx, view) {
    setLayer(ctx, view, 1);
    var H = this.heightAt, th = this.theme;
    var half = view.W / 2 / view.scale + 80, x0 = view.camX - half, x1 = view.camX + half;
    ctx.fillStyle = '#c9ccd3';
    band(ctx, x0, x1, 40, function (x) { return H(x) + ROAD_BOTTOM; }, function (x) { return H(x) + ROAD_BOTTOM + 14; }); ctx.fill();
    ctx.fillStyle = '#9da2ad';
    band(ctx, x0, x1, 40, function (x) { return H(x) + ROAD_BOTTOM + 12; }, function (x) { return H(x) + ROAD_BOTTOM + 16; }); ctx.fill();
    var g = ctx.createLinearGradient(0, (view.camY || 0) + ROAD_BOTTOM, 0, (view.camY || 0) + ROAD_BOTTOM + 300);
    g.addColorStop(0, th.grass[0]); g.addColorStop(1, th.grass[1]);
    ctx.fillStyle = g;
    band(ctx, x0, x1, 40, function (x) { return H(x) + ROAD_BOTTOM + 16; }, function (x) { return H(x) + ROAD_BOTTOM + 1600; }); ctx.fill();
    this.tufts.forEach(function (tf) {
      if (tf.x < x0 || tf.x > x1) return;
      var s = tf.s, y = tf.y + H(tf.x);
      if (tf.rock) { ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.ellipse(tf.x, y, 18 * s, 10 * s, 0, Math.PI, 0); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); return; }
      ctx.strokeStyle = th.tuft; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tf.x, y); ctx.quadraticCurveTo(tf.x - 4 * s, y - 14 * s, tf.x - 12 * s, y - 20 * s);
      ctx.moveTo(tf.x, y); ctx.quadraticCurveTo(tf.x + 1 * s, y - 16 * s, tf.x + 2 * s, y - 26 * s);
      ctx.moveTo(tf.x, y); ctx.quadraticCurveTo(tf.x + 6 * s, y - 12 * s, tf.x + 14 * s, y - 18 * s);
      ctx.stroke();
      if (tf.f && !th.snow && !th.night) {
        var c = ['#ffffff', '#ffd34a', '#ff7aa8'][tf.f - 1];
        for (var i = 0; i < 5; i++) { var a = i * Math.PI * 0.4; D.circle(ctx, tf.x + 2 * s + Math.cos(a) * 5 * s, y - 28 * s + Math.sin(a) * 5 * s, 4 * s, c); }
        D.circle(ctx, tf.x + 2 * s, y - 28 * s, 3.5 * s, '#f7901e');
      }
    });
  };

  /** Screen-space weather / darkness on top of the side view. */
  World.prototype.drawWeather = function (ctx, view) {
    var th = this.theme;
    if (!th.snow) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    var t = view.t, W = view.W, Hh = view.H, drift = view.camX * view.scale * 0.6;
    for (var i = 0; i < 70; i++) {
      var sx = ((i * 137.5 + t * (20 + (i % 5) * 8) * 2 - drift) % W + W) % W;
      var sy = ((i * 89.3 + t * (40 + (i % 7) * 10)) % Hh + Hh) % Hh;
      ctx.beginPath(); ctx.arc(sx, sy, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }
  };

  // ------------------------------------------------------------- guidance
  World.prototype.drawGuide = function (ctx, view, state) {
    setLayer(ctx, view, 1);
    var z = this.level.destination.zone, cx = (z.x1 + z.x2) / 2;
    if (!state.show) return;
    var bob = Math.sin(view.t * 4) * 12;
    var y = -300 + bob + this.heightAt(cx);
    ctx.save(); ctx.translate(cx, y);
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    if (state.ready) {
      D.circle(ctx, 0, 0, 44, '#35b54a', INK, 6);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-18, 2); ctx.lineTo(-4, 16); ctx.lineTo(20, -14); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-24, -54); ctx.lineTo(24, -54); ctx.lineTo(24, 0); ctx.lineTo(48, 0); ctx.lineTo(0, 50); ctx.lineTo(-48, 0); ctx.lineTo(-24, 0); ctx.closePath();
      ctx.fillStyle = '#35b54a'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-16, -46, 8, 44);
    }
    ctx.restore();
    if (state.ready) return;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.font = '30px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText('STOP HERE', cx, y - 78); ctx.fillText('STOP HERE', cx, y - 78);
  };

  CT.World = World;
})(window.CT);
