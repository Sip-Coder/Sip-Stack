// Move each outer part along its anatomical axis, with the fitted skeleton as the
// stationary frame. All distances follow the live actor's standing height.
import { Vector3 } from 'three';

export function axialOffsets(parts, body) {
  const center = body.getCenter(new Vector3());
  const height = body.max.y - body.min.y;
  return parts.map((part) => {
    const { layer } = part;
    const offset = new Vector3();
    if (layer === 'skeleton') return offset;
    const point = (part.bounds ?? part.mesh.geometry.boundingBox).getCenter(new Vector3());
    const lateral = (point.x - center.x) / height;
    const front = (point.z - center.z) / height;
    const level = (point.y - body.min.y) / height;
    if (layer === 'muscles') {
      // Medial muscles peel towards the front or back. Paired arm/leg muscles
      // move away from their side of the skeleton and retain their own shape.
      offset.set(lateral * 4.4, (level - 0.55) * 0.23, front * 8.5);
      if (offset.lengthSq() < 0.035) offset.z = front < 0 ? -0.24 : 0.24;
      return offset.normalize().multiplyScalar(height * 0.12);
    }
    if (layer === 'skin') {
      // Keep eyes, lids, hair and skin registered to each other as one shell.
      return offset.set(0, height * 0.07, height * 0.32);
    }
    // Clothing opens around the frame: a rear pack separates behind the body,
    // front panels travel forward, and shoes settle below the feet.
    const forward = Math.max(-1, Math.min(1, front / 0.045));
    return offset.set(
      height * lateral * 1.45,
      height * (level < 0.12 ? -0.11 : 0.025),
      height * (forward >= 0 ? 0.37 + forward * 0.15 : -0.16 + forward * 0.22),
    );
  });
}

// A baked batch keeps the source span for each part. Re-reading its rest
// positions makes slider reversals exact and keeps CPU raycasts, screen-space
// AO and the rendered triangles in the same frame. The skeleton is stationary.
export function displaceBatch(mesh, offsets, amount) {
  const geometry = mesh.geometry;
  // A baked batch can draw its incoming buffer directly at rest. Allocate
  // mutable positions only when it first moves away from that rest pose.
  const spans = mesh.userData.sourceSpans;
  if (geometry.attributes.position === spans[0].geometry.attributes.position) {
    geometry.setAttribute('position', geometry.attributes.position.clone());
  }
  const destination = geometry.attributes.position;
  const target = destination.array;
  let j = 0;
  for (const { geometry: source, number, lo, hi } of spans) {
    const positions = source.attributes.position.array;
    const offset = offsets[number];
    const dx = offset.x * amount,
      dy = offset.y * amount,
      dz = offset.z * amount;
    for (let i = lo * 3, end = (hi + 1) * 3; i < end; i += 3) {
      target[j++] = positions[i] + dx;
      target[j++] = positions[i + 1] + dy;
      target[j++] = positions[i + 2] + dz;
    }
  }
  destination.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
