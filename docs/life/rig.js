// Rig coordinates are metres in the character's undeformed model space.
import * as T from 'three';
import { createDeformation } from './deformation.js';

const rad = Math.PI / 180;
const axisY = new T.Vector3(0, 1, 0);
const swing = new T.Quaternion(),
  twist = new T.Quaternion(),
  identity = new T.Quaternion();
const clamp = T.MathUtils.clamp;

// Factor q = swing * axialRoll. Canonicalising the hemisphere keeps roll
// continuous when the equivalent quaternion with the opposite sign arrives.
function rollOf(q) {
  const sign = q.w < 0 ? -1 : 1;
  twist.set(0, q.y * sign, 0, q.w * sign);
  if (twist.lengthSq() < 1e-12) twist.identity();
  else twist.normalize();
  return 2 * Math.atan2(twist.y, twist.w);
}
function cone(bone, maximum, rollMax) {
  const q = bone.quaternion,
    roll = rollOf(q);
  swing.copy(q).multiply(twist.invert());
  const angle = 2 * Math.acos(clamp(Math.abs(swing.w), 0, 1));
  if (angle <= maximum && Math.abs(roll) <= rollMax) return;
  if (angle > maximum) swing.slerp(identity, 1 - maximum / angle);
  q.copy(swing).multiply(twist.setFromAxisAngle(axisY, clamp(roll, -rollMax, rollMax)));
}

export function extendRig(config) {
  const { bone, bones, bind, sides, hip, spine, chest, neck, head, hem, style } = config;
  function relative(name, id, x, y, z) {
    const p = bind[id];
    return bone(name, p.x + x, p.y + y, p.z + z, id);
  }
  function insert(name, id, child, y) {
    const b = bone(name, 0, y, 0, id);
    bones[b].add(bones[child]);
    bones[child].position.copy(bind[child]).sub(bind[b]);
    return b;
  }
  const spine2 = insert('thoracic lower', spine, chest, 1.135),
    spine3 = insert('thoracic upper', spine2, chest, 1.213),
    neck2 = insert('atlas', neck, head, 1.519);
  const jaw = relative('jaw', head, 0, 0.068, -0.028),
    hair = [],
    straps = [];
  for (const side of sides) {
    const { s, arm, elbow, hand, thigh, shin, ankle } = side;
    const prefix = s < 0 ? 'L ' : 'R ';
    const add = (name, id, x, y, z) => relative(prefix + name, id, x, y, z);
    const half = (name, a, b) => {
      const p = bind[a],
        q = bind[b];
      return add(name, a, (q.x - p.x) * 0.5, (q.y - p.y) * 0.5, (q.z - p.z) * 0.5);
    };
    side.armTwist = half('humeral roll', arm, elbow);
    side.foreTwist = half('radial roll', elbow, hand);
    side.thighTwist = half('femoral roll', thigh, shin);
    side.deltoid = add('deltoid', arm, s * 0.014, -0.045, 0);
    side.elbowTip = add('olecranon', arm, bind[elbow].x - bind[arm].x, -0.29, -0.027);
    side.kneecap = add('patella', thigh, 0, -0.409, 0.025);
    side.glute = add('gluteal', hip, s * 0.105, -0.003, -0.054);
    side.toe = add('toe', ankle, 0, -0.052, 0.104);
    side.eye = add('eye', head, s * 0.038, 0.114, 0.077);
    side.upperLid = add('upper lid', head, s * 0.038, 0.114, 0.077);
    side.lowerLid = add('lower lid', head, s * 0.038, 0.114, 0.077);
    side.brow = add('inner brow', head, s * 0.026, 0.135, 0.078);
    side.outerBrow = add('outer brow', head, s * 0.055, 0.135, 0.078);
    side.cheek = add('malar', head, s * 0.055, 0.08, 0.068);
    side.lip = add('lip corner', jaw, s * 0.023, -0.021, 0.116);
    side.fingers = [];
    for (let digit = 0; digit < 5; digit++) {
      const names = ['index', 'middle', 'ring', 'little', 'thumb'];
      let parent = hand;
      const chain = [];
      for (let j = 0; j < 3; j++) {
        const thumb = digit === 4;
        const x = thumb ? [-0.006, -0.011, -0.018][j] * s : 0;
        const y = thumb
          ? [-0.022, -0.051, -0.076][j]
          : -0.081 - [0.074, 0.08, 0.075, 0.06][digit] * [0, 0.45, 0.77][j];
        const z = thumb ? [0.034, 0.058, 0.068][j] : 0.04 - digit * 0.023;
        const point = bind[hand];
        parent = bone(prefix + names[digit] + ' ' + (j + 1), point.x + x, point.y + y, point.z + z, parent);
        chain.push(parent);
      }
      side.fingers.push(chain);
    }
  }
  if (style === 'skirt' || style === 'apron' || style === 'scarf') {
    hair.push(relative('hair root', head, 0, 0.14, -0.09));
    hair.push(relative('hair mid', hair[0], 0, -0.06, -0.026));
    hair.push(relative('hair tip', hair[1], 0, -0.055, -0.004));
  }
  straps.push(relative('strap top', chest, -0.14, -0.05, -0.02));
  straps.push(relative('strap end', straps[0], -0.02, -0.12, -0.01));

  const rig = { ...config, spine2, spine3, neck2, jaw, hair, straps };
  const deformation = createDeformation(rig);
  Object.assign(rig, deformation);
  rig.curl = (i, amount) => {
    const side = sides[i],
      f = clamp(amount, 0, 1);
    for (let digit = 0; digit < 5; digit++) {
      const chain = side.fingers[digit];
      for (let j = 0; j < 3; j++) {
        const bend = (digit === 4 ? 0.6 : j === 1 ? 1.25 : 1.03) * f;
        bones[chain[j]].rotation.set(
          digit === 4 ? -bend * 0.47 : 0,
          digit === 4 ? side.s * bend * 0.42 : 0,
          -side.s * bend,
        );
      }
    }
  };
  rig.update = () => {
    cone(bones[spine], 15 * rad, 15 * rad);
    cone(bones[chest], 15 * rad, 15 * rad);
    bones[spine2].quaternion.identity().slerp(bones[chest].quaternion, 0.22);
    bones[spine3].quaternion.copy(bones[spine2].quaternion);
    cone(bones[neck], 28 * rad, 70 * rad);
    cone(bones[head], 36 * rad, 70 * rad);
    bones[neck2].quaternion.identity().slerp(bones[head].quaternion, 0.22);
    for (const a of sides) {
      cone(bones[a.arm], 160 * rad, 145 * rad);
      cone(bones[a.thigh], 145 * rad, 90 * rad);
      const roll = rollOf(bones[a.hand].quaternion);
      cone(bones[a.hand], 70 * rad, 80 * rad);
      bones[a.foreTwist].quaternion.setFromAxisAngle(axisY, 0.5 * clamp(roll, -80 * rad, 80 * rad));
      bones[a.armTwist].quaternion.setFromAxisAngle(axisY, -0.5 * rollOf(bones[a.arm].quaternion));
      bones[a.thighTwist].quaternion.setFromAxisAngle(axisY, -0.5 * rollOf(bones[a.thigh].quaternion));
      const elbow = clamp(bones[a.elbow].rotation.x, -150 * rad, 0);
      const knee = clamp(bones[a.shin].rotation.x, 0, 150 * rad);
      bones[a.elbow].rotation.set(elbow, 0, 0);
      bones[a.shin].rotation.set(knee, 0, 0);
      bones[a.elbowTip].rotation.x = elbow * 0.5;
      bones[a.kneecap].rotation.x = knee * 0.49;
      bones[a.deltoid].quaternion.copy(bones[a.arm].quaternion).invert().slerp(identity, 0.42);
      bones[a.glute].quaternion.identity().slerp(bones[a.thigh].quaternion, 0.3);
    }
    deformation.driveCorrectives();
  };
  return rig;
}

// Solve to the palm socket with the current wrist rotation preserved. The
// constrained hinge angle follows from |upper + Rx(-angle) * lower|^2.
// Rotating the shoulder around the goal ray chooses the outward elbow pole.
export function armSolver(rig) {
  const { bones, sides } = rig;
  const goal = new T.Vector3(),
    lower = new T.Vector3(),
    reach = new T.Vector3(),
    ray = new T.Vector3(),
    pole = new T.Vector3(),
    elbowDir = new T.Vector3(),
    cross = new T.Vector3();
  const rotation = new T.Quaternion(),
    axisX = new T.Vector3(1, 0, 0);
  const palms = sides.map((a) => {
    const p = new T.Object3D();
    p.name = 'palm socket';
    p.position.set(0, -0.069, 0.012);
    bones[a.hand].add(p);
    return p;
  });
  const grips = [null, null],
    errors = new Float32Array(2);
  function grasp(targets) {
    for (let i = 0; i < 2; i++) {
      const target = targets[i];
      grips[i] = target;
      rig.curl(i, target ? 0.9 : 0);
      if (!target) {
        errors[i] = 0;
        continue;
      }
      const side = sides[i],
        arm = bones[side.arm],
        elbow = bones[side.elbow],
        hand = bones[side.hand];
      target.getWorldPosition(goal);
      arm.parent.worldToLocal(goal);
      goal.sub(arm.position);
      cone(hand, 70 * rad, 80 * rad);
      lower.copy(palms[i].position).applyQuaternion(hand.quaternion).add(hand.position);
      const upper = elbow.position,
        A = upper.y * lower.y + upper.z * lower.z,
        B = upper.y * lower.z - upper.z * lower.y;
      const dot = (goal.lengthSq() - upper.lengthSq() - lower.lengthSq()) * 0.5 - upper.x * lower.x;
      const angle = clamp(Math.atan2(B, A) + Math.acos(clamp(dot / Math.hypot(A, B), -1, 1)), 0, 150 * rad);
      elbow.rotation.set(-angle, 0, 0);
      reach.copy(lower).applyAxisAngle(axisX, -angle).add(upper);
      const reachLength = reach.length();
      ray.copy(goal).normalize();
      arm.quaternion.setFromUnitVectors(reach.normalize(), ray);
      pole
        .set(side.s * 0.62, -0.85, -0.38)
        .addScaledVector(ray, -pole.dot(ray))
        .normalize();
      elbowDir.copy(upper).applyQuaternion(arm.quaternion);
      elbowDir.addScaledVector(ray, -elbowDir.dot(ray)).normalize();
      const turn = Math.atan2(cross.crossVectors(elbowDir, pole).dot(ray), elbowDir.dot(pole));
      arm.quaternion.premultiply(rotation.setFromAxisAngle(ray, turn));
      cone(arm, 160 * rad, 145 * rad);
      errors[i] = goal.distanceTo(reach.multiplyScalar(reachLength).applyQuaternion(arm.quaternion));
    }
    rig.update();
  }
  function release() {
    for (let i = 0; i < 2; i++)
      if (grips[i]) {
        rig.curl(i, 0);
        grips[i] = null;
        errors[i] = 0;
      }
  }
  return { palms, grips, gripErrors: errors, grasp, release };
}
