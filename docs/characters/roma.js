// Roma's explorer clothing is cut in her bind pose. A single GPU-skinned mesh
// joins the sleeves and joggers through the bending joints; accessories ride
// their anatomical carriers and all colours are batched at construction.
import * as T from 'three';
import { secondaryMotion } from './secondary.js';
import { romaForms } from './roma-forms.js';
import { buildExplorerFace } from './explorer-face.js';
import { faceShell, skullLandmarks } from './roma-face-shell.js';
import { addExteriorShell, attachExteriorProfile, exteriorSkinWeights, hipExteriorPoint, explorerLimb, explorerTorso, sampleExterior, sneakerRoom, torsoStation } from './human-exterior.js';
import { romaExterior } from './roma-exterior-data.js';
import { buildExplorerHands } from './human-hands.js';
import { handProfiles } from './roma-hand-data.js';
import { addRomaFat } from './roma-soft-tissue.js';

const tau = 2 * Math.PI;
const c = {
  skin: '#bb8663',
  cream: '#eee1cd',
  white: '#fff2da',
  mustard: '#c19543',
  edge: '#aa7d38',
  thread: '#ddbd81',
  pants: '#285b51',
  cuff: '#49766a',
  crease: '#315f55',
  purple: '#65445f',
  sole: '#dfd2bd',
  leather: '#855932',
  dark: '#69452f',
  brass: '#b18e53',
  gold: '#dbb05b',
};
function clothes(rig, h) {
  const { loft, face: surface, thread, oval, ring, group } = h;
  const { chest, hips } = rig;
  const torsoGrade = ([x, y, z], ease) => explorerTorso(rig,
    [x, y + 0.044 * (1 - T.MathUtils.smoothstep(y, 0.49, 0.635)), z], ease, 0.49, 0.758);
  const hipOrigin = rig.anatomy.joints.hips;
  const hipGrade = (ease) => ([x, y, z]) => {
    const a = Math.atan2(x, z), hem = 1 - T.MathUtils.smoothstep(y, -0.051, 0.019);
    const rise = y + (0.01 * Math.abs(Math.sin(a)) - 0.004 * Math.max(0, -Math.cos(a))) * hem;
    return hipExteriorPoint(rig, hipOrigin.y + rise, a, ease + 0.0028 * hem)
      .map((value, i) => value - hipOrigin.getComponent(i));
  };
  const refine = rows => {
    const refined = [];
    for (const [i, row] of rows.entries()) {
      refined.push(row);
      const next = rows[i + 1];
      if (!next) continue;
      refined.push(row.map((value, k) => k < 5 ? (value + next[k]) * 0.5 : value));
    }
    return refined;
  };
  const skinLoft = (region, rows, color, options) => {
    loft(null, refine(rows), color, {
      columns: 24,
      skinned: true,
      ...options,
      bind([, y]) {
        const [upper, lower, fraction] = exteriorSkinWeights(rig, region, y);
        return [rig[lower], rig[upper], fraction];
      },
    });
  };
  const trunk = [
    [0.49, 0.085, 0.058, 0.0, 0, c.edge, hips, chest, 0.15],
    [0.505, 0.089, 0.061, 0.0, 0, c.mustard, hips, chest, 0.3],
    [0.548, 0.087, 0.062, 0.002, 0, c.mustard, hips, chest, 0.61],
    [0.603, 0.084, 0.06, 0.004, 0, c.mustard, chest],
    [0.666, 0.095, 0.068, 0.004, 0, c.mustard, chest],
    [0.708, 0.109, 0.069, 0.001, 0, c.mustard, chest],
    [0.742, 0.119, 0.056, -0.002, 0, c.mustard, chest],
    [0.766, 0.099, 0.049, -0.003, 0, c.mustard, chest],
    [0.775, 0.062, 0.037, -0.002, 0, c.mustard, chest],
  ];
  skinLoft('torso', trunk, c.mustard, { from: 0.36, to: tau - 0.36, columns: 32, transform: (p) => torsoGrade(p, 0.0088) });
  skinLoft(
    'torso',
    trunk.map((row) => [
      row[0] + 0.0012,
      row[1] - 0.005,
      row[2] - 0.007,
      row[3],
      0,
      c.cream,
      ...row.slice(6),
    ]),
    c.cream,
    { columns: 28, transform: (p) => torsoGrade(p, 0.0044) },
  );
  // Rolled hood with a front notch, two overlapping lobes and a back fall.
  surface(chest, 32, 8, (u, v) => {
    const mouth = 0.33 + 0.14 * v,
      a = mouth + u * (tau - 2 * mouth);
    const front = Math.max(0, Math.cos(a)),
      rear = Math.max(0, -Math.cos(a)),
      side = Math.sin(a) ** 2;
    const fold = Math.sin(Math.PI * v);
    const radius = T.MathUtils.lerp(0.037, 0.084 + side * 0.008, v) + 0.009 * fold;
    const y =
      0.178 -
      0.041 * v -
      0.038 * rear * v -
      0.026 * front * front * v +
      0.011 * side +
      0.012 * fold +
      0.003 * Math.sin(2 * a + 0.27);
    return [
      Math.sin(a) * radius,
      y,
      0.002 + Math.cos(a) * radius * (0.92 + 0.1 * rear),
      v < 0.16 ? '#ddcbb1' : v > 0.87 ? '#dbc8b0' : c.cream,
    ];
  });
  for (const s of [-1, 1]) {
    thread(
      chest,
      c.cream,
      [
        [s * 0.021, 0.139, 0.051],
        [s * 0.023, 0.114, 0.059],
        [s * 0.022, 0.085, 0.067],
        [s * 0.019, 0.065, 0.069],
      ],
      0.00145,
      { sides: 4 },
    );
    oval(chest, c.brass, s * 0.019, 0.061, 0.069, 0.0017, 0.0041, 0.00175, 0, 0, 0, true, 10);
    const b = rig[s === 1 ? 'upperArmL' : 'upperArmR'],
      e = rig[s === 1 ? 'forearmL' : 'forearmR'];
    const side = s > 0 ? 'L' : 'R';
    const limb = [
      [0.452, 0.026, 0.025, 0, 0.132, c.edge, e],
      [0.459, 0.029, 0.027, 0, 0.132, c.mustard, e],
      [0.474, 0.028, 0.028, 0.001, 0.133, c.mustard, e],
      [0.495, 0.031, 0.03, 0.001, 0.134, c.mustard, e],
      [0.539, 0.032, 0.032, -0.001, 0.134, c.mustard, e],
      [0.566, 0.032, 0.029, 0, 0.132, c.mustard, e, b, 0.08],
      [0.584, 0.033, 0.032, -0.002, 0.131, c.mustard, e, b, 0.27],
      [0.601, 0.033, 0.032, 0, 0.131, c.mustard, b, e, 0.4],
      [0.62, 0.035, 0.033, 0.002, 0.13, c.mustard, b, e, 0.16],
      [0.675, 0.035, 0.036, 0, 0.128, c.mustard, b],
      [0.721, 0.038, 0.038, -0.003, 0.125, c.mustard, b],
      [0.751, 0.036, 0.039, -0.004, 0.117, c.mustard, b],
      [0.772, 0.024, 0.033, -0.004, 0.108, c.mustard, b],
      [0.779, 0.004, 0.012, -0.004, 0.097, c.mustard, b],
    ];
    skinLoft(
      'arm' + side,
      limb.map((r) => [r[0], r[1], r[2], r[3], r[4] * s, ...r.slice(5)]),
      c.mustard,
      {
        columns: 24,
        transform: ([x, y, z]) => {
          const axis = T.MathUtils.lerp(0.121, 0.133, T.MathUtils.clamp((0.758 - y) / 0.305, 0, 1));
          const elbowEase = 0.0016 * (1 - T.MathUtils.smoothstep(Math.abs(y - 0.594), 0, 0.083));
          return explorerLimb(rig, side, false, [x - s * axis, y - 0.758, z], 0.006 + elbowEase, 0.164, 0.147);
        },
      },
    );
    const thigh = rig[s === 1 ? 'thighL' : 'thighR'],
      shin = rig[s === 1 ? 'shinL' : 'shinR'];
    const leg = [
      [0.089, 0.034, 0.035, -0.002, 0.0535, c.cuff, shin],
      [0.103, 0.036, 0.037, -0.002, 0.0535, c.cuff, shin],
      [0.109, 0.04, 0.042, -0.003, 0.0535, c.pants, shin],
      [0.122, 0.039, 0.04, -0.003, 0.0535, c.pants, shin],
      [0.143, 0.042, 0.043, -0.003, 0.0535, c.pants, shin],
      [0.173, 0.046, 0.046, -0.003, 0.054, c.pants, shin],
      [0.211, 0.047, 0.047, -0.005, 0.054, c.pants, shin],
      [0.239, 0.044, 0.045, -0.004, 0.054, c.pants, shin, thigh, 0.2],
      [0.262, 0.047, 0.048, -0.003, 0.054, c.pants, thigh, shin, 0.55],
      [0.282, 0.049, 0.048, -0.002, 0.054, c.pants, thigh, shin, 0.2],
      [0.327, 0.053, 0.056, 0.0, 0.054, c.pants, thigh],
      [0.397, 0.055, 0.059, 0.001, 0.054, c.pants, thigh],
      [0.453, 0.057, 0.061, 0.001, 0.052, c.pants, thigh, hips, 0.12],
      [0.485, 0.055, 0.06, -0.001, 0.049, c.pants, thigh, hips, 0.5],
      [0.518, 0.047, 0.057, 0, 0.047, c.pants, hips, thigh, 0.12],
    ];
    skinLoft(
      'leg' + side,
      leg.map((r) => [r[0], r[1], r[2], r[3], r[4] * s, ...r.slice(5)]),
      c.pants,
      {
        columns: 24,
        transform: ([x, y, z]) => {
          const bendEase = 0.0015 * (1 - T.MathUtils.smoothstep(Math.abs(y - 0.26), 0, 0.081));
          return explorerLimb(rig, side, true, [x - s * 0.0535, y - 0.49, z], 0.0067 + bendEase, 0.231, 0.212);
        },
      },
    );
    // The bellows and fold-over flap follow the thigh through a long stride.
    const pocketPoint = explorerLimb(rig, side, true, [s * 0.049, -0.107, 0.006], 0.008, 0.231, 0.212);
    const pocket = group(thigh, 'pocket ' + s, ...pocketPoint.map((value, i) => value - rig.anatomy.joints[thigh.name].getComponent(i)));
    loft(
      pocket,
      [
        [-0.047, 0.011, 0.033, 0],
        [-0.04, 0.012, 0.038, 0],
        [0.027, 0.012, 0.038, 0],
        [0.033, 0.01, 0.035, 0],
      ],
      c.pants,
      { columns: 18 },
    );
    loft(
      pocket,
      [
        [0.014, 0.013, 0.039, 0.001],
        [0.029, 0.014, 0.04, 0.001],
        [0.035, 0.011, 0.039, 0],
      ],
      c.crease,
      { columns: 18 },
    );
    thread(
      pocket,
      c.cuff,
      [
        [s * 0.01, -0.037, 0.03],
        [s * 0.013, -0.043, 0.026],
        [s * 0.014, -0.043, -0.023],
        [s * 0.012, -0.037, -0.031],
      ],
      0.00065,
      { sides: 3 },
    );
    const hand = rig['hand' + side];
    for (let k = 0; k < 11; k++) {
      const a = (k * tau) / 11;
      oval(
        hand,
        k % 3 ? c.gold : c.purple,
        0.023 * Math.sin(a),
        -0.002,
        0.018 * Math.cos(a),
        0.0036,
        0.0038,
        0.0036,
        0,
        0,
        0,
        false,
        8,
      );
    }
    const ankle = rig[s === 1 ? 'footL' : 'footR'];
    loft(
      ankle,
      [
        [-0.047, 0.031, 0.062, 0.021],
        [-0.0468, 0.033, 0.065, 0.021],
        [-0.04, 0.034, 0.065, 0.021],
        [-0.034, 0.034, 0.065, 0.021],
        [-0.03, 0.032, 0.064, 0.021],
      ],
      c.sole,
      { columns: 26 },
    );
    loft(
      ankle,
      [
        [-0.031, 0.032, 0.065, 0.022],
        [-0.023, 0.033, 0.064, 0.022],
        [-0.015, 0.032, 0.059, 0.02],
        [-0.005, 0.029, 0.046, 0.011],
        [0.011, 0.027, 0.036, 0.003],
        [0.029, 0.027, 0.03, -0.002],
        [0.041, 0.026, 0.027, -0.002],
      ],
      c.purple,
      { columns: 24 },
    );
    oval(ankle, c.cream, 0, -0.021, 0.067, 0.027, 0.009, 0.019, -0.2);
    for (let k = 0; k < 4; k++) {
      const y = -0.015 + 0.009 * k,
        z = 0.059 - 0.0069 * k;
      thread(
        ankle,
        c.cream,
        [
          [-0.019, y, z - 0.004],
          [-0.006, y + 0.004, z + 0.002],
          [0.016, y + 0.004, z - 0.003],
        ],
        0.00155,
        { segments: 5, sides: 4 },
      );
    }
    thread(
      ankle,
      c.sole,
      [
        [s * 0.031, -0.019, 0.044],
        [s * 0.031, -0.012, 0.027],
        [s * 0.027, -0.009, 0.002],
        [s * 0.023, 0, -0.016],
      ],
      0.00235,
      { sides: 5 },
    );
  }
  loft(
    hips,
    refine([
      [-0.081, 0.041, 0.038, 0],
      [-0.064, 0.064, 0.055, 0],
      [-0.051, 0.084, 0.057, 0],
      [-0.034, 0.090, 0.061, 0],
      [0.004, 0.087, 0.058, 0],
      [0.014, 0.09, 0.06, 0],
      [0.034, 0.086, 0.057, 0],
      [0.062, 0.077, 0.053, 0],
      [0.077, 0.075, 0.052, 0],
    ]),
    c.pants,
    { columns: 32, transform: hipGrade(0.0074) },
  );
  loft(
    hips,
    [
      [0.062, 0.079, 0.055, 0],
      [0.076, 0.077, 0.054, 0],
    ],
    c.leather,
    { transform: hipGrade(0.009) },
  );
  const buckleDepth = hipGrade(0.011)([0, 0.07, 1])[2];
  thread(
    hips,
    c.brass,
    [
      [-0.013, 0.062, buckleDepth],
      [-0.013, 0.077, buckleDepth],
      [0.013, 0.077, buckleDepth],
      [0.013, 0.062, buckleDepth],
      [-0.013, 0.062, buckleDepth],
    ],
    0.0018,
    { metal: true, sides: 5 },
  );
  // Grape and vine worked onto the outer left sleeve.
  const sleeve = rig.upperArmL;
  const badgeSeat = explorerLimb(rig, 'L', false, [1, -0.043, 0.16], 0.0075, 0.164, 0.147);
  const badgeX = badgeSeat[0] - rig.anatomy.joints.upperArmL.x;
  thread(
    sleeve,
    c.crease,
    [
      [badgeX - 0.006, -0.013, 0.007],
      [badgeX + 0.004, -0.031, 0.004],
      [badgeX + 0.004, -0.046, 0.008],
      [badgeX, -0.059, 0.011],
    ],
    0.0013,
    { sides: 4 },
  );
  for (const [y, z, angle] of [
    [-0.027, 0.012, 1],
    [-0.034, -0.002, -0.6],
  ])
    oval(sleeve, c.pants, badgeX, y, z, 0.0027, 0.007, 0.0041, angle, 0, 0, false, 10);
  for (const [y, z] of [
    [-0.047, 0.006],
    [-0.045, 0.013],
    [-0.053, 0.008],
    [-0.052, 0.015],
    [-0.059, 0.012],
  ])
    oval(sleeve, c.purple, badgeX, y, z, 0.0032, 0.0035, 0.0032, 0, 0, 0, false, 8);
}

function fieldKit(rig, h) {
  const { group, loft, oval, thread, ring, face: surface } = h;
  const chest = rig.chest;
  const origin = rig.anatomy.joints.chest;
  const rear = [-0.063, -0.02, 0.025, 0.078, 0.114].map((y) => {
    const [, center, radius] = sampleExterior(rig.exterior.torso, origin.y + y, Math.PI);
    return center - radius - origin.z;
  });
  const pack = group(chest, 'field backpack', 0, 0.028, Math.min(...rear) - 0.028);
  // Tapered leather case and generous turn-over flap sit close to the back.
  loft(
    pack,
    [
      [-0.109, 0.049, 0.025, -0.015],
      [-0.101, 0.065, 0.031, -0.015],
      [-0.074, 0.071, 0.034, -0.016],
      [0.081, 0.071, 0.034, -0.01],
      [0.103, 0.063, 0.029, -0.007],
      [0.111, 0.053, 0.023, -0.006],
    ],
    c.leather,
    { columns: 22 },
  );
  surface(pack, 20, 5, (u, v) => {
    const a = (u - 0.5) * Math.PI * 0.91,
      x = 0.072 * Math.sin(a),
      z = -0.009 - 0.038 * Math.cos(a);
    const bottom = 0.012 + 0.014 * Math.abs(2 * u - 1),
      y = T.MathUtils.lerp(bottom, 0.103, v);
    return [x, y, z, c.dark];
  });
  for (const s of [-1, 1]) {
    oval(pack, c.leather, s * 0.03, 0.009, -0.046, 0.006, 0.021, 0.003);
    oval(pack, c.brass, s * 0.03, 0.007, -0.048, 0.0036, 0.0036, 0.0019, 0, 0, 0, true, 12);
    thread(
      chest,
      c.leather,
      [
        [s * 0.049, 0.135, -0.074],
        [s * 0.062, 0.161, -0.044],
        [s * 0.068, 0.159, 0.006],
        [s * 0.07, 0.115, 0.049],
        [s * 0.075, 0.04, 0.058],
        [s * 0.078, -0.012, 0.045],
        [s * 0.077, -0.048, 0.016],
        [s * 0.058, -0.061, -0.061],
      ],
      0.006,
      { sides: 5 },
    );
  }
  for (const [x, y, rad] of [
    [-0.022, 0.065, 0.012],
    [0.014, 0.078, 0.01],
  ]) {
    oval(pack, c.brass, x, y, -0.046, rad, rad, 0.002, 0, 0, 0, true);
    ring(pack, c.gold, x, y, -0.0482, rad * 0.73, rad * 0.73, 0.0007, 0, true);
  }
  thread(
    pack,
    c.dark,
    [
      [-0.022, 0.106, -0.014],
      [-0.018, 0.126, -0.013],
      [0, 0.135, -0.013],
      [0.019, 0.126, -0.013],
      [0.023, 0.106, -0.014],
    ],
    0.0038,
    { sides: 6 },
  );
  const bag = group(rig.hips, 'crossbody pouch', -0.115, 0.01, -0.028, true);
  bag.rotation.y = 0.46;
  loft(
    bag,
    [
      [-0.06, 0.018, 0.03, 0],
      [-0.054, 0.025, 0.038, 0],
      [0.001, 0.026, 0.039, 0],
      [0.012, 0.022, 0.037, 0],
    ],
    c.leather,
    { columns: 18 },
  );
  loft(
    bag,
    [
      [-0.018, 0.026, 0.039, 0],
      [-0.007, 0.028, 0.04, 0],
      [0.012, 0.026, 0.039, 0],
      [0.014, 0.023, 0.037, 0],
    ],
    c.dark,
    { columns: 18 },
  );
  oval(bag, c.brass, -0.014, -0.016, 0.031, 0.0038, 0.0044, 0.002, 0, -0.4, 0, true, 10);
  // Wide flat webbing crosses diagonally over the open front. The lower end
  // inherits hip motion and the upper shoulder anchorage inherits the chest.
  const guide = [
    [0.06, 0.766, -0.022],
    [0.063, 0.761, 0.012],
    [0.059, 0.73, 0.053],
    [0.047, 0.692, 0.068],
    [0.01, 0.625, 0.07],
    [-0.037, 0.566, 0.065],
    [-0.08, 0.526, 0.048],
    [-0.105, 0.509, 0.017],
    [-0.115, 0.502, -0.019],
  ];
  const path = new T.CatmullRomCurve3(guide.map((p) => new T.Vector3(...p)));
  const p = new T.Vector3(),
    tan = new T.Vector3(),
    across = new T.Vector3();
  h.skinnedFace(2, 26, (u, v) => {
    path.getPoint(v, p);
    path.getTangent(v, tan);
    across.set(tan.y, -tan.x, 0).normalize();
    const side = (u - 0.5) * 0.011;
    p.addScaledVector(across, side);
    const weight = T.MathUtils.smoothstep(p.y, 0.503, 0.643);
    const base = explorerTorso(rig, [p.x, p.y, p.z], 0.0108 + 0.0004 * Math.sin(u * Math.PI), 0.49, 0.758);
    return [...base, c.dark, rig.hips, chest, weight];
  });
  thread(
    chest,
    c.gold,
    [
      [-0.024, 0.154, 0.04],
      [-0.016, 0.108, 0.057],
      [0.003, 0.071, 0.072],
      [0.022, 0.117, 0.057],
      [0.026, 0.15, 0.041],
    ],
    0.00115,
    { metal: true, sides: 4 },
  );
  oval(chest, c.brass, 0.003, 0.063, 0.07, 0.012, 0.014, 0.0034, 0.12, 0, 0, true);
  oval(chest, c.cream, 0.003, 0.063, 0.0732, 0.0099, 0.0115, 0.0018, 0.12);
  ring(chest, c.gold, 0.003, 0.063, 0.0741, 0.0101, 0.0116, 0.00115, 0.1, true);
  thread(
    chest,
    c.gold,
    [
      [-0.002, 0.057, 0.075],
      [0.005, 0.063, 0.076],
      [0.008, 0.071, 0.0748],
    ],
    0.0013,
    { metal: true, sides: 4 },
  );
  return bag;
}

export function buildRoma(rig, attachGroom) {
  attachExteriorProfile(rig, romaExterior);
  const chestPoint = rig.anatomy.joints.chest;
  rig.chest.userData.resolvePattern = ([x, y, z]) => {
    const nextY = torsoStation(rig, y + 0.61, 0.49, 0.758);
    const profile = rig.exterior.torso;
    const [, center, front] = sampleExterior(profile, nextY, 0);
    const raise = Math.max(0, center + front + 0.026 - chestPoint.z - 0.093);
    return [0.88 * x, nextY - chestPoint.y,
      z + 0.024 + raise * T.MathUtils.smoothstep(z, 0.015, 0.062)];
  };
  for (const side of ['L', 'R']) {
    const foot = rig['foot' + side];
    const room = sneakerRoom(rig, side, { x: 1.10, z: 1.05, halfWidth: 0.033, toe: 0.087 });
    foot.userData.resolvePattern = ([x, y, z]) => [x * room.x, y + 0.047 + room.floor, room.z * z + 0.003];
  }
  const forms = romaForms(rig);
  const facial = buildExplorerFace(rig, 'roma', c.skin, faceShell, skullLandmarks);
  clothes(rig, forms);
  const bag = fieldKit(rig, forms);
  bag.rotation.x = 0.035;
  forms.finish();
  const groom = attachGroom?.(rig.head);
  rig.groom = groom;
  addExteriorShell(rig, c.skin);
  buildExplorerHands(rig, c.skin, handProfiles);
  addRomaFat(rig);
  const secondary = secondaryMotion(rig, './roma-secondary.js', { groom, bag });
  return function poseRoma(f) {
    const emote = f.emote;
    const lift = emote < 0 ? 0 : Math.sin(Math.PI * emote);
    rig.forearmR.rotation.x -= 0.095;
    if (lift > 0) {
      rig.upperArmL.rotation.x -= lift * 1.18;
      rig.upperArmL.rotation.z += lift * 0.28;
      rig.forearmL.rotation.x -= lift * 0.83;
      rig.handL.rotation.z += lift * (0.19 + 0.27 * Math.sin(27 * emote));
      rig.head.rotation.y += 0.32 * lift;
      rig.head.rotation.z -= 0.07 * lift;
    }
    facial.pose(f, lift);
    secondary(f);
  };
}
