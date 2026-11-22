// Anatomical geometry belongs to the donor. Each live layer entry carries its
// source positions/indices and one proper similarity matrix for inspection.
import { Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { fabricator } from './diagram-fabricator.js';
import { muscleDisplayName } from './diagram-muscle-names.js';
import { repairScanJoints, scanPartName } from './diagram-scan-repairs.js';
import { loadCharacterMuscles, loadFemaleMuscles, loadSkeletonScan } from './diagram-scan-source.js';
import { donorMuscleLabel, sourcePose } from './diagram-source-pose.js';
import { shadeSourceMuscle } from './diagram-source-tissue.js';

const boneFinish = new MeshStandardMaterial({ color: 0xf3e8cf, roughness: 0.82 });
const muscleFinish = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.30 });

function muscleTitle(id, geometry) {
  id = donorMuscleLabel(id, geometry);
  let label = id.replace(/_FJ\w+$/, '').replaceAll('_', ' ');
  if (!/(^| )(left|right)( |$)/i.test(label)) {
    const x = geometry.boundingBox.getCenter(new Vector3()).x;
    if (Math.abs(x) > 0.008) label = (x > 0 ? 'left ' : 'right ') + label;
  }
  if (/_FJ\w+$/.test(id)) label += ' (' + id.split('_').at(-1) + ')';
  return muscleDisplayName(geometry, label[0].toUpperCase() + label.slice(1));
}

function sourcePart(geometry, target, tissue) {
  const { matrix, joint } = target;
  const mesh = new Mesh(geometry, tissue.layer === 'skeleton' ? boneFinish : muscleFinish);
  mesh.name = tissue.name;
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.matrixWorld.copy(matrix);
  return {
    ...tissue,
    mesh, joint, sourceMatrix: matrix,
    bounds: geometry.boundingBox.clone().applyMatrix4(matrix),
    triangles: geometry.index.count / 3,
    sourceFile: geometry.userData.sourceFile,
    sourceNode: geometry.userData.sourceNode,
    sourcePart: geometry.userData.sourcePart, region: geometry.userData.region,
  };
}

function addMuscles(rig, parts, atlas) {
  const pose = sourcePose(rig);
  for (const [node, geometry] of atlas) {
    const adapted = geometry.userData.sourceAtlas?.endsWith('adapted from male atlas');
    const bind = geometry.userData.rigJoint;
    if (adapted && !rig[bind]) throw new Error('Unknown joint binding for adapted muscle ' + node);
    shadeSourceMuscle(geometry, node, adapted);
    const target = adapted ? { joint: bind, matrix: rig[bind].matrixWorld.clone() } : pose.muscle(node, geometry);
    parts.push(sourcePart(geometry, target, {
      name: geometry.userData.displayName ?? muscleTitle(node, geometry),
      layer: 'muscles', muscleNode: node, atlasNode: node,
      source: geometry.userData.sourceAtlas ?? 'BodyParts3D · DBCLS',
      sourceShape: adapted ? 'landmark-deformed' : 'unchanged',
    }));
  }
}

export async function prepareSourceAnatomy(name, tier, signal, { upperOnly = false, repairs = true, rawUpper = false } = {}) {
  const [scan, atlas] = await Promise.all([
    loadSkeletonScan(name, tier, signal),
    loadCharacterMuscles(name, tier, signal, upperOnly, rawUpper),
  ]);
  signal?.throwIfAborted();
  return (rig, parts) => {
    rig.root.updateMatrixWorld(true);
    const pose = sourcePose(rig);
    const bones = new Map();
    for (const [node, geometry] of scan) {
      const part = sourcePart(geometry, pose.bone(node, geometry), {
        name: scanPartName(node), layer: 'skeleton', scanNode: node, source: 'Visible Human CT · BoneHub',
      });
      parts.push(part);
      bones.set(node, part.mesh);
    }
    if (repairs) repairScanJoints(rig, parts, bones, fabricator(tier, rig.height, parts));
    addMuscles(rig, parts, atlas);
    return { bones };
  };
}

export async function prepareFemaleLowerLimbs(signal) {
  const atlas = await loadFemaleMuscles(signal);
  return (rig, parts) => addMuscles(rig, parts, atlas);
}
