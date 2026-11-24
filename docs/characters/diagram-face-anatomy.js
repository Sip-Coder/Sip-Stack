// Loaded by the two human face modes in Axon View.
import { Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { loadFaceMuscleAtlas } from './diagram-scan-source.js';
import { shadeSourceMuscle } from './diagram-source-tissue.js';

const finish = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3 });

export async function loadHeadMuscleParts(name, headFrame = new Matrix4(), signal) {
  const atlas = await loadFaceMuscleAtlas(name, signal);
  signal?.throwIfAborted();
  const parts = [];
  for (const [node, geometry] of atlas) {
    shadeSourceMuscle(geometry, node);
    const label = geometry.userData.displayName;
    const mesh = new Mesh(geometry, finish);
    mesh.name = label;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.matrix.copy(headFrame);
    mesh.matrixWorld.copy(headFrame);
    parts.push({
      name: label,
      layer: 'muscles', joint: 'head', region: 'face', mesh,
      muscleNode: node, atlasNode: node,
      bounds: geometry.boundingBox.clone().applyMatrix4(headFrame),
      triangles: geometry.index.count / 3,
      source: geometry.userData.sourceAtlas,
      sourceFile: geometry.userData.sourceFile,
      sourceNode: node,
      sourcePart: geometry.userData.sourcePart,
      sourceShape: name === 'roma' ? 'landmark-deformed' : 'unchanged',
      sourceMatrix: headFrame,
    });
  }
  return parts;
}
