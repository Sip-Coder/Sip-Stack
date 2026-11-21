// Sternal end to acromion, glenoid to elbow, and elbow to thumb: the same
// posed landmarks locate both the articular surfaces and the muscle insertions.
import * as T from 'three';
import { local, v } from './diagram-fabricator.js';

const inch = 0.0254;
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
