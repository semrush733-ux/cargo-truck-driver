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
  var ACC_ICON = { lightbar: '💡', horns: '📯', bullbar: '🛡️', flaps: '🟫', beacon: '🚨', stripe: '🏁' };
  var ACH_ICON = { first_delivery: '📦', first_perfect: '💎', deliveries_10: '🚚', deliveries_50: '🛣️', items_100: '💯', no_loss_10: '🔒', first_upgrade: '🔧',
    stylist: '🎨', distance_25: '📍', distance_100: '🌍', stars_30: '⭐', chapter_1: '🌄', all_levels: '👑' };
  var MIS_ICON = { deliver3: '🚚', perfect1: '💎', noloss2: '🔒', dist5: '🛣️', items9: '📦', stars6: '⭐', clean1: '🚦', fast1: '⏱️' };
  function fmtNum(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
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
    var gl = '<i class="glint" style="--gx:-26px;--gy:-22px"></i><i class="glint g2" style="--gx:24px;--gy:-6px"></i><i class="glint g3" style="--gx:-4px;--gy:26px"></i>';
    return '<div class="bstar' + (mid ? ' mid' : '') + '">' + gl +
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
        'optSound', 'optEngine', 'optVibrate', 'optGyro', 'btnResetProgress', 'btnCloseSettings', 'rotateHint', 'flash',
        'optMusic', 'optGyroSens', 'gyroSensVal', 'btnMissions', 'missionBadge', 'btnAchievements', 'missions', 'achievements', 'missionList', 'missionCoins',
        'btnCloseMissions', 'achList', 'achCount', 'btnCloseAch', 'wheelList', 'accList', 'fuelBar', 'fuelChip', 'itemPips', 'winCargo', 'winExplain', 'winBreakdown', 'splash'
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
      tap(el.btnMissions, function () { UI.openMissions(); });
      tap(el.btnAchievements, function () { UI.openAchievements(); });
      tap(el.btnCloseMissions, function () { el.missions.hidden = true; UI.refreshMenu(); });
      tap(el.btnCloseAch, function () { el.achievements.hidden = true; });
      el.optMusic.addEventListener('change', function () { CT.Storage.setSetting('music', el.optMusic.checked); CT.Audio.music(el.optMusic.checked); });
      el.optGyroSens.addEventListener('input', function () {
        var v = parseInt(el.optGyroSens.value, 10);
        CT.Storage.setSetting('gyroSens', v); el.gyroSensVal.textContent = '(tilt ' + v + '°)';
      });
      CT.Progress.onUnlock(function (a, got) {
        CT.Audio.play('achieve'); CT.vibrate([30, 40, 30]);
        UI.achToast('🏆 ' + a.name + (got ? '  +' + fmtNum(got) + ' cash' : ''));
        UI.refreshMenu();
      });
      tap(el.btnPause, function () { game.pause(); });
      tap(el.btnResume, function () { game.resume(); });
      tap(el.btnRestart, function () { game.restart(); });
      tap(el.btnResetTruck, function () { game.resetTruck(); });
      tap(el.btnMenuFromPause, function () { UI.showPause(false); game.toMenu(); });
      // result buttons serve both the 2D game and the 3D mode
      var g3 = function () { return UI.resultOwner === '3d' && CT.Game3D && CT.Game3D.cur ? CT.Game3D.cur : null; };
      tap(el.btnNext, function () {
        var c = g3();
        if (c) { var r = c.result, demo = c.demo; UI.hideWin(); CT.Game3D.play(r.levelId + 1, { demo: demo && CT.Premium.canDemo() }); return; }
        var id = game.result ? game.result.levelId + 1 : 1; UI.hideWin(); UI.play(id);
      });
      tap(el.btnWinRestart, function () { var c = g3(); UI.hideWin(); if (c) c.restart(); else game.restart(); });
      tap(el.btnWinGarage, function () { UI.openGarage('win'); });
      tap(el.btnWinMenu, function () { var c = g3(); UI.hideWin(); if (c) c.quit(); else game.toMenu(); });
      tap(el.btnRetry, function () { var c = g3(); UI.hideFail(); if (c) c.restart(); else game.restart(); });
      tap(el.btnFailGarage, function () { UI.openGarage('fail'); });
      tap(el.btnFailMenu, function () { var c = g3(); UI.hideFail(); if (c) c.quit(); else game.toMenu(); });
      el.btnPlay3d = $('btnPlay3d'); el.levels3d = $('levels3d'); el.level3dGrid = $('level3dGrid'); el.truckPick = $('truckPick'); el.play3dLevel = $('play3dLevel');
      tap(el.btnPlay3d, function () { UI.open3d(); });
      tap($('btnClose3d'), function () { el.levels3d.hidden = true; });
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
        if (CT.Mode3D && CT.Mode3D.active) return;
        var open = ['settings', 'levels', 'garage', 'missions', 'achievements', 'levels3d'].filter(function (k) { return !el[k].hidden; });
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

    resultOwner: '2d',

    // ------------------------------------------------------------ 3D level select (+ truck choice)
    open3d: function () {
      var html = '', cur = CT.Levels3D.nextToPlay();
      CT.Levels3D.LIST.forEach(function (L) {
        var ok = CT.Levels3D.isUnlocked(L.id), rec = CT.Storage.getLevel3d(L.id);
        var tags = [L.tutorial ? 'Tutorial' : null, L.theme === 'snow' ? 'Snow' : L.theme === 'desert' ? 'Desert' : null, L.weather !== 'clear' ? (L.weather === 'rain' ? 'Rain' : 'Fog') : null,
          L.segments.some(function (sg) { return sg.cliff; }) ? 'Mountain' : null, L.segments.some(function (sg) { return sg.type === 'bridge'; }) ? 'Bridge' : null].filter(Boolean).join(' · ');
        html += ok ? '<button type="button" class="l3d' + (L.id === cur ? ' current' : '') + '" data-l3="' + L.id + '"><b>' + L.id + '</b><span>' + L.name + '</span><small>' + tags + '</small>' + miniStars(rec ? rec.stars : 0) + '</button>'
          : '<div class="l3d locked"><b>' + L.id + '</b><span>' + L.name + '</span>' + LOCK_SVG + '</div>';
      });
      el.level3dGrid.innerHTML = html;
      Array.prototype.forEach.call(el.level3dGrid.querySelectorAll('[data-l3]'), function (b) {
        tap(b, function () { UI.goFullscreen(); el.levels3d.hidden = true; CT.Game3D_play(parseInt(b.getAttribute('data-l3'), 10)); });
      });
      CT.Premium.renderPicker(el.truckPick);
      el.levels3d.hidden = false;
    },

    refreshMenu: function () {
      if (el.play3dLevel) el.play3dLevel.textContent = 'Level ' + CT.Levels3D.nextToPlay();
      var next = CT.Levels.nextToPlay();
      el.playLevel.textContent = 'Level ' + next;
      el.menuCoins.textContent = fmtNum(CT.Storage.getCoins());
      var unclaimed = CT.Progress.unclaimedCount();
      el.missionBadge.hidden = !unclaimed; el.missionBadge.textContent = unclaimed;
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
      el.garageCoins.textContent = fmtNum(coins);
      var G = CT.Garage, html = '';
      Object.keys(G.UPGRADES).forEach(function (k) {
        var u = G.UPGRADES[k], lvl = CT.Storage.getUpgrade(k), cost = G.nextCost(k);
        var pips = ''; for (var i = 0; i < G.MAX_LEVEL; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
        html += '<div class="upg"><div class="ico" aria-hidden="true">' + u.icon + '</div><div><h4>' + u.name + ' <small>Lv ' + lvl + '/' + G.MAX_LEVEL + '</small></h4><p>' + u.desc + '</p><div class="pips">' + pips + '</div></div>' +
          (cost === null ? '<button class="btn buy btn-ghost" disabled type="button">MAX</button>'
            : '<button class="btn buy btn-green" type="button" data-up="' + k + '"' + (coins < cost && k !== 'engine' ? ' disabled' : '') + '><span class="coin-ico"></span>' + fmtNum(cost) + '</button>') + '</div>';
      });
      el.upgradeList.innerHTML = html;
      Array.prototype.forEach.call(el.upgradeList.querySelectorAll('[data-up]'), function (b) {
        tap(b, function () {
          var key = b.getAttribute('data-up');
          if (key === 'engine') { UI.confirmEngine(); return; }      // engine upgrades go through the workshop
          if (G.buy(key)) { CT.Audio.play('upgrade'); CT.vibrate(30); UI.renderGarage(); }
        });
      });
      CT.Premium.renderPicker($('truckPickGarage'));
      function price(owned, inUse, cost, onLabel) {
        return owned ? '<span>' + (inUse ? onLabel : 'Owned') + '</span>' : '<span class="price"><span class="coin-ico"></span>' + fmtNum(cost) + '</span>';
      }
      var cur = CT.Storage.getPaint();
      el.paintList.innerHTML = G.PAINTS.map(function (p) {
        var owned = CT.Storage.ownsPaint(p.id);
        return '<button type="button" class="paint' + (p.id === cur ? ' sel' : '') + '" data-paint="' + p.id + '"' + (!owned && coins < p.cost ? ' disabled' : '') + '>' +
          '<span class="sw" style="background:linear-gradient(180deg,' + p.light + ',' + p.body + ' 55%,' + p.dark + ')"></span>' + p.name + price(owned, p.id === cur, p.cost, 'In use') + '</button>';
      }).join('');
      var curW = CT.Storage.getWheel();
      el.wheelList.innerHTML = G.WHEELS.map(function (w) {
        var owned = CT.Storage.ownsWheel(w.id);
        return '<button type="button" class="paint' + (w.id === curW ? ' sel' : '') + '" data-wheel="' + w.id + '"' + (!owned && coins < w.cost ? ' disabled' : '') + '>' +
          '<span class="whl" style="background:radial-gradient(circle,' + w.hub + ' 0 22%,' + w.rim[0] + ' 23% 35%,' + w.rim[1] + ' 36% 60%,' + w.rim[2] + ' 61% 70%,#1d1d22 71%)"></span>' + w.name + price(owned, w.id === curW, w.cost, 'Fitted') + '</button>';
      }).join('');
      var eq = CT.Storage.getEquipped();
      el.accList.innerHTML = G.ACCESSORIES.map(function (a) {
        var owned = CT.Storage.ownsAccessory(a.id), on = eq.indexOf(a.id) >= 0;
        return '<button type="button" class="paint acc' + (on ? ' on' : '') + '" data-acc="' + a.id + '" title="' + a.desc + '"' + (!owned && coins < a.cost ? ' disabled' : '') + '>' +
          '<span class="ico" aria-hidden="true">' + (ACC_ICON[a.id] || '★') + '</span>' + a.name + (owned ? '<span>' + (on ? 'Fitted ✓' : 'Tap to fit') + '</span>' : price(false, false, a.cost)) + '</button>';
      }).join('');
      function bind(list, attr, fn) {
        Array.prototype.forEach.call(list.querySelectorAll('[' + attr + ']'), function (b) {
          tap(b, function () { if (fn(b.getAttribute(attr))) { CT.Audio.play('coin'); game.applyPaint(); UI.renderGarage(); } else CT.Audio.play('invalid'); });
        });
      }
      bind(el.paintList, 'data-paint', function (id) { return G.buyPaint(id); });
      bind(el.wheelList, 'data-wheel', function (id) { return G.buyWheel(id); });
      bind(el.accList, 'data-acc', function (id) { return G.buyAccessory(id); });
      var cfg = G.truckConfig({ theme: 'country', truck: {} });
      var snow = G.truckConfig({ theme: 'snow', truck: {} });
      el.truckStats.innerHTML =
        '<div>Top speed<br><b>' + Math.round(G.kmh(cfg.maxSpeed)) + ' km/h</b></div>' +
        '<div>Acceleration<br><b>' + Math.round(cfg.accel / 3.3) + '</b></div>' +
        '<div>Braking<br><b>' + Math.round(cfg.brake / 23) + '</b></div>' +
        '<div>Snow grip<br><b>' + Math.round(snow.grip * 100) + '%</b></div>' +
        '<div>Cargo protection<br><b>' + Math.round((1 - cfg.damageMult) * 100) + '%</b></div>' +
        '<div>Fuel tank<br><b>' + Math.round(cfg.fuelCapacity) + ' L</b></div>';
      this.drawGaragePreview();
    },

    // ------------------------------------------------------------ engine upgrade: confirm → pay once → workshop
    confirmEngine: function () {
      var G = CT.Garage, lvl = CT.Storage.getUpgrade('engine'), cost = G.nextCost('engine');
      if (cost === null) return;
      var d = $('engineConfirm');
      if (!d) {
        d = document.createElement('section'); d.id = 'engineConfirm'; d.className = 'screen modal-wrap'; d.hidden = true;
        d.innerHTML = '<div class="modal"><h2 class="modal-title">ENGINE UPGRADE</h2><div id="ecBody"></div>' +
          '<div class="modal-buttons"><button class="btn btn-green btn-big" type="button" id="ecYes">UPGRADE</button><button class="btn btn-ghost" type="button" id="ecNo">CANCEL</button></div></div>';
        $('app').appendChild(d);
        tap($('ecNo'), function () { d.hidden = true; });
        tap($('ecYes'), function () { UI.buyEngine(); });
      }
      var a = G.engineEffect(lvl), b = G.engineEffect(lvl + 1), cash = CT.Storage.getCoins(), ok = cash >= cost;
      var pc = function (x, y) { return '+' + Math.round((y / x - 1) * 100) + '%'; };
      $('ecBody').innerHTML = '<ul class="ws-list"><li><span>Upgrade</span><b>Engine Lv ' + lvl + ' → ' + (lvl + 1) + '</b><em>' + b.label + '</em></li>' +
        '<li><span>Acceleration</span><b>' + pc(a.accel, b.accel) + '</b></li><li><span>Top speed</span><b>' + pc(a.top, b.top) + '</b></li><li><span>Hill power</span><b>' + pc(a.hill, b.hill) + '</b></li>' +
        '<li><span>Price</span><b><span class="coin-ico"></span> ' + fmtNum(cost) + '</b></li><li><span>Your cash</span><b><span class="coin-ico"></span> ' + fmtNum(cash) + '</b></li></ul>' +
        (ok ? '<p class="sub-note">Your truck drives into the workshop for the upgrade.</p>' : '<p class="pv-status bad">Not enough cash. You need ' + fmtNum(cost - cash) + ' more. Deliver more cargo to earn cash.</p>');
      $('ecYes').disabled = !ok;
      d.hidden = false;
    },
    buyEngine: function () {
      var btn = $('ecYes');
      if (btn.disabled || UI._buying || (CT.Workshop3D && CT.Workshop3D.running)) return;
      UI._buying = true; btn.disabled = true;                          // repeated taps cannot buy twice
      var from = CT.Storage.getUpgrade('engine');
      var ok = CT.Garage.buy('engine');                                // charges once and saves the new level
      $('engineConfirm').hidden = true;
      UI._buying = false;
      if (!ok) { CT.Audio.play('invalid'); UI.achToast('Not enough cash for the engine upgrade'); return; }
      var info = { from: from, to: CT.Storage.getUpgrade('engine'), kind: CT.Premium.owned() ? CT.Storage.getTruck() : 'classic' };
      if (!CT.Load3D.supported()) { CT.Audio.play('upgrade'); UI.renderGarage(); return; }   // no 3D on this phone: the upgrade still counts
      CT.Load3D.ensure(function () { CT.Workshop3D.play(info, garageFrom); });
    },

    // ------------------------------------------------------------ missions & achievements
    openMissions: function () {
      var list = CT.Progress.missions();
      el.missionCoins.textContent = fmtNum(CT.Storage.getCoins());
      el.missionList.innerHTML = list.map(function (m) {
        var unit = m.unit === 'm' ? function (v) { return (v / 1000).toFixed(1) + ' km'; } : function (v) { return String(Math.floor(v)); };
        var btn = m.claimed ? '<button class="btn buy btn-ghost" type="button" disabled>CLAIMED ✓</button>'
          : '<button class="btn buy btn-green" type="button" data-claim="' + m.id + '"' + (m.done ? '' : ' disabled') + '><span class="coin-ico"></span>' + fmtNum(m.reward) + '</button>';
        return '<div class="task' + (m.claimed ? ' done-claimed' : '') + '"><div class="ico" aria-hidden="true">' + (MIS_ICON[m.id] || '🎯') + '</div><div><h4>' + m.name + '</h4><p>' + m.desc + '</p>' +
          '<div class="bar"><i style="width:' + Math.round(m.progress / m.target * 100) + '%"></i></div><div class="meta">' + unit(m.progress) + ' / ' + unit(m.target) + '</div></div>' + btn + '</div>';
      }).join('');
      Array.prototype.forEach.call(el.missionList.querySelectorAll('[data-claim]'), function (b) {
        tap(b, function () { var got = CT.Progress.claim(b.getAttribute('data-claim')); if (got) { CT.Audio.play('coin'); CT.vibrate(30); } UI.openMissions(); UI.refreshMenu(); });
      });
      el.missions.hidden = false;
    },
    openAchievements: function () {
      var list = CT.Progress.achievements(), n = list.filter(function (a) { return a.unlocked; }).length;
      el.achCount.textContent = n + '/' + list.length;
      el.achList.innerHTML = list.map(function (a) {
        var unit = a.unit === 'm' ? function (v) { return (v / 1000).toFixed(1) + ' km'; } : function (v) { return String(Math.floor(v)); };
        var when = a.unlocked ? 'Unlocked ' + new Date(a.at).toLocaleDateString() : unit(a.value) + ' / ' + unit(a.target);
        return '<div class="task ' + (a.unlocked ? 'unlocked' : 'locked') + '"><div class="ico" aria-hidden="true">' + (a.unlocked ? (ACH_ICON[a.id] || '🏆') : '🔒') + '</div><div><h4>' + a.name + '</h4><p>' + a.desc + '</p>' +
          (a.unlocked ? '' : '<div class="bar"><i style="width:' + Math.round(a.value / a.target * 100) + '%"></i></div>') + '<div class="meta">' + when + '</div></div>' +
          '<div class="reward"><span class="coin-ico"></span>' + fmtNum(a.reward) + '</div></div>';
      }).join('');
      el.achievements.hidden = false;
    },
    achToast: function (msg) {
      var d = document.createElement('div');
      d.className = 'ach-toast'; d.textContent = msg;
      document.getElementById('app').appendChild(d);
      setTimeout(function () { d.classList.add('out'); }, 2600);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3200);
    },
    hideSplash: function () { if (el.splash) { el.splash.classList.add('done'); setTimeout(function () { el.splash.hidden = true; }, 500); } },

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
      ['hud', 'pause', 'win', 'fail', 'levels', 'garage', 'missions', 'achievements', 'levels3d'].forEach(function (k) { if (el[k]) el[k].hidden = true; });
      UI.resultOwner = '2d';
      el.menu.hidden = false; el.lockNote.hidden = true;
      this.refreshMenu();
      setTimeout(function () { try { el.btnPlay.focus({ preventScroll: true }); } catch (e) {} }, 50);
    },

    enterLevel: function (L, g) {
      last = {};
      ['menu', 'pause', 'win', 'fail', 'levels', 'garage', 'missions', 'achievements'].forEach(function (k) { el[k].hidden = true; });
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
          if (!g.loadCrew.started && g.cargo.loadedCount() < g.cargo.required) { mode = 'load'; text = 'LOAD'; icon = 'load'; hint = 'Workers load it for you'; }
          else mode = 'hidden';
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
      if (g.recoverable && (s === ST.DRIVING || s === ST.READY_TO_DRIVE || s === ST.ARRIVED)) { mode = 'recover'; text = 'RECOVER'; icon = 'load'; hint = 'Put the cargo back'; disabled = false; }
      b.hidden = mode === 'hidden';
      el.actionHint.textContent = mode === 'hidden' ? '' : hint;
      if (mode !== 'hidden') {
        b.classList.toggle('deliver', mode === 'deliver');
        b.classList.toggle('recover', mode === 'recover');
        b.classList.toggle('load', mode === 'load');
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
      if (g.fuelMax) {
        var ff = Math.max(0, g.fuel / g.fuelMax), fw = Math.round(ff * 100) + '%';
        if (last.fuel !== fw) {
          last.fuel = fw; el.fuelBar.style.width = fw;
          el.fuelBar.style.background = ff > 0.4 ? '#ffc21a' : ff > 0.2 ? '#ff8a1f' : '#ff4b3e';
          el.fuelChip.classList.toggle('low', ff < 0.2);
        }
      }
      var ST2 = CT.CargoManager.STATE, pips = g.cargo.items.map(function (it) {
        if (it.lost || it.destroyed || it.state === ST2.FALLEN) return 'lost';
        if (it.state === ST2.DOCK || it.state === ST2.CARRY) return 'dock';
        return it.health > 70 ? 'ok' : it.health > 35 ? 'mid' : 'low';
      }).join(',');
      if (last.pips !== pips) {
        last.pips = pips;
        el.itemPips.innerHTML = pips.split(',').map(function (c) { return c === 'dock' ? '<i style="opacity:.35"></i>' : '<i class="' + c + '"></i>'; }).join('');
      }
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
      el.statCoins.textContent = '+' + fmtNum(r.coins);
      el.winCargo.innerHTML = '<span>Loaded <b>' + r.loaded + '</b></span><span>Delivered <b>' + r.delivered + '/' + r.required + '</b></span>' +
        '<span>Lost <b>' + r.lost + '</b></span><span>Condition <b>' + r.condition + '%</b></span><span>Fuel left <b>' + r.fuelLeft + '%</b></span>';
      el.winExplain.textContent = r.explain || '';
      el.winBreakdown.innerHTML = (r.breakdown || []).map(function (l) { return '<li><span>' + l.label + '</span><b>+' + fmtNum(l.amount) + '</b></li>'; }).join('') +
        '<li class="total"><span>Total cash</span><b>+' + fmtNum(r.coins) + '</b></li>';
      el.bestNote.textContent = r.isBest ? 'New best time!' : '';
      el.winStars.innerHTML = bigStar(false) + bigStar(true) + bigStar(false);
      el.winCriteria.innerHTML = r.criteria.map(function (c, i) {
        return '<li class="' + (c.ok ? 'ok' : 'no') + '" style="animation-delay:' + (0.25 + i * 0.3) + 's"><span class="ck">' + (c.ok ? '✓' : '✕') + '</span><div><b>' + c.title + '</b><small>' + c.detail + '</small></div></li>';
      }).join('');
      el.btnNext.hidden = !r.hasNext;
      el.win.hidden = false;
      el.hud.hidden = true;
      UI.celebrate(r);
      var stars = el.winStars.querySelectorAll('.bstar');
      // light stars in order: criteria 1,2,3 map to left, middle, right
      for (var i = 0; i < r.stars; i++) (function (k) {
        setTimeout(function () { stars[k].classList.add('lit'); CT.Audio.play('star'); CT.vibrate(20); }, 450 + k * 380);
      })(i);
      setTimeout(function () { CT.Audio.play('coin'); }, 450 + r.stars * 380 + 200);
      setTimeout(function () { try { (r.hasNext ? el.btnNext : el.btnWinRestart).focus({ preventScroll: true }); } catch (e) {} }, 60);
    },
    /** Confetti, sun rays and a counting-up cash total on the result card. */
    celebrate: function (r) {
      var card = el.win.querySelector('.modal-win');
      var old = card.querySelector('.confetti-box'); if (old) old.parentNode.removeChild(old);
      el.winStars.classList.remove('shine');
      setTimeout(function () { el.winStars.classList.add('shine'); }, 400);
      var box = document.createElement('div'); box.className = 'confetti-box';
      var cols = ['#ffd21f', '#ff5a5a', '#4fc3ff', '#7dff8a', '#ff8af0', '#ffffff'];
      var n = 46;
      for (var i = 0; i < n; i++) {
        var c = document.createElement('i');
        c.style.left = (Math.random() * 100) + '%';
        c.style.background = cols[i % cols.length];
        c.style.setProperty('--cx', Math.round((Math.random() - 0.5) * 160) + 'px');
        c.style.setProperty('--cr', Math.round((Math.random() - 0.5) * 1080) + 'deg');
        c.style.animationDuration = (2.2 + Math.random() * 2) + 's';
        c.style.animationDelay = (0.3 + Math.random() * 1.2) + 's';
        if (i % 3 === 0) { c.style.width = '10px'; c.style.height = '10px'; c.style.borderRadius = '50%'; }
        box.appendChild(c);
      }
      card.appendChild(box);
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 5200);
      // count the cash up
      var target = r.coins || 0, t0 = performance.now() + 500 + r.stars * 380, dur = 900, statBox = el.statCoins.parentNode;
      el.statCoins.textContent = '+0';
      (function step(now) {
        if (el.win.hidden) return;
        var u = Math.max(0, Math.min(1, (now - t0) / dur));
        el.statCoins.textContent = '+' + fmtNum(Math.round(target * (1 - Math.pow(1 - u, 3))));
        if (u > 0 && u < 1 && Math.floor(u * 10) !== Math.floor((u - 0.016) * 10)) { statBox.classList.remove('bump'); void statBox.offsetWidth; statBox.classList.add('bump'); }
        if (u < 1) requestAnimationFrame(step);
      })(performance.now());
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
      el.optMusic.checked = CT.Storage.getSetting('music') === true;
      var gs = CT.Storage.getSetting('gyroSens') || 15;
      el.optGyroSens.value = gs; el.gyroSensVal.textContent = '(tilt ' + gs + '°)';
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
