// Springs for Sippy's swept locks, split vest hem and carried field gear.
import * as T from 'three';

function quiffMotion(groups) {
  const banks = groups.map(({ root, id, side }) => ({
    root, amplitude: id < 3 ? 0.87 : 0.60, phase: id * 0.42, side,
  }));
  let pitch = 0, roll = 0, pitchV = 0, rollV = 0, last = -Infinity;
  return (f) => {
    if (f.time <= last) pitch = roll = pitchV = rollV = 0;
    last = f.time;
    const walk = Math.min(1, f.speed / 2.5), dt = f.dt;
    const target = 0.09 * walk * Math.sin(2*f.phase) + 0.023 * Math.sin(f.time*1.23)
      + 0.019 * T.MathUtils.clamp(f.vy, -3, 3);
    pitchV += (95 * (target - pitch) - 10 * pitchV) * dt;
    rollV += (80 * (T.MathUtils.clamp(f.turn * -0.018, -0.13, 0.13) - roll) - 11 * rollV) * dt;
    pitch += pitchV * dt;
    roll += rollV * dt;
    for (const bank of banks) {
      bank.root.rotation.x = bank.amplitude * (pitch + 0.014 * walk * Math.sin(2*f.phase - bank.phase));
      bank.root.rotation.z = bank.amplitude * (roll + bank.side * 0.15 * pitch);
    }
  };
}

export function createSecondary(rig, { banks, tails, pack, drawcord }) {
  const followGroom = quiffMotion(banks);
  let lag = 0,
    lagV = 0,
    lastTime = -Infinity;
  return f => {
    const { dt, time } = f;
    if (time <= lastTime) lag = lagV = 0;
    lastTime = time;
    const target =
      Math.min(0.35, f.speed * 0.035 + Math.abs(f.vy) * 0.026) +
      0.025 * Math.sin(f.phase * 2) * Math.min(1, f.speed);
    lagV += dt * (65 * (target - lag) - 10 * lagV);
    lag += lagV * dt;
    tails[0].rotation.x = lag + 0.02 * Math.sin(f.phase);
    tails[1].rotation.x = lag - 0.02 * Math.sin(f.phase);
    const pace = Math.min(1, f.speed / 4);
    pack.rotation.x = 0.18 * lag + 0.012 * pace * Math.sin(f.phase * 2);
    pack.rotation.z = 0.018 * Math.tanh(f.turn * 0.3);
    pack.position.y = 0.072 + 0.0041 * pace * Math.sin(f.phase * 2 - 0.38);
    drawcord.rotation.z = lag * 0.31 + 0.035 * pace * Math.sin(f.phase - 0.32);
    drawcord.rotation.x = -0.7 * lag;
    followGroom(f);
  };
}
