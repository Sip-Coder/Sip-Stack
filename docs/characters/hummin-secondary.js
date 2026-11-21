// Load the joint-driven leather, scarf and service gear on the first action.
import * as T from 'three';
import { fitMovingApron } from './hummin-cloth.js';

function scarfMotion(rig, { tail, collar }) {
  let swing = 0,
    velocity = 0,
    lastTime = -1;
  function step(frame, accel, jolt) {
    if (frame.time <= lastTime) swing = velocity = 0;
    lastTime = frame.time;
    const drive = T.MathUtils.clamp(
      0.006 * accel +
        0.003 * jolt +
        0.06 * frame.turn +
        0.045 * Math.sin(frame.phase) * Math.min(1, frame.speed / 3.9),
      -0.16,
      0.16,
    );
    velocity += ((drive - swing) * 88 - velocity * 13) * frame.dt;
    swing += velocity * frame.dt;
    tail.rotation.z = swing * 0.26;
    const knee = Math.max(-rig.thighL.rotation.x, -rig.thighR.rotation.x, 0);
    const raisedKnee = T.MathUtils.smoothstep(knee, 0.52, 1.3);
    // The knit bunches over the bent thigh instead of dragging through the knee bearing.
    tail.scale.y = 1 - 0.36 * raisedKnee;
    tail.position.z =
      0.083 + 0.008 * raisedKnee + (frame.emote >= 0 ? 0.008 * Math.sin(Math.PI * frame.emote) ** 2 : 0);
    tail.rotation.x =
      -0.06 -
      Math.abs(swing) * 0.77 -
      0.28 * raisedKnee -
      0.49 * T.MathUtils.smoothstep(rig.chest.rotation.x, 0.14, 0.38);
    const raised = Math.max(Math.abs(rig.upperArmL.rotation.z), Math.abs(rig.upperArmR.rotation.z));
    collar.position.y = 0.001 * raisedKnee - 0.002 * T.MathUtils.smoothstep(raised, 1.4, 2.5);
    collar.scale.z = 1 + 0.11 * raisedKnee;
    collar.morphTargetInfluences[0] = Math.max(
      raisedKnee,
      T.MathUtils.smoothstep(raised, 1.4, 2.5),
      T.MathUtils.smoothstep(rig.chest.rotation.x, 0.14, 0.31),
    );
    collar.scale.x =
      1 - 0.42 * T.MathUtils.smoothstep(raised, 1.4, 2.5) - 0.09 * T.MathUtils.smoothstep(knee, 0.8, 1.4);
  }
  return step;
}

export function createSecondary(rig, { apron, gear, neckwear, antenna, tools }) {
  const dress = fitMovingApron(rig, apron, gear);
  const scarf = scarfMotion(rig, neckwear);
  const { flaps } = apron;
  let toolAngle = 0,
    toolVelocity = 0,
    mastAngle = 0,
    mastVelocity = 0,
    lastSpeed = 0,
    lastVy = 0;
  let springL = 0,
    velocityL = 0,
    springR = 0,
    velocityR = 0;
  let lastTime = -1;
  return frame => {
    const { dt, speed } = frame;
    if (frame.time <= lastTime) {
      springL = springR = -0.09;
      velocityL = velocityR = toolVelocity = mastVelocity = toolAngle = mastAngle = 0;
      lastSpeed = speed;
      lastVy = frame.vy;
    }
    lastTime = frame.time;
    // Stowage and service antenna are driven by the same root impulses as the
    // apron. Each has its own restoring torque and damping at the fixed step.
    const accel = dt > 0 ? T.MathUtils.clamp((speed - lastSpeed) / dt, -20, 20) : 0;
    const jolt = dt > 0 ? T.MathUtils.clamp((frame.vy - lastVy) / dt, -22, 22) : 0;
    lastSpeed = speed;
    lastVy = frame.vy;
    const stride = Math.sin((frame.phase ?? 0) * 2) * Math.min(1, speed / 3.9);
    const mastTarget = T.MathUtils.clamp(
      -0.014 * accel - 0.008 * jolt + 0.15 * stride + 0.052 * frame.turn,
      -0.48,
      0.48,
    );
    const toolTarget = T.MathUtils.clamp(
      0.008 * accel + 0.005 * jolt - 0.13 * stride - 0.025 * frame.turn,
      -0.35,
      0.35,
    );
    mastVelocity += ((mastTarget - mastAngle) * 120 - 11 * mastVelocity) * dt;
    toolVelocity += ((toolTarget - toolAngle) * 105 - 13 * toolVelocity) * dt;
    mastAngle += mastVelocity * dt;
    toolAngle += toolVelocity * dt;
    antenna.rotation.x = mastAngle;
    tools.rotation.z = toolAngle;
    const tug = Math.min(0.26, Math.abs(frame.vy) * 0.045) + speed * 0.02;
    const aimL = Math.max(-0.84, Math.min(0, rig.thighL.rotation.x) * 0.58 - 0.09 - tug);
    const aimR = Math.max(-0.84, Math.min(0, rig.thighR.rotation.x) * 0.58 - 0.09 - tug);
    velocityL += ((aimL - springL) * 160 - velocityL * 20) * dt;
    velocityR += ((aimR - springR) * 160 - velocityR * 20) * dt;
    springL += velocityL * dt;
    springR += velocityR * dt;
    flaps[0].rotation.set(Math.min(springL, aimL + 0.065, springR, aimR + 0.065), 0, 0);
    dress(frame);
    scarf(frame, accel, jolt);
  };
}
