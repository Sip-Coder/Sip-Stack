// Run by check-people.mjs with Chrome's 4x CPU throttle. Only time production
// dynamics calls. The independent collision oracle and state hashes run outside
// those timers. All printed distances and speeds are in character metres.
import * as T from 'three';
import { worker } from '../docs/life/people.js';
import { buildForCheck } from '../docs/assets/sip-village.js';
import { buildHarbor } from '../docs/assets/sip-craft-harbor.js';
import { cellar } from '../docs/assets/sip-creek-cellar.js';
import { seed } from '../docs/life/forms.js';

const round = (x) => Math.round(x * 1e5) / 1e5;
const wait = () => new Promise((r) => setTimeout(r, 0));
const flat = () => 0;
const stairs = (x, z) => 0.1 * Math.floor(z / 0.4);
stairs.snapTread = (z) => (Math.floor(z / 0.4) + 0.5) * 0.4;

// Minimise distance to interpolated spheres along the tapered capsule axis.
function gap(x, y, z, c, j) {
  const ax = x - c[j],
    ay = y - c[j + 1],
    az = z - c[j + 2],
    dx = c[j + 4] - c[j],
    dy = c[j + 5] - c[j + 1],
    dz = c[j + 6] - c[j + 2];
  const sq = dx * dx + dy * dy + dz * dz,
    dr = c[j + 7] - c[j + 3];
  const u = sq ? (dx * ax + dy * ay + dz * az) / sq : 0;
  const nx = ax - dx * u,
    ny = ay - dy * u,
    nz = az - dz * u;
  const t = Math.max(
    0,
    Math.min(1, u + dr * Math.sqrt((nx * nx + ny * ny + nz * nz) / Math.max(1e-12, sq * (sq - dr * dr)))),
  );
  return Math.sqrt((ax - dx * t) ** 2 + (ay - dy * t) ** 2 + (az - dz * t) ** 2) - c[j + 3] - dr * t;
}
// Main's skirt, apron and scarf outfits all included a waist-to-knee loft
// weighted entirely to 'hem'. Recover that render mesh from its skin indices
// and measure it against exactly the same anatomical capsule dimensions.
function legacyGarment(variant) {
  const a = worker(new T.Scene(), variant, 1, 'Cloth fixture');
  a.lod(new T.PerspectiveCamera(), false);
  const b = a.skeleton.bones,
    hem = b.findIndex((n) => n.name === 'hem'),
    mesh = a.layers[1];
  const attr = mesh.geometry.attributes,
    vertices = [];
  for (let i = 0; i < attr.position.count; i++)
    if (attr.skinIndex.getX(i) === hem) vertices.push(new T.Vector3().fromBufferAttribute(attr.position, i));
  if (!vertices.length) throw Error('No hem-weighted bind vertices on historical mesh');
  const named = (name, i = 0) => b.filter((n) => n.name === name)[i];
  const build = Math.abs(named('hip').position.x) / 0.098,
    waist = { 2: 0.89, 4: 0.87, 6: 1.12 }[variant];
  const seg = [[named('pelvis'), named('lumbar'), 0.122 * waist, 0.107 * waist, 0, 0, 0, 0]];
  for (let i = 0; i < 2; i++) {
    seg.push([named('hip', i), named('knee', i), 0.088 * build, 0.056 * build, -0.03, 0.018, 0, 0]);
    seg.push([named('knee', i), named('ankle', i), 0.055 * build, 0.035 * build, -0.015, 0.009, -0.003, 0]);
  }
  const inv = new T.Matrix4(),
    matrix = new T.Matrix4(),
    q = new T.Vector3(),
    caps = new Float32Array(seg.length * 8);
  let min = Infinity,
    negativeFrames = 0;
  for (let i = 0; i < 1800; i++) {
    const t = i / 30,
      floor = i >= 600 && i < 1200 ? stairs : flat;
    a.g.position.z = 0.67 * t;
    a.g.position.y = floor(0, a.g.position.z);
    a.pose(t, i >= 1200 ? 'carry' : 'walk', floor);
    a.g.updateWorldMatrix(true, true);
    inv.copy(a.g.matrixWorld).invert();
    for (let j = 0; j < seg.length; j++) {
      const [s, e, r0, r1, y0, y1, z0, z1] = seg[j];
      q.set(0, y0, z0)
        .applyMatrix4(s.matrixWorld)
        .applyMatrix4(inv)
        .toArray(caps, 8 * j);
      caps[8 * j + 3] = r0;
      q.set(0, y1, z1)
        .applyMatrix4(e.matrixWorld)
        .applyMatrix4(inv)
        .toArray(caps, 8 * j + 4);
      caps[8 * j + 7] = r1;
    }
    matrix.copy(inv).multiply(b[hem].matrixWorld).multiply(a.skeleton.boneInverses[hem]);
    let nearest = Infinity;
    for (const v of vertices) {
      q.copy(v).applyMatrix4(matrix);
      for (let j = 0; j < caps.length; j += 8) nearest = Math.min(nearest, gap(q.x, q.y, q.z, caps, j));
    }
    min = Math.min(min, nearest);
    if (nearest < 0) negativeFrames++;
  }
  return { frames: 1800, vertices: vertices.length, minClearanceMm: round(min * 1000), negativeFrames };
}
function garment(variant) {
  const scene = new T.Scene(),
    a = worker(scene, variant, 1, 'Cloth fixture');
  a.setLOD(0, false);
  const d = a.dynamics,
    indices = d.names.map((k, i) => (/pelvis|thigh|shin/.test(k) ? i * 8 : -1)).filter((i) => i >= 0);
  let minimum = Infinity,
    negativeFrames = 0;
  let invertedFrames = 0;
  const perFrame = new Float32Array(1800);
  for (let f = 0; f < 1800; f++) {
    const t = f / 30,
      floor = f >= 600 && f < 1200 ? stairs : flat;
    a.g.position.z = 0.67 * t;
    a.g.position.y = floor(0, a.g.position.z);
    d.load(f >= 1200 ? 6 : 0, 0, 1.06, 0.29);
    a.pose(t, f >= 1200 ? 'carry' : 'walk', floor);
    d.finish();
    let nearest = Infinity;
    let inverted = false;
    for (const panel of d.panels) {
      for (let c = 0; c < panel.cols; c++) {
        const bottom = (panel.rows - 1) * panel.cols + c;
        if (panel.position[3 * bottom + 1] >= panel.position[3 * c + 1] - 0.08) inverted = true;
      }
      for (const p of [panel.position, panel.renderPosition]) {
        for (let k = 0; k < p.length; k += 3)
          for (const j of indices) nearest = Math.min(nearest, gap(p[k], p[k + 1], p[k + 2], d.capsules, j));
      }
    }
    if (inverted) invertedFrames++;
    perFrame[f] = nearest * 1000;
    if (!(nearest >= 0) || !Number.isFinite(nearest)) negativeFrames++;
    minimum = Math.min(minimum, nearest);
  }
  // Preserve the per-frame minima compactly for inspection in the JSON report.
  const bytes = new Uint8Array(new Int16Array(perFrame.map((x) => Math.round(x * 10))).buffer);
  return {
    frames: perFrame.length,
    invertedFrames,
    minClearanceMm: round(minimum * 1000),
    negativeFrames,
    perFrameTenthsMmInt16LE: btoa(String.fromCharCode(...bytes)),
  };
}
function makeScene(name) {
  globalThis.probedActors = [];
  const s = new T.Scene(),
    camera = new T.PerspectiveCamera(40, 1, 0.1, 90);
  let update;
  if (name === 'Village') {
    camera.position.set(-5, 3, 5);
    camera.lookAt(-7, 1, 0);
    const world = buildForCheck(s);
    update = (t) => world.life(t, camera, 'Mobile');
  } else if (name === 'Tidelight') {
    camera.position.set(2, 3, 4);
    camera.lookAt(0, 1, 2);
    const harbor = buildHarbor(s, { seaTime: { value: 0 }, storm: { value: 0.1 } }, new T.DataTexture());
    update = (t) => harbor(t, 0.1, camera, 0);
  } else {
    camera.position.set(2, 2, 3);
    camera.lookAt(0, 1, 0);
    const station = cellar(s, new T.MeshStandardMaterial(), seed(123));
    update = (t) => station.update(t, camera, true);
  }
  camera.updateMatrixWorld();
  update(0);
  const actors = globalThis.probedActors.filter((r) => s.getObjectById(r.a.g.id)).map((r) => r.a.dynamics);
  let ms = 0;
  for (const d of actors)
    for (const key of ['pose', 'finish']) {
      const fn = d[key];
      d[key] = function (a, b) {
        const start = performance.now();
        fn(a, b);
        ms += performance.now() - start;
      };
    }
  return { s, actors, update, ms: () => ms };
}
function stateHash(actors) {
  let hash = 2166136261;
  const number = new Float32Array(1),
    bits = new Int32Array(number.buffer);
  function add(n) {
    number[0] = n;
    hash = Math.imul(hash ^ bits[0], 16777619);
  }
  for (const d of actors) {
    add(d.stepCount);
    add(d.alpha);
    for (const array of [d.com, d.lag, d.capsules]) for (const n of array) add(n);
    for (const p of [...d.panels, ...d.chains])
      for (const array of [p.position, p.velocity]) for (const n of array) add(n);
  }
  return (hash >>> 0).toString(16);
}
async function windowRun(name, spikes) {
  const { s, actors, update, ms } = makeScene(name);
  const times = new Float32Array(3601);
  const windows = new Float64Array(12),
    samples = new Uint32Array(12);
  let frames = 0,
    t = 0,
    maxEnergy = 0,
    maxSpeed = 0,
    nan = 0,
    substeps = 0,
    startMs = 0;
  while (t < 120 - 1e-8) {
    t = Math.min(120, t + (spikes && frames % 41 === 40 ? 0.25 : 1 / 30));
    const before = ms();
    update(t);
    times[frames] = ms() - before;
    frames++;
    if (frames === 120) startMs = ms();
    const wi = Math.min(11, Math.floor(t / 10));
    let sum = 0;
    for (const d of actors) {
      if (d.level === 2) continue;
      const state = d.measure();
      substeps = Math.max(substeps, state.maxSubsteps);
      if (!Number.isFinite(state.energy + state.maxSpeed + d.com[0] + d.com[1] + d.com[2])) nan++;
      maxSpeed = Math.max(state.maxSpeed, maxSpeed);
      sum += state.energy;
    }
    samples[wi]++;
    windows[wi] += sum;
    maxEnergy = Math.max(sum, maxEnergy);
    if (frames % 600 === 0) await wait();
  }
  const avg = windows.map((v, i) => v / Math.max(1, samples[i]));
  const early = Math.max(...avg.slice(1, 6)),
    late = Math.max(...avg.slice(6));
  let increasing = true;
  for (let i = 7; i < avg.length; i++) if (avg[i] <= avg[i - 1]) increasing = false;
  const warmed = times.subarray(120, frames).sort();
  const result = {
    frames,
    simulatedSeconds: t,
    steps: actors.reduce((n, d) => n + d.stepCount, 0),
    hash: stateHash(actors),
    droppedSteps: actors.reduce((n, d) => n + d.stats.discarded, 0),
    maxSubsteps: substeps,
    maxParticleSpeed: round(maxSpeed),
    maxEnergy: round(maxEnergy),
    maxEarlyMeanEnergy: round(early),
    maxLateMeanEnergy: round(late),
    tenSecondMeanEnergies: Array.from(avg, round),
    boundedEnergy: late <= Math.max(0.012, 3 * early) && !(increasing && avg[11] > 1.25 * avg[6] + 0.005),
    nanFrames: nan,
    meanPhysicsMs: round((ms() - startMs) / (frames - 120)),
    p95PhysicsMs: round(warmed[Math.floor(warmed.length * 0.95)]),
    p99PhysicsMs: round(warmed[Math.floor(warmed.length * 0.99)]),
    peakMeasuredMs: round(warmed[warmed.length - 1]),
  };
  s.clear();
  return result;
}

// A warmed rig is reused here, independently of scene allocations. Probe only
// the solver, including the rendered proxy update, across two equal windows.
async function heapCheck() {
  if (!performance.memory || !globalThis.gc) return { available: false };
  const actor = worker(new T.Scene(), 4, 1, 'Heap fixture'),
    d = actor.dynamics;
  actor.setLOD(1, true);
  let f = 0;
  function block() {
    for (let i = 0; i < 420; i++) {
      actor.hip.position.copy(actor.rig.bind[actor.rig.hip]);
      actor.hip.rotation.set(0, 0, 0);
      actor.rig.bones[actor.rig.chest].rotation.set(0, 0, 0);
      actor.rig.bones[actor.rig.head].rotation.set(0, 0, 0);
      d.pose(++f / 30, 'walk');
      d.finish();
    }
  }
  block();
  block();
  block();
  await wait();
  gc();
  gc();
  const a = performance.memory.usedJSHeapSize;
  block();
  await wait();
  gc();
  gc();
  const b = performance.memory.usedJSHeapSize;
  block();
  await wait();
  gc();
  gc();
  const c = performance.memory.usedJSHeapSize;
  return {
    available: true,
    framesPerWindow: 420,
    retainedGrowthBytes: Math.max(0, c - Math.max(a, b)),
    rawDeltas: [b - a, c - b],
  };
}
function recoveredState() {
  const actor = worker(new T.Scene(), 4, 1, 'Recovered cloth'),
    d = actor.dynamics;
  actor.setLOD(0, false);
  for (let i = 0; i < 90; i++) {
    actor.g.position.z = i * 0.012;
    actor.pose(i / 60, 'walk');
    d.finish();
  }
  const before = stateHash([d]),
    count = d.stepCount,
    version = d.panels[0].geometry.attributes.position.version;
  d.restore();
  const after = stateHash([d]),
    updated = d.panels[0].geometry.attributes.position.version > version;
  actor.pose(500, 'walk');
  d.finish();
  return { before, after, bufferInvalidated: updated, recoverySteps: d.stepCount - count };
}
export default async function runPhysics({ baseline = false } = {}) {
  if (baseline)
    return {
      failures: ['Historical main has rigid hem weighting and no fixed-step solver.'],
      fixedStep: false,
      cloth: { apron: legacyGarment(2), skirt: legacyGarment(4), scarf: legacyGarment(6) },
    };
  const failures = [],
    cloth = {},
    scenes = {};
  for (const [name, v] of [
    ['apron', 2],
    ['skirt', 4],
    ['scarf', 6],
  ]) {
    cloth[name] = garment(v);
    if (cloth[name].negativeFrames || cloth[name].invertedFrames)
      failures.push(name + ' intersects a leg or pelvis capsule or folds above its sewn edge');
    await wait();
  }
  for (const scene of ['Village', 'Tidelight', 'Creek']) {
    scenes[scene] = {};
    for (const [k, spikes] of [
      ['steady', false],
      ['spikes', true],
    ]) {
      const a = await windowRun(scene, spikes),
        b = await windowRun(scene, spikes);
      a.repeatHash = b.hash;
      a.deterministic = a.hash === b.hash && a.steps === b.steps;
      scenes[scene][k] = a;
      if (
        !a.steps ||
        a.nanFrames ||
        a.maxParticleSpeed >= 10 ||
        !a.boundedEnergy ||
        a.maxSubsteps > 4 ||
        !a.deterministic ||
        a.meanPhysicsMs > 2
      )
        failures.push(scene + '/' + k + ' failed stability, replay or CPU budget');
    }
  }
  const recovered = recoveredState();
  if (recovered.before !== recovered.after || !recovered.bufferInvalidated || recovered.recoverySteps !== 0)
    failures.push('context recovery changed solver state, missed a buffer or replayed inactive time');
  const heap = await heapCheck();
  if (!heap.available || heap.retainedGrowthBytes > 0)
    failures.push('warmed solver retained heap between collection windows');
  return { failures, throttle: 4, cloth, scenes, heap, recovered };
}
