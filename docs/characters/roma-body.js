// A single isosurface joins Roma's anatomical sections, including the webs of
// the fingers and the crotch. The same smooth contours generate both skin LODs.
import * as T from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';

const smooth = T.MathUtils.smoothstep;

// Cross sections follow each limb's centre line. The asymmetric offsets shape
// the heel of the palm, the kneecap and the posterior belly of each calf.
const trunk = [
  [0.484, 0.024, 0.021, 0, 0],
  [0.495, 0.061, 0.039, 0, -0.003],
  [0.519, 0.079, 0.049, 0, -0.003],
  [0.553, 0.073, 0.047, 0, -0.002],
  [0.591, 0.069, 0.044, 0, 0],
  [0.627, 0.071, 0.045, 0, 0.001],
  [0.663, 0.081, 0.05, 0, 0.002],
  [0.696, 0.092, 0.057, 0, 0.003],
  [0.729, 0.093, 0.055, 0, 0.004],
  [0.751, 0.093, 0.048, 0, 0.001],
  [0.771, 0.099, 0.041, 0, -0.001],
  [0.782, 0.089, 0.037, 0, -0.002],
  [0.792, 0.057, 0.031, 0, -0.001],
  [0.804, 0.032, 0.025, 0, 0],
  [0.822, 0.027, 0.025, 0, 0.001],
  [0.842, 0.027, 0.024, 0, 0.002],
  [0.85, 0.019, 0.016, 0, 0.002],
];
const leg = [
  [0.035, 0.016, 0.017, 0.065, -0.003],
  [0.06, 0.019, 0.019, 0.065, 0.001],
  [0.099, 0.02, 0.021, 0.064, 0],
  [0.145, 0.025, 0.027, 0.063, -0.004],
  [0.192, 0.033, 0.035, 0.065, -0.006],
  [0.221, 0.031, 0.033, 0.066, -0.005],
  [0.249, 0.026, 0.028, 0.066, -0.001],
  [0.268, 0.026, 0.027, 0.065, 0.002],
  [0.28, 0.028, 0.029, 0.065, 0.003],
  [0.301, 0.028, 0.03, 0.065, 0.001],
  [0.34, 0.031, 0.035, 0.063, -0.001],
  [0.381, 0.037, 0.04, 0.064, -0.001],
  [0.426, 0.04, 0.043, 0.064, 0],
  [0.46, 0.042, 0.044, 0.064, 0],
  [0.486, 0.044, 0.044, 0.064, 0],
  [0.51, 0.042, 0.043, 0.061, -0.001],
  [0.523, 0.037, 0.039, 0.059, -0.002],
  [0.542, 0.026, 0.027, 0.052, -0.002],
];
const arm = [
  [0.454, 0.013, 0.012, 0.13, 0],
  [0.472, 0.016, 0.012, 0.13, 0],
  [0.505, 0.017, 0.015, 0.13, -0.001],
  [0.545, 0.022, 0.021, 0.13, 0.001],
  [0.575, 0.023, 0.022, 0.13, 0.001],
  [0.599, 0.02, 0.021, 0.13, -0.001],
  [0.612, 0.02, 0.021, 0.13, -0.002],
  [0.633, 0.021, 0.022, 0.13, -0.001],
  [0.679, 0.025, 0.026, 0.13, 0.001],
  [0.72, 0.026, 0.027, 0.13, 0],
  [0.755, 0.03, 0.031, 0.129, 0],
  [0.777, 0.031, 0.031, 0.123, 0.001],
  [0.786, 0.031, 0.029, 0.115, 0],
  [0.793, 0.027, 0.024, 0.108, -0.001],
  [0.798, 0.018, 0.017, 0.101, 0],
];
const palm = [
  [0.41, 0.012, 0.007, 0.131, 0.008],
  [0.419, 0.021, 0.009, 0.13, 0.006],
  [0.433, 0.023, 0.013, 0.13, 0.004],
  [0.448, 0.022, 0.014, 0.13, 0.002],
  [0.46, 0.015, 0.011, 0.13, 0],
  [0.474, 0.012, 0.01, 0.13, 0],
];

const fingers = [];
const nails = [];
for (let k = 0; k < 4; k++) {
  const beside = (k - 1.5) * 0.0102,
    length = [0.031, 0.036, 0.033, 0.026][k];
  const stations = [],
    top = 0.424 + (k === 3 ? 0.002 : 0);
  for (const [t, radius, depth] of [
    [0, 0.005, 0.006],
    [0.17, 0.0051, 0.006],
    [0.38, 0.0042, 0.005],
    [0.48, 0.00465, 0.0056],
    [0.66, 0.0038, 0.0047],
    [0.77, 0.0041, 0.0048],
    [0.88, 0.0037, 0.0044],
    [0.97, 0.0028, 0.0035],
    [1.02, 0.0007, 0.001],
  ]) {
    const x = 0.13 + beside * (1 + 0.19 * t),
      z = 0.005 + 0.012 * t * t;
    stations.push([top - length * t, radius, depth, x, z]);
    if (t === 0.88) nails.push([x, top - length * t, z - depth, 0.0057, 0.0066, -0.49]);
  }
  fingers.push(stations.reverse());
}
const thumb = [
  [0.421, 0.001, 0.001, 0.101, 0.022],
  [0.424, 0.0036, 0.0045, 0.101, 0.02],
  [0.43, 0.0053, 0.006, 0.103, 0.016],
  [0.438, 0.006, 0.0068, 0.106, 0.012],
  [0.446, 0.008, 0.007, 0.111, 0.009],
  [0.451, 0.007, 0.008, 0.116, 0.006],
  [0.456, 0.005, 0.006, 0.121, 0.003],
];
fingers.push(thumb);
nails.push([0.102, 0.426, 0.0155, 0.006, 0.007, -0.55]);

// Monotone cubic profiles round the transition at anatomical landmarks without
// introducing the overshoot of an unconstrained interpolating spline.
function section(rows, y) {
  if (y < rows[0][0] || y > rows[rows.length - 1][0]) return null;
  let i = 1;
  while (i < rows.length - 1 && y > rows[i][0]) i++;
  const a = rows[i - 1],
    b = rows[i],
    prev = rows[Math.max(0, i - 2)],
    next = rows[Math.min(rows.length - 1, i + 1)];
  const h = b[0] - a[0],
    t = (y - a[0]) / h,
    t2 = t * t,
    t3 = t2 * t,
    out = [];
  for (let j = 1; j < 5; j++) {
    const sec = (b[j] - a[j]) / h;
    let da = prev === a ? sec : (a[j] - prev[j]) / (a[0] - prev[0]);
    let db = next === b ? sec : (next[j] - b[j]) / (next[0] - b[0]);
    da = da * sec > 0 ? (2 * da * sec) / (da + sec) : 0;
    db = db * sec > 0 ? (2 * db * sec) / (db + sec) : 0;
    out.push(
      (2 * t3 - 3 * t2 + 1) * a[j] +
        (t3 - 2 * t2 + t) * h * da +
        (-2 * t3 + 3 * t2) * b[j] +
        (t3 - t2) * h * db,
    );
  }
  return out;
}
function distance(s, x, z) {
  if (!s) return 1;
  const dx = (x - s[2]) / s[0],
    dz = (z - s[3]) / s[1];
  return (Math.sqrt(dx * dx + dz * dz) - 1) * Math.min(s[0], s[1]);
}
function join(a, b, r) {
  const h = Math.max(0, r - Math.abs(a - b));
  return Math.min(a, b) - (h * h) / (4 * r);
}
function axis(lo, hi, step) {
  const values = [lo];
  for (let a = lo; a < hi - 1e-7; ) {
    a = Math.min(hi, a + step(a));
    values.push(a);
  }
  return values;
}

const jointNames = [
  'hips',
  'chest',
  'upperArmL',
  'forearmL',
  'handL',
  'thighL',
  'shinL',
  'footL',
  'upperArmR',
  'forearmR',
  'handR',
  'thighR',
  'shinR',
  'footR',
];
const edgeEnds = [
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

function sculpt(detail, coat = false) {
  // Retain extra samples across the armhole's curved panel even on Mobile:
  // a long triangle otherwise bridges its folded contour when the arm lifts.
  const xs = axis(-0.232, 0.232, (x) => {
    const side = Math.abs(x);
    if (side > 0.143 && side < 0.214) return 0.0028 * Math.min(detail, 1.12);
    if (detail > 1.5 && side > 0.084 && side <= 0.143) return 0.0054;
    return 0.0062 * detail;
  });
  const ys = axis(0.031, 0.854, (y) => {
    if (y > 0.382 && y < 0.475) return 0.0024 * Math.min(detail, 1.17);
    if (y > 0.738 && y < 0.817) return 0.0034 * Math.min(detail, 1.35);
    if (detail > 1.5 && y > 0.686 && y <= 0.738) return 0.0055;
    return 0.006 * detail;
  });
  const zs = axis(-0.074, 0.091, (z) => {
    if (z > -0.018 && z < 0.029) return 0.0027 * Math.min(detail, 1.5);
    if (detail > 1.5 && z >= 0.029 && z < 0.048) return 0.0043;
    return 0.0055 * detail;
  });
  const nx = xs.length,
    ny = ys.length,
    nz = zs.length,
    plane = nx * ny;
  const field = new Float32Array(plane * nz),
    owner = new Uint8Array(field.length),
    skinRegion = [];
  for (let j = 0; j < ny; j++) {
    const y = ys[j],
      chest = section(trunk, y),
      upper = section(arm, coat ? y - 0.007 * smooth(y, 0.758, 0.792) : y),
      lower = section(leg, y),
      hand = section(palm, y);
    const digits = fingers.map((rows) => section(rows, y));
    const separation = 0.014 + 0.052 * (1 - smooth(y, 0.525, 0.677));
    const axilla = coat ? T.MathUtils.lerp(0.001, 0.03, smooth(y, 0.696, 0.749)) : y > 0.715 ? 0.02 : 0.001;
    for (let k = 0; k < nz; k++) {
      const z = zs[k],
        offset = k * plane + j * nx;
      for (let i = 0; i < nx; i++) {
        const x = Math.abs(xs[i]);
        let torso = distance(chest, x, z);
        if (chest && z > 0 && y > 0.745 && y < 0.793) {
          // A shallow clavicle ridge sweeps diagonally from the sternum.
          const ridge = (y - (0.766 + 0.099 * x)) / 0.0045;
          torso -=
            0.0021 * Math.exp(-ridge * ridge) * smooth(x, 0.014, 0.035) * (1 - smooth(x, 0.083, 0.101));
        }
        let lowerDist = distance(lower, x, z);
        if (lower && z > 0 && y > 0.246 && y < 0.298) {
          const px = (x - 0.065) / 0.015,
            py = (y - 0.273) / 0.012;
          lowerDist -= 0.0027 * Math.exp(-px * px - py * py);
        }
        let limb = join(distance(upper, x - separation, z), distance(hand, x - separation, z), 0.004);
        if (y > 0.386 && y < 0.46)
          for (let d = 0; d < digits.length; d++) {
            limb = join(
              limb,
              distance(digits[d], x - separation, z),
              0.0014 + 0.0018 * smooth(y, 0.416, 0.434),
            );
          }
        // Extra ease fuses the two facing walls at the axilla into one rounded
        // gusset before tessellation. This is the jacket's own pattern volume.
        if (coat) {
          torso -= 0.012;
          limb -= 0.0086;
        }
        const trunkAndLeg = join(torso, lowerDist, 0.01);
        const branch = limb < trunkAndLeg ? 1 : lowerDist < torso ? 2 : 0;
        owner[offset + i] = branch;
        field[offset + i] = join(trunkAndLeg, limb, axilla);
      }
    }
  }
  const pos = [],
    idx = [],
    skinIndex = [],
    weights = [],
    uv = [],
    regions = { legs: [], torso: [], distalArms: [], shoulders: [], neck: [] };
  const cache = new Map(),
    offsets = [0, 1, 1 + nx, nx, plane, plane + 1, plane + 1 + nx, plane + nx];
  const cube = new Int32Array(8),
    dist = new Float32Array(8),
    points = new Int32Array(12);
  function vertex(id0, id1, d0, d1) {
    const key = Math.min(id0, id1) * 3 + (Math.abs(id1 - id0) === 1 ? 0 : Math.abs(id1 - id0) === nx ? 1 : 2);
    let a = cache.get(key);
    if (a !== undefined) return a;
    const t = T.MathUtils.clamp(d0 / (d0 - d1), 0.009, 0.991),
      x0 = id0 % nx,
      y0 = Math.floor(id0 / nx) % ny,
      z0 = Math.floor(id0 / plane);
    const x = T.MathUtils.lerp(xs[x0], xs[id1 % nx], t),
      y = T.MathUtils.lerp(ys[y0], ys[Math.floor(id1 / nx) % ny], t);
    const z = T.MathUtils.lerp(zs[z0], zs[Math.floor(id1 / plane)], t),
      ax = Math.abs(x),
      side = x < 0 ? 6 : 0;
    let j0 = 0,
      j1 = 1,
      blend = smooth(y, 0.608, 0.668);
    // Shoulder skin shares the clavicular and humeral frames. The elbow and
    // knee transfer over a band on either side of the joint centre.
    const ownerID = owner[t < 0.5 ? id0 : id1];
    const isArm = ownerID === 1 || (y > 0.75 && y < 0.803 && ax > 0.083);
    skinRegion.push(isArm ? (y < 0.637 ? 1 : 2) : ownerID === 2 ? 3 : y > 0.8 ? 4 : 0);
    if (y > 0.672 && ax > 0.052 && y < 0.819 && (isArm || ax > 0.06)) {
      const rx = ax - 0.144,
        ry = y - 0.785,
        reach = Math.hypot(rx, ry);
      const angle = Math.atan2(ry, rx);
      const span = T.MathUtils.lerp(Math.PI / 2, 0.23, smooth(reach, 0.027, 0.125));
      const turn =
        angle < -Math.PI / 2
          ? smooth(angle, -Math.PI / 2 - span, -Math.PI / 2 - 0.04)
          : 1 - (angle + Math.PI / 2) / (1.5 * Math.PI);
      j0 = 1;
      j1 = 2 + side;
      blend = T.MathUtils.lerp(0.55, turn, smooth(reach, 0, 0.009));
    } else if (isArm && y > 0.514) {
      j0 = 3 + side;
      j1 = 2 + side;
      blend = smooth(y, 0.584, 0.635);
    } else if (isArm) {
      j0 = 4 + side;
      j1 = 3 + side;
      blend = smooth(y, 0.45, 0.485);
    } else if (ownerID === 2 || (y < 0.548 && ax > 0.027)) {
      if (y > 0.465) {
        j0 = 5 + side;
        j1 = 0;
        blend = smooth(y, 0.477, 0.546);
      } else if (y > 0.14) {
        j0 = 6 + side;
        j1 = 5 + side;
        blend = smooth(y, 0.246, 0.304);
      } else {
        j0 = 7 + side;
        j1 = 6 + side;
        blend = smooth(y, 0.041, 0.069);
      }
    }
    a = pos.length / 3;
    pos.push(isArm ? x - Math.sign(x) * 0.052 * (1 - smooth(y, 0.525, 0.677)) : x, y, z);
    skinIndex.push(j0, j1, 0, 0);
    weights.push(1 - blend, blend, 0, 0);
    uv.push(Math.atan2(x, z) / (2 * Math.PI) + 0.5, y);
    cache.set(key, a);
    return a;
  }
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const base = k * plane + j * nx + i;
        let bits = 0;
        for (let n = 0; n < 8; n++) {
          cube[n] = base + offsets[n];
          dist[n] = field[cube[n]];
          if (dist[n] < 0) bits |= 1 << n;
        }
        const mask = edgeTable[bits];
        if (!mask) continue;
        for (let e = 0; e < 12; e++)
          if (mask & (1 << e)) {
            const [q, r] = edgeEnds[e];
            points[e] = vertex(cube[q], cube[r], dist[q], dist[r]);
          }
        for (let l = bits * 16; triTable[l] !== -1; l += 3) {
          const a = points[triTable[l]],
            b = points[triTable[l + 2]],
            c = points[triTable[l + 1]];
          const tri = idx.length / 3;
          const region =
            skinRegion[a] === skinRegion[b] || skinRegion[a] === skinRegion[c]
              ? skinRegion[a]
              : skinRegion[b];
          if (region === 1) regions.distalArms.push(tri);
          else if (region === 3) regions.legs.push(tri);
          else if (region === 4) regions.neck.push(tri);
          else if (region === 2) regions.shoulders.push(tri);
          else regions.torso.push(tri);
          idx.push(a, b, c);
        }
      }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  g.userData.anatomicalRegions = Uint8Array.from(skinRegion);
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { g, regions };
}

export function makeRomaBody(rig, skin, nailMaterial) {
  const { g, regions } = sculpt(1),
    mesh = new T.SkinnedMesh(g, skin);
  mesh.name = 'Roma continuous anatomical skin';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  rig.root.add(mesh);
  rig.root.updateMatrixWorld(true);
  mesh.bind(new T.Skeleton(jointNames.map((name) => rig[name])));
  // The lower-resolution silhouette has the same joints, rest pose and shader.
  mesh.userData.mobileGeometry = sculpt(1.85).g;
  // Nails follow the rounded top of the distal phalanx. Their inset base and
  // tapered free edge leave the sculpted fingertip visible.
  const nailGeometry = new T.SphereGeometry(1, 14, 8);
  for (const [side, hand] of [
    [1, rig.handL],
    [-1, rig.handR],
  ])
    for (const [x, y, z, w, l, pitch] of nails) {
      const nail = new T.Mesh(nailGeometry, nailMaterial);
      nail.name = 'Roma nail plate';
      nail.position.set(side * (x - 0.13), y - 0.466, z);
      nail.rotation.x = pitch;
      nail.scale.set(w * 0.5, l * 0.5, 0.0011);
      hand.add(nail);
    }
  return { mesh, regions };
}

export function makeJacketPattern() {
  return { high: sculpt(1.15, true).g, mobile: sculpt(1.9, true).g };
}

// A curved fan of skinning frames follows the elbow, knee and shoulder through
// deep flexion. The intermediate rotations retain the joint's volume even when
// the hand travels completely over the head.
export function bindJointFans(rig, meshes) {
  const original = meshes[0].skeleton.bones,
    bones = [...original],
    fans = [],
    lookup = new Map();
  const identity = new T.Quaternion(),
    steps = 7;
  for (let child = 0; child < original.length; child++) {
    const node = original[child],
      parent = original.indexOf(node.parent);
    if (parent < 0) continue;
    const nodes = [parent],
      rest = node.position.clone();
    for (let k = 1; k < steps; k++) {
      const mid = new T.Bone();
      mid.name = node.name + ' bend ' + k;
      mid.position.copy(rest);
      node.parent.add(mid);
      nodes.push(bones.length);
      bones.push(mid);
      fans.push({ mid, node, t: k / steps, rest });
    }
    nodes.push(child);
    lookup.set(parent * 100 + child, nodes);
  }
  for (const mesh of meshes)
    for (const g of [mesh.geometry, mesh.userData.mobileGeometry]) {
      const indices = g.attributes.skinIndex,
        weights = g.attributes.skinWeight;
      const pos = g.attributes.position;
      for (let i = 0; i < indices.count; i++) {
        const px = pos.getX(i),
          ax = Math.abs(px),
          y = pos.getY(i),
          off = i * 4;
        if (
          !g.userData.chestAnchors?.has(i) &&
          y > 0.645 &&
          y < 0.819 &&
          ax > 0.058 &&
          (y > 0.669 || ax > 0.096)
        ) {
          const dx = ax - 0.144,
            dy = y - 0.785,
            reach = Math.hypot(dx, dy),
            angle = Math.atan2(dy, dx);
          const span = T.MathUtils.lerp(Math.PI / 2, 0.23, smooth(reach, 0.027, 0.125));
          const outer = 1 - (angle + Math.PI / 2) / (1.5 * Math.PI);
          const arc = angle < -Math.PI / 2 ? smooth(angle, -Math.PI / 2 - span, -Math.PI / 2 - 0.04) : outer;
          const gate = smooth(ax, 0.097, 0.111);
          let blend =
            dx >= 0
              ? T.MathUtils.lerp(arc, 1, smooth(reach, 0.06, 0.11))
              : T.MathUtils.lerp(gate, arc, smooth(y, 0.727, 0.779));
          blend = T.MathUtils.lerp(0.55, blend, smooth(reach, 0, 0.009));
          blend *= smooth(ax, 0.058, 0.07);
          indices.setXYZW(i, 1, px >= 0 ? 2 : 8, 0, 0);
          weights.setXYZW(i, 1 - blend, blend, 0, 0);
        }
        const a = indices.array[off],
          b = indices.array[off + 1];
        let nodes = lookup.get(a * 100 + b),
          weight = weights.array[off + 1];
        if (!nodes) {
          nodes = lookup.get(b * 100 + a);
          weight = weights.array[off];
        }
        if (!nodes) continue;
        // Clipping an edge may combine three weights. Only the two-joint
        // interior needs replacement; the boundary interpolation stays exact.
        if (weights.array[off + 2] > 0.00001) continue;
        const h = Math.max(0, Math.min(steps, weight * steps)),
          k = Math.min(steps - 1, Math.floor(h));
        indices.setXYZW(i, nodes[k], nodes[k + 1], 0, 0);
        weights.setXYZW(i, 1 - (h - k), h - k, 0, 0);
      }
    }
  rig.root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);
  for (const mesh of meshes) mesh.bind(skeleton, mesh.bindMatrix);
  return () => {
    for (const { mid, node, t, rest } of fans) {
      mid.position.copy(rest).lerp(node.position, t);
      mid.quaternion.slerpQuaternions(identity, node.quaternion, t);
    }
  };
}
