/* ==========================================================================
   SLING HEROES — 3D characters
   Every hero and monster is built from simple shapes at runtime, in a chibi
   anime style: cel shading with a rim light, ink outlines, a painted face.
   * Rig: a character is a few "bones" (body, head, arms, legs, wings, cape …).
     All the parts on one bone are merged into one mesh per material, so a
     whole hero costs only about a dozen draw calls.
   * buildHero(look) reads the look of a hero from js/data.js: hair style,
     outfit, hat, weapon, wings, cape …
   * paintFace() draws the anime eyes and the mouth onto a canvas that sits on
     the front of the head.
   * Monsters are in js/monsters.js, portraits and icons in js/icons.js.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  if (!SH || !SH.renderer) return;
  const U = SH.util;
  const PI = Math.PI;
  const V3 = THREE.Vector3;

  // ================================================================ geometry
  const gc = {};
  const geo = (key, make) => gc[key] || (gc[key] = make());
  const G = {
    sph: geo('sph', () => new THREE.SphereGeometry(1, 22, 16)),
    sphHi: geo('sphHi', () => new THREE.SphereGeometry(1, 32, 22)),
    sphLo: geo('sphLo', () => new THREE.SphereGeometry(1, 12, 8)),
    ico: geo('ico', () => new THREE.IcosahedronGeometry(1, 1)),
    dodec: geo('dodec', () => new THREE.DodecahedronGeometry(1, 0)),
    cyl: geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 18, 1)),
    cylLo: geo('cylLo', () => new THREE.CylinderGeometry(1, 1, 1, 10, 1)),
    cone: geo('cone', () => new THREE.ConeGeometry(1, 1, 18, 1)),
    coneLo: geo('coneLo', () => new THREE.ConeGeometry(1, 1, 8, 1)),
    box: geo('box', () => new THREE.RoundedBoxGeometry(1, 1, 1, 2, 0.12)),
    boxHard: geo('boxHard', () => new THREE.BoxGeometry(1, 1, 1)),
    oct: geo('oct', () => new THREE.OctahedronGeometry(1, 0)),
  };
  G.cap = (r, l) => geo(`cap${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
  G.taper = (rt, rb, seg) => geo(`tp${rt}_${rb}_${seg || 16}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg || 16, 1));
  G.torus = (r, t, arc, rs, ts) => geo(`to${r}_${t}_${arc || 6.283}_${rs || 12}_${ts || 32}`, () => new THREE.TorusGeometry(r, t, rs || 12, ts || 32, arc || PI * 2));
  G.shell = (r, ps, pl, ts, tl, ws, hs) => geo(`sh${r}_${ps}_${pl}_${ts}_${tl}`, () => new THREE.SphereGeometry(r, ws || 30, hs || 16, ps, pl, ts, tl));
  // lathe profiles must run bottom to top, or the outside faces the wrong way
  G.lathe = (key, pts, seg) => geo('la' + key, () => {
    const v = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    if (v[0].y > v[v.length - 1].y) v.reverse();
    return new THREE.LatheGeometry(v, seg || 22);
  });
  G.shape = (key, draw, depth, bevel) => geo('sp' + key, () => {
    const s = new THREE.Shape();
    draw(s);
    if (!depth) return new THREE.ShapeGeometry(s, 10);
    const bv = bevel === undefined ? 0.4 : bevel;
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bv > 0, bevelThickness: depth * bv, bevelSize: Math.min(depth * bv, 0.04), bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  });
  SH.G = G;

  // ================================================================ colours
  const C = (c) => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c));
  const shade = (c, k) => C(c).multiplyScalar(k);
  const mix = (a, b, t) => C(a).lerp(C(b), t);

  // ================================================================ rig
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new V3(), tmpP = new V3();
  const tmpN = new THREE.Matrix3(), vA = new V3(), nA = new V3();

  class Rig {
    constructor(opts) {
      opts = opts || {};
      this.root = new THREE.Group();
      this.bones = { root: this.root };
      this.parts = {};
      this.scale = opts.scale || 1;
      this.outlineColor = opts.outline || 0x1a0f14;
      this.thick = (opts.thick || 0.03);
      this.mats = null;
      this.state = 'idle';
      this.t = Math.random() * 10;
      this.flashT = 0;
      this.hitT = 0;
      this.extra = [];
      this.focus = { y: 1.5, r: 0.6 };   // portrait framing (head)
      this.height = 2.1;
      this.alpha = 1;
    }
    bone(name, parent, x, y, z) {
      const g = new THREE.Group();
      g.position.set(x || 0, y || 0, z || 0);
      g.name = name;
      this.bones[parent || 'root'].add(g);
      this.bones[name] = g;
      return g;
    }
    // add a shape to a bone. o: p position, r rotation, s scale, q quaternion, c colour, c2 gradient colour (bottom),
    // k kind: toon | toon2 (double sided) | metal | glow | trans, ol: false = no outline
    add(bone, g, o) {
      o = o || {};
      const kind = o.k || 'toon';
      const key = bone + '|' + kind + (o.ol === false ? '|n' : '');
      (this.parts[key] || (this.parts[key] = [])).push({ g, o });
      return this;
    }
    // finish: merge parts per bone + material, create meshes and outlines
    build() {
      const outline = SH.outlineMat(this.outlineColor, this.thick);
      const rim = this.rim || 0x8a9ac8;
      const mats = this.mats = {
        toon: SH.toonMat({ vertexColors: true, rim }),
        toon2: SH.toonMat({ vertexColors: true, rim, side: THREE.DoubleSide }),
        metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.3, envMap: SH.envMap, envMapIntensity: 1.25 }),
        glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
        trans: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        outline,
      };
      this.meshes = [];
      for (const key in this.parts) {
        const [bone, kind, noOl] = key.split('|');
        const geom = mergeParts(this.parts[key], kind === 'glow' || kind === 'trans' ? 1 : 1);
        const mesh = new THREE.Mesh(geom, mats[kind]);
        mesh.castShadow = SH.Q.shadows && kind !== 'trans' && kind !== 'glow';
        this.bones[bone].add(mesh);
        this.meshes.push(mesh);
        if (kind !== 'glow' && kind !== 'trans' && !noOl) {
          const ol = new THREE.Mesh(geom, outline);
          this.bones[bone].add(ol);
          this.meshes.push(ol);
        }
      }
      this.parts = null;
      this.root.scale.setScalar(this.scale);
      return this;
    }
    // white hit flash
    flash(k) { this.flashT = Math.max(this.flashT, k === undefined ? 1 : k); }
    hit(dir) { this.flash(1); this.hitT = 1; this.hitDir = dir || 0; }
    setAlpha(a) {
      if (this.alpha === a) return;
      this.alpha = a;
      for (const k of ['toon', 'toon2', 'metal', 'glow']) {
        const m = this.mats[k];
        m.transparent = a < 1;
        m.opacity = a;
        m.depthWrite = a >= 1;
      }
      this.mats.trans.opacity = 0.6 * a;
      this.mats.outline.transparent = a < 1;
      this.mats.outline.opacity = a;
      this.mats.outline.uniforms.uColor.value.setScalar(0).lerp(new THREE.Color(this.outlineColor), 1);
      if (this.face) { this.face.material.opacity = a; }
    }
    update(dt) {
      this.t += dt;
      if (this.flashT > 0) {
        this.flashT = Math.max(0, this.flashT - dt * 5);
        const k = this.flashT * this.flashT * 0.9;
        this.mats.toon.emissive.setRGB(k, k * 0.95, k * 0.9);
        this.mats.toon2.emissive.copy(this.mats.toon.emissive);
        this.mats.metal.emissive.copy(this.mats.toon.emissive);
        if (this.face) this.face.material.emissive.copy(this.mats.toon.emissive);
      }
      if (this.hitT > 0) this.hitT = Math.max(0, this.hitT - dt * 3.5);
      if (this.animate) this.animate(this.t, dt);
    }
    dispose() {
      this.root.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
      for (const k in this.mats) this.mats[k].dispose();
      if (this.face) { this.face.material.dispose(); }
      if (this.root.parent) this.root.parent.remove(this.root);
    }
  }
  SH.Rig = Rig;

  // merge the parts of one bone into a single geometry with vertex colours
  function mergeParts(list) {
    let nv = 0, ni = 0;
    for (const p of list) {
      const g = p.g;
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    const cA = new THREE.Color(), cB = new THREE.Color(), cT = new THREE.Color();
    for (const p of list) {
      const g = p.g, o = p.o;
      if (o.m) tmpM.copy(o.m);
      else {
        tmpP.fromArray(o.p || [0, 0, 0]);
        if (o.q) tmpQ.copy(o.q);
        else tmpQ.setFromEuler(tmpE.set((o.r && o.r[0]) || 0, (o.r && o.r[1]) || 0, (o.r && o.r[2]) || 0, (o.r && o.r[3]) || 'XYZ'));
        const s = o.s === undefined ? 1 : o.s;
        if (typeof s === 'number') tmpS.set(s, s, s); else tmpS.fromArray(s);
        tmpM.compose(tmpP, tmpQ, tmpS);
      }
      tmpN.getNormalMatrix(tmpM);
      const P = g.attributes.position, N = g.attributes.normal;
      cA.set(o.c === undefined ? 0xffffff : o.c);
      if (o.i) cA.multiplyScalar(o.i);
      const grad = o.c2 !== undefined;
      let y0 = 0, y1 = 1;
      if (grad) {
        cB.set(o.c2);
        if (o.i) cB.multiplyScalar(o.i);
        if (!g.boundingBox) g.computeBoundingBox();
        y0 = g.boundingBox.min.y; y1 = g.boundingBox.max.y;
      }
      for (let i = 0; i < P.count; i++) {
        vA.fromBufferAttribute(P, i);
        let t = 0;
        if (grad) t = U.clamp((vA.y - y0) / (y1 - y0 || 1), 0, 1);
        vA.applyMatrix4(tmpM);
        nA.fromBufferAttribute(N, i).applyMatrix3(tmpN).normalize();
        const k = (vo + i) * 3;
        pos[k] = vA.x; pos[k + 1] = vA.y; pos[k + 2] = vA.z;
        nor[k] = nA.x; nor[k + 1] = nA.y; nor[k + 2] = nA.z;
        if (grad) { cT.copy(cB).lerp(cA, t); col[k] = cT.r; col[k + 1] = cT.g; col[k + 2] = cT.b; } else { col[k] = cA.r; col[k + 1] = cA.g; col[k + 2] = cA.b; }
      }
      if (g.index) {
        const I = g.index.array;
        for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
        io += I.length;
      } else {
        for (let i = 0; i < P.count; i++) idx[io + i] = vo + i;
        io += P.count;
      }
      vo += P.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  SH.mergeParts = mergeParts;

  // a point on a sphere of radius r: theta from the top, phi from the front (+ = towards +x)
  // returns position + a frame: y runs down the surface, z is the surface normal
  function onSphere(r, theta, phi, lift) {
    const n = new V3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
    const down = new V3(Math.cos(theta) * Math.sin(phi), -Math.sin(theta), Math.cos(theta) * Math.cos(phi));
    const x = new V3().crossVectors(down, n).normalize();
    const m = new THREE.Matrix4().makeBasis(x, down, n);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    return { p: n.clone().multiplyScalar(r * (lift || 1)), n, down, q };
  }
  SH.onSphere = onSphere;
  // quaternion that turns +y into dir
  const qDir = (dir) => new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
  SH.qDir = qDir;
  const mtx = (p, q, s) => new THREE.Matrix4().compose(new V3().fromArray(p), q, typeof s === 'number' ? new V3(s, s, s) : new V3().fromArray(s));

  // ================================================================ face
  const faceCache = {};
  const FACE = { W: 1.9, TOP: 0.62, H: 1.5 };   // the decal covers ±0.95 rad sideways, 0.62 above to 0.88 below the equator
  function paintFace(f) {
    const key = JSON.stringify(f);
    if (faceCache[key]) return faceCache[key];
    const S = 256, { c, g } = SH.canvas(S, S);
    g.setTransform(S / FACE.W, 0, 0, S / FACE.H, S / 2, S * FACE.TOP / FACE.H);
    const eyeC = C(f.eye || '#3a6aff'), style = f.style || 'normal';
    const css = (col, a) => { const cc = col.clone(); return `rgba(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)},${a === undefined ? 1 : a})`; };
    const srgb = (col) => { const t = col.clone().convertLinearToSRGB(); return t; };
    const ec = srgb(eyeC), dark = srgb(eyeC.clone().multiplyScalar(0.18)), mid = srgb(eyeC.clone().multiplyScalar(0.55));
    const light = srgb(eyeC.clone().lerp(new THREE.Color(1, 1, 1), 0.55));
    const ink = 'rgb(38,22,30)';
    const brow = f.brow ? css(srgb(C(f.brow).multiplyScalar(0.6))) : ink;
    const ell = (x, y, rx, ry, rot) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, PI * 2); };
    const EY = f.eyeY !== undefined ? f.eyeY : 0.12, EX = f.eyeX || 0.36;
    // blush
    if (f.blush !== false) {
      for (const s of [-1, 1]) {
        const grd = g.createRadialGradient(s * 0.44, EY + 0.2, 0, s * 0.44, EY + 0.2, 0.1);
        grd.addColorStop(0, 'rgba(255,110,130,0.45)'); grd.addColorStop(1, 'rgba(255,110,130,0)');
        g.fillStyle = grd; ell(s * 0.44, EY + 0.2, 0.12, 0.06); g.fill();
      }
    }
    for (const s of [-1, 1]) {
      const cx = s * EX, cy = EY;
      g.save();
      if (style === 'closed') {
        g.strokeStyle = ink; g.lineWidth = 0.035; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - 0.12, cy + 0.03); g.quadraticCurveTo(cx, cy - 0.1, cx + 0.12, cy + 0.03); g.stroke();
        g.lineWidth = 0.02;
        g.beginPath(); g.moveTo(cx + s * 0.1, cy - 0.01); g.lineTo(cx + s * 0.16, cy - 0.05); g.stroke();
      } else if (style === 'glow') {
        g.fillStyle = 'rgba(10,8,14,0.95)';
        ell(cx, cy, 0.13, 0.06, s * 0.25); g.fill();
      } else {
        let rx = 0.135, ry = 0.17, rot = 0, lid = 0;
        if (style === 'cute') { rx = 0.155; ry = 0.2; }
        if (style === 'sharp' || style === 'fierce') { ry = 0.125; rot = s * 0.22; }
        if (style === 'cool') { lid = 0.07; }
        if (style === 'monster') { rx = 0.13; ry = 0.13; rot = s * 0.3; }
        g.translate(cx, cy); g.rotate(rot);
        // eye shape
        g.save();
        ell(0, 0, rx, ry); g.clip();
        g.fillStyle = style === 'monster' ? '#ffe04a' : '#ffffff';
        g.fillRect(-0.3, -0.3, 0.6, 0.6);
        if (style !== 'monster') {
          const grd = g.createLinearGradient(0, -ry, 0, ry);
          grd.addColorStop(0, css(dark)); grd.addColorStop(0.35, css(mid)); grd.addColorStop(0.7, css(ec)); grd.addColorStop(1, css(light));
          g.fillStyle = grd;
          ell(0, ry * 0.08, rx * 0.86, ry * 0.92); g.fill();
          g.fillStyle = css(dark);
          ell(0, ry * 0.12, rx * 0.4, ry * 0.5); g.fill();
          // ring
          g.strokeStyle = css(srgb(eyeC.clone().multiplyScalar(0.3)), 0.8); g.lineWidth = 0.012;
          ell(0, ry * 0.08, rx * 0.86, ry * 0.92); g.stroke();
          // shine
          g.fillStyle = '#ffffff';
          ell(-rx * 0.35, -ry * 0.38, rx * 0.34, ry * 0.26, -0.4); g.fill();
          ell(rx * 0.38, ry * 0.42, rx * 0.15, ry * 0.12); g.fill();
          if (style === 'cute') { ell(-rx * 0.05, ry * 0.5, rx * 0.1, ry * 0.08); g.fill(); }
        } else {
          g.fillStyle = '#1a0806';
          ell(0, 0, rx * 0.18, ry * 0.85); g.fill();
        }
        if (lid) { g.fillStyle = f.skin || '#ffe0cc'; g.fillRect(-0.3, -0.4, 0.6, 0.4 - ry + lid * 2.2); }
        g.restore();
        // lashes
        g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
        g.lineWidth = style === 'cute' ? 0.05 : 0.045;
        const top = -ry + (lid ? lid * 2.2 : 0);
        g.beginPath();
        g.moveTo(-rx * 1.08, top * 0.35);
        g.quadraticCurveTo(-rx * 0.4, top * 1.12, rx * 0.2, top * 1.02);
        g.quadraticCurveTo(rx * 0.85, top * 0.9, rx * 1.12, top * 0.2);
        g.stroke();
        if (f.lashes) {
          g.lineWidth = 0.03;
          g.beginPath(); g.moveTo(s > 0 ? rx * 1.0 : -rx * 1.0, top * 0.35); g.lineTo(s > 0 ? rx * 1.32 : -rx * 1.32, top * 0.75); g.stroke();
        }
        g.lineWidth = 0.016;
        g.beginPath(); g.moveTo(-rx * 0.5, ry * 0.98); g.quadraticCurveTo(0, ry * 1.08, rx * 0.5, ry * 0.98); g.stroke();
      }
      g.restore();
      // brows
      if (f.brows !== false) {
        g.strokeStyle = brow; g.lineCap = 'round';
        g.lineWidth = style === 'fierce' || style === 'monster' ? 0.05 : 0.028;
        const inner = cx - s * 0.11, outer = cx + s * 0.12;
        let yi = cy - 0.27, yo = cy - 0.29;
        if (style === 'fierce' || style === 'monster') { yi = cy - 0.17; yo = cy - 0.3; }
        if (style === 'sharp') { yi = cy - 0.2; yo = cy - 0.26; }
        if (style === 'cute' || style === 'closed') { yi = cy - 0.3; yo = cy - 0.3; }
        g.beginPath(); g.moveTo(inner, yi); g.quadraticCurveTo((inner + outer) / 2, Math.min(yi, yo) - 0.035, outer, yo); g.stroke();
      }
    }
    // mouth
    const m = f.mouth || 'smile', MY = EY + 0.3;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgb(120,40,46)'; g.lineWidth = 0.022;
    if (m === 'smile') { g.beginPath(); g.moveTo(-0.065, MY); g.quadraticCurveTo(0, MY + 0.06, 0.065, MY); g.stroke(); }
    else if (m === 'neutral') { g.beginPath(); g.moveTo(-0.045, MY + 0.02); g.lineTo(0.045, MY + 0.02); g.stroke(); }
    else if (m === 'smirk') { g.beginPath(); g.moveTo(-0.06, MY + 0.02); g.quadraticCurveTo(0.02, MY + 0.04, 0.075, MY - 0.015); g.stroke(); }
    else if (m === 'open' || m === 'grin' || m === 'fang' || m === 'roar') {
      const w = m === 'grin' ? 0.09 : m === 'roar' ? 0.12 : 0.06, h = m === 'grin' ? 0.09 : m === 'roar' ? 0.14 : 0.07;
      g.fillStyle = 'rgb(110,24,36)';
      g.beginPath(); g.moveTo(-w, MY - 0.01); g.quadraticCurveTo(0, MY - 0.02, w, MY - 0.01); g.quadraticCurveTo(w * 0.8, MY + h, 0, MY + h); g.quadraticCurveTo(-w * 0.8, MY + h, -w, MY - 0.01); g.fill();
      g.fillStyle = 'rgb(240,110,120)';
      ell(0, MY + h * 0.75, w * 0.55, h * 0.25); g.fill();
      if (m === 'grin' || m === 'roar') { g.fillStyle = '#fff'; g.fillRect(-w * 0.85, MY - 0.012, w * 1.7, h * 0.28); }
      if (m === 'fang' || m === 'roar') {
        g.fillStyle = '#fff';
        for (const s of m === 'roar' ? [-1, 1] : [1]) { g.beginPath(); g.moveTo(s * w * 0.35, MY - 0.01); g.lineTo(s * w * 0.6, MY - 0.01); g.lineTo(s * w * 0.47, MY + 0.05); g.fill(); }
      }
      g.strokeStyle = 'rgb(70,20,28)'; g.lineWidth = 0.014;
      g.beginPath(); g.moveTo(-w, MY - 0.01); g.quadraticCurveTo(0, MY - 0.02, w, MY - 0.01); g.quadraticCurveTo(w * 0.8, MY + h, 0, MY + h); g.quadraticCurveTo(-w * 0.8, MY + h, -w, MY - 0.01); g.stroke();
    }
    // tiny nose
    if (f.nose !== false) { g.fillStyle = 'rgba(160,80,70,0.5)'; ell(0.01, EY + 0.16, 0.012, 0.009); g.fill(); }
    // scars / marks
    if (f.mark === 'stripes') {
      g.fillStyle = 'rgba(40,20,20,0.85)';
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { g.save(); g.translate(s * 0.55, EY + 0.12 + i * 0.07); g.rotate(s * 0.2); g.fillRect(-0.08, -0.01, 0.16, 0.02); g.restore(); }
    }
    const tex = SH.canvasTex(c, true);
    faceCache[key] = tex;
    return tex;
  }
  SH.paintFace = paintFace;

  // the face decal: a piece of a sphere just above the head surface
  function faceMesh(rig, bone, r, faceOpts, center) {
    const tex = paintFace(faceOpts);
    const g = G.shell(r * 1.012, PI / 2 - FACE.W / 2, FACE.W, PI / 2 - FACE.TOP, FACE.H, 26, 20);
    const mat = SH.toonMat({ map: tex, transparent: true, rim: 0x000000 });
    mat.depthWrite = false;
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    const m = new THREE.Mesh(g, mat);
    if (center) m.position.copy(center);
    m.renderOrder = 2;
    rig.bones[bone].add(m);
    rig.face = m;
    return m;
  }
  SH.faceMesh = faceMesh;

  // ================================================================ hero parts
  const SKIN_SHADE = 0.86;

  function hair(rig, R, look) {
    const h = look.hair || {};
    let st = h.style || 'short';
    // under a helmet spikes and curls would poke through
    if ((look.head || []).some((x) => /helm/.test(x)) && st !== 'none' && st !== 'long') st = 'short';
    if (st === 'none') return;
    const hc = C(h.color || '#3a2a1a');
    const top = shade(hc, 1.18), low = shade(hc, 0.72);
    const B = 'head';
    // the hair volume: a closed egg sitting a bit higher and further back than the head,
    // so it covers the top, the back and the sides but leaves the face free
    const slim = st === 'short' || st === 'spiky' || st === 'messy';
    rig.add(B, G.sphHi, { p: [0, R * 0.1, -R * (slim ? 0.13 : 0.1)], s: [R * (slim ? 1.06 : 1.1), R * 1.04, R * (slim ? 1.06 : 1.08)], c: top, c2: low });
    // bangs: leaf shaped tufts over the forehead
    const tuft = G.lathe('tuft', [[0, 0.5], [0.42, 0.38], [0.5, 0.1], [0.34, -0.22], [0.12, -0.42], [0, -0.5]], 12);
    const fr = st === 'spiky' ? 6 : 5;
    for (let i = 0; i < fr; i++) {
      const t = i / (fr - 1) - 0.5;
      const phi = t * 1.45;
      const L = R * (0.66 - Math.abs(t) * 0.1) * (h.fringe === 'long' ? 1.2 : 1);
      const o = onSphere(R * 1.0, 1.02 + Math.abs(t) * 0.12, phi);
      const tilt = new THREE.Quaternion().setFromAxisAngle(o.n, t * 0.55);
      const q = tilt.multiply(o.q);
      const p = o.p.clone().add(o.down.clone().multiplyScalar(L * 0.2)).add(o.n.clone().multiplyScalar(R * 0.06));
      rig.add(B, tuft, { m: mtx(p.toArray(), q, [R * 0.5, L, R * 0.22]), c: hc, c2: top });
    }
    // side locks along the cheeks
    for (const s of [-1, 1]) {
      const o = onSphere(R * 1.02, 1.32, s * 1.0);
      const L = R * (st === 'long' ? 1.3 : st === 'bob' ? 1.05 : 0.85);
      const p = o.p.clone().add(o.down.clone().multiplyScalar(L * 0.32)).add(o.n.clone().multiplyScalar(R * 0.05));
      rig.add(B, tuft, { m: mtx(p.toArray(), o.q, [R * 0.42, L, R * 0.2]), c: hc, c2: low });
    }
    if (st === 'spiky') {
      const spikes = [[0.25, 0], [0.55, 0.9], [0.55, -0.9], [0.75, 2.2], [0.75, -2.2], [0.6, PI], [1.0, 1.7], [1.0, -1.7], [0.95, 2.7], [0.95, -2.7], [0.45, 0.4], [0.45, -0.4]];
      for (const [th, ph] of spikes) {
        const o = onSphere(R * 0.95, th, ph);
        const dir = o.n.clone().add(new V3(0, 0.5, 0)).add(o.down.clone().multiplyScalar(-0.15)).normalize();
        const L = R * (0.75 + Math.random() * 0.25);
        rig.add(B, G.cone, { m: mtx(o.p.clone().add(dir.clone().multiplyScalar(L * 0.4)).toArray(), qDir(dir), [R * 0.3, L, R * 0.3]), c: top, c2: hc });
      }
    } else if (st === 'messy') {
      const r = U.rng(U.hashStr(look.hair.color));
      for (let i = 0; i < 14; i++) {
        const th = 0.3 + r() * 1.4, ph = (r() - 0.5) * PI * 2;
        if (Math.abs(ph) < 0.8 && th > 0.8) continue;
        const o = onSphere(R * 0.98, th, ph);
        const dir = o.n.clone().add(new V3((r() - 0.5) * 0.6, 0.2, (r() - 0.5) * 0.6)).normalize();
        const L = R * (0.4 + r() * 0.3);
        rig.add(B, G.cone, { m: mtx(o.p.clone().add(dir.clone().multiplyScalar(L * 0.35)).toArray(), qDir(dir), [R * 0.28, L, R * 0.28]), c: hc, c2: top });
      }
    } else if (st === 'long') {
      rig.add(B, G.cap(R * 0.5, R * 1.6), { p: [0, -R * 1.05, -R * 0.55], s: [1.55, 1, 0.55], c: hc, c2: low });
      for (const s of [-1, 1]) rig.add(B, G.cap(R * 0.16, R * 1.1), { p: [s * R * 0.82, -R * 0.85, R * 0.1], r: [0.1, 0, s * 0.08], c: hc, c2: low });
    } else if (st === 'twintails') {
      const tail = G.lathe('tail', [[0, 0], [0.16, -0.06], [0.22, -0.3], [0.2, -0.6], [0.12, -0.9], [0, -1.02]], 16);
      for (const s of [-1, 1]) {
        rig.add(B, tail, { p: [s * R * 1.0, R * 0.2, -R * 0.4], r: [0.3, 0, s * 0.28], s: R * 1.3, c: hc, c2: low });
        rig.add(B, G.sph, { p: [s * R * 0.95, R * 0.24, -R * 0.36], s: R * 0.17, c: look.body ? look.body.accent : '#ff5a8a' });
      }
    } else if (st === 'ponytail') {
      const tail = G.lathe('ptail', [[0, 0], [0.14, -0.08], [0.2, -0.35], [0.17, -0.7], [0.08, -1.0], [0, -1.08]], 16);
      rig.add(B, tail, { p: [0, R * 0.45, -R * 0.95], r: [-0.55, 0, 0], s: R * 1.3, c: hc, c2: low });
      rig.add(B, G.sph, { p: [0, R * 0.45, -R * 0.98], s: R * 0.15, c: look.body ? look.body.accent : '#ff5a8a' });
    } else if (st === 'bob') {
      for (const s of [-1, 1]) rig.add(B, G.sph, { p: [s * R * 0.78, -R * 0.25, -R * 0.1], s: [R * 0.42, R * 0.6, R * 0.6], c: hc, c2: low });
    } else if (st === 'short') {
      // a little cowlick
      rig.add(B, G.cone, { p: [R * 0.15, R * 1.12, -R * 0.1], r: [-0.4, 0, -0.5], s: [R * 0.16, R * 0.4, R * 0.1], c: top });
    }
    if (look.beard) {
      rig.add(B, G.sph, { p: [0, -R * 0.72, R * 0.42], s: [R * 0.55, R * 0.42, R * 0.38], c: look.beard, c2: shade(look.beard, 0.7) });
      rig.add(B, G.cone, { p: [0, -R * 1.02, R * 0.5], r: [PI + 0.25, 0, 0], s: [R * 0.3, R * 0.35, R * 0.2], c: shade(look.beard, 0.8) });
    }
  }

  function headgear(rig, R, look) {
    const list = look.head || [];
    const B = 'head';
    const metal = look.metal || '#d8b040';
    const gold = '#f2c040';
    const glowC = look.glow || '#ffffff';
    for (const h of list) {
      if (h === 'crown') {
        rig.add(B, G.taper(R * 0.42, R * 0.46, 20), { p: [0, R * 1.02, -R * 0.05], s: [1, R * 0.28, 1], c: gold, k: 'metal' });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * PI * 2;
          rig.add(B, G.cone, { p: [Math.sin(a) * R * 0.42, R * 1.28, -R * 0.05 + Math.cos(a) * R * 0.42], s: [R * 0.08, R * 0.26, R * 0.08], c: gold, k: 'metal' });
          rig.add(B, G.sphLo, { p: [Math.sin(a) * R * 0.45, R * 1.06, -R * 0.05 + Math.cos(a) * R * 0.45], s: R * 0.06, c: glowC, k: 'glow', i: 2.2 });
        }
      } else if (h === 'tiara') {
        rig.add(B, G.torus(R * 1.02, R * 0.03, PI * 0.9, 8, 24), { p: [0, R * 0.42, 0], r: [-PI / 2 - 0.35, 0, PI * 0.05 + PI * 0.5 - PI * 0.45], c: gold, k: 'metal' });
        rig.add(B, G.oct, { p: [0, R * 0.62, R * 0.92], s: [R * 0.1, R * 0.15, R * 0.06], c: glowC, k: 'glow', i: 2.5 });
      } else if (h === 'tophat') {
        const hc = look.hatColor || '#151518';
        rig.add(B, G.cyl, { p: [0, R * 1.05, -R * 0.05], r: [-0.12, 0, 0.1], s: [R * 0.95, R * 0.06, R * 0.95], c: hc });
        rig.add(B, G.taper(R * 0.5, R * 0.46, 20), { p: [0.04, R * 1.5, -R * 0.12], r: [-0.12, 0, 0.1], s: [1, R * 0.9, 1], c: hc, c2: shade(hc, 0.6) });
        rig.add(B, G.taper(R * 0.475, R * 0.47, 20), { p: [0.02, R * 1.17, -R * 0.07], r: [-0.12, 0, 0.1], s: [1, R * 0.16, 1], c: look.cape || '#7a1020' });
      } else if (h === 'witch' || h === 'starhat') {
        const hc = look.hatColor || '#2a1a3a';
        rig.add(B, G.cyl, { p: [0, R * 0.95, 0], r: [-0.15, 0, 0.12], s: [R * 1.35, R * 0.05, R * 1.35], c: hc });
        rig.add(B, G.cone, { p: [0, R * 1.42, -R * 0.12], r: [-0.3, 0, 0.18], s: [R * 0.62, R * 1.0, R * 0.62], c: hc, c2: shade(hc, 0.7) });
        rig.add(B, G.cone, { p: [R * 0.25, R * 2.0, -R * 0.55], r: [-1.2, 0, 0.5], s: [R * 0.24, R * 0.55, R * 0.24], c: shade(hc, 1.1) });
        rig.add(B, G.taper(R * 0.64, R * 0.68, 20), { p: [0, R * 1.04, -R * 0.03], r: [-0.17, 0, 0.13], s: [1, R * 0.12, 1], c: look.body ? look.body.accent : gold });
        if (h === 'starhat') rig.add(B, G.oct, { p: [R * 0.5, R * 2.15, -R * 0.85], s: R * 0.16, c: glowC, k: 'glow', i: 3 });
      } else if (h === 'hood' || h === 'pandahood') {
        const hc = h === 'pandahood' ? '#f4f4f4' : (look.hatColor || '#2a3a6a');
        rig.add(B, G.shell(R * 1.16, PI / 2 + 1.05, PI * 2 - 2.1, 0, 2.05, 28, 16), { c: hc, c2: shade(hc, 0.75), k: 'toon2' });
        rig.add(B, G.torus(R * 0.98, R * 0.09, PI * 1.3, 8, 24), { p: [0, R * 0.05, R * 0.28], r: [0.15, 0, -PI * 0.15 - PI / 2 + PI * 0.5 - PI * 0.5], s: [1, 1.15, 1], c: shade(hc, 0.85) });
        if (h === 'hood') rig.add(B, G.cone, { p: [0, R * 0.7, -R * 1.05], r: [-2.2, 0, 0], s: [R * 0.4, R * 0.7, R * 0.3], c: hc });
        if (h === 'pandahood') for (const s of [-1, 1]) rig.add(B, G.sph, { p: [s * R * 0.72, R * 1.0, -R * 0.1], s: [R * 0.3, R * 0.3, R * 0.18], c: '#1a1a1a' });
      } else if (h === 'vikinghelm' || h === 'plumehelm' || h === 'darkhelm') {
        const full = h === 'darkhelm';
        rig.add(B, G.shell(R * 1.12, 0, PI * 2, 0, full ? PI * 0.62 : 1.3, 28, 14), { c: metal, k: 'metal', c2: shade(metal, 0.7) });
        rig.add(B, G.torus(R * (full ? 1.0 : 1.08), R * 0.07, PI * 2, 8, 30), { p: [0, R * (full ? -0.2 : 0.32), 0], r: [PI / 2, 0, 0], c: shade(metal, 0.8), k: 'metal' });
        if (full) {
          rig.add(B, G.box, { p: [0, R * 0.05, R * 1.02], s: [R * 0.95, R * 0.12, R * 0.12], c: '#08080c' });
          rig.add(B, G.box, { p: [0, -R * 0.35, R * 0.95], s: [R * 0.12, R * 0.5, R * 0.12], c: shade(metal, 0.7), k: 'metal' });
        }
        if (h === 'vikinghelm' || h === 'darkhelm') {
          for (const s of [-1, 1]) {
            const hc = h === 'darkhelm' ? '#1c1c24' : '#efe6cf';
            rig.add(B, G.cone, { p: [s * R * 1.05, R * 0.75, 0], r: [0, 0, -s * 0.9], s: [R * 0.16, R * 0.55, R * 0.16], c: hc, c2: shade(hc, 0.7) });
            rig.add(B, G.cone, { p: [s * R * 1.38, R * 1.18, 0], r: [0, 0, -s * 0.15], s: [R * 0.1, R * 0.45, R * 0.1], c: shade(hc, 1.05) });
          }
        }
        if (h === 'plumehelm') {
          for (let i = 0; i < 6; i++) rig.add(B, G.sph, { p: [0, R * (1.2 - i * 0.02), R * (0.3 - i * 0.24)], s: [R * 0.09, R * 0.22, R * 0.2], c: look.cape || '#c02a2a' });
        }
      } else if (h === 'horns') {
        const hc = look.hornColor || '#3a2a2a';
        for (const s of [-1, 1]) {
          rig.add(B, G.cone, { p: [s * R * 0.48, R * 0.95, R * 0.15], r: [0.35, 0, -s * 0.45], s: [R * 0.13, R * 0.42, R * 0.13], c: hc, c2: shade(hc, 1.6) });
          rig.add(B, G.cone, { p: [s * R * 0.64, R * 1.28, R * 0.33], r: [0.9, 0, -s * 0.15], s: [R * 0.08, R * 0.3, R * 0.08], c: shade(hc, 1.5) });
        }
      } else if (h === 'elfears') {
        for (const s of [-1, 1]) rig.add(B, G.cone, { p: [s * R * 1.1, R * 0.05, -R * 0.05], r: [0.15, 0, -s * 1.25], s: [R * 0.14, R * 0.65, R * 0.07], c: look.skin, c2: shade(look.skin, SKIN_SHADE) });
      } else if (h === 'halo') {
        rig.add(B, G.torus(R * 0.55, R * 0.045, PI * 2, 8, 40), { p: [0, R * 1.42, -R * 0.15], r: [PI / 2 - 0.25, 0, 0], c: glowC, k: 'glow', i: 2.8 });
      } else if (h === 'antlers') {
        const ac = '#8a6a4a';
        for (const s of [-1, 1]) {
          rig.add(B, G.taper(R * 0.05, R * 0.08, 8), { p: [s * R * 0.55, R * 1.15, 0], r: [0, 0, -s * 0.5], s: [1, R * 0.7, 1], c: ac });
          rig.add(B, G.taper(R * 0.035, R * 0.05, 8), { p: [s * R * 0.9, R * 1.6, 0], r: [0, 0, -s * 0.1], s: [1, R * 0.55, 1], c: ac });
          rig.add(B, G.taper(R * 0.03, R * 0.045, 8), { p: [s * R * 0.62, R * 1.6, R * 0.05], r: [0.2, 0, s * 0.5], s: [1, R * 0.4, 1], c: ac });
          rig.add(B, G.sphLo, { p: [s * R * 0.75, R * 1.3, 0.05], s: R * 0.09, c: '#7ad84a' });
        }
      } else if (h === 'tricorn') {
        const hc = look.hatColor || '#2a1a1a';
        rig.add(B, G.taper(R * 0.6, R * 0.7, 20), { p: [0, R * 1.1, -R * 0.05], r: [-0.1, 0, 0], s: [1, R * 0.4, 1], c: hc });
        rig.add(B, G.coneLo, { p: [0, R * 0.98, -R * 0.03], r: [-0.1, PI / 3, 0], s: [R * 1.35, R * 0.12, R * 1.35], c: shade(hc, 0.9) });
        rig.add(B, G.torus(R * 1.05, R * 0.04, PI * 2, 6, 3), { p: [0, R * 1.03, -R * 0.03], r: [PI / 2 - 0.1, 0, PI / 2], c: look.body ? look.body.accent : gold });
        rig.add(B, G.sph, { p: [R * 0.4, R * 1.25, R * 0.45], s: [R * 0.08, R * 0.3, R * 0.08], r: [0.4, 0, -0.4], c: '#ffffff' });
      } else if (h === 'bicorne') {
        const hc = look.hatColor || '#1a2240';
        rig.add(B, G.cyl, { p: [0, R * 1.12, -R * 0.02], r: [PI / 2, 0, 0], s: [R * 1.15, R * 0.24, R * 0.55], c: hc, c2: shade(hc, 0.6) });
        rig.add(B, G.torus(R * 0.82, R * 0.035, PI, 6, 20), { p: [0, R * 1.12, R * 0.11], s: [1.4, 0.68, 1], c: look.body ? look.body.accent : gold });
        rig.add(B, G.sph, { p: [0, R * 1.42, R * 0.12], s: R * 0.1, c: '#ffffff' });
      } else if (h === 'strawhat') {
        rig.add(B, G.cone, { p: [0, R * 1.08, 0], r: [-0.08, 0, 0], s: [R * 1.55, R * 0.45, R * 1.55], c: '#e8c87a', c2: '#c8a050' });
        rig.add(B, G.taper(R * 0.5, R * 0.55, 18), { p: [0, R * 1.02, 0], r: [-0.08, 0, 0], s: [1, R * 0.12, 1], c: '#b8302a' });
      } else if (h === 'headband') {
        const bc = look.headbandColor || (look.body ? look.body.accent : '#d82a2a');
        rig.add(B, G.torus(R * 1.03, R * 0.07, PI * 2, 8, 32), { p: [0, R * 0.42, -R * 0.02], r: [PI / 2 + 0.25, 0, 0], c: bc });
        for (const s of [-1, 1]) rig.add(B, G.box, { p: [s * R * 0.2, R * 0.2, -R * 1.15], r: [0.3, s * 0.3, s * 0.4], s: [R * 0.14, R * 0.6, R * 0.04], c: bc });
        if (look.weapon === 'katana') rig.add(B, G.box, { p: [0, R * 0.6, R * 0.92], r: [-0.25, 0, 0], s: [R * 0.4, R * 0.15, R * 0.05], c: '#d8dce8', k: 'metal' });
      } else if (h === 'goblinears') {
        for (const s of [-1, 1]) rig.add(B, G.cone, { p: [s * R * 1.2, R * 0.12, -R * 0.05], r: [0.25, 0, -s * 1.35], s: [R * 0.22, R * 0.95, R * 0.08], c: look.skin, c2: shade(look.skin, 0.75) });
      } else if (h === 'fishfins') {
        rig.add(B, G.cone, { p: [0, R * 1.05, -R * 0.2], r: [-0.4, 0, 0], s: [R * 0.08, R * 0.8, R * 0.7], c: look.finColor || '#2a6a8a', c2: shade(look.finColor || '#2a6a8a', 1.4) });
        for (const s of [-1, 1]) rig.add(B, G.cone, { p: [s * R * 1.0, -R * 0.1, -R * 0.1], r: [0.3, 0, -s * 1.9], s: [R * 0.06, R * 0.55, R * 0.45], c: look.finColor || '#2a6a8a' });
      } else if (h === 'wraps') {
        for (let i = 0; i < 4; i++) {
          const y = 0.62 - i * 0.36, rr = Math.sqrt(1 - y * y) * 1.02;
          rig.add(B, G.torus(R * rr, R * 0.07, PI * 2, 6, 28), { p: [0, R * y, 0], r: [PI / 2 + (i % 2 ? 0.18 : -0.12), 0, 0], c: shade(look.skin, 0.85) });
        }
      } else if (h === 'nemes') {
        rig.add(B, G.shell(R * 1.12, PI / 2 + 0.95, PI * 2 - 1.9, 0, 2.3, 26, 14), { c: '#e8b830', c2: '#2a4ab8', k: 'toon2' });
        rig.add(B, G.cone, { p: [0, R * 0.95, R * 0.75], r: [0.5, 0, 0], s: [R * 0.12, R * 0.3, R * 0.12], c: '#e8b830', k: 'metal' });
      } else if (h === 'leafhat') {
        rig.add(B, G.sph, { p: [0, R * 1.02, R * 0.05], r: [-0.45, 0, 0.25], s: [R * 0.75, R * 0.14, R * 1.25], c: '#6ad84a', c2: '#2a8a2a' });
        rig.add(B, G.cone, { p: [R * 0.12, R * 1.26, R * 0.95], r: [1.1, 0, 0.25], s: [R * 0.3, R * 0.5, R * 0.08], c: '#6ad84a' });
        rig.add(B, G.taper(R * 0.03, R * 0.05, 6), { p: [0, R * 1.25, -R * 0.1], r: [0, 0, 0.6], s: [1, R * 0.3, 1], c: '#3a6a1a' });
      } else if (h === 'flower') {
        const fp = [R * 0.72, R * 0.62, R * 0.32];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * PI * 2;
          rig.add(B, G.sph, { p: [fp[0] + Math.cos(a) * R * 0.12, fp[1] + Math.sin(a) * R * 0.12, fp[2]], s: [R * 0.1, R * 0.1, R * 0.05], c: '#ff8ac8' });
        }
        rig.add(B, G.sph, { p: [fp[0], fp[1], fp[2] + R * 0.03], s: R * 0.07, c: '#ffe04a' });
      } else if (h === 'mask') {
        rig.add(B, G.shell(R * 1.03, PI / 2 - 1.0, 2.0, 1.72, 0.95, 24, 10), { c: look.scarf || '#2a2236' });
      }
    }
  }

  // weapons are built pointing up (+y) from the grip at the origin
  function weapon(rig, bone, kind, look, side) {
    const metal = look.metal && look.body && look.body.style === 'armor' ? '#d8dce8' : '#d8dce8';
    const steel = '#dfe3ec', gold = '#e8b840', wood = '#7a4a2a', dark = '#2a2026';
    const glowC = look.glow || '#ffffff';
    const P = (g, o) => rig.add(bone, g, o);
    switch (kind) {
      case 'sword':
        P(G.box, { p: [0, 0.55, 0], s: [0.1, 0.8, 0.025], c: steel, k: 'metal' });
        P(G.cone, { p: [0, 1.0, 0], s: [0.05, 0.12, 0.012], c: steel, k: 'metal' });
        P(G.box, { p: [0, 0.14, 0], s: [0.3, 0.05, 0.07], c: gold, k: 'metal' });
        P(G.cyl, { p: [0, 0.02, 0], s: [0.035, 0.18, 0.035], c: dark });
        P(G.sph, { p: [0, -0.09, 0], s: 0.05, c: gold, k: 'metal' });
        P(G.box, { p: [0, 0.55, 0.014], s: [0.02, 0.7, 0.01], c: glowC, k: 'glow', i: 1.6, ol: false });
        break;
      case 'greatsword':
      case 'flamesword': {
        const fl = kind === 'flamesword';
        P(G.box, { p: [0, 0.75, 0], s: [0.2, 1.2, 0.04], c: fl ? '#3a2a30' : '#5a5a6a', k: 'metal' });
        P(G.cone, { p: [0, 1.42, 0], s: [0.1, 0.16, 0.02], c: fl ? '#3a2a30' : '#5a5a6a', k: 'metal' });
        P(G.box, { p: [0, 0.75, 0.024], s: [0.06, 1.1, 0.01], c: glowC, k: 'glow', i: fl ? 3 : 2, ol: false });
        P(G.box, { p: [0, 0.75, -0.024], s: [0.06, 1.1, 0.01], c: glowC, k: 'glow', i: fl ? 3 : 2, ol: false });
        P(G.box, { p: [0, 0.14, 0], s: [0.42, 0.08, 0.1], c: fl ? '#c8302a' : '#4a4a5a', k: 'metal' });
        P(G.cyl, { p: [0, 0.0, 0], s: [0.04, 0.24, 0.04], c: dark });
        P(G.sph, { p: [0, -0.14, 0], s: 0.06, c: glowC, k: 'glow', i: 2 });
        break;
      }
      case 'katana':
        P(G.box, { p: [0.0, 0.6, 0], r: [0, 0, -0.05], s: [0.06, 0.95, 0.02], c: steel, k: 'metal' });
        P(G.box, { p: [0.004, 0.6, 0.011], r: [0, 0, -0.05], s: [0.015, 0.9, 0.005], c: glowC, k: 'glow', i: 1.5, ol: false });
        P(G.cyl, { p: [0, 0.11, 0], s: [0.09, 0.025, 0.09], c: gold, k: 'metal' });
        P(G.cyl, { p: [0, -0.03, 0], s: [0.032, 0.26, 0.032], c: '#2a2a4a' });
        break;
      case 'rapier':
        P(G.taper(0.006, 0.02, 6), { p: [0, 0.62, 0], s: [1, 1.0, 1], c: steel, k: 'metal' });
        P(G.shell(0.11, 0, PI * 2, 0, PI / 2, 16, 8), { p: [0, 0.08, 0], r: [PI, 0, 0], c: gold, k: 'metal' });
        P(G.cyl, { p: [0, 0.0, 0], s: [0.03, 0.16, 0.03], c: '#1a1a1a' });
        P(G.sph, { p: [0, -0.09, 0], s: 0.04, c: glowC, k: 'glow', i: 2 });
        break;
      case 'cutlass':
        P(G.box, { p: [0.03, 0.42, 0], r: [0, 0, -0.12], s: [0.14, 0.6, 0.025], c: steel, k: 'metal' });
        P(G.torus(0.09, 0.015, PI, 6, 12), { p: [0, 0.07, 0], r: [0, PI / 2, 0], c: gold, k: 'metal' });
        P(G.cyl, { p: [0, 0.0, 0], s: [0.035, 0.16, 0.035], c: wood });
        break;
      case 'axe':
        P(G.cyl, { p: [0, 0.35, 0], s: [0.04, 0.95, 0.04], c: wood });
        P(G.cyl, { p: [0.13, 0.72, 0], r: [PI / 2, 0, 0], s: [0.24, 0.04, 0.24], c: steel, k: 'metal' });
        P(G.cyl, { p: [-0.08, 0.72, 0], r: [PI / 2, 0, 0], s: [0.13, 0.035, 0.13], c: steel, k: 'metal' });
        P(G.box, { p: [0, 0.72, 0], s: [0.1, 0.14, 0.08], c: '#5a5a66', k: 'metal' });
        break;
      case 'hammer':
        P(G.cyl, { p: [0, 0.35, 0], s: [0.045, 0.95, 0.045], c: wood });
        P(G.box, { p: [0, 0.84, 0], s: [0.46, 0.26, 0.26], c: look.metal || '#e8c050', k: 'metal' });
        P(G.cyl, { p: [0, 0.84, 0], r: [0, 0, PI / 2], s: [0.15, 0.5, 0.15], c: shade(look.metal || '#e8c050', 0.7), k: 'metal' });
        P(G.sph, { p: [0, 0.84, 0.13], s: [0.07, 0.07, 0.03], c: glowC, k: 'glow', i: 2.5 });
        break;
      case 'spear':
      case 'lance':
      case 'trident': {
        const L = kind === 'lance' ? 1.25 : 1.35;
        P(G.cyl, { p: [0, L / 2 - 0.25, 0], s: [0.035, L, 0.035], c: kind === 'trident' ? gold : kind === 'lance' ? '#e8eef8' : wood, k: kind === 'spear' ? 'toon' : 'metal' });
        if (kind === 'lance') {
          P(G.cone, { p: [0, L - 0.05, 0], s: [0.13, 0.75, 0.13], c: '#e8f4ff', k: 'metal' });
          P(G.cone, { p: [0, L - 0.05, 0], s: [0.05, 0.6, 0.05], c: glowC, k: 'glow', i: 2.2, ol: false });
          P(G.cyl, { p: [0, L - 0.42, 0], s: [0.16, 0.06, 0.16], c: '#3a8ad8', k: 'metal' });
        } else if (kind === 'trident') {
          P(G.cone, { p: [0, L + 0.08, 0], s: [0.05, 0.35, 0.03], c: gold, k: 'metal' });
          for (const s of [-1, 1]) {
            P(G.cyl, { p: [s * 0.1, L - 0.18, 0], r: [0, 0, s * 0.6], s: [0.02, 0.22, 0.02], c: gold, k: 'metal' });
            P(G.cone, { p: [s * 0.16, L - 0.02, 0], s: [0.04, 0.25, 0.025], c: gold, k: 'metal' });
          }
          P(G.sph, { p: [0, L - 0.25, 0], s: 0.07, c: glowC, k: 'glow', i: 2.5 });
        } else {
          P(G.cone, { p: [0, L + 0.0, 0], s: [0.07, 0.3, 0.025], c: steel, k: 'metal' });
        }
        break;
      }
      case 'staff':
      case 'bamboo': {
        if (kind === 'bamboo') {
          P(G.cyl, { p: [0, 0.35, 0], s: [0.04, 1.4, 0.04], c: '#7ab83a', c2: '#4a8a2a' });
          for (let i = 0; i < 5; i++) P(G.cyl, { p: [0, -0.25 + i * 0.3, 0], s: [0.05, 0.03, 0.05], c: '#3a6a1a' });
          break;
        }
        P(G.taper(0.03, 0.045, 10), { p: [0, 0.3, 0], s: [1, 1.3, 1], c: wood, c2: shade(wood, 0.7) });
        P(G.torus(0.13, 0.025, PI * 2, 8, 20), { p: [0, 1.02, 0], c: gold, k: 'metal' });
        P(G.sph, { p: [0, 1.02, 0], s: 0.1, c: glowC, k: 'glow', i: 3 });
        for (const s of [-1, 1]) P(G.cone, { p: [s * 0.1, 1.1, 0], r: [0, 0, -s * 0.5], s: [0.03, 0.18, 0.03], c: gold, k: 'metal' });
        break;
      }
      case 'wand':
        P(G.taper(0.015, 0.025, 8), { p: [0, 0.22, 0], s: [1, 0.5, 1], c: '#e8e0ff' });
        P(G.oct, { p: [0, 0.52, 0], s: [0.09, 0.12, 0.05], c: glowC, k: 'glow', i: 3 });
        break;
      case 'orb':
        P(G.sph, { p: [0, 0.35, 0.1], s: 0.15, c: glowC, k: 'glow', i: 2.6 });
        P(G.torus(0.22, 0.012, PI * 2, 6, 30), { p: [0, 0.35, 0.1], r: [1.2, 0.3, 0], c: gold, k: 'metal' });
        break;
      case 'bow':
        P(G.torus(0.5, 0.025, PI * 0.9, 8, 26), { p: [-0.15, 0.25, 0], r: [0, 0, PI * 0.55], s: [0.7, 1, 1], c: '#8a5a2a', c2: gold });
        P(G.cyl, { p: [0.18, 0.25, 0], s: [0.006, 0.86, 0.006], c: '#ffffff', ol: false });
        P(G.sph, { p: [-0.2, 0.25, 0], s: 0.05, c: glowC, k: 'glow', i: 2.5 });
        break;
      case 'pistols':
      case 'pistol':
        P(G.box, { p: [0, 0.18, 0.06], r: [0.2, 0, 0], s: [0.07, 0.07, 0.32], c: '#3a3a44', k: 'metal' });
        P(G.cyl, { p: [0, 0.2, 0.25], r: [PI / 2, 0, 0], s: [0.025, 0.12, 0.025], c: gold, k: 'metal' });
        P(G.box, { p: [0, 0.06, -0.04], r: [-0.4, 0, 0], s: [0.06, 0.18, 0.08], c: wood });
        break;
      case 'scythe':
        P(G.taper(0.03, 0.04, 10), { p: [0, 0.35, 0], s: [1, 1.45, 1], c: '#2a2030' });
        P(G.torus(0.42, 0.04, PI * 0.75, 6, 22), { p: [0.32, 1.02, 0], r: [0, 0, PI * 0.25], s: [1, 1, 0.35], c: '#c8c8d8', k: 'metal' });
        P(G.torus(0.42, 0.015, PI * 0.75, 6, 22), { p: [0.32, 1.02, 0.0], r: [0, 0, PI * 0.25], s: [1.04, 1.04, 0.5], c: glowC, k: 'glow', i: 2.2, ol: false });
        P(G.sph, { p: [0, 1.05, 0], s: 0.07, c: glowC, k: 'glow', i: 2.5 });
        break;
      case 'daggers':
      case 'dagger':
        P(G.box, { p: [0, 0.25, 0], s: [0.06, 0.32, 0.02], c: '#c8c8e0', k: 'metal' });
        P(G.cone, { p: [0, 0.44, 0], s: [0.03, 0.08, 0.01], c: '#c8c8e0', k: 'metal' });
        P(G.box, { p: [0, 0.25, 0.012], s: [0.015, 0.3, 0.006], c: glowC, k: 'glow', i: 2, ol: false });
        P(G.box, { p: [0, 0.08, 0], s: [0.14, 0.03, 0.05], c: dark });
        break;
      case 'claws':
        for (let i = -1; i <= 1; i++) P(G.cone, { p: [i * 0.05, 0.15, 0.06], r: [0.5, 0, 0], s: [0.025, 0.22, 0.012], c: glowC, k: 'glow', i: 2.2 });
        break;
      case 'fists':
        P(G.sph, { p: [0, 0.0, 0.02], s: [0.15, 0.14, 0.16], c: '#e8c050', k: 'metal' });
        P(G.sph, { p: [0, 0.0, 0.1], s: [0.12, 0.1, 0.06], c: glowC, k: 'glow', i: 1.5 });
        break;
      case 'book':
        P(G.box, { p: [-0.1, 0.32, 0.18], r: [0.5, 0.35, 0.1], s: [0.2, 0.26, 0.03], c: '#5a2a8a' });
        P(G.box, { p: [0.1, 0.32, 0.18], r: [0.5, -0.35, -0.1], s: [0.2, 0.26, 0.03], c: '#5a2a8a' });
        P(G.box, { p: [0, 0.34, 0.2], r: [0.5, 0, 0], s: [0.34, 0.22, 0.02], c: glowC, k: 'glow', i: 1.8 });
        break;
      case 'whip': {
        P(G.cyl, { p: [0, 0.05, 0], s: [0.03, 0.2, 0.03], c: '#3a1a2a' });
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          P(G.sphLo, { p: [Math.sin(t * 3) * 0.25, 0.2 + t * 0.55, Math.cos(t * 2.4) * 0.15 - 0.1], s: 0.03 - t * 0.012, c: glowC, k: 'glow', i: 2 });
        }
        break;
      }
      case 'club':
        P(G.taper(0.11, 0.04, 10), { p: [0, 0.4, 0], s: [1, 0.8, 1], c: '#8a5a2a', c2: '#5a3a1a' });
        for (let i = 0; i < 4; i++) P(G.coneLo, { p: [Math.cos(i * 1.6) * 0.1, 0.65, Math.sin(i * 1.6) * 0.1], r: [Math.sin(i * 1.6) * 1.2, 0, -Math.cos(i * 1.6) * 1.2], s: [0.025, 0.08, 0.025], c: '#e8e0c8' });
        break;
      case 'shield':
        P(G.cyl, { p: [0, 0, 0.12], r: [PI / 2, 0, 0], s: [0.34, 0.06, 0.4], c: look.metal || '#e8e0d0', k: 'metal' });
        P(G.cyl, { p: [0, 0, 0.16], r: [PI / 2, 0, 0], s: [0.26, 0.04, 0.32], c: look.body ? look.body.accent : gold, k: 'metal' });
        P(G.oct, { p: [0, 0.02, 0.19], s: [0.07, 0.1, 0.03], c: glowC, k: 'glow', i: 2.5 });
        break;
      default: break;
    }
  }
  SH.buildWeapon = weapon;

  function wings(rig, kind, look, big) {
    const k = big || 1;
    if (kind === 'angel') {
      for (const s of [-1, 1]) {
        const b = rig.bone(s < 0 ? 'wingR' : 'wingL', 'wings', s * 0.1, 0, 0);
        for (let row = 0; row < 3; row++) {
          const n = 5 - row;
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1 || 1);
            const ang = 0.25 + t * 1.15;
            const L = (0.75 - row * 0.15) * k * (1 - t * 0.25);
            const x = s * (0.15 + Math.cos(ang - 0.2) * 0.2 * k + row * 0.04);
            const y = 0.25 * k - row * 0.12 + Math.sin(ang) * 0.12;
            rig.add(b.name, G.sph, {
              p: [x + s * Math.cos(ang) * L * 0.5, y - Math.sin(ang - 0.6) * L * 0.4, -0.05 - row * 0.03],
              r: [0, 0, s * (ang + 0.5)], s: [L * 0.6, 0.13 * k, 0.05 * k],
              c: row === 0 ? '#ffffff' : '#f4f0ff', c2: mix('#ffffff', look.glow || '#ffe8a0', 0.35),
            });
          }
        }
      }
    } else if (kind === 'bat') {
      const wc = look.wingColor || '#5a1a3a';
      const wingShape = G.shape('batwing', (sh) => {
        sh.moveTo(0, 0); sh.lineTo(0.9, 0.55); sh.quadraticCurveTo(0.85, 0.2, 1.05, 0.05);
        sh.quadraticCurveTo(0.8, -0.05, 0.75, -0.3); sh.quadraticCurveTo(0.55, -0.2, 0.45, -0.45);
        sh.quadraticCurveTo(0.3, -0.25, 0.15, -0.35); sh.quadraticCurveTo(0.12, -0.15, 0, 0);
      });
      for (const s of [-1, 1]) {
        const b = rig.bone(s < 0 ? 'wingR' : 'wingL', 'wings', s * 0.08, 0, 0);
        rig.add(b.name, wingShape, { p: [0, 0, 0], r: [0, s < 0 ? PI : 0, 0], s: [0.8 * k, 0.8 * k, 1], c: wc, c2: shade(wc, 0.6), k: 'toon2' });
        rig.add(b.name, G.cyl, { p: [s * 0.36 * k, 0.22 * k, 0], r: [0, 0, s * -1.0], s: [0.025 * k, 0.85 * k, 0.025 * k], c: shade(wc, 0.5) });
      }
    } else if (kind === 'fairy') {
      for (const s of [-1, 1]) {
        const b = rig.bone(s < 0 ? 'wingR' : 'wingL', 'wings', s * 0.06, 0, 0);
        rig.add(b.name, G.sph, { p: [s * 0.35, 0.25, 0], r: [0, 0, s * -0.7], s: [0.38, 0.2, 0.01], c: look.glow || '#aaff66', k: 'trans', i: 0.9 });
        rig.add(b.name, G.sph, { p: [s * 0.28, -0.08, 0], r: [0, 0, s * -2.2], s: [0.26, 0.14, 0.01], c: look.glow || '#aaff66', k: 'trans', i: 0.8 });
      }
    }
  }
  SH.buildWings = wings;

  // ================================================================ hero
  function buildHero(look, opts) {
    opts = opts || {};
    const rig = new Rig({ scale: (look.scale || 1) * (opts.scale || 1), thick: 0.028 });
    rig.rim = mix(look.glow || '#9aa8e0', '#ffffff', 0.4);
    const skin = C(look.skin || '#ffe0c8');
    const skinS = shade(skin, SKIN_SHADE);
    const body = look.body || { style: 'tunic', top: '#4a6ab8', bottom: '#2a3a6a', accent: '#ffd23a' };
    const top = C(body.top), bot = C(body.bottom), acc = C(body.accent);
    const metal = C(look.metal || '#c8ccd8');
    const style = body.style;
    const R = 0.52;
    const longSkirt = style === 'robe' || style === 'dress';
    const hipY = 0.5;

    rig.bone('body', 'root', 0, hipY, 0);
    rig.bone('legL', 'root', 0.13, hipY, 0);
    rig.bone('legR', 'root', -0.13, hipY, 0);
    rig.bone('chest', 'body', 0, 0, 0);
    rig.bone('head', 'chest', 0, 0.6 + R * 0.92, 0.02);
    rig.bone('armL', 'chest', 0.27, 0.46, 0);
    rig.bone('armR', 'chest', -0.27, 0.46, 0);
    rig.bone('handL', 'armL', 0.04, -0.4, 0.03);
    rig.bone('handR', 'armR', -0.04, -0.4, 0.03);
    rig.bone('wings', 'chest', 0, 0.38, -0.2);
    rig.bone('cape', 'chest', 0, 0.5, -0.16);
    rig.bone('tail', 'body', 0, 0.02, -0.22);

    // legs + boots
    const legC = style === 'monk' ? bot : longSkirt ? skin : bot;
    for (const [b, s] of [['legL', 1], ['legR', -1]]) {
      rig.add(b, G.cap(0.1, 0.24), { p: [0, -0.2, 0], c: legC, c2: shade(legC, 0.8) });
      const boot = style === 'armor' ? metal : shade(top, 0.55);
      rig.add(b, G.sph, { p: [0, -0.42, 0.04], s: [0.13, 0.1, 0.17], c: boot, k: style === 'armor' ? 'metal' : 'toon' });
      rig.add(b, G.cyl, { p: [0, -0.33, 0.0], s: [0.115, 0.1, 0.115], c: style === 'armor' ? metal : shade(top, 0.7), k: style === 'armor' ? 'metal' : 'toon' });
      if (s) { /* both legs equal */ }
    }
    // torso
    const torso = G.lathe('torso', [[0.0, -0.02], [0.24, 0.0], [0.27, 0.12], [0.26, 0.3], [0.21, 0.47], [0.11, 0.58], [0.0, 0.6]], 24);
    rig.add('chest', torso, { s: [1, 1, 0.82], c: top, c2: shade(top, 0.75) });
    // neck
    rig.add('chest', G.cyl, { p: [0, 0.62, 0], s: [0.08, 0.1, 0.08], c: skinS });
    // belt
    rig.add('chest', G.torus(0.25, 0.04, PI * 2, 8, 28), { p: [0, 0.07, 0], r: [PI / 2, 0, 0], s: [1, 0.82, 1], c: acc });
    rig.add('chest', G.box, { p: [0, 0.07, 0.22], s: [0.1, 0.09, 0.04], c: '#f2c040', k: 'metal' });
    // skirt / lower body
    if (style === 'dress') {
      rig.add('chest', G.lathe('dress', [[0.25, 0.06], [0.33, -0.12], [0.44, -0.36], [0.47, -0.42], [0.0, -0.42]], 26), { c: bot, c2: shade(bot, 0.7) });
      rig.add('chest', G.torus(0.45, 0.03, PI * 2, 6, 30), { p: [0, -0.41, 0], r: [PI / 2, 0, 0], c: acc });
    } else if (style === 'robe') {
      rig.add('chest', G.lathe('robe', [[0.25, 0.06], [0.34, -0.2], [0.42, -0.46], [0.0, -0.46]], 26), { c: bot, c2: shade(bot, 0.65) });
      rig.add('chest', G.box, { p: [0, -0.18, 0.31], r: [-0.25, 0, 0], s: [0.14, 0.5, 0.03], c: acc });
    } else if (style === 'coat') {
      rig.add('chest', G.lathe('coat', [[0.26, 0.08], [0.32, -0.15], [0.38, -0.38], [0.0, -0.38]], 24), { s: [1, 1, 0.9], c: top, c2: shade(top, 0.6) });
      rig.add('chest', G.box, { p: [0, -0.12, 0.27], r: [-0.15, 0, 0], s: [0.12, 0.42, 0.03], c: bot });
      for (const s of [-1, 1]) rig.add('chest', G.box, { p: [s * 0.13, 0.34, 0.2], r: [0.3, 0, s * 0.25], s: [0.12, 0.24, 0.03], c: acc });
      rig.add('chest', G.taper(0.17, 0.2, 18), { p: [0, 0.6, -0.02], s: [1, 0.14, 1], c: shade(top, 0.8) });
      for (let i = 0; i < 3; i++) rig.add('chest', G.sphLo, { p: [0.07, 0.32 - i * 0.11, 0.23], s: 0.025, c: '#f2c040', k: 'metal' });
    } else if (style === 'armor') {
      rig.add('chest', G.sph, { p: [0, 0.32, 0.06], s: [0.27, 0.27, 0.2], c: metal, c2: shade(metal, 0.7), k: 'metal' });
      rig.add('chest', G.oct, { p: [0, 0.36, 0.25], s: [0.06, 0.08, 0.03], c: look.glow || acc, k: 'glow', i: 2.4 });
      for (let i = 0; i < 6; i++) {
        const a = -1.1 + (i / 5) * 2.2;
        rig.add('chest', G.box, { p: [Math.sin(a) * 0.27, -0.08, Math.cos(a) * 0.23], r: [0.2 * Math.cos(a), a, 0], s: [0.15, 0.22, 0.04], c: i % 2 ? metal : shade(metal, 0.82), k: 'metal' });
      }
      rig.add('chest', G.lathe('armorskirt', [[0.26, 0.06], [0.31, -0.14], [0.0, -0.14]], 20), { c: bot });
    } else if (style === 'ninja') {
      rig.add('chest', G.lathe('ninja', [[0.25, 0.06], [0.29, -0.12], [0.0, -0.12]], 20), { c: bot });
      for (const s of [-1, 1]) rig.add('chest', G.box, { p: [s * 0.12, -0.12, -0.2], r: [-0.3, 0, s * 0.2], s: [0.08, 0.35, 0.02], c: acc });
    } else if (style === 'monk') {
      rig.add('chest', G.lathe('monk', [[0.25, 0.06], [0.3, -0.1], [0.0, -0.1]], 20), { c: bot });
      rig.add('chest', G.torus(0.26, 0.06, PI * 2, 8, 28), { p: [0, 0.08, 0], r: [PI / 2, 0, 0], s: [1, 0.85, 1], c: acc });
      rig.add('chest', G.box, { p: [0.1, -0.08, 0.2], r: [-0.2, 0, 0.15], s: [0.1, 0.3, 0.03], c: acc });
    } else {
      rig.add('chest', G.lathe('tunic', [[0.25, 0.06], [0.31, -0.12], [0.36, -0.22], [0.0, -0.22]], 22), { c: bot, c2: shade(bot, 0.7) });
    }
    if (look.scarf) {
      rig.add('chest', G.torus(0.15, 0.07, PI * 2, 8, 22), { p: [0, 0.58, 0.01], r: [PI / 2 + 0.15, 0, 0], c: look.scarf });
      rig.add('cape', G.box, { p: [0.08, -0.05, -0.05], r: [-0.4, 0, 0.3], s: [0.12, 0.5, 0.03], c: look.scarf, c2: shade(look.scarf, 0.6) });
      rig.add('cape', G.box, { p: [-0.05, -0.0, -0.05], r: [-0.6, 0, -0.2], s: [0.1, 0.4, 0.03], c: look.scarf, c2: shade(look.scarf, 0.6) });
    }
    // arms
    const sleeve = style === 'monk' ? skin : style === 'armor' ? shade(top, 0.9) : top;
    for (const [b, s] of [['armL', 1], ['armR', -1]]) {
      rig.add(b, G.cap(0.085, 0.24), { p: [s * 0.03, -0.18, 0], r: [0, 0, s * 0.12], c: sleeve, c2: shade(sleeve, 0.8) });
      if (style === 'robe') rig.add(b, G.taper(0.1, 0.16, 14), { p: [s * 0.04, -0.33, 0], r: [0, 0, s * 0.1], s: [1, 0.16, 1], c: bot });
      if (style === 'armor' || style === 'coat') {
        rig.add(b, G.shell(0.15, 0, PI * 2, 0, PI * 0.55, 18, 8), { p: [s * 0.02, 0.0, 0], r: [0, 0, s * -0.35], s: [1, 0.85, 1], c: style === 'armor' ? metal : acc, k: style === 'armor' ? 'metal' : 'toon2' });
      }
      if (style === 'armor') rig.add(b, G.cyl, { p: [s * 0.045, -0.31, 0], s: [0.1, 0.12, 0.1], c: metal, k: 'metal' });
      rig.add(b === 'armL' ? 'handL' : 'handR', G.sph, { s: 0.09, c: skin });
    }
    // head
    rig.add('head', G.sphHi, { s: R, c: skin, c2: skinS });
    rig.add('head', G.sph, { p: [0, -R * 0.42, R * 0.18], s: [R * 0.62, R * 0.45, R * 0.6], c: skin, ol: false });   // cheeks / chin
    faceMesh(rig, 'head', R, {
      eye: look.eyes ? look.eyes.color : '#3a6aff', style: look.eyes ? look.eyes.style : 'normal', mouth: look.mouth || 'smile',
      brow: look.hair ? look.hair.color : '#3a2a1a', skin: look.skin, lashes: ['dress', 'robe'].includes(style) || look.hair && ['long', 'twintails', 'bob'].includes(look.hair.style),
      blush: look.eyes && look.eyes.style === 'glow' ? false : undefined,
    });
    if (look.eyes && look.eyes.style === 'glow') {
      for (const s of [-1, 1]) {
        const o = onSphere(R * 1.0, PI / 2 + 0.12, s * 0.36);
        rig.add('head', G.sph, { p: o.p.toArray(), q: o.q, s: [0.07, 0.035, 0.02], c: look.eyes.color, k: 'glow', i: 3 });
      }
    }
    hair(rig, R, look);
    headgear(rig, R, look);

    // weapons
    const w = look.weapon;
    const dual = w === 'pistols' || w === 'daggers' || w === 'claws' || w === 'fists';
    if (w) {
      const wr = rig.bone('weaponR', 'handR', 0, 0, 0);
      wr.rotation.set(0.55, 0, 0.55);
      if (w === 'book' || w === 'orb') { wr.rotation.set(0, 0, 0); }
      if (w === 'bow') { rig.bones.handL.add(wr); wr.position.set(0, 0, 0.05); wr.rotation.set(0.2, 0.3, -0.1); }
      weapon(rig, 'weaponR', w, look, -1);
      if (dual) {
        const wl = rig.bone('weaponL', 'handL', 0, 0, 0);
        wl.rotation.set(0.55, 0, -0.55);
        weapon(rig, 'weaponL', w, look, 1);
      }
    }
    if (look.offhand === 'shield') {
      const sl = rig.bone('shieldL', 'handL', 0.06, 0.05, 0.05);
      sl.rotation.set(0, 0.6, 0);
      weapon(rig, 'shieldL', 'shield', look, 1);
    }
    // cape
    if (look.cape) {
      const capeG = geo('capeG', () => {
        const g = new THREE.CylinderGeometry(0.26, 0.42, 1.0, 16, 6, true, PI - 1.15, 2.3);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          p.setY(i, y - 0.5);
          p.setZ(i, p.getZ(i) * (1 + (0.5 - y) * 0.25));
        }
        g.computeVertexNormals();
        return g;
      });
      rig.add('cape', capeG, { p: [0, 0.05, 0.12], c: shade(look.cape, 1.0), c2: shade(look.cape, 0.55), k: 'toon2' });
      for (const s of [-1, 1]) rig.add('cape', G.sph, { p: [s * 0.18, 0.05, 0.18], s: 0.05, c: '#f2c040', k: 'metal' });
    }
    if (look.wings) wings(rig, look.wings, look, look.wings === 'angel' ? 1.45 : 1.15);
    if (look.tail === 'devil') {
      const tc = look.skin;
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        rig.add('tail', G.sph, { p: [Math.sin(t * 2.5) * 0.12, -0.05 + Math.sin(t * PI) * 0.15 - t * 0.1, -t * 0.45], s: 0.045 - t * 0.012, c: tc });
      }
      rig.add('tail', G.cone, { p: [0.07, -0.16, -0.5], r: [-1.6, 0, 0.3], s: [0.08, 0.14, 0.03], c: look.body.accent || '#ff3a3a' });
    }
    rig.build();
    // resting pose
    rig.bones.armL.rotation.z = 0.18;
    rig.bones.armR.rotation.z = -0.18;
    rig.bones.armR.rotation.x = -0.15;
    rig.focus = { y: (hipY + 0.6 + R * 0.92 + 0.02) * rig.scale, r: R * 1.25 * rig.scale };
    rig.height = 2.15;
    rig.kind = 'hero';
    rig.dual = dual;
    rig.weaponKind = w;
    rig.animate = heroAnim;
    return rig;
  }
  SH.buildHero = buildHero;

  // ================================================================ animation
  function heroAnim(t, dt) {
    const B = this.bones, st = this.state;
    const k = 1 - Math.exp(-dt * 12);
    const L = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
    let bodyY = 0, bodyRX = 0, armLX = 0, armRX = -0.15, armLZ = 0.18, armRZ = -0.18, headX = 0, legLX = 0, legRX = 0, headZ = 0;
    const br = Math.sin(t * 3.2);
    if (st === 'idle' || st === 'ready') {
      bodyY = br * 0.018;
      armLX = Math.sin(t * 3.2 + 0.5) * 0.06;
      armRX = -0.25 + Math.sin(t * 3.2) * 0.06;
      headZ = Math.sin(t * 1.4) * 0.05;
      headX = Math.sin(t * 1.1) * 0.03;
      if (st === 'ready') { armRX = -0.9 + br * 0.05; armRZ = -0.35; bodyY += 0.02; }
    } else if (st === 'run') {
      const s = Math.sin(t * 14);
      bodyY = Math.abs(s) * 0.06;
      bodyRX = 0.25;
      legLX = s * 0.8; legRX = -s * 0.8;
      armLX = -s * 0.7; armRX = s * 0.7;
    } else if (st === 'fly') {
      bodyRX = 0.5; armLX = 0.9; armRX = 0.9; armLZ = 0.5; armRZ = -0.5; legLX = 0.5; legRX = 0.7; headX = -0.25;
    } else if (st === 'aim') {
      bodyRX = -0.1; armRX = -1.4; armRZ = -0.4; armLX = -0.4; armLZ = 0.4; bodyY = br * 0.01;
    } else if (st === 'cast') {
      armRX = -2.6; armRZ = -0.2; armLX = -1.0; armLZ = 0.6; bodyRX = -0.15; bodyY = 0.04;
    } else if (st === 'win') {
      const j = Math.abs(Math.sin(t * 5));
      bodyY = j * 0.25; armRX = -2.8; armLX = -2.8; armLZ = 0.4; armRZ = -0.4;
    } else if (st === 'pose') {
      // portrait / cut-in pose
      armRX = -1.9; armRZ = -0.55; armLX = -0.5; armLZ = 0.55; bodyRX = -0.05; headX = -0.08; headZ = 0.06;
    } else if (st === 'hero') {
      // the hyper cut-in pose: weapon out to the side
      armRX = -1.25; armRZ = -1.05; armLX = -0.7; armLZ = 0.55; bodyRX = -0.12; headZ = -0.08; headX = -0.1; legLX = -0.25; legRX = 0.2;
    } else if (st === 'dead') {
      bodyRX = -0.4; headX = 0.4; armLX = -0.3; armRX = -0.3;
    }
    if (this.hitT > 0) { bodyRX -= this.hitT * 0.5; headX -= this.hitT * 0.3; }
    L(B.body.position, 'y', 0.5 + bodyY);
    L(B.body.rotation, 'x', bodyRX);
    L(B.head.rotation, 'x', headX);
    L(B.head.rotation, 'z', headZ);
    L(B.armL.rotation, 'x', armLX);
    L(B.armR.rotation, 'x', armRX);
    L(B.armL.rotation, 'z', armLZ);
    L(B.armR.rotation, 'z', armRZ);
    L(B.legL.rotation, 'x', legLX);
    L(B.legR.rotation, 'x', legRX);
    B.legL.position.y = B.legR.position.y = 0.5 + bodyY * 0.3;
    if (B.wingL) {
      const f = st === 'fly' ? Math.sin(t * 22) * 0.6 : Math.sin(t * 4) * 0.25;
      B.wingL.rotation.y = -0.3 - f; B.wingR.rotation.y = 0.3 + f;
    }
    if (B.cape) B.cape.rotation.x = (st === 'fly' ? 0.9 : st === 'run' ? 0.5 : 0.08) + Math.sin(t * 3) * 0.05;
    if (B.tail) B.tail.rotation.y = Math.sin(t * 2.5) * 0.4;
    if (B.weaponR && this.weaponKind === 'orb') B.weaponR.position.y = Math.sin(t * 2.5) * 0.05;
  }
  SH.heroAnim = heroAnim;
})();
