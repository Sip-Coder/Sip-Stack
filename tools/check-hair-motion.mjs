// THREE_ROOT=/path/to/three@0.170.0 node tools/check-hair-motion.mjs
// Samples the deployed GLBs through the actual actor and fixed-tick pose path.
// Optionally pass a checkout directory to measure the same scenes before a change.
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const dir = resolve(process.env.THREE_ROOT);
  if (JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8')).version !== '0.170.0')
    throw Error('Expected Three.js 0.170.0');
  registerHooks({
    resolve(specifier, context, next) {
      const entry = specifier === 'three' ? 'build/three.module.js'
        : specifier.startsWith('three/addons/') ? 'examples/jsm/' + specifier.slice(13) : null;
      return entry ? { url: pathToFileURL(resolve(dir, entry)).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}

const T = await import('three');
const checkout = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : new URL('../', import.meta.url);
const characterModule = name => import(new URL('docs/characters/' + name, checkout));
const { loadAvatar } = await characterModule('avatar-builder.js');
const { createActor } = await characterModule('rig.js');
const { createController, FIXED_DT } = await characterModule('motion.js');
const { names, heights } = await characterModule('ui.js');
const { optimizeCharacter } = await characterModule('render-batches.js');
const { setModelDetail } = await characterModule('model-tier.js');
const neutral = { x: 0, z: 0, run: false, roll: false, jump: false, emote: false };
const degree = 180 / Math.PI, inchesPerUnit = 39.37007874;
const failures = [];
let reduced = false;
globalThis.matchMedia = query => ({ get matches() { return query === '(prefers-reduced-motion: reduce)' && reduced; } });

const posed = new T.Vector3(), centre = new T.Vector3(), root = new T.Vector3();
const origin = new T.Vector3(), direction = new T.Vector3();
const inverse = new T.Matrix4(), fromMesh = new T.Matrix4();
const restHead = [0, 0, 0], shakeStop = 42, shakeTicks = shakeStop + 124;

function shakeCue(i) {
  if (i < 12 || i >= shakeStop) return restHead;
  const shake = Math.sin((i - 12) * 2 * Math.PI / 20);
  return [0.03 * shake, 0.5 * shake, 0.12 * shake];
}

function tiltCue(i) {
  return [-0.52 * Math.min(1, i / 32), 0, 0];
}

function ringDown(moving, still, chainIndex) {
  const offsets = moving.slice(shakeStop).map((tips, i) =>
    tips[chainIndex].clone().sub(still[shakeStop + i][chainIndex]));
  // Project one lock along its strongest early response. Crossing that
  // same quiet point demonstrates reversal rather than absolute angle decay.
  const initial = offsets.slice(0, 31).reduce((peak, sample) =>
    sample.lengthSq() > peak.lengthSq() ? sample : peak);
  const peak = initial.length(), axis = initial.clone().normalize();
  const signed = offsets.map(sample => sample.dot(axis));
  const rebounds = [];
  let side = 1;
  for (const [i, value] of signed.entries()) {
    if (Math.abs(value) <= 0.08 * peak) continue;
    const sign = Math.sign(value);
    if (sign !== side) {
      side = sign;
      rebounds.push({ tick: i, value });
    } else if (rebounds.length && Math.abs(value) > Math.abs(rebounds.at(-1).value)) {
      rebounds[rebounds.length - 1] = { tick: i, value };
    }
  }
  return {
    peakTipLagIn: peak,
    rebounds: rebounds.map(({ tick, value }) =>
      ({ seconds: tick * FIXED_DT, signedLagIn: value })),
    settledWithinSeconds: (signed.findLastIndex(value => Math.abs(value) > 0.035 * peak) + 1) * FIXED_DT,
  };
}

function sampleCap(chain, meshToHead) {
  const { mesh, points } = chain, { uv, skinIndex, skinWeight } = mesh.geometry.attributes;
  const tip = [], sewn = [];
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    if (u > 0.985) tip.push(i);
    if (u < 0.018) sewn.push(i);
  }
  const farthest = (ids, p) => Math.max(...ids.map(i =>
    mesh.getVertexPosition(i, posed).applyMatrix4(meshToHead).distanceTo(p)));
  const weights = (ids, bone) => Math.min(...ids.map(i =>
    [0, 1, 2, 3].reduce((sum, j) => sum + Number(skinIndex.getComponent(i, j) === bone) *
      skinWeight.getComponent(i, j), 0)));
  return {
    tip, sewn,
    tipRadius: farthest(tip, points.at(-1)), sewnRadius: farthest(sewn, points[0]),
    tipWeight: weights(tip, chain.links.length - 1), sewnWeight: weights(sewn, 0),
  };
}

async function measure(name, tier) {
  const key = name + '/' + tier;
  const check = (ok, message) => { if (!ok) failures.push(key + ' ' + message); };
  const height = heights[names.indexOf(name)];
  const build = await loadAvatar(name, tier), rig = createActor(name, height);
  const animate = build(rig), controller = createController(rig);
  optimizeCharacter(rig);
  setModelDetail(rig.root, tier);
  if (!await rig.loadSecondary()) throw Error('Missing lazy secondary motion for ' + key);
  const { groom } = rig;
  function tick(intent, cue = restHead) {
    const frame = controller.step(FIXED_DT, { ...neutral, ...intent });
    rig.head.rotation.set(
      rig.head.rotation.x + cue[0],
      rig.head.rotation.y + cue[1],
      rig.head.rotation.z + cue[2],
    );
    animate(frame);
    controller.finishPose();
    rig.root.updateMatrixWorld(true);
  }

  reduced = true;
  controller.reset(-10, 0);
  tick();
  // The authored frame is scaled independently on each axis at the mount.
  // Compare tips in physical inches in that moving frame, without head motion.
  const inchesPerAxis = groom.head.getWorldScale(new T.Vector3()).multiplyScalar(inchesPerUnit);
  const physical = new T.Vector3();
  const distanceInches = (a, b) => physical.subVectors(a, b).multiply(inchesPerAxis).length();
  const { chains, shapes, clearance } = groom.motion;
  const front = name === 'sippy' ? 'quiff' : 'front';
  check(chains.length === (name === 'sippy' ? 3 : 8), 'strategic lock count');
  const boneCount = chains.reduce((sum, chain) => sum + chain.links.length, 0);
  check(name === 'sippy' ? boneCount === 6 : boneCount >= 24 && boneCount <= 36, 'strategic bone count');
  const colliders = [...new Set(shapes.map(s => s.label.replace(/headband \d+/, 'headband')))];
  for (const label of ['scalp', 'neck', 'shoulder L', 'shoulder R', 'collar L', 'collar R', 'upper back and rear collar'])
    check(colliders.includes(label), 'missing ' + label + ' collider');
  if (name === 'roma') check(colliders.includes('headband'), 'missing headband collider');

  const quietPose = new Map(chains.flatMap(chain =>
    chain.links.map(link => [link, link.bone.quaternion.clone()])));
  const metrics = chains.map(chain => {
    inverse.copy(groom.head.matrixWorld).invert();
    const { mesh } = chain, caps = sampleCap(chain, fromMesh.multiplyMatrices(inverse, mesh.matrixWorld));
    check(caps.tip.length > 0 && caps.sewn.length > 0, 'missing terminal cap samples for ' + mesh.name);
    check(caps.tipRadius < 0.015, 'UV.x selects vertices beyond the terminal cap on ' + mesh.name);
    // The limit protects a hidden root-cap from being bound to the distal joint,
    // which would pull the scalp seam open whenever the rest of the lock moved.
    check(caps.sewnWeight > 0.9 && caps.tipWeight > 0.99, 'wrong end weights for ' + mesh.name);
    return { chain, ...caps };
  });

  function scenario(ticks, input, cue = () => restHead) {
    controller.reset(-10, 0);
    const samples = metrics.map(({ chain }) => ({
      name: chain.mesh.name, region: chain.region, maxAngle: 0, maxAngleAfterStop: 0,
      maxRootTravelIn: 0, maxBoneStretch: 0, maxCapRadius: 0, maxCapRadiusIn: 0,
      quietAngleDifference: 0, tipPenetrations: 0, clearance: Infinity, maxTipTravelIn: 0, minimum: null,
    }));
    for (let i = 0; i < ticks; i++) {
      tick(input(i), cue(i));
      inverse.copy(groom.head.matrixWorld).invert();
      for (let k = 0; k < metrics.length; k++) {
        const { chain, tip } = metrics[k], sample = samples[k];
        const { links, points, mesh } = chain;
        root.set(0, 0, 0).applyMatrix4(links[0].bone.matrixWorld).applyMatrix4(inverse);
        sample.maxRootTravelIn = Math.max(sample.maxRootTravelIn, distanceInches(root, points[0]));
        for (let j = 1; j < links.length; j++) {
          origin.set(0, 0, 0).applyMatrix4(links[j].bone.matrixWorld).applyMatrix4(inverse);
          sample.maxBoneStretch = Math.max(sample.maxBoneStretch,
            Math.abs(origin.distanceTo(root) - links[j - 1].length));
          root.copy(origin);
        }
        for (const link of links) {
          sample.quietAngleDifference = Math.max(sample.quietAngleDifference,
            degree * link.bone.quaternion.angleTo(quietPose.get(link)));
        }
        const last = links.at(-1), end = points.at(-1);
        centre.copy(last.dir).multiplyScalar(last.length).applyMatrix4(last.bone.matrixWorld).applyMatrix4(inverse);
        direction.subVectors(centre, root);
        const angle = degree * last.dir.angleTo(direction);
        sample.maxAngle = Math.max(sample.maxAngle, angle);
        if (i >= ticks - 40) sample.maxAngleAfterStop = Math.max(sample.maxAngleAfterStop, angle);
        sample.maxTipTravelIn = Math.max(sample.maxTipTravelIn, distanceInches(centre, end));
        fromMesh.multiplyMatrices(inverse, mesh.matrixWorld);
        let capRadius = 0;
        for (const index of tip) {
          mesh.getVertexPosition(index, posed).applyMatrix4(fromMesh);
          capRadius = Math.max(capRadius, posed.distanceTo(centre));
          sample.maxCapRadiusIn = Math.max(sample.maxCapRadiusIn, distanceInches(posed, centre));
        }
        sample.maxCapRadius = Math.max(sample.maxCapRadius, capRadius);
        for (const [label, contact] of clearance(centre, capRadius)) {
          if (contact < 0) sample.tipPenetrations++;
          if (contact < sample.clearance) {
            sample.clearance = contact;
            sample.minimum = { tick: i, collider: label };
          }
        }
      }
    }
    return {
      maxAngleDegrees: Math.max(...samples.map(s => s.maxAngle)),
      maxFrontAngleDegrees: Math.max(...samples.filter(s => s.region === front).map(s => s.maxAngle)),
      maxAngleAfterStopDegrees: Math.max(...samples.filter(s => s.region === front).map(s => s.maxAngleAfterStop)),
      maxFrontAngleVsQuietDegrees: Math.max(...samples.filter(s => s.region === front)
        .map(s => s.quietAngleDifference)),
      maxRootTravelIn: Math.max(...samples.map(s => s.maxRootTravelIn)),
      maxBoneStretchIn: Math.max(...samples.map(s => s.maxBoneStretch)) * Math.max(...inchesPerAxis.toArray()),
      samples,
    };
  }

  function track(ticks, cue) {
    controller.reset(-10, 0);
    return Array.from({ length: ticks }, (_, i) => {
      tick(neutral, cue(i));
      inverse.copy(groom.head.matrixWorld).invert();
      return chains.map(chain => {
        const { dir, length, bone } = chain.links.at(-1);
        return dir.clone().multiplyScalar(length).applyMatrix4(bone.matrixWorld)
          .applyMatrix4(inverse).multiply(inchesPerAxis);
      });
    });
  }

  reduced = false;
  const scenarios = {
    idle: scenario(210, () => neutral),
    walk: scenario(155, () => ({ z: 1 })),
    walkingTurn: scenario(183, i => i < 135 ? { z: i < 75 ? 1 : 0.52, x: i < 75 ? 0 : 0.85 } : neutral),
    headTurn: scenario(185, () => neutral, i => {
      const wave = (start, end) => Math.sin(Math.PI * T.MathUtils.clamp((i - start) / (end - start), 0, 1));
      return [-0.18 * wave(52, 90), 0.35 * wave(22, 70) - 0.24 * wave(85, 132), 0];
    }),
    stoppedShake: scenario(shakeTicks, () => neutral, shakeCue),
    backTilt: scenario(110, () => neutral, tiltCue),
    run: scenario(120, () => ({ z: 1, run: true })),
    jump: scenario(100, i => ({ z: 0.6, jump: i === 15 })),
    roll: scenario(82, i => ({ z: 0.65, roll: i === 15 })),
  };
  const quietTrack = track(shakeTicks, () => restHead);
  const shakeTrack = track(shakeTicks, shakeCue);
  const rings = chains.map((chain, i) => ({
    name: chain.mesh.name, region: chain.region,
    ...ringDown(shakeTrack, quietTrack, i),
  }));
  const selected = rings.filter(row => row.region === (name === 'sippy' ? 'quiff' : 'temple'))
    .reduce((best, row) => row.peakTipLagIn > best.peakTipLagIn ? row : best);
  check(selected.peakTipLagIn > (name === 'sippy' ? 0.16 : 0.35), 'shake misses tip lag');
  check(selected.rebounds.length >= 2 && selected.rebounds.length <= 3, 'shake misses two to three rebounds');
  check(selected.settledWithinSeconds >= 1 && selected.settledWithinSeconds <= 2, 'shake does not settle in one to two seconds');
  let maxFanIn = 0;
  for (const [i, row] of shakeTrack.entries()) {
    for (let a = 0; a < row.length; a++) for (let b = a + 1; b < row.length; b++) {
      const rest = quietTrack[i][a].distanceTo(quietTrack[i][b]);
      maxFanIn = Math.max(maxFanIn, row[a].distanceTo(row[b]) - rest);
    }
  }
  check(maxFanIn > (name === 'sippy' ? 0.06 : 0.2), 'shake misses neighboring guide separation');
  const tiltTrack = track(110, tiltCue);
  const backTilt = chains.map((chain, i) => ({
    name: chain.mesh.name,
    region: chain.region,
    finalTipTravelIn: tiltTrack.at(-1)[i].distanceTo(quietTrack[109][i]),
  }));
  if (name === 'roma') check(backTilt.some(row => row.region === 'nape' && row.finalTipTravelIn > 0.45),
    'back tilt misses nape response');

  reduced = true;
  const reducedQuiet = track(shakeTicks, () => restHead);
  const reducedTrack = track(shakeTicks, shakeCue);
  const reducedReboundIn = Math.max(...reducedTrack.slice(shakeStop).map((row, i) =>
    Math.max(...row.map((point, j) => point.distanceTo(reducedQuiet[shakeStop + i][j])))));
  check(reducedReboundIn < 0.01, 'shake bounces with reduced motion');
  scenarios.reducedMotion = scenario(155, i => i < 115 ? { z: 1, x: i < 60 ? 0 : 0.55 } : neutral);
  reduced = false;
  // Browser changes the same MediaQueryList while the actor is in motion.
  controller.reset(-10, 0);
  for (let i = 0; i < 90; i++) tick({ z: 1 });
  reduced = true;
  tick({ z: 1 });
  const reducedFrontMax = Math.max(...chains.filter(c => c.region === front)
    .flatMap(c => c.links.map(l => l.bone.quaternion.angleTo(quietPose.get(l)) * degree)));
  check(reducedFrontMax < 0.2, 'ongoing oscillation after reduced-motion change');
  reduced = false;

  const { idle, walk, headTurn } = scenarios;
  check(idle.maxFrontAngleDegrees >= 1 && idle.maxFrontAngleDegrees <= 3.5, 'settled idle swing beyond 1–3°');
  check(name === 'roma' ? walk.maxAngleDegrees >= 10 && walk.maxAngleDegrees <= 20
    : walk.maxFrontAngleDegrees >= 1.5 && walk.maxFrontAngleDegrees < 8, 'walk follow-through angle');
  check(headTurn.maxFrontAngleDegrees > idle.maxFrontAngleDegrees, 'head-turn lag equals idle');
  check(headTurn.maxAngleAfterStopDegrees <= idle.maxFrontAngleDegrees + 0.25, 'head-turn spring does not settle');
  check(scenarios.reducedMotion.maxFrontAngleVsQuietDegrees < 0.2, 'front locks move with reduced motion');

  for (const [phase, report] of Object.entries(scenarios)) {
    check(report.maxRootTravelIn < 0.0001, phase + ' root moves in head space');
    check(report.maxBoneStretchIn < 0.0001, phase + ' chain stretches');
    for (const [i, row] of report.samples.entries()) {
      check(row.tipPenetrations === 0,
        phase + ' ' + row.name + ' tips inside ' + row.minimum?.collider +
        ' ' + row.tipPenetrations + ' samples, worst ' + row.clearance);
      check(row.maxCapRadius < metrics[i].chain.pads.at(-1),
        phase + ' ' + row.name + ' actual skinned tip exceeds protected cap radius');
      delete row.maxCapRadius;
      delete row.maxRootTravelIn;
      delete row.maxBoneStretch;
    }
  }
  return {
    name, tier, boneCount, colliders,
    stoppedShake: { stopSeconds: shakeStop * FIXED_DT, selected, maxFanIn, reducedReboundIn, rings },
    backTilt, reducedFrontAngleAfterToggleDegrees: reducedFrontMax, scenarios,
  };
}
const results = [];
for (const name of ['sippy', 'roma'])
  for (const tier of ['mobile', 'high']) results.push(await measure(name, tier));
console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
