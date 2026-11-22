// Springs for Sippy's strategic locks, split vest hem and carried field gear.
import { createHairMotion } from './hair-motion.js';

export function createSecondary(rig, { groom, tails, pack, drawcord }) {
  const followGroom = createHairMotion(rig, groom);
  const packY = pack.position.y;
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
    pack.position.y = packY + 0.0041 * pace * Math.sin(f.phase * 2 - 0.38);
    drawcord.rotation.z = lag * 0.31 + 0.035 * pace * Math.sin(f.phase - 0.32);
    drawcord.rotation.x = -0.7 * lag;
    followGroom(f);
  };
}
