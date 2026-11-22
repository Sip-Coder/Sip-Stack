// Roma's head-local hair chains and saddlebag respond independently.
import * as T from 'three';
import { createHairMotion } from './hair-motion.js';

export function createSecondary(rig, { groom, bag }) {
  const followGroom = createHairMotion(rig, groom);
  return (f) => {
    const drive = Math.min(1, f.speed / 3.5);
    bag.rotation.x = 0.035 + 0.13 * drive * Math.sin(f.phase - 0.4) + 0.036 * T.MathUtils.clamp(f.vy, -2, 2);
    bag.position.z = -0.028 - 0.024 * drive;
    followGroom(f);
  };
}
