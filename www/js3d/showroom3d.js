/* showroom3d.js — slowly rotating 3D preview of the premium electric truck on a lit turntable, with its specs
   and the TRY FREE / UNLOCK / SELECT button. Opening the showroom never uses a demo drive. */
(function (CT) {
  'use strict';
  var B = window.BABYLON, V3 = B.Vector3;
  function $(id) { return document.getElementById(id); }

  function Showroom(kind) {
    var env = CT.Mode3D.newScene({ indoor: true });
    this.scene = env.scene; this.kit = env.kit;
    var sc = this.scene, k = this.kit;
    sc.clearColor = new B.Color4(0.06, 0.09, 0.16, 1);
    env.hemi.intensity = 0.6; env.sun.intensity = 0.7;
    var floor = B.MeshBuilder.CreateDisc('floor', { radius: 40, tessellation: 48 }, sc);
    floor.rotation.x = Math.PI / 2; floor.material = k.mat('#1b2232', { spec: 0.5 }); floor.receiveShadows = true;
    this.table = B.MeshBuilder.CreateCylinder('table', { diameter: 11, height: 0.3, tessellation: 48 }, sc);
    this.table.position.y = 0.15; this.table.material = k.mat('#2a3348', { spec: 0.7 }); this.table.receiveShadows = true;
    var ring = B.MeshBuilder.CreateTorus('ring', { diameter: 11, thickness: 0.12, tessellation: 64 }, sc);
    ring.position.y = 0.3; ring.material = k.mat('#4fc3ff', { emissive: '#2a9be0' });
    // spotlights for a studio look
    [[-8, 9, 6], [8, 9, 6], [0, 10, -9]].forEach(function (p, i) {
      var l = new B.SpotLight('spot' + i, new V3(p[0], p[1], p[2]), new V3(-p[0], -p[1], -p[2]).normalize(), 0.9, 2, sc);
      l.intensity = 0.55; l.diffuse = i === 2 ? new B.Color3(0.6, 0.85, 1) : new B.Color3(1, 0.97, 0.92);
    });
    this.truck = CT.Trucks3D.build(k, kind);
    this.truck.root.position.y = 0.3;
    this.truck.setHead(true);
    this.cam = new B.ArcRotateCamera('arc', -Math.PI / 3, 1.2, 15, new V3(0, 1.6, 0), sc);
    this.cam.lowerRadiusLimit = 10; this.cam.upperRadiusLimit = 22; this.cam.lowerBetaLimit = 0.6; this.cam.upperBetaLimit = 1.45;
    this.cam.attachControl(CT.Mode3D.canvas, true);
    this.cam.wheelPrecision = 30; this.cam.panningSensibility = 0;
    sc.activeCamera = this.cam;
    this.t = 0;
    this.kind = kind;
    this.buildUi();
  }
  Showroom.prototype.buildUi = function () {
    var d = $('srUi');
    if (!d) {
      d = document.createElement('section');
      d.id = 'srUi'; d.className = 'screen sr-ui';
      $('app').appendChild(d);
    }
    var own = CT.Premium.owned(), left = CT.Premium.demosLeft(), b = CT.Garage.BASE3D.volt;
    d.innerHTML = '<div class="sr-card"><span class="pbadge">PREMIUM</span><h2>Volt Ranger EV</h2><p>Original electric pickup · brushed-steel body · LED light strips</p>' +
      '<ul class="tspec"><li><span>Top speed</span><b>' + b.top + ' km/h</b></li><li><span>Acceleration</span><b>Instant electric</b></li><li><span>Braking</span><b>Strong</b></li><li><span>Cargo</span><b>3 loads · 2.5 t</b></li></ul>' +
      (own ? '<button class="btn btn-green" type="button" id="srMain">SELECT TRUCK</button>'
        : left > 0 ? '<button class="btn btn-green" type="button" id="srMain">TRY FREE · ' + left + ' of 3 left</button>'
        : '<button class="btn btn-orange" type="button" id="srMain">UNLOCK TRUCK</button>') +
      '<button class="btn btn-ghost" type="button" id="srClose">CLOSE</button><small class="sr-hint">Drag to look around</small></div>';
    d.hidden = false;
    $('srClose').onclick = function () { CT.Showroom3D.close(); };
    $('srMain').onclick = function () {
      if (CT.Premium.owned()) { CT.Storage.setTruck('volt'); CT.Audio.play('unlock'); CT.Showroom3D.close(); }
      else if (CT.Premium.canDemo()) { CT.Showroom3D.close(true); CT.Premium.startDemo(); }
      else CT.Premium.openPurchase(true);
    };
  };
  Showroom.prototype.update = function (dt) {
    this.t += dt;
    this.truck.root.rotation.y += dt * 0.35;                 // slow turntable
    this.table.rotation.y = this.truck.root.rotation.y;
    this.truck.roll(0, Math.sin(this.t * 0.7) * 0.3);
  };
  Showroom.prototype.back = function () { CT.Showroom3D.close(); };
  Showroom.prototype.dispose = function () {
    var d = $('srUi'); if (d) d.hidden = true;
    this.cam.detachControl();
    this.scene.dispose();
  };

  CT.Showroom3D = {
    open: function () {
      this.prev = ['menu', 'garage', 'levels3d'].filter(function (k) { var e = $(k); return e && !e.hidden; });
      this.prev.forEach(function (k) { $(k).hidden = true; });
      CT.Mode3D.start(new Showroom('volt'));
    },
    close: function (silent) {
      CT.Mode3D.stop();
      if (silent) return;
      var back = this.prev && this.prev.length ? this.prev : ['menu'];
      back.forEach(function (k) { var e = $(k); if (e) e.hidden = false; });
      if (back.indexOf('garage') >= 0) CT.UI.renderGarage();
      if (back.indexOf('levels3d') >= 0) CT.Premium.renderPicker($('truckPick'));
      if (back.indexOf('menu') >= 0) { CT.UI.refreshMenu(); if (CT.Menu3D) CT.Menu3D.show(); }
    }
  };
})(window.CT);
