// All distances are unscaled character metres. In particular, the hull and the
// diorama may both be scaled and tilted; neither scale enters the integrator.
import * as T from 'three';
import { wind } from './forms.js';
import { capsuleGrid, collide, createPanel } from './cloth.js';

const clamp = T.MathUtils.clamp;
const data = (n) => new Float32Array(n);
export const palmEnvelope = { y0: -0.022, y1: -0.104, r0: 0.032, r1: 0.03 };
function makeCapsules(rig, build, waist) {
  const { hip, spine, chest, neck, head, sides } = rig;
  const segments = [];
  function add(name, a, b, r0, r1, mass, ay = 0, by = 0, az = 0, bz = 0) {
    segments.push({ name, a, b, r0, r1, mass, ay, by, az, bz });
  }
  add('pelvis', hip, spine, 0.122 * waist, 0.107 * waist, 0.14);
  add('abdomen', spine, chest, 0.109 * waist, 0.133 * build, 0.18);
  add('thorax', chest, neck, 0.135 * build, 0.06, 0.2, 0, -0.045);
  add('head', head, head, 0.071, 0.085, 0.081, 0.033, 0.125);
  for (const { s, thigh, shin, ankle, toe, arm, elbow, hand } of sides) {
    const side = s < 0 ? 'left ' : 'right ';
    add(side + 'thigh', thigh, shin, 0.088 * build, 0.056 * build, 0.1, -0.03, 0.018);
    add(side + 'shin', shin, ankle, 0.055 * build, 0.035 * build, 0.0465, -0.015, 0.009, -0.003, 0);
    add(side + 'foot', ankle, toe, 0.039, 0.042, 0.014, -0.021, 0.012, -0.032, 0.022);
    add(side + 'upper arm', arm, elbow, 0.053 * build, 0.039 * build, 0.028, -0.025, 0.015);
    add(side + 'forearm', elbow, hand, 0.039 * build, 0.024, 0.016, -0.014, 0.012);
    add(side + 'hand', hand, hand, palmEnvelope.r0, palmEnvelope.r1, 0.006, palmEnvelope.y0, palmEnvelope.y1);
  }
  const capsules = data(8 * segments.length),
    grid = capsuleGrid(segments.length);
  const footOffsets = sides.map(
    (_, i) => segments.findIndex((v) => v.name === (i ? 'right foot' : 'left foot')) * 8,
  );
  const names = segments.map((v) => v.name);
  grid.legOffsets = segments.flatMap((s, i) => (/pelvis|thigh|shin/.test(s.name) ? [8 * i] : []));
  let mass = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    mass += s.mass;
    capsules[i * 8 + 3] = s.r0;
    capsules[i * 8 + 7] = s.r1;
  }
  function update(matrices, com) {
    com.fill(0);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i],
        c = 8 * i;
      const a = matrices[s.a].elements,
        b = matrices[s.b].elements;
      for (let j = 0; j < 3; j++) {
        const x = a[12 + j] + a[4 + j] * s.ay + a[8 + j] * s.az;
        const y = b[12 + j] + b[4 + j] * s.by + b[8 + j] * s.bz;
        capsules[c + j] = x;
        capsules[c + 4 + j] = y;
        com[j] += s.mass * (x * 0.55 + y * 0.45);
      }
    }
    for (let j = 0; j < 3; j++) com[j] /= mass;
  }
  return { capsules, bounds: grid, segments, footOffsets, names, update };
}

function springChain(ids, rig) {
  const n = ids.length,
    { bones, bind } = rig;
  const position = data(n * 3),
    previous = data(n * 3),
    velocity = data(n * 3),
    target = data(n * 3),
    rendered = data(n * 3),
    length = data(n);
  const direction = new T.Vector3(),
    rest = new T.Vector3(),
    rotation = new T.Quaternion(),
    parentRotation = new T.Quaternion();
  const parent = rig.bones.indexOf(bones[ids[0]].parent);
  for (let i = 1; i < n; i++) length[i] = bind[ids[i]].distanceTo(bind[ids[i - 1]]);
  let anchored = false;
  function anchor(matrices) {
    const x = target[0],
      y = target[1],
      z = target[2];
    for (let i = 0; i < n; i++) {
      direction.copy(bind[ids[i]]).sub(bind[parent]).applyMatrix4(matrices[parent]);
      direction.toArray(target, 3 * i);
    }
    if (anchored) {
      const dx = 0.9 * (target[0] - x),
        dy = 0.9 * (target[1] - y),
        dz = 0.9 * (target[2] - z);
      for (let k = 0; k < position.length; k += 3) {
        position[k] += dx;
        position[k + 1] += dy;
        position[k + 2] += dz;
        previous[k] += dx;
        previous[k + 1] += dy;
        previous[k + 2] += dz;
      }
    }
    anchored = true;
  }
  function reset() {
    position.set(target);
    previous.set(target);
    velocity.fill(0);
  }
  let peakSpeed = 0;
  function solve(dt, w, acc, caps, bounds) {
    previous.set(position);
    const damping = Math.exp(-8 * dt);
    for (let i = 0; i < n; i++) {
      const k = 3 * i;
      if (!i) {
        position[0] = target[0];
        position[1] = target[1];
        position[2] = target[2];
        continue;
      }
      for (let j = 0; j < 3; j++) {
        const f =
          63 * (target[k + j] - position[k + j]) -
          0.55 * acc[j] +
          (j === 0 ? w * 1.2 : j === 1 ? -1.8 : w * 0.6);
        velocity[k + j] = damping * velocity[k + j] + dt * f;
        position[k + j] += dt * velocity[k + j];
      }
      const a = k - 3,
        x = position[k] - position[a],
        y = position[k + 1] - position[a + 1],
        z = position[k + 2] - position[a + 2];
      const f = length[i] / Math.max(1e-6, Math.hypot(x, y, z));
      position[k] = position[a] + f * x;
      position[k + 1] = position[a + 1] + f * y;
      position[k + 2] = position[a + 2] + f * z;
      collide(position, k, caps, bounds, 0.007);
      const speed = direction.fromArray(position, k).sub(rest.fromArray(previous, k)).length() / dt;
      peakSpeed = Math.max(peakSpeed, speed);
      const scale = Math.min(1, 7 / Math.max(1e-6, speed)) / dt;
      for (let j = 0; j < 3; j++) velocity[k + j] = (position[k + j] - previous[k + j]) * scale;
    }
  }
  function render(alpha, matrices) {
    for (let k = 0; k < rendered.length; k++) rendered[k] = previous[k] + alpha * (position[k] - previous[k]);
    parentRotation.setFromRotationMatrix(matrices[parent]);
    for (let i = 0; i < n - 1; i++) {
      rest
        .copy(bind[ids[i + 1]])
        .sub(bind[ids[i]])
        .normalize();
      direction
        .fromArray(rendered, i * 3 + 3)
        .sub(rotationVector.fromArray(rendered, i * 3))
        .normalize();
      direction.applyQuaternion(rotation.copy(parentRotation).invert());
      const q = bones[ids[i]].quaternion.setFromUnitVectors(rest, direction);
      parentRotation.multiply(q);
    }
  }
  const rotationVector = new T.Vector3();
  return {
    ids,
    position,
    previous,
    velocity,
    target,
    rendered,
    anchor,
    reset,
    solve,
    render,
    get peakSpeed() {
      return peakSpeed;
    },
  };
}

// Monotone chain on at most eight sole corners. Keep the scratch arrays so
// planted feet may pivot independently and exchange support without GC.
function footprint() {
  const points = data(8 * 2),
    indices = new Uint8Array(8),
    hull = new Uint8Array(16),
    support = data(24),
    correction = data(2);
  let count = 0;
  function cross(a, b, c) {
    return (
      (points[2 * b] - points[2 * a]) * (points[2 * c + 1] - points[2 * a + 1]) -
      (points[2 * b + 1] - points[2 * a + 1]) * (points[2 * c] - points[2 * a])
    );
  }
  function update(stance, footOffsets, caps, com) {
    let n = 0;
    for (let i = 0; i < 2; i++) {
      if (!stance[i]) continue;
      const c = footOffsets[i],
        x = caps[c],
        z = caps[c + 2],
        dx = caps[c + 4] - x,
        dz = caps[c + 6] - z;
      const inv = 1 / Math.max(0.01, Math.hypot(dx, dz)),
        ux = dx * inv,
        uz = dz * inv;
      for (let j = 0; j < 4; j++) {
        const f = j & 1 ? 0.168 : -0.057,
          w = j < 2 ? -0.051 : 0.051;
        points[n * 2] = x + ux * f + uz * w;
        points[n * 2 + 1] = z + uz * f - ux * w;
        let k = n;
        while (k > 0) {
          const prior = indices[k - 1],
            delta = points[2 * prior] - points[2 * n];
          if (delta < 0 || (delta === 0 && points[2 * prior + 1] <= points[2 * n + 1])) break;
          indices[k] = prior;
          k--;
        }
        indices[k] = n++;
      }
    }
    let m = 0;
    for (let j = 0; j < n; j++) {
      const idx = indices[j];
      while (m > 1 && cross(hull[m - 2], hull[m - 1], idx) <= 0) m--;
      hull[m++] = idx;
    }
    const bottom = m;
    for (let j = n - 2; j >= 0; j--) {
      const idx = indices[j];
      while (m > bottom && cross(hull[m - 2], hull[m - 1], idx) <= 0) m--;
      hull[m++] = idx;
    }
    count = Math.max(0, m - 1);
    let near = Infinity,
      outside = false;
    correction.fill(0);
    for (let i = 0; i < count; i++) {
      const a = hull[i] * 2,
        b = hull[(i + 1) % count] * 2,
        ax = points[a],
        az = points[a + 1],
        dx = points[b] - ax,
        dz = points[b + 1] - az;
      support[3 * i] = ax;
      support[3 * i + 1] = 0.01;
      support[3 * i + 2] = az;
      const cx = com[0] - ax,
        cz = com[2] - az;
      if (dx * cz - dz * cx < 0) outside = true;
      const t = clamp((cx * dx + cz * dz) / Math.max(1e-8, dx * dx + dz * dz), 0, 1);
      const x = dx * t - cx,
        z = dz * t - cz,
        dist = x * x + z * z;
      if (dist < near) {
        near = dist;
        correction[0] = x;
        correction[1] = z;
      }
    }
    if (!outside) correction.fill(0);
  }
  return {
    support,
    correction,
    update,
    get count() {
      return count;
    },
  };
}

export function createDynamics({ root, rig, style, build = 1, waist = 1, clothColor = '#797267', seed = 0 }) {
  const { bones, bind, hip, spine, chest, head, neck, hem } = rig;
  const colliders = makeCapsules(rig, build, waist),
    { capsules, bounds, names, footOffsets } = colliders;
  const matrices = bones.map(() => new T.Matrix4()),
    inverse = new T.Matrix4();
  const springs = [rig.hair, rig.straps].filter((v) => v?.length > 1).map((ids) => springChain(ids, rig));
  const panels = [],
    anchors = style === 'scarf' ? [neck, neck] : style === 'apron' || style === 'skirt' ? [hem] : [];
  if (anchors.length) root.userData.hasPeopleGarment = true;
  function preparePanels() {
    for (let i = 0; i < anchors.length; i++)
      panels.push(createPanel(root, style, i === 0 ? -1 : 1, build, waist, clothColor, bind[anchors[i]].y));
  }
  // Only propagate matrices on collider and anchor paths, even on a hand with
  // 15 articulated finger joints. The renderer handles the rest when visible.
  const required = new Set();
  function include(id) {
    for (let b = bones[id]; b && b !== root; b = b.parent) required.add(b);
  }
  for (const s of colliders.segments) {
    include(s.a);
    include(s.b);
  }
  const balancePaths = new Set(required);
  for (const a of anchors) include(a);
  // Spring chains start in their parent sewing frame; none of their posed
  // child matrices is read by the solver.
  for (const c of springs) include(bones.indexOf(bones[c.ids[0]].parent));
  const order = [];
  function visit(node) {
    if (node !== root && !required.has(node)) return;
    if (node !== root) order.push(node);
    node.children.forEach(visit);
  }
  visit(root);
  const identity = new T.Matrix4(),
    localMatrices = new Map([[root, identity]]);
  const paths = order.map((node) => {
    const id = bones.indexOf(node);
    const local = id < 0 ? new T.Matrix4() : matrices[id];
    const parent = localMatrices.get(node.parent);
    localMatrices.set(node, local);
    return { node, local, parent };
  });
  const balanceOnly = paths.filter(({ node }) => balancePaths.has(node));
  function transforms(activePaths) {
    for (let i = 0; i < activePaths.length; i++) {
      const { node, local, parent } = activePaths[i];
      node.updateMatrix();
      local.multiplyMatrices(parent, node.matrix);
    }
  }

  const stance = new Uint8Array([1, 1]),
    foot = footprint(),
    stepTarget = new Float32Array([-1, 0, 0]),
    com = data(3);
  const last = data(3),
    velocity = data(3),
    acc = data(3),
    up = new T.Vector3();
  const lag = data(3),
    moment = data(8),
    momentV = data(8),
    momentPrev = data(8),
    display = data(8),
    drive = data(8),
    loadPoint = data(3);
  let lastTime = NaN,
    carry = 0,
    h = 1 / 60,
    mobile = false,
    level = 2,
    resetNext = true,
    frame = 0,
    finished = -1,
    simTime = 0,
    steps = 0,
    total = 0;
  let blend = 0,
    kg = 0,
    currentAction = '',
    stepAge = 0,
    event = -1,
    windNow = 0;
  const stats = { steps: 0, maxSubsteps: 0, discarded: 0, maxSpeed: 0, energy: 0 };
  function load(mass, x = 0, y = 1, z = 0) {
    kg = Math.max(0, mass);
    loadPoint[0] = x;
    loadPoint[1] = y;
    loadPoint[2] = z;
  }
  function nudge(impulse = 0.9) {
    momentV[7] += clamp(impulse, -1.6, 1.6);
  }
  function pose(t, action) {
    frame++;
    if (t < lastTime) {
      resetNext = true;
      carry = 0;
      moment.fill(0);
      momentV.fill(0);
      momentPrev.fill(0);
      velocity.fill(0);
      lastTime = NaN;
    }
    const elapsed = Number.isFinite(lastTime) ? clamp(t - lastTime, 0, 0.25) : 0;
    currentAction = action;
    lastTime = t;
    carry += elapsed;
    const pending = Math.floor((carry + 1e-10) / h);
    steps = Math.min(2, pending);
    stats.steps = steps;
    stats.maxSubsteps = Math.max(stats.maxSubsteps, steps);
    stats.discarded += pending - steps;
    carry = Math.max(0, carry - pending * h);
    blend = clamp(carry / h, 0, 1);
    root.updateWorldMatrix(true, false);
    inverse.copy(root.matrixWorld).invert();
    const w = root.matrixWorld.elements,
      e = inverse.elements;
    const dx = w[12] - last[0],
      dy = w[13] - last[1],
      dz = w[14] - last[2];
    for (let j = 0; j < 3; j++) {
      const v = elapsed > 0 ? (e[j] * dx + e[j + 4] * dy + e[j + 8] * dz) / elapsed : 0;
      const a = elapsed > 0 ? (v - velocity[j]) / elapsed : 0;
      acc[j] += (clamp(a, -8, 8) - acc[j]) * Math.min(1, elapsed * 14);
      velocity[j] = v;
      last[j] = w[12 + j];
    }
    up.set(0, 1, 0).transformDirection(inverse);
    const fraction = kg / (70 + kg),
      err = foot.correction;
    const tiltX = action === 'row' ? -Math.atan2(up.z, up.y) : 0,
      tiltZ = action === 'row' ? Math.atan2(up.x, up.y) : 0;
    drive[0] = fraction * (-acc[0] * 0.025 + 0.003 * Math.sin(t * 2.8));
    drive[1] = fraction * (-acc[1] * 0.019 - 0.018 + 0.014 * Math.sin(t * 3));
    drive[2] = fraction * (-acc[2] * 0.025 + 0.004 * Math.cos(t * 3));
    drive[3] = clamp(err[0] * 0.8 - loadPoint[0] * fraction, -0.1, 0.1);
    drive[4] = clamp(err[1] * 0.8 - loadPoint[2] * fraction, -0.108, 0.108);
    drive[5] = clamp(-tiltX - 0.16 * acc[2] * 0.02 - loadPoint[2] * fraction, -0.24, 0.24);
    drive[6] = clamp(-tiltZ + 0.16 * acc[0] * 0.02 + loadPoint[0] * fraction, -0.24, 0.24);
    if (action === 'talk') {
      const tick = Math.floor((t + ((seed >>> 0) % 700) * 0.01) / 11);
      if (event >= 0 && event !== tick) nudge((tick % 2 ? 1 : -1) * 1.2);
      event = tick;
    }
    for (let j = 0; j < steps; j++) {
      momentPrev.set(moment);
      for (let k = 0; k < moment.length; k++) {
        const stiff = k < 3 ? 62 : k === 7 ? 74 : 95,
          damp = k === 7 ? 11 : 2 * Math.sqrt(stiff) * 0.9;
        momentV[k] += (stiff * (drive[k] - moment[k]) - damp * momentV[k]) * h;
        moment[k] += momentV[k] * h;
      }
    }
    for (let k = 0; k < 8; k++) display[k] = momentPrev[k] + (moment[k] - momentPrev[k]) * blend;
    for (let k = 0; k < 3; k++) lag[k] = display[k];
    bones[hip].position.x += display[3];
    bones[hip].position.z += display[4];
    const hipTurn = bones[hip].rotation,
      chestTurn = bones[chest].rotation,
      headTurn = bones[head].rotation;
    hipTurn.set(hipTurn.x + display[5] * 0.32, hipTurn.y, hipTurn.z + display[6] * 0.32);
    chestTurn.set(chestTurn.x + display[5] * 0.45, chestTurn.y, chestTurn.z + display[6] * 0.45 + display[7]);
    headTurn.set(
      headTurn.x + display[5] * 0.23,
      headTurn.y,
      headTurn.z + display[6] * 0.23 - display[7] * 0.6,
    );
    stepAge = Math.max(0, stepAge - elapsed);
    if (stepAge === 0) {
      stepTarget[0] = -1;
      if (action !== 'row' && Math.hypot(err[0], err[1]) > 0.052) {
        stepTarget[0] = err[0] > 0 ? 0 : 1;
        stepTarget[1] = clamp(-err[0], -0.115, 0.115);
        stepTarget[2] = clamp(-err[1], -0.12, 0.12);
        stepAge = 0.4;
      }
    }
  }
  function finish() {
    if (finished === frame) return;
    finished = frame;
    transforms(level === 2 ? balanceOnly : paths);
    colliders.update(matrices, com);
    const fraction = kg / (70 + kg);
    for (let i = 0; i < 3; i++) com[i] += (loadPoint[i] - com[i]) * fraction;
    if (currentAction === 'row') stance.fill(0);
    foot.update(stance, footOffsets, capsules, com);
    if (level === 2) {
      resetNext = true;
      return;
    }
    bounds.build(capsules);
    for (let i = 0; i < panels.length; i++) {
      panels[i].anchor(matrices[anchors[i]]);
      if (resetNext) panels[i].reset();
    }
    for (let i = 0; i < springs.length; i++) {
      springs[i].anchor(matrices);
      if (resetNext) springs[i].reset();
    }
    resetNext = false;
    for (let s = 0; s < steps; s++) {
      simTime += h;
      total++;
      windNow = wind(simTime, last[0], last[2]);
      for (let i = 0; i < panels.length; i++)
        panels[i].solve(h, mobile ? 1 : level === 1 ? 2 : 3, windNow, acc, capsules, bounds);
      for (let i = 0; i < springs.length; i++) springs[i].solve(h, windNow, acc, capsules, bounds);
    }
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      if (!steps)
        for (let k = 0; k < panel.position.length; k += 3)
          collide(panel.position, k, capsules, bounds, 0.0045);
      panel.render(blend, capsules, bounds);
    }
    for (let i = 0; i < springs.length; i++) springs[i].render(blend, matrices);
  }
  function setLOD(next, isMobile = false) {
    if (next !== level || isMobile !== mobile) {
      resetNext = resetNext || next === 2 || level === 2;
      if (isMobile !== mobile) {
        carry = 0;
        steps = 0;
      }
      mobile = isMobile;
      level = next;
      h = 1 / (mobile ? 30 : 60);
      if (level < 2 && !panels.length && anchors.length) preparePanels();
      for (const p of panels) {
        p.mesh.visible = level < 2;
      }
      if (level === 2)
        for (const chain of springs) for (const id of chain.ids) bones[id].quaternion.identity();
    }
  }
  function restore() {
    lastTime = NaN;
    carry = 0;
    steps = 0;
    velocity.fill(0);
    acc.fill(0);
    for (const p of panels) {
      p.geometry.attributes.position.needsUpdate = true;
      p.geometry.attributes.normal.needsUpdate = true;
    }
  }
  function measure() {
    let energy = 0,
      maxSpeed = 0;
    for (let i = 0; i < panels.length + springs.length; i++) {
      const p = i < panels.length ? panels[i] : springs[i - panels.length];
      maxSpeed = Math.max(maxSpeed, p.peakSpeed);
      for (let j = 0; j < p.position.length; j += 3) {
        let v2 = 0,
          observed = 0,
          d2 = 0;
        for (let k = j; k < j + 3; k++) {
          v2 += p.velocity[k] ** 2;
          observed += ((p.position[k] - p.previous[k]) / h) ** 2;
          d2 += (p.position[k] - p.target[k]) ** 2;
        }
        maxSpeed = Math.max(maxSpeed, Math.sqrt(v2), Math.sqrt(observed));
        energy += 0.5 * (v2 + 29 * d2);
      }
    }
    stats.energy = energy;
    stats.maxSpeed = maxSpeed;
    return stats;
  }
  const api = {
    pose,
    finish,
    load,
    nudge,
    setLOD,
    restore,
    measure,
    lag,
    stepTarget,
    com,
    stats,
    panels,
    chains: springs,
    capsules,
    names,
    support: foot.support,
    get supportCount() {
      return foot.count;
    },
    get stepCount() {
      return total;
    },
    get alpha() {
      return blend;
    },
    get level() {
      return level;
    },
    get interval() {
      return h;
    },
    setStance(left, right) {
      stance[0] = +left;
      stance[1] = +right;
    },
  };
  return api;
}
