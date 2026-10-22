/* draw.js — small canvas helpers shared by all renderers. */
(function (CT) {
  'use strict';
  var D = {};
  D.INK = '#1d1d22';

  D.rr = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /** Fill + outline a rounded rect in one call. */
  D.box = function (ctx, x, y, w, h, r, fill, stroke, lw) {
    D.rr(ctx, x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 6; ctx.stroke(); }
  };

  D.circle = function (ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 4; ctx.stroke(); }
  };

  D.star = function (ctx, x, y, r, points, inner) {
    points = points || 5; inner = inner || 0.45;
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / points;
      var rad = i % 2 === 0 ? r : r * inner;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
  };

  /** Deterministic RNG so the scenery is the same every play. */
  D.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  D.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  D.lerp = function (a, b, t) { return a + (b - a) * t; };
  D.approach = function (cur, target, maxStep) {
    if (cur < target) return Math.min(target, cur + maxStep);
    return Math.max(target, cur - maxStep);
  };
  D.easeOutBack = function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  CT.Draw = D;
  /** World speed scale: all speeds/accelerations are multiplied by K so on-screen motion matches the km/h shown. */
  CT.K = 2.5;
})(window.CT);
