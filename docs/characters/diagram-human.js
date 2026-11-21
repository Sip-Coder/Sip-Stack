import { fabricator, local, v, romaSkin, sippySkin } from './diagram-fabricator.js';
import { shoulderLandmarks, buildUpper } from './diagram-shoulder.js';
import { pelvisLandmarks, buildLower } from './diagram-pelvis.js';
import { thoraxLandmarks, buildThorax } from './diagram-thorax.js';
import { headLandmarks, buildHead } from './diagram-skull.js';
import { seatHairRoots } from './diagram-hair-roots.js';
import { fitMuscleFolds, muscleEnvelope } from './diagram-fascia.js';
import { buildMuscles } from './diagram-muscles.js';

// Roma's shipped costume covers her trunk and limbs, which have no underlying
// skin triangles there. These inspection-only sections meet her real neck and
// wrists; her exposed face and fingers are taken directly from the live model.
function coveredSkin(rig, roma, part) {
  if (roma) {
    const cols = 24,
      chest = local(rig.chest),
      hips = local(rig.hips);
    // The covered waist follows the pelvic ring while the upper rib cage
    // follows the chest. Blend through the abdomen during flexion.
    const place = (x, y, z) => {
      const t = Math.max(0, Math.min(1, (y + 0.045) / 0.11));
      const h = rig.chest.position,
        scale = rig.chest.scale;
      return hips(h.x + x * scale.x, h.y + y * scale.y, h.z + z * scale.z).lerp(
        chest(x, y, z),
        t * t * (3 - 2 * t),
      );
    };
    part('Covered torso and hips', 'skin', ({ bands }) => {
      bands(
        place,
        [
          [-0.155, 0.039, 0.029, -0.002],
          [-0.137, 0.067, 0.044, -0.001],
          [-0.114, 0.079, 0.048, -0.001],
          [-0.084, 0.082, 0.049, 0.001],
          [-0.051, 0.083, 0.044, 0.001],
          [-0.008, 0.08, 0.046, 0.002],
          [0.04, 0.073, 0.05, 0.002],
          [0.089, 0.089, 0.05, 0],
          [0.118, 0.096, 0.047, -0.002],
          [0.137, 0.08, 0.04, -0.001],
          [0.152, 0.057, 0.032, 0.001],
          [0.16, 0.031, 0.026, 0.001],
        ],
        romaSkin,
        cols,
      );
    });
    for (const [side, sign] of [
      ['L', 1],
      ['R', -1],
    ]) {
      const label = side === 'L' ? 'Left ' : 'Right ',
        arm = rig['upperArm' + side],
        elbow = rig['forearm' + side],
        hip = rig['thigh' + side],
        knee = rig['shin' + side];
      // Loft the wearable skin around both articulating bones as a single
      // continuous surface. Intermediate rings follow the bisector of the
      // flexed joint, so the elbow and knee have no circular end caps.
      function limb(net, segments, high) {
        const rings = segments.flatMap(([node, rows]) => rows.map((row) => [local(node), row]));
        const placeRing = ([place, [y, rx, rz, cz = 0, cx = 0, tilt = 0]], a) => {
          const cross = rx * Math.cos(a);
          return place(cx + cross * Math.cos(tilt), y + sign * cross * Math.sin(tilt), cz - rz * Math.sin(a));
        };
        net(
          2 * rings.length - 1,
          high ? 28 : 18,
          (i, j, t, a) => {
            const k = Math.floor(i / 2),
              q = placeRing(rings[k], a);
            if (i % 2) q.lerp(placeRing(rings[k + 1], a), 0.5);
            return q;
          },
          romaSkin,
        );
      }
      part(label + 'covered arm', 'skin', ({ net, high }) => {
        limb(
          net,
          [
            [
              elbow,
              [
                [-0.149, 0.014, 0.013, 0, sign * 0.002],
                [-0.134, 0.016, 0.016, 0, sign * 0.002],
                [-0.092, 0.021, 0.021, 0, sign * 0.002],
                [-0.042, 0.025, 0.024, 0, sign * 0.001],
                [-0.016, 0.022, 0.023, 0.001],
                [0, 0.021, 0.022, 0.001],
              ],
            ],
            [
              arm,
              [
                [-0.15, 0.023, 0.024, 0.001, sign * 0.009],
                [-0.119, 0.026, 0.026, 0.002, sign * 0.007],
                [-0.087, 0.029, 0.03, 0.002, sign * 0.006],
                [-0.038, 0.031, 0.03, 0.001, sign * 0.001],
                [-0.021, 0.033, 0.031, -0.002, -sign * 0.003, 0.22],
                [-0.008, 0.033, 0.032, -0.002, -sign * 0.009, 0.65],
                [0.001, 0.029, 0.029, -0.003, -sign * 0.02, 1.0],
              ],
            ],
            [
              rig.chest,
              [
                [0.132, 0.021, 0.029, -0.003, sign * 0.076, 1.57],
                [0.131, 0.021, 0.028, -0.003, sign * 0.054, 1.57],
                [0.13, 0.016, 0.024, -0.002, sign * 0.044, 1.57],
              ],
            ],
          ],
          high,
        );
      });
      part(label + 'covered leg', 'skin', ({ net, high }) => {
        limb(
          net,
          [
            [
              knee,
              [
                [-0.214, 0.018, 0.02, -0.002],
                [-0.175, 0.02, 0.022, -0.003],
                [-0.123, 0.028, 0.032, -0.004],
                [-0.077, 0.035, 0.037, -0.005],
                [-0.043, 0.033, 0.034, -0.003],
                [-0.018, 0.026, 0.03, -0.002],
                [0, 0.024, 0.028, -0.001],
              ],
            ],
            [
              hip,
              [
                [-0.229, 0.027, 0.031, 0.003],
                [-0.216, 0.029, 0.032, -0.001],
                [-0.159, 0.037, 0.04, -0.001],
                [-0.088, 0.043, 0.045, 0.001],
                [-0.04, 0.045, 0.048, -0.002],
                [-0.015, 0.044, 0.047, -0.003, -sign * 0.001],
                [0.009, 0.037, 0.044, -0.004, -sign * 0.004],
              ],
            ],
            [
              rig.hips,
              [
                [0.022, 0.035, 0.044, -0.003, sign * 0.047],
                [0.039, 0.037, 0.038, -0.003, sign * 0.037],
                [0.054, 0.029, 0.03, -0.003, sign * 0.032],
              ],
            ],
          ],
          high,
        );
      });
    }
  }
  // Both actors' original body cuts stop at their ankle. Match the shoe last
  // with a low rounded heel, arch and forefoot under their actual trainers.
  for (const side of ['L', 'R']) {
    const place = local(rig['foot' + side]);
    part((side === 'L' ? 'Left' : 'Right') + ' foot inside trainer', 'skin', ({ bands }) => {
      bands(
        place,
        [
          [-0.037, 0.019, 0.041, 0.021],
          [-0.033, 0.024, 0.05, 0.022],
          [-0.026, 0.027, 0.052, 0.021],
          [-0.02, 0.026, 0.049, 0.02],
          [-0.014, 0.023, 0.035, 0.01],
          [0, 0.017, 0.021, -0.001],
          [0.015, 0.016, 0.019, -0.002],
          [0.023, 0.012, 0.015, -0.002],
        ],
        roma ? romaSkin : sippySkin,
      );
    });
  }
}

// Each origin, insertion and joint surface is reconstructed from this pose.
export function addHumanInterior(rig, name, tier, parts) {
  const roma = name === 'roma';
  const part = fabricator(tier, rig.height, parts);
  coveredSkin(rig, roma, part);
  const pelvis = pelvisLandmarks(rig, roma);
  const head = headLandmarks(rig, roma);
  seatHairRoots(parts, head, roma);
  const thorax = thoraxLandmarks(rig, roma, pelvis, parts, head);
  const shoulders = shoulderLandmarks(rig, roma, thorax, parts);
  buildThorax(rig, roma, part, thorax);
  buildHead(rig, roma, part, head);
  buildUpper(rig, roma, part, shoulders);
  buildLower(rig, roma, part, pelvis);
  const fit = muscleEnvelope(parts, rig.height);
  const musclePart = (name, layer, assemble) =>
    part(name, layer, (tools) =>
      assemble({
        ...tools,
        belly(points, width, depth, options) {
          tools.belly(points, width, depth, { ...options, fit });
        },
        sweep(points, radii, color, options) {
          tools.sweep(points, radii, color, { ...options, fit });
        },
      }),
    );
  const muscleStart = parts.length;
  buildMuscles(rig, roma, musclePart, { head, thorax, pelvis, shoulders }, fit);
  for (const p of parts.slice(muscleStart)) fitMuscleFolds(p.mesh.geometry, fit);
  return { head, thorax, pelvis, shoulders };
}
