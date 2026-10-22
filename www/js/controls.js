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

      Array.prototype.forEach.call(root.querySelectorAll('[data-tap]'), function (el) {
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault(); CT.Audio.unlock();
          el.classList.add('active'); setTimeout(function () { el.classList.remove('active'); }, 150);
          Controls.fire(el.getAttribute('data-tap'));
        });
        el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      });

      // gyro steering: tilt the phone left/right to change lanes
      var gyroSide = 0;
      window.addEventListener('deviceorientation', function (e) {
        if (e.beta == null) return;
        var ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
        var raw = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
        Controls.gyroAvailable = true;
        Controls.rawTilt = raw;
        var tilt = raw - Controls.neutral;
        var sens = (CT.Storage && CT.Storage.getSetting('gyroSens')) || 15;     // degrees of tilt for a full lane change / full lock
        Controls.tilt = tilt;
        Controls.steerTilt = Math.max(-1, Math.min(1, tilt / sens));
        if (!Controls.gyro || !Controls.enabled) return;
        if (tilt < -sens && gyroSide !== -1) { gyroSide = -1; Controls.fire('lane', 1); }
        else if (tilt > sens && gyroSide !== 1) { gyroSide = 1; Controls.fire('lane', 0); }
        else if (Math.abs(tilt) < sens * 0.45) gyroSide = 0;
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
        else if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyL') { if (Controls.captureKeys) { e.preventDefault(); Controls.fire('lane'); } }
        else if (e.code === 'KeyC' || e.code === 'KeyV') { if (Controls.captureKeys) Controls.fire('camera'); }
        else if (e.code === 'KeyH') { if (Controls.captureKeys) Controls.fire('horn'); }
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
      if (CT.botInput) { s.gas = !!CT.botInput.gas; s.brake = !!CT.botInput.brake; s.reverse = !!CT.botInput.reverse; if (!this.enabled) s.gas = s.brake = s.reverse = false; return s; }
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
    gyro: false,
    tilt: 0, rawTilt: 0, neutral: 0, steerTilt: 0, gyroAvailable: false,
    /** Current phone angle becomes "straight ahead". */
    calibrate: function () { this.neutral = this.rawTilt || 0; this.steerTilt = 0; return this.neutral; },
    /** Optional gyro; falls back to the touch buttons when unsupported or permission is denied. cb(ok) */
    enableGyro: function (on, cb) {
      var self = this;
      this.gyro = !!on;
      if (!on) { if (cb) cb(false); return; }
      if (!window.DeviceOrientationEvent) { this.gyro = false; if (cb) cb(false); return; }
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(function (r) {
          if (r !== 'granted') self.gyro = false;
          if (cb) cb(self.gyro);
        }).catch(function () { self.gyro = false; if (cb) cb(false); });
      } else if (cb) cb(true);
    },
    on: function (name, fn) { actionHandlers[name] = fn; },
    fire: function (name, arg) { if (actionHandlers[name]) actionHandlers[name](arg); }
  };

  CT.Controls = Controls;
})(window.CT);
