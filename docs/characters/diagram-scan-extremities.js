import { Box3, CatmullRomCurve3, Vector3 } from 'three';
import { local } from './diagram-fabricator.js';

function digitTarget(rig, roma, side, digit) {
  const place = local(rig['hand' + side]);
  const s = side === 'L' ? 1 : -1;
  const map = (x, y, z) => (roma ? place(s * x, y, z) : place(s * x * 1.14, y * 1.06, z * 1.14));
  const fingerSections = [
    [
      [4.9, -30, 14.1],
      [3.91, -38.4, 14.8],
      [0.4, -42.8, 17.6],
      [-0.58, -45.6, 16.82],
    ],
    [
      [6.4, -32.5, 4.5],
      [4.5, -43, 7.31],
      [3.13, -48.5, 6.85],
      [-0.71, -52, 7.33],
    ],
    [
      [4.9, -30.3, -5.1],
      [3.8, -39.96, -4.7],
      [1.4, -45.02, -1.02],
      [-0.92, -48.24, -2.83],
    ],
    [
      [3.4, -27.7, -14.7],
      [2.3, -34.84, -14.3],
      [-0.38, -38.58, -13.34],
      [-2.4, -40.3, -12.2],
    ],
  ];
  if (!roma && rig.secondary.sippy.body.geometry === rig.secondary.sippy.body.userData.mobileGeometry)
    fingerSections[0] = [
      [4.2, -29.8, 14.2],
      [3.4, -35.7, 14.2],
      [3.15, -39.2, 12.6],
      [3.1, -41.2, 11.5],
    ];
  const j = digit === 1 ? 4 : digit - 2;
  const thumb = j === 4;
  let path;
  if (roma) {
    const x = (j - 1.5) * 0.0087,
      len = [0.02, 0.023, 0.022, 0.017][j];
    path = thumb
      ? [
          [-0.008, -0.007, 0.004],
          [-0.013, -0.015, 0.009],
          [-0.017, -0.023, 0.012],
          [-0.021, -0.03, 0.015],
        ]
      : [
          [x * 0.55, -0.009, 0.002],
          [x, -0.032, 0.004],
          [x * 0.98, -0.034 - 0.44 * len, 0.0065],
          [x, -0.034 - 0.77 * len, 0.009],
          [x * 1.04, -0.034 - 1.01 * len, 0.01],
        ];
  } else {
    const z = 0.0143 - j * 0.0096;
    path = thumb
      ? [
          [-0.006, -0.008, 0.006],
          [-0.015, -0.016, 0.02],
          [-0.014, -0.026, 0.028],
          [-0.0075, -0.029, 0.027],
        ]
      : [[0.001, -0.009, z * 0.54], ...fingerSections[j].map((q) => q.map((mm) => mm * 0.001))];
  }
  return path.map((a) => map(...a));
}

const wristBones = /^(SCAPHOID|LUNATE|TRIQUETRUM|PISIFORM|TRAPEZIUM|TRAPEZOID|CAPITATE|HAMATE)_/;
const footBones =
  /^(CALCANEUS|TALUS|NAVICULAR|CUBOID|(?:MEDIAL|INTERMEDIATE|LATERAL)_CUNEIFORM|METATARSAL_\d|PHALANGE_FOOT_\d)_/;

function points(geometry) {
  const a = geometry.getAttribute('position');
  return Array.from({ length: a.count }, (_, i) => new Vector3().fromBufferAttribute(a, i));
}

function frame(origin, down, radial) {
  const y = down.clone().normalize();
  const x = radial.clone().addScaledVector(y, -radial.dot(y)).normalize();
  const z = x.clone().cross(y).normalize();
  return { origin, x, y, z };
}

function toFrame(p, basis) {
  const q = p.clone().sub(basis.origin);
  return new Vector3(q.dot(basis.x), q.dot(basis.y), q.dot(basis.z));
}

function fromFrame(q, basis) {
  return basis.origin
    .clone()
    .addScaledVector(basis.x, q.x)
    .addScaledVector(basis.y, q.y)
    .addScaledVector(basis.z, q.z);
}

// Project each captured shaft onto its own proximal/distal axis. Re-center
// cross sections along the live knuckle path, retaining the CT section and
// fused-digit topology. Each finger still has one selectable source mesh.
function fitDigitBone(geometry, proximal, target, sourceRadial, targetRadial, radius) {
  const vertices = points(geometry);
  const far = vertices.reduce((a, b) =>
    a.distanceToSquared(proximal) > b.distanceToSquared(proximal) ? a : b,
  );
  const basis = frame(proximal, far.clone().sub(proximal), sourceRadial);
  const cloud = vertices.map((p) => toFrame(p, basis));
  const box = new Box3().setFromPoints(cloud);
  const length = box.max.y - box.min.y;
  const rows = 9;
  const sections = [];
  for (let i = 0; i < rows; i++) {
    const h = box.min.y + (length * i) / (rows - 1);
    const ring = cloud.filter((v) => Math.abs(v.y - h) < length * 0.14);
    // Every sparse cap still has vertices in its immediate neighbouring bin.
    const bounds = new Box3().setFromPoints(ring.length ? ring : cloud);
    sections.push(bounds.getCenter(new Vector3()));
  }
  const targetCurve = new CatmullRomCurve3(target);
  const frames = Array.from({ length: rows }, (_, i) =>
    frame(
      targetCurve.getPointAt(i / (rows - 1)),
      targetCurve.getTangentAt(i / (rows - 1)),
      targetRadial,
    ),
  );
  let widest = 0;
  for (const v of cloud) {
    const t = ((v.y - box.min.y) / length) * (rows - 1);
    const row = Math.min(rows - 2, Math.max(0, Math.floor(t)));
    const centre = sections[row].clone().lerp(sections[row + 1], t - row);
    widest = Math.max(widest, Math.hypot(v.x - centre.x, v.z - centre.z));
  }
  const scale = Math.min(radius / widest, targetCurve.getLength() / length);
  return (p) => {
    const v = toFrame(p, basis);
    const t = Math.max(0, Math.min(rows - 1, ((v.y - box.min.y) / length) * (rows - 1)));
    const row = Math.min(rows - 2, Math.floor(t)),
      u = t - row;
    const c = sections[row].clone().lerp(sections[row + 1], u);
    const radial = (v.x - c.x) * scale,
      dorsal = (v.z - c.z) * scale;
    const a = frames[row],
      b = frames[row + 1];
    return a.origin
      .clone()
      .addScaledVector(a.x, radial)
      .addScaledVector(a.z, dorsal)
      .lerp(b.origin.clone().addScaledVector(b.x, radial).addScaledVector(b.z, dorsal), u);
  };
}

function handFit(rig, roma, side, scan, suffix, centre) {
  const wrist = centre('LUNATE').lerp(centre('SCAPHOID'), 0.5);
  const radial = centre('METACARPAL_2').sub(centre('METACARPAL_5'));
  const basis = frame(wrist, centre('METACARPAL_3').sub(wrist), radial);
  const target = Array.from({ length: 5 }, (_, i) => digitTarget(rig, roma, side, i + 1));
  const wristTarget = rig['hand' + side].getWorldPosition(new Vector3());
  const distal = target[2][1].clone().sub(wristTarget);
  const mapped = frame(wristTarget, distal, target[1][1].clone().sub(target[4][1]));
  const carpals = [...scan].filter(([n]) => n.endsWith(suffix) && wristBones.test(n));
  const bounds = new Box3();
  for (const [, g] of carpals) for (const p of points(g)) bounds.expandByPoint(toFrame(p, basis));
  const dims = bounds.getSize(new Vector3());
  const scale = new Vector3(0.024 / dims.x, 0.013 / dims.y, 0.013 / dims.z).multiplyScalar(rig.height);
  function placeCarpus(p) {
    return fromFrame(toFrame(p, basis).multiply(scale), mapped);
  }
  const transforms = new Map(carpals.map(([n]) => [n, placeCarpus]));
  for (let digit = 1; digit <= 5; digit++) {
    const metacarpal = 'METACARPAL_' + digit,
      phalanges = 'PHALANGE_HAND_' + digit;
    const route = target[digit - 1];
    // Connect the metacarpal to its actual carpal surface and aim it at the
    // production knuckle. This also rotates each sedated hand off the pelvis.
    const source = scan.get(metacarpal + suffix);
    const cloud = points(source);
    const near = cloud.reduce((a, b) =>
      a.distanceToSquared(wrist) < b.distanceToSquared(wrist) ? a : b,
    );
    const metRoute = [placeCarpus(near), route[1]];
    transforms.set(
      metacarpal + suffix,
      fitDigitBone(source, wrist, metRoute, basis.x, mapped.x, 0.0035 * rig.height),
    );
    const radius = (digit === 1 ? 0.00275 : roma ? 0.0027 : digit === 2 ? 0.00125 : 0.0015) * rig.height;
    transforms.set(
      phalanges + suffix,
      fitDigitBone(
        scan.get(phalanges + suffix),
        centre(metacarpal),
        route.slice(1),
        basis.x,
        mapped.x,
        radius,
      ),
    );
  }
  return transforms;
}

// The same horizontal sections generate the inspection foot skin. Stay
// inside their inscribed ellipse even with the 16-sided Mobile cut.
export const footSkinRings = [
  [-0.037, 0.019, 0.041, 0.021],
  [-0.033, 0.024, 0.05, 0.022],
  [-0.026, 0.027, 0.052, 0.021],
  [-0.02, 0.026, 0.049, 0.02],
  [-0.014, 0.023, 0.035, 0.01],
  [0, 0.017, 0.021, -0.001],
  [0.015, 0.016, 0.019, -0.002],
  [0.023, 0.012, 0.015, -0.002],
];

function shoeCrossSection(y) {
  const i = Math.max(
    1,
    footSkinRings.findIndex((r) => r[0] >= y),
  );
  const lo = footSkinRings[i - 1],
    hi = footSkinRings[i];
  const u = Math.max(0, Math.min(1, (y - lo[0]) / (hi[0] - lo[0])));
  return lo.map((v, k) => v + (hi[k] - v) * u);
}
function footFit(rig, roma, side, scan, suffix, centre) {
  const foot = rig['foot' + side],
    place = local(foot);
  const s = side === 'L' ? 1 : -1;
  const talus = centre('TALUS'),
    heel = centre('CALCANEUS');
  const radial = centre('METATARSAL_1').sub(centre('METATARSAL_5'));
  const forward = centre('PHALANGE_FOOT_2').sub(heel);
  const basis = frame(talus, forward, radial);
  const bounds = new Box3();
  for (const [n, g] of scan)
    if (n.endsWith(suffix) && footBones.test(n)) {
      for (const p of points(g)) bounds.expandByPoint(toFrame(p, basis));
    }
  // Use one rigidly oriented frame for the whole foot. Its arch, tilted
  // cuneiforms, heel and the natural spacing of all five toes stay together.
  const height = 0.034 / (bounds.max.z - bounds.min.z);
  const width = (roma ? 0.035 : 0.037) / (bounds.max.x - bounds.min.x);
  return (p) => {
    const q = toFrame(p, basis);
    const z = -0.004 + q.y * (q.y < 0 ? -0.022 / bounds.min.y : 0.0725 / bounds.max.y);
    // Plant the displaced human heel and metatarsal fan on the trainer's
    // centerline. Softly compress only the peripheral cortex that approaches
    // the leather last at a tight toe or heel section.
    const shift = z < 0 ? Math.min(1, -z / 0.02) * 0.004 : Math.min(1, z / 0.04) * 0.0095;
    const x = -s * (q.x * width + shift),
      rawY = -0.008 + s * q.z * height;
    // The scanned ankles are plantarflexed. The distal toes and hind heel
    // settle onto the plantar cushion when the foot goes into its trainer.
    const contact = Math.min(
      1,
      z < 0 ? Math.max(0, (-z - 0.012) / 0.015) : Math.max(0, (z - 0.048) / 0.02),
    );
    const y = rawY + contact * (-0.026 - rawY) * 0.78;
    const [, rx, rz, cz] = shoeCrossSection(y);
    const radius = Math.hypot(x / rx, (z - cz) / rz);
    const cap = 0.9;
    const r = radius > cap ? (cap + 0.055 * Math.tanh((radius - cap) / 0.055)) / radius : 1;
    return place(x * r, y, cz + (z - cz) * r);
  };
}

export function makeExtremityFit(rig, roma, side, scan) {
  const suffix = side === 'L' ? '_LEFT' : '_RIGHT';
  const centre = (key) => scan.get(key + suffix).boundingBox.getCenter(new Vector3());
  const hands = handFit(rig, roma, side, scan, suffix, centre);
  const feet = footFit(rig, roma, side, scan, suffix, centre);
  return (key) => hands.get(key) ?? (key.endsWith(suffix) && footBones.test(key) ? feet : undefined);
}
