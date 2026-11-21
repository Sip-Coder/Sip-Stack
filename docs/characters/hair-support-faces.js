// A curled ribbon can wrap around a convex scalp or earring while its wide triangle
// still cuts the corner between three clear vertices. In unit-sphere space
// the nearest point gives that triangle a single supporting plane.
import * as T from 'three';

export function ellipsoidFaceGuard(surface) {
  const points = Array.from({ length: surface.position.count }, () => new T.Vector3());
  const toUnit = new T.Matrix4(),
    fromUnit = new T.Matrix4();
  const tri = new T.Triangle(),
    near = new T.Vector3(),
    output = new T.Vector3();
  const hull = new T.Box3(),
    origin = new T.Vector3();
  return function fit(shape, bounds) {
    const indices = surface.mesh.geometry.index;
    toUnit.multiplyMatrices(shape.unit, surface.toGroup);
    hull.copy(bounds).applyMatrix4(toUnit);
    if (hull.distanceToPoint(origin) >= 1) return false;
    let changed = false;
    fromUnit.copy(toUnit).invert();
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
      const length = near.length();
      if (!(length > 1e-7 && length < 1)) continue;
      near.divideScalar(length);
      changed = true;
      for (let j = k; j < k + 3; j++) {
        const id = indices ? indices.getX(j) : j;
        const p = points[id],
          height = p.dot(near);
        if (height >= 1.003) continue;
        // All three heights are positive for this convex face. Radial movement
        // also preserves the positive half-space of every earlier cleared face.
        p.multiplyScalar(1.003 / height);
        output.copy(p).applyMatrix4(fromUnit);
        surface.position.setXYZ(id, output.x, output.y, output.z);
        bounds.expandByPoint(output);
      }
    }
    return changed;
  };
}
