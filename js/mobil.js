/* ==========================================================================
   BALLS & GAMBLING — PC, phone or tablet
   Loaded before the game. On the very first start the player picks the device
   (PC / PHONE / TABLET, changeable later in the settings). The answer sets
   NEON.platform, which the game reads for the camera, the render resolution,
   the frame-rate target and the touch controls. It also marks <body>:
     body.touch      hints show taps instead of keys
     body.pf-phone / pf-tablet / pf-pc
     body.no-fs      no fullscreen to switch to (iPhone, or installed as an app)
   Also stops the iOS pinch zoom and registers sw.js, the offline cache.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = (window.NEON = window.NEON || {});
  const body = document.body;
  const $ = (id) => document.getElementById(id);
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const KEY = 'neonSigil.platform';
  const PLATFORMS = ['pc', 'phone', 'tablet'];
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } },
  };

  // best guess before the player answers: a finger as main pointer = phone or tablet
  const mobile = mq('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mq('(pointer: fine)'));
  NEON.mobile = mobile;
  const shortSide = Math.min(screen.width || window.innerWidth, screen.height || window.innerHeight);
  const guess = !mobile ? 'pc' : shortSide >= 600 ? 'tablet' : 'phone';
  const saved = store.get();
  NEON.platform = PLATFORMS.includes(saved) ? saved : guess;

  // touch play can switch on the fly (a laptop with a touch screen, an iPad with a mouse): the last input wins
  function setTouch(on) {
    if (body.classList.contains('touch') !== on) body.classList.toggle('touch', on);
  }
  NEON.isTouch = () => body.classList.contains('touch');
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true);
    else if (e.pointerType === 'mouse') setTouch(false);
  }, true);
  window.addEventListener('keydown', (e) => {
    // typing into a text field (the RESET box) with the phone keyboard is still touch play
    if (e.target instanceof HTMLInputElement) return;
    if (NEON.platform === 'pc') setTouch(false);
  }, true);

  function applyPlatform() {
    PLATFORMS.forEach((p) => body.classList.toggle('pf-' + p, NEON.platform === p));
    setTouch(NEON.platform !== 'pc');
  }
  applyPlatform();

  // called by the start question and by the settings: saves the answer and tells the game
  NEON.setPlatform = function (p, first) {
    if (!PLATFORMS.includes(p)) return;
    NEON.platform = p;
    store.set(p);
    applyPlatform();
    window.dispatchEvent(new CustomEvent('neon-platform', { detail: { platform: p, first: !!first } }));
  };

  // the start question, only until it has been answered once
  function ask() {
    const screenEl = $('screen-platform');
    if (!screenEl) return;
    screenEl.querySelectorAll('.pf-card').forEach((b) => {
      b.classList.toggle('guess', b.dataset.pf === guess);
      b.addEventListener('click', () => {
        NEON.setPlatform(b.dataset.pf, true);
        screenEl.classList.add('hidden');
      });
    });
    screenEl.classList.remove('hidden');
  }
  if (!PLATFORMS.includes(saved)) ask();

  // installed on the home screen: the game already fills the screen
  const standalone = mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || navigator.standalone === true;
  body.classList.toggle('standalone', standalone);
  // iPhones have no fullscreen API for web pages
  const canFullscreen = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  body.classList.toggle('no-fs', standalone || !canFullscreen);

  // iOS ignores user-scalable=no, so block the pinch zoom by hand
  ['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));

  // offline cache (only works when the game is served over http/https, e.g. GitHub Pages)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* no offline mode, the game still runs */ });
    });
  }
})();
