// THREE_ROOT=/path/to/three@0.170.0 node tools/check-source-rig.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  registerHooks({ resolve(name, context, next) {
    if (name !== 'three') return next(name, context);
    return { url: pathToFileURL(resolve(process.env.THREE_ROOT, 'build/three.module.js')).href, shortCircuit: true };
  } });
}
const { Vector3, Matrix4 } = await import('three');
const { createActor } = await import('../docs/characters/rig.js');
const { createController, FIXED_DT } = await import('../docs/characters/motion.js');
const { names, heights } = await import('../docs/characters/ui.js');
const rest = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };
const leg = ['thigh', 'shin', 'foot'], arm = ['upperArm', 'forearm', 'hand'];
const same = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, [a, b].join(' differs from '));
const inch = value => +(value / 0.0254).toFixed(2);

function segments() {
  return ['L', 'R'].flatMap(side => [arm, leg].flatMap(chain =>
    chain.slice(0, 2).map((a, i) => [a + side, chain[i + 1] + side])));
}

for (const [i, name] of names.entries()) {
  const rig = createActor(name, heights[i]);
  if (name === 'hummin') {
    assert.equal(rig.anatomy, undefined);
    assert.deepEqual(rig.hips.position.toArray(), [0, 0.52, 0]);
    assert.deepEqual(rig.shinL.position.toArray(), [0, -0.245, 0]);
    assert.deepEqual(rig.forearmR.position.toArray(), [0, -0.176, 0]);
    continue;
  }
  const { original, joints, restPose, donor, height, normalization } = rig.anatomy;
  const scale = rig.height / height;
  const zero = new Vector3();
  const uniform = new Vector3();
  const lengths = {};
  rig.root.updateMatrixWorld(true);
  for (const [key, matrix] of Object.entries(restPose)) {
    same(original[key].clone().applyMatrix4(matrix).distanceTo(zero), 0);
    const transform = new Matrix4().multiplyMatrices(rig[key].matrixWorld, matrix);
    const actual = original[key].clone().applyMatrix4(transform);
    same(actual.distanceTo(joints[key].clone().multiplyScalar(rig.height)), 0);
    uniform.setFromMatrixScale(transform).toArray().forEach(value => same(value, scale));
    same(transform.determinant(), scale ** 3);
  }
  for (const [a, b] of segments()) {
    const sourceLength = original[a].distanceTo(original[b]);
    same(rig[b].position.length() * height, sourceLength);
    lengths[a.replace('upperArm', 'humerus').replace('forearm', 'radiusUlna')
      .replace('thigh', 'femur').replace('shin', 'tibia')] = inch(sourceLength * scale);
  }
  const controller = createController(rig);
  const timeline = [
    [20, {}], [80, { z: 1 }], [80, { x: 0.35, z: 0.8, run: true }],
    [1, { jump: true }], [90, { z: 0.35 }], [1, { roll: true }], [45, { z: 0.7 }],
  ];
  const states = new Set();
  for (const [count, movement] of timeline) for (let f = 0; f < count; f++) {
    const frame = controller.step(FIXED_DT, { ...rest, ...movement });
    controller.finishPose();
    rig.root.updateMatrixWorld(true);
    states.add(frame.state);
    for (const [a, b] of segments()) {
      const current = rig[a].getWorldPosition(new Vector3()).distanceTo(rig[b].getWorldPosition(new Vector3()));
      same(current, original[a].distanceTo(original[b]) * scale);
    }
    for (const [key, matrix] of Object.entries(restPose)) {
      const transform = new Matrix4().multiplyMatrices(rig[key].matrixWorld, matrix);
      uniform.setFromMatrixScale(transform).toArray().forEach(value => same(value, scale));
      same(transform.determinant(), scale ** 3);
    }
  }
  for (const state of ['idle', 'walk', 'run', 'jump', 'roll']) assert.ok(states.has(state), state);
  const dimensions = (box) => box.getSize(new Vector3()).toArray().map(value => inch(value * rig.height));
  console.log(JSON.stringify({
    name,
    uniformScale: +scale.toFixed(8),
    skeletalHeightIn: inch(new Vector3(0, donor.crown, 0).applyMatrix4(normalization).y * rig.height),
    shoulderHeightIn: ['L', 'R'].map(side => inch(joints['upperArm' + side].y * rig.height)),
    glenohumeralSpanIn: inch(original.upperArmL.distanceTo(original.upperArmR) * scale),
    clavicleIn: ['L', 'R'].map(side => inch(new Vector3(...donor.arms[side].clavicle[0])
      .distanceTo(new Vector3(...donor.arms[side].clavicle[1])) * scale)),
    pelvisIn: dimensions(rig.anatomy.pelvisBounds),
    thoraxIn: dimensions(rig.anatomy.thoraxBounds),
    sourceRigLengthsIn: lengths,
    sampledFrames: timeline.reduce((sum, [count]) => sum + count, 0),
    states: [...states],
  }));
}
