// Craniofacial landmarks are expressed in the same local frame as the live
// face. +Z is anterior. Each style has its own vault, orbits and jaw.
import * as T from 'three';
import { ivory, fibre, joint, path, v } from './diagram-fabricator.js';

const enamel = new T.Color('#efe0ba');
const socketFloor = new T.Color('#8b714f');

export function headLandmarks(rig, roma) {
  const frame = rig.root.getObjectByName(roma ? 'face and band' : 'sippy-head');
  const width = roma ? 0.063 : 0.055,
    height = roma ? 0.143 : 0.12,
    depth = roma ? 0.05 : 0.046;
  const originY = roma ? 0.005 : 0.0055,
    originZ = roma ? 0.0045 : -0.001;
  const coordinates = (x, y, z) => v(x * width, originY + y * height, originZ + z * depth);
  const place = (x, y, z) => coordinates(x, y, z).applyMatrix4(frame.matrixWorld);
  const atlas = [0, 0.238, -0.23];
  // Rest location of the articular plane for the upper cervical spine, in
  // chest space. The animator raises Sippy's resting head above the raw rig.
  const atlasChestLocal = coordinates(...atlas)
    .applyMatrix4(frame.matrix)
    .multiply(rig.head.scale)
    .add(v(rig.head.position.x, roma ? 0.22 : 0.24, rig.head.position.z));
  // Neutral globe centres beneath the animated lids, expressed in the
  // artwork's head frame. Socket and eye keep their own depth planes.
  const eye = roma ? 0.511 : 0.619;
  const sides = {};
  for (const [id, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const p = (x, y, z) => place(s * x, y, z);
    p.mirrored = s < 0;
    sides[id] = {
      p,
      condyle: p(0.153, atlas[1], atlas[2]),
      mastoid: p(roma ? 0.655 : 0.693, roma ? 0.353 : 0.306, -0.375),
      temporalFossa: p(0.852, 0.7, -0.115),
      coronoid: p(roma ? 0.624 : 0.663, 0.487, 0.068),
      zygoma: p(0.803, eye - 0.065, 0.405),
      gonion: p(roma ? 0.66 : 0.707, roma ? 0.2 : 0.199, -0.162),
      mouth: p(roma ? 0.345 : 0.364, roma ? 0.244 : 0.231, roma ? 0.79 : 0.755),
    };
  }
  return {
    place,
    sides,
    eye,
    atlas: place(...atlas),
    atlasChestLocal,
    occiput: place(0, roma ? 0.455 : 0.457, roma ? -0.917 : -0.942),
  };
}

// Broad, thin bone with an irregular silhouette in the sagittal plane. The
// mandibular notch is an actual concavity between the two ascending processes.
function ramus(surface, p, s, roma) {
  const g = roma ? 0.635 : 0.682;
  const profile = [
    [-0.285, 0.202],
    [-0.227, 0.168],
    [-0.097, 0.161],
    [0.121, 0.191],
    [0.23, 0.248],
    [0.162, 0.28],
    [0.086, 0.389],
    [0.068, 0.487],
    [0.02, 0.472],
    [-0.072, 0.402],
    [-0.135, 0.397],
    [-0.229, 0.451],
    [-0.269, 0.488],
    [-0.315, 0.485],
    [-0.326, 0.447],
    [-0.3, 0.382],
  ];
  const loop = profile.map(([z, y]) => new T.Vector2(z, y));
  // Clockwise in the Z/Y chart faces anatomical left.
  if (T.ShapeUtils.isClockWise(loop) !== s > 0) loop.reverse();
  const pts = [],
    indices = [],
    n = loop.length;
  for (const k of [1, -1])
    for (const q of loop) {
      const x = g + 0.02 * (q.y - 0.25) - 0.17 * Math.max(0, q.x) + 0.026 * k;
      pts.push(p(x, q.y, q.x));
    }
  for (const face of T.ShapeUtils.triangulateShape(loop, [])) {
    const [a, b, c] = s > 0 ? [face[2], face[1], face[0]] : face;
    indices.push(a, b, c, n + c, n + b, n + a);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + i, n + j, i, n + j, j);
  }
  surface(pts, indices);
}

// The crowns share the maxillary and mandibular picker entries. Eight per
// quadrant: incisors, canine, premolars and molars, on a U-shaped arcade.
function dentition(net, p, upper, roma) {
  for (const s of [-1, 1])
    for (let i = 0; i < 8; i++) {
      const angle = 0.114 + i * 0.202,
        x = s * (roma ? 0.484 : 0.526) * Math.sin(angle);
      const z = (upper ? 0.73 : 0.69) * Math.cos(angle) - 0.016;
      const y = (upper ? 0.25 : 0.163) + 0.018 * Math.sin(angle) ** 2;
      const cusp = i === 2 ? 0.055 : 0.044,
        rx = i < 3 ? 0.056 : 0.054,
        rz = i < 3 ? 0.043 : 0.069;
      net(
        3,
        8,
        (row, _j, _t, a) => {
          const size = row === 1 ? 1 : row === 0 ? 0.66 : 0.8;
          const b = row;
          return p(
            x + rx * size * Math.cos(a),
            y + (b * cusp) / 2 - (upper ? cusp : 0),
            z - rz * size * Math.sin(a),
          );
        },
        enamel,
      );
    }
}

export function buildHead(rig, roma, part, head = headLandmarks(rig, roma)) {
  const { place: p, eye: E, sides } = head;
  const up = p(0, 1, 0)
    .sub(p(0, 0, 0))
    .normalize();
  const fore = p(0, 0, 1)
    .sub(p(0, 0, 0))
    .normalize();
  const lateral = p(1, 0, 0)
    .sub(p(0, 0, 0))
    .normalize();
  const power = (x, e) => Math.sign(x) * Math.abs(x) ** e;
  const orbital = (s, angle, scale = 1, inset = 0) => {
    const u = power(Math.cos(angle), roma ? 0.91 : 0.77) * scale,
      w = power(Math.sin(angle), roma ? 0.93 : 0.82) * scale;
    // The live almond-shaped sclera is wider than a circular opening.
    // Its upper margin rises towards Roma's outer canthus. Sippy's opposite
    // inclination follows his corneal carrier in the live face.
    const x = (roma ? 0.457 : 0.431) + (roma ? 0.357 : 0.368) * u;
    const slope = roma ? 0.01 : -0.006;
    const y = E + slope * u + (w > 0 ? (roma ? 0.11 : 0.137) : roma ? 0.103 : 0.13) * w;
    const z = 0.881 - 0.51 * x * x + 0.034 * w - (roma ? 0.018 : 0) - inset;
    return p(s * x, y, z);
  };
  part('Cranium', 'skeleton', ({ net, ellipsoid, bands, sweep, high }) => {
    // The first rim is the foramen magnum. The occipital floor rises laterally
    // into the temporal fossae, left hollow behind the cheek arches.
    // Each station holds width, rear/front depth and posterior/anterior level.
    const rows = [
      [0.149, -0.43, -0.035, 0.256, 0.253],
      [0.422, -0.653, 0.029, 0.289, 0.32],
      [0.671, -0.826, 0.145, 0.32, 0.42],
      [0.808, roma ? -0.913 : -0.926, 0.202, 0.438, 0.502],
      [0.901, -0.951, 0.385, 0.551, E + 0.04],
      [roma ? 0.946 : 0.925, -0.896, 0.748, 0.713, E + 0.131],
      [roma ? 0.876 : 0.88, -0.744, roma ? 0.81 : 0.776, 0.789, 0.803],
      [0.71, -0.622, 0.636, 0.874, 0.863],
      [0.503, -0.488, 0.451, 0.924, 0.921],
      [0.241, -0.294, 0.159, 0.96, 0.964],
      [0.025, -0.124, -0.088, 0.972, 0.975],
    ];
    const n = high ? 40 : 24;
    net(
      rows.length,
      n,
      (i, _j, _t, a) => {
        const [w, z0, z1, yb, yf] = rows[i],
          f = (1 - Math.sin(a)) / 2;
        return p(w * Math.cos(a), T.MathUtils.lerp(yb, yf, f), T.MathUtils.lerp(z0, z1, f));
      },
      ivory,
      false,
    );
    // Close the crown while keeping the basal opening through the skull.
    ellipsoid(p, 0, 0.968, -0.106, 0.07, 0.008, 0.084, ivory);
    for (const [id, s] of [
      ['L', 1],
      ['R', -1],
    ]) {
      const q = sides[id].p;
      ellipsoid(q, 0.153, 0.266, -0.23, 0.099, 0.028, 0.185, joint);
      const process = roma
        ? [
            [0.349, 0.021, 0.041, -0.375, 0.655],
            [0.375, 0.055, 0.071, -0.37, 0.655],
            [0.455, 0.087, 0.11, -0.341, 0.637],
          ]
        : [
            [0.305, 0.018, 0.037, -0.375, 0.693],
            [0.321, 0.066, 0.082, -0.371, 0.686],
            [0.374, 0.084, 0.114, -0.364, 0.681],
            [0.465, 0.113, 0.149, -0.331, 0.643],
          ];
      bands(q, process, ivory, high ? 14 : 10);
      // Curve of the nuchal line and the raised inion, broadest on Sippy.
      sweep(
        path(q, [
          [0, 0.457, roma ? -0.917 : -0.942],
          [0.229, 0.448, roma ? -0.864 : -0.898],
          [0.463, 0.428, -0.747],
          [0.628, 0.396, -0.541],
        ]),
        roma
          ? [
              [0.0011, 0.0012],
              [0.0014, 0.0013],
              [0.001, 0.001],
            ]
          : [
              [0.0038, 0.0031],
              [0.0028, 0.0024],
              [0.0015, 0.0015],
            ],
        ivory,
        { across: up, rows: high ? 12 : 7, sides: high ? 9 : 6 },
      );
      // A deep posterior wall leading to a small optic canal. The rim gets a
      // broad rolled section on Sippy and a narrow cutting edge on Roma.
      const sections = [
        [1.14, 0.09],
        [1.105, 0.038],
        [1.045, roma ? 0 : -0.034],
        [roma ? 0.997 : 0.955, 0.018],
        [0.84, 0.112],
        [0.5, 0.263],
        [0.16, 0.375],
        [0.078, 0.386],
      ];
      net(
        sections.length,
        n,
        (i, _j, _t, a) => orbital(s, s * a, sections[i][0], sections[i][1]),
        (t) => ivory.clone().lerp(socketFloor, Math.max(0, (t - 0.3) / 0.7) * 0.87),
        false,
      );
      const brow = [
        [-0.02, E + 0.092, 0.894],
        [0.119, E + 0.109, 0.912],
        [0.278, E + 0.127, 0.91],
        [0.481, E + 0.132, 0.808],
        [0.646, E + 0.12, 0.672],
        [0.761, E + 0.097, 0.54],
      ];
      sweep(
        path(
          q,
          brow.map(([x, y, z]) => [
            x,
            y + (roma ? 0 : 0.027),
            z - (roma ? 0 : 0.09) * Math.sin((Math.min(1, x / 0.4) * Math.PI) / 2),
          ]),
        ),
        roma
          ? [
              [0.0016, 0.0017],
              [0.0021, 0.0017],
              [0.0011, 0.0013],
            ]
          : [
              [0.0033, 0.0034],
              [0.005, 0.0042],
              [0.0026, 0.0028],
            ],
        ivory,
        { across: up, rows: high ? 15 : 9, sides: high ? 10 : 7 },
      );
    }
    ellipsoid(
      p,
      0,
      E + 0.082,
      roma ? 0.862 : 0.886,
      roma ? 0.079 : 0.106,
      roma ? 0.048 : 0.07,
      roma ? 0.036 : 0.084,
    );
  });

  for (const [id, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const q = sides[id].p;
    part((id === 'L' ? 'Left' : 'Right') + ' zygomatic arch', 'skeleton', ({ bands, sweep, high }) => {
      // The malar plate meets the inferolateral orbit; the thin arch curves
      // laterally away from the fossa before joining the temporal root.
      bands(
        q,
        [
          [E - 0.163, 0.067, 0.091, 0.508, 0.642],
          [E - 0.115, 0.129, 0.137, 0.502, 0.67],
          [E - 0.043, 0.108, 0.131, 0.48, 0.731],
          [E + 0.049, 0.055, 0.082, 0.463, 0.753],
        ],
        ivory,
        high ? 18 : 12,
      );
      sweep(
        path(q, [
          [0.741, E - 0.08, 0.492],
          [0.828, E - 0.054, 0.352],
          [0.87, E - 0.052, 0.171],
          [0.85, E - 0.041, -0.036],
          [0.787, E - 0.03, -0.205],
          [0.69, E - 0.036, -0.329],
        ]),
        [
          [0.0047, 0.0048],
          [0.0029, 0.0036],
          [0.0024, 0.0031],
          [0.0043, 0.0047],
        ],
        ivory,
        { rows: high ? 17 : 10, sides: high ? 11 : 7, across: up },
      );
    });
  }

  part('Maxilla and nasal aperture', 'skeleton', ({ net, bands, cord, surface, high }) => {
    // Anterior maxillary pillars border the hollow piriform opening. The
    // opening is pear-shaped (wider below the nasal bones), with a nasal spine.
    const mid = roma ? 0.344 : 0.365,
      height = roma ? 0.104 : 0.121,
      n = high ? 28 : 18;
    const rows = [
      [1.28, 0.22],
      [1.1, 0.023],
      [0.94, 0],
      [0.86, 0.034],
      [0.61, 0.23],
      [0.11, 0.34],
    ];
    net(
      rows.length,
      n,
      (i, _j, _t, a) => {
        const u = Math.cos(a),
          w = Math.sin(a),
          [r, inset] = rows[i];
        return p((0.153 - 0.045 * w) * u * r, mid + height * w * r, 0.871 - 0.042 * w - inset);
      },
      (t) => ivory.clone().lerp(socketFloor, Math.max(0, (t - 0.42) / 0.58)),
      false,
    );
    for (const s of [-1, 1]) {
      const q = sides[s > 0 ? 'L' : 'R'].p;
      bands(
        q,
        [
          [0.244, 0.107, 0.061, 0.587, 0.302],
          [0.274, 0.154, 0.113, 0.56, 0.313],
          [mid + 0.025, 0.18, 0.145, 0.531, 0.374],
          [E - 0.124, 0.205, 0.098, 0.574, 0.396],
          [E - 0.097, 0.132, 0.074, 0.636, 0.411],
        ],
        ivory,
        high ? 18 : 12,
      );
      cord(
        path(q, [
          [0.035, E + 0.094, 0.873],
          [0.075, E + 0.035, 0.91],
          [0.088, mid + 0.111, 0.939],
          [0.115, mid + 0.048, 0.953],
        ]),
        roma ? 0.0021 : 0.0026,
        ivory,
        { across: lateral, rows: high ? 12 : 7, sides: 8 },
      );
      cord(
        path(q, [
          [0.069, 0.251, 0.723],
          [0.286, 0.26, 0.63],
          [0.457, 0.269, 0.475],
          [0.513, 0.276, 0.242],
          [0.503, 0.278, 0.017],
        ]),
        [0.0044, 0.0038],
        ivory,
        { across: up, rows: high ? 15 : 9, sides: 9 },
      );
    }
    // A curved facial lamina extends from the alveolar process to the
    // infraorbital margin. The two nasal notches remain open medially.
    for (const s of [-1, 1]) {
      const vertices = [],
        indices = [],
        m = high ? 12 : 8;
      const rows = [
        [0.241, 0.013, 0.49, 0.725, 0.37],
        [0.28, 0.074, 0.57, 0.763, 0.41],
        [mid + 0.005, 0.174, 0.65, 0.801, 0.425],
        [E - 0.139, 0.172, 0.71, 0.837, 0.474],
        [E - 0.092, 0.116, 0.755, 0.847, 0.51],
      ];
      for (const [y, x0, x1, z0, z1] of rows)
        for (let j = 0; j <= m; j++) {
          const u = j / m;
          vertices.push(
            p(s * (x0 + (x1 - x0) * u), y + 0.032 * (2 * u - 1) ** 2, z0 + (z1 - z0) * u ** 1.34),
          );
        }
      for (let i = 1; i < rows.length; i++)
        for (let j = 0; j < m; j++) {
          const a = (i - 1) * (m + 1) + j,
            b = a + m + 1;
          if (s === 1) indices.push(a, a + 1, b + 1, a, b + 1, b);
          else indices.push(a, b + 1, a + 1, a, b, b + 1);
        }
      surface(vertices, indices);
    }
    dentition(net, p, true, roma);
  });
  part('Mandible', 'skeleton', ({ surface, net, sweep, ellipsoid, high }) => {
    // The body follows the dental arcade. Paired lateral tubercles flank
    // Sippy's broad mental eminence; Roma's mental protuberance is narrower.
    const outline = roma
      ? [
          [0.635, 0.207, -0.192],
          [0.605, 0.173, -0.027],
          [0.485, 0.15, 0.247],
          [0.34, 0.122, 0.466],
          [0.164, 0.111, 0.57],
          [0, 0.102, 0.594],
        ]
      : [
          [0.68, 0.221, -0.175],
          [0.655, 0.183, -0.012],
          [0.581, 0.15, 0.269],
          [0.444, 0.137, 0.442],
          [0.252, 0.12, 0.576],
          [0, 0.119, 0.6],
        ];
    const jaw = outline.map(([x, y, z]) => [-x, y, z]).concat(outline.slice(0, -1).reverse());
    sweep(
      path(p, jaw),
      roma
        ? [
            [0.0048, 0.0043],
            [0.0056, 0.0047],
            [0.0038, 0.0055],
            [0.0056, 0.0047],
            [0.0048, 0.0043],
          ]
        : [
            [0.0065, 0.0056],
            [0.0065, 0.0054],
            [0.0059, 0.0065],
            [0.0065, 0.0054],
            [0.0065, 0.0056],
          ],
      ivory,
      { across: up, rows: high ? 30 : 18, sides: high ? 13 : 9 },
    );
    for (const [id, s] of [
      ['L', 1],
      ['R', -1],
    ]) {
      const q = sides[id].p;
      ramus(surface, q, s, roma);
      ellipsoid(q, roma ? 0.644 : 0.718, 0.484, -0.278, 0.107, 0.029, 0.063, joint);
      ellipsoid(
        q,
        roma ? 0.053 : 0.15,
        roma ? 0.115 : 0.131,
        roma ? 0.591 : 0.611,
        roma ? 0.065 : 0.117,
        roma ? 0.039 : 0.047,
        roma ? 0.054 : 0.07,
      );
    }
    // Lingual and buccal surfaces rise to the roots of the lower teeth.
    // The midline symphysis is continuous through to the gonial angles.
    const n = high ? 28 : 18;
    net(
      n,
      10,
      (_i, _j, t, a) => {
        const angle = (t - 0.5) * Math.PI * 1.05,
          cs = Math.cos(angle),
          sn = Math.sin(angle);
        const x = (roma ? 0.505 : 0.555) * sn,
          z = 0.665 * cs - 0.017;
        return p(
          x + 0.075 * sn * Math.cos(a),
          0.151 + 0.037 * sn * sn - 0.036 * Math.sin(a),
          z + 0.079 * cs * Math.cos(a),
        );
      },
      ivory,
    );
    dentition(net, p, false, roma);
  });

  for (const [id, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const side = id === 'L' ? 'Left ' : 'Right ',
      lm = sides[id],
      q = lm.p;
    part(side + 'temporalis', 'muscles', ({ belly }) => {
      for (const ray of [-1, 0, 1])
        belly(
          [
            q(0.647 + 0.03 * ray, 0.79 + 0.033 * (1 - Math.abs(ray)), -0.095 + 0.191 * ray),
            lm.temporalFossa.clone().lerp(q(0.847, E + 0.039, 0.063 + 0.15 * ray), 0.48),
            q(0.81, E - 0.005, 0.059 + 0.047 * ray),
            lm.coronoid,
          ],
          0.005,
          0.0026,
          { across: fore, rows: 10, sides: 8 },
        );
    });
    part(side + 'orbicularis oculi', 'muscles', ({ sweep, high }) => {
      const rim = [];
      for (let k = 0; k <= 14; k++) rim.push(orbital(s, (s * 2 * Math.PI * k) / 14, 1.065, -0.052));
      sweep(
        rim,
        [
          [0.002, 0.0017],
          [0.0025, 0.0019],
          [0.002, 0.0017],
        ],
        fibre,
        { across: up, rows: high ? 25 : 16, sides: high ? 9 : 7 },
      );
    });
    part(side + 'zygomaticus major', 'muscles', ({ belly }) => {
      belly([lm.zygoma, q(0.665, E - 0.145, 0.62), q(0.5, 0.34, 0.724), lm.mouth], 0.0036, 0.002, {
        across: fore,
      });
    });
    part(side + 'masseter', 'muscles', ({ belly }) => {
      belly(
        [
          q(0.793, E - 0.073, 0.332),
          q(roma ? 0.77 : 0.801, E - 0.169, 0.211),
          q(roma ? 0.709 : 0.746, 0.297, 0.072),
          lm.gonion,
        ],
        0.0072,
        0.0039,
        { across: fore },
      );
    });
  }
}
