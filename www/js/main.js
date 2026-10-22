/* main.js — boot, single requestAnimationFrame loop, resize, background/foreground handling. */
(function (CT) {
  'use strict';
  var canvas = document.getElementById('game');
  var game = new CT.Game(canvas);
  CT.game = game;   // handy for debugging from the console
  CT.Controls.init(document.getElementById('app'));
  CT.UI.init(game);

  // ---------------------------------------------------------- resize
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    game.resize(w, h, dpr);
    CT.UI.updateOrientationHint(w, h);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  resize();

  // ---------------------------------------------------------- loop (guarded: never runs twice)
  var rafId = null, lastT = 0;
  function frame(now) {
    rafId = window.requestAnimationFrame(frame);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;          // clamp long frames (tab switch, GC) so physics stays stable
    game.tick(dt);
  }
  function startLoop() {
    if (rafId !== null) return;
    lastT = performance.now();
    rafId = window.requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (rafId === null) return;
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ---------------------------------------------------------- background / foreground
  function goBackground() {
    game.pause();
    CT.Controls.releaseAll();
    CT.Audio.suspend();
    stopLoop();
  }
  function goForeground() {
    CT.Audio.resume();
    startLoop();          // the game stays on the pause screen until the player taps Resume
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) goBackground(); else goForeground(); });
  window.addEventListener('pagehide', goBackground);
  window.addEventListener('pageshow', function () { if (!document.hidden) goForeground(); });
  window.addEventListener('blur', function () { game.pause(); });

  // Capacitor (Android) app lifecycle, when packaged
  try {
    var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App && App.addListener) {
      App.addListener('pause', goBackground);
      App.addListener('resume', goForeground);
      App.addListener('backButton', function () {
        var S = CT.Game.STATES;
        if (game.state === S.PAUSED) game.resume();
        else if (game.isPlaying()) game.pause();
        else if (game.state === S.LEVEL_COMPLETE || game.state === S.LEVEL_FAILED) { CT.UI.hideWin(); CT.UI.hideFail(); game.toMenu(); }
        else if (App.exitApp) App.exitApp();
      });
    }
  } catch (e) {}

  // drag-and-drop loading: pointer on the scene (not on a button or a dialog)
  var app = document.getElementById('app'), dragPtr = null;
  app.addEventListener('pointerdown', function (e) {
    if (dragPtr !== null || (e.target.closest && e.target.closest('button, .modal-wrap, .hud-top, input, label'))) return;
    if (game.pointerDown(e.clientX, e.clientY)) { dragPtr = e.pointerId; e.preventDefault(); }
  });
  window.addEventListener('pointermove', function (e) { if (e.pointerId === dragPtr) { game.pointerMove(e.clientX, e.clientY); e.preventDefault(); } }, true);
  function endDrag(e) { if (e.pointerId === dragPtr) { dragPtr = null; game.pointerUp(); } }
  window.addEventListener('pointerup', endDrag, true);        // capture phase: a button under the finger cannot swallow it
  window.addEventListener('pointercancel', endDrag, true);

  // stop pinch-zoom / double-tap zoom / long-press menus during play
  ['gesturestart', 'gesturechange', 'dblclick'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) { if (!e.target.closest || !e.target.closest('.modal-wrap')) e.preventDefault(); }, { passive: false });

  // offline cache when served over http(s) (not in Capacitor, which already ships the files)
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor && !window.CT_NO_SW) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  } catch (e) {}

  CT.UI.showMenu();
  startLoop();
  setTimeout(function () { CT.UI.hideSplash(); }, 900);
  // background music starts after the first tap (browsers block audio before that)
  document.addEventListener('pointerdown', function first() {
    document.removeEventListener('pointerdown', first);
    try { CT.Audio.unlock(); CT.Audio.music(true); } catch (e) {}
  });
})(window.CT);
