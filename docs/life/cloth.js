// XPBD in character metres. Compliance is measured against the fixed solver
// interval and each constraint retains its multiplier through the iterations.
import * as T from 'three';
import { finish } from './forms.js';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(v, b));

// Capsules are [start.xyz, start radius, end.xyz, end radius], in rig space.
// Use the closest point on the line swept by a linearly varying sphere. The
// analytic axial offset matters on tapered calves, especially near a knee.
const binCount = 48;
// 8 cm slabs in rig coordinates. Saturating at either end keeps outlying
// vertices and colliders in the same end slab, with the exact AABB test below.
const slab = (v) => Math.max(0, Math.min(binCount - 1, Math.floor(v * 12.5) + 16));
export function capsuleGrid(n) {
  const masks = new Int32Array(3 * binCount),
    shape = new Float32Array(5 * n),
    boxes = new Float32Array(6 * n);
  function build(caps) {
    masks.fill(0);
    for (let i = 0; i < n; i++) {
      const c = i * 8,
        d = i * 6,
        j = i * 5,
        bit = 1 << i;
      const dx = caps[c + 4] - caps[c],
        dy = caps[c + 5] - caps[c + 1],
        dz = caps[c + 6] - caps[c + 2],
        sq = dx * dx + dy * dy + dz * dz,
        dr = caps[c + 7] - caps[c + 3];
      shape[j] = dx;
      shape[j + 1] = dy;
      shape[j + 2] = dz;
      shape[j + 3] = sq > 1e-10 ? 1 / sq : 0;
      shape[j + 4] = dr / Math.sqrt(Math.max(1e-10, sq * (sq - dr * dr)));
      for (let axis = 0; axis < 3; axis++) {
        // Only near/mid cloth and accessory chains need a broad phase. The
        // distant actors still supply their complete posed capsules and COM.
        boxes[d + axis] = Math.min(caps[c + axis] - caps[c + 3], caps[c + 4 + axis] - caps[c + 7]) - 0.013;
        boxes[d + axis + 3] =
          Math.max(caps[c + axis] + caps[c + 3], caps[c + 4 + axis] + caps[c + 7]) + 0.013;
        const base = axis * binCount,
          lo = base + slab(boxes[d + axis]),
          hi = base + slab(boxes[d + axis + 3]);
        for (let k = lo; k <= hi; k++) masks[k] |= bit;
      }
    }
  }
  function candidates(x, y, z) {
    return masks[slab(x)] & masks[binCount + slab(y)] & masks[2 * binCount + slab(z)];
  }
  return { boxes, shape, build, candidates };
}
function projectCapsule(p, k, caps, c, shape, j, padding) {
  const x = p[k] - caps[c],
    y = p[k + 1] - caps[c + 1],
    z = p[k + 2] - caps[c + 2];
  const dx = shape[j],
    dy = shape[j + 1],
    dz = shape[j + 2],
    t = (x * dx + y * dy + z * dz) * shape[j + 3];
  const ax = x - dx * t,
    ay = y - dy * t,
    az = z - dz * t;
  const u = clamp(t + shape[j + 4] * Math.sqrt(ax * ax + ay * ay + az * az), 0, 1),
    dr = caps[c + 7] - caps[c + 3];
  let nx = x - dx * u,
    ny = y - dy * u,
    nz = z - dz * u;
  const radius = padding + caps[c + 3] + u * dr;
  const sq = nx * nx + ny * ny + nz * nz;
  if (sq >= radius * radius) return false;
  if (sq < 1e-12) {
    nx = 0;
    ny = 0;
    nz = 1;
  }
  const scale = radius / Math.sqrt(nx * nx + ny * ny + nz * nz);
  p[k] = caps[c] + dx * u + scale * nx;
  p[k + 1] = caps[c + 1] + dy * u + scale * ny;
  p[k + 2] = caps[c + 2] + dz * u + scale * nz;
  return true;
}

// Largest remaining signed correction is normally zero after a single sweep.
// Revisit overlapping tapered ends (e.g. hip and thigh) until both are clear.
export function collide(p, k, caps, grid, pad) {
  const boxes = grid.boxes;
  for (let pass = 0; pass < 6; pass++) {
    let moved = false,
      mask = grid.candidates(p[k], p[k + 1], p[k + 2]);
    while (mask) {
      const bit = mask & -mask,
        i = 31 - Math.clz32(bit),
        b = 6 * i;
      mask ^= bit;
      if (
        p[k] < boxes[b] ||
        p[k] > boxes[b + 3] ||
        p[k + 1] < boxes[b + 1] ||
        p[k + 1] > boxes[b + 4] ||
        p[k + 2] < boxes[b + 2] ||
        p[k + 2] > boxes[b + 5]
      )
        continue;
      if (projectCapsule(p, k, caps, 8 * i, grid.shape, 5 * i, pad)) {
        moved = true;
        // A push may enter a neighbour's broad-phase slab. Re-query higher
        // indices this pass and the lower indices on the following sweep.
        mask = grid.candidates(p[k], p[k + 1], p[k + 2]) & -(bit * 2);
      }
    }
    if (!moved) break;
  }
  p[k + 1] = Math.max(0.004, p[k + 1]);
}

let warmGeometry;
export function warmGarmentMesh() {
  if (!warmGeometry) {
    warmGeometry = new T.PlaneGeometry(1, 1);
    warmGeometry.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
  }
  const mesh = new T.Mesh(warmGeometry, finish('cloth'));
  mesh.name = 'Garment shader warm-up';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.visible = false;
  return mesh;
}

// The four corners of a cloth cell must clear the same side of a leg.
// Independent vertex projections alone let a triangle cut through a raised
// knee even when each of its vertices is outside. Its supporting plane is
// needed only through the vertical interval spanned by that cell.
function legDrape(cols, rows, wrapped) {
  const cells = wrapped ? cols : cols - 1;
  const step = (wrapped ? TAU : 2.7) / cells;
  const outward = new Float64Array(2 * cols),
    normals = new Float64Array(2 * cells);
  const extension = new Float64Array(cols * rows);
  const rest = new Float64Array(2 * cols);
  for (let c = 0; c < cols; c++) {
    const angle = c * step - (wrapped ? 0 : 1.35);
    rest[2 * c] = Math.sin(angle);
    rest[2 * c + 1] = Math.cos(angle);
  }
  const halfCos = Math.cos(step / 2),
    halfSin = Math.sin(step / 2);
  function orient(matrix) {
    const e = matrix.elements;
    const length = Math.hypot(e[8], e[10]);
    const sin = length > 1e-8 ? e[8] / length : 0;
    const cos = length > 1e-8 ? e[10] / length : 1;
    for (let c = 0; c < cols; c++) {
      const x = cos * rest[2 * c] + sin * rest[2 * c + 1],
        z = cos * rest[2 * c + 1] - sin * rest[2 * c];
      outward[2 * c] = x;
      outward[2 * c + 1] = z;
      if (c < cells) {
        normals[2 * c] = halfCos * x + halfSin * z;
        normals[2 * c + 1] = halfCos * z - halfSin * x;
      }
    }
  }
  function fit(points, capsules, legOffsets) {
    extension.fill(0);
    for (let r = 0; r + 1 < rows; r++)
      for (let c = 0; c < cells; c++) {
        const a = r * cols + c,
          b = r * cols + ((c + 1) % cols);
        const lo = Math.min(
          points[3 * a + 1],
          points[3 * b + 1],
          points[3 * (a + cols) + 1],
          points[3 * (b + cols) + 1],
        );
        const hi = Math.max(
          points[3 * a + 1],
          points[3 * b + 1],
          points[3 * (a + cols) + 1],
          points[3 * (b + cols) + 1],
        );
        const nx = normals[2 * c],
          nz = normals[2 * c + 1];
        let limit = -Infinity;
        for (let j = 0; j < legOffsets.length; j++) {
          const k = legOffsets[j],
            y = capsules[k + 1],
            endY = capsules[k + 5],
            dy = endY - y;
          const r0 = capsules[k + 3],
            r1 = capsules[k + 7],
            radius = Math.max(r0, r1);
          if (Math.max(y, endY) + radius < lo || Math.min(y, endY) - radius > hi) continue;
          let from = 0,
            to = 1;
          if (Math.abs(dy) > 1e-8) {
            const low = (lo - radius - y) / dy,
              high = (hi + radius - y) / dy;
            from = Math.max(0, Math.min(low, high));
            to = Math.min(1, Math.max(low, high));
          }
          const start = nx * capsules[k] + nz * capsules[k + 2] + r0;
          const slope =
            nx * (capsules[k + 4] - capsules[k]) + nz * (capsules[k + 6] - capsules[k + 2]) + r1 - r0;
          limit = Math.max(limit, start + slope * (slope > 0 ? to : from));
        }
        for (let j = 0; j < 4; j++) {
          const i = (j & 1 ? b : a) + (j >> 1) * cols;
          const extra = (limit + 0.0005 - nx * points[3 * i] - nz * points[3 * i + 2]) / halfCos;
          extension[i] = Math.max(extension[i], extra);
        }
      }
    for (let i = 0; i < extension.length; i++) {
      const c = 2 * (i % cols);
      points[3 * i] += extension[i] * outward[c];
      points[3 * i + 2] += extension[i] * outward[c + 1];
    }
  }
  return { orient, fit };
}

export function createPanel(root, kind, side, build, waist, color, anchorY) {
  const skirt = kind === 'skirt',
    apron = kind === 'apron',
    wrapped = skirt;
  const cols = skirt ? 8 : apron ? 6 : 3,
    rows = skirt || apron ? 4 : 3;
  const n = rows * cols,
    position = new Float32Array(3 * n),
    previous = new Float32Array(3 * n);
  const velocity = new Float32Array(3 * n),
    rest = new Float32Array(3 * n),
    target = new Float32Array(3 * n);
  const particle = (r, c) => r * cols + (c % cols);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const f = r / (rows - 1),
        u = c / (wrapped ? cols : cols - 1),
        k = 3 * particle(r, c);
      if (skirt || apron) {
        const a = wrapped ? TAU * u : (u - 0.5) * 2.7;
        rest[k] = Math.sin(a) * (0.182 * waist + 0.075 * build * f);
        rest[k + 1] = 1.074 - f * (skirt ? 0.49 : 0.43);
        rest[k + 2] = Math.cos(a) * (0.159 + 0.049 * f) + 0.008 * f;
      } else {
        rest[k] = side * (0.058 + f * 0.071) + (u - 0.5) * (0.052 - f * 0.018);
        rest[k + 1] = 1.497 - 0.305 * f;
        rest[k + 2] = 0.081 + 0.096 * Math.sin(f * 1.72);
      }
    }
  // Relative to the animated waist/neck in bind space.
  for (let k = 1; k < rest.length; k += 3) rest[k] -= anchorY;
  const pairs = [],
    lengths = [],
    compliance = [];
  function edge(i, j, c, slack = 1) {
    const a = i * 3,
      b = j * 3;
    pairs.push(i, j);
    lengths.push(slack * Math.hypot(rest[a] - rest[b], rest[a + 1] - rest[b + 1], rest[a + 2] - rest[b + 2]));
    compliance.push(c);
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = particle(r, c),
        next = wrapped || c + 1 < cols;
      if (next) edge(i, particle(r, c + 1), 0.000006);
      if (r + 1 < rows) edge(i, particle(r + 1, c), 0.000004);
      if (next && r + 1 < rows) {
        // Alternate the bias so the cloth resists shear on both diagonals
        // without solving two redundant diagonals in every quad.
        if ((r + c) % 2) edge(i, particle(r + 1, c + 1), 0.000035);
        else edge(particle(r, c + 1), particle(r + 1, c), 0.000035);
      }
      if (r + 2 < rows) edge(i, particle(r + 2, c), 0.0009);
      if (r > 2) edge(particle(0, c), i, -0.000007, 1.035); // unilateral long-range attachment
    }
  const links = new Uint16Array(pairs),
    length = new Float32Array(lengths),
    alpha = new Float32Array(compliance);
  const lambda = new Float32Array(length.length);
  // Topology and inverse masses stay fixed. Precompute each step size's
  // XPBD denominator once when this garment first enters the near/mid tier.
  function prepareRate(hz) {
    const scaled = new Float32Array(length.length),
      inverse = new Float32Array(length.length);
    for (let j = 0; j < length.length; j++) {
      const wa = links[j * 2] < cols ? 0 : 1,
        wb = links[j * 2 + 1] < cols ? 0 : 1;
      scaled[j] = Math.abs(alpha[j]) * hz * hz;
      inverse[j] = 1 / (wa + wb + scaled[j]);
    }
    return { scaled, inverse };
  }
  const desktop = prepareRate(60),
    mobile = prepareRate(30);
  const rw = wrapped ? cols + 1 : cols,
    rh = rows,
    nv = rw * rh;
  const renderPosition = new Float32Array(nv * 3),
    normals = new Float32Array(nv * 3);
  const uv = [],
    colors = [],
    triangles = [];
  const tint = new T.Color(color);
  for (let r = 0; r < rh; r++)
    for (let c = 0; c < rw; c++) {
      const i = r * rw + c;
      uv.push(c / (rw - 1), 1 - r / (rh - 1));
      const thread = 0.98 + 0.025 * Math.cos(c * 0.88 + r * 0.23);
      colors.push(tint.r * thread, tint.g * thread, tint.b * thread);
      if (r && c) triangles.push(i - rw - 1, i, i - rw, i - rw - 1, i - 1, i);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(renderPosition, 3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(triangles);
  const mesh = new T.Mesh(geometry, finish('cloth'));
  mesh.name = kind + ' fabric';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.visible = false;
  root.add(mesh);
  // The rendered grid shares the simulation knots. The wrap column is
  // duplicated only for UVs. Keep real deformed normals and collisions on
  // this surface without constructing another three-bone chain per column.
  const source = new Uint16Array(nv);
  const neighbours = new Uint16Array(4 * nv);
  for (let r = 0; r < rh; r++) {
    for (let c = 0; c < rw; c++) {
      const i = r * rw + c;
      source[i] = 3 * particle(r, c);
      neighbours[4 * i] = 3 * (r * rw + (c === 0 ? (wrapped ? cols - 1 : 0) : c - 1));
      neighbours[4 * i + 1] = 3 * (r * rw + (c === rw - 1 ? (wrapped ? 1 : c) : c + 1));
      neighbours[4 * i + 2] = 3 * (Math.max(0, r - 1) * rw + c);
      neighbours[4 * i + 3] = 3 * (Math.min(rh - 1, r + 1) * rw + c);
    }
  }
  const drape = skirt || apron ? legDrape(cols, rows, wrapped) : null;
  const surface = wrapped ? new Float32Array(position.length) : renderPosition;
  let anchored = false,
    lastX = 0,
    lastY = 0,
    lastZ = 0;
  function anchor(m) {
    drape?.orient(m);
    const e = m.elements;
    // Carry the sewing frame through changes in solved hip height (a stair
    // landing can lower the pelvis dramatically in a single animation sample).
    // The residual free displacement and root acceleration supply inertia.
    if (anchored) {
      const dx = 0.86 * (e[12] - lastX),
        dy = 0.93 * (e[13] - lastY),
        dz = 0.86 * (e[14] - lastZ);
      for (let k = 0; k < rest.length; k += 3) {
        position[k] += dx;
        previous[k] += dx;
        position[k + 1] += dy;
        previous[k + 1] += dy;
        position[k + 2] += dz;
        previous[k + 2] += dz;
      }
    }
    lastX = e[12];
    lastY = e[13];
    lastZ = e[14];
    anchored = true;
    for (let k = 0; k < rest.length; k += 3) {
      const x = rest[k],
        y = rest[k + 1],
        z = rest[k + 2];
      target[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      target[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      target[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }
  function reset() {
    position.set(target);
    previous.set(target);
    velocity.fill(0);
  }
  let peakSpeed = 0;
  function solve(dt, iter, wind, acc, caps, bounds) {
    previous.set(position);
    lambda.fill(0);
    const rate = dt > 0.02 ? mobile : desktop,
      damping = Math.exp(-8 * dt);
    for (let k = 0; k < position.length; k++) {
      if (k < cols * 3) {
        position[k] = target[k];
        continue;
      }
      const axis = k % 3;
      const force = (axis === 1 ? -3.8 : axis === 0 ? wind * 1.7 : wind * 0.3) - 0.32 * acc[axis];
      const v = velocity[k] * damping + dt * (force + 29 * (target[k] - position[k]));
      position[k] += v * dt;
    }
    for (let pass = 0; pass < iter; pass++) {
      for (let j = 0; j < length.length; j++) {
        const ai = links[j * 2],
          bi = links[j * 2 + 1],
          a = ai * 3,
          b = bi * 3,
          wa = ai < cols ? 0 : 1,
          wb = bi < cols ? 0 : 1;
        if (!wa && !wb) continue;
        const x = position[a] - position[b],
          y = position[a + 1] - position[b + 1],
          z = position[a + 2] - position[b + 2];
        const d = Math.sqrt(x * x + y * y + z * z),
          c = d - length[j];
        if (d < 1e-7 || (alpha[j] < 0 && c <= 0)) continue;
        const dl = (-c - rate.scaled[j] * lambda[j]) * rate.inverse[j];
        lambda[j] += dl;
        const scale = dl / d;
        position[a] += wa * scale * x;
        position[a + 1] += wa * scale * y;
        position[a + 2] += wa * scale * z;
        position[b] -= wb * scale * x;
        position[b + 1] -= wb * scale * y;
        position[b + 2] -= wb * scale * z;
      }
    }
    for (let k = 0; k < position.length; k += 3) {
      // Project the final constrained location. Rechecking intermediate
      // iterations would push the same particle away from the same capsule.
      const row = Math.floor(k / (cols * 3));
      position[k + 1] = Math.min(position[k + 1], target[k + 1] + (0.078 * row) / (rows - 1));
      collide(position, k, caps, bounds, 0.0045);
      let x = (position[k] - previous[k]) / dt,
        y = (position[k + 1] - previous[k + 1]) / dt,
        z = (position[k + 2] - previous[k + 2]) / dt;
      const speed = Math.sqrt(x * x + y * y + z * z),
        f = speed > 6 ? 6 / speed : 1;
      peakSpeed = Math.max(peakSpeed, speed);
      velocity[k] = x * f;
      velocity[k + 1] = y * f;
      velocity[k + 2] = z * f;
    }
  }
  function render(f, caps, bounds) {
    for (let i = 0; i < surface.length; i++) surface[i] = previous[i] + (position[i] - previous[i]) * f;
    for (let k = 0; k < surface.length; k += 3) collide(surface, k, caps, bounds, 0.003);
    drape?.fit(surface, caps, bounds.legOffsets);
    if (wrapped) {
      for (let i = 0; i < nv; i++)
        for (let k = 0; k < 3; k++) renderPosition[3 * i + k] = surface[source[i] + k];
    }
    for (let i = 0; i < nv; i++) {
      const k = i * 3,
        j = i * 4;
      const a = neighbours[j],
        b = neighbours[j + 1],
        d = neighbours[j + 2],
        e = neighbours[j + 3];
      const x = renderPosition[b] - renderPosition[a],
        y = renderPosition[b + 1] - renderPosition[a + 1],
        z = renderPosition[b + 2] - renderPosition[a + 2];
      const xx = renderPosition[e] - renderPosition[d],
        yy = renderPosition[e + 1] - renderPosition[d + 1],
        zz = renderPosition[e + 2] - renderPosition[d + 2];
      const nx = yy * z - zz * y,
        ny = zz * x - xx * z,
        nz = xx * y - yy * x;
      const inv = 1 / Math.max(1e-9, Math.sqrt(nx * nx + ny * ny + nz * nz));
      normals[k] = nx * inv;
      normals[k + 1] = ny * inv;
      normals[k + 2] = nz * inv;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
  }
  return {
    kind,
    cols,
    rows,
    position,
    previous,
    velocity,
    rest,
    target,
    links,
    renderPosition,
    geometry,
    mesh,
    anchor,
    reset,
    solve,
    render,
    get peakSpeed() {
      return peakSpeed;
    },
  };
}
