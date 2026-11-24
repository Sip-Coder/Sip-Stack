// Node 22.15+. THREE_ROOT=/path/to/three@0.170.0 node tools/check-heros-motion.mjs [hero]
// The speed rigs have different topology from PR #16. See tools/heros-checks.md.
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const directory = resolve(process.env.THREE_ROOT);
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  if (manifest.version !== '0.170.0') throw Error('Expected three@0.170.0');
  registerHooks({
    resolve(specifier, context, next) {
      const entry =
        specifier === 'three'
          ? 'build/three.module.js'
          : specifier.startsWith('three/addons/')
            ? 'examples/jsm/' + specifier.slice(13)
            : null;
      return entry
        ? { url: pathToFileURL(resolve(directory, entry)).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const T = await import('three');
if (T.REVISION !== '170') throw Error('Expected three@0.170.0');
const { createActor } = await import('../docs/characters/rig.js');
const { loadAvatar } = await import('../docs/characters/avatar-builder.js');
const { createController, FIXED_DT, PROPS } = await import('../docs/characters/motion.js');
const { optimizeCharacter } = await import('../docs/characters/render-batches.js');
const { setModelDetail } = await import('../docs/characters/material-detail.js');
const { names, heights } = await import('../docs/characters/ui.js');
const requested = process.argv.slice(2);
if (requested.some((name) => !names.includes(name))) throw Error('Expected sippy, roma or hummin');
const failures = [],
  results = [];
const point = new T.Vector3(),
  toLocal = new T.Matrix4(),
  inverse = new T.Matrix4();
const neutral = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };

function sole(ankle) {
  const points = [],
    sections = [],
    unique = new Map();
  inverse.copy(ankle.matrixWorld).invert();
  ankle.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    toLocal.multiplyMatrices(inverse, mesh.matrixWorld);
    const vertices = [];
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      const v = mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(toLocal);
      vertices.push(v);
      unique.set([v.x, v.y, v.z].map((x) => Math.round(x * 1e7)).join('/'), v);
    }
    sections.push({ vertices, index: mesh.geometry.index?.array });
  });
  let ymin = Infinity;
  for (const p of unique.values()) ymin = Math.min(ymin, p.y);
  for (const p of unique.values()) if (p.y <= ymin + 0.045) points.push(p);
  points.sort((a, b) => a.z - b.z);
  if (points.length < 3) throw Error('Missing visible sole on ' + ankle.name);
  const back = points[0].z,
    span = points.at(-1).z - back,
    middle = [];
  for (const { vertices, index } of sections) {
    const count = index?.length ?? vertices.length;
    for (let i = 0; i < count; i += 3)
      for (let k = 0; k < 3; k++) {
        const a = vertices[index ? index[i + k] : i + k],
          j = i + ((k + 1) % 3),
          b = vertices[index ? index[j] : j];
        for (const f of [0.35, 0.5, 0.65]) {
          const z = back + span * f;
          if ((a.z - z) * (b.z - z) > 0 || Math.abs(b.z - a.z) < 1e-10) continue;
          const p = a.clone().lerp(b, (z - a.z) / (b.z - a.z));
          if (p.y < ymin + 0.045) middle.push(p);
        }
      }
  }
  if (!middle.length) throw Error('No physical midsole triangle cut on ' + ankle.name);
  return {
    points,
    middle,
    back,
    span,
    starts: points.map(() => new T.Vector3()),
    locked: new Uint8Array(points.length),
  };
}

function fullBounds(root) {
  let min = Infinity,
    max = -Infinity,
    mesh = '';
  root.traverseVisible((node) => {
    if (!node.isMesh) return;
    const p = node.geometry.attributes.position,
      m = node.matrixWorld.elements;
    for (let i = 0; i < p.count; i++) {
      const y =
        node.isSkinnedMesh || node.morphTargetInfluences?.some(Boolean)
          ? node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).y
          : m[1] * p.getX(i) + m[5] * p.getY(i) + m[9] * p.getZ(i) + m[13];
      if (y < min) {
        min = y;
        mesh = node.name || node.parent.name;
      }
      max = Math.max(max, y);
    }
  });
  return { min, max, mesh };
}

function tipOf(node) {
  if (!node) throw Error('Missing expected guide or gesture joint');
  inverse.copy(node.matrixWorld).invert();
  let far = -1,
    tip;
  node.traverseVisible((m) => {
    if (!m.isMesh) return;
    toLocal.multiplyMatrices(inverse, m.matrixWorld);
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      const d = m.getVertexPosition(i, point).applyMatrix4(toLocal).lengthSq();
      if (d > far) {
        far = d;
        tip = { mesh: m, index: i };
      }
    }
  });
  if (!tip) throw Error('Guide has no rendered geometry: ' + node.name);
  return tip;
}
function relativeTip(tip, frame) {
  return tip.mesh
    .getVertexPosition(tip.index, new T.Vector3())
    .applyMatrix4(tip.mesh.matrixWorld)
    .applyMatrix4(inverse.copy(frame.matrixWorld).invert());
}
async function measure(name, tier) {
  const build = await loadAvatar(name, tier);
  const height = heights[names.indexOf(name)],
    rig = createActor(name, height);
  const pose = build(rig),
    ctrl = createController(rig);
  optimizeCharacter(rig);
  setModelDetail(rig.root, tier);
  // Synchronous fixed-tick playback begins after the same optional update
  // module that a player's first moving frame requests is ready.
  if (!await rig.loadSecondary()) throw Error('Secondary motion did not load for ' + name);
  const check = (ok, msg) => {
    if (!ok) failures.push(name + '/' + tier + ': ' + msg);
  };
  function tick(input) {
    const f = ctrl.step(FIXED_DT, input);
    pose(f);
    ctrl.finishPose();
    rig.root.updateMatrixWorld(true);
    return f;
  }
  function reset() {
    ctrl.reset(-10, 0);
    for (let i = 0; i < 15; i++) tick(neutral);
  }
  reset();
  const standing = fullBounds(rig.root);
  const standingHeightM = standing.max - standing.min;
  let sourceHeadHeightM = standingHeightM;
  const assembly = rig.headAssembly;
  if (assembly) {
    // Keep the original stature tolerance while measuring the approved
    // head-only change independently of the body and its motion.
    const offset = assembly.position.clone(), scale = assembly.scale.x;
    assembly.position.set(0, 0, 0);
    assembly.scale.setScalar(1);
    rig.root.updateMatrixWorld(true);
    const natural = fullBounds(rig.root);
    sourceHeadHeightM = natural.max - natural.min;
    assembly.position.copy(offset);
    assembly.scale.setScalar(scale);
    rig.root.updateMatrixWorld(true);
  }
  check(Math.abs(sourceHeadHeightM / height - 1) < 0.02, 'standing height at source head scale');
  // Monitor the thresholds from the #16 locomotion trials against the actual
  // visible shoe geometry after the tier switch and production batching.
  const treads = ctrl.contacts.map((c) => sole(c.ankle));
  const gait = {};
  for (const action of ['walk', 'run', 'turn']) {
    reset();
    const state = treads.map((s) => {
      s.locked.fill(0);
      return { swing: false, seq: [] };
    });
    let slip = 0,
      planted = 0,
      speed = 0,
      min = Infinity,
      max = -Infinity;
    const contacts = [];
    for (let f = 0; f < 150; f++) {
      const input = { ...neutral, z: 1, run: action !== 'walk' };
      if (action === 'turn' && f > 45) {
        const a = (f - 45) * 0.048;
        input.x = Math.sin(a);
        input.z = Math.cos(a);
      }
      const x = rig.root.position.x,
        z = rig.root.position.z;
      tick(input);
      if (f >= 60) speed += Math.hypot(rig.root.position.x - x, rig.root.position.z - z) / FIXED_DT;
      let supported = Infinity;
      for (let k = 0; k < 2; k++) {
        const t = treads[k],
          c = ctrl.contacts[k],
          m = c.ankle.matrixWorld;
        let foot = Infinity,
          heel = Infinity,
          toe = Infinity;
        for (let j = 0; j < t.points.length; j++) {
          const v = t.points[j];
          point.copy(v).applyMatrix4(m);
          foot = Math.min(foot, point.y);
          if (v.z < t.back + t.span * 0.28) heel = Math.min(heel, point.y);
          if (v.z > t.back + t.span * 0.72) toe = Math.min(toe, point.y);
          if (c.planted && point.y <= 0.0015) {
            if (t.locked[j]) {
              planted++;
              slip = Math.max(slip, t.starts[j].distanceTo(point));
            } else t.starts[j].copy(point);
            t.locked[j] = 1;
          } else t.locked[j] = 0;
        }
        supported = Math.min(supported, foot);
        if (f > 28 && action !== 'turn') {
          const s = state[k];
          if (foot > 0.0005) {
            if (s.seq.length) {
              contacts.push(s.seq);
              s.seq = [];
            }
            s.swing = true;
          } else if (s.swing || s.seq.length) {
            const label = toe - heel > 0.003 ? 'heel' : heel - toe > 0.003 ? 'toe' : 'flat';
            if (s.seq.at(-1)?.label !== label) {
              const angle = T.MathUtils.radToDeg(Math.asin(point.set(0, 0, 1).transformDirection(m).y));
              const mid = Math.min(...t.middle.map((v) => point.copy(v).applyMatrix4(m).y));
              s.seq.push({ label, angle, mid });
            }
            s.swing = false;
          }
        }
      }
      min = Math.min(min, supported);
      max = Math.max(max, supported);
    }
    speed /= 90;
    check(planted > 25 && slip < 0.02, action + ' planted drift');
    check(min >= -0.0001 && max <= 0.01, action + ' actual tread ground contact');
    if (action !== 'turn') {
      const expected = action === 'walk' ? 1.13 : 3.89;
      check(Math.abs(speed - expected) < expected * 0.1, action + ' speed');
      check(contacts.length >= 3, action + ' complete touchdowns');
      for (const seq of contacts) {
        const labels = seq.map((p) => p.label).join(' ');
        check(
          action === 'walk' ? labels === 'heel flat toe' : labels.includes('flat toe'),
          action + ' contact order ' + labels,
        );
        check(
          action === 'walk' ? seq[0].angle > 9 : Math.abs(seq[0].angle) < 6,
          action + ' touchdown pitch',
        );
        if (action === 'run') check(seq[0].mid < 0.001, 'run midsole at touchdown');
      }
    }
    gait[action] = {
      speedMps: speed,
      loadedVertexSamples: planted,
      maxSlipM: slip,
      minFootM: min,
      maxSupportedM: max,
      touchdowns: contacts.length,
    };
  }
  function trajectory(speed, radius) {
    reset();
    const input = { ...neutral, run: speed > 2 };
    let bank = 0,
      pitch = 0,
      low = Infinity,
      high = -Infinity,
      n = 0;
    for (let i = 0; i < 200; i++) {
      const turnAngle = radius ? (speed * i * FIXED_DT) / radius : 0;
      input.x = Math.sin(turnAngle);
      input.z = Math.cos(turnAngle);
      const x = rig.root.position.x,
        z = rig.root.position.z;
      tick(input);
      if (i <= 65) continue;
      const heading = Math.atan2(rig.root.position.x - x, rig.root.position.z - z);
      const up = point.setFromMatrixColumn(rig.chest.matrixWorld, 1).normalize();
      bank += T.MathUtils.radToDeg(Math.atan2(up.x * Math.cos(heading) - up.z * Math.sin(heading), up.y));
      pitch += T.MathUtils.radToDeg(Math.atan2(up.x * Math.sin(heading) + up.z * Math.cos(heading), up.y));
      const y = rig.hips.matrixWorld.elements[13];
      low = Math.min(low, y);
      high = Math.max(high, y);
      n++;
    }
    return { bankDeg: bank / n, pitchDeg: pitch / n, bobM: high - low };
  }
  const turns = {
    walk: trajectory(1.13, 0),
    run: trajectory(3.89, 0),
    walkCurve: trajectory(1.13, 2.4),
    wide: trajectory(3.89, 4.8),
    tight: trajectory(3.89, 2.4),
    left: trajectory(3.89, -2.4),
  };
  check(turns.walk.bobM >= 0.0295 && turns.walk.bobM <= 0.0405, 'walk hip bob');
  check(turns.run.bobM > turns.walk.bobM + 0.003, 'run bob exceeds walk');
  check(turns.run.pitchDeg >= 15 && turns.run.pitchDeg <= 20, 'run forward lean');
  check(
    turns.tight.bankDeg > turns.wide.bankDeg + 1 &&
      turns.tight.bankDeg > turns.walkCurve.bankDeg + 1 &&
      turns.left.bankDeg < -1 &&
      Math.abs(turns.run.bankDeg) < 1.5,
    'inward bank varies with speed and radius',
  );
  reset();
  let apex = 0,
    land = 0,
    air = 0;
  for (let i = 0; i < 100; i++) {
    const f = tick({ ...neutral, jump: i === 8 });
    apex = Math.max(apex, rig.root.position.y);
    land += f.state === 'land';
    air += f.state === 'jump';
  }
  check(apex > 0.1 && land > 1 && air > 1, 'jump/landing');
  reset();
  let rollTicks = 0,
    low = Infinity,
    high = -Infinity,
    lowestSurface = '';
  for (let i = 0; i < 102; i++) {
    const f = tick({ ...neutral, run: true, z: 1, roll: i === 44 });
    if (f.state !== 'roll') continue;
    const b = fullBounds(rig.root);
    rollTicks++;
    if (b.min < low) {
      low = b.min;
      lowestSurface = b.mesh;
    }
    high = Math.max(high, b.min);
  }
  check(rollTicks > 10, 'roll transition');
  check(low >= -0.0001, 'rendered roll penetration: ' + low + ' m (' + lowestSurface + ')');
  check(high <= 0.01, 'unsupported roll: ' + high + ' m');
  reset();
  const hand = tipOf(name === 'hummin' ? rig.handR : rig.handL),
    rest = relativeTip(hand, rig.chest);
  let gesture = 0,
    emoteTicks = 0,
    waveReturn = 0;
  for (let i = 0; i < 155; i++) {
    const f = tick({ ...neutral, emote: i === 0 });
    emoteTicks += f.emote >= 0;
    waveReturn = relativeTip(hand, rig.chest).distanceTo(rest) * height;
    gesture = Math.max(gesture, waveReturn);
  }
  check(emoteTicks > 60 && gesture > 0.03 && waveReturn < 0.035, 'gesture moves visible hand and returns');
  reset();
  const guides = rig.groom
    ? rig.groom.bindings.map(({ mesh, points }) => {
      const uv = mesh.geometry.attributes.uv;
      const end = new T.Vector3(...points.at(-1));
      const toHead = new T.Matrix4().copy(rig.groom.head.matrixWorld).invert().multiply(mesh.matrixWorld);
      let index = -1, best = Infinity;
      for (let i = 0; i < uv.count; i++) {
        if (uv.getX(i) < 0.986) continue;
        const d = mesh.getVertexPosition(i, point).applyMatrix4(toHead).distanceToSquared(end);
        if (d < best) {
          best = d;
          index = i;
        }
      }
      if (index < 0) throw Error('Missing rendered tip for ' + mesh.name);
      return { node: mesh, tip: { mesh, index }, frame: rig.groom.head };
    }) : [rig.secondary.hummin.antenna].map(node => ({ node, tip: tipOf(node), frame: node.parent }));
  check(
    guides.length === (name === 'sippy' ? 3 : name === 'roma' ? 8 : 1),
    'missing animated guide geometry',
  );
  // Run the same clock twice, first at rest. Idle breathing and a groom's
  // authored idle sway remain active while acceleration-driven motion settles.
  const witness = guides.map((guide) => ({
    ...guide,
    baseline: [],
    max: 0,
    tail: 0,
    step: 0,
    previous: null,
  }));
  const toWorld = new T.Matrix3();
  for (let i = 0; i < 240; i++) {
    tick(neutral);
    for (const w of witness) w.baseline.push(relativeTip(w.tip, w.frame));
  }
  reset();
  for (let i = 0; i < 240; i++) {
    tick({ ...neutral, z: i < 105 ? 1 : 0, run: i < 105, x: i > 50 && i < 105 ? 0.55 : 0 });
    for (const w of witness) {
      const current = relativeTip(w.tip, w.frame);
      toWorld.setFromMatrix4(w.frame.matrixWorld);
      const d = point.subVectors(current, w.baseline[i]).applyMatrix3(toWorld).length();
      w.max = Math.max(w.max, d);
      if (i >= 204) w.tail = Math.max(w.tail, d);
      if (w.previous)
        w.step = Math.max(w.step, point.subVectors(current, w.previous).applyMatrix3(toWorld).length());
      w.previous = current;
    }
  }
  const guideScale = rig.headAssembly?.scale.x ?? 1;
  for (const w of witness)
    check(
      w.max / guideScale > 0.0005 && w.max / guideScale < 0.15 &&
      w.tail / guideScale < 0.0015 && w.step / guideScale < 0.06,
      'visible guide motion, per-tick travel or settling: ' + w.node.name,
    );
  const props = {};
  for (const p of PROPS) {
    ctrl.reset(p.x, p.z - p.depth / 2 - 1);
    let top = 0;
    for (let i = 0; i < 320; i++) {
      tick({ ...neutral, z: 1 });
      top = Math.max(top, rig.root.position.y);
    }
    const end = rig.root.position.z;
    check(
      p.kind === 'crate'
        ? Math.abs(end - (p.z - p.depth / 2 - ctrl.capsuleRadius)) < 0.01 && top < 0.01
        : end > p.z + p.depth / 2 && Math.abs(top - p.height) < 0.01,
      p.kind + ' obstacle',
    );
    props[p.kind] = { highestM: top, finalZ: end };
  }
  return {
    name,
    tier,
    standingHeightM,
    sourceHeadHeightM,
    gait,
    turns,
    jump: { apexM: apex, land, air },
    roll: { ticks: rollTicks, minM: low, maxM: high, lowestSurface },
    gesture: { ticks: emoteTicks, excursionM: gesture, returnedM: waveReturn },
    guides: witness.map((w) => ({
      name: w.node.name,
      excursionM: w.max,
      settledM: w.tail,
      maxStepM: w.step,
    })),
    props,
  };
}
for (const name of requested.length ? requested : names)
  for (const tier of ['high', 'mobile']) results.push(await measure(name, tier));
console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
