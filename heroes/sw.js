/* ==========================================================================
   SLING HEROES — offline cache (registered by js/main.js)
   Network first: with internet you always get the newest version from
   GitHub. Every file that loads is also saved, so the game still starts
   without internet. three.js is shared with Balls & Gambling (../js/lib).
   Change CACHE when files are renamed or removed, so old copies get cleared.
   ========================================================================== */
const CACHE = 'sling-heroes-v1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'css/heroes.css',
  '../js/lib/three.min.js',
  '../js/lib/CopyShader.js',
  '../js/lib/LuminosityHighPassShader.js',
  '../js/lib/EffectComposer.js',
  '../js/lib/MaskPass.js',
  '../js/lib/RenderPass.js',
  '../js/lib/ShaderPass.js',
  '../js/lib/UnrealBloomPass.js',
  '../js/lib/RoundedBoxGeometry.js',
  'js/core.js',
  'js/data.js',
  'js/chars.js',
  'js/monsters.js',
  'js/icons.js',
  'js/world.js',
  'js/town.js',
  'js/showroom.js',
  'js/worldmap.js',
  'js/fx.js',
  'js/battle.js',
  'js/state.js',
  'js/ui.js',
  'js/menus.js',
  'js/modes.js',
  'js/music.js',
  'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sling-heroes') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
