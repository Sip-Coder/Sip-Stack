// Actor meshes use units of standing height. Human joint offsets come from
// the canonical BoneHub rig. Hummin's articulated chassis is authored here.
import * as T from 'three';
import { createSourceRig } from './source-rig.js';

export function createActor(name, height) {
  const root = new T.Group();
  root.name = name;
  root.scale.setScalar(height);
  const anatomy = createSourceRig(name);
  const rig = { name, height, root, joints: [] };
  if (anatomy) rig.anatomy = anatomy;
  function joint(key, parent, x, y, z = 0) {
    const node = new T.Group();
    node.name = key;
    if (anatomy) {
      node.position.copy(anatomy.joints[key]);
      if (parent !== root) node.position.sub(anatomy.joints[parent.name]);
    } else {
      node.position.set(x, y, z);
    }
    parent.add(node);
    rig[key] = node;
    rig.joints.push(node);
    return node;
  }
  const hips = joint('hips', root, 0, 0.52);
  const chest = joint('chest', hips, 0, 0.12);
  joint('head', chest, 0, 0.203);
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    const arm = joint('upperArm' + side, chest, sign * 0.117, 0.145);
    const elbow = joint('forearm' + side, arm, 0, -0.176);
    joint('hand' + side, elbow, 0, -0.143);
    const thigh = joint('thigh' + side, hips, sign * 0.065, 0);
    const shin = joint('shin' + side, thigh, 0, -0.245);
    joint('foot' + side, shin, 0, -0.228);
  }
  return rig;
}
