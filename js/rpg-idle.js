/* ==========================================================================
   NEON SIGIL — RPG idle screen ("NEON RUN")
   The RPG hub: while your AFK loot piles up, your team races down an endless
   synthwave data highway. Viruses charge in from the horizon, melee heroes
   dash into them, ranged heroes shoot them down, coins burst out of every
   kill. Every few seconds a sector gate flies past, and now and then a boss
   blocks the road and the whole team unloads on it.
   Pure show: the loot itself is counted by js/rpg.js from the time you were away.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!window.THREE || !NEON.models || !NEON.rpgData) return;
  const M = NEON.models, D = NEON.rpgData;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const SPEED = 30;                              // how fast the world rushes past (units / s)
  const LANES = [-3.4, -1.1, 1.2, 3.5];          // depth of the four hero lanes
  const HOME_X = [-5.5, -2.6, -6.8, -3.8];       // where each hero cruises
  const SPAWN_X = 48, WRAP = 70;

  // ---------------------------------------------------------------- textures
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, g: c.getContext('2d') }; }
  function tex(c, rx, ry) {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
    return t;
  }
  function gridCanvas() {
    const { c, g } = canvas(128, 128);
    g.fillStyle = '#0b0420';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255, 60, 242, 0.75)';
    g.lineWidth = 2.5;
    g.shadowColor = '#ff3cf2';
    g.shadowBlur = 6;
    g.strokeRect(0, 0, 128, 128);
    return c;
  }
  function roadCanvas() {
    const { c, g } = canvas(256, 256);
    g.fillStyle = '#0a0718';
    g.fillRect(0, 0, 256, 256);
    // lane dashes (the texture's u runs along the road)
    g.fillStyle = 'rgba(223, 251, 255, 0.55)';
    [64, 128, 192].forEach((y) => g.fillRect(20, y - 2, 110, 4));
    // edge lines
    g.fillStyle = '#19e6ff';
    g.fillRect(0, 6, 256, 6);
    g.fillRect(0, 244, 256, 6);
    return c;
  }
  function skyCanvas() {
    const { c, g } = canvas(8, 512);
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#05010f');
    grd.addColorStop(0.35, '#1a0634');
    grd.addColorStop(0.47, '#6a1560');
    grd.addColorStop(0.5, '#ff5aa8');
    grd.addColorStop(0.52, '#2a0a3a');
    grd.addColorStop(1, '#05010f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
    return c;
  }
  function sunCanvas() {
    const { c, g } = canvas(256, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#fff3a0');
    grd.addColorStop(0.45, '#ffb23a');
    grd.addColorStop(1, '#ff2a8a');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    // retro scan bars cut into the lower half
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const y = 140 + i * 13, h = 2 + i * 1.1;
      g.fillRect(0, y, 256, h);
    }
    return c;
  }
  function windowsCanvas() {
    const { c, g } = canvas(64, 128);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 7) {
      for (let x = 4; x < 64; x += 7) {
        if (Math.random() < 0.3) { g.fillStyle = Math.random() < 0.7 ? '#19e6ff' : '#ff3cf2'; g.fillRect(x, y, 4, 3); }
      }
    }
    return c;
  }
  function signCanvas(text) {
    const { c, g } = canvas(512, 96);
    g.fillStyle = 'rgba(8, 3, 22, 0.92)';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#ff3cf2';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 90);
    g.font = '900 46px Orbitron, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#19e6ff';
    g.shadowBlur = 16;
    g.fillStyle = '#ffffff';
    g.fillText(text, 256, 50);
    return c;
  }

  // ------------------------------------------------------------- the program
  function create(opts) {
    const o = opts || {};
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x12052a, 40, 150);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    const LOOK_X = 3;
    const camBase = new THREE.Vector3(1.5, 7.4, 20), look = new THREE.Vector3(LOOK_X, 1.6, -3);

    scene.add(new THREE.AmbientLight(0x8a6aff, 0.55));
    scene.add(new THREE.HemisphereLight(0xff7ad8, 0x100820, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(-6, 12, 10);
    const rim = new THREE.PointLight(0xff3cf2, 2.2, 40);
    rim.position.set(10, 5, -6);
    const fill = new THREE.PointLight(0x19e6ff, 1.8, 40);
    fill.position.set(-10, 4, 8);
    const flashL = new THREE.PointLight(0xffffff, 0, 30);
    scene.add(key, rim, fill, flashL);

    // sky, sun, mountains
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: tex(skyCanvas()), side: THREE.BackSide, fog: false }));
    sky.position.y = -30;
    scene.add(sky);
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ map: tex(sunCanvas()), transparent: true, fog: false, depthWrite: false }));
    sun.position.set(30, 16, -200);
    const sunGlow = M.glow(0xff5aa8, 170, 0.5);
    sunGlow.material.fog = false;
    sunGlow.position.set(30, 16, -205);
    scene.add(sunGlow, sun);
    function ridge(z, h, color, seed) {
      const s = new THREE.Shape();
      s.moveTo(-320, 0);
      let r = seed;
      for (let x = -320; x <= 320; x += 14) {
        r = (r * 9301 + 49297) % 233280;
        const k = r / 233280;
        s.lineTo(x, h * (0.35 + 0.65 * k) * (0.6 + 0.4 * Math.abs(Math.sin(x * 0.013))));
      }
      s.lineTo(320, 0);
      s.closePath();
      const geo = new THREE.ShapeGeometry(s);
      const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0c0420, fog: false }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, fog: false }));
      const g = new THREE.Group();
      g.add(body, edge);
      g.position.set(0, -1, z);
      scene.add(g);
      return g;
    }
    const far = ridge(-175, 34, 0xff3cf2, 7);
    const near = ridge(-120, 20, 0x19e6ff, 13);

    // city silhouettes between the mountains and the road (slow parallax)
    const winTex = tex(windowsCanvas(), 1, 2);
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x0a0818, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.5 });
    const city = [];
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    // low and far back, so the sun and the mountains still rise above them
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(boxGeo, cityMat);
      const w = rand(4, 9), h = rand(5, 15);
      m.scale.set(w, h, rand(4, 7));
      m.position.set(-WRAP + (i / 24) * WRAP * 2, h / 2 - 1, rand(-100, -78));
      scene.add(m);
      city.push(m);
    }

    // ground grid and the road — both scroll to sell the speed
    const groundTex = tex(gridCanvas(), 60, 30);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 180), new THREE.MeshBasicMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -60);
    const roadTex = tex(roadCanvas(), 18, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 11.5), new THREE.MeshStandardMaterial({
      color: 0x202040, map: roadTex, emissive: 0xffffff, emissiveMap: roadTex, emissiveIntensity: 0.55, metalness: 0.25, roughness: 0.75,
    }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 0);
    scene.add(ground, road);
    const railMat = new THREE.MeshBasicMaterial({ color: 0x19e6ff });
    [-5.9, 5.9].forEach((z) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(200, 0.12, 0.12), railMat);
      rail.position.set(0, 0.35, z);
      scene.add(rail);
    });

    // light posts (far side) and bollards (near side) whoosh past
    const posts = [];
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1030, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7, 0.25), postMat);
      pole.position.y = 3.5;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.2), postMat);
      arm.position.set(0, 7, 1);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 1.2), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3cf2 : 0x19e6ff }));
      lamp.position.set(0, 6.9, 1.6);
      const glow = M.glow(i % 2 ? 0xff3cf2 : 0x19e6ff, 4, 0.55);
      glow.position.set(0, 6.6, 1.6);
      g.add(pole, arm, lamp, glow);
      g.position.set(-WRAP + (i / 10) * WRAP * 2, 0, -6.6);
      scene.add(g);
      posts.push(g);
    }
    const bollards = [];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.18), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3cf2 : 0x19e6ff }));
      b.position.set(-WRAP + (i / 14) * WRAP * 2, 0.22, 6.2);
      scene.add(b);
      bollards.push(b);
    }

    // speed lines close to the camera
    const lines = [];
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xdffbff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 26; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(rand(3, 8), 0.05), lineMat);
      l.position.set(rand(-30, 30), rand(0.4, 7), rand(-4, 9));
      l.userData.v = rand(2.2, 3.6);
      scene.add(l);
      lines.push(l);
    }

    // sector gate that arches over the road
    const gate = new THREE.Group();
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x140a28, metalness: 0.9, roughness: 0.3, emissive: 0xff3cf2, emissiveIntensity: 0.2 });
    [-6.4, 6.4].forEach((z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.5, 0.7), gateMat); p.position.set(0, 4.25, z); gate.add(p); });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 13.5), gateMat);
    beam.position.y = 8.5;
    const signMat = new THREE.MeshBasicMaterial({ map: tex(signCanvas('SECTOR 1-1')), transparent: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), signMat);
    sign.position.set(0.4, 7.4, 0);
    sign.rotation.y = -Math.PI / 2 + 0.35;
    const gateRing = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.08, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: 0x19e6ff }));
    gateRing.rotation.y = Math.PI / 2;
    gate.add(beam, sign, gateRing);
    gate.position.x = SPAWN_X + 30;
    scene.add(gate);

    // ------------------------------------------------------------- fx pools
    const sparks = [];
    for (let i = 0; i < 220; i++) {
      const s = M.glow(0xffffff, 0.3, 0);
      s.visible = false;
      scene.add(s);
      sparks.push({ s, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 8, drag: 0 });
    }
    let sparkNext = 0;
    function spark(x, y, z, color, n, speed, life, grav, size) {
      for (let i = 0; i < n; i++) {
        const p = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % sparks.length;
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const sp = speed * (0.3 + Math.random() * 0.7);
        p.s.visible = true;
        p.s.position.set(x, y, z);
        p.s.material.color.setHex(color);
        const sc = (size || 1) * (0.25 + Math.random() * 0.35);
        p.s.scale.set(sc, sc, 1);
        p.vx = r * Math.cos(th) * sp - SPEED * 0.3;
        p.vy = Math.abs(u) * sp + 1;
        p.vz = r * Math.sin(th) * sp;
        p.life = p.max = (life || 0.6) * (0.6 + Math.random() * 0.6);
        p.grav = grav === undefined ? 8 : grav;
      }
    }
    const rings = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      return { m, life: 0, max: 1, size: 1 };
    });
    let ringNext = 0;
    function ring(x, z, color, size, dur) {
      const r = rings[ringNext];
      ringNext = (ringNext + 1) % rings.length;
      r.m.visible = true;
      r.m.material.color.setHex(color);
      r.m.position.set(x, 0.1, z);
      r.life = r.max = dur || 0.4;
      r.size = size;
    }
    const coins = [];
    for (let i = 0; i < 40; i++) {
      const c = M.glow(0xffc933, 0.9, 0);
      c.visible = false;
      scene.add(c);
      coins.push({ s: c, t: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0 });
    }
    let coinNext = 0;
    function coinBurst(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        const c = coins[coinNext];
        coinNext = (coinNext + 1) % coins.length;
        c.s.visible = true;
        c.x = x; c.y = y; c.z = z;
        c.vx = rand(-4, 2) - SPEED * 0.25;
        c.vy = rand(8, 13);
        c.life = c.t = rand(0.9, 1.3);
      }
    }
    const shots = [];
    const shotGeo = new THREE.SphereGeometry(0.16, 8, 6);
    function shoot(h, e) {
      const core = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      core.add(M.glow(h.color, 1.6, 0.9));
      core.position.set(h.x + 0.8, 1.4, h.z);
      scene.add(core);
      shots.push({ core, e, color: h.color, h });
    }
    const beams = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return { m, life: 0 };
    });
    let beamNext = 0;
    function beamTo(x0, y0, z0, x1, y1, z1, color) {
      const b = beams[beamNext];
      beamNext = (beamNext + 1) % beams.length;
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
      b.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      b.m.scale.set(len, 1, 1);
      b.m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz)));
      b.m.material.color.setHex(color);
      b.m.visible = true;
      b.life = 0.35;
    }

    // ---------------------------------------------------------------- team
    let heroes = [];
    function setTeam(specs) {
      heroes.forEach((h) => scene.remove(h.root));
      heroes = (specs || []).slice(0, 4).map((spec, i) => {
        const def = D.HERO[spec.id];
        const model = D.makeHeroModel(def);
        model.group.scale.setScalar(1.25);
        model.face.rotation.y = -0.25;   // looking down the road, a little toward the camera
        const root = new THREE.Group();
        root.add(model.group);
        const glow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40), new THREE.MeshBasicMaterial({
          color: def.move === 'pierce' ? 0xff8a1f : 0x19e6ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.05;
        root.add(glow);
        scene.add(root);
        return {
          def, model, root, glow, idx: i, color: def.look.glow, ranged: D.CLASSES[def.cls].ranged,
          x: HOME_X[i], z: LANES[i], homeX: HOME_X[i], y: 0, dash: 0, target: null, cd: rand(0.2, 1), bob: rand(0, 6), hop: 0,
        };
      });
    }

    // ---------------------------------------------------------------- enemies
    const enemies = [];
    const VCOL = [0xff2a4d, 0xff3cf2, 0xff9a1f, 0xa64dff];
    let spawnT = 0.6, bossT = 24, boss = null;
    function spawn(kind) {
      let model, hp, scale, color;
      if (kind === 'virus') {
        color = pick(VCOL);
        model = D.makeVirusModel(color);
        scale = 2;
        hp = 1;
      } else {
        const def = pick(D.HEROES);
        color = 0xff2a4d;
        model = D.makeHeroModel(def, { boss: kind === 'boss' });
        model.face.rotation.y = Math.PI + 0.3;   // faces your team (and a little toward the camera)
        scale = kind === 'boss' ? 3 : 1.35;
        hp = kind === 'boss' ? 14 : 3;
      }
      model.group.scale.setScalar(scale);
      const root = new THREE.Group();
      root.add(model.group);
      if (kind !== 'virus') {
        const aura = M.glow(0xff2a4d, scale * 2.6, 0.35);
        aura.position.y = scale * 0.9;
        root.add(aura);
      }
      const lane = kind === 'boss' ? 0.1 : pick(LANES) + rand(-0.4, 0.4);
      const e = { kind, model, root, hp, max: hp, color, x: SPAWN_X + (kind === 'boss' ? 10 : 0), z: lane, y: scale * (kind === 'virus' ? 0.45 : 0.95), scale, flash: 0, alive: true, dying: 0, hitBy: null, bob: rand(0, 6), speed: kind === 'boss' ? 8 : rand(13, 19) };
      root.position.set(e.x, e.y, e.z);
      scene.add(root);
      enemies.push(e);
      if (kind === 'boss') { boss = e; o.onBanner && o.onBanner('BOSS INCOMING', true); }
      return e;
    }
    function hit(e, h, dmg) {
      if (!e.alive) return;
      e.hp -= dmg;
      e.flash = 1;
      e.x += 0.8;   // knocked back a little
      spark(e.x, e.y, e.z, h ? h.color : 0xffffff, 10, 7, 0.4, 6);
      if (e.hp <= 0) kill(e, h);
    }
    let kills = 0;
    function kill(e, h) {
      e.alive = false;
      e.dying = 0.001;
      kills++;
      const big = e.kind === 'boss';
      spark(e.x, e.y, e.z, e.color, big ? 70 : 24, big ? 14 : 9, big ? 1 : 0.6, 8, big ? 2 : 1.2);
      spark(e.x, e.y, e.z, 0xffffff, big ? 30 : 8, big ? 10 : 6, 0.5, 4);
      ring(e.x, e.z, e.color, big ? 9 : 3.2, big ? 0.7 : 0.4);
      coinBurst(e.x, e.y, e.z, big ? 18 : e.kind === 'elite' ? 6 : 3);
      flashL.position.set(e.x, 3, e.z);
      flashL.color.setHex(e.color);
      flashL.intensity = big ? 8 : 3;
      shake = Math.max(shake, big ? 1 : 0.15);
      if (h) h.hop = Math.max(h.hop, 0.5);
      if (o.onKill) o.onKill(e.kind, projectTo(e.x, e.y + 1, e.z));
      if (big) {
        boss = null;
        heroes.forEach((x) => { x.hop = 1; });
        if (o.onBanner) o.onBanner('BOSS DELETED');
      }
    }

    // ------------------------------------------------------------- per frame
    let t = 0, shake = 0, dist = 0;
    const proj = new THREE.Vector3();
    function projectTo(x, y, z) {
      proj.set(x, y, z).project(camera);
      return [(proj.x + 1) / 2, (1 - proj.y) / 2];
    }

    function nearestAhead(h) {
      let best = null, bd = Infinity;
      for (const e of enemies) {
        if (!e.alive || e.x < h.x - 1) continue;
        const d = e.x - h.x + Math.abs(e.z - h.z) * 1.5;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    function updateHero(h, dt) {
      h.bob += dt;
      h.cd -= dt;
      h.hop = Math.max(0, h.hop - dt * 2.5);
      const target = nearestAhead(h);
      if (h.dash > 0) {
        // melee dash: streak into the target, then drift back into formation
        h.dash -= dt;
        const e = h.target;
        if (e && e.alive) {
          h.x = lerp(h.x, e.x - e.scale * 0.8, Math.min(1, dt * 14));
          h.z = lerp(h.z, e.z, Math.min(1, dt * 10));
          if (Math.abs(h.x - (e.x - e.scale * 0.8)) < 0.6) { hit(e, h, e.kind === 'boss' ? 1 : 3); h.dash = 0; }
          if (Math.random() < 0.8) spark(h.x - 0.6, 1.2, h.z, h.color, 1, 1, 0.3, 0, 1.6);
        } else h.dash = 0;
      } else {
        h.x = lerp(h.x, h.homeX, Math.min(1, dt * 2.5));
        h.z = lerp(h.z, LANES[h.idx], Math.min(1, dt * 3));
        if (target && h.cd <= 0) {
          const dx = target.x - h.x;
          if (!h.ranged && dx < 11) { h.dash = 0.5; h.target = target; h.cd = rand(0.6, 1); }
          else if (h.ranged && dx < 26) { shoot(h, target); h.cd = rand(0.35, 0.6); h.hop = Math.max(h.hop, 0.25); }
        }
      }
      h.y = 1.2 + Math.sin(h.bob * 7) * 0.08 + Math.sin(h.hop * Math.PI) * 1.4;
      h.root.position.set(h.x, 0, h.z);
      h.model.group.position.y = h.y;
      h.model.group.rotation.z = -0.12 - (h.dash > 0 ? 0.25 : 0);   // leaning into the wind
      h.glow.material.opacity = 0.5 + Math.sin(t * 8 + h.idx) * 0.2;
      h.model.update(dt, t + h.bob);
      h.model.flash(0);
      // exhaust trail
      if (Math.random() < dt * 30) spark(h.x - 0.9, h.y - 0.4, h.z, h.color, 1, 0.8, 0.35, 0, 1.3);
    }

    function update(dt) {
      t += dt;
      // back off on narrow screens. Phones and tablets (js/mobil.js) back off less and
      // turn towards the team instead, so the heroes stay big on an upright screen.
      const back = 1.5 / camera.aspect;
      const handheld = NEON.platform && NEON.platform !== 'pc';
      const k = Math.max(1, handheld ? Math.sqrt(back) : back);
      const shift = handheld ? -5 * Math.min(1, Math.max(0, (back - 1) / 2)) : 0;
      look.x = LOOK_X + shift;
      camera.position.copy(camBase).setX(camBase.x + shift).sub(look).multiplyScalar(k).add(look);
      camera.position.x += Math.sin(t * 0.35) * 0.6 + (Math.random() - 0.5) * shake * 0.6;
      camera.position.y += Math.sin(t * 0.5) * 0.25 + (Math.random() - 0.5) * shake * 0.5;
      shake = Math.max(0, shake - dt * 2.5);
      camera.lookAt(look);
      if (dt <= 0) return;
      dist += SPEED * dt;
      // scrolling world
      groundTex.offset.x += (SPEED * dt) / 6;
      roadTex.offset.x += (SPEED * dt) / (200 / 18);
      posts.forEach((p) => { p.position.x -= SPEED * dt; if (p.position.x < -WRAP) p.position.x += WRAP * 2; });
      bollards.forEach((b) => { b.position.x -= SPEED * dt; if (b.position.x < -WRAP) b.position.x += WRAP * 2; });
      city.forEach((c) => { c.position.x -= SPEED * 0.18 * dt; if (c.position.x < -WRAP) c.position.x += WRAP * 2; });
      near.position.x = -((t * SPEED * 0.03) % 28);
      far.position.x = -((t * SPEED * 0.012) % 28);
      lines.forEach((l) => { l.position.x -= SPEED * l.userData.v * dt; if (l.position.x < -34) { l.position.x = rand(30, 40); l.position.y = rand(0.4, 7); } });
      gate.position.x -= SPEED * dt;
      if (gate.position.x < -WRAP) {
        gate.position.x = SPAWN_X + rand(40, 80);
        if (o.gateLabel) {
          signMat.map.dispose();
          signMat.map = tex(signCanvas(o.gateLabel()));
          signMat.needsUpdate = true;
        }
      }
      gateRing.material.color.setHSL((t * 0.2) % 1, 1, 0.6);
      sun.position.y = 16 + Math.sin(t * 0.2) * 0.6;

      // enemies
      spawnT -= dt;
      bossT -= dt;
      if (bossT <= 0 && !boss) { spawn('boss'); bossT = rand(28, 36); }
      if (spawnT <= 0 && !boss && enemies.length < 7) { spawn(Math.random() < 0.18 ? 'elite' : 'virus'); spawnT = rand(0.35, 0.9); }
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.bob += dt;
        if (e.alive) {
          const stopX = e.kind === 'boss' ? 6 : -Infinity;
          e.x = Math.max(stopX, e.x - e.speed * dt);
          if (e.x < -16) { scene.remove(e.root); enemies.splice(i, 1); continue; }
        } else {
          e.dying += dt * 3;
          e.x -= SPEED * 0.5 * dt;
          e.model.group.scale.setScalar(e.scale * Math.max(0, 1 - e.dying) * (1 + e.dying * 0.5));
          if (e.dying >= 1) { scene.remove(e.root); enemies.splice(i, 1); continue; }
        }
        e.flash = Math.max(0, e.flash - dt * 5);
        e.model.flash(e.flash);
        e.model.update(dt, t + e.bob);
        e.root.position.set(e.x, e.y + Math.sin(e.bob * 5) * 0.15, e.z);
      }
      // the whole team unloads on a boss
      if (boss && boss.alive && Math.random() < dt * 3) {
        const h = pick(heroes);
        if (h) { beamTo(h.x + 0.6, 1.4, h.z, boss.x, boss.y, boss.z, h.color); hit(boss, h, 1); }
      }
      heroes.forEach((h) => updateHero(h, dt));

      // projectiles
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i], p = s.core.position, e = s.e;
        const tx = e.x, ty = e.y, tz = e.z;
        const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, d = Math.hypot(dx, dy, dz), step = 55 * dt;
        if (!e.alive && e.dying > 0.5) { scene.remove(s.core); shots.splice(i, 1); continue; }
        if (d <= step) { scene.remove(s.core); shots.splice(i, 1); hit(e, s.h, 1); continue; }
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        p.z += (dz / d) * step;
        if (Math.random() < 0.7) spark(p.x, p.y, p.z, s.color, 1, 0.5, 0.2, 0, 0.9);
      }
      // fx
      for (const p of sparks) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.vy -= p.grav * dt;
        p.s.position.x += p.vx * dt;
        p.s.position.y += p.vy * dt;
        p.s.position.z += p.vz * dt;
        p.s.material.opacity = p.life / p.max;
      }
      for (const r of rings) {
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0) { r.m.visible = false; continue; }
        const q = 1 - r.life / r.max;
        const s = lerp(0.2, r.size, 1 - Math.pow(1 - q, 3));
        r.m.scale.set(s, s, 1);
        r.m.position.x -= SPEED * 0.5 * dt;
        r.m.material.opacity = (1 - q) * 0.9;
      }
      for (const c of coins) {
        if (c.t <= 0) continue;
        c.t -= dt;
        if (c.t <= 0) { c.s.visible = false; continue; }
        c.vy -= 16 * dt;
        c.x += c.vx * dt;
        c.y = Math.max(0.3, c.y + c.vy * dt);
        c.s.position.set(c.x, c.y, c.z);
        const sc = 0.6 + Math.abs(Math.sin(c.t * 14)) * 0.5;   // spinning coin
        c.s.scale.set(sc * 0.55, sc, 1);
        c.s.material.opacity = Math.min(1, c.t * 2);
      }
      for (const b of beams) {
        if (b.life <= 0) continue;
        b.life -= dt;
        if (b.life <= 0) { b.m.visible = false; continue; }
        b.m.material.opacity = b.life / 0.35;
      }
      flashL.intensity = Math.max(0, flashL.intensity - dt * 12);
      if (o.onTick) o.onTick(dist, kills);
    }

    // AFK loot collected: a coin shower over the whole road and the team cheers
    function collect() {
      for (let i = 0; i < 6; i++) coinBurst(rand(-8, 10), rand(4, 8), rand(-3, 3), 6);
      heroes.forEach((h) => { h.hop = 1; spark(h.x, 1.4, h.z, 0xffc933, 16, 8, 0.8, 8, 1.4); });
      flashL.position.set(0, 5, 2);
      flashL.color.setHex(0xffc933);
      flashL.intensity = 8;
      shake = 0.6;
    }

    function reset() {
      enemies.forEach((e) => scene.remove(e.root));
      enemies.length = 0;
      shots.forEach((s) => scene.remove(s.core));
      shots.length = 0;
      boss = null;
      bossT = rand(18, 24);
      spawnT = 0.4;
    }

    // exposure: brighter than the stage3d default, the night highway looked too dark
    return { scene, camera, update, setTeam, collect, reset, exposure: 1.6, get distance() { return dist; }, get kills() { return kills; } };
  }

  NEON.rpgIdle = { create };
})();
