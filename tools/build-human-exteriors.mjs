// Sample the shipped, neutral, per-joint anatomy at offline loft stations.
// Only the derived skin envelope is written. Source bytes and placements are
// read through the same decoder and rigid hierarchy the browser uses.
import { createHash } from 'node:crypto';
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
const { romaSoftTissue } = await import('../docs/characters/roma-soft-tissue.js');
const { femaleSilhouette } = await import('../docs/characters/roma-silhouette-reference.js');

const savedFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  options?.signal?.throwIfAborted();
  if (String(input).startsWith('file:')) return new Response(await readFile(new URL(input)));
  return savedFetch(input, options);
};

const columns = 24;
const directions = Array.from({ length: columns }, (_, i) => [
  Math.sin(i * 2 * Math.PI / columns), Math.cos(i * 2 * Math.PI / columns),
]);
const { min, max, cos, PI } = Math;
const points = new Vector3();

function donorSpan(y) {
  const upper = femaleSilhouette.findIndex((p) => p[0] >= y);
  if (upper < 0) return femaleSilhouette.at(-1).slice(1);
  if (upper === 0) return femaleSilhouette[0].slice(1);
  const a = femaleSilhouette[upper - 1], b = femaleSilhouette[upper];
  const t = (y - a[0]) / (b[0] - a[0]);
  return [1, 2].map((i) => a[i] + t * (b[i] - a[i]));
}

async function checkSilhouette(filename) {
  const raw = await readFile(filename);
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== 'b7dc8b3e5bae070f22f2619b10194b012a6f3cf930836d251828d5893e69594c') {
    throw Error('Expected HuBMAP skin-female v1.5 GLB');
  }
  const { Box3 } = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  let mesh;
  gltf.scene.traverse((o) => { if (o.isMesh) mesh = o; });
  const box = new Box3().setFromObject(mesh), height = box.max.y - box.min.y;
  const center = (box.min.x + box.max.x) / 2, vertices = mesh.geometry.attributes.position;
  for (const [y, width, depth] of femaleSilhouette) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      const { x, y: v, z } = points.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld);
      if (Math.abs((v - box.min.y) / height - y) > 0.006 || Math.abs(x - center) > height * 0.106) continue;
      minX = min(minX, x); maxX = max(maxX, x);
      minZ = min(minZ, z); maxZ = max(maxZ, z);
    }
    if (Math.abs((maxX - minX) / height - width) > 0.00051 ||
        Math.abs((maxZ - minZ) / height - depth) > 0.00051) {
      throw Error('Unexpected HuBMAP torso span near normalized height ' + y);
    }
  }
}

function gatherParts(rig, parts, stations) {
  const result = Object.fromEntries(Object.entries(stations).map(([key, rows]) => [key,
    rows.map((point, index) => ({
      point, profile: Array(columns).fill(-Infinity),
      width: 0.72 * max(point.y - (rows[index - 1]?.y ?? point.y), (rows[index + 1]?.y ?? point.y) - point.y),
    })),
  ]));
  const { joints } = rig.anatomy;
  const sideTorso = (p) => Math.abs(p.x - joints.chest.x) < (p.y < joints.chest.y ? 0.091 : 0.080);
  function add(region, point) {
    const rows = result[region];
    if (!rows) return;
    for (const row of rows) {
      if (Math.abs(row.point.y - point.y) > row.width) continue;
      const x = point.x - row.point.x, z = point.z - row.point.z;
      for (let i = 0; i < columns; i++) {
        const [dx, dz] = directions[i], v = dx * x + dz * z;
        if (v > row.profile[i]) row.profile[i] = v;
      }
    }
  }
  for (const part of parts) {
    const p = part.mesh.geometry.attributes.position;
    const side = part.joint?.at(-1), name = part.scanNode ?? part.muscleNode ?? '';
    const sheet = /pectoralis|latissimus|subscapularis|supraspinatus|infraspinatus|teres_|trapezius/i.test(name);
    const upperLeg = /gluteus|obturator|tensor_fasciae|psoas|iliacus/i.test(name);
    const region = Object.keys(exteriorRegions).find((r) => exteriorRegions[r].includes(part.joint));
    for (let i = 0; i < p.count; i++) {
      points.fromBufferAttribute(p, i).applyMatrix4(part.sourceMatrix ?? part.mesh.matrixWorld);
      if (sheet && region?.startsWith('arm') && sideTorso(points)) add('torso', points);
      else if (upperLeg && points.y >= joints.hips.y - 0.045) add('torso', points);
      else add(region, points);
      // The last skin section meets the authored hand, using the donor wrist
      // breadth. Far fingers and tendons continue in their own joint frame.
      if (part.joint?.startsWith('hand')) add('arm' + side, points);
      if (part.joint?.startsWith('foot')) add('leg' + side, points);
      if (part.joint === 'head' && points.y < joints.head.y - 0.017 && !/^SKULL_/.test(name)) add('torso', points);
    }
  }
  if (rig.name === 'roma')
    for (const { key, vertices } of romaSoftTissue(rig))
      for (let row = 0; row <= 24; row++) for (let col = 0; col < 48; col++) {
        const p = vertices(PI * row / 24, 2 * PI * col / 48, points);
        if (key.startsWith('thigh')) add('leg' + key.at(-1), p);
        if (p.y >= joints.hips.y - 0.05) add('torso', p);
      }
  return result;
}

function skinRadius(rig, region, rows, j, i) {
  const row = rows[j];
  const [x, z] = directions[i];
  let minimum = 0.012;
  if (region === 'torso') {
    const progress = j / (rows.length - 1);
    minimum = progress > 0.74 ? 0.020 : progress < 0.15 ? 0.042 : 0.049;
    // The outer soft-tissue volumes use individual pads. These bounds allow
    // their front and rear relief to stay inside the separate smooth shell.
    if (rig.name === 'roma') {
      const front = max(0, z);
      const back = max(0, -z);
      const hip = Math.exp(-(((row.point.y - rig.anatomy.joints.hips.y - 0.005) / 0.09) ** 2));
      const bust = Math.exp(-(((row.point.y - rig.anatomy.joints.chest.y - 0.077) / 0.057) ** 2));
      minimum = max(minimum, hip * (0.099 * Math.abs(x) + 0.072 * back),
        bust * (0.072 * Math.abs(x) + 0.082 * front));
      const hips = rig.anatomy.joints.hips.y;
      if (row.point.y >= hips + 0.025 && row.point.y <= 0.841) {
        const [width, depth] = donorSpan(0.53 + (row.point.y - hips - 0.025) * 0.94);
        // Reduce the donor's adipose bulk at the abdomen for the active
        // character. The exact bone/muscle envelope still sets the floor.
        const waist = Math.exp(-(((row.point.y - hips - 0.122) / 0.046) ** 2));
        minimum = max(minimum, Math.hypot(x * width * (0.43 - 0.052 * waist),
          z * depth * (0.45 - 0.067 * waist)));
      }
    }
  } else if (region.startsWith('leg')) minimum = 0.016;
  const waist = rig.name === 'roma' && region === 'torso'
    ? Math.exp(-(((row.point.y - rig.anatomy.joints.hips.y - 0.111) / 0.039) ** 2)) : 0;
  let offset = region === 'torso' ? 0.0075 - 0.0045 * waist : region.startsWith('foot') ? 0.004 : 0.0050;
  if (rig.name === 'sippy' && region === 'torso') {
    const midsection = Math.exp(-(((row.point.y - rig.anatomy.joints.chest.y + 0.023) / 0.125) ** 2));
    offset -= 0.0043 * midsection;
  }
  if (rig.name === 'sippy' && region.startsWith('arm')) {
    const shoulder = rig.anatomy.joints['upperArm' + region.at(-1)].y;
    offset -= 0.0020 * Math.exp(-(((row.point.y - shoulder) / 0.067) ** 2));
  }
  const exact = row.profile[i];
  const previous = rows[max(0, j - 1)].profile[i];
  const next = rows[min(rows.length - 1, j + 1)].profile[i];
  // A smoothed support polygon with a guaranteed outward margin. Neighbouring
  // samples carry narrow ridges through the station interval without spikes.
  const current = max(exact, minimum);
  const lifted = max(minimum, current * 0.60 + 0.20 * (max(minimum, previous) + max(minimum, next)));
  return max(current, lifted) + offset;
}

function rebuild(rig, raw) {
  const profile = {};
  for (const [region, rows] of Object.entries(raw)) {
    profile[region] = rows.map((r, j) => {
      const support = directions.map((_, i) => skinRadius(rig, region, rows, j, i));
      const radius = directions.map((_, i) => {
        let length = Infinity;
        for (let k = 0; k < columns; k++) {
          const projected = cos((k - i) * 2 * PI / columns);
          if (projected > .00001) length = min(length, support[k] / projected);
        }
        return length * 1.015;
      });
      return [r.point.y, r.point.x, r.point.z, ...radius].map((v) => Math.round(v * 10000));
    });
  }
  return profile;
}

const selected = process.argv[2];
if (process.env.HUBMAP_FEMALE_SKIN) await checkSilhouette(process.env.HUBMAP_FEMALE_SKIN);
for (const name of selected ? [selected] : ['sippy', 'roma']) {
  const rig = createActor(name, 1);
  const stations = exteriorStationLines(rig);
  const parts = [];
  for (const tier of ['high', 'mobile']) {
    const place = await prepareSourceAnatomy(name, tier, undefined, { repairs: false });
    place(rig, parts);
  }
  if (!parts.length) throw Error('No anatomy to sample for ' + name);
  const profile = rebuild(rig, gatherParts(rig, parts, stations));
  const source = '// Generated by tools/build-human-exteriors.mjs. Distances are in 1/10000 of standing height.\n'
    + 'export const ' + name + 'Exterior = {\n'
    + Object.entries(profile).map(([key, rows]) => '  ' + key + ': [\n'
      + rows.map((r) => '    ' + JSON.stringify(r) + ',\n').join('') + '  ],\n').join('')
    + '};\n';
  await writeFile(new URL('../docs/characters/' + name + '-exterior-data.js', import.meta.url), source);
  console.log(name + ' includes ' + parts.length + ' source surfaces, ' + Object.values(profile).flat().length + ' stations');
}
