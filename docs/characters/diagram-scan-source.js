// Imported only by the selected human's Axon inspection model.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Both atlases quantize positions and store a transform on each named node.
// Fitters need their common scene space, including translation and scale.
async function parseAtlas(buffer) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const { scene, parser } = await loader.parseAsync(buffer, '');
  scene.updateMatrixWorld(true);
  const parts = new Map();
  const p = new Vector3();
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const association = parser.associations.get(mesh);
    const sourceMesh = parser.json.meshes[association.meshes];
    const name = parser.json.nodes[association.nodes].name;
    if (parts.has(name)) throw new Error('Duplicate scan mesh ' + name);
    const source = mesh.geometry;
    const attribute = source.getAttribute('position');
    const coordinates = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
      p.fromBufferAttribute(attribute, i)
        .applyMatrix4(mesh.matrixWorld)
        .toArray(coordinates, i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3));
    geometry.setIndex(source.index);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.userData.sourcePart = sourceMesh.extras?.name || name;
    if (sourceMesh.extras?.name?.startsWith('VHF:')) {
      geometry.userData.sourceAtlas = 'Andreassen et al. · Visible Human Female';
      geometry.userData.atlasCounterpart = sourceMesh.extras.atlasCounterpart;
    }
    parts.set(name, geometry);
  });
  return parts;
}

export { parseAtlas as parseSkeletonScan };

// Keep the selected sex-specific skeleton and one shared muscle atlas per tier.
// Cache CPU source geometry only. Each posed character owns its fitted meshes.
const sources = new Map();

export function loadSkeletonScan(name, tier, signal) {
  const sex = { sippy: 'male', roma: 'female' }[name];
  if (!sex || !['mobile', 'high'].includes(tier)) throw new Error('Unknown human scan selection');
  return loadAtlas(
    'skeleton',
    'skeleton-' + sex + '-' + tier + '.glb',
    sex === 'male' ? 142 : 143,
    signal,
  );
}

export function loadMuscleAtlas(tier, signal) {
  if (!['mobile', 'high'].includes(tier)) throw new Error('Unknown muscle atlas tier');
  return loadAtlas('muscles-' + tier, 'bp3d-muscles-' + tier + '-meshopt.glb', 323, signal);
}

// Both characters share the pristine BP3D collection. Only Roma requests
// separate female lower-limb surfaces. The merged Map never mutates that cache.
export async function loadCharacterMuscles(name, tier, signal) {
  if (name !== 'roma' && name !== 'sippy') throw new Error('Unknown human muscle selection');
  const base = loadMuscleAtlas(tier, signal);
  if (name !== 'roma') return base;
  const supplement = loadAtlas(
    'female-muscles-' + tier,
    'vhf-muscles-' + tier + '-meshopt.glb',
    76,
    signal,
  );
  const [male, female] = await Promise.all([base, supplement]);
  const atlas = new Map(male);
  for (const [node, geometry] of female) atlas.set(node, geometry);
  return atlas;
}

function loadAtlas(slot, file, count, signal) {
  signal?.throwIfAborted();
  const cached = sources.get(slot);
  if (cached?.file === file && !cached.signal?.aborted) return cached.pending;
  const entry = { file, signal };
  sources.set(slot, entry);
  entry.pending = readAsset(new URL('./assets/' + file, import.meta.url), signal)
    .then((buffer) => {
      signal?.throwIfAborted();
      return parseAtlas(buffer);
    })
    .then((parts) => {
      if (parts.size !== count) throw new Error('Incomplete anatomical atlas ' + file);
      signal?.throwIfAborted();
      entry.signal = undefined;
      return parts;
    })
    .catch((error) => {
      if (sources.get(slot) === entry) sources.delete(slot);
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
  if (!response.ok)
    throw new Error('Could not load ' + url.pathname + ' (HTTP ' + response.status + ')');
  return response.arrayBuffer();
}
