// Imported only by the selected human's Axon inspection model.
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { femaleMuscleFile, sourceAssetFiles } from './source-asset-files.js';

const arrayForComponent = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array,
  5125: Uint32Array, 5126: Float32Array,
};
const normalizedLimit = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const accessorKind = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' };

// The inspected packs are flat GLBs with one indexed surface per named node.
// Decode only the attributes the viewer uses. The node transform belongs to
// the source file's quantization frame and is applied before the rig ever sees it.
async function parseAtlas(buffer, file = '', sourceAtlas) {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== buffer.byteLength)
    throw new Error('Invalid anatomy GLB ' + file);
  const size = header.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, size)));
  const bin = 28 + size;
  await MeshoptDecoder.ready;
  const decoded = new Map();
  function read(index, width) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    if (a.sparse || a.type !== accessorKind[width])
      throw new Error('Unsupported geometry accessor in ' + file);
    if (!decoded.has(a.bufferView)) {
      const packed = view.extensions?.EXT_meshopt_compression;
      if (packed) {
        const block = new Uint8Array(packed.count * packed.byteStride);
        MeshoptDecoder.decodeGltfBuffer(block, packed.count, packed.byteStride,
          new Uint8Array(buffer, bin + (packed.byteOffset ?? 0), packed.byteLength),
          packed.mode, packed.filter ?? 'NONE');
        decoded.set(a.bufferView, block);
      } else {
        decoded.set(a.bufferView, new Uint8Array(buffer, bin + (view.byteOffset ?? 0), view.byteLength));
      }
    }
    const block = decoded.get(a.bufferView), Type = arrayForComponent[a.componentType];
    const stride = (view.byteStride ?? width * Type.BYTES_PER_ELEMENT) / Type.BYTES_PER_ELEMENT;
    const length = (a.count - 1) * stride + width;
    return {
      array: new Type(block.buffer, block.byteOffset + (a.byteOffset ?? 0), length),
      stride, count: a.count,
      divisor: a.normalized ? normalizedLimit[a.componentType] : 1,
    };
  }
  const parts = new Map();
  const position = new Vector3(), transform = new Matrix4();
  function materialAttribute(accessor, width, wanted) {
    const { array, stride, count, divisor } = read(accessor, width);
    const coordinates = new Float32Array(count * wanted);
    for (let i = 0; i < count; i++)
      for (let j = 0; j < wanted; j++)
        coordinates[i * wanted + j] = array[i * stride + j] / divisor;
    return new Float32BufferAttribute(coordinates, wanted);
  }
  function visit(index, parent) {
    const node = gltf.nodes[index], sourceMesh = gltf.meshes[node.mesh], originalName = node.name;
    if (node.matrix) transform.fromArray(node.matrix);
    else transform.compose(new Vector3(...(node.translation ?? [0, 0, 0])),
      new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
      new Vector3(...(node.scale ?? [1, 1, 1])));
    if (parent) transform.premultiply(parent);
    const matrix = transform.clone();
    for (const child of node.children ?? []) visit(child, matrix);
    if (node.mesh === undefined) return;
    const [shape] = sourceMesh?.primitives ?? [];
    if (sourceMesh?.primitives.length !== 1 ||
        (shape.mode !== undefined && shape.mode !== 4) || shape.indices === undefined || !originalName)
      throw new Error('Expected one indexed source surface per node in ' + file);
    const name = sourceAtlas?.startsWith('Z-Anatomy')
      ? originalName.replace(/^(Latissimus_dorsi|Rectus_abdominis)_muscle_(left|right)$/,
          (_, muscle, side) => side + '_' + muscle.toLowerCase())
      : originalName;
    if (parts.has(name)) throw new Error('Duplicate scan mesh ' + name);
    const vertices = read(shape.attributes.POSITION, 3), triangles = read(shape.indices, 1);
    const coordinates = new Float32Array(vertices.count * 3);
    const { array, stride, divisor } = vertices;
    for (let i = 0, start = 0; i < vertices.count; i++, start += stride) {
      if (divisor === 1) position.set(array[start], array[start + 1], array[start + 2]);
      else position.set(Math.max(-1, array[start] / divisor), Math.max(-1, array[start + 1] / divisor),
        Math.max(-1, array[start + 2] / divisor));
      position.applyMatrix4(matrix).toArray(coordinates, i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3));
    geometry.setIndex(new BufferAttribute(triangles.array, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const uv = shape.attributes.TEXCOORD_0, color = shape.attributes.COLOR_0;
    if (uv !== undefined) geometry.setAttribute('uv', materialAttribute(uv, 2, 2));
    if (color !== undefined)
      geometry.setAttribute('color', materialAttribute(color, gltf.accessors[color].type === 'VEC4' ? 4 : 3, 3));
    geometry.userData.sourcePart = sourceMesh.extras?.name || originalName;
    geometry.userData.sourceFile = file;
    geometry.userData.sourceNode = originalName;
    geometry.userData.region = sourceMesh.extras?.region;
    geometry.userData.displayName = sourceMesh.extras?.displayName;
    geometry.userData.rigJoint = sourceMesh.extras?.rigJoint ?? node.extras?.rigJoint;
    if (sourceAtlas) geometry.userData.sourceAtlas = sourceAtlas;
    if (sourceMesh.extras?.name?.startsWith('VHF:')) {
      geometry.userData.sourceAtlas = 'Andreassen et al. · Visible Human Female';
      geometry.userData.atlasCounterpart = sourceMesh.extras.atlasCounterpart;
    }
    parts.set(name, geometry);
  }
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index);
  return parts;
}

export { parseAtlas as parseSkeletonScan };

// Keep the selected skeleton and shared atlases in CPU memory. Pose and
// renderer allocations belong to each inspection, while the source stays intact.
const sources = new Map();

export function loadSkeletonScan(name, tier, signal) {
  const sex = { sippy: 'male', roma: 'female' }[name];
  if (!sex || !['mobile', 'high'].includes(tier)) throw new Error('Unknown human scan selection');
  return loadAtlas(
    'skeleton',
    sourceAssetFiles(name, tier)[0],
    sex === 'male' ? 142 : 143,
    signal,
  );
}

export function loadMuscleAtlas(tier, signal) {
  if (!['mobile', 'high'].includes(tier)) throw new Error('Unknown muscle atlas tier');
  return loadAtlas('muscles-' + tier, 'bp3d-muscles-' + tier + '-meshopt.glb', 323, signal);
}

export function loadFaceMuscleAtlas(name, signal) {
  if (!['sippy', 'roma'].includes(name)) throw new Error('Unknown human face atlas');
  const credit = name === 'roma' ? ' · adapted from male atlas' : '';
  return loadAtlas('face-' + name, name + '-face-bp3d-meshopt.glb', 35, signal,
    'BodyParts3D v3 · DBCLS' + credit);
}

export function loadFemaleMuscles(signal) {
  return loadAtlas('female', femaleMuscleFile, 76, signal, 'Andreassen et al. · Visible Human Female');
}

function lowerLimb(name, geometry) {
  const midline = (geometry.boundingBox.min.y + geometry.boundingBox.max.y) / 2;
  if (/coccygeus|anal_sphincter/.test(name)) return false;
  return midline < 0.68 || /gluteus|piriformis|tensor_fasciae|adductor_|gracilis|pectineus|obturator_|gemellus|quadratus_femoris|psoas|iliacus|semitendinosus|semimembranosus|sartorius|biceps_femoris|rectus_femoris|vastus/.test(name);
}

// The male atlas supplies Roma's upper body. Her lower limbs come from
// the 76 original same-donor surfaces, even where no atlas name matches.
export async function loadCharacterMuscles(name, tier, signal, upperOnly = false, rawUpper = false) {
  if (name !== 'roma' && name !== 'sippy') throw new Error('Unknown human muscle selection');
  const file = (stem) => stem + '-' + tier + '-meshopt.glb';
  const adapted = name === 'roma' && !rawUpper;
  const packs = adapted ? [
    loadAtlas('roma-adapted-' + tier, file('roma-adapted-bp3d'), null, signal,
      'BodyParts3D · DBCLS · adapted from male atlas'),
    loadAtlas('roma-zanatomy-' + tier, file('roma-adapted-zanatomy'), 4, signal,
      'Z-Anatomy · CC BY-SA 4.0 · adapted from male atlas'),
  ] : [
    loadMuscleAtlas(tier, signal),
    loadAtlas('missing-' + tier, file('bp3d-missing-muscles'), 34, signal),
    loadAtlas('zanatomy-' + tier, file('zanatomy-lats-rectus'), 4, signal, 'Z-Anatomy · CC BY-SA 4.0'),
  ];
  const atlas = new Map();
  const female = name === 'roma' && !upperOnly && loadFemaleMuscles(signal);
  if (female) packs.push(female);
  for (const [i, pack] of (await Promise.all(packs)).entries()) {
    for (const [node, geometry] of pack) {
      if (name === 'roma' && !adapted && i < 3 && lowerLimb(node, geometry)) continue;
      atlas.set(node, geometry);
    }
  }
  return atlas;
}

function loadAtlas(slot, file, count, signal, sourceAtlas) {
  signal?.throwIfAborted();
  const cached = sources.get(slot);
  if (cached?.file === file && (!cached.signal || cached.signal === signal)) return cached.pending;
  const entry = { file, signal };
  sources.set(slot, entry);
  const url = new URL('./assets/' + file, import.meta.url);
  entry.pending = readAsset(url, signal)
    .then((buffer) => {
      signal?.throwIfAborted();
      return parseAtlas(buffer, file, sourceAtlas);
    })
    .then((parts) => {
      if (count !== null ? parts.size !== count : !parts.size)
        throw new Error('Incomplete anatomical atlas ' + file);
      signal?.throwIfAborted();
      entry.signal = undefined;
      return parts;
    })
    .catch((error) => {
      if (sources.get(slot) === entry) sources.delete(slot);
      if (!signal?.aborted && !error.assetURL) error.assetURL = url.href;
      throw error;
    });
  return entry.pending;
}

async function readAsset(url, signal) {
  // The pose and mesh verification tools run these same ES modules directly
  // from the checkout. Browsers always fetch the selected deployment asset.
  if (url.protocol === 'file:' && globalThis.process?.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(url, { signal });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const error = new Error('Could not load ' + url.pathname + ' (HTTP ' + response.status + ')');
    error.assetURL = url.href;
    throw error;
  }
  return response.arrayBuffer();
}
