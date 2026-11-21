// Roma's explorer layers. Torso and face use +Z forward; her anatomical left is +X.
import * as T from 'three';

function grid(rows, columns, sample) {
  const p = [],
    uv = [],
    index = [];
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c <= columns; c++) {
      const u = c / columns,
        v = r / rows;
      p.push(...sample(u, v));
      uv.push(u, v);
      if (r && c) {
        const a = (r - 1) * (columns + 1) + c - 1,
          b = a + 1,
          d = a + columns + 1;
        index.push(a, d, b, b, d, d + 1);
      }
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// An undulating woven band follows the crown from ear to ear, leaving the
// curled fringe at the face and the layered back free. The original tiny
// teardrops are embroidery stitches on this strip's own UV layout.
export function makeRomaBand(head, red, threadColor) {
  const root = new T.Group();
  root.name = 'Roma paisley hairband';
  head.add(root);
  const p = (u, v) => {
    const a = (u - 0.5) * Math.PI * 1.03,
      t = 2 * v - 1;
    const arch = Math.cos(a);
    return [
      0.002 + (0.079 - 0.0019 * t) * Math.sin(a),
      0.073 + 0.087 * arch - 0.008 * t * (0.38 + 0.62 * arch) + 0.0007 * Math.cos((t * Math.PI) / 2),
      0.021 + 0.008 * arch + 0.01 * t,
    ];
  };
  const cloth = red.clone();
  const rows = 64,
    cols = 12;
  const geo = grid(cols, rows, p);
  const outer = geo.attributes.position.array,
    uv0 = geo.attributes.uv.array,
    tri = [...geo.index.array];
  const total = outer.length / 3,
    positions = [...outer],
    uv = [...uv0];
  const index = [...tri];
  for (let k = 0; k < total; k++) {
    const u = (k % (rows + 1)) / rows,
      a = (u - 0.5) * Math.PI * 1.03;
    positions.push(
      outer[k * 3] - 0.0012 * Math.sin(a),
      outer[k * 3 + 1] - 0.0012 * Math.cos(a),
      outer[k * 3 + 2] - 0.00035,
    );
    uv.push(uv0[2 * k], uv0[2 * k + 1]);
  }
  for (let k = 0; k < tri.length; k += 3) index.push(total + tri[k], total + tri[k + 2], total + tri[k + 1]);
  const rim = (a, b) => index.push(b, a, a + total, b, a + total, b + total);
  for (let c = 0; c < rows; c++) {
    rim(c + 1, c);
    rim(cols * (rows + 1) + c, cols * (rows + 1) + c + 1);
  }
  for (let r = 0; r < cols; r++) {
    rim(r * (rows + 1), (r + 1) * (rows + 1));
    rim((r + 1) * (rows + 1) + rows, r * (rows + 1) + rows);
  }
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const colors = [];
  const m = new T.Color(threadColor),
    base = new T.Color(1, 1, 1);
  for (let r = 0; r <= cols; r++)
    for (let c = 0; c <= rows; c++) {
      const u = c / rows,
        v = r / cols;
      const embroidery = r === 1 || r === cols - 1 ? 0.32 : 0;
      const color = base.clone().lerp(m, embroidery);
      colors.push(color.r, color.g, color.b);
    }
  geo.setAttribute('color', new T.Float32BufferAttribute([...colors, ...colors], 3));
  cloth.vertexColors = true;
  cloth.side = T.DoubleSide;
  const panel = new T.Mesh(geo, cloth);
  panel.castShadow = true;
  root.add(panel);
  return { root, p, cloth: panel };
}

export function addBandStitching(band, node, thread, mat) {
  const bias = node(band.root);
  for (let k = 0; k < 15; k++) {
    const u = (k + 1) / 16;
    const side = k % 2 ? 1 : -1;
    const v = 0.5 + side * 0.095;
    const points = [];
    for (let j = 0; j <= 14; j++) {
      const a = (j / 14) * Math.PI * 2;
      const q = band.p(
        u + 0.0125 * Math.sin(a) * (1 - 0.45 * Math.cos(a)),
        v + 0.145 * Math.cos(a) + 0.057 * Math.sin(a),
      );
      q[0] += 0.00028 * Math.sin((u - 0.5) * Math.PI);
      q[1] += 0.0004 * Math.cos((u - 0.5) * Math.PI);
      points.push(q);
    }
    thread(bias, mat, points, 0.00032);
  }
}

// Cut the folded hood on the real yoke's neck and shoulder surface. The inner
// and outer walls share the underlying triangle's bone weights, including
// clavicle rotation. The longer rear fall and doubled rolls are part of the cut.
export function makeRomaHood(root, cream, body, crew, coat) {
  function cut(mobile) {
    const origin = new T.Vector3(0, 0.729, 0),
      ray = new T.Ray(origin);
    const a = new T.Vector3(),
      q = new T.Vector3();
    const bary = new T.Vector3(),
      triangles = [],
      parts = [body, crew, coat];
    const rowCount = 12,
      sides = 64;
    const pos = [],
      uv = [],
      bones = [],
      weights = [],
      index = [];
    for (const part of parts) {
      const g = mobile ? part.userData.mobileGeometry : part.geometry,
        p = g.attributes.position,
        ix = g.index;
      const n = g.userData.outerTriangles ?? ix.count / 3;
      for (let t = 0; t < n; t++) {
        const ids = [ix.getX(3 * t), ix.getX(3 * t + 1), ix.getX(3 * t + 2)];
        if (
          ids.every((i) => p.getY(i) < 0.665) ||
          ids.every((i) => p.getY(i) > 0.845) ||
          ids.every((i) => Math.abs(p.getX(i)) > 0.114)
        )
          continue;
        triangles.push([
          g,
          ids,
          new T.Vector3().fromBufferAttribute(p, ids[0]),
          new T.Vector3().fromBufferAttribute(p, ids[1]),
          new T.Vector3().fromBufferAttribute(p, ids[2]),
        ]);
      }
    }
    const meridians = Array.from({ length: sides }, (_, i) => {
      const ang = (i / sides) * 2 * Math.PI,
        s = Math.sin(ang),
        c = Math.cos(ang);
      return triangles.filter((t) => {
        const h = t[2].x * c - t[2].z * s,
          j = t[3].x * c - t[3].z * s,
          k = t[4].x * c - t[4].z * s;
        return (
          Math.min(h, j, k) <= 1e-9 &&
          Math.max(h, j, k) >= -1e-9 &&
          Math.max(t[2].x * s + t[2].z * c, t[3].x * s + t[3].z * c, t[4].x * s + t[4].z * c) > 0
        );
      });
    });
    const grids = [];
    for (let j = 0; j <= rowCount; j++) {
      const v = j / rowCount,
        row = [];
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * 2 * Math.PI,
          x = Math.sin(ang),
          z = Math.cos(ang);
        const front = Math.max(0, z),
          back = Math.max(0, -z),
          side = x * x;
        const inner = 2.55 + 0.4 * side + 0.3 * back - 0.24 * front;
        const outer = 0.96 * side + 0.17 * front - 0.48 * back;
        const slope =
          T.MathUtils.lerp(inner, outer, v) + 0.1 * Math.cos(2 * ang + 0.4) * Math.sin(Math.PI * v);
        ray.direction.set(x, slope, z).normalize();
        let far = -1,
          winner = null;
        for (const t of meridians[i]) {
          if (!ray.intersectTriangle(t[2], t[3], t[4], false, q)) continue;
          const d = q.distanceTo(origin);
          if (d > far && d < 0.126) {
            far = d;
            winner = t;
          }
        }
        if (!winner) throw Error('Unseated hood panel ' + j + ' ' + i);
        ray.at(far, q);
        T.Triangle.getBarycoord(q, winner[2], winner[3], winner[4], bary);
        const entries = new Map(),
          g = winner[0];
        for (let k = 0; k < 3; k++) {
          const vi = winner[1][k],
            f = bary.getComponent(k);
          for (let h = 0; h < 4; h++) {
            const id = g.attributes.skinIndex.getComponent(vi, h),
              w = g.attributes.skinWeight.getComponent(vi, h) * f;
            if (w > 1e-7) entries.set(id, (entries.get(id) || 0) + w);
          }
        }
        const ranked = [...entries].sort((a, b) => b[1] - a[1]).slice(0, 4),
          sum = ranked.reduce((t, p) => t + p[1], 0);
        const roll =
          0.0065 +
          0.029 * front * side +
          0.025 * back * side +
          0.008 * Math.sin(Math.PI * v) ** 2 +
          0.006 * Math.exp(-(((v - 0.26) / 0.12) ** 2)) +
          0.0012 * Math.sin(3 * ang + 4 * v);
        row.push({ dir: ray.direction.clone(), base: q.clone(), roll, ranked, sum });
      }
      grids.push(row);
    }
    for (let wall = 0; wall < 2; wall++)
      for (let j = 0; j <= rowCount; j++)
        for (let i = 0; i < sides; i++) {
          const v = grids[j][i];
          a.copy(v.base).addScaledVector(v.dir, v.roll + (wall ? 0 : 0.0016));
          pos.push(a.x, a.y, a.z);
          uv.push(i / sides, j / rowCount);
          for (let h = 0; h < 4; h++) {
            bones.push(v.ranked[h]?.[0] ?? 0);
            weights.push((v.ranked[h]?.[1] ?? 0) / v.sum);
          }
        }
    const layer = (rowCount + 1) * sides;
    for (let j = 0; j < rowCount; j++)
      for (let i = 0; i < sides; i++) {
        const a = j * sides + i,
          b = j * sides + ((i + 1) % sides),
          c = a + sides,
          d = b + sides;
        index.push(a, c, b, b, c, d, a + layer, b + layer, c + layer, b + layer, d + layer, c + layer);
      }
    for (let i = 0; i < sides; i++) {
      const k = (i + 1) % sides,
        a = rowCount * sides + i,
        b = rowCount * sides + k;
      index.push(i, k, k + layer, i, k + layer, i + layer, b, a, a + layer, b, a + layer, b + layer);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(bones, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    g.setIndex(index);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  const mesh = new T.SkinnedMesh(cut(false), cream);
  mesh.userData.mobileGeometry = cut(true);
  mesh.name = 'Roma folded cream hood';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(body.skeleton, body.bindMatrix);
  return mesh;
}

export function addRomaSneaker(foot, side, mat, geometry) {
  const { node, add, oval, thread, tailored } = geometry;
  const shoe = node(foot),
    { purple, cream, sole, stitch } = mat;
  shoe.name = 'Roma high-top sneaker';
  shoe.scale.set(1.23, 1, 1.09);
  shoe.position.z = 0.0018;
  // Rounded toe and monolithic rubber outsole have a flat planted bottom.
  const stack = (rows, m) => add(shoe, tailored(rows, 52), m);
  stack(
    [
      [-0.047, 0.028, 0.058, 0.02],
      [-0.0469, 0.03, 0.062, 0.02],
      [-0.044, 0.032, 0.064, 0.022],
      [-0.034, 0.032, 0.064, 0.022],
      [-0.03, 0.03, 0.062, 0.024],
    ],
    sole,
  );
  stack(
    [
      [-0.03, 0.03, 0.062, 0.024],
      [-0.023, 0.031, 0.062, 0.024],
      [-0.014, 0.0295, 0.059, 0.0235],
      [-0.006, 0.026, 0.051, 0.019],
      [0.006, 0.025, 0.043, 0.012],
      [0.017, 0.025, 0.035, 0.002],
      [0.034, 0.026, 0.03, -0.0025],
      [0.04, 0.024, 0.027, -0.0015],
    ],
    purple,
  );
  const tongue = node(shoe, 0, 0, 0.0215);
  oval(tongue, cream, 0, 0.014, 0.001, 0.017, 0.033, 0.006, -0.29);
  // Contrasting toe panel and paired rows of cotton laces.
  oval(shoe, cream, 0, -0.021, 0.0645, 0.025, 0.01, 0.021, -0.18);
  for (let i = 0; i < 4; i++) {
    const y = -0.012 + i * 0.009;
    const z = 0.056 - i * 0.007;
    for (const dir of [-1, 1])
      thread(
        shoe,
        cream,
        [
          [dir * 0.017, y, z - 0.005],
          [dir * 0.007, y + 0.002, z + 0.001],
          [-dir * 0.014, y + 0.006, z - 0.006],
        ],
        0.00135,
      );
  }
  for (const s of [-1, 1]) {
    const line = [
      [s * 0.029, -0.025, 0.046],
      [s * 0.029, -0.014, 0.032],
      [s * 0.025, 0.001, 0.01],
      [s * 0.025, 0.022, -0.014],
    ];
    thread(shoe, stitch, line, 0.00115);
    thread(
      shoe,
      cream,
      [
        [s * 0.028, -0.013, 0.014],
        [s * 0.028, -0.006, 0.002],
        [s * 0.026, -0.005, -0.018],
      ],
      0.0021,
    );
  }
  const cuff = node(foot, 0, 0.044, -0.003);
  cuff.name = 'Roma turned ankle cuff ' + (side > 0 ? 'L' : 'R');
  add(
    cuff,
    tailored(
      [
        [-0.005, 0.027, 0.03],
        [-0.004, 0.032, 0.032],
        [0.005, 0.032, 0.032],
        [0.009, 0.03, 0.03],
      ],
      40,
    ),
    mat.cargo,
  );
  return cuff;
}

// Bind the satin stitches to the sleeve's actual outer face. A regular fitting
// grid preserves the drawn motif while the inherited yoke weights and crease
// targets keep it on the fabric through elbow flexion and overhead reaches.
export function seatRomaEmbroidery(root, badge, coat) {
  const width = 0.035,
    height = 0.064,
    nx = 11,
    ny = 17;
  const p = new T.Vector3(),
    q = new T.Vector3(),
    bary = new T.Vector3(),
    ray = new T.Ray();
  const colors = [...badge.children];
  function grid(low) {
    const g = low ? coat.userData.mobileGeometry : coat.geometry,
      pos = g.attributes.position,
      norm = g.attributes.normal,
      idx = g.index;
    const faces = [];
    for (let i = 0; i < g.userData.outerTriangles; i++) {
      const ids = [idx.getX(3 * i), idx.getX(3 * i + 1), idx.getX(3 * i + 2)];
      if (
        ids.every((k) => pos.getY(k) < 0.638) ||
        ids.every((k) => pos.getY(k) > 0.721) ||
        ids.every((k) => pos.getX(k) < 0.087) ||
        ids.every((k) => pos.getZ(k) < -0.002)
      )
        continue;
      faces.push({ ids, pts: ids.map((k) => new T.Vector3().fromBufferAttribute(pos, k)) });
    }
    const cells = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const y = 0.679 + (j / (ny - 1) - 0.5) * height,
          u = i / (nx - 1);
        const a = 0.745 + ((u - 0.5) * width) / 0.034;
        ray.origin.set(0.117, y, -0.002);
        ray.direction.set(Math.sin(a), 0, Math.cos(a));
        let far = -Infinity,
          chosen;
        for (const f of faces) {
          if (!ray.intersectTriangle(f.pts[0], f.pts[1], f.pts[2], false, p)) continue;
          const d = p.distanceTo(ray.origin);
          if (d > far) {
            chosen = f;
            far = d;
          }
        }
        if (!chosen) throw Error('Unseated sleeve embroidery');
        ray.at(far, p);
        const { ids, pts } = chosen;
        T.Triangle.getBarycoord(p, ...pts, bary);
        const n = new T.Vector3(),
          weights = new Map(),
          morph = g.morphAttributes.position.map(() => new T.Vector3());
        for (let h = 0; h < 3; h++) {
          const w = bary.getComponent(h),
            k = ids[h];
          n.addScaledVector(q.fromBufferAttribute(norm, k), w);
          for (let b = 0; b < 4; b++) {
            const joint = g.attributes.skinIndex.getComponent(k, b),
              v = w * g.attributes.skinWeight.getComponent(k, b);
            if (v > 1e-7) weights.set(joint, (weights.get(joint) || 0) + v);
          }
          for (let m = 0; m < morph.length; m++)
            morph[m].addScaledVector(q.fromBufferAttribute(g.morphAttributes.position[m], k), w);
        }
        cells.push({ p: p.clone(), n: n.normalize(), weights, morph });
      }
    return cells;
  }
  const hi = grid(false),
    lo = grid(true);
  function fit(g, cells) {
    const src = g.attributes.position,
      indices = [],
      weights = [],
      morph = cells[0].morph.map(() => new Float32Array(3 * src.count));
    for (let k = 0; k < src.count; k++) {
      const dx = src.getX(k),
        dy = src.getY(k),
        relief = src.getZ(k);
      const u = T.MathUtils.clamp(0.5 + dx / width, 0, 0.999999) * (nx - 1),
        v = T.MathUtils.clamp(0.5 + dy / height, 0, 0.999999) * (ny - 1);
      const x = Math.floor(u),
        y = Math.floor(v),
        s = u - x,
        t = v - y,
        votes = new Map();
      const ns = [
        cells[y * nx + x],
        cells[y * nx + x + 1],
        cells[(y + 1) * nx + x],
        cells[(y + 1) * nx + x + 1],
      ];
      const blend = [(1 - s) * (1 - t), s * (1 - t), (1 - s) * t, s * t];
      p.set(0, 0, 0);
      q.set(0, 0, 0);
      for (let a = 0; a < 4; a++) {
        const c = ns[a],
          w = blend[a];
        p.addScaledVector(c.p, w);
        q.addScaledVector(c.n, w);
        for (const [joint, value] of c.weights) votes.set(joint, (votes.get(joint) || 0) + value * w);
        for (let m = 0; m < morph.length; m++)
          for (let d = 0; d < 3; d++) morph[m][3 * k + d] += w * c.morph[m].getComponent(d);
      }
      p.addScaledVector(q.normalize(), 0.001 + relief);
      src.setXYZ(k, p.x, p.y, p.z);
      const ranked = [...votes].sort((a, b) => b[1] - a[1]).slice(0, 4),
        sum = ranked.reduce((v, e) => v + e[1], 0);
      for (let j = 0; j < 4; j++) {
        indices.push(ranked[j]?.[0] ?? 0);
        weights.push((ranked[j]?.[1] ?? 0) / sum);
      }
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    g.morphAttributes.position = morph.map((a) => new T.BufferAttribute(a, 3));
    g.morphTargetsRelative = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  badge.removeFromParent();
  return colors.map((stitch) => {
    const mesh = new T.SkinnedMesh(fit(stitch.geometry, hi), stitch.material);
    mesh.userData.mobileGeometry = fit(stitch.userData.mobileGeometry, lo);
    mesh.name = stitch.name;
    mesh.userData.patternPiece = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(coat.skeleton, coat.bindMatrix);
    mesh.morphTargetInfluences = coat.morphTargetInfluences;
    return mesh;
  });
}

// Two cream cords emerge on either side of the hood opening. A short brass
// ferrule finishes each cord. Their bind stations sit on the real folded
// cloth, so a shoulder turn carries both ends around the sternum.
export function makeRomaCords(root, crew, hood, cream, brass) {
  const ray = new T.Ray(undefined, new T.Vector3(0, 0, 1)),
    hit = new T.Vector3();
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    bary = new T.Vector3();
  const p = new T.Vector3(),
    tangent = new T.Vector3(),
    across = new T.Vector3(),
    normal = new T.Vector3();
  function cord(side, mobile) {
    const donors = [crew, hood].map((m) => (mobile ? m.userData.mobileGeometry : m.geometry));
    const points = [],
      skin = [],
      wts = [],
      pos = [],
      uv = [],
      indices = [],
      sides = 9,
      steps = 26;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps,
        x = side * (0.0162 + 0.0051 * t + 0.0014 * Math.sin(1.2 * Math.PI * t));
      const y = 0.753 - 0.086 * t + 0.004 * Math.max(0, side) * Math.sin(Math.PI * t);
      const f = t > 0.88 ? 0.00175 : 0.0013;
      ray.origin.set(x, y, 0);
      let best = -1,
        vote = null;
      for (const g of donors) {
        const ix = g.index,
          P = g.attributes.position,
          n = g.userData.outerTriangles ?? ix.count / 3;
        for (let i = 0; i < n; i++) {
          const u = ix.getX(i * 3),
            v = ix.getX(i * 3 + 1),
            w = ix.getX(i * 3 + 2);
          if (y < Math.min(P.getY(u), P.getY(v), P.getY(w)) || y > Math.max(P.getY(u), P.getY(v), P.getY(w)))
            continue;
          if (x < Math.min(P.getX(u), P.getX(v), P.getX(w)) || x > Math.max(P.getX(u), P.getX(v), P.getX(w)))
            continue;
          if (
            !ray.intersectTriangle(
              a.fromBufferAttribute(P, u),
              b.fromBufferAttribute(P, v),
              c.fromBufferAttribute(P, w),
              false,
              hit,
            ) ||
            hit.z <= best
          )
            continue;
          best = hit.z;
          T.Triangle.getBarycoord(hit, a, b, c, bary);
          vote = new Map();
          for (const [id, coef] of [
            [u, bary.x],
            [v, bary.y],
            [w, bary.z],
          ])
            for (let k = 0; k < 4; k++) {
              const bone = g.attributes.skinIndex.getComponent(id, k),
                one = g.attributes.skinWeight.getComponent(id, k) * coef;
              if (one > 1e-7) vote.set(bone, (vote.get(bone) ?? 0) + one);
            }
        }
      }
      if (!vote) throw Error('Unseated drawcord');
      points.push(new T.Vector3(x, y, best + f + 0.0016));
      skin.push([...vote].sort((a, b) => b[1] - a[1]).slice(0, 4));
    }
    const joint = [];
    for (let j = 0; j <= steps; j++) {
      tangent
        .copy(points[Math.min(steps, j + 1)])
        .sub(points[Math.max(0, j - 1)])
        .normalize();
      across.set(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
      normal.crossVectors(tangent, across).normalize();
      for (let i = 0; i < sides; i++) {
        const ang = (i * 2 * Math.PI) / sides,
          t = j / steps,
          radius = (t > 0.88 ? 0.00175 : 0.0013) * (j === steps ? 0.34 : 1);
        p.copy(points[j])
          .addScaledVector(across, radius * Math.cos(ang))
          .addScaledVector(normal, radius * Math.sin(ang));
        pos.push(p.x, p.y, p.z);
        uv.push(i / sides, t);
        const weights = skin[j],
          sum = weights.reduce((v, e) => v + e[1], 0);
        for (let k = 0; k < 4; k++) {
          joint.push(weights[k]?.[0] ?? 0);
          wts.push((weights[k]?.[1] ?? 0) / sum);
        }
        if (j < steps) {
          const l = j * sides + i,
            r = j * sides + ((i + 1) % sides);
          indices.push(l, r, l + sides, l + sides, r, r + sides);
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(joint, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(wts, 4));
    const split = 23 * sides * 6;
    g.addGroup(0, split, 0);
    g.addGroup(split, indices.length - split, 1);
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }
  return [-1, 1].map((side) => {
    const m = new T.SkinnedMesh(cord(side, false), [cream, brass]);
    m.userData.mobileGeometry = cord(side, true);
    m.name = 'Roma tipped hood drawcord';
    m.castShadow = true;
    root.add(m);
    m.bind(crew.skeleton, crew.bindMatrix);
    m.frustumCulled = false;
    return m;
  });
}
