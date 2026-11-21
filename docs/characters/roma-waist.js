// A sewn rib-knit waistband follows the sweatshirt's actual bottom edge. A
// few radial slices of the underlying skinned torso support the free rows as
// the pelvis and ribcage move independently through a bank or a deep crouch.
import * as T from 'three';
const turn = 2 * Math.PI;
export function bindKnitWaist(rig, body, crew, rest) {
  const columns = 64,
    slices = 32,
    heights = [0.542, 0.562, 0.585, 0.608, 0.633, 0.662],
    n = heights.length;
  const p = new T.Vector3(),
    q = new T.Vector3(),
    toHips = new T.Matrix4();
  const surface = new Float32Array(n * slices * 3),
    top = new Float32Array(columns * 3),
    target = new Float32Array(columns * 3);
  const plans = new Map();
  const angle = (x, z) => (Math.atan2(x, z) + turn) % turn;
  for (const low of [false, true]) {
    const bodyGeo = low ? body.userData.mobileGeometry : body.geometry,
      crewGeo = low ? crew.userData.mobileGeometry : crew.geometry;
    const skin = bodyGeo.attributes.position,
      index = bodyGeo.index,
      regions = bodyGeo.userData.anatomicalRegions;
    const ray = new T.Ray(),
      hit = new T.Vector3(),
      a = new T.Vector3();
    const probes = [];
    for (const y of heights) {
      const faces = [];
      for (let t = 0; t < index.count; t += 3) {
        const ia = index.getX(t),
          ib = index.getX(t + 1),
          ic = index.getX(t + 2);
        if (
          regions[ia] === 1 ||
          regions[ia] === 2 ||
          regions[ib] === 1 ||
          regions[ib] === 2 ||
          regions[ic] === 1 ||
          regions[ic] === 2
        )
          continue;
        const ya = skin.getY(ia),
          yb = skin.getY(ib),
          yc = skin.getY(ic);
        if (y < Math.min(ya, yb, yc) || y > Math.max(ya, yb, yc)) continue;
        faces.push({
          ia,
          ib,
          ic,
          a: new T.Vector3().fromBufferAttribute(skin, ia),
          b: new T.Vector3().fromBufferAttribute(skin, ib),
          c: new T.Vector3().fromBufferAttribute(skin, ic),
        });
      }
      for (let i = 0; i < slices; i++) {
        ray.origin.set(0, y, 0);
        ray.direction.set(Math.sin((i / slices) * turn), 0, Math.cos((i / slices) * turn));
        let found = null,
          far = 0;
        for (const f of faces) {
          if (!ray.intersectTriangle(f.a, f.b, f.c, false, hit)) continue;
          const r = hit.dot(ray.direction);
          if (r <= far) continue;
          far = r;
          const w = T.Triangle.getBarycoord(hit, f.a, f.b, f.c, a);
          found = { ia: f.ia, ib: f.ib, ic: f.ic, wa: w.x, wb: w.y, wc: w.z };
        }
        if (!found) throw Error('Open waist support row ' + y);
        probes.push(found);
      }
    }
    const pos = crewGeo.attributes.position,
      edge = crewGeo.userData.hemEdge
        .map((i) => ({ i, a: angle(pos.getX(i), pos.getZ(i)) }))
        .sort((v, w) => v.a - w.a);
    const seams = [];
    for (let i = 0; i < columns; i++) {
      const az = (turn * i) / columns;
      const next = edge.findIndex((e) => e.a > az),
        hi = next < 0 ? 0 : next,
        lo = (hi + edge.length - 1) % edge.length;
      const u = ((az - edge[lo].a + turn) % turn) / ((edge[hi].a - edge[lo].a + turn) % turn || 1);
      seams.push({ a: edge[lo].i, b: edge[hi].i, u });
      if (!low) {
        p.fromBufferAttribute(pos, edge[lo].i).lerp(q.fromBufferAttribute(pos, edge[hi].i), u);
        p.y -= rig.hips.position.y;
        p.toArray(target, 3 * i);
      }
    }
    plans.set(bodyGeo, { probes, seams });
  }
  function update() {
    rig.hips.updateWorldMatrix(true, true);
    body.updateMatrixWorld(true);
    crew.updateMatrixWorld(true);
    toHips.copy(rig.hips.matrixWorld).invert().multiply(body.matrixWorld);
    const plan = plans.get(body.geometry);
    let j = 0;
    for (const s of plan.probes) {
      body.getVertexPosition(s.ia, p).multiplyScalar(s.wa);
      p.addScaledVector(body.getVertexPosition(s.ib, q), s.wb).addScaledVector(
        body.getVertexPosition(s.ic, q),
        s.wc,
      );
      p.applyMatrix4(toHips).toArray(surface, j);
      j += 3;
    }
    j = 0;
    for (const s of plan.seams) {
      crew
        .getVertexPosition(s.a, p)
        .lerp(crew.getVertexPosition(s.b, q), s.u)
        .applyMatrix4(toHips)
        .toArray(top, j);
      j += 3;
    }
  }
  function anchor(point, i) {
    const col = i % columns,
      k = col * 3,
      row = Math.floor(i / columns);
    const w = 0.55 + (0.45 * row) / 7;
    if (row >= 6) {
      const h = row === 7 ? 0 : 0.005;
      point.set(top[k] * 1.019, top[k + 1] - h, top[k + 2] * 1.019);
    } else {
      point.x += (top[k] - target[k]) * w;
      point.y += (top[k + 1] - target[k + 1]) * w;
      point.z += (top[k + 2] - target[k + 2]) * w;
    }
  }
  function support(point, i) {
    const a = 3 * i,
      rr = Math.hypot(rest[a], rest[a + 2]),
      ux = rest[a] / rr,
      uz = rest[a + 2] / rr;
    const col = Math.round(((i % columns) * slices) / columns),
      y = point.y;
    let h = -Infinity;
    for (let d = -5; d <= 5; d++) {
      const k = 3 * ((col + d + slices) % slices);
      for (let row = 1; row < n; row++) {
        const a = k + (row - 1) * slices * 3,
          b = a + slices * 3;
        const ya = surface[a + 1],
          yb = surface[b + 1];
        if (y < Math.min(ya, yb) - 0.002 || y > Math.max(ya, yb) + 0.002) continue;
        const t = T.MathUtils.clamp((y - ya) / (yb - ya || 1e-9), 0, 1);
        const x = T.MathUtils.lerp(surface[a], surface[b], t),
          z = T.MathUtils.lerp(surface[a + 2], surface[b + 2], t);
        h = Math.max(h, ux * x + uz * z);
      }
    }
    const need = h + 0.0035 - point.x * ux - point.z * uz;
    if (need > 0) {
      point.x += ux * need;
      point.z += uz * need;
    }
  }
  return { update, anchor, support };
}
