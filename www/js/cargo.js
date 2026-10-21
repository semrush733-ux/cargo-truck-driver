/* cargo.js — cargo items, their simple stable physics on the truck bed, counting and artwork. */
(function (CT) {
  'use strict';
  var D = CT.Draw, INK = D.INK;
  var BOX_W = 296, BOX_H = 190;   // art units (same scale as the truck)

  var STATE = { DOCK: 'dock', CRANE: 'crane', TRUCK: 'truck', STORED: 'stored' };

  var PALETTES = [
    { body: '#d49a5e', side: '#c0844a', light: '#e6b47c', tape: '#c9894c' },
    { body: '#d8a066', side: '#c28a50', light: '#ebbd88', tape: '#cb8f52' },
    { body: '#cf9558', side: '#ba7f45', light: '#e1ad74', tape: '#c38647' }
  ];

  /** Draws one cardboard box, bottom-centre at (cx, by), in art units. */
  function drawBox(ctx, cx, by, opts) {
    opts = opts || {};
    var p = PALETTES[(opts.variant || 0) % PALETTES.length];
    var w = BOX_W, h = BOX_H, x = cx - w / 2, y = by - h;
    ctx.lineJoin = 'round';
    D.rr(ctx, x, y, w, h, 6);
    ctx.fillStyle = p.body; ctx.fill();
    // shading
    ctx.save(); ctx.clip();
    ctx.fillStyle = p.side; ctx.fillRect(x + w - 26, y, 26, h);
    ctx.fillStyle = p.light; ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x, y + h - 16, w, 16);
    // top flap seam
    ctx.strokeStyle = 'rgba(120,70,20,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + 22); ctx.lineTo(x + w, y + 22); ctx.stroke();
    // tape with notched end
    ctx.fillStyle = p.tape;
    ctx.beginPath();
    ctx.moveTo(cx - 34, y); ctx.lineTo(cx + 34, y); ctx.lineTo(cx + 34, y + 56);
    ctx.lineTo(cx + 22, y + 46); ctx.lineTo(cx + 11, y + 56); ctx.lineTo(cx, y + 46);
    ctx.lineTo(cx - 11, y + 56); ctx.lineTo(cx - 22, y + 46); ctx.lineTo(cx - 34, y + 56);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,10,.45)'; ctx.lineWidth = 3; ctx.stroke();
    // printed "this way up" arrows + label
    if (!opts.plain) {
      ctx.strokeStyle = 'rgba(70,40,15,.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      [x + 34, x + 58].forEach(function (ax) {
        ctx.beginPath(); ctx.moveTo(ax, y + h - 30); ctx.lineTo(ax, y + h - 74);
        ctx.moveTo(ax - 9, y + h - 63); ctx.lineTo(ax, y + h - 75); ctx.lineTo(ax + 9, y + h - 63); ctx.stroke();
      });
      ctx.fillStyle = 'rgba(255,248,232,.85)'; D.rr(ctx, x + w - 112, y + h - 72, 70, 44, 5); ctx.fill();
      ctx.fillStyle = 'rgba(70,40,15,.5)';
      ctx.fillRect(x + w - 104, y + h - 63, 46, 5); ctx.fillRect(x + w - 104, y + h - 52, 34, 5); ctx.fillRect(x + w - 104, y + h - 41, 40, 5);
    }
    ctx.restore();
    D.rr(ctx, x, y, w, h, 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
  }

  function drawStrap(ctx, cx, progress) {
    if (progress <= 0) return;
    var top = 214, bottom = 562;
    var len = (bottom - top) * Math.min(1, progress);
    ctx.fillStyle = '#1e1e23';
    D.rr(ctx, cx - 15, top, 30, len, 5); ctx.fill();
    ctx.fillStyle = '#3b3b44'; ctx.fillRect(cx - 11, top + 4, 4, Math.max(0, len - 8));
    // ratchet buckles
    [452, 520].forEach(function (by) {
      if (top + len > by + 22) {
        D.box(ctx, cx - 24, by, 48, 26, 6, '#2c2c33', '#101013', 4);
        D.box(ctx, cx - 14, by + 7, 28, 12, 3, '#6d717b');
      }
    });
    // anchor hook
    if (progress >= 1) D.box(ctx, cx - 12, 548, 24, 20, 4, '#111114');
  }

  function Cargo(id, def, dock) {
    this.id = id;
    this.type = def.type || 'box';
    this.weight = def.weightEach || 1;
    this.variant = id;
    this.state = STATE.DOCK;
    this.slot = -1;
    this.x = dock.x; this.y = dock.y;   // world bottom-centre when not on the truck
    this.dock = dock;
    this.dx = 0; this.dvx = 0;          // shift along the bed (art units)
    this.strap = 0; this.strapTarget = 0;
    this.rot = 0;
    this.pop = 0;                        // squash on landing
    this.alpha = 1;
  }

  function CargoManager(level) {
    this.level = level;
    this.required = level.cargo.count;
    this.secured = level.cargo.secured !== false;
    this.items = [];
    this.loaded = new Set();
    this.delivered = new Set();
    for (var i = 0; i < this.required; i++) {
      this.items.push(new Cargo(i, level.cargo, level.loadStation.dockSlots[i]));
    }
  }

  CargoManager.STATE = STATE;
  CargoManager.BOX_W = BOX_W;
  CargoManager.BOX_H = BOX_H;
  CargoManager.drawBox = drawBox;

  CargoManager.prototype.nextOnDock = function () {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].state === STATE.DOCK) return this.items[i];
    return null;
  };
  CargoManager.prototype.nextOnTruck = function () {
    // unload from the rear slot first (closest to the dock)
    var best = null;
    this.items.forEach(function (it) { if (it.state === STATE.TRUCK && (!best || it.slot > best.slot)) best = it; });
    return best;
  };
  CargoManager.prototype.freeSlot = function () {
    var used = {};
    this.items.forEach(function (it) { if (it.slot >= 0) used[it.slot] = true; });
    for (var s = 0; s < CT.Truck.SLOTS.length; s++) if (!used[s]) return s;
    return -1;
  };

  /** Returns true only the first time an item is counted as loaded. */
  CargoManager.prototype.placeOnTruck = function (item, slot) {
    item.state = STATE.TRUCK; item.slot = slot; item.dx = 0; item.dvx = 0; item.rot = 0;
    item.strap = 0; item.strapTarget = 1; item.pop = 1;
    if (this.loaded.has(item.id)) return false;
    this.loaded.add(item.id); return true;
  };
  CargoManager.prototype.liftFromTruck = function (item) {
    item.state = STATE.CRANE; item.slot = -1;
  };
  CargoManager.prototype.markDelivered = function (item) {
    item.state = STATE.STORED; item.pop = 1;
    if (this.delivered.has(item.id)) return false;
    this.delivered.add(item.id); return true;
  };

  CargoManager.prototype.loadedCount = function () { return this.loaded.size; };
  CargoManager.prototype.deliveredCount = function () { return this.delivered.size; };
  CargoManager.prototype.onTruckCount = function () {
    return this.items.filter(function (i) { return i.state === STATE.TRUCK; }).length;
  };
  CargoManager.prototype.weightOnTruck = function () {
    return this.items.reduce(function (s, i) { return s + (i.state === STATE.TRUCK ? i.weight : 0); }, 0);
  };
  CargoManager.prototype.allStrapped = function () {
    return this.items.every(function (i) { return i.state !== STATE.TRUCK || i.strap >= 1; });
  };

  /** Cargo physics: strapped boxes spring back to their slot; inertia shifts them a little on hard braking. */
  CargoManager.prototype.update = function (dt, truckAccel) {
    var limit = this.secured ? 7 : 40;
    var inertia = Math.abs(truckAccel) > 420 ? -truckAccel * 0.01 : 0;
    this.items.forEach(function (it) {
      if (it.strap < it.strapTarget) it.strap = Math.min(it.strapTarget, it.strap + dt * 2.6);
      else if (it.strap > it.strapTarget) it.strap = Math.max(it.strapTarget, it.strap - dt * 3.2);
      if (it.pop > 0) it.pop = Math.max(0, it.pop - dt * 3.5);
      if (it.state === STATE.TRUCK) {
        var k = it.strap >= 1 ? 220 : 90;
        it.dvx += (-k * it.dx - 11 * it.dvx + inertia * 60) * dt;
        it.dx += it.dvx * dt;
        if (it.dx > limit) { it.dx = limit; it.dvx *= -0.3; }
        if (it.dx < -limit) { it.dx = -limit; it.dvx *= -0.3; }
      }
    });
  };

  CargoManager.prototype.jolt = function (strength, dir) {
    this.items.forEach(function (it) {
      if (it.state === STATE.TRUCK) it.dvx += dir * strength * (0.25 + 0.15 * Math.sin(it.id * 7.1));
    });
  };

  // ---- drawing on the truck (art space, called from Truck.draw hooks)
  CargoManager.prototype.drawOnTruck = function (ctx) {
    this.items.forEach(function (it) {
      if (it.state !== STATE.TRUCK) return;
      var cx = CT.Truck.SLOTS[it.slot] + it.dx;
      var sq = it.pop > 0 ? Math.sin(it.pop * Math.PI) * 0.06 : 0;
      ctx.save();
      ctx.translate(cx, CT.Truck.BED_TOP + 4);
      ctx.scale(1 + sq, 1 - sq);
      drawBox(ctx, 0, 0, { variant: it.variant });
      ctx.restore();
    });
  };
  CargoManager.prototype.drawStraps = function (ctx) {
    this.items.forEach(function (it) {
      if (it.state !== STATE.TRUCK) return;
      drawStrap(ctx, CT.Truck.SLOTS[it.slot] + it.dx, it.strap);
    });
  };

  // ---- drawing in the world (dock, crane, warehouse)
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
      drawBox(ctx, 0, 0, { variant: it.variant });
      ctx.restore();
    });
  };

  CT.CargoManager = CargoManager;
})(window.CT);
