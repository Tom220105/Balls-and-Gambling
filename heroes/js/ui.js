/* ==========================================================================
   SLING HEROES — UI toolkit and the town HUD
   * the top bar (avatar, gems, gold, stamina, team level), the side buttons
     and the bottom navigation, with red dots when something can be claimed
   * panel(): the framed fantasy window with a red title ribbon, close button
     and tabs. Panels stack; closing the top one shows the one below.
   * modal(), toast(), rewards() (the "You got" popup with the light rays)
   * pf(): a hero / enemy portrait with frame, level, rarity, element, stars
   * islot(): an item slot with its 3D icon and count
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  const D = SH.data, U = SH.util, GAME = SH.game;
  const $ = U.$;
  const el = U.el;
  const UI = (SH.ui = {});

  // ------------------------------------------------------------ icons on [data-icon]
  UI.applyIcons = (root) => {
    (root || document).querySelectorAll('[data-icon]').forEach((e) => {
      if (e.dataset.iconDone) return;
      const url = SH.icon(e.dataset.icon, 128);
      if (url) { e.style.backgroundImage = `url(${url})`; e.dataset.iconDone = '1'; }
    });
  };
  const ICON_OF = { gold: 'gold', gems: 'gems', stamina: 'stamina', honor: 'honor' };
  UI.iconUrl = (id) => SH.itemIcon(id) || SH.icon(ICON_OF[id] || id);

  // ------------------------------------------------------------ portraits
  UI.pf = (id, opts) => {
    opts = opts || {};
    const enemy = !!opts.enemy;
    const h = enemy ? null : D.HERO[id];
    const E = enemy ? D.ENEMIES[id] : null;
    const elc = D.ELEMENTS[enemy ? E.el : h.el].color;
    const o = enemy ? null : SH.S().heroes[id];
    const e = el('div', `pf ${opts.cls || ''} ${enemy ? '' : 'rar-' + h.rarity}`);
    e.style.setProperty('--elc', elc);
    const bg = el('div', 'pf-bg');
    bg.style.background = `radial-gradient(circle at 50% 35%, ${elc}cc, ${elc}44 55%, #141826 100%)`;
    e.appendChild(bg);
    const img = new Image();
    img.src = SH.portrait(enemy ? 'enemy' : 'hero', id, opts.size || 160);
    e.appendChild(img);
    e.appendChild(el('div', 'pf-frame'));
    if (!enemy) {
      if (!opts.noRar) e.appendChild(el('div', 'pf-rar', h.rarity));
      if (o && !opts.noLv) e.appendChild(el('div', 'pf-lv', String(opts.lvl || o.lvl)));
      if (o && !opts.noStars) e.appendChild(el('div', 'pf-stars', '★'.repeat(o.stars)));
      if (!o && !opts.keepColor) e.classList.add('gray');
    } else if (E.boss || E.mini) e.style.setProperty('--rc', E.boss ? '#ff4a3a' : '#ffb43a');
    if (!opts.noEl) e.appendChild(el('div', 'pf-el'));
    e.appendChild(el('div', 'pf-check'));
    return e;
  };
  UI.islot = (id, n, opts) => {
    opts = opts || {};
    const it = D.ITEMS[id];
    const e = el('div', 'islot' + (it && it.tier !== undefined ? ' tier-' + it.tier : ''));
    const img = new Image();
    img.src = UI.iconUrl(id);
    e.appendChild(img);
    if (n !== undefined && n !== null) e.appendChild(el('b', '', U.fmt(n)));
    return e;
  };
  UI.costHtml = (cost) => Object.keys(cost).map((k) => `<span class="cost"><img src="${UI.iconUrl(k)}">${U.fmt(cost[k])}</span>`).join(' ');
  UI.rewardChips = (r) => {
    const out = [];
    for (const k in r) {
      if (k === 'shards') continue;
      out.push(`<span><img src="${UI.iconUrl(k)}">${U.fmt(r[k])}</span>`);
    }
    return out.join('');
  };
  UI.stars = (n, max) => `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, (max || 0) - n))}</span></span>`;
  UI.elDot = (el) => `<i class="el-badge" style="--elc:${D.ELEMENTS[el].color}"></i>`;

  // ------------------------------------------------------------ toasts + modals
  UI.toast = (text, bad) => {
    const t = el('div', 'toast' + (bad ? ' bad' : ''), text);
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2300);
    if (bad) SH.audio.sfx.error();
  };
  UI.modal = (opts) => {
    const layer = $('modal-layer');
    const veil = el('div', 'veil');
    const m = el('div', 'modal ' + (opts.cls || ''));
    if (opts.title) m.appendChild(el('div', 'm-title', opts.title));
    if (opts.html) m.appendChild(typeof opts.html === 'string' ? el('div', 'm-text', opts.html) : opts.html);
    const btns = el('div', 'm-btns');
    const close = () => { veil.remove(); m.remove(); if (opts.onClose) opts.onClose(); };
    (opts.buttons || [{ label: 'OK' }]).forEach((b) => {
      const bt = el('button', 'btn ' + (b.cls || ''), b.label);
      bt.addEventListener('click', () => { SH.audio.sfx.click(); if (b.keep) { if (b.fn) b.fn(close); return; } close(); if (b.fn) b.fn(); });
      btns.appendChild(bt);
    });
    m.appendChild(btns);
    if (opts.veilClose !== false) veil.addEventListener('click', close);
    layer.appendChild(veil);
    layer.appendChild(m);
    return { close, el: m };
  };
  UI.confirm = (title, text, yes, opts) => UI.modal({ title, html: text, buttons: [{ label: (opts && opts.no) || 'Cancel', cls: 'gray' }, { label: (opts && opts.yes) || 'OK', cls: 'green', fn: yes }] });
  // "You got" popup. list: [{id, n} | {shard, n} | {hero, isNew}]
  UI.rewards = (list, title, then) => {
    list = (list || []).filter(Boolean);
    if (!list.length) { if (then) then(); return; }
    SH.audio.sfx.level();
    const box = el('div', 'rewards');
    box.appendChild(el('div', 'rw-rays'));
    box.appendChild(el('div', 'rw-title', title || 'You got'));
    const wrap = el('div', 'rw-list');
    list.forEach((r, i) => {
      const it = el('div', 'rw-item');
      it.style.animationDelay = (i * 0.06) + 's';
      let slot, name;
      if (r.shard) { slot = UI.pf(r.shard, { noLv: true, noStars: true, keepColor: true }); slot.style.width = '4em'; slot.style.height = '4em'; name = `${D.HERO[r.shard].name} shards x${r.n}`; }
      else if (r.hero) { slot = UI.pf(r.hero, { keepColor: true }); slot.style.width = '4em'; slot.style.height = '4em'; name = r.isNew ? `${D.HERO[r.hero].name} NEW!` : `${D.HERO[r.hero].name} +${r.shards} shards`; }
      else { slot = UI.islot(r.id, r.n); name = r.id === 'gold' || r.id === 'gems' || r.id === 'honor' ? r.id[0].toUpperCase() + r.id.slice(1) : (D.ITEMS[r.id] ? D.ITEMS[r.id].name : r.id); }
      it.appendChild(slot);
      it.appendChild(el('span', '', name));
      wrap.appendChild(it);
    });
    box.appendChild(wrap);
    UI.modal({ html: box, buttons: [{ label: 'Great!', cls: 'gold', fn: then }], cls: 'rw-modal' });
  };

  // ------------------------------------------------------------ panels
  const stack = [];
  UI.stack = stack;
  // opts: title, tabs [{id,label}], tab, cls, render(body, tab, p), onClose, full, keep3D
  UI.panel = (opts) => {
    const p = { opts, tab: opts.tab || (opts.tabs && opts.tabs[0].id) };
    const e = el('div', 'panel ' + (opts.cls || '') + (opts.full ? ' full' : ''));
    if (opts.title) e.appendChild(el('div', 'p-title', opts.title));
    const close = el('button', 'p-close');
    close.addEventListener('click', () => { SH.audio.sfx.back(); p.close(); });
    e.appendChild(close);
    const body = el('div', 'p-body');
    e.appendChild(body);
    let tabs = null;
    if (opts.tabs) {
      tabs = el('div', 'p-tabs');
      opts.tabs.forEach((t) => {
        const b = el('button', t.id === p.tab ? 'on' : '', t.label);
        b.dataset.tab = t.id;
        b.addEventListener('click', () => { if (p.tab === t.id) return; SH.audio.sfx.tab(); p.tab = t.id; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t.id)); p.render(); body.scrollTop = 0; });
        tabs.appendChild(b);
      });
      e.appendChild(tabs);
    }
    p.el = e; p.body = body; p.tabsEl = tabs;
    p.render = () => {
      const st = body.scrollTop;
      body.innerHTML = '';
      opts.render(body, p.tab, p);
      UI.applyIcons(body);
      body.scrollTop = st;
    };
    p.close = (silent) => {
      const i = stack.indexOf(p);
      if (i >= 0) stack.splice(i, 1);
      e.classList.add('out');
      setTimeout(() => e.remove(), 160);
      if (opts.onClose && !silent) opts.onClose();
      UI.sync3D();
      UI.refresh();
    };
    $('panels').appendChild(e);
    stack.push(p);
    SH.audio.sfx.open();
    p.render();
    UI.sync3D();
    return p;
  };
  UI.closeAll = () => { while (stack.length) stack[stack.length - 1].close(true); };
  UI.top = () => stack[stack.length - 1];
  // the 3D picture behind a panel is paused and blurred, unless the panel shows 3D itself
  UI.sync3D = () => {
    const t = UI.top();
    SH.pause3D(!!t && !t.opts.keep3D);
    document.body.classList.toggle('panel-open', !!t);
    // only the top panel is shown, the ones below wait hidden
    stack.forEach((p) => { if (p.el) p.el.style.visibility = p === t ? '' : 'hidden'; });
  };
  UI.rerender = () => { stack.forEach((p) => p.render()); };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const t = UI.top();
      if (t) t.close();
      else if (SH.onEscape) SH.onEscape();
    }
  });

  // ------------------------------------------------------------ HUD
  const hud = $('hud');
  UI.showHUD = (on) => hud.classList.toggle('hidden', !on);
  let lastRes = {};
  UI.refresh = () => {
    const S = SH.S();
    GAME.tickStamina();
    const set = (k, v) => {
      const e = $('r-' + k);
      if (!e) return;
      if (e.textContent !== v) {
        e.textContent = v;
        if (lastRes[k] !== undefined) { const r = e.parentNode; r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump'); }
        lastRes[k] = v;
      }
    };
    set('gems', U.fmt(S.gems));
    set('gold', U.fmt(S.gold));
    set('stamina', `${S.stamina}/${GAME.maxStamina()}`);
    $('tb-lv').textContent = S.teamLv;
    $('tb-tlv').textContent = S.teamLv;
    const need = D.teamExpNeed(S.teamLv);
    $('tb-expfill').style.width = Math.min(100, S.teamExp / need * 100) + '%';
    $('tb-exptext').textContent = `${S.teamExp}/${need}`;
    const leader = S.team.find(Boolean);
    if (leader && UI._face !== leader) { UI._face = leader; $('tb-face').src = SH.portrait('hero', leader, 160); }
    // red dots
    const dot = (sel, on) => { const e = document.querySelector(sel); if (e) e.classList.toggle('has-dot', !!on); };
    dot('[data-side="login"]', !S.login.claimed);
    dot('[data-side="mail"]', GAME.mailUnread() > 0);
    dot('[data-side="expedition"]', GAME.unlocked('expedition') && (GAME.expeditionReady() || S.expedition.some((e) => !e)));
    dot('[data-side="summon"]', (S.items.scroll || 0) > 0 || (S.items.pscroll || 0) > 0);
    dot('[data-side="arena"]', GAME.unlocked('arena') && S.arena.tickets > 0);
    dot('[data-nav="missions"]', GAME.missionBadge());
    dot('[data-nav="heroes"]', heroBadge());
    dot('[data-nav="shop"]', GAME.freeGemsReady());
    dot('[data-nav="inventory"]', ['chest_gold', 'chest_gear', 'chest_shard'].some((k) => S.items[k] > 0));
    dot('[data-nav="mastery"]', GAME.unlocked('mastery') && D.EL_ORDER.some((e) => S.mastery[e] < GAME.masteryMax() && S.gold >= GAME.masteryCost(e) * 3));
  };
  function heroBadge() {
    const S = SH.S();
    for (const h of D.HEROES) {
      if (!S.heroes[h.id]) { if ((S.shards[h.id] || 0) >= GAME.unlockCost(h.id)) return true; continue; }
      const o = S.heroes[h.id];
      if (o.stars < D.MAX_STARS && (S.shards[h.id] || 0) >= D.starCost(o.stars)) return true;
    }
    return false;
  }
  UI.heroBadge = heroBadge;
  SH.onChange(() => UI.refresh());
  setInterval(() => { if (!hud.classList.contains('hidden')) UI.refresh(); }, 5000);

  // town building states (red "!" and locks), read by js/town.js every frame
  SH.townState = (id) => {
    const S = SH.S();
    const lock = (f) => (GAME.unlocked(f) ? null : `Team Lv ${D.UNLOCK[f]}`);
    switch (id) {
      case 'campaign': return { badge: S.stamina >= 6 && S.daily.prog.win < 3 };
      case 'summon': return { badge: (S.items.scroll || 0) + (S.items.pscroll || 0) > 0 };
      case 'mail': return { badge: GAME.mailUnread() > 0 };
      case 'shop': return { badge: GAME.freeGemsReady() };
      case 'arena': return { locked: lock('arena'), badge: GAME.unlocked('arena') && S.arena.tickets > 0 };
      case 'tower': return { locked: lock('tower') };
      case 'expedition': return { locked: lock('expedition'), badge: GAME.unlocked('expedition') && GAME.expeditionReady() };
      case 'guild': return { locked: lock('guild'), badge: GAME.unlocked('guild') && S.guild.tries > 0 };
      case 'mastery': return { locked: lock('mastery') };
      default: return {};
    }
  };

  // wire the HUD buttons (menus.js fills SH.menus)
  UI.wire = () => {
    hud.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { SH.audio.sfx.click(); SH.menus.open(b.dataset.nav); }));
    hud.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { SH.audio.sfx.click(); SH.menus.open(b.dataset.side); }));
    hud.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); SH.audio.sfx.click(); SH.menus.plus(b.dataset.plus); }));
    $('tb-avatar').addEventListener('click', () => { SH.audio.sfx.click(); SH.menus.open('profile'); });
    UI.applyIcons(hud);
    document.querySelectorAll('.res .ri').forEach((e) => { e.style.backgroundImage = `url(${SH.icon(e.dataset.icon)})`; });
  };

  // a hero's stat line in short
  UI.heroLine = (id) => {
    const h = D.HERO[id];
    return `${UI.elDot(h.el)} ${D.ELEMENTS[h.el].name} · ${h.type === 'bounce' ? 'Bounce' : 'Pierce'} · ${h.role}`;
  };
})();
