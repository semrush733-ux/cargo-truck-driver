/* mode3d.js — owns the single Babylon engine + canvas and runs whichever 3D controller is active
   (a driving level, the engine workshop or the premium showroom). The main loop in main.js calls frame(dt),
   so there is only ever one animation loop. Handles resize, low-effects mode and WebGL context loss. */
(function (CT) {
  'use strict';
  var B = window.BABYLON;

  var Mode3D = {
    active: false,
    engine: null,
    canvas: null,
    ctrl: null,             // current controller: { scene, update(dt), dispose(), pause(), resume() }
    paused: false,
    lost: false,

    ensureEngine: function () {
      if (this.engine) return this.engine;
      var c = document.getElementById('c3d');
      if (!c) {
        c = document.createElement('canvas');
        c.id = 'c3d'; c.className = 'c3d'; c.setAttribute('aria-label', '3D game scene');
        c.setAttribute('touch-action', 'none');
        document.getElementById('app').insertBefore(c, document.getElementById('app').firstChild.nextSibling);
      }
      this.canvas = c;
      var engine = new B.Engine(c, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance', doNotHandleContextLost: false }, false);
      engine.enableOfflineSupport = false;
      engine.disablePerformanceMonitorInBackground = true;
      this.engine = engine;
      this.applyQuality();
      var self = this;
      engine.onContextLostObservable.add(function () { self.lost = true; self.showLost(true); });
      engine.onContextRestoredObservable.add(function () { self.lost = false; self.showLost(false); });
      window.addEventListener('resize', function () { if (self.engine) self.engine.resize(); });
      return engine;
    },

    /** Lower internal resolution on high-density phone screens; low-effects mode goes further. */
    applyQuality: function () {
      if (!this.engine) return;
      var dpr = window.devicePixelRatio || 1, low = !!CT.Storage.getSetting('lowFx');
      var target = low ? 1 : Math.min(dpr, 1.6);
      this.engine.setHardwareScalingLevel(1 / target);
      this.engine.resize();
    },

    showLost: function (on) {
      var el = document.getElementById('gl-lost');
      if (!el) {
        el = document.createElement('div'); el.id = 'gl-lost'; el.className = 'gl-lost';
        el.textContent = 'Restoring graphics…';
        document.getElementById('app').appendChild(el);
      }
      el.hidden = !on;
    },

    /** Switches to a controller (disposes the previous one and its scene). */
    start: function (ctrl) {
      this.stop(true);
      this.ensureEngine();
      this.ctrl = ctrl;
      this.active = true;
      this.paused = false;
      this.canvas.hidden = false;
      document.body.classList.add('mode3d');
      this.engine.resize();
    },
    stop: function (keepCanvas) {
      if (this.ctrl) { try { this.ctrl.dispose(); } catch (e) { console.error(e); } }
      this.ctrl = null;
      this.active = false;
      CT.Audio.engineOff();
      if (!keepCanvas && this.canvas) this.canvas.hidden = true;
      if (!keepCanvas) document.body.classList.remove('mode3d');
    },

    /** Adaptive quality: if a phone cannot keep ~22 FPS for a few seconds, switch to low effects once. */
    watchFps: function (dt) {
      if (!this.engine || CT.Storage.getSetting('lowFx') || this.paused) return;
      this._fpsT = (this._fpsT || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
      if (this._fpsT < 6) return;
      var fps = this._fpsN / this._fpsT; this._fpsT = 0; this._fpsN = 0;
      if (fps < 22 && !CT.botInput3d && !window.CT_NO_ADAPT) {
        CT.Storage.setSetting('lowFx', true);
        this.applyQuality();
        var c = this.ctrl;
        if (c && c.kit && c.kit.pipeline) { c.kit.pipeline.dispose(); c.kit.pipeline = null; }
        if (c && c.kit && c.kit.shadowGen) c.kit.shadowGen.getShadowMap().refreshRate = 2;
        CT.UI.achToast('Low effects switched on for smoother play (change it in Pause)');
      }
    },
    frame: function (dt) {
      var c = this.ctrl;
      if (!c || this.lost) return;
      this.watchFps(dt);
      try {
        if (!this.paused) c.update(dt);
        if (c.scene && this.engine) { this.engine.beginFrame(); c.scene.render(); this.engine.endFrame(); }
      } catch (e) {
        console.error(e);
        this.fatal(e);
      }
    },
    fatal: function (e) {
      if (this._fatal) return; this._fatal = true;
      CT.UI.toast ? CT.UI.achToast('3D error: ' + (e && e.message ? e.message : e)) : null;
      var self = this;
      setTimeout(function () { self._fatal = false; self.stop(); CT.game.toMenu(); }, 1500);
    },
    pause: function () { if (this.ctrl && this.ctrl.pause) this.ctrl.pause(); },
    foreground: function () { if (this.ctrl && this.ctrl.autoResume) this.paused = false; },
    back: function () { return this.ctrl && this.ctrl.back ? this.ctrl.back() : false; },
    fps: function () { return this.engine ? Math.round(this.engine.getFps()) : 0; }
  };

  /** Shared scene setup: lights, optional shadows, kit. */
  Mode3D.newScene = function (opt) {
    var engine = Mode3D.ensureEngine(), sc = new B.Scene(engine);
    sc.skipPointerMovePicking = true;
    sc.autoClear = true;
    sc.blockMaterialDirtyMechanism = false;
    var kit = new CT.Kit(sc);
    var hemi = new B.HemisphericLight('hemi', new B.Vector3(0.2, 1, 0.1), sc);
    // the sky photo (image-based lighting) gives the soft fill light; the sun gives direct light and shadows
    hemi.intensity = opt && opt.indoor ? 0.35 : 0.25;
    hemi.groundColor = new B.Color3(0.3, 0.28, 0.25);
    var sun = new B.DirectionalLight('sun', new B.Vector3(-0.45, -1, 0.35), sc);
    sun.intensity = opt && opt.indoor ? 1.6 : 2.6;
    sun.diffuse = new B.Color3(1, 0.96, 0.9);
    sun.position = new B.Vector3(40, 80, -40);
    if (!kit.lowFx && !(opt && opt.noShadows)) {
      var sg = new B.ShadowGenerator(1024, sun);
      sg.useBlurExponentialShadowMap = false;
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = B.ShadowGenerator.QUALITY_LOW;
      sg.bias = 0.0015; sg.normalBias = 0.02;
      sg.darkness = 0.35;
      kit.shadowGen = sg;
    }
    return { scene: sc, kit: kit, sun: sun, hemi: hemi };
  };

  CT.Mode3D = Mode3D;
})(window.CT);
