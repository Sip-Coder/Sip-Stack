// Preserve the individual scanned vertebrae as rigid cortical bodies in the
// bending waist. The posterior processes need space inside Roma's short torso
// when her chest rotates over the hips. The shoulder opening also narrows just
// above the first rib. Use the actual posed skin to solve a whole-bone offset.
import { Vector3 } from 'three';

export function seatAxialCortex(fitted, torsoSkin, roma) {
  const point = new Vector3(),
    before = new Vector3(),
    largest = new Vector3();
  for (const [name, geometry] of fitted) {
    const bone = roma ? /^VERTEBRA_L[1-6]$|^RIB_1_(LEFT|RIGHT)$/ : /^VERTEBRA_C[67]$/;
    if (!bone.test(name)) continue;
    const positions = geometry.attributes.position,
      offset = new Vector3();
    for (let iteration = 0; iteration < 3; iteration++) {
      largest.set(0, 0, 0);
      for (let i = 0; i < positions.count; i++) {
        before.fromBufferAttribute(positions, i).add(offset);
        const shift = torsoSkin(point.copy(before)).sub(before);
        if (shift.lengthSq() > largest.lengthSq()) largest.copy(shift);
      }
      if (largest.lengthSq() < 0.00005 ** 2) break;
      offset.add(largest);
    }
    // Keep the first rib in its costovertebral articulation. Its upper edge
    // has only a thin tissue cover at the neck-to-shoulder transition.
    if (name.startsWith('RIB_1_')) offset.clampLength(0, 0.002);
    if (offset.lengthSq() > 0) geometry.translate(offset.x, offset.y, offset.z);
  }
}
