// Measure sewn pattern edges on the same posed meshes used for intersection QA.
// The nearest vertex of a pair of garments can remain touching when most of
// the sleeve or waistband has separated. Subdivide the whole ordered cut edge.
import * as T from 'three';

export const seamLimitM = 0.003;
const sampleSpacingM = 0.002;
const triangle = new T.Triangle(),
  foot = new T.Vector3(),
  query = new T.Vector3();
const line = new T.Line3(),
  direction = new T.Vector3();

function listForTier(value, tier) {
  return value?.[tier] ?? value;
}

function curve(edge, cache, tier) {
  const { mesh, closed } = edge;
  if (!cache.has(mesh)) throw Error('Seam uses an unregistered garment');
  const ids = listForTier(edge.indices, tier);
  if (!ids || ids.length < (closed ? 3 : 2)) throw Error('Seam has no complete cut edge');
  const g = mesh.geometry,
    p = g.getAttribute('position'),
    idx = g.index;
  const n = ids.length,
    links = closed ? n : n - 1;
  const perEdge = new Array(links).fill(0);
  const key = (a, b) => Math.min(a, b) * p.count + Math.max(a, b);
  const selected = new Map();
  for (let i = 0; i < links; i++) selected.set(key(ids[i], ids[(i + 1) % n]), i);
  const end = Math.min(idx?.count ?? p.count, g.drawRange.start + g.drawRange.count);
  for (let i = g.drawRange.start; i + 2 < end; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx ? idx.getX(i + k) : i + k,
        j = (k + 1) % 3,
        b = idx ? idx.getX(i + j) : i + j;
      const at = selected.get(key(a, b));
      if (at !== undefined) perEdge[at]++;
    }
  }
  if (selected.size !== links || perEdge.some((count) => !count))
    throw Error(
      'Seam indices do not trace consecutive rendered triangle edges on ' + (mesh.name || mesh.type),
    );
  const points = Array.from(ids, (i) =>
    mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld),
  );
  let length = 0;
  for (let i = 0; i < links; i++) length += points[i].distanceTo(points[(i + 1) % n]);
  return { points, links, length };
}

function closestTriangle(p, meshTree, filter, bestSq) {
  if (meshTree.box.distanceToPoint(p) ** 2 >= bestSq) return bestSq;
  if (meshTree.leaves) {
    for (const t of meshTree.leaves) {
      if (filter && !filter.has(t.id)) continue;
      triangle.set(...t.v).closestPointToPoint(p, foot);
      bestSq = Math.min(bestSq, foot.distanceToSquared(p));
    }
    return bestSq;
  }
  const { left, right } = meshTree;
  const nearLeft = left.box.distanceToPoint(p) <= right.box.distanceToPoint(p);
  bestSq = closestTriangle(p, nearLeft ? left : right, filter, bestSq);
  return closestTriangle(p, nearLeft ? right : left, filter, bestSq);
}

function toCurve(p, c) {
  let bestSq = Infinity;
  for (let j = 0; j < c.links; j++) {
    line.set(c.points[j], c.points[(j + 1) % c.points.length]).closestPointToPoint(p, true, foot);
    bestSq = Math.min(bestSq, foot.distanceToSquared(p));
  }
  return bestSq;
}

function sampleEdge(c, distanceSq, result) {
  const { points, links } = c;
  for (let i = 0; i < links; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      length = a.distanceTo(b),
      count = Math.max(1, Math.ceil(length / sampleSpacingM));
    direction.subVectors(b, a);
    function measureAt(t) {
      query.copy(a).addScaledVector(direction, t);
      const d = Math.sqrt(distanceSq(query));
      result.samples++;
      if (d > seamLimitM) result.openSamples++;
      if (d > result.maxGapM) {
        result.maxGapM = d;
        result.worstAtM = query.toArray();
      }
      return d;
    }
    // Distance to a closed triangle or polyline is 1-Lipschitz. The two
    // endpoint cones therefore bound the gap everywhere between samples.
    // Refine borderline intervals until accepted, demonstrably open, or
    // below the 0.1 micrometre geometry precision of the collision probe.
    function certify(t0, d0, t1, d1) {
      const span = (t1 - t0) * length;
      const upper = (d0 + d1 + span) / 2;
      if (upper <= seamLimitM || Math.max(d0, d1) > seamLimitM || span < 1e-7) {
        result.maxGapUpperBoundM = Math.max(result.maxGapUpperBoundM, upper);
        return;
      }
      const tm = (t1 + t0) / 2,
        dm = measureAt(tm);
      certify(t0, d0, tm, dm);
      certify(tm, dm, t1, d1);
    }
    let d0 = measureAt(0);
    for (let j = 1; j <= count; j++) {
      const d1 = measureAt(j / count);
      certify((j - 1) / count, d0, j / count, d1);
      d0 = d1;
    }
  }
}

export function measureSeam(seam, cache, tier) {
  const c = curve(seam.edge, cache, tier);
  const result = {
    samples: 0,
    openSamples: 0,
    maxGapM: 0,
    maxGapUpperBoundM: 0,
    edgeLengthM: c.length,
    worstAtM: null,
  };
  if (seam.mate) {
    const mate = curve(seam.mate, cache, tier);
    sampleEdge(c, (p) => toCurve(p, mate), result);
    sampleEdge(mate, (p) => toCurve(p, c), result);
  } else {
    const targets = [seam.target].flat().map((t) => {
      const mesh = t?.mesh ?? t,
        surface = cache.get(mesh);
      if (!surface) throw Error('Seam target is not a registered garment ' + seam.name);
      const ids = listForTier(t.triangles, tier);
      if (mesh === seam.edge.mesh && !ids?.length)
        throw Error('Seam is compared to its own surface ' + seam.name);
      return { tree: surface.tree, filter: ids ? new Set(ids) : null };
    });
    sampleEdge(
      c,
      (p) => {
        let best = Infinity;
        for (const t of targets) best = closestTriangle(p, t.tree, t.filter, best);
        return best;
      },
      result,
    );
  }
  if (!Number.isFinite(result.maxGapM))
    throw Error('Seam has no opposing rendered edge or face ' + seam.name);
  return result;
}

// A thick jacket can remain a watertight solid despite having an accidental
// opening. Count the cut edges of just its visible outer fabric and establish
// that the two sleeves and the back all belong to the same edge-connected ply.
export function panelTopology(panel, cache, tier) {
  const { mesh } = panel;
  if (!cache.has(mesh)) throw Error('Outer panel is not rendered on this tier');
  const selection = listForTier(panel.triangles, tier);
  const ids = new Set();
  for (const item of selection ?? []) {
    if (Array.isArray(item)) for (let i = item[0]; i < item[0] + item[1]; i++) ids.add(i);
    else ids.add(item);
  }
  const g = mesh.geometry,
    p = g.attributes.position,
    idx = g.index;
  const start = g.drawRange.start,
    stop = Math.min(idx?.count ?? p.count, start + g.drawRange.count);
  const weld = new Map(),
    cacheIds = new Map(),
    edges = new Map(),
    parent = [];
  function vertex(i) {
    if (cacheIds.has(i)) return cacheIds.get(i);
    mesh.getVertexPosition(i, query).applyMatrix4(mesh.matrixWorld);
    const key = query
      .toArray()
      .map((x) => Math.round(x / 1e-7))
      .join(',');
    if (!weld.has(key)) weld.set(key, weld.size);
    const id = weld.get(key);
    cacheIds.set(i, id);
    return id;
  }
  function root(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  for (const i of ids) {
    if (!Number.isInteger(i) || i * 3 < start || i * 3 + 2 >= stop)
      throw Error('Undrawn outer-ply triangle ' + i);
    const v = [0, 1, 2].map((k) => vertex(idx ? idx.getX(i * 3 + k) : i * 3 + k));
    if (new Set(v).size < 3) continue;
    const face = parent.length;
    parent.push(face);
    for (let j = 0; j < 3; j++) {
      const a = v[j],
        b = v[(j + 1) % 3],
        k = Math.min(a, b) * p.count + Math.max(a, b);
      let e = edges.get(k);
      if (!e) {
        e = { a, b, face, count: 0 };
        edges.set(k, e);
      } else parent[root(face)] = root(e.face);
      e.count++;
    }
  }
  const boundary = new Map();
  let nonManifoldEdges = 0,
    boundaryEdges = 0;
  for (const { a, b, count } of edges.values()) {
    if (count > 2) nonManifoldEdges++;
    if (count !== 1) continue;
    boundaryEdges++;
    if (!boundary.has(a)) boundary.set(a, []);
    if (!boundary.has(b)) boundary.set(b, []);
    boundary.get(a).push(b);
    boundary.get(b).push(a);
  }
  const visited = new Set();
  let boundaryLoops = 0,
    branchedEdges = 0;
  for (const [v, neighbors] of boundary) {
    if (neighbors.length !== 2) branchedEdges++;
    if (visited.has(v)) continue;
    boundaryLoops++;
    const pending = [v];
    visited.add(v);
    while (pending.length)
      for (const next of boundary.get(pending.pop()))
        if (!visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
  }
  return {
    triangles: parent.length,
    components: new Set(parent.map((_, i) => root(i))).size,
    boundaryEdges,
    boundaryLoops,
    branchedBoundaryVertices: branchedEdges,
    nonManifoldEdges,
  };
}
