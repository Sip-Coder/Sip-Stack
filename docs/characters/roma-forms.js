// The explorer is assembled directly into coloured indexed batches. Loose accessories
// keep their own joint; sleeves and pants use a single GPU-skinned fabric mesh.
import * as T from 'three';

const tau = Math.PI * 2;
const materials = new Map();
const swatches = new Map();
const cache = new Map();
function paint(hex) {
  if (hex?.isColor) return hex;
  let color = swatches.get(hex);
  if (!color) swatches.set(hex, (color = new T.Color(hex)));
  return color;
}
function material(metal) {
  if (!materials.has(metal))
    materials.set(
      metal,
      new T.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: metal ? 0.36 : 0.74,
        metalness: metal ? 0.52 : 0.015,
        side: T.DoubleSide,
      }),
    );
  return materials.get(metal);
}
const buffers = () => ({ position: [], color: [], indices: [], bones: [], weights: [], seams: [] });

function geometry(data) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(data.position, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(data.color, 3));
  g.setIndex(data.indices);
  if (data.bones.length) {
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(data.bones, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(data.weights, 4));
  }
  g.computeVertexNormals();
  const n = g.attributes.normal,
    merged = new T.Vector3(),
    other = new T.Vector3();
  for (const [a, b] of data.seams) {
    merged.fromBufferAttribute(n, a).add(other.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, merged.x, merged.y, merged.z);
    n.setXYZ(b, merged.x, merged.y, merged.z);
  }
  g.computeBoundingSphere();
  return g;
}

export function romaForms(rig) {
  const cached = cache.has('clothing');
  const coloured = new Map(),
    skin = buffers(),
    joints = rig.joints;
  const v = new T.Vector3(),
    q = new T.Quaternion(),
    rot = new T.Euler();
  function batch(parent, metal = false) {
    let pair = coloured.get(parent);
    if (!pair) coloured.set(parent, (pair = new Map()));
    if (!pair.has(metal)) pair.set(metal, { ...buffers(), transform: parent.userData.resolvePattern });
    return pair.get(metal);
  }
  function patch(data, cols, rows, sample, transform = data.transform) {
    if (cached) return;
    const first = data.position.length / 3;
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const [x, y, z, c, bone, other, weight = 0] = sample(i / cols, j / rows);
        data.position.push(...(transform?.([x, y, z], bone) ?? [x, y, z]));
        const tone = paint(c);
        data.color.push(tone.r, tone.g, tone.b);
        if (bone !== undefined) {
          data.bones.push(joints.indexOf(bone), joints.indexOf(other ?? bone), 0, 0);
          data.weights.push(1 - weight, weight, 0, 0);
        }
        if (i && j) {
          const d = first + j * (cols + 1) + i,
            b = d - cols - 1,
            a = b - 1,
            c = d - 1;
          data.indices.push(a, b, c, b, d, c);
        }
      }
    function smoothSeam(a, b) {
      const p = data.position;
      if (
        Math.abs(p[a * 3] - p[b * 3]) +
          Math.abs(p[a * 3 + 1] - p[b * 3 + 1]) +
          Math.abs(p[a * 3 + 2] - p[b * 3 + 2]) <
        1e-8
      )
        data.seams.push([a, b]);
    }
    for (let j = 0; j <= rows; j++) {
      const a = first + j * (cols + 1);
      smoothSeam(a, a + cols);
    }
    for (let i = 0; i <= cols; i++) smoothSeam(first + i, first + i + rows * (cols + 1));
  }
  // Rows in joint space are [height, half width, half depth, centre Z, centre X,
  // optional colour, primary joint, secondary joint, secondary weight].
  function loft(parent, rows, color, opts = {}) {
    const { columns = 22, from = 0, to = tau, profile, skinned = false, metal = false, transform } = opts;
    patch(skinned ? skin : batch(parent, metal), columns, rows.length - 1, (u, v) => {
      const j = Math.round(v * (rows.length - 1)),
        r = rows[j],
        a = from + u * (to - from);
      const corr = profile?.(a, j, r) ?? 0;
      return [
        (r[4] ?? 0) + (r[1] + corr) * Math.sin(a),
        r[0],
        (r[3] ?? 0) + (r[2] + corr) * Math.cos(a),
        r[5] ?? color,
        r[6],
        r[7],
        r[8],
      ];
    }, transform);
  }
  function oval(parent, color, x, y, z, rx, ry, rz, ax = 0, ay = 0, az = 0, metal = false, segments = 16) {
    q.setFromEuler(rot.set(ax, ay, az));
    patch(batch(parent, metal), segments, Math.max(5, segments >> 1), (u, t) => {
      const a = tau * u,
        p = Math.PI * (t - 0.5),
        rad = Math.cos(p);
      v.set(rx * rad * Math.sin(a), ry * Math.sin(p), rz * rad * Math.cos(a)).applyQuaternion(q);
      return [x + v.x, y + v.y, z + v.z, color];
    });
  }
  function thread(parent, color, points, radius, opts = {}) {
    const { segments = Math.max(6, points.length * 2), sides = 5, metal = false, widths } = opts;
    const destination = batch(parent, metal);
    if (cached) return;
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    const frames = curve.computeFrenetFrames(segments, false),
      centres = curve.getSpacedPoints(segments);
    patch(destination, sides, segments, (u, t) => {
      const j = Math.round(t * segments),
        angle = tau * u;
      let r = radius;
      if (widths) {
        const f = t * (widths.length - 1),
          k = Math.min(widths.length - 2, Math.floor(f));
        r *= T.MathUtils.lerp(widths[k], widths[k + 1], f - k);
      }
      v.copy(centres[j])
        .addScaledVector(frames.normals[j], r * Math.cos(angle))
        .addScaledVector(frames.binormals[j], r * Math.sin(angle));
      return [v.x, v.y, v.z, color];
    });
  }
  function ring(parent, color, x, y, z, rx, ry, r, ay = 0, metal = true) {
    const ca = Math.cos(ay),
      sa = Math.sin(ay);
    patch(batch(parent, metal), 20, 5, (u, t) => {
      const a = tau * u,
        b = tau * t,
        xx = (rx + r * Math.cos(b)) * Math.cos(a),
        zz = r * Math.sin(b);
      return [x + xx * ca + zz * sa, y + (ry + r * Math.cos(b)) * Math.sin(a), z - xx * sa + zz * ca, color];
    });
  }
  function group(parent, name, x = 0, y = 0, z = 0, dynamic = false) {
    const g = new T.Group();
    g.name = name;
    g.position.set(x, y, z);
    g.userData.dynamicPose = dynamic;
    parent.add(g);
    return g;
  }
  function finish() {
    for (const [parent, pair] of coloured)
      for (const [metal, data] of pair) {
        const key = parent.userData.romaPart ?? parent.name;
        const id = key + ':' + metal;
        let g = cache.get(id);
        if (!g) cache.set(id, (g = geometry(data)));
        const m = new T.Mesh(g, material(metal));
        m.name = 'Roma ' + key;
        m.castShadow = !metal && g.boundingSphere.radius > 0.035;
        m.receiveShadow = true;
        parent.add(m);
      }
    if (skin.position.length || cached) {
      let g = cache.get('clothing');
      if (!g) cache.set('clothing', (g = geometry(skin)));
      const m = new T.SkinnedMesh(g, material(false));
      m.name = 'Roma tailored explorer clothes';
      rig.root.add(m);
      rig.root.updateMatrixWorld(true);
      m.bind(new T.Skeleton(joints));
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
    }
  }
  return {
    loft,
    oval,
    thread,
    ring,
    group,
    skinnedFace: (cols, rows, fn) => patch(skin, cols, rows, fn),
    face: (parent, cols, rows, fn, metal = false) => patch(batch(parent, metal), cols, rows, fn),
    finish,
  };
}
