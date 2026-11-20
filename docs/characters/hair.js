// Tresses follow authored guide curves. The root stays sewn to the scalp, while
// successive guide points respond to the actual acceleration of the head.
// All integration, length limits and skinning run on the controller's fixed clock.
import * as T from 'three';

const v = () => new T.Vector3();
const matrix = () => new T.Matrix4();
const surfaceShell = 1.018;

function binding(mesh, groupInverse, guide) {
  const geo = mesh.geometry;
  const position = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const toGroup = matrix().multiplyMatrices(groupInverse, mesh.matrixWorld);
  const toMesh = toGroup.clone().invert();
  const normalToGroup = new T.Matrix3().getNormalMatrix(toGroup);
  const normalToMesh = new T.Matrix3().getNormalMatrix(toMesh);
  const rest = new Float32Array(position.count * 3);
  const normals = normal ? new Float32Array(rest.length) : null;
  const segment = new Uint16Array(position.count),
    fraction = new Float32Array(position.count);
  const p = v(),
    d = v(),
    nearest = v();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i)
      .applyMatrix4(toGroup)
      .toArray(rest, i * 3);
    let best = Infinity;
    for (let j = 0; j < guide.length - 1; j++) {
      d.subVectors(guide[j + 1], guide[j]);
      const t = T.MathUtils.clamp(
        nearest.subVectors(p, guide[j]).dot(d) / Math.max(1e-10, d.lengthSq()),
        0,
        1,
      );
      const dist = nearest.copy(guide[j]).addScaledVector(d, t).distanceToSquared(p);
      if (dist < best) {
        best = dist;
        segment[i] = j;
        fraction[i] = t;
      }
    }
    if (normal)
      nearest
        .fromBufferAttribute(normal, i)
        .applyNormalMatrix(normalToGroup)
        .toArray(normals, i * 3);
  }
  position.setUsage(T.DynamicDrawUsage);
  normal?.setUsage(T.DynamicDrawUsage);
  return { mesh, position, normal, rest, normals, segment, fraction, toMesh, normalToMesh };
}

// Express each joint-attached ellipsoid as a unit sphere in its own frame.
function makeShape(spec) {
  const worldToUnit = matrix().makeScale(...spec.radii.map((r) => 1 / r));
  worldToUnit.multiply(matrix().makeTranslation(...spec.center.map((c) => -c)));
  return {
    node: spec.node,
    worldToUnit,
    unit: matrix(),
    local: matrix(),
    box: new T.Box3(),
    guideShell: 1,
  };
}

function updateShape(shape, groupWorld, strandRadius) {
  shape.unit.copy(shape.node.matrixWorld).invert().premultiply(shape.worldToUnit).multiply(groupWorld);
  shape.local.copy(shape.unit).invert();
  // A curl has thickness. Reserve that space around its guide before fitting
  // the actual ribbon surface. The Frobenius norm bounds radial stretch into
  // unit-sphere space even under a nonuniform scale on the head or shoulder.
  const u = shape.unit.elements;
  const pad =
    surfaceShell + strandRadius * Math.hypot(u[0], u[1], u[2], u[4], u[5], u[6], u[8], u[9], u[10]);
  shape.guideShell = pad;
  const e = shape.local.elements;
  const x = Math.hypot(e[0], e[4], e[8]) * pad,
    y = Math.hypot(e[1], e[5], e[9]) * pad,
    z = Math.hypot(e[2], e[6], e[10]) * pad;
  shape.box.min.set(e[12] - x, e[13] - y, e[14] - z);
  shape.box.max.set(e[12] + x, e[13] + y, e[14] + z);
}

function keepOutside(point, shapes, scratch, isGuide = false) {
  // A small shell allowance covers the chords between adjacent surface vertices.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const s of shapes) {
      if (!s.box.containsPoint(point)) continue;
      scratch.copy(point).applyMatrix4(s.unit);
      const r = scratch.lengthSq();
      const shell = isGuide ? s.guideShell : surfaceShell;
      if (r >= (shell - 0.001) ** 2) continue;
      if (r < 1e-14) scratch.set(0, shell, 0);
      else scratch.multiplyScalar(shell / Math.sqrt(r));
      point.copy(scratch).applyMatrix4(s.local);
      moved = true;
    }
    if (!moved) break;
  }
}

export function createHair(rig, colliders) {
  const chains = [],
    a = v(),
    b = v(),
    p = v(),
    q = v(),
    temp = v(),
    world = v(),
    accel = v(),
    delta = v();
  const inverse = matrix(),
    linear = new T.Matrix3(),
    one = new T.Vector3(1, 1, 1);
  let lastTime = -Infinity;

  function add(group, points, { stiffness = 110, damping = 12, maxOffset = 0.023, radius = 0.003 } = {}) {
    if (points.length < 2) throw new Error('A hair guide needs a root and tip');
    group.updateWorldMatrix(true, true);
    const rest = points.map((point) => (point.isVector3 ? point.clone() : new T.Vector3(...point)));
    const nodes = rest.map((point) => point.clone());
    const surfaces = [];
    inverse.copy(group.matrixWorld).invert();
    group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      surfaces.push(binding(mesh, inverse, rest));
      // Culling and roll support must also enclose the swept pose.
      mesh.geometry.computeBoundingSphere();
      const m = matrix().multiplyMatrices(inverse, mesh.matrixWorld);
      const inverseScale = m.clone().invert().getMaxScaleOnAxis();
      mesh.geometry.boundingSphere.radius += (maxOffset + radius) * inverseScale;
    });
    const chain = {
      group,
      rest,
      nodes,
      surfaces,
      stiffness,
      damping,
      maxOffset,
      radius,
      length: rest.map((n, i) => (i ? n.distanceTo(rest[i - 1]) : 0)),
      shapes: colliders.map(makeShape),
      speed: rest.map(v),
      lastWorld: rest.map(v),
      lastVelocity: rest.map(v),
      bend: rest.map(() => new T.Quaternion()),
      skin: rest.map(matrix),
    };
    chains.push(chain);
    return chain;
  }

  function step(f) {
    const restart = f.time <= lastTime || lastTime === -Infinity;
    lastTime = f.time;
    const dt = f.dt;
    if (!(dt > 0)) return;
    for (const c of colliders) c.node.updateWorldMatrix(true, false);
    for (const chain of chains) {
      const { group, rest, nodes, shapes, speed } = chain;
      group.updateWorldMatrix(true, false);
      linear.setFromMatrix4(inverse.copy(group.matrixWorld).invert());
      for (const shape of shapes) updateShape(shape, group.matrixWorld, chain.radius);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i],
          weight = i / (nodes.length - 1);
        world.copy(rest[i]).applyMatrix4(group.matrixWorld);
        if (restart) {
          chain.lastWorld[i].copy(world);
          chain.lastVelocity[i].setScalar(0);
          speed[i].setScalar(0);
          n.copy(rest[i]);
        }
        delta.subVectors(world, chain.lastWorld[i]).multiplyScalar(1 / dt);
        accel
          .subVectors(delta, chain.lastVelocity[i])
          .multiplyScalar(1 / dt)
          .applyMatrix3(linear)
          .clampLength(0, 18);
        chain.lastVelocity[i].copy(delta);
        chain.lastWorld[i].copy(world);
        if (!i) continue;
        // Carry the bend of the preceding segment, with progressively softer tips.
        a.subVectors(nodes[i - 1], rest[i - 1])
          .multiplyScalar(0.48)
          .add(rest[i])
          .sub(n);
        a.multiplyScalar(chain.stiffness * (1.4 - 0.42 * weight)).addScaledVector(accel, -0.39 * weight);
        a.addScaledVector(b.copy(delta).applyMatrix3(linear), -0.75 * weight);
        speed[i].addScaledVector(a, dt).multiplyScalar(Math.exp(-chain.damping * dt));
        n.addScaledVector(speed[i], dt);
        a.subVectors(n, nodes[i - 1]);
        const len = chain.length[i],
          distance = a.length();
        if (distance > 1e-9)
          n.copy(nodes[i - 1]).addScaledVector(
            a,
            T.MathUtils.clamp(distance, len * 0.94, len * 1.06) / distance,
          );
        a.subVectors(n, rest[i]).clampLength(0, chain.maxOffset * weight);
        n.copy(rest[i]).add(a);
        keepOutside(n, shapes, temp, true);
      }
      for (let i = 0; i < nodes.length; i++) {
        const lo = Math.max(0, i - 1),
          hi = Math.min(nodes.length - 1, i + 1);
        a.subVectors(rest[hi], rest[lo]).normalize();
        b.subVectors(nodes[hi], nodes[lo]).normalize();
        const bend = chain.bend[i].setFromUnitVectors(a, b);
        if (!i) bend.identity();
        // Rotate about this guide point, then translate to its simulated position.
        a.copy(rest[i]).applyQuaternion(bend).negate().add(nodes[i]);
        chain.skin[i].compose(a, bend, one);
      }
      for (const s of chain.surfaces) {
        for (let i = 0; i < s.position.count; i++) {
          const j = s.segment[i],
            t = s.fraction[i];
          a.fromArray(s.rest, i * 3);
          p.copy(a).applyMatrix4(chain.skin[j]);
          q.copy(a).applyMatrix4(chain.skin[j + 1]);
          p.lerp(q, t);
          keepOutside(p, shapes, temp);
          p.applyMatrix4(s.toMesh);
          s.position.setXYZ(i, p.x, p.y, p.z);
          if (s.normal) {
            a.fromArray(s.normals, i * 3);
            p.copy(a).applyQuaternion(chain.bend[j]);
            q.copy(a).applyQuaternion(chain.bend[j + 1]);
            p.lerp(q, t).applyNormalMatrix(s.normalToMesh);
            s.normal.setXYZ(i, p.x, p.y, p.z);
          }
        }
        s.position.needsUpdate = true;
        if (s.normal) s.normal.needsUpdate = true;
      }
    }
  }
  rig.hair = { add, step, colliders, chains };
  return rig.hair;
}
