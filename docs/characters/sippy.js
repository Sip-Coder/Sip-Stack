// The field educator. All dimensions here are fractions of standing height.
import * as T from 'three';
import { secondaryMotion } from './secondary.js';
import { outfitExplorer, quiltFinish } from './sippy-explorer.js';
import { fitExpression } from './sippy-expression.js';
import { fitHipSeams } from './sippy-hips.js';
import { buildExplorerHands } from './sippy-body.js';
import { cutExplorerLayers, fitLimb, anatomyRegions, fitOpenings } from './sippy-tailoring.js';
import { addExteriorShell, attachExteriorProfile, seatExplorerHead, shapeExplorerCrown } from './human-exterior.js';
import { sippyExterior } from './sippy-exterior-data.js';

const tau = Math.PI * 2;
const vec = (x, y, z) => new T.Vector3(x, y, z);
const group = (parent, x = 0, y = 0, z = 0) => {
  const g = new T.Group();
  parent.add(g);
  g.position.set(x, y, z);
  return g;
};

function surface(color, roughness = 0.65, extra = {}) {
  const Material = extra.specularIntensity === undefined ? T.MeshStandardMaterial : T.MeshPhysicalMaterial;
  return new Material({ color, roughness, ...extra });
}
function mesh(parent, shape, material, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(shape, material);
  m.position.set(x, y, z);
  m.castShadow = !material.transparent;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
let unitOval;
function ellipsoid(p, mat, x, y, z, rx, ry, rz) {
  unitOval ??= new T.SphereGeometry(1, 10, 7);
  const shape = unitOval.clone();
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
  const layers = (rows.length - 1) * 2;
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
  path.arcLengthDivisions = Math.max(12, coords.length * 6);
  return mesh(parent, new T.TubeGeometry(path, Math.max(4, coords.length * 2), w, Math.min(facets, 5)), mat);
}
// Tapered locks, brows and fingers have elliptical, continuously turning sections.
function sweep(parent, mat, coords, width, depth, thickEnd = 0.04) {
  const path = new T.CatmullRomCurve3(
    coords.map((c) => vec(...c)),
    false,
    'catmullrom',
    0.45,
  );
  path.arcLengthDivisions = coords.length * 8;
  const n = coords.length * 2,
    sides = 8,
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

// A few roots carry whole swept sections of the groom; their meshes keep their
// original local vertices and can be batched together under each moving root.
function styleQuiff(head, locks) {
  const sections = new Map();
  for (const lock of locks) {
    const x = lock.points[0][0];
    const crest = lock.group.name.startsWith('sippy-quiff-');
    const id = crest ? (x < -0.014 ? 0 : x > 0.014 ? 2 : 1) : x < 0 ? 3 : 4;
    if (!sections.has(id)) sections.set(id, { pivot: vec(0,0,0), locks: [], side: Math.sign(x) });
    const section = sections.get(id);
    section.pivot.add(vec(...lock.points[0]));
    section.locks.push(lock.group);
  }
  const banks = [];
  for (const [id, section] of sections) {
    const pivot = section.pivot.divideScalar(section.locks.length);
    const root = group(head, pivot.x, pivot.y, pivot.z);
    root.name = 'Sippy quiff spring ' + id;
    root.userData.dynamicPose = true;
    for (const lock of section.locks) {
      root.add(lock);
      lock.position.sub(pivot);
    }
    banks.push({ root, id, side: section.side });
  }
  return banks;
}

// Iris, limbus, pupil, wet catchlight and sclera share one corneal dome.
// The iris remains embedded as the gaze shifts behind its anatomical lids.
function eyeSurface(parent) {
  const gaze = { value: new T.Vector2() };
  const mat = surface('#f5e8d8', 0.36, { specularIntensity: 0.25 });
  const iris = new T.Color('#734214'),
    pupil = new T.Color('#190600'),
    catchlight = new T.Color('#fff8e7');
  mat.userData.blueprintId = 'sclera';
  mat.userData.finishInks = { iris, pupil, catchlight };
  mat.userData.blueprintSamples = [
    { id: 'sclera', xy: [0.014, 0.002], width: 0.002 },
    { id: 'iris', xy: [0.0076, -0.002], width: 0.0013 },
    { id: 'pupil', xy: [0.0007, 0.0016], width: 0.0015 },
    { id: 'catchlight', xy: [-0.0026, 0.00625], width: 0.0004 },
  ];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.eyeGaze = gaze;
    shader.uniforms.irisTint = { value: iris };
    shader.uniforms.pupilTint = { value: pupil };
    shader.uniforms.glintTint = { value: catchlight };
    shader.vertexShader =
      'varying vec2 eyePoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\neyePoint=position.xy;',
      );
    shader.fragmentShader =
      'uniform vec2 eyeGaze; uniform vec3 irisTint,pupilTint,glintTint; varying vec2 eyePoint;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 p=(eyePoint-eyeGaze-vec2(0.,.00075))/vec2(.0104,.0125);
      float r=length(p), a=atan(p.y,p.x), aa=max(.012,fwidth(r));
      float ray=.5+.5*sin(a*43.+sin(11.*a)*2.7+r*9.)*sin(a*17.-r*7.);
      float honey=(.5-.5*p.y)*(.66+.34*ray);
      vec3 iris=irisTint*(.69+.65*honey);
      iris*=.77+.23*smoothstep(.53,.76,r);
      iris=mix(iris,vec3(.022,.013,.009),smoothstep(.81,.98,r));
      iris=mix(pupilTint,iris,smoothstep(.52-aa,.52+aa,r));
      diffuseColor.rgb=mix(iris,diffuseColor.rgb,smoothstep(1.-aa,1.+aa,r));
      float c=1.-smoothstep(.093,.119,length(p-vec2(-.32,.40)));
      c+=.43*(1.-smoothstep(.044,.070,length(p-vec2(.30,-.34))));
      diffuseColor.rgb=mix(diffuseColor.rgb,glintTint,min(c,1.));`,
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
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
  geometry.setIndex(index);
  const lid = mesh(parent, geometry, [lash, skin]);
  lid.frustumCulled = false;
  geometry.addGroup(0, cols * 6, 0);
  geometry.addGroup(cols * 6, index.length - cols * 6, 1);
  const offsets = [0, 0.047, 0.32, 0.68, 1];
  function sample(closure) {
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
  }
  const stops = 3;
  geometry.morphAttributes.position = [];
  geometry.morphAttributes.normal = [];
  for (let i = 1; i <= stops; i++) {
    sample(i / stops);
    geometry.morphAttributes.position.push(new T.Float32BufferAttribute(positions.slice(), 3));
    geometry.morphAttributes.normal.push(new T.Float32BufferAttribute(normals.slice(), 3));
  }
  sample(0);
  lid.updateMorphTargets();
  return (closure) => {
    const t = T.MathUtils.clamp(closure, 0, 1) * stops;
    for (let i = 0; i < stops; i++) lid.morphTargetInfluences[i] = Math.max(0, 1 - Math.abs(t - (i + 1)));
  };
}

// Pinstripes follow the cut of each pattern piece. Filter their footprint on
export function buildSippy(rig) {
  attachExteriorProfile(rig, sippyExterior);
  const skin = surface('#dfa071', 0.54),
    blush = surface('#c78669', 0.62);
  const hair = surface('#2d1605', 0.44, { specularIntensity: 0.38 }),
    black = surface('#1b0904', 0.48, { specularIntensity: 0.24 });
  const white = surface('#f5e5c5', 0.64),
    mouth = surface('#5a1d13', 0.52, { specularIntensity: 0.52 }),
    lip = surface('#ad684c', 0.57);
  const suit = surface('#39393c', 0.76),
    trousers = surface('#f1e1c0', 0.79),
    waistcoat = surface('#841e32', 0.78),
    lapel = surface('#1d1d24', 0.71),
    edge = lapel;
  const gold = surface('#c5a35b', 0.36, { metalness: 0.57 }),
    button = surface('#54565b', 0.46, { metalness: 0.45 }),
    leather = surface('#79132b', 0.7),
    welt = surface('#e7dac2', 0.69),
    saddle = surface('#884c19', 0.6),
    saddleEdge = surface('#aa723b', 0.59),
    cargoSeam = surface('#c2b18b', 0.76),
    knit = surface('#630b23', 0.83),
    pad = surface('#171721', 0.8);
  const enamel = surface('#f5e7d6', 0.39);
  const sheen = new T.MeshPhysicalMaterial({
    color: '#834c23',
    roughness: 0.46,
    anisotropy: 0.58,
    specularIntensity: 0.48,
  });
  for (const [id, mat] of Object.entries({
    skin,
    flush: blush,
    lips: lip,
    mouth,
    sclera: enamel,
    hair,
    pupil: black,
    quilt: suit,
    trousers,
    hoodie: waistcoat,
    binding: lapel,
    shirt: white,
    gold,
    metal: button,
    shoe: leather,
    sole: welt,
    leather: saddle,
    saddleEdge,
    cargoSeam,
    cuff: knit,
    pad,
    chestnut: sheen,
  }))
    mat.userData.blueprintId = id;
  const head = rig.head,
    chest = rig.chest;
  quiltFinish(suit);
  const headSkin = group(head);
  headSkin.name = 'sippy-head';
  seatExplorerHead(rig, headSkin, { width: 0.138, depth: 0.111, baseWidth: 0.116,
    baseDepth: 0.104, height: 0.122, middle: 0.067, front: 0.003 });
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
  const cheekColumns = 56,
    faceShape = rings(cheekRows, cheekColumns);
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
  const expression = fitExpression(skullMesh, cheekColumns, mouth, enamel, lip);
  const orbitalRims = [];
  const neck = group(chest);
  neck.name = 'sippy-neck';
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
  const corneas = [];
  const gazes = [],
    lids = [],
    brows = [];
  for (const s of [-1, 1]) {
    const eye = group(headSkin, s * 0.0237, 0.0798, 0.0441);
    eye.rotation.y = s * 0.38;
    eye.rotation.z = -s * 0.037;
    eye.scale.set(1.06, 1.19, 0.83);
    orbitalRims.push(expression.orbit(eye, skin, s));
    const gaze = eyeSurface(eye);
    corneas.unshift(eye.children.at(-1));
    lids.push(eyelid(eye, skin, black, true), eyelid(eye, skin, blush, false));
    gazes.push(gaze);
    const brow = group(headSkin, s * 0.025, 0.1012, 0.0418);
    brow.name = 'sippy-brow-' + (s === 1 ? 'L' : 'R');
    brow.userData.dynamicPose = true;
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
        [0.047, 0.004, 0.003, 0.052],
        [0.05, 0.0102, 0.0085, 0.053],
        [0.056, 0.0096, 0.0092, 0.054],
        [0.06, 0.0065, 0.007, 0.052],
        [0.074, 0.0053, 0.0054, 0.0475],
        [0.086, 0.0047, 0.003, 0.0458],
      ],
      24,
    ),
    skin,
  );
  for (const s of [-1, 1]) ellipsoid(headSkin, blush, s * 0.006, 0.0505, 0.06, 0.0017, 0.00095, 0.0007);
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
    let lo = 1, i = skull.length - 1;
    while (lo < i) {
      const mid = (lo + i) >> 1;
      if (skull[mid][0] < p[1]) lo = mid + 1;
      else i = mid;
    }
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
  const sectors = 44,
    latitudes = 14;
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
    color: '#876b51',
    vertexColors: true,
    roughness: 0.44,
    anisotropy: 0.68,
    specularIntensity: 0.64,
    specularColor: '#e9cbb4',
    sheen: 0.22,
    sheenRoughness: 0.65,
    sheenColor: '#bd9274',
  });
  combed.userData.blueprintId = 'hair';
  const scalpCap = mesh(headSkin, cap, combed);
  scalpCap.userData.patternPiece = true;
  const haircut = [scalpCap];
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
    curve.arcLengthDivisions = 48;
    const along = 12,
      around = 8,
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
    if (name.startsWith('sippy-quiff-')) {
      const pos = [],
        strips = [],
        tex = [];
      for (let j = 2; j < along - 2; j++) {
        const u = j / along;
        const a = 0.5 * Math.PI + 0.17 * Math.sin(u * Math.PI);
        for (const sign of [-1, 1]) {
          const phi = a + sign * 0.076 * Math.sin((Math.PI * (j - 2)) / (along - 5));
          const s = (phi / tau) * around,
            k = Math.floor(s),
            t = s - k;
          const l = (j * (around + 1) + k) * 3;
          for (let axis = 0; axis < 3; axis++) {
            const c = vertices[l + axis] * (1 - t) + vertices[l + 3 + axis] * t;
            pos.push(c + (0.00022 * (c - [0, 0.079, -0.004][axis])) / 0.09);
          }
          tex.push(u, sign === 1 ? 1 : 0);
        }
        if (j > 2) {
          const k = (j - 2) * 2;
          strips.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
      const h = new T.BufferGeometry();
      h.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      h.setAttribute('uv', new T.Float32BufferAttribute(tex, 2));
      h.setIndex(strips);
      h.computeVertexNormals();
      mesh(lockGroup, h, sheen);
    }
    haircut.push(lockGroup);
    if (flex) grooms.push({ group: lockGroup, points, flex });
  }
  // The deep side part feeds a fan of swept forelocks: flat at the hairline,
  // projecting well forward over the forehead before rising and folding back.
  const browns = ['#503328', '#563a2c', '#463025', '#5a3b2b', '#50362b'];
  function crest(u) {
    const x = -0.0475 + 0.095 * u,
      rim = (2 * u - 1) ** 2,
      arch = 1 - rim;
    const back = scalp(Math.PI - Math.asin(x / 0.058), 0.51);
    const wave = 0.008 * (1 - rim * 0.45);
    return [
      scalp(Math.asin(x / 0.06), 0.018),
      [x * 0.94 - wave * 1.1, 0.126 + 0.005 * arch - 0.007 * rim, 0.053 - 0.014 * rim],
      [x * 0.92 - wave * 2.4, 0.1505 + 0.005 * arch - 0.007 * rim, 0.048 - 0.014 * rim],
      [x * 0.97 - wave * 1.7, 0.161 + 0.0033 * arch - 0.007 * rim, 0.028 - 0.006 * rim],
      [x + wave * 0.1, 0.1635 + 0.0027 * arch - 0.0068 * rim, -0.008 - 0.002 * arch],
      [x * 0.96 + wave, 0.1565 + 0.0032 * arch - 0.006 * rim, -0.029 + 0.003 * rim],
      [x * 0.96 + wave * 1.4, 0.143 + 0.0035 * arch - 0.006 * rim, -0.043 + 0.006 * rim],
      back,
    ];
  }
  // The solid section under the hand-combed ridges sweeps through the side
  // part and back into the occipital taper; moving ends have hair under them.
  const crestP = [],
    crestC = [],
    crestI = [];
  const columns = 28,
    steps = 18;
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
  const baseGroom = surface('#e2c47b', 0.41, {
    vertexColors: true,
    side: T.DoubleSide,
    specularIntensity: 0.35,
  });
  baseGroom.userData.blueprintId = 'hair';
  haircut.push(mesh(headSkin, coiffure, baseGroom));
  // Fill the quiff from beneath where the temple rounds into the swept forelock.
  // It is the same combed hair mass; the sprung tips remain free above it.
  const undercut = rings(
    [
      [0.105, 0.049, 0.04, -0.003],
      [0.126, 0.0505, 0.038, -0.001],
      [0.142, 0.053, 0.037, 0.002],
      [0.153, 0.052, 0.033, 0.004],
      [0.158, 0.04, 0.024, 0.004],
      [0.161, 0.023, 0.013, 0.004],
    ],
    56,
  );
  const fill = [];
  for (let i = 0; i < undercut.attributes.position.count; i++)
    fill.push(baseColor.r * 0.84, baseColor.g * 0.84, baseColor.b * 0.84);
  undercut.setAttribute('color', new T.Float32BufferAttribute(fill, 3));
  const innerCrest = mesh(headSkin, undercut, baseGroom, -0.001, 0, 0);
  innerCrest.userData.patternPiece = true;
  haircut.at(-1).userData.patternPiece = true;
  haircut.push(innerCrest);
  const partBreath = [0.033, 0.0319, 0.03];
  const crestGait = [0.568, 0.71, 0.71, 0.71, 0.71, 0.8875, 0.058];
  for (let j = 0; j < 7; j++) {
    const u = j / 6,
      arch = Math.sin(Math.PI * u);
    const points = crest(u);
    // Seven broad, individually swept sections. Their spacing opens toward
    // the free ends and the side part follows an asymmetric diagonal.
    for (let i = 1; i < points.length - 1; i++) {
      const f = i / (points.length - 1);
      points[i][0] -= 0.0065 * Math.sin(Math.PI * f) * (0.4 + arch);
      points[i][2] += 0.002 * Math.sin(Math.PI * f + 0.8 * j);
    }
    lock(
      'sippy-quiff-' + j,
      points,
      0.0102 + 0.0024 * arch,
      0.0041 + 0.0015 * arch,
      browns[j % browns.length],
      {
        role: 'mass',
        stiffness: j === 6 ? 138 : 105 + j * 3,
        damping: j === 6 ? 12.4 : 10 + j * 0.3,
        maxOffset: 0.017,
        radius: 0.0026,
        // The short side part and the two broad outer crests carry different
        // amounts of breathing and footfall through their actual hair fibres.
        breathingBend: partBreath[j] ?? 0.02,
        gaitCoupling: crestGait[j],
      },
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
    // One loose S-shaped forelock reverses the crown sweep, curling inward over the brow.
    const curl = long
      ? [
          [0.016, 0.145, 0.034],
          [0.04, 0.147, 0.042],
          [0.049, 0.13, 0.046],
          [0.042, 0.117, 0.054],
          [0.029, 0.111, 0.059],
          [0.024, 0.101, 0.061],
          [0.028, 0.096, 0.06],
        ]
      : temples;
    lock('sippy-face-' + (long ? 'L' : 'R'), curl, 0.0065 + long * 0.0015, 0.0034, browns[long ? 1 : 3], {
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
      if (flex && i === 0) flex.gaitCoupling = sign < 0 ? 0.9798 : 0.5538;
      lock('sippy-taper-' + sign + '-' + i, pts, 0.0078, 0.0028, browns[(i + 3) % browns.length], flex);
    }
    const burn = group(headSkin);
    haircut.push(burn);
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

  const materials = { skin, white, suit, waistcoat, lapel, trousers, edge, gold };
  const tailoring = cutExplorerLayers(rig, materials),
    tails = tailoring.tails;
  const exploreMats = {
    suit,
    trousers,
    waistcoat,
    lapel,
    white,
    gold,
    leather,
    welt,
    saddle,
    saddleEdge,
    cargoSeam,
    knit,
    pad,
    button,
  };
  const hands = buildExplorerHands(rig, skin);
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const hand = rig['hand' + side];
    fitLimb(tailoring, side, false, materials);
    fitLimb(tailoring, side, true, materials);
    // The thumb opposes the fingers; the shorter index and pinkie curve
    // separately toward the stem. A flat nail plate follows each distal joint.
    const palm = group(hand);
    const skinHand = hands[side];
    palm.position.copy(skinHand.position);
    palm.scale.set(1.14 * Math.abs(skinHand.scale.x), 1.06 * skinHand.scale.y, 1.14 * skinHand.scale.z);
    const nail = surface('#c48366', 0.43);
    nail.userData.blueprintId = 'flush';
    for (let j = 0; j < 4; j++) {
      const z = 0.0143 - j * 0.0096,
        len = [0.02, 0.025, 0.023, 0.017][j],
        base = -0.03 + 0.002 * Math.abs(j - 1);
      const x0 = s * (0.006 - 0.0015 * Math.abs(j - 1)),
        d = 0.0048 - 0.00035 * Math.abs(j - 1);
      const tip = [x0 - s * (0.011 + 0.001 * j), base - len * 0.98, z + 0.0052];
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
    const thumbNail = ellipsoid(palm, nail, -s * 0.0083, -0.03, 0.03, 0.0039, 0.0025, 0.0012);
    thumbNail.rotation.z = s * 0.25;
  }
  const explorer = outfitExplorer(rig, tailoring, exploreMats, {
    group,
    mesh,
    ellipsoid,
    rings,
    stroke,
    sweep,
    panel,
    vec,
  });
  const { pack, drawcord } = explorer;
  for (const node of [pack, drawcord, ...tails]) node.userData.dynamicPose = true;
  // A small irregular constellation over each malar prominence.
  for (const s of [-1, 1]) {
    for (const [x, y, z, r] of [
      [0.029, 0.061, 0.047, 0.001],
      [0.033, 0.063, 0.045, 0.00076],
      [0.038, 0.061, 0.041, 0.00095],
      [0.036, 0.057, 0.043, 0.00066],
      [0.027, 0.058, 0.048, 0.00067],
    ]) {
      ellipsoid(headSkin, blush, x * s, y, z, r, r * 0.69, r * 0.4);
    }
  }
  const banks = styleQuiff(headSkin, grooms);
  shapeExplorerCrown(rig, headSkin);
  rig.secondary ??= {};
  // Keep the actual face and collar surfaces available to the review tools.
  const faceSkin = headSkin.children
    .filter((part) => part.isMesh && part.material === skin)
    .concat(orbitalRims);
  fitOpenings(tailoring)();
  fitHipSeams(tailoring);
  explorer.bakeFit();
  const g = tailoring.surfaces;
  const body = addExteriorShell(rig, skin.color);
  g.body = body.meshes;
  g['body-head'] = [skullMesh];
  tailoring.beneath('collar', 'body-head');
  tailoring.beneath('collar', 'body');
  const collarSkin = [
    ...tailoring.surfaces.collar,
    ...tailoring.surfaces['quilted-vest'],
    ...tailoring.surfaces['zipper-plackets'],
  ];
  rig.secondary.sippy = {
    tail: tails[0],
    pack,
    drawcord,
    faceSkin,
    collarSkin,
    neckSkin: [],
    upperBack: tailoring.surfaces['quilted-vest'],
    bodyParts: anatomyRegions(tailoring, neck),
  };
  const feature = (label, ...parts) => ({ label, parts });
  const edgeBinding = (mesh, start, count) => {
    const high = Array.from({ length: count }, (_, i) => start + i);
    return { mesh, vertices: { high, mobile: high.filter((_, i) => i % 2 === 0) } };
  };
  rig.blueprint = {
    groom: feature('Combed scalp, temple tapers and full swept crown', ...haircut),
    chin: feature('Mandibular skin under the laugh line', skullMesh),
    eyes: corneas.map((m, i) => feature('Corneal dome over the iris ' + (i ? 'R' : 'L'), m)),
    waist: feature('Top trouser-rise band', edgeBinding(g['trouser-rise'][0], 14 * rig.garments.hips.columns, rig.garments.hips.columns)),
    shoulders: ['L', 'R'].map((s) =>
      feature('Outer shoulder sleeve head ' + s, ...g['shoulder-' + s], g['sleeve-' + s][0]),
    ),
    knee: ['L', 'R'].map((s) =>
      feature('Patella equator ' + s, body.knees[s]),
    ),
    ankleCuff: ['L', 'R'].map((s) =>
      feature('Lower trouser cuff ' + s, edgeBinding(g['trousers-' + s][0], 0, rig.garments.hips.columns)),
    ),
  };
  const secondary = secondaryMotion(rig, './sippy-secondary.js', { banks, tails, pack, drawcord });
  return function animate(f) {
    const t = f.time;
    const blinkTime = (t + 0.13) % 4.2,
      blink = blinkTime < 0.16 ? Math.sin((Math.PI * blinkTime) / 0.16) : 0;
    const focus = f.emote >= 0 ? Math.sin(Math.PI * f.emote) ** 0.8 : 0;
    const thinking = f.emote < 0 ? 0 : Math.exp(-((f.emote - 0.56) ** 2) / 0.01);
    const wink = f.emote < 0 ? 0 : Math.exp(-(((f.emote - 0.86) / 0.042) ** 2));
    const curious = f.emote < 0 ? 0 : Math.exp(-(((f.emote - 0.22) / 0.13) ** 2));
    const rise = f.state === 'jump' ? Math.min(1, 0.36 + Math.abs(f.vy) * 0.15) : 0;
    const laugh = f.state === 'run' ? 0.74 + 0.14 * Math.sin(f.phase * 2) : 0;
    expression.smile(Math.max(laugh, focus, 0.22 * Number(f.state === 'walk')), thinking, rise);

    for (let i = 0; i < 2; i++) {
      const close = Math.max(
        blink,
        thinking * (i === 0 ? 0.33 : 0.18),
        i === 1 ? wink : 0,
        laugh * 0.17,
        f.state === 'roll' ? 0.36 : 0,
      );
      lids[i * 2](close);
      lids[i * 2 + 1](close);
      const side = i === 0 ? -1 : 1;
      brows[i].position.y =
        0.1012 +
        0.005 * focus +
        0.0013 * Math.sin(t * 1.1 + i) +
        side * 0.003 * thinking +
        rise * 0.004 +
        curious * (i === 0 ? 0.005 : 0.001);
      brows[i].rotation.z = side * (0.11 * thinking - 0.14 * focus + 0.04 * Math.sin(t * 0.7));

      gazes[i].y = -0.0018 * focus + 0.0009 * Math.sin(t * 0.85);
      gazes[i].x = 0.0016 * Math.sin(t * 0.67);
    }
    // Sippy raises his left wrist to check the time and glances toward the dial.
    const resting = 1 / (1 + f.speed * f.speed * 0.4);
    rig.upperArmL.rotation.z += 0.003 * resting;
    rig.upperArmR.rotation.z -= 0.003 * resting;
    rig.forearmL.rotation.x += 0.042 * resting - 1.3 * focus;
    rig.forearmR.rotation.x += 0.043 * resting;
    rig.upperArmL.rotation.x -= 0.47 * focus;
    rig.upperArmL.rotation.z += 0.092 * focus;
    rig.head.rotation.y += 0.32 * focus;
    rig.head.rotation.x += 0.18 * focus;
    for (let i = 0; i < tailoring.updates.length; i++) tailoring.updates[i]();
    secondary(f);
  };
}
