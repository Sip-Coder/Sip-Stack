// Measure the two source skeletons. Run from the repository root with Node
// 24 and three@0.170.0, or point THREE_ROOT at an unpacked copy of Three.
// Joint coordinates in the generated manifest are the scans' native metres.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const fromThree = (file, specifier) => import(process.env.THREE_ROOT
  ? pathToFileURL(resolve(process.env.THREE_ROOT, file)).href : specifier);
const { Box3, Matrix4, Vector3 } = await fromThree('build/three.module.js', 'three');
const { GLTFLoader } = await fromThree('examples/jsm/loaders/GLTFLoader.js', 'three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await fromThree(
  'examples/jsm/libs/meshopt_decoder.module.js', 'three/addons/libs/meshopt_decoder.module.js');

const folder = new URL('../docs/characters/', import.meta.url);
const vector = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const middle = (a, b) => a.clone().lerp(b, 0.5);
const extent = (points) => new Box3().setFromPoints(points);
const center = (points) => extent(points).getCenter(vector());
const round = (value) => Number(value.toFixed(7));
const coords = (point) => point.toArray().map(round);
const arrayBox = (box) => [coords(box.min), coords(box.max)];

async function pickBones(sex) {
  const glb = await readFile(new URL('assets/skeleton-' + sex + '-high.glb', folder));
  const model = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  model.scene.updateMatrixWorld(true);
  const bones = new Map();
  model.scene.traverse((node) => {
    if (!node.isMesh) return;
    const pos = node.geometry.getAttribute('position');
    bones.set(node.name, Array.from({ length: pos.count }, (_, i) =>
      vector().fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld)));
  });
  return bones;
}

// The medial proximal cortex excludes the tuberosities / trochanter. Solve
// for the centre of its articular sphere with iteratively reweighted radial
// residuals. The near-end region and outlier masks are in part dimensions
// so the same measurement is used for each side and for both donors.
function ballCenter(points, side, proximalBand, medialBand) {
  const { min, max } = extent(points);
  const medial = side === 'L' ? (x) => (max.x - x) / (max.x - min.x)
    : (x) => (x - min.x) / (max.x - min.x);
  const surface = points.filter(p => p.y >= max.y - proximalBand && medial(p.x) >= medialBand);
  let origin = center(surface);
  for (let iteration = 0; iteration < 4; iteration++) {
    const radial = surface.map(p => p.distanceTo(origin)).sort((a, b) => a - b);
    const radius = radial[Math.floor(radial.length / 2)];
    const normal = new Array(16).fill(0);
    const rhs = new Array(4).fill(0);
    let total = 0;
    for (const point of surface) {
      const p = point.clone().sub(origin);
      const distance = p.length();
      const error = Math.abs(distance - radius);
      const weight = iteration ? 1 / (1 + (error / 0.004) ** 4) : 1;
      const line = [2 * p.x, 2 * p.y, 2 * p.z, 1];
      for (let i = 0; i < 4; i++) {
        rhs[i] += weight * line[i] * distance ** 2;
        for (let j = 0; j < 4; j++) normal[i * 4 + j] += weight * line[i] * line[j];
      }
      total += weight;
    }
    if (!total) throw Error('No preserved articular surface for joint sphere');
    // The normal matrix is symmetric in both row-major and column-major order.
    const inverse = new Matrix4().fromArray(normal).invert().elements;
    const delta = vector(...[0, 1, 2].map(i =>
      rhs.reduce((sum, value, j) => sum + inverse[4 * j + i] * value, 0)));
    if (delta.length() < 0.00001) break;
    origin = origin.clone().add(delta);
  }
  return origin;
}

function end(points, key, amount = 0.12) {
  const { min, max } = extent(points);
  const cutoff = key < 0 ? min.y + amount * (max.y - min.y) : max.y - amount * (max.y - min.y);
  return center(points.filter(p => key < 0 ? p.y < cutoff : p.y > cutoff));
}

function levelFoot(bones, side, ankle) {
  const points = [...bones].filter(([key]) => key.endsWith(side) &&
    /^(CALCANEUS|TALUS|NAVICULAR|CUBOID|.*_CUNEIFORM|METATARSAL|PHALANGE_FOOT)/.test(key))
    .flatMap(([, vertices]) => vertices);
  const heel = end(bones.get('CALCANEUS' + side), -1, 0.08);
  const toes = points.filter(p => p.z > ankle.z + 0.105);
  const forefoot = end(toes, -1, 0.08);
  const pitch = Math.atan2(forefoot.y - heel.y, forefoot.z - heel.z);
  const s = Math.sin(pitch), c = Math.cos(pitch);
  let sole = Infinity;
  for (const point of points) sole = Math.min(sole, ankle.y + c * (point.y - ankle.y) - s * (point.z - ankle.z));
  return [round(pitch), round(sole)];
}

function shaftLine(points, first, last) {
  const { min, max } = extent(points);
  const length = max.y - min.y;
  const centers = [];
  for (let i = 0; i < 6; i++) {
    const y = min.y + (first + (last - first) * i / 5) * length;
    centers.push(center(points.filter(p => Math.abs(p.y - y) <= length * 0.04)));
  }
  const mean = centers.reduce((sum, p) => sum.add(p), vector()).divideScalar(centers.length);
  const slope = vector();
  let variance = 0;
  for (const p of centers) {
    const offset = p.clone().sub(mean);
    slope.addScaledVector(offset, offset.y);
    variance += offset.y ** 2;
  }
  return [mean, slope.divideScalar(variance).normalize()];
}

// Express the gap in donor space. Survival of distal humerus and proximal
// radius/ulna differs by side, so choose the proximal-bone extrapolation
// from the maximum y in both cortices and ensure the measured pivot lies
// between the last intact elbow-side surfaces.
function elbowCenter(humerus, radius, ulna) {
  const humerusEnd = end(humerus, -1, 0.04);
  const radialEnd = end(radius, 1, 0.04), ulnarEnd = end(ulna, 1, 0.04);
  const forearmEnd = radialEnd.y >= ulnarEnd.y ? radialEnd : ulnarEnd;
  const [a, x] = shaftLine(humerus, 0.12, 0.56);
  const [b, y] = shaftLine(radialEnd.y >= ulnarEnd.y ? radius : ulna, 0.56, 0.92);
  const separation = a.clone().sub(b);
  const cos = x.dot(y);
  const along = (cos * separation.dot(y) - separation.dot(x)) / (1 - cos * cos);
  const top = Math.max(humerusEnd.y, forearmEnd.y);
  const bottom = Math.min(humerusEnd.y, forearmEnd.y);
  const height = Math.max(bottom, Math.min(top, a.y + along * x.y));
  function atHeight(p, axis) {
    return p.clone().addScaledVector(axis, (height - p.y) / axis.y);
  }
  return middle(atHeight(a, x), atHeight(b, y));
}

function snapJoint(bones, flag) {
  const get = (key) => bones.get(key + flag);
  const hip = ballCenter(get('FEMUR'), flag === '_LEFT' ? 'L' : 'R', 0.047, 0.44);
  const shoulder = ballCenter(get('HUMERUS'), flag === '_LEFT' ? 'L' : 'R', 0.044, 0.48);
  const elbow = elbowCenter(get('HUMERUS'), get('RADIUS'), get('ULNA'));
  const wrist = middle(center(get('LUNATE')), center(get('SCAPHOID')));
  const knee = middle(end(get('FEMUR'), -1, 0.06), end(get('TIBIA'), 1, 0.08));
  // The superior talar dome and distal tibial plafond are opposing bearings.
  const ankle = middle(end(get('TALUS'), 1, 0.24), end(get('TIBIA'), -1, 0.042));
  const clavicle = get('CLAVICLE');
  const [medial, lateral] = [1, -1].map((end) => {
    const direction = flag === '_LEFT' ? end : -end;
    const all = clavicle.map(p => direction * p.x);
    const min = Math.min(...all), limit = min + 0.12 * (Math.max(...all) - min);
    return center(clavicle.filter(p => direction * p.x <= limit));
  });
  return {
    hip, knee, ankle, shoulder, elbow, wrist,
    palm: center(get('METACARPAL_3')),
    thumbDirection: center(get('METACARPAL_2')).sub(center(get('METACARPAL_5'))).normalize(),
    clavicle: [coords(medial), coords(lateral)],
    footPlane: levelFoot(bones, flag, ankle),
  };
}

// Model-space estimate of the three anatomical measurements used for the
// clinical Q angle. Choose anterior points in the superior iliac and
// proximal tibial search regions before reading either subject's angle.
function qAngleLandmarks(bones, side, pelvis, hip, knee) {
  const sign = side === '_LEFT' ? 1 : -1;
  const front = (points) => points.reduce((a, b) => a?.z >= b.z ? a : b, null);
  const asis = front(bones.get('HIP' + side).filter(p => sign * (p.x - pelvis.x) > 0.08 && p.y > hip.y + 0.045));
  const patella = center(bones.get('PATELLA' + side));
  const tibialTuberosity = front(bones.get('TIBIA' + side).filter(
    p => p.y <= knee.y - 0.020 && p.y >= knee.y - 0.068));
  return [coords(asis), coords(patella), coords(tibialTuberosity)];
}

async function measure(sex) {
  const bones = await pickBones(sex);
  const left = snapJoint(bones, '_LEFT'), right = snapJoint(bones, '_RIGHT');
  const c1 = bones.get('VERTEBRA_C1');
  const skull = extent([...bones.get('SKULL_CRANIAL_MAXILLA'), ...bones.get('SKULL_MANDIBLE')]);
  const neck = end(c1, 1, 0.24);
  const chest = middle(end(bones.get('VERTEBRA_T12'), -1, 0.25), end(bones.get('VERTEBRA_L1'), 1, 0.25));
  const hips = middle(left.hip, right.hip);
  const trunk = { hips: coords(hips), chest: coords(chest), head: coords(neck) };
  const limbKeys = { hip:'thigh', knee:'shin', ankle:'foot', shoulder:'upperArm', elbow:'forearm', wrist:'hand' };
  for (const [side, record] of [['L', left], ['R', right]])
    for (const [key, joint] of Object.entries(limbKeys)) trunk[joint + side] = coords(record[key]);
  return {
    joints: trunk,
    crown: round(skull.max.y),
    skull: arrayBox(skull),
    pelvis: arrayBox(extent([...bones.get('HIP_LEFT'), ...bones.get('HIP_RIGHT'), ...bones.get('SACRUM')])),
    thorax: arrayBox(extent([...bones].filter(([name]) => name.startsWith('RIB_') || name === 'STERNUM')
      .flatMap(([, vertices]) => vertices))),
    spine: Object.fromEntries([...bones].filter(([k]) => k.startsWith('VERTEBRA_')).sort(([a], [b]) =>
      'LTC'.indexOf(a[9]) - 'LTC'.indexOf(b[9]) || Number(b.slice(10)) - Number(a.slice(10)))
      .map(([k, points]) => [k.slice(9), coords(center(points))])),
    arms: Object.fromEntries([['L', left], ['R', right]].map(([key, side]) => [
      key, { palm: coords(side.palm), radial: coords(side.thumbDirection), clavicle: side.clavicle },
    ])),
    feet: { L: left.footPlane, R: right.footPlane },
    qAngle: {
      L: qAngleLandmarks(bones, '_LEFT', hips, left.hip, left.knee),
      R: qAngleLandmarks(bones, '_RIGHT', hips, right.hip, right.knee),
    },
  };
}

const result = { sippy: await measure('male'), roma: await measure('female') };
const code = '// Generated by tools/measure-source-rig.mjs from the canonical BoneHub High GLBs.\n' +
  '// Every coordinate is in the donor scene before the rigid neutral pose.\n' +
  'export const sourceLandmarks = {\n' +
  Object.entries(result).map(([hero, data]) => '  ' + hero + ': {\n' +
    Object.entries(data).map(([key,value]) => '    ' + key + ': ' + JSON.stringify(value) + ',').join('\n') + '\n  },').join('\n') +
  '\n};\n';
const path = new URL('source-landmarks.js', folder);
if (process.argv.includes('--check')) {
  if (await readFile(path, 'utf8') !== code) throw Error('Source rig landmarks have changed');
} else await writeFile(path, code);
