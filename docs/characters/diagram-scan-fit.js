// The atlas is in the decoded GLB scene coordinates shared by both LODs.
// Ball centers were measured by a robust sphere fit to the medial/superior
// articular cortex of each original High head. Elbow pivots use the approach
// of the two surviving shaft axes across each subject's missing CT slices.
import * as T from 'three';
import { makeExtremityFit } from './diagram-scan-extremities.js';
import { repairScanJoints, scanPartName } from './diagram-scan-repairs.js';
import { fitSkull } from './diagram-scan-cranium.js';
import { refineCurvedFit } from './diagram-scan-curved-fit.js';
import { scanEnvelope, shoulderBridge } from './diagram-scan-envelope.js';
import { seatScanJoints } from './diagram-scan-seats.js';
import { seatAxialCortex } from './diagram-scan-column.js';
import { bakeScanAO } from './diagram-scan-ao.js';

const male = {
  height: 1.857,
  L: { hip: [0.343, 0.9985, -0.2373], shoulder: [0.4266, 1.5735, -0.2309], elbow: [0.492, 1.277, -0.294] },
  R: { hip: [0.1658, 0.9993, -0.2343], shoulder: [0.065, 1.5594, -0.2297], elbow: [0.004, 1.274, -0.287] },
  orbital: [0.249, 1.766, -0.137],
  chin: 1.643,
  crown: 1.865,
  orbitalSpacing: 0.0304,
  lumbosacral: 1.124,
  thoracolumbar: 1.293,
};
const female = {
  height: 1.717,
  L: { hip: [0.3366, 0.8826, -0.225], shoulder: [0.4046, 1.4595, -0.2478], elbow: [0.468, 1.202, -0.299] },
  R: { hip: [0.14, 0.8814, -0.2273], shoulder: [0.0787, 1.4475, -0.2467], elbow: [0.016, 1.185, -0.302] },
  orbital: [0.2376, 1.618, -0.159],
  chin: 1.515,
  crown: 1.724,
  orbitalSpacing: 0.03,
  lumbosacral: 1.002,
  thoracolumbar: 1.192,
};
const up = new T.Vector3(0, 1, 0),
  right = new T.Vector3(1, 0, 0);
const vec = (values) => new T.Vector3().fromArray(values);
const mid = (a, b) => a.clone().lerp(b, 0.5);
const direction = (node, axis) => axis.clone().transformDirection(node.matrixWorld);
const center = (geometry) => geometry.boundingBox.getCenter(new T.Vector3());
const smooth = (x) => T.MathUtils.smoothstep(x, 0, 1);

function chart(origin, across, top) {
  const x = across.clone().normalize();
  const y = top.clone().projectOnPlane(x).normalize();
  return new T.Matrix4().makeBasis(x, y, new T.Vector3().crossVectors(x, y)).setPosition(origin);
}

// Coordinate changes preserve chirality. 'across' always has the same
// anatomical meaning in the source and target, including pronated forearms.
function betweenCharts(source, target, x, y, z) {
  const m = target
    .clone()
    .multiply(new T.Matrix4().makeScale(x, y, z))
    .multiply(source.clone().invert());
  return (p) => p.clone().applyMatrix4(m);
}

function longSegment(a, b, across, c, d, acrossTarget, width, depth) {
  const along = b.clone().sub(a),
    target = d.clone().sub(c);
  const y = along.clone().normalize(),
    yTarget = target.clone().normalize();
  const source = chart(a, across.clone().projectOnPlane(y), y);
  const destination = chart(c, acrossTarget.clone().projectOnPlane(yTarget), yTarget);
  return betweenCharts(source, destination, width, target.length() / along.length(), depth);
}

// Unit vectors point distally along the anatomical shaft. Each is the
// least-squares line through nine closed cortical section centroids between
// 28% and 59% of the source femur's height, measured from the distal end.
const femoralShaftDirections = {
  sippy: { L: [-0.019776, -0.999773, 0.007968], R: [0.004725, -0.999962, 0.007272] },
  roma: { L: [-0.187393, -0.981437, 0.040818], R: [0.177907, -0.983514, 0.032398] },
};

function fitFemur(
  sourceHead,
  sourceKnee,
  targetHead,
  targetKnee,
  targetAcross,
  sourceShaft,
  scale,
  fitCondyles,
) {
  const sourceAxis = sourceKnee.clone().sub(sourceHead);
  const targetAxis = targetKnee.clone().sub(targetHead);
  const sourceLength = sourceAxis.dot(sourceShaft);
  const targetDistance = targetAxis.length();
  const targetDirection = targetAxis.clone().normalize();
  const sourceFrame = chart(
    sourceHead,
    right.clone().projectOnPlane(sourceAxis.clone().normalize()),
    sourceAxis,
  );
  const targetFrame = chart(targetHead, targetAcross.clone().projectOnPlane(targetDirection), targetAxis);
  const rotation = new T.Quaternion()
    .setFromRotationMatrix(targetFrame)
    .multiply(new T.Quaternion().setFromRotationMatrix(sourceFrame).invert());

  // The mechanical axis from head to knee is oblique to the cortical shaft.
  // Keep the source head offset normal to that shaft. With both hip and knee
  // fixed, this offset determines the target shaft orientation and length.
  const rotatedShaft = sourceShaft.clone().applyQuaternion(rotation);
  const headOffset = sourceAxis.clone().addScaledVector(sourceShaft, -sourceLength).length() * scale;
  const targetLength = Math.sqrt(targetDistance ** 2 - headOffset ** 2);
  const towardShaft = rotatedShaft.clone().projectOnPlane(targetDirection).normalize();
  const targetShaft = targetDirection
    .clone()
    .multiplyScalar(targetLength / targetDistance)
    .addScaledVector(towardShaft, headOffset / targetDistance);
  rotation.premultiply(new T.Quaternion().setFromUnitVectors(rotatedShaft, targetShaft));
  const lengthAdjustment = targetLength - scale * sourceLength;

  return (point) => {
    const offset = point.clone().sub(sourceHead);
    const station = offset.dot(sourceShaft) / sourceLength;
    // The proximal fifth contains the spherical head, narrow neck and both
    // trochanters. Its scale is equal in every direction. Redistribute length
    // along the shaft below it, leaving the neck–shaft angle intact.
    const fitted = offset.applyQuaternion(rotation).multiplyScalar(scale).add(targetHead);
    fitted.addScaledVector(targetShaft, lengthAdjustment * T.MathUtils.smoothstep(station, 0.2, 0.9));
    // Transition across the distal third. Both condyles and their articular
    // surface use exactly the prior knee transform by the final 9%.
    return fitted.lerp(fitCondyles(point), T.MathUtils.smoothstep(station, 0.72, 0.91));
  };
}

function averageUpperPlate(geometry) {
  const pos = geometry.attributes.position,
    top = geometry.boundingBox.max.y,
    out = new T.Vector3();
  const p = new T.Vector3();
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (p.y >= top - 0.018) {
      out.add(p);
      n++;
    }
  }
  return out.multiplyScalar(1 / n);
}

// Frame the intact rib assembly from the two glenohumeral centers, not from
// the endpoints of the truncated humeri. This removes the acquisition tilt
// without mirroring either specimen or losing its real thoracic asymmetry.
function fitTrunk(rig, roma, atlas, landmarks) {
  const { pelvis, shoulders, thorax } = landmarks;
  const sourceShoulderL = vec(atlas.L.shoulder),
    sourceShoulderR = vec(atlas.R.shoulder);
  const span = sourceShoulderL.clone().sub(sourceShoulderR);
  const targetSpan = shoulders.L.headCenter.clone().sub(shoulders.R.headCenter);
  const chestSource = chart(mid(sourceShoulderL, sourceShoulderR), span, up);
  const chestTarget = chart(
    mid(shoulders.L.headCenter, shoulders.R.headCenter),
    targetSpan,
    direction(rig.chest, up),
  );
  const baseChest = betweenCharts(
    chestSource,
    chestTarget,
    targetSpan.length() / span.length(),
    roma ? 0.82 : 0.72,
    roma ? 0.72 : 0.65,
  );

  // The rig carries the arm below the neck base. Raise the medial thoracic
  // column into that space while leaving the lateral glenoid in its actual
  // arm socket. Posterior ribs rise with their vertebra; anterior ends stay
  // on the costal margin. This retains the scan's descending rib inclination.
  const toChest = chestSource.clone().invert();
  const vertical = direction(rig.chest, up);
  const chest = (p) => {
    const q = p.clone().applyMatrix4(toChest);
    const medial = 1 - smooth(Math.abs(q.x) / (span.length() * 0.48));
    const dorsal = T.MathUtils.lerp(0.43, 1, smooth((0.07 - q.z) / 0.115));
    const rise = T.MathUtils.clamp((p.y - atlas.thoracolumbar) * 0.13 + 0.017, 0.008, 0.056);
    return baseChest(p).addScaledVector(vertical, medial * dorsal * rise);
  };

  const sourceHipL = vec(atlas.L.hip),
    sourceHipR = vec(atlas.R.hip);
  const origin = pelvis.place(0, -0.004, roma ? -0.003 : -0.006);
  const hipsSource = chart(mid(sourceHipL, sourceHipR), sourceHipL.clone().sub(sourceHipR), up);
  const hipsTarget = chart(
    origin,
    pelvis.place(1, 0, 0).sub(pelvis.place(0, 0, 0)),
    pelvis.place(0, 1, 0).sub(pelvis.place(0, 0, 0)),
  );
  const scale = rig.height / atlas.height;
  const hips = betweenCharts(hipsSource, hipsTarget, scale * (roma ? 0.94 : 0.93), 0.79, roma ? 0.74 : 0.67);

  // Reserve a thin superficial tissue layer where the wearable body's chest
  // really narrows. Apply the same radial rule across all ribs and sternum.
  const limitRibs = (p) => {
    const q = thorax.chest.from(chest(p));
    const radius = Math.hypot(q.x, q.z);
    // The upper anterior ribs carry a true pectoral belly. The lower
    // costal margin and dorsal cage require only a thin tissue reserve.
    const anterior = smooth((q.z / Math.max(0.001, radius) - 0.05) / 0.66);
    const pec = roma ? 0 : anterior * smooth((p.y - 1.3) / 0.13);
    const padding = T.MathUtils.lerp(0.0045, 0.01 * rig.height, pec);
    const max = thorax.gauge(q.y, Math.atan2(q.x, q.z)) - padding;
    if (radius > max && max > 0.02) {
      q.x *= max / radius;
      q.z *= max / radius;
    }
    return thorax.chest.point(q.x, q.y, q.z);
  };
  return { chest, hips, limitRibs };
}

function fitSide(rig, roma, side, atlas, bones, landmarks, chest, hips, envelope, parts) {
  const source = atlas[side],
    { pelvis, shoulders } = landmarks;
  const arm = shoulders[side],
    leg = pelvis[side];
  const suffix = side === 'L' ? '_LEFT' : '_RIGHT',
    sign = side === 'L' ? 1 : -1;
  const bone = (key) => bones.get(key + suffix);
  const hip = vec(source.hip),
    shoulder = vec(source.shoulder),
    elbow = vec(source.elbow);
  const knee = averageUpperPlate(bone('TIBIA'));
  const ankle = center(bone('TALUS')).addScaledVector(up, 0.012);
  const wrist = mid(center(bone('SCAPHOID')), center(bone('LUNATE')));
  const humerus = longSegment(
    shoulder,
    elbow,
    right,
    arm.headCenter,
    arm.elbow,
    direction(arm.arm, right),
    roma ? 0.77 : 0.76,
    roma ? 0.75 : 0.73,
  );
  const femoralHead = hips(hip);
  // Center the plateau on the patellar skin ring. Its medial loading point
  // and the center of a full adult CT condyle block are distinct landmarks.
  leg.knee.addScaledVector(leg.outer, rig.height * (roma ? 0.006 : 0.008));
  leg.femoralHead.copy(femoralHead);
  leg.acetabulum.copy(femoralHead);
  const distalFemur = longSegment(
    hip,
    knee,
    right,
    femoralHead,
    leg.knee,
    direction(rig['thigh' + side], right),
    roma ? 0.85 : 0.81,
    roma ? 0.8 : 0.76,
  );
  const femur = fitFemur(
    hip,
    knee,
    femoralHead,
    leg.knee,
    direction(rig['thigh' + side], right),
    vec(femoralShaftDirections[rig.name][side]),
    roma ? 0.84 : 0.8,
    distalFemur,
  );
  const shinWidth = roma ? 0.64 : 0.61;
  const shinBase = longSegment(
    knee,
    ankle,
    right,
    leg.knee,
    leg.ankle,
    direction(rig['shin' + side], right),
    shinWidth,
    0.66,
  );
  const patellaCenter = center(bone('PATELLA'));
  const patellaTarget = leg.patella.clone().lerp(leg.knee, 0.12);
  const patella = (p) => femur(p).sub(femur(patellaCenter)).multiplyScalar(0.73).add(patellaTarget);
  const ankleAxis = leg.knee.clone().sub(leg.ankle).normalize();
  function fitFibula(p) {
    const q = shinBase(p);
    if (!roma) {
      // The lateral malleolus sits under Sippy's narrow illustrated ankle cuff.
      // Keep its distal level and ease the cortical width inside the soft tissue.
      const radial = q.clone().sub(leg.ankle).projectOnPlane(ankleAxis);
      const amount = 0.17 * smooth((rig.height * 0.043 - q.distanceTo(leg.ankle)) / (rig.height * 0.029));
      q.addScaledVector(radial, -amount);
    }
    return legSkin(q);
  }
  // Match the radial edge of the CT wrist to the thumb side of the model;
  // this rotates the two forearm bones together out of the scan's flexed pose.
  const radial = center(bone('SCAPHOID')).sub(center(bone('TRIQUETRUM')));
  const thumb = roma
    ? direction(arm.hand, right).multiplyScalar(-sign)
    : direction(arm.hand, new T.Vector3(0, 0, 1));
  const forearm = longSegment(
    elbow,
    wrist,
    radial,
    arm.elbow,
    arm.wrist,
    thumb,
    roma ? 0.77 : 0.73,
    roma ? 0.76 : 0.75,
  );
  const bridge = shoulderBridge(parts, landmarks.thorax, arm, rig.height, roma);
  const shoulderSkin = envelope(side, 'scapula'),
    armSkin = envelope(side, 'arm'),
    legSkin = envelope(side, 'calf');
  const extremity = makeExtremityFit(rig, roma, side, bones, landmarks);
  return (name) => {
    if (name.startsWith('HIP_')) return hips;
    if (name.startsWith('SCAPULA_'))
      return (p) => {
        // Keep the CT blade's mediolateral ordering: adjoining triangles may
        // never jump from the inner rib wall straight to a lateral arm.
        const q = chest(p),
          d = p.distanceTo(shoulder);
        const blade = smooth((d - 0.034) / 0.065);
        q.addScaledVector(arm.axes.x, -blade * (roma ? 0.008 : 0.014));
        const corrected = bridge(q);
        return q.lerp(corrected, smooth((d - 0.024) / 0.014));
      };
    if (name.startsWith('CLAVICLE_')) return (p) => bridge(shoulderSkin(chest(p)));
    if (name.startsWith('HUMERUS_'))
      return (p) => {
        const q = humerus(p);
        return p.distanceTo(shoulder) < 0.03 ? q : armSkin(q);
      };
    if (/^(RADIUS|ULNA)_/.test(name)) return (p) => armSkin(forearm(p));
    if (name.startsWith('FEMUR_')) return femur;
    if (name.startsWith('PATELLA_')) return patella;
    if (name.startsWith('TIBIA_')) return (p) => legSkin(shinBase(p));
    if (name.startsWith('FIBULA_')) return fitFibula;
    return extremity(name);
  };
}

export function addScanSkeleton(rig, roma, parts, scan, landmarks, part, tier) {
  const atlas = roma ? female : male;
  const { chest, hips, limitRibs } = fitTrunk(rig, roma, atlas, landmarks);
  const skull = fitSkull(atlas, landmarks.head, roma);
  const c7 = center(scan.get('VERTEBRA_C7')),
    c1 = center(scan.get('VERTEBRA_C1'));
  const cervix = longSegment(c7, c1, right, chest(c7), skull(c1), direction(rig.chest, right), 0.71, 0.7);
  const lumbar = (p) =>
    hips(p).lerp(chest(p), smooth((p.y - atlas.lumbosacral) / (atlas.thoracolumbar - atlas.lumbosacral)));
  const envelope = scanEnvelope(parts, roma, rig.height);
  const sides = Object.fromEntries(
    ['L', 'R'].map((side) => [
      side,
      fitSide(rig, roma, side, atlas, scan, landmarks, chest, hips, envelope, parts),
    ]),
  );
  const fitted = new Map();
  const material = new T.MeshStandardMaterial({ color: 0xf3e8cf, vertexColors: true, roughness: 0.82 });
  for (const [name, original] of scan) {
    let project;
    if (name.startsWith('SKULL_')) project = skull;
    else if (name.startsWith('VERTEBRA_C')) project = cervix;
    else if (name.startsWith('VERTEBRA_L')) project = lumbar;
    else if (name === 'SACRUM') project = hips;
    else if (/^(RIB_|STERNUM|VERTEBRA_T)/.test(name)) project = limitRibs;
    else project = sides[name.endsWith('_LEFT') ? 'L' : 'R'](name);
    if (!project) throw new Error('Unmapped BoneHub bone ' + name);
    const g = original.clone(),
      pos = g.attributes.position,
      point = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const q = project(point.fromBufferAttribute(original.attributes.position, i));
      pos.setXYZ(i, q.x, q.y, q.z);
    }
    if (/^(SCAPULA|CLAVICLE)_/.test(name))
      refineCurvedFit(g, original, project, tier === 'mobile' ? 210 : 75);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.setAttribute(
      'color',
      new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3),
    );
    g.userData.scanNode = name;
    const mesh = new T.Mesh(g, material);
    mesh.name = scanPartName(name);
    fitted.set(name, g);
    parts.push({
      name: mesh.name,
      layer: 'skeleton',
      mesh,
      scanNode: name,
      source: 'Visible Human CT · BoneHub',
    });
  }
  seatAxialCortex(fitted, envelope('L', 'trunk'), roma);
  seatScanJoints(fitted, landmarks, rig.height);
  if (tier === 'mobile') bakeScanAO(fitted);
  landmarks.scan = { bones: fitted };
  repairScanJoints(rig, roma, parts, fitted, landmarks, part);
  return landmarks.scan;
}
