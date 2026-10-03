/* ==========================================================================
   SLING HEROES — core
   The renderer and everything the other files share:
   * one WebGL renderer, drawing into a multisampled HDR target. Bloom and a
     final pass (filmic tone mapping, colour grade, vignette, radial blur for
     big hits, screen flash) turn it into the picture you see.
   * views: the town, the campaign map, the showroom and the battle each bring
     their own scene + camera. SH.setView() switches between them.
   * the frame loop with an FPS cap, hit stop (slow motion for a few frames)
   * shared textures (glow, sparkle, smoke, noise), the toon material with a
     rim light, the outline material and renderImage() which turns a little
     3D scene into a picture (hero portraits, item icons, the hyper cut-in).
   * the save game, the settings and the sound (all sounds are synthesized).
   ========================================================================== */
(function () {
  'use strict';

  const SH = (window.SH = window.SH || {});
  if (!window.THREE) return;
  // colours written as hex are sRGB, the final pass converts back: what you write is what you see
  THREE.ColorManagement.legacyMode = false;

  // ================================================================ helpers
  const U = (SH.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    smooth: (t) => t * t * (3 - 2 * t),
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeIn: (t) => t * t * t,
    easeOutBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
    $: (id) => document.getElementById(id),
    // 1234 -> "1,234", 67460000 -> "67.46M"
    fmt(n) {
      n = Math.floor(n);
      if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e7) return (n / 1e6).toFixed(2) + 'M';
      return n.toLocaleString('en-US');
    },
    fmtTime(sec) {
      sec = Math.max(0, Math.ceil(sec));
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      const p = (v) => String(v).padStart(2, '0');
      return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
    },
    el(tag, cls, html) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html !== undefined) e.innerHTML = html;
      return e;
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    frame: () => new Promise((r) => requestAnimationFrame(() => r())),
    // small seeded random generator: the same seed always builds the same town / map
    rng(seed) {
      let a = seed >>> 0;
      return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hashStr(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    col: (hex) => new THREE.Color(hex),
    css: (c) => '#' + new THREE.Color(c).getHexString(),
  });
  const { clamp, $ } = U;

  // ================================================================ platform
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  SH.mobile = mq('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mq('(pointer: fine)'));
  const shortSide = Math.min(screen.width || innerWidth, screen.height || innerHeight);
  SH.platform = !SH.mobile ? 'pc' : shortSide >= 600 ? 'tablet' : 'phone';
  document.body.classList.add('pf-' + SH.platform);
  if (SH.mobile) document.body.classList.add('touch');
  ['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  // ================================================================ settings
  const SET_KEY = 'slingHeroes.settings';
  const defaults = { quality: 'auto', fps: 60, music: 60, sfx: 80, shake: true, numbers: true, speed: 1 };
  let settings = Object.assign({}, defaults);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { /* blocked */ }
  SH.settings = settings;
  SH.saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* blocked */ } };
  const QS = new URLSearchParams(location.search);
  SH.QS = QS;

  // auto: phones get medium, PCs high
  function qualityLevel() {
    const q = QS.get('q') || settings.quality;
    if (q === 'low' || q === 'medium' || q === 'high') return q;
    return SH.platform === 'pc' ? 'high' : 'medium';
  }
  SH.qualityLevel = qualityLevel();
  const Q = (SH.Q = {
    high: { pr: 2, msaa: 4, bloom: 1, bloomRes: 0.5, shadows: true, particles: 1 },
    medium: { pr: 1.6, msaa: 4, bloom: 1, bloomRes: 0.4, shadows: false, particles: 0.75 },
    low: { pr: 1, msaa: 0, bloom: 0, bloomRes: 0.35, shadows: false, particles: 0.45 },
  }[SH.qualityLevel]);

  // ================================================================ renderer
  const app = $('app');
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.debug.checkShaderErrors = QS.has('debug');
  const DPR = Math.min(window.devicePixelRatio || 1, Q.pr);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x10131f, 1);
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  SH.renderer = renderer;
  const caps = renderer.capabilities;
  const HDR = caps.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  SH.HDR = HDR;
  const MSAA = caps.isWebGL2 ? Q.msaa : 0;
  SH.maxAniso = caps.getMaxAnisotropy();

  // the game is a portrait game: on a wide screen it sits in a column in the middle
  const size = { w: 1, h: 1 };
  SH.size = size;
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(vw, Math.round(vh * 0.62));
    app.style.width = w + 'px';
    app.style.height = vh + 'px';
    size.w = w; size.h = vh;
    document.documentElement.style.setProperty('--app-w', w + 'px');
    document.documentElement.style.setProperty('--u', (w / 100) + 'px');
  }
  layout();

  // ------------------------------------------------------------ final pass
  const FINAL_SHADER = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uExposure: { value: 1.0 },
      uSat: { value: 1.12 },
      uVig: { value: 0.38 },
      uCA: { value: 0.6 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uRadial: { value: 0 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uDesat: { value: 0 },
      uWarm: { value: 0.0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uTime, uExposure, uSat, uVig, uCA, uFlash, uRadial, uDesat, uWarm;
      uniform vec3 uFlashColor;
      uniform vec2 uRes, uCenter;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 aces(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      void main() {
        vec2 uv = vUv;
        vec2 d = uv - 0.5;
        vec3 col;
        if (uRadial > 0.001) {
          // zoom blur towards the impact point
          vec2 dir = (uv - uCenter) * uRadial * 0.12;
          col = vec3(0.0);
          for (int i = 0; i < 10; i++) {
            col += texture2D(tDiffuse, uv - dir * (float(i) / 9.0)).rgb;
          }
          col /= 10.0;
        } else {
          float ca = dot(d, d) * 0.01 * uCA;
          col.r = texture2D(tDiffuse, uv - d * ca).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv + d * ca).b;
        }
        col *= uExposure;
        col = aces(col * 1.05);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(lum), col, uSat);
        // grade: a touch of teal in the shadows, warm highlights
        col += vec3(-0.01, 0.006, 0.02) * (1.0 - lum) + vec3(0.025, 0.012, -0.012) * lum;
        col += vec3(0.04, 0.015, -0.02) * uWarm;
        col = mix(col, vec3(lum) * vec3(0.9, 0.92, 1.0), uDesat);
        float vig = 1.0 - smoothstep(0.38, 1.0, length(d * vec2(1.0, 0.82)) * 1.35);
        col *= mix(1.0 - uVig, 1.0, vig);
        col = mix(col, uFlashColor, uFlash);
        col = toSRGB(clamp(col, 0.0, 1.0));
        col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };

  const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: HDR ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: MSAA,
  });
  const composer = new THREE.EffectComposer(renderer, composerTarget);
  const renderPass = new THREE.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 1.0);
  bloom.enabled = Q.bloom > 0;
  // without float targets colours stop at 1.0: let the glow start a bit lower
  if (!HDR) bloom.threshold = 0.8;
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(2, Math.round(w * Q.bloomRes * 2)), Math.max(2, Math.round(h * Q.bloomRes * 2)));
  composer.addPass(bloom);
  const finalPass = new THREE.ShaderPass(FINAL_SHADER);
  composer.addPass(finalPass);
  const post = (SH.post = { bloom, final: finalPass.uniforms, composer });

  function resize() {
    layout();
    renderer.setSize(size.w, size.h);
    composer.setPixelRatio(DPR);
    composer.setSize(size.w, size.h);
    finalPass.uniforms.uRes.value.set(size.w * DPR, size.h * DPR);
    for (const k in views) if (views[k].resize) views[k].resize(size.w, size.h);
    if (SH.onResize) SH.onResize();
  }
  window.addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 60); });
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  // ================================================================ textures
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c, g: c.getContext('2d') };
  }
  SH.canvas = canvas;
  function canvasTex(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = Math.min(8, SH.maxAniso);
    return t;
  }
  SH.canvasTex = canvasTex;

  const TEX = (SH.tex = {});
  TEX.glow = (() => {
    const { c, g } = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return canvasTex(c);
  })();
  TEX.shadow = (() => {
    const { c, g } = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return canvasTex(c);
  })();

  // particle atlas, 4 x 2 cells: glow, spark, smoke, ring, star, ember, plus, leaf
  TEX.atlas = (() => {
    const S = 128, { c, g } = canvas(S * 4, S * 2);
    const cell = (i, fn) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); fn(); g.restore(); };
    const radial = (stops) => { const grd = g.createRadialGradient(64, 64, 0, 64, 64, 62); stops.forEach((s) => grd.addColorStop(s[0], s[1])); return grd; };
    cell(0, () => { g.fillStyle = radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [0.6, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, S, S); });
    cell(1, () => {
      g.translate(64, 64);
      g.fillStyle = radial([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        g.save(); g.rotate(k * Math.PI / 2);
        const grd = g.createLinearGradient(-62, 0, 62, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath(); g.moveTo(-62, 0); g.quadraticCurveTo(0, -5, 62, 0); g.quadraticCurveTo(0, 5, -62, 0); g.fill();
        g.restore();
      }
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 22);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
    });
    cell(2, () => {
      const r = U.rng(7);
      for (let i = 0; i < 14; i++) {
        const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rad = 18 + r() * 26;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(255,255,255,0.32)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      }
    });
    cell(3, () => {
      g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7; g.shadowColor = '#fff'; g.shadowBlur = 10;
      g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke();
    });
    cell(4, () => {
      g.translate(64, 64); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 12;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 20 : 50; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
    });
    cell(5, () => { g.fillStyle = radial([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, S, S); });
    cell(6, () => { g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.fillRect(52, 18, 24, 92); g.fillRect(18, 52, 92, 24); });
    cell(7, () => {
      g.translate(64, 64); g.rotate(0.6); g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(0, -54); g.quadraticCurveTo(34, -10, 0, 54); g.quadraticCurveTo(-34, -10, 0, -54); g.fill();
    });
    return canvasTex(c);
  })();

  // tileable noise (r = value noise, g = fbm, b = cells), used by the floor, water and fire shaders
  TEX.noise = (() => {
    const N = 256, data = new Uint8Array(N * N * 4);
    const r = U.rng(1234);
    const grid = (f) => { const a = []; for (let i = 0; i < f * f; i++) a.push(r()); return a; };
    const g1 = grid(16), g2 = grid(32), g3 = grid(64), g0 = grid(8);
    const sample = (g, f, x, y) => {
      const fx = (x / N) * f, fy = (y / N) * f;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = U.smooth(fx - x0), ty = U.smooth(fy - y0);
      const at = (i, j) => g[((j % f + f) % f) * f + ((i % f + f) % f)];
      return U.lerp(U.lerp(at(x0, y0), at(x0 + 1, y0), tx), U.lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
    };
    // worley cells
    const pts = [];
    const CF = 8;
    for (let j = 0; j < CF; j++) for (let i = 0; i < CF; i++) pts.push([(i + r()) / CF * N, (j + r()) / CF * N]);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = sample(g1, 16, x, y);
        const f = sample(g0, 8, x, y) * 0.5 + sample(g1, 16, x, y) * 0.25 + sample(g2, 32, x, y) * 0.15 + sample(g3, 64, x, y) * 0.1;
        let d1 = 1e9, d2 = 1e9;
        const ci = Math.floor(x / N * CF), cj = Math.floor(y / N * CF);
        for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
          const ii = (ci + oi + CF) % CF, jj = (cj + oj + CF) % CF;
          const p = pts[jj * CF + ii];
          let dx = Math.abs(x - p[0]), dy = Math.abs(y - p[1]);
          dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
        }
        const edge = clamp((d2 - d1) / 10, 0, 1);
        const k = (y * N + x) * 4;
        data[k] = v * 255; data[k + 1] = f * 255; data[k + 2] = edge * 255; data[k + 3] = clamp(d1 / 24, 0, 1) * 255;
      }
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  })();

  // 3 tone cel shading
  TEX.toon = (() => {
    const d = new Uint8Array([105, 105, 105, 255, 175, 175, 175, 255, 236, 236, 236, 255, 255, 255, 255, 255]);
    const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  })();

  // ================================================================ materials
  // toon material with a soft rim light: the anime look of every hero and monster
  function rimPatch(sh, mat) {
    sh.uniforms.uRim = mat.userData.rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <output_fragment>', `
        float rimDot = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
        outgoingLight += uRim * smoothstep(0.55, 0.95, rimDot);
        #include <output_fragment>`);
  }
  SH.toonMat = function (opts) {
    opts = opts || {};
    const m = new THREE.MeshToonMaterial({
      color: opts.color !== undefined ? opts.color : 0xffffff,
      gradientMap: TEX.toon,
      vertexColors: !!opts.vertexColors,
      map: opts.map || null,
      transparent: !!opts.transparent,
      emissive: opts.emissive !== undefined ? opts.emissive : 0x000000,
    });
    if (opts.side) m.side = opts.side;
    m.userData.rim = { value: new THREE.Color(opts.rim !== undefined ? opts.rim : 0x6a7aa8).multiplyScalar(opts.rimK || 0.28) };
    m.onBeforeCompile = (sh) => rimPatch(sh, m);
    m.customProgramCacheKey = () => 'toonRim';
    return m;
  };

  // inverted hull outline: pushes the back faces out along the normals
  SH.outlineMat = function (color, thick) {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uColor: { value: new THREE.Color(color !== undefined ? color : 0x140c10) },
        uThick: { value: thick || 0.035 },
      }]),
      vertexShader: /* glsl */`
        uniform float uThick;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position + normal * uThick, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
          #include <fog_fragment>
        }`,
      side: THREE.BackSide,
      fog: true,
    });
  };

  // additive glow sprite
  SH.glowSprite = function (color, scale, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color, transparent: true, opacity: opacity === undefined ? 1 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.set(scale, scale, 1);
    return s;
  };

  SH.blobShadow = function (r, opacity) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(r * 2, r * 2),
      new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: opacity === undefined ? 1 : opacity }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    return m;
  };

  // ------------------------------------------------------------ environment map
  // soft sky with two bright softboxes: metal and gems get something nice to reflect
  SH.envMap = (() => {
    const s = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y;
        vec3 top = vec3(0.35,0.55,0.95), hor = vec3(1.0,0.85,0.7), gnd = vec3(0.12,0.1,0.09);
        vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor*0.6, gnd, pow(-h, 0.4));
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    s.add(sky);
    const box = (x, y, z, w, h, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    };
    box(5, 6, 4, 5, 3, 4); box(-6, 3, -3, 3, 4, 2); box(0, 8, -5, 4, 2, 3);
    const pm = new THREE.PMREMGenerator(renderer);
    const t = pm.fromScene(s, 0.02).texture;
    pm.dispose();
    return t;
  })();

  // ------------------------------------------------------------ renderImage
  // Draws a scene into a picture (data URL). Used for portraits, icons and the
  // hyper cut-in art. Transparent background, same tone mapping as the screen.
  const imgTargets = {};
  const toneQuad = (() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uExposure: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uExposure; varying vec2 vUv;
        vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,0.0), vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
        void main(){ vec4 t = texture2D(tDiffuse, vUv); float a = clamp(t.a, 0.0, 1.0);
          vec3 c = a > 0.001 ? t.rgb / a : vec3(0.0);
          c = toSRGB(aces(c * uExposure * 1.05));
          gl_FragColor = vec4(c, a); }`,
      depthTest: false, depthWrite: false,
    });
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    return { scene: s, mat, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  })();
  SH.renderImage = function (scene, camera, w, h, opts) {
    opts = opts || {};
    const key = w + 'x' + h;
    if (!imgTargets[key]) {
      imgTargets[key] = {
        hdr: new THREE.WebGLRenderTarget(w, h, { type: HDR ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: caps.isWebGL2 ? 4 : 0 }),
        ldr: new THREE.WebGLRenderTarget(w, h),
        px: new Uint8Array(w * h * 4),
        cv: canvas(w, h),
      };
    }
    const T = imgTargets[key];
    const oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
    const oldShadow = renderer.shadowMap.autoUpdate;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(T.hdr);
    renderer.clear();
    renderer.render(scene, camera);
    toneQuad.mat.uniforms.tDiffuse.value = T.hdr.texture;
    toneQuad.mat.uniforms.uExposure.value = opts.exposure || 1;
    renderer.setRenderTarget(T.ldr);
    renderer.clear();
    renderer.render(toneQuad.scene, toneQuad.cam);
    renderer.readRenderTargetPixels(T.ldr, 0, 0, w, h, T.px);
    renderer.setRenderTarget(null);
    renderer.setClearColor(oldClear, oldAlpha);
    renderer.shadowMap.autoUpdate = oldShadow;
    // flip Y into a 2D canvas
    const img = T.cv.g.createImageData(w, h);
    const row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(T.px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    T.cv.g.putImageData(img, 0, 0);
    if (opts.canvas) {
      const { c, g } = canvas(w, h);
      g.drawImage(T.cv.c, 0, 0);
      return c;
    }
    return T.cv.c.toDataURL('image/png');
  };

  // ================================================================ views
  const views = (SH.views = {});
  SH.view = null;
  SH.viewName = '';
  SH.registerView = (name, v) => { views[name] = v; };
  SH.setView = function (name, arg) {
    const next = views[name];
    if (!next) return;
    if (SH.view && SH.view.exit) SH.view.exit();
    SH.view = next;
    SH.viewName = name;
    if (next.enter) next.enter(arg);
    renderPass.scene = next.scene;
    renderPass.camera = next.camera;
    if (next.resize) next.resize(size.w, size.h);
    document.body.dataset.view = name;
  };
  // full screen menus cover the 3D picture: it then pauses and gets blurred by CSS
  SH.paused3D = false;
  SH.pause3D = (on) => {
    SH.paused3D = !!on;
    stage.classList.toggle('dim', !!on);
  };

  // ================================================================ input
  // pointer events on the canvas go to the active view (x, y in px inside the app column)
  function pt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId, e };
  }
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => {
    SH.audio.unlock();
    if (SH.view && SH.view.pointerDown) { try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } SH.view.pointerDown(pt(e)); }
  });
  cv.addEventListener('pointermove', (e) => { if (SH.view && SH.view.pointerMove) SH.view.pointerMove(pt(e)); });
  const up = (e) => { if (SH.view && SH.view.pointerUp) SH.view.pointerUp(pt(e)); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { if (SH.view && SH.view.wheel) SH.view.wheel(e); }, { passive: true });
  document.addEventListener('pointerdown', () => SH.audio.unlock(), { capture: true });

  // ================================================================ loop
  SH.time = 0;
  SH.timeScale = 1;
  let hitStop = 0, hitScale = 1;
  SH.hitStop = (sec, scale) => { hitStop = Math.max(hitStop, sec); hitScale = scale === undefined ? 0.06 : scale; };
  // screen flash and zoom blur fade out by themselves
  const fx = { flash: 0, flashDecay: 4, radial: 0, radialDecay: 3 };
  SH.flash = (amount, color, decay) => {
    fx.flash = Math.max(fx.flash, amount);
    fx.flashDecay = decay || 4;
    post.final.uFlashColor.value.set(color === undefined ? 0xffffff : color);
  };
  SH.zoomBlur = (amount, sx, sy, decay) => {
    fx.radial = Math.max(fx.radial, amount);
    fx.radialDecay = decay || 3;
    post.final.uCenter.value.set(sx === undefined ? 0.5 : sx, sy === undefined ? 0.5 : sy);
  };

  let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
  SH.fps = 60;
  const onFrame = [];
  SH.onFrame = (fn) => onFrame.push(fn);
  function frame(now) {
    requestAnimationFrame(frame);
    const cap = settings.fps > 0 ? settings.fps : 0;
    const elapsed = now - last;
    if (cap && cap < 70) {
      acc += elapsed;
      last = now;
      const step = 1000 / cap;
      if (acc < step - 1.5) return;
      acc = Math.min(acc - step, step);
    } else last = now;
    const realDt = Math.min(0.05, (cap && cap < 70 ? 1000 / cap : elapsed) / 1000);
    fpsT += realDt; fpsN++;
    if (fpsT > 1) { SH.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    let scale = SH.timeScale;
    if (hitStop > 0) { hitStop -= realDt; scale *= hitScale; }
    const dt = realDt * scale;
    SH.time += dt;
    SH.realTime = (SH.realTime || 0) + realDt;
    for (const fn of onFrame) fn(realDt);
    if (!SH.view) return;
    SH.view.update(dt, realDt);
    if (SH.paused3D && !SH.view.alwaysRender) return;
    fx.flash = Math.max(0, fx.flash - realDt * fx.flashDecay);
    fx.radial = Math.max(0, fx.radial - realDt * fx.radialDecay);
    const F = post.final;
    F.uTime.value = SH.realTime;
    F.uFlash.value = fx.flash;
    F.uRadial.value = fx.radial;
    composer.render(realDt);
  }
  SH.startLoop = () => { resize(); last = performance.now(); requestAnimationFrame(frame); };
  SH.resize = resize;

  // compile every material of a scene now, so nothing stutters later
  SH.warm = function (scene, camera) {
    renderer.compile(scene, camera);
  };

  // ================================================================ save game
  const SAVE_KEY = 'slingHeroes.save';
  SH.store = {
    load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } },
    write(d) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { /* blocked */ } },
    clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* blocked */ } },
  };

  // ================================================================ sound
  // Everything is made with the Web Audio API: no sound files to download.
  const audio = (SH.audio = (() => {
    let ctx = null, master = null, sfxBus = null, musicBus = null, verb = null;
    const A = { ready: false };
    function makeVerb() {
      const len = ctx.sampleRate * 2.2, buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      const c = ctx.createConvolver(); c.buffer = buf; return c;
    }
    A.unlock = () => {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { return; }
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(comp);
      musicBus = ctx.createGain(); musicBus.connect(comp);
      verb = makeVerb(); const vg = ctx.createGain(); vg.gain.value = 0.25; verb.connect(vg); vg.connect(comp);
      A.ctx = ctx; A.verb = verb; A.musicBus = musicBus; A.sfxBus = sfxBus;
      A.ready = true;
      A.volumes();
      if (A.onReady) A.onReady();
    };
    A.volumes = () => {
      if (!ctx) return;
      sfxBus.gain.value = (settings.sfx / 100) * 0.9;
      musicBus.gain.value = (settings.music / 100) * 0.45;
    };
    const now = () => ctx.currentTime;
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function tone(type, f0, f1, dur, vol, opts) {
      if (!ctx) return;
      opts = opts || {};
      const t = now() + (opts.delay || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      env(g, t, opts.attack || 0.005, vol, dur);
      o.connect(g);
      let out = g;
      if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; g.connect(f); out = f; }
      out.connect(opts.bus || sfxBus);
      if (opts.verb) out.connect(verb);
      o.start(t); o.stop(t + dur + (opts.attack || 0.005) + 0.05);
    }
    let noiseBuf = null;
    function noise(dur, vol, opts) {
      if (!ctx) return;
      opts = opts || {};
      if (!noiseBuf) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = now() + (opts.delay || 0);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = opts.type || 'bandpass';
      f.frequency.setValueAtTime(opts.f0 || 1200, t);
      if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + dur);
      f.Q.value = opts.q || 1;
      const g = ctx.createGain();
      env(g, t, opts.attack || 0.003, vol, dur);
      s.connect(f); f.connect(g); g.connect(opts.bus || sfxBus);
      if (opts.verb) g.connect(verb);
      s.start(t); s.stop(t + dur + 0.1);
    }
    A.tone = tone; A.noise = noise;
    const last = {};
    const throttle = (k, ms) => { const t = performance.now(); if (last[k] && t - last[k] < ms) return true; last[k] = t; return false; };
    A.sfx = {
      click() { tone('triangle', 900, 1300, 0.06, 0.18); },
      tab() { tone('sine', 660, 880, 0.07, 0.15); },
      back() { tone('triangle', 700, 420, 0.08, 0.15); },
      open() { tone('sine', 420, 840, 0.14, 0.15); noise(0.18, 0.05, { f0: 2000, f1: 6000 }); },
      hit(k) {
        if (throttle('hit', 28)) return;
        k = k || 1;
        noise(0.09, 0.32 * k, { f0: 900, f1: 300, q: 0.8 });
        tone('square', 240 + Math.random() * 60, 70, 0.1, 0.12 * k, { lp: 1800 });
      },
      crit() { noise(0.16, 0.4, { f0: 2500, f1: 400, q: 0.7 }); tone('sawtooth', 520, 90, 0.18, 0.16, { lp: 2400 }); },
      bounce() { if (throttle('bounce', 40)) return; tone('sine', 300, 180, 0.07, 0.15); },
      launch() { noise(0.35, 0.22, { f0: 500, f1: 3000, q: 0.6 }); tone('sawtooth', 160, 420, 0.22, 0.08, { lp: 1500 }); },
      combo(n) {
        if (throttle('combo', 50)) return;
        const f = 520 * Math.pow(2, ((n || 0) % 12) / 12);
        tone('triangle', f, f, 0.16, 0.14, { verb: true }); tone('sine', f * 2, f * 2, 0.12, 0.06, { delay: 0.03 });
      },
      laser() { tone('sawtooth', 1400, 300, 0.35, 0.1, { lp: 3000 }); noise(0.35, 0.12, { f0: 3000, f1: 800 }); },
      zap() { if (throttle('zap', 60)) return; noise(0.12, 0.2, { f0: 4000, f1: 1500, q: 2 }); tone('square', 1200, 600, 0.1, 0.05); },
      boom(k) {
        k = k || 1;
        noise(0.7 * k, 0.5, { type: 'lowpass', f0: 1400, f1: 60, q: 0.5 });
        tone('sine', 120, 35, 0.6 * k, 0.45);
      },
      heal() { [0, 0.08, 0.16].forEach((d, i) => tone('sine', 660 * Math.pow(1.26, i), 660 * Math.pow(1.26, i), 0.3, 0.1, { delay: d, verb: true })); },
      shield() { tone('triangle', 300, 600, 0.3, 0.12, { verb: true }); },
      coin() { if (throttle('coin', 45)) return; tone('square', 1320, 1320, 0.05, 0.06); tone('square', 1760, 1760, 0.12, 0.06, { delay: 0.05 }); },
      enemy() { tone('sawtooth', 200, 90, 0.3, 0.14, { lp: 900 }); noise(0.3, 0.15, { f0: 600, f1: 200 }); },
      fireball() { noise(0.5, 0.2, { f0: 400, f1: 1600, q: 0.5 }); },
      hurt() { tone('square', 180, 60, 0.25, 0.16, { lp: 1200 }); noise(0.2, 0.2, { f0: 500 }); },
      whoosh() { noise(0.4, 0.2, { f0: 300, f1: 2500, q: 0.7 }); },
      hyper() {
        noise(1.2, 0.25, { f0: 200, f1: 5000, q: 0.5, verb: true });
        [0, 0.1, 0.2, 0.3].forEach((d, i) => tone('sawtooth', 220 * Math.pow(1.335, i), 220 * Math.pow(1.335, i) * 1.01, 0.5, 0.07, { delay: d, lp: 3000, verb: true }));
      },
      ready() { tone('sine', 880, 880, 0.1, 0.12); tone('sine', 1320, 1320, 0.2, 0.12, { delay: 0.08, verb: true }); },
      level() { [0, 0.09, 0.18, 0.27].forEach((d, i) => tone('triangle', 523 * Math.pow(1.26, i), 523 * Math.pow(1.26, i), 0.25, 0.13, { delay: d, verb: true })); },
      star() { tone('triangle', 1046, 1568, 0.25, 0.15, { verb: true }); noise(0.3, 0.06, { f0: 6000 }); },
      win() {
        const n = [523, 659, 784, 1046, 784, 1046, 1318];
        n.forEach((f, i) => tone('triangle', f, f, i === n.length - 1 ? 0.9 : 0.16, 0.14, { delay: i * 0.11, verb: true }));
      },
      lose() { [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.4, 0.12, { delay: i * 0.22, verb: true })); },
      summon() { noise(2.2, 0.18, { f0: 200, f1: 3000, q: 0.4, verb: true }); tone('sine', 110, 440, 2.0, 0.12, { verb: true }); },
      reveal(r) {
        const base = [392, 440, 523, 659][r || 0];
        [0, 0.07, 0.14, 0.21, 0.28].forEach((d, i) => tone('triangle', base * Math.pow(1.26, i), base * Math.pow(1.26, i), 0.5, 0.12, { delay: d, verb: true }));
        if (r >= 2) noise(1.0, 0.15, { f0: 5000, f1: 9000, verb: true });
      },
      error() { tone('square', 220, 180, 0.15, 0.1, { lp: 1200 }); },
    };
    return A;
  })());
})();
