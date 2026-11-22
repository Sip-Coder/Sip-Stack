import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { basename } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const [input, output] = process.argv.slice(2);
if (!input || !output?.endsWith('.glb.gz'))
  throw new Error('Usage: node pack-groom.mjs Blender-export.glb hair-tier.glb.gz');

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const [scene] = doc.getRoot().listScenes();
const [buffer] = doc.getRoot().listBuffers();
const rigged = [];
let triangles = 0;

function points(value) {
  return typeof value?.[0] === 'number'
    ? Array.from({ length: value.length / 3 }, (_, i) => value.slice(3 * i, 3 * i + 3))
    : value;
}

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = node.getName();
  const extras = node.getExtras();
  const { hairPart } = extras;
  const hairChain = points(extras.hairChain);
  if (hairChain) extras.hairChain = hairChain;
  if (extras.hairBand) extras.hairBand = points(extras.hairBand);
  node.setExtras(extras);
  const [primitive] = mesh.listPrimitives();
  if (!hairPart || mesh.listPrimitives().length !== 1 ||
      !primitive.getIndices() || primitive.getMode() !== 4 ||
      node.getParentNode() || node.getTranslation().some(n => n !== 0) ||
      node.getRotation().some((n, i) => n !== (i === 3 ? 1 : 0)) ||
      node.getScale().some(n => n !== 1))
    throw new Error('Expected one head-local indexed surface for ' + name);
  for (const id of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT', 'COLOR_0']) {
    if (!primitive.getAttribute(id)) throw new Error(name + ' is missing ' + id);
  }
  const uv = primitive.getAttribute('TEXCOORD_0').getArray();
  for (let i = 0; i < uv.length; i++) uv[i] = Math.max(0, Math.min(1, uv[i]));
  triangles += primitive.getIndices().getCount() / 3;
  if (hairChain) rigged.push({ node, primitive, hairChain });
}

for (const { node, primitive, hairChain } of rigged) {
  const name = node.getName(), boneCount = hairChain.length - 1;
  if (boneCount < 2 || boneCount > 4 || hairChain.some(p => p.length !== 3 || !p.every(Number.isFinite)))
    throw new Error('Invalid hair guide for ' + name);
  const uv = primitive.getAttribute('TEXCOORD_0');
  const jointIds = new Uint8Array(uv.getCount() * 4);
  const weights = new Uint8Array(uv.getCount() * 4);
  const sample = [0, 0], spans = [0];
  for (let i = 0; i < boneCount; i++) {
    const length = Math.hypot(...hairChain[i + 1].map((p, k) => p - hairChain[i][k]));
    if (length < 0.00001) throw new Error('Degenerate hair guide for ' + name);
    spans.push(spans[i] + length);
  }
  const guideLength = spans[boneCount];
  for (let i = 0; i < uv.getCount(); i++) {
    uv.getElement(i, sample);
    const distance = Math.max(0, Math.min(1, sample[0])) * guideLength;
    const joint = Math.min(boneCount - 1, spans.findIndex(s => s > distance) - 1);
    const lower = joint < 0 ? boneCount - 1 : joint;
    const upper = Math.min(boneCount - 1, lower + 1);
    const blend = lower === upper ? 0 : (distance - spans[lower]) / (spans[upper] - spans[lower]);
    const weight = Math.round(255 * blend);
    jointIds.set([lower, upper], i * 4);
    weights.set([255 - weight, weight], i * 4);
  }
  primitive.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4')
    .setBuffer(buffer).setArray(jointIds));
  primitive.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4')
    .setBuffer(buffer).setArray(weights).setNormalized(true));

  const skin = doc.createSkin(name);
  const inverses = new Float32Array(boneCount * 16);
  let parent = scene, previous = [0, 0, 0];
  for (let i = 0; i < boneCount; i++) {
    const p = hairChain[i];
    const bone = doc.createNode(name + '-hair-joint-' + i)
      .setTranslation(p.map((n, k) => n - previous[k]));
    parent.addChild(bone);
    if (!i) skin.setSkeleton(bone);
    skin.addJoint(bone);
    inverses.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16);
    parent = bone;
    previous = p;
  }
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setBuffer(buffer).setArray(inverses));
  node.setSkin(skin);
}

if (!triangles || !rigged.length) throw new Error('The groom needs indexed surfaces and strategic chains');
await doc.transform(
  quantize({ quantizePosition: 11, quantizeNormal: 8, quantizeTexcoord: 8, quantizeColor: 8 }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
const glb = await io.writeBinary(doc), wire = gzipSync(glb, { level: 9 });
await writeFile(output, wire);
console.log(basename(output), triangles, 'triangles,', rigged.length, 'chains,', wire.byteLength, 'bytes');
