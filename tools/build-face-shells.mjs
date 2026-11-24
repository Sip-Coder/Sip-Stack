// Offline radial envelopes of the neutral craniofacial surfaces. Hair and skin
// share these stations. Index 0 faces forward, with positive angles to actor left.
import { writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) registerHooks({
  resolve(name, context, next) {
    const file = name === 'three' ? 'build/three.module.js'
      : name.startsWith('three/addons/') ? 'examples/jsm/' + name.slice(13) : null;
    return file ? { url: pathToFileURL(resolve(process.env.THREE_ROOT, file)).href, shortCircuit: true }
      : next(name, context);
  },
});
const { Vector3 } = await import('three');
const { createActor, heroHeadScale } = await import('../docs/characters/rig.js');
const { loadSkeletonScan } = await import('../docs/characters/diagram-scan-source.js');
const { faceLandmarks } = await import('../docs/characters/source-face-landmarks.js');

const inches = 0.0254;
const directions = Array.from({ length: 36 }, (_, i) => {
  const angle = i * Math.PI / 18;
  return [Math.sin(angle), Math.cos(angle)];
});
const mix = (a, b, t) => a + (b - a) * t;
const ramp = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

function triangles(xyz, indices) {
  return Array.from({ length: indices.length / 3 }, (_, i) => {
    const corners = [0, 1, 2].map(j => xyz[indices[i * 3 + j]]);
    return [Math.min(...corners.map(v => v[1])), Math.max(...corners.map(v => v[1])), corners];
  });
}

function cutGeometry(geometry, transform = p => p) {
  const p = geometry.attributes.position;
  const xyz = Array.from({ length: p.count }, (_, i) =>
    transform(new Vector3().fromBufferAttribute(p, i)).toArray());
  return triangles(xyz, geometry.index.array);
}

async function muscleSurfaces(hero) {
  const superficial = name => !/orbicularis oculi/.test(name);
  const { loadHeadMuscleParts } = await import('../docs/characters/diagram-face-anatomy.js');
  const registered = await loadHeadMuscleParts(hero);
  return registered.filter(part => superficial(part.name.toLowerCase())).flatMap(part =>
    cutGeometry(part.mesh.geometry, p => p.applyMatrix4(part.sourceMatrix)));
}

function section(surface, y) {
  const lines = [];
  for (const [min, max, points] of surface) {
    if (y < min || y >= max) continue;
    const cut = [];
    for (let i = 0; i < 3; i++) {
      const a = points[i], b = points[(i + 1) % 3];
      if ((a[1] <= y) === (b[1] <= y)) continue;
      const f = (y - a[1]) / (b[1] - a[1]);
      cut.push(mix(a[0], b[0], f), mix(a[2], b[2], f));
    }
    if (cut.length === 4) lines.push(cut);
  }
  return lines;
}

// Keep the dermis continuous over bony and muscle attachments. The cut
// polygon gives its external support while the taut front path bridges the
// interdental spaces and deep medial hollows between cheek muscles.
function tautBoundary(lines) {
  const points = lines.flatMap(([ax, az, bx, bz]) => [[ax, az], [bx, bz]]);
  points.sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
  const half = order => {
    const path = [];
    for (const p of order) {
      while (path.length >= 2) {
        const [ax, az] = path.at(-2), [bx, bz] = path.at(-1);
        if ((bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax) > 1e-12) break;
        path.pop();
      }
      path.push(p);
    }
    return path.slice(0, -1);
  };
  const edge = half(points).concat(half(points.toReversed()));
  return edge.map((a, i) => [...a, ...edge[(i + 1) % edge.length]]);
}

function support(lines, cx, cz, dx, dz) {
  let max = 0;
  for (const [ax, az, bx, bz] of lines) {
    const ex = bx - ax, ez = bz - az;
    const cross = dx * ez - dz * ex;
    if (Math.abs(cross) < 1e-10) continue;
    const x = ax - cx, z = az - cz;
    const u = (x * dz - z * dx) / cross;
    if (u >= 0 && u <= 1) max = Math.max(max, (x * ez - z * ex) / cross);
  }
  return max;
}

function fillOpening(values, i) {
  const n = values.length;
  const left = values[(i + n - 1) % n], right = values[(i + 1) % n];
  return Math.max(values[i], (left + right) / 2 - 0.0008);
}

function offset(landmarks, y, dx, dz, roma) {
  const fore = Math.max(0, dz);
  const side = Math.abs(dx);
  const cheek = bell(y, (landmarks.malar.L[1] + landmarks.malar.R[1]) / 2 - 0.014, 0.012) *
    bell(side, 0.70, 0.36) * ramp(-0.1, 0.5, dz);
  const chin = bell(y, landmarks.pogonion[1], 0.009) * fore ** 3;
  const jaw = bell(y, (landmarks.gonion.L[1] + landmarks.gonion.R[1]) / 2, 0.010) * bell(side, 0.87, 0.42);
  const forehead = y > landmarks.glabella[1] ? 0.24 : (roma ? 0.218 : 0.236);
  return forehead + (roma ? 0.37 : 0.39) * cheek +
    (roma ? 0.17 : 0.12) * chin + (roma ? 0.085 : 0.15) * jaw;
}

// The circumference alone would bridge the recessed rim onto the nose and
// smooth both cheekbones to whichever side of the scan is farther forward.
// Pin the fair skin to the same measured tissue depth at each bony landmark.
function anchor(rows, point, ray, depth, verticalWidth, angularWidth) {
  const [x, y, z] = point;
  const [dx, dy, dz] = ray;
  const targetX = x + dx * depth, targetZ = z + dz * depth;
  const bottom = rows[0][0], span = rows.at(-1)[0] - bottom;
  const targetY = y + dy * depth;
  const at = ramp(bottom, bottom + span, targetY) * (rows.length - 1);
  const i = Math.min(rows.length - 2, Math.floor(at)), fraction = at - i;
  const a = rows[i], b = rows[i + 1];
  const rx = targetX - mix(a[1], b[1], fraction), rz = targetZ - mix(a[2], b[2], fraction);
  const angle = Math.atan2(rx, rz), turn = (angle / (Math.PI / 18) + 36) % 36;
  const j = Math.floor(turn), next = (j + 1) % 36;
  const radiusAt = row => mix(row[3 + j], row[3 + next], turn - j);
  const delta = Math.hypot(rx, rz) - mix(radiusAt(a), radiusAt(b), fraction);
  for (const row of rows.slice(1, -1)) {
    const vertical = bell(row[0], targetY, verticalWidth);
    for (let k = 0; k < 36; k++) {
      const distance = ((k - turn + 54) % 36) - 18;
      row[k + 3] += delta * vertical * bell(distance, 0, angularWidth);
    }
  }
}

function fatPads(landmarks, roma, localInch) {
  const pads = [];
  const add = (name, y, angle, halfHeight, halfArc, depth, floor) =>
    pads.push({ name, y, angle, halfHeight, halfArc, depth: depth * localInch, floor: (floor - 0.22) * localInch });
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const label = sign === 1 ? 'Left ' : 'Right ';
    const { malar, gonion, orbit } = landmarks;
    add(label + 'malar fat pad', malar[side][1] - 0.0036, sign * 0.67, 0.012, 0.42,
      roma ? 0.15 : 0.125, roma ? 0.705 : 0.638);
    add(label + 'buccal fat pad', mix(malar[side][1], gonion[side][1], 0.42), sign * 0.83, 0.016, 0.53, 0.215, 0.768);
    add(label + 'under-eye fat pad', orbit[side].inferior[1] - 0.0032, sign * 0.47, 0.008, 0.32,
      0.09, roma ? 0.370 : 0.327);
    add(label + 'nasolabial fat pad', mix(landmarks.piriform[1], landmarks.upperIncisor[1], 0.30),
      sign * 0.38, 0.012, 0.22, 0.10, roma ? 0.374 : 0.437);
    add(label + 'submandibular fat pad', gonion[side][1] - 0.003, sign * 1.32, 0.013, 0.72, 0.115, 0.492);
    add(label + 'temporal fat pad', orbit[side].superior[1] + 0.009, sign * 1.20, 0.017, 0.51,
      0.065, roma ? 0.378 : 0.386);
  }
  add('Perioral fat pad', landmarks.upperIncisor[1] + 0.0007, 0, 0.008, 0.40, roma ? 0.145 : 0.095, 0.472);
  add('Chin fat pad', landmarks.pogonion[1] - 0.0015, 0, 0.010, 0.47, 0.10, 0.433);
  add('Submental fat pad', landmarks.menton[1] + 0.004, 0, 0.008, 0.55, 0.10, 0.276);
  add('Nasal tip soft tissue', mix(landmarks.nasalBone[1], landmarks.piriform[1], 0.76), 0, 0.006, 0.24, 0.088, 0.394);
  return pads;
}

function falloff(pad, y, angle) {
  const py = (y - pad.y) / pad.halfHeight, pa = (angle - pad.angle) / pad.halfArc;
  return Math.max(0, 1 - py * py - pa * pa) ** 1.6;
}

function sectionAt(rows, y, angle) {
  const at = (rows.length - 1) * ramp(rows[0][0], rows.at(-1)[0], y);
  const j = Math.min(rows.length - 2, Math.floor(at));
  const a = rows[j], b = rows[j + 1], f = at - j;
  const turn = (angle / (Math.PI / 18) + 36) % 36, k = Math.floor(turn), next = (k + 1) % 36;
  const radius = row => mix(row[k + 3], row[next + 3], turn - k);
  return [mix(a[1], b[1], f), mix(a[2], b[2], f), mix(radius(a), radius(b), f)];
}

function bakePad(pad, bases, skin, dermis) {
  const indices = [], positions = [];
  const columns = 16, rings = 4;
  const first = bases[0][0] + 0.0015, last = bases.at(-1)[0] - 0.0015;
  const put = (radius, turn, front) => {
    const y = Math.max(first, Math.min(last, pad.y + pad.halfHeight * radius * Math.sin(turn)));
    const angle = pad.angle + pad.halfArc * radius * Math.cos(turn);
    const [x, z, base] = sectionAt(bases, y, angle);
    const [, , outer] = sectionAt(skin, y, angle);
    const rear = Math.min(base, outer - dermis);
    const r = front ? Math.min(rear + pad.depth * falloff(pad, y, angle), outer - dermis) : rear;
    positions.push(...[x + r * Math.sin(angle), y, z + r * Math.cos(angle)].map(n => +n.toFixed(6)));
  };
  for (const front of [true, false]) {
    const start = positions.length / 3;
    const triangle = (a, b, c) => indices.push(a, front ? b : c, front ? c : b);
    put(0, 0, front);
    for (let k = 0; k < rings; k++) for (let i = 0; i < columns; i++) {
      put((k + 1) / rings, 2 * Math.PI * i / columns, front);
      const a = start + k * columns + i + 1, b = start + k * columns + ((i + 1) % columns) + 1;
      if (!k) triangle(start, b, a);
      else {
        triangle(a - columns, b - columns, a);
        triangle(a, b - columns, b);
      }
    }
  }
  return { name: pad.name, positions, indices };
}

for (const hero of ['sippy', 'roma']) {
  const landmarks = faceLandmarks[hero];
  const height = hero === 'sippy' ? 1.78 : 1.68;
  const localInch = inches / (height * heroHeadScale[hero]);
  const rig = createActor(hero, 1);
  const { height: donorHeight, original } = rig.anatomy;
  const pivot = new Vector3(...landmarks.jaw.pivot), axis = new Vector3(...landmarks.jaw.axis);
  const skull = await loadSkeletonScan(hero, 'high');
  const bones = ['SKULL_CRANIAL_MAXILLA', 'SKULL_MANDIBLE'].flatMap(name =>
    cutGeometry(skull.get(name), p => {
      p.sub(original.head).divideScalar(donorHeight);
      if (name === 'SKULL_MANDIBLE') p.sub(pivot).applyAxisAngle(axis, landmarks.jaw.angle).add(pivot);
      return p;
    }));
  const muscles = await muscleSurfaces(hero);
  const rows = [], bases = [];
  const pads = fatPads(landmarks, hero === 'roma', localInch);
  const { min, max } = landmarks.skull;
  const bottom = min[1] - 0.28 * localInch, top = max[1] + 0.26 * localInch;
  const intervals = 34;
  for (let j = 0; j <= intervals; j++) {
    const y = mix(bottom, top, j / intervals);
    // Between the throat and chin the centers move anteriorly with the jaw.
    const chin = 1 - ramp(min[1], landmarks.gonion.L[1] + 0.020, y);
    const cx = (min[0] + max[0]) / 2;
    const cz = mix(-0.008, landmarks.menton[2] * 0.70, chin ** 2);
    const near = Math.min(max[1] - 0.0002, Math.max(min[1] + 0.0017, y));
    const muscleBlend = 1 - ramp(0.029, 0.062, y);
    const samples = [-0.0035, -0.0018, 0, 0.0018, 0.0035].map(dy => {
      const level = near + dy;
      const bone = section(bones, level);
      if (!muscleBlend) return [dy, bone, null, bone];
      const structure = bone.concat(section(muscles, level));
      return [dy, structure, tautBoundary(structure), bone];
    });
    const supportRow = [];
    let radii = directions.map(([dx, dz]) => {
      const angle = Math.atan2(dx, dz);
      const weights = pads.map(zone => falloff(zone, y, angle));
      const fat = Math.max(...pads.map((zone, i) => zone.depth * weights[i]));
      const floor = 0.22 * localInch + Math.max(...pads.map((zone, i) => zone.floor * weights[i]));
      // Some previous soft-tissue clearance is subcutaneous fat. Apply the
      // remainder as dermis after the fat pads, preserving thin bony zones.
      const pad = offset(landmarks, y, dx, dz, hero === 'roma') * localInch;
      const dermis = Math.max(0.07 * localInch, pad - fat * 0.74);
      const thickness = dermis + fat;
      let outer = 0, raw = 0;
      for (const [dy, lines, boundary, bone] of samples) {
        const exact = support(lines, cx, cz, dx, dz);
        const taut = boundary ? support(boundary, cx, cz, dx, dz) : exact;
        const boneRadius = support(bone, cx, cz, dx, dz);
        const muscleRadius = mix(exact, Math.max(exact, taut), ramp(-0.55, 0.65, dz) * 0.93);
        const radial = boneRadius ? mix(boneRadius, muscleRadius, muscleBlend) : muscleRadius * muscleBlend;
        if (!radial) continue;
        raw = Math.max(raw, radial);
        const horizontal = Math.sqrt(Math.max(0, thickness ** 2 - (near + dy - y) ** 2));
        const boneOffset = Math.sqrt(Math.max(0, floor ** 2 - (near + dy - y) ** 2));
        outer = Math.max(outer, radial + horizontal, boneRadius ? boneRadius + boneOffset : 0);
      }
      supportRow.push(raw);
      // Thin bridge across the oral cavity, behind the vermilion surface.
      const mouth = bell(y, landmarks.incisor[1] + 0.001, 0.007) * Math.max(0, dz) ** 11;
      return Math.max(outer, (landmarks.upperIncisor[2] + 0.32 * localInch - cz) * mouth);
    });
    // Fair cut edges at fossae and across adjacent cheek and jaw attachments.
    for (let i = 0; i < 4; i++) radii = radii.map((_, k) => fillOpening(radii, k));
    if (hero === 'roma') {
      const tuck = 1 - ramp(landmarks.menton[1] + 0.008, landmarks.gonion.L[1] + 0.012, y);
      radii = radii.map((r, k) => Math.max(0, r - 0.125 * localInch * tuck * directions[k][0] ** 2));
    }
    if (j < 3 || j === intervals) {
      const cap = j === intervals ? 0.18 : ([0.24, 0.71, 0.94])[j];
      radii = radii.map(value => Math.max(0.0012, value * cap));
    }
    rows.push([y, cx, cz, ...radii]);
    bases.push([y, cx, cz, ...supportRow]);
  }
  const cuts = rows.map(row => [...row]);
  for (let pass = 0; pass < 9; pass++) {
    const source = rows.map(row => [...row]);
    for (let j = 1; j < rows.length - 1; j++) {
      const previous = source[j - 1], row = source[j], next = source[j + 1];
      const face = 1 - ramp(0.030, 0.065, row[0]);
      for (let i = 3; i < row.length; i++) {
        const a = row[3 + (i + 32) % 36], b = row[3 + (i + 34) % 36];
        const vertical = (previous[i] + next[i]) * 0.5;
        const average = vertical * 0.58 + (a + b) * 0.21;
        const oral = bell(row[0], landmarks.upperIncisor[1] - 0.005, 0.025) * Math.max(0, directions[i - 3][1]);
        const allowed = (0.20 + 0.25 * oral) * localInch;
        const smoothed = Math.max(cuts[j][i] - allowed, mix(row[i], average, 0.50 + 0.15 * oral));
        const crown = Math.max(row[i], vertical - 0.0008);
        rows[j][i] = mix(pass < 2 ? crown : row[i], smoothed, face);
      }
    }
  }
  // Bone-to-skin pooled adult means from Hona & Stephan (2023), table 3.
  // They include muscle and fat. Malar uses adjacent zygion as the proxy.
  const anterior = [0, 0, 1];
  for (let pass = 0; pass < 2; pass++) {
    anchor(rows, landmarks.glabella, anterior, 0.225 * localInch, 0.008, 2.0);
    anchor(rows, landmarks.nasion, anterior, 0.25 * localInch, 0.005, 1.35);
    anchor(rows, landmarks.pogonion, anterior, 0.445 * localInch, 0.008, 2.3);
    anchor(rows, landmarks.menton, [0, -0.82, 0.57], 0.285 * localInch, 0.005, 2.6);
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      anchor(rows, landmarks.malar[side], [0.67 * sign, 0, 0.74], 0.310 * localInch, 0.008, 2.1);
      anchor(rows, landmarks.orbit[side].superior, anterior, 0.285 * localInch, 0.007, 1.7);
      anchor(rows, landmarks.gonion[side], [0.8 * sign, -0.1, 0.6], 0.50 * localInch, 0.010, 2.0);
    }
  }
  const quantizedRows = rows.map(row => row.map(value => Math.round(value * 100000)));
  const deltas = quantizedRows.map((row, station) => {
    if (station === 0) return row;
    const previous = quantizedRows[station - 1];
    const difference = row.map((value, column) => value - previous[column]);
    // The first three columns are the station height and center. Subsequent
    // columns describe adjacent rays and benefit from a second delta.
    return difference.map((value, column) => column < 4 ? value : value - difference[column - 1]);
  });
  const data = deltas.map(row => '  [' + row.join(',') + '],').join('\n');
  const floorMarks = new Set(['glabella', 'nasion', 'nasalBone', 'piriform', 'upperIncisor', 'incisor', 'orbit', 'meatus']);
  const marks = Object.entries(landmarks).filter(([key]) => floorMarks.has(key))
    .map(([name, value]) => `  ${name}: ${JSON.stringify(value)},`).join('\n');
  await writeFile(new URL('../docs/characters/' + hero + '-face-shell.js', import.meta.url),
    '// Generated by tools/build-face-shells.mjs in units of 1/100000 standing height.\n' +
    "import { decodeExteriorStations } from './human-exterior.js';\n\n" +
    'export const skullLandmarks = {\n' + marks + '\n};\n\n' +
    'const deltas = [\n' + data + '\n];\n\n' +
    'export const faceShell = decodeExteriorStations(deltas);\n');
  await writeFile(new URL('../docs/characters/assets/' + hero + '-face-fat.json', import.meta.url),
    JSON.stringify(pads.map(pad => bakePad(pad, bases, rows, 0.06 * localInch))) + '\n');
}
