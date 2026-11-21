// Cut the jacket armscye through its lining. The sleeve crown is a separate,
// shaped two-ply pattern sewn between the cut body and sleeve edges.
import * as T from 'three';
import { bindCloth } from './sippy-skin.js';

const tau = Math.PI * 2,
  sections = 10;
const { lerp } = T.MathUtils;
function triangleKey(a, b, c) {
  const lo = Math.min(a, b, c),
    hi = Math.max(a, b, c);
  return lo + ',' + (a + b + c - lo - hi) + ',' + hi;
}
function circleAngle(a) {
  return (a + tau) % tau;
}

function cutPorts(mesh, sites, highColumns) {
  const high = mesh.geometry,
    mobile = mesh.userData.mobileGeometry;
  const output = [];
  for (const g of [high, mobile]) {
    if (!g) {
      output.push(output[0]);
      continue;
    }
    const p = g.attributes.position,
      idx = g.index.array,
      plane = p.count / 2,
      kept = [],
      holes = [];
    for (const site of sites) {
      const sign = site.side,
        killed = new Set(),
        edgeMap = new Map();
      let cutRow = 0;
      if (site.arm) {
        while ((cutRow + 1) * highColumns < plane && p.getY((cutRow + 1) * highColumns) <= site.cutY)
          cutRow++;
      }
      const edge = (a, b) => {
        const key = Math.min(a, b) * plane + Math.max(a, b);
        if (edgeMap.has(key)) edgeMap.delete(key);
        else edgeMap.set(key, [a, b]);
      };
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i],
          b = idx[i + 1],
          c = idx[i + 2];
        if (a >= plane || b >= plane || c >= plane) continue;
        const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
        const y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3,
          z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
        const outside = site.arm
          ? Math.min(a, b, c) >= cutRow * highColumns
          : sign * x > 0 && ((y - site.cy) / site.ry) ** 2 + ((z - site.cz) / site.rz) ** 2 < 1;
        if (!outside) continue;
        killed.add(triangleKey(a, b, c));
        edge(a, b);
        edge(b, c);
        edge(c, a);
      }
      // A cut cylinder extends through the pre-existing end cap. Its old top
      // circle is discarded; the remaining boundary is the new sleeve crown.
      const directed = new Map();
      for (const [a, b] of edgeMap.values()) {
        if (site.arm && (a >= plane - highColumns || b >= plane - highColumns)) continue;
        directed.set(a, b);
      }
      const ring = [],
        start = directed.keys().next().value;
      if (start == null) throw Error('Empty shoulder cut on ' + mesh.name);
      let current = start;
      do {
        ring.push(current);
        current = directed.get(current);
        if (current == null || ring.length > directed.size) throw Error('Open shoulder cut on ' + mesh.name);
      } while (current !== start);
      if (ring.length !== directed.size) throw Error('Multiple shoulder cuts on ' + mesh.name);
      holes.push({ killed, ring });
    }
    // Sew the lining back to every exposed cut edge, including where the
    // underlayer's armhole meets its original neckline.
    const border = new Map();
    function boundary(a, b) {
      const key = Math.min(a, b) * plane + Math.max(a, b);
      if (border.has(key)) border.delete(key);
      else border.set(key, [a, b]);
    }
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i],
        b = idx[i + 1],
        c = idx[i + 2],
        shell = (a >= plane) + (b >= plane) + (c >= plane);
      if (shell !== 0 && shell !== 3) continue;
      const key = triangleKey(a % plane, b % plane, c % plane);
      if (holes.some((h) => h.killed.has(key))) continue;
      kept.push(a, b, c);
      if (shell === 0) {
        boundary(a, b);
        boundary(b, c);
        boundary(c, a);
      }
    }
    for (const [a, b] of border.values()) kept.push(b, a, a + plane, b, a + plane, b + plane);
    g.setIndex(kept);
    output.push(holes.map((h) => h.ring));
  }
  return output;
}

// Clip the jacket pattern across triangle edges for a smooth, closed armscye.
// Both tiers retain their own indices and share the extended vertex buffer.
function cutBodyPorts(mesh, sites) {
  const high = mesh.geometry,
    low = mesh.userData.mobileGeometry;
  const source = high.attributes;
  const plane = source.position.count / 2,
    attrs = Object.entries(source);
  const arrays = Object.fromEntries(attrs.map(([key, attr]) => [key, Array.from(attr.array)]));
  const output = [];
  const fields = sites.map((s) => {
    const dist = new Float64Array(plane);
    for (let i = 0; i < plane; i++) {
      const p = source.position;
      dist[i] =
        s.side * p.getX(i) <= 0 ? 3 : ((p.getY(i) - s.cy) / s.ry) ** 2 + ((p.getZ(i) - s.cz) / s.rz) ** 2 - 1;
    }
    return dist;
  });
  for (const g of [high, low]) {
    const index = [],
      sides = sites.map(() => ({ edges: new Map(), split: new Map() })),
      idx = g.index.array;
    const inner = (id) => (id < plane ? id + plane : id + 1);
    function intersection(i, j, site) {
      const { split } = sides[site],
        key = Math.min(i, j) * plane + Math.max(i, j);
      if (split.has(key)) return split.get(key);
      const f = fields[site],
        t = f[i] / (f[i] - f[j]),
        id = arrays.position.length / 3;
      for (const shell of [0, 1])
        for (const [name, attr] of attrs) {
          const a = (i + shell * plane) * attr.itemSize,
            b = (j + shell * plane) * attr.itemSize;
          for (let k = 0; k < attr.itemSize; k++)
            arrays[name].push(lerp(attr.array[a + k], attr.array[b + k], t));
        }
      split.set(key, id);
      return id;
    }
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i],
        b = idx[i + 1],
        c = idx[i + 2],
        shell = (a >= plane) + (b >= plane) + (c >= plane);
      if (shell === 3) continue;
      if (shell !== 0) {
        index.push(a, b, c);
        continue;
      }
      const tri = [a, b, c];
      let poly = tri;
      for (let site = 0; site < sites.length; site++) {
        const f = fields[site];
        if (tri.every((v) => f[v] >= 0)) continue;
        poly = [];
        let crossings = 0;
        for (let j = 0; j < 3; j++) {
          const u = tri[j],
            v = tri[(j + 1) % 3];
          if (f[u] >= 0) poly.push(u);
          if (f[u] >= 0 !== f[v] >= 0) {
            const p = intersection(u, v, site);
            poly.push(p);
            crossings++;
          }
        }
        if (crossings) {
          const begin = poly.findIndex((v, j) => v >= 2 * plane && poly[(j + 1) % poly.length] >= 2 * plane);
          const x = poly[begin],
            y = poly[(begin + 1) % poly.length];
          sides[site].edges.set(x, y);
          index.push(y, x, inner(x), y, inner(x), inner(y));
        }
        break;
      }
      for (let k = 1; k + 1 < poly.length; k++) {
        const x = poly[0],
          y = poly[k],
          z = poly[k + 1];
        index.push(x, y, z, inner(x), inner(z), inner(y));
      }
    }
    g.setIndex(index);
    output.push(
      sides.map(({ edges }) => {
        const list = [],
          start = edges.keys().next().value;
        let cur = start;
        do {
          list.push(cur);
          cur = edges.get(cur);
          if (cur == null || list.length > edges.size) throw Error('Open interpolated armhole');
        } while (cur !== start);
        if (list.length !== edges.size) throw Error('Split interpolated armhole');
        return list;
      }),
    );
  }
  for (const [key, attr] of attrs) {
    const buff = new T.BufferAttribute(
      new attr.array.constructor(arrays[key]),
      attr.itemSize,
      attr.normalized,
    );
    high.setAttribute(key, buff);
    low.setAttribute(key, buff);
  }
  return output;
}

function contour(mesh, ring, arm, side) {
  const p = mesh.geometry.attributes.position;
  const metricY = (i) => (arm ? side * p.getX(i) : p.getY(i));
  let ymin = Infinity,
    ymax = -Infinity,
    zmin = Infinity,
    zmax = -Infinity;
  for (const i of ring) {
    const y = metricY(i),
      z = p.getZ(i);
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
    zmin = Math.min(zmin, z);
    zmax = Math.max(zmax, z);
  }
  const y0 = arm ? (ymin + ymax) / 2 : 0.129,
    z0 = arm ? (zmin + zmax) / 2 : -0.002;
  const sy = arm ? (ymax - ymin) / 2 : 0.029,
    sz = arm ? (zmax - zmin) / 2 : 0.042;
  return ring
    .map((id) => ({
      id,
      angle: circleAngle(Math.atan2((metricY(id) - y0) / sy, (p.getZ(id) - z0) / sz)),
    }))
    .sort((a, b) => a.angle - b.angle);
}
function blendIndex(ring, a) {
  let hi = 0;
  while (hi < ring.length && ring[hi].angle < a) hi++;
  const upper = ring[hi % ring.length],
    lower = ring[(hi + ring.length - 1) % ring.length];
  if (Math.abs(upper.angle - a) < 1e-10) return { a: upper, b: upper, t: 0 };
  const gap = circleAngle(upper.angle - lower.angle);
  return { a: lower, b: upper, t: gap < 1e-7 ? 0 : circleAngle(a - lower.angle) / gap };
}
function makeCrown(jacket, sleeve, bodyIds, sleeveIds, side) {
  const trunk = contour(jacket, bodyIds, false, side),
    arm = contour(sleeve, sleeveIds, true, side);
  // The union retains every true corner of both cut edges. Additional samples
  // inside an edge remain collinear with that edge in either geometry tier.
  const angles = [...new Set([...trunk.map((v) => v.angle), ...arm.map((v) => v.angle)])].sort(
    (a, b) => a - b,
  );
  const n = angles.length,
    ply = (sections + 1) * n,
    vertices = new Float32Array(6 * ply),
    uv = new Float32Array(4 * ply),
    index = [];
  const bodyLine = angles.map((a) => blendIndex(trunk, a)),
    sleeveLine = angles.map((a) => blendIndex(arm, a));
  const materialPoint = (shell, k, j) => shell * ply + k * n + j;
  for (let shell = 0; shell < 2; shell++)
    for (let k = 0; k <= sections; k++)
      for (let j = 0; j < n; j++) {
        const id = materialPoint(shell, k, j),
          v = k / sections;
        uv[id * 2] = v;
        uv[id * 2 + 1] = angles[j] / tau;
        if (k === sections) continue;
        const a = id,
          b = materialPoint(shell, k, (j + 1) % n),
          c = a + n,
          d = b + n;
        if ((side === 1) === !shell) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
  for (const k of [0, sections])
    for (let j = 0; j < n; j++) {
      const a = k * n + j,
        b = k * n + ((j + 1) % n);
      if ((k === 0) === (side === 1)) index.push(a, b, a + ply, b, b + ply, a + ply);
      else index.push(a, a + ply, b, b, a + ply, b + ply);
    }
  const geom = new T.BufferGeometry();
  geom.userData.crownPlyTriangles = sections * n * 2;
  const attr = new T.BufferAttribute(vertices, 3).setUsage(T.DynamicDrawUsage);
  const norm = new T.Float32BufferAttribute(new Float32Array(vertices.length), 3).setUsage(
    T.DynamicDrawUsage,
  );
  geom.setAttribute('position', attr);
  geom.setAttribute('normal', norm);
  geom.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geom.setIndex(index);
  geom.boundingSphere = new T.Sphere(new T.Vector3(side * 0.125, 0.13, 0), 0.135);
  const a = new T.Vector3(),
    b = new T.Vector3(),
    scratch = new T.Vector3(),
    r0 = new T.Vector3(),
    r1 = new T.Vector3();
  const axis = new T.Vector3(),
    pose = new T.Matrix4(),
    center0 = new T.Vector3(),
    center1 = new T.Vector3();
  const crown = new T.Vector3(),
    chord = new T.Vector3(),
    t0dir = new T.Vector3(side, 0, 0);
  const endFrame = new T.Quaternion(),
    reverse = new T.Quaternion(),
    frame = new T.Quaternion();
  const bind = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), (-side * Math.PI) / 2);
  const direction = new T.Vector3(),
    along = new T.Vector3();
  const basis = Array.from({ length: sections + 1 }, () => ({
    c: new T.Vector3(),
    U: new T.Vector3(),
    V: new T.Vector3(),
    D: new T.Vector3(),
    factor: 1,
    separators: Array.from({ length: sections }, () => new T.Vector3()),
    limits: new Float64Array(sections),
  }));
  const bodyAttr = jacket.geometry.attributes.position,
    sleeveAttr = sleeve.geometry.attributes.position;
  function read(vec, source, sample) {
    const first = sample.a.id,
      second = sample.b.id;
    vec.fromBufferAttribute(source, first).lerp(scratch.fromBufferAttribute(source, second), sample.t);
  }
  function redraw(inverse) {
    sleeve.updateWorldMatrix(true, false);
    pose.multiplyMatrices(inverse, sleeve.matrixWorld);
    axis.set(0, -1, 0).transformDirection(pose);
    endFrame.setFromRotationMatrix(pose).multiply(bind);
    reverse.copy(endFrame).invert();
    center0.setScalar(0);
    center1.setScalar(0);
    for (let i = 0; i < trunk.length; i++) center0.add(scratch.fromBufferAttribute(bodyAttr, trunk[i].id));
    center0.divideScalar(trunk.length);
    center0.x = side * 0.1078;
    for (let i = 0; i < arm.length; i++) center1.add(scratch.fromBufferAttribute(sleeveAttr, arm[i].id));
    center1.divideScalar(arm.length).applyMatrix4(pose).addScaledVector(axis, -0.00468);
    chord.subVectors(center1, center0);
    const span = chord.length(),
      handle = Math.max(0.036, span * 1.05);
    for (let k = 0; k <= sections; k++) {
      const t = T.MathUtils.clamp((k - 1) / (sections - 2), 0, 1),
        u = 1 - t,
        s = t * t * (3 - 2 * t),
        f = basis[k];
      f.c
        .copy(center0)
        .addScaledVector(chord, s)
        .addScaledVector(t0dir, u * u * t * handle)
        .addScaledVector(axis, -u * t * t * handle);
      direction
        .copy(chord)
        .multiplyScalar(6 * t * u)
        .addScaledVector(t0dir, (1 - 4 * t + 3 * t * t) * handle)
        .addScaledVector(axis, (-2 * t + 3 * t * t) * handle);
      const speed = direction.length();
      f.D.copy(direction).divideScalar(speed || 1);
      // Transport the section normal along the centre of the raised deltoid.
      // Project the rotated fore/aft direction onto its normal plane to keep
      // one consistent right-handed circumference through a lifted arm or a roll.
      frame.identity().slerp(endFrame, t);
      f.V.set(0, 0, 1).applyQuaternion(frame);
      f.V.addScaledVector(f.D, -f.V.dot(f.D)).normalize();
      f.U.crossVectors(f.V, f.D).multiplyScalar(side).normalize();
    }
    for (let k = 2; k < sections - 1; k++) {
      const f = basis[k];
      const width = 0.042,
        depth = 0.046;
      let factor = 1;
      for (let m = 1; m < sections; m++) {
        if (k === m) continue;
        const delta = f.separators[m].subVectors(basis[m].c, f.c);
        f.limits[m] = 0.43 * delta.lengthSq();
        const radius = Math.hypot(width * delta.dot(f.U), depth * delta.dot(f.V));
        if (radius > 0) factor = Math.min(factor, f.limits[m] / radius);
      }
      const towardJacket = Math.hypot(width * f.U.x, depth * f.V.x);
      if (towardJacket > 0) factor = Math.min(factor, (side * f.c.x - 0.109) / towardJacket);
      const towardSleeve = Math.hypot(width * f.U.dot(axis), depth * f.V.dot(axis));
      if (towardSleeve > 0)
        factor = Math.min(factor, (scratch.subVectors(center1, f.c).dot(axis) - 0.0015) / towardSleeve);
      f.factor = Math.max(0.06, factor);
    }
    const reach = T.MathUtils.smoothstep(Math.abs(axis.z), 0.35, 0.65);
    for (let j = 0; j < n; j++) {
      read(a, bodyAttr, bodyLine[j]);
      read(b, sleeveAttr, sleeveLine[j]);
      a.x += side * 0.00095;
      b.applyMatrix4(pose).addScaledVector(axis, -0.00068);
      r0.copy(a).sub(center0);
      r1.copy(b).sub(center1).applyQuaternion(reverse);
      for (let k = 0; k <= sections; k++) {
        const f = basis[k],
          t = T.MathUtils.clamp((k - 1) / (sections - 2), 0, 1),
          blend = t * t * (3 - 2 * t);
        if (k === 0) crown.copy(a);
        else if (k === 1) crown.set(center0.x, a.y, a.z);
        else if (k === sections) crown.copy(b);
        else if (k === sections - 1) crown.copy(b).addScaledVector(axis, -0.004);
        else {
          along
            .copy(f.U)
            .multiplyScalar(lerp(r0.y, r1.y, blend))
            .addScaledVector(f.V, lerp(r0.z, r1.z, blend));
          // Preserve the round shoulder pad on the outside of a gentle
          // bend. In a deeply forward-reaching arm the curved inner fibres
          // also compress their neighbours and the cap narrows as a unit.
          let directional = 1;
          const toJacket = -side * along.x,
            toSleeve = along.dot(axis);
          if (toJacket > 0) directional = Math.min(directional, (side * f.c.x - 0.109) / toJacket);
          if (toSleeve > 0)
            directional = Math.min(
              directional,
              (scratch.subVectors(center1, f.c).dot(axis) - 0.0015) / toSleeve,
            );
          for (let m = 1; m < sections; m++) {
            if (m === k) continue;
            const p = along.dot(f.separators[m]);
            if (p > 0) directional = Math.min(directional, f.limits[m] / p);
          }
          crown.copy(f.c).addScaledVector(along, lerp(Math.max(0.06, directional), f.factor, reach));
        }
        attr.setXYZ(materialPoint(0, k, j), crown.x, crown.y, crown.z);
      }
    }
    // A pressed wool shell has a lining on the inside of each actual cloth
    // normal, including corners where the sleeve enters the armhole. An
    // angle-weighted normal is insensitive to short clipped triangle edges.
    const positions = attr.array,
      normals = norm.array;
    normals.fill(0, 0, ply * 3);
    const indices = geom.index.array,
      faces = geom.userData.crownPlyTriangles * 3;
    for (let face = 0; face < faces; face += 3) {
      const ia = indices[face] * 3,
        ib = indices[face + 1] * 3,
        ic = indices[face + 2] * 3;
      a.fromArray(positions, ia);
      b.fromArray(positions, ib);
      crown.fromArray(positions, ic);
      r0.subVectors(b, a);
      r1.subVectors(crown, a);
      along.crossVectors(r0, r1).normalize();
      const wa = r0.angleTo(r1);
      r0.negate();
      r1.subVectors(crown, b);
      const wb = r0.angleTo(r1),
        wc = Math.PI - wa - wb;
      normals[ia] += along.x * wa;
      normals[ia + 1] += along.y * wa;
      normals[ia + 2] += along.z * wa;
      normals[ib] += along.x * wb;
      normals[ib + 1] += along.y * wb;
      normals[ib + 2] += along.z * wb;
      normals[ic] += along.x * wc;
      normals[ic + 1] += along.y * wc;
      normals[ic + 2] += along.z * wc;
    }
    for (let i = 0; i < ply; i++) {
      along.fromBufferAttribute(norm, i).normalize();
      norm.setXYZ(i, along.x, along.y, along.z);
      norm.setXYZ(i + ply, -along.x, -along.y, -along.z);
      crown.fromBufferAttribute(attr, i).addScaledVector(along, -0.00019);
      attr.setXYZ(i + ply, crown.x, crown.y, crown.z);
    }
    attr.needsUpdate = norm.needsUpdate = true;
  }
  return {
    geom,
    redraw,
    bodyEdge: Array.from({ length: n }, (_, i) => i),
    sleeveEdge: Array.from({ length: n }, (_, i) => sections * n + i),
  };
}

export function setSleeveHeads(suit) {
  const { rig, surfaces } = suit,
    jacket = surfaces['quilted-vest'][0],
    seams = (rig.garments.seams ??= []),
    inverse = new T.Matrix4();
  rig.chest.updateWorldMatrix(true, false);
  inverse.copy(rig.chest.matrixWorld).invert();
  const sites = [1, -1].map((side) => ({ side, cy: 0.129, cz: -0.002, ry: 0.029, rz: 0.042 }));
  const collarHoles = cutBodyPorts(jacket, sites);
  // Enlarge the holes in the layers below. The outer shell covers their
  // seam allowances while the continuous skin passes through all three cuts.
  for (const [name, cols] of [
    ['shirt', 48],
    ['hoodie', 56],
  ])
    cutPorts(
      surfaces[name][0],
      sites.map((s) => ({ ...s, ry: 0.039, rz: 0.054 })),
      cols,
    );
  for (const [i, suffix] of ['L', 'R'].entries()) {
    const side = sites[i].side,
      sleeve = surfaces['sleeve-' + suffix][0],
      shirt = surfaces['shirtsleeve-' + suffix][0];
    const cuts = cutPorts(sleeve, [{ side, arm: true, cutY: -0.064 }], 34);
    cutPorts(shirt, [{ side, arm: true, cutY: -0.074 }], 30);
    const high = makeCrown(jacket, sleeve, collarHoles[0][i], cuts[0][0], side);
    const mobile = makeCrown(jacket, sleeve, collarHoles[1][i], cuts[1][0], side);
    const name = 'shoulder-' + suffix,
      mesh = suit.add(name, rig.chest, high.geom, sleeve.material, true);
    mesh.userData.mobileGeometry = mobile.geom;
    for (const [end, target, key] of [
      ['body', jacket, 'bodyEdge'],
      ['sleeve', sleeve, 'sleeveEdge'],
    ]) {
      seams.push({
        name: name + '-' + end,
        edge: { mesh, indices: { high: high[key], mobile: mobile[key] }, closed: true },
        target,
      });
      suit.beneath(name, end === 'body' ? 'quilted-vest' : 'sleeve-' + suffix);
    }
    high.redraw(inverse);
    mobile.redraw(inverse);
    // The ends of each cut remain on their respective stitched vest/sleeve edges.
    bindCloth(mesh, [rig.chest, sleeve.parent], (j, g) =>
      [0, 1, T.MathUtils.smoothstep(g.attributes.uv.getX(j), 0, 1)]);
  }
}
