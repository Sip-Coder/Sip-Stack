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
  // A coarse pattern can close two openings at the same edge, forming four
  // incident faces rather than two. A closed, oriented chain still bounds
  // a volume and can be tested for containment. Verify every edge balance
  // before accepting this special case; genuine holes continue to skip it.
  let balancedJunction = false;
  if (nonManifoldEdges && !boundaryEdges) {
    const balance = new Map();
    for (const { id } of tris) {
      const vertex = [0, 1, 2].map((j) => welded[idx ? idx.getX(3 * id + j) : 3 * id + j]);
      for (let k = 0; k < 3; k++) {
        const a = vertex[k],
          b = vertex[(k + 1) % 3],
          key = Math.min(a, b) * points.length + Math.max(a, b);
        balance.set(key, (balance.get(key) ?? 0) + (a < b ? 1 : -1));
      }
    }
    balancedJunction = [...balance.values()].every((v) => v === 0);
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
    triangles: tris,
    tree: hierarchy,
    volumes,
    boundaryEdges,
    nonManifoldEdges,
    balancedJunction,
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
  new T.Vector3(-1, 0.254625, 0.61138).normalize(),
  new T.Vector3(0.52471, -1, -0.19381).normalize(),
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
      // Keep the direction of crossing. Coincident entry and exit faces
      // can occur at a folded hem; merging the two into a single hit
      // would falsely classify distant, exterior points as embedded.
      hits.push(Math.sign(ray.direction.dot(tri.normal)) * hit.distanceTo(p));
    }
  }
  let insideVotes = 0,
    outsideVotes = 0;
  for (const direction of directions) {
    hits.length = 0;
    ray.set(p, direction);
    trace(volume);
    hits.sort((a, b) => Math.abs(a) - Math.abs(b));
    if (Math.abs(hits[0]) <= epsilon) return false;
    let distinct = 0,
      ambiguous = false;
    for (let i = 0; i < hits.length; ) {
      const start = Math.abs(hits[i]),
        sign = Math.sign(hits[i++]);
      while (i < hits.length && Math.abs(hits[i]) - start <= epsilon) {
        if (Math.sign(hits[i++]) !== sign) ambiguous = true;
      }
      distinct++;
    }
    if (ambiguous) continue;
    if (distinct % 2) insideVotes++;
    else outsideVotes++;
    if (insideVotes >= 2) return true;
    if (outsideVotes >= 2) return false;
  }
  // If several rays hit a crease exactly, integrate the oriented solid
  // angle of the whole closed component instead of voting with those rays.
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    cross = new T.Vector3();
  function solidAngle(node) {
    if (!node.leaves) return solidAngle(node.left) + solidAngle(node.right);
    let total = 0;
    for (const t of node.leaves) {
      a.subVectors(t.v[0], p);
      b.subVectors(t.v[1], p);
      c.subVectors(t.v[2], p);
      const al = a.length(),
        bl = b.length(),
        cl = c.length();
      const denominator = al * bl * cl + a.dot(b) * cl + b.dot(c) * al + c.dot(a) * bl;
      total += 2 * Math.atan2(a.dot(cross.crossVectors(b, c)), denominator);
    }
    return total;
  }
  return Math.round(Math.abs(solidAngle(volume)) / (4 * Math.PI)) % 2 === 1;
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
    if (
      solid.boundaryEdges ||
      (solid.nonManifoldEdges && !solid.balancedJunction) ||
      !samples.tree.box.intersectsBox(solid.tree.box)
    )
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

// A pinched crown can have coincident or crossing plies while the rest of its
// outfit remains clear. Test the two rendered skins against each other, with
// their shared rim omitted because its role is to join those two skins.
export function measureCrownPlies(surface) {
  const mesh = surface.mesh,
    geom = mesh.geometry;
  const count = geom.userData.crownPlyTriangles;
  if (!Number.isInteger(count) || count <= 0 || count * 6 >= geom.index.count)
    throw Error('Missing shoulder outer/lining triangle layout');
  function ply(start) {
    const triangles = surface.triangles.filter((t) => t.id >= start && t.id < start + count);
    return { mesh, tree: tree(triangles), boundaryEdges: 1, points: [] };
  }
  const intersections = compareSurfaces(ply(0), ply(count));
  const vertices = geom.attributes.position.count,
    half = vertices / 2;
  if (!Number.isInteger(half)) throw Error('Unpaired crown ply buffers');
  const outer = new T.Vector3(),
    inner = new T.Vector3();
  let minPlySeparationM = Infinity;
  for (let i = 0; i < half; i++) {
    mesh.getVertexPosition(i, outer).applyMatrix4(mesh.matrixWorld);
    mesh.getVertexPosition(i + half, inner).applyMatrix4(mesh.matrixWorld);
    minPlySeparationM = Math.min(minPlySeparationM, outer.distanceTo(inner));
  }
  return {
    trianglesPerPly: count,
    minPlySeparationM,
    candidateTriangles: intersections.candidateTriangles,
    crossings: intersections.crossings,
    coplanar: intersections.coplanar,
    samples: intersections.samples,
  };
}
