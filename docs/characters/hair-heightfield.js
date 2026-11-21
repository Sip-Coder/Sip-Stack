// A lock draped over a rigid pack must always leave through its upper face.
// Sample that face once in pack space. The rounded continuation at its edges
// lets an approaching curl rise progressively, even on a near-vertical side.
import * as T from 'three';

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
    const ux = b.x - a.x, uz = b.z - a.z, vx = c.x - a.x, vz = c.z - a.z;
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
        const u = (x * vz - z * vx) / det, v = (ux * z - uz * x) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const height = a.y + u * (b.y - a.y) + v * (c.y - a.y);
        const id = iz * nx + ix;
        heights[id] = Math.max(heights[id], height);
      }
    }
  }
  // The max-plus distance transform bounds the slope across fine seams,
  // the flap, and the outer rim without averaging their top down into leather.
  const drop = slope * cell, diagonal = drop * Math.SQRT2;
  for (const sign of [1, -1]) {
    for (let z = sign > 0 ? 1 : nz - 2; z >= 1 && z < nz - 1; z += sign) {
      for (let x = sign > 0 ? 1 : nx - 2; x >= 1 && x < nx - 1; x += sign) {
        const id = z * nx + x, prior = id - sign * nx;
        heights[id] = Math.max(heights[id], heights[id - sign] - drop,
          heights[prior] - drop, heights[prior - 1] - diagonal, heights[prior + 1] - diagonal);
      }
    }
  }
  function heightAt(x, z) {
    const u = (x - bounds.min.x) / cell, v = (z - bounds.min.z) / cell;
    if (u < 0 || v < 0 || u >= nx - 1 || v >= nz - 1) return -Infinity;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    const k = j * nx + i;
    const near = heights[k] * (1 - fx) + heights[k + 1] * fx;
    const far = heights[k + nx] * (1 - fx) + heights[k + nx + 1] * fx;
    return near * (1 - fz) + far * fz;
  }
  // Support the finite guide radius on the local slope, including at a rounded
  // corner. A flat central panel only needs one radius of vertical clearance.
  const ring = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
  function sphereHeight(x, z, radius) {
    let h = heightAt(x, z) + radius;
    for (const [dx, dz] of ring)
      h = Math.max(h, heightAt(x + 0.84 * radius * dx, z + 0.84 * radius * dz) + 0.56 * radius);
    return h;
  }
  return { node, role: 'packTop', support: { bounds, heightAt, sphereHeight } };
}
