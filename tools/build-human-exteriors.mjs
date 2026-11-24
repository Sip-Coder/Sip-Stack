// Cut the shipped bone, muscle and fat triangles in the common bind pose.
// Write only the offset skin sections. Source geometry and poses are read-only.
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({ resolve(specifier, context, next) {
    const file = specifier === 'three' ? 'build/three.module.js'
      : specifier.startsWith('three/addons/') ? 'examples/jsm/' + specifier.slice(13) : null;
    return file ? { url: pathToFileURL(resolve(root, file)).href, shortCircuit: true } : next(specifier, context);
  } });
}
const { Vector3 } = await import('three');
const { createActor } = await import('../docs/characters/rig.js');
const { prepareSourceAnatomy } = await import('../docs/characters/diagram-source-anatomy.js');
const { exteriorStationLines, exteriorRegions } = await import('../docs/characters/human-exterior.js');
const { addRomaFat } = await import('../docs/characters/roma-soft-tissue.js');
const { heights, names } = await import('../docs/characters/ui.js');

const savedFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  options?.signal?.throwIfAborted();
  if (String(input).startsWith('file:')) return new Response(await readFile(new URL(input)));
  return savedFetch(input, options);
};

const columns = 28;
const directions = Array.from({ length: columns }, (_, i) => {
  const angle = i * 2 * Math.PI / columns;
  return [Math.sin(angle), Math.cos(angle)];
});
const inch = 0.0254;
const { exp, abs, min, max } = Math;
const clamp = (v, lo, hi) => max(lo, min(hi, v));
const near = (y, joint, width) => exp(-(((y - joint.y) / width) ** 2));
const wrap = i => (i + columns) % columns;
const regionFor = new Map(Object.entries(exteriorRegions).flatMap(([region, names]) => names.map(name => [name, region])));
const chestSheet = /pectoralis|latissimus|subscapularis|supraspinatus|infraspinatus|teres_|trapezius/i;
const pelvicVolume = /gluteus|obturator|tensor_fasciae|psoas|iliacus|semitendinosus|semimembranosus|biceps_femoris|adductor_magnus/i;

function regionsFor(rig, part) {
  const { joints } = rig.anatomy;
  const joint = part.joint ?? (part.name.includes('costal cartilage') ? 'chest' :
    'forearm' + (part.name.startsWith('Left ') ? 'L' : 'R'));
  const region = regionFor.get(joint);
  const side = joint.at(-1);
  const label = part.scanNode ?? part.muscleNode ?? part.mesh.name;
  const routes = new Map();
  if (region) routes.set(region, () => true);
  if (joint.startsWith('hand')) routes.set('arm' + side, () => true);
  if (joint.startsWith('foot')) routes.set('leg' + side, () => true);
  if (joint.startsWith('shin')) {
    routes.set('foot' + side, (x, y) => y <= joints['foot' + side].y + 0.008);
  }
  if (region?.startsWith('arm')) {
    const shoulder = joints['upperArm' + side];
    const medial = (x, y) => y >= shoulder.y - 0.072 &&
      (x - joints.chest.x) * (side === 'L' ? 1 : -1) < abs(shoulder.x - joints.chest.x) * 0.82;
    // Thorax sheets cross the armpit and attach to the arm on both rigs.
    // Wrap them with the torso over the attachment, avoiding a duplicate
    // medial arm envelope where it would sweep across the anterior chest.
    if (chestSheet.test(label)) routes.set('torso', () => true);
    else routes.set('torso', medial);
    routes.set(region, (x, y, z) => !medial(x, y) && (!chestSheet.test(label) ||
      (y >= shoulder.y - 0.055 && abs(z - shoulder.z) < 0.036)));
  }
  if (pelvicVolume.test(label) || /fat/.test(part.layer) && region?.startsWith('leg')) {
    routes.set('torso', (x, y) => y >= joints.hips.y - 0.05);
  }
  if (joint === 'head' && !/^SKULL_/.test(label)) {
    routes.set('torso', (x, y) => y < joints.head.y - 0.017);
  }
  return [...routes];
}

function collectSections(rig, parts) {
  const sections = Object.fromEntries(Object.entries(exteriorStationLines(rig)).map(([key, rows]) => [
    key, rows.map(center => ({ center, cuts: [] })),
  ]));
  const vertex = new Vector3();
  const surfaces = [];
  for (const part of parts) {
    const routes = regionsFor(rig, part);
    if (!routes.length) continue;
    const g = part.mesh.geometry, input = g.attributes.position, index = g.index.array;
    const xyz = new Float32Array(input.count * 3);
    for (let i = 0; i < input.count; i++) {
      vertex.fromBufferAttribute(input, i).applyMatrix4(part.sourceMatrix ?? part.mesh.matrixWorld).toArray(xyz, i * 3);
    }
    const bone = part.layer === 'skeleton';
    surfaces.push({ xyz, routes, bone });
    const stations = routes.flatMap(([key, within]) => sections[key].map(row => ({ row, within })));
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
      const low = min(xyz[a + 1], xyz[b + 1], xyz[c + 1]);
      const high = max(xyz[a + 1], xyz[b + 1], xyz[c + 1]);
      for (const { row, within } of stations) {
        const y = row.center.y;
        if (y < low || y >= high) continue;
        const points = [];
        function cross(u, v) {
          const p = xyz[u + 1], q = xyz[v + 1];
          if ((p <= y) === (q <= y)) return;
          const f = (y - p) / (q - p);
          points.push(xyz[u] + f * (xyz[v] - xyz[u]), xyz[u + 2] + f * (xyz[v + 2] - xyz[u + 2]));
        }
        cross(a, b);
        cross(b, c);
        cross(c, a);
        if (within((points[0] + points[2]) / 2, y, (points[1] + points[3]) / 2)) row.cuts.push([...points, bone]);
      }
    }
  }
  return { sections, surfaces };
}

function thicknessIn(rig, region, y, angle, bone) {
  const { joints } = rig.anatomy;
  const [x, z] = directions[angle];
  if (region === 'torso') {
    const abdomen = near(y, { y: joints.hips.y + 0.068 }, 0.074) * (0.43 + 0.57 * max(0, z));
    const glute = near(y, joints.hips, 0.047) * max(0, -z);
    const shoulder = max(near(y, joints.upperArmL, 0.033), near(y, joints.upperArmR, 0.033));
    const neck = near(y, joints.head, 0.044);
    return clamp(0.132 + 0.15 * abdomen + 0.19 * glute - 0.047 * shoulder - 0.039 * neck - (bone ? 0.061 : 0),
      0.0625, 0.375);
  }
  const side = region.at(-1);
  if (region.startsWith('arm')) {
    const hinge = max(near(y, joints['forearm' + side], 0.022), near(y, joints['hand' + side], 0.034));
    return max(0.0625, 0.127 - 0.052 * hinge - (bone ? 0.026 : 0));
  }
  if (region.startsWith('leg')) {
    const knee = near(y, joints['shin' + side], 0.032);
    const ankle = near(y, joints['foot' + side], 0.032);
    const hip = near(y, joints['thigh' + side], 0.074);
    return clamp(0.166 + 0.095 * hip - 0.081 * max(knee, ankle) - (bone ? 0.048 + 0.022 * abs(x) : 0),
      0.0625, 0.375);
  }
  return bone ? 0.073 : 0.107;
}

function sectionCenter(center, cuts) {
  if (!cuts.length) return center;
  let left = Infinity, rear = Infinity, right = -Infinity, front = -Infinity;
  for (const [ax, az, bx, bz] of cuts) {
    left = min(left, ax, bx); right = max(right, ax, bx);
    rear = min(rear, az, bz); front = max(front, az, bz);
  }
  return new Vector3((left + right) * 0.5, center.y, (rear + front) * 0.5);
}

function contacts(rig, region, { center, cuts }, scale) {
  return directions.map(([dx, dz], i) => {
    let far = -Infinity, offset = 0;
    for (const [ax, az, bx, bz, bone] of cuts) {
      const x = ax - center.x, z = az - center.z;
      const ex = bx - ax, ez = bz - az;
      const denom = dx * ez - dz * ex;
      if (abs(denom) < 1e-12) continue;
      const u = (x * dz - z * dx) / denom;
      if (u < 0 || u > 1) continue;
      const r = (x * ez - z * ex) / denom;
      if (r <= far || r <= 0) continue;
      far = r;
      offset = thicknessIn(rig, region, center.y, i, bone);
    }
    return { radius: Number.isFinite(far) ? far + offset * scale : NaN, offset };
  });
}

function circularBridge(radius, i) {
  const left = radius.findIndex((_, o) => o && Number.isFinite(radius[wrap(i - o)]));
  const right = radius.findIndex((_, o) => o && Number.isFinite(radius[wrap(i + o)]));
  return left === -1 ? NaN : (radius[wrap(i - left)] * right + radius[wrap(i + right)] * left) / (left + right);
}

function sealSections(rows) {
  const measured = rows.map(row => row.map(({ radius }) => radius));
  const filled = measured.map(row => row.map((r, i) => Number.isFinite(r) ? r : circularBridge(row, i)));
  const bridged = filled.map((row, j) => row.map((r, i) => {
    if (Number.isFinite(r)) return r;
    let below = j - 1, above = j + 1;
    while (below >= 0 && !Number.isFinite(filled[below][i])) below--;
    while (above < rows.length && !Number.isFinite(filled[above][i])) above++;
    if (below < 0 && above >= rows.length) throw new Error('No anatomical surface in this region');
    if (above >= rows.length) return filled[below][i];
    if (below < 0) return filled[above][i];
    return (filled[below][i] * (above - j) + filled[above][i] * (j - below)) / (above - below);
  }));
  const closed = bridged.map((row, j) => row.map((r, i) => {
    // Locally close narrow clefts between atlas parts. The measured outer
    // contacts remain intact, so this leaves muscle bellies and bony ridges.
    const left = row[wrap(i - 1)], right = row[wrap(i + 1)];
    const below = bridged[max(0, j - 1)][i], above = bridged[min(rows.length - 1, j + 1)][i];
    return max(r, min(left, right), min(below, above));
  }));
  return closed.map((row, j) => row.map((r, i) =>
    0.60 * r + 0.10 * (row[wrap(i - 1)] + row[wrap(i + 1)] + closed[max(0, j - 1)][i] + closed[min(rows.length - 1, j + 1)][i])));
}

function containSamples(rig, geometry, surfaces, scale) {
  for (const { xyz, routes, bone } of surfaces) {
    for (const [region, within] of routes) {
      const { rows, radii } = geometry[region];
      const lo = rows[0].center.y, hi = rows.at(-1).center.y;
      for (let k = 0; k < xyz.length; k += 3) {
        const x = xyz[k], y = xyz[k + 1], z = xyz[k + 2];
        if (y < lo || y > hi || !within(x, y, z)) continue;
        let j = 1;
        while (y > rows[j].center.y) j++;
        const a = rows[j - 1].center, b = rows[j].center;
        const along = (y - a.y) / (b.y - a.y);
        const dx = x - a.x - (b.x - a.x) * along;
        const dz = z - a.z - (b.z - a.z) * along;
        const turn = (Math.atan2(dx, dz) / (2 * Math.PI) * columns + columns) % columns;
        const i = Math.floor(turn), next = wrap(i + 1), across = turn - i;
        const weights = [(1 - along) * (1 - across), (1 - along) * across, along * (1 - across), along * across];
        const lower = radii[j - 1], upper = radii[j];
        const radius = lower[i] * weights[0] + lower[next] * weights[1] + upper[i] * weights[2] + upper[next] * weights[3];
        const r = Math.hypot(dx, dz);
        // Include the thin face clearance and the chord lost between two
        // polar samples. Lift only the four nearby controls when needed.
        const required = r + thicknessIn(rig, region, y, i, bone) * scale + r * 0.005 + 0.0001;
        if (required <= radius) continue;
        const lift = (required - radius) / weights.reduce((sum, w) => sum + w * w, 0);
        lower[i] += lift * weights[0];
        lower[next] += lift * weights[1];
        upper[i] += lift * weights[2];
        upper[next] += lift * weights[3];
      }
    }
  }
}

function smoothClearance(geometry) {
  for (const part of Object.values(geometry)) {
    const { radii } = part;
    part.radii = radii.map((row, j) => row.map((r, i) => {
      const across = (row[wrap(i - 1)] + row[wrap(i + 1)]) * 0.5;
      const along = (radii[max(0, j - 1)][i] + radii[min(radii.length - 1, j + 1)][i]) * 0.5;
      return 0.45 * r + 0.35 * across + 0.20 * along;
    }));
  }
}

function buildProfiles(rig, shapes, height) {
  const { sections, surfaces } = collectSections(rig, shapes);
  const geometry = Object.fromEntries(Object.entries(sections).map(([region, rows]) => {
    for (const row of rows) row.center = sectionCenter(row.center, row.cuts);
    // A stable axis avoids repeated centering across disconnected sections,
    // particularly the thin ends of a wrist or heel polygon.
    const centers = rows.map(({ center }) => center);
    for (const [j, row] of rows.entries()) {
      row.center = centers[j].clone().multiplyScalar(0.375)
        .addScaledVector(centers[max(0, j - 1)], 0.25).addScaledVector(centers[min(rows.length - 1, j + 1)], 0.25)
        .addScaledVector(centers[max(0, j - 2)], 0.0625).addScaledVector(centers[min(rows.length - 1, j + 2)], 0.0625);
      row.center.y = centers[j].y;
    }
    const measured = rows.map(row => contacts(rig, region, row, inch / height));
    const radii = sealSections(measured);
    const count = measured.flat().filter(({ offset }) => offset > 0).length;
    console.log(rig.name, region, count + '/' + rows.length * columns, 'direct source contacts');
    return [region, { rows, radii }];
  }));
  for (let pass = 0; pass < 4; pass++) {
    containSamples(rig, geometry, surfaces, inch / height);
    if (pass < 3) smoothClearance(geometry);
  }
  return Object.fromEntries(Object.entries(geometry).map(([region, { rows, radii }]) =>
    [region, rows.map(({ center }, j) => [center.y, center.x, center.z, ...radii[j]].map(v => Math.round(v * 10000)))]));
}

const selected = process.argv[2];
for (const name of selected ? [selected] : ['sippy', 'roma']) {
  if (!['sippy', 'roma'].includes(name)) throw new Error('Expected sippy or roma');
  const rig = createActor(name, 1);
  const parts = [];
  for (const tier of ['high', 'mobile']) {
    const place = await prepareSourceAnatomy(name, tier);
    place(rig, parts);
  }
  if (name === 'roma') {
    addRomaFat(rig);
    rig.root.updateMatrixWorld(true);
    rig.root.traverse(mesh => {
      if (!mesh.userData.anatomicalFat) return;
      parts.push({ mesh, sourceMatrix: mesh.matrixWorld, joint: mesh.parent.name, layer: 'fat' });
    });
  }
  const profile = buildProfiles(rig, parts, heights[names.indexOf(name)]);
  const source = '// Generated by tools/build-human-exteriors.mjs. Distances are in 1/10000 of standing height.\n'
    + "import { decodeExteriorStations } from './human-exterior.js';\n\n"
    + 'export const ' + name + 'Exterior = {\n'
    + Object.entries(profile).map(([key, rows]) => {
      const deltas = rows.map((row, station) => {
        if (!station) return row;
        const before = rows[station - 1];
        // Encode station-to-station changes, then adjacent changes across each ring.
        const delta = row.map((value, column) => value - before[column]);
        return delta.map((value, column) => column < 4 ? value : value - delta[column - 1]);
      });
      return '  ' + key + ': decodeExteriorStations([\n'
        + deltas.map(row => '    ' + JSON.stringify(row) + ',\n').join('') + '  ]),\n';
    }).join('')
    + '};\n';
  await writeFile(new URL('../docs/characters/' + name + '-exterior-data.js', import.meta.url), source);
}
