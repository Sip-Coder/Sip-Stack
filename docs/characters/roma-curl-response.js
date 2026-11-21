// The part is asymmetric. Read each bank from the forehead around to the nape,
// followed by the shorter underlayer. Short free tips need more drive than
// long curls that already pick up the motion of a passing shoulder.
const shoulderCoupling = {
  right: [
    1.554, 0.356, 0.322, 1.293, 0.604, 0.986, 0.716, 0.573, 0.694, 0.516, 1.197, 1.28, 0.773, 0.676, 1.152,
    0.803, 1.084, 0.639, 0.893, 0.609, 1.323, 1.336, 0.992, 0.434, 0.988, 2.062, 1.264, 0.286, 0.745, 0.563,
    3.113, 1.002, 1.44, 0.684, 0.783, 1.917, 2.655, 1.141, 1.824, 0.764, 1.724, 2.217,
  ],
  left: [
    1.099, 0.93, 1.236, 0.874, 0.827, 0.877, 0.417, 0.706, 0.738, 0.919, 0.838, 0.697, 0.706, 1.464, 0.873,
    0.791, 0.624, 0.634, 1.08, 0.868, 1.412, 0.372, 0.366, 1.562, 1.455, 1.831, 0.988, 0.486, 1.426, 1.966,
    1.997, 2.475, 0.663, 1.659, 1.234, 2.356, 0.849, 1.861, 1.794, 0.96, 1.334, 2.381,
  ],
};

// The nape rests against the layered, moving hood. Its supported coils
// have different free lengths than the face-framing and crown regions.
const napeFlex = {
  right: {
    1: 0.104,
    17: 0.259,
    18: 1.054,
    19: 0.724,
    20: 1.061,
    21: 1.43,
    23: 0.516,
    24: 1.077,
    27: 1.743,
    30: 0.927,
    32: 1.7,
    36: 6.352,
    38: 3.15,
    39: 0.929,
    41: 0.915,
  },
  left: {
    1: 0.221,
    15: 0.457,
    17: 0.457,
    18: 0.639,
    19: 0.696,
    21: 0.042,
    23: 0.989,
    24: 1.108,
    25: 1.282,
    29: 1.461,
    30: 0.506,
    31: 0.975,
    35: 2.794,
    36: 1.935,
    37: 5.627,
    38: 3.15,
    39: 0.963,
    41: 1.508,
  },
};

// The inner layer rests over the front of each shoulder. At running speed it
// hangs toward vertical as the head pitches forward, and the side curtain
// folds against the neck. The small topmost coils absorb less of each impact.
function runningHold(side, index, coupling) {
  if (index === 0) return { pitch: 0, roll: 0, coupling: 0.65 };
  if (index === 32 || index === 33) return { pitch: -0.09, roll: -0.11 * side, coupling: 0.88 };
  // High-amplitude nape coils settle towards the hood at running speed.
  if (index >= 20 && index < 32 && coupling > 1.65) return { pitch: 0, roll: 0, coupling: 1.65 / coupling };
  if (index < 2 || index > 16) return;
  const wrap = index === 2 ? 0.45 : Math.min(1, (17 - index) / 4);
  return { pitch: 0, roll: -0.18 * side * wrap, coupling: 1 };
}

// Bundles against earring posts and the folds of the pack retain their tight
// terminal turn. A loaded curl slides as a unit while its root bends.
const retainedTurns = {
  right: new Set([3, 4, 21, 22, 24, 25, 26, 31, 33, 34, 35, 39]),
  left: new Set([3, 7, 14, 20, 24, 25, 26, 32, 34, 39]),
};

const fittedTurns = {
  right: new Set([4, 21, 22, 24, 25, 31, 39]),
  left: new Set([20, 24, 25, 39]),
};

export function curlResponse(side, index, face) {
  const bank = side < 0 ? 'right' : 'left';
  // The shorter face locks and the springy nape layer bend more under a breath.
  const breathFlex = napeFlex[bank][index] ?? (face ? 0.98 : index >= 34 && index <= 38 ? 0.9 : 0.83);
  const coupling = (face ? 1.06 : 1.02) * shoulderCoupling[bank][index];
  return {
    retainTurn: retainedTurns[bank].has(index),
    fittedTurn: fittedTurns[bank].has(index),
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
    const chain = system.chains[i];
    if (strands[i].retainTurn) chain.freeNodes = chain.rest.map((node) => node.clone());
    if (strands[i].fittedTurn) chain.supportedRest = chain.rest.map((node) => node.clone());
    const hold = strands[i].runningHold;
    if (!hold) continue;
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
