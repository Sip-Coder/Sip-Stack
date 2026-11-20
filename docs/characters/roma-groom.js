// Roma's chestnut set. Dimensions are in the sculpted head's own frame.
// Each spiral has a smooth four-segment mechanical guide under its finer
// curled surface, so the shape of the curl survives secondary animation.
import * as T from 'three';
import { curlResponse } from './roma-curl-response.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const turn = 2 * Math.PI;
const ease = T.MathUtils.smoothstep;
const point = (x, y, z) => new T.Vector3(x, y, z);

function indices(rings, sides, stride = 1, seal = true) {
  const data = [];
  for (let j = 0; j < rings; j += stride) {
    for (let i = 0; i < sides; i += stride) {
      const a = j * sides + i,
        b = j * sides + ((i + stride) % sides),
        d = stride * sides;
      data.push(a, b, a + d, b, b + d, a + d);
    }
  }
  if (!seal) return data;
  for (let i = stride; i < sides - stride; i += stride) {
    data.push(0, i + stride, i, rings * sides, rings * sides + i, rings * sides + i + stride);
  }
  return data;
}

function ringSurface(rings, sides, sample, shaded = true, seal = true) {
  const pos = [],
    uv = [],
    colors = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i < sides; i++) {
      const u = i / sides;
      const p = sample(t, u);
      pos.push(p.x, p.y, p.z);
      uv.push(t, u);
      const tip = shaded ? ease(t, 0.12, 0.99) : 0.45;
      // Warmer copper reflects at the ends; a narrow longitudinal highlight
      // picks up the anisotropic PBR lobe as Roma turns her head.
      const grain = 1 + 0.065 * Math.cos(turn * (3 * u + 0.13 * Math.sin(t * 5)));
      colors.push((0.75 + 0.6 * tip) * grain, (0.8 + 0.34 * tip) * grain, (0.82 + 0.2 * tip) * grain);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices(rings, sides, 1, seal));
  g.computeVertexNormals();
  return g;
}

function curlRibbon(curve, radius, outward, rings, sides, origin = point(0, 0, 0)) {
  const center = point(0, 0, 0),
    tangent = point(0, 0, 0),
    radial = point(0, 0, 0),
    cross = point(0, 0, 0);
  let station = -1;
  return ringSurface(rings, sides, (t, u) => {
    if (t !== station) {
      curve.getPoint(t, center).sub(origin);
      curve.getTangent(t, tangent);
      radial.copy(outward).addScaledVector(tangent, -outward.dot(tangent));
      if (radial.lengthSq() < 0.01) radial.set(0, 1, 0).addScaledVector(tangent, -tangent.y);
      radial.normalize();
      cross.crossVectors(tangent, radial).normalize();
      station = t;
    }
    const angle = turn * u;
    const width = radius(t),
      scallop = 1 + 0.085 * Math.cos(3 * angle + 0.5 * Math.sin(6 * t));
    return center
      .clone()
      .addScaledVector(radial, width * 0.7 * Math.cos(angle) * scallop)
      .addScaledVector(cross, width * Math.sin(angle) * scallop);
  });
}

function addCurlMesh(group, geometry, material, rings, sides) {
  const m = new T.Mesh(geometry, material);
  m.castShadow = m.receiveShadow = true;
  // Both index sets share the simulated attributes. Mobile draws half the
  // longitudinal and circumferential stations, including the same fine tip.
  const mobile = new T.BufferGeometry();
  for (const [key, attr] of Object.entries(geometry.attributes)) mobile.setAttribute(key, attr);
  mobile.setIndex(indices(rings, sides, 2));
  mobile.computeBoundingBox();
  mobile.computeBoundingSphere();
  m.userData.mobileGeometry = mobile;
  group.add(m);
  return m;
}

function crownPoint(a, t) {
  const front = Math.max(0, Math.cos(a));
  const hairline = 0.072 + 0.047 * front ** 1.65 + 0.005 * Math.sin(2 * a + 0.48) * front;
  const elevation = t * Math.PI * 0.5;
  const breadth = Math.cos(elevation) ** 0.84;
  return point(
    0.006 * t + 0.0735 * Math.sin(a) * breadth,
    hairline + (0.1618 - hairline) * Math.sin(elevation),
    -0.012 + 0.065 * Math.cos(a) * breadth,
  );
}

function crown(head, hair) {
  const piles = hair.map(() => []);
  const scalp = ringSurface(28, 72, (t, u) => crownPoint(u * turn, t), false, false);
  piles[0].push(scalp);
  // A left-hand part fans around the skull. Staggered swept ridges cross the
  // forehead and temples and hide the seam between the scalp and the ringlets.
  for (let i = 0; i < 47; i++) {
    const a = (turn * i) / 47;
    const end = a > Math.PI ? a - turn : a;
    const bank = end < 0.46 ? -1 : 1;
    const path = [];
    for (let j = 0; j <= 16; j++) {
      const t = j / 16;
      const angle = 0.46 + (end - 0.46) * t ** 0.72 + bank * 0.26 * Math.sin(t * Math.PI);
      const p = crownPoint(angle, 0.88 * (1 - t));
      p.x += 0.0008 * Math.sin(angle);
      p.z += 0.0008 * Math.cos(angle);
      p.y += 0.001;
      path.push(p);
    }
    const shape = new T.CatmullRomCurve3(path);
    const radius = (t) =>
      (0.0015 + 0.0028 * (0.5 + 0.5 * Math.cos(i * 4.1))) * (0.11 + 0.89 * Math.sin(Math.PI * t) ** 0.58);
    piles[i % 5 === 0 ? 2 : 1].push(
      curlRibbon(shape, radius, point(Math.sin(end), 0.38, Math.cos(end)).normalize(), 20, 8),
    );
  }
  for (let i = 0; i < 5; i++) {
    const d = i * 0.0019;
    const path = [
      [0.034, 0.142 + d * 0.54, 0.025],
      [0.021, 0.14 + d * 0.54, 0.041],
      [-0.002, 0.135 + d * 0.8, 0.053],
      [-0.036, 0.125 + d, 0.052],
      [-0.058, 0.107 + d, 0.037],
      [-0.066, 0.093 + d, 0.028],
    ].map((p) => point(...p));
    piles[i % 3 === 0 ? 2 : 1].push(
      curlRibbon(
        new T.CatmullRomCurve3(path),
        (t) => 0.0041 * (0.08 + 0.92 * Math.sin(Math.PI * t) ** 0.54),
        point(-0.3, 0.5, 1).normalize(),
        26,
        10,
      ),
    );
  }
  // Two short lifted locks above the far temple break the smooth crown
  // asymmetrically, before feeding their ends into the long curtain.
  for (let i = 0; i < 2; i++) {
    const d = i * 0.003;
    const line = [
      point(-0.04, 0.144 - d, 0.015),
      point(-0.055, 0.142 - d, 0.023),
      point(-0.066, 0.139 - d, 0.025),
      point(-0.069, 0.133 - d, 0.026),
      point(-0.071, 0.123 - d, 0.026),
      point(-0.067, 0.11 - d, 0.029),
    ];
    piles[1 + i].push(
      curlRibbon(
        new T.CatmullRomCurve3(line),
        (t) => 0.0033 * (0.14 + 0.86 * Math.sin(Math.PI * t) ** 0.56),
        point(-0.9, 0.1, 0.4).normalize(),
        24,
        10,
      ),
    );
  }
  for (let i = 0; i < 4; i++)
    if (piles[i].length) {
      const m = new T.Mesh(mergeGeometries(piles[i]), hair[i]);
      m.castShadow = m.receiveShadow = true;
      m.name = 'Roma parted crown ' + i;
      head.add(m);
      for (const g of piles[i]) g.dispose();
    }
}

function shapeCurl(head, hair, side, i, inner = false) {
  const face = !inner && i < 4,
    f = inner ? (i - 32) / 9 : (i - 4) / 27;
  const a = side * (face ? 0.7 + 0.1 * i : inner ? 1.14 + 1.87 * f : 1.08 + 2.02 * f);
  const angle = Math.abs(a),
    r = Math.sin(a),
    z = Math.cos(a);
  const seed = Math.sin((i + 1) * 3.73 + side * 0.9);
  const crownY = 0.136 + 0.007 * Math.sin(i * 1.71 + 0.7 * side);
  const temple = Math.exp(-((angle - 1.51) ** 2) / 0.12);
  let endY = inner
    ? -0.035 - 0.01 * Math.max(0, -z) + 0.005 * seed
    : face
      ? -0.002 + 0.008 * Math.sin(i * 2.13) + 0.005 * side
      : -0.029 - 0.016 * Math.max(0, -z) + 0.028 * temple + 0.008 * seed;
  if (inner && i >= 34 && i <= 38) endY -= 0.015;
  if (face && (i === 1 || i === 3)) endY -= 0.019;
  const crossShoulder = angle < 1.4;
  const width = (inner ? 0.0132 : 0.00365) + 0.0007 * Math.cos(i * 2.63 + side);
  const loops = 2.08 + 0.61 * (0.5 + 0.5 * Math.sin(i * 2.19 + side));
  const spin = (i % 5 === 1 ? -1 : 1) * side;
  function axis(t) {
    const fall = Math.sin(Math.min(1, t / 0.38) * Math.PI * 0.5);
    const bend = a + side * (0.1 * Math.sin(Math.PI * t) + 0.06 * t);
    const rx = 0.048 + 0.0278 * fall + 0.007 * ease(t, 0.62, 1) + 0.0017 * seed - (inner ? 0.009 * fall : 0);
    const rz = 0.045 + 0.016 * fall - 0.003 * t - (inner ? 0.006 * fall : 0);
    const p = point(rx * Math.sin(bend), T.MathUtils.lerp(crownY, endY, t), -0.007 + rz * Math.cos(bend));
    const under = ease(t, 0.5, 0.93);
    if (face || crossShoulder) {
      p.x += side * (face ? 0.004 * Math.sin(t * Math.PI * 0.68) : 0);
      // The front curtains sweep in front of the collar. Set a common
      // smooth rest direction as they pass the shoulder contact zone.
      const forward = face && i === 1 ? 0.028 : 0.04 + 0.003 * Math.cos(i * 1.6);
      p.z = T.MathUtils.lerp(p.z, forward, ease(t, 0.5, 0.86));
    } else {
      // Near the ears the length graduates, then the lower ends comb
      // backwards around the jacket yoke instead of entering the sleeves.
      p.z -= under * (0.003 + 0.016 * Math.exp(-((angle - 1.76) ** 2) / 0.3));
    }
    if (side > 0 && i === 7) {
      // Cross the leading shoulder cup on its anterior face. A little room
      // here lets the tip swing freely instead of sticking on every stride.
      p.z += 0.005 * ease(t, 0.36, 0.76);
    }
    if (inner && i >= 34 && i <= 38) {
      // The underside of the bob follows the slope of the shoulder from the
      // earlobe to the nape. These overlapped plumes leave the outer spiral
      // tips free while filling the shadow behind the neck in profile.
      const drape = ease(t, 0.43, 0.7);
      const offset = (i - 36) * 0.005;
      p.x = T.MathUtils.lerp(p.x, side * (0.057 + offset * 0.53), drape);
      p.z = T.MathUtils.lerp(p.z, -0.022 + 0.84 * p.y + offset, drape);
    }
    return p;
  }
  const radial = point(r, 0, z),
    tangential = point(z, 0, -r);
  const guide = Array.from({ length: 5 }, (_, j) => axis(j / 4));
  const path = [];
  for (let j = 0; j <= 48; j++) {
    const t = j / 48,
      phase = spin * (t * loops * turn + 0.91 * i + 0.4 * Math.sin(2.8 * t));
    const amp =
      (inner ? 0.0018 : face ? 0.0041 : 0.0048) *
      (0.2 + 0.8 * ease(t, 0, 0.24)) *
      (1 + 0.2 * Math.sin(t * 3.6));
    const p = axis(t)
      .addScaledVector(radial, amp * Math.cos(phase))
      .addScaledVector(tangential, amp * Math.sin(phase));
    p.y += amp * 0.27 * Math.sin(phase + 0.3) * ease(t, 0.02, 0.3);
    path.push(p);
  }
  // A tapered wisp bends out of the bundle on the final fraction of a turn.
  guide[0].copy(path[0]);
  guide[4].copy(path.at(-1));
  const origin = guide[0];
  const g = new T.Group();
  g.name = 'Roma curl ' + side + ' ' + i;
  g.position.copy(origin);
  head.add(g);
  const shape = new T.CatmullRomCurve3(path, false, 'catmullrom', 0.45);
  const taper = (t) =>
    width * (0.74 + 0.26 * Math.sin(Math.PI * t)) * (1 - 0.25 * t) * (0.045 + 0.955 * (1 - ease(t, 0.79, 1)));
  addCurlMesh(
    g,
    curlRibbon(shape, taper, radial, 40, 10, origin),
    hair[i % 5 === 0 ? 2 : i % 4 === 1 ? 0 : 1],
    40,
    10,
  );
  if (!inner && i % 5 === 1) {
    const ridge = path.map((p, j) => {
      const t = j / (path.length - 1),
        spread = width * (0.54 + 1.1 * ease(t, 0.7, 1));
      return p
        .clone()
        .addScaledVector(radial, width * 0.51)
        .addScaledVector(tangential, spread * Math.sin(1.9 * t + 0.31 + i));
    });
    addCurlMesh(
      g,
      curlRibbon(
        new T.CatmullRomCurve3(ridge),
        (t) => 0.00062 * (0.12 + 0.88 * Math.sin(Math.PI * t) ** 0.54),
        radial,
        32,
        6,
        origin,
      ),
      hair[3],
      32,
      6,
    );
  }
  return {
    group: g,
    points: guide.map((p) => p.clone().sub(origin)),
    role: face ? 'face' : 'mass',
    side,
    radius: Math.max(taper(0.9) + 0.001, 0.0043),
    ...curlResponse(side, i, face),
  };
}

export function makeRomaGroom(head, materials) {
  crown(head, materials);
  const locks = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 42; i++) locks.push(shapeCurl(head, materials, side, i, i >= 32));
  return locks;
}
