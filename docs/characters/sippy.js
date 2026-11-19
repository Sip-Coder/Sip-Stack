// The vineyard sommelier. All dimensions here are fractions of standing height.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tau = Math.PI * 2;
const vec = (x, y, z) => new T.Vector3(x, y, z);
const group = (parent, x = 0, y = 0, z = 0) => {
  const g = new T.Group();
  parent.add(g);
  g.position.set(x, y, z);
  return g;
};

function surface(color, roughness = 0.65, extra = {}) {
  return new T.MeshStandardMaterial({ color, roughness, ...extra });
}
function mesh(parent, shape, material, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(shape, material);
  m.position.set(x, y, z);
  m.castShadow = !material.transparent;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function ellipsoid(p, mat, x, y, z, rx, ry, rz) {
  const shape = new T.SphereGeometry(1, 24, 16);
  shape.scale(rx, ry, rz);
  return mesh(p, shape, mat, x, y, z);
}
// Cross sections are [height, half width, half depth, forward offset].
// The offset gives the jaw, shoes, nose and tailored jacket independent profiles.
function rings(rows, count = 40) {
  const vertices = [],
    indices = [];
  const profiles = new T.CatmullRomCurve3(
    rows.map((r) => vec(r[1], r[0], r[2])),
    false,
    'catmullrom',
    0.32,
  );
  const offsets = new T.CatmullRomCurve3(
    rows.map((r) => vec(r[3] || 0, r[0], 0)),
    false,
    'catmullrom',
    0.32,
  );
  const layers = (rows.length - 1) * 3;
  for (let j = 0; j <= layers; j++) {
    const v = profiles.getPoint(j / layers),
      offset = offsets.getPoint(j / layers).x;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * tau;
      vertices.push(v.x * Math.sin(angle), v.y, offset + v.z * Math.cos(angle));
      if (j < layers) {
        const a = j * count + i,
          b = j * count + ((i + 1) % count);
        indices.push(a, b, a + count, b, b + count, a + count);
      }
    }
  }
  // Isolate cap normals from the side loop. Sharing the end fan would
  // darken the first pinstripe at every cuff, knee and jacket hem.
  for (const j of [0, layers]) {
    const row = rows[j === 0 ? 0 : rows.length - 1],
      center = vertices.length / 3;
    vertices.push(0, row[0], row[3] || 0);
    for (let i = 0; i < count; i++) {
      const k = (j * count + i) * 3;
      vertices.push(vertices[k], vertices[k + 1], vertices[k + 2]);
    }
    for (let i = 0; i < count; i++) {
      const a = center + 1 + i,
        b = center + 1 + ((i + 1) % count);
      if (j === 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function stroke(parent, mat, coords, w, facets = 7) {
  const path = new T.CatmullRomCurve3(coords.map((c) => vec(...c)));
  return mesh(parent, new T.TubeGeometry(path, Math.max(5, coords.length * 3), w, facets), mat);
}
// Tapered locks, brows and fingers have elliptical, continuously turning sections.
function sweep(parent, mat, coords, width, depth, thickEnd = 0.04) {
  const path = new T.CatmullRomCurve3(
    coords.map((c) => vec(...c)),
    false,
    'catmullrom',
    0.45,
  );
  const n = coords.length * 4,
    sides = 10,
    p = [],
    index = [];
  const frames = path.computeFrenetFrames(n, false);
  for (let i = 0; i <= n; i++) {
    const u = i / n,
      center = path.getPointAt(u);
    const scale = thickEnd + (1 - thickEnd) * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.48);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * tau;
      const v = center
        .clone()
        .addScaledVector(frames.normals[i], width * Math.cos(a) * scale)
        .addScaledVector(frames.binormals[i], depth * Math.sin(a) * scale);
      p.push(v.x, v.y, v.z);
      if (i < n) {
        const k = i * sides + j,
          next = i * sides + ((j + 1) % sides);
        index.push(k, next, k + sides, next, next + sides, k + sides);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return mesh(parent, g, mat);
}
function panel(parent, mat, outline) {
  const poly = outline.map(([x, y]) => new T.Vector2(x, y));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(outline.flat(), 3));
  g.setIndex(T.ShapeUtils.triangulateShape(poly, []).flat());
  g.computeVertexNormals();
  return mesh(parent, g, mat);
}

// Batch detail by joint and material once, keeping eyes, glass and loose tailoring movable.
function batch(root) {
  const byMaterial = new Map();
  for (const child of [...root.children]) {
    if (child.isGroup || child.isBone) {
      batch(child);
      continue;
    }
    if (!child.isMesh) continue;
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(child);
  }
  for (const [mat, parts] of byMaterial) {
    if (parts.length < 2) continue;
    const geometries = parts.map((m) => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.deleteAttribute('uv');
      g.applyMatrix4(m.matrix);
      root.remove(m);
      m.geometry.dispose();
      return g;
    });
    mesh(root, mergeGeometries(geometries), mat);
    for (const g of geometries) g.dispose();
  }
}

export function buildSippy(rig) {
  const skin = surface('#d59b70', 0.54),
    blush = surface('#bc785d', 0.62);
  const hair = surface('#301f1a', 0.36),
    hairLight = surface('#503524', 0.4),
    black = surface('#231915', 0.48);
  const white = surface('#f4e5d4', 0.51),
    iris = surface('#714019', 0.27),
    pupil = surface('#211813', 0.2);
  const glint = surface('#fff9eb', 0.15, { emissive: '#aba196', emissiveIntensity: 0.4 });
  const mouth = surface('#6b342b', 0.52),
    lip = surface('#b9735a', 0.55);
  const suit = surface('#463e3b', 0.82),
    trousers = surface('#403936', 0.79);
  const waistcoat = surface('#51443a', 0.76),
    lapel = surface('#504643', 0.65);
  const pin = surface('#817269', 0.82),
    edge = surface('#67605b', 0.72);
  const oxblood = surface('#822b34', 0.43),
    silk = surface('#5a2029', 0.45);
  const gold = surface('#c69652', 0.31, { metalness: 0.6 }),
    button = surface('#392a22', 0.43);
  const leather = surface('#302623', 0.35),
    welt = surface('#211e1c', 0.61);
  const saddle = surface('#5c3f30', 0.68),
    saddleEdge = surface('#987857', 0.62);
  const head = rig.head,
    chest = rig.chest,
    hips = rig.hips;
  const headSkin = group(head, 0, -0.014, 0);
  headSkin.scale.set(1.02, 1.09, 1.01);
  const cheekRows = [
    [0.006, 0.01, 0.016, 0.004],
    [0.012, 0.028, 0.028, 0.004],
    [0.025, 0.044, 0.041, 0.002],
    [0.045, 0.053, 0.049, 0],
    [0.067, 0.058, 0.052, 0],
    [0.086, 0.057, 0.052, -0.001],
    [0.107, 0.051, 0.044, -0.003],
    [0.119, 0.036, 0.032, -0.007],
    [0.128, 0.01, 0.01, -0.008],
  ];
  mesh(headSkin, rings(cheekRows), skin);
  mesh(
    chest,
    rings([
      [0.145, 0.024, 0.021, 0],
      [0.16, 0.024, 0.022, 0],
      [0.195, 0.021, 0.022, 0.003],
      [0.213, 0.022, 0.021, 0.003],
    ]),
    skin,
  );
  for (const s of [-1, 1]) {
    const ear = ellipsoid(headSkin, skin, s * 0.056, 0.059, -0.001, 0.012, 0.019, 0.009);
    ear.rotation.z = -s * 0.15;
    ellipsoid(headSkin, blush, s * 0.06, 0.059, 0.005, 0.006, 0.012, 0.004);
    stroke(
      headSkin,
      skin,
      [
        [s * 0.061, 0.067, 0.009],
        [s * 0.056, 0.063, 0.01],
        [s * 0.059, 0.054, 0.011],
      ],
      0.0017,
    );
  }
  // Eyelid rims frame the iris; light catches the cornea independently of the gaze.
  const eyes = [],
    gazes = [];
  for (const s of [-1, 1]) {
    const eye = group(headSkin, s * 0.0235, 0.072, 0.0456);
    eye.rotation.y = s * 0.25;
    eye.rotation.z = -s * 0.045;
    ellipsoid(eye, blush, 0, -0.0009, -0.0005, 0.0196, 0.0172, 0.0085);
    ellipsoid(eye, white, 0, 0, 0.0006, 0.0188, 0.0157, 0.0101);
    const gaze = group(eye, -s * 0.0008, 0, 0.0093);
    ellipsoid(gaze, black, 0, 0, 0, 0.0097, 0.012, 0.0025);
    ellipsoid(gaze, iris, 0, 0.0001, 0.0011, 0.0086, 0.0109, 0.0022);
    ellipsoid(gaze, pupil, 0, 0.001, 0.0027, 0.0054, 0.0074, 0.0015);
    ellipsoid(gaze, glint, -0.0029, 0.0051, 0.0041, 0.00235, 0.0025, 0.001);
    ellipsoid(gaze, glint, 0.0031, -0.0036, 0.004, 0.0009, 0.001, 0.0006);
    stroke(
      eye,
      black,
      [
        [-0.017, 0.003, 0.005],
        [-0.011, 0.0115, 0.007],
        [0.001, 0.015, 0.006],
        [0.012, 0.011, 0.007],
        [0.018, 0.002, 0.005],
      ],
      0.00145,
    );
    eyes.push(eye);
    gazes.push(gaze);
    sweep(
      headSkin,
      hair,
      [
        [s * 0.009, 0.091, 0.05],
        [s * 0.018, 0.097, 0.049],
        [s * 0.03, 0.098, 0.044],
        [s * 0.043, 0.092, 0.034],
      ],
      0.0047,
      0.0048,
      0.27,
    );
  }
  mesh(
    headSkin,
    rings(
      [
        [0.043, 0.004, 0.003, 0.053],
        [0.047, 0.009, 0.008, 0.055],
        [0.053, 0.0095, 0.009, 0.055],
        [0.06, 0.0065, 0.007, 0.052],
        [0.074, 0.0045, 0.004, 0.049],
        [0.083, 0.004, 0.003, 0.048],
      ],
      24,
    ),
    skin,
  );
  for (const s of [-1, 1]) ellipsoid(headSkin, blush, s * 0.006, 0.047, 0.061, 0.0017, 0.00095, 0.0007);
  const smileZ = (x, y) =>
    0.0023 + (0.041 + ((0.049 - 0.041) * (y - 0.025)) / 0.02) * Math.sqrt(1 - (x / 0.051) ** 2);
  const lipVertices = [],
    toothVertices = [],
    smileIndex = [];
  for (let n = 0; n <= 20; n++) {
    const u = n / 10 - 1,
      x = u * 0.021;
    const top = 0.034 + 0.0037 * u * u + 0.0009 * u;
    const bottom = top - 0.007 * (1 - u * u);
    lipVertices.push(x, bottom, smileZ(x, bottom) + 0.0016, x, top, smileZ(x, top) + 0.0018);
    const toothBottom = top - 0.0031 * (1 - u * u);
    toothVertices.push(
      x * 0.91,
      toothBottom,
      smileZ(x * 0.91, toothBottom) + 0.002,
      x * 0.91,
      top,
      smileZ(x * 0.91, top) + 0.0021,
    );
    if (n < 20) {
      const k = n * 2;
      smileIndex.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  for (const [vertices, material] of [
    [lipVertices, mouth],
    [toothVertices, white],
  ]) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.setIndex(smileIndex);
    geo.computeVertexNormals();
    mesh(headSkin, geo, material);
  }
  stroke(
    headSkin,
    lip,
    [
      [-0.014, 0.03, 0.046],
      [0, 0.0268, 0.0455],
      [0.013, 0.031, 0.047],
    ],
    0.00125,
  );

  // Swept cap with a scalloped hairline, low nape, exposed ears and a raised front crest.
  const capP = [],
    capI = [];
  for (let j = 0; j <= 18; j++)
    for (let i = 0; i <= 56; i++) {
      const a = (i / 56) * tau,
        front = (1 + Math.cos(a)) * 0.5,
        u = j / 18;
      const hairline = 0.035 + 0.066 * front ** 2 + 0.006 * Math.sin(3 * a + 0.3) * front ** 3;
      const r = Math.cos((u * Math.PI) / 2);
      const x = 0.059 * r * Math.sin(a) + 0.006 * u;
      const y = hairline + (0.15 - hairline) * Math.sin((u * Math.PI) / 2);
      const z = -0.004 + 0.055 * r * Math.cos(a) + 0.011 * Math.sin(Math.PI * u) * front;
      capP.push(x, y, z);
      if (i < 56 && j < 18) {
        const n = j * 57 + i;
        capI.push(n, n + 1, n + 57, n + 1, n + 58, n + 57);
      }
    }
  const cap = new T.BufferGeometry();
  cap.setAttribute('position', new T.Float32BufferAttribute(capP, 3));
  cap.setIndex(capI);
  cap.computeVertexNormals();
  mesh(headSkin, cap, hair);
  for (let j = 0; j < 15; j++) {
    const t = j / 14,
      x = -0.042 + t * 0.079,
      base = 0.107 + 0.013 * Math.sin(t * 2.8);
    const points = [
      [x + 0.005, base, 0.041 - 0.015 * t * t],
      [x - 0.014, 0.124 + 0.009 * t, 0.04],
      [x - 0.013, 0.139 + 0.011 * Math.sin(t * 2.7), 0.026],
      [x + 0.002, 0.143 + 0.011 * Math.sin(t * 2.5), 0.006],
      [x + 0.014, 0.132, -0.03],
      [x + 0.012, 0.108, -0.045],
    ];
    sweep(headSkin, j === 2 || j === 8 ? hairLight : hair, points, 0.0055, 0.0052, 0.04);
  }
  for (const s of [-1, 1]) {
    sweep(
      headSkin,
      hair,
      [
        [s * 0.046, 0.116, 0.024],
        [s * 0.054, 0.102, 0.02],
        [s * 0.057, 0.087, 0.012],
        [s * 0.056, 0.068, 0.01],
      ],
      0.006,
      0.005,
      0.2,
    );
    for (let k = 0; k < 4; k++)
      stroke(
        headSkin,
        hairLight,
        [
          [s * 0.052, 0.111 - k * 0.004, 0.023],
          [s * 0.058, 0.102 - k * 0.004, 0.005],
          [s * 0.057, 0.094 - k * 0.004, -0.018],
          [s * 0.047, 0.08 - k * 0.004, -0.036],
        ],
        0.0008,
      );
  }

  const torsoRows = [
    [-0.126, 0.091, 0.057, -0.004],
    [-0.07, 0.091, 0.057, -0.004],
    [0.012, 0.085, 0.055, -0.001],
    [0.08, 0.099, 0.061, 0],
    [0.126, 0.118, 0.059, -0.001],
    [0.145, 0.115, 0.049, -0.003],
    [0.16, 0.068, 0.039, -0.004],
    [0.164, 0.032, 0.029, 0],
  ];
  mesh(chest, rings(torsoRows), suit);
  function jacketZ(x, y) {
    let i = 1;
    while (i < torsoRows.length - 1 && y > torsoRows[i][0]) i++;
    const a = torsoRows[i - 1],
      b = torsoRows[i],
      t = T.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const w = T.MathUtils.lerp(a[1], b[1], t),
      d = T.MathUtils.lerp(a[2], b[2], t);
    return T.MathUtils.lerp(a[3], b[3], t) + d * Math.sqrt(Math.max(0, 1 - (x / w) ** 2));
  }
  const onCloth = (x, y, layer = 0.0018) => [x, y, jacketZ(x, y) + layer];
  // Sew surfaces into narrow columns so the bib and lapels conform to the chest.
  function garment(mat, rows, lift) {
    const vertices = [],
      indices = [];
    const layers = (rows.length - 1) * 5;
    for (let j = 0; j <= layers; j++)
      for (let i = 0; i <= 10; i++) {
        const idx = Math.min(rows.length - 2, Math.floor(j / 5)),
          frac = j / 5 - idx;
        const left = rows[idx],
          right = rows[idx + 1];
        const y = T.MathUtils.lerp(left[0], right[0], frac),
          lo = T.MathUtils.lerp(left[1], right[1], frac),
          hi = T.MathUtils.lerp(left[2], right[2], frac);
        const x = T.MathUtils.lerp(lo, hi, i / 10);
        vertices.push(...onCloth(x, y, lift));
        if (i < 10 && j < layers) {
          const k = j * 11 + i;
          indices.push(k, k + 1, k + 11, k + 1, k + 12, k + 11);
        }
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    mesh(chest, g, mat);
  }
  garment(
    waistcoat,
    [
      [-0.105, -0.019, 0.019],
      [-0.086, -0.046, 0.045],
      [-0.015, -0.043, 0.044],
      [0.075, -0.057, 0.057],
      [0.145, -0.044, 0.044],
    ],
    0.002,
  );
  garment(
    white,
    [
      [0.055, 0, 0.0005],
      [0.115, -0.026, 0.026],
      [0.147, -0.04, 0.04],
      [0.158, -0.025, 0.025],
    ],
    0.0037,
  );
  for (const s of [-1, 1]) {
    const lap = (y, x) => onCloth(s * x, y, 0.0051);
    panel(chest, lapel, [
      lap(0.152, 0.036),
      lap(0.147, 0.074),
      lap(0.123, 0.063),
      lap(0.119, 0.079),
      lap(0.03, 0.028),
      lap(-0.011, 0.007),
      lap(0.069, 0.035),
    ]);
    stroke(
      chest,
      edge,
      [
        lap(0.145, 0.073),
        lap(0.124, 0.063),
        lap(0.12, 0.077),
        lap(0.084, 0.06),
        lap(0.032, 0.029),
        lap(-0.01, 0.008),
      ],
      0.00105,
    );
    panel(chest, white, [lap(0.164, 0.018), lap(0.154, 0.038), lap(0.128, 0.029), lap(0.145, 0.008)]);
    for (let k = 0; k < 6; k++) {
      const a = (0.77 + k * 0.35) * s,
        points = torsoRows
          .slice(0, 7)
          .map(([y, w, d, z]) => [(w + 0.00045) * Math.sin(a), y, (z || 0) + (d + 0.00045) * Math.cos(a)]);
      stroke(chest, pin, points, 0.00053, 5);
    }
    stroke(
      chest,
      edge,
      [onCloth(s * 0.046, -0.035), onCloth(s * 0.067, -0.038), onCloth(s * 0.076, -0.043)],
      0.00135,
    );
  }
  for (let j = 0; j < 5; j++) {
    const y = 0.041 - j * 0.025,
      location = onCloth(0.0028, y, 0.0045);
    ellipsoid(chest, button, ...location, 0.0046, 0.0046, 0.00185);
    ellipsoid(
      chest,
      gold,
      location[0] - 0.001,
      location[1] + 0.0005,
      location[2] + 0.0017,
      0.00085,
      0.00085,
      0.00045,
    );
  }
  mesh(
    chest,
    rings(
      [
        [0.141, 0.038, 0.061, 0],
        [0.151, 0.039, 0.051, 0],
        [0.159, 0.036, 0.042, 0],
        [0.168, 0.032, 0.034, 0],
        [0.177, 0.027, 0.027, 0],
        [0.183, 0.026, 0.025, 0.001],
      ],
      32,
    ),
    white,
  );
  for (const s of [-1, 1]) {
    panel(chest, white, [
      [s * 0.003, 0.16, 0.033],
      [s * 0.022, 0.175, 0.017],
      [s * 0.04, 0.155, 0.021],
      [s * 0.02, 0.14, 0.052],
    ]);
  }
  const knot = onCloth(0, 0.14, 0.012);
  for (const s of [-1, 1]) {
    const bow = ellipsoid(chest, oxblood, s * 0.017, 0.14, knot[2] - 0.001, 0.021, 0.0125, 0.009);
    bow.rotation.z = s * 0.22;
    stroke(
      chest,
      silk,
      [
        [s * 0.005, 0.14, knot[2] + 0.008],
        [s * 0.017, 0.142, knot[2] + 0.007],
        [s * 0.031, 0.145, knot[2] + 0.004],
      ],
      0.0013,
    );
  }
  ellipsoid(chest, silk, 0, 0.14, knot[2] + 0.009, 0.009, 0.01, 0.006);
  panel(chest, oxblood, [
    onCloth(0.063, 0.086, 0.005),
    onCloth(0.066, 0.1, 0.005),
    onCloth(0.071, 0.096, 0.005),
    onCloth(0.077, 0.101, 0.005),
    onCloth(0.079, 0.088, 0.005),
  ]);
  stroke(
    chest,
    edge,
    [onCloth(0.058, 0.084, 0.006), onCloth(0.069, 0.086, 0.006), onCloth(0.082, 0.088, 0.006)],
    0.0014,
  );
  const chain = group(chest);
  const chainPoints = Array.from({ length: 13 }, (_, i) => {
    const u = i / 12;
    return onCloth(0.004 + 0.062 * u, -0.011 - 0.029 * 4 * u * (1 - u) + 0.006 * u, 0.0055);
  });
  stroke(chain, gold, chainPoints, 0.00112, 6);
  for (let n = 0; n < 12; n++) ellipsoid(chain, gold, ...chainPoints[n], 0.0017, 0.0015, 0.0013);

  mesh(
    hips,
    rings([
      [-0.035, 0.068, 0.043, 0],
      [0.011, 0.085, 0.051, 0],
      [0.06, 0.075, 0.048, 0],
      [0.082, 0.073, 0.044, 0],
    ]),
    trousers,
  );
  const tails = [];
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const rear = group(chest, s * 0.03, -0.05, -0.052);
    tails.push(rear);
    panel(rear, suit, [
      [-0.029, 0, 0],
      [0.029, 0, 0],
      [0.031, -0.072, -0.002],
      [-0.018, -0.074, -0.004],
      [-0.031, -0.061, -0.002],
    ]);
    const upper = rig['upperArm' + side],
      lower = rig['forearm' + side],
      hand = rig['hand' + side];
    const thigh = rig['thigh' + side],
      shin = rig['shin' + side],
      foot = rig['foot' + side];
    const armRows = [
      [-0.179, 0.024, 0.025, 0.001],
      [-0.154, 0.027, 0.03, 0],
      [-0.108, 0.031, 0.031, 0.002],
      [-0.048, 0.035, 0.037, 0],
      [-0.013, 0.035, 0.036, -0.001],
      [0.006, 0.025, 0.03, -0.002],
      [0.011, 0.008, 0.015, -0.003],
    ];
    mesh(upper, rings(armRows, 26), suit);
    const sleeveRows = [
      [-0.142, 0.024, 0.023, 0],
      [-0.133, 0.025, 0.024, 0],
      [-0.045, 0.026, 0.028, 0.002],
      [-0.011, 0.027, 0.029, 0.001],
      [0.01, 0.022, 0.023, 0],
    ];
    mesh(lower, rings(sleeveRows, 26), suit);
    for (const angle of [-1.45, 0.25, 1.57, 2.9])
      for (const [limb, rows] of [
        [upper, armRows],
        [lower, sleeveRows],
      ]) {
        stroke(
          limb,
          pin,
          rows
            .slice(0, -1)
            .map(([y, w, d, z]) => [(w + 0.0004) * Math.sin(angle), y, z + (d + 0.0004) * Math.cos(angle)]),
          0.00055,
          5,
        );
      }
    mesh(
      lower,
      rings(
        [
          [-0.151, 0.02, 0.02, 0.001],
          [-0.14, 0.0215, 0.022, 0.001],
          [-0.136, 0.021, 0.022, 0],
        ],
        24,
      ),
      white,
    );
    for (const y of [-0.122, -0.109, -0.096])
      ellipsoid(lower, button, s * 0.024, y, -0.003, 0.0018, 0.0036, 0.0036);
    ellipsoid(hand, skin, 0, -0.015, 0.001, 0.019, 0.027, 0.0155);
    for (let j = 0; j < 4; j++) {
      const z = 0.013 - j * 0.0075,
        l = 0.019 + (j === 1 ? 0.004 : j === 3 ? -0.004 : 0);
      sweep(
        hand,
        skin,
        [
          [s * 0.003, -0.029, z],
          [s * 0.002, -0.036, z + 0.001],
          [-s * 0.001, -0.03 - l, z + 0.001],
          [-s * 0.008, -0.03 - l, z + 0.004],
        ],
        0.0048,
        0.0044,
        0.66,
      );
    }
    sweep(
      hand,
      skin,
      [
        [-s * 0.012, -0.012, 0.005],
        [-s * 0.015, -0.018, 0.015],
        [-s * 0.009, -0.03, 0.019],
      ],
      0.006,
      0.006,
      0.6,
    );
    const legRows = [
      [-0.254, 0.032, 0.032, 0.001],
      [-0.215, 0.033, 0.036, 0.003],
      [-0.111, 0.04, 0.043, 0.001],
      [-0.025, 0.047, 0.047, -0.002],
      [0.025, 0.037, 0.035, 0],
    ];
    mesh(thigh, rings(legRows, 30), trousers);
    const calfRows = [
      [-0.229, 0.031, 0.036, 0.006],
      [-0.212, 0.033, 0.036, 0.002],
      [-0.194, 0.029, 0.035, 0.001],
      [-0.118, 0.034, 0.04, -0.003],
      [-0.045, 0.032, 0.034, -0.003],
      [0.009, 0.033, 0.033, 0.001],
    ];
    mesh(shin, rings(calfRows, 30), trousers);
    for (const [joint, rows] of [
      [thigh, legRows],
      [shin, calfRows],
    ]) {
      for (const a of [-1.3, 0.25, 1.4, 2.8]) {
        stroke(
          joint,
          pin,
          rows.map(([y, w, d, z]) => [(w + 0.0003) * Math.sin(a), y, z + (d + 0.0004) * Math.cos(a)]),
          0.00056,
          5,
        );
      }
    }
    mesh(
      foot,
      rings(
        [
          [-0.047, 0.031, 0.06, 0.028],
          [-0.041, 0.034, 0.064, 0.028],
          [-0.037, 0.034, 0.065, 0.028],
        ],
        32,
      ),
      welt,
    );
    mesh(
      foot,
      rings(
        [
          [-0.039, 0.033, 0.063, 0.028],
          [-0.029, 0.034, 0.064, 0.028],
          [-0.019, 0.031, 0.056, 0.025],
          [-0.006, 0.026, 0.043, 0.015],
          [0.012, 0.025, 0.034, 0.002],
          [0.024, 0.023, 0.028, 0.001],
        ],
        32,
      ),
      leather,
    );
    for (let j = 0; j < 3; j++)
      stroke(
        foot,
        edge,
        [
          [-0.013, -0.008 - j * 0.003, 0.048 + j * 0.004],
          [0, -0.005 - j * 0.003, 0.048 + j * 0.004],
          [0.013, -0.008 - j * 0.003, 0.048 + j * 0.004],
        ],
        0.001,
        5,
      );
  }
  const satchel = group(hips, -0.082, 0.014, -0.032);
  ellipsoid(satchel, saddle, 0, -0.012, 0, 0.016, 0.041, 0.04);
  ellipsoid(satchel, saddleEdge, -0.011, -0.002, -0.001, 0.007, 0.025, 0.038);
  ellipsoid(satchel, saddle, -0.016, -0.001, -0.001, 0.004, 0.023, 0.036);
  ellipsoid(satchel, gold, -0.02, -0.016, 0, 0.002, 0.004, 0.003);
  stroke(
    chest,
    saddle,
    [
      [-0.076, -0.05, -0.039],
      [-0.035, 0.018, -0.055],
      [0.026, 0.099, -0.057],
      [0.061, 0.146, -0.033],
      [0.069, 0.147, 0.009],
    ],
    0.0045,
  );

  const goblet = group(rig.handR, 0.002, -0.028, 0.011);
  const glass = surface('#e5f3ee', 0.12, {
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: T.DoubleSide,
    metalness: 0.12,
  });
  const glassEdge = surface('#b9d1c6', 0.24, { metalness: 0.24 });
  const wine = surface('#711a2b', 0.22, { metalness: 0.1 });
  mesh(
    goblet,
    rings(
      [
        [-0.036, 0.003, 0.003, 0],
        [-0.035, 0.016, 0.016, 0],
        [-0.033, 0.017, 0.017, 0],
        [-0.031, 0.005, 0.005, 0],
        [-0.028, 0.0018, 0.0018, 0],
        [0.018, 0.0018, 0.0018, 0],
        [0.02, 0.004, 0.004, 0],
      ],
      24,
    ),
    glassEdge,
  );
  const bowlProfile = [
    [0.002, 0.018],
    [0.009, 0.02],
    [0.018, 0.026],
    [0.022, 0.037],
    [0.0215, 0.05],
    [0.018, 0.061],
  ];
  mesh(
    goblet,
    new T.LatheGeometry(
      bowlProfile.map(([r, h]) => new T.Vector2(r, h)),
      36,
    ),
    glass,
  );
  const rim = mesh(goblet, new T.TorusGeometry(0.018, 0.00085, 7, 40), glassEdge, 0, 0.061, 0);
  rim.rotation.x = Math.PI / 2;
  const liquid = group(goblet, 0, 0.029, 0);
  mesh(
    liquid,
    rings(
      [
        [-0.009, 0.003, 0.003, 0],
        [-0.007, 0.009, 0.009, 0],
        [-0.002, 0.0168, 0.0168, 0],
        [0.006, 0.0204, 0.0204, 0],
        [0.012, 0.0209, 0.0209, 0],
      ],
      32,
    ),
    wine,
  );
  const ripple = surface('#a73844', 0.23);
  ellipsoid(liquid, ripple, 0.003, 0.0115, 0.001, 0.016, 0.0008, 0.015);
  // Preserve bone and accessory group origins while collapsing seams and trim.
  for (const key of [
    'head',
    'chest',
    'hips',
    'upperArmL',
    'upperArmR',
    'forearmL',
    'forearmR',
    'handL',
    'handR',
    'thighL',
    'thighR',
    'shinL',
    'shinR',
    'footL',
    'footR',
  ]) {
    // A rig may nest several of these joints; a group is batched only at its own level.
    batch(rig[key]);
  }
  const q = new T.Quaternion(),
    worldUp = new T.Quaternion(),
    tilt = new T.Euler();
  const down = vec(0, -1, 0),
    toGrip = vec(0, 0, 0),
    elbow = vec(0, 0, 0),
    plane = vec(0, 0, 0),
    fore = vec(0, 0, 0);
  const aimShoulder = new T.Quaternion(),
    aimElbow = new T.Quaternion();

  let tiltSpring = 0,
    tiltV = 0,
    lag = 0,
    lagV = 0;
  return function animate(f) {
    const t = f.time,
      dt = f.dt;
    const blinkTime = (t + 0.13) % 4.2,
      blink = blinkTime < 0.16 ? Math.sin((Math.PI * blinkTime) / 0.16) : 0;
    const focus = f.emote >= 0 ? Math.sin(Math.PI * f.emote) ** 0.8 : 0;
    for (let i = 0; i < 2; i++) {
      eyes[i].scale.y = 1 - 0.94 * blink;
      gazes[i].position.y = -0.0018 * focus + 0.0009 * Math.sin(t * 0.85);
      gazes[i].position.x = 0.0016 * Math.sin(t * 0.67);
    }
    // The carrying elbow stays flexed to steady the stem; the upper arm draws in for the sniff.
    rig.forearmR.rotation.x -= 0.52;
    rig.upperArmR.rotation.x -= 0.16;
    if (focus > 0) {
      // Solve toward a sniffing position with the elbow out. The wine moves
      // in a small circle at the top of the gesture, in front of the nose.
      toGrip.set(0.093 + Math.sin(f.emote * 22) * 0.008, 0.053, 0.08 + Math.cos(f.emote * 22) * 0.007);
      const dist = toGrip.length(),
        arm = 0.176,
        lower = 0.143;
      const along = (arm * arm - lower * lower + dist * dist) / (2 * dist);
      fore.copy(toGrip);
      toGrip.multiplyScalar(1 / dist);
      plane.set(-1, -0.95, 0.4);
      plane.addScaledVector(toGrip, -plane.dot(toGrip)).normalize();
      elbow
        .copy(toGrip)
        .multiplyScalar(along)
        .addScaledVector(plane, Math.sqrt(Math.max(0, arm * arm - along * along)));
      fore.sub(elbow).normalize();
      aimShoulder.setFromUnitVectors(down, elbow.normalize());
      aimElbow.setFromUnitVectors(down, fore).premultiply(q.copy(aimShoulder).invert());
      rig.upperArmR.quaternion.slerp(aimShoulder, focus);
      rig.forearmR.quaternion.slerp(aimElbow, focus);
    }
    rig.head.rotation.x += focus * 0.22;
    rig.head.rotation.y -= focus * 0.24;
    rig.handR.rotation.z += focus * 0.13 * Math.sin(f.emote * 18);
    tiltV +=
      dt *
      (48 *
        (0.012 * f.turn +
          0.01 * f.speed * Math.sin(f.phase) +
          focus * 0.14 * Math.sin(f.emote * 18) -
          tiltSpring) -
        9 * tiltV);
    tiltSpring += tiltV * dt;
    rig.handR.getWorldQuaternion(q);
    goblet.quaternion
      .copy(q)
      .invert()
      .multiply(worldUp.setFromEuler(tilt.set(tiltSpring, 0, -tiltSpring * 0.42)));
    liquid.rotation.z = tiltSpring * 0.72;
    liquid.rotation.x = -tiltSpring * 0.62;
    const target =
      Math.min(0.35, f.speed * 0.035 + Math.abs(f.vy) * 0.026) +
      0.025 * Math.sin(f.phase * 2) * Math.min(1, f.speed);
    lagV += dt * (65 * (target - lag) - 10 * lagV);
    lag += lagV * dt;
    tails[0].rotation.x = lag + 0.02 * Math.sin(f.phase);
    tails[1].rotation.x = lag - 0.02 * Math.sin(f.phase);
    chain.rotation.z = 0.17 * lag * Math.sin(f.phase);
    satchel.rotation.x = -lag * 0.8;
    satchel.rotation.z = 0.024 * Math.sin(f.phase + 1) * Math.min(1, f.speed);
  };
}
