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

export function curlResponse(side, index, face) {
  const bank = side < 0 ? 'right' : 'left';
  return {
    gaitCoupling: (face ? 1.06 : 1.02) * shoulderCoupling[bank][index],
    breathingBend: (face ? 0.016 : 0.019) * (breathingFlex[bank][index] ?? 1),
    // This narrow forehead coil rests against the right sleeve at full stride.
    maxOffset: side < 0 && index === 1 ? 0.0081 : face ? 0.045 : 0.039,
  };
}
