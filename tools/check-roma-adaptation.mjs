// Check delivered Roma GLBs against the named anchor and volume report.
// Production only supplies the rig's final matrices. The surfaces under test
// are independently decoded by Three's standard GLTFLoader.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = process.argv[2];
if (!output) throw new Error('Expected a destination for the anatomy audit JSON');
if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({
    resolve(specifier, context, next) {
      const file = specifier === 'three'
        ? 'build/three.module.js'
        : specifier.startsWith('three/addons/') ? 'examples/jsm/' + specifier.slice(13) : null;
      return file
        ? { url: pathToFileURL(resolve(root, file)).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const { Box3, Triangle, Vector3, REVISION } = await import('three');
assert.equal(REVISION, '170');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
const { createActor } = await import('../docs/characters/rig.js');
const { heights } = await import('../docs/characters/ui.js');
const { prepareSourceAnatomy } = await import('../docs/characters/diagram-source-anatomy.js');
const assets = new URL('../docs/characters/assets/', import.meta.url);
const review = new URL('../docs/characters/review/source-true-anatomy/', import.meta.url);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inch = 0.0254;

function vertices(mesh, matrix, unit) {
  const coordinates = mesh.geometry.attributes.position;
  const result = [];
  for (let i = 0; i < coordinates.count; i++)
    result.push(new Vector3().fromBufferAttribute(coordinates, i).applyMatrix4(matrix).multiplyScalar(1 / unit));
  return result;
}

function enclosedEstimate(points, indices, origin) {
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  let total = 0;
  for (let i = 0; i < indices.length; i += 3) {
    a.copy(points[indices[i]]).sub(origin);
    b.copy(points[indices[i + 1]]).sub(origin);
    c.copy(points[indices[i + 2]]).sub(origin);
    total += a.dot(b.cross(c));
  }
  return Math.abs(total / 6);
}

function closestCortex(p, bone) {
  const q = new Vector3();
  const face = new Triangle();
  const { points, indices } = bone;
  let best = Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    face.set(points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]);
    face.closestPointToPoint(p, q);
    best = Math.min(best, q.distanceToSquared(p));
  }
  return Math.sqrt(best);
}

const summary = [];
for (const tier of ['mobile', 'high']) {
  const report = JSON.parse(await readFile(new URL('roma-muscle-adaptation-' + tier + '.json', review), 'utf8'));
  const rig = createActor('roma', heights[1]);
  const loaded = [];
  const raw = await prepareSourceAnatomy('roma', tier, undefined, {
    rawUpper: true, upperOnly: true, repairs: false,
  });
  raw(rig, loaded);
  const cortex = new Map();
  const donor = new Map();
  for (const p of loaded) {
    if (p.scanNode) cortex.set(p.scanNode, {
      points: vertices(p.mesh, p.sourceMatrix, inch), indices: p.mesh.geometry.index.array,
    });
    if (p.muscleNode) donor.set(p.muscleNode, {
      points: vertices(p.mesh, p.sourceMatrix, inch), indices: p.mesh.geometry.index.array,
    });
  }
  const expected = new Map(report.meshes.map((mesh) => [mesh.muscle, mesh]));
  const passed = [];
  for (const pack of report.packs) {
    const bytes = await readFile(new URL(pack.file, assets));
    assert.equal(sha256(bytes), pack.sha256, 'Measurement file differs from delivered GLB');
    const { scene, parser } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    assert.match(parser.json.asset.copyright, /Adapted from male atlas/);
    const sa = pack.file.includes('zanatomy');
    assert.match(parser.json.asset.copyright, sa ? /Z-Anatomy.*CC BY-SA 4\.0/ : /BodyParts3D.*CC Attribution 4\.0/);
    scene.updateMatrixWorld(true);
    const start = passed.length;
    scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const association = parser.associations.get(mesh);
      const name = parser.json.nodes[association.nodes].name;
      const entry = expected.get(name);
      assert(entry, 'Unexpected adapted muscle ' + name);
      assert.equal(entry.file.includes('zanatomy'), sa, 'Wrong license pack for ' + name);
      expected.delete(name);
      const gltfMesh = parser.json.meshes[association.meshes];
      assert.equal(gltfMesh.extras.adaptation, 'adapted from male atlas');
      assert.equal(gltfMesh.extras.rigJoint, entry.joint);
      const joint = rig[entry.joint];
      const points = vertices(mesh, joint.matrixWorld.clone().multiply(mesh.matrixWorld), inch);
      const indices = mesh.geometry.index.array;
      assert.equal(indices.length / 3, entry.triangles);
      const source = donor.get(name);
      assert.equal(points.length, source.points.length, 'Renumbered vertices ' + name);
      const center = source.points.reduce((c, p) => c.add(p), new Vector3()).divideScalar(source.points.length);
      const beforeIn3 = enclosedEstimate(source.points, source.indices, center);
      const afterIn3 = enclosedEstimate(points, indices, center);
      const beforeDifferenceIn3 = Math.abs(beforeIn3 - entry.beforeIn3);
      const afterDifferenceIn3 = Math.abs(afterIn3 - entry.afterIn3);
      assert(beforeDifferenceIn3 < 1e-6, 'Wrong baseline volume ' + name);
      assert(afterDifferenceIn3 < 0.01, 'Published volume drift ' + name);
      let sampleCount = 0, namedCount = 0, maxCortexIn = 0, maxTargetIn = 0, maxNamedCortexIn = 0;
      for (const anchor of entry.anchors) {
        const at = points[anchor.index];
        assert(at, 'Bad published pin ' + name);
        const cortical = cortex.get(anchor.bone);
        assert(cortical, 'Unknown cortex ' + anchor.bone);
        const target = new Vector3().fromArray(anchor.femaleCorticalTargetIn);
        const reported = at.distanceTo(target);
        const remaining = closestCortex(at, cortical);
        maxCortexIn = Math.max(maxCortexIn, remaining);
        maxTargetIn = Math.max(maxTargetIn, reported);
        sampleCount++;
        if (anchor.atlasLandmark) {
          namedCount++;
          maxNamedCortexIn = Math.max(maxNamedCortexIn, remaining);
        }
        assert(remaining < 0.001 && reported < 0.001, 'Published attachment gap ' + name + ': ' + remaining + ' in');
      }
      passed.push({
        node: name, sampleCount, namedCount, maxCortexIn, maxTargetIn, maxNamedCortexIn,
        beforeIn3, afterIn3, afterDifferenceIn3,
      });
    });
    assert.equal(passed.length - start, pack.parts);
  }
  assert.equal(expected.size, 0);
  assert.equal(passed.length, 255);
  const largest = (key) => passed.reduce((best, item) => item[key] > best[key] ? item : best, passed[0]);
  summary.push({
    tier, packs: report.packs, meshes: passed.length, attachments: passed.reduce((n, p) => n + p.sampleCount, 0),
    namedAttachments: passed.reduce((n, p) => n + p.namedCount, 0),
    maxCorticalOffsetIn: largest('maxCortexIn').maxCortexIn,
    maxCorticalOffsetNode: largest('maxCortexIn').node,
    maxNamedCorticalOffsetIn: largest('maxNamedCortexIn').maxNamedCortexIn,
    maxReportedTargetOffsetIn: largest('maxTargetIn').maxTargetIn,
    maxVolumeEstimateDifferenceIn3: largest('afterDifferenceIn3').afterDifferenceIn3,
    maxVolumeEstimateDifferenceNode: largest('afterDifferenceIn3').node,
    measuredBeforeIn3: passed.reduce((n, p) => n + p.beforeIn3, 0),
    measuredAfterIn3: passed.reduce((n, p) => n + p.afterIn3, 0),
  });
  rig.root.clear();
  console.log(tier, summary.at(-1).attachments + ' cortex sites, maximum', summary.at(-1).maxCorticalOffsetIn, 'in');
}
await writeFile(output, JSON.stringify({
  method: 'Independent GLTFLoader decode of published Roma adaptation GLBs. Each selected actual vertex is compared with the nearest triangle on the named decoded female BoneHub bone in the upright bind frame. Estimated oriented-triangle volumes use the published atlas centroid. As some meshes have open boundaries, volumes are estimates.',
  summary,
}, null, 2) + '\n');
