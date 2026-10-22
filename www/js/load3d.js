/* load3d.js — loads the 3D engine (Babylon.js, shipped inside the app in vendor/) and the 3D game scripts
   the first time a 3D feature is opened, with a loading screen. Nothing is fetched from the internet. */
(function (CT) {
  'use strict';
  var FILES = ['vendor/babylon.js', 'js3d/kit.js', 'js3d/trucks3d.js', 'js3d/road3d.js', 'js3d/drive3d.js', 'js3d/cargo3d.js',
    'js3d/mode3d.js', 'js3d/game3d.js', 'js3d/workshop3d.js', 'js3d/showroom3d.js'];
  var state = 'idle', waiting = [];

  function overlay(on, text, frac) {
    var el = document.getElementById('load3d');
    if (!el) {
      el = document.createElement('div'); el.id = 'load3d'; el.className = 'splash';
      el.innerHTML = '<div class="splash-logo"><span class="logo-small">CARGO TRUCK</span><span class="logo-big">3D</span></div><div class="splash-bar"><i id="load3dBar" style="animation:none"></i></div><p id="load3dText"></p>';
      document.getElementById('app').appendChild(el);
    }
    el.hidden = !on; el.classList.remove('done');
    if (text) document.getElementById('load3dText').textContent = text;
    if (frac != null) document.getElementById('load3dBar').style.width = Math.round(frac * 100) + '%';
  }

  function webglOk() {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }

  CT.Load3D = {
    ready: function () { return state === 'ready'; },
    supported: webglOk,
    ensure: function (cb) {
      if (state === 'ready') { cb(); return; }
      waiting.push(cb);
      if (state === 'loading') return;
      if (!webglOk()) { CT.UI.achToast('This phone cannot show 3D graphics (WebGL is off).'); waiting = []; return; }
      state = 'loading';
      overlay(true, 'Loading the 3D world…', 0);
      var i = 0;
      (function next() {
        if (i >= FILES.length) {
          state = 'ready';
          setTimeout(function () { overlay(false); }, 150);
          var w = waiting; waiting = [];
          w.forEach(function (f) { try { f(); } catch (e) { console.error(e); CT.UI.achToast('3D error: ' + e.message); } });
          return;
        }
        var sc = document.createElement('script');
        sc.src = FILES[i];
        sc.onload = function () { i++; overlay(true, null, i / FILES.length); next(); };
        sc.onerror = function () {
          state = 'idle'; waiting = []; overlay(false);
          CT.UI.achToast('Could not load ' + FILES[i]);
        };
        document.body.appendChild(sc);
      })();
    }
  };
})(window.CT);
