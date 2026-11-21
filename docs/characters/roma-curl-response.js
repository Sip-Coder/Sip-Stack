// The part is asymmetric. Read each bank from the forehead around to the nape,
// followed by the shorter underlayer. Short free tips need more drive than
// long curls that already pick up the motion of a passing shoulder.
const shoulderCoupling = {
  right: [
    1.554, 1.514, 0.849, 1.034, 0.604, 0.986, 0.716, 0.573,
    0.694, 0.516, 1.197, 1.28, 0.773, 0.676, 0.826, 0.803,
    1.084, 0.839, 0.649, 1.107, 2.018, 2.173, 1.359, 1.559,
    1.641, 2.041, 1.663, 0.66, 0.628, 0.642, 3.113, 2.782,
    0.875, 0.547, 1.91, 2.555, 1.953, 1.141, 0.958, 1.39,
    1.182, 3.514,
  ],
  left: [
    1.099, 0.93, 1.236, 0.874, 0.827, 0.877, 0.417, 0.706,
    0.738, 0.919, 0.838, 0.697, 0.706, 1.464, 0.873, 0.791,
    0.559, 0.82, 1.24, 1.403, 1.448, 0.981, 2.135, 2.367,
    1.673, 1.749, 0.803, 0.486, 1.089, 1.036, 1.907, 1.83,
    0.526, 1.052, 2.519, 2.356, 1.359, 0.772, 1.304, 1.874,
    0.653, 1.894,
  ],
};

// The nape rests against the layered, moving hood. Its supported coils
// have different free lengths than the face-framing and crown regions.
const napeFlex = {
  right: {19: 2.075, 20: 1.536, 21: 2.851, 22: 1.744, 23: 1.777, 24: 3.336, 25: 3.44, 26: 1.609, 29: 0.514, 34: 1.098, 35: 1.406, 39: 3.344},
  left: {20: 1.984, 22: 3.333, 23: 3.767, 24: 3.431, 25: 3.419, 31: 3.015, 34: 1.476, 35: 1.368, 36: 1.512, 39: 2.231},
};

// The inner layer rests over the front of each shoulder. At running speed it
// hangs toward vertical as the head pitches forward, and the side curtain
// folds against the neck. The small topmost coils absorb less of each impact.
function runningHold(side, index, coupling) {
  if (index === 0) return { pitch: 0, roll: 0, coupling: 0.65 };
  if (index === 32 || index === 33) return { pitch: -0.09, roll: -0.11 * side, coupling: 0.88 };
  // High-amplitude nape coils settle towards the hood at running speed.
  if (index >= 20 && index < 32 && coupling > 1.65)
    return { pitch: 0, roll: 0, coupling: 1.65 / coupling };
  if (index < 2 || index > 16) return;
  const wrap = index === 2 ? 0.45 : Math.min(1, (17 - index) / 4);
  return { pitch: 0, roll: -0.18 * side * wrap, coupling: 1 };
}

export function curlResponse(side, index, face) {
  const bank = side < 0 ? 'right' : 'left';
  // The shorter face locks and the springy nape layer bend more under a breath.
  const breathFlex = napeFlex[bank][index] ?? (face ? 0.98 : index >= 34 && index <= 38 ? 0.90 : 0.83);
  const coupling = (face ? 1.06 : 1.02) * shoulderCoupling[bank][index];
  return {
    runningHold: runningHold(side, index, coupling),
    gaitCoupling: coupling,
    breathingBend: (face ? 0.016 : 0.019) * breathFlex,
    // This narrow forehead coil rests against the right sleeve at full stride.
    maxOffset: side < 0 && index === 1 ? 0.013 : face ? 0.045 : 0.039,
  };
}

export function bindRunningHold(system, strands) {
  const held = [];
  for (let i = 0; i < strands.length; i++) {
    const hold = strands[i].runningHold;
    if (!hold) continue;
    const chain = system.chains[i];
    held.push({ chain, gaitGain: chain.gaitGain, ...hold });
  }
  const simulate = system.step;
  system.step = (frame) => {
    const t = Math.max(0, Math.min(1, ((frame.speed ?? 0) - 1.13) / (3.89 - 1.13)));
    const fraction = t * t * (3 - 2 * t);
    for (const curl of held) {
      const chain = curl.chain;
      chain.group.rotation.x = curl.pitch * fraction;
      chain.group.rotation.z = curl.roll * fraction;
      chain.gaitGain = curl.gaitGain * (1 + fraction * (curl.coupling - 1));
    }
    simulate(frame);
  };
}
