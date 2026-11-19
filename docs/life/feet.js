import * as T from 'three';
import { stairFeet } from './stair-feet.js';

const up = new T.Vector3(0, 1, 0);
const right = new T.Vector3(1, 0, 0);
const flat = () => 0;
const ease = (x) => x * x * (3 - 2 * x);

/** Stance positions live in the walkable surface's frame. Each swing starts at
 * the previous footprint and ends at a reachable, forward-looking footprint. */
export function footPlant(root, bones, sides, pelvis, prints) {
  const feet = sides.map(({ ankle }) => ({
    ankle: bones[ankle],
    heel: new T.Vector3(0, -0.077, -0.072),
    toe: new T.Vector3(0, -0.077, 0.182),
    planted: false,
    hold: new T.Vector3(),
    target: new T.Vector3(),
    from: new T.Vector3(),
    yaw: 0,
    pitch: 0,
    model: new T.Vector3(),
    phase: 0,
    swing: 0,
    height: 0,
    recoveryAt: -Infinity,
    recoveryTo: new T.Vector3(),
  }));
  const local = new T.Vector3(),
    rest = new T.Vector3(),
    aim = new T.Vector3(),
    rotated = new T.Vector3();
  const hipInverse = new T.Quaternion(),
    thighModel = new T.Quaternion(),
    shinModel = new T.Quaternion();
  const footOrientation = new T.Quaternion(),
    tilt = new T.Quaternion();
  const pole = new T.Vector3(),
    kneeDirection = new T.Vector3(),
    cross = new T.Vector3(),
    swivel = new T.Quaternion();
  let previousFloor = null;
  let previousTime = -Infinity,
    previousAction = '',
    oldX = 0,
    oldZ = 0;
  const solveStairs = stairFeet(root, feet, sides, pelvis);
  function solve(t, action, cycle, stride, floor, dynamics, path) {
    if (action === 'row' && !floor) {
      for (const foot of feet) foot.planted = false;
      for (const p of prints) p.visible = false;
      previousAction = action;
      return;
    }
    const pos = root.position,
      sc = root.scale.y,
      yaw = root.rotation.y,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const walking = action === 'walk' || action === 'carry',
      ground = floor || flat;
    const reset =
      (floor && !previousFloor) ||
      t < previousTime ||
      t - previousTime > 0.3 ||
      Math.hypot(pos.x - oldX, pos.z - oldZ) > 0.7 * sc ||
      (previousAction === 'row') !== (action === 'row') ||
      previousTime === -Infinity;
    previousFloor = floor;
    oldX = pos.x;
    oldZ = pos.z;
    previousTime = t;
    previousAction = action;
    let ceiling = pelvis.position.y;
    hipInverse.copy(pelvis.quaternion).invert();
    if (path) {
      solveStairs(path);
      ceiling = pelvis.position.y;
    } else
      for (let i = 0; i < 2; i++) {
        const f = feet[i],
          side = sides[i],
          p = (cycle + i * 0.5) % 1;
        let swing = Math.min(1, Math.max(0, (p - 0.55) / 0.45));
        let contact = !walking || p < 0.55;
        const wasPlanted = f.planted;
        const lead =
          action === 'row'
            ? 0.725
            : walking
              ? reset && contact
                ? (0.275 - p) * stride
                : 0.275 * stride
              : 0.036 * side.s;
        const balance = dynamics?.stepTarget;
        const bx = balance && balance[0] === i ? balance[1] : 0,
          bz = balance && balance[0] === i ? balance[2] : 0;
        const x = side.h + bx,
          z = lead + bz;
        local.set(pos.x + sc * (x * c + z * s), 0, pos.z + sc * (z * c - x * s));
        // Land with the complete sole on a single surface. At a quay seam
        // or the end of a flight, the ankle can be on the landing while the
        // toe overhangs a riser. Search fore and aft for the closest flat patch.
        if (floor) {
          const x0 = local.x,
            z0 = local.z,
            other = feet[1 - i];
          const maxRise = walking && !reset && other.planted ? 0.5 * sc : Infinity;
          for (let n = 0; n < 47; n++) {
            const offset = Math.ceil(n / 2) * (n % 2 ? 1 : -1) * 0.026 * sc;
            local.x = x0 + offset * s;
            local.z = z0 + offset * c;
            const heel = ground(local.x + f.heel.z * sc * s, local.z + f.heel.z * sc * c);
            const toe = ground(local.x + f.toe.z * sc * s, local.z + f.toe.z * sc * c);
            if (
              Number.isFinite(heel) &&
              Math.abs(heel - toe) < 0.001 &&
              Math.abs(heel - other.height) <= maxRise
            )
              break;
          }
        }
        // The balance controller can request a short recovery step during an
        // idle. Lift one shoe and replant it, instead of dragging both supports.
        if (walking || reset || action === 'row') f.recoveryAt = -Infinity;
        else if (
          f.recoveryAt === -Infinity &&
          balance?.[0] === i &&
          feet[1 - i].planted &&
          Math.hypot(local.x - f.hold.x, local.z - f.hold.z) > 0.045 * sc
        ) {
          f.recoveryAt = t;
          f.recoveryTo.copy(local);
          f.from.copy(f.hold);
        }
        if (f.recoveryAt !== -Infinity) {
          swing = Math.min(1, (t - f.recoveryAt) / 0.36);
          local.copy(f.recoveryTo);
          contact = swing >= 1;
          if (contact) {
            f.target.copy(local);
            f.recoveryAt = -Infinity;
          }
        }
        if (reset) {
          f.hold.copy(local);
          f.from.copy(local);
          f.target.copy(local);
          f.yaw = yaw;
        } else if (contact && !wasPlanted) {
          f.hold.copy(walking ? local : f.target);
          f.yaw = yaw;
        }
        if (contact) {
          f.target.copy(f.hold);
        } else {
          if (wasPlanted) f.from.copy(f.hold);
          f.target.lerpVectors(f.from, local, ease(swing));
          f.yaw = yaw;
        }
        const cs = Math.cos(f.yaw),
          sn = Math.sin(f.yaw);
        const yHeel = floor
          ? ground(f.target.x + f.heel.z * sn * sc, f.target.z + f.heel.z * cs * sc)
          : pos.y;
        const yToe = floor ? ground(f.target.x + f.toe.z * sn * sc, f.target.z + f.toe.z * cs * sc) : pos.y;
        const incline = Math.atan2(yToe - yHeel, (f.toe.z - f.heel.z) * sc);
        const lift = !contact ? (walking ? 0.13 : 0.044) * Math.sin(Math.PI * swing) : 0;
        // Rock around the heel on landing, settle flat, then pivot around the
        // planted toe. World-space pivot compensation keeps the contact still.
        let roll = 0,
          pivot = 0;
        if (walking && contact) {
          if (p < 0.09) {
            roll = -0.06 * (1 - ease(p / 0.09));
            pivot = f.heel.z;
          } else if (p > 0.44) {
            roll = 0.065 * ease((p - 0.44) / 0.11);
            pivot = f.toe.z;
          }
        }
        f.pitch = -incline + (contact ? roll : 0.22 * Math.sin(2 * Math.PI * swing));
        const surface = yHeel + (yToe - yHeel) * (-f.heel.z / (f.toe.z - f.heel.z));
        f.height = surface;
        const dx = (f.target.x - pos.x) / sc,
          dz = (f.target.z - pos.z) / sc;
        f.model.set(
          dx * c - dz * s,
          (surface - pos.y) / sc + 0.077 / Math.max(0.5, Math.cos(incline)) + lift,
          dx * s + dz * c,
        );
        if (roll) {
          const bindY = f.heel.y,
            base = -incline;
          f.model.y +=
            bindY * (Math.cos(base) - Math.cos(f.pitch)) - pivot * (Math.sin(base) - Math.sin(f.pitch));
          const advance =
            bindY * (Math.sin(base) - Math.sin(f.pitch)) + pivot * (Math.cos(base) - Math.cos(f.pitch));
          f.model.x += Math.sin(f.yaw - yaw) * advance;
          f.model.z += Math.cos(f.yaw - yaw) * advance;
        }
        const h = bones[side.thigh];
        rotated.copy(h.position).applyQuaternion(pelvis.quaternion);
        const reach = bones[side.shin].position.length() + bones[side.ankle].position.length() - 0.0002;
        const horizontal =
          (f.model.x - pelvis.position.x - rotated.x) ** 2 + (f.model.z - pelvis.position.z - rotated.z) ** 2;
        if (contact)
          ceiling = Math.min(
            ceiling,
            f.model.y - rotated.y + Math.sqrt(Math.max(0.01, reach * reach - horizontal)),
          );
        f.planted = contact;
        f.swing = swing;
        f.phase = p;
      }
    pelvis.position.y = ceiling;
    for (let i = 0; i < 2; i++) {
      const side = sides[i],
        f = feet[i],
        thigh = bones[side.thigh],
        shin = bones[side.shin],
        ankle = f.ankle;
      rotated.copy(thigh.position).applyQuaternion(pelvis.quaternion);
      aim.copy(f.model).sub(pelvis.position).sub(rotated);
      const a = shin.position.length(),
        b = ankle.position.length();
      if (!f.planted) {
        const extension = Math.sqrt(Math.max(0.01, (a + b - 0.0002) ** 2 - aim.x * aim.x - aim.z * aim.z));
        aim.y = Math.max(-extension, aim.y);
      }
      const restAngle =
        Math.atan2(shin.position.z, -shin.position.y) - Math.atan2(ankle.position.z, -ankle.position.y);
      const flex = T.MathUtils.clamp(
        Math.acos(T.MathUtils.clamp((aim.lengthSq() - a * a - b * b) / (2 * a * b), -1, 1)) - restAngle,
        0,
        (5 * Math.PI) / 6,
      );
      shin.quaternion.setFromAxisAngle(right, flex);
      rest.copy(ankle.position).applyQuaternion(shin.quaternion).add(shin.position).normalize();
      thighModel.setFromUnitVectors(rest, aim.normalize());
      // Keep the kneecap facing forward on high steps. A shortest-arc
      // solution by itself leaves the swivel around the ankle ray undefined.
      pole.set(side.s * 0.065, 0, 1);
      pole.addScaledVector(aim, -pole.dot(aim)).normalize();
      kneeDirection.copy(shin.position).applyQuaternion(thighModel);
      kneeDirection.addScaledVector(aim, -kneeDirection.dot(aim)).normalize();
      const angle = Math.atan2(cross.crossVectors(kneeDirection, pole).dot(aim), kneeDirection.dot(pole));
      thighModel.premultiply(swivel.setFromAxisAngle(aim, angle));
      thigh.quaternion.copy(hipInverse).multiply(thighModel);
      shinModel.copy(thighModel).multiply(shin.quaternion);
      footOrientation.setFromAxisAngle(up, f.yaw - yaw).multiply(tilt.setFromAxisAngle(right, f.pitch));
      ankle.quaternion.copy(shinModel).invert().multiply(footOrientation);
      const print = prints[i];
      print.visible = action !== 'row';
      print.position.set(f.model.x, (f.height - pos.y) / sc + 0.003, f.model.z + 0.04);
      print.rotation.set(f.pitch, f.yaw - yaw, 0, 'YXZ');
    }
    dynamics?.setStance(feet[0].planted, feet[1].planted);
  }
  return { feet, solve };
}
