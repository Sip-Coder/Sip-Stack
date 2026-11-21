// Current speed rigs: node tools/check-characters-motion.mjs --speed [hero]
// Detailed PR #16 rigs: Node 22+, Chromium and three@0.170.0. Example:
// THREE_ROOT=/path/to/three CHROME=/usr/bin/chromium node tools/check-characters-motion.mjs
// Pass sippy, roma or hummin as an optional argument to isolate a single model.
// Set CHARACTERS_HAIR_MOBILE=1 to include Mobile hair contacts. Set it to
// "only" to run that identical 86-pose trial in a separate browser alongside
// a default High run on the same revision.
import { readFile } from 'node:fs/promises';
import { runCharacterProbe } from './characters-browser.mjs';

// Executed as an ES module inside Chromium so procedural CanvasTextures and
// BufferGeometry are identical to the production models. WebGL is unnecessary.
async function measure(onlyHero, { mobileHair, onlyMobile, designs }) {
  const T = await import('three');
  const { measureRigLandmarks } = await import('/tools/blueprints/measure-landmarks.mjs');
  const { checkBandCoverage } = await import('/tools/characters-band-coverage.mjs');
  const { measureStrandMotion } = await import('/tools/characters-strand-motion.mjs');
  const { checkFlorence, captureIdleMotion } = await import('/tools/characters-florence.mjs');
  const { garmentPoses, poseGarment } = await import('/tools/characters-garment-poses.mjs');
  const { createActor } = await import('/characters/rig.js');
  const { setModelDetail } = await import('/characters/material-detail.js');
  const { createController, FIXED_DT, PROPS } = await import('/characters/motion.js');
  const { buildSippy } = await import('/characters/sippy.js');
  const { buildRoma } = await import('/characters/roma.js');
  const { buildHummin } = await import('/characters/hummin.js');
  const failures = [],
    results = {};
  const point = new T.Vector3(),
    chestInverse = new T.Matrix4(),
    toChest = new T.Matrix4();
  for (const [name, height, build] of [
    ['sippy', 1.78, buildSippy],
    ['roma', 1.68, buildRoma],
    ['hummin', 1.85, buildHummin],
  ]) {
    if (onlyHero && name !== onlyHero) continue;
    const rig = createActor(name, height),
      animate = build(rig),
      controller = createController(rig);
    if (name !== 'hummin' && !rig.hair?.chains) {
      failures.push(name + ': the strand/contact atlas belongs to PR #16 at a59620d. Use --speed for the current production rigs. See tools/heros-checks.md.');
      continue;
    }
    const input = { x: 0, z: 0, run: false, roll: false, jump: false, emote: false };
    // Extract actual toe and heel vertices in ankle-local coordinates. Monitoring
    // both picks up rotation/skating around a stationary IK anchor.
    rig.root.updateMatrixWorld(true);
    const soles = controller.contacts.map((contact) => {
      const samples = [],
        triangles = [],
        inverse = contact.ankle.matrixWorld.clone().invert();
      let bottom = Infinity;
      contact.ankle.traverse((node) => {
        if (!node.isMesh) return;
        const m = new T.Matrix4().multiplyMatrices(inverse, node.matrixWorld),
          verts = node.geometry.getAttribute('position');
        for (let i = 0; i < verts.count; i++) {
          const p = new T.Vector3().fromBufferAttribute(verts, i).applyMatrix4(m);
          samples.push(p);
          bottom = Math.min(bottom, p.y);
        }
        const idx = node.geometry.index,
          count = idx?.count ?? verts.count,
          base = samples.length - verts.count;
        for (let i = 0; i < count; i += 3)
          triangles.push([0, 1, 2].map((d) => samples[base + (idx ? idx.getX(i + d) : i + d)]));
      });
      // A shoe rocks over its tread. Track every distinct underside vertex
      // for as long as that specific vertex is loaded, including the rounded
      // heel and toe. Flat stance still constrains the full contact patch.
      const unique = new Map();
      for (const p of samples) {
        if (p.y > bottom + 0.045) continue;
        const key = [p.x, p.y, p.z].map((a) => Math.round(a * 1e6)).join(',');
        unique.set(key, p);
      }
      const tread = [...unique.values()].sort((a, b) => a.z - b.z);
      if (tread.length < 2) throw Error('Missing foot tread ' + name + ' ' + contact.side);
      const z0 = tread[0].z,
        z1 = tread.at(-1).z;
      // An unsegmented, flat tread may have no vertex in its middle.
      // Slice the actual shoe triangles so the support check includes that area.
      const midfoot = [];
      for (const fraction of [0.35, 0.5, 0.65]) {
        const z = z0 + (z1 - z0) * fraction;
        for (const tri of triangles)
          for (let j = 0; j < 3; j++) {
            const a = tri[j],
              b = tri[(j + 1) % 3];
            if ((a.z - z) * (b.z - z) > 0 || Math.abs(b.z - a.z) < 1e-10) continue;
            const p = a.clone().lerp(b, (z - a.z) / (b.z - a.z));
            if (p.y < bottom + 0.045) midfoot.push(p);
          }
      }
      return {
        tread,
        midfoot,
        z0,
        z1,
        front: z0 + 0.72 * (z1 - z0),
        back: z0 + 0.28 * (z1 - z0),
        locked: new Uint8Array(tread.length),
        starts: tread.map(() => new T.Vector3()),
        swing: false,
        sequence: [],
        touchdowns: [],
      };
    });
    const anatomy = rig.secondary?.[name];
    const bodyParts = [...(anatomy?.bodyParts ?? [])];
    if (anatomy?.body?.isMesh && anatomy?.bodyRegions)
      bodyParts.push({ mesh: anatomy.body, regions: anatomy.bodyRegions });
    // Select garment regions from actual bind weights when a continuous coat
    // wraps the chest, shoulders and both arms in one skinned draw call.
    for (const mesh of [anatomy?.yoke, anatomy?.hoodie].filter((m) => m?.isSkinnedMesh)) {
      const g = mesh.geometry,
        idx = g.index,
        weights = g.attributes.skinWeight,
        bones = g.attributes.skinIndex;
      const regions = { distalArms: [], torso: [], shoulders: [] };
      for (let t = 0; t < (idx?.count ?? weights.count) / 3; t++) {
        const byRegion = { distalArms: 0, torso: 0, shoulders: 0 };
        for (let k = 0; k < 3; k++)
          for (let j = 0; j < 4; j++) {
            const i = idx ? idx.getX(3 * t + k) : 3 * t + k,
              weight = weights.getComponent(i, j);
            if (!weight) continue;
            const bone = mesh.skeleton.bones[bones.getComponent(i, j)].name;
            if (/^(forearm|hand)/.test(bone)) byRegion.distalArms += weight;
            if (/^(hips|chest)$/.test(bone)) byRegion.torso += weight;
            if (/^upperArm/.test(bone)) byRegion.shoulders += weight;
          }
        for (const key of Object.keys(regions)) if (byRegion[key] >= 1.65) regions[key].push(t);
      }
      bodyParts.push({ mesh, regions });
    }
    let poseId = 1;
    let vertexCache = new WeakMap();
    let surfaceCache = new WeakMap();
    const surfaceRay = new T.Ray(),
      along = new T.Vector3(),
      pierce = new T.Vector3(),
      transform = new T.Matrix4(),
      queryBox = new T.Box3();
    function vertex(mesh, i, out) {
      if (!mesh.isSkinnedMesh) return mesh.getVertexPosition(i, out);
      let cache = vertexCache.get(mesh);
      if (!cache) {
        const n = mesh.geometry.attributes.position.count;
        cache = { coords: new Float64Array(3 * n), frame: new Uint32Array(n) };
        vertexCache.set(mesh, cache);
      }
      if (cache.frame[i] === poseId) return out.fromArray(cache.coords, 3 * i);
      mesh.getVertexPosition(i, out);
      out.toArray(cache.coords, 3 * i);
      cache.frame[i] = poseId;
      return out;
    }
    function partsFor(region) {
      return bodyParts.filter((part) => part.regions[region]?.length);
    }
    const meshes = [],
      limbs = [];
    const torsos = [];
    const bones = new Set(rig.joints);
    function findChestShell(node) {
      if (bones.has(node)) return;
      if (node.isMesh) {
        const g = node.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const box = g.boundingBox;
        if (box.min.x < -0.065 && box.max.x > 0.065 && box.max.y - box.min.y > 0.15) torsos.push(node);
      }
      node.children.forEach(findChestShell);
    }
    rig.chest.children.forEach(findChestShell);
    if (!torsos.length) throw Error('No chest surface selected for ' + name);
    const ray = new T.Raycaster(),
      start = new T.Vector3(),
      end = new T.Vector3(),
      ab = new T.Vector3();
    rig.root.traverse((node) => {
      if (node.isMesh) meshes.push(node);
    });
    for (const side of ['L', 'R'])
      for (const joint of ['forearm', 'hand', 'shin', 'foot']) {
        // Direct geometry on distal joints excludes intentionally held props.
        for (const node of rig[joint + side].children) if (node.isMesh) limbs.push(node);
      }
    function pose(beforeArt) {
      poseId++;
      const frame = controller.step(FIXED_DT, input);
      beforeArt?.(frame);
      animate(frame);
      controller.finishPose();
      rig.root.updateMatrixWorld(true);
      return frame;
    }
    function bounds() {
      let min = Infinity,
        max = -Infinity;
      for (const mesh of meshes) {
        if (!mesh.visible) continue;
        const m = mesh.matrixWorld.elements,
          vertices = mesh.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const y = mesh.isSkinnedMesh
            ? vertex(mesh, i, point).applyMatrix4(mesh.matrixWorld).y
            : m[1] * vertices.getX(i) + m[5] * vertices.getY(i) + m[9] * vertices.getZ(i) + m[13];
          min = Math.min(min, y);
          max = Math.max(max, y);
        }
      }
      return { min, max };
    }
    // A conservative ellipsoid strictly inside the ribcage. A distal limb
    // vertex inside it establishes a collision, even through a moving coat.
    // This probe does not claim exhaustive triangle/triangle clearance.
    function coreIntersections() {
      chestInverse.copy(rig.chest.matrixWorld).invert();
      for (const mesh of limbs) {
        if (!mesh.visible) continue;
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        const vertices = mesh.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(toChest);
          if ((point.x / 0.068) ** 2 + ((point.y - 0.045) / 0.093) ** 2 + (point.z / 0.039) ** 2 < 1)
            return true;
        }
      }
      return false;
    }

    // Index central chest panels in chest-local space; dynamic jacket hems
    // are reindexed after posing so tests follow the rendered cloth.
    const cells = new Map(),
      cellSize = 0.022,
      chestBox = new T.Box3();
    const key = (x, y, z) => (x + 64) * 16384 + (y + 64) * 128 + z + 64;
    const regions = [
      ...torsos.map((mesh) => ({ mesh })),
      ...partsFor('torso')
        .filter((p) => !torsos.includes(p.mesh))
        .map((p) => ({ mesh: p.mesh, triangles: p.regions.torso })),
    ];
    const shellSources = regions.map(({ mesh, triangles }) => {
      const g = mesh.geometry,
        idx = g.index,
        byId = new Map(),
        tris = [];
      const count = triangles?.length ?? (idx?.count ?? g.attributes.position.count) / 3;
      for (let t = 0; t < count; t++) {
        const offset = 3 * (triangles ? triangles[t] : t),
          tri = [];
        for (let j = 0; j < 3; j++) {
          const id = idx ? idx.getX(offset + j) : offset + j;
          if (!byId.has(id)) byId.set(id, new T.Vector3());
          tri.push(byId.get(id));
        }
        tri.shell = mesh.name || mesh.material.color?.getHexString() || 'body';
        tris.push(tri);
      }
      return { mesh, points: [...byId.entries()], tris };
    });
    const triangleBounds = new T.Box3();
    function indexShells() {
      for (const bucket of cells.values()) bucket.length = 0;
      chestBox.makeEmpty();
      chestInverse.copy(rig.chest.matrixWorld).invert();
      for (const { mesh, points, tris } of shellSources) {
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        for (const [i, p] of points) vertex(mesh, i, p).applyMatrix4(toChest);
        for (const tri of tris) {
          const box = triangleBounds.setFromPoints(tri);
          chestBox.union(box);
          for (let x = Math.floor(box.min.x / cellSize); x <= Math.floor(box.max.x / cellSize); x++)
            for (let y = Math.floor(box.min.y / cellSize); y <= Math.floor(box.max.y / cellSize); y++)
              for (let z = Math.floor(box.min.z / cellSize); z <= Math.floor(box.max.z / cellSize); z++) {
                const id = key(x, y, z);
                let bucket = cells.get(id);
                if (!bucket) {
                  bucket = [];
                  cells.set(id, bucket);
                }
                bucket.push(tri);
              }
        }
      }
    }
    indexShells();
    const cloth =
      partsFor('torso').length ||
      torsos.some((m) => m.geometry.getAttribute('position').usage === T.DynamicDrawUsage);
    const edgeRay = new T.Ray(),
      box = new T.Box3(),
      hit = new T.Vector3(),
      dir = new T.Vector3();
    let queryId = 0;
    function piercingEdge(a, b) {
      queryId++;
      box.min.copy(a).min(b);
      box.max.copy(a).max(b);
      if (!box.intersectsBox(chestBox)) return false;
      dir.subVectors(b, a);
      const length = dir.length();
      if (length < 1e-8) return false;
      edgeRay.set(a, dir.divideScalar(length));
      for (let x = Math.floor(box.min.x / cellSize); x <= Math.floor(box.max.x / cellSize); x++)
        for (let y = Math.floor(box.min.y / cellSize); y <= Math.floor(box.max.y / cellSize); y++)
          for (let z = Math.floor(box.min.z / cellSize); z <= Math.floor(box.max.z / cellSize); z++) {
            const bucket = cells.get(key(x, y, z));
            if (!bucket) continue;
            for (const tri of bucket) {
              if (tri.lastQuery === queryId) continue;
              tri.lastQuery = queryId;
              if (!edgeRay.intersectTriangle(tri[0], tri[1], tri[2], false, hit)) continue;
              const distance = hit.distanceTo(a);
              if (distance > 1e-6 && distance < length - 1e-6) return tri.shell;
            }
          }
      return false;
    }
    const a = new T.Vector3(),
      b = new T.Vector3(),
      d = new T.Vector3();
    function piercedShell() {
      if (cloth) indexShells();
      for (const part of partsFor('distalArms')) {
        const { mesh } = part,
          idx = mesh.geometry.index;
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        for (const t of part.regions.distalArms) {
          const ps = [a, b, d];
          for (let j = 0; j < 3; j++)
            vertex(mesh, idx ? idx.getX(3 * t + j) : 3 * t + j, ps[j]).applyMatrix4(toChest);
          const shell = piercingEdge(a, b) || piercingEdge(b, d) || piercingEdge(d, a);
          if (shell) return (mesh.name || 'distal arms') + ' / ' + shell;
        }
      }
      for (const mesh of limbs) {
        // Handheld props hang from separate subgroups. Check skin, glove,
        // articulated fingers and cuffs attached directly to these joints.
        if (!mesh.visible || !/^(hand|forearm)/.test(mesh.parent.name)) continue;
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        const g = mesh.geometry,
          p = g.getAttribute('position');
        if (!g.boundingBox) g.computeBoundingBox();
        if (!box.copy(g.boundingBox).applyMatrix4(toChest).intersectsBox(chestBox)) continue;
        const count = g.index?.count ?? p.count;
        for (let i = 0; i < count; i += 3) {
          a.fromBufferAttribute(p, g.index ? g.index.getX(i) : i).applyMatrix4(toChest);
          b.fromBufferAttribute(p, g.index ? g.index.getX(i + 1) : i + 1).applyMatrix4(toChest);
          d.fromBufferAttribute(p, g.index ? g.index.getX(i + 2) : i + 2).applyMatrix4(toChest);
          const shell = piercingEdge(a, b) || piercingEdge(b, d) || piercingEdge(d, a);
          if (shell) return mesh.parent.name + ' / ' + shell;
        }
      }
      return null;
    }

    function segmentCrossings() {
      for (const side of ['L', 'R'])
        for (const [a, b] of [
          ['forearm', 'hand'],
          ['shin', 'foot'],
        ]) {
          start.setFromMatrixPosition(rig[a + side].matrixWorld);
          end.setFromMatrixPosition(rig[b + side].matrixWorld);
          ab.subVectors(end, start);
          ray.near = 0;
          const abLength = ab.length();
          ray.far = abLength * 0.9;
          start.addScaledVector(ab, 0.05);
          const direction = ab.normalize();
          ray.set(start, direction);
          if (ray.intersectObjects(torsos, false).length) return true;
          end.addScaledVector(direction, -abLength * 0.05);
          ray.set(end, direction.negate());
          if (ray.intersectObjects(torsos, false).length) return true;
        }
      return false;
    }
    controller.reset(0, 0);
    for (let i = 0; i < 42; i++) pose();
    const lineup = bounds();
    const result = (results[name] = { heightM: lineup.max - lineup.min, phases: {} });
    function check(ok, message) {
      if (!ok) failures.push(name + ' ' + message);
    }
    if (onlyMobile) {
      if (rig.hair) measureMobileHair();
      continue;
    }
    const shoulderSpan = rig.upperArmL
      .getWorldPosition(new T.Vector3())
      .distanceTo(rig.upperArmR.getWorldPosition(new T.Vector3()));
    function silhouette(low, high) {
      const sliced = new T.Box3(),
        w = new T.Vector3(),
        size = new T.Vector3();
      for (const mesh of meshes) {
        const verts = mesh.geometry.attributes.position;
        for (let i = 0; i < verts.count; i++) {
          vertex(mesh, i, w).applyMatrix4(mesh.matrixWorld);
          if (w.y >= low * height && w.y <= high * height) sliced.expandByPoint(w);
        }
      }
      sliced.getSize(size);
      return { widthM: size.x, depthM: size.z };
    }
    result.proportions = {
      shoulderJointSpanM: shoulderSpan,
      shoulderSpanToHeight: shoulderSpan / result.heightM,
      cranialSlice: silhouette(0.89, 0.96),
      hipSlice: silhouette(0.5, 0.56),
      ankleSlice: silhouette(0.045, 0.07),
    };
    check(Math.abs(result.heightM - height) / height < 0.02, 'lineup height');
    if (rig.blueprint) {
      const observed = measureRigLandmarks(rig);
      result.proportions.headCount = observed.headCount;
      result.proportions.chinToCrownM = observed.headHeightM;
      result.proportions.crownToSolesM = observed.standingHeightM;
      result.proportions.blueprintLandmarks = observed.landmarks;
      const expected = designs[name].chin;
      result.proportions.designChinPercent = expected;
      const measured = (observed.headHeightM * 100) / designs[name].heightM;
      result.proportions.measuredChinPercent = measured;
      check(
        Math.abs(measured - expected) <= 1.5,
        'measured head height matches the Explorer drawing within 1.5% H',
      );
      if (name === 'hummin') {
        const domeFraction = observed.headHeightM / observed.standingHeightM;
        result.proportions.domeHeightFraction = domeFraction;
        check(
          domeFraction >= 0.22 && domeFraction <= 0.26,
          'helmet height is about 24% of standing height',
        );
      }
    } else check(false, 'actual mesh blueprint bindings missing');

    for (const action of ['walk', 'run', 'turn', 'jump', 'roll', 'emote']) {
      controller.reset(-10, 0); // Keep the level-floor trial clear of all props.
      for (const sole of soles) {
        sole.locked.fill(0);
        sole.swing = false;
        sole.sequence = [];
        sole.touchdowns = [];
      }
      Object.assign(input, { x: 0, z: 0, run: false, jump: false, roll: false, emote: false });
      if (['walk', 'run', 'turn', 'roll'].includes(action)) input.z = 1;
      input.run = ['run', 'turn', 'roll'].includes(action);
      let worstSlip = 0,
        plantedFrames = 0,
        min = Infinity,
        max = -Infinity,
        torsoFrames = 0,
        crossingFrames = 0,
        speed = 0,
        samples = 0,
        actionFrames = 0,
        landFrames = 0,
        apex = 0;
      const shellHits = {};
      const frames = action === 'emote' ? 130 : action === 'jump' ? 100 : 150;
      for (let f = 0; f < frames; f++) {
        input.jump = action === 'jump' && f === 8;
        input.roll = action === 'roll' && f === 44;
        input.emote = action === 'emote' && f === 0;
        if (action === 'turn' && f > 45) {
          const a = (f - 45) * 0.048;
          input.x = Math.sin(a);
          input.z = Math.cos(a);
        }
        const oldX = rig.root.position.x,
          oldZ = rig.root.position.z;
        const state = pose();
        if (action === 'jump') {
          if (state.state === 'land') landFrames++;
          apex = Math.max(apex, rig.root.position.y);
        }
        if (action === 'roll' && state.state === 'roll') actionFrames++;
        if ((action === 'walk' || action === 'run') && f >= 60) {
          speed += Math.hypot(rig.root.position.x - oldX, rig.root.position.z - oldZ) / FIXED_DT;
          samples++;
        }
        for (let k = 0; k < 2; k++) {
          const c = controller.contacts[k],
            s = soles[k];
          let footMin = Infinity,
            lowestZ = 0,
            heel = Infinity,
            toe = Infinity;
          for (let j = 0; j < s.tread.length; j++) {
            point.copy(s.tread[j]).applyMatrix4(c.ankle.matrixWorld);
            if (point.y < footMin) {
              footMin = point.y;
              lowestZ = s.tread[j].z;
            }
            if (s.tread[j].z >= s.front) toe = Math.min(toe, point.y);
            if (s.tread[j].z <= s.back) heel = Math.min(heel, point.y);
            if (c.planted && point.y <= 0.0015) {
              if (s.locked[j]) {
                worstSlip = Math.max(worstSlip, point.distanceTo(s.starts[j]));
                plantedFrames++;
              } else s.starts[j].copy(point);
              s.locked[j] = 1;
            } else s.locked[j] = 0;
          }
          if (f > 28 && (action === 'walk' || action === 'run')) {
            if (footMin > 0.0005) {
              if (s.sequence.length) {
                s.touchdowns.push(s.sequence);
                s.sequence = [];
              }
              s.swing = true;
            } else if (s.swing || s.sequence.length) {
              const label = toe - heel > 0.003 ? 'heel' : heel - toe > 0.003 ? 'toe' : 'flat';
              if (s.sequence.at(-1)?.label !== label) {
                const forward = new T.Vector3(0, 0, 1).transformDirection(c.ankle.matrixWorld);
                const patch = s.tread.filter(
                  (v) => point.copy(v).applyMatrix4(c.ankle.matrixWorld).y <= footMin + 0.0015,
                );
                s.sequence.push({
                  label,
                  t: f * FIXED_DT,
                  footAngle: T.MathUtils.radToDeg(Math.asin(forward.y)),
                  hitFraction: (lowestZ - s.z0) / (s.z1 - s.z0),
                  midfootHeight: Math.min(
                    ...s.midfoot.map((p) => point.copy(p).applyMatrix4(c.ankle.matrixWorld).y),
                  ),
                  contactPatch: [
                    (patch[0].z - s.z0) / (s.z1 - s.z0),
                    (patch.at(-1).z - s.z0) / (s.z1 - s.z0),
                  ],
                });
              }
              s.swing = false;
            }
          }
        }
        const extent = bounds();
        min = Math.min(min, extent.min);
        // Airborne separation is expected. Every grounded phase, including
        // both landing absorption and the entire shoulder roll, needs support.
        if (state.state !== 'jump' || rig.root.position.y < 0.0001) max = Math.max(max, extent.min);
        if (coreIntersections()) torsoFrames++;
        if (segmentCrossings()) crossingFrames++;
        const joint = piercedShell();
        if (joint) (shellHits[joint] ??= []).push(f);
      }
      const phase = (result.phases[action] = {
        floorMinM: min,
        groundedMaxM: max,
        torsoCoreFrames: torsoFrames,
        axisCrossingFrames: crossingFrames,
        shellHits,
      });
      if (action === 'walk' || action === 'run') {
        const steps = soles.flatMap((s) => s.touchdowns);
        phase.touchdownToeUpDeg = steps.map((seq) => seq[0].footAngle);
        phase.touchdownSoleFraction = steps.map((seq) => seq[0].hitFraction);
        phase.touchdownPatch = steps.map((seq) => seq[0].contactPatch);
        phase.midfootHeightAtTouchdownM = steps.map((seq) => seq[0].midfootHeight);
        if (action === 'run')
          check(
            steps.every((seq) => seq[0].midfootHeight < 0.001),
            'run touches middle third of tread within 1 mm',
          );
        check(
          steps.every((seq) => (action === 'walk' ? seq[0].footAngle > 9 : Math.abs(seq[0].footAngle) < 6)),
          action + ' physical touchdown pitch',
        );
        phase.contacts = steps.map((seq) => seq.map((e) => [e.label, Math.round(1000 * (e.t - seq[0].t))]));
        check(steps.length >= 3, action + ' missing complete physical contacts');
        for (const seq of steps) {
          const labels = seq.map((e) => e.label).join(' ');
          check(
            action === 'walk' ? labels === 'heel flat toe' : labels.includes('flat toe'),
            action + ' physical contact order: ' + labels,
          );
        }
      }
      if (samples) {
        phase.measuredMps = speed / samples;
        const expected = action === 'walk' ? 1.13 : 3.89;
        check(Math.abs(phase.measuredMps - expected) < expected * 0.1, action + ' speed');
      }
      if (['walk', 'run', 'turn'].includes(action)) {
        phase.slipM = worstSlip;
        phase.plantedSamples = plantedFrames;
        check(plantedFrames > 25 && worstSlip < 0.02, action + ' planted drift');
      }
      if (action === 'jump') {
        Object.assign(phase, { landFrames, apex });
        check(landFrames > 1 && apex > 0.1, 'jump/land transition');
      }
      if (action === 'roll') {
        phase.rollFrames = actionFrames;
        check(actionFrames > 10, 'roll transition');
      }
      check(min >= -0.0001, action + ' ground penetration');
      check(max <= 0.01, action + ' ground separation');
      check(torsoFrames === 0, action + ' distal limb entered torso core');
      check(crossingFrames === 0, action + ' limb axis crossed a torso panel');
      check(Object.keys(shellHits).length === 0, action + ' hand/forearm geometry crossed a chest shell');
    }
    // Distinguish the brief's dimensional targets from engineering checks for
    // qualitative observations. Velocities, radius, lean and bob below are
    // measured from posed transforms, independently of the controller's HUD.
    function turnTrial(targetSpeed, radius) {
      controller.reset(-17, -14);
      Object.assign(input, { x: 0, z: 1, run: targetSpeed > 2, jump: false, roll: false, emote: false });
      let bank = 0,
        pitch = 0,
        vsum = 0,
        omega = 0,
        previous = 0,
        lo = Infinity,
        hi = -Infinity,
        count = 0;
      const up = new T.Vector3();
      for (let f = 0; f < 200; f++) {
        const angle = radius ? (targetSpeed * f * FIXED_DT) / radius : 0;
        input.x = Math.sin(angle);
        input.z = Math.cos(angle);
        const px = rig.root.position.x,
          pz = rig.root.position.z;
        pose();
        const dx = rig.root.position.x - px,
          dz = rig.root.position.z - pz,
          heading = Math.atan2(dx, dz);
        if (f > 65) {
          up.setFromMatrixColumn(rig.chest.matrixWorld, 1).normalize();
          bank += T.MathUtils.radToDeg(
            Math.atan2(up.x * Math.cos(heading) - up.z * Math.sin(heading), up.y),
          );
          pitch += T.MathUtils.radToDeg(
            Math.atan2(up.x * Math.sin(heading) + up.z * Math.cos(heading), up.y),
          );
          vsum += Math.hypot(dx, dz) / FIXED_DT;
          omega += Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous)) / FIXED_DT;
          const y = rig.hips.getWorldPosition(point).y;
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
          count++;
        }
        previous = heading;
      }
      return {
        speedMps: vsum / count,
        radiusM: radius ? vsum / omega : null,
        bankDeg: bank / count,
        forwardLeanDeg: pitch / count,
        bobM: hi - lo,
      };
    }
    const travel = (result.trajectory = {
      walk: turnTrial(1.13, 0),
      run: turnTrial(3.89, 0),
      walkCurve: turnTrial(1.13, 2.4),
      wide: turnTrial(3.89, 4.8),
      tight: turnTrial(3.89, 2.4),
      left: turnTrial(3.89, -2.4),
    });
    check(travel.walk.bobM >= 0.0295 && travel.walk.bobM <= 0.0405, 'walk hip bob ~3–4 cm');
    check(travel.run.bobM > travel.walk.bobM + 0.003, 'run bob exceeds walk');
    check(travel.run.forwardLeanDeg >= 15 && travel.run.forwardLeanDeg <= 20, 'run lean 15–20 degrees');
    check(
      travel.tight.bankDeg > travel.wide.bankDeg + 1 &&
        travel.tight.bankDeg > travel.walkCurve.bankDeg + 1 &&
        travel.left.bankDeg < -1 &&
        Math.abs(travel.run.bankDeg) < 1.5,
      'inward turn bank varies with speed/radius',
    );
    // Record an authored accessory vertex relative to its parent joint. This
    // removes all whole-character travel and gait bob from the bounce signal.
    function freeEdge(group, key, pattern) {
      if (!group?.isObject3D) throw Error(name + ' is missing the animated ' + key + ' mesh group');
      const inverse = group.matrixWorld.clone().invert(),
        q = new T.Vector3();
      const parentScale = group.parent.getWorldScale(new T.Vector3());
      let far = -1,
        anchor = null,
        index = 0;
      const fabric = pattern && new Set([pattern].flat());
      group.traverseVisible((m) => {
        if (!m.isMesh || (fabric && !fabric.has(m))) return;
        const local = new T.Matrix4().multiplyMatrices(inverse, m.matrixWorld),
          p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          m.getVertexPosition(i, q).applyMatrix4(local);
          if (q.lengthSq() > far) {
            far = q.lengthSq();
            anchor = m;
            index = i;
          }
        }
      });
      if (!anchor) throw Error('Missing accessory geometry');
      return {
        mesh: anchor.name || anchor.parent.name,
        vertex: index,
        sample: () =>
          anchor
            .getVertexPosition(index, q)
            .applyMatrix4(anchor.matrixWorld)
            .applyMatrix4(inverse.copy(group.parent.matrixWorld).invert())
            .multiply(parentScale)
            .clone(),
      };
    }

    function response(frames, firstStop) {
      // A stopped actor can finish on either foot. Compare with the settled
      // endpoint of this same stop; do not assume the rest pose is identical.
      const rest = frames[0],
        terminal = frames.at(-1),
        run = frames.slice(95, 148);
      const box = new T.Box3().setFromPoints(run),
        range = box.getSize(new T.Vector3());
      const error = frames.slice(firstStop).map((p) => p.distanceTo(terminal));
      const threshold = 0.0015;
      const last = error.findLastIndex((v) => v > threshold);
      return {
        peakM: Math.max(...frames.map((p) => p.distanceTo(rest))),
        runRangeM: range.toArray(),
        settleS: (last + 1) * FIXED_DT,
        residualAfter1sM: Math.max(...error.slice(60)),
      };
    }

    // Build a local-space BVH once per skin, garment, or accessory surface.
    // Query posed cloth triangles in that mesh's space. Test both sets of
    // triangle edges so a small body triangle piercing a wide cloth panel is found.
    function rigidSurface(mesh, selection) {
      if (typeof selection === 'number') selection = null; // Array.map supplies its index.
      let byRegion = surfaceCache.get(mesh);
      if (!byRegion) {
        byRegion = new Map();
        surfaceCache.set(mesh, byRegion);
      }
      const prior = byRegion.get(selection ?? null);
      if (prior) {
        if (prior.pose !== poseId) {
          prior.pose = poseId;
          for (const [i, p] of prior.used) vertex(mesh, i, p);
          function refit(node) {
            node.box.makeEmpty();
            if (node.items) for (const tri of node.items) node.box.union(tri.box.setFromPoints(tri));
            else {
              refit(node.left);
              refit(node.right);
              node.box.union(node.left.box).union(node.right.box);
            }
          }
          refit(prior.tree);
        }
        return prior;
      }
      const g = mesh.geometry,
        p = g.attributes.position,
        idx = g.index,
        count = idx?.count ?? p.count;
      const corners = new Array(p.count);
      const indices = selection ?? Array.from({ length: count / 3 }, (_, i) => i);
      const triangles = [];
      for (const t of indices) {
        const i = 3 * t;
        for (let j = 0; j < 3; j++) {
          const k = idx ? idx.getX(i + j) : i + j;
          corners[k] ??= vertex(mesh, k, new T.Vector3());
        }
        const tri = [0, 1, 2].map((d) => corners[idx ? idx.getX(i + d) : i + d]);
        tri.box = new T.Box3().setFromPoints(tri);
        if (new T.Triangle(...tri).getArea() > 1e-12) triangles.push(tri);
      }
      const size = new T.Vector3();
      function partition(items) {
        const box = new T.Box3();
        for (const tri of items) box.union(tri.box);
        if (items.length <= 16) return { box, items };
        box.getSize(size);
        const axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
        items.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
        const mid = Math.floor(items.length / 2);
        return { box, left: partition(items.slice(0, mid)), right: partition(items.slice(mid)) };
      }
      const used = [];
      corners.forEach((p, i) => used.push([i, p]));
      const result = { mesh, tree: partition(triangles), used, pose: poseId };
      byRegion.set(selection ?? null, result);
      return result;
    }
    function cutsTriangle(a, b, triangle) {
      along.subVectors(b, a);
      const len = along.length();
      if (len < 1e-8) return false;
      surfaceRay.set(a, along.multiplyScalar(1 / len));
      return (
        !!surfaceRay.intersectTriangle(...triangle, false, pierce) &&
        pierce.distanceToSquared(a) < (len - 1e-7) ** 2
      );
    }
    function surfaceCrossing(source, count, targets, accepts) {
      const p = source.geometry.attributes.position,
        idx = source.geometry.index;
      const total = idx?.count ?? p.count;
      for (const { mesh, tree } of targets) {
        transform.copy(mesh.matrixWorld).invert().multiply(source.matrixWorld);
        // Quickly discard physically separate hair and outfit targets before
        // transforming thousands of vertices. Dynamic sources refresh their
        // full bounds on each sampled pose.
        if (
          !source.isSkinnedMesh &&
          source.geometry.boundingBox &&
          !source.geometry.boundingBox.clone().applyMatrix4(transform).intersectsBox(tree.box)
        )
          continue;
        const positions = Array.from({ length: count }, (_, i) =>
          vertex(source, i, new T.Vector3()).applyMatrix4(transform),
        );
        if (!new T.Box3().setFromPoints(positions).intersectsBox(tree.box)) continue;
        function crossing(node, tri) {
          if (!node.box.intersectsBox(queryBox)) return false;
          if (!node.items) return crossing(node.left, tri) || crossing(node.right, tri);
          for (const other of node.items) {
            if (!other.box.intersectsBox(queryBox)) continue;
            for (let j = 0; j < 3; j++)
              if (
                (cutsTriangle(tri[j], tri[(j + 1) % 3], other) && (!accepts || accepts(pierce, mesh))) ||
                (cutsTriangle(other[j], other[(j + 1) % 3], tri) && (!accepts || accepts(pierce, mesh)))
              )
                return true;
          }
          return false;
        }
        for (let i = 0; i < total; i += 3) {
          const a = idx ? idx.getX(i) : i,
            b = idx ? idx.getX(i + 1) : i + 1,
            c = idx ? idx.getX(i + 2) : i + 2;
          if (a >= count || b >= count || c >= count) continue;
          const tri = [positions[a], positions[b], positions[c]];
          queryBox.setFromPoints(tri);
          if (crossing(tree, tri))
            return {
              target: mesh.name || mesh.parent.name,
              targetParent: mesh.parent.name,
              material: mesh.material.color?.getHexString() ?? mesh.name,
              triangle: i / 3,
              rows: [a, b, c],
              localIntersection: pierce.toArray(),
            };
        }
      }
      return null;
    }

    function sleeveCaps(system) {
      const reports = [];
      for (const joint of [rig.upperArmL, rig.upperArmR]) {
        const cap = system.colliders.find(
          (c) => c.radii && (c.node === joint || (c.role === 'shoulder' && c.sleeveJoint === joint)),
        );
        if (!cap) {
          check(false, joint.name + ' hair collider absent');
          continue;
        }
        // Anatomical proximal sleeve band measured in joint units: upper 3 cm
        // below the shoulder pivot through the rounded crown of the sleeve.
        const inverse = cap.node.matrixWorld.clone().invert(),
          v = new T.Vector3();
        let largest = 0,
          vertices = 0;
        for (const m of joint.children.filter((m) => m.isMesh)) {
          const tr = new T.Matrix4().multiplyMatrices(inverse, m.matrixWorld),
            p = m.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(tr);
            if (v.y < -0.018) continue;
            largest = Math.max(
              largest,
              Math.hypot(...v.toArray().map((k, j) => (k - cap.center[j]) / cap.radii[j])),
            );
            vertices++;
          }
        }
        if (anatomy?.yoke?.isSkinnedMesh) {
          const m = anatomy.yoke,
            g = m.geometry,
            bones = g.attributes.skinIndex,
            weights = g.attributes.skinWeight;
          const tr = new T.Matrix4().multiplyMatrices(inverse, m.matrixWorld);
          for (let i = 0; i < weights.count; i++) {
            let influence = 0;
            for (let j = 0; j < 4; j++)
              if (m.skeleton.bones[bones.getComponent(i, j)] === joint)
                influence += weights.getComponent(i, j);
            if (influence <= 0.5) continue;
            vertex(m, i, v).applyMatrix4(tr);
            if (v.y < -0.018 || v.y > 0.042) continue;
            largest = Math.max(
              largest,
              Math.hypot(...v.toArray().map((n, j) => (n - cap.center[j]) / cap.radii[j])),
            );
            vertices++;
          }
        }
        reports.push({ joint: joint.name, vertices, maxUnitRadius: largest });
        check(vertices > 0 && largest <= 1.001, joint.name + ' shoulder cap outside hair collider');
      }
      return reports;
    }

    // Evaluate closest points of posed hair triangles in each ellipsoid's unit
    // sphere; a vertex-only check misses a penetrating triangle interior.
    // Signed Euclidean distance from an exterior point to an oriented ellipsoid.
    // Lagrange-multiplier bisection also handles eccentric cheek/neck contours.
    function ellipsoidGap(p, radii) {
      const x = p.toArray(),
        s = radii.map((a) => a * a),
        u = x.reduce((t, v, i) => t + (v * v) / s[i], 0);
      if (u <= 1) return (Math.sqrt(u) - 1) * Math.min(...radii);
      let lo = 0,
        hi = Math.max(...radii) * p.length();
      for (let k = 0; k < 30; k++) {
        const m = (hi + lo) / 2;
        if (x.reduce((t, v, i) => t + (s[i] * v * v) / (m + s[i]) ** 2, 0) > 1) lo = m;
        else hi = m;
      }
      return Math.hypot(...x.map((v, i) => v * (hi / (s[i] + hi))));
    }
    function segmentGap(a, b, c, d) {
      const ab = b.clone().sub(a),
        cd = d.clone().sub(c),
        ac = a.clone().sub(c);
      const aa = ab.lengthSq(),
        bb = ab.dot(cd),
        cc = cd.lengthSq(),
        dd = ab.dot(ac),
        ee = cd.dot(ac);
      let t = 0,
        u = 0;
      if (aa > 1e-20 && cc > 1e-20) {
        const det = aa * cc - bb * bb;
        if (det > 1e-20) t = T.MathUtils.clamp((bb * ee - cc * dd) / det, 0, 1);
        u = (bb * t + ee) / cc;
        if (u < 0) {
          u = 0;
          t = T.MathUtils.clamp(-dd / aa, 0, 1);
        } else if (u > 1) {
          u = 1;
          t = T.MathUtils.clamp((bb - dd) / aa, 0, 1);
        }
      } else if (aa > 1e-20) t = T.MathUtils.clamp(-dd / aa, 0, 1);
      else if (cc > 1e-20) u = T.MathUtils.clamp(ee / cc, 0, 1);
      return ac.addScaledVector(ab, t).addScaledVector(cd, -u).length();
    }
    function segmentTriangleGap(a, b, tri) {
      const dir = b.clone().sub(a),
        length = dir.length(),
        hit = new T.Vector3();
      if (
        length > 0 &&
        new T.Ray(a, dir.divideScalar(length)).intersectTriangle(tri.a, tri.b, tri.c, false, hit) &&
        a.distanceToSquared(hit) <= length * length
      )
        return 0;
      return Math.min(
        a.distanceTo(tri.closestPointToPoint(a, hit)),
        b.distanceTo(tri.closestPointToPoint(b, hit)),
        segmentGap(a, b, tri.a, tri.b),
        segmentGap(a, b, tri.b, tri.c),
        segmentGap(a, b, tri.c, tri.a),
      );
    }
    function sphereMeshGap(center, radius, target, accepts, witness) {
      const { mesh, tree } = target,
        local = center.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
      const minScale = Math.min(...mesh.getWorldScale(new T.Vector3()).toArray());
      const v = new T.Vector3(),
        tri = new T.Triangle();
      let near = 0.025 + radius;
      function visit(node) {
        if (node.box.distanceToPoint(local) * minScale > near) return;
        if (!node.items) {
          visit(node.left);
          visit(node.right);
          return;
        }
        for (const item of node.items) {
          if (item.box.distanceToPoint(local) * minScale > near) continue;
          tri.a.copy(item[0]).applyMatrix4(mesh.matrixWorld);
          tri.b.copy(item[1]).applyMatrix4(mesh.matrixWorld);
          tri.c.copy(item[2]).applyMatrix4(mesh.matrixWorld);
          tri.closestPointToPoint(center, v);
          const dist = v.distanceTo(center);
          if (
            dist < near &&
            (!accepts || accepts(v.clone().applyMatrix4(mesh.matrixWorld.clone().invert()), mesh))
          ) {
            near = dist;
            witness.copy(v);
          }
        }
      }
      visit(tree);
      return near - radius;
    }

    function hairInspector(system) {
      const unit = new T.Matrix4(),
        origin = new T.Vector3(),
        nearest = new T.Vector3(),
        tri = new T.Triangle();
      const report = {
        chains: system.chains.length,
        colliders: system.colliders.length,
        triangles: 0,
        poses: 0,
        minimumUnitRadius: Infinity,
        worstDepthM: 0,
        colliderPenetrations: {},
        tipPeakM: 0,
      };
      report.shoulderCapCoverage = sleeveCaps(system);
      const secondary = rig.secondary[name];
      const kitIds =
        name === 'sippy'
          ? ['hood', 'collar', 'headphones', 'backpack', 'backpack-straps']
          : ['hoodie', 'backpack', 'packStraps', 'hoops', 'headband'];
      const outfit = rig.garments.surfaces;
      if (name === 'roma') {
        const coverage = checkBandCoverage(T, outfit.headband, system.colliders);
        report.bandCoverage = coverage;
        check(coverage.triangles > 0 && coverage.maxTriangleRadius <= 1.00001, 'actual headband enclosed by its fitted sectors');
      }
      const kitLayers = new Map();
      report.kitTargets = {};
      for (const id of kitIds) {
        const meshes = [outfit[id]].flat().filter((m) => m?.isMesh && m.visible);
        check(meshes.length, 'missing rendered hair target ' + id);
        report.kitTargets[id] = meshes.length;
        for (const mesh of meshes) kitLayers.set(mesh, id);
      }
      report.kitTipClearancesM = {};
      const registered = [
        secondary.collarSkin,
        secondary.collar,
        secondary.neckSkin,
        secondary.neckMesh,
        secondary.neck,
        secondary.upperBack,
        secondary.jacket,
        ...kitLayers.keys(),
      ]
        .flat(Infinity)
        .filter((m) => m?.isMesh && !(m === secondary.body && secondary.bodyRegions?.neck?.length));
      const layers = [...new Set(registered)],
        fixedLayers = layers
          .filter((m) => !m.isSkinnedMesh && m.geometry.attributes.position.usage !== T.DynamicDrawUsage)
          .map(rigidSurface);
      const liveLayers = layers.filter(
        (m) => m.isSkinnedMesh || m.geometry.attributes.position.usage === T.DynamicDrawUsage,
      );
      report.tipColliders = {};
      report.realTipMinGapM = null;
      report.realTipGapSearchLimitM = 0.025;
      report.colliderRoles = [...new Set(system.colliders.map((c) => c.role ?? c.node.name))];
      report.realCollarLayers = layers.length;
      const rawFace = rig.secondary[name].faceSkin;
      const faceTargets = (Array.isArray(rawFace) ? rawFace : [rawFace]).map(rigidSurface);
      check(faceTargets.length > 0, 'no anatomical face skin');
      report.faceMeshes = faceTargets.length;
      const skinSpace = rig.root.getObjectByName(name === 'sippy' ? 'sippy-head' : 'Roma face and hair');
      const lip = new T.Vector3(),
        faceInverse = new T.Matrix4();
      // Both caps have asymmetric, sculpted edges. The crown above this line
      // sits under fixed scalp hair. Compare the actual remaining facial skin.
      function visibleFace(point, skin) {
        lip.copy(point).applyMatrix4(skin.matrixWorld).applyMatrix4(faceInverse);
        const { x, y, z } = lip;
        if (name === 'roma') {
          const a = Math.atan2(x / 0.0695, (z + 0.004) / 0.061),
            front = Math.max(0, Math.cos(a));
          const edge = 2.53 - 1.48 * front ** 2 + 0.06 * Math.sin(3 * a + 0.4) * front;
          return z > 0.002 && y < 0.083 + 0.069 * Math.cos(edge) - 0.002;
        }
        const a = Math.atan2(x / 0.058, (z + 0.0025) / 0.053),
          side = Math.abs(a),
          front = (1 + Math.cos(a)) * 0.5;
        const arch = 0.019 * Math.exp(-((side - 1.6) ** 2) / 0.05),
          burn = 0.019 * Math.exp(-((side - 1.17) ** 2) / 0.024);
        const part = 0.009 * Math.exp(-((a - 0.62) ** 2) / 0.029);
        const edge =
          0.037 + 0.072 * front ** 1.45 + arch - burn + part + 0.0025 * Math.cos(4 * a + 0.6) * front;
        return z > 0.002 && y < edge - 0.002;
      }
      const sleeves = [rig.upperArmL, rig.upperArmR].flatMap((j) => j.children.filter((m) => m.isMesh));
      // Track one rendered vertex at the end of every strand, distinct from
      // guide solver positions. Geometry-local coordinates exclude head travel.
      const tipPaths = system.chains.map((chain) => {
        let best = -1,
          mesh,
          index,
          scale = new T.Vector3();
        for (const surface of chain.surfaces) {
          for (let i = 0; i < surface.segment.length; i++) {
            const u = surface.segment[i] + surface.fraction[i];
            if (u > best) {
              best = u;
              mesh = surface.mesh;
              index = i;
            }
          }
        }
        mesh.getWorldScale(scale);
        return {
          frames: [],
          read: () =>
            new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).multiply(scale),
        };
      });
      const sphereTips = system.chains.map((chain) => ({ chain, center: new T.Vector3(), radius: 0 }));
      const colliderScale = new T.Vector3(), local = new T.Vector3(), inverse = new T.Matrix4();
      const originLocal = new T.Vector3(), line = new T.Line3();
      const idleMotion = captureIdleMotion(rig, system);
      const surfaces = system.chains.flatMap((c) => c.surfaces.map((s) => s.mesh));
      return {
        report,
        rememberIdle: idleMotion.remember,
        sampleTips(recordMotion = true) {
          if (recordMotion) for (const p of tipPaths) p.frames.push(p.read());
          for (const tip of sphereTips) {
            const { chain } = tip;
            tip.center.copy(chain.nodes.at(-1)).applyMatrix4(chain.group.matrixWorld);
            chain.group.getWorldScale(colliderScale);
            tip.radius = chain.radius * Math.max(colliderScale.x, colliderScale.y, colliderScale.z);
          }
          for (const collider of system.colliders) {
            const key = collider.role ?? collider.node.name;
            let minimum = report.tipColliders[key] ?? Infinity;
            const world = collider.node.matrixWorld;
            collider.node.getWorldScale(colliderScale);
            if (collider.support) {
              inverse.copy(world).invert();
              for (const tip of sphereTips) {
                local.copy(tip.center).applyMatrix4(inverse);
                const top = collider.support.heightAt(local.x, local.z);
                minimum = Math.min(minimum, (local.y - top) * colliderScale.y - tip.radius);
              }
            } else if (collider.radii) {
              inverse.copy(world).invert();
              originLocal.fromArray(collider.center);
              const radii = collider.radii.map((r, i) => r * colliderScale.getComponent(i));
              const bound = Math.max(...radii);
              for (const tip of sphereTips) {
                local.copy(tip.center).applyMatrix4(inverse).sub(originLocal).multiply(colliderScale);
                // The enclosing sphere gives a lower bound on the distance to
                // the ellipsoid. Only an improving pair needs exact bisection.
                if (local.length() - bound - tip.radius >= minimum) continue;
                minimum = Math.min(minimum, ellipsoidGap(local, radii) - tip.radius);
              }
            } else {
              line.start.fromArray(collider.a).applyMatrix4(world);
              line.end.fromArray(collider.b).applyMatrix4(world);
              const radius = collider.radius * Math.max(colliderScale.x, colliderScale.y, colliderScale.z);
              for (const tip of sphereTips) {
                line.closestPointToPoint(tip.center, true, local);
                minimum = Math.min(minimum, local.distanceTo(tip.center) - radius - tip.radius);
              }
            }
            report.tipColliders[key] = minimum;
          }
        },
        finish(stop) {
          // A still character continues to breathe, glance and shift weight.
          // Warm the same strand solver on this idle path, then play every
          // measured driver transform and breath phase forward a second time.
          // Subtract that independent idle trace to isolate post-run inertia.
          const errors = tipPaths.map(() => []);
          idleMotion.replay((i) => {
            tipPaths.forEach((p, j) => errors[j].push(p.read().distanceTo(p.frames[stop + i])));
          });
          report.materialTipPeakM = Math.max(
            ...tipPaths.map((p) => Math.max(...p.frames.map((q) => q.distanceTo(p.frames[0])))),
          );
          report.materialTipSettleS = Math.max(
            ...errors.map((e) => (e.findLastIndex((v) => v > 0.0015) + 1) * FIXED_DT),
          );
          report.materialTipResidualAfter1sM = Math.max(...errors.map((e) => Math.max(...e.slice(60))));
          report.settleReference = 'same recorded idle bones and breathing, replayed after an idle warmup';
        },
        inspect(label) {
          report.poses++;
          faceInverse.copy(skinSpace.matrixWorld).invert();
          for (const chain of system.chains) {
            const delta = chain.nodes
              .at(-1)
              .clone()
              .sub(chain.rest.at(-1))
              .applyMatrix3(new T.Matrix3().setFromMatrix4(chain.group.matrixWorld))
              .length();
            report.tipPeakM = Math.max(report.tipPeakM, delta);
          }
          const sleeveTargets = sleeves.map(rigidSurface);
          const body = secondary.body;
          const layerTargets = [
            ...fixedLayers,
            ...liveLayers.map(rigidSurface),
            ...(body ? [rigidSurface(body)] : []),
            ...partsFor('neck')
              .filter((part) => part.mesh !== body && !layers.includes(part.mesh))
              .map((part) => rigidSurface(part.mesh, part.regions.neck)),
          ];
          let poseTipGap = Infinity;
          for (const chain of system.chains) {
            const center = chain.nodes.at(-1).clone().applyMatrix4(chain.group.matrixWorld);
            const radius = chain.radius * Math.max(...chain.group.getWorldScale(new T.Vector3()).toArray());
            for (const target of [...faceTargets, ...sleeveTargets, ...layerTargets]) {
              const witness = new T.Vector3();
              const gap = sphereMeshGap(
                center,
                radius,
                target,
                faceTargets.includes(target) ? visibleFace : null,
                witness,
              );
              const garment = kitLayers.get(target.mesh);
              if (garment) {
                const previous = report.kitTipClearancesM[garment] ?? Infinity;
                report.kitTipClearancesM[garment] = Math.min(previous, gap);
              }
              poseTipGap = Math.min(poseTipGap, gap);
              if (gap < (report.realTipMinGapM ?? Infinity)) {
                report.realTipMinGapM = gap;
                report.nearestRealTip = {
                  pose: label,
                  lock: chain.group.name,
                  target: garment ?? (target.mesh.name || target.mesh.parent.name),
                  radiusM: radius,
                  tipInChestSpace: rig.chest.worldToLocal(center.clone()).toArray(),
                  surfaceInChestSpace: rig.chest.worldToLocal(witness).toArray(),
                };
              }
            }
          }
          if (typeof label === 'string') {
            report.stressPoseTipGapsM ??= {};
            report.stressPoseTipGapsM[label] = poseTipGap;
          }
          for (const mesh of surfaces) {
            const g = mesh.geometry,
              vertices = g.attributes.position;
            g.computeBoundingBox();
            const face = surfaceCrossing(mesh, vertices.count, faceTargets, visibleFace);
            if (face) {
              report.faceContactPoses ??= {};
              report.faceContactPoses[label] ??= { ...face, lock: mesh.parent.name };
            }
            const actual = surfaceCrossing(mesh, vertices.count, sleeveTargets);
            if (actual) {
              report.sleeveContactPoses ??= {};
              report.sleeveContactPoses[label] ??= { ...actual, lock: mesh.parent.name };
            }
            const coat = surfaceCrossing(mesh, vertices.count, layerTargets);
            if (coat) {
              report.layerContactPoses ??= {};
              report.layerContactPoses[label] ??= { ...coat, lock: mesh.parent.name };
            }
            for (const c of system.colliders) {
              if (c.support) {
                unit.copy(c.node.matrixWorld).invert().multiply(mesh.matrixWorld);
                c.node.getWorldScale(colliderScale);
                if (!g.boundingBox.clone().applyMatrix4(unit).intersectsBox(c.support.bounds)) continue;
                const checkPoint = (v) => {
                  const top = c.support.heightAt(v.x, v.z);
                  const clearance = (v.y - top) * colliderScale.y;
                  report.minPackTopVerticalGapM = Math.min(report.minPackTopVerticalGapM ?? Infinity, clearance);
                };
                const points = Array.from({ length: vertices.count }, (_, i) => {
                  const vertex = new T.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(unit);
                  checkPoint(vertex);
                  return vertex;
                });
                const indices = g.index;
                for (let i = 0; i < (indices?.count ?? vertices.count); i += 3) {
                  tri.a = points[indices ? indices.getX(i) : i];
                  tri.b = points[indices ? indices.getX(i + 1) : i + 1];
                  tri.c = points[indices ? indices.getX(i + 2) : i + 2];
                  checkPoint(tri.getMidpoint(nearest));
                }
                continue;
              }
              if (!c.radii) {
                const a = new T.Vector3(...c.a),
                  b = new T.Vector3(...c.b),
                  rad = c.radius,
                  margin = 0.001;
                const collar = new T.Box3().setFromPoints([a, b]).expandByScalar(rad + margin);
                const matrix = new T.Matrix4().multiplyMatrices(
                  c.node.matrixWorld.clone().invert(),
                  mesh.matrixWorld,
                );
                if (!g.boundingBox.clone().applyMatrix4(matrix).intersectsBox(collar)) continue;
                const p = Array.from({ length: vertices.count }, (_, i) =>
                  new T.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(matrix),
                );
                const idx = g.index,
                  count = idx?.count ?? vertices.count;
                const box = new T.Box3();
                c.node.getWorldScale(colliderScale);
                const minScale = Math.min(colliderScale.x, colliderScale.y, colliderScale.z);
                for (let j = 0; j < count; j += 3) {
                  const points = [0, 1, 2].map((d) => p[idx ? idx.getX(j + d) : j + d]);
                  if (!box.setFromPoints(points).intersectsBox(collar)) continue;
                  const dist = segmentTriangleGap(a, b, new T.Triangle(...points));
                  const gap = (dist - rad) * minScale;
                  report.minCapsuleSurfaceGapM = Math.min(report.minCapsuleSurfaceGapM ?? Infinity, gap);
                }
                continue;
              }
              unit.copy(c.node.matrixWorld).invert().multiply(mesh.matrixWorld);
              unit.premultiply(new T.Matrix4().makeTranslation(-c.center[0], -c.center[1], -c.center[2]));
              unit.premultiply(new T.Matrix4().makeScale(1 / c.radii[0], 1 / c.radii[1], 1 / c.radii[2]));
              const box = g.boundingBox.clone().applyMatrix4(unit);
              if (box.distanceToPoint(origin) > 1.35) continue;
              const points = Array.from({ length: vertices.count }, (_, i) =>
                new T.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(unit),
              );
              const idx = g.index,
                count = idx?.count ?? vertices.count;
              for (let i = 0; i < count; i += 3) {
                tri.a = points[idx ? idx.getX(i) : i];
                tri.b = points[idx ? idx.getX(i + 1) : i + 1];
                tri.c = points[idx ? idx.getX(i + 2) : i + 2];
                tri.closestPointToPoint(origin, nearest);
                const r = nearest.length();
                if (!Number.isFinite(r)) continue; // collapsed end-cap triangle
                report.triangles++;
                report.minimumUnitRadius = Math.min(report.minimumUnitRadius, r);
                if (r >= 1) continue;
                const scale = c.node.getWorldScale(new T.Vector3());
                const depth = (1 - r) * Math.max(...c.radii) * Math.max(scale.x, scale.y, scale.z);
                const name = c.role + ' / ' + c.node.name;
                if (depth > (report.colliderPenetrations[name]?.depthM ?? 0))
                  report.colliderPenetrations[name] = { depthM: depth, pose: label, lock: mesh.parent.name };
                if (depth > report.worstDepthM) {
                  report.worstDepthM = depth;
                  report.worstPose = label;
                  report.collider = c.node.name;
                  report.colliderRole = c.role;
                  report.lock = mesh.parent.name;
                }
              }
            }
          }
        },
      };
    }

    function clothInspector(api) {
      const vec = new T.Vector3(),
        axis = new T.Vector3(),
        closest = new T.Vector3();
      const reports = {};
      const legs = ['thighL', 'thighR', 'shinL', 'shinR'].flatMap((j) =>
        rig[j].children.filter((m) => m.isMesh),
      );
      check(api.hoodie?.isMesh && api.cargo?.isMesh, 'missing rendered hoodie or cargo');
      check(
        partsFor('torso').length && partsFor('legs').length,
        'missing anatomical torso or leg surfaces',
      );
      for (const key of ['hoodieHem', 'jacket']) {
        const mesh = api[key];
        const { rest, columns: n, freeRows } = mesh.geometry.userData;
        if (
          !Number.isInteger(n) ||
          n < 3 ||
          !Number.isInteger(freeRows) ||
          freeRows < 1 ||
          n * freeRows >= mesh.geometry.attributes.position.count
        )
          throw Error('Missing physical free rows and pinned edge on ' + key);
        const garmentScale = mesh.getWorldScale(new T.Vector3()),
          minScale = Math.min(...garmentScale.toArray());
        const count = freeRows * n;
        const frames = [],
          shell = { minCapsuleGapM: Infinity, minBodyGapM: null, positionsTested: 0 };
        const traces = [];
        // The free hem moves outside the pants. The open lower coat also
        // sweeps the hoodie and its rib-knit hem, over the same body regions.
        const supportMeshes = [...legs, api.cargo];
        if (key === 'jacket') supportMeshes.push(api.hoodie, api.hoodieHem);
        const regions = ['legs', 'torso'].flatMap((region) =>
          partsFor(region)
            .filter((part) => part.mesh === api.body)
            .map((p) => [p.mesh, p.regions[region]]),
        );
        shell.actualSurfaces = regions.length + supportMeshes.length;
        shell.freeVerticesPerPose = count;
        shell.supports = supportMeshes.map((m) => m.name || m.parent.name);
        check(
          api[key + 'Capsules']?.length && api[key + 'Body']?.length >= 2,
          key + ' posed collision supports',
        );
        shell.intersections = {};
        const panelRows = [];
        for (const [name, front] of [
          ['front', true],
          ['back', false],
        ]) {
          const indices = Array.from({ length: n }, (_, i) => i).filter((i) =>
            front ? rest[i * 3 + 2] > 0.025 : rest[i * 3 + 2] < -0.025,
          );
          if (!indices.length) throw Error('No cloth ' + name + ' vertices');
          panelRows.push({ name, indices, means: [] });
        }
        const radial = (p, body) => {
          let j = 1;
          while (j < body.length - 1 && p.y > body[j][0]) j++;
          const [lo, hi] = [body[j - 1], body[j]],
            t = T.MathUtils.clamp((p.y - lo[0]) / (hi[0] - lo[0]), 0, 1);
          const rx = T.MathUtils.lerp(lo[1], hi[1], t),
            rz = T.MathUtils.lerp(lo[2], hi[2], t),
            cz = T.MathUtils.lerp(lo[3], hi[3], t);
          return (Math.hypot(p.x / rx, (p.z - cz) / rz) - 1) * Math.min(rx, rz) * minScale;
        };
        reports[key] = {
          shell,
          traces,
          frames,
          panelRows,
          replayError(frame) {
            const prior = frames[frame],
              pos = mesh.geometry.attributes.position;
            let worst = 0;
            for (let i = 0; i < count; i++) {
              const j = 3 * i;
              const dx = (pos.getX(i) - rest[j]) * garmentScale.x - prior[j];
              const dy = (pos.getY(i) - rest[j + 1]) * garmentScale.y - prior[j + 1];
              const dz = (pos.getZ(i) - rest[j + 2]) * garmentScale.z - prior[j + 2];
              worst = Math.max(worst, Math.hypot(dx, dy, dz));
            }
            return worst;
          },
          sample(label, exact) {
            const attr = mesh.geometry.attributes.position;
            let x = 0,
              left = 0,
              right = 0,
              peak = 0;
            const state = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
              const k = 3 * i;
              vec.fromBufferAttribute(attr, i);
              const dx = (vec.x - rest[k]) * garmentScale.x,
                dy = (vec.y - rest[k + 1]) * garmentScale.y,
                dz = (vec.z - rest[k + 2]) * garmentScale.z;
              state[k] = dx;
              state[k + 1] = dy;
              state[k + 2] = dz;
              peak = Math.max(peak, Math.hypot(dx, dy, dz));
              if (i < n) {
                x += dx;
                if (rest[k] < 0) left += dz;
                else right += dz;
              }
              for (const cap of api[key + 'Capsules']) {
                axis.subVectors(cap.b, cap.a);
                const t = T.MathUtils.clamp(
                  closest.subVectors(vec, cap.a).dot(axis) / axis.lengthSq(),
                  0,
                  1,
                );
                closest.copy(cap.a).addScaledVector(axis, t);
                const gap =
                  (vec.distanceTo(closest) - T.MathUtils.lerp(cap.radiusA, cap.radiusB, t)) * minScale;
                if (gap < shell.minCapsuleGapM) {
                  shell.minCapsuleGapM = gap;
                  shell.tightestCapsule = {
                    frame: label,
                    vertex: i,
                    collider: api[key + 'Capsules'].indexOf(cap),
                  };
                }
              }
              shell.minBodyGapM = Math.min(shell.minBodyGapM ?? Infinity, radial(vec, api[key + 'Body']));
              shell.positionsTested++;
            }
            if (exact) {
              mesh.geometry.computeBoundingBox();
              const crossing = surfaceCrossing(mesh, count, [
                ...supportMeshes.map(rigidSurface),
                ...regions.map(([m, ids]) => rigidSurface(m, ids)),
              ]);
              if (crossing) shell.intersections[label] = crossing;
            }
            for (const panel of panelRows) {
              const mean = new T.Vector3();
              for (const i of panel.indices) mean.add(closest.fromArray(state, i * 3));
              panel.means.push(mean.divideScalar(panel.indices.length));
            }
            frames.push(state);
            traces.push([x / n, ((right - left) * 2) / n, peak]);
          },
        };
      }
      return reports;
    }

    function driveSecondaryTrial(i) {
      input.z = i >= 6 && i < 313 ? 1 : 0;
      input.x = 0;
      input.run = i >= 76;
      input.jump = i === 194;
      input.roll = i === 261;
      if (i >= 150 && i < 194) {
        input.x = Math.sin((i - 150) * 0.06);
        input.z = Math.cos((i - 150) * 0.06);
      }
    }

    function inspectGarmentPoses(hair) {
      for (const id of garmentPoses) {
        poseGarment(rig, controller, animate, id);
        poseId++;
        hair.sampleTips(false);
        hair.inspect(id);
      }
    }

    function checkHairGeometry(report, label = '') {
      const verify = (condition, message) => check(condition, label + message);
      verify(report.triangles > 0 && report.chains > 1, 'hair surface coverage');
      verify(report.worstDepthM < 0.0002, 'hair ellipsoid clearance');
      verify(
        ['head', 'neck', 'shoulder', 'back', 'collar'].every((role) => report.colliderRoles.includes(role)),
        'complete scalp-to-upper-back collider coverage',
      );
      verify(
        Object.values(report.tipColliders).every((gap) => gap >= -0.0001),
        'physical tip sphere overlaps body collider',
      );
      if (report.colliderRoles.includes('packTop'))
        verify(Number.isFinite(report.minPackTopVerticalGapM) && report.minPackTopVerticalGapM >= -0.0002, 'hair triangles cross backpack upper support');
      verify((report.minCapsuleSurfaceGapM ?? 0) >= -0.0002, 'hair triangles penetrate collision capsule');
      verify(
        !report.layerContactPoses,
        'rendered strands intersect the anatomical body or layered outerwear',
      );
      verify(
        report.realCollarLayers > 0 && report.realTipMinGapM >= -0.0001,
        'physical hair tip sphere intersects rendered body or garment',
      );
      verify(!report.faceContactPoses, 'hair triangles intersect the visible anatomical face');
      verify(!report.sleeveContactPoses, 'hair triangles intersect actual sleeve triangles');
    }

    function inspectHairAtFrame(frame, i) {
      // The raised sleeve sweeps quickly across the hair during a tuck.
      return i % 8 === 0 || i === 472 || (frame.state === 'roll' && i % 2 === 0);
    }

    function dynamics() {
      controller.reset(-17, -14);
      Object.assign(input, { x: 0, z: 0, run: false, jump: false, roll: false, emote: false });
      for (let f = 0; f < 60; f++) pose();
      const api = rig.secondary?.[name];
      if (!api) {
        check(false, 'missing rendered accessory registration');
        return;
      }
      const keys = {
        sippy: ['pack', 'drawcord'],
        roma: ['bag'],
        hummin: ['apron', 'antenna', 'tools', 'scarf'],
      }[name];
      // Pouches and hardware also attach to Hummin's skirt hinge. Sample the
      // denim pattern itself to measure the apron, and the knit mesh for the scarf.
      const surfaces = rig.garments.surfaces;
      const patterns = name === 'hummin' ? { apron: surfaces.apronSkirt, scarf: surfaces.scarfTail } : {};
      const markers = keys.map((k) => freeEdge(api[k], k, patterns[k])),
        histories = markers.map(() => []);
      const hair = rig.hair ? hairInspector(rig.hair) : null;
      if (name !== 'hummin') check(!!hair, 'missing hair guides');
      const cloth = name === 'roma' ? clothInspector(api) : null;
      let stop;
      const idleBones = [],
        nodes = [rig.root, ...rig.joints];
      function rememberBones(frame) {
        if (!cloth || frame.speed >= 0.02) return;
        const pose = new Float64Array(nodes.length * 10);
        nodes.forEach((n, k) => {
          n.position.toArray(pose, k * 10);
          n.quaternion.toArray(pose, k * 10 + 3);
          n.scale.toArray(pose, k * 10 + 7);
        });
        idleBones.push({ pose, frame: { ...frame } });
      }
      function clothReplay(item, time) {
        nodes.forEach((n, k) => {
          n.position.fromArray(item.pose, k * 10);
          n.quaternion.fromArray(item.pose, k * 10 + 3);
          n.scale.fromArray(item.pose, k * 10 + 7);
        });
        rig.root.updateMatrixWorld(true);
        animate({ ...item.frame, time });
        rig.root.updateMatrixWorld(true);
      }
      const phases = {};
      for (let i = 0; i < 473; i++) {
        driveSecondaryTrial(i);
        const frame = pose(i >= 313 ? rememberBones : undefined);
        if (i >= 313 && controller.frame.speed < 0.02 && stop == null) stop = i;
        if (i % 8 === 0 || i === 472) {
          phases[frame.state] = (phases[frame.state] ?? 0) + 1;
        }
        markers.forEach((m, j) => histories[j].push(m.sample()));
        if (cloth) for (const item of Object.values(cloth)) item.sample(i, i % 8 === 0 || i === 472);
        if (hair) {
          hair.sampleTips();
          if (stop != null) hair.rememberIdle(frame);
        }
        if (hair && inspectHairAtFrame(frame, i)) hair.inspect(i);
      }
      const report = (result.secondary = { sampledPoses: phases, accessories: {} });
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k],
          metrics = response(histories[k], stop);
        metrics.witness = { mesh: markers[k].mesh, vertex: markers[k].vertex };
        report.accessories[key] = metrics;
        // Engineering visibility/damping checks; the reference has no measured
        // accessory amplitude. Quantify these bounds separately from its gait speeds.
        check(metrics.peakM > 0.001 && metrics.peakM < 0.3, key + ' visible bounded secondary motion');
        if (key === 'bag') {
          const restZ = histories[k][0].z;
          const rearward = (a, b) => restZ - Math.min(...histories[k].slice(a, b).map((p) => p.z));
          metrics.runTrailM = rearward(76, 149);
          metrics.jumpTrailM = rearward(194, 248);
          check(metrics.runRangeM[1] > 0.004, key + ' steady-run vertical bounce exceeds 4 mm');
          if (name === 'roma')
            check(
              metrics.runTrailM > 0.001 && metrics.jumpTrailM > 0.001,
              'cross-body bag trails on run and jump',
            );
        }
        check(metrics.settleS < 1.65, key + ' settle to 1.5 mm after stop');
      }
      if (hair) {
        hair.finish(stop);
        inspectGarmentPoses(hair);
        report.hair = hair.report;
        checkHairGeometry(hair.report);
        check(hair.report.materialTipPeakM > 0.001, 'rendered hair tips react to motion');
        check(hair.report.materialTipSettleS < 1.65, 'rendered hair tips settle within 1.5 mm');
      }
      if (cloth) {
        report.cloth = {};
        const error = Object.fromEntries(Object.keys(cloth).map((id) => [id, []]));
        let clock = 0;
        for (let j = idleBones.length - 1; j >= 0; j--) clothReplay(idleBones[j], (clock += FIXED_DT));
        idleBones.forEach((item, i) => {
          clothReplay(item, (clock += FIXED_DT));
          for (const [key, garment] of Object.entries(cloth))
            error[key].push(garment.replayError(stop + i));
        });
        for (const [key, { traces, shell, panelRows }] of Object.entries(cloth)) {
          const range = (col) => {
            const v = traces.slice(35, 194).map((p) => p[col]);
            return Math.max(...v) - Math.min(...v);
          };
          const metrics = (report.cloth[key] = {
            ...shell,
            lateralSwayM: range(0),
            differentialSwingM: range(1),
            peakFromTailoredRestM: Math.max(...traces.map((p) => p[2])),
            settleS: (error[key].findLastIndex((e) => e > 0.002) + 1) * FIXED_DT,
            settleReference: 'same recorded idle bones and breathing, after idle warmup',
          });
          metrics.panels = {};
          for (const { name, means } of panelRows) {
            const extent = new T.Box3().setFromPoints(means.slice(30, 194)).getSize(new T.Vector3());
            metrics.panels[name] = { rangeM: extent.toArray(), centroidExcursionM: extent.length() };
            check(extent.length() > 0.002, key + ' ' + name + ' panel responds');
          }
          check(
            !Object.keys(metrics.intersections).length,
            key + ' cloth penetrates the rendered anatomy or an inner garment',
          );
          check(
            metrics.minCapsuleGapM >= -0.0002 && (metrics.minBodyGapM ?? 0) >= -0.0002,
            key + ' cloth clearance',
          );
          check(
            metrics.lateralSwayM > 0.001 && metrics.differentialSwingM > 0.001,
            key + ' sway and asymmetric swing',
          );
          check(metrics.settleS < 1.65, key + ' free vertices settle to 2 mm');
        }
      }
    }
    dynamics();
    checkFlorence({ rig, controller, input, animate, name, result, check });
    if (name === 'roma') auditFilmMotion('high');

    result.props = {};
    for (const prop of PROPS) {
      controller.reset(prop.x, prop.z - prop.depth / 2 - 1.0);
      Object.assign(input, { x: 0, z: 1, run: false, jump: false, roll: false, emote: false });
      let top = 0;
      for (let f = 0; f < 320; f++) {
        pose();
        top = Math.max(top, rig.root.position.y);
      }
      const endZ = rig.root.position.z;
      result.props[prop.kind] = { highestRootM: top, endZ };
      if (prop.kind === 'crate') {
        const faceZ = prop.z - prop.depth / 2 - controller.capsuleRadius;
        check(Math.abs(endZ - faceZ) < 0.01 && top < 0.01, 'blocked by crate');
      } else {
        check(
          endZ > prop.z + prop.depth / 2 && Math.abs(top - prop.height) < 0.01,
          'traversed ' + prop.kind,
        );
      }
    }
    if (mobileHair && rig.hair) measureMobileHair();

    function measureMobileHair() {
      // A coarser index set changes triangle chords. Rebuild the spatial
      // acceleration structures from the active buffers for this trial.
      setModelDetail(rig.root, 'mobile');
      vertexCache = new WeakMap();
      surfaceCache = new WeakMap();
      controller.reset(-17, -14);
      Object.assign(input, { x: 0, z: 0, run: false, jump: false, roll: false, emote: false });
      for (let f = 0; f < 60; f++) pose();
      const hair = hairInspector(rig.hair);
      for (let i = 0; i < 473; i++) {
        driveSecondaryTrial(i);
        const frame = pose();
        hair.sampleTips(false);
        if (inspectHairAtFrame(frame, i)) hair.inspect(i);
      }
      inspectGarmentPoses(hair);
      checkHairGeometry(hair.report, 'Mobile ');
      result.secondary ??= {};
      result.secondary.mobileHair = hair.report;
      if (name === 'roma') auditFilmMotion('mobile');
    }

    function auditFilmMotion(tier) {
      const film = measureStrandMotion(tier);
      result.secondary.filmStrandMotion ??= {};
      result.secondary.filmStrandMotion[tier] = film;
      check(film.fixedTicks === 1095 && film.edgesPerTick > 0, tier + ' full film strand coverage');
      // Engineering limits for a disappearing single-frame spike. The wave
      // is stationary, while the full sequence includes a rapid running tuck.
      check(film.all.vertexTravelM <= 0.10, tier + ' hair material travels at most 10 cm per fixed tick');
      check(film.all.edgeExtensionM <= 0.05, tier + ' a material edge stretches by at most 5 cm');
      check(film.wave.vertexTravelM <= 0.06, tier + ' wave hair travels at most 6 cm per fixed tick');
      check(film.wave.edgeExtensionM <= 0.035, tier + ' wave hair edge extension stays below 3.5 cm');
    }
  }
  return {
    reference: {
      source: 'https://x.com/soya_da_yoot/status/2123268369369514311',
      basis: 'Reference observations and dimensional targets documented in the Characters brief',
      walkMps: 1.13,
      runMps: 3.89,
      walkBobM: [0.03, 0.04],
      runLeanDeg: [15, 20],
    },
    engineeringBounds: {
      stanceSlipM: 0.02,
      touchingToleranceM: 0.0015,
      turn: 'more bank with speed and tighter radius',
      accessorySettleDistanceM: 0.0015,
      clothSettleDistanceM: 0.002,
      settleTimeS: 1.65,
      hairPenetrationTolM: 0.0002,
      steadyRunBagBounceMinM: 0.004,
      clothFrontAndBackMinM: 0.002,
    },
    results,
    failures,
  };
}

if (process.argv[2] === '--speed') {
  process.argv.splice(2, 1);
  await import('./check-heros-motion.mjs');
} else {
  const onlyMobile = process.env.CHARACTERS_HAIR_MOBILE === 'only';
  const mobileHair = onlyMobile || process.env.CHARACTERS_HAIR_MOBILE === '1';
  // The 84-strand character now traverses the actual coat and skin triangle
  // trees at every sampled pose. Give a full cast and two-tier pass time to
  // finish on the same software-rendered hosts as the visual acceptance tests.
  const perHeroMinutes = onlyMobile ? 25 : 45;
  const minutes = (process.argv[2] ? 1 : 3) * perHeroMinutes;
  const designs = {};
  for (const name of ['sippy', 'roma', 'hummin']) {
    const spec = JSON.parse(
      await readFile(new URL('./blueprints/' + name + '.json', import.meta.url), 'utf8'),
    );
    designs[name] = { heightM: spec.heightM, chin: spec.landmarks.chin };
  }
  await runCharacterProbe(measure, { mobileHair, onlyMobile, designs, timeoutMs: minutes * 60000 });
}
