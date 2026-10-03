/* ==========================================================================
   SLING HEROES — portraits and icons
   All pictures in the menus are rendered from the 3D models when the game
   loads, with the same toon look as the game itself:
   * SH.portrait('hero'|'enemy', id)  head and shoulders for the cards
   * SH.splash(heroId)                full body art for the hyper cut-in
   * SH.icon(name)                    items, gear, currencies and menu icons
   Everything is cached as a data URL, so it is drawn only once.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.Rig) return;
  const G = SH.G, U = SH.util;
  const PI = Math.PI;
  const V3 = THREE.Vector3;
  const C = (c) => new THREE.Color(c);
  const shade = (c, k) => C(c).multiplyScalar(k);

  // ------------------------------------------------------------ studio
  const studio = new THREE.Scene();
  studio.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a40, 0.7));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.15);
  key.position.set(2.5, 4, 5);
  studio.add(key);
  const rimL = new THREE.DirectionalLight(0x9ac8ff, 1.0);
  rimL.position.set(-4, 2, -3);
  studio.add(rimL);
  const fill = new THREE.DirectionalLight(0xffc8e8, 0.35);
  fill.position.set(-3, 0, 4);
  studio.add(fill);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  SH.studio = { scene: studio, cam, key, rim: rimL };

  const cache = {};

  function settle(rig, state) {
    rig.state = state || 'idle';
    rig.t = 0.3;
    for (let i = 0; i < 40; i++) rig.update(1 / 60);
    rig.t = 0.3;
    rig.update(0);
  }

  // head + shoulders
  SH.portrait = function (type, id, size) {
    size = size || 192;
    const k = 'p_' + type + '_' + id + '_' + size;
    if (cache[k]) return cache[k];
    const rig = type === 'hero' ? SH.buildHero(SH.data.HERO[id].look) : SH.buildMonster(id);
    settle(rig, 'idle');
    studio.add(rig.root);
    rig.root.rotation.y = type === 'hero' ? -0.35 : -0.2;
    rig.root.updateMatrixWorld(true);
    const f = rig.focus;
    const target = new V3(0, f.y + f.r * 0.02, 0);
    cam.fov = 30; cam.aspect = 1; cam.updateProjectionMatrix();
    const dist = f.r * 4.5;
    cam.position.set(target.x + dist * 0.12, target.y + dist * 0.12, target.z + dist);
    cam.lookAt(target);
    const url = SH.renderImage(studio, cam, size, size);
    rig.dispose();
    cache[k] = url;
    return url;
  };

  // full body art for the hyper cut-in
  SH.splash = function (id, w, h) {
    w = w || 360; h = h || 460;
    const k = 's_' + id + '_' + w;
    if (cache[k]) return cache[k];
    const rig = SH.buildHero(SH.data.HERO[id].look);
    settle(rig, 'hero');
    studio.add(rig.root);
    rig.root.rotation.y = 0.5;
    rig.root.updateMatrixWorld(true);
    const H = rig.height;
    cam.fov = 32; cam.aspect = w / h; cam.updateProjectionMatrix();
    const target = new V3(0, H * 0.62, 0);
    const dist = H * 2.3;
    cam.position.set(0.3, H * 0.35, dist);
    cam.lookAt(target);
    const oldRim = rimL.intensity;
    rimL.intensity = 1.8;
    const url = SH.renderImage(studio, cam, w, h, { exposure: 0.92 });
    rimL.intensity = oldRim;
    rig.dispose();
    cache[k] = url;
    return url;
  };

  // ------------------------------------------------------------ icon models
  const gold = '#f2c040', wood = '#8a5a2a';
  function iconRig(build) {
    const r = new SH.Rig({ thick: 0.03, outline: 0x1a0f14 });
    r.rim = 0xfff0d0;
    build(r);
    r.build();
    return r;
  }
  const P = (r, g, o) => r.add('root', g, o);

  const MODELS = {
    potion: (col) => iconRig((r) => {
      P(r, G.lathe('flaskb', [[0, -0.5], [0.34, -0.45], [0.42, -0.2], [0.4, 0.05], [0.24, 0.22], [0, 0.24]], 24), { c: col, c2: shade(col, 0.45) });
      P(r, G.lathe('flaskn', [[0, 0.15], [0.2, 0.2], [0.14, 0.4], [0.16, 0.48], [0, 0.5]], 16), { c: '#e8f4ff', c2: '#a8c0d8' });
      P(r, G.sph, { p: [0, -0.2, 0.12], s: [0.25, 0.18, 0.25], c: col, k: 'glow', i: 1.2 });
      P(r, G.cyl, { p: [0, 0.56, 0], s: [0.12, 0.16, 0.12], c: wood });
      P(r, G.sph, { p: [-0.18, -0.08, 0.3], s: [0.05, 0.14, 0.03], c: '#ffffff', k: 'glow', i: 1.5 });
    }),
    tonic: () => iconRig((r) => {
      P(r, G.lathe('tonic', [[0, -0.55], [0.22, -0.52], [0.25, 0.1], [0.12, 0.3], [0.1, 0.5], [0, 0.52]], 20), { c: '#4a8a2a', c2: '#d8ff9a' });
      P(r, G.cyl, { p: [0, -0.15, 0], s: [0.21, 0.6, 0.21], c: '#b8ff4a', k: 'glow', i: 1.6 });
      P(r, G.cyl, { p: [0, 0.58, 0], s: [0.11, 0.14, 0.11], c: '#c84a2a' });
      P(r, G.oct, { p: [0, 0.0, 0.26], s: [0.12, 0.16, 0.02], c: '#ffe04a' });
    }),
    scroll: (golden) => iconRig((r) => {
      P(r, G.cyl, { r: [0, 0, PI / 2 + 0.3], s: [0.22, 0.9, 0.22], c: '#f4e4c0', c2: '#d8c08a' });
      for (const s of [-1, 1]) P(r, G.cyl, { p: [s * 0.43 * Math.cos(0.3), s * 0.43 * Math.sin(0.3), 0], r: [0, 0, PI / 2 + 0.3], s: [0.12, 0.14, 0.12], c: golden ? gold : wood, k: golden ? 'metal' : 'toon' });
      P(r, G.torus(0.23, 0.035, PI * 2, 6, 20), { r: [0, PI / 2, 0.3], c: golden ? '#c82a5a' : '#c83a2a' });
      P(r, G.cyl, { p: [0, 0, 0.24], r: [PI / 2, 0, 0], s: [0.12, 0.04, 0.12], c: golden ? '#ffd23a' : '#b82a2a', k: golden ? 'glow' : 'toon', i: 1.8 });
    }),
    chest: (body, trim, glowC) => iconRig((r) => {
      P(r, G.box, { p: [0, -0.15, 0], s: [0.95, 0.5, 0.62], c: body, c2: shade(body, 0.6) });
      P(r, G.cyl, { p: [0, 0.12, -0.02], r: [0, 0, PI / 2], s: [0.31, 0.95, 0.31], c: shade(body, 1.15) });
      for (const x of [-0.32, 0.32]) {
        P(r, G.box, { p: [x, -0.15, 0], s: [0.1, 0.52, 0.65], c: trim, k: 'metal' });
        P(r, G.torus(0.315, 0.05, PI, 6, 16), { p: [x, 0.12, -0.02], r: [0, PI / 2, 0], c: trim, k: 'metal' });
      }
      P(r, G.box, { p: [0, 0.05, 0.32], s: [0.18, 0.22, 0.06], c: trim, k: 'metal' });
      P(r, G.sph, { p: [0, 0.05, 0.36], s: [0.05, 0.06, 0.02], c: glowC, k: 'glow', i: 2.2 });
    }),
    gem: (col) => iconRig((r) => {
      P(r, G.lathe('gem', [[0, -0.55], [0.5, 0.05], [0.42, 0.22], [0.2, 0.3], [0, 0.3]], 8), { c: col, c2: shade(col, 0.5), k: 'metal' });
      P(r, G.oct, { p: [0.12, 0.12, 0.3], s: [0.05, 0.12, 0.02], c: '#ffffff', k: 'glow', i: 2 });
    }),
    coins: () => iconRig((r) => {
      for (let i = 0; i < 4; i++) P(r, G.cyl, { p: [(i % 2) * 0.04 - 0.02, -0.35 + i * 0.13, 0], s: [0.42, 0.11, 0.42], c: gold, c2: '#c8902a', k: 'metal' });
      P(r, G.cyl, { p: [0.15, 0.15, 0.15], r: [1.1, 0, 0.3], s: [0.4, 0.1, 0.4], c: gold, k: 'metal' });
      P(r, G.oct, { p: [0.18, 0.2, 0.27], r: [1.1, 0, 0.3], s: [0.12, 0.03, 0.12], c: '#ffe890', k: 'glow', i: 1.6 });
    }),
    bolt: () => iconRig((r) => {
      const g = G.shape('bolt', (s) => { s.moveTo(0.1, 0.6); s.lineTo(-0.3, -0.05); s.lineTo(-0.02, -0.05); s.lineTo(-0.15, -0.6); s.lineTo(0.32, 0.12); s.lineTo(0.04, 0.12); s.lineTo(0.2, 0.6); s.closePath(); }, 0.12);
      P(r, g, { c: '#ffd23a', c2: '#ff8a1a' });
      P(r, g, { p: [0, 0, 0.09], s: [0.6, 0.6, 0.3], c: '#fff4b0', k: 'glow', i: 1.5 });
    }),
    sword: (col) => iconRig((r) => {
      P(r, G.box, { p: [0, 0.18, 0], r: [0, 0, -0.78], s: [0.12, 0.85, 0.03], c: col, k: 'metal' });
      P(r, G.box, { p: [-0.25, -0.08, 0], r: [0, 0, -0.78 + PI / 2], s: [0.08, 0.38, 0.08], c: gold, k: 'metal' });
      P(r, G.cyl, { p: [-0.36, -0.2, 0], r: [0, 0, -0.78], s: [0.05, 0.22, 0.05], c: '#3a2a2a' });
      P(r, G.sph, { p: [-0.45, -0.29, 0], s: 0.07, c: col, k: 'glow', i: 2 });
      P(r, G.box, { p: [0.01, 0.19, 0.02], r: [0, 0, -0.78], s: [0.03, 0.75, 0.01], c: '#ffffff', k: 'glow', i: 1.4, ol: false });
    }),
    armor: (col) => iconRig((r) => {
      P(r, G.lathe('cuirass', [[0.0, -0.45], [0.38, -0.4], [0.42, -0.1], [0.4, 0.2], [0.3, 0.38], [0.0, 0.42]], 20), { s: [1, 1, 0.65], c: col, c2: shade(col, 0.6), k: 'metal' });
      for (const s of [-1, 1]) P(r, G.shell(0.2, 0, PI * 2, 0, PI * 0.5, 14, 8), { p: [s * 0.42, 0.3, 0], r: [0, 0, -s * 0.5], c: shade(col, 0.85), k: 'metal' });
      P(r, G.oct, { p: [0, 0.05, 0.28], s: [0.09, 0.12, 0.03], c: '#ffffff', k: 'glow', i: 1.8 });
    }),
    helm: (col) => iconRig((r) => {
      P(r, G.shell(0.45, 0, PI * 2, 0, PI * 0.62, 24, 12), { c: col, c2: shade(col, 0.6), k: 'metal' });
      P(r, G.box, { p: [0, 0.0, 0.38], s: [0.42, 0.08, 0.12], c: '#141018' });
      P(r, G.box, { p: [0, -0.18, 0.4], s: [0.08, 0.3, 0.08], c: shade(col, 0.8), k: 'metal' });
      for (let i = 0; i < 5; i++) P(r, G.sph, { p: [0, 0.45 - i * 0.02, 0.2 - i * 0.14], s: [0.06, 0.14, 0.12], c: '#d83a3a' });
    }),
    charm: (col) => iconRig((r) => {
      P(r, G.torus(0.28, 0.05, PI * 2, 8, 30), { p: [0, 0.2, 0], c: gold, k: 'metal' });
      P(r, G.oct, { p: [0, -0.2, 0.02], s: [0.22, 0.3, 0.12], c: col, k: 'metal' });
      P(r, G.oct, { p: [0, -0.2, 0.08], s: [0.1, 0.14, 0.06], c: col, k: 'glow', i: 2.2 });
    }),
    medal: () => iconRig((r) => {
      P(r, G.box, { p: [-0.12, 0.3, -0.05], r: [0, 0, 0.3], s: [0.18, 0.5, 0.04], c: '#c82a3a' });
      P(r, G.box, { p: [0.12, 0.3, -0.05], r: [0, 0, -0.3], s: [0.18, 0.5, 0.04], c: '#2a5ac8' });
      P(r, G.cyl, { p: [0, -0.1, 0], r: [PI / 2, 0, 0], s: [0.36, 0.08, 0.36], c: gold, k: 'metal' });
      P(r, G.oct, { p: [0, -0.1, 0.06], s: [0.16, 0.2, 0.03], c: '#fff0a0', k: 'glow', i: 1.6 });
    }),
    shard: (col) => iconRig((r) => {
      P(r, G.oct, { p: [0, 0.05, 0], r: [0, 0.4, 0.2], s: [0.28, 0.55, 0.28], c: col, c2: shade(col, 0.5), k: 'metal' });
      P(r, G.oct, { p: [-0.3, -0.25, 0.05], r: [0, 0.2, -0.5], s: [0.13, 0.26, 0.13], c: col, k: 'metal' });
      P(r, G.oct, { p: [0.28, -0.28, 0.0], r: [0, 0.8, 0.6], s: [0.11, 0.2, 0.11], c: col, k: 'metal' });
      P(r, G.oct, { p: [0, 0.05, 0.12], r: [0, 0.4, 0.2], s: [0.1, 0.3, 0.05], c: col, k: 'glow', i: 2 });
    }),
    // ---- menu icons
    navHeroes: () => iconRig((r) => {
      P(r, G.shell(0.45, 0, PI * 2, 0, PI * 0.7, 24, 12), { c: '#c8ccd8', c2: '#6a6e7a', k: 'metal' });
      P(r, G.box, { p: [0, 0.0, 0.4], s: [0.5, 0.07, 0.1], c: '#141018' });
      P(r, G.box, { p: [0, -0.2, 0.36], s: [0.12, 0.3, 0.1], c: '#9aa0b0', k: 'metal' });
      P(r, G.torus(0.44, 0.04, PI * 2, 6, 24), { p: [0, -0.02, 0], r: [PI / 2, 0, 0], c: gold, k: 'metal' });
      for (let i = 0; i < 6; i++) P(r, G.sph, { p: [0, 0.48 - i * 0.02, 0.15 - i * 0.12], s: [0.07, 0.16, 0.12], c: '#e8303a' });
    }),
    navMastery: () => iconRig((r) => {
      P(r, G.box, { p: [0, 0, 0], r: [0.25, -0.3, 0], s: [0.75, 0.95, 0.24], c: '#a8302a', c2: '#5a1a14' });
      P(r, G.box, { p: [0.02, 0, 0.0], r: [0.25, -0.3, 0], s: [0.68, 0.88, 0.26], c: '#f4e4c0' });
      P(r, G.box, { p: [-0.02, 0, 0.02], r: [0.25, -0.3, 0], s: [0.7, 0.9, 0.2], c: '#b8382e' });
      P(r, G.oct, { p: [0.04, 0.02, 0.15], r: [0.25, -0.3, 0], s: [0.16, 0.22, 0.04], c: '#ffd23a', k: 'glow', i: 2 });
      for (const y of [-0.38, 0.38]) P(r, G.box, { p: [0.0, y, 0.05], r: [0.25, -0.3, 0], s: [0.72, 0.06, 0.25], c: gold, k: 'metal' });
    }),
    navMissions: () => iconRig((r) => {
      P(r, G.box, { p: [0, -0.05, 0], r: [0.2, 0, 0.1], s: [0.62, 0.78, 0.03], c: '#f4e4c0', c2: '#d8b880' });
      for (const y of [0.42, -0.5]) P(r, G.cyl, { p: [y * -0.1, y, 0.02], r: [0, 0, PI / 2 + 0.1], s: [0.08, 0.72, 0.08], c: '#d8b880' });
      for (let i = 0; i < 4; i++) P(r, G.box, { p: [-0.03 + i * 0.01, 0.22 - i * 0.16, 0.04], r: [0.2, 0, 0.1], s: [0.42, 0.04, 0.01], c: '#6a4a2a', ol: false });
      P(r, G.cone, { p: [0.3, 0.05, 0.12], r: [0, 0, -0.6], s: [0.1, 0.8, 0.03], c: '#ffffff', c2: '#d8d8e8' });
    }),
    navInventory: () => iconRig((r) => {
      P(r, G.sphHi, { p: [0, -0.12, 0], s: [0.45, 0.42, 0.36], c: '#a86a3a', c2: '#5a3a1a' });
      P(r, G.torus(0.2, 0.06, PI * 2, 6, 20), { p: [0, 0.32, 0], r: [PI / 2, 0, 0], c: '#d8a85a' });
      P(r, G.sph, { p: [0, 0.38, 0], s: [0.2, 0.12, 0.2], c: '#c88a4a' });
      P(r, G.box, { p: [0, -0.1, 0.33], s: [0.3, 0.25, 0.08], c: '#8a5a2a' });
      P(r, G.sph, { p: [0, -0.05, 0.38], s: [0.05, 0.05, 0.02], c: gold, k: 'metal' });
    }),
    navShop: () => iconRig((r) => {
      P(r, G.box, { p: [0, -0.15, 0], s: [0.95, 0.5, 0.62], c: '#8a4a2a', c2: '#4a2a14' });
      for (let i = 0; i < 6; i++) P(r, G.cyl, { p: [-0.3 + i * 0.12, 0.15 + (i % 2) * 0.05, 0.05], r: [0.5, 0, 0.3 * (i % 3 - 1)], s: [0.1, 0.03, 0.1], c: gold, k: 'metal' });
      P(r, G.sph, { p: [0, 0.1, 0], s: [0.4, 0.15, 0.25], c: '#ffd23a', k: 'glow', i: 1.4 });
      for (const x of [-0.32, 0.32]) P(r, G.box, { p: [x, -0.15, 0], s: [0.1, 0.52, 0.65], c: gold, k: 'metal' });
      P(r, G.oct, { p: [0.15, 0.32, 0.1], s: [0.1, 0.15, 0.1], c: '#5ac8ff', k: 'metal' });
      P(r, G.oct, { p: [-0.2, 0.28, 0.0], s: [0.08, 0.12, 0.08], c: '#ff4a8a', k: 'metal' });
    }),
    gift: () => iconRig((r) => {
      P(r, G.box, { p: [0, -0.12, 0], s: [0.75, 0.6, 0.75], c: '#e8384a', c2: '#a81a2a' });
      P(r, G.box, { p: [0, 0.22, 0], s: [0.82, 0.14, 0.82], c: '#ff4a5a' });
      P(r, G.box, { p: [0, 0.0, 0], s: [0.16, 0.86, 0.84], c: gold, k: 'metal' });
      P(r, G.box, { p: [0, 0.0, 0], s: [0.84, 0.86, 0.16], c: gold, k: 'metal' });
      for (const s of [-1, 1]) P(r, G.torus(0.14, 0.05, PI * 2, 6, 16), { p: [s * 0.14, 0.38, 0], r: [0, 0, s * 0.6], s: [1, 0.7, 1], c: gold, k: 'metal' });
    }),
    mail: () => iconRig((r) => {
      P(r, G.box, { p: [0, 0, 0], s: [0.9, 0.6, 0.06], c: '#f4ead8', c2: '#d8c8a8' });
      for (const s of [-1, 1]) P(r, G.box, { p: [s * 0.2, 0.08, 0.04], r: [0, 0, s * 0.58], s: [0.55, 0.04, 0.02], c: '#c8b088', ol: false });
      P(r, G.cyl, { p: [0, -0.02, 0.06], r: [PI / 2, 0, 0], s: [0.12, 0.04, 0.12], c: '#c82a3a' });
    }),
    wish: () => iconRig((r) => {
      P(r, G.sphHi, { p: [0, 0.08, 0], s: 0.38, c: '#8a5aff', k: 'glow', i: 1.4 });
      P(r, G.torus(0.5, 0.03, PI * 2, 6, 30), { p: [0, 0.08, 0], r: [1.2, 0.3, 0], c: gold, k: 'metal' });
      P(r, G.lathe('wishbase', [[0.0, -0.55], [0.35, -0.55], [0.3, -0.42], [0.18, -0.32], [0, -0.3]], 18), { c: gold, k: 'metal' });
      for (let i = 0; i < 3; i++) P(r, G.oct, { p: [Math.cos(i * 2.1) * 0.2, 0.15 + Math.sin(i * 2.1) * 0.15, 0.32], s: [0.05, 0.07, 0.02], c: '#ffffff', k: 'glow', i: 2.5 });
    }),
    compass: () => iconRig((r) => {
      P(r, G.cyl, { r: [PI / 2, 0, 0], s: [0.45, 0.12, 0.45], c: gold, c2: '#a8782a', k: 'metal' });
      P(r, G.cyl, { p: [0, 0, 0.065], r: [PI / 2, 0, 0], s: [0.38, 0.02, 0.38], c: '#f4ead8' });
      P(r, G.cone, { p: [0, 0.14, 0.08], s: [0.06, 0.3, 0.02], c: '#d82a2a' });
      P(r, G.cone, { p: [0, -0.14, 0.08], r: [0, 0, PI], s: [0.06, 0.3, 0.02], c: '#3a3a4a' });
    }),
    cog: () => iconRig((r) => {
      P(r, G.cyl, { r: [PI / 2, 0, 0], s: [0.3, 0.16, 0.3], c: '#b8c0d0', c2: '#6a7080', k: 'metal' });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; P(r, G.box, { p: [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0], r: [0, 0, a], s: [0.16, 0.14, 0.14], c: '#a8b0c0', k: 'metal' }); }
      P(r, G.cyl, { p: [0, 0, 0.06], r: [PI / 2, 0, 0], s: [0.1, 0.1, 0.1], c: '#3a3a4a' });
    }),
    swords: () => iconRig((r) => {
      for (const s of [-1, 1]) {
        P(r, G.box, { p: [s * 0.04, 0.08, 0], r: [0, 0, s * 0.75], s: [0.09, 0.85, 0.03], c: '#dfe3ec', k: 'metal' });
        P(r, G.box, { p: [s * 0.24, -0.16, 0.02], r: [0, 0, s * 0.75 + PI / 2], s: [0.07, 0.3, 0.07], c: gold, k: 'metal' });
        P(r, G.cyl, { p: [s * 0.33, -0.26, 0.02], r: [0, 0, s * 0.75], s: [0.04, 0.2, 0.04], c: '#5a2a2a' });
      }
    }),
    star: () => iconRig((r) => {
      const g = G.shape('star5', (s) => { for (let i = 0; i < 10; i++) { const a = PI / 2 + i * PI / 5, rr = i % 2 ? 0.22 : 0.52; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } s.closePath(); }, 0.12);
      P(r, g, { c: '#ffe04a', c2: '#ff9a1a', k: 'metal' });
    }),
    exp: () => iconRig((r) => {
      P(r, G.sphHi, { s: 0.36, c: '#4ad8ff', k: 'glow', i: 1.6 });
      P(r, G.torus(0.42, 0.04, PI * 2, 6, 30), { r: [1.3, 0, 0.3], c: '#c8f4ff', k: 'metal' });
      P(r, G.torus(0.42, 0.04, PI * 2, 6, 30), { r: [0.3, 1.2, 0], c: '#c8f4ff', k: 'metal' });
    }),
  };

  const TIER_COLS = ['#c88a5a', '#d8dce8', '#ffc83a', '#b45aff', '#ff7a2a', '#ff3a6a'];
  const ICONS = {
    potion_g: () => MODELS.potion('#5aff6a'), potion_b: () => MODELS.potion('#4ab8ff'), potion_p: () => MODELS.potion('#d05aff'),
    tonic: () => MODELS.tonic(),
    scroll: () => MODELS.scroll(false), scroll_gold: () => MODELS.scroll(true),
    chest: () => MODELS.chest('#8a4a2a', gold, '#ffd23a'),
    chest_blue: () => MODELS.chest('#2a4a8a', '#c8d0dc', '#7ad8ff'),
    chest_purple: () => MODELS.chest('#5a2a8a', gold, '#e07aff'),
    gems: () => MODELS.gem('#4ad8ff'), gold: () => MODELS.coins(), stamina: () => MODELS.bolt(),
    honor: () => MODELS.medal(), exp: () => MODELS.exp(), star: () => MODELS.star(),
    nav_heroes: () => MODELS.navHeroes(), nav_mastery: () => MODELS.navMastery(), nav_missions: () => MODELS.navMissions(),
    nav_inventory: () => MODELS.navInventory(), nav_shop: () => MODELS.navShop(),
    gift: () => MODELS.gift(), mail: () => MODELS.mail(), wish: () => MODELS.wish(), compass: () => MODELS.compass(),
    cog: () => MODELS.cog(), swords: () => MODELS.swords(),
  };
  ['weapon', 'armor', 'helm', 'charm'].forEach((s) => TIER_COLS.forEach((c, i) => {
    ICONS[`gear_${s}_${i}`] = () => MODELS[s === 'weapon' ? 'sword' : s](c);
  }));
  SH.data.EL_ORDER.forEach((el) => { ICONS['shard_' + el] = () => MODELS.shard(SH.data.ELEMENTS[el].color); });

  SH.icon = function (name, size) {
    size = size || 128;
    const k = 'i_' + name + '_' + size;
    if (cache[k]) return cache[k];
    const make = ICONS[name];
    if (!make) return '';
    const rig = make();
    studio.add(rig.root);
    rig.root.rotation.set(0.12, -0.3, 0);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    cam.fov = 28; cam.aspect = 1; cam.updateProjectionMatrix();
    const dist = sph.radius / Math.sin((28 / 2) * PI / 180) * 1.02;
    cam.position.set(sph.center.x, sph.center.y + dist * 0.18, sph.center.z + dist);
    cam.lookAt(sph.center);
    const url = SH.renderImage(studio, cam, size, size);
    rig.dispose();
    cache[k] = url;
    return url;
  };
  // icon for an item id from js/data.js ITEMS
  SH.itemIcon = function (id) {
    if (id === 'gold' || id === 'gems' || id === 'stamina' || id === 'honor') return SH.icon(id);
    const it = SH.data.ITEMS[id];
    if (!it) return '';
    if (it.slot) return SH.icon(`gear_${it.slot}_${it.tier}`);
    return SH.icon(it.icon);
  };
  SH.iconNames = () => Object.keys(ICONS);
})();
