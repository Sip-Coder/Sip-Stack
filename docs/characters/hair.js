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
  const center = spec.a ?? spec.center;
  const radii = spec.a ? [spec.radius, spec.radius, spec.radius] : spec.radii;
  const worldToUnit = matrix().makeScale(...radii.map((r) => 1 / r));
  worldToUnit.multiply(matrix().makeTranslation(...center.map((c) => -c)));
  const end = spec.b ? v().fromArray(spec.b).sub(v().fromArray(center)).divideScalar(spec.radius) : null;
  return {
    node: spec.node,
    role: spec.role,
    restNormal: v(),
    planeNormal: v(),
    push: v(),
    planeOffset: 0,
    planeActive: false,
    worldToUnit,
    end,
    invLenSq: end ? 1 / Math.max(end.lengthSq(), 1e-12) : 0,
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
    surfaceShell +
    strandRadius *
      Math.sqrt(
        u[0] * u[0] +
          u[1] * u[1] +
          u[2] * u[2] +
          u[4] * u[4] +
          u[5] * u[5] +
          u[6] * u[6] +
          u[8] * u[8] +
          u[9] * u[9] +
          u[10] * u[10],
      );
  shape.guideShell = pad;
  const e = shape.local.elements;
  const x = Math.sqrt(e[0] * e[0] + e[4] * e[4] + e[8] * e[8]) * pad,
    y = Math.sqrt(e[1] * e[1] + e[5] * e[5] + e[9] * e[9]) * pad,
    z = Math.sqrt(e[2] * e[2] + e[6] * e[6] + e[10] * e[10]) * pad;
  const end = shape.end;
  const dx = end ? e[0] * end.x + e[4] * end.y + e[8] * end.z : 0;
  const dy = end ? e[1] * end.x + e[5] * end.y + e[9] * end.z : 0;
  const dz = end ? e[2] * end.x + e[6] * end.y + e[10] * end.z : 0;
  shape.box.min.set(e[12] + Math.min(0, dx) - x, e[13] + Math.min(0, dy) - y, e[14] + Math.min(0, dz) - z);
  shape.box.max.set(e[12] + Math.max(0, dx) + x, e[13] + Math.max(0, dy) + y, e[14] + Math.max(0, dz) + z);
}

// Find the nearest approach of a chain segment to the collider spine in
// unit space. The vector points from the spine toward the hair.
function nearestChord(a, b, shape, out, direction) {
  const d = direction.subVectors(b, a),
    e = shape.end;
  const aa = d.lengthSq(),
    ab = e ? d.dot(e) : 0,
    ac = d.dot(a);
  const bb = e ? e.lengthSq() : 0,
    bc = e ? e.dot(a) : 0;
  const denom = aa * bb - ab * ab;
  let u = denom > 1e-12 ? T.MathUtils.clamp((ab * bc - bb * ac) / denom, 0, 1) : 0;
  let t = bb > 1e-12 ? T.MathUtils.clamp((ab * u + bc) / bb, 0, 1) : 0;
  u = aa > 1e-12 ? T.MathUtils.clamp((ab * t - ac) / aa, 0, 1) : 0;
  t = bb > 1e-12 ? T.MathUtils.clamp((ab * u + bc) / bb, 0, 1) : 0;
  out.copy(a).addScaledVector(d, u);
  if (e) out.addScaledVector(e, -t);
}
function updateGuard(shape, nodes, initial, a, b, nearest, direction, normal) {
  shape.planeActive = false;
  if (!shape.role || shape.role === 'head') return;
  let min = Infinity;
  shape.first = nodes.length;
  shape.last = 0;
  for (let i = 1; i < nodes.length; i++) {
    a.copy(nodes[i - 1]).applyMatrix4(shape.unit);
    b.copy(nodes[i]).applyMatrix4(shape.unit);
    nearestChord(a, b, shape, nearest, direction);
    const dist = nearest.lengthSq();
    if (dist < (shape.guideShell + 0.13) ** 2) {
      shape.first = Math.min(shape.first, i - 1);
      shape.last = i;
    }
    if (dist < min) {
      min = dist;
      normal.copy(nearest);
    }
  }
  if (initial) {
    shape.restNormal.copy(normal).normalize();
    return;
  }
  if (shape.first > shape.last || shape.restNormal.lengthSq() < 0.5) return;
  // Keep the connected ribbon on the same side it was fitted on. Outward
  // point projections alone can send two corners to opposite sides of a
  // shoulder during a roll and stretch the joining face through the jacket.
  normal.normalize();
  if (normal.dot(shape.restNormal) < 0.55) normal.copy(shape.restNormal);
  else normal.lerp(shape.restNormal, 0.48).normalize();
  const e = shape.unit.elements,
    inv = shape.local.elements,
    n = normal;
  shape.planeNormal.set(
    e[0] * n.x + e[1] * n.y + e[2] * n.z,
    e[4] * n.x + e[5] * n.y + e[6] * n.z,
    e[8] * n.x + e[9] * n.y + e[10] * n.z,
  );
  shape.push.set(
    inv[0] * n.x + inv[4] * n.y + inv[8] * n.z,
    inv[1] * n.x + inv[5] * n.y + inv[9] * n.z,
    inv[2] * n.x + inv[6] * n.y + inv[10] * n.z,
  );
  shape.planeOffset =
    surfaceShell + Math.max(0, shape.end?.dot(n) ?? 0) - e[12] * n.x - e[13] * n.y - e[14] * n.z;
  shape.planeActive = true;
}

function keepOutside(
  point,
  shapes,
  scratch,
  isGuide = false,
  allShapes = shapes,
  arc = 0,
  count = shapes.length,
) {
  // A small shell allowance covers the chords between adjacent surface vertices.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let j = 0; j < count; j++) {
      const s = shapes[j];
      if (s.planeActive && arc > s.first - 0.45 && arc < s.last + 0.45 && arc > 0.5) {
        // A shared plane is needed on both sides of the *crossing segment*.
        // Keep its proximal anchors intact, including on long face tendrils.
        const influence =
          T.MathUtils.smoothstep(arc, Math.max(0.5, s.first - 0.45), Math.max(1.05, s.first + 0.1)) *
          (1 - T.MathUtils.smoothstep(arc, s.last + 0.05, s.last + 0.45));
        const inset =
          s.planeOffset + (isGuide ? s.guideShell - surfaceShell : 0) - s.planeNormal.dot(point);
        if (inset > 1e-4 && influence > 0) {
          point.addScaledVector(s.push, inset * influence);
          moved = true;
        }
        if (influence > 0.99) continue;
      }
      if (!s.box.containsPoint(point)) continue;
      scratch.copy(point).applyMatrix4(s.unit);
      const t = s.end ? T.MathUtils.clamp(scratch.dot(s.end) * s.invLenSq, 0, 1) : 0;
      if (s.end) scratch.addScaledVector(s.end, -t);
      const r = scratch.lengthSq();
      const shell = isGuide ? s.guideShell : surfaceShell;
      if (r >= (shell - 0.001) ** 2) continue;
      if (r < 1e-14) scratch.set(0, shell, 0);
      else scratch.multiplyScalar(shell / Math.sqrt(r));
      if (s.end) scratch.addScaledVector(s.end, t);
      point.copy(scratch).applyMatrix4(s.local);
      moved = true;
    }
    if (!moved) break;
    shapes = allShapes;
    count = shapes.length;
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

  function add(
    group,
    points,
    { stiffness = 110, damping = 12, maxOffset = 0.023, radius = 0.003, role = 'mass', fanSide, breathingBend } = {},
  ) {
    if (points.length < 2) throw new Error('A hair guide needs a root and tip');
    group.updateWorldMatrix(true, true);
    // Four deformable segments on the longer clumps; three on short face tendrils.
    const authored = points.map((point) => (point.isVector3 ? point.clone() : new T.Vector3(...point)));
    const rest = new T.CatmullRomCurve3(authored).getSpacedPoints(authored.length < 5 ? 3 : 4);
    const tangent = rest.at(-1).clone().sub(rest.at(-2)).normalize();
    const headLocal = rig.head.worldToLocal(group.localToWorld(rest[0].clone()));
    const side =
      fanSide ?? (Math.abs(headLocal.x) > 0.004 ? Math.sign(headLocal.x) : Math.cos(chains.length * 2.4));
    const outward = new T.Vector3(side * 0.6, 0.58, -0.78).normalize();
    const axis = tangent.clone().cross(outward);
    if (axis.lengthSq() < 0.03) axis.crossVectors(tangent, new T.Vector3(1, 0, 0));
    axis.normalize();
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
      role,
      breathingBend,
      // A short face curl has less travel than a long lock past the shoulder.
      gaitGain:
        role === 'face'
          ? T.MathUtils.clamp(
              rest.reduce((l, p, i) => l + (i ? p.distanceTo(rest[i - 1]) : 0), 0) / 0.18,
              0.52,
              1,
            )
          : 1,
      side,
      axis,
      variation: Math.sin(chains.length * 2.39996),
      stiffness,
      damping,
      maxOffset,
      radius,
      length: rest.map((n, i) => (i ? n.distanceTo(rest[i - 1]) : 0)),
      shapes: colliders.map(makeShape),
      nearby: new Array(colliders.length),
      posedBox: new T.Box3(),
      reach: new Float32Array(rest.length),
      speed: rest.map(v),
      lastWorld: rest.map(v),
      lastVelocity: rest.map(v),
      bend: rest.map(() => new T.Quaternion()),
      skin: rest.map(matrix),
    };
    for (const surface of surfaces) {
      surface.mesh.geometry.computeBoundingBox();
      for (let i = 0; i < surface.position.count; i++) {
        const j = surface.segment[i];
        p.fromArray(surface.rest, i * 3);
        chain.reach[j] = Math.max(chain.reach[j], p.distanceTo(rest[j]));
        chain.reach[j + 1] = Math.max(chain.reach[j + 1], p.distanceTo(rest[j + 1]));
      }
    }
    for (const shape of chain.shapes) {
      shape.node.updateWorldMatrix(true, false);
      updateShape(shape, group.matrixWorld, radius);
      updateGuard(shape, rest, true, a, b, p, q, temp);
    }
    chains.push(chain);
    return chain;
  }

  function step(f) {
    const restart = f.time <= lastTime || lastTime === -Infinity;
    lastTime = f.time;
    const dt = f.dt;
    if (!(dt > 0)) return;
    for (const c of colliders) c.node.updateWorldMatrix(true, false);
    const pace = Math.min(1, f.speed / 1.13),
      sprint = T.MathUtils.clamp((f.speed - 1.13) / 2.76, 0, 1);
    const breath = f.breath ?? Math.sin(f.time * 1.31);
    for (const chain of chains) {
      const { group, rest, nodes, shapes, speed } = chain;
      group.updateWorldMatrix(true, false);
      linear.setFromMatrix4(inverse.copy(group.matrixWorld).invert());
      for (const shape of shapes) {
        updateShape(shape, group.matrixWorld, chain.radius);
        shape.planeActive = false;
      }
      // Shoulder lift and release load the curl twice per stride. A small
      // alternating term makes opposite face tendrils recover independently.
      const phase = (f.phase ?? 0) + chain.variation * (chain.role === 'face' ? 0.17 : 0.065);
      const gait =
        Math.cos(2 * phase) * (0.157 + 0.28 * sprint) * (chain.role === 'face' ? 0.79 : 1) +
        Math.sin(phase) * (0.027 * chain.variation + 0.17 * sprint);
      // Long face-framing locks already inherit more of the chest excursion.
      const breathBend = chain.breathingBend ?? (chain.role === 'face' ? 0.02 - 0.01 * chain.gaitGain : 0.02);
      const drive = pace * gait * chain.gaitGain + (1 - pace) * breathBend * breath;
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
        // Root stays sewn. The proximal section is stiff and the distal
        // response has greater damping, so it catches up without ringing.
        const flex = weight * weight;
        const stiffness = chain.stiffness * (4.6 - 1.8 * weight);
        const damping = chain.damping * (1.12 + 0.36 * weight);
        // The curved lock shortens slightly as it loads on a down-step.
        // The 6% segment constraint below preserves its volume and cut.
        const load = Math.max(0, Math.cos(2 * phase + 0.68)) * pace;
        a.subVectors(rest[i], rest[i - 1])
          .multiplyScalar(1 - 0.058 * load * flex)
          .applyAxisAngle(chain.axis, drive * flex);
        // Only the free part fans on the upswing. Each clump has its own
        // outward vector, phase and bend, even where two roots are adjacent.
        const fan = Math.max(0, Math.sin(2 * phase + 0.6)) * pace;
        a.x += chain.side * (0.034 + 0.024 * chain.variation) * chain.length[i] * fan * flex;
        accel.y *= 1 + pace * (chain.gaitGain - 1);
        a.add(nodes[i - 1])
          .sub(n)
          .multiplyScalar(stiffness)
          .addScaledVector(accel, -0.65 * flex)
          .addScaledVector(b.copy(delta).applyMatrix3(linear), -0.32 * flex);
        speed[i].addScaledVector(a, dt).multiplyScalar(Math.exp(-damping * dt));
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
      for (const shape of shapes) updateGuard(shape, nodes, false, a, b, p, q, temp);
      for (let i = 1; i < nodes.length; i++) keepOutside(nodes[i], shapes, temp, true, shapes, i);
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
      // Both endpoints of the linear blend lie inside a bone sphere. Their
      // enclosing box therefore bounds every skinned point before projection.
      chain.posedBox.makeEmpty();
      for (let i = 0; i < nodes.length; i++) {
        chain.posedBox.expandByPoint(a.copy(nodes[i]).addScalar(chain.reach[i]));
        chain.posedBox.expandByPoint(a.copy(nodes[i]).addScalar(-chain.reach[i]));
      }
      let activeCount = 0;
      for (const shape of shapes)
        if (shape.planeActive || shape.box.intersectsBox(chain.posedBox))
          chain.nearby[activeCount++] = shape;
      for (const s of chain.surfaces) {
        const geometry = s.mesh.geometry,
          box = geometry.boundingBox;
        box.makeEmpty();
        for (let i = 0; i < s.position.count; i++) {
          const j = s.segment[i],
            t = s.fraction[i];
          a.fromArray(s.rest, i * 3);
          p.copy(a).applyMatrix4(chain.skin[j]);
          q.copy(a).applyMatrix4(chain.skin[j + 1]);
          p.lerp(q, t);
          keepOutside(p, chain.nearby, temp, false, shapes, j + t, activeCount);
          p.applyMatrix4(s.toMesh);
          s.position.setXYZ(i, p.x, p.y, p.z);
          box.expandByPoint(p);
          if (s.normal) {
            a.fromArray(s.normals, i * 3);
            p.copy(a).applyQuaternion(chain.bend[j]);
            q.copy(a).applyQuaternion(chain.bend[j + 1]);
            p.lerp(q, t).applyNormalMatrix(s.normalToMesh);
            s.normal.setXYZ(i, p.x, p.y, p.z);
          }
        }
        box.getBoundingSphere(geometry.boundingSphere);
        s.position.needsUpdate = true;
        if (s.normal) s.normal.needsUpdate = true;
      }
    }
  }
  rig.hair = { add, step, colliders, chains };
  return rig.hair;
}
