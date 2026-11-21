// A decimated source triangle can straddle the curved posterior axillary
// fold even when all three fitted corners are inside it. Bisect the longest
// bowed edges in source space; never bridge the gap with a straight chord.
import { Float32BufferAttribute, Vector3 } from 'three';

export function refineCurvedFit(g, original, project, maxEdges) {
  const source = original.attributes.position,
    fitted = g.attributes.position;
  const points = Array.from({ length: source.count }, (_, i) => new Vector3().fromBufferAttribute(source, i));
  const placed = Array.from({ length: fitted.count }, (_, i) => new Vector3().fromBufferAttribute(fitted, i));
  let ids = Array.from(g.index.array),
    spent = 0;
  for (let pass = 0; pass < 3 && spent < maxEdges; pass++) {
    const candidates = new Map(),
      stride = points.length,
      key = (a, b) => Math.min(a, b) * stride + Math.max(a, b);
    for (let n = 0; n < ids.length; n += 3)
      for (let j = 0; j < 3; j++) {
        const a = ids[n + j],
          b = ids[n + ((j + 1) % 3)],
          k = key(a, b);
        if (candidates.has(k) || placed[a].distanceToSquared(placed[b]) < 0.006 ** 2) continue;
        const mid = points[a].clone().lerp(points[b], 0.5),
          q = project(mid);
        const error = q.distanceToSquared(placed[a].clone().lerp(placed[b], 0.5));
        candidates.set(k, { k, mid, q, error });
      }
    const additions = [...candidates.values()]
      .filter((e) => e.error > 0.0014 ** 2)
      .sort((a, b) => b.error - a.error)
      .slice(0, maxEdges - spent);
    if (!additions.length) break;
    const splits = new Map();
    for (const { k, mid, q } of additions) {
      splits.set(k, points.length);
      points.push(mid);
      placed.push(q);
    }
    const out = [];
    for (let n = 0; n < ids.length; n += 3) {
      const a = ids[n],
        b = ids[n + 1],
        c = ids[n + 2];
      const edges = [splits.get(key(a, b)), splits.get(key(b, c)), splits.get(key(c, a))];
      const count = edges.filter((e) => e !== undefined).length;
      if (!count) {
        out.push(a, b, c);
        continue;
      }
      if (count === 3) {
        const [x, y, z] = edges;
        out.push(a, x, z, x, b, y, z, y, c, x, y, z);
        continue;
      }
      // Rotate the triangle so the lone split edge (or the lone unsplit
      // edge) is first. This preserves orientation and shares every midpoint.
      const j = edges.findIndex((e) => (count === 1 ? e !== undefined : e === undefined)),
        base = [a, b, c];
      const A = base[j],
        B = base[(j + 1) % 3],
        C = base[(j + 2) % 3];
      if (count === 1) {
        const x = edges[j];
        out.push(A, x, C, x, B, C);
      } else {
        const y = edges[(j + 1) % 3],
          z = edges[(j + 2) % 3];
        out.push(A, B, y, A, y, z, z, y, C);
      }
    }
    ids = out;
    spent += additions.length;
  }
  if (spent) {
    g.setAttribute(
      'position',
      new Float32BufferAttribute(
        placed.flatMap((p) => p.toArray()),
        3,
      ),
    );
    g.setIndex(ids);
    // Three reuses an existing normal buffer without resizing it. The new
    // midpoint vertices need their own normals when the caller recomputes.
    g.deleteAttribute('normal');
  }
}
