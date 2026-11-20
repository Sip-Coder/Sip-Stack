// Cut an actual open-front jacket and its inset dress bodice from the body's
// surface. Sew the outer shell to its lining around every cut edge. Shoulders,
// underarms, elbow bends and the rest of the sleeve share the skin skeleton.
import * as T from 'three';

const smooth = T.MathUtils.smoothstep;
export function fitRomaGarment(body, kind, fabric, trim, pattern, waist) {
  const coat = kind === 'jacket';
  function cutGeometry(g) {
    const p = g.attributes.position,
      norm = g.attributes.normal;
    const srcIdx = g.index.array,
      si = g.attributes.skinIndex,
      sw = g.attributes.skinWeight;
    const sourceCache = new Map(),
      edgeCache = new Map(),
      vertices = [];
    function sample(i) {
      let v = sourceCache.get(i);
      if (v) return v;
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        ax = Math.abs(x);
      // The sleeve belongs to the arm surface even where its vertices borrow
      // a clavicle or chest weight. A skin-weight threshold cuts accidental
      // holes in the medial upper arm as the elbow blend gives way to the shoulder.
      const region = g.userData.anatomicalRegions[i];
      const anatomicalArm = region === 1 || region === 2;
      const opening = 0.027 + 0.023 * (1 - smooth(y, 0.704, 0.802)) + 0.009 * (1 - smooth(y, 0.635, 0.71));
      const edge = Math.max(ax - opening, -z + 0.001);
      let cut;
      if (coat) {
        // Cut the wrist as one complete ring. The inner and outer sleeve meet
        // the shoulder across a curved armscye, with no ball cap over the joint.
        const lower = anatomicalArm ? y - 0.475 : y - 0.666;
        cut = Math.min(lower, 0.793 - y + 0.03 * smooth(ax, 0.04, 0.087), edge);
      } else {
        const front = Math.max(0, z / Math.hypot(x * 0.65, z || 1e-9)),
          neckline = 0.764 - 0.062 * front ** 4 - 0.055 * smooth(ax, 0.061, 0.099);
        cut = anatomicalArm ? -1 : Math.min(y - 0.591, neckline - y);
      }
      // Under the belt the bodice uses its own folded edge; above the bust
      // the lapels return across the collar and turn up subtly at the edge.
      const edgeRoll = coat ? 1 - smooth(edge, 0, 0.008) : 0;
      const cuff = coat && anatomicalArm ? 1 - smooth(y, 0.481, 0.489) : 0;
      const hem = coat ? 0.00165 : 0.00105;
      const ease = coat ? 0.001 + 0.0017 * edgeRoll + 0.002 * cuff : 0.0036;
      const direction = new T.Vector3().fromBufferAttribute(norm, i);
      const folds = [];
      for (const side of [1, -1]) {
        const mask = coat && Math.sign(x) === side && anatomicalArm ? 1 : 0;
        const elbow = mask * (1 - smooth(Math.abs(y - 0.609), 0.015, 0.057));
        const shoulderBend = mask * (1 - smooth(Math.abs(y - 0.759), 0.012, 0.055));
        const wave = Math.sin((y - 0.609) * 375 + (x - 0.13 * side) * 36 + (0.95 * z) / 0.03);
        const shoulderWave = Math.sin((y - 0.759) * 265 + (x - 0.12 * side) * 63 + z * 49);
        folds.push(elbow * wave * 0.0034, shoulderBend * shoulderWave * 0.0023);
      }
      const weights = new Map();
      for (let j = 0; j < 4; j++)
        if (sw.array[4 * i + j] > 0.00001) weights.set(si.array[4 * i + j], sw.array[4 * i + j]);
      v = {
        x,
        y,
        z,
        n: direction,
        ease,
        cut,
        hem,
        folds,
        weights,
        trim: Math.max(cuff, edgeRoll),
        id: i,
        surface: -1,
      };
      sourceCache.set(i, v);
      return v;
    }
    function cross(v, w) {
      const hash = Math.min(v.id, w.id) * p.count + Math.max(v.id, w.id);
      let a = edgeCache.get(hash);
      if (a) return a;
      const t = T.MathUtils.clamp(v.cut / (v.cut - w.cut), 0.009, 0.991),
        weights = new Map();
      for (const [j, e] of v.weights) weights.set(j, (1 - t) * e);
      for (const [j, e] of w.weights) weights.set(j, (weights.get(j) || 0) + t * e);
      const mix = (l, r) => T.MathUtils.lerp(l, r, t);
      a = {
        x: mix(v.x, w.x),
        y: mix(v.y, w.y),
        z: mix(v.z, w.z),
        n: v.n.clone().lerp(w.n, t).normalize(),
        ease: mix(v.ease, w.ease),
        hem: mix(v.hem, w.hem),
        folds: v.folds.map((f, k) => mix(f, w.folds[k])),
        weights,
        trim: mix(v.trim, w.trim),
        surface: -1,
      };
      edgeCache.set(hash, a);
      return a;
    }
    const top = [],
      edges = new Map();
    function register(v) {
      if (v.surface !== -1) return v.surface;
      const id = vertices.length;
      vertices.push(v);
      v.surface = id;
      return id;
    }
    function triangle(v, w, h) {
      const a = register(v),
        b = register(w),
        c = register(h);
      top.push(a, b, c);
      for (const [j, k] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = Math.min(j, k) * 1000000 + Math.max(j, k);
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [j, k]);
      }
    }
    for (let i = 0; i < srcIdx.length; i += 3) {
      const a = sample(srcIdx[i]),
        b = sample(srcIdx[i + 1]),
        c = sample(srcIdx[i + 2]);
      if (a.cut < 0 && b.cut < 0 && c.cut < 0) continue;
      if (a.cut >= 0 && b.cut >= 0 && c.cut >= 0) {
        triangle(a, b, c);
        continue;
      }
      const polygon = [];
      for (const [v, w] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        if (v.cut >= 0) polygon.push(v);
        if (v.cut < 0 !== w.cut < 0) polygon.push(cross(v, w));
      }
      for (let k = 1; k < polygon.length - 1; k++) triangle(polygon[0], polygon[k], polygon[k + 1]);
    }
    const waistIndices = [],
      normalsAtWaist = [];
    if (coat) {
      // Loft the upper pattern's true cut boundary down to the exact edge of
      // the sprung lower panels. The two patterns meet edge-to-edge through
      // the waist, with no overlapping slabs or unsupported skin slivers.
      const edgeVertices = new Set(),
        neighbours = new Map();
      for (const [a, b] of edges.values()) {
        const v = vertices[a],
          w = vertices[b];
        for (const [u, h] of [
          [a, b],
          [b, a],
        ]) {
          if (!neighbours.has(u)) neighbours.set(u, []);
          neighbours.get(u).push(h);
        }
        if (Math.abs(v.y - 0.666) < 0.00016 && Math.abs(w.y - 0.666) < 0.00016) {
          edgeVertices.add(a);
          edgeVertices.add(b);
        }
      }
      const angle = (v) => {
        const a = Math.atan2(v.x, v.z);
        return a < 0 ? a + 2 * Math.PI : a;
      };
      const upper = [...edgeVertices].sort((a, b) => angle(vertices[a]) - angle(vertices[b]));
      if (upper.length < 12) throw Error('Incomplete jacket waist edge');
      // Include the two mitred corners in the continuation. Leaving the small
      // diagonal ends on the public edge produces a visible ledge at the lapel.
      for (const start of [true, false]) {
        let end = start ? upper[0] : upper.at(-1);
        for (let k = 0; k < 10; k++) {
          const v = vertices[end],
            next = neighbours.get(end).find((i) => !edgeVertices.has(i));
          if (next === undefined) break;
          const w = vertices[next];
          if (w.y > 0.675 || Math.abs(w.x) >= Math.abs(v.x) - 0.00003) break;
          edgeVertices.add(next);
          if (start) upper.unshift(next);
          else upper.push(next);
          end = next;
        }
      }
      const lower = [];
      for (const point of waist.edge) {
        const w = {
          x: point.x,
          y: point.y,
          z: point.z,
          n: new T.Vector3(point.x, 0, point.z).normalize(),
          ease: 0,
          hem: 0.00165,
          folds: [0, 0, 0, 0],
          weights: new Map([[1, 1]]),
          trim: 0,
          surface: -1,
        };
        lower.push(register(w));
        waistIndices.push(w.surface);
      }
      function fractions(ids) {
        const a = angle(vertices[ids[0]]),
          span = angle(vertices[ids.at(-1)]) - a;
        return ids.map((i) => (angle(vertices[i]) - a) / span);
      }
      const lo = fractions(lower),
        hi = fractions(upper),
        middle = [];
      let j = 0;
      for (let i = 0; i < lower.length; i++) {
        const bottom = waist.edge[i],
          below = waist.support[i];
        while (j + 2 < hi.length && hi[j + 1] < lo[i]) j++;
        const a = vertices[upper[j]],
          b = vertices[upper[j + 1]];
        const t = T.MathUtils.clamp((lo[i] - hi[j]) / (hi[j + 1] - hi[j] || 1), 0, 1);
        const top = new T.Vector3(a.x + a.n.x * a.ease, a.y + a.n.y * a.ease, a.z + a.n.z * a.ease).lerp(
          new T.Vector3(b.x + b.n.x * b.ease, b.y + b.n.y * b.ease, b.z + b.n.z * b.ease),
          t,
        );
        const h = top.y - bottom.y,
          normal = a.n.clone().lerp(b.n, t).normalize();
        const radial = new T.Vector3(top.x, 0, top.z).normalize();
        const lowerSlope = bottom
          .clone()
          .sub(below)
          .divideScalar(bottom.y - below.y);
        const upperSlope = radial.multiplyScalar(
          T.MathUtils.clamp(-normal.y / Math.max(0.1, Math.hypot(normal.x, normal.z)), -0.6, 0.6),
        );
        upperSlope.y = 1;
        const middlePoint = bottom
          .clone()
          .lerp(top, 0.5)
          .addScaledVector(lowerSlope.sub(upperSlope), 0.125 * h);
        const w = {
          ...vertices[lower[i]],
          x: middlePoint.x,
          y: middlePoint.y,
          z: middlePoint.z,
          surface: -1,
        };
        middle.push(register(w));
        const tangent = waist.edge[Math.min(i + 1, lower.length - 1)]
          .clone()
          .sub(waist.edge[Math.max(i - 1, 0)]);
        normalsAtWaist.push(tangent.cross(middlePoint.clone().sub(below)).normalize());
      }
      for (let i = 0; i < lower.length - 1; i++) {
        triangle(vertices[lower[i]], vertices[lower[i + 1]], vertices[middle[i]]);
        triangle(vertices[middle[i]], vertices[lower[i + 1]], vertices[middle[i + 1]]);
      }
      let a = 0,
        b = 0;
      while (a + 1 < middle.length || b + 1 < upper.length) {
        const nextLow = a + 1 < lo.length ? lo[a + 1] : Infinity,
          nextHigh = b + 1 < hi.length ? hi[b + 1] : Infinity;
        if (nextLow < nextHigh) {
          triangle(vertices[middle[a]], vertices[middle[a + 1]], vertices[upper[b]]);
          a++;
        } else {
          triangle(vertices[middle[a]], vertices[upper[b + 1]], vertices[upper[b]]);
          b++;
        }
      }
    }
    const xyz = [],
      joints = [],
      weights = [],
      uv = [],
      colors = [],
      morphs = [[], [], [], [], [], []],
      count = vertices.length;
    for (let shell = 0; shell < 2; shell++)
      for (const v of vertices) {
        const d = v.ease - shell * v.hem;
        xyz.push(v.x + d * v.n.x, v.y + d * v.n.y, v.z + d * v.n.z);
        colors.push(1 + 0.055 * v.trim, 1 + 0.09 * v.trim, 1 + 0.14 * v.trim);
        uv.push(Math.atan2(v.x, v.z) / (2 * Math.PI) + 0.5, v.y);
        const influence = [...v.weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = influence.reduce((s, j) => s + j[1], 0);
        for (let k = 0; k < 4; k++) {
          joints.push(influence[k]?.[0] || 0);
          weights.push((influence[k]?.[1] || 0) / sum);
        }
        for (let m = 0; m < 4; m++)
          morphs[m].push(v.n.x * v.folds[m], v.n.y * v.folds[m], v.n.z * v.folds[m]);
        for (let k = 0; k < 2; k++) {
          const a = Math.abs(v.x),
            weight =
              (k === (v.x > 0 ? 0 : 1) ? 1 : 0) *
              smooth(a, 0.095, 0.126) *
              (1 - smooth(a, 0.17, 0.19)) *
              smooth(v.y, 0.735, 0.777) *
              smooth(v.z, -0.01, 0.022);
          morphs[4 + k].push(Math.sign(v.x) * 0.005 * weight, 0.01 * weight, 0.018 * weight);
        }
      }
    const lining = [],
      facing = [];
    for (let i = 0; i < top.length; i += 3)
      lining.push(top[i] + count, top[i + 2] + count, top[i + 1] + count);
    for (const [a, b] of edges.values()) facing.push(b, a, a + count, b, a + count, b + count);
    const geometry = new T.BufferGeometry();
    geometry.userData.waistEdge = waistIndices;
    // These two structured rows follow the sewn chest frame up to the
    // underarm. Let the fitted sleeve above articulate through the shoulder.
    if (coat)
      geometry.userData.chestAnchors = new Set(
        waistIndices.flatMap((i) => [i, i + count, i + waistIndices.length, i + count + waistIndices.length]),
      );
    geometry.userData.outerTriangles = top.length / 3;
    if (coat) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(joints, 4));
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    geometry.setIndex([...top, ...lining, ...facing]);
    geometry.addGroup(0, top.length + lining.length, 0);
    geometry.addGroup(top.length + lining.length, facing.length, 1);
    if (coat) {
      geometry.morphTargetsRelative = true;
      geometry.morphAttributes.position = morphs.map((a) => new T.Float32BufferAttribute(a, 3));
    }
    geometry.computeVertexNormals();
    const joinedNormals = new Float32Array(waistIndices.length * 3);
    for (let i = 0; i < waistIndices.length; i++) {
      const v = normalsAtWaist[i];
      geometry.attributes.normal.setXYZ(waistIndices[i], v.x, v.y, v.z);
      v.toArray(joinedNormals, i * 3);
    }
    geometry.userData.waistNormals = joinedNormals;
    geometry.computeBoundingSphere();
    return geometry;
  }
  const mesh = new T.SkinnedMesh(cutGeometry(pattern?.high ?? body.geometry), [fabric, trim]);
  mesh.userData.mobileGeometry = cutGeometry(pattern?.mobile ?? body.userData.mobileGeometry);
  mesh.name = coat ? 'Roma shaped jacket yoke and sleeves' : 'Roma fitted dress bodice';
  body.parent.add(mesh);
  mesh.bind(body.skeleton, body.bindMatrix);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
