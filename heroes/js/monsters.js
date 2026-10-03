/* ==========================================================================
   SLING HEROES — monsters and bosses
   Built the same way as the heroes (js/chars.js): shapes merged per bone,
   toon shading, outlines, glowing eyes. SH.buildMonster(enemyId) reads the
   model and the colours from js/data.js ENEMIES. Every monster faces +z
   (towards the heroes) and has its own little idle animation.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.Rig) return;
  const G = SH.G, Rig = SH.Rig, U = SH.util;
  const PI = Math.PI;
  const V3 = THREE.Vector3;
  const C = (c) => new THREE.Color(c);
  const shade = (c, k) => C(c).multiplyScalar(k);
  const onSphere = SH.onSphere;

  function mk(look, thick) {
    const r = new Rig({ scale: look.scale || 1, thick: thick || 0.032, outline: 0x150a0c });
    r.rim = 0xffb08a;
    r.kind = 'monster';
    return r;
  }
  // two glowing eyes on a sphere of radius R around center c
  function glowEyes(rig, bone, R, c, col, opts) {
    opts = opts || {};
    const sp = opts.spread || 0.38, dn = opts.down || 0.08, size = opts.size || 0.18;
    for (const s of [-1, 1]) {
      const o = onSphere(R, PI / 2 + dn, s * sp);
      rig.add(bone, G.sph, { p: [c[0] + o.p.x, c[1] + o.p.y, c[2] + o.p.z], q: o.q, s: [R * size * (opts.wide || 1.2), R * size * 0.7, R * 0.08], c: col, k: 'glow', i: opts.i || 3 });
      if (opts.angry) rig.add(bone, G.box, { p: [c[0] + o.p.x - s * R * 0.03, c[1] + o.p.y + R * 0.13, c[2] + o.p.z], q: o.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), s * 0.45)), s: [R * 0.3, R * 0.06, R * 0.06], c: opts.brow || '#1a0a0a' });
    }
  }
  function fangs(rig, bone, p, w, col) {
    for (const s of [-1, 1]) rig.add(bone, G.cone, { p: [p[0] + s * w, p[1], p[2]], r: [PI, 0, 0], s: [0.035, 0.09, 0.035], c: col || '#ffffff', ol: false });
  }
  function idleBob(rig, amp, speed) {
    return function (t) {
      const b = this.bones.body;
      b.position.y = (b.userData.y0 === undefined ? (b.userData.y0 = b.position.y) : b.userData.y0) + Math.sin(t * (speed || 3)) * (amp || 0.04);
      b.rotation.x = -this.hitT * 0.4 + (this.state === 'attack' ? 0.3 : 0);
    };
  }

  const M = {};

  // ---------------------------------------------------------------- slime
  M.slime = (look) => {
    const rig = mk(look), c = C(look.color), R = 0.62;
    rig.bone('body', 'root', 0, 0, 0);
    rig.add('body', G.sphHi, { p: [0, R * 0.78, 0], s: [R, R * 0.8, R], c: shade(c, 1.2), c2: shade(c, 0.65) });
    rig.add('body', G.sph, { p: [-R * 0.38, R * 1.28, R * 0.42], r: [0.4, 0, 0.5], s: [R * 0.2, R * 0.1, R * 0.14], c: '#ffffff', k: 'glow', i: 1.3 });
    rig.add('body', G.sph, { p: [-R * 0.12, R * 1.38, R * 0.3], s: R * 0.06, c: '#ffffff', k: 'glow', i: 1.2 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.3;
      rig.add('body', G.sph, { p: [Math.cos(a) * R * 0.82, R * 0.14, Math.sin(a) * R * 0.82], s: [R * 0.3, R * 0.16, R * 0.3], c: shade(c, 0.8) });
    }
    rig.build();
    const f = SH.faceMesh(rig, 'body', R, { eye: '#2a1a2a', style: 'cute', mouth: 'open', brows: false, eyeY: 0.05, eyeX: 0.32 }, new V3(0, R * 0.78, 0));
    f.scale.set(1, 0.8, 1);
    rig.focus = { y: R * 0.8, r: R * 1.2 };
    rig.height = R * 1.6;
    rig.animate = function (t) {
      const b = this.bones.body, sq = Math.sin(t * 4.2) * 0.07 - this.hitT * 0.25;
      b.scale.set(1 - sq * 0.6, 1 + sq, 1 - sq * 0.6);
    };
    return rig;
  };

  // ---------------------------------------------------------------- humanoids made with the hero builder
  function humanoid(look, extra) {
    const rig = SH.buildHero(look);
    rig.kind = 'monster';
    if (extra) extra(rig);
    return rig;
  }
  M.goblin = (look) => {
    const rig = humanoid({
      skin: look.skin, hair: { style: look.zombie ? 'messy' : 'none', color: '#2a2a1a' },
      eyes: { color: look.zombie ? '#d8ff6a' : '#ffcc33', style: 'monster' }, mouth: look.zombie ? 'roar' : 'fang',
      body: { style: 'tunic', top: look.cloth, bottom: shade(look.cloth, 0.7).getStyle(), accent: '#8a6a3a' },
      head: look.crown ? ['goblinears', 'crown'] : ['goblinears'], weapon: look.weapon === 'none' ? null : look.weapon,
      glow: '#ffcc33', scale: (look.scale || 1) * 0.9, metal: '#8a8a94',
    });
    if (look.zombie) {
      const base = rig.animate;
      rig.animate = function (t, dt) { base.call(this, t, dt); this.bones.armL.rotation.x = this.bones.armR.rotation.x = -1.35 + Math.sin(t * 2) * 0.1; this.bones.head.rotation.z = 0.25; };
    }
    return rig;
  };
  M.mummy = (look) => {
    const rig = humanoid({
      skin: look.wrap, hair: { style: 'none', color: '#000' }, eyes: { color: look.eye, style: 'glow' }, mouth: 'none',
      body: { style: 'tunic', top: look.wrap, bottom: shade(look.wrap, 0.85).getStyle(), accent: '#b8a878' },
      head: look.crown ? ['nemes', 'wraps'] : ['wraps'], glow: look.eye, scale: (look.scale || 1) * 0.95,
    });
    const base = rig.animate;
    rig.animate = function (t, dt) { base.call(this, t, dt); this.bones.armL.rotation.x = this.bones.armR.rotation.x = -1.4 + Math.sin(t * 1.6) * 0.08; };
    return rig;
  };
  M.fishman = (look) => humanoid({
    skin: look.skin, hair: { style: 'none', color: '#000' }, eyes: { color: look.eye, style: 'monster' }, mouth: 'fang',
    body: { style: 'tunic', top: shade(look.skin, 0.8).getStyle(), bottom: look.fin, accent: '#e8c050' }, finColor: look.fin,
    head: ['fishfins'], weapon: 'trident', glow: '#7af4ff', scale: 0.95,
  });

  // ---------------------------------------------------------------- mushroom
  M.mushroom = (look) => {
    const rig = mk(look);
    rig.bone('body', 'root', 0, 0, 0);
    const stalk = G.lathe('mstalk', [[0, 0], [0.34, 0.02], [0.36, 0.25], [0.3, 0.6], [0.26, 0.75], [0, 0.78]], 20);
    rig.add('body', stalk, { c: '#f4e8d0', c2: '#d8c8a8' });
    rig.add('body', G.sphHi, { p: [0, 0.82, 0], s: [0.7, 0.42, 0.7], c: look.cap, c2: shade(look.cap, 0.6) });
    rig.add('body', G.cyl, { p: [0, 0.7, 0], s: [0.6, 0.05, 0.6], c: '#e8d8b8' });
    const r = U.rng(5);
    for (let i = 0; i < 7; i++) {
      const th = 0.3 + r() * 1.0, ph = r() * PI * 2;
      const o = onSphere(1, th, ph);
      rig.add('body', G.sph, { p: [o.p.x * 0.7, 0.82 + o.p.y * 0.42, o.p.z * 0.7], q: o.q, s: [0.1, 0.1, 0.03], c: look.dots });
    }
    for (const s of [-1, 1]) rig.add('body', G.sph, { p: [s * 0.18, 0.05, 0.12], s: [0.13, 0.08, 0.17], c: '#8a5a3a' });
    rig.build();
    const f = SH.faceMesh(rig, 'body', 0.33, { eye: '#2a1a1a', style: 'cute', mouth: 'smile', brows: false, eyeY: 0.0, eyeX: 0.34 }, new V3(0, 0.38, 0));
    f.scale.set(1.05, 1.0, 1.05);
    rig.focus = { y: 0.6, r: 0.75 };
    rig.height = 1.25;
    rig.animate = function (t) {
      const b = this.bones.body, hop = Math.max(0, Math.sin(t * 3.5));
      b.position.y = hop * 0.12;
      b.scale.set(1 + (1 - hop) * 0.05, 1 - (1 - hop) * 0.06 - this.hitT * 0.2, 1 + (1 - hop) * 0.05);
    };
    return rig;
  };

  // ---------------------------------------------------------------- wolf / hound
  M.wolf = (look) => {
    const rig = mk(look);
    const fur = C(look.fur), belly = C(look.belly);
    rig.bone('body', 'root', 0, 0.62, 0);
    rig.bone('head', 'body', 0, 0.28, 0.48);
    rig.bone('tail', 'body', 0, 0.12, -0.5);
    const legs = [['legFL', 0.2, 0.32], ['legFR', -0.2, 0.32], ['legBL', 0.2, -0.3], ['legBR', -0.2, -0.3]];
    legs.forEach(([n, x, z]) => rig.bone(n, 'body', x, -0.1, z));
    rig.add('body', G.cap(0.3, 0.45), { r: [PI / 2, 0, 0], s: [1, 1, 0.95], c: fur, c2: shade(fur, 0.7) });
    rig.add('body', G.sph, { p: [0, -0.08, 0.32], s: [0.27, 0.3, 0.22], c: belly });
    rig.add('body', G.sph, { p: [0, 0.12, 0.38], s: [0.3, 0.3, 0.26], c: shade(fur, 1.1) });
    legs.forEach(([n]) => {
      rig.add(n, G.cap(0.09, 0.32), { p: [0, -0.22, 0], c: fur, c2: shade(fur, 0.6) });
      rig.add(n, G.sph, { p: [0, -0.47, 0.04], s: [0.11, 0.07, 0.14], c: shade(fur, 0.55) });
    });
    rig.add('head', G.sph, { s: [0.3, 0.27, 0.3], c: fur, c2: shade(fur, 0.75) });
    rig.add('head', G.cap(0.12, 0.2), { p: [0, -0.07, 0.27], r: [PI / 2, 0, 0], s: [1.1, 1, 0.85], c: belly });
    rig.add('head', G.sph, { p: [0, -0.02, 0.48], s: [0.06, 0.05, 0.05], c: '#1a1a1a' });
    for (const s of [-1, 1]) {
      rig.add('head', G.cone, { p: [s * 0.16, 0.26, -0.04], r: [-0.2, 0, -s * 0.35], s: [0.09, 0.22, 0.06], c: fur, c2: shade(fur, 0.6) });
      rig.add('head', G.sph, { p: [s * 0.13, 0.07, 0.22], r: [0, 0, -s * 0.4], s: [0.065, 0.035, 0.04], c: look.eye, k: 'glow', i: 3.5 });
      rig.add('head', G.box, { p: [s * 0.12, 0.13, 0.22], r: [0, 0, s * 0.5], s: [0.12, 0.025, 0.03], c: '#1a0a0a' });
    }
    fangs(rig, 'head', [0, -0.15, 0.4], 0.06);
    for (let i = 0; i < 5; i++) rig.add('tail', G.sph, { p: [0, i * 0.08, -i * 0.08], s: 0.11 - i * 0.012, c: i > 2 ? belly : fur });
    if (look.flame) {
      for (let i = 0; i < 6; i++) rig.add('body', G.cone, { p: [0, 0.3, 0.3 - i * 0.13], r: [-0.4, 0, 0], s: [0.07, 0.24 - Math.abs(i - 2) * 0.02, 0.07], c: '#ff7a1a', k: 'glow', i: 2.6 });
      for (let i = 0; i < 3; i++) rig.add('tail', G.cone, { p: [0, 0.32 + i * 0.06, -0.3 - i * 0.04], r: [-0.6, 0, 0], s: [0.07, 0.22, 0.07], c: '#ffb43a', k: 'glow', i: 2.6 });
    } else {
      for (let i = 0; i < 4; i++) rig.add('body', G.cone, { p: [0, 0.27, 0.25 - i * 0.14], r: [-0.6, 0, 0], s: [0.08, 0.16, 0.05], c: shade(fur, 0.8) });
    }
    rig.build();
    rig.focus = { y: 0.85, r: 0.6 };
    rig.height = 1.2;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.62 + Math.sin(t * 3) * 0.015;
      B.body.rotation.x = -this.hitT * 0.4 + (this.state === 'attack' ? 0.25 : 0);
      B.head.rotation.x = Math.sin(t * 1.5) * 0.06 - this.hitT * 0.3;
      B.tail.rotation.y = Math.sin(t * 7) * 0.5;
      const run = this.state === 'run' ? 1 : 0;
      ['legFL', 'legBR'].forEach((n) => { B[n].rotation.x = Math.sin(t * 14) * 0.7 * run; });
      ['legFR', 'legBL'].forEach((n) => { B[n].rotation.x = -Math.sin(t * 14) * 0.7 * run; });
    };
    return rig;
  };

  // ---------------------------------------------------------------- bat
  M.bat = (look) => {
    const rig = mk(look);
    rig.bone('body', 'root', 0, 1.05, 0);
    rig.bone('wings', 'body', 0, 0.05, -0.05);
    rig.add('body', G.sphHi, { s: [0.36, 0.34, 0.33], c: look.body, c2: shade(look.body, 0.6) });
    rig.add('body', G.sph, { p: [0, -0.06, 0.18], s: [0.2, 0.2, 0.16], c: shade(look.body, 1.35) });
    for (const s of [-1, 1]) {
      rig.add('body', G.cone, { p: [s * 0.2, 0.36, -0.02], r: [0, 0, -s * 0.3], s: [0.1, 0.3, 0.07], c: look.body, c2: look.wing });
      rig.add('body', G.cap(0.03, 0.08), { p: [s * 0.1, -0.36, 0.04], c: shade(look.body, 0.5) });
    }
    glowEyes(rig, 'body', 0.34, [0, 0.03, 0], look.eye, { spread: 0.36, size: 0.3, angry: true });
    fangs(rig, 'body', [0, -0.1, 0.31], 0.06);
    SH.buildWings(rig, 'bat', { wingColor: look.wing }, 1.2);
    rig.build();
    rig.focus = { y: 1.05, r: 0.5 };
    rig.height = 1.5;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 1.05 + Math.sin(t * 3.5) * 0.08;
      B.body.rotation.x = -this.hitT * 0.5;
      const f = Math.sin(t * 16) * 0.75;
      B.wingL.rotation.y = -0.2 - f; B.wingR.rotation.y = 0.2 + f;
    };
    return rig;
  };

  // ---------------------------------------------------------------- yeti
  M.yeti = (look) => {
    const rig = mk(look);
    const fur = C(look.fur), skin = C(look.skin);
    rig.bone('body', 'root', 0, 0.35, 0);
    rig.bone('head', 'body', 0, 1.05, 0.12);
    rig.bone('armL', 'body', 0.52, 0.85, 0);
    rig.bone('armR', 'body', -0.52, 0.85, 0);
    rig.add('body', G.sphHi, { p: [0, 0.55, 0], s: [0.6, 0.62, 0.5], c: fur, c2: shade(fur, 0.75) });
    rig.add('body', G.sph, { p: [0, 0.48, 0.25], s: [0.38, 0.4, 0.3], c: shade(fur, 1.05) });
    for (const s of [-1, 1]) {
      rig.add('body', G.cap(0.14, 0.18), { p: [s * 0.25, 0.0, 0], c: fur });
      rig.add('body', G.sph, { p: [s * 0.25, -0.22, 0.08], s: [0.18, 0.11, 0.22], c: skin });
    }
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      rig.add('body', G.cone, { p: [Math.sin(a) * 0.45, 0.98, Math.cos(a) * 0.15 - 0.1], r: [-0.3, 0, -a * 0.5], s: [0.12, 0.3, 0.12], c: fur });
    }
    rig.add('head', G.sphHi, { s: [0.38, 0.36, 0.36], c: fur, c2: shade(fur, 0.8) });
    rig.add('head', G.sph, { p: [0, -0.06, 0.18], s: [0.28, 0.24, 0.22], c: skin, c2: shade(skin, 0.75) });
    for (const s of [-1, 1]) rig.add('head', G.cone, { p: [s * 0.24, 0.3, 0], r: [0.3, 0, -s * 0.5], s: [0.07, 0.25, 0.07], c: '#efe6cf' });
    glowEyes(rig, 'head', 0.36, [0, 0, 0.06], '#7ae8ff', { spread: 0.3, size: 0.22, angry: true, down: 0.0 });
    rig.add('head', G.sph, { p: [0, -0.16, 0.36], s: [0.12, 0.06, 0.05], c: '#3a1020' });
    fangs(rig, 'head', [0, -0.15, 0.38], 0.07);
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.cap(0.15, 0.5), { p: [s * 0.08, -0.35, 0.05], r: [0, 0, s * 0.15], c: fur, c2: shade(fur, 0.75) });
      rig.add(b, G.sph, { p: [s * 0.14, -0.78, 0.1], s: [0.2, 0.17, 0.2], c: skin });
    }
    rig.build();
    rig.focus = { y: 1.45 * (look.scale || 1), r: 0.55 * (look.scale || 1) };
    rig.height = 1.9;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.35 + Math.sin(t * 2.5) * 0.03;
      B.body.rotation.x = -this.hitT * 0.35 + (this.state === 'attack' ? 0.3 : 0);
      B.armL.rotation.x = Math.sin(t * 2.5) * 0.15 - (this.state === 'attack' ? 1.6 : 0);
      B.armR.rotation.x = -Math.sin(t * 2.5) * 0.15 - (this.state === 'attack' ? 1.6 : 0);
      B.head.rotation.z = Math.sin(t * 1.3) * 0.08;
    };
    return rig;
  };

  // ---------------------------------------------------------------- dragon (boss)
  M.dragon = (look) => {
    const rig = mk(look, 0.04);
    const body = C(look.body), belly = C(look.belly), wing = C(look.wing), horn = C(look.horn);
    rig.bone('body', 'root', 0, 0.9, 0);
    rig.bone('neck', 'body', 0, 0.6, 0.35);
    rig.bone('head', 'neck', 0, 0.75, 0.35);
    rig.bone('jaw', 'head', 0, -0.12, 0.15);
    rig.bone('wings', 'body', 0, 0.55, -0.35);
    rig.bone('tail', 'body', 0, -0.4, -0.6);
    rig.add('body', G.sphHi, { s: [0.85, 0.78, 0.95], c: body, c2: shade(body, 0.6) });
    rig.add('body', G.sph, { p: [0, -0.05, 0.42], s: [0.6, 0.65, 0.5], c: belly, c2: shade(belly, 0.8) });
    for (let i = 0; i < 4; i++) rig.add('body', G.box, { p: [0, 0.35 - i * 0.22, 0.86 - Math.abs(i - 1.5) * 0.05], r: [-0.25 + i * 0.1, 0, 0], s: [0.42 - i * 0.05, 0.05, 0.08], c: shade(belly, 0.85) });
    for (const s of [-1, 1]) {
      rig.add('body', G.cap(0.2, 0.35), { p: [s * 0.55, -0.6, 0.35], r: [0.4, 0, 0], c: body, c2: shade(body, 0.7) });
      rig.add('body', G.sph, { p: [s * 0.55, -0.88, 0.55], s: [0.22, 0.12, 0.28], c: shade(body, 0.8) });
      for (let k = -1; k <= 1; k++) rig.add('body', G.cone, { p: [s * 0.55 + k * 0.1, -0.88, 0.82], r: [PI / 2, 0, 0], s: [0.04, 0.12, 0.04], c: horn });
      rig.add('body', G.cap(0.25, 0.3), { p: [s * 0.7, -0.55, -0.35], c: body });
      rig.add('body', G.sph, { p: [s * 0.72, -0.85, -0.18], s: [0.26, 0.14, 0.32], c: shade(body, 0.8) });
      // arms
      rig.add('body', G.cap(0.13, 0.35), { p: [s * 0.6, 0.15, 0.6], r: [0.9, 0, -s * 0.3], c: body });
      rig.add('body', G.sph, { p: [s * 0.65, -0.1, 0.9], s: [0.14, 0.12, 0.16], c: shade(body, 0.8) });
    }
    for (let i = 0; i < 3; i++) rig.add('neck', G.sph, { p: [0, i * 0.25, i * 0.12], s: [0.32 - i * 0.03, 0.3, 0.3 - i * 0.02], c: body, c2: shade(body, 0.7) });
    for (let i = 0; i < 4; i++) rig.add('neck', G.cone, { p: [0, i * 0.22 + 0.1, -0.22 + i * 0.1], r: [-0.6, 0, 0], s: [0.06, 0.2, 0.06], c: horn });
    rig.add('head', G.sphHi, { s: [0.42, 0.36, 0.45], c: body, c2: shade(body, 0.7) });
    rig.add('head', G.box, { p: [0, -0.04, 0.45], s: [0.42, 0.24, 0.5], c: body, c2: shade(body, 0.75) });
    rig.add('jaw', G.box, { p: [0, -0.02, 0.32], r: [0.15, 0, 0], s: [0.36, 0.1, 0.42], c: belly });
    for (let k = -2; k <= 2; k++) rig.add('jaw', G.cone, { p: [k * 0.07, 0.07, 0.5], s: [0.025, 0.07, 0.025], c: '#ffffff', ol: false });
    for (const s of [-1, 1]) {
      rig.add('head', G.cone, { p: [s * 0.25, 0.32, -0.25], r: [-1.0, 0, -s * 0.35], s: [0.08, 0.55, 0.08], c: horn, c2: shade(horn, 0.7) });
      rig.add('head', G.cone, { p: [s * 0.4, 0.05, -0.15], r: [-1.3, 0, -s * 0.9], s: [0.05, 0.3, 0.05], c: horn });
      rig.add('head', G.sph, { p: [s * 0.22, 0.12, 0.3], r: [0, s * 0.3, -s * 0.35], s: [0.1, 0.05, 0.05], c: look.eye, k: 'glow', i: 4 });
      rig.add('head', G.box, { p: [s * 0.22, 0.2, 0.3], r: [0, 0, s * 0.45], s: [0.18, 0.04, 0.05], c: shade(body, 0.5) });
      rig.add('head', G.sph, { p: [s * 0.1, 0.03, 0.72], s: 0.03, c: '#101018', ol: false });
    }
    SH.buildWings(rig, 'bat', { wingColor: wing.getStyle() }, 2.6);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      rig.add('tail', G.sph, { p: [Math.sin(t * 2.2) * 0.5, -t * 0.25, -t * 1.3], s: 0.3 - t * 0.22, c: body, c2: shade(body, 0.7) });
      if (i % 2 === 0) rig.add('tail', G.cone, { p: [Math.sin(t * 2.2) * 0.5, 0.25 - t * 0.35, -t * 1.3], r: [-0.4, 0, 0], s: [0.05, 0.16, 0.05], c: horn });
    }
    rig.add('tail', G.oct, { p: [Math.sin(2.2) * 0.5, -0.25, -1.45], s: [0.18, 0.08, 0.25], c: horn });
    rig.build();
    rig.focus = { y: (0.9 + 0.6 + 0.75) * (look.scale || 1), r: 0.75 * (look.scale || 1) };
    rig.height = 2.6;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.9 + Math.sin(t * 2) * 0.04;
      B.body.rotation.x = -this.hitT * 0.25;
      B.neck.rotation.x = Math.sin(t * 1.4) * 0.08 + (this.state === 'attack' ? 0.35 : 0);
      B.head.rotation.x = Math.sin(t * 1.4 + 1) * 0.06 - (this.state === 'attack' ? 0.3 : 0);
      B.jaw.rotation.x = (this.state === 'attack' ? 0.6 : 0.08 + Math.sin(t * 2) * 0.05);
      const f = Math.sin(t * 3) * 0.35;
      B.wingL.rotation.y = -0.5 - f; B.wingR.rotation.y = 0.5 + f;
      B.wingL.rotation.z = 0.3; B.wingR.rotation.z = -0.3;
      B.tail.rotation.y = Math.sin(t * 1.5) * 0.25;
    };
    return rig;
  };

  // ---------------------------------------------------------------- scorpion
  M.scorpion = (look) => {
    const rig = mk(look);
    const sh = C(look.shell), dk = C(look.dark);
    rig.bone('body', 'root', 0, 0.35, 0);
    rig.bone('tail', 'body', 0, 0.1, -0.45);
    rig.bone('clawL', 'body', 0.25, 0.0, 0.4);
    rig.bone('clawR', 'body', -0.25, 0.0, 0.4);
    for (let i = 0; i < 3; i++) rig.add('body', G.sph, { p: [0, 0.02, 0.25 - i * 0.25], s: [0.36 - i * 0.04, 0.2, 0.22], c: sh, c2: dk });
    rig.add('body', G.sph, { p: [0, 0.05, 0.42], s: [0.22, 0.16, 0.18], c: sh });
    for (const s of [-1, 1]) {
      rig.add('body', G.sph, { p: [s * 0.08, 0.17, 0.55], s: 0.045, c: '#ff4a3a', k: 'glow', i: 3 });
      for (let k = 0; k < 3; k++) {
        rig.add('body', G.cap(0.035, 0.32), { p: [s * 0.38, -0.08, 0.15 - k * 0.22], r: [0, 0, s * 1.0], c: dk });
        rig.add('body', G.cap(0.03, 0.24), { p: [s * 0.55, -0.24, 0.15 - k * 0.22], r: [0, 0, s * 0.2], c: dk });
      }
    }
    for (const [b, s] of [['clawL', 1], ['clawR', -1]]) {
      rig.add(b, G.cap(0.06, 0.3), { p: [s * 0.1, 0, 0.15], r: [PI / 2 - 0.3, 0, -s * 0.6], c: sh });
      rig.add(b, G.sph, { p: [s * 0.2, 0.05, 0.42], s: [0.14, 0.11, 0.18], c: sh, c2: dk });
      rig.add(b, G.cone, { p: [s * 0.15, 0.05, 0.64], r: [PI / 2, 0, s * 0.3], s: [0.05, 0.25, 0.05], c: dk });
      rig.add(b, G.cone, { p: [s * 0.27, 0.05, 0.62], r: [PI / 2, 0, -s * 0.3], s: [0.04, 0.2, 0.04], c: dk });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 5) * PI * 0.95;
      rig.add('tail', G.sph, { p: [0, Math.sin(a) * 0.75, -Math.cos(a) * 0.3 + 0.2 - 0.25 + (1 - Math.cos(a)) * 0.2], s: 0.13 - i * 0.012, c: sh, c2: dk });
    }
    rig.add('tail', G.cone, { p: [0, 0.68, 0.38], r: [2.4, 0, 0], s: [0.07, 0.22, 0.07], c: '#c84aff', k: 'glow', i: 2.5 });
    rig.build();
    rig.focus = { y: 0.55, r: 0.7 };
    rig.height = 1.3;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.35 + Math.sin(t * 3) * 0.01;
      B.body.rotation.x = -this.hitT * 0.3;
      B.tail.rotation.x = Math.sin(t * 2.5) * 0.12 + (this.state === 'attack' ? 0.5 : 0);
      B.clawL.rotation.y = Math.sin(t * 3) * 0.15; B.clawR.rotation.y = -Math.sin(t * 3) * 0.15;
    };
    return rig;
  };

  // ---------------------------------------------------------------- golem
  M.golem = (look) => {
    const rig = mk(look, 0.035);
    const rock = C(look.rock), rune = look.rune;
    const r = U.rng(11);
    const rc = () => shade(rock, 0.85 + r() * 0.3);
    rig.bone('body', 'root', 0, 0.55, 0);
    rig.bone('head', 'body', 0, 0.95, 0.18);
    rig.bone('armL', 'body', 0.62, 0.75, 0);
    rig.bone('armR', 'body', -0.62, 0.75, 0);
    rig.add('body', G.box, { p: [0, 0.45, 0], s: [1.0, 0.85, 0.7], c: rc(), c2: shade(rock, 0.6) });
    rig.add('body', G.box, { p: [0, -0.05, 0], s: [0.7, 0.35, 0.55], c: rc() });
    for (const s of [-1, 1]) rig.add('body', G.box, { p: [s * 0.24, -0.38, 0], s: [0.3, 0.42, 0.36], c: rc(), c2: shade(rock, 0.6) });
    rig.add('body', G.oct, { p: [0, 0.5, 0.36], s: [0.12, 0.16, 0.05], c: rune, k: 'glow', i: 3 });
    for (const s of [-1, 1]) {
      rig.add('body', G.box, { p: [s * 0.22, 0.55, 0.355], r: [0, 0, s * 0.6], s: [0.22, 0.03, 0.02], c: rune, k: 'glow', i: 2.5, ol: false });
      rig.add('body', G.box, { p: [s * 0.25, 0.32, 0.355], r: [0, 0, -s * 0.5], s: [0.2, 0.03, 0.02], c: rune, k: 'glow', i: 2.5, ol: false });
    }
    for (let i = 0; i < 4; i++) rig.add('body', G.dodec, { p: [(r() - 0.5) * 0.8, 0.9 + r() * 0.05, -0.15 + (r() - 0.5) * 0.3], s: 0.12 + r() * 0.08, c: '#6a9a4a' });
    rig.add('head', G.box, { s: [0.42, 0.34, 0.36], c: rc(), c2: shade(rock, 0.6) });
    rig.add('head', G.box, { p: [0, 0.05, 0.18], s: [0.36, 0.08, 0.05], c: '#141018', ol: false });
    for (const s of [-1, 1]) rig.add('head', G.sph, { p: [s * 0.1, 0.05, 0.2], s: [0.05, 0.03, 0.02], c: rune, k: 'glow', i: 4 });
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.dodec, { p: [s * 0.05, 0, 0], s: 0.26, c: rc() });
      rig.add(b, G.box, { p: [s * 0.1, -0.38, 0.02], r: [0, 0, s * 0.1], s: [0.26, 0.45, 0.28], c: rc() });
      rig.add(b, G.dodec, { p: [s * 0.14, -0.78, 0.06], s: 0.25, c: rc(), c2: shade(rock, 0.6) });
      rig.add(b, G.box, { p: [s * 0.1, -0.35, 0.15], s: [0.18, 0.03, 0.02], c: rune, k: 'glow', i: 2.5, ol: false });
    }
    rig.build();
    rig.focus = { y: 1.5 * (look.scale || 1), r: 0.5 * (look.scale || 1) };
    rig.height = 1.9;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.55 + Math.sin(t * 1.8) * 0.02;
      B.body.rotation.x = -this.hitT * 0.2 + (this.state === 'attack' ? 0.25 : 0);
      B.armL.rotation.x = Math.sin(t * 1.8) * 0.1 - (this.state === 'attack' ? 2.0 : 0);
      B.armR.rotation.x = -Math.sin(t * 1.8) * 0.1 - (this.state === 'attack' ? 2.0 : 0);
      B.head.rotation.y = Math.sin(t * 0.9) * 0.15;
    };
    return rig;
  };

  // ---------------------------------------------------------------- cobra
  M.snake = (look) => {
    const rig = mk(look);
    const sk = C(look.skin), be = C(look.belly);
    rig.bone('body', 'root', 0, 0, 0);
    rig.bone('neck', 'body', 0, 0.25, 0.1);
    rig.add('body', G.torus(0.42, 0.16, PI * 2, 10, 28), { p: [0, 0.15, 0], r: [PI / 2, 0, 0], c: sk, c2: shade(sk, 0.65) });
    rig.add('body', G.torus(0.26, 0.14, PI * 2, 10, 24), { p: [0, 0.35, 0], r: [PI / 2, 0, 0], c: sk });
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      rig.add('neck', G.sph, { p: [0, t * 0.85, Math.sin(t * 2.4) * 0.2], s: [0.15, 0.17, 0.15], c: i % 2 ? sk : shade(sk, 0.9) });
      rig.add('neck', G.sph, { p: [0, t * 0.85, Math.sin(t * 2.4) * 0.2 + 0.08], s: [0.1, 0.13, 0.08], c: be });
    }
    rig.bone('head', 'neck', 0, 0.95, 0.12);
    rig.add('head', G.sph, { p: [0, -0.05, -0.12], s: [0.48, 0.42, 0.08], c: sk, c2: be });
    rig.add('head', G.sph, { p: [0, 0, 0.08], s: [0.18, 0.13, 0.24], c: sk, c2: shade(sk, 0.8) });
    for (const s of [-1, 1]) rig.add('head', G.sph, { p: [s * 0.1, 0.06, 0.2], s: [0.05, 0.035, 0.04], c: look.eye, k: 'glow', i: 3.5 });
    rig.add('head', G.cone, { p: [0, -0.04, 0.38], r: [PI / 2, 0, 0], s: [0.012, 0.16, 0.012], c: '#ff3a5a', ol: false });
    for (let i = 0; i < 3; i++) rig.add('head', G.sph, { p: [0, -0.05 - i * 0.12, -0.08], s: [0.06, 0.05, 0.02], c: '#3a2a1a' });
    rig.build();
    rig.focus = { y: 1.2, r: 0.5 };
    rig.height = 1.4;
    rig.animate = function (t) {
      const B = this.bones;
      B.neck.rotation.x = Math.sin(t * 2.2) * 0.1 - this.hitT * 0.4 + (this.state === 'attack' ? 0.5 : 0);
      B.neck.rotation.z = Math.sin(t * 1.6) * 0.12;
    };
    return rig;
  };

  // ---------------------------------------------------------------- skeleton
  function skull(rig, bone, R, bone_c, eye, p) {
    rig.add(bone, G.sphHi, { p, s: [R, R * 0.95, R], c: bone_c, c2: shade(bone_c, 0.75) });
    rig.add(bone, G.box, { p: [p[0], p[1] - R * 0.65, p[2] + R * 0.3], s: [R * 0.9, R * 0.35, R * 0.7], c: bone_c });
    for (const s of [-1, 1]) {
      const o = onSphere(R * 0.96, PI / 2 + 0.05, s * 0.38);
      rig.add(bone, G.sph, { p: [p[0] + o.p.x, p[1] + o.p.y, p[2] + o.p.z], q: o.q, s: [R * 0.26, R * 0.3, R * 0.1], c: '#120c10', ol: false });
      rig.add(bone, G.sph, { p: [p[0] + o.p.x * 1.03, p[1] + o.p.y, p[2] + o.p.z * 1.03], q: o.q, s: [R * 0.09, R * 0.09, R * 0.05], c: eye, k: 'glow', i: 4 });
    }
    rig.add(bone, G.cone, { p: [p[0], p[1] - R * 0.32, p[2] + R * 0.95], r: [PI + 0.3, 0, 0], s: [R * 0.08, R * 0.14, R * 0.05], c: '#120c10', ol: false });
    for (let k = -2; k <= 2; k++) rig.add(bone, G.box, { p: [p[0] + k * R * 0.14, p[1] - R * 0.62, p[2] + R * 0.66], s: [R * 0.1, R * 0.14, R * 0.04], c: '#ffffff', ol: false });
  }
  M.skeleton = (look) => {
    const rig = mk(look);
    const bc = C(look.bone);
    rig.bone('body', 'root', 0, 0.52, 0);
    rig.bone('head', 'body', 0, 0.98, 0.04);
    rig.bone('armL', 'body', 0.26, 0.72, 0);
    rig.bone('armR', 'body', -0.26, 0.72, 0);
    rig.bone('legL', 'root', 0.12, 0.52, 0);
    rig.bone('legR', 'root', -0.12, 0.52, 0);
    rig.add('body', G.cyl, { p: [0, 0.35, -0.06], s: [0.05, 0.7, 0.05], c: bc });
    for (let i = 0; i < 4; i++) rig.add('body', G.torus(0.2 - i * 0.025, 0.028, PI * 2, 6, 20), { p: [0, 0.68 - i * 0.12, 0], r: [PI / 2, 0, 0], s: [1, 0.75, 1], c: bc });
    rig.add('body', G.sph, { p: [0, 0.02, 0], s: [0.2, 0.1, 0.14], c: bc });
    if (look.armor) {
      rig.add('body', G.sph, { p: [0, 0.55, 0.05], s: [0.28, 0.25, 0.22], c: '#4a4a5a', c2: '#2a2a34', k: 'metal' });
      for (const s of [-1, 1]) rig.add('body', G.shell(0.17, 0, PI * 2, 0, PI * 0.5, 16, 8), { p: [s * 0.3, 0.74, 0], r: [0, 0, -s * 0.4], c: '#5a5a6a', k: 'metal' });
    }
    skull(rig, 'head', 0.3, bc, look.eye, [0, 0.12, 0]);
    if (look.armor) rig.add('head', G.shell(0.34, 0, PI * 2, 0, 1.3, 20, 10), { p: [0, 0.14, -0.02], c: '#4a4a5a', c2: '#2a2a34', k: 'metal' });
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.cap(0.035, 0.3), { p: [s * 0.03, -0.18, 0], c: bc });
      rig.add(b, G.sph, { p: [s * 0.05, -0.4, 0.02], s: 0.06, c: bc });
    }
    for (const b of ['legL', 'legR']) {
      rig.add(b, G.cap(0.04, 0.34), { p: [0, -0.24, 0], c: bc });
      rig.add(b, G.sph, { p: [0, -0.48, 0.05], s: [0.07, 0.04, 0.11], c: bc });
    }
    rig.bone('weaponR', 'armR', -0.05, -0.42, 0.04).rotation.set(0.6, 0, 0.5);
    SH.buildWeapon(rig, 'weaponR', 'sword', { glow: look.eye }, -1);
    rig.bone('shieldL', 'armL', 0.1, -0.35, 0.08).rotation.set(0, 0.5, 0);
    SH.buildWeapon(rig, 'shieldL', 'shield', { metal: '#7a6a5a', glow: look.eye, body: { accent: '#5a2a2a' } }, 1);
    rig.build();
    rig.focus = { y: 1.6 * (look.scale || 1), r: 0.42 * (look.scale || 1) };
    rig.height = 1.95;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.52 + Math.sin(t * 3) * 0.015;
      B.body.rotation.x = -this.hitT * 0.4 + (this.state === 'attack' ? 0.3 : 0);
      B.head.rotation.z = Math.sin(t * 2) * 0.1;
      B.armR.rotation.x = -0.3 + Math.sin(t * 3) * 0.08 - (this.state === 'attack' ? 1.6 : 0);
      B.armL.rotation.x = -0.4;
    };
    return rig;
  };

  // ---------------------------------------------------------------- ghost
  M.ghost = (look) => {
    const rig = mk(look);
    const c = C(look.color);
    rig.bone('body', 'root', 0, 0.55, 0);
    const sheet = (() => {
      const g = new THREE.LatheGeometry([[0, 1.1], [0.3, 1.05], [0.45, 0.8], [0.48, 0.4], [0.52, 0.0], [0.56, -0.15]].map((p) => new THREE.Vector2(p[0], p[1])), 28);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < -0.1) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y + Math.sin(a * 6) * 0.08); }
      }
      g.computeVertexNormals();
      return g;
    })();
    rig.add('body', sheet, { c: shade(c, 1.15), c2: shade(c, 0.6), k: 'toon2' });
    for (const s of [-1, 1]) rig.add('body', G.cap(0.08, 0.2), { p: [s * 0.45, 0.45, 0.15], r: [0.5, 0, -s * 0.9], c: c });
    glowEyes(rig, 'body', 0.46, [0, 0.72, 0], look.eye, { spread: 0.33, size: 0.26, down: 0.0 });
    rig.add('body', G.sph, { p: [0, 0.52, 0.44], s: [0.08, 0.1, 0.04], c: '#141020', ol: false });
    rig.build();
    rig.mats.toon2.transparent = true; rig.mats.toon2.opacity = 0.85;
    rig.focus = { y: 1.25, r: 0.55 };
    rig.height = 1.7;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.55 + Math.sin(t * 2.4) * 0.12;
      B.body.rotation.z = Math.sin(t * 1.7) * 0.1;
      B.body.rotation.x = -this.hitT * 0.5;
    };
    return rig;
  };

  // ---------------------------------------------------------------- lich (boss)
  M.lich = (look) => {
    const rig = mk(look, 0.04);
    const robe = C(look.robe), trim = look.trim, bc = C(look.bone);
    rig.bone('body', 'root', 0, 0.35, 0);
    rig.bone('head', 'body', 0, 1.55, 0.05);
    rig.bone('armL', 'body', 0.45, 1.25, 0);
    rig.bone('armR', 'body', -0.45, 1.25, 0);
    const robeG = G.lathe('lichrobe', [[0.6, -0.25], [0.55, 0.2], [0.45, 0.7], [0.36, 1.15], [0.2, 1.4], [0, 1.45]], 28);
    rig.add('body', robeG, { c: robe, c2: shade(robe, 1.6) });
    rig.add('body', G.torus(0.6, 0.04, PI * 2, 6, 32), { p: [0, -0.24, 0], r: [PI / 2, 0, 0], c: trim, k: 'glow', i: 2 });
    rig.add('body', G.box, { p: [0, 0.6, 0.42], r: [-0.15, 0, 0], s: [0.12, 1.0, 0.03], c: trim, k: 'glow', i: 1.8, ol: false });
    for (const s of [-1, 1]) {
      skull(rig, 'body', 0.14, bc, trim, [s * 0.42, 1.35, 0.05]);
      rig.add('body', G.shell(0.24, 0, PI * 2, 0, PI * 0.5, 16, 8), { p: [s * 0.4, 1.28, 0], r: [0, 0, -s * 0.5], c: '#4a3a5a', k: 'metal' });
    }
    rig.add('body', G.taper(0.32, 0.22, 18), { p: [0, 1.42, -0.05], s: [1, 0.3, 1], c: shade(robe, 1.3), k: 'toon2' });
    skull(rig, 'head', 0.3, bc, trim, [0, 0.05, 0]);
    rig.add('head', G.taper(0.27, 0.3, 16), { p: [0, 0.32, -0.02], s: [1, 0.1, 1], c: '#c8902a', k: 'metal' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      rig.add('head', G.cone, { p: [Math.sin(a) * 0.28, 0.5, Math.cos(a) * 0.28 - 0.02], s: [0.05, 0.3, 0.05], c: '#c8902a', k: 'metal' });
    }
    rig.add('head', G.oct, { p: [0, 0.4, 0.29], s: [0.06, 0.09, 0.03], c: trim, k: 'glow', i: 3 });
    rig.add('head', G.shell(0.38, PI / 2 + 0.9, PI * 2 - 1.8, 0, 2.0, 22, 12), { p: [0, 0.05, -0.02], c: robe, c2: shade(robe, 0.7), k: 'toon2' });
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.taper(0.16, 0.1, 12), { p: [s * 0.08, -0.25, 0.05], r: [0, 0, s * 0.3], s: [1, 0.55, 1], c: robe });
      rig.add(b, G.cap(0.03, 0.2), { p: [s * 0.2, -0.58, 0.08], c: bc });
      for (let k = -1; k <= 1; k++) rig.add(b, G.cone, { p: [s * 0.2 + k * 0.03, -0.75, 0.1], r: [PI, 0, 0], s: [0.012, 0.1, 0.012], c: bc, ol: false });
    }
    rig.bone('staff', 'armR', -0.2, -0.65, 0.12).rotation.set(0.25, 0, 0.15);
    rig.add('staff', G.taper(0.035, 0.05, 8), { p: [0, 0.4, 0], s: [1, 2.0, 1], c: '#2a1a2a' });
    skull(rig, 'staff', 0.13, bc, trim, [0, 1.45, 0]);
    rig.add('staff', G.torus(0.2, 0.025, PI * 2, 6, 24), { p: [0, 1.45, 0], r: [0.4, 0, 0], c: trim, k: 'glow', i: 2.5 });
    rig.build();
    rig.focus = { y: 1.95 * (look.scale || 1), r: 0.55 * (look.scale || 1) };
    rig.height = 2.4;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.45 + Math.sin(t * 1.8) * 0.1;
      B.body.rotation.x = -this.hitT * 0.25;
      B.armR.rotation.x = -0.3 + Math.sin(t * 1.8) * 0.06 - (this.state === 'attack' ? 1.3 : 0);
      B.armL.rotation.x = -0.7 + Math.sin(t * 1.8 + 1) * 0.1 - (this.state === 'attack' ? 1.0 : 0);
      B.armL.rotation.z = 0.4;
      B.head.rotation.z = Math.sin(t * 1.1) * 0.08;
    };
    return rig;
  };

  // ---------------------------------------------------------------- imp
  M.imp = (look) => {
    const rig = mk(look);
    const sk = C(look.skin);
    rig.bone('body', 'root', 0, 0.85, 0);
    rig.bone('wings', 'body', 0, 0.12, -0.25);
    rig.bone('tail', 'body', 0, -0.25, -0.3);
    rig.add('body', G.sphHi, { s: [0.45, 0.45, 0.42], c: sk, c2: shade(sk, 0.6) });
    rig.add('body', G.sph, { p: [0, -0.15, 0.25], s: [0.25, 0.22, 0.18], c: shade(sk, 1.3) });
    for (const s of [-1, 1]) {
      rig.add('body', G.cone, { p: [s * 0.25, 0.42, 0.05], r: [0.3, 0, -s * 0.5], s: [0.08, 0.28, 0.08], c: '#2a1414', c2: '#5a2a2a' });
      rig.add('body', G.cap(0.05, 0.14), { p: [s * 0.42, -0.1, 0.1], r: [0.4, 0, -s * 0.7], c: sk });
      rig.add('body', G.cap(0.05, 0.1), { p: [s * 0.16, -0.48, 0.04], c: shade(sk, 0.7) });
    }
    rig.build();
    SH.faceMesh(rig, 'body', 0.45, { eye: '#ffe03a', style: 'monster', mouth: 'fang', eyeY: 0.02, eyeX: 0.34, blush: false }, new V3(0, 0, 0));
    // second build pass for wings/tail/fork (face is a separate mesh, so the parts list starts fresh)
    rig.parts = {};
    SH.buildWings(rig, 'bat', { wingColor: look.wing }, 0.8);
    for (let i = 0; i < 6; i++) { const t = i / 5; rig.add('tail', G.sph, { p: [Math.sin(t * 3) * 0.12, -t * 0.15, -t * 0.4], s: 0.045 - t * 0.012, c: sk }); }
    rig.add('tail', G.cone, { p: [0.0, -0.18, -0.46], r: [-1.6, 0, 0], s: [0.08, 0.13, 0.03], c: '#2a1414' });
    rig.bone('fork', 'body', -0.48, -0.05, 0.15).rotation.set(0.3, 0, 0.3);
    SH.buildWeapon(rig, 'fork', 'trident', { glow: '#ff7a1a' }, -1);
    rig.bones.fork.scale.setScalar(0.65);
    buildMore(rig);
    rig.focus = { y: 0.88, r: 0.55 };
    rig.height = 1.4;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.85 + Math.sin(t * 3.2) * 0.1;
      B.body.rotation.x = -this.hitT * 0.5;
      const f = Math.sin(t * 14) * 0.6;
      B.wingL.rotation.y = -0.3 - f; B.wingR.rotation.y = 0.3 + f;
      B.tail.rotation.y = Math.sin(t * 3) * 0.4;
    };
    return rig;
  };
  // merges the parts added after the first build (same as Rig.build, but keeps the materials)
  function buildMore(rig) {
    const mats = rig.mats;
    for (const key in rig.parts) {
      const [bone, kind, noOl] = key.split('|');
      const geom = SH.mergeParts(rig.parts[key]);
      const mesh = new THREE.Mesh(geom, mats[kind]);
      mesh.castShadow = SH.Q.shadows && kind !== 'trans' && kind !== 'glow';
      rig.bones[bone].add(mesh);
      if (kind !== 'glow' && kind !== 'trans' && !noOl) rig.bones[bone].add(new THREE.Mesh(geom, mats.outline));
    }
    rig.parts = null;
  }

  // ---------------------------------------------------------------- demon / demon lord
  function demonBody(rig, look, lord) {
    const sk = C(look.skin), ar = C(look.armor), horn = C(look.horn || '#2a2020');
    const gold = look.gold || '#8a6a4a';
    rig.bone('body', 'root', 0, 0.62, 0);
    rig.bone('head', 'body', 0, 1.18, 0.12);
    rig.bone('armL', 'body', 0.55, 0.95, 0);
    rig.bone('armR', 'body', -0.55, 0.95, 0);
    rig.bone('legL', 'root', 0.2, 0.62, 0);
    rig.bone('legR', 'root', -0.2, 0.62, 0);
    rig.bone('wings', 'body', 0, 0.85, -0.3);
    rig.bone('tail', 'body', 0, 0.0, -0.3);
    rig.add('body', G.sphHi, { p: [0, 0.68, 0], s: [0.55, 0.5, 0.4], c: sk, c2: shade(sk, 0.6) });
    rig.add('body', G.sph, { p: [0, 0.3, 0.02], s: [0.4, 0.35, 0.32], c: shade(sk, 0.9) });
    for (const s of [-1, 1]) rig.add('body', G.sph, { p: [s * 0.18, 0.78, 0.27], s: [0.2, 0.16, 0.12], c: shade(sk, 1.1) });
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) rig.add('body', G.sph, { p: [s * 0.1, 0.52 - i * 0.12, 0.3], s: [0.085, 0.055, 0.05], c: shade(sk, 1.05) });
    rig.add('body', G.torus(0.36, 0.06, PI * 2, 8, 26), { p: [0, 0.1, 0], r: [PI / 2, 0, 0], s: [1, 0.8, 1], c: ar, k: 'metal' });
    rig.add('body', G.oct, { p: [0, 0.1, 0.3], s: [0.1, 0.12, 0.05], c: lord ? look.eye : gold, k: lord ? 'glow' : 'metal', i: 2.5 });
    rig.add('body', G.lathe('dskirt', [[0.36, 0.1], [0.42, -0.15], [0.48, -0.32], [0.0, -0.32]], 20), { c: ar, c2: shade(ar, 0.6) });
    for (const s of [-1, 1]) {
      rig.add('body', G.shell(0.3, 0, PI * 2, 0, PI * 0.55, 18, 8), { p: [s * 0.55, 1.0, 0], r: [0, 0, -s * 0.45], c: ar, k: 'metal' });
      for (let k = 0; k < (lord ? 3 : 2); k++) rig.add('body', G.cone, { p: [s * (0.6 + k * 0.08), 1.18 + k * 0.02, -0.05 + k * 0.08], r: [0, 0, -s * 0.5], s: [0.05, 0.22, 0.05], c: lord ? gold : horn, k: lord ? 'metal' : 'toon' });
    }
    rig.add('head', G.sphHi, { s: [0.3, 0.3, 0.3], c: sk, c2: shade(sk, 0.7) });
    rig.add('head', G.sph, { p: [0, -0.15, 0.1], s: [0.22, 0.14, 0.2], c: shade(sk, 0.85) });
    for (const s of [-1, 1]) {
      rig.add('head', G.cone, { p: [s * 0.22, 0.28, 0.0], r: [-0.3, 0, -s * 0.6], s: [0.08, 0.38, 0.08], c: horn, c2: shade(horn, 1.5) });
      rig.add('head', G.cone, { p: [s * 0.42, 0.55, -0.1], r: [-0.6, 0, s * 0.2], s: [0.05, 0.3, 0.05], c: shade(horn, 1.4) });
      if (lord) rig.add('head', G.cone, { p: [s * 0.12, 0.3, 0.12], r: [0.2, 0, -s * 0.2], s: [0.04, 0.22, 0.04], c: gold, k: 'metal' });
      rig.add('head', G.sph, { p: [s * 0.11, 0.04, 0.26], r: [0, s * 0.3, -s * 0.4], s: [0.07, 0.03, 0.03], c: look.eye, k: 'glow', i: 4 });
      rig.add('head', G.box, { p: [s * 0.11, 0.1, 0.26], r: [0, 0, s * 0.5], s: [0.13, 0.03, 0.04], c: '#1a0808' });
    }
    rig.add('head', G.sph, { p: [0, -0.13, 0.27], s: [0.1, 0.04, 0.03], c: '#2a0808', ol: false });
    fangs(rig, 'head', [0, -0.12, 0.28], 0.05);
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.cap(0.13, 0.32), { p: [s * 0.08, -0.25, 0.02], r: [0, 0, s * 0.2], c: sk, c2: shade(sk, 0.7) });
      rig.add(b, G.cyl, { p: [s * 0.14, -0.48, 0.03], s: [0.14, 0.18, 0.14], c: lord ? gold : ar, k: 'metal' });
      rig.add(b, G.sph, { p: [s * 0.16, -0.66, 0.05], s: [0.14, 0.13, 0.14], c: sk });
      for (let k = -1; k <= 1; k++) rig.add(b, G.cone, { p: [s * 0.16 + k * 0.06, -0.8, 0.1], r: [PI - 0.3, 0, 0], s: [0.025, 0.1, 0.025], c: '#f4ead0', ol: false });
    }
    for (const b of ['legL', 'legR']) {
      rig.add(b, G.cap(0.14, 0.25), { p: [0, -0.24, 0], c: sk, c2: shade(sk, 0.6) });
      rig.add(b, G.sph, { p: [0, -0.52, 0.08], s: [0.15, 0.1, 0.22], c: '#2a1a1a' });
    }
    SH.buildWings(rig, 'bat', { wingColor: lord ? '#3a0a14' : '#4a1414' }, lord ? 2.1 : 1.4);
    for (let i = 0; i < 6; i++) { const t = i / 5; rig.add('tail', G.sph, { p: [Math.sin(t * 2.5) * 0.18, -0.4 - t * 0.2 + Math.sin(t * PI) * 0.2, -t * 0.7], s: 0.08 - t * 0.04, c: sk }); }
    rig.add('tail', G.cone, { p: [0.12, -0.6, -0.78], r: [-1.6, 0, 0.3], s: [0.12, 0.2, 0.04], c: horn });
  }
  M.demon = (look) => {
    const rig = mk(look, 0.034);
    demonBody(rig, look, false);
    rig.build();
    rig.focus = { y: 1.85 * (look.scale || 1), r: 0.45 * (look.scale || 1) };
    rig.height = 2.3;
    rig.animate = demonAnim;
    return rig;
  };
  M.demonlord = (look) => {
    const rig = mk(look, 0.04);
    demonBody(rig, look, true);
    rig.bone('cape', 'body', 0, 1.05, -0.25);
    const capeG = new THREE.CylinderGeometry(0.45, 0.8, 1.6, 18, 4, true, PI - 1.2, 2.4);
    capeG.translate(0, -0.8, 0.2);
    rig.add('cape', capeG, { c: '#6a0a14', c2: '#2a0408', k: 'toon2' });
    rig.bone('sword', 'armR', -0.16, -0.68, 0.1).rotation.set(0.7, 0, 0.45);
    SH.buildWeapon(rig, 'sword', 'flamesword', { glow: look.flame || '#ff5a1a' }, -1);
    rig.bones.sword.scale.setScalar(1.45);
    rig.build();
    rig.focus = { y: 1.85 * (look.scale || 1), r: 0.45 * (look.scale || 1) };
    rig.height = 2.4;
    rig.animate = demonAnim;
    return rig;
  };
  function demonAnim(t) {
    const B = this.bones;
    B.body.position.y = 0.62 + Math.sin(t * 2.2) * 0.03;
    B.body.rotation.x = -this.hitT * 0.3 + (this.state === 'attack' ? 0.25 : 0);
    B.armR.rotation.x = -0.35 + Math.sin(t * 2.2) * 0.08 - (this.state === 'attack' ? 1.8 : 0);
    B.armL.rotation.x = Math.sin(t * 2.2 + 1) * 0.08;
    B.armL.rotation.z = 0.25; B.armR.rotation.z = -0.25;
    B.head.rotation.z = Math.sin(t * 1.2) * 0.06;
    const f = Math.sin(t * 3) * 0.3;
    B.wingL.rotation.y = -0.4 - f; B.wingR.rotation.y = 0.4 + f;
    B.wingL.rotation.z = 0.2; B.wingR.rotation.z = -0.2;
    if (B.cape) B.cape.rotation.x = 0.12 + Math.sin(t * 2) * 0.05;
    B.tail.rotation.y = Math.sin(t * 2) * 0.3;
  }

  // ---------------------------------------------------------------- crab
  M.crab = (look) => {
    const rig = mk(look);
    const sh = C(look.shell), cl = C(look.claw);
    rig.bone('body', 'root', 0, 0.42, 0);
    rig.bone('clawL', 'body', 0.45, 0.05, 0.25);
    rig.bone('clawR', 'body', -0.45, 0.05, 0.25);
    rig.add('body', G.sphHi, { s: [0.58, 0.3, 0.45], c: sh, c2: shade(sh, 0.6) });
    for (let i = 0; i < 5; i++) rig.add('body', G.cone, { p: [(i - 2) * 0.18, 0.12, 0.4 - Math.abs(i - 2) * 0.06], r: [0.8, 0, 0], s: [0.04, 0.1, 0.04], c: shade(sh, 1.2) });
    for (const s of [-1, 1]) {
      rig.add('body', G.cyl, { p: [s * 0.14, 0.32, 0.25], s: [0.025, 0.25, 0.025], c: sh });
      rig.add('body', G.sph, { p: [s * 0.14, 0.46, 0.25], s: 0.07, c: '#ffffff' });
      rig.add('body', G.sph, { p: [s * 0.14, 0.46, 0.31], s: 0.035, c: '#101010', ol: false });
      for (let k = 0; k < 3; k++) {
        rig.add('body', G.cap(0.04, 0.3), { p: [s * 0.62, -0.14, 0.1 - k * 0.2], r: [0, 0, s * 0.9], c: sh });
        rig.add('body', G.cone, { p: [s * 0.82, -0.36, 0.1 - k * 0.2], r: [0, 0, s * 0.25 + PI], s: [0.035, 0.18, 0.035], c: shade(sh, 0.7) });
      }
    }
    if (look.crown) for (let i = 0; i < 5; i++) rig.add('body', G.cone, { p: [(i - 2) * 0.09, 0.35, 0], s: [0.04, 0.2, 0.04], c: '#ffd23a', k: 'metal' });
    for (const [b, s] of [['clawL', 1], ['clawR', -1]]) {
      rig.add(b, G.cap(0.07, 0.25), { p: [s * 0.1, 0.05, 0.1], r: [PI / 2, 0, -s * 0.8], c: sh });
      rig.add(b, G.sph, { p: [s * 0.25, 0.12, 0.35], s: [0.22, 0.17, 0.25], c: cl, c2: shade(cl, 0.7) });
      rig.add(b, G.cone, { p: [s * 0.2, 0.22, 0.6], r: [PI / 2 - 0.3, 0, 0], s: [0.07, 0.3, 0.06], c: cl });
      rig.add(b, G.cone, { p: [s * 0.3, 0.04, 0.58], r: [PI / 2 + 0.3, 0, 0], s: [0.06, 0.25, 0.05], c: shade(cl, 0.8) });
    }
    rig.build();
    rig.focus = { y: 0.6 * (look.scale || 1), r: 0.65 * (look.scale || 1) };
    rig.height = 1.0;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.position.y = 0.42 + Math.abs(Math.sin(t * 4)) * 0.03;
      B.body.position.x = Math.sin(t * 2) * 0.05;
      B.body.rotation.x = -this.hitT * 0.3;
      B.clawL.rotation.x = -Math.abs(Math.sin(t * 3)) * 0.3 - (this.state === 'attack' ? 0.8 : 0);
      B.clawR.rotation.x = -Math.abs(Math.cos(t * 3)) * 0.3 - (this.state === 'attack' ? 0.8 : 0);
    };
    return rig;
  };

  // ---------------------------------------------------------------- jelly
  M.jelly = (look) => {
    const rig = mk(look);
    const c = C(look.color);
    rig.bone('body', 'root', 0, 1.0, 0);
    rig.add('body', G.shell(0.5, 0, PI * 2, 0, PI * 0.55, 26, 12), { s: [1, 0.85, 1], c: shade(c, 1.1), c2: shade(c, 0.7), k: 'toon2' });
    rig.add('body', G.sph, { p: [0, 0.12, 0], s: [0.32, 0.25, 0.32], c: look.glow, k: 'glow', i: 1.6 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      for (let k = 0; k < 4; k++) rig.add('body', G.sphLo, { p: [Math.cos(a) * (0.32 - k * 0.03) + Math.sin(k + i) * 0.04, -0.1 - k * 0.17, Math.sin(a) * (0.32 - k * 0.03)], s: 0.05 - k * 0.008, c: look.glow, k: 'glow', i: 1.4 });
    }
    glowEyes(rig, 'body', 0.48, [0, 0.0, 0], '#ffffff', { spread: 0.3, size: 0.18, down: -0.15, i: 2.4 });
    rig.build();
    rig.mats.toon2.transparent = true; rig.mats.toon2.opacity = 0.82;
    rig.focus = { y: 1.1, r: 0.55 };
    rig.height = 1.5;
    rig.animate = function (t) {
      const B = this.bones;
      const p = Math.sin(t * 3);
      B.body.position.y = 1.0 + p * 0.1;
      B.body.scale.set(1 + p * 0.06, 1 - p * 0.08, 1 + p * 0.06);
      B.body.rotation.x = -this.hitT * 0.5;
    };
    return rig;
  };

  // ---------------------------------------------------------------- treant (boss)
  M.treant = (look) => {
    const rig = mk(look, 0.04);
    const bark = C(look.bark), leaves = C(look.leaves);
    rig.bone('body', 'root', 0, 0, 0);
    rig.bone('armL', 'body', 0.55, 1.5, 0);
    rig.bone('armR', 'body', -0.55, 1.5, 0);
    rig.bone('crown', 'body', 0, 2.2, 0);
    const trunk = G.lathe('trunk', [[0.85, 0], [0.62, 0.2], [0.55, 0.6], [0.58, 1.2], [0.5, 1.8], [0.42, 2.2], [0.0, 2.3]], 18);
    rig.add('body', trunk, { c: bark, c2: shade(bark, 0.6) });
    const r = U.rng(3);
    for (let i = 0; i < 9; i++) {
      const a = r() * PI * 2;
      rig.add('body', G.box, { p: [Math.sin(a) * 0.56, 0.4 + r() * 1.5, Math.cos(a) * 0.56], r: [0, a, 0], s: [0.06, 0.4 + r() * 0.4, 0.06], c: shade(bark, 0.7), ol: false });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.3;
      rig.add('body', G.cone, { p: [Math.sin(a) * 0.85, 0.12, Math.cos(a) * 0.85], r: [Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2], s: [0.16, 0.6, 0.16], c: bark, c2: shade(bark, 0.7) });
    }
    for (const s of [-1, 1]) {
      rig.add('body', G.sph, { p: [s * 0.2, 1.45, 0.48], s: [0.13, 0.1, 0.1], c: '#100804', ol: false });
      rig.add('body', G.sph, { p: [s * 0.2, 1.45, 0.53], s: [0.07, 0.05, 0.04], c: look.eye, k: 'glow', i: 4 });
      rig.add('body', G.box, { p: [s * 0.22, 1.6, 0.5], r: [0, 0, s * 0.4], s: [0.28, 0.07, 0.12], c: shade(bark, 0.8) });
    }
    rig.add('body', G.sph, { p: [0, 1.08, 0.48], s: [0.25, 0.12, 0.1], c: '#140a04', ol: false });
    for (let k = -2; k <= 2; k++) rig.add('body', G.cone, { p: [k * 0.08, 1.13, 0.55], r: [PI, 0, 0], s: [0.03, 0.08, 0.03], c: '#e8dcb0', ol: false });
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.taper(0.09, 0.16, 10), { p: [s * 0.35, -0.1, 0.1], r: [0.3, 0, -s * 1.1], s: [1, 0.85, 1], c: bark });
      rig.add(b, G.taper(0.05, 0.09, 8), { p: [s * 0.78, -0.45, 0.25], r: [0.4, 0, -s * 0.3], s: [1, 0.6, 1], c: bark });
      for (let k = 0; k < 3; k++) rig.add(b, G.taper(0.02, 0.05, 6), { p: [s * (0.85 + k * 0.05), -0.8, 0.3 + (k - 1) * 0.08], r: [0.3 + (k - 1) * 0.3, 0, -s * 0.1], s: [1, 0.3, 1], c: shade(bark, 0.8) });
      rig.add(b, G.ico, { p: [s * 0.55, 0.15, 0], s: 0.28, c: leaves, c2: shade(leaves, 0.6) });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2;
      const rr = i === 0 ? 0 : 0.55;
      rig.add('crown', G.ico, { p: [Math.sin(a) * rr, i === 0 ? 0.7 : 0.2 + r() * 0.4, Math.cos(a) * rr * 0.8 - 0.1], s: 0.5 + r() * 0.15, c: shade(leaves, 0.9 + r() * 0.3), c2: shade(leaves, 0.55) });
    }
    for (let i = 0; i < 6; i++) rig.add('crown', G.sphLo, { p: [(r() - 0.5) * 1.4, 0.2 + r() * 0.7, 0.3 + r() * 0.3], s: 0.07, c: '#ffe04a', k: 'glow', i: 2.2 });
    rig.build();
    rig.focus = { y: 1.6 * (look.scale || 1), r: 0.8 * (look.scale || 1) };
    rig.height = 3.1;
    rig.animate = function (t) {
      const B = this.bones;
      B.body.rotation.z = Math.sin(t * 1.1) * 0.03;
      B.body.rotation.x = -this.hitT * 0.15 + (this.state === 'attack' ? 0.15 : 0);
      B.armL.rotation.z = Math.sin(t * 1.3) * 0.12 + (this.state === 'attack' ? 0.7 : 0);
      B.armR.rotation.z = -Math.sin(t * 1.3) * 0.12 - (this.state === 'attack' ? 0.7 : 0);
      B.crown.rotation.z = Math.sin(t * 0.9 + 1) * 0.05;
    };
    return rig;
  };

  // ---------------------------------------------------------------- tide titan (boss)
  const tornadoMat = () => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x3ad8ff) }, uNoise: { value: SH.tex.noise } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime;
      void main(){ vUv = uv; vec3 p = position; float w = sin(p.y * 3.0 - uTime * 3.0) * 0.06 * (1.0 - uv.y);
        p.x += w; p.z += cos(p.y * 2.5 - uTime * 2.0) * 0.05;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform sampler2D uNoise; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vec2 uv = vec2(vUv.x * 3.0 + vUv.y * 1.5 - uTime * 0.6, vUv.y * 1.5 - uTime * 0.9);
        float n = texture2D(uNoise, uv).g; float n2 = texture2D(uNoise, uv * 2.1 + 0.3).r;
        float streak = smoothstep(0.45, 0.75, n) * 0.9 + smoothstep(0.6, 0.9, n2) * 0.6;
        float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        vec3 c = uColor * (0.35 + fr * 1.3) + vec3(0.8, 1.0, 1.0) * streak * 1.2;
        float a = clamp(0.45 + fr * 0.5 + streak * 0.5, 0.0, 1.0) * smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y) * 0.6);
        gl_FragColor = vec4(c, a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  M.titan = (look) => {
    const rig = mk(look, 0.04);
    const sk = C(look.skin), hair = C(look.hair), armor = C(look.armor), gold = look.gold;
    rig.bone('body', 'root', 0, 1.15, 0);
    rig.bone('head', 'body', 0, 1.05, 0.08);
    rig.bone('armL', 'body', 0.6, 0.85, 0);
    rig.bone('armR', 'body', -0.6, 0.85, 0);
    rig.add('body', G.sphHi, { p: [0, 0.55, 0], s: [0.6, 0.55, 0.42], c: sk, c2: shade(sk, 0.7) });
    for (const s of [-1, 1]) rig.add('body', G.sph, { p: [s * 0.2, 0.68, 0.3], s: [0.22, 0.17, 0.12], c: shade(sk, 1.08) });
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) rig.add('body', G.sph, { p: [s * 0.11, 0.42 - i * 0.13, 0.33], s: [0.09, 0.055, 0.05], c: shade(sk, 1.05) });
    rig.add('body', G.torus(0.42, 0.07, PI * 2, 8, 28), { p: [0, 0.06, 0], r: [PI / 2, 0, 0], s: [1, 0.8, 1], c: gold, k: 'metal' });
    rig.add('body', G.lathe('titanbelt', [[0.42, 0.08], [0.48, -0.2], [0.0, -0.2]], 22), { c: armor, c2: shade(armor, 0.6), k: 'metal' });
    rig.add('body', G.oct, { p: [0, 0.06, 0.35], s: [0.12, 0.14, 0.05], c: look.water, k: 'glow', i: 3 });
    for (const s of [-1, 1]) {
      rig.add('body', G.shell(0.34, 0, PI * 2, 0, PI * 0.55, 18, 8), { p: [s * 0.58, 0.88, 0], r: [0, 0, -s * 0.45], c: gold, c2: shade(gold, 0.6), k: 'metal' });
      rig.add('body', G.cone, { p: [s * 0.75, 1.08, -0.05], r: [0, 0, -s * 0.7], s: [0.06, 0.3, 0.06], c: gold, k: 'metal' });
      rig.add('body', G.box, { p: [s * 0.2, 0.92, 0.3], r: [0.2, 0, s * 0.8], s: [0.06, 0.4, 0.04], c: armor, k: 'metal' });
    }
    // head + beard + hair
    rig.add('head', G.sphHi, { s: [0.3, 0.32, 0.3], c: sk, c2: shade(sk, 0.8) });
    for (const s of [-1, 1]) {
      rig.add('head', G.sph, { p: [s * 0.1, 0.03, 0.27], s: [0.06, 0.025, 0.03], c: '#bff8ff', k: 'glow', i: 3.5 });
      rig.add('head', G.box, { p: [s * 0.1, 0.09, 0.27], r: [0, 0, s * 0.35], s: [0.13, 0.035, 0.04], c: shade(hair, 0.7) });
    }
    rig.add('head', G.cone, { p: [0, -0.32, 0.18], r: [PI + 0.25, 0, 0], s: [0.24, 0.55, 0.15], c: hair, c2: shade(hair, 1.4) });
    rig.add('head', G.sph, { p: [0, -0.12, 0.2], s: [0.24, 0.12, 0.14], c: hair });
    rig.add('head', G.sph, { p: [0, 0.1, -0.06], s: [0.34, 0.33, 0.33], c: hair, c2: shade(hair, 0.7) });
    for (let i = 0; i < 6; i++) {
      const a = -1.2 + (i / 5) * 2.4;
      rig.add('head', G.cap(0.08, 0.6), { p: [Math.sin(a) * 0.3, -0.35, -0.2 + Math.cos(a) * 0.05], r: [0.3, 0, -a * 0.3], c: hair, c2: shade(hair, 1.4) });
    }
    rig.add('head', G.taper(0.28, 0.31, 18), { p: [0, 0.24, 0], s: [1, 0.12, 1], c: gold, k: 'metal' });
    for (let i = 0; i < 5; i++) {
      const a = -0.8 + (i / 4) * 1.6;
      rig.add('head', G.cone, { p: [Math.sin(a) * 0.3, 0.42 - Math.abs(a) * 0.1, Math.cos(a) * 0.28], r: [0.2, 0, -a * 0.4], s: [0.05, 0.32 - Math.abs(a) * 0.08, 0.05], c: gold, k: 'metal' });
    }
    for (const s of [-1, 1]) rig.add('head', G.cone, { p: [s * 0.36, 0.1, 0], r: [0, 0, -s * 1.6], s: [0.04, 0.3, 0.2], c: gold, k: 'metal' });
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.cap(0.14, 0.32), { p: [s * 0.08, -0.25, 0.02], r: [0, 0, s * 0.2], c: sk, c2: shade(sk, 0.75) });
      rig.add(b, G.taper(0.15, 0.13, 14), { p: [s * 0.15, -0.5, 0.04], s: [1, 0.22, 1], c: gold, k: 'metal' });
      rig.add(b, G.sph, { p: [s * 0.17, -0.7, 0.06], s: 0.13, c: sk });
    }
    rig.bone('trident', 'armR', -0.17, -0.72, 0.08).rotation.set(0.15, 0, 0.12);
    SH.buildWeapon(rig, 'trident', 'trident', { glow: look.water }, -1);
    rig.bones.trident.scale.setScalar(1.6);
    rig.build();
    // the water tornado
    const tm = tornadoMat();
    tm.uniforms.uColor.value.set(look.water);
    const tg = new THREE.LatheGeometry([[0.22, -1.2], [0.3, -0.9], [0.45, -0.4], [0.55, 0.0], [0.48, 0.25]].map((p) => new THREE.Vector2(p[0], p[1])), 32, 0, PI * 2);
    const tornado = new THREE.Mesh(tg, tm);
    tornado.renderOrder = 3;
    rig.bones.body.add(tornado);
    const tornado2 = new THREE.Mesh(tg, tm);
    tornado2.scale.set(1.25, 0.95, 1.25);
    tornado2.renderOrder = 3;
    rig.bones.body.add(tornado2);
    rig.extra.push(tm);
    rig.focus = { y: 2.2 * (look.scale || 1), r: 0.6 * (look.scale || 1) };
    rig.height = 2.8;
    rig.animate = function (t) {
      const B = this.bones;
      tm.uniforms.uTime.value = t;
      tornado.rotation.y = t * 2.5; tornado2.rotation.y = -t * 1.7;
      B.body.position.y = 1.15 + Math.sin(t * 1.6) * 0.08;
      B.body.rotation.x = -this.hitT * 0.25;
      B.armR.rotation.x = -0.25 + Math.sin(t * 1.6) * 0.06 - (this.state === 'attack' ? 1.6 : 0);
      B.armL.rotation.x = -0.4 + Math.sin(t * 1.6 + 1) * 0.08;
      B.armL.rotation.z = 0.45;
      B.head.rotation.z = Math.sin(t * 1.1) * 0.05;
    };
    return rig;
  };

  // ---------------------------------------------------------------- entry
  SH.buildMonster = function (id) {
    const E = SH.data.ENEMIES[id];
    if (!E) return M.slime({ color: '#ff00ff' });
    const fn = M[E.model] || M.slime;
    const rig = fn(Object.assign({}, E.look));
    rig.enemyId = id;
    return rig;
  };
  // an enemy hero (arena)
  SH.buildFoeHero = (heroId) => SH.buildHero(SH.data.HERO[heroId].look);
})();
