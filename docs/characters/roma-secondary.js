// The six hair sections and the saddlebag follow their independent pivots.
import * as T from 'three';

const { clamp } = T.MathUtils;

export function createSecondary(rig, { waves, bag }) {
  let sideBend = 0,
    sideVelocity = 0,
    pitch = 0,
    pitchVelocity = 0,
    previousSpeed = 0;
  return (f) => {
    const drive = Math.min(1, f.speed / 3.5);
    bag.rotation.x = 0.035 + 0.13 * drive * Math.sin(f.phase - 0.4) + 0.036 * T.MathUtils.clamp(f.vy, -2, 2);
    bag.position.z = -0.028 - 0.024 * drive;
    const dt = clamp(f.dt, 0, 0.04),
      speed = f.speed;
    if (f.time <= dt) {
      sideBend = sideVelocity = pitch = pitchVelocity = 0;
      previousSpeed = speed;
    }
    const accel = clamp((speed - previousSpeed) / Math.max(dt, 0.001), -7, 7);
    previousSpeed = speed;
    const pace = Math.min(speed / 3.8, 1);
    const targetSide =
      0.049 * pace * Math.sin(f.phase) - 0.071 * clamp(f.turn, -1, 1) + 0.008 * Math.sin(f.time * 1.34);
    const targetPitch = 0.036 * pace * Math.cos(2 * f.phase) + 0.009 * accel - 0.009 * clamp(f.vy, -3, 3);
    sideVelocity += (132 * (targetSide - sideBend) - 19 * sideVelocity) * dt;
    pitchVelocity += (114 * (targetPitch - pitch) - 18 * pitchVelocity) * dt;
    sideBend = clamp(sideBend + sideVelocity * dt, -0.13, 0.13);
    pitch = clamp(pitch + pitchVelocity * dt, -0.11, 0.11);
    for (let i = 0; i < waves.length; i++) {
      const bank = i % 3,
        side = i < 3 ? -1 : 1,
        freedom = 1 - bank * 0.1;
      waves[i].rotation.set(pitch * freedom, side * pitch * 0.19, sideBend * freedom + side * pitch * 0.22);
    }
  };
}
