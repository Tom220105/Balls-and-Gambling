/* ==========================================================================
   NEON SIGIL — RPG marble battles
   The fights of the RPG mode, played on the Funky Balls map in the spirit of
   Hyper Heroes / Monster Strike:
   * your 4 heroes are balls on the field. Every turn one of them is slung:
     drag back and let go. It ricochets off the walls and the enemy balls —
     BOUNCE heroes (cyan, fast) rebound, PIERCE heroes (orange, slower but
     harder hitting) smash straight through — and every contact deals damage.
     How fast a hero flies is its SPD stat (class, rarity, stars, boosts).
   * brushing past one of your own heroes fires that hero's COMBO skill
     (lasers, homing shots, blasts, heals, shields).
   * each hero charges a HYPER skill over a few turns; arm it on its turn.
     A HYPER plays a full cut-in and its own big effect before the sling.
   * enemies show a countdown; when it hits 0 they attack your shared team HP.
   * a level has 3 waves — the last one holds the boss.
   Battle speed: 1× / 2× / 3× (buttons top-right or F).
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!window.THREE || !NEON.core || !NEON.models || !NEON.rpgData) return;
  const C = NEON.core, M = NEON.models, D = NEON.rpgData;
  const { HERO, FACTIONS } = D;
  const K = C.K;
  const scene = C.scene;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const css = D.css;
  const QS = new URLSearchParams(location.search);
  const BOT = QS.has('bot');   // test autopilot

  // ---------------------------------------------------------------- field
  const XW = K.HALF_W;               // side walls
  const ZT = K.TOP_Z;                // top wall (the Sentinel's gate)
  const ZB = K.PADDLE_Z + 1.4;       // hardlight barrier at the bottom
  const HERO_R = 1.05;
  // Sling physics: every hero has a SPD stat (BOUNCE ~500+, PIERCE ~350+). A full-power
  // sling starts at SPD × SPD_UNIT units/s — a 500 SPD ball crosses the arena in a
  // blink and ricochets all over it. It loses speed at a steady rate (DECEL) plus a
  // little drag, so every shot still settles with a crisp stop after about 3 s.
  const SPD_UNIT = 0.44, DECEL = 70, DRAG = 0.05, STOP = 0.8;
  const WALL_BOUNCE = 0.99, ENEMY_BOUNCE = 0.97, PIERCE_KEEP = 0.985;
  // With that many contacts per shot, a single hit deals a share of ATK
  // (PIERCE hits fewer times, so each of its hits counts more).
  const HIT_K = { bounce: 0.3, pierce: 0.45 };
  const WALL_POWER_CAP = 6, WALL_FX_CAP = 5, WALL_BOLT_CAP = 8, HITSTOP_BUDGET = 0.45;
  const ATTACK = { tank: 'shock', warrior: 'dash', ranger: 'snipe', mage: 'barrage', support: 'mend' };
  const COUNTDOWN = { tank: 3, warrior: 2, ranger: 3, mage: 3, support: 3 };
  const START_X = [-7.5, -2.5, 2.5, 7.5];
  // the two marble types get their own colour everywhere: ring, aim line, labels, trails
  const TYPE = {
    bounce: { col: 0x19e6ff, css: '#19e6ff', icon: '⟲', name: 'BOUNCE', text: 'rebounds off enemies' },
    pierce: { col: 0xff8a1f, css: '#ff8a1f', icon: '➤', name: 'PIERCE', text: 'smashes straight through enemies' },
  };
  const SPEEDS = [1, 2, 3];
  const SPEED_KEY = 'neonSigil.rpgSpeed';
  const RAINBOW = [0xff3a5a, 0xff9a1f, 0xffe23a, 0x3dff7a, 0x19c6ff, 0x7a5cff, 0xff5cf0];
  const X_AXIS = new THREE.Vector3(1, 0, 0);

  const st = {
    active: false, phase: 'idle', t: 0, phaseT: 0, speed: 1, hitStop: 0,
    stage: 1, label: '1-1', plan: null, wave: 0, turn: 1, cur: 0,
    teamHp: 1, teamMax: 1, armorK: 1, shield: 0, guardian: 0, guardianUsed: false, regen: 0, killHeal: 0,
    shieldStart: 0, counter: 0, coinFind: 0, revive: 0, reviveUsed: false,
    hot: [], wall: null, mushrooms: [],   // heals over time, PHALANX wall, OVERGROWTH mushrooms
    coins: 0, kills: 0, heroes: [], enemies: [], orbs: [], shots: [], timers: [], movers: [], T: null,
    hyperArmed: false, aim: { on: false, sx: 0, sz: 0, dx: 0, dz: -1, power: 0 }, kAim: -Math.PI / 2, keyAim: false,
    result: null, hudDirty: true, afterT: 0, popBudget: 0,
  };
  st.speed = clamp(parseInt(C.store.get(SPEED_KEY, '1'), 10) || 1, 1, 3);

  let inited = false;
  let barrier = null, aimMat = null, band = null, activeRing = null;
  const aimDots = [], markers = [], beams = [], segs = [], pillars = [], fireballs = [], reticles = [], ghosts = [];
  const geos = {};
  let hole = null;

  const additive = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });

  function hexCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    const sz = 18, hw = Math.sqrt(3) * sz;
    for (let row = 0; row * sz * 1.5 < 280; row++) {
      for (let x = (row % 2) * hw / 2; x < 280; x += hw) {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = x + Math.cos(a) * (sz - 2), py = row * sz * 1.5 + Math.sin(a) * (sz - 2);
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
        g.stroke();
      }
    }
    return c;
  }

  function diskCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.38, 'rgba(0,0,0,0)');
    grd.addColorStop(0.42, 'rgba(255,230,255,1)');
    grd.addColorStop(0.55, 'rgba(255,60,242,0.85)');
    grd.addColorStop(0.75, 'rgba(120,40,255,0.45)');
    grd.addColorStop(1, 'rgba(40,0,80,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 16; i++) {
      g.lineWidth = 2 + (i % 3);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.beginPath();
      g.arc(128, 128, 56 + i * 4, i * 0.8, i * 0.8 + 1.8);
      g.stroke();
    }
    return c;
  }

  function init() {
    if (inited) return;
    inited = true;
    // the hardlight barrier that closes the arena at the bottom
    barrier = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(XW * 2, 0.1, 0.18), new THREE.MeshBasicMaterial({ color: 0x19e6ff }));
    bar.position.set(0, 0.06, ZB);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(XW * 2, 1.8), new THREE.MeshBasicMaterial({
      map: M.glowTex, color: 0x19e6ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.set(0, 0.04, ZB);
    barrier.add(bar, sheen);
    barrier.visible = false;
    scene.add(barrier);

    aimMat = new THREE.SpriteMaterial({ map: M.glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(aimMat);
      s.visible = false;
      scene.add(s);
      aimDots.push(s);
    }
    // enemies the aim line predicts you'll hit
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), additive(0xffffff, 0.85));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      markers.push(m);
    }
    // the sling "rubber band" and a ring for the active hero
    band = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.22), additive(0xffffff, 0.8));
    band.visible = false;
    scene.add(band);
    activeRing = new THREE.Mesh(new THREE.RingGeometry(HERO_R * 1.55, HERO_R * 1.75, 48), additive(0xffffff, 0.9));
    activeRing.rotation.x = -Math.PI / 2;
    activeRing.visible = false;
    scene.add(activeRing);
    // laser beams for combos and enemy attacks
    const beamGeo = new THREE.BoxGeometry(1, 0.35, 1);
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(beamGeo, additive(0xffffff, 0));
      m.visible = false;
      scene.add(m);
      beams.push({ m, life: 0, max: 1, w: 1 });
    }
    // HYPER effect pools: bolt segments, light pillars, fireballs, target reticles, afterimages
    const segGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(segGeo, additive(0xffffff, 0));
      m.visible = false;
      scene.add(m);
      segs.push({ m, life: 0, max: 1 });
    }
    const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    pillarGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(pillarGeo, additive(0xffffff, 0));
      m.visible = false;
      scene.add(m);
      pillars.push({ m, life: 0, max: 1, r: 1 });
    }
    for (let i = 0; i < 16; i++) {
      const outer = M.glow(0xffffff, 1, 0), core = M.glow(0xffffff, 1, 0);
      outer.visible = core.visible = false;
      scene.add(outer, core);
      fireballs.push({ outer, core, life: 0, max: 1, size: 1 });
    }
    const arcGeo = new THREE.RingGeometry(1, 1.14, 24, 1, 0, Math.PI / 3);
    arcGeo.rotateX(-Math.PI / 2);
    const dotGeo = new THREE.CircleGeometry(0.16, 12);
    dotGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const mat = additive(0xff2a4d, 0.9);
      for (let k = 0; k < 4; k++) {
        const a = new THREE.Mesh(arcGeo, mat);
        a.rotation.y = (k * Math.PI) / 2;
        g.add(a);
      }
      g.add(new THREE.Mesh(dotGeo, mat));
      g.visible = false;
      scene.add(g);
      reticles.push({ g, mat, life: 0, max: 1, r: 1 });
    }
    for (let i = 0; i < 64; i++) {
      const s = M.glow(0xffffff, 1, 0);
      s.visible = false;
      scene.add(s);
      ghosts.push({ s, life: 0, max: 1 });
    }
    // the black hole for EVENT HORIZON / MAELSTROM
    hole = { g: new THREE.Group(), t: 0, dur: 0, active: false, x: 0, z: 0 };
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const diskGeo = new THREE.RingGeometry(1.2, 3.4, 72);
    diskGeo.rotateX(-Math.PI / 2);
    const disk = new THREE.Mesh(diskGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(diskCanvas()), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    disk.rotation.x = 0.35;
    const hg = M.glow(0xb84dff, 9, 0.7);
    hole.g.add(hg, core, disk);
    hole.core = core;
    hole.disk = disk;
    hole.g.visible = false;
    scene.add(hole.g);
    // shared geometry for the type markings and hero overlays
    geos.ring = new THREE.RingGeometry(HERO_R * 1.1, HERO_R * 1.3, 48);
    geos.ringThin = new THREE.RingGeometry(HERO_R * 1.36, HERO_R * 1.42, 48);
    geos.bumper = new THREE.CircleGeometry(0.16, 12);
    [geos.ring, geos.ringThin, geos.bumper].forEach((g) => g.rotateX(-Math.PI / 2));   // flat on the floor
    const ch = new THREE.Shape();
    [[0, 0.32], [0.3, 0], [0, -0.32], [-0.14, -0.32], [0.14, 0], [-0.14, 0.32]].forEach(([x, y], i) => (i ? ch.lineTo(x, y) : ch.moveTo(x, y)));
    ch.closePath();
    geos.chevron = new THREE.ShapeGeometry(ch);
    geos.chevron.rotateX(-Math.PI / 2);
    geos.spear = new THREE.ConeGeometry(HERO_R * 0.75, HERO_R * 2.6, 20, 1, true);
    geos.spear.rotateZ(-Math.PI / 2);
    geos.spear.translate(HERO_R * 1.3, 0, 0);
    geos.shell = new THREE.SphereGeometry(HERO_R * 1.22, 24, 16);
    geos.dome = new THREE.SphereGeometry(HERO_R * 1.75, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    geos.hexTex = new THREE.CanvasTexture(hexCanvas());
    geos.hexTex.wrapS = geos.hexTex.wrapT = THREE.RepeatWrapping;
    geos.hexTex.repeat.set(3, 1.5);
  }

  // ------------------------------------------------------------ helpers
  function later(t, fn) { st.timers.push({ t, fn }); }
  const aliveEnemies = () => st.enemies.filter((e) => e.alive);
  const curHero = () => st.heroes[st.cur];
  const typeOf = (def) => TYPE[def.move === 'pierce' ? 'pierce' : 'bounce'];
  const nearestTo = (p, list) => {
    let best = null, bd = Infinity;
    for (const o of list) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  const mul = (v) => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
  // fast balls hit things many times a second: never stack the same sound within 45 ms
  const sfxAt = {};
  function sound(name, arg) {
    const now = performance.now();
    if (now - (sfxAt[name] || 0) < 45) return;
    sfxAt[name] = now;
    C.sfx[name](arg);
  }
  let beamNext = 0;
  function beamLine(x0, z0, x1, z1, color, width, dur) {
    const b = beams[beamNext];
    beamNext = (beamNext + 1) % beams.length;
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 0.01;
    b.m.position.set((x0 + x1) / 2, 0.9, (z0 + z1) / 2);
    b.m.rotation.set(0, -Math.atan2(dz, dx), 0);
    b.m.scale.set(len, 1, width);
    b.m.material.color.setHex(color);
    b.m.visible = true;
    b.life = b.max = dur || 0.4;
    b.w = width;
  }
  // how far a ray from (x, z) along (dx, dz) travels before it leaves the arena
  function exitDist(x, z, dx, dz) {
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (XW - x) / dx); else if (dx < -1e-6) t = Math.min(t, (-XW - x) / dx);
    if (dz > 1e-6) t = Math.min(t, (ZB - z) / dz); else if (dz < -1e-6) t = Math.min(t, (ZT - z) / dz);
    return Math.max(0, t);
  }
  function exitDistR(x, z, dx, dz, r) {
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (XW - r - x) / dx); else if (dx < -1e-6) t = Math.min(t, (-XW + r - x) / dx);
    if (dz > 1e-6) t = Math.min(t, (ZB - r - z) / dz); else if (dz < -1e-6) t = Math.min(t, (ZT + r - z) / dz);
    return Math.max(0, t);
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------ HYPER effects kit
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  let segNext = 0, pillarNext = 0, fireNext = 0, retNext = 0, ghostNext = 0;
  function segment(ax, ay, az, bx, by, bz, color, w, dur) {
    const s = segs[segNext];
    segNext = (segNext + 1) % segs.length;
    tmpA.set(ax, ay, az);
    tmpB.set(bx - ax, by - ay, bz - az);
    const len = tmpB.length() || 0.01;
    s.m.position.copy(tmpA).addScaledVector(tmpB, 0.5);
    s.m.quaternion.setFromUnitVectors(X_AXIS, tmpB.normalize());
    s.m.scale.set(len, w, w);
    s.m.material.color.setHex(color);
    s.m.visible = true;
    s.life = s.max = dur;
  }
  // a jagged lightning bolt from the sky down onto (x, z)
  function skyBolt(x, z, color) {
    let px = x + rand(-3, 3), py = 26, pz = z - 5;
    const sx = px, sz = pz;
    for (let i = 1; i <= 9; i++) {
      const k = i / 9, last = i === 9;
      const nx = lerp(sx, x, k) + (last ? 0 : rand(-1, 1)), ny = lerp(26, 0.6, k), nz = lerp(sz, z, k) + (last ? 0 : rand(-0.7, 0.7));
      segment(px, py, pz, nx, ny, nz, color, 0.5, 0.35);
      segment(px, py, pz, nx, ny, nz, 0xffffff, 0.16, 0.35);
      if (i === 4 || i === 6) segment(nx, ny, nz, nx + rand(-3, 3), ny - rand(2, 4), nz + rand(-2, 2), color, 0.2, 0.25);   // side branches
      px = nx; py = ny; pz = nz;
    }
    C.flashLight(x, z, color, 8);
  }
  // a column of light; tall ones read as orbital beams, short ones as heal / buff columns
  function pillar(x, z, color, r, dur, height, opacity) {
    const p = pillars[pillarNext];
    pillarNext = (pillarNext + 1) % pillars.length;
    p.m.position.set(x, 0, z);
    p.m.material.color.setHex(color);
    p.m.visible = true;
    p.life = p.max = dur;
    p.r = r;
    p.h = height || 34;
    p.op = opacity || 0.85;
  }
  function explosion(x, z, color, size) {
    const f = fireballs[fireNext];
    fireNext = (fireNext + 1) % fireballs.length;
    f.outer.position.set(x, 1.2, z);
    f.core.position.set(x, 1.2, z);
    f.outer.material.color.setHex(color);
    f.core.material.color.setHex(0xfff3d0);
    f.outer.visible = f.core.visible = true;
    f.life = f.max = 0.5;
    f.size = size;
    C.spawnRing(x, z, color, size * 1.6, 0.45);
    C.burst(x, 1, z, color, 26, 7 + size * 2, 0.5, 1, 2);
    C.burst(x, 1, z, 0xffffff, 8, 5, 0.3, 0.6);
    C.flashLight(x, z, color, 6);
    C.addShake(0.15 + size * 0.1);
    sound('explode');
  }
  function reticle(x, z, r, color, dur) {
    const q = reticles[retNext];
    retNext = (retNext + 1) % reticles.length;
    q.g.position.set(x, 0.14, z);
    q.mat.color.setHex(color);
    q.g.visible = true;
    q.life = q.max = dur;
    q.r = r;
  }
  function afterimage(x, y, z, color, size) {
    const g = ghosts[ghostNext];
    ghostNext = (ghostNext + 1) % ghosts.length;
    g.s.position.set(x, y, z);
    g.s.material.color.setHex(color);
    g.s.scale.set(size, size, 1);
    g.s.visible = true;
    g.life = g.max = 0.35;
  }
  function blackHole(x, z, dur) {
    hole.active = true;
    hole.t = 0;
    hole.dur = dur;
    hole.x = x;
    hole.z = z;
    hole.g.position.set(x, 5, z);   // hovers above the field so no enemy hides it
    hole.g.visible = true;
    pillar(x, z, 0xb84dff, 0.5, dur, 5, 0.6);   // the tether that drags things in
  }
  function screenFlash(color, dur) {
    const f = $('mb-flash');
    f.style.setProperty('--fc', css(color));
    f.style.setProperty('--fd', dur + 's');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
  // anime-style cut-in: portrait, HYPER name and what it does
  function cutIn(h) {
    const el = $('mb-cutin');
    el.style.setProperty('--hc', css(h.def.look.glow));
    el.style.setProperty('--ci-dur', (st.speed > 1 ? 0.8 : 1.15) + 's');
    $('ci-img').src = NEON.rpg.thumb(h.id);
    $('ci-hero').textContent = h.def.name + '  //  HYPER';
    $('ci-name').textContent = h.def.hyper.name;
    $('ci-desc').textContent = h.def.hyper.desc;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  // the hero powers up: stacked shockwaves, rising sparks and a lasting aura
  function empower(h, color) {
    for (let i = 0; i < 3; i++) later(i * 0.08, () => C.spawnRing(h.x, h.z, color, 3 + i * 2.2, 0.45));
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0.6, 1.6);
      C.emit(h.x + Math.cos(a) * r, 0.3, h.z + Math.sin(a) * r, 0, rand(4, 9), 0, color, rand(0.7, 1.3), rand(0.5, 0.9), 0.5, 0);
    }
    C.flashLight(h.x, h.z, color, 8);
    h.hop = 1;
    h.auraK = 1;
  }
  function spreadTargets(n) {
    const list = aliveEnemies();
    if (!list.length) return [];
    const order = list.slice().sort(() => Math.random() - 0.5);
    return Array.from({ length: n }, (_, i) => order[i % order.length]);
  }
  function hyperPop(text, x, z) { C.popup(text, x, z, 'hyper'); }
  const healK = (h) => 1 + (h.mods.healPower || 0);
  const hyperK = (h) => 1 + (h.mods.hyperPower || 0);

  // ---------------------------------------------------- ability props
  // a flat buzzsaw disc (SAW BLADE, SCRAP STORM)
  function sawMesh(color, size) {
    if (!geos.saw) {
      const s = new THREE.Shape();
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, b = a + (Math.PI * 2) / N * 0.7;
        if (i) s.lineTo(Math.cos(a) * 0.68, Math.sin(a) * 0.68); else s.moveTo(Math.cos(a) * 0.68, Math.sin(a) * 0.68);
        if (i < N) s.lineTo(Math.cos(b) * 1, Math.sin(b) * 1);
      }
      const hub = new THREE.Path();
      hub.absarc(0, 0, 0.22, 0, Math.PI * 2, true);
      s.holes.push(hub);
      geos.saw = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false });
      geos.saw.rotateX(-Math.PI / 2);
    }
    const m = new THREE.Mesh(geos.saw, new THREE.MeshBasicMaterial({ color }));
    m.scale.setScalar(size);
    return m;
  }
  // a glowing toadstool that grows on an enemy (OVERGROWTH)
  function mushroomMesh(r) {
    if (!geos.mushStem) {
      geos.mushStem = new THREE.CylinderGeometry(0.16, 0.24, 0.6, 10);
      geos.mushStem.translate(0, 0.3, 0);
      geos.mushCap = new THREE.SphereGeometry(0.62, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      geos.mushCap.translate(0, 0.52, 0);
      geos.mushDot = new THREE.SphereGeometry(0.09, 8, 6);
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geos.mushStem, new THREE.MeshBasicMaterial({ color: 0xe8ffe0 })),
      new THREE.Mesh(geos.mushCap, new THREE.MeshBasicMaterial({ color: 0x3dff7a })));
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff3cf2 });
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(geos.mushDot, dotMat);
      const a = (i / 5) * Math.PI * 2;
      if (i === 5) d.position.set(0, 1.14, 0); else d.position.set(Math.cos(a) * 0.48, 0.9, Math.sin(a) * 0.48);
      g.add(d);
    }
    const glow = M.glow(0x8dff2a, 2.6, 0.55);
    glow.position.y = 0.7;
    g.add(glow);
    g.position.y = r * 1.8;
    g.scale.setScalar(0.01);
    return g;
  }
  // a silk cocoon around a webbed enemy (WEB TRAP)
  function cocoonMesh(r) {
    const key = 'cocoon' + r;
    if (!geos[key]) geos[key] = new THREE.IcosahedronGeometry(r * 1.25, 1);
    const m = new THREE.Mesh(geos[key], new THREE.MeshBasicMaterial({ color: 0xf2f6ff, wireframe: true, transparent: true, opacity: 0.6 }));
    m.position.y = r;
    return m;
  }
  // vines wrapped around an enemy (STRANGLEROOT)
  function vineCoil(r) {
    const key = 'vine' + r;
    if (!geos[key]) geos[key] = new THREE.TorusGeometry(r * 1.1, 0.1, 6, 28);
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x3dff7a });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(geos[key], mat);
      t.position.y = r * (0.5 + i * 0.5);
      t.rotation.set(Math.PI / 2 + (i - 1) * 0.35, 0, (i - 1) * 0.3);
      g.add(t);
    }
    return g;
  }
  // a sword slash across (x, z): a coloured beam with a white core
  function slash(x, z, len, a, col) {
    const cx = Math.cos(a) * len, cz = Math.sin(a) * len;
    beamLine(x - cx, z - cz, x + cx, z + cz, col, 0.55, 0.3);
    beamLine(x - cx * 0.8, z - cz * 0.8, x + cx * 0.8, z + cz * 0.8, 0xffffff, 0.18, 0.3);
  }
  // roots burst out of the floor and close around (x, z)
  function rootsAt(x, z, r, col) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rand(-0.3, 0.3);
      const x0 = x + Math.cos(a) * (r + 1.3), z0 = z + Math.sin(a) * (r + 1.3);
      const x1 = x + Math.cos(a + 0.7) * r * 0.4, z1 = z + Math.sin(a + 0.7) * r * 0.4;
      const mx = lerp(x0, x1, 0.45), mz = lerp(z0, z1, 0.45);
      segment(x0, 0.1, z0, mx, 1.3, mz, col, 0.24, 0.75);
      segment(mx, 1.3, mz, x1, r * 2 + 0.6, z1, col, 0.15, 0.75);
    }
    C.burst(x, 0.4, z, col, 16, 5, 0.5, 0.8, 1);
    C.spawnDebris(x, z, 0x2a4a22, 4);
  }
  function sparkleUp(x, z, col, n) {
    for (let i = 0; i < n; i++) C.emit(x + rand(-1, 1), 0.4, z + rand(-1, 1), 0, rand(3, 6), 0, col, rand(0.8, 1.3), rand(0.6, 1), 0.5, 0);
  }
  // the enemy loses n turns (capped, so nothing is locked forever)
  function stun(e, n, text) {
    if (!e.alive) return;
    e.cd = Math.min(e.cd + n, e.cdMax + 3);
    e.wobble = 1;
    C.spawnRing(e.x, e.z, 0x9ff4ff, e.r * 1.6, 0.4);
    C.popup(text || '+' + n + ' TURN', e.x, e.z - e.r - 0.6, 'lvl');
    if (e.label) { e.label.el.classList.remove('delayed'); void e.label.el.offsetWidth; e.label.el.classList.add('delayed'); }
    st.hudDirty = true;
  }
  function poisonEnemy(e, amount, src) {
    if (!e.alive) return;
    if (!e.poisonT) C.spawnRing(e.x, e.z, 0x8dff2a, e.r * 1.6, 0.35);
    e.poison = Math.max(e.poison, amount);
    e.poisonT = 2;
    e.poisonSrc = src;
  }
  // pushes the enemies around `from` away (bosses stand firm)
  function knockback(from, r, dist) {
    aliveEnemies().forEach((e) => {
      const dx = e.x - from.x, dz = e.z - from.z, d = Math.hypot(dx, dz) || 1;
      if (e.boss || d > r + e.r) return;
      e.tx = clamp(e.tx + (dx / d) * dist, -XW + e.r + 0.3, XW - e.r - 0.3);
      e.tz = clamp(e.tz + (dz / d) * dist, ZT + e.r + 0.5, ZB - e.r - 3);
      e.wobble = 1;
    });
  }

  // -------------------------------------------------------------- heroes
  // root (position) > stretch (faces the heading, squash & stretch) > roll > model
  function makeHero(spec, i) {
    const def = HERO[spec.id];
    const s = NEON.rpg.heroStats(spec.id, spec.lvl, spec.stars);   // already includes ATK/HP abilities
    const mods = D.heroMods(def, spec.lvl);                        // passive + unlocked abilities
    const ty = typeOf(def);
    const pierce = def.move === 'pierce';
    const model = D.makeHeroModel(def);
    model.group.scale.setScalar(HERO_R / D.HR);
    const root = new THREE.Group();
    const stretch = new THREE.Group();
    const roll = new THREE.Group();
    root.add(stretch);
    stretch.add(roll);
    roll.add(model.group);
    // type marking on the floor: BOUNCE = cyan bumper ring, PIERCE = orange arrow ring
    const mark = new THREE.Group();
    mark.position.y = 0.05;
    const ringMat = additive(ty.col, 0.85);
    mark.add(new THREE.Mesh(geos.ring, ringMat));
    const chevrons = [];
    if (pierce) {
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(geos.chevron, additive(ty.col, 0.9));
        c.position.x = HERO_R * 1.55 + k * 0.5;
        mark.add(c);
        chevrons.push(c);
      }
    } else {
      mark.add(new THREE.Mesh(geos.ringThin, additive(ty.col, 0.6)));
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(geos.bumper, additive(0xffffff, 0.9));
        const a = (k / 4) * Math.PI * 2;
        b.position.set(Math.cos(a) * HERO_R * 1.2, 0.01, Math.sin(a) * HERO_R * 1.2);
        mark.add(b);
      }
    }
    root.add(mark);
    // moving look: PIERCE heroes fly inside a spear of light, BOUNCE heroes inside a bumper shell
    let spear = null, shell = null;
    if (pierce) {
      spear = new THREE.Mesh(geos.spear, additive(ty.col, 0));
      stretch.add(spear);
    } else {
      shell = new THREE.Mesh(geos.shell, M.fresnel(ty.col, 1.6, 1.6));
      shell.material.uniforms.uOpacity.value = 0;
      stretch.add(shell);
    }
    // HYPER aura and the hex shield dome (shown while the team is shielded)
    const aura = M.glow(def.look.glow, HERO_R * 6, 0);
    aura.position.y = HERO_R;
    const dome = new THREE.Mesh(geos.dome, new THREE.MeshBasicMaterial({
      map: geos.hexTex, color: 0x9ff4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    dome.visible = false;
    root.add(aura, dome);
    // level 30+: the signature relic floats above the ball
    const relic = spec.lvl >= D.RELIC_LVL ? D.makeRelicModel(def) : null;
    if (relic) { relic.group.scale.setScalar(0.9); root.add(relic.group); }
    scene.add(root);
    const h = {
      id: spec.id, def, ty, pierce, idx: i, lvl: spec.lvl, x: START_X[i] || 0, z: ZB - 4.5, vx: 0, vz: 0, r: HERO_R,
      atk: s.atk, hp: s.hp, armor: s.armor, spd: s.spd, mods, hitK: HIT_K[pierce ? 'pierce' : 'bounce'],
      charge: Math.max(0, def.hyper.charge - (mods.startCharge || 0)), maxCharge: def.hyper.charge, dealt: 0, healed: 0,
      moving: false, walls: 0, v0: 1, contacts: new Map(), head: -Math.PI / 2, rollA: 0, lean: 0, lx: 0, lz: 0, ghostT: 0,
      flash: 0, hurt: 0, hop: 0, squash: 0, settle: 0, pulse: 0, auraK: 0, domePop: 0, bob: rand(0, 6), soarT: 0, soarDur: 0,
      model, root, stretch, roll, mark, ringMat, chevrons, spear, shell, aura, dome, relic, label: null,
    };
    const el = document.createElement('div');
    el.className = 'mb-h ' + (pierce ? 'pierce' : 'bounce');
    el.innerHTML = `<b>${i + 1}</b><em>${ty.icon}</em><i>${ty.name}</i><span>HYPER</span>`;
    $('mb-labels').appendChild(el);
    h.label = el;
    return h;
  }

  // ------------------------------------------------------------- enemies
  function makeEnemy(spec, x, z) {
    const boss = spec.kind === 'boss';
    let model, r, hp, atk, attack, cdMax, name, color, def = null;
    if (spec.kind === 'virus') {
      const base = NEON.rpg.heroStats('scrapjaw', spec.lvl, spec.stars);
      color = pick([0xff2a4d, 0xff3cf2, 0xff9a1f]);
      model = D.makeVirusModel(color);
      r = 0.95;
      hp = base.hp * 0.14;
      atk = base.atk * 0.8;
      attack = 'bite';
      cdMax = 2 + (Math.random() < 0.5 ? 1 : 0);
      name = 'VIRUS';
    } else {
      def = HERO[spec.id];
      const s = NEON.rpg.heroStats(spec.id, spec.lvl, spec.stars);
      model = D.makeHeroModel(def, { boss });
      r = boss ? 2.5 : 1.25;
      hp = s.hp * (boss ? 1.9 : 0.3);
      atk = s.atk * (boss ? 1.25 : 1);
      attack = boss ? 'boss' : ATTACK[def.cls];
      cdMax = boss ? 3 : COUNTDOWN[def.cls];
      name = def.name;
      color = def.look.glow;
    }
    const k = r / (spec.kind === 'virus' ? 0.45 : D.HR);
    model.group.scale.setScalar(k);
    const root = new THREE.Group();
    root.add(model.group);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.02, r * 1.16, 48), new THREE.MeshBasicMaterial({
      color: 0xff2a4d, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    root.add(ring);
    root.position.set(x, 0, z);
    scene.add(root);
    const e = {
      kind: spec.kind, boss, def, name, color, x, z, tx: x, tz: z, r, k, hp: Math.round(hp), maxHp: Math.round(hp), atk,
      attack, cd: cdMax, cdMax, alive: true, dying: 0, drop: 1, dropDelay: 0, flash: 0, wobble: 0, windup: 0,
      poison: 0, poisonT: 0, poisonSrc: null, curse: 0,
      lunge: 0, lx: 0, lz: 0, kx: 0, kz: 0, yaw: -Math.PI / 2, bossMove: 0, bob: rand(0, 6), model, root, ring, label: null,
    };
    const el = document.createElement('div');
    el.className = 'mb-e' + (boss ? ' boss' : '');
    el.innerHTML = '<span class="mb-cd"></span><span class="mb-ehp"><b></b></span>';
    $('mb-labels').appendChild(el);
    e.label = { el, cd: el.querySelector('.mb-cd'), hp: el.querySelector('.mb-ehp b') };
    return e;
  }

  function removeEnemy(e) {
    scene.remove(e.root);
    if (e.label) e.label.el.remove();
    e.label = null;
  }

  // ---------------------------------------------------------------- waves
  function startWave(i, advance) {
    st.wave = i;
    st.phase = 'wave';
    st.phaseT = 0;
    st.enemies.forEach(removeEnemy);
    st.enemies = [];
    const list = st.plan.waves[i];
    const rnd = mulberry(st.plan.seed + i * 131);
    const placed = [];
    list.forEach((spec, n) => {
      const boss = spec.kind === 'boss';
      const r = boss ? 2.5 : spec.kind === 'virus' ? 0.95 : 1.25;
      let x = 0, z = -9.5;
      if (!boss) {
        for (let tries = 0; tries < 80; tries++) {
          x = lerp(-XW + r + 1.2, XW - r - 1.2, rnd());
          z = lerp(ZT + r + 2.5, 2, rnd());
          const ok = placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 1.6) &&
            st.heroes.every((h) => Math.hypot(h.x - x, h.z - z) > h.r + r + 2);
          if (ok) break;
        }
      }
      const e = makeEnemy(spec, x, z);
      e.dropDelay = n * 0.08;
      placed.push({ x, z, r });
      st.enemies.push(e);
    });
    st.mushrooms = [];   // they grew on the enemies that were just removed
    const bossE = st.enemies.find((e) => e.boss);
    $('mb-boss').classList.toggle('hidden', !bossE);
    if (bossE) {
      $('mb-boss-name').textContent = '☠ ' + bossE.name;
      C.showBanner('WARNING', 'BOSS WAVE', bossE.name + '  //  3 / 3', true);
      C.sfx.charge();
    } else {
      C.showBanner('SECTOR ' + st.label, 'WAVE ' + (i + 1) + ' / 3', 'DRAG BACK · RELEASE · RICOCHET');
    }
    // BULWARK-type abilities: every wave starts shielded
    if (st.shieldStart > st.shield) {
      st.shield = st.shieldStart;
      st.heroes.forEach((h) => { h.domePop = 1; });
    }
    C.sfx.advance();
    st.hudDirty = true;
    later(0.85, () => { if (advance) nextTurn(); else beginAim(); });
  }

  // ---------------------------------------------------------------- turns
  function beginAim() {
    st.phase = 'aim';
    st.phaseT = 0;
    st.hyperArmed = false;
    st.aim.on = false;
    st.hudDirty = true;
    const h = curHero();
    h.hop = 1;   // the hero whose turn it is hops up
    C.spawnRing(h.x, h.z, h.ty.col, 2.4, 0.4);
  }

  function nextTurn() {
    st.cur = (st.cur + 1) % st.heroes.length;
    st.turn++;
    if (st.regen) healTeam(st.teamMax * st.regen, null, true);
    // AFTERGLOW / SANCTUARY: heals over the next turns
    st.hot = st.hot.filter((o) => {
      healTeam(st.teamMax * o.k, o.src);
      st.heroes.forEach((h) => { sparkleUp(h.x, h.z, 0x8dff2a, 6); C.spawnRing(h.x, h.z, 0x8dff2a, 2.2, 0.4); });
      return --o.turns > 0;
    });
    beginAim();
    // ORBITAL UPLINK (relic): the satellite fires at the start of every turn
    st.heroes.forEach((h, i) => {
      if (!h.mods.satellite) return;
      later(0.25 + i * 0.1, () => {
        const t = pick(aliveEnemies());
        if (!t || st.phase !== 'aim') return;
        pillar(t.x, t.z, h.def.look.glow, 0.25, 0.2);
        later(0.18, () => {
          if (!t.alive) return;
          pillar(t.x, t.z, h.def.look.glow, t.r * 0.9, 0.5, 34, 0.7);
          explosion(t.x, t.z, h.def.look.glow, t.r * 0.8);
          C.popup('ORBITAL UPLINK', t.x, t.z - t.r - 1, 'pu');
          damageEnemy(t, h.atk * h.mods.satellite, h, 'hyper');
          // the satellite may finish off a wave before anyone is slung
          if (!aliveEnemies().length && st.phase === 'aim') { hideAim(); st.phase = 'wave'; later(0.5, waveCleared); }
        });
      });
    });
  }

  function launch(dx, dz, power) {
    const h = curHero();
    const armed = st.hyperArmed && h.charge <= 0;
    st.T = {
      h, dmgMul: 1, speedMul: 1, pierce: h.pierce, touched: new Set(), firstDone: false, drain: 0, bomb: 0, clones: 0, aura: 0, after: 0, drill: false,
      stop: 0, shocks: 0, bolts: 0, delayed: new Set(), comboCharged: new Set(),
      trail: null, tether: null, saws: null, boom: 0, rainbow: false, resolved: false,
    };
    st.heroes.forEach((o) => { o.charge = Math.max(0, o.charge - 1); });
    st.hyperArmed = false;
    hideAim();
    if (armed) {
      // HYPER: cut-in first, then its effect, then the sling
      h.charge = h.maxCharge;
      st.phase = 'hyper';
      st.phaseT = 0;
      cutIn(h);
      screenFlash(h.def.look.glow, 0.5);
      empower(h, h.def.look.glow);
      C.sfx.power();
      C.sfx.charge();
      C.addShake(0.35);
      const hold = st.speed > 1 ? 0.75 : 1.05;   // real seconds for the cut-in
      later(hold * st.speed, () => later(hyperEffect(h), () => sling(h, dx, dz, power)));
      st.hudDirty = true;
      return;
    }
    sling(h, dx, dz, power);
  }

  function sling(h, dx, dz, power) {
    if (!st.active) return;
    const sp = h.spd * SPD_UNIT * (0.35 + 0.65 * power) * st.T.speedMul;
    h.vx = dx * sp;
    h.vz = dz * sp;
    h.v0 = sp;
    h.lx = h.x;
    h.lz = h.z;
    h.head = Math.atan2(dz, dx);
    h.moving = true;
    h.walls = 0;
    h.contacts = new Map();
    h.squash = -0.8;   // negative squash = stretch burst
    st.movers = [h];
    $('mb-speedo').className = 'mb-speedo ' + h.def.move;
    $('mb-speedo-name').textContent = h.ty.icon + ' SPD';
    // SPLIT hypers: ghost copies fan out from the launch
    for (let i = 0; i < st.T.clones; i++) {
      const a = Math.atan2(dz, dx) + (i % 2 ? 1 : -1) * (0.28 + Math.floor(i / 2) * 0.24);
      const m = D.makeHeroModel(h.def);
      M.ghostify(m.group);
      m.group.scale.setScalar((HERO_R * 0.8) / D.HR);
      const root = new THREE.Group();
      root.add(m.group);
      scene.add(root);
      st.movers.push({
        clone: true, src: h, def: h.def, ty: h.ty, mods: h.mods, atk: h.atk * 0.6, hitK: h.hitK, x: h.x, z: h.z, r: HERO_R * 0.8,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, v0: sp, lx: h.x, lz: h.z, moving: true, walls: 0, contacts: new Map(), model: m, root,
      });
    }
    st.phase = 'move';
    st.phaseT = 0;
    C.sfx.launch();
    C.burst(h.x, 0.6, h.z, h.ty.col, 22, 7, 0.4, 0.7, 1);
    C.spawnRing(h.x, h.z, h.ty.col, 3, 0.3);
    st.hudDirty = true;
  }

  function resolve(m, nx, nz, pen, keep) {
    m.x += nx * pen;
    m.z += nz * pen;
    const dot = m.vx * nx + m.vz * nz;
    if (dot < 0) {
      m.vx -= 2 * dot * nx;
      m.vz -= 2 * dot * nz;
      m.vx *= keep;
      m.vz *= keep;
    }
  }

  function stepMover(m, dt) {
    const sp = Math.hypot(m.vx, m.vz);
    const ns = sp - (DECEL + DRAG * sp) * (1 - ((m.mods && m.mods.bounceKeep) || 0)) * dt;
    if (ns <= STOP) {
      m.vx = m.vz = 0;
      m.moving = false;
      if (!m.clone) { m.settle = 1; C.sfx.land(); C.burst(m.x, 0.3, m.z, m.ty.col, 8, 3, 0.3, 0.5); }
      return;
    }
    m.vx *= ns / sp;
    m.vz *= ns / sp;
    const steps = Math.max(1, Math.ceil((ns * dt) / 0.22));
    for (let s = 0; s < steps && m.moving; s++) subStep(m, dt / steps);
  }

  function subStep(m, h) {
    const T = st.T, mods = m.mods || {};
    m.x += m.vx * h;
    m.z += m.vz * h;
    const r = m.r;
    // the trail is laid along the real path — a fast ball covers several units per frame
    const v = Math.hypot(m.vx, m.vz);
    m.trailD = (m.trailD || 0) + v * h;
    if (m.trailD > 0.6) {
      m.trailD = 0;
      const pierceTy = m.ty === TYPE.pierce;
      C.emit(m.x, 0.7, m.z, 0, 0, 0, pierceTy ? pick([m.ty.col, 0xffd23a]) : m.def.look.glow,
        (m.clone ? 0.45 : 0.5) + Math.min(1, v / 160) * 0.55, 0.3, 0, 0);
    }
    // SOLAR FLARE / RAINBOW DASH: the path is remembered and glows on the floor
    if (T.trail && m === T.h) {
      const tr = T.trail;
      tr.d += v * h;
      if (tr.d > 0.9 && tr.pts.length < 220) {
        tr.d = 0;
        tr.pts.push({ x: m.x, z: m.z });
        if (tr.rainbow) {
          const px = -m.vz / (v || 1), pz = m.vx / (v || 1);
          [0, 1, 2, 4, 5].forEach((c, k) => C.emit(m.x + px * (k - 2) * 0.42, 0.2, m.z + pz * (k - 2) * 0.42, 0, rand(0.1, 0.5), 0, RAINBOW[c], 1.25, 2.4, 0, 0));
        } else {
          C.emit(m.x, 0.25, m.z, 0, rand(0.3, 1), 0, pick([0xff5a1f, 0xffd23a]), 1.6, 2.2, 0, 0);
          C.emit(m.x + rand(-0.5, 0.5), 0.25, m.z + rand(-0.5, 0.5), 0, rand(1, 2), 0, 0xff9a1f, 1.1, 1.8, 0, 0);
        }
      }
    }
    let wall = null;
    if (m.x < -XW + r) { m.x = -XW + r; if (m.vx < 0) { m.vx = -m.vx * WALL_BOUNCE; wall = 'left'; } }
    else if (m.x > XW - r) { m.x = XW - r; if (m.vx > 0) { m.vx = -m.vx * WALL_BOUNCE; wall = 'right'; } }
    if (m.z < ZT + r) { m.z = ZT + r; if (m.vz < 0) { m.vz = -m.vz * WALL_BOUNCE; wall = 'top'; } }
    else if (m.z > ZB - r) { m.z = ZB - r; if (m.vz > 0) { m.vz = -m.vz * WALL_BOUNCE; wall = 'bottom'; } }
    const chin = C.circleRect(m.x, m.z, r, K.CHIN.x, K.CHIN.z, K.CHIN.hw, K.CHIN.hd);
    if (chin) { resolve(m, chin.nx, chin.nz, chin.pen, WALL_BOUNCE); wall = 'top'; }
    if (wall) {
      m.walls++;
      m.squash = 0.8;
      sound('wall');
      if (wall !== 'bottom') C.wallFlash(wall);
      C.burst(m.x, 0.6, m.z, m.ty.col, 6, 4, 0.25, 0.5);
      // STATIC WALLS / FEEDBACK LOOP: wall bounces send out a shock
      if (mods.wallShock && !m.clone && T.shocks < WALL_FX_CAP) {
        T.shocks++;
        C.spawnRing(m.x, m.z, m.def.look.glow, 3.4, 0.3);
        aliveEnemies().forEach((e) => { if (Math.hypot(e.x - m.x, e.z - m.z) < 3.4 + e.r) damageEnemy(e, m.atk * mods.wallShock, m, ''); });
      }
      // TESLA COIL (relic): wall bounces fire lightning at random enemies
      if (mods.wallBolt && !m.clone && T.bolts < WALL_BOLT_CAP) {
        const t = pick(aliveEnemies());
        if (t) {
          T.bolts++;
          C.lightning(m.x, m.z, t.x, t.z, m.def.look.glow);
          C.burst(t.x, 1, t.z, m.def.look.glow, 8, 5, 0.3, 0.6);
          damageEnemy(t, m.atk * mods.wallBolt, m, '');
          sound('zap');
        }
      }
    }
    for (const e of st.enemies) {
      if (!e.alive || e.drop > 0.05) continue;
      const dx = m.x - e.x, dz = m.z - e.z, d = Math.hypot(dx, dz) || 0.001, min = r + e.r;
      if (d >= min) continue;
      const last = m.contacts.get(e);
      const fresh = last === undefined || st.t - last > 0.12;
      if (fresh) hitEnemy(m, e, m.x - (dx / d) * r, m.z - (dz / d) * r, -dx / d, -dz / d);
      m.contacts.set(e, st.t);
      if (!T.pierce && e.alive) {
        resolve(m, dx / d, dz / d, min - d, ENEMY_BOUNCE);
        if (fresh) { m.squash = 1; m.pulse = 1; C.spawnRing(m.x - (dx / d) * r, m.z - (dz / d) * r, TYPE.bounce.col, 1.8, 0.25); }
      } else if (fresh) {
        // BLAZING TRAIL & co. speed the piercer up instead of slowing it down
        const k = mods.pierceBoost ? 1 + mods.pierceBoost : PIERCE_KEEP;
        const sp0 = Math.hypot(m.vx, m.vz), cap = m.v0 * 1.4;
        const f = sp0 * k > cap ? cap / sp0 : k;
        m.vx *= f;
        m.vz *= f;
        // a slash of light straight through the enemy shows the pierce
        const sp = Math.hypot(m.vx, m.vz) || 1, ux = m.vx / sp, uz = m.vz / sp, L = e.r + 1.2;
        beamLine(e.x - ux * L, e.z - uz * L, e.x + ux * L, e.z + uz * L, TYPE.pierce.col, T.drill ? 1.2 : 0.55, 0.25);
      }
    }
    if (!m.clone) {
      for (const o of st.heroes) {
        if (o === m || T.touched.has(o)) continue;
        if (Math.hypot(o.x - m.x, o.z - m.z) < r + o.r) { T.touched.add(o); o.hop = 1; triggerCombo(o, 1); }
      }
    }
    const reach = r + 0.8 + (mods.magnet || 0);
    for (const o of st.orbs) {
      if (o.alive && Math.hypot(o.x - m.x, o.z - m.z) < reach) collectOrb(o);
    }
  }

  // ------------------------------------------------------------- damage
  function hitEnemy(m, e, px, pz, nx, nz) {
    const T = st.T, mods = m.mods || {};
    const src = m.src || m;
    let dmg = m.atk * m.hitK * T.dmgMul * rand(0.92, 1.08);
    if (mods.wallPower) dmg *= 1 + Math.min(WALL_POWER_CAP, m.walls) * mods.wallPower;
    if (mods.firstHit && !T.firstDone) { dmg *= 2; T.firstDone = true; }
    const crit = Math.random() < 0.06 + (mods.crit || 0);
    if (crit) dmg *= 1.8 + (mods.critDmg || 0);
    if (e.def && FACTIONS[m.def.faction].beats === e.def.faction) dmg *= 1.25;
    if (mods.execute && e.hp < e.maxHp * 0.5) dmg *= 1 + mods.execute;
    if (mods.dmgBoss && e.boss) dmg *= 1 + mods.dmgBoss;
    if (mods.killStack) dmg *= 1 + Math.min(10 + (mods.killCap || 0), st.kills) * mods.killStack;
    if (mods.lastStand && st.teamHp < st.teamMax * 0.3) dmg *= 1 + mods.lastStand;
    const done = damageEnemy(e, dmg, src, T.aura && !m.clone ? 'hyper' : crit ? 'hot' : '');
    // impact feel: a split-second freeze (with a budget per shot, fast balls hit a lot), knockback
    const hs = crit || T.aura ? 0.05 : 0.018;
    if (T.stop < HITSTOP_BUDGET) { st.hitStop = Math.max(st.hitStop, hs); T.stop += hs; }
    if (T.aura && !m.clone) C.spawnRing(px, pz, T.aura, 3.2, 0.3);
    const kb = e.boss ? 0.2 : 0.6;
    e.kx += nx * kb;
    e.kz += nz * kb;
    C.addShake(crit ? 0.14 : 0.05);
    C.burst(px, 0.8, pz, m.ty.col, 12, 7, 0.3, 0.6, 1);
    C.burst(px, 0.8, pz, 0xffffff, 5, 5, 0.2, 0.4);
    sound(T.pierce ? 'pierce' : 'armor');
    if (mods.lifesteal) healTeam(done * mods.lifesteal, src, true);
    if (T.drain) {
      healTeam(done * T.drain, src, true);
      shoot(e, src, 0xb84dff, null, { speed: 30, size: 0.9 });   // a soul flies back
    }
    // HEAVY IMPACT & co.: one roll per enemy and turn
    if (mods.delayHit && e.alive && !T.delayed.has(e)) {
      T.delayed.add(e);
      if (Math.random() < mods.delayHit && e.cd < e.cdMax + 2) {
        e.cd++;
        C.popup('+1 TURN', e.x, e.z - e.r - 0.6, 'lvl');
        C.spawnRing(e.x, e.z, 0x9ff4ff, e.r * 1.6, 0.35);
      }
    }
    // VENOM GLAND: poison ticks at the start of the next two enemy turns
    if (mods.poison && e.alive) {
      if (!e.poisonT) C.spawnRing(e.x, e.z, 0x8dff2a, e.r * 1.6, 0.35);
      e.poison = Math.max(e.poison, src.atk * mods.poison);
      e.poisonT = 2;
      e.poisonSrc = src;
    }
    // CURSED GRIMOIRE: cursed enemies take more damage from everything
    if (mods.curse && e.alive && e.curse < mods.curse) {
      e.curse = mods.curse;
      C.spawnRing(e.x, e.z, 0xb84dff, e.r * 1.8, 0.45);
      C.popup('CURSED', e.x, e.z - e.r - 0.6, 'pu');
    }
    // SOUL LEDGER: low enemies are executed on the spot
    if (mods.reap && e.alive && !e.boss && e.hp < e.maxHp * mods.reap) {
      C.popup('REAPED', e.x, e.z - e.r - 0.6, 'hyper');
      beamLine(e.x - 1.8, e.z - 1.8, e.x + 1.8, e.z + 1.8, 0xa64dff, 0.7, 0.35);
      beamLine(e.x - 1.8, e.z + 1.8, e.x + 1.8, e.z - 1.8, 0xa64dff, 0.7, 0.35);
      damageEnemy(e, e.hp, src, 'hot');
    }
    // SHRAPNEL / GRAVITY LENS: splash onto neighbours
    if (mods.splash) {
      C.spawnRing(e.x, e.z, m.def.look.glow, 3, 0.25);
      aliveEnemies().forEach((o) => {
        if (o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 3 + o.r) damageEnemy(o, done * mods.splash, src, '');
      });
    }
    // SINGULARITY SEED: a micro black hole drags the neighbours in
    if (mods.gravHit && st.t - (e.gravT || -1) > 0.25) {
      e.gravT = st.t;
      C.spawnRing(e.x, e.z, 0xb84dff, 4.5, 0.3);
      for (let i = 0; i < 10; i++) {
        const a = rand(0, Math.PI * 2);
        C.emit(e.x + Math.cos(a) * 4, 0.8, e.z + Math.sin(a) * 4, -Math.cos(a) * 12, 0, -Math.sin(a) * 12, pick([0xb84dff, 0xff3cf2]), 0.7, 0.3, 0, 0);
      }
      aliveEnemies().forEach((o) => {
        const d = Math.hypot(o.x - e.x, o.z - e.z);
        if (o === e || d > 4.5 + o.r) return;
        const k = Math.max(0, Math.min(0.3, (d - o.r - e.r - 0.3) / d));
        if (!o.boss && k > 0) { o.tx = lerp(o.tx, e.x, k); o.tz = lerp(o.tz, e.z, k); }
        damageEnemy(o, done * mods.gravHit, src, '');
      });
    }
    // STRANGLEROOT: every enemy the hero hits gets tied up; the vines crush it when the ball stops
    if (T.tether && m === T.h && !T.tether.list.has(e)) {
      T.tether.list.add(e);
      if (e.alive && !e.tie) { e.tie = vineCoil(e.r); e.root.add(e.tie); }
      beamLine(m.x, m.z, e.x, e.z, 0x3dff7a, 0.3, 0.45);
      C.popup('TIED UP', e.x, e.z - e.r - 0.6, 'tox');
    }
    if (T.bomb) {
      explosion(e.x, e.z, 0xff9a1f, e.boss ? 2.2 : 1.5);
      aliveEnemies().forEach((o) => {
        if (o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 3.8 + o.r) damageEnemy(o, done * T.bomb, src, 'hot');
      });
    }
  }

  function damageEnemy(e, raw, src, cls) {
    if (!e.alive) return 0;
    const dmg = Math.max(1, Math.round(raw * (1 + (e.curse || 0))));
    e.hp -= dmg;
    e.flash = 1;
    e.wobble = 1;
    if (src && src.dealt !== undefined) src.dealt += dmg;
    C.popup(String(dmg), e.x + rand(-0.4, 0.4), e.z - e.r * 0.6, cls);
    if (e.hp <= 0) killEnemy(e, src);
    return dmg;
  }

  function killEnemy(e, src) {
    e.alive = false;
    e.hp = 0;
    e.dying = 0.001;
    st.kills++;
    C.burst(e.x, 1, e.z, e.color, e.boss ? 80 : 30, e.boss ? 12 : 8, 0.7, 1, 2);
    C.burst(e.x, 1, e.z, 0xffffff, 12, 6, 0.4, 0.7);
    C.spawnRing(e.x, e.z, e.color, e.boss ? 9 : 3.4, 0.5);
    C.spawnDebris(e.x, e.z, e.color, e.boss ? 14 : 6);
    C.flashLight(e.x, e.z, e.color, e.boss ? 8 : 3);
    C.sigilPulse(e.boss ? 0.8 : 0.12);
    if (e.boss) { C.addShake(1); C.sfx.explode(); C.glitch(0.6); st.hitStop = 0.25; } else C.sfx.brick(Math.min(12, st.kills));
    if (st.killHeal) healTeam(st.teamMax * st.killHeal, null, true);
    // APOCALYPSE: everything the hero destroys this turn explodes into its neighbours (chains!)
    const T = st.T;
    if (T && T.boom && st.phase === 'move' && src === T.h) {
      later(0.07, () => {
        explosion(e.x, e.z, 0xff3a1a, e.boss ? 2.6 : 1.6);
        C.spawnRing(e.x, e.z, 0xff5a1f, 4.2, 0.4);
        aliveEnemies().forEach((o) => { if (Math.hypot(o.x - e.x, o.z - e.z) < 4.2 + o.r) damageEnemy(o, T.boom, T.h, 'hot'); });
      });
    }
    // CARNIVORE / HARVEST MOON: kills charge the killer's HYPER
    if (src && src.mods && src.mods.killRefund && src.charge > 0) {
      src.charge = Math.max(0, src.charge - src.mods.killRefund);
      C.popup('HYPER +' + src.mods.killRefund, src.x, src.z - 1.6, 'lvl');
    }
    // loot: coins are plentiful here, heal orbs now and then
    if (e.boss) {
      for (let i = 0; i < 6; i++) makeOrb('coin', e.x + rand(-2, 2), e.z + rand(-2, 2), 10 + Math.floor(Math.random() * 6));
    } else if (Math.random() < 0.6 + st.coinFind) {
      makeOrb('coin', e.x + rand(-0.4, 0.4), e.z + rand(-0.4, 0.4), 4 + Math.floor(Math.random() * 5));
    }
    if (!e.boss && Math.random() < 0.15) makeOrb('heal', e.x + rand(-0.5, 0.5), e.z + rand(-0.5, 0.5));
    if (e.label) e.label.el.classList.add('dead');
    st.hudDirty = true;
  }

  function healTeam(amount, src, quiet) {
    const h = Math.max(0, Math.min(st.teamMax - st.teamHp, Math.round(amount)));
    if (!h) return 0;
    st.teamHp += h;
    if (src && src.healed !== undefined) src.healed += h;
    if (!quiet) {
      const p = src || curHero();
      C.popup('+' + h, p.x, p.z - 1.2, 'tox');
    }
    st.hudDirty = true;
    return h;
  }

  function hurtTeam(raw, h, attacker) {
    if (st.teamHp <= 0) return;
    const dmg = Math.max(1, Math.round(raw * rand(0.92, 1.08) * st.armorK * (1 - st.shield)));
    st.teamHp = Math.max(0, st.teamHp - dmg);
    C.popup('-' + dmg, h.x, h.z, 'big');
    // HALO OF THE FIRST CODE (relic): once per battle a lethal blow is cancelled
    if (st.teamHp <= 0 && st.revive && !st.reviveUsed) {
      st.reviveUsed = true;
      st.teamHp = Math.round(st.teamMax * st.revive);
      const g = st.heroes.find((o) => o.mods.revive) || h;
      screenFlash(0xfff3a0, 0.9);
      C.popup('RESURRECTION', g.x, g.z - 2.4, 'hyper');
      st.heroes.forEach((o, i) => later(i * 0.08, () => { pillar(o.x, o.z, 0xfff3a0, 1.3, 1, 14, 0.6); o.domePop = 1; o.hop = 1; }));
      C.sfx.life();
    }
    h.flash = 1;
    h.hurt = 1;
    if (st.shield > 0) h.domePop = Math.max(h.domePop, 0.6);
    C.addShake(0.3);
    C.burst(h.x, 1, h.z, 0xff2a4d, 14, 5, 0.4, 0.7, 1);
    C.sfx.bossHit();
    // COUNTER FIELD / PHALANX & co.: part of the hit goes straight back
    const counter = st.counter + (st.wall ? st.wall.reflect : 0);
    if (counter && attacker && attacker.alive) {
      const back = dmg * counter;
      later(0.12, () => {
        if (!attacker.alive) return;
        beamLine(h.x, h.z, attacker.x, attacker.z, 0x9ff4ff, st.wall ? 0.8 : 0.4, 0.3);
        damageEnemy(attacker, back, null, 'hot');
      });
    }
    if (st.guardian && !st.guardianUsed && st.teamHp > 0 && st.teamHp < st.teamMax * 0.25) {
      st.guardianUsed = true;
      const g = st.heroes.find((o) => o.mods.guardian) || h;
      later(0.2, () => {
        C.popup('GUARDIAN PROTOCOL', g.x, g.z - 2, 'hyper');
        st.heroes.forEach((o) => { C.spawnRing(o.x, o.z, 0xdffbff, 3, 0.6); pillar(o.x, o.z, 0xdffbff, 1.1, 0.7, 9, 0.5); });
        healTeam(st.teamMax * st.guardian, g);
        C.sfx.life();
      });
    }
    st.hudDirty = true;
  }

  // -------------------------------------------------------------- orbs
  function makeOrb(type, x, z, value) {
    const g = new THREE.Group();
    let spin = null;
    if (type === 'coin') {
      const c = M.makeCoin();
      c.group.scale.setScalar(value >= 10 ? 2 : 1.5);
      g.add(c.group);
      spin = c.spinner;
    } else {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: 0xd8ffb0 }));
      g.add(core, M.glow(0x8dff2a, 2.4, 0.8));
      spin = core;
    }
    g.position.set(clamp(x, -XW + 1, XW - 1), 0.9, clamp(z, ZT + 1, ZB - 1));
    scene.add(g);
    st.orbs.push({ type, value: value || 0, x: g.position.x, z: g.position.z, g, spin, alive: true, t: rand(0, 6) });
  }

  function collectOrb(o) {
    o.alive = false;
    scene.remove(o.g);
    if (o.type === 'coin') {
      const got = C.awardCoins(Math.round(o.value * (1 + st.coinFind)));
      st.coins += got;
      C.popup('+' + got, o.x, o.z, 'coin');
      C.sfx.coin();
      C.burst(o.x, 0.9, o.z, 0xffc933, 12, 5, 0.4, 0.6, 1);
    } else {
      healTeam(st.teamMax * 0.12, null);
      C.sfx.life();
      C.burst(o.x, 0.9, o.z, 0x8dff2a, 16, 5, 0.5, 0.7, 1);
    }
    st.orbs = st.orbs.filter((p) => p.alive);
  }

  // ------------------------------------------------------------- combos
  function lineAttack(src, dirs, pw, col) {
    dirs.forEach(([dx, dz]) => {
      const t1 = exitDist(src.x, src.z, dx, dz), t0 = exitDist(src.x, src.z, -dx, -dz);
      beamLine(src.x - dx * t0, src.z - dz * t0, src.x + dx * t1, src.z + dz * t1, col, 0.9, 0.45);
      aliveEnemies().forEach((e) => {
        if (Math.abs((e.x - src.x) * dz - (e.z - src.z) * dx) < e.r + 0.45) damageEnemy(e, pw, src, '');
      });
    });
    C.sfx.laser();
  }

  function areaAttack(x, z, r, pw, col, src) {
    C.spawnRing(x, z, col, r, 0.45);
    C.burst(x, 1, z, col, 24, r * 1.6, 0.5, 0.9, 1);
    aliveEnemies().forEach((e) => {
      if (Math.hypot(e.x - x, e.z - z) < r + e.r) damageEnemy(e, pw, src, '');
    });
    C.sfx.nova();
  }

  function chainAttack(src, n, pw, col) {
    let from = src;
    const done = new Set();
    for (let i = 0; i < n; i++) {
      const t = nearestTo(from, aliveEnemies().filter((e) => !done.has(e)));
      if (!t) break;
      done.add(t);
      C.lightning(from.x, from.z, t.x, t.z, col);
      damageEnemy(t, pw, src, '');
      from = t;
    }
    C.sfx.zap();
  }

  // homing projectile (combos, meteors, enemy barrages, drained souls)
  function shoot(from, to, color, onHit, o) {
    const opts = o || {};
    const g = new THREE.Group();
    g.add(M.glow(color, opts.size || 1.4, 0.95), opts.model || new THREE.Mesh(new THREE.SphereGeometry(0.16 * (opts.core || 1), 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    g.position.set(from.x, opts.fromY || 1, from.z);
    scene.add(g);
    st.shots.push({
      g, to, tx: to.x, tz: to.z, color, onHit, speed: opts.speed || 26, drop: !!opts.drop, trail: 0, trailEvery: opts.trailEvery || 0.03, trailSize: opts.trailSize || 0.6,
      spin: opts.model && opts.spin ? opts.model : null, spinV: opts.spin || 0,
    });
  }

  function triggerCombo(ally, mult, echo) {
    const c = ally.def.combo;
    const col = ally.def.look.glow;
    const pw = ally.atk * (c.power || 0) * (1 + (ally.mods.comboPower || 0)) * mult;
    const n = (c.n || 0) + (ally.mods.comboN || 0);   // BURNT GUITAR PICK & co. add projectiles
    ally.flash = 1;
    C.popup(echo ? c.name + ' ×2' : c.name, ally.x, ally.z - 1.8, 'pu');
    C.spawnRing(ally.x, ally.z, col, 2.6, 0.35);
    // GOLDEN MIC: the combo charges this hero's own HYPER (once per turn)
    if (ally.mods.comboCharge && ally.charge > 0 && st.T && !st.T.comboCharged.has(ally)) {
      st.T.comboCharged.add(ally);
      ally.charge = Math.max(0, ally.charge - ally.mods.comboCharge);
      C.popup('HYPER +' + ally.mods.comboCharge, ally.x, ally.z - 0.4, 'lvl');
    }
    switch (ally.mods.comboKind || c.kind) {
      case 'laser2': lineAttack(ally, [[1, 0]], pw, col); break;
      case 'laserV': lineAttack(ally, [[0, 1]], pw, col); break;
      case 'cross': lineAttack(ally, [[1, 0], [0, 1]], pw, col); break;
      case 'laserX': lineAttack(ally, [[0.7071, 0.7071], [0.7071, -0.7071]], pw, col); break;
      case 'laser4': lineAttack(ally, [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]], pw, col); break;
      case 'blast':
      case 'nova': areaAttack(ally.x, ally.z, c.r, pw, col, ally); break;
      case 'chain': chainAttack(ally, n, pw, col); break;
      case 'homing':
        for (let i = 0; i < n; i++) {
          later(i * 0.07, () => {
            const t = pick(aliveEnemies());
            if (t) shoot(ally, t, col, () => damageEnemy(t, pw, ally, ''));
          });
        }
        C.sfx.bolt();
        break;
      case 'heal':
        healTeam(st.teamMax * c.heal * mult * (1 + (ally.mods.healPower || 0)), ally);
        C.burst(ally.x, 1, ally.z, 0x8dff2a, 20, 4, 0.7, 0.8, 2);
        C.sfx.life();
        break;
      case 'shield':
        st.shield = Math.max(st.shield, Math.min(0.8, c.shield * mult));
        st.heroes.forEach((o) => { o.domePop = 1; });
        C.popup('SHIELD ' + Math.round(st.shield * 100) + '%', ally.x, ally.z - 0.6, 'lvl');
        C.sfx.shield();
        break;
      // AEGIS-7: shield the team, a hex pulse throws the enemies nearby back
      case 'bulwark':
        st.shield = Math.max(st.shield, Math.min(0.8, c.shield * mult));
        st.heroes.forEach((o) => { o.domePop = 1; });
        C.popup('SHIELD ' + Math.round(st.shield * 100) + '%', ally.x, ally.z - 0.6, 'lvl');
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; afterimage(ally.x + Math.cos(a) * 1.9, 1, ally.z + Math.sin(a) * 1.9, col, 1.8); }
        areaAttack(ally.x, ally.z, c.r, pw, col, ally);
        knockback(ally, c.r, 1.8);
        C.sfx.shield();
        break;
      // HALCYON: heal now and over the next turns
      case 'renew': {
        const k = mult * healK(ally);
        healTeam(st.teamMax * c.heal * k, ally);
        st.hot.push({ k: c.regen * k, turns: c.turns, src: ally });
        st.heroes.forEach((o, i) => later(i * 0.06, () => { pillar(o.x, o.z, 0x8dff2a, 0.9, 0.6, 6, 0.45); sparkleUp(o.x, o.z, 0x8dff2a, 8); }));
        C.popup('+' + mul(c.regen * k * 100) + '% × ' + c.turns + ' TURNS', ally.x, ally.z - 0.4, 'tox');
        C.sfx.life();
        break;
      }
      // SCRAPJAW: a buzzsaw ricochets from enemy to enemy
      case 'sawblade': {
        const done = new Set();
        const bounce = (from, left) => {
          const t = left > 0 && nearestTo(from, aliveEnemies().filter((e) => !done.has(e)));
          if (!t) return;
          done.add(t);
          shoot(from, t, col, () => {
            damageEnemy(t, pw, ally, '');
            C.burst(t.x, 1, t.z, 0xffc933, 12, 7, 0.3, 0.5, 1);
            sound('armor');
            bounce(t, left - 1);
          }, { speed: 34, size: 1.2, model: sawMesh(0xdde2ee, 0.55), spin: -24, trailEvery: 0.02, trailSize: 0.45 });
        };
        bounce(ally, n);
        break;
      }
      // RAMCORE: the floor cracks, enemies may stagger
      case 'quake':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
          let px = ally.x, pz = ally.z;
          for (let k = 1; k <= 3; k++) {
            const b = a + rand(-0.25, 0.25), nx = ally.x + Math.cos(b) * c.r * k / 3, nz = ally.z + Math.sin(b) * c.r * k / 3;
            segment(px, 0.12, pz, nx, 0.12, nz, 0xff9a1f, 0.18, 0.6);
            px = nx; pz = nz;
          }
        }
        C.spawnDebris(ally.x, ally.z, col, 6);
        C.addShake(0.5);
        areaAttack(ally.x, ally.z, c.r, pw, col, ally);
        aliveEnemies().forEach((e) => { if (Math.hypot(e.x - ally.x, e.z - ally.z) < c.r + e.r && Math.random() < c.delay) stun(e, 1, 'STAGGERED'); });
        break;
      // SPORE: a healing cloud that poisons the enemies inside it
      case 'sporeCloud':
        healTeam(st.teamMax * c.heal * mult * healK(ally), ally);
        for (let i = 0; i < 36; i++) {
          const a = rand(0, Math.PI * 2), r = rand(0, c.r);
          C.emit(ally.x + Math.cos(a) * r, 0.4, ally.z + Math.sin(a) * r, rand(-1, 1), rand(0.5, 2), rand(-1, 1), pick([0x8dff2a, 0x3dff7a, 0xd8ff5a]), rand(1.2, 2.2), rand(0.9, 1.4), 1.5, 0);
        }
        C.spawnRing(ally.x, ally.z, 0x8dff2a, c.r, 0.6);
        aliveEnemies().forEach((e) => { if (Math.hypot(e.x - ally.x, e.z - ally.z) < c.r + e.r) poisonEnemy(e, pw, ally); });
        C.sfx.life();
        break;
      // VIPER.EXE: poisoned homing darts
      case 'venomDarts':
        for (let i = 0; i < n; i++) {
          later(i * 0.08, () => {
            const t = pick(aliveEnemies());
            if (t) shoot(ally, t, 0x8dff2a, () => { damageEnemy(t, pw, ally, ''); poisonEnemy(t, ally.atk * c.poison * mult, ally); }, { speed: 40, size: 1.1, core: 0.6 });
          });
        }
        C.sfx.bolt();
        break;
      // MOSSBACK: roots grab the nearest enemies
      case 'roots':
        aliveEnemies().sort((a, b) => Math.hypot(a.x - ally.x, a.z - ally.z) - Math.hypot(b.x - ally.x, b.z - ally.z)).slice(0, n).forEach((e, i) => later(i * 0.15, () => {
          if (!e.alive) return;
          beamLine(ally.x, ally.z, e.x, e.z, 0x3dff7a, 0.35, 0.5);
          rootsAt(e.x, e.z, e.r, 0x3dff7a);
          damageEnemy(e, pw, ally, '');
          stun(e, 1, 'ROOTED');
        }));
        break;
      // NULLBLADE: blinks to the weakest enemies and cuts them
      case 'phantomCut':
        afterimage(ally.x, HERO_R, ally.z, col, 2.6);
        aliveEnemies().sort((a, b) => a.hp - b.hp).slice(0, n).forEach((e, i) => later(0.08 + i * 0.12, () => {
          if (!e.alive) return;
          const a = rand(0, Math.PI);
          afterimage(e.x - Math.cos(a) * (e.r + 1), HERO_R, e.z - Math.sin(a) * (e.r + 1), col, 2.6);
          slash(e.x, e.z, e.r + 1.6, a, col);
          damageEnemy(e, pw, ally, 'hot');
          sound('pierce');
        }));
        break;
      // GLITCHWIDOW: sticky web shots
      case 'webSnare':
        for (let i = 0; i < n; i++) {
          later(i * 0.07, () => {
            const t = pick(aliveEnemies());
            if (t) {
              shoot(ally, t, 0xf2f6ff, () => {
                damageEnemy(t, pw, ally, '');
                C.spawnRing(t.x, t.z, 0xffffff, t.r * 1.5, 0.3);
                if (t.alive && Math.random() < c.delay) stun(t, 1, 'WEBBED');
              }, { speed: 30, size: 1.2 });
            }
          });
        }
        C.sfx.bolt();
        break;
      // REAPER.SYS: a full circle with the scythe, the weak are executed
      case 'scytheSweep': {
        const a0 = rand(0, Math.PI * 2);
        for (let k = 0; k < 12; k++) {
          later(k * 0.025, () => {
            const a = a0 + (k / 12) * Math.PI * 2;
            beamLine(ally.x, ally.z, ally.x + Math.cos(a) * c.r, ally.z + Math.sin(a) * c.r, col, 0.55, 0.3);
          });
        }
        later(0.3, () => {
          areaAttack(ally.x, ally.z, c.r, pw, col, ally);
          aliveEnemies().forEach((e) => {
            if (e.boss || e.hp >= e.maxHp * c.exec || Math.hypot(e.x - ally.x, e.z - ally.z) > c.r + e.r) return;
            C.popup('EXECUTED', e.x, e.z - e.r - 0.6, 'hyper');
            slash(e.x, e.z, e.r + 1.4, Math.PI / 4, 0xa64dff);
            slash(e.x, e.z, e.r + 1.4, -Math.PI / 4, 0xa64dff);
            damageEnemy(e, e.hp, ally, 'hot');
          });
        });
        break;
      }
      // SERAPHINE: heal and shield in one
      case 'divine':
        healTeam(st.teamMax * c.heal * mult * healK(ally), ally);
        st.shield = Math.max(st.shield, Math.min(0.8, c.shield * mult));
        st.heroes.forEach((o, i) => later(i * 0.07, () => { o.domePop = 1; pillar(o.x, o.z, 0xfff3a0, 1, 0.7, 14, 0.5); }));
        C.popup('SHIELD ' + Math.round(st.shield * 100) + '%', ally.x, ally.z - 0.6, 'lvl');
        C.sfx.life();
        C.sfx.shield();
        break;
      // VALKYRIE: spears of light fall from the sky
      case 'spearRain':
        spreadTargets(n).forEach((t, i) => later(i * 0.07, () => {
          if (!t.alive) return;
          shoot({ x: t.x + rand(-1.5, 1.5), z: t.z - 5 }, t, 0xfff3a0, () => {
            damageEnemy(t, pw, ally, '');
            C.spawnRing(t.x, t.z, col, t.r * 1.6, 0.3);
            segment(t.x + rand(-0.4, 0.4), 0, t.z + rand(-0.4, 0.4), t.x, 3.5, t.z - 0.8, 0xffffff, 0.12, 0.4);
          }, { fromY: 20, drop: true, speed: 60, size: 1.4, trailEvery: 0.01, trailSize: 0.7 });
        }));
        C.sfx.bolt();
        break;
      // OBLIVION: drags the enemies nearby in and crushes them
      case 'gravityWell': {
        const list = aliveEnemies().filter((e) => Math.hypot(e.x - ally.x, e.z - ally.z) < c.r + e.r);
        for (let i = 0; i < 26; i++) {
          const a = rand(0, Math.PI * 2);
          C.emit(ally.x + Math.cos(a) * c.r, 0.8, ally.z + Math.sin(a) * c.r, -Math.cos(a) * c.r * 2.2, 0, -Math.sin(a) * c.r * 2.2, pick([0xb84dff, 0xff3cf2, 0xffffff]), 0.9, 0.45, 0, 0);
        }
        list.forEach((e) => {
          e.wobble = 1;
          if (e.boss) return;
          const d = Math.hypot(e.x - ally.x, e.z - ally.z) || 1, want = ally.r + e.r + 0.5;
          if (d <= want) return;
          const k = ((d - want) / d) * 0.65;
          e.tx = e.x + (ally.x - e.x) * k;
          e.tz = e.z + (ally.z - e.z) * k;
        });
        C.spawnRing(ally.x, ally.z, 0xb84dff, c.r, 0.45);
        later(0.3, () => {
          C.spawnRing(ally.x, ally.z, 0xff3cf2, 3, 0.3);
          list.forEach((e) => { if (!e.alive) return; C.burst(e.x, 1, e.z, 0xb84dff, 14, 6, 0.4, 0.7); damageEnemy(e, pw, ally, ''); });
          C.sfx.nova();
        });
        break;
      }
      // DREADCORE: hellfire erupts under random enemies
      case 'hellfire':
        spreadTargets(n).forEach((t, i) => {
          reticle(t.x, t.z, t.r * 1.3, 0xff3a1a, 0.25 + i * 0.08);
          later(0.25 + i * 0.08, () => {
            if (!t.alive) return;
            pillar(t.x, t.z, pick([0xff3a1a, 0xff6a1f]), t.r * 0.9, 0.5, 7, 0.85);
            C.burst(t.x, 0.5, t.z, 0xff5a1f, 22, 8, 0.5, 0.9, 2);
            damageEnemy(t, pw, ally, 'hot');
            sound('explode');
          });
        });
        break;
      // LEVIATHAN: a whirlpool spins the enemies around it twice
      case 'whirlpool':
        for (let k = 0; k < 2; k++) {
          later(k * 0.38, () => {
            for (let i = 0; i < 30; i++) {
              const a = rand(0, Math.PI * 2), r = rand(1.5, c.r);
              C.emit(ally.x + Math.cos(a) * r, 0.5, ally.z + Math.sin(a) * r, -Math.sin(a) * r * 3, rand(0.5, 2), Math.cos(a) * r * 3, pick([0x19c6ff, 0x9ff4ff, col]), 1, 0.4, 0, 0);
            }
            C.spawnRing(ally.x, ally.z, 0x19c6ff, c.r, 0.4);
            aliveEnemies().forEach((e) => {
              const dx = e.x - ally.x, dz = e.z - ally.z, d = Math.hypot(dx, dz);
              if (d > c.r + e.r) return;
              if (!e.boss) {
                const a = Math.atan2(dz, dx) + 0.35;
                e.tx = clamp(ally.x + Math.cos(a) * d, -XW + e.r + 0.3, XW - e.r - 0.3);
                e.tz = clamp(ally.z + Math.sin(a) * d, ZT + e.r + 0.5, ZB - e.r - 3);
              }
              damageEnemy(e, pw, ally, '');
            });
            C.sfx.nova();
          });
        }
        break;
      // HOLLOW: a shadow clone dashes through the nearest enemy and on to the wall
      case 'shadowClone': {
        const t = nearestTo(ally, aliveEnemies());
        if (!t) break;
        const dx = t.x - ally.x, dz = t.z - ally.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const L = exitDist(ally.x, ally.z, ux, uz), steps = Math.ceil(L / 1.1);
        for (let i = 1; i <= steps; i++) later(i * 0.012, () => afterimage(ally.x + ux * i * 1.1, HERO_R, ally.z + uz * i * 1.1, i % 2 ? 0x3a1a5a : col, 2.4));
        beamLine(ally.x, ally.z, ally.x + ux * L, ally.z + uz * L, col, 0.4, 0.35);
        aliveEnemies().forEach((e) => {
          const along = (e.x - ally.x) * ux + (e.z - ally.z) * uz;
          if (along > 0 && Math.abs((e.x - ally.x) * uz - (e.z - ally.z) * ux) < e.r + 0.7) {
            later(along * 0.011, () => { damageEnemy(e, pw, ally, 'hot'); C.burst(e.x, 1, e.z, col, 14, 7, 0.3, 0.6); });
          }
        });
        sound('pierce');
        break;
      }
      // UNICORE: rainbow shooting stars; every star heals a little
      case 'starfall':
        spreadTargets(n).forEach((t, i) => later(i * 0.09, () => {
          if (!t.alive) return;
          const color = RAINBOW[i % RAINBOW.length];
          shoot({ x: t.x - 7, z: t.z - 6 }, t, color, () => {
            damageEnemy(t, pw, ally, '');
            C.burst(t.x, 1, t.z, color, 16, 6, 0.4, 0.8, 1);
            C.spawnRing(t.x, t.z, color, t.r * 1.8, 0.35);
            healTeam(st.teamMax * c.heal * mult * healK(ally), ally, true);
          }, { fromY: 18, drop: true, speed: 46, size: 2, trailEvery: 0.008, trailSize: 0.9 });
        }));
        C.sfx.bolt();
        break;
      default: break;
    }
    // MIRACLE CODE / ENCORE / SPECTRUM: the combo can echo once
    if (!echo && ally.mods.comboEcho && Math.random() < ally.mods.comboEcho) later(0.35, () => triggerCombo(ally, mult, true));
    st.hudDirty = true;
  }

  // -------------------------------------------------------------- hypers
  function delayEnemies(n) {
    aliveEnemies().forEach((e) => {
      e.cd += n;
      e.wobble = 1;
      C.spawnRing(e.x, e.z, 0x9ff4ff, e.r * 1.8, 0.5);
      C.popup('+' + n + ' TURN' + (n > 1 ? 'S' : ''), e.x, e.z - e.r - 0.8, 'lvl');
      if (e.label) { e.label.el.classList.remove('delayed'); void e.label.el.offsetWidth; e.label.el.classList.add('delayed'); }
    });
    C.sfx.stun();
  }

  // Plays the HYPER's own effect after the cut-in and returns how long it takes
  // (in battle time) before the hero is slung.
  function hyperEffect(h) {
    const y = h.def.hyper, T = st.T, col = h.def.look.glow;
    const pw = (y.power || 1) * (1 + (h.mods.hyperPower || 0));
    const dmg = h.atk * pw;
    const enemies = aliveEnemies();
    switch (y.kind) {
      // ---- empowered slings: the hero glows and leaves afterimages all turn
      case 'overdrive':
        T.dmgMul = pw; T.speedMul = y.speed || 1.3; T.aura = col; T.after = col;
        hyperPop('DAMAGE ×' + mul(pw) + (T.speedMul > 1 ? '  ·  SPEED ×' + mul(T.speedMul) : ''), h.x, h.z - 2.6);
        C.sfx.charge();
        return 0.35;
      case 'pierceStorm':
        T.pierce = true; T.dmgMul = pw; T.aura = TYPE.pierce.col; T.after = col; T.drill = true;
        hyperPop('PIERCE EVERYTHING  ·  ×' + mul(pw), h.x, h.z - 2.6);
        for (let i = 0; i < 4; i++) later(i * 0.06, () => C.spawnRing(h.x, h.z, TYPE.pierce.col, 2 + i, 0.3));
        return 0.35;
      case 'bomb':
        T.bomb = pw; T.aura = 0xff9a1f; T.after = 0xff6a1f;
        hyperPop('EVERY HIT EXPLODES', h.x, h.z - 2.6);
        explosion(h.x, h.z, 0xff9a1f, 1);
        return 0.4;
      case 'drain':
        T.drain = y.drain; T.dmgMul = pw; T.aura = 0xb84dff; T.after = 0xb84dff;
        hyperPop('LIFE DRAIN  ·  ×' + mul(pw), h.x, h.z - 2.6);
        for (let i = 0; i < 20; i++) {
          const a = rand(0, Math.PI * 2), r = rand(3, 5);
          C.emit(h.x + Math.cos(a) * r, 1, h.z + Math.sin(a) * r, -Math.cos(a) * r * 2, 0.5, -Math.sin(a) * r * 2, 0xb84dff, 1, 0.5, 0, 0);
        }
        return 0.4;
      case 'split':
        T.clones = y.n;
        hyperPop('SPLIT ×' + (y.n + 1), h.x, h.z - 2.6);
        for (let i = 0; i < y.n; i++) {
          const a = (i / y.n) * Math.PI * 2;
          for (let k = 0; k < 5; k++) later(k * 0.05, () => afterimage(h.x + Math.cos(a) * k * 0.5, HERO_R, h.z + Math.sin(a) * k * 0.5, col, 2.4));
        }
        C.sfx.split();
        return 0.4;
      // ---- spells: they play out completely before the sling
      case 'meteorRain': {
        const list = spreadTargets(y.n);
        screenFlash(0xff3a1a, 1.8);
        hyperPop('METEOR STRIKE ×' + y.n, 0, -6);
        list.forEach((t, i) => reticle(t.x, t.z, t.r * 1.5, 0xff5a1f, 0.55 + i * 0.14));
        list.forEach((t, i) => later(0.5 + i * 0.14, () => {
          if (!t.alive) return;
          shoot({ x: t.x + 5, z: t.z - 9 }, t, 0xff6a1f, () => {
            explosion(t.x, t.z, 0xff6a1f, 1.6);
            damageEnemy(t, dmg, h, 'hyper');
          }, { fromY: 24, drop: true, speed: 38, size: 3.6, core: 2.5, trailEvery: 0.01, trailSize: 1.4 });
        }));
        return 0.5 + y.n * 0.14 + 0.75;
      }
      case 'strikes': {
        const list = spreadTargets(y.n);
        screenFlash(0x9ff4ff, 0.6);
        hyperPop('THUNDERSTORM ×' + y.n, 0, -6);
        list.forEach((t, i) => reticle(t.x, t.z, t.r * 1.4, col, 0.3 + i * 0.12));
        list.forEach((t, i) => later(0.3 + i * 0.12, () => {
          if (!t.alive) return;
          skyBolt(t.x, t.z, col);
          C.spawnRing(t.x, t.z, col, t.r * 2.4, 0.4);
          C.burst(t.x, 1, t.z, col, 18, 8, 0.4, 0.8, 1);
          C.addShake(0.25);
          damageEnemy(t, dmg, h, 'hyper');
          C.sfx.zap();
        }));
        return 0.3 + y.n * 0.12 + 0.5;
      }
      case 'nova': {
        // ORBITAL STRIKE: thin targeting lasers lock on, then everything is blasted at once
        hyperPop('ORBITAL LOCK-ON', 0, -6);
        enemies.forEach((e) => { pillar(e.x, e.z, col, 0.14, 0.6); reticle(e.x, e.z, e.r * 1.5, col, 0.6); });
        later(0.6, () => {
          screenFlash(0xffffff, 0.45);
          C.addShake(0.9);
          aliveEnemies().forEach((e) => {
            pillar(e.x, e.z, col, e.r * 1.2, 0.7, 34, 0.75);
            explosion(e.x, e.z, col, e.r);
            damageEnemy(e, dmg, h, 'hyper');
          });
        });
        return 1.3;
      }
      case 'fortress': {
        healTeam(st.teamMax * y.heal * (1 + (h.mods.healPower || 0)), h);
        st.shield = Math.max(st.shield, y.shield || 0);
        hyperPop((y.shield ? 'SHIELD ' + Math.round(st.shield * 100) + '%  ·  ' : '') + 'HEAL ' + Math.round(y.heal * 100) + '%', h.x, h.z - 2.6);
        st.heroes.forEach((o, i) => later(i * 0.1, () => {
          o.domePop = 1;
          pillar(o.x, o.z, 0x8dff2a, 1.1, 0.8, 7, 0.45);
          for (let k = 0; k < 12; k++) C.emit(o.x + rand(-1, 1), 0.5, o.z + rand(-1, 1), 0, rand(4, 8), 0, 0x8dff2a, 0.9, 0.7, 0.4, 0);
        }));
        if (y.delay) later(0.45, () => delayEnemies(y.delay));
        C.sfx.shield();
        C.sfx.life();
        return 0.95;
      }
      case 'recharge': {
        healTeam(st.teamMax * y.heal * (1 + (h.mods.healPower || 0)), h);
        pillar(h.x, h.z, 0xfff3a0, 1.5, 1, 12, 0.55);
        hyperPop('HEAL ' + Math.round(y.heal * 100) + '%  ·  HYPER +' + y.n + ' FOR ALL', h.x, h.z - 2.6);
        st.heroes.forEach((o, i) => {
          if (o === h) return;
          later(0.2 + i * 0.12, () => {
            beamLine(h.x, h.z, o.x, o.z, 0xfff3a0, 0.6, 0.45);
            pillar(o.x, o.z, 0xfff3a0, 1, 0.6, 7, 0.5);
            o.charge = Math.max(0, o.charge - y.n);
            o.hop = 1;
            C.popup('HYPER +' + y.n, o.x, o.z - 1.6, 'lvl');
            st.hudDirty = true;
          });
        });
        C.sfx.life();
        return 1;
      }
      case 'laserStorm': {
        const others = st.heroes.filter((o) => o !== h);
        hyperPop('ALL COMBOS ×' + mul(pw), h.x, h.z - 2.6);
        others.forEach((o, i) => later(0.15 + i * 0.3, () => {
          beamLine(h.x, h.z, o.x, o.z, col, 0.7, 0.4);
          pillar(o.x, o.z, o.def.look.glow, 0.9, 0.4, 7, 0.5);
          o.hop = 1;
          triggerCombo(o, pw);
        }));
        return 0.3 + others.length * 0.3 + 0.4;
      }
      case 'blackhole': {
        const cx = 0, cz = -5;   // middle of the enemy field, in front of the boss
        blackHole(cx, cz, 1.05);
        hyperPop('EVENT HORIZON', cx, cz - 4);
        screenFlash(0x3a0060, 1.4);
        // drag every enemy toward the core — as far as it can go without landing on a hero or another enemy
        const spots = [];
        enemies.forEach((e) => {
          e.wobble = 1;
          for (const k of [0.45, 0.3, 0.15, 0]) {
            const x = lerp(e.x, cx, k), z = lerp(e.z, cz, k);
            const free = st.heroes.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + e.r + 0.3) &&
              spots.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + e.r + 0.2);
            if (free || k === 0) { e.tx = x; e.tz = z; spots.push({ x, z, r: e.r }); break; }
          }
        });
        later(0.95, () => {
          explosion(cx, cz, col, 3.2);
          screenFlash(0xffffff, 0.35);
          C.addShake(1.1);
          aliveEnemies().forEach((e) => { damageEnemy(e, dmg, h, 'hyper'); C.lightning(cx, cz, e.x, e.z, col); });
          if (y.delay) delayEnemies(y.delay);
        });
        return 1.45;
      }
      case 'freeze': {
        hyperPop('MOSH PIT  ·  +' + y.delay + ' TURNS', h.x, h.z - 2.6);
        screenFlash(col, 0.6);
        for (let i = 0; i < 4; i++) later(i * 0.14, () => { C.spawnRing(h.x, h.z, i % 2 ? 0xffffff : col, 14 + i * 7, 0.75); C.addShake(0.3); });
        later(0.4, () => {
          aliveEnemies().forEach((e) => damageEnemy(e, dmg, h, 'hyper'));
          delayEnemies(y.delay);
        });
        C.sfx.nova();
        return 1;
      }
      // AEGIS-7: a hex wall that halves the damage and reflects it for a few enemy turns
      case 'shieldWall':
        healTeam(st.teamMax * y.heal * healK(h), h);
        st.wall = { turns: y.turns, shield: y.shield, reflect: y.reflect };
        st.shield = Math.max(st.shield, y.shield);
        hyperPop('PHALANX  ·  SHIELD ' + Math.round(y.shield * 100) + '%  ·  REFLECT ' + Math.round(y.reflect * 100) + '%  ·  ' + y.turns + ' TURNS', h.x, h.z - 2.6);
        screenFlash(0x9ff4ff, 0.5);
        st.heroes.forEach((o, i) => later(i * 0.1, () => {
          o.domePop = 1;
          o.hop = 1;
          pillar(o.x, o.z, 0x9ff4ff, 1.6, 0.8, 5, 0.5);
          for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; afterimage(o.x + Math.cos(a) * 2, 1.2, o.z + Math.sin(a) * 2, col, 1.8); }
        }));
        C.sfx.shield();
        return 0.9;
      // LUX LANCER: pierces everything and leaves a trail of sunfire that erupts at the end
      case 'solarFlare':
        T.pierce = true; T.dmgMul = pw; T.aura = 0xffd23a; T.after = 0xff9a1f; T.drill = true;
        T.trail = { pts: [], d: 0, burn: (y.burn || 1) * hyperK(h), heal: 0, rainbow: false };
        hyperPop('SOLAR FLARE  ·  ×' + mul(pw) + '  ·  SUNFIRE TRAIL', h.x, h.z - 2.6);
        pillar(h.x, h.z, 0xffd23a, 1.4, 0.7, 20, 0.6);
        for (let i = 0; i < 3; i++) later(i * 0.08, () => C.spawnRing(h.x, h.z, i % 2 ? 0xffffff : 0xffd23a, 3 + i * 2, 0.4));
        C.sfx.charge();
        return 0.45;
      // HALCYON: a big heal now and more at the start of the next turns
      case 'sanctuary': {
        const k = healK(h);
        healTeam(st.teamMax * y.heal * k, h);
        st.hot.push({ k: y.regen * k, turns: y.turns, src: h });
        hyperPop('HEAL ' + Math.round(y.heal * k * 100) + '%  ·  +' + Math.round(y.regen * k * 100) + '% FOR ' + y.turns + ' TURNS', h.x, h.z - 2.6);
        const cx = st.heroes.reduce((s, o) => s + o.x, 0) / st.heroes.length, cz = st.heroes.reduce((s, o) => s + o.z, 0) / st.heroes.length;
        for (let i = 0; i < 3; i++) later(i * 0.15, () => C.spawnRing(cx, cz, i % 2 ? 0xfff3a0 : 0x8dff2a, 10 + i * 5, 0.9));
        st.heroes.forEach((o, i) => later(0.1 + i * 0.1, () => { pillar(o.x, o.z, 0xb8ff7a, 1.3, 1, 16, 0.55); o.domePop = 1; sparkleUp(o.x, o.z, 0x8dff2a, 14); }));
        C.sfx.life();
        return 0.95;
      }
      // SCRAPJAW: three saws orbit the ball and shred everything they touch
      case 'scrapStorm': {
        T.dmgMul = pw; T.speedMul = y.speed || 1; T.aura = 0xffc933; T.after = col;
        const list = [0, 1, 2].map(() => {
          const s = sawMesh(0xdde2ee, 0.75);
          s.add(M.glow(col, 2.2, 0.55));
          s.position.set(h.x, 0.9, h.z);
          scene.add(s);
          return s;
        });
        T.saws = { list, pw: h.atk * (y.saw || 0.5) * hyperK(h), hit: new Map() };
        hyperPop('SCRAP STORM  ·  ×' + mul(pw) + '  ·  3 SAWS', h.x, h.z - 2.6);
        C.sfx.charge();
        return 0.45;
      }
      // SPORE: heals and grows toxic mushrooms that burst at the enemy turn
      case 'sporeBloom': {
        healTeam(st.teamMax * y.heal * healK(h), h);
        const list = enemies.slice().sort(() => Math.random() - 0.5).slice(0, y.n);
        hyperPop('OVERGROWTH  ·  ' + list.length + ' TOXIC MUSHROOMS', h.x, h.z - 2.6);
        list.forEach((e, i) => later(i * 0.1, () => shoot(h, e, 0x8dff2a, () => {
          if (!e.alive) return;
          const mesh = mushroomMesh(e.r);
          e.root.add(mesh);
          st.mushrooms.push({ e, mesh, dmg, src: h, k: 0 });
          C.burst(e.x, 1.5, e.z, 0x8dff2a, 14, 5, 0.5, 0.8, 1);
        }, { speed: 30, size: 1.6 })));
        st.heroes.forEach((o) => sparkleUp(o.x, o.z, 0x8dff2a, 10));
        C.sfx.life();
        return 0.5 + list.length * 0.1;
      }
      // VIPER.EXE: poisons everything, then splits
      case 'neurotoxin': {
        const amt = h.atk * y.poison * hyperK(h);
        for (let i = 0; i < 3; i++) later(i * 0.12, () => C.spawnRing(h.x, h.z, 0x8dff2a, 10 + i * 8, 0.7));
        later(0.3, () => aliveEnemies().forEach((e) => {
          poisonEnemy(e, amt, h);
          C.burst(e.x, 1.2, e.z, 0x8dff2a, 16, 4, 0.7, 1, 2);
          C.popup('POISONED', e.x, e.z - e.r - 0.6, 'tox');
        }));
        T.clones = y.n;
        hyperPop('NEUROTOXIN  ·  ALL POISONED  ·  SPLIT ×' + (y.n + 1), h.x, h.z - 2.6);
        screenFlash(0x3dff7a, 0.5);
        C.sfx.split();
        return 0.7;
      }
      // MOSSBACK: heal + shield, roots burst out under every enemy
      case 'rootCage':
        healTeam(st.teamMax * y.heal * healK(h), h);
        st.shield = Math.max(st.shield, y.shield);
        st.heroes.forEach((o) => { o.domePop = 1; });
        hyperPop('BARKSKIN  ·  SHIELD ' + Math.round(st.shield * 100) + '%  ·  ALL ROOTED', h.x, h.z - 2.6);
        enemies.forEach((e, i) => later(0.2 + i * 0.1, () => {
          if (!e.alive) return;
          rootsAt(e.x, e.z, e.r, 0x3dff7a);
          damageEnemy(e, dmg, h, 'hyper');
          stun(e, y.delay || 1, 'ROOTED');
        }));
        C.sfx.shield();
        return 0.5 + enemies.length * 0.1;
      // THORNLASH: every hit ties the enemy up; they are crushed when the ball stops
      case 'strangleroot':
        T.pierce = true; T.dmgMul = pw; T.aura = 0x3dff7a; T.after = col;
        T.tether = { list: new Set(), pw: h.atk * (y.tether || 1) * hyperK(h) };
        hyperPop('STRANGLEROOT  ·  EVERY HIT GETS TIED UP', h.x, h.z - 2.6);
        rootsAt(h.x, h.z, h.r, 0x3dff7a);
        C.sfx.charge();
        return 0.5;
      // HEXWRAITH: curses every enemy for the rest of the battle, then a draining sling
      case 'curseNova':
        for (let i = 0; i < 3; i++) later(i * 0.1, () => C.spawnRing(h.x, h.z, 0xb84dff, 12 + i * 8, 0.7));
        later(0.25, () => aliveEnemies().forEach((e) => {
          e.curse = Math.max(e.curse || 0, y.curse);
          pillar(e.x, e.z, 0xb84dff, e.r * 0.7, 0.6, 10, 0.6);
          C.popup('CURSED', e.x, e.z - e.r - 0.6, 'pu');
        }));
        T.dmgMul = pw; T.drain = y.drain; T.aura = 0xb84dff; T.after = 0xb84dff;
        hyperPop('SOUL SIPHON  ·  CURSE +' + Math.round(y.curse * 100) + '%  ·  ×' + mul(pw), h.x, h.z - 2.6);
        screenFlash(0x3a0060, 0.6);
        C.sfx.charge();
        return 0.75;
      // NULLBLADE: vanishes, teleports through a chain of enemies, reappears for a double-damage sling
      case 'blinkStrike': {
        const list = [];
        let from = h;
        for (let i = 0; i < y.n; i++) {
          const t = nearestTo(from, enemies.filter((e) => !list.includes(e)));
          if (!t) break;
          list.push(t);
          from = t;
        }
        hyperPop('BLINK STRIKE ×' + list.length + '  ·  THEN DOUBLE DAMAGE', h.x, h.z - 2.6);
        afterimage(h.x, HERO_R, h.z, col, 3);
        h.root.visible = false;
        let px = h.x, pz = h.z;
        list.forEach((e, i) => {
          const fx = px, fz = pz;
          later(0.1 + i * 0.13, () => {
            const a = Math.atan2(e.z - fz, e.x - fx);
            segment(fx, 1, fz, e.x, 1, e.z, col, 0.12, 0.25);
            afterimage(e.x + Math.cos(a) * (e.r + 1), HERO_R, e.z + Math.sin(a) * (e.r + 1), col, 3);
            slash(e.x, e.z, e.r + 1.8, a + Math.PI / 2, col);
            damageEnemy(e, dmg, h, 'hyper');
            C.addShake(0.2);
            sound('pierce');
          });
          px = e.x;
          pz = e.z;
        });
        const back = 0.2 + list.length * 0.13;
        later(back, () => { h.root.visible = true; afterimage(h.x, HERO_R, h.z, 0xffffff, 3.4); C.spawnRing(h.x, h.z, col, 3, 0.3); });
        T.dmgMul = 2; T.after = col; T.aura = col;
        return back + 0.25;
      }
      // GLITCHWIDOW: webs wrap several enemies (+2 turns), then it splits
      case 'webTrap': {
        const list = enemies.slice().sort(() => Math.random() - 0.5).slice(0, y.webs);
        hyperPop('WEB TRAP ×' + list.length + '  ·  SPLIT ×' + (y.n + 1), h.x, h.z - 2.6);
        list.forEach((e, i) => later(i * 0.1, () => shoot(h, e, 0xffffff, () => {
          if (!e.alive) return;
          if (!e.web) { e.web = { mesh: cocoonMesh(e.r), t: 2 }; e.root.add(e.web.mesh); } else e.web.t = 2;
          stun(e, 2, 'WEBBED');
          C.burst(e.x, 1, e.z, 0xffffff, 16, 6, 0.4, 0.7);
        }, { speed: 34, size: 1.6 })));
        T.clones = y.n;
        C.sfx.split();
        return 0.45 + list.length * 0.1;
      }
      // REAPER.SYS: harvests every weakened enemy, then a draining sling
      case 'reap': {
        const list = enemies.filter((e) => !e.boss && e.hp < e.maxHp * y.exec);
        hyperPop(list.length ? 'HARVEST ×' + list.length + '  ·  ×' + mul(pw) : 'HARVEST  ·  ×' + mul(pw), h.x, h.z - 2.6);
        screenFlash(0x2a0040, 0.7);
        list.forEach((e, i) => later(0.15 + i * 0.12, () => {
          if (!e.alive) return;
          slash(e.x, e.z, e.r + 1.8, Math.PI / 4, 0xa64dff);
          slash(e.x, e.z, e.r + 1.8, -Math.PI / 4, 0xa64dff);
          C.popup('HARVESTED', e.x, e.z - e.r - 0.6, 'hyper');
          damageEnemy(e, e.hp, h, 'hot');
          shoot(e, h, 0xb84dff, null, { speed: 30, size: 1 });   // the soul flies home
        }));
        T.dmgMul = pw; T.drain = y.drain; T.aura = 0xa64dff; T.after = 0x6a2aa0;
        return 0.35 + list.length * 0.12;
      }
      // VALKYRIE: soars out of the arena and dives onto the strongest enemy
      case 'ragnarok': {
        const t = enemies.slice().sort((a, b) => b.hp - a.hp)[0];
        if (!t) return 0.3;
        hyperPop('RAGNARÖK DIVE', h.x, h.z - 2.6);
        h.soarT = h.soarDur = 1.5;
        reticle(t.x, t.z, t.r * 1.8, 0xfff3a0, 0.9);
        pillar(t.x, t.z, 0xfff3a0, 0.3, 0.9, 34, 0.5);
        later(0.45, () => shoot({ x: t.x + 3, z: t.z - 8 }, t, 0xfff3a0, () => {
          explosion(t.x, t.z, 0xfff3a0, 3);
          pillar(t.x, t.z, col, t.r * 1.3, 0.8, 34, 0.8);
          screenFlash(0xffffff, 0.4);
          C.addShake(1);
          C.spawnRing(t.x, t.z, 0xfff3a0, y.r * 2, 0.6);
          damageEnemy(t, dmg, h, 'hyper');
          aliveEnemies().forEach((o) => { if (o !== t && Math.hypot(o.x - t.x, o.z - t.z) < y.r + o.r) damageEnemy(o, h.atk * y.splash * hyperK(h), h, 'hyper'); });
        }, { fromY: 30, drop: true, speed: 75, size: 5, core: 3, trailEvery: 0.005, trailSize: 1.8 }));
        return 1.6;
      }
      // DREADCORE: triple damage and everything it destroys explodes
      case 'apocalypse':
        T.dmgMul = pw; T.speedMul = y.speed || 1; T.aura = 0xff3a1a; T.after = 0xff5a1f;
        T.boom = h.atk * (y.boom || 1) * hyperK(h);
        hyperPop('APOCALYPSE  ·  ×' + mul(pw) + '  ·  KILLS EXPLODE', h.x, h.z - 2.6);
        explosion(h.x, h.z, 0xff3a1a, 1.4);
        screenFlash(0xff2a1a, 0.6);
        return 0.45;
      // LEVIATHAN: a giant wave rolls over the whole arena
      case 'tidalWave': {
        hyperPop('TIDAL WAVE', 0, 2);
        screenFlash(0x19c6ff, 0.6);
        const N = 14, hit = new Set();
        for (let i = 0; i < N; i++) {
          later(i * 0.06, () => {
            const z = lerp(ZB, ZT, i / (N - 1));
            beamLine(-XW, z, XW, z, i % 2 ? 0x19c6ff : 0x9ff4ff, 2.6, 0.4);
            for (let k = 0; k < 10; k++) C.emit(rand(-XW, XW), 0.5, z, rand(-1, 1), rand(5, 10), -rand(4, 9), pick([0x19c6ff, 0x9ff4ff, 0xffffff]), rand(0.8, 1.4), 0.5, 0.5, -12);
            C.addShake(0.12);
            aliveEnemies().forEach((e) => {
              if (hit.has(e) || z > e.z + e.r) return;
              hit.add(e);
              damageEnemy(e, dmg, h, 'hyper');
              if (!e.boss) e.tz = Math.max(ZT + e.r + 0.5, e.tz - 2.5);
              C.burst(e.x, 1, e.z, 0x9ff4ff, 16, 7, 0.4, 0.8, 1);
            });
          });
        }
        later(N * 0.06 + 0.1, () => delayEnemies(y.delay || 1));
        C.sfx.nova();
        return N * 0.06 + 0.45;
      }
      // UNICORE: a rainbow comet; its rainbow road heals the team and burns the enemies on it
      case 'rainbowDash':
        T.pierce = true; T.dmgMul = pw; T.speedMul = y.speed || 1; T.aura = 0xff9af5; T.after = 0xff9af5; T.rainbow = true;
        T.trail = { pts: [], d: 0, burn: (y.burn || 1) * hyperK(h), heal: (y.heal || 0) * healK(h), rainbow: true };
        hyperPop('RAINBOW DASH  ·  ×' + mul(pw), h.x, h.z - 2.6);
        RAINBOW.forEach((c, i) => later(i * 0.04, () => C.spawnRing(h.x, h.z, c, 2 + i * 0.9, 0.4)));
        C.sfx.charge();
        return 0.5;
      default:
        return 0.3;
    }
  }

  // ---------------------------------------------------------- end of move
  // what an empowered sling leaves behind plays out once the ball has stopped;
  // returns how long that takes
  function moveAftermath(T) {
    let wait = 0;
    if (T.saws) {
      T.saws.list.forEach((s) => { scene.remove(s); C.burst(s.position.x, 0.8, s.position.z, 0xffc933, 10, 6, 0.3, 0.5); });
      T.saws = null;
    }
    const h = T.h;
    // SOLAR FLARE / RAINBOW DASH: the trail erupts from start to end
    if (T.trail && T.trail.pts.length) {
      const tr = T.trail, pts = tr.pts, step = Math.min(0.02, 1.1 / pts.length);
      hyperPop(tr.rainbow ? 'RAINBOW ROAD' : 'SUNFIRE ERUPTS', h.x, h.z - 2.4);
      pts.forEach((p, i) => later(i * step, () => {
        const col = tr.rainbow ? RAINBOW[i % RAINBOW.length] : pick([0xff5a1f, 0xffd23a, 0xff9a1f]);
        for (let k = 0; k < 3; k++) C.emit(p.x + rand(-0.4, 0.4), 0.3, p.z + rand(-0.4, 0.4), rand(-1, 1), rand(6, 12), rand(-1, 1), col, rand(0.9, 1.5), rand(0.4, 0.7), 0.5, 0);
        if (i % 5 === 0) C.spawnRing(p.x, p.z, col, 2.2, 0.35);
        if (i % 12 === 0) C.addShake(0.08);
      }));
      aliveEnemies().forEach((e) => {
        const i = pts.findIndex((p) => Math.hypot(p.x - e.x, p.z - e.z) < e.r + 1.4);
        if (i < 0) return;
        later(i * step, () => {
          if (!e.alive) return;
          pillar(e.x, e.z, tr.rainbow ? RAINBOW[i % RAINBOW.length] : 0xff9a1f, e.r * 0.9, 0.6, 12, 0.7);
          damageEnemy(e, h.atk * tr.burn, h, 'hot');
        });
      });
      if (tr.heal) {
        later(pts.length * step, () => {
          healTeam(st.teamMax * tr.heal, h);
          st.heroes.forEach((o) => { o.domePop = 1; sparkleUp(o.x, o.z, pick(RAINBOW), 10); });
          C.sfx.life();
        });
      }
      C.sfx.nova();
      wait = Math.max(wait, pts.length * step + 0.4);
    }
    // STRANGLEROOT: every tied-up enemy is crushed
    if (T.tether && T.tether.list.size) {
      let i = 0;
      T.tether.list.forEach((e) => {
        later(0.1 + i++ * 0.12, () => {
          if (e.tie) { e.root.remove(e.tie); e.tie = null; }
          if (!e.alive) return;
          rootsAt(e.x, e.z, e.r, 0x3dff7a);
          damageEnemy(e, T.tether.pw, h, 'hot');
          stun(e, 1, 'CRUSHED');
          C.addShake(0.2);
        });
      });
      wait = Math.max(wait, 0.1 + i * 0.12 + 0.35);
    }
    return wait;
  }

  function endMove() {
    // the update loop calls endMove again once the aftermath's timers have run out
    const T = st.T;
    if (T && !T.resolved) {
      T.resolved = true;
      const wait = moveAftermath(T);
      if (wait > 0) { later(wait, () => {}); return; }
    }
    st.movers.forEach((m) => { if (m.clone) scene.remove(m.root); });
    st.movers = [];
    // heroes never end up stacked on top of each other
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < st.heroes.length; i++) {
        for (let j = i + 1; j < st.heroes.length; j++) {
          const a = st.heroes[i], b = st.heroes[j];
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01, min = a.r + b.r + 0.1;
          if (d < min) {
            const p = (min - d) / 2;
            a.x -= (dx / d) * p; a.z -= (dz / d) * p;
            b.x += (dx / d) * p; b.z += (dz / d) * p;
          }
        }
      }
    }
    st.heroes.forEach((o) => { o.x = clamp(o.x, -XW + o.r, XW - o.r); o.z = clamp(o.z, ZT + o.r, ZB - o.r); });
    if (!aliveEnemies().length) waveCleared();
    else enemyPhase();
  }

  function waveCleared() {
    if (st.wave >= st.plan.waves.length - 1) { finish(true); return; }
    st.phase = 'wave';
    C.sfx.clear();
    C.popup('WAVE CLEAR', 0, -4, 'lvl');
    later(0.5, () => startWave(st.wave + 1, true));
  }

  // --------------------------------------------------------- enemy phase
  function enemyPhase() {
    st.phase = 'enemy';
    st.phaseT = 0;
    // OVERGROWTH: the toxic mushrooms burst first
    st.mushrooms.forEach((m) => {
      m.e.root.remove(m.mesh);
      if (!m.e.alive) return;
      explosion(m.e.x, m.e.z, 0x8dff2a, 1.3);
      C.burst(m.e.x, 1.5, m.e.z, 0xff3cf2, 12, 6, 0.5, 0.8, 2);
      C.popup('SPORE BURST', m.e.x, m.e.z - m.e.r - 1, 'tox');
      damageEnemy(m.e, m.dmg, m.src, 'tox');
    });
    st.mushrooms = [];
    // WEB TRAP: the cocoons fall off after two enemy turns
    st.enemies.forEach((e) => { if (e.web && --e.web.t <= 0) { e.root.remove(e.web.mesh); e.web = null; } });
    // VENOM GLAND: poison eats into every poisoned enemy first
    aliveEnemies().forEach((e) => {
      if (!e.poisonT) return;
      e.poisonT--;
      C.burst(e.x, 1.2, e.z, 0x8dff2a, 14, 4, 0.6, 0.7, 2);
      C.spawnRing(e.x, e.z, 0x8dff2a, e.r * 1.7, 0.4);
      damageEnemy(e, e.poison, e.poisonSrc, 'tox');
      if (!e.poisonT) e.poison = 0;
    });
    if (!aliveEnemies().length) { later(0.45, waveCleared); return; }
    const attackers = [];
    aliveEnemies().forEach((e) => { e.cd -= 1; if (e.cd <= 0) attackers.push(e); });
    let t = 0.15;
    attackers.forEach((e) => {
      later(t, () => { e.windup = 1; });   // swells up before it strikes
      later(t + 0.22, () => { enemyAttack(e); e.cd = e.cdMax; st.hudDirty = true; });
      t += 0.42;
    });
    later(attackers.length ? t + 0.15 : 0.05, () => {
      // shields last one enemy turn — PHALANX holds for several
      if (st.wall && --st.wall.turns > 0) st.shield = st.wall.shield;
      else { st.wall = null; st.shield = 0; }
      st.hudDirty = true;
      if (st.teamHp <= 0) finish(false);
      else nextTurn();
    });
    st.hudDirty = true;
  }

  function enemyAttack(e) {
    if (!e.alive || !st.active || st.teamHp <= 0) return;
    const heroes = st.heroes;
    const col = e.boss ? 0xff2a4d : e.color;
    const near = nearestTo(e, heroes);
    const lungeTo = (h) => {
      const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz) || 1;
      e.lunge = 1;
      e.lx = dx / d;
      e.lz = dz / d;
    };
    switch (e.attack) {
      case 'bite':
        lungeTo(near);
        beamLine(e.x, e.z, near.x, near.z, 0xff2a4d, 0.3, 0.25);
        hurtTeam(e.atk * 1.4, near, e);
        C.sfx.drone();
        break;
      case 'dash':
        lungeTo(near);
        C.burst(near.x, 1, near.z, col, 16, 7, 0.3, 0.6);
        hurtTeam(e.atk * 1.8, near, e);
        break;
      case 'snipe': {
        const h = pick(heroes);
        beamLine(e.x, e.z, h.x, h.z, 0xff2a4d, 0.45, 0.4);
        hurtTeam(e.atk * 2, h, e);
        C.sfx.laser();
        break;
      }
      case 'barrage':
        for (let i = 0; i < 3; i++) {
          const h = pick(heroes);
          later(i * 0.1, () => shoot(e, h, col, () => hurtTeam(e.atk * 0.8, h, e), { speed: 24, size: 1.8 }));
        }
        C.sfx.bolt();
        break;
      case 'shock': {
        C.spawnRing(e.x, e.z, 0xff2a4d, 8, 0.6);
        C.addShake(0.4);
        const hit = heroes.filter((h) => Math.hypot(h.x - e.x, h.z - e.z) < 8 + h.r);
        (hit.length ? hit : [near]).forEach((h) => hurtTeam(e.atk * (hit.length ? 1.5 : 0.8), h, e));
        C.sfx.stun();
        break;
      }
      case 'mend': {
        aliveEnemies().forEach((o) => {
          const add = Math.round(o.maxHp * 0.12);
          o.hp = Math.min(o.maxHp, o.hp + add);
          C.popup('+' + add, o.x, o.z - o.r, 'tox');
          C.spawnRing(o.x, o.z, 0x8dff2a, o.r * 1.8, 0.4);
        });
        const h = pick(heroes);
        beamLine(e.x, e.z, h.x, h.z, col, 0.3, 0.3);
        hurtTeam(e.atk * 0.9, h, e);
        break;
      }
      case 'boss': {
        e.bossMove = (e.bossMove + 1) % 2;
        if (e.bossMove === 1) {
          // mega laser through a hero, all the way to the wall
          const h = pick(heroes);
          const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
          const L = exitDist(e.x, e.z, ux, uz);
          beamLine(e.x, e.z, e.x + ux * L, e.z + uz * L, 0xff2a4d, 2.2, 0.6);
          heroes.forEach((o) => {
            if (Math.abs((o.x - e.x) * uz - (o.z - e.z) * ux) < 1.6 + o.r && (o.x - e.x) * ux + (o.z - e.z) * uz > 0) hurtTeam(e.atk * 2.4, o, e);
          });
          C.popup('MEGA LASER', e.x, e.z - e.r - 1, 'big');
          C.sfx.laser();
        } else {
          C.spawnRing(e.x, e.z, 0xff2a4d, 26, 0.9);
          C.addShake(0.9);
          C.popup('SYSTEM QUAKE', e.x, e.z - e.r - 1, 'big');
          heroes.forEach((o) => hurtTeam(e.atk * 1.2, o, e));
          C.sfx.explode();
        }
        break;
      }
      default: break;
    }
  }

  // ----------------------------------------------------------------- end
  function finish(win) {
    if (st.phase === 'end') return;
    st.phase = 'end';
    st.phaseT = 0;
    hideAim();
    if (win) {
      C.showBanner('SECTOR ' + st.label, 'VICTORY', 'THE BOSS HAS BEEN DELETED');
      C.sfx.clear();
      st.heroes.forEach((h, i) => later(i * 0.12, () => { h.hop = 1; }));
      for (let i = 0; i < 6; i++) later(i * 0.15, () => C.burst(rand(-10, 10), 1, rand(-16, 6), pick([0xffc933, 0x19e6ff, 0xff3cf2]), 30, 9, 0.8, 1, 2));
    } else {
      C.showBanner('SECTOR ' + st.label, 'DEFEAT', 'YOUR TEAM WAS DELETED', true);
      C.sfx.lose();
      C.glitch(1);
    }
    st.result = {
      win, stage: st.stage, wave: st.wave + 1, turns: st.turn, coins: st.coins,
      heroes: st.heroes.map((h) => ({ id: h.id, dealt: Math.round(h.dealt), healed: Math.round(h.healed) })),
    };
    later(2 * st.speed, () => {   // the result banner stays readable at any battle speed
      const res = st.result;
      if (C.exitMode) C.exitMode();
      if (NEON.rpg) NEON.rpg.battleDone(res);
    });
  }

  // ---------------------------------------------------------------- aim
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitV = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  function pointerFloor() {
    const p = C.pointer();
    if (!p) return null;
    ndc.set(p.x, p.y);
    ray.setFromCamera(ndc, C.refCam);
    return ray.ray.intersectPlane(floorPlane, hitV) ? hitV : null;
  }

  // Predicts the sling path the way the physics will play it out:
  // BOUNCE rebounds off the first enemy in the way, PIERCE runs straight through.
  function tracePath(x, z, dx, dz, len, r, pierce) {
    const pts = [[x, z]], hits = [];
    let left = len;
    for (let b = 0; b < 7 && left > 0.01; b++) {
      const tw = exitDistR(x, z, dx, dz, r);
      let te = Infinity, hitE = null;
      for (const e of aliveEnemies()) {
        const fx = e.x - x, fz = e.z - z, proj = fx * dx + fz * dz;
        const perp = Math.abs(fx * dz - fz * dx), R = e.r + r;
        if (perp >= R) continue;
        const t0 = proj - Math.sqrt(R * R - perp * perp);
        if (t0 < 0.02 || t0 > Math.min(tw, left)) continue;
        if (pierce) { if (!hits.includes(e)) hits.push(e); }
        else if (t0 < te) { te = t0; hitE = e; }
      }
      const t = Math.min(pierce ? tw : Math.min(tw, te), left);
      x += dx * t;
      z += dz * t;
      pts.push([x, z]);
      left -= t;
      if (left <= 0.01) break;
      if (!pierce && hitE && te <= tw) {
        const nx = x - hitE.x, nz = z - hitE.z, nl = Math.hypot(nx, nz) || 1, ux = nx / nl, uz = nz / nl;
        const dot = dx * ux + dz * uz;
        dx -= 2 * dot * ux;
        dz -= 2 * dot * uz;
        x += ux * 0.02;
        z += uz * 0.02;
        if (!hits.includes(hitE)) hits.push(hitE);
      } else if (Math.abs(Math.abs(x) - (XW - r)) < 1e-3) dx = -dx;
      else dz = -dz;
    }
    return { pts, hits };
  }

  function showAim(h, dx, dz, power) {
    const len = 10 + power * 40;
    const { pts, hits } = tracePath(h.x, h.z, dx, dz, len, h.r, h.pierce);
    aimMat.color.setHex(h.ty.col);
    const spacing = 0.85;
    let di = 0, offset = (st.t * 3) % spacing, travelled = 0;
    for (let i = 1; i < pts.length && di < aimDots.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const l = Math.hypot(x1 - x0, z1 - z0);
      for (let s = offset; s < l && di < aimDots.length; s += spacing) {
        const k = s / l, d = aimDots[di++];
        const fade = 1 - (travelled + s) / len;
        d.visible = true;
        d.position.set(lerp(x0, x1, k), 0.5, lerp(z0, z1, k));
        const sc = 0.5 + 0.7 * fade;
        d.scale.set(sc, sc, 1);
      }
      offset = (offset - l) % spacing;
      if (offset < 0) offset += spacing;
      travelled += l;
    }
    for (; di < aimDots.length; di++) aimDots[di].visible = false;
    markers.forEach((m, i) => {
      const e = hits[i];
      m.visible = !!e;
      if (!e) return;
      m.position.set(e.x, 0.1, e.z);
      m.scale.setScalar(e.r * 1.35 + Math.sin(st.t * 8 + i) * 0.1);
      m.material.color.setHex(h.ty.col);
    });
    // the rubber band points backwards, stretching with the pull
    const bl = 0.6 + power * 4.5;
    band.visible = true;
    band.position.set(h.x - dx * bl / 2, 1, h.z - dz * bl / 2);
    band.rotation.set(0, -Math.atan2(dz, dx), 0);
    band.scale.set(bl, 1, 0.6 + power * 0.8);
    band.material.color.setHex(power > 0.9 ? 0xffc933 : 0xffffff);
  }

  function hideAim() {
    for (const d of aimDots) d.visible = false;
    for (const m of markers) m.visible = false;
    if (band) band.visible = false;
  }

  // pull-back vector from where the drag started to the pointer now
  function readDrag() {
    const p = pointerFloor();
    if (!p) return;
    const dx = st.aim.sx - p.x, dz = st.aim.sz - p.z, len = Math.hypot(dx, dz);
    if (len > 0.25) { st.aim.dx = dx / len; st.aim.dz = dz / len; }
    st.aim.power = clamp(len / 11, 0, 1);
  }

  function updateAim() {
    const h = curHero();
    if (st.aim.on) {
      readDrag();
      if (st.aim.power > 0.05) showAim(h, st.aim.dx, st.aim.dz, st.aim.power);
      else hideAim();
    } else if (st.keyAim) {
      showAim(h, Math.cos(st.kAim), Math.sin(st.kAim), 1);
    } else {
      hideAim();
    }
  }

  function botThink() {
    if (st.phaseT < 0.5) return;
    const h = curHero();
    const t = pick(aliveEnemies());
    if (!t) return;
    const a = Math.atan2(t.z - h.z, t.x - h.x) + rand(-0.12, 0.12);
    if (h.charge <= 0) st.hyperArmed = true;
    launch(Math.cos(a), Math.sin(a), 0.9);
  }

  // ---------------------------------------------------------------- HUD
  function setSpeed(s) {
    st.speed = clamp(s, 1, 3);
    C.store.set(SPEED_KEY, String(st.speed));
    document.querySelectorAll('#mb-speed button').forEach((b) => b.classList.toggle('on', +b.dataset.s === st.speed));
    st.hudDirty = true;
  }

  function buildHud() {
    const wrap = $('mb-team');
    wrap.innerHTML = '';
    st.heroes.forEach((h, i) => {
      const f = FACTIONS[h.def.faction];
      const el = document.createElement('button');
      el.className = 'mbh ' + (h.pierce ? 'pierce' : 'bounce');
      el.style.setProperty('--hc', css(h.def.look.glow));
      el.style.setProperty('--fc', css(f.color));
      el.innerHTML = `<img alt="" src="${NEON.rpg.thumb(h.id)}"><span class="mbh-n">${i + 1}</span>` +
        `<span class="mbh-type">${h.ty.icon} ${h.ty.name}</span><span class="mbh-spd">SPD ${h.spd}</span>` +
        `<span class="mbh-name">${h.def.name}</span><span class="mbh-hy"></span>`;
      const extra = h.def.skills.concat(h.relic ? [h.def.relic] : []).filter((sk) => h.lvl >= sk.lvl).map((sk) => sk.name).join(', ');
      el.title = `${h.def.name} — ${h.ty.name} (SPD ${h.spd}): ${h.ty.text}. COMBO: ${h.def.combo.name}. HYPER: ${h.def.hyper.name}.` + (extra ? ' ABILITIES: ' + extra + '.' : '');
      el.addEventListener('click', () => { if (h === curHero()) toggleHyper(); });
      wrap.appendChild(el);
      h.card = el;
    });
    $('mb-stage').textContent = 'SECTOR ' + st.label;
    setSpeed(st.speed);
  }

  function renderHud() {
    st.hudDirty = false;
    $('mb-wave').textContent = 'WAVE ' + (st.wave + 1) + ' / ' + st.plan.waves.length;
    $('mb-turn').textContent = st.turn;
    $('mb-hp-fill').style.width = (100 * st.teamHp / st.teamMax).toFixed(1) + '%';
    $('mb-hp-text').textContent = Math.ceil(st.teamHp).toLocaleString('en-US') + ' / ' + st.teamMax.toLocaleString('en-US');
    $('mb-hpbar').classList.toggle('low', st.teamHp < st.teamMax * 0.3);
    $('mb-shield').textContent = st.shield > 0 ? 'SHIELD ' + Math.round(st.shield * 100) + '%' : '';
    const cur = curHero();
    st.heroes.forEach((h) => {
      h.card.classList.toggle('active', h === cur && (st.phase === 'aim' || st.phase === 'move' || st.phase === 'hyper'));
      h.card.classList.toggle('ready', h.charge <= 0);
      h.card.classList.toggle('armed', h === cur && st.hyperArmed);
      h.card.querySelector('.mbh-hy').textContent = h.charge <= 0 ? (h === cur && st.hyperArmed ? 'ARMED!' : 'HYPER READY') : 'HYPER ' + h.charge;
    });
    const boss = st.enemies.find((e) => e.boss);
    if (boss) $('mb-boss-fill').style.width = (100 * Math.max(0, boss.hp) / boss.maxHp).toFixed(1) + '%';
    const h = cur;
    let hint = `<b>${h.def.name}</b> · <span class="ty" style="color:${h.ty.css}">${h.ty.icon} ${h.ty.name} · SPD ${h.spd}</span> — ${h.ty.text} · DRAG BACK &amp; RELEASE`;
    // touch screens (js/mobil.js sets body.touch) arm HYPER by tapping the hero card
    const hyKey = document.body.classList.contains('touch') ? '<span class="key">TAP CARD</span> ' : '<span class="key">H</span> ';
    if (h.charge <= 0) hint += ' · ' + hyKey + (st.hyperArmed ? '<b class="hy">HYPER ARMED — ' + h.def.hyper.name + '</b>' : 'ARM HYPER');
    $('mb-hint').innerHTML = st.phase === 'aim' ? hint : st.phase === 'enemy' ? 'ENEMY TURN' : '';
  }

  const pv = new THREE.Vector3();
  function project(x, y, z) {
    pv.set(x, y, z).project(C.camera);
    return [((pv.x + 1) / 2) * window.innerWidth, ((1 - pv.y) / 2) * window.innerHeight];
  }
  function placeLabels() {
    for (const e of st.enemies) {
      if (!e.label) continue;
      const [sx, sy] = project(e.x, e.r * 2 + 0.4, e.z - e.r * 0.4);
      e.label.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      e.label.hp.style.width = (100 * Math.max(0, e.hp) / e.maxHp).toFixed(1) + '%';
      e.label.cd.textContent = e.cd;
      e.label.el.classList.toggle('soon', e.cd <= 1);
      e.label.el.classList.toggle('poisoned', e.poisonT > 0);
      e.label.el.classList.toggle('cursed', e.curse > 0);
      e.label.el.style.opacity = e.drop > 0.3 ? '0' : '';
    }
    for (const h of st.heroes) {
      const [sx, sy] = project(h.x, 0, h.z + h.r + 0.4);
      h.label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, 0)`;
      h.label.classList.toggle('ready', h.charge <= 0);
      h.label.classList.toggle('active', h === curHero() && st.phase === 'aim');
    }
  }

  function toggleHyper() {
    const h = curHero();
    if (st.phase !== 'aim' || h.charge > 0) { C.sfx.error(); return; }
    st.hyperArmed = !st.hyperArmed;
    C.sfx[st.hyperArmed ? 'charge' : 'click']();
    if (st.hyperArmed) { C.spawnRing(h.x, h.z, h.def.look.glow, 4, 0.5); h.hop = 1; }
    st.hudDirty = true;
  }

  // ----------------------------------------------------------- per frame
  const angWrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  function animHero(h, dt, cur) {
    h.bob += dt;
    const sp = Math.hypot(h.vx, h.vz);
    const moving = h.moving && sp > 0.5;
    const aiming = st.phase === 'aim' && h === cur && (st.aim.on || st.keyAim);
    if (moving) h.head = Math.atan2(h.vz, h.vx);
    else if (aiming) h.head = st.aim.on ? Math.atan2(st.aim.dz, st.aim.dx) : st.kAim;
    const speedK = clamp(sp / 160, 0, 1);
    // squash & stretch: stretched along the flight, squashed on impacts,
    // wound up against the sling while you pull, wobbling when it settles
    let sx = 1, sy = 1, sz = 1;
    if (moving) { sx += speedK * 0.3; sy -= speedK * 0.14; sz -= speedK * 0.14; }
    if (aiming) {
      const p = st.aim.on ? st.aim.power : 1;
      sx -= p * 0.24; sy += p * 0.12; sz += p * 0.16;
    }
    if (h.squash > 0) { sx -= h.squash * 0.3; sy += h.squash * 0.18; sz += h.squash * 0.18; }
    else if (h.squash < 0) { sx -= h.squash * 0.35; sy += h.squash * 0.15; sz += h.squash * 0.15; }
    h.squash = h.squash > 0 ? Math.max(0, h.squash - dt * 5) : Math.min(0, h.squash + dt * 4);
    if (h.settle > 0) {
      const w = Math.sin((1 - h.settle) * 20) * h.settle * 0.2;
      sy *= 1 - w;
      sx *= 1 + w * 0.5;
      sz *= 1 + w * 0.5;
      h.settle = Math.max(0, h.settle - dt * 2.2);
    }
    const hyperNow = st.phase === 'hyper' && h === cur;
    const breath = (1 + Math.sin(h.bob * 2) * 0.02) * (hyperNow ? 1.15 + Math.sin(st.t * 30) * 0.03 : 1);
    h.stretch.rotation.y = -h.head;
    h.stretch.scale.set(sx * breath, sy * breath, sz * breath);
    h.model.group.rotation.y = h.head;   // undo the heading turn so the model keeps its own facing
    // BOUNCE balls roll like marbles, PIERCE balls lean into the flight like a missile
    if (!h.pierce && moving) h.rollA += (Math.min(sp, 36) * dt) / HERO_R;   // capped: faster just strobes
    else if (!h.pierce) h.rollA = lerp(h.rollA, Math.round(h.rollA / (Math.PI * 2)) * Math.PI * 2, Math.min(1, dt * 6));
    h.lean = lerp(h.lean, h.pierce && moving ? -0.35 * speedK : 0, Math.min(1, dt * 8));
    h.roll.rotation.z = h.pierce ? h.lean : -h.rollA;
    // facing: the heading while flying or aiming, otherwise toward the camera
    const want = moving || aiming ? -h.head : -Math.PI / 2 + 0.2;
    const fr = h.model.face.rotation;
    fr.y += angWrap(want - fr.y) * Math.min(1, dt * 10);
    // hop when its turn starts / a combo fires, shake when hurt
    h.hop = Math.max(0, h.hop - dt * 2.4);
    h.hurt = Math.max(0, h.hurt - dt * 3);
    h.flash = Math.max(0, h.flash - dt * 4);
    const tremble = (aiming && st.aim.on && st.aim.power > 0.85) || hyperNow ? (Math.random() - 0.5) * 0.08 : 0;
    // RAGNARÖK DIVE: flies up out of the arena and comes back down
    let soar = 0;
    if (h.soarT > 0) {
      h.soarT = Math.max(0, h.soarT - dt);
      const e = h.soarDur - h.soarT, k = e < 0.3 ? e / 0.3 : h.soarT < 0.3 ? h.soarT / 0.3 : 1;
      soar = k * k * 28;
      if (Math.random() < dt * 40) C.emit(h.x + rand(-0.6, 0.6), HERO_R + soar, h.z + rand(-0.6, 0.6), 0, -rand(2, 5), 0, 0xfff3a0, 1, 0.5, 0.5, 0);
    }
    h.stretch.position.set(Math.sin(h.hurt * 40) * h.hurt * 0.2 + tremble, HERO_R * sy + Math.sin(h.bob * 2.4) * 0.05 + Math.sin(h.hop * Math.PI) * 1.2 + soar, tremble);
    h.model.flash(Math.max(h.flash, hyperNow ? 0.6 : 0));
    h.model.update(dt, st.t + h.bob);
    h.root.position.set(h.x, 0, h.z);
    if (h.relic) {
      h.relic.group.position.set(Math.cos(h.bob * 1.6) * 0.9, HERO_R * 2.5 + Math.sin(h.bob * 3) * 0.1, Math.sin(h.bob * 1.6) * 0.9);
      h.relic.update(dt, st.t + h.bob);
    }
    // type markings
    h.mark.rotation.y = h.pierce ? -h.head : h.mark.rotation.y + dt * (moving ? 3 : 0.6);
    h.ringMat.opacity = h === cur && st.phase === 'aim' ? 0.55 + Math.sin(st.t * 8) * 0.35 : 0.7;
    h.chevrons.forEach((c, k) => {
      c.position.x = HERO_R * 1.55 + ((k * 0.5 + st.t * (moving ? 3 : 0.8)) % 1.5);
      c.material.opacity = 0.35 + 0.6 * (1 - ((k * 0.5 + st.t * (moving ? 3 : 0.8)) % 1.5) / 1.5);
    });
    const T = st.T;
    const empowered = T && T.h === h && (st.phase === 'move' || st.phase === 'hyper');
    if (h.spear) {
      const big = empowered && T.drill;
      h.spear.scale.set(big ? 1.6 : 1, big ? 1.8 : 1, big ? 1.8 : 1);
      h.spear.rotation.x += dt * (big ? 14 : 0);
      h.spear.material.opacity = moving ? clamp((sp - 3) / 25, 0, big ? 0.85 : 0.55) : 0;
    }
    if (h.shell) {
      h.pulse = Math.max(0, h.pulse - dt * 4);
      h.shell.material.uniforms.uOpacity.value = moving ? 0.35 + h.pulse * 0.8 : h.pulse * 0.6;
      h.shell.scale.setScalar(1 + h.pulse * 0.25);
    }
    // HYPER aura: flares up with the cut-in and stays for an empowered sling
    const auraCol = empowered && T.aura ? (T.rainbow ? RAINBOW[Math.floor(st.t * 10) % RAINBOW.length] : T.aura) : h.def.look.glow;
    h.auraK = Math.max(empowered && T.aura && st.phase === 'move' ? 0.75 : 0, h.auraK - dt * 1.5);
    h.aura.material.color.setHex(auraCol);
    h.aura.material.opacity = h.auraK * (0.55 + Math.sin(st.t * 14) * 0.15);
    h.aura.scale.setScalar(HERO_R * 6 * (1 + (1 - h.auraK) * 0.3));
    if (empowered && T.aura && Math.random() < dt * 40) {
      const a = rand(0, Math.PI * 2);
      C.emit(h.x + Math.cos(a) * 0.9, 0.4, h.z + Math.sin(a) * 0.9, 0, rand(3, 6), 0, auraCol, 0.8, 0.45, 0.3, 0);
    }
    // hex shield dome while the team is shielded
    h.domePop = Math.max(0, h.domePop - dt * 2.5);
    const shielded = st.shield > 0;
    h.dome.visible = shielded || h.domePop > 0;
    if (h.dome.visible) {
      h.dome.material.opacity = (shielded ? 0.22 + Math.sin(st.t * 3 + h.idx) * 0.06 : 0) + h.domePop * 0.5;
      h.dome.scale.setScalar(1 + h.domePop * 0.35);
      h.dome.rotation.y += dt * 0.4;
    }
    // speed afterimages: the faster the ball, the bigger the smear behind it
    h.ghostT -= dt;
    if (moving && sp > 70 && h.ghostT <= 0) {
      h.ghostT = 0.035;
      afterimage(h.x, HERO_R, h.z, h.ty.col, 1.4 + speedK * 1.6);
    }
  }

  function animEnemy(e, dt, cur) {
    e.bob += dt;
    e.x = lerp(e.x, e.tx, Math.min(1, dt * 6));
    e.z = lerp(e.z, e.tz, Math.min(1, dt * 6));
    e.flash = Math.max(0, e.flash - dt * 4);
    e.wobble = Math.max(0, e.wobble - dt * 5);
    e.lunge = Math.max(0, e.lunge - dt * 3);
    e.windup = Math.max(0, e.windup - dt * 4.5);
    const kd = Math.exp(-dt * 9);
    e.kx *= kd;
    e.kz *= kd;
    e.model.flash(Math.max(e.flash, e.cd <= 1 && e.alive ? (Math.sin(st.t * 10) + 1) * 0.15 : 0));
    e.model.update(dt, st.t + e.bob);
    // look at the hero whose turn it is
    const want = cur ? Math.atan2(-(cur.z - e.z), cur.x - e.x) : -Math.PI / 2;
    e.yaw += angWrap(want - e.yaw) * Math.min(1, dt * 3);
    e.model.face.rotation.y = e.yaw;
    const sq = 1 + Math.sin(e.wobble * 20) * e.wobble * 0.14;
    const swell = 1 + Math.sin(e.windup * Math.PI) * 0.28;
    const breath = 1 + Math.sin(e.bob * 2) * 0.03;
    if (e.dying > 0) {
      e.dying = Math.min(1, e.dying + dt * 2.5);
      e.model.group.scale.setScalar(e.k * (1 - e.dying) * (1 + e.dying * 0.4));
      e.ring.material.opacity = 0.75 * (1 - e.dying);
    } else {
      e.model.group.scale.set(e.k * sq * swell * breath, (e.k / sq) * swell * breath, e.k * sq * swell * breath);
    }
    const tremble = e.cd <= 1 && e.alive ? Math.sin(st.t * 45) * 0.06 : 0;
    const lg = Math.sin(e.lunge * Math.PI) * 2;
    e.model.group.position.set(e.lx * lg + e.kx + tremble, e.r + e.drop * 14 + Math.sin(e.bob * 2) * 0.1, e.lz * lg + e.kz);
    e.ring.material.color.setHex(e.cd <= 1 && Math.sin(st.t * 10) > 0 ? 0xffffff : e.curse ? 0xb84dff : e.poisonT ? 0x8dff2a : 0xff2a4d);
    e.root.position.set(e.x, 0, e.z);
  }

  function updateFx(dt) {
    for (const b of beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; continue; }
      const q = b.life / b.max;
      b.m.material.opacity = q;
      b.m.scale.z = b.w * (0.35 + q * 0.65);
    }
    for (const s of segs) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      s.m.material.opacity = (s.life / s.max) * (Math.random() < 0.25 ? 0.4 : 1);
    }
    for (const p of pillars) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      const q = p.life / p.max;
      const r = p.r * (0.6 + 0.4 * Math.sin(Math.min(1, (1 - q) * 3) * Math.PI / 2)) * (1 + Math.sin(st.t * 40) * 0.05);
      p.m.scale.set(r, p.h * (q > 0.8 ? 1 - (q - 0.8) * 2.5 : 1), r);   // shoots up, then fades
      p.m.material.opacity = Math.min(1, q * 1.6) * p.op;
    }
    for (const f of fireballs) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.outer.visible = f.core.visible = false; continue; }
      const q = 1 - f.life / f.max;
      const s = f.size * (1.2 + q * 4);
      f.outer.scale.set(s, s, 1);
      f.core.scale.set(s * 0.45, s * 0.45, 1);
      f.outer.material.opacity = (1 - q) * 0.95;
      f.core.material.opacity = Math.max(0, 1 - q * 1.8);
    }
    for (const r of reticles) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.g.visible = false; continue; }
      const q = r.life / r.max;
      r.g.scale.setScalar(r.r * (1 + q * 0.6));
      r.g.rotation.y += dt * 4;
      r.mat.opacity = 0.9 * Math.min(1, (1 - q) * 4) * (Math.sin(st.t * 30) > -0.3 ? 1 : 0.4);
    }
    for (const g of ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) { g.s.visible = false; continue; }
      g.s.material.opacity = (g.life / g.max) * 0.7;
    }
    if (hole.active) {
      hole.t += dt;
      const q = hole.t / hole.dur;
      const grow = q < 0.3 ? q / 0.3 : q > 0.88 ? Math.max(0, (1 - q) / 0.12) : 1;
      hole.g.scale.setScalar(0.2 + grow * 1.5);
      hole.disk.rotation.y += dt * 7;
      for (let i = 0; i < 4; i++) {
        const a = rand(0, Math.PI * 2), r = rand(4, 9);
        C.emit(hole.x + Math.cos(a) * r, 0.6, hole.z + Math.sin(a) * r, -Math.cos(a) * r * 1.6 - Math.sin(a) * 4, 7, -Math.sin(a) * r * 1.6 + Math.cos(a) * 4, pick([0xb84dff, 0xff3cf2, 0xffffff]), 0.7, 0.6, 0, 0);
      }
      if (q >= 1) { hole.active = false; hole.g.visible = false; }
    }
  }

  function update(realDt) {
    if (!st.active) return;
    const dt = realDt * st.speed;   // battle speed 1× / 2× / 3×
    st.t += dt;
    st.phaseT += dt;
    // timers
    if (st.timers.length) {
      const due = [];
      st.timers = st.timers.filter((tm) => { tm.t -= dt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
      due.forEach((tm) => tm.fn());
      if (!st.active) return;
    }
    if (st.phase === 'aim') {
      updateAim();
      if (BOT) botThink();
    }
    if (st.phase === 'move') {
      if (st.hitStop > 0) st.hitStop -= realDt;   // impact freeze runs on real time
      else for (const m of st.movers) if (m.moving) stepMover(m, dt);
      if (!st.movers.some((m) => m.moving) && !st.shots.length && !st.timers.length) endMove();
      // afterimages of an empowered sling
      const T = st.T;
      if (T && T.after && T.h.moving) {
        st.afterT -= dt;
        if (st.afterT <= 0) {
          st.afterT = 0.035;
          st.afterN = (st.afterN || 0) + 1;
          afterimage(T.h.x, HERO_R, T.h.z, T.rainbow ? RAINBOW[st.afterN % RAINBOW.length] : T.after, 2.8);
        }
      }
    }
    if (st.T && st.T.saws) updateSaws(dt);
    for (const m of st.mushrooms) {
      m.k = Math.min(1, m.k + dt * 2.5);
      const pop = m.k < 1 ? 1 + Math.sin(m.k * Math.PI) * 0.35 : 1 + Math.sin(st.t * 7) * 0.06;
      m.mesh.scale.setScalar(1.25 * m.k * pop);
    }
    updateShots(dt);
    updateFx(dt);
    const cur = curHero();
    for (const h of st.heroes) animHero(h, dt, cur);
    for (const m of st.movers) {
      if (!m.clone) continue;
      m.root.position.set(m.x, HERO_R * 0.8, m.z);
      m.model.update(dt, st.t);
      if (!m.moving) m.root.visible = false;
      else if (Math.random() < dt * 30) afterimage(m.x, HERO_R * 0.8, m.z, m.def.look.glow, 1.8);
    }
    activeRing.visible = st.phase === 'aim' || st.phase === 'move' || st.phase === 'hyper';
    if (activeRing.visible) {
      activeRing.position.set(cur.x, 0.08, cur.z);
      activeRing.material.color.setHex(st.hyperArmed || st.phase === 'hyper' ? 0xffc933 : cur.ty.col);
      activeRing.scale.setScalar(1 + Math.sin(st.t * 6) * 0.08 + (st.hyperArmed || st.phase === 'hyper' ? 0.25 : 0));
    }
    for (let i = st.enemies.length - 1; i >= 0; i--) {
      const e = st.enemies[i];
      if (e.dropDelay > 0) { e.dropDelay -= dt; e.root.visible = false; continue; }
      e.root.visible = true;
      e.drop = Math.max(0, e.drop - dt * 2.6);
      animEnemy(e, dt, st.phase === 'aim' || st.phase === 'move' || st.phase === 'hyper' ? cur : null);
      if (e.dying >= 1) { removeEnemy(e); st.enemies.splice(i, 1); }
    }
    for (const o of st.orbs) {
      o.t += dt;
      o.g.position.y = 0.9 + Math.sin(o.t * 3) * 0.15;
      if (o.spin) o.spin.rotation.y += dt * 4;
    }
    // lights
    const lead = st.movers.find((m) => m.moving && !m.clone);
    if (lead) {
      C.ballLight.position.set(lead.x, 1.6, lead.z);
      C.ballLight.color.setHex(lead.def.look.glow);
      C.ballLight.intensity = 1.4;
    } else {
      C.ballLight.intensity = 0;
    }
    // live speedometer: the slung ball's current speed in SPD units
    if (lead) {
      const v = Math.hypot(lead.vx, lead.vz);
      $('mb-speedo').classList.remove('hidden');
      $('mb-speedo-v').textContent = Math.round(v / SPD_UNIT);
      $('mb-speedo-fill').style.width = Math.min(100, (100 * v) / Math.max(1, lead.v0)).toFixed(1) + '%';
    } else {
      $('mb-speedo').classList.add('hidden');
    }
    C.paddleLight.color.setHex(cur.ty.col);
    C.paddleLight.position.set(cur.x, 2, cur.z);
    C.paddleLight.intensity = 1.2;
    C.setFocusX(0);
    if (st.hudDirty || st.phase === 'move') renderHud();
    placeLabels();
  }

  // SCRAP STORM: three saws circle the ball and cut everything they touch
  function updateSaws(dt) {
    const S = st.T.saws, h = st.T.h;
    S.list.forEach((s, i) => {
      const a = st.t * 7 + (i / S.list.length) * Math.PI * 2, R = HERO_R + 1.3;
      s.position.set(h.x + Math.cos(a) * R, 0.9, h.z + Math.sin(a) * R);
      s.rotation.y -= dt * 22;
      if (st.phase !== 'move') return;
      if (Math.random() < dt * 30) C.emit(s.position.x, 0.9, s.position.z, rand(-3, 3), rand(1, 3), rand(-3, 3), 0xffc933, 0.5, 0.25, 1, -9);
      for (const e of st.enemies) {
        if (!e.alive || e.drop > 0.05) continue;
        if (Math.hypot(e.x - s.position.x, e.z - s.position.z) > e.r + 0.6) continue;
        if (st.t - (S.hit.get(e) || -1) < 0.18) continue;
        S.hit.set(e, st.t);
        damageEnemy(e, S.pw, h, '');
        C.burst(s.position.x, 0.9, s.position.z, 0xffc933, 8, 6, 0.25, 0.5);
        sound('armor');
      }
    });
  }

  function updateShots(dt) {
    for (let i = st.shots.length - 1; i >= 0; i--) {
      const s = st.shots[i];
      if (s.to && s.to.alive !== false) { s.tx = s.to.x; s.tz = s.to.z; }
      const p = s.g.position;
      const ty = s.drop ? 0.8 : 1;
      const dx = s.tx - p.x, dy = ty - p.y, dz = s.tz - p.z, d = Math.hypot(dx, dy, dz);
      const step = s.speed * dt;
      if (s.spin) s.spin.rotation.y += s.spinV * dt;
      s.trail -= dt;
      if (s.trail <= 0) { s.trail = s.trailEvery; C.emit(p.x, p.y, p.z, 0, 0, 0, s.color, s.trailSize, 0.3, 0, 0); }
      if (d <= step || d < 0.35) {
        scene.remove(s.g);
        st.shots.splice(i, 1);
        C.burst(s.tx, ty, s.tz, s.color, 8, 4, 0.3, 0.5);
        if (s.onHit) s.onHit();
        continue;
      }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.z += (dz / d) * step;
    }
  }

  // ----------------------------------------------------------- lifecycle
  function start(opts) {
    init();
    stop();
    // started without options (e.g. ?mode=marble&autostart): fight the current campaign stage
    const o = opts && opts.team && opts.team.length ? opts : NEON.rpg.battleOpts();
    st.active = true;
    st.stage = o.stage || 1;
    st.label = o.label || String(st.stage);
    st.plan = o.plan || NEON.rpg.stagePlan(st.stage);
    st.t = 0;
    st.turn = 1;
    st.cur = 0;
    st.coins = 0;
    st.kills = 0;
    st.shield = 0;
    st.hitStop = 0;
    st.hot = [];
    st.wall = null;
    st.mushrooms = [];
    st.guardianUsed = false;
    st.keyAim = false;
    st.kAim = -Math.PI / 2;
    $('mb-labels').innerHTML = '';
    st.heroes = (o.team || []).slice(0, 4).map((spec, i) => makeHero(spec, i));
    st.teamMax = st.heroes.reduce((s, h) => s + h.hp, 0);
    st.teamHp = st.teamMax;
    const sum = (k) => st.heroes.reduce((s, h) => s + (h.mods[k] || 0), 0);
    const avgArmor = st.heroes.reduce((s, h) => s + h.armor, 0) / Math.max(1, st.heroes.length);
    st.armorK = (120 / (120 + avgArmor)) * (1 - Math.min(0.4, sum('teamArmor')));
    st.guardian = Math.max(0, ...st.heroes.map((h) => h.mods.guardian || 0));
    st.regen = sum('regen');
    st.killHeal = sum('healOnKill');
    st.shieldStart = Math.min(0.6, sum('shieldStart'));
    st.counter = Math.min(0.6, sum('counter'));
    st.coinFind = sum('coinFind');
    st.revive = Math.max(0, ...st.heroes.map((h) => h.mods.revive || 0));
    st.reviveUsed = false;
    barrier.visible = true;
    ['mb-hud', 'mb-labels'].forEach((id) => $(id).classList.remove('hidden'));
    buildHud();
    C.sfx.start();
    startWave(0, false);
    renderHud();
  }

  function stop() {
    st.active = false;
    st.phase = 'idle';
    st.timers = [];
    st.heroes.forEach((h) => scene.remove(h.root));
    st.heroes = [];
    st.enemies.forEach(removeEnemy);
    st.enemies = [];
    st.orbs.forEach((o) => scene.remove(o.g));
    st.orbs = [];
    st.shots.forEach((s) => scene.remove(s.g));
    st.shots = [];
    st.movers.forEach((m) => { if (m.clone) scene.remove(m.root); });
    st.movers = [];
    if (st.T && st.T.saws) st.T.saws.list.forEach((s) => scene.remove(s));
    st.T = null;
    st.mushrooms = [];
    if (inited) {
      barrier.visible = false;
      hideAim();
      activeRing.visible = false;
      [beams, segs, pillars].forEach((pool) => pool.forEach((b) => { b.m.visible = false; b.life = 0; }));
      fireballs.forEach((f) => { f.outer.visible = f.core.visible = false; f.life = 0; });
      reticles.forEach((r) => { r.g.visible = false; r.life = 0; });
      ghosts.forEach((g) => { g.s.visible = false; g.life = 0; });
      hole.active = false;
      hole.g.visible = false;
      C.ballLight.intensity = 0;
    }
    ['mb-hud', 'mb-labels', 'mb-speedo'].forEach((id) => $(id).classList.add('hidden'));
    $('mb-cutin').classList.remove('show');
    $('mb-labels').innerHTML = '';
  }

  // ------------------------------------------------------------- input
  function pointerDown() {
    if (!st.active || st.phase !== 'aim') return;
    const p = pointerFloor();
    if (!p) return;
    st.aim.on = true;
    st.keyAim = false;
    st.aim.sx = p.x;
    st.aim.sz = p.z;
    st.aim.power = 0;
  }

  function pointerUp() {
    if (!st.active || !st.aim.on) return;
    readDrag();   // a quick flick may start and end between two frames
    st.aim.on = false;
    if (st.phase === 'aim' && st.aim.power > 0.12) launch(st.aim.dx, st.aim.dz, st.aim.power);
    else hideAim();
  }

  // SPACE: launch along the keyboard aim at full power
  function fire() {
    if (!st.active || st.phase !== 'aim' || st.aim.on) return;
    if (!st.keyAim) { st.keyAim = true; return; }   // first press shows the aim line
    launch(Math.cos(st.kAim), Math.sin(st.kAim), 1);
  }

  document.querySelectorAll('#mb-speed button').forEach((b) => b.addEventListener('click', () => {
    setSpeed(+b.dataset.s);
    C.sfx.click();
  }));

  window.addEventListener('keydown', (e) => {
    if (!st.active) return;
    const k = e.key;
    if (k === 'h' || k === 'H') toggleHyper();
    else if (st.phase === 'aim' && (k === 'ArrowLeft' || k === 'a' || k === 'A')) { st.kAim -= 0.06; st.keyAim = true; }
    else if (st.phase === 'aim' && (k === 'ArrowRight' || k === 'd' || k === 'D')) { st.kAim += 0.06; st.keyAim = true; }
    else if (k === 'f' || k === 'F') { setSpeed(SPEEDS[(SPEEDS.indexOf(st.speed) + 1) % SPEEDS.length]); C.sfx.click(); }
  });

  NEON.marble = { start, stop, update, pointerDown, pointerUp, fire, best: () => 0 };
  if (BOT) NEON.marble.debug = { st, triggerCombo };   // test autopilot hook
})();
