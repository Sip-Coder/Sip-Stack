// Sternal end to acromion, glenoid to elbow, and elbow to thumb: the same
// posed landmarks locate both the articular surfaces and the muscle insertions.
import * as T from 'three';
import { local, ivory, joint, v } from './diagram-fabricator.js';

const inch = 0.0254;
const digits = ['index', 'middle', 'ring', 'little', 'thumb'];
const at = (p, axes, x = 0, y = 0, z = 0) =>
  p.clone().addScaledVector(axes.x, x).addScaledVector(axes.y, y).addScaledVector(axes.z, z);
const axis = (node, column) => v().setFromMatrixColumn(node.matrixWorld, column).normalize();

// The continuous deltoid is graded between the hero's shoulder and upper-arm
// bones. Its transverse section centres are the fitted scapulohumeral path.
function deltoidSections(rig, side) {
  const mesh = rig.secondary.sippy.body,
    g = mesh.geometry,
    p = g.attributes.position,
    ids = g.attributes.skinIndex,
    weights = g.attributes.skinWeight;
  const rings = Array.from({ length: 11 }, () => ({ centre: v(), count: 0 }));
  const outerBone = mesh.skeleton.bones.findLastIndex((n) => n.parent === rig['upperArm' + side]);
  for (let i = 0; i < p.count; i++) {
    if (ids.getX(i) !== 0 || ids.getY(i) !== outerBone) continue;
    const w = weights.getY(i);
    let row = 0;
    while (row < 10 && T.MathUtils.smoothstep(row / 10, 0, 1) < w - 0.001) row++;
    const r = rings[row];
    r.centre.add(mesh.getVertexPosition(i, v()).applyMatrix4(mesh.matrixWorld));
    r.count++;
  }
  return rings.map((r) => r.centre.divideScalar(r.count));
}

// A rolled shoulder can expose a few millimetres of its rim as the graded
// deltoid changes section. Fit that cortical rim to the actual posed skin.
// Each interval comes from oriented triangle crossings; the armpit stays open.
function shoulderTissue(parts, thorax, shoulder, side) {
  if (!parts) return (p) => p;
  const frame = thorax.chest,
    ref = frame.from(shoulder),
    cell = 0.016,
    grid = [new Map(), new Map(), new Map()];
  const key = (a, b) => a * 2048 + b;
  const low = [ref.x - 0.206, ref.y - 0.12, ref.z - 0.11],
    high = [ref.x + 0.206, ref.y + 0.12, ref.z + 0.11];
  for (const part of parts) {
    if (
      ![
        'Continuous body, limbs and hands',
        'Covered torso and hips',
        (side === 'L' ? 'Left ' : 'Right ') + 'covered arm',
      ].includes(part.name)
    )
      continue;
    const geo = part.mesh.geometry,
      pos = geo.getAttribute('position'),
      index = geo.index.array;
    const local = Array.from({ length: pos.count }, (_, i) =>
      frame.from(v().fromBufferAttribute(pos, i)).toArray(),
    );
    for (let n = 0; n < index.length; n += 3) {
      const p = local[index[n]],
        q = local[index[n + 1]],
        r = local[index[n + 2]];
      for (let k = 0; k < 3; k++) {
        const a = (k + 1) % 3,
          b = (k + 2) % 3;
        const loA = Math.floor(Math.max(low[a], Math.min(p[a], q[a], r[a])) / cell),
          hiA = Math.floor(Math.min(high[a], Math.max(p[a], q[a], r[a])) / cell);
        const loB = Math.floor(Math.max(low[b], Math.min(p[b], q[b], r[b])) / cell),
          hiB = Math.floor(Math.min(high[b], Math.max(p[b], q[b], r[b])) / cell);
        if (loA > hiA || loB > hiB) continue;
        const u = q[a] - p[a],
          v = q[b] - p[b],
          s = r[a] - p[a],
          t = r[b] - p[b],
          det = u * t - v * s;
        if (Math.abs(det) < 1e-12) continue;
        const tr = [p[a], p[b], p[k], u, v, s, t, 1 / det, q[k] - p[k], r[k] - p[k]];
        for (let y = loA; y <= hiA; y++)
          for (let z = loB; z <= hiB; z++) {
            const h = key(y, z);
            let bucket = grid[k].get(h);
            if (!bucket) grid[k].set(h, (bucket = []));
            bucket.push(tr);
          }
      }
    }
  }
  return (point) => {
    const q = frame.from(point).toArray();
    if (Math.abs(q[0] - ref.x) > 0.206 || Math.abs(q[1] - ref.y) > 0.12) return point;
    let best = Infinity,
      delta = 0,
      axis = 0;
    for (const k of [1, 2, 0]) {
      const a = q[(k + 1) % 3],
        b = q[(k + 2) % 3],
        g = grid[k].get(key(Math.floor(a / cell), Math.floor(b / cell)));
      if (!g) continue;
      const hits = [];
      for (const tr of g) {
        const dx = a - tr[0],
          dy = b - tr[1],
          u = (dx * tr[6] - dy * tr[5]) * tr[7],
          v = (tr[3] * dy - tr[4] * dx) * tr[7];
        if (u < 0 || v < 0 || u + v > 1) continue;
        hits.push([tr[2] + u * tr[8] + v * tr[9], Math.sign(tr[7])]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      let winding = 0,
        lo = 0;
      for (const [x, orientation] of hits) {
        if (!winding) lo = x;
        winding += orientation;
        if (winding || x - lo < 0.002) continue;
        const pad = Math.min(0.0037, 0.28 * (x - lo));
        if (q[k] >= lo + pad && q[k] <= x - pad) return point;
        const change = T.MathUtils.clamp(q[k], lo + pad, x - pad) - q[k];
        if (Math.abs(change) < best) {
          best = Math.abs(change);
          delta = change;
          axis = k;
        }
      }
    }
    if (best < 0.02) q[axis] += delta;
    return frame.point(...q);
  };
}

function shoulderSide(rig, roma, thorax, side, parts) {
  const s = side === 'L' ? 1 : -1,
    h = rig.height;
  const arm = rig['upperArm' + side],
    fore = rig['forearm' + side],
    hand = rig['hand' + side];
  const axes = { x: axis(rig.chest, 0).multiplyScalar(s), y: axis(rig.chest, 1), z: axis(rig.chest, 2) };
  const armPivot = local(arm)(0, 0, 0),
    // The running skin rounds the flexed elbow along its real bend frames;
    // its middle cross section is registered to the ulnar and humeral facets.
    elbow = roma
      ? local(fore)(0, 0, 0)
      : local(rig.secondary.sippy.body.skeleton.bones.filter((b) => b.parent === arm)[6])(0, 0, 0.002),
    wrist = local(hand)(0, 0, 0);
  const sc = thorax.clavicularNotch(side);
  const caps = roma ? null : deltoidSections(rig, side);
  const headCenter = roma
    ? at(armPivot, axes, -0.017, -0.027, -0.002)
    : at(caps[4], axes, 0.0045, -0.0025, 0.001);
  const shoulderNormal = axes.x
    .clone()
    .addScaledVector(axes.z, 0.22)
    .addScaledVector(axes.y, roma ? 0.09 : -0.29)
    .normalize();
  const socketUp = axes.y.clone().addScaledVector(shoulderNormal, -axes.y.dot(shoulderNormal)).normalize();
  const socketAcross = v().crossVectors(shoulderNormal, socketUp).normalize();
  const headRadii = {
    depth: roma ? 0.0178 : 0.0168,
    vertical: roma ? 0.0182 : 0.014,
    width: (roma ? 1.6 : 1.8) * inch * 0.5,
  };
  const capsule = 0.0018;
  const glenoid = headCenter.clone().addScaledVector(shoulderNormal, -headRadii.depth - capsule);
  const acromion = at(headCenter, axes, 0.003, headRadii.vertical + (roma ? 0.0124 : 0.0137), -0.001);
  const acromioclavicular = at(acromion, axes, -0.011, roma ? -0.007 : -0.004, roma ? 0.005 : -0.001);
  const target = (roma ? 5.6 : 6.0) * inch;
  const clavicleCurve = (length) => {
    const end = acromioclavicular.clone();
    const span = end.clone().sub(sc).dot(axes.x);
    end.addScaledVector(axes.x, length - span);
    const points = [0, 0.16, 0.36, 0.59, 0.76, 0.88, 1].map((t) =>
      sc
        .clone()
        .lerp(end, t)
        .addScaledVector(axes.z, (roma ? 0.009 : 0.014) * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t))
        .addScaledVector(axes.y, (roma ? -0.012 : 0.001) * Math.sin(Math.PI * t) ** 2),
    );
    return new T.CatmullRomCurve3(points);
  };
  // Lay the signed S-curve on the measured notches. Move only the small AC
  // facet along the acromion, leaving the humerus and glenoid seated together.
  let lo = 0.02,
    hi = target;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (clavicleCurve(mid).getLength() > target) hi = mid;
    else lo = mid;
  }
  const clavicle = clavicleCurve((lo + hi) / 2).getPoints(16);
  acromioclavicular.copy(clavicle.at(-1));

  // Posterior lamina sits over the costal angles. The converging anterior
  // neck wraps the lateral chest wall, rather than lying in the coronal plane.
  const posteriorOffset = roma
    ? { 2: 0.029, 3: 0.032, 5: 0.023, 7: 0.015 }
    : { 2: 0.022, 3: 0.019, 5: 0.012, 7: 0.008 };
  const back = (n, lateral) =>
    thorax.posteriorRib(side, n, lateral).addScaledVector(axes.z, -posteriorOffset[n]);
  const superior = back(2, roma ? 0.045 : 0.05),
    spineRoot = back(3, roma ? 0.046 : 0.051);
  const medialMid = back(5, roma ? 0.047 : 0.054),
    inferior = back(7, roma ? 0.051 : 0.058);
  const neck = roma ? at(glenoid, axes, -0.017, -0.001, 0.009) : at(caps[1], axes, -0.002, -0.002, 0.006);
  const lateralLower = roma
    ? neck.clone().lerp(inferior, 0.42).addScaledVector(axes.z, -0.005)
    : at(caps[1], axes, -0.021, -0.006, -0.005);
  const spine = [
    spineRoot,
    roma
      ? spineRoot.clone().lerp(neck, 0.45).addScaledVector(axes.z, -0.01)
      : at(caps[1], axes, -0.012, 0.002, -0.013),
    at(neck, axes, -0.002, 0.01, -0.009),
    at(acromion, axes, -0.01, -0.003, -0.004),
    acromion,
  ];
  const coracoid = at(glenoid, axes, -0.004, 0.01, roma ? 0.018 : 0.015);
  const medialBorder = [superior, spineRoot, medialMid, inferior];
  const shaftTop = roma ? at(headCenter, axes, 0.006, -0.018, 0.001) : caps[5].clone();
  // Near its own root the flesh runs diagonally out to the upper-arm shaft.
  const settle = roma ? local(arm)(0, -0.041, 0) : caps[9].clone();
  function humerusAt(t, x = 0, z = 0) {
    const q =
      t < 0.29 ? shaftTop.clone().lerp(settle, t / 0.29) : settle.clone().lerp(elbow, (t - 0.29) / 0.71);
    return q.addScaledVector(axis(arm, 0), s * x * h).addScaledVector(axis(arm, 2), z * h);
  }
  const down = wrist.clone().sub(elbow).normalize();
  const thumbward = roma ? axis(hand, 0).multiplyScalar(-s) : axis(hand, 2);
  const start = axis(fore, 0).multiplyScalar(s);
  start.addScaledVector(down, -start.dot(down)).normalize();
  thumbward.addScaledVector(down, -thumbward.dot(down)).normalize();
  const twist = Math.atan2(v().crossVectors(start, thumbward).dot(down), start.dot(thumbward));
  function forearmAt(t, offset, depth = 0) {
    const direction = start.clone().applyAxisAngle(down, twist * t);
    return elbow
      .clone()
      .lerp(wrist, t)
      .addScaledVector(direction, offset * h)
      .addScaledVector(axis(fore, 2), depth * h);
  }
  return {
    side,
    tissue: shoulderTissue(parts, thorax, armPivot, side),
    s,
    arm,
    fore,
    hand,
    axes,
    armPivot,
    headCenter,
    headRadii,
    shoulderNormal,
    socketUp,
    socketAcross,
    sternoclavicular: sc,
    acromioclavicular,
    acromion,
    coracoid,
    clavicle,
    glenoid,
    spineRoot,
    spine,
    superior,
    inferior,
    medialBorder,
    neck,
    lateralLower,
    capsule,
    elbow,
    wrist,
    humerusAt,
    forearmAt,
    humeralInsertion: humerusAt(0.16, -0.004, 0.004),
    deltoidTuberosity: humerusAt(0.39, 0.0042, 0.0004),
    radiusHead: forearmAt(0.041, 0.006, 0.001),
    radiusTuberosity: forearmAt(0.19, 0.004, 0.002),
    olecranon: forearmAt(0.016, -0.003, -0.002),
  };
}

export function shoulderLandmarks(rig, roma, thorax, parts) {
  return Object.fromEntries(['L', 'R'].map((side) => [side, shoulderSide(rig, roma, thorax, side, parts)]));
}

function scapulaPlate(p, { surface }, roma) {
  // Curved triangular blade cut from two slightly bowed cortical plates.
  // Around its central hollow the borders remain visibly thicker than the fossae.
  const { superior, spineRoot, medialBorder, inferior, neck, lateralLower, axes } = p;
  const border = [
    superior,
    superior.clone().lerp(neck, 0.4).addScaledVector(axes.y, -0.0035),
    at(neck, axes, -0.01, 0.008, -0.0015),
    at(neck, axes, 0, 0.0055, 0.001),
    at(neck, axes, 0.002, -0.009, 0.0015),
    lateralLower,
    inferior.clone().lerp(lateralLower, 0.12),
    inferior,
    medialBorder[2],
    spineRoot,
  ];
  const mid = spineRoot.clone().lerp(lateralLower, 0.51);
  const verts = [],
    indices = [];
  for (const k of [-1, 1]) {
    const inner = at(mid, axes, 0, 0, k * 0.0016 + 0.0035);
    verts.push(inner);
    for (const [i, p0] of border.entries()) {
      const width = (i === 3 || i === 4 ? 0.0035 : i > 6 ? 0.0024 : 0.0018) * (roma ? 0.87 : 1);
      verts.push(p0.clone().addScaledVector(axes.z, k * width));
    }
  }
  const n = border.length + 1;
  for (let i = 1; i < n; i++) {
    const j = i === n - 1 ? 1 : i + 1;
    indices.push(0, j, i, n, n + i, n + j, i, j, n + j, i, n + j, n + i);
  }
  // Each skin of the plate faces away from its central fossae.
  if (
    v()
      .crossVectors(verts[n + 1].clone().sub(verts[n]), verts[n + 2].clone().sub(verts[n]))
      .dot(axes.z) < 0
  )
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  // Across the wing, subdivide the long triangular fans to follow the true
  // convex ribs and the undercut of the moving axilla on either side.
  for (let pass = 0; pass < 2; pass++) {
    const midpoint = new Map(),
      faces = indices.splice(0);
    function halve(a, b) {
      const k = Math.min(a, b) + ':' + Math.max(a, b);
      if (!midpoint.has(k)) {
        midpoint.set(k, verts.length);
        verts.push(verts[a].clone().lerp(verts[b], 0.5));
      }
      return midpoint.get(k);
    }
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i],
        b = faces[i + 1],
        c = faces[i + 2],
        ab = halve(a, b),
        bc = halve(b, c),
        ca = halve(c, a);
      indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
  }
  surface(verts, indices, ivory);
}

function glenoidCup(p, { surface, high }, roma) {
  const n = high ? 24 : 14,
    verts = [],
    ix = [];
  const { headCenter, headRadii: r, shoulderNormal: d, socketUp: u, socketAcross: a, capsule } = p;
  const ry = roma ? 0.0124 : 0.013,
    rz = roma ? 0.0094 : 0.0107;
  const rings = [0, 0.45, 1, 1.03, 0.46, 0];
  for (let row = 0; row < rings.length; row++) {
    const t = rings[row];
    const count = t === 0 ? 1 : n;
    for (let j = 0; j < count; j++) {
      const theta = (2 * Math.PI * j) / n;
      const y = ry * t * Math.cos(theta),
        z = rz * t * Math.sin(theta) * (1 - 0.19 * Math.cos(theta));
      const depth = r.depth * Math.sqrt(Math.max(0.01, 1 - (y / r.vertical) ** 2 - (z / r.width) ** 2));
      const base = headCenter.clone().addScaledVector(d, -depth - capsule - (row >= 3 ? 0.0026 : 0));
      verts.push(base.addScaledVector(u, y).addScaledVector(a, z));
    }
  }
  const end = 1 + 4 * n;
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    ix.push(0, 1 + j, 1 + k);
    for (let row = 0; row < 3; row++) {
      const i = 1 + row * n;
      ix.push(i + j, i + n + j, i + n + k, i + j, i + n + k, i + k);
    }
    ix.push(end, 1 + 3 * n + k, 1 + 3 * n + j);
  }
  surface(verts, ix, joint);
}

function girdle(rig, roma, part, p, prefix) {
  const { axes } = p;
  part(prefix + 'clavicle', 'skeleton', ({ sweep, high }) => {
    const k = roma ? 0.83 : 1;
    sweep(
      p.clavicle,
      [
        [0.0046, 0.0041],
        [0.0034, 0.0036],
        [0.0033, 0.0036],
        [0.0031, 0.0031],
        [0.0037, 0.0022],
        [0.0043, 0.0018],
      ].map((r) => r.map((x) => x * k)),
      ivory,
      { rows: high ? 17 : 12, sides: high ? 12 : 8, across: axes.z },
    );
  });
  part(prefix + 'scapula', 'skeleton', (pr) => {
    scapulaPlate(p, pr, roma);
    const { sweep, high } = pr,
      k = roma ? 0.86 : 1;
    sweep(
      p.spine,
      [
        [0.0016, 0.0016],
        [0.0032, 0.002],
        [0.0039, 0.0026],
        [0.005, 0.0025],
        [0.0039, 0.0018],
      ].map((r) => r.map((x) => x * k)),
      ivory,
      { across: axes.z, rows: high ? 15 : 9, sides: high ? 10 : 7 },
    );
    // The flat tip and its medial AC facet are both integral to the scapula.
    sweep(
      [p.spine[2], p.spine[3], p.acromion, p.acromioclavicular],
      [
        [0.003, 0.0017],
        [0.0045, 0.0021],
        [0.005, 0.0018],
        [0.0038, 0.0016],
      ].map((r) => r.map((x) => x * k)),
      ivory,
      { across: axes.z, rows: 8, sides: 8 },
    );
    sweep(
      [
        p.neck,
        at(p.neck, axes, 0.003, 0.016, 0.005),
        at(p.coracoid, axes, -0.005, 0.004, -0.009),
        p.coracoid,
      ],
      [
        [0.0027, 0.0027],
        [0.0032, 0.0027],
        [0.0027, 0.0022],
        [0.0016, 0.0018],
      ].map((r) => r.map((x) => x * k)),
      ivory,
      { across: axes.x, rows: 9, sides: 8 },
    );
    // A short buttress joins the lateral border to the pear-shaped articular rim.
    const rim = p.glenoid.clone().addScaledVector(p.shoulderNormal, -0.003);
    const buttress = p.neck.clone().lerp(rim, 0.54);
    if (!roma) buttress.addScaledVector(axes.y, 0.004).addScaledVector(axes.z, -0.002);
    sweep(
      [p.neck, buttress, rim],
      [
        [0.0037, 0.0024],
        [0.0034, 0.0028],
      ],
      ivory,
      { across: axes.y, rows: 8, sides: 8 },
    );
    glenoidCup(p, pr, roma);
  });
}

function appendArm(rig, roma, part, p, prefix) {
  const { forearmAt: f, humerusAt: b, axes, hand } = p;
  const k = roma ? 0.86 : 1;
  const section = (arr) => arr.map((r) => r.map((x) => x * k));
  part(prefix + 'humerus', 'skeleton', ({ sweep, net, high }) => {
    const { headCenter, headRadii: r, shoulderNormal: d, socketUp: u, socketAcross: a } = p;
    // An articular head with an anatomical neck on its lateral side. The
    // pear-shaped glenoid samples this exact ellipsoid for its concave cup.
    net(
      high ? 14 : 10,
      high ? 24 : 16,
      (_i, _j, t, theta) => {
        const lat = (t - 0.5) * Math.PI,
          ring = Math.max(0.004, Math.cos(lat));
        return headCenter
          .clone()
          .addScaledVector(u, r.vertical * Math.sin(lat))
          .addScaledVector(d, r.depth * ring * Math.cos(theta))
          .addScaledVector(a, -r.width * ring * Math.sin(theta));
      },
      joint,
    );
    const tube = [b(0), b(0.12, 0.001, 0), b(0.32, 0.0012, 0), b(0.55, 0.0006, 0.001), b(0.83), b(0.976)];
    sweep(
      tube,
      section([
        [0.0068, 0.0061],
        [0.009, 0.0073],
        [0.0062, 0.0056],
        [0.0052, 0.0048],
        [0.0046, 0.0043],
        [0.0052, 0.0048],
        [0.0076, 0.0053],
        [0.011, 0.0051],
      ]),
      ivory,
      { across: axes.x, rows: high ? 18 : 12, sides: high ? 13 : 9 },
    );
    sweep(
      [p.headCenter.clone().addScaledVector(axes.x, 0.005), b(0.053, 0.0045, 0.001), b(0.15, 0.003, 0)],
      section([
        [0.0039, 0.004],
        [0.0048, 0.0041],
        [0.0028, 0.0025],
      ]),
      ivory,
      { rows: 7, sides: 8 },
    );
    sweep(
      [b(0.02, -0.002, 0.004), b(0.065, -0.001, 0.004), b(0.14, 0, 0.003)],
      section([
        [0.0022, 0.0021],
        [0.0033, 0.0031],
        [0.0014, 0.0014],
      ]),
      ivory,
      { rows: 6, sides: 7 },
    );
    sweep(
      [b(0.24, 0.0043, 0), p.deltoidTuberosity, b(0.49, 0.004, 0)],
      section([
        [0.0016, 0.0016],
        [0.0029, 0.0018],
        [0.0013, 0.0012],
      ]),
      ivory,
      { rows: 5, sides: 7 },
    );
    const ep = (t, x, z) => b(t, x, z);
    sweep(
      [
        ep(0.962, -0.009, 0),
        ep(0.974, -0.006, 0),
        ep(0.978, -0.002, 0.0008),
        ep(0.983, 0.002, 0.0005),
        ep(0.975, 0.0055, 0.0008),
        ep(0.962, 0.009, 0.0002),
      ],
      section([
        [0.004, 0.0042],
        [0.005, 0.0052],
        [0.0038, 0.0041],
        [0.003, 0.0032],
        [0.0049, 0.0047],
        [0.002, 0.0022],
      ]),
      joint,
      { across: axis(p.arm, 2), rows: high ? 13 : 9, sides: high ? 12 : 8 },
    );
  });
  part(prefix + 'ulna', 'skeleton', ({ sweep, high }) => {
    sweep(
      [
        p.olecranon,
        f(0.038, -0.003, -0.002),
        f(0.072, -0.003, -0.0026),
        f(0.105, -0.003, 0.0013),
        f(0.32, -0.004, 0.0001),
        f(0.62, -0.0047, 0),
        f(0.87, -0.004, 0),
        f(0.985, -0.004, 0),
      ],
      section([
        [0.0039, 0.0048],
        [0.006, 0.0052],
        [0.0046, 0.0049],
        [0.0038, 0.0039],
        [0.0032, 0.0037],
        [0.0026, 0.0031],
        [0.0023, 0.0026],
        [0.0033, 0.0028],
      ]),
      ivory,
      { rows: high ? 18 : 12, sides: high ? 11 : 8 },
    );
    sweep(
      [f(0.042, -0.003, -0.002), p.olecranon, f(0.028, -0.003, -0.0006)],
      section([
        [0.0029, 0.0023],
        [0.004, 0.003],
        [0.0021, 0.0018],
      ]),
      ivory,
      { rows: 7, sides: 7 },
    );
  });
  part(prefix + 'radius', 'skeleton', ({ sweep, high }) => {
    sweep(
      [
        p.radiusHead,
        f(0.09, 0.0055, 0.001),
        p.radiusTuberosity,
        f(0.38, 0.0055, 0.001),
        f(0.65, 0.007, 0),
        f(0.85, 0.0066, 0.0006),
        f(0.987, 0.0056, 0.001),
      ],
      section([
        [0.0037, 0.0033],
        [0.0024, 0.0025],
        [0.0041, 0.0038],
        [0.0033, 0.0031],
        [0.003, 0.0032],
        [0.0042, 0.004],
        [0.0064, 0.005],
      ]),
      ivory,
      { rows: high ? 16 : 10, sides: high ? 12 : 9 },
    );
    sweep(
      [f(0.93, 0.006, 0), f(0.975, 0.008, 0), f(1.012, 0.009, 0)],
      section([
        [0.0026, 0.0028],
        [0.0025, 0.0021],
        [0.0012, 0.0012],
      ]),
      ivory,
      { rows: 5, sides: 7 },
    );
  });

  // The radial edge follows the actual thumb and the pisiform sits volarly,
  // whether the authored hand is resting edge-on or palm-forward.
  const place = local(hand),
    map = (x, y, z) => (roma ? place(x * p.s, y, z) : place(x * p.s * 1.14, y * 1.06, z * 1.14));
  const carpus = (r, y, volar) => (roma ? map(-r, y, volar + 0.001) : map(-volar + 0.001, y, r + 0.001));
  const winding = roma ? -p.s : p.s;
  const carpals = [
    ['scaphoid', 0.0088, -0.0018, 0.0015, 0.0037, 0.0054, 0.0039, -0.36],
    ['lunate', 0.0014, -0.0017, -0.0007, 0.0038, 0.0034, 0.0045, 0.18],
    ['triquetrum', -0.0064, -0.0022, -0.001, 0.0042, 0.0039, 0.0036, -0.16],
    ['pisiform', -0.0082, -0.0029, 0.0041, 0.0026, 0.0028, 0.0026, 0.2],
    ['trapezium', 0.0095, -0.009, 0.003, 0.0038, 0.0039, 0.0042, 0.3],
    ['trapezoid', 0.0037, -0.0087, -0.0006, 0.0031, 0.0036, 0.0036, -0.2],
    ['capitate', -0.0016, -0.0086, 0.0003, 0.0033, 0.0051, 0.0043, 0.06],
    ['hamate', -0.0078, -0.0094, 0.001, 0.0042, 0.0039, 0.0041, -0.15],
  ];
  for (const [id, r, y, z, rx, ry, rz, angle] of carpals)
    part(prefix + id, 'skeleton', ({ net, high, sweep }) => {
      net(
        high ? 6 : 5,
        high ? 9 : 7,
        (_i, _j, t, a) => {
          const hh = t * 2 - 1,
            rr = 0.16 + 0.84 * Math.sqrt(Math.max(0, 1 - hh * hh));
          const dx = rx * rr * Math.cos(a) * (1 + 0.13 * Math.cos(3 * a + angle)),
            dy = ry * hh;
          return carpus(
            r + dx * Math.cos(angle) - dy * Math.sin(angle),
            y + dy * Math.cos(angle) + dx * Math.sin(angle),
            z - winding * rz * rr * Math.sin(a) * (1 + 0.1 * Math.sin(2 * a + angle)),
          );
        },
        ivory,
      );
      if (id === 'hamate')
        sweep(
          [
            carpus(r, y, z + 0.0015),
            carpus(r + 0.0013, y - 0.001, z + 0.0056),
            carpus(r + 0.0029, y, z + 0.0065),
          ],
          section([
            [0.0013, 0.0013],
            [0.0012, 0.0011],
            [0.0008, 0.0007],
          ]),
          ivory,
          { rows: 4, sides: 5 },
        );
    });
  // Centres of the four finger sections, in millimetres on the original hand
  // pattern. The middle and distal joints follow its inward curl; the little
  // and ring fingers have shallower, more flexed terminal tufts.
  const fingerSections = [
    [
      [4.9, -30, 14.1],
      [3.91, -38.4, 14.8],
      [0.4, -42.8, 17.6],
      [-0.58, -45.6, 16.82],
    ],
    [
      [6.4, -32.5, 4.5],
      [4.5, -43, 7.31],
      [3.13, -48.5, 6.85],
      [-0.71, -52, 7.33],
    ],
    [
      [4.9, -30.3, -5.1],
      [3.8, -39.96, -4.7],
      [1.4, -45.02, -1.02],
      [-0.92, -48.24, -2.83],
    ],
    [
      [3.4, -27.7, -14.7],
      [2.3, -34.84, -14.3],
      [-0.38, -38.58, -13.34],
      [-2.4, -40.3, -12.2],
    ],
  ];
  if (!roma && rig.secondary.sippy.body.geometry === rig.secondary.sippy.body.userData.mobileGeometry)
    fingerSections[0] = [
      [4.2, -29.8, 14.2],
      [3.4, -35.7, 14.2],
      [3.15, -39.2, 12.6],
      [3.1, -41.2, 11.5],
    ];
  for (let j = 0; j < 5; j++) {
    const thumb = j === 4;
    let path;
    if (roma) {
      const x = (j - 1.5) * 0.0087,
        len = [0.02, 0.023, 0.022, 0.017][j];
      path = thumb
        ? [
            [-0.008, -0.007, 0.004],
            [-0.013, -0.015, 0.009],
            [-0.017, -0.023, 0.012],
            [-0.021, -0.03, 0.015],
          ]
        : [
            [x * 0.55, -0.009, 0.002],
            [x, -0.032, 0.004],
            [x * 0.98, -0.034 - 0.44 * len, 0.0065],
            [x, -0.034 - 0.77 * len, 0.009],
            [x * 1.04, -0.034 - 1.01 * len, 0.01],
          ];
    } else {
      const z = 0.0143 - j * 0.0096;
      path = thumb
        ? [
            [-0.006, -0.008, 0.006],
            [-0.015, -0.016, 0.02],
            [-0.014, -0.026, 0.028],
            [-0.0075, -0.029, 0.027],
          ]
        : [[0.001, -0.009, z * 0.54], ...fingerSections[j].map((q) => q.map((mm) => mm * 0.001))];
    }
    const points = path.map((x) => map(...x)),
      names = thumb
        ? ['metacarpal', 'proximal phalanx', 'distal phalanx']
        : ['metacarpal', 'proximal phalanx', 'middle phalanx', 'distal phalanx'];
    for (const [i, bone] of names.entries())
      part(prefix + digits[j] + ' ' + bone, 'skeleton', ({ sweep, high }) => {
        const start = points[i].clone().lerp(points[i + 1], 0.03),
          end = points[i].clone().lerp(points[i + 1], 0.96);
        const distal = i === names.length - 1;
        const rr = (i === 0 ? 0.00255 : roma ? 0.00185 : j === 0 ? 0.0007 : 0.00085) * (thumb ? 1.12 : 1);
        const profile = distal
          ? [0.94, 0.79, 0.58, 0.82, 0.55]
          : i === 0
            ? [0.85, 1, 0.6, 0.67, 1.12, 0.88]
            : [1.06, 0.85, 0.62, 0.8, 1.02, 0.86];
        sweep(
          [start, start.clone().lerp(end, 0.46).addScaledVector(axes.z, 0.0003), end],
          profile.map((n) => [rr * n, 0.81 * rr * n]),
          ivory,
          { rows: high ? 8 : 6, sides: high ? 8 : 6 },
        );
      });
  }
}

export function buildUpper(rig, roma, part, shoulders) {
  for (const side of ['L', 'R']) {
    const p = shoulders[side],
      prefix = side === 'L' ? 'Left ' : 'Right ';
    function bone(name, layer, assemble) {
      const fit = name.endsWith('scapula')
        ? (point) => {
            if (!roma) {
              const x = point.clone().sub(p.spineRoot).dot(p.axes.x);
              const plane = 0.018 * Math.exp(-(((x - 0.052) / 0.031) ** 2));
              point.addScaledVector(p.axes.z, plane);
            }
            point = p.tissue(point);
            const d = point.clone().sub(p.headCenter),
              ax = d.dot(p.shoulderNormal),
              ry = d.dot(p.socketUp) / p.headRadii.vertical,
              rz = d.dot(p.socketAcross) / p.headRadii.width;
            if (ax < 0 && ry * ry + rz * rz < 1) {
              const level = -p.headRadii.depth * Math.sqrt(1 - ry * ry - rz * rz) - p.capsule;
              if (ax > level) point.addScaledVector(p.shoulderNormal, level - ax);
            }
            return point;
          }
        : p.tissue;
      return part(name, layer, assemble, fit);
    }
    girdle(rig, roma, bone, p, prefix);
    appendArm(rig, roma, bone, p, prefix);
  }
}
