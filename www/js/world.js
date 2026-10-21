/* world.js — scenery: sky, parallax hills, roadside props, depot + delivery hub, road, delivery zone. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;
  var ROAD_TOP = -42, ROAD_BOTTOM = 58;

  function World(level) {
    this.level = level;
    this.road = level.road;
    var pts = (level.road.terrain && level.road.terrain.length) ? level.road.terrain : [{ x: level.road.start, y: 0 }, { x: level.road.end, y: 0 }];
    this.terrainPts = pts;
    var self = this;
    this.heightAt = function (x) { return self._height(x); };
    this.props = [];
    this.tufts = [];
    this.clouds = [];
    this._build();
  }

  World.ROAD_TOP = ROAD_TOP;
  World.ROAD_BOTTOM = ROAD_BOTTOM;

  World.prototype._height = function (x) {
    var p = this.terrainPts;
    if (x <= p[0].x) return p[0].y;
    for (var i = 1; i < p.length; i++) {
      if (x <= p[i].x) { var t = (x - p[i - 1].x) / (p[i].x - p[i - 1].x); return p[i - 1].y + (p[i].y - p[i - 1].y) * t; }
    }
    return p[p.length - 1].y;
  };

  World.prototype._build = function () {
    var L = this.level, rnd = D.rng(L.seed || 7);
    var blocked = [
      [L.loadStation.building.x1 - 60, L.loadStation.building.x2 + 40],
      [L.destination.building.x1 - 40, L.destination.building.x2 + 80]
    ];
    function free(x, pad) { pad = pad || 0; return !blocked.some(function (b) { return x > b[0] - pad && x < b[1] + pad; }); }
    var x, start = this.road.start - 900, end = this.road.end + 900;

    // trees + bushes behind the road
    for (x = start; x < end; x += 170 + rnd() * 260) {
      if (!free(x, 40)) continue;
      var r = rnd();
      if (r < 0.55) this.props.push({ kind: 'tree', x: x, s: 0.8 + rnd() * 0.45, v: Math.floor(rnd() * 3), y: -64 - rnd() * 14 });
      else if (r < 0.8) this.props.push({ kind: 'pine', x: x, s: 0.75 + rnd() * 0.5, y: -62 - rnd() * 12 });
      else this.props.push({ kind: 'bush', x: x, s: 0.7 + rnd() * 0.5, y: -50 });
    }
    // fence runs
    for (x = start; x < end; x += 900) {
      if (rnd() < 0.6) {
        var len = 300 + rnd() * 300;
        if (free(x) && free(x + len)) this.props.push({ kind: 'fence', x: x, len: len, y: -54 });
      }
    }
    // street lamps
    for (x = this.road.start + 300; x < this.road.end; x += 820) {
      if (free(x, 20)) this.props.push({ kind: 'lamp', x: x, y: -44 });
    }
    // level-defined signs
    (L.signs || []).forEach(function (s) { this.props.push(Object.assign({ kind: 'sign', y: -44 }, s)); }, this);
    this.props.sort(function (a, b) { return a.y - b.y; });

    // foreground grass tufts + flowers
    for (x = start; x < end; x += 40 + rnd() * 110) {
      this.tufts.push({ x: x, y: 82 + rnd() * 70, s: 0.7 + rnd() * 0.7, f: rnd() < 0.22 ? Math.floor(rnd() * 3) + 1 : 0, rock: rnd() < 0.06 });
    }
    // clouds (parallax)
    for (var i = 0; i < 9; i++) this.clouds.push({ x: i * 520 + rnd() * 260, y: -620 + rnd() * 170, s: 0.7 + rnd() * 0.7 });
  };

  // ------------------------------------------------------------- layer helpers
  function setLayer(ctx, view, f) {
    var s = view.scale * view.dpr;
    ctx.setTransform(s, 0, 0, s, view.dpr * (view.W / 2 - view.camX * f * view.scale + view.shakeX), view.dpr * (view.groundY + view.shakeY));
  }
  World.setLayer = setLayer;

  // ------------------------------------------------------------- sky & far layers
  World.prototype.drawSky = function (ctx, view) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, view.groundY);
    g.addColorStop(0, '#4aa8ec'); g.addColorStop(0.65, '#9ad7fb'); g.addColorStop(1, '#d9f2ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, view.W, view.H);
    // sun
    var sx = view.W * 0.86, sy = Math.max(70, view.groundY * 0.22), sr = 46 * view.scale + 18;
    var sg = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr * 3.2);
    sg.addColorStop(0, 'rgba(255,245,190,.9)'); sg.addColorStop(0.35, 'rgba(255,240,170,.35)'); sg.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr * 3.2, 0, Math.PI * 2); ctx.fill();
    D.circle(ctx, sx, sy, sr, '#fff3b0');

    // clouds
    setLayer(ctx, view, 0.08);
    var wrap = 9 * 520, base = view.camX * 0.08 + view.t * 9;
    var half = view.W / 2 / view.scale + 300;
    this.clouds.forEach(function (c) {
      var cx = ((c.x - base) % wrap + wrap) % wrap - wrap / 2 + view.camX * 0.08;
      if (Math.abs(cx - view.camX * 0.08) > half) return;
      drawCloud(ctx, cx, c.y, c.s);
    });

    // far mountains
    this.drawRange(ctx, view, 0.16, -150, function (x) { return 170 + 70 * Math.sin(x * 0.0019 + 1.3) + 45 * Math.sin(x * 0.0047) + 20 * Math.sin(x * 0.011); }, '#a9cde8', '#c4def0', true);
    // rolling hills
    this.drawRange(ctx, view, 0.38, -60, function (x) { return 95 + 40 * Math.sin(x * 0.0028 + 0.4) + 22 * Math.sin(x * 0.0071 + 2); }, '#8fd06f', '#7cc25e', false);
  };

  function drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(x, y, 34 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x + 40 * s, y - 26 * s, 38 * s, Math.PI, Math.PI * 1.9);
    ctx.arc(x + 92 * s, y - 14 * s, 32 * s, Math.PI * 1.2, Math.PI * 2.1);
    ctx.arc(x + 120 * s, y + 4 * s, 30 * s, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(200,225,245,.6)';
    ctx.fillRect(x, y + 22 * s, 120 * s, 12 * s);
  }

  World.prototype.drawRange = function (ctx, view, f, baseY, fn, fill, detail, snow) {
    setLayer(ctx, view, f);
    var half = view.W / 2 / view.scale + 40;
    var cx = view.camX * f, x0 = cx - half, x1 = cx + half;
    ctx.beginPath(); ctx.moveTo(x0, ROAD_TOP + 2);
    for (var x = x0; x <= x1 + 24; x += 24) ctx.lineTo(x, baseY - fn(x));
    ctx.lineTo(x1 + 24, ROAD_TOP + 2); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (snow) {
      // soft haze toward the base of the far range
      var hg = ctx.createLinearGradient(0, baseY - 260, 0, ROAD_TOP);
      hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(225,242,255,.65)');
      ctx.fillStyle = hg; ctx.fill();
    } else {
      // tiny distant trees on the hill ridge
      ctx.fillStyle = detail;
      var step = 140;
      for (x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        var yy = baseY - fn(x) + 8, k = (Math.sin(x * 12.9898) * 43758.5453) % 1;
        if (k < 0.15 && k > -0.15) continue;
        ctx.beginPath(); ctx.arc(x, yy, 13, 0, Math.PI * 2); ctx.arc(x + 16, yy + 4, 10, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  // ------------------------------------------------------------- main layer (behind road)
  World.prototype.drawVerge = function (ctx, view) {
    setLayer(ctx, view, 1);
    var half = view.W / 2 / view.scale + 60, x0 = view.camX - half;
    var g = ctx.createLinearGradient(0, -90, 0, ROAD_TOP);
    g.addColorStop(0, '#86cc63'); g.addColorStop(1, '#6fb94f');
    ctx.fillStyle = g; ctx.fillRect(x0, -90, half * 2, ROAD_TOP + 92);
  };

  World.prototype.drawProps = function (ctx, view) {
    setLayer(ctx, view, 1);
    var half = view.W / 2 / view.scale + 260;
    var cam = view.camX;
    var self = this;
    this.props.forEach(function (p) {
      if (p.x + (p.len || 0) < cam - half || p.x > cam + half) return;
      switch (p.kind) {
        case 'tree': drawTree(ctx, p); break;
        case 'pine': drawPine(ctx, p); break;
        case 'bush': drawBush(ctx, p.x, p.y, p.s); break;
        case 'fence': drawFence(ctx, p); break;
        case 'lamp': drawLamp(ctx, p); break;
        case 'sign': self.drawSign(ctx, p); break;
      }
    });
  };

  function drawTree(ctx, p) {
    var s = p.s, x = p.x, y = p.y;
    var cols = [['#3f9c3a', '#5cbf4a', '#2f7d2c'], ['#4aa63c', '#6ccb50', '#347f2a'], ['#5aa83a', '#86cf55', '#3e8a2a']][p.v];
    D.box(ctx, x - 9 * s, y - 70 * s, 18 * s, 72 * s, 4, '#8a5a2b', INK, 3);
    ctx.fillStyle = cols[2]; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x - 32 * s, y - 92 * s, 34 * s, 0, Math.PI * 2);
    ctx.arc(x + 30 * s, y - 96 * s, 36 * s, 0, Math.PI * 2);
    ctx.arc(x, y - 132 * s, 44 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); ctx.arc(x - 32 * s, y - 92 * s, 34 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 30 * s, y - 96 * s, 36 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 132 * s, 44 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = cols[0];
    ctx.beginPath(); ctx.arc(x - 32 * s, y - 92 * s, 31 * s, 0, Math.PI * 2); ctx.arc(x + 30 * s, y - 96 * s, 33 * s, 0, Math.PI * 2); ctx.arc(x, y - 132 * s, 41 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cols[1];
    ctx.beginPath(); ctx.arc(x - 12 * s, y - 146 * s, 18 * s, 0, Math.PI * 2); ctx.arc(x - 40 * s, y - 102 * s, 12 * s, 0, Math.PI * 2); ctx.arc(x + 22 * s, y - 108 * s, 14 * s, 0, Math.PI * 2); ctx.fill();
  }

  function drawPine(ctx, p) {
    var s = p.s, x = p.x, y = p.y;
    D.box(ctx, x - 7 * s, y - 34 * s, 14 * s, 36 * s, 3, '#7a4c22', INK, 3);
    var layers = [[y - 30 * s, 62], [y - 70 * s, 50], [y - 106 * s, 38]];
    layers.forEach(function (l, i) {
      ctx.beginPath(); ctx.moveTo(x - l[1] * s, l[0]); ctx.lineTo(x, l[0] - 70 * s); ctx.lineTo(x + l[1] * s, l[0]); ctx.closePath();
      ctx.fillStyle = i === 2 ? '#3b9a48' : '#2f8040'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(160,230,140,.35)';
      ctx.beginPath(); ctx.moveTo(x - 6 * s, l[0] - 8 * s); ctx.lineTo(x, l[0] - 62 * s); ctx.lineTo(x - l[1] * 0.55 * s, l[0] - 8 * s); ctx.closePath(); ctx.fill();
    });
  }

  function drawBush(ctx, x, y, s) {
    ctx.fillStyle = '#3f9c3a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x - 22 * s, y - 14 * s, 20 * s, Math.PI, 0); ctx.arc(x + 4 * s, y - 24 * s, 24 * s, Math.PI, 0); ctx.arc(x + 30 * s, y - 12 * s, 18 * s, Math.PI, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#62c450'; ctx.beginPath(); ctx.arc(x - 2 * s, y - 34 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
  }

  function drawFence(ctx, p) {
    var y = p.y;
    ctx.fillStyle = '#c98a4a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.fillRect(p.x, y - 36, p.len, 7); ctx.strokeRect(p.x, y - 36, p.len, 7);
    ctx.fillRect(p.x, y - 18, p.len, 7); ctx.strokeRect(p.x, y - 18, p.len, 7);
    for (var x = p.x; x <= p.x + p.len; x += 46) {
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 6, y - 44); ctx.lineTo(x, y - 52); ctx.lineTo(x + 6, y - 44); ctx.lineTo(x + 6, y); ctx.closePath();
      ctx.fillStyle = '#e0a25e'; ctx.fill(); ctx.stroke();
    }
  }

  function drawLamp(ctx, p) {
    var x = p.x, y = p.y;
    D.box(ctx, x - 6, y - 300, 12, 302, 4, '#59606e', INK, 3);
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - 290); ctx.quadraticCurveTo(x + 6, y - 318, x + 50, y - 318); ctx.stroke();
    ctx.strokeStyle = '#59606e'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, y - 290); ctx.quadraticCurveTo(x + 6, y - 318, x + 50, y - 318); ctx.stroke();
    D.box(ctx, x + 36, y - 324, 44, 14, 6, '#3a3f4a', INK, 3);
    D.box(ctx, x + 42, y - 312, 32, 7, 3, '#fff6c2');
    D.box(ctx, x - 14, y - 10, 28, 12, 3, '#59606e', INK, 3);
  }

  World.prototype.drawSign = function (ctx, p) {
    var x = p.x, y = p.y;
    D.box(ctx, x - 5, y - 150, 10, 152, 3, '#9aa3b2', INK, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (p.style === 'warning') {
      ctx.save(); ctx.translate(x, y - 190);
      ctx.rotate(Math.PI / 4);
      D.box(ctx, -42, -42, 84, 84, 8, '#ffc21a', INK, 4);
      ctx.restore();
      ctx.fillStyle = INK; ctx.font = '22px "Lilita One", "Arial Black", sans-serif';
      ctx.fillText(p.text, x, y - 194);
      ctx.font = '800 13px Nunito, sans-serif'; ctx.fillText(p.sub || '', x, y - 172);
      return;
    }
    if (p.style === 'speed') {
      D.circle(ctx, x, y - 190, 44, '#fff', '#d8352d', 10);
      ctx.beginPath(); ctx.arc(x, y - 190, 49, 0, Math.PI * 2); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = INK; ctx.font = '34px "Lilita One", "Arial Black", sans-serif'; ctx.fillText(p.text, x, y - 188);
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
  function drawWarehouse(ctx, st, t) {
    var b = st.building, x1 = b.x1, x2 = b.x2, base = -46, top = base - b.height;
    var w = x2 - x1;
    ctx.lineJoin = 'round';
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x1 + 10, base - 4, w, 8);
    // walls
    D.box(ctx, x1, top, w, b.height, 6, b.wall, INK, 5);
    ctx.save(); D.rr(ctx, x1, top, w, b.height, 6); ctx.clip();
    ctx.strokeStyle = b.wallLine; ctx.lineWidth = 3;
    ctx.beginPath(); for (var x = x1 + 14; x < x2; x += 20) { ctx.moveTo(x, top); ctx.lineTo(x, base); } ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x1, base - 40, w, 40);
    ctx.restore();
    // roof cap
    D.box(ctx, x1 - 14, top - 26, w + 28, 32, 6, b.roof, INK, 5);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x1 - 8, top - 22, w + 16, 6);
    // windows
    var doorL = st.door.x - st.door.w / 2 - 30, doorR = st.door.x + st.door.w / 2 + 30;
    for (x = x1 + 40; x < x2 - 70; x += 120) {
      if (x + 70 > doorL && x < doorR) continue;
      if (b.signX && x + 70 > b.signX - b.signW / 2 - 10 && x < b.signX + b.signW / 2 + 10) continue;
      D.box(ctx, x, top + 50, 70, 46, 5, '#9fd6f7', INK, 4);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + 8, top + 56, 12, 34);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 35, top + 50); ctx.lineTo(x + 35, top + 96); ctx.stroke();
    }
    // loading door (open)
    var d = st.door, dx1 = d.x - d.w / 2, dTop = base - d.h;
    D.box(ctx, dx1 - 10, dTop - 12, d.w + 20, d.h + 12, 6, '#5d6676', INK, 5);
    D.box(ctx, dx1, dTop, d.w, d.h, 3, '#252a35');
    // inside: shelving with boxes
    ctx.save(); D.rr(ctx, dx1, dTop, d.w, d.h, 3); ctx.clip();
    var ig = ctx.createLinearGradient(0, dTop, 0, base); ig.addColorStop(0, '#1a1e27'); ig.addColorStop(1, '#3a4150');
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
    // roll-up door half open
    ctx.fillStyle = '#9aa3b2'; ctx.fillRect(dx1, dTop, d.w, 46);
    ctx.strokeStyle = '#6c7584'; ctx.lineWidth = 3;
    for (sy = dTop + 8; sy < dTop + 46; sy += 9) { ctx.beginPath(); ctx.moveTo(dx1, sy); ctx.lineTo(dx1 + d.w, sy); ctx.stroke(); }
    ctx.restore();
    // hazard frame
    ctx.save(); ctx.beginPath(); ctx.rect(dx1 - 10, dTop - 12, 10, d.h + 12); ctx.rect(dx1 + d.w, dTop - 12, 10, d.h + 12); ctx.clip();
    ctx.fillStyle = '#ffc21a'; ctx.fillRect(dx1 - 10, dTop - 12, d.w + 20, d.h + 12);
    ctx.fillStyle = INK; for (sy = dTop - 30; sy < base; sy += 26) { ctx.beginPath(); ctx.moveTo(dx1 - 12, sy); ctx.lineTo(dx1 + d.w + 12, sy + 0); ctx.lineTo(dx1 + d.w + 12, sy + 12); ctx.lineTo(dx1 - 12, sy + 12); ctx.fill(); }
    ctx.restore();
    // sign board
    if (b.sign) {
      var sw = b.signW, sxc = b.signX, syy = top + 26;
      D.box(ctx, sxc - sw / 2, syy, sw, 62, 12, b.signColor, INK, 5);
      D.rr(ctx, sxc - sw / 2 + 6, syy + 6, sw - 12, 50, 8); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '34px "Lilita One", "Arial Black", sans-serif';
      ctx.fillText(b.sign, sxc, syy + 33);
    }
    // roof flags
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
    // hazard edge
    ctx.save(); ctx.beginPath(); ctx.rect(x1 + 3, top + 3, dk.w - 6, 12); ctx.clip();
    ctx.fillStyle = '#ffc21a'; ctx.fillRect(x1, top, dk.w, 16);
    ctx.fillStyle = INK; for (var x = x1 - 20; x < x1 + dk.w; x += 26) { ctx.beginPath(); ctx.moveTo(x, top + 16); ctx.lineTo(x + 12, top); ctx.lineTo(x + 24, top); ctx.lineTo(x + 12, top + 16); ctx.fill(); }
    ctx.restore();
    // rubber bumpers
    [x1 + 30, x1 + dk.w - 50].forEach(function (bx) { D.box(ctx, bx, top + 22, 20, 30, 4, '#1d1d22'); });
    // pallets under box spots
    st.dockSlots.forEach(function (s) {
      D.box(ctx, s.x - 56, s.y, 112, 10, 2, '#b8783e', INK, 3);
      ctx.fillStyle = '#8a5528'; ctx.fillRect(s.x - 50, s.y + 3, 14, 5); ctx.fillRect(s.x - 7, s.y + 3, 14, 5); ctx.fillRect(s.x + 36, s.y + 3, 14, 5);
    });
  }

  World.prototype.drawStations = function (ctx, view) {
    setLayer(ctx, view, 1);
    var half = view.W / 2 / view.scale + 400;
    var L = this.level;
    [L.loadStation, L.destination].forEach(function (st) {
      if (st.building.x2 < view.camX - half || st.building.x1 > view.camX + half) return;
      drawWarehouse(ctx, st, view.t);
      drawDock(ctx, st);
    });
  };

  // ------------------------------------------------------------- road
  World.prototype.drawRoad = function (ctx, view, zoneState) {
    setLayer(ctx, view, 1);
    var half = view.W / 2 / view.scale + 60, x0 = view.camX - half, x1 = view.camX + half;
    var L = this.level;
    // far kerb / pavement
    ctx.fillStyle = '#d3d6dc'; ctx.fillRect(x0, ROAD_TOP - 8, x1 - x0, 10);
    ctx.fillStyle = '#aeb3bc'; ctx.fillRect(x0, ROAD_TOP, x1 - x0, 3);
    // asphalt
    var g = ctx.createLinearGradient(0, ROAD_TOP, 0, ROAD_BOTTOM);
    g.addColorStop(0, '#565a66'); g.addColorStop(1, '#474b56');
    ctx.fillStyle = g; ctx.fillRect(x0, ROAD_TOP + 2, x1 - x0, ROAD_BOTTOM - ROAD_TOP - 2);
    // speckles
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    var st = Math.floor(x0 / 37) * 37;
    for (var x = st; x < x1; x += 37) {
      var k = Math.abs(Math.sin(x * 0.731) * 1000) % 1;
      ctx.fillRect(x, ROAD_TOP + 10 + k * 80, 5, 3);
      ctx.fillRect(x + 17, ROAD_TOP + 20 + ((k * 7) % 1) * 70, 3, 3);
    }
    // centre dashes (behind the truck lane)
    ctx.fillStyle = '#f2f2f2';
    st = Math.floor(x0 / 130) * 130;
    for (x = st; x < x1; x += 130) {
      if (x > L.road.start && x < L.road.end) ctx.fillRect(x, -22, 70, 6);
    }
    // near edge line
    ctx.fillStyle = '#ffd34a'; ctx.fillRect(Math.max(x0, L.road.start), ROAD_BOTTOM - 14, Math.min(x1, L.road.end) - Math.max(x0, L.road.start), 5);

    // loading bay markings
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

    // delivery zone
    var z = L.destination.zone;
    if (z.x2 > x0 && z.x1 < x1) {
      var pulse = 0.5 + 0.5 * Math.sin(view.t * 5);
      var inside = zoneState && zoneState.inside, ok = zoneState && zoneState.ready;
      ctx.fillStyle = ok ? 'rgba(80,230,100,' + (0.45 + pulse * 0.2) + ')' : inside ? 'rgba(80,220,100,.4)' : 'rgba(60,200,90,' + (0.22 + pulse * 0.12) + ')';
      ctx.fillRect(z.x1, ROAD_TOP + 4, z.x2 - z.x1, ROAD_BOTTOM - ROAD_TOP - 8);
      // chevrons
      ctx.save(); ctx.beginPath(); ctx.rect(z.x1, ROAD_TOP + 4, z.x2 - z.x1, ROAD_BOTTOM - ROAD_TOP - 8); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 10;
      for (x = z.x1 + 30; x < z.x2; x += 70) { ctx.beginPath(); ctx.moveTo(x, ROAD_TOP + 8); ctx.lineTo(x + 26, 8); ctx.lineTo(x, ROAD_BOTTOM - 8); ctx.stroke(); }
      ctx.restore();
      // end lines
      [z.x1, z.x2].forEach(function (lx) {
        for (var yy = ROAD_TOP + 4; yy < ROAD_BOTTOM - 4; yy += 16) {
          ctx.fillStyle = ((yy - ROAD_TOP) / 16) % 2 < 1 ? '#ffffff' : '#35b54a';
          ctx.fillRect(lx - 6, yy, 12, 16);
        }
      });
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '26px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DELIVERY ZONE', (z.x1 + z.x2) / 2, ROAD_BOTTOM - 26);
    }

    // road-end barriers
    [L.road.start, L.road.end].forEach(function (bx) {
      if (bx < x0 - 100 || bx > x1 + 100) return;
      drawBarrier(ctx, bx);
    });
  };

  function drawBarrier(ctx, x) {
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
  }

  // ------------------------------------------------------------- foreground
  World.prototype.drawForeground = function (ctx, view) {
    setLayer(ctx, view, 1);
    var half = view.W / 2 / view.scale + 80, x0 = view.camX - half, x1 = view.camX + half;
    var bottom = (view.H - view.groundY) / view.scale + 20;
    // near kerb
    ctx.fillStyle = '#c9ccd3'; ctx.fillRect(x0, ROAD_BOTTOM, x1 - x0, 14);
    ctx.fillStyle = '#9da2ad'; ctx.fillRect(x0, ROAD_BOTTOM + 12, x1 - x0, 4);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (var x = Math.floor(x0 / 90) * 90; x < x1; x += 90) ctx.fillRect(x, ROAD_BOTTOM, 3, 14);
    // grass
    var g = ctx.createLinearGradient(0, ROAD_BOTTOM + 14, 0, Math.max(ROAD_BOTTOM + 60, bottom));
    g.addColorStop(0, '#76c653'); g.addColorStop(1, '#4e9b3b');
    ctx.fillStyle = g; ctx.fillRect(x0, ROAD_BOTTOM + 16, x1 - x0, Math.max(60, bottom - ROAD_BOTTOM));
    // tufts & flowers
    this.tufts.forEach(function (tf) {
      if (tf.x < x0 || tf.x > x1) return;
      var s = tf.s, y = tf.y;
      if (tf.rock) { ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.ellipse(tf.x, y, 18 * s, 10 * s, 0, Math.PI, 0); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); return; }
      ctx.strokeStyle = '#3f8a2f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tf.x, y); ctx.quadraticCurveTo(tf.x - 4 * s, y - 14 * s, tf.x - 12 * s, y - 20 * s);
      ctx.moveTo(tf.x, y); ctx.quadraticCurveTo(tf.x + 1 * s, y - 16 * s, tf.x + 2 * s, y - 26 * s);
      ctx.moveTo(tf.x, y); ctx.quadraticCurveTo(tf.x + 6 * s, y - 12 * s, tf.x + 14 * s, y - 18 * s);
      ctx.stroke();
      if (tf.f) {
        var c = ['#ffffff', '#ffd34a', '#ff7aa8'][tf.f - 1];
        for (var i = 0; i < 5; i++) { var a = i * Math.PI * 0.4; D.circle(ctx, tf.x + 2 * s + Math.cos(a) * 5 * s, y - 28 * s + Math.sin(a) * 5 * s, 4 * s, c); }
        D.circle(ctx, tf.x + 2 * s, y - 28 * s, 3.5 * s, '#f7901e');
      }
    });
  };

  // ------------------------------------------------------------- guidance
  World.prototype.drawGuide = function (ctx, view, state) {
    setLayer(ctx, view, 1);
    var z = this.level.destination.zone, cx = (z.x1 + z.x2) / 2;
    if (!state.show) return;
    var bob = Math.sin(view.t * 4) * 12;
    var y = -300 + bob;
    ctx.save(); ctx.translate(cx, y);
    ctx.fillStyle = state.ready ? '#35b54a' : '#ffffff';
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
