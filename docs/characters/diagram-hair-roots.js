// The walking groom has a solid fill beneath the quiff and buried ends on the
// temple waves. The inspection copy keeps the exterior and a shallow follicle
// insertion. Otherwise its hidden fill disks would pass through the cranium.
import { Box3, Float32BufferAttribute, Ray, Triangle, Vector3 } from 'three';

function skinDepth(face, origin) {
  const g = face.geometry,
    pos = g.attributes.position,
    triangles = [];
  const point = (i) => new Vector3().fromBufferAttribute(pos, g.index.getX(i));
  for (let i = 0; i < g.index.count; i += 3)
    triangles.push(new Triangle(point(i), point(i + 1), point(i + 2)));
  function tree(faces) {
    const box = new Box3();
    for (const t of faces) box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
    if (faces.length <= 10) return { box, faces };
    const span = box.getSize(new Vector3());
    const axis = span.x > span.y && span.x > span.z ? 'x' : span.y > span.z ? 'y' : 'z';
    const centre = (t) => t.a[axis] + t.b[axis] + t.c[axis];
    faces.sort((a, b) => centre(a) - centre(b));
    const split = faces.length >> 1;
    return { box, left: tree(faces.slice(0, split)), right: tree(faces.slice(split)) };
  }
  const root = tree(triangles),
    ray = new Ray(origin),
    hit = new Vector3();
  let surface;
  function visit(node) {
    if (!ray.intersectsBox(node.box)) return;
    if (node.faces) {
      for (const t of node.faces)
        if (ray.intersectTriangle(t.a, t.b, t.c, false, hit))
          surface = Math.max(surface, origin.distanceTo(hit));
    } else {
      visit(node.left);
      visit(node.right);
    }
  }
  return (p) => {
    ray.direction.subVectors(p, origin);
    const radius = ray.direction.length();
    if (radius < 1e-8) return -0.1;
    ray.direction.multiplyScalar(1 / radius);
    surface = 0;
    visit(root);
    return radius - surface + 0.0014; // 1.4 mm of hair remains within the skin.
  };
}

function shortenBuriedRoots(g, depth) {
  const arrays = Object.entries(g.attributes).map(([name, a]) => ({
    name,
    size: a.itemSize,
    values: Array.from(a.array),
  }));
  const xyz = arrays.find((a) => a.name === 'position').values;
  const p = new Vector3(),
    q = new Vector3(),
    signed = [],
    output = [];
  const distance = (i) => (signed[i] ??= depth(p.fromArray(xyz, 3 * i)));
  const length2 = (i, j) => p.fromArray(xyz, 3 * i).distanceToSquared(q.fromArray(xyz, 3 * j));
  const mid = (i, j, t) => {
    const k = xyz.length / 3;
    for (const { size, values } of arrays)
      for (let c = 0; c < size; c++)
        values.push(values[size * i + c] + (values[size * j + c] - values[size * i + c]) * t);
    return k;
  };
  function boundary(i, j) {
    let lo = 0,
      hi = 1;
    const left = distance(i) > 0;
    for (let step = 0; step < 7; step++) {
      const t = (lo + hi) * 0.5;
      p.fromArray(xyz, 3 * i).lerp(q.fromArray(xyz, 3 * j), t);
      if (depth(p) > 0 === left) lo = t;
      else hi = t;
    }
    return mid(i, j, (lo + hi) * 0.5);
  }
  function triangle(a, b, c) {
    const da = distance(a),
      db = distance(b),
      dc = distance(c);
    if (Math.max(da, db, dc) < 0) return;
    const ab = length2(a, b),
      bc = length2(b, c),
      ca = length2(c, a);
    const largest = Math.max(ab, bc, ca),
      full = Math.min(da, db, dc) >= 0;
    // A long triangular quiff cap can have its circumference in the hair
    // while its interior crosses the head. Test its chord before retaining it.
    if (largest > 0.013 ** 2) {
      const i = largest === ab ? a : largest === bc ? b : c,
        j = largest === ab ? b : largest === bc ? c : a,
        k = largest === ab ? c : largest === bc ? a : b;
      if (!full || depth(p.fromArray(xyz, 3 * i).lerp(q.fromArray(xyz, 3 * j), 0.5)) < 0) {
        const m = mid(i, j, 0.5);
        triangle(i, m, k);
        triangle(m, j, k);
        return;
      }
    }
    if (full) {
      output.push(a, b, c);
      return;
    }
    const polygon = [];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      if (distance(i) >= 0) polygon.push(i);
      if (distance(i) >= 0 !== distance(j) >= 0) polygon.push(boundary(i, j));
    }
    for (let i = 1; i + 1 < polygon.length; i++) output.push(polygon[0], polygon[i], polygon[i + 1]);
  }
  const groups = g.groups.slice();
  g.clearGroups();
  for (const group of groups) {
    const begin = output.length;
    for (let i = group.start; i < group.start + group.count; i += 3)
      triangle(g.index.getX(i), g.index.getX(i + 1), g.index.getX(i + 2));
    g.addGroup(begin, output.length - begin, group.materialIndex);
  }
  // Bounds, picker dimensions and upload buffers must describe only the
  // remaining indexed surface after the embedded ends have been shortened.
  const kept = [...new Set(output)];
  const compact = new Int32Array(xyz.length / 3);
  kept.forEach((source, index) => {
    compact[source] = index;
  });
  for (const { name, size, values } of arrays) {
    const packed = new Float32Array(kept.length * size);
    for (let k = 0; k < kept.length; k++)
      for (let j = 0; j < size; j++) packed[k * size + j] = values[kept[k] * size + j];
    g.setAttribute(name, new Float32BufferAttribute(packed, size));
  }
  g.setIndex(output.map((source) => compact[source]));
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

export function seatHairRoots(parts, head, roma) {
  const face = parts.find((p) => p.name === 'Face');
  if (!face) return;
  const depth = skinDepth(face.mesh, head.place(0, 0.6, -0.08));
  for (const p of parts) {
    const hasFill = roma
      ? /^(Left|Right) (temple|side) waves$/.test(p.name)
      : /^(Scalp and crest|(Left|Right) sideburn)$/.test(p.name);
    if (hasFill) shortenBuriedRoots(p.mesh.geometry, depth);
  }
}
