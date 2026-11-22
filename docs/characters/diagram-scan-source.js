// Imported only by the selected human's Axon inspection model.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Both atlases quantize positions and store a transform on each named node.
// Fitters need their common scene space, including translation and scale.
async function parseAtlas(buffer, sourceAtlas) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const { scene, parser } = await loader.parseAsync(buffer, '');
  scene.updateMatrixWorld(true);
  const parts = new Map();
  const p = new Vector3();
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const association = parser.associations.get(mesh);
    const sourceMesh = parser.json.meshes[association.meshes];
    const originalName = parser.json.nodes[association.nodes].name;
    const name = sourceAtlas === 'Z-Anatomy · CC BY-SA 4.0'
      ? originalName.replace(/^(Latissimus_dorsi|Rectus_abdominis)_muscle_(left|right)$/,
          (_, muscle, side) => side + '_' + muscle.toLowerCase())
      : originalName;
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
    geometry.userData.sourcePart = sourceMesh.extras?.name || originalName;
    if (sourceAtlas) geometry.userData.sourceAtlas = sourceAtlas;
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

// Roma's subject-matched donors take precedence by anatomical name. This
// also deduplicates the twelve BP3D quadriceps and gastrocnemius surfaces.
export async function loadCharacterMuscles(name, tier, signal) {
  if (name !== 'roma' && name !== 'sippy') throw new Error('Unknown human muscle selection');
  const file = (stem) => stem + '-' + tier + '-meshopt.glb';
  const packs = [
    loadMuscleAtlas(tier, signal),
    loadAtlas('missing-' + tier, file('bp3d-missing-muscles'), 34, signal),
    loadAtlas('zanatomy-' + tier, file('zanatomy-lats-rectus'), 4, signal, 'Z-Anatomy · CC BY-SA 4.0'),
  ];
  if (name === 'roma') packs.push(loadAtlas('female-' + tier, file('vhf-muscles'), 76, signal));
  const atlas = new Map();
  for (const pack of await Promise.all(packs)) {
    for (const [node, geometry] of pack) atlas.set(node, geometry);
  }
  return atlas;
}

function loadAtlas(slot, file, count, signal, sourceAtlas) {
  signal?.throwIfAborted();
  const cached = sources.get(slot);
  if (cached?.file === file && !cached.signal?.aborted) return cached.pending;
  const entry = { file, signal };
  sources.set(slot, entry);
  entry.pending = readAsset(new URL('./assets/' + file, import.meta.url), signal)
    .then((buffer) => {
      signal?.throwIfAborted();
      return parseAtlas(buffer, sourceAtlas);
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
  if (!response.ok) {
    const error = new Error('Could not load ' + url.pathname + ' (HTTP ' + response.status + ')');
    error.assetURL = url.href;
    throw error;
  }
  return response.arrayBuffer();
}
