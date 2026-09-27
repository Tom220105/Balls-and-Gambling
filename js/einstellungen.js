/* ==========================================================================
   NEON SIGIL — settings screen
   Audio, graphics and gameplay options (applied live by js/spiel.js through
   NEON.settings) and the RESET GAME button. Resetting deletes every save key
   of the game, so it sits behind two safety steps: type RESET, then hold the
   button for 3 seconds with the mouse / finger (keyboard presses don't count).
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!NEON.settings || !NEON.game) return;
  const S = NEON.settings;
  const $ = (id) => document.getElementById(id);
  const play = (name) => { const s = NEON.audio && NEON.audio.sfx; if (s && s[name]) s[name](); };
  const SAVE_PREFIX = 'neonSigil.';
  const HOLD_MS = 3000;
  const CONFIRM_WORD = 'RESET';

  const ROWS = [
    { group: 'AUDIO' },
    { k: 'master', label: 'Master volume', type: 'slider', max: 100, unit: '%' },
    { k: 'music', label: 'Music', type: 'slider', max: 100, unit: '%' },
    { k: 'sfx', label: 'Sound effects', type: 'slider', max: 100, unit: '%' },
    { k: '_mute', label: 'Mute everything', hint: 'Shortcut: M', type: 'toggle', get: () => S.muted, set: () => S.toggleMute() },
    { group: 'GRAPHICS' },
    { k: 'quality', label: 'Render quality', hint: 'AUTO lowers the resolution by itself when the frame rate drops', type: 'choice',
      options: [['auto', 'AUTO'], ['high', 'HIGH'], ['medium', 'MEDIUM'], ['low', 'LOW']] },
    { k: 'bloom', label: 'Neon glow', hint: 'Bloom strength — 0 switches it off', type: 'slider', max: 150, unit: '%' },
    { k: 'reflect', label: 'Mirror floor', hint: 'Reflections on the arena floor (always off on LOW)', type: 'toggle' },
    { k: 'shake', label: 'Screen shake', type: 'slider', max: 100, unit: '%' },
    { k: 'bgfx', label: 'Reactive background', hint: 'Towers, searchlights and fireworks react to the action — HYPE, combos and FEVER', type: 'toggle' },
    { k: 'fps', label: 'FPS counter', type: 'toggle' },
    { group: 'GAMEPLAY' },
    { k: 'popups', label: 'Damage numbers', hint: 'Floating score and damage numbers', type: 'toggle' },
    { k: '_cursor', label: 'Capture the cursor in games', hint: 'Keeps the mouse inside the game while you play (ESC frees it)', type: 'toggle',
      get: () => $('btn-cursor').classList.contains('on'), set: () => $('btn-cursor').click() },
    { k: '_fs', label: 'Fullscreen', type: 'toggle', get: () => !!document.fullscreenElement, set: () => $('btn-fullscreen').click() },
    { group: 'DATA' },
    { danger: true },
  ];

  const valueOf = (row) => (row.get ? row.get() : S.get(row.k));

  function render() {
    const body = $('set-body');
    body.innerHTML = '';
    let section = null;
    ROWS.forEach((row) => {
      if (row.group) {
        section = document.createElement('section');
        section.className = 'set-group';
        section.innerHTML = `<h3>${row.group}</h3>`;
        body.appendChild(section);
        return;
      }
      const el = document.createElement('div');
      el.className = 'set-row' + (row.danger ? ' danger' : '');
      if (row.danger) {
        el.innerHTML = '<div class="set-label"><b>Reset game</b><span>Deletes ALL progress: coins, gear, skill tree, scores, RPG heroes, bubble levels, settings.</span></div>' +
          '<button class="set-reset" id="set-reset">RESET GAME…</button>';
        el.querySelector('button').addEventListener('click', () => { play('error'); openDanger(); });
        section.appendChild(el);
        return;
      }
      el.innerHTML = `<div class="set-label"><b>${row.label}</b>${row.hint ? `<span>${row.hint}</span>` : ''}</div><div class="set-ctrl"></div>`;
      const ctrl = el.querySelector('.set-ctrl');
      if (row.type === 'slider') {
        ctrl.innerHTML = `<input type="range" min="0" max="${row.max}" step="5" value="${valueOf(row)}"><output>${valueOf(row)}${row.unit || ''}</output>`;
        const input = ctrl.querySelector('input'), out = ctrl.querySelector('output');
        const paint = () => input.style.setProperty('--p', ((100 * input.value) / row.max).toFixed(1) + '%');
        paint();
        input.addEventListener('input', () => { S.set(row.k, +input.value); out.textContent = input.value + (row.unit || ''); paint(); });
        input.addEventListener('change', () => play('tick'));
      } else if (row.type === 'toggle') {
        ctrl.innerHTML = '<button class="set-toggle" role="switch"><i></i></button>';
        const b = ctrl.querySelector('button');
        const paint = () => { const on = !!valueOf(row); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); };
        paint();
        b.addEventListener('click', () => {
          if (row.set) row.set(); else S.set(row.k, !S.get(row.k));
          play('click');
          setTimeout(paint, 60);   // fullscreen / cursor switch asynchronously
        });
      } else if (row.type === 'choice') {
        ctrl.innerHTML = '<div class="set-choice">' + row.options.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('') + '</div>';
        const paint = () => ctrl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.get(row.k)));
        paint();
        ctrl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.set(row.k, b.dataset.v); play('click'); paint(); }));
      }
      section.appendChild(el);
    });
  }

  function open() {
    NEON.game.pause();
    render();
    $('screen-settings').classList.remove('hidden');
    play('click');
  }
  function close() {
    closeDanger();
    $('screen-settings').classList.add('hidden');
    play('click');
  }
  const isOpen = () => !$('screen-settings').classList.contains('hidden');

  // ---------------------------------------------------------- reset game
  const hold = { raf: 0, start: 0, active: false };
  const armed = () => $('sd-input').value.trim().toUpperCase() === CONFIRM_WORD;

  function openDanger() {
    $('sd-input').value = '';
    $('set-danger').classList.remove('hidden');
    updateArm();
    setTimeout(() => $('sd-input').focus(), 50);
  }
  function closeDanger() {
    cancelHold();
    $('set-danger').classList.add('hidden');
  }
  function updateArm() {
    $('sd-hold').disabled = !armed();
    $('sd-hold').classList.toggle('armed', armed());
    $('sd-label').textContent = armed() ? 'HOLD FOR 3 SECONDS TO DELETE EVERYTHING' : 'TYPE ' + CONFIRM_WORD + ' FIRST';
  }
  function startHold(e) {
    if (!armed() || hold.active) return;
    e.preventDefault();
    hold.active = true;
    hold.start = performance.now();
    play('charge');
    const step = () => {
      if (!hold.active) return;
      const k = Math.min(1, (performance.now() - hold.start) / HOLD_MS);
      $('sd-fill').style.width = (k * 100).toFixed(1) + '%';
      $('sd-label').textContent = k < 1 ? 'KEEP HOLDING… ' + Math.ceil((HOLD_MS * (1 - k)) / 1000) : 'DELETING…';
      if (k >= 1) { hold.active = false; wipe(); return; }
      hold.raf = requestAnimationFrame(step);
    };
    hold.raf = requestAnimationFrame(step);
  }
  function cancelHold() {
    if (!hold.active) return;
    hold.active = false;
    cancelAnimationFrame(hold.raf);
    $('sd-fill').style.width = '0%';
    updateArm();
  }
  // deletes every save key of the game and starts fresh
  function wipe() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(SAVE_PREFIX) === 0) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* storage blocked — nothing saved anyway */ }
    play('lose');
    $('sd-card').classList.add('wiped');
    $('sd-label').textContent = 'PROGRESS DELETED — REBOOTING…';
    setTimeout(() => location.reload(), 900);
  }

  // --------------------------------------------------------------- wiring
  $('btn-settings').addEventListener('click', open);
  $('btn-pause-settings').addEventListener('click', (e) => { e.stopPropagation(); open(); });
  $('btn-settings-sys').addEventListener('click', open);
  $('set-back').addEventListener('click', close);
  $('sd-cancel').addEventListener('click', () => { play('click'); closeDanger(); });
  $('sd-input').addEventListener('input', updateArm);
  const holdBtn = $('sd-hold');
  holdBtn.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => holdBtn.addEventListener(ev, cancelHold));
  holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());   // a long touch must not open a menu
  $('set-danger').addEventListener('click', (e) => { if (e.target.id === 'set-danger') closeDanger(); });

  // ESC closes the settings (or the reset dialog) before the game sees the key
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      if (!$('set-danger').classList.contains('hidden')) closeDanger(); else close();
      e.preventDefault();
    }
    // no game shortcuts (M, P, SPACE …) behind the settings; typing and focus still work
    e.stopImmediatePropagation();
  }, true);
  document.addEventListener('fullscreenchange', () => { if (isOpen()) render(); });

  NEON.settingsScreen = { open, close };
})();
