// The vineyard sommelier. All dimensions here are fractions of standing height.
import * as T from 'three';
import { createHair } from './hair.js';
import { cutSuit, fitLimb, frontZ, anatomyRegions, fitOpenings, setSleeveHeads } from './sippy-tailoring.js';
import { detailMaterial } from './material-detail.js';
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
  for (const i of [0, n]) {
    const tip = path.getPointAt(i / n),
      center = p.length / 3;
    p.push(tip.x, tip.y, tip.z);
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j,
        b = i * sides + ((j + 1) % sides);
      if (i === 0) index.push(center, b, a);
      else index.push(center, a, b);
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
    if (!child.isMesh || child.userData.patternPiece || Array.isArray(child.material)) continue;
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

// Iris, limbus, pupil, wet catchlight and sclera share one corneal dome.
// The iris remains embedded as the gaze shifts behind its anatomical lids.
function eyeSurface(parent) {
  const gaze = { value: new T.Vector2() };
  const mat = surface('#f3e4d2', 0.36);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.eyeGaze = gaze;
    shader.vertexShader =
      'varying vec2 eyePoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\neyePoint=position.xy;',
      );
    shader.fragmentShader =
      'uniform vec2 eyeGaze; varying vec2 eyePoint;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 p=(eyePoint-eyeGaze-vec2(0.,.00075))/vec2(.0104,.0125);
      float r=length(p), a=atan(p.y,p.x), aa=max(.012,fwidth(r));
      float ray=.5+.5*sin(a*43.+sin(11.*a)*2.7+r*9.)*sin(a*17.-r*7.);
      float honey=(.5-.5*p.y)*(.66+.34*ray);
      vec3 iris=mix(vec3(.033,.014,.008),vec3(.24,.105,.037),honey);
      iris*=.77+.23*smoothstep(.53,.76,r);
      iris=mix(iris,vec3(.022,.013,.009),smoothstep(.81,.98,r));
      iris=mix(vec3(.009,.006,.004),iris,smoothstep(.52-aa,.52+aa,r));
      diffuseColor.rgb=mix(iris,diffuseColor.rgb,smoothstep(1.-aa,1.+aa,r));
      float c=1.-smoothstep(.093,.119,length(p-vec2(-.32,.40)));
      c+=.43*(1.-smoothstep(.044,.070,length(p-vec2(.30,-.34))));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.98,.92,.80),min(c,1.));`,
      );
  };
  mat.customProgramCacheKey = () => 'sippy-corneal-iris';
  ellipsoid(parent, mat, 0, 0, 0, 0.0196, 0.0162, 0.0084);
  return gaze.value;
}

// The two lids glide over the convex eye (including the iris), so a blink
// keeps the volume of the eyeball. Their lash edges are part of the same skin.
function eyelid(parent, skin, lash, upper) {
  const cols = 28,
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
  const offsets = [0, 0.047, 0.32, 0.68, 1];
  let lastClosure = -1;
  function pose(closure) {
    if (Math.abs(closure - lastClosure) < 0.0001) return;
    lastClosure = closure;
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * 2 - 1,
        radius = Math.sqrt(Math.max(0, 1 - x * x));
      const seam = upper ? 0.65 - 0.75 * closure : -0.66 + 0.56 * closure;
      for (let j = 0; j <= rows; j++) {
        const f = offsets[j],
          y = radius * T.MathUtils.lerp(seam, upper ? 1 : -1, f);
        const k = (j * (cols + 1) + i) * 3;
        positions[k] = 0.02 * x;
        positions[k + 1] = 0.0168 * y;
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        positions[k + 2] = 0.00038 + 0.0091 * z;
        const nx = x / 0.02,
          ny = y / 0.0168,
          nz = z / 0.0091,
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
  const white = surface('#f4e5d4', 0.51);
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
  for (const [kind, materials] of [
    ['skin', [skin, blush, lip]],
    ['cotton', [white]],
    ['wool', [suit, trousers, waistcoat, lapel, edge]],
    ['silk', [silk, oxblood]],
    ['gold', [gold]],
    ['leather', [saddle, saddleEdge, leather]],
    ['metal', [button]],
  ])
    for (const m of materials) detailMaterial(m, kind);
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
  // Shape the cheek planes and the shallow orbit into the same continuous
  // surface as the jaw. A broad warm face sits beneath the raised brow bone.
  const faceShape = rings(cheekRows, 96);
  const facePos = faceShape.attributes.position;
  const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  for (let i = 0; i < facePos.count; i++) {
    const x = facePos.getX(i),
      ax = Math.abs(x),
      y = facePos.getY(i),
      z = facePos.getZ(i);
    const front = T.MathUtils.smoothstep(z, 0.001, 0.031),
      flank = bump(ax, 0.039, 0.017);
    const cheek = bump(y, 0.047, 0.015) * flank,
      jaw = bump(y, 0.025, 0.018) * bump(ax, 0.03, 0.017);
    const brow = bump(y, 0.089, 0.009) * bump(ax, 0.023, 0.019);
    const orbit = bump(y, 0.071, 0.012) * bump(ax, 0.023, 0.016);
    facePos.setXYZ(
      i,
      x + Math.sign(x) * front * (0.0017 * cheek + 0.0012 * jaw),
      y,
      z +
        front *
          (0.0055 * cheek +
            0.0032 * brow +
            0.0022 * jaw -
            0.0021 * orbit +
            0.0021 * bump(y, 0.023, 0.011) * bump(x, 0, 0.017)),
    );
  }
  faceShape.computeVertexNormals();
  const skullMesh = mesh(headSkin, faceShape, skin);
  skullMesh.name = 'sippy-face-sculpt';
  skullMesh.userData.patternPiece = true;
  const neck = group(chest);
  neck.name = 'sippy-neck';
  mesh(
    neck,
    rings([
      [0.145, 0.021, 0.018, 0],
      [0.16, 0.0205, 0.0185, 0],
      [0.195, 0.019, 0.0185, 0.0015],
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
    const eye = group(headSkin, s * 0.0238, 0.0715, 0.0441);
    eye.rotation.y = s * 0.32;
    eye.rotation.z = -s * 0.037;
    const gaze = eyeSurface(eye);
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
        [0.047, 0.0104, 0.0092, 0.054],
        [0.053, 0.01, 0.01, 0.055],
        [0.06, 0.0065, 0.007, 0.052],
        [0.074, 0.0053, 0.0054, 0.0475],
        [0.086, 0.0047, 0.003, 0.0458],
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

  // The upper lip crests at the philtrum and turns up into each cheek.
  for (const sign of [-1, 1]) {
    sweep(
      headSkin,
      lip,
      [
        [0, 0.0341, 0.0482],
        [sign * 0.006, 0.0353, 0.048],
        [sign * 0.013, 0.0352, 0.0473],
        [sign * 0.018, 0.0366, 0.046],
        [sign * 0.022, 0.0385, 0.0444],
      ],
      0.0013,
      0.00115,
      0.1,
    );
    stroke(
      headSkin,
      blush,
      [
        [sign * 0.022, 0.0396, 0.0446],
        [sign * 0.024, 0.0403, 0.0443],
        [sign * 0.025, 0.042, 0.0442],
      ],
      0.00047,
      5,
    );
    stroke(
      headSkin,
      skin,
      [
        [sign * 0.0022, 0.0434, 0.048],
        [sign * 0.0029, 0.039, 0.0488],
        [sign * 0.0047, 0.0365, 0.0481],
      ],
      0.00064,
      6,
    );
  }
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
  const baseColor = new T.Color('#39251c');
  const capP = [],
    capColor = [],
    capUV = [],
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
      capUV.push(u, i / sectors + Math.sign(angle) * 0.13 * u);
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
  cap.setAttribute('uv', new T.Float32BufferAttribute(capUV, 2));
  cap.setIndex(capI);
  cap.computeVertexNormals();
  // U follows the authored fibre direction. Three derives the anisotropic
  // tangent frame from the deformed positions and these UVs at render time.
  const combed = new T.MeshPhysicalMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.44,
    anisotropy: 0.68,
    specularIntensity: 0.64,
    specularColor: '#e9cbb4',
    sheen: 0.22,
    sheenRoughness: 0.65,
    sheenColor: '#bd9274',
  });
  detailMaterial(combed, 'hair');
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
      uv = [],
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
      // The solid root tapers into a slightly squared, rounded blade tip.
      // Keeping width as well as depth through the last bend makes a moving
      // clump legible from both sides, including at follow-camera distance.
      const envelope = (0.17 + 0.83 * Math.sin(Math.PI * (0.15 + 0.85 * u)) ** 0.57) * (1 - 0.12 * u);
      for (let i = 0; i <= around; i++) {
        const a = (i / around) * tau,
          groove = 0.5 + 0.5 * Math.cos(7 * a + 0.8 * Math.sin(3 * u));
        const socket = 0.27 + 0.73 * T.MathUtils.smoothstep(u, 0, 0.15);
        const w = Math.cos(a) * width * envelope * (0.72 + 0.28 * socket),
          h = Math.sin(a) * depth * envelope * socket * (0.94 + 0.06 * groove);
        vertices.push(
          centre.x + side.x * w + out.x * h,
          centre.y + side.y * w + out.y * h,
          centre.z + side.z * w + out.z * h,
        );
        const rootToTip = 0.54 + 0.95 * T.MathUtils.smoothstep(u, 0.02, 0.96);
        const value = (0.76 + 0.24 * groove + 0.16 * Math.sin(a)) * rootToTip;
        colors.push(base.r * value * (0.94 + 0.13 * u), base.g * value, base.b * value * (1.08 - 0.13 * u));
        uv.push(u, i / around);
        if (i < around && j < along) {
          const n = j * (around + 1) + i;
          ix.push(n, n + 1, n + around + 1, n + 1, n + around + 2, n + around + 1);
        }
      }
    }
    // Cap the swept sections: rounded tiny tips stay solid on a turn.
    for (const j of [0, along]) {
      const end = curve.getPointAt(j / along),
        center = vertices.length / 3;
      vertices.push(end.x, end.y, end.z);
      const k = j * (around + 1) * 3;
      colors.push(colors[k], colors[k + 1], colors[k + 2]);
      uv.push(j / along, 0.5);
      for (let i = 0; i < around; i++) {
        const a = j * (around + 1) + i;
        if (j === 0) ix.push(center, a + 1, a);
        else ix.push(center, a, a + 1);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    const lockGroup = group(headSkin);
    lockGroup.name = name;
    mesh(lockGroup, geo, combed);
    if (flex) grooms.push({ group: lockGroup, points, flex });
  }
  // The deep side part feeds a fan of swept forelocks: flat at the hairline,
  // projecting well forward over the forehead before rising and folding back.
  const browns = ['#503328', '#563a2c', '#463025', '#5a3b2b', '#50362b'];
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
      pt.addScaledVector(n, section - 0.00032 - 0.0026 * f - 0.002 * Math.sin(Math.PI * f));
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
  for (let j = 0; j < 8; j++) {
    const u = (j + 0.5) / 8,
      arch = Math.sin(Math.PI * u);
    const points = crest(u);
    // Eight solid, individually swept sections. Their spacing opens toward
    // the free ends and the side part follows an asymmetric diagonal.
    for (let i = 1; i < points.length - 1; i++) {
      const f = i / (points.length - 1);
      points[i][0] -= 0.0065 * Math.sin(Math.PI * f) * (0.4 + arch);
      points[i][2] += 0.002 * Math.sin(Math.PI * f + 0.8 * j);
    }
    lock(
      'sippy-quiff-' + j,
      points,
      0.0087 + 0.002 * arch,
      0.0036 + 0.0014 * arch,
      browns[j % browns.length],
      { role: 'mass', stiffness: 105 + j * 3, damping: 10 + j * 0.3, maxOffset: 0.017, radius: 0.0026 },
    );
  }
  // A pair of short curls loosens at the hairline. Roots are buried in
  // the pompadour, with tapered tips floating clear of the brow and ear.
  for (const sign of [-1, 1]) {
    const long = sign > 0 ? 1 : 0;
    const temples = [
      [sign * (0.021 + long * 0.003), 0.145, 0.019],
      [sign * 0.038, 0.137 + long * 0.002, 0.032],
      [sign * 0.049, 0.119 + long * 0.005, 0.034],
      [sign * 0.052, 0.104 - long * 0.002, 0.032],
      [sign * (0.051 - long * 0.001), 0.099 - long * 0.005, 0.034 + long * 0.002],
    ];
    lock('sippy-face-' + (long ? 'L' : 'R'), temples, 0.0065 + long * 0.0015, 0.0034, browns[long ? 1 : 3], {
      role: 'face',
      stiffness: long ? 91 : 102,
      damping: long ? 9.3 : 10.9,
      maxOffset: 0.016,
      radius: 0.0023,
    });
    // Brushed-back sections follow the contours of the temples before
    // tapering into the low nape. Let the tips separate on a turn.
    for (let i = 0; i < 7; i++) {
      const a = sign * (0.94 + i * 0.302);
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const u = 1 - k / 5,
          v = scalp(
            a + sign * (0.5 * u + 0.12 * Math.sin(Math.PI * u)),
            0.022 + u * (0.65 + 0.1 * Math.sin(i + sign * 0.5)),
          );
        const n = vec(v[0], v[1] - 0.08, v[2] + 0.003).normalize();
        const clearance = 0.002 + 0.0022 * (1 - u);
        pts.push([v[0] + n.x * clearance, v[1] + n.y * clearance, v[2] + n.z * clearance]);
      }
      const flex =
        i % 2 === 0
          ? { role: 'mass', stiffness: 135 + i * 3, damping: 13, maxOffset: 0.01, radius: 0.0017 }
          : null;
      lock('sippy-taper-' + sign + '-' + i, pts, 0.0078, 0.0028, browns[(i + 3) % browns.length], flex);
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

  const materials = { skin, white, suit, waistcoat, lapel, trousers, oxblood, silk, edge, gold };
  const tailoring = cutSuit(rig, materials),
    tails = tailoring.tails;
  const onCloth = (x, y, lift = 0.0018) => [x, y, frontZ(x, y, lift)];
  for (let j = 0; j < 5; j++) {
    const y = 0.043 - j * 0.025,
      z = frontZ(0.002, y, -0.0027);
    ellipsoid(chest, button, 0.002, y, z, 0.0042, 0.0042, 0.0018);
    for (const a of [-1, 1])
      ellipsoid(chest, gold, 0.002 + a * 0.0011, y, z + 0.00162, 0.00042, 0.00049, 0.00032);
  }
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

  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const upper = rig['upperArm' + side],
      lower = rig['forearm' + side],
      hand = rig['hand' + side];
    const foot = rig['foot' + side];
    upper.position.x = s * 0.149;
    fitLimb(tailoring, side, false, materials);
    fitLimb(tailoring, side, true, materials);
    for (const y of [-0.119, -0.108, -0.097]) {
      ellipsoid(lower, button, s * 0.0295, y, 0.001, 0.0018, 0.0033, 0.0033);
      ellipsoid(lower, gold, s * 0.0312, y, 0.001, 0.0005, 0.0006, 0.0006);
    }
    // The thumb opposes the fingers; the shorter index and pinkie curve
    // separately toward the stem. A flat nail plate follows each distal joint.
    const palm = group(hand);
    palm.scale.set(1.14, 1.06, 1.14);
    mesh(
      palm,
      rings(
        [
          [-0.041, 0.01, 0.014, 0.001],
          [-0.033, 0.016, 0.019, 0.0],
          [-0.02, 0.017, 0.021, 0.002],
          [-0.008, 0.016, 0.018, 0.001],
          [0.007, 0.014, 0.014, 0.001],
        ],
        32,
      ),
      skin,
    );
    const nail = surface('#d69e83', 0.43);
    for (let j = 0; j < 4; j++) {
      const z = 0.0143 - j * 0.0096,
        len = [0.02, 0.025, 0.023, 0.017][j],
        base = -0.03 + 0.002 * Math.abs(j - 1);
      const x0 = s * (0.006 - 0.0015 * Math.abs(j - 1)),
        d = 0.0048 - 0.00035 * Math.abs(j - 1);
      const tip = [x0 - s * (0.011 + 0.001 * j), base - len * 0.98, z + 0.0052];
      sweep(
        palm,
        skin,
        [
          [x0, base + 0.004, z],
          [x0 + s * 0.001, base - 0.005, z - 0.0005],
          [x0 - s * 0.0007, base - len * 0.52, z + 0.0002],
          [x0 - s * 0.0046, base - len * 0.84, z + 0.0016],
          tip,
        ],
        d * 1.15,
        d,
        0.7,
      );
      ellipsoid(palm, skin, x0 + s * 0.0032, base + 0.0005, z, d * 0.84, d * 0.91, d * 0.88);
      const plate = ellipsoid(
        palm,
        nail,
        tip[0] + s * 0.002,
        tip[1] - 0.0021,
        tip[2] - 0.0004,
        0.0042,
        0.00125,
        0.00205,
      );
      plate.rotation.z = s * 0.37;
      const fold = stroke(
        palm,
        blush,
        [
          [x0 + s * d * 0.8, base - 0.006, z - 0.0014],
          [x0 + s * d * 0.98, base - 0.0068, z + 0.0001],
          [x0 + s * d * 0.77, base - 0.006, z + 0.0016],
        ],
        0.00032,
        5,
      );
      fold.userData.highDetail = true;
    }
    const thumbPts = [
      [-s * 0.009, -0.01, 0.006],
      [-s * 0.015, -0.014, 0.017],
      [-s * 0.017, -0.021, 0.026],
      [-s * 0.013, -0.028, 0.029],
      [-s * 0.006, -0.03, 0.027],
    ];
    sweep(palm, skin, thumbPts, 0.007, 0.0057, 0.71);
    const thumbNail = ellipsoid(palm, nail, -s * 0.0083, -0.03, 0.03, 0.0039, 0.0025, 0.0012);
    thumbNail.rotation.z = s * 0.25;
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
    { role: 'head', node: headSkin, center: [0, 0.068, -0.001], radii: [0.0635, 0.0725, 0.0585] },
    { role: 'neck', node: neck, center: [0, 0.18, 0.002], radii: [0.037, 0.05, 0.035] },
    { role: 'back', node: chest, center: [0, 0.105, -0.003], radii: [0.163, 0.085, 0.102] },
    { role: 'collar', node: chest, center: [0, 0.16, 0.012], radii: [0.059, 0.042, 0.065] },
    { role: 'shoulder', node: rig.upperArmL, center: [0, -0.022, 0], radii: [0.0475, 0.0465, 0.0505] },
    { role: 'shoulder', node: rig.upperArmR, center: [0, -0.022, 0], radii: [0.0475, 0.0465, 0.0505] },
  ]);
  for (const groom of grooms) hairMotion.add(groom.group, groom.points, groom.flex);
  rig.secondary ??= {};
  // Use the final batched render skin (cheeks, nose and ears) for contact checks.
  const faceSkin = headSkin.children.filter((part) => part.isMesh && part.material === skin);
  const finishSuit = fitOpenings(tailoring),
    sleeveHeads = setSleeveHeads(tailoring);
  const g = tailoring.surfaces;
  g['body-neck'] = [...neck.children];
  g['body-head'] = [skullMesh];
  tailoring.beneath('collar', 'body-head');
  for (const s of ['L', 'R']) {
    const hand = rig['hand' + s].children.find(
      (node) => node.isGroup && node !== goblet && node.children.some((k) => k.isMesh && k.material === skin),
    );
    g['body-hand-' + s] = hand.children.filter((k) => k.isMesh && k.material === skin);
    tailoring.beneath('shirtsleeve-' + s, 'body-hand-' + s);
  }
  tailoring.beneath('collar', 'body-neck');
  const collarSkin = [
    ...tailoring.surfaces.collar,
    ...tailoring.surfaces.jacket,
    ...tailoring.surfaces.lapels,
  ];
  rig.secondary.sippy = {
    bag: satchel,
    tail: tails[0],
    chain,
    faceSkin,
    collarSkin,
    neckSkin: neck.children,
    upperBack: tailoring.surfaces.jacket,
    bodyParts: anatomyRegions(tailoring, neck),
  };
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

      gazes[i].y = -0.0018 * focus + 0.0009 * Math.sin(t * 0.85);
      gazes[i].x = 0.0016 * Math.sin(t * 0.67);
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
      plane.set(-1.72, -0.71, 0.48);
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
    // Pitch about the upper cervical pivot underneath the jaw. This keeps
    // the front of the turned collar below the chin during a roll or sniff.
    rig.head.position.y = 0.203 + 0.04 * Math.max(0, Math.sin(rig.head.rotation.x));
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
    for (let i = 0; i < tailoring.updates.length; i++) tailoring.updates[i]();
    finishSuit();
    sleeveHeads();
    hairMotion.step(f);
    satchel.rotation.z = 0.024 * Math.sin(f.phase + 1) * Math.min(1, f.speed);
  };
}
