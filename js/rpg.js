/* ==========================================================================
   NEON SIGIL — RPG mode ("NEURAL ARENA")
   A marble RPG in the spirit of Hyper Heroes, with the cyber look of the
   rest of the game:
   * HUB: your team races down the NEON RUN highway (js/rpg-idle.js), smashing
     viruses, while AFK loot (coins, hero XP, hero crates and free Data Boxes)
     piles up in real time — up to 12 hours.
   * CAMPAIGN: pick 4 heroes, check the stage boss, then fight the level on
     the Funky Balls map: sling your hero balls across the arena, wave after
     wave, until the boss falls (js/rpg-kampf.js).
   * HEROES: pulled from Hero Crates and Data Boxes (rarities C … HR). A copy
     of a hero you already own turns into STARDUST; stardust buys copies and
     copies ascend heroes. Level up with XP + coins; level 30 unlocks the
     hero's signature relic.
   The 26 hero balls, their classes and abilities live in js/rpg-helden.js.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!window.THREE || !NEON.profile || !NEON.models || !NEON.stage3d || !NEON.game || !NEON.rpgData) return;
  const P = NEON.profile, M = NEON.models, S3 = NEON.stage3d, D = NEON.rpgData;
  const { FACTIONS, FACTION_ORDER, CLASSES, HEROES, HERO, RARITIES, RARITY_ORDER, MOVE_SPD, RELIC_LVL } = D;
  const $ = (id) => document.getElementById(id);
  const play = (name, arg) => { const s = NEON.audio && NEON.audio.sfx; if (s && s[name]) s[name](arg); };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const int = (v) => Math.floor(Number(v) || 0);
  const css = D.css;
  const QS = new URLSearchParams(location.search);

  // ================================================================ tuning
  const TEAM_SIZE = 4;
  const AFK_CAP_MIN = 720;                    // AFK loot stops piling up after 12 h
  const STARTERS = ['aegis', 'viper', 'pyro', 'spore'];
  const START_CRATES = 5;
  const ASCEND_COPIES = [0, 1, 2, 3, 4];      // copies from ★n to ★n+1
  const MAX_STARS = 5;
  const MIGRATION_CRATES = 10;
  const levelCap = (stars) => 10 + stars * 20;
  // coins used to be the bottleneck: leveling is cheaper in coins now, and every coin source pays more
  const lvlCost = (lvl) => ({ xp: Math.round(30 * Math.pow(1.11, lvl - 1)), coins: Math.round(4 + 3 * Math.pow(1.075, lvl - 1)) });
  const SYNC_SIZE = 5;   // the NEURAL LINK: your 5 highest heroes set the level of every other hero
  const stageLabel = (s) => Math.floor((s - 1) / 10) + 1 + '-' + (((s - 1) % 10) + 1);

  // AFK loot per minute grows with every cleared stage
  function afkRates(cleared) {
    return {
      coins: 1.5 + cleared * 0.35,
      xp: 6 + cleared * 2.2,
      crateEvery: Math.max(45, 150 - cleared * 3),   // minutes per hero crate
      boxEvery: 240,                                  // minutes per free Data Box
    };
  }
  const stageRewards = (s) => ({ coins: 40 + s * 10, xp: 40 + s * 12, crate: s % 5 === 0 });

  // ================================================================= state
  let R = null;
  const commit = () => P.commitRpg();

  // loads (and repairs) the RPG part of the profile; a fresh profile gets the starter squad
  function state() {
    if (R) return R;
    R = P.rpgData();
    R.stage = Math.max(1, int(R.stage) || 1);
    R.xp = Math.max(0, int(R.xp));
    R.crates = Math.max(0, int(R.crates));
    R.stardust = Math.max(0, int(R.stardust));
    ['crateProg', 'boxProg', 'coinFrac', 'xpFrac'].forEach((k) => { R[k] = Math.max(0, Number(R[k]) || 0); });
    const heroes = {};
    if (R.heroes && typeof R.heroes === 'object') {
      Object.keys(R.heroes).forEach((id) => {
        if (!HERO[id]) return;
        const h = R.heroes[id] || {};
        const stars = clamp(int(h.stars) || 1, 1, MAX_STARS);
        heroes[id] = { lvl: clamp(int(h.lvl) || 1, 1, levelCap(stars)), stars, copies: Math.max(0, int(h.copies)), shards: Math.max(0, int(h.shards)) };
      });
    }
    let refundCoins = 0;
    if (R.v !== 2 && R.v !== 3) {
      if (Object.keys(heroes).length > TEAM_SIZE) refundCoins = migrateRoster(heroes);
      R.v = 2;
    }
    if (R.v === 2) { repairLink(heroes); R.v = 3; }
    Object.keys(heroes).forEach((id) => {   // shards are gone: leftovers become stardust
      const h = heroes[id];
      if (h.shards) R.stardust += Math.floor(h.shards / 10) * RARITIES[HERO[id].rarity].dust;
      delete h.shards;
    });
    if (!Object.keys(heroes).length) {
      STARTERS.forEach((id) => { heroes[id] = { lvl: 1, stars: 1, copies: 0 }; });
      R.crates += START_CRATES;
    }
    R.heroes = heroes;
    R.team = (Array.isArray(R.team) ? R.team : []).filter((id, i, a) => heroes[id] && a.indexOf(id) === i).slice(0, TEAM_SIZE);
    if (!R.team.length) R.team = Object.keys(heroes).slice(0, TEAM_SIZE);
    if (!(R.afkSince > 0) || R.afkSince > Date.now()) R.afkSince = Date.now();
    const fake = parseFloat(QS.get('afk'));   // test hook: pretend N minutes passed
    if (fake > 0) R.afkSince = Date.now() - fake * 60000;
    commit();
    if (refundCoins) P.addCoins(refundCoins);
    return R;
  }

  // Save format 2: heroes are pulled from lootboxes now. An older save that owns more
  // than a team's worth of heroes keeps its current team; every other hero is refunded
  // (the XP and coins spent on it, stardust for its stars) plus a stack of Hero Crates.
  // The old roster stays in `legacyHeroes`, so it can always be restored.
  function migrateRoster(heroes) {
    const keep = (Array.isArray(R.team) ? R.team : []).filter((id) => heroes[id]).slice(0, TEAM_SIZE);
    STARTERS.forEach((id) => { if (keep.length < TEAM_SIZE && heroes[id] && !keep.includes(id)) keep.push(id); });
    R.legacyHeroes = JSON.parse(JSON.stringify(heroes));
    let xp = 0, coins = 0, dust = 0, removed = 0;
    Object.keys(heroes).forEach((id) => {
      if (keep.includes(id)) return;
      const h = heroes[id], rar = RARITIES[HERO[id].rarity];
      for (let l = 1; l < h.lvl; l++) { const c = lvlCost(l); xp += c.xp; coins += c.coins; }
      for (let s = 1; s < h.stars; s++) dust += ASCEND_COPIES[s] * rar.dust;
      dust += Math.floor(h.shards / 10) * rar.dust;
      delete heroes[id];
      removed++;
    });
    R.team = keep;
    R.xp += xp;
    R.crates += MIGRATION_CRATES;
    R.stardust += dust;
    R.migrated = { removed, xp, coins, dust, crates: MIGRATION_CRATES, shown: false };
    return coins;
  }

  // Save format 3: the lootbox update took away the heroes that carried the NEURAL LINK,
  // so the heroes you kept dropped back to their own (often much lower) level. They get the
  // level they showed before back, and the old link level stays as a floor for every hero.
  function repairLink(heroes) {
    const old = R.legacyHeroes;
    if (!old) return;
    const levels = Object.keys(old).map((id) => int(old[id].lvl) || 1).sort((a, b) => b - a);
    const floor = levels.length > SYNC_SIZE ? levels[SYNC_SIZE - 1] : 0;
    R.linkFloor = floor;
    Object.keys(heroes).forEach((id) => {
      const h = heroes[id];
      if (old[id]) h.lvl = clamp(Math.max(h.lvl, floor, int(old[id].lvl)), 1, levelCap(h.stars));
    });
  }

  // ----------------------------------------------------------------- stats
  // base stats at a level, including ATK / HP boosts from abilities unlocked at that level
  // SPD (marble speed): BOUNCE 500 / PIERCE 350 base, then class, rarity, stars and speed boosts
  function heroStats(id, lvl, stars) {
    const h = HERO[id], c = CLASSES[h.cls], mods = D.heroMods(h, lvl), rar = RARITIES[h.rarity];
    const rm = rar.mult;
    const g = (1 + (lvl - 1) * 0.1) * (1 + (stars - 1) * 0.22) * rm;
    return {
      hp: Math.round(c.hp * g * (mods.hpMult || 1) * (1 + (mods.hpUp || 0))),
      atk: Math.round(c.atk * g * (1 + (mods.atkUp || 0))),
      armor: Math.round(c.def * (1 + (lvl - 1) * 0.06) * (1 + (stars - 1) * 0.15) * rm),
      spd: Math.round(MOVE_SPD[h.move] * c.spd * (1 + rar.rank * 0.015) * (1 + (stars - 1) * 0.03) * (1 + (mods.speed || 0))),
      rate: c.rate, range: c.range, move: c.move,
    };
  }
  const power = (s) => Math.round(s.hp * 0.2 + s.atk * 4 + s.armor * 2);

  // NEURAL LINK (like AFK Arena's Resonating Crystal): the lowest level among your five
  // highest heroes becomes the level of every other hero you own.
  // `floor` is the link level your roster had before the lootbox update (see repairLink):
  // no hero ever drops below it.
  function syncInfo() {
    const r = state();
    const ids = Object.keys(r.heroes);
    const top = ids.slice().sort((a, b) => r.heroes[b].lvl - r.heroes[a].lvl || r.heroes[b].stars - r.heroes[a].stars).slice(0, SYNC_SIZE);
    const floor = r.linkFloor || 0;
    const fifth = ids.length > SYNC_SIZE ? r.heroes[top[SYNC_SIZE - 1]].lvl : 0;
    return { top, floor, level: Math.max(fifth, floor), weakest: ids.length > SYNC_SIZE ? top[SYNC_SIZE - 1] : null };
  }
  function effLvl(id, sync) {
    const own = state().heroes[id].lvl;
    const s = sync || syncInfo();
    return Math.max(own, s.top.includes(id) ? s.floor : s.level);
  }
  const isSynced = (id, sync) => effLvl(id, sync) > state().heroes[id].lvl;
  const heroPower = (id) => power(heroStats(id, effLvl(id), state().heroes[id].stars));

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Every campaign stage is a level of 3 waves; the last one holds the boss.
  // Line-ups are fixed per stage, so you can plan your team against them.
  function stagePlan(stage) {
    const rnd = mulberry(stage * 9973 + 7);
    const lvl = Math.max(1, Math.round(1 + (stage - 1) * 1.35));
    const stars = Math.min(MAX_STARS, 1 + Math.floor((stage - 1) / 15));
    const pool = HEROES.filter((h) => RARITIES[h.rarity].rank < 5 || stage >= 8).map((h) => h.id);
    const pickHero = () => pool[Math.floor(rnd() * pool.length)];
    const waves = [];
    for (let w = 0; w < 2; w++) {
      const list = [];
      const heroes = Math.min(4, 1 + Math.floor(stage / 4) + w);
      const viruses = 2 + Math.floor(rnd() * 2) + (stage > 5 ? 1 : 0);
      for (let i = 0; i < heroes; i++) list.push({ kind: 'hero', id: pickHero(), lvl, stars });
      for (let i = 0; i < viruses; i++) list.push({ kind: 'virus', lvl, stars });
      waves.push(list);
    }
    const boss = { kind: 'boss', id: pickHero(), lvl: lvl + 1, stars };
    waves.push([boss, { kind: 'virus', lvl, stars }, { kind: 'virus', lvl, stars }].concat(stage >= 6 ? [{ kind: 'hero', id: pickHero(), lvl, stars }] : []));
    return { stage, lvl, stars, waves, boss, seed: stage * 7919 };
  }
  function planPower(plan) {
    let p = 0;
    plan.waves.forEach((w) => w.forEach((e) => {
      if (e.kind !== 'virus') p += power(heroStats(e.id, e.lvl, e.stars)) * (e.kind === 'boss' ? 2 : 0.6);
    }));
    return Math.round(p / 2);
  }

  // formation: tanks and warriors take the two front slots, everyone else the back row
  const SLOTS = [[-3.4, -1.8], [-3.4, 1.8], [-7.2, -2.8], [-7.2, 2.8]];
  function arrange(specs) {
    const melee = specs.filter((s) => !CLASSES[HERO[s.id].cls].ranged)
      .sort((a, b) => (HERO[a.id].cls === 'tank' ? 0 : 1) - (HERO[b.id].cls === 'tank' ? 0 : 1));
    const ranged = specs.filter((s) => CLASSES[HERO[s.id].cls].ranged);
    const front = melee.slice(0, 2);
    const back = melee.slice(2).concat(ranged);
    while (front.length < 2 && back.length > 2) front.push(back.pop());
    while (back.length > 2) front.push(back.pop());
    const out = [];
    front.forEach((s, i) => out.push(Object.assign({ slot: i }, s)));
    back.forEach((s, i) => out.push(Object.assign({ slot: 2 + i }, s)));
    return out;
  }
  const teamSpecs = (ids) => { const s = syncInfo(); return ids.map((id) => ({ id, lvl: effLvl(id, s), stars: state().heroes[id].stars })); };

  // ============================================================ textures
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return { c, g: c.getContext('2d') };
  }
  const tex = (c, rep) => {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  };

  function groundCanvas() {
    const { c, g } = canvas(1024, 1024);
    g.fillStyle = '#07041a';
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(25,230,255,0.09)';
    g.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke();
    }
    const rnd = mulberry(42);
    g.strokeStyle = 'rgba(255,60,242,0.14)';
    g.lineWidth = 3;
    for (let k = 0; k < 40; k++) {
      let x = Math.round(rnd() * 16) * 64, y = Math.round(rnd() * 16) * 64;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        if (s % 2) y += (rnd() < 0.5 ? -1 : 1) * 64; else x += (rnd() < 0.5 ? -1 : 1) * 128;
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = 'rgba(255,60,242,0.3)';
      g.fillRect(x - 4, y - 4, 8, 8);
    }
    return c;
  }

  // the rune circle on the arena floor (like the stone circle in AFK Arena, but hardlight)
  function sigilCanvas() {
    const { c, g } = canvas(1024, 1024);
    const C = 512;
    g.translate(C, C);
    const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(500, 6, 'rgba(25,230,255,0.9)');
    ring(480, 2, 'rgba(25,230,255,0.5)');
    ring(360, 4, 'rgba(255,60,242,0.8)');
    ring(344, 2, 'rgba(255,60,242,0.4)');
    ring(150, 3, 'rgba(25,230,255,0.6)');
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2, l = i % 8 === 0 ? 30 : 12;
      g.strokeStyle = 'rgba(25,230,255,0.6)';
      g.lineWidth = i % 8 === 0 ? 4 : 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 478, Math.sin(a) * 478);
      g.lineTo(Math.cos(a) * (478 - l), Math.sin(a) * (478 - l));
      g.stroke();
    }
    g.font = '700 30px Consolas, monospace';
    g.fillStyle = 'rgba(255,60,242,0.7)';
    g.textAlign = 'center';
    const glyphs = '01AF3C7E9B42D8#<>/{}';
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      g.save();
      g.rotate(a);
      g.fillText(glyphs[i % glyphs.length], 0, -410);
      g.restore();
    }
    // hexagram
    g.strokeStyle = 'rgba(166,77,255,0.75)';
    g.lineWidth = 4;
    for (const off of [0, Math.PI / 3]) {
      g.beginPath();
      for (let k = 0; k <= 3; k++) {
        const a = off - Math.PI / 2 + (k * Math.PI * 2) / 3;
        if (k) g.lineTo(Math.cos(a) * 340, Math.sin(a) * 340); else g.moveTo(Math.cos(a) * 340, Math.sin(a) * 340);
      }
      g.stroke();
    }
    return c;
  }

  function skyCanvas() {
    const { c, g } = canvas(8, 512);
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#02010a');
    grd.addColorStop(0.38, '#12062c');
    grd.addColorStop(0.5, '#4a1450');
    grd.addColorStop(0.53, '#ff3cf2');
    grd.addColorStop(0.56, '#2a0a3a');
    grd.addColorStop(1, '#040210');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
    return c;
  }

  function windowsCanvas() {
    const { c, g } = canvas(128, 256);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 256);
    const rnd = mulberry(7);
    for (let y = 6; y < 256; y += 10) {
      for (let x = 6; x < 128; x += 10) {
        if (rnd() < 0.34) {
          g.fillStyle = rnd() < 0.7 ? 'rgba(25,230,255,0.9)' : 'rgba(255,60,242,0.9)';
          g.fillRect(x, y, 5, 4);
        }
      }
    }
    return c;
  }

  // ============================================================== arena
  // One stage3d program shared by the hub (idle farm) and the formation preview.
  const W = {
    mode: 'none', units: [], t: 0, spawnT: 0,
    camPos: new THREE.Vector3(0, 10, 19), camLook: new THREE.Vector3(0, 0, 0),
  };
  let arena = null;

  function makeArena() {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0520, 34, 95);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    const host = $('rpg-canvas');

    scene.add(new THREE.AmbientLight(0x6a5aff, 0.45));
    scene.add(new THREE.HemisphereLight(0x8a7aff, 0x140a28, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(4, 14, 10);
    const lc = new THREE.PointLight(0x19e6ff, 2.2, 40); lc.position.set(-11, 5, 5);
    const lm = new THREE.PointLight(0xff3cf2, 2.2, 40); lm.position.set(11, 5, 5);
    const flashL = new THREE.PointLight(0xffffff, 0, 18);
    scene.add(sun, lc, lm, flashL);

    // sky, far city, moon
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.MeshBasicMaterial({ map: tex(skyCanvas()), side: THREE.BackSide, fog: false }));
    sky.position.y = -40;
    scene.add(sky);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 20), new THREE.MeshBasicMaterial({ color: 0x3a1e6a, fog: false }));
    moon.position.set(28, 30, -120);
    const moonGlow = M.glow(0xff3cf2, 46, 0.35);
    moonGlow.material.fog = false;
    moonGlow.position.copy(moon.position);
    const moonRim = M.glow(0x19e6ff, 22, 0.35);
    moonRim.material.fog = false;
    moonRim.position.copy(moon.position);
    scene.add(moonGlow, moon, moonRim);

    // a handful of shared window materials (one texture each) keeps the skyline cheap
    const winCanvas = windowsCanvas();
    const towerMats = [[0.6, 1.2], [0.8, 2], [1, 2.8], [0.7, 3.4]].map(([rx, ry]) => new THREE.MeshStandardMaterial({
      color: 0x0a0818, emissive: 0xffffff, emissiveMap: tex(winCanvas, [rx, ry]), emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.5,
    }));
    const rnd = mulberry(1234);
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 70; i++) {
      const w = 3 + rnd() * 5, h = 6 + rnd() * 26, d = 3 + rnd() * 4;
      const side = i % 2 ? 1 : -1;
      const x = side * (rnd() * 70), z = -30 - rnd() * 40;
      const m = new THREE.Mesh(towerGeo, towerMats[Math.min(3, Math.floor(h / 8))]);
      m.scale.set(w, h, d);
      m.position.set(x, h / 2 - 1, z);
      scene.add(m);
      if (rnd() < 0.25) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, h * 0.5, 0.3), new THREE.MeshBasicMaterial({ color: rnd() < 0.5 ? 0xff3cf2 : 0x19e6ff }));
        sign.position.set(x + w / 2 + 0.2, h * 0.55, z + d / 2);
        scene.add(sign);
      }
    }

    // ground + hardlight platform with the rune circle
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 100), new THREE.MeshStandardMaterial({
      color: 0x0a0822, emissive: 0xffffff, emissiveMap: tex(groundCanvas(), [10, 6]), emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.45,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -20;
    scene.add(ground);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.4, 0.3, 96), new THREE.MeshStandardMaterial({ color: 0x120c2a, metalness: 0.85, roughness: 0.3 }));
    plat.scale.set(1.32, 1, 0.66);
    plat.position.y = -0.14;
    scene.add(plat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(10.2, 0.08, 8, 128), new THREE.MeshBasicMaterial({ color: 0x19e6ff }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.32, 0.66, 1);
    rim.position.y = 0.02;
    scene.add(rim);
    const sigil = new THREE.Mesh(new THREE.CircleGeometry(9.6, 96), new THREE.MeshBasicMaterial({
      map: tex(sigilCanvas()), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sigil.rotation.x = -Math.PI / 2;
    sigil.scale.set(1.32, 0.66, 1);   // circle lies in XY before the flip: y ends up on world z
    sigil.position.y = 0.03;
    const sigilHolder = new THREE.Group();
    sigilHolder.add(sigil);
    scene.add(sigilHolder);
    // obelisks around the back half of the platform
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      const x = Math.cos(a) * 15, z = Math.sin(a) * 8.5 - 1;
      const ob = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5 + (i % 2) * 2, 0.7), new THREE.MeshStandardMaterial({ color: 0x100a22, metalness: 0.9, roughness: 0.3 }));
      ob.position.set(x, ob.geometry.parameters.height / 2, z);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, ob.geometry.parameters.height * 0.8, 0.74), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3cf2 : 0x19e6ff }));
      strip.position.copy(ob.position);
      const tip = M.glow(i % 2 ? 0xff3cf2 : 0x19e6ff, 2.4, 0.6);
      tip.position.set(x, ob.geometry.parameters.height + 0.4, z);
      scene.add(ob, strip, tip);
    }
    // embers drifting up
    const embers = [];
    for (let i = 0; i < 50; i++) {
      const s = M.glow(i % 3 ? 0xff3cf2 : 0x19e6ff, rand(0.1, 0.28), rand(0.3, 0.7));
      s.position.set(rand(-22, 22), rand(0, 12), rand(-12, 6));
      s.userData.v = rand(0.3, 1);
      scene.add(s);
      embers.push(s);
    }

    // empty-slot markers for the formation view
    const slotMarks = SLOTS.map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 6), new THREE.MeshBasicMaterial({
        color: 0x19e6ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      return m;
    });

    // ------------------------------------------------------------- fx
    const sparks = [];
    for (let i = 0; i < 320; i++) {
      const s = M.glow(0xffffff, 0.3, 0);
      s.visible = false;
      scene.add(s);
      sparks.push({ s, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 6 });
    }
    let sparkNext = 0;
    function spark(x, y, z, color, n, speed, life, grav) {
      for (let i = 0; i < n; i++) {
        const p = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % sparks.length;
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const sp = speed * (0.3 + Math.random() * 0.7);
        p.s.visible = true;
        p.s.position.set(x, y, z);
        p.s.material.color.setHex(color);
        const sc = 0.18 + Math.random() * 0.3;
        p.s.scale.set(sc, sc, 1);
        p.vx = r * Math.cos(th) * sp;
        p.vy = Math.abs(u) * sp + 0.8;
        p.vz = r * Math.sin(th) * sp;
        p.life = p.max = (life || 0.6) * (0.6 + Math.random() * 0.6);
        p.grav = grav === undefined ? 6 : grav;
      }
    }
    const ringPool = Array.from({ length: 16 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      return { m, life: 0, max: 1, size: 1 };
    });
    let ringNext = 0;
    function ring(x, z, color, size, dur) {
      const r = ringPool[ringNext];
      ringNext = (ringNext + 1) % ringPool.length;
      r.m.visible = true;
      r.m.material.color.setHex(color);
      r.m.position.set(x, 0.08, z);
      r.life = r.max = dur || 0.6;
      r.size = size;
    }
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const beamPool = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      return { m, life: 0, max: 1, w: 0.2 };
    });
    let beamNext = 0;
    const UP = new THREE.Vector3(0, 1, 0), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    function beam(ax, ay, az, bx, by, bz, color, width, dur) {
      const b = beamPool[beamNext];
      beamNext = (beamNext + 1) % beamPool.length;
      tmpA.set(ax, ay, az);
      tmpB.set(bx, by, bz).sub(tmpA);
      const len = tmpB.length() || 0.01;
      b.m.position.copy(tmpA).addScaledVector(tmpB, 0.5);
      b.m.quaternion.setFromUnitVectors(UP, tmpB.normalize());
      b.m.scale.set(width, len, width);
      b.m.material.color.setHex(color);
      b.m.visible = true;
      b.life = b.max = dur || 0.35;
      b.w = width;
    }
    const slashGeo = new THREE.TorusGeometry(0.85, 0.06, 6, 24, Math.PI);
    const slashPool = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false;
      scene.add(m);
      return { m, life: 0, max: 1, spin: 0 };
    });
    let slashNext = 0;
    function slash(x, y, z, color, big) {
      const s = slashPool[slashNext];
      slashNext = (slashNext + 1) % slashPool.length;
      s.m.position.set(x, y, z);
      s.m.rotation.set(rand(-0.6, 0.6), rand(0, Math.PI * 2), rand(-1, 1));
      s.m.material.color.setHex(color);
      s.m.scale.setScalar(big ? 2.2 : 1);
      s.m.visible = true;
      s.life = s.max = big ? 0.5 : 0.25;
      s.spin = big ? 14 : 8;
    }
    const shots = [];
    const shotGeo = new THREE.SphereGeometry(0.13, 10, 8);
    function shot(from, to, color, onHit, opts) {
      const o = opts || {};
      const core = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const g = M.glow(color, o.size || 1.1, 0.95);
      core.add(g);
      core.position.set(o.fromX !== undefined ? o.fromX : from.x, o.fromY !== undefined ? o.fromY : 1.2, o.fromZ !== undefined ? o.fromZ : from.z);
      scene.add(core);
      shots.push({ core, to, color, onHit, speed: o.speed || 22, trailT: 0, drop: !!o.drop, delay: o.delay || 0, tx: to.x, tz: to.z });
    }

    // camera framing per view (tuned so the DOM panels don't cover the fight)
    const VIEWS = {
      hub: { pos: [0, 12.5, 25], look: [0, -1.6, 0] },
      form: { pos: [0, 15, 24], look: [0, -1.8, 0.5] },
    };
    const proj = new THREE.Vector3();
    let hostW = 1, hostH = 1;
    function toScreen(x, y, z) {
      proj.set(x, y, z).project(camera);
      return [((proj.x + 1) / 2) * hostW, ((1 - proj.y) / 2) * hostH];
    }

    const prog = {
      scene, camera, host, toScreen,
      exposure: 1.6,   // the stage3d default (1.35) looked too dark for the RPG
      fx: { spark, ring, beam, slash, shot, flash(x, z, color, k) { flashL.position.set(x, 3, z); flashL.color.setHex(color); flashL.intensity = k; } },
      slotMarks,
      update(dt) {
        hostW = host.clientWidth || 1;
        hostH = host.clientHeight || 1;
        const v = VIEWS[W.mode] || VIEWS.hub;
        const k = Math.max(1, 1.45 / camera.aspect);   // back off on narrow screens
        const ease = W.snapCam ? 1 : Math.min(1, dt * 3);
        W.snapCam = false;
        W.camPos.lerp(tmpA.set(v.pos[0], v.pos[1] * k, v.pos[2] * k), ease);
        W.camLook.lerp(tmpB.set(v.look[0], v.look[1], v.look[2]), ease);
        camera.position.copy(W.camPos);
        if (W.shake > 0) {
          camera.position.x += rand(-1, 1) * W.shake * 0.25;
          camera.position.y += rand(-1, 1) * W.shake * 0.25;
          W.shake = Math.max(0, W.shake - dt * 3);
        }
        camera.lookAt(W.camLook);
        camera.updateMatrixWorld();

        tick(dt);

        sigilHolder.rotation.y += dt * 0.05;
        for (const e of embers) {
          e.position.y += e.userData.v * dt;
          if (e.position.y > 13) e.position.y = 0;
        }
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
        for (const r of ringPool) {
          if (r.life <= 0) continue;
          r.life -= dt;
          if (r.life <= 0) { r.m.visible = false; continue; }
          const q = 1 - r.life / r.max;
          const s = lerp(0.2, r.size, 1 - Math.pow(1 - q, 3));
          r.m.scale.set(s, s, 1);
          r.m.material.opacity = (1 - q) * 0.9;
        }
        for (const b of beamPool) {
          if (b.life <= 0) continue;
          b.life -= dt;
          if (b.life <= 0) { b.m.visible = false; continue; }
          const q = b.life / b.max;
          b.m.material.opacity = q;
          b.m.scale.x = b.m.scale.z = b.w * (0.4 + q * 0.6);
        }
        for (const s of slashPool) {
          if (s.life <= 0) continue;
          s.life -= dt;
          if (s.life <= 0) { s.m.visible = false; continue; }
          s.m.rotation.z += dt * s.spin;
          s.m.material.opacity = s.life / s.max;
        }
        flashL.intensity = Math.max(0, flashL.intensity - dt * 10);
        placeBars();
      },
    };

    // projectiles move inside the simulation step (they respect battle speed)
    prog.stepShots = (dt) => {
      for (let i = shots.length - 1; i >= 0; i--) {
        const p = shots[i];
        if (p.delay > 0) { p.delay -= dt; p.core.visible = false; continue; }
        p.core.visible = true;
        if (p.to && p.to.alive) { p.tx = p.to.x; p.tz = p.to.z; }
        const ty = p.drop ? 0.9 : 1.05;
        const dx = p.tx - p.core.position.x, dy = ty - p.core.position.y, dz = p.tz - p.core.position.z;
        const d = Math.hypot(dx, dy, dz);
        const step = p.speed * dt;
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.03;
          spark(p.core.position.x, p.core.position.y, p.core.position.z, p.color, 1, 0.5, 0.3, 0);
        }
        if (d <= step || d < 0.3) {
          scene.remove(p.core);
          p.core.material.dispose();
          p.core.children[0].material.dispose();
          shots.splice(i, 1);
          spark(p.tx, ty, p.tz, p.color, 6, 3, 0.35);
          if (p.onHit) p.onHit();
          continue;
        }
        p.core.position.x += (dx / d) * step;
        p.core.position.y += (dy / d) * step;
        p.core.position.z += (dz / d) * step;
      }
    };
    prog.clearShots = () => {
      shots.forEach((p) => scene.remove(p.core));
      shots.length = 0;
    };
    return prog;
  }

  // ================================================================ units
  // Hub (idle farm) and formation preview only — the real fights happen in js/rpg-kampf.js.
  const barsEl = () => $('rpg-bars');

  function makeUnit(spec, side) {
    const hero = spec.virus ? null : HERO[spec.id];
    const s = hero ? heroStats(spec.id, spec.lvl, spec.stars) : { hp: spec.hp, atk: 1, armor: 0, rate: 1.3, range: 1.7, move: 2.2 };
    const model = hero ? D.makeHeroModel(hero, { boss: spec.boss }) : D.makeVirusModel(0xff2a4d);
    const base = spec.boss ? 1.6 : 1;
    model.group.scale.setScalar(base);
    const root = new THREE.Group();
    root.add(model.group);
    const col = side ? 0xff2a4d : 0x19e6ff;
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 40), new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.05;
    ringMesh.scale.setScalar(base);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    shadow.scale.setScalar(base);
    root.add(ringMesh, shadow);
    let x, z;
    if (spec.x !== undefined) { x = spec.x; z = spec.z; }
    else { [x, z] = SLOTS[spec.slot || 0]; if (side) x = -x; }
    const u = {
      spec, hero, side, slot: spec.slot || 0, virus: !!spec.virus, boss: !!spec.boss, lvl: spec.lvl || 1, base,
      color: hero ? hero.look.glow : 0xff2a4d,
      maxHp: s.hp, hp: s.hp, atk: s.atk, rate: s.rate, range: s.range, move: s.move,
      ranged: hero ? CLASSES[hero.cls].ranged : false,
      x, z, homeX: x, homeZ: z, yaw: side ? Math.PI + 0.5 : -0.5,
      cd: rand(0.3, 1.1), alive: true, target: null, retarget: 0, lunge: 0, dead: 0, bob: rand(0, 6),
      root, model, ringMesh, bar: null,
    };
    root.position.set(x, 0, z);
    arena.scene.add(root);
    if (!u.virus) makeBar(u);
    return u;
  }

  function makeBar(u) {
    const el = document.createElement('div');
    el.className = 'ub ' + (u.side ? 'foe' : 'ally') + (u.boss ? ' boss' : '');
    el.innerHTML = `<span class="ub-lv">${u.boss ? '☠' : u.lvl}</span><span class="ub-bars"><i class="ub-hp"><b></b></i></span>`;
    barsEl().appendChild(el);
    u.bar = { el, hp: el.querySelector('.ub-hp b') };
  }

  function removeUnit(u) {
    arena.scene.remove(u.root);
    if (u.bar) u.bar.el.remove();
    u.bar = null;
  }

  function clearUnits() {
    W.units.forEach(removeUnit);
    W.units = [];
    if (arena) arena.clearShots();
    barsEl().innerHTML = '';
    $('rpg-pops').innerHTML = '';
  }

  function placeBars() {
    for (const u of W.units) {
      if (!u.bar) continue;
      const [sx, sy] = arena.toScreen(u.x, 1.95 * u.base + (u.boss ? 0.3 : 0), u.z);
      u.bar.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      u.bar.hp.style.width = (100 * Math.max(0, u.hp) / u.maxHp).toFixed(1) + '%';
    }
  }

  // floating loot pops over the idle highway (u, v = position as a fraction of the view)
  let popCount = 0;
  function hubPop(u, v, text, cls) {
    const host = $('rpg-canvas');
    if (popCount > 18 || !host.clientWidth) return;
    const el = document.createElement('div');
    el.className = 'rp-pop ' + (cls || '');
    el.textContent = text;
    el.style.left = (u * host.clientWidth).toFixed(0) + 'px';
    el.style.top = (v * host.clientHeight).toFixed(0) + 'px';
    $('rpg-pops').appendChild(el);
    popCount++;
    setTimeout(() => { el.remove(); popCount--; }, 950);
  }

  const angWrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  function animUnit(u, dt) {
    u.bob += dt;
    const fx = u.faceX !== undefined ? u.faceX : (u.side ? -1 : 1), fz = (u.faceZ || 0) + 0.55;   // turn a bit toward the camera
    u.yaw += angWrap(Math.atan2(-fz, fx) - u.yaw) * Math.min(1, dt * 8);
    u.model.face.rotation.y = u.yaw;
    u.lunge = Math.max(0, u.lunge - dt * 5);
    const lx = (u.faceX || 0) * Math.sin(u.lunge * Math.PI) * 0.6, lz = (u.faceZ || 0) * Math.sin(u.lunge * Math.PI) * 0.6;
    if (!u.alive) {
      u.dead = Math.min(1, u.dead + dt * 2.2);
      u.model.group.scale.setScalar(u.base * (1 - u.dead));
      u.ringMesh.material.opacity = 0.75 * (1 - u.dead);
      if (u.dead >= 1) u.root.visible = false;
    } else {
      u.model.group.position.set(lx, 0.95 * u.base + Math.sin(u.bob * 2.2) * 0.07, lz);
    }
    u.model.flash(0);
    u.model.update(dt, W.t + u.bob);
    u.root.position.set(u.x, 0, u.z);
  }

  function tick(dt) {
    W.t += dt;
    for (const u of W.units) animUnit(u, dt);
  }

  // =========================================================== thumbnails
  const thumbs = {};
  function portraitProgram(id) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.3, 3.7);
    camera.lookAt(0, 0.12, 0);
    const h = HERO[id];
    scene.add(new THREE.AmbientLight(0x8a7aff, 0.7));
    const key = new THREE.PointLight(0xffffff, 1.6, 20); key.position.set(2.5, 3, 4);
    const rimL = new THREE.PointLight(FACTIONS[h.faction].color, 2.4, 20); rimL.position.set(-3, 1.5, -2);
    scene.add(key, rimL);
    const m = D.makeHeroModel(h);
    m.face.rotation.y = -0.9;
    m.update(0.016, 1.3);
    scene.add(m.group);
    return { scene, camera, update() {} };
  }
  function thumb(id) {
    if (!thumbs[id]) thumbs[id] = S3.snapshot(portraitProgram(id), 180, 180);
    return thumbs[id];
  }
  const relicThumbs = {};
  function relicThumb(id) {
    if (relicThumbs[id]) return relicThumbs[id];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.25, 2.3);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0x8a7aff, 0.8));
    const key = new THREE.PointLight(0xffffff, 1.6, 20); key.position.set(2, 2.5, 3);
    scene.add(key);
    const m = D.makeRelicModel(HERO[id]);
    m.update(0.4, 0.9);
    scene.add(m.group);
    relicThumbs[id] = S3.snapshot({ scene, camera, update() {} }, 120, 120);
    return relicThumbs[id];
  }
  // rarity letter badge (C … HR)
  const rarBadge = (id) => `<span class="rar-badge r-${HERO[id].rarity}">${HERO[id].rarity}</span>`;
  const rarColor = (id) => RARITIES[HERO[id].rarity].color;
  const revealRank = (id) => Math.min(5, Math.round((RARITIES[HERO[id].rarity].rank * 5) / 7));

  // =========================================================== showcase
  let showcase = null;
  function makeShowcase() {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07041a, 14, 40);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    camera.position.set(0, 3.2, 12.5);
    camera.lookAt(0, 1.2, 0);
    scene.add(new THREE.AmbientLight(0x6a5aff, 0.55));
    const key = new THREE.PointLight(0xffffff, 1.8, 30); key.position.set(3, 5, 6);
    const rimL = new THREE.PointLight(0xff3cf2, 3, 30); rimL.position.set(-4, 3, -3);
    const under = new THREE.PointLight(0x19e6ff, 2, 10); under.position.set(0, 0.2, 2);
    scene.add(key, rimL, under);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.MeshBasicMaterial({ map: tex(skyCanvas()), side: THREE.BackSide, fog: false }));
    sky.position.y = -10;
    scene.add(sky);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({
      color: 0x0a0822, emissive: 0xffffff, emissiveMap: tex(groundCanvas(), [4, 4]), emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.4,
    }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const pedGeo = new THREE.CylinderGeometry(1.5, 1.7, 0.4, 6);
    const ped = new THREE.Mesh(pedGeo, new THREE.MeshStandardMaterial({ color: 0x141030, metalness: 0.9, roughness: 0.25 }));
    ped.position.y = 0.2;
    const pedEdges = new THREE.LineSegments(new THREE.EdgesGeometry(pedGeo), new THREE.LineBasicMaterial({ color: 0x19e6ff }));
    pedEdges.position.y = 0.2;
    const pedRing = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.02, 64), new THREE.MeshBasicMaterial({
      color: 0xff3cf2, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    pedRing.rotation.x = -Math.PI / 2;
    pedRing.position.y = 0.03;
    const beamM = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 7, 32, 1, true), new THREE.MeshBasicMaterial({
      color: 0x19e6ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    beamM.position.y = 3.8;
    scene.add(ped, pedEdges, pedRing, beamM);
    const motes = [];
    for (let i = 0; i < 40; i++) {
      const s = M.glow(i % 2 ? 0x19e6ff : 0xff3cf2, rand(0.08, 0.2), 0.8);
      s.position.set(rand(-1.4, 1.4), rand(0.3, 5), rand(-1.4, 1.4));
      scene.add(s);
      motes.push(s);
    }
    const holder = new THREE.Group();
    holder.position.y = 1.55;
    scene.add(holder);
    const relicHolder = new THREE.Group();   // the signature relic orbits the hero once unlocked
    scene.add(relicHolder);
    let model = null, relic = null, t = 0;
    return {
      scene, camera,
      setHero(id, relicOn) {
        if (model) holder.remove(model.group);
        const h = HERO[id];
        model = D.makeHeroModel(h);
        model.group.scale.setScalar(1.45);
        holder.add(model.group);
        if (relic) relicHolder.remove(relic.group);
        relic = relicOn ? D.makeRelicModel(h) : null;
        if (relic) { relic.group.scale.setScalar(1.05); relicHolder.add(relic.group); }
        const fc = FACTIONS[h.faction].color;
        rimL.color.setHex(fc);
        pedRing.material.color.setHex(fc);
        beamM.material.color.setHex(h.look.glow);
      },
      update(dt) {
        t += dt;
        const host = $('rpg-canvas');
        const w = host.clientWidth || 1, hgt = host.clientHeight || 1;
        // push the pedestal into the free area left of the detail panel
        const narrow = w < 860;
        camera.setViewOffset(w, hgt, narrow ? 0 : w * 0.14, narrow ? hgt * 0.02 : hgt * 0.17, w, hgt);
        holder.rotation.y += dt * 0.45;
        holder.position.y = 1.55 + Math.sin(t * 1.5) * 0.08;
        if (model) { model.face.rotation.y = -0.4; model.update(dt, t); model.flash(0); }
        if (relic) {
          relicHolder.position.set(Math.cos(t * 0.8) * 2.1, 2.45 + Math.sin(t * 2) * 0.12, Math.sin(t * 0.8) * 1.2);
          relic.update(dt, t);
        }
        pedRing.rotation.z += dt * 0.4;
        for (const s of motes) { s.position.y += dt * 0.5; if (s.position.y > 5) s.position.y = 0.3; }
      },
    };
  }

  // ================================================================= views
  let view = 'none';
  let afkTimer = 0;
  const form = { pick: [], filter: 'all' };

  function mountArena() {
    if (!arena) arena = makeArena();
    S3.mount($('rpg-canvas'), arena);
  }

  // the idle screen: your team on the NEON RUN highway (js/rpg-idle.js)
  let idle = null, idleTeam = '', runTick = 0;
  function mountIdle() {
    if (!idle) {
      idle = NEON.rpgIdle.create({
        gateLabel: () => 'SECTOR ' + stageLabel(state().stage),
        onKill(kind, [u, v]) {
          if (kind !== 'virus' || Math.random() < 0.35) hubPop(u, v, kind === 'boss' ? '+◈◈◈' : '+◈', kind === 'boss' ? 'boss loot' : 'loot');
        },
        onBanner(text, danger) { runBanner(text, danger); },
        onTick(dist, kills) {
          runTick -= 1;
          if (runTick > 0) return;
          runTick = 12;
          $('run-dist').textContent = (dist / 1000).toFixed(2) + ' KM';
          $('run-kills').textContent = fmt(kills);
        },
      });
    }
    const key = state().team.join(',');
    if (key !== idleTeam) { idleTeam = key; idle.setTeam(teamSpecs(state().team)); }
    S3.mount($('rpg-canvas'), idle);
  }
  let bannerT = 0;
  function runBanner(text, danger) {
    const el = $('run-banner');
    el.textContent = text;
    el.classList.toggle('danger', !!danger);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function setWorld(mode) {
    clearUnits();
    W.mode = mode;
    W.t = 0;
    W.shake = 0;
    W.snapCam = true;
    arena.slotMarks.forEach((m) => { m.visible = false; });
    if (mode === 'form') buildFormUnits();
  }

  // formation preview: your 4 heroes against the stage boss and its first-wave escort
  function buildFormUnits() {
    clearUnits();
    const mine = arrange(teamSpecs(form.pick));
    mine.forEach((s) => W.units.push(makeUnit(s, 0)));
    const plan = stagePlan(state().stage);
    W.units.push(makeUnit(Object.assign({ boss: true, x: 5.4, z: 0 }, plan.boss), 1));
    plan.waves[0].filter((e) => e.kind === 'hero').slice(0, 2)
      .forEach((e, i) => W.units.push(makeUnit(Object.assign({ x: 9.2, z: i ? 3 : -3 }, e), 1)));
    const used = mine.map((s) => s.slot);
    arena.slotMarks.forEach((m, i) => {
      m.visible = !used.includes(i);
      m.position.set(SLOTS[i][0], 0.06, SLOTS[i][1]);
    });
  }

  function showView(v) {
    view = v;
    ['hub', 'form', 'heroes'].forEach((k) => $('rpg-' + k).classList.toggle('hidden', k !== v));
    $('screen-rpg').dataset.view = v;
    const titles = { hub: 'NEURAL ARENA', form: 'FORMATION', heroes: 'HEROES' };
    $('rpg-title').textContent = titles[v];
    clearInterval(afkTimer);
    if (v === 'heroes') {
      clearUnits();
      W.mode = 'none';
      if (!showcase) showcase = makeShowcase();
      S3.mount($('rpg-canvas'), showcase);
      renderHeroes();
      return;
    }
    if (v === 'hub') {
      clearUnits();
      W.mode = 'none';
      mountIdle();
      renderHub();
      afkTimer = setInterval(renderAfk, 1000);
      return;
    }
    mountArena();
    setWorld(v);
    renderForm();
  }

  function renderWallet() {
    const r = state();
    $('rpg-xp').textContent = fmt(r.xp);
    $('rpg-crates').textContent = r.crates;
    $('rpg-dust').textContent = fmt(r.stardust);
  }

  // ------------------------------------------------------------------ hub
  function afkPending() {
    const r = state();
    const rates = afkRates(r.stage - 1);
    const minutes = Math.min(AFK_CAP_MIN, Math.max(0, (Date.now() - r.afkSince) / 60000));
    const coinsRaw = minutes * rates.coins * P.perks.coinMult() + r.coinFrac;
    const xpRaw = minutes * rates.xp + r.xpFrac;
    return {
      minutes, rates, coinsRaw, xpRaw,
      coins: Math.floor(coinsRaw), xp: Math.floor(xpRaw),
      crates: Math.floor((r.crateProg + minutes) / rates.crateEvery),
      boxes: Math.floor((r.boxProg + minutes) / rates.boxEvery),
      crateFrac: ((r.crateProg + minutes) % rates.crateEvery) / rates.crateEvery,
    };
  }

  function renderAfk() {
    const p = afkPending();
    const h = Math.floor(p.minutes / 60), m = Math.floor(p.minutes % 60);
    $('afk-time').textContent = h + 'h ' + String(m).padStart(2, '0') + 'm';
    $('afk-fill').style.width = (100 * p.minutes / AFK_CAP_MIN).toFixed(1) + '%';
    $('afk-coins').textContent = fmt(p.coins);
    $('afk-xp').textContent = fmt(p.xp);
    $('afk-crates').textContent = p.crates;
    $('afk-crate-prog').style.width = (p.crateFrac * 100).toFixed(1) + '%';
    $('afk-boxes').textContent = p.boxes;
    $('afk-rate').textContent = '+' + (p.rates.coins * P.perks.coinMult()).toFixed(1) + ' coins · +' + p.rates.xp.toFixed(1) + ' XP per min · crate every ' +
      Math.round(p.rates.crateEvery) + ' min';
    $('afk-chest').classList.toggle('full', p.minutes >= AFK_CAP_MIN);
    $('afk-chest').classList.toggle('ready', p.coins > 0 || p.xp > 0);
  }

  function renderHub() {
    const r = state();
    renderWallet();
    renderAfk();
    const foe = planPower(stagePlan(r.stage));
    const mine = r.team.reduce((s, id) => s + heroPower(id), 0);
    $('hub-stage').textContent = 'SECTOR ' + stageLabel(r.stage);
    $('hub-power').textContent = fmt(mine);
    $('battle-stage').textContent = stageLabel(r.stage) + (r.stage % 10 === 0 ? ' · MEGA BOSS' : '');
    $('battle-power').textContent = fmt(foe);
    $('rpg-battle-btn').classList.toggle('risky', foe > mine * 1.15);
    $('crate-count').textContent = r.crates;
    $('rpg-crates-btn').classList.toggle('has', r.crates > 0);
  }

  function collectAfk() {
    const r = state();
    const p = afkPending();
    if (p.coins < 1 && p.xp < 1 && !p.crates && !p.boxes) {
      toast('NOTHING TO COLLECT YET — COME BACK LATER');
      play('error');
      return;
    }
    r.coinFrac = p.coinsRaw - p.coins;
    r.xpFrac = p.xpRaw - p.xp;
    r.crateProg = r.crateProg + p.minutes - p.crates * p.rates.crateEvery;
    r.boxProg = r.boxProg + p.minutes - p.boxes * p.rates.boxEvery;
    r.afkSince = Date.now();
    r.xp += p.xp;
    r.crates += p.crates;
    commit();
    if (p.coins) P.addCoins(p.coins);
    if (p.boxes) P.addFreeBoxes(p.boxes);
    play('coin');
    play(p.crates || p.boxes ? 'jackpot' : 'win');
    if (idle) idle.collect();
    const chips = [
      `<div class="lt coin"><i class="coin-icon"></i><b>+${fmt(p.coins)}</b><span>COINS</span></div>`,
      `<div class="lt xp"><i class="xp-icon"></i><b>+${fmt(p.xp)}</b><span>HERO XP</span></div>`,
    ];
    if (p.crates) chips.push(`<div class="lt crate"><i class="crate-icon"></i><b>+${p.crates}</b><span>HERO CRATE${p.crates > 1 ? 'S' : ''}</span></div>`);
    if (p.boxes) chips.push(`<div class="lt box"><i class="dbox-icon"></i><b>+${p.boxes}</b><span>DATA BOX${p.boxes > 1 ? 'ES' : ''}</span></div>`);
    const buttons = [];
    if (P.freeBoxes && NEON.lottery && NEON.lottery.openFreeBox) buttons.push({ label: 'OPEN DATA BOX', cls: 'gold', fn: openDataBox });
    if (r.crates) buttons.push({ label: 'OPEN HERO CRATE', cls: 'alt', fn: () => openCrates(1) });
    buttons.push({ label: 'NICE', cls: '', fn: closeReveal });
    showReveal({
      kicker: '// ' + Math.floor(p.minutes / 60) + 'h ' + String(Math.floor(p.minutes % 60)).padStart(2, '0') + 'm OF AFK FARMING //',
      title: 'LOOT COLLECTED',
      html: `<div class="loot-row">${chips.join('')}</div>`,
      buttons,
      color: '#ffc933',
    });
    renderHub();
  }

  function openDataBox() {
    closeReveal();
    const ok = NEON.lottery.openFreeBox(() => {
      // the box stage borrowed the 3D renderer: hand it back
      if (!$('screen-rpg').classList.contains('hidden')) showView(view === 'heroes' ? 'heroes' : 'hub');
    });
    if (!ok) play('error');
  }

  // ---------------------------------------------------------------- pulls
  // Hero Crates and Data Boxes (js/lotterie.js) roll a rarity first, then a hero of that
  // rarity. LUCKY ALGORITHM (skill tree) makes S and above more likely.
  const pullWeight = (k) => RARITIES[k].weight * (RARITIES[k].rank >= 4 ? P.perks.lootRareMult() : 1);
  function rollHero() {
    const tiers = RARITY_ORDER.filter((k) => HEROES.some((h) => h.rarity === k));
    const total = tiers.reduce((s, k) => s + pullWeight(k), 0);
    let x = Math.random() * total, tier = tiers[0];
    for (const k of tiers) { x -= pullWeight(k); if (x <= 0) { tier = k; break; } }
    const pool = HEROES.filter((h) => h.rarity === tier);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // a new hero joins the roster; a copy of one you already own turns into stardust
  function grantHero(def) {
    const r = state();
    const own = r.heroes[def.id];
    const out = { type: 'hero', id: def.id, def, rar: RARITIES[def.rarity], isNew: !own, dust: 0 };
    if (!own) {
      r.heroes[def.id] = { lvl: 1, stars: 1, copies: 0 };
      if (r.team.length < TEAM_SIZE) r.team.push(def.id);
    } else {
      out.dust = RARITIES[def.rarity].dust;
      r.stardust += out.dust;
    }
    return out;
  }
  function pullHero() {
    const out = grantHero(rollHero());
    commit();
    return out;
  }

  const ratesLine = () => '<div class="rv-rates">RATES ' + RARITY_ORDER.map((k) =>
    `<span class="r-${k}">${k} ${RARITIES[k].weight}%</span>`).join('') + '</div>';
  const pullNote = (p) => (p.isNew ? '<div class="rv-new">NEW HERO!</div>'
    : `<div class="rv-dupe">COPY &rarr; <i class="dust-icon"></i> +${p.dust} STARDUST <span>(${fmt(state().stardust)} total)</span></div>`);

  // --------------------------------------------------------------- crates
  function openCrates(n) {
    const r = state();
    if (r.crates <= 0) { toast('NO HERO CRATES — FARM AFK, CLEAR EVERY 5TH STAGE OR OPEN DATA BOXES'); play('error'); return; }
    const count = Math.min(n, r.crates);
    r.crates -= count;
    const pulls = [];
    for (let i = 0; i < count; i++) pulls.push(grantHero(rollHero()));
    commit();
    play('boxOpen');
    const best = pulls.reduce((b, p) => (!b || p.rar.rank > b.rar.rank ? p : b), null);
    setTimeout(() => play('reveal', revealRank(best.id)), 250);
    if (count === 1) revealHero(pulls[0]);
    else revealMany(pulls, best);
    renderWallet();
  }

  function crateButtons() {
    const r = state();
    return [
      r.crates ? { label: 'OPEN NEXT (' + r.crates + ')', cls: 'alt', fn: () => openCrates(1) } : null,
      r.crates > 1 ? { label: 'OPEN ×' + Math.min(10, r.crates), cls: 'gold', fn: () => openCrates(10) } : null,
      { label: 'DONE', cls: '', fn: () => { closeReveal(); if (view === 'hub') renderHub(); if (view === 'heroes') renderHeroes(); } },
    ].filter(Boolean);
  }

  function revealHero(p) {
    const h = p.def, rar = p.rar;
    const f = FACTIONS[h.faction], c = CLASSES[h.cls];
    const s = heroStats(h.id, 1, 1);
    showReveal({
      kicker: '// HERO CRATE //',
      title: '',
      color: rar.color,
      html: `<div class="rv-hero r-${h.rarity}" style="--rc:${rar.color};--fc:${css(f.color)}">` +
        `<div class="rv-img"><img alt="" src="${thumb(h.id)}"></div>` +
        `<div class="rv-rarity">${rarBadge(h.id)} ${rar.name}</div><div class="rv-name">${h.name}</div>` +
        `<div class="rv-tags"><span class="tag fac" style="--c:${css(f.color)}">${f.icon}${f.name}</span><span class="tag">${c.icon}${c.name}</span>` +
        `<span class="tag move ${h.move}">${h.move === 'pierce' ? '➤ PIERCE' : '⟲ BOUNCE'}</span><span class="tag spd">SPD ${s.spd}</span></div>` +
        pullNote(p) + '</div>' + ratesLine(),
      buttons: crateButtons(),
    });
  }

  function revealMany(pulls, best) {
    const cards = pulls.map((p) =>
      `<div class="rv-mini r-${p.def.rarity}${p === best ? ' best' : ''}" style="--rc:${p.rar.color}">` +
      `<img alt="" src="${thumb(p.id)}">${rarBadge(p.id)}<b>${p.def.name}</b>` +
      (p.isNew ? '<em class="new">NEW!</em>' : `<em><i class="dust-icon"></i>+${p.dust}</em>`) + '</div>').join('');
    const fresh = pulls.filter((p) => p.isNew).length, dust = pulls.reduce((s, p) => s + p.dust, 0);
    showReveal({
      kicker: '// ' + pulls.length + ' HERO CRATES //',
      title: fresh ? fresh + ' NEW HERO' + (fresh > 1 ? 'ES' : '') + '!' : 'CRATES OPENED',
      color: best.rar.color,
      html: `<div class="rv-grid">${cards}</div>` +
        `<div class="rv-dupe">COPIES &rarr; <i class="dust-icon"></i> +${fmt(dust)} STARDUST <span>(${fmt(state().stardust)} total)</span></div>` + ratesLine(),
      buttons: crateButtons(),
    });
  }

  // -------------------------------------------------------------- reveal
  function showReveal(o) {
    const el = $('rpg-reveal');
    el.style.setProperty('--rc', o.color || '#19e6ff');
    $('rv-kicker').textContent = o.kicker || '';
    $('rv-title').textContent = o.title || '';
    $('rv-title').classList.toggle('hidden', !o.title);
    $('rv-body').innerHTML = o.html || '';
    const bw = $('rv-buttons');
    bw.innerHTML = '';
    (o.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn small ' + (b.cls || '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => { play('click'); b.fn(); });
      bw.appendChild(btn);
    });
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  function closeReveal() { $('rpg-reveal').classList.add('hidden'); }

  let toastT = 0;
  function toast(text) {
    const el = $('rpg-toast');
    el.textContent = text;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  // ------------------------------------------------------------ formation
  function heroCard(id, extraCls) {
    const h = HERO[id], own = state().heroes[id];
    const f = FACTIONS[h.faction], c = CLASSES[h.cls];
    const sync = syncInfo(), linked = isSynced(id, sync), core = sync.level && sync.top.includes(id);
    return `<button class="hcard r-${h.rarity} ${extraCls || ''}" data-id="${id}" style="--rc:${rarColor(id)};--fc:${css(f.color)}" ` +
      `title="${h.name} · ${RARITIES[h.rarity].name} · ${h.move === 'pierce' ? 'PIERCE' : 'BOUNCE'} · SPD ${heroStats(id, effLvl(id, sync), own.stars).spd}">` +
      `<img alt="" src="${thumb(id)}">` +
      `<span class="hc-lv${linked ? ' linked' : ''}">${linked ? '⛓' : core ? '◆' : ''}LV.${effLvl(id, sync)}</span>` +
      `<span class="hc-fac" style="color:${css(f.color)}">${f.icon}</span>` +
      `<span class="hc-cls">${c.icon}</span>` + rarBadge(id) +
      `<span class="hc-stars">${'★'.repeat(own.stars)}</span>` +
      `<span class="hc-name">${h.name}</span>` +
      '<span class="hc-check">✓</span></button>';
  }

  function sortedOwned() {
    const r = state();
    return Object.keys(r.heroes).sort((a, b) => heroPower(b) - heroPower(a));
  }

  function renderForm() {
    const r = state();
    const ids = sortedOwned().filter((id) => form.filter === 'all' || HERO[id].faction === form.filter);
    $('form-roster').innerHTML = ids.map((id) => heroCard(id, form.pick.includes(id) ? 'picked' : '')).join('') ||
      '<div class="form-empty">No heroes of this faction yet.</div>';
    $('form-roster').querySelectorAll('.hcard').forEach((b) => b.addEventListener('click', () => togglePick(b.dataset.id)));
    $('form-filter').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.f === form.filter));
    const plan = stagePlan(r.stage);
    $('form-pw').textContent = fmt(form.pick.reduce((s, id) => s + heroPower(id), 0));
    $('form-pw-foe').textContent = fmt(planPower(plan));
    $('form-count').textContent = form.pick.length + ' / ' + TEAM_SIZE;
    $('form-stage').textContent = 'SECTOR ' + stageLabel(r.stage) + ' · 3 WAVES · BOSS: ' + HERO[plan.boss.id].name;
    $('rpg-begin').disabled = !form.pick.length;
    $('form-hint').innerHTML = factionHint(plan);
  }

  // a small tip: which of your factions hit this stage's heroes harder
  function factionHint(plan) {
    const foes = [];
    plan.waves.forEach((w) => w.forEach((e) => { if (e.kind !== 'virus') foes.push(HERO[e.id].faction); }));
    const counters = [...new Set(foes.map((f) => FACTION_ORDER.find((k) => FACTIONS[k].beats === f)))].filter(Boolean);
    if (!counters.length) return '';
    return 'COUNTER PICK: ' + counters.map((k) => `<b style="color:${css(FACTIONS[k].color)}">${FACTIONS[k].icon}${FACTIONS[k].name}</b>`).join(' ') + ' deal +25% damage here';
  }

  function togglePick(id) {
    const i = form.pick.indexOf(id);
    if (i >= 0) form.pick.splice(i, 1);
    else if (form.pick.length < TEAM_SIZE) form.pick.push(id);
    else { toast('THE TEAM IS FULL — TAP A HERO TO REMOVE IT'); play('error'); return; }
    play('click');
    buildFormUnits();
    renderForm();
  }

  function beginBattle() {
    if (!form.pick.length) return;
    const r = state();
    r.team = form.pick.slice();
    commit();
    launchBattle();
  }

  // everything the marble battle needs for the current campaign stage
  function battleOpts() {
    const r = state();
    return { stage: r.stage, label: stageLabel(r.stage), plan: stagePlan(r.stage), team: teamSpecs(r.team) };
  }

  // hand over to the marble battle on the main arena (js/rpg-kampf.js)
  function launchBattle() {
    if (!NEON.game.startMode || !NEON.marble) { toast('BATTLE ENGINE MISSING'); return; }
    play('start');
    leaveScreen();
    NEON.game.startMode('marble', battleOpts());
  }

  // called by js/rpg-kampf.js when a level ends; pays out and shows the result screen
  function battleDone(res) {
    open();
    const r = state();
    const stage = res.stage;
    let loot = '';
    if (res.win && stage === r.stage) {
      const rw = stageRewards(stage);
      const coins = Math.round(rw.coins * P.perks.coinMult());
      r.xp += rw.xp;
      if (rw.crate) r.crates++;
      r.stage++;
      commit();
      P.addCoins(coins);
      loot = `<div class="lt coin"><i class="coin-icon"></i><b>+${fmt(coins + (res.coins || 0))}</b><span>COINS</span></div>` +
        `<div class="lt xp"><i class="xp-icon"></i><b>+${fmt(rw.xp)}</b><span>HERO XP</span></div>` +
        (rw.crate ? '<div class="lt crate"><i class="crate-icon"></i><b>+1</b><span>HERO CRATE</span></div>' : '') +
        '<div class="lt up"><b>▲</b><span>AFK LOOT RATE UP</span></div>';
      play('clear');
    } else if (res.coins) {
      loot = `<div class="lt coin"><i class="coin-icon"></i><b>+${fmt(res.coins)}</b><span>COINS PICKED UP</span></div>`;
    }
    const top = Math.max(1, ...res.heroes.map((h) => h.dealt));
    const mvp = res.heroes.reduce((b, h) => (!b || h.dealt > b.dealt ? h : b), null);
    const meter = res.heroes.slice().sort((a, b) => b.dealt - a.dealt).map((h) =>
      `<div class="dm${h === mvp ? ' mvp' : ''}" style="--hc:${css(HERO[h.id].look.glow)}"><img alt="" src="${thumb(h.id)}">` +
      `<div class="dm-bars"><span class="dm-name">${HERO[h.id].name}${h === mvp ? ' <em>MVP</em>' : ''}</span>` +
      `<i><b style="width:${(100 * h.dealt / top).toFixed(1)}%"></b></i><span class="dm-num">${fmt(h.dealt)} DMG` +
      (h.healed ? ` · <span class="heal">${fmt(h.healed)} HEAL</span>` : '') + '</span></div></div>').join('');
    const el = $('rpg-result');
    el.className = 'rpg-result ' + (res.win ? 'win' : 'lose');
    $('res-kicker').textContent = 'SECTOR ' + stageLabel(stage) + ' · ' + res.turns + ' TURNS' + (res.win ? '' : ' · WAVE ' + res.wave + ' / 3');
    $('res-title').textContent = res.win ? 'VICTORY' : 'DEFEAT';
    $('res-title').dataset.text = res.win ? 'VICTORY' : 'DEFEAT';
    $('res-loot').innerHTML = loot + (res.win ? '' : '<div class="res-tip">Level up and ascend your heroes, bring a healer or a shield, ' +
      'bank shots off the walls — or let the AFK loot pile up a little longer.</div>');
    $('res-meter').innerHTML = meter;
    $('res-next').textContent = res.win ? 'NEXT STAGE ›' : 'RETRY';
    el.classList.remove('hidden');
    renderHub();
  }

  // --------------------------------------------------------------- heroes
  let selHero = null;
  function renderHeroes() {
    const r = state();
    const ids = sortedOwned();
    if (!selHero || !r.heroes[selHero]) selHero = ids[0];
    const locked = HEROES.filter((h) => !r.heroes[h.id]);
    $('hero-roster').innerHTML = ids.map((id) => heroCard(id, (id === selHero ? 'sel ' : '') + (r.team.includes(id) ? 'inteam' : ''))).join('') +
      locked.map((h) => `<div class="hcard locked r-${h.rarity}" style="--rc:${rarColor(h.id)};--fc:${css(FACTIONS[h.faction].color)}" ` +
        `title="${RARITIES[h.rarity].name} hero — pull it from Hero Crates or Data Boxes">` +
        `<img alt="" src="${thumb(h.id)}">${rarBadge(h.id)}<span class="hc-name">???</span></div>`).join('');
    $('hero-roster').querySelectorAll('button.hcard').forEach((b) => b.addEventListener('click', () => {
      selHero = b.dataset.id;
      play('click');
      renderHeroes();
    }));
    $('hero-count').textContent = ids.length + ' / ' + HEROES.length;
    const sync = syncInfo();
    const weak = sync.weakest;
    $('hero-link').innerHTML = sync.level
      ? `NEURAL LINK <b>LV ${sync.level}</b> · all other heroes (⛓) match the weakest of your top 5 (◆)` +
        (weak && r.heroes[weak].lvl >= sync.floor ? ` — that is <b>${HERO[weak].name}</b>: level it up to raise everyone` : '') +
        (sync.floor ? ` · never below LV ${sync.floor} (your roster before the lootbox update)` : '')
      : `NEURAL LINK · own ${SYNC_SIZE + 1}+ heroes and the weakest of your ${SYNC_SIZE} highest sets the level of all others`;
    renderHeroDetail();
    if (showcase) showcase.setHero(selHero, effLvl(selHero, sync) >= RELIC_LVL);
  }

  function renderHeroDetail() {
    const r = state();
    const id = selHero, h = HERO[id], own = r.heroes[id];
    const f = FACTIONS[h.faction], c = CLASSES[h.cls], rar = RARITIES[h.rarity];
    const sync = syncInfo(), lvl = effLvl(id, sync), linked = isSynced(id, sync);
    const s = heroStats(id, lvl, own.stars);
    const cap = levelCap(own.stars);
    const next = lvl < cap ? heroStats(id, lvl + 1, own.stars) : null;
    const cost = lvlCost(lvl);
    const need = own.stars < MAX_STARS ? ASCEND_COPIES[own.stars] : 0;
    const ability = (sk) => {
      const on = lvl >= sk.lvl;
      return `<div class="hp-skill ab${on ? ' on' : ''}"><span class="label">${on ? 'ABILITY · UNLOCKED' : '🔒 UNLOCKS AT LEVEL ' + sk.lvl}</span>` +
        `<b>${sk.name}</b><p>${sk.desc}</p></div>`;
    };
    const relicOn = lvl >= RELIC_LVL;
    const relic = `<div class="hp-relic${relicOn ? ' on' : ''}"><img alt="" src="${relicThumb(id)}">` +
      `<div><span class="label">${relicOn ? 'SIGNATURE RELIC · ACTIVE' : '🔒 SIGNATURE RELIC · UNLOCKS AT LEVEL ' + RELIC_LVL}</span>` +
      `<b>${h.relic.name} ${rarBadge(id)}</b><p>${h.relic.desc}</p></div></div>`;
    const d = (a, b) => (b > a ? ` <em>+${fmt(b - a)}</em>` : '');
    const el = $('hero-panel');
    el.style.setProperty('--rc', rar.color);
    el.style.setProperty('--fc', css(f.color));
    el.innerHTML =
      `<div class="hp-tags">${rarBadge(id)}<span class="tag rar">${rar.name}</span><span class="tag fac" style="--c:${css(f.color)}">${f.icon}${f.name}</span>` +
      `<span class="tag">${c.icon}${c.name}</span><span class="tag move ${h.move === 'pierce' ? 'pierce' : 'bounce'}">${h.move === 'pierce' ? '➤ PIERCE' : '⟲ BOUNCE'}</span></div>` +
      `<h3 class="hp-name">${h.name}</h3>` +
      `<div class="hp-stars">${Array.from({ length: MAX_STARS }, (_, i) => `<i class="${i < own.stars ? 'on' : ''}">★</i>`).join('')}</div>` +
      `<p class="hp-tag">${h.tag}</p>` +
      `<div class="hp-level"><span>LEVEL</span><b>${lvl}</b><i>/ ${cap}</i>` +
      (linked ? '<em class="hp-link">⛓ NEURAL LINK</em>' : sync.level && sync.top.includes(id) ? '<em class="hp-link core">◆ LINK CORE</em>' : '') +
      `<span class="hp-power">POWER <b>${fmt(power(s))}</b></span></div>` +
      '<div class="hp-stats">' +
      `<div><span>HP</span><b>${fmt(s.hp)}${next ? d(s.hp, next.hp) : ''}</b></div>` +
      `<div><span>ATK</span><b>${fmt(s.atk)}${next ? d(s.atk, next.atk) : ''}</b></div>` +
      `<div><span>DEF</span><b>${fmt(s.armor)}${next ? d(s.armor, next.armor) : ''}</b></div>` +
      `<div class="spd ${h.move}"><span>SPD · ${h.move === 'pierce' ? '➤ PIERCE' : '⟲ BOUNCE'}</span><b>${s.spd}</b>` +
      `<i class="spd-bar"><b style="width:${Math.min(100, (100 * s.spd) / 800).toFixed(1)}%"></b></i></div></div>` +
      `<div class="hp-skill ult"><span class="label">HYPER · CHARGES IN ${h.hyper.charge} TURNS</span><b>${h.hyper.name}</b><p>${h.hyper.desc}</p></div>` +
      `<div class="hp-skill combo"><span class="label">COMBO · WHEN AN ALLY TOUCHES IT</span><b>${h.combo.name}</b><p>${h.combo.desc}</p></div>` +
      `<div class="hp-skill"><span class="label">PASSIVE · ${h.move === 'pierce' ? 'PIERCE — smashes through enemies' : 'BOUNCE — rebounds off enemies'}</span><b>${h.passive.name}</b><p>${h.passive.desc}</p></div>` +
      ability(h.skills[0]) + relic + ability(h.skills[1]) +
      '<div class="hp-actions">' +
      (lvl < cap
        ? `<button class="btn small" id="hp-lvl"><span>LEVEL UP</span><em><i class="xp-icon"></i>${fmt(cost.xp)} <i class="coin-icon"></i>${fmt(cost.coins)}</em></button>` +
          '<button class="btn small alt" id="hp-lvl10">×10</button>'
        : `<button class="btn small wide" disabled>${own.stars < MAX_STARS ? 'LEVEL CAP — ASCEND' : 'MAX LEVEL'}</button>`) +
      (need
        ? `<button class="btn small gold" id="hp-asc" ${own.copies >= need ? '' : 'disabled'}><span>ASCEND ★${own.stars + 1}</span><em>${own.copies} / ${need} COPIES</em></button>` +
          `<button class="btn small alt" id="hp-buy" ${r.stardust >= rar.copy ? '' : 'disabled'}><span>BUY COPY</span><em><i class="dust-icon"></i>${fmt(rar.copy)}</em></button>`
        : '<button class="btn small gold wide" disabled>★ MAX ASCENSION</button>') +
      '</div>' +
      `<div class="hp-foot">${r.team.includes(id) ? '<b>IN YOUR TEAM</b> · ' : ''}` +
      (linked ? 'Linked heroes get the NEURAL LINK level for free — leveling one further pulls it into the link core. ' : '') +
      `Copies of heroes you already own turn into <i class="dust-icon"></i> STARDUST (you have <b>${fmt(r.stardust)}</b>). ` +
      'Buy copies with it — ascending raises all stats by 22%, SPD by 3% and the level cap by 20.</div>';
    const lv = $('hp-lvl');
    if (lv) lv.addEventListener('click', () => levelUp(id, 1));
    const lv10 = $('hp-lvl10');
    if (lv10) lv10.addEventListener('click', () => levelUp(id, 10));
    const asc = $('hp-asc');
    if (asc) asc.addEventListener('click', () => ascend(id));
    const buy = $('hp-buy');
    if (buy) buy.addEventListener('click', () => buyCopy(id));
  }

  function levelUp(id, times) {
    const r = state(), own = r.heroes[id];
    // a linked hero starts from the NEURAL LINK level it already has
    const eff = effLvl(id);
    const hadRelic = eff >= RELIC_LVL;
    if (eff > own.lvl) own.lvl = Math.min(eff, levelCap(own.stars));
    let done = 0;
    for (let i = 0; i < times; i++) {
      if (own.lvl >= levelCap(own.stars)) break;
      const cost = lvlCost(own.lvl);
      if (r.xp < cost.xp || P.coins < cost.coins) break;
      r.xp -= cost.xp;
      P.spend(cost.coins);
      own.lvl++;
      done++;
    }
    if (!done) {
      toast(own.lvl >= levelCap(own.stars) ? 'LEVEL CAP REACHED — ASCEND FIRST' : 'NOT ENOUGH XP OR COINS — COLLECT YOUR AFK LOOT');
      play('error');
      return;
    }
    commit();
    play('levelUp');
    renderWallet();
    renderHeroes();
    toast(HERO[id].name + ' REACHED LEVEL ' + own.lvl);
    if (!hadRelic && effLvl(id) >= RELIC_LVL) revealRelic(id);
  }

  // level 30: the hero's signature relic unlocks by itself
  function revealRelic(id) {
    const h = HERO[id];
    play('jackpot');
    showReveal({
      kicker: '// LEVEL ' + RELIC_LVL + ' · ' + h.name + ' //',
      title: 'SIGNATURE RELIC',
      color: rarColor(id),
      html: `<div class="rv-hero rv-relic r-${h.rarity}" style="--rc:${rarColor(id)};--fc:${css(h.look.glow)}">` +
        `<div class="rv-img"><img alt="" src="${relicThumb(id)}"></div>` +
        `<div class="rv-name">${h.relic.name}</div><div class="rv-rarity">${rarBadge(id)} ${RARITIES[h.rarity].name} RELIC</div>` +
        `<p class="rv-desc">${h.relic.desc}</p></div>`,
      buttons: [{ label: 'AWESOME', cls: 'gold', fn: closeReveal }],
    });
  }

  function ascend(id) {
    const r = state(), own = r.heroes[id];
    const need = ASCEND_COPIES[own.stars];
    if (own.stars >= MAX_STARS || own.copies < need) { play('error'); return; }
    own.copies -= need;
    own.stars++;
    commit();
    play('jackpot');
    renderHeroes();
    toast(HERO[id].name + ' ASCENDED TO ★' + own.stars);
  }

  // stardust buys another copy of a hero you own
  function buyCopy(id) {
    const r = state(), own = r.heroes[id], price = RARITIES[HERO[id].rarity].copy;
    if (own.stars >= MAX_STARS || r.stardust < price) { toast('NOT ENOUGH STARDUST — COPIES FROM CRATES AND DATA BOXES TURN INTO STARDUST'); play('error'); return; }
    r.stardust -= price;
    own.copies++;
    commit();
    play('coin');
    renderWallet();
    renderHeroes();
    toast('+1 COPY OF ' + HERO[id].name + ' (' + own.copies + ' / ' + ASCEND_COPIES[own.stars] + ' TO ASCEND)');
  }

  // ============================================================ open/close
  function open() {
    state();
    NEON.game.hideTitle();
    NEON.game.setMenuOpen(true);
    if (NEON.game.setOccluded) NEON.game.setOccluded(true);
    $('screen-modes').classList.add('hidden');
    $('screen-rpg').classList.remove('hidden');
    document.body.classList.add('rpg-open');
    // hero portraits render on demand (and stay cached), so the hub opens instantly
    form.pick = state().team.slice();
    showView('hub');
    showMigration();
  }

  // one-time note for saves from before heroes came out of lootboxes
  function showMigration() {
    const r = state(), m = r.migrated;
    if (!m || m.shown) return;
    m.shown = true;
    commit();
    showReveal({
      kicker: '// HERO SYSTEM v2 //',
      title: 'HEROES NOW COME FROM LOOTBOXES',
      color: '#ff5cf0',
      html: '<p class="rv-desc">Heroes are pulled from <b>Hero Crates</b> and <b>Data Boxes</b> now, in 8 rarities from C to HR. ' +
        'Copies turn into <i class="dust-icon"></i> STARDUST, and stardust buys copies to ascend your heroes. ' +
        `Your team stays. The other ${m.removed} heroes were refunded:</p>` +
        '<div class="loot-row">' +
        `<div class="lt xp"><i class="xp-icon"></i><b>+${fmt(m.xp)}</b><span>HERO XP</span></div>` +
        `<div class="lt coin"><i class="coin-icon"></i><b>+${fmt(m.coins)}</b><span>COINS</span></div>` +
        (m.dust ? `<div class="lt dust"><i class="dust-icon"></i><b>+${fmt(m.dust)}</b><span>STARDUST</span></div>` : '') +
        `<div class="lt crate"><i class="crate-icon"></i><b>+${m.crates}</b><span>HERO CRATES</span></div></div>`,
      buttons: [
        { label: 'OPEN ×10', cls: 'gold', fn: () => openCrates(10) },
        { label: 'LATER', cls: '', fn: () => { closeReveal(); renderHub(); } },
      ],
    });
  }

  // hides the RPG screen and hands the renderer back to the main arena
  function leaveScreen() {
    clearInterval(afkTimer);
    clearUnits();
    W.mode = 'none';
    [arena, showcase, idle].forEach((p) => { if (p) S3.unmount(p); });
    $('screen-rpg').classList.add('hidden');
    $('rpg-result').classList.add('hidden');
    closeReveal();
    document.body.classList.remove('rpg-open');
    if (NEON.game.setOccluded) NEON.game.setOccluded(false);
  }

  function close() {
    leaveScreen();
    NEON.game.showTitle();
  }

  function back() {
    play('click');
    if (!$('rpg-reveal').classList.contains('hidden')) { closeReveal(); if (view === 'hub') renderHub(); return; }
    if (!$('rpg-result').classList.contains('hidden')) { $('rpg-result').classList.add('hidden'); return; }
    if (view === 'hub') close();
    else showView('hub');
  }

  // ------------------------------------------------------------- wiring
  $('rpg-back').addEventListener('click', back);
  $('afk-chest').addEventListener('click', collectAfk);
  $('rpg-heroes-btn').addEventListener('click', () => { play('click'); showView('heroes'); });
  $('rpg-crates-btn').addEventListener('click', () => { play('click'); openCrates(1); });
  $('rpg-battle-btn').addEventListener('click', () => { play('click'); form.pick = state().team.slice(); showView('form'); });
  $('rpg-begin').addEventListener('click', beginBattle);
  $('res-next').addEventListener('click', () => { play('click'); launchBattle(); });
  $('res-hub').addEventListener('click', () => { play('click'); $('rpg-result').classList.add('hidden'); });
  $('form-filter').innerHTML = '<button data-f="all">ALL</button>' +
    FACTION_ORDER.map((k) => `<button data-f="${k}" title="${FACTIONS[k].name}" style="--c:${css(FACTIONS[k].color)}">${FACTIONS[k].icon}</button>`).join('');
  $('form-filter').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    form.filter = b.dataset.f;
    play('click');
    renderForm();
  }));

  window.addEventListener('keydown', (e) => {
    if ($('screen-rpg').classList.contains('hidden')) return;
    if (!$('screen-help').classList.contains('hidden')) return;
    if (!$('box-stage').classList.contains('hidden')) return;
    const k = e.key;
    if (k === 'Escape') { back(); return; }
    if (view === 'form' && (k === 'Enter' || k === ' ') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); beginBattle(); }
  });
  P.onChange(() => {
    if ($('screen-rpg').classList.contains('hidden')) return;
    renderWallet();
  });

  NEON.rpg = {
    open, close, battleDone, battleOpts, thumb, relicThumb, heroStats, stagePlan, pullHero,
    stageLabel: () => stageLabel(state().stage),
    get stardust() { return state().stardust; },
  };
})();
