// XPBD in character metres. Compliance is measured against the fixed solver
// interval and each constraint retains its multiplier through the iterations.
import * as T from 'three';
import { finish } from './forms.js';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(v, b));

// Capsules are [start.xyz, start radius, end.xyz, end radius], in rig space.
// Use the closest point on the line swept by a linearly varying sphere. The
// analytic axial offset matters on tapered calves, especially near a knee.
function projectCapsule(p, k, caps, c, padding) {
  const x = p[k] - caps[c],
    y = p[k + 1] - caps[c + 1],
    z = p[k + 2] - caps[c + 2];
  const dx = caps[c + 4] - caps[c],
    dy = caps[c + 5] - caps[c + 1],
    dz = caps[c + 6] - caps[c + 2];
  const l2 = dx * dx + dy * dy + dz * dz;
  const dr = caps[c + 7] - caps[c + 3];
  const t = l2 > 1e-10 ? (x * dx + y * dy + z * dz) / l2 : 0;
  const ax = x - dx * t,
    ay = y - dy * t,
    az = z - dz * t;
  const u = clamp(
    t + dr * Math.sqrt((ax * ax + ay * ay + az * az) / Math.max(1e-10, l2 * (l2 - dr * dr))),
    0,
    1,
  );
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
export function collide(p, k, caps, bounds, pad) {
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let c = 0, b = 0; c < caps.length; c += 8, b += 6) {
      if (
        p[k] < bounds[b] ||
        p[k] > bounds[b + 3] ||
        p[k + 1] < bounds[b + 1] ||
        p[k + 1] > bounds[b + 4] ||
        p[k + 2] < bounds[b + 2] ||
        p[k + 2] > bounds[b + 5]
      )
        continue;
      if (projectCapsule(p, k, caps, c, pad)) moved = true;
    }
    if (!moved) break;
  }
  p[k + 1] = Math.max(0.004, p[k + 1]);
}

// Orient three garment bones along each radial column (one chain on each
// scarf end). The coarse grid drives their origins and tangents. Render-only
// pleats use these transported frames between the interpolated particles.
function garmentRig(mesh, kind, cols, rows, wrapped) {
  const strips = kind === 'scarf' ? 1 : cols,
    chains = [],
    normal = new Float32Array(strips * 9);
  const point = new T.Vector3(),
    parentPoint = new T.Vector3(),
    x = new T.Vector3(),
    y = new T.Vector3(),
    z = new T.Vector3();
  const rot = new T.Quaternion(),
    parentRot = new T.Quaternion(),
    inverse = new T.Quaternion(),
    basis = new T.Matrix4();
  for (let i = 0; i < strips; i++) {
    const chain = [];
    let parent = mesh;
    for (let j = 0; j < 3; j++) {
      const bone = new T.Bone();
      bone.name = kind + ' fold ' + (i + 1) + ' / ' + (j + 1);
      parent.add(bone);
      chain.push(bone);
      parent = bone;
    }
    chains.push(chain);
  }
  let stride = 1;
  function setLOD(level) {
    stride = level === 0 ? 1 : 2;
    for (let i = 0; i < strips; i++) chains[i][0].visible = level < 2 && i % stride === 0;
  }
  function update(pos) {
    for (let i = 0; i < strips; i += stride) {
      const col = strips === 1 ? 1 : i;
      const left = wrapped ? (col + cols - 1) % cols : Math.max(0, col - 1),
        right = wrapped ? (col + 1) % cols : Math.min(cols - 1, col + 1);
      for (let j = 0; j < 3; j++) {
        const r = Math.round(j * (rows - 1) * 0.5),
          index = 3 * (r * cols + col),
          rowTop = Math.max(0, r - 1),
          rowBottom = Math.min(rows - 1, r + 1);
        const l = 3 * (r * cols + left),
          h = 3 * (r * cols + right),
          t = 3 * (rowTop * cols + col),
          b = 3 * (rowBottom * cols + col);
        x.set(pos[h] - pos[l], pos[h + 1] - pos[l + 1], pos[h + 2] - pos[l + 2]);
        y.set(pos[t] - pos[b], pos[t + 1] - pos[b + 1], pos[t + 2] - pos[b + 2]).normalize();
        z.crossVectors(x, y).normalize();
        x.crossVectors(y, z).normalize();
        rot.setFromRotationMatrix(basis.makeBasis(x, y, z));
        point.fromArray(pos, index);
        const bone = chains[i][j];
        if (j) {
          inverse.copy(parentRot).invert();
          bone.position.copy(point).sub(parentPoint).applyQuaternion(inverse);
          bone.quaternion.copy(inverse).multiply(rot);
          parentRot.multiply(bone.quaternion);
        } else {
          bone.position.copy(point);
          bone.quaternion.copy(rot);
          parentRot.copy(bone.quaternion);
        }
        parentPoint.copy(point);
        z.set(0, 0, 1)
          .applyQuaternion(parentRot)
          .toArray(normal, 9 * i + 3 * j);
      }
    }
  }
  function joint(col, row) {
    const i = strips === 1 ? 0 : Math.floor(col / stride) * stride;
    return 9 * i + 3 * Math.round((2 * row) / (rows - 1));
  }
  return { chains, normal, setLOD, update, joint };
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

export function createPanel(root, kind, side, build, waist, color, anchorY) {
  const skirt = kind === 'skirt',
    apron = kind === 'apron',
    wrapped = skirt;
  const cols = skirt || apron ? 8 : 3,
    rows = skirt || apron ? 6 : 5;
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
        edge(i, particle(r + 1, c + 1), 0.000035);
        edge(particle(r, c + 1), particle(r + 1, c), 0.000035);
      }
      if (r + 2 < rows) edge(i, particle(r + 2, c), 0.0009);
      if (wrapped || c + 2 < cols) edge(i, particle(r, c + 2), 0.0011);
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
  const rw = 2 * (wrapped ? cols : cols - 1) + 1,
    rh = 2 * (rows - 1) + 1,
    nv = rw * rh;
  const renderPosition = new Float32Array(nv * 3),
    normals = new Float32Array(nv * 3);
  const remap = new Uint16Array(nv * 4),
    weight = new Float32Array(nv * 4),
    uv = [],
    colors = [],
    triangles = [];
  const tint = new T.Color(color);
  for (let r = 0; r < rh; r++)
    for (let c = 0; c < rw; c++) {
      const i = r * rw + c,
        a = Math.min(rows - 2, r >> 1),
        x = c * 0.5,
        b = wrapped ? Math.floor(x) % cols : Math.min(cols - 2, Math.floor(x));
      const u = x - Math.min(Math.floor(x), wrapped ? cols : cols - 2),
        v = r * 0.5 - a;
      remap.set([particle(a, b), particle(a, b + 1), particle(a + 1, b), particle(a + 1, b + 1)], i * 4);
      weight.set([(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v], i * 4);
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
  const driver = garmentRig(mesh, kind, cols, rows, wrapped);
  const surface = new Float32Array(position.length),
    fold = new Float32Array(nv);
  const foldColumn = new Uint8Array(nv),
    foldRow = new Uint8Array(nv);
  for (let r = 0; r < rh; r++)
    for (let c = 0; c < rw; c++) {
      const i = r * rw + c;
      fold[i] = Math.sin(Math.PI * c * 0.5) ** 2 * 0.0032 * Math.cos(c * 2.08 + r * 0.14) * (r / (rh - 1));
      foldColumn[i] = Math.min(cols - 1, Math.floor(c * 0.5));
      foldRow[i] = Math.round(r * 0.5);
    }
  let anchored = false,
    lastX = 0,
    lastY = 0,
    lastZ = 0;
  function anchor(m) {
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
      for (let k = 0; k < position.length; k += 3) {
        // Restrict upward folding against the grain at the sewn edge. Pure
        // distance constraints also admit the reflected (inside-out) garment.
        const row = Math.floor(k / (cols * 3));
        position[k + 1] = Math.min(position[k + 1], target[k + 1] + (0.078 * row) / (rows - 1));
        collide(position, k, caps, bounds, 0.0045);
      }
    }
    for (let k = 0; k < position.length; k += 3) {
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
    for (let j = 0; j < surface.length; j++) surface[j] = previous[j] + (position[j] - previous[j]) * f;
    driver.update(surface);
    for (let i = 0; i < nv; i++) {
      const k = i * 3;
      let x = 0,
        y = 0,
        z = 0;
      for (let j = 4 * i; j < 4 * i + 4; j++) {
        const a = remap[j] * 3,
          w = weight[j];
        x += w * surface[a];
        y += w * surface[a + 1];
        z += w * surface[a + 2];
      }
      const j = driver.joint(foldColumn[i], foldRow[i]),
        amount = fold[i];
      renderPosition[k] = x + amount * driver.normal[j];
      renderPosition[k + 1] = y + amount * driver.normal[j + 1];
      renderPosition[k + 2] = z + amount * driver.normal[j + 2];
      collide(renderPosition, k, caps, bounds, 0.003);
    }
    for (let r = 0; r < rh; r++)
      for (let c = 0; c < rw; c++) {
        const i = r * rw + c,
          k = 3 * i;
        const a = 3 * (r * rw + (c === 0 ? (wrapped ? rw - 2 : 0) : c - 1)),
          b = 3 * (r * rw + (c === rw - 1 ? (wrapped ? 1 : c) : c + 1));
        const d = 3 * (Math.max(0, r - 1) * rw + c),
          e = 3 * (Math.min(rh - 1, r + 1) * rw + c);
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
    chains: driver.chains,
    setLOD: driver.setLOD,
  };
}
