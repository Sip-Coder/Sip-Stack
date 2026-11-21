// A lock draped over a rigid pack must always leave through its upper face.
// Sample that face once in pack space. The rounded continuation at its edges
// lets an approaching curl rise progressively, even on a near-vertical side.
import * as T from 'three';

// The fabric guide can use a smoothed contact surface, but its measured tip
// has a finite radius. Sweep that sphere vertically against the original
// triangles, including the steep edges on the flap and leather piping.
function tipSupport(triangles, bounds) {
  const bin = 0.022;
  const xmin = bounds.min.x,
    zmin = bounds.min.z;
  const nx = 1 + Math.floor((bounds.max.x - xmin) / bin);
  const nz = 1 + Math.floor((bounds.max.z - zmin) / bin);
  const bins = Array.from({ length: nx * nz }, () => []);
  const faces = triangles.map(([a, b, c], id) => {
    const vertices = [a, b, c];
    const edges = vertices.map((p, i) => {
      const q = vertices[(i + 1) % 3];
      const dx = q.x - p.x,
        dy = q.y - p.y,
        dz = q.z - p.z;
      const span2 = dx * dx + dz * dz;
      return { p, dx, dy, dz, span2, rise: span2 ? Math.sqrt(1 + (dy * dy) / span2) : 0 };
    });
    const normal = new T.Triangle(a, b, c).getNormal(new T.Vector3());
    if (normal.y < 0) normal.negate();
    const orientation = Math.sign((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    const x0 = Math.floor((Math.min(a.x, b.x, c.x) - xmin) / bin);
    const x1 = Math.floor((Math.max(a.x, b.x, c.x) - xmin) / bin);
    const z0 = Math.floor((Math.min(a.z, b.z, c.z) - zmin) / bin);
    const z1 = Math.floor((Math.max(a.z, b.z, c.z) - zmin) / bin);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) bins[z * nx + x].push(id);
    return { a, normal, orientation, edges };
  });
  const seen = new Uint32Array(faces.length);
  let query = 0;
  return function topForSphere(x, z, radius) {
    query = (query + 1) >>> 0;
    if (!query) {
      seen.fill(0);
      query = 1;
    }
    const x0 = Math.max(0, Math.floor((x - radius - xmin) / bin));
    const x1 = Math.min(nx - 1, Math.floor((x + radius - xmin) / bin));
    const z0 = Math.max(0, Math.floor((z - radius - zmin) / bin));
    const z1 = Math.min(nz - 1, Math.floor((z + radius - zmin) / bin));
    const r2 = radius * radius;
    let top = -Infinity;
    for (let j = z0; j <= z1; j++)
      for (let i = x0; i <= x1; i++)
        for (const id of bins[j * nx + i]) {
          if (seen[id] === query) continue;
          seen[id] = query;
          const { a, normal, orientation, edges } = faces[id];
          // A face contributes where the sphere's contact point falls inside it.
          if (normal.y > 1e-8) {
            const cx = x - normal.x * radius,
              cz = z - normal.z * radius;
            let inside = true;
            for (const e of edges) {
              if (orientation * (e.dx * (cz - e.p.z) - e.dz * (cx - e.p.x)) < -1e-12) {
                inside = false;
                break;
              }
            }
            if (inside)
              top = Math.max(top, a.y + (radius - normal.x * (x - a.x) - normal.z * (z - a.z)) / normal.y);
          }
          for (const { p, dx, dy, dz, span2, rise } of edges) {
            const px = x - p.x,
              pz = z - p.z;
            const vertexCap = r2 - px * px - pz * pz;
            if (vertexCap >= 0) top = Math.max(top, p.y + Math.sqrt(vertexCap));
            if (span2 < 1e-16) continue;
            // The vertical line can meet the capsule over the edge interior.
            const t = (px * dx + pz * dz) / span2;
            const u = px - t * dx,
              v = pz - t * dz;
            const cap = r2 - u * u - v * v;
            if (cap < 0) continue;
            const reach = Math.sqrt(cap);
            const contact = t + (dy * reach) / (span2 * rise);
            if (contact >= 0 && contact <= 1) top = Math.max(top, p.y + t * dy + reach * rise);
          }
        }
    return top;
  };
}

export function upperSurface(node, meshes) {
  const triangles = [];
  const bounds = new T.Box3();
  for (const mesh of meshes) {
    if (mesh.parent !== node) continue;
    mesh.updateMatrix();
    const g = mesh.geometry;
    const vertex = g.getAttribute('position');
    const points = Array.from({ length: vertex.count }, (_, i) => {
      const p = new T.Vector3().fromBufferAttribute(vertex, i).applyMatrix4(mesh.matrix);
      bounds.expandByPoint(p);
      return p;
    });
    const count = g.index?.count ?? points.length;
    for (let i = 0; i < count; i += 3)
      triangles.push([0, 1, 2].map((j) => points[g.index ? g.index.getX(i + j) : i + j]));
  }
  const topForSphere = tipSupport(triangles, bounds);
  const cell = 0.002;
  const slope = 2.5;
  const skirt = 0.042;
  bounds.min.x -= skirt;
  bounds.min.z -= skirt;
  bounds.max.x += skirt;
  bounds.max.z += skirt;
  const nx = 1 + Math.ceil((bounds.max.x - bounds.min.x) / cell);
  const nz = 1 + Math.ceil((bounds.max.z - bounds.min.z) / cell);
  const heights = new Float32Array(nx * nz).fill(bounds.min.y - skirt);
  for (const [a, b, c] of triangles) {
    const ux = b.x - a.x,
      uz = b.z - a.z,
      vx = c.x - a.x,
      vz = c.z - a.z;
    const det = ux * vz - uz * vx;
    // Pin every actual rim vertex, including the ends of vertical triangles.
    for (const p of [a, b, c]) {
      const ix = Math.round((p.x - bounds.min.x) / cell);
      const iz = Math.round((p.z - bounds.min.z) / cell);
      heights[iz * nx + ix] = Math.max(heights[iz * nx + ix], p.y);
    }
    if (Math.abs(det) < 1e-11) continue;
    const x0 = Math.ceil((Math.min(a.x, b.x, c.x) - bounds.min.x) / cell);
    const x1 = Math.floor((Math.max(a.x, b.x, c.x) - bounds.min.x) / cell);
    const z0 = Math.ceil((Math.min(a.z, b.z, c.z) - bounds.min.z) / cell);
    const z1 = Math.floor((Math.max(a.z, b.z, c.z) - bounds.min.z) / cell);
    for (let iz = z0; iz <= z1; iz++) {
      const z = bounds.min.z + iz * cell - a.z;
      for (let ix = x0; ix <= x1; ix++) {
        const x = bounds.min.x + ix * cell - a.x;
        const u = (x * vz - z * vx) / det,
          v = (ux * z - uz * x) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const height = a.y + u * (b.y - a.y) + v * (c.y - a.y);
        const id = iz * nx + ix;
        heights[id] = Math.max(heights[id], height);
      }
    }
  }
  // The max-plus distance transform bounds the slope across fine seams,
  // the flap, and the outer rim without averaging their top down into leather.
  const drop = slope * cell,
    diagonal = drop * Math.SQRT2;
  for (const sign of [1, -1]) {
    for (let z = sign > 0 ? 1 : nz - 2; z >= 1 && z < nz - 1; z += sign) {
      for (let x = sign > 0 ? 1 : nx - 2; x >= 1 && x < nx - 1; x += sign) {
        const id = z * nx + x,
          prior = id - sign * nx;
        heights[id] = Math.max(
          heights[id],
          heights[id - sign] - drop,
          heights[prior] - drop,
          heights[prior - 1] - diagonal,
          heights[prior + 1] - diagonal,
        );
      }
    }
  }
  function heightAt(x, z) {
    const u = (x - bounds.min.x) / cell,
      v = (z - bounds.min.z) / cell;
    if (u < 0 || v < 0 || u >= nx - 1 || v >= nz - 1) return -Infinity;
    const i = Math.floor(u),
      j = Math.floor(v),
      fx = u - i,
      fz = v - j;
    const k = j * nx + i;
    const near = heights[k] * (1 - fx) + heights[k + 1] * fx;
    const far = heights[k + nx] * (1 - fx) + heights[k + nx + 1] * fx;
    return near * (1 - fz) + far * fz;
  }
  // Support the finite guide radius on the local slope, including at a rounded
  // corner. A flat central panel only needs one radius of vertical clearance.
  const ring = Array.from({ length: 8 }, (_, i) => [
    Math.cos((i * Math.PI) / 4),
    Math.sin((i * Math.PI) / 4),
  ]);
  function sphereHeight(x, z, radius) {
    let h = heightAt(x, z) + radius;
    for (const [dx, dz] of ring)
      h = Math.max(h, heightAt(x + 0.84 * radius * dx, z + 0.84 * radius * dz) + 0.56 * radius);
    return h;
  }
  return { node, role: 'packTop', support: { bounds, heightAt, sphereHeight, topForSphere } };
}
