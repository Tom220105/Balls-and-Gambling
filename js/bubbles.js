/* ==========================================================================
   NEON SIGIL — NEON BUBBLES
   A bubble shooter on the main arena in the spirit of Bubble Witch Saga,
   rebuilt as a cyber data purge:
   * two paths of 60 levels each: CLASSIC teaches everything step by step,
     HARD (unlocked after the first boss) throws it all at you at once
   * five goals
       BREACH  — clear the top row of the firewall
       RESCUE  — free the DATA SPRITE caged in a spinning cluster
       PURGE   — destroy every virus bubble
       EXTRACT — drop the gold DATA CHIPS into the sinks
       BOSS    — every 10th level the Sentinel wakes up and fights back
   * special bubbles and hazards, introduced one by one (each with a tutorial
     the first time you meet it): firewall blocks, data bombs, encrypted
     bubbles, wildcards, ammo caches, zappers, shifters, the firewall press
     and spreading worm viruses
   * your Cybergun launches the bubbles: 3+ of a colour pop, whatever hangs on
     nothing drops into the DATA SINKS (×1 … ×3); popping charges the SURGE
   Every pop feeds the arena's HYPE (js/spiel.js) — during FEVER points double.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!window.THREE || !NEON.core || !NEON.models || !NEON.profile) return;
  const C = NEON.core, M = NEON.models, P = NEON.profile;
  const K = C.K;
  const scene = C.scene;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const QS = new URLSearchParams(location.search);
  const BOT = QS.has('bot');   // test autopilot

  // ------------------------------------------------------------ layout
  const BR = 1.12;                          // bubble radius
  const COLS = 11;
  const RH = BR * Math.sqrt(3);             // row height of the hex grid
  const X0 = -K.HALF_W + BR;                // column 0 of an even row
  const Z0 = K.TOP_Z + 1.9 + BR;            // row 0, just below the Sentinel's jaw
  const WALL_X = K.HALF_W - BR;
  const GUN_Z = K.PADDLE_Z - 0.4;
  const DANGER_Z = K.PADDLE_Z - 3.2;        // a wall bubble below this line = breach
  const SINK_Z = K.PADDLE_Z + 2.7;
  const CORE_X = 0, CORE_Z = -7.2;          // centre of the spinning RESCUE cluster
  const MAX_RING = 5;
  const SHOT_SPEED = 64;
  const MAX_AIM = 1.33;
  const HIT_D = BR * 2 * 0.84;              // a little forgiving, like every good bubble shooter
  const SURGE_MAX = 30;
  const LEVELS = 60;
  const SAVE_KEY = 'neonSigil.bubble';
  const SINKS = [3, 1, 2, 1, 3];            // drop multipliers, left to right
  const SINK_COLORS = [0xff3cf2, 0x19e6ff, 0xffc933, 0x19e6ff, 0xff3cf2];
  const COLORS = [0x19e6ff, 0xff3cf2, 0xffd21f, 0x2dff5a, 0xff3a2a, 0x7a4dff];   // hues far apart, even under bloom
  const GLYPHS = ['ring', 'tri', 'square', 'diamond', 'star', 'hex'];           // colour-blind helpers
  const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const HARD_UNLOCK = 10;                   // clear CLASSIC level 10 to open the HARD path
  const key = (q, r) => q + ',' + r;
  const axDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  const colOf = (q, r) => q + Math.floor(r / 2);
  const matchable = (b) => b && (b.kind === 'color' || b.kind === 'virus') && !b.lock;

  const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const GOALS = {
    breach: { name: 'BREACH', color: '#ffc933', goal: 'Clear every bubble in the top row of the firewall.',
      icon: svg('<circle cx="5" cy="5" r="3.2"/><circle cx="12" cy="5" r="3.2"/><circle cx="19" cy="5" r="3.2"/><path d="M12 22V11m-4.5 4.5L12 11l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.6"/>') },
    rescue: { name: 'RESCUE', color: '#dffbff', goal: 'Free the caged DATA SPRITE — clear every bubble touching it.',
      icon: svg('<path d="M12 2.5a7.5 7.5 0 0 0-7.5 7.5v11l2.5-1.7 2.5 1.7 2.5-1.7 2.5 1.7 2.5-1.7 2.5 1.7V10A7.5 7.5 0 0 0 12 2.5z"/><circle cx="9.3" cy="10.5" r="1.7" fill="#0b0720"/><circle cx="14.7" cy="10.5" r="1.7" fill="#0b0720"/>') },
    purge: { name: 'PURGE', color: '#8dff2a', goal: 'Destroy every virus bubble.',
      icon: svg('<circle cx="12" cy="12" r="5.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.6 4.6l2.8 2.8M16.6 16.6l2.8 2.8M4.6 19.4l2.8-2.8M16.6 7.4l2.8-2.8" stroke="currentColor" stroke-width="2.2"/><circle cx="10.2" cy="11" r="1.3" fill="#0b0720"/><circle cx="13.8" cy="11" r="1.3" fill="#0b0720"/>') },
    extract: { name: 'EXTRACT', color: '#ffc933', goal: 'Drop the gold DATA CHIPS into the sinks — they can’t be popped.',
      icon: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v4M12 2v4M15 2v4M9 18v4M12 18v4M15 18v4M2 9h4M2 12h4M2 15h4M18 9h4M18 12h4M18 15h4" stroke="currentColor" stroke-width="1.6"/><rect x="9.5" y="9.5" width="5" height="5" fill="#0b0720"/>') },
    boss: { name: 'BOSS', color: '#ff2a4d', goal: 'Tear the SENTINEL down: every pop hurts it, every drop hurts it twice.',
      icon: svg('<path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/><path d="M8 11l2.5 1.5M16 11l-2.5 1.5" stroke="#0b0720" stroke-width="2"/><path d="M9 16h6" stroke="#0b0720" stroke-width="1.6"/>') },
  };

  // Every mechanic gets a tutorial card the first time it shows up.
  const TUTS = {
    basics: { title: 'SHOOT & MATCH', model: ['color', 0],
      // touch screens (js/mobil.js sets body.touch) drag to aim and let go to shoot
      get text() {
        const touch = document.body.classList.contains('touch');
        return (touch ? 'Drag your finger to aim, <b>let go</b> to shoot' : 'Aim with the mouse, <b>click</b> to shoot') +
          ' (bank shots off the walls). <b>3 or more</b> bubbles of one colour pop. Whatever then hangs on nothing <b>drops</b> into the DATA SINKS at the bottom — the outer sinks pay <b>×3</b>. ' +
          (touch ? '<b>Tap the next bubble</b> to swap with it.' : '<b>S</b> / right-click swaps with the next bubble.');
      } },
    breach: { title: 'GOAL: BREACH', svg: GOALS.breach.icon, color: GOALS.breach.color,
      text: 'Clear every bubble in the <b>top row</b> of the firewall. Popping and dropping both count. The counter at the top shows how many are left.' },
    rescue: { title: 'GOAL: RESCUE', model: ['core', 0], color: GOALS.rescue.color,
      text: 'A <b>DATA SPRITE</b> is caged in the middle of a floating cluster. Clear every bubble <b>touching it</b> and it breaks free. Hits make the cluster <b>spin</b> — shots that miss it fly away.' },
    purge: { title: 'GOAL: PURGE', model: ['virus', 1], color: GOALS.purge.color,
      text: 'Virus bubbles carry a virus inside. They match like normal bubbles of their colour — <b>pop or drop every one</b> of them.' },
    extract: { title: 'GOAL: EXTRACT', model: ['chip', 0], color: GOALS.extract.color,
      text: 'Gold <b>DATA CHIPS</b> can’t be popped or blown up. Pop what holds them up so they <b>drop</b> into the sinks.' },
    boss: { title: 'BOSS: THE SENTINEL', svg: GOALS.boss.icon, color: GOALS.boss.color,
      text: 'The Sentinel wakes up! Every popped bubble deals <b>1</b> damage, every dropped one <b>2</b>, a surge blast <b>even more</b>. Every <b>3 shots</b> it strikes back: it <b>presses</b> the firewall down or <b>corrupts</b> bubbles into blocks. Watch the countdown.' },
    surge: { title: 'SURGE ORB', model: ['surge', 0], color: '#ffffff',
      text: 'Popping fills the <b>SURGE</b> bar at the bottom. When it is full, your next bubble turns into a rainbow <b>SURGE ORB</b> that blasts everything around its impact — firewall blocks included.' },
    block: { title: 'FIREWALL BLOCK', model: ['block', 0], color: '#ff6a7a',
      text: 'Steel blocks can’t be matched. <b>Drop</b> them by clearing what they hang on, or blast them with a <b>surge</b>, a <b>bomb</b> or a <b>zapper</b>.' },
    bomb: { title: 'DATA BOMB', model: ['bomb', 0], color: '#ff7a2a',
      text: 'Pop any bubble <b>next to a bomb</b> and it detonates, clearing everything within <b>2 cells</b>. Bombs set off other bombs — chain them!' },
    lock: { title: 'ENCRYPTED BUBBLE', model: ['color', 2, { lock: true }], color: '#9ff4ff',
      text: 'A caged bubble can’t be matched. Pop a group <b>right next to it</b> to crack the cage — after that it is a normal bubble.' },
    wild: { title: 'WILDCARD', model: ['wild', 0], color: '#ff5cf0',
      text: 'Rainbow wildcards match <b>every colour</b>. Use them to link two groups into one big pop.' },
    ammo: { title: 'AMMO CACHE', model: ['color', 0, { ammo: true }], color: '#ffc933',
      text: 'Bubbles with a gold <b>+3</b> tag give you <b>3 extra shots</b> when they pop or drop.' },
    zap: { title: 'ZAPPER', model: ['color', 1, { zap: true }], color: '#ffe070',
      text: 'When a zapper pops, lightning clears its <b>whole row</b> — in RESCUE levels its whole ring around the sprite.' },
    shift: { title: 'SHIFTER', model: ['color', 3, { shift: true }], color: '#2dff5a',
      text: 'Shifters glitch to a <b>new colour after every shot</b>. Watch them and time your shot.' },
    crusher: { title: 'FIREWALL PRESS', svg: svg('<rect x="2" y="3" width="20" height="5"/><path d="M12 10v10m-5-5 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.6"/>'), color: '#ff7a2a',
      text: 'The ceiling <b>moves down one row</b> every few shots — the PRESS counter shows when. Don’t let the wall reach the <b>red line</b> above your gun.' },
    worm: { title: 'WORM VIRUS', model: ['virus', 3, { worm: true }], color: '#2dff5a',
      text: 'Worms <b>spread</b>: after every <b>3 shots</b> in which you destroy no virus, each worm infects a neighbour. Kill them fast!' },
    hard: { title: 'THE HARD PATH', svg: svg('<path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 16.5 5.5 21l2-7.5L2 9h7z"/>'), color: '#ff2a4d',
      text: 'Fewer shots, more colours, and every mechanic at once. <b>Coins ×1.8</b> — and a <b>TOKEN</b> for every first ★★★.' },
  };

  const PATHS = {
    classic: {
      name: 'CLASSIC', kicker: '// DATA PURGE //',
      chapters: [
        { name: 'NEON SLUMS', c1: '#ff3cf2', c2: '#19e6ff', from: 1 },
        { name: 'DATA OCEAN', c1: '#19e6ff', c2: '#3d7bff', from: 16 },
        { name: 'CHROME CITADEL', c1: '#ffc933', c2: '#ff7a2a', from: 31 },
        { name: 'THE VOID', c1: '#ff2a4d', c2: '#9a5cff', from: 46 },
      ],
    },
    hard: {
      name: 'HARD', kicker: '// THE DEEP NET //',
      chapters: [
        { name: 'BLACK ICE', c1: '#9ff4ff', c2: '#ff2a4d', from: 1 },
        { name: 'ZERO DAY', c1: '#ff7a2a', c2: '#ff2a4d', from: 16 },
        { name: 'ROOTKIT', c1: '#2dff5a', c2: '#ff2a4d', from: 31 },
        { name: 'KERNEL PANIC', c1: '#ff3cf2', c2: '#ff2a4d', from: 46 },
      ],
    },
  };
  const chapterOf = (path, n) => PATHS[path].chapters.slice().reverse().find((c) => n >= c.from);

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

  // ============================================================= levels
  // CLASSIC introduces one thing at a time (the level where each one appears first).
  const INTRO = { breach: 1, rescue: 2, purge: 3, surge: 4, block: 6, bomb: 8, boss: 10, lock: 12, wild: 14, ammo: 16, extract: 18, zap: 22, shift: 25, crusher: 28, worm: 33 };
  const SPECIALS = ['block', 'bomb', 'lock', 'wild', 'ammo', 'zap', 'shift'];
  const SHAPES = {
    invader: ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
    skull: ['...#####...', '..#######..', '.#########.', '.##..#..##.', '.##..#..##.', '.#########.', '..###.###..', '..#.#.#.#..'],
    heart: ['..##...##..', '.####.####.', '###########', '###########', '.#########.', '..#######..', '...#####...', '....###....'],
    crown: ['#....#....#', '##..###..##', '###########', '###########', '#.#.#.#.#.#', '###########'],
    fortress: ['#.#.###.#.#', '###########', '##.#####.##', '###########', '####...####', '####...####'],
  };

  function available(path, n) {
    const out = new Set();
    Object.keys(INTRO).forEach((k) => { if (path === 'hard' || n >= INTRO[k]) out.add(k); });
    return out;
  }
  function goalFor(path, n, av) {
    if (n % 10 === 0) return 'boss';
    if (path === 'classic') {
      if (n === INTRO.rescue) return 'rescue';
      if (n === INTRO.purge) return 'purge';
      if (n === INTRO.extract) return 'extract';
      if (n === INTRO.worm) return 'purge';   // worms only live in PURGE levels
    }
    const pool = ['breach', 'rescue', 'purge', 'extract'].filter((g) => av.has(g));
    return pool[(n * 7 + (path === 'hard' ? 3 : 0) + Math.floor(n / 4)) % pool.length];
  }

  // Every level is generated from its path and number, so it is the same every time you play it.
  function levelDef(path, n) {
    const hard = path === 'hard';
    const rnd = mulberry(n * 7919 + (hard ? 55511 : 101));
    const pickR = (arr) => arr[Math.floor(rnd() * arr.length)];
    const av = available(path, n);
    const goal = goalFor(path, n, av);
    const nColors = clamp((hard ? 4 : n <= 3 ? 3 : n <= 12 ? 4 : n <= 30 ? 5 : 6) + (hard && n > 20 ? 1 : 0) + (hard && n > 40 ? 1 : 0), 3, 6);
    // which specials show up: the newly introduced one prominently, plus a random mix of the known ones
    const known = SPECIALS.filter((s) => av.has(s));
    const intro = !hard && known.find((s) => INTRO[s] === n);
    const feats = new Set();
    if (intro) feats.add(intro);
    const extra = hard ? 2 + Math.floor(rnd() * 2) : n < 6 ? 0 : 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < extra && known.length; i++) feats.add(pickR(known));
    const crush = goal !== 'rescue' && av.has('crusher') && (goal === 'boss' || (hard ? rnd() < 0.6 : n === INTRO.crusher || rnd() < 0.3))
      ? (hard ? 4 : 6) : 0;
    const worms = goal === 'purge' && av.has('worm') && (hard ? rnd() < 0.7 : n === INTRO.worm || rnd() < 0.4);
    const rate = (s) => (s === intro ? 0.16 : hard ? 0.07 : 0.05);

    const cells = [];
    const add = (q, r, kind) => cells.push({ q, r, kind, color: 0, flags: {} });
    if (goal === 'rescue') {
      const rings = hard ? (n < 20 ? 4 : 5) : n < 8 ? 3 : n < 26 ? 4 : 5;
      add(0, 0, 'core');
      for (let q = -rings; q <= rings; q++) {
        for (let r = -rings; r <= rings; r++) {
          const d = axDist(q, r);
          if (d < 1 || d > rings) continue;
          if (d === 5 && rnd() < 0.45) continue;
          add(q, r, 'color');
        }
      }
    } else {
      const rows = clamp((hard ? 7 : 5) + Math.floor(n / (hard ? 8 : 5)), 5, 9);
      const art = goal === 'boss' ? SHAPES.fortress : n > 5 && rnd() < 0.4 ? SHAPES[pickR(['invader', 'skull', 'heart', 'crown'])] : null;
      const shape = art ? 'art' : n <= 3 ? 'rect' : pickR(['rect', 'funnel', 'diamond', 'zigzag', 'pillars']);
      const total = art ? art.length + 1 : rows;
      for (let r = 0; r < total; r++) {
        for (let c = 0; c < COLS; c++) {
          const mid = (COLS - 1) / 2, dc = Math.abs(c - mid);
          let ok = true;
          if (shape === 'art') ok = r === 0 || art[r - 1][c] === '#';
          else if (shape === 'funnel') ok = dc <= mid - r * 0.45 + 0.6;
          else if (shape === 'diamond') ok = r === 0 || dc <= 1.5 + Math.min(r, rows - r) * 1.2;
          else if (shape === 'zigzag') ok = r < 2 || Math.abs(c - (mid + Math.sin(r * 0.9) * 3.5)) <= 3.2;
          else if (shape === 'pillars') ok = r < 3 || c % 4 !== 1;
          if (ok) add(c - Math.floor(r / 2), r, 'color');
        }
      }
    }
    // specials
    const cand = cells.filter((c) => c.kind === 'color');
    cand.forEach((c) => {
      const d = goal === 'rescue' ? axDist(c.q, c.r) : 0;
      const top = goal !== 'rescue' && c.r === 0;
      for (const f of feats) {
        if (rnd() >= rate(f)) continue;
        if (f === 'block' && !top && !(goal === 'rescue' && d < 2)) c.kind = 'block';
        else if (f === 'bomb' && !top && d !== 1) c.kind = 'bomb';
        else if (f === 'wild') c.kind = 'wild';
        else if (f === 'lock') c.flags.lock = true;
        else if (f === 'ammo') c.flags.ammo = true;
        else if (f === 'zap') c.flags.zap = true;
        else if (f === 'shift') c.flags.shift = true;
        break;
      }
    });
    if (goal === 'purge') {
      const pool = cand.filter((c) => c.kind === 'color' && c.r >= 1).sort((a, b) => b.r - a.r + (rnd() - 0.5) * 6);
      const count = Math.min(pool.length, (hard ? 4 : 3) + Math.floor(n / 10));
      for (let i = 0; i < count; i++) { pool[i].kind = 'virus'; pool[i].flags = worms && i < 2 ? { worm: true } : {}; }
    }
    if (goal === 'extract') {
      const pool = cand.filter((c) => c.kind === 'color' && c.r >= 2).sort((a, b) => b.r - a.r + (rnd() - 0.5) * 4);
      const count = Math.min(pool.length, (hard ? 5 : 3) + Math.floor(n / 15));
      for (let i = 0; i < count; i++) { pool[i].kind = 'chip'; pool[i].flags = {}; }
    }
    // only keep what actually hangs on the ceiling / the sprite
    const has = new Map(cells.map((c) => [key(c.q, c.r), c]));
    const anchors = cells.filter((c) => (goal === 'rescue' ? c.kind === 'core' : c.r === 0));
    const seen = new Set(anchors.map((c) => key(c.q, c.r)));
    const stack = anchors.slice();
    while (stack.length) {
      const c = stack.pop();
      NEIGH.forEach(([dq, dr]) => { const k = key(c.q + dq, c.r + dr); if (has.has(k) && !seen.has(k)) { seen.add(k); stack.push(has.get(k)); } });
    }
    const kept = cells.filter((c) => seen.has(key(c.q, c.r)));
    // colours come in clumps: most cells copy a neighbour, some start a new clump
    const colorAt = new Map();
    kept.forEach((c) => {
      if (c.kind !== 'color' && c.kind !== 'virus') return;
      const near = NEIGH.map(([dq, dr]) => colorAt.get(key(c.q + dq, c.r + dr))).filter((v) => v !== undefined);
      c.color = near.length && rnd() < (hard ? 0.45 : 0.56) ? near[Math.floor(rnd() * near.length)] : Math.floor(rnd() * nColors);
      colorAt.set(key(c.q, c.r), c.color);
    });
    const count = kept.filter((c) => c.kind !== 'core').length;
    const tight = (1.02 - Math.min(0.28, n * 0.0065)) * (hard ? 0.74 : 1);
    const per = { rescue: 3.3, breach: 2.9, purge: 2.7, extract: 2.8, boss: 2.2 }[goal];
    const shots = Math.round((count / per) * tight + (goal === 'boss' ? 9 : 5));
    const hardK = hard ? 1.15 : 1;
    const f = [...feats];
    if (crush) f.push('crusher');
    if (worms) f.push('worm');
    return {
      path, n, goal, nColors, cells: kept, shots, count, crush, wormEvery: worms ? 3 : 0,
      chips: kept.filter((c) => c.kind === 'chip').length,
      bossHp: goal === 'boss' ? Math.round(count * (hard ? 1.6 : 1.25)) : 0,
      feats: f,
      t2: Math.round(((count * 26 + shots * 40) * hardK) / 50) * 50,
      t3: Math.round(((count * 38 + shots * 100) * hardK) / 50) * 50,
      coins: Math.round((14 + n * 1.3) * (hard ? 1.8 : 1)),
    };
  }
  // the mechanics you need to know for a level, in the order the tutorials show them
  function levelTopics(def) {
    const t = [];
    if (def.path === 'classic' && def.n === 1) t.push('basics');
    if (def.path === 'hard') t.push('hard');
    t.push(def.goal);
    if (def.path === 'hard' || def.n >= INTRO.surge) t.push('surge');
    def.feats.forEach((f) => { if (!t.includes(f)) t.push(f); });
    return t;
  }

  // ====================================================== save / progress
  function loadSave() {
    let s = {};
    try { s = JSON.parse(C.store.get(SAVE_KEY, '{}')) || {}; } catch (e) { s = {}; }
    const track = (o) => ({ max: clamp(parseInt(o && o.max, 10) || 1, 1, LEVELS), stars: (o && o.stars) || {}, best: (o && o.best) || {} });
    // saves from before the two paths hold the classic progress at the top level
    const classic = s.classic ? track(s.classic) : track(s);
    return { classic, hard: track(s.hard), seen: Array.isArray(s.seen) ? s.seen : [], path: s.path === 'hard' ? 'hard' : 'classic' };
  }
  let save = loadSave();
  const commit = () => C.store.set(SAVE_KEY, JSON.stringify(save));
  const starsOf = (path) => Object.values(save[path].stars).reduce((a, b) => a + (b || 0), 0);
  const hardOpen = () => save.classic.max > HARD_UNLOCK || !!save.classic.stars[HARD_UNLOCK];

  // ======================================================== 3D building
  let inited = false;
  const mats = {};
  const glyphMats = [];
  const aimDots = [];
  const beams = [];
  let aimMat = null, ghost = null, gun = null, sinkGroup = null, dangerLine = null, press = null, circuitTex = null;
  const sinks = [];
  const geo = {};

  // hex circuitry that glows in the bubble's colour and slowly flows around it
  function circuitCanvas() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#474747';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    const s = 11, hw = Math.sqrt(3) * s;
    for (let row = -1; row * s * 1.5 < 140; row++) {
      for (let x = (row % 2 ? hw / 2 : 0) - hw; x < 280; x += hw) {
        g.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = x + Math.cos(a) * s, py = row * s * 1.5 + Math.sin(a) * s;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
      }
    }
    // brighter data traces with nodes
    const rnd = mulberry(5);
    g.lineWidth = 3.5;
    for (let i = 0; i < 9; i++) {
      let x = rnd() * 256, y = rnd() * 128;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { if (k % 2) y += (rnd() - 0.5) * 60; else x += (rnd() - 0.5) * 90; g.lineTo(x, y); }
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillRect(x - 4, y - 4, 8, 8);
    }
    return c;
  }

  // the colour symbol: a bright hologram glyph on a dark hex tile
  function glyphTexture(shape, ink) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    const poly = (n, r, rot) => { for (let i = 0; i <= n; i++) { const a = rot + (i / n) * Math.PI * 2; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } };
    g.fillStyle = 'rgba(8, 4, 24, 0.82)';
    g.beginPath();
    poly(6, 29, Math.PI / 6);
    g.fill();
    g.strokeStyle = ink || '#ffffff';
    g.fillStyle = ink || '#ffffff';
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.beginPath();
    if (shape === 'ring') g.arc(0, 0, 12, 0, Math.PI * 2);
    else if (shape === 'tri') poly(3, 15, -Math.PI / 2);
    else if (shape === 'square') poly(4, 15, Math.PI / 4);
    else if (shape === 'diamond') { g.moveTo(0, -17); g.lineTo(10, 0); g.lineTo(0, 17); g.lineTo(-10, 0); g.closePath(); }
    else if (shape === 'star') { for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 7 : 16; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } }
    else if (shape === 'hex') poly(6, 14, 0);
    else if (shape === 'x') { g.moveTo(-12, -12); g.lineTo(12, 12); g.moveTo(12, -12); g.lineTo(-12, 12); }
    else if (shape === 'bolt') { g.moveTo(4, -18); g.lineTo(-8, 3); g.lineTo(1, 3); g.lineTo(-4, 18); g.lineTo(9, -4); g.lineTo(0, -4); g.closePath(); g.fill(); }
    else if (shape === 'lock') { g.strokeRect(-11, -2, 22, 16); g.moveTo(-7, -2); g.arc(0, -6, 7, Math.PI, 0); g.lineTo(7, -2); }
    else if (shape === 'ammo') { g.font = '900 26px Orbitron, Consolas, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+3', 0, 2); }
    else if (shape === 'shift') { g.arc(0, 0, 12, 0.3, Math.PI * 1.7); g.moveTo(12, -6); g.lineTo(13, 3); g.lineTo(4, 1); }
    else if (shape === 'bomb') { g.arc(0, 3, 11, 0, Math.PI * 2); g.moveTo(6, -6); g.lineTo(12, -14); }
    if (shape !== 'bolt' && shape !== 'ammo') g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  function labelTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = '900 40px Orbitron, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 12;
    g.fillStyle = '#ffffff';
    g.fillText(text, 64, 34);
    return new THREE.CanvasTexture(c);
  }

  function hazardCanvas() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#1a1020';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#ff7a2a';
    for (let x = -32; x < 160; x += 24) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 12, 32); g.lineTo(x + 28, 0); g.lineTo(x + 16, 0); g.fill(); }
    return c;
  }

  const sprite = (mat, s) => { const sp = new THREE.Sprite(mat); sp.scale.setScalar(s || 1); return sp; };

  function init() {
    if (inited) return;
    inited = true;
    circuitTex = new THREE.CanvasTexture(circuitCanvas());
    circuitTex.wrapS = circuitTex.wrapT = THREE.RepeatWrapping;
    geo.sphere = new THREE.SphereGeometry(BR * 0.94, 30, 20);
    geo.shell = new THREE.SphereGeometry(BR * 0.98, 24, 16);
    geo.ring = (() => { const t = new THREE.TorusGeometry(BR * 1.06, 0.04, 6, 44); t.rotateX(Math.PI / 2); return t; })();
    geo.cage = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(BR * 1.25, 1));
    geo.lockCage = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(BR * 1.18, 0));
    geo.eye = new THREE.SphereGeometry(0.16, 10, 8);
    geo.block = new THREE.BoxGeometry(BR * 1.55, BR * 1.55, BR * 1.55);
    geo.blockEdges = new THREE.EdgesGeometry(geo.block);
    geo.chip = new THREE.BoxGeometry(BR * 1.5, 0.3, BR * 1.5);
    geo.pin = new THREE.BoxGeometry(0.12, 0.08, 0.34);
    geo.fuse = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6);
    COLORS.forEach((hex, i) => {
      const col = new THREE.Color(hex);
      mats[i] = new THREE.MeshStandardMaterial({
        color: col.clone().multiplyScalar(0.34), emissive: col, emissiveMap: circuitTex, emissiveIntensity: 0.95, metalness: 0.55, roughness: 0.14,
      });
      mats['v' + i] = new THREE.MeshStandardMaterial({
        color: col.clone().multiplyScalar(0.4), emissive: col, emissiveMap: circuitTex, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.42, depthWrite: false,
      });
      mats['r' + i] = new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.35) });
      glyphMats[i] = new THREE.SpriteMaterial({ map: glyphTexture(GLYPHS[i]), transparent: true, depthWrite: false });
    });
    mats.block = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, emissive: 0xff2a4d, emissiveMap: new THREE.CanvasTexture(hazardCanvas()), emissiveIntensity: 0.55, metalness: 0.95, roughness: 0.28 });
    mats.blockEdge = new THREE.LineBasicMaterial({ color: 0xff6a7a });
    mats.core = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdffbff, emissiveIntensity: 0.9, metalness: 0.1, roughness: 0.3 });
    mats.surge = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveMap: circuitTex, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.1 });
    mats.wild = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveMap: circuitTex, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.1 });
    mats.bomb = new THREE.MeshStandardMaterial({ color: 0x151018, emissive: 0xff5a1f, emissiveMap: circuitTex, emissiveIntensity: 0.55, metalness: 0.9, roughness: 0.25 });
    mats.chip = new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: 0xffa21f, emissiveMap: circuitTex, emissiveIntensity: 0.7, metalness: 1, roughness: 0.2 });
    mats.pin = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    mats.eye = new THREE.MeshBasicMaterial({ color: 0x0b0720 });
    mats.cage = new THREE.LineBasicMaterial({ color: 0x19e6ff, transparent: true, opacity: 0.9 });
    mats.lock = new THREE.LineBasicMaterial({ color: 0x9ff4ff });
    mats.ringGold = new THREE.MeshBasicMaterial({ color: 0xffc933 });
    mats.fuse = new THREE.MeshBasicMaterial({ color: 0xffe070 });
    ['x', 'star', 'bolt', 'lock', 'ammo', 'shift', 'bomb'].forEach((g) => {
      glyphMats[g] = new THREE.SpriteMaterial({ map: glyphTexture(g, { x: '#ff6a7a', bolt: '#ffe070', lock: '#9ff4ff', ammo: '#ffc933', bomb: '#ff7a2a' }[g]), transparent: true, depthWrite: false });
    });

    aimMat = new THREE.SpriteMaterial({ map: M.glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(aimMat);
      s.visible = false;
      scene.add(s);
      aimDots.push(s);
    }
    ghost = new THREE.Mesh(geo.shell, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    ghost.visible = false;
    scene.add(ghost);
    // the danger line: a wall bubble stuck below it breaches the firewall
    dangerLine = new THREE.Mesh(new THREE.PlaneGeometry(K.HALF_W * 2, 0.22), new THREE.MeshBasicMaterial({
      color: 0xff2a4d, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    dangerLine.rotation.x = -Math.PI / 2;
    dangerLine.position.set(0, 0.05, DANGER_Z);
    dangerLine.visible = false;
    scene.add(dangerLine);
    // the FIREWALL PRESS: a hazard-striped slab that slides down from the top wall
    const hz = new THREE.CanvasTexture(hazardCanvas());
    hz.wrapS = THREE.RepeatWrapping;
    hz.repeat.set(6, 1);
    press = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(K.HALF_W * 2, 0.6, 1), new THREE.MeshStandardMaterial({ color: 0x1a1020, emissive: 0xffffff, emissiveMap: hz, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 }));
    slab.position.y = 0.3;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(K.HALF_W * 2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
    edge.position.set(0, 0.2, 0.55);
    press.add(slab, edge);
    press.visible = false;
    scene.add(press);
    // red corruption beams from the Sentinel
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xff2a4d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      beams.push({ m, life: 0 });
    }

    // DATA SINKS: five catch basins below the launcher
    sinkGroup = new THREE.Group();
    const w = (K.HALF_W * 2) / SINKS.length;
    SINKS.forEach((mult, i) => {
      const x = -K.HALF_W + w * (i + 0.5), col = SINK_COLORS[i];
      const g = new THREE.Group();
      const frameMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
      const bar = (bw, bd, bx, bz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.18, bd), frameMat); m.position.set(bx, 0.1, bz); g.add(m); };
      bar(w - 0.4, 0.14, 0, -1);
      bar(w - 0.4, 0.14, 0, 1);
      bar(0.14, 2, -(w - 0.4) / 2, 0);
      bar(0.14, 2, (w - 0.4) / 2, 0);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, 1.9), new THREE.MeshBasicMaterial({
        map: M.glowTex, color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture('×' + mult, css(col)), transparent: true, depthWrite: false }));
      label.scale.set(2.6, 1.3, 1);
      label.position.set(0, 1.2, 0.2);
      g.add(floor, label);
      g.position.set(x, 0, SINK_Z);
      sinkGroup.add(g);
      sinks.push({ g, floor, frameMat, flash: 0, col });
    });
    sinkGroup.visible = false;
    scene.add(sinkGroup);
  }

  // Builds a bubble model (not added to the scene): a glass data orb with glowing
  // hex circuitry, a gyro ring and a hologram glyph — or one of the specials.
  function buildBubble(kind, color, flags) {
    const g = new THREE.Group();
    const f = flags || {};
    const b = { kind, color, group: g, body: null, glyph: null, ring: null, extra: null, cage: null, spin: rand(0, 6), tilt: rand(-0.5, 0.5),
      lock: !!f.lock, ammo: !!f.ammo, zap: !!f.zap, shift: !!f.shift, worm: !!f.worm };
    const orb = (mat) => { b.body = new THREE.Mesh(geo.sphere, mat); g.add(b.body); };
    const ring = (mat) => { b.ring = new THREE.Mesh(geo.ring, mat); b.ring.rotation.x = b.tilt; g.add(b.ring); };
    if (kind === 'color') {
      orb(mats[color]);
      ring(mats['r' + color]);
      b.glyph = sprite(glyphMats[color], 0.95);
    } else if (kind === 'virus') {
      orb(mats['v' + color]);
      ring(mats['r' + color]);
      if (NEON.rpgData) {
        const v = NEON.rpgData.makeVirusModel(b.worm ? 0x2dff5a : COLORS[color]);
        v.group.scale.setScalar(b.worm ? 1.1 : 1.35);
        g.add(v.group);
        b.extra = v;
      }
      b.glyph = sprite(glyphMats[color], 0.7);
    } else if (kind === 'block') {
      b.body = new THREE.Mesh(geo.block, mats.block);
      g.add(b.body, new THREE.LineSegments(geo.blockEdges, mats.blockEdge));
      b.glyph = sprite(glyphMats.x, 0.9);
    } else if (kind === 'bomb') {
      orb(mats.bomb);
      ring(mats.fuse);
      const fuse = new THREE.Mesh(geo.fuse, mats.fuse);
      fuse.position.set(0.35, BR * 0.95, 0);
      fuse.rotation.z = -0.5;
      const spark = M.glow(0xffc933, 1.2, 0.9);
      spark.position.set(0.5, BR * 1.25, 0);
      g.add(fuse, spark);
      b.glyph = sprite(glyphMats.bomb, 0.85);
      b.extra = { update(dt, t) { spark.material.opacity = 0.5 + Math.abs(Math.sin(t * 9)) * 0.5; spark.scale.setScalar(0.9 + Math.random() * 0.6); } };
    } else if (kind === 'wild' || kind === 'surge') {
      orb(kind === 'wild' ? mats.wild : mats.surge);
      ring(mats.ringGold);
      b.glyph = sprite(glyphMats.star, 1);
      b.extra = { update(dt, t) { (kind === 'wild' ? mats.wild : mats.surge).emissive.setHSL((t * 0.6) % 1, 1, 0.55); } };
    } else if (kind === 'chip') {
      const chip = new THREE.Mesh(geo.chip, mats.chip);
      g.add(chip);
      for (let s = 0; s < 4; s++) {
        for (let k = -1; k <= 1; k++) {
          const p = new THREE.Mesh(geo.pin, mats.pin);
          const a = (s * Math.PI) / 2;
          p.position.set(Math.cos(a) * BR * 0.85 + Math.sin(a) * k * 0.4, 0, Math.sin(a) * BR * 0.85 + Math.cos(a) * k * 0.4);
          p.rotation.y = -a + Math.PI / 2;
          chip.add(p);
        }
      }
      g.add(M.glow(0xffc933, 3.2, 0.35));
      b.body = chip;
      b.extra = { update(dt) { chip.rotation.y += dt * 0.9; } };
    } else if (kind === 'core') {
      orb(mats.core);
      [-0.36, 0.36].forEach((x) => { const e = new THREE.Mesh(geo.eye, mats.eye); e.position.set(x, BR * 0.35, BR * 0.78); g.add(e); });
      const cage = new THREE.LineSegments(geo.cage, mats.cage);
      g.add(cage, M.glow(0xdffbff, 5, 0.35));
      b.extra = { update(dt) { cage.rotation.y += dt * 0.8; cage.rotation.x += dt * 0.3; } };
      b.cage = cage;
    }
    if (b.lock) { b.cage = new THREE.LineSegments(geo.lockCage, mats.lock); g.add(b.cage); b.glyph2 = sprite(glyphMats.lock, 0.6); }
    if (b.ammo) b.glyph2 = sprite(glyphMats.ammo, 0.75);
    if (b.zap) b.glyph2 = sprite(glyphMats.bolt, 0.7);
    if (b.shift) b.glyph2 = sprite(glyphMats.shift, 0.6);
    if (b.glyph) { b.glyph.position.set(0, BR * 0.96, BR * 0.35); g.add(b.glyph); }
    if (b.glyph2) { b.glyph2.position.set(BR * 0.55, BR * 1.3, BR * 0.5); g.add(b.glyph2); }
    return b;
  }
  function makeBubble(kind, color, flags) {
    const b = buildBubble(kind, color, flags);
    scene.add(b.group);
    return b;
  }
  function disposeBubble(b) { scene.remove(b.group); }
  // a shifter / cracked cage changes what a bubble is: swap its parts in place
  function recolor(b, color) {
    b.color = color;
    if (b.body && b.kind === 'color') b.body.material = mats[color];
    if (b.body && b.kind === 'virus') b.body.material = mats['v' + color];
    if (b.ring) b.ring.material = mats['r' + color];
    if (b.glyph) b.glyph.material = glyphMats[color];
  }
  function unlock(b) {
    b.lock = false;
    if (b.cage) { b.group.remove(b.cage); b.cage = null; }
    if (b.glyph2) { b.group.remove(b.glyph2); b.glyph2 = null; }
    C.spawnDebris(b.wx, b.wz, 0x9ff4ff, 4);
    C.spawnRing(b.wx, b.wz, 0x9ff4ff, 2.4, 0.3);
    C.popup('DECRYPTED', b.wx, b.wz - 1, 'lvl');
    C.sfx.armor();
  }

  // tutorial pictures: the real bubble model rendered once by the menu renderer
  const icons = {};
  function bubbleIcon(spec) {
    const id = spec.join('|') + JSON.stringify(spec[2] || {});
    if (icons[id] !== undefined) return icons[id];
    init();
    if (!NEON.stage3d) return (icons[id] = '');
    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 3.6, 5.2);
    cam.lookAt(0, 0.1, 0);
    sc.add(new THREE.AmbientLight(0x8a7aff, 0.8));
    const kl = new THREE.PointLight(0xffffff, 1.8, 30);
    kl.position.set(3, 5, 5);
    sc.add(kl);
    const b = buildBubble(spec[0], spec[1], spec[2]);
    if (b.extra && b.extra.update) b.extra.update(0.1, 1.2);
    sc.add(b.group);
    icons[id] = NEON.stage3d.snapshot({ scene: sc, camera: cam, update() {} }, 160, 160);
    return icons[id];
  }

  // ============================================================== state
  const st = {
    active: false, phase: 'idle', t: 0, phaseT: 0, level: 1, path: 'classic', def: null, type: 'breach',
    score: 0, shots: 0, surge: 0, cur: null, next: null, aim: 0, keyL: false, keyR: false, mouseAim: true, touchAim: false,
    rot: 0, omega: 0, shot: null, recoil: 0, timers: [], fallers: [], pops: [], flyers: [],
    viruses: 0, virusTotal: 0, freed: false, chipsGot: 0, bossHp: 0, bossMax: 0, bossT: 3, bossMove: 0,
    press: 0, crushT: 0, wormT: 3, killedVirus: false, chain: 0,
    continues: 0, result: null, tut: null, back: 'aim',
  };
  const cells = new Map();   // "q,r" → bubble

  function later(t, fn) { st.timers.push({ t, fn }); }
  // chain reactions (bombs, zappers) the current shot has to wait for
  function schedule(t, fn) { st.chain++; later(t, () => { st.chain--; fn(); }); }
  // once every chain reaction is done: drop what hangs on nothing, then move on
  function settle() {
    if (!st.active) return;
    if (st.chain > 0) { later(0.1, settle); return; }
    dropFloating();
    later(0.25, afterShot);
  }

  // --------------------------------------------------- grid geometry
  const ceilZ = () => Z0 + st.press * RH;
  function cellWorld(q, r) {
    const lx = 2 * BR * (q + r / 2), lz = RH * r;
    if (st.type !== 'rescue') return [X0 + lx, ceilZ() + lz];
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    return [CORE_X + lx * c - lz * s, CORE_Z + lx * s + lz * c];
  }
  function worldCell(x, z) {
    let lx, lz;
    if (st.type === 'rescue') {
      const dx = x - CORE_X, dz = z - CORE_Z, c = Math.cos(st.rot), s = Math.sin(st.rot);
      lx = dx * c + dz * s;
      lz = -dx * s + dz * c;
    } else {
      lx = x - X0;
      lz = z - ceilZ();
    }
    const rf = lz / RH, qf = lx / (2 * BR) - rf / 2, sf = -qf - rf;
    let q = Math.round(qf), r = Math.round(rf);
    const s = Math.round(sf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    return [q, r];
  }
  function validCell(q, r) {
    if (st.type === 'rescue') return axDist(q, r) <= MAX_RING && !(q === 0 && r === 0);
    const c = colOf(q, r);
    return r >= 0 && c >= 0 && c < COLS;
  }

  // --------------------------------------------------------- building
  function place(q, r, kind, color, flags) {
    const b = makeBubble(kind, color, flags);
    b.q = q;
    b.r = r;
    b.wob = 0;
    b.flash = 0;
    b.born = 0;
    const [x, z] = cellWorld(q, r);
    b.wx = x;
    b.wz = z;
    b.group.position.set(x, BR, z);
    cells.set(key(q, r), b);
    if (kind === 'virus') st.viruses++;
    return b;
  }

  function colorsOnBoard() {
    const count = new Map();
    cells.forEach((b) => { if (b.kind === 'color' || b.kind === 'virus') count.set(b.color, (count.get(b.color) || 0) + 1); });
    return count;
  }
  function randomShotColor() {
    const count = colorsOnBoard();
    if (!count.size) return Math.floor(Math.random() * st.def.nColors);
    let total = 0;
    count.forEach((v) => { total += v + 2; });
    let x = Math.random() * total;
    for (const [c, v] of count) { x -= v + 2; if (x <= 0) return c; }
    return count.keys().next().value;
  }

  // ----------------------------------------------------------- queue
  function makeQueued(kind, color) {
    const b = makeBubble(kind, color);
    b.born = 1;
    return b;
  }
  function loadNext() {
    st.cur = st.next || makeQueued('color', randomShotColor());
    // a colour that vanished from the board since it was queued gets swapped for a live one
    if (st.cur.kind === 'color' && !colorsOnBoard().has(st.cur.color) && colorsOnBoard().size) {
      disposeBubble(st.cur);
      st.cur = makeQueued('color', randomShotColor());
    }
    st.next = st.shots > 1 ? makeQueued('color', randomShotColor()) : null;
    if (st.surge >= SURGE_MAX) chargeSurge();
  }
  function swap() {
    if (st.phase !== 'aim' || !st.next || !st.cur) return;
    const c = st.cur;
    st.cur = st.next;
    st.next = c;
    st.cur.born = 0.6;
    st.next.born = 0.6;
    C.sfx.chip();
  }
  function chargeSurge() {
    st.surge = 0;
    const target = st.next || st.cur;
    if (!target) return;
    const s = makeQueued('surge', 0);
    s.group.position.copy(target.group.position);
    disposeBubble(target);
    if (target === st.next) st.next = s; else st.cur = s;
    C.popup('SURGE READY', 0, GUN_Z - 3, 'hyper');
    C.sfx.power();
    C.spawnRing(0, GUN_Z, 0xffffff, 5, 0.5);
    C.hype(0.2, 0xffffff, 0, GUN_Z);
  }

  // ================================================================ shots
  const muzzle = () => (gun ? gun.muzzle : 1.8);
  function shotOrigin() {
    const L = muzzle() + 0.4;
    return [Math.sin(st.aim) * L, GUN_Z - Math.cos(st.aim) * L];
  }

  function collide(x, z) {
    let best = null, bd = HIT_D;
    cells.forEach((b) => {
      const d = Math.hypot(b.wx - x, b.wz - z);
      if (d < bd) { bd = d; best = b; }
    });
    return best;
  }

  // Follows a shot along its path (bouncing off the side walls) to where it sticks.
  // Returns { pts, x, z, hit } — hit is a bubble, 'ceiling', or null (flew off the top).
  function trace(x, z, dx, dz, maxLen) {
    const pts = [[x, z]];
    let len = 0;
    const step = 0.3;
    while (len < maxLen) {
      x += dx * step;
      z += dz * step;
      len += step;
      if (x < -WALL_X) { x = -2 * WALL_X - x; dx = -dx; pts.push([x, z]); }
      else if (x > WALL_X) { x = 2 * WALL_X - x; dx = -dx; pts.push([x, z]); }
      const hit = collide(x, z);
      if (hit) { pts.push([x, z]); return { pts, x, z, hit, dx, dz }; }
      if (st.type !== 'rescue' && z <= ceilZ()) { pts.push([x, ceilZ()]); return { pts, x, z: ceilZ(), hit: 'ceiling', dx, dz }; }
      if (z < K.TOP_Z + BR) { pts.push([x, z]); return { pts, x, z, hit: null, dx, dz }; }
    }
    pts.push([x, z]);
    return { pts, x, z, hit: null, dx, dz };
  }

  // the free grid cell a shot sticks to after touching `hit` at (x, z)
  function attachCell(x, z, hit) {
    const cands = [];
    const push = (q, r) => { if (validCell(q, r) && !cells.has(key(q, r))) cands.push([q, r]); };
    const [rq, rr] = worldCell(x, z);
    push(rq, rr);
    if (hit && hit !== 'ceiling') NEIGH.forEach(([dq, dr]) => push(hit.q + dq, hit.r + dr));
    else if (hit === 'ceiling') for (let c = 0; c < COLS; c++) push(c, 0);
    let best = null, bd = Infinity;
    cands.forEach(([q, r]) => {
      const [wx, wz] = cellWorld(q, r);
      const d = Math.hypot(wx - x, wz - z);
      if (d < bd) { bd = d; best = [q, r]; }
    });
    return best;
  }

  function fire() {
    if (!st.active || st.phase !== 'aim' || !st.cur || st.shots <= 0) return;
    const [x, z] = shotOrigin();
    const b = st.cur;
    st.cur = null;
    st.shots--;
    st.shot = { b, x, z, dx: Math.sin(st.aim), dz: -Math.cos(st.aim) };
    st.phase = 'fly';
    st.recoil = 1;
    st.killedVirus = false;
    hideAim();
    C.sfx.launch();
    C.burst(x, 1, z, b.kind === 'surge' ? 0xffffff : COLORS[b.color], 14, 6, 0.3, 0.6, 1);
    renderHud();
  }

  function stepShot(dt) {
    const s = st.shot;
    let left = SHOT_SPEED * dt;
    while (left > 0 && st.shot) {
      const step = Math.min(0.3, left);
      left -= step;
      s.x += s.dx * step;
      s.z += s.dz * step;
      if (s.x < -WALL_X || s.x > WALL_X) {
        s.x = s.x < 0 ? -2 * WALL_X - s.x : 2 * WALL_X - s.x;
        s.dx = -s.dx;
        C.sfx.wall();
        C.wallFlash(s.x < 0 ? 'left' : 'right');
        C.burst(s.x, 1, s.z, 0xffffff, 6, 4, 0.2, 0.4);
      }
      const hit = collide(s.x, s.z);
      if (hit || (st.type !== 'rescue' && s.z <= ceilZ())) { land(hit || 'ceiling'); return; }
      if (s.z < K.TOP_Z + BR) { miss(); return; }
    }
    s.b.group.position.set(s.x, BR, s.z);
    s.b.group.rotation.y += dt * 10;
    C.emit(s.x, BR, s.z, 0, 0, 0, s.b.kind === 'surge' ? 0xffffff : COLORS[s.b.color], 0.8, 0.25, 0, 0);
  }

  function miss() {
    const s = st.shot;
    st.shot = null;
    C.burst(s.x, 1, s.z, 0xffffff, 16, 6, 0.4, 0.6, 1);
    C.popup('MISS', s.x, s.z + 1, 'big');
    disposeBubble(s.b);
    later(0.35, afterShot);
    st.phase = 'resolve';
  }

  function land(hit) {
    const s = st.shot;
    st.shot = null;
    st.phase = 'resolve';
    const x = s.x, z = s.z;
    // the RESCUE cluster spins from the impact
    if (st.type === 'rescue') {
      const rx = x - CORE_X, rz = z - CORE_Z;
      st.omega += (rx * s.dz - rz * s.dx) * 0.085;
    }
    // every bubble near the impact jiggles
    cells.forEach((b) => {
      const d = Math.hypot(b.wx - x, b.wz - z);
      if (d < 7) { b.wob = Math.max(b.wob, 1 - d / 7); b.wdx = (b.wx - x) / (d || 1); b.wdz = (b.wz - z) / (d || 1); }
    });
    if (s.b.kind === 'surge') { blast(x, z, 2.3, s.b, 'SURGE', 0xffffff); return; }
    const cell = attachCell(x, z, hit);
    if (!cell) { disposeBubble(s.b); later(0.3, afterShot); return; }
    const [q, r] = cell;
    const b = s.b;
    b.q = q;
    b.r = r;
    b.wob = 0;
    b.flash = 1;
    const [wx, wz] = cellWorld(q, r);
    b.wx = wx;
    b.wz = wz;
    b.group.rotation.set(0, 0, 0);
    cells.set(key(q, r), b);
    C.sfx.solid();
    C.spawnRing(wx, wz, COLORS[b.color], 2.4, 0.25);
    const group = matchGroup(b);
    let delay = 0.1;
    if (group.length >= 3) delay = popGroup(group, b);
    else st.combo = 0;
    later(delay, settle);
  }

  // same colour (wildcards join any group); encrypted bubbles never take part
  function matchGroup(start) {
    const out = [start], seen = new Set([key(start.q, start.r)]);
    for (let i = 0; i < out.length; i++) {
      const b = out[i];
      NEIGH.forEach(([dq, dr]) => {
        const k = key(b.q + dq, b.r + dr);
        const n = cells.get(k);
        if (!n || seen.has(k)) return;
        if (!(n.kind === 'wild' || (matchable(n) && n.color === start.color))) return;
        seen.add(k);
        out.push(n);
      });
    }
    return out;
  }

  const feverK = () => (C.fever ? 2 : 1);
  // pops a matched group outward from the impact; returns how long it takes
  function popGroup(group, origin) {
    const big = group.length >= 10 ? 2 : group.length >= 6 ? 1.5 : 1;
    st.combo = (st.combo || 0) + 1;
    group.sort((a, b) => Math.hypot(a.wx - origin.wx, a.wz - origin.wz) - Math.hypot(b.wx - origin.wx, b.wz - origin.wz));
    const pts = Math.round(10 * big * feverK());
    const popped = [];
    group.forEach((b, i) => { if (removeCell(b)) { st.score += pts; st.surge += 1; popped.push(b); st.pops.push({ b, t: -i * 0.035, pts, i }); } });
    bossDamage(popped.length, origin.wx, origin.wz);
    C.hype(Math.min(0.6, 0.04 + group.length * 0.025), COLORS[origin.color], origin.wx, origin.wz);
    if (group.length >= 6) later(0.1, () => C.popup(group.length >= 10 ? 'MEGA PURGE ×2' : 'BIG POP ×1.5', origin.wx, origin.wz - 1.5, 'hyper'));
    if (st.combo >= 3) later(0.15, () => C.popup(st.combo + ' SHOT STREAK', origin.wx, origin.wz - 2.4, 'pu'));
    const tail = afterPop(popped, group.length * 0.035);
    return Math.max(group.length * 0.035 + 0.15, tail);
  }

  // takes a bubble off the grid (false if it was already gone) and counts goals
  function removeCell(b) {
    const k = key(b.q, b.r);
    if (cells.get(k) !== b) return false;
    cells.delete(k);
    if (b.kind === 'virus') { st.viruses--; st.killedVirus = true; }
    if (b.ammo) grantAmmo(b);
    return true;
  }
  function grantAmmo(b) {
    st.shots += 3;
    later(0.05, () => { C.popup('+3 SHOTS', b.wx, b.wz - 1, 'hyper'); C.sfx.life(); C.burst(b.wx, 1, b.wz, 0xffc933, 20, 6, 0.5, 0.8, 2); renderHud(); });
  }

  // side effects of popped bubbles: neighbouring cages crack, bombs go off, zappers fire
  function afterPop(popped, at) {
    let tail = 0;
    const bombs = new Set(), cracks = new Set(), zaps = [];
    popped.forEach((b) => {
      if (b.zap) zaps.push(b);
      NEIGH.forEach(([dq, dr]) => {
        const n = cells.get(key(b.q + dq, b.r + dr));
        if (!n) return;
        if (n.kind === 'bomb') bombs.add(n);
        if (n.lock) cracks.add(n);
      });
    });
    cracks.forEach((n) => later(at, () => { if (cells.get(key(n.q, n.r)) === n && n.lock) unlock(n); }));
    zaps.forEach((z, i) => { tail = Math.max(tail, at + 0.15 + i * 0.2); schedule(at + 0.15 + i * 0.2, () => zapRow(z)); });
    [...bombs].forEach((bm, i) => { tail = Math.max(tail, at + 0.25 + i * 0.25); schedule(at + 0.25 + i * 0.25, () => { if (cells.get(key(bm.q, bm.r)) === bm) blast(bm.wx, bm.wz, 2.1, bm, 'BOMB', 0xff7a2a); }); });
    return tail + 0.35;
  }

  // lightning through the zapper's row (or its ring around the sprite)
  function zapRow(z) {
    const same = [];
    cells.forEach((b) => {
      if (b.kind === 'core' || b.kind === 'chip') return;
      if (st.type === 'rescue' ? axDist(b.q, b.r) === axDist(z.q, z.r) : b.r === z.r) same.push(b);
    });
    if (st.type !== 'rescue') {
      const zz = z.wz;
      C.lightning(-K.HALF_W, zz, K.HALF_W, zz, 0xffe070);
      C.lightning(-K.HALF_W, zz + 0.3, K.HALF_W, zz - 0.3, 0xffffff);
    } else same.forEach((b, i) => { if (i) C.lightning(same[i - 1].wx, same[i - 1].wz, b.wx, b.wz, 0xffe070); });
    C.sfx.zap();
    C.addShake(0.3);
    C.popup('ZAP ×' + same.length, z.wx, z.wz - 1.5, 'hyper');
    C.hype(0.3, 0xffe070, z.wx, z.wz);
    const popped = [];
    same.forEach((b, i) => { if (removeCell(b)) { st.score += 15 * feverK(); popped.push(b); st.pops.push({ b, t: -i * 0.02, pts: 15, i }); } });
    bossDamage(popped.length, z.wx, z.wz);
    afterPop(popped, 0.2);
  }

  // SURGE orb and DATA BOMB: everything within `rings` cells goes (the sprite and chips excepted)
  function blast(x, z, rings, src, label, color) {
    if (src && cells.get(key(src.q, src.r)) === src) removeCell(src);
    if (src) { st.pops.push({ b: src, t: 0, pts: 0, i: 0 }); }
    C.sfx.explode();
    C.addShake(0.5);
    C.flashLight(x, z, color, 8);
    C.spawnRing(x, z, color, 9, 0.5);
    C.spawnRing(x, z, 0xffffff, 5, 0.3);
    C.burst(x, 1, z, color, 40, 10, 0.6, 1, 2);
    C.hype(0.45, color, x, z);
    const hit = [];
    cells.forEach((b) => { if (b.kind !== 'core' && b.kind !== 'chip' && Math.hypot(b.wx - x, b.wz - z) < BR * 2 * rings) hit.push(b); });
    hit.sort((a, b) => Math.hypot(a.wx - x, a.wz - z) - Math.hypot(b.wx - x, b.wz - z));
    const popped = [];
    hit.forEach((b, i) => { if (removeCell(b)) { st.score += 15 * feverK(); popped.push(b); st.pops.push({ b, t: -i * 0.025, pts: 15, i }); } });
    bossDamage(popped.length + (label === 'SURGE' ? 5 : 2), x, z);
    C.popup(label + ' ×' + hit.length, x, z - 1.5, 'hyper');
    const tail = afterPop(popped, hit.length * 0.025);
    if (label === 'SURGE') later(Math.max(hit.length * 0.025 + 0.2, tail), settle);
  }

  // everything no longer hanging on the ceiling (or on the caged sprite) falls
  function dropFloating() {
    const anchored = new Set();
    const queue = [];
    cells.forEach((b, k) => {
      if ((st.type === 'rescue' && b.kind === 'core') || (st.type !== 'rescue' && b.r === 0)) { anchored.add(k); queue.push(b); }
    });
    while (queue.length) {
      const b = queue.pop();
      NEIGH.forEach(([dq, dr]) => {
        const k = key(b.q + dq, b.r + dr);
        if (!anchored.has(k) && cells.has(k)) { anchored.add(k); queue.push(cells.get(k)); }
      });
    }
    const drop = [];
    cells.forEach((b, k) => { if (!anchored.has(k) && b.kind !== 'core') drop.push(b); });
    drop.forEach((b, i) => {
      removeCell(b);
      st.surge += 2;
      makeFaller(b, i * 0.012);
    });
    if (drop.length) {
      bossDamage(drop.length * 2, drop[0].wx, drop[0].wz);
      C.hype(Math.min(0.7, 0.06 + drop.length * 0.03), 0xffc933, drop[0].wx, drop[0].wz);
    }
    if (drop.length >= 4) C.popup('DROP ×' + drop.length, drop[0].wx, drop[0].wz, 'pu');
    return drop.length;
  }

  function makeFaller(b, delay) {
    st.fallers.push({ b, x: b.wx, z: b.wz, y: BR, vx: rand(-3.5, 3.5), vz: rand(-3, 1), vy: rand(5, 9), delay, spin: rand(-8, 8) });
  }

  // ------------------------------------------------------------- boss
  function bossDamage(n, x, z) {
    if (st.type !== 'boss' || n <= 0 || st.bossHp <= 0) return;
    st.bossHp = Math.max(0, st.bossHp - n);
    C.sentinelFlash();
    // a damage streak flies up to the Sentinel
    const b = beams.find((q) => q.life <= 0);
    if (b) beamLine(b, x, z, 0, K.TOP_Z + 1, 0xff9ab0, 0.3);
    if (n >= 4) C.addShake(0.15);
    renderHud();
  }
  function beamLine(b, x0, z0, x1, z1, color, dur) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 0.01;
    b.m.position.set((x0 + x1) / 2, 1.2, (z0 + z1) / 2);
    b.m.rotation.set(0, -Math.atan2(dz, dx), 0);
    b.m.scale.set(len, 1, 1);
    b.m.material.color.setHex(color);
    b.m.visible = true;
    b.life = b.max = dur;
  }
  // every 3 shots the Sentinel presses the firewall down or corrupts bubbles into blocks
  function bossAttack() {
    st.bossMove = (st.bossMove + 1) % 2;
    C.sfx.bossHit();
    C.glitch(0.4);
    C.addShake(0.5);
    if (st.bossMove === 1) {
      pushPress('THE SENTINEL PRESSES THE FIREWALL');
    } else {
      const list = [];
      cells.forEach((b) => { if (b.kind === 'color' && !b.lock) list.push(b); });
      list.sort(() => Math.random() - 0.5);
      list.slice(0, st.def.path === 'hard' ? 4 : 3).forEach((b, i) => {
        const bm = beams[i];
        beamLine(bm, 0, K.TOP_Z + 1, b.wx, b.wz, 0xff2a4d, 0.5);
        later(0.25, () => {
          if (cells.get(key(b.q, b.r)) !== b) return;
          disposeBubble(b);
          cells.delete(key(b.q, b.r));
          place(b.q, b.r, 'block', 0);
          C.burst(b.wx, 1, b.wz, 0xff2a4d, 16, 6, 0.4, 0.7, 1);
        });
      });
      C.showBanner('SENTINEL', 'CORRUPTION', 'BUBBLES TURNED INTO FIREWALL BLOCKS', true);
    }
  }
  // the firewall rebuilds when the Sentinel runs out of wall to hide behind
  function bossRebuild() {
    let n = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < COLS; c++) {
        const q = c - Math.floor(r / 2);
        if (!cells.has(key(q, r)) && Math.random() < 0.8) { place(q, r, Math.random() < 0.1 ? 'block' : 'color', Math.floor(Math.random() * st.def.nColors)).flash = 1; n++; }
      }
    }
    if (n) C.showBanner('SENTINEL', 'FIREWALL REBUILT', 'KEEP HITTING IT', true);
  }

  function pushPress(sub) {
    st.press++;
    C.sfx.solid();
    C.addShake(0.4);
    C.showBanner('WARNING', 'FIREWALL PRESS', sub || 'THE WALL MOVES DOWN ONE ROW', true);
    cells.forEach((b) => { b.wob = 0.8; b.wdx = 0; b.wdz = 1; });
  }

  // worms infect a neighbour when a whole round of shots kills no virus
  function spreadWorms() {
    const worms = [];
    cells.forEach((b) => { if (b.kind === 'virus' && b.worm) worms.push(b); });
    let spread = 0;
    worms.forEach((w) => {
      const near = NEIGH.map(([dq, dr]) => cells.get(key(w.q + dq, w.r + dr))).filter((n) => n && n.kind === 'color' && !n.lock);
      if (!near.length) return;
      const v = pick(near);
      disposeBubble(v);
      cells.delete(key(v.q, v.r));
      place(v.q, v.r, 'virus', v.color, { worm: true }).flash = 1;
      C.lightning(w.wx, w.wz, v.wx, v.wz, 0x2dff5a);
      C.burst(v.wx, 1, v.wz, 0x2dff5a, 18, 5, 0.5, 0.7, 1);
      spread++;
    });
    if (spread) { C.popup('WORMS SPREAD +' + spread, 0, -6, 'big'); C.sfx.poison(); st.virusTotal = Math.max(st.virusTotal, st.viruses); }
  }

  // ---------------------------------------------------------- after a shot
  function goalDone() {
    if (st.type === 'breach') { for (const b of cells.values()) if (b.r === 0) return false; return true; }
    if (st.type === 'purge') return st.viruses <= 0;
    if (st.type === 'extract') return st.chipsGot >= st.def.chips;
    if (st.type === 'boss') return st.bossHp <= 0;
    return NEIGH.every(([dq, dr]) => !cells.has(key(dq, dr)));
  }
  function breached() {
    if (st.type === 'rescue') return false;
    for (const b of cells.values()) if (b.wz > DANGER_Z) return true;
    return false;
  }

  function afterShot() {
    if (!st.active || st.phase === 'win' || st.phase === 'end') return;
    // chips still falling decide an EXTRACT level
    if (st.type === 'extract' && st.fallers.some((f) => f.b.kind === 'chip')) { later(0.25, afterShot); return; }
    renderHud();
    if (goalDone()) { win(); return; }
    // hazards that tick with every shot
    let pending = 0;
    if (st.def.crush) {
      st.crushT--;
      if (st.crushT <= 0) { st.crushT = st.def.crush; pushPress(); pending = 0.45; }
    }
    if (st.def.wormEvery) {
      if (st.killedVirus) st.wormT = st.def.wormEvery;
      else if (--st.wormT <= 0) { st.wormT = st.def.wormEvery; spreadWorms(); pending = Math.max(pending, 0.4); }
    }
    cells.forEach((b) => {
      if (!b.shift) return;
      const n = (b.color + 1 + Math.floor(Math.random() * (st.def.nColors - 1))) % st.def.nColors;
      recolor(b, n);
      b.flash = 1;
    });
    if (st.type === 'boss') {
      st.bossT--;
      if (st.bossT <= 0) { st.bossT = 3; bossAttack(); pending = Math.max(pending, 0.6); }
      if (cells.size < 8) later(pending + 0.1, bossRebuild);
    }
    later(pending + 0.05, () => {
      if (!st.active || st.phase === 'win' || st.phase === 'end') return;
      renderHud();
      if (breached()) { fail('breach'); return; }
      if (st.shots <= 0) { fail('shots'); return; }
      loadNext();
      st.phase = 'aim';
      st.phaseT = 0;
      renderHud();
    });
  }

  // ---------------------------------------------------------- win / lose
  function win() {
    st.phase = 'win';
    hideAim();
    C.sfx.clear();
    if (st.type === 'rescue') freeCore();
    if (st.type === 'boss') {
      C.sentinel('dead');
      C.glitch(1);
      C.addShake(1);
      C.sfx.explode();
      for (let i = 0; i < 6; i++) later(i * 0.12, () => C.burst(rand(-4, 4), 2, K.TOP_Z + rand(1, 3), pick([0xff2a4d, 0xffc933, 0xffffff]), 30, 10, 0.8, 1, 3));
    }
    C.hype(1, st.type === 'boss' ? 0xffc933 : 0xff3cf2, 0, -6);
    const title = { rescue: 'SPRITE FREED!', purge: 'PURGE COMPLETE', extract: 'CHIPS EXTRACTED', boss: 'SENTINEL DOWN!', breach: 'FIREWALL BREACHED' }[st.type];
    C.showBanner((st.path === 'hard' ? 'HARD · ' : '') + 'LEVEL ' + st.level, title, GOALS[st.type].name + ' // CLEAR');
    // whatever is left drops into the sinks as a bonus
    later(0.7, () => {
      const rest = [];
      cells.forEach((b) => { if (b.kind !== 'core') rest.push(b); });
      rest.forEach((b, i) => { cells.delete(key(b.q, b.r)); makeFaller(b, i * 0.015); });
    });
    // unused shots fire into the sky as fireworks: OVERCLOCK BONUS
    const bonus = st.shots;
    [st.cur, st.next].forEach((b) => { if (b) disposeBubble(b); });
    st.cur = st.next = null;
    for (let i = 0; i < bonus; i++) {
      later(1.4 + i * 0.16, () => {
        st.shots--;
        st.score += 150 * feverK();
        const b = makeBubble('color', Math.floor(Math.random() * st.def.nColors));
        st.flyers.push({ b, x: rand(-2, 2), z: GUN_Z - 2, vz: -rand(38, 48), vx: rand(-8, 8), pts: 150 * feverK() });
        C.sfx.launch();
        renderHud();
      });
    }
    if (bonus) later(1.2, () => C.popup('OVERCLOCK BONUS ×' + bonus, 0, GUN_Z - 5, 'hyper'));
    later(2.2 + bonus * 0.16, () => finish(true));
  }

  function freeCore() {
    const core = cells.get('0,0');
    if (!core) return;
    cells.delete('0,0');
    st.freed = true;
    st.score += 1000 * feverK();
    C.popup('+' + 1000 * feverK(), core.wx, core.wz - 1.4, 'hyper');
    C.spawnDebris(core.wx, core.wz, 0x19e6ff, 10);
    C.spawnRing(core.wx, core.wz, 0xdffbff, 8, 0.6);
    C.burst(core.wx, 1.5, core.wz, 0xdffbff, 50, 10, 0.8, 1, 3);
    C.flashLight(core.wx, core.wz, 0xdffbff, 10);
    C.sfx.jackpot();
    if (core.cage) core.cage.visible = false;
    st.flyers.push({ b: core, x: core.wx, z: core.wz, vz: -14, vx: 0, sprite: true, t: 0 });
  }

  function fail(reason) {
    st.phase = 'end';
    hideAim();
    C.sfx.lose();
    C.glitch(0.6);
    if (reason === 'breach') C.showBanner('LEVEL ' + st.level, 'FIREWALL BREACH', 'THE WALL REACHED YOUR LINE', true);
    else C.showBanner('LEVEL ' + st.level, 'OUT OF SHOTS', GOALS[st.type].name + ' FAILED', true);
    later(1.4, () => finish(false, reason));
  }

  function starsFor(score) { return 1 + (score >= st.def.t2 ? 1 : 0) + (score >= st.def.t3 ? 1 : 0); }

  function finish(won, reason) {
    st.phase = 'end';
    const n = st.level, track = save[st.path];
    const res = { won, reason, level: n, path: st.path, score: st.score, stars: 0, coins: 0, tokens: 0, first: false, best: false, unlockedHard: false };
    if (won) {
      res.stars = starsFor(st.score);
      const before = track.stars[n] || 0;
      const wasOpen = hardOpen();
      res.first = !before;
      res.best = st.score > (track.best[n] || 0);
      const base = st.def.coins * (1 + 0.35 * res.stars);
      res.coins = C.awardCoins(Math.round(res.first ? base : base * 0.35 + Math.max(0, res.stars - before) * 10));
      if (st.path === 'hard' && res.stars === 3 && before < 3) res.tokens = C.awardTokens(1) || 1;
      track.stars[n] = Math.max(before, res.stars);
      track.best[n] = Math.max(track.best[n] || 0, st.score);
      if (n >= track.max && n < LEVELS) track.max = n + 1;
      res.unlockedHard = !wasOpen && hardOpen();
      commit();
    }
    st.result = res;
    showResult(res);
  }

  // ============================================================ aiming
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BR);
  const hitV = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  function pointerFloor() {
    const p = C.pointer();
    if (!p) return null;
    ndc.set(p.x, p.y);
    ray.setFromCamera(ndc, C.refCam);
    return ray.ray.intersectPlane(plane, hitV) ? hitV : null;
  }

  function readInput(dt) {
    const turn = (st.keyR ? 1 : 0) - (st.keyL ? 1 : 0);
    if (turn) { st.aim = clamp(st.aim + turn * 1.2 * dt, -MAX_AIM, MAX_AIM); st.mouseAim = false; }
    const p = pointerFloor();
    if (p && (p.x !== st.px || p.z !== st.pz)) { st.px = p.x; st.pz = p.z; st.mouseAim = true; }
    if (st.mouseAim && p && !BOT && p.z < GUN_Z - 1) st.aim = clamp(Math.atan2(p.x, -(p.z - GUN_Z)), -MAX_AIM, MAX_AIM);
  }

  function showAim() {
    const [x, z] = shotOrigin();
    const tr = trace(x, z, Math.sin(st.aim), -Math.cos(st.aim), 70);
    const col = st.cur.kind === 'surge' ? 0xffffff : COLORS[st.cur.color];
    aimMat.color.setHex(col);
    const spacing = 1.1;
    let di = 0, offset = (st.t * 4) % spacing, walked = 0;
    for (let i = 1; i < tr.pts.length && di < aimDots.length; i++) {
      const [x0, z0] = tr.pts[i - 1], [x1, z1] = tr.pts[i];
      const l = Math.hypot(x1 - x0, z1 - z0);
      for (let s = offset; s < l && di < aimDots.length; s += spacing) {
        const d = aimDots[di++], k = s / l;
        d.visible = true;
        d.position.set(lerp(x0, x1, k), BR, lerp(z0, z1, k));
        const sc = 0.75 - Math.min(0.45, (walked + s) / 90);
        d.scale.set(sc, sc, 1);
      }
      offset = (offset - l) % spacing;
      if (offset < 0) offset += spacing;
      walked += l;
    }
    for (; di < aimDots.length; di++) aimDots[di].visible = false;
    const cell = tr.hit && st.cur.kind !== 'surge' ? attachCell(tr.x, tr.z, tr.hit) : null;
    ghost.visible = !!cell;
    if (cell) {
      const [gx, gz] = cellWorld(cell[0], cell[1]);
      ghost.position.set(gx, BR, gz);
      ghost.material.color.setHex(col);
      ghost.material.opacity = 0.18 + Math.sin(st.t * 8) * 0.08;
    }
  }
  function hideAim() {
    aimDots.forEach((d) => { d.visible = false; });
    if (ghost) ghost.visible = false;
  }

  // test autopilot: tries a fan of angles and takes the one that pops the most
  function botThink() {
    if (st.phaseT < 0.35) return;
    let best = null, bestScore = -1;
    for (let a = -1.25; a <= 1.25; a += 0.04) {
      const L = muzzle() + 0.4;
      const tr = trace(Math.sin(a) * L, GUN_Z - Math.cos(a) * L, Math.sin(a), -Math.cos(a), 70);
      if (!tr.hit) continue;
      let score = 0;
      if (st.cur.kind === 'surge') score = 5;
      else {
        const cell = attachCell(tr.x, tr.z, tr.hit);
        if (!cell) continue;
        const [q, r] = cell;
        const fake = { q, r, color: st.cur.color, kind: 'color' };
        cells.set(key(q, r), fake);
        score = matchGroup(fake).length;
        cells.delete(key(q, r));
        if (score < 3) score = cellWorld(q, r)[1] > DANGER_Z - RH * 2 ? -1 : 0.5;
        if (st.type === 'rescue') score += 3 - Math.min(3, axDist(q, r)) * 0.5;
      }
      score += Math.random() * 0.5;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    st.aim = best === null ? rand(-1, 1) : best;
    fire();
  }

  // ============================================================== HUD
  function renderHud() {
    if (!st.def) return;
    $('bb-level').textContent = (st.path === 'hard' ? 'H' : '') + st.level;
    $('bb-score').textContent = fmt(st.score);
    $('bb-shots-n').textContent = Math.max(0, st.shots);
    $('bb-shots').classList.toggle('low', st.shots <= 5);
    const k = clamp(st.score / st.def.t3, 0, 1);
    $('bb-fill').style.width = (k * 100).toFixed(1) + '%';
    $('bb-s2').style.left = ((100 * st.def.t2) / st.def.t3).toFixed(1) + '%';
    $('bb-s2').classList.toggle('on', st.score >= st.def.t2);
    $('bb-s3').classList.toggle('on', st.score >= st.def.t3);
    let goal;
    if (st.type === 'rescue') goal = (st.freed ? 1 : 0) + ' / 1';
    else if (st.type === 'purge') goal = Math.max(0, st.viruses) + ' LEFT';
    else if (st.type === 'extract') goal = st.chipsGot + ' / ' + st.def.chips;
    else if (st.type === 'boss') goal = Math.ceil((100 * st.bossHp) / st.bossMax) + '%';
    else { let top = 0; cells.forEach((b) => { if (b.r === 0) top++; }); goal = top + ' LEFT'; }
    $('bb-goal-txt').textContent = goal;
    $('bb-surge-fill').style.width = (100 * Math.min(1, st.surge / SURGE_MAX)).toFixed(1) + '%';
    // hazard counters
    const warn = [];
    if (st.def.crush) warn.push(`<span class="${st.crushT <= 1 ? 'hot' : ''}">PRESS IN <b>${st.crushT}</b></span>`);
    if (st.def.wormEvery) warn.push(`<span class="${st.wormT <= 1 ? 'hot' : ''}">WORMS SPREAD IN <b>${st.wormT}</b></span>`);
    if (st.type === 'boss') warn.push(`<span class="${st.bossT <= 1 ? 'hot' : ''}">SENTINEL STRIKES IN <b>${st.bossT}</b></span>`);
    $('bb-warn').innerHTML = warn.join('');
    $('bb-boss').classList.toggle('hidden', st.type !== 'boss');
    if (st.type === 'boss') $('bb-boss-fill').style.width = ((100 * st.bossHp) / st.bossMax).toFixed(1) + '%';
  }

  const pv = new THREE.Vector3();
  function placeHud() {
    const at = (x, y, z) => { pv.set(x, y, z).project(C.camera); return [((pv.x + 1) / 2) * window.innerWidth, ((1 - pv.y) / 2) * window.innerHeight]; };
    const [sx, sy] = at(3.6, 0, GUN_Z);
    $('bb-shots').style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(0, -50%)`;
    const [nx, ny] = at(-3.4, 0, GUN_Z + 1.5);
    $('bb-next-lbl').style.transform = `translate(${nx.toFixed(0)}px, ${ny.toFixed(0)}px) translate(-50%, 0)`;
    $('bb-next-lbl').classList.toggle('hidden', !st.next || st.phase !== 'aim');
  }

  function showResult(res) {
    const el = $('bb-result');
    el.className = 'bb-result ' + (res.won ? 'win' : 'lose');
    $('bb-res-kicker').textContent = (res.path === 'hard' ? 'HARD PATH · ' : '') + 'LEVEL ' + res.level + ' · ' + GOALS[st.type].name;
    $('bb-res-title').textContent = res.won ? 'LEVEL CLEAR' : res.reason === 'breach' ? 'FIREWALL BREACH' : 'OUT OF SHOTS';
    $('bb-res-stars').innerHTML = [1, 2, 3].map((i) => `<i class="${res.won && i <= res.stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.22}s">★</i>`).join('');
    $('bb-res-score').textContent = fmt(res.score);
    $('bb-res-loot').innerHTML = res.won
      ? `<span class="coin"><i class="coin-icon"></i> +${fmt(res.coins)}</span>` +
        (res.tokens ? `<span class="coin tok"><i class="token-icon"></i> +${res.tokens}</span>` : '') +
        (res.best ? '<span class="best">NEW BEST</span>' : '') + (res.first ? '<span class="first">FIRST CLEAR</span>' : '') +
        (res.unlockedHard ? '<span class="hardnew">HARD PATH UNLOCKED!</span>' : '')
      : `<span class="tip">${res.reason === 'breach' ? 'Pop the low bubbles first and drop whole chunks.' : 'Bank shots off the walls and drop big chunks for points.'}</span>`;
    const btns = [];
    if (res.won && res.level < LEVELS) btns.push({ label: 'NEXT LEVEL ›', cls: '', fn: () => play(res.path, res.level + 1) });
    if (!res.won && res.reason === 'shots' && st.continues < 2) {
      const price = continuePrice();
      btns.push({ label: `+5 SHOTS · ◈ ${price}`, cls: 'gold', fn: () => continueLevel(price), off: P.coins < price });
    }
    btns.push({ label: res.won ? 'REPLAY' : 'RETRY', cls: 'alt', fn: () => play(res.path, res.level) });
    btns.push({ label: 'LEVEL MAP', cls: 'ghost', fn: () => { C.exitMode(); openMap(); } });
    const wrap = $('bb-res-buttons');
    wrap.innerHTML = '';
    btns.forEach((b) => {
      const e = document.createElement('button');
      e.className = 'btn small ' + b.cls;
      e.textContent = b.label;
      e.disabled = !!b.off;
      e.addEventListener('click', () => { C.sfx.click(); b.fn(); });
      wrap.appendChild(e);
    });
    el.classList.remove('hidden');
    document.body.classList.remove('playing');
  }
  const continuePrice = () => 40 + st.level * 3 + st.continues * 60 + (st.path === 'hard' ? 40 : 0);
  function continueLevel(price) {
    if (!P.spend(price)) { C.sfx.error(); return; }
    st.continues++;
    st.shots += 5;
    $('bb-result').classList.add('hidden');
    document.body.classList.add('playing');
    C.popup('+5 SHOTS', 0, GUN_Z - 3, 'hyper');
    st.phase = 'resolve';
    later(0.2, afterShot);
  }

  // ------------------------------------------------------------ tutorials
  function tutCard(id) {
    const t = TUTS[id];
    const img = t.model ? `<img alt="" src="${bubbleIcon(t.model)}">` : `<span class="bb-tut-svg">${t.svg}</span>`;
    return `<div class="bb-tut-img" style="--tc:${t.color || '#19e6ff'}">${img}</div><h3>${t.title}</h3><p>${t.text}</p>`;
  }
  function showTutorial(list, back) {
    st.tut = { list, i: 0 };
    st.back = back;
    st.phase = 'tutorial';
    hideAim();
    renderTut();
    $('bb-tut').classList.remove('hidden');
  }
  function renderTut() {
    const { list, i } = st.tut;
    $('bb-tut-card').innerHTML = tutCard(list[i]);
    $('bb-tut-kicker').textContent = list.length > 1 ? `NEW IN THIS LEVEL · ${i + 1} / ${list.length}` : 'NEW IN THIS LEVEL';
    $('bb-tut-next').textContent = i < list.length - 1 ? 'NEXT ›' : 'GOT IT — PLAY';
    $('bb-tut-dots').innerHTML = list.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  }
  function nextTut() {
    if (!st.tut) return;
    C.sfx.click();
    st.tut.i++;
    if (st.tut.i < st.tut.list.length) { renderTut(); return; }
    st.tut.list.forEach((id) => { if (!save.seen.includes(id)) save.seen.push(id); });
    commit();
    st.tut = null;
    $('bb-tut').classList.add('hidden');
    st.phase = st.back;
    st.phaseT = 0;
    if (st.back === 'intro') later(0.3, beginPlay);
  }
  // the "?" button: every mechanic of this level, any time
  function helpTut() {
    if (st.phase !== 'aim') return;
    C.sfx.click();
    showTutorial(levelTopics(st.def), st.phase);
  }

  // ============================================================ per frame
  function updateBubbles(dt) {
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    let low = -Infinity;
    cells.forEach((b) => {
      const lx = 2 * BR * (b.q + b.r / 2), lz = RH * b.r;
      let tx, tz;
      if (st.type === 'rescue') { tx = CORE_X + lx * c - lz * s; tz = CORE_Z + lx * s + lz * c; }
      else { tx = X0 + lx; tz = ceilZ() + lz; }
      // the press slides the wall smoothly instead of teleporting it
      b.wx = tx;
      b.wz = st.type === 'rescue' ? tz : damp(b.wz, tz, 10, dt);
      low = Math.max(low, b.wz);
      b.wob = Math.max(0, b.wob - dt * 2.2);
      const w = Math.sin((1 - b.wob) * 18) * b.wob * 0.35;
      b.flash = Math.max(0, b.flash - dt * 3);
      const sc = 1 + b.flash * 0.18;
      b.group.position.set(b.wx + (b.wdx || 0) * w, BR + Math.sin(st.t * 2 + b.q * 0.7 + b.r) * 0.04, b.wz + (b.wdz || 0) * w);
      b.group.scale.setScalar(sc);
      if (b.ring) b.ring.rotation.set(b.tilt + Math.sin(st.t + b.spin) * 0.2, st.t * 0.8 + b.spin, 0);
      if (b.shift && b.body) b.body.visible = Math.random() > 0.04;   // glitch flicker
      if (b.cage && b.lock) b.cage.rotation.y += dt * 0.6;
      if (b.extra) b.extra.update(dt, st.t);
    });
    // the danger line glows harder the closer the wall gets
    const near = clamp(1 - (DANGER_Z - low) / (RH * 3), 0, 1);
    dangerLine.material.opacity = 0.25 + near * (0.45 + Math.sin(st.t * 10) * 0.25);
    press.position.z = damp(press.position.z, ceilZ() - BR - 0.55, 8, dt);
    circuitTex.offset.x = (circuitTex.offset.x + dt * 0.03) % 1;
  }

  function updatePops(dt) {
    for (let i = st.pops.length - 1; i >= 0; i--) {
      const p = st.pops[i];
      const was = p.t;
      p.t += dt;
      if (was < 0 && p.t >= 0) {
        const col = p.b.kind === 'block' ? 0xff2a4d : p.b.kind === 'bomb' ? 0xff7a2a : p.b.kind === 'wild' || p.b.kind === 'surge' ? 0xffffff : COLORS[p.b.color];
        C.burst(p.b.wx, BR, p.b.wz, col, 16, 7, 0.4, 0.7, 1);
        C.spawnRing(p.b.wx, p.b.wz, col, 2.6, 0.3);
        if (p.i % 2 === 0) C.spawnDebris(p.b.wx, p.b.wz, col, 2);   // hex shards
        C.sfx.brick(Math.min(12, p.i));
        if (p.pts && p.i < 12) C.popup(String(p.pts), p.b.wx, p.b.wz, p.i >= 5 ? 'hot' : '');
        if (p.b.kind === 'virus') { C.popup(p.b.worm ? 'WORM DELETED' : 'VIRUS DELETED', p.b.wx, p.b.wz - 1.2, 'tox'); C.spawnDebris(p.b.wx, p.b.wz, col, 5); }
      }
      if (p.t >= 0) {
        const k = p.t / 0.14;
        p.b.group.scale.setScalar(1 + k * 0.5);
        if (k >= 1) { disposeBubble(p.b); st.pops.splice(i, 1); renderHud(); }
      }
    }
  }

  function updateFallers(dt) {
    const w = (K.HALF_W * 2) / SINKS.length;
    for (let i = st.fallers.length - 1; i >= 0; i--) {
      const f = st.fallers[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.vy -= 32 * dt;
      f.y += f.vy * dt;
      if (f.y < BR) { f.y = BR; f.vy = Math.abs(f.vy) * 0.35; }
      f.vz += 40 * dt;
      f.x = clamp(f.x + f.vx * dt, -WALL_X, WALL_X);
      f.z += f.vz * dt;
      f.b.group.position.set(f.x, f.y, f.z);
      f.b.group.rotation.x += f.spin * dt;
      f.b.group.rotation.z += f.spin * 0.6 * dt;
      if (f.z >= SINK_Z) {
        const si = clamp(Math.floor((f.x + K.HALF_W) / w), 0, SINKS.length - 1);
        const chip = f.b.kind === 'chip';
        const pts = (chip ? 250 : 20) * SINKS[si] * feverK();
        st.score += pts;
        const sk = sinks[si];
        sk.flash = 1;
        C.burst(f.x, 1, SINK_Z, chip ? 0xffc933 : sk.col, chip ? 30 : 10, chip ? 8 : 5, 0.4, 0.6, 2);
        if (chip) {
          st.chipsGot++;
          C.popup('CHIP EXTRACTED +' + pts, f.x, SINK_Z - 1, 'hyper');
          C.sfx.jackpot();
          C.hype(0.35, 0xffc933, f.x, SINK_Z);
        } else if (Math.random() < 0.5) C.popup('+' + pts, f.x, SINK_Z - 0.6, SINKS[si] >= 3 ? 'hot' : 'coin');
        C.sfx.coin();
        disposeBubble(f.b);
        st.fallers.splice(i, 1);
        renderHud();
      }
    }
  }

  function updateFlyers(dt) {
    for (let i = st.flyers.length - 1; i >= 0; i--) {
      const f = st.flyers[i];
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      if (f.sprite) {
        f.t += dt;
        f.vz -= 10 * dt;
        f.b.group.position.set(f.x, BR + f.t * 6, f.z);
        f.b.group.rotation.y += dt * 6;
        C.emit(f.x, BR + f.t * 6, f.z, 0, 0, 0, 0xdffbff, 1.2, 0.4, 0, 0);
        if (f.t > 2) { disposeBubble(f.b); st.flyers.splice(i, 1); }
        continue;
      }
      f.b.group.position.set(f.x, BR, f.z);
      C.emit(f.x, BR, f.z, 0, 0, 0, COLORS[f.b.color], 0.9, 0.3, 0, 0);
      if (f.z < K.TOP_Z + 4) {
        const col = COLORS[f.b.color];
        C.burst(f.x, 2, f.z, col, 30, 11, 0.7, 1, 3);
        C.burst(f.x, 2, f.z, 0xffffff, 10, 6, 0.4, 0.6, 2);
        C.spawnRing(f.x, f.z, col, 4, 0.4);
        C.popup('+' + f.pts, f.x, f.z + 1, 'hot');
        C.sfx.nova();
        C.hype(0.12, col, f.x, f.z);
        disposeBubble(f.b);
        st.flyers.splice(i, 1);
      }
    }
  }

  function updateLauncher(dt) {
    st.recoil = Math.max(0, st.recoil - dt * 6);
    if (!gun) return;
    gun.group.position.set(0, 0.02, GUN_Z);
    gun.turret.rotation.y = damp(gun.turret.rotation.y, -st.aim, 20, dt);
    gun.update(dt, C.time, { recoil: st.recoil });
    const [ox, oz] = shotOrigin();
    [st.cur, st.next].forEach((b, i) => {
      if (!b) return;
      b.born = Math.max(0, b.born - dt * 4);
      if (i === 0) {
        b.group.position.set(ox, BR + b.born * 1.5, oz);
        b.group.scale.setScalar(1 - b.born * 0.5);
      } else {
        b.group.position.set(-3.4, BR * 0.75 + Math.sin(st.t * 3) * 0.08, GUN_Z + 0.4);
        b.group.scale.setScalar(0.72 * (1 - b.born * 0.4));
      }
      if (b.ring) b.ring.rotation.y += dt * 3;
      if (b.extra) b.extra.update(dt, st.t);
    });
    C.paddleLight.color.setHex(gun.color);
    C.paddleLight.position.set(0, 1.6, GUN_Z - 0.8);
    C.paddleLight.intensity = 1.4;
    sinks.forEach((s) => {
      s.flash = Math.max(0, s.flash - dt * 4);
      s.floor.material.opacity = 0.22 + s.flash * 0.6;
    });
    for (const b of beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; continue; }
      b.m.material.opacity = b.life / b.max;
    }
    // the Sentinel winds up before it strikes
    if (st.type === 'boss' && st.bossHp > 0 && st.bossT <= 1) C.sentinelCharge(0.4 + Math.sin(st.t * 8) * 0.3);
  }

  function update(dt) {
    if (!st.active) return;
    st.t += dt;
    st.phaseT += dt;
    if (st.timers.length) {
      const due = [];
      st.timers = st.timers.filter((tm) => { tm.t -= dt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
      due.forEach((tm) => tm.fn());
      if (!st.active) return;
    }
    if (st.type === 'rescue') {
      st.rot += st.omega * dt;
      st.omega *= Math.exp(-dt * 0.9);
    }
    if (st.phase === 'aim') {
      readInput(dt);
      if (st.cur) showAim();
      if (BOT) botThink();
    }
    if (st.phase === 'tutorial' && BOT && st.phaseT > 0.3) { st.phaseT = 0; nextTut(); }
    if (st.phase === 'fly' && st.shot) stepShot(dt);
    updateBubbles(dt);
    updatePops(dt);
    updateFallers(dt);
    updateFlyers(dt);
    updateLauncher(dt);
    placeHud();
    C.setFocusX(Math.sin(st.aim) * 6);
    const s = st.shot;
    if (s) {
      C.ballLight.position.set(s.x, 1.6, s.z);
      C.ballLight.color.setHex(s.b.kind === 'surge' ? 0xffffff : COLORS[s.b.color]);
      C.ballLight.intensity = 1.3;
    } else C.ballLight.intensity = 0;
  }

  // ============================================================ lifecycle
  function start(opts) {
    init();
    stop();
    save = loadSave();
    const path = (opts && opts.path) || (QS.get('bpath') === 'hard' ? 'hard' : 'classic');
    const n = clamp((opts && opts.level) || parseInt(QS.get('blevel'), 10) || save[path].max, 1, LEVELS);
    const def = levelDef(path, n);
    st.active = true;
    st.touchAim = false;
    st.path = path;
    st.level = n;
    st.def = def;
    st.type = def.goal;
    st.phase = 'intro';
    st.phaseT = 0;
    st.t = 0;
    st.score = 0;
    st.shots = def.shots;
    st.surge = 0;
    st.combo = 0;
    st.aim = 0;
    st.rot = 0;
    st.omega = st.type === 'rescue' ? 0.25 : 0;
    st.viruses = 0;
    st.freed = false;
    st.chipsGot = 0;
    st.press = 0;
    st.crushT = def.crush;
    st.wormT = def.wormEvery;
    st.bossT = 3;
    st.bossMove = 0;
    st.bossHp = st.bossMax = def.bossHp;
    st.continues = 0;
    st.chain = 0;
    st.result = null;
    def.cells.forEach((c) => place(c.q, c.r, c.kind, c.color, c.flags));
    st.virusTotal = st.viruses;
    cells.forEach((b) => { b.flash = 1; b.wob = 0.6; b.wdx = 0; b.wdz = -1; });
    gun = M.makeGun(P.equippedId('gun'));
    gun.group.position.set(0, 0, GUN_Z);
    scene.add(gun.group);
    sinkGroup.visible = true;
    dangerLine.visible = st.type !== 'rescue';
    press.visible = !!def.crush;
    press.position.set(0, 0, ceilZ() - BR - 0.55);
    if (st.type === 'boss') C.sentinel('boss', 'SENTINEL'); else C.sentinel('dormant', 'BUBBLES');
    $('bb-hud').classList.remove('hidden');
    $('bb-hud').classList.toggle('hard', path === 'hard');
    $('bb-result').classList.add('hidden');
    $('bb-tut').classList.add('hidden');
    $('bb-goal-ic').innerHTML = GOALS[st.type].icon;
    $('bb-goal').style.setProperty('--gc', GOALS[st.type].color);
    $('bb-goal').title = GOALS[st.type].goal;
    $('bb-hint').classList.toggle('hidden', !(path === 'classic' && n <= 2));
    const ch = chapterOf(path, n);
    C.showBanner((path === 'hard' ? 'HARD · ' : '') + 'LEVEL ' + n + ' · ' + GOALS[st.type].name, st.type === 'boss' ? 'BOSS: SENTINEL' : ch.name, GOALS[st.type].goal, st.type === 'boss');
    C.sfx.start();
    renderHud();
    // first time you meet something: explain it before the first shot
    const fresh = levelTopics(def).filter((id) => !save.seen.includes(id));
    later(0.9, () => { if (fresh.length) showTutorial(fresh, 'intro'); else beginPlay(); });
  }
  function beginPlay() {
    if (!st.active || st.phase === 'aim') return;
    loadNext();
    st.phase = 'aim';
    st.phaseT = 0;
    renderHud();
  }

  function stop() {
    st.active = false;
    st.phase = 'idle';
    st.timers = [];
    st.tut = null;
    cells.forEach(disposeBubble);
    cells.clear();
    [st.cur, st.next, st.shot && st.shot.b].forEach((b) => { if (b) disposeBubble(b); });
    st.cur = st.next = st.shot = null;
    st.pops.forEach((p) => disposeBubble(p.b));
    st.fallers.forEach((f) => disposeBubble(f.b));
    st.flyers.forEach((f) => disposeBubble(f.b));
    st.pops = [];
    st.fallers = [];
    st.flyers = [];
    if (gun) { scene.remove(gun.group); gun = null; }
    if (inited) {
      sinkGroup.visible = false;
      dangerLine.visible = false;
      press.visible = false;
      beams.forEach((b) => { b.m.visible = false; b.life = 0; });
      hideAim();
      C.ballLight.intensity = 0;
    }
    ['bb-hud', 'bb-result', 'bb-tut'].forEach((id) => $(id).classList.add('hidden'));
  }

  function play(path, n) {
    closeMap();
    $('bb-result').classList.add('hidden');
    NEON.game.startMode('bubble', { path, level: n });
  }

  function pointerDown(e) {
    if (!st.active) return;
    if (e && e.button === 2) { swap(); return; }
    // a click on the NEXT bubble swaps instead of shooting (a finger gets a bigger target)
    const touch = !!e && e.pointerType === 'touch';
    const p = pointerFloor();
    if (p && st.next && Math.hypot(p.x + 3.4, p.z - (GUN_Z + 0.4)) < (touch ? 2.4 : 1.6)) { swap(); return; }
    // touch: the finger aims while it is down, the bubble flies when it lets go
    if (touch) { st.touchAim = true; return; }
    fire();
  }
  function pointerUp() {
    if (!st.touchAim) return;
    st.touchAim = false;
    readInput(0);   // a quick tap can start and end between two frames
    // letting go down at the gun cancels the shot
    const p = pointerFloor();
    if (p && p.z < GUN_Z - 1) fire();
  }

  $('bb-tut-next').addEventListener('click', nextTut);
  $('bb-help').addEventListener('click', helpTut);
  window.addEventListener('contextmenu', (e) => { if (st.active) e.preventDefault(); });
  window.addEventListener('keydown', (e) => {
    if (!st.active || !$('screen-settings').classList.contains('hidden')) return;
    const k = e.key;
    if (st.phase === 'tutorial' && (k === 'Enter' || k === ' ')) { e.preventDefault(); e.stopImmediatePropagation(); nextTut(); return; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') st.keyL = true;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') st.keyR = true;
    else if (k === 's' || k === 'S' || k === 'q' || k === 'Q' || k === 'Tab') { e.preventDefault(); swap(); }
    else if (k === 'h' || k === 'H' || k === '?') helpTut();
  }, true);
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') st.keyL = false;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') st.keyR = false;
  });
  window.addEventListener('blur', () => { st.keyL = st.keyR = st.touchAim = false; });

  // ============================================================ level map
  const STEP = 128;
  let mapBuilt = '', sel = 0;
  const mapPath = () => save.path;

  function mapLayout(W) {
    const H = LEVELS * STEP + 420;
    const A = Math.min(W * 0.3, 230);
    const pts = [];
    for (let i = 0; i < LEVELS; i++) pts.push({ x: W / 2 + A * Math.sin(i * 0.78) + (i % 2 ? 1 : -1) * Math.min(18, W * 0.02), y: H - 240 - i * STEP });
    return { H, pts };
  }
  function smoothPath(pts) {
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function buildMap() {
    const path = mapPath();
    const world = $('bm-world');
    const W = world.clientWidth || 600;
    const { H, pts } = mapLayout(W);
    const chapters = PATHS[path].chapters;
    world.style.height = H + 'px';
    const rnd = mulberry(path === 'hard' ? 77 : 99);
    let html = '';
    chapters.forEach((ch, ci) => {
      const next = chapters[ci + 1];
      const yTop = next ? pts[next.from - 1].y + STEP / 2 : 0;
      const yBot = ci === 0 ? H : pts[ch.from - 1].y + STEP / 2;
      html += `<div class="bm-zone z${ci}" style="top:${yTop}px;height:${yBot - yTop}px;--c1:${ch.c1};--c2:${ch.c2}"></div>`;
      const py = pts[ch.from - 1].y + STEP * 0.62;
      html += `<div class="bm-chapter" style="top:${py}px;--c1:${ch.c1};--c2:${ch.c2}"><span>${path === 'hard' ? 'HARD · ' : ''}CHAPTER ${ci + 1}</span><b>${ch.name}</b></div>`;
    });
    const plates = chapters.map((ch) => pts[ch.from - 1].y + STEP * 0.62);
    for (let i = 0; i < LEVELS; i++) {
      const p = pts[i];
      const side = p.x > W / 2 ? -1 : 1;
      const x = clamp(p.x + side * (120 + rnd() * 110), 30, W - 30);
      const y = p.y - 20 - rnd() * 60;
      const kind = ['tower', 'chip', 'holo', 'antenna', 'server', 'orb'][Math.floor(rnd() * 6)];
      const s = 0.7 + rnd() * 0.7;
      if (pts.some((q) => Math.hypot(q.x - x, q.y - y) < 95) || plates.some((py) => Math.abs(py - y) < 70)) continue;
      const ch = chapterOf(path, i + 1);
      html += `<i class="bm-deco ${kind}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--c1:${ch.c1};--c2:${ch.c2};--s:${s.toFixed(2)}"></i>`;
    }
    const d = smoothPath(pts);
    html += `<svg class="bm-path" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path class="glow" d="${d}"/><path class="base" d="${d}"/><path class="dash" d="${d}"/><path class="done" id="bm-done" d="${d}"/></svg>`;
    html += `<div class="bm-reactor" style="left:${pts[0].x}px;top:${pts[0].y + 118}px"><i></i><i></i><i></i><span>${path === 'hard' ? 'BLACK REACTOR' : 'DATA REACTOR'}</span></div>`;
    for (let i = 0; i < LEVELS; i++) {
      const n = i + 1, p = pts[i], g = GOALS[goalFor(path, n, available(path, n))];
      const ch = chapterOf(path, n);
      html += `<button class="bm-node${n % 10 === 0 ? ' boss' : ''}" data-n="${n}" style="left:${p.x}px;top:${p.y}px;--c1:${ch.c1};--c2:${ch.c2};--tc:${g.color}">` +
        `<span class="bm-hex"><b>${n}</b></span><span class="bm-type">${g.icon}</span><span class="bm-stars"><i></i><i></i><i></i></span></button>`;
    }
    html += '<div class="bm-me" id="bm-me"><i></i></div>';
    world.innerHTML = html;
    world.querySelectorAll('.bm-node').forEach((b) => b.addEventListener('click', () => {
      const n = +b.dataset.n;
      if (n > save[mapPath()].max) { C.sfx.error(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
      C.sfx.click();
      showPanel(n);
    }));
    mapBuilt = path + W;
    world._pts = pts;
  }

  function refreshMap() {
    const path = mapPath(), track = save[path];
    const world = $('bm-world');
    if (mapBuilt !== path + world.clientWidth) buildMap();
    world.querySelectorAll('.bm-node').forEach((b) => {
      const n = +b.dataset.n, s = track.stars[n] || 0;
      b.classList.toggle('locked', n > track.max);
      b.classList.toggle('cur', n === track.max);
      b.classList.toggle('done', s > 0);
      b.querySelectorAll('.bm-stars i').forEach((e, i) => e.classList.toggle('on', i < s));
    });
    const pts = world._pts, cur = pts[track.max - 1];
    const me = $('bm-me');
    me.style.left = cur.x + 'px';
    me.style.top = cur.y + 'px';
    const done = $('bm-done');
    const total = done.getTotalLength ? done.getTotalLength() : 0;
    if (total) {
      const frac = (track.max - 1) / (LEVELS - 1);
      done.style.strokeDasharray = total + ' ' + total;
      done.style.strokeDashoffset = String(total * (1 - frac));
    }
    $('bm-stars').textContent = starsOf(path) + ' / ' + LEVELS * 3;
    $('screen-bubble').classList.toggle('hard', path === 'hard');
    $('bm-kicker').textContent = PATHS[path].kicker;
    document.querySelectorAll('#bm-paths button').forEach((b) => {
      b.classList.toggle('on', b.dataset.p === path);
      if (b.dataset.p === 'hard') {
        b.classList.toggle('locked', !hardOpen());
        b.title = hardOpen() ? 'The hard path: fewer shots, everything at once, double rewards' : 'Clear CLASSIC level ' + HARD_UNLOCK + ' to unlock';
      }
    });
  }

  function setPath(p) {
    if (p === 'hard' && !hardOpen()) {
      C.sfx.error();
      const b = document.querySelector('#bm-paths button[data-p="hard"]');
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
      return;
    }
    if (save.path === p) return;
    C.sfx.click();
    save.path = p;
    commit();
    hidePanel();
    refreshMap();
    scrollToCurrent();
  }
  function scrollToCurrent() {
    const world = $('bm-world'), sc = $('bm-scroll');
    const cur = world._pts[save[mapPath()].max - 1];
    sc.scrollTop = Math.max(0, cur.y - sc.clientHeight * 0.6);
  }

  function showPanel(n) {
    sel = n;
    const path = mapPath();
    const def = levelDef(path, n), g = GOALS[def.goal], ch = chapterOf(path, n);
    const s = save[path].stars[n] || 0;
    const el = $('bm-panel');
    el.style.setProperty('--c1', ch.c1);
    el.style.setProperty('--c2', ch.c2);
    el.style.setProperty('--tc', g.color);
    $('bm-p-kicker').textContent = (path === 'hard' ? 'HARD · ' : '') + ch.name + ' · LEVEL ' + n;
    $('bm-p-type').innerHTML = g.icon + '<b>' + g.name + '</b>';
    $('bm-p-goal').textContent = g.goal;
    $('bm-p-stars').innerHTML = [1, 2, 3].map((i) => `<i class="${i <= s ? 'on' : ''}">★</i>`).join('');
    const topics = levelTopics(def).filter((id) => id !== def.goal && id !== 'basics' && id !== 'hard');
    $('bm-p-feats').innerHTML = topics.map((id) => `<span class="${save.seen.includes(id) ? '' : 'new'}" title="${TUTS[id].text.replace(/<[^>]+>/g, '')}">${TUTS[id].title}</span>`).join('');
    $('bm-p-info').innerHTML =
      `<div><span>SHOTS</span><b>${def.shots}</b></div>` +
      `<div><span>COLOURS</span><b class="dots">${COLORS.slice(0, def.nColors).map((c) => `<i style="--c:${css(c)}"></i>`).join('')}</b></div>` +
      `<div><span>★★ / ★★★</span><b>${fmt(def.t2)} / ${fmt(def.t3)}</b></div>` +
      `<div><span>BEST</span><b>${save[path].best[n] ? fmt(save[path].best[n]) : '—'}</b></div>` +
      `<div><span>REWARD</span><b><i class="coin-icon"></i> ${fmt(def.coins * (s ? 0.35 : 1))}+${path === 'hard' && s < 3 ? ' · <i class="token-icon"></i> 1 for ★★★' : ''}</b></div>`;
    el.classList.remove('hidden');
  }
  function hidePanel() { $('bm-panel').classList.add('hidden'); }

  function openMap() {
    save = loadSave();
    if (save.path === 'hard' && !hardOpen()) save.path = 'classic';
    NEON.game.hideTitle();
    NEON.game.setMenuOpen(true);
    NEON.game.setOccluded(true);
    $('screen-modes').classList.add('hidden');
    $('screen-bubble').classList.remove('hidden');
    document.body.classList.add('bubble-open');
    hidePanel();
    refreshMap();
    scrollToCurrent();
  }
  function closeMap() {
    $('screen-bubble').classList.add('hidden');
    document.body.classList.remove('bubble-open');
    NEON.game.setOccluded(false);
    NEON.game.setMenuOpen(false);
  }

  $('bm-back').addEventListener('click', () => { C.sfx.click(); if (!$('bm-panel').classList.contains('hidden')) { hidePanel(); return; } closeMap(); NEON.game.showTitle(); });
  $('bm-p-close').addEventListener('click', () => { C.sfx.click(); hidePanel(); });
  $('bm-p-play').addEventListener('click', () => { C.sfx.click(); play(mapPath(), sel); });
  $('bm-panel').addEventListener('click', (e) => { if (e.target.id === 'bm-panel') hidePanel(); });
  document.querySelectorAll('#bm-paths button').forEach((b) => b.addEventListener('click', () => setPath(b.dataset.p)));
  window.addEventListener('resize', () => { if (!$('screen-bubble').classList.contains('hidden')) refreshMap(); });
  window.addEventListener('keydown', (e) => {
    if ($('screen-bubble').classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.stopPropagation(); $('bm-back').click(); }
    else if ((e.key === 'Enter' || e.key === ' ') && !$('bm-panel').classList.contains('hidden') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); play(mapPath(), sel); }
  });

  NEON.bubble = {
    start, stop, update, fire, pointerDown, pointerUp, openMap, closeMap,
    best: () => starsOf('classic') + starsOf('hard'), levelDef,
  };
})();
