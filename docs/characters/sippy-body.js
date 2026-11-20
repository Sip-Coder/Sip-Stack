// One indexed skin, from the short neck through the pelvis to both ankles
// and out to the fingertips. The two armscyes and the crotch share their
// boundary vertices with the torso. Only the wrist uses a nonuniform ring:
// it joins the small isosurface used to sculpt the opposing thumb and grip.
import * as T from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';

const tau = 2 * Math.PI;
const mix = T.MathUtils.lerp;
const clamp = T.MathUtils.clamp;
const vector = () => new T.Vector3();
const corners = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const chestShape = [
  // y above chest, half-width, depth, spinal offset
  [-0.133, 0.07, 0.044, -0.004],
  [-0.099, 0.071, 0.049, -0.004],
  [-0.056, 0.07, 0.052, 0.001],
  [-0.014, 0.07, 0.053, 0.002],
  [0.03, 0.073, 0.054, 0.002],
  [0.07, 0.077, 0.053, 0.001],
  [0.1, 0.077, 0.05, -0.001],
  [0.112, 0.08, 0.049, -0.002],
  [0.125, 0.081, 0.047, -0.002],
  [0.14, 0.079, 0.043, -0.002],
  [0.15, 0.072, 0.039, -0.002],
  [0.158, 0.054, 0.03, -0.001],
  [0.167, 0.029, 0.021, 0],
  [0.177, 0.02, 0.0185, 0.0008],
  [0.195, 0.019, 0.0185, 0.0015],
  [0.211, 0.021, 0.02, 0.003],
  [0.214, 0.016, 0.015, 0.003],
];
const armShape = [
  [-0.315, 0.014, 0.014, 0.001],
  [-0.3, 0.016, 0.016, 0.001],
  [-0.275, 0.017, 0.019, 0.001],
  [-0.246, 0.019, 0.02, 0.001],
  [-0.213, 0.02, 0.022, 0.001],
  [-0.188, 0.02, 0.022, 0],
  [-0.176, 0.019, 0.021, 0.002],
  [-0.165, 0.02, 0.021, 0],
  [-0.145, 0.02, 0.022, 0.001],
  [-0.118, 0.021, 0.023, 0.001],
  [-0.093, 0.023, 0.025, 0],
  [-0.071, 0.024, 0.026, 0],
];
const legShape = [
  [-0.467, 0.02, 0.024, 0.002],
  [-0.447, 0.021, 0.025, 0.001],
  [-0.423, 0.02, 0.022, -0.001],
  [-0.397, 0.021, 0.025, -0.004],
  [-0.367, 0.023, 0.028, -0.005],
  [-0.34, 0.025, 0.03, -0.005],
  [-0.305, 0.025, 0.028, -0.004],
  [-0.278, 0.023, 0.025, -0.001],
  [-0.255, 0.024, 0.026, 0.002],
  [-0.244, 0.024, 0.028, 0.004],
  [-0.229, 0.025, 0.027, 0.002],
  [-0.199, 0.026, 0.03, 0],
  [-0.168, 0.028, 0.032, -0.001],
  [-0.133, 0.03, 0.034, -0.002],
  [-0.094, 0.033, 0.035, -0.002],
];

function fingers() {
  const digits = [];
  for (let j = 0; j < 4; j++) {
    const z = 0.0143 - j * 0.0096,
      l = [0.02, 0.025, 0.023, 0.017][j],
      b = -0.03 + 0.002 * Math.abs(j - 1),
      x = 0.006 - 0.0015 * Math.abs(j - 1),
      r = 0.0048 - 0.00035 * Math.abs(j - 1);
    digits.push({
      points: [
        [x, b + 0.004, z],
        [x + 0.001, b - 0.005, z - 0.0005],
        [x - 0.0007, b - l * 0.52, z + 0.0002],
        [x - 0.0046, b - l * 0.84, z + 0.0016],
        [x - (0.011 + 0.001 * j), b - l * 0.98, z + 0.0052],
      ],
      radius: r,
    });
  }
  digits.push({
    points: [
      [-0.009, -0.01, 0.006],
      [-0.015, -0.014, 0.017],
      [-0.017, -0.021, 0.026],
      [-0.013, -0.028, 0.029],
      [-0.006, -0.03, 0.027],
    ],
    radius: 0.0063,
  });
  return digits;
}

const digits = fingers();
const palm = [
  [-0.041, 0.009, 0.013, 0.001],
  [-0.033, 0.016, 0.019, 0],
  [-0.02, 0.017, 0.021, 0.002],
  [-0.008, 0.016, 0.018, 0.001],
  [0.008, 0.014, 0.014, 0.001],
];

function handField(x, y, z) {
  let d = 1;
  if (y > -0.046) {
    let j = 0;
    while (j + 2 < palm.length && y > palm[j + 1][0]) j++;
    const a = palm[j],
      b = palm[j + 1],
      t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const rx = mix(a[1], b[1], t),
      rz = mix(a[2], b[2], t),
      cz = mix(a[3], b[3], t);
    d = Math.max((Math.hypot(x / rx, (z - cz) / rz) - 1) * Math.min(rx, rz), palm[0][0] - y);
  }
  if (y < -0.003)
    for (const finger of digits) {
      let fd = 1;
      for (let j = 1; j < finger.points.length; j++) {
        const a = finger.points[j - 1],
          b = finger.points[j],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          dz = b[2] - a[2],
          t = clamp(
            ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz),
            0,
            1,
          );
        const r = finger.radius * mix(1.07, 0.72, (j - 1 + t) / (finger.points.length - 1));
        fd = Math.min(
          fd,
          Math.hypot(
            x - a[0] - dx * t,
            y - a[1] - dy * t,
            (z - a[2] - dz * t) * (finger === digits[4] ? 1 : 1.32),
          ) - r,
        );
      }
      const k = 0.00025 + 0.00175 * T.MathUtils.smoothstep(y, -0.044, -0.033),
        h = Math.max(0, k - Math.abs(fd - d));
      d = Math.min(fd, d) - (h * h) / (4 * k);
    }
  return d;
}

// Sample only the fingers at sculpt resolution. A horizontal slice at the
// wrist supplies a single ordered ring that the forearm can sew directly.
function sculptHand(step) {
  const limits = [
    [-0.027, 0.025],
    [-0.062, 0.005],
    [-0.024, 0.039],
  ];
  const axes = limits.map(([a, b]) => {
    const n = Math.ceil((b - a) / step);
    return Array.from({ length: n + 1 }, (_, i) => mix(a, b, i / n));
  });
  const [xs, ys, zs] = axes,
    nx = xs.length,
    ny = ys.length,
    plane = nx * ny;
  const field = new Float32Array(plane * zs.length),
    pos = [],
    indices = [],
    ring = [],
    cache = new Map();
  for (let k = 0; k < zs.length; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) field[k * plane + j * nx + i] = handField(xs[i], ys[j], zs[k]);
  const cornerId = new Int32Array(8),
    points = new Int32Array(12);
  for (let k = 0; k < zs.length - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let n = 0; n < 8; n++) {
          const [a, b, c] = corners[n],
            id = (k + c) * plane + (j + b) * nx + i + a;
          cornerId[n] = id;
          if (field[id] < 0) inside |= 1 << n;
        }
        const mask = edgeTable[inside];
        if (!mask) continue;
        for (let e = 0; e < 12; e++)
          if (mask & (1 << e)) {
            const [v, w] = edges[e],
              ca = corners[v],
              cb = corners[w],
              ia = cornerId[v],
              ib = cornerId[w];
            const id = Math.min(ia, ib) * 3 + (ca[0] !== cb[0] ? 0 : ca[1] !== cb[1] ? 1 : 2);
            let q = cache.get(id);
            if (q === undefined) {
              const t = clamp(field[ia] / (field[ia] - field[ib]), 0.0003, 0.9997);
              q = pos.length;
              pos.push([
                mix(xs[i + ca[0]], xs[i + cb[0]], t) * 1.14,
                mix(ys[j + ca[1]], ys[j + cb[1]], t) * 1.06,
                mix(zs[k + ca[2]], zs[k + cb[2]], t) * 1.14,
              ]);
              if (j + ca[1] === ny - 1 && j + cb[1] === ny - 1) ring.push(q);
              cache.set(id, q);
            }
            points[e] = q;
          }
        for (let q = inside * 16; triTable[q] !== -1; q += 3)
          indices.push(points[triTable[q]], points[triTable[q + 2]], points[triTable[q + 1]]);
      }
  return { pos, indices, ring };
}

function orientedRing(indices, points) {
  let x = 0,
    z = 0;
  for (const i of indices) {
    x += points[i][0];
    z += points[i][2];
  }
  x /= indices.length;
  z /= indices.length;
  return indices
    .map((i) => ({ i, u: (Math.atan2(points[i][0] - x, points[i][2] - z) / tau + 1) % 1 }))
    .sort((a, b) => a.u - b.u);
}

// Sew two rings with unequal vertex counts by marching through ordered
// polar angles. Every edge has two neighbours, including the wrist seam.
function sew(bottom, top, tri) {
  let i = 0,
    j = 0;
  while (i < bottom.length || j < top.length) {
    const a = bottom[i % bottom.length].i,
      b = top[j % top.length].i;
    const na = i < bottom.length ? (i + 1 === bottom.length ? 1 + bottom[0].u : bottom[i + 1].u) : Infinity;
    const nb = j < top.length ? (j + 1 === top.length ? 1 + top[0].u : top[j + 1].u) : Infinity;
    if (na < nb) {
      tri(a, bottom[(i + 1) % bottom.length].i, b);
      i++;
    } else {
      tri(a, top[(j + 1) % top.length].i, b);
      j++;
    }
  }
}

function bendFrames(rig, side, leg, levels, bones) {
  const upper = rig[(leg ? 'thigh' : 'upperArm') + side],
    lower = rig[(leg ? 'shin' : 'forearm') + side],
    down = new T.Vector3(0, -1, 0),
    d = vector(),
    cross = vector(),
    swing = new T.Quaternion(),
    twist = new T.Quaternion(),
    axial = new T.Quaternion();
  const frames = levels.map(([y]) => {
    const b = new T.Bone();
    b.position.y = y;
    upper.add(b);
    bones.push(b);
    return b;
  });
  return {
    frames,
    update() {
      d.copy(down).applyQuaternion(lower.quaternion);
      const ay = Math.acos(clamp(-d.y, -1, 1)),
        tan = Math.tan(ay * 0.5),
        pivot = lower.position.y,
        radius = Math.min(
          leg ? 0.082 : 0.054,
          (0.94 * Math.min(-pivot, pivot - (leg ? -0.474 : -0.322))) / Math.max(0.001, tan),
        ),
        band = Math.max(0.00001, radius * tan);
      cross.set(d.x, 0, d.z).normalize();
      swing.setFromUnitVectors(down, d);
      twist.copy(swing).invert().multiply(lower.quaternion);
      for (let i = 0; i < levels.length; i++) {
        const y = levels[i][0],
          t = clamp((pivot + band - y) / (2 * band), 0, 1),
          b = frames[i];
        b.quaternion.identity().slerp(swing, t).multiply(axial.identity().slerp(twist, t));
        if (t === 1) b.position.copy(d).multiplyScalar(pivot - y).y += pivot;
        else if (t > 0) {
          b.position.copy(cross).multiplyScalar(radius * (1 - Math.cos(ay * t)));
          b.position.y = pivot + band - radius * Math.sin(ay * t);
        } else b.position.set(0, y, 0);
      }
    },
  };
}

export function makeSippyBody(rig, skin) {
  const bones = [rig.chest, rig.hips, rig.handL, rig.handR],
    frames = {},
    updates = [];
  for (const side of ['L', 'R'])
    for (const leg of [false, true]) {
      const key = (leg ? 'leg' : 'arm') + side;
      const first = bones.length,
        result = bendFrames(rig, side, leg, leg ? legShape : armShape, bones);
      frames[key] = first;
      updates.push(result.update);
    }
  function build(mobile) {
    const n = mobile ? 24 : 40,
      hand = sculptHand(mobile ? 0.00315 : 0.00235),
      pos = [],
      skinIndices = [],
      weights = [],
      index = [],
      regions = { legs: [], shoulders: [], torso: [], neck: [], distalArms: [] };
    let region = 'torso';
    const hips = { interior: [], fork: [], trunk: [] },
      caps = [];
    function vertex(x, y, z, j = 0, k = j, t = 0) {
      pos.push([x, y, z]);
      skinIndices.push(j, k, 0, 0);
      weights.push(1 - t, t, 0, 0);
      return pos.length - 1;
    }
    function tri(a, b, c) {
      regions[region].push(index.length / 3);
      index.push(a, b, c);
    }
    function quad(a, b, c, d) {
      tri(a, b, c);
      tri(b, d, c);
    }
    const band = (a, b) => {
      for (let j = 0; j < n; j++) quad(a[j], a[(j + 1) % n], b[j], b[(j + 1) % n]);
    };
    function ellipse(x, y, z, rx, rz, bone, omit) {
      return Array.from({ length: n }, (_, j) =>
        omit?.(j)
          ? -1
          : vertex(x + rx * Math.sin((tau * j) / n), y, z + rz * Math.cos((tau * j) / n), bone),
      );
    }
    const lo = 7,
      hi = 10,
      span = n === 40 ? 4 : 2;
    const trunk = chestShape.map(([y, rx, rz, z], row) =>
      ellipse(
        0,
        0.64 + y,
        z,
        rx,
        rz,
        0,
        (j) => row > lo && row < hi && (Math.abs(j - n / 4) < span || Math.abs(j - (3 * n) / 4) < span),
      ),
    );
    for (let r = 0; r < trunk.length - 1; r++)
      for (let j = 0; j < n; j++) {
        const hole =
          r >= lo && r < hi && (Math.abs(j + 0.5 - n / 4) < span || Math.abs(j + 0.5 - (3 * n) / 4) < span);
        if (hole) continue;
        region = r >= 13 ? 'neck' : r >= lo ? 'shoulders' : 'torso';
        quad(trunk[r][j], trunk[r][(j + 1) % n], trunk[r + 1][j], trunk[r + 1][(j + 1) % n]);
      }
    region = 'neck';
    const crown = vertex(0, 0.855, 0.003);
    for (let j = 0; j < n; j++) tri(trunk.at(-1)[j], trunk.at(-1)[(j + 1) % n], crown);
    // Two lower openings share a sagittal raphe running from the pubis
    // to the sacrum. The legs meet through one continuous perineal fold.
    const crotch = [trunk[0][0]];
    for (let j = 1; j < n / 2; j++) {
      const a = (tau * j) / n;
      crotch.push(vertex(0, 0.507 - 0.025 * Math.sin(a), -0.004 + 0.044 * Math.cos(a), 0));
    }
    crotch.push(trunk[0][n / 2]);
    for (const [sgn, side] of [
      [1, 'L'],
      [-1, 'R'],
    ]) {
      const ox = rig['upperArm' + side].position.x,
        legX = rig['thigh' + side].position.x,
        armBone = frames['arm' + side],
        legBone = frames['leg' + side],
        handBone = side === 'L' ? 2 : 3;
      region = 'legs';
      const legs = legShape.map(([y, rx, rz, z], r) => ellipse(legX, 0.52 + y, z, rx, rz, legBone + r));
      for (let r = 0; r < legs.length - 1; r++) band(legs[r], legs[r + 1]);
      const foot = vertex(legX, 0.051, 0.002, legBone);
      for (let j = 0; j < n; j++) tri(foot, legs[0][(j + 1) % n], legs[0][j]);
      const fork = Array.from({ length: n }, (_, j) =>
        sgn === 1 ? (j <= n / 2 ? trunk[0][j] : crotch[n - j]) : j <= n / 2 ? crotch[j] : trunk[0][j],
      );
      let previous = legs.at(-1);
      for (const sample of [0, 3, 6, 9, 12]) {
        const ring = Array.from({ length: n }, (_, j) => {
          const a = (tau * j) / n,
            i = vertex(legX + 0.034 * Math.sin(a), 0.47 + 0.005 * sample, -0.003 + 0.034 * Math.cos(a));
          hips.interior.push({ i, side, sample, u: j / n });
          return i;
        });
        band(previous, ring);
        previous = ring;
      }
      band(previous, fork);
      for (let j = 0; j < n; j++)
        hips.fork.push({ i: fork[j], side, u: j / n, inner: sgn * Math.sin((tau * j) / n) < -0.0001 });

      const arms = armShape.map(([y, rx, rz, z], r) => ellipse(ox, 0.785 + y, z, rx, rz, armBone + r));
      for (let r = 0; r < arms.length - 1; r++) {
        region = armShape[r][0] < -0.174 ? 'distalArms' : 'shoulders';
        band(arms[r], arms[r + 1]);
      }
      region = 'shoulders';
      const centre = sgn === 1 ? n / 4 : (3 * n) / 4,
        a = centre - span,
        b = centre + span,
        hole = [];
      // Traversing the removed trunk patch in its original outward winding
      // also fixes the orientation of the entire shoulder bridge.
      for (let j = a; j < b; j++) hole.push(trunk[lo][j]);
      for (let r = lo; r < hi; r++) hole.push(trunk[r][b]);
      for (let j = b; j > a; j--) hole.push(trunk[hi][j]);
      for (let r = hi; r > lo; r--) hole.push(trunk[r][a]);
      // Parameter theta runs around the shoulder axis (out, down) rather
      // than around the body's up axis. The front point corresponds to the
      // front of the armscye. A shared middle ring rounds the deltoid.
      const yc = 0.64 + (chestShape[lo][0] + chestShape[hi][0]) / 2,
        zc = -0.002;
      const shoulder = hole
        .map((i) => ({ i, u: (Math.atan2(sgn * (pos[i][1] - yc), pos[i][2] - zc) / tau + 1) % 1 }))
        .sort((p, q) => p.u - q.u);
      let previousCap = arms.at(-1).map((i, j) => ({ i, u: j / n }));
      for (let row = 10; row >= 0; row--) {
        const f = row / 10,
          ring = Array.from({ length: n }, (_, j) => {
            const a = (tau * j) / n,
              i = vertex(
                sgn * mix(0.092, 0.148, f) + 0.008 * Math.sin(a),
                0.769 + sgn * 0.011 * Math.sin(a),
                -0.002 + 0.015 * Math.cos(a),
              );
            return { i, u: j / n };
          });
        caps.push({ side, sgn, row, ring });
        sew(previousCap, ring, tri);
        previousCap = ring;
      }
      sew(previousCap, shoulder, tri);

      region = 'distalArms';
      const base = pos.length;
      for (const [x, y, z] of hand.pos) vertex(ox + sgn * x, 0.466 + y, z, handBone);
      for (let j = 0; j < hand.indices.length; j += 3) {
        const a = hand.indices[j],
          b = hand.indices[j + 1],
          c = hand.indices[j + 2];
        tri(base + a, base + (sgn === 1 ? b : c), base + (sgn === 1 ? c : b));
      }
      const cut = orientedRing(
        hand.ring.map((i) => base + i),
        pos,
      );
      sew(
        cut,
        arms[0].map((i, j) => ({ i, u: j / n })),
        tri,
      );
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos.flat(), 3).setUsage(T.DynamicDrawUsage));
    g.setIndex(index);
    const uv = new Float32Array(pos.length * 2);
    for (let i = 0; i < pos.length; i++) {
      const [x, y, z] = pos[i];
      uv[2 * i] = Math.atan2(x, z) / tau + 0.5;
      uv[2 * i + 1] = y;
    }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndices, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    for (let i = 1; i < 7; i++)
      for (let j = 0; j < n; j++) hips.trunk.push({ i: trunk[i][j], y: chestShape[i][0] });
    // Recalculate only the portions which slide on the pelvis and turn in
    // the armscyes. Rigid hand detail and the axial limb normals stay on
    // their bones and do not need to be regenerated every simulation tick.
    const moving = new Set(
      [...hips.trunk, ...hips.interior, ...hips.fork, ...caps.flatMap((c) => c.ring)].map((p) => p.i),
    );
    const faces = [];
    for (let j = 0; j < index.length; j += 3)
      if (moving.has(index[j]) || moving.has(index[j + 1]) || moving.has(index[j + 2]))
        faces.push(index[j] * 3, index[j + 1] * 3, index[j + 2] * 3);
    const offsets = Uint32Array.from(moving, (i) => i * 3),
      touched = new Uint8Array(pos.length);
    for (const i of moving) touched[i] = 1;
    return { g, regions, hips, caps, faces: Uint32Array.from(faces), offsets, touched };
  }
  const high = build(false),
    mobile = build(true),
    mesh = new T.SkinnedMesh(high.g, skin);
  mesh.name = 'Sippy continuous anatomical skin';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  rig.root.add(mesh);
  rig.root.updateMatrixWorld(true);
  mesh.bind(new T.Skeleton(bones));
  mesh.userData.mobileGeometry = mobile.g;
  const seats = rig.garments?.surfaces;
  const centers = { L: new Float64Array(45), R: new Float64Array(45) },
    buffers = { L: null, R: null };
  const sides = ['L', 'R'],
    hipRows = [0, 3, 6, 9, 12, 14],
    sample = vector();
  function posePelvis({ g, hips }) {
    if (!seats?.['trousers-L']?.[1]) return;
    const p = g.attributes.position,
      around = rig.garments.hips?.columns ?? seats['trousers-L'][1].geometry.attributes.position.count / 30;
    let waistY = 0;
    for (const side of sides) {
      const buff = seats['trousers-' + side][1].geometry.attributes.position;
      buffers[side] = buff;
      const c = centers[side];
      for (const row of hipRows) {
        const base = row * around,
          k = row * 3;
        let x = 0,
          y = 0,
          z = 0;
        for (let j = 0; j < around; j++) {
          x += buff.getX(base + j);
          y += buff.getY(base + j);
          z += buff.getZ(base + j);
        }
        c[k] = x / around;
        c[k + 1] = y / around;
        c[k + 2] = z / around;
      }
      waistY += buff.getY(14 * around) * 0.5;
    }
    function section(point, row, shrink) {
      const buff = buffers[point.side],
        base = row * around,
        u = point.u * around,
        j = Math.floor(u) % around,
        k = (j + 1) % around,
        t = u % 1,
        center = centers[point.side],
        k0 = 3 * row,
        x = mix(buff.getX(base + j), buff.getX(base + k), t),
        y = mix(buff.getY(base + j), buff.getY(base + k), t),
        z = mix(buff.getZ(base + j), buff.getZ(base + k), t);
      return sample.set(
        mix(center[k0], x, shrink),
        mix(center[k0 + 1], y, shrink),
        mix(center[k0 + 2], z, shrink),
      );
    }
    for (const point of hips.interior) {
      const { x, y, z } = section(point, point.sample, 0.62);
      const sign = point.side === 'L' ? 1 : -1,
        medial = Math.max(0, -sign * Math.sin(tau * point.u)),
        rise = T.MathUtils.smoothstep(point.sample, 3, 12) * medial;
      p.setXYZ(point.i, x + sign * 0.012 * rise, 0.64 + y + 0.018 * rise, z);
    }
    for (const point of hips.fork) {
      const b = buffers[point.side],
        u = point.u * around,
        j = Math.floor(u) % around,
        t = u % 1,
        edge = mix(b.getY(14 * around + j), b.getY(14 * around + ((j + 1) % around)), t);
      const a = point.u * tau;
      const px = point.inner ? 0 : 0.068 * Math.sin(a);
      p.setXYZ(
        point.i,
        px,
        0.64 + edge + 0.0085 + (point.inner ? 0.028 * Math.abs(Math.sin(a)) : 0),
        -0.002 + 0.04 * Math.cos(a),
      );
    }
    // The iliac crest and abdomen slide under the waistband as the hips
    // fold. The rib cage stays with the chest above the floating ribs.
    const low = chestShape[0][0],
      lift = waistY + 0.0085 - low;
    for (const point of hips.trunk) {
      const y = point.y + lift * clamp((0.09 - point.y) / (0.09 - low), 0, 1);
      p.setY(point.i, 0.64 + y);
    }
    p.needsUpdate = true;
  }
  function poseShoulders({ g, caps }) {
    for (const cap of caps) {
      const m = seats?.['shoulder-' + cap.side]?.[0];
      if (!m) continue;
      const cloth = m.geometry.attributes.position,
        uv = m.geometry.attributes.uv;
      const spans = 10,
        n = cloth.count / (2 * (spans + 1)),
        start = n * cap.row;
      // The chest-side armscye turns outward, then down the upper arm.
      // Follow that continuous posed section, retaining the anatomical
      // front meridian, even in the rotated overhead and sniff poses.
      if (cap.source !== m.geometry) {
        cap.source = m.geometry;
        cap.samples = cap.ring.map(({ u }) => {
          const a = cap.sgn < 0 ? (1 - u) % 1 : u;
          let j = 0;
          while (j + 1 < n && uv.getY(j + 1) <= a) j++;
          const k = (j + 1) % n,
            hi = k ? uv.getY(k) : 1;
          return [start + j, start + k, (a - uv.getY(j)) / (hi - uv.getY(j))];
        });
      }
      let x = 0,
        y = 0,
        z = 0;
      for (const [i, j, t] of cap.samples) {
        x += mix(cloth.getX(i), cloth.getX(j), t);
        y += mix(cloth.getY(i), cloth.getY(j), t);
        z += mix(cloth.getZ(i), cloth.getZ(j), t);
      }
      const inv = 1 / cap.samples.length;
      x *= inv;
      y *= inv;
      z *= inv;
      for (let l = 0; l < cap.samples.length; l++) {
        const [i, j, t] = cap.samples[l],
          radius = 0.46;
        g.attributes.position.setXYZ(
          cap.ring[l].i,
          mix(x, mix(cloth.getX(i), cloth.getX(j), t), radius),
          0.64 + mix(y, mix(cloth.getY(i), cloth.getY(j), t), radius),
          mix(z, mix(cloth.getZ(i), cloth.getZ(j), t), radius),
        );
      }
    }
  }
  function updateNormals({ g, faces, offsets, touched }) {
    const p = g.attributes.position.array,
      norm = g.attributes.normal,
      n = norm.array;
    for (const i of offsets) n[i] = n[i + 1] = n[i + 2] = 0;
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i],
        b = faces[i + 1],
        c = faces[i + 2],
        x1 = p[b] - p[a],
        y1 = p[b + 1] - p[a + 1],
        z1 = p[b + 2] - p[a + 2],
        x2 = p[c] - p[a],
        y2 = p[c + 1] - p[a + 1],
        z2 = p[c + 2] - p[a + 2],
        x = y1 * z2 - z1 * y2,
        y = z1 * x2 - x1 * z2,
        z = x1 * y2 - y1 * x2;
      for (let j = i; j < i + 3; j++) {
        const k = faces[j];
        if (!touched[k / 3]) continue;
        n[k] += x;
        n[k + 1] += y;
        n[k + 2] += z;
      }
    }
    for (const i of offsets) {
      const inv = 1 / (Math.sqrt(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2]) || 1);
      n[i] *= inv;
      n[i + 1] *= inv;
      n[i + 2] *= inv;
    }
    norm.needsUpdate = true;
  }
  return {
    mesh,
    regions: high.regions,
    update() {
      for (const fn of updates) fn();
      const shape = mesh.geometry === mobile.g ? mobile : high;
      posePelvis(shape);
      poseShoulders(shape);
      updateNormals(shape);
    },
  };
}
