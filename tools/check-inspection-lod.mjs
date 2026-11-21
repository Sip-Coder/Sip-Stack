// Measures the indexed surfaces after the same meshopt decode used by the pinned web renderer.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshBVH } from 'three-mesh-bvh';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node check-inspection-lod.mjs supplied.glb shipped.glb');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function componentCount(geometry) {
  const index = geometry.index.array, parents = new Map();
  function head(id) {
    if (!parents.has(id)) parents.set(id, id);
    while (parents.get(id) !== id) {
      parents.set(id, parents.get(parents.get(id)));
      id = parents.get(id);
    }
    return id;
  }
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = index.subarray(i, i + 3);
    if (a === b || b === c || c === a) continue;
    parents.set(head(b), head(a));
    parents.set(head(c), head(a));
  }
  return new Set([...parents.keys()].map(head)).size;
}

async function load(file) {
  const groups = new Map();
  for (const node of (await io.read(file)).getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const primitives = node.getMesh().listPrimitives();
    if (primitives.length !== 1 || groups.has(node.getName())) throw Error('Expected one named surface per node');
    const primitive = primitives[0], attribute = primitive.getAttribute('POSITION');
    const position = new Float32Array(3 * attribute.getCount());
    const matrix = new Matrix4().fromArray(node.getWorldMatrix()), point = new Vector3(), element = [];
    for (let i = 0; i < attribute.getCount(); i++) {
      attribute.getElement(i, element);
      point.fromArray(element).applyMatrix4(matrix).toArray(position, i * 3);
    }
    const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(position, 3));
    geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray().slice(), 1));
    geometry.computeBoundingBox();
    groups.set(node.getName(), new MeshBVH(geometry, { indirect: true }));
  }
  return groups;
}

const [original, reduced] = await Promise.all([load(input), load(output)]);
if (original.size !== reduced.size) throw Error('Number of named groups changed');
const samples = [], inches = value => +(value / .0254).toFixed(5);
let sourceTriangles = 0, assetTriangles = 0, worstGroup, worst = -1;
let forwardMax = 0, reverseMax = 0, maxBoxDelta = 0, sourceIslands = 0, assetIslands = 0;
const groupsWithChangedComponentCount = [];
function sample(source, destination) {
  const position = source.geometry.attributes.position, index = source.geometry.index.array;
  const point = new Vector3(), vertex = new Vector3(), nearest = {};
  let max = 0;
  function record() {
    const distance = destination.closestPointToPoint(point, nearest).distance;
    samples.push(distance);
    max = Math.max(max, distance);
  }
  for (let i = 0; i < position.count; i++) { point.fromBufferAttribute(position, i); record(); }
  for (let i = 0; i < index.length; i += 3) {
    point.set(0, 0, 0);
    for (let j = i; j < i + 3; j++) point.add(vertex.fromBufferAttribute(position, index[j]));
    point.multiplyScalar(1 / 3);
    record();
  }
  return max;
}
for (const [name, source] of original) {
  const shipped = reduced.get(name);
  if (!shipped) throw Error('Missing group: ' + name);
  const beforeIslands = componentCount(source.geometry), afterIslands = componentCount(shipped.geometry);
  sourceIslands += beforeIslands;
  assetIslands += afterIslands;
  if (beforeIslands !== afterIslands) groupsWithChangedComponentCount.push(name);
  sourceTriangles += source.geometry.index.count / 3;
  assetTriangles += shipped.geometry.index.count / 3;
  const forward = sample(source, shipped), reverse = sample(shipped, source);
  forwardMax = Math.max(forwardMax, forward);
  reverseMax = Math.max(reverseMax, reverse);
  if (Math.max(forward, reverse) > worst) { worst = Math.max(forward, reverse); worstGroup = name; }
  for (const key of ['min', 'max']) for (const axis of ['x', 'y', 'z']) {
    maxBoxDelta = Math.max(maxBoxDelta, Math.abs(source.geometry.boundingBox[key][axis] - shipped.geometry.boundingBox[key][axis]));
  }
}
samples.sort((a, b) => a - b);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const [sourceBytes, assetBytes] = await Promise.all([readFile(input), readFile(output)]);
console.log(JSON.stringify({
  source: basename(input), asset: basename(output),
  sourceSha256: hash(sourceBytes), assetSha256: hash(assetBytes), bytes: assetBytes.length,
  sourceMeshCount: original.size, assetMeshCount: reduced.size, sourceTriangles, assetTriangles,
  sourceConnectedComponents: sourceIslands, assetConnectedComponents: assetIslands, groupsWithChangedComponentCount,
  samples: samples.length, p99In: inches(samples[Math.floor(samples.length * .99)]),
  maxSourceToAssetIn: inches(forwardMax), maxAssetToSourceIn: inches(reverseMax), worstGroup,
  maxDifferenceInAnatomicalMeshBoundsIn: inches(maxBoxDelta),
}, null, 2));
