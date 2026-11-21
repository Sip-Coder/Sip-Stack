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
// A clean baseline worktree can be sampled with the same camera, controller,
// pose frames and rasterizer even when it predates the CT audit interface.
const baseline = process.env.AXON_BASELINE_ROOT;
const modules = baseline
  ? pathToFileURL(resolve(baseline, 'docs/characters') + '/')
  : new URL('../docs/characters/', import.meta.url);
const characterModule = (file) => import(new URL(file + '.js', modules));
const { createActor } = await characterModule('rig');
const { createController, FIXED_DT } = await characterModule('motion');
const { snapshotDiagramModel } = await characterModule('diagram-parts');
const { setModelDetail } = await characterModule('model-tier');
const { names, heights } = await characterModule('ui');
const inch = 0.0254,
  angle = (a, b) => T.MathUtils.radToDeg(a.angleTo(b));
const origin = (a, b) => a.clone().sub(b);
const describe = (value) => +value.toFixed(3);
const neutral = { x: 0, z: 0, run: false, roll: false, emote: false, jump: false };

// Rasterize the actual deformed triangle buffers with barycentric depth.
// Compare at each pixel with skin only, never with the boot or garment exterior.
function coverage(parts, H, pelvis) {
  const bonesOnly = process.env.AXON_BONES_ONLY === '1';
  const layers = bonesOnly ? ['skeleton', 'skin'] : ['skeleton', 'muscles', 'skin'];
  const visible = parts.filter(
    (p) =>
      layers.includes(p.layer) &&
      !/hair|curl|brow|lash|sideburn|quiff|wave|crest and|scalp and|forelock|tapered lock|fringe/i.test(
        p.name,
      ),
  );
  const bounds = new T.Box3();
  for (const p of visible) bounds.union(p.mesh.geometry.boundingBox);
  const centre = bounds.getCenter(new T.Vector3());
  const fixture = 448,
    scale = fixture / (H * 1.09);
  const counts = new Map(),
    witnesses = {},
    femurRegions = {};
  let sampled = 0,
    exposed = 0,
    worst = 0;
  for (const [yaw, pitch] of [
    [0, 0],
    [Math.PI, 0],
    [Math.PI / 2, 0],
    [-Math.PI / 2, 0],
    [0.69, 0.32],
    [-2.43, -0.3],
  ]) {
    const cs = Math.cos(yaw),
      ss = Math.sin(yaw),
      ct = Math.cos(pitch),
      st = Math.sin(pitch);
    const skin = new Float32Array(fixture ** 2).fill(-Infinity);
    const inner = new Float32Array(fixture ** 2).fill(-Infinity);
    const winners = new Int32Array(fixture ** 2).fill(-1);
    for (let id = 0; id < visible.length; id++) {
      const part = visible[id],
        g = part.mesh.geometry,
        a = g.getAttribute('position'),
        idx = g.index.array;
      const u = new Float32Array(a.count),
        v = new Float32Array(a.count),
        d = new Float32Array(a.count);
      for (let j = 0; j < a.count; j++) {
        const x = a.getX(j) - centre.x,
          y = a.getY(j) - centre.y,
          z = a.getZ(j) - centre.z;
        u[j] = (x * cs - z * ss) * scale + fixture / 2;
        v[j] = (y * ct - (x * ss + z * cs) * st) * scale + fixture / 2;
        d[j] = (x * ss + z * cs) * ct + y * st;
      }
      const depth = part.layer === 'skin' ? skin : inner;
      for (let i = 0; i < idx.length; i += 3) {
        const j = idx[i],
          b = idx[i + 1],
          c = idx[i + 2];
        const ux = u[b] - u[j],
          vx = v[b] - v[j],
          uy = u[c] - u[j],
          vy = v[c] - v[j];
        const det = ux * vy - uy * vx;
        if (Math.abs(det) < 1e-8) continue;
        const x0 = Math.max(0, Math.ceil(Math.min(u[j], u[b], u[c]) - 0.5)),
          x1 = Math.min(fixture - 1, Math.floor(Math.max(u[j], u[b], u[c]) - 0.5)),
          y0 = Math.max(0, Math.ceil(Math.min(v[j], v[b], v[c]) - 0.5)),
          y1 = Math.min(fixture - 1, Math.floor(Math.max(v[j], v[b], v[c]) - 0.5));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - u[j],
              dy = y + 0.5 - v[j],
              m = (dx * vy - dy * uy) / det,
              n = (ux * dy - vx * dx) / det;
            if (m < 0 || n < 0 || m + n > 1) continue;
            const z = d[j] + m * (d[b] - d[j]) + n * (d[c] - d[j]),
              at = y * fixture + x;
            if (z > depth[at]) {
              depth[at] = z;
              if (depth === inner) winners[at] = id;
            }
          }
      }
    }
    for (let k = 0; k < inner.length; k++) {
      if (winners[k] < 0) continue;
      sampled++;
      if (inner[k] <= skin[k] + 0.0005) continue;
      exposed++;
      if (Number.isFinite(skin[k])) worst = Math.max(worst, inner[k] - skin[k]);
      const name = visible[winners[k]].name;
      counts.set(name, (counts.get(name) || 0) + 1);
      if (/ femur$/.test(name) || (process.env.SKELETON_WITNESSES && !witnesses[name])) {
        const u = ((k % fixture) + 0.5 - fixture / 2) / scale,
          v = (Math.floor(k / fixture) + 0.5 - fixture / 2) / scale;
        const dy = v * ct + inner[k] * st,
          dz = inner[k] * ct - v * st;
        const world = [centre.x + cs * u + ss * dz, centre.y + dy, centre.z - ss * u + cs * dz];
        if (!witnesses[name]) witnesses[name] = world;
        if (/ femur$/.test(name)) {
          const hip = pelvis[name.startsWith('Left') ? 'L' : 'R'];
          const axis = hip.knee.clone().sub(hip.femoralHead);
          const t = new T.Vector3(...world).sub(hip.femoralHead).dot(axis) / axis.lengthSq();
          const region = t < 0.33 ? 'proximal' : t < 0.72 ? 'shaft' : 'distal';
          femurRegions[region] = (femurRegions[region] || 0) + 1;
        }
      }
    }
  }
  return {
    ...(bonesOnly ? { layers: 'skeleton against skin' } : {}),
    sampled,
    exposedFemurByRegion: femurRegions,
    ...(process.env.SKELETON_WITNESSES
      ? {
          worldWitnessesInches: Object.fromEntries(
            Object.entries(witnesses).map(([name, xyz]) => [name, xyz.map((n) => describe(n / inch))]),
          ),
        }
      : {}),
    exposed,
    maximumRayDepthInches: describe(worst / inch),
    parts: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])),
  };
}

function nearestSurface(mesh, rayOrigin, direction) {
  // Double-sided intersections report a central articular surface even when
  // the ray starts inside a closed bone. Geometry is in posed world space.
  const g = mesh.geometry,
    p = g.attributes.position,
    index = g.index.array;
  const ray = new T.Ray(rayOrigin, direction),
    a = new T.Vector3(),
    b = a.clone(),
    c = a.clone(),
    q = a.clone();
  let nearest = Infinity;
  for (let i = 0; i < index.length; i += 3) {
    a.fromBufferAttribute(p, index[i]);
    b.fromBufferAttribute(p, index[i + 1]);
    c.fromBufferAttribute(p, index[i + 2]);
    if (ray.intersectTriangle(a, b, c, false, q)) nearest = Math.min(nearest, rayOrigin.distanceTo(q));
  }
  return nearest;
}
// Sample the actual cortex, including at a truncated open notch. The median
// of a small directional fan is less sensitive to CT facets than a single ray.
function jointSeat(ball, socket, center, direction) {
  const axis = direction.clone().normalize();
  const transverse = new T.Vector3(0, 1, 0).projectOnPlane(axis).normalize();
  const sagittal = new T.Vector3().crossVectors(axis, transverse);
  const distances = [];
  for (const [u, v] of [
    [0, 0],
    [0.1, 0],
    [-0.1, 0],
    [0, 0.1],
    [0, -0.1],
  ]) {
    const ray = axis.clone().addScaledVector(transverse, u).addScaledVector(sagittal, v).normalize();
    const a = nearestSurface(ball, center, ray);
    const b = nearestSurface(socket, center, ray);
    if (Number.isFinite(a) && Number.isFinite(b)) distances.push((b - a) / inch);
  }
  distances.sort((a, b) => a - b);
  return {
    hits: distances.length,
    medianIn: describe(distances[Math.floor(distances.length / 2)] ?? NaN),
    worstIn: describe(distances.reduce((max, v) => Math.max(max, Math.abs(v)), 0)),
  };
}

function boundsAlong(geometry, axis) {
  const p = geometry.attributes.position,
    v = new T.Vector3();
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const c = v.fromBufferAttribute(p, i).dot(axis);
    min = Math.min(min, c);
    max = Math.max(max, c);
  }
  return { min, max };
}

// Area-weighted orientation of the actual cortical faces on the anterior
// central vertebral body. Exclude the posterior arch, sacral alae, vertical
// walls and sides; each included face contributes its outward area vector.
function plateSlope(geometry, frame, top) {
  const p = geometry.attributes.position,
    ix = geometry.index.array;
  const x = boundsAlong(geometry, frame.x),
    y = boundsAlong(geometry, frame.y),
    z = boundsAlong(geometry, frame.z);
  const a = new T.Vector3(),
    b = a.clone(),
    c = a.clone(),
    center = a.clone();
  const sum = new T.Vector3();
  const direction = top ? 1 : -1;
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]);
    b.fromBufferAttribute(p, ix[i + 1]);
    c.fromBufferAttribute(p, ix[i + 2]);
    center.copy(a).add(b).add(c).divideScalar(3);
    const u = (center.dot(frame.x) - x.min) / (x.max - x.min);
    const v = (center.dot(frame.y) - y.min) / (y.max - y.min);
    const w = (center.dot(frame.z) - z.min) / (z.max - z.min);
    if (u < 0.28 || u > 0.72 || w < 0.55 || w > 0.95 || (top ? v < 0.48 : v > 0.52)) continue;
    const normal = b.sub(a).cross(c.sub(a)).multiplyScalar(direction);
    if (normal.dot(frame.y) > 0.45 * normal.length()) sum.add(normal);
  }
  return sum.lengthSq() ? T.MathUtils.radToDeg(Math.atan2(sum.dot(frame.z), sum.dot(frame.y))) : null;
}

// Re-read posed cortical triangles and the final muscle vertices after skin
// fitting, independently of the attachment coordinates stored by registration.
function nearestCortex(geom, point, closest) {
  const positions = geom.attributes.position,
    indices = geom.index.array,
    triangle = new T.Triangle(),
    q = new T.Vector3();
  let best = Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    triangle.a.fromBufferAttribute(positions, indices[i]);
    triangle.b.fromBufferAttribute(positions, indices[i + 1]);
    triangle.c.fromBufferAttribute(positions, indices[i + 2]);
    triangle.closestPointToPoint(point, q);
    const d = q.distanceToSquared(point);
    if (d < best) {
      best = d;
      closest?.copy(q);
    }
  }
  return Math.sqrt(best);
}
function atlasRegistration(model, bones) {
  const tissues = model.parts.filter((p) => p.muscleNode),
    distances = [],
    byFamily = {};
  const pose = new T.Vector3();
  for (const part of tissues) {
    for (const a of part.attachments) {
      const distance =
        nearestCortex(
          bones.get(a.bone),
          pose.fromBufferAttribute(part.mesh.geometry.attributes.position, a.index),
        ) / inch;
      distances.push(distance);
      byFamily[part.region] = Math.max(byFamily[part.region] ?? 0, distance);
    }
  }
  distances.sort((a, b) => a - b);
  return {
    individualMeshes: tissues.length,
    dbcls: tissues.filter((p) => !p.source.includes('Andreassen')).length,
    visibleHumanFemale: tissues.filter((p) => p.source.includes('Andreassen')).length,
    corticalVertices: distances.length,
    musclesWithCorticalVertices: tissues.filter((p) => p.attachments.length).length,
    p95GapInches: describe(distances[Math.floor(0.95 * (distances.length - 1))]),
    maxGapInches: describe(distances.at(-1)),
    maxGapByRegion: Object.fromEntries(Object.entries(byFamily).map(([k, d]) => [k, describe(d)])),
  };
}
function landmarks(model, lm) {
  const bones = lm.scan.bones;
  const { pelvis, shoulders } = lm;
  const axis = (x, y, z) =>
    pelvis
      .place(x, y, z)
      .sub(pelvis.place(0, 0, 0))
      .normalize();
  const frame = { x: axis(1, 0, 0), y: axis(0, 1, 0), z: axis(0, 0, 1) };
  const width = (first, second) =>
    (boundsAlong(bones.get(first), frame.x).max - boundsAlong(bones.get(second), frame.x).min) / inch;
  const invalidNormals = [];
  for (const [name, geometry] of bones) {
    const normal = geometry.attributes.normal;
    if (
      !normal ||
      normal.count !== geometry.attributes.position.count ||
      !normal.array.every(Number.isFinite)
    )
      invalidNormals.push(name);
  }
  const report = {
    bones: bones.size,
    invalidBoneNormals: invalidNormals,
    ribs: [...bones.keys()].filter((n) => /^RIB_/.test(n)).length,
    vertebrae: [...bones.keys()].filter((n) => /^VERTEBRA_/.test(n)).length,
    crestWidth: describe(width('HIP_LEFT', 'HIP_RIGHT')),
    clavicularSpan: describe(width('CLAVICLE_LEFT', 'CLAVICLE_RIGHT')),
    corticalAttachmentSamples: lm.scan.attachments.length,
    muscleAtlas: atlasRegistration(model, bones),
  };
  for (const [side, full] of [
    ['L', 'LEFT'],
    ['R', 'RIGHT'],
  ]) {
    const socket = pelvis[side],
      arm = shoulders[side];
    const structure = (id) => ({ name: id, geometry: bones.get(id + '_' + full) });
    report[side] = {
      coronalQAngleDeg: (() => {
        const asis = new T.Vector3(),
          tuberosity = new T.Vector3(),
          patella = bones.get('PATELLA_' + full).boundingBox.getCenter(new T.Vector3());
        nearestCortex(bones.get('HIP_' + full), socket.asis, asis);
        nearestCortex(bones.get('TIBIA_' + full), socket.tibialTuberosity, tuberosity);
        return describe(
          angle(asis.sub(patella).projectOnPlane(frame.z), patella.sub(tuberosity).projectOnPlane(frame.z)),
        );
      })(),
      shoulder: jointSeat(
        structure('HUMERUS'),
        structure('SCAPULA'),
        arm.headCenter,
        arm.shoulderNormal.clone().negate(),
      ),
      hip: jointSeat(
        structure('FEMUR'),
        structure('HIP'),
        socket.femoralHead,
        socket.socketAxis.clone().negate(),
      ),
    };
  }
  const upper = plateSlope(bones.get('VERTEBRA_T2'), frame, true);
  const lower = plateSlope(bones.get('VERTEBRA_T12'), frame, false);
  const sacrum = plateSlope(bones.get('SACRUM'), frame, true);
  report.corticalEndplateAngle = {
    thoracicDeg: upper === null || lower === null ? null : describe(Math.abs(upper - lower)),
    lumbarDeg: lower === null || sacrum === null ? null : describe(Math.abs(lower - sacrum)),
  };
  return report;
}

// A left leg raise for the three-layer registration photograph. The existing
// controller supplies balance, facial animation and all surface updates.
function raiseLeftLeg(rig, fraction) {
  rig.thighL.rotation.set(-1.22 * fraction, 0, 0.24 * fraction);
  rig.shinL.rotation.set(1.6 * fraction, 0, 0);
  rig.footL.rotation.set(-0.32 * fraction, 0, 0);
  rig.upperArmL.rotation.z += 0.55 * fraction;
  rig.upperArmL.rotation.x += 0.24 * fraction;
  rig.upperArmR.rotation.z -= 0.47 * fraction;
  rig.forearmL.rotation.x -= 0.3 * fraction;
  rig.forearmR.rotation.x -= 0.23 * fraction;
}
function raisedLegMeasures(rig, pelvis) {
  const { femoralHead, knee, ankle } = pelvis.L;
  const offset = (point, node) => describe(point.distanceTo(node.getWorldPosition(new T.Vector3())) / inch);
  return {
    thighFromVerticalDeg: describe(angle(origin(knee, femoralHead), new T.Vector3(0, -1, 0))),
    kneeFlexionDeg: describe(180 - angle(origin(femoralHead, knee), origin(ankle, knee))),
    ankleLiftIn: describe((ankle.y - pelvis.R.ankle.y) / inch),
    rigPivotOffsetsIn: {
      hip: offset(femoralHead, rig.thighL),
      knee: offset(knee, rig.shinL),
      ankle: offset(ankle, rig.footL),
    },
  };
}
const args = process.argv.slice(2),
  name = args[0],
  tier = args[1];
const defaultPoses = ['rest', 'walk', 'run', 'roll'];
if (
  !['sippy', 'roma'].includes(name) ||
  !['mobile', 'high'].includes(tier) ||
  args.slice(2).some((state) => !defaultPoses.includes(state) && state !== 'leg-raise')
)
  throw Error(
    'Use THREE_ROOT=/path/to/three node tools/check-axon-skeleton.mjs sippy|roma mobile|high [rest|walk|run|roll|leg-raise]',
  );
const build = (await characterModule(name))[name === 'roma' ? 'buildRoma' : 'buildSippy'];
let failures = 0;
for (const state of args.slice(2).length ? args.slice(2) : defaultPoses) {
  const rig = createActor(name, heights[names.indexOf(name)]),
    pose = build(rig),
    ctrl = createController(rig);
  setModelDetail(rig.root, tier);
  function step(input, raise = 0) {
    const f = ctrl.step(FIXED_DT, input);
    if (raise) raiseLeftLeg(rig, raise);
    pose(f);
    ctrl.finishPose();
  }
  if (state !== 'leg-raise') for (let i = 0; i < 12; i++) step(neutral);
  const frames =
    state === 'leg-raise' ? [18] : state === 'rest' ? [0] : state === 'roll' ? [4, 17, 30] : [28, 45, 65];
  let frame = 0;
  for (const target of frames) {
    while (frame < target) {
      if (state === 'leg-raise') step(neutral, Math.min((frame + 1) / 15, 1));
      else
        step({
          ...neutral,
          z: state === 'roll' ? 0 : 1,
          run: state === 'run',
          roll: state === 'roll' && frame === 0,
        });
      frame++;
    }
    let record;
    const snapshot = await snapshotDiagramModel(rig, tier, (l) => {
      record = l;
    });
    try {
      const report = baseline ? {} : landmarks(snapshot, record),
        skin = coverage(snapshot.parts, rig.height, record.pelvis);
      if (!baseline && process.env.AXON_BONES_ONLY === '1') {
        const extremity = /^(METACARPAL|METATARSAL|PHALANGE|LUNATE|SCAPHOID|PISIFORM|CAPITATE|HAMATE|TRIQUETRUM|TRAPEZOID|TRAPEZIUM|TALUS|CUBOID|[A-Z]+_CUNEIFORM|NAVICULAR|CALCANEUS)/;
        const parts = snapshot.parts.filter(p => p.layer === 'skin' || extremity.test(p.scanNode));
        const extremitySkin = coverage(parts, rig.height, record.pelvis);
        skin.handAndFoot = { sampled: extremitySkin.sampled, exposed: extremitySkin.exposed };
      }
      if (!baseline && state === 'leg-raise') report.legRaise = raisedLegMeasures(rig, record.pelvis);
      console.log(
        JSON.stringify({
          name,
          tier,
          pose: state,
          frame,
          controller: ctrl.frame.state,
          measures: report,
          skin,
        }),
      );
      if (baseline) continue;
      if (
        report.bones !== (name === 'roma' ? 143 : 142) ||
        report.invalidBoneNormals.length ||
        report.ribs !== 24 ||
        report.vertebrae !== (name === 'roma' ? 25 : 24) ||
        !report.corticalAttachmentSamples ||
        report.muscleAtlas.dbcls !== (name === 'roma' ? 263 : 323) ||
        report.muscleAtlas.visibleHumanFemale !== (name === 'roma' ? 76 : 0) ||
        report.muscleAtlas.maxGapInches > 0.02 ||
        skin.exposed ||
        skin.handAndFoot?.exposed ||
        [report.L.shoulder, report.R.shoulder, report.L.hip, report.R.hip].some(
          (r) => r.hits < 3 || r.worstIn > 0.25,
        )
      )
        failures++;
    } finally {
      snapshot.dispose();
    }
  }
}
process.exitCode = failures ? 1 : 0;
