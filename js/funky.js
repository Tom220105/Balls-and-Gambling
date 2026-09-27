/* ==========================================================================
   BALLS & GAMBLING — FUNKY BALLS
   --------------------------------------------------------------------------
   A turn-based mode: every brick carries a number (its HP). Your Cybergun
   rides the bottom line — slide it, aim, and fire your whole magazine in one
   volley. There is no bouncepad: balls ricochet until they fall back onto the
   line, and the next volley starts where the first ball landed. After each
   turn the wall moves down one row; if a brick reaches the line, it's over.
   Destroyed bricks give XP: every level-up deals three random perk cards
   (Electro, Poison, Splitter, ...) to choose from, each upgradable to level 3.
   Once two cards are maxed out, every further level-up is worth +1 ball.
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
  const QS = new URLSearchParams(location.search);
  const BOT = QS.has('bot');   // test autopilot

  // ----------------------------------------------------------- layout
  const COLS = 7;
  const CW = (K.HALF_W * 2) / COLS;          // cell width
  const TOP = K.TOP_Z + 1.4;                 // first row starts below the Sentinel's jaw
  const LINE_Z = K.PADDLE_Z;                 // the rail the Cybergun rides on
  // a brick pushed into the last row touches the line: 8 rows on the classic arena,
  // the longer phone arena (js/spiel.js ARENA_EXTRA) gets extra rows of the same size
  const ROWS = Math.max(8, Math.round((LINE_Z - 2 - TOP) / 3.575));
  const CD = (LINE_Z - 2 - TOP) / ROWS;      // cell depth
  const R = K.BALL_R;
  const BHW = CW / 2 - 0.14, BHD = CD / 2 - 0.14, BH = 1.0;
  const GUN_Z = LINE_Z + 0.9;                // gun pivot sits just behind the line
  const REST_Z = LINE_Z - 0.2;               // landed balls rest here
  const WALL_X = K.HALF_W - R;
  const BASE_SPEED = 30;
  const FIRE_GAP = 0.075;
  const MAX_AIM = 1.28;                      // ~73 degrees either side of straight up
  const BEST_KEY = 'neonSigil.best.funky';
  const HP_COLORS = [0x19e6ff, 0x8dff2a, 0xffc933, 0xff9a1f, 0xff3cf2, 0xff2a4d].map((c) => new THREE.Color(c));
  const CH = 0.5;                            // corner chamfer of the brick hull
  const WHITE = new THREE.Color(0xffffff);

  const cellX = (col) => -K.HALF_W + CW * (col + 0.5);
  const cellZ = (row) => TOP + CD * (row + 0.5);

  // --------------------------------------------------- level-up cards
  const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const CARDS = [
    { id: 'electro', name: 'ELECTRO BALL', color: 0x19e6ff,
      icon: svg('<path class="f" d="M13.5 1.5 4 13.5h6.5L9 22.5 20 9.5h-6.8z"/>'),
      chance: [0, 0.25, 0.35, 0.5], arcs: [0, 2, 3, 4],
      desc: (l) => `${[0, 25, 35, 50][l]}% chance per hit to arc 1 damage into up to ${[0, 2, 3, 4][l]} nearby bricks.` },
    { id: 'poison', name: 'POISON', color: 0x8dff2a,
      icon: svg('<path class="f" d="M12 2c-3 4.6-6.5 8.4-6.5 12.3a6.5 6.5 0 0 0 13 0C18.5 10.4 15 6.6 12 2z"/><circle class="e" cx="9.6" cy="14.5" r="1.6"/><circle class="e" cx="14.4" cy="14.5" r="1.6"/><path class="k" d="M10 18.6h4"/>'),
      desc: (l) => `Every brick you hit takes ${l} extra poison damage at the end of the turn.` },
    { id: 'splitter', name: 'SPLITTER', color: 0xff3cf2,
      icon: svg('<circle class="f" cx="6.5" cy="17" r="4"/><circle class="f" cx="17.5" cy="17" r="4"/><path class="s" d="M12 2.5v6m0 0-4.5 4m4.5-4 4.5 4"/>'),
      chance: [0, 0.15, 0.2, 0.25],
      desc: (l) => `${[0, 15, 20, 25][l]}% chance per hit to split the ball in two. The split ball only lives for this volley.` },
    { id: 'crit', name: 'CRIT MATRIX', color: 0xff2a4d,
      icon: svg('<circle class="s" cx="12" cy="12" r="7.5"/><circle class="f" cx="12" cy="12" r="2.2"/><path class="s" d="M12 1.5v5m0 11v5M1.5 12h5m11 0h5"/>'),
      chance: [0, 0.1, 0.2, 0.3],
      desc: (l) => `${l * 10}% chance per hit to deal double damage.` },
    { id: 'pierce', name: 'PIERCER', color: 0xff9a1f,
      icon: svg('<path class="s" d="M8 9.5V5.5h8v4M8 14.5v4h8v-4"/><path class="s" d="M1.5 12h19m-4.5-4.5 4.5 4.5-4.5 4.5"/>'),
      chance: [0, 0.25, 0.45, 0.65],
      desc: (l) => `${[0, 25, 45, 65][l]}% chance to smash straight through a brick it destroys instead of bouncing.` },
    { id: 'miner', name: 'COIN MINER', color: 0xffc933,
      icon: svg('<path class="f" d="M12 2 21 8.5 12 22 3 8.5z"/><path class="k" d="M3 8.5h18M8 8.5 12 22l4-13.5L12 2 8 8.5"/>'),
      chance: [0, 0.1, 0.18, 0.26],
      desc: (l) => `Destroyed bricks have a ${[0, 10, 18, 26][l]}% chance to drop 2 coins.` },
  ];
  const CARD = {};
  CARDS.forEach((c) => { CARD[c.id] = c; });
  const MAX_CARD = 3;
  const xpNeed = (lvl) => 3 + lvl * 2;       // XP from level `lvl` to the next: 5, 7, 9, ...
  const MAX_SPLITS = 30;                     // split balls per volley

  // ------------------------------------------------------------ state
  const st = {
    inited: false, active: false, phase: 'idle', phaseT: 0, t: 0,
    turn: 0, ballCount: 1, bonusNext: 0, best: 0, coins: 0,
    gunX: 0, gunTargetX: 0, aim: 0, mouseAim: false, lastPX: 0, lastPZ: 0, dragging: false, touchAim: false,
    keyL: false, keyR: false, keyAL: false, keyAR: false,
    volleyAim: 0, volleyX: 0, fired: 0, fireT: 0, flyT: 0, ff: false,
    firstX: null, landed: 0, hits: 0, combo: 0, forkUsed: false, recoil: 0,
    ballId: 'core', gunId: 'pistol',
    level: 1, xp: 0, pendingCards: 0, cards: {}, slots: 1, offer: [], splits: 0, arcBudget: 0, critPopT: -1,
  };
  let grid = [];
  const bricks = [];
  const pickups = [];
  let balls = [];
  const pool = [];
  const ghostPool = [];
  const aimDots = [];
  let gun = null, rail = null, railMat = null, aimDotMat = null;
  let plusMat = null;
  const parts = {};   // shared brick geometry + textures

  // chamfered brick outline grown (+) or shrunk (-) by `off`; shape y ends up on world z
  function outline(off, path) {
    const hw = BHW - 0.09 + off, hd = BHD - 0.09 + off, c = CH + off * 0.586;
    const s = path || new THREE.Shape();
    s.moveTo(-hw + c, -hd);
    s.lineTo(hw - c, -hd);
    s.lineTo(hw, -hd + c);
    s.lineTo(hw, hd - c);
    s.lineTo(hw - c, hd);
    s.lineTo(-hw + c, hd);
    s.lineTo(-hw, hd - c);
    s.lineTo(-hw, -hd + c);
    s.closePath();
    return s;
  }

  function ringGeo(outer, inner, depth, y) {
    const s = outline(outer);
    s.holes.push(outline(inner, new THREE.Path()));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);   // extrude upward
    g.translate(0, y, 0);
    return g;
  }

  // emissive map for the hull sides: vent slits and a seam, lit in the brick's HP colour.
  // Side-wall UVs run u = along the wall (world units), v = 1 - height above the lower bevel.
  function ventCanvas() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, 104, 256, 3);                  // seam under the top bevel
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const x0 of [22, 150]) {                // two groups of vent slits per tile
      for (let k = 0; k < 4; k++) g.fillRect(x0 + k * 14, 50, 7, 36);
    }
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(126, 40, 2, 60);                  // panel seam
    return c;
  }

  function buildBrickParts() {
    const hull = new THREE.ExtrudeGeometry(outline(0), {
      depth: BH - 0.18, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 1, curveSegments: 1,
    });
    hull.rotateX(-Math.PI / 2);
    hull.translate(0, -BH / 2 + 0.09, 0);
    parts.hull = hull;
    parts.band = ringGeo(0.125, 0.07, 0.12, -BH / 2 + 0.2);        // neon light strip around the sides
    parts.frame = ringGeo(-0.05, -0.19, 0.035, BH / 2 - 0.001);   // neon trim around the top screen
    parts.screen = new THREE.PlaneGeometry(2 * (BHW - 0.28), 2 * (BHD - 0.28));
    parts.screen.rotateX(-Math.PI / 2);
    parts.under = new THREE.PlaneGeometry(BHW * 2 + 1.7, BHD * 2 + 1.7);
    parts.under.rotateX(-Math.PI / 2);
    const vent = new THREE.CanvasTexture(ventCanvas());
    vent.wrapS = THREE.RepeatWrapping;
    vent.repeat.set(0.4, 1);
    vent.anisotropy = 4;
    parts.vent = vent;
  }

  function init() {
    if (st.inited) return;
    st.inited = true;
    buildBrickParts();

    // the glowing rail along the bottom line
    rail = new THREE.Group();
    railMat = new THREE.MeshBasicMaterial({ color: 0x19e6ff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(K.HALF_W * 2, 0.08, 0.14), railMat);
    bar.position.set(0, 0.06, LINE_Z);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(K.HALF_W * 2, 1.6), new THREE.MeshBasicMaterial({
      map: M.glowTex, color: 0x19e6ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.set(0, 0.04, LINE_Z);
    rail.add(bar, sheen);
    const tickGeo = new THREE.BoxGeometry(0.06, 0.1, 0.5);
    for (let c = 0; c <= COLS; c++) {
      const t = new THREE.Mesh(tickGeo, railMat);
      t.position.set(-K.HALF_W + c * CW, 0.06, LINE_Z);
      rail.add(t);
    }
    rail.visible = false;
    scene.add(rail);

    // aim preview dots
    aimDotMat = new THREE.SpriteMaterial({ map: M.glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 170; i++) {
      const s = new THREE.Sprite(aimDotMat);
      s.visible = false;
      scene.add(s);
      aimDots.push(s);
    }

    // "+1" label for ball orbs
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '900 64px Orbitron, "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(4,2,13,0.8)';
    g.strokeText('+1', 64, 68);
    g.fillStyle = '#d8ffb0';
    g.fillText('+1', 64, 68);
    const tex = new THREE.CanvasTexture(c);
    plusMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  }

  // ----------------------------------------------------------- bricks
  const tmpCol = new THREE.Color();
  function hpColor(hp) {
    const ratio = hp / Math.max(1, baseHp(st.turn));
    const t = clamp((ratio - 0.3) / 1.7, 0, 1) * (HP_COLORS.length - 1);
    const i = Math.min(HP_COLORS.length - 2, Math.floor(t));
    return tmpCol.copy(HP_COLORS[i]).lerp(HP_COLORS[i + 1], t - i).getHex();
  }

  // circuit traces on the brick's top screen: short 45-degree runs in from the edges
  function makeTraces() {
    const out = [];
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const side = Math.floor(Math.random() * 4), p = rand(52, 204);
      let x, y, dx, dy;
      if (side === 0) { x = p; y = 0; dx = 0; dy = 1; }
      else if (side === 1) { x = 256; y = p; dx = -1; dy = 0; }
      else if (side === 2) { x = p; y = 256; dx = 0; dy = -1; }
      else { x = 0; y = p; dx = 1; dy = 0; }
      const pts = [[x, y]];
      const segs = 2 + Math.floor(Math.random() * 2);
      for (let s = 0; s < segs; s++) {
        const len = rand(16, 40);
        x += dx * len;
        y += dy * len;
        pts.push([x, y]);
        const a = Math.atan2(dy, dx) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 4;
        dx = Math.cos(a);
        dy = Math.sin(a);
      }
      out.push(pts);
    }
    return out;
  }

  // the holo screen on top of a brick: circuit board, HP number and HP meter
  function drawScreen(b) {
    const g = b.ctx, S = 256, c = 35;
    const color = hpColor(b.hp);
    const r = (color >> 16) & 255, gr = (color >> 8) & 255, bl = color & 255;
    const rgba = (a) => `rgba(${r},${gr},${bl},${a})`;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.moveTo(c, 0); g.lineTo(S - c, 0); g.lineTo(S, c); g.lineTo(S, S - c);
    g.lineTo(S - c, S); g.lineTo(c, S); g.lineTo(0, S - c); g.lineTo(0, c);
    g.closePath();
    const bg = g.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, '#0c1024');
    bg.addColorStop(1, '#04050e');
    g.fillStyle = bg;
    g.fill();
    g.clip();
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = rgba(0.34);
    g.fillStyle = rgba(0.6);
    for (const tr of b.traces) {
      g.beginPath();
      tr.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      const [ex, ey] = tr[tr.length - 1];
      g.beginPath();
      g.arc(ex, ey, 5, 0, Math.PI * 2);
      g.fill();
    }
    // dark core behind the number so it always reads cleanly
    const sh = g.createRadialGradient(128, 118, 12, 128, 118, 112);
    sh.addColorStop(0, 'rgba(4,5,14,0.94)');
    sh.addColorStop(1, 'rgba(4,5,14,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < S; y += 6) g.fillRect(0, y, S, 2);
    g.restore();

    // chamfer brackets and an ID tag
    g.strokeStyle = rgba(0.9);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(9, c + 8); g.lineTo(c + 8, 9);
    g.moveTo(S - 9, c + 8); g.lineTo(S - c - 8, 9);
    g.moveTo(9, S - c - 8); g.lineTo(c + 8, S - 9);
    g.moveTo(S - 9, S - c - 8); g.lineTo(S - c - 8, S - 9);
    g.stroke();
    g.font = '700 17px Consolas, "Courier New", monospace';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = rgba(0.65);
    g.fillText(b.tag, 46, 24);
    if (b.poison) {
      g.fillStyle = '#8dff2a';
      g.textAlign = 'right';
      g.fillText('TOX', S - 46, 24);
    }

    // HP meter
    const segs = 10, lit = Math.ceil((clamp(b.hp, 0, b.maxHp) / b.maxHp) * segs);
    for (let i = 0; i < segs; i++) {
      g.fillStyle = i < lit ? rgba(0.95) : 'rgba(255,255,255,0.1)';
      g.fillRect(58 + i * 14.4, 222, 10, 12);
    }

    const txt = String(Math.max(0, b.hp));
    const size = txt.length <= 2 ? 128 : txt.length === 3 ? 96 : 74;
    g.font = `900 ${size}px Orbitron, "Arial Black", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 28;
    g.strokeStyle = rgba(0.4);
    g.strokeText(txt, 128, 122);
    g.lineWidth = 16;
    g.strokeStyle = 'rgba(4,2,13,0.95)';
    g.strokeText(txt, 128, 122);
    g.fillStyle = '#ffffff';
    g.fillText(txt, 128, 122);

    b.tex.needsUpdate = true;
    b.mat.emissive.setHex(color);
    b.mat.userData.rimColor.value.setHex(color);
    b.under.material.color.setHex(color);
    b.color = color;
  }

  let brickSerial = 0;
  function makeBrick(row, col, hp, tough) {
    const color = hpColor(hp);
    const mat = C.glowBrickMaterial(color);
    mat.color.setHex(0x161a30);
    mat.metalness = 0.8;
    mat.roughness = 0.34;
    mat.clearcoat = 0.5;
    mat.clearcoatRoughness = 0.3;
    mat.emissiveMap = parts.vent;
    mat.emissiveIntensity = 0.9;
    const mesh = new THREE.Mesh(parts.hull, mat);
    const neon = new THREE.MeshBasicMaterial({ color });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    const screen = new THREE.Mesh(parts.screen, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    screen.position.y = BH / 2 + 0.006;
    const under = new THREE.Mesh(parts.under, new THREE.MeshBasicMaterial({
      map: M.glowTex, color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    under.position.y = -BH / 2 + 0.03;
    C.noReflect(under);
    mesh.add(new THREE.Mesh(parts.band, neon), new THREE.Mesh(parts.frame, neon), screen, under);
    const b = {
      row, col, hp, maxHp: hp, tough: !!tough, x: cellX(col), z: cellZ(row), mesh, mat, neon, tex, screen, under,
      ctx: canvas.getContext('2d'), traces: makeTraces(), tag: '0x' + (++brickSerial & 255).toString(16).toUpperCase().padStart(2, '0'),
      alive: true, flash: 0, dirty: false, burning: false, poison: false, color, phase: Math.random() * 6,
    };
    mesh.position.set(b.x, BH / 2 + 9, b.z);
    scene.add(mesh);
    grid[row][col] = b;
    bricks.push(b);
    drawScreen(b);
    return b;
  }

  function disposeBrick(b) {
    scene.remove(b.mesh);
    b.mat.dispose();
    b.neon.dispose();
    b.screen.material.dispose();
    b.under.material.dispose();
    b.tex.dispose();
  }

  function brickAt(row, col) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    const b = grid[row][col];
    return b && b.alive ? b : null;
  }

  function damage(b, dmg, crit) {
    if (!b.alive) return;
    b.hp -= dmg;
    b.flash = 1;
    b.dirty = true;
    if (crit) {
      // big volleys can crit dozens of times a second: keep the popups readable
      if (st.t - st.critPopT > 0.12) {
        st.critPopT = st.t;
        C.popup('CRIT ' + dmg, b.x, b.z, 'hot');
      }
      C.burst(b.x, 1, b.z, 0xffffff, 10, 6, 0.3, 0.6, 1);
    }
    if (b.hp <= 0) destroy(b);
    else C.sfx.armor();
  }

  function destroy(b) {
    b.alive = false;
    grid[b.row][b.col] = null;
    bricks.splice(bricks.indexOf(b), 1);
    const col = b.color;
    C.burst(b.x, 0.7, b.z, col, 26, 8, 0.6, 0.85, 1);
    C.burst(b.x, 0.7, b.z, 0xffffff, 8, 5, 0.3, 0.6);
    C.spawnDebris(b.x, b.z, col, 6);
    C.spawnRing(b.x, b.z, col, 3.2, 0.45);
    C.sigilPulse(0.08);
    C.sfx.brick(st.combo++);
    disposeBrick(b);
    const miner = st.cards.miner || 0;
    if ((st.ballId === 'pixel' && Math.random() < 0.3) || (miner && Math.random() < CARD.miner.chance[miner])) {
      const got = C.awardCoins(2);
      st.coins += got;
      C.popup('+' + got, b.x, b.z, 'coin');
      C.sfx.coin();
    }
    gainXp(b.tough ? 2 : 1, b.x, b.z);
  }

  // ------------------------------------------------------ card effects
  // Electro Ball: lightning jumps from the struck brick into its nearest neighbours
  function electro(src, lvl) {
    const near = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const n = (dr || dc) && brickAt(src.row + dr, src.col + dc);
        if (n) near.push({ n, d: dr * dr + dc * dc + Math.random() * 0.5 });
      }
    }
    if (!near.length) return;
    near.sort((a, b) => a.d - b.d);
    near.slice(0, CARD.electro.arcs[lvl]).forEach(({ n }) => {
      if (st.arcBudget > 0) {
        st.arcBudget--;
        C.lightning(src.x, src.z, n.x, n.z, 0x19e6ff);
      } else {
        C.burst(n.x, 1, n.z, 0x19e6ff, 6, 4, 0.25, 0.4);
      }
      damage(n, 1);
    });
    C.sfx.zap();
  }

  // Poison: bricks hit this turn take the poison damage when the turn ends
  function applyPoison() {
    const lvl = st.cards.poison || 0;
    let n = 0;
    bricks.slice().forEach((b) => {
      if (!b.poison || !b.alive) return;
      b.poison = false;
      b.dirty = true;
      if (!lvl) return;
      C.burst(b.x, 1, b.z, 0x8dff2a, 14, 4, 0.45, 0.7, 1);
      if (n++ < 12) C.popup('-' + lvl, b.x, b.z, 'tox');
      damage(b, lvl);
    });
    if (n) C.sfx.poison();
  }

  // ------------------------------------------------------- XP / levels
  // You hold at most `slots` card types (1, or up to 3 with the CARD SLOTS skill).
  // While a slot is free every unmaxed card can be offered; once they're full
  // only upgrades for the cards you hold show up.
  const held = () => CARDS.filter((c) => st.cards[c.id]);
  function cardPool() {
    const full = held().length >= st.slots;
    return CARDS.filter((c) => (st.cards[c.id] || 0) < MAX_CARD && (!full || st.cards[c.id]));
  }
  // nothing left to pick: every slot holds a maxed card
  const cardsLocked = () => cardPool().length === 0;

  function gainXp(n, x, z) {
    if (!st.active) return;
    st.xp += n;
    while (st.xp >= xpNeed(st.level)) {
      st.xp -= xpNeed(st.level);
      st.level++;
      C.spawnRing(x, z, 0x19e6ff, 6, 0.55);
      C.burst(x, 1.2, z, 0xffffff, 20, 7, 0.5, 0.8, 1);
      C.sfx.levelUp();
      if (cardsLocked()) {
        st.bonusNext++;   // deck maxed: every further level-up is worth a ball
        C.popup('LEVEL ' + st.level + '  //  +1 BALL', x, z - 1.2, 'lvl');
      } else {
        st.pendingCards++;
        C.popup('LEVEL UP!  LV ' + st.level, x, z - 1.2, 'lvl');
      }
    }
    renderXp();
  }

  // Solar Nova (Funky): 2 damage to the 8 surrounding bricks
  function nova(b) {
    C.burst(b.x, 0.8, b.z, 0xffd23a, 45, 10, 0.7, 1.0, 2);
    C.spawnRing(b.x, b.z, 0xffd23a, 7, 0.6);
    C.flashLight(b.x, b.z, 0xffc040, 5);
    C.addShake(0.3);
    C.sfx.nova();
    C.popup('CHAIN NOVA', b.x, b.z - 1.5, 'hot');
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const n = brickAt(b.row + dr, b.col + dc);
        if (n) damage(n, 2);
      }
    }
  }

  // ---------------------------------------------------------- pickups
  function makePickup(row, col, type) {
    const g = new THREE.Group();
    const p = { type, row, col, x: cellX(col), z: cellZ(row), group: g, alive: true, spin: null, ring: null, t: Math.random() * 6 };
    if (type === 'ball') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 10, 48), new THREE.MeshBasicMaterial({ color: 0x8dff2a }));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const label = new THREE.Sprite(plusMat);
      label.scale.set(1.1, 1.1, 1);
      label.position.y = 1.25;
      label.renderOrder = 20;
      g.add(M.glow(0x8dff2a, 2.6, 0.7), ring, core, label);
      p.ring = ring;
    } else if (type === 'token') {
      const tok = M.makeToken();
      tok.group.scale.setScalar(1.25);
      g.add(tok.group);
      p.spin = tok.spinner;
    } else {
      const coin = M.makeCoin();
      coin.group.scale.setScalar(1.3);
      g.add(coin.group);
      p.spin = coin.spinner;
    }
    g.position.set(p.x, 0.9, p.z - 4);
    scene.add(g);
    pickups.push(p);
    return p;
  }

  function removePickup(p) {
    p.alive = false;
    scene.remove(p.group);
    pickups.splice(pickups.indexOf(p), 1);
  }

  function collectPickup(p) {
    if (!p.alive) return;
    if (p.type === 'ball') {
      st.bonusNext++;
      C.popup('+1 BALL', p.x, p.z, 'pu');
      C.sfx.power();
      C.burst(p.x, 0.9, p.z, 0x8dff2a, 24, 6, 0.5, 0.7, 1);
    } else if (p.type === 'token') {
      C.awardTokens(1);
      C.popup('+1 TOKEN', p.x, p.z, 'token');
      C.sfx.life();
      C.burst(p.x, 0.9, p.z, 0xb84dff, 30, 7, 0.6, 0.8, 2);
      C.flashLight(p.x, p.z, 0xb84dff, 4);
    } else {
      const got = C.awardCoins(5);
      st.coins += got;
      C.popup('+' + got, p.x, p.z, 'coin');
      C.sfx.coin();
      C.burst(p.x, 0.9, p.z, 0xffc933, 16, 5, 0.4, 0.6, 1);
    }
    C.spawnRing(p.x, p.z, PICKUP_COLOR[p.type], 2.4, 0.35);
    removePickup(p);
  }
  const PICKUP_COLOR = { ball: 0x8dff2a, coin: 0xffc933, token: 0xb84dff };

  // ------------------------------------------------------------- rows
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Brick HP outgrows the ball count: linear at first, then ever steeper
  // (turn 10: 13, turn 30: 62, turn 50: 139) — tough bricks carry double.
  const baseHp = (t) => Math.round(t * (1 + t / 28));

  function spawnRow() {
    const t = st.turn;
    const cols = shuffle([0, 1, 2, 3, 4, 5, 6]);
    const n = clamp(Math.round(rand(2.6, 4) + Math.min(2.4, t * 0.07)), 3, 6);
    for (let i = 0; i < n; i++) {
      const tough = Math.random() < Math.min(0.4, 0.12 + t * 0.012);
      makeBrick(0, cols[i], baseHp(t) * (tough ? 2 : 1), tough);
    }
    let free = n;
    // +1 ball orbs are no longer guaranteed: rarer the deeper you get
    if (n < COLS && Math.random() < (t < 8 ? 0.9 : t < 25 ? 0.7 : 0.55)) makePickup(0, cols[free++], 'ball');
    if (free < COLS && Math.random() < 0.28) makePickup(0, cols[free++], 'coin');
    // rare skill-token crystals from turn 5 on
    if (free < COLS && t >= 5 && Math.random() < 0.05) makePickup(0, cols[free], 'token');
  }

  function shiftDown() {
    for (let r = ROWS; r > 0; r--) grid[r] = grid[r - 1];
    grid[0] = new Array(COLS).fill(null);
    for (const b of bricks) { b.row++; b.z = cellZ(b.row); }
    for (const p of pickups) { p.row++; p.z = cellZ(p.row); }
  }

  // ------------------------------------------------------------ turns
  function nextTurn(first) {
    st.turn++;
    if (!first) {
      shiftDown();
      C.sfx.advance();
      C.addShake(0.2);
      C.wallFlash('left');
      C.wallFlash('right');
      pickups.slice().forEach((p) => {
        if (p.row >= ROWS - 1) {   // orbs that reach the line fizzle out
          C.burst(p.x, 0.9, cellZ(p.row), PICKUP_COLOR[p.type], 8, 3, 0.3, 0.5);
          removePickup(p);
        }
      });
      if (bricks.some((b) => b.row >= ROWS)) { gameOver(); return; }
      st.coins += C.awardCoins(2);
      if (st.gunId === 'archangel') st.bonusNext++;
      // milestone: a skill token every 5th turn you reach
      if (st.turn % 5 === 0) {
        C.awardTokens(1);
        C.popup('+1 TOKEN  //  TURN ' + st.turn, st.gunX, LINE_Z - 4, 'token');
        C.sfx.life();
      }
    }
    spawnRow();
    if (st.bonusNext) {
      st.ballCount += st.bonusNext;
      C.popup('+' + st.bonusNext + (st.bonusNext > 1 ? ' BALLS' : ' BALL'), st.gunX, LINE_Z - 2.5, 'pu');
      st.bonusNext = 0;
    }
    bricks.forEach((b) => { b.dirty = true; });   // colours are relative to the turn number
    if (bricks.some((b) => b.row >= ROWS - 1)) {
      C.popup('DANGER', 0, LINE_Z - 4, 'big');
      C.sfx.error();
    }
    st.phase = 'aim';
    st.phaseT = 0;
    $('fb-turn').textContent = st.turn;
    if (st.pendingCards) openCards();
  }

  // ------------------------------------------------------ card picker
  function openCards() {
    if (cardsLocked()) {
      // a pick earlier in this batch maxed a second card: the rest turn into balls
      st.ballCount += st.pendingCards;
      C.popup('+' + st.pendingCards + (st.pendingCards > 1 ? ' BALLS' : ' BALL'), st.gunX, LINE_Z - 2.5, 'pu');
      st.pendingCards = 0;
      closeCards();
      return;
    }
    st.offer = shuffle(cardPool()).slice(0, 3);
    st.phase = 'cards';
    st.phaseT = 0;
    hideAim();
    const row = $('fbc-row');
    row.innerHTML = '';
    st.offer.forEach((c, i) => {
      const cur = st.cards[c.id] || 0, next = cur + 1;
      const el = document.createElement('button');
      el.className = 'fb-card';
      el.style.setProperty('--cc', css(c.color));
      el.style.animationDelay = i * 0.09 + 's';
      el.innerHTML =
        `<span class="fbc-key">${i + 1}</span>` +
        `<span class="fbc-icon">${c.icon}</span>` +
        `<span class="fbc-name">${c.name}</span>` +
        `<span class="fbc-pips">${[1, 2, 3].map((l) => `<i class="${l < next ? 'on' : l === next ? 'new' : ''}"></i>`).join('')}</span>` +
        `<span class="fbc-lv">${cur ? 'UPGRADE → LEVEL ' + next : 'NEW CARD'}</span>` +
        `<span class="fbc-desc">${c.desc(next)}</span>`;
      el.addEventListener('click', () => pickCard(i));
      row.appendChild(el);
    });
    $('fbc-level').textContent = 'LEVEL ' + (st.level - st.pendingCards + 1);
    $('fbc-left').textContent = st.pendingCards > 1 ? '+' + (st.pendingCards - 1) + ' MORE TO PICK' : '';
    const used = held().length;
    $('fbc-slots').innerHTML = 'CARD SLOTS ' + Array.from({ length: st.slots }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('') +
      (used >= st.slots ? ' &nbsp;FULL &mdash; UPGRADES ONLY' : '');
    $('fb-cards').classList.remove('hidden');
    C.sfx.power();
  }

  function pickCard(i) {
    if (st.phase !== 'cards' || !st.offer[i]) return;
    const c = st.offer[i];
    st.cards[c.id] = (st.cards[c.id] || 0) + 1;
    st.pendingCards--;
    C.sfx.equip();
    C.popup(c.name + (st.cards[c.id] > 1 ? ' LV ' + st.cards[c.id] : ''), st.gunX, LINE_Z - 3, 'lvl');
    C.burst(st.gunX, 1, LINE_Z - 1, c.color, 30, 7, 0.5, 0.8, 1);
    renderDeck();
    if (cardsLocked() && st.pendingCards === 0) C.popup('DECK MAXED  //  LEVEL-UPS NOW GIVE +1 BALL', 0, LINE_Z - 5, 'lvl');
    if (st.pendingCards > 0) openCards();
    else closeCards();
  }

  function closeCards() {
    $('fb-cards').classList.add('hidden');
    st.offer = [];
    if (st.phase === 'cards') {
      st.phase = 'aim';
      st.phaseT = 0;
    }
  }

  function renderXp() {
    $('fb-lv').textContent = 'LV ' + st.level;
    $('fb-xpfill').style.width = Math.min(100, (st.xp / xpNeed(st.level)) * 100) + '%';
  }

  function renderDeck() {
    const cards = held();
    $('fb-deck').innerHTML = cards
      .map((c) => `<span class="fb-chip${st.cards[c.id] >= MAX_CARD ? ' max' : ''}" style="--cc:${css(c.color)}" title="${c.name}">` +
        `${c.icon}<b>${['', 'I', 'II', 'III'][st.cards[c.id]]}</b></span>`).join('') +
      '<span class="fb-chip empty" title="Free card slot"></span>'.repeat(Math.max(0, st.slots - cards.length));
  }

  function fire() {
    if (!st.active || st.phase !== 'aim') return;
    st.phase = 'fire';
    st.phaseT = 0;
    st.fired = 0;
    st.fireT = 0;
    st.flyT = 0;
    st.firstX = null;
    st.landed = 0;
    st.hits = 0;
    st.combo = 0;
    st.forkUsed = false;
    st.splits = 0;
    st.ff = false;
    st.volleyAim = st.aim;
    st.volleyX = st.gunX;
    while (pool.length < st.ballCount) {
      const m = M.makeBall(st.ballId);
      m.group.visible = false;
      scene.add(m.group);
      pool.push(m);
    }
    balls = [];
    C.sfx.launch();
  }

  function muzzle(a, gx) {
    const len = gun ? gun.muzzle : 1.8;
    return {
      x: clamp(gx + Math.sin(a) * len, -WALL_X, WALL_X),
      z: Math.min(GUN_Z - Math.cos(a) * len, LINE_Z - R - 0.3),
    };
  }

  function normalize(b) {
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

  function launchOne(i) {
    let a = st.volleyAim;
    if (st.gunId === 'scatter') a += ((i % 3) - 1) * 0.07;
    const m = pool[i];
    const p = muzzle(a, st.volleyX);
    const b = { model: m, x: p.x, z: p.z, px: p.x, pz: p.z, dx: Math.sin(a), dz: -Math.cos(a), state: 'fly', ghost: false, idx: i, charged: false };
    normalize(b);
    m.group.visible = true;
    m.group.position.set(b.x, R, b.z);
    balls.push(b);
    st.recoil = 1;
    C.sfx.tick();
    C.emit(p.x, 0.6, p.z, Math.sin(a) * 3, 1, -Math.cos(a) * 3, gun.color, 0.9, 0.2, 3, 0);
    if (st.gunId === 'helix' && i % 4 === 3) spawnGhost(p.x, p.z, a + rand(-0.12, 0.12));
  }

  // ghost balls (Glitch fork, Helix twins, Splitter) only live for one volley; their models are pooled
  function spawnGhost(x, z, a) {
    const m = ghostPool.pop() || M.makeBall(st.ballId, { ghost: true });
    m.group.visible = true;
    m.group.position.set(x, R, z);
    scene.add(m.group);
    const g = { model: m, x, z, px: x, pz: z, dx: Math.sin(a), dz: -Math.cos(a), state: 'fly', ghost: true, idx: -1, charged: false };
    normalize(g);
    balls.push(g);
    C.burst(x, R, z, m.trail, 8, 4, 0.3, 0.5);
  }

  function freeGhost(m) {
    scene.remove(m.group);
    if (ghostPool.length < 48) ghostPool.push(m);
  }

  function recall() {
    if (!(st.phase === 'fire' || st.phase === 'fly')) return;
    st.landed += st.ballCount - st.fired;
    st.fired = st.ballCount;
    for (const b of balls) {
      if (b.state !== 'fly') continue;
      C.burst(b.x, R, b.z, b.model.trail, 5, 3, 0.25, 0.4);
      if (b.ghost) { b.state = 'gone'; freeGhost(b.model); continue; }
      b.state = 'landed';
      b.z = REST_Z;
      st.landed++;
    }
    if (st.firstX === null) st.firstX = st.volleyX;
    st.phase = 'fly';
    C.sfx.portal();
  }

  function endTurn() {
    // Magma Core (Funky): burning bricks take 1 damage at the end of every turn
    if (st.ballId === 'magma') {
      bricks.slice().forEach((b) => {
        if (!b.burning || !b.alive) return;
        C.burst(b.x, 1, b.z, 0xff6a1f, 12, 4, 0.5, 0.7, 2);
        damage(b, 1);
      });
    }
    applyPoison();
    for (const b of balls) {
      if (b.ghost) { if (b.state !== 'gone') freeGhost(b.model); }
      else b.model.group.visible = false;
    }
    balls = [];
    if (st.firstX !== null) st.gunX = st.gunTargetX = st.firstX;
    nextTurn(false);
  }

  function gameOver() {
    st.phase = 'dead';
    st.phaseT = 0;
    for (let i = 0; i < 7; i++) C.burst(cellX(i), 0.8, LINE_Z - 1, pick([0xff2a4d, 0xff9a1f, 0xff3cf2]), 25, 9, 0.8, 1, 2);
    C.spawnRing(st.gunX, LINE_Z, 0xff2a4d, 14, 0.8);
    C.flashLight(st.gunX, LINE_Z, 0xff2a4d, 8);
    C.addShake(1.2);
    C.glitch(1);
    C.sfx.explode();
    C.sfx.lose();
    const isBest = st.turn > st.best;
    if (isBest) {
      st.best = st.turn;
      C.store.set(BEST_KEY, String(st.best));
    }
    ['fb-hud', 'fb-count', 'fb-hint', 'fb-speed', 'fb-cards', 'fb-touch'].forEach((id) => $(id).classList.add('hidden'));
    C.finish({ turn: st.turn, best: st.best, isBest, level: st.level });
  }

  // ---------------------------------------------------------- physics
  function resolve(b, hit) {
    b.x += hit.nx * hit.pen;
    b.z += hit.nz * hit.pen;
    const dot = b.dx * hit.nx + b.dz * hit.nz;
    if (dot < 0) {
      b.dx -= 2 * dot * hit.nx;
      b.dz -= 2 * dot * hit.nz;
    }
    normalize(b);
  }

  function onWall(b, side) {
    normalize(b);
    if (st.ballId === 'gyro' && !b.charged) {
      b.charged = true;
      C.emit(b.x, R, b.z, 0, 1, 0, 0xffc933, 1.2, 0.3, 1, 0);
    }
    if (Math.random() < 0.25) C.wallFlash(side);
    C.sfx.wall();
  }

  // returns true when the hit destroyed the brick
  function onHit(b, br) {
    const cards = st.cards;
    let dmg = 1, crit = false;
    if (st.ballId === 'shard' && Math.random() < 0.2) { dmg = 3; crit = true; }
    if (b.charged) { dmg = Math.max(dmg, 2); b.charged = false; }
    if (Math.random() < P.perks.bonusDmgChance()) dmg += 1;   // OVERCLOCK skill
    if (st.gunId === 'railgun' && !b.ghost && b.idx >= 0 && b.idx < 3) dmg *= 2;
    if (cards.crit && Math.random() < CARD.crit.chance[cards.crit]) { dmg *= 2; crit = true; }
    if (st.ballId === 'magma') br.burning = true;
    if (cards.poison && !br.poison) { br.poison = true; br.dirty = true; }
    damage(br, dmg, crit);
    st.hits++;
    if (cards.electro && Math.random() < CARD.electro.chance[cards.electro]) electro(br, cards.electro);
    if (st.ballId === 'nova' && st.hits % 20 === 0) nova(br);
    const a = Math.atan2(b.dx, -b.dz);
    if (st.ballId === 'glitch' && !st.forkUsed && !b.ghost && b.idx === 0) {
      st.forkUsed = true;
      spawnGhost(b.x, b.z, a - 0.35);
      spawnGhost(b.x, b.z, a + 0.35);
      C.popup('FORK', b.x, b.z, 'pu');
      C.sfx.ghost();
    }
    // Splitter: a temporary twin peels off at an angle (it never joins your magazine)
    if (cards.splitter && !b.ghost && st.splits < MAX_SPLITS && Math.random() < CARD.splitter.chance[cards.splitter]) {
      st.splits++;
      spawnGhost(b.x, b.z, a + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.55));
      if (st.splits <= 6) C.popup('SPLIT', b.x, b.z, 'pu');
      C.sfx.split();
    }
    return !br.alive;
  }

  function collideBricks(b) {
    const r0 = Math.max(0, Math.floor((b.z - R - TOP) / CD));
    const r1 = Math.min(ROWS - 1, Math.floor((b.z + R - TOP) / CD));
    if (r1 < r0) return;
    const c0 = Math.max(0, Math.floor((b.x - R + K.HALF_W) / CW));
    const c1 = Math.min(COLS - 1, Math.floor((b.x + R + K.HALF_W) / CW));
    let best = null, hit = null;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const br = grid[row][col];
        if (!br || !br.alive) continue;
        const h = C.circleRect(b.x, b.z, R, br.x, br.z, BHW, BHD);
        if (h && (!hit || h.pen > hit.pen)) { best = br; hit = h; }
      }
    }
    if (!best) return;
    // corner hits on a seam between two neighbouring bricks behave like a flat face
    if (hit.nx !== 0 && hit.nz !== 0) {
      const nbX = brickAt(best.row, best.col + (hit.nx > 0 ? 1 : -1));
      const nbZ = brickAt(best.row + (hit.nz > 0 ? 1 : -1), best.col);
      if (nbX && !nbZ) {
        hit.nx = 0; hit.nz = hit.nz > 0 ? 1 : -1;
        hit.pen = Math.max(0, BHD + R - Math.abs(b.z - best.z));
      } else if (nbZ && !nbX) {
        hit.nz = 0; hit.nx = hit.nx > 0 ? 1 : -1;
        hit.pen = Math.max(0, BHW + R - Math.abs(b.x - best.x));
      }
    }
    const sx = b.x, sz = b.z, sdx = b.dx, sdz = b.dz;
    resolve(b, hit);
    // Piercer: a killing blow can carry the ball straight on through the wreck
    const pierce = st.cards.pierce || 0;
    if (onHit(b, best) && pierce && Math.random() < CARD.pierce.chance[pierce]) {
      b.x = sx; b.z = sz; b.dx = sdx; b.dz = sdz;
      C.burst(b.x, R, b.z, 0xff9a1f, 10, 6, 0.3, 0.5, 1);
      C.sfx.pierce();
    }
  }

  function land(b) {
    b.z = REST_Z;
    if (b.ghost) {
      b.state = 'gone';
      freeGhost(b.model);
      C.burst(b.x, R, REST_Z, b.model.trail, 6, 3, 0.3, 0.4);
      return;
    }
    b.state = 'landed';
    st.landed++;
    if (st.firstX === null) {
      st.firstX = b.x;
      C.spawnRing(b.x, LINE_Z, gun.color, 2.6, 0.4);
    }
    C.sfx.land();
    C.burst(b.x, R, REST_Z, b.model.trail, 4, 2, 0.25, 0.4);
  }

  function step(b, h) {
    b.x += b.dx * h;
    b.z += b.dz * h;
    if (b.x < -WALL_X) { b.x = -WALL_X; if (b.dx < 0) { b.dx = -b.dx; onWall(b, 'left'); } }
    else if (b.x > WALL_X) { b.x = WALL_X; if (b.dx > 0) { b.dx = -b.dx; onWall(b, 'right'); } }
    if (b.z < K.TOP_Z + R) { b.z = K.TOP_Z + R; if (b.dz < 0) { b.dz = -b.dz; onWall(b, 'top'); } }
    const chin = C.circleRect(b.x, b.z, R, K.CHIN.x, K.CHIN.z, K.CHIN.hw, K.CHIN.hd);
    if (chin) resolve(b, chin);
    collideBricks(b);
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (!p.alive) continue;
      const dx = b.x - p.x, dz = b.z - p.z;
      if (dx * dx + dz * dz < 0.9 * 0.9) collectPickup(p);
    }
    if (b.dz > 0 && b.z >= REST_Z) land(b);
  }

  // Void Singularity (Funky): bend toward the nearest brick while flying upward
  function steer(b, dt) {
    let best = null, bd = Infinity;
    for (const br of bricks) {
      if (br.z > b.z) continue;
      const d = (br.x - b.x) * (br.x - b.x) + (br.z - b.z) * (br.z - b.z);
      if (d < bd) { bd = d; best = br; }
    }
    if (!best) return;
    const want = Math.atan2(best.x - b.x, -(best.z - b.z));
    const cur = Math.atan2(b.dx, -b.dz);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const a = cur + clamp(diff, -1.3 * dt, 1.3 * dt);
    b.dx = Math.sin(a);
    b.dz = -Math.cos(a);
    normalize(b);
  }

  function speedMul() {
    return st.ff ? 3 : 1 + clamp((st.flyT - 6) / 4, 0, 1.5);
  }

  function stepBalls(dt) {
    const spd = BASE_SPEED * speedMul();
    const n = balls.length;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.state !== 'fly') continue;
      b.px = b.x;
      b.pz = b.z;
      if (st.ballId === 'void' && b.dz < 0) steer(b, dt);
      const dist = spd * dt;
      const steps = Math.max(1, Math.ceil(dist / 0.18));
      for (let s = 0; s < steps && b.state === 'fly'; s++) step(b, dist / steps);
      if (b.state === 'gone') continue;
      b.model.group.position.set(b.x, R, b.z);
      b.model.update(dt, C.time, b.dx, b.dz, spd);
      if (b.state === 'fly' && (n < 30 || Math.random() < 30 / n)) {
        C.emit(lerp(b.px, b.x, 0.5), R, lerp(b.pz, b.z, 0.5), 0, 0, 0, b.charged ? 0xffc933 : b.model.trail, 0.65, 0.2, 0, 0);
      }
    }
    balls = balls.filter((b) => b.state !== 'gone');
  }

  function updateResting(dt) {
    for (const b of balls) {
      if (b.state !== 'landed') continue;
      const tx = st.firstX === null ? b.x : st.firstX;
      const nx = damp(b.x, tx, 7, dt);
      b.model.update(dt, C.time, Math.sign(nx - b.x), 0, Math.abs(nx - b.x) / Math.max(dt, 1e-4));
      b.x = nx;
      b.model.group.position.set(b.x, R, REST_Z);
    }
  }

  // ------------------------------------------------------------ aiming
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
  const hitV = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  function pointerFloor() {
    const p = C.pointer();
    if (!p) return null;
    ndc.set(p.x, p.y);
    ray.setFromCamera(ndc, C.refCam);
    return ray.ray.intersectPlane(floorPlane, hitV) ? hitV : null;
  }

  function readInput(dt) {
    if (st.phase !== 'aim') return;
    const move = (st.keyR ? 1 : 0) - (st.keyL ? 1 : 0);
    if (move) st.gunTargetX += move * 16 * dt;
    const turn = (st.keyAR ? 1 : 0) - (st.keyAL ? 1 : 0);
    if (turn) {
      st.aim = clamp(st.aim + turn * 1.3 * dt, -MAX_AIM, MAX_AIM);
      st.mouseAim = false;
    }
    const p = pointerFloor();
    if (p && (p.x !== st.lastPX || p.z !== st.lastPZ)) {
      st.lastPX = p.x;
      st.lastPZ = p.z;
      st.mouseAim = true;
    }
    if (st.dragging && p) st.gunTargetX = p.x;
    else if (st.mouseAim && p && !BOT) {
      const dz = p.z - GUN_Z;
      if (dz < -1) st.aim = clamp(Math.atan2(p.x - st.gunX, -dz), -MAX_AIM, MAX_AIM);
    }
    st.gunTargetX = clamp(st.gunTargetX, -K.HALF_W + 1.3, K.HALF_W - 1.3);
  }

  // slab test of a ray against a box grown by the ball radius
  function rayBox(x, z, dx, dz, cx, cz, hx, hz) {
    let tmin = -Infinity, tmax = Infinity, nx = 0, nz = 0;
    if (Math.abs(dx) < 1e-9) {
      if (x < cx - hx || x > cx + hx) return null;
    } else {
      let t1 = (cx - hx - x) / dx, t2 = (cx + hx - x) / dx, n = -1;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = n; nz = 0; }
      tmax = Math.min(tmax, t2);
    }
    if (Math.abs(dz) < 1e-9) {
      if (z < cz - hz || z > cz + hz) return null;
    } else {
      let t1 = (cz - hz - z) / dz, t2 = (cz + hz - z) / dz, n = -1;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = 0; nz = n; }
      tmax = Math.min(tmax, t2);
    }
    if (tmax < tmin || tmin < 1e-4) return null;
    return { t: tmin, nx, nz };
  }

  function raycast(x, z, dx, dz) {
    let best = null;
    const consider = (h) => { if (h && h.t > 1e-4 && (!best || h.t < best.t)) best = h; };
    if (dx > 0) consider({ t: (WALL_X - x) / dx, nx: -1, nz: 0 });
    if (dx < 0) consider({ t: (-WALL_X - x) / dx, nx: 1, nz: 0 });
    if (dz < 0) consider({ t: (K.TOP_Z + R - z) / dz, nx: 0, nz: 1 });
    if (dz > 0) consider({ t: (REST_Z - z) / dz, nx: 0, nz: -1, stop: true });
    consider(rayBox(x, z, dx, dz, K.CHIN.x, K.CHIN.z, K.CHIN.hw + R, K.CHIN.hd + R));
    for (const b of bricks) consider(rayBox(x, z, dx, dz, b.x, b.z, BHW + R, BHD + R));
    return best;
  }

  function tracePath(x, z, dx, dz, bounces, maxLen) {
    const pts = [[x, z]];
    let remaining = maxLen;
    for (let i = 0; i <= bounces && remaining > 0; i++) {
      const hit = raycast(x, z, dx, dz);
      const t = hit ? Math.min(hit.t, remaining) : remaining;
      x += dx * t;
      z += dz * t;
      pts.push([x, z]);
      remaining -= t;
      if (!hit || hit.stop || t < hit.t) break;
      const dot = dx * hit.nx + dz * hit.nz;
      dx -= 2 * dot * hit.nx;
      dz -= 2 * dot * hit.nz;
    }
    return pts;
  }

  function updateAimLine() {
    const a = st.aim;
    const m = muzzle(a, st.gunX);
    const bounces = st.gunId === 'prism' ? 3 : 1;
    const pts = tracePath(m.x, m.z, Math.sin(a), -Math.cos(a), bounces, st.gunId === 'prism' ? 90 : 55);
    const spacing = 0.72;
    let di = 0, travelled = 0, total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let offset = (st.t * 2.2) % spacing;
    for (let i = 1; i < pts.length && di < aimDots.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let s = offset; s < len && di < aimDots.length; s += spacing) {
        const k = s / len;
        const d = aimDots[di++];
        const fade = 1 - (travelled + s) / Math.max(total, 1);
        d.visible = true;
        d.position.set(lerp(x0, x1, k), R, lerp(z0, z1, k));
        const sc = 0.18 + 0.32 * fade;
        d.scale.set(sc, sc, 1);
      }
      offset = (offset - len) % spacing;
      if (offset < 0) offset += spacing;
      travelled += len;
    }
    for (; di < aimDots.length; di++) aimDots[di].visible = false;
  }

  function hideAim() {
    for (const d of aimDots) d.visible = false;
  }

  // test autopilot: aim at a random brick and fire
  function botThink() {
    if (st.phaseT < 0.4 || !bricks.length) return;
    const tgt = pick(bricks);
    st.aim = clamp(Math.atan2(tgt.x - st.gunX, -(tgt.z - GUN_Z)), -MAX_AIM, MAX_AIM) + rand(-0.05, 0.05);
    fire();
    st.ff = true;
  }

  // ------------------------------------------------------------ frame
  function updateGun(dt) {
    if (st.phase === 'collect' && st.firstX !== null) st.gunTargetX = st.firstX;
    st.gunX = damp(st.gunX, st.gunTargetX, st.phase === 'collect' ? 8 : 18, dt);
    st.recoil = Math.max(0, st.recoil - dt * 8);
    gun.group.position.set(st.gunX, 0.02 + Math.sin(st.t * 3) * 0.03, GUN_Z);
    const aim = st.phase === 'fire' || st.phase === 'fly' ? st.volleyAim : st.aim;
    gun.turret.rotation.y = damp(gun.turret.rotation.y, -aim, 20, dt);
    gun.update(dt, C.time, { recoil: st.recoil });
    C.paddleLight.color.setHex(gun.color);
    C.paddleLight.position.set(st.gunX, 1.6, GUN_Z - 0.8);
    C.paddleLight.intensity = 1.6;
  }

  function updateBricks(dt) {
    const danger = 0.5 + 0.5 * Math.sin(st.t * 10);
    for (const b of bricks) {
      b.mesh.position.y = damp(b.mesh.position.y, BH / 2, 9, dt);
      b.mesh.position.z = damp(b.mesh.position.z, b.z, 9, dt);
      b.flash = Math.max(0, b.flash - dt * 6);
      const warn = b.row >= ROWS - 1 ? danger : 0;
      const pulse = 0.82 + 0.18 * Math.sin(st.t * 2.2 + b.phase);
      // dark hull with glowing vents; neon trim pulses softly and flashes white on hits
      b.mat.emissiveIntensity = 0.75 * pulse + b.flash * 1.6 + warn * 0.6;
      b.mat.userData.rimStrength.value = 0.45 + b.flash * 2 + warn;
      b.neon.color.setHex(b.color).multiplyScalar(pulse + warn * 0.4);
      if (b.flash > 0) b.neon.color.lerp(WHITE, b.flash * 0.7);
      b.under.material.opacity = 0.18 + 0.06 * pulse + b.flash * 0.3 + warn * 0.2;
      const s = 1 + b.flash * 0.08;
      b.mesh.scale.set(s, 1 + b.flash * 0.25, s);
      if (b.dirty) { b.dirty = false; drawScreen(b); }
      if (b.burning && Math.random() < dt * 5) {
        C.emit(b.x + rand(-BHW, BHW), 1.1, b.z + rand(-BHD, BHD), 0, rand(1, 2.5), 0, pick([0xff6a1f, 0xffb020]), 0.6, 0.6, 0.5, 0);
      }
      if (b.poison && Math.random() < dt * 4) {
        C.emit(b.x + rand(-BHW, BHW) * 0.8, 1.1, b.z + rand(-BHD, BHD) * 0.8, 0, rand(0.6, 1.6), 0, pick([0x8dff2a, 0x39ff6a]), 0.5, 0.7, 0.3, 0);
      }
    }
    railMat.color.setHex(bricks.some((b) => b.row >= ROWS - 1) && danger > 0.5 ? 0xff2a4d : 0x19e6ff);
  }

  function updatePickups(dt) {
    for (const p of pickups) {
      p.t += dt;
      const pos = p.group.position;
      pos.z = damp(pos.z, p.z, 8, dt);
      pos.y = 0.9 + Math.sin(p.t * 3) * 0.12;
      if (p.ring) p.ring.rotation.y += dt * 2.5;
      if (p.spin) p.spin.rotation.y += dt * 4;
    }
  }

  const proj = new THREE.Vector3();
  function updateHud() {
    const count = $('fb-count');
    const showCount = st.phase === 'aim' || st.phase === 'fire';
    count.classList.toggle('hidden', !showCount);
    if (showCount) {
      const left = st.phase === 'aim' ? st.ballCount : st.ballCount - st.fired;
      count.textContent = '×' + left;
      proj.set(st.gunX, 2.4, GUN_Z).project(C.camera);
      count.style.left = ((proj.x + 1) / 2) * window.innerWidth + 'px';
      count.style.top = ((1 - proj.y) / 2) * window.innerHeight + 'px';
    }
    $('fb-hint').classList.toggle('hidden', st.phase !== 'aim' || st.turn > 3);
    const flying = st.phase === 'fire' || st.phase === 'fly';
    const fast = flying && speedMul() > 1.05;
    $('fb-speed').classList.toggle('hidden', !fast);
    // touch screens get RECALL as a button (js/mobil.js sets body.touch)
    const touch = document.body.classList.contains('touch');
    if (fast) $('fb-speed').textContent = (st.ff ? '⏩ FAST FORWARD ×3' : '⏩ SPEEDING UP') + (touch ? '' : '   //   R  RECALL');
    $('fb-touch').classList.toggle('hidden', !flying);
    $('fb-ff').classList.toggle('on', st.ff);
    // light follows the first flying ball
    const lead = balls.find((b) => b.state === 'fly');
    if (lead) {
      C.ballLight.position.set(lead.x, 1.3, lead.z);
      C.ballLight.color.setHex(lead.model.light);
      C.ballLight.intensity = 1.1;
    } else {
      C.ballLight.intensity = 0;
    }
  }

  function update(dt) {
    if (!st.active || !gun) return;
    st.t += dt;
    st.phaseT += dt;
    st.arcBudget = 5;   // lightning bolts drawn per frame; extra Electro arcs still deal damage
    if (st.phase === 'cards' && BOT && st.phaseT > 0.6) pickCard(Math.floor(Math.random() * st.offer.length));
    readInput(dt);
    updateGun(dt);
    if (st.phase === 'aim') {
      updateAimLine();
      if (BOT) botThink();
    } else {
      hideAim();
    }
    if (st.phase === 'fire') {
      st.fireT -= dt * speedMul();
      while (st.fireT <= 0 && st.fired < st.ballCount) {
        launchOne(st.fired++);
        st.fireT += FIRE_GAP;
      }
      if (st.fired >= st.ballCount) st.phase = 'fly';
    }
    if (st.phase === 'fire' || st.phase === 'fly') {
      st.flyT += dt;
      stepBalls(dt);
      if (st.phase === 'fly' && st.landed >= st.ballCount && !balls.some((b) => b.state === 'fly')) {
        st.phase = 'collect';
        st.phaseT = 0;
      } else if (st.flyT > 60) {
        recall();   // safety net for a ball trapped in an endless loop
      }
    }
    updateResting(dt);
    if (st.phase === 'collect' && st.phaseT > 0.45) endTurn();
    updateBricks(dt);
    updatePickups(dt);
    updateHud();
    C.setFocusX(st.gunX);
  }

  // ------------------------------------------------------- lifecycle
  function start() {
    init();
    stop();
    st.active = true;
    st.turn = 0;
    st.ballCount = P.perks.startBalls();   // 1 ball + EXTRA MAGAZINE skill
    st.bonusNext = 0;
    st.gunX = st.gunTargetX = 0;
    st.aim = 0;
    st.coins = 0;
    st.t = 0;
    st.critPopT = -1;
    st.mouseAim = false;
    st.dragging = false;
    st.touchAim = false;
    st.best = best();
    st.ballId = P.equippedId('ball');
    st.gunId = P.equippedId('gun');
    ghostPool.length = 0;   // the equipped ball may have changed
    st.level = 1;
    st.xp = 0;
    st.pendingCards = 0;
    st.cards = {};
    st.offer = [];
    st.slots = P.perks.cardSlots();   // CARD SLOTS skill
    // debug / test hooks: ?cards=electro:3,poison:2 presets the deck, ?levels=N queues N card picks
    (QS.get('cards') || '').split(',').forEach((kv) => {
      const [id, l] = kv.split(':');
      if (CARD[id]) st.cards[id] = clamp(parseInt(l, 10) || 1, 1, MAX_CARD);
    });
    const preLevels = clamp(parseInt(QS.get('levels'), 10) || 0, 0, 20);
    st.level += preLevels;
    st.pendingCards = preLevels;
    renderXp();
    renderDeck();
    grid = [];
    for (let r = 0; r <= ROWS; r++) grid.push(new Array(COLS).fill(null));
    gun = M.makeGun(st.gunId);
    gun.group.position.set(0, 0, GUN_Z);
    scene.add(gun.group);
    rail.visible = true;
    aimDotMat.color.setHex(gun.color);
    $('fb-hud').classList.remove('hidden');
    $('fb-best').textContent = st.best;
    const g = P.equipped('gun');
    $('fb-gun').textContent = g.name;
    $('fb-gun').style.color = P.RARITY[g.rarity].color;
    C.showBanner('FUNKY BALLS', 'TURN 1', 'AIM  //  FIRE THE VOLLEY  //  HOLD THE LINE');
    C.sfx.start();
    nextTurn(true);
  }

  function stop() {
    st.active = false;
    st.phase = 'idle';
    bricks.forEach(disposeBrick);
    bricks.length = 0;
    pickups.forEach((p) => scene.remove(p.group));
    pickups.length = 0;
    balls.forEach((b) => scene.remove(b.model.group));
    balls = [];
    pool.forEach((m) => scene.remove(m.group));
    pool.length = 0;
    if (gun) { scene.remove(gun.group); gun = null; }
    if (rail) rail.visible = false;
    hideAim();
    ['fb-hud', 'fb-count', 'fb-hint', 'fb-speed', 'fb-cards', 'fb-touch'].forEach((id) => $(id).classList.add('hidden'));
    if (st.inited) C.ballLight.intensity = 0;
  }

  function best() {
    return parseInt(C.store.get(BEST_KEY, '0'), 10) || 0;
  }

  function pointerDown(e) {
    if (!st.active) return;
    if (st.phase === 'aim') {
      const p = pointerFloor();
      if (p && p.z > LINE_Z - 1.2) { st.dragging = true; return; }   // grab the rail to slide the gun
      // touch: the finger aims while it is down, the volley fires when it lets go
      if (e && e.pointerType === 'touch') { st.touchAim = true; return; }
      fire();
    } else if (st.phase === 'fire' || st.phase === 'fly') {
      st.ff = !st.ff;
    }
  }

  function pointerUp() {
    st.dragging = false;
    if (!st.touchAim) return;
    st.touchAim = false;
    if (st.phase !== 'aim') return;
    readInput(0);   // a quick tap can start and end between two frames
    // letting go down at the gun cancels the shot
    const p = pointerFloor();
    if (p && p.z < GUN_Z - 1) fire();
  }

  // touch buttons for the F and R keys
  $('fb-ff').addEventListener('click', () => { if (st.phase === 'fire' || st.phase === 'fly') { st.ff = !st.ff; C.sfx.click(); } });
  $('fb-recall').addEventListener('click', () => recall());

  window.addEventListener('keydown', (e) => {
    if (!st.active) return;
    const k = e.key;
    if (st.phase === 'cards') {
      if (k === '1' || k === '2' || k === '3') pickCard(parseInt(k, 10) - 1);
      return;
    }
    if (k === 'a' || k === 'A') st.keyL = true;
    else if (k === 'd' || k === 'D') st.keyR = true;
    else if (k === 'ArrowLeft') st.keyAL = true;
    else if (k === 'ArrowRight') st.keyAR = true;
    else if (k === 'f' || k === 'F') { if (st.phase === 'fire' || st.phase === 'fly') st.ff = !st.ff; }
    else if (k === 'r' || k === 'R') recall();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'a' || k === 'A') st.keyL = false;
    else if (k === 'd' || k === 'D') st.keyR = false;
    else if (k === 'ArrowLeft') st.keyAL = false;
    else if (k === 'ArrowRight') st.keyAR = false;
  });
  window.addEventListener('blur', () => { st.keyL = st.keyR = st.keyAL = st.keyAR = false; st.dragging = st.touchAim = false; });

  NEON.funky = { start, stop, update, fire, pointerDown, pointerUp, best };
})();
