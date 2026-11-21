// Structural edges limit how far neighboring points of a curl can separate
// while the contact solver drapes the material around a shoulder or headband.
import * as T from 'three';

export function ribbonSpanConstraint(surface, group, slackM) {
  const tables = new WeakMap();
  const a = new T.Vector3(),
    b = new T.Vector3(),
    d = new T.Vector3();
  const scale = new T.Matrix3();
  function table(geometry) {
    const index = geometry.index;
    const vertexCount = surface.position.count;
    const seen = new Set(),
      from = [],
      to = [],
      maxLength = [];
    for (let t = 0; t < index.count; t += 3) {
      for (let corner = 0; corner < 3; corner++) {
        const i = index.getX(t + corner),
          j = index.getX(t + ((corner + 1) % 3));
        const key = Math.min(i, j) * vertexCount + Math.max(i, j);
        if (i === j || seen.has(key)) continue;
        seen.add(key);
        from.push(i);
        to.push(j);
        a.fromArray(surface.rest, i * 3).applyMatrix4(group.matrixWorld);
        b.fromArray(surface.rest, j * 3).applyMatrix4(group.matrixWorld);
        maxLength.push(a.distanceTo(b) + slackM);
      }
    }
    const edges = {
      from: Uint32Array.from(from),
      to: Uint32Array.from(to),
      maxLength: Float64Array.from(maxLength),
    };
    tables.set(geometry, edges);
    return edges;
  }
  // Bind both index sets at the same rest pose. A user may change quality
  // in the middle of a turn, when the actor's anisotropic transform differs.
  table(surface.mesh.geometry);
  if (
    surface.mesh.userData.mobileGeometry &&
    surface.mesh.userData.mobileGeometry !== surface.mesh.geometry
  )
    table(surface.mesh.userData.mobileGeometry);
  return function adjust(geometry) {
    const edges = tables.get(geometry) ?? table(geometry);
    const position = surface.position;
    scale.setFromMatrix4(surface.mesh.matrixWorld);
    let moved = false;
    for (let k = 0; k < edges.from.length; k++) {
      const i = edges.from[k],
        j = edges.to[k],
        bound = edges.maxLength[k];
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, j);
      d.subVectors(b, a).applyMatrix3(scale);
      const lengthSq = d.lengthSq();
      if (lengthSq <= (bound + 0.0002) ** 2) continue;
      d.subVectors(b, a).multiplyScalar(0.5 * (1 - bound / Math.sqrt(lengthSq)));
      a.add(d);
      b.sub(d);
      position.setXYZ(i, a.x, a.y, a.z);
      position.setXYZ(j, b.x, b.y, b.z);
      moved = true;
    }
    return moved;
  };
}
