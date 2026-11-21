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
    pad = step * 1.4;
  const y0 = box.min.y - step * 2,
    z0 = box.min.z - step * 2;
  const ny = Math.ceil((box.max.y - y0) / step) + 3,
    nz = Math.ceil((box.max.z - z0) / step) + 3;
  const intervals = new Array(ny * nz);
  // Exact projected faces for resolving a concavity between two consecutive
  // atlas vertices. The coarse buckets only accelerate the lookup.
  const cells = new Map(),
    cellSize = 8,
    cellStride = Math.ceil(nz / cellSize) + 2;
  let group = 0;
  const depths = [];
  for (const { mesh } of skin) {
    group++;
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
      const face = { ay, az, du, dv, eu, ev, det, x, dx, ex, group };
      for (
        let iy = Math.floor(Math.min(ay, by, cy) / cellSize);
        iy <= Math.floor(Math.max(ay, by, cy) / cellSize);
        iy++
      )
        for (
          let iz = Math.floor(Math.min(az, bz, cz) / cellSize);
          iz <= Math.floor(Math.max(az, bz, cz) / cellSize);
          iz++
        ) {
          const key = iy * cellStride + iz;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(face);
        }
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
  function fit(p) {
    const y = (p.y - y0) / step,
      z = (p.z - z0) / step,
      iy = Math.floor(y),
      iz = Math.floor(z);
    const inside = rangeAt(p.x, iy, iz);
    if (inside) {
      const x = Math.max(inside[0], Math.min(inside[1], p.x));
      // The sampled ray already passes through this section. Small sideways
      // corrections can stay at their continuous height and depth; snapping
      // them to a voxel centre would introduce ripples on the muscle belly.
      if (Math.abs(x - p.x) <= 1.6 * step) {
        p.x = x;
        return p;
      }
    }
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
  }
  fit.hasReserve = (p) => {
    const interval = rangeAt(p.x, Math.floor((p.y - y0) / step), Math.floor((p.z - z0) / step));
    return Boolean(interval && p.x > interval[0] && p.x < interval[1]);
  };
  fit.inside = (p) => {
    const y = (p.y - y0) / step,
      z = (p.z - z0) / step;
    const bucket = cells.get(Math.floor(y / cellSize) * cellStride + Math.floor(z / cellSize));
    if (!bucket) return false;
    depths.fill(0);
    for (const f of bucket) {
      const py = y - f.ay,
        pz = z - f.az;
      const b = (py * f.ev - pz * f.eu) / f.det,
        c = (f.du * pz - f.dv * py) / f.det;
      if (b < 0 || c < 0 || b + c > 1 || f.x + b * f.dx + c * f.ex < p.x) continue;
      depths[f.group] = (depths[f.group] || 0) + Math.sign(f.det);
    }
    return depths.some((d) => d !== 0);
  };
  return fit;
}

// Refine only a chord that actually exits the posed skin. The shoulder,
// jaw, ankle and web of the thumb can all fold between a pair of safe ends.
// Use one index for a split shared edge, carrying its exact attribute weights.
export function fitMuscleFolds(geometry, fit, pitch, contacts) {
  const positions = Array.from(geometry.attributes.position.array);
  const colors = Array.from(geometry.attributes.color.array);
  const uv = Array.from(geometry.attributes.uv.array);
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    sample = new Vector3();
  const add = (vertices, weights, p) => {
    const id = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    for (const [array, stride] of [
      [colors, 3],
      [uv, 2],
    ]) {
      for (let k = 0; k < stride; k++) {
        let value = 0;
        for (let j = 0; j < vertices.length; j++) value += array[stride * vertices[j] + k] * weights[j];
        array.push(value);
      }
    }
    return id;
  };
  const axis = new Vector3(),
    tangent = new Vector3(),
    bitangent = new Vector3();
  const middle = new Vector3(),
    candidate = new Vector3(),
    best = new Vector3(),
    test = new Vector3();
  function outsideCount(from, to) {
    const steps = Math.max(2, Math.min(15, Math.ceil(from.distanceTo(to) / pitch)));
    let exterior = 0;
    for (let k = 1; k < steps; k++) if (!fit.inside(test.lerpVectors(from, to, k / steps))) exterior++;
    return exterior;
  }
  // A chord spanning an armpit or flexed ankle needs a path through the
  // surrounding tissue. Merely snapping its midpoint to the nearer of the
  // two opposing skin surfaces would leave triangles hanging across air.
  function aroundFold(a, b) {
    middle.addVectors(a, b).multiplyScalar(0.5);
    best.copy(middle);
    fit(best);
    let gaps = outsideCount(a, best) + outsideCount(best, b);
    if (!gaps) return best;
    axis.subVectors(b, a);
    const length = axis.length();
    axis.normalize();
    tangent
      .set(Math.abs(axis.x) < 0.8 ? 1 : 0, Math.abs(axis.x) < 0.8 ? 0 : 1, 0)
      .projectOnPlane(axis)
      .normalize();
    bitangent.crossVectors(axis, tangent);
    for (let r = pitch; r <= Math.max(length * 0.75, 5 * pitch); r += pitch) {
      for (let n = 0; n < 16; n++) {
        const angle = (n * Math.PI) / 8;
        candidate
          .copy(middle)
          .addScaledVector(tangent, r * Math.cos(angle))
          .addScaledVector(bitangent, r * Math.sin(angle));
        if (!fit.inside(candidate)) continue;
        const score = outsideCount(a, candidate) + outsideCount(candidate, b);
        if (score < gaps) {
          best.copy(candidate);
          gaps = score;
        }
        if (!gaps) return best;
      }
    }
    return best;
  }
  let faces = geometry.index.array;
  for (let pass = 0; pass < 3; pass++) {
    const start = positions.length / 3,
      cache = new Map();
    const edge = (i, j) => {
      const key = Math.min(i, j) * start + Math.max(i, j);
      if (cache.has(key)) return cache.get(key);
      a.fromArray(positions, 3 * i);
      b.fromArray(positions, 3 * j);
      const steps = Math.min(16, Math.ceil(a.distanceTo(b) / pitch));
      let hit = -1;
      for (let k = 1; k < steps; k++) {
        // Try the center first, then the intervals on either side.
        const n = Math.floor(steps / 2) + (k % 2 === 1 ? -(k - 1) / 2 : k / 2);
        const t = n / steps;
        sample.lerpVectors(a, b, t);
        if (fit.inside(sample)) continue;
        hit = add([i, j], [0.5, 0.5], aroundFold(a, b));
        break;
      }
      cache.set(key, hit);
      return hit;
    };
    const next = [];
    for (let k = 0; k < faces.length; k += 3) {
      const i = faces[k],
        j = faces[k + 1],
        l = faces[k + 2];
      const ab = edge(i, j),
        bc = edge(j, l),
        ca = edge(l, i);
      a.fromArray(positions, 3 * i);
      b.fromArray(positions, 3 * j);
      c.fromArray(positions, 3 * l);
      const length = Math.sqrt(
        Math.max(a.distanceToSquared(b), a.distanceToSquared(c), b.distanceToSquared(c)),
      );
      let u = 1 / 3,
        v = 1 / 3,
        w = 1 / 3,
        cross = false;
      // An entire concave patch can also lie in the interior of a large
      // source triangle. Test in barycentric coordinates to preserve the UVs.
      if (ab < 0 && bc < 0 && ca < 0) {
        const steps = Math.min(12, Math.ceil(length / pitch));
        for (let y = 1; y < steps && !cross; y++)
          for (let x = 1; x < steps - y; x++) {
            u = x / steps;
            v = y / steps;
            w = 1 - u - v;
            sample.copy(a).multiplyScalar(u).addScaledVector(b, v).addScaledVector(c, w);
            if (!fit.inside(sample)) {
              cross = true;
              break;
            }
          }
        if (!cross) {
          next.push(i, j, l);
          continue;
        }
      } else {
        sample.copy(a).add(b).add(c).divideScalar(3);
      }
      if (!fit.inside(sample)) fit(sample);
      const center = add([i, j, l], [u, v, w], sample);
      const rim = [i, ab, j, bc, l, ca].filter((n) => n >= 0);
      for (let m = 0; m < rim.length; m++) next.push(rim[m], rim[(m + 1) % rim.length], center);
    }
    if (start === positions.length / 3) break;
    faces = next;
  }
  // Recheck each repaired fan against the actual skin. A small number of
  // constrained tendon insertions need their skin fold to follow them.
  if (faces !== geometry.index.array) {
    const originalCount = geometry.attributes.position.count;
    for (let k = 0; k < faces.length; k += 3) {
      if (faces[k] < originalCount && faces[k + 1] < originalCount && faces[k + 2] < originalCount) continue;
      a.fromArray(positions, 3 * faces[k]);
      b.fromArray(positions, 3 * faces[k + 1]);
      c.fromArray(positions, 3 * faces[k + 2]);
      const length = Math.sqrt(
        Math.max(a.distanceToSquared(b), a.distanceToSquared(c), b.distanceToSquared(c)),
      );
      const steps = Math.max(2, Math.min(20, Math.ceil(length / (pitch * 0.6))));
      for (let y = 0; y <= steps; y++)
        for (let x = 0; x <= steps - y; x++) {
          const u = x / steps,
            v = y / steps,
            w = 1 - u - v;
          sample.copy(a).multiplyScalar(u).addScaledVector(b, v).addScaledVector(c, w);
          if (!fit.inside(sample)) contacts.push(sample.clone());
        }
    }
  }
  if (faces === geometry.index.array) return;
  const Attribute = geometry.attributes.position.constructor;
  geometry.setAttribute('position', new Attribute(positions, 3));
  geometry.setAttribute('color', new Attribute(colors, 3));
  geometry.setAttribute('uv', new Attribute(uv, 2));
  geometry.deleteAttribute('normal');
  geometry.setIndex(faces);
}
