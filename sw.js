/* ==========================================================================
   BALLS & GAMBLING — offline cache (registered by js/mobil.js)
   Network first: when there is internet you always get the newest version
   from GitHub. Every file that loads is also saved, so the game still starts
   without internet (on the bus, in flight mode ...).
   Change CACHE when files are renamed or removed, so old copies get cleared.
   ========================================================================== */
const CACHE = 'balls-gambling-v5';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'css/style.css',
  'css/menues.css',
  'css/rpg.css',
  'css/bubbles.css',
  'css/settings.css',
  'css/mobil.css',
  'js/lib/three.min.js',
  'js/lib/CopyShader.js',
  'js/lib/LuminosityHighPassShader.js',
  'js/lib/EffectComposer.js',
  'js/lib/MaskPass.js',
  'js/lib/RenderPass.js',
  'js/lib/ShaderPass.js',
  'js/lib/UnrealBloomPass.js',
  'js/lib/RoundedBoxGeometry.js',
  'js/lib/Reflector.js',
  'js/mobil.js',
  'js/profil.js',
  'js/modelle.js',
  'js/spiel.js',
  'js/funky.js',
  'js/sammlung.js',
  'js/skills.js',
  'js/lotterie.js',
  'js/rpg-helden.js',
  'js/rpg-idle.js',
  'js/rpg.js',
  'js/rpg-kampf.js',
  'js/bubbles.js',
  'js/einstellungen.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // keep a copy of everything that loaded fine (game files and the Google fonts)
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
