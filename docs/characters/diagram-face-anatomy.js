// Loaded by the human face modes and the facial fat layer in Axon View.
import { Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { loadFaceFatAtlas, loadFaceMuscleAtlas } from './diagram-scan-source.js';
import { shadeSourceMuscle } from './diagram-source-tissue.js';

const finish = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3 });
const fatFinish = new MeshStandardMaterial({ color: 0xcfaa55, roughness: 0.65 });

function pose(geometry, headFrame, name, finish) {
  const mesh = new Mesh(geometry, finish);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.matrix.copy(headFrame);
  mesh.matrixWorld.copy(headFrame);
  return {
    name, mesh, joint: 'head', region: 'face', sourceMatrix: headFrame,
    bounds: geometry.boundingBox.clone().applyMatrix4(headFrame),
    triangles: geometry.index.count / 3,
  };
}

export async function loadHeadMuscleParts(name, headFrame = new Matrix4(), signal) {
  const atlas = await loadFaceMuscleAtlas(name, signal);
  signal?.throwIfAborted();
  const parts = [];
  for (const [node, geometry] of atlas) {
    shadeSourceMuscle(geometry, node);
    parts.push({
      ...pose(geometry, headFrame, geometry.userData.displayName, finish), layer: 'muscles',
      muscleNode: node, atlasNode: node,
      source: geometry.userData.sourceAtlas,
      sourceFile: geometry.userData.sourceFile,
      sourceNode: node,
      sourcePart: geometry.userData.sourcePart,
      sourceShape: name === 'roma' ? 'landmark-deformed' : 'unchanged',
    });
  }
  return parts;
}

export async function loadFaceFatParts(name, headFrame, signal) {
  const atlas = await loadFaceFatAtlas(name, signal);
  signal?.throwIfAborted();
  return Array.from(atlas, ([label, geometry]) => ({
    ...pose(geometry, headFrame, label, fatFinish), layer: 'face-fat',
    source: 'Authored facial fat pads', sourceShape: 'authored',
  }));
}
