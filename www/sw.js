/* sw.js — caches the game files so it keeps working offline after the first visit. */
var CACHE = 'cargo-truck-driver-v3';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/storage.js', 'js/audio.js', 'js/controls.js', 'js/draw.js', 'js/truck.js', 'js/cargo.js', 'js/workers.js',
  'js/world.js', 'js/traffic.js', 'js/view3d.js', 'js/effects.js', 'js/levels.js', 'js/garage.js', 'js/level1.js', 'js/game.js', 'js/ui.js', 'js/main.js',
  'assets/icon-192.png', 'assets/icon-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      if (res && res.ok && new URL(e.request.url).origin === location.origin) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () { return hit; });
  }));
});
