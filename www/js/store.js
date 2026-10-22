/* store.js — one-time (non-consumable) in-app product through Google Play Billing.
   Android app: uses cordova-plugin-purchase (CdvPurchase v13, works inside Capacitor), which talks to the official
   Google Play Billing Library. Ownership is granted ONLY after Google Play reports an approved purchase that has
   been verified and acknowledged ("finished"); pressing the button never unlocks anything by itself.
   Browser: a clearly labelled DEVELOPMENT MOCK lets you test the screens; it never runs in the Android app. */
(function (CT) {
  'use strict';
  var PRODUCT_ID = 'premium_electric_truck_unlock';
  var listeners = [];
  var S = {
    mode: 'none',          // 'play' (real Google Play) | 'mock' (browser test) | 'unavailable'
    ready: false,
    busy: false,           // a purchase flow is open: further taps are ignored
    price: null,           // localized price string from Google Play
    error: null
  };

  function native() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  function emit(ev, data) { listeners.slice().forEach(function (fn) { try { fn(ev, data); } catch (e) { console.error(e); } }); }
  function grantFromPlay() {
    CT.Storage.setPremiumOwned('play');
    emit('owned', { source: 'play' });
  }

  var Store = {
    PRODUCT_ID: PRODUCT_ID,
    state: S,
    isNative: native,
    on: function (fn) { listeners.push(fn); },

    init: function () {
      if (S.mode !== 'none') return;
      if (!native()) { S.mode = 'mock'; S.ready = true; S.price = null; return; }
      var C = window.CdvPurchase;
      if (!C || !C.store) {
        // Billing plugin missing in this build: the truck stays locked; nothing is faked.
        S.mode = 'unavailable'; S.error = 'Google Play Billing is not available in this build.';
        return;
      }
      S.mode = 'play';
      var store = C.store;
      try {
        store.verbosity = C.LogLevel ? C.LogLevel.WARNING : 1;
        store.register([{ id: PRODUCT_ID, type: C.ProductType.NON_CONSUMABLE, platform: C.Platform.GOOGLE_PLAY }]);
        store.when()
          .productUpdated(function (p) {
            if (p.id !== PRODUCT_ID) return;
            var offer = p.getOffer && p.getOffer();
            var ph = offer && offer.pricingPhases && offer.pricingPhases[0];
            S.price = (ph && ph.price) || (p.pricing && p.pricing.price) || S.price;
            if (p.owned) grantFromPlay();                        // restore on start / re-check
            emit('product', p);
          })
          .approved(function (tx) { tx.verify(); })                // Google Play approved the payment
          .verified(function (receipt) { receipt.finish(); })      // acknowledges the purchase with Google Play
          .finished(function (tx) {
            var ours = (tx.products || []).some(function (pr) { return pr.id === PRODUCT_ID; });
            if (ours) { S.busy = false; grantFromPlay(); emit('purchased', tx); }
          })
          .pending(function (tx) {
            var ours = (tx.products || []).some(function (pr) { return pr.id === PRODUCT_ID; });
            if (ours) { S.busy = false; emit('pending', tx); }
          });
        store.error(function (err) { S.error = err && err.message; emit('error', err); });
        store.initialize([C.Platform.GOOGLE_PLAY]).then(function () { S.ready = true; Store.recheck(); emit('ready'); });
      } catch (e) { S.mode = 'unavailable'; S.error = String(e && e.message || e); }
    },

    /** Asks Google Play again whether this account owns the truck. */
    recheck: function () {
      if (S.mode !== 'play') return;
      var C = window.CdvPurchase, p = C.store.get(PRODUCT_ID, C.Platform.GOOGLE_PLAY);
      if (p && p.owned) grantFromPlay();
    },
    /** "Restore purchases": reloads the account's purchases from Google Play. */
    restore: function (cb) {
      if (S.mode !== 'play') { if (cb) cb(S.mode === 'mock' ? 'mock' : 'unavailable'); return; }
      var C = window.CdvPurchase;
      C.store.restorePurchases().then(function () { Store.recheck(); if (cb) cb(CT.Premium.owned() ? 'owned' : 'none'); })
        .catch(function () { if (cb) cb('error'); });
    },

    /**
     * Starts the official Google Play purchase sheet. cb(result): 'started' | 'busy' | 'cancelled' | 'failed' | 'unavailable' | 'owned'.
     * The unlock itself happens later, only from the 'finished' event above.
     */
    buy: function (cb) {
      cb = cb || function () {};
      if (CT.Premium.owned()) { cb('owned'); return; }
      if (S.busy) { cb('busy'); return; }
      if (S.mode === 'mock') { cb('mock'); return; }
      if (S.mode !== 'play' || !S.ready) { cb('unavailable'); return; }
      var C = window.CdvPurchase, p = C.store.get(PRODUCT_ID, C.Platform.GOOGLE_PLAY);
      var offer = p && p.getOffer && p.getOffer();
      if (!offer) { cb('unavailable'); return; }
      S.busy = true;
      C.store.order(offer).then(function (err) {
        if (!err) { cb('started'); return; }                  // the result arrives through the events
        S.busy = false;
        var cancelled = C.ErrorCode && err.code === C.ErrorCode.PAYMENT_CANCELLED;
        cb(cancelled ? 'cancelled' : 'failed', err);
      }).catch(function (e) { S.busy = false; cb('failed', e); });
    },

    /** Browser-only test helper. Never available in the Android app. */
    mockResult: function (kind) {
      if (S.mode !== 'mock' || native()) return false;
      if (kind === 'success') { CT.Storage.setPremiumOwned('mock'); emit('owned', { source: 'mock' }); emit('purchased', { mock: true }); }
      else if (kind === 'pending') emit('pending', { mock: true });
      return true;
    }
  };

  CT.Store = Store;
})(window.CT);
