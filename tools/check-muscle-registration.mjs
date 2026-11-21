// Audit the neutral production Axon snapshot, including tissue after envelope fitting.
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

if (process.env.THREE_ROOT) {
  const directory = resolve(process.env.THREE_ROOT);
  registerHooks({
    resolve(specifier, context, next) {
      const target =
        specifier === 'three'
          ? 'build/three.module.js'
          : specifier.startsWith('three/addons/')
            ? 'examples/jsm/' + specifier.slice(13)
            : null;
      return target
        ? { url: pathToFileURL(resolve(directory, target)).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const { REVISION, Vector3, Triangle } = await import('three');
if (REVISION !== '170') throw Error('Expected three@0.170.0');
const { buildDiagramModel } = await import('../docs/characters/diagram-parts.js');
const { loadMuscleAtlas, loadCharacterMuscles } = await import(
  '../docs/characters/diagram-scan-source.js'
);
const mapping = JSON.parse(
  await readFile(
    new URL('../docs/characters/review/scan-skeleton/female-muscle-mapping.json', import.meta.url),
  ),
);
const inch = 0.0254;
const selected = { supraspinatus: 'SCAPULA', gluteus_medius: 'HIP', adductor_magnus: 'FEMUR' };
const point = new Vector3(),
  nearest = new Vector3(),
  tri = new Triangle();
function eachTriangle(g, visit) {
  const vertices = g.attributes.position;
  for (let i = 0; i < g.index.count; i += 3) {
    tri.a.fromBufferAttribute(vertices, g.index.getX(i));
    tri.b.fromBufferAttribute(vertices, g.index.getX(i + 1));
    tri.c.fromBufferAttribute(vertices, g.index.getX(i + 2));
    visit(tri);
  }
}
function surfaceDistance(g, p) {
  let d = Infinity;
  eachTriangle(g, (t) => {
    t.closestPointToPoint(p, nearest);
    d = Math.min(d, nearest.distanceToSquared(p));
  });
  return Math.sqrt(d);
}
function centre(g) {
  const weighted = new Vector3(),
    mid = new Vector3();
  let weight = 0;
  eachTriangle(g, (t) => {
    const area = t.getArea();
    weighted.addScaledVector(t.getMidpoint(mid), area);
    weight += area;
  });
  if (!(weight > 0)) throw Error('Zero-area surface');
  return weighted.divideScalar(weight);
}
// The fitters retain original vertex indices and may append vertices at folds.
// Compare only corresponding atlas vertices at a very fine spatial tolerance.
function distinctPositions(attribute, count) {
  const keys = new Set();
  for (let i = 0; i < count; i++)
    keys.add(
      [
        Math.round(attribute.getX(i) * 1e6),
        Math.round(attribute.getY(i) * 1e6),
        Math.round(attribute.getZ(i) * 1e6),
      ].join('/'),
    );
  return keys.size;
}

const rows = [];
const mobilePickers = new Map();
for (const name of ['sippy', 'roma'])
  for (const tier of ['mobile', 'high']) {
    const base = await loadMuscleAtlas(tier),
      model = await buildDiagramModel(name, tier),
      problems = [];
    const muscles = model.parts.filter((p) => p.layer === 'muscles'),
      atlas = new Map(muscles.map((p) => [p.muscleNode, p]));
    const bones = new Map(
      model.parts.filter((p) => p.scanNode).map((p) => [p.scanNode, p.mesh.geometry]),
    );
    const ids = new Set(),
      normalZeroParts = [],
      wrongSide = [];
    let vertices = 0,
      normalZeros = 0,
      muscleFaceZeroNormals = 0,
      anchors = 0,
      maxAttach = 0,
      unattached = 0,
      twoOrMore = 0,
      highest = '',
      atlasMismatch = 0;
    for (const p of model.parts) {
      if (ids.has(p.id)) problems.push('Repeated picker id ' + p.id);
      ids.add(p.id);
      const g = p.mesh.geometry,
        pos = g.attributes.position,
        norm = g.attributes.normal;
      if (!pos?.count || !norm || !g.index?.count || pos.count !== norm.count) {
        problems.push('Incomplete geometry ' + p.name);
        continue;
      }
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingSphere) g.computeBoundingSphere();
      const b = g.boundingBox,
        sphere = g.boundingSphere;
      if (
        b.isEmpty() ||
        !Number.isFinite(sphere.radius) ||
        ![...b.min.toArray(), ...b.max.toArray()].every(Number.isFinite)
      )
        problems.push('Invalid bounds ' + p.name);
      for (const x of g.index.array)
        if (!Number.isInteger(x) || x < 0 || x >= pos.count) {
          problems.push('Invalid triangle index ' + p.name);
          break;
        }
      const zeroNormals = new Set();
      for (let i = 0; i < pos.count; i++) {
        point.fromBufferAttribute(pos, i);
        if (!point.toArray().every(Number.isFinite) || !b.containsPoint(point)) {
          problems.push('Invalid vertex/bounds ' + p.name);
          break;
        }
        const n = point.fromBufferAttribute(norm, i).lengthSq();
        if (!Number.isFinite(n)) {
          problems.push('Invalid normal ' + p.name);
          break;
        }
        if (n < 1e-12) zeroNormals.add(i);
      }
      if (zeroNormals.size) normalZeroParts.push(p.name + ' (' + zeroNormals.size + ')');
      normalZeros += zeroNormals.size;
      if (zeroNormals.size && p.muscleNode) {
        const bad = new Set();
        for (let j = 0; j < g.index.count; j += 3) {
          const aa = g.index.getX(j),
            bb = g.index.getX(j + 1),
            cc = g.index.getX(j + 2);
          if (![aa, bb, cc].some((i) => zeroNormals.has(i))) continue;
          tri.a.fromBufferAttribute(pos, aa);
          tri.b.fromBufferAttribute(pos, bb);
          tri.c.fromBufferAttribute(pos, cc);
          if (tri.getArea() < 1e-14) continue;
          for (const idx of [aa, bb, cc]) if (zeroNormals.has(idx)) bad.add(idx);
        }
        muscleFaceZeroNormals += bad.size;
      }
      vertices += pos.count;
    }
    if (tier === 'mobile') mobilePickers.set(name, new Map(muscles.map((p) => [p.muscleNode, p.id])));
    else
      for (const p of muscles)
        if (mobilePickers.get(name).get(p.muscleNode) !== p.id)
          problems.push('Picker changed across tiers ' + p.id);
    const registered = await loadCharacterMuscles(name, tier);
    const spatialRetention = [];
    const expected = new Map([...base].map(([k, g]) => [k, g.userData.sourcePart]));
    if (name === 'roma') for (const donor of mapping.mapping) expected.set(donor.node, donor.atlasId);
    if (atlas.size !== expected.size) problems.push('Wrong atlas size ' + atlas.size);
    for (const [id, expectedSource] of expected) {
      const p = atlas.get(id);
      if (!p || p.sourcePart !== expectedSource) {
        problems.push('Incorrect identity ' + id);
        atlasMismatch++;
        continue;
      }
      const input = registered.get(id).attributes.position;
      const from = distinctPositions(input, input.count);
      const to = distinctPositions(p.mesh.geometry.attributes.position, input.count);
      spatialRetention.push({ node: id, source: from, posed: to, ratio: to / from });
      if (!p.attachments?.length) {
        unattached++;
        continue;
      }
      if (p.attachments.length >= 2) twoOrMore++;
      for (const a of p.attachments) {
        const b = bones.get(a.bone);
        if (!b) {
          problems.push('Missing target ' + a.bone);
          continue;
        }
        point.fromBufferAttribute(p.mesh.geometry.attributes.position, a.index);
        const gap = surfaceDistance(b, point) / inch;
        if (gap > maxAttach) {
          maxAttach = gap;
          highest = id + ' → ' + a.bone;
        }
        if (gap > 0.01) problems.push(id + ' missed ' + a.bone + ' by ' + gap.toFixed(3) + ' in');
        anchors++;
      }
    }
    const regions = [];
    for (const [group, reference] of Object.entries(selected))
      for (const side of ['left', 'right']) {
        const g = atlas.get(side + '_' + group).mesh.geometry,
          c = centre(g),
          sign = side === 'left' ? 1 : -1;
        const same = bones.get(reference + '_' + side.toUpperCase());
        const opposite = bones.get(reference + '_' + (side === 'left' ? 'RIGHT' : 'LEFT'));
        const ipsi = surfaceDistance(same, c) / inch,
          contra = surfaceDistance(opposite, c) / inch;
        if (Math.sign(c.x) !== sign || ipsi >= contra) wrongSide.push(group + '/' + side);
        regions.push({
          group,
          side,
          xIn: +(c.x / inch).toFixed(2),
          ipsilateralIn: +ipsi.toFixed(2),
          contralateralIn: +contra.toFixed(2),
        });
      }
    if (wrongSide.length) problems.push('Wrong-sided regional centers ' + wrongSide.join(', '));
    rows.push({
      name,
      tier,
      parts: model.parts.length,
      vertices,
      normalZeros,
      normalZeroParts,
      muscleFaceZeroNormals,
      fewestDistinctProportion: spatialRetention.sort((a, b) => a.ratio - b.ratio)[0],
      belowHalfDistinct: spatialRetention.filter((p) => p.ratio < 0.5),
      uniquePickerIds: ids.size,
      uniqueAtlasNodes: atlas.size,
      observedVhf: muscles.filter((p) => p.sourcePart.startsWith('VHF:')).length,
      atlasMismatch,
      withTwoOrMore: twoOrMore,
      withoutBoneAnchor: unattached,
      anchors,
      maxAttachIn: maxAttach,
      worstAnchor: highest,
      regions,
      problems,
    });
    model.dispose();
  }
console.log(JSON.stringify(rows, null, 2));
if (rows.some((row) => row.problems.length)) process.exitCode = 1;
