// Sip-Stack · Village — a procedural Three.js wine-coast teaching diorama.
// Original Sip Studies work. Lazy-loaded by sip-app.js only when the Village tab opens.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PINS, LANES, LANE_X, CHART_NAMES } from './sip-village-content.js';

const motionMQ = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => motionMQ.matches;
const $ = (s, r = document) => r.querySelector(s);
const PI = Math.PI;

/* ---------- small helpers ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261103);
const col = (hex, dl = 0, ds = 0) => new THREE.Color(hex).offsetHSL(0, ds, dl);
const jit = (hex, a = .03) => col(hex, (R() - .5) * a * 2, (R() - .5) * a);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const levelTop = z => z > -1.5 ? 1 : z > -4.5 ? 3 : z > -7.5 ? 5 : 7;

/* ---------- shared geometry + materials ---------- */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rock: new THREE.DodecahedronGeometry(1, 0),
  ball: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 14),
  roof: (() => { const s = new THREE.Shape(); s.moveTo(-.5, 0); s.lineTo(.5, 0); s.lineTo(0, 1); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -.5); return g; })(),
};
const M = {
  std: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .86 }),
  rock: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .95, flatShading: true }),
  leaf: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .9, flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .35, metalness: .55 }),
  winDark: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .3 }),
  winLit: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .3, emissive: '#ffbe62', emissiveIntensity: 0 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf86', emissiveIntensity: 0 }),
};
const KIND = { box: ['box', 'std'], rock: ['rock', 'rock'], ball: ['ball', 'leaf'], cyl: ['cyl', 'std'], cone: ['cone', 'std'], roof: ['roof', 'std'], metal: ['cyl', 'metal'], winDark: ['box', 'winDark'], winLit: ['box', 'winLit'], lamp: ['ball', 'lamp'] };

// Kit collects many small parts and turns each kind into one InstancedMesh (few draw calls).
class Kit {
  constructor() { this.items = {}; }
  push(kind, p, s, c, r) { (this.items[kind] ||= []).push([p, s, c, r]); }
  box(x0, x1, y0, y1, z0, z1, c, kind = 'box') { this.push(kind, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], c); }
  ball(x, y, z, r, c, sy = 1) { this.push('ball', [x, y, z], [r, r * sy, r], c); }
  cyl(x, y, z, r, h, c, rot, kind = 'cyl') { this.push(kind, [x, y, z], [r, h, r], c, rot); }
  build(parent) {
    const o = new THREE.Object3D();
    for (const [kind, list] of Object.entries(this.items)) {
      const [g, m] = KIND[kind];
      const mesh = new THREE.InstancedMesh(G[g], M[m], list.length);
      list.forEach(([p, s, c, r], i) => {
        o.position.set(...p); o.scale.set(...s); o.rotation.set(...(r || [0, 0, 0])); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c instanceof THREE.Color ? c : new THREE.Color(c));
      });
      mesh.castShadow = !/^win|lamp/.test(kind); mesh.receiveShadow = true; mesh.frustumCulled = false;
      parent.add(mesh);
    }
    return parent;
  }
}

/* ---------- palette ---------- */
const C = {
  rock: '#a59d91', rockDark: '#8a8277', pave: '#cfc0a2', sand: '#d2b07a', soil: '#8a5a3c', bed: '#6e6157',
  topsoil: '#5d4230', subsoil: '#a8784e', vine: '#5f8a3c', vineDark: '#47702f', grape: '#4b2340', terra: '#b9603a',
  shutter: '#4f7d5b', bloom: ['#c23b7a', '#d94f8f', '#a8326a', '#e06aa0'], green: '#557f3d', wood: '#9a6b42', steel: '#c9d1d4',
};

/* ---------- builders ---------- */
function house(k, { x, z, w, d, base, floors, color, bloom, seed }) {
  const r = rng(seed), fh = 1.05, h = floors * fh + .25, top = base + h;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  k.box(x0, x1, base, top, z0, z1, jit(color, .015));
  k.box(x0 - .02, x1 + .02, base, base + .3, z0 - .02, z1 + .02, col(color, -.12));
  k.box(x0 - .05, x1 + .05, top - .1, top + .03, z0 - .05, z1 + .05, col(color, .07));
  const ov = .2, rh = Math.min(w, d) * .3;
  if (w >= d) k.push('roof', [x, top + .03, z], [d + ov * 2, rh, w + ov * 2], jit(C.terra, .05), [0, PI / 2, 0]);
  else k.push('roof', [x, top + .03, z], [w + ov * 2, rh, d + ov * 2], jit(C.terra, .05));
  if (r() < .8) k.box(x1 - .6, x1 - .3, top, top + rh + .35, z - .15, z + .15, col(color, -.05));
  const cols = Math.max(2, Math.floor(w / .78)), step = w / cols, door = Math.floor(cols / 2);
  const sh = jit(C.shutter, .04);
  for (let f = 0; f < floors; f++) {
    const wy = base + .32 + f * fh + .5;
    for (let c = 0; c < cols; c++) {
      const wx = x0 + step * (c + .5);
      if (f === 0 && c === door) { k.box(wx - .2, wx + .2, base + .02, base + .82, z1, z1 + .04, r() < .5 ? '#3f5f4b' : '#6a4630'); continue; }
      k.box(wx - .15, wx + .15, wy - .23, wy + .23, z1, z1 + .03, '#40494c', r() < .5 ? 'winLit' : 'winDark');
      if (r() < .18) k.box(wx - .17, wx + .17, wy - .25, wy + .25, z1, z1 + .05, sh);
      else { k.box(wx - .32, wx - .17, wy - .25, wy + .25, z1, z1 + .045, sh); k.box(wx + .17, wx + .32, wy - .25, wy + .25, z1, z1 + .045, sh); }
      k.box(wx - .2, wx + .2, wy - .29, wy - .25, z1, z1 + .09, '#ece3d1');
      if (r() < .22) { k.box(wx - .18, wx + .18, wy - .38, wy - .29, z1 + .02, z1 + .14, C.terra); for (let i = 0; i < 3; i++) k.ball(wx - .12 + i * .12, wy - .27, z1 + .1, .07, C.bloom[i % 4]); }
    }
    if (f > 0 && r() < .3) {
      k.box(x0 + .15, x1 - .15, wy - .44, wy - .38, z1, z1 + .38, '#d9cfbb');
      k.box(x0 + .15, x1 - .15, wy - .38, wy - .12, z1 + .35, z1 + .38, '#3e3d39');
      for (let i = 0; i < 4; i++) k.ball(x0 + .3 + r() * (w - .6), wy - .3, z1 + .26, .09 + r() * .05, r() < .5 ? C.bloom[i % 4] : C.green);
    }
    for (const sx of [x0, x1]) {
      if (r() < .45) continue;
      const nz = Math.max(1, Math.floor(d / 1.1));
      for (let c = 0; c < nz; c++) {
        const wz = z0 + (d / nz) * (c + .5), s = sx === x1 ? 1 : -1;
        k.box(sx + s * .0, sx + s * .03, wy - .23, wy + .23, wz - .15, wz + .15, '#40494c', r() < .45 ? 'winLit' : 'winDark');
        k.box(sx, sx + s * .045, wy - .25, wy + .25, wz - .32, wz - .17, sh); k.box(sx, sx + s * .045, wy - .25, wy + .25, wz + .17, wz + .32, sh);
      }
    }
  }
  if (bloom) {
    const bx = bloom > 0 ? x1 - .25 : x0 + .25;
    for (let i = 0; i < 14; i++) k.ball(bx + (r() - .5) * .5, base + .3 + i * .19 + r() * .1, z1 + .12 + r() * .12, .13 + r() * .1, i % 4 === 3 ? C.green : C.bloom[i % 4]);
  }
  return top;
}

function vineRow(kFor, z, top, x0, x1) {
  for (let x = x0; x <= x1 + 1e-6; x += .6) {
    const k = kFor(x);
    k.cyl(x, top + .25, z, .035, .5, '#5b4128');
    k.ball(x, top + .66, z, .3, jit(C.vine, .06), .7);
    k.ball(x + .18, top + .58, z + .05, .2, jit(C.vineDark, .05), .8);
    k.ball(x - .08, top + .44, z + .14, .06, C.grape); k.ball(x + .1, top + .44, z + .13, .055, C.grape);
  }
  for (const px of [x0 - .3, x1 + .3]) kFor(px).cyl(px, top + .45, z, .04, .9, '#7d6a55');
  // drip line + emitters (infrastructure, always there)
  const kL = kFor(x0), kR = kFor(x1), split = kL !== kR;
  const mid = split ? 6 : x1 + .3;
  if (split) { kL.box(x0 - .3, 6, top + .02, top + .06, z + .12, z + .16, '#26292b'); kR.box(6, x1 + .3, top + .02, top + .06, z + .12, z + .16, '#26292b'); }
  else kL.box(x0 - .3, x1 + .3, top + .02, top + .06, z + .12, z + .16, '#26292b');
  kL.box(x0 - .3, mid, top + .54, top + .56, z - .01, z + .01, '#3a3a36');
  if (split) kR.box(6, x1 + .3, top + .54, top + .56, z - .01, z + .01, '#3a3a36');
}

function rocksAlong(k, axis, fixed, a0, a1, y0, y1, n, scale = 1) {
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, R()), y = lerp(y0, y1, R()), s = (.35 + R() * .5) * scale;
    const p = axis === 'x' ? [a, y, fixed + (R() - .3) * .25] : [fixed + (R() - .3) * .25, y, a];
    k.push('rock', p, [s * (1 + R() * .5), s * (.7 + R() * .4), s], jit(R() < .5 ? C.rock : C.rockDark, .05), [R() * 3, R() * 3, R() * 3]);
  }
}

function makeBoat(color, stripe) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, 0); shape.quadraticCurveTo(-.85, .44, 0, .46); shape.quadraticCurveTo(.85, .44, 1.1, 0);
  shape.quadraticCurveTo(.85, -.44, 0, -.46); shape.quadraticCurveTo(-.85, -.44, -1.1, 0);
  const hull = new THREE.ExtrudeGeometry(shape, { depth: .32, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 2, curveSegments: 10 });
  hull.rotateX(-PI / 2);
  const mk = (geo, c, sy = 1, sxz = 1, y = 0) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: .7 })); m.scale.set(sxz, sy, sxz); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  mk(hull, color);
  mk(hull, stripe, .22, 1.025, .2);
  mk(hull, '#a3774e', .08, .84, .36);
  for (const x of [-.45, .35]) { const s = new THREE.Mesh(G.box, M.std); s.scale.set(.16, .05, .78); s.position.set(x, .43, 0); s.castShadow = true; g.add(s); }
  return g;
}

function person(shirt, { hat, skin = '#d8a27c', pants = '#3b3a44' } = {}) {
  const g = new THREE.Group();
  const part = (geo, c, s, p, parent = g) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: .85 })); m.scale.set(...s); m.position.set(...p); m.castShadow = true; parent.add(m); return m; };
  const limb = (x, y, c, len) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); g.add(pv); part(G.box, c, [.07, len, .08], [0, -len / 2, 0], pv); return pv; };
  const legL = limb(-.065, .33, pants, .33), legR = limb(.065, .33, pants, .33);
  part(G.box, shirt, [.25, .33, .16], [0, .5, 0]);
  part(G.ball, skin, [.1, .11, .1], [0, .77, 0]);
  if (hat) part(G.cone, '#d9bf7f', [.17, .1, .17], [0, .88, 0]);
  const armL = limb(-.16, .65, shirt, .28), armR = limb(.16, .65, shirt, .28);
  g.scale.setScalar(1.15);
  return { g, legL, legR, armL, armR };
}
const STAIRS = [[1.3, 1.05, .6], [1.3, 1.05, .1], [1.3, 3.05, -1.5], [1.3, 3.05, -2.9], [1.3, 5.05, -4.5], [1.3, 5.05, -5.9], [1.3, 7.05, -7.5], [1.3, 7.05, -7.9]];
function along(pts, f, out) { // constant-speed position along a polyline, f in 0..1
  const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); L.push(d); tot += d; }
  let s = f * tot, i = 0; while (i < L.length - 1 && s > L[i]) s -= L[i++];
  const u = Math.min(1, s / L[i]), a = pts[i], b = pts[i + 1]; return out.set(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
}
const walkPose = (p, t, amp = .6) => { const s = Math.sin(t) * amp; p.legL.rotation.x = s; p.legR.rotation.x = -s; p.armL.rotation.x = -s * .8; p.armR.rotation.x = s * .8; };

/* ---------- the village ---------- */
function buildWorld(scene) {
  const k = new Kit(), slab = new THREE.Group(), ks = new Kit();
  const kFor = x => (x >= 6 ? ks : k);
  const dyn = {};

  // strata under everything (the cutaway block)
  k.box(-10, 10, -3, -2.1, -10, 10, C.bed);
  k.box(-10, 10, -2.1, -1.25, -10, 10, C.soil);
  k.box(-10, 10, -1.25, -.9, -10, 10, C.sand);
  for (let i = 0; i < 70; i++) { const x = lerp(-9.8, 9.8, R()), z = R() < .5 ? 10 : -10; k.push('rock', [x, lerp(-2.9, -1.4, R()), z], [.12 + R() * .15, .1, .08], jit('#9b8a76', .08), [R(), R(), R()]); }
  for (let i = 0; i < 40; i++) { const z = lerp(-9.8, 9.8, R()); k.push('rock', [10, lerp(-2.9, -1.4, R()), z], [.08, .1, .12 + R() * .15], jit('#9b8a76', .08), [R(), R(), R()]); }

  // terraces: quay A, B (houses + cantina yard), C (houses + vines), D (houses + vines)
  k.box(-10, 10, -.9, 1, -1.5, 1.5, C.rock); k.box(-10, 10, 1, 1.05, -1.5, 1.5, C.pave);
  k.box(-10, 10, -.9, 3, -4.5, -1.5, C.rock); k.box(-10, 2, 3, 3.05, -4.5, -1.5, C.pave); k.box(2, 10, 3, 3.04, -4.5, -1.5, '#d8c9ab');
  k.box(-10, 2, -.9, 5, -7.5, -4.5, C.rock); k.box(-10, 2, 5, 5.05, -7.5, -4.5, C.pave);
  k.box(2, 10, -.9, 4.5, -7.5, -4.5, C.rock); k.box(2, 10, 4.5, 4.62, -7.5, -4.5, C.subsoil); k.box(2, 10, 4.62, 5, -7.5, -4.5, C.topsoil);
  k.box(-10, 2, -.9, 7, -10, -7.5, C.rock); k.box(-10, 2, 7, 7.05, -10, -7.5, C.pave);
  // D vines: layered so the cut face reads as strata (static half x2..6, sliding slab x6..10)
  for (const [kk, a, b] of [[k, 2, 6], [ks, 6, 10]]) {
    kk.box(a, b, -.9, 4.6, -10, -7.5, C.rock);
    kk.box(a, b, 4.6, 6.2, -10, -7.5, C.subsoil);
    kk.box(a, b, 6.2, 7, -10, -7.5, C.topsoil);
    for (let i = 0; i < 26; i++) kk.push('rock', [lerp(a + .2, b - .2, R()), lerp(4.7, 6.1, R()), R() < .5 ? -7.5 : -10], [.12 + R() * .12, .1, .1], jit('#bfa98a', .06), [R(), R(), R()]);
  }
  for (let i = 0; i < 16; i++) ks.push('rock', [10, lerp(4.7, 6.1, R()), lerp(-9.8, -7.7, R())], [.1, .1, .12 + R() * .12], jit('#bfa98a', .06), [R(), R(), R()]);
  // roots on the inner cut face (visible once the slab slides out)
  for (const z of [-8.1, -8.9, -9.6]) {
    k.box(5.95, 6.04, 4.2, 6.95, z - .03, z + .03, '#e2cfa8');
    for (let i = 0; i < 5; i++) { const y = lerp(4.5, 6.6, R()), L = .4 + R() * .5, s = R() < .5 ? -1 : 1; k.push('box', [6.0, y, z + s * L * .35], [.08, .035, L], '#d9c39a', [s * (.6 + R() * .4), 0, 0]); }
  }

  // cliff faces
  rocksAlong(k, 'x', 1.55, -10, 2.7, -.7, .8, 40); rocksAlong(k, 'x', 1.55, 4.9, 10, -.7, .8, 22);
  rocksAlong(k, 'x', -1.45, 2, 10, 1.1, 2.9, 26, .75);
  rocksAlong(k, 'x', -7.45, -10, .7, 5.1, 6.9, 16, .8);
  rocksAlong(k, 'z', 10.05, -7.5, 1.5, -.5, 2.8, 34, .7); rocksAlong(k, 'z', 10.05, -7.4, -4.6, 3, 4.6, 10, .8);
  rocksAlong(k, 'z', -10.05, -10, 1.5, -.5, 2.8, 26); rocksAlong(k, 'z', -10.05, -10, -1.5, 3, 6.5, 16);
  // dry-stone walls on vine terraces
  for (let x = 2.1; x < 10; x += .32) { k.push('rock', [x, 4.85, -4.47], [.18, .14, .1], jit('#a69e92', .06), [R(), R(), R()]); kFor(x).push('rock', [x, 6.9, -7.47], [.18, .14, .1], jit('#a69e92', .06), [R(), R(), R()]); }

  // seabed
  for (let i = 0; i < 46; i++) k.push('rock', [lerp(-9.6, 9.6, R()), -.85, lerp(2, 9.6, R())], [.15 + R() * .35, .12 + R() * .2, .15 + R() * .3], jit('#a99a84', .08), [R(), R(), R()]);
  for (let i = 0; i < 60; i++) { const x = lerp(-9.6, 9.6, R()), z = lerp(2, 9.6, R()), h = .2 + R() * .45; k.cyl(x, -.9 + h / 2, z, .025, h, jit('#4d7a4a', .08), [(R() - .5) * .4, 0, (R() - .5) * .4]); }

  // stairs between levels (x .8..1.8)
  for (const [y0, y1, zs] of [[1, 3, .1], [3, 5, -2.9], [5, 7, -5.9]]) {
    const n = 8, dz = 1.6 / n;
    for (let i = 0; i < n; i++) k.box(.8, 1.8, y0, y0 + (i + 1) * (y1 - y0) / n, zs - (i + 1) * dz, zs - i * dz, jit('#c9b99b', .03));
    k.box(1.8, 1.9, y0, y1 + .25, zs - 1.6, zs, '#b3a58c');
  }

  // houses (left side, stepping up the hill)
  const H = [
    { x: -8.65, z: -3.1, w: 2.6, d: 2.6, base: 3, floors: 3, color: '#e3a07a', bloom: 1 },
    { x: -6.0, z: -3.0, w: 2.5, d: 2.8, base: 3, floors: 4, color: '#e8c27c' },
    { x: -3.45, z: -3.1, w: 2.4, d: 2.6, base: 3, floors: 3, color: '#a9b8c9', bloom: -1 },
    { x: -.95, z: -3.0, w: 2.3, d: 2.8, base: 3, floors: 4, color: '#efc98f' },
    { x: -8.1, z: -6.1, w: 3.2, d: 2.6, base: 5, floors: 4, color: '#f0d39a' },
    { x: -4.8, z: -6.0, w: 2.9, d: 2.8, base: 5, floors: 5, color: '#e7a98c', bloom: 1 },
    { x: -1.65, z: -6.1, w: 2.6, d: 2.6, base: 5, floors: 3, color: '#9fb0c2' },
    { x: -7.3, z: -8.85, w: 3.0, d: 2.2, base: 7, floors: 4, color: '#e2b47a' },
    { x: -3.7, z: -8.85, w: 3.4, d: 2.2, base: 7, floors: 5, color: '#e59a7c' },
    { x: -.35, z: -8.85, w: 2.5, d: 2.2, base: 7, floors: 3, color: '#f2dcae', bloom: 1 },
  ];
  H.forEach((h, i) => house(k, { ...h, seed: 100 + i * 17 }));

  // umbrella pines + a cypress
  const pine = (x, y, z, s = 1) => {
    k.cyl(x, y + 1.1 * s, z, .1 * s, 2.2 * s, '#6b4b33', [.12, 0, -.1]);
    for (let i = 0; i < 5; i++) k.ball(x + (R() - .5) * 1.3 * s + .2, y + 2.3 * s + R() * .3, z + (R() - .5) * 1.1 * s, (.55 + R() * .3) * s, jit('#4c6b3c', .05), .45);
  };
  pine(-9.2, 7, -9.3, 1.1); pine(1.4, 7, -9.5, .95); pine(9.4, 3, -2.0, .8);
  k.push('cone', [-9.6, 2.4, -1.15], [.32, 2.7, .32], '#3f5e36'); k.cyl(-9.6, 1.2, -1.15, .06, .4, '#6b4b33');

  // ---- cantina yard: five making lanes, each behind its own door ----
  dyn.doors = {}; dyn.glow = {};
  Object.entries(LANE_X).forEach(([lane, c]) => {
    const lc = LANES[lane].color;
    k.box(c - .7, c + .7, 3.04, 3.06, -4.45, -2.2, col(lc, .18));
    k.box(c + .78, c + .82, 3.04, 3.3, -4.45, -2.6, '#b8aa90');
    k.box(c - .5, c + .5, 3, 4.5, -4.53, -4.4, '#ddd0b6');
    k.box(c - .38, c + .38, 3, 4.32, -4.47, -4.39, '#2b201a');
    k.cyl(c, 4.75, -4.38, .17, .05, lc, [PI / 2, 0, 0]);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(.7, 1.25), new THREE.MeshBasicMaterial({ color: col(lc, .1), transparent: true, opacity: 0 }));
    glow.position.set(c, 3.66, -4.385); scene.add(glow); dyn.glow[lane] = glow;
    const pivot = new THREE.Group(); pivot.position.set(c - .38, 3, -4.36);
    const panel = new THREE.Mesh(G.box, new THREE.MeshStandardMaterial({ color: lc, roughness: .7 }));
    panel.scale.set(.76, 1.3, .06); panel.position.set(.38, .65, 0); panel.castShadow = true; pivot.add(panel);
    const knob = new THREE.Mesh(G.ball, M.metal); knob.scale.setScalar(.035); knob.position.set(.66, .62, .05); pivot.add(knob);
    scene.add(pivot); dyn.doors[lane] = pivot;
  });
  { // white: basket press + small steel tank
    const c = LANE_X.white;
    k.cyl(c - .25, 3.3, -3.4, .3, .5, '#b58a5a'); for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; k.box(c - .25 + Math.cos(a) * .3 - .02, c - .25 + Math.cos(a) * .3 + .02, 3.05, 3.56, -3.4 + Math.sin(a) * .3 - .02, -3.4 + Math.sin(a) * .3 + .02, '#7b5534'); }
    k.cyl(c - .25, 3.6, -3.4, .32, .06, '#6f4a2c'); k.cyl(c - .25, 3.95, -3.4, .03, .7, '#55565a', null, 'metal');
    k.cyl(c + .38, 3.5, -3.9, .2, .9, C.steel, null, 'metal'); k.push('cone', [c + .38, 4.02, -3.9], [.2, .14, .2], '#b9c1c4');
  }
  { const c = LANE_X.rose; for (const [dx, dz] of [[-.28, -3.8], [.28, -3.5]]) { k.cyl(c + dx, 3.55, dz, .2, 1, C.steel, null, 'metal'); k.cyl(c + dx, 3.7, dz, .205, .12, '#e49a9a'); k.push('cone', [c + dx, 4.1, dz], [.2, .12, .2], '#b9c1c4'); } }
  { const c = LANE_X.red; k.cyl(c, 3.33, -3.65, .45, .6, '#8a5a36'); k.cyl(c, 3.335, -3.65, .46, .07, '#4b4b4b'); k.cyl(c, 3.62, -3.65, .42, .04, '#4a1622'); }
  { const c = LANE_X.sparkling;
    for (const s of [-1, 1]) { k.push('box', [c, 3.5, -3.55 + s * .17], [1.0, .95, .06], '#a07a50', [s * .32, 0, 0]);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const y = 3.2 + j * .27; k.ball(c - .36 + i * .24, y, -3.55 + s * .23 + (y - 3.5) * Math.sin(s * .32), .045, '#22402c'); } }
  }
  { const c = LANE_X.fortified;
    [[3, 3.22], [2, 3.62], [1, 4.02]].forEach(([n, y]) => { for (let i = 0; i < n; i++) { const x = c + (i - (n - 1) / 2) * .42; k.cyl(x, y, -3.7, .2, .5, '#7b4a2a', [PI / 2, 0, 0]); k.cyl(x, y, -3.7, .205, .05, '#3d3a36', [PI / 2, 0, 0]); } });
    k.cyl(c - .5, 3.25, -2.8, .1, .38, '#c7a15a');
  }
  // yard lamp
  k.cyl(5.3, 3.75, -2.1, .03, 1.5, '#2f2f2c'); k.push('lamp', [5.3, 4.55, -2.1], [.11, .11, .11], '#fff');
  k.cyl(9.4, 3.35, -2.25, .32, .7, '#b9c6c3'); // yard cistern

  // ---- quay: café terrace, crates, rinse corner ----
  k.box(-9.7, -5, 1.05, 1.1, -1.4, 1.4, '#c98b6b');
  for (let x = -9.6; x < -5; x += .5) k.ball(x, 1.25, 1.35, .14 + R() * .06, R() < .6 ? C.bloom[Math.floor(R() * 4)] : C.green);
  const table = (x, z, umbrella) => {
    k.cyl(x, 1.45, z, .04, .7, '#3a3733'); k.cyl(x, 1.8, z, .42, .05, '#f3eee4');
    for (const [dx, dz] of [[-.55, 0], [.55, 0], [0, -.55]]) { k.box(x + dx - .13, x + dx + .13, 1.1, 1.5, z + dz - .13, z + dz + .13, '#2f5b52'); k.box(x + dx - .13, x + dx + .13, 1.5, 1.8, z + dz - .14, z + dz - .1, '#2f5b52'); }
    if (umbrella) { k.cyl(x, 2.3, z, .03, 1.5, '#f3eee4'); k.push('cone', [x, 3.05, z], [.95, .45, .95], '#f7f2e8'); k.push('cone', [x, 2.95, z], [.97, .18, .97], '#914C2C'); }
  };
  table(-8.6, .35, true); table(-8.3, -.85, true); table(-6.6, .5, false); table(-6.75, -.9, true);
  k.cyl(-5.4, 1.9, -1.2, .03, 1.7, '#2f2f2c'); k.push('lamp', [-5.4, 2.8, -1.2], [.11, .11, .11], '#fff');
  // bollards + crates + barrels near the quay edge
  for (const x of [-3.5, -.5, 2.5, 6, 9]) k.cyl(x, 1.25, 1.25, .12, .4, '#3d3b38');
  for (const [x, z] of [[2.6, -.9], [3.0, -.9], [2.8, -1.2]]) k.cyl(x, 1.33, z, .17, .55, '#7b4a2a');
  // rinse corner: trough + settling tank
  k.box(7.6, 8.6, 1.05, 1.38, -1.25, -.7, '#9a948a'); k.box(7.65, 8.55, 1.3, 1.34, -1.2, -.75, '#7fbcc0');
  k.cyl(9.2, 1.6, -.9, .45, 1.1, '#b9c6c3', null, 'metal'); k.push('cone', [9.2, 2.25, -.9], [.45, .2, .45], '#9fb0b0');
  // pier (L)
  k.box(3, 4.6, -.9, .95, 1.5, 7, '#b5a68b'); k.box(4.6, 9.3, -.9, .95, 5.6, 7, '#b5a68b');
  k.box(3, 4.6, .95, 1.0, 1.5, 7, '#cbbd9f'); k.box(4.6, 9.3, .95, 1.0, 5.6, 7, '#cbbd9f');
  for (const [x, z] of [[3.15, 3], [4.45, 4.5], [6, 6.85], [8, 6.85], [9.15, 5.75]]) k.cyl(x, 1.15, z, .1, .3, '#3d3b38');
  for (let i = 0; i < 5; i++) k.box(4.6, 4.66, .2 + i * .18, .23 + i * .18, 3.6, 4.0, '#6b5a45');
  k.cyl(4.4, 1.85, 6.75, .03, 1.7, '#2f2f2c'); k.push('lamp', [4.4, 2.75, 6.75], [.11, .11, .11], '#fff');
  for (const [x, z] of [[3.05, 2.6], [4.55, 3.0], [5.6, 7.05], [7.6, 7.05]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(.17, .06, 6, 14), M.std); t.material = new THREE.MeshStandardMaterial({ color: '#222', roughness: .9 }); t.position.set(x, .7, z); t.rotation.y = Math.abs(x - 3.05) < .1 || Math.abs(x - 4.55) < .1 ? PI / 2 : 0; scene.add(t); }

  // laundry lines
  dyn.laundry = [];
  const line = (xa, xb, y, z) => {
    k.box(xa, xb, y - .01, y + .01, z - .01, z + .01, '#efe8dc');
    for (let x = xa + .3; x < xb - .2; x += .42) {
      const p = new THREE.Group(); p.position.set(x, y, z);
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(.28, .36), new THREE.MeshStandardMaterial({ color: ['#f4f1ea', '#9fc3d6', '#e7b3a3', '#d8e6da', '#e9d58f'][Math.floor(R() * 5)], side: THREE.DoubleSide, roughness: .9 }));
      cl.position.y = -.2; cl.castShadow = true; p.add(cl); scene.add(p); dyn.laundry.push(p);
    }
  };
  line(-9.7, -4.8, 5.9, -1.55); line(-6.4, -3.1, 8.5, -4.55); line(-5.2, -.8, 10.6, -7.6);

  // vines on C and D (rows follow the terraces)
  for (const z of [-5.25, -6.15, -7.0]) vineRow(() => k, z, 5, 2.5, 9.7);
  for (const z of [-8.1, -8.9, -9.6]) vineRow(kFor, z, 7, 2.5, 9.7);

  // drip effects (wet patches at each vine foot)
  dyn.dripA = new Kit(); dyn.dripB = new Kit();
  for (const [z, top] of [[-5.25, 5], [-6.15, 5], [-7.0, 5], [-8.1, 7], [-8.9, 7], [-9.6, 7]])
    for (let x = 2.5; x <= 9.71; x += .6) { const kk = x >= 6 && top === 7 ? dyn.dripB : dyn.dripA; kk.cyl(x, top + .015, z + .12, .3, .025, '#2e2620'); kk.ball(x + .12, top + .1, z + .16, .05, '#8fe0f0'); kk.ball(x - .1, top + .07, z + .16, .04, '#8fe0f0'); }
  const dripA = dyn.dripA.build(new THREE.Group()), dripB = dyn.dripB.build(new THREE.Group());
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#2c1d14', transparent: true, opacity: .55 }));
  bulb.scale.set(.5, .7, 1); bulb.rotation.y = PI / 2; bulb.position.set(6.06, 6.4, -8.9); dripA.add(bulb);
  dripA.visible = dripB.visible = false; scene.add(dripA); slab.add(dripB);
  dyn.drip = [dripA, dripB];

  // Equip-grade cues: auger on the soil terrace, picking bins, lab bench, barrel workbench.
  k.cyl(7.25, 7.48, -8.25, .028, .95, '#3e4246', null, 'metal');
  k.box(6.95, 7.55, 7.9, 7.98, -8.32, -8.18, '#914C2C');
  k.box(3.15, 3.55, 5.05, 5.32, -5.55, -5.2, '#b88a55');
  k.box(3.6, 4.0, 5.05, 5.28, -6.3, -5.95, '#a97a47');
  k.box(7.5, 8.75, 3.04, 3.5, -2.15, -1.58, '#efe6d4');
  k.cyl(7.75, 3.64, -1.85, .07, .24, '#d8e6da', null, 'metal');
  k.cyl(8.05, 3.62, -1.78, .055, .18, '#f3e0d8', null, 'metal');
  k.box(8.3, 8.58, 3.5, 3.58, -2.05, -1.7, '#fffaf1');
  k.box(3.2, 4.45, 3.04, 3.46, -2.2, -1.58, '#8a5a36');
  k.cyl(3.55, 3.66, -1.88, .16, .46, '#7b4a2a', [PI / 2, 0, 0]);
  k.box(3.95, 4.28, 3.46, 3.54, -2.05, -1.72, '#c4a574');

  k.build(scene); ks.build(slab); scene.add(slab); dyn.slab = slab;

  // water: glass-like box + a moving surface
  const water = new THREE.Mesh(new THREE.BoxGeometry(20, 1.42, 8.5), new THREE.MeshStandardMaterial({ color: '#2e9a96', transparent: true, opacity: .38, roughness: .08, depthWrite: false }));
  water.position.set(0, -.18, 5.75); water.renderOrder = 2; scene.add(water);
  const surfGeo = new THREE.PlaneGeometry(20, 8.5, 48, 20); surfGeo.rotateX(-PI / 2);
  const surf = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({ color: '#58bcb2', transparent: true, opacity: .55, roughness: .06, metalness: .15, depthWrite: false }));
  surf.position.set(0, .54, 5.75); surf.receiveShadow = true; surf.renderOrder = 3; scene.add(surf);
  dyn.surf = surf; dyn.surfBase = Float32Array.from(surfGeo.attributes.position.array); dyn.waterMats = [water.material, surf.material];

  // boats
  dyn.boats = [];
  for (const [x, z, ry, c, s] of [[1.4, 3.2, .35, '#f4f1ea', '#2f6f9f'], [-2.6, 4.7, -.25, '#f4f1ea', '#914C2C'], [5.45, 3.6, PI / 2, '#eae4d6', '#1A5552'], [1.6, 7.2, .9, '#f4f1ea', '#2f6f9f'], [-6.8, 6.4, .4, '#efe9dc', '#3c7aa8'], [8.3, 8.05, 0, '#f6f2ea', '#1A5552'], [-3.6, 8.3, -.5, '#f4f1ea', '#914C2C']]) {
    const b = makeBoat(c, s); b.position.set(x, .3, z); b.rotation.y = ry; scene.add(b); dyn.boats.push({ b, ph: R() * 6 });
  }
  dyn.caseBoat = dyn.boats[5].b;
  // buoys
  dyn.buoys = [];
  for (const [x, z] of [[0, 8.9], [-4.3, 3.1], [7, 4.4], [-8.2, 8.3], [2.6, 5.2], [-1, 6], [6.4, 9.4]]) {
    const m = new THREE.Mesh(G.ball, new THREE.MeshStandardMaterial({ color: '#f08a2c', roughness: .6 })); m.scale.setScalar(.13); m.position.set(x, .58, z); m.castShadow = true; scene.add(m); dyn.buoys.push({ m, ph: R() * 6 });
  }

  // cases (move between quay and boat)
  dyn.cases = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(G.box, new THREE.MeshStandardMaterial({ color: i % 3 ? '#b88a55' : '#a97a47', roughness: .9 })); m.scale.set(.38, .26, .3); m.castShadow = true; scene.add(m);
    const qa = new THREE.Vector3(6.25 + (i % 2) * .42, 1.18 + Math.floor(i / 4) * .27, -.25 + (Math.floor(i / 2) % 2) * .34);
    const bo = new THREE.Vector3((i % 4 - 1.5) * .4, .55 + Math.floor(i / 4) * .27, ((i % 2) - .5) * .32);
    m.position.copy(qa); dyn.cases.push({ m, qa, bo });
  }

  // rinse loop: spill (off) vs. pipe loop (on)
  const spill = new THREE.Group();
  const sm = new THREE.MeshStandardMaterial({ color: '#7fb9c4', transparent: true, opacity: .8, roughness: .2 });
  const s1 = new THREE.Mesh(G.box, sm); s1.scale.set(.2, .03, 2.25); s1.position.set(8.1, 1.075, .38); spill.add(s1);
  const s2 = new THREE.Mesh(G.box, sm); s2.scale.set(.2, .5, .04); s2.position.set(8.1, .8, 1.53); spill.add(s2);
  const plume = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: '#8a7a5a', transparent: true, opacity: .45, depthWrite: false }));
  plume.rotation.x = -PI / 2; plume.scale.set(1.1, .7, 1); plume.position.set(8.1, .565, 2.4); spill.add(plume);
  scene.add(spill);
  const curve = new THREE.CatmullRomCurve3([[8.6, 1.3, -.95], [8.9, 1.5, -.95], [9.2, 2.3, -.9], [9.7, 2.6, -1.3], [9.75, 3.3, -1.6], [9.4, 3.7, -2.25]].map(p => new THREE.Vector3(...p)));
  const loop = new THREE.Group();
  loop.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .05, 8), new THREE.MeshStandardMaterial({ color: '#1A5552', roughness: .4 })));
  const flows = [];
  for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(G.ball, new THREE.MeshBasicMaterial({ color: '#bfeef2' })); f.scale.setScalar(.06); loop.add(f); flows.push(f); }
  loop.visible = false; scene.add(loop);
  dyn.rinse = { spill, loop, flows, curve };

  // table glasses: water first, then wine
  const glassMat = new THREE.MeshStandardMaterial({ color: '#e9f4f6', transparent: true, opacity: .35, roughness: .05, depthWrite: false });
  const wg = new THREE.Mesh(new THREE.CylinderGeometry(.075, .065, .24, 16, 1, true), glassMat); wg.position.set(-6.82, 1.95, .55); scene.add(wg);
  const wf = new THREE.Mesh(new THREE.CylinderGeometry(.068, .06, .2, 16), new THREE.MeshStandardMaterial({ color: '#9fd8e6', transparent: true, opacity: .8 })); wf.geometry.translate(0, .1, 0); wf.position.set(-6.82, 1.84, .55); wf.scale.y = .01; scene.add(wf);
  const stem = new THREE.Mesh(G.cyl, glassMat); stem.scale.set(.012, .14, .012); stem.position.set(-6.42, 1.9, .45); scene.add(stem);
  const foot = new THREE.Mesh(G.cyl, glassMat); foot.scale.set(.06, .01, .06); foot.position.set(-6.42, 1.83, .45); scene.add(foot);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(.1, 16, 10, 0, PI * 2, PI / 2, PI / 2), glassMat); bowl.position.set(-6.42, 2.07, .45); bowl.rotation.x = PI; bowl.scale.y = -1; scene.add(bowl);
  const wine = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 8, 0, PI * 2, PI / 2, PI / 2), new THREE.MeshStandardMaterial({ color: '#6a1428', roughness: .2 })); wine.position.set(-6.42, 2.07, .45); wine.scale.setScalar(.01); scene.add(wine);
  const bottle = new THREE.Group(); { const bm = new THREE.MeshStandardMaterial({ color: '#23402e', roughness: .3 }); const b1 = new THREE.Mesh(G.cyl, bm); b1.scale.set(.06, .24, .06); b1.position.y = .12; const b2 = new THREE.Mesh(G.cyl, bm); b2.scale.set(.022, .12, .022); b2.position.y = .3; bottle.add(b1, b2); }
  bottle.position.set(-6.45, 1.83, .6); bottle.visible = false; scene.add(bottle);
  const carafe = new THREE.Mesh(G.cyl, glassMat); carafe.scale.set(.07, .22, .07); carafe.position.set(-6.55, 1.94, .3); scene.add(carafe);
  { const set = new THREE.Group(), ctr = new THREE.Vector3(-6.6, 1.83, .5); set.position.copy(ctr); set.scale.setScalar(1.7); scene.add(set);
    for (const m of [wg, wf, stem, foot, bowl, wine, bottle, carafe]) { m.position.sub(ctr); set.add(m); } }
  dyn.pour = { wf, wine, bottle };

  // lamps (night)
  dyn.lamps = [[-5.4, 2.7, -1.0], [5.3, 4.4, -1.9], [4.4, 2.6, 6.6]].map(p => { const l = new THREE.PointLight('#ffc27a', 0, 9, 1.4); l.position.set(...p); scene.add(l); return l; });

  // birds
  dyn.birds = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group(), wm = new THREE.MeshBasicMaterial({ color: '#4a3f3a', side: THREE.DoubleSide });
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(.45, .14), wm); wl.position.x = -.22; const wlP = new THREE.Group(); wlP.add(wl);
    const wr = new THREE.Mesh(new THREE.PlaneGeometry(.45, .14), wm); wr.position.x = .22; const wrP = new THREE.Group(); wrP.add(wr);
    wlP.rotation.x = wrP.rotation.x = -PI / 2; b.add(wlP, wrP); scene.add(b);
    dyn.birds.push({ b, wlP, wrP, r: 9 + R() * 6, h: 13 + R() * 3, sp: .18 + R() * .1, ph: R() * 6 });
  }

  // people with small jobs
  const P = {};
  P.picker = person('#1A5552', { hat: true }); scene.add(P.picker.g);
  { const bk = new THREE.Mesh(G.cyl, new THREE.MeshStandardMaterial({ color: '#b98a4f' })); bk.scale.set(.12, .12, .12); bk.position.set(0, -.3, .06); P.picker.armR.add(bk); P.picker.basket = bk;
    const gr = new THREE.Mesh(G.ball, new THREE.MeshStandardMaterial({ color: C.grape })); gr.scale.set(.1, .05, .1); gr.position.set(0, .06, 0); bk.add(gr); }
  P.docker = person('#914C2C'); scene.add(P.docker.g);
  { const cr = new THREE.Mesh(G.box, new THREE.MeshStandardMaterial({ color: '#b88a55' })); cr.scale.set(.3, .2, .24); cr.position.set(0, .62, .22); P.docker.g.add(cr); P.docker.crate = cr; }
  P.host = person('#f2ede2', { pants: '#2b2b30' }); scene.add(P.host.g);
  { const tray = new THREE.Mesh(G.cyl, M.metal); tray.scale.set(.14, .015, .14); tray.position.set(0, -.28, .1); P.host.armR.add(tray); }
  P.cellar = person('#817985'); scene.add(P.cellar.g); P.cellar.g.position.set(LANE_X.red + .62, 3.04, -3.35); P.cellar.g.rotation.y = -PI / 2;
  { const pl = new THREE.Mesh(G.cyl, new THREE.MeshStandardMaterial({ color: '#6b4b33' })); pl.scale.set(.02, .8, .02); pl.position.set(0, -.25, .12); P.cellar.armR.add(pl); P.cellar.armR.rotation.x = -.7; P.cellar.armL.rotation.x = -.7; }
  P.walker = person('#c46a43'); scene.add(P.walker.g);
  P.rower = person('#3c7aa8'); P.rower.g.scale.setScalar(.95); P.rower.g.position.set(0, .2, 0); P.rower.g.rotation.y = PI / 2; P.rower.legL.rotation.x = P.rower.legR.rotation.x = -1.4; dyn.boats[6].b.add(P.rower.g);
  dyn.people = P;
  return dyn;
}

/* ---------- light moods ---------- */
const MOODS = {
  day: { hemi: ['#fdf8ee', '#c7b49a', 1.7], sun: ['#fff6e6', 2.6, [14, 26, 12]], win: 0, lamp: 0, water: '#2aa7aa', top: '#5cc6c0', exp: 1.15 },
  golden: { hemi: ['#ffeedb', '#b89c7e', 1.5], sun: ['#ffc58a', 2.9, [-14, 16, 18]], win: .25, lamp: 0, water: '#1fa3ad', top: '#57c2c4', exp: 1.15 },
  night: { hemi: ['#7586b8', '#3a3542', .8], sun: ['#b4c4ff', .7, [10, 22, -8]], win: 2.4, lamp: 1.6, water: '#1f6b78', top: '#3a8590', exp: 1.2 },
};

/* ---------- public mount ---------- */
export function mountVillage(root, { onPin } = {}) {
  const stage = $('.vl-stage', root), pinsEl = $('.vl-pins', stage), note = $('.vl-note', root);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { stage.classList.add('no-gl'); $('.vl-loading', stage).textContent = 'This browser could not start 3D. The pins below still open every note.'; }
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 400);
  const state = { drip: false, cut: false, reuse: false, loaded: false, pour: 0, door: null, light: 'golden', orbit: !still(), pin: null };
  const tw = {}; // tweens: key -> {from,to,t0,dur,apply}
  const tween = (key, from, to, dur, apply) => { if (still()) { apply(to); delete tw[key]; return; } tw[key] = { from, to, t0: performance.now(), dur, apply }; };

  let dyn, controls, hemi, sun;
  const HOME = { target: new THREE.Vector3(0, 3.6, 0), theta: .72, phi: .98, r: 80 };
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'vl-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    stage.prepend(renderer.domElement);
    hemi = new THREE.HemisphereLight('#fff', '#888', 1); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff', 2); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
    scene.add(sun, sun.target);
    dyn = buildWorld(scene);
    controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: .08, minZoom: .7, maxZoom: 4, minPolarAngle: .25, maxPolarAngle: 1.38, screenSpacePanning: true, autoRotateSpeed: .55, zoomToCursor: true });
    controls.addEventListener('start', () => { if (state.orbit) setOrbit(false); delete tw.cam; });
    resetView(true);
  }

  function resetView(instant) {
    if (!controls) return;
    const end = new THREE.Vector3().setFromSphericalCoords(HOME.r, HOME.phi, HOME.theta).add(HOME.target);
    const fromP = camera.position.clone(), fromT = controls.target.clone(), fromZ = camera.zoom;
    const apply = t => { const e = ease(t); camera.position.lerpVectors(fromP, end, e); controls.target.lerpVectors(fromT, HOME.target, e); camera.zoom = lerp(fromZ, 1, e); camera.updateProjectionMatrix(); };
    if (instant || still()) { camera.position.copy(end); controls.target.copy(HOME.target); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); delete tw.cam; return; }
    tween('cam', 0, 1, 700, apply);
  }
  function focusOn(v, z = 1.45) {
    if (!controls) return;
    const dest = new THREE.Vector3(...v); dest.y = lerp(dest.y, 3.6, .35);
    const offset = camera.position.clone().sub(controls.target);
    const fromT = controls.target.clone(), fromZ = camera.zoom, toZ = Math.max(camera.zoom, z);
    tween('cam', 0, 1, 650, t => { const e = ease(t); controls.target.lerpVectors(fromT, dest, e); camera.position.copy(controls.target).add(offset); camera.zoom = lerp(fromZ, toZ, e); camera.updateProjectionMatrix(); });
  }
  function fit() {
    if (!renderer) return;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const a = w / h, S = a >= 1 ? 12.2 : 13.4;
    if (a >= 1) Object.assign(camera, { left: -S * a, right: S * a, top: S, bottom: -S }); else Object.assign(camera, { left: -S, right: S, top: S / a, bottom: -S / a });
    camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
  }

  /* ---- state setters (each returns the note's action line) ---- */
  function setLight(name) {
    state.light = name; const m = MOODS[name]; stage.dataset.light = name;
    root.querySelectorAll('button[data-light]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.light === name)));
    if (!renderer) return;
    hemi.color.set(m.hemi[0]); hemi.groundColor.set(m.hemi[1]); hemi.intensity = m.hemi[2];
    sun.color.set(m.sun[0]); sun.intensity = m.sun[1]; sun.position.set(...m.sun[2]);
    M.winLit.emissiveIntensity = m.win; M.lamp.emissiveIntensity = m.lamp * 1.4; dyn.lamps.forEach(l => { l.intensity = m.lamp * 6; });
    dyn.waterMats[0].color.set(m.water); dyn.waterMats[1].color.set(m.top); renderer.toneMappingExposure = m.exp;
  }
  function setOrbit(on) { state.orbit = on; if (controls) controls.autoRotate = on && !still(); syncToggles(); }
  function setDrip(on) { state.drip = on; dyn?.drip.forEach(g => { g.visible = on; }); syncToggles(); return on ? 'Drip on · damp root zone, dry leaves' : 'Drip off · the soil holds what the rain left'; }
  function setCut(on) {
    state.cut = on; syncToggles();
    if (dyn) { const from = dyn.slab.position.x, s = dyn.slab; tween('slab', from, on ? 4.6 : 0, 900, v => { s.position.x = typeof v === 'number' ? v : 0; }); }
    return on ? 'Slab slid out · roots and strata in view' : 'Slab back in place';
  }
  function setReuse(on) { state.reuse = on; if (dyn) { dyn.rinse.loop.visible = on; dyn.rinse.spill.visible = !on; } syncToggles(); return on ? 'Loop on · rinse water settles, then climbs back to the yard' : 'Loop off · rinse water spills into the harbor'; }
  function setLoaded(on) {
    state.loaded = on; syncToggles();
    if (dyn) for (const [i, c] of dyn.cases.entries()) {
      const a = c.m.position.clone();
      tween('case' + i, 0, 1, 900 + i * 70, t => { const bp = dyn.caseBoat.localToWorld(c.bo.clone()), end = on ? bp : c.qa; const e = ease(t); c.m.position.lerpVectors(a, end, e); c.m.position.y += Math.sin(e * PI) * 1.2; c.onBoat = on && t >= 1; });
    }
    return on ? 'Cases loaded · tap again to unload' : 'Cases back on the quay';
  }
  function setPour(n) {
    state.pour = n; syncToggles();
    if (dyn) { const p = dyn.pour; tween('water', p.wf.scale.y, n >= 1 ? 1 : .01, 600, v => { p.wf.scale.y = v; }); tween('wine', p.wine.scale.x, n >= 2 ? 1 : .01, 600, v => { p.wine.scale.setScalar(v); }); p.bottle.visible = n >= 2; }
    return ['Glasses cleared · tap to pour water first', 'Water poured · tap again for the wine', 'Wine poured · tap again to clear'][n];
  }
  function setDoor(lane) {
    state.door = lane; syncToggles();
    if (dyn) for (const [l, pv] of Object.entries(dyn.doors)) {
      const open = l === lane;
      tween('door' + l, pv.rotation.y, open ? -1.9 : 0, 650, v => { pv.rotation.y = v; });
      dyn.glow[l].material.opacity = open ? .85 : 0;
    }
    return lane ? `${LANES[lane].name} door open · the other four lanes stay shut` : 'All five lane doors shut';
  }

  /* ---- HUD: pins, toggles, list ---- */
  const pinBtns = {};
  for (const p of PINS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vl-pin'; b.dataset.pin = p.id; b.textContent = p.n;
    b.setAttribute('aria-label', `Pin ${p.n}: ${p.t}`);
    b.addEventListener('click', e => { e.stopPropagation(); open(p.id); });
    pinsEl.append(b); pinBtns[p.id] = b;
  }
  const list = $('.vl-list', root);
  list.innerHTML = PINS.map(p => `<li><button type="button" data-pin="${p.id}"><b>${p.n}</b>${p.t}</button></li>`).join('');
  list.addEventListener('click', e => { const b = e.target.closest('button[data-pin]'); if (b) open(b.dataset.pin); });

  const toggles = $('.vl-toggles', root);
  toggles.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.t;
    if (k === 'drip') say('drip', setDrip(!state.drip));
    if (k === 'cut') say('soil', setCut(!state.cut));
    if (k === 'reuse') say('rinse', setReuse(!state.reuse));
    if (k === 'cases') say('cases', setLoaded(!state.loaded));
    if (k === 'pour') say('table', setPour((state.pour + 1) % 3));
  });
  const hud = $('.vl-hud', stage);
  hud.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.light) setLight(b.dataset.light);
    if (b.dataset.act === 'orbit') setOrbit(!state.orbit);
    if (b.dataset.act === 'reset') { resetView(); }
  });
  function syncToggles() {
    const on = { drip: state.drip, cut: state.cut, reuse: state.reuse, cases: state.loaded, pour: state.pour > 0 };
    toggles.querySelectorAll('button[data-t]').forEach(b => b.setAttribute('aria-pressed', String(!!on[b.dataset.t])));
    const pl = toggles.querySelector('[data-t="pour"] span'); if (pl) pl.textContent = ['Pour water', 'Pour wine', 'Clear glasses'][state.pour];
    const ob = hud.querySelector('[data-act="orbit"]'); if (ob) ob.setAttribute('aria-pressed', String(state.orbit));
  }
  // toggles update the note only if that pin's note is already open
  function say(pinId, act) { if (state.pin === pinId) $('.act', note).textContent = act; }

  /* ---- notes ---- */
  function open(id, { quiet = false } = {}) {
    const p = PINS.find(x => x.id === id); if (!p) return;
    const again = state.pin === id;
    let act = 'Drag to look around · tap another pin';
    if (id === 'terraces') act = 'Try pin 2 (drip) and pin 3 (soil cut)';
    if (id === 'drip') act = setDrip(again ? !state.drip : true);
    if (id === 'soil') act = setCut(again ? !state.cut : true);
    if (p.lane) act = setDoor(again && state.door === p.lane ? null : p.lane);
    if (id === 'rinse') act = setReuse(again ? !state.reuse : true);
    if (id === 'cases') act = setLoaded(again ? !state.loaded : !state.loaded);
    if (id === 'table') act = setPour(again ? (state.pour + 1) % 3 : Math.max(1, state.pour));
    if (id === 'auger') act = setCut(again ? !state.cut : true);
    if (id === 'press') act = setDoor(again && state.door === 'white' ? null : 'white');
    if (id === 'tanks') act = setDoor(again && state.door === 'red' ? null : 'red');
    if (id === 'barrels') act = 'Quay barrels · the cellar row, not a making-style door';
    if (id === 'lab') act = 'Lab bench in view · jars and a clipboard';
    if (id === 'bench') act = 'Workbench in view · stave, hoop, and a barrel on its side';
    if (id === 'berry') act = 'Vine terrace · skin, pulp, and seed';
    state.pin = id;
    Object.values(pinBtns).forEach(b => b.classList.toggle('active', b.dataset.pin === id));
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.pin === id)));
    note.hidden = false;
    note.innerHTML = `<button class="x" type="button" aria-label="Close note">×</button><div class="k">Village · pin ${p.n} of ${PINS.length}</div><h4>${p.t}</h4><p>${p.b}</p>` +
      `<div class="row"><span class="act"><b>What changed</b> ${act}</span>` +
      `<a class="to-outline" href="#outline/${p.chart}">Outline →</a>` +
      `</div>`;
    $('.x', note).addEventListener('click', close);
    if (!quiet) focusOn(anchor(p).toArray(), p.zoom || 1.45);
    onPin?.(id);
  }
  function close() {
    state.pin = null; note.hidden = true; note.innerHTML = '';
    Object.values(pinBtns).forEach(b => b.classList.remove('active'));
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', 'false'));
    onPin?.(null);
  }
  const _v = new THREE.Vector3();
  function anchor(p) { _v.set(...p.at); if (p.slab && dyn) _v.x += dyn.slab.position.x; return _v.clone(); }

  /* ---- click on props (invisible hit volumes) ---- */
  const hits = [];
  if (renderer) {
    const hm = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    for (const p of PINS) for (const [x0, x1, y0, y1, z0, z1] of p.hit) {
      const m = new THREE.Mesh(G.box, hm); m.scale.set(x1 - x0, y1 - y0, z1 - z0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.userData.pin = p.id;
      (p.slab ? dyn.slab : scene).add(m); hits.push(m);
    }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const vol = o => Math.abs(o.scale.x * o.scale.y * o.scale.z);
    const pick = e => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const found = ray.intersectObjects(hits, false);
      if (!found.length) return;
      found.sort((a, b) => vol(a.object) - vol(b.object));
      return found[0].object.userData.pin;
    };
    let down = null;
    renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
      if (moved < 7 && dt < 600) { const id = pick(e); if (id) open(id); }
    });
    let last = 0;
    renderer.domElement.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || e.buttons) return; const n = performance.now(); if (n - last < 60) return; last = n; renderer.domElement.style.cursor = pick(e) ? 'pointer' : ''; });
  }

  /* ---- keyboard ---- */
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.body.classList.contains('dive-open')) return;
      if (state.pin) { const id = state.pin; close(); pinBtns[id]?.focus(); }
      return;
    }
    if (!controls || !stage.contains(e.target) || e.target.closest('.vl-hud')) return;
    const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
    let used = true;
    if (e.key === 'ArrowLeft') sph.theta -= .14; else if (e.key === 'ArrowRight') sph.theta += .14;
    else if (e.key === 'ArrowUp') sph.phi = Math.max(controls.minPolarAngle, sph.phi - .1);
    else if (e.key === 'ArrowDown') sph.phi = Math.min(controls.maxPolarAngle, sph.phi + .1);
    else if (e.key === '+' || e.key === '=') { camera.zoom = Math.min(controls.maxZoom, camera.zoom * 1.18); camera.updateProjectionMatrix(); }
    else if (e.key === '-' || e.key === '_') { camera.zoom = Math.max(controls.minZoom, camera.zoom / 1.18); camera.updateProjectionMatrix(); }
    else if (e.key === 'r' || e.key === 'R') resetView();
    else used = false;
    if (!used) return;
    e.preventDefault(); if (state.orbit) setOrbit(false);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph)); controls.update();
  });

  /* ---- loop ---- */
  const clock = new THREE.Clock(); let T = 0, running = false;
  const pv = new THREE.Vector3();
  function placePins() {
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const p of PINS) {
      pv.copy(anchor(p)).project(camera);
      const b = pinBtns[p.id], off = pv.x < -1.05 || pv.x > 1.05 || pv.y < -1.05 || pv.y > 1.05;
      b.style.transform = `translate(${((pv.x + 1) / 2 * w).toFixed(1)}px, ${((1 - pv.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`;
      b.classList.toggle('off', off);
    }
  }
  function animate() {
    const dt = Math.min(clock.getDelta(), .05), now = performance.now();
    for (const [k2, t] of Object.entries(tw)) { const u = Math.min(1, (now - t.t0) / t.dur); t.apply(typeof t.from === 'number' && typeof t.to === 'number' && k2 !== 'cam' && !k2.startsWith('case') ? lerp(t.from, t.to, ease(u)) : u); if (u >= 1) delete tw[k2]; }
    if (!still()) {
      T += dt; ambient(T);
    }
    controls.update();
    renderer.render(scene, camera);
    placePins();
  }
  function ambient(t) {
    const d = dyn, P = d.people;
    // water surface ripples
    const pos = d.surf.geometry.attributes.position, base = d.surfBase;
    for (let i = 0; i < pos.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; pos.array[i * 3 + 1] = Math.sin(x * .9 + t * 1.3) * .035 + Math.cos(z * 1.4 + t * .9) * .03; }
    pos.needsUpdate = true; d.surf.geometry.computeVertexNormals();
    for (const { b, ph } of d.boats) { b.position.y = .3 + Math.sin(t * 1.2 + ph) * .03; b.rotation.z = Math.sin(t * .9 + ph) * .03; }
    for (const { m, ph } of d.buoys) m.position.y = .58 + Math.sin(t * 1.6 + ph) * .04;
    for (const c of d.cases) if (c.onBoat && !tw['case0']) c.m.position.copy(d.caseBoat.localToWorld(c.bo.clone()));
    for (const b of d.birds) { const a = t * b.sp + b.ph; b.b.position.set(Math.cos(a) * b.r, b.h + Math.sin(a * 2) * .5, Math.sin(a) * b.r * .7 - 1); b.b.rotation.y = -a; const f = Math.sin(t * 9 + b.ph) * .5; b.wlP.rotation.z = f; b.wrP.rotation.z = -f; }
    for (const [i, l] of d.laundry.entries()) l.rotation.x = Math.sin(t * 2 + i) * .18;
    if (d.rinse.loop.visible) d.rinse.flows.forEach((f, i) => f.position.copy(d.rinse.curve.getPointAt(((t * .18) + i / 7) % 1)));
    // picker walks the C aisle, pausing to pick
    { const L = 6.6, s = (t * .45) % (2 * L), x = 2.8 + (s < L ? s : 2 * L - s), g = P.picker.g, pause = Math.sin(t * 1.3) > .7;
      g.position.set(x, 5.0, -5.7); g.rotation.y = s < L ? PI / 2 : -PI / 2; walkPose(P.picker, pause ? 0 : t * 7, .5); g.rotation.x = pause ? .25 : 0; }
    // dock worker: quay crates -> pier end and back
    { const pts = [[6.5, 1.05, .9], [3.8, 1.05, 1.0], [3.8, 1.0, 6.3], [8.6, 1.0, 6.3]], cyc = (t * .12) % 2, f = cyc < 1 ? cyc : 2 - cyc, seg = Math.min(2, Math.floor(f * 3)), u = f * 3 - seg;
      const a = pts[seg], b = pts[seg + 1], g = P.docker.g; g.position.set(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
      const dx = (b[0] - a[0]) * (cyc < 1 ? 1 : -1), dz = (b[2] - a[2]) * (cyc < 1 ? 1 : -1); g.rotation.y = Math.atan2(dx, dz); P.docker.crate.visible = cyc < 1; walkPose(P.docker, t * 7, .55); P.docker.armL.rotation.x = P.docker.armR.rotation.x = cyc < 1 ? -1.2 : P.docker.armL.rotation.x; }
    // café host: door <-> table
    { const c = (Math.sin(t * .5) + 1) / 2, g = P.host.g; g.position.set(lerp(-7.6, -6.9, c), 1.08, lerp(-1.3, .05, c)); g.rotation.y = Math.cos(t * .5) > 0 ? .5 : PI + .5; walkPose(P.host, t * 6, Math.abs(Math.cos(t * .5)) * .5); P.host.armR.rotation.x = -1.3; }
    // cellar hand punches down the cap
    { const s = (Math.sin(t * 2.2) + 1) / 2; P.cellar.armR.rotation.x = P.cellar.armL.rotation.x = -.5 - s * .5; P.cellar.g.position.y = 3.04 - s * .04; }
    // someone climbing the stairs
    { const cyc = (t * .05) % 2, up = cyc < 1, g = P.walker.g; along(STAIRS, up ? cyc : 2 - cyc, g.position); g.rotation.y = up ? PI : 0; walkPose(P.walker, t * 7, .55); }
    // rower
    { const r = P.rower; r.armL.rotation.x = r.armR.rotation.x = -1 + Math.sin(t * 2) * .5; }
  }
  function frame() { if (running) animate(); }

  const ro = new ResizeObserver(() => fit());
  ro.observe(stage);
  setLight('golden'); setOrbit(state.orbit); syncToggles();
  if (dyn) ambient(3); // place people and props even when motion is reduced
  motionMQ.addEventListener?.('change', () => setOrbit(state.orbit && !still()));
  $('.vl-loading', stage).hidden = !!renderer;

  return {
    show(pin) {
      if (renderer && !running) { running = true; fit(); clock.getDelta(); renderer.setAnimationLoop(frame); }
      if (pin && PINS.some(p => p.id === pin)) { if (state.pin !== pin) open(pin); }
    },
    hide() { running = false; renderer?.setAnimationLoop(null); },
    close, open, state,
  };
}
