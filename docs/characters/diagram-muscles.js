// Origins and insertions refer to the same posed bony landmarks used for picking.
// Broad muscles are fans of overlapping fascicles. Narrow tendinous ends keep
// their bony attachments visible when the two inspection layers are overlaid.
import { CatmullRomCurve3 } from 'three';
import { v, local, track, path, muscle, fibre, tendon } from './diagram-fabricator.js';

// A fan is one continuous belly between distinct lines of action. Its two
// surfaces meet around the border and taper into the shared tendon.
function muscleFan({ net, high }, paths, normal, thickness, fit, sign) {
  const curves = paths.map((points) => new CatmullRomCurve3(points));
  const cross = curves.map(() => v());
  let oldRow = -1;
  net(
    high ? 29 : 22,
    high ? 24 : 16,
    (row, j, t, a) => {
      if (row !== oldRow) {
        curves.forEach((curve, k) => fit(curve.getPoint(t, cross[k])));
        oldRow = row;
      }
      const u = (1 - Math.cos(a)) * 0.5 * (cross.length - 1),
        k = Math.min(cross.length - 2, Math.floor(u));
      const depth = thickness * (0.2 + 0.8 * Math.sin(Math.PI * t) ** 0.65);
      return fit(
        cross[k]
          .clone()
          .lerp(cross[k + 1], u - k)
          .addScaledVector(normal, depth * Math.sin(a)),
      );
    },
    (t, a) => {
      const grain = 0.13 + 0.22 * Math.cos(18 * Math.cos(a) + 0.6 * Math.sin(t * Math.PI)) ** 2;
      const ends = 0.68 * Math.exp(-(((1 - t) / 0.12) ** 2)) + 0.27 * Math.exp(-((t / 0.1) ** 2));
      return muscle.clone().lerp(fibre, grain).lerp(tendon, ends);
    },
    true,
    sign < 0,
  );
}
export function buildMuscles(rig, roma, part, { head, thorax, shoulders, pelvis }, fit) {
  const H = rig.height;
  const front = v(0, 0, 1).transformDirection(rig.chest.matrixWorld);
  const hipFront = v(0, 0, 1).transformDirection(rig.hips.matrixWorld);
  const right = v(1, 0, 0).transformDirection(rig.chest.matrixWorld);
  const blend = (a, b, t) => a.clone().lerp(b, t);
  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const label = side === 'L' ? 'Left ' : 'Right ';
    const arm = shoulders[side],
      hip = pelvis[side];
    const radius = track(rig['forearm' + side], rig['hand' + side]);
    const upper = arm.humerusAt;
    const shin = track(rig['shin' + side], rig['foot' + side]);
    const handLocal = local(rig['hand' + side]);
    const hand = (x, y, z) =>
      handLocal(sign * x * (roma ? 1 : 1.14), y * (roma ? 1 : 1.06), z * (roma ? 1 : 1.14));
    const footLocal = local(rig['foot' + side]);
    const foot = (x, y, z) => footLocal(sign * x, y, z);
    const lateral = right.clone().multiplyScalar(sign);
    const bundle = (name, fn) => part(label + name, 'muscles', fn);
    function strand(belly, a, b, w, d, through) {
      belly([a, through || blend(a, b, 0.5), b], w, d, { rows: 9, sides: 8 });
    }
    bundle('pectoralis major', (tools) => {
      const origins = [
        arm.clavicle[4],
        thorax.manubrium,
        thorax.sternalAngle,
        blend(thorax.sternalAngle, thorax.xiphoid, 0.58),
        thorax.cartilage(side, 6, 0.72),
      ];
      const paths = origins.map((origin, i) => {
        const medial = arm.clavicle[7].clone().addScaledVector(front, 0.004 * H);
        const shoulder = arm.clavicle[13].clone().addScaledVector(front, 0.003 * H);
        const mid = thorax.rib(side, [1, 2, 3, 4, 6][i], 0.79).addScaledVector(front, 0.003 * H);
        return [origin, mid, medial, shoulder, arm.headCenter, arm.humeralInsertion];
      });
      muscleFan(tools, paths, front, 0.0038 * H, fit, sign);
    });
    bundle('trapezius', (tools) => {
      const neck = thorax.spinous('C5'),
        nape = thorax.spinous('C7');
      const bridge = arm.clavicle[8].clone().addScaledVector(front, -0.003 * H);
      const blade = arm.spineRoot;
      // Follow the nuchal ligament around C1 and C3 as the head flexes,
      // before the descending fibres spread out along the clavicle.
      const atlas = blend(thorax.spinous('C1'), thorax.vertebra('C1'), 0.40);
      const upperNeck = blend(thorax.spinous('C3'), thorax.vertebra('C3'), 0.30);
      tools.belly([head.occiput, atlas, upperNeck, neck, nape, bridge, arm.acromioclavicular], 0.006, 0.0028, {
        rows: 32,
        sides: 8,
      });
      const paths = [
        [nape, blend(nape, blade, 0.55), blade, arm.spine[1], arm.acromion],
        [thorax.spinous('T4'), thorax.spinous('T4').lerp(blade, 0.55), blade, arm.spine[1]],
        [thorax.spinous('T8'), thorax.spinous('T8').lerp(blade, 0.5), blade, arm.spine[1]],
        [thorax.spinous('T12'), thorax.spinous('T8'), blend(thorax.spinous('T6'), blade, 0.55), blade],
      ];
      function fitScapularFan(point) {
        if (!roma) {
          // Follow the convexity of the ribs across the axillary border.
          const span = point.clone().sub(blade).dot(arm.axes.x);
          point.addScaledVector(front, 0.010 * Math.exp(-(((span - 0.056) / 0.033) ** 2)));
        }
        return fit(point);
      }
      muscleFan(tools, paths, front, 0.0032 * H, fitScapularFan, sign);
    });
    bundle('latissimus dorsi', ({ belly }) => {
      for (const origin of [
        thorax.spinous('T7'),
        thorax.spinous('T12'),
        thorax.spinous('L5'),
        hip.posteriorCrest,
      ]) {
        const back = blend(thorax.posteriorRib(side, 8), hip.posteriorCrest, 0.16).addScaledVector(
          lateral,
          0.001 * H,
        );
        belly(
          [
            origin,
            blend(origin, back, 0.56),
            back,
            arm.spineRoot,
            arm.clavicle[9],
            arm.acromion,
            arm.headCenter,
            arm.humeralInsertion,
          ],
          0.009,
          0.003,
          { rows: 24, sides: 8 },
        );
      }
    });
    bundle('serratus anterior', ({ belly }) => {
      for (let n = 1; n <= 8; n++) {
        const t = (n - 1) / 7,
          edge = arm.medialBorder,
          u = t * (edge.length - 1),
          k = Math.min(edge.length - 2, Math.floor(u));
        const attachment = blend(edge[k], edge[k + 1], u - k);
        belly(
          [
            thorax.rib(side, n, 0.63),
            thorax.rib(side, n, 0.48).addScaledVector(lateral, H * 0.002),
            thorax.rib(side, n, 0.31),
            attachment,
          ],
          0.0034,
          0.0024,
          { rows: 10, sides: 6 },
        );
      }
    });
    bundle('gluteus maximus', ({ belly }) => {
      for (const origin of [hip.posteriorCrest, pelvis.sacralTip, pelvis.coccyx]) {
        const middle = blend(origin, hip.glutealTuberosity, 0.55).addScaledVector(hipFront, -0.004 * H);
        belly(
          [
            origin,
            middle,
            blend(hip.ischium, hip.greaterTrochanter, 0.72),
            hip.shaftPoint(0.07, 0.002, -0.005),
            hip.glutealTuberosity,
          ],
          0.007,
          0.0035,
          { rows: 18, sides: 8 },
        );
      }
    });
    bundle('rectus abdominis', ({ belly }) => {
      const upper = blend(thorax.cartilage(side, 6, 0.8), thorax.xiphoid, 0.45);
      const mid = blend(hip.pubis, upper, 0.56).addScaledVector(front, 0.014 * H);
      for (let j = 0; j < 4; j++) {
        function trace(t) {
          return blend(blend(hip.pubis, mid, t), blend(mid, upper, t), t);
        }
        belly([trace(j / 4), trace((j + 0.5) / 4), trace((j + 1) / 4)], 0.008, 0.0033, {
          shape: [0.72, 0.96, 1, 0.93, 0.7],
          rows: 7,
          sides: 8,
          across: lateral,
        });
      }
      for (const n of [5, 7]) strand(belly, upper, thorax.cartilage(side, n, 0.76), 0.003, 0.002);
    });
    bundle('external oblique', ({ belly }) => {
      for (const n of [5, 7, 9, 12]) {
        const origin = thorax.rib(side, n, 0.69),
          tip = blend(hip.anteriorCrest, hip.crest, (n - 5) / 8);
        strand(belly, origin, tip, 0.006, 0.003, blend(origin, tip, 0.5).addScaledVector(lateral, 0.002 * H));
      }
    });
    bundle('sternocleidomastoid', ({ belly }) => {
      for (const origin of [thorax.manubrium, arm.clavicle[1]])
        belly(
          [
            origin,
            blend(thorax.vertebra('C7'), origin, 0.3).addScaledVector(front, 0.003 * H),
            thorax.vertebra('C4').addScaledVector(lateral, 0.004 * H),
            head.sides[side].mastoid,
          ],
          0.0034,
          0.0029,
          { rows: 15, sides: 8 },
        );
    });
    bundle('erector spinae', ({ belly }) => {
      const points = ['L5', 'L3', 'L1', 'T10', 'T7', 'T4', 'T1', 'C5'].map((n) =>
        thorax
          .spinous(n)
          .clone()
          .addScaledVector(lateral, 0.005 * H),
      );
      belly([hip.posteriorCrest, ...points], 0.0045, 0.0032);
    });
    bundle('deltoid', ({ belly }) => {
      // The posterior deltoid wraps the scapular spine before descending
      // over the humeral head. Its tendon shares the tuberosity with the
      // middle and anterior portions, including during arm swing.
      const cap = arm.headCenter.clone().addScaledVector(lateral, 0.013).addScaledVector(arm.axes.y, 0.004);
      const paths = [
        [arm.acromioclavicular, arm.acromion, cap.clone().addScaledVector(front, 0.006), upper(0.13, 0.006, 0.003)],
        [arm.acromion, cap, upper(0.13, 0.007, 0)],
        [arm.spine[1], arm.spine[2], arm.spine[3], cap.clone().addScaledVector(front, -0.005), upper(0.13, 0.006, -0.003)],
      ];
      for (const points of paths)
        belly([...points, arm.deltoidTuberosity], 0.005, 0.004, { rows: 22, sides: 8 });
    });
    bundle('biceps brachii', ({ belly }) => {
      for (const origin of [arm.coracoid, arm.glenoid])
        belly(
          [origin, upper(0.3, 0, 0.009), upper(0.59, 0, 0.012), upper(0.84, 0, 0.008), arm.radiusTuberosity],
          0.0055,
          0.004,
        );
    });
    bundle('triceps brachii', ({ belly }) =>
      belly([arm.glenoid, upper(0.25, 0, -0.007), upper(0.57, 0, -0.01), arm.olecranon], 0.008, 0.005),
    );
    bundle('forearm flexors', ({ belly }) =>
      belly(
        path(radius, [
          [0.014, -sign * 0.005, 0.003],
          [0.26, -sign * 0.004, 0.011],
          [0.48, -sign * 0.006, 0.009],
          [0.98, -sign * 0.003, 0.005],
        ]),
        0.007,
        0.005,
      ),
    );
    bundle('forearm extensors', ({ belly }) =>
      belly(
        path(radius, [
          [0.027, sign * 0.005, -0.003],
          [0.26, sign * 0.005, -0.009],
          [0.52, sign * 0.005, -0.008],
          [0.99, sign * 0.002, -0.003],
        ]),
        0.006,
        0.004,
      ),
    );
    const z = roma ? 0 : -0.017;
    bundle('rectus femoris', ({ belly }) =>
      belly(
        [
          hip.aiis,
          hip.shaftPoint(0.2, 0, 0.012),
          hip.shaftPoint(0.5, 0, 0.015),
          hip.patella,
          hip.tibialTuberosity,
        ],
        0.01,
        0.005,
      ),
    );
    bundle('vastus lateralis', ({ belly }) =>
      belly(
        [
          hip.greaterTrochanter,
          hip.shaftPoint(0.3, 0.009, 0),
          hip.shaftPoint(0.62, 0.011, 0.001),
          hip.patella,
        ],
        0.007,
        0.006,
      ),
    );
    bundle('hamstrings', ({ belly }) =>
      belly(
        [
          hip.ischium,
          hip.shaftPoint(0.27, -0.001, -0.011),
          hip.shaftPoint(0.65, 0, -0.01),
          hip.medialCondyle,
        ],
        0.01,
        0.005,
      ),
    );
    bundle('gastrocnemius', ({ belly }) =>
      belly(
        [
          hip.lateralCondyle,
          shin(0.2, sign * 0.005, z - 0.011),
          shin(0.42, 0, z * 0.8 - 0.014),
          shin(0.9, 0, -0.009),
        ],
        0.008,
        0.005,
      ),
    );
    bundle('tibialis anterior', ({ belly }) =>
      belly(
        [
          hip.tibialTuberosity,
          shin(0.25, sign * 0.008, z * 0.8 + 0.008),
          shin(0.51, sign * 0.009, z * 0.5 + 0.009),
          shin(0.98, 0, 0.006),
        ],
        0.005,
        0.004,
      ),
    );
    bundle('Achilles tendon', ({ sweep }) =>
      sweep(
        path(shin, [
          [0.53, 0, z * 0.6 - 0.014],
          [0.73, 0, -0.014],
          [0.94, 0, -0.012],
          [1.08, 0, -0.012],
        ]),
        [
          [0.0046, 0.003],
          [0.0035, 0.0023],
          [0.0025, 0.0018],
          [0.003, 0.0024],
        ],
        tendon,
      ),
    );
    bundle('thenar muscles', ({ belly }) => {
      const pts = roma
        ? [
            [-0.005, -0.003, 0.003],
            [-0.009, -0.013, 0.007],
            [-0.012, -0.022, 0.009],
            [-0.016, -0.027, 0.01],
          ]
        : [
            [-0.003, -0.005, 0.005],
            [-0.007, -0.014, 0.009],
            [-0.007, -0.018, 0.009],
            [-0.008, -0.022, 0.014],
          ];
      belly(path(hand, pts), roma ? 0.0045 : 0.0028, roma ? 0.003 : 0.0021);
    });
    bundle('plantar foot muscles', ({ belly }) =>
      belly(
        path(foot, [
          [0, -0.03, -0.017],
          [-0.006, -0.03, 0.007],
          [-0.006, -0.031, 0.036],
          [-0.01, -0.031, 0.055],
        ]),
        0.009,
        0.003,
      ),
    );
  }
}
