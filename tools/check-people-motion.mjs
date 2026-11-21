// Observe the transforms produced by the production updates. Run the same
// probe with --ref=411f01d to measure the previous rectangular staircase.
import * as T from 'three';
import { buildForCheck } from '../docs/assets/sip-village.js';
import { buildHarbor } from '../docs/assets/sip-craft-harbor.js';
import { cellar } from '../docs/assets/sip-creek-cellar.js';
import { seed } from '../docs/life/forms.js';

const unit = { Village: 0.6, Tidelight: 0.5, Creek: 0.92 },
  fps = 30;
const vec = () => new T.Vector3(),
  down = vec(),
  toe = vec(),
  heel = vec(),
  sample = vec(),
  head = vec(),
  hip = vec(),
  forward = vec(),
  palm = vec();
const inverse = new T.Matrix4();
const round = (n) => (Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null);
function world(node, point, out) {
  return out.copy(point).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
}
function legacyTreads(surfaces) {
  let previous = null,
    flight = 0,
    index = 0;
  return surfaces
    .filter((s) => s.tread)
    .map((s) => {
      const pitch = s.z1 - s.z0;
      if (!previous || Math.abs(s.z1 - previous.z0) > 0.001) {
        flight++;
        index = 0;
      }
      const t = {
        ...s,
        cx: (s.x0 + s.x1) * 0.5,
        cz: (s.z0 + s.z1) * 0.5,
        dx: 0,
        dz: -1,
        width: s.x1 - s.x0,
        pitch,
        flight,
        index: ++index,
        noseX: (s.x0 + s.x1) * 0.5,
        noseZ: s.z1,
      };
      previous = s;
      return t;
    });
}
function inside(t, p) {
  const x = p.x - t.cx,
    z = p.z - t.cz;
  return (
    Math.abs(x * t.dx + z * t.dz) <= t.pitch * 0.5 + 1e-7 &&
    Math.abs(x * t.dz - z * t.dx) <= t.width * 0.5 + 1e-7
  );
}
// Signed clearance between the tapered hand capsule and the sloped rail tube.
// Both capsule end spheres and the convex interior distance can be the minimum.
const handA = vec(),
  handB = vec(),
  barAxis = vec(),
  sphere = vec();
function handClearance(actor, which, flight, m) {
  const data = actor.dynamics.capsules,
    k = actor.dynamics.names.indexOf(which ? 'right hand' : 'left hand') * 8;
  const scale = actor.g.scale.y;
  handA.fromArray(data, k).applyMatrix4(actor.g.matrixWorld).applyMatrix4(inverse);
  handB
    .fromArray(data, k + 4)
    .applyMatrix4(actor.g.matrixWorld)
    .applyMatrix4(inverse);
  barAxis.subVectors(flight.railEnd, flight.railStart);
  const lengthSq = barAxis.lengthSq();
  function clearance(u) {
    sphere.lerpVectors(handA, handB, u).sub(flight.railStart);
    const f = T.MathUtils.clamp(sphere.dot(barAxis) / lengthSq, 0, 1);
    return (
      (sphere.addScaledVector(barAxis, -f).length() -
        flight.railRadius -
        T.MathUtils.lerp(data[k + 3], data[k + 7], u) * scale) /
      m
    );
  }
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 16; i++) {
    const a = (2 * lo + hi) / 3,
      b = (lo + 2 * hi) / 3;
    if (clearance(a) <= clearance(b)) hi = b;
    else lo = a;
  }
  return Math.min(clearance(0), clearance(1), clearance((lo + hi) * 0.5));
}
function makeTrack(record) {
  return {
    record,
    feet: record.a.feet.map(() => ({ held: false, start: vec(), toe: vec(), history: false })),
    lastRoot: vec(),
    lastHip: vec(),
    lastTread: null,
    maxSlip: 0,
    stanceContacts: 0,
    groundDistance: 0,
    walkTime: 0,
    maxSpeed: 0,
  };
}
async function simulate(name, mobile) {
  globalThis.probedActors = [];
  const scene = new T.Scene(),
    cam = new T.PerspectiveCamera();
  cam.position.set(2, 2, 3);
  cam.lookAt(0, 1, 0);
  cam.updateMatrixWorld();
  let update;
  if (name === 'Village') {
    const d = buildForCheck(scene);
    update = (t) => d.life(t, cam, mobile ? 'Mobile' : 'High');
  }
  if (name === 'Tidelight') {
    const h = buildHarbor(scene, { seaTime: { value: 0 }, storm: { value: 0.1 } }, new T.DataTexture());
    update = (t) => h(t, 0.1, cam, mobile ? 0 : 2);
  }
  if (name === 'Creek') {
    const c = cellar(scene, new T.MeshStandardMaterial(), seed(123));
    update = (t) => c.update(t, cam, mobile);
  }
  update(0);
  let space, nav;
  scene.traverse((o) => {
    if (o.userData.peopleNav) {
      nav = o.userData.peopleNav;
      space = o;
    }
  });
  if (!nav) throw Error('Production navigation is missing for ' + name);
  const tracks = globalThis.probedActors.filter((r) => scene.getObjectById(r.a.g.id)).map(makeTrack);
  const real = nav.surfaces.filter((s) => s.flight),
    treads = real.length ? real : legacyTreads(nav.surfaces);
  const walker = tracks.find((r) => r.record.name === 'Stair walker');
  const seconds = walker ? Math.max(75, Math.ceil(walker.record.a.motion?.period || 80) + 1) : 60;
  const stairs = {
    contacts: 0,
    missingOrRepeated: 0,
    soleOutside: 0,
    minAscentToeMarginM: Infinity,
    nosingCrossings: 0,
    minSwingClearanceM: Infinity,
    riserIntersections: 0,
    maxPenetrationM: 0,
    maxPelvisDropM: 0,
    midFlightFrames: 0,
    minPitchDeg: Infinity,
    maxPitchDeg: -Infinity,
    ascentTime: 0,
    ascentHeight: 0,
    railFrames: 0,
    missingRailFrames: 0,
    maxRailGapM: 0,
    minHandRailClearanceM: Infinity,
    maxStanceKneeDeg: 0,
    descentContacts: 0,
    descentNosingCrossings: 0,
    minDescentSwingClearanceM: Infinity,
    maxDescentStanceKneeDeg: 0,
    maxDescentPelvisRiseM: 0,
    midStepSeconds: 0,
    midStepIntervals: 0,
    upTreads: new Set(),
    downTreads: new Set(),
    examples: {},
  };
  const m = unit[name],
    failures = [],
    diagnostics = {};
  for (let frame = 0; frame <= seconds * fps; frame++) {
    if (frame) update(frame / fps);
    space.updateWorldMatrix(true, false);
    for (const track of tracks) {
      const { record } = track,
        { a } = record,
        isWalker = track === walker;
      const basis = record.name === 'Oarsman' ? a.g.parent : space;
      basis.updateWorldMatrix(true, false);
      inverse.copy(basis.matrixWorld).invert();
      a.g.updateWorldMatrix(true, true);
      const root = a.g.getWorldPosition(sample).applyMatrix4(inverse),
        rootX = root.x,
        rootY = root.y,
        rootZ = root.z;
      if (frame && !isWalker && (record.action === 'walk' || record.action === 'carry')) {
        const distance = Math.hypot(rootX - track.lastRoot.x, rootZ - track.lastRoot.z) / m;
        track.groundDistance += distance;
        track.walkTime += 1 / fps;
        track.maxSpeed = Math.max(track.maxSpeed, distance * fps);
      }
      a.hip.getWorldPosition(hip).applyMatrix4(inverse);
      let support = real.length ? nav.floor.treadAt?.(rootX, rootZ) : null;
      if (!support && isWalker && !real.length) support = treads.find((t) => inside(t, root));
      const motion = a.motion,
        relative =
          motion?.direction ??
          (support
            ? Math.sign((rootX - track.lastRoot.x) * support.dx + (rootZ - track.lastRoot.z) * support.dz)
            : 0);
      const mid = isWalker && support && relative > 0 && support.index >= 3 && support.index <= 8;
      if (mid && frame) {
        const neck = a.rig.bones[a.rig.neck];
        neck.getWorldPosition(head).applyMatrix4(inverse).sub(hip);
        forward.set(Math.sin(a.g.rotation.y), 0, Math.cos(a.g.rotation.y));
        const pitch = (Math.atan2(head.dot(forward), head.y) * 180) / Math.PI;
        stairs.midFlightFrames++;
        stairs.minPitchDeg = Math.min(stairs.minPitchDeg, pitch);
        stairs.maxPitchDeg = Math.max(stairs.maxPitchDeg, pitch);
        if (track.mid && support.flight === track.flight) {
          stairs.ascentTime += 1 / fps;
          stairs.ascentHeight += (hip.y - track.lastHip.y) / m;
        }
      }
      if (isWalker && support && relative > 0) {
        if (track.rising === support.flight)
          stairs.maxPelvisDropM = Math.max(stairs.maxPelvisDropM, (track.apex - hip.y) / m);
        else track.apex = hip.y;
        track.apex = Math.max(track.apex, hip.y);
        track.rising = support.flight;
      } else track.rising = null;
      if (isWalker && support && relative < 0) {
        if (track.falling === support.flight)
          stairs.maxDescentPelvisRiseM = Math.max(stairs.maxDescentPelvisRiseM, (hip.y - track.lowest) / m);
        else track.lowest = hip.y;
        track.lowest = Math.min(track.lowest, hip.y);
        track.falling = support.flight;
      } else track.falling = null;
      if (isWalker && support && relative && frame) {
        const flight = support.flight;
        if (flight.railStart && flight.railEnd && motion?.railSide) {
          const start = flight.railStart,
            end = flight.railEnd;
          const i = motion.railSide < 0 ? 0 : 1;
          a.palms[i].getWorldPosition(palm).applyMatrix4(inverse);
          down.copy(end).sub(start);
          const u = T.MathUtils.clamp(sample.copy(palm).sub(start).dot(down) / down.lengthSq(), 0, 1);
          const gap =
            Math.abs(sample.copy(start).addScaledVector(down, u).distanceTo(palm) - flight.railRadius) / m;
          stairs.maxRailGapM = Math.max(stairs.maxRailGapM, gap);
          stairs.minHandRailClearanceM = Math.min(
            stairs.minHandRailClearanceM,
            handClearance(a, i, flight, m),
          );
          stairs.railFrames++;
        } else if (!motion || motion.direction) stairs.missingRailFrames++;
      }
      for (let i = 0; i < a.feet.length; i++) {
        const f = a.feet[i],
          q = track.feet[i];
        world(f.ankle, f.heel, heel);
        world(f.ankle, f.toe, toe);
        const center = sample.lerpVectors(heel, toe, 0.5);
        const tread = isWalker
          ? treads.find((t) => inside(t, center) && Math.abs(nav.floor(center.x, center.z) - t.y) < 1e-4)
          : null;
        if (f.planted) {
          if (q.held) {
            const distance = Math.hypot(center.x - q.start.x, center.z - q.start.z) / m;
            if (distance > track.maxSlip && distance > 0.01)
              track.slipSample = {
                frame,
                i,
                start: q.start.toArray(),
                center: center.toArray(),
                hold: f.hold.toArray(),
                target: f.target.toArray(),
              };
            track.maxSlip = Math.max(track.maxSlip, distance);
          } else {
            q.start.copy(center);
            track.stanceContacts++;
          }
          if (isWalker && tread) {
            // The planted shoe can still be on the flight as the torso moves
            // onto a landing. Its forward direction identifies this traversal.
            const sign = Math.sign(Math.sin(f.yaw) * tread.dx + Math.cos(f.yaw) * tread.dz);
            if (!q.held) {
              stairs.contacts++;
              (sign > 0 ? stairs.upTreads : stairs.downTreads).add(tread);
              if (sign < 0) stairs.descentContacts++;
              if (
                tread.index >= 3 &&
                tread.index <= 8 &&
                tread.flight === track.lastTread?.flight &&
                Math.abs(tread.index - track.lastTread.index) === 1 &&
                track.lastTread.index >= 3 &&
                track.lastTread.index <= 8
              ) {
                stairs.midStepSeconds += (frame - track.lastContactFrame) / fps;
                stairs.midStepIntervals++;
              }
              track.lastContactFrame = frame;
              if (track.lastTread?.flight === tread.flight && tread.index - track.lastTread.index !== sign) {
                stairs.missingOrRepeated++;
                stairs.examples.sequence ??= [
                  frame,
                  i,
                  motion?.step,
                  relative,
                  track.lastTread.index,
                  tread.index,
                ];
              }
              track.lastTread = tread;
            }
            let outside = false;
            for (const z of [f.heel.z, f.toe.z])
              for (const x of [-0.034, 0.034]) {
                world(f.ankle, down.set(x, -0.077, z), sample);
                if (!inside(tread, sample)) outside = true;
              }
            if (outside) {
              stairs.soleOutside++;
              stairs.examples.bounds ??= [];
              if (stairs.examples.bounds.length < 12 && (!q.held || !stairs.examples.bounds.length))
                stairs.examples.bounds.push([
                  frame,
                  i,
                  motion?.step,
                  relative,
                  tread.index,
                  heel.toArray(),
                  toe.toArray(),
                  tread.cx,
                  tread.cz,
                ]);
            }
            if (sign > 0) {
              const toeTravel = (toe.x - tread.cx) * tread.dx + (toe.z - tread.cz) * tread.dz;
              stairs.minAscentToeMarginM = Math.min(
                stairs.minAscentToeMarginM,
                (tread.pitch * 0.5 - toeTravel) / m,
              );
            }
            const knee = (a.rig.bones[a.rig.sides[i].shin].rotation.x * 180) / Math.PI;
            stairs.maxStanceKneeDeg = Math.max(stairs.maxStanceKneeDeg, knee);
            if (sign < 0) stairs.maxDescentStanceKneeDeg = Math.max(stairs.maxDescentStanceKneeDeg, knee);
          } else if (isWalker && !q.held) track.lastTread = null;
        }
        if (isWalker && (!f.planted || !q.held) && q.history) {
          for (const t of treads) {
            const da = (q.toe.x - t.noseX) * t.dx + (q.toe.z - t.noseZ) * t.dz;
            const db = (toe.x - t.noseX) * t.dx + (toe.z - t.noseZ) * t.dz;
            if (da < 0 === db < 0 || Math.abs(db - da) < 1e-9) continue;
            const u = da / (da - db);
            sample.lerpVectors(q.toe, toe, u);
            if (Math.abs((sample.x - t.cx) * t.dz - (sample.z - t.cz) * t.dx) > t.width * 0.5) continue;
            stairs.nosingCrossings++;
            const clearance = (sample.y - t.y) / m;
            if (db < da) {
              stairs.descentNosingCrossings++;
              stairs.minDescentSwingClearanceM = Math.min(stairs.minDescentSwingClearanceM, clearance);
            }
            if (clearance < 0.04 && !stairs.examples.nosing)
              stairs.examples.nosing = [frame, i, motion?.step, t.flight.name, t.index, round(clearance)];
            stairs.minSwingClearanceM = Math.min(stairs.minSwingClearanceM, clearance);
          }
          let hit = false;
          for (const frac of [0, 0.25, 0.5, 0.75, 1])
            for (const x of [-0.034, 0.034]) {
              world(f.ankle, down.set(x, -0.077, T.MathUtils.lerp(f.heel.z, f.toe.z, frac)), sample);
              if (!treads.some((t) => inside(t, sample))) continue;
              const penetration = (nav.floor(sample.x, sample.z) - sample.y) / m;
              if (penetration > 0.00001) {
                hit = true;
                stairs.maxPenetrationM = Math.max(stairs.maxPenetrationM, penetration);
              }
            }
          if (hit) {
            stairs.riserIntersections++;
            if (!stairs.examples.riser)
              stairs.examples.riser = [frame, i, motion?.step, relative, q.toe.toArray(), toe.toArray()];
          }
        }
        q.toe.copy(toe);
        q.held = f.planted;
        q.history = true;
      }
      track.lastRoot.set(rootX, rootY, rootZ);
      track.lastHip.copy(hip);
      track.mid = mid;
      track.flight = support?.flight;
    }
  }
  for (const t of tracks) {
    const { name: actor } = t.record;
    const cruise = t.walkTime ? t.groundDistance / t.walkTime : null;
    diagnostics[actor] = {
      contacts: t.stanceContacts,
      maxStanceSlipM: round(t.maxSlip),
      ...(t.slipSample ? { slipSample: t.slipSample } : {}),
      flatMeanSpeedMps: round(cruise ?? NaN),
      flatMaxSpeedMps: round(t.walkTime ? t.maxSpeed : NaN),
    };
    if (t.maxSlip >= 0.01) failures.push(name + '/' + actor + ' stance slip');
    if (cruise !== null && (cruise < 1 || cruise > 1.4 || t.maxSpeed > 1.4))
      failures.push(name + '/' + actor + ' flat walking speed');
  }
  if (walker) {
    stairs.ascentTreads = stairs.upTreads.size;
    stairs.descentTreads = stairs.downTreads.size;
    delete stairs.upTreads;
    delete stairs.downTreads;
    const count = Math.min(stairs.ascentTreads, stairs.descentTreads);
    stairs.physicalTreads = treads.length;
    stairs.verticalMps = stairs.ascentTime ? stairs.ascentHeight / stairs.ascentTime : 0;
    stairs.midFlightStepsPerSecond = stairs.midStepIntervals / stairs.midStepSeconds;
    if (
      !stairs.midStepIntervals ||
      stairs.midFlightStepsPerSecond < 1.6 ||
      stairs.midFlightStepsPerSecond > 1.9
    )
      failures.push('Stair cadence');
    if (
      !stairs.descentContacts ||
      !stairs.descentNosingCrossings ||
      stairs.minDescentSwingClearanceM < 0.04 ||
      stairs.maxDescentPelvisRiseM > 0.01 ||
      stairs.maxStanceKneeDeg > 101
    )
      failures.push('Stair descent or stance knee');
    if (!Object.keys(stairs.examples).length) delete stairs.examples;
    if (!treads.length || count !== treads.length || stairs.missingOrRepeated || stairs.soleOutside)
      failures.push('Stair contact sequence or sole bounds');
    if (
      stairs.minAscentToeMarginM < 0.02 ||
      !stairs.nosingCrossings ||
      stairs.minSwingClearanceM < 0.04 ||
      stairs.riserIntersections
    )
      failures.push('Stair swing or nosing clearance');
    if (
      stairs.maxPelvisDropM > 0.01 ||
      !stairs.midFlightFrames ||
      stairs.minPitchDeg < 8 ||
      stairs.maxPitchDeg > 18
    )
      failures.push('Stair pelvis or trunk pitch');
    if (stairs.verticalMps < 0.2 || stairs.verticalMps > 0.4) failures.push('Stair ascent speed');
    if (
      !stairs.railFrames ||
      stairs.missingRailFrames ||
      stairs.maxRailGapM > 0.03 ||
      stairs.minHandRailClearanceM < -1e-6
    )
      failures.push('Stair rail contact');
    for (const key of Object.keys(stairs))
      if (typeof stairs[key] === 'number') stairs[key] = round(stairs[key]);
  }
  return { seconds, workers: diagnostics, ...(walker ? { stairs } : {}), failures };
}
export default async function runMotion() {
  const result = { failures: [], desktop: {} };
  for (const name of ['Village', 'Tidelight', 'Creek']) {
    const mobile = await simulate(name, true),
      high = await simulate(name, false);
    result[name] = mobile;
    result.desktop[name] = high;
    result.failures.push(...mobile.failures, ...high.failures.map((f) => 'Desktop ' + f));
  }
  return result;
}
