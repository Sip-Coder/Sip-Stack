// The field educator. All dimensions here are fractions of standing height.
import * as T from 'three';
import { secondaryMotion } from './secondary.js';
import { outfitExplorer, quiltFinish } from './sippy-explorer.js';
import { seatSippyMouth } from './sippy-expression.js';
import { buildExplorerFace } from './explorer-face.js';
import { faceShell, skullLandmarks } from './sippy-face-shell.js';
import { fitHipSeams } from './sippy-hips.js';
import { buildExplorerHands } from './human-hands.js';
import { handProfiles } from './sippy-hand-data.js';
import { cutExplorerLayers, fitLimb, anatomyRegions, fitOpenings } from './sippy-tailoring.js';
import { addExteriorShell, attachExteriorProfile } from './human-exterior.js';
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

// Iris, limbus, pupil, wet catchlight and sclera share one corneal dome.
// The iris remains embedded as the gaze shifts behind its anatomical lids.
export function buildSippy(rig, attachGroom) {
  attachExteriorProfile(rig, sippyExterior);
  const skin = surface('#b38965', 0.62);
  const white = surface('#f5e5c5', 0.64);
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
  for (const [id, mat] of Object.entries({
    skin,
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
  }))
    mat.userData.blueprintId = id;
  quiltFinish(suit);
  const face = buildExplorerFace(rig, 'sippy', skin.color, faceShell, skullLandmarks, seatSippyMouth);
  const skullMesh = face.head;
  const neck = group(rig.chest);
  neck.name = 'sippy-neck';
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
  buildExplorerHands(rig, skin, handProfiles);
  for (const side of ['L', 'R']) {
    fitLimb(tailoring, side, false, materials);
    fitLimb(tailoring, side, true, materials);
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
  const groom = attachGroom?.(rig.head);
  rig.groom = groom;
  rig.secondary ??= {};
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
    faceSkin: face.skin,
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
    groom: {
      label: 'Scalp-seated part and swept crown',
      get parts() { return groom ? [groom.group] : []; },
    },
    chin: feature('Mandibular skin under the laugh line', skullMesh),
    eyes: face.eyes.map((m, i) => feature('Corneal dome over the iris ' + (i ? 'R' : 'L'), m)),
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
  const secondary = secondaryMotion(rig, './sippy-secondary.js', { groom, tails, pack, drawcord });
  return function animate(f) {
    const focus = f.emote >= 0 ? Math.sin(Math.PI * f.emote) ** 0.8 : 0;
    face.pose(f, focus);
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
