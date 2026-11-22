import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { sourceLandmarks } from './source-landmarks.js';

const sides = ['L', 'R'];
const origin = () => new Vector3();
const point = (values) => new Vector3().fromArray(values);
const down = new Vector3(0, -1, 0);
const transverse = new Vector3(1, 0, 0);
const forward = new Vector3(0, 0, 1);

function rotationBetween(sourceAxis, sourceAcross, targetAcross) {
  function rotation(axis, across) {
    const y = axis.clone().normalize();
    const x = across.clone().projectOnPlane(y).normalize();
    const z = new Vector3().crossVectors(x, y);
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  }
  return rotation(down, targetAcross).multiply(rotation(sourceAxis, sourceAcross).invert());
}

function legPose(donor, original, standing, rotations) {
  const hipWidth = original.thighL.x - original.thighR.x;
  const ankleWidth = original.footL.x - original.footR.x;
  // The acquisition stances differ considerably, and Roma's shoes would
  // intersect at the acquired ankle spacing. Open or close the paired legs
  // as rigid chains about the measured hips for a standing stance.
  const width = Math.max(hipWidth * 0.95, Math.min(hipWidth * 1.4, ankleWidth));
  let floor = Infinity;
  for (const side of sides) {
    const thigh = 'thigh' + side, shin = 'shin' + side, foot = 'foot' + side;
    const hip = original[thigh], ankle = original[foot];
    const v = ankle.clone().sub(hip);
    const adjustment = (width - ankleWidth) * (side === 'L' ? 0.5 : -0.5);
    const tilt = Math.asin((v.x + adjustment) / Math.hypot(v.x, v.y)) - Math.atan2(v.x, -v.y);
    const leg = new Quaternion().setFromAxisAngle(forward, tilt);
    rotations[thigh] = rotations[shin] = leg;
    for (const key of [shin, foot]) {
      standing[key].sub(hip).applyQuaternion(leg).add(hip);
    }
    const [pitch, sole] = donor.feet[side];
    rotations[foot] = new Quaternion().setFromAxisAngle(transverse, pitch);
    floor = Math.min(floor, sole + standing[foot].y - ankle.y);
  }
  return floor;
}

function armPose(donor, original, standing, rotations) {
  for (const side of sides) {
    const shoulder = 'upperArm' + side, elbow = 'forearm' + side, wrist = 'hand' + side;
    const upper = original[elbow].clone().sub(original[shoulder]);
    const forearm = original[wrist].clone().sub(original[elbow]);
    const palm = point(donor.arms[side].palm).sub(original[wrist]);
    const radial = point(donor.arms[side].radial);
    rotations[shoulder] = rotationBetween(upper, transverse, transverse);
    rotations[elbow] = rotationBetween(forearm, radial, forward);
    rotations[wrist] = rotationBetween(palm, radial, forward);
    standing[elbow].copy(standing[shoulder]).addScaledVector(down, upper.length());
    standing[wrist].copy(standing[elbow]).addScaledVector(down, forearm.length());
  }
}

// Donor joint centres and widths come from the measured High scan. Both LODs
// share these same pivots and one scale, so switching tiers never changes shape.
export function createSourceRig(name) {
  const donor = sourceLandmarks[name];
  if (!donor) return null;
  const original = Object.fromEntries(Object.entries(donor.joints).map(([key, values]) => [key, point(values)]));
  const standing = Object.fromEntries(Object.entries(original).map(([key, p]) => [key, p.clone()]));
  const rotations = {};
  const floor = legPose(donor, original, standing, rotations);
  armPose(donor, original, standing, rotations);
  const height = donor.crown - floor;
  const center = new Vector3(original.hips.x, floor, original.hips.z);
  const scale = origin().setScalar(1 / height);
  const identity = new Quaternion();
  const normalization = new Matrix4().compose(center.clone().multiplyScalar(-1 / height), identity, scale);
  const joints = Object.fromEntries(Object.entries(standing).map(([key, p]) => [
    key, p.clone().applyMatrix4(normalization),
  ]));
  // The local bind maps a point in donor metres to its normalized offset
  // from the assigned pose pivot. Current rig joint matrices supply motion.
  const restPose = Object.fromEntries(Object.entries(original).map(([key, p]) => {
    const rotation = rotations[key] ?? identity;
    const translation = p.clone().applyQuaternion(rotation).multiplyScalar(-1 / height);
    return [key, new Matrix4().compose(translation, rotation, scale)];
  }));
  function box(bounds) {
    return new Box3(...bounds.map(point)).applyMatrix4(normalization);
  }
  return {
    donor, original, rotations, joints, restPose, normalization,
    height, floor, skullBounds: box(donor.skull),
    pelvisBounds: box(donor.pelvis), thoraxBounds: box(donor.thorax),
  };
}
