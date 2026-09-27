/* ==========================================================================
   BALLS & GAMBLING — Collection: browse balls, bouncepads, cyberguns and the RPG
   heroes, inspect them on a rotating holo-pedestal, read their abilities and
   equip them (heroes are managed in the RPG, the button jumps there).
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!window.THREE || !NEON.profile || !NEON.models || !NEON.stage3d || !NEON.game) return;
  const P = NEON.profile, M = NEON.models, S3 = NEON.stage3d;
  const $ = (id) => document.getElementById(id);
  const play = (name, arg) => { const s = NEON.audio && NEON.audio.sfx; if (s && s[name]) s[name](arg); };
  // RPG heroes (js/rpg-helden.js, js/rpg.js load after this file, so look them up when needed)
  const RD = () => NEON.rpgData;
  const hasHeroes = () => !!(NEON.rpgData && NEON.rpg && NEON.rpg.roster);
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  // --------------------------------------------------------- 3D viewer
  function makeViewer(withPedestal) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0x6a5aff, 0.5));
    const key = new THREE.PointLight(0xff3cf2, 2.4, 30);
    key.position.set(-4, 5, 4);
    const fill = new THREE.PointLight(0x19e6ff, 2.4, 30);
    fill.position.set(4, 3, 5);
    const top = new THREE.DirectionalLight(0xffffff, 0.8);
    top.position.set(0, 10, 3);
    scene.add(key, fill, top);

    let ring = null;
    if (withPedestal) {
      const pedGeo = new THREE.CylinderGeometry(2.2, 2.4, 0.3, 6);
      const base = new THREE.Mesh(pedGeo, new THREE.MeshStandardMaterial({ color: 0x141830, metalness: 0.9, roughness: 0.22 }));
      base.position.y = -0.15;
      base.add(new THREE.LineSegments(new THREE.EdgesGeometry(pedGeo), new THREE.LineBasicMaterial({ color: 0x19e6ff })));
      ring = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.68, 96), new THREE.MeshBasicMaterial({
        color: 0xff3cf2, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.28;
      const under = M.glow(0x7a4dff, 7, 0.5);
      under.position.y = -0.3;
      scene.add(base, ring, under);
    }

    const holder = new THREE.Group();
    scene.add(holder);
    let model = null, kind = 'ball', t = 0;
    const camBase = new THREE.Vector3(), look = new THREE.Vector3();

    // thumbnails (no pedestal) are framed tighter than the big preview
    const FRAME = withPedestal
      ? { ball: { scale: 2.6, y: 1.3, cam: [0, 2.8, 8.6], look: [0, 1.05, 0] },
          pad: { scale: 0.8, y: 0.05, cam: [0, 3.1, 8.2], look: [0, 0.6, 0] },
          gun: { scale: 1.1, y: 0.05, cam: [0, 3.8, 9.4], look: [0, 0.7, 0] },
          hero: { scale: 1.45, y: 1.35, cam: [0, 2.5, 7.6], look: [0, 1.2, 0] } }
      : { ball: { scale: 2.6, y: 1.3, cam: [0, 2.3, 6.4], look: [0, 1.3, 0] },
          pad: { scale: 0.8, y: 0, cam: [0, 2.6, 5.6], look: [0, 0.55, 0] },
          gun: { scale: 1.0, y: 0, cam: [0, 3.4, 7.4], look: [0, 0.6, -0.4] },
          hero: { scale: 1.45, y: 1.35, cam: [0, 2.2, 6.2], look: [0, 1.35, 0] } };

    return {
      scene, camera,
      set(k, id) {
        if (model) holder.remove(model.group);
        kind = k;
        model = k === 'hero' ? RD().makeHeroModel(RD().HERO[id])
          : k === 'ball' ? M.makeBall(id) : k === 'gun' ? M.makeGun(id) : M.makePad(id);
        if (k === 'pad') model.layout(4.2);
        if (k === 'gun') model.turret.rotation.y = 0.7;   // show the barrel at an angle
        holder.add(model.group);
        const f = FRAME[k];
        model.group.scale.setScalar(f.scale);
        model.group.position.y = f.y;
        camBase.fromArray(f.cam);
        look.fromArray(f.look);
        holder.rotation.y = kind === 'ball' ? 0.4 : 0.35;
      },
      update(dt) {
        t += dt;
        // pull the camera back on tall/narrow viewports so wide pads never get cropped
        const k = Math.max(1, (kind === 'ball' ? 0.9 : 1.0) / camera.aspect);
        camera.position.copy(camBase).sub(look).multiplyScalar(k).add(look);
        camera.lookAt(look);
        if (dt > 0) holder.rotation.y = kind === 'pad' || kind === 'hero' ? 0.35 + Math.sin(t * 0.5) * 0.6 : 0.4 + t * 0.6;
        if (ring) ring.rotation.z += dt * 0.5;
        if (!model) return;
        if (kind === 'hero') model.update(dt, t);
        else if (kind === 'ball') model.update(dt, t, 0, 0, 0);
        else if (kind === 'gun') model.update(dt, t, { recoil: 0 });
        else model.update(dt, t, { stun: 0, flash: 0 });
      },
    };
  }

  const viewer = makeViewer(true);
  let thumbProg = null;
  const thumbs = {};

  function thumb(kind, id) {
    if (kind === 'hero') return NEON.rpg.thumb(id);
    const key = kind + ':' + id;
    if (!thumbs[key]) {
      if (!thumbProg) thumbProg = makeViewer(false);
      thumbProg.set(kind, id);
      thumbs[key] = S3.snapshot(thumbProg, 220, 220);
    }
    return thumbs[key];
  }

  // ---------------------------------------------------------------- UI
  let tab = 'ball';
  const selected = { ball: P.equippedId('ball'), pad: P.equippedId('pad'), gun: P.equippedId('gun'), hero: null };

  // ----------------------------------------------------------- heroes
  // the hero list in the same shape as balls / pads / guns
  function heroItems() {
    const D = RD(), ros = NEON.rpg.roster();
    return D.HEROES.map((h) => ({
      id: h.id, def: h, owned: !!ros.owned[h.id], own: ros.owned[h.id], team: ros.team.includes(h.id),
      rar: D.RARITIES[h.rarity], fac: D.FACTIONS[h.faction], cls: D.CLASSES[h.cls],
    })).sort((a, b) => (b.owned - a.owned) || (b.rar.rank - a.rar.rank));
  }

  function renderTabs() {
    document.querySelectorAll('#screen-collection .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    P.KINDS.forEach((kind) => {
      $('count-' + kind).textContent = P.ownedCount(kind) + '/' + P.list(kind).length;
    });
    const heroTab = document.querySelector('#screen-collection .tab[data-tab="hero"]');
    heroTab.classList.toggle('hidden', !hasHeroes());
    if (hasHeroes()) {
      const list = heroItems();
      $('count-hero').textContent = list.filter((h) => h.owned).length + '/' + list.length;
    }
  }

  function renderHeroGrid() {
    const grid = $('coll-grid');
    grid.innerHTML = '';
    heroItems().forEach((h) => {
      const b = document.createElement('button');
      b.className = 'item-card hero-card' + (h.owned ? '' : ' locked') + (selected.hero === h.id ? ' selected' : '');
      b.style.setProperty('--rc', h.rar.color);
      b.innerHTML =
        `<div class="ic-img"><img alt="" src="${thumb('hero', h.id)}"></div>` +
        `<div class="ic-name">${h.owned ? h.def.name : '???'}</div>` +
        `<div class="ic-rarity">${h.rar.name}</div>` +
        (h.owned ? `<div class="ic-lvl">LV.${h.own.lvl} ${'★'.repeat(h.own.stars)}</div>` : '') +
        (h.team ? '<div class="ic-badge">TEAM</div>' : '') +
        (h.owned ? '' : '<div class="ic-lock"></div>');
      b.addEventListener('click', () => {
        selected.hero = h.id;
        play('click');
        renderHeroGrid();
        renderHeroDetail();
      });
      grid.appendChild(b);
    });
  }

  function renderHeroDetail() {
    const list = heroItems();
    const h = list.find((x) => x.id === selected.hero) || list[0];
    selected.hero = h.id;
    const d = h.def;
    $('coll-detail').style.setProperty('--rc', h.rar.color);
    $('coll-rarity').textContent = h.rar.name + ' HERO';
    $('coll-name').textContent = h.owned ? d.name : '??? — NOT FOUND YET';
    const type = d.move === 'pierce' ? '➤ PIERCE' : '⟲ BOUNCE';
    const who = `<span style="color:${hex(h.fac.color)}">${h.fac.name}</span> · ${h.cls.name} · ${type}` +
      (h.owned ? ` · LV.${h.own.lvl} ${'★'.repeat(h.own.stars)}` : '');
    const rows = h.owned
      ? [['HERO', who, d.tag], ['COMBO', d.combo.name, d.combo.desc], ['HYPER', d.hyper.name, d.hyper.desc], ['PASSIVE', d.passive.name, d.passive.desc]]
      : [['HERO', who, 'Pull it from Hero Crates in the RPG or from Data Boxes in the Cyber-Lottery.']];
    $('coll-abilities').innerHTML = rows.map(([mode, name, desc]) =>
      `<div class="ab"><div class="ab-mode">${mode}</div><div class="ability-name">${name}</div><p class="ability-desc">${desc}</p></div>`).join('');
    $('coll-preview').classList.toggle('locked', !h.owned);
    const btn = $('coll-equip');
    btn.disabled = !h.owned;
    btn.textContent = h.owned ? (h.team ? '✓ IN TEAM · OPEN IN RPG' : 'OPEN IN RPG') : 'LOCKED';
    viewer.set('hero', h.id);
  }

  // which abilities apply in which mode
  function abilityRows(kind, it) {
    const rows = [];
    if (kind !== 'gun') rows.push(['CLASSIC & SURVIVAL', it.ability, it.desc]);
    if (kind !== 'pad') rows.push(['FUNKY BALLS', it.fab, it.fdesc]);
    return rows;
  }

  function renderGrid() {
    if (tab === 'hero') { renderHeroGrid(); return; }
    const grid = $('coll-grid');
    grid.innerHTML = '';
    P.list(tab).forEach((it) => {
      const owned = P.owns(tab, it.id);
      const eq = P.equippedId(tab) === it.id;
      const r = P.RARITY[it.rarity];
      const b = document.createElement('button');
      b.className = 'item-card' + (owned ? '' : ' locked') + (eq ? ' equipped' : '') + (selected[tab] === it.id ? ' selected' : '');
      b.style.setProperty('--rc', r.color);
      b.innerHTML =
        `<div class="ic-img"><img alt="" src="${thumb(tab, it.id)}"></div>` +
        `<div class="ic-name">${it.name}</div>` +
        `<div class="ic-rarity">${r.name}</div>` +
        (eq ? '<div class="ic-badge">EQUIPPED</div>' : '') +
        (owned ? '' : '<div class="ic-lock"></div>');
      b.addEventListener('click', () => {
        selected[tab] = it.id;
        play('click');
        renderGrid();
        renderDetail();
      });
      grid.appendChild(b);
    });
  }

  function renderDetail() {
    if (tab === 'hero') { renderHeroDetail(); return; }
    const it = P.item(tab, selected[tab]) || P.list(tab)[0];
    const r = P.RARITY[it.rarity];
    const owned = P.owns(tab, it.id);
    const eq = P.equippedId(tab) === it.id;
    const detail = $('coll-detail');
    detail.style.setProperty('--rc', r.color);
    $('coll-rarity').textContent = r.name + ' ' + P.KIND_NAME[tab];
    $('coll-name').textContent = it.name;
    $('coll-abilities').innerHTML = abilityRows(tab, it).map(([mode, name, desc]) =>
      `<div class="ab"><div class="ab-mode">${mode}</div><div class="ability-name">${name}</div><p class="ability-desc">${desc}</p></div>`).join('');
    $('coll-preview').classList.toggle('locked', !owned);
    const btn = $('coll-equip');
    btn.disabled = !owned || eq;
    btn.textContent = eq ? '✓ EQUIPPED' : owned ? 'EQUIP' : 'LOCKED — FIND IT IN DATA BOXES';
    viewer.set(tab, it.id);
  }

  function open() {
    NEON.game.hideTitle();
    NEON.game.setMenuOpen(true);
    $('screen-collection').classList.remove('hidden');
    P.KINDS.forEach((kind) => { selected[kind] = selected[kind] || P.equippedId(kind); });
    if (tab === 'hero' && !hasHeroes()) tab = 'ball';
    renderTabs();
    renderGrid();
    renderDetail();
    S3.mount($('coll-preview'), viewer);
  }

  function close() {
    S3.unmount(viewer);
    $('screen-collection').classList.add('hidden');
    NEON.game.showTitle();
  }

  $('btn-collection').addEventListener('click', () => { play('click'); open(); });
  $('coll-back').addEventListener('click', () => { play('click'); close(); });
  document.querySelectorAll('#screen-collection .tab').forEach((b) => {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      play('click');
      renderTabs();
      renderGrid();
      renderDetail();
    });
  });
  $('coll-equip').addEventListener('click', () => {
    const id = selected[tab];
    if (tab === 'hero') {
      // heroes are levelled and put in the team in the RPG itself
      play('click');
      S3.unmount(viewer);
      $('screen-collection').classList.add('hidden');
      NEON.rpg.openHero(id);
      return;
    }
    if (!P.equip(tab, id)) { play('error'); return; }
    NEON.game.refreshLoadout();
    play('equip');
    renderGrid();
    renderDetail();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('screen-collection').classList.contains('hidden')) close();
  });

  NEON.collection = { thumb, open, close };
})();
