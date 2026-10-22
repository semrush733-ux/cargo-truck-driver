/* cargo.js — cargo items (9 kinds, mixed loads), counting, simple stable bed physics and artwork. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;
  var BOX_W = 320, BOX_H = 250;   // art units: every load fits this footprint on the bed

  var STATE = { DOCK: 'dock', CARRY: 'carry', TRUCK: 'truck', STORED: 'stored', FALLEN: 'fallen' };

  var TYPES = {
    // weight: slows acceleration and braking · sens: damage sensitivity (1 = normal)
    box:    { label: 'Boxes',          one: 'Box',          weight: 1, sens: 1.0, fragile: false },
    sacks:  { label: 'Rice sacks',     one: 'Rice sacks',   weight: 2, sens: 0.6, fragile: false },
    fruit:  { label: 'Fruit crates',   one: 'Fruit crate',  weight: 1, sens: 1.5, fragile: true },
    crate:  { label: 'Wooden crates',  one: 'Wooden crate', weight: 2, sens: 0.8, fragile: false },
    barrel: { label: 'Oil drums',      one: 'Oil drums',    weight: 2, sens: 0.9, fragile: false },
    gas:    { label: 'Gas cylinders',  one: 'Gas cylinders',weight: 2, sens: 1.4, fragile: true },
    glass:  { label: 'Glass panels',   one: 'Glass panels', weight: 1, sens: 2.2, fragile: true },
    fridge: { label: 'Fridges',        one: 'Fridge',       weight: 2, sens: 1.6, fragile: true },
    steel:  { label: 'Steel beams',    one: 'Steel beams',  weight: 3, sens: 0.4, fragile: false }
  };

  // ------------------------------------------------------------------ artwork (bottom-centre at cx, by)
  function outline(ctx, lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw || 6; ctx.stroke(); }

  function artBox(ctx, cx, by, v) {
    var P = [['#d49a5e', '#c0844a', '#e6b47c', '#c9894c'], ['#d8a066', '#c28a50', '#ebbd88', '#cb8f52'], ['#cf9558', '#ba7f45', '#e1ad74', '#c38647']][v % 3];
    var w = BOX_W, h = BOX_H, x = cx - w / 2, y = by - h;
    D.rr(ctx, x, y, w, h, 6); ctx.fillStyle = P[0]; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = P[1]; ctx.fillRect(x + w - 26, y, 26, h);
    ctx.fillStyle = P[2]; ctx.fillRect(x, y, w, 12);
    ctx.strokeStyle = 'rgba(120,70,20,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 22); ctx.lineTo(x + w, y + 22); ctx.stroke();
    ctx.fillStyle = P[3];
    ctx.beginPath(); ctx.moveTo(cx - 34, y); ctx.lineTo(cx + 34, y); ctx.lineTo(cx + 34, y + 56); ctx.lineTo(cx + 17, y + 46); ctx.lineTo(cx, y + 56); ctx.lineTo(cx - 17, y + 46); ctx.lineTo(cx - 34, y + 56); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,15,.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    [x + 34, x + 58].forEach(function (ax) { ctx.beginPath(); ctx.moveTo(ax, y + h - 30); ctx.lineTo(ax, y + h - 74); ctx.moveTo(ax - 9, y + h - 63); ctx.lineTo(ax, y + h - 75); ctx.lineTo(ax + 9, y + h - 63); ctx.stroke(); });
    ctx.fillStyle = 'rgba(255,248,232,.85)'; D.rr(ctx, x + w - 112, y + h - 72, 70, 44, 5); ctx.fill();
    ctx.restore();
    D.rr(ctx, x, y, w, h, 6); outline(ctx);
  }

  function artCrate(ctx, cx, by) {
    var w = BOX_W, h = BOX_H - 10, x = cx - w / 2, y = by - h;
    D.box(ctx, x, y, w, h, 4, '#c8894a', INK, 6);
    ctx.save(); D.rr(ctx, x, y, w, h, 4); ctx.clip();
    ctx.strokeStyle = 'rgba(110,60,20,.45)'; ctx.lineWidth = 4;
    for (var yy = y + 48; yy < by; yy += 48) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = 22; ctx.strokeStyle = '#a8692f';
    ctx.beginPath(); ctx.moveTo(x + 22, by - 18); ctx.lineTo(x + w - 22, y + 18); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    [[x, y, w, 22], [x, by - 22, w, 22], [x, y, 22, h], [x + w - 22, y, 22, h]].forEach(function (r) { D.box(ctx, r[0], r[1], r[2], r[3], 2, '#b5733a', INK, 4); });
    ctx.fillStyle = '#6b3b12'; [[x + 11, y + 11], [x + w - 11, y + 11], [x + 11, by - 11], [x + w - 11, by - 11]].forEach(function (p) { D.circle(ctx, p[0], p[1], 4, '#5a3412'); });
    ctx.fillStyle = 'rgba(60,30,10,.55)'; ctx.font = '30px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CARGO', cx, y + h * 0.3);
  }

  function artSacks(ctx, cx, by) {
    var sacks = [[-80, 0, 150, 110], [80, 0, 150, 110], [0, -100, 150, 110], [-75, -186, 130, 70]];
    sacks.forEach(function (s, i) {
      if (i === 3) return;
      var x = cx + s[0], y = by + s[1], w = s[2], h = s[3];
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 10, y); ctx.quadraticCurveTo(x - w / 2 - 6, y - h / 2, x - w / 2 + 12, y - h);
      ctx.quadraticCurveTo(x, y - h - 14, x + w / 2 - 12, y - h); ctx.quadraticCurveTo(x + w / 2 + 6, y - h / 2, x + w / 2 - 10, y);
      ctx.quadraticCurveTo(x, y + 8, x - w / 2 + 10, y); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#ead7ae' : '#e2cc9c'; ctx.fill(); outline(ctx, 5);
      ctx.strokeStyle = 'rgba(140,100,40,.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - w / 2 + 14, y - h + 10); ctx.quadraticCurveTo(x, y - h + 18, x + w / 2 - 14, y - h + 10); ctx.stroke();
      ctx.fillStyle = '#2f7d3a'; D.rr(ctx, x - 38, y - h / 2 - 16, 76, 30, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '20px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('RICE', x, y - h / 2 - 1);
    });
  }

  function artFruit(ctx, cx, by, v) {
    var fruitCol = ['#ff8c1a', '#e8322a', '#ffd21f'][v % 3];
    for (var row = 0; row < 2; row++) {
      var y = by - row * 118, x = cx - 150;
      // fruit peeking over each crate
      for (var f = 0; f < 6; f++) D.circle(ctx, x + 32 + f * 47, y - 98, 24, fruitCol, INK, 3);
      for (f = 0; f < 6; f++) D.circle(ctx, x + 24 + f * 47 + 2, y - 104, 6, 'rgba(255,255,255,.55)');
      D.box(ctx, x, y - 92, 300, 92, 4, '#e2b06a', INK, 5);
      ctx.fillStyle = '#c38d47'; ctx.fillRect(x + 6, y - 60, 288, 10); ctx.fillRect(x + 6, y - 30, 288, 10);
      D.box(ctx, x + 108, y - 80, 84, 34, 4, '#ffffff', INK, 3);
      ctx.fillStyle = '#e8322a'; ctx.font = '20px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FRESH', x + 150, y - 62);
    }
  }

  function artBarrel(ctx, cx, by, v) {
    var cols = [['#2f7fe0', '#1d5cb0'], ['#e23b30', '#a3201a'], ['#2fae4f', '#1f8338']][v % 3];
    [-78, 78].forEach(function (dx) {
      var x = cx + dx, w = 140, h = 240, y = by - h;
      var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, cols[1]); g.addColorStop(0.35, cols[0]); g.addColorStop(0.6, '#ffffff'); g.addColorStop(0.7, cols[0]); g.addColorStop(1, cols[1]);
      D.box(ctx, x - w / 2, y, w, h, 18, g, INK, 6);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6;
      [y + 60, y + 180].forEach(function (yy) { ctx.beginPath(); ctx.moveTo(x - w / 2 + 3, yy); ctx.lineTo(x + w / 2 - 3, yy); ctx.stroke(); });
      D.box(ctx, x - 40, y + 92, 80, 50, 6, '#ffd21f', INK, 3);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x, y + 98); ctx.lineTo(x + 18, y + 134); ctx.lineTo(x - 18, y + 134); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd21f'; ctx.fillRect(x - 3, y + 110, 6, 12); ctx.fillRect(x - 3, y + 126, 6, 5);
    });
  }

  function artGas(ctx, cx, by) {
    [-100, 0, 100].forEach(function (dx, i) {
      var x = cx + dx, w = 86, h = 230 - (i === 1 ? 0 : 10), y = by - h;
      var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, '#1f7a43'); g.addColorStop(0.4, '#35b54a'); g.addColorStop(0.55, '#a8f0b4'); g.addColorStop(1, '#1f7a43');
      ctx.beginPath(); ctx.moveTo(x - w / 2, by); ctx.lineTo(x - w / 2, y + 40); ctx.quadraticCurveTo(x - w / 2, y + 6, x, y + 6); ctx.quadraticCurveTo(x + w / 2, y + 6, x + w / 2, y + 40); ctx.lineTo(x + w / 2, by); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); outline(ctx, 5);
      D.box(ctx, x - 14, y - 16, 28, 26, 4, '#9aa3b2', INK, 4);
      D.box(ctx, x - 26, y + 70, 52, 60, 6, '#ffffff', INK, 3);
      ctx.fillStyle = '#e23b30'; ctx.font = '18px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GAS', x, y + 100);
    });
  }

  function artGlass(ctx, cx, by) {
    // A-frame stand with glass sheets
    ctx.strokeStyle = INK; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 140, by - 6); ctx.lineTo(cx - 20, by - 236); ctx.lineTo(cx + 20, by - 236); ctx.lineTo(cx + 140, by - 6); ctx.stroke();
    ctx.strokeStyle = '#d8352d'; ctx.lineWidth = 10; ctx.stroke();
    for (var i = 0; i < 3; i++) {
      var off = i * 14;
      ctx.beginPath(); ctx.moveTo(cx - 150 + off, by - 8); ctx.lineTo(cx - 40 + off, by - 230); ctx.lineTo(cx + 150 - off, by - 230); ctx.lineTo(cx + 150 - off, by - 8); ctx.closePath();
      ctx.fillStyle = 'rgba(160,215,245,.45)'; ctx.fill();
      ctx.strokeStyle = 'rgba(40,90,130,.8)'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx - 10, by - 200); ctx.lineTo(cx + 60, by - 60); ctx.moveTo(cx + 40, by - 210); ctx.lineTo(cx + 80, by - 130); ctx.stroke();
    D.box(ctx, cx - 160, by - 18, 320, 18, 4, '#6b4a2a', INK, 4);
    D.box(ctx, cx - 72, by - 120, 144, 40, 6, '#ffd21f', INK, 4);
    ctx.fillStyle = INK; ctx.font = '24px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FRAGILE', cx, by - 99);
  }

  function artFridge(ctx, cx, by) {
    var w = 190, h = BOX_H, x = cx - w / 2, y = by - h;
    var g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#dfe6ee'); g.addColorStop(0.3, '#ffffff'); g.addColorStop(1, '#c4cfdb');
    D.box(ctx, x, y, w, h, 16, g, INK, 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 4, y + 88); ctx.lineTo(x + w - 4, y + 88); ctx.stroke();
    D.box(ctx, x + w - 34, y + 22, 12, 48, 5, '#9aa3b2', INK, 3);
    D.box(ctx, x + w - 34, y + 108, 12, 70, 5, '#9aa3b2', INK, 3);
    D.box(ctx, x + 20, y + 120, 60, 36, 4, '#2f7fe0', INK, 3);
    ctx.fillStyle = '#fff'; ctx.font = '16px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A++', x + 50, y + 139);
    // cardboard corner protectors + straps
    ctx.fillStyle = '#c9894c';
    [[x - 6, y - 6], [x + w - 30, y - 6], [x - 6, by - 30], [x + w - 30, by - 30]].forEach(function (p) { ctx.fillRect(p[0], p[1], 36, 36); });
  }

  function artSteel(ctx, cx, by) {
    var rows = [[0, 3], [1, 3], [2, 2]];
    rows.forEach(function (r) {
      for (var k = 0; k < r[1]; k++) {
        var w = 300 / 3, x = cx - (r[1] * w) / 2 + k * w, y = by - (r[0] + 1) * 74;
        var g = ctx.createLinearGradient(0, y, 0, y + 70);
        g.addColorStop(0, '#e8ecf2'); g.addColorStop(0.45, '#9aa3b2'); g.addColorStop(1, '#6b7380');
        D.box(ctx, x + 3, y, w - 6, 70, 6, g, INK, 5);
        D.box(ctx, x + 20, y + 22, w - 40, 26, 4, '#5d6676', 'rgba(0,0,0,.5)', 2);
      }
    });
    ctx.strokeStyle = '#d8352d'; ctx.lineWidth = 10;
    [cx - 70, cx + 70].forEach(function (sx) { ctx.beginPath(); ctx.moveTo(sx, by - 228); ctx.lineTo(sx, by); ctx.stroke(); });
  }

  var ART = { box: artBox, crate: artCrate, sacks: artSacks, fruit: artFruit, barrel: artBarrel, gas: artGas, glass: artGlass, fridge: artFridge, steel: artSteel };

  function drawCargo(ctx, cx, by, opts) {
    opts = opts || {};
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    (ART[opts.type] || artBox)(ctx, cx, by, opts.variant || 0);
  }

  /** Cracks and dents once an item is damaged; a big red X when destroyed. */
  function drawDamage(ctx, health) {
    if (health > 70) return;
    var k = 1 - health / 70;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,20,10,' + (0.35 + 0.5 * k) + ')'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-90, -200); ctx.lineTo(-60, -150); ctx.lineTo(-80, -110); ctx.lineTo(-40, -70);
    if (k > 0.4) { ctx.moveTo(70, -230); ctx.lineTo(40, -180); ctx.lineTo(70, -140); ctx.moveTo(10, -60); ctx.lineTo(40, -30); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(60,40,20,' + 0.25 * k + ')'; ctx.fillRect(-160, -250, 320, 250);
    if (health <= 0) {
      ctx.strokeStyle = '#e2382f'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(-90, -200); ctx.lineTo(90, -40); ctx.moveTo(90, -200); ctx.lineTo(-90, -40); ctx.stroke();
    }
    ctx.restore();
  }

  function drawStrap(ctx, cx, progress) {
    if (progress <= 0) return;
    var top = CT.Truck.BED_TOP - BOX_H - 6, bottom = 558;
    var len = (bottom - top) * Math.min(1, progress);
    ctx.fillStyle = '#1e1e23';
    D.rr(ctx, cx - 15, top, 30, len, 5); ctx.fill();
    ctx.fillStyle = '#3b3b44'; ctx.fillRect(cx - 11, top + 4, 4, Math.max(0, len - 8));
    [430, 500].forEach(function (by) {
      if (top + len > by + 22) {
        D.box(ctx, cx - 24, by, 48, 26, 6, '#2c2c33', '#101013', 4);
        D.box(ctx, cx - 14, by + 7, 28, 12, 3, '#6d717b');
      }
    });
    if (progress >= 1) D.box(ctx, cx - 12, 546, 24, 18, 4, '#111114');
  }

  // ------------------------------------------------------------------ items + manager
  function Cargo(id, type, pallet) {
    var T = TYPES[type] || TYPES.box;
    this.id = id;
    this.type = type;
    this.weight = T.weight;
    this.fragile = T.fragile;
    this.sens = T.sens;
    this.name = T.one;
    this.health = 100;          // condition of this item, 0..100
    this.lost = false;          // fell off the truck (can be recovered unless destroyed)
    this.destroyed = false;     // broken beyond saving
    this.hop = 0; this.hopV = 0; this.tilt = 0;
    this.fall = null;
    this.variant = id;
    this.state = STATE.DOCK;
    this.slot = -1;
    this.pallet = pallet || { x: 0, y: 0 };
    this.x = this.pallet.x; this.y = this.pallet.y;   // world bottom-centre when not on the truck
    this.dx = 0; this.dvx = 0;
    this.lift = 0;                                     // art-unit raise above the bed floor (drop-in / lift-out)
    this.strap = 0; this.strapTarget = 0;
    this.rot = 0; this.pop = 0; this.alpha = 1;
  }

  /** level.cargo: {type, count} or {items: [type, ...]} for a mixed load. */
  function CargoManager(level, pallets) {
    this.level = level;
    var c = level.cargo;
    this.types = c.items ? c.items.slice() : [];
    while (this.types.length < c.count) this.types.push(c.type || 'box');
    this.required = this.types.length;
    this.secured = c.secured !== false;
    this.fragile = this.types.some(function (t) { return (TYPES[t] || {}).fragile; });
    this.items = [];
    this.loaded = new Set();
    this.delivered = new Set();
    for (var i = 0; i < this.required; i++) this.items.push(new Cargo(i, this.types[i], pallets ? pallets[i] : null));
  }

  CargoManager.STATE = STATE;
  CargoManager.TYPES = TYPES;
  CargoManager.BOX_W = BOX_W;
  CargoManager.BOX_H = BOX_H;
  CargoManager.drawBox = function (ctx, cx, by, opts) { drawCargo(ctx, cx, by, opts); };
  CargoManager.label = function (c) {
    if (c.items) return 'Mixed load';
    return (TYPES[c.type] || TYPES.box).label;
  };

  CargoManager.prototype.nextOnTruck = function () {
    var best = null;
    this.items.forEach(function (it) { if (it.state === STATE.TRUCK && (!best || it.slot > best.slot)) best = it; });
    return best;
  };
  CargoManager.prototype.placeOnTruck = function (item, slot, lift) {
    item.state = STATE.TRUCK; item.slot = slot; item.dx = 0; item.dvx = 0; item.rot = 0;
    item.lift = lift || 0;
    item.strap = 0; item.strapTarget = 1; item.pop = lift ? 0 : 1;
    if (this.loaded.has(item.id)) return false;
    this.loaded.add(item.id); return true;
  };
  CargoManager.prototype.liftFromTruck = function (item) { item.state = STATE.CARRY; item.slot = -1; item.lift = 0; };
  CargoManager.prototype.markDelivered = function (item) {
    item.state = STATE.STORED; item.pop = 1;
    if (this.delivered.has(item.id)) return false;
    this.delivered.add(item.id); return true;
  };

  CargoManager.prototype.loadedCount = function () { return this.loaded.size; };
  CargoManager.prototype.deliveredCount = function () { return this.delivered.size; };
  CargoManager.prototype.onTruckCount = function () { return this.items.filter(function (i) { return i.state === STATE.TRUCK; }).length; };
  CargoManager.prototype.weightOnTruck = function () { return this.items.reduce(function (s, i) { return s + (i.state === STATE.TRUCK ? i.weight : 0); }, 0); };
  CargoManager.prototype.allStrapped = function () {
    if (this.items.some(function (i) { return i.state === STATE.TRUCK && i.hop < -1; })) return false;
    return this.items.every(function (i) { return i.state !== STATE.TRUCK || (i.strap >= 1 && Math.abs(i.lift) < 1); });
  };

  CargoManager.prototype.update = function (dt, truckAccel, heightAt) {
    var K = CT.K || 1, stab = this.stability || 0;
    var limit = (this.secured ? 11 : 40) - stab * 1.2;
    var a = truckAccel / K;
    var inertia = Math.abs(a) > 300 ? -a * 0.014 * (1 - stab * 0.12) : 0;
    var self = this;
    this.items.forEach(function (it) {
      if (it.state === STATE.TRUCK && it.lift < 0) it.lift = Math.min(0, it.lift + dt * 900);     // settle into the bed
      if (it.strap < it.strapTarget && it.lift >= -1) it.strap = Math.min(it.strapTarget, it.strap + dt * 2.6);
      else if (it.strap > it.strapTarget) it.strap = Math.max(it.strapTarget, it.strap - dt * 3.2);
      if (it.pop > 0) it.pop = Math.max(0, it.pop - dt * 3.5);
      if (it.state === STATE.TRUCK) {
        var k = it.strap >= 1 ? 220 : 90;
        it.dvx += (-k * it.dx - 11 * it.dvx + inertia * 60) * dt;
        it.dx += it.dvx * dt;
        if (it.dx > limit) { it.dx = limit; it.dvx *= -0.3; }
        if (it.dx < -limit) { it.dx = -limit; it.dvx *= -0.3; }
        it.hopV += (-it.hop * 260 - it.hopV * 12) * dt;
        it.hop += it.hopV * dt;
        if (it.hop > 0) { it.hop = 0; it.hopV = -it.hopV * 0.3; }
        it.tilt = D.clamp(it.dx / limit * 0.05 + it.dvx * 0.0008, -0.08, 0.08);
      }
      if (it.state === STATE.FALLEN && it.fall) self.updateFall(it, dt, heightAt);
    });
  };

  // ---- cargo falling off the truck
  CargoManager.prototype.knockOff = function (it, truck, dir) {
    var p = truck.slotWorld(it.slot);
    it.state = STATE.FALLEN; it.slot = -1; it.lost = true; it.strap = 0; it.strapTarget = 0;
    it.x = p.x; it.y = p.y - 10; it.rot = 0;
    it.fall = { vx: truck.v * 0.55 + dir * 120, vy: -420, vr: dir * 3.5, rest: false };
    it.dx = 0; it.dvx = 0; it.hop = 0; it.hopV = 0; it.tilt = 0;
  };
  CargoManager.prototype.updateFall = function (it, dt, heightAt) {
    var f = it.fall; if (f.rest) return;
    var ground = (heightAt ? heightAt(it.x) : 0) + 34;   // lands on the near edge of the road
    f.vy += 1800 * dt;
    it.x += f.vx * dt; it.y += f.vy * dt; it.rot += f.vr * dt;
    if (it.y >= ground) {
      it.y = ground;
      if (Math.abs(f.vy) > 220) {
        var hit = Math.min(40, Math.abs(f.vy) * 0.03) * it.sens;
        it.health = Math.max(0, it.health - hit);
        if (it.health <= 0) it.destroyed = true;
        if (this.onImpact) this.onImpact(it, hit);
      }
      f.vy *= -0.32; f.vx *= 0.55; f.vr *= 0.5;
      if (Math.abs(f.vy) < 90) {
        f.vy = 0; f.vx *= 0.8;
        if (Math.abs(f.vx) < 20) { f.rest = true; it.rot = Math.round(it.rot / (Math.PI / 2)) * (Math.PI / 2) * 0 + (it.rot % 0.3); }
      }
    }
  };
  /** Puts a recovered item back on the bed in a free slot. */
  CargoManager.prototype.recover = function (it) {
    var used = {};
    this.items.forEach(function (o) { if (o.state === STATE.TRUCK) used[o.slot] = true; });
    var slot = -1;
    for (var s = 0; s < CT.Truck.SLOTS.length; s++) if (!used[s]) { slot = s; break; }
    if (slot < 0) return -1;
    it.lost = false; it.fall = null;
    it.state = STATE.TRUCK; it.slot = slot; it.rot = 0; it.dx = 0; it.dvx = 0;
    it.lift = -286; it.strap = 0; it.strapTarget = 1;
    return slot;
  };

  /** Spreads a hit over the cargo on the bed, scaled by each item's sensitivity. Returns the worst-hit item. */
  CargoManager.prototype.damageItems = function (amount, mult) {
    var worst = null, worstD = 0;
    this.items.forEach(function (it) {
      if (it.state !== STATE.TRUCK) return;
      var d = amount * it.sens * mult * (0.7 + 0.6 * Math.abs(Math.sin(it.id * 12.9 + amount)));
      it.health = Math.max(0, it.health - d);
      if (d > worstD) { worstD = d; worst = it; }
    });
    return worst ? { item: worst, amount: worstD } : null;
  };
  CargoManager.prototype.bounce = function (amount) {
    this.items.forEach(function (it) { if (it.state === STATE.TRUCK) it.hopV -= amount * (0.7 + 0.3 * Math.sin(it.id * 5.3)); });
  };
  /** Average condition of the cargo still in play (lost items count as 0). */
  CargoManager.prototype.condition = function () {
    var n = this.items.length; if (!n) return 100;
    return this.items.reduce(function (s, it) { return s + (it.lost || it.destroyed ? 0 : it.health); }, 0) / n;
  };
  CargoManager.prototype.lostCount = function () { return this.items.filter(function (it) { return it.lost || it.destroyed; }).length; };
  CargoManager.prototype.destroyedCount = function () { return this.items.filter(function (it) { return it.destroyed; }).length; };
  CargoManager.prototype.fallenRecoverable = function () { return this.items.filter(function (it) { return it.state === STATE.FALLEN && !it.destroyed; }); };

  CargoManager.prototype.jolt = function (strength, dir) {
    this.items.forEach(function (it) {
      if (it.state === STATE.TRUCK) it.dvx += dir * strength * (0.25 + 0.15 * Math.sin(it.id * 7.1));
    });
  };

  CargoManager.prototype.drawOnTruck = function (ctx) {
    this.items.forEach(function (it) {
      if (it.state !== STATE.TRUCK) return;
      var cx = CT.Truck.SLOTS[it.slot] + it.dx;
      var sq = it.pop > 0 ? Math.sin(it.pop * Math.PI) * 0.06 : 0;
      ctx.save();
      ctx.translate(cx, CT.Truck.BED_TOP + it.lift + it.hop);
      ctx.rotate(it.tilt);
      ctx.scale(1 + sq, 1 - sq);
      drawCargo(ctx, 0, 0, { type: it.type, variant: it.variant });
      drawDamage(ctx, it.health);
      ctx.restore();
    });
  };
  CargoManager.prototype.drawStraps = function (ctx) {
    this.items.forEach(function (it) {
      if (it.state !== STATE.TRUCK) return;
      drawStrap(ctx, CT.Truck.SLOTS[it.slot] + it.dx, it.strap);
    });
  };

  CargoManager.prototype.drawWorld = function (ctx, filter) {
    var S = CT.Truck.S;
    this.items.forEach(function (it) {
      if (it.state === STATE.TRUCK) return;
      if (filter && !filter(it)) return;
      if (it.alpha <= 0) return;
      var sq = it.pop > 0 ? Math.sin(it.pop * Math.PI) * 0.07 : 0;
      ctx.save();
      ctx.globalAlpha = it.alpha;
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      ctx.scale(S * (1 + sq), S * (1 - sq));
      drawCargo(ctx, 0, 0, { type: it.type, variant: it.variant });
      drawDamage(ctx, it.destroyed ? 0 : it.health);
      ctx.restore();
    });
  };

  CT.CargoManager = CargoManager;
})(window.CT);
