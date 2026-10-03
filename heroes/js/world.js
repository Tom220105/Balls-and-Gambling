/* ==========================================================================
   SLING HEROES — world building blocks
   Shared by the town, the campaign map and the battle arenas:
   * noise2(): smooth value noise for terrain heights and colours
   * sky(): gradient sky dome with a sun glow
   * clouds(): soft drifting cloud sprites
   * waterMat(): animated water with shallow / deep colours, waves and foam
   * fallMat(): a waterfall / lava fall that streams down
   * decor builders: trees, pines, rocks, bushes, flowers, houses, lanterns,
     crystals … all merged into a few meshes with toon shading and outlines.
   * ambient(): floating particles (fireflies, embers, snow, leaves …)
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.Rig) return;
  const G = SH.G, U = SH.util;
  const PI = Math.PI;
  const C = (c) => new THREE.Color(c);
  const shade = (c, k) => C(c).multiplyScalar(k);
  const W = (SH.world = {});

  // ------------------------------------------------------------ noise
  const perm = new Uint8Array(512);
  {
    const r = U.rng(42);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  const grad = (h, x, y) => { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return U.lerp(U.lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u), U.lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v) * 0.25;
  }
  const fbm = (x, y, o) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (o || 4); i++) { s += noise2(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; };
  W.noise2 = noise2;
  W.fbm = fbm;

  // ------------------------------------------------------------ sky
  W.sky = function (opts) {
    opts = opts || {};
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: C(opts.top || '#3f7fe0') }, uHor: { value: C(opts.hor || '#cfe6ff') }, uLow: { value: C(opts.low || '#8ab0e0') },
        uSun: { value: new THREE.Vector3().fromArray(opts.sun || [0.4, 0.5, -0.75]).normalize() }, uSunC: { value: C(opts.sunC || '#fff2c8') },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 uTop, uHor, uLow, uSun, uSunC; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 c = h > 0.0 ? mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHor, uLow, clamp(-h * 3.0, 0.0, 1.0));
          float s = max(dot(normalize(vP), uSun), 0.0);
          c += uSunC * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  };

  // ------------------------------------------------------------ clouds
  const cloudTex = (() => {
    const { c, g } = SH.canvas(256, 128);
    const r = U.rng(9);
    for (let i = 0; i < 26; i++) {
      const x = 40 + r() * 176, y = 70 + (r() - 0.5) * 40 - Math.sin((x - 40) / 176 * PI) * 25, rad = 18 + r() * 30 * Math.sin((x - 40) / 176 * PI + 0.3);
      const grd = g.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.6, 'rgba(250,250,255,0.6)'); grd.addColorStop(1, 'rgba(240,244,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
    // shaded bottom
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createLinearGradient(0, 40, 0, 128);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(150,170,210,0.55)');
    g.fillStyle = sh; g.fillRect(0, 0, 256, 128);
    const t = SH.canvasTex(c, true);
    return t;
  })();
  W.cloudTex = cloudTex;
  W.clouds = function (n, area, opts) {
    opts = opts || {};
    const grp = new THREE.Group();
    const r = U.rng(opts.seed || 3);
    const list = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: opts.opacity || 0.95, color: opts.color || 0xffffff, fog: !!opts.fog }));
      const s = (opts.size || 14) * (0.7 + r() * 0.7);
      m.scale.set(s, s * 0.5, 1);
      m.position.set(area.x0 + r() * (area.x1 - area.x0), area.y0 + r() * (area.y1 - area.y0), area.z0 + r() * (area.z1 - area.z0));
      m.userData.v = (0.3 + r() * 0.5) * (opts.speed || 1);
      grp.add(m);
      list.push(m);
    }
    grp.userData.update = (dt) => {
      for (const m of list) {
        m.position.x += m.userData.v * dt;
        if (m.position.x > area.x1 + 10) m.position.x = area.x0 - 10;
      }
    };
    return grp;
  };

  // ------------------------------------------------------------ water
  W.waterMat = function (opts) {
    opts = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uNoise: { value: SH.tex.noise },
        uDeep: { value: C(opts.deep || '#0b4f8a') }, uShallow: { value: C(opts.shallow || '#2fd0d8') }, uFoam: { value: C(opts.foam || '#ffffff') },
        uSky: { value: C(opts.sky || '#bfe0ff') }, uHeight: { value: opts.heightTex || null }, uHRange: { value: new THREE.Vector4().fromArray(opts.hRange || [-40, -40, 80, 80]) },
        uLevel: { value: opts.level || 0 }, uScale: { value: opts.scale || 0.05 }, uSun: { value: new THREE.Vector3().fromArray(opts.sun || [0.4, 0.6, -0.7]).normalize() },
        uEmis: { value: opts.emissive || 0 },
      }]),
      vertexShader: `varying vec3 vW; varying vec4 vMv;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; vMv = mvPosition; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime, uLevel, uScale, uEmis; uniform sampler2D uNoise, uHeight; uniform vec3 uDeep, uShallow, uFoam, uSky, uSun; uniform vec4 uHRange;
        varying vec3 vW; varying vec4 vMv;
        #include <fog_pars_fragment>
        void main(){
          vec2 p = vW.xz * uScale;
          float n1 = texture2D(uNoise, p + vec2(uTime * 0.02, uTime * 0.013)).g;
          float n2 = texture2D(uNoise, p * 1.7 - vec2(uTime * 0.017, -uTime * 0.021)).g;
          vec3 nrm = normalize(vec3((n1 - 0.5) * 1.2, 1.0, (n2 - 0.5) * 1.2));
          float depth = 6.0;
          #ifdef HAS_HEIGHT
            vec2 huv = (vW.xz - uHRange.xy) / uHRange.zw;
            depth = uLevel - texture2D(uHeight, huv).r;
          #endif
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(V, nrm), 0.0), 3.0);
          vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 3.5, depth));
          col = mix(col, uSky, fres * 0.55);
          vec3 H = normalize(V + uSun);
          col += vec3(1.0, 0.95, 0.85) * pow(max(dot(nrm, H), 0.0), 140.0) * 2.5;
          float cell = texture2D(uNoise, p * 3.0 + vec2(uTime * 0.03, 0.0)).b;
          col += uFoam * smoothstep(0.82, 1.0, cell) * 0.12 * smoothstep(3.0, 0.5, depth);
          float foam = smoothstep(0.7, 0.0, depth + (n1 - 0.5) * 0.6) ;
          float bands = smoothstep(0.55, 0.9, sin((depth * 6.0 - uTime * 1.8) + n2 * 6.0) * 0.5 + 0.5) * smoothstep(1.6, 0.4, depth);
          col = mix(col, uFoam, clamp(foam + bands * 0.6, 0.0, 1.0));
          col += col * uEmis;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
      fog: true,
      defines: opts.heightTex ? { HAS_HEIGHT: '' } : {},
    });
  };

  // streaming fall (waterfall or lava fall)
  W.fallMat = function (opts) {
    opts = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uNoise: { value: SH.tex.noise }, uA: { value: C(opts.a || '#4ab8e8') }, uB: { value: C(opts.b || '#ffffff') }, uSpeed: { value: opts.speed || 1.2 }, uGlow: { value: opts.glow || 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime, uSpeed, uGlow; uniform sampler2D uNoise; uniform vec3 uA, uB; varying vec2 vUv;
        void main(){ vec2 uv = vec2(vUv.x * 1.5, vUv.y * 0.6 + uTime * uSpeed);
          float n = texture2D(uNoise, uv).g; float n2 = texture2D(uNoise, uv * vec2(2.0, 1.2) + 0.37).r;
          float streak = smoothstep(0.45, 0.8, n * 0.6 + n2 * 0.6);
          vec3 c = mix(uA, uB, streak) * uGlow;
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float a = edge * (0.75 + streak * 0.25) * smoothstep(0.0, 0.08, vUv.y);
          gl_FragColor = vec4(c, a); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  };

  // ------------------------------------------------------------ decor
  // a Rig with only a root bone, used as a bag of merged static props
  W.bag = function (opts) {
    const r = new SH.Rig({ thick: (opts && opts.thick) || 0.05, outline: (opts && opts.outline) || 0x1c140e });
    r.rim = (opts && opts.rim) || 0x9ab0d8;
    return r;
  };
  const P = (bag, g, o, bone) => bag.add(bone || 'root', g, o);

  W.tree = function (bag, x, y, z, s, col, r) {
    r = r || Math.random;
    const leaf = C(col || '#4aa83a');
    const k = s || 1;
    P(bag, G.taper(0.14 * k, 0.24 * k, 8), { p: [x, y + 0.7 * k, z], s: [1, 1.4 * k, 1], c: '#7a4a2a', c2: '#4a2a14' });
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = r() * PI * 2, rr = i === 0 ? 0 : 0.45 * k;
      P(bag, G.ico, { p: [x + Math.cos(a) * rr, y + (1.6 + (i === 0 ? 0.6 : r() * 0.4)) * k, z + Math.sin(a) * rr], s: (0.75 + r() * 0.25) * k * (i === 0 ? 1.1 : 0.85), c: shade(leaf, 0.95 + r() * 0.25), c2: shade(leaf, 0.55) });
    }
  };
  W.pine = function (bag, x, y, z, s, col, snow) {
    const k = s || 1;
    const c = C(col || '#2a7a4a');
    P(bag, G.cylLo, { p: [x, y + 0.35 * k, z], s: [0.12 * k, 0.7 * k, 0.12 * k], c: '#5a3a1a' });
    for (let i = 0; i < 3; i++) {
      P(bag, G.coneLo, { p: [x, y + (0.9 + i * 0.6) * k, z], s: [(0.9 - i * 0.22) * k, 1.0 * k, (0.9 - i * 0.22) * k], c: snow && i === 2 ? '#f4f8ff' : shade(c, 0.9 + i * 0.12), c2: shade(c, 0.6) });
    }
    if (snow) P(bag, G.coneLo, { p: [x, y + 2.25 * k, z], s: [0.3 * k, 0.4 * k, 0.3 * k], c: '#ffffff' });
  };
  W.rock = function (bag, x, y, z, s, col, r) {
    r = r || Math.random;
    P(bag, G.dodec, { p: [x, y + 0.2 * s, z], r: [r() * 3, r() * 3, r() * 3], s: [s * (0.8 + r() * 0.4), s * (0.55 + r() * 0.3), s * (0.8 + r() * 0.4)], c: shade(col || '#9a9aa4', 0.85 + r() * 0.3), c2: shade(col || '#9a9aa4', 0.55) });
  };
  W.bush = function (bag, x, y, z, s, col, r) {
    r = r || Math.random;
    for (let i = 0; i < 3; i++) P(bag, G.ico, { p: [x + (r() - 0.5) * 0.5 * s, y + 0.25 * s, z + (r() - 0.5) * 0.4 * s], s: (0.35 + r() * 0.15) * s, c: shade(col || '#3a9a3a', 0.9 + r() * 0.3), c2: shade(col || '#3a9a3a', 0.6) });
    if (r() < 0.5) for (let i = 0; i < 3; i++) P(bag, G.sphLo, { p: [x + (r() - 0.5) * 0.6 * s, y + (0.35 + r() * 0.2) * s, z + 0.2 * s], s: 0.07 * s, c: U.pick(['#ff6a8a', '#ffe04a', '#ffffff', '#c87aff']), ol: false });
  };
  W.flowers = function (bag, x, y, z, n, r) {
    r = r || Math.random;
    for (let i = 0; i < n; i++) {
      const fx = x + (r() - 0.5) * 2, fz = z + (r() - 0.5) * 2;
      P(bag, G.cylLo, { p: [fx, y + 0.12, fz], s: [0.015, 0.24, 0.015], c: '#3a8a2a', ol: false });
      P(bag, G.sphLo, { p: [fx, y + 0.26, fz], s: [0.08, 0.05, 0.08], c: U.pick(['#ff5a7a', '#ffd23a', '#ffffff', '#b87aff', '#ff9a3a']), ol: false });
    }
  };
  W.house = function (bag, x, y, z, s, opts) {
    opts = opts || {};
    const k = s || 1, rot = opts.rot || 0;
    const wall = opts.wall || '#f4e4c4', roof = opts.roof || '#d8603a', beam = '#6a4a2a';
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const at = (lx, ly, lz) => [x + lx * cr + lz * sr, y + ly, z - lx * sr + lz * cr];
    P(bag, G.box, { p: at(0, 0.6 * k, 0), r: [0, rot, 0], s: [1.6 * k, 1.2 * k, 1.3 * k], c: wall, c2: shade(wall, 0.8) });
    for (const lx of [-0.8, 0.8]) P(bag, G.box, { p: at(lx * k, 0.6 * k, 0.66 * k), r: [0, rot, 0], s: [0.1 * k, 1.2 * k, 0.06 * k], c: beam, ol: false });
    P(bag, G.box, { p: at(0, 1.0 * k, 0.66 * k), r: [0, rot, 0], s: [1.6 * k, 0.08 * k, 0.06 * k], c: beam, ol: false });
    const prism = G.shape('roofprism', (sh) => { sh.moveTo(-1, 0); sh.lineTo(0, 0.8); sh.lineTo(1, 0); sh.closePath(); }, 1.2, 0.03);
    P(bag, prism, { p: at(0, 1.18 * k, 0), r: [0, rot, 0], s: [1.0 * k, 1.0 * k, 1.25 * k], c: roof, c2: shade(roof, 0.65) });
    P(bag, G.box, { p: at(0, 0.38 * k, 0.66 * k), r: [0, rot, 0], s: [0.36 * k, 0.6 * k, 0.05 * k], c: '#7a4a2a' });
    for (const lx of [-0.5, 0.5]) P(bag, G.box, { p: at(lx * k, 0.75 * k, 0.665 * k), r: [0, rot, 0], s: [0.26 * k, 0.26 * k, 0.04 * k], c: opts.lit ? '#ffd88a' : '#4a6a9a', k: opts.lit ? 'glow' : 'toon', i: opts.lit ? 1.6 : 1, ol: false });
    if (opts.chimney !== false) P(bag, G.box, { p: at(0.5 * k, 1.75 * k, -0.2 * k), r: [0, rot, 0], s: [0.22 * k, 0.6 * k, 0.22 * k], c: '#9a8a7a' });
  };
  W.lantern = function (bag, x, y, z, col) {
    P(bag, G.cylLo, { p: [x, y + 0.7, z], s: [0.04, 1.4, 0.04], c: '#3a2a2a' });
    P(bag, G.box, { p: [x, y + 1.45, z], s: [0.2, 0.26, 0.2], c: '#3a2a2a' });
    P(bag, G.sphLo, { p: [x, y + 1.45, z], s: 0.1, c: col || '#ffc85a', k: 'glow', i: 3, ol: false });
  };
  W.crystal = function (bag, x, y, z, s, col, r) {
    r = r || Math.random;
    for (let i = 0; i < 5; i++) {
      const a = r() * PI * 2, rr = i === 0 ? 0 : 0.35 * s;
      P(bag, G.oct, { p: [x + Math.cos(a) * rr, y + (i === 0 ? 0.8 : 0.4) * s, z + Math.sin(a) * rr], r: [Math.cos(a) * 0.4 * (i ? 1 : 0), r(), Math.sin(a) * 0.4 * (i ? 1 : 0)], s: [0.25 * s, (i === 0 ? 0.9 : 0.5) * s, 0.25 * s], c: col, k: 'glow', i: 1.3 });
    }
  };
  W.fence = function (bag, x0, z0, x1, z1, y) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.7));
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      P(bag, G.box, { p: [U.lerp(x0, x1, t), y + 0.3, U.lerp(z0, z1, t)], s: [0.1, 0.6, 0.1], c: '#8a5a32' });
    }
    P(bag, G.box, { p: [(x0 + x1) / 2, y + 0.42, (z0 + z1) / 2], r: [0, ang, 0], s: [0.06, 0.08, Math.hypot(x1 - x0, z1 - z0)], c: '#a8703a', ol: false });
  };

  // ------------------------------------------------------------ ambient particles
  // kind: fireflies | embers | snow | leaves | sand | spores | bubbles | sparkles
  W.ambient = function (kind, n, box, opts) {
    opts = opts || {};
    n = Math.round(n * SH.Q.particles);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = box.x0 + Math.random() * (box.x1 - box.x0);
      pos[i * 3 + 1] = box.y0 + Math.random() * (box.y1 - box.y0);
      pos[i * 3 + 2] = box.z0 + Math.random() * (box.z1 - box.z0);
      seed[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const K = {
      fireflies: { c: '#d8ff6a', size: 10, rise: 0.15, sway: 0.6, add: true, cell: 0, glow: 2.2 },
      embers: { c: '#ff8a2a', size: 9, rise: 1.4, sway: 0.5, add: true, cell: 5, glow: 3 },
      snow: { c: '#ffffff', size: 8, rise: -0.9, sway: 0.8, add: false, cell: 0, glow: 1.1 },
      leaves: { c: '#7ad84a', size: 14, rise: -0.5, sway: 1.2, add: false, cell: 7, glow: 1.0 },
      sand: { c: '#ffd89a', size: 6, rise: 0.1, sway: 2.2, add: false, cell: 0, glow: 1.1 },
      spores: { c: '#c8a0ff', size: 9, rise: 0.4, sway: 0.5, add: true, cell: 0, glow: 2 },
      bubbles: { c: '#9af0ff', size: 11, rise: 0.9, sway: 0.4, add: true, cell: 3, glow: 1.2 },
      sparkles: { c: '#fff2a0', size: 12, rise: 0.3, sway: 0.3, add: true, cell: 1, glow: 2.5 },
    }[kind];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uTex: { value: SH.tex.atlas }, uColor: { value: C(opts.color || K.c).multiplyScalar(K.glow) },
        uSize: { value: (opts.size || K.size) * Math.min(2, window.devicePixelRatio || 1) }, uRise: { value: K.rise }, uSway: { value: K.sway },
        uBox: { value: new THREE.Vector3(box.x0, box.y0, box.z0) }, uDim: { value: new THREE.Vector3(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) },
        uCell: { value: K.cell },
      },
      vertexShader: `attribute float seed; uniform float uTime, uSize, uRise, uSway; uniform vec3 uBox, uDim; varying float vA; varying float vRot;
        void main(){ vec3 p = position; float t = uTime + seed * 100.0;
          p.y = uBox.y + mod(p.y - uBox.y + uRise * uTime * (0.6 + seed * 0.8), uDim.y);
          p.x += sin(t * 0.7 + seed * 6.0) * uSway; p.z += cos(t * 0.5 + seed * 9.0) * uSway * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float edge = smoothstep(0.0, 0.15, (p.y - uBox.y) / uDim.y) * smoothstep(1.0, 0.8, (p.y - uBox.y) / uDim.y);
          vA = edge * (0.55 + 0.45 * sin(t * 2.3 + seed * 20.0));
          vRot = t * (seed - 0.5) * 2.0;
          gl_PointSize = uSize * (0.6 + seed * 0.8) * (30.0 / -mv.z); }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; uniform float uCell; varying float vA; varying float vRot;
        void main(){ vec2 c = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
          float col = mod(uCell, 4.0), row = floor(uCell / 4.0);
          vec4 t = texture2D(uTex, vec2((col + c.x) / 4.0, 1.0 - (row + 1.0 - c.y) / 2.0));
          gl_FragColor = vec4(uColor * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false, blending: K.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.update = (dt) => { mat.uniforms.uTime.value += dt; };
    return pts;
  };

  // flag that waves in the wind
  W.flag = function (col, w, h) {
    const g = new THREE.PlaneGeometry(w || 0.9, h || 0.55, 10, 4);
    g.translate((w || 0.9) / 2, 0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uC: { value: C(col) } },
      vertexShader: `uniform float uTime; varying float vS; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; float w = sin(p.x * 5.0 - uTime * 6.0) * 0.12 * p.x; p.z += w; vS = cos(p.x * 5.0 - uTime * 6.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 uC; varying float vS; varying vec2 vUv; void main(){ vec3 c = uC * (0.75 + vS * 0.25); if (vUv.x > 0.85 && abs(vUv.y - 0.5) < (vUv.x - 0.85) * 3.0) discard; gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(g, mat);
    m.userData.update = (dt) => { mat.uniforms.uTime.value += dt; };
    return m;
  };

  // a sprite label that always faces the camera is done in HTML (see town.js), this is the 3D glow ring used under buildings
  W.glowRing = function (r, col) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 48), new THREE.MeshBasicMaterial({ color: C(col).multiplyScalar(2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -PI / 2;
    return m;
  };
})();
