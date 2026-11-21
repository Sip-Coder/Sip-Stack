// The chord between three clear ribbon vertices can still cut a curved solid.
// The triangle's nearest point supplies a separating plane in unit-sphere space.
import * as T from 'three';

export function ellipsoidFaceGuard(surface) {
  const points = Array.from({ length: surface.position.count }, () => new T.Vector3());
  const toUnit = new T.Matrix4(),
    fromUnit = new T.Matrix4(),
    worldToUnit = new T.Matrix4();
  const linear = new T.Matrix3(),
    transpose = new T.Matrix3(),
    toWorld = new T.Matrix3();
  const tri = new T.Triangle(),
    near = new T.Vector3(),
    output = new T.Vector3();
  const hull = new T.Box3(),
    origin = new T.Vector3(),
    edge = new T.Line3();
  const normal = new T.Vector3(),
    displacement = new T.Vector3(),
    tangent = new T.Vector3();
  const candidate = new T.Vector3(),
    trialNormal = new T.Vector3();
  const restA = new T.Vector3(),
    restB = new T.Vector3(),
    restC = new T.Vector3();
  return function fit(shape, bounds) {
    const indices = surface.mesh.geometry.index;
    toUnit.multiplyMatrices(shape.unit, surface.toGroup);
    hull.copy(bounds).applyMatrix4(toUnit);
    if (hull.distanceToPoint(origin) >= 1) return false;
    let changed = false;
    fromUnit.copy(toUnit).invert();
    worldToUnit.copy(shape.node.matrixWorld).invert().premultiply(shape.worldToUnit);
    linear.setFromMatrix4(worldToUnit);
    transpose.copy(linear).transpose();
    toWorld.copy(linear).invert();
    for (let i = 0; i < points.length; i++)
      points[i].fromBufferAttribute(surface.position, i).applyMatrix4(toUnit);
    const count = indices?.count ?? points.length;
    for (let k = 0; k < count; k += 3) {
      const ia = indices ? indices.getX(k) : k;
      const ib = indices ? indices.getX(k + 1) : k + 1;
      const ic = indices ? indices.getX(k + 2) : k + 2;
      tri.a = points[ia];
      tri.b = points[ib];
      tri.c = points[ic];
      const radius = tri.a.length();
      if (radius >= 1 && tri.a.dot(tri.b) >= radius && tri.a.dot(tri.c) >= radius) continue;
      tri.closestPointToPoint(origin, near);
      let distance = near.length();
      if (!Number.isFinite(distance)) {
        // Three coincident or collinear corners occur on the tapered end caps.
        distance = Infinity;
        for (let j = 0; j < 3; j++) {
          edge.start.copy(j === 0 ? tri.a : j === 1 ? tri.b : tri.c);
          edge.end.copy(j === 0 ? tri.b : j === 1 ? tri.c : tri.a);
          if (edge.start.distanceToSquared(edge.end) < 1e-24) output.copy(edge.start);
          else edge.closestPointToPoint(origin, true, output);
          const d = output.length();
          if (d < distance) {
            distance = d;
            near.copy(output);
          }
        }
      }
      if (distance >= 1) continue;
      if (distance > 1e-8) near.divideScalar(distance);
      else {
        tri.getNormal(near);
        if (!near.lengthSq()) near.copy(tri.a).add(tri.b).add(tri.c).normalize();
        if (!near.lengthSq()) near.set(0, 0, 1);
        if (near.dot(tri.a) + near.dot(tri.b) + near.dot(tri.c) < 0) near.negate();
      }
      // M transforms a world displacement to the unit sphere, so Mᵀn is
      // the physical plane normal. This gives the shortest physical contact
      // correction even on the thin, obliquely oriented headband.
      // Keep some outward radial motion on well-conditioned chords. Its
      // tangential component must fit within the original material patch,
      // even if a corner lies on or behind the plane through the origin.
      restA.fromArray(surface.rest, ia * 3);
      restB.fromArray(surface.rest, ib * 3);
      restC.fromArray(surface.rest, ic * 3);
      const localSpan = Math.max(restA.distanceTo(restB), restB.distanceTo(restC), restC.distanceTo(restA));
      const physicalSpan = localSpan * surface.mesh.matrixWorld.getMaxScaleOnAxis();
      normal.copy(near).applyMatrix3(transpose);
      let worldCost =
        (1.003 - Math.min(near.dot(tri.a), near.dot(tri.b), near.dot(tri.c))) / normal.length();
      if (worldCost > physicalSpan * 0.3) {
        // A unit-sphere nearest face is not necessarily a physically near
        // face of a thin solid. Compare the six supporting planes of its
        // fitted box in world metres before pushing a patch along its width.
        for (let axis = 0; axis < 3; axis++)
          for (let sign = -1; sign <= 1; sign += 2) {
            candidate.set(0, 0, 0).setComponent(axis, sign);
            trialNormal.copy(candidate).applyMatrix3(transpose);
            const cost =
              (1.003 - Math.min(candidate.dot(tri.a), candidate.dot(tri.b), candidate.dot(tri.c))) /
              trialNormal.length();
            if (cost < worldCost) {
              worldCost = cost;
              near.copy(candidate);
              normal.copy(trialNormal);
            }
          }
      }
      const normal2 = normal.lengthSq();
      if (!(normal2 > 0)) continue;
      for (let j = k; j < k + 3; j++) {
        const id = indices ? indices.getX(j) : j;
        const p = points[id],
          height = p.dot(near),
          separation = 1.003 - height;
        if (separation <= 0) continue;
        displacement.copy(normal).multiplyScalar(separation / normal2);
        if (height > 0.25) {
          tangent
            .copy(p)
            .applyMatrix3(toWorld)
            .multiplyScalar(separation / height)
            .sub(displacement);
          tangent.addScaledVector(normal, -tangent.dot(normal) / normal2);
          displacement.add(tangent.clampLength(0, physicalSpan * 0.5));
        }
        p.add(displacement.applyMatrix3(linear));
        output.copy(p).applyMatrix4(fromUnit);
        surface.position.setXYZ(id, output.x, output.y, output.z);
        bounds.expandByPoint(output);
        changed = true;
      }
    }
    return changed;
  };
}
