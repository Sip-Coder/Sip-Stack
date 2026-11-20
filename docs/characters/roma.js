// Roma's garments, features and curls are constructed in joint-local coordinates.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHair } from './hair.js';
import { makeRomaGroom } from './roma-groom.js';
import { bindRunningHold } from './roma-curl-response.js';
import { fitRomaAccessories } from './roma-accessories.js';
import { makeRomaBody, makeJacketPattern, bindJointFans } from './roma-body.js';
import { fitRomaGarment } from './roma-tailoring.js';
import { detailMaterial } from './material-detail.js';
import { fitRomaFigure, originalRomaJoints, romaFigure } from './roma-figure.js';

const tau = Math.PI * 2;
const xyz = (x, y, z) => new T.Vector3(x, y, z);
const thighProfile = [
  [-0.25, 0.026, 0.027],
  [-0.2, 0.029, 0.031],
  [-0.102, 0.039, 0.045],
  [-0.037, 0.046, 0.046],
  [0.009, 0.042, 0.044],
];

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
  const g = surface(pos, idx),
    uv = [];
  for (let j = 0; j <= slices; j++) for (let i = 0; i < sides; i++) uv.push(j / slices, i / sides);
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return g;
}

function seam(points, radius) {
  return new T.TubeGeometry(new T.CatmullRomCurve3(points.map((p) => xyz(...p))), 16, radius, 6, false);
}

export function buildRoma(rig) {
  const paint = (color, roughness = 0.72, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const skin = paint('#c68a56', 0.65),
    blush = paint('#c57e5c'),
    lips = paint('#a14241', 0.56);
  const inside = paint('#47141f'),
    teeth = paint('#edd3a5'),
    sclera = paint('#f5ead7', 0.36);
  const iris = paint('#6f3d00', 0.29),
    pupil = new T.MeshPhysicalMaterial({ color: '#19000c', roughness: 0.27, specularIntensity: 0.3 }),
    catchlight = paint('#fff6da', 0.15);
  const browInk = new T.MeshPhysicalMaterial({ color: '#271118', roughness: 0.58, specularIntensity: 0.45 });
  const hair = [
    ['#1c0b15', 0.327],
    ['#2c1015', 0.481],
    ['#431f14', 0.568],
    ['#582900', 1],
  ].map(([color, specularIntensity]) => {
    const mat = new T.MeshPhysicalMaterial({
      color,
      specularIntensity,
      roughness: 0.48,
      anisotropy: 0.67,
      sheen: 0.58,
      sheenColor: '#704b3d',
      sheenRoughness: 0.6,
      vertexColors: true,
    });
    detailMaterial(mat, 'hair');
    return mat;
  });
  const satin = new T.MeshPhysicalMaterial({
    color: '#c4a047',
    roughness: 0.29,
    metalness: 0.88,
    clearcoat: 0.77,
    clearcoatRoughness: 0.23,
    sheen: 0.85,
    sheenColor: '#e1b875',
    sheenRoughness: 0.56,
    side: T.DoubleSide,
  });
  const facing = paint('#ab863c', 0.32, 0.76),
    binding = paint('#cda962', 0.58),
    gold = paint('#f9ce65', 0.27, 0.73);
  const silk = new T.MeshPhysicalMaterial({
    color: '#075553',
    specularIntensity: 0.273,
    roughness: 0.6,
    sheen: 0.65,
    sheenColor: '#35775d',
    sheenRoughness: 0.53,
    side: T.DoubleSide,
  });
  const leather = paint('#934000', 0.59),
    sole = paint('#431f07'),
    brass = paint('#c0964b', 0.37, 0.64);
  const glow = new T.MeshStandardMaterial({
    color: '#ffb18f',
    emissive: '#ffad49',
    emissiveIntensity: 0.7,
    roughness: 0.23,
  });
  const prism = new T.MeshPhysicalMaterial({
    color: '#ffc764',
    transparent: true,
    opacity: 0.564,
    roughness: 0.13,
    depthWrite: false,
  });
  for (const [type, materials] of [
    ['skin', [skin]],
    ['silk', [silk]],
    ['gold', [satin, facing, gold]],
    ['leather', [binding, leather]],
    ['metal', [brass]],
  ])
    for (const material of materials) detailMaterial(material, type);
  const buckets = new Map(),
    renderBatches = new Map();
  const nailLacquer = paint('#d79880', 0.42);
  for (const [id, mat] of Object.entries({
    skin,
    blush,
    lip: lips,
    mouth: inside,
    teeth,
    eyeWhite: sclera,
    iris,
    pupil,
    catchlight,
    brow: browInk,
    curlDeep: hair[0],
    curlBase: hair[1],
    curlWarm: hair[2],
    curlLight: hair[3],
    satin,
    facing,
    binding,
    jewelry: gold,
    dress: silk,
    leather,
    sole,
    brass,
    wick: glow,
    glass: prism,
    nail: nailLacquer,
  }))
    mat.userData.blueprintId = id;
  const ankleCuffs = {};
  const layer = (parent, mat) => renderBatches.get(parent)?.get(mat);

  let faceSkin;
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
    g.applyMatrix4(transform);
    const points = g.attributes.position;
    if (!g.attributes.uv) {
      const uv = [];
      for (let i = 0; i < points.count; i++) {
        const x = points.getX(i),
          y = points.getY(i),
          z = points.getZ(i);
        uv.push(0.5 + Math.atan2(x, z) / tau, y * 4);
      }
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    }
    let group = buckets.get(parent);
    if (!group) buckets.set(parent, (group = new Map()));
    let pieces = group.get(mat);
    if (!pieces) group.set(mat, (pieces = []));
    pieces.push(g);
  }
  const oval = (parent, mat, x, y, z, rx, ry, rz, ax = 0, ay = 0, az = 0) =>
    add(parent, sphere, mat, x, y, z, rx, ry, rz, ax, ay, az);
  const ribbon = (parent, mat, p, w, d, n = 18, sides = 8) => add(parent, sweep(p, w, d, n, sides), mat);
  const thread = (parent, mat, p, r) => add(parent, seam(p, r), mat);
  const ring = (parent, mat, x, y, z, r, t, ax = 0, ay = 0, az = 0) =>
    add(parent, new T.TorusGeometry(r, t, 7, 32), mat, x, y, z, 1, 1, 1, ax, ay, az);

  // Pear-shaped face with an inset jaw, high cheeks and a narrow chin.
  const H = node(rig.head, 0, -0.01, 0),
    C = rig.chest;
  H.name = 'Roma face and hair';
  H.scale.set(1.85, 1.91, 1.88);
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
      0.0038 * gauss(0, 0.061, 0.0095, 0.017) +
      0.0118 * gauss(0, 0.0455, 0.0095, 0.0092) +
      0.0032 * (gauss(0.01, 0.045, 0.006, 0.005) + gauss(-0.01, 0.045, 0.006, 0.005));
    const cheek = gauss(0.041, 0.063, 0.016, 0.009) + gauss(-0.041, 0.063, 0.016, 0.009);
    const orbitalFold = gauss(0.029, 0.059, 0.02, 0.0075) + gauss(-0.029, 0.059, 0.02, 0.0075);
    const chinPlane =
      0.0082 *
      T.MathUtils.smoothstep(y, 0.013, 0.024) *
      (1 - T.MathUtils.smoothstep(y, 0.038, 0.047)) *
      front ** 3;
    const bridgePlane = 0.0039 * gauss(0, 0.064, 0.019, 0.009);
    cheekPos.setZ(i, z + nose + cheek * 0.003 + 0.0032 * orbitalFold - chinPlane - bridgePlane);
    colors.push(1 + 0.06 * cheek, 1 - 0.13 * cheek, 1 - 0.12 * cheek);
  }
  const faceIndices = Array.from(cheeks.index.array),
    crown = 64 * 96;
  for (let k = 1; k < 95; k++) faceIndices.push(0, k + 1, k, crown, crown + k, crown + k + 1);
  cheeks.setIndex(faceIndices);
  cheeks.computeVertexNormals();
  cheeks.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const skinTint = paint('#c68a56', 0.65);
  detailMaterial(skinTint, 'skin');
  skinTint.userData.blueprintId = 'skin';
  skinTint.vertexColors = true;
  add(H, cheeks, skinTint);
  for (const s of [-1, 1]) {
    // The alar wings turn down and in. Their shallow crescent is tucked into
    // the lower edge of the sculpted nose, so the tip reads from the front.
    oval(H, skin, s * 0.0073, 0.0445, 0.0601, 0.0056, 0.0045, 0.0053, 0, s * 0.22, -s * 0.14);
    ribbon(
      H,
      inside,
      [
        [s * 0.0036, 0.043, 0.0664],
        [s * 0.0067, 0.0425, 0.0659],
        [s * 0.0096, 0.0434, 0.0648],
        [s * 0.0112, 0.0446, 0.0633],
      ],
      [0.00009, 0.00086, 0.00081, 0.00008],
      [0.00008, 0.0006, 0.0005, 0.00006],
      12,
      7,
    );
    oval(H, skin, s * 0.064, 0.058, -0.003, 0.012, 0.018, 0.01, 0, 0, -s * 0.18);
    oval(H, blush, s * 0.07, 0.058, 0.003, 0.0055, 0.01, 0.0045);
    oval(H, gold, s * 0.069, 0.049, 0.013, 0.0038, 0.0035, 0.0035);
    ring(H, gold, s * 0.07, 0.0385, 0.012, 0.0104, 0.0016, 0, s * 0.3);
  }

  // Three freckles on the lit cheek under her right eye.
  for (const [x, y, z] of [
    [-0.04, 0.051, 0.0481],
    [-0.044, 0.0545, 0.0459],
    [-0.048, 0.05, 0.041],
  ])
    oval(H, blush, x, y, z, 0.0012, 0.00095, 0.001);
  const lids = [],
    brows = [],
    pupils = [];
  // The iris and pupil conform to the globe. Both lids sweep over the same
  // ellipsoid, so a blink occludes the pupil without shrinking it.
  const ex = 0.0245,
    ey = 0.019,
    ez = 0.0091;
  const eyeZ = (x, y) => ez * Math.sqrt(Math.max(0, 1 - (x / ex) ** 2 - (y / ey) ** 2));
  function irisDisk(cx, cy, rx, ry, offset) {
    const pos = [],
      idx = [],
      rings = 6,
      steps = 32;
    for (let k = 0; k <= rings; k++)
      for (let i = 0; i < steps; i++) {
        const a = (tau * i) / steps,
          x = cx + ((rx * k) / rings) * Math.cos(a),
          y = cy + ((ry * k) / rings) * Math.sin(a);
        pos.push(x, y, eyeZ(x, y) + offset);
        if (k) {
          const a0 = (k - 1) * steps + i,
            a1 = (k - 1) * steps + ((i + 1) % steps);
          idx.push(a0, a0 + steps, a1, a1, a0 + steps, a1 + steps);
        }
      }
    return surface(pos, idx);
  }
  function eyelid(eye, upper) {
    const n = 22,
      bands = 5,
      pos = [],
      normals = [],
      indices = [];
    for (let row = 0; row <= bands; row++)
      for (let i = 0; i <= n; i++) {
        pos.push(0, 0, 0);
        normals.push(0, 0, 1);
        if (row < bands && i < n) {
          const a = row * (n + 1) + i;
          indices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
        }
      }
    const geo = surface(pos, indices),
      coords = geo.attributes.position;
    const normal = new T.Float32BufferAttribute(normals, 3);
    geo.setAttribute('normal', normal);
    const makeup = upper ? paint('#c57d5c', 0.66) : skin.clone();
    makeup.userData.blueprintId = upper ? 'blush' : 'skin';
    makeup.side = T.DoubleSide;
    const lid = new T.Mesh(geo, makeup);
    lid.frustumCulled = false;
    eye.add(lid);
    const lash = upper ? new T.Mesh(surface(pos, indices), browInk) : null;
    if (lash) {
      lash.frustumCulled = false;
      eye.add(lash);
    }
    const cached = [];
    for (let i = 0; i <= n; i++) {
      const u = -0.996 + (i / n) * 1.992;
      cached.push([u, Math.sqrt(1 - u * u)]);
    }
    return (closed, laugh) => {
      const edge = upper ? 0.76 - (1.34 * closed + 0.13 * laugh) : -0.62 + 0.08 * closed + 0.17 * laugh;
      for (let j = 0; j <= bands; j++)
        for (let i = 0; i <= n; i++) {
          const [u, v] = cached[i],
            k = j * (n + 1) + i,
            tilt = 0.0019 * u;
          const rim = edge + u * 0.045;
          const a = upper
            ? T.MathUtils.lerp(rim, Math.PI * 0.59, j / bands)
            : T.MathUtils.lerp(-Math.PI * 0.59, rim, j / bands);
          const x = ex * u,
            y = (ey + 0.0013) * v * Math.sin(a) + tilt,
            z = (ez + 0.0019) * v * Math.cos(a) + 0.0009 - 0.0024 * v * (1 - Math.cos(a));
          coords.setXYZ(k, x, y, z);
          normal.setXYZ(k, u * 0.47, (upper ? 0.32 : 0.17) * v * Math.sin(a), 0.6 + 0.4 * v * Math.cos(a));
          if (lash) {
            const b = rim + (j / bands) * 0.095;
            lash.geometry.attributes.position.setXYZ(
              k,
              x,
              (ey + 0.0016) * v * Math.sin(b) + tilt,
              (ez + 0.0021) * v * Math.cos(b) + 0.001,
            );
          }
        }
      coords.needsUpdate = normal.needsUpdate = true;
      if (lash) {
        lash.geometry.attributes.position.needsUpdate = true;
        lash.geometry.attributes.normal.array.set(normal.array);
        lash.geometry.attributes.normal.needsUpdate = true;
      }
    };
  }
  for (const side of [-1, 1]) {
    const orbit = node(H, side * 0.029, 0.075, 0.056);
    orbit.rotation.y = side * 0.34;
    orbit.rotation.z = side * 0.036;
    const eye = node(orbit);
    eye.scale.x = side;
    oval(eye, sclera, 0, 0, 0, ex, ey, ez);
    const gaze = node(eye);
    pupils.push(gaze);
    add(gaze, irisDisk(-0.001, 0.001, 0.0126, 0.015, 0.00035), pupil);
    add(gaze, irisDisk(-0.001, 0.001, 0.0114, 0.014, 0.00055), iris);
    add(gaze, irisDisk(-0.001, 0.001, 0.0063, 0.0097, 0.00086), pupil);
    oval(gaze, catchlight, -0.005, 0.0078, eyeZ(-0.005, 0.0078) + 0.0012, 0.0026, 0.0032, 0.0007);
    oval(gaze, teeth, 0.003, -0.004, eyeZ(0.003, -0.004) + 0.0011, 0.001, 0.0013, 0.0006);
    lids.push(eyelid(eye, true), eyelid(eye, false));
    const brow = node(H, side * 0.03, 0.105, 0.053);
    brows.push(brow);
    ribbon(
      brow,
      browInk,
      [
        [side * -0.02, -0.004, 0.006],
        [side * -0.008, 0.001, 0.005],
        [side * 0.008, 0.003, -0.003],
        [side * 0.02, -0.002, -0.011],
      ],
      [0.0009, 0.0032, 0.0029, 0.00035],
      [0.0015, 0.0016, 0.0012, 0.0003],
    );
  }
  // A parted crescent smile has a dark oral cavity, slim upper teeth and a modelled lower lip.
  const smile = node(H);
  ribbon(
    smile,
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
    smile,
    teeth,
    [
      [-0.022, 0.0415, 0.052],
      [-0.012, 0.04, 0.0585],
      [0, 0.04, 0.061],
      [0.013, 0.041, 0.0585],
      [0.023, 0.043, 0.051],
    ],
    [0.0002, 0.0012, 0.0013, 0.0011, 0.0002],
    [0.0003, 0.001, 0.001, 0.001, 0.0003],
  );
  ribbon(
    smile,
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

  ribbon(
    smile,
    lips,
    [
      [-0.024, 0.041, 0.0516],
      [-0.012, 0.0406, 0.0573],
      [-0.003, 0.0418, 0.0605],
      [0, 0.0407, 0.0609],
      [0.003, 0.0418, 0.0604],
      [0.013, 0.0414, 0.0583],
      [0.024, 0.0431, 0.0515],
    ],
    [0.00012, 0.0011, 0.00125, 0.001, 0.00125, 0.00095, 0.0001],
    [0.00008, 0.00065, 0.00075, 0.0006, 0.0007, 0.00055, 0.00007],
    27,
    9,
  );
  const locks = makeRomaGroom(H, hair);
  const dressRows = [
    [-0.257, 0.15, 0.097, -0.02],
    [-0.244, 0.15, 0.097, -0.02],
    [-0.202, 0.145, 0.096, -0.016],
    [-0.147, 0.139, 0.093, -0.011],
    [-0.09, 0.132, 0.091, -0.0076],
    [-0.022, 0.124, 0.082, -0.0042],
    [0.008, 0.116, 0.079, -0.0056],
    [0.026, 0.105, 0.069],
    [0.0516, 0.088, 0.062],
  ];
  const skirtShape = tailored(dressRows, 64, 0.025);
  skirtShape.userData.isSkirt = true;
  // Include the full knee tuck and spring excursion in the roll broadphase.
  skirtShape.computeBoundingSphere();
  skirtShape.boundingSphere.radius += 0.3;
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
  jacket.scale.set(1.065, 1, 1.085);
  const jacketRows = [
    [-0.095, 0.105, 0.075, 0.89],
    [-0.084, 0.101, 0.071, 0.87],
    [-0.055, 0.085, 0.061, 0.78],
    [-0.01, 0.079, 0.055, 0.72],
    [0.003, 0.083, 0.058, 0.67],
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
      // Front quarters round over the bodice. The free rear edge follows the
      // flatter plane of the skirt beneath it, easing into the sewn waist.
      const rearDart =
        0.024 * T.MathUtils.smoothstep(-Math.cos(a), 0.08, 0.94) * T.MathUtils.clamp(-y / 0.095, 0, 1);
      const frontDrape =
        0.009 *
        T.MathUtils.smoothstep(Math.cos(a), 0.15, 0.72) *
        T.MathUtils.smoothstep(y, -0.043, -0.014) *
        (1 - T.MathUtils.smoothstep(y, 0.047, 0.079));
      // Ease the sewn waist over the belt at each side. Both the upper yoke
      // edge and its lower support inherit this same cut through seamRing().
      const sideEase =
        0.01 *
        T.MathUtils.smoothstep(y, -0.063, -0.011) *
        T.MathUtils.smoothstep(Math.abs(Math.sin(a)), 0.48, 0.93);
      jp.push(
        (rx + fold + 0.006 + sideEase) * Math.sin(a),
        y + (j === 0 ? 0.008 * Math.sin(a * 2) : 0),
        (rz + fold + 0.009 - rearDart) * Math.cos(a) + 0.002 + frontDrape,
      );
      if (i < 40 && j < 4) {
        const k = j * 41 + i;
        ji.push(k, k + 1, k + 41, k + 41, k + 1, k + 42);
      }
    }
  }
  const jacketShape = surface(jp, ji),
    jacketRest = jacketShape.attributes.position.array.slice();
  jacketShape.computeBoundingSphere();
  jacketShape.boundingSphere.radius += 0.18;
  const jacketSkin = new T.Mesh(jacketShape, satin);
  jacketSkin.castShadow = jacketSkin.receiveShadow = true;
  jacket.add(jacketSkin);
  jacketShape.attributes.position.setUsage(T.DynamicDrawUsage);
  for (const s of [-1, 1]) {
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
      [0.061, 0.089, 0.065],
      [0.066, 0.087, 0.063],
      [0.079, 0.087, 0.062],
    ]),
    leather,
  );
  const buckle = node(rig.hips, 0, 0.071, 0.0665);
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
    const arm = rig['upperArm' + id];
    arm.position.x = s * 0.144;
    const foot = rig['foot' + id];
    const cuff = node(foot, 0, 0.015, -0.003);
    cuff.name = 'Roma ankle cuff ' + id;
    add(cuff, new T.TorusGeometry(0.027, 0.0021, 8, 36), leather, 0, 0, 0, 1, 1.12, 1, Math.PI / 2);
    ankleCuffs[id] = cuff;
    // A low stacked heel and flexible forefoot both meet the sole plane.
    oval(foot, sole, 0, -0.039, 0.024, 0.029, 0.008, 0.069);
    oval(foot, leather, 0, -0.021, 0.029, 0.03, 0.025, 0.063, -0.032);
    oval(foot, leather, 0, -0.004, -0.0035, 0.026, 0.032, 0.03);
    oval(foot, facing, 0, -0.015, 0.071, 0.018, 0.003, 0.01, -0.12);
    ring(foot, brass, s * 0.025, -0.005, 0.005, 0.005, 0.0011, 0, Math.PI / 2);
  }

  // Archive lantern hangs from a brass bail in Roma's left hand.
  const lantern = node(rig.handL, 0.002, -0.053, 0.018);
  lantern.scale.set(1.13, 1.23, 1.13);
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
      6,
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
      6,
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
      6,
    ),
    prism,
  );
  oval(lantern, glow, 0, -0.074, 0, 0.01, 0.018, 0.01);
  for (let i = 0; i < 6; i++) {
    const a = (i * tau) / 6,
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

  const bag = node(rig.hips, -0.148, 0.023, -0.121);
  // Structured calfskin saddlebag with a domed flap and a stitched gusset.
  const body = tailored([
    [-0.08, 0.002, 0.013],
    [-0.077, 0.016, 0.04],
    [-0.067, 0.023, 0.052],
    [-0.046, 0.025, 0.055],
    [-0.02, 0.024, 0.054],
    [-0.009, 0.018, 0.049],
    [-0.006, 0.002, 0.041],
  ]);
  add(bag, body, leather);
  oval(bag, binding, -0.019, -0.027, 0.001, 0.011, 0.03, 0.055);
  thread(
    bag,
    brass,
    [
      [-0.024, -0.033, -0.044],
      [-0.029, -0.047, -0.028],
      [-0.03, -0.055, 0.001],
      [-0.029, -0.047, 0.03],
      [-0.024, -0.032, 0.047],
    ],
    0.001,
  );
  oval(bag, leather, -0.026, -0.049, 0, 0.004, 0.012, 0.006);
  oval(bag, gold, -0.03, -0.043, 0, 0.0027, 0.0045, 0.005);
  ring(bag, brass, 0, -0.005, -0.041, 0.007, 0.0016, 0, Math.PI * 0.5);
  ring(bag, brass, 0, -0.005, 0.041, 0.007, 0.0016, 0, Math.PI * 0.5);
  for (const [parent, list] of buckets) {
    for (const [mat, pieces] of list) {
      const g = mergeGeometries(pieces);
      const m = new T.Mesh(g, mat);
      if (!renderBatches.has(parent)) renderBatches.set(parent, new Map());
      renderBatches.get(parent).set(mat, m);
      if (mat === skinTint) {
        m.name = 'Roma facial skin';
        faceSkin = m;
      }
      m.castShadow = !mat.transparent;
      m.receiveShadow = true;
      if (parent === C) m.scale.set(1.065, 1, 1.085);
      if (parent === rig.shinL || parent === rig.shinR) m.scale.set(1.16, 1, 1.13);
      if (parent === rig.footL || parent === rig.footR) m.scale.set(1.13, 1, 1.06);
      if (parent === rig.upperArmL || parent === rig.upperArmR) m.scale.set(1.09, 1, 1.1);
      if (parent === rig.forearmL || parent === rig.forearmR) m.scale.set(1.08, 1, 1.07);
      if (parent === rig.hips) m.scale.set(1.075, 1, 1.09);
      parent.add(m);
      for (const piece of pieces) piece.dispose();
    }
  }
  const { mesh: bodyMesh, regions: bodyRegions } = makeRomaBody(rig, skin, nailLacquer);
  jacketSkin.updateWorldMatrix(true, false);
  const toBind = new T.Matrix4().copy(rig.root.matrixWorld).invert().multiply(jacketSkin.matrixWorld);
  const seamRing = (row) =>
    Array.from({ length: 41 }, (_, i) =>
      new T.Vector3().fromBufferAttribute(jacketShape.attributes.position, row * 41 + i).applyMatrix4(toBind),
    );
  const waist = { edge: seamRing(4), support: seamRing(3) };
  const white = new Float32Array(jacketShape.attributes.position.count * 3);
  white.fill(1);
  jacketShape.setAttribute('color', new T.BufferAttribute(white, 3));
  satin.vertexColors = true;
  const yoke = fitRomaGarment(bodyMesh, 'jacket', satin, facing, makeJacketPattern(), waist);
  const waistNormalTransform = new T.Matrix3().getNormalMatrix(toBind.clone().invert());
  for (const geometry of [yoke.geometry, yoke.userData.mobileGeometry]) {
    const normals = geometry.userData.waistNormals,
      v = new T.Vector3();
    for (let i = 0; i < 41; i++)
      v.fromArray(normals, i * 3)
        .applyNormalMatrix(waistNormalTransform)
        .toArray(normals, i * 3);
  }
  const bodice = fitRomaGarment(bodyMesh, 'dress', silk, silk);
  const patterns = [bodyMesh, yoke, bodice];
  const originalJoints = originalRomaJoints(rig);
  const bandSelection = (mesh, side, test) => {
    const vertices = {};
    for (const [tier, g] of [
      ['high', mesh.geometry],
      ['mobile', mesh.userData.mobileGeometry],
    ]) {
      const p = g.attributes.position,
        chosen = [];
      for (let i = 0; i < p.count; i++)
        if (side * p.getX(i) > 0 && test(Math.abs(p.getX(i)), p.getY(i), p.getZ(i))) chosen.push(i);
      vertices[tier] = chosen;
    }
    return { mesh, vertices };
  };
  const shoulderBands = [1, -1].map((s) =>
    bandSelection(yoke, s, (x, y) => x > 0.101 && y > 0.758 && y < 0.825),
  );
  const kneeBands = [1, -1].map((s) =>
    bandSelection(bodyMesh, s, (x, y, z) => x > 0.04 && y > 0.268 && y < 0.282 && z > 0.022),
  );
  const skinBends = bindJointFans(rig, patterns, () =>
    fitRomaFigure(rig, patterns, originalJoints, ankleCuffs, jacket, buckle),
  );
  const collar = [yoke];
  const sleeveFolds = [];
  const shoulderCaps = [];
  const colliders = [
    { role: 'head', node: H, center: [0, 0.075, 0.004], radii: [0.072, 0.08, 0.065] },
    { role: 'neck', node: C, center: [0, 0.18, 0], radii: [0.034, 0.039, 0.03] },
    { role: 'back', node: C, center: [0, 0.091, -0.029], radii: [0.108, 0.069, 0.056] },
    { role: 'back', node: C, center: [0, 0.119, -0.012], radii: [0.11, 0.06, 0.063] },
  ];
  for (const [side, joint] of [
    [1, rig.upperArmL],
    [-1, rig.upperArmR],
  ]) {
    const fold = new T.Group();
    fold.name = 'Roma folded upper sleeve';
    joint.add(fold);
    sleeveFolds.push(fold);
    const cap = new T.Group();
    cap.name = 'Roma padded sleeve crown';
    joint.add(cap);
    shoulderCaps.push(cap);
    const elbow = side > 0 ? rig.forearmL : rig.forearmR;
    colliders.push(
      // The shaped sleeve crown rolls forward over the humerus during a tuck.
      // Cover the actual anterior cloth fold as well as the underlying shoulder.
      {
        role: 'shoulder',
        node: cap,
        sleeveJoint: joint,
        center: [0, -0.013, 0.005],
        radii: [0.051, 0.056, 0.066],
      },
      {
        role: 'shoulder',
        node: fold,
        sleeveJoint: joint,
        center: [0, -0.083, 0],
        radii: [0.045, 0.078, 0.047],
      },
      {
        role: 'sleeve',
        node: elbow,
        sleeveJoint: joint,
        center: [0, -0.016, 0],
        radii: [0.046, 0.074, 0.046],
      },
      {
        role: 'sleeve',
        node: elbow,
        sleeveJoint: joint,
        center: [0, -0.095, 0],
        radii: [0.033, 0.078, 0.036],
      },
      { role: 'collar', node: C, center: [side * 0.056, 0.11, 0.062], radii: [0.029, 0.057, 0.025] },
      { role: 'collar', node: C, center: [side * 0.06, 0.062, 0.061], radii: [0.026, 0.049, 0.024] },
      { role: 'collar', node: C, center: [side * 0.087, 0.086, 0.034], radii: [0.033, 0.048, 0.044] },
      { role: 'back', node: C, center: [side * 0.082, 0.095, -0.038], radii: [0.035, 0.059, 0.049] },
    );
  }
  // Grade each moving obstacle with the corresponding fitted coat section.
  for (const shape of colliders) {
    if (shape.node === H) continue;
    const scale = [1.15, 0.83, 1.22];
    shape.center = shape.center.map((v, i) => v * scale[i]);
    shape.radii = shape.radii.map((v, i) => v * scale[i]);
  }
  const curlSystem = createHair(rig, colliders);
  for (let k = 0; k < locks.length; k++) {
    const strand = locks[k],
      face = strand.role === 'face';
    const tipDepth = strand.group.position.z + strand.points.at(-1).z;
    curlSystem.add(strand.group, strand.points, {
      sleeveRoute: new T.Vector3(0.18 * strand.side, 0, Math.sign(tipDepth) || -1).normalize(),
      role: strand.role,
      breathingBend: strand.breathingBend,
      gaitCoupling: strand.gaitCoupling,
      fanSide: strand.side,
      stiffness: face ? 89 + (k % 3) * 8 : 107 + (k % 5) * 7,
      damping: face ? 9.8 + (k % 3) * 0.7 : 12.2 + (k % 3) * 0.5,
      maxOffset: strand.maxOffset,
      radius: strand.radius,
    });
  }
  bindRunningHold(curlSystem, locks);
  // A damped spring field drives the free cloth rings toward their tailored
  // silhouettes. Collision constraints use the animated legs in garment space.
  skirt.name = 'Roma dress';
  jacketSkin.name = 'Roma jacket';
  bag.name = 'Bag';
  skirtShape.userData.rest = skirtRest;
  jacketShape.userData.rest = jacketRest;
  const skirtVelocity = new Float32Array(3 * position.count);
  const jacketVelocity = new Float32Array(3 * jacketShape.attributes.position.count);
  const hipsToJacket = new T.Matrix4(),
    thighToJacket = new T.Matrix4(),
    legRotation = new T.Quaternion();
  let minimumHemY = -Infinity;
  const capsule = (r, s) => ({ a: xyz(), b: xyz(), radiusA: r, radiusB: s });
  const skirtCapsules = [],
    jacketCapsules = [];
  for (let i = 0; i < 2; i++) {
    skirtCapsules.push(
      capsule(0.06, 0.053),
      capsule(0.053, 0.043),
      capsule(0.043, 0.053),
      capsule(0.053, 0.032),
    );
    jacketCapsules.push(capsule(0.063, 0.056));
  }
  const kneeSupports = [skirtCapsules[2], skirtCapsules[3], skirtCapsules[6], skirtCapsules[7]];
  const jacketBody = [
    [-0.121, 0.101, 0.06, 0.011],
    [-0.096, 0.097, 0.056, 0.01],
    [-0.064, 0.085, 0.0515, 0.0055],
    [-0.035, 0.071, 0.049, 0],
    [0.002, 0.078, 0.05, 0],
    [0.055, 0.095, 0.061, 0.004],
    [0.093, 0.097, 0.063, 0.004],
    [0.127, 0.096, 0.049, 0],
    [0.151, 0.043, 0.03, 0],
  ];
  function clothNormals(geometry, columns, wrap) {
    const pos = geometry.attributes.position.array,
      norm = geometry.attributes.normal,
      rows = pos.length / (3 * columns);
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < columns; i++) {
        const a = (row * columns + (wrap ? (i - 1 + columns) % columns : Math.max(i - 1, 0))) * 3;
        const b = (row * columns + (wrap ? (i + 1) % columns : Math.min(i + 1, columns - 1))) * 3;
        const c = (Math.max(row - 1, 0) * columns + i) * 3,
          d = (Math.min(row + 1, rows - 1) * columns + i) * 3;
        const ux = pos[b] - pos[a],
          uy = pos[b + 1] - pos[a + 1],
          uz = pos[b + 2] - pos[a + 2];
        const vx = pos[d] - pos[c],
          vy = pos[d + 1] - pos[c + 1],
          vz = pos[d + 2] - pos[c + 2];
        const x = uy * vz - uz * vy,
          y = uz * vx - ux * vz,
          z = ux * vy - uy * vx,
          length = Math.hypot(x, y, z) || 1;
        norm.setXYZ(row * columns + i, x / length, y / length, z / length);
      }
    norm.needsUpdate = true;
  }
  function updateCapsules() {
    rig.hips.updateWorldMatrix(true, false);
    jacket.updateWorldMatrix(true, false);
    hipsToJacket.copy(jacket.matrixWorld).invert().multiply(rig.hips.matrixWorld);
    minimumHemY = -Infinity;
    for (let i = 0; i < 2; i++) {
      const thigh = i ? rig.thighR : rig.thighL,
        shin = i ? rig.shinR : rig.shinL;
      // The lowest rows of the cropped jacket ride up over the high hip on a banked
      // turn. Use the vertical support of each real elliptical thigh cross-section.
      thigh.updateMatrix();
      thighToJacket.multiplyMatrices(hipsToJacket, thigh.matrix);
      const e = thighToJacket.elements;
      for (const [y, rx, rz] of thighProfile)
        minimumHemY = Math.max(
          minimumHemY,
          e[13] + e[5] * y * 0.745 + Math.hypot(e[1] * rx * 1.28, e[9] * rz * 1.16) + 0.004,
        );
      const n = i * 4,
        a = skirtCapsules[n],
        b = skirtCapsules[n + 1],
        c = skirtCapsules[n + 2],
        d = skirtCapsules[n + 3];
      a.a.copy(thigh.position);
      a.b.set(0, -0.082, 0).applyQuaternion(thigh.quaternion).add(a.a);
      b.a.copy(a.b);
      b.b.copy(shin.position).applyQuaternion(thigh.quaternion).add(a.a);
      legRotation.multiplyQuaternions(thigh.quaternion, shin.quaternion);
      c.a.copy(b.b);
      c.b.set(0, -0.065, -0.006).applyQuaternion(legRotation).add(c.a);
      d.a.copy(c.b);
      d.b.set(0, -0.188, 0).applyQuaternion(legRotation).add(c.a);
      jacketCapsules[i].a.copy(a.a).applyMatrix4(hipsToJacket);
      jacketCapsules[i].b.copy(a.b).applyMatrix4(hipsToJacket);
    }
  }
  // Adjacent rings share one outward half-space for each azimuth. Keeping the
  // whole panel on the outside of the leg prevents a large triangle from
  // passing through a knee between two individually valid cloth vertices.
  let uprightDrape = 0;
  // The warp sections over the hips are elliptical. Where the thigh hangs
  // down, their outward normal has X/Z ratio (depth/width)^2; use the full
  // radial support as the raised knee distorts those sections during a tuck.
  const hipBias = 1 - (dressRows[5][2] / dressRows[5][1]) ** 2;
  function outsidePanel(p, x, z, colliders, verticalMargin, roundKnee = false) {
    if (roundKnee) x *= 1 - uprightDrape * T.MathUtils.smoothstep(p.y, -0.15, -0.02);
    const radius = Math.hypot(x, z) || 1,
      nx = x / radius,
      nz = z / radius;
    let limit = -Infinity;
    for (const c of colliders) {
      const r = Math.max(c.radiusA, c.radiusB) + 0.003;
      const low = p.y - verticalMargin - r,
        high = p.y + verticalMargin + r;
      const dy = c.b.y - c.a.y;
      if (Math.min(c.a.y, c.b.y) > high || Math.max(c.a.y, c.b.y) < low) continue;
      let lo = 0,
        hi = 1;
      if (Math.abs(dy) > 0.00001) {
        const l = (low - c.a.y) / dy,
          h = (high - c.a.y) / dy;
        lo = Math.max(0, Math.min(l, h));
        hi = Math.min(1, Math.max(l, h));
      }
      const da = nx * c.a.x + nz * c.a.z,
        dd = nx * (c.b.x - c.a.x) + nz * (c.b.z - c.a.z);
      if (!roundKnee) {
        limit = Math.max(limit, da + Math.max(dd * lo, dd * hi) + r);
        continue;
      }
      // The spherical wall tapers away above and below a bent knee. Take its
      // support at this panel's height so the fold rounds over the knee cap.
      const slope = Math.abs(dy) > 0.00001 ? dd / dy : 0;
      const crestHeight =
        p.y + Math.sign(slope) * verticalMargin + (slope * r) / Math.sqrt(1 + slope * slope);
      const crest = Math.abs(dy) > 0.00001 ? T.MathUtils.clamp((crestHeight - c.a.y) / dy, 0, 1) : 0;
      for (let sample = 0; sample < 3; sample++) {
        const t = sample === 2 ? crest : sample;
        const offset = Math.max(0, Math.abs(p.y - (c.a.y + t * dy)) - verticalMargin);
        if (offset <= r)
          limit = Math.max(limit, da + t * dd + Math.sqrt(Math.max(0, r * r - offset * offset)));
      }
    }
    const gap = limit - (p.x * nx + p.z * nz);
    if (gap > 0) {
      p.x += nx * gap;
      p.z += nz * gap;
    }
  }
  const simulated = xyz(),
    old = xyz(),
    goal = xyz();
  function solveCapsule(p, c) {
    const dx = c.b.x - c.a.x,
      dy = c.b.y - c.a.y,
      dz = c.b.z - c.a.z;
    const u = T.MathUtils.clamp(
      ((p.x - c.a.x) * dx + (p.y - c.a.y) * dy + (p.z - c.a.z) * dz) / (dx * dx + dy * dy + dz * dz),
      0,
      1,
    );
    const x = c.a.x + dx * u,
      y = c.a.y + dy * u,
      z = c.a.z + dz * u;
    const r = c.radiusA + (c.radiusB - c.radiusA) * u + 0.003;
    const len = Math.hypot(p.x - x, p.y - y, p.z - z);
    if (len < r && len > 1e-8) {
      const k = r / len;
      p.set(x + (p.x - x) * k, y + (p.y - y) * k, z + (p.z - z) * k);
    }
  }
  function solveBodice(p) {
    let j = 1;
    while (j < jacketBody.length - 1 && p.y > jacketBody[j][0]) j++;
    const lo = jacketBody[j - 1],
      hi = jacketBody[j],
      u = T.MathUtils.clamp((p.y - lo[0]) / (hi[0] - lo[0]), 0, 1);
    const rx = T.MathUtils.lerp(lo[1], hi[1], u) + 0.002,
      rz = T.MathUtils.lerp(lo[2], hi[2], u) + 0.002,
      cz = T.MathUtils.lerp(lo[3], hi[3], u);
    const n = Math.hypot(p.x / rx, (p.z - cz) / rz);
    if (n < 1 && n > 0.0001) {
      p.x /= n;
      p.z = cz + (p.z - cz) / n;
    }
  }
  function integrate(i, attr, vel, k, damping, dt, colliders, isJacket) {
    const n = i * 3;
    old.fromBufferAttribute(attr, i);
    vel[n] += (k * (goal.x - old.x) - damping * vel[n]) * dt;
    vel[n + 1] += (k * (goal.y - old.y) - damping * vel[n + 1]) * dt;
    vel[n + 2] += (k * (goal.z - old.z) - damping * vel[n + 2]) * dt;
    simulated.set(old.x + vel[n] * dt, old.y + vel[n + 1] * dt, old.z + vel[n + 2] * dt);
    const rest = isJacket ? jacketRest : skirtRest;
    if (isJacket) {
      // When a tucked thigh reaches the waist, the free panel folds outward.
      // Keep a little height separation between its rings, so it cannot pass
      // upward through its own sewn yoke.
      const foldedHem = -0.014 + (rest[n + 1] + 0.055) * 0.3;
      const tuck = Math.max(simulated.y, minimumHemY) > foldedHem;
      simulated.y = Math.min(foldedHem, Math.max(simulated.y, minimumHemY));
      for (let pass = 0; pass < 3; pass++) {
        for (const c of colliders) solveCapsule(simulated, c);
        solveBodice(simulated);
      }
      if (tuck) {
        simulated.y = Math.min(foldedHem, simulated.y);
        outsidePanel(simulated, rest[n], rest[n + 2], colliders, 0.032);
      }
    } else outsidePanel(simulated, rest[n], rest[n + 2], colliders, 0.029, true);
    attr.setXYZ(i, simulated.x, simulated.y, simulated.z);
    // A positional contact projection clears the moving collider but does
    // not impart the full separation distance as a one-tick launch impulse.
    vel[n] = T.MathUtils.clamp(vel[n], -1.1, 1.1);
    vel[n + 1] = T.MathUtils.clamp(vel[n + 1], -1.1, 1.1);
    vel[n + 2] = T.MathUtils.clamp(vel[n + 2], -1.1, 1.1);
  }
  const accessories = fitRomaAccessories(rig, bag, skirt, jacketSkin, leather, binding, silk, [
    yoke,
    bodice,
    bodyMesh,
  ]);
  const surfaces = {
    'body-face': faceSkin,
    body: bodyMesh,
    bodice,
    skirt: [skirt, accessories.hem],
    jacket: [jacketSkin, yoke, accessories.jacketHem],
    belt: layer(rig.hips, leather),
    strap: accessories.strap,
    bag: [layer(bag, leather), layer(bag, binding)],
  };
  const pairs = [];
  for (const [outer, inner] of [
    ['bodice', 'body'],
    ['skirt', 'body'],
    ['jacket', 'body'],
    ['jacket', 'bodice'],
    ['jacket', 'skirt'],
    ['belt', 'skirt'],
    ['belt', 'bodice'],
    ['strap', 'jacket'],
    ['strap', 'bodice'],
    ['bag', 'skirt'],
    ['bag', 'jacket'],
  ])
    pairs.push({ outer, inner });
  const joinedWaist = yoke.geometry.userData.waistEdge;
  const mobileWaist = yoke.userData.mobileGeometry.userData.waistEdge;
  const seams = [
    ['L', 0, 21],
    ['R', 20, 41],
  ].map(([side, lo, hi]) => ({
    name: 'jacket-' + side,
    edge: {
      mesh: jacketSkin,
      indices: Array.from({ length: hi - lo }, (_, i) => 4 * 41 + lo + i),
      closed: false,
    },
    mate: {
      mesh: yoke,
      indices: { high: joinedWaist.slice(lo, hi), mobile: mobileWaist.slice(lo, hi) },
      closed: false,
    },
  }));
  const outerPanels = [
    {
      name: 'jacket-yoke',
      mesh: yoke,
      boundaryLoops: 3,
      triangles: {
        high: [[0, yoke.geometry.userData.outerTriangles]],
        mobile: [[0, yoke.userData.mobileGeometry.userData.outerTriangles]],
      },
    },
  ];
  rig.garments = { surfaces, pairs, seams, outerPanels };
  const part = (label, ...parts) => ({ label, parts });
  const groomMeshes = [];
  H.traverse((o) => {
    if (o.isMesh && hair.includes(o.material)) groomMeshes.push(o);
  });
  rig.blueprint = {
    groom: part('Crown and all spiral curls', ...groomMeshes),
    chin: part('Mandible', faceSkin),
    eyes: [1, 0].map((k) => part('Iris', layer(pupils[k], iris))),
    shoulders: shoulderBands.map((v) => part('Outer sleeve on the deltoid', v)),
    waist: part('Waist belt', surfaces.belt),
    knee: kneeBands.map((v) => part('Patella', v)),
    ankleCuff: ['L', 'R'].map((s) => part('Rolled ankle cuff', ankleCuffs[s])),
  };
  rig.secondary ??= {};
  rig.secondary.roma = {
    hair: curlSystem,
    faceSkin,
    body: bodyMesh,
    bodyRegions,
    bodice,
    yoke,
    collar,
    neck: bodyMesh,
    upperBack: jacketSkin,
    panels: {
      skirt: [
        { tip: 4, anchor: 452 },
        { tip: 36, anchor: 484 },
      ],
      jacket: [
        { tip: 1, anchor: 124 },
        { tip: 21, anchor: 144 },
      ],
    },
    skirt,
    jacket: jacketSkin,
    bag,
    skirtCapsules,
    jacketCapsules,
    jacketBody,
  };
  let hang = 0,
    hangV = 0,
    bagPitch = 0,
    bagV = 0,
    bagSide = 0,
    bagSideV = 0,
    bagLift = 0,
    bagLiftV = 0,
    lastSpeed = 0,
    lastVy = 0,
    lastTime = -Infinity,
    balance = 0,
    previousHipY = NaN,
    previousHipV = 0,
    bobLoad = 0,
    previousHipX = NaN,
    previousHipVX = 0,
    sideLoad = 0;
  const armNames = ['upperArmL', 'upperArmR'],
    elbowNames = ['forearmL', 'forearmR'];
  const step = (f) => {
    const resetCloth = f.time <= lastTime || !Number.isFinite(lastTime);
    if (resetCloth) {
      skirtShape.attributes.position.array.set(skirtRest);
      jacketShape.attributes.position.array.set(jacketRest);
      previousHipY = previousHipX = NaN;
      previousHipV = previousHipVX = bobLoad = sideLoad = 0;
      skirtVelocity.fill(0);
      jacketVelocity.fill(0);
      hang =
        hangV =
        bagPitch =
        bagV =
        bagSide =
        bagSideV =
        bagLift =
        bagLiftV =
        lastSpeed =
        lastVy =
        balance =
          0;
    }
    lastTime = f.time;
    // Give the satin cuffs clearance beside the flared jacket hem and the satchel strap.
    // Counterbalance the torso bank with the outside arm on a tight running turn.
    const crouch = T.MathUtils.smoothstep(romaFigure.hips - rig.hips.position.y, 0.05, 0.23);
    rig.upperArmL.rotation.z += 0.26 * crouch;
    rig.upperArmR.rotation.z -= 0.26 * crouch;
    const bankTarget = T.MathUtils.clamp(f.turn * f.speed * 0.033, -0.37, 0.37);
    balance += (bankTarget - balance) * (1 - Math.exp(-f.dt * 17));
    rig.upperArmL.rotation.z += 0.031 + 0.16 * Math.min(1, f.speed / 3.89) + Math.max(0, balance);
    rig.upperArmR.rotation.z -= 0.031 + 0.16 * Math.min(1, f.speed / 3.89) + Math.max(0, -balance);
    const dt = Math.min(0.035, f.dt),
      speed = f.speed,
      t = f.time,
      phase = f.phase;
    const moving = Math.min(1, speed / 3.89),
      lateral = T.MathUtils.clamp(f.turn, -1, 1);
    const hop = T.MathUtils.clamp(f.vy, -3, 3);
    const hipY = rig.hips.position.y;
    const hipV = Number.isFinite(previousHipY) ? (hipY - previousHipY) / dt : 0;
    const hipAccel = T.MathUtils.clamp((hipV - previousHipV) / dt, -14, 14);
    bobLoad += (hipAccel - bobLoad) * (1 - Math.exp(-dt * 15));
    previousHipY = hipY;
    previousHipV = hipV;
    const hipX = rig.hips.position.x;
    const hipVX = Number.isFinite(previousHipX) ? (hipX - previousHipX) / dt : 0;
    const hipAX = T.MathUtils.clamp((hipVX - previousHipVX) / dt, -8, 8);
    sideLoad += (hipAX + hipVX * 10 - sideLoad) * (1 - Math.exp(-dt * 22));
    previousHipX = hipX;
    previousHipVX = hipVX;
    // In a quiet stance, track with the eyes and keep the shoulder-supported curls settled.
    rig.head.rotation.y *= 0.15;
    const breath = f.breath ?? Math.sin(t * 1.31);
    const lift = f.emote >= 0 ? Math.sin(Math.PI * f.emote) ** 1.1 : 0;
    if (lift > 0) {
      rig.upperArmL.rotation.x -= lift * 1.2;
      rig.upperArmL.rotation.z += lift * 0.26;
      rig.forearmL.rotation.x -= lift * 0.86;
      rig.head.rotation.y += lift * 0.37;
      rig.head.rotation.z -= lift * 0.075;
    }
    const accel = T.MathUtils.clamp((speed - lastSpeed) / dt, -10, 10);
    // In compression the bent side rolls and the outer woven face stays taut.
    for (let k = 0; k < 2; k++) {
      const arm = rig[armNames[k]].rotation,
        elbow = rig[elbowNames[k]].rotation;
      yoke.morphTargetInfluences[2 * k] = T.MathUtils.smoothstep(Math.abs(elbow.x), 0.12, 1.94);
      yoke.morphTargetInfluences[2 * k + 1] = T.MathUtils.smoothstep(
        Math.abs(arm.z) + Math.abs(arm.x) * 0.5,
        0.15,
        1.7,
      );
      yoke.morphTargetInfluences[4 + k] = T.MathUtils.smoothstep(-arm.x, 0.11, 1.28);
      // The folded cloth widens on the medial, forward-facing part of the
      // upper sleeve. Follow that same fold as the hand approaches the face.
      const fold = sleeveFolds[k];
      const tuck = T.MathUtils.smoothstep(Math.max(-arm.x, Math.abs(arm.z)), 0.55, 1.03);
      fold.position.set((k ? 1 : -1) * 0.017 * tuck, 0.012 * tuck, 0.021 * tuck);
      fold.scale.set(1 + 0.27 * tuck, 1, 1 + 0.46 * tuck);
      // The coat bunches over the inside shoulder as the torso banks.
      // Use the eased physical chest angle to release the gusset smoothly.
      const bank = T.MathUtils.smoothstep((k ? -1 : 1) * rig.chest.rotation.z, 0.09, 0.23);
      shoulderCaps[k].scale.y = 1 + (0.01 / 0.056) * bank;
      // As the runner accelerates, the backward arm picks up the slack at
      // the front of the sleeve. The fold falls back as speed levels out.
      const backswing =
        T.MathUtils.smoothstep(arm.x, 0.44, 0.63) *
        T.MathUtils.smoothstep(speed, 2.8, 3.6) *
        T.MathUtils.smoothstep(accel, 0.35, 1.7);
      shoulderCaps[k].position.y = 0.0111 * bank + 0.0024 * backswing;
    }
    skinBends();
    const blinkPhase = (t + 1.1) % 4.45;
    const blink = Math.exp(-((blinkPhase - 0.16) ** 2) / 0.0015);
    const laugh = lift * (0.78 + 0.22 * Math.sin(f.emote * 17));
    const glance = 0.0015 * Math.sin(0.78 * t + 0.9) * Math.sin(0.39 * t);
    for (const lid of lids) lid(blink, laugh);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      pupils[i].position.x = side * (glance - 0.0027 * lift);
      pupils[i].position.y = 0.0012 * lift;
      brows[i].position.y = 0.105 + lift * (i ? 0.0035 : 0.005) - blink * 0.002;
      brows[i].rotation.z = side * (lift * 0.075 - 0.025 * blink);
    }
    smile.scale.set(1 + 0.09 * laugh, 1 + 0.38 * laugh, 1);
    smile.position.y = -0.0045 - 0.038 * 0.38 * laugh;
    smile.position.z = -0.0055;
    // The previous tick's unconstrained panel positions belong only to that
    // continuous take. A reset begins with the fitted neutral garment.
    if (!resetCloth) accessories.release();
    updateCapsules();
    let liftedKnee = -Infinity;
    for (const c of kneeSupports) liftedKnee = Math.max(liftedKnee, Math.max(c.a.y, c.b.y) + c.radiusA);
    uprightDrape = hipBias * (1 - T.MathUtils.smoothstep(liftedKnee, -0.13, -0.069));
    const left = rig.thighL.rotation.x,
      right = rig.thighR.rotation.x;
    const leftZ = -Math.sin(left),
      rightZ = -Math.sin(right);
    const leftY = 1 - Math.cos(left),
      rightY = 1 - Math.cos(right);
    const flare = Math.min(0.19, Math.abs(f.turn) * moving * 0.024 + 0.044 * moving);
    for (let i = 0; i < 6 * 64; i++) {
      const n = i * 3,
        w = radiusLeft[i],
        length = envelope[i],
        flutter = hemMotion[i];
      const sway = Math.cos(phase * 0.5 + 0.27) * moving * 0.008;
      const expand = 1 + flutter * flare;
      goal.set(
        skirtRest[n] * expand + flutter * (sway + lateral * 0.01),
        skirtRest[n + 1] + length * (leftY * w + rightY * (1 - w)) * 0.74 + flutter * flare * 0.032,
        skirtRest[n + 2] * expand +
          length * (leftZ * w + rightZ * (1 - w)) * 0.93 +
          flutter * (0.007 * moving * Math.sin(phase) + 0.0018 * hop),
      );
      integrate(i, position, skirtVelocity, 112, 12.9, dt, skirtCapsules, false);
    }
    // A narrow bias panel between the swinging skirt and the anchored waist
    // unfolds over a high knee. The waistband stays attached to the pelvis.
    // Let the upper bias panel open progressively as the patella approaches
    // the hip. The last ring stays sewn into the waist throughout the fold.
    const hipFold = T.MathUtils.smoothstep(liftedKnee, -0.11, -0.069);
    for (let i = 6 * 64; i < 8 * 64; i++) {
      const n = i * 3,
        lower = i < 7 * 64;
      simulated.set(skirtRest[n], skirtRest[n + 1], skirtRest[n + 2]);
      if (lower || hipFold > 0) {
        outsidePanel(simulated, skirtRest[n], skirtRest[n + 2], skirtCapsules, lower ? 0.019 : 0.017, true);
        if (!lower) {
          simulated.x = T.MathUtils.lerp(skirtRest[n], simulated.x, hipFold);
          simulated.z = T.MathUtils.lerp(skirtRest[n + 2], simulated.z, hipFold);
        }
      }
      position.setXYZ(i, simulated.x, simulated.y, simulated.z);
    }
    position.needsUpdate = true;
    clothNormals(skirtShape, 64, true);
    const jpos = jacketShape.attributes.position;
    for (let i = 0; i < 3 * 41; i++) {
      const n = i * 3,
        x = jacketRest[n],
        y = jacketRest[n + 1],
        z = jacketRest[n + 2],
        weight = Math.max(0, -y) / 0.118;
      // Open front quarters lift independently; the back vent trails both.
      const side = x >= 0 ? 1 : -1,
        front = z > 0,
        trail = front ? Math.max(0, -Math.sin(side * phase)) : 0.55 + 0.45 * Math.cos(phase);
      const rideUp = Math.max(0, minimumHemY + 0.095);
      const lowerBob = Math.max(0, bobLoad) * 0.027;
      const spread =
        0.047 * moving +
        0.091 * Math.abs(lateral) * moving +
        0.081 * moving * trail +
        lowerBob * (front ? 0.57 : 1);
      const folded =
        Math.sin(8 * Math.atan2(x, z) + 0.47 * side) * (0.0018 * moving + 0.00042 * Math.abs(bobLoad));
      const chestLift = 0.0016 * breath;
      // Air under the open quarters adds ease as the chest expands; both
      // corners still share their pinned waist seam with the rear panel.
      const breathFlare = front
        ? (0.0014 + 0.0014 * breath) *
          (1 - T.MathUtils.smoothstep(speed, 0.12, 0.95)) *
          T.MathUtils.smoothstep(z, 0.005, 0.052)
        : 0;
      const edgeRadius = Math.hypot(x, z);
      goal.set(
        x * (1 + (spread * 0.45 + breathFlare / edgeRadius) * weight) +
          (lateral * 0.003 - 0.0023 * sideLoad) * weight,
        y + weight * (0.005 * trail * moving + rideUp + 0.0009 * bobLoad + chestLift),
        z * (1 + (spread + breathFlare / edgeRadius) * weight) +
          weight *
            (0.0021 * hop -
              0.009 * moving +
              side * 0.006 * lateral +
              folded +
              (front ? chestLift : -0.45 * chestLift)),
      );
      integrate(i, jpos, jacketVelocity, front ? 211 : 174, front ? 22 : 19.7, dt, jacketCapsules, true);
    }
    // The upper placket moves with the sternum; the collar and waist attachment
    // rows remain pinned so its lower corners can oppose the body's motion.
    for (let i = 5 * 41; i < 9 * 41; i++) {
      const n = i * 3,
        y = jacketRest[n + 1],
        front = jacketRest[n + 2] > 0.008;
      const pulse = breath * Math.max(0, 1 - Math.abs(y - 0.089) / 0.057) * (front ? 0.0017 : 0.0006);
      jpos.setXYZ(
        i,
        jacketRest[n] * (1 + pulse * 2),
        y + pulse * 0.24,
        jacketRest[n + 2] + (front ? pulse : -pulse),
      );
    }
    jpos.needsUpdate = true;
    clothNormals(jacketShape, 41, false);
    const targetHang = -(
      rig.upperArmL.rotation.x +
      rig.forearmL.rotation.x +
      rig.handL.rotation.x +
      rig.chest.rotation.x
    );
    hangV += (80 * (targetHang - hang) - 12 * hangV) * dt;
    hang += hangV * dt;
    lantern.rotation.x = hang;
    lantern.rotation.z = -rig.upperArmL.rotation.z * 0.75;
    const landing = T.MathUtils.clamp((f.vy - lastVy) / dt, -14, 14);
    lastSpeed = speed;
    lastVy = f.vy;
    const targetBag = 0.12 * moving + 0.28 * moving * Math.sin(phase - 0.4) + 0.025 * accel + 0.035 * hop;
    bagV += (64 * (targetBag - bagPitch) - 8.4 * bagV) * dt;
    bagPitch += bagV * dt;
    bagSideV +=
      (51 * (0.2 * lateral * moving + 0.075 * moving * Math.cos(phase) - bagSide) - 8.9 * bagSideV) * dt;
    bagSide += bagSideV * dt;
    bagLiftV +=
      (98 * (0.011 * moving * (0.5 + 0.5 * Math.cos(phase * 2)) - 0.0005 * landing - bagLift) -
        9.7 * bagLiftV) *
      dt;
    bagLift += bagLiftV * dt;
    bag.rotation.set(bagPitch, 1.14 + bagSide, -0.14 + bagSide * 0.33);
    bag.position.y = -0.014 + bagLift;
    const tailLift = 0.0021 * Math.min(1, moving * 3.1) * T.MathUtils.smoothstep(bobLoad, -0.75, 1.5);
    accessories.update(tailLift);
    jacketShape.attributes.normal.array.set(yoke.geometry.userData.waistNormals, 4 * 41 * 3);
    jacketShape.attributes.normal.needsUpdate = true;
    curlSystem.step(f);
  };
  return step;
}
