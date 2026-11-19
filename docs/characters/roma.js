// Roma's garments, features and curls are constructed in joint-local coordinates.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tau = Math.PI * 2;
const xyz = (x, y, z) => new T.Vector3(x, y, z);

function surface(positions, indices) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Tailoring profiles specify height, half-width, half-depth and front/back offset.
function tailored(rows, segments = 36, pleat = 0) {
  const pos = [],
    idx = [];
  for (let j = 0; j < rows.length; j++) {
    const [y, rx, rz, z = 0] = rows[j];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * tau;
      const fold = 1 + pleat * Math.cos(8 * a + 0.2) * (1 - j / (rows.length - 1));
      pos.push(Math.sin(a) * rx * fold, y, Math.cos(a) * rz * fold + z);
      if (j) {
        const p = (j - 1) * segments + i,
          q = (j - 1) * segments + ((i + 1) % segments);
        idx.push(p, q, p + segments, p + segments, q, q + segments);
      }
    }
  }
  return surface(pos, idx);
}

// Flattened swept cross-sections give curls, lashes, lips and lapels a continuous taper.
function sweep(points, widths, depths, slices = 16, sides = 8) {
  const path = new T.CatmullRomCurve3(points.map((p) => xyz(...p)));
  const pos = [],
    idx = [],
    center = xyz(),
    tangent = xyz(),
    side = xyz(),
    normal = xyz();
  for (let j = 0; j <= slices; j++) {
    const t = j / slices,
      u = t * (widths.length - 1),
      k = Math.min(Math.floor(u), widths.length - 2);
    const blend = u - k;
    const w = T.MathUtils.lerp(widths[k], widths[k + 1], blend);
    const d = T.MathUtils.lerp(depths[k], depths[k + 1], blend);
    path.getPoint(t, center);
    path.getTangent(t, tangent);
    side.set(tangent.y, -tangent.x, 0);
    if (side.lengthSq() < 0.001) side.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
    side.normalize();
    normal.crossVectors(tangent, side).normalize();
    for (let i = 0; i < sides; i++) {
      const a = (tau * i) / sides,
        dx = Math.cos(a) * w,
        dy = Math.sin(a) * d;
      pos.push(
        center.x + side.x * dx + normal.x * dy,
        center.y + side.y * dx + normal.y * dy,
        center.z + side.z * dx + normal.z * dy,
      );
      if (j) {
        const p = (j - 1) * sides + i,
          q = (j - 1) * sides + ((i + 1) % sides);
        idx.push(p, q, p + sides, p + sides, q, q + sides);
      }
    }
  }
  return surface(pos, idx);
}

function seam(points, radius) {
  return new T.TubeGeometry(new T.CatmullRomCurve3(points.map((p) => xyz(...p))), 16, radius, 6, false);
}

export function buildRoma(rig) {
  const paint = (color, roughness = 0.72, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const skin = paint('#c58b63', 0.65),
    blush = paint('#bd785e'),
    lips = paint('#a64d44', 0.56);
  const inside = paint('#5e2b2e'),
    teeth = paint('#ffebd3'),
    sclera = paint('#fcf0da', 0.36);
  const iris = paint('#82503a', 0.29),
    pupil = paint('#21191c', 0.27),
    catchlight = paint('#fff9e9', 0.15);
  const hair = [
    paint('#231a1b', 0.5),
    paint('#332324', 0.46),
    paint('#432e29', 0.47),
    paint('#554039', 0.53),
  ];
  const satin = new T.MeshPhysicalMaterial({
    color: '#bd8546',
    roughness: 0.49,
    sheen: 0.85,
    sheenColor: '#e1b875',
    sheenRoughness: 0.56,
    side: T.DoubleSide,
  });
  const facing = paint('#d8a65f', 0.5),
    binding = paint('#82592f', 0.58),
    gold = paint('#d7a84e', 0.27, 0.73);
  const silk = new T.MeshPhysicalMaterial({
    color: '#12513e',
    roughness: 0.6,
    sheen: 0.65,
    sheenColor: '#35775d',
    sheenRoughness: 0.53,
    side: T.DoubleSide,
  });
  const silkEdge = paint('#20654b'),
    leather = paint('#654335', 0.59),
    sole = paint('#352d2a'),
    brass = paint('#9e793d', 0.37, 0.64);
  const glow = new T.MeshStandardMaterial({
    color: '#ffe4a1',
    emissive: '#ffad49',
    emissiveIntensity: 0.7,
    roughness: 0.23,
  });
  const prism = new T.MeshPhysicalMaterial({
    color: '#f5ce87',
    transparent: true,
    opacity: 0.22,
    roughness: 0.13,
    depthWrite: false,
  });
  const buckets = new Map();
  const sphere = new T.SphereGeometry(1, 24, 18);
  function node(parent, x = 0, y = 0, z = 0) {
    const o = new T.Group();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }
  // Bake transforms into each joint's material batches once. Only moving pieces keep separate transforms.
  function add(parent, geometry, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ax = 0, ay = 0, az = 0) {
    const transform = new T.Matrix4().compose(
      xyz(x, y, z),
      new T.Quaternion().setFromEuler(new T.Euler(ax, ay, az)),
      xyz(sx, sy, sz),
    );
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(transform);
    let group = buckets.get(parent);
    if (!group) buckets.set(parent, (group = new Map()));
    let pieces = group.get(mat);
    if (!pieces) group.set(mat, (pieces = []));
    pieces.push(g);
  }
  const oval = (parent, mat, x, y, z, rx, ry, rz, ax = 0, ay = 0, az = 0) =>
    add(parent, sphere, mat, x, y, z, rx, ry, rz, ax, ay, az);
  const ribbon = (parent, mat, p, w, d, n = 18) => add(parent, sweep(p, w, d, n), mat);
  const thread = (parent, mat, p, r) => add(parent, seam(p, r), mat);
  const ring = (parent, mat, x, y, z, r, t, ax = 0, ay = 0, az = 0) =>
    add(parent, new T.TorusGeometry(r, t, 7, 32), mat, x, y, z, 1, 1, 1, ax, ay, az);

  // Pear-shaped face with an inset jaw, high cheeks and a narrow chin.
  const H = rig.head,
    C = rig.chest;
  const contour = [
    [0.003, 0.001, 0.002, 0.012],
    [0.006, 0.02, 0.025, 0.014],
    [0.015, 0.037, 0.039, 0.012],
    [0.036, 0.054, 0.047, 0.008],
    [0.055, 0.062, 0.054, 0.007],
    [0.076, 0.067, 0.056, 0.006],
    [0.095, 0.066, 0.055, 0.005],
    [0.119, 0.061, 0.052, 0.001],
    [0.137, 0.047, 0.043, -0.002],
    [0.147, 0.021, 0.022, -0.006],
    [0.149, 0.001, 0.002, -0.006],
  ];
  const facialProfile = new T.CatmullRomCurve3(contour.map(([y, rx, rz]) => xyz(rx, y, rz)));
  const faceRows = [];
  for (let j = 0; j <= 64; j++) {
    const t = j / 64,
      k = Math.min(9, Math.floor(t * 10)),
      u = t * 10 - k,
      v = facialProfile.getPoint(t);
    faceRows.push([v.y, v.x, v.z, T.MathUtils.lerp(contour[k][3], contour[k + 1][3], u)]);
  }
  const cheeks = tailored(faceRows, 96),
    cheekPos = cheeks.attributes.position,
    colors = [];
  for (let i = 0; i < cheekPos.count; i++) {
    const x = cheekPos.getX(i),
      y = cheekPos.getY(i),
      z = cheekPos.getZ(i),
      front = Math.max(0, Math.cos(((i % 96) * tau) / 96));
    const gauss = (cx, cy, wx, wy) => Math.exp(-(((x - cx) / wx) ** 2 + ((y - cy) / wy) ** 2)) * front;
    const nose =
      0.012 * gauss(0, 0.077, 0.01, 0.023) +
      0.015 * gauss(0, 0.062, 0.01, 0.008) +
      0.004 * (gauss(0.01, 0.059, 0.006, 0.005) + gauss(-0.01, 0.059, 0.006, 0.005));
    const cheek = gauss(0.041, 0.063, 0.016, 0.009) + gauss(-0.041, 0.063, 0.016, 0.009);
    cheekPos.setZ(i, z + nose + cheek * 0.003);
    colors.push(1 + 0.06 * cheek, 1 - 0.13 * cheek, 1 - 0.12 * cheek);
  }
  cheeks.computeVertexNormals();
  cheeks.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const skinTint = skin.clone();
  skinTint.vertexColors = true;
  add(H, cheeks, skinTint);
  add(
    C,
    tailored([
      [0.128, 0.061, 0.035],
      [0.15, 0.037, 0.028],
      [0.166, 0.028, 0.024],
      [0.195, 0.025, 0.025],
      [0.212, 0.029, 0.025],
    ]),
    skin,
  );
  for (const s of [-1, 1]) {
    oval(H, blush, s * 0.008, 0.059, 0.068, 0.0032, 0.0014, 0.0016);
    oval(H, skin, s * 0.064, 0.067, -0.003, 0.012, 0.018, 0.01, 0, 0, -s * 0.18);
    oval(H, blush, s * 0.07, 0.067, 0.003, 0.0055, 0.01, 0.0045);
    oval(H, gold, s * 0.064, 0.064, 0.026, 0.0038, 0.0035, 0.0035);
    ring(H, gold, s * 0.066, 0.048, 0.028, 0.0154, 0.0021, 0, s * 0.3);
  }

  const lids = [],
    pupils = [];
  const whiteShape = new T.Shape();
  whiteShape.moveTo(-0.02, 0);
  whiteShape.bezierCurveTo(-0.014, 0.012, 0.004, 0.02, 0.016, 0.01);
  whiteShape.quadraticCurveTo(0.02, 0.005, 0.02, 0.003);
  whiteShape.bezierCurveTo(0.01, -0.009, -0.01, -0.014, -0.02, 0);
  const lens = new T.ShapeGeometry(whiteShape, 16);
  for (const side of [-1, 1]) {
    // Mirror the almond corners while keeping both pupils oriented toward the viewer.
    const lid = node(H, side * 0.026, 0.084, 0.0596);
    lid.rotation.y = side * 0.37;
    lid.rotation.z = side * 0.04;
    lids.push(lid);
    const eye = node(lid);
    eye.scale.x = side;
    add(eye, lens, sclera);
    const look = node(eye, -0.0007, 0.0025, 0.0007);
    pupils.push(look);
    oval(look, pupil, 0, 0, 0, 0.0104, 0.0123, 0.0016);
    oval(look, iris, 0, 0, 0.0014, 0.0093, 0.0115, 0.0015);
    oval(look, pupil, -0.0008, 0.001, 0.0028, 0.0051, 0.0073, 0.0012);
    oval(look, catchlight, -0.0035, 0.0058, 0.004, 0.0024, 0.003, 0.001);
    oval(look, teeth, 0.003, -0.002, 0.004, 0.001, 0.0012, 0.0007);
    ribbon(
      eye,
      pupil,
      [
        [-0.02, 0, 0.001],
        [-0.014, 0.01, 0.0016],
        [0.003, 0.0157, 0.002],
        [0.016, 0.009, 0.002],
        [0.024, 0.006, 0.002],
      ],
      [0.0004, 0.0013, 0.002, 0.0022, 0.00015],
      [0.0004, 0.001, 0.001, 0.001, 0.0002],
    );
    ribbon(
      eye,
      lips,
      [
        [-0.019, -0.0005, 0.0008],
        [-0.009, -0.0078, 0.001],
        [0.004, -0.0076, 0.001],
        [0.017, 0.0006, 0.001],
      ],
      [0.0003, 0.0007, 0.0008, 0.0004],
      [0.0003, 0.0005, 0.0005, 0.0003],
    );
    ribbon(
      H,
      hair[0],
      [
        [side * 0.009, 0.106, 0.058],
        [side * 0.021, 0.111, 0.057],
        [side * 0.037, 0.114, 0.049],
        [side * 0.049, 0.109, 0.041],
      ],
      [0.0008, 0.0032, 0.0028, 0.00035],
      [0.0017, 0.0015, 0.0011, 0.00025],
    );
  }
  // A parted crescent smile has a dark oral cavity, slim upper teeth and a modelled lower lip.
  ribbon(
    H,
    inside,
    [
      [-0.025, 0.041, 0.051],
      [-0.015, 0.037, 0.055],
      [0, 0.036, 0.057],
      [0.015, 0.038, 0.055],
      [0.025, 0.043, 0.05],
    ],
    [0.0006, 0.0042, 0.0057, 0.0042, 0.0005],
    [0.0006, 0.0018, 0.0021, 0.0018, 0.0006],
  );
  ribbon(
    H,
    teeth,
    [
      [-0.022, 0.0415, 0.052],
      [-0.012, 0.04, 0.056],
      [0, 0.04, 0.0585],
      [0.013, 0.041, 0.056],
      [0.023, 0.043, 0.051],
    ],
    [0.0002, 0.0019, 0.0021, 0.0016, 0.0002],
    [0.0003, 0.001, 0.001, 0.001, 0.0003],
  );
  ribbon(
    H,
    lips,
    [
      [-0.025, 0.041, 0.051],
      [-0.014, 0.032, 0.055],
      [0, 0.03, 0.0567],
      [0.014, 0.033, 0.055],
      [0.025, 0.043, 0.05],
    ],
    [0.0004, 0.0018, 0.0024, 0.0017, 0.0004],
    [0.0005, 0.0019, 0.0023, 0.0018, 0.0004],
  );

  // An asymmetrical, side-parted crown flows into broad, overlapping S-shaped locks.
  const capPos = [],
    capIdx = [],
    sectors = 52,
    bands = 14;
  for (let j = 0; j <= bands; j++)
    for (let i = 0; i <= sectors; i++) {
      const a = (i * tau) / sectors,
        front = Math.max(0, Math.cos(a));
      const limit = 2.53 - 1.48 * front ** 2 + 0.06 * Math.sin(a * 3 + 0.4) * front;
      const p = 0.008 + ((limit - 0.008) * j) / bands;
      capPos.push(
        0.0695 * Math.sin(a) * Math.sin(p),
        0.083 + 0.069 * Math.cos(p),
        -0.004 + 0.061 * Math.cos(a) * Math.sin(p),
      );
      if (i < sectors && j < bands) {
        const k = j * (sectors + 1) + i;
        capIdx.push(k, k + sectors + 1, k + 1, k + 1, k + sectors + 1, k + sectors + 2);
      }
    }
  add(H, surface(capPos, capIdx), hair[0]);
  for (let s of [-1, 1])
    for (let i = 0; i < 7; i++) {
      const v = i / 6,
        a = 0.72 + i * 0.35;
      const p = [
        [0.012, 0.1495, -0.009 - i * 0.0017],
        [s * (0.028 + 0.014 * v), 0.15 - 0.008 * v, 0.013 - i * 0.007],
        [s * (0.045 + 0.012 * v), 0.136, 0.03 - i * 0.011],
        [s * (0.055 + 0.012 * Math.sin(a)), 0.117, 0.041 - i * 0.014],
        [s * (0.063 + 0.007 * Math.sin(a)), 0.09, 0.032 - i * 0.012],
        [s * 0.068, 0.078, 0.025 - i * 0.013],
      ];
      ribbon(
        H,
        hair[1 + (i % 2)],
        p,
        [0.003, 0.011, 0.01, 0.009, 0.007, 0.0005],
        [0.002, 0.004, 0.005, 0.005, 0.004, 0.001],
      );
      if (i % 2 === 0)
        ribbon(
          H,
          hair[3],
          p.map(([x, y, z]) => [x + s * 0.002, y + 0.002, z + 0.002]),
          [0.0001, 0.0005, 0.0007, 0.0006, 0.0004, 0.0001],
          [0.0003, 0.0006, 0.0007, 0.0005, 0.0004, 0.0002],
        );
    }
  for (let i = 0; i < 5; i++) {
    const y = i * 0.0022,
      z = i * 0.001;
    const p = [
      [0.033, 0.149 + y * 0.18, 0.008],
      [0.018, 0.145 + y, 0.03 + z],
      [-0.007, 0.139 + y, 0.045 + z],
      [-0.033, 0.136 + y, 0.046 + z],
      [-0.051, 0.123 + y, 0.039 + z],
      [-0.062, 0.101, 0.029 + z],
    ];
    ribbon(
      H,
      hair[1 + (i % 2)],
      p,
      [0.001, 0.005, 0.006, 0.005, 0.004, 0.0004],
      [0.001, 0.004, 0.003, 0.0027, 0.0026, 0.0003],
      24,
    );
  }
  const locks = [];
  for (let i = 0; i < 15; i++) {
    const a = 1.3 + ((tau - 2.6) * i) / 14,
      s = Math.sin(a),
      c = Math.cos(a);
    const root = node(H, 0.062 * s, 0.113 - 0.015 * (1 - c), -0.004 + 0.049 * c);
    const len = 0.166 + 0.026 * (1 - c) + 0.009 * Math.sin(i * 2.7),
      spread = 0.014 + 0.011 * Math.cos(i * 2) ** 2;
    const p = [];
    for (let j = 0; j < 8; j++) {
      const t = j / 7,
        wave = Math.sin(t * 9 + i * 0.65) * Math.sin(t * Math.PI);
      p.push([
        s * (spread * Math.sin(t * Math.PI) + 0.017 * t) + wave * 0.012,
        -len * t,
        c * (0.02 * Math.sin(t * Math.PI) + 0.02 * t) - 0.01 * t + Math.sin(t * 10 + i * 0.91) * 0.01 * t,
      ]);
    }
    ribbon(
      root,
      hair[i % 3],
      p,
      [0.002, 0.015, 0.019, 0.018, 0.016, 0.015, 0.013, 0.0005],
      [0.002, 0.015, 0.017, 0.017, 0.015, 0.013, 0.01, 0.0004],
      26,
    );
    const ridge = p.map(([x, y, z], j) => [
      x + s * 0.008 * Math.sin((j * Math.PI) / 7),
      y,
      z + c * 0.012 * Math.sin((j * Math.PI) / 7),
    ]);
    ribbon(
      root,
      hair[(i % 2) + 1],
      ridge,
      [0.001, 0.0023, 0.0036, 0.0022, 0.0021, 0.0016, 0.001, 0.0002],
      [0.001, 0.002, 0.002, 0.002, 0.0015, 0.0012, 0.001, 0.0002],
      24,
    );
    locks.push({ root, x: 0, z: 0, vx: 0, vz: 0, phase: i * 0.72 });
  }

  add(
    C,
    tailored([
      [-0.098, 0.069, 0.049],
      [-0.051, 0.069, 0.046],
      [0.005, 0.075, 0.048],
      [0.052, 0.091, 0.059, 0.004],
      [0.093, 0.095, 0.057, 0.005],
      [0.122, 0.094, 0.045],
      [0.139, 0.084, 0.04],
      [0.154, 0.034, 0.029],
    ]),
    skin,
  );
  const bodice = tailored([
    [-0.1, 0.0695, 0.05],
    [-0.047, 0.071, 0.048],
    [0.002, 0.078, 0.05],
    [0.055, 0.095, 0.061, 0.004],
    [0.108, 0.095, 0.059, 0.005],
  ]);
  const bp = bodice.attributes.position;
  for (let i = 4 * 36; i < 5 * 36; i++) {
    const a = ((i % 36) * tau) / 36;
    bp.setY(i, 0.125 - 0.064 * Math.max(0, Math.cos(a)) ** 4);
  }
  bodice.computeVertexNormals();
  add(C, bodice, silk);
  const dressRows = [
    [-0.236, 0.137, 0.099, -0.002],
    [-0.223, 0.135, 0.099],
    [-0.166, 0.121, 0.085],
    [-0.109, 0.11, 0.075],
    [-0.051, 0.105, 0.072],
    [0.01, 0.101, 0.068],
    [0.059, 0.085, 0.055],
    [0.08, 0.072, 0.05],
  ];
  const skirtShape = tailored(dressRows, 64, 0.055);
  const skirt = new T.Mesh(skirtShape, silk);
  skirt.castShadow = skirt.receiveShadow = true;
  skirt.frustumCulled = false;
  rig.hips.add(skirt);
  const skirtRest = skirtShape.attributes.position.array.slice();
  const position = skirtShape.attributes.position;
  position.setUsage(T.DynamicDrawUsage);
  const radiusLeft = [],
    envelope = [],
    hemMotion = [];
  for (let i = 0; i < position.count; i++) {
    const x = skirtRest[3 * i],
      y = skirtRest[3 * i + 1];
    radiusLeft.push(T.MathUtils.smoothstep(x, -0.042, 0.042));
    envelope.push(Math.max(0, -y));
    hemMotion.push(T.MathUtils.smoothstep(-y, 0.04, 0.23));
  }
  // Open satin panels hang off the shoulders. The bias-cut front edges flare below the waist.
  const jacket = node(C);
  const jacketRows = [
    [-0.118, 0.108, 0.076, 0.89],
    [-0.099, 0.104, 0.073, 0.87],
    [-0.055, 0.085, 0.061, 0.78],
    [-0.01, 0.079, 0.055, 0.72],
    [0.036, 0.088, 0.062, 0.69],
    [0.079, 0.1, 0.069, 0.59],
    [0.105, 0.101, 0.064, 0.5],
    [0.127, 0.101, 0.053, 0.44],
    [0.145, 0.095, 0.042, 0.33],
    [0.151, 0.041, 0.032, 0.31],
  ];
  const jp = [],
    ji = [];
  for (let j = 0; j < jacketRows.length; j++) {
    const [y, rx, rz, opening] = jacketRows[j];
    for (let i = 0; i <= 40; i++) {
      const a = opening + ((tau - 2 * opening) * i) / 40;
      const fold = 0.0025 * Math.sin(a * 9 + j * 0.13) * (1 - j / 12);
      jp.push(
        (rx + fold + 0.006) * Math.sin(a),
        y + (j === 0 ? 0.008 * Math.sin(a * 2) : 0),
        (rz + fold + 0.009) * Math.cos(a) + 0.002,
      );
      if (i < 40 && j + 1 < jacketRows.length) {
        const k = j * 41 + i;
        ji.push(k, k + 1, k + 41, k + 41, k + 1, k + 42);
      }
    }
  }
  const jacketShape = surface(jp, ji),
    jacketRest = jacketShape.attributes.position.array.slice();
  const jacketSkin = new T.Mesh(jacketShape, satin);
  jacketSkin.castShadow = jacketSkin.receiveShadow = true;
  jacket.add(jacketSkin);
  jacketShape.attributes.position.setUsage(T.DynamicDrawUsage);
  for (const s of [-1, 1]) {
    ribbon(
      C,
      facing,
      [
        [s * 0.029, 0.152, 0.024],
        [s * 0.039, 0.141, 0.049],
        [s * 0.051, 0.114, 0.062],
        [s * 0.045, 0.08, 0.075],
        [s * 0.049, 0.036, 0.064],
        [s * 0.054, 0.004, 0.05],
      ],
      [0.005, 0.012, 0.014, 0.009, 0.004, 0.001],
      [0.004, 0.004, 0.005, 0.004, 0.003, 0.002],
    );
    thread(
      C,
      binding,
      [
        [s * 0.031, 0.15, 0.03],
        [s * 0.045, 0.131, 0.049],
        [s * 0.058, 0.113, 0.052],
        [s * 0.049, 0.078, 0.065],
      ],
      0.00085,
    );
    ribbon(
      C,
      binding,
      [
        [s * 0.071, -0.051, 0.043],
        [s * 0.076, -0.045, 0.042],
        [s * 0.085, -0.037, 0.035],
      ],
      [0.0014, 0.0021, 0.0014],
      [0.001, 0.0015, 0.001],
    );
    for (let k = 0; k < 2; k++)
      oval(C, brass, s * (0.059 + k * 0.002), -0.019 - k * 0.032, 0.05 - k * 0.002, 0.0032, 0.0032, 0.002);
  }
  add(
    rig.hips,
    tailored([
      [0.061, 0.085, 0.061],
      [0.066, 0.083, 0.058],
      [0.079, 0.08, 0.055],
    ]),
    leather,
  );
  const buckle = node(rig.hips, 0, 0.071, 0.061);
  const bucklePoints = [
    [-0.013, -0.007, 0],
    [-0.014, 0.006, 0],
    [-0.01, 0.009, 0],
    [0.012, 0.009, 0],
    [0.014, 0.005, 0],
    [0.014, -0.006, 0],
    [0.01, -0.008, 0],
    [-0.013, -0.007, 0],
  ];
  thread(buckle, gold, bucklePoints, 0.0019);
  for (const [d, w] of [
    [0.109, 0.042],
    [0.09, 0.049],
  ]) {
    thread(
      C,
      gold,
      [
        [-w, 0.142, 0.039],
        [-w * 0.8, d + 0.01, 0.057],
        [-0.004, d, 0.067],
        [w * 0.72, d + 0.008, 0.061],
        [w, 0.14, 0.039],
      ],
      0.00135,
    );
  }
  oval(C, gold, 0.002, 0.084, 0.068, 0.0046, 0.0066, 0.0024);

  for (const [s, id] of [
    [1, 'L'],
    [-1, 'R'],
  ]) {
    const arm = rig['upperArm' + id],
      fore = rig['forearm' + id],
      hand = rig['hand' + id];
    add(
      arm,
      tailored([
        [-0.18, 0.024, 0.027],
        [-0.153, 0.027, 0.031],
        [-0.088, 0.03, 0.034],
        [-0.037, 0.037, 0.039],
        [0.002, 0.038, 0.038],
        [0.024, 0.027, 0.03],
        [0.03, 0.003, 0.005],
      ]),
      satin,
    );
    add(
      fore,
      tailored([
        [-0.141, 0.022, 0.025],
        [-0.125, 0.023, 0.025],
        [-0.119, 0.028, 0.029],
        [-0.094, 0.026, 0.028],
        [-0.038, 0.029, 0.032],
        [-0.012, 0.028, 0.031],
        [0.008, 0.022, 0.024],
      ]),
      satin,
    );
    add(
      fore,
      tailored([
        [-0.145, 0.022, 0.024],
        [-0.139, 0.023, 0.026],
        [-0.131, 0.024, 0.026],
      ]),
      facing,
    );
    oval(fore, brass, s * 0.023, -0.133, 0, 0.0018, 0.003, 0.003);
    oval(hand, skin, 0, -0.023, 0.004, 0.019, 0.032, 0.013, 0, 0, s * 0.05);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * 0.0081,
        y = -0.047 + (k === 0 ? 0.006 : k === 3 ? 0.004 : 0);
      oval(hand, skin, x, y, 0.006, 0.0047, 0.0175 - (k === 0 ? 0.003 : 0), 0.0058, -0.28);
    }
    oval(hand, skin, -s * 0.016, -0.022, 0.012, 0.007, 0.018, 0.007, -0.24, 0, -s * 0.25);
    const thigh = rig['thigh' + id],
      shin = rig['shin' + id],
      foot = rig['foot' + id];
    add(
      thigh,
      tailored([
        [-0.25, 0.026, 0.027],
        [-0.2, 0.029, 0.031],
        [-0.102, 0.039, 0.045],
        [-0.037, 0.046, 0.046],
        [0.009, 0.042, 0.044],
      ]),
      skin,
    );
    add(
      shin,
      tailored([
        [-0.231, 0.018, 0.02],
        [-0.205, 0.019, 0.022],
        [-0.141, 0.023, 0.026, -0.004],
        [-0.073, 0.032, 0.037, -0.005],
        [-0.027, 0.027, 0.03],
        [0.004, 0.026, 0.027],
      ]),
      skin,
    );
    // A low stacked heel and flexible forefoot both meet the sole plane.
    oval(foot, sole, 0, -0.039, 0.024, 0.029, 0.008, 0.069);
    oval(foot, leather, 0, -0.025, 0.029, 0.03, 0.021, 0.066, -0.032);
    oval(foot, leather, 0, -0.004, -0.002, 0.026, 0.032, 0.028);
    oval(foot, facing, 0, -0.015, 0.071, 0.018, 0.003, 0.01, -0.12);
    ring(foot, brass, s * 0.025, -0.005, 0.005, 0.005, 0.0011, 0, Math.PI / 2);
  }

  // Archive lantern hangs from a brass bail in Roma's right hand.
  const lantern = node(rig.handR, -0.01, -0.046, 0.02);
  thread(
    lantern,
    brass,
    [
      [-0.016, -0.034, 0],
      [-0.023, -0.019, 0],
      [-0.017, -0.003, 0],
      [0, 0.004, 0],
      [0.017, -0.003, 0],
      [0.023, -0.019, 0],
      [0.016, -0.034, 0],
    ],
    0.002,
  );
  add(
    lantern,
    tailored(
      [
        [-0.048, 0.031, 0.03],
        [-0.044, 0.032, 0.031],
        [-0.035, 0.021, 0.022],
        [-0.031, 0.014, 0.015],
      ],
      8,
    ),
    brass,
  );
  add(
    lantern,
    tailored(
      [
        [-0.101, 0.024, 0.023],
        [-0.096, 0.03, 0.029],
        [-0.091, 0.028, 0.027],
      ],
      8,
    ),
    brass,
  );
  add(
    lantern,
    tailored(
      [
        [-0.093, 0.023, 0.022],
        [-0.076, 0.027, 0.026],
        [-0.046, 0.026, 0.025],
      ],
      8,
    ),
    prism,
  );
  oval(lantern, glow, 0, -0.074, 0, 0.01, 0.018, 0.01);
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) * Math.PI) / 2,
      x = Math.sin(a),
      z = Math.cos(a);
    thread(
      lantern,
      brass,
      [
        [x * 0.025, -0.094, z * 0.025],
        [x * 0.029, -0.065, z * 0.029],
        [x * 0.027, -0.044, z * 0.027],
      ],
      0.0018,
    );
  }

  // A narrow saddle strap wraps both sides of the shoulder and attaches to the satchel.
  ribbon(
    C,
    leather,
    [
      [0.073, 0.146, -0.031],
      [0.075, 0.149, 0.004],
      [0.073, 0.134, 0.044],
      [0.037, 0.078, 0.07],
      [-0.015, 0.018, 0.06],
      [-0.067, -0.056, 0.045],
      [-0.107, -0.083, 0.012],
      [-0.099, -0.095, -0.045],
    ],
    [0.006, 0.0062, 0.006, 0.0059, 0.006, 0.006, 0.006, 0.006],
    [0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
  );
  ribbon(
    C,
    leather,
    [
      [0.073, 0.146, -0.031],
      [0.046, 0.1, -0.053],
      [-0.005, 0.033, -0.06],
      [-0.058, -0.05, -0.048],
      [-0.091, -0.095, -0.074],
    ],
    [0.006, 0.006, 0.006, 0.006, 0.006],
    [0.002, 0.002, 0.002, 0.002, 0.002],
  );
  const bag = node(rig.hips, -0.086, 0.023, -0.062);
  oval(bag, leather, -0.006, -0.027, 0, 0.017, 0.038, 0.043, 0, 0, -0.08);
  oval(bag, binding, -0.019, -0.014, 0.001, 0.007, 0.021, 0.042);
  oval(bag, brass, -0.026, -0.023, 0.001, 0.002, 0.0045, 0.0045);

  for (const [parent, list] of buckets) {
    for (const [mat, pieces] of list) {
      const g = mergeGeometries(pieces),
        m = new T.Mesh(g, mat);
      m.castShadow = !mat.transparent;
      m.receiveShadow = true;
      parent.add(m);
      for (const piece of pieces) piece.dispose();
    }
  }
  let hem = 0,
    hemV = 0,
    hang = 0,
    hangV = 0,
    bagPitch = 0,
    bagV = 0,
    skirtSwing = 0,
    skirtV = 0;
  const step = (f) => {
    // Give the satin cuffs clearance beside the flared jacket hem and the satchel strap.
    rig.upperArmL.rotation.z += 0.075;
    rig.upperArmR.rotation.z -= 0.075;
    const dt = Math.min(0.035, f.dt),
      speed = f.speed,
      t = f.time,
      phase = f.phase;
    const moving = Math.min(1, speed / 3.89),
      lateral = T.MathUtils.clamp(f.turn, -1, 1);
    const hop = T.MathUtils.clamp(f.vy, -3, 3);
    const lift = f.emote >= 0 ? Math.sin(Math.PI * f.emote) ** 1.1 : 0;
    if (lift > 0) {
      rig.upperArmR.rotation.x -= lift * 1.16;
      rig.upperArmR.rotation.z -= lift * 0.21;
      rig.forearmR.rotation.x -= lift * 1.33;
      H.rotation.y -= lift * 0.37;
      H.rotation.z += lift * 0.075;
    }
    const blinkPhase = (t + 1.1) % 4.45,
      blink = Math.max(0.075, 1 - Math.exp(-((blinkPhase - 0.16) ** 2) / 0.003));
    const glance = 0.0016 * Math.sin(0.78 * t + 0.9) * Math.sin(0.39 * t);
    for (let k = 0; k < lids.length; k++) {
      lids[k].scale.y = blink;
      pupils[k].position.x = -0.0007 + glance * (k === 0 ? -1 : 1);
    }
    for (const strand of locks) {
      const gx = 0.11 * moving + 0.045 * moving * Math.sin(phase + strand.phase) + 0.047 * hop;
      const gz = 0.095 * lateral + 0.024 * moving * Math.cos(phase + strand.phase);
      strand.vx += (59 * (gx - strand.x) - 11 * strand.vx) * dt;
      strand.vz += (59 * (gz - strand.z) - 10.5 * strand.vz) * dt;
      strand.x += strand.vx * dt;
      strand.z += strand.vz * dt;
      strand.root.rotation.x = strand.x;
      strand.root.rotation.z = strand.z;
    }
    // The skirt follows each supporting thigh. Spring inertia delays the weighted hem.
    const left = rig.thighL.rotation.x,
      right = rig.thighR.rotation.x;
    const leftZ = -Math.sin(left) * 0.9,
      rightZ = -Math.sin(right) * 0.9;
    const leftY = 1 - Math.cos(left),
      rightY = 1 - Math.cos(right);
    skirtV += (70 * (0.006 * moving * Math.sin(phase) + 0.0018 * hop - skirtSwing) - 12 * skirtV) * dt;
    skirtSwing += skirtV * dt;
    for (let i = 0; i < position.count; i++) {
      const w = radiusLeft[i],
        length = envelope[i],
        flutter = hemMotion[i];
      const y = skirtRest[3 * i + 1] + length * (leftY * w + rightY * (1 - w)) * 0.57;
      const z = skirtRest[3 * i + 2] + length * (leftZ * w + rightZ * (1 - w)) + flutter * skirtSwing;
      position.setXYZ(i, skirtRest[i * 3] + flutter * 0.007 * lateral, y, z);
    }
    position.needsUpdate = true;
    hemV += (76 * (0.007 * moving * Math.sin(phase * 0.98) + 0.0018 * hop - hem) - 13 * hemV) * dt;
    hem += hemV * dt;
    const jpos = jacketShape.attributes.position;
    for (let i = 0; i < 3 * 41; i++) {
      const weight = Math.max(0, -jacketRest[i * 3 + 1]) / 0.118;
      jpos.setXYZ(
        i,
        jacketRest[i * 3] + lateral * 0.008 * weight,
        jacketRest[i * 3 + 1],
        jacketRest[i * 3 + 2] + hem * weight,
      );
    }
    jpos.needsUpdate = true;
    const targetHang = -(
      rig.upperArmR.rotation.x +
      rig.forearmR.rotation.x +
      rig.handR.rotation.x +
      rig.chest.rotation.x
    );
    hangV += (80 * (targetHang - hang) - 12 * hangV) * dt;
    hang += hangV * dt;
    lantern.rotation.x = hang;
    lantern.rotation.z = -rig.upperArmR.rotation.z * 0.75;
    const targetBag = 0.12 * moving + 0.16 * moving * Math.sin(phase + 0.3) + 0.07 * hop;
    bagV += (57 * (targetBag - bagPitch) - 9 * bagV) * dt;
    bagPitch += bagV * dt;
    bag.rotation.x = bagPitch;
    bag.position.y = 0.023 + 0.007 * moving * Math.cos(2 * phase - 0.5);
  };
  return step;
}
