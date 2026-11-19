import * as T from 'three';
import { SCENE_M } from './scale.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = T.MathUtils.clamp;

// A station is the centre of a future shoe contact; a tread always contributes
// exactly one. The same clock controls both feet, the pelvis and the rail hand.
export function stairWalk(scene, nav, walker) {
  const flights = nav.flights,
    unit = SCENE_M.village,
    ascent = [];
  function add(x, y, z, yaw, duration, tread = null) {
    ascent.push({ x, y, z, yaw, duration, tread });
  }
  function path(x, z, y, speed = 1.2) {
    const a = ascent.at(-1),
      dx = x - a.x,
      dz = z - a.z,
      length = Math.hypot(dx, dz);
    if (length < 0.0001) return;
    const yaw = Math.atan2(dx, dz),
      turn = wrapAngle(yaw - a.yaw);
    if (Math.abs(turn) > 1.1) add(a.x, a.y, a.z, a.yaw + turn * 0.5, 0.24);
    const count = Math.max(1, Math.round(length / (unit * 0.59)));
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      add(a.x + dx * t, y, a.z + dz * t, yaw, length / (speed * unit * count));
    }
  }
  const first = flights[0];
  add(first.x, first.y, first.z - first.pitch * 1.7, 0, 0.3);
  function climb(f) {
    for (const t of f.treads) {
      const edge = Math.min(t.index - 1, f.treads.length - t.index);
      add(t.cx, t.y, t.cz, Math.atan2(t.dx, t.dz), edge === 0 ? 0.69 : edge === 1 ? 0.6 : 1 / 1.78, t);
    }
  }
  for (let i = 0; i < flights.length; i += 2) {
    const lower = flights[i],
      upper = flights[i + 1];
    path(lower.x, lower.z - lower.pitch / 2, lower.y, 0.85);
    climb(lower);
    // Walk a semicircle on the half landing. Its tangent leaves and rejoins
    // the two parallel runs without pivoting on a planted shoe.
    const radius = (upper.x - lower.x) / 2,
      z = upper.z + 0.11;
    for (let k = 0; k <= 4; k++) {
      const a = (k * Math.PI) / 4;
      add(lower.x + radius * (1 - Math.cos(a)), upper.y, z + radius * Math.sin(a), a, 0.4);
    }
    climb(upper);
    const zExit = upper.z - upper.treads.length * upper.pitch - 0.64;
    path(upper.x, zExit, upper.treads.at(-1).y);
    if (i + 2 < flights.length) {
      const next = flights[i + 2],
        entryZ = next.z - 0.25;
      path(0.485, zExit, upper.treads.at(-1).y);
      path(0.485, entryZ, next.y);
      path(next.x, entryZ, next.y, 0.94);
    } else path(upper.x, zExit - 0.41, upper.treads.at(-1).y);
  }
  const events = ascent.map((e) => ({ ...e, direction: 1 }));
  function turn(e, yaw) {
    // The end stance settles first. Three alternating contacts carry the
    // rotation; the following departure accelerates out of the turn.
    events.push({ ...e, yaw, duration: 0.24, tread: null, direction: 0 });
    for (let i = 1; i <= 3; i++)
      events.push({ ...e, yaw: yaw + (i * Math.PI) / 3, duration: 0.27, tread: null, direction: 0 });
  }
  turn(ascent.at(-1), ascent.at(-1).yaw);
  for (let i = ascent.length - 1; i >= 0; i--) {
    const e = ascent[i];
    events.push({ ...e, yaw: e.yaw + Math.PI, direction: -1 });
  }
  turn(ascent[0], ascent[0].yaw + Math.PI);
  // An even number of intervals preserves the planted side after each loop.
  if (events.length % 2) events.push({ ...events.at(-1), duration: 0.24 });
  let period = 0;
  for (const e of events) {
    e.start = period;
    period += e.duration;
  }
  const n = events.length;
  const at = (i) => events[((i % n) + n) % n];
  const agent = nav.place(walker, first.x, ascent[0].z, 0);
  // Validate the contact plan on the same surfaces and against the same
  // inflated obstacles as the scene's other pedestrian routes.
  for (const e of ascent) {
    const surface = nav.floor(e.x, e.z);
    const gap = nav.clearance(e.x, e.y + 0.005, e.z, agent.reserved, agent.height);
    if (Math.abs(surface - e.y) > 1e-5 || gap <= 0)
      throw new Error('Invalid stair contact in ' + (e.tread?.id ?? 'landing'));
  }
  const points = ascent.map((e) => [e.x, e.z]);
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  agent.route = { points, lengths, total: lengths.reduce((a, b) => a + b, 0) };
  const socket = new T.Object3D();
  socket.name = 'Sliding rail palm';
  socket.userData.orientPalm = true;
  const frames = new Map();
  for (const f of flights) {
    const towardRail = new T.Vector3(f.dz * f.side, 0, -f.dx * f.side);
    const uphill = f.railEnd.clone().sub(f.railStart).normalize();
    const across = new T.Vector3().crossVectors(uphill, towardRail);
    const basis = new T.Matrix4().makeBasis(across, uphill, towardRail);
    frames.set(f, { towardRail, orientation: new T.Quaternion().setFromRotationMatrix(basis) });
  }
  scene.add(socket);
  const motion = {
    events,
    period,
    unit,
    step: 0,
    yaw: 0,
    direction: 0,
    railSide: 0,
    rail: null,
    railRadius: 0,
    railCenter: new T.Vector3(),
    point(i, out) {
      const p = at(i);
      return out.set(p.x, p.y, p.z);
    },
    facing(i) {
      return at(i).yaw;
    },
    tread(i) {
      return at(i).tread;
    },
    railPoint(i, out) {
      const t = at(i).tread;
      if (!t) return null;
      return out.lerpVectors(t.flight.railStart, t.flight.railEnd, (t.index - 0.5) / t.flight.treads.length);
    },
  };
  walker.g.userData.stairMotion = motion;
  const hands = [null, null],
    root = walker.g;
  function advance(t) {
    const cycle = Math.floor(t / period),
      time = t - cycle * period;
    let lo = 0,
      hi = n;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].start <= time) lo = mid;
      else hi = mid;
    }
    const prev = at(lo - 1),
      e = events[lo],
      next = at(lo + 1),
      u = clamp((time - e.start) / e.duration, 0, 1);
    const left = (1 - u) * (1 - u) * 0.5,
      right = u * u * 0.5,
      center = 1 - left - right;
    const p = root.position;
    p.set(
      prev.x * left + e.x * center + next.x * right,
      prev.y * left + e.y * center + next.y * right,
      prev.z * left + e.z * center + next.z * right,
    );
    motion.step = cycle * n + lo + u;
    motion.yaw = e.yaw + left * wrapAngle(prev.yaw - e.yaw) + right * wrapAngle(next.yaw - e.yaw);
    root.rotation.y = motion.yaw;
    const tread = nav.floor.treadAt(p.x, p.z);
    motion.direction = tread ? e.direction || next.direction : 0;
    motion.rail = null;
    motion.railSide = 0;
    motion.railRadius = 0;
    hands[0] = hands[1] = null;
    if (tread) {
      const f = tread.flight,
        run = f.pitch * f.treads.length;
      // The hand trails the climbing shoulder and leads it on the descent.
      // Both grips place the fingertips downhill without overextending the wrist.
      const downhillOffset = (motion.direction > 0 ? 0.145 : 0.075) * unit;
      const s = (p.x - f.x) * f.dx + (p.z - f.z) * f.dz - downhillOffset;
      motion.railCenter.lerpVectors(f.railStart, f.railEnd, clamp(s / run, 0, 1));
      motion.railSide = motion.direction * f.side;
      motion.railRadius = f.railRadius;
      const frame = frames.get(f);
      socket.position.copy(motion.railCenter).addScaledVector(frame.towardRail, -f.railRadius - 0.023 * unit);
      socket.quaternion.copy(frame.orientation);
      motion.rail = socket;
      hands[motion.railSide === -1 ? 0 : 1] = socket;
    }
    walker.pose(t, 'walk', nav.floor, motion);
    if (motion.rail) walker.grasp(hands);
  }
  return advance;
}
