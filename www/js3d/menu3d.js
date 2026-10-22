/* menu3d.js — 3D backdrop behind the main menu (a loaded truck cruising a valley road with a slow cinematic
   camera) and the live 3D truck preview in the garage (its own small engine on the garage canvas). */
(function (CT) {
  'use strict';
  var B = window.BABYLON, V3 = B.Vector3;

  var MENU_LEVEL = {
    id: 0, name: 'menu', theme: 'country', weather: 'clear',
    segments: [{ len: 120 }, { len: 140, turn: 35, rise: 6 }, { len: 120, rise: 8, cliff: 'R', rail: true }, { len: 140, turn: -40 }, { len: 160, rise: -10 }, { len: 220 }],
    obstacles: [], cargo: ['box', 'crate', 'barrel'], par: 60
  };

  function Menu3D() {
    var env = CT.Mode3D.newScene();
    this.scene = env.scene; this.kit = env.kit; this.sun = env.sun;
    this.road = new CT.Road3D(this.scene, this.kit, MENU_LEVEL);
    this.road.build();
    var kind = CT.Premium && CT.Premium.owned() ? CT.Storage.getTruck() : 'classic';
    this.truck = CT.Trucks3D.build(this.kit, kind);
    this.truck.setHead(true);
    // three loads strapped on the bed
    var self = this, TYPES = CT.CargoManager.TYPES;
    this.loads = MENU_LEVEL.cargo.map(function (type, i) {
      var c = new CT.Cargo3D(self.scene, self.kit, self.road, self.truck, { cargo: [type] });
      var it = c.items[0]; it.mesh.parent = self.truck.body;
      var p = self.truck.slots[i]; it.mesh.position.set(p.x, p.y + CT.Cargo3D.BOX / 2, p.z);
      return c;
    });
    this.camera = new B.FreeCamera('menuCam', new V3(0, 6, -10), this.scene);
    this.camera.minZ = 0.3; this.camera.maxZ = 1800;
    this.scene.activeCamera = this.camera;
    this.kit.environment(this.road.skyName(), { camera: this.camera });
    this.s = this.road.startS + 10; this.t = 0; this.v = 13; this.spin = 0;
    this.camPos = null;
  }
  Menu3D.prototype.update = function (dt) {
    this.t += dt;
    var r = this.road;
    this.s += this.v * dt;
    if (this.s > r.zone.s1 - 20) { this.s = r.startS + 10; this.camPos = null; }
    var f = r.at(this.s), lat = CT.Road3D.LANE_R;
    var tr = this.truck.root;
    tr.position.set(f.x + f.rx * lat, f.y, f.z + f.rz * lat);
    tr.rotation.y = f.h; tr.rotation.x = -f.slope;
    this.truck.body.position.y = Math.sin(this.t * 9) * 0.012;
    this.truck.roll(this.v * dt, (r.at(this.s + 6).h - f.h) * 6);
    CT.Audio.engineOff();
    // slow cinematic orbit around the moving truck
    var a = this.t * 0.12, rad = 13, tp = tr.position;
    var pos = new V3(tp.x + Math.sin(f.h + 2.2 + Math.sin(a) * 0.9) * rad, tp.y + 4.2 + Math.sin(a * 0.7) * 1.2, tp.z + Math.cos(f.h + 2.2 + Math.sin(a) * 0.9) * rad);
    var gy = r.at(r.project(pos.x, pos.z, this.s).s).y + 2; if (pos.y < gy) pos.y = gy;
    var look = tp.add(new V3(0, 2.2, 0));
    if (!this.camPos) this.camPos = pos.clone();
    this.camPos = V3.Lerp(this.camPos, pos, Math.min(1, dt * 2));
    this.camera.position.copyFrom(this.camPos);
    this.camera.setTarget(look);
    this.sun.position = tp.add(new V3(30, 60, -25));
    r.update(this.t, tr);
  };
  Menu3D.prototype.back = function () { return false; };        // the menu handles Back itself
  Menu3D.prototype.dispose = function () { this.scene.dispose(); };

  // ------------------------------------------------------------------ garage preview (separate small engine)
  var GP = { engine: null, scene: null, canvas: null, truck: null, kit: null };
  GP.show = function (canvas) {
    try {
      if (GP.canvas !== canvas) GP.dispose();
      if (!GP.engine) {
        GP.canvas = canvas;
        GP.engine = new B.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true }, false);
        GP.engine.setHardwareScalingLevel(1 / Math.min(2, window.devicePixelRatio || 1));
        var sc = new B.Scene(GP.engine); GP.scene = sc;
        sc.clearColor = new B.Color4(0.55, 0.7, 0.85, 1);
        var kit = new CT.Kit(sc); GP.kit = kit;
        var sun = new B.DirectionalLight('sun', new V3(-0.5, -1, 0.5), sc); sun.intensity = 2.2; sun.position = new V3(20, 30, -20);
        var hemi = new B.HemisphericLight('h', new V3(0, 1, 0), sc); hemi.intensity = 0.3;
        if (!kit.lowFx) { var sg = new B.ShadowGenerator(1024, sun); sg.usePercentageCloserFiltering = true; sg.darkness = 0.35; kit.shadowGen = sg; }
        var cam = new B.ArcRotateCamera('gcam', -2.4, 1.3, 10.5, new V3(0, 1.5, -0.3), sc);
        cam.attachControl(canvas, true); cam.lowerRadiusLimit = 8; cam.upperRadiusLimit = 16; cam.fov = 0.75; cam.lowerBetaLimit = 0.7; cam.upperBetaLimit = 1.45; cam.panningSensibility = 0; cam.wheelPrecision = 40;
        GP.cam = cam;
        kit.environment('day', { camera: cam, noPipeline: true });
        var floor = B.MeshBuilder.CreateDisc('floor', { radius: 9, tessellation: 48 }, sc);
        floor.rotation.x = Math.PI / 2; floor.material = kit.surface('concrete', 3, { env: 0.5 }); floor.receiveShadows = true;
        GP.engine.runRenderLoop(function () {
          if (!GP.scene || document.getElementById('garage').hidden) return;
          if (GP.truck && !GP.dragging) GP.cam.alpha += GP.engine.getDeltaTime() * 0.00015;
          GP.scene.render();
        });
        window.addEventListener('resize', GP.resize);
      }
      GP.refresh();
    } catch (e) { console.warn('garage preview', e); }
  };
  GP.resize = function () { if (GP.engine) GP.engine.resize(); };
  /** Rebuilds the truck with the current paint, wheels, accessories and selected model. */
  GP.refresh = function () {
    if (!GP.scene) return;
    if (GP.truck) GP.truck.dispose();
    var kind = CT.Premium && CT.Premium.owned() ? CT.Storage.getTruck() : 'classic';
    GP.truck = CT.Trucks3D.build(GP.kit, kind);
    GP.truck.setHead(true);
    GP.engine.resize();
  };
  GP.dispose = function () {
    if (!GP.engine) return;
    window.removeEventListener('resize', GP.resize);
    GP.engine.stopRenderLoop(); GP.scene.dispose(); GP.engine.dispose();
    GP.engine = GP.scene = GP.truck = GP.kit = null; GP.canvas = null;
  };

  CT.Menu3D = {
    show: function () {
      if (CT.Mode3D.active && CT.Mode3D.ctrl instanceof Menu3D) return;
      CT.Mode3D.start(new Menu3D());
    }
  };
  CT.GaragePreview = GP;
})(window.CT);
