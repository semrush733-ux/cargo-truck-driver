/* ui.js — DOM screens: menu, HUD, pause, win, fail, level select, garage, settings. Game logic stays in game.js. */
(function (CT) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  var game = null;
  var last = {};
  var toastUntil = 0, toastTimer = 0;
  var lockTimer = 0;
  var resetArmed = 0;
  var garageFrom = null;

  var LOCK_SVG = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
  var ICONS = { engine: '⚙️', tyres: '🛞', suspension: '🔩', brakes: '🛑' };
  var CAM_LABEL = { side: 'SIDE', chase: 'TPP', cab: 'FPP' };

  function D_clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fmtTime(sec) {
    sec = Math.max(0, sec);
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function setText(node, key, val) { if (last[key] === val) return; last[key] = val; node.textContent = val; }
  function tap(node, fn) { node.addEventListener('click', function (e) { CT.Audio.unlock(); fn(e); }); }
  function miniStars(n) {
    var h = '<span class="mini-stars">';
    for (var i = 0; i < 3; i++) h += '<svg viewBox="0 0 100 100" class="' + (i < n ? 'on' : '') + '"><use href="#starShape"/></svg>';
    return h + '</span>';
  }
  function bigStar(mid) {
    var sp = '';
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; sp += '<i class="spark" style="--dx:' + Math.round(Math.cos(a) * 70) + 'px;--dy:' + Math.round(Math.sin(a) * 70) + 'px"></i>'; }
    return '<div class="bstar' + (mid ? ' mid' : '') + '">' +
      '<svg viewBox="0 0 100 100"><use class="off" href="#starShape"/></svg>' +
      '<svg viewBox="0 0 100 100"><use class="on" href="#starShape"/><path class="shine" d="M50 14 L58 34 L44 36 Z M36 40 L20 41 L30 50 Z"/></svg>' + sp + '</div>';
  }

  var UI = {
    fmtTime: fmtTime,

    init: function (g) {
      game = g;
      ['menu', 'hud', 'pause', 'win', 'fail', 'settings', 'levels', 'garage', 'btnPlay', 'playLevel', 'btnSettings', 'btnSoundMenu', 'btnSoundPause',
        'btnLevels', 'btnGarage', 'menuCoins', 'menuStars', 'menuDone', 'menuBar',
        'cargoCount', 'healthBar', 'progFill', 'progTruck', 'distLeft', 'destName', 'speedVal', 'timerChip', 'timerVal', 'btnPause', 'camLabel',
        'banner', 'bannerTitle', 'bannerSub', 'bannerProg', 'bannerBar', 'bannerTime', 'easyTag', 'btnAction', 'actionText', 'actionIcon', 'actionHint', 'lockNote', 'laneBtns',
        'btnResume', 'btnRestart', 'btnResetTruck', 'btnMenuFromPause',
        'winLevel', 'winStars', 'winCriteria', 'statDist', 'statTime', 'statCoins', 'bestNote', 'btnNext', 'btnWinRestart', 'btnWinGarage', 'btnWinMenu',
        'failTitle', 'failText', 'btnRetry', 'btnFailGarage', 'btnFailMenu',
        'levelGrid', 'btnCloseLevels', 'garageCoins', 'btnCloseGarage', 'garageCanvas', 'truckStats', 'upgradeList', 'paintList',
        'optSound', 'optEngine', 'optVibrate', 'optGyro', 'btnResetProgress', 'btnCloseSettings', 'rotateHint', 'flash'
      ].forEach(function (id) { el[id] = $(id); });
      el.controls = document.querySelector('.controls');
      el.cargoChip = document.querySelector('.cargo-chip');
      el.levelChipNum = document.querySelector('.level-chip .lvl-num');
      el.levelChipName = document.querySelector('.level-chip .lvl-name');
      el.pedals = { gas: document.querySelector('.pedal-gas'), brake: document.querySelector('.pedal-brake'), reverse: document.querySelector('.pedal-reverse'), lane: el.laneBtns };

      tap(el.btnPlay, function () { UI.play(CT.Levels.nextToPlay()); });
      tap(el.btnSettings, function () { UI.openSettings(); });
      tap(el.btnSoundMenu, function () { UI.toggleSound(); });
      tap(el.btnSoundPause, function () { UI.toggleSound(); });
      tap(el.btnLevels, function () { UI.openLevels(); });
      tap(el.btnGarage, function () { UI.openGarage('menu'); });
      tap(el.btnPause, function () { game.pause(); });
      tap(el.btnResume, function () { game.resume(); });
      tap(el.btnRestart, function () { game.restart(); });
      tap(el.btnResetTruck, function () { game.resetTruck(); });
      tap(el.btnMenuFromPause, function () { UI.showPause(false); game.toMenu(); });
      tap(el.btnNext, function () { var id = game.result ? game.result.levelId + 1 : 1; UI.hideWin(); UI.play(id); });
      tap(el.btnWinRestart, function () { game.restart(); });
      tap(el.btnWinGarage, function () { UI.openGarage('win'); });
      tap(el.btnWinMenu, function () { UI.hideWin(); game.toMenu(); });
      tap(el.btnRetry, function () { game.restart(); });
      tap(el.btnFailGarage, function () { UI.openGarage('fail'); });
      tap(el.btnFailMenu, function () { UI.hideFail(); game.toMenu(); });
      tap(el.btnCloseLevels, function () { el.levels.hidden = true; });
      tap(el.btnCloseGarage, function () { UI.closeGarage(); });
      tap(el.btnCloseSettings, function () { UI.closeSettings(); });
      el.btnAction.addEventListener('pointerdown', function (e) { e.preventDefault(); CT.Audio.unlock(); game.action(); });

      el.optSound.addEventListener('change', function () { CT.Storage.setSetting('sound', el.optSound.checked); UI.syncSound(); });
      el.optEngine.addEventListener('change', function () { CT.Storage.setSetting('engine', el.optEngine.checked); CT.Audio.applySettings(); if (game.isPlaying()) game.applyStateEffects(); });
      el.optVibrate.addEventListener('change', function () { CT.Storage.setSetting('vibrate', el.optVibrate.checked); if (el.optVibrate.checked) CT.vibrate(30); });
      el.optGyro.addEventListener('change', function () { CT.Storage.setSetting('gyro', el.optGyro.checked); CT.Controls.enableGyro(el.optGyro.checked); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-cam]'), function (b) {
        tap(b, function () { game.setCamera(b.getAttribute('data-cam')); UI.syncCamButtons(); });
      });
      tap(el.btnResetProgress, function () {
        var now = Date.now();
        if (now - resetArmed < 3000) {
          CT.Storage.resetProgress(); resetArmed = 0;
          el.btnResetProgress.textContent = 'DONE';
          game.applyPaint(); UI.refreshMenu();
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
      CT.Controls.on('lane', function (dir) { game.requestLane(dir); });
      CT.Controls.on('laneLeft', function () { game.requestLane(1); });
      CT.Controls.on('laneRight', function () { game.requestLane(0); });
      CT.Controls.on('camera', function () { game.cycleCamera(); });
      CT.Controls.on('horn', function () { game.horn(); });
      CT.Controls.on('pause', function () {
        var open = ['settings', 'levels', 'garage'].filter(function (k) { return !el[k].hidden; });
        if (open.length) { if (open[0] === 'garage') UI.closeGarage(); else if (open[0] === 'settings') UI.closeSettings(); else el[open[0]].hidden = true; return; }
        if (game.state === CT.Game.STATES.PAUSED) game.resume(); else game.pause();
      });

      CT.Controls.enableGyro(CT.Storage.getSetting('gyro') === true);
      this.setCameraLabel(game.camMode);
      this.syncSound();
      this.refreshMenu();
    },

    play: function (id) {
      if (!CT.Levels.isUnlocked(id)) return;
      UI.goFullscreen();
      el.levels.hidden = true;
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

    refreshMenu: function () {
      var next = CT.Levels.nextToPlay();
      el.playLevel.textContent = 'Level ' + next;
      el.menuCoins.textContent = CT.Storage.getCoins();
      el.menuStars.textContent = CT.Storage.totalStars();
      var done = CT.Storage.completedCount();
      el.menuDone.textContent = done;
      el.menuBar.style.width = (done / CT.Levels.COUNT * 100) + '%';
    },

    // ------------------------------------------------------------ level select
    openLevels: function () {
      var box = el.levelGrid, html = '', current = CT.Levels.nextToPlay();
      CT.Levels.CHAPTERS.forEach(function (ch, ci) {
        var stars = 0;
        for (var n = ci * 10 + 1; n <= ci * 10 + 10; n++) { var r = CT.Storage.getLevel(n); stars += r ? r.stars : 0; }
        html += '<div class="chapter ch-' + ch.theme + '"><h3>' + (ci + 1) + '. ' + ch.name.toUpperCase() + ' <span>★ ' + stars + '/30</span></h3><div class="chapter-grid">';
        for (n = ci * 10 + 1; n <= ci * 10 + 10; n++) {
          var unlocked = CT.Levels.isUnlocked(n), rec = CT.Storage.getLevel(n);
          if (unlocked) html += '<button type="button" class="lv' + (n === current ? ' current' : '') + '" data-lv="' + n + '" aria-label="Level ' + n + (rec ? ', ' + rec.stars + ' stars' : '') + '">' + n + miniStars(rec ? rec.stars : 0) + '</button>';
          else html += '<div class="lv locked" aria-label="Level ' + n + ' locked">' + n + LOCK_SVG + '</div>';
        }
        html += '</div></div>';
      });
      box.innerHTML = html;
      Array.prototype.forEach.call(box.querySelectorAll('[data-lv]'), function (b) {
        tap(b, function () { UI.play(parseInt(b.getAttribute('data-lv'), 10)); });
      });
      el.levels.hidden = false;
      var cur = box.querySelector('.current');
      if (cur) setTimeout(function () { try { cur.scrollIntoView({ block: 'center' }); cur.focus({ preventScroll: true }); } catch (e) {} }, 30);
    },

    // ------------------------------------------------------------ garage
    openGarage: function (from) {
      garageFrom = from;
      if (from === 'win') el.win.hidden = true;
      if (from === 'fail') el.fail.hidden = true;
      this.renderGarage();
      el.garage.hidden = false;
    },
    closeGarage: function () {
      el.garage.hidden = true;
      if (garageFrom === 'win') el.win.hidden = false;
      else if (garageFrom === 'fail') el.fail.hidden = false;
      game.applyPaint();
      this.refreshMenu();
    },
    renderGarage: function () {
      var coins = CT.Storage.getCoins();
      el.garageCoins.textContent = coins;
      var G = CT.Garage, html = '';
      Object.keys(G.UPGRADES).forEach(function (k) {
        var u = G.UPGRADES[k], lvl = CT.Storage.getUpgrade(k), cost = G.nextCost(k);
        var pips = ''; for (var i = 0; i < G.MAX_LEVEL; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
        html += '<div class="upg"><div class="ico" aria-hidden="true">' + ICONS[k] + '</div><div><h4>' + u.name + ' <small>Lv ' + lvl + '/' + G.MAX_LEVEL + '</small></h4><p>' + u.desc + '</p><div class="pips">' + pips + '</div></div>' +
          (cost === null ? '<button class="btn buy btn-ghost" disabled type="button">MAX</button>'
            : '<button class="btn buy btn-green" type="button" data-up="' + k + '"' + (coins < cost ? ' disabled' : '') + '><span class="coin-ico"></span>' + cost + '</button>') + '</div>';
      });
      el.upgradeList.innerHTML = html;
      Array.prototype.forEach.call(el.upgradeList.querySelectorAll('[data-up]'), function (b) {
        tap(b, function () { if (G.buy(b.getAttribute('data-up'))) { CT.Audio.play('upgrade'); CT.vibrate(30); UI.renderGarage(); } });
      });
      var cur = CT.Storage.getPaint();
      el.paintList.innerHTML = G.PAINTS.map(function (p) {
        var owned = CT.Storage.ownsPaint(p.id);
        return '<button type="button" class="paint' + (p.id === cur ? ' sel' : '') + '" data-paint="' + p.id + '"' + (!owned && coins < p.cost ? ' disabled' : '') + '>' +
          '<span class="sw" style="background:linear-gradient(180deg,' + p.light + ',' + p.body + ' 55%,' + p.dark + ')"></span>' + p.name +
          (owned ? '<span>' + (p.id === cur ? 'In use' : 'Owned') + '</span>' : '<span class="price"><span class="coin-ico"></span>' + p.cost + '</span>') + '</button>';
      }).join('');
      Array.prototype.forEach.call(el.paintList.querySelectorAll('[data-paint]'), function (b) {
        tap(b, function () { if (G.buyPaint(b.getAttribute('data-paint'))) { CT.Audio.play('coin'); game.applyPaint(); UI.renderGarage(); } });
      });
      var cfg = G.truckConfig({ theme: 'country', truck: {} });
      var snow = G.truckConfig({ theme: 'snow', truck: {} });
      el.truckStats.innerHTML =
        '<div>Top speed<br><b>' + Math.round(G.kmh(cfg.maxSpeed)) + ' km/h</b></div>' +
        '<div>Acceleration<br><b>' + Math.round(cfg.accel / 3.3) + '</b></div>' +
        '<div>Snow grip<br><b>' + Math.round(snow.grip * 100) + '%</b></div>' +
        '<div>Cargo protection<br><b>' + Math.round((1 - cfg.damageMult) * 100) + '%</b></div>';
      this.drawGaragePreview();
    },
    drawGaragePreview: function () {
      var c = el.garageCanvas, ctx = c.getContext('2d');
      game.applyPaint();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      var tr = new CT.Truck(); tr.place(0);
      var cm = new CT.CargoManager(CT.Levels.get(1));
      cm.items.forEach(function (it, i) { cm.placeOnTruck(it, i); it.strap = 1; it.pop = 0; });
      ctx.translate(c.width / 2, c.height * 0.8); ctx.scale(1.06, 1.06);
      tr.draw(ctx, { behindBed: function (x) { cm.drawOnTruck(x); }, overBed: function (x) { cm.drawStraps(x); } }, { t: game.t });
    },

    // ------------------------------------------------------------ screens
    showMenu: function () {
      ['hud', 'pause', 'win', 'fail', 'levels', 'garage'].forEach(function (k) { el[k].hidden = true; });
      el.menu.hidden = false; el.lockNote.hidden = true;
      this.refreshMenu();
      setTimeout(function () { try { el.btnPlay.focus({ preventScroll: true }); } catch (e) {} }, 50);
    },

    enterLevel: function (L, g) {
      last = {};
      ['menu', 'pause', 'win', 'fail', 'levels', 'garage'].forEach(function (k) { el[k].hidden = true; });
      el.hud.hidden = false;
      el.levelChipNum.textContent = L.id;
      el.levelChipName.textContent = L.name;
      el.destName.textContent = L.destination.name;
      el.timerChip.hidden = !g.timeLimit;
      el.laneBtns.hidden = !L.traffic;
      el.easyTag.hidden = !g.assist;
      el.easyTag.textContent = g.assist > 1 ? 'EASY+' : 'EASY';
      el.bannerProg.hidden = true;
      this.setHealth(100);
      toastUntil = 0;
      el.banner.classList.remove('hide');
    },

    onState: function (s, g) {
      var ST = CT.Game.STATES;
      if (s === ST.MAIN_MENU || s === ST.PAUSED) return;
      el.controls.classList.toggle('locked', s === ST.LOADING || s === ST.DELIVERING || s === ST.LEVEL_COMPLETE || s === ST.LEVEL_FAILED);
      el.btnPause.hidden = s === ST.LEVEL_COMPLETE || s === ST.LEVEL_FAILED;
      if (s !== ST.LOADING) el.lockNote.hidden = true;
      if (s === ST.LEVEL_COMPLETE) el.banner.classList.add('hide');
      if (s !== ST.LOADING && s !== ST.DELIVERING) el.bannerProg.hidden = true;
      this.refreshAction(g);
    },

    refreshAction: function (g) {
      var ST = CT.Game.STATES, s = g.state === ST.PAUSED ? g.prevState : g.state;
      var b = el.btnAction, mode, text, icon, hint = '', disabled = false;
      switch (s) {
        case ST.LOADING:
          mode = 'hidden';                                   // workers load by themselves; the timer is in the banner
          break;
        case ST.READY_TO_DRIVE: case ST.DRIVING:
          var nearZone = g.level && (g.level.tutorial || (g.level.destination.zone.x1 - (g.truck.x + CT.Truck.FRONT)) < 1800 * CT.K);
          mode = nearZone ? 'deliver' : 'hidden'; text = 'DELIVER'; icon = 'deliver'; disabled = true; hint = 'Stop in the green zone'; break;
        case ST.ARRIVED:
          mode = 'deliver'; text = 'DELIVER'; icon = 'deliver'; hint = 'Tap to unload'; break;
        case ST.DELIVERING:
          mode = 'hidden'; break;
        default: mode = 'hidden';
      }
      b.hidden = mode === 'hidden';
      el.actionHint.textContent = mode === 'hidden' ? '' : hint;
      if (mode !== 'hidden') {
        b.classList.toggle('deliver', mode === 'deliver');
        b.classList.toggle('glow', !disabled);
        b.disabled = disabled;
        el.actionText.textContent = text;
        el.actionIcon.className = 'action-icon ' + icon;
        b.setAttribute('aria-label', text);
      }
      var hk = g.hintKey, want = null;
      if (s === ST.READY_TO_DRIVE || (g.level && g.level.tutorial && (hk === 'drive' || hk === 'wrong'))) want = 'gas';
      else if (hk === 'brake' || hk === 'near' || hk === 'red' || hk === 'curve' || hk === 'curve-now' || hk === 'bump') want = 'brake';
      else if (hk === 'over') want = 'reverse';
      else if (hk === 'traffic') want = 'lane';
      Object.keys(el.pedals).forEach(function (k) { el.pedals[k].classList.toggle('hint', k === want); });
    },

    setBanner: function (title, sub, tone, pop) {
      if (performance.now() < toastUntil) return;
      el.banner.classList.remove('hide', 'good', 'warn', 'bad', 'info');
      if (tone) el.banner.classList.add(tone);
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      if (pop) { el.banner.classList.remove('pop'); void el.banner.offsetWidth; el.banner.classList.add('pop'); }
    },
    setBannerSub: function (sub) { if (performance.now() >= toastUntil) setText(el.bannerSub, 'bsub', sub); },

    toast: function (msg, tone) {
      toastUntil = 0;
      this.setBanner(msg, '', tone || 'warn', true);
      toastUntil = performance.now() + 2000;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastUntil = 0; if (game.level) game.updateHints(true); }, 2050);
    },

    setCargo: function (n, total, bump) {
      el.cargoCount.textContent = n + '/' + total;
      if (bump) { el.cargoChip.classList.remove('bump'); void el.cargoChip.offsetWidth; el.cargoChip.classList.add('bump'); }
    },
    /** Loading / unloading progress with a countdown in the banner. */
    setProgress: function (frac, secs) {
      if (el.bannerProg.hidden) el.bannerProg.hidden = false;
      var w = Math.round(D_clamp(frac, 0, 1) * 100) + '%';
      if (last.prog !== w) { last.prog = w; el.bannerBar.style.width = w; }
      setText(el.bannerTime, 'ptime', fmtTime(Math.ceil(Math.max(0, secs))));
    },
    setHealth: function (h, hurt) {
      el.healthBar.style.width = Math.max(0, h) + '%';
      el.healthBar.style.background = h > 60 ? '#35d55a' : h > 30 ? '#ffc21a' : '#ff4b3e';
      if (hurt) { el.cargoChip.classList.remove('hurt'); void el.cargoChip.offsetWidth; el.cargoChip.classList.add('hurt'); }
    },
    setCameraLabel: function (m) { el.camLabel.textContent = CAM_LABEL[m] || 'SIDE'; this.syncCamButtons(); },
    syncCamButtons: function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-cam]'), function (b) { b.classList.toggle('on', b.getAttribute('data-cam') === game.camMode); });
    },

    updateHud: function (g) {
      var L = g.level, tr = g.truck, z = L.destination.zone, zc = (z.x1 + z.x2) / 2;
      var p = Math.max(0, Math.min(1, (tr.x - L.start.x) / (zc - L.start.x)));
      var pct = (p * 100).toFixed(1) + '%';
      if (last.pct !== pct) { last.pct = pct; el.progFill.style.width = pct; el.progTruck.style.left = pct; }
      var m = Math.max(0, Math.round(Math.abs(zc - tr.x) * CT.Levels.METERS_PER_UNIT));
      setText(el.distLeft, 'dist', g.zone.inside ? 'Arrived' : m >= 1000 ? (m / 1000).toFixed(2) + ' km' : m + ' m');
      setText(el.speedVal, 'spd', String(Math.round(Math.abs(CT.Garage.kmh(tr.v)))));
      var cabView = g.use3D() && g.camMode === 'cab';
      if (last.cab !== cabView) { last.cab = cabView; el.hud.classList.toggle('cab', cabView); }
      var near = (L.destination.zone.x1 - (tr.x + CT.Truck.FRONT)) < 1800 * CT.K;
      if (last.near !== near) { last.near = near; this.refreshAction(g); }
      if (g.timeLimit) {
        var left = g.timeLimit - g.stats.time;
        setText(el.timerVal, 'tm', fmtTime(Math.ceil(left)));
        var low = left < 15;
        if (last.low !== low) { last.low = low; el.timerChip.classList.toggle('low', low); }
      }
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
      el.winLevel.textContent = 'Level ' + r.levelId + ' · ' + r.levelName;
      el.statDist.textContent = r.distance >= 1000 ? (r.distance / 1000).toFixed(2) + ' km' : Math.round(r.distance) + ' m';
      el.statTime.textContent = fmtTime(r.time);
      el.statCoins.textContent = '+' + r.coins;
      el.bestNote.textContent = r.isBest ? 'New best time!' : '';
      el.winStars.innerHTML = bigStar(false) + bigStar(true) + bigStar(false);
      el.winCriteria.innerHTML = r.criteria.map(function (c, i) {
        return '<li class="' + (c.ok ? 'ok' : 'no') + '" style="animation-delay:' + (0.25 + i * 0.3) + 's"><span class="ck">' + (c.ok ? '✓' : '✕') + '</span><div><b>' + c.title + '</b><small>' + c.detail + '</small></div></li>';
      }).join('');
      el.btnNext.hidden = !r.hasNext;
      el.win.hidden = false;
      el.hud.hidden = true;
      var stars = el.winStars.querySelectorAll('.bstar');
      // light stars in order: criteria 1,2,3 map to left, middle, right
      for (var i = 0; i < r.stars; i++) (function (k) {
        setTimeout(function () { stars[k].classList.add('lit'); CT.Audio.play('star'); CT.vibrate(20); }, 450 + k * 380);
      })(i);
      setTimeout(function () { CT.Audio.play('coin'); }, 450 + r.stars * 380 + 200);
      setTimeout(function () { try { (r.hasNext ? el.btnNext : el.btnWinRestart).focus({ preventScroll: true }); } catch (e) {} }, 60);
    },
    hideWin: function () { el.win.hidden = true; },

    showFail: function (info) {
      el.failTitle.textContent = (info.title || 'Level failed').toUpperCase();
      el.failText.textContent = info.text || '';
      el.fail.hidden = false;
      el.hud.hidden = true;
      setTimeout(function () { try { el.btnRetry.focus({ preventScroll: true }); } catch (e) {} }, 60);
    },
    hideFail: function () { el.fail.hidden = true; },

    flash: function () { el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); },

    openSettings: function () {
      el.optSound.checked = CT.Storage.getSetting('sound') !== false;
      el.optEngine.checked = CT.Storage.getSetting('engine') !== false;
      el.optVibrate.checked = CT.Storage.getSetting('vibrate') !== false;
      el.optGyro.checked = CT.Storage.getSetting('gyro') === true;
      this.syncCamButtons();
      el.btnResetProgress.textContent = 'RESET'; resetArmed = 0;
      el.settings.hidden = false;
      setTimeout(function () { try { el.btnCloseSettings.focus({ preventScroll: true }); } catch (e) {} }, 30);
    },
    closeSettings: function () { el.settings.hidden = true; this.refreshMenu(); },

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
