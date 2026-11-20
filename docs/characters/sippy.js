// The vineyard sommelier. All dimensions here are fractions of standing height.
import * as T from 'three';
import { createHair } from './hair.js';
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
    if (!child.isMesh || Array.isArray(child.material)) continue;
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

// The two lids glide over the convex eye (including the iris), so a blink
// keeps the volume of the eyeball. Their lash edges are part of the same skin.
function eyelid(parent, skin, lash, upper) {
  const cols = 16,
    rows = 4,
    count = (cols + 1) * (rows + 1);
  const positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3);
  const geometry = new T.BufferGeometry(),
    index = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = j * (cols + 1) + i;
      if (upper) index.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
      else index.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
    }
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage));
  geometry.setIndex(index);
  const lid = mesh(parent, geometry, [lash, skin]);
  lid.frustumCulled = false;
  geometry.addGroup(0, cols * 6, 0);
  geometry.addGroup(cols * 6, index.length - cols * 6, 1);
  const offsets = [0, 0.08, 0.37, 0.7, 1];
  let lastClosure = -1;
  function pose(closure) {
    if (Math.abs(closure - lastClosure) < 0.0001) return;
    lastClosure = closure;
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * 2 - 1,
        radius = Math.sqrt(Math.max(0, 1 - x * x));
      const seam = upper ? 0.73 - 0.83 * closure : -0.87 + 0.77 * closure;
      for (let j = 0; j <= rows; j++) {
        const f = offsets[j],
          y = radius * T.MathUtils.lerp(seam, upper ? 1 : -1, f);
        const k = (j * (cols + 1) + i) * 3;
        positions[k] = 0.02 * x;
        positions[k + 1] = 0.0175 * y;
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        positions[k + 2] = 0.0014 + 0.0154 * z;
        const nx = x / 0.02,
          ny = y / 0.0175,
          nz = z / 0.0154,
          length = Math.hypot(nx, ny, nz) || 1;
        normals[k] = nx / length;
        normals[k + 1] = ny / length;
        normals[k + 2] = nz / length;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
  }
  pose(0);
  return pose;
}

// Pinstripes follow the cut of each pattern piece. Filter their footprint on
// the pixel grid to retain the broad wool colour in the distant follow view.
function pinstripe(material, pitch, strength) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 clothPosition; varying vec3 clothNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nclothPosition=position;clothNormal=normal;',
      );
    shader.fragmentShader =
      'varying vec3 clothPosition; varying vec3 clothNormal;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 phase=(clothPosition.xz+vec2(clothPosition.y*.025,0.)) * ${(1 / pitch).toFixed(2)};
        vec2 footprint=max(fwidth(phase),vec2(.0001));
        vec2 stripe=(1.-smoothstep(vec2(.015)-footprint*.5, vec2(.055)+footprint*.5, abs(fract(phase+.5)-.5)))
          * (1.-smoothstep(vec2(.35),vec2(1.05),footprint));
        float blend=smoothstep(.25,.75,abs(clothNormal.z));
        diffuseColor.rgb+=vec3(.15,.116,.086)*mix(stripe.y,stripe.x,blend)*${strength.toFixed(2)};`,
      );
  };
  material.customProgramCacheKey = () => `sippy-cloth-${pitch}-${strength}`;
}

export function buildSippy(rig) {
  const skin = surface('#d59b70', 0.54),
    blush = surface('#bc785d', 0.62);
  const hair = surface('#32221d', 0.44),
    black = surface('#231915', 0.48);
  const white = surface('#f4e5d4', 0.51),
    iris = surface('#714019', 0.27),
    pupil = surface('#211813', 0.2);
  const glint = surface('#fff9eb', 0.15, { emissive: '#aba196', emissiveIntensity: 0.4 });
  const mouth = surface('#6b342b', 0.52),
    lip = surface('#b9735a', 0.55);
  const suit = surface('#494039', 0.83),
    trousers = surface('#403936', 0.79);
  const waistcoat = surface('#635042', 0.76),
    lapel = surface('#534840', 0.62);
  const edge = surface('#67605b', 0.72);
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
  pinstripe(suit, 0.0112, 0.3);
  pinstripe(trousers, 0.0112, 0.245);
  pinstripe(waistcoat, 0.011, 0.2);
  const headSkin = group(head, 0, -0.026, 0.001);
  headSkin.name = 'sippy-head';
  headSkin.scale.set(1.22, 1.075, 1.15);
  const cheekRows = [
    [0.006, 0.01, 0.016, 0.004],
    [0.012, 0.03, 0.031, 0.004],
    [0.025, 0.045, 0.042, 0.002],
    [0.045, 0.0555, 0.049, 0],
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
  const gazes = [],
    lids = [],
    brows = [];
  for (const s of [-1, 1]) {
    const eye = group(headSkin, s * 0.0235, 0.072, 0.0456);
    eye.rotation.y = s * 0.25;
    eye.rotation.z = -s * 0.045;
    ellipsoid(eye, skin, 0, -0.0006, -0.001, 0.0193, 0.0164, 0.008);
    ellipsoid(eye, white, 0, 0, 0.0006, 0.0188, 0.0157, 0.0101);
    const gaze = group(eye, -s * 0.0008, 0, 0.0093);
    ellipsoid(gaze, black, 0, 0, 0, 0.0097, 0.012, 0.0025);
    ellipsoid(gaze, iris, 0, 0.0001, 0.0011, 0.0086, 0.0109, 0.0022);
    ellipsoid(gaze, pupil, 0, 0.001, 0.0027, 0.0054, 0.0074, 0.0015);
    ellipsoid(gaze, glint, -0.0029, 0.0051, 0.0041, 0.00235, 0.0025, 0.001);
    ellipsoid(gaze, glint, 0.0031, -0.0036, 0.004, 0.0009, 0.001, 0.0006);
    lids.push(eyelid(eye, skin, black, true), eyelid(eye, skin, blush, false));
    gazes.push(gaze);
    const brow = group(headSkin, s * 0.025, 0.094, 0.043);
    brow.name = 'sippy-brow-' + (s === 1 ? 'L' : 'R');
    brows.push(brow);
    sweep(
      brow,
      hair,
      [
        [-s * 0.018, -0.002, 0.006],
        [-s * 0.011, 0.005, 0.006],
        [s * 0.003, 0.006, 0.002],
        [s * 0.016, 0.003, -0.006],
        [s * 0.023, -0.0045, -0.014],
      ],
      0.0045,
      0.0042,
      0.18,
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
  const smile = group(headSkin, 0, 0.034, 0);
  const smileZ = (x, y) =>
    0.0023 + (0.041 + ((0.049 - 0.041) * (y - 0.025)) / 0.02) * Math.sqrt(1 - (x / 0.051) ** 2);
  const lipVertices = [],
    toothVertices = [],
    smileIndex = [];
  for (let n = 0; n <= 20; n++) {
    const u = n / 10 - 1,
      x = u * 0.023;
    const top = 0.033 + 0.0053 * u * u + 0.0009 * u;
    const bottom = top - 0.0083 * (1 - u * u);
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
    geo.translate(0, -0.034, 0.0007);
    mesh(smile, geo, material);
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

  // A fitted short back and sides, a low taper at the nape and a broken temple
  // hairline. The comb flows around the ear then spirals into the crown.
  const skullProfile = new T.CatmullRomCurve3(
    cheekRows.map((r) => vec(r[1], r[0], r[2])),
    false,
    'catmullrom',
    0.32,
  );
  const skullOffsets = new T.CatmullRomCurve3(
    cheekRows.map((r) => vec(r[3], r[0], 0)),
    false,
    'catmullrom',
    0.32,
  );
  const skull = [];
  for (let k = 0; k <= 120; k++) {
    const v = skullProfile.getPoint(k / 120);
    skull.push([v.y, v.x, v.z, skullOffsets.getPoint(k / 120).x]);
  }
  function fitSkull(p, pad) {
    if (p[1] >= skull[skull.length - 1][0]) return p;
    let i = 1;
    while (i + 1 < skull.length && skull[i][0] < p[1]) i++;
    const a = skull[i - 1],
      b = skull[i],
      f = T.MathUtils.clamp((p[1] - a[0]) / (b[0] - a[0]), 0, 1);
    const w = T.MathUtils.lerp(a[1], b[1], f) + pad,
      d = T.MathUtils.lerp(a[2], b[2], f) + pad,
      z = T.MathUtils.lerp(a[3], b[3], f);
    const r = Math.hypot(p[0] / w, (p[2] - z) / d);
    if (r < 1) {
      p[0] /= r;
      p[2] = z + (p[2] - z) / r;
    }
    return p;
  }
  const scalp = (a, u) => {
    const angle = Math.atan2(Math.sin(a), Math.cos(a)),
      side = Math.abs(angle),
      front = (1 + Math.cos(angle)) * 0.5;
    const forehead = 0.037 + 0.072 * front ** 1.45;
    const earArch = 0.019 * Math.exp(-((side - 1.6) ** 2) / 0.05);
    const sideburn = 0.019 * Math.exp(-((side - 1.17) ** 2) / 0.024);
    const part = 0.009 * Math.exp(-((angle - 0.62) ** 2) / 0.029);
    const hairline = forehead + earArch - sideburn + part + 0.0025 * Math.cos(4 * a + 0.6) * front;
    const phi = u * Math.PI * 0.5;
    const comb = a * 24 + Math.sign(angle) * u * 9 + 1.9 * Math.sin(a * 2.5 + u * 2);
    const ridge =
      (0.0007 + 0.0007 * Math.sin(a * 4) ** 2) * Math.cos(comb) * Math.sin((0.12 + 0.88 * u) * Math.PI);
    const width = (0.0575 + 0.0015 * front + ridge) * Math.cos(phi);
    const depth = (0.052 + 0.002 * front + ridge) * Math.cos(phi);
    return fitSkull(
      [
        width * Math.sin(a) - 0.004 * Math.sin(phi),
        hairline + (0.15 - hairline) * Math.sin(phi),
        -0.0025 + depth * Math.cos(a) - 0.003 * u + 0.004 * Math.sin(u * Math.PI) * front,
      ],
      0.0013 + 0.0018 * Math.min(1, u * 7),
    );
  };
  const baseColor = new T.Color('#3a271d');
  const capP = [],
    capColor = [],
    capI = [];
  const sectors = 128,
    latitudes = 34;
  for (let j = 0; j <= latitudes; j++)
    for (let i = 0; i <= sectors; i++) {
      const a = (i / sectors) * tau,
        u = j / latitudes,
        angle = Math.atan2(Math.sin(a), Math.cos(a));
      const v = scalp(a, u);
      capP.push(...v);
      const lines = a * 48 + Math.sign(angle) * u * 18 + 3.8 * Math.sin(a * 2.5 + u * 2);
      const shade = 0.68 + 0.22 * u + 0.21 * (0.5 + 0.5 * Math.sin(lines)) + 0.07 * Math.sin(lines * 2.5);
      capColor.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);
      if (i < sectors && j < latitudes) {
        const k = j * (sectors + 1) + i;
        capI.push(k, k + 1, k + sectors + 1, k + 1, k + sectors + 2, k + sectors + 1);
      }
    }
  const cap = new T.BufferGeometry();
  cap.setAttribute('position', new T.Float32BufferAttribute(capP, 3));
  cap.setAttribute('color', new T.Float32BufferAttribute(capColor, 3));
  cap.setIndex(capI);
  cap.computeVertexNormals();
  const combed = surface('#ffffff', 0.4, { vertexColors: true });
  mesh(headSkin, cap, combed);
  const grooms = [];
  // Broad flattened locks swell into the quiff. Each ridge and both edges
  // of a lock share its deforming mesh, including the tapered free end.
  function lock(name, points, width, depth, colour, flex) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => vec(...p)),
      false,
      'catmullrom',
      0.38,
    );
    const vertices = [],
      colors = [],
      ix = [],
      base = new T.Color(colour);
    const along = 28,
      around = 18,
      centre = vec(),
      tangent = vec(),
      side = vec(),
      out = vec();
    for (let j = 0; j <= along; j++) {
      const u = j / along;
      curve.getPointAt(u, centre);
      curve.getTangentAt(u, tangent);
      out.set(centre.x, centre.y - 0.079, centre.z + 0.004).normalize();
      side.crossVectors(out, tangent).normalize();
      out.crossVectors(tangent, side).normalize();
      const envelope = (0.095 + 0.905 * Math.sin(Math.PI * (0.06 + 0.94 * u)) ** 0.62) * (1 - 0.09 * u);
      for (let i = 0; i <= around; i++) {
        const a = (i / around) * tau,
          groove = 0.5 + 0.5 * Math.cos(22 * a + 0.8 * Math.sin(3 * u));
        const w = Math.cos(a) * width * envelope,
          h = Math.sin(a) * depth * envelope * (0.94 + 0.06 * groove);
        vertices.push(
          centre.x + side.x * w + out.x * h,
          centre.y + side.y * w + out.y * h,
          centre.z + side.z * w + out.z * h,
        );
        const value = 0.88 + 0.14 * groove + 0.14 * Math.sin(a);
        colors.push(base.r * value, base.g * value, base.b * value);
        if (i < around && j < along) {
          const n = j * (around + 1) + i;
          ix.push(n, n + 1, n + around + 1, n + 1, n + around + 2, n + around + 1);
        }
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    const lockGroup = group(headSkin);
    lockGroup.name = name;
    mesh(lockGroup, geo, combed);
    if (flex) grooms.push({ group: lockGroup, points, flex });
  }
  // The deep side part feeds a fan of swept forelocks: flat at the hairline,
  // projecting well forward over the forehead before rising and folding back.
  const browns = ['#402b20', '#432d22', '#3b281f', '#493124', '#3e2a20'];
  function crest(u) {
    const x = -0.044 + 0.088 * u,
      rim = (2 * u - 1) ** 2,
      arch = 1 - rim;
    const back = scalp(Math.PI - Math.asin(x / 0.058), 0.51);
    return [
      scalp(Math.asin(x / 0.06), 0.018),
      [x - 0.006, 0.127 + 0.004 * arch - 0.012 * rim, 0.05 - 0.022 * rim],
      [x - 0.012, 0.149 + 0.006 * arch - 0.014 * rim, 0.044 - 0.016 * rim],
      [x - 0.008, 0.158 + 0.008 * arch - 0.017 * rim, 0.024 - 0.005 * rim],
      [x + 0.001, 0.156 + 0.005 * arch - 0.016 * rim, -0.003],
      [x + 0.007, 0.14 + 0.005 * arch - 0.011 * rim, -0.025 + 0.001 * rim],
      back,
    ];
  }
  // The solid section under the hand-combed ridges sweeps through the side
  // part and back into the occipital taper; moving ends have hair under them.
  const crestP = [],
    crestC = [],
    crestI = [];
  const columns = 42,
    steps = 30;
  for (let j = 0; j <= columns; j++) {
    const a = (j / columns) * tau,
      u = (1 + Math.sin(a)) * 0.5;
    const curve = new T.CatmullRomCurve3(
      crest(u).map((p) => vec(...p)),
      false,
      'catmullrom',
      0.38,
    );
    for (let i = 0; i <= steps; i++) {
      const f = i / steps,
        pt = curve.getPoint(f);
      const n = vec(pt.x, pt.y - 0.079, pt.z + 0.004).normalize();
      const section = (Math.cos(a) - 1) * (0.009 + 0.008 * Math.sin(Math.PI * f));
      pt.addScaledVector(n, section - 0.0004);
      crestP.push(pt.x, pt.y, pt.z);
      const tone = 0.92 + 0.1 * Math.sin(u * 70 + 1.2 * Math.sin(Math.PI * f));
      crestC.push(baseColor.r * tone, baseColor.g * tone, baseColor.b * tone);
      if (i < steps && j < columns) {
        const k = j * (steps + 1) + i;
        crestI.push(k, k + steps + 1, k + 1, k + steps + 1, k + steps + 2, k + 1);
      }
    }
  }
  const coiffure = new T.BufferGeometry();
  coiffure.setAttribute('position', new T.Float32BufferAttribute(crestP, 3));
  coiffure.setAttribute('color', new T.Float32BufferAttribute(crestC, 3));
  coiffure.setIndex(crestI);
  coiffure.computeVertexNormals();
  const baseGroom = surface('#ffffff', 0.41, { vertexColors: true, side: T.DoubleSide });
  mesh(headSkin, coiffure, baseGroom);
  for (let j = 0; j < 11; j++) {
    const u = (j + 0.35) / 11,
      arch = Math.sin(Math.PI * u);
    const points = crest(u);
    lock(
      'sippy-quiff-' + j,
      points,
      0.0065 + 0.0009 * arch,
      0.0023 + 0.0009 * arch,
      browns[j % browns.length],
      { stiffness: 110 + j * 3, damping: 12, maxOffset: 0.011, radius: 0.0016 },
    );
  }
  // Short sections are brushed back from the temples and blended down to
  // the nape; a narrow strip of skin remains visible around each ear.
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const a = sign * (0.83 + i * 0.189);
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const u = k / 5,
          v = scalp(
            a + sign * (0.46 * u + 0.14 * Math.sin(Math.PI * u)),
            0.018 + u * (0.67 + 0.08 * Math.sin(i)),
          );
        const n = vec(v[0], v[1] - 0.08, v[2] + 0.003).normalize();
        pts.push([v[0] + n.x * 0.0011, v[1] + n.y * 0.0011, v[2] + n.z * 0.0011]);
      }
      const flex =
        i === 1 || i === 5 || i === 9
          ? { stiffness: 170, damping: 17, maxOffset: 0.006, radius: 0.0011 }
          : null;
      lock('sippy-taper-' + sign + '-' + i, pts, 0.0058, 0.00145, browns[(i + 3) % browns.length], flex);
    }
    const burn = group(headSkin);
    sweep(
      burn,
      hair,
      [
        [sign * 0.054, 0.099, 0.024],
        [sign * 0.058, 0.082, 0.019],
        [sign * 0.058, 0.068, 0.013],
        [sign * 0.056, 0.058, 0.01],
      ],
      0.0045,
      0.003,
      0.2,
    );
  }

  // Chest and belly round outward over a tailored, gently flared skirt.
  const torsoRows = [
    [-0.147, 0.107, 0.07, -0.001],
    [-0.118, 0.111, 0.072, 0.002],
    [-0.058, 0.105, 0.081, 0.006],
    [0.0, 0.105, 0.083, 0.009],
    [0.064, 0.117, 0.081, 0.005],
    [0.103, 0.128, 0.078, 0.003],
    [0.135, 0.135, 0.068, -0.002],
    [0.151, 0.124, 0.055, -0.004],
    [0.162, 0.071, 0.043, -0.004],
    [0.167, 0.032, 0.03, 0],
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
        const x = T.MathUtils.lerp(lo, hi, i / 10) * 1.13;
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
      [0.158, -0.032, 0.032],
      [0.166, -0.029, 0.029],
      [0.172, -0.025, 0.025],
      [0.18, -0.021, 0.021],
    ],
    0.0037,
  );
  for (const s of [-1, 1]) {
    const lap = (y, x) => onCloth(s * x * 1.14, y, 0.0058);
    const lapelRows = [
      [-0.018, 0.005, 0.006],
      [0.021, 0.016, 0.03],
      [0.079, 0.039, 0.066],
      [0.113, 0.045, 0.08],
      [0.119, 0.046, 0.082],
      [0.126, 0.044, 0.065],
      [0.145, 0.036, 0.077],
      [0.152, 0.036, 0.066],
    ];
    garment(
      lapel,
      lapelRows.map(([y, a, b]) => (s === 1 ? [y, a, b] : [y, -b, -a])),
      0.006,
    );
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
        [0.15, 0.035, 0.03, 0.011],
        [0.159, 0.035, 0.032, 0.005],
        [0.17, 0.03, 0.026, 0.002],
        [0.182, 0.026, 0.024, 0.001],
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
  chain.name = 'sippy-watch-chain';
  const chainPoints = Array.from({ length: 13 }, (_, i) => {
    const u = i / 12;
    return onCloth(0.004 + 0.081 * u, -0.015 - 0.04 * 4 * u * (1 - u) + 0.007 * u, 0.006);
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
    const rear = group(chest, s * 0.048, -0.059, -0.067);
    rear.name = 'sippy-tail-' + side;
    tails.push(rear);
    panel(rear, suit, [
      [-0.044, 0, 0.008],
      [0.044, 0, 0.009],
      [0.041, -0.112, -0.005],
      [-0.025, -0.123, -0.008],
      [-0.044, -0.097, -0.004],
    ]);
    const upper = rig['upperArm' + side],
      lower = rig['forearm' + side],
      hand = rig['hand' + side];
    const thigh = rig['thigh' + side],
      shin = rig['shin' + side],
      foot = rig['foot' + side];
    upper.position.x = s * 0.144;
    const armRows = [
      [-0.179, 0.024, 0.025, 0.001],
      [-0.154, 0.027, 0.03, 0],
      [-0.108, 0.031, 0.031, 0.002],
      [-0.048, 0.035, 0.037, 0],
      [-0.013, 0.035, 0.036, -0.001],
      [0.006, 0.025, 0.03, -0.002],
      [0.011, 0.008, 0.015, -0.003],
    ];
    for (const row of armRows) {
      row[1] *= 1.2;
      row[2] *= 1.25;
    }
    mesh(upper, rings(armRows, 26), suit);
    const sleeveRows = [
      [-0.142, 0.024, 0.023, 0],
      [-0.133, 0.025, 0.024, 0],
      [-0.045, 0.026, 0.028, 0.002],
      [-0.011, 0.027, 0.029, 0.001],
      [0.01, 0.022, 0.023, 0],
    ];
    for (const row of sleeveRows) {
      row[1] *= 1.17;
      row[2] *= 1.2;
    }
    mesh(lower, rings(sleeveRows, 26), suit);
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
    const palm = hand;
    ellipsoid(palm, skin, 0, -0.015, 0.001, 0.019, 0.027, 0.0155);
    for (let j = 0; j < 4; j++) {
      const z = 0.013 - j * 0.0075,
        l = 0.019 + (j === 1 ? 0.004 : j === 3 ? -0.004 : 0);
      sweep(
        palm,
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
      palm,
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
    for (const part of hand.children) {
      if (!part.isMesh) continue;
      part.position.x *= 1.22;
      part.position.y *= 1.1;
      part.position.z *= 1.2;
      part.scale.set(1.22, 1.1, 1.2);
    }
    const legRows = [
      [-0.254, 0.032, 0.032, 0.001],
      [-0.215, 0.033, 0.036, 0.003],
      [-0.111, 0.04, 0.043, 0.001],
      [-0.025, 0.047, 0.047, -0.002],
      [0.025, 0.037, 0.035, 0],
    ];
    for (const row of legRows) {
      row[1] *= 1.34;
      row[2] *= 1.33;
    }
    mesh(thigh, rings(legRows, 30), trousers);
    const calfRows = [
      [-0.229, 0.031, 0.036, 0.006],
      [-0.212, 0.033, 0.036, 0.002],
      [-0.194, 0.029, 0.035, 0.001],
      [-0.118, 0.034, 0.04, -0.003],
      [-0.045, 0.032, 0.034, -0.003],
      [0.009, 0.033, 0.033, 0.001],
    ];
    for (const row of calfRows) {
      row[1] *= 1.22;
      row[2] *= 1.25;
    }
    mesh(shin, rings(calfRows, 30), trousers);
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
  const satchel = group(hips, -0.103, 0.003, -0.045);
  satchel.name = 'sippy-bag';
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
  const hairMotion = createHair(rig, [
    { node: headSkin, center: [0, 0.068, -0.001], radii: [0.0635, 0.0725, 0.0585] },
    { node: rig.upperArmL, center: [0, -0.022, 0], radii: [0.0475, 0.0465, 0.0505] },
    { node: rig.upperArmR, center: [0, -0.022, 0], radii: [0.0475, 0.0465, 0.0505] },
  ]);
  for (const groom of grooms) hairMotion.add(groom.group, groom.points, groom.flex);
  rig.secondary ??= {};
  // Use the final batched render skin (cheeks, nose and ears) for contact checks.
  const faceSkin = headSkin.children.filter(part => part.isMesh && part.material === skin);
  rig.secondary.sippy = { bag: satchel, tail: tails[0], chain, faceSkin };
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
    lagV = 0,
    bagLift = 0,
    bagLiftSpeed = 0,
    lastTime = -Infinity;
  return function animate(f) {
    const t = f.time,
      dt = f.dt;
    if (t <= lastTime) {
      tiltSpring = tiltV = lag = lagV = bagLift = bagLiftSpeed = 0;
    }
    lastTime = t;
    const blinkTime = (t + 0.13) % 4.2,
      blink = blinkTime < 0.16 ? Math.sin((Math.PI * blinkTime) / 0.16) : 0;
    const focus = f.emote >= 0 ? Math.sin(Math.PI * f.emote) ** 0.8 : 0;
    const sniff = f.emote < 0 ? 0 : Math.exp(-((f.emote - 0.56) ** 2) / 0.01);
    smile.scale.set(1 + 0.09 * focus, 1 + 0.22 * focus - 0.64 * sniff, 1);
    for (let i = 0; i < 2; i++) {
      const close = Math.max(blink, sniff * (i === 0 ? 0.93 : 0.86), f.state === 'roll' ? 0.33 : 0);
      lids[i * 2](close);
      lids[i * 2 + 1](close);
      const side = i === 0 ? -1 : 1;
      brows[i].position.y = 0.094 + 0.005 * focus + 0.0013 * Math.sin(t * 1.1 + i) + side * 0.003 * sniff;
      brows[i].rotation.z = side * (0.11 * sniff - 0.14 * focus + 0.04 * Math.sin(t * 0.7));

      gazes[i].position.y = -0.0018 * focus + 0.0009 * Math.sin(t * 0.85);
      gazes[i].position.x = 0.0016 * Math.sin(t * 0.67);
    }
    // The carrying elbow stays flexed to steady the stem; the upper arm draws in for the sniff.
    rig.forearmR.rotation.x -= 0.52;
    rig.upperArmR.rotation.x -= 0.16;
    if (focus > 0) {
      // Solve toward a sniffing position with the elbow out. The wine moves
      // in a small circle at the top of the gesture, in front of the nose.
      toGrip.set(0.116 + Math.sin(f.emote * 22) * 0.008, 0.053, 0.08 + Math.cos(f.emote * 22) * 0.007);
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
    chain.rotation.z = 0.43 * lag + (0.03 * f.turn) / (1 + Math.abs(f.turn));
    chain.rotation.x = -lag * 0.46;
    // A strap takes the weight at the top of every stride; the leather pouch
    // lags the hip and settles downward as the runner brakes or lands.
    const bob =
      Math.min(1, f.speed / 2) * 0.011 * Math.sin(f.phase + 0.45) -
      0.007 * T.MathUtils.clamp(f.vy / 4, -1, 1);
    bagLiftSpeed += dt * (180 * (bob - bagLift) - 14 * bagLiftSpeed);
    bagLift += dt * bagLiftSpeed;
    satchel.position.y = 0.003 + bagLift;
    satchel.rotation.x = -lag * 0.8 + bagLift * 3.2;
    hairMotion.step(f);
    satchel.rotation.z = 0.024 * Math.sin(f.phase + 1) * Math.min(1, f.speed);
  };
}
