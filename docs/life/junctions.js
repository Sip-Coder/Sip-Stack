// Sew profile rings with different circumference samples without duplicating
// vertices. Skin weights and the angle-weighted boundary normals stay shared.
function stitch(body, lower, upper, angles) {
  let i = 0,
    j = 0;
  const n = lower.length - 1,
    m = upper.length - 1;
  while (i < n || j < m) {
    const a = lower[i],
      b = upper[j];
    const nextUpper = angles ? angles[j + 1] : (j + 1) / m;
    if (i < n && (j === m || (i + 1) / n <= nextUpper)) {
      body.indices.push(a, lower[++i], b);
    } else {
      body.indices.push(b, a, upper[++j]);
    }
  }
}
function ring(part, row) {
  return Array.from({ length: part.n }, (_, i) => part.first + row * part.n + i);
}
function uncapped(body, part) {
  // A profile emits the upper and lower cap triangles alternately.
  body.indices.length = part.start + 6 * part.n * part.steps;
  for (let i = 1; i < part.n - 1; i++) body.indices.push(part.first, part.first + i + 1, part.first + i);
}

// Open the armholes in the bodice and split its bottom loop into two trouser
// openings. The two medial edges use the same vertices along the inseam.
export function openBodice(body, part, hip) {
  const { first, n, steps, start } = part;
  const at = (j, i) => first + j * n + ((i + n) % n);
  const row = (y) => {
    let index = 0;
    for (let j = 1; j <= steps; j++)
      if (Math.abs(body.xyz[at(j, 0) * 3 + 1] - y) < Math.abs(body.xyz[at(index, 0) * 3 + 1] - y)) index = j;
    return index;
  };
  const low = row(1.323),
    high = row(1.456),
    middle = row(1.389),
    shoulders = [];
  for (const sign of [-1, 1]) {
    const center = (sign === 1 ? 0.25 : 0.75) * n;
    const front = Math.round(center - sign * 0.11 * n),
      back = Math.round(center + sign * 0.11 * n);
    const rim = [];
    for (let j = middle; j < high; j++) rim.push(at(j, front));
    for (let i = front; i !== back; i += sign) rim.push(at(high, i));
    for (let j = high; j > low; j--) rim.push(at(j, back));
    for (let i = back; i !== front; i -= sign) rim.push(at(low, i));
    for (let j = low; j < middle; j++) rim.push(at(j, front));
    if (sign < 0) rim.splice(1, rim.length - 1, ...rim.slice(1).reverse());
    const y0 = body.xyz[at(middle, front) * 3 + 1],
      z0 = (body.xyz[at(middle, front) * 3 + 2] + body.xyz[at(middle, back) * 3 + 2]) / 2;
    const angles = rim.map((id) => {
      const a = Math.atan2(sign * (body.xyz[id * 3 + 1] - y0), body.xyz[id * 3 + 2] - z0);
      return (a / (2 * Math.PI) + 1) % 1;
    });
    shoulders.push({ angles, min: Math.min(front, back), max: Math.max(front, back), rim });
  }
  body.indices.length = start;
  for (let j = 0; j < steps; j++)
    for (let i = 0; i < n; i++) {
      if (j >= low && j < high && shoulders.some((q) => i >= q.min && i < q.max)) continue;
      const a = at(j, i),
        b = at(j, i + 1),
        c = at(j + 1, i),
        d = at(j + 1, i + 1);
      body.indices.push(a, b, c, c, b, d);
    }
  for (let i = 1; i < n - 1; i++) body.indices.push(at(steps, 0), at(steps, i), at(steps, i + 1));
  const belt = ring(part, 0),
    front = belt[0],
    back = belt[n / 2];
  const stride = Math.max(4, Math.round(n / 4)),
    inseam = [];
  for (let i = 1; i < stride; i++) {
    const f = i / stride,
      id = body.xyz.length / 3;
    const z = body.xyz[3 * front + 2] * (1 - f) + body.xyz[3 * back + 2] * f;
    body.xyz.push(0, 0.837 + 0.043 * Math.abs(1 - 2 * f) ** 1.6, z);
    body.rgb.push(...body.rgb.slice(3 * front, 3 * front + 3));
    body.tissue.push(body.tissue[front]);
    body.joints.push(hip, 0, 0, 0);
    body.weights.push(1, 0, 0, 0);
    body.uv.push(0.5, f);
    body.faceMask.push(0);
    inseam.push(id);
  }
  const leftBelt = [front, ...inseam, ...belt.slice(n / 2)];
  const rightBelt = [...belt.slice(0, n / 2 + 1), ...inseam.slice().reverse()];
  return {
    sleeve(arm, side) {
      uncapped(body, arm);
      const hole = shoulders[side < 0 ? 0 : 1],
        sleeve = ring(arm, arm.steps);
      stitch(body, [...sleeve, sleeve[0]], [...hole.rim, hole.rim[0]], [...hole.angles, 1]);
    },
    trouser(leg, side) {
      uncapped(body, leg);
      // Align the outside half of the leg to the equally wide lateral waist.
      // A different number of samples along the central inseam needs its own strip.
      const lower = ring(leg, leg.steps),
        upper = side < 0 ? leftBelt : rightBelt;
      const half = lower.length / 2,
        bend = side < 0 ? 1 + inseam.length : n / 2;
      const seam = [...upper.slice(0, bend + 1)],
        outer = [...upper.slice(bend), upper[0]];
      stitch(body, lower.slice(0, half + 1), seam);
      stitch(body, [...lower.slice(half), lower[0]], outer);
    },
  };
}
