/* ==========================================================================
   NEON SIGIL — a 3D cyber brick breaker
   --------------------------------------------------------------------------
   Rendering : three.js r147 classic build (runs from file://)
               HDR + 4x MSAA post pipeline, bloom, neon environment reflections,
               mirror floor, rim-lit glossy bricks, filmic tone shoulder.
   Audio     : synthesized live with WebAudio, no sound files needed
   Gear      : balls & bouncepads from js/modelle.js, owned/equipped via
               js/profil.js — every piece of gear has a special ability.
   Concept   : taken from bilder/ — the summoning circle becomes a holographic
               sigil, the blue planet floats under a glass floor, skull bricks
               and treasure chests become cyber-skull and data-cache bricks,
               the demon head in the top wall becomes the Sentinel boss, and
               the skeleton walkers become hover drones.
   ========================================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const NEON = (window.NEON = window.NEON || {});

  if (!window.THREE || !THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RoundedBoxGeometry
    || !NEON.models || !NEON.profile) {
    $('load-error').classList.remove('hidden');
    $('screen-title').classList.add('hidden');
    return;
  }
  const P = NEON.profile;
  const MODELS = NEON.models;

  // ================================================================ utils
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const pad = (n, len) => String(Math.max(0, Math.floor(n))).padStart(len, '0');
  const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rgba(hex, a) {
    const n = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* storage blocked — ignore */ }
    },
  };

  // Player settings (the SETTINGS screen lives in js/einstellungen.js)
  //   master/music/sfx: volume 0–100   quality: auto | high | medium | low
  //   bloom: glow strength 0–150       shake: screen shake 0–100
  //   reflect: mirror floor            popups: floating damage numbers   fps: frame counter
  //   bgfx: the background reacts to the action (HYPE, fireworks, FEVER)
  const SETTINGS_KEY = 'neonSigil.settings';
  const SETTING_DEFAULTS = { master: 85, music: 70, sfx: 100, quality: 'auto', bloom: 100, shake: 100, reflect: true, popups: true, fps: false, bgfx: true };
  const settings = (() => {
    let s = {};
    try { s = JSON.parse(store.get(SETTINGS_KEY, '{}')) || {}; } catch (e) { s = {}; }
    const out = Object.assign({}, SETTING_DEFAULTS);
    Object.keys(SETTING_DEFAULTS).forEach((k) => { if (typeof s[k] === typeof SETTING_DEFAULTS[k]) out[k] = s[k]; });
    return out;
  })();

  // Debug/test switches: ?level=4  ?autostart  ?mode=survival|funky  ?bot (autopilot during a real run)
  // ?warp=8 fast-forwards 8 seconds of simulation before the first frame (for screenshots)
  // ?hq keeps full render quality even when the frame rate drops
  const params = new URLSearchParams(location.search);
  const DEBUG = {
    level: Math.max(1, parseInt(params.get('level'), 10) || 1),
    autostart: params.has('autostart'),
    mode: params.get('mode') || 'classic',
    bot: params.has('bot'),
    warp: Math.min(120, parseFloat(params.get('warp')) || 0),
    hq: params.has('hq'),
  };

  // ============================================================ constants
  const COLS = 13;
  const CELL_W = 2;
  const CELL_D = 1.1;
  const HALF_W = (COLS * CELL_W) / 2;   // inner half-width of the arena
  const TOP_Z = -20;                    // inner face of the top wall
  const ROW0_Z = TOP_Z + 2.6;           // centre of the first brick row
  const PADDLE_Z = 12;
  const PADDLE_HD = 0.36;
  const SHIELD_Z = PADDLE_Z + 1.6;
  const LOSE_Z = PADDLE_Z + 3.2;
  const BOTTOM_Z = LOSE_Z + 1.5;
  const WALL_T = 1.2;
  const WALL_H = 1.5;
  const BALL_R = MODELS.BALL_R;
  const BRICK_HW = 0.93;
  const BRICK_HD = 0.49;
  const BRICK_H = 0.8;
  const BASE_W = 4.2;
  const MAX_BALLS = 12;
  const MAX_GHOSTS = 3;
  const DRONE_R = 0.62;
  const CHIN = { x: 0, z: TOP_Z + 0.6, hw: 2.5, hd: 0.6 };   // Sentinel jaw — solid for the ball
  const PORTAL_X = 8.6;
  const SIGIL_Z = -1;
  const DROP_CHANCE = 0.11;
  const COIN_CHANCE = 0.12;
  const TS = 2;               // canvas-texture supersampling
  const NO_REFLECT = 1;       // render layer that the mirror floor skips

  const COL = {
    cyan: 0x19e6ff, magenta: 0xff3cf2, violet: 0xa64dff, lime: 0x8dff2a,
    red: 0xff2a4d, orange: 0xff9a1f, gold: 0xffc933, blue: 0x4d7cff, white: 0xe8f0ff,
  };

  const BRICKS = {
    p: { hp: 1, score: 50, color: 0xc13cff },
    g: { hp: 1, score: 50, color: 0x8dff2a },
    c: { hp: 1, score: 50, color: 0x19e6ff },
    w: { hp: 2, score: 120, color: 0xe8f0ff },               // cyber skull
    s: { hp: 3, score: 200, color: 0xff9a1f },               // armoured steel
    x: { hp: 1, score: 80, color: 0xff2a4d, explosive: true },
    $: { hp: 1, score: 150, color: 0xffc933, drop: true },   // data cache (always drops)
    '#': { hp: Infinity, score: 0, color: 0x2de2ff, solid: true },
  };
  const BRICK_GLOW = { p: 0.95, g: 0.8, c: 0.9, w: 0.6, s: 0.8, x: 1.0, $: 0.95, '#': 0.9 };

  const PU = {
    wide:   { key: 'W', name: 'EXPAND',  color: COL.cyan,    dur: 15, weight: 20 },
    multi:  { key: 'M', name: 'MULTI',   color: COL.magenta, dur: 0,  weight: 18 },
    laser:  { key: 'L', name: 'LASER',   color: COL.red,     dur: 12, weight: 14 },
    slow:   { key: 'S', name: 'SLOW',    color: COL.lime,    dur: 10, weight: 13 },
    plasma: { key: 'P', name: 'PLASMA',  color: COL.orange,  dur: 8,  weight: 10 },
    shield: { key: 'B', name: 'BARRIER', color: COL.blue,    dur: 20, weight: 12 },
    life:   { key: '+', name: '1UP',     color: 0xffffff,    dur: 0,  weight: 4 },
  };
  const TIMED = ['wide', 'laser', 'slow', 'plasma', 'shield'];

  // ---------------------------------------------------------------- levels
  // . empty   p/g/c basic   w skull (2 hits)   s steel (3 hits)
  // x explosive   $ data cache   # indestructible
  const LEVELS = [
    { name: 'FIREWALL', map: [          // straight from the reference picture
      'pcg$w.g.w$gcp',
      'pcggw.g.wggcp',
      'pcg.wgggw.gcp',
      'pcg.wgggw.gcp',
      'pc..wg.gw..cp',
      'p...w...w...p',
    ] },
    { name: 'DATA STREAM', map: [
      'x.c.c.c.c.c.x',
      '.p.p.p$p.p.p.',
      'g.g.g.g.g.g.g',
      '.c.c.c.c.c.c.',
      'w.p.p.$.p.p.w',
      '.g.g.g.g.g.g.',
      '#.#.......#.#',
    ] },
    { name: 'SENTINEL', boss: true, map: [
      '.............',
      '#.....w.....#',
      'ss.pp$p$pp.ss',
      '...g.....g...',
      'x.cccc.cccc.x',
      '.............',
      '...#.....#...',
    ] },
    { name: 'HEX CORE', map: [
      '......$......',
      '.....ggg.....',
      'c...gpxpg...c',
      '...gpwwwpg...',
      '..gpws$swpg..',
      '...gpwwwpg...',
      'c...gpxpg...c',
      '.....ggg.....',
      '......c......',
    ] },
    { name: 'INVADER.EXE', map: [
      '...c.....c...',
      '....c...c....',
      '...ppppppp...',
      '..pp.ppp.pp..',
      '.pwwwwwwwwwp.',
      '.g.ggxxxgg.g.',
      '.g.g.....g.g.',
      '....$$.$$....',
    ] },
    { name: 'OVERSEER', boss: true, map: [
      '.............',
      '..#.......#..',
      'sswwpp$ppwwss',
      'x...........x',
      '.cc.ggxgg.cc.',
      '......#......',
      '...#.....#...',
    ] },
  ];
  const PROC_NAMES = ['BLACK ICE', 'NULL ZONE', 'GHOST SHELL', 'DEEP NET', 'KERNEL PANIC',
    'NEON ABYSS', 'ZERO DAY', 'DARK FIBER', 'ROOTKIT', 'VOID CACHE'];
  const BOSS_NAMES = ['ARCHON', 'LEVIATHAN', 'BASILISK', 'SERAPH', 'HYDRA'];

  function levelDef(n) {
    if (n <= LEVELS.length) return LEVELS[n - 1];
    // Procedural sectors: mirrored random layouts that get denser and tougher.
    const rng = mulberry32(n * 7919 + 13);
    const boss = n % 3 === 0;
    const rows = Math.min(10, 6 + Math.floor((n - 6) / 2));
    const basics = ['p', 'g', 'c'];
    const palette = [basics[Math.floor(rng() * 3)], basics[Math.floor(rng() * 3)]];
    const armor = Math.min(0.34, 0.1 + n * 0.018);
    const map = [];
    for (let r = 0; r < rows; r++) {
      if (boss && r === 0) { map.push('.'.repeat(COLS)); continue; }
      const half = [];
      for (let c = 0; c < 7; c++) {
        const v = rng();
        let ch = palette[r % 2];
        if (v < 0.17) ch = '.';
        else if (v < 0.17 + armor) ch = rng() < 0.6 ? 'w' : 's';
        else if (v < 0.23 + armor) ch = 'x';
        else if (v < 0.26 + armor) ch = '$';
        else if (v < 0.29 + armor && r > 1 && !(boss && c >= 4)) ch = '#';
        half.push(ch);
      }
      map.push(half.join('') + half.slice(0, 6).reverse().join(''));
    }
    const name = boss
      ? BOSS_NAMES[(n / 3 - 3) % BOSS_NAMES.length] + ' MK-' + (Math.floor(n / 3) - 1)
      : PROC_NAMES[(n - 7) % PROC_NAMES.length];
    return { name, boss, map };
  }

  // ======================================================= renderer & scene
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const MAX_PR = Math.min(window.devicePixelRatio || 1, 2);
  // the device the player picked on the first start (js/mobil.js): 'pc' | 'phone' | 'tablet'
  const platform = () => NEON.platform || (NEON.mobile ? 'phone' : 'pc');
  const handheld = () => platform() !== 'pc';
  // render resolution per quality setting ('auto' starts high and steps down when the frame rate sags;
  // phones and tablets start lower: small screen, weaker GPU, and they aim for 90 / 120 FPS)
  const QUALITY_PR = { high: MAX_PR, medium: Math.min(MAX_PR, 1.25), low: Math.min(MAX_PR, 1) * 0.8 };
  function qualityPr(q) {
    if (q !== 'auto') return QUALITY_PR[q] || MAX_PR;
    if (platform() === 'phone') return Math.min(MAX_PR, 1.25);
    if (platform() === 'tablet') return Math.min(MAX_PR, 1.5);
    return MAX_PR;
  }
  // displayDt: how often the screen refreshes (1/60, 1/90, 1/120 s), measured from the fastest frames
  const quality = { pr: qualityPr(settings.quality), reflect: settings.reflect && settings.quality !== 'low', acc: 0, frames: 0, last: 0,
    displayDt: 1 / 60, dts: [] };
  renderer.setPixelRatio(quality.pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x04020d, 1);
  stage.appendChild(renderer.domElement);
  const caps = renderer.capabilities;
  const MAX_ANISO = caps.getMaxAnisotropy();
  // half-float targets keep highlights above 1.0 so bloom and the tone shoulder can use them
  const HDR = caps.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x04020d, 70, 170);

  const BASE_FOV = 39;
  // camera poses: PC keeps the classic view, phones and tablets get a closer,
  // steeper one so the arena fills the small screen (see frameArena)
  const CAM_PC = { pos: new THREE.Vector3(0, 46, 32), look: new THREE.Vector3(0, 0, -2.6) };
  const CAM_TALL = { pos: new THREE.Vector3(0, 63, 12), look: new THREE.Vector3(0, 0, -1.6) };   // phone held upright
  const CAM_WIDE = { pos: new THREE.Vector3(0, 52, 22), look: new THREE.Vector3(0, 0, -1.8) };   // phone / tablet sideways
  const CAM_POS = CAM_PC.pos.clone();
  const CAM_LOOK = CAM_PC.look.clone();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.5, 500);
  camera.position.copy(CAM_POS);
  camera.lookAt(CAM_LOOK);
  camera.layers.enable(NO_REFLECT);
  const refCam = camera.clone();   // steady camera for mouse picking (no shake/sway)
  refCam.updateMatrixWorld(true);

  // Final pass: filmic highlight shoulder, lens-style chromatic aberration at the
  // edges only, soft vignette, split-tone grade, dithering and glitch bands.
  const FINAL_SHADER = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGlitch: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uGain: { value: 1 },    // overall brightness (phones and the RPG get a bit more)
      uVig: { value: 0.45 },  // how much the vignette darkens the corners
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uGlitch;
      uniform vec2 uRes;
      uniform float uGain;
      uniform float uVig;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 shoulder(vec3 x) {
        vec3 hi = 0.8 + 0.2 * (1.0 - exp(-(x - 0.8) * 5.0));
        return mix(x, hi, step(0.8, x));
      }
      void main() {
        vec2 uv = vUv;
        float g = uGlitch;
        if (g > 0.001) {
          float band = floor(uv.y * 40.0);
          float n = hash(vec2(band, floor(uTime * 30.0)));
          uv.x += step(1.0 - g * 0.5, n) * (hash(vec2(band * 1.7, uTime)) - 0.5) * 0.08 * g;
        }
        vec2 d = uv - 0.5;
        float ca = dot(d, d) * 0.012 + g * 0.012;
        vec3 col;
        col.r = texture2D(tDiffuse, uv - d * ca).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv + d * ca).b;
        col = shoulder(max(col * uGain, 0.0));
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col += vec3(0.0, 0.008, 0.025) * (1.0 - lum) + vec3(0.015, 0.0, 0.01) * lum;
        float vig = 1.0 - smoothstep(0.45, 1.05, length(d * vec2(1.1, 1.0)) * 1.3);
        col *= mix(1.0 - uVig, 1.0, vig);
        col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
        col += vec3(0.03, 0.0, 0.06) * g;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
  };

  // The composer draws into a multisampled target — this is what gives smooth,
  // anti-aliased edges (the canvas' own antialias flag is lost in post-processing).
  const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: HDR ? THREE.HalfFloatType : THREE.UnsignedByteType,
    // 4x MSAA on PC; phones render at a lower resolution and aim for 90 / 120 FPS, 2x is enough there
    samples: caps.isWebGL2 ? (platform() === 'phone' ? 2 : 4) : 0,
  });
  const composer = new THREE.EffectComposer(renderer, composerTarget);
  composer.setPixelRatio(quality.pr);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const BLOOM = 0.95;
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), BLOOM * (settings.bloom / 100), 0.6, 0.35);
  bloom.enabled = settings.bloom > 0;
  composer.addPass(bloom);
  const finalPass = new THREE.ShaderPass(FINAL_SHADER);
  composer.addPass(finalPass);

  // neon environment map: every metal / glossy surface reflects the club lights
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(MODELS.envScene(), 0.04).texture;
    pmrem.dispose();
  }

  // lights
  scene.add(new THREE.AmbientLight(0x5a44c8, 0.4));
  scene.add(new THREE.HemisphereLight(0x8a6cff, 0x0a0018, 0.4));
  const sun = new THREE.DirectionalLight(0xc8d8ff, 0.55);
  sun.position.set(-8, 30, 14);
  scene.add(sun);
  const ballLight = new THREE.PointLight(COL.cyan, 0, 10, 2);
  scene.add(ballLight);
  const paddleLight = new THREE.PointLight(COL.cyan, 1.3, 8, 2);
  scene.add(paddleLight);
  const fxLight = new THREE.PointLight(COL.orange, 0, 16, 2);
  scene.add(fxLight);

  function noReflect(obj) {
    obj.traverse((o) => o.layers.set(NO_REFLECT));
    return obj;
  }

  // ============================================================== textures
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * TS);
    c.height = Math.round(h * TS);
    c.getContext('2d').scale(TS, TS);
    return c;
  }

  function toTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = MAX_ANISO;
    return t;
  }

  const glowTex = MODELS.glowTex;

  function chamferPath(g, x, y, w, h, c) {
    g.beginPath();
    g.moveTo(x + c, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w, y + h - c);
    g.lineTo(x + w - c, y + h);
    g.lineTo(x, y + h);
    g.lineTo(x, y + c);
    g.closePath();
  }

  function hexPath(g, x, y, r) {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }

  function drawPixels(g, rows, cx, cy, cell, palette) {
    const w = rows[0].length * cell, h = rows.length * cell;
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const col = palette[row[c]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
      }
    });
  }

  const SKULL = [
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    'XXXXXXXXXXX',
    'XXeeXXXeeXX',
    'XXeeXXXeeXX',
    'XXXXX.XXXXX',
    '.XXXXXXXXX.',
    '..X.X.X.X..',
    '..XXXXXXX..',
  ];
  const CHEST = [
    '..XXXXXXXXX..',
    '.XoooooooooX.',
    'XoooooooooooX',
    'XXXXXXLXXXXXX',
    'XoooooLoooooX',
    'XooooLLLooooX',
    'XoooooooooooX',
    'XXXXXXXXXXXXX',
  ];

  function hazardBand(g, y, h, colA, colB) {
    g.save();
    g.beginPath();
    g.rect(0, y, 256, h);
    g.clip();
    g.fillStyle = colB;
    g.fillRect(0, y, 256, h);
    g.fillStyle = colA;
    for (let x = -h; x < 256 + h; x += 28) {
      g.beginPath();
      g.moveTo(x, y + h);
      g.lineTo(x + 14, y + h);
      g.lineTo(x + 14 + h, y);
      g.lineTo(x + h, y);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function brickCanvas(type, dmg) {
    const W = 256, H = 128;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const color = BRICKS[type].color;
    const col = css(color);
    const inset = 7, ch = 20;
    g.fillStyle = '#04030b';
    g.fillRect(0, 0, W, H);

    g.save();
    chamferPath(g, inset, inset, W - inset * 2, H - inset * 2, ch);
    const grd = g.createLinearGradient(0, 0, 0, H);
    if (type === 'w') { grd.addColorStop(0, '#3a4468'); grd.addColorStop(1, '#141a30'); }
    else if (type === 's') { grd.addColorStop(0, '#5d6682'); grd.addColorStop(1, '#232838'); }
    else if (type === '#') { grd.addColorStop(0, '#101830'); grd.addColorStop(1, '#05070f'); }
    else { grd.addColorStop(0, rgba(color, 0.62)); grd.addColorStop(1, rgba(color, 0.14)); }
    g.fillStyle = grd;
    g.fill();
    g.clip();

    switch (type) {
      case 'p':
        g.strokeStyle = 'rgba(255,255,255,0.10)';
        g.lineWidth = 10;
        for (let x = -128; x < W; x += 28) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(30, 20, 60, 5);
        for (let i = 0; i < 4; i++) g.fillRect(196 + i * 11, 96, 7, 7);
        break;
      case 'g':
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let y = 12; y < H; y += 9) g.fillRect(0, y, W, 3);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < 3; i++) g.fillRect(200 + i * 14, 22, 8, 8);
        g.fillRect(24, 96, 70, 5);
        break;
      case 'c':
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(18, 40); g.lineTo(80, 40); g.lineTo(104, 64); g.lineTo(230, 64);
        g.moveTo(40, 96); g.lineTo(140, 96); g.lineTo(160, 76);
        g.moveTo(170, 30); g.lineTo(236, 30);
        g.stroke();
        g.fillStyle = '#ffffff';
        [[80, 40], [230, 64], [160, 76], [170, 30]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); });
        break;
      case 'w':
        drawPixels(g, SKULL, W / 2, H / 2 + 2, 10, { X: '#e6eeff', e: '#ff3cf2' });
        g.fillStyle = 'rgba(25,230,255,0.6)';
        g.fillRect(20, 24, 40, 4); g.fillRect(196, 100, 40, 4);
        break;
      case 's':
        hazardBand(g, 48, 32, '#ff9a1f', '#141824');
        g.fillStyle = '#c9d2ea';
        [[26, 26], [230, 26], [26, 102], [230, 102]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); });
        break;
      case 'x':
        hazardBand(g, 44, 40, '#ffb020', '#1a0006');
        g.fillStyle = '#12000a';
        g.beginPath(); g.arc(W / 2, H / 2, 34, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(W / 2, H / 2 - 22); g.lineTo(W / 2 + 22, H / 2 + 16); g.lineTo(W / 2 - 22, H / 2 + 16); g.closePath(); g.stroke();
        g.fillStyle = '#ffffff';
        g.fillRect(W / 2 - 3, H / 2 - 8, 6, 14); g.fillRect(W / 2 - 3, H / 2 + 9, 6, 5);
        break;
      case '$':
        drawPixels(g, CHEST, W / 2, H / 2, 9, { X: '#ffe28a', o: 'rgba(255,170,30,0.55)', L: '#ffffff' });
        break;
      case '#':
        g.strokeStyle = 'rgba(45,226,255,0.35)';
        g.lineWidth = 6;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H); g.moveTo(W, 0); g.lineTo(0, H); g.stroke();
        g.fillStyle = '#2de2ff';
        hexPath(g, W / 2, H / 2, 14); g.fill();
        break;
      default: break;
    }

    const gl = g.createLinearGradient(0, 0, 0, H * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.14)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H * 0.5);

    if (dmg > 0) {
      const rng = mulberry32(type.charCodeAt(0) * 31 + dmg * 977);
      for (let k = 0; k < dmg * 3; k++) {
        let x = W / 2 + (rng() - 0.5) * 80, y = H / 2 + (rng() - 0.5) * 40;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 34; g.lineTo(x, y); }
        g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 6; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2.5; g.stroke();
      }
    }
    g.restore();

    chamferPath(g, inset, inset, W - inset * 2, H - inset * 2, ch);
    g.lineWidth = 5;
    g.strokeStyle = col;
    g.stroke();
    return c;
  }

  function floorCanvas(wu, du) {
    const ppu = 36, W = Math.round(wu * ppu), H = Math.round(du * ppu);
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0624');
    bg.addColorStop(1, '#050312');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const s = 20, hw = Math.sqrt(3) * s;
    const cx = W / 2, cy = H * ((SIGIL_Z - TOP_Z) / du);
    const rng = mulberry32(99);
    g.lineWidth = 1.2;
    for (let row = 0; row * s * 1.5 < H + s; row++) {
      const y = row * s * 1.5;
      for (let x = (row % 2) * (hw / 2); x < W + hw; x += hw) {
        const d = Math.hypot(x - cx, y - cy) / (W * 0.8);
        const a = Math.max(0.05, 0.24 - d * 0.18);
        hexPath(g, x, y, s - 2);
        if (rng() < 0.035) { g.fillStyle = `rgba(166,77,255,${a})`; g.fill(); }
        g.strokeStyle = `rgba(130,80,255,${a})`;
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(25,230,255,0.55)';
    g.fillRect(0, 0, 3, H);
    g.fillRect(W - 3, 0, 3, H);
    const dangerY = H * ((PADDLE_Z + 1 - TOP_Z) / du);
    const dz = g.createLinearGradient(0, dangerY, 0, H);
    dz.addColorStop(0, 'rgba(255,42,77,0)');
    dz.addColorStop(1, 'rgba(255,42,77,0.4)');
    g.fillStyle = dz;
    g.fillRect(0, dangerY, W, H - dangerY);
    return c;
  }

  function rackCanvas() {
    const W = 256, H = 64;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#080a16';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#161c34';
    for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 2, H);
    g.fillRect(0, 0, W, 2);
    g.fillRect(0, H - 2, W, 2);
    const rng = mulberry32(7);
    for (let row = 0; row < 6; row++) {
      for (let x = 6; x < W - 6; x += 8) {
        if ((x % 64) < 6 || rng() < 0.45) continue;
        const v = rng();
        g.fillStyle = v < 0.55 ? '#39ff6a' : v < 0.85 ? '#ff2a4d' : '#19e6ff';
        g.globalAlpha = 0.3 + rng() * 0.7;
        g.fillRect(x, 13 + row * 8, 5, 3);
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,60,242,0.7)';
    g.fillRect(0, 6, W, 1);
    return c;
  }

  function towerCanvas(tint) {
    const W = 64, H = 256;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#05060e';
    g.fillRect(0, 0, W, H);
    const rng = mulberry32(tint.length * 17 + tint.charCodeAt(1));
    for (let y = 4; y < H; y += 8) {
      for (let x = 4; x < W - 4; x += 10) {
        if (rng() < 0.55) continue;
        g.fillStyle = tint;
        g.globalAlpha = 0.25 + rng() * 0.75;
        g.fillRect(x, y, 6, 3);
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = tint;
    g.fillRect(0, 0, W, 2);
    return c;
  }

  function sigilOuterCanvas() {
    const S = 1024, R = S / 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(R, R);
    g.strokeStyle = '#d27bff';
    g.shadowColor = '#ff3cf2';
    g.shadowBlur = 14 * TS;
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(R * 0.975, 5); ring(R * 0.95, 2); ring(R * 0.80, 4); ring(R * 0.78, 1.5);
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const r0 = i % 5 === 0 ? R * 0.875 : R * 0.9;
      g.lineWidth = i % 5 === 0 ? 3 : 1.5;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.94);
      g.stroke();
    }
    const glyphs = 'ΣΨΩΔΛΞΦΘ0123456789ABCDEF#<>/*=';
    const rng = mulberry32(5);
    g.fillStyle = '#ff8af6';
    g.font = 'bold 34px Consolas, "Courier New", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 44; i++) {
      g.save();
      g.rotate((i / 44) * Math.PI * 2);
      g.translate(0, -R * 0.84);
      g.fillText(glyphs[Math.floor(rng() * glyphs.length)], 0, 0);
      g.restore();
    }
    return c;
  }

  function sigilStarCanvas() {
    const S = 1024, R = S / 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(R, R);
    g.strokeStyle = '#c45cff';
    g.shadowColor = '#b04dff';
    g.shadowBlur = 16 * TS;
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(R * 0.72, 5); ring(R * 0.69, 1.5);
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      pts.push([Math.cos(a) * R * 0.69, Math.sin(a) * R * 0.69]);
    }
    g.lineWidth = 5;
    g.beginPath();
    [0, 2, 4, 1, 3].forEach((k, i) => (i ? g.lineTo(...pts[k]) : g.moveTo(...pts[k])));
    g.closePath();
    g.stroke();
    ring(R * 0.26, 3);
    // node circles with glyph icons, like the rune circles in the reference
    pts.forEach(([x, y], k) => {
      g.save();
      g.translate(x, y);
      g.shadowBlur = 0;
      g.fillStyle = '#000';
      g.beginPath(); g.arc(0, 0, R * 0.095, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 14 * TS;
      g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, R * 0.095, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#ff7af5';
      g.lineWidth = 4;
      const q = R * 0.045;
      g.beginPath();
      if (k === 0) { g.moveTo(0, -q); g.lineTo(q, q * 0.8); g.lineTo(-q, q * 0.8); g.closePath(); }
      else if (k === 1) { g.rect(-q * 0.8, -q * 0.8, q * 1.6, q * 1.6); }
      else if (k === 2) { g.ellipse(0, 0, q * 1.1, q * 0.6, 0, 0, Math.PI * 2); g.moveTo(q * 0.3, 0); g.arc(0, 0, q * 0.3, 0, Math.PI * 2); }
      else if (k === 3) { g.moveTo(-q, 0); g.lineTo(q, 0); g.moveTo(0, -q); g.lineTo(0, q); }
      else { g.moveTo(0, -q); g.lineTo(q, 0); g.lineTo(0, q); g.lineTo(-q, 0); g.closePath(); }
      g.stroke();
      g.restore();
    });
    return c;
  }

  function sigilInnerCanvas() {
    const S = 512, R = S / 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(R, R);
    g.strokeStyle = '#19e6ff';
    g.shadowColor = '#19e6ff';
    g.shadowBlur = 10 * TS;
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath(); g.arc(0, 0, R * 0.8, a + 0.1, a + 0.75); g.stroke();
    }
    g.setLineDash([10, 12]);
    g.beginPath(); g.arc(0, 0, R * 0.62, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-R * 0.95, 0); g.lineTo(-R * 0.45, 0);
    g.moveTo(R * 0.45, 0); g.lineTo(R * 0.95, 0);
    g.moveTo(0, -R * 0.95); g.lineTo(0, -R * 0.45);
    g.moveTo(0, R * 0.45); g.lineTo(0, R * 0.95);
    g.stroke();
    hexPath(g, 0, 0, R * 0.22);
    g.stroke();
    return c;
  }

  function planetCanvas() {
    const W = 512, H = 256;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#07114a'); bg.addColorStop(0.5, '#1238b0'); bg.addColorStop(1, '#07114a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const rng = mulberry32(3);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(${90 + rng() * 80},${150 + rng() * 80},255,${0.05 + rng() * 0.22})`;
      g.beginPath();
      g.ellipse(rng() * W, rng() * H, 20 + rng() * 90, 2 + rng() * 8, (rng() - 0.5) * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(180,230,255,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x = rng() * W, y = rng() * H;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 40, y - 20, x + 80, y + 20, x + 140, y + (rng() - 0.5) * 30);
      g.stroke();
    }
    g.fillStyle = '#7ff9ff';
    for (let i = 0; i < 220; i++) { g.globalAlpha = rng(); g.fillRect(rng() * W, rng() * H, 2, 2); }
    g.globalAlpha = 1;
    return c;
  }

  function labelCanvas(key, color) {
    const S = 128;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = 'rgba(4,2,13,0.7)';
    g.beginPath(); g.arc(S / 2, S / 2, 50, 0, Math.PI * 2); g.fill();
    g.strokeStyle = css(color);
    g.lineWidth = 7;
    g.shadowColor = css(color);
    g.shadowBlur = 14 * TS;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '900 64px Orbitron, "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(key, S / 2, S / 2 + 4);
    return c;
  }

  // Mirror floor shader: soft 5-tap blur for a glossy (not perfect-mirror) look,
  // drawn additively so the glass floor and the planet beneath stay visible.
  const REFLECT_SHADER = {
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uStrength: { value: 0.5 },
      uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float uStrength;
      uniform vec2 uTexel;
      varying vec4 vUv;
      void main() {
        vec2 uv = vUv.xy / vUv.w;
        vec3 c = texture2D(tDiffuse, uv).rgb * 0.36;
        c += texture2D(tDiffuse, uv + vec2(uTexel.x * 2.0, 0.0)).rgb * 0.16;
        c += texture2D(tDiffuse, uv - vec2(uTexel.x * 2.0, 0.0)).rgb * 0.16;
        c += texture2D(tDiffuse, uv + vec2(0.0, uTexel.y * 3.0)).rgb * 0.16;
        c += texture2D(tDiffuse, uv - vec2(0.0, uTexel.y * 3.0)).rgb * 0.16;
        gl_FragColor = vec4(c * color * uStrength, 1.0);
      }`,
  };

  // ================================================================= arena
  const ambient = {};   // animated environment parts
  let reflector = null;

  function buildArena() {
    const floorLen = BOTTOM_Z - TOP_Z;
    const floorCz = (TOP_Z + BOTTOM_Z) / 2;
    const floorTex = toTexture(floorCanvas(HALF_W * 2, floorLen));
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x6a6a9a, map: floorTex, emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 0.6,
      metalness: 0.55, roughness: 0.38, transparent: true, opacity: 0.72, depthWrite: false, envMapIntensity: 0.35,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, floorLen), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, floorCz);
    // transparent draw order: under the glass (-3), glass (-2), mirror (-1), everything else (0+)
    floor.renderOrder = -2;
    scene.add(noReflect(floor));

    if (HDR) {
      reflector = new THREE.Reflector(new THREE.PlaneGeometry(HALF_W * 2, floorLen), {
        textureWidth: 512, textureHeight: 512, multisample: 0, shader: REFLECT_SHADER, color: 0xffffff,
      });
      reflector.rotation.x = -Math.PI / 2;
      reflector.position.set(0, 0.006, floorCz);
      reflector.material.transparent = true;
      reflector.material.blending = THREE.AdditiveBlending;
      reflector.material.depthWrite = false;
      reflector.renderOrder = -1;
      reflector.visible = quality.reflect;
      scene.add(reflector);
    }

    const lip = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: COL.red }));
    lip.position.set(0, 0, BOTTOM_Z);
    scene.add(noReflect(lip));

    // walls — server racks with scrolling LEDs (green & red like the reference's side walls)
    const wallLen = BOTTOM_Z - TOP_Z + WALL_T;
    const rack = rackCanvas();
    const sideTex = toTexture(rack);
    sideTex.wrapS = THREE.RepeatWrapping;
    sideTex.repeat.set(wallLen / 4, 1);
    const topTex = toTexture(rack);
    topTex.wrapS = THREE.RepeatWrapping;
    topTex.repeat.set((HALF_W * 2 + WALL_T * 2) / 4, 1);
    const metal = new THREE.MeshStandardMaterial({ color: 0x161b30, metalness: 0.9, roughness: 0.3, emissive: 0x07041a });
    const rackMat = (tex) => new THREE.MeshStandardMaterial({
      color: 0x30344a, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1,
      metalness: 0.6, roughness: 0.35, envMapIntensity: 0.8,
    });
    const sideMat = rackMat(sideTex), topMat = rackMat(topTex);
    const sideGeo = new THREE.BoxGeometry(WALL_T, WALL_H + 0.4, wallLen);
    const wallCz = (TOP_Z - WALL_T + BOTTOM_Z) / 2;
    [-1, 1].forEach((side) => {
      const m = new THREE.Mesh(sideGeo, [sideMat, sideMat, metal, metal, sideMat, sideMat]);
      m.position.set(side * (HALF_W + WALL_T / 2), (WALL_H - 0.4) / 2, wallCz);
      scene.add(m);
    });
    const topWall = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + WALL_T * 2, WALL_H + 0.4, WALL_T),
      [metal, metal, metal, metal, topMat, topMat]);
    topWall.position.set(0, (WALL_H - 0.4) / 2, TOP_Z - WALL_T / 2);
    scene.add(topWall);
    ambient.wallTextures = [sideTex, topTex];

    // neon edge strips — they flash when the ball bounces off them
    const strip = (geo, x, y, z, color) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, z);
      m.userData.base = new THREE.Color(color);
      m.userData.flash = 0;
      scene.add(m);
      return m;
    };
    const zStrip = new THREE.BoxGeometry(0.12, 0.12, wallLen);
    const xStrip = new THREE.BoxGeometry(HALF_W * 2 + WALL_T * 2, 0.12, 0.12);
    ambient.strips = {
      left: strip(zStrip, -HALF_W - 0.06, WALL_H, wallCz, COL.cyan),
      right: strip(zStrip, HALF_W + 0.06, WALL_H, wallCz, COL.cyan),
      top: strip(xStrip, 0, WALL_H, TOP_Z - 0.06, COL.cyan),
    };
    strip(zStrip, -HALF_W - WALL_T + 0.06, WALL_H, wallCz, COL.magenta);
    strip(zStrip, HALF_W + WALL_T - 0.06, WALL_H, wallCz, COL.magenta);

    // drone portals in the top wall
    ambient.portals = [-1, 1].map((side) => {
      const g = new THREE.Group();
      g.position.set(side * PORTAL_X, 0.95, TOP_Z + 0.04);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 10, 64), new THREE.MeshBasicMaterial({ color: COL.lime }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), new THREE.MeshBasicMaterial({
        map: glowTex, color: COL.lime, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      g.add(ring, disc);
      scene.add(g);
      return { g, ring, disc, flash: 0 };
    });

    // red conduits outside the walls — a cyber take on the organic red matter in the reference
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x2a0010, emissive: 0xff1a3c, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.25,
    });
    ambient.cableMat = cableMat;
    [-1, 1].forEach((side) => {
      for (let k = 0; k < 2; k++) {
        const pts = [];
        for (let i = 0; i <= 26; i++) {
          const z = lerp(TOP_Z - 1, BOTTOM_Z, i / 26);
          pts.push(new THREE.Vector3(
            side * (HALF_W + WALL_T + 0.4 + 0.25 * Math.sin(i * 1.3 + k * 2)),
            0.05 + 0.35 * Math.sin(i * 0.9 + k * 3),
            z,
          ));
        }
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.15 + k * 0.05, 12, false);
        scene.add(noReflect(new THREE.Mesh(tube, cableMat)));
      }
    });

    // server monoliths rising from the void
    const towerTexG = towerCanvas('#39ff6a');
    const towerTexR = towerCanvas('#ff2a6a');
    const trng = mulberry32(42);
    ambient.towers = [];   // they jump like an equalizer when HYPE hits (see updateHype)
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 14; i++) {
        const w = 1.6 + trng() * 2.6, d = 1.6 + trng() * 2.6;
        const top = -3 + trng() * 9;
        const h = top + 34;
        const tex = toTexture(trng() < 0.6 ? towerTexG : towerTexR);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, h / 10);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x0c0f1e, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85,
          metalness: 0.8, roughness: 0.3, envMapIntensity: 0.3,
        });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(side * (HALF_W + WALL_T + 3.2 + trng() * 10), top - h / 2, TOP_Z - 12 + i * 3.4 + trng() * 1.5);
        scene.add(noReflect(m));
        ambient.towers.push({ m, mat, baseY: m.position.y, kick: 0, tint: new THREE.Color(0xffffff), idx: ambient.towers.length });
      }
    });

    // holographic sigil on the floor (the summoning circle from the reference)
    const sigilLayer = (canvas, size, y, opacity) => {
      const geo = new THREE.PlaneGeometry(size, size);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        map: toTexture(canvas), color: 0xffffff, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, y, SIGIL_Z);
      m.renderOrder = 2;
      scene.add(noReflect(m));
      return m;
    };
    ambient.sigil = [
      sigilLayer(sigilOuterCanvas(), 23.5, 0.02, 0.55),
      sigilLayer(sigilStarCanvas(), 23.5, 0.03, 0.6),
      sigilLayer(sigilInnerCanvas(), 9, 0.04, 0.45),
    ];
    ambient.sigilEnergy = 0;

    // the blue planet, hovering beneath the glass floor
    const planet = new THREE.Group();
    planet.position.set(0, -10, SIGIL_Z);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(6, 64, 48), new THREE.MeshBasicMaterial({ map: toTexture(planetCanvas()) }));
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(6.5, 64, 48), MODELS.fresnel(0x3a8bff, 2.6, 1.2));
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(6.9, 2)),
      new THREE.LineBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x2a5bff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(26, 26, 1);
    const pring = new THREE.Mesh(new THREE.RingGeometry(8.4, 8.7, 128), new THREE.MeshBasicMaterial({
      color: COL.magenta, side: THREE.DoubleSide, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pring.rotation.x = -Math.PI / 2 + 0.35;
    halo.renderOrder = wire.renderOrder = pring.renderOrder = atmo.renderOrder = -3;
    planet.add(halo, sphere, atmo, wire, pring);
    scene.add(noReflect(planet));
    ambient.planet = { group: planet, sphere, wire, ring: pring, halo };

    // synthwave grid far below
    const grid = new THREE.GridHelper(400, 160, COL.magenta, 0x5a1fb5);
    grid.position.y = -18;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    grid.renderOrder = -3;
    scene.add(noReflect(grid));
    ambient.grid = grid;

    // stars
    const starGeo = new THREE.BufferGeometry();
    const sp = [], sc = [];
    const srng = mulberry32(11);
    const tmp = new THREE.Color();
    for (let i = 0; i < 1400; i++) {
      const th = srng() * Math.PI * 2, ph = Math.acos(srng() * 1.4 - 0.4);
      const r = 180 + srng() * 90;
      sp.push(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.6 + 10, Math.sin(ph) * Math.sin(th) * r);
      tmp.setHex(pick([0xffffff, 0xffffff, 0x9fd8ff, 0xff9af5, 0xc9a4ff]));
      sc.push(tmp.r, tmp.g, tmp.b);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 1.3, vertexColors: true, fog: false, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    stars.renderOrder = -3;
    scene.add(noReflect(stars));
    ambient.stars = stars;

    // energy barrier (power-up / Aegis pad)
    const shield = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.3, 0.14), new THREE.MeshBasicMaterial({
      color: COL.blue, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    shield.position.set(0, 0.3, SHIELD_Z);
    shield.visible = false;
    scene.add(shield);
    ambient.shield = shield;

    // Chrono Deck's slow-time zone, drawn as a faint golden band on the floor
    const chronoZone = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 7), new THREE.MeshBasicMaterial({
      map: glowTex, color: COL.gold, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    chronoZone.rotation.x = -Math.PI / 2;
    chronoZone.position.set(0, 0.05, PADDLE_Z - 3);
    chronoZone.visible = false;
    scene.add(noReflect(chronoZone));
    ambient.chronoZone = chronoZone;
  }

  // ============================================================== Sentinel
  // The demon head embedded in the top wall. Dormant on normal sectors,
  // wakes up as a boss on every third sector.
  function buildSentinel() {
    const root = new THREE.Group();
    scene.add(root);
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c2036, metalness: 0.95, roughness: 0.22, emissive: 0x0a0418 });
    const trimMat = new THREE.LineBasicMaterial({ color: COL.magenta });

    const chinGeo = new THREE.RoundedBoxGeometry(CHIN.hw * 2, 1.0, CHIN.hd * 2, 2, 0.08);
    const chin = new THREE.Mesh(chinGeo, darkMetal);
    chin.position.set(0, 0.5, CHIN.z);
    chin.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CHIN.hw * 2, 1.0, CHIN.hd * 2)), trimMat));
    root.add(chin);
    const chinStripMat = new THREE.MeshBasicMaterial({ color: COL.magenta });
    const chinStrip = new THREE.Mesh(new THREE.BoxGeometry(CHIN.hw * 2 - 0.4, 0.12, 0.05), chinStripMat);
    chinStrip.position.set(0, 0.55, CHIN.z + CHIN.hd + 0.03);
    root.add(chinStrip);

    const head = new THREE.Group();
    head.position.set(0, 2.4, TOP_Z - 0.4);
    root.add(head);
    const face = new THREE.Group();
    head.add(face);

    const plateGeo = new THREE.CylinderGeometry(2.0, 2.35, 0.9, 6);
    plateGeo.rotateX(Math.PI / 2);
    const plate = new THREE.Mesh(plateGeo, darkMetal);
    plate.add(new THREE.LineSegments(new THREE.EdgesGeometry(plateGeo), trimMat));
    face.add(plate);

    const visorGeo = new THREE.CylinderGeometry(1.45, 1.6, 0.3, 6);
    visorGeo.rotateX(Math.PI / 2);
    const visor = new THREE.Mesh(visorGeo, new THREE.MeshStandardMaterial({ color: 0x0b0d18, metalness: 1, roughness: 0.08 }));
    visor.position.z = 0.5;
    face.add(visor);

    const eyeMat = new THREE.MeshBasicMaterial({ color: COL.cyan });
    const eyeGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: COL.cyan, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const eyes = new THREE.Group();
    eyes.position.z = 0.7;
    face.add(eyes);
    const eyeGeo = new THREE.BoxGeometry(0.95, 0.22, 0.12);
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.62, 0.3, 0);
      eye.rotation.z = s * 0.32;
      const glow = new THREE.Sprite(eyeGlowMat);
      glow.scale.set(2.2, 1.2, 1);
      glow.position.set(s * 0.62, 0.3, 0.1);
      eyes.add(eye, glow);
    });

    const mawMat = new THREE.MeshBasicMaterial({ color: 0x220008 });
    const maw = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), mawMat);
    maw.position.set(0, -0.62, 0.66);
    face.add(maw);
    const barGeo = new THREE.BoxGeometry(0.1, 0.72, 0.14);
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(barGeo, darkMetal);
      bar.position.set(-0.55 + i * 0.22, -0.62, 0.72);
      face.add(bar);
    }

    const hornGeo = new THREE.ConeGeometry(0.3, 1.9, 6);
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x2a0f3a, metalness: 0.85, roughness: 0.25, emissive: COL.magenta, emissiveIntensity: 0.35 });
    const hornEdges = new THREE.EdgesGeometry(hornGeo);
    [-1, 1].forEach((s) => {
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(s * 1.55, 1.75, -0.1);
      horn.rotation.z = -s * 0.55;
      horn.add(new THREE.LineSegments(hornEdges, trimMat));
      face.add(horn);
    });
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 4), hornMat);
    crown.position.set(0, 2.2, 0);
    face.add(crown);

    const haloMat = new THREE.MeshBasicMaterial({
      color: COL.violet, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const halo1 = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.05, 8, 128), haloMat);
    halo1.position.z = -0.6;
    const halo2 = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.58, 96, 1, 0, Math.PI * 1.6), haloMat);
    halo2.position.z = -0.7;
    face.add(halo1, halo2);

    const pipeGeo = new THREE.CylinderGeometry(0.16, 0.16, 3.2, 12);
    pipeGeo.rotateZ(Math.PI / 2);
    [-1, 1].forEach((s) => {
      const p = new THREE.Mesh(pipeGeo, darkMetal);
      p.position.set(s * 3.3, -1.3, -0.2);
      head.add(p);
    });

    const light = new THREE.PointLight(COL.red, 0, 14, 2);
    light.position.set(0, 2, CHIN.z + 2.5);
    scene.add(light);

    return {
      root, head, face, eyes, eyeMat, eyeGlowMat, mawMat, haloMat, halo1, halo2, chinStripMat, light,
      mode: 'dormant', hp: 1, maxHp: 1, flash: 0, charge: 0, charging: false, fireT: 3, tilt: 0, name: 'SENTINEL',
    };
  }

  buildArena();
  const sentinel = buildSentinel();

  // ================================================================= HYPE
  // The world around the arena reacts to the action. Every pop, kill and combo
  // pumps HYPE: the server towers jump like an equalizer in the colour of the hit,
  // searchlights sweep up behind the walls, fireworks burst over the void and the
  // planet under the glass floor flares. Keep the combo going and the meter tips
  // over into FEVER — rainbow strobing, confetti and fireworks for a few seconds.
  const hype = {
    energy: 0, meter: 0, fever: 0, combo: 0, comboT: 0, best: 0, fireT: 0, beatT: 0, gridZ: 0,
    color: new THREE.Color(COL.cyan), waves: [], lights: [], shells: [],
  };
  const HYPE_WORDS = [[50, 'GODLIKE'], [30, 'LEGENDARY'], [20, 'INSANE'], [12, 'UNSTOPPABLE'], [8, 'AWESOME'], [5, 'GREAT'], [3, 'NICE']];
  const FEVER_TIME = 8;
  function buildHype() {
    // searchlights behind the side towers
    const beamGeo = new THREE.CylinderGeometry(2.8, 0.3, 70, 16, 1, true);
    beamGeo.translate(0, 35, 0);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      m.position.set(side * (HALF_W + WALL_T + 6 + (i >> 1) * 3), -4, TOP_Z - 4 + (i >> 1) * 8);
      m.userData.phase = i * 1.37;
      m.visible = false;
      scene.add(noReflect(m));
      hype.lights.push(m);
    }
    // firework shells: a spark climbs, then bursts into a sphere of embers
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      s.scale.set(1.6, 1.6, 1);
      scene.add(noReflect(s));
      hype.shells.push({ s, t: 0, dur: 0, x: 0, z: 0, y0: 0, y1: 0, color: 0xffffff });
    }
  }
  buildHype();

  const hypeOn = () => settings.bgfx;
  // fireworks go where the camera can see them: over the side towers or beyond the top wall
  function firework(color) {
    const sh = hype.shells.find((s) => s.dur <= 0);
    if (!sh) return;
    const side = Math.random() < 0.75;
    sh.x = side ? (Math.random() < 0.5 ? -1 : 1) * rand(HALF_W + 6, HALF_W + 18) : rand(-HALF_W, HALF_W);
    sh.z = side ? rand(TOP_Z - 6, PADDLE_Z - 6) : rand(TOP_Z - 16, TOP_Z - 9);
    sh.y0 = side ? -6 : -12;
    sh.y1 = side ? rand(3, 11) : rand(-5, 1);
    sh.t = 0;
    sh.dur = rand(0.45, 0.7);
    sh.color = color || pick([COL.cyan, COL.magenta, COL.gold, COL.lime, COL.violet, 0xffffff]);
    sh.s.material.color.setHex(sh.color);
    sh.s.visible = true;
  }
  function fireworkBurst(sh) {
    const n = 46;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = rand(9, 13);
      emit(sh.x, sh.y1, sh.z, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp, i % 5 ? sh.color : 0xffffff, rand(1, 1.6), rand(0.9, 1.4), 1.6, -5);
    }
    fxLight.position.set(sh.x * 0.5, 4, sh.z);
    fxLight.color.setHex(sh.color);
    fxLight.intensity = Math.max(fxLight.intensity, 2.5);
  }

  // Something happened: `amount` 0…1 (a single brick ≈ 0.05, a boss kill = 1).
  function hypeEvent(amount, color, x, z) {
    if (!hypeOn()) return;
    const c = color === undefined ? COL.cyan : color;
    hype.energy = Math.min(1, hype.energy + amount);
    if (hype.fever <= 0) hype.meter = Math.min(1, hype.meter + amount * 0.3);
    hype.color.lerp(tmpColor.setHex(c), 0.6);
    hype.waves.push({ x: x || 0, z: z === undefined ? SIGIL_Z : z, t: 0, amp: Math.min(1, 0.25 + amount * 2), color: c });
    if (hype.waves.length > 8) hype.waves.shift();
    if (!game.demo) {
      hype.combo++;
      hype.comboT = 2.6;
      if (hype.combo > hype.best) hype.best = hype.combo;
      showCombo();
    }
    if (amount >= 0.45) for (let i = 0; i < Math.round(amount * 4); i++) firework(i ? undefined : c);
    if (hype.meter >= 1 && hype.fever <= 0 && !game.demo) startFever();
  }

  function startFever() {
    hype.fever = FEVER_TIME;
    hype.meter = 1;
    sfx.jackpot();
    game.glitch = Math.max(game.glitch, 0.4);
    showBanner('HYPE MAXED', 'FEVER!!', 'THE WHOLE GRID IS PARTYING', false);
    document.body.classList.add('fever');
    for (let i = 0; i < 5; i++) firework();
  }

  let comboShown = 0;
  function showCombo() {
    const el = $('hy-combo');
    if (hype.combo < 3) return;
    const word = (HYPE_WORDS.find(([n]) => hype.combo >= n) || [0, ''])[1];
    el.innerHTML = `<b>×${hype.combo}</b><span>${word}</span>`;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    el.style.setProperty('--hc', '#' + hype.color.getHexString());
    // a little fanfare every time the word changes
    if (word && word !== comboShown) { comboShown = word; if (hype.combo >= 5) sfx.levelUp(); }
  }

  const rainbow = new THREE.Color();
  function updateHype(dt) {
    const on = hypeOn();
    const a = ambient;
    hype.energy = Math.max(0, hype.energy - dt * 0.45);
    hype.comboT -= dt;
    if (hype.comboT <= 0 && hype.combo) { hype.combo = 0; comboShown = 0; $('hy-combo').classList.remove('pop'); }
    if (hype.fever > 0) {
      hype.fever -= dt;
      hype.meter = Math.max(0, hype.fever / FEVER_TIME);
      if (hype.fever <= 0) { hype.meter = 0; document.body.classList.remove('fever'); }
    } else hype.meter = Math.max(0, hype.meter - dt * 0.035);
    const feverK = hype.fever > 0 ? Math.min(1, hype.fever, (FEVER_TIME - hype.fever) * 3) : 0;
    const e = on ? Math.max(hype.energy, feverK * 0.8) : 0;
    $('hy-fill').style.height = (hype.meter * 100).toFixed(1) + '%';
    $('hype-ui').classList.toggle('show', on && !game.demo && document.body.classList.contains('playing'));

    // beats during FEVER (128 bpm)
    hype.beatT -= dt;
    const beat = feverK > 0 && hype.beatT <= 0;
    if (beat) {
      hype.beatT = 60 / 128;
      hype.waves.push({ x: 0, z: SIGIL_Z, t: 0, amp: 0.9, color: rainbow.setHSL((time * 0.3) % 1, 1, 0.55).getHex() });
      if (Math.random() < 0.6) firework();
    }
    // tower equalizer: waves roll out from where things happen
    for (const w of hype.waves) w.t += dt;
    hype.waves = hype.waves.filter((w) => w.t < 1.6);
    for (const tw of a.towers) {
      const p = tw.m.position;
      for (const w of hype.waves) {
        const d = Math.hypot(p.x - w.x, p.z - w.z), front = w.t * 45;
        if (Math.abs(d - front) < 5) { tw.kick = Math.max(tw.kick, w.amp * (1 - w.t / 1.6)); tw.tint.setHex(w.color); }
      }
      tw.kick = Math.max(0, tw.kick - dt * 1.8);
      const k = on ? tw.kick : 0;
      p.y = damp(p.y, tw.baseY + k * 3.2 + e * 1.2, 14, dt);
      if (feverK > 0) tw.tint.setHSL((time * 0.25 + tw.idx * 0.06) % 1, 1, 0.6);
      tw.mat.emissive.setHex(0xffffff).lerp(tw.tint, Math.min(1, k * 1.4 + feverK));
      tw.mat.emissiveIntensity = 0.85 + k * 1.6 + e * 0.4;
    }
    // searchlights
    hype.lights.forEach((m, i) => {
      const k = Math.max(e * 0.9, feverK);
      m.visible = on && k > 0.03;
      if (!m.visible) return;
      m.material.opacity = k * 0.16;
      m.rotation.z = Math.sin(time * 0.7 + m.userData.phase) * 0.45 * (i % 2 ? 1 : -1) - (i % 2 ? 0.25 : -0.25);
      m.rotation.x = Math.sin(time * 0.5 + m.userData.phase * 2) * 0.25;
      if (feverK > 0) m.material.color.setHSL((time * 0.4 + i * 0.12) % 1, 1, 0.6);
      else m.material.color.copy(hype.color);
    });
    // fireworks
    for (const sh of hype.shells) {
      if (sh.dur <= 0) continue;
      sh.t += dt;
      const k = Math.min(1, sh.t / sh.dur);
      sh.s.position.set(sh.x, lerp(sh.y0, sh.y1, 1 - (1 - k) * (1 - k)), sh.z);
      emit(sh.s.position.x, sh.s.position.y, sh.z, 0, -2, 0, sh.color, 0.6, 0.4, 1, 0);
      if (k >= 1) { fireworkBurst(sh); sh.dur = 0; sh.s.visible = false; }
    }
    if (on && feverK > 0) {
      hype.fireT -= dt;
      // confetti rains over the arena
      for (let i = 0; i < 3; i++) {
        emit(rand(-HALF_W, HALF_W), 16, rand(TOP_Z, PADDLE_Z), rand(-1, 1), -rand(3, 6), rand(-1, 1),
          rainbow.setHSL(Math.random(), 1, 0.6).getHex(), rand(0.4, 0.7), 3.2, 0.3, -2);
      }
    }
    // the planet, the grid far below and the wall LEDs speed up with the energy
    if (on) {
      a.planet.ring.rotation.z += dt * e * 2.5;
      a.planet.halo.material.color.setHex(0x2a5bff).lerp(hype.color, e * 0.8);
      a.planet.halo.scale.setScalar(26 + e * 8);
      a.grid.material.color.setHex(0xffffff).lerp(feverK > 0 ? rainbow.setHSL((time * 0.2) % 1, 1, 0.6) : hype.color, Math.min(1, e * 1.2));
      a.sigilEnergy = Math.max(a.sigilEnergy, e * 0.7);
      if (feverK > 0) for (const key in a.strips) a.strips[key].material.color.setHSL((time * 0.5 + key.length * 0.1) % 1, 1, 0.6);
    }
    hype.gridZ = (hype.gridZ + dt * (3 + e * 14)) % 2.5;
    a.grid.position.z = hype.gridZ;
    if (bloom.enabled) bloom.strength = BLOOM * (settings.bloom / 100) * (1 + e * 0.2 + feverK * 0.3);
  }

  // ================================================================ loadout
  const loadout = { ball: P.equippedId('ball'), pad: P.equippedId('pad') };
  const paddle = { x: 0, target: 0, w: BASE_W, targetW: BASE_W, stun: 0, flash: 0, vx: 0, appear: 1, hidden: false };
  let padModel = null;

  function baseWidth() { return loadout.pad === 'pulse' ? BASE_W * 1.25 : BASE_W; }
  function wideWidth() { return baseWidth() * 1.55; }

  function buildPadModel() {
    if (padModel) scene.remove(padModel.group);
    padModel = MODELS.makePad(loadout.pad);
    padModel.group.position.z = PADDLE_Z;
    padModel.layout(paddle.w);
    scene.add(padModel.group);
  }
  buildPadModel();

  // ============================================================ particles
  const PMAX = 3000;
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 3);
  const pSize = new Float32Array(PMAX);
  const pAlpha = new Float32Array(PMAX);
  const pVel = new Float32Array(PMAX * 3);
  const pLife = new Float32Array(PMAX);
  const pMaxLife = new Float32Array(PMAX);
  const pSize0 = new Float32Array(PMAX);
  const pDrag = new Float32Array(PMAX);
  const pGrav = new Float32Array(PMAX);
  let pNext = 0;
  const pGeo = new THREE.BufferGeometry();
  const pAttr = {
    position: new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage),
    pcolor: new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage),
    psize: new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage),
    palpha: new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage),
  };
  Object.keys(pAttr).forEach((k) => pGeo.setAttribute(k, pAttr[k]));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader: /* glsl */`
      attribute vec3 pcolor;
      attribute float psize;
      attribute float palpha;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = pcolor;
        vAlpha = palpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = psize * uScale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.001) discard;
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = clamp(1.0 - d, 0.0, 1.0);
        a = a * a;
        vec3 col = mix(vColor, vec3(1.0), a * a * 0.6);
        gl_FragColor = vec4(col * 1.4, a * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pPoints = new THREE.Points(pGeo, pMat);
  pPoints.frustumCulled = false;
  pPoints.renderOrder = 5;
  scene.add(pPoints);
  const tmpColor = new THREE.Color();

  function emit(x, y, z, vx, vy, vz, color, size, life, drag, grav) {
    const i = pNext;
    pNext = (pNext + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    tmpColor.setHex(color);
    pCol[i * 3] = tmpColor.r; pCol[i * 3 + 1] = tmpColor.g; pCol[i * 3 + 2] = tmpColor.b;
    pSize0[i] = size;
    pLife[i] = pMaxLife[i] = life;
    pDrag[i] = drag;
    pGrav[i] = grav;
  }

  function burst(x, y, z, color, count, speed, life, size, lift) {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * rand(0.25, 1);
      emit(x, y, z, Math.cos(a) * s, rand(0.2, 1) * speed * 0.6 + (lift || 0), Math.sin(a) * s,
        color, size * rand(0.6, 1.3), life * rand(0.6, 1.25), 2.2, -9);
    }
  }

  function updateParticles(dt) {
    for (let i = 0; i < PMAX; i++) {
      if (pLife[i] <= 0) {
        if (pAlpha[i] !== 0) { pAlpha[i] = 0; pSize[i] = 0; }
        continue;
      }
      pLife[i] -= dt;
      const k = Math.max(0, pLife[i] / pMaxLife[i]);
      const dr = Math.exp(-pDrag[i] * dt);
      const j = i * 3;
      pVel[j] *= dr; pVel[j + 1] = pVel[j + 1] * dr + pGrav[i] * dt; pVel[j + 2] *= dr;
      pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      if (pPos[j + 1] < 0.05) { pPos[j + 1] = 0.05; pVel[j + 1] *= -0.4; }
      pAlpha[i] = k;
      pSize[i] = pSize0[i] * (0.35 + 0.65 * k);
    }
    pAttr.position.needsUpdate = true;
    pAttr.pcolor.needsUpdate = true;
    pAttr.psize.needsUpdate = true;
    pAttr.palpha.needsUpdate = true;
  }

  // debris cubes
  const debrisGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const debris = [];
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(debrisGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    m.visible = false;
    scene.add(m);
    debris.push({ m, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, life: 0 });
  }
  let debrisNext = 0;

  function spawnDebris(x, z, color, n) {
    for (let i = 0; i < n; i++) {
      const d = debris[debrisNext];
      debrisNext = (debrisNext + 1) % debris.length;
      d.m.visible = true;
      d.m.position.set(x + rand(-0.7, 0.7), 0.45, z + rand(-0.3, 0.3));
      d.m.material.color.setHex(color);
      d.m.material.opacity = 1;
      d.m.scale.setScalar(rand(0.6, 1.5));
      d.vx = rand(-5, 5); d.vy = rand(3, 9); d.vz = rand(-4, 3);
      d.rx = rand(-12, 12); d.ry = rand(-12, 12);
      d.life = rand(0.7, 1.2);
    }
  }

  function updateDebris(dt) {
    for (const d of debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.m.visible = false; continue; }
      d.vy -= 24 * dt;
      const p = d.m.position;
      p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
      if (p.y < 0.12) { p.y = 0.12; d.vy *= -0.35; d.vx *= 0.7; d.vz *= 0.7; }
      d.m.rotation.x += d.rx * dt;
      d.m.rotation.y += d.ry * dt;
      d.m.material.opacity = Math.min(1, d.life * 2.5);
    }
  }

  // shockwave rings
  const ringGeo = new THREE.RingGeometry(0.85, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    m.renderOrder = 4;
    scene.add(noReflect(m));
    rings.push({ m, life: 0, dur: 1, size: 1 });
  }
  let ringNext = 0;

  function spawnRing(x, z, color, size, dur) {
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    r.m.visible = true;
    r.m.position.set(x, 0.08, z);
    r.m.material.color.setHex(color);
    r.life = r.dur = dur || 0.45;
    r.size = size;
  }

  function updateRings(dt) {
    for (const r of rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const k = 1 - r.life / r.dur;
      const s = lerp(0.3, r.size, 1 - Math.pow(1 - k, 3));
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = 1 - k;
    }
  }

  // lightning arcs (Tesla Coil)
  const arcs = [];
  function lightning(x0, z0, x1, z1, color) {
    const N = 16;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.frustumCulled = false;
    scene.add(line);
    const a = { line, pos, N, x0, z0, x1, z1, life: 0.35, jt: 0 };
    arcs.push(a);
    jag(a);
    for (let i = 0; i < 18; i++) {
      const t = Math.random();
      emit(lerp(x0, x1, t), 0.9 + Math.sin(t * Math.PI) * 1.4, lerp(z0, z1, t), rand(-1, 1), rand(0, 1), rand(-1, 1), color, 0.6, 0.35, 2, 0);
    }
  }
  function jag(a) {
    for (let i = 0; i < a.N; i++) {
      const t = i / (a.N - 1), inner = i > 0 && i < a.N - 1;
      a.pos[i * 3] = lerp(a.x0, a.x1, t) + (inner ? rand(-0.45, 0.45) : 0);
      a.pos[i * 3 + 1] = 0.8 + Math.sin(t * Math.PI) * 1.6 + (inner ? rand(-0.25, 0.25) : 0);
      a.pos[i * 3 + 2] = lerp(a.z0, a.z1, t) + (inner ? rand(-0.3, 0.3) : 0);
    }
    a.line.geometry.attributes.position.needsUpdate = true;
  }
  function updateArcs(dt) {
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.life -= dt;
      a.jt -= dt;
      if (a.life <= 0) {
        scene.remove(a.line);
        a.line.geometry.dispose();
        a.line.material.dispose();
        arcs.splice(i, 1);
        continue;
      }
      if (a.jt <= 0) { a.jt = 0.04; jag(a); }
      a.line.material.opacity = Math.min(1, a.life * 4) * (Math.random() < 0.2 ? 0.3 : 1);
    }
  }

  // ========================================================= shared assets
  const brickGeo = new THREE.RoundedBoxGeometry(BRICK_HW * 2, BRICK_H, BRICK_HD * 2, 3, 0.1);
  const brickTex = {};
  Object.keys(BRICKS).forEach((t) => {
    const def = BRICKS[t];
    const states = Number.isFinite(def.hp) ? def.hp : 1;
    brickTex[t] = [];
    for (let d = 0; d < states; d++) brickTex[t].push(toTexture(brickCanvas(t, d)));
  });

  // Fresnel rim light injected into the standard physical shader: bricks glow
  // in their own colour along the edges, which reads great under bloom.
  function rimCompile(shader) {
    shader.uniforms.uRimColor = this.userData.rimColor;
    shader.uniforms.uRimStrength = this.userData.rimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);',
        'totalEmissiveRadiance += uRimColor * rimF * uRimStrength;',
      ].join('\n'));
  }

  const capsuleGeo = new THREE.CapsuleGeometry(0.32, 0.9, 8, 20);
  capsuleGeo.rotateZ(Math.PI / 2);
  const bandGeo = new THREE.TorusGeometry(0.34, 0.05, 8, 32);
  bandGeo.rotateY(Math.PI / 2);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const puAssets = {};
  Object.keys(PU).forEach((k) => {
    const def = PU[k];
    puAssets[k] = {
      body: new THREE.MeshStandardMaterial({ color: 0x202030, emissive: def.color, emissiveIntensity: 0.85, metalness: 0.7, roughness: 0.18 }),
      label: new THREE.SpriteMaterial({ map: toTexture(labelCanvas(def.key, def.color)), transparent: true, depthTest: false }),
      glow: new THREE.SpriteMaterial({ map: glowTex, color: def.color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
  });

  const plasmaAuraMat = new THREE.SpriteMaterial({ map: glowTex, color: COL.orange, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });

  const laserGeo = new THREE.BoxGeometry(0.1, 0.1, 1.1);
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff5a78 });

  const boltGeo = new THREE.SphereGeometry(0.3, 16, 12);
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xffc0a0 });
  const boltGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: COL.red, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  const droneCoreGeo = new THREE.OctahedronGeometry(0.44, 0);
  const droneCoreEdges = new THREE.EdgesGeometry(droneCoreGeo);
  const droneCoreMat = new THREE.MeshStandardMaterial({ color: 0x0f2a10, emissive: COL.lime, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.2, flatShading: true });
  const droneEdgeMat = new THREE.LineBasicMaterial({ color: 0xd8ffb0 });
  const droneRingGeo = new THREE.TorusGeometry(0.72, 0.05, 8, 48);
  const droneRingMat = new THREE.MeshBasicMaterial({ color: COL.cyan });
  const droneEyeGeo = new THREE.SphereGeometry(0.13, 12, 10);
  const droneEyeMat = new THREE.MeshBasicMaterial({ color: COL.red });
  const droneGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: COL.lime, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });

  // ================================================================ audio
  const audio = (() => {
    let ctx = null, master = null, sfxBus = null, musicBus = null, delayIn = null, echo = null, noiseBuf = null;
    let muted = store.get('neonSigil.muted', '0') === '1';
    let musicTimer = null, step = 0, nextTime = 0, boss = false, ducked = false;
    const lastPlayed = {};
    // bus levels from the settings (the old fixed mix is the 100% point)
    const masterLevel = () => (muted ? 0 : (0.85 * settings.master) / 85);
    const sfxLevel = () => (0.6 * settings.sfx) / 100;
    const musicLevel = () => ((ducked ? 0.1 : 0.34) * settings.music) / 70;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

    const SONGS = {
      normal: { bpm: 112, chords: [
        { bass: 45, arp: [69, 72, 76] },   // Am
        { bass: 41, arp: [65, 69, 72] },   // F
        { bass: 48, arp: [67, 72, 76] },   // C
        { bass: 43, arp: [67, 71, 74] },   // G
      ] },
      boss: { bpm: 126, chords: [
        { bass: 45, arp: [69, 72, 76] },   // Am
        { bass: 46, arp: [70, 74, 77] },   // Bb
        { bass: 45, arp: [69, 72, 76] },   // Am
        { bass: 40, arp: [68, 71, 76] },   // E
      ] },
    };

    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) {
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4;
        comp.connect(ctx.destination);
        master = ctx.createGain();
        master.gain.value = masterLevel();
        master.connect(comp);
        sfxBus = ctx.createGain(); sfxBus.gain.value = sfxLevel(); sfxBus.connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = musicLevel(); musicBus.connect(master);
        delayIn = ctx.createGain();
        echo = ctx.createDelay(1.5);
        echo.delayTime.value = (60 / SONGS.normal.bpm) * 0.75;
        const fb = ctx.createGain(); fb.gain.value = 0.38;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        delayIn.connect(echo); echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(musicBus);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      // iOS reports 'interrupted' after a call or after the app was in the background
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (!musicTimer) {
        nextTime = ctx.currentTime + 0.15;
        musicTimer = setInterval(schedule, 25);
      }
    }

    function tone(o) {
      if (!ctx) return;
      const t = o.at != null ? o.at : ctx.currentTime + (o.delay || 0);
      const dur = o.dur || 0.1, vol = o.vol || 0.2, attack = o.attack || 0.004;
      const osc = ctx.createOscillator();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.slide || dur));
      if (o.detune) osc.detune.value = o.detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc;
      if (o.lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(o.lp, t);
        if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur);
        f.Q.value = o.q || 1;
        osc.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(o.bus || sfxBus);
      if (o.send) g.connect(delayIn);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    function noise(o) {
      if (!ctx) return;
      const t = o.at != null ? o.at : ctx.currentTime + (o.delay || 0);
      const dur = o.dur || 0.1;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.f || 2000, t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
      f.Q.value = o.q || 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(o.vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.05);
    }

    // avoid stacking dozens of identical sounds in the same instant (chain explosions)
    function gate(name, gap) {
      if (!ctx || muted) return false;
      const now = ctx.currentTime;
      if (lastPlayed[name] && now - lastPlayed[name] < gap) return false;
      lastPlayed[name] = now;
      return true;
    }

    function arp(notes, base, step, type, vol, opts) {
      notes.forEach((s, i) => tone(Object.assign({ f: base * Math.pow(2, s / 12), dur: 0.16, type, vol, delay: i * step }, opts)));
    }

    function playStep(s, t) {
      const song = boss ? SONGS.boss : SONGS.normal;
      const spb = 60 / song.bpm / 4;
      const st = s % 16;
      const ch = song.chords[Math.floor(s / 16) % 4];
      const bus = musicBus;
      if (st % 4 === 0) tone({ at: t, f: 150, f2: 42, slide: 0.12, dur: 0.32, type: 'sine', vol: 0.55, bus });
      if (st === 4 || st === 12) {
        noise({ at: t, dur: 0.16, vol: 0.2, filter: 'bandpass', f: 1900, q: 0.9, bus });
        tone({ at: t, f: 220, f2: 140, dur: 0.1, type: 'triangle', vol: 0.1, bus });
      }
      if (st % 4 === 2) noise({ at: t, dur: 0.06, vol: 0.07, filter: 'highpass', f: 7500, bus });
      else if (boss && st % 2 === 1) noise({ at: t, dur: 0.025, vol: 0.035, filter: 'highpass', f: 8000, bus });
      const bassPat = [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 12, 0];
      tone({ at: t, f: midi(ch.bass + bassPat[st] - 12), dur: spb * 0.9, type: 'sawtooth', vol: 0.15, lp: 900, lp2: 240, bus });
      if (st % 2 === 0) {
        const n = ch.arp[(st / 2) % 3] + (st >= 8 ? 12 : 0);
        tone({ at: t, f: midi(n), dur: spb * 1.6, type: 'square', vol: 0.04, lp: 3200, bus, send: true });
      }
      if (st === 0) {
        ch.arp.forEach((n, i) => tone({ at: t, f: midi(n - 12), dur: spb * 16, type: 'sawtooth', vol: 0.025, attack: 0.4, lp: 1100, detune: (i - 1) * 7, bus }));
      }
    }

    function schedule() {
      if (!ctx) return;
      if (muted || ctx.state !== 'running') { nextTime = ctx.currentTime + 0.1; return; }
      const song = boss ? SONGS.boss : SONGS.normal;
      const spb = 60 / song.bpm / 4;
      if (nextTime < ctx.currentTime - 0.3) nextTime = ctx.currentTime + 0.05;   // tab was in background
      while (nextTime < ctx.currentTime + 0.12) {
        playStep(step, nextTime);
        nextTime += spb;
        step = (step + 1) % 64;
      }
    }

    const sfx = {
      paddle(off) { if (gate('paddle', 0.03)) tone({ f: 300 + off * 90, f2: 620 + off * 90, dur: 0.09, type: 'square', vol: 0.16, lp: 3200 }); },
      wall() { if (gate('wall', 0.04)) tone({ f: 1500, dur: 0.04, type: 'triangle', vol: 0.07 }); },
      brick(chain) {
        if (!gate('brick', 0.025)) return;
        const f = 520 * Math.pow(2, Math.min(chain, 18) / 12);
        tone({ f, f2: f * 1.5, dur: 0.08, type: 'square', vol: 0.12, lp: 5000 });
        noise({ dur: 0.06, vol: 0.07, filter: 'highpass', f: 3000 });
      },
      armor() {
        if (!gate('armor', 0.03)) return;
        tone({ f: 1800, dur: 0.07, type: 'square', vol: 0.07 });
        tone({ f: 2450, dur: 0.12, type: 'triangle', vol: 0.08, delay: 0.01 });
      },
      solid() { if (gate('solid', 0.04)) tone({ f: 190, f2: 120, dur: 0.09, type: 'square', vol: 0.11, lp: 1200 }); },
      explode() {
        if (!gate('explode', 0.06)) return;
        noise({ dur: 0.7, vol: 0.45, filter: 'lowpass', f: 2600, f2: 80 });
        tone({ f: 130, f2: 32, dur: 0.5, type: 'sine', vol: 0.5 });
      },
      nova() {
        if (!gate('nova', 0.1)) return;
        tone({ f: 200, f2: 1200, dur: 0.25, type: 'sawtooth', vol: 0.1, lp: 3000 });
        noise({ dur: 0.5, vol: 0.3, filter: 'lowpass', f: 4000, f2: 200 });
      },
      power() { if (gate('power', 0.05)) arp([0, 4, 7, 12, 16], 523.25, 0.05, 'square', 0.09, { dur: 0.12, lp: 4200 }); },
      life() { if (gate('life', 0.1)) arp([0, 7, 12, 19, 24], 659.25, 0.07, 'triangle', 0.14); },
      laser() { if (gate('laser', 0.05)) tone({ f: 1900, f2: 380, dur: 0.08, type: 'sawtooth', vol: 0.05, lp: 4200 }); },
      zap() {
        if (!gate('zap', 0.1)) return;
        noise({ dur: 0.3, vol: 0.3, filter: 'bandpass', f: 2500, f2: 600, q: 4 });
        tone({ f: 1200, f2: 90, dur: 0.25, type: 'sawtooth', vol: 0.08, lp: 5000 });
      },
      ghost() { if (gate('ghost', 0.1)) arp([0, 3, 7], 740, 0.04, 'square', 0.05, { dur: 0.08, detune: 30 }); },
      // --- Funky Balls level-up cards
      levelUp() { if (gate('levelUp', 0.3)) arp([0, 4, 7, 12, 16, 19, 24], 587.33, 0.045, 'square', 0.08, { dur: 0.16, lp: 5200, send: true }); },
      poison() {
        if (!gate('poison', 0.1)) return;
        tone({ f: 330, f2: 150, dur: 0.18, type: 'triangle', vol: 0.08 });
        noise({ dur: 0.16, vol: 0.07, filter: 'bandpass', f: 700, q: 3 });
      },
      split() { if (gate('split', 0.06)) tone({ f: 900, f2: 1600, dur: 0.07, type: 'triangle', vol: 0.05 }); },
      pierce() { if (gate('pierce', 0.06)) tone({ f: 1500, f2: 420, dur: 0.1, type: 'sawtooth', vol: 0.05, lp: 4000 }); },
      catch() { if (gate('catch', 0.05)) tone({ f: 500, f2: 250, dur: 0.12, type: 'triangle', vol: 0.12 }); },
      coin() {
        if (!gate('coin', 0.03)) return;
        tone({ f: 1318.5, dur: 0.07, type: 'square', vol: 0.06, lp: 6000 });
        tone({ f: 1975.5, dur: 0.16, type: 'square', vol: 0.06, delay: 0.06, lp: 6000 });
      },
      launch() { if (gate('launch', 0.1)) tone({ f: 220, f2: 880, dur: 0.16, type: 'sawtooth', vol: 0.09, lp: 2600 }); },
      lose() {
        if (!gate('lose', 0.2)) return;
        tone({ f: 440, f2: 50, dur: 0.95, type: 'sawtooth', vol: 0.22, lp: 1800 });
        noise({ dur: 0.7, vol: 0.25, f: 1500, f2: 90 });
      },
      clear() { if (gate('clear', 0.3)) arp([0, 4, 7, 11, 12, 16, 19, 24], 440, 0.08, 'square', 0.08, { dur: 0.22, lp: 3800, send: true }); },
      bossHit() {
        if (!gate('bossHit', 0.05)) return;
        tone({ f: 95, f2: 42, dur: 0.28, type: 'square', vol: 0.26, lp: 900 });
        noise({ dur: 0.18, vol: 0.2, f: 1400 });
      },
      charge() { if (gate('charge', 0.2)) tone({ f: 180, f2: 950, dur: 0.6, type: 'sawtooth', vol: 0.05, lp: 1600, attack: 0.1 }); },
      bolt() { if (gate('bolt', 0.05)) tone({ f: 640, f2: 140, dur: 0.28, type: 'square', vol: 0.09, lp: 2200 }); },
      stun() {
        if (!gate('stun', 0.2)) return;
        noise({ dur: 0.35, vol: 0.25, filter: 'bandpass', f: 900, q: 3 });
        tone({ f: 70, dur: 0.35, type: 'sawtooth', vol: 0.15, lp: 600 });
      },
      drone() { if (gate('drone', 0.05)) { tone({ f: 900, f2: 120, dur: 0.25, type: 'square', vol: 0.1, lp: 3000 }); noise({ dur: 0.25, vol: 0.15, f: 3000, f2: 300 }); } },
      portal() { if (gate('portal', 0.2)) tone({ f: 120, f2: 520, dur: 0.4, type: 'triangle', vol: 0.08 }); },
      advance() {
        if (!gate('advance', 0.2)) return;
        tone({ f: 70, f2: 45, dur: 0.4, type: 'sawtooth', vol: 0.18, lp: 500 });
        noise({ dur: 0.35, vol: 0.12, filter: 'lowpass', f: 900, f2: 180 });
      },
      tick() { if (gate('tick', 0.045)) tone({ f: 1100, f2: 1650, dur: 0.035, type: 'square', vol: 0.03, lp: 5000 }); },
      land() { if (gate('land', 0.06)) tone({ f: 540, dur: 0.04, type: 'triangle', vol: 0.035 }); },
      shield() { if (gate('shield', 0.1)) tone({ f: 330, f2: 990, dur: 0.2, type: 'triangle', vol: 0.14 }); },
      start() { if (gate('start', 0.2)) arp([0, 7, 12], 220, 0.09, 'sawtooth', 0.08, { dur: 0.25, lp: 2400, send: true }); },
      // --- menus / lottery
      click() { if (gate('click', 0.03)) tone({ f: 900, f2: 1400, dur: 0.05, type: 'triangle', vol: 0.06 }); },
      equip() { if (gate('equip', 0.1)) arp([0, 7, 12], 392, 0.05, 'square', 0.07, { dur: 0.12, lp: 3500 }); },
      error() { if (gate('error', 0.15)) tone({ f: 140, dur: 0.18, type: 'square', vol: 0.1, lp: 900 }); },
      card() { if (gate('card', 0.03)) noise({ dur: 0.08, vol: 0.2, filter: 'bandpass', f: 3200, q: 1.2 }); },
      chip() {
        if (!gate('chip', 0.03)) return;
        tone({ f: 2200, dur: 0.05, type: 'triangle', vol: 0.08 });
        tone({ f: 2900, dur: 0.07, type: 'triangle', vol: 0.06, delay: 0.03 });
      },
      win() { if (gate('win', 0.2)) arp([0, 4, 7, 12], 523.25, 0.07, 'square', 0.08, { dur: 0.2, lp: 4500, send: true }); },
      jackpot() { if (gate('jackpot', 0.3)) arp([0, 4, 7, 12, 16, 19, 24, 28], 523.25, 0.06, 'square', 0.08, { dur: 0.22, lp: 5000, send: true }); },
      bust() {
        if (!gate('bust', 0.2)) return;
        tone({ f: 330, f2: 110, dur: 0.5, type: 'sawtooth', vol: 0.12, lp: 1400 });
      },
      boxTap() {
        if (!gate('boxTap', 0.05)) return;
        tone({ f: 110, f2: 60, dur: 0.18, type: 'sine', vol: 0.4 });
        noise({ dur: 0.12, vol: 0.15, filter: 'lowpass', f: 1800 });
      },
      boxOpen() {
        if (!gate('boxOpen', 0.2)) return;
        tone({ f: 200, f2: 1600, dur: 0.5, type: 'sawtooth', vol: 0.09, lp: 3000 });
        noise({ dur: 0.6, vol: 0.25, filter: 'highpass', f: 1200, f2: 6000 });
      },
      reveal(rank) {
        if (!gate('reveal', 0.1)) return;
        const notes = [0, 4, 7, 12, 16, 19, 24].slice(0, 3 + Math.min(4, rank));
        arp(notes, 392 * Math.pow(2, rank * 2 / 12), 0.06, 'square', 0.08, { dur: 0.24, lp: 5000, send: true });
        if (rank >= 3) noise({ dur: 0.8, vol: 0.2, filter: 'highpass', f: 3000, f2: 9000 });
      },
    };

    return {
      init,
      sfx,
      setBoss(b) {
        boss = b;
        if (echo) echo.delayTime.setTargetAtTime((60 / (b ? SONGS.boss.bpm : SONGS.normal.bpm)) * 0.75, ctx.currentTime, 0.05);
      },
      duck(on) { ducked = on; if (musicBus) musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.1); },
      toggleMute() {
        muted = !muted;
        store.set('neonSigil.muted', muted ? '1' : '0');
        if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
        return muted;
      },
      // re-reads the volume settings
      applyVolumes() {
        if (!ctx) return;
        master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.03);
        sfxBus.gain.setTargetAtTime(sfxLevel(), ctx.currentTime, 0.03);
        musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.03);
      },
      get muted() { return muted; },
    };
  })();
  const sfx = audio.sfx;
  NEON.audio = audio;

  // ================================================================= state
  const game = {
    state: 'intro', demo: true, paused: false,
    score: 0, hi: parseInt(store.get('neonSigil.hi', '0'), 10) || 0,
    lives: 3, level: 1, levelDef: LEVELS[0],
    chain: 0, speed: 15, stateT: 0, levelT: 0, remaining: 0, nextLifeAt: 30000,
    timers: { wide: 0, laser: 0, slow: 0, plasma: 0, shield: 0 },
    timerMax: { wide: 1, laser: 1, slow: 1, plasma: 1, shield: 1 },
    shake: 0, glitch: 0, laserCd: 0, droneT: 10, boomT: 0, bigBoom: false, overShown: false,
    runCoins: 0, runTokens: 0, padHits: 0, novaCount: 0, teslaT: 5,
    // 'classic' | 'survival' | 'funky'
    mode: 'classic',
    // survival: the firewall creeps down one row every creepMax seconds
    creepT: 14, creepMax: 14, survTime: 0, waves: 0,
  };
  let time = 0;
  let menuOpen = false;
  let focusX = 0;   // camera sway target in Funky Balls (the Cybergun position)

  const HI_KEYS = { classic: 'neonSigil.hi', survival: 'neonSigil.hi.survival' };
  const readHi = (mode) => parseInt(store.get(HI_KEYS[mode] || HI_KEYS.classic, '0'), 10) || 0;
  const mmss = (s) => Math.floor(s / 60) + ':' + pad(s % 60, 2);

  const bricks = [];
  let grid = [];
  const balls = [];
  const powerups = [];
  const coins = [];
  const lasers = [];
  const bolts = [];
  const drones = [];
  const pending = [];

  function setState(s) {
    game.state = s;
    game.stateT = 0;
  }

  function cellAt(row, col) {
    if (row < 0 || row >= grid.length || col < 0 || col >= COLS) return null;
    const br = grid[row][col];
    return br && br.alive ? br : null;
  }

  // ================================================================ bricks
  function createBrick(type, row, col, delay) {
    const def = BRICKS[type];
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x5a5a6a, map: brickTex[type][0], emissive: 0xffffff, emissiveMap: brickTex[type][0],
      emissiveIntensity: BRICK_GLOW[type], metalness: 0.35, roughness: 0.34,
      clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9,
    });
    mat.userData.rimColor = { value: new THREE.Color(def.color) };
    mat.userData.rimStrength = { value: 0.55 };
    mat.onBeforeCompile = rimCompile;
    const mesh = new THREE.Mesh(brickGeo, mat);
    const x = -HALF_W + CELL_W / 2 + col * CELL_W;
    const z = ROW0_Z + row * CELL_D;
    mesh.position.set(x, BRICK_H / 2 + 12, z);
    scene.add(mesh);
    const br = {
      type, def, row, col, x, z, hp: def.hp, mesh, mat, alive: true, ready: false, flash: 0,
      delay, phase: Math.random() * Math.PI * 2,
    };
    grid[row][col] = br;
    bricks.push(br);
    if (!def.solid) game.remaining++;
    return br;
  }

  function buildBricks(map) {
    grid = map.map(() => new Array(COLS).fill(null));
    game.remaining = 0;
    map.forEach((line, row) => {
      for (let col = 0; col < COLS; col++) {
        if (BRICKS[line[col]]) createBrick(line[col], row, col, row * 0.06 + Math.abs(col - 6) * 0.035);
      }
    });
  }

  // Glowing rim-lit material shared with Funky Balls' numbered bricks
  function glowBrickMaterial(color) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x24243a, emissive: color, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.3,
      clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9,
    });
    mat.userData.rimColor = { value: new THREE.Color(color) };
    mat.userData.rimStrength = { value: 0.8 };
    mat.onBeforeCompile = rimCompile;
    return mat;
  }

  function updateBricks(dt) {
    for (const br of bricks) {
      if (!br.ready) {
        const k = clamp((game.levelT - br.delay) / 0.55, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        br.mesh.position.y = BRICK_H / 2 + (1 - e) * 12;
        br.mesh.position.z = br.z;
        br.mesh.rotation.x = (1 - e) * 1.4;
        if (k >= 1) {
          br.ready = true;
          br.mesh.rotation.x = 0;
          if (Math.random() < 0.35) burst(br.x, 0.1, br.z, br.def.color, 3, 3, 0.4, 0.5);
        }
      } else if (br.mesh.position.z !== br.z) {
        // survival: glide down after the firewall shifts
        br.mesh.position.z = Math.abs(br.mesh.position.z - br.z) < 0.01 ? br.z : damp(br.mesh.position.z, br.z, 9, dt);
      }
      br.flash = Math.max(0, br.flash - dt * 5);
      let glow = BRICK_GLOW[br.type] + br.flash * 1.5;
      if (br.def.explosive) glow += 0.3 * Math.sin(time * 6 + br.phase);
      else if (br.type === '$') glow += 0.2 * Math.sin(time * 3 + br.phase);
      br.mat.emissiveIntensity = glow;
      br.mat.userData.rimStrength.value = 0.55 + br.flash * 2.5;
      const s = 1 + br.flash * 0.1;
      br.mesh.scale.set(s, 1 + br.flash * 0.35, s);
    }
  }

  // cause: 'ball' | 'laser' | 'tesla' | 'nova' | 'explosion'
  function hitBrick(br, cause, ball) {
    if (!br.alive) return;
    if (br.def.solid) {
      br.flash = 1;
      sfx.solid();
      burst(br.x, 0.5, br.z + BRICK_HD, br.def.color, 5, 4, 0.3, 0.45);
      return;
    }
    const dmg = cause === 'ball' && loadout.ball === 'shard' ? 2 : 1;
    br.hp -= dmg;
    if (br.hp <= 0) { destroyBrick(br, cause, ball); return; }
    br.flash = 1;
    const tex = brickTex[br.type][Math.min(brickTex[br.type].length - 1, br.def.hp - br.hp)];
    br.mat.map = tex;
    br.mat.emissiveMap = tex;
    sfx.armor();
    burst(br.x, 0.5, br.z, br.def.color, 8, 5, 0.35, 0.5);
  }

  function destroyBrick(br, cause, ball) {
    if (!br.alive || br.def.solid) return;
    br.alive = false;
    grid[br.row][br.col] = null;
    bricks.splice(bricks.indexOf(br), 1);
    scene.remove(br.mesh);
    br.mat.dispose();
    game.remaining--;
    game.chain++;
    addScore(br.def.score, br.x, br.z);

    const color = br.def.color;
    burst(br.x, 0.45, br.z, color, 22, 7, 0.55, 0.7);
    burst(br.x, 0.45, br.z, 0xffffff, 6, 4, 0.3, 0.5);
    spawnDebris(br.x, br.z, color, 5);
    spawnRing(br.x, br.z, color, 2.2, 0.4);
    ambient.sigilEnergy = Math.min(1, ambient.sigilEnergy + 0.1);
    hypeEvent(0.05, color, br.x, br.z);
    sfx.brick(game.chain);

    if (br.def.explosive) explodeBrick(br);
    const seraph = loadout.pad === 'seraph';
    if (br.def.drop) spawnPowerup(br.x, br.z, rollPowerup());
    else if (Math.random() < DROP_CHANCE * (seraph ? 2 : 1) && powerups.length < (seraph ? 6 : 4)) spawnPowerup(br.x, br.z, rollPowerup());
    if (br.def.drop) spawnCoin(br.x + 0.4, br.z, 20);
    else if (Math.random() < COIN_CHANCE) spawnCoin(br.x, br.z, 5);

    if (cause === 'ball' && ball && !ball.ghost) {
      if (loadout.ball === 'glitch' && Math.random() < 0.15) spawnGhost(ball);
      if (loadout.ball === 'nova' && ++game.novaCount % 5 === 0) supernova(br);
    }
  }

  function explodeBrick(br) {
    burst(br.x, 0.6, br.z, COL.orange, 50, 11, 0.7, 1.0, 2);
    burst(br.x, 0.6, br.z, COL.red, 30, 8, 0.6, 0.9, 1);
    spawnRing(br.x, br.z, COL.orange, 4.5, 0.55);
    spawnDebris(br.x, br.z, COL.orange, 6);
    flashLight(br.x, br.z, COL.orange, 5);
    addShake(0.45);
    game.glitch = Math.max(game.glitch, 0.35);
    sfx.explode();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const n = cellAt(br.row + dr, br.col + dc);
        if (n && !n.def.solid) pending.push({ t: 0.09, br: n, hit: false });
      }
    }
  }

  // Solar Nova ability: a golden blast that damages (not destroys) the 8 neighbours
  function supernova(br) {
    burst(br.x, 0.6, br.z, 0xffd23a, 50, 10, 0.7, 1.0, 2);
    burst(br.x, 0.6, br.z, 0xffffff, 20, 7, 0.4, 0.7, 1);
    spawnRing(br.x, br.z, 0xffd23a, 5.5, 0.6);
    flashLight(br.x, br.z, 0xffc040, 5);
    addShake(0.3);
    sfx.nova();
    if (!game.demo) popup('SUPERNOVA', br.x, br.z - 1, 'hot');
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const n = cellAt(br.row + dr, br.col + dc);
        if (n && !n.def.solid) pending.push({ t: 0.08, br: n, hit: true });
      }
    }
  }

  function updatePending(dt) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      p.t -= dt;
      if (p.t > 0) continue;
      pending.splice(i, 1);
      if (!p.br.alive) continue;
      if (p.hit) hitBrick(p.br, 'nova');
      else destroyBrick(p.br, 'explosion');
    }
  }

  // ================================================================= balls
  function addBall(x, z, dx, dz, stuck, ghost) {
    const model = MODELS.makeBall(loadout.ball, { ghost: !!ghost });
    const aura = new THREE.Sprite(plasmaAuraMat);
    aura.scale.set(2.2, 2.2, 1);
    aura.visible = false;
    model.group.add(aura);
    model.group.position.set(x, BALL_R, z);
    scene.add(model.group);
    const b = {
      model, aura, x, z, dx, dz, px: x, pz: z, stuck: !!stuck, offset: 0, alive: true,
      ghost: !!ghost, life: ghost ? 8 : 0, caught: false, holdT: 0,
    };
    balls.push(b);
    return b;
  }

  function derezBall(b) {
    burst(b.x, BALL_R, b.z, b.model.trail, 14, 5, 0.5, 0.6);
    scene.remove(b.model.group);
  }

  function clearBalls() {
    while (balls.length) derezBall(balls.pop());
  }

  function rebuildBallModels() {
    for (const b of balls) {
      scene.remove(b.model.group);
      b.model = MODELS.makeBall(loadout.ball, { ghost: b.ghost });
      b.aura = new THREE.Sprite(plasmaAuraMat);
      b.aura.scale.set(2.2, 2.2, 1);
      b.aura.visible = false;
      b.model.group.add(b.aura);
      b.model.group.position.set(b.x, BALL_R, b.z);
      scene.add(b.model.group);
    }
  }

  function spawnServeBall() {
    const b = addBall(paddle.x, PADDLE_Z - PADDLE_HD - BALL_R - 0.05, 0, -1, true);
    b.offset = 0;
    spawnRing(b.x, b.z, b.model.trail, 2, 0.4);
    if (loadout.pad === 'aegis') {
      game.timers.shield = game.timerMax.shield = PU.shield.dur;
      ambient.shield.visible = true;
    }
  }

  function spawnGhost(src) {
    if (balls.filter((b) => b.ghost).length >= MAX_GHOSTS || balls.length >= MAX_BALLS) return;
    const a = rand(-0.7, 0.7);
    const g = addBall(src.x, src.z, Math.sin(a), -Math.cos(a), false, true);
    normalizeDir(g);
    burst(src.x, BALL_R, src.z, COL.magenta, 16, 5, 0.4, 0.6);
    burst(src.x, BALL_R, src.z, COL.cyan, 10, 4, 0.4, 0.5);
    sfx.ghost();
  }

  function releaseBall(b) {
    if (b.caught) {
      const off = clamp(b.offset / (paddle.w / 2), -1, 1);
      const a = off * 1.1;
      b.dx = Math.sin(a);
      b.dz = -Math.cos(a);
    } else {
      const a = clamp(rand(-0.3, 0.3) + paddle.vx * 0.01, -0.6, 0.6);
      b.dx = Math.sin(a);
      b.dz = -Math.cos(a);
    }
    b.stuck = false;
    b.caught = false;
  }

  function launch() {
    let any = false;
    for (const b of balls) {
      if (!b.stuck) continue;
      releaseBall(b);
      any = true;
    }
    if (any) {
      sfx.launch();
      spawnRing(paddle.x, PADDLE_Z, padModel.thruster, 3, 0.35);
      if (game.state === 'serve') setState('play');
    }
  }

  function currentSpeed() {
    return game.speed * (game.timers.slow > 0 ? 0.62 : 1);
  }

  function circleRect(cx, cz, r, rx, rz, hw, hd) {
    const dx = cx - rx, dz = cz - rz;
    const px = clamp(dx, -hw, hw), pz = clamp(dz, -hd, hd);
    const ox = dx - px, oz = dz - pz;
    const d2 = ox * ox + oz * oz;
    if (d2 > r * r) return null;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      return { nx: ox / d, nz: oz / d, pen: r - d };
    }
    // centre is inside the box — push out along the shallowest axis
    const ex = hw - Math.abs(dx), ez = hd - Math.abs(dz);
    if (ex < ez) return { nx: dx < 0 ? -1 : 1, nz: 0, pen: ex + r };
    return { nx: 0, nz: dz < 0 ? -1 : 1, pen: ez + r };
  }

  function normalizeDir(b) {
    // keep a minimum forward component so the ball never ping-pongs sideways forever
    const min = 0.26;
    let l = Math.hypot(b.dx, b.dz) || 1;
    b.dx /= l; b.dz /= l;
    if (Math.abs(b.dz) < min) {
      b.dz = (b.dz < 0 ? -1 : 1) * min;
      b.dx = (b.dx < 0 ? -1 : 1) * Math.sqrt(1 - min * min);
    }
    l = Math.hypot(b.dx, b.dz);
    b.dx /= l; b.dz /= l;
  }

  function resolve(b, hit) {
    b.x += hit.nx * hit.pen;
    b.z += hit.nz * hit.pen;
    const dot = b.dx * hit.nx + b.dz * hit.nz;
    if (dot < 0) {
      b.dx -= 2 * dot * hit.nx;
      b.dz -= 2 * dot * hit.nz;
    }
    normalizeDir(b);
  }

  function collideBricks(b) {
    const r = BALL_R;
    const gridTop = ROW0_Z - CELL_D / 2;
    const r0 = Math.max(0, Math.floor((b.z - r - gridTop) / CELL_D));
    const r1 = Math.min(grid.length - 1, Math.floor((b.z + r - gridTop) / CELL_D));
    if (r1 < r0) return;
    const c0 = Math.max(0, Math.floor((b.x - r + HALF_W) / CELL_W));
    const c1 = Math.min(COLS - 1, Math.floor((b.x + r + HALF_W) / CELL_W));
    let best = null, hit = null;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const br = grid[row][col];
        if (!br || !br.alive || !br.ready) continue;
        const h = circleRect(b.x, b.z, r, br.x, br.z, BRICK_HW, BRICK_HD);
        if (h && (!hit || h.pen > hit.pen)) { best = br; hit = h; }
      }
    }
    if (!best) return;

    if (game.timers.plasma > 0 && !best.def.solid) {
      destroyBrick(best, 'ball', b);   // plasma punches straight through
      return;
    }
    // a corner hit on a seam between neighbouring bricks should act like a flat face
    if (hit.nx !== 0 && hit.nz !== 0) {
      const nbX = cellAt(best.row, best.col + (hit.nx > 0 ? 1 : -1));
      const nbZ = cellAt(best.row + (hit.nz > 0 ? 1 : -1), best.col);
      if (nbX && !nbZ) {
        hit.nx = 0; hit.nz = hit.nz > 0 ? 1 : -1;
        hit.pen = Math.max(0, BRICK_HD + r - Math.abs(b.z - best.z));
      } else if (nbZ && !nbX) {
        hit.nz = 0; hit.nx = hit.nx > 0 ? 1 : -1;
        hit.pen = Math.max(0, BRICK_HW + r - Math.abs(b.x - best.x));
      }
    }
    resolve(b, hit);
    hitBrick(best, 'ball', b);
  }

  function collidePaddle(b) {
    const hw = paddle.w / 2;
    const hit = circleRect(b.x, b.z, BALL_R, paddle.x, PADDLE_Z, hw, PADDLE_HD);
    if (!hit) return;
    if (b.z < PADDLE_Z) {
      // front face: the hit position decides the outgoing angle
      const off = clamp((b.x - paddle.x) / (hw + BALL_R * 0.5), -1, 1);
      const ang = off * 1.1;
      b.dx = Math.sin(ang);
      b.dz = -Math.cos(ang);
      b.z = Math.min(b.z, PADDLE_Z - PADDLE_HD - BALL_R);
      onPaddleHit(b, off);
      if (loadout.pad === 'magnet' && game.state === 'play') {
        b.stuck = true;
        b.caught = true;
        b.holdT = 2;
        b.offset = clamp(b.x - paddle.x, -hw + 0.2, hw - 0.2);
        b.z = PADDLE_Z - PADDLE_HD - BALL_R - 0.05;
        sfx.catch();
      }
    } else {
      resolve(b, hit);
    }
  }

  function onPaddleHit(b, off) {
    sfx.paddle(off);
    paddle.flash = 1;
    game.speed = Math.min(game.speed + 0.08, speedCap());
    if (game.chain >= 8 && !game.demo) popup('CHAIN ' + game.chain, paddle.x, PADDLE_Z - 1.5, 'hot');
    game.chain = 0;
    burst(b.x, BALL_R, b.z + BALL_R, b.model.trail, 8, 4, 0.3, 0.45);
    if (b.ghost) return;
    game.padHits++;
    if (loadout.pad === 'twin') {
      fireLaser(paddle.x - (paddle.w / 2 - 0.3));
      fireLaser(paddle.x + (paddle.w / 2 - 0.3));
      sfx.laser();
    }
    if (loadout.ball === 'magma' && game.padHits % 8 === 0) {
      game.timers.plasma = Math.max(game.timers.plasma, 3);
      game.timerMax.plasma = Math.max(game.timerMax.plasma, game.timers.plasma);
      burst(b.x, BALL_R, b.z, COL.orange, 30, 7, 0.5, 0.8, 2);
      spawnRing(b.x, b.z, COL.orange, 3.5, 0.4);
      if (!game.demo) popup('MELTDOWN', paddle.x, PADDLE_Z - 1.6, 'hot');
      sfx.explode();
    }
  }

  function onWallHit(side, b) {
    const s = ambient.strips[side];
    s.userData.flash = 1;
    sfx.wall();
    burst(b.x, BALL_R, b.z, b.model.trail, 4, 3, 0.25, 0.4);
  }

  function stepBall(b, h) {
    b.x += b.dx * h;
    b.z += b.dz * h;
    const r = BALL_R;
    if (b.x < -HALF_W + r) { b.x = -HALF_W + r; if (b.dx < 0) { b.dx = -b.dx; normalizeDir(b); onWallHit('left', b); } }
    else if (b.x > HALF_W - r) { b.x = HALF_W - r; if (b.dx > 0) { b.dx = -b.dx; normalizeDir(b); onWallHit('right', b); } }
    if (b.z < TOP_Z + r) { b.z = TOP_Z + r; if (b.dz < 0) { b.dz = -b.dz; onWallHit('top', b); } }

    const chin = circleRect(b.x, b.z, r, CHIN.x, CHIN.z, CHIN.hw, CHIN.hd);
    if (chin) { resolve(b, chin); onSentinelHit(b); }

    collideBricks(b);

    for (const d of drones) {
      if (!d.alive) continue;
      const ox = b.x - d.x, oz = b.z - d.z, rr = r + DRONE_R;
      const d2 = ox * ox + oz * oz;
      if (d2 < rr * rr) {
        const dd = Math.sqrt(d2) || 1;
        resolve(b, { nx: ox / dd, nz: oz / dd, pen: rr - dd });
        killDrone(d, true);
      }
    }

    if (b.dz > 0) collidePaddle(b);
    if (b.stuck) return;

    if (game.timers.shield > 0 && b.dz > 0 && b.z > SHIELD_Z - r) {
      b.z = SHIELD_Z - r;
      b.dz = -Math.abs(b.dz);
      game.timers.shield = 0;
      ambient.shield.visible = false;
      sfx.shield();
      burst(b.x, 0.3, SHIELD_Z, COL.blue, 30, 7, 0.5, 0.7);
      spawnRing(b.x, SHIELD_Z, COL.blue, 4, 0.5);
    }

    if (b.z > LOSE_Z) b.alive = false;
  }

  // Void Singularity ability: gently curve the ball toward the nearest brick above it
  function steerToBrick(b, dt) {
    let best = null, bd = Infinity;
    for (const br of bricks) {
      if (!br.ready || br.def.solid || br.z > b.z) continue;
      const d = (br.x - b.x) * (br.x - b.x) + (br.z - b.z) * (br.z - b.z);
      if (d < bd) { bd = d; best = br; }
    }
    if (!best) return;
    const want = Math.atan2(best.x - b.x, -(best.z - b.z));
    const cur = Math.atan2(b.dx, -b.dz);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const a = cur + clamp(diff, -1.2 * dt, 1.2 * dt);
    b.dx = Math.sin(a);
    b.dz = -Math.cos(a);
    normalizeDir(b);
  }

  function updateBalls(dt) {
    const spd = currentSpeed();
    const plasma = game.timers.plasma > 0;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.px = b.x; b.pz = b.z;
      let moveSpeed = 0;
      if (b.ghost) {
        b.life -= dt;
        if (b.life <= 0) { derezBall(b); balls.splice(i, 1); continue; }
      }
      if (b.stuck) {
        b.x = paddle.x + b.offset;
        b.z = PADDLE_Z - PADDLE_HD - BALL_R - 0.05;
        if (b.caught && game.state === 'play') {
          b.holdT -= dt;
          if (b.holdT <= 0) { releaseBall(b); sfx.launch(); }
        }
      } else if (game.state === 'play') {
        let s = spd;
        if (loadout.pad === 'chrono' && b.dz > 0) s *= 1 - 0.45 * clamp((b.z - (PADDLE_Z - 7)) / 6, 0, 1);
        if (loadout.ball === 'void' && b.dz < 0) steerToBrick(b, dt);
        moveSpeed = s;
        const dist = s * dt;
        const steps = Math.max(1, Math.ceil(dist / 0.16));
        for (let st = 0; st < steps && b.alive && !b.stuck; st++) stepBall(b, dist / steps);
        if (!b.alive) {
          burst(b.x, BALL_R, Math.min(b.z, BOTTOM_Z), b.ghost ? COL.magenta : COL.red, 20, 6, 0.5, 0.7);
          scene.remove(b.model.group);
          balls.splice(i, 1);
          continue;
        }
        // trail
        let tc = b.model.trail;
        if (b.model.trail2 && Math.floor(time * 12) % 2) tc = b.model.trail2;
        if (plasma) tc = COL.orange;
        const seg = Math.hypot(b.x - b.px, b.z - b.pz);
        const n = Math.min(6, Math.ceil(seg / 0.2));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          emit(lerp(b.px, b.x, t), BALL_R, lerp(b.pz, b.z, t), 0, 0, 0, tc, plasma ? 0.75 : 0.6, b.ghost ? 0.18 : 0.26, 0, 0);
        }
      }
      b.model.group.position.set(b.x, BALL_R, b.z);
      b.model.update(dt, time, b.dx, b.dz, moveSpeed);
      b.aura.visible = plasma;
    }
    if (game.state === 'play' && !balls.some((b) => !b.ghost)) loseLife();
  }

  function speedCap() {
    return Math.min(15 + (game.level - 1) * 0.7, 21) + 7;
  }

  // ============================================================= power-ups
  function rollPowerup() {
    // no 1UP capsules in the attract demo or in Survival (only 2 spare balls, ever)
    const keys = Object.keys(PU).filter((k) => !(k === 'life' && (game.demo || game.mode === 'survival')));
    let total = 0;
    keys.forEach((k) => { total += PU[k].weight; });
    let r = Math.random() * total;
    for (const k of keys) {
      r -= PU[k].weight;
      if (r <= 0) return k;
    }
    return keys[0];
  }

  function spawnPowerup(x, z, type) {
    const a = puAssets[type];
    const group = new THREE.Group();
    const body = new THREE.Mesh(capsuleGeo, a.body);
    body.add(new THREE.Mesh(bandGeo, bandMat));
    const label = new THREE.Sprite(a.label);
    label.scale.set(0.95, 0.95, 1);
    label.position.y = 0.72;
    label.renderOrder = 20;
    const glow = new THREE.Sprite(a.glow);
    glow.scale.set(2.6, 2.6, 1);
    group.add(glow, body, label);
    group.position.set(x, 0.5, z);
    scene.add(group);
    powerups.push({ group, body, type, x, z, t: 0 });
  }

  function updatePowerups(dt) {
    const pull = loadout.pad === 'seraph';
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.t += dt;
      p.z += 5.5 * dt;
      if (pull && p.z > -6) p.x = damp(p.x, paddle.x, 1.3, dt);
      p.body.rotation.x += 5 * dt;
      p.group.position.set(p.x, 0.5 + Math.sin(p.t * 5) * 0.08, p.z);
      const caught = !paddle.hidden && Math.abs(p.x - paddle.x) < paddle.w / 2 + 0.6 && Math.abs(p.z - PADDLE_Z) < 0.75;
      if (caught || p.z > LOSE_Z + 1) {
        scene.remove(p.group);
        powerups.splice(i, 1);
        if (caught) applyPowerup(p.type);
      }
    }
  }

  function applyPowerup(type) {
    const def = PU[type];
    switch (type) {
      case 'multi': splitBalls(); break;
      case 'life':
        game.lives++;
        sfx.life();
        break;
      default: {
        const dur = def.dur * (loadout.pad === 'seraph' ? 1.5 : 1);
        game.timers[type] = dur;
        game.timerMax[type] = dur;
        if (type === 'wide') paddle.targetW = wideWidth();
        if (type === 'shield') ambient.shield.visible = true;
        break;
      }
    }
    if (type !== 'life') sfx.power();
    burst(paddle.x, 0.6, PADDLE_Z, def.color, 30, 6, 0.6, 0.7, 2);
    spawnRing(paddle.x, PADDLE_Z, def.color, 5, 0.5);
    if (!game.demo) {
      popup(def.name, paddle.x, PADDLE_Z - 1.2, 'pu');
      game.score += 100;
    }
  }

  function splitBalls() {
    const src = balls.filter((b) => !b.ghost);
    for (const b of src) {
      const bx = b.stuck ? 0 : b.dx, bz = b.stuck ? -1 : b.dz;
      for (const a of [-0.45, 0.45]) {
        if (balls.length >= MAX_BALLS) break;
        const nb = addBall(b.x, b.z, bx * Math.cos(a) - bz * Math.sin(a), bx * Math.sin(a) + bz * Math.cos(a), false);
        normalizeDir(nb);
      }
    }
    if (game.state === 'serve') launch();
  }

  function updateTimers(dt) {
    for (const k of TIMED) {
      if (game.timers[k] <= 0) continue;
      game.timers[k] -= dt;
      if (game.timers[k] <= 0) {
        game.timers[k] = 0;
        if (k === 'wide') paddle.targetW = baseWidth();
        if (k === 'shield') ambient.shield.visible = false;
      }
    }
  }

  function resetTimers() {
    TIMED.forEach((k) => { game.timers[k] = 0; });
    paddle.targetW = baseWidth();
    ambient.shield.visible = false;
  }

  // ================================================================= coins
  function spawnCoin(x, z, value) {
    if (game.demo) return;
    const m = MODELS.makeCoin();
    m.group.position.set(x, 0.7, z);
    scene.add(m.group);
    coins.push({ model: m, x, z, value, t: Math.random() * 3 });
  }

  function collectCoin(c) {
    const got = awardCoins(c.value * (loadout.ball === 'gyro' ? 2 : 1));
    popup('+' + got, c.x, PADDLE_Z - 1, 'coin');
    sfx.coin();
    burst(c.x, 0.7, PADDLE_Z, COL.gold, 12, 4, 0.4, 0.5, 1);
  }

  // coins earned while playing get the COIN FLOW skill bonus; returns what was actually paid out
  function awardCoins(v) {
    if (game.demo || v <= 0) return 0;
    const got = Math.round(v * P.perks.coinMult());
    game.runCoins += got;
    P.addCoins(got);
    return got;
  }

  function awardTokens(n) {
    if (game.demo || n <= 0) return 0;
    game.runTokens += n;
    P.addTokens(n);
    return n;
  }

  function updateCoins(dt) {
    const pull = loadout.pad === 'seraph';
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.t += dt;
      c.z += 6 * dt;
      if (pull && c.z > -6) c.x = damp(c.x, paddle.x, 1.4, dt);
      c.model.group.position.set(c.x, 0.75 + Math.sin(c.t * 6) * 0.1, c.z);
      c.model.spinner.rotation.y += dt * 5;
      const caught = !paddle.hidden && Math.abs(c.x - paddle.x) < paddle.w / 2 + 0.5 && Math.abs(c.z - PADDLE_Z) < 0.8;
      if (caught || c.z > LOSE_Z + 1) {
        scene.remove(c.model.group);
        coins.splice(i, 1);
        if (caught) collectCoin(c);
      }
    }
  }

  // ================================================================ lasers
  function fireLaser(x) {
    const mesh = new THREE.Mesh(laserGeo, laserMat);
    mesh.position.set(x, 0.7, PADDLE_Z - 0.8);
    scene.add(mesh);
    lasers.push({ mesh, x, z: PADDLE_Z - 0.8 });
    emit(x, 0.8, PADDLE_Z - 0.6, 0, 1, 0, COL.red, 1.2, 0.15, 0, 0);
  }

  function updateLasers(dt) {
    if (game.timers.laser > 0 && game.state === 'play') {
      game.laserCd -= dt;
      if (game.laserCd <= 0) {
        game.laserCd = 0.32;
        fireLaser(paddle.x - (paddle.w / 2 - 0.6));
        fireLaser(paddle.x + (paddle.w / 2 - 0.6));
        sfx.laser();
      }
    }
    const gridTop = ROW0_Z - CELL_D / 2;
    for (let i = lasers.length - 1; i >= 0; i--) {
      const L = lasers[i];
      let dead = false;
      for (let s = 0; s < 2 && !dead; s++) {
        L.z -= 36 * dt * 0.5;
        const tip = L.z - 0.55;
        if (tip < TOP_Z) { dead = true; break; }
        if (Math.abs(L.x - CHIN.x) < CHIN.hw && tip < CHIN.z + CHIN.hd) {
          if (sentinel.mode === 'boss') damageSentinel(0.34, L.x, CHIN.z + CHIN.hd);
          dead = true;
          break;
        }
        const row = Math.floor((tip - gridTop) / CELL_D);
        const col = Math.floor((L.x + HALF_W) / CELL_W);
        const br = cellAt(row, col);
        if (br && br.ready && Math.abs(L.x - br.x) < BRICK_HW && Math.abs(tip - br.z) < BRICK_HD) {
          hitBrick(br, 'laser');
          dead = true;
          break;
        }
        for (const d of drones) {
          if (d.alive && Math.abs(L.x - d.x) < DRONE_R && Math.abs(tip - d.z) < DRONE_R) { killDrone(d, true); dead = true; break; }
        }
      }
      if (dead) {
        burst(L.x, 0.7, L.z - 0.5, COL.red, 6, 4, 0.25, 0.5);
        scene.remove(L.mesh);
        lasers.splice(i, 1);
      } else {
        L.mesh.position.z = L.z;
      }
    }
  }

  // Tesla Coil ability
  function updateTesla(dt) {
    if (loadout.pad !== 'tesla' || game.state !== 'play') return;
    game.teslaT -= dt;
    if (game.teslaT > 0) return;
    game.teslaT = 5;
    const targets = bricks.filter((br) => br.ready && !br.def.solid);
    if (!targets.length) return;
    const br = pick(targets);
    lightning(paddle.x, PADDLE_Z - 0.4, br.x, br.z, 0xd9b0ff);
    flashLight(br.x, br.z, 0xb84dff, 4);
    sfx.zap();
    hitBrick(br, 'tesla');
  }

  // ================================================================ drones
  function spawnDrone() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const g = new THREE.Group();
    const core = new THREE.Mesh(droneCoreGeo, droneCoreMat);
    core.add(new THREE.LineSegments(droneCoreEdges, droneEdgeMat));
    const ring = new THREE.Mesh(droneRingGeo, droneRingMat);
    ring.rotation.x = Math.PI / 2;
    const eye = new THREE.Mesh(droneEyeGeo, droneEyeMat);
    eye.position.set(0, 0, 0.42);
    const glow = new THREE.Sprite(droneGlowMat);
    glow.scale.set(2.4, 2.4, 1);
    g.add(glow, core, ring, eye);
    const d = {
      g, core, ring, side, x: side * PORTAL_X, z: TOP_Z + 0.6, vx: 0, vz: 0,
      t: 0, state: 'enter', tx: 0, tz: 0, alive: true,
    };
    g.position.set(d.x, 1, d.z);
    scene.add(g);
    drones.push(d);
    const portal = ambient.portals[side < 0 ? 0 : 1];
    portal.flash = 1;
    burst(d.x, 1, d.z + 0.3, COL.lime, 20, 4, 0.5, 0.6);
    sfx.portal();
  }

  function pickDroneTarget(d) {
    let lowest = TOP_Z + 2;
    for (const br of bricks) if (br.z > lowest) lowest = br.z;
    const zMin = clamp(lowest + 1.8, -6, 5);
    d.tx = rand(-HALF_W + 1.5, HALF_W - 1.5);
    d.tz = rand(zMin, 7);
  }

  function killDrone(d, scored) {
    if (!d.alive) return;
    d.alive = false;
    scene.remove(d.g);
    burst(d.x, 1, d.z, COL.lime, 30, 8, 0.6, 0.8, 1);
    burst(d.x, 1, d.z, COL.cyan, 12, 5, 0.5, 0.6);
    spawnRing(d.x, d.z, COL.lime, 3.5, 0.45);
    spawnDebris(d.x, d.z, COL.lime, 4);
    sfx.drone();
    if (scored) {
      addScore(200, d.x, d.z);
      spawnCoin(d.x, d.z, 10);
    }
  }

  function updateDrones(dt) {
    const active = game.state === 'play' || game.state === 'serve';
    const survival = game.mode === 'survival';
    if (active && (survival ? game.waves >= 3 : game.level >= 2)) {
      game.droneT -= dt;
      if (game.droneT <= 0) {
        game.droneT = rand(8, 13);
        const maxDrones = Math.min(3, 1 + Math.floor(survival ? game.waves / 5 : game.level / 3));
        if (drones.length < maxDrones) spawnDrone();
      }
    }
    for (const d of drones) {
      if (!d.alive) continue;
      d.t += dt;
      if (d.state === 'enter') {
        d.z += 2.8 * dt;
        if (d.t > 0.9) { d.state = 'roam'; pickDroneTarget(d); }
      } else {
        if (d.state === 'roam' && d.t > 26) {
          d.state = 'leave';
          d.tx = d.side * PORTAL_X;
          d.tz = TOP_Z + 0.6;
        }
        const dx = d.tx - d.x, dz = d.tz - d.z;
        const dist = Math.hypot(dx, dz) || 1;
        if (dist < 0.5) {
          if (d.state === 'leave') {
            d.alive = false;
            scene.remove(d.g);
            burst(d.x, 1, d.z, COL.lime, 12, 3, 0.4, 0.5);
            continue;
          }
          pickDroneTarget(d);
        }
        const sp = 3.3;
        d.vx = damp(d.vx, (dx / dist) * sp, 2, dt);
        d.vz = damp(d.vz, (dz / dist) * sp, 2, dt);
        d.x = clamp(d.x + d.vx * dt, -HALF_W + DRONE_R, HALF_W - DRONE_R);
        d.z += d.vz * dt;
      }
      d.g.position.set(d.x, 1.05 + Math.sin(d.t * 3) * 0.15, d.z);
      d.core.rotation.y += dt * 2.2;
      d.ring.rotation.z += dt * 3;
      d.ring.rotation.y = Math.sin(d.t * 1.7) * 0.4;
      if (!paddle.hidden && Math.abs(d.x - paddle.x) < paddle.w / 2 + DRONE_R && Math.abs(d.z - PADDLE_Z) < PADDLE_HD + DRONE_R) {
        killDrone(d, true);
        addShake(0.25);
      }
    }
    for (let i = drones.length - 1; i >= 0; i--) if (!drones[i].alive) drones.splice(i, 1);
  }

  // ============================================================== Sentinel
  function setSentinelMode(mode, hp, name) {
    const s = sentinel;
    s.mode = mode;
    s.hp = s.maxHp = hp || 1;
    s.name = name || 'SENTINEL';
    s.flash = 0;
    s.charge = 0;
    s.charging = false;
    s.fireT = 3.5;
    s.tilt = 0;
  }

  function onSentinelHit(b) {
    if (sentinel.mode === 'boss') {
      damageSentinel(1, b.x, CHIN.z + CHIN.hd);
    } else {
      sentinel.flash = 1;
      sfx.solid();
      burst(b.x, 0.6, CHIN.z + CHIN.hd, COL.magenta, 6, 4, 0.3, 0.5);
    }
  }

  function damageSentinel(amount, x, z) {
    const s = sentinel;
    if (s.mode !== 'boss') return;
    s.hp -= amount;
    s.flash = 1;
    addShake(amount >= 1 ? 0.35 : 0.1);
    game.glitch = Math.max(game.glitch, amount >= 1 ? 0.3 : 0.1);
    sfx.bossHit();
    burst(x, 0.8, z, COL.red, amount >= 1 ? 26 : 8, 7, 0.5, 0.7, 1);
    hypeEvent(amount >= 1 ? 0.25 : 0.08, COL.red, x, z);
    addScore(amount >= 1 ? 250 : 60, x, z + 0.8);
    if (s.hp <= 0) bossDown();
  }

  function fireBolts() {
    const s = sentinel;
    const ox = 0, oz = CHIN.z + CHIN.hd + 0.5;
    const base = Math.atan2(paddle.x - ox, PADDLE_Z - oz);
    const spread = s.hp / s.maxHp < 0.5 ? [-0.28, 0, 0.28] : [0];
    const speed = 10 + game.level * 0.25;
    for (const a of spread) {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      const glow = new THREE.Sprite(boltGlowMat);
      glow.scale.set(2.2, 2.2, 1);
      mesh.add(glow);
      mesh.position.set(ox, 0.6, oz);
      scene.add(mesh);
      bolts.push({ mesh, x: ox, z: oz, dx: Math.sin(base + a) * speed, dz: Math.cos(base + a) * speed });
    }
    burst(ox, 0.8, oz, COL.red, 16, 5, 0.4, 0.7);
    sfx.bolt();
  }

  function updateBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.dx * dt;
      b.z += b.dz * dt;
      b.mesh.position.set(b.x, 0.6, b.z);
      emit(b.x, 0.6, b.z, 0, 0, 0, COL.red, 0.8, 0.25, 0, 0);
      let dead = b.z > LOSE_Z + 1 || Math.abs(b.x) > HALF_W;
      if (!dead && !paddle.hidden && Math.abs(b.x - paddle.x) < paddle.w / 2 + 0.3 && Math.abs(b.z - PADDLE_Z) < PADDLE_HD + 0.3) {
        dead = true;
        paddle.stun = 1.2;
        game.chain = 0;
        addShake(0.5);
        game.glitch = Math.max(game.glitch, 0.6);
        sfx.stun();
        burst(b.x, 0.6, b.z, COL.red, 30, 8, 0.5, 0.8, 1);
        if (!game.demo) popup('SYSTEM JAMMED', paddle.x, PADDLE_Z - 1.5, 'big');
      }
      if (dead) {
        scene.remove(b.mesh);
        bolts.splice(i, 1);
      }
    }
  }

  const WHITE = new THREE.Color(0xffffff);
  const MAW_HOT = new THREE.Color(0xff5a20);

  function updateSentinel(dt) {
    const s = sentinel;
    s.flash = Math.max(0, s.flash - dt * 4);
    const boss = s.mode === 'boss', dead = s.mode === 'dead';
    s.halo1.rotation.z += dt * (boss ? 1.4 : 0.3);
    s.halo2.rotation.z -= dt * (boss ? 0.9 : 0.2);

    const lead = balls[0];
    const tx = lead ? clamp(lead.x / HALF_W, -1, 1) * 0.2 : 0;
    s.eyes.position.x = damp(s.eyes.position.x, tx, 6, dt);

    if (boss && game.state === 'play') {
      s.fireT -= dt;
      if (s.fireT < 0.7) {
        if (!s.charging) { s.charging = true; sfx.charge(); }
        s.charge = 1 - s.fireT / 0.7;
      }
      if (s.fireT <= 0) {
        fireBolts();
        s.charging = false;
        s.charge = 0;
        s.fireT = s.hp / s.maxHp < 0.5 ? rand(1.7, 2.4) : rand(2.6, 3.4);
      }
    } else {
      s.charge = damp(s.charge, 0, 5, dt);
      s.charging = false;
    }

    const eyeBase = dead ? 0x1a1a24 : boss ? COL.red : COL.cyan;
    tmpColor.setHex(eyeBase).lerp(WHITE, s.flash);
    s.eyeMat.color.copy(tmpColor);
    s.eyeGlowMat.color.copy(tmpColor);
    s.eyeGlowMat.opacity = dead ? 0 : boss ? 1 : 0.55;
    s.mawMat.color.setHex(0x220008).lerp(MAW_HOT, boss ? 0.15 + s.charge * 0.85 : 0);
    s.haloMat.color.setHex(dead ? 0x1a1024 : boss ? COL.red : COL.violet);
    s.chinStripMat.color.setHex(boss ? COL.red : COL.magenta).lerp(WHITE, s.flash * 0.8);
    s.light.intensity = boss ? 1.2 + s.charge * 2 + s.flash * 2 : 0;
    s.tilt = damp(s.tilt, dead ? 0.35 : 0, 3, dt);
    s.face.position.x = s.flash > 0 ? (Math.random() - 0.5) * 0.15 * s.flash : 0;
    if (s.charge > 0.2) emit(rand(-0.6, 0.6), 1.2, CHIN.z + 1, rand(-0.5, 0.5), rand(0, 1), rand(0, 1), COL.red, 0.6, 0.3, 1, 0);
    if (dead && Math.random() < dt * 8) {
      emit(rand(-1.5, 1.5), rand(1.5, 3), TOP_Z - 0.2, 0, rand(1, 2), 0, pick([COL.orange, 0x554466]), rand(0.6, 1.2), 1, 0.5, 0);
    }
  }

  function bossDown() {
    sentinel.mode = 'dead';
    sentinel.hp = 0;
    setState('bossdown');
    game.boomT = 0;
    game.bigBoom = false;
    clearBalls();
    bolts.forEach((b) => scene.remove(b.mesh));
    bolts.length = 0;
    addShake(0.8);
    game.glitch = 1;
    sfx.explode();
    hypeEvent(1, COL.gold, 0, CHIN.z);
  }

  // ================================================================= score
  function addScore(base, x, z) {
    const mult = Math.min(8, 1 + Math.floor(game.chain / 4));
    const pts = Math.round(base * mult * (loadout.ball === 'pixel' ? 1.5 : 1));
    if (game.demo) return;
    game.score += pts;
    popup('+' + pts, x, z, mult > 1 ? 'hot' : '');
    if (game.score >= game.nextLifeAt) {
      game.nextLifeAt += 30000;
      game.lives++;
      sfx.life();
      popup('1UP', paddle.x, PADDLE_Z - 2, 'pu');
    }
  }

  // ================================================================== FX
  function addShake(v) { game.shake = Math.min(1.2, Math.max(game.shake, (v * settings.shake) / 100)); }

  function flashLight(x, z, color, intensity) {
    fxLight.color.setHex(color);
    fxLight.position.set(x, 2, z);
    fxLight.intensity = intensity;
  }

  // ================================================================= flow
  function clearLevelObjects() {
    bricks.forEach((br) => { scene.remove(br.mesh); br.mat.dispose(); });
    bricks.length = 0;
    grid = [];
    balls.forEach((b) => scene.remove(b.model.group));
    balls.length = 0;
    powerups.forEach((p) => scene.remove(p.group));
    powerups.length = 0;
    coins.forEach((c) => scene.remove(c.model.group));
    coins.length = 0;
    lasers.forEach((l) => scene.remove(l.mesh));
    lasers.length = 0;
    bolts.forEach((b) => scene.remove(b.mesh));
    bolts.length = 0;
    drones.forEach((d) => scene.remove(d.g));
    drones.length = 0;
    pending.length = 0;
  }

  function loadLevel(n) {
    game.level = n;
    clearLevelObjects();
    const def = levelDef(n);
    game.levelDef = def;
    buildBricks(def.map);
    setSentinelMode(def.boss ? 'boss' : 'dormant', def.boss ? 10 + Math.floor(n / 3) * 3 : 1, def.name);
    game.speed = Math.min(15 + (n - 1) * 0.7, 21);
    game.chain = 0;
    game.levelT = 0;
    game.droneT = rand(6, 10);
    game.teslaT = 5;
    resetTimers();
    paddle.stun = 0;
    paddle.hidden = false;
    paddle.appear = 0;
    spawnServeBall();
    setState('intro');
    audio.setBoss(!!def.boss);
    if (!game.demo) {
      showBanner('SECTOR ' + pad(n, 2), def.name,
        def.boss ? 'WARNING // HOSTILE CORE ONLINE' : 'BREACH THE FIREWALL', def.boss);
      sfx.start();
    }
  }

  // ============================================================= survival
  // One ball + two spares, no extra lives, and the firewall creeps down one
  // row every few seconds. Clear the wall and three fresh rows slam in.
  const BREACH_Z = PADDLE_Z - 2.4;

  function survivalRow(diff) {
    const basics = ['p', 'g', 'c'];
    const base = pick(basics), alt = pick(basics);
    const armor = Math.min(0.4, 0.08 + diff * 0.015);
    const half = [];
    for (let c = 0; c < 7; c++) {
      const v = Math.random();
      let ch = c % 2 ? alt : base;
      if (v < 0.2) ch = '.';
      else if (v < 0.2 + armor) ch = Math.random() < 0.6 ? 'w' : 's';
      else if (v < 0.26 + armor) ch = 'x';
      else if (v < 0.29 + armor) ch = '$';
      half.push(ch);
    }
    return half.join('') + half.slice(0, 6).reverse().join('');
  }

  // push the whole wall down one row and add a fresh row on top
  function addSurvivalRow(delay) {
    grid.unshift(new Array(COLS).fill(null));
    for (const br of bricks) {
      br.row++;
      br.z = ROW0_Z + br.row * CELL_D;
    }
    const line = survivalRow(game.waves);
    for (let col = 0; col < COLS; col++) {
      if (BRICKS[line[col]]) createBrick(line[col], 0, col, delay + Math.abs(col - 6) * 0.03);
    }
    while (grid.length && grid[grid.length - 1].every((c) => !c)) grid.pop();
  }

  function lowestBrickEdge() {
    let z = -Infinity;
    for (const br of bricks) if (br.z > z) z = br.z;
    return z + BRICK_HD;
  }

  function loadSurvival() {
    game.level = 1;
    clearLevelObjects();
    game.levelDef = { name: 'SURVIVAL', boss: false, map: [] };
    game.remaining = 0;
    game.waves = 0;
    for (let i = 0; i < 6; i++) addSurvivalRow((5 - i) * 0.06);
    setSentinelMode('dormant', 1, 'SURVIVAL');
    game.speed = 15;
    game.chain = 0;
    game.levelT = 0;
    game.droneT = rand(10, 14);
    game.teslaT = 5;
    game.creepMax = 14;
    game.creepT = game.creepMax;
    game.survTime = 0;
    resetTimers();
    paddle.stun = 0;
    paddle.hidden = false;
    paddle.appear = 0;
    spawnServeBall();
    setState('intro');
    audio.setBoss(false);
    showBanner('SURVIVAL', 'HOLD THE LINE', '1 BALL + 2 SPARES  //  NO EXTRA LIVES', true);
    sfx.start();
  }

  function creep() {
    game.waves++;
    game.creepMax = Math.max(6, 14 - game.waves * 0.35);
    game.creepT = game.creepMax;
    addSurvivalRow(game.levelT);
    game.speed = Math.min(game.speed + 0.12, 26);
    sfx.advance();
    addShake(0.3);
    ambient.strips.top.userData.flash = 1;
    ambient.strips.left.userData.flash = ambient.strips.right.userData.flash = 1;
    awardCoins(2);
    const edge = lowestBrickEdge();
    if (edge > BREACH_Z) { breach(); return; }
    if (edge > BREACH_Z - CELL_D * 2.5) {
      popup('FIREWALL CLOSING IN', 0, PADDLE_Z - 4, 'big');
      sfx.error();
    }
  }

  function breach() {
    for (let i = 0; i < 6; i++) burst(rand(-HALF_W, HALF_W), 0.6, BREACH_Z, pick([COL.red, COL.orange, COL.magenta]), 25, 9, 0.8, 1, 2);
    spawnRing(paddle.x, PADDLE_Z, COL.red, 12, 0.8);
    flashLight(paddle.x, PADDLE_Z, COL.red, 8);
    addShake(1.2);
    game.glitch = 1;
    sfx.explode();
    sfx.lose();
    clearBalls();
    powerups.forEach((p) => scene.remove(p.group));
    powerups.length = 0;
    paddle.hidden = true;
    game.lives = 0;
    gameOver('breach');
  }

  function waveCleared() {
    const bonus = 1500 + game.waves * 100;
    game.score += bonus;
    awardCoins(15);
    showBanner('SURVIVAL', 'WAVE CLEARED', 'BONUS +' + bonus + '   //   +15 COINS');
    sfx.clear();
    ambient.sigilEnergy = 1;
    for (let i = 0; i < 3; i++) addSurvivalRow(game.levelT + (2 - i) * 0.08);
    game.creepT = game.creepMax;
  }

  function levelClear() {
    const boss = !!game.levelDef.boss;
    const bonus = 1000 + 250 * game.level + (boss ? 5000 : 0);
    const coinBonus = 25 + 5 * game.level + (boss ? 150 : 0);
    // falling coins are swept up automatically at the end of a sector
    coins.forEach((c) => { awardCoins(c.value * (loadout.ball === 'gyro' ? 2 : 1)); scene.remove(c.model.group); });
    coins.length = 0;
    if (!game.demo) {
      game.score += bonus;
      const gotCoins = awardCoins(coinBonus);
      showBanner('SECTOR ' + pad(game.level, 2), boss ? 'CORE DESTROYED' : 'SECTOR CLEARED',
        'BONUS +' + bonus + '   //   +' + gotCoins + ' COINS');
      sfx.clear();
    }
    clearBalls();
    powerups.forEach((p) => scene.remove(p.group));
    powerups.length = 0;
    lasers.forEach((l) => scene.remove(l.mesh));
    lasers.length = 0;
    drones.forEach((d) => killDrone(d, false));
    drones.length = 0;
    resetTimers();
    ambient.sigilEnergy = 1;
    setState('clear');
  }

  function loseLife() {
    burst(paddle.x, 0.5, PADDLE_Z, padModel.thruster, 50, 10, 0.8, 0.9, 2);
    burst(paddle.x, 0.5, PADDLE_Z, COL.magenta, 30, 8, 0.7, 0.8, 1);
    spawnDebris(paddle.x, PADDLE_Z, padModel.thruster, 8);
    spawnRing(paddle.x, PADDLE_Z, COL.red, 6, 0.6);
    addShake(0.9);
    game.glitch = 1;
    clearBalls();
    powerups.forEach((p) => scene.remove(p.group));
    powerups.length = 0;
    resetTimers();
    game.chain = 0;
    if (game.demo) {
      spawnServeBall();
      setState('serve');
      return;
    }
    sfx.lose();
    paddle.hidden = true;
    game.lives--;
    if (game.lives <= 0) gameOver();
    else setState('lost');
  }

  function gameOver(reason) {
    setState('over');
    game.overShown = false;
    const survival = game.mode === 'survival';
    const prev = readHi(game.mode);
    const isHi = game.score > 0 && game.score > prev;
    if (isHi) store.set(HI_KEYS[game.mode], String(game.score));
    game.hi = Math.max(prev, game.score);
    $('over-kicker').textContent = reason === 'breach' ? '// FIREWALL BREACHED //' : '// CONNECTION TERMINATED //';
    $('final-l1').textContent = 'SCORE';
    $('final-score').textContent = game.score.toLocaleString('en-US');
    $('final-l2').textContent = survival ? 'SURVIVED' : 'SECTOR';
    $('final-level').textContent = survival ? mmss(game.survTime) : pad(game.level, 2);
    $('final-coins').textContent = '+' + game.runCoins.toLocaleString('en-US');
    $('final-tokens-wrap').classList.add('hidden');
    $('new-hi').textContent = 'NEW HI-SCORE';
    $('new-hi').classList.toggle('hidden', !isHi);
    document.body.classList.remove('playing');
  }

  // called by js/funky.js when the numbered wall reaches the line
  function finishFunky(stats) {
    setState('over');
    game.overShown = false;
    $('over-kicker').textContent = '// WALL BREACH  ·  LEVEL ' + (stats.level || 1) + ' //';
    $('final-l1').textContent = 'TURN';
    $('final-score').textContent = String(stats.turn);
    $('final-l2').textContent = 'BEST';
    $('final-level').textContent = String(stats.best);
    $('final-coins').textContent = '+' + game.runCoins.toLocaleString('en-US');
    $('final-tokens').textContent = '+' + game.runTokens;
    $('final-tokens-wrap').classList.remove('hidden');
    $('new-hi').textContent = 'NEW BEST TURN';
    $('new-hi').classList.toggle('hidden', !stats.isBest);
    document.body.classList.remove('playing');
  }

  // modes that run their own simulation on this arena (js/funky.js, js/rpg-kampf.js, js/bubbles.js)
  const EXT = { funky: () => NEON.funky, marble: () => NEON.marble, bubble: () => NEON.bubble };
  const EXT_LABEL = { funky: 'FUNKY', marble: 'RPG', bubble: 'BUBBLES' };
  let extOpts = null;

  function stopExtModes() {
    Object.keys(EXT).forEach((k) => { if (EXT[k]()) EXT[k]().stop(); });
  }

  function startGame(mode) {
    mode = typeof mode === 'string' ? mode : game.mode || 'classic';
    if (EXT[mode] && !EXT[mode]()) mode = 'classic';
    audio.init();
    stopExtModes();
    resetHype();
    game.mode = mode;
    document.body.dataset.mode = mode;
    refreshLoadout();
    game.demo = false;
    game.paused = false;
    game.score = 0;
    game.lives = 3;
    game.nextLifeAt = mode === 'classic' ? 30000 : Infinity;
    game.runCoins = 0;
    game.runTokens = 0;
    game.padHits = 0;
    game.novaCount = 0;
    game.hi = readHi(mode);
    paddle.x = paddle.target = 0;
    Object.assign(hud, { score: -1, hi: -1, lives: -1, level: -1, mult: -1, boss: '' });
    hideScreens();
    $('screen-modes').classList.add('hidden');
    menuOpen = false;
    document.body.classList.add('playing');
    $('hud').classList.toggle('survival', mode === 'survival');
    if (EXT[mode]) {
      $('hud').classList.add('hidden');
      clearLevelObjects();
      setSentinelMode('dormant', 1, EXT_LABEL[mode]);
      resetTimers();
      paddle.hidden = true;
      padModel.group.visible = false;
      ambient.chronoZone.visible = false;
      audio.setBoss(false);
      setState(mode);
      EXT[mode]().start(extOpts);
      extOpts = null;
      requestLock();
      return;
    }
    $('hud').classList.remove('hidden');
    if (mode === 'survival') loadSurvival();
    else loadLevel(DEBUG.level);
    requestLock();
  }

  function goTitle() {
    // quitting an RPG battle goes back to the RPG hub, a bubble level back to the level map
    const from = game.demo ? null : game.mode;
    resetToDemo();
    if (from === 'marble' && NEON.rpg) NEON.rpg.open();
    else if (from === 'bubble' && NEON.bubble) NEON.bubble.openMap();
    else showTitle();
  }

  // back to the attract-mode demo behind the menus
  function resetHype() {
    hype.fever = hype.meter = hype.combo = 0;
    hype.comboT = 0;
    document.body.classList.remove('fever');
  }

  function resetToDemo() {
    if (!game.demo && HI_KEYS[game.mode] && game.hi > readHi(game.mode)) store.set(HI_KEYS[game.mode], String(game.hi));
    stopExtModes();
    resetHype();
    game.mode = 'classic';
    document.body.dataset.mode = 'demo';
    game.demo = true;
    game.paused = false;
    game.hi = readHi('classic');
    audio.duck(false);
    hideScreens();
    $('hud').classList.add('hidden');
    $('hud').classList.remove('survival');
    document.body.classList.remove('playing');
    refreshLoadout();
    loadLevel(1);
  }

  function showTitle() {
    menuOpen = false;
    $('screen-title').classList.remove('hidden');
    $('title-hi').textContent = readHi('classic').toLocaleString('en-US');
    [['ball', 'title-ball'], ['pad', 'title-pad'], ['gun', 'title-gun']].forEach(([kind, id]) => {
      const it = P.equipped(kind);
      $(id).textContent = it.name;
      $(id).style.color = P.RARITY[it.rarity].color;
    });
  }

  function openModes() {
    audio.init();
    $('screen-title').classList.add('hidden');
    $('screen-modes').classList.remove('hidden');
    menuOpen = true;
    $('best-classic').textContent = readHi('classic').toLocaleString('en-US');
    $('best-survival').textContent = readHi('survival').toLocaleString('en-US');
    $('best-funky').textContent = NEON.funky ? NEON.funky.best() : 0;
    $('best-rpg').textContent = NEON.rpg ? NEON.rpg.stageLabel() : '1-1';
    $('best-bubble').textContent = (NEON.bubble ? NEON.bubble.best() : 0) + ' ★';
    const gun = P.equipped('gun');
    $('mode-gun').textContent = gun.name;
    $('mode-gun').style.color = P.RARITY[gun.rarity].color;
  }

  function closeModes() {
    $('screen-modes').classList.add('hidden');
    showTitle();
  }

  function hideScreens() {
    ['screen-title', 'screen-pause', 'screen-over'].forEach((id) => $(id).classList.add('hidden'));
  }

  function setPaused(p) {
    if (game.demo || game.state === 'over' || game.paused === p) return;
    game.paused = p;
    if (p) $('hint').classList.remove('on');
    $('screen-pause').classList.toggle('hidden', !p);
    document.body.classList.toggle('playing', !p);
    audio.duck(p);
    if (!p) requestLock();   // resuming is a click/key press, so the cursor can be captured again
  }

  // swap in freshly equipped gear (called from the collection screen)
  function refreshLoadout() {
    loadout.ball = P.equippedId('ball');
    loadout.pad = P.equippedId('pad');
    buildPadModel();
    rebuildBallModels();
    paddle.targetW = game.timers.wide > 0 ? wideWidth() : baseWidth();
    paddle.w = paddle.targetW;
    padModel.layout(paddle.w);
    ambient.chronoZone.visible = loadout.pad === 'chrono';
  }

  // ================================================================== HUD
  const hud = { score: -1, hi: -1, lives: -1, level: -1, mult: -1, boss: '' };
  const chipEls = {};
  let hintText = '';

  function syncWallets() {
    const v = P.coins.toLocaleString('en-US');
    document.querySelectorAll('.coins-val').forEach((el) => { el.textContent = v; });
    const t = P.tokens.toLocaleString('en-US');
    document.querySelectorAll('.tokens-val').forEach((el) => { el.textContent = t; });
    $('hud-coins').textContent = v;
  }
  P.onChange(syncWallets);

  // "?" button (bottom-right) — controls, power-ups and currencies live here to keep the menus clean
  function openHelp() {
    audio.init();
    $('screen-help').classList.remove('hidden');
    sfx.click();
  }
  function closeHelp() { $('screen-help').classList.add('hidden'); }
  $('help-btn').addEventListener('click', openHelp);
  $('help-close').addEventListener('click', closeHelp);
  $('screen-help').addEventListener('click', (e) => { if (e.target.id === 'screen-help') closeHelp(); });
  // capture phase, so Escape closes the help overlay without also closing the menu underneath
  window.addEventListener('keydown', (e) => {
    if ($('screen-help').classList.contains('hidden')) return;
    if (e.key === 'Escape' || e.key === '?' || e.key === ' ' || e.key === 'Enter') closeHelp();
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  function updateHud() {
    const caught = balls.some((b) => b.caught);
    const hintOn = !game.demo && !game.paused && (game.state === 'serve' || (game.state === 'play' && caught));
    $('hint').classList.toggle('on', hintOn);
    const text = (document.body.classList.contains('touch') ? 'TAP' : 'CLICK  /  SPACE') + (caught ? ' TO RELEASE' : ' TO LAUNCH');
    if (hintOn && text !== hintText) { hintText = text; $('hint').textContent = text; }
    if (game.demo) {
      for (const k in chipEls) { chipEls[k].div.remove(); delete chipEls[k]; }
      return;
    }
    if (game.score > game.hi) game.hi = game.score;
    if (hud.score !== game.score) { hud.score = game.score; $('score').textContent = pad(game.score, 7); }
    if (hud.hi !== game.hi) { hud.hi = game.hi; $('hiscore').textContent = pad(game.hi, 7); }
    if (hud.lives !== game.lives) {
      hud.lives = game.lives;
      // survival shows the spare balls left in the magazine (the one in play isn't counted)
      const n = game.mode === 'survival' ? game.lives - 1 : game.lives;
      $('lives').innerHTML = game.mode === 'survival' && n <= 0 ? '<b>LAST BALL</b>' : '<i></i>'.repeat(clamp(n, 0, 8));
    }
    if (game.mode === 'survival') {
      const t = mmss(game.survTime);
      if (hud.level !== t) {
        hud.level = t;
        $('sector').textContent = 'SURVIVAL // WAVE ' + (game.waves + 1);
        $('sector-name').textContent = t;
        $('boss').classList.remove('hidden');
        $('boss-name').textContent = 'FIREWALL DESCENT';
      }
      $('boss-fill').style.width = clamp(game.creepT / game.creepMax, 0, 1) * 100 + '%';
      $('boss-hp-text').textContent = Math.ceil(game.creepT) + 's';
    } else if (hud.level !== game.level) {
      hud.level = game.level;
      $('sector').textContent = 'SECTOR ' + pad(game.level, 2);
      $('sector-name').textContent = game.levelDef.name;
      $('boss').classList.toggle('hidden', !game.levelDef.boss);
      $('boss-name').textContent = game.levelDef.name;
    }
    const mult = Math.min(8, 1 + Math.floor(game.chain / 4));
    if (hud.mult !== mult) {
      hud.mult = mult;
      const el = $('chain');
      el.textContent = 'CHAIN ×' + mult;
      el.classList.toggle('on', mult > 1);
    }
    if (game.levelDef.boss) {
      const s = sentinel;
      const key = s.hp.toFixed(2);
      if (hud.boss !== key) {
        hud.boss = key;
        $('boss-fill').style.width = (Math.max(0, s.hp) / s.maxHp) * 100 + '%';
        $('boss-hp-text').textContent = s.mode === 'dead' ? '// OFFLINE' : '';
      }
    }
    for (const k of TIMED) {
      const t = game.timers[k];
      let el = chipEls[k];
      if (t > 0) {
        if (!el) {
          const def = PU[k];
          const div = document.createElement('div');
          div.className = 'chip';
          div.style.setProperty('--c', css(def.color));
          div.innerHTML = `<div class="k">${def.key}</div><div><div class="t">${def.name}</div><div class="bar"></div></div>`;
          $('powerups').appendChild(div);
          el = chipEls[k] = { div, bar: div.querySelector('.bar') };
        }
        el.bar.style.width = clamp(t / game.timerMax[k], 0, 1) * 100 + '%';
      } else if (el) {
        el.div.remove();
        delete chipEls[k];
      }
    }
  }

  const popLayer = $('popups');
  const projV = new THREE.Vector3();
  const NUMBER_POPUP = /^[-+]?[\d,]+$/;
  function popup(text, x, z, cls) {
    if (popLayer.childElementCount > 24) return;
    if (!settings.popups && NUMBER_POPUP.test(text)) return;   // damage numbers switched off
    projV.set(x, 1.2, z).project(camera);
    const el = document.createElement('div');
    el.className = 'popup' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = ((projV.x + 1) / 2) * window.innerWidth + 'px';
    el.style.top = ((1 - projV.y) / 2) * window.innerHeight + 'px';
    popLayer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  let bannerTimer = 0;
  function showBanner(top, main, sub, danger) {
    const b = $('banner');
    $('banner-top').textContent = top;
    $('banner-main').textContent = main;
    $('banner-sub').textContent = sub || '';
    b.classList.toggle('danger', !!danger);
    b.classList.remove('show');
    void b.offsetWidth;   // restart the CSS animation
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), 2500);
  }

  // ================================================================ input
  const input = { left: false, right: false, mode: 'pointer', ndcX: null, ndcY: 0.5 };
  const raycaster = new THREE.Raycaster();
  const paddlePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PADDLE_Z);
  const pickV = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  function pointerWorldX() {
    ndc.set(input.ndcX, input.ndcY);
    raycaster.setFromCamera(ndc, refCam);
    return raycaster.ray.intersectPlane(paddlePlane, pickV) ? pickV.x : paddle.target;
  }

  // --------------------------------------------- fullscreen + captured cursor
  // CURSOR OFF: while a game runs, the mouse is captured (Pointer Lock) and steers a
  // neon crosshair that can never leave the screen. ESC releases it and pauses.
  const cursor = { off: store.get('neonSigil.cursorOff', '0') === '1', x: window.innerWidth / 2, y: window.innerHeight / 2, lostAt: -1 };
  const isLocked = () => document.pointerLockElement === renderer.domElement;
  const wantLock = () => cursor.off && !game.demo && !game.paused && document.body.classList.contains('playing');

  function setAim(x, y) {
    cursor.x = clamp(x, 0, window.innerWidth - 1);
    cursor.y = clamp(y, 0, window.innerHeight - 1);
    input.ndcX = (cursor.x / window.innerWidth) * 2 - 1;
    input.ndcY = -(cursor.y / window.innerHeight) * 2 + 1;
    input.mode = 'pointer';
    $('vcursor').style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
  }

  function requestLock() {
    // a finger has no cursor to capture
    if (!wantLock() || isLocked() || document.body.classList.contains('touch')) return;
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* not allowed right now — the next click on the arena tries again */ }
  }

  document.addEventListener('pointerlockchange', () => {
    const on = isLocked();
    document.body.classList.toggle('cursor-locked', on);
    if (on) setAim(cursor.x, cursor.y);
    else if (wantLock()) { cursor.lostAt = performance.now(); setPaused(true); }   // ESC while captured
  });

  function sysToast(text) {
    const el = $('sys-toast');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function renderSysBar() {
    $('btn-fullscreen').classList.toggle('on', !!document.fullscreenElement);
    $('btn-fullscreen').title = document.fullscreenElement ? 'Leave fullscreen' : 'Fullscreen';
    $('btn-cursor').classList.toggle('on', cursor.off);
    $('btn-cursor').title = cursor.off ? 'Cursor OFF: the mouse is captured while you play (click to turn the cursor back on)' : 'Cursor ON (click to capture the mouse while you play)';
  }

  $('btn-fullscreen').addEventListener('click', () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => sysToast('FULLSCREEN NOT AVAILABLE'));
    } catch (err) { sysToast('FULLSCREEN NOT AVAILABLE'); }
    sfx.click();
  });
  document.addEventListener('fullscreenchange', renderSysBar);
  $('btn-cursor').addEventListener('click', () => {
    cursor.off = !cursor.off;
    store.set('neonSigil.cursorOff', cursor.off ? '1' : '0');
    if (!cursor.off && isLocked()) document.exitPointerLock();
    sysToast(cursor.off ? 'CURSOR OFF — CLICK THE ARENA TO CAPTURE THE MOUSE · ESC RELEASES IT' : 'CURSOR ON');
    sfx.click();
    renderSysBar();
    requestLock();
  });
  renderSysBar();

  function onPointer(e) {
    if (isLocked()) { setAim(cursor.x + (e.movementX || 0), cursor.y + (e.movementY || 0)); return; }
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    input.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    input.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    input.mode = 'pointer';
  }
  window.addEventListener('pointermove', onPointer);
  // any click anywhere (menus included) may unlock audio;
  // phones only allow it once the finger lifts, so try again on the way up
  window.addEventListener('pointerdown', () => audio.init(), true);
  window.addEventListener('pointerup', () => audio.init(), true);
  window.addEventListener('touchend', () => audio.init(), true);
  // the running Funky Balls / RPG battle module, if one owns the arena right now
  const extMode = () => (!game.demo && EXT[game.mode] ? EXT[game.mode]() : null);
  const funkyActive = () => !!extMode();

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (isLocked()) {
      // captured cursor: HUD buttons under the crosshair still work
      const el = document.elementFromPoint(cursor.x, cursor.y);
      const btn = el && el !== renderer.domElement && el.closest && el.closest('button');
      if (btn) { btn.click(); return; }
    } else {
      onPointer(e);
      requestLock();
    }
    if (game.paused) { setPaused(false); return; }
    if (funkyActive()) { extMode().pointerDown(e); return; }
    if (!game.demo && (game.state === 'serve' || balls.some((b) => b.caught))) launch();
  });
  window.addEventListener('pointerup', (e) => { if (funkyActive()) extMode().pointerUp(e); });

  window.addEventListener('keydown', (e) => {
    audio.init();
    const k = e.key;
    // let a focused menu button handle its own Enter/Space activation
    if ((k === ' ' || k === 'Enter') && e.target instanceof HTMLButtonElement) return;
    const titleOpen = !$('screen-title').classList.contains('hidden');
    const overOpen = !$('screen-over').classList.contains('hidden');
    if (!$('screen-modes').classList.contains('hidden')) {
      if (k === '1') startGame('classic');
      else if (k === '2') startGame('survival');
      else if (k === '3') startGame('funky');
      else if (k === '4' && NEON.rpg) NEON.rpg.open();
      else if (k === '5' && NEON.bubble) NEON.bubble.openMap();
      else if (k === 'Escape') closeModes();
      return;
    }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { input.left = true; input.mode = 'keys'; }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { input.right = true; input.mode = 'keys'; }
    else if (k === ' ' || k === 'Enter') {
      if (menuOpen) return;
      e.preventDefault();
      if (titleOpen) openModes();
      else if (overOpen) startGame(game.mode);
      else if (game.paused) setPaused(false);
      else if (funkyActive()) extMode().fire();
      else if (!game.demo && (game.state === 'serve' || balls.some((b) => b.caught))) launch();
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      // the ESC that released a captured cursor already paused the game
      if (k === 'Escape' && performance.now() - cursor.lostAt < 400) return;
      setPaused(!game.paused);
    } else if (k === 'm' || k === 'M') {
      $('mute-ind').classList.toggle('hidden', !audio.toggleMute());
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.left = false;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.right = false;
  });
  window.addEventListener('blur', () => {
    input.left = input.right = false;
    if (!game.demo && game.state !== 'over') setPaused(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !game.demo && game.state !== 'over') setPaused(true);
  });

  // pause button in the system bar: the P / ESC key for touch screens
  $('btn-pause').addEventListener('click', () => {
    if (game.demo || game.state === 'over') return;
    setPaused(true);
    sfx.click();
  });
  $('btn-start').addEventListener('click', openModes);
  $('modes-back').addEventListener('click', closeModes);
  document.querySelectorAll('#screen-modes .mode-card').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.mode === 'rpg') { if (NEON.rpg) NEON.rpg.open(); return; }
      if (b.dataset.mode === 'bubble') { if (NEON.bubble) NEON.bubble.openMap(); return; }
      startGame(b.dataset.mode);
    });
  });
  $('screen-pause').addEventListener('click', (e) => { if (e.target.id !== 'btn-quit' && e.target.id !== 'btn-pause-settings') setPaused(false); });
  $('btn-quit').addEventListener('click', goTitle);
  $('btn-retry').addEventListener('click', () => startGame(game.mode));
  $('btn-menu').addEventListener('click', goTitle);
  $('mute-ind').classList.toggle('hidden', !audio.muted);

  // ============================================================== paddle
  function autopilot() {
    let best = null, bestT = Infinity;
    for (const b of balls) {
      if (b.stuck || b.dz <= 0) continue;
      const t = (PADDLE_Z - b.z) / b.dz;
      if (t < bestT) { bestT = t; best = b; }
    }
    if (!best) best = balls.find((b) => !b.stuck) || null;
    let tx = 0;
    if (best) {
      if (best.dz > 0) {
        // fold the straight-line prediction back into the arena to account for wall bounces
        const L = HALF_W - BALL_R;
        let u = best.x + (best.dx * (PADDLE_Z - PADDLE_HD - BALL_R - best.z)) / best.dz + L;
        u = ((u % (4 * L)) + 4 * L) % (4 * L);
        if (u > 2 * L) u = 4 * L - u;
        tx = u - L;
      } else {
        tx = best.x * 0.6;
      }
      tx += Math.sin(time * 0.7) * paddle.w * 0.28;
    } else {
      const p = powerups[0];
      tx = p ? p.x : Math.sin(time * 0.5) * 4;
    }
    paddle.target = tx;
  }

  function updatePaddle(dt) {
    if (game.demo || DEBUG.bot) autopilot();
    else if (input.mode === 'keys') {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      paddle.target += dir * 26 * dt;
    } else if (input.ndcX !== null) {
      paddle.target = pointerWorldX();
    }
    paddle.w = damp(paddle.w, paddle.targetW, 10, dt);
    const limit = HALF_W - paddle.w / 2;
    paddle.target = clamp(paddle.target, -limit, limit);
    const prev = paddle.x;
    if (paddle.stun > 0) paddle.stun -= dt;
    else if (!paddle.hidden) paddle.x = damp(paddle.x, paddle.target, 28, dt);
    paddle.x = clamp(paddle.x, -limit, limit);
    paddle.vx = (paddle.x - prev) / Math.max(dt, 1e-4);
    // caught balls stay inside the (possibly shrinking) pad
    for (const b of balls) if (b.caught) b.offset = clamp(b.offset, -paddle.w / 2 + 0.2, paddle.w / 2 - 0.2);

    const m = padModel;
    m.layout(paddle.w);
    paddle.appear = paddle.hidden ? 0 : Math.min(1, paddle.appear + dt * 3);
    m.group.visible = !paddle.hidden;
    const ap = 1 - Math.pow(1 - paddle.appear, 3);
    m.group.scale.set(Math.max(0.01, ap), 1, 1);
    m.group.position.set(paddle.x, Math.sin(time * 4) * 0.03, PADDLE_Z);
    m.group.rotation.z = -clamp(paddle.vx * 0.004, -0.12, 0.12);
    paddle.flash = Math.max(0, paddle.flash - dt * 5);
    m.setLaser(game.timers.laser > 0);
    m.update(dt, time, { stun: paddle.stun, flash: paddle.flash });
    paddleLight.color.setHex(m.thruster);
    paddleLight.position.set(paddle.x, 1.4, PADDLE_Z - 0.6);
    paddleLight.intensity = paddle.hidden ? 0 : 1.3 + paddle.flash * 2;
    if (!paddle.hidden && Math.random() < dt * 30) {
      const s = Math.random() < 0.5 ? -1 : 1;
      emit(paddle.x + s * (paddle.w / 2 - 0.36), 0.2, PADDLE_Z + 0.2, rand(-0.3, 0.3), 0.2, rand(1, 2), m.thruster, 0.5, 0.3, 1, 0);
    }
  }

  // ============================================================== update
  function update(dt) {
    game.stateT += dt;
    game.levelT += dt;
    // Funky Balls runs its own turn-based simulation in js/funky.js
    if (funkyActive()) {
      extMode().update(dt);
      updateSentinel(dt);
      if (game.state === 'over' && game.stateT > 1.1 && !game.overShown) {
        game.overShown = true;
        $('screen-over').classList.remove('hidden');
      }
      return;
    }
    updatePaddle(dt);
    updateTimers(dt);
    if (game.mode === 'survival' && !game.demo && game.state === 'play') {
      game.survTime += dt;
      game.creepT -= dt;
      if (game.creepT <= 0) creep();
    }

    const st = game.state;
    if (st === 'intro' && game.stateT > 1.5) setState('serve');
    else if (st === 'serve' && (game.demo || DEBUG.bot) && game.stateT > 0.8) launch();
    else if (st === 'play' && (game.demo || DEBUG.bot) && balls.some((b) => b.caught && b.holdT < 1.4)) launch();
    else if (st === 'lost' && game.stateT > 1.4) {
      paddle.hidden = false;
      paddle.appear = 0;
      paddle.stun = 0;
      spawnServeBall();
      setState('serve');
    } else if (st === 'bossdown') {
      game.boomT -= dt;
      if (game.boomT <= 0 && game.stateT < 1.4) {
        game.boomT = 0.14;
        const x = rand(-2.6, 2.6), z = rand(TOP_Z - 0.5, CHIN.z + 0.5);
        burst(x, rand(1, 3.5), z, pick([COL.orange, COL.red, COL.magenta]), 30, 8, 0.6, 0.9, 2);
        spawnRing(x, z + 1, COL.orange, 3, 0.4);
        flashLight(x, z + 1, COL.orange, 4);
        addShake(0.4);
        sfx.explode();
      }
      if (game.stateT > 1.5 && !game.bigBoom) {
        game.bigBoom = true;
        burst(0, 2, TOP_Z + 0.5, 0xffffff, 60, 14, 0.8, 1.2, 3);
        burst(0, 2, TOP_Z + 0.5, COL.red, 80, 12, 1, 1.1, 2);
        spawnRing(0, TOP_Z + 1, COL.red, 12, 0.8);
        spawnDebris(0, TOP_Z + 1, COL.magenta, 16);
        flashLight(0, TOP_Z + 2, COL.red, 8);
        addShake(1.2);
        game.glitch = 1;
      }
      if (game.stateT > 2.4) levelClear();
    } else if (st === 'clear' && game.stateT > 2.6) {
      loadLevel(game.demo ? (game.level % 3) + 1 : game.level + 1);
    } else if (st === 'over' && game.stateT > 1.1 && !game.overShown) {
      game.overShown = true;
      $('hud').classList.add('hidden');
      $('screen-over').classList.remove('hidden');
    }

    updateBalls(dt);
    updateLasers(dt);
    updateTesla(dt);
    if (game.state !== 'intro') {
      updatePowerups(dt);
      updateCoins(dt);
    }
    updateDrones(dt);
    updateSentinel(dt);
    updateBolts(dt);
    updatePending(dt);
    if (!game.levelDef.boss && game.remaining <= 0 && (game.state === 'play' || game.state === 'lost')) {
      if (game.mode === 'survival') {
        if (game.state === 'play') waveCleared();
      } else {
        paddle.hidden = false;
        levelClear();
      }
    }
    updateBricks(dt);
    updateHud();
  }

  const WALL_FLASH = new THREE.Color(0xffffff);
  function updateAmbient(dt) {
    const a = ambient;
    a.sigilEnergy = Math.max(0, a.sigilEnergy - dt * 0.6);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.3);
    a.sigil[0].rotation.y += dt * 0.05;
    a.sigil[1].rotation.y -= dt * 0.08;
    a.sigil[2].rotation.y += dt * 0.3;
    a.sigil[0].material.opacity = 0.45 + pulse * 0.1 + a.sigilEnergy * 0.4;
    a.sigil[1].material.opacity = 0.5 + pulse * 0.12 + a.sigilEnergy * 0.5;
    a.sigil[2].material.opacity = 0.35 + (1 - pulse) * 0.2 + a.sigilEnergy * 0.4;
    const boss = sentinel.mode === 'boss';
    a.sigil[1].material.color.setHex(boss ? 0xff6080 : 0xffffff);

    a.planet.sphere.rotation.y += dt * 0.06;
    a.planet.wire.rotation.y -= dt * 0.04;
    a.planet.wire.rotation.x += dt * 0.02;
    a.planet.ring.rotation.z += dt * 0.1;
    a.stars.rotation.y += dt * 0.004;
    a.wallTextures.forEach((t) => { t.offset.x = (t.offset.x + dt * 0.04 * (1 + hype.energy * 6)) % 1; });
    a.cableMat.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(time * 2.2));
    if (a.chronoZone.visible) a.chronoZone.material.opacity = 0.08 + 0.05 * Math.sin(time * 2);

    for (const key in a.strips) {
      const s = a.strips[key];
      s.userData.flash = Math.max(0, s.userData.flash - dt * 4);
      s.material.color.copy(s.userData.base).lerp(WALL_FLASH, s.userData.flash);
    }
    for (const p of a.portals) {
      p.flash = Math.max(0, p.flash - dt * 1.5);
      p.ring.rotation.z += dt * (0.5 + p.flash * 6);
      p.disc.material.opacity = 0.3 + p.flash * 0.7 + 0.08 * Math.sin(time * 4);
      p.g.scale.setScalar(1 + p.flash * 0.25);
    }
    if (a.shield.visible) a.shield.material.opacity = 0.55 + 0.3 * Math.sin(time * 10);

    // drifting sparkles, like the stars scattered over the reference's magic circle
    if (!game.paused && Math.random() < dt * 14) {
      const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 11;
      emit(Math.cos(ang) * r, 0.1, SIGIL_Z + Math.sin(ang) * r, 0, rand(0.4, 1.1), 0,
        pick([COL.magenta, COL.violet, COL.cyan, 0xffffff]), rand(0.25, 0.5), rand(2, 4), 0, 0);
    }

    const lead = balls.find((b) => !b.stuck && !b.ghost) || balls[0];
    if (funkyActive()) {
      // js/funky.js drives the ball light itself
    } else if (lead) {
      ballLight.position.set(lead.x, 1.3, lead.z);
      ballLight.color.setHex(game.timers.plasma > 0 ? COL.orange : lead.model.light);
      ballLight.intensity = 1.1;
    } else {
      ballLight.intensity = 0;
    }
    fxLight.intensity = Math.max(0, fxLight.intensity - dt * 14);
  }

  const lookTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const sh = game.shake * game.shake;
    game.shake = Math.max(0, game.shake - dt * 1.8);
    game.glitch = Math.max(0, game.glitch - dt * 1.6);
    // no room to sway on portrait screens, and the tight phone framing has none either
    const sway = handheld() ? 0 : Math.min(1, camera.aspect);
    const orbit = game.demo ? Math.sin(time * 0.15) * 7 * sway : 0;
    const fx = funkyActive() ? focusX : paddle.x;
    camera.position.set(
      CAM_POS.x + fx * 0.12 * sway + orbit + (Math.random() - 0.5) * sh * 1.4,
      CAM_POS.y + (Math.random() - 0.5) * sh * 1.4,
      CAM_POS.z + (Math.random() - 0.5) * sh * 0.8,
    );
    lookTarget.set(CAM_LOOK.x + fx * 0.06 * sway + orbit * 0.3, CAM_LOOK.y, CAM_LOOK.z);
    camera.lookAt(lookTarget);
  }

  // ============================================================== resize
  // PC: the classic camera; the view only widens on narrow (portrait) windows so both
  // walls stay visible. The near edge of the platform is the widest thing on screen, so fit that.
  function framePC(aspect) {
    CAM_POS.copy(CAM_PC.pos);
    CAM_LOOK.copy(CAM_PC.look);
    const viewDir = new THREE.Vector3().subVectors(CAM_LOOK, CAM_POS).normalize();
    const nearDepth = new THREE.Vector3(0, 0, BOTTOM_Z).sub(CAM_POS).dot(viewDir);
    const needHalfW = HALF_W + WALL_T + 2;
    const fovForWidth = THREE.MathUtils.radToDeg(2 * Math.atan(needHalfW / (nearDepth * aspect)));
    return Math.max(BASE_FOV, fovForWidth);
  }

  // Phones and tablets: a closer, steeper camera and the tightest field of view that still
  // shows both walls, the far wall below the HUD and the near edge of the platform.
  const fitCam = new THREE.PerspectiveCamera();
  const fitV = new THREE.Vector3();
  function frameHandheld(aspect, h) {
    // upright phone -> CAM_TALL, sideways -> CAM_WIDE, upright tablets in between
    const t = clamp((aspect - 0.6) / 0.4, 0, 1);
    CAM_POS.lerpVectors(CAM_TALL.pos, CAM_WIDE.pos, t);
    CAM_LOOK.lerpVectors(CAM_TALL.look, CAM_WIDE.look, t);
    fitCam.position.copy(CAM_POS);
    fitCam.lookAt(CAM_LOOK);
    fitCam.updateMatrixWorld(true);
    fitCam.aspect = aspect;
    const side = HALF_W + WALL_T + lerp(0.3, 1.2, t);
    const hudTop = aspect < 1 ? 1 - (2 * 88) / h : 1;   // the HUD covers the top 88 px of an upright screen
    const ndcY = (x, y, z) => fitV.set(x, y, z).project(fitCam).y;
    for (let fov = 20; fov < 100; fov += 0.25) {
      fitCam.fov = fov;
      fitCam.updateProjectionMatrix();
      const nearX = fitV.set(side, 0, BOTTOM_Z).project(fitCam).x;
      if (nearX > 1) continue;                                           // walls cut off at the sides
      if (ndcY(0, WALL_H, TOP_Z - WALL_T) > hudTop - 0.02) continue;     // far wall under the HUD
      if (ndcY(0, 5, TOP_Z - 2.5) > 1.02) continue;                      // the Sentinel's head
      if (ndcY(0, 0, BOTTOM_Z) < -1.02) continue;                        // near edge of the platform
      return fov;
    }
    return 60;
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(quality.pr);
    composer.setPixelRatio(quality.pr);
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const aspect = w / h;
    const fov = handheld() ? frameHandheld(aspect, h) : framePC(aspect);
    [camera, refCam].forEach((c) => {
      c.aspect = aspect;
      c.fov = fov;
      c.updateProjectionMatrix();
    });
    refCam.position.copy(CAM_POS);
    refCam.lookAt(CAM_LOOK);
    refCam.updateMatrixWorld(true);
    const pr = quality.pr;
    finalPass.uniforms.uRes.value.set(w * pr, h * pr);
    pMat.uniforms.uScale.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    if (reflector) {
      const rw = Math.max(256, Math.round(w * pr * 0.5)), rh = Math.max(256, Math.round(h * pr * 0.5));
      reflector.getRenderTarget().setSize(rw, rh);
      reflector.material.uniforms.uTexel.value.set(1 / rw, 1 / rh);
    }
  }
  window.addEventListener('resize', resize);

  // How often the screen refreshes: the 20th percentile of the last 120 frame times.
  // Menus draw at half rate, so there the frames come as fast as the screen allows.
  function measureDisplay(realDt) {
    if (realDt < 1 / 250 || realDt > 1 / 20) return;
    quality.dts.push(realDt);
    if (quality.dts.length < 120) return;
    const p20 = quality.dts.sort((a, b) => a - b)[24];
    quality.dts.length = 0;
    quality.displayDt = Math.min(quality.displayDt, p20);
  }

  // Adaptive quality: if the frame rate sags, lower the render resolution in
  // steps, and as a last resort switch the mirror floor off.
  // PC only reacts below 45 FPS. Phones and tablets aim for the screen's own
  // refresh rate (60, 90 or 120 Hz) and trade some sharpness for smooth frames.
  function monitorQuality(realDt) {
    if (DEBUG.hq || settings.quality !== 'auto' || menuOpen || document.hidden || realDt > 0.25) return;
    quality.acc += realDt;
    quality.frames++;
    if (quality.acc < 2) return;
    const avg = quality.acc / quality.frames;
    quality.acc = 0;
    quality.frames = 0;
    const slow = avg > 1 / 45;
    const behind = handheld() && avg > quality.displayDt * 1.2;
    if (!slow && !behind) return;
    if (quality.pr > 1.01) {
      quality.pr = Math.max(1, quality.pr - 0.25);
      resize();
    } else if (reflector && quality.reflect) {
      quality.reflect = false;
      reflector.visible = false;
    } else if (slow && handheld() && quality.pr > 0.76) {
      // a slow phone may go below 1: a softer picture beats a stuttering game
      quality.pr = Math.max(0.75, quality.pr - 0.25);
      resize();
    }
  }

  // ============================================================ settings
  function applySetting(k) {
    if (k === 'master' || k === 'music' || k === 'sfx') audio.applyVolumes();
    else if (k === 'bloom') { bloom.strength = BLOOM * (settings.bloom / 100); bloom.enabled = settings.bloom > 0; }
    else if (k === 'quality' || k === 'reflect') {
      quality.pr = qualityPr(settings.quality);
      quality.reflect = settings.reflect && settings.quality !== 'low';
      if (reflector) reflector.visible = quality.reflect;
      resize();
    } else if (k === 'fps') $('fps').classList.toggle('hidden', !settings.fps);
  }
  NEON.settings = {
    defaults: SETTING_DEFAULTS,
    get(k) { return settings[k]; },
    set(k, v) {
      if (!(k in SETTING_DEFAULTS) || typeof v !== typeof SETTING_DEFAULTS[k]) return;
      settings[k] = v;
      store.set(SETTINGS_KEY, JSON.stringify(settings));
      applySetting(k);
    },
    get muted() { return audio.muted; },
    toggleMute() { const m = audio.toggleMute(); $('mute-ind').classList.toggle('hidden', !m); return m; },
  };
  // the player picked a device (start question or settings, js/mobil.js):
  // camera, render resolution and frame-rate target follow right away
  window.addEventListener('neon-platform', (e) => {
    // a phone gets the mirror floor off the first time: it costs a lot of FPS
    if (e.detail && e.detail.first && platform() === 'phone') NEON.settings.set('reflect', false);
    quality.pr = qualityPr(settings.quality);
    resize();
  });

  const fpsMeter = { t: 0, n: 0 };
  function countFps(realDt) {
    if (!settings.fps) return;
    fpsMeter.t += realDt;
    fpsMeter.n++;
    if (fpsMeter.t >= 0.5) {
      $('fps').textContent = Math.round(fpsMeter.n / fpsMeter.t) + ' FPS';
      fpsMeter.t = 0;
      fpsMeter.n = 0;
    }
  }

  // ========================================================= public hooks
  NEON.game = {
    refreshLoadout,
    showTitle,
    hideTitle() { $('screen-title').classList.add('hidden'); },
    setMenuOpen(v) { menuOpen = !!v; },
    // a full-screen mode (RPG) covers the arena: stop drawing it entirely
    setOccluded(v) { occluded = !!v; },
    // start a mode with options for its module (the RPG launches its marble battles this way)
    startMode(mode, opts) { extOpts = opts || null; startGame(mode); },
    // settings opened mid-game: pause first
    pause() { if (!game.demo && game.state !== 'over') setPaused(true); },
    get coins() { return P.coins; },
  };

  // engine services for js/funky.js (Funky Balls reuses the arena, FX, audio and HUD plumbing)
  NEON.core = {
    scene, camera, refCam,
    K: { HALF_W, TOP_Z, PADDLE_Z, BALL_R, CHIN, BOTTOM_Z, WALL_H },
    COL,
    emit, burst, spawnRing, spawnDebris, flashLight, addShake, popup, showBanner, noReflect, lightning,
    glowBrickMaterial, circleRect, awardCoins, awardTokens,
    sfx, audio, store,
    paddleLight, ballLight,
    glitch(v) { game.glitch = Math.max(game.glitch, v); },
    wallFlash(side) { if (ambient.strips[side]) ambient.strips[side].userData.flash = 1; },
    sigilPulse(v) { ambient.sigilEnergy = Math.min(1, ambient.sigilEnergy + v); hypeEvent(v * 0.6); },
    // HYPE: the background reacts (amount 0…1, colour, where it happened)
    hype: hypeEvent,
    get fever() { return hype.fever > 0; },
    get combo() { return hype.combo; },
    // the Sentinel in the top wall as a stage prop: 'dormant' | 'boss' | 'dead'
    sentinel(mode, name) { setSentinelMode(mode, 1, name); },
    sentinelFlash() { sentinel.flash = 1; },
    sentinelCharge(k) { sentinel.charge = Math.max(sentinel.charge, k); },
    pointer() { return input.ndcX === null ? null : { x: input.ndcX, y: input.ndcY }; },
    setFocusX(x) { focusX = x; },
    finish: finishFunky,
    exitMode: resetToDemo,
    get time() { return time; },
    get runCoins() { return game.runCoins; },
    get runTokens() { return game.runTokens; },
  };

  // =============================================================== boot
  resize();
  sentinel.root.updateMatrixWorld(true);
  sentinel.face.lookAt(CAM_POS);   // base orientation; the "dead" tilt is layered on top each frame
  const faceBaseQuat = sentinel.face.quaternion.clone();
  const tiltQuat = new THREE.Quaternion();
  const X_AXIS = new THREE.Vector3(1, 0, 0);

  function applyFaceTilt() {
    tiltQuat.setFromAxisAngle(X_AXIS, sentinel.tilt);
    sentinel.face.quaternion.copy(faceBaseQuat).multiply(tiltQuat);
  }

  // power-up letters are drawn with the Orbitron web font once it has arrived
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      Object.keys(PU).forEach((k) => {
        const map = puAssets[k].label.map;
        map.image = labelCanvas(PU[k].key, PU[k].color);
        map.needsUpdate = true;
      });
    });
  }

  syncWallets();
  refreshLoadout();
  $('fps').classList.toggle('hidden', !settings.fps);
  goTitle();

  function tick(dt) {
    time += dt;
    if (!game.paused) update(dt);
    applyFaceTilt();
    updateAmbient(dt);
    if (!game.paused) updateHype(dt);
    const simDt = game.paused ? 0 : dt;
    updateParticles(simDt);
    updateDebris(simDt);
    updateRings(simDt);
    updateArcs(simDt);
    updateCamera(dt);
  }

  let last = performance.now();
  let skip = false;
  let occluded = false;
  // start once every script (collection, lottery, Funky Balls) has registered itself
  function boot() {
    if (DEBUG.autostart) startGame(DEBUG.mode);
    for (let t = 0; t < DEBUG.warp; t += 1 / 60) tick(1 / 60);
    last = performance.now();
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.max((now - last) / 1000, 0);
    last = now;
    const dt = Math.min(realDt, 1 / 30);
    if (isLocked() && !wantLock()) document.exitPointerLock();   // menus always get the real cursor back
    countFps(realDt);
    measureDisplay(realDt);
    if (occluded) return;
    tick(dt);
    monitorQuality(realDt);
    // while a menu covers the arena, draw it at half rate to leave GPU time for the previews
    if (menuOpen) { skip = !skip; if (skip) return; }
    finalPass.uniforms.uTime.value = time;
    finalPass.uniforms.uGlitch.value = game.glitch;
    // small screens look darker: phones and tablets get more light and a softer vignette,
    // the RPG battle (lots of dark heroes on a dark floor) a little extra
    const rpgBoost = game.mode === 'marble' && !game.demo ? 0.12 : 0;
    finalPass.uniforms.uGain.value = (handheld() ? 1.14 : 1) + rpgBoost;
    finalPass.uniforms.uVig.value = handheld() ? 0.2 : 0.45;
    composer.render();
  }
})();
