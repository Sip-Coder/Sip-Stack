// Selected human grooms load this alongside their existing secondary motion.
// Only the GLB's strategic lock bones move. Roots, filler, and the band remain
// attached to the head and all the rendered vertices are skinned on the GPU.
import * as T from 'three';

const { clamp } = T.MathUtils;
const X = new T.Vector3(1, 0, 0), Z = new T.Vector3(0, 0, 1), DOWN = new T.Vector3(0, -1, 0);
const slideAngles = [0.018, 0.036, 0.065, 0.095, 0.14, 0.21, 0.31, 0.44, 0.60]
  .map(a => [Math.cos(a), Math.sin(a)]);
const slideRing = Array.from({ length: 12 }, (_, i) =>
  [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)]);
const reducedQuery = '(prefers-reduced-motion: reduce)';
const vec = (xyz) => new T.Vector3(...xyz);

function capsule(label, node, a, b, radii) {
  return {
    label, node, start: vec(a), end: vec(b), radii: vec(radii),
    localToHead: new T.Matrix4(), headToLocal: new T.Matrix4(), scale: 1,
  };
}

function collisionVolumes(rig, { head, band }) {
  const roma = rig.name === 'roma';
  const headVolumes = roma
    ? [
      ['scalp', [0, 0.073, 0.003], [0, 0.112, -0.003], [0.067, 0.04, 0.055]],
      ['cheeks and jaw', [0, 0.05, 0.01], [0, 0.062, 0.011], [0.06, 0.039, 0.054]],
    ] : [
      ['scalp', [0, 0.067, 0], [0, 0.096, -0.004], [0.057, 0.033, 0.052]],
      ['cheeks and jaw', [0, 0.045, 0.003], [0, 0.057, 0.003], [0.053, 0.039, 0.048]],
    ];
  const shapes = headVolumes.map(([label, a, b, r]) => capsule(label, head, a, b, r));
  for (const side of [-1, 1]) {
    const name = side > 0 ? 'L' : 'R';
    const earX = roma ? 0.066 : 0.056;
    shapes.push(capsule('ear ' + name, head,
      [side * earX, 0.059, roma ? 0.009 : 0], [side * earX, 0.068, roma ? 0.009 : 0],
      [0.011, 0.015, 0.013]));
    shapes.push(capsule('shoulder ' + name, rig['upperArm' + name],
      [0, 0.001, 0], [side * 0.005, -0.047, -0.002], [0.037, 0.030, 0.043]));
    shapes.push(capsule('collar ' + name, rig.chest,
      [side * 0.05, roma ? 0.168 : 0.162, 0.025], [side * 0.06, roma ? 0.157 : 0.154, -0.033],
      [0.028, 0.023, 0.018]));
  }
  shapes.push(capsule('neck', rig.chest,
    [0, 0.163, 0.022], [0, 0.235, 0.039], [0.033, 0.027, 0.036]));
  shapes.push(capsule('upper back and rear collar', rig.chest,
    [0, 0.097, -0.033], [0, roma ? 0.147 : 0.156, -0.036], [0.091, 0.030, 0.052]));

  // The arc samples come from the original band guide. Consecutive capsules
  // protect its edge without surrounding its open sides with a solid dome.
  const bandRadii = Array.isArray(band?.radius) ? band.radius : Array(3).fill(band?.radius ?? 0.007);
  for (let i = 1; i < (band?.points?.length ?? 0); i++) {
    shapes.push(capsule('headband ' + i, head, band.points[i - 1], band.points[i], bandRadii));
  }
  return shapes;
}

function chainRadii({ mesh, points }, headInverse) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lengths.at(-1);
  const bounds = points.map(() => 0);
  const pose = new T.Vector3(), onGuide = new T.Vector3();
  const { position, uv } = mesh.geometry.attributes;
  const meshToHead = headInverse.clone().multiply(mesh.matrixWorld);
  for (let i = 0; i < position.count; i++) {
    const along = clamp(uv.getX(i), 0, 1);
    const station = along * total;
    let next = 1;
    while (next < points.length - 1 && lengths[next] < station) next++;
    const start = lengths[next - 1], span = lengths[next] - start;
    const t = clamp((station - start) / span, 0, 1);
    onGuide.copy(points[next - 1]).lerp(points[next], t);
    mesh.getVertexPosition(i, pose).applyMatrix4(meshToHead);
    // The measured tip ball covers the tapered end, not the thicker belly.
    const stationIndex = t < 0.5 ? next - 1 : next;
    if (stationIndex < points.length - 1)
      bounds[stationIndex] = Math.max(bounds[stationIndex], pose.distanceTo(onGuide));
    if (along > 0.985)
      bounds[points.length - 1] = Math.max(bounds.at(-1), pose.distanceTo(points.at(-1)));
  }
  return bounds;
}

function linkChain(binding, index, headInverse, roma) {
  const points = binding.points.map(vec);
  const bones = binding.bones;
  if (points.length !== bones.length + 1 || bones.length < 2 ||
      bones.some((bone, i) => i > 0 && bone.parent !== bones[i - 1])) {
    throw Error('Invalid hair chain hierarchy for ' + binding.mesh.name);
  }
  const phase = index * 2.3999632;
  const side = Math.sign(points.at(-1).x) || Math.cos(phase);
  const axis = new T.Vector3(side * 0.55, 0.25, -0.8).normalize();
  const guideLength = points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(points[i]), 0);
  const lengthRate = clamp((roma ? 0.15 : 0.084) / guideLength, 0.9, 1.13);
  return {
    ...binding, points, phase, side, axis,
    pads: chainRadii({ ...binding, points }, headInverse).map((radius, i) =>
      0.00022 + (i === points.length - 1 ? radius : Math.min(radius, 0.006))),
    links: bones.map((bone, i) => {
      const dir = points[i + 1].clone().sub(points[i]);
      const length = dir.length();
      if (length < 1e-5) throw Error('Degenerate hair segment for ' + binding.mesh.name);
      const freedom = i / (bones.length - 1);
      const stiffness = ((roma ? 154 : 198) - freedom * (roma ? 58 : 55)) * lengthRate;
      return {
        bone, length, dir: dir.divideScalar(length), share: freedom ** 1.4, stiffness,
        damping: Math.sqrt(stiffness) * (0.58 - (roma ? 0.19 : 0.14) * freedom),
        offset: new T.Vector3(), velocity: new T.Vector3(),
      };
    }),
  };
}

export function createHairMotion(rig, groom) {
  let version, advance;
  return frame => {
    if (!groom?.bindings?.length) return;
    if (groom.version !== version || !advance) {
      version = groom.version;
      advance = groomSolver(rig, groom);
    }
    advance(frame);
  };
}

function groomSolver(rig, groom) {
  groom.head.updateWorldMatrix(true, false);
  groom.group.updateMatrixWorld(true);
  const inverse = groom.head.matrixWorld.clone().invert();
  const roma = rig.name === 'roma';
  const chains = groom.bindings.map((binding, i) => linkChain(binding, i, inverse, roma));
  const shapes = collisionVolumes(rig, groom);
  const preference = globalThis.matchMedia?.(reducedQuery);
  const stepLimit = 1 / (groom.tier === 'high' ? 120 : 60);
  const rotation = new T.Quaternion(), previous = new T.Quaternion(), worldToHead = new T.Quaternion();
  const delta = new T.Quaternion(), parent = new T.Quaternion(), parentInverse = new T.Quaternion();
  const angular = new T.Vector3(), rate = new T.Vector3();
  const position = new T.Vector3(), previousPosition = new T.Vector3();
  const velocity = new T.Vector3(), previousVelocity = new T.Vector3(), acceleration = new T.Vector3();
  const inertia = new T.Vector3(), gravity = new T.Vector3();
  const base = new T.Vector3(), gust = new T.Vector3();
  const start = new T.Vector3(), end = new T.Vector3(), candidate = new T.Vector3();
  const direction = new T.Vector3(), ac = new T.Vector3();
  const local = new T.Vector3(), axis = new T.Vector3(), nearest = new T.Vector3();
  const radial = new T.Vector3(), extent = new T.Vector3();
  const axisOut = new T.Vector3(), tangent = new T.Vector3(), across = new T.Vector3();
  const alternate = new T.Vector3();
  let previousTime = -Infinity, wasReduced = false;

  function poseVolumes() {
    groom.head.updateWorldMatrix(true, false);
    inverse.copy(groom.head.matrixWorld).invert();
    for (const shape of shapes) {
      if (shape.node !== groom.head) shape.node.updateWorldMatrix(true, false);
      shape.localToHead.multiplyMatrices(inverse, shape.node.matrixWorld);
      shape.headToLocal.copy(shape.localToHead).invert();
      shape.scale = shape.headToLocal.getMaxScaleOnAxis();
    }
  }

  function contact(point, shape, pad, project) {
    extent.copy(shape.radii).addScalar(pad * shape.scale);
    local.copy(point).applyMatrix4(shape.headToLocal).sub(shape.start).divide(extent);
    axis.subVectors(shape.end, shape.start).divide(extent);
    nearest.copy(axis).multiplyScalar(clamp(local.dot(axis) / Math.max(axis.lengthSq(), 1e-12), 0, 1));
    radial.subVectors(local, nearest);
    const distance = radial.length();
    if (project && distance < 1) {
      if (distance > 1e-9) radial.divideScalar(distance);
      else radial.copy(Z);
      point.copy(nearest).addScaledVector(radial, 1.00003)
        .multiply(extent).add(shape.start).applyMatrix4(shape.localToHead);
    }
    return distance - 1;
  }

  function freeOfContact(point, pad) {
    return shapes.every(shape => contact(point, shape, pad, false) >= 0);
  }

  function lockPoint(point, origin, length, pad) {
    // Alternating segment-length and capsule constraints slide hair along a
    // contact rather than squashing, scaling or shearing a skinned lock.
    for (let pass = 0; pass < 10; pass++) {
      let hit = false;
      for (const shape of shapes) if (contact(point, shape, pad, true) < -0.00001) hit = true;
      if (!hit) return;
      point.sub(origin).setLength(length).add(origin);
    }
    if (freeOfContact(point, pad)) return;

    // At the intersection of two shells, repeated projections can return
    // to the same blocked arc. Sweep nearby directions on the fixed-length
    // guide segment and keep the first available one; no link is stretched.
    axisOut.subVectors(point, origin).normalize();
    tangent.crossVectors(axisOut, Math.abs(axisOut.z) < 0.8 ? Z : X).normalize();
    across.crossVectors(axisOut, tangent);
    for (const [a, b] of slideAngles) {
      for (const [x, y] of slideRing) {
        alternate.copy(axisOut).multiplyScalar(a)
          .addScaledVector(tangent, x * b).addScaledVector(across, y * b)
          .multiplyScalar(length).add(origin);
        if (freeOfContact(alternate, pad)) {
          point.copy(alternate);
          return;
        }
      }
    }
  }

  function reset() {
    angular.setScalar(0);
    acceleration.setScalar(0);
    for (const { links } of chains) {
      for (const link of links) {
        link.offset.setScalar(0);
        link.velocity.setScalar(0);
        link.bone.quaternion.identity();
      }
    }
  }

  function advance(frame) {
    const { dt, time } = frame;
    const reduced = Boolean(preference?.matches);
    const restarting = time <= previousTime || !Number.isFinite(previousTime) || dt > 0.10 || reduced !== wasReduced;
    previousTime = time;
    wasReduced = reduced;
    if (restarting) reset();
    if (!(dt > 0)) return;

    poseVolumes();
    rig.head.getWorldQuaternion(rotation);
    worldToHead.copy(rotation).invert();
    position.setFromMatrixPosition(groom.head.matrixWorld);
    if (restarting) {
      previous.copy(rotation);
      previousPosition.copy(position);
      previousVelocity.setScalar(0);
    }
    delta.copy(rotation).invert().multiply(previous);
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    // The inverse rotational step is the inherited angular lag in head space.
    rate.set(delta.x, delta.y, delta.z).multiplyScalar(2 / dt).clampLength(0, 12);
    angular.lerp(rate, 1 - Math.exp(-26 * dt));
    velocity.subVectors(position, previousPosition).divideScalar(dt);
    rate.subVectors(velocity, previousVelocity).divideScalar(dt).clampLength(0, 17);
    acceleration.lerp(rate, 1 - Math.exp(-13 * dt));
    inertia.copy(acceleration).applyQuaternion(worldToHead).negate();
    // Gravity is already built into the rest curl. Use its change relative to
    // the head so reclining redirects the tips without erasing that shape.
    gravity.copy(DOWN).applyQuaternion(worldToHead).sub(DOWN);
    previous.copy(rotation);
    previousPosition.copy(position);
    previousVelocity.copy(velocity);
    const steps = reduced ? 1 : Math.ceil(Math.min(dt, 0.05) / stepLimit);
    const h = Math.min(dt, 0.05) / steps;
    const pace = reduced ? 0 : clamp(frame.speed / 1.13, 0, 1);
    const sprint = clamp((frame.speed - 1.13) / 2.76, 0, 1);
    const phase = (frame.phase ?? 0) * 2;
    const idle = reduced ? 0 : 1 - pace;
    for (const chain of chains) {
      const { links, points } = chain;
      const face = chain.region === 'front';
      const beat = phase + 0.23 * Math.sin(chain.phase);
      const swing = Math.cos(beat);
      const fan = Math.max(0, Math.sin(beat + 0.4));
      const breath = Math.sin(time * (face ? 1.34 : 1.23) + chain.phase * 0.42);
      for (let step = 0; step < steps; step++) {
        // Joint zero pins the first section. Each following section inherits
        // the parent swing and has an independent, progressively softer spring.
        parent.identity();
        start.copy(points[1]);
        for (let i = 1; i < links.length; i++) {
          const link = links[i], { length: len, share, stiffness, damping } = link;
          const bounce = pace * (swing * (roma ? 0.232 + 0.064 * sprint : 0.071 + 0.035 * sprint)) +
            idle * breath * (roma ? 0.029 : 0.028);
          base.copy(link.dir).applyQuaternion(parent);
          gust.copy(base).applyAxisAngle(chain.axis, bounce * share).sub(base);
          gust.x += pace * fan * share * chain.side * (roma ? (face ? 0.067 : 0.041) : 0.012);
          // The down-step folds the open curls upward by a small amount.
          // Changing their orientation shortens the drape without stretching it.
          gust.y += pace * Math.max(0, swing) * share * (roma ? 0.046 : 0.012);
          if (!reduced) {
            // The tighter Roma bind shortens temple-tip travel in inches.
            // Preserve its head-turn lag while retaining the original springs.
            gust.addScaledVector(ac.crossVectors(angular, base), share * (roma ? 0.051 : 0.023));
            gust.addScaledVector(inertia, share * (roma ? 0.0047 : 0.0018));
            gust.addScaledVector(gravity, share * (roma ? 0.24 : 0.067));
          }
          gust.multiplyScalar(len);
          link.velocity.addScaledVector(ac.subVectors(gust, link.offset), h * stiffness)
            .multiplyScalar(Math.exp(-damping * h));
          link.offset.addScaledVector(link.velocity, h).clampLength(0, len * (roma ? 0.32 : 0.17));
          direction.copy(base).multiplyScalar(len).add(link.offset).setLength(len);
          candidate.copy(start).add(direction);
          end.copy(candidate);
          lockPoint(end, start, len, chain.pads[i + 1]);
          if (end.distanceToSquared(candidate) > 1e-10) {
            // Remove motion into the body so contact does not buzz as the
            // spring keeps asking for its unconstrained position.
            ac.subVectors(end, candidate).normalize();
            link.velocity.addScaledVector(ac, -Math.min(0, link.velocity.dot(ac)));
          }
          parentInverse.copy(parent).invert();
          direction.subVectors(end, start).normalize().applyQuaternion(parentInverse);
          link.bone.quaternion.setFromUnitVectors(link.dir, direction);
          parent.multiply(link.bone.quaternion);
          start.copy(end);
        }
      }
    }
  }

  // Expose the authored guides and posed volumes to the on-repo motion audit.
  // Rendering never reads or updates per-vertex positions on the CPU.
  groom.motion = {
    chains, shapes,
    clearance(point, padding = 0) {
      poseVolumes();
      return shapes.map((shape) => [shape.label, contact(point, shape, padding, false)]);
    },
  };
  return advance;
}
