/* ==========================================================================
   NEON SIGIL — phones & tablets
   Loaded before the game. Marks touch play on <body> (body.touch) so the HUD
   shows taps instead of keys, hides buttons that need a mouse or have no
   fullscreen to switch to, stops the iOS pinch zoom and registers sw.js,
   the offline cache that lets the installed game start without internet.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = (window.NEON = window.NEON || {});
  const body = document.body;
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);

  // phone or tablet: the main pointer is a finger
  const mobile = mq('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mq('(pointer: fine)'));
  NEON.mobile = mobile;

  // touch play can switch on the fly (laptops with a touch screen): the last input wins
  function setTouch(on) {
    if (body.classList.contains('touch') !== on) body.classList.toggle('touch', on);
  }
  setTouch(mobile);
  NEON.isTouch = () => body.classList.contains('touch');
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true);
    else if (e.pointerType === 'mouse') setTouch(false);
  }, true);
  window.addEventListener('keydown', (e) => {
    // typing into a text field (the RESET box) with the phone keyboard is still touch play
    if (e.target instanceof HTMLInputElement) return;
    if (!mobile) setTouch(false);
  }, true);

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
