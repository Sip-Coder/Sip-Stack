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
  const panel = patch(skirt, 'apronSkirt', denim, 42, 23, pattern, 0.0024);
  panel.userData.dynamicPose = true;
  moving.push({ mesh: panel, sign: 0, type: 'flap' });
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
  const hipProfile = [
    [-0.034, 0.048],
    [-0.019, 0.081],
    [0.015, 0.084],
    [0.045, 0.072],
    [0.061, 0.063],
  ].map(([h, r]) => [h, r * 1.28, r * 0.68 * 1.23 * (1 + 0.21 * smoothstep(h, 0.025, 0.051)), 0]);
  const legProfile = [
    [-0.216, 0.039],
    [-0.206, 0.049],
    [-0.151, 0.061],
    [-0.092, 0.064],
    [-0.052, 0.062],
    [-0.036, 0.049],
  ].map(([h, r]) => [h, r * 0.88, r * 0.88, -0.01]);
  const bodies = [
    [rig.chest, formedChest, 0],
    [rig.hips, hipProfile, 0],
    [rig.thighL, legProfile, 0.004],
    [rig.thighR, legProfile, -0.004],
  ];
  const beltTurn = new T.Quaternion();
  const point = new T.Vector3(),
    back = new T.Vector3(),
    forward = new T.Vector3();
  function pushOut(p, profile, cx, pad) {
    const y = p.y;
    if (y < profile[0][0] - pad || y > profile.at(-1)[0] + pad) return false;
    let i = 1;
    while (i < profile.length - 1 && y > profile[i][0]) i++;
    const a = profile[i - 1],
      b = profile[i],
      t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const rx = lerp(a[1], b[1], t) + pad,
      rz = lerp(a[2], b[2], t) + pad,
      origin = lerp(a[3], b[3], t);
    const u = (p.x - cx) / rx;
    if (Math.abs(u) >= 1) return false;
    const target = origin + Math.sqrt(1 - u * u) * rz + pad;
    if (p.z >= target) return false;
    p.z = target;
    return true;
  }
  // At the two side gores the warp wraps around the thigh. Slide outward
  // along the local transverse axis there, preserving the turned-back edge.
  function pushSide(p, profile, cx, pad, sign) {
    const y = p.y;
    if (y < profile[0][0] - pad || y > profile.at(-1)[0] + pad) return false;
    let i = 1;
    while (i < profile.length - 1 && y > profile[i][0]) i++;
    const a = profile[i - 1],
      b = profile[i],
      t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const u = (p.z - lerp(a[3], b[3], t)) / (lerp(a[2], b[2], t) + pad);
    if (Math.abs(u) >= 1) return false;
    const mark = cx + sign * (lerp(a[1], b[1], t) + pad) * Math.sqrt(1 - u * u);
    if (sign * (p.x - mark) >= 0) return false;
    p.x = mark;
    return true;
  }
  function prepareWrinkles() {
    for (const fabric of moving) {
      fabric.rest = fabric.mesh.geometry.attributes.position.array.slice();
      fabric.wrinkle = new Float32Array(fabric.rest.length / 6);
      for (let i = 0; i < fabric.wrinkle.length; i++) {
        const x = fabric.rest[3 * i],
          y = fabric.rest[3 * i + 1];
        fabric.wrinkle[i] =
          Math.sin(Math.PI * clamp((-y + 0.006) / 0.145, 0, 1)) ** 2 *
          Math.sin(100 * y + fabric.sign * 46 * x);
      }
      fabric.colliders = bodies.map(([joint, profile, cx]) => ({
        joint,
        profile,
        cx,
        toBody: new T.Matrix4(),
        toMesh: new T.Matrix4(),
      }));
    }
  }
  // Reuse the existing buffers during fixed-step cloth updates. Accumulating
  // area-weighted triangle normals preserves the cut-edge and pocket highlights.
  function updateNormals(geometry) {
    const indices = geometry.index.array,
      p = geometry.attributes.position.array,
      attr = geometry.attributes.normal,
      n = attr.array;
    n.fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const a = 3 * indices[i],
        b = 3 * indices[i + 1],
        c = 3 * indices[i + 2];
      const ux = p[b] - p[a],
        uy = p[b + 1] - p[a + 1],
        uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a],
        vy = p[c + 1] - p[a + 1],
        vz = p[c + 2] - p[a + 2];
      const x = uy * vz - uz * vy,
        y = uz * vx - ux * vz,
        z = ux * vy - uy * vx;
      n[a] += x;
      n[a + 1] += y;
      n[a + 2] += z;
      n[b] += x;
      n[b + 1] += y;
      n[b + 2] += z;
      n[c] += x;
      n[c + 1] += y;
      n[c + 2] += z;
    }
    for (let i = 0; i < n.length; i += 3) {
      const d = Math.sqrt(n[i] ** 2 + n[i + 1] ** 2 + n[i + 2] ** 2) || 1;
      n[i] /= d;
      n[i + 1] /= d;
      n[i + 2] /= d;
    }
    attr.needsUpdate = true;
  }
  function crease(frame) {
    const bend = Math.min(0.0075, Math.abs(rig.chest.rotation.x) * 0.008 + Math.abs(frame.turn) * 0.0006);
    // Compression shortens the bib from its fixed shoulder fasteners. Pockets,
    // tools and saddle stitching stay on the same reinforced piece of leather.
    const knee = Math.max(-rig.thighL.rotation.x, -rig.thighR.rotation.x);
    const compression = smoothstep(knee + Math.max(0, rig.chest.rotation.x) * 0.57, 0.47, 1.72);
    const bow = smoothstep(rig.chest.rotation.x, 0.12, 0.38);
    const bowRelease = frame.emote >= 0 ? bow : 0;
    const bank = smoothstep(Math.abs(frame.turn), 0.55, 2.0);
    const poseFlex = Math.max(
      knee,
      Math.abs(rig.chest.rotation.y) * 2.4,
      Math.abs(rig.chest.rotation.x) * 2,
      Math.abs(frame.turn),
      Math.max(0, frame.emote) * 4,
      Math.min(1, frame.speed / 2),
    );
    const wrapped = 1 - smoothstep(poseFlex, 0.12, 0.48);
    const dartOpening = 0.032 * bowRelease + 0.045 * bank + 0.018 * smoothstep(knee, 0.84, 1.4);
    const gather = Math.min(0.72, 0.64 * compression + 0.2 * bow);
    bibNode.scale.y = 1 - gather;
    bibNode.position.y = 0.067 * gather;
    const greeting = frame.emote >= 0 ? 0.0075 * Math.sin(Math.PI * frame.emote) ** 2 : 0;
    bibNode.position.z = 0.029 * gather + 0.024 * bowRelease + greeting;
    strapNode.scale.z = 1 + 0.27 * gather + 12 * greeting;
    strapNode.position.z = 0.0091 * gather + 0.29 * greeting;
    // The split skirt swings from the waist. Its roots track the shaped bib
    // hem as it gathers; the free leather resists some of the torso twist.
    rig.chest.updateMatrix();
    beltTurn.identity().slerp(rig.chest.quaternion, 0.94);
    for (let i = 0; i < flaps.length; i++) {
      const flap = flaps[i];
      flap.position
        .set(0, -0.077 + 0.065 * gather, 0.088 + 0.007 * (1 - wrapped) + 0.023 * bowRelease)
        .applyMatrix4(rig.chest.matrix);
      flap.quaternion.premultiply(beltTurn);
    }

    rig.root.updateWorldMatrix(true, true);
    for (const fabric of moving) {
      const { mesh, rest, type, colliders } = fabric;
      const p = mesh.geometry.attributes.position,
        half = p.count / 2;
      for (const c of colliders) {
        c.toBody.copy(c.joint.matrixWorld).invert().multiply(mesh.matrixWorld);
        c.toMesh.copy(c.toBody).invert();
      }
      const pad = type === 'towel' ? 0.018 : 0.0072;
      for (let i = 0; i < half; i++) {
        const k = i * 3,
          x = rest[k],
          y = rest[k + 1],
          z = rest[k + 2];
        const fold = bend * fabric.wrinkle[i];
        // The side darts open over a twisting pelvis and a bow. Their
        // leverage grows towards the free outer selvage, leaving the center
        // of the bib and the neutral cut fixed.
        const outer = clamp((Math.abs(x) - 0.017) / 0.087, 0, 1);
        const release = type === 'flap' ? outer * outer * smoothstep(y, -0.13, -0.065) * dartOpening : 0;
        const wrappedZ =
          type === 'flap' ? lerp(0.009 - 0.044 * (x / 0.112) ** 2 + 0.19 * y, z, wrapped) : z;
        // The free corners slide around a tucked knee instead of climbing
        // straight over its hinge. The reinforced waistband stays on its cut.
        const hemRelease =
          type === 'flap' && frame.state === 'roll'
            ? 0.07 *
              smoothstep(knee, 0.65, 1.36) *
              smoothstep(-y, 0.1, 0.16) *
              smoothstep(Math.abs(x), 0.068, 0.098)
            : 0;
        forward.set(x + Math.sign(x) * hemRelease, y, wrappedZ + fold + release);
        for (let body = 0; body < colliders.length; body++) {
          const c = colliders[body];
          point.copy(forward).applyMatrix4(c.toBody);
          const side = type === 'flap' && wrapped > 0.93 && Math.abs((i % 43) - 21) > 15;
          if (side && body > 1 && i % 43 > 21 !== (body === 2)) continue;
          const moved = side
            ? pushSide(
                point,
                c.profile,
                c.cx,
                0.0048 + 0.009 * smoothstep(point.y, -0.079, -0.035),
                Math.sign(x),
              )
            : pushOut(point, c.profile, c.cx, pad);
          if (moved) forward.copy(point).applyMatrix4(c.toMesh);
        }
        // Move both grains together. The cut edge retains its physical gauge.
        const j = (i + half) * 3;
        back.set(rest[j] - x, rest[j + 1] - y, rest[j + 2] - z).add(forward);
        p.setXYZ(i, forward.x, forward.y, forward.z);
        p.setXYZ(i + half, back.x, back.y, back.z);
      }
      p.needsUpdate = true;
      updateNormals(mesh.geometry);
      mesh.geometry.computeBoundingSphere();
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
    pattern,
    patch,
    merge: mergeGeometries,
    updateNormals,
    prepareWrinkles,
    crease,
  };
}
