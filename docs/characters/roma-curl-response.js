// The part is asymmetric. Read each bank from the forehead around to the nape,
// followed by the shorter underlayer. Short free tips need more drive than
// long curls that already pick up the motion of a passing shoulder.
const shoulderCoupling = {
  right: [
    1.554, 0.356, 0.322, 1.293, 0.604, 0.986, 0.716, 0.573,
    0.694, 0.516, 1.197, 1.28, 0.773, 0.676, 1.152, 0.803,
    1.084, 0.639, 1.44, 0.609, 1.323, 0.217, 0.992, 0.347,
    0.471, 1.08, 1.264, 0.112, 0.745, 0.563, 3.113, 1.759,
    1.44, 0.684, 0.783, 1.917, 1.953, 1.141, 1.824, 1.39,
    1.724, 2.217,
  ],
  left: [
    1.099, 0.93, 1.236, 0.874, 0.827, 0.877, 0.417, 0.706,
    0.738, 0.919, 0.838, 0.697, 0.706, 1.464, 0.873, 0.791,
    0.624, 1.408, 1.08, 0.868, 0.109, 0.372, 0.366, 2.367,
    1.673, 1.189, 0.988, 0.486, 1.426, 2.693, 1.997, 1.904,
    0.663, 1.659, 1.234, 2.356, 0.849, 1.861, 1.794, 0.32,
    1.334, 2.381,
  ],
};

// The nape rests against the layered, moving hood. Its supported coils
// have different free lengths than the face-framing and crown regions.
const napeFlex = {
  right: {1: 0.104, 17: 0.259, 18: 1.817, 19: 0.724, 20: 1.061, 21: 0.143, 23: 0.089, 24: 0.291, 30: 0.927, 31: 0.511, 32: 1.7, 36: 7.473, 38: 3.15, 39: 1.475, 41: 0.915},
  left: {1: 0.221, 18: 0.639, 19: 0.696, 20: 0.675, 21: 0.042, 23: 1.318, 24: 0.652, 25: 0.957, 30: 0.506, 31: 1.839, 35: 2.794, 36: 1.935, 37: 5.627, 38: 3.15, 39: 0.112, 41: 1.508},
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

// Bundles against earring posts and the folds of the pack retain their tight
// terminal turn. A loaded curl slides as a unit while its root bends.
const retainedTurns = {
  right: new Set([3, 4, 22, 26, 33, 34, 35]),
  left: new Set([3, 7, 14, 25, 26, 32, 34]),
};

export function curlResponse(side, index, face) {
  const bank = side < 0 ? 'right' : 'left';
  // The shorter face locks and the springy nape layer bend more under a breath.
  const breathFlex = napeFlex[bank][index] ?? (face ? 0.98 : index >= 34 && index <= 38 ? 0.90 : 0.83);
  const coupling = (face ? 1.06 : 1.02) * shoulderCoupling[bank][index];
  return {
    retainTurn: retainedTurns[bank].has(index),
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
