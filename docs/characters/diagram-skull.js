// Craniofacial landmarks are expressed in the same local frame as the live
// face. +Z is anterior. Each style has its own vault, orbits and jaw.
import { v } from './diagram-fabricator.js';

export function headLandmarks(rig, roma) {
  const frame = rig.root.getObjectByName(roma ? 'face and band' : 'sippy-head');
  const width = roma ? 0.063 : 0.055,
    height = roma ? 0.143 : 0.12,
    depth = roma ? 0.05 : 0.046;
  const originY = roma ? 0.005 : 0.0055,
    originZ = roma ? 0.0045 : -0.001;
  const coordinates = (x, y, z) => v(x * width, originY + y * height, originZ + z * depth);
  const place = (x, y, z) => coordinates(x, y, z).applyMatrix4(frame.matrixWorld);
  const atlas = [0, 0.238, -0.23];
  // Rest location of the articular plane for the upper cervical spine, in
  // chest space. The animator raises Sippy's resting head above the raw rig.
  const atlasChestLocal = coordinates(...atlas)
    .applyMatrix4(frame.matrix)
    .multiply(rig.head.scale)
    .add(v(rig.head.position.x, roma ? 0.22 : 0.24, rig.head.position.z));
  // Neutral globe centres beneath the animated lids, expressed in the
  // artwork's head frame. Socket and eye keep their own depth planes.
  const eye = roma ? 0.511 : 0.619;
  const sides = {};
  for (const [id, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const p = (x, y, z) => place(s * x, y, z);
    p.mirrored = s < 0;
    sides[id] = {
      p,
      condyle: p(0.153, atlas[1], atlas[2]),
      mastoid: p(roma ? 0.655 : 0.693, roma ? 0.353 : 0.306, -0.375),
      temporalFossa: p(0.852, 0.7, -0.115),
      coronoid: p(roma ? 0.624 : 0.663, 0.487, 0.068),
      zygoma: p(0.803, eye - 0.065, 0.405),
      gonion: p(roma ? 0.66 : 0.707, roma ? 0.2 : 0.199, -0.162),
      mouth: p(roma ? 0.345 : 0.364, roma ? 0.244 : 0.231, roma ? 0.79 : 0.755),
    };
  }
  return {
    place,
    sides,
    eye,
    atlas: place(...atlas),
    atlasChestLocal,
    occiput: place(0, roma ? 0.455 : 0.457, roma ? -0.917 : -0.942),
  };
}
