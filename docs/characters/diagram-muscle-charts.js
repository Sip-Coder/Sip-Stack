// DBCLS mesh coordinates, in the decoded glTF's Y-up anatomical rest pose.
// All transforms end on this subject's posed CT centers, not the actor's AABB.
import { Matrix4, Vector3 } from 'three';

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const mid = (p, q) => p.clone().lerp(q, 0.5);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const axis = (node, index) => v().setFromMatrixColumn(node.matrixWorld, index).normalize();
function chart(a, b, x) {
  const y = b.clone().sub(a).normalize();
  const lateral = x.clone().projectOnPlane(y).normalize();
  return new Matrix4().makeBasis(lateral, y, lateral.clone().cross(y)).setPosition(a);
}
function segment(a, b, c, d, x, tx, width, depth) {
  const m = chart(c, d, tx)
    .multiply(new Matrix4().makeScale(width, c.distanceTo(d) / a.distanceTo(b), depth))
    .multiply(chart(a, b, x).invert());
  return (p) => p.clone().applyMatrix4(m);
}
function between(lo, hi, a, b) {
  return (p) => {
    if (p.y <= a) return lo(p);
    if (p.y >= b) return hi(p);
    return lo(p).lerp(hi(p), smooth(a, b, p.y));
  };
}
const center = (g) => g.boundingBox.getCenter(v());
const direction = (a, b) => a.clone().sub(b).normalize();

// Give the axial tissues the rib cage's measured anterior, posterior and
// lateral extents. This avoids imposing adult rib proportions on a hero in
// flexion and also keeps the neck and the pelvis on their own joint frames.
function trunkCharts(rig, lm) {
  const { bones } = lm.scan,
    { thorax, head, pelvis } = lm;
  const frame = thorax.chest,
    p = (pt) => frame.from(pt);
  const ribExtents = (n) => {
    const lo = v(Infinity, Infinity, Infinity),
      hi = v(-Infinity, -Infinity, -Infinity);
    for (const side of ['LEFT', 'RIGHT']) {
      const a = bones.get('RIB_' + n + '_' + side).attributes.position,
        q = v();
      for (let k = 0; k < a.count; k++) {
        const point = p(q.fromBufferAttribute(a, k));
        lo.min(point);
        hi.max(point);
      }
    }
    return { lo, hi };
  };
  // Each station records an atlas vertebral/rib-level section: donor Y,
  // half-width, anterior/posterior cortical depths and corresponding CT ribs.
  const ribStations = [
    [1.115, 0.115, 0.045, -0.087, 11],
    [1.166, 0.126, 0.091, -0.096, 9],
    [1.224, 0.134, 0.102, -0.101, 7],
    [1.281, 0.129, 0.098, -0.1, 5],
    [1.337, 0.113, 0.075, -0.088, 3],
    [1.392, 0.077, 0.042, -0.073, 1],
  ].map(([y, w, front, back, n]) => {
    const { lo, hi } = ribExtents(n),
      len = hi.clone().sub(lo);
    const depth = (hi.z - lo.z) / (front - back),
      scale = len.x / (2 * w);
    return {
      y,
      target: frame.point((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z - back * depth),
      x: frame.direction(1, 0, 0).multiplyScalar(scale),
      z: frame.direction(0, 0, 1).multiplyScalar(depth),
    };
  });
  const hips = mid(lm.pelvis.L.femoralHead, lm.pelvis.R.femoralHead);
  const pelvisX = direction(lm.pelvis.L.femoralHead, lm.pelvis.R.femoralHead);
  const pelvisZ = axis(rig.hips, 2),
    torsoX = axis(rig.chest, 0),
    torsoZ = axis(rig.chest, 2);
  const pelvisWidth = lm.pelvis.L.femoralHead.distanceTo(lm.pelvis.R.femoralHead) / 0.172;
  const depth = Math.min(pelvisWidth * 0.87, 0.8);
  const pelvicStation = (y, t, z) => ({
    y,
    target: t.clone().addScaledVector(pelvisZ, -z * depth),
    x: pelvisX.clone().multiplyScalar(pelvisWidth),
    z: pelvisZ.clone().multiplyScalar(depth),
  });
  const neckWidth = lm.shoulders.L.headCenter.distanceTo(lm.shoulders.R.headCenter) / 0.319;
  const neckStation = (y, target, x, z, originZ, scaleZ) => ({
    y,
    target: target.clone().addScaledVector(z, -originZ * scaleZ),
    x: x.clone().multiplyScalar(neckWidth * 0.7),
    z: z.clone().multiplyScalar(scaleZ),
  });
  const headX = direction(head.place(1, 0, 0), head.place(0, 0, 0)),
    headZ = direction(head.place(0, 0, 1), head.place(0, 0, 0));
  const data = [
    pelvicStation(0.82, pelvis.coccyx, -0.094),
    pelvicStation(0.895, hips, -0.024),
    pelvicStation(1.005, pelvis.s1, -0.058),
    ...ribStations,
    neckStation(1.44, thorax.vertebra('C7'), torsoX, torsoZ, -0.052, neckWidth * 0.7),
    neckStation(1.516, thorax.vertebra('C3'), headX, headZ, -0.04, neckWidth * 0.69),
    neckStation(1.554, head.atlas, headX, headZ, -0.04, neckWidth * 0.71),
    neckStation(1.608, head.place(0, head.eye, 0.28), headX, headZ, 0.032, neckWidth * 0.8),
  ];
  const span = (r, p) => r.target.clone().addScaledVector(r.x, p.x).addScaledVector(r.z, p.z);
  return (p) => {
    let i = 1;
    while (i < data.length - 1 && p.y > data[i].y) i++;
    const a = data[i - 1],
      b = data[i];
    return span(a, p).lerp(span(b, p), (p.y - a.y) / (b.y - a.y));
  };
}

export function atlasCharts(rig, roma, lm, project) {
  const trunk = trunkCharts(rig, lm),
    out = {};
  for (const [key, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const suffix = key === 'L' ? '_LEFT' : '_RIGHT',
      ct = (id) => center(lm.scan.bones.get(id + suffix));
    const a = lm.shoulders[key],
      b = lm.pelvis[key],
      right = v(1, 0, 0),
      radial = v(s, 0, 0.12).normalize();
    const S = (x, y, z) => v(s * x, y, z);
    const shoulder = S(0.163, 1.39, -0.025),
      elbow = S(0.208, 1.12, -0.037);
    const wrist = S(0.245, 0.891, 0.01),
      middle = S(0.259, 0.842, 0.027);
    const hip = S(0.087, 0.894, -0.024),
      knee = S(0.077, 0.465, -0.015),
      ankle = S(0.078, 0.063, -0.036);
    const radialTarget = direction(ct('SCAPHOID'), ct('TRIQUETRUM'));
    const handAcross = direction(ct('METACARPAL_2'), ct('METACARPAL_5'));
    const wristTarget = mid(ct('LUNATE'), ct('SCAPHOID'));
    const upper = segment(
      shoulder,
      elbow,
      a.headCenter,
      a.elbow,
      right,
      axis(a.arm, 0),
      roma ? 0.69 : 0.74,
      roma ? 0.66 : 0.71,
    );
    const fore = segment(
      elbow,
      wrist,
      a.elbow,
      wristTarget,
      radial,
      radialTarget,
      roma ? 0.62 : 0.66,
      roma ? 0.66 : 0.65,
    );
    const hand = segment(wrist, middle, wristTarget, ct('METACARPAL_3'), radial, handAcross, 0.55, 0.48);
    const digitSegment = (i, start, end) => {
      const g = lm.scan.bones.get('PHALANGE_HAND_' + i + suffix),
        pos = g.attributes.position;
      const palm = ct('METACARPAL_' + i),
        distal = center(g),
        along = direction(distal, palm);
      const span = { min: Infinity, max: -Infinity },
        q = v(),
        rows = Array.from({ length: 5 }, () => ({ p: v(), n: 0 }));
      for (let j = 0; j < pos.count; j++) {
        const t = q.fromBufferAttribute(pos, j).sub(palm).dot(along);
        span.min = Math.min(span.min, t);
        span.max = Math.max(span.max, t);
      }
      for (let j = 0; j < pos.count; j++) {
        q.fromBufferAttribute(pos, j);
        const t = (q.clone().sub(palm).dot(along) - span.min) / (span.max - span.min);
        const row = rows[Math.min(4, Math.floor(t * 5))];
        row.p.add(q);
        row.n++;
      }
      for (let j = 0; j < 5; j++) {
        if (rows[j].n) rows[j].p.divideScalar(rows[j].n);
        else rows[j].p.copy(palm).addScaledVector(along, span.min + ((span.max - span.min) * j) / 4);
      }
      const length = start.distanceTo(end),
        dir = direction(end, start),
        source = [0, 0.25, 0.5, 0.75, 1].map((t) => start.clone().lerp(end, t));
      const segments = rows
        .slice(0, -1)
        .map((r, k) => segment(source[k], source[k + 1], r.p, rows[k + 1].p, right, handAcross, 0.39, 0.42));
      return (p) => {
        const t = p.clone().sub(start).dot(dir) / length;
        const k = Math.min(3, Math.max(0, Math.floor(t * 4)));
        return segments[k](p);
      };
    };
    const thumb = digitSegment(1, S(0.284, 0.87, 0.035), S(0.317, 0.806, 0.061));
    const thumbChart = (p) => thumb(p).lerp(hand(p), smooth(0.851, 0.89, p.y));
    const arm = between(between(hand, fore, 0.855, 0.919), upper, 1.087, 1.166);
    const thigh = segment(
      hip,
      knee,
      b.femoralHead,
      b.knee,
      right,
      axis(rig['thigh' + key], 0),
      roma ? 0.81 : 0.83,
      roma ? 0.78 : 0.76,
    );
    const shank = segment(
      knee,
      ankle,
      b.knee,
      ct('TALUS'),
      right,
      axis(rig['shin' + key], 0),
      roma ? 0.67 : 0.69,
      roma ? 0.68 : 0.71,
    );
    const calf = between(shank, thigh, 0.423, 0.494);
    const toe = S(0.108, 0.018, 0.098),
      heel = S(0.078, 0.026, -0.063);
    const foot = segment(
      heel,
      toe,
      ct('CALCANEUS'),
      ct('PHALANGE_FOOT_2'),
      right,
      direction(ct('METATARSAL_5'), ct('METATARSAL_1')).multiplyScalar(s),
      0.52,
      0.57,
    );
    const leg = between(foot, calf, 0.032, 0.092);
    const archAcross = direction(ct('METATARSAL_5'), ct('METATARSAL_1')).multiplyScalar(s);
    const tendonFoot = (digit, flexor) => {
      const sourceMalleolus = S(flexor ? 0.073 : 0.092, 0.061, flexor ? -0.042 : -0.009),
        sourceArch = S(digit === 1 ? 0.075 : 0.095, flexor ? 0.02 : 0.03, 0.01),
        sourceEnd = S(digit === 1 ? 0.068 : 0.11, flexor ? 0.006 : 0.014, 0.109);
      const sole = axis(rig['foot' + key], 1),
        offset = flexor ? -0.005 : 0.005;
      const talus = ct('TALUS'),
        midFoot = ct(digit === 1 ? 'MEDIAL_CUNEIFORM' : 'INTERMEDIATE_CUNEIFORM').addScaledVector(
          sole,
          offset,
        );
      const end = ct('PHALANGE_FOOT_' + digit).addScaledVector(sole, offset * 0.3);
      const channel = segment(sourceMalleolus, sourceArch, talus, midFoot, right, archAcross, 0.39, 0.4),
        plantar = segment(sourceArch, sourceEnd, midFoot, end, right, archAcross, 0.41, 0.45);
      return (p) => {
        if (p.y >= 0.13) return calf(p);
        const foot = p.z >= 0.035 ? plantar(p) : channel(p).lerp(plantar(p), smooth(-0.012, 0.035, p.z));
        return foot.lerp(calf(p), smooth(0.034, 0.13, p.y));
      };
    };
    // Distinct gluteal, medial-compartment and pelvic-floor fields terminate
    // on the actual subject's hip. In Roma the wider acetabular span and the
    // oblique shaft-to-knee vector emerge from the female CT, including when
    // the production thigh rotates relative to her pelvis.
    const hipWarp = (group, p) => {
      const lateral = p.x * s;
      let blend;
      if (group === 'gluteal') {
        blend = 1 - smooth(0.76, 0.99, p.y - 0.055 * smooth(0.052, 0.14, lateral));
      } else if (group === 'adductor') {
        blend = 1 - smooth(0.79, 0.906, p.y - 0.039 * smooth(0.013, 0.1, lateral));
      } else {
        blend = 1 - smooth(0.817, 0.965, p.y - 0.025 * smooth(0.035, 0.12, lateral));
      }
      if (p.y < 0.73) return leg(p);
      return trunk(p).lerp(thigh(p), blend);
    };
    // Register the blade itself using its three non-collinear CT landmarks.
    // Projecting in the chest frame would shorten the subscapular fossa and
    // turn over cuff triangles as the shoulder protracts.
    const scapula = 'SCAPULA' + suffix;
    const plate = (root, outer, lower) => {
      const x = outer.clone().sub(root),
        y = lower.clone().sub(root),
        z = x.clone().cross(y).normalize();
      return new Matrix4().makeBasis(x, y, z).setPosition(root);
    };
    const rawBlade = plate(S(0.067, 1.378, -0.09), S(0.165, 1.408, -0.029), S(0.089, 1.264, -0.104));
    const fittedBlade = plate(
      project(scapula, a.spineRoot),
      project(scapula, a.acromion),
      project(scapula, a.inferior),
    );
    const blade = fittedBlade
      .multiply(new Matrix4().makeScale(1, 1, roma ? 0.65 : 0.7))
      .multiply(rawBlade.invert());
    // Superficial sheets span independently moving skeletal segments. The
    // cap follows the humerus distally, the scapular spine posteriorly, and
    // the clavicle at its anterior lip. Axial fans join the humeral insertion
    // only near the axilla; their broad spinal and costal roots stay axial.
    const axillary = (p) => trunk(p).lerp(upper(p), smooth(0.113, 0.177, s * p.x) * smooth(1.237, 1.328, p.y));
    const deltoid = (p) => {
      const root = trunk(p).lerp(p.clone().applyMatrix4(blade), 1 - smooth(-0.054, -0.008, p.z));
      const cap = smooth(0.117, 0.207, s * p.x) * 0.75
        + (1 - smooth(1.305, 1.426, p.y)) * 0.72;
      return root.lerp(upper(p), Math.min(1, cap));
    };
    out[key] = {
      arm, deltoid, axillary,
      trapezius: (p) => trunk(p).lerp(p.clone().applyMatrix4(blade), smooth(0.023, 0.14, s * p.x)),
      thumb: (p) => (p.y >= 0.91 ? arm(p) : thumbChart(p).lerp(arm(p), smooth(0.88, 0.91, p.y))),
      leg,
      flexHallux: tendonFoot(1, true),
      extendHallux: tendonFoot(1, false),
      flexToes: tendonFoot(2, true),
      extendToes: tendonFoot(2, false),
      hipWarp,
      trunk,
      cuff: (p) =>
        p
          .clone()
          .applyMatrix4(blade)
          .lerp(upper(p), smooth(0.142, 0.183, s * p.x)),
      pecMinor: (p) => trunk(p).lerp(p.clone().applyMatrix4(blade), smooth(1.329, 1.4, p.y)),
    };
  }
  return out;
}

export function atlasRegion(id, geometry) {
  const p = center(geometry);
  if (/deltoid_/.test(id)) return 'deltoid';
  if (/latissimus_dorsi|pectoralis_major/.test(id)) return 'axillary';
  if (/trapezius_/.test(id)) return 'trapezius';
  if (/biceps_brachii/.test(id)) return 'arm';
  if (/rectus_abdominis/.test(id)) return 'trunk';
  if (/pectoralis_minor/.test(id)) return 'pecMinor';
  if (/flexor_hallucis_longus/.test(id)) return 'flexHallux';
  if (/extensor_hallucis_longus/.test(id)) return 'extendHallux';
  if (/flexor_digitorum_longus/.test(id)) return 'flexToes';
  if (/extensor_digitorum_longus/.test(id)) return 'extendToes';
  if (/pollicis/.test(id)) return 'thumb';
  if (/teres_(minor|major)|supraspinatus|infraspinatus|subscapularis|coracobrachialis/.test(id))
    return 'shoulder';
  if (/gluteus|piriformis|tensor_fasciae/.test(id)) return 'gluteal';
  if (/adductor_|gracilis|pectineus|obturator_|gemellus|quadratus_femoris/.test(id)) return 'adductor';
  if (/psoas|iliacus|semitendinosus|semimembranosus|sartorius|biceps_femoris|rectus_femoris|vastus/.test(id))
    return 'hip';
  if (
    /_leg|_foot|hallucis|tibialis|popliteus|fibularis|gastrocnemius|soleus|flexor_accessorius/.test(id) ||
    geometry.boundingBox.max.y < 0.62
  )
    return 'leg';
  if (
    Math.abs(p.x) > 0.15 ||
    /forearm|brachialis|anconeus|_hand|carpi_|pollicis|pronator_|digiti_minimi|extensor_indicis/.test(id)
  )
    return 'arm';
  return 'trunk';
}
