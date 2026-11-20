// Set CHARACTERS_TIER=mobile to check the production lower-resolution patterns.
// THREE_ROOT=/path/to/three node tools/check-characters-garments.mjs [sippy|roma|hummin]
import { runCharacterProbe } from './characters-browser.mjs';

async function measure(onlyHero, { tier }) {
  const { setModelDetail } = await import('/characters/material-detail.js');
  const { createActor } = await import('/characters/rig.js');
  const { createController } = await import('/characters/motion.js');
  const { garmentPoses, poseGarment } = await import('/tools/characters-garment-poses.mjs');
  const { posedSurface, compareSurfaces } = await import('/tools/characters-surfaces.mjs');
  const results = {},
    failures = [];
  for (const [name, height, builder] of [
    ['sippy', 1.78, 'buildSippy'],
    ['roma', 1.68, 'buildRoma'],
    ['hummin', 1.85, 'buildHummin'],
  ]) {
    if (onlyHero && onlyHero !== name) continue;
    const { [builder]: build } = await import('/characters/' + name + '.js');
    const rig = createActor(name, height),
      animate = build(rig),
      controller = createController(rig);
    setModelDetail(rig.root, tier);
    const registry = rig.garments;
    if (!registry) {
      failures.push(name + ': missing garment registration');
      continue;
    }
    const omittedMobileDetails = {};
    const surfaces = Object.fromEntries(
      Object.entries(registry.surfaces).map(([id, value]) => {
        const meshes = [value].flat();
        const rendered = meshes.filter(
          (mesh) => !(tier === 'mobile' && mesh.userData.highDetail && !mesh.visible),
        );
        if (rendered.length !== meshes.length) omittedMobileDetails[id] = meshes.length - rendered.length;
        return [id, rendered];
      }),
    );
    const requiredLayers = {
      sippy: ['shirt', 'vest', 'jacket', 'lapels', 'tails', 'bow', 'trousers-L', 'trousers-R'],
      roma: ['bodice', 'skirt', 'jacket', 'belt', 'strap', 'bag'],
      hummin: ['bib', 'flapL', 'flapR', 'strapL', 'strapR'],
    };
    for (const layer of requiredLayers[name])
      if (!surfaces[layer]?.length) failures.push(name + ': missing required garment ' + layer);
    const declared = registry.pairs,
      unique = new Set(),
      pairs = [];
    const bodies =
      registry.bodies ??
      Object.keys(surfaces).filter(
        (id) => id === 'body' || id.startsWith('body-') || /^(chassis|pelvis|thigh[LR])$/.test(id),
      );
    const isBody = (id) => bodies.includes(id);
    const result = (results[name] = {
      surfaces: {},
      bodies,
      omittedMobileDetails,
      pairs,
      poses: {},
      candidateTriangles: 0,
      crossings: 0,
      coplanar: 0,
      enclosed: 0,
      testedVertices: 0,
    });
    for (const { outer, inner } of declared) {
      if (!surfaces[outer] || !surfaces[inner] || inner === outer)
        throw Error(name + ': invalid surface pair ' + outer + '/' + inner);
      const key = [outer, inner].sort().join('/');
      if (unique.has(key)) throw Error(name + ': duplicate surface pair ' + key);
      unique.add(key);
      pairs.push({ outer, inner });
    }
    // Explicit stack order determines containment direction. A glove, cuff or
    // skirt can move far from its own body region, so the crossing test also
    // checks every other combination of registered surfaces in the final pose.
    for (const [i, a] of Object.keys(surfaces).entries()) {
      for (const b of Object.keys(surfaces).slice(i + 1)) {
        if (isBody(a) && isBody(b)) continue;
        const key = [a, b].sort().join('/');
        if (unique.has(key)) continue;
        pairs.push(isBody(a) ? { outer: b, inner: a } : { outer: a, inner: b });
        unique.add(key);
      }
    }
    if (!bodies.length || !declared.length) failures.push(name + ': missing body/layer registration');
    for (const id of garmentPoses) {
      poseGarment(rig, controller, animate, id);
      const cache = new Map();
      for (const [key, meshes] of Object.entries(surfaces)) {
        const rows = [];
        for (const mesh of meshes) {
          if (!cache.has(mesh)) cache.set(mesh, posedSurface(mesh, isBody(key)));
          const s = cache.get(mesh);
          rows.push({
            mesh: mesh.name || '#' + meshes.indexOf(mesh),
            triangles: s.count,
            uniqueVertices: s.points.length,
            volumeComponents: s.volumes.length,
            boundaryEdges: s.boundaryEdges,
            nonManifoldEdges: s.nonManifoldEdges,
          });
        }
        if (id === 'stand') result.surfaces[key] = rows;
        for (const row of rows)
          if (isBody(key) && (row.boundaryEdges || row.nonManifoldEdges))
            failures.push(
              name + '/' + id + ': body volume ' + key + '/' + row.mesh + ' is open or nonmanifold',
            );
      }
      const pose = (result.poses[id] = {
        state: controller.frame.state,
        emote: controller.frame.emote,
        registrationPairs: 0,
        meshPairs: 0,
        candidateTriangles: 0,
        testedVertices: 0,
        collisions: [],
      });
      for (const { outer, inner } of pairs) {
        pose.registrationPairs++;
        for (const [i, a] of surfaces[outer].entries())
          for (const [j, b] of surfaces[inner].entries()) {
            if (a === b) throw Error(name + ': surface compared to itself ' + outer + '/' + inner);
            pose.meshPairs++;
            const r = compareSurfaces(cache.get(a), cache.get(b), !isBody(inner));
            for (const k of ['candidateTriangles', 'crossings', 'coplanar', 'enclosed', 'testedVertices'])
              result[k] += r[k];
            pose.candidateTriangles += r.candidateTriangles;
            pose.testedVertices += r.testedVertices;
            if (!r.crossings && !r.coplanar && !r.enclosed) continue;
            pose.collisions.push({
              outer: outer + '[' + i + ']',
              inner: inner + '[' + j + ']',
              crossings: r.crossings,
              coplanar: r.coplanar,
              enclosed: r.enclosed,
              samples: r.samples,
            });
          }
      }
      if (pose.collisions.length)
        failures.push(name + '/' + id + ': ' + pose.collisions.length + ' intersecting mesh pairs');
    }
  }
  return { tier, precisionM: 1e-7, results, failures };
}

const tier = process.env.CHARACTERS_TIER || 'high';
if (tier !== 'mobile' && tier !== 'high') throw Error('Expected high or mobile detail');
await runCharacterProbe(measure, { tier });
