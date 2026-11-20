// Controller inputs and collisions are in metres. The gait oscillator advances
// with distance travelled, and stance anchors live in world space.
import * as T from 'three';

export const FIXED_DT = 1 / 60;
export const PROPS = [
  { kind: 'crate', x: -3.4, z: 2.8, width: 1, depth: 1, height: 0.8 },
  { kind: 'step', x: 2.9, z: 3.2, width: 1.8, depth: 1.05, height: 0.16 },
  { kind: 'ramp', x: 4.9, z: -1.3, width: 1.65, depth: 2.8, height: 0.62 },
];
const { clamp, lerp } = T.MathUtils;
const TAU = Math.PI * 2,
  WALK = 1.13,
  RUN = 3.89,
  MAX_STEP = 0.201;
const THIGH = 0.245,
  SHIN = 0.228,
  ANKLE = 0.047,
  DOWN = new T.Vector3(0, -1, 0),
  UP = new T.Vector3(0, 1, 0);
const ease = (u) => u * u * (3 - 2 * u);

function surface(p, z) {
  return p.kind === 'ramp' ? p.height * clamp((z - p.z) / p.depth + 0.5, 0, 1) : p.height;
}
export function groundHeight(x, z) {
  for (const p of PROPS) {
    if (Math.abs(x - p.x) <= p.width / 2 && Math.abs(z - p.z) <= p.depth / 2) return surface(p, z);
  }
  return 0;
}

// The lowest vertex changes as a curved shoe rocks. Reduce the actual sole to
// its lower side profile, then integrate the ground contact across its edges.
// Each interval rotates about one fixed material point. Neighbouring intervals
// meet at the angle where both vertices of their common edge touch the ground.
function makeSoleProfile(ankle) {
  ankle.updateWorldMatrix(true, true);
  const intoAnkle = ankle.matrixWorld.clone().invert();
  const transform = new T.Matrix4(),
    vertex = new T.Vector3();
  const points = [];
  ankle.traverse((mesh) => {
    if (!mesh.isMesh) return;
    transform.multiplyMatrices(intoAnkle, mesh.matrixWorld);
    const vertices = mesh.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      vertex.fromBufferAttribute(vertices, i).applyMatrix4(transform);
      points.push({ x: vertex.x, y: vertex.y + ANKLE, z: vertex.z });
    }
  });
  // A bare rig is also used by kinematics-only harnesses.
  if (!points.length) points.push({ x: 0, z: -0.035, y: 0 }, { x: 0, z: 0.077, y: 0 });
  points.sort((a, b) => a.z - b.z || a.y - b.y);
  const hull = [];
  for (const p of points) {
    const last = hull.at(-1);
    if (last && p.z === last.z) continue;
    while (hull.length > 1) {
      const a = hull.at(-2),
        b = hull.at(-1);
      if ((b.z - a.z) * (p.y - a.y) > (b.y - a.y) * (p.z - a.z) + 1e-12) break;
      hull.pop();
    }
    hull.push(p);
  }
  let zero = 0;
  for (let i = 0; i < hull.length; i++) {
    const v = hull[i],
      prev = hull[i - 1];
    v.from = prev ? Math.atan2(v.y - prev.y, v.z - prev.z) : -Math.PI / 2;
    v.travel = prev
      ? prev.travel + (v.z - prev.z) * Math.cos(v.from) + (v.y - prev.y) * Math.sin(v.from)
      : 0;
    if (v.from <= 0) zero = v.travel - v.z;
  }
  for (const v of hull) v.travel -= zero;
  return hull;
}

// Skinning is affine for each influencing joint. A roll only needs one row
// (world-space height) of each bone matrix to seat every posed skin vertex.
function skinnedFloor(mesh) {
  const { skeleton } = mesh,
    rows = new Float64Array(skeleton.bones.length * 4);
  const model = new T.Matrix4(),
    transform = new T.Matrix4();
  return (lowest) => {
    model.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
    for (let j = 0; j < skeleton.bones.length; j++) {
      transform
        .copy(model)
        .multiply(skeleton.bones[j].matrixWorld)
        .multiply(skeleton.boneInverses[j])
        .multiply(mesh.bindMatrix);
      const e = transform.elements,
        k = 4 * j;
      rows[k] = e[1];
      rows[k + 1] = e[5];
      rows[k + 2] = e[9];
      rows[k + 3] = e[13];
    }
    const { position, skinWeight, skinIndex } = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i),
        y = position.getY(i),
        z = position.getZ(i);
      let floor = 0;
      for (let j = 0; j < 4; j++) {
        const weight = skinWeight.getComponent(i, j);
        if (weight === 0) continue;
        const k = 4 * skinIndex.getComponent(i, j);
        floor += weight * (rows[k] * x + rows[k + 1] * y + rows[k + 2] * z + rows[k + 3]);
      }
      if (floor < lowest) lowest = floor;
    }
    return lowest;
  };
}

export function createController(rig, x = 0, z = 0) {
  const { root, height } = rig;
  const capsuleRadius = height * 0.118;
  const armSwing = rig.name.toLowerCase() === 'hummin' ? 0.79 : 1;
  const velocity = new T.Vector3();
  const frame = {
    dt: 0,
    time: 0,
    breath: 0,
    speed: 0,
    turn: 0,
    vy: 0,
    state: 'idle',
    emote: -1,
    phase: Math.PI / 2,
    heading: 0,
  };
  const contacts = ['L', 'R'].map((side, i) => ({
    side,
    sign: i === 0 ? 1 : -1,
    planted: true,
    ankle: rig['foot' + side],
    thigh: rig['thigh' + side],
    shin: rig['shin' + side],
    anchor: new T.Vector3(),
    sole: new T.Vector3(),
    support: new T.Vector3(),
    pivot: 0,
    target: new T.Vector3(),
    liftOff: new T.Vector3(),
    landing: new T.Vector3(),
    pitch: 0,
    yaw: 0,
    stage: 'flat',
    profile: makeSoleProfile(rig['foot' + side]),
    orientation: new T.Quaternion(),
    ankleOffset: new T.Vector3(),
  }));
  const dir = new T.Vector3(),
    knee = new T.Vector3(),
    shinDir = new T.Vector3(),
    pole = new T.Vector3();
  const local = new T.Vector3(),
    invQ = new T.Quaternion(),
    worldFoot = new T.Quaternion();
  const axisX = new T.Vector3(1, 0, 0),
    sample = new T.Vector3();
  const rollMeshes = [],
    skinnedFloors = new Map();
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry.attributes.position || node.userData.debug) return;
    rollMeshes.push(node);
    if (node.isSkinnedMesh) skinnedFloors.set(node, skinnedFloor(node));
    else if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
  });
  let travel = 0.25,
    heading = 0,
    speed = 0,
    lean = 0,
    altitude = 0,
    vy = 0;
  let jumpTime = -1,
    rollTime = -1,
    landTime = -1,
    emoteTime = -1;
  let inAir = false,
    movingLast = false,
    rollSupport = 0;
  let sine = 0,
    cosine = 1;

  function chooseFoothold(v) {
    // Stay on the chosen tread on either side of a hard edge. In particular
    // a predicted swing endpoint may reach the top of a crate the capsule
    // itself cannot climb: keep that foot on the accessible side instead.
    const pad = 0.1 * height;
    for (const p of PROPS) {
      const halfW = p.width * 0.5,
        halfD = p.depth * 0.5;
      const dx = v.x - p.x,
        dz = v.z - p.z;
      if (Math.abs(dx) >= halfW + pad || Math.abs(dz) >= halfD + pad) continue;
      const inside = Math.abs(dx) < halfW && Math.abs(dz) < halfD;
      const allowed = surface(p, v.z) <= altitude + MAX_STEP;
      if (inside && allowed) {
        v.x = p.x + clamp(dx, -halfW + pad, halfW - pad);
        v.z = p.z + clamp(dz, -halfD + pad, halfD - pad);
      } else {
        const fromX = allowed ? dx : root.position.x - p.x;
        const fromZ = allowed ? dz : root.position.z - p.z;
        if (Math.abs(fromX) - halfW > Math.abs(fromZ) - halfD)
          v.x = p.x + Math.sign(fromX || 1) * (halfW + pad);
        else v.z = p.z + Math.sign(fromZ || 1) * (halfD + pad);
      }
    }
    v.y = groundHeight(v.x, v.z);
  }
  function atRest(c, v, lead = 0) {
    const lateral = c.sign * height * 0.065;
    v.set(
      root.position.x + lateral * cosine + lead * sine,
      0,
      root.position.z - lateral * sine + lead * cosine,
    );
    chooseFoothold(v);
  }
  function swingFloor(px, pz) {
    // Include the whole shoe while clearing a step nose. The ankle can already
    // be over the lower tread while the trailing heel is above the upper one.
    const padX = height * (0.042 * Math.abs(cosine) + 0.105 * Math.abs(sine));
    const padZ = height * (0.042 * Math.abs(sine) + 0.105 * Math.abs(cosine));
    let floor = 0;
    for (const p of PROPS) {
      if (Math.abs(px - p.x) > p.width * 0.5 + padX || Math.abs(pz - p.z) > p.depth * 0.5 + padZ) continue;
      floor = Math.max(floor, surface(p, Math.min(p.z + p.depth * 0.5, pz + padZ)));
    }
    return floor;
  }
  function reset(px = x, pz = z) {
    speed = lean = vy = heading = rollSupport = sine = 0;
    cosine = 1;
    altitude = groundHeight(px, pz);
    root.position.set(px, altitude, pz);
    root.rotation.set(0, 0, 0);
    rig.hips.position.set(0, 0.52, 0);
    for (const node of rig.joints) node.quaternion.identity();
    travel = 0.25;
    movingLast = inAir = false;
    jumpTime = rollTime = landTime = emoteTime = -1;
    frame.time = frame.dt = frame.speed = frame.turn = frame.vy = frame.heading = 0;
    frame.emote = -1;
    frame.phase = Math.PI / 2;
    frame.state = 'idle';
    velocity.set(0, 0, 0);
    for (const c of contacts) {
      atRest(c, c.anchor);
      c.sole.copy(c.anchor);
      c.support.copy(c.anchor);
      c.target.copy(c.anchor);
      c.planted = true;
      c.pitch = c.yaw = 0;
      c.stage = 'flat';
    }
  }

  // Slide the upright capsule along the rounded corners of above-step solids.
  // Use the closest point on the ramp for its local collision height.
  function slide(px, pz) {
    for (const p of PROPS) {
      const x0 = p.x - p.width / 2,
        x1 = p.x + p.width / 2;
      const z0 = p.z - p.depth / 2,
        z1 = p.z + p.depth / 2;
      const cx = clamp(px, x0, x1),
        cz = clamp(pz, z0, z1);
      if (surface(p, cz) <= altitude + (inAir ? 0.004 : MAX_STEP)) continue;
      const dx = px - cx,
        dz = pz - cz,
        d = Math.hypot(dx, dz);
      if (d >= capsuleRadius) continue;
      if (d > 0.00001) {
        px = cx + (dx * capsuleRadius) / d;
        pz = cz + (dz * capsuleRadius) / d;
      } else if (Math.abs(px - p.x) - p.width / 2 > Math.abs(pz - p.z) - p.depth / 2) {
        px = px > p.x ? x1 + capsuleRadius : x0 - capsuleRadius;
      } else pz = pz > p.z ? z1 + capsuleRadius : z0 - capsuleRadius;
    }
    root.position.x = px;
    root.position.z = pz;
  }

  function planFoot(c, gait, stride, running, dt) {
    if (frame.speed < 0.015) {
      if (c.planted) {
        c.target.copy(c.anchor);
        c.pitch *= Math.exp(-30 * dt);
        if (Math.abs(c.pitch) < 0.001) c.pitch = 0;
        c.stage = c.pitch < 0 ? 'heel' : c.pitch > 0 ? 'toe' : 'flat';
      } else {
        // Finish the final swing gracefully when braking mid-step.
        const floor = groundHeight(c.target.x, c.target.z);
        c.target.y = Math.max(floor, c.target.y - dt * 1.25);
        c.pitch *= Math.exp(-30 * dt);
        if (c.target.y <= floor + 0.001) {
          c.planted = true;
          c.anchor.copy(c.target);
          c.stage = 'flat';
          c.pitch = 0;
        }
      }
      return;
    }
    const duty = 0.53;
    // At running speed place the sole parallel to the support plane. This
    // loads the tread through midfoot immediately, before the forefoot push.
    const strike = (-Math.PI / 10) * (1 - ease(Math.min(running / 0.85, 1)));
    const push = (lerp(32, 27, running) * Math.PI) / 180;
    if (gait < duty) {
      if (!c.planted) {
        c.planted = true;
        c.anchor.copy(c.landing);
        c.anchor.y = groundHeight(c.anchor.x, c.anchor.z);
      }
      c.target.copy(c.anchor);
      const stance = gait / duty;
      c.stage = stance < 0.24 ? (strike === 0 ? 'midfoot' : 'heel') : stance < 0.64 ? 'flat' : 'toe';
      c.pitch =
        c.stage === 'heel'
          ? strike * (1 - ease(stance / 0.24))
          : c.stage === 'toe'
            ? push * ease((stance - 0.64) / 0.36)
            : 0;
    } else {
      const t = clamp((gait - duty) / (1 - duty), 0, 1);
      if (c.planted) {
        c.liftOff.copy(c.anchor);
        c.planted = false;
      }
      // Predict the touchdown in the present direction. Refresh the prediction
      // during swing only, which permits a curved path without skating in stance.
      atRest(c, c.landing, stride * (duty / 2 + 1 - gait));
      c.target.lerpVectors(c.liftOff, c.landing, ease(t));
      c.target.y =
        Math.max(c.target.y, swingFloor(c.target.x, c.target.z)) +
        Math.sin(Math.PI * t) * lerp(0.085, 0.205, running);
      c.stage = 'swing';
      c.pitch = lerp(push, strike, ease(clamp((t - 0.05) / 0.82, 0, 1)));
      const yawDelta = heading - c.yaw;
      c.yaw += Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta)) * (1 - Math.exp(-dt * 19));
    }
  }

  function orientFoot(c, rock = true) {
    const p = PROPS[2],
      dx = Math.abs(c.target.x - p.x),
      dz = Math.abs(c.target.z - p.z);
    const slope = dx <= p.width * 0.5 && dz <= p.depth * 0.5 ? p.height / p.depth : 0;
    // Express the surface normal in the rotated pelvis coordinate frame.
    dir.set(sine * slope, 1, -cosine * slope).normalize();
    c.orientation.setFromUnitVectors(UP, dir);
    // Keep the contact yaw independent of the body as it turns over this foot.
    c.orientation.multiply(worldFoot.setFromAxisAngle(UP, c.yaw - heading));
    let i = 0;
    while (i + 1 < c.profile.length && c.pitch >= c.profile[i + 1].from) i++;
    c.pivot = i;
    if (rock && c.pitch !== 0) {
      const v = c.profile[i];
      const sn = Math.sin(c.pitch),
        cs = Math.cos(c.pitch);
      sample
        .set(0, v.z * sn - v.y * cs, v.travel - v.z * cs - v.y * sn)
        .applyQuaternion(c.orientation)
        .multiplyScalar(height);
      c.target.x += cosine * sample.x + sine * sample.z;
      c.target.y += sample.y;
      c.target.z += cosine * sample.z - sine * sample.x;
    }
    c.orientation.multiply(worldFoot.setFromAxisAngle(axisX, c.pitch));
    c.ankleOffset.copy(UP).multiplyScalar(ANKLE).applyQuaternion(c.orientation);
  }

  function solveLeg(c) {
    // Convert the sole target into normalized pelvis space. Add the local sole
    // offset after pitch, so the real sole traces the intended ground path.
    const dx = c.target.x - root.position.x,
      dz = c.target.z - root.position.z;
    local.set(
      (cosine * dx - sine * dz) / height - c.thigh.position.x - rig.hips.position.x + c.ankleOffset.x,
      (c.target.y - root.position.y) / height - rig.hips.position.y + c.ankleOffset.y,
      (sine * dx + cosine * dz) / height + c.ankleOffset.z,
    );
    const len = clamp(local.length(), 0.03, THIGH + SHIN - 1e-7);
    dir.copy(local).normalize();
    // The knee's bend pole stays forward even on a lateral step.
    pole.set(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
    const along = (THIGH * THIGH - SHIN * SHIN + len * len) / (2 * len);
    knee
      .copy(dir)
      .multiplyScalar(along)
      .addScaledVector(pole, Math.sqrt(Math.max(0, THIGH * THIGH - along * along)));
    c.thigh.quaternion.setFromUnitVectors(DOWN, shinDir.copy(knee).normalize());
    invQ.copy(c.thigh.quaternion).invert();
    shinDir.copy(dir).multiplyScalar(len).sub(knee).normalize().applyQuaternion(invQ);
    c.shin.quaternion.setFromUnitVectors(DOWN, shinDir);
    invQ.multiplyQuaternions(c.thigh.quaternion, c.shin.quaternion).invert();
    c.ankle.quaternion.multiplyQuaternions(invQ, c.orientation);
  }
  function walkPose(dt, running, crouch) {
    const sway = Math.min(frame.speed / WALK, 1);
    const stride = height * lerp(0.585, 0.94, running);
    travel += (frame.speed * dt) / stride;
    travel -= Math.floor(travel);
    frame.phase = travel * TAU;
    if (!movingLast && frame.speed >= 0.015) {
      // Start the first swing at the current foot rather than an old prediction.
      for (const c of contacts) if (!c.planted) c.landing.copy(c.target);
    }
    movingLast = frame.speed >= 0.015;
    for (let i = 0; i < contacts.length; i++)
      planFoot(contacts[i], (travel + i * 0.5) % 1, stride, running, dt);
    let hipY = 0.52 - sway * (0.029 + running * 0.042) - 0.002 * (1 - sway);
    // A walker rounds a tight bend on softer knees; reserve lateral reach
    // before the trailing stance leg approaches full extension.
    hipY -= (1 - running) * Math.abs(lean) * 0.27;
    const bobRange = lerp(0.035, 0.065, running);
    hipY += (((Math.cos((travel - 0.25) * TAU * 2) - 1) * bobRange * 0.5) / height) * sway;
    hipY -= crouch;
    rig.hips.position.x =
      0.009 * sway * Math.sin(frame.phase) + 0.002 * (1 - sway) * Math.sin(frame.time * 1.07);
    // Cap pelvis height by the reach sphere of each leg. This is important at
    // a stair lip or during a sharp reversal while a foot is still locked.
    for (const c of contacts) {
      orientFoot(c);
      const dx = c.target.x - root.position.x,
        dz = c.target.z - root.position.z;
      const ax =
        (cosine * dx - sine * dz) / height - c.thigh.position.x - rig.hips.position.x + c.ankleOffset.x;
      const az = (sine * dx + cosine * dz) / height + c.ankleOffset.z;
      const ankleY = (c.target.y - root.position.y) / height + c.ankleOffset.y;
      const reach = THIGH + SHIN - 0.0002;
      hipY = Math.min(hipY, ankleY + Math.sqrt(Math.max(0.0025, reach * reach - ax * ax - az * az)));
    }
    rig.hips.position.y = hipY;
    for (const c of contacts) solveLeg(c);
    const pump = (0.31 + running * 0.48) * sway;
    rig.upperArmL.rotation.x = Math.cos(frame.phase - 0.09) * pump * armSwing;
    rig.upperArmR.rotation.x = -rig.upperArmL.rotation.x;
    rig.forearmL.rotation.x = -(0.14 + running * 1.14);
    rig.forearmR.rotation.x = rig.forearmL.rotation.x;
    rig.chest.rotation.x = ((17.4 * Math.PI) / 180) * running + crouch * 0.84;
    rig.chest.rotation.z = lean - 0.012 * Math.sin(frame.phase) * sway;
    rig.chest.rotation.y = Math.cos(frame.phase) * 0.083 * sway;
  }

  function step(dt, input) {
    for (const node of rig.joints) node.quaternion.identity();
    rig.hips.position.set(0, 0.52, 0);
    frame.dt = dt;
    frame.time += dt;
    frame.breath = Math.sin(frame.time * 1.31);
    const magnitude = Math.min(1, Math.hypot(input.x, input.z));
    const targetSpeed = (input.run ? RUN : WALK) * magnitude;
    if (input.emote) emoteTime = 0;
    if (emoteTime >= 0) {
      emoteTime += dt;
      if (emoteTime > 2.1) emoteTime = -1;
    }
    frame.emote = emoteTime < 0 ? -1 : emoteTime / 2.1;
    if (jumpTime < 0 && rollTime < 0 && landTime < 0 && !inAir) {
      if (input.roll) {
        rollTime = 0;
        speed = Math.max(speed, 2.65);
      } else if (input.jump) jumpTime = 0;
    }
    const headingBefore = heading;
    if (magnitude > 0.01 && rollTime < 0) {
      const requestedTurn = Math.atan2(input.x, input.z) - heading;
      const delta = Math.atan2(Math.sin(requestedTurn), Math.cos(requestedTurn));
      heading += clamp(delta, -dt * 6.8, dt * 6.8);
    }
    const turn = (heading - headingBefore) / dt;
    if (rollTime < 0) speed = lerp(speed, targetSpeed, 1 - Math.exp(-dt / 0.078));
    if (targetSpeed === 0 && speed < 0.012) speed = 0;
    sine = Math.sin(heading);
    cosine = Math.cos(heading);
    const oldX = root.position.x,
      oldZ = root.position.z;
    slide(oldX + sine * speed * dt, oldZ + cosine * speed * dt);
    velocity.set((root.position.x - oldX) / dt, vy, (root.position.z - oldZ) / dt);
    frame.speed = Math.hypot(velocity.x, velocity.z);
    // A shallow fraction of the centripetal bank keeps the shoulders readable.
    const bank = -clamp(Math.atan2(0.34 * turn * frame.speed, 9.81), -0.37, 0.37);
    lean = lerp(lean, bank, 1 - Math.exp(-10 * dt));
    frame.heading = root.rotation.y = heading;
    frame.turn = turn;
    const floor = groundHeight(root.position.x, root.position.z);
    if (jumpTime >= 0 && !inAir) {
      jumpTime += dt;
      if (jumpTime >= 0.11) {
        vy = 3.95;
        inAir = true;
      }
    }
    if (inAir || altitude - floor > MAX_STEP + 0.003) {
      inAir = true;
      vy -= 9.81 * dt;
      altitude += vy * dt;
      if (altitude <= floor && vy <= 0) {
        altitude = floor;
        inAir = false;
        vy = 0;
        jumpTime = -1;
        landTime = 0;
      }
    } else altitude = floor;
    velocity.y = vy;
    frame.vy = vy;
    root.position.y = altitude;
    const running = clamp((frame.speed - WALK) / (RUN - WALK), 0, 1);
    rig.upperArmL.rotation.z = 0.09 + running * 0.055;
    rig.upperArmR.rotation.z = -rig.upperArmL.rotation.z;
    if (rollTime >= 0) {
      const u = Math.min(1, rollTime / 0.62),
        tuck = Math.sin(Math.PI * u);
      frame.state = 'roll';
      rig.hips.position.y = 0.52 - 0.28 * tuck;
      rig.hips.rotation.x = TAU * ease(u);
      rig.hips.rotation.z = -0.24 * tuck;
      rig.chest.rotation.x = 0.47 * tuck;
      rig.head.rotation.x = 0.63 * tuck;
      for (const c of contacts) {
        c.planted = false;
        c.stage = 'swing';
        c.thigh.rotation.x = -(1.38 + c.sign * 0.13) * tuck;
        c.shin.rotation.x = 2.18 * tuck;
        c.ankle.rotation.x = -0.61 * tuck;
      }
      rig.upperArmL.rotation.x = -1.14 * tuck;
      rig.upperArmR.rotation.x = -1.52 * tuck;
      rig.forearmL.rotation.x = -1.28 * tuck;
      rig.forearmR.rotation.x = -1.23 * tuck;
      rollTime += dt;
      if (u === 1) rollTime = -1;
    } else if (inAir) {
      frame.state = 'jump';
      const tuck = clamp((altitude - floor) * 3.3, 0, 1);
      for (const c of contacts) {
        c.planted = false;
        c.stage = 'swing';
        c.thigh.rotation.x = -0.51 * tuck - c.sign * 0.13 * tuck;
        c.shin.rotation.x = 1.04 * tuck;
        c.ankle.rotation.x = -0.39 * tuck;
      }
      rig.chest.rotation.x = 0.1;
      rig.upperArmL.rotation.z += 0.64 * tuck;
      rig.upperArmR.rotation.z -= 0.64 * tuck;
      rig.forearmL.rotation.x = rig.forearmR.rotation.x = -0.46 * tuck;
    } else {
      if (frame.state === 'roll' || (frame.state === 'jump' && landTime === 0)) {
        for (const c of contacts) {
          atRest(c, c.anchor);
          c.target.copy(c.anchor);
          c.planted = true;
          c.yaw = heading;
        }
        travel = 0.25;
      }
      frame.state =
        jumpTime >= 0
          ? 'jump'
          : landTime >= 0
            ? 'land'
            : frame.speed < 0.08
              ? 'idle'
              : frame.speed < 1.85
                ? 'walk'
                : 'run';
      const crouch =
        jumpTime >= 0
          ? 0.062 * Math.sin((Math.PI * jumpTime) / 0.18)
          : landTime >= 0
            ? 0.075 * Math.sin(Math.PI * Math.min(1, landTime / 0.21))
            : 0;
      walkPose(dt, running, crouch);
      if (landTime >= 0) {
        landTime += dt;
        if (landTime >= 0.21) landTime = -1;
      }
      rig.chest.rotation.x += 0.007 * frame.breath;
      rig.head.rotation.y = 0.052 * (1 - Math.min(frame.speed, 1)) * Math.sin(frame.time * 0.73);
    }
    for (const c of contacts) {
      c.ankle.updateWorldMatrix(true, false);
      c.sole.set(0, -ANKLE, 0).applyMatrix4(c.ankle.matrixWorld);
      if (c.planted) {
        const v = c.profile[c.pivot];
        c.support.set(v.x, v.y - ANKLE, v.z).applyMatrix4(c.ankle.matrixWorld);
      }
      if (inAir) {
        const edge = swingFloor(c.sole.x, c.sole.z);
        if (edge > floor + 0.01 && c.sole.y < edge + 0.02) {
          c.target.copy(c.sole);
          c.target.y = edge + 0.02;
          c.pitch = 0;
          orientFoot(c, false);
          solveLeg(c);
          c.ankle.updateWorldMatrix(true, false);
          c.sole.set(0, -ANKLE, 0).applyMatrix4(c.ankle.matrixWorld);
        }
      }
    }
    return frame;
  }

  function finishPose() {
    if (frame.state !== 'roll') return;
    // A capsule bounds the path, but the supporting surface of a shoulder
    // roll travels from boot to shoulder to back. Seat the actual silhouette
    // on the test floor, pruning meshes by their transformed bounding spheres.
    root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const mesh of rollMeshes) {
      if (!mesh.visible) continue;
      if (mesh.isSkinnedMesh) {
        lowest = skinnedFloors.get(mesh)(lowest);
        continue;
      }
      const geo = mesh.geometry,
        m = mesh.matrixWorld,
        e = m.elements,
        sphere = geo.boundingSphere;
      sample.copy(sphere.center).applyMatrix4(m);
      if (sample.y - sphere.radius * Math.hypot(e[1], e[5], e[9]) >= lowest) continue;
      const a = geo.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const y = e[1] * a.getX(i) + e[5] * a.getY(i) + e[9] * a.getZ(i) + e[13];
        if (y < lowest) lowest = y;
      }
    }
    if (Number.isFinite(lowest)) {
      rollSupport = altitude - lowest;
      rig.hips.position.y += rollSupport / height;
      for (const c of contacts) c.sole.y += rollSupport;
    }
  }
  reset();
  return { rig, frame, contacts, capsuleRadius, velocity, step, reset, finishPose };
}
