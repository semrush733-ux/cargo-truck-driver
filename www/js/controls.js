/* controls.js — touch pedals (multi-touch, pointer capture) + keyboard. Exposes a simple input state. */
(function (CT) {
  'use strict';
  var KEYMAP = {
    ArrowRight: 'gas', KeyD: 'gas',
    ArrowLeft: 'brake', KeyA: 'brake', Space: 'brake',
    ArrowDown: 'reverse', KeyS: 'reverse'
  };
  var keysDown = {};             // code -> control
  var pointers = {};             // pointerId -> control
  var elements = {};             // control -> [elements]
  var actionHandlers = {};

  function countActive(ctrl) {
    var n = 0, k;
    for (k in keysDown) if (keysDown[k] === ctrl) n++;
    for (k in pointers) if (pointers[k] === ctrl) n++;
    return n;
  }

  function refreshVisual(ctrl) {
    var on = Controls.enabled && countActive(ctrl) > 0;
    (elements[ctrl] || []).forEach(function (el) { el.classList.toggle('active', on); });
  }

  var Controls = {
    enabled: false,
    state: { gas: false, brake: false, reverse: false },

    init: function (root) {
      var btns = root.querySelectorAll('[data-control]');
      Array.prototype.forEach.call(btns, function (el) {
        var ctrl = el.getAttribute('data-control');
        (elements[ctrl] = elements[ctrl] || []).push(el);
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          CT.Audio.unlock();
          try { el.setPointerCapture(e.pointerId); } catch (x) {}
          pointers[e.pointerId] = ctrl;
          if (!Controls.enabled) { Controls.fire('locked', ctrl); }
          refreshVisual(ctrl);
        });
        var release = function (e) {
          if (pointers[e.pointerId]) { delete pointers[e.pointerId]; refreshVisual(ctrl); }
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        el.addEventListener('lostpointercapture', release);
        el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      });

      window.addEventListener('keydown', function (e) {
        var ctrl = KEYMAP[e.code];
        if (ctrl) {
          if (Controls.captureKeys) e.preventDefault();
          if (!keysDown[e.code]) { keysDown[e.code] = ctrl; CT.Audio.unlock(); if (!Controls.enabled && Controls.captureKeys) Controls.fire('locked', ctrl); refreshVisual(ctrl); }
          return;
        }
        if (e.repeat) return;
        if (e.code === 'KeyE' || e.code === 'Enter') {
          var t = e.target;
          if (e.code === 'Enter' && t && t.tagName === 'BUTTON' && t.id !== 'btnAction') return;   // let focused buttons handle Enter themselves
          if (Controls.captureKeys) { e.preventDefault(); Controls.fire('action'); }
        }
        else if (e.code === 'KeyP' || e.code === 'Escape') { Controls.fire('pause'); }
      });
      window.addEventListener('keyup', function (e) {
        var ctrl = KEYMAP[e.code];
        if (ctrl && keysDown[e.code]) { delete keysDown[e.code]; refreshVisual(ctrl); }
      });
      window.addEventListener('blur', function () { Controls.releaseAll(); });
    },

    /** Recompute state; called once per frame. */
    update: function () {
      var s = this.state;
      if (!this.enabled) { s.gas = s.brake = s.reverse = false; return s; }
      s.gas = countActive('gas') > 0;
      s.brake = countActive('brake') > 0;
      s.reverse = countActive('reverse') > 0;
      return s;
    },

    setEnabled: function (on) {
      this.enabled = !!on;
      ['gas', 'brake', 'reverse'].forEach(refreshVisual);
    },

    releaseAll: function () {
      keysDown = {}; pointers = {};
      this.state.gas = this.state.brake = this.state.reverse = false;
      ['gas', 'brake', 'reverse'].forEach(refreshVisual);
    },

    captureKeys: false,
    on: function (name, fn) { actionHandlers[name] = fn; },
    fire: function (name, arg) { if (actionHandlers[name]) actionHandlers[name](arg); }
  };

  CT.Controls = Controls;
})(window.CT);
