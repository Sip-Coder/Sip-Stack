// Fit the superficial fascicles to the pose's skin, including the concavity
// between an arm and the chest. The closed intervals of each skin surface are
// unioned only after ray intersection. Adjacent limbs stay separate.
import { Vector3, Box3 } from 'three';

export function muscleEnvelope(parts, height) {
  const skin = parts.filter(
    (p) =>
      p.layer === 'skin' &&
      /^(Continuous body, limbs and hands|Face|Neck|Covered torso and hips|(?:Left|Right) (?:covered (?:leg|arm)|hand|foot inside trainer))$/.test(
        p.name,
      ),
  );
  const box = new Box3();
  for (const { mesh } of skin) box.union(mesh.geometry.boundingBox);
  const step = height / 490,
    pad = step * 1.05;
  const y0 = box.min.y - step * 2,
    z0 = box.min.z - step * 2;
  const ny = Math.ceil((box.max.y - y0) / step) + 3,
    nz = Math.ceil((box.max.z - z0) / step) + 3;
  const intervals = new Array(ny * nz);
  for (const { mesh } of skin) {
    const rays = new Map(),
      g = mesh.geometry,
      a = g.attributes.position,
      idx = g.index.array;
    for (let k = 0; k < idx.length; k += 3) {
      const A = idx[k],
        B = idx[k + 1],
        C = idx[k + 2];
      const ay = (a.getY(A) - y0) / step,
        az = (a.getZ(A) - z0) / step;
      const by = (a.getY(B) - y0) / step,
        bz = (a.getZ(B) - z0) / step;
      const cy = (a.getY(C) - y0) / step,
        cz = (a.getZ(C) - z0) / step;
      const du = by - ay,
        dv = bz - az,
        eu = cy - ay,
        ev = cz - az,
        det = du * ev - dv * eu;
      if (Math.abs(det) < 1e-9) continue;
      const x = a.getX(A),
        dx = a.getX(B) - x,
        ex = a.getX(C) - x;
      for (let y = Math.ceil(Math.min(ay, by, cy)); y <= Math.max(ay, by, cy); y++)
        for (let z = Math.ceil(Math.min(az, bz, cz)); z <= Math.max(az, bz, cz); z++) {
          const ly = y - ay,
            lz = z - az,
            b = (ly * ev - lz * eu) / det,
            c = (du * lz - dv * ly) / det;
          if (b < 0 || c < 0 || b + c > 1) continue;
          const key = y * nz + z;
          let list = rays.get(key);
          if (!list) {
            list = [];
            rays.set(key, list);
          }
          list.push([x + b * dx + c * ex, Math.sign(det)]);
        }
    }
    for (const [key, hits] of rays) {
      hits.sort((a, b) => a[0] - b[0]);
      let winding = 0,
        start = 0;
      for (const [x, sign] of hits) {
        if (winding === 0) start = x;
        winding += sign;
        if (winding === 0 && x > start) {
          (intervals[key] ??= []).push([start, x]);
        }
      }
    }
  }
  for (const ranges of intervals) {
    if (!ranges || ranges.length < 2) continue;
    ranges.sort((a, b) => a[0] - b[0]);
    let j = 0;
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i][0] <= ranges[j][1]) ranges[j][1] = Math.max(ranges[j][1], ranges[i][1]);
      else ranges[++j] = ranges[i];
    }
    ranges.length = j + 1;
  }
  // A sample belongs to the interior only when the four neighbouring rays
  // contain it. This reserves tissue around a muscle at a curved silhouette.
  function rangeAt(x, y, z) {
    let lo = -Infinity,
      hi = Infinity;
    for (const id of [
      (y - 1) * nz + z,
      y * nz + z - 1,
      y * nz + z,
      y * nz + z + 1,
      (y + 1) * nz + z,
      (y + 1) * nz + z + 1,
      (y + 2) * nz + z + 1,
      (y + 1) * nz + z + 2,
    ]) {
      const line = intervals[id];
      if (!line) return null;
      let d = Infinity,
        best;
      for (const pair of line) {
        const distance = Math.max(0, pair[0] - x, x - pair[1]);
        if (distance < d) {
          d = distance;
          best = pair;
        }
      }
      lo = Math.max(lo, best[0] + pad);
      hi = Math.min(hi, best[1] - pad);
    }
    return lo < hi ? [lo, hi] : null;
  }
  const cache = new Map();
  return function fit(p) {
    const y = (p.y - y0) / step,
      z = (p.z - z0) / step,
      iy = Math.floor(y),
      iz = Math.floor(z);
    const inside = rangeAt(p.x, iy, iz);
    if (inside && p.x >= inside[0] && p.x <= inside[1]) return p;
    const qx = Math.round(p.x / step),
      key = qx + ':' + iy + ':' + iz;
    let target = cache.get(key);
    if (!target) {
      let best = Infinity;
      for (let r = 0; r <= 48 && (r - 1) * (r - 1) * step * step < best; r++) {
        for (let dy = -r; dy <= r; dy++) {
          const j = iy + dy;
          if (j < 0 || j >= ny - 1) continue;
          for (let dz = -r; dz <= r; dz++) {
            if (r && Math.abs(dy) !== r && Math.abs(dz) !== r) continue;
            const k = iz + dz;
            if (k < 0 || k >= nz - 1) continue;
            const interval = rangeAt(qx * step, j, k);
            if (!interval) continue;
            const x = Math.max(interval[0], Math.min(interval[1], qx * step));
            const yy = (j + 0.5) * step + y0,
              zz = (k + 0.5) * step + z0;
            const distance = (x - qx * step) ** 2 + (yy - p.y) ** 2 + (zz - p.z) ** 2;
            if (distance < best) {
              best = distance;
              target = new Vector3(x, yy, zz);
            }
          }
        }
      }
      if (target) cache.set(key, target);
    }
    return target ? p.copy(target) : p;
  };
}

// Where a long fascicle bends around a concave skin fold, safe vertices alone
// do not guarantee a safe triangle. Split shared edges where the fitted
// midpoint departs from the chord, keeping adjacent triangles watertight.
export function fitMuscleFolds(geometry, fit) {
  const points = Array.from(geometry.attributes.position.array);
  const colors = Array.from(geometry.attributes.color.array);
  let faces = geometry.index.array;
  const q = new Vector3(),
    mid = new Vector3();
  let changed = false;
  for (let pass = 0; pass < 4; pass++) {
    const originalCount = points.length / 3;
    const edgeMap = new Map();
    function midpoint(a, b) {
      const key = Math.min(a, b) * originalCount + Math.max(a, b);
      if (edgeMap.has(key)) return edgeMap.get(key);
      mid.fromArray(points, 3 * a).lerp(q.fromArray(points, 3 * b), 0.5);
      fit(q.copy(mid));
      let idx = -1;
      if (q.distanceToSquared(mid) > 2.5e-7) {
        idx = points.length / 3;
        points.push(q.x, q.y, q.z);
        for (let k = 0; k < 3; k++) colors.push((colors[3 * a + k] + colors[3 * b + k]) * 0.5);
      }
      edgeMap.set(key, idx);
      return idx;
    }
    const next = [];
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i],
        b = faces[i + 1],
        c = faces[i + 2];
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      mid
        .fromArray(points, 3 * a)
        .add(q.fromArray(points, 3 * b))
        .add(q.fromArray(points, 3 * c))
        .multiplyScalar(1 / 3);
      fit(q.copy(mid));
      if (ab < 0 && bc < 0 && ca < 0 && q.distanceToSquared(mid) < 2.5e-7) {
        next.push(a, b, c);
        continue;
      }
      const center = points.length / 3;
      points.push(q.x, q.y, q.z);
      for (let k = 0; k < 3; k++)
        colors.push((colors[3 * a + k] + colors[3 * b + k] + colors[3 * c + k]) / 3);
      const loop = [a, ab, b, bc, c, ca].filter((j) => j >= 0);
      for (let j = 0; j < loop.length; j++) next.push(loop[j], loop[(j + 1) % loop.length], center);
    }
    if (originalCount === points.length / 3) break;
    changed = true;
    faces = next;
  }
  if (changed) {
    const Attribute = geometry.attributes.position.constructor;
    geometry.setAttribute('position', new Attribute(points, 3));
    geometry.setAttribute('color', new Attribute(colors, 3));
    geometry.deleteAttribute('normal');
    geometry.setIndex(Array.from(faces));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
  }
}
