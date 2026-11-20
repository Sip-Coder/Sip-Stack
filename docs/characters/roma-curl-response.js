// The part is asymmetric. Read each bank from the forehead around to the nape,
// followed by the shorter underlayer. Short free tips need more drive than
// long curls that already pick up the motion of a passing shoulder.
const shoulderCoupling = {
  right: [
    5, 0.2, 1.6, 0.2,
    1, 1, 0.5, 1, 1, 0.25, 1.95, 2.1, 1, 1, 1.35, 1.55, 2, 2.45, 1, 1.95,
    2.95, 2.05, 1, 1, 1, 2.35, 2, 1.6, 1, 1, 2.3, 1.85,
    2.3, 1, 1, 3.1, 2.5, 2.25, 2.35, 1, 2.05, 2.3,
  ],
  left: [
    4.15, 2, 2.65, 1,
    1, 0.5, 0.25, 0.2, 1, 1.8, 1, 1, 1, 3.1, 1.75, 1, 1, 1, 2.65, 2.25,
    1, 1, 1, 2.4, 1, 1.75, 1.5, 1, 1.95, 1.95, 1.6, 1,
    1.15, 2.55, 2.55, 2.65, 2.15, 2.3, 2.8, 2.25, 1, 1.5,
  ],
};

// Most curls share the same breathing flex. These shorter or supported coils
// have different exposed lengths and take a correspondingly different bend.
const breathingFlex = {
  right: { 3: 0.35, 17: 2.1, 19: 2.05, 35: 1.65, 37: 2.8, 38: 2.2 },
  left: { 36: 2.2, 37: 2.1, 38: 2.5 },
};

// The inner layer rests over the front of each shoulder. At running speed it
// hangs toward vertical as the head pitches forward, and the side curtain
// folds against the neck. The small topmost coils absorb less of each impact.
function runningHold(side, index) {
  if (index === 0) return { pitch: 0, roll: 0, coupling: 0.65 };
  if (index === 32 || index === 33) return { pitch: -0.09, roll: -0.11 * side, coupling: 0.88 };
  if (index < 2 || index > 16) return;
  const wrap = index === 2 ? 0.45 : Math.min(1, (17 - index) / 4);
  return { pitch: 0, roll: -0.18 * side * wrap, coupling: 1 };
}

export function curlResponse(side, index, face) {
  const bank = side < 0 ? 'right' : 'left';
  return {
    runningHold: runningHold(side, index),
    gaitCoupling: (face ? 1.06 : 1.02) * shoulderCoupling[bank][index],
    breathingBend: (face ? 0.016 : 0.019) * (breathingFlex[bank][index] ?? 1),
    // This narrow forehead coil rests against the right sleeve at full stride.
    maxOffset: side < 0 && index === 1 ? 0.0081 : face ? 0.045 : 0.039,
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
