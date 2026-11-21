// Offline build from the pinned Human-Atlas checkout. See MUSCLE-SKIN-LICENSE.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const [models, bpFile, output, mappingFile, referenceFile] = process.argv.slice(2);
if (!mappingFile)
  throw Error(
    'Expected Human-Atlas public/models, supplied High BodyParts3D GLB, output directory, mapping JSON',
  );
const readIndex = (name) => JSON.parse(readFileSync(join(models, name), 'utf8'));
const male = readIndex('atlas.json');
const female = readIndex('atlas-female.json');
const donors = female.parts.filter((p) => p.system === 'donor-muscle');
if (
  donors.length !== 76 ||
  !donors.every((p) => /^VHF:(left|right)-/.test(p.conceptId)) ||
  !female.donorMuscle.from.startsWith('Visible Human Female lower extremity, Andreassen')
) {
  throw Error('Expected individually identified Andreassen Visible Human Female lower-limb surfaces');
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const source = await io.read(bpFile);
const base = new Map();
const offsetSamples = [[], [], []];
for (const node of source.getRoot().listNodes()) {
  const id = node.getMesh()?.getExtras().name?.replace('.obj', '');
  if (!id) continue;
  base.set(id, node.getName());
  const counterpart = male.parts.find((p) => p.id === id);
  if (!counterpart) continue;
  const bounds = getBounds(node);
  for (let axis = 0; axis < 3; axis++) {
    offsetSamples[axis].push(
      (bounds.min[axis] +
        bounds.max[axis] -
        counterpart.bounds[0][axis] -
        counterpart.bounds[1][axis]) /
        2,
    );
  }
}
// Both BP3D distributions use the same axes. Recover the stage translation
// from matched structures; individual LODs can shave a few extreme vertices.
const bpOrigin = new Vector3(
  ...offsetSamples.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]),
);

const chunks = new Map();
function arrayFor(atlas, part, key, Type, length) {
  const file = atlas.chunks[part.chunk].url.split('/').pop();
  if (!chunks.has(file)) chunks.set(file, readFileSync(join(models, file)));
  const bytes = chunks.get(file);
  return new Type(bytes.buffer, bytes.byteOffset + part[key], length);
}
function landmarks(atlas, side, region) {
  const isMale = atlas === male;
  const bone = region === 'thigh' ? 'femur' : 'tibia';
  const v = new Vector3(),
    bounds = new Box3();
  if (region === 'hip') {
    const sidePieces = atlas.parts.filter((p) =>
      isMale
        ? p.name.toLowerCase() === side + ' hip bone'
        : /^(ilium|ischium|pubis) (compact|spongy) bone/i.test(p.name) &&
          p.name.endsWith('(' + side + ')'),
    );
    if (!sidePieces.length) throw Error('Missing pelvic landmarks');
    for (const p of sidePieces) bounds.union(new Box3(...p.bounds.map((xyz) => new Vector3(...xyz))));
    const c = bounds.getCenter(new Vector3());
    return [new Vector3(c.x, bounds.min.y, c.z), new Vector3(c.x, bounds.max.y, c.z)];
  }
  const name = isMale ? side + ' ' + bone : bone + ' (' + side + ')';
  const p = atlas.parts.find((part) => part.name.toLowerCase() === name);
  const xyz = arrayFor(atlas, p, 'positions', Float32Array, p.vertexCount * 3);
  const lo = p.bounds[0][1],
    hi = p.bounds[1][1];
  return [0.06, 0.94].map((level) => {
    bounds.makeEmpty();
    for (let i = 0; i < xyz.length; i += 3) {
      v.fromArray(xyz, i);
      if (Math.abs((v.y - lo) / (hi - lo) - level) <= 0.035) bounds.expandByPoint(v);
    }
    if (bounds.isEmpty()) throw Error('Missing epiphysis vertices for ' + name);
    return bounds.getCenter(new Vector3());
  });
}
function frame(points) {
  const direction = points[1].clone().sub(points[0]);
  const length = direction.length();
  const up = direction.normalize();
  const right = new Vector3().crossVectors(up, new Vector3(0, 0, 1)).normalize();
  const forward = new Vector3().crossVectors(right, up);
  return {
    length,
    centre: points[0].clone().lerp(points[1], 0.5),
    rotation: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward)),
  };
}
const charts = new Map();
for (const side of ['left', 'right']) {
  for (const region of ['hip', 'thigh', 'shank']) {
    const from = frame(landmarks(female, side, region));
    const to = frame(landmarks(male, side, region));
    const rotation = to.rotation.multiply(from.rotation.invert());
    const scale = to.length / from.length;
    const translation = to.centre
      .add(bpOrigin)
      .sub(from.centre.clone().applyQuaternion(rotation).multiplyScalar(scale));
    charts.set(
      side + '-' + region,
      new Matrix4().compose(translation, rotation, new Vector3().setScalar(scale)),
    );
  }
}

// Map exact counterparts through the underlying FJ source identity, even
// where the supplied English mesh name was a broad anatomical category.
const baseIds = {
  AdductorBrevis: 1401,
  AdductorLongus: 1402,
  AdductorMagnus: 1403,
  BicepsFemorisLong: 1395,
  BicepsFemorisShort: 1444,
  GastrocnemiusMedial: 1397,
  Gracilis: 1421,
  Plantaris: 1429,
  Popliteus: 1430,
  RectusFemoris: 1433,
  Sartorius: 1434,
  Semimembranosus: 1435,
  Semitendinosus: 1436,
  VastusIntermedius: 1441,
  VastusLateralis: 1442,
  VastusMedialis: 1443,
  ExtensorDigitorumLongus: 1406,
  ExtensorHallucisLongus: 1408,
  FlexorDigitorumLongus: 1414,
  FlexorHallucisLongus: 1415,
  GastrocnemiusLateral: 1394,
  PeroneusLongus: 1410,
  Soleus: 1437,
  TibialisAnterior: 1439,
  TibialisPosterior: 1440,
  GluteusMaximus: 1418,
  GluteusMedius: 1419,
  GluteusMinimus: 1420,
  Illiacus: 1422,
  InferiorGemellus: 1416,
  ObturatorExternus: 1425,
  ObturatorInternus: 1426,
  Pectineus: 1427,
  Piriformis: 1428,
  PsoasMajor: 1431,
  QuadratusFemoris: 1432,
  SuperiorGemellus: 1417,
  TensorFasciaeLatae: 1438,
};
const spelling = {
  BicepsFemorisLongHead: 'BicepsFemorisLong',
  BicepsFemorisShortHead: 'BicepsFemorisShort',
  Semitendonosus: 'Semitendinosus',
  QuadratisFemoris: 'QuadratusFemoris',
};
const names = {
  BicepsFemorisLong: 'biceps_femoris_long_head',
  BicepsFemorisShort: 'biceps_femoris_short_head',
  GastrocnemiusLateral: 'gastrocnemius_lateral_head',
  GastrocnemiusMedial: 'gastrocnemius_medial_head',
};
const registered = [];
for (const part of donors) {
  const [side, raw] = part.conceptId.slice(4).split('-');
  const canonical = spelling[raw] ?? raw;
  const number = baseIds[canonical];
  if (!number) throw Error('Unknown donor muscle ' + part.conceptId);
  const fj = 'FJ' + number + (side === 'left' ? 'M' : '');
  const anatomy = male.parts.find((p) => p.id === fj);
  if (!anatomy) throw Error('Unknown BP3D source part ' + fj);
  const counterpart = base.get(fj);
  const node =
    counterpart ??
    side + '_' + (names[canonical] ?? canonical.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase());
  const field = female.concepts.find(
    (c) => c.id.startsWith('VHF:group-') && c.elements.includes(part.id),
  );
  const region = field.id.split('-').pop();
  const transform = charts.get(side + '-' + region);
  const positions = arrayFor(female, part, 'positions', Float32Array, part.vertexCount * 3).slice();
  const point = new Vector3();
  for (let i = 0; i < positions.length; i += 3)
    point.fromArray(positions, i).applyMatrix4(transform).toArray(positions, i);
  const indices = arrayFor(female, part, 'indices', Uint32Array, part.indexCount);
  registered.push({
    positions,
    indices,
    node,
    atlasId: part.conceptId,
    region,
    counterpart: counterpart ? fj : null,
    fullAtlasFj: fj,
    anatomicalName: anatomy.name,
  });
}
if (new Set(registered.map((p) => p.node)).size !== 76) throw Error('Repeated target muscle');

const profiles = [
  ['mobile', 0.04, 80, 0.025],
  ['high', 0.111, 160, 0.017],
];
if (referenceFile) profiles.push(['reference', 1, 0, 0]);
for (const [tier, ratio, floor, error] of profiles) {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  let count = 0;
  for (const p of registered) {
    const target = Math.min(
      p.indices.length,
      Math.max(floor, Math.floor((p.indices.length * ratio) / 3)) * 3,
    );
    const reduced =
      tier === 'reference'
        ? p.indices.slice()
        : MeshoptSimplifier.simplify(p.indices, p.positions, 3, target, error, ['PreserveFolds'])[0];
    const [remap, kept] = MeshoptSimplifier.compactMesh(reduced);
    const positions = new Float32Array(kept * 3);
    for (let i = 0; i < remap.length; i++)
      if (remap[i] !== 0xffffffff) positions.set(p.positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
    const pos = document.createAccessor().setBuffer(buffer).setType('VEC3').setArray(positions);
    const ix = document
      .createAccessor()
      .setBuffer(buffer)
      .setType('SCALAR')
      .setArray(Uint16Array.from(reduced));
    const primitive = document.createPrimitive().setAttribute('POSITION', pos).setIndices(ix);
    const mesh = document
      .createMesh(p.node)
      .setExtras({ name: p.atlasId, atlasCounterpart: p.counterpart })
      .addPrimitive(primitive);
    scene.addChild(document.createNode(p.node).setMesh(mesh));
    count += reduced.length / 3;
  }
  if (tier !== 'reference')
    await document.transform(
      meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14 }),
    );
  const file =
    tier === 'reference' ? referenceFile : join(output, 'vhf-muscles-' + tier + '-meshopt.glb');
  await io.write(file, document);
  console.log(tier, registered.length, count, readFileSync(file).length);
}
writeFileSync(
  mappingFile,
  JSON.stringify(
    {
      sourceRepository: 'https://github.com/slorksmo/Human-Atlas',
      sourceCommit: '5bb5713aab18d7fe9380c3339eb09f173491ea06',
      sourceConcept: 'Visible Human Female lower extremity, Andreassen et al. 2023',
      mapping: registered.map(({ positions, indices, ...row }) => row),
    },
    null,
    2,
  ) + '\n',
);
