// Audit the neutral offline fit before packaging, including tissue after skin-envelope fitting.
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
const { buildDiagramModel } = await import('../docs/characters/diagram-fit-model.js');
const { loadMuscleAtlas, loadCharacterMuscles } = await import('../docs/characters/diagram-scan-source.js');
const mapping = JSON.parse(
  await readFile(
    new URL('../docs/characters/review/scan-skeleton/female-muscle-mapping.json', import.meta.url),
  ),
);
const inch = 0.0254;
const selected = { supraspinatus: 'SCAPULA', gluteus_medius: 'HIP', adductor_magnus: 'FEMUR' };
// Independent donor manifest from the supplied BP3D element and Z-Anatomy file lists.
// Preserve the 76 previously approved female donors when a lower-limb label overlaps.
const bp3dPairs = {
  deltoid_acromial_part: 1467,
  deltoid_clavicular_part: 1468,
  deltoid_spinal_part: 1513,
  pectoralis_major_clavicular_part: 1447,
  pectoralis_major_sternocostal_part: 1464,
  pectoralis_major_abdominal_part: 1446,
  trapezius_descending_part: 1521,
  trapezius_transverse_part: 1554,
  trapezius_ascending_part: 1520,
  biceps_brachii_long_head: 1478,
  biceps_brachii_short_head: 1512,
  rectus_femoris: 1433,
  vastus_lateralis: 1442,
  vastus_medialis: 1443,
  vastus_intermedius: 1441,
  gastrocnemius_medial_head: 1397,
  gastrocnemius_lateral_head: 1394,
};
const surfaceDonors = new Map();
for (const side of ['left', 'right']) {
  for (const [group, fj] of Object.entries(bp3dPairs))
    surfaceDonors.set(side + '_' + group, 'FJ' + fj + (side === 'left' ? 'M' : '') + '.obj');
  for (const group of ['Latissimus_dorsi', 'Rectus_abdominis'])
    surfaceDonors.set(side + '_' + group.toLowerCase(), group + '_muscle_' + side[0] + '.obj');
}
// Gross cortical targets only; the fitter independently chooses the precise triangle.
function expectedBones(group) {
  if (/deltoid/.test(group)) return [/clavicular/.test(group) ? 'CLAVICLE' : 'SCAPULA', 'HUMERUS'];
  if (/pectoralis/.test(group))
    return [/clavicular/.test(group) ? 'CLAVICLE' : /abdominal/.test(group) ? 'RIB' : 'STERNUM', 'HUMERUS'];
  if (/trapezius/.test(group)) return ['VERTEBRA', /descending/.test(group) ? 'CLAVICLE' : 'SCAPULA'];
  if (/biceps_brachii/.test(group)) return ['SCAPULA', 'RADIUS'];
  if (/gastrocnemius/.test(group)) return ['FEMUR', 'CALCANEUS'];
  if (/latissimus/.test(group)) return ['VERTEBRA', 'HIP', 'HUMERUS'];
  if (/abdominis/.test(group)) return ['HIP', 'RIB', 'STERNUM'];
  return [/rectus_femoris/.test(group) ? 'HIP' : 'FEMUR', 'PATELLA'];
}
function verifySurface(p, donor, problems, sheetTints) {
  const side = p.muscleNode.split('_')[0];
  const anchors = p.attachments || [];
  for (const target of expectedBones(p.muscleNode)) {
    if (!anchors.some((a) => a.bone.split('_')[0] === target))
      problems.push('Missing ' + target + ' cortex on ' + p.muscleNode);
  }
  if (anchors.some((a) => a.bone.endsWith(side === 'left' ? '_RIGHT' : '_LEFT')))
    problems.push('Contralateral anchor on ' + p.muscleNode);
  if (Math.sign(centre(p.mesh.geometry).x) !== (side === 'left' ? 1 : -1))
    problems.push('Contralateral belly on ' + p.muscleNode);
  const { uv, color } = p.mesh.geometry.attributes;
  if (!p.mesh.material.vertexColors || Math.abs(p.mesh.material.roughness - 0.3) > 0.001 || !uv || !color) {
    problems.push('Missing tissue material or fibre attributes on ' + p.muscleNode);
    return;
  }
  let min = Infinity,
    max = -Infinity,
    uMin = Infinity,
    uMax = -Infinity,
    vMin = Infinity,
    vMax = -Infinity;
  for (let i = 0; i < color.count; i++) {
    min = Math.min(min, color.getY(i));
    max = Math.max(max, color.getY(i));
    uMin = Math.min(uMin, uv.getX(i));
    uMax = Math.max(uMax, uv.getX(i));
    vMin = Math.min(vMin, uv.getY(i));
    vMax = Math.max(vMax, uv.getY(i));
  }
  if (!(max - min > 0.25 && uMax - uMin > 0.1 && vMax - vMin > 0.5))
    problems.push('Lost tendon/belly or fibre variation on ' + p.muscleNode);
  if (!/pectoralis_major|latissimus_dorsi|rectus_abdominis|trapezius/.test(p.muscleNode)) return;

  // Sample the unchanged donor vertices so pose-dependent crease refinement
  // cannot overweight the colour audit. Bin the paired rectus inscriptions
  // through the middle of each belly, away from pubic and costal tendons.
  let pale = 0,
    dark = 0;
  const bands = Array(56).fill(0);
  for (let i = 0; i < donor.count; i++) {
    const g = color.getY(i);
    if (g < 0.12) dark++;
    if (g < 0.22) continue;
    pale++;
    const x = Math.abs(donor.getX(i)),
      y = donor.getY(i);
    if (x >= 0.015 && x <= 0.042 && y >= 0.98 && y < 1.185) bands[Math.floor((y - 0.98) / 0.004)]++;
  }
  if (!pale || dark < donor.count * 0.45) problems.push('Lost red belly or pale band on ' + p.muscleNode);
  const result = {
    darkBellyFraction: +(dark / donor.count).toFixed(4),
    paleBandFraction: +(pale / donor.count).toFixed(4),
  };
  if (p.muscleNode.endsWith('rectus_abdominis')) {
    const peaks = [],
      pitchIn = 0.004 / inch;
    for (let i = 0; i < bands.length; i++) {
      if (!bands[i]) continue;
      const start = i;
      while (i + 1 < bands.length && bands[i + 1]) i++;
      peaks.push(+((i - start + 1) * pitchIn).toFixed(2));
    }
    result.centralInscriptionWidthsIn = peaks;
    if (peaks.length !== 3 || peaks.some((width) => width > 0.65))
      problems.push('Expected three narrow inscriptions on ' + p.muscleNode);
  }
  sheetTints[p.muscleNode] = result;
}
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
    const bones = new Map(model.parts.filter((p) => p.scanNode).map((p) => [p.scanNode, p.mesh.geometry]));
    const ids = new Set(),
      normalZeroParts = [],
      wrongSide = [];
    let vertices = 0,
      normalZeros = 0,
      muscleFaceZeroNormals = 0,
      femurFaceZeroNormals = 0,
      femurVertices = 0,
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
      const femur = p.scanNode === 'FEMUR_LEFT' || p.scanNode === 'FEMUR_RIGHT';
      if (femur) femurVertices += pos.count;
      if (zeroNormals.size && (p.muscleNode || femur)) {
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
        if (femur) femurFaceZeroNormals += bad.size;
        else muscleFaceZeroNormals += bad.size;
        if (bad.size) problems.push('Zero shading normals on rendered faces of ' + p.name);
      }
      vertices += pos.count;
    }
    if (tier === 'mobile') mobilePickers.set(name, new Map(muscles.map((p) => [p.muscleNode, p.id])));
    else
      for (const p of muscles)
        if (mobilePickers.get(name).get(p.muscleNode) !== p.id)
          problems.push('Picker changed across tiers ' + p.id);
    const registered = await loadCharacterMuscles(name, tier);
    const spatialRetention = [],
      sheetTints = {};
    const expected = new Map([...base].map(([k, g]) => [k, g.userData.sourcePart]));
    for (const [node, donor] of surfaceDonors) expected.set(node, donor);
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
      if (surfaceDonors.has(id)) verifySurface(p, input, problems, sheetTints);
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
      femurFaceZeroNormals,
      femurVertices,
      fewestDistinctProportion: spatialRetention.sort((a, b) => a.ratio - b.ratio)[0],
      belowHalfDistinct: spatialRetention.filter((p) => p.ratio < 0.5),
      uniquePickerIds: ids.size,
      uniqueAtlasNodes: atlas.size,
      sheetTints,
      verifiedSuperficialNodes: [...surfaceDonors.keys()].filter((id) => atlas.has(id)).length,
      observedBySource: Object.fromEntries(
        [...new Set(muscles.map((p) => p.source))].map((source) => [
          source,
          muscles.filter((p) => p.source === source).length,
        ]),
      ),
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
