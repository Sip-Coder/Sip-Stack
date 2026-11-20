// Posed triangle intersections and volume containment. The boxes only prune
// triangle pairs; every reported crossing is confirmed on the actual surfaces.
import * as T from 'three';

const epsilon = 1e-7; // metres, to classify coincident endpoints as contact
const axes = ['x', 'y', 'z'];

function tree(triangles) {
  if (!triangles.length) throw Error('Surface has no nondegenerate triangles');
  const box = new T.Box3();
  for (const tri of triangles) box.union(tri.box);
  if (triangles.length <= 8) return { box, leaves: triangles };
  const longest = axes.reduce((a, b) => (box.max[a] - box.min[a] >= box.max[b] - box.min[b] ? a : b));
  triangles.sort((a, b) => a.center[longest] - b.center[longest]);
  const mid = triangles.length >>> 1;
  return { box, left: tree(triangles.slice(0, mid)), right: tree(triangles.slice(mid)) };
}

export function posedSurface(mesh, body = false) {
  if (!mesh.isMesh) throw Error('Expected a mesh, got ' + mesh.type);
  for (let p = mesh; p; p = p.parent) if (!p.visible) throw Error('Hidden garment geometry ' + mesh.name);
  const g = mesh.geometry,
    idx = g.index,
    coords = g.getAttribute('position');
  const weld = new Map(),
    welded = [],
    points = [],
    tris = [];
  for (let i = 0; i < coords.count; i++) {
    // getVertexPosition applies the actual rig bones and morph influences.
    const v = mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld);
    const key = axes.map((k) => Math.round(v[k] / epsilon)).join(',');
    if (!weld.has(key)) {
      weld.set(key, points.length);
      points.push(v);
    }
    welded.push(weld.get(key));
  }
  const edges = new Map(),
    referenced = new Set();
  // A batched palm or mechanical casing may contain several closed parts.
  // Overlapping solid parts form a union; a single parity ray across both
  // would incorrectly classify their overlap as empty.
  // Join faces across edges. Merely touching another volume at a single
  // welded vertex does not make the two volumes one continuous body skin.
  const firstFace = body ? new Map() : null,
    parent = [];
  function root(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  const start = Math.max(0, g.drawRange.start),
    end = Math.min(idx?.count ?? coords.count, start + g.drawRange.count);
  for (let i = start; i + 2 < end; i += 3) {
    const ids = [0, 1, 2].map((j) => welded[idx ? idx.getX(i + j) : i + j]);
    const v = ids.map((n) => points[n]);
    const normal = new T.Vector3().subVectors(v[1], v[0]).cross(new T.Vector3().subVectors(v[2], v[0]));
    if (normal.lengthSq() < 1e-23) continue;
    normal.normalize();
    for (const id of ids) referenced.add(id);
    const box = new T.Box3().setFromPoints(v);
    const face = tris.length;
    tris.push({ id: i / 3, face, v, normal, box, center: box.getCenter(new T.Vector3()) });
    if (body) parent.push(face);
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = Math.min(a, b) + ',' + Math.max(a, b);
      edges.set(key, (edges.get(key) ?? 0) + 1);
      if (body) {
        const previous = firstFace.get(key);
        if (previous === undefined) firstFace.set(key, face);
        else parent[root(face)] = root(previous);
      }
    }
  }
  let boundaryEdges = 0,
    nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdges++;
    if (count > 2) nonManifoldEdges++;
  }
  const hierarchy = tree(tris);
  let volumes = [hierarchy];
  if (body) {
    const groups = new Map();
    for (const tri of tris) {
      const key = root(tri.face);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tri);
    }
    if (groups.size > 1) volumes = [...groups.values()].map(tree);
  }
  return {
    mesh,
    points: [...referenced].map((id) => points[id]),
    count: tris.length,
    tree: hierarchy,
    volumes,
    boundaryEdges,
    nonManifoldEdges,
  };
}

const line = new T.Vector3(),
  spans = [0, 0, 0, 0];
function cut(tri, other, out, at) {
  let lo = Infinity,
    hi = -Infinity,
    pos = false,
    neg = false;
  const n = other.normal,
    d = n.dot(other.v[0]);
  for (let i = 0; i < 3; i++) {
    const a = tri.v[i],
      b = tri.v[(i + 1) % 3],
      da = n.dot(a) - d,
      db = n.dot(b) - d;
    if (da > epsilon) pos = true;
    if (da < -epsilon) neg = true;
    let t;
    if (Math.abs(da) <= epsilon) t = line.dot(a);
    else if (da * db < 0) t = line.dot(a) + ((line.dot(b) - line.dot(a)) * da) / (da - db);
    if (t !== undefined) {
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
  }
  out[at] = lo;
  out[at + 1] = hi;
  return pos && neg;
}

// A positive-area coplanar overlap indicates coincident sheet surfaces.
// Coincident sewn edges and single contact points have zero area.
function coplanarOverlap(a, b) {
  const n = a.normal,
    k = axes.reduce((p, q) => (Math.abs(n[p]) > Math.abs(n[q]) ? p : q));
  const [u, v] = axes.filter((s) => s !== k);
  for (const tri of [a, b])
    for (let i = 0; i < 3; i++) {
      const p = tri.v[i],
        q = tri.v[(i + 1) % 3];
      const du = p[v] - q[v],
        dv = q[u] - p[u],
        tol = epsilon * Math.hypot(du, dv);
      if (Math.abs(du) + Math.abs(dv) < 1e-12) continue;
      let amin = Infinity,
        amax = -Infinity,
        bmin = Infinity,
        bmax = -Infinity;
      for (let j = 0; j < 3; j++) {
        const x = a.v[j][u] * du + a.v[j][v] * dv,
          y = b.v[j][u] * du + b.v[j][v] * dv;
        amin = Math.min(amin, x);
        amax = Math.max(amax, x);
        bmin = Math.min(bmin, y);
        bmax = Math.max(bmax, y);
      }
      if (Math.min(amax, bmax) - Math.max(amin, bmin) <= tol) return false;
    }
  return true;
}

function intersects(a, b) {
  line.crossVectors(a.normal, b.normal);
  if (line.lengthSq() < 1e-15) {
    if (Math.abs(a.normal.dot(a.v[0]) - a.normal.dot(b.v[0])) > epsilon) return false;
    return coplanarOverlap(a, b) ? 'coplanar' : false;
  }
  line.normalize();
  // At a fold the crossing line can coincide with a tessellation edge of
  // one mesh. Requiring the other mesh to span the plane catches this case.
  const piercesA = cut(a, b, spans, 0),
    piercesB = cut(b, a, spans, 2);
  return (piercesA || piercesB) && Math.min(spans[1], spans[3]) - Math.max(spans[0], spans[2]) > epsilon
    ? 'crossing'
    : false;
}

const directions = [
  new T.Vector3(1, 0.371638, 0.127491).normalize(),
  new T.Vector3(0.261593, 1, 0.419357).normalize(),
  new T.Vector3(0.173165, 0.286719, 1).normalize(),
];
const ray = new T.Ray(),
  hit = new T.Vector3(),
  hits = [];
function inside(p, volume) {
  if (!volume.box.containsPoint(p)) return false;
  function trace(node) {
    if (!ray.intersectsBox(node.box)) return;
    if (!node.leaves) {
      trace(node.left);
      trace(node.right);
      return;
    }
    for (const tri of node.leaves) {
      if (!ray.intersectTriangle(...tri.v, false, hit)) continue;
      hits.push(hit.distanceTo(p));
    }
  }
  let votes = 0;
  for (let i = 0; i < directions.length; i++) {
    hits.length = 0;
    ray.set(p, directions[i]);
    trace(volume);
    hits.sort((a, b) => a - b);
    if (hits[0] <= epsilon) return false;
    let distinct = 0,
      last = -Infinity;
    for (const t of hits)
      if (t - last > epsilon) {
        distinct++;
        last = t;
      }
    votes += distinct % 2;
    if (votes >= 2) return true;
    if (i + 1 - votes >= 2) return false;
  }
  return false;
}

export function compareSurfaces(outer, inner, checkReverse = false) {
  const result = {
    candidateTriangles: 0,
    crossings: 0,
    coplanar: 0,
    enclosed: 0,
    testedVertices: 0,
    samples: [],
  };
  function visit(a, b) {
    if (!a.box.intersectsBox(b.box)) return;
    if (a.leaves && b.leaves) {
      for (const ta of a.leaves)
        for (const tb of b.leaves) {
          if (!ta.box.intersectsBox(tb.box)) continue;
          result.candidateTriangles++;
          const kind = intersects(ta, tb);
          if (!kind) continue;
          if (kind === 'coplanar') result.coplanar++;
          else result.crossings++;
          if (result.samples.length < 2)
            result.samples.push({
              kind,
              outerTriangle: ta.id,
              innerTriangle: tb.id,
              outerCenterM: ta.center.toArray().map((n) => +n.toFixed(4)),
              outerLocal: outer.mesh
                .worldToLocal(ta.center.clone())
                .toArray()
                .map((n) => +n.toFixed(5)),
              innerLocal: inner.mesh
                .worldToLocal(tb.center.clone())
                .toArray()
                .map((n) => +n.toFixed(5)),
            });
        }
    } else if (a.leaves || (!b.leaves && a.box.max.x - a.box.min.x < b.box.max.x - b.box.min.x)) {
      visit(a, b.left);
      visit(a, b.right);
    } else {
      visit(a.left, b);
      visit(a.right, b);
    }
  }
  visit(outer.tree, inner.tree);
  function testVolume(samples, solid, direction) {
    if (solid.boundaryEdges || solid.nonManifoldEdges || !samples.tree.box.intersectsBox(solid.tree.box))
      return;
    for (const p of samples.points) {
      result.testedVertices++;
      if (!solid.volumes.some((v) => inside(p, v))) continue;
      result.enclosed++;
      if (result.samples.length < 2)
        result.samples.push({ kind: 'inside', direction, worldPointM: p.toArray() });
    }
  }
  testVolume(outer, inner, 'outer in inner');
  if (checkReverse) testVolume(inner, outer, 'inner in outer');
  return result;
}
