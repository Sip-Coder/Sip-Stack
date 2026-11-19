// These are the production scene builders, material-free simulation updates and
// genuine Three world transforms. The CLI wraps the worker factory to observe IK.
import * as T from 'three';
import { buildForCheck } from '../docs/assets/sip-village.js';
import { buildHarbor } from '../docs/assets/sip-craft-harbor.js';
import { cellar } from '../docs/assets/sip-creek-cellar.js';
import { seed } from '../docs/life/forms.js';

const xyz = new T.Vector3(),
  q = new T.Vector3(),
  tmp = new T.Vector3(),
  toSpace = new T.Matrix4();
let pointGap;
const frames = 1800,
  names = ['Village', 'Tidelight', 'Creek'];
const obb = (name, x, z, hx, hz, bottom, top, radius = 0) => ({
  name,
  x,
  z,
  hx,
  hz,
  bottom,
  top,
  radius,
  angle: 0,
});
function originalObstacles(scene) {
  if (scene === 'Creek')
    return [
      obb('main cask', -0.42, 0, 0.61, 0.836, 0.56, 1.52),
      obb('standing cask', 1.08, -0.51, 0, 0, 0.1, 1.36, 0.47),
    ];
  if (scene === 'Tidelight') return [obb('tasting table', -2.5, 1.1, 0, 0, 3.315, 3.385, 0.31)];
  const all = [obb('picking bin', 3.35, -5.375, 0.2, 0.175, 5, 5.4)];
  for (const [x, z] of [
    [-8.6, 0.35],
    [-8.3, -0.85],
    [-6.6, 0.5],
    [-6.75, -0.9],
  ]) {
    all.push(obb('table', x, z, 0, 0, 1.775, 1.825, 0.42));
    for (const [dx, dz] of [
      [0.55, 0],
      [-0.55, 0],
      [0, -0.55],
    ])
      all.push(obb('chair', x + dx, z + dz, 0.14, 0.13, 1.1, 1.5));
  }
  for (const x of [-3.5, -0.5, 2.5, 6, 9]) all.push(obb('bollard', x, 1.25, 0, 0, 1.05, 1.45, 0.12));
  return all;
}
function originalHeight(name, x, z) {
  if (name === 'Cooper') return 0.098;
  if (name === 'Pier hand') return 0.731;
  if (name === 'Terrace taster') return 2.88;
  if (name === 'Porter') return z > 1.5 ? 1 : 1.05;
  if (name === 'Harvester') return 5;
  if (name === 'Cellar worker') return 3.04;
  if (name === 'Stair walker') {
    for (let i = 0; i < 3; i++) {
      const d = 0.1 - 3 * i - z;
      if (d < 0) return 1.05 + 2 * i;
      if (d < 1.6) return 1 + 2 * i + 0.25 * (1 + Math.floor(d / 0.2));
    }
    return 7.05;
  }
  return 1.1;
}
// Signed Euclidean distance to the finite cylinder or oriented prism.
function clearance(p, o, r) {
  if (o.stave && pointGap) return pointGap(o, p.x, p.y, p.z) - r;
  const dx = p.x - o.x,
    dz = p.z - o.z,
    v = Math.max(o.bottom - p.y, p.y - o.top);
  let h;
  if (o.radius > 0) h = Math.hypot(dx, dz) - o.radius;
  else {
    const c = Math.cos(o.angle || 0),
      s = Math.sin(o.angle || 0),
      x = Math.abs(dx * c - dz * s) - o.hx,
      z = Math.abs(dx * s + dz * c) - o.hz;
    h = Math.hypot(Math.max(0, x), Math.max(0, z)) + Math.min(0, Math.max(x, z));
  }
  return Math.hypot(Math.max(0, h), Math.max(0, v)) + Math.min(0, Math.max(h, v)) - r;
}
function closestCapsule(a, b, ar, br, o) {
  const d = Math.max(o.radius || 0, Math.hypot(o.hx || 0, o.hz || 0)) + Math.max(ar, br);
  if (
    o.x < Math.min(a.x, b.x) - d ||
    o.x > Math.max(a.x, b.x) + d ||
    o.z < Math.min(a.z, b.z) - d ||
    o.z > Math.max(a.z, b.z) + d ||
    o.top < Math.min(a.y, b.y) - Math.max(ar, br) ||
    o.bottom > Math.max(a.y, b.y) + Math.max(ar, br)
  )
    return Infinity;
  let lo = 0,
    hi = 1;
  function sample(t) {
    return clearance(tmp.lerpVectors(a, b, t), o, ar + (br - ar) * t);
  }
  for (let n = 0; n < 12; n++) {
    const u = (2 * lo + hi) / 3,
      v = (lo + 2 * hi) / 3;
    if (sample(u) < sample(v)) hi = v;
    else lo = u;
  }
  return Math.min(sample(0), sample(1), sample((lo + hi) / 2));
}
// Minimise distance between the two spheres swept along each tapered axis.
// The inner point-to-segment minimum has a closed form; the outer function is convex.
function sweptGap(a, b) {
  const pad = Math.max(a.r, a.s) + Math.max(b.r, b.s);
  for (const k of ['x', 'y', 'z']) {
    if (
      Math.max(a.a[k], a.b[k]) + pad < Math.min(b.a[k], b.b[k]) ||
      Math.max(b.a[k], b.b[k]) + pad < Math.min(a.a[k], a.b[k])
    )
      return Infinity;
  }
  const dx = b.b.x - b.a.x,
    dy = b.b.y - b.a.y,
    dz = b.b.z - b.a.z,
    l2 = dx * dx + dy * dy + dz * dz,
    dr = b.s - b.r;
  function sample(t) {
    const x = a.a.x + t * (a.b.x - a.a.x) - b.a.x,
      y = a.a.y + t * (a.b.y - a.a.y) - b.a.y,
      z = a.a.z + t * (a.b.z - a.a.z) - b.a.z;
    const h = l2 ? (x * dx + y * dy + z * dz) / l2 : 0;
    let u;
    if (l2 <= dr * dr) u = dr > 0 ? 1 : 0;
    else
      u = T.MathUtils.clamp(
        h + (dr * Math.hypot(x - h * dx, y - h * dy, z - h * dz)) / Math.sqrt(l2 * (l2 - dr * dr)),
        0,
        1,
      );
    return Math.hypot(x - u * dx, y - u * dy, z - u * dz) - (a.r + t * (a.s - a.r) + b.r + u * dr);
  }
  let lo = 0,
    hi = 1;
  for (let n = 0; n < 18; n++) {
    const u = (2 * lo + hi) / 3,
      v = (lo + 2 * hi) / 3;
    if (sample(u) < sample(v)) hi = v;
    else lo = u;
  }
  return Math.min(sample(0), sample(1), sample((lo + hi) * 0.5));
}

const quat = new T.Quaternion(),
  twist = new T.Quaternion(),
  deg = 180 / Math.PI;
function limitError(track) {
  let worst = 0;
  const excess = (v, m) => {
    worst = Math.max(worst, Math.abs(v) - m);
  };
  function cone(b, flex, roll) {
    if (!b) return;
    const q = b.quaternion,
      s = q.w < 0 ? -1 : 1;
    twist.set(0, s * q.y, 0, s * q.w).normalize();
    excess(2 * deg * Math.atan2(twist.y, twist.w), roll);
    quat.copy(q).multiply(twist.invert());
    excess(2 * deg * Math.acos(Math.min(1, Math.abs(quat.w))), flex);
  }
  for (const side of track.b.sides) {
    for (const [b, sign] of [
      [side.elbow, -1],
      [side.shin, 1],
    ]) {
      const a = b.rotation;
      worst = Math.max(
        worst,
        -sign * a.x * deg,
        sign * a.x * deg - 150,
        Math.abs(a.y) * deg,
        Math.abs(a.z) * deg,
      );
    }
    cone(side.hand, 70, 80);
  }
  for (const bone of track.spines) cone(bone, 15, 15);
  for (const bone of track.necks) cone(bone, 70, 70);
  return worst;
}
function bones(actor) {
  const sk = actor.rig?.bones || actor.skeleton.bones,
    sides = actor.rig?.sides;
  const find = (name, i = 0) => sk.filter((b) => b.name === name)[i];
  return {
    head: actor.rig ? sk[actor.rig.head] || find('head') : find('head'),
    pelvis: actor.hip,
    chest: find('chest'),
    sides: [0, 1].map((i) => {
      if (sides) return Object.fromEntries(Object.entries(sides[i]).map(([k, v]) => [k, sk[v] || v]));
      return {
        arm: find('shoulder', i),
        elbow: find('elbow', i),
        hand: find('wrist', i),
        thigh: find('hip', i),
        shin: find('knee', i),
        ankle: find('ankle', i),
      };
    }),
  };
}
const zero = new T.Vector3(),
  matrix = new T.Matrix4();
const vec = () => new T.Vector3();
function tracks(scene, nav) {
  const result = [];
  for (const record of globalThis.probedActors) {
    const { a, name } = record;
    if (!a.g.parent || !scene.getObjectById(a.g.id)) continue;
    const b = bones(a),
      segments = [];
    function seg(n, start, end, r, s = r, offset = 0, endOffset = 0) {
      segments.push({ n, start, end, r, s, offset, endOffset, a: vec(), b: vec() });
    }
    seg('pelvis', b.pelvis, b.pelvis, 0.13, 0.13, 0, 0.08);
    seg('torso', b.pelvis, b.chest, 0.12, 0.14, 0.15, 0.04);
    seg('head', b.head, b.head, 0.078, 0.077, 0.07, 0.15);
    for (const k of b.sides) {
      seg('arm', k.arm, k.elbow, 0.053, 0.04);
      seg('forearm', k.elbow, k.hand, 0.04, 0.028);
      seg('hand', k.hand, k.hand, 0.028, 0.023, -0.034, -0.116);
      seg('thigh', k.thigh, k.shin, 0.073, 0.05);
      seg('shin', k.shin, k.ankle, 0.046, 0.032);
    }
    const all = a.rig?.bones || a.skeleton.bones,
      agent = nav?.agents.find((p) => p.actor === a);
    const spines = all.filter((b) => /^(lumbar|chest|spine [123])$/.test(b.name));
    const necks = all.filter((b) => /^neck/.test(b.name));
    const propSegments = (agent?.props || []).map((p) => ({
      p,
      n: p.object.name || 'held prop',
      a: vec(),
      b: vec(),
      r: 0,
      s: 0,
    }));
    result.push({
      record,
      b,
      agent,
      spines,
      necks,
      segments,
      propSegments,
      stats: {
        groundErrorMm: 0,
        bothAirFrames: 0,
        collisionFrames: 0,
        minClearanceMm: 0,
        selfPropFrames: 0,
        missingGripFrames: 0,
        limitExcessDeg: 0,
        selfHitFrames: 0,
        gripErrorMm: 0,
        gripFrames: 0,
        footFrames: 0,
        worstObstacle: null,
        worstPart: null,
      },
    });
  }
  return result;
}
const boatSpace = new T.Matrix4();
const historicalDeck = (x) => 0.204 + 0.094 * Math.abs(Math.round(x / 0.103) * 0.103) ** 3;
function floorError(actor, track, i, floor, inverse) {
  const f = actor.feet?.[i],
    ankle = f?.ankle || track.b.sides[i].ankle;
  function sample(x, z, point) {
    if (point) xyz.copy(point);
    else xyz.set(x, -0.077, z);
    xyz.applyMatrix4(ankle.matrixWorld).applyMatrix4(inverse);
    return (xyz.y - floor(xyz.x, xyz.z)) / actor.g.scale.y;
  }
  return [sample(0, -0.064, f?.heel), sample(0, 0.167, f?.toe)];
}
function inspect(track, space, nav, obstacles, frame) {
  const { record, b, segments, propSegments, agent, stats } = track,
    { a, name } = record,
    g = a.g,
    scale = g.scale.y;
  g.updateWorldMatrix(true, true);
  space.updateWorldMatrix(true, false);
  toSpace.copy(space.matrixWorld).invert();
  for (const s of segments) {
    s.a.set(0, s.offset, 0).applyMatrix4(s.start.matrixWorld).applyMatrix4(toSpace);
    s.b.set(0, s.endOffset, 0).applyMatrix4(s.end.matrixWorld).applyMatrix4(toSpace);
  }
  if (a.dynamics) {
    // Physics colliders use the same rig-local basis as the body mesh.
    const { capsules: c, names } = a.dynamics;
    track.physicsSegments ||= names.map((n) => ({ n, a: vec(), b: vec() }));
    for (let i = 0; i < names.length; i++) {
      const s = track.physicsSegments[i],
        k = i * 8;
      s.a.fromArray(c, k).applyMatrix4(g.matrixWorld).applyMatrix4(toSpace);
      s.b
        .fromArray(c, k + 4)
        .applyMatrix4(g.matrixWorld)
        .applyMatrix4(toSpace);
      s.r = c[k + 3] * scale;
      s.s = c[k + 7] * scale;
    }
  }
  for (const s of propSegments) {
    const p = s.p;
    if (!p.object.visible) {
      s.hidden = true;
      continue;
    }
    s.hidden = false;
    p.object.updateWorldMatrix(true, false);
    const half = p.halfLength || 0;
    s.a.copy(p.center || zero);
    s.a[p.axis || 'y'] -= half;
    s.b.copy(p.center || zero);
    s.b[p.axis || 'y'] += half;
    s.a.applyMatrix4(p.object.matrixWorld).applyMatrix4(toSpace);
    s.b.applyMatrix4(p.object.matrixWorld).applyMatrix4(toSpace);
    s.r = s.s = p.radius * matrix.multiplyMatrices(toSpace, p.object.matrixWorld).getMaxScaleOnAxis();
  }
  // Store radii in the same coordinates as the sampled positions.
  for (const s of segments) {
    s.rWorld ??= s.r * scale;
    s.sWorld ??= s.s * scale;
    s.r = s.rWorld;
    s.s = s.sWorld;
  }
  const actual = track.physicsSegments || segments,
    activeProps = propSegments.filter((p) => !p.hidden);
  track.testSegments = [...actual, ...activeProps];
  stats.limitExcessDeg = Math.max(stats.limitExcessDeg, limitError(track));
  {
    const seated = name === 'Oarsman';
    const floor = seated
      ? agent?.deckHeight || historicalDeck
      : nav?.floor || ((x, z) => originalHeight(name, x, z));
    const inverse = seated ? boatSpace.copy(g.parent.matrixWorld).invert() : toSpace;
    const sols = [floorError(a, track, 0, floor, inverse), floorError(a, track, 1, floor, inverse)];
    const walking = record.action === 'walk' || record.action === 'carry';
    const nearest = Math.max(...sols[0].map(Math.abs)) < Math.max(...sols[1].map(Math.abs)) ? 0 : 1;
    if (walking && Math.min(...sols[0], ...sols[1]) > 0.02) stats.bothAirFrames++;
    for (let i = 0; i < 2; i++)
      if (a.feet ? a.feet[i].planted : !walking || i === nearest) {
        stats.footFrames++;
        const [heel, toe] = sols[i].map((e) => e * 1000);
        if (Math.max(Math.abs(heel), Math.abs(toe)) > stats.groundErrorMm) {
          stats.groundErrorMm = Math.max(Math.abs(heel), Math.abs(toe));
          stats.worstFoot = {
            frame,
            i,
            heel: Math.round(heel * 10) / 10,
            toe: Math.round(toe * 10) / 10,
            root: g.position.toArray().map((v) => +v.toFixed(3)),
            foot: a.feet?.[i]?.hold.toArray().map((v) => +v.toFixed(3)),
          };
        }
      }
  }
  let hit = false,
    self = false;
  for (const s of track.testSegments) {
    for (const o of obstacles) {
      if (o === agent?.support || (!nav && name === 'Oarsman' && /boat|skiff|hull/i.test(o.name))) continue;
      const dist = (closestCapsule(s.a, s.b, s.r, s.s, o) * 1000) / scale;
      if (dist < 0) {
        hit = true;
        if (dist < stats.minClearanceMm) {
          stats.minClearanceMm = dist;
          stats.worstObstacle = o.name;
          stats.worstPart = s.n;
          stats.obstacleFrame = frame;
        }
      }
    }
  }
  const hands = actual.filter((p) => /hand|palm/i.test(p.n)),
    core = actual.filter((p) => /torso|head|chest|abdomen|thorax/i.test(p.n));
  for (const h of hands) for (const s of core) if (sweptGap(h, s) < 0) self = true;
  let propHit = false;
  for (const prop of activeProps)
    for (const core of actual) {
      if (!/thigh|shin|pelvis|torso|head|chest|abdomen|thorax/i.test(core.n)) continue;
      const depth = (-sweptGap(prop, core) * 1000) / scale;
      if (depth > 0) {
        propHit = true;
        if (depth > (stats.propDepthMm || 0)) {
          stats.propDepthMm = depth;
          stats.propCore = core.n;
          stats.propFrame = frame;
        }
      }
    }
  if (propHit) stats.selfPropFrames++;
  if (hit) stats.collisionFrames++;
  if (self) stats.selfHitFrames++;
  const needed =
    record.action === 'carry' ||
    record.action === 'pick' ||
    record.action === 'row' ||
    record.action === 'inspect'
      ? 2
      : record.action === 'taste' || name === 'Harvester'
        ? 1
        : 0;
  if (record.targets.filter(Boolean).length < needed) stats.missingGripFrames++;
  for (let i = 0; i < 2; i++)
    if (record.targets[i]) {
      const socket = a.palms?.[i] || a.hands[i];
      socket.getWorldPosition(xyz);
      record.targets[i].getWorldPosition(q);
      stats.gripFrames++;
      const gap = (1000 * xyz.distanceTo(q)) / scale;
      if (gap > stats.gripErrorMm) {
        stats.gripErrorMm = gap;
        stats.gripFrame = frame;
        stats.gripSide = i;
      }
    }
}
function checkCrowd(group, space, obstacles) {
  if (!group) return null;
  const shader = { uniforms: {}, vertexShader: '' };
  group.material.onBeforeCompile(shader);
  const { width, height, data } = shader.uniforms.poses.value.image;
  const volumes = [],
    bad = [];
  const m = new T.Matrix4(),
    inv = new T.Matrix4();
  space.updateWorldMatrix(true, false);
  inv.copy(space.matrixWorld).invert();
  group.updateWorldMatrix(true, false);
  for (let i = 0; i < group.count; i++) {
    group.getMatrixAt(i, m);
    const transform = m.clone().premultiply(group.matrixWorld).premultiply(inv),
      root = vec().setFromMatrixPosition(transform);
    const unit = transform.getMaxScaleOnAxis(),
      r = 0.14 * unit;
    const a = root.clone();
    a.y += r;
    const b = root.clone();
    b.y += unit * 1.6;
    volumes.push({ n: 'VAT neighbour ' + (i + 1), a, b, r, s: r });
    const near = obstacles.filter((o) => clearance(root, o, 0) < 2 * unit);
    let min = Infinity;
    for (let j = 0; j < width * height; j++) {
      xyz.fromArray(data, j * 4).applyMatrix4(transform);
      for (const o of near) min = Math.min(min, clearance(xyz, o, 0));
    }
    if (min < 0) bad.push(i + 1);
  }
  return {
    volumes,
    stats: {
      count: group.count,
      bakedPoses: height,
      testedVertices: width * height * group.count,
      intersecting: bad.length,
      instances: bad,
    },
  };
}
async function simulate(name, mobile) {
  globalThis.probedActors = [];
  const s = new T.Scene(),
    camera = new T.PerspectiveCamera(),
    rng = seed(123);
  camera.position.set(2, 2, 3);
  let update;
  if (name === 'Village') {
    const dyn = buildForCheck(s);
    update = (t) => dyn.life(t, camera, mobile ? 'Mobile' : 'High');
  }
  if (name === 'Tidelight') {
    const harbor = buildHarbor(s, { seaTime: { value: 0 }, storm: { value: 0.1 } }, new T.DataTexture());
    update = (t) => harbor(t, 0.1, camera, mobile ? 0 : 2);
  }
  if (name === 'Creek') {
    const station = cellar(s, new T.MeshStandardMaterial(), rng);
    update = (t) => station.update(t, camera, mobile);
  }
  update(0);
  let local = s,
    nav;
  s.traverse((o) => {
    if (o.userData.peopleNav) {
      local = o;
      nav = o.userData.peopleNav;
    }
  });
  const built = tracks(s, nav);
  const people = built.filter((p) => p.record.a.g.visible);
  if (!nav && name === 'Creek') local = people[0].record.a.g.parent;
  const obstacles = nav?.obstacles || originalObstacles(name);
  const crowd = checkCrowd(s.getObjectByName('Tasting group'), local, obstacles);
  const failure = [],
    out = {};
  for (let f = 1; f <= frames; f++) {
    update(f / 30);
    for (const p of people) inspect(p, local, nav, obstacles, f);
    if (crowd)
      for (const p of people)
        for (const v of crowd.volumes) {
          if (p.testSegments.some((s) => sweptGap(v, s) < 0)) p.stats.otherPerson = v.n;
        }
    // Inter-person capsule broad phase in common scene space.
    for (let i = 0; i < people.length; i++)
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i],
          b = people[j];
        if (a.segments[0].a.distanceToSquared(b.segments[0].a) > 3) continue;
        if (a.testSegments.some((x) => b.testSegments.some((y) => sweptGap(x, y) < 0))) {
          a.stats.otherPerson = b.record.name;
          b.stats.otherPerson = a.record.name;
        }
      }
  }
  for (const { record, stats } of people) {
    for (const k of Object.keys(stats))
      if (typeof stats[k] === 'number') stats[k] = Math.round(stats[k] * 1000) / 1000;
    out[record.name] = stats;
    if (
      !stats.footFrames ||
      stats.missingGripFrames ||
      stats.groundErrorMm > 20 ||
      stats.bothAirFrames ||
      stats.collisionFrames ||
      stats.selfPropFrames ||
      stats.limitExcessDeg > 0.01 ||
      stats.selfHitFrames ||
      stats.gripErrorMm > 10 ||
      stats.otherPerson
    )
      failure.push(name + '/' + record.name);
  }
  if (crowd) {
    out['Tasting group'] = crowd.stats;
    if (crowd.stats.intersecting) failure.push('crowd/static geometry');
  }
  const expected = name === 'Village' ? 7 : name === 'Tidelight' ? 2 : 1;
  if (!people.length || built.length !== expected) failure.push(name + ' missing actors');
  if (name === 'Village' && !mobile && !crowd) failure.push('Village missing VAT gathering');
  return { workers: out, frames, obstacles: obstacles.length, failures: failure };
}
export default async function ({ baseline }) {
  if (!baseline) ({ pointGap } = await import('../docs/life/nav.js'));
  const out = { failures: [] };
  for (const name of names) {
    out[name] = await simulate(name, false);
    out.failures.push(...out[name].failures);
    out.mobile ||= {};
    out.mobile[name] = await simulate(name, true);
    out.failures.push(...out.mobile[name].failures.map((f) => 'Mobile ' + f));
  }
  if (!baseline) {
    const { runNavigationCases } = await import('./check-people-nav.mjs');
    out.navigation = runNavigationCases();
    out.failures.push(...out.navigation.failures);
  }
  return out;
}
