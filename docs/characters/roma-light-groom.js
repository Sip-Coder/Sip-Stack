// The brushed crown and loose waves are sculpted in head-local coordinates.
// A single pivot carries each cluster's whole surface as Roma changes direction.
import * as T from 'three';

const TAU = Math.PI * 2;
const ease = T.MathUtils.smoothstep;
const clamp = T.MathUtils.clamp;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

function surface() {
  return { position: [], color: [], index: [] };
}

const geometryCache = new Map();
function skin(surface, parent, material, name) {
  let geo = geometryCache.get(name);
  if (!geo) {
    geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(surface.position, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(surface.color, 3));
    geo.setIndex(surface.index);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geometryCache.set(name, geo);
  }
  const mesh = new T.Mesh(geo, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function quad(buf, a, b, c, d) {
  buf.index.push(a, b, c, b, d, c);
}

// Put the pile under the woven headband. The band curves ear-to-ear, with
// the higher roll of hair at the forehead and occiput left free on either side.
function underBand(p) {
  if (p.z < 0.004 || p.z > 0.052 || p.y < 0.067) return p;
  const dx = p.x - 0.002,
    dy = p.y - 0.073;
  const angle = Math.atan2(dx / 0.079, dy / 0.087);
  if (Math.abs(angle) > 1.62) return p;
  const ca = Math.cos(angle),
    centerZ = 0.021 + 0.008 * ca;
  const across = clamp((p.z - centerZ) / 0.01, -1, 1);
  const x = (0.079 - 0.0019 * across) * Math.sin(angle);
  const y = 0.087 * ca - 0.008 * across * (0.38 + 0.62 * ca);
  const max = Math.hypot(x, y) - 0.0021;
  const r = Math.hypot(dx, dy);
  if (r > max) {
    const weight = 1 - ease(Math.abs(p.z - centerZ), 0.011, 0.021);
    const squeeze = 1 - weight * (1 - max / r);
    p.x = 0.002 + dx * squeeze;
    p.y = 0.073 + dy * squeeze;
  }
  return p;
}

function crown(buf) {
  const sides = 64,
    rows = 18;
  for (let j = 0; j < rows; j++) {
    const t = j / rows;
    const dome = t * Math.PI * 0.5,
      spread = Math.cos(dome) ** 0.81;
    for (let i = 0; i < sides; i++) {
      const a = (TAU * i) / sides,
        sa = Math.sin(a),
        ca = Math.cos(a);
      const front = Math.max(0, ca),
        back = Math.max(0, -ca);
      // The cap turns under at the nape and scoops up behind the hoops.
      const templeAngle = Math.atan2(sa, ca);
      const rim = 0.062 + 0.062 * front ** 1.40 - 0.041 * back
        - 0.008 * Math.cos(2.5 * templeAngle + 0.65) * front;
      const y = rim + (0.167 - rim) * Math.sin(dome);
      const sidePart = 0.014 * t * t;
      const phase = 8 * a + 2.8 * Math.sin(dome) + 1.2 * Math.sin(2 * a - 2.4 * t);
      const facet = (0.0023 * Math.cos(phase) + 0.0009 * Math.cos(2 * phase + 0.22)) * (1 - ease(t, 0.77, 1));
      const padding = 1 - 0.16 * (1 - ease(y, 0.042, 0.09));
      const p = underBand(
        v(
          sidePart + (0.078 + facet) * spread * sa * padding,
          y + facet * 0.66 * Math.sin(dome),
          -0.012 + (0.068 + facet + 0.005 * back) * spread * ca + 0.007 * front * Math.sin(Math.PI * t),
        ),
      );
      const pigment = 0.90 + 0.095 * Math.cos(phase) + 0.042 * Math.cos(2 * phase + 0.3);
      buf.position.push(p.x, p.y, p.z);
      buf.color.push(pigment * 1.1, pigment * 1.045, pigment);
      if (j > 0) {
        const left = (j - 1) * sides + i,
          right = (j - 1) * sides + ((i + 1) % sides);
        quad(buf, left, right, left + sides, right + sides);
      }
    }
  }
  const top = buf.position.length / 3;
  buf.position.push(0.014, 0.167, -0.012);
  buf.color.push(1.08, 1.03, 0.99);
  for (let i = 0; i < sides; i++)
    buf.index.push((rows - 1) * sides + i, (rows - 1) * sides + ((i + 1) % sides), top);
}

// Tapered flattened locks have a convex exposed face, a darker underside,
// and a combed ridge. Adjacent locks share a broad sweep but separate at the ends.
function lock(buf, points, width, normal, tint, twist, rows = 14, rounded = false) {
  const start = buf.position.length / 3,
    sides = 12;
  const curve = new T.CatmullRomCurve3(points, false, 'centripetal');
  const center = v(),
    tangent = v(),
    radial = v(),
    cross = v();
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    curve.getPoint(t, center);
    curve.getTangent(t, tangent);
    radial.copy(normal).addScaledVector(tangent, -normal.dot(tangent)).normalize();
    cross.crossVectors(tangent, radial).normalize();
    const spin = twist * Math.sin(t * Math.PI * 1.35 + 0.2);
    const taper = rounded ? 0.55 * ease(t, 0.64, 1) + 0.38 * ease(t, 0.94, 1) : 0.98 * ease(t, 0.68, 1);
    const w = width * (0.28 + 0.72 * ease(t, 0, 0.16)) * (1 - 0.21 * t) * (1 - taper);
    for (let i = 0; i < sides; i++) {
      const a = (TAU * i) / sides;
      const comb = 3 * a + 0.72 * t + 0.16 * Math.sin(4 * t);
      const profile = 1 + 0.084 * Math.cos(comb) + 0.026 * Math.cos(2 * comb + 0.3);
      const dz = w * 0.53 * Math.cos(a) * profile,
        dx = w * Math.sin(a) * profile;
      const x = dx * Math.cos(spin) - dz * Math.sin(spin);
      const z = dx * Math.sin(spin) + dz * Math.cos(spin);
      const p = center.clone().addScaledVector(cross, x).addScaledVector(radial, z);
      buf.position.push(p.x, p.y, p.z);
      const light = 0.89 + 0.15 * Math.cos(a) + 0.105 * Math.cos(comb) + 0.026 * Math.cos(2 * comb);
      const tip = ease(t, 0.13, 1),
        colour = tint * light;
      buf.color.push(
        colour * (1.16 + 0.28 * tip),
        colour * (0.98 + 0.17 * tip),
        colour * (0.88 + 0.14 * tip),
      );
      if (j) {
        const a0 = start + (j - 1) * sides + i,
          a1 = start + (j - 1) * sides + ((i + 1) % sides);
        quad(buf, a0, a1, a0 + sides, a1 + sides);
      }
    }
  }
  const tip = start + rows * sides;
  for (let i = 1; i < sides - 1; i++)
    buf.index.push(start, start + i + 1, start + i, tip, tip + i, tip + i + 1);
}

function partedFringe(buf) {
  const left = [
    [0.028,0.146,0.042], [0.018,0.155,0.050], [-0.005,0.151,0.062],
    [-0.032,0.135,0.066], [-0.049,0.121,0.063], [-0.064,0.118,0.054],
    [-0.070,0.108,0.039], [-0.062,0.101,0.041],
  ];
  const right = [
    [0.027,0.146,0.042], [0.039,0.149,0.047], [0.052,0.138,0.053],
    [0.062,0.123,0.049], [0.069,0.109,0.035], [0.069,0.100,0.030],
  ];
  for (const [path, side] of [
    [left, -1],
    [right, 1],
  ]) {
    for (let j = 0; j < 3; j++) {
      const points = path.map(([x, y, z], i) =>
        underBand(v(x + side * 0.001 * j, y + [0,0.004,-0.0055][j], z - 0.002 * j + 0.001 * Math.sin(i))),
      );
      lock(
        buf,
        points,
        [0.0116,0.0074,0.0039][j],
        v(side * 0.22, 0.38, 1).normalize(),
        [1.14,1.02,1.12][j],
        -side * 0.21,
      );
    }
  }
}

function waveCluster(head, material, side, bank) {
  const banks = [
    [0.84, 1.36, 3],
    [1.40, 2.16, 3],
    [2.24, 3.10, 3],
  ];
  const [begin, end, count] = banks[bank];
  const az = (begin + end) * 0.5;
  const pivot = v(side * Math.sin(az) * 0.06, 0.118, -0.011 + Math.cos(az) * 0.052);
  const name = `Roma ${['temple', 'side', 'nape'][bank]} waves ${side < 0 ? 'R' : 'L'}`;
  const waves = surface();
  for (let k = 0; !geometryCache.has(name) && k < count; k++) {
    const a = begin + ((end - begin) * k) / (count - 1),
      sa = Math.sin(a),
      ca = Math.cos(a);
    const outward = v(side * sa, 0, ca),
      across = v(side * ca, 0, -sa);
    const rootY = 0.137 - 0.009 * bank + 0.004 * Math.cos(k * 2 + side);
    const fall = 0.024 - 0.020 * bank - 0.012 * Math.sin((k + 1) * 1.30 + side * 0.55);
    const phase = bank * 0.67 + k * 0.46 + (side > 0 ? 0.34 : 0);
    const path = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12,
        fullness = Math.sin(Math.PI * t) ** 0.68,
        fringe = bank === 0;
      const radius = 0.047 + 0.036 * ease(t, 0, 0.34) + 0.009 * ease(t, 0.66, 1);
      const zRadius = 0.046 + 0.022 * ease(t, 0, 0.4);
      const p = v(side * radius * sa, T.MathUtils.lerp(rootY, fall, t), -0.011 + zRadius * ca);
      const curl = (1.54 * t + 0.35 * ease(t, 0.47, 1)) * TAU + phase;
      p.addScaledVector(across, (0.014 * Math.sin(curl) + 0.0038 * Math.sin(2.19 * TAU * t + phase)) * fullness);
      p.addScaledVector(outward, (0.0104 * Math.cos(curl) + 0.0065) * fullness);
      p.y += 0.0063 * Math.sin(curl + 0.83) * fullness;
      // The sweep leaves the temple above the orbit, folding behind the
      // cheek and pinna to leave the nose, lips and hoop clear in profile.
      if (fringe) {
        const tuck = 1 - ease(p.y, 0.093, 0.123);
        p.z -= (0.022 + 0.005 * (k === 0)) * tuck;
        p.x = side * Math.max(side * p.x, 0.075 * tuck);
      }
      else if (bank === 1) p.z -= 0.014 * ease(t, 0.03, 0.42);
      const endTurn = ease(t, 0.55, 1);
      p.x += side * 0.012 * Math.sin(1.3 * Math.PI * endTurn) * endTurn;
      p.y += 0.018 * endTurn * endTurn;
      p.z -= 0.016 * endTurn * (0.54 + 0.46 * Math.cos(phase));
      path.push(p.sub(pivot));
    }
    const w = bank === 0 ? 0.0124 : bank === 1 ? 0.0174 : 0.0181;
    lock(
      waves,
      path,
      w * (0.94 + 0.12 * Math.cos(k + bank)),
      outward,
      1.03 + 0.14 * Math.cos(2 * k + phase),
      side * (0.3 + 0.13 * k),
      20,
      true,
    );
  }
  const mesh = skin(waves, head, material, name);
  mesh.userData.dynamicPose = true;
  mesh.position.copy(pivot);
  return mesh;
}

export function buildRomaHair(head, material) {
  material.vertexColors = true;
  const cap = surface();
  if (!geometryCache.has('Roma parted chocolate crown')) {
    crown(cap);
    partedFringe(cap);
  }
  const mesh = skin(cap, head, material, 'Roma parted chocolate crown');
  mesh.castShadow = true;
  const waves = [];
  for (const side of [-1, 1])
    for (let bank = 0; bank < 3; bank++) waves.push(waveCluster(head, material, side, bank));
  return waves;
}
