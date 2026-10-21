/* ui.js — DOM screens: main menu, HUD, pause, win, settings. Game logic stays in game.js. */
(function (CT) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  var game = null;
  var last = {};
  var toastUntil = 0;
  var lockTimer = 0;
  var resetArmed = 0;

  var LOCK_SVG = '<svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setText(node, key, val) {
    if (last[key] === val) return;
    last[key] = val; node.textContent = val;
  }

  function tap(node, fn) {
    node.addEventListener('click', function (e) { CT.Audio.unlock(); fn(e); });
  }

  var UI = {
    init: function (g) {
      game = g;
      ['menu', 'hud', 'pause', 'win', 'settings', 'levelCards', 'btnPlay', 'btnSettings', 'btnSoundMenu', 'btnSoundPause',
        'cargoCount', 'cargoLabel', 'progFill', 'progTruck', 'distLeft', 'destName', 'speedVal', 'btnPause', 'banner', 'bannerTitle', 'bannerSub',
        'btnAction', 'actionText', 'actionIcon', 'actionHint', 'lockNote', 'btnResume', 'btnRestart', 'btnResetTruck', 'btnMenuFromPause',
        'btnWinRestart', 'btnWinMenu', 'statCargo', 'statDist', 'statTime', 'bestNote', 'optSound', 'optEngine', 'optVibrate',
        'btnResetProgress', 'btnCloseSettings', 'rotateHint', 'flash'].forEach(function (id) { el[id] = $(id); });
      el.controls = document.querySelector('.controls');
      el.cargoChip = document.querySelector('.cargo-chip');
      el.levelChipNum = document.querySelector('.level-chip .lvl-num');
      el.levelChipName = document.querySelector('.level-chip .lvl-name');
      el.pedals = { gas: document.querySelector('.pedal-gas'), brake: document.querySelector('.pedal-brake'), reverse: document.querySelector('.pedal-reverse') };

      tap(el.btnPlay, function () { UI.play(1); });
      tap(el.btnSettings, function () { UI.openSettings(); });
      tap(el.btnSoundMenu, function () { UI.toggleSound(); });
      tap(el.btnSoundPause, function () { UI.toggleSound(); });
      tap(el.btnPause, function () { game.pause(); });
      tap(el.btnResume, function () { game.resume(); });
      tap(el.btnRestart, function () { game.restart(); });
      tap(el.btnResetTruck, function () { game.resetTruck(); });
      tap(el.btnMenuFromPause, function () { UI.showPause(false); game.toMenu(); });
      tap(el.btnWinRestart, function () { game.restart(); });
      tap(el.btnWinMenu, function () { UI.hideWin(); game.toMenu(); });
      tap(el.btnCloseSettings, function () { UI.closeSettings(); });
      el.btnAction.addEventListener('pointerdown', function (e) { e.preventDefault(); CT.Audio.unlock(); game.action(); });

      el.optSound.addEventListener('change', function () { CT.Storage.setSetting('sound', el.optSound.checked); UI.syncSound(); });
      el.optEngine.addEventListener('change', function () { CT.Storage.setSetting('engine', el.optEngine.checked); CT.Audio.applySettings(); if (game.isPlaying()) game.applyStateEffects(); });
      el.optVibrate.addEventListener('change', function () { CT.Storage.setSetting('vibrate', el.optVibrate.checked); if (el.optVibrate.checked) CT.vibrate(30); });
      tap(el.btnResetProgress, function () {
        var now = Date.now();
        if (now - resetArmed < 3000) {
          CT.Storage.resetProgress(); resetArmed = 0;
          el.btnResetProgress.textContent = 'DONE';
          UI.renderLevelCards();
          setTimeout(function () { el.btnResetProgress.textContent = 'RESET'; }, 1500);
        } else {
          resetArmed = now; el.btnResetProgress.textContent = 'TAP AGAIN';
          setTimeout(function () { if (Date.now() - resetArmed >= 2900) el.btnResetProgress.textContent = 'RESET'; }, 3000);
        }
      });

      CT.Controls.on('locked', function () {
        if (game.state !== CT.Game.STATES.LOADING) return;
        el.lockNote.hidden = false;
        clearTimeout(lockTimer);
        lockTimer = setTimeout(function () { el.lockNote.hidden = true; }, 1600);
      });
      CT.Controls.on('action', function () { game.action(); });
      CT.Controls.on('pause', function () {
        if (!el.settings.hidden) { UI.closeSettings(); return; }
        if (game.state === CT.Game.STATES.PAUSED) game.resume(); else game.pause();
      });

      this.syncSound();
      this.renderLevelCards();
    },

    play: function (id) {
      if (!CT.Levels.isUnlocked(id)) return;
      UI.goFullscreen();
      game.startLevel(id);
    },

    goFullscreen: function () {
      try {
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (!coarse || window.Capacitor) return;
        var de = document.documentElement;
        if (!document.fullscreenElement && de.requestFullscreen) {
          de.requestFullscreen({ navigationUI: 'hide' }).then(function () {
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
          }).catch(function () {});
        }
      } catch (e) {}
    },

    renderLevelCards: function () {
      var box = el.levelCards; box.innerHTML = '';
      CT.Levels.all().forEach(function (lv) {
        var unlocked = CT.Levels.isUnlocked(lv.id);
        if (lv.implemented && unlocked) {
          var rec = CT.Storage.getLevel(lv.id);
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'level-card' + (rec && rec.completed ? ' done' : '');
          var stars = '';
          for (var i = 0; i < 3; i++) stars += '<i class="' + (rec && rec.stars > i ? 'on' : '') + '"></i>';
          b.innerHTML = '<span class="lc-tag">' + (rec && rec.completed ? 'DONE' : (lv.tutorial ? 'TUTORIAL' : 'NEW')) + '</span>' +
            '<span class="lc-num">' + lv.id + '</span><span class="lc-name">' + lv.name + '</span><span class="lc-stars">' + stars + '</span>';
          b.setAttribute('aria-label', 'Level ' + lv.id + ', ' + lv.name + (rec && rec.completed ? ', completed with ' + rec.stars + ' stars' : ''));
          tap(b, function () { UI.play(lv.id); });
          box.appendChild(b);
        } else {
          var d = document.createElement('div');
          d.className = 'level-card locked';
          d.setAttribute('aria-disabled', 'true');
          d.setAttribute('aria-label', 'Level ' + lv.id + ', locked, coming soon');
          d.innerHTML = '<span class="lc-num">' + lv.id + '</span><span class="lc-name">' + (lv.implemented ? 'Locked' : 'Coming soon') + '</span>' + LOCK_SVG;
          box.appendChild(d);
        }
      });
    },

    showMenu: function () {
      el.menu.hidden = false; el.hud.hidden = true; el.pause.hidden = true; el.win.hidden = true; el.lockNote.hidden = true;
      this.renderLevelCards();
      setTimeout(function () { try { el.btnPlay.focus({ preventScroll: true }); } catch (e) {} }, 50);
    },

    enterLevel: function (L, total) {
      last = {};
      el.menu.hidden = true; el.hud.hidden = false; el.pause.hidden = true; el.win.hidden = true;
      el.levelChipNum.textContent = L.id;
      el.levelChipName.textContent = L.name;
      el.destName.textContent = L.destination.name;
      toastUntil = 0;
    },

    onState: function (s, g) {
      var ST = CT.Game.STATES;
      if (s === ST.MAIN_MENU || s === ST.PAUSED) return;
      el.controls.classList.toggle('locked', s === ST.LOADING || s === ST.DELIVERING || s === ST.LEVEL_COMPLETE);
      el.btnPause.hidden = s === ST.LEVEL_COMPLETE;
      if (s !== ST.LOADING) el.lockNote.hidden = true;
      if (s === ST.LEVEL_COMPLETE) el.banner.classList.add('hide');
      this.refreshAction(g);
    },

    refreshAction: function (g) {
      var ST = CT.Game.STATES, s = g.state === ST.PAUSED ? g.prevState : g.state;
      var b = el.btnAction, mode, text, icon, hint = '', disabled = false;
      switch (s) {
        case ST.LOADING:
          var avail = g.loadsAvailable();
          var asked = g.cargo.required - avail;
          if (avail > 0) { mode = 'load'; text = 'LOAD'; icon = 'load'; hint = 'Box ' + (asked + 1) + ' of ' + g.cargo.required; }
          else if (g.cargo.loadedCount() >= g.cargo.required) { mode = 'load'; text = 'STRAPPING'; icon = 'wait'; disabled = true; }
          else { mode = 'load'; text = 'LOADING'; icon = 'wait'; disabled = true; }
          break;
        case ST.READY_TO_DRIVE: case ST.DRIVING:
          mode = 'deliver'; text = 'DELIVER'; icon = 'deliver'; disabled = true; hint = 'Stop in the green zone'; break;
        case ST.ARRIVED:
          mode = 'deliver'; text = 'DELIVER'; icon = 'deliver'; hint = 'Tap to unload'; break;
        case ST.DELIVERING:
          mode = 'deliver'; text = 'UNLOADING'; icon = 'wait'; disabled = true; break;
        default:
          mode = 'hidden';
      }
      b.hidden = mode === 'hidden';
      el.actionHint.textContent = hint;
      if (mode === 'hidden') return;
      b.classList.toggle('deliver', mode === 'deliver');
      b.classList.toggle('glow', !disabled);
      b.disabled = disabled;
      el.actionText.textContent = text;
      el.actionIcon.className = 'action-icon ' + icon;
      b.setAttribute('aria-label', text);

      // pedal hints for the tutorial
      var hk = g.hintKey, want = null;
      if (g.level && g.level.tutorial) {
        if (s === ST.READY_TO_DRIVE || hk === 'drive' || hk === 'wrong') want = 'gas';
        else if (hk === 'brake' || hk === 'near') want = 'brake';
        else if (hk === 'over') want = 'reverse';
      }
      Object.keys(el.pedals).forEach(function (k) { el.pedals[k].classList.toggle('hint', k === want); });
    },

    setBanner: function (title, sub, tone, pop) {
      if (performance.now() < toastUntil) return;
      el.banner.classList.remove('hide', 'good', 'warn');
      if (tone) el.banner.classList.add(tone);
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      if (pop) { el.banner.classList.remove('pop'); void el.banner.offsetWidth; el.banner.classList.add('pop'); }
    },
    setBannerSub: function (sub) { if (performance.now() >= toastUntil) setText(el.bannerSub, 'bsub', sub); },

    toast: function (msg) {
      toastUntil = 0;
      this.setBanner(msg, '', 'warn', true);
      toastUntil = performance.now() + 2200;
      setTimeout(function () { if (game.level) game.updateHints(true); }, 2250);
    },

    setCargo: function (n, total, label, bump) {
      el.cargoCount.textContent = n + '/' + total;
      el.cargoLabel.textContent = label;
      if (bump) { el.cargoChip.classList.remove('bump'); void el.cargoChip.offsetWidth; el.cargoChip.classList.add('bump'); }
    },

    updateHud: function (g) {
      var L = g.level, tr = g.truck, z = L.destination.zone, zc = (z.x1 + z.x2) / 2;
      var p = Math.max(0, Math.min(1, (tr.x - L.start.x) / (zc - L.start.x)));
      var pct = (p * 100).toFixed(1) + '%';
      if (last.pct !== pct) { last.pct = pct; el.progFill.style.width = pct; el.progTruck.style.left = pct; }
      var m = Math.max(0, Math.round(Math.abs(zc - tr.x) * CT.Levels.METERS_PER_UNIT));
      setText(el.distLeft, 'dist', (g.zone.inside ? 'Arrived' : m + ' m'));
      setText(el.speedVal, 'spd', String(Math.round(Math.abs(tr.v) * CT.Levels.METERS_PER_UNIT * 3.6)));
    },

    showPause: function (show, prev) {
      el.pause.hidden = !show;
      if (show) {
        var ST = CT.Game.STATES;
        el.btnResetTruck.hidden = [ST.READY_TO_DRIVE, ST.DRIVING, ST.ARRIVED].indexOf(prev) < 0;
        this.syncSound();
        setTimeout(function () { try { el.btnResume.focus({ preventScroll: true }); } catch (e) {} }, 30);
      }
    },

    showWin: function (r) {
      el.statCargo.textContent = r.delivered + '/' + r.required;
      el.statDist.textContent = Math.round(r.distance) + ' m';
      el.statTime.textContent = fmtTime(r.time);
      el.bestNote.textContent = r.isBest ? 'New best time!' : '';
      var stars = el.win.querySelectorAll('.star');
      Array.prototype.forEach.call(stars, function (s) { s.classList.remove('on'); });
      el.win.hidden = false;
      el.hud.hidden = true;
      Array.prototype.forEach.call(stars, function (s, i) {
        if (i < r.stars) setTimeout(function () { s.classList.add('on'); CT.Audio.play('star'); }, 350 + i * 300);
      });
      setTimeout(function () { try { el.btnWinRestart.focus({ preventScroll: true }); } catch (e) {} }, 60);
    },
    hideWin: function () { el.win.hidden = true; },

    flash: function () { el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); },

    openSettings: function () {
      el.optSound.checked = CT.Storage.getSetting('sound') !== false;
      el.optEngine.checked = CT.Storage.getSetting('engine') !== false;
      el.optVibrate.checked = CT.Storage.getSetting('vibrate') !== false;
      el.btnResetProgress.textContent = 'RESET'; resetArmed = 0;
      el.settings.hidden = false;
      setTimeout(function () { try { el.btnCloseSettings.focus({ preventScroll: true }); } catch (e) {} }, 30);
    },
    closeSettings: function () { el.settings.hidden = true; this.renderLevelCards(); },

    toggleSound: function () {
      CT.Storage.setSetting('sound', CT.Storage.getSetting('sound') === false);
      this.syncSound();
      CT.Audio.play('click');
    },
    syncSound: function () {
      var on = CT.Storage.getSetting('sound') !== false;
      Array.prototype.forEach.call(document.querySelectorAll('.sound-toggle'), function (b) {
        b.classList.toggle('is-off', !on);
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
        var t = b.querySelector('.sound-text'); if (t) t.textContent = on ? 'SOUND ON' : 'SOUND OFF';
      });
      CT.Audio.applySettings();
      if (on && game && game.isPlaying()) game.applyStateEffects();
    },

    updateOrientationHint: function (w, h) {
      el.rotateHint.hidden = !(h > w * 1.05 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    }
  };

  CT.UI = UI;
})(window.CT);
