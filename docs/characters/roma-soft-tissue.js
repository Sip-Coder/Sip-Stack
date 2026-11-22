// The donor hip and thorax establish the frame. The tissue is a separate
// original surface over that frame, with thin margins under the skin.
import * as T from 'three';

const profile = [
  ['Breast tissue', 'chest', 0.046, 0.094, 0.064, 0.044, 0.055, 0.020, '#b77a65'],
  ['Breast fat pad', 'chest', 0.051, 0.091, 0.072, 0.048, 0.048, 0.018, '#d7ae70'],
  ['Gluteal fat pad', 'hips', 0.051, 0.006, -0.062, 0.056, 0.053, 0.039, '#d1aa69'],
  ['Hip and upper thigh fat', 'thigh', 0.022, -0.049, -0.012, 0.036, 0.078, 0.050, '#d7b372'],
];

export function romaSoftTissue(rig) {
  const { joints } = rig.anatomy;
  const regions = [];
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    for (const [name, joint, x, y, z, rx, ry, rz, colour] of profile) {
      const key = joint === 'thigh' ? joint + side : joint;
      const pivot = joints[key];
      const center = new T.Vector3(pivot.x + sign * x, pivot.y + y, pivot.z + z);
      const label = (side === 'L' ? 'Left ' : 'Right ') + name.toLowerCase();
      // Convert width and depth to a tapered superficial lobule. Let the upper
      // edge of the breast flatten into the pectoral fascia and maintain a
      // distinguishable fatty layer toward the lower and lateral aspect.
      const vertices = (phi, theta, result) => {
        const sin = Math.sin(phi), h = Math.cos(phi);
        const longitude = Math.sin(theta);
        const lobe = name.startsWith('Breast') ? 1 - 0.32 * Math.max(0, h) : 1 - 0.09 * h;
        return result.set(
          center.x + sin * Math.cos(theta) * rx * (1 + 0.11 * h),
          center.y + h * ry,
          center.z + sin * longitude * rz * lobe,
        );
      };
      regions.push({ key, label, colour, vertices });
    }
  }
  return regions;
}

export function addRomaFat(rig) {
  const p = new T.Vector3();
  for (const { key, label, colour, vertices } of romaSoftTissue(rig)) {
    const geometry = new T.SphereGeometry(1, 20, 14);
    const a = geometry.attributes.position;
    const pivot = rig.anatomy.joints[key];
    for (let i = 0; i < a.count; i++) {
      p.fromBufferAttribute(a, i);
      const phi = Math.acos(T.MathUtils.clamp(p.y, -1, 1)), theta = Math.atan2(p.z, p.x);
      vertices(phi, theta, p).sub(pivot);
      a.setXYZ(i, p.x, p.y, p.z);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new T.MeshStandardMaterial({ color: colour, roughness: 0.57 });
    const part = new T.Mesh(geometry, material);
    part.name = label;
    part.userData.anatomicalFat = label;
    part.userData.studyOnly = true;
    part.visible = false;
    rig[key].add(part);
  }
}
