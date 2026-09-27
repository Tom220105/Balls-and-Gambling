/* ==========================================================================
   BALLS & GAMBLING — 3D models shared by the game, the collection and the lottery:
   ball skins, bouncepads, data boxes, coins, the neon environment map, and a
   small second renderer ("stage3d") that draws previews inside the menus.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = (window.NEON = window.NEON || {});
  if (!window.THREE || !THREE.RoundedBoxGeometry) return;

  const R = 0.36;   // ball radius in world units
  const C = {
    cyan: 0x19e6ff, magenta: 0xff3cf2, violet: 0xa64dff, lime: 0x8dff2a, red: 0xff2a4d,
    orange: 0xff9a1f, gold: 0xffc933, blue: 0x4d7cff, white: 0xe8f0ff,
  };
  const WHITE = new THREE.Color(0xffffff);
  const TS = 2;   // texture supersampling

  // ------------------------------------------------------------- helpers
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w * TS; c.height = h * TS;
    const g = c.getContext('2d');
    g.scale(TS, TS);
    return { c, g };
  }

  function toTex(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 8;
    return t;
  }

  const texCache = {};
  function cachedTex(key, draw) {
    if (!texCache[key]) texCache[key] = toTex(draw());
    return texCache[key];
  }

  const geoCache = {};
  function geo(key, make) {
    if (!geoCache[key]) geoCache[key] = make();
    return geoCache[key];
  }

  function rgba(hex, a) {
    return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
  }
  const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

  const glowTex = (() => {
    const { c, g } = makeCanvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return toTex(c);
  })();

  function glow(color, scale, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity: opacity === undefined ? 1 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.set(scale, scale, 1);
    return s;
  }

  // Fresnel rim shell — glows at grazing angles, transparent face-on
  function fresnel(color, power, intensity) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uPower: { value: power },
        uIntensity: { value: intensity },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */`
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uPower;
        uniform float uIntensity;
        uniform float uOpacity;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), uPower);
          gl_FragColor = vec4(uColor * uIntensity, f * uOpacity);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  const sphereGeo = () => geo('sphere', () => new THREE.SphereGeometry(R, 40, 28));
  const shellGeo = () => geo('shell', () => new THREE.SphereGeometry(R * 1.14, 40, 28));

  const _axis = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  function roll(obj, dt, dx, dz, speed) {
    if (!speed) return;
    _axis.set(dz, 0, -dx);
    const l = _axis.length();
    if (l < 1e-5) return;
    _axis.divideScalar(l);
    _q.setFromAxisAngle(_axis, (speed * dt) / R);
    obj.quaternion.premultiply(_q);
  }

  // ------------------------------------------------------------ textures
  function pixelCanvas() {
    const { c, g } = makeCanvas(128, 128);
    const cols = ['#0c3a18', '#138a34', '#39ff6a', '#b8ffc8'];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const edge = x === 0 || y === 0 || x === 7 || y === 7;
        const v = edge ? 3 : ((x * 7 + y * 13) % 5 === 0 ? 2 : (x + y) % 3 === 0 ? 1 : 0);
        g.fillStyle = cols[v];
        g.fillRect(x * 16, y * 16, 16, 16);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x * 16, y * 16 + 14, 16, 2);
      }
    }
    return c;
  }

  function magmaCanvas() {
    const { c, g } = makeCanvas(256, 128);
    g.fillStyle = '#140502';
    g.fillRect(0, 0, 256, 128);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      let x = rnd() * 256, y = rnd() * 128;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
      g.shadowColor = '#ffcc33';
      g.shadowBlur = 10 * TS;
      g.strokeStyle = k % 3 ? '#ff6a10' : '#ffd040';
      g.lineWidth = 2 + rnd() * 4;
      g.stroke();
    }
    g.shadowBlur = 0;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rgba(0xffb030, 0.4 + rnd() * 0.6);
      g.beginPath(); g.arc(rnd() * 256, rnd() * 128, 1 + rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  function diskCanvas() {
    const { c, g } = makeCanvas(256, 256);
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.43, 'rgba(0,0,0,0)');
    grd.addColorStop(0.46, 'rgba(255,240,210,1)');
    grd.addColorStop(0.55, 'rgba(255,140,60,0.9)');
    grd.addColorStop(0.72, 'rgba(170,70,255,0.55)');
    grd.addColorStop(1, 'rgba(60,0,120,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 18; i++) {
      g.lineWidth = 1 + (i % 3);
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.arc(128, 128, 62 + i * 3.3, i * 0.7, i * 0.7 + 1.6 + (i % 4) * 0.4);
      g.stroke();
    }
    return c;
  }

  function boxCanvas(col, label) {
    const { c, g } = makeCanvas(256, 256);
    g.fillStyle = '#080816';
    g.fillRect(0, 0, 256, 256);
    // hex mesh
    g.strokeStyle = rgba(col, 0.22);
    g.lineWidth = 1.5;
    const s = 12, hw = Math.sqrt(3) * s;
    for (let row = 0; row * s * 1.5 < 270; row++) {
      for (let x = (row % 2) * hw / 2; x < 270; x += hw) {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = x + Math.cos(a) * (s - 1.5), py = row * s * 1.5 + Math.sin(a) * (s - 1.5);
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
        g.stroke();
      }
    }
    // frame
    g.shadowColor = css(col);
    g.shadowBlur = 12 * TS;
    g.strokeStyle = css(col);
    g.lineWidth = 6;
    g.strokeRect(14, 14, 228, 228);
    g.lineWidth = 2;
    g.strokeRect(26, 26, 204, 204);
    // emblem: sigil star inside a ring
    g.lineWidth = 5;
    g.beginPath(); g.arc(128, 116, 54, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + ((k * 2) % 5) * (Math.PI * 2) / 5;
      const px = 128 + Math.cos(a) * 50, py = 116 + Math.sin(a) * 50;
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.stroke();
    g.shadowBlur = 8 * TS;
    g.fillStyle = '#ffffff';
    g.font = '900 30px Orbitron, "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 128, 206);
    return c;
  }

  // --------------------------------------------------------------- balls
  // Each factory returns { group, trail, trail2?, light, update(dt, t, dx, dz, speed) }
  const BALLS = {
    core() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(sphereGeo(), new THREE.MeshStandardMaterial({
        color: 0xdffcff, emissive: 0x7ff4ff, emissiveIntensity: 1.25, roughness: 0.15, metalness: 0.1,
      }));
      g.add(body, new THREE.Mesh(shellGeo(), fresnel(C.cyan, 2.2, 1.8)), glow(C.cyan, 2.6, 0.9));
      return { group: g, trail: C.cyan, light: C.cyan, update() {} };
    },

    shard() {
      const g = new THREE.Group();
      const cg = geo('ico', () => new THREE.IcosahedronGeometry(R * 1.22, 0));
      const crystal = new THREE.Mesh(cg, new THREE.MeshPhysicalMaterial({
        color: 0x1d4a08, emissive: C.lime, emissiveIntensity: 0.55, roughness: 0.06, metalness: 0.3,
        clearcoat: 1, flatShading: true,
      }));
      crystal.add(new THREE.LineSegments(geo('icoEdges', () => new THREE.EdgesGeometry(cg)),
        new THREE.LineBasicMaterial({ color: 0xe2ffc0 })));
      const core = new THREE.Mesh(geo('coreS', () => new THREE.SphereGeometry(R * 0.42, 16, 12)),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      g.add(crystal, core, glow(C.lime, 2.4, 0.85));
      return {
        group: g, trail: C.lime, light: C.lime,
        update(dt) { crystal.rotation.x += dt * 2.3; crystal.rotation.y += dt * 3.1; },
      };
    },

    pixel() {
      const g = new THREE.Group();
      const t = cachedTex('pixel', pixelCanvas);
      const cube = new THREE.Mesh(geo('pixCube', () => new THREE.BoxGeometry(R * 1.4, R * 1.4, R * 1.4)),
        new THREE.MeshStandardMaterial({ color: 0x224422, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.2 }));
      const bits = new THREE.Group();
      const bitGeo = geo('bit', () => new THREE.BoxGeometry(0.09, 0.09, 0.09));
      const bitMat = new THREE.MeshBasicMaterial({ color: 0x9dffb0 });
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(bitGeo, bitMat);
        const a = (i / 6) * Math.PI * 2;
        b.position.set(Math.cos(a) * R * 1.65, i % 2 ? 0.12 : -0.12, Math.sin(a) * R * 1.65);
        bits.add(b);
      }
      g.add(cube, bits, glow(0x39ff6a, 2.4, 0.8));
      return {
        group: g, trail: 0x39ff6a, light: 0x39ff6a,
        update(dt) { cube.rotation.x += dt * 1.7; cube.rotation.y += dt * 2.2; bits.rotation.y -= dt * 3; },
      };
    },

    magma() {
      const g = new THREE.Group();
      const t = cachedTex('magma', magmaCanvas);
      const body = new THREE.Mesh(sphereGeo(), new THREE.MeshStandardMaterial({
        color: 0x331008, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.6, roughness: 0.75, metalness: 0.1,
      }));
      g.add(body, new THREE.Mesh(shellGeo(), fresnel(0xff5a1f, 2.0, 1.8)), glow(0xff6a1f, 2.8, 0.9));
      return {
        group: g, trail: 0xff6a1f, light: 0xff7a2a,
        update(dt, time, dx, dz, speed) { roll(body, dt, dx, dz, speed); body.rotation.y += dt * 0.3; },
      };
    },

    glitch() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(sphereGeo(), new THREE.MeshStandardMaterial({
        color: 0xffe6ff, emissive: 0xff7af5, emissiveIntensity: 1.1, roughness: 0.2,
      }));
      const shellA = new THREE.Mesh(shellGeo(), fresnel(C.red, 1.6, 2.2));
      const shellB = new THREE.Mesh(shellGeo(), fresnel(C.cyan, 1.6, 2.2));
      const cage = new THREE.LineSegments(
        geo('cage', () => new THREE.EdgesGeometry(new THREE.BoxGeometry(R * 1.9, R * 1.9, R * 1.9))),
        new THREE.LineBasicMaterial({ color: C.magenta, transparent: true, opacity: 0.8 }),
      );
      g.add(body, shellA, shellB, cage, glow(C.magenta, 2.6, 0.9));
      let jt = 0;
      return {
        group: g, trail: C.magenta, trail2: C.cyan, light: C.magenta,
        update(dt) {
          jt -= dt;
          if (jt > 0) return;
          jt = 0.05 + Math.random() * 0.12;
          const j = Math.random() < 0.3 ? 0.14 : 0.05;
          shellA.position.set((Math.random() - 0.5) * j, 0, (Math.random() - 0.5) * j);
          shellB.position.set(-shellA.position.x, 0, -shellA.position.z);
          cage.visible = Math.random() < 0.6;
          cage.rotation.set(Math.random() * 6, Math.random() * 6, 0);
        },
      };
    },

    gyro() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(sphereGeo(), new THREE.MeshStandardMaterial({
        color: 0xffc933, emissive: 0x8a5a00, emissiveIntensity: 0.9, roughness: 0.16, metalness: 1,
      }));
      const ringGeo = geo('gyroRing', () => new THREE.TorusGeometry(R * 1.45, 0.035, 8, 48));
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe28a });
      const r1 = new THREE.Mesh(ringGeo, ringMat);
      const r2 = new THREE.Mesh(ringGeo, ringMat);
      g.add(body, r1, r2, glow(C.gold, 2.5, 0.8));
      return {
        group: g, trail: C.gold, light: C.gold,
        update(dt, time, dx, dz, speed) {
          roll(body, dt, dx, dz, speed);
          r1.rotation.x += dt * 3;
          r2.rotation.y += dt * 4;
          r2.rotation.z += dt * 1.3;
        },
      };
    },

    nova() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(sphereGeo(), new THREE.MeshBasicMaterial({ color: 0xfff4c8 }));
      const corona = new THREE.Group();
      const spikeGeo = geo('spike', () => {
        const c = new THREE.ConeGeometry(0.07, 0.34, 6);
        c.translate(0, R + 0.12, 0);
        return c;
      });
      const spikeMat = new THREE.MeshBasicMaterial({ color: 0xffc040 });
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 14; i++) {
        const y = 1 - ((i + 0.5) / 14) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
        const s = new THREE.Mesh(spikeGeo, spikeMat);
        s.quaternion.setFromUnitVectors(up, new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
        corona.add(s);
      }
      g.add(body, new THREE.Mesh(shellGeo(), fresnel(0xffb020, 1.5, 2.5)), corona,
        glow(0xff9a1f, 3.6, 0.9), glow(0xffffff, 1.4, 0.8));
      return {
        group: g, trail: 0xffb020, light: 0xffb020,
        update(dt, time) {
          corona.rotation.y += dt * 1.5;
          corona.rotation.x += dt * 0.7;
          corona.scale.setScalar(1 + Math.sin(time * 9) * 0.06);
        },
      };
    },

    void() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(sphereGeo(), new THREE.MeshStandardMaterial({
        color: 0x020005, roughness: 0.05, metalness: 1, envMapIntensity: 0.6,
      }));
      const disk = new THREE.Mesh(geo('disk', () => new THREE.RingGeometry(R * 1.25, R * 2.8, 72)),
        new THREE.MeshBasicMaterial({
          map: cachedTex('disk', diskCanvas), transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        }));
      const tilt = new THREE.Group();
      tilt.rotation.x = -Math.PI / 2 + 0.45;
      tilt.add(disk);
      g.add(body, new THREE.Mesh(shellGeo(), fresnel(0xa64dff, 1.3, 3.0)), tilt, glow(0x7a2dff, 3.2, 0.8));
      return {
        group: g, trail: 0xa64dff, light: 0xb86dff,
        update(dt) { disk.rotation.z += dt * 2.5; },
      };
    },
  };

  // translucent copy for the Glitch Orb's ghost balls
  function ghostify(group) {
    group.traverse((o) => {
      if (!o.material) return;
      const m = o.material.clone();
      m.transparent = true;
      m.depthWrite = false;
      if (m.uniforms && m.uniforms.uOpacity) m.uniforms.uOpacity.value = 0.45;
      else m.opacity = (m.opacity === undefined ? 1 : m.opacity) * 0.4;
      o.material = m;
    });
  }

  function makeBall(id, opts) {
    const m = (BALLS[id] || BALLS.core)();
    // tone down glare: small, faint halos, soft rim shells, and bodies dim and
    // matte enough that bloom no longer turns the ball into a white blob
    m.group.traverse((o) => {
      const mt = o.material;
      if (!mt) return;
      if (o.isSprite) {
        o.scale.multiplyScalar(0.55);
        mt.opacity *= 0.38;
      } else if (mt.uniforms && mt.uniforms.uIntensity) {
        mt.uniforms.uIntensity.value *= 0.38;
      } else if (mt.isMeshStandardMaterial) {
        mt.emissiveIntensity = Math.min(0.6, mt.emissiveIntensity * 0.5);
        mt.roughness = Math.max(mt.roughness, 0.38);
        mt.envMapIntensity *= 0.55;
        if (mt.clearcoat) mt.clearcoatRoughness = Math.max(mt.clearcoatRoughness, 0.35);
      } else if (mt.isMeshBasicMaterial && mt.blending !== THREE.AdditiveBlending) {
        mt.color.multiplyScalar(0.72);   // unlit white cores and spikes
      } else if (mt.isLineBasicMaterial) {
        mt.color.multiplyScalar(0.8);
      }
    });
    if (opts && opts.ghost) ghostify(m.group);
    return m;
  }

  // swept-back wing used by the Seraph-X pad and the Archangel gun
  function wingGeometry() {
    return geo('wing', () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.2);
      s.lineTo(0.7, -0.05);
      s.lineTo(1.05, 0.45);
      s.lineTo(0.62, 0.3);
      s.lineTo(0.78, 0.72);
      s.lineTo(0.25, 0.45);
      s.lineTo(0, 0.3);
      s.closePath();
      const e = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
      e.rotateX(Math.PI / 2);
      return e;
    });
  }

  // ---------------------------------------------------------- bouncepads
  // Every pad shares a hull (body, rail, under-glow, laser cannons) and adds its own parts.
  function hull(cfg) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: cfg.body, metalness: 0.85, roughness: 0.28, emissive: cfg.bodyEmissive || 0x05060f,
    });
    const body = new THREE.Mesh(geo('padBody', () => new THREE.RoundedBoxGeometry(1, 0.42, 0.72, 2, 0.08)), bodyMat);
    body.position.y = 0.36;
    const railMat = new THREE.MeshBasicMaterial({ color: cfg.rail });
    const rail = new THREE.Mesh(geo('padRail', () => new THREE.BoxGeometry(1, 0.08, 0.2)), railMat);
    rail.position.y = 0.6;
    const front = new THREE.Mesh(geo('padFront', () => new THREE.BoxGeometry(1, 0.1, 0.05)), railMat);
    front.position.set(0, 0.36, -0.37);
    const under = new THREE.Mesh(geo('plane', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({
      map: glowTex, color: cfg.rail, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = 0.03;
    const cannonMat = new THREE.MeshBasicMaterial({ color: C.red });
    const cannonGeo = geo('cannon', () => new THREE.BoxGeometry(0.16, 0.3, 0.6));
    const cannonL = new THREE.Mesh(cannonGeo, cannonMat);
    const cannonR = new THREE.Mesh(cannonGeo, cannonMat);
    cannonL.position.y = cannonR.position.y = 0.7;
    cannonL.visible = cannonR.visible = false;
    g.add(under, body, rail, front, cannonL, cannonR);

    const api = {
      group: g, railMat, bodyMat, thruster: cfg.thruster || cfg.rail, railBase: new THREE.Color(cfg.rail),
      capInset: 0.36, layoutExtra: null, updateExtra: null, width: 1,
      layout(w) {
        api.width = w;
        body.scale.x = w - 0.5;
        rail.scale.x = w - 0.8;
        front.scale.x = w - 0.7;
        under.scale.set(w * 1.7, 3.2, 1);
        cannonL.position.x = -(w / 2 - 0.6);
        cannonR.position.x = w / 2 - 0.6;
        if (api.layoutExtra) api.layoutExtra(w);
      },
      setLaser(on) { cannonL.visible = cannonR.visible = !!on && !cfg.permanentCannons; },
      update(dt, t, st) {
        const stun = st && st.stun > 0, flash = st ? st.flash || 0 : 0;
        if (stun) railMat.color.setHex(Math.floor(t * 18) % 2 ? C.red : 0x330008);
        else railMat.color.copy(api.railBase).lerp(WHITE, flash);
        if (api.updateExtra) api.updateExtra(dt, t, st);
      },
    };
    return api;
  }

  function capPair(h, geometry, material, scale, y) {
    const L = new THREE.Mesh(geometry, material);
    const Rr = new THREE.Mesh(geometry, material);
    [L, Rr].forEach((c) => {
      if (scale) c.scale.copy(scale);
      c.position.y = y === undefined ? 0.36 : y;
      h.group.add(c);
    });
    return [L, Rr];
  }

  const PADS = {
    vector() {
      const h = hull({ body: 0x1b2140, rail: C.cyan, thruster: C.magenta });
      const capMat = new THREE.MeshStandardMaterial({ color: 0x2a0a3a, emissive: C.magenta, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.3 });
      const [L, Rr] = capPair(h, geo('capSphere', () => new THREE.SphereGeometry(0.4, 28, 18)), capMat, new THREE.Vector3(1, 0.75, 0.95));
      h.layoutExtra = (w) => { L.position.x = -(w / 2 - 0.36); Rr.position.x = w / 2 - 0.36; };
      return h;
    },

    pulse() {
      const h = hull({ body: 0x0d2622, rail: C.lime, thruster: 0x19e6c0 });
      const capMat = new THREE.MeshStandardMaterial({ color: 0x06302a, emissive: 0x19e6c0, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.3 });
      const [L, Rr] = capPair(h, geo('capSphere', () => new THREE.SphereGeometry(0.4, 28, 18)), capMat, new THREE.Vector3(0.9, 0.7, 0.9));
      const ringGeo = geo('pulseRing', () => new THREE.TorusGeometry(0.46, 0.045, 8, 36));
      const ringMat = new THREE.MeshBasicMaterial({ color: C.lime, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const rings = [new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(ringGeo, ringMat)];
      rings.forEach((r) => { r.rotation.y = Math.PI / 2; r.position.y = 0.36; h.group.add(r); });
      h.layoutExtra = (w) => {
        L.position.x = -(w / 2 - 0.36); Rr.position.x = w / 2 - 0.36;
        rings[0].position.x = -(w / 2 - 0.1); rings[1].position.x = w / 2 - 0.1;
      };
      h.updateExtra = (dt, t) => {
        const k = (t * 1.6) % 1;
        rings.forEach((r) => r.scale.setScalar(0.8 + k * 0.7));
        ringMat.opacity = 1 - k;
      };
      return h;
    },

    magnet() {
      const h = hull({ body: 0x2a0f16, rail: 0xf0f4ff, thruster: 0xff6a8a });
      const prongGeo = geo('prong', () => new THREE.RoundedBoxGeometry(0.36, 0.5, 0.95, 2, 0.06));
      const tipGeo = geo('prongTip', () => new THREE.BoxGeometry(0.38, 0.52, 0.14));
      const redMat = new THREE.MeshStandardMaterial({ color: 0x3a0610, emissive: C.red, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 });
      const blueMat = new THREE.MeshStandardMaterial({ color: 0x06103a, emissive: C.blue, emissiveIntensity: 1.1, metalness: 0.7, roughness: 0.3 });
      const tipMat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff });
      const pL = new THREE.Mesh(prongGeo, redMat), pR = new THREE.Mesh(prongGeo, blueMat);
      const tL = new THREE.Mesh(tipGeo, tipMat), tR = new THREE.Mesh(tipGeo, tipMat);
      [pL, pR].forEach((p) => { p.position.set(0, 0.4, -0.12); h.group.add(p); });
      [tL, tR].forEach((p) => { p.position.set(0, 0.4, -0.62); h.group.add(p); });
      const arcGeo = geo('magArc', () => new THREE.TorusGeometry(0.3, 0.02, 6, 24, Math.PI));
      const arcMat = new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const arcs = [];
      for (let i = 0; i < 6; i++) {
        const a = new THREE.Mesh(arcGeo, arcMat);
        a.rotation.y = Math.PI / 2;
        a.position.set(0, 0.4, -0.7);
        a.scale.setScalar(0.6 + (i % 3) * 0.3);
        arcs.push(a);
        h.group.add(a);
      }
      h.layoutExtra = (w) => {
        const x = w / 2 - 0.3;
        pL.position.x = tL.position.x = -x;
        pR.position.x = tR.position.x = x;
        arcs.forEach((a, i) => { a.position.x = i < 3 ? -x : x; });
      };
      h.updateExtra = (dt, t) => {
        arcMat.opacity = 0.35 + 0.35 * Math.sin(t * 14) * Math.sin(t * 5.3);
        arcs.forEach((a, i) => { a.rotation.x = Math.sin(t * 3 + i) * 0.5; });
      };
      return h;
    },

    aegis() {
      const h = hull({ body: 0x0d1a3a, rail: C.blue, thruster: 0x7fb0ff });
      const capGeo = geo('hexCap', () => { const c = new THREE.CylinderGeometry(0.38, 0.38, 0.5, 6); c.rotateZ(Math.PI / 2); return c; });
      const capMat = new THREE.MeshStandardMaterial({ color: 0x0a1a4a, emissive: C.blue, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.25 });
      const [L, Rr] = capPair(h, capGeo, capMat);
      const shieldGeo = geo('aegisShield', () => new THREE.BoxGeometry(1, 0.55, 0.04));
      const shieldMat = new THREE.MeshBasicMaterial({ color: 0x4d9cff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.add(new THREE.LineSegments(geo('aegisEdges', () => new THREE.EdgesGeometry(shieldGeo)), new THREE.LineBasicMaterial({ color: 0xa8ccff })));
      shield.position.set(0, 0.5, -0.62);
      shield.rotation.x = -0.35;
      h.group.add(shield);
      const emitter = new THREE.Mesh(geo('hexDisc', () => { const c = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6); return c; }), new THREE.MeshBasicMaterial({ color: 0xcfe2ff }));
      emitter.position.y = 0.66;
      h.group.add(emitter);
      h.layoutExtra = (w) => {
        L.position.x = -(w / 2 - 0.3); Rr.position.x = w / 2 - 0.3;
        shield.scale.x = w - 0.4;
      };
      h.updateExtra = (dt, t) => {
        shieldMat.opacity = 0.18 + 0.1 * Math.sin(t * 4);
        emitter.rotation.y += dt * 2;
      };
      return h;
    },

    twin() {
      const h = hull({ body: 0x240810, rail: C.red, thruster: 0xff6a3c, permanentCannons: true });
      const armorGeo = geo('twinArmor', () => new THREE.RoundedBoxGeometry(0.55, 0.5, 0.85, 2, 0.05));
      const armorMat = new THREE.MeshStandardMaterial({ color: 0x1a0508, emissive: 0x5a0010, metalness: 0.9, roughness: 0.25 });
      const [L, Rr] = capPair(h, armorGeo, armorMat);
      const barrelGeo = geo('barrel', () => { const c = new THREE.CylinderGeometry(0.1, 0.13, 0.95, 14); c.rotateX(Math.PI / 2); return c; });
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a34, metalness: 1, roughness: 0.2 });
      const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xff5a6a });
      const barrels = [], muzzles = [], flares = [];
      for (let i = 0; i < 2; i++) {
        const b = new THREE.Mesh(barrelGeo, barrelMat);
        b.position.set(0, 0.74, -0.2);
        const m = new THREE.Mesh(geo('muzzle', () => new THREE.TorusGeometry(0.11, 0.03, 6, 16)), muzzleMat);
        m.position.set(0, 0.74, -0.68);
        const f = glow(C.red, 0.9, 0.9);
        f.position.set(0, 0.74, -0.72);
        barrels.push(b); muzzles.push(m); flares.push(f);
        h.group.add(b, m, f);
      }
      h.layoutExtra = (w) => {
        const x = w / 2 - 0.3;
        L.position.x = -x; Rr.position.x = x;
        [barrels, muzzles, flares].forEach((arr) => { arr[0].position.x = -x; arr[1].position.x = x; });
      };
      h.updateExtra = (dt, t) => { flares.forEach((f) => { f.material.opacity = 0.5 + 0.4 * Math.sin(t * 8); }); };
      return h;
    },

    tesla() {
      const h = hull({ body: 0x180d2e, rail: 0xb84dff, thruster: 0xc58cff });
      const rodGeo = geo('rod', () => new THREE.CylinderGeometry(0.07, 0.09, 1.0, 10));
      const rodMat = new THREE.MeshStandardMaterial({ color: 0x3a3450, metalness: 1, roughness: 0.25 });
      const coilGeo = geo('coil', () => new THREE.TorusGeometry(0.2, 0.045, 8, 24));
      const coilMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, emissive: 0xb84dff, emissiveIntensity: 0.6, metalness: 1, roughness: 0.3 });
      const topMat = new THREE.MeshBasicMaterial({ color: 0xf0d8ff });
      const towers = [];
      for (let i = 0; i < 2; i++) {
        const t = new THREE.Group();
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.y = 0.8;
        t.add(rod);
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(coilGeo, coilMat);
          c.rotation.x = Math.PI / 2;
          c.position.y = 0.55 + k * 0.2;
          c.scale.setScalar(1 - k * 0.2);
          t.add(c);
        }
        const top = new THREE.Mesh(geo('teslaTop', () => new THREE.SphereGeometry(0.13, 16, 12)), topMat);
        top.position.y = 1.35;
        t.add(top, (() => { const s = glow(0xc58cff, 1.2, 0.9); s.position.y = 1.35; return s; })());
        towers.push(t);
        h.group.add(t);
      }
      const N = 12;
      const arcPos = new Float32Array(N * 3);
      const arcGeo = new THREE.BufferGeometry();
      arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
      const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0xe8d0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      arc.frustumCulled = false;
      h.group.add(arc);
      let jt = 0;
      h.layoutExtra = (w) => { towers[0].position.x = -(w / 2 - 0.3); towers[1].position.x = w / 2 - 0.3; };
      h.updateExtra = (dt, t) => {
        jt -= dt;
        if (jt > 0) return;
        jt = 0.05;
        const x0 = towers[0].position.x, x1 = towers[1].position.x;
        for (let i = 0; i < N; i++) {
          const k = i / (N - 1);
          const inner = i > 0 && i < N - 1;
          arcPos[i * 3] = x0 + (x1 - x0) * k;
          arcPos[i * 3 + 1] = 1.35 + (inner ? Math.sin(k * Math.PI) * 0.25 + (Math.random() - 0.5) * 0.3 : 0);
          arcPos[i * 3 + 2] = inner ? (Math.random() - 0.5) * 0.3 : 0;
        }
        arcGeo.attributes.position.needsUpdate = true;
        arc.material.opacity = Math.random() < 0.25 ? 0.15 : 0.9;
      };
      return h;
    },

    chrono() {
      const h = hull({ body: 0x16130a, rail: C.gold, thruster: C.cyan });
      const capMat = new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: C.cyan, emissiveIntensity: 0.5, metalness: 1, roughness: 0.2 });
      const [L, Rr] = capPair(h, geo('capSphere', () => new THREE.SphereGeometry(0.4, 28, 18)), capMat, new THREE.Vector3(0.9, 0.75, 0.9));
      const clock = new THREE.Group();
      clock.position.set(0, 1.0, 0);
      clock.rotation.x = -0.9;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd86a });
      clock.add(new THREE.Mesh(geo('clockRing', () => new THREE.TorusGeometry(0.5, 0.03, 8, 48)), ringMat));
      const tickGeo = geo('tick', () => new THREE.BoxGeometry(0.03, 0.12, 0.02));
      for (let i = 0; i < 12; i++) {
        const tk = new THREE.Mesh(tickGeo, ringMat);
        const a = (i / 12) * Math.PI * 2;
        tk.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0);
        tk.rotation.z = a + Math.PI / 2;
        clock.add(tk);
      }
      const handGeo = geo('hand', () => { const b = new THREE.BoxGeometry(0.03, 0.34, 0.02); b.translate(0, 0.17, 0); return b; });
      const handMin = new THREE.Mesh(handGeo, new THREE.MeshBasicMaterial({ color: C.cyan }));
      const handHour = new THREE.Mesh(handGeo, ringMat);
      handHour.scale.y = 0.65;
      clock.add(handMin, handHour, glow(C.gold, 1.6, 0.5));
      h.group.add(clock);
      h.layoutExtra = (w) => { L.position.x = -(w / 2 - 0.36); Rr.position.x = w / 2 - 0.36; };
      h.updateExtra = (dt) => { handMin.rotation.z -= dt * 2.4; handHour.rotation.z -= dt * 0.2; };
      return h;
    },

    seraph() {
      const h = hull({ body: 0xd9e0f0, rail: C.gold, bodyEmissive: 0x1a1408, thruster: 0xffe8a0 });
      const wingGeo = wingGeometry();
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xf2f5ff, emissive: 0x3a2a08, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xffd86a });
      const wingEdges = geo('wingEdges', () => new THREE.EdgesGeometry(wingGeo, 30));
      const wings = [];
      for (let i = 0; i < 2; i++) {
        const w = new THREE.Group();
        const m = new THREE.Mesh(wingGeo, wingMat);
        m.add(new THREE.LineSegments(wingEdges, edgeMat));
        w.add(m);
        w.position.y = 0.5;
        if (i === 0) w.scale.x = -1;
        wings.push(w);
        h.group.add(w);
      }
      const halo = new THREE.Mesh(geo('halo', () => new THREE.TorusGeometry(0.42, 0.035, 8, 48)), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
      halo.position.y = 1.15;
      halo.rotation.x = Math.PI / 2 - 0.5;
      h.group.add(halo);
      const hg = glow(C.gold, 1.8, 0.6);
      hg.position.y = 1.15;
      h.group.add(hg);
      h.layoutExtra = (w) => { wings[0].position.x = -(w / 2 - 0.25); wings[1].position.x = w / 2 - 0.25; };
      h.updateExtra = (dt, t) => {
        const flap = Math.sin(t * 3) * 0.12;
        wings[0].rotation.z = -flap;
        wings[1].rotation.z = flap;
        halo.position.y = 1.15 + Math.sin(t * 2) * 0.06;
        halo.rotation.z += dt * 0.8;
      };
      return h;
    },
  };

  function makePad(id) {
    const p = (PADS[id] || PADS.vector)();
    p.layout(4.2);
    return p;
  }

  // ----------------------------------------------------------- cyberguns
  // A turret on a hover base. The turret's local -z is the barrel direction;
  // the game yaws `turret` to aim and pushes `kick` back for recoil.
  function gunBase(color) {
    const g = new THREE.Group();
    const baseGeo = geo('gunBase', () => new THREE.CylinderGeometry(1.0, 1.25, 0.34, 6));
    const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x151a30, metalness: 0.9, roughness: 0.25, emissive: 0x05040f }));
    base.position.y = 0.22;
    base.add(new THREE.LineSegments(geo('gunBaseEdges', () => new THREE.EdgesGeometry(baseGeo)), new THREE.LineBasicMaterial({ color })));
    const ring = new THREE.Mesh(geo('gunRing', () => new THREE.TorusGeometry(1.14, 0.05, 8, 64)), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    const under = new THREE.Mesh(geo('plane', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({
      map: glowTex, color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = 0.03;
    under.scale.set(3.6, 3.6, 1);
    const turret = new THREE.Group();
    turret.position.y = 0.62;
    const kick = new THREE.Group();
    turret.add(kick);
    g.add(under, base, ring, turret);
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c2036, metalness: 0.95, roughness: 0.22, emissive: 0x06040f });
    const barrelMetal = new THREE.MeshStandardMaterial({ color: 0x2a3050, metalness: 1, roughness: 0.18 });
    return { g, turret, kick, ring, darkMetal, barrelMetal };
  }

  function gunApi(b, color, muzzle, extra) {
    return {
      group: b.g, turret: b.turret, muzzle, color,
      update(dt, t, st) {
        b.kick.position.z = (st && st.recoil ? st.recoil : 0) * 0.35;
        b.ring.rotation.z += dt * 0.8;
        if (extra) extra(dt, t, st);
      },
    };
  }

  const barrelGeo = (key, r0, r1, len) => geo(key, () => {
    const c = new THREE.CylinderGeometry(r0, r1, len, 20);
    c.rotateX(Math.PI / 2);
    return c;
  });
  const muzzleRingGeo = () => geo('muzzleRing', () => new THREE.TorusGeometry(0.2, 0.05, 8, 28));

  const GUNS = {
    pistol() {
      const col = C.cyan, b = gunBase(col);
      const body = new THREE.Mesh(geo('pistolBody', () => new THREE.RoundedBoxGeometry(0.9, 0.5, 1.2, 2, 0.1)), b.darkMetal);
      body.position.z = 0.15;
      const barrel = new THREE.Mesh(barrelGeo('pistolBarrel', 0.15, 0.2, 1.5), b.barrelMetal);
      barrel.position.z = -0.9;
      const strip = new THREE.Mesh(geo('pistolStrip', () => new THREE.BoxGeometry(0.12, 0.06, 1.0)), new THREE.MeshBasicMaterial({ color: col }));
      strip.position.set(0, 0.27, 0.1);
      const muzzle = new THREE.Mesh(muzzleRingGeo(), new THREE.MeshBasicMaterial({ color: col }));
      muzzle.position.z = -1.65;
      const flare = glow(col, 1.0, 0.8);
      flare.position.z = -1.7;
      b.kick.add(body, barrel, strip, muzzle, flare);
      return gunApi(b, col, 1.8);
    },

    scatter() {
      const col = C.lime, b = gunBase(col);
      const body = new THREE.Mesh(geo('scatterBody', () => new THREE.RoundedBoxGeometry(1.35, 0.5, 1.0, 2, 0.1)), b.darkMetal);
      body.position.z = 0.2;
      const ringMat = new THREE.MeshBasicMaterial({ color: col });
      [-0.3, 0, 0.3].forEach((a) => {
        const arm = new THREE.Group();
        arm.rotation.y = a;
        const barrel = new THREE.Mesh(barrelGeo('scatterBarrel', 0.12, 0.16, 1.0), b.barrelMetal);
        barrel.position.z = -0.7;
        const ring = new THREE.Mesh(muzzleRingGeo(), ringMat);
        ring.scale.setScalar(0.75);
        ring.position.z = -1.2;
        arm.add(barrel, ring);
        b.kick.add(arm);
      });
      const flare = glow(col, 1.4, 0.7);
      flare.position.z = -1.2;
      b.kick.add(body, flare);
      return gunApi(b, col, 1.45);
    },

    railgun() {
      const col = 0x4d9cff, b = gunBase(col);
      const body = new THREE.Mesh(geo('railBody', () => new THREE.RoundedBoxGeometry(0.85, 0.45, 1.0, 2, 0.1)), b.darkMetal);
      body.position.z = 0.25;
      const railGeo = geo('rail', () => new THREE.BoxGeometry(0.1, 0.16, 2.4));
      [-0.2, 0.2].forEach((x) => {
        const r = new THREE.Mesh(railGeo, b.barrelMetal);
        r.position.set(x, 0, -1.0);
        b.kick.add(r);
      });
      const coilMat = new THREE.MeshBasicMaterial({ color: col });
      const coils = [];
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(geo('railCoil', () => new THREE.TorusGeometry(0.32, 0.045, 8, 28)), coilMat);
        c.position.z = -0.25 - i * 0.5;
        coils.push(c);
        b.kick.add(c);
      }
      const core = new THREE.Mesh(geo('railCore', () => new THREE.SphereGeometry(0.14, 16, 12)), new THREE.MeshBasicMaterial({ color: 0xdfeeff }));
      core.position.z = -0.5;
      const flare = glow(col, 1.3, 0.8);
      flare.position.z = -2.2;
      b.kick.add(body, core, flare);
      return gunApi(b, col, 2.3, (dt, t) => {
        coils.forEach((c, i) => c.scale.setScalar(1 + 0.18 * Math.max(0, Math.sin(t * 8 - i * 0.9))));
      });
    },

    prism() {
      const col = 0xb84dff, b = gunBase(col);
      const body = new THREE.Mesh(geo('prismBody', () => new THREE.RoundedBoxGeometry(0.8, 0.5, 0.9, 2, 0.1)), b.darkMetal);
      body.position.z = 0.25;
      const crystal = new THREE.Mesh(geo('prismCrystal', () => new THREE.OctahedronGeometry(0.42, 0)), new THREE.MeshPhysicalMaterial({
        color: 0x3a1060, emissive: col, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.2, clearcoat: 1, flatShading: true,
      }));
      crystal.scale.set(0.75, 0.75, 2.6);
      crystal.position.z = -1.1;
      const halo = new THREE.Mesh(geo('prismHalo', () => new THREE.TorusGeometry(0.5, 0.035, 8, 40)), new THREE.MeshBasicMaterial({ color: 0xe6c8ff }));
      halo.position.z = -0.5;
      const lens = glow(0xffffff, 0.9, 0.9);
      lens.position.z = -2.2;
      const flare = glow(col, 1.6, 0.6);
      flare.position.z = -1.2;
      b.kick.add(body, crystal, halo, lens, flare);
      return gunApi(b, col, 2.25, (dt) => {
        crystal.rotation.z += dt * 1.5;
        halo.rotation.z -= dt * 2;
      });
    },

    helix() {
      const col = C.magenta, b = gunBase(col);
      const body = new THREE.Mesh(geo('helixBody', () => new THREE.RoundedBoxGeometry(0.85, 0.5, 1.0, 2, 0.1)), b.darkMetal);
      body.position.z = 0.25;
      const barrel = new THREE.Mesh(barrelGeo('helixBarrel', 0.12, 0.12, 1.9), b.barrelMetal);
      barrel.position.z = -1.05;
      const spiral = new THREE.Group();
      [0, Math.PI].forEach((phase, k) => {
        const tube = geo('helixTube' + k, () => {
          const pts = [];
          for (let i = 0; i <= 60; i++) {
            const t = i / 60, a = t * Math.PI * 6 + phase;
            pts.push(new THREE.Vector3(Math.cos(a) * 0.28, Math.sin(a) * 0.28, -0.1 - t * 1.9));
          }
          return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.035, 6, false);
        });
        spiral.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: k ? C.red : C.magenta })));
      });
      const muzzle = new THREE.Mesh(muzzleRingGeo(), new THREE.MeshBasicMaterial({ color: col }));
      muzzle.position.z = -2.0;
      const flare = glow(col, 1.2, 0.8);
      flare.position.z = -2.05;
      b.kick.add(body, barrel, spiral, muzzle, flare);
      return gunApi(b, col, 2.05, (dt) => { spiral.rotation.z += dt * 6; });
    },

    archangel() {
      const col = C.gold, b = gunBase(col);
      const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf5, metalness: 0.9, roughness: 0.18, emissive: 0x2a1d05 });
      const body = new THREE.Mesh(geo('angelBody', () => new THREE.RoundedBoxGeometry(0.95, 0.55, 1.1, 2, 0.12)), white);
      body.position.z = 0.2;
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc933, metalness: 1, roughness: 0.18, emissive: 0x3a2600 });
      const barrel = new THREE.Mesh(barrelGeo('angelBarrel', 0.14, 0.2, 1.6), goldMat);
      barrel.position.z = -0.95;
      const muzzle = new THREE.Mesh(muzzleRingGeo(), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
      muzzle.position.z = -1.75;
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xf2f5ff, emissive: 0x3a2a08, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xffd86a });
      const wingEdges = geo('wingEdges', () => new THREE.EdgesGeometry(wingGeometry(), 30));
      const wings = [-1, 1].map((s) => {
        const w = new THREE.Group();
        const m = new THREE.Mesh(wingGeometry(), wingMat);
        m.add(new THREE.LineSegments(wingEdges, edgeMat));
        w.add(m);
        w.scale.set(s * 0.6, 0.6, 0.6);
        w.position.set(s * 0.45, 0.1, 0.1);
        b.kick.add(w);
        return w;
      });
      const halo = new THREE.Mesh(geo('angelHalo', () => new THREE.TorusGeometry(0.36, 0.03, 8, 40)), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
      halo.position.set(0, 0.62, 0.2);
      halo.rotation.x = Math.PI / 2 - 0.4;
      const flare = glow(col, 1.2, 0.8);
      flare.position.z = -1.8;
      b.kick.add(body, barrel, muzzle, halo, flare);
      return gunApi(b, col, 1.85, (dt, t) => {
        const flap = Math.sin(t * 3) * 0.15;
        wings[0].rotation.z = -flap;
        wings[1].rotation.z = flap;
        halo.rotation.z += dt;
      });
    },
  };

  function makeGun(id) {
    return (GUNS[id] || GUNS.pistol)();
  }

  // ------------------------------------------------------ boxes & coins
  const BOX_TIERS = {
    data: { color: C.cyan, label: 'DATA' },
    big: { color: C.magenta, label: 'BIG' },
    mega: { color: C.gold, label: 'MEGA' },
  };

  function makeBox(tier) {
    const cfg = BOX_TIERS[tier] || BOX_TIERS.data;
    const g = new THREE.Group();
    const t = cachedTex('box_' + tier, () => boxCanvas(cfg.color, cfg.label));
    const bodyGeo = geo('boxBody', () => new THREE.RoundedBoxGeometry(1.6, 1.3, 1.6, 3, 0.1));
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({
      color: 0x50567a, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.95,
      metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15,
    }));
    body.position.y = 0.65;
    const edgeMat = new THREE.LineBasicMaterial({ color: cfg.color });
    body.add(new THREE.LineSegments(geo('boxEdges', () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.62, 1.32, 1.62))), edgeMat));
    const lid = new THREE.Group();
    lid.position.set(0, 1.3, -0.86);
    const lidMesh = new THREE.Mesh(geo('boxLid', () => new THREE.RoundedBoxGeometry(1.74, 0.32, 1.74, 3, 0.08)), new THREE.MeshPhysicalMaterial({
      color: 0x22263a, emissive: cfg.color, emissiveIntensity: 0.3, metalness: 0.9, roughness: 0.25, clearcoat: 1,
    }));
    lidMesh.position.set(0, 0.16, 0.86);
    lidMesh.add(new THREE.LineSegments(geo('lidEdges', () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.76, 0.34, 1.76))), edgeMat));
    lid.add(lidMesh);
    const lock = new THREE.Mesh(geo('lock', () => { const c = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6); c.rotateX(Math.PI / 2); return c; }),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lock.position.set(0, 1.12, 0.83);
    const lockGlow = glow(cfg.color, 1.2, 0.9);
    lockGlow.position.copy(lock.position);
    const inner = glow(cfg.color, 3.4, 0);
    inner.position.y = 1.4;
    const beamMat = new THREE.MeshBasicMaterial({
      color: cfg.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(geo('beam', () => new THREE.CylinderGeometry(1.4, 0.7, 5, 32, 1, true)), beamMat);
    beam.position.y = 3.8;
    g.add(body, lid, lock, lockGlow, inner, beam);
    return {
      group: g, lid, color: cfg.color,
      setOpen(k) {
        lid.rotation.x = -k * 1.9;
        inner.material.opacity = k;
        beamMat.opacity = k * 0.35;
        lock.visible = lockGlow.visible = k < 0.05;
      },
    };
  }

  function makeCoin() {
    const g = new THREE.Group();
    const spinner = new THREE.Group();
    const face = new THREE.Mesh(
      geo('coin', () => { const c = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 6); c.rotateX(Math.PI / 2); return c; }),
      geo('coinMat', () => new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: 0x8a5a00, emissiveIntensity: 0.9, metalness: 1, roughness: 0.22 })),
    );
    const ring = new THREE.Mesh(
      geo('coinRing', () => { const t = new THREE.TorusGeometry(0.26, 0.035, 6, 6); t.rotateZ(Math.PI / 6); return t; }),
      geo('coinRingMat', () => new THREE.MeshBasicMaterial({ color: 0xfff0a0 })),
    );
    ring.position.z = 0.06;
    const ringBack = ring.clone();
    ringBack.position.z = -0.06;
    spinner.add(face, ring, ringBack);
    g.add(spinner, glow(C.gold, 1.8, 0.7));
    return { group: g, spinner };
  }

  // violet skill-token crystal (Funky Balls pickups, Plinko jackpot)
  function makeToken() {
    const g = new THREE.Group();
    const spinner = new THREE.Group();
    const gemGeo = geo('tokenGem', () => new THREE.OctahedronGeometry(0.42, 0));
    const crystal = new THREE.Mesh(gemGeo, geo('tokenMat', () => new THREE.MeshPhysicalMaterial({
      color: 0x3a1060, emissive: 0xb84dff, emissiveIntensity: 0.9, roughness: 0.08, metalness: 0.3, clearcoat: 1, flatShading: true,
    })));
    crystal.scale.set(0.8, 1.25, 0.8);
    crystal.add(new THREE.LineSegments(geo('tokenEdges', () => new THREE.EdgesGeometry(gemGeo)),
      geo('tokenEdgeMat', () => new THREE.LineBasicMaterial({ color: 0xf0d8ff }))));
    const ring = new THREE.Mesh(geo('tokenRing', () => new THREE.TorusGeometry(0.62, 0.035, 6, 6)),
      geo('tokenRingMat', () => new THREE.MeshBasicMaterial({ color: 0xd9a8ff })));
    spinner.add(crystal, ring);
    g.add(spinner, glow(0xb84dff, 2.0, 0.6));
    return { group: g, spinner };
  }

  // ------------------------------------------------ neon environment map
  function envScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x04020d);
    s.add(new THREE.Mesh(new THREE.BoxGeometry(60, 30, 60), new THREE.MeshBasicMaterial({ color: 0x0a0620, side: THREE.BackSide })));
    const strip = (w, h, color, k, x, y, z, rx, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide,
      }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      s.add(m);
    };
    strip(40, 1.6, C.cyan, 3, 0, 14, -8, Math.PI / 2, 0);
    strip(40, 1.6, C.magenta, 3, 0, 14, 8, Math.PI / 2, 0);
    strip(30, 4, C.violet, 1.6, -29, 4, 0, 0, Math.PI / 2);
    strip(30, 4, C.magenta, 1.6, 29, 4, 0, 0, -Math.PI / 2);
    strip(20, 3, C.cyan, 1.4, 0, 6, -29, 0, 0);
    strip(20, 3, 0xff7a3c, 1.0, 0, 3, 29, 0, Math.PI);
    strip(20, 20, 0x6a5aff, 0.35, 0, 14.9, 0, Math.PI / 2, 0);
    return s;
  }

  NEON.models = {
    BALL_R: R, C, glowTex, glow, fresnel, makeBall, makePad, makeGun, makeBox, makeCoin, makeToken, envScene, ghostify,
    BOX_TIERS,
  };

  // ============================================================ stage3d
  // A second small renderer for menu previews (collection viewer, loot boxes,
  // thumbnails). Programs are { scene, camera, update(dt) }.
  NEON.stage3d = (function () {
    let renderer = null, envTex = null, host = null, program = null, raf = 0, last = 0, lastW = 0, lastH = 0;

    function ensure() {
      if (renderer) return true;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (e) {
        return false;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      // no bloom here, so tone-map instead to keep bright cores from clipping to flat white
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      renderer.domElement.className = 'stage3d';
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(envScene(), 0.04).texture;
      pmrem.dispose();
      return true;
    }

    function fit() {
      if (!host || !program) return;
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
      lastW = w; lastH = h;
      renderer.setSize(w, h);
      program.camera.aspect = w / h;
      program.camera.updateProjectionMatrix();
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!program || !host) return;
      if (host.clientWidth !== lastW || host.clientHeight !== lastH) fit();
      program.update(dt);
      renderer.render(program.scene, program.camera);
    }

    return {
      ensure,
      mount(container, prog) {
        if (!ensure()) return false;
        host = container;
        program = prog;
        prog.scene.environment = envTex;
        renderer.toneMappingExposure = prog.exposure || 1.35;   // a program may ask for more light
        container.appendChild(renderer.domElement);
        fit();
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
        return true;
      },
      unmount(prog) {
        if (prog && prog !== program) return;
        program = null;
        host = null;
        if (renderer && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        cancelAnimationFrame(raf);
        raf = 0;
      },
      // renders a program once at the given size and returns a PNG data URL
      snapshot(prog, w, h) {
        if (!ensure()) return '';
        prog.scene.environment = envTex;
        renderer.toneMappingExposure = prog.exposure || 1.35;
        renderer.setSize(w, h);
        prog.camera.aspect = w / h;
        prog.camera.updateProjectionMatrix();
        prog.update(0);
        renderer.render(prog.scene, prog.camera);
        const url = renderer.domElement.toDataURL('image/png');
        if (host && program) { renderer.toneMappingExposure = program.exposure || 1.35; fit(); }
        return url;
      },
    };
  })();
})();
