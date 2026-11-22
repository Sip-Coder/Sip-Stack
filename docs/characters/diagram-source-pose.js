// The source values remain in metres. The whole actor owns a single scale;
// each matrix below carries an entire source part into a rotating joint frame.
import { Matrix4, Quaternion, Vector3 } from 'three';

const vector = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const down = vector(0, -1, 0);
const transverse = vector(1, 0, 0);
const forward = vector(0, 0, 1);
const mid = (a, b) => a.clone().lerp(b, 0.5);

function sourceFrame(proximal, distal, across) {
  const y = distal.clone().sub(proximal).normalize();
  const x = across.clone().projectOnPlane(y).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, x.clone().cross(y)));
}

function donorArm(attachment, end, targetAcross, across = transverse) {
  return sourceFrame(vector(), down, targetAcross).multiply(sourceFrame(attachment, end, across).invert());
}

function sourceSide(name, fallback) {
  if (/^(left|right)_flexor_pollicis_brevis$/i.test(name)) return fallback >= 0 ? 'L' : 'R';
  if (/(^|_)left(_|$)/i.test(name)) return 'L';
  if (/(^|_)right(_|$)/i.test(name)) return 'R';
  return fallback >= 0 ? 'L' : 'R';
}

export function donorMuscleLabel(name, geometry) {
  // Two source labels disagree with the acquired lateral coordinate. Keep
  // their raw node IDs for provenance; the display names identify their
  // anatomical locations. No reflection or vertex reorder is used.
  if (!/^(left|right)_(flexor_pollicis_brevis|middle_pharyngeal_constrictor)$/i.test(name) ||
      geometry.userData.rigJoint) return name;
  const centerX = (geometry.boundingBox.min.x + geometry.boundingBox.max.x) / 2;
  return name.replace(/^(left|right)/i, centerX > 0 ? 'left' : 'right');
}

export function boneJoint(name) {
  if (/^SKULL_/.test(name)) return 'head';
  if (/^(SACRUM|HIP_|VERTEBRA_L)/.test(name)) return 'hips';
  if (/^RIB_|^STERNUM$|^VERTEBRA_[CT]|^CLAVICLE_|^SCAPULA_/.test(name)) return 'chest';
  const side = name.endsWith('_LEFT') ? 'L' : name.endsWith('_RIGHT') ? 'R' : '';
  if (!side) throw new Error('Unmapped BoneHub bone ' + name);
  if (/^HUMERUS_/.test(name)) return 'upperArm' + side;
  if (/^(RADIUS|ULNA)_/.test(name)) return 'forearm' + side;
  if (/^(FEMUR|PATELLA)_/.test(name)) return 'thigh' + side;
  if (/^(TIBIA|FIBULA)_/.test(name)) return 'shin' + side;
  if (/^(METACARPAL|PHALANGE_HAND|CAPITATE|HAMATE|LUNATE|PISIFORM|SCAPHOID|TRAPEZIUM|TRAPEZOID|TRIQUETRUM)_/.test(name))
    return 'hand' + side;
  if (/^(PHALANGE_FOOT|METATARSAL|CALCANEUS|CUBOID|INTERMEDIATE_CUNEIFORM|LATERAL_CUNEIFORM|MEDIAL_CUNEIFORM|NAVICULAR|TALUS)_/.test(name))
    return 'foot' + side;
  throw new Error('Unmapped BoneHub bone ' + name);
}

// These BP3D atlas attachment locations use the common, source scene frame.
// Each segment is oriented using two landmarks. The length of their vector
// is never used as a scale. The known same-subject limb uses the CT frame.
const atlas = {
  shoulder: [0.163, 1.390, -0.025],
  elbow: [0.208, 1.120, -0.037],
  wrist: [0.245, 0.891, 0.010],
  middle: [0.259, 0.842, 0.027],
  hip: [0.087, 0.894, -0.024],
  knee: [0.077, 0.465, -0.015],
  ankle: [0.078, 0.063, -0.036],
  shoulderMid: vector(0, 1.390, -0.025),
  pelvisMid: vector(0, 0.894, -0.024),
  head: vector(0, 1.550, -0.038),
};

const atlasPoint = (label, sign) => vector(atlas[label][0] * sign, atlas[label][1], atlas[label][2]);

function bindFor(rig, joint, attach, upright) {
  const scale = vector().setScalar(1 / rig.anatomy.height);
  // A rig child always starts with the named attachment as its local origin.
  return rig[joint].matrixWorld.clone().multiply(
    new Matrix4().compose(attach.clone().applyQuaternion(upright).multiplyScalar(-scale.x), upright, scale),
  );
}

function inUprightFrame(rig, joint, upright, point, offset) {
  // The glenohumeral origins of the atlas differ slightly from CT. Neutral
  // back/chest sheets remain centred on the thorax. Once the pose moves
  // they travel as a single piece with the attachment bone.
  const scale = vector().setScalar(1 / rig.anatomy.height);
  const shift = point.clone().sub(offset).multiplyScalar(scale.x).sub(rig.anatomy.joints[joint]);
  return rig[joint].matrixWorld.clone().multiply(new Matrix4().compose(shift, upright, scale));
}

function interpolateBone(jointA, jointB, center, weight, bones) {
  const a = bones[jointA], b = bones[jointB];
  const at = center.clone().applyMatrix4(a).lerp(center.clone().applyMatrix4(b), weight);
  const pos = vector(), scale = vector();
  const q = new Quaternion(), other = new Quaternion();
  a.decompose(pos, q, scale);
  b.decompose(pos, other, vector());
  q.slerp(other, weight);
  at.sub(center.clone().applyQuaternion(q).multiplyScalar(scale.x));
  return new Matrix4().compose(at, q, scale);
}

export function sourcePose(rig) {
  const { original, joints, height, restPose } = rig.anatomy;
  const matrices = Object.fromEntries(Object.entries(restPose).map(([key, bind]) => [
    key, rig[key].matrixWorld.clone().multiply(bind),
  ]));
  const neutral = Object.fromEntries(Object.entries(joints).map(([key, p]) => [
    key, p.clone().multiplyScalar(height),
  ]));
  const empty = new Quaternion();
  const trunk = mid(neutral.upperArmL, neutral.upperArmR);
  const pelvis = neutral.hips;
  const limbs = Object.fromEntries(['L', 'R'].map((side) => {
    const sign = side === 'L' ? 1 : -1;
    const shoulder = atlasPoint('shoulder', sign), elbow = atlasPoint('elbow', sign);
    const wrist = atlasPoint('wrist', sign), middle = atlasPoint('middle', sign);
    const hip = atlasPoint('hip', sign), knee = atlasPoint('knee', sign), ankle = atlasPoint('ankle', sign);
    const radial = vector(sign, 0, 0.12);
    const upper = donorArm(shoulder, elbow, transverse);
    const fore = donorArm(elbow, wrist, forward, radial);
    const palm = donorArm(wrist, middle, forward, radial);
    const thigh = new Quaternion().setFromUnitVectors(
      knee.clone().sub(hip).normalize(), neutral['shin' + side].clone().sub(neutral['thigh' + side]).normalize(),
    );
    const shin = new Quaternion().setFromUnitVectors(
      ankle.clone().sub(knee).normalize(), neutral['foot' + side].clone().sub(neutral['shin' + side]).normalize(),
    );
    return [side, {
      upperArm: bindFor(rig, 'upperArm' + side, shoulder, upper),
      forearm: bindFor(rig, 'forearm' + side, elbow, fore),
      // Terminal arm tendons ride the hand. The resulting separation at a
      // flexed donor origin is displayed instead of stretching its surface.
      forearmToHand: inUprightFrame(rig, 'hand' + side, fore, neutral['forearm' + side],
        elbow.clone().applyQuaternion(fore)),
      upperToForearm: inUprightFrame(rig, 'forearm' + side, upper, neutral['upperArm' + side],
        shoulder.clone().applyQuaternion(upper)),
      hand: bindFor(rig, 'hand' + side, wrist, palm),
      thigh: bindFor(rig, 'thigh' + side, hip, thigh),
      thighToShin: inUprightFrame(rig, 'shin' + side, thigh, neutral['thigh' + side],
        hip.clone().applyQuaternion(thigh)),
      shin: bindFor(rig, 'shin' + side, knee, shin),
      shinToFoot: inUprightFrame(rig, 'foot' + side, shin, neutral['shin' + side],
        knee.clone().applyQuaternion(shin)),
      foot: bindFor(rig, 'foot' + side, ankle, empty),
      shoulderSheet: inUprightFrame(rig, 'upperArm' + side, empty, trunk, atlas.shoulderMid),
    }];
  }));
  const chest = inUprightFrame(rig, 'chest', empty, trunk, atlas.shoulderMid);
  const hips = inUprightFrame(rig, 'hips', empty, pelvis, atlas.pelvisMid);
  const head = bindFor(rig, 'head', atlas.head, empty);

  function bone(name) {
    const joint = boneJoint(name);
    const level = /^VERTEBRA_([CL])([1-9])$/.exec(name);
    if (level) {
      const [, region, index] = level;
      const center = vector(...rig.anatomy.donor.spine[region + index]);
      const from = region === 'C' ? 'head' : 'chest', to = region === 'C' ? 'chest' : 'hips';
      const weight = (Number(index) - 1) / (region === 'C' ? 6 : rig.name === 'roma' ? 5 : 4);
      return { joint, matrix: interpolateBone(from, to, center, weight, matrices) };
    }
    return { joint, matrix: matrices[joint] };
  }

  function muscle(name, geometry) {
    const center = geometry.boundingBox.getCenter(vector());
    const sameDonor = geometry.userData.sourceAtlas?.startsWith('Andreassen');
    const side = sourceSide(name, sameDonor ? center.x - original.hips.x : center.x);
    function use(joint, frame) {
      const key = joint + side;
      let matrix = sameDonor ? matrices[key] : limbs[side][frame ?? joint];
      if (sameDonor && frame === 'shinToFoot') {
        const shin = 'shin' + side;
        const offset = joints[shin].clone().sub(joints[key]);
        matrix = rig[key].matrixWorld.clone().multiply(new Matrix4().makeTranslation(offset))
          .multiply(restPose[shin]);
      }
      return { joint: key, matrix };
    }
    const id = name.toLowerCase();
    const min = geometry.boundingBox.min.y, max = geometry.boundingBox.max.y;
    if (/pectoralis_major|latissimus_dorsi|deltoid|teres_|subscapularis|supraspinatus|infraspinatus|coracobrachialis/.test(id))
      return use('upperArm', 'shoulderSheet');
    // The scapula travels with the chest on this rig. Pectoralis minor
    // inserts on its coracoid rather than on the rotating humerus.
    if (/pectoralis_minor/.test(id)) return { joint: 'chest', matrix: chest };
    if (/biceps_brachii|brachialis|anconeus/.test(id)) return use('forearm', 'upperToForearm');
    if (/_hand|opponens_pollicis|abductor_pollicis_brevis|flexor_pollicis_brevis/.test(id)) return use('hand');
    if (/forearm|carpi|pollicis|indicis|pronator|supinator|brachioradialis/.test(id) ||
        (!sameDonor && Math.abs(center.x) > 0.173 && center.y > 0.76 && center.y < 1.24)) {
      if (/(flexor|extensor)_(digitorum|pollicis)|carpi/.test(id) || min < 0.841) return use('hand', 'forearmToHand');
      return use('forearm');
    }
    if (/_foot|extensor_hallucis_brevis|abductor_hallucis|flexor_digitorum_brevis|flexor_accessorius/.test(id))
      return use('foot');
    if (/gastrocnemius|fibularis|tibialis|soleus|plantaris|hallucis_longus|digitorum_longus/.test(id) ||
        /FJ14(?:29|37|43)M?$/i.test(id)) return use('foot', 'shinToFoot');
    if (/quadriceps|vastus|rectus_femoris|biceps_femoris|sartorius|gracilis|semitendin|semimembranos|popliteus|FJ1430/i.test(id))
      return use('shin', 'thighToShin');
    if (/gluteus|adductor|tensor_fasciae|piriformis|iliacus|psoas|gemellus|pectineus|obturator|quadratus_femoris/.test(id))
      return use('thigh');
    if (sameDonor) {
      const ankle = original['foot' + side].y, knee = original['shin' + side].y;
      if (center.y < ankle + 0.020) return use('foot');
      return use(center.y < knee ? 'shin' : 'thigh');
    }
    if (/_leg|FJ14(?:33|39)M?$/i.test(id) || max < 0.62) return use('shin');
    if (/coccygeus|anal_sphincter|lumbar/.test(id)) return { joint: 'hips', matrix: hips };
    if (/rectus_abdominis|external_oblique|iliocostalis_lumborum/.test(id)) return { joint: 'chest', matrix: chest };
    if (/capitis|sternocleidomastoid|stylohyoid|^left_rectus|^right_rectus/.test(id) || center.y > 1.49)
      return { joint: 'head', matrix: head };
    return { joint: 'chest', matrix: chest };
  }
  return { bone, muscle };
}
