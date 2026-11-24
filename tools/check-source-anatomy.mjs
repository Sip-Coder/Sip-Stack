// Audit the actual Axon render buffers against the canonical decoder, not
// against cached data produced by the loader under test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const destination = process.argv[2];
if (!destination) throw new Error('Expected path to geometry proof JSON');
if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({
    resolve(specifier, context, next) {
      const file =
        specifier === 'three'
          ? 'build/three.module.js'
          : specifier.startsWith('three/addons/')
            ? 'examples/jsm/' + specifier.slice(13)
            : null;
      return file
        ? { url: pathToFileURL(resolve(root, file)).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const { REVISION, Vector3 } = await import('three');
assert.equal(REVISION, '170');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
const { buildDiagramModel } = await import('../docs/characters/diagram-parts.js');
const { snapshotDiagramModel } = await import('../docs/characters/diagram-model.js');
const { buildDisplayBatches } = await import('../docs/characters/diagram-view.js');
const { createSourceRig } = await import('../docs/characters/source-rig.js');
const { createActor, heroHeadScale } = await import('../docs/characters/rig.js');
const { cranialAtlasMuscle } = await import('../docs/characters/diagram-source-pose.js');
const { createController, FIXED_DT } = await import('../docs/characters/motion.js');
const { setModelDetail } = await import('../docs/characters/model-tier.js');
const { names, heights } = await import('../docs/characters/ui.js');
const { buildSippy } = await import('../docs/characters/sippy.js');
const { buildRoma } = await import('../docs/characters/roma.js');

const assets = new URL('../docs/characters/assets/', import.meta.url);
const female = 'vhf-muscles-source-meshopt.glb';
const partsByFile = new Map();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inches = (metres) => metres / 0.0254;
const epsilon = 0.00001; // One hundred-thousandth of an inch.
const sourceFiles = {};
const publishedHashes = JSON.parse(await readFile(new URL(
  '../docs/characters/review/source-true-anatomy/source-files.json', import.meta.url,
), 'utf8'));
const stlProof = JSON.parse(await readFile(new URL(
  '../docs/characters/review/source-true-anatomy/andreassen-stl-proof.json', import.meta.url,
), 'utf8'));

async function walkingSnapshot(name, tier) {
  const rig = createActor(name, heights[names.indexOf(name)]);
  const controller = createController(rig);
  const pose = (name === 'sippy' ? buildSippy : buildRoma)(rig);
  setModelDetail(rig.root, tier);
  let frame;
  for (let i = 0; i < 42; i++) {
    frame = controller.step(FIXED_DT, { x: 0, z: 1, run: false, roll: false, jump: false, emote: false });
    pose(frame);
    controller.finishPose();
  }
  assert.equal(frame.state, 'walk');
  try {
    return await snapshotDiagramModel(rig, tier);
  } finally {
    rig.root.clear();
  }
}

async function canonical(file) {
  if (partsByFile.has(file)) return partsByFile.get(file);
  const buffer = await readFile(new URL(file, assets));
  const hash = sha256(buffer);
  assert.equal(hash, publishedHashes.files[file]?.sha256, 'Changed source GLB ' + file);
  sourceFiles[file] = { sha256: hash, bytes: buffer.byteLength };
  if (file === female) assert.equal(hash, stlProof.packedSha256, 'Changed exact STL GLB');
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const { scene, parser } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
  scene.updateMatrixWorld(true);
  const result = new Map();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const node = parser.json.nodes[parser.associations.get(object).nodes].name;
    assert(!result.has(node), 'Duplicated canonical node ' + file + '/' + node);
    result.set(node, object);
  });
  partsByFile.set(file, result);
  return result;
}

function verifyOneScale(matrix, expected, id) {
  const columns = [0, 4, 8].map((start) => new Vector3().fromArray(matrix.elements, start));
  for (const col of columns) assert(Math.abs(col.length() - expected) <= 1e-7, 'Changed scale ' + id);
  const maxDot = Math.max(
    Math.abs(columns[0].dot(columns[1])),
    Math.abs(columns[1].dot(columns[2])),
    Math.abs(columns[2].dot(columns[0])),
  );
  assert(maxDot <= 1e-7, 'Shear ' + id);
  assert(Math.abs(matrix.determinant() - expected ** 3) <= 1e-7, 'Improper rotation ' + id);
  for (const i of [3, 7, 11]) assert.equal(matrix.elements[i], 0, 'Non-affine mesh ' + id);
  assert.equal(matrix.elements[15], 1);
}

const trials = [];
for (const name of ['sippy', 'roma']) {
  const sex = name === 'sippy' ? 'male' : 'female';
  const scale = heights[names.indexOf(name)] / createSourceRig(name).height;
  const headScale = heroHeadScale[name];
  for (const tier of ['mobile', 'high']) {
    for (const pose of ['neutral', 'walk']) {
      const skeleton = 'skeleton-' + sex + '-' + tier + '.glb';
      const files = name === 'roma' ? [skeleton, female] : [
        skeleton, 'bp3d-muscles-' + tier + '-meshopt.glb',
        'bp3d-missing-muscles-' + tier + '-meshopt.glb',
        'zanatomy-lats-rectus-' + tier + '-meshopt.glb',
      ];
      const pending = new Map(await Promise.all(files.map(async (file) =>
        [file, new Map(await canonical(file))],
      )));
      const model = await (pose === 'neutral' ? buildDiagramModel(name, tier) : walkingSnapshot(name, tier));
      const displayed = buildDisplayBatches(model.parts);
      const rows = [], exempt = [], added = [];
      const point = new Vector3(), expected = new Vector3();
      const seen = new Set();
      try {
        for (const { geometry, spans } of displayed) {
          for (const { number, lo, hi, indexStart, indexCount } of spans) {
            const part = model.parts[number];
            if (!['skeleton', 'muscles'].includes(part.layer)) continue;
            const { sourceFile: file, sourceNode: node, sourceMatrix } = part;
            if (!file) {
              assert(part.layer === 'skeleton' && /repair|cartilage|reconstruction/i.test(part.name),
                'Unlabelled non-source anatomy ' + part.name);
              added.push(part.name);
              continue;
            }
            if (name === 'roma' && /^roma-adapted-(?:bp3d|zanatomy)-/.test(file)) {
              assert.equal(part.sourceShape, 'landmark-deformed', 'Missing adaptation label ' + node);
              exempt.push({ file, node });
              continue;
            }
            const id = file + '/' + node;
            const pendingFile = pending.get(file);
            const original = pendingFile?.get(node);
            assert(original && !seen.has(id), 'Unexpected or duplicate source mesh ' + id);
            seen.add(id);
            pendingFile.delete(node);
            const cranial = /^SKULL_/.test(node) || (part.layer === 'muscles' && cranialAtlasMuscle(node));
            verifyOneScale(sourceMatrix, scale * (cranial ? headScale : 1), id);
            const originalGeometry = original.geometry;
            const pos = originalGeometry.attributes.position;
            const live = part.mesh.geometry.attributes.position;
            const rendered = geometry.attributes.position;
            assert.equal(live.count, pos.count, 'Changed source vertex count ' + id);
            assert.equal(hi - lo + 1, pos.count, 'Changed drawn vertex count ' + id);
            const originalIndex = originalGeometry.index;
            const liveIndex = part.mesh.geometry.index;
            const renderedIndex = geometry.index;
            assert.equal(liveIndex.count, originalIndex.count, 'Changed source index count ' + id);
            assert.equal(indexCount, originalIndex.count, 'Changed drawn index count ' + id);
            for (let i = 0; i < indexCount; i++) {
              const corner = originalIndex.getX(i);
              if (corner !== liveIndex.getX(i) || corner !== renderedIndex.getX(indexStart + i) - lo)
                throw new Error('Changed triangle ' + Math.floor(i / 3) + ' in ' + id);
            }
            let localError = 0, renderedError = 0;
            for (let i = 0; i < pos.count; i++) {
              expected.fromBufferAttribute(pos, i).applyMatrix4(original.matrixWorld);
              point.fromBufferAttribute(live, i);
              localError = Math.max(localError, expected.distanceTo(point));
              expected.applyMatrix4(sourceMatrix);
              point.fromBufferAttribute(rendered, lo + i);
              renderedError = Math.max(renderedError, expected.distanceTo(point));
            }
            const maxSourceResidualInches = inches(localError);
            const maxDrawnResidualInches = inches(renderedError);
            assert(maxSourceResidualInches <= epsilon && maxDrawnResidualInches <= epsilon,
              'Source geometry drift ' + id + ' (' + maxDrawnResidualInches + ' in)');
            rows.push({
              file, node, layer: part.layer, joint: part.joint, vertices: pos.count,
              triangles: indexCount / 3, maxSourceResidualInches, maxDrawnResidualInches,
            });
          }
        }
        const missing = [...pending].flatMap(([file, nodes]) => [...nodes.keys()].map((node) => file + '/' + node));
        assert.deepEqual(missing, [], 'Missing original surface');
        assert(rows.length === (name === 'sippy' ? 503 : 219), 'Wrong verified anatomy census ' + name + '/' + tier);
        assert(name === 'sippy' ? !exempt.length : exempt.length > 0, 'Missing Roma exception census');
        trials.push({
          name, tier, pose, scale, headScale, anatomyMeshes: rows.length, excludedAdaptedMuscles: exempt,
          separatelyAddedRepairs: [...new Set(added)], ...(pose === 'neutral' ? { parts: rows } : {}),
          maxSourceResidualInches: Math.max(...rows.map((it) => it.maxSourceResidualInches)),
          maxDrawnResidualInches: Math.max(...rows.map((it) => it.maxDrawnResidualInches)),
        });
        console.log(name, tier, pose, rows.length + ' meshes, max residual', trials.at(-1).maxDrawnResidualInches, 'in');
      } finally {
        for (const batch of displayed) batch.geometry.dispose();
        model.dispose();
      }
    }
  }
}
await writeFile(destination, JSON.stringify({
  method: 'Independent GLTFLoader canonical positions vs production Axon vertex arrays and final draw slices. All indices verified in order. Each transform has perpendicular columns and a positive determinant, with one body scale and one uniform cranial multiplier.',
  maxAllowedResidualInches: epsilon,
  sourceFiles, trials,
}, null, 2) + '\n');
