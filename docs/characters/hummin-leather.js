// The apron is cut in metres of rig-local space. Outer and inner grain, cut edges,
// folded rims and pocket gussets are modelled surfaces around the cast chassis.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addVineEmbroidery } from './embroidery.js';

const { lerp, clamp, smoothstep } = T.MathUtils;
const chestProfile = [
  [-0.071, 0.06],
  [-0.061, 0.077],
  [0.016, 0.093],
  [0.074, 0.11],
  [0.115, 0.109],
  [0.143, 0.079],
  [0.153, 0.043],
];
function chestSection(y) {
  // Sample the same ruled, shaped rings used by the cast-metal housing.

  const rings = formedChest;
  if (y <= rings[0][0]) return rings[0].slice(1);
  for (let k = 1; k < rings.length; k++)
    if (y <= rings[k][0]) {
      const a = rings[k - 1],
        b = rings[k],
        t = (y - a[0]) / (b[0] - a[0]);
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
    }
  return rings.at(-1).slice(1);
}
const formedChest = chestProfile.map(([h, r]) => {
  const b = 1 - smoothstep(h, -0.067, 0.142);
  const breadth = 0.29 * smoothstep(h, -0.057, 0.018) * (1 - smoothstep(h, 0.093, 0.151));
  const bolster = 0.014 * smoothstep(h, -0.078, 0.005) * (1 - smoothstep(h, 0.089, 0.144));
  return [
    h,
    r * (0.913 + 0.33 * b + breadth),
    r * 0.69 * (0.91 + 0.26 * b + 0.35 * breadth),
    0.0025 * b + bolster,
  ];
});

export function makeApron(rig, m, parts) {
  const { group, rod, oval, line } = parts;
  const { leather, darkLeather, leatherEdge, thread, agedBrass, denim, denimEdge, emblem, berry } = m;
  const surfaces = {},
    pairs = [];
  const register = (name, mesh) => (surfaces[name] ??= []).push(mesh);
  const layer = (outer, ...inners) => {
    for (const inner of inners) pairs.push({ outer, inner });
  };
  const flaps = [],
    moving = [];
  const v3 = (x, y, z) => new T.Vector3(x, y, z);
  function patch(parent, name, material, nx, ny, sample, gauge = 0.0017) {
    const pos = [],
      uv = [],
      idx = [],
      front = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) front.push(sample(i / nx, j / ny));
    const w = nx + 1,
      step = front.length;
    const vector = new T.Vector3(),
      dv = new T.Vector3();
    for (let face = 0; face < 2; face++)
      for (let j = 0; j <= ny; j++)
        for (let i = 0; i <= nx; i++) {
          const id = j * w + i,
            p = front[id];
          vector.subVectors(front[j * w + Math.min(i + 1, nx)], front[j * w + Math.max(i - 1, 0)]);
          dv.subVectors(front[Math.min(j + 1, ny) * w + i], front[Math.max(j - 1, 0) * w + i]);
          dv.cross(vector).normalize();
          pos.push(p.x - face * gauge * dv.x, p.y - face * gauge * dv.y, p.z - face * gauge * dv.z);
          uv.push(i / nx, j / ny);
          if (i && j) {
            const b = id + face * step;
            if (face) idx.push(b - w - 1, b, b - 1, b - w - 1, b - w, b);
            else idx.push(b - w - 1, b - 1, b, b - w - 1, b, b - w);
          }
        }
    const rim = [];
    for (let i = 0; i < nx; i++) rim.push(i);
    for (let j = 0; j < ny; j++) rim.push(j * w + nx);
    for (let i = nx; i > 0; i--) rim.push(ny * w + i);
    for (let j = ny; j > 0; j--) rim.push(j * w);
    for (let k = 0; k < rim.length; k++) {
      const a = rim[k],
        b = rim[(k + 1) % rim.length];
      idx.push(a, b, b + step, a, b + step, a + step);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new T.Mesh(g, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    register(name, mesh);
    return mesh;
  }
  // Darts shape a broad curved bib around the belly. Preserve room below the
  // battery shell for the independently rotating waist and the pocket backs.
  const bibNode = group(rig.chest, 0, 0, 0);
  bibNode.userData.dynamicPose = true;
  const bibZ = (x, y) => {
    const [rx, rz, origin] = chestSection(y);
    const low = smoothstep(-y, 0.038, 0.085);
    const w = Math.max(rx, 0.116),
      d = Math.max(rz, 0.076);
    return (
      origin +
      (d + 0.0054) * Math.sqrt(Math.max(0.026, 1 - (x / (w + 0.0055)) ** 2)) +
      0.0038 +
      low * 0.0018 * (1 + Math.cos(x * 95 + y * 19))
    );
  };
  const bibAt = (u, v) => {
    const t = 2 * u - 1,
      edge = lerp(0.082, 0.102, smoothstep(v, 0.08, 0.83));
    const y =
      0.073 -
      0.148 * v -
      0.006 * (1 - t * t) * v * v +
      0.032 * (1 - v) ** 3 * Math.max(0, 1 - (t / 0.7) ** 4);
    return v3(t * edge, y, bibZ(t * edge, y));
  };
  patch(bibNode, 'bib', denim, 28, 22, bibAt, 0.0019);

  layer('bib', 'chassis', 'pelvis');
  const seam = (parent, fn, count, radius, mat = thread) => {
    for (let i = 0; i < count; i++)
      rod(parent, mat, fn((i + 0.12) / count).toArray(), fn((i + 0.65) / count).toArray(), radius);
  };
  const onBib = (u, v, dz) => {
    const p = bibAt(u, v);
    p.z += dz;
    return p;
  };
  // Patch pocket at the center of the indigo bib. Its top and rounded lower
  // corners are lined with two runs of ochre workwear thread.
  const pocketFace = (u, v) => {
    const t = u * 2 - 1,
      y = 0.099 - 0.077 * v + 0.005 * t * t * v * v * v;
    const x = t * (0.044 - 0.005 * v * v);
    return v3(x, y, bibZ(x, y) + 0.0032 + 0.008 * (1 - t ** 4) * Math.sin(Math.PI * v) ** 2);
  };
  patch(bibNode, 'badgePocket', denimEdge, 18, 12, pocketFace, 0.0012);
  layer('badgePocket', 'bib');
  for (const side of [0.045, 0.955])
    seam(
      bibNode,
      (t) => {
        const q = pocketFace(side, t);
        q.z += 0.0007;
        return q;
      },
      15,
      0.00048,
      emblem,
    );
  for (const edge of [0.055, 0.944])
    seam(
      bibNode,
      (t) => {
        const q = pocketFace(t, edge);
        q.z += 0.0007;
        return q;
      },
      20,
      0.00048,
      emblem,
    );
  addVineEmbroidery(bibNode, {
    x: 0,
    y: 0.061,
    z: bibZ(0, 0.061) + 0.0135,
    width: 0.079,
    height: 0.058,
    radius: 0.115,
    style: 'apron',
    materials: { leaf: emblem, berry, thread: emblem },
  });
  seam(bibNode, (t) => onBib(t, 0.025, 0.0006), 31, 0.00054);
  seam(bibNode, (t) => onBib(0.022, t, 0.0007), 35, 0.00055);
  seam(bibNode, (t) => onBib(0.978, t, 0.0007), 35, 0.00055);

  // Over each shoulder, the strap follows a complete meridian of the shell:
  // from the bib on the front, over the shoulder ridge, to the opposite back hip.
  // Broad back cinch passes through the side darts under the front bib. The
  // open ends lie beneath the leather rather than sealing the pelvis in a solid.
  patch(
    rig.hips,
    'belt',
    darkLeather,
    84,
    6,
    (u, v) => {
      const theta = lerp(1.98, 2 * Math.PI - 1.98, u);
      const y = lerp(0.035, 0.017, v);
      return v3(
        0.1115 * Math.sin(theta),
        y,
        (0.077 + 0.005 * smoothstep(y, 0.025, 0.035)) * Math.cos(theta),
      );
    },
    0.0016,
  );
  const strapNode = group(rig.chest, 0, 0, 0);
  strapNode.userData.dynamicPose = true;
  const strapAt = (s, u, v) => {
    const a = Math.PI * v,
      front = v <= 0.5,
      h = Math.sin(a);
    const center = front ? lerp(0.061, 0.051, h) : lerp(-0.071, 0.051, h);
    const x = s * center + (u - 0.5) * 0.0165;
    let low = 0.115,
      high = 0.153;
    for (let k = 0; k < 10; k++) {
      const y = (low + high) / 2;
      if (chestSection(y)[0] < Math.abs(x)) high = y;
      else low = y;
    }
    const crest = (high + low) / 2;
    const base = front ? 0.06 : -0.056;
    const y = lerp(base, crest, h);
    const [rx, rz, z0] = chestSection(y);
    const standOff = (front ? 0.01 : 0.008) + (s === -1 && !front ? 0.003 : 0);
    let z =
      z0 + Math.sign(Math.cos(a)) * rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) + standOff * Math.cos(a);
    if (front && y < 0.118) z = Math.max(z, bibZ(x, y) + 0.0058 * (1 - smoothstep(y, 0.105, 0.118)));
    return v3(x, y + 0.0035 * h ** 5, z);
  };
  for (const [s, id] of [
    [1, 'strapL'],
    [-1, 'strapR'],
  ]) {
    // Parameter v starts at the back for outward-facing normals.
    const at = (u, v) => strapAt(s, 1 - u, v);
    patch(strapNode, id, darkLeather, 5, 56, at, 0.0019);
    layer(id, 'chassis', 'bib');
    seam(
      strapNode,
      (t) => {
        const q = strapAt(s, 0.14, t);
        q.z += 0.0005 * Math.cos(t * Math.PI);
        q.y += 0.0006 * Math.sin(t * Math.PI);
        return q;
      },
      48,
      0.00045,
    );
    seam(
      strapNode,
      (t) => {
        const q = strapAt(s, 0.86, t);
        q.z += 0.0005 * Math.cos(t * Math.PI);
        q.y += 0.0006 * Math.sin(t * Math.PI);
        return q;
      },
      48,
      0.00045,
    );
    const f = strapAt(s, 0.5, 0.105);
    parts.buckle(strapNode, f.x, f.y, f.z + 0.0022, 0.0106, 0.009);
    const rivet = strapAt(s, 0.5, 0.024);
    oval(strapNode, agedBrass, rivet.x, rivet.y, rivet.z + 0.0018, 0.0035, 0.0035, 0.0013);
  }
  layer('strapR', 'strapL');

  // An open pocket has a back wall, a gusset down each side and under the base,
  // plus a separate convex face. The space between the two walls houses tools.
  const tray = group(bibNode, -0.045, -0.022, 0.053);
  tray.scale.setScalar(0.55);
  function pocket(name, x0, x1, top, bottom, depth) {
    function section(u, v) {
      const t = clamp((v - 0.73) / 0.27, 0, 1),
        n = 0.004 * t * t;
      const x = lerp(x0 + n, x1 - n, u),
        y = lerp(top, bottom, v) - v * v * 0.003 * Math.sin(Math.PI * u);
      const z = bibZ(x, y) + 0.0048;
      return [x, y, z, z + depth * (0.77 + 0.23 * Math.sin(Math.PI * u)) * (1 - 0.32 * v)];
    }
    const wall = (u, v, front) => {
      const [x, y, z, Z] = section(u, v);
      return v3(x, y, front ? Z : z);
    };
    patch(tray, name, darkLeather, 14, 12, (u, v) => wall(u, v, true), 0.0012);
    patch(tray, name, leather, 14, 10, (u, v) => wall(u, v, false), 0.001);
    for (const s of [0, 1])
      patch(
        tray,
        name,
        leatherEdge,
        4,
        12,
        (u, v) => {
          const [x, y, z, Z] = section(s, v);
          return v3(x + (s ? 1 : -1) * 0.001 * Math.sin(Math.PI * u), y, lerp(z, Z, s ? 1 - u : u));
        },
        0.0009,
      );
    patch(
      tray,
      name,
      leatherEdge,
      14,
      4,
      (u, v) => {
        const [x, y, z, Z] = section(u, 1);
        return v3(x, y - 0.0008 * Math.sin(Math.PI * v), lerp(Z, z, v));
      },
      0.0009,
    );
    seam(
      tray,
      (t) => {
        const q = wall(t, 0.06, true);
        q.z += 0.00065;
        return q;
      },
      14,
      0.00055,
    );
    for (const side of [0.06, 0.94])
      seam(
        tray,
        (t) => {
          const q = wall(side, t, true);
          q.z += 0.00065;
          return q;
        },
        11,
        0.0005,
      );
    layer(name, 'bib', 'chassis');
  }
  pocket('toolPocket', -0.073, 0.021, 0.006, -0.05, 0.02);
  pocket('penPocket', 0.028, 0.065, 0.002, -0.045, 0.014);
  const tools = group(tray, -0.042, 0.005, bibZ(-0.042, 0.005) + 0.0115);
  tools.userData.dynamicPose = true;
  const pen = group(tray, 0.047, 0.001, bibZ(0.047, 0.001) + 0.01);
  // The skirt is cut in one continuous piece. A rounded hem sweeps up at
  // both side seams; the central panel spans both thighs through a stride.
  const skirt = group(rig.hips, 0, 0.043, 0.087);
  skirt.userData.dynamicPose = true;
  flaps.push(skirt);
  const pattern = (u, v) => {
    const across = 2 * u - 1;
    const a = across * (1.68 - 0.63 * v * v);
    const x = Math.sin(a) * (0.113 - 0.006 * v + 0.002 * Math.sin(v * Math.PI));
    const y =
      -0.0045 -
      0.174 * v +
      0.03 * across ** 4 * v ** 4 +
      0.022 * Math.exp(-((across / 0.078) ** 2)) * v ** 9;
    const curl = 0.0023 * smoothstep(v, 0.927, 0.97);
    return v3(
      x,
      y,
      (0.094 - 0.029 * v) * Math.cos(a) - 0.092 + 0.0031 * Math.cos(9 * across + v * 2.4) * v + curl,
    );
  };
  // The worn cut opens around the hip and folds down between the thighs.
  // Its reinforced side gores hold their shape while the character stands.
  function easeAtRest(u, v, p) {
    const side = 2 * u - 1, reach = Math.abs(side);
    const gore = smoothstep(reach, 0.69, 0.78);
    const hip = 0.025 * smoothstep(v, 0.032, 0.4) * (1 - 0.12 * smoothstep(v, 0.8, 1));
    p.x += Math.sign(side) * gore * (hip + 0.0016);
    const knee = smoothstep(v, 0.29, 0.46) * (1 - 0.44 * smoothstep(v, 0.8, 1));
    const dart = Math.exp(-(((reach - 0.69) / 0.22) ** 2));
    p.z += (1 - gore) * (0.003 * (1 - smoothstep(v, 0, 0.48)) +
      (0.021 * knee + 0.009 * Math.exp(-(((v - 0.13) / 0.1) ** 2))) * dart);
    return p;
  }
  const panel = patch(skirt, 'apronSkirt', denim, 42, 23, pattern, 0.0024);
  panel.userData.dynamicPose = true;
  const position = panel.geometry.attributes.position;
  const front = new T.Vector3(), eased = new T.Vector3();
  for (let i = 0; i < position.count / 2; i++) {
    front.fromBufferAttribute(position, i);
    easeAtRest((i % 43) / 42, Math.floor(i / 43) / 23, eased.copy(front));
    const back = i + position.count / 2;
    position.setXYZ(back, position.getX(back) + eased.x - front.x, position.getY(back),
      position.getZ(back) + eased.z - front.z);
    position.setXYZ(i, eased.x, eased.y, eased.z);
  }
  panel.geometry.computeVertexNormals();
  moving.push({ mesh: panel, sign: 0, type: 'flap', pattern });
  skirt.position.set(0, 0.043, 0.080);
  skirt.rotation.x = -0.12;
  layer('apronSkirt', 'pelvis', 'thighL', 'thighR', 'chassis');
  {
    const s = 1;
    if (s === 1) {
      const cloth = group(bibNode, 0.061, -0.004, 0.037);
      cloth.scale.setScalar(0.67);
      const towel = (u, v) => {
        const x = (u - 0.5) * 0.036 + 0.002 * Math.sin(v * 2),
          y = -0.059 * v + 0.002 * Math.sin(u * 7) * v;
        return v3(
          x,
          y,
          bibZ(x + 0.055, y - 0.024) + 0.026 + 0.003 * Math.cos(u * 12.4 + 0.7 * v) + 0.003 * v,
        );
      };
      for (const [v0, v1, mat] of [
        [0, 0.72, denimEdge],
        [0.72, 0.745, denim],
        [0.745, 0.8, denimEdge],
        [0.8, 0.86, denim],
        [0.86, 1, denimEdge],
      ]) {
        const strip = patch(cloth, 'towel', mat, 20, 5, (u, v) => towel(u, lerp(v0, v1, v)), 0.0014);
        strip.userData.dynamicPose = true;
        moving.push({ mesh: strip, sign: s, type: 'towel' });
      }
      layer('towel', 'apronSkirt');
    }
  }
  return {
    surfaces,
    pairs,
    flaps,
    tools,
    pen,
    skirt,
    panel,
    wornPattern: (u, v) => easeAtRest(u, v, pattern(u, v)),
    patch,
    merge: mergeGeometries,
    moving,
    formedChest,
    bibNode,
    strapNode,
  };
}
