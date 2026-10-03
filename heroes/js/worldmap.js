/* ==========================================================================
   SLING HEROES — the campaign map
   Every chapter is a little 3D diorama in its own theme (woods, frost,
   desert, crypt, lava, sunken temple). A glowing path winds through 8
   stages; each stage stands on a pedestal with a small 3D figure of its
   monster (the boss stage is bigger). Drag up / down to look along the path,
   tap a stage to see its enemies and start the fight.
   SH.THEMES holds the colours that the battle arenas use too.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.world) return;
  const G = SH.G, U = SH.util, W = SH.world, D = SH.data;
  const PI = Math.PI;
  const V3 = THREE.Vector3;
  const C = (c) => new THREE.Color(c);
  const shade = (c, k) => C(c).multiplyScalar(k);

  const THEMES = (SH.THEMES = {
    forest: { g1: '#5aae46', g2: '#3d8c38', path: '#e2c088', rock: '#9a948a', fog: '#a8d8f0', sky: ['#4a8ae0', '#d8f0ff'], hemi: [0xd8ecff, 0x5a4a2a, 0.6], sun: [0xfff0d8, 1.0], amb: 'leaves', tree: '#4aa83a', floor: ['#7a8a5a', '#4a5a3a'], crack: '#8aff6a', crackK: 0.0, wall: '#6a6a5a' },
    frost: { g1: '#eef4fc', g2: '#b8cce4', path: '#9ab8d8', rock: '#a8b8cc', fog: '#d8e8f8', sky: ['#7aa8e0', '#f0f8ff'], hemi: [0xe8f4ff, 0x6a7a9a, 0.7], sun: [0xf0f6ff, 0.95], amb: 'snow', tree: '#2a6a5a', floor: ['#c8dcf0', '#8aa8c8'], crack: '#7ae8ff', crackK: 0.6, wall: '#a8c0d8' },
    desert: { g1: '#ecc87a', g2: '#c8a050', path: '#b8884a', rock: '#c8986a', fog: '#f4dcb0', sky: ['#5a98e0', '#ffe8c0'], hemi: [0xfff0d8, 0x8a6a3a, 0.65], sun: [0xfff0c8, 1.1], amb: 'sand', tree: '#6a9a3a', floor: ['#d8b07a', '#a8804a'], crack: '#ffb43a', crackK: 0.2, wall: '#c8a06a' },
    crypt: { g1: '#5a4a6a', g2: '#2e2638', path: '#7a6a8a', rock: '#6a6478', fog: '#2a2238', sky: ['#1a1430', '#4a3a6a'], hemi: [0x9a8ad8, 0x1a1020, 0.55], sun: [0xc8b8ff, 0.6], amb: 'spores', tree: '#4a3a5a', floor: ['#5a5068', '#2a2434'], crack: '#b07aff', crackK: 0.8, wall: '#4a4458' },
    lava: { g1: '#4a3430', g2: '#1e1414', path: '#6a3a2a', rock: '#3a2a2a', fog: '#3a1410', sky: ['#2a0a08', '#8a2a10'], hemi: [0xff9a6a, 0x200808, 0.5], sun: [0xffb08a, 0.75], amb: 'embers', tree: '#3a2a2a', floor: ['#5a2e24', '#2a1410'], crack: '#ff6a1a', crackK: 1.6, wall: '#2a1a1a' },
    abyss: { g1: '#2a7a8a', g2: '#1a3a5a', path: '#5aa8b8', rock: '#3a5a6a', fog: '#0a3a5a', sky: ['#062038', '#1a6a8a'], hemi: [0x8ae8ff, 0x0a1a2a, 0.6], sun: [0xbff0ff, 0.7], amb: 'bubbles', tree: '#ff6a8a', floor: ['#3a7a8a', '#1a3a4a'], crack: '#5af0ff', crackK: 0.9, wall: '#2a4a5a' },
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 0.6, 0.5, 400);
  let group = null, fx = null, ambient = null, sky = null, hemi = null, sun = null, water = null;
  let chapter = 1, nodes = [], camZ = 6, velZ = 0, drag = null;
  const updaters = [];
  const labels = U.el('div', '');
  labels.style.cssText = 'position:absolute;inset:0;pointer-events:none';

  // path through the 8 stages, bottom to top
  const pathPts = (seed) => {
    const r = U.rng(seed);
    const pts = [];
    for (let i = 0; i < D.STAGES_PER_CHAPTER; i++) {
      const t = i / (D.STAGES_PER_CHAPTER - 1);
      pts.push(new V3((i % 2 ? 1 : -1) * (1.8 + r() * 1.3) * (i === D.STAGES_PER_CHAPTER - 1 ? 0 : 1), 0, 10.5 - t * 22));
    }
    return pts;
  };
  function groundH(x, z, theme) {
    let h = W.fbm(x * 0.12 + 5, z * 0.12, 3) * 1.6;
    if (theme === 'desert') h = Math.sin(x * 0.3 + z * 0.15) * 0.8 + W.fbm(x * 0.1, z * 0.1, 2);
    if (theme === 'frost') h += Math.max(0, Math.abs(x) - 6) * 0.9;
    else h += Math.max(0, Math.abs(x) - 7) * 0.6;
    return h;
  }

  function build(ch) {
    if (group) {
      scene.remove(group);
      group.traverse((o) => { if (o.isMesh || o.isPoints) { o.geometry.dispose(); } });
      nodes.forEach((n) => { if (n.rig) n.rig.dispose(); });
      updaters.length = 0;
    }
    nodes = [];
    labels.innerHTML = '';
    chapter = ch;
    const C0 = D.CHAPTERS[ch - 1];
    const T = THEMES[C0.theme];
    group = new THREE.Group();
    scene.add(group);
    scene.fog = new THREE.Fog(T.fog, 55, 130);
    scene.background = C(T.fog);
    if (!sky) { sky = W.sky({}); scene.add(sky); }
    sky.material.uniforms.uTop.value.set(T.sky[0]);
    sky.material.uniforms.uHor.value.set(T.sky[1]);
    sky.material.uniforms.uLow.value.set(T.fog);
    if (!hemi) { hemi = new THREE.HemisphereLight(); scene.add(hemi); sun = new THREE.DirectionalLight(); sun.position.set(8, 20, 10); scene.add(sun); }
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2] * 0.85;
    sun.color.set(T.sun[0]); sun.intensity = T.sun[1] * 0.9;
    if (!fx) fx = new SH.FX(scene);

    const pts = pathPts(ch * 97 + 3);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    // ground
    const g = new THREE.PlaneGeometry(40, 46, 100, 115);
    g.rotateX(-PI / 2);
    const p = g.attributes.position;
    const samples = curve.getSpacedPoints(200);
    const pathD = (x, z) => { let d = 99; for (const s of samples) { const dd = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z); if (dd < d) d = dd; } return Math.sqrt(d); };
    const col = new Float32Array(p.count * 3);
    const c1 = C(T.g1).multiplyScalar(0.82), c2 = C(T.g2).multiplyScalar(0.8), cp = C(T.path).multiplyScalar(0.85), tc = new THREE.Color();
    const c3 = C(T.g1).lerp(C('#e8d870'), 0.35).multiplyScalar(0.85);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const pd = pathD(x, z);
      let h = groundH(x, z, C0.theme);
      h *= U.smooth(U.clamp((pd - 0.6) / 2.2, 0, 1));
      if (C0.theme === 'lava' && W.fbm(x * 0.15 + 2, z * 0.15, 2) > 0.18 && pd > 2.2) h -= 1.0;
      p.setY(i, h);
      tc.copy(c1).lerp(c2, U.clamp(W.fbm(x * 0.2, z * 0.2, 3) * 1.5 + 0.5, 0, 1));
      tc.lerp(c3, U.clamp(W.fbm(x * 0.07 + 9, z * 0.07, 2) * 2.2, 0, 0.55));
      tc.lerp(cp, U.smooth(U.clamp((1.3 - pd) / 0.5, 0, 1)));
      col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
    }
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    // water / lava pools
    if (C0.theme === 'lava' || C0.theme === 'forest' || C0.theme === 'frost' || C0.theme === 'abyss') {
      const lava = C0.theme === 'lava';
      const wm = W.waterMat(lava ? { deep: '#ff3a0a', shallow: '#ffc040', sky: '#ff7a1a', foam: '#fff0a0', emissive: 1.2, scale: 0.08 }
        : C0.theme === 'frost' ? { deep: '#4a8ac8', shallow: '#bfe8ff', sky: '#ffffff', scale: 0.06 }
          : C0.theme === 'abyss' ? { deep: '#0a3a6a', shallow: '#2ab8c8', sky: '#5ae8ff', scale: 0.06 } : { deep: '#1a6aa8', shallow: '#3ac8c8', sky: '#d8f0ff', scale: 0.06 });
      water = new THREE.Mesh(new THREE.PlaneGeometry(60, 70), wm);
      water.rotation.x = -PI / 2;
      water.position.y = lava ? -0.55 : -0.35;
      group.add(water);
      updaters.push((dt) => { wm.uniforms.uTime.value += dt * (lava ? 0.6 : 1); });
    }
    // path ribbon with glowing dots
    const pathBag = W.bag({ thick: 0.03 });
    const dots = curve.getSpacedPoints(70);
    dots.forEach((d, i) => { if (i % 2 === 0) pathBag.add('root', G.sphLo, { p: [d.x, 0.06, d.z], s: [0.09, 0.04, 0.09], c: '#ffd88a', k: 'glow', i: 1.1, ol: false }); });
    // decor
    const r = U.rng(ch * 31);
    for (let i = 0; i < 300; i++) {
      const x = -19 + r() * 38, z = -22 + r() * 44;
      if (pathD(x, z) < 2.2) continue;
      if (nodesNear(pts, x, z, 2.4)) continue;
      const y = groundH(x, z, C0.theme) * U.smooth(U.clamp((pathD(x, z) - 0.6) / 2.2, 0, 1));
      if (C0.theme === 'lava' && W.fbm(x * 0.15 + 2, z * 0.15, 2) > 0.18) continue;
      decor(pathBag, C0.theme, x, y, z, r, T);
    }
    pathBag.build();
    group.add(pathBag.root);
    // stage nodes
    pts.forEach((pt, i) => {
      const st = i + 1, boss = st === D.STAGES_PER_CHAPTER;
      const node = { st, p: pt.clone(), boss };
      const nb = W.bag({ thick: 0.035 });
      const R = boss ? 1.05 : 0.72;
      nb.add('root', G.cyl, { p: [0, 0.15, 0], s: [R, 0.3, R], c: '#a8a090', c2: '#6a6458' });
      nb.add('root', G.cyl, { p: [0, 0.34, 0], s: [R * 0.85, 0.1, R * 0.85], c: boss ? '#8a3a2a' : '#5a6a8a' });
      nb.add('root', G.torus(R, 0.05, PI * 2, 6, 36), { p: [0, 0.3, 0], r: [PI / 2, 0, 0], c: boss ? '#ff5a3a' : '#f2c040', k: 'metal' });
      nb.build();
      nb.root.position.copy(pt);
      group.add(nb.root);
      node.base = nb.root;
      const ring = W.glowRing(R * 1.15, boss ? '#ff5a3a' : '#ffd23a');
      ring.position.set(pt.x, 0.42, pt.z);
      group.add(ring);
      node.ring = ring;
      // monster figure
      const waves = D.stageWaves(ch, st, 'normal');
      const last = waves[waves.length - 1][0].replace('*', '');
      node.enemy = last;
      const rig = SH.buildMonster(last);
      const k = (boss ? 0.62 : 0.85) / Math.max(0.6, rig.scale) * Math.min(1.5, 2.0 / rig.height);
      rig.root.scale.setScalar(rig.scale * k);
      rig.root.position.set(pt.x, 0.4, pt.z);
      group.add(rig.root);
      node.rig = rig;
      // padlock for locked stages
      const lock = W.bag({ thick: 0.03 });
      lock.add('root', G.box, { p: [0, 0.9, 0], s: [0.5, 0.42, 0.18], c: '#c8a040', k: 'metal' });
      lock.add('root', G.torus(0.16, 0.05, PI, 6, 12), { p: [0, 1.12, 0], c: '#a8a8b0', k: 'metal' });
      lock.build();
      lock.root.position.copy(pt);
      group.add(lock.root);
      node.lock = lock.root;
      // label
      node.label = U.el('div', 'node-lbl', `<div class="nl-n">${ch}-${st}</div><div class="nl-s"></div>`);
      labels.appendChild(node.label);
      // hit target
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.2, R * 1.2, 2.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(pt.x, 1.1, pt.z);
      hit.userData.node = node;
      group.add(hit);
      node.hit = hit;
      nodes.push(node);
    });
    // floating particles
    ambient = W.ambient(T.amb, 70, { x0: -18, x1: 18, y0: 0, y1: 8, z0: -20, z1: 18 });
    group.add(ambient);
    updaters.push(ambient.userData.update);
    const cl = W.clouds(8, { x0: -40, x1: 40, y0: 10, y1: 14, z0: -40, z1: -25 }, { size: 18, opacity: C0.theme === 'lava' || C0.theme === 'crypt' ? 0.35 : 0.85, color: C0.theme === 'lava' ? 0x5a2a20 : C0.theme === 'crypt' ? 0x4a3a6a : 0xffffff });
    group.add(cl);
    updaters.push(cl.userData.update);
    refreshNodes();
    camZ = U.clamp(nodes[Math.max(0, curIdx())].p.z + 4, -4, 6);
  }
  function nodesNear(pts, x, z, d) { return pts.some((p) => Math.hypot(p.x - x, p.z - z) < d); }

  function decor(bag, theme, x, y, z, r, T) {
    const pick = r();
    if (theme === 'forest') {
      if (pick < 0.55) W.tree(bag, x, y, z, 0.7 + r() * 0.5, U.pick(['#4aa83a', '#5ab840', '#3a9a3a', '#e88a3a']), r);
      else if (pick < 0.75) W.pine(bag, x, y, z, 0.8 + r() * 0.5, '#2f7a4a');
      else if (pick < 0.9) W.bush(bag, x, y, z, 0.8, '#3a9a3a', r);
      else W.rock(bag, x, y, z, 0.5, T.rock, r);
    } else if (theme === 'frost') {
      if (pick < 0.6) W.pine(bag, x, y, z, 0.8 + r() * 0.6, '#2a6a5a', true);
      else if (pick < 0.8) W.crystal(bag, x, y, z, 0.6, '#9ae8ff', r);
      else W.rock(bag, x, y, z, 0.6, '#e8f0fa', r);
    } else if (theme === 'desert') {
      if (pick < 0.35) {
        bag.add('root', G.cap(0.2, 0.9), { p: [x, y + 0.65, z], c: '#5a9a3a', c2: '#3a6a2a' });
        bag.add('root', G.cap(0.12, 0.35), { p: [x + 0.3, y + 0.8, z], r: [0, 0, -0.9], c: '#5a9a3a' });
        bag.add('root', G.cap(0.12, 0.3), { p: [x - 0.28, y + 0.95, z], r: [0, 0, 0.9], c: '#5a9a3a' });
      } else if (pick < 0.7) W.rock(bag, x, y, z, 0.6 + r() * 0.5, T.rock, r);
      else if (pick < 0.8) { bag.add('root', G.box, { p: [x, y + 0.8, z], r: [0, r() * 3, 0.15], s: [0.5, 1.6, 0.5], c: '#d8b07a', c2: '#a8804a' }); }
      else W.bush(bag, x, y, z, 0.5, '#8a9a3a', r);
    } else if (theme === 'crypt') {
      if (pick < 0.4) {
        bag.add('root', G.box, { p: [x, y + 0.45, z], r: [0, r() - 0.5, (r() - 0.5) * 0.3], s: [0.5, 0.9, 0.18], c: '#8a8498', c2: '#4a4458' });
        bag.add('root', G.cyl, { p: [x, y + 0.9, z], r: [PI / 2, r() - 0.5, 0], s: [0.25, 0.18, 0.25], c: '#8a8498' });
      } else if (pick < 0.6) W.tree(bag, x, y, z, 0.6, '#3a2a4a', r);
      else if (pick < 0.75) W.crystal(bag, x, y, z, 0.5, '#b07aff', r);
      else if (pick < 0.85) W.lantern(bag, x, y, z, '#9a6aff');
      else W.rock(bag, x, y, z, 0.5, T.rock, r);
    } else if (theme === 'lava') {
      if (pick < 0.45) W.rock(bag, x, y, z, 0.6 + r() * 0.6, '#3a2a2a', r);
      else if (pick < 0.65) W.crystal(bag, x, y, z, 0.5, '#ff6a1a', r);
      else if (pick < 0.8) { bag.add('root', G.cone, { p: [x, y + 0.8, z], s: [0.5, 1.6, 0.5], c: '#2a1a1a', c2: '#4a2a20' }); bag.add('root', G.sphLo, { p: [x, y + 1.62, z], s: 0.18, c: '#ff7a1a', k: 'glow', i: 2.5 }); }
      else W.lantern(bag, x, y, z, '#ff5a1a');
    } else {
      if (pick < 0.4) {
        const cc = U.pick(['#ff6a8a', '#ffb43a', '#c87aff', '#5ae8d8']);
        for (let k = 0; k < 4; k++) bag.add('root', G.cap(0.07, 0.4 + r() * 0.3), { p: [x + (r() - 0.5) * 0.4, y + 0.3, z + (r() - 0.5) * 0.4], r: [(r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6], c: cc, c2: shade(cc, 0.6) });
      } else if (pick < 0.6) W.rock(bag, x, y, z, 0.6, T.rock, r);
      else if (pick < 0.8) { bag.add('root', G.cyl, { p: [x, y + 0.7, z], r: [0, 0, (r() - 0.5) * 0.3], s: [0.25, 1.4, 0.25], c: '#c8d8d8', c2: '#7a9a9a' }); }
      else W.crystal(bag, x, y, z, 0.5, '#5af0ff', r);
    }
  }

  const curIdx = () => nodes.findIndex((n) => SH.game.stageOpen(chapter, n.st, view.diff) && SH.game.stageStars(chapter, n.st, view.diff) === 0);
  function refreshNodes() {
    const ci = curIdx();
    nodes.forEach((n, i) => {
      const open = SH.game.stageOpen(chapter, n.st, view.diff);
      const stars = SH.game.stageStars(chapter, n.st, view.diff);
      n.open = open; n.cur = i === ci;
      n.rig.root.visible = open;
      n.lock.visible = !open;
      n.ring.visible = n.cur;
      n.label.classList.toggle('cur', n.cur);
      n.label.classList.toggle('locked', !open);
      n.label.querySelector('.nl-s').innerHTML = '★'.repeat(stars) + `<span class="off">${'★'.repeat(3 - stars)}</span>`;
    });
  }

  const ray = new THREE.Raycaster();
  const vp = new V3();
  const view = {
    scene, camera, diff: 'normal',
    get chapter() { return chapter; },
    labels,
    show(ch, diff) {
      if (diff) view.diff = diff;
      if (ch !== chapter || !group) build(ch);
      else refreshNodes();
    },
    refresh() { refreshNodes(); },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    pointerDown(p) { drag = { y: p.y, z: camZ, moved: 0, t: performance.now() }; velZ = 0; },
    pointerMove(p) {
      if (!drag) return;
      const dy = p.y - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dy));
      const nz = U.clamp(drag.z - dy * 0.045, -4, 6);
      velZ = (nz - camZ) * 30;
      camZ = nz;
    },
    pointerUp(p) {
      if (!drag) return;
      if (drag.moved < 8) {
        velZ = 0;
        const v = new THREE.Vector2((p.x / SH.size.w) * 2 - 1, -(p.y / SH.size.h) * 2 + 1);
        ray.setFromCamera(v, camera);
        const hits = ray.intersectObjects(nodes.map((n) => n.hit));
        if (hits.length && view.onNode) view.onNode(hits[0].object.userData.node);
      }
      drag = null;
    },
    wheel(e) { velZ += e.deltaY * 0.02; },
    enter() { document.getElementById('world-ui').appendChild(labels); },
    exit() { labels.remove(); },
    update(dt) {
      if (!group) return;
      if (!drag) { camZ = U.clamp(camZ + velZ * dt, -4, 6); velZ *= Math.exp(-dt * 4); }
      camera.position.set(0, 27, camZ + 14);
      camera.lookAt(0, 0, camZ - 2);
      for (const u of updaters) u(dt);
      nodes.forEach((n, i) => {
        n.rig.update(dt);
        n.rig.root.rotation.y = Math.sin(SH.time * 0.7 + i) * 0.3;
        if (n.cur) {
          n.ring.rotation.z += dt;
          n.ring.scale.setScalar(1 + Math.sin(SH.time * 4) * 0.06);
          if (Math.random() < dt * 6) fx.spark(new V3(n.p.x + (Math.random() - 0.5) * 1.6, 0.4, n.p.z + (Math.random() - 0.5) * 1.6), new V3(0, 1.6, 0), { color: 0xffd23a, life: 0.8, size: 28, cell: 4 });
        }
        vp.set(n.p.x, 0, n.p.z + (n.boss ? 1.5 : 1.1)).project(camera);
        const x = (vp.x * 0.5 + 0.5) * SH.size.w, y = (-vp.y * 0.5 + 0.5) * SH.size.h;
        n.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        n.label.style.display = vp.z < 1 ? '' : 'none';
      });
      fx.update(dt);
    },
    warm() { if (!group) build(1); fx.warm(); SH.warm(scene, camera); fx.unwarm(); },
  };
  SH.registerView('map', view);
  SH.worldmap = view;
})();
