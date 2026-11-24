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
const { createActor } = await import('../docs/characters/rig.js');
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
  const cheek = bell(y, landmarks.malar.L[1] - 0.015, 0.010) * bell(side, 0.72, 0.34) * ramp(-0.1, 0.5, dz);
  const zygoma = bell(y, landmarks.malar.L[1], 0.010) * bell(side, 0.75, 0.40) * fore;
  const chin = bell(y, landmarks.pogonion[1], 0.009) * fore ** 3;
  const jaw = bell(y, landmarks.gonion.L[1], 0.009) * bell(side, 0.87, 0.42);
  const forehead = y > landmarks.glabella[1] ? 0.24 : (roma ? 0.218 : 0.236);
  return forehead + (roma ? 0.29 : 0.30) * cheek + 0.016 * zygoma +
    (roma ? 0.18 : 0.20) * chin + 0.15 * jaw;
}

for (const hero of ['sippy', 'roma']) {
  const landmarks = faceLandmarks[hero];
  const height = hero === 'sippy' ? 1.78 : 1.68;
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
  const rows = [];
  const { min, max } = landmarks.skull;
  const bottom = min[1] - 0.0048, top = max[1] + 0.0038;
  const intervals = 34;
  for (let j = 0; j <= intervals; j++) {
    const y = mix(bottom, top, j / intervals);
    // Between the throat and chin the centers move anteriorly with the jaw.
    const chin = 1 - ramp(min[1], landmarks.gonion.L[1] + 0.020, y);
    const cx = (min[0] + max[0]) / 2;
    const cz = mix(-0.008, landmarks.menton[2] * 0.70, chin ** 2);
    const near = Math.min(max[1] - 0.0002, Math.max(min[1] + 0.0017, y));
    const samples = [-0.0035, -0.0018, 0, 0.0018, 0.0035].map(dy => {
      const level = near + dy;
      const structure = section(bones, level);
      if (y > 0.041) return [dy, structure, null];
      structure.push(...section(muscles, level));
      return [dy, structure, tautBoundary(structure)];
    });
    let radii = directions.map(([dx, dz]) => {
      const pad = offset(landmarks, y, dx, dz, hero === 'roma') * inches / height;
      let outer = 0;
      for (const [dy, lines, boundary] of samples) {
        const exact = support(lines, cx, cz, dx, dz);
        const taut = boundary ? support(boundary, cx, cz, dx, dz) : exact;
        const radial = mix(exact, Math.max(exact, taut), ramp(-0.55, 0.65, dz) * 0.93);
        if (!radial) continue;
        const horizontal = Math.sqrt(Math.max(0, pad ** 2 - (near + dy - y) ** 2));
        outer = Math.max(outer, radial + horizontal);
      }
      // Thin bridge across the oral cavity, behind the vermilion surface.
      const mouth = bell(y, landmarks.incisor[1] + 0.001, 0.007) * Math.max(0, dz) ** 11;
      return Math.max(outer, (landmarks.upperIncisor[2] + 0.004 - cz) * mouth);
    });
    // Fair cut edges at fossae and across adjacent cheek and jaw attachments.
    for (let i = 0; i < 4; i++) radii = radii.map((_, k) => fillOpening(radii, k));
    if (j === 0 || j === intervals) radii = radii.map(value => Math.max(0.0012, value * 0.18));
    rows.push([y, cx, cz, ...radii]);
  }
  const cuts = rows.map(row => [...row]);
  for (let pass = 0; pass < 7; pass++) {
    const source = rows.map(row => [...row]);
    for (let j = 1; j < rows.length - 1; j++) {
      const previous = source[j - 1], row = source[j], next = source[j + 1];
      const face = 1 - ramp(0.030, 0.065, row[0]);
      for (let i = 3; i < row.length; i++) {
        const a = row[3 + (i + 32) % 36], b = row[3 + (i + 34) % 36];
        const vertical = (previous[i] + next[i]) * 0.5;
        const average = vertical * 0.58 + (a + b) * 0.21;
        const smoothed = Math.max(cuts[j][i] - 0.00178, mix(row[i], average, 0.48));
        const crown = Math.max(row[i], vertical - 0.0008);
        rows[j][i] = mix(pass < 2 ? crown : row[i], smoothed, face);
      }
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
  const marks = Object.entries(landmarks).map(([name, value]) => `  ${name}: ${JSON.stringify(value)},`).join('\n');
  await writeFile(new URL('../docs/characters/' + hero + '-face-shell.js', import.meta.url),
    '// Generated by tools/build-face-shells.mjs in units of 1/100000 standing height.\n' +
    'export const skullLandmarks = {\n' + marks + '\n};\n\n' +
    'const deltas = [\n' + data + '\n];\n\n' +
    `export const faceShell = [deltas[0]];
for (const row of deltas.slice(1)) {
  let radiusDelta = 0;
  const previous = faceShell.at(-1);
  faceShell.push(row.map((value, column) => {
    if (column < 3) return previous[column] + value;
    radiusDelta += value;
    return previous[column] + radiusDelta;
  }));
}
`);
}
