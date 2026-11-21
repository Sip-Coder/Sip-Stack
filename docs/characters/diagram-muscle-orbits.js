// The four recti share an annulus near the optic canal. The obliques and
// levator follow different paths. Transform the whole seven-part sleeve in
// one orbital chart so their relative insertions survive registration.
import { Matrix4, Vector3 } from 'three';

const extraocular =
  /^(left|right)_(?:(?:inferior|superior)_(?:rectus|oblique)|(?:lateral|medial)_rectus|levator_palpebrae_superioris)$/i;

// A frontal triangle query in head coordinates measures the bony orbit and
// the living facial cover at the same point even when the head turns.
function frontalDepth(geometry, inverse, eyeY, rear = false) {
  const points = geometry.attributes.position;
  const vertices = Array.from({ length: points.count }, (_, i) =>
    new Vector3().fromBufferAttribute(points, i).applyMatrix4(inverse),
  );
  const index = geometry.index.array;
  const slices = Array.from({ length: 48 }, () => []);
  const column = (x) => Math.min(slices.length - 1, Math.max(0, Math.floor((x + 1) * 24)));
  for (let i = 0; i < index.length; i += 3) {
    const a = vertices[index[i]],
      b = vertices[index[i + 1]],
      c = vertices[index[i + 2]];
    if (Math.max(a.y, b.y, c.y) < eyeY - 0.21 || Math.min(a.y, b.y, c.y) > eyeY + 0.21) continue;
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(det) < 1e-10) continue;
    const triangle = { a, b, c, det };
    for (let j = column(Math.min(a.x, b.x, c.x)); j <= column(Math.max(a.x, b.x, c.x)); j++) {
      slices[j].push(triangle);
    }
  }
  return (x, y, fallback) => {
    let front = rear ? Infinity : -Infinity;
    for (const { a, b, c, det } of slices[column(x)]) {
      const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det;
      const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det;
      if (u >= 0 && v >= 0 && u + v <= 1) {
        const z = c.z + u * (a.z - c.z) + v * (b.z - c.z);
        front = rear ? Math.min(front, z) : Math.max(front, z);
      }
    }
    return Number.isFinite(front) ? front : fallback;
  };
}

export function makeOrbitalAtlasFit(rig, landmarks, source, parts) {
  const { head } = landmarks;
  const o = head.place(0, 0, 0);
  const inverse = new Matrix4()
    .makeBasis(head.place(1, 0, 0).sub(o), head.place(0, 1, 0).sub(o), head.place(0, 0, 1).sub(o))
    .setPosition(o)
    .invert();
  const face = frontalDepth(parts.find((p) => p.name === 'Face').mesh.geometry, inverse, head.eye);
  const skull = frontalDepth(landmarks.scan.bones.get('SKULL_CRANIAL_MAXILLA'), inverse, head.eye);
  const maps = {};
  for (const [side, sign] of [
    ['left', 1],
    ['right', -1],
  ]) {
    const medial = source.get(side + '_medial_rectus').boundingBox;
    const lateral = source.get(side + '_lateral_rectus').boundingBox;
    // Measured equator on this atlas. Register its side-to-side asymmetry
    // separately, retaining the paths and cross-sections from each GLB.
    const centerX = sign > 0 ? 0.0289 : -0.0302;
    const cornea = parts.find(
      (p) => p.name.toLowerCase() === side + (rig.name === 'roma' ? ' sclera' : ' cornea and iris'),
    );
    const backOfEye = frontalDepth(cornea.mesh.geometry, inverse, head.eye, true);
    const pos = cornea.mesh.geometry.attributes.position;
    const extent = { left: Infinity, right: -Infinity, top: -Infinity, bottom: Infinity };
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(inverse);
      extent.left = Math.min(extent.left, v.x);
      extent.right = Math.max(extent.right, v.x);
      extent.top = Math.max(extent.top, v.y);
      extent.bottom = Math.min(extent.bottom, v.y);
    }
    const cx = (extent.left + extent.right) * 0.5,
      cy = (extent.bottom + extent.top) * 0.5;
    const across =
      ((extent.right - extent.left) * 0.5) /
      (Math.max(lateral.max.x, medial.max.x) - Math.min(lateral.min.x, medial.min.x));
    // Roma's eyelid animation contracts the visible almond vertically. The
    // globe and its six movers keep their resting height during a blink.
    const opening = Math.max(rig.name === 'roma' ? 0.16 : 0, extent.top - extent.bottom);
    const vertical = (opening * 0.51) / 0.034;
    maps[side] = (p) => {
      const x = cx + (p.x - centerX) * across,
        y = cy + (p.y - 1.5911) * vertical;
      const cortex = Math.max(
          0.47,
          skull(x, y, 0.47),
          skull(x - 0.033, y, 0.47),
          skull(x + 0.033, y, 0.47),
          skull(x, y - 0.016, 0.47),
          skull(x, y + 0.016, 0.47),
        ),
        cover = Math.min(face(x, y, 0.95), backOfEye(x, y, 2) - 0.012);
      // Leave the terminal tendons immediately behind the eye. The annulus
      // stays deep, while inferior oblique retains its more anterior origin.
      const progress = Math.min(1, Math.max(0, (p.z - 0.014) / 0.053));
      const depth = cortex + (0.62 + 0.24 * progress) * (cover - cortex);
      return head.place(x, y, depth);
    };
  }
  return (name) => {
    const match = extraocular.exec(name);
    return match ? maps[match[1].toLowerCase()] : null;
  };
}
