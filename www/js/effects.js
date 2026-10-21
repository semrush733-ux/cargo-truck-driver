/* effects.js — lightweight particles: dust, exhaust smoke, sparkles, confetti, floating text. */
(function (CT) {
  'use strict';
  var D = CT.Draw;
  var MAX = 450;
  var CONFETTI = ['#f7901e', '#2a6fd6', '#35b54a', '#ffc21a', '#e2382f', '#ffffff'];

  function Effects() { this.list = []; }

  Effects.prototype.clear = function () { this.list.length = 0; };

  Effects.prototype.add = function (p) {
    if (this.list.length >= MAX) this.list.shift();
    p.age = 0; p.rot = p.rot || 0; p.vr = p.vr || 0; p.drag = p.drag == null ? 1 : p.drag; p.g = p.g || 0;
    this.list.push(p);
  };

  Effects.prototype.dust = function (x, y, dir, strength) {
    this.add({ type: 'dust', x: x + (Math.random() - 0.5) * 20, y: y - 4, vx: -dir * (30 + Math.random() * 60) * strength, vy: -10 - Math.random() * 30, life: 0.7 + Math.random() * 0.5, size: 6 + Math.random() * 6, grow: 26, drag: 2, color: '201,170,120' });
  };
  Effects.prototype.smoke = function (x, y, strength) {
    this.add({ type: 'dust', x: x, y: y, vx: -20 - Math.random() * 30, vy: -50 - Math.random() * 40 * strength, life: 0.8 + Math.random() * 0.5, size: 5, grow: 22, drag: 1.2, color: '120,120,128', alpha: 0.22 + 0.2 * strength });
  };
  Effects.prototype.sparkle = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 180;
      this.add({ type: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.4, size: 7 + Math.random() * 6, g: 300, drag: 1.5, color: color || '#ffd34a', vr: (Math.random() - 0.5) * 8 });
    }
  };
  Effects.prototype.puff = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.PI + Math.random() * Math.PI;
      this.add({ type: 'dust', x: x + (Math.random() - 0.5) * 60, y: y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 30, life: 0.5 + Math.random() * 0.3, size: 8, grow: 30, drag: 3, color: '230,220,200', alpha: 0.7 });
    }
  };
  Effects.prototype.confetti = function (x0, x1, y, n) {
    for (var i = 0; i < n; i++) {
      this.add({ type: 'confetti', x: x0 + Math.random() * (x1 - x0), y: y - Math.random() * 120, vx: (Math.random() - 0.5) * 160, vy: Math.random() * 60, life: 3 + Math.random() * 1.5, size: 8 + Math.random() * 7, g: 160, drag: 0.6, color: CONFETTI[i % CONFETTI.length], vr: (Math.random() - 0.5) * 12, rot: Math.random() * 6, wob: Math.random() * 6 });
    }
  };
  Effects.prototype.burst = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 300 + Math.random() * 380;
      this.add({ type: 'confetti', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 2.4 + Math.random(), size: 8 + Math.random() * 6, g: 520, drag: 1.4, color: CONFETTI[i % CONFETTI.length], vr: (Math.random() - 0.5) * 14, rot: Math.random() * 6, wob: Math.random() * 6 });
    }
  };
  Effects.prototype.text = function (x, y, str, color) {
    this.add({ type: 'text', x: x, y: y, vx: 0, vy: -70, life: 1.1, size: 34, text: str, color: color || '#ffffff', drag: 1.5 });
  };

  Effects.prototype.update = function (dt) {
    var l = this.list;
    for (var i = l.length - 1; i >= 0; i--) {
      var p = l[i];
      p.age += dt;
      if (p.age >= p.life) { l.splice(i, 1); continue; }
      var dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  };

  Effects.prototype.draw = function (ctx, t) {
    this.list.forEach(function (p) {
      var k = p.age / p.life;
      switch (p.type) {
        case 'dust':
          ctx.fillStyle = 'rgba(' + p.color + ',' + ((p.alpha || 0.5) * (1 - k)) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size + p.grow * k, 0, Math.PI * 2); ctx.fill();
          break;
        case 'spark':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color;
          D.star(ctx, 0, 0, p.size * (1 - k * 0.5), 4, 0.35); ctx.fill();
          ctx.restore();
          break;
        case 'confetti':
          ctx.save(); ctx.translate(p.x + Math.sin(t * 5 + p.wob) * 6, p.y); ctx.rotate(p.rot);
          ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
          ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.rot * 1.3)) + 2);
          ctx.restore();
          break;
        case 'text':
          ctx.save(); ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
          ctx.font = p.size + 'px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 7; ctx.strokeStyle = D.INK; ctx.lineJoin = 'round';
          var sc = k < 0.15 ? D.easeOutBack(k / 0.15) : 1;
          ctx.translate(p.x, p.y); ctx.scale(sc, sc);
          ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
          ctx.restore();
          break;
      }
    });
  };

  CT.Effects = Effects;
})(window.CT);
