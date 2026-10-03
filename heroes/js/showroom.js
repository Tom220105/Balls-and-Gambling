/* ==========================================================================
   SLING HEROES — the showroom
   A small 3D stage used by the menus:
   * hero(id)   one hero on a glowing pedestal (hero details). Drag to turn
                the hero, tap it to make it strike a pose.
   * team(ids)  the 4 heroes of a team side by side (team select)
   * altar()    the Wishing Altar for summoning, with the whole reveal show:
                the orb charges, a beam in the colour of the rarity, a flash,
                and the new hero spins in.
   The camera is shifted so the model sits in the free space above the panel.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.world) return;
  const G = SH.G, U = SH.util, W = SH.world, D = SH.data;
  const PI = Math.PI;
  const V3 = THREE.Vector3;
  const C = (c) => new THREE.Color(c);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a2e);
  scene.fog = new THREE.Fog(0x141a2e, 14, 30);
  const camera = new THREE.PerspectiveCamera(32, 0.6, 0.1, 100);
  let fx = null;

  // ------------------------------------------------------------ stage
  let built = false;
  const parts = {};
  function build() {
    if (built) return;
    built = true;
    // backdrop: soft gradient dome with god rays
    const bg = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTint: { value: C('#3a4a8a') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform float uTime; uniform vec3 uTint; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(vec3(0.04, 0.05, 0.1), uTint * 0.55, smoothstep(-0.2, 0.5, h));
          float a = atan(vP.x, vP.z); float rays = smoothstep(0.6, 1.0, sin(a * 9.0 + uTime * 0.2) * 0.5 + 0.5) * smoothstep(0.0, 0.6, h) * 0.25;
          c += uTint * rays * 0.6; c += vec3(1.0, 0.9, 0.7) * pow(max(0.0, 1.0 - length(vec2(a * 0.5, h - 0.35))), 4.0) * 0.12;
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    bg.renderOrder = -10;
    scene.add(bg);
    parts.bg = bg;
    // floor
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x1e2440, roughness: 0.6, metalness: 0.2 }));
    floor.rotation.x = -PI / 2;
    scene.add(floor);
    // pedestals
    const ped = W.bag({ thick: 0.04 });
    ped.add('root', G.cyl, { p: [0, 0.12, 0], s: [1.25, 0.24, 1.25], c: '#e8e2d4', c2: '#a8a090' });
    ped.add('root', G.cyl, { p: [0, 0.3, 0], s: [1.05, 0.14, 1.05], c: '#f4f0e8' });
    ped.add('root', G.torus(1.25, 0.05, PI * 2, 6, 48), { p: [0, 0.24, 0], r: [PI / 2, 0, 0], c: '#f2c040', k: 'metal' });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; ped.add('root', G.oct, { p: [Math.cos(a) * 1.25, 0.12, Math.sin(a) * 1.25], s: [0.06, 0.09, 0.06], c: '#ffd23a', k: 'glow', i: 2 }); }
    ped.build();
    parts.ped = ped.root;
    scene.add(ped.root);
    parts.ring = W.glowRing(1.1, '#ffd23a');
    parts.ring.position.y = 0.38;
    scene.add(parts.ring);
    // small pedestals for the team view
    parts.teamPeds = [];
    for (let i = 0; i < 4; i++) {
      const p = W.bag({ thick: 0.035 });
      p.add('root', G.cyl, { p: [0, 0.08, 0], s: [0.7, 0.16, 0.7], c: '#e8e2d4', c2: '#a8a090' });
      p.add('root', G.torus(0.7, 0.04, PI * 2, 6, 32), { p: [0, 0.16, 0], r: [PI / 2, 0, 0], c: '#f2c040', k: 'metal' });
      p.build();
      p.root.visible = false;
      scene.add(p.root);
      parts.teamPeds.push(p.root);
    }
    // the altar (summon)
    const alt = W.bag({ thick: 0.045 });
    alt.add('root', G.cyl, { p: [0, 0.2, 0], s: [2.4, 0.4, 2.4], c: '#a8a0c8', c2: '#5a5478' });
    alt.add('root', G.cyl, { p: [0, 0.5, 0], s: [1.9, 0.3, 1.9], c: '#c8c0e0', c2: '#7a7098' });
    alt.add('root', G.torus(1.9, 0.06, PI * 2, 6, 48), { p: [0, 0.65, 0], r: [PI / 2, 0, 0], c: '#f2c040', k: 'metal' });
    // pillars only behind the altar, in an arc
    for (let i = 0; i < 5; i++) {
      const a = PI + 0.35 + (i / 4) * (PI - 0.7);
      alt.add('root', G.cyl, { p: [Math.cos(a) * 3.2, 1.8, Math.sin(a) * 2.4 - 1.0], s: [0.18, 3.6, 0.18], c: '#c8c0e0', c2: '#6a6488' });
      alt.add('root', G.cyl, { p: [Math.cos(a) * 3.2, 3.65, Math.sin(a) * 2.4 - 1.0], s: [0.3, 0.14, 0.3], c: '#f2c040', k: 'metal' });
      alt.add('root', G.oct, { p: [Math.cos(a) * 3.2, 4.0, Math.sin(a) * 2.4 - 1.0], s: [0.18, 0.3, 0.18], c: '#c87aff', k: 'glow', i: 2.2 });
    }
    alt.bone('orb', 'root', 0, 2.2, 0);
    alt.add('orb', G.sphHi, { s: 0.55, c: '#9a5aff', k: 'glow', i: 1.6 });
    alt.add('orb', G.sph, { s: 0.3, c: '#ffffff', k: 'glow', i: 2.5 });
    alt.bone('rings', 'orb', 0, 0, 0);
    alt.add('rings', G.torus(0.9, 0.035, PI * 2, 6, 40), { r: [1.2, 0, 0], c: '#f2c040', k: 'metal' });
    alt.add('rings', G.torus(1.05, 0.03, PI * 2, 6, 40), { r: [0.3, 1.1, 0], c: '#f2c040', k: 'metal' });
    alt.build();
    alt.root.visible = false;
    scene.add(alt.root);
    parts.altar = alt;
    // lights
    scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x2a2030, 0.45));
    const key = new THREE.DirectionalLight(0xfff0e0, 0.85);
    key.position.set(3, 6, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8ab8ff, 0.9);
    rim.position.set(-5, 4, -5);
    scene.add(rim);
    parts.spot = new THREE.PointLight(0xffd8a0, 0.45, 10, 2);
    parts.spot.position.set(0, 4, 2);
    scene.add(parts.spot);
    parts.motes = W.ambient('sparkles', 40, { x0: -4, x1: 4, y0: 0, y1: 5, z0: -3, z1: 3 }, { color: '#ffe8a0', size: 9 });
    scene.add(parts.motes);
    fx = new SH.FX(scene);
  }

  // ------------------------------------------------------------ modes
  let mode = 'hero', rigs = [], spin = 0, spinV = 0, drag = null, offsetY = 0.22, camDist = 6.4;
  let summon = null;
  function clearRigs() { rigs.forEach((r) => r.dispose()); rigs = []; }
  function setMode(m) {
    build();
    mode = m;
    parts.ped.visible = m === 'hero';
    parts.ring.visible = m === 'hero';
    parts.teamPeds.forEach((p) => { p.visible = m === 'team'; });
    parts.altar.root.visible = m === 'altar';
  }
  const view = {
    scene, camera, alwaysRender: true,
    hero(id, opts) {
      setMode('hero');
      clearRigs();
      const rig = SH.buildHero(D.HERO[id].look);
      rig.root.position.y = 0.37;
      scene.add(rig.root);
      rigs.push(rig);
      const el = D.HERO[id].el;
      const ec = C(D.ELEMENTS[el].color);
      parts.ring.material.color.copy(ec).multiplyScalar(2);
      parts.bg.material.uniforms.uTint.value.copy(ec).lerp(C('#3a4a8a'), 0.5);
      parts.spot.color.copy(ec).lerp(C('#ffffff'), 0.6);
      spin = -0.25; spinV = 0;
      offsetY = (opts && opts.offset) || 0.2;
      camDist = 11.5;
      if (opts && opts.burst) { fx.burst(new V3(0, 1, 0), { n: 40, color: ec, speed: 5, life: 0.9, size: 50, cell: 1 }); fx.ring(new V3(0, 0.4, 0), { color: ec, r1: 3, life: 0.6 }); }
    },
    team(ids) {
      setMode('team');
      clearRigs();
      ids.forEach((id, i) => {
        const x = (i - 1.5) * 1.55;
        parts.teamPeds[i].position.set(x, 0, -Math.abs(i - 1.5) * 0.25);
        if (!id) return;
        const rig = SH.buildHero(D.HERO[id].look);
        rig.root.position.set(x, 0.16, -Math.abs(i - 1.5) * 0.25);
        rig.root.rotation.y = -x * 0.12;
        scene.add(rig.root);
        rigs.push(rig);
      });
      parts.bg.material.uniforms.uTint.value.set('#3a4a8a');
      spin = 0; offsetY = 0.25;
      camDist = Math.max(13, 6.8 / (camera.aspect * 2 * Math.tan((camera.fov / 2) * PI / 180)));
    },
    altar() {
      setMode('altar');
      clearRigs();
      parts.bg.material.uniforms.uTint.value.set('#5a2a9a');
      spin = 0; offsetY = 0.08; camDist = 11;
      parts.altar.bones.orb.visible = true;
      summon = null;
    },
    // the reveal show. results: [{hero, isNew}], done(): called when the last hero is shown
    playSummon(results, onHero, done) {
      const orb = parts.altar.bones.orb;
      const best = Math.max(...results.map((r) => D.RARITY_ORDER.indexOf(D.HERO[r.hero].rarity)));
      const colors = ['#7ab8ff', '#c07aff', '#ffc040', '#ff4a6a'];
      summon = { t: 0, phase: 'charge', results, idx: 0, best, color: C(colors[best]), onHero, done, colors };
      SH.audio.sfx.summon();
    },
    nextSummon() {
      if (!summon || summon.phase !== 'show') return false;
      summon.idx++;
      if (summon.idx >= summon.results.length) { summon.phase = 'end'; clearRigs(); parts.altar.bones.orb.visible = true; if (summon.done) summon.done(); summon = null; return true; }
      summon.phase = 'flash'; summon.t = 0;
      return true;
    },
    skipSummon() { if (summon) { const d = summon.done; summon = null; clearRigs(); setMode('altar'); parts.altar.bones.orb.visible = true; if (d) d(); } },
    pose() { if (rigs[0]) { rigs[0].state = 'cast'; setTimeout(() => { if (rigs[0]) rigs[0].state = 'idle'; }, 900); fx.burst(new V3(0, 1.4, 0), { n: 25, color: 0xffe08a, speed: 4, size: 40 }); SH.audio.sfx.whoosh(); } },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    pointerDown(p) { drag = { x: p.x, y: p.y, s: spin, moved: 0 }; },
    pointerMove(p) { if (!drag || mode !== 'hero') return; const dx = p.x - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx)); spinV = (drag.s + dx * 0.012 - spin) * 30; spin = drag.s + dx * 0.012; },
    pointerUp() {
      if (drag && drag.moved < 6) {
        if (mode === 'hero') view.pose();
        if (summon && summon.phase === 'show' && SH.onSummonTap) SH.onSummonTap();
      }
      drag = null;
    },
    enter() { build(); },
    exit() { clearRigs(); if (fx) fx.clear(); summon = null; },
    update(dt) {
      if (!built) return;
      parts.bg.material.uniforms.uTime.value += dt;
      parts.motes.userData.update(dt);
      if (!drag) { spin += spinV * dt; spinV *= Math.exp(-dt * 4); }
      if (mode === 'hero' && rigs[0]) { rigs[0].root.rotation.y = spin; parts.ring.rotation.z += dt * 0.5; }
      rigs.forEach((r) => r.update(dt));
      if (mode === 'altar') updateAltar(dt);
      fx.update(dt);
      // camera with a view offset: the subject sits in the upper part of the screen
      const target = mode === 'team' ? new V3(0, 1.0, 0) : mode === 'altar' ? new V3(0, 2.0, 0) : new V3(0, 1.15, 0);
      camera.position.set(Math.sin(SH.time * 0.2) * 0.15, target.y + (mode === 'altar' ? 1.5 : 0.65), camDist);
      camera.lookAt(target);
      const w = SH.size.w, h = SH.size.h;
      camera.setViewOffset(w, h, 0, h * offsetY, w, h);
    },
    warm() { build(); parts.altar.root.visible = true; fx.warm(); SH.warm(scene, camera); fx.unwarm(); parts.altar.root.visible = false; },
  };

  function updateAltar(dt) {
    const A = parts.altar;
    A.bones.orb.position.y = 2.2 + Math.sin(SH.time * 1.5) * 0.12;
    A.bones.rings.rotation.y += dt * (summon && summon.phase === 'charge' ? 6 : 0.8);
    A.bones.rings.rotation.x += dt * 0.4;
    if (!summon) return;
    const S = summon;
    S.t += dt;
    const orbP = new V3(0, A.bones.orb.position.y, 0);
    if (S.phase === 'charge') {
      // particles fly into the orb
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * PI * 2, r = 3 + Math.random() * 2;
        const p = new V3(Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r);
        const v = orbP.clone().sub(p).multiplyScalar(1.8);
        fx.spark(p, v, { color: S.t > 1.2 ? S.color : 0xb08aff, life: 0.55, size: 35, size1: 10, cell: 0, glow: 2.5 });
      }
      A.bones.orb.scale.setScalar(1 + S.t * 0.25 + Math.sin(S.t * 30) * 0.03 * S.t);
      if (S.t > 1.8) {
        S.phase = 'flash'; S.t = 0;
        fx.pillar(new V3(0, 0, 0), { color: S.color, r: 1.4, h: 16, life: 1.4 });
        A.bones.orb.scale.setScalar(1);
      }
    } else if (S.phase === 'flash') {
      if (S.t < dt * 1.5) {
        const r = S.results[S.idx];
        const rar = D.RARITY_ORDER.indexOf(D.HERO[r.hero].rarity);
        const col = C(S.colors[rar]);
        SH.flash(0.55, col.getHex(), 3);
        fx.flash(orbP, { color: col, size: 6, life: 0.5, light: 6 });
        fx.ring(new V3(0, 0.6, 0), { color: col, r1: 5, life: 0.7, width: 0.3 });
        fx.burst(orbP, { n: 80 + rar * 40, color: col, speed: 9, life: 1.2, size: 55, cell: rar >= 2 ? 4 : 1, grav: 3 });
        if (rar >= 2) fx.pillar(new V3(0, 0, 0), { color: col, r: 1.1, h: 16, life: 1.2 });
        SH.audio.sfx.reveal(rar);
        clearRigs();
        const rig = SH.buildHero(D.HERO[r.hero].look);
        rig.root.position.set(0, 0.65, 1.2);
        parts.altar.bones.orb.visible = false;
        rig.root.scale.multiplyScalar(0.01);
        rig.state = 'win';
        scene.add(rig.root);
        rigs.push(rig);
        S.rig = rig; S.base = rig.scale;
      }
      const k = Math.min(1, S.t / 0.6);
      if (S.rig) {
        S.rig.root.scale.setScalar(S.base * U.easeOutBack(k) * 1.15);
        S.rig.root.rotation.y = (1 - k) * PI * 4;
      }
      if (S.t > 0.7) { S.phase = 'show'; S.t = 0; if (S.rig) S.rig.state = 'idle'; if (S.onHero) S.onHero(S.results[S.idx], S.idx); }
    } else if (S.phase === 'show') {
      if (S.rig) S.rig.root.rotation.y = Math.sin(S.t * 0.8) * 0.4;
      if (Math.random() < dt * 10) fx.spark(new V3((Math.random() - 0.5) * 2, Math.random() * 3, 0.4), new V3(0, 1, 0), { color: S.color, life: 1, size: 25, cell: 4 });
    }
  }

  SH.registerView('showroom', view);
  SH.showroom = view;
})();
