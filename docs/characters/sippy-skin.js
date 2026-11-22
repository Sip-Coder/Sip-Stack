// Bind authored cloth in its rest coordinate system once. Both detail tiers use
// the same skeleton; their different indices need no vertex uploads on a bend.
import * as T from 'three';

export function bindCloth(mesh, bones, influences) {
  const attributes = new Map();
  for (const g of new Set([mesh.geometry, mesh.userData.mobileGeometry].filter(Boolean))) {
    const position = g.attributes.position;
    let pair = attributes.get(position);
    if (!pair) {
      const indices = new Uint16Array(position.count * 4);
      const weights = new Float32Array(position.count * 4);
      for (let i = 0; i < position.count; i++) {
        const [start, end, blend] = influences(i, g);
        indices[i * 4] = start;
        indices[i * 4 + 1] = end;
        weights[i * 4] = 1 - blend;
        weights[i * 4 + 1] = blend;
      }
      pair = [new T.Uint16BufferAttribute(indices, 4), new T.Float32BufferAttribute(weights, 4)];
      attributes.set(position, pair);
    }
    g.setAttribute('skinIndex', pair[0]);
    g.setAttribute('skinWeight', pair[1]);
  }
  mesh.updateWorldMatrix(true, false);
  for (const bone of bones) bone.updateWorldMatrix(true, false);
  mesh.bind(new T.Skeleton(bones));
  // Bounds on a bind-pose pattern do not enclose every folded shoulder or knee.
  mesh.frustumCulled = false;
}

export function articulatedSleeve(upper, lower, leg) {
  const pivot = lower.position.y;
  const band = leg ? 0.155 : 0.115;
  const radius = leg ? 0.082 : 0.054;
  const levels = Array.from({ length: 9 }, (_, i) => pivot + band * (1 - i / 4));
  const bones = levels.map((y) => {
    const bone = new T.Bone();
    upper.add(bone);
    const center = Math.min(1, y / pivot);
    bone.position.set(lower.position.x * center, y, lower.position.z * center);
    return bone;
  });
  const down = new T.Vector3(0, -1, 0), direction = new T.Vector3(), cross = new T.Vector3();
  const swing = new T.Quaternion(), twist = new T.Quaternion(), axial = new T.Quaternion();
  return {
    bind(mesh) {
      bindCloth(mesh, bones, (i,g) => {
        const slice = T.MathUtils.clamp((levels[0] - g.attributes.position.getY(i)) * 4 / band, 0, 8);
        const start = Math.min(7, Math.floor(slice));
        return [start, start + 1, slice - start];
      });
    },
    step() {
      direction.copy(down).applyQuaternion(lower.quaternion);
      const angle = Math.acos(T.MathUtils.clamp(-direction.y, -1, 1));
      const tangent = Math.tan(angle * 0.5);
      const r = Math.min(radius, band / Math.max(0.00001, tangent));
      const blend = Math.max(0.00001, r * tangent);
      cross.set(direction.x, 0, direction.z).normalize();
      swing.setFromUnitVectors(down, direction);
      twist.copy(swing).invert().multiply(lower.quaternion);
      for (let i = 0; i < bones.length; i++) {
        const y = levels[i], b = bones[i];
        const t = T.MathUtils.clamp((pivot + blend - y) / (2 * blend), 0, 1);
        b.quaternion.identity().slerp(swing, t).multiply(axial.identity().slerp(twist, t));
        const center = Math.min(1, y / pivot);
        if (t === 1) b.position.copy(direction).multiplyScalar(pivot - y).y += pivot;
        else if (t > 0) {
          b.position.copy(cross).multiplyScalar(r * (1 - Math.cos(angle * t)));
          b.position.y = pivot + blend - r * Math.sin(angle * t);
        } else b.position.set(0, y, 0);
        b.position.x += lower.position.x * center;
        b.position.z += lower.position.z * center;
      }
    },
  };
}
