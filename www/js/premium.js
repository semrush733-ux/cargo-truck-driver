/* premium.js — the premium electric truck "Volt Ranger EV": truck cards (garage + 3D menu), 3 free demo drives,
   the showroom preview, and the one-time unlock screen. Ownership comes only from CT.Store (Google Play). */
(function (CT) {
  'use strict';
  var DEMOS = 3;
  var $ = function (id) { return document.getElementById(id); };
  var modal = null;

  function tap(node, fn) { node.addEventListener('click', function (e) { CT.Audio.unlock(); fn(e); }); }

  var Premium = {
    DEMOS: DEMOS,
    /** Owned through Google Play (or, in a desktop browser only, through the labelled test mock). */
    owned: function () {
      var p = CT.Storage.getPremium();
      if (!p.owned) return false;
      if (p.source === 'play') return true;
      return p.source === 'mock' && !CT.Store.isNative();
    },
    demosLeft: function () { return Math.max(0, DEMOS - CT.Storage.getPremium().demoUsed); },
    canDemo: function () { return !this.owned() && this.demosLeft() > 0; },
    canDrive: function () { return this.owned(); },
    /** Counts the demo drive once per attempt (called when the truck actually starts driving). */
    countDemo: function (attemptId) {
      var used = CT.Storage.useDemo(attemptId);
      return used;
    },

    init: function () {
      if (this._init) return; this._init = true;
      CT.Store.init();
      CT.Store.on(function (ev) {
        if (ev === 'purchased') Premium.onPurchased();
        if (ev === 'pending') Premium.status('Payment pending. The truck unlocks as soon as Google Play confirms it.', 'warn');
        if (ev === 'product' || ev === 'ready' || ev === 'owned') Premium.refreshOpen();
      });
      // a selected premium truck that is not (or no longer locally) owned falls back to the free truck
      if (CT.Storage.getTruck() === 'volt' && !this.owned()) CT.Storage.setTruck('classic');
    },

    // ------------------------------------------------------------ truck cards
    renderPicker: function (box) {
      if (!box) return;
      var sel = CT.Storage.getTruck(), own = this.owned(), left = this.demosLeft();
      var S = CT.Garage.BASE3D;
      var spec = function (k) {
        var b = S[k];
        return '<ul class="tspec"><li><span>Top speed</span><b>' + b.top + ' km/h</b></li><li><span>Acceleration</span><b>' + (k === 'volt' ? 'Instant' : 'Steady') + '</b></li>' +
          '<li><span>Braking</span><b>' + (k === 'volt' ? 'Strong' : 'Good') + '</b></li><li><span>Cargo</span><b>' + CT.Trucks3D_SPEC[k] + '</b></li></ul>';
      };
      var classic = '<div class="tcard' + (sel === 'classic' ? ' sel' : '') + '"><div class="tthumb classic" aria-hidden="true"></div><h4>Classic Hauler</h4>' + spec('classic') +
        '<button type="button" class="btn btn-small ' + (sel === 'classic' ? 'btn-ghost' : 'btn-green') + '" data-truck="classic"' + (sel === 'classic' ? ' disabled' : '') + '>' + (sel === 'classic' ? 'SELECTED' : 'SELECT') + '</button></div>';
      var btns;
      if (own) btns = '<button type="button" class="btn btn-small ' + (sel === 'volt' ? 'btn-ghost' : 'btn-green') + '" data-truck="volt"' + (sel === 'volt' ? ' disabled' : '') + '>' + (sel === 'volt' ? 'SELECTED' : 'SELECT') + '</button>';
      else if (left > 0) btns = '<button type="button" class="btn btn-small btn-green" data-pact="try">TRY FREE <small>' + left + ' of ' + DEMOS + ' left</small></button>';
      else btns = '<button type="button" class="btn btn-small btn-orange" data-pact="buy">UNLOCK TRUCK</button>';
      var volt = '<div class="tcard premium' + (sel === 'volt' ? ' sel' : '') + '"><span class="pbadge">PREMIUM</span><div class="tthumb volt" aria-hidden="true"></div><h4>Volt Ranger EV</h4>' + spec('volt') +
        '<div class="trow">' + btns + '<button type="button" class="btn btn-small btn-blue" data-pact="view">VIEW 3D</button></div>' +
        (own ? '' : '<p class="tnote">' + (left > 0 ? 'Free demo drives left: ' + left + ' of ' + DEMOS : 'Free demo drives used') + '</p>') + '</div>';
      box.innerHTML = '<h3 class="sub-title">TRUCKS</h3><div class="tcards">' + classic + volt + '</div>';
      Array.prototype.forEach.call(box.querySelectorAll('[data-truck]'), function (b) {
        tap(b, function () {
          var k = b.getAttribute('data-truck');
          if (k === 'volt' && !Premium.owned()) return;
          CT.Storage.setTruck(k); CT.Audio.play('click'); Premium.renderPicker(box);
        });
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-pact]'), function (b) {
        tap(b, function () {
          var a = b.getAttribute('data-pact');
          if (a === 'try') Premium.startDemo();
          else if (a === 'buy') Premium.openPurchase();
          else if (a === 'view') Premium.openShowroom();
        });
      });
    },

    /** TRY FREE: starts a normal 3D delivery with the premium truck. The attempt is counted when it starts driving. */
    startDemo: function () {
      if (this.owned()) { CT.Storage.setTruck('volt'); return; }
      if (!this.canDemo()) { this.openPurchase(); return; }
      ['garage', 'levels3d', 'menu'].forEach(function (k) { var e = $(k); if (e) e.hidden = true; });
      CT.Load3D.ensure(function () { CT.Game3D.play(CT.Levels3D.nextToPlay(), { demo: true }); });
    },
    /** Called on the result / fail screen of a demo drive. */
    afterDemo: function () {
      if (this.owned()) return;
      if (this.demosLeft() <= 0) setTimeout(function () { Premium.openPurchase(true); }, 2200);
    },

    openShowroom: function () {
      CT.Load3D.ensure(function () { CT.Showroom3D.open(); });
    },

    // ------------------------------------------------------------ purchase screen
    build: function () {
      if (modal) return modal;
      var d = document.createElement('section');
      d.id = 'premiumBuy'; d.className = 'screen modal-wrap'; d.hidden = true; d.setAttribute('aria-label', 'Premium electric truck');
      d.innerHTML = '<div class="modal modal-premium">' +
        '<div class="ribbon ribbon-ev">PREMIUM ELECTRIC TRUCK</div>' +
        '<div class="pv-art" aria-hidden="true"><div class="tthumb volt big"></div><i class="bolt">⚡</i></div>' +
        '<p class="pv-lead" id="pvLead">Enjoyed your test drives? Unlock this truck permanently!</p>' +
        '<ul class="pv-feat"><li>⚡ Premium electric performance</li><li>🚀 Fast acceleration</li><li>✨ Modern styling with LED lights</li><li>🚚 A fully usable truck in 3D deliveries</li></ul>' +
        '<div class="pv-price"><b id="pvPrice">…</b><small>One-time purchase · not a subscription</small></div>' +
        '<p class="pv-status" id="pvStatus" hidden></p>' +
        '<div class="pv-mock" id="pvMock" hidden><b>DEVELOPMENT MOCK: no real payment</b><span>Browser test only. Pick what Google Play would answer:</span>' +
        '<div class="row"><button class="btn btn-small btn-green" type="button" data-mock="success">Success</button><button class="btn btn-small btn-ghost" type="button" data-mock="cancel">Cancel</button><button class="btn btn-small btn-danger" type="button" data-mock="fail">Fail</button><button class="btn btn-small btn-blue" type="button" data-mock="pending">Pending</button></div></div>' +
        '<div class="modal-buttons"><button class="btn btn-green btn-big" type="button" id="pvBuy">UNLOCK TRUCK</button>' +
        '<div class="row"><button class="btn btn-ghost" type="button" id="pvNot">NOT NOW</button><button class="btn btn-blue" type="button" id="pvRestore">RESTORE PURCHASES</button></div></div>' +
        '<div class="pv-done" id="pvDone" hidden><div class="burst"></div><h2>PURCHASE SUCCESSFUL</h2><p>The Volt Ranger EV is yours. It is now your selected truck.</p><button class="btn btn-green btn-big" type="button" id="pvDrive">DRIVE IT</button></div>' +
        '</div>';
      $('app').appendChild(d);
      modal = d;
      tap($('pvBuy'), function () { Premium.buy(); });
      tap($('pvNot'), function () { Premium.closePurchase(); });
      tap($('pvRestore'), function () {
        Premium.status('Checking your Google Play account…', 'info');
        CT.Store.restore(function (r) {
          if (r === 'owned') Premium.onPurchased(true);
          else if (r === 'none') Premium.status('No purchase found for this Google account.', 'warn');
          else if (r === 'mock') Premium.status('Restore needs the Android app (Google Play). In the browser use the mock buttons.', 'info');
          else Premium.status('Google Play is not reachable right now. Try again later.', 'bad');
        });
      });
      tap($('pvDrive'), function () { Premium.closePurchase(); if (!CT.Mode3D || !CT.Mode3D.active) CT.Game3D_play(CT.Levels3D.nextToPlay()); });
      Array.prototype.forEach.call(d.querySelectorAll('[data-mock]'), function (b) {
        tap(b, function () {
          var k = b.getAttribute('data-mock');
          $('pvMock').hidden = true; $('pvBuy').disabled = false; CT.Store.state.busy = false;
          if (k === 'success') CT.Store.mockResult('success');
          else if (k === 'pending') CT.Store.mockResult('pending');
          else if (k === 'cancel') Premium.status('Purchase cancelled. Nothing was charged.', 'info');
          else Premium.status('Payment failed. Nothing was charged; the truck stays locked.', 'bad');
        });
      });
      return d;
    },
    openPurchase: function (afterDemos) {
      this.build();
      $('pvLead').textContent = afterDemos || this.demosLeft() === 0 ? 'Enjoyed your test drives? Unlock this truck permanently!' : 'Unlock the Volt Ranger EV permanently (you still have free demo drives).';
      $('pvDone').hidden = true; $('pvStatus').hidden = true; $('pvMock').hidden = true;
      $('pvBuy').disabled = false;
      this.refreshOpen();
      modal.hidden = false;
      if (this.owned()) this.onPurchased(true);
    },
    refreshOpen: function () {
      if (!modal || modal.hidden && !$('pvPrice')) return;
      var st = CT.Store.state;
      $('pvPrice').textContent = st.mode === 'play' ? (st.price || 'Loading price from Google Play…') : st.mode === 'mock' ? 'Price shown by Google Play' : 'Store not available';
      $('pvBuy').disabled = st.mode === 'unavailable' || st.busy;
      if (st.mode === 'unavailable' && !modal.hidden) this.status('Google Play Billing is not available on this device / build. The truck stays locked.', 'bad');
    },
    closePurchase: function () { if (modal) modal.hidden = true; CT.Store.state.busy = false; var g = $('garage'); if (g && !g.hidden) CT.UI.renderGarage(); },
    status: function (msg, tone) { var e = $('pvStatus'); if (!e) return; e.hidden = false; e.className = 'pv-status ' + (tone || ''); e.textContent = msg; },

    buy: function () {
      var btn = $('pvBuy');
      if (btn.disabled) return;
      btn.disabled = true;                      // stops double taps; the flow can only run once at a time
      CT.Store.buy(function (r) {
        if (r === 'mock') { $('pvMock').hidden = false; CT.Store.state.busy = true; Premium.status('', ''); $('pvStatus').hidden = true; return; }
        if (r === 'started') { Premium.status('Complete the payment in the Google Play window…', 'info'); return; }
        btn.disabled = false;
        if (r === 'owned') Premium.onPurchased(true);
        else if (r === 'busy') Premium.status('A purchase is already in progress.', 'info');
        else if (r === 'cancelled') Premium.status('Purchase cancelled. Nothing was charged.', 'info');
        else if (r === 'unavailable') Premium.status('Google Play is not available right now. The truck stays locked.', 'bad');
        else Premium.status('Payment failed. Nothing was charged; the truck stays locked.', 'bad');
      });
    },
    onPurchased: function (quiet) {
      if (!this.owned()) return;
      CT.Storage.setTruck('volt');
      this.build();
      if (modal.hidden && quiet) return;
      modal.hidden = false;
      $('pvDone').hidden = false;
      if (!quiet) { CT.Audio.play('unlock'); CT.vibrate([40, 40, 120]); }
      var g = $('garage'); if (g && !g.hidden) CT.UI.renderGarage();
      var p = $('truckPick'); if (p && !$('levels3d').hidden) this.renderPicker(p);
    }
  };

  CT.Trucks3D_SPEC = { classic: '3 loads · 6 t', volt: '3 loads · 2.5 t' };
  CT.Premium = Premium;
  CT.Game3D_play = function (id, opts) { CT.Load3D.ensure(function () { CT.Game3D.play(id, opts); }); };
  document.addEventListener('DOMContentLoaded', function () { Premium.init(); });
  if (document.readyState !== 'loading') setTimeout(function () { Premium.init(); }, 0);
})(window.CT);
