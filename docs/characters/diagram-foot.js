import { ivory, local } from './diagram-fabricator.js';

// Axial slices in ankle space. Each row gives anterior distance, lateral offset,
// height, half breadth and half height. The medial column bears on the higher
// navicular and cuneiforms; the cuboid supports the lower fourth and fifth rays.
const tarsals = [
  {
    name: 'calcaneus',
    square: 0.73,
    slices: [
      [-0.0265, 0.0004, -0.0275, 0.0037, 0.0034],
      [-0.0233, 0.001, -0.0265, 0.0082, 0.0073],
      [-0.015, 0.0016, -0.024, 0.01, 0.0094],
      [-0.006, 0.0025, -0.023, 0.0104, 0.0082],
      [0.001, 0.0044, -0.0224, 0.009, 0.0075],
      [0.0068, 0.008, -0.0235, 0.0065, 0.0053],
      [0.0097, 0.009, -0.023, 0.0055, 0.0039],
    ],
  },
  {
    name: 'talus',
    square: 0.7,
    slices: [
      [-0.0185, 0.0004, -0.0082, 0.0052, 0.0041],
      [-0.0132, 0.0003, -0.006, 0.0106, 0.008],
      [-0.0045, 0.0001, -0.0056, 0.0113, 0.0086],
      [0.001, -0.0011, -0.008, 0.009, 0.0063],
      [0.0047, -0.0038, -0.0111, 0.0063, 0.0041],
      [0.009, -0.0063, -0.0118, 0.007, 0.0047],
      [0.0108, -0.0064, -0.0122, 0.0045, 0.0031],
    ],
  },
  {
    name: 'navicular',
    square: 0.68,
    slices: [
      [0.0109, -0.0065, -0.0129, 0.0048, 0.0036],
      [0.0124, -0.006, -0.0139, 0.0118, 0.0052],
      [0.0162, -0.0062, -0.0144, 0.012, 0.0055],
      [0.018, -0.0063, -0.0144, 0.0102, 0.0047],
    ],
  },
  {
    name: 'cuboid',
    square: 0.6,
    slices: [
      [0.0099, 0.0107, -0.0233, 0.0058, 0.0048],
      [0.0136, 0.0127, -0.0226, 0.0066, 0.007],
      [0.018, 0.0136, -0.0232, 0.0069, 0.0061],
      [0.0226, 0.0142, -0.023, 0.0068, 0.0046],
      [0.0277, 0.0139, -0.0233, 0.0068, 0.0056],
      [0.029, 0.0142, -0.0234, 0.0059, 0.0049],
    ],
  },
  {
    name: 'medial cuneiform',
    square: 0.57,
    wedge: -0.16,
    slices: [
      [0.0183, -0.0142, -0.0167, 0.0035, 0.0043],
      [0.021, -0.0148, -0.017, 0.0043, 0.0053],
      [0.0275, -0.0148, -0.0182, 0.0047, 0.0054],
      [0.0318, -0.0145, -0.0194, 0.0043, 0.0044],
    ],
  },
  {
    name: 'intermediate cuneiform',
    square: 0.54,
    wedge: 0.35,
    slices: [
      [0.0187, -0.005, -0.0146, 0.0029, 0.0047],
      [0.021, -0.0051, -0.0151, 0.0039, 0.0054],
      [0.0255, -0.005, -0.0163, 0.0041, 0.0053],
      [0.0277, -0.0053, -0.0171, 0.0037, 0.0046],
    ],
  },
  {
    name: 'lateral cuneiform',
    square: 0.61,
    wedge: 0.3,
    slices: [
      [0.0183, 0.0026, -0.0168, 0.0028, 0.0045],
      [0.0214, 0.0032, -0.0173, 0.0039, 0.0054],
      [0.0274, 0.003, -0.0187, 0.0043, 0.005],
      [0.0298, 0.0032, -0.0195, 0.0039, 0.0041],
    ],
  },
];

const digits = ['hallux', 'second toe', 'third toe', 'fourth toe', 'fifth toe'];
const rays = [
  // Base (lateral, height, anterior), metatarsal head, toe tuft and shaft radius.
  [[-0.0144, -0.02, 0.0324], [-0.0149, -0.0296, 0.0518], [-0.0074, -0.0279, 0.067], 0.0035],
  [[-0.0052, -0.0173, 0.0282], [-0.0063, -0.0306, 0.0524], [-0.0025, -0.0278, 0.0671], 0.0025],
  [[0.0031, -0.0197, 0.0303], [0.0015, -0.0301, 0.0508], [0.0036, -0.028, 0.064], 0.0024],
  [[0.0095, -0.0223, 0.0297], [0.0089, -0.0295, 0.0483], [0.0098, -0.0285, 0.06], 0.0022],
  [[0.0174, -0.0244, 0.0297], [0.0154, -0.0288, 0.044], [0.0155, -0.0286, 0.0546], 0.0023],
];
const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
const shaftShape = [
  [1.13, 0.95],
  [1.2, 1.14],
  [0.73, 0.8],
  [0.68, 0.76],
  [0.84, 0.91],
  [1.21, 1.18],
  [0.93, 1.05],
];
const phalanxShape = [
  [1.18, 1.02],
  [1.12, 1.05],
  [0.75, 0.76],
  [0.8, 0.78],
  [1.07, 0.95],
  [0.87, 0.77],
];
const tuftShape = [
  [1.02, 0.89],
  [0.94, 0.85],
  [0.8, 0.73],
  [1.07, 0.77],
  [1.08, 0.65],
  [0.63, 0.42],
];

export function buildFoot(rig, roma, side, part) {
  const s = side === 'L' ? 1 : -1;
  const label = side === 'L' ? 'Left ' : 'Right ';
  const ankle = local(rig['foot' + side]);
  const breadth = roma ? 0.94 : 1;
  const place = (x, y, z) => ankle(s * x * breadth, y, z);
  for (const bone of tarsals) {
    part(label + bone.name, 'skeleton', ({ net, high }) => {
      // A superelliptical section leaves recognizable articular facets. The
      // mirrored cuts keep their outward winding on both anatomical sides.
      net(
        bone.slices.length,
        high ? 14 : 9,
        (station, j, t, angle) => {
          const u = Math.cos(angle),
            v = Math.sin(angle);
          const [z, cx, cy, rx, ry] = bone.slices[station];
          const h = Math.sign(v) * Math.pow(Math.abs(v), bone.square);
          const lateral = s * Math.sign(u) * Math.pow(Math.abs(u), bone.square);
          const interspace =
            bone.name === 'intermediate cuneiform' && lateral > 0
              ? 0.81
              : bone.name === 'lateral cuneiform' && lateral < 0
                ? 0.85
                : 1;
          let x = cx + rx * lateral * interspace * (1 + (bone.wedge || 0) * h);
          let y = cy + ry * h;
          if (bone.name === 'calcaneus') {
            // The sustentaculum forms a medial shelf under the talar head.
            const shelf = Math.max(0, -lateral) * Math.max(0, h) * Math.exp(-(((z + 0.001) / 0.008) ** 2));
            x -= 0.0054 * shelf;
            y += 0.0028 * shelf - 0.0012 * Math.max(0, h);
          } else if (bone.name === 'talus') {
            // Two shallow trochlear shoulders guide the tibial plafond.
            y += 0.0015 * Math.abs(lateral) * Math.max(0, h) * Math.exp(-(((z + 0.007) / 0.009) ** 2));
          } else if (bone.name === 'navicular') {
            x -= 0.0009 * Math.max(0, -lateral) * Math.max(0, -h);
          }
          return place(x, y, z);
        },
        ivory,
      );
    });
  }
  function shaft(name, a, b, dimensions, profile, rise, bow = 0) {
    // Articular ends lie in separate transverse planes. The longitudinal
    // diaphysis bows upward and the heads widen as they approach the joints.
    part(label + name, 'skeleton', ({ net, high }) => {
      net(
        profile.length,
        high ? 9 : 7,
        (i, j, t, angle) => {
          const arch = Math.sin(Math.PI * t);
          const cx = a[0] + (b[0] - a[0]) * t + bow * arch;
          const cy = a[1] + (b[1] - a[1]) * t + rise * arch;
          const z = a[2] + (b[2] - a[2]) * t;
          return place(
            cx + s * Math.cos(angle) * dimensions[0] * profile[i][0],
            cy + Math.sin(angle) * dimensions[1] * profile[i][1],
            z,
          );
        },
        ivory,
      );
    });
  }
  for (let k = 0; k < rays.length; k++) {
    const [base, head, tuft, radius] = rays[k];
    const midfootRise = k === 0 ? 0.0028 : 0.0019 - 0.0003 * k;
    const blend = (a, b, t) => a.map((a0, i) => a0 + (b[i] - a0) * t);
    const scale = radius * (roma ? 0.91 : 1);
    shaft(
      ordinal[k].toLowerCase() + ' metatarsal',
      base,
      head,
      [scale, scale],
      shaftShape,
      midfootRise,
      k === 4 ? 0.0012 : 0,
    );
    const toes = k === 0 ? ['proximal', 'distal'] : ['proximal', 'middle', 'distal'];
    const joints = k === 0 ? [0, 0.54, 1] : [0, 0.46, 0.72, 1];
    for (let j = 0; j < toes.length; j++) {
      const terminal = j === toes.length - 1;
      const start = blend(head, tuft, joints[j] + 0.035);
      const end = blend(head, tuft, joints[j + 1] - (terminal ? 0 : 0.016));
      const arch = 0.0014 * (1 - 0.06 * k);
      start[1] += arch * Math.sin(Math.PI * joints[j]);
      end[1] += arch * Math.sin(Math.PI * joints[j + 1]);
      const w = scale * (k === 0 ? 0.87 : 0.78) * (1 - 0.12 * j);
      shaft(
        digits[k] + ' ' + toes[j] + ' phalanx',
        start,
        end,
        [w, w * 0.78],
        terminal ? tuftShape : phalanxShape,
        0.0002,
      );
    }
  }
}
