/* ==========================================================================
   SLING HEROES — the town
   A floating island in the sea: mountains at the back, a river that falls
   off the cliff, a castle, houses, trees and the buildings you tap to play:
   Campaign gate, Arena, Demon Tower, Wishing Altar, Expedition crystal,
   Guild castle, Hall of Mastery, Shop and Mailbox.
   Drag left / right to look around (the town is wider than the screen).
   The names float above the buildings as HTML labels.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.world) return;
  const G = SH.G, U = SH.util, W = SH.world;
  const PI = Math.PI;
  const V3 = THREE.Vector3;
  const C = (c) => new THREE.Color(c);
  const shade = (c, k) => C(c).multiplyScalar(k);
  const { clamp, lerp, smooth } = U;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbcd8f4, 45, 120);
  const camera = new THREE.PerspectiveCamera(42, 0.6, 0.5, 900);
  const updaters = [];

  // ------------------------------------------------------------ terrain
  const riverX = (z) => -13 + Math.sin(z * 0.15) * 2.0;
  const SEA = -3.4;
  function H(x, z) {
    const ex = Math.max(0, Math.abs(x) - 31), ez = Math.max(0, z - 4.5, -38 - z);
    const out = Math.hypot(ex, ez) + W.fbm(x * 0.12, z * 0.12, 3) * 3.5;
    let h = W.fbm(x * 0.07, z * 0.07, 3) * 1.2;
    const m = smooth(clamp((-z - 15) / 13, 0, 1));
    h += m * (5 + Math.max(0, W.fbm(x * 0.05 + 3, z * 0.06, 4)) * 22 + (1 - Math.min(1, Math.abs(x) / 40)) * 5);
    // hills on the sides
    h += smooth(clamp((Math.abs(x) - 26) / 6, 0, 1)) * 2.5 * (1 - m);
    // the river
    if (z > -26) {
      const dr = Math.abs(x - riverX(z));
      h -= 1.5 * smooth(clamp((2.0 - dr) / 1.3, 0, 1)) * smooth(clamp((z + 26) / 6, 0, 1));
    }
    // cliffs into the sea
    const cliff = smooth(clamp(out / 2.4, 0, 1));
    return lerp(h, -8, cliff);
  }
  // the main road and the paths to the buildings
  const roadZ = (x) => 2.2 + Math.sin(x * 0.18) * 0.8;
  const paths = [];
  function pathDist(x, z) {
    let d = Math.abs(z - roadZ(x));
    if (Math.abs(x) > 29) d = 99;
    for (const p of paths) {
      const dx = p[2] - p[0], dz = p[3] - p[1];
      const t = clamp(((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz), 0, 1);
      d = Math.min(d, Math.hypot(x - (p[0] + dx * t), z - (p[1] + dz * t)));
    }
    return d;
  }

  const BUILDINGS = [
    { id: 'expedition', name: 'Expedition', x: -25, z: -4.5, r: 2.4, h: 5.2 },
    { id: 'tower', name: 'Demon Tower', x: -19, z: -12, r: 2.2, h: 11 },
    { id: 'summon', name: 'Wishing Altar', x: -8, z: -3.2, r: 2.6, h: 4.6 },
    { id: 'arena', name: 'Arena', x: -1, z: -8, r: 3.4, h: 5.6 },
    { id: 'guild', name: 'Guild Castle', x: 5, z: -19, r: 5, h: 13 },
    { id: 'campaign', name: 'Campaign', x: 7.5, z: 0.2, r: 2.6, h: 5.4 },
    { id: 'mastery', name: 'Hall of Mastery', x: 14.5, z: -8.5, r: 3, h: 5.4 },
    { id: 'shop', name: 'Shop', x: 20, z: -1.8, r: 2.6, h: 4 },
    { id: 'mail', name: 'Mailbox', x: 25.5, z: -7, r: 2.2, h: 4 },
  ];
  BUILDINGS.forEach((b) => { if (b.id !== 'guild') paths.push([b.x, b.z + b.r * 0.7, b.x + (b.x > 0 ? -0.5 : 0.5), roadZ(b.x)]); });
  paths.push([5, -14.5, 3, roadZ(3)]);

  const HS = 160, HR = [-60, -60, 120, 120];   // height texture for the water shader
  let heightTex = null;

  function buildTerrain() {
    const g = new THREE.PlaneGeometry(110, 78, 220, 156);
    g.rotateX(-PI / 2);
    g.translate(0, 0, -14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      let h = H(x, z);
      const pd = pathDist(x, z);
      if (pd < 1.2 && h > -0.8) h = lerp(h, Math.min(h, 0.05), smooth(clamp(1.2 - pd, 0, 1)) * 0.6);
      p.setY(i, h);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal;
    const col = new Float32Array(p.count * 3);
    const cA = C('#5aae46'), cB = C('#3d8c38'), cC = C('#9cc860'), path = C('#e2c088'), rock = C('#9c8f80'), rock2 = C('#7a6e66'), sand = C('#ecd8a0'), snow = C('#f6f9ff'), bed = C('#6a8a8a');
    const t = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i);
      const v = W.fbm(x * 0.15, z * 0.15, 3);
      t.copy(cA).lerp(cB, clamp(v * 1.5 + 0.5, 0, 1));
      t.lerp(cC, clamp(W.fbm(x * 0.05 + 7, z * 0.05, 2) * 2 - 0.1, 0, 0.6));
      const pd = pathDist(x, z);
      if (pd < 1.0 && y > -0.8) t.lerp(path, smooth(clamp((1.0 - pd) / 0.35, 0, 1)));
      if (z > -26 && Math.abs(x - riverX(z)) < 1.6 && y < -0.3) t.lerp(bed, 0.8);
      if (y < -1.6 && y > -3.2) t.lerp(sand, 0.85);
      const steep = clamp((0.82 - ny) / 0.25, 0, 1);
      if (steep > 0) t.lerp(Math.sin(y * 3) > 0 ? rock : rock2, steep);
      if (y < -3.2) t.copy(rock2).lerp(sand, 0.2);
      if (y > 12) t.lerp(snow, smooth(clamp((y - 12) / 3, 0, 1)) * (ny > 0.55 ? 1 : 0.4));
      col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    m.receiveShadow = SH.Q.shadows;
    scene.add(m);
    // height texture: r = (h + 8) / 10
    const data = new Uint8Array(HS * HS * 4);
    for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
      const x = HR[0] + (i + 0.5) / HS * HR[2], z = HR[1] + (j + 0.5) / HS * HR[3];
      const h = clamp((H(x, z) + 8) / 10, 0, 1);
      const k = (j * HS + i) * 4;
      data[k] = h * 255; data[k + 1] = 0; data[k + 2] = 0; data[k + 3] = 255;
    }
    heightTex = new THREE.DataTexture(data, HS, HS, THREE.RGBAFormat);
    heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
    heightTex.needsUpdate = true;
  }

  // ------------------------------------------------------------ water
  function buildWater() {
    const mat = W.waterMat({ heightTex, hRange: HR, level: SEA, deep: '#0e5a96', shallow: '#3ad8d0', sky: '#cfe6ff', scale: 0.04 });
    mat.fragmentShader = mat.fragmentShader.replace('depth = uLevel - texture2D(uHeight, huv).r;', 'depth = uLevel - (texture2D(uHeight, huv).r * 10.0 - 8.0);');
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), mat);
    sea.rotation.x = -PI / 2;
    sea.position.y = SEA;
    scene.add(sea);
    updaters.push((dt) => { mat.uniforms.uTime.value += dt; });
    // river surface
    const pts = [];
    for (let z = -26; z <= 6; z += 1) pts.push([riverX(z), z]);
    const rg = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    pts.forEach(([x, z], i) => {
      pos.push(x - 1.3, -0.35, z, x + 1.3, -0.35, z);
      uv.push(0, i * 0.5, 1, i * 0.5);
      if (i) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
    });
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    const rmat = W.waterMat({ deep: '#1a6aa8', shallow: '#3ac0d8', sky: '#c8e4ff', scale: 0.12 });
    const river = new THREE.Mesh(rg, rmat);
    scene.add(river);
    updaters.push((dt) => { rmat.uniforms.uTime.value += dt * 3; });
    // waterfalls: off the front cliff, and from the mountain into the river
    const falls = [[riverX(5.2), 5.2, 3.0, 4.5, 0], [riverX(-25.5), -25.5, 2.2, 3.5, 1], [-29, 3.5, 2.2, 5, 0], [29.5, -1, 2, 5, 0]];
    for (const [x, z, w, h, back] of falls) {
      const fm = W.fallMat({ a: '#5ac8f0', b: '#ffffff', speed: 1.4 });
      const top = back ? H(x, z - 1.5) : -0.35;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 8), fm);
      const g = f.geometry.attributes.position;
      for (let i = 0; i < g.count; i++) { const y = g.getY(i); g.setZ(i, (0.5 - y / h) * (back ? -0.3 : 1.4) * (0.5 - y / h)); }
      f.position.set(x, (back ? top - h * 0.5 + 0.3 : -0.35 - h / 2 + 0.05), z + (back ? 0 : 0.6));
      if (Math.abs(x) > 28) { f.rotation.y = x > 0 ? -PI / 2 : PI / 2; f.position.y = H(x, z) - h / 2 + 0.6; }
      scene.add(f);
      updaters.push((dt) => { fm.uniforms.uTime.value += dt; });
      // mist at the bottom
      const mist = W.ambient('bubbles', 14, { x0: x - w / 2, x1: x + w / 2, y0: f.position.y - h / 2 - 0.2, y1: f.position.y - h / 2 + 1.2, z0: z + 0.2, z1: z + 1.8 }, { color: '#e8f8ff', size: 18 });
      scene.add(mist);
      updaters.push(mist.userData.update);
    }
  }

  // ------------------------------------------------------------ buildings
  const builds = {};
  const gold = '#f2c040';
  const stone = '#d8d2c4', stoneDk = '#a8a090';
  const P = (r, g, o, b) => r.add(b || 'root', g, o);

  builds.campaign = (r) => {
    P(r, G.cyl, { p: [0, 0.2, 0], s: [2.4, 0.4, 2.4], c: stone, c2: stoneDk });
    P(r, G.cyl, { p: [0, 0.5, -0.2], s: [2.0, 0.3, 1.8], c: '#e8e2d4' });
    for (let i = 0; i < 3; i++) P(r, G.box, { p: [0, 0.12 + i * 0.12, 2.2 + i * -0.25], s: [1.6, 0.14, 0.4], c: stone });
    r.bone('ring', 'root', 0, 2.75, -0.3);
    P(r, G.torus(1.7, 0.22, PI * 2, 10, 48), { c: gold, k: 'metal' }, 'ring');
    P(r, G.torus(1.95, 0.08, PI * 2, 8, 48), { c: '#c8902a', k: 'metal' }, 'ring');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      P(r, G.cone, { p: [Math.cos(a) * 2.05, Math.sin(a) * 2.05, 0], r: [0, 0, a - PI / 2], s: [0.12, 0.45, 0.12], c: gold, k: 'metal' }, 'ring');
      P(r, G.sphLo, { p: [Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0.2], s: 0.09, c: '#ffb43a', k: 'glow', i: 2.5 }, 'ring');
    }
    for (const s of [-1, 1]) {
      P(r, G.box, { p: [s * 1.75, 1.1, -0.3], s: [0.5, 2.0, 0.5], c: '#e8e2d4', c2: stoneDk });
      for (let i = 0; i < 4; i++) P(r, G.sph, { p: [s * (2.3 + i * 0.28), 3.2 + i * 0.45, -0.3], r: [0, 0, s * (0.6 + i * 0.2)], s: [0.6 - i * 0.08, 0.16, 0.08], c: '#ffffff', c2: gold });
    }
    P(r, G.oct, { p: [0, 4.95, -0.3], s: [0.3, 0.45, 0.3], c: '#ff5a3a', k: 'glow', i: 2.5 });
    // portal vortex
    const vm = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uNoise: { value: SH.tex.noise } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv;
        void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);
          float sw = a / 6.2831 + r * 0.8 - uTime * 0.25;
          float n = texture2D(uNoise, vec2(sw * 2.0, r * 0.7 - uTime * 0.1)).g;
          float spiral = smoothstep(0.4, 0.8, n);
          vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.85, 0.45), spiral) * (0.75 + (1.0 - r) * 1.1);
          col = mix(col, vec3(0.5, 0.1, 0.6) * 1.5, smoothstep(0.55, 1.0, r) * (1.0 - spiral) * 0.6);
          float alpha = smoothstep(1.0, 0.85, r);
          gl_FragColor = vec4(col, alpha); }`,
      transparent: true, depthWrite: false,
    });
    const v = new THREE.Mesh(new THREE.CircleGeometry(1.62, 48), vm);
    r.bones.ring.add(v);
    updaters.push((dt) => { vm.uniforms.uTime.value += dt; });
    r.bone('runes', 'root', 0, 2.6, -0.3);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      P(r, G.oct, { p: [Math.cos(a) * 2.7, Math.sin(a * 2) * 0.4, Math.sin(a) * 1.4], s: [0.15, 0.24, 0.15], c: '#ffc84a', k: 'glow', i: 2 }, 'runes');
    }
    r.anim = (t) => { r.bones.runes.rotation.y = t * 0.6; r.bones.ring.rotation.z = Math.sin(t * 0.5) * 0.04; };
  };

  builds.arena = (r) => {
    const n = 16;
    P(r, G.cyl, { p: [0, 0.15, 0], s: [3.4, 0.3, 3.4], c: '#e8d8b0', c2: '#c8b080' });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      if (Math.sin(a) > 0.55) continue;
      P(r, G.box, { p: [Math.cos(a) * 3.2, 1.3, Math.sin(a) * 3.2], r: [0, -a, 0], s: [0.45, 2.4, 0.5], c: '#ecdcc0', c2: '#b8a080' });
      P(r, G.box, { p: [Math.cos(a + PI / n) * 3.15, 2.45, Math.sin(a + PI / n) * 3.15], r: [0, -a - PI / n + PI / 2, 0], s: [1.3, 0.3, 0.5], c: '#f4e8cc' });
      P(r, G.box, { p: [Math.cos(a + PI / n) * 3.2, 0.9, Math.sin(a + PI / n) * 3.2], r: [0, -a - PI / n + PI / 2, 0], s: [1.25, 0.18, 0.4], c: '#d8c8a8' });
    }
    P(r, G.torus(3.25, 0.18, PI * 1.36, 6, 40), { p: [0, 2.7, 0], r: [-PI / 2, 0, PI * 0.82], c: '#c8902a', k: 'metal' });
    // pedestal + golden statue
    P(r, G.box, { p: [0, 0.75, 0.4], s: [1.3, 0.9, 1.3], c: '#ecdcc0', c2: '#b8a080' });
    P(r, G.box, { p: [0, 1.28, 0.4], s: [1.5, 0.2, 1.5], c: gold, k: 'metal' });
    for (const s of [-1, 1]) { const fl = W.flag('#c82a3a', 0.8, 0.5); fl.position.set(s * 3.3, 3.4, -1.6); fl.rotation.y = s > 0 ? PI : 0; r.root.add(fl); updaters.push(fl.userData.update); P(r, G.cylLo, { p: [s * 3.3, 3.1, -1.6], s: [0.04, 1.4, 0.04], c: '#5a3a2a' }); }
    r.after = () => {
      const st = SH.buildHero(SH.data.HERO.leon.look);
      st.state = 'win'; st.t = 0.31;
      for (let i = 0; i < 30; i++) st.update(1 / 60);
      st.animate = null;
      const gm = new THREE.MeshStandardMaterial({ color: '#f2c040', metalness: 0.95, roughness: 0.25, envMap: SH.envMap, envMapIntensity: 1.4 });
      st.root.traverse((o) => { if (o.isMesh && o.material !== st.mats.outline) o.material = gm; });
      if (st.face) st.face.visible = false;
      st.root.position.set(0, 1.38, 0.4);
      st.root.scale.setScalar(1.25);
      r.root.add(st.root);
    };
  };

  builds.tower = (r) => {
    const dk = '#4a3a5a', dk2 = '#2a2236';
    P(r, G.taper(1.7, 2.1, 10), { p: [0, 0.6, 0], s: [1, 1.2, 1], c: dk, c2: dk2 });
    for (let i = 0; i < 4; i++) {
      const y = 1.2 + i * 2.1, rr = 1.55 - i * 0.22;
      P(r, G.taper(rr - 0.12, rr, 10), { p: [0, y + 1.05, 0], s: [1, 2.1, 1], c: i % 2 ? dk : shade(dk, 1.15), c2: dk2 });
      P(r, G.torus(rr + 0.02, 0.12, PI * 2, 6, 10), { p: [0, y + 0.05, 0], r: [PI / 2, 0, 0], c: '#2a1a2a' });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * PI * 2 + i;
        P(r, G.cone, { p: [Math.cos(a) * (rr + 0.15), y + 0.1, Math.sin(a) * (rr + 0.15)], r: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2], s: [0.1, 0.5, 0.1], c: '#1a1220' });
        if (k % 2 === 0) P(r, G.box, { p: [Math.cos(a + 0.5) * (rr - 0.1), y + 1.1, Math.sin(a + 0.5) * (rr - 0.1)], r: [0, -a - 0.5 + PI / 2, 0], s: [0.25, 0.5, 0.06], c: '#ff3a2a', k: 'glow', i: 2.2, ol: false });
      }
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * PI * 2;
      P(r, G.cone, { p: [Math.cos(a) * 0.75, 10.0, Math.sin(a) * 0.75], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], s: [0.16, 1.2, 0.16], c: '#1a1220' });
    }
    r.bone('eye', 'root', 0, 10.7, 0);
    P(r, G.sphHi, { s: 0.55, c: '#ff3a2a', k: 'glow', i: 2.2 }, 'eye');
    P(r, G.sph, { p: [0, 0, 0.45], s: [0.12, 0.3, 0.12], c: '#1a0606' }, 'eye');
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 30, 16, 1, true), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (0.5 + 0.5 * sin(vUv.y * 30.0 - uTime * 4.0)) * 0.6; gl_FragColor = vec4(vec3(1.0, 0.25, 0.2) * 1.1, a * 0.7 * smoothstep(0.0, 0.05, vUv.y)); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    beam.position.y = 11.2 + 15;
    r.root.add(beam);
    updaters.push((dt) => { beam.material.uniforms.uTime.value += dt; });
    const emb = W.ambient('embers', 30, { x0: -2, x1: 2, y0: 0, y1: 12, z0: -2, z1: 2 }, { color: '#ff4a3a' });
    r.root.add(emb);
    updaters.push(emb.userData.update);
    r.anim = (t) => { r.bones.eye.rotation.y = Math.sin(t * 0.7) * 0.6; r.bones.eye.position.y = 10.7 + Math.sin(t * 1.5) * 0.15; };
  };

  builds.summon = (r) => {
    P(r, G.cyl, { p: [0, 0.2, 0], s: [2.6, 0.4, 2.6], c: '#f4f0ff', c2: '#c8c0e0' });
    P(r, G.cyl, { p: [0, 0.5, 0], s: [2.1, 0.3, 2.1], c: '#ffffff', c2: '#d8d0f0' });
    P(r, G.torus(1.4, 0.2, PI * 2, 8, 40), { p: [0, 0.75, 0], r: [PI / 2, 0, 0], c: '#e8e4f8' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6;
      P(r, G.cyl, { p: [Math.cos(a) * 2.0, 1.6, Math.sin(a) * 2.0], s: [0.16, 2.2, 0.16], c: '#ffffff', c2: '#c8c0e0' });
      P(r, G.oct, { p: [Math.cos(a) * 2.0, 2.85, Math.sin(a) * 2.0], s: [0.16, 0.26, 0.16], c: '#c87aff', k: 'glow', i: 2.4 });
      P(r, G.cyl, { p: [Math.cos(a) * 2.0, 2.68, Math.sin(a) * 2.0], s: [0.24, 0.12, 0.24], c: gold, k: 'metal' });
    }
    r.bone('orb', 'root', 0, 2.5, 0);
    P(r, G.sphHi, { s: 0.6, c: '#9a5aff', k: 'glow', i: 1.8 }, 'orb');
    P(r, G.sph, { s: 0.35, c: '#ffffff', k: 'glow', i: 2.4 }, 'orb');
    r.bone('rings', 'orb', 0, 0, 0);
    P(r, G.torus(0.95, 0.04, PI * 2, 6, 40), { r: [1.2, 0, 0], c: gold, k: 'metal' }, 'rings');
    P(r, G.torus(1.1, 0.03, PI * 2, 6, 40), { r: [0.3, 1.1, 0], c: gold, k: 'metal' }, 'rings');
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), W.waterMat({ deep: '#5a3ab8', shallow: '#b88aff', sky: '#f0e8ff', scale: 0.4, emissive: 0.4 }));
    water.rotation.x = -PI / 2; water.position.y = 0.72;
    r.root.add(water);
    updaters.push((dt) => { water.material.uniforms.uTime.value += dt; });
    const sp = W.ambient('sparkles', 26, { x0: -2.4, x1: 2.4, y0: 0.6, y1: 4.5, z0: -2.4, z1: 2.4 }, { color: '#e0b8ff' });
    r.root.add(sp);
    updaters.push(sp.userData.update);
    r.anim = (t) => { r.bones.orb.position.y = 2.5 + Math.sin(t * 1.6) * 0.18; r.bones.rings.rotation.y = t * 0.9; r.bones.rings.rotation.x = t * 0.4; };
  };

  builds.expedition = (r) => {
    P(r, G.cyl, { p: [0, 0.2, 0], s: [2.4, 0.4, 2.4], c: '#8a8a98', c2: '#5a5a68' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      P(r, G.box, { p: [Math.cos(a) * 2.1, 0.75, Math.sin(a) * 2.1], r: [0, -a, 0.1], s: [0.4, 0.8 + (i % 3) * 0.3, 0.4], c: '#9a9aa8', c2: '#6a6a78' });
    }
    r.bone('crys', 'root', 0, 2.9, 0);
    const rr = U.rng(4);
    P(r, G.oct, { s: [0.7, 1.6, 0.7], c: '#4ad8ff', k: 'glow', i: 1.5 }, 'crys');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      P(r, G.oct, { p: [Math.cos(a) * 0.65, -0.5 + rr() * 0.4, Math.sin(a) * 0.65], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], s: [0.25, 0.7, 0.25], c: '#7ae8ff', k: 'glow', i: 1.3 }, 'crys');
    }
    r.bone('ringA', 'crys', 0, 0, 0);
    P(r, G.torus(1.5, 0.05, PI * 2, 6, 40), { r: [PI / 2 + 0.3, 0, 0], c: '#c8f4ff', k: 'glow', i: 1.6 }, 'ringA');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      P(r, G.dodec, { p: [Math.cos(a) * 1.8, -1.2 + Math.sin(a * 3) * 0.3, Math.sin(a) * 1.8], s: 0.3, c: '#7a7a88' }, 'ringA');
    }
    r.anim = (t) => { r.bones.crys.position.y = 2.9 + Math.sin(t * 1.3) * 0.2; r.bones.crys.rotation.y = t * 0.3; r.bones.ringA.rotation.y = -t * 0.8; };
  };

  builds.guild = (r) => {
    const wall = '#e8e4dc', wall2 = '#b8b0a4', roof = '#3a6ad8', roof2 = '#2a4a9a';
    P(r, G.box, { p: [0, 1.6, 0], s: [8, 3.2, 1.2], c: wall, c2: wall2 });
    for (let i = 0; i < 10; i++) P(r, G.box, { p: [-3.6 + i * 0.8, 3.35, 0.35], s: [0.4, 0.4, 0.5], c: wall });
    P(r, G.box, { p: [0, 1.0, 0.62], s: [1.6, 2.0, 0.1], c: '#5a3a22' });
    P(r, G.torus(0.8, 0.12, PI, 6, 16), { p: [0, 2.0, 0.65], c: wall2 });
    const tower = (x, z, h, rad) => {
      P(r, G.cyl, { p: [x, h / 2, z], s: [rad, h, rad], c: wall, c2: wall2 });
      P(r, G.cone, { p: [x, h + rad * 1.1, z], s: [rad * 1.25, rad * 2.4, rad * 1.25], c: roof, c2: roof2 });
      P(r, G.torus(rad * 1.02, 0.08, PI * 2, 6, 20), { p: [x, h, z], r: [PI / 2, 0, 0], c: gold, k: 'metal' });
      for (let k = 0; k < 3; k++) P(r, G.box, { p: [x + Math.cos(k * 2.1 + 0.6) * rad, h * (0.45 + k * 0.15), z + Math.sin(k * 2.1 + 0.6) * rad], r: [0, -(k * 2.1 + 0.6) + PI / 2, 0], s: [0.22, 0.4, 0.05], c: '#ffd88a', k: 'glow', i: 1.5, ol: false });
      P(r, G.cylLo, { p: [x, h + rad * 2.6, z], s: [0.03, 0.8, 0.03], c: '#4a3a2a' });
      const fl = W.flag(U.pick(['#c82a3a', '#ffd23a', '#3a6ad8']), 0.7, 0.4);
      fl.position.set(x, h + rad * 2.85, z);
      r.root.add(fl);
      updaters.push(fl.userData.update);
    };
    tower(-4.3, 0.2, 4.6, 0.95); tower(4.3, 0.2, 4.6, 0.95);
    P(r, G.box, { p: [0, 4.2, -2.4], s: [5, 5.4, 3.2], c: wall, c2: wall2 });
    P(r, G.cone, { p: [0, 7.6, -2.4], r: [0, PI / 4, 0], s: [3.7, 1.8, 3.0], c: roof, c2: roof2 });
    tower(-2.2, -1.2, 6.6, 0.8); tower(2.2, -1.2, 6.6, 0.8);
    tower(0, -3.2, 9.5, 0.9);
    tower(-3.5, -3.8, 5.5, 0.75); tower(3.5, -3.8, 5.5, 0.75);
    for (let k = 0; k < 4; k++) P(r, G.box, { p: [-1.5 + k, 5.2, -0.78], s: [0.35, 0.6, 0.05], c: '#ffd88a', k: 'glow', i: 1.5, ol: false });
    P(r, G.cyl, { p: [0, 5.2, -0.75], r: [PI / 2, 0, 0], s: [0.65, 0.05, 0.65], c: '#5a8aff', k: 'glow', i: 1.4 });
    P(r, G.box, { p: [0, 3.3, 0.66], s: [1.3, 1.6, 0.05], c: '#3a6ad8' });
    P(r, G.oct, { p: [0, 3.35, 0.7], s: [0.3, 0.42, 0.04], c: gold, k: 'metal' });
  };

  builds.mastery = (r) => {
    for (let i = 0; i < 3; i++) P(r, G.box, { p: [0, 0.15 + i * 0.25, 0.2 - i * 0.1], s: [5.4 - i * 0.4, 0.3, 3.8 - i * 0.4], c: i % 2 ? '#e8e0d0' : '#d8d0c0', c2: '#b8b0a0' });
    for (let i = 0; i < 6; i++) {
      for (const z of [1.2, -1.0]) {
        P(r, G.cyl, { p: [-2 + i * 0.8, 2.2, z], s: [0.22, 2.8, 0.22], c: '#f4f0e8', c2: '#c8c0b0' });
        P(r, G.box, { p: [-2 + i * 0.8, 3.65, z], s: [0.5, 0.15, 0.5], c: '#e8e0d0' });
      }
    }
    P(r, G.box, { p: [0, 3.85, 0.1], s: [5.0, 0.3, 3.0], c: '#e8e0d0', c2: '#c8c0b0' });
    const prism = G.shape('templeroof', (s) => { s.moveTo(-1, 0); s.lineTo(0, 0.45); s.lineTo(1, 0); s.closePath(); }, 1, 0.02);
    P(r, prism, { p: [0, 4.0, 0.1], s: [2.7, 2.0, 3.0], c: '#4a7ae8', c2: '#2a4aa8' });
    P(r, G.box, { p: [0, 2.0, -1.1], s: [4.4, 2.6, 0.2], c: '#c8c0b0' });
    r.bone('book', 'root', 0, 2.1, 0.1);
    P(r, G.box, { p: [-0.25, 0, 0], r: [0.4, 0.4, 0], s: [0.5, 0.65, 0.05], c: '#c83a2a' }, 'book');
    P(r, G.box, { p: [0.25, 0, 0], r: [0.4, -0.4, 0], s: [0.5, 0.65, 0.05], c: '#c83a2a' }, 'book');
    P(r, G.box, { p: [0, 0.02, 0.05], r: [0.4, 0, 0], s: [0.9, 0.6, 0.04], c: '#fff0b0', k: 'glow', i: 1.8 }, 'book');
    P(r, G.oct, { p: [0, 0.75, 0], s: [0.2, 0.3, 0.2], c: '#7ad8ff', k: 'glow', i: 2.5 }, 'book');
    const sp = W.ambient('sparkles', 14, { x0: -1.5, x1: 1.5, y0: 1.2, y1: 3.5, z0: -0.5, z1: 1.2 }, { color: '#bfe8ff' });
    r.root.add(sp);
    updaters.push(sp.userData.update);
    r.anim = (t) => { r.bones.book.position.y = 2.1 + Math.sin(t * 1.4) * 0.12; r.bones.book.rotation.y = Math.sin(t * 0.6) * 0.3; };
  };

  builds.shop = (r) => {
    P(r, G.box, { p: [0, 0.55, 0.3], s: [3.2, 1.1, 1.1], c: '#a8703a', c2: '#6a4220' });
    P(r, G.box, { p: [0, 1.15, 0.3], s: [3.4, 0.12, 1.3], c: '#c8904a' });
    for (const x of [-1.55, 1.55]) for (const z of [-0.5, 0.85]) P(r, G.cylLo, { p: [x, 1.4, z], s: [0.08, 2.8, 0.08], c: '#7a4a2a' });
    for (let i = 0; i < 8; i++) P(r, G.box, { p: [-1.5 + i * 0.43, 2.7, 0.3], r: [0.35, 0, 0], s: [0.43, 0.08, 1.9], c: i % 2 ? '#ffffff' : '#e83a3a' });
    for (let i = 0; i < 8; i++) P(r, G.cone, { p: [-1.5 + i * 0.43, 2.32, 1.18], r: [PI, 0, 0], s: [0.21, 0.25, 0.04], c: i % 2 ? '#ffffff' : '#e83a3a', ol: false });
    // goods
    P(r, G.box, { p: [-0.9, 1.4, 0.3], s: [0.5, 0.4, 0.4], c: '#c8904a' });
    for (let i = 0; i < 4; i++) P(r, G.sph, { p: [-1.05 + (i % 2) * 0.25, 1.65, 0.2 + Math.floor(i / 2) * 0.2], s: 0.12, c: U.pick(['#e83a3a', '#ffd23a', '#7ad84a']) });
    P(r, G.oct, { p: [0.2, 1.45, 0.4], s: [0.15, 0.24, 0.15], c: '#4ad8ff', k: 'glow', i: 1.8 });
    P(r, G.oct, { p: [0.55, 1.42, 0.35], s: [0.12, 0.2, 0.12], c: '#ff5aa8', k: 'glow', i: 1.8 });
    P(r, G.lathe('vase', [[0, 0], [0.14, 0.02], [0.18, 0.15], [0.08, 0.32], [0.1, 0.4], [0, 0.4]], 14), { p: [1.0, 1.21, 0.3], c: '#4a7ad8' });
    for (let i = 0; i < 3; i++) P(r, G.cyl, { p: [2.1 + (i % 2) * 0.55, 0.4, 0.8 - i * 0.6], s: [0.32, 0.8, 0.32], c: '#9a6a3a', c2: '#6a4220' });
    for (let i = 0; i < 2; i++) P(r, G.box, { p: [-2.2, 0.3 + i * 0.6, 0.6 - i * 0.2], r: [0, i * 0.4, 0], s: [0.6, 0.6, 0.6], c: '#c8904a', c2: '#8a5a2a' });
    P(r, G.sph, { p: [-2.0, 0.3, -0.4], s: [0.35, 0.4, 0.35], c: '#e8d0a0' });
    for (const x of [-1.55, 1.55]) P(r, G.sphLo, { p: [x, 2.2, 1.0], s: 0.13, c: '#ffc85a', k: 'glow', i: 3 });
    r.after = () => {
      const npc = SH.buildHero({ skin: '#ffe2cc', hair: { style: 'bob', color: '#c87a3a' }, eyes: { color: '#3a8a3a', style: 'closed' }, mouth: 'open', body: { style: 'tunic', top: '#3a8a5a', bottom: '#2a5a3a', accent: '#ffd23a' }, head: ['headband'], headbandColor: '#ffd23a', scale: 0.9 });
      npc.root.position.set(0.0, 0, -0.35);
      npc.state = 'idle';
      r.root.add(npc.root);
      r.npc = npc;
    };
  };

  builds.mail = (r) => {
    W.house(r, 0, 0, -0.4, 1.5, { wall: '#f4e8d0', roof: '#c84a3a', lit: true });
    P(r, G.cylLo, { p: [1.9, 0.6, 1.3], s: [0.07, 1.2, 0.07], c: '#5a3a2a' });
    P(r, G.box, { p: [1.9, 1.3, 1.3], s: [0.55, 0.42, 0.75], c: '#3a6ad8', c2: '#2a4a9a' });
    P(r, G.cyl, { p: [1.9, 1.5, 1.3], r: [PI / 2, 0, 0], s: [0.275, 0.75, 0.275], c: '#3a6ad8' });
    r.bone('mflag', 'root', 2.2, 1.4, 1.5);
    P(r, G.box, { p: [0, 0.2, 0], s: [0.04, 0.45, 0.04], c: '#5a3a2a' }, 'mflag');
    P(r, G.box, { p: [0, 0.38, 0.12], s: [0.04, 0.18, 0.24], c: '#e83a3a' }, 'mflag');
    const smoke = W.ambient('bubbles', 10, { x0: 0.6, x1: 1.0, y0: 3.2, y1: 6, z0: -0.9, z1: -0.5 }, { color: '#d8d8e0', size: 26 });
    smoke.material.blending = THREE.NormalBlending;
    r.root.add(smoke);
    updaters.push(smoke.userData.update);
    r.anim = (t) => { r.bones.mflag.rotation.x = SH.mailCount && SH.mailCount() > 0 ? 0 : -1.4; };
  };

  // ------------------------------------------------------------ decor
  function buildDecor() {
    const bag = W.bag({ thick: 0.045 });
    const r = U.rng(77);
    const blocked = (x, z, pad) => {
      for (const b of BUILDINGS) if (Math.hypot(x - b.x, z - b.z) < b.r + (pad || 1.2)) return true;
      if (pathDist(x, z) < 1.4) return true;
      if (z > -26 && Math.abs(x - riverX(z)) < 2.4) return true;
      return false;
    };
    // trees
    for (let i = 0; i < 260; i++) {
      const x = -34 + r() * 68, z = -30 + r() * 36;
      const y = H(x, z);
      if (y < -0.5 || blocked(x, z, 1.4)) continue;
      if (z < -16) W.pine(bag, x, y - 0.1, z, 0.9 + r() * 0.7, '#2f7a4a', y > 9);
      else if (r() < 0.6) W.tree(bag, x, y - 0.1, z, 0.75 + r() * 0.45, U.pick(['#4aa83a', '#5ab840', '#3a9a3a', '#7ac83a', '#e88a3a']), r);
      else if (r() < 0.6) W.bush(bag, x, y, z, 0.8 + r() * 0.6, '#3a9a3a', r);
      else W.rock(bag, x, y, z, 0.4 + r() * 0.5, '#a8a0a0', r);
    }
    for (let i = 0; i < 60; i++) {
      const x = -30 + r() * 60, z = -12 + r() * 16;
      if (blocked(x, z, 0.8) || H(x, z) < -0.3) continue;
      W.flowers(bag, x, H(x, z), z, 4, r);
    }
    // houses around the castle and along the road
    const homes = [[-3, -14, 0.3], [-5.5, -12.5, 0.6], [10, -14, -0.4], [12, -16.5, -0.2], [17.5, -13, -0.5], [-24, -10, 0.4], [-27, -14, 0.2], [27, 1, -0.6], [22.5, -11.5, 0.1], [-15.5, -2.5, 0.5], [11.5, 3.2, 0]];
    for (const [x, z, rot] of homes) {
      if (blocked(x, z, 0.4)) continue;
      W.house(bag, x, H(x, z) - 0.05, z, 1.0 + r() * 0.3, { rot, roof: U.pick(['#d8603a', '#c84a3a', '#3a7ad8', '#e8903a', '#8a5ac8']), lit: r() < 0.5 });
    }
    // lanterns along the road
    for (let x = -28; x <= 28; x += 4.5) {
      const z = roadZ(x) + 1.3;
      if (blocked(x, z, 0.2) && pathDist(x, z) < 1.2) continue;
      W.lantern(bag, x, H(x, z), z);
    }
    // the bridge
    const bz = roadZ(riverX(2));
    const bx = riverX(bz);
    for (let i = 0; i < 9; i++) bag.add('root', G.box, { p: [bx - 2 + i * 0.5, 0.05 + Math.sin(i / 8 * PI) * 0.45, bz], r: [0, 0, 0], s: [0.45, 0.12, 1.6], c: i % 2 ? '#a8703a' : '#8a5a2a' });
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) bag.add('root', G.box, { p: [bx - 2 + i * 1.0, 0.45 + Math.sin(i / 4 * PI) * 0.45, bz + s * 0.75], s: [0.1, 0.6, 0.1], c: '#6a4220' });
    // fences near the shop
    W.fence(bag, 22.5, 1.2, 26.5, 0.8, H(24, 1));
    W.fence(bag, -23, 0.5, -19.5, 0.9, H(-21, 0.7));
    // crystals near the expedition
    W.crystal(bag, -28.5, H(-28.5, -2), -2, 0.7, '#4ad8ff', r);
    W.crystal(bag, -22.5, H(-22.5, -8), -8, 0.5, '#7ae8ff', r);
    bag.build();
    scene.add(bag.root);
    // windmill on the right hill
    const wm = W.bag({ thick: 0.05 });
    const wx = 29, wz = -9, wy = H(29, -9);
    wm.add('root', G.taper(0.7, 1.1, 10), { p: [wx, wy + 1.6, wz], s: [1, 3.2, 1], c: '#f4e8d0', c2: '#c8b898' });
    wm.add('root', G.cone, { p: [wx, wy + 3.8, wz], s: [1.0, 1.2, 1.0], c: '#c84a3a', c2: '#8a2a1a' });
    wm.bone('blades', 'root', wx, wy + 3.2, wz + 0.95);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      wm.add('blades', G.box, { p: [Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0], r: [0, 0, a], s: [2.4, 0.42, 0.05], c: '#f4ecd8' });
    }
    wm.add('blades', G.sph, { s: 0.2, c: '#5a3a2a' });
    wm.build();
    scene.add(wm.root);
    updaters.push((dt) => { wm.bones.blades.rotation.z += dt * 0.8; });
  }

  // airship
  function buildAirship() {
    const a = W.bag({ thick: 0.05 });
    a.add('root', G.sphHi, { p: [0, 1.4, 0], s: [1.2, 1.0, 2.4], c: '#f4e8d0', c2: '#c8a878' });
    for (let i = 0; i < 5; i++) a.add('root', G.torus(1.0 - Math.abs(i - 2) * 0.12, 0.03, PI * 2, 4, 30), { p: [0, 1.4, -1.6 + i * 0.8], s: [1.2, 1, 1], c: '#a8703a', ol: false });
    a.add('root', G.lathe('hull', [[0, -0.4], [0.5, -0.3], [0.7, 0.1], [0.75, 0.25], [0, 0.25]], 16), { p: [0, 0, 0], s: [1, 1, 2.2], c: '#8a5a2a', c2: '#5a3a1a' });
    for (const s of [-1, 1]) a.add('root', G.box, { p: [s * 0.5, 0.65, 0], r: [0, 0, s * 0.3], s: [0.04, 0.9, 0.04], c: '#5a3a2a', ol: false });
    a.add('root', G.cone, { p: [0, 1.6, -2.6], r: [-PI / 2, 0, 0], s: [0.1, 0.6, 1.0], c: '#c84a3a' });
    a.bone('prop', 'root', 0, 0.1, -1.9);
    for (let i = 0; i < 3; i++) a.add('prop', G.box, { r: [0, 0, (i / 3) * PI * 2], s: [0.12, 0.9, 0.04], c: '#c8a878' });
    a.build();
    a.root.scale.setScalar(1.3);
    scene.add(a.root);
    let t = 0;
    updaters.push((dt) => {
      t += dt;
      const x = ((t * 1.2) % 90) - 45;
      a.root.position.set(x, 12 + Math.sin(t * 0.8) * 0.4, -12 + Math.sin(t * 0.1) * 3);
      a.root.rotation.y = PI / 2;
      a.root.rotation.z = Math.sin(t * 0.8) * 0.04;
      a.bones.prop.rotation.z += dt * 12;
    });
  }

  // birds: little V shapes flying in loops
  function buildBirds() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.15, 0, 0, 0, 0.1, 0, 0, -0.1, 0.5, 0.15, 0, 0, 0, 0.1, 0, 0, -0.1], 3));
    g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ color: 0x2a2a3a, side: THREE.DoubleSide });
    const birds = [];
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(g, m);
      b.userData = { r: 6 + Math.random() * 6, s: 0.25 + Math.random() * 0.2, o: Math.random() * 6, y: 9 + Math.random() * 4, cx: -10 + Math.random() * 20 };
      scene.add(b);
      birds.push(b);
    }
    updaters.push((dt) => {
      const t = SH.time;
      for (const b of birds) {
        const d = b.userData, a = t * d.s + d.o;
        b.position.set(d.cx + Math.cos(a) * d.r, d.y + Math.sin(a * 2) * 0.5, -6 + Math.sin(a) * d.r * 0.5);
        b.rotation.y = -a;
        b.scale.y = 1 + Math.sin(t * 10 + d.o) * 0.8;
      }
    });
  }

  // ------------------------------------------------------------ build all
  const bRigs = {};
  let built = false;
  function build() {
    if (built) return;
    built = true;
    scene.add(W.sky({ top: '#2f6fd8', hor: '#d8ecff', low: '#9ac0e8', sun: [0.5, 0.35, -0.8] }));
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6a5a3a, 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 0.95);
    sun.position.set(18, 30, 14);
    if (SH.Q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = sun.shadow.camera;
      s.left = -40; s.right = 40; s.top = 30; s.bottom = -30; s.near = 1; s.far = 120;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.04;
    }
    scene.add(sun);
    scene.add(sun.target);
    buildTerrain();
    buildWater();
    for (const b of BUILDINGS) {
      const r = W.bag({ thick: 0.05 });
      builds[b.id](r);
      r.build();
      if (r.after) r.after();
      r.root.position.set(b.x, H(b.x, b.z) - 0.1, b.z);
      if (b.id === 'guild') r.root.position.y = Math.max(r.root.position.y, 0.4);
      scene.add(r.root);
      bRigs[b.id] = r;
      // invisible hit box for taps
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, b.h, 10), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(b.x, r.root.position.y + b.h / 2, b.z);
      hit.userData.id = b.id;
      scene.add(hit);
      b.hit = hit;
      b.y = r.root.position.y;
    }
    buildDecor();
    buildAirship();
    buildBirds();
    const cl = W.clouds(16, { x0: -70, x1: 70, y0: 16, y1: 26, z0: -70, z1: -40 }, { size: 22 });
    scene.add(cl);
    updaters.push(cl.userData.update);
    const low = W.clouds(10, { x0: -60, x1: 60, y0: -2, y1: 1, z0: 9, z1: 16 }, { size: 12, opacity: 0.75, speed: 0.6, seed: 8 });
    scene.add(low);
    updaters.push(low.userData.update);
    const ff = W.ambient('fireflies', 50, { x0: -30, x1: 30, y0: 0.3, y1: 3, z0: -14, z1: 4 }, { color: '#fff4a0', size: 8 });
    scene.add(ff);
    updaters.push(ff.userData.update);
    const leaves = W.ambient('leaves', 30, { x0: -30, x1: 30, y0: 0, y1: 10, z0: -12, z1: 6 }, { color: '#8ad84a' });
    scene.add(leaves);
    updaters.push(leaves.userData.update);
    makeLabels();
  }

  // ------------------------------------------------------------ labels
  const labelsEl = U.$('town-labels');
  function makeLabels() {
    for (const b of BUILDINGS) {
      const el = U.el('div', 'tlabel', `<span class="tl-name">${b.name}</span><i class="tl-badge"></i><b class="tl-lock"></b>`);
      el.dataset.id = b.id;
      el.addEventListener('click', () => tapBuilding(b.id));
      labelsEl.appendChild(el);
      b.label = el;
    }
  }
  const vp = new V3();
  function placeLabels() {
    for (const b of BUILDINGS) {
      vp.set(b.x, b.y + b.h + 0.4, b.z).project(camera);
      const x = (vp.x * 0.5 + 0.5) * SH.size.w, y = (-vp.y * 0.5 + 0.5) * SH.size.h;
      const vis = vp.z < 1 && x > -60 && x < SH.size.w + 60;
      b.label.style.display = vis ? '' : 'none';
      if (vis) b.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const st = SH.townState ? SH.townState(b.id) : {};
      b.label.classList.toggle('badge', !!st.badge);
      b.label.classList.toggle('locked', !!st.locked);
      b.label.querySelector('.tl-lock').textContent = st.locked || '';
    }
  }

  // ------------------------------------------------------------ camera + input
  let camX = 6, velX = 0, dragging = false, dragX0 = 0, camX0 = 0, moved = 0, lastX = 0, lastT = 0;
  const X_MIN = -25, X_MAX = 26;
  const bounce = {};
  function tapBuilding(id) {
    bounce[id] = 1;
    SH.audio.sfx.click();
    if (SH.onBuilding) SH.onBuilding(id);
  }
  const ray = new THREE.Raycaster();
  function pick(x, y) {
    const v = new THREE.Vector2((x / SH.size.w) * 2 - 1, -(y / SH.size.h) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hits = ray.intersectObjects(BUILDINGS.map((b) => b.hit));
    return hits.length ? hits[0].object.userData.id : null;
  }
  const worldPerPx = () => {
    const d = camera.position.distanceTo(new V3(camX, 0, -4));
    return (2 * d * Math.tan((camera.fov / 2) * PI / 180) * camera.aspect) / SH.size.w;
  };

  const view = {
    scene, camera,
    BUILDINGS,
    focus(id) { const b = BUILDINGS.find((q) => q.id === id); if (b) { camX = clamp(b.x, X_MIN, X_MAX); velX = 0; } },
    enter() { build(); labelsEl.classList.remove('hidden'); },
    exit() { labelsEl.classList.add('hidden'); },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    pointerDown(p) { dragging = true; dragX0 = p.x; camX0 = camX; moved = 0; velX = 0; lastX = p.x; lastT = performance.now(); },
    pointerMove(p) {
      if (!dragging) return;
      const dx = p.x - dragX0;
      moved = Math.max(moved, Math.abs(dx));
      camX = clamp(camX0 - dx * worldPerPx(), X_MIN - 2, X_MAX + 2);
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velX = U.lerp(velX, -(p.x - lastX) * worldPerPx() / (dt / 1000), 0.5);
      lastX = p.x; lastT = now;
    },
    pointerUp(p) {
      if (!dragging) return;
      dragging = false;
      if (moved < 8) {
        velX = 0;
        const id = pick(p.x, p.y);
        if (id) tapBuilding(id);
      }
    },
    wheel(e) { velX += (e.deltaY + e.deltaX) * 0.05; },
    update(dt) {
      if (!built) return;
      if (!dragging) {
        camX += velX * dt;
        velX *= Math.exp(-dt * 3.5);
        if (camX < X_MIN) camX = U.damp(camX, X_MIN, 8, dt);
        if (camX > X_MAX) camX = U.damp(camX, X_MAX, 8, dt);
      }
      const sway = Math.sin(SH.time * 0.3) * 0.15;
      camera.position.set(camX + sway, 23, 31);
      camera.lookAt(camX + sway * 0.5, 0.5, -9);
      for (const u of updaters) u(dt);
      for (const id in bRigs) {
        const r = bRigs[id];
        if (r.anim) r.anim(SH.time);
        if (r.npc) r.npc.update(dt);
        if (bounce[id] > 0) {
          bounce[id] = Math.max(0, bounce[id] - dt * 3);
          const k = 1 + Math.sin(bounce[id] * PI) * 0.06;
          r.root.scale.set(k, 2 - k, k);
        }
      }
      placeLabels();
    },
    warm() { build(); SH.warm(scene, camera); },
  };
  SH.registerView('town', view);
  SH.town = view;
})();
