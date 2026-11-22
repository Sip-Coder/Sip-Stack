// Roma's explorer clothing is cut in her bind pose. A single GPU-skinned mesh
// joins the sleeves and joggers through the bending joints; accessories ride
// their anatomical carriers and all colours are batched at construction.
import * as T from 'three';
import { secondaryMotion } from './secondary.js';
import { romaForms } from './roma-forms.js';
import { buildRomaHair } from './roma-light-groom.js';
import { addExteriorShell, attachExteriorProfile, coverExterior, explorerLimb, explorerTorso, sampleExterior, seatExplorerHead, shapeExplorerCrown, sneakerRoom, torsoStation } from './human-exterior.js';
import { romaExterior } from './roma-exterior-data.js';
import { addRomaFat } from './roma-soft-tissue.js';

const tau = 2 * Math.PI;
const c = {
  skin: '#d5956e',
  cheek: '#cc8068',
  lip: '#ae4f4d',
  inner: '#572d32',
  cream: '#eee1cd',
  white: '#fff2da',
  eye: '#81532f',
  black: '#2c1c22',
  brow: '#3a2426',
  mustard: '#c19543',
  edge: '#aa7d38',
  thread: '#ddbd81',
  pants: '#285b51',
  cuff: '#49766a',
  crease: '#315f55',
  red: '#a63437',
  purple: '#65445f',
  sole: '#dfd2bd',
  leather: '#855932',
  dark: '#69452f',
  brass: '#b18e53',
  gold: '#dbb05b',
};
const hairMaterial = new T.MeshStandardMaterial({
  color: '#503229',
  vertexColors: true,
  roughness: 0.57,
  side: T.DoubleSide,
});

function face(head, h) {
  const { loft, oval, thread, ring, group, face: surface } = h;
  const cheeks = [
    [0.003, 0.002, 0.003, 0.013],
    [0.009, 0.024, 0.026, 0.014],
    [0.023, 0.042, 0.041, 0.011],
    [0.039, 0.056, 0.05, 0.009],
    [0.061, 0.064, 0.054, 0.007],
    [0.08, 0.067, 0.056, 0.005],
    [0.1, 0.065, 0.054, 0.004],
    [0.125, 0.06, 0.05, 0],
    [0.141, 0.044, 0.043, -0.002],
    [0.149, 0.018, 0.021, -0.005],
    [0.151, 0.002, 0.004, -0.006],
  ];
  function section(y) {
    let i = 1;
    while (i < cheeks.length - 1 && cheeks[i][0] < y) i++;
    const a = cheeks[i - 1],
      b = cheeks[i],
      prev = cheeks[Math.max(0, i - 2)],
      next = cheeks[Math.min(cheeks.length - 1, i + 1)];
    const d = b[0] - a[0],
      t = T.MathUtils.clamp((y - a[0]) / d, 0, 1),
      tt = t * t,
      ttt = tt * t;
    return [1, 2, 3].map(
      (k) =>
        (2 * ttt - 3 * tt + 1) * a[k] +
        ((ttt - 2 * tt + t) * d * (b[k] - prev[k])) / (b[0] - prev[0]) +
        (-2 * ttt + 3 * tt) * b[k] +
        ((ttt - tt) * d * (next[k] - a[k])) / (next[0] - a[0]),
    );
  }
  const gaussian = (x, y, wx, wy) => Math.exp(-((x / wx) ** 2 + (y / wy) ** 2));
  function relief(x, y) {
    const ax = Math.abs(x);
    return (
      0.008 * gaussian(x, y - 0.066, 0.008, 0.021) +
      0.0148 * gaussian(x, y - 0.048, 0.01, 0.0084) +
      0.0058 * gaussian(ax - 0.0094, y - 0.045, 0.005, 0.004) +
      0.0043 * gaussian(ax - 0.035, y - 0.056, 0.019, 0.013) -
      0.0025 * gaussian(ax - 0.029, y - 0.077, 0.022, 0.015) +
      0.0016 * gaussian(x, y - 0.021, 0.019, 0.012)
    );
  }
  const zAt = (x, y) => {
    const [rx, rz, offset] = section(y),
      front = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
    return offset + front * (rz + relief(x, y));
  };
  surface(head, 52, 34, (u, v) => {
    const y = T.MathUtils.lerp(0.003, 0.151, v),
      [rx, rz, offset] = section(y),
      a = u * tau;
    const x = rx * Math.sin(a),
      front = Math.cos(a);
    return [x, y, offset + rz * front + Math.max(0, front) * relief(x, y), c.skin];
  });
  const eyes = [],
    brows = [];
  for (const s of [-1, 1]) {
    oval(head, c.skin, s * 0.063, 0.062, -0.002, 0.012, 0.018, 0.008, 0, 0, -s * 0.18);
    oval(head, c.cheek, s * 0.07, 0.061, 0.002, 0.004, 0.011, 0.005);
    oval(head, c.gold, s * 0.068, 0.048, 0.004, 0.0035, 0.0031, 0.0034, 0, 0, 0, true, 12);
    ring(head, c.gold, s * 0.069, 0.0365, 0.005, 0.0102, 0.0113, 0.0013, s * 0.3);
    const cx = 0.0288,
      cy = 0.077,
      w = 0.0224,
      height = 0.0146;
    const eye = group(head, 'eye ' + s, s * cx, cy, 0, true);
    eye.scale.x = s;
    eyes.push(eye);
    const cornea = (x, y) =>
      zAt(s * (cx + x), cy + y) + 0.001 + 0.0045 * Math.max(0, 1 - (x / w) ** 2 - (y / height) ** 2);
    // Shape the sclera as an almond with a raised outer canthus. The iris,
    // pupil and lash contours share its gently rounded corneal surface.
    surface(eye, 22, 7, (u, v) => {
      const a = 2 * u - 1,
        x = w * a,
        y = 0.0014 * a + Math.sqrt(Math.max(0, 1 - a * a)) * height * T.MathUtils.lerp(-0.77, 0.95, v);
      return [x, y, cornea(x, y), c.white];
    });
    for (const [rx, ry, tint, relief] of [
      [0.0121, 0.0123, c.brow, 0.00026],
      [0.0113, 0.0116, c.eye, 0.00046],
      [0.0072, 0.0085, c.black, 0.00072],
    ])
      surface(eye, 4, 24, (r, u) => {
        const a = u * tau,
          x = -0.0012 + r * rx * Math.cos(a),
          y = 0.0008 + r * ry * Math.sin(a);
        return [x, y, cornea(x, y) + relief, tint];
      });
    const gx = s * 0.0031 - 0.0012;
    oval(eye, c.white, gx, 0.0051, cornea(gx, 0.0051) + 0.001, 0.0024, 0.0028, 0.0006, 0, 0, 0, false, 10);
    const lx = -s * 0.0044 - 0.0012;
    oval(eye, c.cream, lx, -0.0032, cornea(lx, -0.0032) + 0.001, 0.0009, 0.001, 0.0004, 0, 0, 0, false, 8);
    const lid = [];
    for (let i = 0; i < 13; i++) {
      const a = i / 6 - 1,
        x = a * w,
        y = 0.0014 * a + height * 0.95 * Math.sqrt(Math.max(0, 1 - a * a));
      lid.push([x, y, cornea(x, y) + 0.0007]);
    }
    lid.push([w + 0.003, 0.0037, zAt(s * (cx + w + 0.003), cy + 0.0037) + 0.0008]);
    thread(eye, c.brow, lid, 0.001, { sides: 5, widths: [0.2, 0.8, 1.15, 1.1, 0.06] });
    const brow = group(head, 'brow ' + s, s * cx, 0.097, 0, true);
    brows.push(brow);
    const arch = [
      [-0.018, 0.0006],
      [-0.01, 0.0045],
      [0.002, 0.0064],
      [0.01, 0.006],
      [0.019, 0.002],
      [0.021, 0.0006],
    ];
    thread(
      brow,
      c.brow,
      arch.map(([x, y]) => [s * x, y, zAt(s * (cx + x), 0.097 + y) + 0.001]),
      0.00235,
      { sides: 7, widths: [0.1, 1, 0.95, 0.65, 0.03] },
    );
  }
  for (const s of [-1, 1]) {
    const nostril = [
      [0.0045, 0.0436],
      [0.0064, 0.043],
      [0.0086, 0.0434],
      [0.01, 0.0442],
    ].map(([x, y]) => [s * x, y, zAt(s * x, y) + 0.00021]);
    thread(head, c.inner, nostril, 0.00046, { sides: 5, widths: [0.13, 1, 0.85, 0.08] });
  }
  const smile = group(head, 'smile', 0, 0.0315, 0, true);
  const rim = (x) => 0.004 * (Math.abs(x) / 0.0234) ** 1.9 + (0.0005 * x) / 0.0234;
  for (const [part, col] of [
    ['cavity', c.inner],
    ['teeth', c.white],
    ['lower', c.lip],
    ['upper', c.lip],
  ])
    surface(smile, 26, 4, (u, v) => {
      const a = 2 * u - 1,
        x = a * 0.0234,
        envelope = 1 - a * a,
        top = rim(x) + 0.0012 * envelope,
        low = rim(x) - 0.004 * envelope;
      let y = 0,
        relief = 0.0008;
      if (part === 'cavity') y = T.MathUtils.lerp(low, top, v);
      if (part === 'teeth') {
        y = top - (1 - v) * envelope * 0.00185;
        relief = 0.0011;
      }
      if (part === 'lower') {
        y = low - (1 - v) * envelope * 0.0025;
        relief = 0.00075 + 0.0016 * Math.sin(Math.PI * v) * envelope;
      }
      if (part === 'upper') {
        y = top + v * envelope * (0.0011 + 0.00065 * Math.cos(a * 7) ** 2);
        relief = 0.0007 + 0.001 * Math.sin(Math.PI * v) * envelope;
      }
      return [x, y, zAt(x, y + 0.0315) + relief, col];
    });
  // The patterned strip wraps over the crown from one temple to the other.
  const band = (u, v) => {
    const a = (u - 0.5) * Math.PI * 1.03,
      t = 2 * v - 1,
      arch = Math.cos(a);
    return [
      0.002 + (0.079 - 0.0019 * t) * Math.sin(a),
      0.073 + 0.087 * arch - 0.008 * t * (0.38 + 0.62 * arch) + 0.0007 * Math.cos((t * Math.PI) / 2),
      0.021 + 0.008 * arch + 0.01 * t,
    ];
  };
  surface(head, 44, 7, (u, v) => [...band(u, v), v < 0.12 || v > 0.88 ? '#b94442' : c.red]);
  for (let i = 1; i <= 12; i++) {
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const a = (j * tau) / 10,
        u = i / 13 + 0.018 * Math.sin(a) * (1 - 0.3 * Math.cos(a)),
        v = 0.5 + 0.2 * Math.cos(a) + 0.1 * Math.sin(a);
      const p = band(u, v);
      p[1] += 0.0005 * Math.cos((u - 0.5) * Math.PI);
      p[0] += 0.0005 * Math.sin((u - 0.5) * Math.PI);
      pts.push(p);
    }
    thread(head, '#e5bf8b', pts, 0.00035, { segments: 14, sides: 3 });
  }
  return { eyes, brows, smile };
}

function clothes(rig, h) {
  const { loft, face: surface, thread, oval, ring, group } = h;
  const { chest, hips } = rig;
  const torsoGrade = ([x, y, z], ease) => explorerTorso(rig,
    [x, y + 0.044 * (1 - T.MathUtils.smoothstep(y, 0.49, 0.635)), z], ease, 0.49, 0.758);
  const hipOrigin = rig.anatomy.joints.hips;
  const hipGrade = (ease) => ([x, y, z]) => {
    const a = Math.atan2(x, z), hem = 1 - T.MathUtils.smoothstep(y, -0.051, 0.019);
    const rise = y + (0.021 * Math.abs(Math.sin(a)) - 0.007 * Math.max(0, -Math.cos(a))) * hem;
    return coverExterior(rig, 'torso',
      [hipOrigin.x + x, hipOrigin.y + rise, hipOrigin.z + z], ease, [hipOrigin.x, hipOrigin.z])
      .map((value, i) => value - hipOrigin.getComponent(i));
  };
  const skinLoft = (rows, color, options = {}) =>
    loft(null, rows, color, { columns: 22, skinned: true, ...options });
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
  skinLoft(trunk, c.mustard, { from: 0.36, to: tau - 0.36, columns: 32, transform: (p) => torsoGrade(p, 0.011) });
  skinLoft(
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
    { columns: 28, transform: (p) => torsoGrade(p, 0.0055) },
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
      limb.map((r) => [r[0], r[1], r[2], r[3], r[4] * s, ...r.slice(5)]),
      c.mustard,
      {
        columns: 20,
        profile: (a, j) => (j === 3 || j === 6 ? 0.0014 * Math.cos(3 * a + 0.55 * j) : 0),
        transform: ([x, y, z]) => {
          const axis = T.MathUtils.lerp(0.121, 0.133, T.MathUtils.clamp((0.758 - y) / 0.305, 0, 1));
          return explorerLimb(rig, side, false, [x - s * axis, y - 0.758, z], 0.008, 0.164, 0.147);
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
      leg.map((r) => [r[0], r[1], r[2], r[3], r[4] * s, ...r.slice(5)]),
      c.pants,
      {
        columns: 22,
        profile: (a, j) => (j === 2 || j === 4 || j === 8 ? 0.0018 * Math.sin(2 * a + 0.73 * j) : 0),
        transform: ([x, y, z]) => explorerLimb(rig, side, true, [x - s * 0.0535, y - 0.49, z], 0.010, 0.231, 0.212),
      },
    );
    // The bellows and fold-over flap follow the thigh through a long stride.
    const pocketPoint = explorerLimb(rig, side, true, [s * 0.049, -0.107, 0.006], 0.011, 0.231, 0.212);
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
    // Narrow wrist, palm mound and five distinct fingers, in the hand's frame.
    const hand = rig[s === 1 ? 'handL' : 'handR'];
    oval(hand, c.skin, 0, -0.019, 0.002, 0.021, 0.029, 0.014, 0, 0, s * 0.04);
    for (let k = 0; k < 4; k++) {
      const length = [0.02, 0.023, 0.022, 0.017][k],
        x = (k - 1.5) * 0.0087 * s;
      oval(
        hand,
        c.skin,
        x,
        -0.034 - length * 0.42,
        0.007,
        0.0053,
        length * 0.78,
        0.0068,
        -0.24,
        0,
        s * (k - 1.5) * 0.06,
        false,
        12,
      );
    }
    oval(hand, c.skin, -s * 0.017, -0.018, 0.011, 0.007, 0.019, 0.0077, -0.25, 0, -s * 0.42, false, 12);
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
    [
      [-0.075, 0.041, 0.038, 0],
      [-0.064, 0.064, 0.055, 0],
      [-0.051, 0.084, 0.057, 0],
      [-0.034, 0.090, 0.061, 0],
      [0.004, 0.087, 0.058, 0],
      [0.014, 0.09, 0.06, 0],
      [0.034, 0.086, 0.057, 0],
      [0.062, 0.077, 0.053, 0],
      [0.077, 0.075, 0.052, 0],
    ],
    c.pants,
    { transform: hipGrade(0.010) },
  );
  loft(
    hips,
    [
      [0.062, 0.079, 0.055, 0],
      [0.076, 0.077, 0.054, 0],
    ],
    c.leather,
    { transform: hipGrade(0.012) },
  );
  thread(
    hips,
    c.brass,
    [
      [-0.013, 0.062, 0.077],
      [-0.013, 0.077, 0.077],
      [0.013, 0.077, 0.077],
      [0.013, 0.062, 0.077],
      [-0.013, 0.062, 0.077],
    ],
    0.0018,
    { metal: true, sides: 5 },
  );
  // Grape and vine worked onto the outer left sleeve.
  const sleeve = rig.upperArmL;
  thread(
    sleeve,
    c.crease,
    [
      [0.028, -0.013, 0.007],
      [0.038, -0.031, 0.004],
      [0.038, -0.046, 0.008],
      [0.034, -0.059, 0.011],
    ],
    0.0013,
    { sides: 4 },
  );
  for (const [y, z, angle] of [
    [-0.027, 0.012, 1],
    [-0.034, -0.002, -0.6],
  ])
    oval(sleeve, c.pants, 0.034, y, z, 0.0027, 0.007, 0.0041, angle, 0, 0, false, 10);
  for (const [y, z] of [
    [-0.047, 0.006],
    [-0.045, 0.013],
    [-0.053, 0.008],
    [-0.052, 0.015],
    [-0.059, 0.012],
  ])
    oval(sleeve, c.purple, 0.034, y, z, 0.0032, 0.0035, 0.0032, 0, 0, 0, false, 8);
}

function fieldKit(rig, h) {
  const { group, loft, oval, thread, ring, face: surface } = h;
  const chest = rig.chest;
  const pack = group(chest, 'field backpack', 0, 0.028, -0.068);
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
    const base = explorerTorso(rig, [p.x, p.y, p.z + 0.0004 * Math.sin(u * Math.PI)], 0.017, 0.49, 0.758);
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

export function buildRoma(rig) {
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
  const head = forms.group(rig.head, 'face and band');
  seatExplorerHead(rig, head, { width: 0.138, depth: 0.115, baseWidth: 0.134,
    baseDepth: 0.112, height: 0.148, middle: 0.076, front: 0.003 });
  const facial = face(head, forms);
  const waves = buildRomaHair(head, hairMaterial);
  clothes(rig, forms);
  const bag = fieldKit(rig, forms);
  bag.rotation.x = 0.035;
  forms.finish();
  shapeExplorerCrown(rig, head);
  addExteriorShell(rig, c.skin);
  addRomaFat(rig);
  const secondary = secondaryMotion(rig, './roma-secondary.js', { waves, bag });
  return function poseRoma(f) {
    const t = f.time,
      emote = f.emote;
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
    const phase = (t + 1.1) % 4.4;
    const blink = Math.exp(-(((phase - 0.15) / 0.045) ** 2));
    const wink = emote < 0 ? 0 : Math.exp(-(((emote - 0.57) / 0.075) ** 2));
    facial.eyes[0].scale.y = 1 - 0.97 * Math.max(blink, wink);
    facial.eyes[1].scale.y = 1 - 0.97 * blink;
    facial.brows[0].rotation.z = 0.1 * lift;
    facial.brows[1].position.y = 0.097 + 0.0035 * lift;
    facial.smile.scale.y = 1 + 0.32 * lift;
    secondary(f);
  };
}
