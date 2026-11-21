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
function makeShape(spec, sleeveRoute) {
  if (spec.support)
    return { node: spec.node, role: spec.role, support: spec.support, unit: matrix(), local: matrix(), box: new T.Box3() };
  const center = spec.a ?? spec.center;
  const radii = spec.a ? [spec.radius, spec.radius, spec.radius] : spec.radii;
  const worldToUnit = matrix().makeScale(...radii.map((r) => 1 / r));
  worldToUnit.multiply(matrix().makeTranslation(...center.map((c) => -c)));
  const end = spec.b ? v().fromArray(spec.b).sub(v().fromArray(center)).divideScalar(spec.radius) : null;
  return {
    node: spec.node,
    role: spec.role,
    localContact: spec.localContact === true,
    sleeveRoute: spec.sleeveJoint ? sleeveRoute : null,
    sleeveJoint: spec.sleeveJoint,
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
  if (shape.support) {
    shape.unit.copy(shape.node.matrixWorld).invert();
    // A spherical tip around a nonuniformly scaled head must still clear
    // the pack in every world direction. Bound the largest eigenvalue of
    // the inverse pack transform times its transpose by its row sums.
    const m = shape.unit.elements;
    const xy = Math.abs(m[0] * m[1] + m[4] * m[5] + m[8] * m[9]);
    const xz = Math.abs(m[0] * m[2] + m[4] * m[6] + m[8] * m[10]);
    const yz = Math.abs(m[1] * m[2] + m[5] * m[6] + m[9] * m[10]);
    const stretch = Math.sqrt(Math.max(
      m[0] ** 2 + m[4] ** 2 + m[8] ** 2 + xy + xz,
      m[1] ** 2 + m[5] ** 2 + m[9] ** 2 + xy + yz,
      m[2] ** 2 + m[6] ** 2 + m[10] ** 2 + xz + yz,
    ));
    shape.physicalTipRadius = strandRadius * groupWorld.getMaxScaleOnAxis() * stretch;
    shape.unit.multiply(groupWorld);
    shape.local.copy(shape.unit).invert();
    shape.radius = strandRadius * shape.unit.getMaxScaleOnAxis();
    shape.box.copy(shape.support.bounds).expandByScalar(0.005 + 3 * shape.radius).applyMatrix4(shape.local);
    return;
  }
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
  if (shape.support || !shape.role || shape.role === 'head') return;
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
  if (shape.sleeveRoute) {
    // A raised or tucked arm can rotate its rest-side tangent into the neck.
    // Slide the clump around the front/back of the sleeve on its authored
    // side of the head as the arm crosses it.
    const arm = shape.sleeveJoint.rotation;
    const crossing = T.MathUtils.smoothstep(Math.max(Math.abs(arm.z), -arm.x), 0.9, 1.8);
    if (crossing > 0) {
      b.copy(shape.sleeveRoute).transformDirection(shape.unit);
      normal.lerp(b, crossing).normalize();
    }
  }
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
  escape = null,
) {
  // A small shell allowance covers the chords between adjacent surface vertices.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let j = 0; j < count; j++) {
      const s = shapes[j];
      if (s.support) {
        if (isGuide || !s.box.containsPoint(point)) continue;
        scratch.copy(point).applyMatrix4(s.unit);
        // Support belongs to one physical top, even where several leather
        // panels overlap. The blend gives contact continuous force at entry.
        const lift = s.support.heightAt(scratch.x, scratch.z) + 0.0018 - scratch.y;
        const blend = 0.001;
        if (lift <= -blend) continue;
        scratch.y += lift >= blend ? lift : (lift + blend) ** 2 / (4 * blend);
        point.copy(scratch).applyMatrix4(s.local);
        moved ||= lift > 0.00001;
        continue;
      }
      // Small pieces such as an earring or one short section of a hood have
      // a local contact patch. Their tangent must not lift a distant curl.
      if (
        s.planeActive &&
        (!s.localContact || s.box.containsPoint(point)) &&
        arc > s.first - 0.45 && arc < s.last + 0.45 && arc > 0.5
      ) {
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
    if (!moved) return;
    shapes = allShapes;
    count = shapes.length;
  }
  // At a folded sleeve two opposing tangent planes can trap a tip against
  // the cheek. Follow its side of the head out of the union of ellipsoids.
  // Each straight ray can exit a given convex ellipsoid only once.
  if (!escape) return;
  for (let pass = 0; pass < count; pass++) {
    let advance = 0;
    for (const shape of shapes) {
      if (shape.support || shape.end || !shape.box.containsPoint(point)) continue;
      scratch.copy(point).applyMatrix4(shape.unit);
      const shell = isGuide ? shape.guideShell : surfaceShell;
      const offset = scratch.lengthSq() - shell * shell;
      if (offset >= -0.00001) continue;
      const e = shape.unit.elements;
      const dx = e[0] * escape.x + e[4] * escape.y + e[8] * escape.z;
      const dy = e[1] * escape.x + e[5] * escape.y + e[9] * escape.z;
      const dz = e[2] * escape.x + e[6] * escape.y + e[10] * escape.z;
      const a = dx * dx + dy * dy + dz * dz;
      const b = scratch.x * dx + scratch.y * dy + scratch.z * dz;
      advance = Math.max(advance, (Math.sqrt(b * b - a * offset) - b) / a);
    }
    if (advance === 0) return;
    point.addScaledVector(escape, advance + 0.000001);
  }
}

// A lock draping over the pack bends at its attachment while the free coil
// keeps its shape. Lift the connected guide as a unit in the contact frame;
// projecting each endpoint independently would crush a coil against the flap.
function drapeGuide(chain, point, delta) {
  for (const shape of chain.shapes) {
    if (!shape.support) continue;
    const nodes = chain.nodes;
    let rise = 0;
    for (let i = 1; i < nodes.length; i++) {
      if (!shape.box.containsPoint(nodes[i])) continue;
      point.copy(nodes[i]).applyMatrix4(shape.unit);
      let height = shape.support.sphereHeight(point.x, point.z, shape.radius);
      if (i === nodes.length - 1 && shape.support.topForSphere)
        height = Math.max(height, shape.support.topForSphere(point.x, point.z, shape.physicalTipRadius));
      const weight = Math.min(1, 2.9 * i / (nodes.length - 1));
      rise = Math.max(rise, (height + 0.002 - point.y) / weight);
    }
    if (!rise) continue;
    const m = shape.local.elements;
    delta.set(m[4], m[5], m[6]).multiplyScalar(rise);
    for (let i = 1; i < nodes.length; i++)
      nodes[i].addScaledVector(delta, Math.min(1, 2.9 * i / (nodes.length - 1)));
  }
}

// Short packed spirals transfer a contact force through the complete final
// turn. Let that turn translate on the hood or pack as a unit: squeezing its
// individual guides would turn the coil inside out as a shoulder passes it.
function retainTerminalTurn(chain, offset, trial, projected, scratch) {
  const { nodes, freeNodes, shapes } = chain;
  const last = nodes.length - 1;
  const first = Math.ceil(last * 0.5);
  offset.subVectors(nodes[last], freeNodes[last]);
  // A cut fitted against a shoulder or earring already has a curved resting
  // shape. Remember that supported shape along the hook, relative to the
  // tip, before asking its terminal turn to slide as one piece.
  const supported = chain.supportedRest;
  if (supported && !chain.hasSupportedRest) {
    for (let i = first; i <= last; i++)
      supported[i].subVectors(nodes[i], freeNodes[i]).sub(offset);
    chain.hasSupportedRest = true;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = first; i <= last; i++) {
      trial.copy(freeNodes[i]).add(offset);
      if (supported) trial.add(supported[i]);
      projected.copy(trial);
      keepOutside(projected, shapes, scratch, true, shapes, i, shapes.length, chain.sleeveRoute);
      offset.add(projected.sub(trial));
    }
  }
  for (let i = first; i <= last; i++) {
    nodes[i].copy(freeNodes[i]).add(offset);
    if (supported) nodes[i].add(supported[i]);
  }
  drapeGuide(chain, trial, projected);
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
    {
      stiffness = 110,
      damping = 12,
      maxOffset = 0.023,
      radius = 0.003,
      role = 'mass',
      fanSide,
      breathingBend,
      gaitCoupling = 1,
      sleeveRoute = null,
    } = {},
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
    // A short face curl has less travel than a long lock past the shoulder.
    // The groom's hold on the scalp changes its response to footfalls independently of breathing.
    const length = rest.reduce((sum, point, i) => sum + (i ? point.distanceTo(rest[i - 1]) : 0), 0);
    const lengthGain = role === 'face' ? T.MathUtils.clamp(length / 0.18, 0.52, 1) : 1;
    const chain = {
      group,
      rest,
      nodes,
      surfaces,
      role,
      breathingBend: breathingBend ?? (role === 'face' ? 0.02 - 0.01 * lengthGain : 0.02),
      gaitGain: lengthGain * gaitCoupling,
      side,
      axis,
      variation: Math.sin(chains.length * 2.39996),
      stiffness,
      damping,
      maxOffset,
      radius,
      length: rest.map((n, i) => (i ? n.distanceTo(rest[i - 1]) : 0)),
      sleeveRoute,
      shapes: colliders.map((spec) => makeShape(spec, sleeveRoute)),
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
      if (chain.freeNodes)
        for (let i = 0; i < nodes.length; i++) nodes[i].copy(chain.freeNodes[i]);
      // Shoulder lift and release load the curl twice per stride. A small
      // alternating term makes opposite face tendrils recover independently.
      const phase = (f.phase ?? 0) + chain.variation * (chain.role === 'face' ? 0.17 : 0.065);
      const gait =
        Math.cos(2 * phase) * (0.157 + 0.28 * sprint) * (chain.role === 'face' ? 0.79 : 1) +
        Math.sin(phase) * (0.027 * chain.variation + 0.17 * sprint);
      // Long face-framing locks already inherit more of the chest excursion.
      const drive = pace * gait * chain.gaitGain + (1 - pace) * chain.breathingBend * breath;
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
        if (chain.freeNodes) chain.freeNodes[i].copy(n);
        else keepOutside(n, shapes, temp, true);
      }
      if (chain.freeNodes)
        for (let i = 1; i < nodes.length; i++) keepOutside(nodes[i], shapes, temp, true);
      for (const shape of shapes) updateGuard(shape, nodes, false, a, b, p, q, temp);
      for (let i = 1; i < nodes.length; i++)
        keepOutside(nodes[i], shapes, temp, true, shapes, i, shapes.length, chain.sleeveRoute);
      drapeGuide(chain, p, q);
      if (chain.freeNodes) retainTerminalTurn(chain, delta, a, p, temp);
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
          keepOutside(p, chain.nearby, temp, false, shapes, j + t, activeCount, chain.sleeveRoute);
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
