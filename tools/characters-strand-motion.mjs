// Measure every material vertex and indexed cloth edge on the fixed-step review
// timeline. A guide or a handful of sampled poses can miss a one-tick spike.
import * as T from 'three';
import { createActor } from '/characters/rig.js';
import { createController, FIXED_DT } from '/characters/motion.js';
import { setModelDetail } from '/characters/material-detail.js';
import { buildRoma } from '/characters/roma.js';

function surfaceEdges(chain, surface) {
  const index = surface.mesh.geometry.index;
  const count = surface.position.count;
  const keys = new Set(),
    ids = new Set();
  const from = [],
    to = [],
    restLengths = [];
  const a = new T.Vector3(),
    b = new T.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const i = index.getX(t + corner),
        j = index.getX(t + ((corner + 1) % 3));
      ids.add(i);
      const key = Math.min(i, j) * count + Math.max(i, j);
      if (i === j || keys.has(key)) continue;
      keys.add(key);
      from.push(i);
      to.push(j);
      a.fromArray(surface.rest, i * 3).applyMatrix4(chain.group.matrixWorld);
      b.fromArray(surface.rest, j * 3).applyMatrix4(chain.group.matrixWorld);
      restLengths.push(a.distanceTo(b));
    }
  }
  return {
    name: chain.group.name,
    mesh: surface.mesh,
    ids: Uint32Array.from(ids),
    from: Uint32Array.from(from),
    to: Uint32Array.from(to),
    restLengths: Float64Array.from(restLengths),
    seatedLengths: new Float64Array(from.length),
    coords: new Float64Array(count * 3),
  };
}

export function measureStrandMotion(tier) {
  const rig = createActor('roma', 1.68),
    animate = buildRoma(rig),
    ctrl = createController(rig);
  setModelDetail(rig.root, tier);
  const still = { x: 0, z: 0, run: false, roll: false, jump: false, emote: false };
  const input = { ...still };
  const tick = () => {
    animate(ctrl.step(FIXED_DT, input));
    ctrl.finishPose();
  };
  for (const [x, z] of [
    [-0.9, -0.85],
    [0, 0],
    [0, 0],
  ]) {
    ctrl.reset(x, z);
    tick();
  }
  rig.root.updateMatrixWorld(true);
  const surfaces = rig.hair.chains.flatMap((c) => c.surfaces.map((s) => surfaceEdges(c, s)));
  const inverse = new T.Matrix4(),
    transform = new T.Matrix4();
  const origin = new T.Vector3(),
    rotation = new T.Quaternion(),
    unit = new T.Vector3(1, 1, 1);
  const p = new T.Vector3(),
    q = new T.Vector3();
  const envelope = () => ({ vertexTravelM: 0, edgeExtensionM: 0, seatedEdgeExtensionM: 0 });
  const locks = Object.fromEntries(rig.hair.chains.map((c) => [c.group.name, envelope()]));
  const report = {
    tier,
    fixedTicks: 0,
    timeStepS: FIXED_DT,
    locks: rig.hair.chains.length,
    verticesPerTick: surfaces.reduce((n, s) => n + s.ids.length, 0),
    edgesPerTick: surfaces.reduce((n, s) => n + s.from.length, 0),
    all: envelope(),
    wave: envelope(),
  };
  const record = (r, key, value, s, i, j, frame, substep) => {
    if (value <= r[key]) return;
    r[key] = value;
    r[key + 'At'] = { lock: s.name, vertices: j === null ? [i] : [i, j], frame, substep };
  };
  for (let frame = 0; frame < 365; frame++) {
    const t = frame / 20;
    Object.assign(input, still);
    if (t >= 1 && t < 3.2) input.z = 1;
    if (t >= 3.2 && t < 7.6) {
      const yaw = Math.min(2.6, Math.max(0, t - 4)) * 1.75;
      Object.assign(input, { run: true, x: Math.sin(yaw), z: Math.cos(yaw) });
    }
    if (t >= 10.85 && t < 12.85) Object.assign(input, { x: -0.74, z: 0.67, run: true });
    input.roll = frame === 132;
    input.jump = frame === 188;
    input.emote = frame === 292;
    for (let substep = 0; substep < 3; substep++) {
      tick();
      input.roll = input.jump = input.emote = false;
      rig.root.updateMatrixWorld(true);
      // Remove head translation and rotation only; units remain world metres.
      inverse
        .compose(rig.head.getWorldPosition(origin), rig.head.getWorldQuaternion(rotation), unit)
        .invert();
      const wave = frame >= 292;
      for (const s of surfaces) {
        transform.multiplyMatrices(inverse, s.mesh.matrixWorld);
        const lock = locks[s.name];
        const position = s.mesh.geometry.attributes.position;
        for (const i of s.ids) {
          p.fromBufferAttribute(position, i).applyMatrix4(transform);
          if (report.fixedTicks) {
            const distance = p.distanceTo(q.fromArray(s.coords, i * 3));
            record(report.all, 'vertexTravelM', distance, s, i, null, frame, substep);
            record(lock, 'vertexTravelM', distance, s, i, null, frame, substep);
            if (wave) record(report.wave, 'vertexTravelM', distance, s, i, null, frame, substep);
          }
          p.toArray(s.coords, i * 3);
        }
        for (let k = 0; k < s.from.length; k++) {
          const i = s.from[k],
            j = s.to[k];
          const length = p.fromArray(s.coords, i * 3).distanceTo(q.fromArray(s.coords, j * 3));
          if (!report.fixedTicks) s.seatedLengths[k] = length;
          const gain = length - s.restLengths[k];
          const seatedGain = length - s.seatedLengths[k];
          record(report.all, 'edgeExtensionM', gain, s, i, j, frame, substep);
          record(lock, 'edgeExtensionM', gain, s, i, j, frame, substep);
          if (wave) record(report.wave, 'edgeExtensionM', gain, s, i, j, frame, substep);
          record(report.all, 'seatedEdgeExtensionM', seatedGain, s, i, j, frame, substep);
          record(lock, 'seatedEdgeExtensionM', seatedGain, s, i, j, frame, substep);
          if (wave) record(report.wave, 'seatedEdgeExtensionM', seatedGain, s, i, j, frame, substep);
        }
      }
      report.fixedTicks++;
    }
  }
  report.perLock = locks;
  return report;
}
