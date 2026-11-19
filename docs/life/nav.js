// Pedestrian navigation in scene-local units. Surfaces are closed rectangles at the
// mesh tops. Obstacles have a height interval so a street under a balcony stays usable.
import * as T from 'three';
import { peopleOverlay } from './nav-overlay.js';

const directions = Array.from({ length: 8 }, (_, i) => [
  Math.cos((i * Math.PI) / 4),
  Math.sin((i * Math.PI) / 4),
]);
const step = 0.12;
const directionsToTry = [1, -1];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const bucket = (x, z) => (x + 512) * 1024 + z + 512;

// Signed point distance for articulated swept spheres. A cask uses the actual
// piecewise-linear lathe profile, including both end faces, in axial/radial space.
export function pointGap(o, x, y, z) {
  if (o.stave) {
    const { profile, scale, lying } = o.stave;
    const axial = (lying ? z - o.z : y - o.stave.y) / scale;
    const radial = (lying ? Math.hypot(x - o.x, y - o.stave.y) : Math.hypot(x - o.x, z - o.z)) / scale;
    let d = Infinity,
      inside = false;
    for (let i = 1; i < profile.length; i++) {
      const [a, r] = profile[i - 1],
        [b, s] = profile[i],
        da = b - a,
        dr = s - r;
      const t = T.MathUtils.clamp(((axial - a) * da + (radial - r) * dr) / (da * da + dr * dr), 0, 1);
      d = Math.min(d, Math.hypot(axial - a - da * t, radial - r - dr * t));
      if (axial >= a && axial <= b && radial <= r + (dr * (axial - a)) / da) inside = true;
    }
    for (let endIndex = 0; endIndex < 2; endIndex++) {
      const k = endIndex === 0 ? 0 : profile.length - 1;
      const [end, r] = profile[k];
      d = Math.min(d, Math.hypot(axial - end, Math.max(0, radial - r)));
    }
    return (inside ? -d : d) * scale;
  }
  const dx = x - o.x,
    dz = z - o.z;
  let h;
  if (o.radius !== undefined) h = Math.hypot(dx, dz) - o.radius;
  else {
    const u = Math.abs(dx * o.cos - dz * o.sin) - o.hx,
      v = Math.abs(dx * o.sin + dz * o.cos) - o.hz;
    h = Math.hypot(Math.max(0, u), Math.max(0, v)) + Math.min(0, Math.max(u, v));
  }
  const v = Math.max(o.bottom - y, y - o.top);
  return Math.hypot(Math.max(0, h), Math.max(0, v)) + Math.min(0, Math.max(h, v));
}

export function clearanceTo(o, x, y, z, radius, height) {
  const dx = x - o.x,
    dz = z - o.z;
  let planar;
  if (o.radius !== undefined) {
    planar = Math.hypot(dx, dz) - o.radius;
  } else {
    const u = Math.abs(o.cos * dx - o.sin * dz) - o.hx;
    const v = Math.abs(o.sin * dx + o.cos * dz) - o.hz;
    planar = Math.hypot(Math.max(0, u), Math.max(0, v)) + Math.min(0, Math.max(u, v));
  }
  return Math.max(planar - radius, o.bottom - y - height, y - o.top);
}

export function peopleNav(root, viewport) {
  const surfaces = [],
    obstacles = [],
    agents = [],
    index = new Map(),
    moving = [],
    decks = [];
  const target = new T.Vector3(),
    localQuat = new T.Quaternion(),
    inverse = new T.Matrix4();
  const debug =
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === 'people';
  let lastTime,
    dt = 0,
    jump = true,
    overlay;
  function surface(name, x0, x1, z0, z1, y, tread = false, node) {
    const patch = { name, x0, x1, z0, z1, y, tread };
    surfaces.push(patch);
    if (node) decks.push({ node, patch, x0, x1, z0, z1, y });
  }
  function floor(x, z) {
    let y = -Infinity;
    for (const s of surfaces)
      if (s.y > y && x >= s.x0 - 1e-8 && x <= s.x1 + 1e-8 && z >= s.z0 - 1e-8 && z <= s.z1 + 1e-8) y = s.y;
    return y;
  }
  floor.snapTread = (z, x = 1.3) => {
    for (const s of surfaces)
      if (s.tread && x >= s.x0 && x <= s.x1 && z >= s.z0 && z < s.z1) return (s.z0 + s.z1) / 2;
    return z;
  };
  function register(o, node) {
    obstacles.push(o);
    if (node) {
      moving.push({ o, node, offsetY: o.bottom, height: o.top - o.bottom, centerX: o.x, centerZ: o.z });
      sync();
    } else {
      const r = o.radius ?? Math.hypot(o.hx, o.hz);
      for (let i = Math.floor(o.x - r); i <= Math.floor(o.x + r); i++)
        for (let j = Math.floor(o.z - r); j <= Math.floor(o.z + r); j++) {
          const key = bucket(i, j);
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(o);
        }
    }
    return o;
  }
  function box(name, x, z, hx, hz, bottom, top, angle = 0, node) {
    return register(
      { name, x, z, hx, hz, bottom, top, angle, cos: Math.cos(angle), sin: Math.sin(angle) },
      node,
    );
  }
  function circle(name, x, z, radius, bottom, top, node) {
    return register({ name, x, z, radius, bottom, top }, node);
  }
  function sync() {
    root.updateWorldMatrix(true, false);
    inverse.copy(root.matrixWorld).invert();
    for (const d of decks) {
      const offset = d.node.position,
        p = d.patch;
      p.x0 = d.x0 + offset.x;
      p.x1 = d.x1 + offset.x;
      p.z0 = d.z0 + offset.z;
      p.z1 = d.z1 + offset.z;
      p.y = d.y + offset.y;
    }
    for (const m of moving) {
      const { node, o } = m;
      node.updateWorldMatrix(true, false);
      // Follow reparented crates and boat yaw in the nav map's local frame.
      target.set(m.centerX, 0, m.centerZ).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
      o.x = target.x;
      o.z = target.z;
      o.bottom = target.y + m.offsetY;
      o.top = o.bottom + m.height;
      if (o.hx !== undefined) {
        localQuat.setFromRotationMatrix(node.matrixWorld);
        target.set(0, 0, 1).applyQuaternion(localQuat).transformDirection(inverse);
        o.angle = Math.atan2(target.x, target.z);
        o.cos = Math.cos(o.angle);
        o.sin = Math.sin(o.angle);
      }
    }
  }
  function clearance(x, y, z, radius = 0, height = 0, ignore) {
    let min = Infinity;
    // One extra cell gives reliable clearance within a metre, including the
    // positive range used for steering and test tolerances.
    const r = radius + 0.15;
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++)
      for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) {
        const cell = index.get(bucket(i, j));
        if (cell)
          for (const o of cell)
            if (o !== ignore) min = Math.min(min, clearanceTo(o, x, y, z, radius, height));
      }
    for (const { o } of moving)
      if (o !== ignore) min = Math.min(min, clearanceTo(o, x, y, z, radius, height));
    return min;
  }
  function valid(agent, x, z, local = true) {
    const y = floor(x, z),
      r = agent.reserved;
    if (!Number.isFinite(y) || clearance(x, y + 0.005, z, r, agent.height) <= 0) return false;
    for (const [dx, dz] of directions) {
      const edge = floor(x + dx * r, z + dz * r);
      // One stair can occupy less than the pedestrian radius.
      if (!Number.isFinite(edge) || Math.abs(edge - y) > 0.52) return false;
    }
    if (local)
      for (const other of agents) {
        if (
          other === agent ||
          other.seated ||
          Math.abs(other.position.y - y) > Math.max(agent.height, other.height)
        )
          continue;
        if (Math.hypot(x - other.position.x, z - other.position.z) < r + other.reserved) return false;
      }
    return true;
  }
  function nearest(agent, x, z) {
    if (valid(agent, x, z)) return [x, z];
    for (let ring = 1; ring <= 60; ring++) {
      const r = ring * 0.045,
        count = Math.ceil(2 * Math.PI * ring);
      for (let i = 0; i < count; i++) {
        const a = (i * 2 * Math.PI) / count,
          xx = x + r * Math.cos(a),
          zz = z + r * Math.sin(a);
        if (valid(agent, xx, zz)) {
          if (debug) console.info('People placement', agent.name, [x, z], [xx, zz]);
          return [xx, zz];
        }
      }
    }
    throw new Error('No walkable position for ' + agent.name);
  }
  function place(actor, x, z, yaw = 0, extra = 0, background) {
    const g = actor?.g,
      unit = g?.scale.y ?? background.unit;
    const agent = {
      name: g?.name ?? background.name,
      actor,
      position: g?.position ?? new T.Vector3(),
      radius: unit * 0.285,
      reserved: unit * (0.285 + 0.03) + extra,
      height: unit * 1.79,
      vx: 0,
      vz: 0,
      turn: 0,
      turnRate: 3.4,
      route: null,
    };
    [x, z] = nearest(agent, x, z);
    agent.position.set(x, floor(x, z), z);
    agents.push(agent);
    if (g) g.rotation.y = yaw;
    return agent;
  }
  function visible(agent, ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.055);
    let h = floor(ax, az);
    for (let i = 1; i <= n; i++) {
      const u = i / n,
        x = ax + (bx - ax) * u,
        z = az + (bz - az) * u,
        next = floor(x, z);
      if (!valid(agent, x, z) || Math.abs(h - next) > 0.26) return false;
      h = next;
    }
    return true;
  }
  const segment = (agent, a, b) => visible(agent, a[0], a[1], b[0], b[1]);
  // A* searches a local 8-connected lattice only when visibility fails.
  function bypass(agent, start, end) {
    if (segment(agent, start, end)) return [end];
    const open = [],
      best = new Map();
    function add(i, j, cost, parent) {
      const key = bucket(i, j);
      if (cost >= (best.get(key) ?? Infinity)) return;
      best.set(key, cost);
      const p = [start[0] + step * i, start[1] + step * j];
      open.push({ i, j, cost, p, parent, key, estimate: cost + dist(p, end) });
    }
    add(0, 0, 0, null);
    while (open.length) {
      let k = 0;
      for (let i = 1; i < open.length; i++) if (open[i].estimate < open[k].estimate) k = i;
      const n = open[k];
      open[k] = open[open.length - 1];
      open.pop();
      if (n.cost > best.get(n.key)) continue;
      if (dist(n.p, end) < step * 2 && segment(agent, n.p, end)) {
        const points = [end];
        for (let at = n; at; at = at.parent) points.unshift(at.p);
        const path = [];
        for (let i = 0; i < points.length - 1; ) {
          let j = points.length - 1;
          while (j > i + 1 && !segment(agent, points[i], points[j])) j--;
          path.push(points[j]);
          i = j;
        }
        return path;
      }
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++)
          if (x || z) {
            const i = n.i + x,
              j = n.j + z,
              cost = n.cost + step * Math.hypot(x, z);
            if (cost >= (best.get(bucket(i, j)) ?? Infinity)) continue;
            if (segment(agent, n.p, [start[0] + step * i, start[1] + step * j])) add(i, j, cost, n);
          }
    }
    throw new Error('No navigable route for ' + agent.name);
  }
  function route(agent, stops) {
    const points = [[agent.position.x, agent.position.z]];
    for (const end of stops) points.push(...bypass(agent, points[points.length - 1], nearest(agent, ...end)));
    const lengths = points.slice(1).map((p, i) => dist(p, points[i]));
    agent.route = { points, lengths, total: lengths.reduce((a, b) => a + b, 0) };
    return agent.route;
  }
  function begin(t) {
    jump = lastTime === undefined || lastTime > t || t - lastTime > 0.33;
    dt = jump ? 0 : Math.min(0.1, t - lastTime);
    lastTime = t;
    sync();
  }
  function follow(agent, distance, forward = true, face) {
    const { points, lengths, total } = agent.route,
      p = agent.position;
    let n = 0,
      d = Math.max(0, Math.min(total, distance));
    while (n < lengths.length - 1 && d > lengths[n]) d -= lengths[n++];
    const a = points[n],
      b = points[n + 1],
      u = lengths[n] ? d / lengths[n] : 1;
    const tx = T.MathUtils.lerp(a[0], b[0], u),
      tz = T.MathUtils.lerp(a[1], b[1], u);
    const yaw = face ?? Math.atan2((forward ? 1 : -1) * (b[0] - a[0]), (forward ? 1 : -1) * (b[1] - a[1]));
    const g = agent.actor.g;
    if (!dt) {
      if (!jump) return;
      if (valid(agent, tx, tz)) p.set(tx, floor(tx, tz), tz);
      g.rotation.y = yaw;
      agent.vx = agent.vz = agent.turn = 0;
      return;
    }
    // Exact critically damped response for a fixed target, stable across frame rates.
    const omega = 16,
      decay = Math.exp(-omega * dt);
    let vx = agent.vx,
      vz = agent.vz,
      sideX = 0,
      sideZ = 0;
    for (const other of agents) {
      if (other === agent || other.seated || Math.abs(p.y - other.position.y) > agent.height) continue;
      const dx = p.x - other.position.x,
        dz = p.z - other.position.z,
        dist = Math.hypot(dx, dz);
      const range = (agent.reserved + other.reserved) * 1.4;
      if (dist && dist < range) {
        const repel = ((range - dist) * dt * 25) / dist;
        // Pass on a consistent side even when the approach is exactly head-on.
        vx += (dx + dz * 0.5) * repel;
        vz += (dz - dx * 0.5) * repel;
        sideX += dz / dist;
        sideZ -= dx / dist;
      }
    }
    const ex = p.x - tx,
      ez = p.z - tz,
      cx = vx + omega * ex,
      cz = vz + omega * ez;
    const xx = tx + (ex + cx * dt) * decay,
      zz = tz + (ez + cz * dt) * decay;
    agent.vx = (vx - omega * cx * dt) * decay;
    agent.vz = (vz - omega * cz * dt) * decay;
    if (visible(agent, p.x, p.z, xx, zz)) p.set(xx, floor(xx, zz), zz);
    else {
      agent.vx = agent.vz = 0;
      const length = Math.hypot(sideX, sideZ);
      if (length) {
        const stride = Math.min(0.025, agent.radius * 3 * dt) / length;
        for (const sign of directionsToTry) {
          const nextX = p.x + sign * sideX * stride,
            nextZ = p.z + sign * sideZ * stride;
          if (visible(agent, p.x, p.z, nextX, nextZ)) {
            p.set(nextX, floor(nextX, nextZ), nextZ);
            break;
          }
        }
      }
    }
    const error = Math.atan2(Math.sin(g.rotation.y - yaw), Math.cos(g.rotation.y - yaw));
    const c = agent.turn + omega * error;
    const delta = T.MathUtils.clamp(
      (error + c * dt) * decay - error,
      -agent.turnRate * dt,
      agent.turnRate * dt,
    );
    g.rotation.y += delta;
    agent.turn = T.MathUtils.clamp((agent.turn - omega * c * dt) * decay, -agent.turnRate, agent.turnRate);
  }
  function draw() {
    if (debug) {
      if (!overlay) overlay = peopleOverlay(root, nav, viewport);
      overlay();
    }
  }
  const nav = {
    surface,
    box,
    circle,
    floor,
    clearance,
    valid,
    place,
    route,
    follow,
    begin,
    draw,
    agents,
    obstacles,
    surfaces,
  };
  root.userData.peopleNav = nav;
  return nav;
}
