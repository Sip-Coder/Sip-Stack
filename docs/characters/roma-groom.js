// Roma's chestnut set. Dimensions are in the sculpted head's own frame.
// Each spiral has a smooth four-segment mechanical guide under its finer
// curled surface, so the shape of the curl survives secondary animation.
import * as T from 'three';
import { upperSurface } from './hair-heightfield.js';
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
  const hairline = 0.072 + 0.054 * front ** 1.65 + 0.005 * Math.sin(2 * a + 0.48) * front;
  const elevation = t * Math.PI * 0.5;
  const breadth = Math.cos(elevation) ** 0.84;
  return point(
    0.006 * t + 0.0735 * Math.sin(a) * breadth,
    hairline + (0.1618 - hairline) * Math.sin(elevation),
    -0.012 + (0.065 * Math.cos(a) + 0.008 * Math.max(0, -Math.cos(a))) * breadth,
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
    // Leave a soft hairline under the side-swept forelock.
    if (Math.abs(end) < 0.68) continue;
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
  // Broad overlapping sections leave the side part along the length of the
  // head. Each strip rolls out, then down into the independently sprung
  // curls. The part runs front to back instead of converging at a single pole.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 13; row++) {
      const rowAngle = -1.35 + row * 0.19;
      const back = Math.max(0, -Math.sin(rowAngle));
      const depth = Math.sin(rowAngle);
      const arch = Math.cos(rowAngle);
      const line = [];
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        const angle = 0.17 + side * (1.72 + 0.35 * back) * t;
        const bouffant = Math.sin(Math.PI * t);
        line.push(
          point(
            (0.0765 * arch + bouffant * 0.003) * Math.sin(angle),
            0.089 + 0.074 * arch * Math.cos(angle) + (0.0025 + 0.003 * back) * bouffant,
            -0.012 + 0.067 * depth - 0.01 * bouffant + 0.005 * Math.sin(t * turn + row * 0.24) * bouffant,
          ),
        );
      }
      const lift = (t) => 0.0072 * (0.14 + 0.86 * Math.sin(t * Math.PI) ** 0.57);
      const normal = point(side * 0.48, 0.52 * arch, depth).normalize();
      const shape = new T.CatmullRomCurve3(line);
      piles[row % 3 === 1 ? 2 : 1].push(curlRibbon(shape, lift, normal, 28, 10));
      const ridge = line.map((p, j) => p.clone().addScaledVector(normal, lift(j / 16) * 0.58));
      piles[2].push(curlRibbon(new T.CatmullRomCurve3(ridge), (t) => lift(t) * 0.22, normal, 22, 6));
    }
  }
  // A lifted, side-parted forelock in front of the band. Individual ribbons
  // overlap, open away from the eyes, then turn under at the temples.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row++) {
      const d = row * 0.0018;
      const sweep = side < 0 ? 1 : 0.74;
      const shape = [
        [0.021 + d, 0.145 + d * 0.5, 0.038],
        [0.019 + side * 0.022 * sweep, 0.157 + d * 0.35, 0.045 + d * 0.4],
        [side * 0.021, 0.149 + d, 0.056 + d * 0.52],
        [side * 0.047, 0.13 + d * 0.77, 0.052 + d * 0.65],
        [side * 0.069, 0.124 + d * 0.55, 0.042 + d * 0.36],
        [side * 0.076, 0.112 + d * 0.6, 0.031],
        [side * 0.069, 0.102 + d * 0.58, 0.036],
      ].map(([x,y,z]) => point(x, y, z + 0.009 * ease(y, 0.130, 0.155)));
      const radius = (t) => (row === 0 ? 0.007 : 0.0042) * (0.085 + 0.915 * Math.sin(Math.PI * t) ** 0.53);
      piles[row % 3 === 1 ? 2 : 1].push(
        curlRibbon(new T.CatmullRomCurve3(shape), radius, point(side * 0.28, 0.4, 1).normalize(), 32, 10),
      );
    }
  }
  for (let i = 0; i < 4; i++)
    if (piles[i].length) {
      const geometry = mergeGeometries(piles[i]);
      const positions = geometry.getAttribute('position');
      // Comb the fixed occipital layers close to the skull. At the front,
      // curl the short crest forward and down over the edge of the part.
      for (let v = 0; v < positions.count; v++) {
        const y = positions.getY(v), z = positions.getZ(v);
        const front = ease(z, 0.023, 0.062), rear = 1 - ease(z, -0.080, -0.027);
        const crown = rear * ease(y, 0.051, 0.095) * (1 - ease(y, 0.130, 0.155));
        const forelock = front * ease(y, 0.113, 0.126) * (1 - ease(y, 0.148, 0.165));
        positions.setZ(v, z + 0.013 * (crown + forelock));
        positions.setY(v, y - 0.008 * front * ease(y, 0.139, 0.158));
      }
      geometry.computeVertexNormals();
      const m = new T.Mesh(geometry, hair[i]);
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
  // The nape falls over the turned-back hood. Graduate the outer row
  // toward the middle of the back, with a shorter underlayer for volume.
  const nape = inner ? ease(i, 38, 40) : ease(i, 21, 26);
  const sideLayer = inner ? 0 : Math.exp(-((i - 23.5) ** 2) / 12);
  endY -= (nape * (inner ? 0.016 : 0.021) + 0.022 * sideLayer) *
    (0.9 + 0.1 * Math.cos(i + side));
  if (face && (i === 1 || i === 3)) endY -= 0.019;
  // Graduate the front of the bob above the right strap. These two
  // curtains sweep past the hoop as the cheek approaches the shoulder.
  if (side > 0 && i === 4) endY = 0.048;
  if (side > 0 && i === 5) endY += 0.024;
  const crossShoulder = angle < 1.4;
  const width = (inner ? 0.0118 : face ? 0.0054 : 0.0041) + 0.0007 * Math.cos(i * 2.63 + side);
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
    // Fit the occipital curve close to the skull. Near the hem the two
    // outer cascades separate, lying on either side of the rucksack lid.
    p.z += 0.009 * Math.max(0, -z) * ease(p.y, -0.015, 0.052);
    p.x += side * sideLayer * 0.013 * under;
    p.z -= (nape * 0.005 + sideLayer * 0.005) * under;
    if (side > 0 && i === 7) {
      // Cross the leading shoulder cup on its anterior face. A little room
      // here lets the tip swing freely instead of sticking on every stride.
      p.z += 0.005 * ease(t, 0.36, 0.76);
    }
    if (inner && i < 34) {
      // Tuck the two deep temple sections behind the earlobe. The front
      // curtain falls separately in front of the hoops and shoulder straps.
      p.z = T.MathUtils.lerp(p.z, -0.053 - 0.01 * t, ease(t, 0.07, 0.47));
    }
    if (!inner && i <= 8) {
      const atTemple = ease(t, 0.06, 0.33);
      p.z += atTemple * Math.max(0, 0.054 + 0.003 * Math.cos(i) - p.z);
    }
    if ((side < 0 && i === 7) || (side > 0 && i >= 3 && i <= 5)) {
      // Keep the free temple plume lateral to the hoops as they rotate
      // towards the collar. The low forehead locks still frame the cheek.
      p.x += side * 0.009 * ease(t, 0.28, 0.67);
    }
    if (side > 0 && (i === 4 || i === 5)) {
      p.z += (i === 4 ? 0.012 : 0.009) * ease(t, 0.28, 0.64);
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
    // Neighbouring locks leave the crown in small families. They share
    // the broad S sweep but rotate around separate axes and fan as the
    // hanging ends turn in. Ease to the physical guide at either endpoint.
    const family = Math.floor(i / 4);
    const wave = 1.38 * turn * t + family * 0.9 + 0.13 * (i % 4) + side * 0.38;
    const envelope = Math.sin(Math.PI * t);
    const relief = inner ? 0.0085 : 0.014;
    p.addScaledVector(tangential, side * relief * Math.sin(wave) * envelope);
    p.addScaledVector(radial, relief * 0.67 * Math.cos(wave) * envelope);
    const hem = Math.max(0, (t - 0.7) / 0.3);
    // Curl under and back up into the point, to give overlapping scallops
    // around the shoulder instead of parallel, straight pointed ends.
    p.y -= (face ? 0.0045 : 0.006) * Math.sin(hem * Math.PI) ** 2;
    p.addScaledVector(tangential, side * 0.006 * Math.sin(hem * turn));
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
    width * (0.74 + 0.26 * Math.sin(Math.PI * t)) * (1 - 0.25 * t) * (0.04 + 0.96 * (1 - ease(t, 0.85, 1)));
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

// Derive the curved contact surfaces from the actual rib-knit roll and
// the band. Their UVs run from end to end (u) and across the fabric (v).
// Fitting to these sections also keeps the envelopes attached as the
// shoulder and head move independently during a tuck or overhead reach.
export function clothHairColliders(mesh, spanCount, role) {
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  const sections = Array.from({ length: spanCount + 1 }, () => new T.Box3());
  const vertex = new T.Vector3();
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i) * spanCount;
    const k = Math.round(u);
    if (Math.abs(k - u) < 0.0001) sections[k].expandByPoint(vertex.fromBufferAttribute(position, i));
  }
  const centers = sections.map((box) => box.getCenter(new T.Vector3()));
  return centers.slice(0, -1).map((a, k) => {
    const b = centers[k + 1];
    const line = new T.Line3(a, b),
      nearest = new T.Vector3();
    let radius = 0;
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i) * spanCount;
      if (u < k || u > k + 1) continue;
      vertex.fromBufferAttribute(position, i);
      line.closestPointToPoint(vertex, true, nearest);
      radius = Math.max(radius, vertex.distanceTo(nearest));
    }
    return {
      role,
      localContact: true,
      node: mesh,
      a: a.toArray(),
      b: b.toArray(),
      radius: radius + (role === 'band' ? 0.0035 : 0.0015),
    };
  });
}

// The folded hood shares skin weights with the jacket yoke. Sample the
// outside of each panel in its current pose so the hair clears the raised
// shoulder as well as the resting collar. The sample buffers and envelopes
// are retained across fixed ticks, including switches of geometry tier.
export function bindHoodContacts(hood) {
  const count = 8;
  const panels = Array.from({ length: count }, () => {
    const node = new T.Group();
    node.name = 'Folded hood contact';
    hood.add(node);
    return { node, role: 'collar', localContact: true, center: [0, 0, 0], radii: [1, 1, 1] };
  });
  const tables = new Map();
  for (const g of [hood.geometry, hood.userData.mobileGeometry]) {
    const uv = g.getAttribute('uv');
    const rows = panels.map(() => []);
    // Both walls of this closed piece share their (u,v) grid. The first
    // wall carries the exterior binding and is the hair contact surface.
    for (let i = 0; i < uv.count / 2; i++) {
      const u = uv.getX(i),
        v = uv.getY(i);
      const station = u * count * 2;
      if (Math.abs(station - Math.round(station)) > 1e-4 || Math.abs(v * 4 - Math.round(v * 4)) > 1e-4)
        continue;
      rows[Math.floor(u * count) % count].push(i);
      if (Math.round(station) % 2 === 0) rows[(Math.round(u * count) + count - 1) % count].push(i);
    }
    tables.set(g, rows.map((ids, panel) => {
      const samples = ids.map((id) => ({ id, p: new T.Vector3() }));
      const anchor = (along, across) => {
        let nearest, distance = Infinity;
        const u = (panel + along) / count;
        for (const sample of samples) {
          const du = Math.abs(uv.getX(sample.id) - u);
          const d = Math.min(du, 1 - du) ** 2 + (uv.getY(sample.id) - across) ** 2;
          if (d < distance) { distance = d; nearest = sample.p; }
        }
        return nearest;
      };
      return { samples, left: anchor(0, 0.5), right: anchor(1, 0.5),
        inner: anchor(0.5, 0), outer: anchor(0.5, 1) };
    }));
  }
  const bounds = new T.Box3();
  const rel = new T.Vector3(), localCenter = new T.Vector3();
  const along = new T.Vector3(), across = new T.Vector3(), normal = new T.Vector3();
  const basis = new T.Matrix4(), inverse = new T.Matrix4();
  function update() {
    const sets = tables.get(hood.geometry);
    for (let i = 0; i < count; i++) {
      const frame = panels[i].node, panel = sets[i];
      for (const sample of panel.samples) hood.getVertexPosition(sample.id, sample.p);
      // Fit along the woven meridian and the fall of the roll. A world-axis
      // box around this diagonal fold fills the air between neck and pack.
      along.subVectors(panel.right, panel.left).normalize();
      across.subVectors(panel.outer, panel.inner);
      normal.crossVectors(along, across).normalize();
      across.crossVectors(normal, along).normalize();
      basis.makeBasis(along, across, normal);
      inverse.copy(basis).transpose();
      bounds.makeEmpty();
      for (const {p} of panel.samples) bounds.expandByPoint(rel.copy(p).applyMatrix4(inverse));
      bounds.getCenter(localCenter);
      frame.position.copy(localCenter).applyMatrix4(basis);
      frame.quaternion.setFromRotationMatrix(basis);
      bounds.getSize(frame.scale).multiplyScalar(0.5).addScalar(0.001);
      frame.scale.z = Math.max(frame.scale.z, 0.008);
      let enclosing = 1;
      for (const {p} of panel.samples) {
        rel.copy(p).applyMatrix4(inverse).sub(localCenter).divide(frame.scale);
        enclosing = Math.max(enclosing, rel.length());
      }
      frame.scale.multiplyScalar(enclosing).addScalar(0.0015);
    }
  }
  update();
  return { panels, update };
}

// The flap and load pads sit above the shoulder blades during a tuck. Fit
// the dorsal contact volumes to the actual pack in its local frame. The
// shoulder bands change shape every tick, so their contact volumes follow
// the current stitched cross sections instead of the neutral skeleton.
export function bindPackContacts(kit) {
  const shapes = [];
  const samples = new T.Box3();
  const point = new T.Vector3();
  const extent = new T.Vector3();
  function fit(node, points, padding) {
    samples.setFromPoints(points).getCenter(node.position);
    samples.getSize(node.scale).multiplyScalar(0.5);
    node.scale.max(extent.setScalar(padding));
    let shell = 1;
    for (const p of points) {
      point.copy(p).sub(node.position).divide(node.scale);
      shell = Math.max(shell, point.length());
    }
    node.scale.multiplyScalar(shell).addScalar(padding);
  }
  function contact(parent) {
    const node = new T.Group();
    node.name = 'Hair contact on ' + parent.name;
    parent.add(node);
    shapes.push({ node, localContact: true, role: 'pack', center: [0, 0, 0], radii: [1, 1, 1] });
    return node;
  }
  const pack = kit.backpack[0].parent;
  shapes.push(upperSurface(pack, kit.backpack));

  const ribbons = [];
  for (const mesh of kit.packStraps) {
    const uv = mesh.geometry.getAttribute('uv');
    // Four overlapping patches follow the bound section up the back and
    // over the crest. The lower front ends are below the bob.
    for (let panel = 0; panel < 4; panel++) {
      const ids = [], points = [];
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        if (u < panel * 0.13 - 0.02 || u > (panel + 1) * 0.13 + 0.02) continue;
        ids.push(i);
        points.push(new T.Vector3());
      }
      if (ids.length) ribbons.push({ mesh, node: contact(mesh), ids, points });
    }
  }
  function update() {
    for (const { mesh, node, ids, points } of ribbons) {
      const pos = mesh.geometry.getAttribute('position');
      for (let i = 0; i < ids.length; i++) points[i].fromBufferAttribute(pos, ids[i]);
      fit(node, points, 0.004);
    }
  }
  update();
  return { shapes, update };
}
