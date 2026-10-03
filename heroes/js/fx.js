/* ==========================================================================
   SLING HEROES — visual effects
   new SH.FX(scene) gives a scene its own effect system. Everything is
   pooled and created up front, so nothing new has to be compiled in the
   middle of a fight:
   * particles: one additive and one soft (smoke) point cloud, updated on
     the CPU (sparks, embers, stars, leaves, smoke puffs …)
   * rings (shock waves), flashes, laser beams, lightning, sword slashes,
     light pillars and ribbon trails behind flying heroes
   * a few point lights that flash with big hits
   * floating damage numbers in HTML (crisp text at any size)
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.tex) return;
  const U = SH.util;
  const PI = Math.PI;
  const V3 = THREE.Vector3;
  const tmpC = new THREE.Color();

  // ------------------------------------------------------------ particle cloud
  function cloud(cap, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 4), sz = new Float32Array(cap), cr = new Float32Array(cap * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcr', new THREE.BufferAttribute(cr, 2).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: SH.tex.atlas }, uScale: { value: 1 } },
      vertexShader: `attribute vec4 pcolor; attribute float psize; attribute vec2 pcr; uniform float uScale; varying vec4 vC; varying vec2 vCR;
        void main(){ vC = pcolor; vCR = pcr; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * uScale / -mv.z; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vC; varying vec2 vCR;
        void main(){ vec2 c = gl_PointCoord - 0.5; float cs = cos(vCR.y), sn = sin(vCR.y); c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
          if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) discard;
          float col = mod(vCR.x, 4.0), row = floor(vCR.x / 4.0);
          vec4 t = texture2D(uTex, vec2((col + c.x) / 4.0, 1.0 - (row + 1.0 - c.y) / 2.0));
          gl_FragColor = vec4(vC.rgb * t.rgb, t.a * vC.a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 20 : 19;
    const P = { pts, cap, n: 0, pos, col, sz, cr, px: new Float32Array(cap * 3), v: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap), s0: new Float32Array(cap), s1: new Float32Array(cap), c: new Float32Array(cap * 3), g: new Float32Array(cap), drag: new Float32Array(cap), rot: new Float32Array(cap), spin: new Float32Array(cap), cell: new Float32Array(cap), a0: new Float32Array(cap) };
    P.spawn = (x, y, z, vx, vy, vz, life, s0, s1, r, g, b, grav, drag, cell, a0) => {
      let i;
      if (P.n < cap) i = P.n++;
      else i = Math.floor(Math.random() * cap);
      P.px[i * 3] = x; P.px[i * 3 + 1] = y; P.px[i * 3 + 2] = z;
      P.v[i * 3] = vx; P.v[i * 3 + 1] = vy; P.v[i * 3 + 2] = vz;
      P.life[i] = life; P.max[i] = life; P.s0[i] = s0; P.s1[i] = s1;
      P.c[i * 3] = r; P.c[i * 3 + 1] = g; P.c[i * 3 + 2] = b;
      P.g[i] = grav; P.drag[i] = drag; P.rot[i] = Math.random() * 6.28; P.spin[i] = (Math.random() - 0.5) * 6; P.cell[i] = cell; P.a0[i] = a0;
    };
    P.update = (dt) => {
      let w = 0;
      for (let i = 0; i < P.n; i++) {
        P.life[i] -= dt;
        if (P.life[i] <= 0) continue;
        // compact
        if (w !== i) {
          for (const arr of [P.px, P.v, P.c]) { arr[w * 3] = arr[i * 3]; arr[w * 3 + 1] = arr[i * 3 + 1]; arr[w * 3 + 2] = arr[i * 3 + 2]; }
          for (const arr of [P.life, P.max, P.s0, P.s1, P.g, P.drag, P.rot, P.spin, P.cell, P.a0]) arr[w] = arr[i];
        }
        const k = Math.exp(-P.drag[w] * dt);
        P.v[w * 3] *= k; P.v[w * 3 + 1] = P.v[w * 3 + 1] * k - P.g[w] * dt; P.v[w * 3 + 2] *= k;
        P.px[w * 3] += P.v[w * 3] * dt; P.px[w * 3 + 1] += P.v[w * 3 + 1] * dt; P.px[w * 3 + 2] += P.v[w * 3 + 2] * dt;
        P.rot[w] += P.spin[w] * dt;
        const t = 1 - P.life[w] / P.max[w];
        pos[w * 3] = P.px[w * 3]; pos[w * 3 + 1] = P.px[w * 3 + 1]; pos[w * 3 + 2] = P.px[w * 3 + 2];
        const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
        col[w * 4] = P.c[w * 3]; col[w * 4 + 1] = P.c[w * 3 + 1]; col[w * 4 + 2] = P.c[w * 3 + 2]; col[w * 4 + 3] = Math.max(0, fade) * P.a0[w];
        sz[w] = P.s0[w] + (P.s1[w] - P.s0[w]) * t;
        cr[w * 2] = P.cell[w]; cr[w * 2 + 1] = P.rot[w];
        w++;
      }
      P.n = w;
      geo.setDrawRange(0, w);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.pcolor.needsUpdate = true;
      geo.attributes.psize.needsUpdate = true;
      geo.attributes.pcr.needsUpdate = true;
    };
    return P;
  }

  // ------------------------------------------------------------ shared materials
  const ringMat = () => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 }, uW: { value: 0.2 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uA, uW; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; float edge = smoothstep(1.0, 1.0 - uW * 0.3, r) * smoothstep(1.0 - uW, 1.0 - uW * 0.4, r);
        float inner = smoothstep(1.0 - uW, 0.0, r) * 0.15;
        gl_FragColor = vec4(uColor * (1.0 + edge), (edge + inner) * uA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beamMat = () => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 }, uTime: { value: 0 }, uNoise: { value: SH.tex.noise } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uA, uTime; uniform sampler2D uNoise; varying vec2 vUv;
      void main(){ float d = abs(vUv.y - 0.5) * 2.0;
        float n = texture2D(uNoise, vec2(vUv.x * 2.0 - uTime * 3.0, vUv.y * 0.5)).g;
        float core = smoothstep(0.35, 0.0, d); float glow = smoothstep(1.0, 0.0, d) * (0.6 + n * 0.8);
        float ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
        vec3 c = uColor * glow * 1.6 + vec3(1.0) * core * 2.2;
        gl_FragColor = vec4(c, (glow * 0.8 + core) * uA * ends); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const slashMat = () => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uA, uT; varying vec2 vUv;
      void main(){ float along = vUv.x; float head = smoothstep(uT - 0.6, uT, along) * step(along, uT + 0.02);
        float w = 1.0 - abs(vUv.y - 0.5) * 2.0; float core = smoothstep(0.5, 1.0, w);
        vec3 c = uColor * 1.6 + vec3(1.0) * core * 1.5;
        gl_FragColor = vec4(c, head * w * uA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const pillarMat = () => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uA, uTime; varying vec2 vUv;
      void main(){ float a = (1.0 - vUv.y) * (0.65 + 0.35 * sin(vUv.y * 25.0 - uTime * 12.0 + vUv.x * 6.283 * 3.0));
        gl_FragColor = vec4(uColor * 1.3 + vec3(0.25) * (1.0 - vUv.y), a * uA * 0.75 * smoothstep(0.0, 0.05, vUv.y)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const trailMat = () => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 } },
    vertexShader: 'attribute float along; varying float vA; varying vec2 vUv; void main(){ vA = along; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uA; varying float vA; varying vec2 vUv;
      void main(){ float w = 1.0 - abs(vUv.y - 0.5) * 2.0; float a = pow(vA, 1.5) * smoothstep(0.0, 0.6, w);
        gl_FragColor = vec4(uColor * 1.5 + vec3(1.0) * smoothstep(0.7, 1.0, w) * vA, a * uA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });

  // ------------------------------------------------------------ FX
  class FX {
    constructor(scene, opts) {
      opts = opts || {};
      this.scene = scene;
      this.k = SH.Q.particles;
      this.add = cloud(Math.round(2200 * Math.max(0.5, this.k)), true);
      this.soft = cloud(Math.round(700 * Math.max(0.5, this.k)), false);
      scene.add(this.add.pts, this.soft.pts);
      this.items = [];
      const mk = (n, make) => { const a = []; for (let i = 0; i < n; i++) { const m = make(); m.visible = false; scene.add(m); a.push(m); } return a; };
      this.rings = mk(14, () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat()));
      this.beams = mk(10, () => {
        const g = new THREE.Group();
        const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beamMat());
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), a.material);
        a.rotation.x = -PI / 2; b.rotation.x = 0;
        g.add(a, b); g.userData.mat = a.material; return g;
      });
      this.slashes = mk(6, () => new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 40, 1, 0, PI * 0.9), slashMat()));
      this.pillars = mk(6, () => new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), pillarMat()));
      this.flashes = mk(10, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: SH.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      this.bolts = mk(8, () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(26 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(26 * 2 * 2), 2));
        const idx = [];
        for (let i = 0; i < 25; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        g.setIndex(idx);
        const uv = g.attributes.uv.array;
        for (let i = 0; i < 26; i++) { uv[i * 4] = i / 25; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / 25; uv[i * 4 + 3] = 1; }
        const m = new THREE.Mesh(g, beamMat());
        m.frustumCulled = false;
        return m;
      });
      this.trails = [];
      for (let i = 0; i < 6; i++) {
        const N = 28;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2 * 2), 2));
        g.setAttribute('along', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage));
        const idx = [];
        for (let k = 0; k < N - 1; k++) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        g.setIndex(idx);
        const uv = g.attributes.uv.array;
        for (let k = 0; k < N; k++) { uv[k * 4] = k / (N - 1); uv[k * 4 + 1] = 0; uv[k * 4 + 2] = k / (N - 1); uv[k * 4 + 3] = 1; }
        const m = new THREE.Mesh(g, trailMat());
        m.frustumCulled = false;
        m.visible = false;
        m.renderOrder = 18;
        scene.add(m);
        this.trails.push({ m, N, pts: [], target: null, w: 0.6, active: false, fade: 0 });
      }
      this.lights = [];
      for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 9, 2); scene.add(l); this.lights.push({ l, t: 0, max: 0 }); }
      this.time = 0;
      this.camera = opts.camera || null;
    }
    // ---- particles
    burst(p, o) {
      o = o || {};
      const n = Math.max(1, Math.round((o.n || 20) * this.k));
      const c = tmpC.set(o.color === undefined ? 0xffffff : o.color);
      const glow = o.glow === undefined ? 2 : o.glow;
      const P = o.soft ? this.soft : this.add;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * PI * 2, sp = (o.speed || 5) * (0.35 + Math.random() * 0.65);
        const up = o.up === undefined ? 0.6 : o.up;
        const el = (o.flat ? 0 : (Math.random() * 2 - 1) * 0.7) + up;
        const cv = o.vary ? 0.75 + Math.random() * 0.5 : 1;
        P.spawn(
          p.x + (Math.random() - 0.5) * (o.spread || 0.2), p.y + (Math.random() - 0.5) * (o.spread || 0.2) * 0.5, p.z + (Math.random() - 0.5) * (o.spread || 0.2),
          Math.cos(a) * sp, el * sp * 0.7, Math.sin(a) * sp,
          (o.life || 0.6) * (0.6 + Math.random() * 0.6), (o.size || 40) * (0.6 + Math.random() * 0.6), (o.size1 === undefined ? (o.size || 40) * 0.2 : o.size1),
          c.r * glow * cv, c.g * glow * cv, c.b * glow * cv, o.grav === undefined ? 6 : o.grav, o.drag === undefined ? 2 : o.drag, o.cell === undefined ? 1 : o.cell, o.alpha || 1,
        );
      }
    }
    smoke(p, o) {
      o = o || {};
      this.burst(p, Object.assign({ soft: true, cell: 2, color: o.color || 0x8a8a90, glow: 1, speed: 1.6, life: 1.2, size: 120, size1: 220, grav: -0.8, drag: 2.5, n: 8, alpha: 0.7 }, o));
    }
    // a single particle with exact settings
    spark(p, v, o) {
      const c = tmpC.set(o.color === undefined ? 0xffffff : o.color);
      const glow = o.glow === undefined ? 2 : o.glow;
      (o.soft ? this.soft : this.add).spawn(p.x, p.y, p.z, v.x, v.y, v.z, o.life || 0.5, o.size || 30, o.size1 === undefined ? (o.size || 30) * 0.3 : o.size1, c.r * glow, c.g * glow, c.b * glow, o.grav || 0, o.drag || 0, o.cell === undefined ? 0 : o.cell, o.alpha || 1);
    }
    // ---- shapes
    _take(pool) { const m = pool.find((x) => !x.visible) || pool[0]; m.visible = true; return m; }
    ring(p, o) {
      o = o || {};
      const m = this._take(this.rings);
      m.material.uniforms.uColor.value.set(o.color === undefined ? 0xffffff : o.color).multiplyScalar(o.glow || 1.5);
      m.material.uniforms.uW.value = o.width || 0.25;
      m.position.set(p.x, (p.y || 0) + 0.06, p.z);
      m.rotation.set(o.vertical ? 0 : -PI / 2, 0, 0);
      if (o.face) m.quaternion.copy(o.face);
      this.items.push({ m, t: 0, life: o.life || 0.5, kind: 'ring', r0: o.r0 || 0.2, r1: o.r1 || 3 });
    }
    flash(p, o) {
      o = o || {};
      const m = this._take(this.flashes);
      m.material.color.set(o.color === undefined ? 0xffffff : o.color).multiplyScalar(o.glow || 2.5);
      m.position.copy(p);
      this.items.push({ m, t: 0, life: o.life || 0.25, kind: 'flash', s0: o.size || 3, s1: (o.size || 3) * (o.grow || 1.6) });
      if (o.light !== false) this.light(p, o.color, o.light || 3, o.life ? o.life * 1.5 : 0.35);
    }
    light(p, color, intensity, life) {
      const L = this.lights.reduce((a, b) => (a.t <= 0 ? a : b.t <= 0 ? b : a.t < b.t ? a : b));
      L.l.color.set(color === undefined ? 0xffffff : color);
      L.l.position.set(p.x, (p.y || 0) + 1.2, p.z);
      L.t = life || 0.35; L.max = L.t; L.i = intensity || 3;
    }
    beam(a, b, o) {
      o = o || {};
      const g = this._take(this.beams);
      const mat = g.userData.mat;
      mat.uniforms.uColor.value.set(o.color === undefined ? 0x7ad8ff : o.color);
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      g.position.set((a.x + b.x) / 2, (o.y === undefined ? 0.6 : o.y), (a.z + b.z) / 2);
      g.rotation.set(0, -Math.atan2(dz, dx), 0);
      g.scale.set(len, 1, 1);
      const w = o.width || 0.9;
      g.children[0].scale.set(1, w, 1);
      g.children[1].scale.set(1, w * 0.8, 1);
      this.items.push({ m: g, t: 0, life: o.life || 0.45, kind: 'beam', w, mat });
    }
    bolt(a, b, o) {
      o = o || {};
      const m = this._take(this.bolts);
      m.material.uniforms.uColor.value.set(o.color === undefined ? 0xbfe8ff : o.color);
      this.items.push({ m, t: 0, life: o.life || 0.3, kind: 'bolt', a: a.clone(), b: b.clone(), w: o.width || 0.35, jit: 0 });
      this._boltShape(this.items[this.items.length - 1]);
    }
    _boltShape(it) {
      const p = it.m.geometry.attributes.position.array;
      const a = it.a, b = it.b;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      let off = 0;
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        off = i === 0 || i === 25 ? 0 : off * 0.5 + (Math.random() - 0.5) * len * 0.12;
        const x = a.x + dx * t + nx * off, z = a.z + dz * t + nz * off, y = U.lerp(a.y, b.y, t) + Math.sin(t * PI) * 0.4;
        const w = it.w * (1 - Math.abs(t - 0.5) * 0.6);
        p[i * 6] = x - nx * w; p[i * 6 + 1] = y; p[i * 6 + 2] = z - nz * w;
        p[i * 6 + 3] = x + nx * w; p[i * 6 + 4] = y; p[i * 6 + 5] = z + nz * w;
      }
      it.m.geometry.attributes.position.needsUpdate = true;
    }
    slash(p, angle, o) {
      o = o || {};
      const m = this._take(this.slashes);
      m.material.uniforms.uColor.value.set(o.color === undefined ? 0xffffff : o.color);
      m.position.set(p.x, (p.y || 0) + (o.y || 0.8), p.z);
      m.rotation.set(-PI / 2 + (o.tilt || 0), 0, angle);
      m.scale.setScalar(o.r || 2);
      this.items.push({ m, t: 0, life: o.life || 0.3, kind: 'slash' });
    }
    pillar(p, o) {
      o = o || {};
      const m = this._take(this.pillars);
      m.material.uniforms.uColor.value.set(o.color === undefined ? 0xffe08a : o.color);
      const h = o.h || 12;
      m.position.set(p.x, h / 2, p.z);
      m.scale.set(o.r || 1, h, o.r || 1);
      this.items.push({ m, t: 0, life: o.life || 0.9, kind: 'pillar', r: o.r || 1 });
    }
    // ribbon behind a moving object (an Object3D or anything with .position)
    trail(target, color, width) {
      const T = this.trails.find((t) => !t.active && t.fade <= 0) || this.trails[0];
      T.active = true; T.target = target; T.pts = []; T.w = width || 0.6; T.fade = 1;
      T.m.material.uniforms.uColor.value.set(color === undefined ? 0xffffff : color);
      T.m.visible = true;
      return T;
    }
    stopTrail(T) { if (T) T.active = false; }
    // ---- update
    update(dt) {
      this.time += dt;
      this.add.update(dt);
      this.soft.update(dt);
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.t += dt;
        const k = Math.min(1, it.t / it.life);
        const m = it.m;
        if (it.kind === 'ring') {
          const r = it.r0 + (it.r1 - it.r0) * U.easeOut(k);
          m.scale.set(r * 2, r * 2, 1);
          m.material.uniforms.uA.value = 1 - k;
        } else if (it.kind === 'flash') {
          const s = it.s0 + (it.s1 - it.s0) * k;
          m.scale.set(s, s, 1);
          m.material.opacity = 1 - k * k;
        } else if (it.kind === 'beam') {
          it.mat.uniforms.uTime.value = this.time;
          const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
          it.mat.uniforms.uA.value = a;
          m.children[0].scale.y = it.w * (0.5 + a * 0.7);
          m.children[1].scale.y = it.w * 0.8 * (0.5 + a * 0.7);
        } else if (it.kind === 'bolt') {
          it.jit += dt;
          if (it.jit > 0.04) { it.jit = 0; this._boltShape(it); }
          m.material.uniforms.uTime.value = this.time;
          m.material.uniforms.uA.value = 1 - k;
        } else if (it.kind === 'slash') {
          m.material.uniforms.uT.value = U.easeOut(Math.min(1, k * 1.6)) * 1.1;
          m.material.uniforms.uA.value = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        } else if (it.kind === 'pillar') {
          m.material.uniforms.uTime.value = this.time;
          m.material.uniforms.uA.value = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
          const r = it.r * (1 + Math.sin(k * PI) * 0.2);
          m.scale.x = m.scale.z = r;
        }
        if (k >= 1) { m.visible = false; this.items.splice(i, 1); }
      }
      for (const T of this.trails) {
        if (!T.m.visible) continue;
        if (T.active && T.target) {
          const p = T.target.position;
          T.pts.unshift(new V3(p.x, (T.target.trailY || 0.5), p.z));
          if (T.pts.length > T.N) T.pts.pop();
        } else {
          T.fade -= dt * 3;
          if (T.pts.length > 1) T.pts.pop();
          if (T.fade <= 0 || T.pts.length < 2) { T.m.visible = false; T.fade = 0; continue; }
        }
        const pos = T.m.geometry.attributes.position.array, al = T.m.geometry.attributes.along.array;
        const n = T.pts.length;
        for (let k = 0; k < T.N; k++) {
          const q = T.pts[Math.min(k, n - 1)];
          const q2 = T.pts[Math.min(k + 1, n - 1)] || q;
          let dx = q.x - q2.x, dz = q.z - q2.z;
          const len = Math.hypot(dx, dz) || 1;
          dx /= len; dz /= len;
          const w = T.w * (1 - k / T.N);
          pos[k * 6] = q.x - dz * w; pos[k * 6 + 1] = q.y; pos[k * 6 + 2] = q.z + dx * w;
          pos[k * 6 + 3] = q.x + dz * w; pos[k * 6 + 4] = q.y; pos[k * 6 + 5] = q.z - dx * w;
          const a = k < n ? (1 - k / T.N) * Math.max(0, T.active ? 1 : T.fade) : 0;
          al[k * 2] = a; al[k * 2 + 1] = a;
        }
        T.m.geometry.attributes.position.needsUpdate = true;
        T.m.geometry.attributes.along.needsUpdate = true;
      }
      for (const L of this.lights) {
        if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.t / L.max) * L.i; } else L.l.intensity = 0;
      }
      const sc = SH.size.h * Math.min(2, SH.renderer.getPixelRatio()) * 0.5;
      this.add.pts.material.uniforms.uScale.value = sc * 0.04;
      this.soft.pts.material.uniforms.uScale.value = sc * 0.04;
    }
    // show every material once so the shaders compile during loading
    warm() {
      for (const pool of [this.rings, this.beams, this.slashes, this.pillars, this.flashes, this.bolts]) pool.forEach((m) => { m.visible = true; });
      this.trails.forEach((t) => { t.m.visible = true; });
    }
    unwarm() {
      for (const pool of [this.rings, this.beams, this.slashes, this.pillars, this.flashes, this.bolts]) pool.forEach((m) => { m.visible = false; });
      this.trails.forEach((t) => { t.m.visible = false; });
      this.items.length = 0;
    }
    clear() { this.add.n = 0; this.soft.n = 0; this.unwarm(); }
  }
  SH.FX = FX;

  // ------------------------------------------------------------ floating numbers
  const layer = U.$('fx-layer');
  const pool = [];
  const live = [];
  const vp = new V3();
  SH.numbers = {
    show(pos, text, cls, size, camera) {
      if (!SH.settings.numbers && cls !== 'txt' && cls !== 'heal') return;
      let e = pool.pop();
      if (!e) { e = U.el('div', 'dmg'); layer.appendChild(e); }
      e.className = 'dmg ' + (cls || '');
      e.textContent = text;
      e.style.fontSize = (size || 1.3) + 'em';
      e.style.display = '';
      live.push({ e, p: pos.clone(), t: 0, life: cls === 'txt' ? 1.2 : 0.9, dx: (Math.random() - 0.5) * 30, cam: camera });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const n = live[i];
        n.t += dt;
        const k = n.t / n.life;
        if (k >= 1) { n.e.style.display = 'none'; pool.push(n.e); live.splice(i, 1); continue; }
        vp.copy(n.p).project(n.cam);
        const x = (vp.x * 0.5 + 0.5) * SH.size.w + n.dx * k, y = (-vp.y * 0.5 + 0.5) * SH.size.h - 40 * U.easeOut(k) - 10;
        const s = k < 0.12 ? 0.4 + (k / 0.12) * 0.9 : k < 0.25 ? 1.3 - (k - 0.12) / 0.13 * 0.3 : 1;
        n.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        n.e.style.opacity = k > 0.7 ? (1 - (k - 0.7) / 0.3).toFixed(3) : '1';
      }
    },
    clear() { while (live.length) { const n = live.pop(); n.e.style.display = 'none'; pool.push(n.e); } },
  };
  SH.onFrame((dt) => SH.numbers.update(dt));
})();
