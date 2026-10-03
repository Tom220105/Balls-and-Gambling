/* ==========================================================================
   SLING HEROES — the battle
   A marble RPG fight in the style of Hyper Heroes:
   * your 4 heroes stand in the arena. On your turn one hero is slung: drag
     anywhere, pull back and let go. BOUNCE heroes ricochet off walls and
     enemies, PIERCE heroes fly straight through enemies.
   * every contact deals damage. Element advantage (fire > wood > water >
     fire, light <> dark) deals 1.5x, the glowing WEAK spot of a boss 3x.
   * bump into a team mate and its COMBO skill fires (lasers, blasts,
     lightning, homing orbs, heals …).
   * every hero charges a HYPER skill over a few turns. Tap its card when it
     glows: a full screen cut-in plays and the hyper goes off with the shot.
   * enemies show a countdown. At 0 they attack your shared team HP.
   * a stage has 2 or 3 waves; the heroes run on to the next part of the
     arena after each one. The last wave holds the boss.
   SH.battle.start(cfg) runs a fight and calls cfg.onEnd(result).
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.FX) return;
  const G = SH.G, U = SH.util, W = SH.world, D = SH.data;
  const PI = Math.PI;
  const V3 = THREE.Vector3;
  const C = (c) => new THREE.Color(c);
  const { clamp, lerp, rand } = U;
  const $ = U.$;
  const el = U.el;

  // ------------------------------------------------------------ tuning
  const XW = 5.5;            // half width of the field
  const ZH = 8.6;            // half height of the field
  const SECTION = 30;        // distance between the waves' arenas
  const HERO_R = 0.78;
  const VIS = 1.32;          // the 3D models are drawn a bit bigger than their collision circle
  const SPD_K = 0.062;       // launch speed = SPD stat x this (x power)
  const DECEL = 9.5;         // speed lost per second
  const DRAG = 0.12;
  const STOP = 0.6;
  const STEP = 1 / 240;
  const HIT_CD = 0.09;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 0.6, 0.5, 300);
  let fx = null;
  let B = null;              // the running battle
  const vTmp = new V3();

  // ================================================================ arena
  let arena = null;
  function floorMat(T) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 });
    const u = {
      uC1: { value: C(T.floor[0]) }, uC2: { value: C(T.floor[1]) }, uCrack: { value: C(T.crack) }, uCrackK: { value: T.crackK },
      uNoise: { value: SH.tex.noise }, uTime: { value: 0 }, uBoss: { value: new THREE.Vector2(0, -999) }, uBossC: { value: C(T.crack) },
    };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; uniform vec3 uC1, uC2, uCrack, uBossC; uniform float uCrackK, uTime; uniform sampler2D uNoise; uniform vec2 uBoss;
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 wp = vWP.xz;
        vec2 tile = wp / 2.2 + vec2(floor(wp.y / 2.2) * 0.5, 0.0);
        vec2 fid = floor(tile), f = fract(tile);
        float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        float bevel = smoothstep(0.0, 0.08, edge);
        float n = texture2D(uNoise, wp * 0.06).g;
        float n2 = texture2D(uNoise, wp * 0.21 + 0.3).r;
        vec3 base = mix(uC2, uC1, 0.35 + 0.65 * hash2(fid)) * (0.8 + n * 0.4);
        base *= mix(0.45, 1.0, bevel);
        base = mix(base, base * 0.75, smoothstep(0.55, 0.8, n2) * 0.6);
        // edges of the field get darker
        float side = smoothstep(${(XW - 0.5).toFixed(2)}, ${(XW + 1.6).toFixed(2)}, abs(wp.x));
        base *= 1.0 - side * 0.35;
        diffuseColor.rgb *= base;
        `)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float cells = texture2D(uNoise, wp * 0.045).b;
        float crack = smoothstep(0.82, 1.0, 1.0 - cells) * (0.55 + 0.45 * sin(uTime * 2.0 + wp.x * 0.7 + wp.y * 0.5));
        float flow = texture2D(uNoise, wp * 0.09 + vec2(uTime * 0.03, -uTime * 0.05)).g;
        totalEmissiveRadiance += uCrack * crack * uCrackK * (0.6 + flow);
        // magic circle under the boss
        vec2 bd = wp - uBoss; float br = length(bd);
        float ang = atan(bd.y, bd.x);
        float ring = smoothstep(0.06, 0.0, abs(br - 3.2)) + smoothstep(0.05, 0.0, abs(br - 2.7)) + smoothstep(0.04, 0.0, abs(br - 1.4));
        float spokes = smoothstep(0.08, 0.0, abs(sin(ang * 6.0 + uTime * 0.3))) * step(1.4, br) * step(br, 2.7);
        float star = smoothstep(0.05, 0.0, abs(sin(ang * 5.0 - uTime * 0.5) * br - 0.0)) * step(br, 1.4);
        totalEmissiveRadiance += uBossC * (ring + spokes * 0.6 + star * 0.4) * (0.9 + 0.3 * sin(uTime * 3.0)) * 1.4;
        `);
    };
    m.customProgramCacheKey = () => 'arenaFloor';
    return m;
  }

  function buildArena(theme, sections) {
    if (arena) {
      scene.remove(arena.group);
      arena.group.traverse((o) => { if (o.isMesh || o.isPoints) { if (!o.geometry.userData.shared) o.geometry.dispose(); } });
    }
    const T = SH.THEMES[theme];
    const g = new THREE.Group();
    scene.add(g);
    const len = (sections - 1) * SECTION + ZH * 2 + 24;
    const zMid = -((sections - 1) * SECTION) / 2;
    // floor
    const fm = floorMat(T);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(XW * 2 + 9, len, 1, 1), fm);
    floor.rotation.x = -PI / 2;
    floor.position.set(0, 0, zMid);
    floor.receiveShadow = SH.Q.shadows;
    g.add(floor);
    // outside: lava, water or ground
    const lava = theme === 'lava';
    if (lava || theme === 'abyss' || theme === 'frost' || theme === 'forest') {
      const wm = W.waterMat(lava ? { deep: '#ff2a08', shallow: '#ffb030', sky: '#ff6a1a', foam: '#fff0a0', emissive: 1.4, scale: 0.08 }
        : theme === 'frost' ? { deep: '#3a7ab8', shallow: '#a8e0ff', sky: '#ffffff', scale: 0.05 }
          : theme === 'abyss' ? { deep: '#062a4a', shallow: '#1a8aa8', sky: '#5ae8ff', scale: 0.06, emissive: 0.3 } : { deep: '#1a5a8a', shallow: '#2ab0b0', sky: '#c8f0ff', scale: 0.05 });
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(14, len), wm);
        w.rotation.x = -PI / 2;
        w.position.set(s * (XW + 4.5 + 7), -0.5, zMid);
        g.add(w);
      }
      arena && (arena.water = null);
      g.userData.water = wm;
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, len + 40), new THREE.MeshStandardMaterial({ color: C(T.g2).multiplyScalar(0.6), roughness: 1 }));
    ground.rotation.x = -PI / 2;
    ground.position.set(0, -0.8, zMid);
    g.add(ground);
    // walls + props along both sides
    const bag = W.bag({ thick: 0.045 });
    const r = U.rng(theme.length * 77 + sections);
    const z0 = 14, z1 = -((sections - 1) * SECTION) - 14;
    for (let z = z0; z > z1; z -= 1.9) {
      for (const s of [-1, 1]) {
        bag.add('root', G.box, { p: [s * (XW + 0.55), 0.18, z], s: [0.5, 0.36, 1.85], c: T.wall, c2: C(T.wall).multiplyScalar(0.6) });
      }
    }
    // section end walls (gates) between arenas
    for (let i = 0; i < sections; i++) {
      const sz = -i * SECTION;
      for (const zz of [sz - ZH - 0.5]) {
        for (const s of [-1, 1]) {
          bag.add('root', G.box, { p: [s * (XW - 1.2), 1.4, zz], s: [1.2, 2.8, 1.0], c: T.wall, c2: C(T.wall).multiplyScalar(0.55) });
          bag.add('root', G.cone, { p: [s * (XW - 1.2), 3.2, zz], s: [0.75, 0.9, 0.75], c: C(T.wall).multiplyScalar(0.8) });
          bag.add('root', G.sphLo, { p: [s * (XW - 1.2), 2.2, zz + 0.52], s: 0.16, c: T.crack, k: 'glow', i: 2.5 });
        }
      }
    }
    for (let z = z0; z > z1; z -= 2.6 + r() * 2) {
      for (const s of [-1, 1]) {
        const x = s * (XW + 1.6 + r() * 2.2);
        prop(bag, theme, x, z, r, T, s);
      }
    }
    bag.build();
    g.add(bag.root);
    // floating particles all along
    const amb = W.ambient(T.amb, 90, { x0: -XW - 3, x1: XW + 3, y0: 0, y1: 8, z0: z1, z1: z0 });
    g.add(amb);
    // braziers: fire sprites that flicker
    const fires = [];
    if (theme !== 'abyss' && theme !== 'frost') {
      for (let i = 0; i < sections; i++) {
        for (const s of [-1, 1]) {
          for (const dz of [-4.5, 4.5]) {
            const f = SH.glowSprite(C(theme === 'crypt' ? '#9a6aff' : '#ff8a2a').multiplyScalar(2), 2.2, 0.9);
            f.position.set(s * (XW + 1.2), 1.6, -i * SECTION + dz);
            g.add(f);
            fires.push(f);
            const pole = W.bag({ thick: 0.04 });
            pole.add('root', G.taper(0.12, 0.2, 8), { p: [0, 0.6, 0], s: [1, 1.2, 1], c: '#3a2a2a' });
            pole.add('root', G.cyl, { p: [0, 1.25, 0], s: [0.35, 0.2, 0.35], c: '#5a4a3a', k: 'metal' });
            pole.build();
            pole.root.position.set(s * (XW + 1.2), 0, -i * SECTION + dz);
            g.add(pole.root);
          }
        }
      }
    }
    arena = { group: g, floor: fm, amb, fires, theme, T, sections };
  }

  function prop(bag, theme, x, z, r, T, s) {
    const p = r();
    const P = (gg, o) => bag.add('root', gg, o);
    if (theme === 'lava') {
      if (p < 0.35) { // demon statue head
        P(G.box, { p: [x, 0.9, z], s: [1.0, 1.8, 1.0], c: '#3a2a2a', c2: '#1a1010' });
        P(G.sph, { p: [x, 2.2, z], s: [0.7, 0.65, 0.65], c: '#4a3030', c2: '#2a1a1a' });
        for (const k of [-1, 1]) { P(G.cone, { p: [x + k * 0.5, 2.7, z], r: [0, 0, -k * 0.6], s: [0.15, 0.6, 0.15], c: '#2a1a1a' }); P(G.sphLo, { p: [x + k * 0.22 - s * 0.35, 2.3, z + 0.1], s: [0.1, 0.07, 0.1], c: '#ff5a1a', k: 'glow', i: 4 }); }
      } else if (p < 0.7) W.rock(bag, x, 0, z, 0.9 + r() * 0.8, '#3a2626', r);
      else { P(G.cone, { p: [x, 1.2, z], s: [0.6, 2.4, 0.6], c: '#2a1a1a', c2: '#4a2a20' }); W.crystal(bag, x + 0.5, 0, z + 0.4, 0.5, '#ff6a1a', r); }
    } else if (theme === 'forest') {
      if (p < 0.5) W.tree(bag, x, 0, z, 0.9 + r() * 0.5, U.pick(['#4aa83a', '#5ab840', '#3a9a3a']), r);
      else if (p < 0.75) W.bush(bag, x, 0, z, 1.0, '#3a9a3a', r);
      else if (p < 0.9) W.rock(bag, x, 0, z, 0.7, '#8a8a80', r);
      else W.flowers(bag, x, 0, z, 6, r);
    } else if (theme === 'frost') {
      if (p < 0.45) W.pine(bag, x, 0, z, 1.0 + r() * 0.5, '#2a6a5a', true);
      else if (p < 0.8) W.crystal(bag, x, 0, z, 0.8 + r() * 0.4, '#9ae8ff', r);
      else W.rock(bag, x, 0, z, 0.8, '#e8f0fa', r);
    } else if (theme === 'desert') {
      if (p < 0.4) { P(G.cyl, { p: [x, 1.2, z], s: [0.4, 2.4, 0.4], c: '#e0c08a', c2: '#a8804a' }); P(G.box, { p: [x, 2.5, z], s: [0.9, 0.25, 0.9], c: '#d8b07a' }); }
      else if (p < 0.7) W.rock(bag, x, 0, z, 0.8 + r() * 0.5, '#c8986a', r);
      else { P(G.cap(0.22, 1.0), { p: [x, 0.75, z], c: '#5a9a3a', c2: '#3a6a2a' }); P(G.cap(0.13, 0.4), { p: [x + 0.32, 0.95, z], r: [0, 0, -0.9], c: '#5a9a3a' }); }
    } else if (theme === 'crypt') {
      if (p < 0.4) { P(G.box, { p: [x, 0.55, z], r: [0, r() - 0.5, (r() - 0.5) * 0.25], s: [0.6, 1.1, 0.2], c: '#8a8498', c2: '#4a4458' }); P(G.cyl, { p: [x, 1.1, z], r: [PI / 2, 0, 0], s: [0.3, 0.2, 0.3], c: '#8a8498' }); }
      else if (p < 0.7) { P(G.box, { p: [x, 1.6, z], s: [0.7, 3.2, 0.7], c: '#5a5468', c2: '#2a2434' }); P(G.cone, { p: [x, 3.6, z], s: [0.5, 0.9, 0.5], c: '#4a4458' }); P(G.sphLo, { p: [x - s * 0.4, 2.4, z], s: 0.14, c: '#b07aff', k: 'glow', i: 3 }); }
      else W.crystal(bag, x, 0, z, 0.6, '#b07aff', r);
    } else {
      if (p < 0.4) { const cc = U.pick(['#ff6a8a', '#ffb43a', '#c87aff', '#5ae8d8']); for (let k = 0; k < 5; k++) P(G.cap(0.09, 0.6 + r() * 0.5), { p: [x + (r() - 0.5) * 0.6, 0.45, z + (r() - 0.5) * 0.6], r: [(r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6], c: cc, c2: C(cc).multiplyScalar(0.6) }); }
      else if (p < 0.7) { P(G.cyl, { p: [x, 1.4, z], r: [0, 0, (r() - 0.5) * 0.2], s: [0.35, 2.8, 0.35], c: '#c8d8d8', c2: '#6a8a8a' }); P(G.box, { p: [x, 2.9, z], s: [0.8, 0.25, 0.8], c: '#a8c0c0' }); P(G.oct, { p: [x - s * 0.36, 1.6, z], s: [0.1, 0.18, 0.1], c: '#5af0ff', k: 'glow', i: 2.5 }); }
      else W.crystal(bag, x, 0, z, 0.6, '#5af0ff', r);
    }
  }

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(6, 18, 10);
  scene.add(sun);
  scene.add(sun.target);
  if (SH.Q.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = sun.shadow.camera;
    s.left = -9; s.right = 9; s.top = 12; s.bottom = -12; s.near = 1; s.far = 50;
    sun.shadow.bias = -0.001;
  }

  // ================================================================ aim visuals
  const aim = (() => {
    const g = new THREE.Group();
    const arrowMat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(1, 1, 1) }, uT: { value: 0 }, uP: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uC; uniform float uT, uP; varying vec2 vUv;
        void main(){ float w = abs(vUv.x - 0.5) * 2.0; float shaft = step(vUv.y, 0.78) * smoothstep(0.42, 0.3, w);
          float head = step(0.78, vUv.y) * step(w, (1.0 - vUv.y) / 0.22);
          float a = max(shaft, head);
          float stripes = 0.65 + 0.35 * step(0.5, fract(vUv.y * 6.0 - uT * 2.5));
          gl_FragColor = vec4(uC * (1.2 + uP) * stripes, a * (0.55 + vUv.y * 0.45)); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), arrowMat);
    arrow.geometry.translate(0, 0.5, 0);
    arrow.rotation.x = -PI / 2;
    const arrowG = new THREE.Group();
    arrowG.add(arrow);
    g.add(arrowG);
    // dotted guide line
    const N = 40;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const dots = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, map: SH.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    dots.frustumCulled = false;
    g.add(dots);
    const pull = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    pull.rotation.x = -PI / 2;
    g.add(pull);
    g.visible = false;
    scene.add(g);
    return { g, arrowG, arrow, arrowMat, dots, dg, N, pull };
  })();

  // ================================================================ units
  function makeBase(color, r, enemy) {
    const grp = new THREE.Group();
    const sh = SH.blobShadow(r * 1.25, 0.8);
    sh.position.y = 0.02;
    grp.add(sh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 40), new THREE.MeshBasicMaterial({ color: C(color).multiplyScalar(enemy ? 1.6 : 2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -PI / 2;
    ring.position.y = 0.04;
    grp.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 40), new THREE.MeshBasicMaterial({ color: C(color).multiplyScalar(0.6), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -PI / 2;
    disc.position.y = 0.035;
    grp.add(disc);
    grp.userData.ring = ring;
    return grp;
  }

  function heroUnit(id, i) {
    const h = D.HERO[id];
    const st = SH.game.stats(id);
    const rig = SH.buildHero(h.look, { scale: VIS });
    scene.add(rig.root);
    const base = makeBase(D.ELEMENTS[h.el].color, HERO_R, false);
    scene.add(base);
    return {
      kind: 'hero', id, i, h, rig, base, r: HERO_R, x: 0, z: 0, vx: 0, vz: 0, el: h.el, type: h.type,
      atk: st.atk, hpMax: st.hp, spd: st.spd, hyper: 0, charge: h.charge, alive: true, comboUsed: false,
      trailY: 0.6, position: new V3(),
    };
  }

  function enemyUnit(spec, P, mult) {
    const isHero = !!spec.hero;
    let def, rig;
    if (isHero) {
      const h = D.HERO[spec.hero];
      def = { name: h.name, el: h.el, hp: 1.6, atk: 1.0, r: HERO_R, cd: [2, 3], attack: U.pick(['shot', 'melee', 'aoe']), hero: true };
      rig = SH.buildHero(h.look, { scale: VIS });
    } else {
      const id = spec.id;
      def = Object.assign({}, D.ENEMIES[id]);
      rig = SH.buildMonster(id);
      rig.scale *= VIS * 0.95;
      rig.root.scale.setScalar(rig.scale);
    }
    if (spec.elite) { def.hp *= 3.2; def.atk *= 1.3; def.r *= 1.25; def.mini = true; rig.scale *= 1.3; rig.root.scale.setScalar(rig.scale); }
    // bosses fill their big collision circle
    if (!isHero && (def.boss || def.mini) && !spec.elite) {
      const half = { dragon: 1.0, treant: 0.85, golem: 0.75, demonlord: 0.72, demon: 0.7, lich: 0.65, titan: 0.7, crab: 0.8, yeti: 0.65, goblin: 0.55, mummy: 0.55, skeleton: 0.5 }[def.model] || 0.6;
      rig.scale = def.r / half * (def.boss ? 0.95 : 0.85);
      rig.root.scale.setScalar(rig.scale);
    }
    scene.add(rig.root);
    const r = def.r;
    const base = makeBase(def.boss ? '#ff3a2a' : def.mini ? '#ffb43a' : '#ff5a4a', r, true);
    scene.add(base);
    const hp = Math.round(P.hp * def.hp * (mult || 1) * (spec.hpK || 1));
    const u = {
      kind: 'enemy', id: spec.hero || spec.id, def, rig, base, r, x: 0, z: 0, el: def.el, hp, hpMax: hp, atk: Math.round(P.atk * def.atk * (spec.atkK || 1)),
      cdMax: U.randi(def.cd[0], def.cd[1]), cd: 0, alive: true, boss: !!def.boss, mini: !!def.mini, status: {}, hitT: {}, inside: false,
      weakA: Math.random() * PI * 2, position: new V3(), isHero, dying: 0, attacks: 0, immortal: !!spec.immortal,
    };
    u.cd = U.randi(1, u.cdMax);
    return u;
  }

  // ================================================================ HUD
  const hudEl = $('battle-hud');
  let H = {};
  function buildHUD() {
    hudEl.innerHTML = `
      <div class="bh-top">
        <div class="bh-boss" id="bh-boss"><span class="bb-tag">BOSS</span><div class="bar"><b id="bh-bosslag"></b><i id="bh-bossfill"></i><em id="bh-bosstext"></em></div></div>
        <div class="bh-wave flex1" id="bh-wave"></div>
        <button class="bh-speed" id="bh-speed">1x</button>
        <button class="bh-pause" id="bh-pause">II</button>
      </div>
      <div class="bh-combo" id="bh-combo"><div class="cb-n"><span id="bh-cn">0</span><small>Combo</small></div><div class="cb-d">Damage <span id="bh-cd">0</span></div></div>
      <div class="bh-banner" id="bh-banner"></div>
      <div class="bh-hint hidden" id="bh-hint">Drag back and let go to sling!</div>
      <div class="bh-bottom">
        <div class="bh-hp"><span class="lbl">Team<br>HP</span><div class="bar green" id="bh-hpbar"><i id="bh-hpfill"></i><em id="bh-hptext"></em></div></div>
        <div class="bh-cards"><div class="bh-cards" id="bh-cards" style="flex:1"></div>
          <div class="bh-side"><button class="bh-auto" id="bh-auto">Auto<br>Off</button><div class="bh-rounds" id="bh-rounds"><b id="bh-rn">0</b>Turns</div></div></div>
        <div class="bh-info"><span id="bh-title"></span><span><img src="${SH.icon('gold', 64)}"><b id="bh-coins">0</b></span></div>
      </div>`;
    H = {
      boss: $('bh-boss'), bossFill: $('bh-bossfill'), bossLag: $('bh-bosslag'), bossText: $('bh-bosstext'), wave: $('bh-wave'),
      combo: $('bh-combo'), cn: $('bh-cn'), cd: $('bh-cd'), banner: $('bh-banner'), hint: $('bh-hint'),
      hpbar: $('bh-hpbar'), hpfill: $('bh-hpfill'), hptext: $('bh-hptext'), cards: $('bh-cards'), auto: $('bh-auto'), rn: $('bh-rn'), rounds: $('bh-rounds'),
      title: $('bh-title'), coins: $('bh-coins'), speed: $('bh-speed'),
    };
    $('bh-pause').addEventListener('click', () => { SH.audio.sfx.click(); pauseMenu(); });
    H.speed.addEventListener('click', () => { SH.audio.sfx.click(); SH.settings.speed = SH.settings.speed >= 3 ? 1 : SH.settings.speed + 1; SH.saveSettings(); H.speed.textContent = SH.settings.speed + 'x'; });
    H.speed.textContent = (SH.settings.speed || 1) + 'x';
    H.auto.addEventListener('click', () => { SH.audio.sfx.click(); B.auto = !B.auto; H.auto.classList.toggle('on', B.auto); H.auto.innerHTML = `Auto<br>${B.auto ? 'On' : 'Off'}`; if (B.auto && B.state === 'aim') B.autoT = 0.4; });
    B.heroes.forEach((u, i) => {
      const c = el('div', 'bcard');
      c.appendChild(SH.ui.pf(u.id));
      c.appendChild(el('div', 'bc-fill'));
      c.appendChild(el('div', 'bc-hyper', '0%'));
      c.addEventListener('click', () => tapCard(i));
      H.cards.appendChild(c);
      u.card = c;
    });
    H.title.textContent = B.cfg.title || '';
    hudEl.classList.remove('hidden');
  }
  function banner(text, cls, sub) {
    H.banner.innerHTML = `<span class="bn ${cls || ''}">${text}</span>${sub ? `<span class="bn-sub">${sub}</span>` : ''}`;
  }
  function updateHUD(dt) {
    const hpK = clamp(B.hp / B.hpMax, 0, 1);
    H.hpfill.style.width = (hpK * 100).toFixed(1) + '%';
    H.hptext.textContent = `${U.fmt(Math.max(0, B.hp))} / ${U.fmt(B.hpMax)}`;
    H.hpbar.classList.toggle('low', hpK < 0.3);
    H.hpbar.classList.toggle('shield', B.shield > 0);
    B.heroes.forEach((u) => {
      const ready = u.hyper >= 100;
      u.card.classList.toggle('ready', ready);
      u.card.classList.toggle('active', B.heroes[B.turnIdx] === u && (B.state === 'aim' || B.state === 'dragging'));
      u.card.classList.toggle('armed', !!u.armed);
      u.card.querySelector('.bc-hyper').textContent = Math.floor(u.hyper) + '%';
      u.card.querySelector('.bc-fill').style.height = Math.min(100, u.hyper) + '%';
    });
    const boss = B.enemies.find((e) => e.alive && (e.boss || e.mini));
    H.boss.classList.toggle('on', !!boss);
    if (boss) {
      const k = clamp(boss.hp / boss.hpMax, 0, 1);
      H.bossFill.style.width = (k * 100).toFixed(1) + '%';
      H.bossLag.style.width = (k * 100).toFixed(1) + '%';
      H.bossText.textContent = boss.immortal ? U.fmt(B.damageTotal) : `${boss.def.name}`;
    }
    H.wave.textContent = B.cfg.turnLimit ? `Turns ${Math.max(0, B.cfg.turnLimit - B.turns)}` : `Wave ${B.wave + 1}/${B.waves.length}`;
    if (B.cfg.starRounds) { H.rn.textContent = Math.max(0, B.cfg.starRounds - B.turns); H.rounds.style.opacity = B.cfg.starRounds - B.turns > 0 ? 1 : 0.4; }
    else H.rn.textContent = B.turns;
    H.coins.textContent = U.fmt(B.coins);
    if (B.comboShow > 0) {
      B.comboShow -= dt;
      H.combo.classList.add('on');
      H.cn.textContent = B.combo;
      H.cd.textContent = U.fmt(B.turnDmg);
    } else H.combo.classList.remove('on');
  }
  function comboPop() { H.combo.classList.remove('pop'); void H.combo.offsetWidth; H.combo.classList.add('pop'); }

  // enemy labels: countdown + hp bar
  function enemyLabel(e) {
    const d = el('div', 'elabel', `<div class="el-cd"></div><div class="el-hp"><i></i></div>`);
    d.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
    $('world-ui').appendChild(d);
    e.label = d;
    e.labelCd = d.querySelector('.el-cd');
    e.labelHp = d.querySelector('.el-hp i');
  }

  // ================================================================ start
  function start(cfg) {
    end(true);
    fx = fx || new SH.FX(scene);
    const T = SH.THEMES[cfg.theme] || SH.THEMES.forest;
    buildArena(cfg.theme, cfg.waves.length);
    scene.background = C(T.fog);
    scene.fog = new THREE.Fog(T.fog, 40, 100);
    fitCache = null;
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2] * 1.05;
    sun.color.set(T.sun[0]); sun.intensity = T.sun[1];
    B = {
      cfg, heroes: [], enemies: [], wave: 0, waves: cfg.waves, state: 'intro', t: 0, turnIdx: 0, turns: 0,
      hp: 0, hpMax: 0, shield: 0, combo: 0, maxCombo: 0, turnDmg: 0, damageTotal: 0, comboShow: 0, coins: 0, auto: false, autoT: 0,
      movers: [], projectiles: [], pending: [], shake: 0, camZ: 0, camK: 0, hypersUsed: 0, enemyQ: [], over: false, firstHit: true, boost: 1,
      passives: {}, speedMul: 1,
    };
    // passives of the team
    cfg.team.forEach((id) => {
      const h = D.HERO[id];
      const P = B.passives;
      P[h.passive] = P[h.passive] || [];
      P[h.passive].push({ v: h.pv, el: h.el, id });
    });
    cfg.team.forEach((id, i) => { B.heroes.push(heroUnit(id, i)); SH.splash(id); });
    const hpK = 1 + (B.passives.hpTeam ? B.passives.hpTeam.reduce((s, p) => s + p.v, 0) / 100 : 0);
    B.hpMax = Math.round(B.heroes.reduce((s, u) => s + u.hpMax, 0) * hpK);
    B.hp = B.hpMax;
    // ATK bonus of "Elemental Bond"
    (B.passives.atkEl || []).forEach((p) => B.heroes.forEach((u) => { if (u.el === p.el) u.atk = Math.round(u.atk * (1 + p.v / 100)); }));
    formation(0, true);
    buildHUD();
    spawnWave(0);
    SH.setView('battle');
    B.camZ = 0;
    B.state = 'intro';
    B.t = 0;
    if (SH.music) SH.music.play(cfg.mode === 'campaign' && cfg.boss ? 'boss' : 'battle');
  }

  function formation(wave, instant) {
    const sz = -wave * SECTION;
    const xs = [-3.3, -1.1, 1.1, 3.3];
    B.heroes.forEach((u, i) => {
      const tx = xs[i] * (B.heroes.length < 4 ? 0.8 : 1), tz = sz + ZH - 2.4 - (i % 2) * 0.9;
      u.tx = tx; u.tz = tz;
      if (instant) { u.x = tx; u.z = tz; }
    });
  }

  function spawnWave(w) {
    B.enemies.forEach((e) => removeEnemy(e));
    B.enemies = [];
    const list = B.waves[w];
    const sz = -w * SECTION;
    const P = B.cfg.power;
    const boss = list.find((s) => { const id = s.id; return id && D.ENEMIES[id] && (D.ENEMIES[id].boss || D.ENEMIES[id].mini); }) || list.find((s) => s.elite);
    const others = list.filter((s) => s !== boss);
    const spots = [];
    if (boss) spots.push([0, sz - 3.3]);
    const nO = others.length;
    const layouts = {
      1: [[0, -2]], 2: [[-2.4, -2], [2.4, -2]], 3: [[-3, -3.5], [0, -0.5], [3, -3.5]], 4: [[-3.2, -4], [3.2, -4], [-1.6, 0], [1.6, 0]],
      5: [[-3.4, -4.5], [0, -5.2], [3.4, -4.5], [-2, -0.5], [2, -0.5]], 6: [[-3.4, -5], [0, -5.5], [3.4, -5], [-3.2, -0.8], [0, -1.6], [3.2, -0.8]],
    };
    const bossLayout = { 1: [[0, 1]], 2: [[-3.4, 0.6], [3.4, 0.6]], 3: [[-3.6, 0.2], [0, 1.6], [3.6, 0.2]], 4: [[-3.8, -1], [3.8, -1], [-2, 1.6], [2, 1.6]] };
    const L = boss ? bossLayout[Math.min(4, nO)] || [] : layouts[Math.min(6, nO)] || [];
    others.forEach((s, i) => { const p = L[i] || [rand(-3.5, 3.5), rand(-5, 0)]; spots.push([p[0], sz + p[1]]); });
    const ordered = boss ? [boss, ...others] : others;
    ordered.forEach((s, i) => {
      const e = enemyUnit(s, P, B.cfg.mult);
      e.x = spots[i][0]; e.z = spots[i][1];
      e.drop = 1 + i * 0.12;
      enemyLabel(e);
      B.enemies.push(e);
    });
    if (boss && arena) arena.floor.userData.u.uBoss.value.set(0, sz - 3.3);
    else if (arena) arena.floor.userData.u.uBoss.value.set(0, -999);
    B.bossWave = !!boss;
  }
  function removeEnemy(e) {
    if (e.label) e.label.remove();
    e.rig.dispose();
    scene.remove(e.base);
  }

  function end(silent) {
    if (!B) return;
    B.heroes.forEach((u) => { u.rig.dispose(); scene.remove(u.base); });
    B.enemies.forEach((e) => removeEnemy(e));
    B.projectiles.forEach((p) => { if (p.mesh) scene.remove(p.mesh); });
    if (fx) fx.clear();
    aim.g.visible = false;
    hudEl.classList.add('hidden');
    hudEl.innerHTML = '';
    $('world-ui').querySelectorAll('.elabel').forEach((e) => e.remove());
    SH.numbers.clear();
    SH.timeScale = 1;
    B = null;
  }

  // ================================================================ input
  let dragS = null;
  const plane = new THREE.Plane(new V3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  function ground(p) {
    const v = new THREE.Vector2((p.x / SH.size.w) * 2 - 1, -(p.y / SH.size.h) * 2 + 1);
    ray.setFromCamera(v, camera);
    const out = new V3();
    ray.ray.intersectPlane(plane, out);
    return out;
  }
  function pointerDown(p) {
    if (!B || B.state !== 'aim' || B.auto || B.paused) return;
    dragS = { sx: p.x, sy: p.y, x: p.x, y: p.y };
    B.state = 'dragging';
    H.hint.classList.add('hidden');
  }
  function pointerMove(p) {
    if (!dragS || !B) return;
    dragS.x = p.x; dragS.y = p.y;
  }
  function pointerUp() {
    if (!dragS || !B) return;
    const a = aimFromDrag();
    dragS = null;
    aim.g.visible = false;
    if (!a || a.power < 0.12) { B.state = 'aim'; return; }
    launch(a.dx, a.dz, a.power);
  }
  // pull back in screen space: the launch goes the other way
  function aimFromDrag() {
    if (!dragS) return null;
    const dx = dragS.sx - dragS.x, dy = dragS.sy - dragS.y;
    const len = Math.hypot(dx, dy);
    const maxPull = SH.size.w * 0.32;
    const power = clamp(len / maxPull, 0, 1);
    if (len < 6) return { dx: 0, dz: -1, power: 0 };
    // screen to world direction: screen x -> world x, screen y (down) -> world z (towards the camera)
    const u = B.heroes[B.turnIdx];
    const a = ground({ x: SH.size.w / 2, y: SH.size.h / 2 }), b = ground({ x: SH.size.w / 2 + dx, y: SH.size.h / 2 + dy });
    let wx = b.x - a.x, wz = b.z - a.z;
    const l = Math.hypot(wx, wz) || 1;
    wx /= l; wz /= l;
    return { dx: wx, dz: wz, power: Math.max(0.25, power), raw: power, u };
  }
  function tapCard(i) {
    if (!B || B.paused) return;
    const u = B.heroes[i];
    if (B.heroes[B.turnIdx] !== u || !(B.state === 'aim')) {
      if (u.hyper >= 100) SH.ui.toast(`${u.h.name}'s hyper is ready. Use it on ${u.h.name}'s turn!`);
      return;
    }
    if (u.hyper < 100) { SH.ui.toast(`Hyper ${Math.floor(u.hyper)}%`); return; }
    u.armed = !u.armed;
    SH.audio.sfx[u.armed ? 'ready' : 'back']();
    if (u.armed) { fx.ring(new V3(u.x, 0.1, u.z), { color: 0xffb030, r1: 2.2, life: 0.5 }); fx.burst(new V3(u.x, 1, u.z), { n: 20, color: 0xffd23a, speed: 4, cell: 4 }); }
  }

  // ================================================================ launch
  function launch(dx, dz, power) {
    const u = B.heroes[B.turnIdx];
    H.hint.classList.add('hidden');
    B.state = 'fly';
    B.turns++;
    B.combo = 0; B.turnDmg = 0; B.firstHit = true;
    B.heroes.forEach((h) => { h.comboUsed = false; });
    B.enemies.forEach((e) => { e.hitT = {}; e.inside = {}; });
    const go = () => {
      const empower = u.empower;
      const speed = u.spd * SPD_K * power * (empower ? empower.speedK : 1) * (B.boostNext ? 1.15 : 1);
      u.vx = dx * speed; u.vz = dz * speed;
      u.moving = true;
      u.pierceNow = u.type === 'pierce' || (empower && empower.pierce);
      u.rig.state = 'fly';
      u.trail = fx.trail(u, empower ? empower.color : D.ELEMENTS[u.el].hex, u.type === 'pierce' ? 0.55 : 0.48);
      B.movers = [u];
      SH.audio.sfx.launch();
      fx.ring(new V3(u.x, 0.1, u.z), { color: D.ELEMENTS[u.el].hex, r1: 1.8, life: 0.35 });
      fx.smoke(new V3(u.x, 0.2, u.z), { n: 6, color: 0xbab0a0, size: 80, size1: 160 });
    };
    if (u.armed) {
      u.armed = false;
      u.hyper = 0;
      B.hypersUsed++;
      SH.game.mission('hyper', 1);
      cutIn(u, () => { hyperEffect(u, dx, dz); go(); });
    } else go();
  }

  // full screen hyper cut-in
  function cutIn(u, then) {
    const ci = $('cutin');
    const elc = D.ELEMENTS[u.el].color;
    const hy = D.HYPERS[u.h.hyper];
    ci.style.setProperty('--c1', elc);
    ci.style.setProperty('--c2', '#0a0a18');
    ci.style.setProperty('--c3', elc);
    ci.innerHTML = `<div class="ci-bg"></div><div class="ci-band"></div><div class="ci-lines"></div><img src="${SH.splash(u.id)}"><div class="ci-name"><small>${u.h.name}</small><span>${hy.name}</span></div>`;
    ci.classList.remove('hidden');
    SH.audio.sfx.hyper();
    B.paused = true;
    SH.flash(0.6, elc, 3);
    setTimeout(() => {
      ci.classList.add('hidden');
      ci.innerHTML = '';
      B.paused = false;
      SH.zoomBlur(1.2, 0.5, 0.55, 2.5);
      then();
    }, 1500);
  }

  // ================================================================ damage
  function passiveSum(name) { return (B.passives[name] || []).reduce((s, p) => s + p.v, 0); }
  function damageEnemy(e, raw, opts) {
    if (!e.alive || e.dying) return 0;
    opts = opts || {};
    let dmg = raw;
    let elm = D.elementMod(opts.el, e.el);
    if (elm > 1) elm += passiveSum('critUp') / 100;
    dmg *= elm;
    if (opts.weak) dmg *= 3 * (1 + passiveSum('weak') / 100);
    if (e.boss || e.mini) dmg *= 1 + passiveSum('bossDmg') / 100;
    if (opts.combo) dmg *= 1 + passiveSum('comboUp') / 100;
    if (opts.direct && B.firstHit) { dmg *= 1 + passiveSum('firstHit') / 100; B.firstHit = false; }
    dmg *= rand(0.92, 1.08);
    dmg = Math.max(1, Math.round(dmg));
    if (!e.immortal) e.hp -= dmg;
    B.damageTotal += dmg;
    B.turnDmg += dmg;
    B.combo++;
    B.maxCombo = Math.max(B.maxCombo, B.combo);
    B.comboShow = 2.2;
    comboPop();
    if (B.combo === 30) SH.game.mission('combo', 1);
    e.rig.hit();
    e.shake = 0.25;
    const p = new V3(e.x, e.rig.height * e.rig.root.scale.y * 0.55 + 0.3, e.z);
    const cls = opts.weak ? 'weak' : elm > 1 ? 'crit' : opts.combo ? 'combo' : '';
    SH.numbers.show(p, U.fmt(dmg), cls, opts.weak ? 1.9 : elm > 1 ? 1.55 : opts.combo ? 1.1 : 1.3, camera);
    // lifesteal
    const ls = (B.passives.lifesteal || []).find((x) => x.id === opts.src);
    if (ls) healTeam(dmg * ls.v / 100, true);
    if (opts.empowerHeal) healTeam(dmg * 0.15, true);
    if (e.hp <= 0 && !e.immortal) kill(e);
    return dmg;
  }
  function kill(e) {
    e.alive = false;
    e.dying = 1;
    SH.audio.sfx.boom(e.boss ? 1.4 : 0.7);
    fx.flash(new V3(e.x, 1, e.z), { color: 0xffe0a0, size: e.r * 4, light: 4 });
    fx.burst(new V3(e.x, 0.8, e.z), { n: e.boss ? 120 : 45, color: D.ELEMENTS[e.el].hex, speed: e.boss ? 10 : 6, life: 0.9, size: 50, cell: 1 });
    fx.smoke(new V3(e.x, 0.5, e.z), { n: 10, color: 0x6a6070 });
    fx.ring(new V3(e.x, 0.1, e.z), { color: 0xffd080, r1: e.r * 3, life: 0.5 });
    // coins
    const n = e.boss ? 14 : e.mini ? 8 : 4;
    const per = Math.round((B.cfg.coinK || 30) * (e.boss ? 6 : e.mini ? 3 : 1) / n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * PI * 2, s = rand(2, 5);
      fx.spark(new V3(e.x, 1, e.z), new V3(Math.cos(a) * s, rand(5, 9), Math.sin(a) * s), { color: 0xffc83a, life: 0.9, size: 45, size1: 30, grav: 16, drag: 0.5, cell: 4, glow: 2.5 });
    }
    B.coins += per * n;
    SH.numbers.show(new V3(e.x, 2.2, e.z), '+' + per * n, 'txt', 1.1, camera);
    setTimeout(() => SH.audio.sfx.coin(), 250);
    if (e.boss) { SH.hitStop(0.35, 0.08); SH.flash(0.5, 0xffffff, 2); B.shake = 1; }
    else SH.hitStop(0.06);
  }
  function healTeam(n, quiet) {
    n = Math.round(n);
    if (n <= 0) return;
    B.hp = Math.min(B.hpMax, B.hp + n);
    if (!quiet) {
      SH.audio.sfx.heal();
      B.heroes.forEach((u) => {
        fx.burst(new V3(u.x, 0.6, u.z), { n: 14, color: 0x8aff5a, speed: 2, up: 2, grav: -2, life: 1.0, size: 40, cell: 6 });
      });
      const mid = B.heroes[Math.floor(B.heroes.length / 2)];
      SH.numbers.show(new V3(mid.x, 2.2, mid.z), '+' + U.fmt(n), 'heal', 1.4, camera);
    }
  }
  function hurtTeam(n, target, src) {
    if (B.shield > 0) { n *= 1 - B.shield; B.shield = Math.max(0, B.shield - 0.3); }
    if (B.cfg.mode === 'guild') n *= 0.6;
    n = Math.round(n * rand(0.9, 1.1));
    B.hp -= n;
    SH.audio.sfx.hurt();
    const t = target || U.pick(B.heroes);
    t.rig.hit();
    fx.burst(new V3(t.x, 0.9, t.z), { n: 16, color: 0xff5a3a, speed: 5, size: 40 });
    SH.numbers.show(new V3(t.x, 2.0, t.z), '-' + U.fmt(n), 'hurt', 1.4, camera);
    B.shake = Math.max(B.shake, 0.5);
    SH.flash(0.18, 0xff2a1a, 4);
  }

  // ================================================================ physics
  function step(dt) {
    const sz = -B.wave * SECTION;
    for (const u of B.movers) {
      if (!u.moving) continue;
      const sp = Math.hypot(u.vx, u.vz);
      if (sp < STOP) { u.moving = false; u.vx = u.vz = 0; continue; }
      const ns = Math.max(0, sp - (DECEL + sp * DRAG) * dt);
      u.vx *= ns / sp; u.vz *= ns / sp;
      u.x += u.vx * dt; u.z += u.vz * dt;
      // walls
      let bounced = false;
      if (u.x < -XW + u.r) { u.x = -XW + u.r; u.vx = Math.abs(u.vx); bounced = true; }
      if (u.x > XW - u.r) { u.x = XW - u.r; u.vx = -Math.abs(u.vx); bounced = true; }
      if (u.z < sz - ZH + u.r) { u.z = sz - ZH + u.r; u.vz = Math.abs(u.vz); bounced = true; }
      if (u.z > sz + ZH - u.r) { u.z = sz + ZH - u.r; u.vz = -Math.abs(u.vz); bounced = true; }
      if (bounced) {
        SH.audio.sfx.bounce();
        fx.burst(new V3(u.x, 0.5, u.z), { n: 6, color: 0xffffff, speed: 4, life: 0.3, size: 25 });
      }
      // enemies
      for (const e of B.enemies) {
        if (!e.alive) continue;
        const dx = u.x - e.x, dz = u.z - e.z;
        const d = Math.hypot(dx, dz), rr = u.r + e.r;
        const key = u.ghost ? 'g' + u.ghostId : 'h';
        if (d < rr) {
          const nx = dx / (d || 1), nz = dz / (d || 1);
          const ang = Math.atan2(-nz, -nx);   // where on the enemy we hit
          let diff = Math.abs(((ang - e.weakA) % (PI * 2) + PI * 3) % (PI * 2) - PI);
          const weak = (e.boss || e.mini) && diff < 0.55;
          if (u.pierceNow) {
            const now = B.simT;
            if (!e.inside[key] || now - (e.hitT[key] || 0) > 0.16) {
              e.inside[key] = true;
              e.hitT[key] = now;
              contact(u, e, weak, nx, nz);
            }
          } else {
            const vn = u.vx * nx + u.vz * nz;
            if (vn < 0) {
              u.vx -= 2 * vn * nx; u.vz -= 2 * vn * nz;
              u.vx *= 0.97; u.vz *= 0.97;
            }
            u.x = e.x + nx * rr; u.z = e.z + nz * rr;
            const now = B.simT;
            if (now - (e.hitT[key] || -1) > HIT_CD) { e.hitT[key] = now; contact(u, e, weak, nx, nz); }
          }
        } else if (e.inside[key]) e.inside[key] = false;
      }
      // allies: combo
      if (!u.ghost) {
        for (const a of B.heroes) {
          if (a === u) continue;
          const dx = u.x - a.x, dz = u.z - a.z;
          const d = Math.hypot(dx, dz), rr = u.r + a.r;
          if (d < rr) {
            if (!u.pierceNow) {
              const nx = dx / (d || 1), nz = dz / (d || 1);
              const vn = u.vx * nx + u.vz * nz;
              if (vn < 0) { u.vx -= 2 * vn * nx; u.vz -= 2 * vn * nz; }
              u.x = a.x + nx * rr; u.z = a.z + nz * rr;
            }
            if (!a.comboUsed) { a.comboUsed = true; comboSkill(a, u); }
          }
        }
      }
    }
  }
  function contact(u, e, weak, nx, nz) {
    const src = u.ghost ? u.owner : u;
    let mult = src.type === 'bounce' && !u.pierceNow ? 0.55 : 0.95;
    if (u.empower) mult *= u.empower.mult;
    if (B.boostNext) mult *= 1.3;
    if (u.ghost) mult *= 0.6;
    damageEnemy(e, src.atk * mult, { el: src.el, weak, direct: true, src: src.id, empowerHeal: u.empower && u.empower.heal });
    const hp = new V3(e.x + nx * e.r, 0.8, e.z + nz * e.r);
    const col = weak ? 0xffa030 : D.ELEMENTS[src.el].hex;
    fx.burst(hp, { n: weak ? 24 : 12, color: col, speed: weak ? 8 : 6, life: 0.4, size: weak ? 55 : 40, cell: 1 });
    fx.flash(hp, { color: col, size: weak ? 3 : 1.8, life: 0.15, light: weak ? 4 : 2 });
    if (weak) { SH.audio.sfx.crit(); SH.hitStop(0.07, 0.1); B.shake = Math.max(B.shake, 0.4); fx.ring(hp, { color: 0xffa030, r1: 1.6, life: 0.3, vertical: false }); }
    else SH.audio.sfx.hit(0.8);
    if (u.empower) {
      const em = u.empower;
      if (em.effect === 'freeze') { e.status.freeze = 1; fx.burst(new V3(e.x, 1, e.z), { n: 10, color: 0x9ae8ff, speed: 3, cell: 4 }); }
      if (em.effect === 'burn') e.status.burn = { t: 2, dmg: src.atk * 0.3 };
      if (em.effect === 'wind') {
        const t = B.enemies.filter((x) => x.alive && x !== e);
        if (t.length) { const tt = U.pick(t); fx.beam(new V3(e.x, 0, e.z), new V3(tt.x, 0, tt.z), { color: 0xaaffcc, width: 0.5, life: 0.25 }); damageEnemy(tt, src.atk * 0.5, { el: src.el, combo: true, src: src.id }); }
      }
    }
    if (u === B.heroes[B.turnIdx]) { e.rig.root.position.x += nx * -0.15; }
  }

  // ================================================================ combo skills
  function inLine(e, ax, az, dx, dz, w) {
    const px = e.x - ax, pz = e.z - az;
    const t = px * dx + pz * dz;
    if (t < -e.r) return false;
    const d = Math.abs(px * dz - pz * dx);
    return d < w / 2 + e.r;
  }
  function comboSkill(a, by) {
    const h = a.h, kind = h.combo, pow = h.comboPow;
    const col = D.ELEMENTS[a.el].hex;
    const at = new V3(a.x, 0.6, a.z);
    const dmg = a.atk * pow * 0.6;
    const sz = -B.wave * SECTION;
    SH.audio.sfx.combo(B.combo);
    fx.ring(new V3(a.x, 0.1, a.z), { color: col, r1: 1.6, life: 0.3 });
    a.rig.flash(0.6);
    a.rig.state = 'cast';
    setTimeout(() => { if (a.rig) a.rig.state = 'idle'; }, 500);
    SH.numbers.show(new V3(a.x, 2.4, a.z), D.COMBOS[kind].name, 'txt', 0.95, camera);
    const hit = (e, k) => damageEnemy(e, dmg * (k || 1), { el: a.el, combo: true, src: a.id });
    const alive = () => B.enemies.filter((e) => e.alive);
    const laser = (dx, dz) => {
      // from the ally to the wall in that direction
      let t = 40;
      if (dx > 0) t = Math.min(t, (XW - a.x) / dx); if (dx < 0) t = Math.min(t, (-XW - a.x) / dx);
      if (dz > 0) t = Math.min(t, (sz + ZH - a.z) / dz); if (dz < 0) t = Math.min(t, (sz - ZH - a.z) / dz);
      const end = new V3(a.x + dx * t, 0.6, a.z + dz * t);
      fx.beam(at, end, { color: col, width: 1.0, life: 0.5 });
      alive().forEach((e) => { if (inLine(e, a.x, a.z, dx, dz, 1.0) && Math.hypot(e.x - a.x, e.z - a.z) <= t + e.r) hit(e); });
    };
    switch (kind) {
      case 'laserH': laser(1, 0); laser(-1, 0); SH.audio.sfx.laser(); break;
      case 'laserV': laser(0, 1); laser(0, -1); SH.audio.sfx.laser(); break;
      case 'laserX': laser(1, 0); laser(-1, 0); laser(0, 1); laser(0, -1); SH.audio.sfx.laser(); break;
      case 'laser8': for (let i = 0; i < 8; i++) laser(Math.cos(i * PI / 4), Math.sin(i * PI / 4)); SH.audio.sfx.laser(); break;
      case 'blast':
        fx.flash(at, { color: col, size: 6, life: 0.3, light: 5 });
        fx.ring(new V3(a.x, 0.1, a.z), { color: col, r1: 3.4, life: 0.4, width: 0.4 });
        fx.burst(at, { n: 40, color: col, speed: 8, life: 0.5, size: 50 });
        alive().forEach((e) => { if (Math.hypot(e.x - a.x, e.z - a.z) < 3.4 + e.r) hit(e, 1.3); });
        SH.audio.sfx.boom(0.6);
        break;
      case 'nova':
        fx.ring(new V3(a.x, 0.1, a.z), { color: col, r1: 4.5, life: 0.5, width: 0.2 });
        fx.ring(new V3(a.x, 0.6, a.z), { color: 0xffffff, r1: 4.2, life: 0.45, width: 0.1 });
        alive().forEach((e) => { if (Math.hypot(e.x - a.x, e.z - a.z) < 4.5 + e.r) hit(e, 1.0); });
        SH.audio.sfx.whoosh();
        break;
      case 'homing': for (let i = 0; i < 5; i++) projectile(at, null, { color: col, speed: 14 + i, dmg: dmg * 0.6, src: a, delay: i * 0.07, homing: true, size: 0.35 }); SH.audio.sfx.zap(); break;
      case 'arrows': for (let i = -3; i <= 3; i++) { const ang = -PI / 2 + i * 0.16; projectile(at, null, { color: col, speed: 22, dmg: dmg * 0.7, src: a, dir: [Math.cos(ang), Math.sin(ang)], size: 0.25, pierce: false }); } SH.audio.sfx.whoosh(); break;
      case 'chain': {
        let from = at.clone();
        const done = new Set();
        for (let k = 0; k < 5; k++) {
          const t = alive().filter((e) => !done.has(e)).sort((p, q) => Math.hypot(p.x - from.x, p.z - from.z) - Math.hypot(q.x - from.x, q.z - from.z))[0];
          if (!t) break;
          done.add(t);
          const to = new V3(t.x, 0.8, t.z);
          fx.bolt(from, to, { color: col, life: 0.35 + k * 0.05 });
          hit(t, 0.9);
          from = to;
        }
        SH.audio.sfx.zap();
        break;
      }
      case 'heal': healTeam(B.hpMax * 0.06 * pow); break;
      case 'shield': B.shield = Math.min(0.6, B.shield + 0.3 * pow); SH.audio.sfx.shield(); fx.ring(new V3(a.x, 0.6, a.z), { color: 0x7ad8ff, r1: 2.4, life: 0.6, vertical: true }); break;
      case 'meteor1': {
        const t = alive().sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0];
        if (t) meteor(t.x, t.z, col, dmg * 1.6, a, 0);
        break;
      }
      default: break;
    }
  }

  // projectiles: homing orbs, arrows, meteors, enemy shots
  function projectile(from, target, o) {
    const p = { x: from.x, y: from.y, z: from.z, target, o, t: -(o.delay || 0), life: 3 };
    if (o.dir) { p.vx = o.dir[0] * o.speed; p.vz = o.dir[1] * o.speed; }
    else { const a = Math.random() * PI * 2; p.vx = Math.cos(a) * o.speed * 0.6; p.vz = Math.sin(a) * o.speed * 0.6; }
    p.vy = o.vy || 0;
    B.projectiles.push(p);
    return p;
  }
  function updateProjectiles(dt) {
    for (let i = B.projectiles.length - 1; i >= 0; i--) {
      const p = B.projectiles[i];
      p.t += dt;
      if (p.t < 0) continue;
      const o = p.o;
      p.life -= dt;
      if (o.meteor) {
        p.y += p.vy * dt;
        p.vy -= 30 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt;
        fx.spark(new V3(p.x, p.y, p.z), new V3(rand(-1, 1), 2, rand(-1, 1)), { color: o.color, life: 0.35, size: 70, size1: 20, cell: 0, glow: 2.6 });
        if (Math.random() < 0.5) fx.smoke(new V3(p.x, p.y, p.z), { n: 1, size: 60, size1: 120, life: 0.6, color: 0x5a4a4a });
        if (p.y <= 0.3) {
          B.projectiles.splice(i, 1);
          const at = new V3(p.x, 0.3, p.z);
          fx.flash(at, { color: o.color, size: 5, life: 0.3, light: 6 });
          fx.ring(new V3(p.x, 0.1, p.z), { color: o.color, r1: o.r || 2.2, life: 0.4, width: 0.4 });
          fx.burst(at, { n: 40, color: o.color, speed: 9, life: 0.6, size: 55 });
          fx.smoke(at, { n: 6 });
          SH.audio.sfx.boom(0.6);
          B.shake = Math.max(B.shake, 0.35);
          if (o.enemy) { hurtTeam(o.dmg, o.target); }
          else B.enemies.forEach((e) => { if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < (o.r || 2.2) + e.r) damageEnemy(e, o.dmg, { el: o.src.el, combo: true, src: o.src.id }); });
        }
        continue;
      }
      if (o.enemy) {
        // enemy shot towards a hero
        const t = o.target;
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
        const sp = o.speed;
        p.x += dx / d * sp * dt; p.z += dz / d * sp * dt;
        p.y = 1 + Math.sin(clamp(1 - d / (p.d0 || (p.d0 = d)), 0, 1) * PI) * 1.5;
        fx.spark(new V3(p.x, p.y, p.z), new V3(0, 0.5, 0), { color: o.color, life: 0.3, size: 60, size1: 10, cell: 0, glow: 2.4 });
        if (d < 0.5) {
          B.projectiles.splice(i, 1);
          fx.flash(new V3(t.x, 1, t.z), { color: o.color, size: 3, life: 0.25 });
          hurtTeam(o.dmg, t);
        }
        continue;
      }
      // hero projectiles
      let target = p.target;
      if (o.homing) {
        if (!target || !target.alive) { const al = B.enemies.filter((e) => e.alive); target = p.target = al.length ? U.pick(al) : null; }
        if (target) {
          const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz) || 1;
          const k = Math.min(1, dt * 7);
          p.vx = lerp(p.vx, dx / d * o.speed, k); p.vz = lerp(p.vz, dz / d * o.speed, k);
        }
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      fx.spark(new V3(p.x, 0.8, p.z), new V3(0, 0, 0), { color: o.color, life: 0.18, size: 55 * (o.size || 0.3) * 3, size1: 5, cell: 0, glow: 2.4 });
      const sz = -B.wave * SECTION;
      let done = p.life <= 0 || Math.abs(p.x) > XW + 1 || p.z < sz - ZH - 1 || p.z > sz + ZH + 1;
      for (const e of B.enemies) {
        if (!e.alive || done) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < e.r + 0.3) {
          damageEnemy(e, o.dmg, { el: o.src.el, combo: true, src: o.src.id });
          fx.burst(new V3(p.x, 0.8, p.z), { n: 8, color: o.color, speed: 4, size: 35 });
          if (o.boom) { fx.flash(new V3(p.x, 0.8, p.z), { color: o.color, size: 3, life: 0.2 }); B.enemies.forEach((x) => { if (x !== e && x.alive && Math.hypot(x.x - p.x, x.z - p.z) < 2) damageEnemy(x, o.dmg * 0.5, { el: o.src.el, combo: true, src: o.src.id }); }); }
          if (!o.pierce) done = true;
        }
      }
      if (done) B.projectiles.splice(i, 1);
    }
  }
  function meteor(x, z, color, dmg, src, delay, r) {
    projectile(new V3(x - 3, 14, z - 4), null, { meteor: true, color, dmg, src, delay, r });
    const p = B.projectiles[B.projectiles.length - 1];
    const T = 0.7;
    p.vx = 3 / T; p.vz = 4 / T; p.vy = (0.3 - 14 + 15 * T * T) / T;
  }

  // ================================================================ hyper skills
  function hyperEffect(u, dx, dz) {
    const hy = D.HYPERS[u.h.hyper];
    const col = D.ELEMENTS[u.el].hex;
    const alive = () => B.enemies.filter((e) => e.alive);
    const at = new V3(u.x, 0.6, u.z);
    u.rig.state = 'cast';
    fx.pillar(new V3(u.x, 0, u.z), { color: col, r: 1.2, h: 10, life: 1.0 });
    fx.ring(new V3(u.x, 0.1, u.z), { color: col, r1: 4, life: 0.6, width: 0.4 });
    switch (hy.kind) {
      case 'empower': {
        const effect = { inferno: 'burn', glacier: 'freeze', reaper: 'heal', windslash: 'wind' }[u.h.hyper];
        u.empower = { mult: 2.5, pierce: true, speedK: effect === 'wind' ? 1.6 : 1.3, color: effect === 'freeze' ? 0x9ae8ff : effect === 'heal' ? 0x7affc8 : effect === 'wind' ? 0xaaffcc : 0xff7a1a, effect, heal: effect === 'heal' };
        break;
      }
      case 'burst': {
        fx.flash(at, { color: col, size: 8, life: 0.4, light: 8 });
        fx.burst(at, { n: 70, color: col, speed: 11, life: 0.7, size: 60 });
        fx.ring(new V3(u.x, 0.1, u.z), { color: col, r1: 4, life: 0.45, width: 0.5 });
        alive().forEach((e) => { if (Math.hypot(e.x - u.x, e.z - u.z) < 4 + e.r) damageEnemy(e, u.atk * 2, { el: u.el, src: u.id }); });
        u.empower = { mult: 2, pierce: false, speedK: 1.1, color: col, effect: 'burn' };
        SH.audio.sfx.boom(1);
        break;
      }
      case 'meteor': {
        const n = u.h.hyper === 'starfall' ? 10 : 9;
        const c2 = u.h.hyper === 'starfall' ? 0xffe680 : 0xff6a1a;
        for (let i = 0; i < n; i++) {
          const t = alive();
          const e = t.length ? t[i % t.length] : null;
          const x = e ? e.x + rand(-0.6, 0.6) : rand(-XW + 1, XW - 1), z = e ? e.z + rand(-0.6, 0.6) : -B.wave * SECTION + rand(-6, 2);
          meteor(x, z, c2, u.atk * 1.1, u, 0.15 + i * 0.13, 2.0);
        }
        break;
      }
      case 'beam': {
        const t = alive().sort((p, q) => q.hp - p.hp)[0];
        const tx = t ? t.x : 0, tz = t ? t.z : -B.wave * SECTION;
        const ddx = tx - u.x, ddz = tz - u.z, l = Math.hypot(ddx, ddz) || 1;
        const nx = ddx / l, nz = ddz / l;
        const sweep = u.h.hyper === 'judgment';
        let k = 0;
        const fire = () => {
          if (!B) return;
          let bx = nx, bz = nz;
          if (sweep) { const a = Math.atan2(nz, nx) + (k - 2) * 0.22; bx = Math.cos(a); bz = Math.sin(a); }
          const end = new V3(u.x + bx * 30, 0.8, u.z + bz * 30);
          fx.beam(new V3(u.x, 0.8, u.z), end, { color: col, width: 2.4, life: 0.5, y: 0.9 });
          fx.beam(new V3(u.x, 0.8, u.z), end, { color: 0xffffff, width: 0.9, life: 0.4, y: 1.0 });
          alive().forEach((e) => { if (inLine(e, u.x, u.z, bx, bz, 2.4)) damageEnemy(e, u.atk * (sweep ? 1.0 : 1.6), { el: u.el, src: u.id }); });
          SH.audio.sfx.laser();
          B.shake = Math.max(B.shake, 0.4);
          k++;
          if (k < (sweep ? 5 : 3)) setTimeout(fire, 160);
        };
        fire();
        break;
      }
      case 'nova': {
        let k = 0;
        const wave = () => {
          if (!B) return;
          fx.ring(new V3(u.x, 0.1, u.z), { color: col, r1: 11, life: 0.7, width: 0.25 });
          fx.ring(new V3(u.x, 0.5, u.z), { color: 0xffffff, r1: 10, life: 0.6, width: 0.1 });
          fx.burst(at, { n: 50, color: col, speed: 12, flat: true, up: 0.1, life: 0.6, size: 50, grav: 0 });
          alive().forEach((e) => {
            const d = Math.hypot(e.x - u.x, e.z - u.z);
            damageEnemy(e, u.atk * (u.h.hyper === 'solar' ? 3.2 - Math.min(2.2, d * 0.25) : 1.6), { el: u.el, src: u.id });
            if (k === 0 && u.h.hyper !== 'solar') e.cd += 1;
          });
          SH.audio.sfx.boom(1);
          B.shake = 0.8;
          k++;
          if (k < 2) setTimeout(wave, 300);
        };
        wave();
        break;
      }
      case 'barrage': {
        const n = u.h.hyper === 'bullets' ? 24 : u.h.hyper === 'arrows' ? 30 : 12;
        const boom = u.h.hyper === 'cannons';
        for (let i = 0; i < n; i++) projectile(at, null, { color: boom ? 0x3a3a3a : col, speed: boom ? 12 : 18, dmg: u.atk * (boom ? 0.9 : 0.42), src: u, delay: i * (boom ? 0.09 : 0.035), homing: true, size: boom ? 0.6 : 0.3, boom });
        break;
      }
      case 'freeze': {
        const c2 = u.h.hyper === 'vines' ? 0x5aff4a : 0x9ae8ff;
        alive().forEach((e, i) => {
          setTimeout(() => {
            if (!B || !e.alive) return;
            e.status.freeze = 2;
            if (u.h.hyper === 'vines') e.status.burn = { t: 3, dmg: u.atk * 0.35, poison: true };
            fx.burst(new V3(e.x, 1, e.z), { n: 30, color: c2, speed: 5, size: 50, cell: 4 });
            fx.ring(new V3(e.x, 0.1, e.z), { color: c2, r1: e.r * 2.5, life: 0.5 });
            damageEnemy(e, u.atk * 1.6, { el: u.el, src: u.id });
            SH.audio.sfx.zap();
          }, i * 120);
        });
        SH.flash(0.35, c2, 3);
        break;
      }
      case 'heal': {
        const k = u.h.hyper === 'sanctuary' ? 0.4 : u.h.hyper === 'rain' ? 0.35 : 0.3;
        healTeam(B.hpMax * k);
        if (u.h.hyper === 'sanctuary') { B.shield = 0.6; fx.ring(new V3(u.x, 0.5, u.z), { color: 0xffe08a, r1: 6, life: 0.9, width: 0.3 }); }
        if (u.h.hyper === 'bloom') B.boostNext = true;
        B.heroes.forEach((h) => fx.pillar(new V3(h.x, 0, h.z), { color: 0x8aff7a, r: 0.7, h: 6, life: 0.9 }));
        break;
      }
      case 'wave': {
        const sz = -B.wave * SECTION;
        for (let pass = 0; pass < 2; pass++) {
          setTimeout(() => {
            if (!B) return;
            for (let i = 0; i <= 10; i++) {
              const zz = sz + ZH - i * (ZH * 2 / 10);
              setTimeout(() => {
                if (!B) return;
                for (let x = -XW; x <= XW; x += 1.2) fx.spark(new V3(x, 0.4, zz), new V3(0, rand(3, 6), -6), { color: 0x7ae8ff, life: 0.6, size: 90, size1: 40, grav: 10, cell: 0, glow: 1.6 });
                B.enemies.forEach((e) => { if (e.alive && Math.abs(e.z - zz) < 1.0) damageEnemy(e, u.atk * 1.3, { el: u.el, src: u.id }); });
              }, i * 45);
            }
            SH.audio.sfx.whoosh();
          }, pass * 650);
        }
        break;
      }
      case 'clones': {
        u.cloneDirs = [-0.35, 0.35];
        break;
      }
      case 'blackhole': {
        const sz = -B.wave * SECTION;
        const c = new V3(0, 1, sz - 2);
        let k = 0;
        const tick = () => {
          if (!B) return;
          fx.ring(new V3(c.x, 0.1, c.z), { color: 0xb05aff, r0: 6, r1: 0.4, life: 0.4, width: 0.3 });
          for (let i = 0; i < 16; i++) { const a = Math.random() * PI * 2, rr = rand(3, 7); const p = new V3(c.x + Math.cos(a) * rr, rand(0.2, 2), c.z + Math.sin(a) * rr); fx.spark(p, c.clone().sub(p).multiplyScalar(2.5), { color: 0xc07aff, life: 0.4, size: 40, cell: 0 }); }
          fx.flash(c, { color: 0x6a1aff, size: 4, life: 0.3, light: 3 });
          alive().forEach((e) => { damageEnemy(e, u.atk * 0.55, { el: u.el, src: u.id }); e.x = lerp(e.x, c.x, 0.06); e.z = lerp(e.z, c.z, 0.06); });
          SH.audio.sfx.zap();
          k++;
          if (k < 7) setTimeout(tick, 170);
        };
        tick();
        break;
      }
      case 'drain': {
        let total = 0;
        const big = u.h.hyper === 'crimson';
        if (big) SH.flash(0.5, 0xff1a2a, 2);
        alive().forEach((e, i) => {
          setTimeout(() => {
            if (!B || !e.alive) return;
            const d = damageEnemy(e, u.atk * (big ? 2.6 : 1.8), { el: u.el, src: u.id });
            total += d;
            fx.bolt(new V3(e.x, 1, e.z), new V3(u.x, 1, u.z), { color: 0xff3a5a, life: 0.4 });
            if (i === alive().length) { /* no-op */ }
          }, i * 110);
        });
        setTimeout(() => { if (B) healTeam(Math.min(B.hpMax * 0.4, total * (big ? 0.5 : 0.35))); }, alive().length * 110 + 100);
        break;
      }
      default: break;
    }
    SH.audio.sfx.boom(0.5);
  }

  // ================================================================ enemy turn
  function enemyTurn() {
    B.state = 'enemy';
    B.t = 0;
    // status effects
    B.enemies.forEach((e) => {
      if (!e.alive) return;
      if (e.status.burn) {
        const b = e.status.burn;
        damageEnemy(e, b.dmg, { el: null, src: 'status' });
        fx.burst(new V3(e.x, 1, e.z), { n: 10, color: b.poison ? 0x7aff3a : 0xff7a1a, speed: 2, up: 2, size: 40 });
        b.t--;
        if (b.t <= 0) delete e.status.burn;
      }
    });
    if (B.enemies.every((e) => !e.alive)) { B.state = 'resolve'; return; }
    B.enemyQ = [];
    B.enemies.forEach((e) => {
      if (!e.alive) return;
      if (e.status.freeze) { e.status.freeze--; if (!e.status.freeze) delete e.status.freeze; return; }
      e.cd--;
      if (e.cd <= 0) B.enemyQ.push(e);
    });
    if (B.enemyQ.length) banner('Enemy Turn', 'red');
    B.enemyAttackT = 0.5;
  }
  function enemyAttack(e) {
    e.cd = e.cdMax;
    e.attacks++;
    const targets = B.heroes;
    const t = U.pick(targets);
    const kind = e.boss && e.attacks % 3 === 0 ? 'meteors' : e.def.attack;
    const col = D.ELEMENTS[e.el].hex;
    e.rig.state = 'attack';
    setTimeout(() => { if (e.rig) e.rig.state = 'idle'; }, 600);
    SH.audio.sfx.enemy();
    const dmg = e.atk * D.elementMod(e.el, t.el);
    if (kind === 'melee') {
      e.lunge = { t: 0, tx: t.x, tz: t.z, target: t, dmg, x0: e.x, z0: e.z };
      return 0.9;
    }
    if (kind === 'shot') {
      const p = projectile(new V3(e.x, 1, e.z), t, { enemy: true, color: col, speed: 16, dmg, target: t });
      p.target = t;
      SH.audio.sfx.fireball();
      return 0.9;
    }
    if (kind === 'aoe') {
      fx.ring(new V3(e.x, 0.1, e.z), { color: col, r1: 18, life: 0.9, width: 0.15 });
      fx.ring(new V3(e.x, 0.1, e.z), { color: 0xffffff, r1: 16, life: 0.8, width: 0.06 });
      fx.burst(new V3(e.x, 0.5, e.z), { n: 40, color: col, speed: 10, flat: true, up: 0.1, grav: 0, life: 0.7, size: 50 });
      SH.audio.sfx.boom(1);
      setTimeout(() => { if (B) { B.heroes.forEach((h) => { h.rig.hit(); fx.burst(new V3(h.x, 0.8, h.z), { n: 8, color: col, speed: 4 }); }); hurtTeam(e.atk * 1.15); } }, 400);
      B.shake = 0.6;
      return 1.1;
    }
    if (kind === 'laser') {
      const sz = e.z;
      fx.flash(new V3(e.x, 1.6, e.z), { color: col, size: 4, life: 0.5, light: 5 });
      setTimeout(() => {
        if (!B) return;
        const dx = t.x - e.x, dz = t.z - e.z, l = Math.hypot(dx, dz) || 1;
        const end = new V3(e.x + dx / l * 30, 0.9, e.z + dz / l * 30);
        fx.beam(new V3(e.x, 0.9, sz), end, { color: col, width: 2.2, life: 0.6, y: 1 });
        fx.beam(new V3(e.x, 0.9, sz), end, { color: 0xffffff, width: 0.8, life: 0.5, y: 1.05 });
        SH.audio.sfx.laser();
        const hitList = B.heroes.filter((h) => inLine(h, e.x, e.z, dx / l, dz / l, 2.2));
        hurtTeam(e.atk * (1 + hitList.length * 0.25), t);
      }, 450);
      return 1.2;
    }
    if (kind === 'meteors') {
      banner(`${e.def.name}: Doom Rain!`, 'red');
      for (let i = 0; i < 4; i++) {
        const h = U.pick(B.heroes);
        projectile(new V3(h.x - 3, 14, h.z - 4), h, { meteor: true, enemy: true, color: col, dmg: e.atk * 0.45, target: h, delay: 0.3 + i * 0.2 });
        const p = B.projectiles[B.projectiles.length - 1];
        const T = 0.7; p.vx = 3 / T; p.vz = 4 / T; p.vy = (0.3 - 14 + 15 * T * T) / T;
      }
      return 1.8;
    }
    return 0.6;
  }

  // ================================================================ auto aim
  function autoAim(u) {
    let best = null;
    const sz = -B.wave * SECTION;
    const en = B.enemies.filter((e) => e.alive);
    for (let k = 0; k < 40; k++) {
      const ang = (k / 40) * PI * 2 + 0.03;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const score = simulate(u, dx, dz, 1, en, sz);
      if (!best || score > best.s) best = { dx, dz, s: score };
    }
    return best;
  }
  function simulate(u, dx, dz, power, en, sz) {
    let x = u.x, z = u.z;
    let vx = dx * u.spd * SPD_K * power, vz = dz * u.spd * SPD_K * power;
    const pierce = u.type === 'pierce' || (u.empower && u.empower.pierce);
    let score = 0;
    const last = new Map();
    const allies = new Set();
    const dt = 1 / 60;
    for (let i = 0; i < 300; i++) {
      const sp = Math.hypot(vx, vz);
      if (sp < STOP) break;
      const ns = Math.max(0, sp - (DECEL + sp * DRAG) * dt);
      vx *= ns / sp; vz *= ns / sp;
      x += vx * dt; z += vz * dt;
      if (x < -XW + u.r) { x = -XW + u.r; vx = Math.abs(vx); }
      if (x > XW - u.r) { x = XW - u.r; vx = -Math.abs(vx); }
      if (z < sz - ZH + u.r) { z = sz - ZH + u.r; vz = Math.abs(vz); }
      if (z > sz + ZH - u.r) { z = sz + ZH - u.r; vz = -Math.abs(vz); }
      for (const e of en) {
        const ddx = x - e.x, ddz = z - e.z, d = Math.hypot(ddx, ddz), rr = u.r + e.r;
        if (d < rr) {
          const t = last.get(e) || -9;
          if (i - t > (pierce ? 12 : 4)) {
            last.set(e, i);
            score += (e.boss || e.mini ? 1.3 : 1) * D.elementMod(u.el, e.el) * (e.hp < u.atk * 2 ? 1.4 : 1);
          }
          if (!pierce) {
            const nx = ddx / (d || 1), nz = ddz / (d || 1), vn = vx * nx + vz * nz;
            if (vn < 0) { vx -= 2 * vn * nx; vz -= 2 * vn * nz; }
            x = e.x + nx * rr; z = e.z + nz * rr;
          }
        }
      }
      for (const a of B.heroes) {
        if (a === u || allies.has(a)) continue;
        if (Math.hypot(x - a.x, z - a.z) < u.r + a.r) { allies.add(a); score += 1.2; }
      }
    }
    return score + Math.random() * 0.3;
  }
  // the dotted guide line: the path until the first two bounces
  function guide(u, dx, dz) {
    const pos = aim.dg.attributes.position.array;
    const sz = -B.wave * SECTION;
    let x = u.x, z = u.z, vx = dx, vz = dz;
    const pierce = u.type === 'pierce' || (u.empower && u.empower.pierce) || (u.armed && D.HYPERS[u.h.hyper].kind === 'empower');
    let bounces = 0, n = 0, dist = 0;
    const stepL = 0.1;
    for (let i = 0; i < 400 && n < aim.N; i++) {
      x += vx * stepL; z += vz * stepL;
      dist += stepL;
      if (x < -XW + u.r) { x = -XW + u.r; vx = Math.abs(vx); bounces++; }
      if (x > XW - u.r) { x = XW - u.r; vx = -Math.abs(vx); bounces++; }
      if (z < sz - ZH + u.r) { z = sz - ZH + u.r; vz = Math.abs(vz); bounces++; }
      if (z > sz + ZH - u.r) { z = sz + ZH - u.r; vz = -Math.abs(vz); bounces++; }
      if (!pierce) {
        for (const e of B.enemies) {
          if (!e.alive) continue;
          const ddx = x - e.x, ddz = z - e.z, d = Math.hypot(ddx, ddz), rr = u.r + e.r;
          if (d < rr) { const nx = ddx / d, nz = ddz / d, vn = vx * nx + vz * nz; if (vn < 0) { vx -= 2 * vn * nx; vz -= 2 * vn * nz; } x = e.x + nx * rr; z = e.z + nz * rr; bounces++; }
        }
      }
      if (bounces >= 2) break;
      if (dist > 0.55 * (n + 1)) { pos[n * 3] = x; pos[n * 3 + 1] = 0.3; pos[n * 3 + 2] = z; n++; }
    }
    aim.dg.setDrawRange(0, n);
    aim.dg.attributes.position.needsUpdate = true;
  }

  // ================================================================ flow
  function nextTurn() {
    // hyper charge for everyone, regen, then the next hero
    const fast = 1 + passiveSum('hyperFast') / 100;
    B.heroes.forEach((u) => {
      const before = u.hyper;
      u.hyper = Math.min(100, u.hyper + (100 / u.charge) * fast);
      if (before < 100 && u.hyper >= 100) { SH.audio.sfx.ready(); fx.pillar(new V3(u.x, 0, u.z), { color: 0xffd23a, r: 0.7, h: 5, life: 0.8 }); }
    });
    const regen = passiveSum('regen');
    if (regen) healTeam(B.hpMax * regen / 100, false);
    if (B.cfg.turnLimit && B.turns >= B.cfg.turnLimit) { finish(true); return; }
    B.turnIdx = (B.turnIdx + 1) % B.heroes.length;
    B.boostNext = false;
    B.state = 'aim';
    B.t = 0;
    B.autoT = 0.6;
    B.enemies.forEach((e) => { if (e.alive && (e.boss || e.mini)) e.weakA = Math.random() * PI * 2; });
    if (!B.auto && B.turns < 2) H.hint.classList.remove('hidden');
  }
  function finish(win) {
    if (B.over) return;
    B.over = true;
    B.state = win ? 'victory' : 'defeat';
    B.t = 0;
    H.hint.classList.add('hidden');
    if (win) {
      banner(B.cfg.mode === 'guild' ? 'Time up!' : 'Victory!', '');
      B.heroes.forEach((u) => { u.rig.state = 'win'; });
      SH.audio.sfx.win();
    } else {
      banner('Defeat', 'red');
      SH.post.final.uDesat.value = 0.7;
      SH.audio.sfx.lose();
    }
    const stars = !win ? 0 : !B.cfg.starRounds ? 3 : B.turns <= B.cfg.starRounds ? 3 : B.turns <= Math.ceil(B.cfg.starRounds * 1.5) ? 2 : 1;
    const result = { win, stars, turns: B.turns, damage: B.damageTotal, maxCombo: B.maxCombo, hypers: B.hypersUsed, coins: B.coins, team: B.cfg.team.slice() };
    setTimeout(() => {
      SH.post.final.uDesat.value = 0;
      const cb = B && B.cfg.onEnd;
      if (cb) cb(result);
    }, 2200);
  }

  function update(dt, realDt) {
    if (!B) return;
    const T = B;
    if (arena) {
      arena.floor.userData.u.uTime.value += dt;
      arena.amb.userData.update(dt);
      if (arena.group.userData.water) arena.group.userData.water.uniforms.uTime.value += dt * 0.6;
      arena.fires.forEach((f, i) => { const k = 2.0 + Math.sin(SH.time * 13 + i * 3) * 0.25 + Math.sin(SH.time * 7.3 + i) * 0.2; f.scale.set(k, k * 1.25, 1); if (Math.random() < dt * 8) fx.spark(new V3(f.position.x, 1.5, f.position.z), new V3(rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3)), { color: T.theme === 'crypt' ? 0xb07aff : 0xff8a2a, life: 0.8, size: 30, size1: 5, cell: 5, glow: 2.5 }); });
    }
    if (T.paused) { fx.update(0); return; }
    const sdt = dt * (T.state === 'fly' || T.state === 'enemy' ? (SH.settings.speed || 1) : 1);
    T.t += sdt;
    // ---- state machine
    if (T.state === 'intro') {
      if (T.t < sdt * 1.5) {
        const sub = T.cfg.starRounds ? `<b>${Math.max(0, T.cfg.starRounds - T.turns)}</b> turns left for a 3-star rating` : T.cfg.turnLimit ? `<b>${T.cfg.turnLimit}</b> turns: deal as much damage as you can!` : '';
        banner(T.bossWave && T.wave === T.waves.length - 1 ? 'Boss Battle!' : `Wave ${T.wave + 1}/${T.waves.length}`, T.bossWave ? 'red' : '', sub);
        SH.audio.sfx.whoosh();
      }
      if (T.t > 1.5) { T.state = 'aim'; T.t = 0; T.autoT = 0.6; if (T.turns < 1 && !T.auto) H.hint.classList.remove('hidden'); }
    } else if (T.state === 'aim') {
      const u = T.heroes[T.turnIdx];
      u.rig.state = 'ready';
      if (T.auto) {
        T.autoT -= sdt;
        if (T.autoT <= 0) {
          if (u.hyper >= 100) u.armed = true;
          const a = autoAim(u);
          launch(a.dx, a.dz, 1);
        }
      }
    } else if (T.state === 'dragging') {
      const u = T.heroes[T.turnIdx];
      const a = aimFromDrag();
      if (a && a.raw > 0.04) {
        aim.g.visible = true;
        const ang = Math.atan2(a.dx, a.dz);
        aim.arrowG.position.set(u.x, 0.25, u.z);
        aim.arrowG.rotation.y = Math.atan2(-a.dx, -a.dz);
        const L = 1.6 + a.power * 3.4;
        aim.arrow.scale.set(1.0 + a.power * 0.5, L, 1);
        aim.arrow.position.z = 0;
        aim.arrowMat.uniforms.uC.value.set(u.armed ? 0xffb030 : D.ELEMENTS[u.el].color);
        aim.arrowMat.uniforms.uT.value = SH.time;
        aim.arrowMat.uniforms.uP.value = a.power;
        aim.pull.position.set(u.x, 0.1, u.z);
        aim.pull.scale.setScalar(1 + a.power * 0.6);
        aim.pull.material.color.set(u.armed ? 0xffb030 : D.ELEMENTS[u.el].color).multiplyScalar(1.5);
        guide(u, a.dx, a.dz);
        u.rig.state = 'aim';
        u.rig.root.rotation.y = ang;
      } else aim.g.visible = false;
    } else if (T.state === 'fly') {
      // physics in small steps (with the battle speed)
      let left = sdt;
      while (left > 0) {
        const d = Math.min(STEP, left);
        left -= d;
        T.simT = (T.simT || 0) + d;
        step(d);
      }
      const u = T.heroes[T.turnIdx];
      // clones (Shadow Clones hyper): spawn 2 ghost movers
      if (u.cloneDirs && u.moving) {
        u.cloneDirs.forEach((off, k) => {
          const a = Math.atan2(u.vz, u.vx) + off;
          const sp = Math.hypot(u.vx, u.vz);
          const g = { ghost: true, ghostId: k, owner: u, x: u.x, z: u.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, r: u.r, moving: true, pierceNow: true, trailY: 0.6, position: new V3(u.x, 0, u.z) };
          g.trail = fx.trail(g, 0xb05aff, 0.5);
          T.movers.push(g);
        });
        u.cloneDirs = null;
      }
      T.movers.forEach((m) => {
        if (m.ghost) {
          m.position.set(m.x, 0, m.z);
          if (m.moving) fx.spark(new V3(m.x, 0.8, m.z), new V3(0, 0.5, 0), { color: 0xb05aff, life: 0.25, size: 70, size1: 20, cell: 0 });
        }
        if (!m.moving && m.trail) { fx.stopTrail(m.trail); m.trail = null; }
      });
      // speed sparks behind the hero
      if (u.moving && Math.random() < 0.6) fx.spark(new V3(u.x, 0.4, u.z), new V3(-u.vx * 0.05, 0.6, -u.vz * 0.05), { color: u.empower ? u.empower.color : D.ELEMENTS[u.el].hex, life: 0.35, size: 35, size1: 5, cell: u.empower ? 5 : 1, glow: 2.4 });
      if (u.moving) { u.rig.root.rotation.y = Math.atan2(u.vx, u.vz); }
      const busy = T.movers.some((m) => m.moving) || T.projectiles.length > 0;
      if (!busy && T.t > 0.3) {
        T.movers = [];
        u.empower = null;
        u.rig.state = 'idle';
        T.state = 'resolve';
        T.t = 0;
      }
    } else if (T.state === 'resolve') {
      if (T.t > 0.45) {
        if (T.enemies.every((e) => !e.alive)) {
          if (T.wave < T.waves.length - 1) {
            T.state = 'advance'; T.t = 0;
            banner('Wave clear!', 'blue');
            T.wave++;
            formation(T.wave, false);
            T.heroes.forEach((h) => { h.rig.state = 'run'; });
          } else finish(true);
        } else if (T.hp <= 0) finish(false);
        else if (T.cfg.turnLimit && T.turns >= T.cfg.turnLimit) finish(true);
        else enemyTurn();
      }
    } else if (T.state === 'enemy') {
      T.enemyAttackT -= sdt;
      if (T.enemyAttackT <= 0) {
        if (T.hp <= 0) { finish(false); }
        else if (T.enemyQ.length) {
          const e = T.enemyQ.shift();
          T.enemyAttackT = e.alive ? enemyAttack(e) : 0.05;
        } else if (!T.projectiles.length && !T.enemies.some((e) => e.lunge)) {
          if (T.hp <= 0) finish(false);
          else nextTurn();
        }
      }
    } else if (T.state === 'advance') {
      let arrived = true;
      T.heroes.forEach((h) => {
        const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
        if (d > 0.1) { arrived = false; const sp = Math.min(d, 13 * sdt); h.x += dx / d * sp; h.z += dz / d * sp; h.rig.root.rotation.y = Math.atan2(dx, dz); if (Math.random() < 0.3) fx.smoke(new V3(h.x, 0.1, h.z), { n: 1, size: 50, size1: 90, life: 0.5, color: 0xb0a090 }); }
      });
      if (arrived && T.t > 0.8) {
        T.heroes.forEach((h) => { h.rig.state = 'idle'; h.rig.root.rotation.y = PI; });
        spawnWave(T.wave);
        T.state = 'intro'; T.t = 0;
      }
    }
    // ---- enemy lunges
    T.enemies.forEach((e) => {
      if (!e.lunge) return;
      const L = e.lunge;
      L.t += sdt;
      const k = L.t < 0.35 ? U.easeIn(L.t / 0.35) : L.t < 0.5 ? 1 : 1 - U.easeOut((L.t - 0.5) / 0.35);
      const tx = lerp(L.x0, L.tx, 0.8), tz = lerp(L.z0, L.tz, 0.8);
      e.x = lerp(L.x0, tx, k); e.z = lerp(L.z0, tz, k);
      if (!L.hit && L.t > 0.35) { L.hit = true; hurtTeam(L.dmg, L.target); fx.slash(new V3(L.target.x, 0, L.target.z), rand(0, PI), { color: 0xff5a3a, r: 1.6 }); }
      if (L.t > 0.85) { e.x = L.x0; e.z = L.z0; e.lunge = null; }
    });
    updateProjectiles(sdt);
    // ---- sync rigs
    T.heroes.forEach((u) => {
      u.position.set(u.x, 0, u.z);
      u.rig.root.position.set(u.x, u.moving ? 0.15 + Math.abs(Math.sin(T.t * 20)) * 0.1 : 0, u.z);
      u.base.position.set(u.x, 0, u.z);
      const active = T.heroes[T.turnIdx] === u && (T.state === 'aim' || T.state === 'dragging');
      const ring = u.base.userData.ring;
      ring.scale.setScalar(active ? 1.15 + Math.sin(SH.time * 6) * 0.08 : 1);
      ring.material.opacity = active ? 1 : 0.6;
      if (u.hyper >= 100 && Math.random() < sdt * 5) fx.spark(new V3(u.x + rand(-0.5, 0.5), 0.2, u.z + rand(-0.5, 0.5)), new V3(0, 2, 0), { color: 0xffc83a, life: 0.6, size: 25, cell: 4 });
      if (!u.moving && T.state !== 'advance' && T.state !== 'dragging' && !(T.heroes[T.turnIdx] === u && T.state === 'fly')) u.rig.root.rotation.y = U.damp(u.rig.root.rotation.y, PI, 4, sdt);
      u.rig.update(sdt);
    });
    T.enemies.forEach((e) => {
      if (e.drop > 0) {
        e.drop = Math.max(0, e.drop - sdt * 1.6);
        const k = clamp(e.drop, 0, 1);
        if (k < 1 && !e.landed && k <= 0.02) { e.landed = true; fx.smoke(new V3(e.x, 0.1, e.z), { n: 8, color: 0x9a9080 }); fx.ring(new V3(e.x, 0.1, e.z), { color: 0xffffff, r1: e.r * 2.2, life: 0.4 }); if (e.boss) { B.shake = 0.8; SH.audio.sfx.boom(1.2); } }
      }
      const yOff = e.drop > 0 ? Math.pow(clamp(e.drop, 0, 1), 2) * 12 : 0;
      let sx = 0;
      if (e.shake > 0) { e.shake -= sdt; sx = Math.sin(e.shake * 80) * e.shake * 0.4; }
      e.position.set(e.x, 0, e.z);
      e.rig.root.position.set(e.x + sx, yOff, e.z);
      e.base.position.set(e.x, 0, e.z);
      e.base.visible = e.drop <= 0.05 && !e.dying;
      e.rig.root.rotation.y = U.damp(e.rig.root.rotation.y, Math.atan2(T.heroes[0].x - e.x, T.heroes[0].z - e.z) * 0.25, 3, sdt);
      if (e.dying) {
        e.dying = Math.max(0, e.dying - sdt * 2.2);
        e.rig.setAlpha(e.dying);
        e.rig.root.scale.setScalar(e.rig.scale * (1 + (1 - e.dying) * 0.3));
        e.rig.root.position.y = (1 - e.dying) * 0.8;
        if (e.label) e.label.style.display = 'none';
        if (e.dying <= 0) { e.rig.root.visible = false; }
      }
      // weak spot marker
      if (e.alive && (e.boss || e.mini) && e.drop <= 0) {
        if (!e.weakMark) {
          e.weakMark = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.36, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa030).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          e.weakMark.rotation.x = -PI / 2;
          e.base.add(e.weakMark);
          const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), e.weakMark.material);
          e.weakMark.add(dot);
        }
        e.weakMark.position.set(Math.cos(e.weakA) * e.r, 0.08, Math.sin(e.weakA) * e.r);
        e.weakMark.scale.setScalar(1.6 + Math.sin(SH.time * 6) * 0.25);
      } else if (e.weakMark) e.weakMark.visible = false;
      if (e.status.freeze) e.rig.flash(0.3);
      e.rig.update(e.status.freeze ? 0 : sdt);
      // label
      if (e.label && e.alive) {
        vTmp.set(e.x, Math.min(e.rig.height * e.rig.root.scale.y, 4.2) + 0.35 + yOff, e.z).project(camera);
        const x = (vTmp.x * 0.5 + 0.5) * SH.size.w, y = (-vTmp.y * 0.5 + 0.5) * SH.size.h;
        e.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        e.label.style.display = e.drop > 0.3 ? 'none' : '';
        e.labelCd.textContent = e.status.freeze ? '❄' : e.cd;
        e.labelCd.className = 'el-cd' + (e.cd <= 1 ? ' red' : '') + (e.status.freeze ? ' ice' : '');
        e.labelHp.style.width = (clamp(e.hp / e.hpMax, 0, 1) * 100) + '%';
        e.label.classList.toggle('big', e.boss || e.mini);
      }
    });
    // ---- camera
    const sz = -T.wave * SECTION;
    const targetZ = T.state === 'advance' ? lerp(T.camZ, sz, 0.5) : sz;
    T.camZ = U.damp(T.camZ, T.state === 'advance' ? T.heroes.reduce((s, h) => s + h.z, 0) / T.heroes.length - (ZH - 2.8) : targetZ, 3, realDt);
    T.shake = Math.max(0, T.shake - realDt * 2.2);
    const sh = SH.settings.shake ? T.shake * T.shake * 0.5 : 0;
    camFit(T.camZ);
    camera.position.x += (Math.random() - 0.5) * sh;
    camera.position.y += (Math.random() - 0.5) * sh;
    sun.position.set(6, 18, T.camZ + 10);
    sun.target.position.set(0, 0, T.camZ);
    fx.update(sdt);
    updateHUD(realDt);
  }

  // camera fitting: the whole field fits between the HUD bars on any screen
  const camDir = new V3(0, 0.8, 0.6).normalize();
  let fitCache = null;
  function camFit(zc) {
    const w = SH.size.w, h = SH.size.h;
    const key = w + 'x' + h;
    if (!fitCache || fitCache.key !== key) {
      camera.aspect = w / h;
      camera.fov = 40;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      const top = h * 0.075, bot = h * 0.215 + 8;   // HUD heights in px (approx.)
      const corners = [[-XW - 0.6, -ZH - 0.4], [XW + 0.6, -ZH - 0.4], [-XW - 0.6, ZH + 0.6], [XW + 0.6, ZH + 0.6]];
      let lo = 10, hi = 80, best = 40, off = 0;
      for (let it = 0; it < 26; it++) {
        const d = (lo + hi) / 2;
        camera.position.copy(camDir).multiplyScalar(d);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (const [x, z] of corners) {
          vTmp.set(x, 0, z).project(camera);
          const sx = (vTmp.x * 0.5 + 0.5) * w, sy = (-vTmp.y * 0.5 + 0.5) * h;
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
        const fits = maxX - minX <= w * 0.985 && maxY - minY <= h - top - bot;
        if (fits) { best = d; hi = d; off = (minY + maxY) / 2 - (top + (h - top - bot) / 2); } else lo = d;
      }
      fitCache = { key, d: best, off };
      if (scene.fog) { scene.fog.near = best * 1.05; scene.fog.far = best * 2.6; }
    }
    camera.position.copy(camDir).multiplyScalar(fitCache.d);
    camera.position.z += zc;
    camera.lookAt(0, 0, zc);
    camera.setViewOffset(w, h, 0, fitCache.off, w, h);
  }

  // ================================================================ pause
  function pauseMenu() {
    if (!B || B.over) return;
    B.paused = true;
    SH.ui.modal({
      title: 'Paused', html: B.cfg.title || '', veilClose: false,
      buttons: [
        { label: 'Give up', cls: 'gray', fn() { if (B) { B.paused = false; finish(false); } } },
        { label: 'Resume', cls: 'green', fn() { if (B) B.paused = false; } },
      ],
    });
  }

  const view = {
    scene, camera,
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); fitCache = null; },
    pointerDown, pointerMove, pointerUp,
    update,
    enter() {},
    exit() {},
    warm() {
      if (!fx) fx = new SH.FX(scene);
      buildArena('lava', 2);
      fx.warm();
      aim.g.visible = true;
      const m = SH.buildMonster('imp');
      scene.add(m.root);
      const hrig = SH.buildHero(D.HERO.pyra.look);
      scene.add(hrig.root);
      const b = makeBase('#ff0000', 1, true);
      scene.add(b);
      camFit(0);
      SH.warm(scene, camera);
      m.dispose(); hrig.dispose(); scene.remove(b);
      fx.unwarm();
      aim.g.visible = false;
    },
  };
  SH.registerView('battle', view);
  SH.battle = { start, end, get B() { return B; }, view };
})();
