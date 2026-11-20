// Set CHARACTERS_TIER=mobile to check the production lower-resolution patterns.
// THREE_ROOT=/path/to/three node tools/check-characters-garments.mjs [sippy|roma|hummin]
import { runCharacterProbe } from './characters-browser.mjs';

async function measure(onlyHero, { tier }) {
  const { setModelDetail } = await import('/characters/material-detail.js');
  const { createActor } = await import('/characters/rig.js');
  const { createController } = await import('/characters/motion.js');
  const { garmentPoses, poseGarment } = await import('/tools/characters-garment-poses.mjs');
  const { posedSurface, compareSurfaces } = await import('/tools/characters-surfaces.mjs');
  const { measureSeam, seamLimitM, panelTopology } = await import('/tools/characters-seams.mjs');
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
    const requiredSeams = {
      sippy: [
        'shoulder-L-body',
        'shoulder-R-body',
        'shoulder-L-sleeve',
        'shoulder-R-sleeve',
        'hip-L',
        'hip-R',
        'seat-L-waist',
        'seat-R-waist',
        'crotch',
        'waist',
        'tail-L',
        'tail-R',
      ],
      roma: ['jacket-L', 'jacket-R'],
      hummin: [],
    };
    const panels = registry.outerPanels ?? [];
    if (name === 'roma' && !panels.some((p) => p.name === 'jacket-yoke'))
      failures.push('roma: missing outer jacket pattern for underarm continuity');
    const seams = registry.seams ?? [];
    const seamNames = new Set(seams.map((s) => s.name));
    if (seamNames.size !== seams.length) failures.push(name + ': duplicate seam names');
    for (const key of requiredSeams[name])
      if (!seamNames.has(key)) failures.push(name + ': missing fitted seam ' + key);
    if (name === 'sippy') {
      for (const seam of seams) {
        const isOpening = /^shoulder-[LR]-(body|sleeve)$|^hip-[LR]$|^waist$/.test(seam.name);
        if (isOpening && (!seam.edge.closed || (seam.mate && !seam.mate.closed)))
          failures.push(name + ': incomplete circumference of ' + seam.name);
      }
    }
    const requiredLayers = {
      sippy: ['shirt', 'vest', 'jacket', 'lapels', 'tails', 'bow', 'trousers-L', 'trousers-R'],
      roma: ['bodice', 'skirt', 'jacket', 'belt', 'strap', 'bag'],
      hummin: ['bib', 'flapL', 'flapR', 'strapL', 'strapR'],
    };
    if (name !== 'hummin' && !surfaces.body?.length) failures.push(name + ': missing continuous body skin');
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
    // A collar and coat can be separate registered surfaces. A sleeve head
    // and its partner can also be meshes of one garment. Check all sewn
    // neighbors in both representations, once per actual rendered mesh pair.
    const ownership = new Map(),
      meshPairs = [],
      testedPairs = new Set();
    for (const [label, meshes] of Object.entries(surfaces))
      for (const [index, mesh] of meshes.entries()) {
        if (ownership.has(mesh)) throw Error(name + ': garment mesh declared twice: ' + label);
        ownership.set(mesh, { label, index });
      }
    function addMeshPair(a, b, sewn) {
      if (a === b) return; // A continuous pattern has no separate opposing mesh.
      const outer = ownership.get(a),
        inner = ownership.get(b);
      if (!outer || !inner) throw Error(name + ': unregistered sewn mesh');
      const key = [a.id, b.id].sort((x, y) => x - y).join('/');
      if (testedPairs.has(key)) return;
      testedPairs.add(key);
      meshPairs.push({
        a,
        b,
        outer: outer.label + '[' + outer.index + ']',
        inner: inner.label + '[' + inner.index + ']',
        reverse: !isBody(inner.label),
        sewn,
      });
    }
    for (const { outer, inner } of pairs)
      for (const a of surfaces[outer]) for (const b of surfaces[inner]) addMeshPair(a, b, false);
    for (const seam of seams) {
      const targets = seam.mate ? [seam.mate.mesh] : [seam.target].flat().map((t) => t.mesh ?? t);
      for (const target of targets) addMeshPair(seam.edge.mesh, target, true);
    }
    result.sewnMeshPairs = meshPairs.filter((m) => m.sewn).map(({ outer, inner }) => ({ outer, inner }));
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
          if (key === 'body' && (row.volumeComponents !== 1 || rows.length !== 1))
            failures.push(name + '/' + id + ': anatomical skin is disconnected');
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
      pose.outerPanels = {};
      for (const panel of panels) {
        try {
          const m = panelTopology(panel, cache, tier);
          pose.outerPanels[panel.name] = m;
          const expect = panel.name === 'jacket-yoke' && name === 'roma' ? 3 : panel.boundaryLoops;
          if (
            !m.triangles ||
            m.components !== 1 ||
            m.boundaryLoops !== expect ||
            m.nonManifoldEdges ||
            m.branchedBoundaryVertices
          )
            failures.push(
              name + '/' + id + '/' + panel.name + ': disconnected outer fabric or unexpected cut boundary',
            );
        } catch (e) {
          failures.push(name + '/' + id + '/' + panel.name + ': ' + e.message);
        }
      }
      pose.seams = {};
      for (const seam of seams) {
        try {
          const m = measureSeam(seam, cache, tier);
          pose.seams[seam.name] = m;
          const standing = result.poses.stand.seams[seam.name]?.edgeLengthM;
          if (m.maxGapM > seamLimitM || m.maxGapUpperBoundM > seamLimitM + 1e-7)
            failures.push(
              name +
                '/' +
                id +
                '/' +
                seam.name +
                ': maximum seam gap ' +
                (1000 * m.maxGapM).toFixed(2) +
                ' mm (continuous-edge upper bound ' +
                (1000 * m.maxGapUpperBoundM).toFixed(2) +
                ' mm)',
            );
          if (standing && m.edgeLengthM < 0.5 * standing)
            failures.push(
              name +
                '/' +
                id +
                '/' +
                seam.name +
                ': sewing line collapsed to less than half its neutral span',
            );
        } catch (e) {
          failures.push(name + '/' + id + '/' + seam.name + ': ' + e.message);
        }
      }
      pose.registrationPairs = pairs.length;
      pose.meshPairs = meshPairs.length;
      for (const { a, b, outer, inner, reverse } of meshPairs) {
        const r = compareSurfaces(cache.get(a), cache.get(b), reverse);
        for (const k of ['candidateTriangles', 'crossings', 'coplanar', 'enclosed', 'testedVertices'])
          result[k] += r[k];
        pose.candidateTriangles += r.candidateTriangles;
        pose.testedVertices += r.testedVertices;
        if (r.crossings || r.coplanar || r.enclosed)
          pose.collisions.push({
            outer,
            inner,
            crossings: r.crossings,
            coplanar: r.coplanar,
            enclosed: r.enclosed,
            samples: r.samples,
          });
      }
      if (pose.collisions.length)
        failures.push(name + '/' + id + ': ' + pose.collisions.length + ' intersecting mesh pairs');
    }
  }
  return { tier, precisionM: 1e-7, seamLimitM, results, failures };
}

const tier = process.env.CHARACTERS_TIER || 'high';
if (tier !== 'mobile' && tier !== 'high') throw Error('Expected high or mobile detail');
await runCharacterProbe(measure, { tier });
