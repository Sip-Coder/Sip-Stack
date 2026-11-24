// Compare native neutral head dimensions and the protected body surfaces.
// THREE_ROOT=/path/to/unpacked/three node tools/check-face-dimensions.mjs BEFORE AFTER
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [before, after = '.'] = process.argv.slice(2);
if (!before) throw new Error('Supply a baseline checkout');
if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({
    resolve(name, context, next) {
      const entry = name === 'three' ? 'build/three.module.js'
        : name.startsWith('three/addons/') ? 'examples/jsm/' + name.slice(13) : null;
      return entry ? { url: pathToFileURL(resolve(root, entry)).href, shortCircuit: true }
        : next(name, context);
    },
  });
}
const { Box3, Matrix4, Quaternion, Vector3 } = await import('three');
const { raster } = await import('./axon-depth.mjs');
const inch = 0.0254, point = new Vector3();
const roundIn = value => +(value / inch).toFixed(3);
const bodySkin = /^(?:Subcutaneous torso and neck|(?:Left|Right) (?:arm skin|leg skin|foot skin|hand))$/;
const headwear = /earring|headband|headphone band|headphone cushion|headphone cup/i;

function extent(parts) {
  const bounds = new Box3();
  for (const part of parts) {
    const vertices = part.mesh.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i);
      if (part.sourceMatrix) point.applyMatrix4(part.sourceMatrix);
      bounds.expandByPoint(point);
    }
  }
  assert.ok(!bounds.isEmpty(), 'Expected a populated head surface');
  const [width, height, depth] = bounds.getSize(new Vector3()).toArray().map(roundIn);
  return { width, height, depth };
}

function fingerprint(part) {
  const hash = createHash('sha256');
  const { geometry } = part.mesh;
  for (const attribute of [geometry.attributes.position, geometry.attributes.normal, geometry.index]) {
    if (attribute) hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  return hash.digest('hex');
}

function hoodSurface(part) {
  if (!part) return;
  const { geometry } = part.mesh;
  return {
    position: geometry.attributes.position.array.slice(),
    normal: geometry.attributes.normal.array.slice(),
    index: geometry.index?.array.slice(),
  };
}

function verifyFold(before, after) {
  assert.deepEqual(after.index, before.index, 'Folded hood topology');
  const a = before.position, b = after.position;
  assert.equal(b.length, a.length, 'Folded hood vertex count');
  let sample = 3;
  while (Math.hypot(a[sample + 1] - a[1], a[sample + 2] - a[2]) < 0.025) sample += 3;
  assert.ok(sample < a.length, 'Distinct folded hood samples');
  const angle = Math.atan2(b[sample + 2] - b[2], b[sample + 1] - b[1]) -
    Math.atan2(a[sample + 2] - a[2], a[sample + 1] - a[1]);
  const rotation = new Matrix4().makeRotationX(angle);
  const shift = new Vector3().fromArray(b).sub(point.fromArray(a).applyMatrix4(rotation));
  const expected = new Vector3();
  for (let i = 0; i < a.length; i += 3) {
    expected.fromArray(b, i);
    assert.ok(point.fromArray(a, i).applyMatrix4(rotation).add(shift).distanceTo(expected) < 1e-6,
      'Folded hood vertices share one rigid move');
    expected.fromArray(after.normal, i);
    assert.ok(point.fromArray(before.normal, i).applyMatrix4(rotation).distanceTo(expected) < 1e-5,
      'Folded hood normals follow the same rotation');
  }
  return +((angle * 180 / Math.PI + 540) % 360 - 180).toFixed(3);
}

function mouthClearance(model) {
  const skin = model.parts.filter(part => part.layer === 'skin');
  const lips = skin.filter(part => /^(?:Upper lip|Lower lip)$/.test(part.name));
  assert.equal(lips.length, 2, 'Sippy mouth parts');
  const outerFace = [...lips, skin.find(part => part.name === 'Face')];
  const clothes = model.parts.filter(part => part.layer === 'clothes');
  const box = new Box3();
  for (const { mesh } of lips)
    box.union(new Box3().setFromBufferAttribute(mesh.geometry.attributes.position));
  const centre = box.getCenter(new Vector3()), size = 380;
  const scale = size / Math.max(3 * inch, box.getSize(new Vector3()).x + 1.5 * inch);
  const margin = Math.round(0.21 * inch * scale);
  return [[0, 0], [-40, 0], [40, 0], [90, 0], [-90, 0], [0, 16], [0, -14]].map(([yaw, pitch]) => {
    const project = parts => raster(parts, centre, scale, size, yaw * Math.PI / 180, pitch * Math.PI / 180);
    const { depth: mouth } = project(lips);
    const { depth: face } = project(outerFace);
    const { depth: garment, winners } = project(clothes);
    let left = size, right = -1, top = size, bottom = -1;
    for (let i = 0; i < mouth.length; i++) {
      if (!Number.isFinite(mouth[i])) continue;
      const x = i % size, y = Math.floor(i / size);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const overlapping = {};
    let samples = 0, occluded = 0;
    for (let y = Math.max(0, top - margin); y <= Math.min(size - 1, bottom + margin); y++)
      for (let x = Math.max(0, left - margin); x <= Math.min(size - 1, right + margin); x++) {
        const i = y * size + x;
        if (!Number.isFinite(face[i])) continue;
        samples++;
        if (winners[i] < 0 || garment[i] <= face[i] + 0.01 * inch) continue;
        const { name } = clothes[winners[i]];
        overlapping[name] = (overlapping[name] ?? 0) + 1;
        occluded++;
      }
    assert.ok(samples, 'Mouth sampling window contains a face surface');
    return { yaw, pitch, samples, occluded, overlapping };
  });
}

async function inspect(checkout, name, tier) {
  const url = pathToFileURL(resolve(checkout, 'docs/characters/diagram-parts.js'));
  const { buildDiagramModel } = await import(url.href);
  const model = await buildDiagramModel(name, tier);
  try {
    const select = (layer, match) => model.parts.filter(part => part.layer === layer && match(part));
    const shell = select('skin', part => part.name === 'Face');
    const ears = select('skin', part => /^(?:Left|Right) ear$/.test(part.name));
    const cranium = select('skeleton', part => part.scanNode === 'SKULL_CRANIAL_MAXILLA');
    const jaw = select('skeleton', part => part.scanNode === 'SKULL_MANDIBLE');
    assert.equal(shell.length, 1, 'Expected one vaulted face skin part');
    assert.equal(ears.length, 2, 'Expected both ear shells');
    assert.equal(cranium.length, 1, 'Expected the original cranium and maxilla');
    assert.equal(jaw.length, 1, 'Expected the original mandible');
    const hood = select('clothes', part => part.name === 'Folded hood')[0];
    const protectedSurfaces = model.parts.filter(part => (part.layer === 'skin' && bodySkin.test(part.name)) ||
      (part.layer === 'clothes' && !headwear.test(part.name) && part !== hood));
    const complexionParts = [...shell, ...ears, ...select('skin', part =>
      part.name === 'Face to neck join' || bodySkin.test(part.name))];
    return {
      skinIn: extent(shell), outerIn: extent([...shell, ...ears]), boneIn: extent([...cranium, ...jaw]),
      cranium: fingerprint(cranium[0]), craniumMatrix: cranium[0].sourceMatrix.clone(),
      jaw: fingerprint(jaw[0]), jawMatrix: jaw[0].sourceMatrix.clone(),
      hood: hoodSurface(hood),
      mouth: name === 'sippy' ? mouthClearance(model) : undefined,
      complexion: [...new Set(complexionParts.flatMap(({ mesh }) =>
        [].concat(mesh.material).map(({ color }) => color.getHexString())))],
      body: new Map(protectedSurfaces.map(part => [part.id, fingerprint(part)])),
    };
  } finally {
    model.dispose();
  }
}

const revision = checkout => execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const rows = [];
for (const hero of ['sippy', 'roma']) for (const tier of ['mobile', 'high']) {
  const prior = await inspect(before, hero, tier);
  const current = await inspect(after, hero, tier);
  assert.equal(current.cranium, prior.cranium, hero + ' cranium geometry');
  assert.equal(current.jaw, prior.jaw, hero + ' mandible geometry');
  assert.deepEqual(current.craniumMatrix.elements, prior.craniumMatrix.elements, hero + ' cranium pose and scale');
  assert.deepEqual(current.body, prior.body, hero + ' protected skin and clothing');
  assert.equal(current.complexion.length, 1, hero + ' common face, ear, neck and body base tone');
  const move = new Matrix4().multiplyMatrices(current.jawMatrix, prior.jawMatrix.clone().invert());
  const scale = new Vector3().setFromMatrixScale(move);
  for (const value of scale) assert.ok(Math.abs(value - 1) < 1e-6, hero + ' mandible scale');
  assert.ok(Math.abs(move.determinant() - 1) < 1e-6, hero + ' mandible rigid transform');
  const rotation = new Quaternion().setFromRotationMatrix(move).normalize();
  const foldedHoodPoseChangeDegrees = hero === 'sippy' ? verifyFold(prior.hood, current.hood) : undefined;
  if (current.mouth)
    assert.ok(current.mouth.every(({ occluded }) => occluded === 0), hero + ' mouth clear of clothing in seven views');
  rows.push({
    hero, tier,
    skinIn: { before: prior.skinIn, after: current.skinIn },
    withEarsIn: { before: prior.outerIn, after: current.outerIn },
    skullIn: { before: prior.boneIn, after: current.boneIn },
    mandiblePoseChangeDegrees: +(Math.acos(Math.min(1, Math.abs(rotation.w))) * 360 / Math.PI).toFixed(3),
    foldedHoodPoseChangeDegrees,
    mouthClearance: current.mouth ? { before: prior.mouth, after: current.mouth } : undefined,
    baseComplexion: '#' + current.complexion[0],
    protectedSurfaces: current.body.size,
  });
}
console.log(JSON.stringify({ baseline: revision(before), candidate: revision(after), rows }, null, 2));
