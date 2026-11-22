// Read the posed, actively drawn geometry. The independent design targets
// are deliberately absent from this module's browser measurement function.
function forTier(selection, tier) {
  return selection?.[tier] ?? selection;
}

function belongsToRenderedHero(mesh, root) {
  for (let p = mesh; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === root) return true;
  }
  return false;
}

function drawnFaces(mesh) {
  const g = mesh.geometry,
    index = g.index;
  const count = index?.count ?? g.attributes.position.count;
  const start = Math.max(0, g.drawRange.start);
  const end = Math.min(count, start + g.drawRange.count);
  const ranges = Array.isArray(mesh.material)
    ? g.groups
        .filter((group) => mesh.material[group.materialIndex]?.visible)
        .map((group) => [group.start, group.start + group.count])
    : mesh.material?.visible
      ? [[start, end]]
      : [];
  const faces = new Map();
  for (const [a, b] of ranges) {
    for (let i = Math.max(a, start); i + 2 < Math.min(b, end); i += 3)
      faces.set(
        i / 3,
        [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
      );
  }
  return faces;
}

// Cross sections of the rendered locks give a size measure independent of
// model scale or solver radii. Report dimensions relative to the full groom
// as well, so a big-headed redesign can be compared to an earlier groom.
function measureClumps(rig, groomWidth) {
  const p = rig.root.position.clone();
  const records = [];
  for (const chain of rig.hair?.chains ?? []) {
    const bands = [0.25, 0.5, 0.75, 0.95].map((at) => ({ at, difference: Infinity, points: [] }));
    for (const surface of chain.surfaces) {
      const mesh = surface.mesh;
      if (!belongsToRenderedHero(mesh, rig.root)) continue;
      const ids = new Set([...drawnFaces(mesh).values()].flat());
      for (const i of ids) {
        const weight = (surface.segment[i] + surface.fraction[i]) / (chain.rest.length - 1);
        if (!Number.isFinite(weight)) continue;
        for (const band of bands) {
          const d = Math.abs(weight - band.at);
          if (d > band.difference + 0.006) continue;
          if (d < band.difference - 0.006) band.points = [];
          band.difference = Math.min(band.difference, d);
          band.points.push({ d, xyz: mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).toArray() });
        }
      }
    }
    const sections = bands.map((b) => b.points.filter((v) => v.d <= b.difference + 0.006).map((v) => v.xyz));
    if (sections.some((s) => !s.length)) continue;
    const centers = sections.map((s) =>
      [0, 1, 2].map((axis) => s.reduce((sum, pt) => sum + pt[axis], 0) / s.length),
    );
    const widths = sections.map((s, index) => {
      const a = centers[Math.max(0, index - 1)],
        b = centers[Math.min(centers.length - 1, index + 1)];
      const direction = b.map((v, i) => v - a[i]),
        norm = Math.hypot(...direction) || 1;
      let maxSq = 0;
      for (let i = 0; i < s.length; i++)
        for (let j = 0; j < i; j++) {
          const x = s[i][0] - s[j][0],
            y = s[i][1] - s[j][1],
            z = s[i][2] - s[j][2];
          const along = (x * direction[0] + y * direction[1] + z * direction[2]) / norm;
          maxSq = Math.max(maxSq, x * x + y * y + z * z - along * along);
        }
      return Math.sqrt(maxSq);
    });
    const width = Math.max(...widths);
    records.push({
      name: chain.group.name,
      role: chain.role,
      sectionDiametersM: widths,
      widthPercentOfGroom: (100 * width) / groomWidth,
      distalToWidest: width ? widths.at(-1) / width : null,
    });
  }
  return { animatedClumps: records.length, sectionsAt: [0.25, 0.5, 0.75, 0.95], clumps: records };
}

export function measureRigLandmarks(rig, tier = 'high') {
  if (!rig.blueprint) throw Error(rig.name + ': missing geometry landmark bindings');
  rig.root.updateMatrixWorld(true);
  const active = new Map(),
    world = new Map(),
    p = rig.root.position.clone();
  function select(slot) {
    if (!slot?.label || !slot.parts?.length)
      throw Error('Expected a named landmark bound to rendered mesh parts');
    const chosen = new Map();
    function add(mesh, selection) {
      if (!belongsToRenderedHero(mesh, rig.root))
        throw Error(slot.label + ': detached/hidden source ' + mesh.name);
      if (!active.has(mesh)) {
        const faces = drawnFaces(mesh);
        active.set(mesh, { faces, vertices: new Set([...faces.values()].flat()) });
      }
      const { faces, vertices } = active.get(mesh);
      let ids;
      if (selection?.vertices) ids = forTier(selection.vertices, tier);
      else if (selection?.triangles) {
        ids = [];
        for (const face of forTier(selection.triangles, tier)) {
          if (!faces.has(face)) throw Error(slot.label + ': triangle ' + face + ' is not drawn');
          ids.push(...faces.get(face));
        }
      } else ids = vertices;
      if (!chosen.has(mesh)) chosen.set(mesh, new Set());
      for (const id of ids) {
        if (!vertices.has(id)) throw Error(slot.label + ': vertex ' + id + ' is not drawn');
        chosen.get(mesh).add(id);
      }
    }
    for (const part of slot.parts) {
      if (part?.mesh?.isMesh) add(part.mesh, part);
      else if (part?.isObject3D)
        part.traverseVisible((m) => {
          if (m.isMesh) add(m);
        });
      else throw Error(slot.label + ': invalid geometry source');
    }
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    const minVertex = [],
      maxVertex = [],
      sources = [];
    let count = 0;
    for (const [mesh, indices] of chosen) {
      const path = [];
      for (let node = mesh; node && node !== rig.root; node = node.parent)
        path.unshift(node.name || node.type + '[' + node.parent.children.indexOf(node) + ']');
      const name = path.join('/');
      sources.push({ mesh: name, vertices: indices.size });
      if (!world.has(mesh)) world.set(mesh, new Map());
      const coords = world.get(mesh);
      for (const index of indices) {
        if (!coords.has(index))
          coords.set(index, mesh.getVertexPosition(index, p).applyMatrix4(mesh.matrixWorld).toArray());
        const xyz = coords.get(index);
        count++;
        for (let d = 0; d < 3; d++) {
          if (xyz[d] < min[d]) {
            min[d] = xyz[d];
            minVertex[d] = { mesh: name, index, worldM: xyz };
          }
          if (xyz[d] > max[d]) {
            max[d] = xyz[d];
            maxVertex[d] = { mesh: name, index, worldM: xyz };
          }
        }
      }
    }
    if (!count) throw Error(slot.label + ': has no drawn vertices');
    return {
      label: slot.label,
      sources,
      minM: min,
      maxM: max,
      centerM: min.map((a, i) => (a + max[i]) / 2),
      minVertex,
      maxVertex,
    };
  }
  const locations = {},
    features = {},
    landmarks = {};
  const bindings = rig.blueprint;
  const groom = select(bindings.groom);
  const crown = groom.maxM[1],
    height = rig.height;
  const downPercent = (y) => (100 * (crown - y)) / height;
  const clean = (selection) => ({
    label: selection.label,
    sources: selection.sources,
    minM: selection.minM,
    maxM: selection.maxM,
  });
  locations.crown = [groom.maxVertex[1].worldM];
  features.groom = {
    ...clean(groom),
    top: groom.maxVertex[1],
    left: groom.maxVertex[0],
    right: groom.minVertex[0],
  };
  const chin = select(bindings.chin);
  landmarks.chin = downPercent(chin.minM[1]);
  features.chin = { ...clean(chin), bottom: chin.minVertex[1] };
  locations.chin = [chin.minVertex[1].worldM];
  for (const key of ['eyes', 'shoulders', 'waist', 'knee', 'ankleCuff']) {
    const paired = key !== 'waist';
    const slots = paired ? bindings[key] : [bindings[key]];
    if (!Array.isArray(slots) || slots.length !== (paired ? 2 : 1))
      throw Error('Invalid anatomical selections: ' + key);
    const selections = slots.map(select);
    if (paired && selections[0].centerM[0] <= selections[1].centerM[0])
      throw Error(key + ': expected anatomical left then right');
    const witnesses = selections.map((s) => (key === 'shoulders' ? s.maxVertex[1].worldM : s.centerM));
    locations[key] = witnesses;
    landmarks[key] = downPercent(witnesses.reduce((sum, pt) => sum + pt[1], 0) / witnesses.length);
    features[key] = selections.map((s) => ({ ...clean(s), low: s.minVertex[1], high: s.maxVertex[1] }));
  }
  landmarks.hairWidth = (100 * (groom.maxM[0] - groom.minM[0])) / height;
  locations.hairWidth = [groom.minVertex[0].worldM, groom.maxVertex[0].worldM];
  const soles = select({ label: 'both rendered foot assemblies', parts: [rig.footL, rig.footR] });
  const standingHeightM = crown - soles.minM[1],
    headHeightM = crown - chin.minM[1];
  return {
    name: rig.name,
    tier,
    heightM: height,
    standingHeightM,
    headHeightM,
    headCount: standingHeightM / headHeightM,
    floorM: soles.minM[1],
    groom: measureClumps(rig, groom.maxM[0] - groom.minM[0]),
    landmarks,
    locationsM: locations,
    measurements: features,
    pose: '42 grounded idle ticks at fixed timestep, feet facing +Z',
  };
}

// The optional CLI runs the same production modules and neutral pose as the
// model feed. Browser callers can read the measured landmarks on their instance.
if (typeof process !== 'undefined' && process.versions?.node) {
  const { pathToFileURL } = await import('node:url');
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { runCharacterProbe } = await import('../characters-browser.mjs');
    const { mkdir, writeFile } = await import('node:fs/promises');
    const tier = process.env.CHARACTERS_TIER || 'high';
    if (!['high', 'mobile'].includes(tier)) throw Error('Expected high or mobile quality');
    const results = await runCharacterProbe(
      async function (only, { tier }) {
        const { createActor } = await import('/characters/rig.js'),
          { createController, FIXED_DT } = await import('/characters/motion.js');
        const { setModelDetail } = await import('/characters/material-detail.js');
        const { loadAvatar } = await import('/characters/avatar-builder.js');
        const { measureRigLandmarks } = await import('/tools/blueprints/measure-landmarks.mjs');
        const heroes = [
          ['sippy', 1.78],
          ['roma', 1.68],
          ['hummin', 1.85],
        ];
        const results = {};
        for (const [name, height] of heroes) {
          if (only && only !== name) continue;
          const rig = createActor(name, height);
          const build = await loadAvatar(name, tier);
          const animate = build(rig);
          setModelDetail(rig.root, tier);
          const controller = createController(rig);
          controller.reset(0, 0);
          const idle = { x: 0, z: 0, run: false, roll: false, jump: false, emote: false };
          for (let i = 0; i < 42; i++) {
            animate(controller.step(FIXED_DT, idle));
            controller.finishPose();
          }
          results[name] = measureRigLandmarks(rig, tier);
        }
        return { results };
      },
      { tier },
    );
    if (results?.results)
      for (const [name, report] of Object.entries(results.results)) {
        const out = new URL('../../characters-review/blueprints/' + name + '/model/', import.meta.url);
        await mkdir(out, { recursive: true });
        await writeFile(
          new URL(tier === 'high' ? 'landmarks.json' : 'landmarks-mobile.json', out),
          JSON.stringify(report, null, 2) + '\n',
        );
      }
  }
}
