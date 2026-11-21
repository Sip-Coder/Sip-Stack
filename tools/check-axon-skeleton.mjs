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
const { createController, FIXED_DT } = await import('../docs/characters/motion.js');
const { snapshotDiagramModel } = await import('../docs/characters/diagram-parts.js');
const { setModelDetail } = await import('../docs/characters/model-tier.js');
const { names, heights } = await import('../docs/characters/ui.js');
const inch = 0.0254,
  angle = (a, b) => T.MathUtils.radToDeg(a.angleTo(b));
const origin = (a, b) => a.clone().sub(b);
const describe = (value) => +value.toFixed(3);
const neutral = { x: 0, z: 0, run: false, roll: false, emote: false, jump: false };

// Rasterize the actual deformed triangle buffers with barycentric depth.
// Compare at each pixel with skin only, never with the boot or garment exterior.
function coverage(parts, H) {
  const visible = parts.filter(
    (p) =>
      ['skeleton', 'muscles', 'skin'].includes(p.layer) &&
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
    witnesses = {};
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
      if (process.env.SKELETON_WITNESSES && !witnesses[name]) {
        const u = ((k % fixture) + 0.5 - fixture / 2) / scale,
          v = (Math.floor(k / fixture) + 0.5 - fixture / 2) / scale;
        const dy = v * ct + inner[k] * st,
          dz = inner[k] * ct - v * st;
        witnesses[name] = [centre.x + cs * u + ss * dz, centre.y + dy, centre.z - ss * u + cs * dz];
      }
    }
  }
  return {
    sampled,
    ...(process.env.SKELETON_WITNESSES ? { worldWitnessesInches: Object.fromEntries(Object.entries(witnesses).map(([name, xyz])=>[name,xyz.map(n=>describe(n/inch))])) } : {}),
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
  if (!Number.isFinite(nearest)) throw Error('Missing articular surface on ' + mesh.name);
  return nearest;
}
// Sum the area vectors around the actual authored endplate. The outward
// direction only chooses which of the two equivalent normal signs to report.
function endplateNormal(mesh, rim, superior) {
  const position = mesh.geometry.getAttribute('position');
  const point = (i) => new T.Vector3().fromBufferAttribute(position, rim[i]);
  const start = point(0),
    normal = new T.Vector3();
  for (let i = 1; i < rim.length - 1; i++)
    normal.add(
      point(i)
        .sub(start)
        .cross(point(i + 1).sub(start)),
    );
  if (normal.lengthSq() < 1e-14) throw Error('Degenerate endplate on ' + mesh.name);
  normal.normalize();
  return normal.dot(superior) < 0 ? normal.negate() : normal;
}
function landmarks(model, lm) {
  const byName = new Map(model.parts.map((p) => [p.name, p.mesh]));
  const { thorax: t, pelvis: p, shoulders, head } = lm;
  const spinal = t.spineLevels;
  const results = {};
  const across = p
    .place(1, 0, 0)
    .sub(p.place(0, 0, 0))
    .normalize();
  const anterior = p
    .place(0, 0, 1)
    .sub(p.place(0, 0, 0))
    .normalize();
  const superior = p
    .place(0, 1, 0)
    .sub(p.place(0, 0, 0))
    .normalize();
  function coordinateExtreme(mesh, direction) {
    const a = mesh.geometry.getAttribute('position'),
      point = new T.Vector3();
    let maximum = -Infinity;
    for (let i = 0; i < a.count; i++)
      maximum = Math.max(maximum, point.fromBufferAttribute(a, i).dot(direction));
    return maximum;
  }
  const breadth =
    coordinateExtreme(byName.get('Left hip bone'), across) +
    coordinateExtreme(byName.get('Right hip bone'), across.clone().negate());
  for (const [side, label] of [
    ['L', 'Left'],
    ['R', 'Right'],
  ]) {
    const s = shoulders[side],
      h = p[side];
    // Ray from the middle of the ball through the centre of its socket.
    const medial = s.shoulderNormal.clone().negate();
    const spine = spinal.get('T3');
    const fromSpine = origin(s.spineRoot, spine.spinous).dot(s.axes.x);
    results[side] = {
      shoulderGap: describe(
        (nearestSurface(byName.get(label + ' scapula'), s.headCenter, medial) -
          nearestSurface(byName.get(label + ' humerus'), s.headCenter, medial)) /
          inch,
      ),
      hipGap: describe(
        (nearestSurface(byName.get(label + ' hip bone'), h.femoralHead, h.socketAxis.clone().negate()) -
          nearestSurface(byName.get(label + ' femur'), h.femoralHead, h.socketAxis.clone().negate())) /
          inch,
      ),
      clavicle: describe(s.clavicle.slice(1).reduce((n, v, i) => n + v.distanceTo(s.clavicle[i]), 0) / inch),
      scapulaMedialOffset: describe(fromSpine / inch),
      headToAnimationPivot: describe(s.headCenter.distanceTo(s.armPivot) / inch),
      qAngle: describe(
        angle(
          origin(h.asis, h.patella).projectOnPlane(anterior),
          origin(h.patella, h.tibialTuberosity).projectOnPlane(anterior),
        ),
      ),
      sciaticNotch: describe(
        angle(
          origin(h.sciaticUpper, h.sciaticApex).projectOnPlane(across),
          origin(h.sciaticSpine, h.sciaticApex).projectOnPlane(across),
        ),
      ),
      crestAboveHead: describe(origin(h.crest, h.femoralHead).dot(superior) / inch),
      femoralInclination: describe(angle(origin(h.femoralHead, h.junction), origin(h.knee, h.junction))),
      mastoidToOcciput: describe(head.sides[side].mastoid.distanceTo(head.occiput) / inch),
    };
  }
  const ribDrop = Array.from(
    { length: 12 },
    (_, i) => origin(t.rib('L', i + 1, 0), t.rib('L', i + 1, 1)).dot(t.chest.direction(0, 1, 0)) / inch,
  );
  const t2 = spinal.get('T2'),
    t12 = spinal.get('T12');
  const top = endplateNormal(byName.get('Thoracic vertebra T2'), t2.topPlaneVertices, t2.superiorNormal);
  const bottom = endplateNormal(
    byName.get('Thoracic vertebra T12'),
    t12.bottomPlaneVertices,
    t12.inferiorNormal,
  );
  const sacral = endplateNormal(byName.get('Sacrum'), p.s1PlaneVertices, p.s1Normal);
  return {
    ...results,
    crestWidth: describe(breadth / inch),
    pubicArch: describe(
      angle(
        origin(p.L.ramus, p.L.inferiorPubis).projectOnPlane(anterior),
        origin(p.R.ramus, p.R.inferiorPubis).projectOnPlane(anterior),
      ),
    ),
    thoracicCobb: describe(angle(top, bottom)),
    lumbarCobb: describe(angle(bottom, sacral)),
    ribDrop: ribDrop.map(describe),
    ribs: [...byName.keys()].filter((n) => /^(Left|Right) rib \d+$/.test(n)).length,
    vertebrae: spinal.size,
  };
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
const build = (await import(`../docs/characters/${name}.js`))[name === 'roma' ? 'buildRoma' : 'buildSippy'];
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
      const report = landmarks(snapshot, record),
        skin = coverage(snapshot.parts, rig.height);
      if (state === 'leg-raise') report.legRaise = raisedLegMeasures(rig, record.pelvis);
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
      if (
        report.ribs !== 24 ||
        report.vertebrae !== 24 ||
        skin.exposed ||
        [report.L, report.R].some((r) => Math.abs(r.shoulderGap) > 0.25 || Math.abs(r.hipGap) > 0.25)
      )
        failures++;
    } finally {
      snapshot.dispose();
    }
  }
}
process.exitCode = failures ? 1 : 0;
