// Verify the live jaw transform against the two published BoneHub tiers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({
    resolve(specifier, context, next) {
      const file = specifier === 'three' ? 'build/three.module.js'
        : specifier.startsWith('three/addons/') ? 'examples/jsm/' + specifier.slice(13) : null;
      return file ? { url: pathToFileURL(resolve(root, file)).href, shortCircuit: true } : next(specifier, context);
    },
  });
}

const { Vector3 } = await import('three');
const { createActor } = await import('../docs/characters/rig.js');
const { heights, names } = await import('../docs/characters/ui.js');
const { sourcePose } = await import('../docs/characters/diagram-source-pose.js');
const { loadSkeletonScan } = await import('../docs/characters/diagram-scan-source.js');
const { loadHeadMuscleParts } = await import('../docs/characters/diagram-face-anatomy.js');
const { faceLandmarks } = await import('../docs/characters/source-face-landmarks.js');
const { sourceAssetFiles } = await import('../docs/characters/source-asset-files.js');
const { files } = JSON.parse(await readFile(new URL('../docs/characters/review/source-true-anatomy/source-files.json', import.meta.url), 'utf8'));
const registration = JSON.parse(await readFile(new URL('../docs/characters/review/face-fine-tune/face-muscle-registration.json', import.meta.url), 'utf8'));

const metresPerInch = 0.0254;
const arrayHash = (array) => createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const point = (v) => new Vector3().fromArray(v);
const inch = (value) => Number(value.toFixed(6));
const evidence = [];

for (const hero of ['sippy', 'roma']) {
  const height = heights[names.indexOf(hero)];
  const rig = createActor(hero, height);
  rig.root.updateMatrixWorld(true);
  const headFrame = rig.head.matrixWorld.clone();
  const unposed = headFrame.clone().multiply(rig.anatomy.restPose.head);
  const pose = sourcePose(rig);
  const c = faceLandmarks[hero];
  const origin = rig.anatomy.original.head;
  const donorHeight = rig.anatomy.height;
  const donorToWorldScale = height / donorHeight;
  for (const tier of ['mobile', 'high']) {
    const [file] = sourceAssetFiles(hero, tier);
    const hash = createHash('sha256').update(await readFile(new URL('../docs/characters/assets/' + file, import.meta.url))).digest('hex');
    assert.equal(hash, files[file].sha256, 'Changed BoneHub source file');
    const source = await loadSkeletonScan(hero, tier);
    const bones = [];
    for (const node of ['SKULL_CRANIAL_MAXILLA', 'SKULL_MANDIBLE']) {
      const { matrix } = pose.bone(node);
      if (node === 'SKULL_CRANIAL_MAXILLA') assert(matrix.equals(unposed), 'Cranium or maxilla pose changed');
      const { index, attributes: { position } } = source.get(node);
      // Compare every indexed source edge against its posed distance, with the
      // common standing-height conversion divided out before taking residuals.
      let maxEdgeResidualInches = 0;
      const a = new Vector3(), b = new Vector3();
      for (let i = 0; i < index.count; i += 3) {
        for (let j = 0; j < 3; j++) {
          a.fromBufferAttribute(position, index.getX(i + j));
          b.fromBufferAttribute(position, index.getX(i + (j + 1) % 3));
          const initial = a.distanceTo(b);
          const posed = a.applyMatrix4(matrix).distanceTo(b.applyMatrix4(matrix)) / donorToWorldScale;
          maxEdgeResidualInches = Math.max(maxEdgeResidualInches, Math.abs(initial - posed) / metresPerInch);
        }
      }
      assert(maxEdgeResidualInches < 1e-8, 'Skull surface stretched');
      bones.push({ node, positionsSha256: arrayHash(position.array), indicesSha256: arrayHash(index.array),
        vertices: position.count, triangles: index.count / 3, maxEdgeResidualInches });
    }
    const pivot = pose.bone('SKULL_MANDIBLE').matrix;
    const hingeDisplacementInches = Object.fromEntries(Object.entries(c.tmj).map(([side, condyle]) => {
      const v = point(condyle).multiplyScalar(donorHeight).add(origin);
      return [side, v.clone().applyMatrix4(unposed).distanceTo(v.clone().applyMatrix4(pivot)) / metresPerInch];
    }));
    assert(Math.max(...Object.values(hingeDisplacementInches)) < 1e-6, 'Condyle moved during hinge rotation');
    const dimensions = point(c.skull.max).sub(point(c.skull.min)).multiplyScalar(height / metresPerInch).toArray().map(inch);
    const open = c.jaw.openInches * donorToWorldScale, closed = c.jaw.closedInches * donorToWorldScale;
    assert(open > closed && closed > 0 && closed < .02, 'Central incisor gap failed to close');
    evidence.push({ hero, tier, file, sha256: hash, bones, skullDimensionsInches: dimensions,
      jawClosureDegrees: c.jaw.angle * 180 / Math.PI, hingeDisplacementInches,
      centralIncisorVerticalGapInches: { open: inch(open), closed: inch(closed) } });
  }
  let uniform;
  const atlas = await loadHeadMuscleParts(hero);
  const parts = registration.positions[hero];
  assert.equal(atlas.length, Object.keys(parts).length);
  for (const part of atlas) {
    const { matrix } = Object.values(parts).find(({ id }) => id === part.sourceNode);
    const [x, y, z] = matrix.slice(0, 3).map((row) => point(row));
    assert(x.dot(y.clone().cross(z)) > 0, 'Improper muscle registration');
    if (hero === 'sippy') {
      uniform ??= x.length();
      assert([x, y, z].every((v) => Math.abs(v.length() - uniform) < 1e-10));
      assert([x.dot(y), x.dot(z), y.dot(z)].every((dot) => Math.abs(dot) < 1e-10));
    } else assert(part.source.endsWith('adapted from male atlas'));
  }
  const file = atlas[0].sourceFile;
  const packed = await readFile(new URL('../docs/characters/assets/' + file, import.meta.url));
  evidence.push({ hero, muscles: atlas.length, triangles: atlas.reduce((sum, part) => sum + part.triangles, 0),
    file, sha256: createHash('sha256').update(packed).digest('hex'), bytes: packed.byteLength,
    placement: uniform ? { atlasScaleHeadLocal: uniform } : 'regional landmark adaptation' });
}

const output = process.argv[2];
if (output) await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
for (const item of evidence) console.log(item.hero, item.tier ?? 'muscles', item.centralIncisorVerticalGapInches ?? item.muscles);
