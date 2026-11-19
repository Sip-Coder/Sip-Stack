import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sections, finish, mesh, tube, wind, tau } from './forms.js';

const material = (color, roughness = 0.78) =>
  new T.MeshStandardMaterial({ color, roughness, side: T.DoubleSide });
const rope = material('#a78b64'),
  oak = material('#9b7048'),
  iron = material('#4c5149'),
  canvas = material('#e4d6b4');
function plank(parent, w, h, d, x, y, z, m = oak) {
  const o = mesh(parent, new T.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}
// Merge immobile fittings once, keeping oars and occupants in independent frames.
export function batchParts(parent) {
  parent.updateMatrixWorld(true);
  const inverse = parent.matrixWorld.clone().invert(),
    bins = new Map();
  for (const o of [...parent.children]) {
    if (!o.isMesh) continue;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    if (!bins.has(o.material)) bins.set(o.material, []);
    bins.get(o.material).push(g);
    parent.remove(o);
    o.geometry.dispose();
  }
  for (const [m, parts] of bins) {
    mesh(parent, mergeGeometries(parts), m);
    for (const g of parts) g.dispose();
  }
}
let cargoPattern;
export function crate() {
  if (cargoPattern) return cargoPattern.clone(true);
  const g = new T.Group();
  for (const s of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      plank(g, 0.41, 0.064, 0.021, 0, 0.035 + j * 0.076, s * 0.146);
      plank(g, 0.021, 0.064, 0.272, s * 0.195, 0.035 + j * 0.076, 0);
    }
    for (const q of [-1, 1]) plank(g, 0.028, 0.247, 0.029, s * 0.179, 0.123, q * 0.126, iron);
  }
  plank(g, 0.405, 0.024, 0.29, 0, 0.003, 0);
  batchParts(g);
  cargoPattern = g;
  return g.clone(true);
}
// A wrist carries the weight, while gravity keeps a basket or tasting stem
// upright through the elbow stroke. Tilt the glass toward the drinker's face.
function hangingGrip(hand, offset) {
  const pivot = new T.Group(),
    body = new T.Group();
  hand.add(pivot);
  pivot.add(body);
  pivot.position.set(0, -0.084, 0.015);
  body.position.y = offset;
  const inverse = new T.Quaternion(),
    yaw = new T.Quaternion(),
    tilt = new T.Quaternion();
  const axis = new T.Vector3(1, 0, 0);
  function settle(actor, angle = 0) {
    hand.getWorldQuaternion(inverse).invert();
    actor.getWorldQuaternion(yaw);
    pivot.quaternion.copy(inverse).multiply(yaw).multiply(tilt.setFromAxisAngle(axis, angle));
  }
  return { body, settle };
}
export function basket(parent) {
  const grip = hangingGrip(parent, -0.37),
    g = grip.body;
  const reeds = new Sections(),
    fruit = new Sections();
  for (let i = 0; i < 11; i++) {
    const y = i * 0.018,
      r = 0.12 + y * 0.24;
    reeds.loft(
      [
        [y, r, r * 0.82],
        [y + 0.005, r + 0.006, r * 0.82 + 0.006],
        [y + 0.017, r + 0.003, r * 0.82 + 0.003],
      ],
      i % 2 ? '#ae8759' : '#ba9563',
      30,
    );
  }
  for (let i = 0; i < 13; i++) {
    const a = i * 2.399,
      r = 0.103 * Math.sqrt(i / 13),
      x = r * Math.sin(a),
      z = r * Math.cos(a);
    fruit.loft(
      [
        [0.164, 0.02, 0.023, x, z],
        [0.18, 0.041, 0.037, x, z],
        [0.21, 0.032, 0.028, x, z],
        [0.226, 0.008, 0.009, x, z],
      ],
      i % 3 ? '#674858' : '#796078',
      10,
    );
  }
  mesh(g, reeds.geometry(), finish('detail'));
  mesh(g, fruit.geometry(), finish('detail'));
  tube(
    g,
    [
      [-0.16, 0.19, 0],
      [-0.125, 0.31, 0],
      [0, 0.37, 0],
      [0.125, 0.31, 0],
      [0.16, 0.19, 0],
    ],
    0.014,
    rope,
  );
  return grip;
}
export function tastingGlass(actor) {
  const grip = hangingGrip(actor.hands[1], -0.047),
    g = grip.body;
  const profile = [
    [0.044, 0],
    [0.044, 0.006],
    [0.008, 0.014],
    [0.006, 0.079],
    [0.024, 0.085],
    [0.049, 0.112],
    [0.053, 0.143],
    [0.042, 0.187],
  ];
  const glass = new T.MeshPhysicalMaterial({
    color: '#e0ebe3',
    roughness: 0.16,
    transparent: true,
    opacity: 0.49,
    side: T.DoubleSide,
    depthWrite: false,
  });
  mesh(
    g,
    new T.LatheGeometry(
      profile.map(([x, y]) => new T.Vector2(x, y)),
      24,
    ),
    glass,
  );
  const wine = new Sections();
  wine.loft(
    [
      [0.086, 0.016, 0.016],
      [0.11, 0.046, 0.046],
      [0.135, 0.05, 0.05],
    ],
    '#78263e',
    24,
  );
  mesh(g, wine.geometry(), finish('detail'));
  const goal = new T.Object3D();
  actor.g.add(goal);
  const wrists = [null, goal];
  return (t) => {
    const sip = 0.5 - 0.5 * Math.cos(t * 1.23);
    goal.position.set(0.21 - 0.15 * sip, 1.12 + 0.44 * sip, 0.25 - 0.112 * sip);
    actor.grasp(wrists);
    grip.settle(actor.g, -0.58 * sip);
  };
}
export function cutter(color, stripe, sail = false) {
  const root = new T.Group(),
    hull = new T.Group();
  root.add(hull);
  const p = [],
    c = [],
    uv = [],
    idx = [];
  const bands = [
    [-0.115, 0.02, stripe],
    [0.008, 0.44, stripe],
    [0.111, 0.74, stripe],
    [0.158, 0.82, color],
    [0.207, 0.88, stripe],
    [0.239, 0.92, color],
    [0.287, 0.96, color],
    [0.35, 1, color],
    [0.375, 0.99, '#735137'],
    [0.366, 0.949, '#bc945f'],
    [0.28, 0.89, '#a57b52'],
    [0.18, 0.73, '#a27a52'],
    [0.09, 0.43, '#875f40'],
    [0.087, 0, '#7b593e'],
  ];
  for (const s of [-1, 1])
    for (let j = 1; j < bands.length; j++) {
      const n = p.length / 3,
        tint = new T.Color(bands[j][2]);
      for (let i = 0; i <= 32; i++)
        for (let k = 0; k < 2; k++) {
          const u = i / 16 - 1,
            [y, r] = bands[j - 1 + k],
            beam = 0.43 * (1 - Math.abs(u) ** 1.78);
          p.push(u * 1.1, y + 0.132 * Math.abs(u) ** 3, s * (0.008 + r * beam + (k === 1 ? 0.004 : 0)));
          c.push(tint.r, tint.g, tint.b);
          uv.push(i / 32, k);
          if (i && k === 1) {
            const a = n + i * 2;
            idx.push(a - 2, a - 1, a, a, a - 1, a + 1);
          }
        }
    }
  const g = new T.BufferGeometry();
  for (const [name, a, n] of [
    ['position', p, 3],
    ['uv', uv, 2],
    ['color', c, 3],
  ])
    g.setAttribute(name, new T.Float32BufferAttribute(a, n));
  g.setIndex(idx);
  g.computeVertexNormals();
  mesh(hull, g, finish('wood'));
  for (const x of [-0.58, -0.08, 0.46])
    plank(hull, 0.16, 0.043, 0.76 * (1 - Math.abs(x) ** 1.78), x, 0.286, 0);
  // Bilge boards follow the waterplane right into the ends of the open hull.
  for (let i = -9; i <= 9; i++) {
    const x = i * 0.103,
      beam = 0.72 * (1 - Math.abs(x / 1.1) ** 1.78);
    plank(hull, 0.103, 0.026, beam, x, 0.191 + 0.094 * Math.abs(x) ** 3, 0);
  }
  for (let i = 0; i < 3; i++) {
    const points = [];
    for (let k = 0; k <= 28; k++) {
      const a = (k * tau) / 28;
      points.push([
        0.48 + (0.075 + i * 0.012) * Math.cos(a),
        0.318 + i * 0.004,
        0.06 + (0.07 + i * 0.014) * Math.sin(a),
      ]);
    }
    tube(hull, points, 0.008, rope, 32);
  }
  if (sail) {
    plank(hull, 0.032, 1.53, 0.032, 0.1, 1.1, 0);
    plank(hull, 0.85, 0.029, 0.028, -0.29, 0.51, 0);
    for (const s of [-1, 1]) {
      const pp = [],
        ii = [],
        uu = [];
      for (let j = 0; j <= 12; j++)
        for (let i = 0; i <= 10; i++) {
          const v = j / 12,
            u = i / 10;
          pp.push(
            0.1 + s * u * (1 - v) * (s === 1 ? 0.82 : 0.94),
            0.5 + v * 1.29 + 0.069 * u * (1 - v),
            0.025 + 0.134 * Math.sin(Math.PI * u) * (1 - v),
          );
          uu.push(u, v);
          const a = j * 11 + i;
          if (j && i) ii.push(a - 12, a - 11, a, a - 12, a, a - 1);
        }
      const sailcloth = new T.BufferGeometry();
      sailcloth.setAttribute('position', new T.Float32BufferAttribute(pp, 3));
      sailcloth.setAttribute('uv', new T.Float32BufferAttribute(uu, 2));
      sailcloth.setIndex(ii);
      sailcloth.computeVertexNormals();
      mesh(hull, sailcloth, canvas);
      tube(
        hull,
        [
          [s * 0.99, 0.45, 0],
          [s * 0.55, 1.02, 0.01],
          [0.1, 1.82, 0],
        ],
        0.007,
        rope,
      );
    }
  }
  batchParts(hull);
  const oars = [],
    grips = [];
  for (const s of [-1, 1]) {
    const lock = new T.Group();
    lock.position.set(-0.06, 0.36, s * 0.385);
    root.add(lock);
    const stick = new Sections();
    stick.loft(
      [
        [-0.31, 0.022, 0.023],
        [-0.24, 0.021, 0.023],
        [0.32, 0.016, 0.017],
        [0.46, 0.019, 0.023],
        [0.57, 0.024, 0.056],
        [0.91, 0.021, 0.073],
        [0.95, 0.009, 0.052],
      ],
      '#b99562',
      12,
      0,
      ([x, y, z]) => [z, x, s * y],
    );
    mesh(lock, stick.geometry(), finish('wood'));
    const grip = new T.Object3D();
    grip.position.z = -s * 0.285;
    lock.add(grip);
    grips.push(grip);
    oars.push(lock);
  }
  function stroke(t, active) {
    for (let i = 0; i < 2; i++) {
      const s = i * 2 - 1;
      oars[i].rotation.set(
        active ? s * (0.12 + 0.26 * Math.cos(t * 2)) : s * 0.075,
        active ? s * (0.55 * Math.sin(t * 2)) : s * 1.04,
        0,
        'YXZ',
      );
    }
  }
  stroke(0, false);
  return { root, stroke, grips };
}
// Sample the water under bow, stern, port and starboard in hull coordinates.
export function floatHull(g, t, height, weather = 0, offset = 0) {
  const a = g.rotation.y,
    c = Math.cos(a),
    s = Math.sin(a),
    { x, z } = g.position;
  const fore = height(x + c * 0.84, z - s * 0.84, t, weather),
    aft = height(x - c * 0.84, z + s * 0.84, t, weather);
  const port = height(x - s * 0.33, z - c * 0.33, t, weather),
    star = height(x + s * 0.33, z + c * 0.33, t, weather);
  g.position.y = (fore + aft + port + star) * 0.25 + offset;
  g.rotation.order = 'YXZ';
  g.rotation.z = Math.atan2(fore - aft, 1.68);
  g.rotation.x = -Math.atan2(star - port, 0.66);
}
export function clothPanel(w, h, color, axis = 'hem') {
  const geo = new T.PlaneGeometry(w, h, 10, 7),
    pos = geo.attributes.position;
  const rest = pos.array.slice(),
    normal = geo.attributes.normal,
    m = material(color),
    o = new T.Mesh(geo, m);
  o.castShadow = o.receiveShadow = true;
  o.userData.billow = (t, x, z) => {
    const gust = wind(t, x, z);
    for (let i = 0; i < pos.count; i++) {
      const k = i * 3,
        u = rest[k] / w + 0.5,
        v = 0.5 - rest[k + 1] / h,
        weight = axis === 'flag' ? u : v;
      const angle = u * 11 + v * 2 - t * 2,
        ripple = 0.036 * Math.sin(angle),
        slope = 0.036 * Math.cos(angle);
      const size = axis === 'flag' ? w : h,
        displacement = 0.12 * gust + ripple;
      pos.setZ(i, weight * displacement * size);
      const dx = (size / w) * (weight * 11 * slope + (axis === 'flag' ? displacement : 0));
      const dy = (-size / h) * (weight * 2 * slope + (axis === 'hem' ? displacement : 0));
      const inv = 1 / Math.hypot(dx, dy, 1);
      normal.setXYZ(i, -dx * inv, -dy * inv, inv);
    }
    pos.needsUpdate = normal.needsUpdate = true;
  };
  return o;
}

// The fill meshes start at the bottoms of their bowls. Scaling only the liquid
// depth preserves the meniscus while the teaching control advances the pour.
export function tableService(scene) {
  const table = new T.Group();
  scene.add(table);
  table.position.set(-6.6, 1.83, 0.5);
  table.scale.setScalar(1.7);
  const glass = new T.MeshPhysicalMaterial({
    color: '#dce9df',
    roughness: 0.13,
    clearcoat: 1,
    transparent: true,
    opacity: 0.3,
    side: T.DoubleSide,
    depthWrite: false,
  });
  function turn(profile, x, y, z, m) {
    const o = mesh(
      table,
      new T.LatheGeometry(
        profile.map(([r, h]) => new T.Vector2(r, h)),
        32,
      ),
      m,
    );
    o.position.set(x, y, z);
    o.castShadow = !m.transparent;
    return o;
  }
  turn(
    [
      [0.054, 0],
      [0.06, 0.006],
      [0.069, 0.035],
      [0.074, 0.223],
      [0.072, 0.228],
      [0.068, 0.224],
      [0.064, 0.03],
      [0.054, 0.013],
    ],
    -0.215,
    0,
    0.048,
    glass,
  );
  const wf = turn(
    [
      [0.001, 0],
      [0.057, 0.006],
      [0.069, 0.18],
      [0.067, 0.183],
      [0.001, 0.179],
    ],
    -0.215,
    0.009,
    0.048,
    new T.MeshPhysicalMaterial({
      color: '#b1d8d9',
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      clearcoat: 0.5,
    }),
  );
  turn(
    [
      [0.001, 0],
      [0.061, 0.002],
      [0.062, 0.007],
      [0.012, 0.013],
      [0.009, 0.12],
      [0.028, 0.134],
      [0.077, 0.17],
      [0.093, 0.219],
      [0.078, 0.29],
      [0.075, 0.291],
      [0.088, 0.219],
      [0.071, 0.172],
      [0.022, 0.14],
    ],
    0.18,
    0,
    -0.05,
    glass,
  );
  const wine = turn(
    [
      [0.001, 0],
      [0.025, 0.008],
      [0.073, 0.049],
      [0.088, 0.079],
      [0.086, 0.081],
      [0.001, 0.078],
    ],
    0.18,
    0.135,
    -0.05,
    new T.MeshPhysicalMaterial({ color: '#6b213c', roughness: 0.18, clearcoat: 0.67 }),
  );
  const bottle = turn(
    [
      [0.058, 0],
      [0.061, 0.015],
      [0.062, 0.215],
      [0.055, 0.239],
      [0.024, 0.269],
      [0.02, 0.334],
      [0.024, 0.34],
      [0.024, 0.352],
      [0.017, 0.352],
    ],
    -0.01,
    0,
    0.124,
    new T.MeshPhysicalMaterial({ color: '#324433', roughness: 0.23, clearcoat: 0.74 }),
  );
  const label = mesh(bottle, new T.CylinderGeometry(0.0625, 0.0625, 0.082, 32, 1, true), material('#cdbfa5'));
  label.position.y = 0.12;
  turn(
    [
      [0.048, 0],
      [0.071, 0.014],
      [0.088, 0.095],
      [0.078, 0.14],
      [0.042, 0.189],
      [0.037, 0.222],
      [0.045, 0.236],
      [0.04, 0.237],
    ],
    0.035,
    0,
    -0.155,
    glass,
  );
  wf.scale.y = wine.scale.y = 0.01;
  bottle.visible = false;
  return { wf, wine, bottle };
}
