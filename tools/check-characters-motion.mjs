// Node 22+, Chromium and three@0.170.0. Example:
// THREE_ROOT=/path/to/three CHROME=/usr/bin/chromium node tools/check-characters-motion.mjs
// Pass sippy, roma or hummin as an optional argument to isolate a single model.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

// Executed as an ES module inside Chromium so procedural CanvasTextures and
// BufferGeometry are identical to the production models. WebGL is unnecessary.
async function measure(onlyHero) {
  const T = await import('three');
  const { createActor } = await import('/characters/rig.js');
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
    function pose() {
      const frame = controller.step(FIXED_DT, input);
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
          const y = m[1] * vertices.getX(i) + m[5] * vertices.getY(i) + m[9] * vertices.getZ(i) + m[13];
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
    function indexShells() {
      cells.clear();
      chestBox.makeEmpty();
      chestInverse.copy(rig.chest.matrixWorld).invert();
      for (const mesh of torsos) {
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        const g = mesh.geometry,
          p = g.getAttribute('position'),
          count = g.index?.count ?? p.count;
        for (let i = 0; i < count; i += 3) {
          const vertices = [0, 1, 2].map((d) =>
            new T.Vector3()
              .fromBufferAttribute(p, g.index ? g.index.getX(i + d) : i + d)
              .applyMatrix4(toChest),
          );
          vertices.shell = mesh.material.color.getHexString();
          const box = new T.Box3().setFromPoints(vertices);
          chestBox.union(box);
          for (let x = Math.floor(box.min.x / cellSize); x <= Math.floor(box.max.x / cellSize); x++)
            for (let y = Math.floor(box.min.y / cellSize); y <= Math.floor(box.max.y / cellSize); y++)
              for (let z = Math.floor(box.min.z / cellSize); z <= Math.floor(box.max.z / cellSize); z++) {
                const id = key(x, y, z);
                if (!cells.has(id)) cells.set(id, []);
                cells.get(id).push(vertices);
              }
        }
      }
    }
    indexShells();
    const cloth = torsos.some((m) => m.geometry.getAttribute('position').usage === T.DynamicDrawUsage);
    const edgeRay = new T.Ray(),
      box = new T.Box3(),
      hit = new T.Vector3(),
      dir = new T.Vector3();
    function piercingEdge(a, b) {
      box.setFromPoints([a, b]);
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
    pose();
    const lineup = bounds();
    const result = (results[name] = { heightM: lineup.max - lineup.min, phases: {} });
    function check(ok, message) {
      if (!ok) failures.push(name + ' ' + message);
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
          w.fromBufferAttribute(verts, i).applyMatrix4(mesh.matrixWorld);
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
      const up = new T.Vector3(),
        orientation = new T.Quaternion();
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
          up.set(0, 1, 0).applyQuaternion(rig.chest.getWorldQuaternion(orientation));
          bank += T.MathUtils.radToDeg(Math.atan2(up.x * Math.cos(heading) - up.z * Math.sin(heading), up.y));
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
    function freeEdge(group) {
      const inverse = group.matrixWorld.clone().invert(),
        q = new T.Vector3();
      const parentScale = group.parent.getWorldScale(new T.Vector3());
      let far = -1,
        anchor = null,
        index = 0;
      group.traverseVisible((m) => {
        if (!m.isMesh) return;
        const local = new T.Matrix4().multiplyMatrices(inverse, m.matrixWorld),
          p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          q.fromBufferAttribute(p, i).applyMatrix4(local);
          if (q.lengthSq() > far) {
            far = q.lengthSq();
            anchor = m;
            index = i;
          }
        }
      });
      if (!anchor) throw Error('Missing accessory geometry');
      return () =>
        q
          .fromBufferAttribute(anchor.geometry.attributes.position, index)
          .applyMatrix4(anchor.matrixWorld)
          .applyMatrix4(inverse.copy(group.parent.matrixWorld).invert())
          .multiply(parentScale)
          .clone();
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

    // Build a local-space BVH once for each rigid skin, bodice or sleeve mesh.
    // Query posed cloth triangles in that mesh's space. Test both sets of
    // triangle edges so a small body triangle piercing a wide cloth panel is found.
    function rigidSurface(mesh) {
      const g = mesh.geometry,
        p = g.attributes.position,
        idx = g.index,
        count = idx?.count ?? p.count;
      const corners = Array.from({ length: p.count }, (_, i) => new T.Vector3().fromBufferAttribute(p, i));
      const triangles = [];
      for (let i = 0; i < count; i += 3) {
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
      return { mesh, tree: partition(triangles) };
    }
    const surfaceRay = new T.Ray(),
      along = new T.Vector3(),
      pierce = new T.Vector3(),
      transform = new T.Matrix4(),
      queryBox = new T.Box3();
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
        const positions = Array.from({ length: count }, (_, i) =>
          new T.Vector3().fromBufferAttribute(p, i).applyMatrix4(transform),
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
              target: mesh.parent.name,
              material: mesh.material.color.getHexString(),
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
        const cap = system.colliders.find((c) => c.node === joint);
        if (!cap) {
          check(false, joint.name + ' hair collider absent');
          continue;
        }
        // Anatomical proximal sleeve band measured in joint units: upper 3 cm
        // below the shoulder pivot through the rounded crown of the sleeve.
        const inverse = joint.matrixWorld.clone().invert(),
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
        reports.push({ joint: joint.name, vertices, maxUnitRadius: largest });
        check(vertices > 0 && largest <= 1.001, joint.name + ' shoulder cap outside hair collider');
      }
      return reports;
    }

    // Evaluate closest points of posed hair triangles in each ellipsoid's unit
    // sphere; a vertex-only check misses a penetrating triangle interior.
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
        tipPeakM: 0,
      };
      report.shoulderCapCoverage = sleeveCaps(system);
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
      const sleeveTargets = [rig.upperArmL, rig.upperArmR].flatMap((j) =>
        j.children.filter((m) => m.isMesh).map(rigidSurface),
      );
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
      const surfaces = system.chains.flatMap((c) => c.surfaces.map((s) => s.mesh));
      return {
        report,
        sampleTips() {
          for (const p of tipPaths) p.frames.push(p.read());
        },
        finish(stop) {
          const all = tipPaths.map((p) => response(p.frames, stop));
          report.materialTipPeakM = Math.max(...all.map((p) => p.peakM));
          report.materialTipSettleS = Math.max(...all.map((p) => p.settleS));
          report.materialTipResidualAfter1sM = Math.max(...all.map((p) => p.residualAfter1sM));
        },
        inspect(label) {
          report.poses++;
          faceInverse.copy(skinSpace.matrixWorld).invert();
          for (const chain of system.chains) {
            const delta = chain.nodes.at(-1).distanceTo(chain.rest.at(-1)) * height;
            report.tipPeakM = Math.max(report.tipPeakM, delta);
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
            for (const c of system.colliders) {
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
                if (depth > report.worstDepthM) {
                  report.worstDepthM = depth;
                  report.worstPose = label;
                  report.collider = c.node.name;
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
      const bodyMaterials = new Set([legs[0].material, api.skirt.material]);
      const bodice = rig.chest.children.filter((m) => m.isMesh && bodyMaterials.has(m.material));
      check(bodice.length >= 2, 'missing rendered skin and bodice surfaces');
      const legTargets = legs.map(rigidSurface),
        bodyTargets = bodice.map(rigidSurface);
      for (const [key, n] of [
        ['skirt', 64],
        ['jacket', 41],
      ]) {
        const mesh = api[key],
          rest = mesh.geometry.userData.rest;
        const garmentScale = mesh.getWorldScale(new T.Vector3()),
          minScale = Math.min(...garmentScale.toArray());
        const count = key === 'skirt' ? 6 * n : 3 * n;
        const frames = [],
          shell = { minCapsuleGapM: Infinity, minBodyGapM: null, positionsTested: 0 };
        const traces = [];
        const targets = key === 'skirt' ? legTargets : [...bodyTargets, ...legTargets];
        shell.actualSurfaces = targets.length;
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
                const t = T.MathUtils.clamp(closest.subVectors(vec, cap.a).dot(axis) / axis.lengthSq(), 0, 1);
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
              if (key === 'jacket')
                shell.minBodyGapM = Math.min(shell.minBodyGapM ?? Infinity, radial(vec, api.jacketBody));
              shell.positionsTested++;
            }
            if (exact) {
              const crossing = surfaceCrossing(mesh, count, targets);
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

    function dynamics() {
      controller.reset(-17, -14);
      Object.assign(input, { x: 0, z: 0, run: false, jump: false, roll: false, emote: false });
      for (let f = 0; f < 60; f++) pose();
      const api = rig.secondary?.[name];
      if (!api) {
        check(false, 'missing rendered accessory registration');
        return;
      }
      const keys = { sippy: ['bag', 'tail', 'chain'], roma: ['bag'], hummin: ['apron', 'antenna', 'tools'] }[
        name
      ];
      const markers = keys.map((k) => freeEdge(api[k])),
        histories = markers.map(() => []);
      const hair = rig.hair ? hairInspector(rig.hair) : null;
      if (name !== 'hummin') check(!!hair, 'missing hair guides');
      const cloth = name === 'roma' ? clothInspector(api) : null;
      let stop;
      const phases = {};
      for (let i = 0; i < 473; i++) {
        input.z = i >= 6 && i < 313 ? 1 : 0;
        input.x = 0;
        input.run = i >= 76;
        input.jump = i === 194;
        input.roll = i === 261;
        if (i >= 150 && i < 194) {
          input.x = Math.sin((i - 150) * 0.06);
          input.z = Math.cos((i - 150) * 0.06);
        }
        const frame = pose();
        if (i >= 313 && controller.frame.speed < 0.02 && stop == null) stop = i;
        if (i % 8 === 0 || i === 472) {
          phases[frame.state] = (phases[frame.state] ?? 0) + 1;
        }
        markers.forEach((m, j) => histories[j].push(m()));
        if (cloth) for (const item of Object.values(cloth)) item.sample(i, i % 8 === 0 || i === 472);
        if (hair) hair.sampleTips();
        if (hair && (i % 8 === 0 || i === 472)) hair.inspect(i);
      }
      const report = (result.secondary = { sampledPoses: phases, accessories: {} });
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k],
          metrics = response(histories[k], stop);
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
        report.hair = hair.report;
        check(hair.report.triangles > 0 && hair.report.chains > 1, 'hair surface coverage');
        check(hair.report.worstDepthM < 0.0002, 'hair ellipsoid clearance');
        check(!hair.report.faceContactPoses, 'hair triangles intersect the visible anatomical face');
        check(!hair.report.sleeveContactPoses, 'hair triangles intersect actual sleeve triangles');
        check(hair.report.materialTipPeakM > 0.001, 'rendered hair tips react to motion');
        check(hair.report.materialTipSettleS < 1.65, 'rendered hair tips settle within 1.5 mm');
      }
      if (cloth) {
        report.cloth = {};
        for (const [key, { frames, traces, shell, panelRows }] of Object.entries(cloth)) {
          const final = frames.at(-1),
            error = frames.map((arr) => {
              let max = 0;
              for (let k = 0; k < arr.length; k += 3)
                max = Math.max(
                  max,
                  Math.hypot(arr[k] - final[k], arr[k + 1] - final[k + 1], arr[k + 2] - final[k + 2]),
                );
              return max;
            });
          const range = (col) => {
            const v = traces.slice(35, 194).map((p) => p[col]);
            return Math.max(...v) - Math.min(...v);
          };
          const metrics = (report.cloth[key] = {
            ...shell,
            lateralSwayM: range(0),
            differentialSwingM: range(1),
            peakFromTailoredRestM: Math.max(...traces.map((p) => p[2])),
            settleS: (error.slice(stop).findLastIndex((e) => e > 0.002) + 1) * FIXED_DT,
          });
          metrics.panels = {};
          for (const { name, means } of panelRows) {
            const extent = new T.Box3().setFromPoints(means.slice(30, 194)).getSize(new T.Vector3());
            metrics.panels[name] = { rangeM: extent.toArray(), centroidExcursionM: extent.length() };
            check(extent.length() > 0.002, key + ' ' + name + ' panel responds');
          }
          check(
            !Object.keys(metrics.intersections).length,
            key + ' cloth penetrates rendered skin or bodice',
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
        check(endZ > prop.z + prop.depth / 2 && Math.abs(top - prop.height) < 0.01, 'traversed ' + prop.kind);
      }
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

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const three =
  process.env.THREE_ROOT || resolve(dirname(createRequire(import.meta.url).resolve('three')), '..');
if (JSON.parse(await readFile(join(three, 'package.json'), 'utf8')).version !== '0.170.0')
  throw Error('Expected three@0.170.0');
const onlyHero = process.argv[2];
if (onlyHero && !['sippy', 'roma', 'hummin'].includes(onlyHero))
  throw Error('Expected sippy, roma or hummin');
const page = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">try{const result=await (${measure.toString()})(${JSON.stringify(onlyHero ?? null)});await fetch('/result',{method:'POST',body:JSON.stringify(result)});}
catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({error:String(e.stack||e)})});}</script>`;
let finish;
const done = new Promise((resolve) => {
  finish = resolve;
});
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/result' && req.method === 'POST') {
      let data = '';
      for await (const chunk of req) data += chunk;
      const value = JSON.parse(data);
      res.end();
      finish(value);
      return;
    }
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(page);
      return;
    }
    let file;
    if (path.startsWith('/three/')) file = join(three, path.slice(7));
    else if (path.startsWith('/characters/')) file = join(docs, path);
    else {
      res.writeHead(404).end();
      return;
    }
    const data = await readFile(file);
    res.setHeader('Content-Type', 'application/javascript');
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
const profile = await mkdtemp(join(tmpdir(), 'characters-motion-'));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const chrome = spawn(
  process.env.CHROME || '/usr/bin/chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--user-data-dir=' + profile,
    'http://127.0.0.1:' + server.address().port + '/',
  ],
  { stdio: 'ignore' },
);
chrome.on('error', (e) => finish({ error: e.message }));
chrome.on('exit', (code) => finish({ error: 'Chrome exited before sending measurements (' + code + ')' }));
const timeout = setTimeout(() => finish({ error: 'Browser probe timeout' }), 600000);
try {
  const result = await done;
  console.log(JSON.stringify(result, null, 2));
  if (result.error || result.failures?.length) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  const closed = chrome.exitCode === null ? once(chrome, 'close') : Promise.resolve();
  chrome.kill();
  await closed;
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
