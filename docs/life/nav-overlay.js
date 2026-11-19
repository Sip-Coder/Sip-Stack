// On-demand WebGL overlay. Every measurement uses the same transforms as the
// skinned character, including station or hull rotation.
import * as T from 'three';
import { pointGap } from './nav.js';

const surfaceColor = 0x4ca2d8,
  solidColor = 0xd98650,
  pathColor = 0xffda60,
  good = 0x58e2b1,
  bad = 0xff332e;
const empty = Object.freeze([]);
const twistNames = ['armTwist', 'foreTwist', 'thighTwist'];
const soleNames = ['heel', 'toe'];
const core = /pelvis|abdomen|thorax|head|thigh|shin/;
const upper = /abdomen|thorax|head/;
function selfContact(a, b) {
  return (
    (a === 'held prop' && core.test(b)) ||
    (b === 'held prop' && core.test(a)) ||
    (a?.endsWith('hand') && upper.test(b)) ||
    (b?.endsWith('hand') && upper.test(a))
  );
}
function routeLines(route) {
  let count = 0;
  if (route)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      count += Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 0.12);
    }
  return count;
}
function marker(record, kind, index) {
  const p = new T.Vector3(),
    q = new T.Vector3();
  return { record, kind, index, p, q, axis: new T.Line3(p, q), lengthSq: 0, r: 0, s: 0, pairNames: [] };
}
function sweepGap(o, p, q, r, s, t) {
  return pointGap(o, p.x + t * (q.x - p.x), p.y + t * (q.y - p.y), p.z + t * (q.z - p.z)) - (r + t * (s - r));
}
function encounter(record, name) {
  const names = record.report.obstacles;
  for (let i = 0; i < record.hits; i++) if (names[i] === name) return;
  names[record.hits++] = name;
}
export function peopleOverlay(root, nav, viewport) {
  const material = new T.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new T.BufferGeometry();
  const lines = new T.LineSegments(geometry, material);
  lines.name = 'People diagnostics';
  lines.renderOrder = 80;
  lines.frustumCulled = false;
  root.add(lines);
  const palette = new T.Color(),
    v = new T.Vector3(),
    w = new T.Vector3();
  const a = new T.Vector3(),
    b = new T.Vector3(),
    m = new T.Matrix4(),
    inverse = new T.Matrix4(),
    axis = new T.Vector3();
  let points,
    colors,
    pos,
    rgb,
    cursor = 0,
    markerCount = 0;
  let records, markers, obstacleCount, surfaceCount;
  const diagnostics = { intersections: 0, footErrors: 0, people: [] };
  // This is a live report. Its field names and visible-agent order are stable.
  nav.diagnostics = diagnostics;
  const tints = new WeakMap();
  const lineColors = new Map();
  for (const value of [surfaceColor, solidColor, pathColor, good, bad, 0x66d3e5, 0xffb6cb, 0xca8fff]) {
    lineColors.set(value, new T.Color(value));
  }
  const ringX = new Float64Array(17),
    ringZ = new Float64Array(17);
  for (let i = 0; i <= 16; i++) {
    const angle = (i * Math.PI) / 8;
    ringX[i] = Math.cos(angle);
    ringZ[i] = Math.sin(angle);
  }
  function tintLayer(mesh) {
    if (!mesh?.isMesh) return null;
    const original = mesh.material;
    let tint = tints.get(original);
    if (!tint) {
      tint = original.clone();
      tint.color.set(0xff1111);
      tint.onBeforeCompile = original.onBeforeCompile;
      tint.customProgramCacheKey = original.customProgramCacheKey;
      tints.set(original, tint);
    }
    return { mesh, original, tint };
  }
  function setup() {
    // Navigation registers the whole scene before its first draw. Rebuild only
    // when a caller explicitly changes the registered geometry or routes.
    if (records)
      for (const r of records)
        for (const t of r.layers) if (t.mesh.material === t.tint) t.mesh.material = t.original;
    obstacleCount = nav.obstacles.length;
    surfaceCount = nav.surfaces.length;
    let segments = surfaceCount * 4,
      slots = 0;
    for (const o of nav.obstacles) segments += o.radius === undefined ? 4 : 16;
    records = nav.agents.map((agent) => {
      const actor = agent.actor,
        d = actor?.dynamics,
        props = agent.props ?? empty;
      const report = { name: agent.name, obstacles: [], contacts: [], footError: 0 };
      const record = {
        name: agent.name,
        agent,
        report,
        route: agent.route,
        routeCapacity: routeLines(agent.route),
        props,
        propCount: props.length,
        layers: [],
        parts: [],
        pool: [],
        hits: 0,
        contacts: 0,
        footError: 0,
      };
      if (actor) {
        // Only debug actors request all three tier materials at startup. Create
        // their matching DQ/linear tints before a contact can occur.
        if (actor.g.userData.preparePeopleLOD) {
          actor.g.userData.preparePeopleLOD(0);
          actor.g.userData.preparePeopleLOD(1);
        }
        for (const mesh of [actor.low, ...actor.layers]) {
          const t = tintLayer(mesh);
          if (t) record.layers.push(t);
        }
      }
      if (agent.instance) {
        const { mesh, index } = agent.instance;
        mesh.setColorAt(index, palette.setHex(0xffffff));
        mesh.instanceColor.needsUpdate = true;
      }
      const kinds = actor ? [...(d?.names ?? empty), ...props.map(() => 'held prop')] : [undefined];
      record.parts = kinds.map((kind, i) => marker(record, kind, i));
      for (const part of record.parts)
        for (let j = 0; j < part.index; j++) {
          const other = record.parts[j];
          if (selfContact(part.kind, other.kind)) part.pairNames[j] = part.kind + ' / ' + other.kind;
        }
      // Distinct capsule/obstacle encounters are the only source of detailed
      // contacts. Reserve their records here, including the fully blocked case.
      record.pool = Array.from({ length: kinds.length * obstacleCount }, () => ({
        part: undefined,
        obstacle: '',
        penetration: 0,
      }));
      segments += record.routeCapacity + 16 + 33 * kinds.length;
      slots += kinds.length;
      if (d) {
        // Far workers initialize cloth only on their first near/mid selection.
        // The solver has at most two 8-by-6 panels and seven outgoing links per particle.
        if (!d.panels.length && actor.g.userData.hasPeopleGarment) segments += 2 * 8 * 6 * 7;
        else for (const panel of d.panels) segments += panel.links.length / 2;
        for (const chain of d.chains) segments += chain.position.length / 3 - 1;
        segments += 2 * (d.support.length / 3) + 2 + (actor.rig?.sides?.length ?? 0) * 3;
      }
      segments += (actor?.feet?.length ?? 0) * 4;
      return record;
    });
    markers = new Array(slots);
    if (points) geometry.dispose();
    points = new T.BufferAttribute(new Float32Array(segments * 6), 3).setUsage(T.DynamicDrawUsage);
    colors = new T.BufferAttribute(new Float32Array(segments * 6), 3).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('position', points);
    geometry.setAttribute('color', colors);
    pos = points.array;
    rgb = colors.array;
  }
  function changed() {
    if (
      obstacleCount !== nav.obstacles.length ||
      surfaceCount !== nav.surfaces.length ||
      records.length !== nav.agents.length
    )
      return true;
    for (let i = 0; i < records.length; i++) {
      const r = records[i],
        agent = nav.agents[i];
      if (
        r.agent !== agent ||
        r.route !== agent.route ||
        routeLines(agent.route) > r.routeCapacity ||
        r.props !== (agent.props ?? empty) ||
        r.propCount !== r.props.length
      )
        return true;
    }
    return false;
  }
  setup();
  const hud = document.createElement('output');
  hud.setAttribute('aria-label', 'People diagnostics');
  hud.style.cssText =
    'position:fixed;bottom:16px;left:12px;z-index:20;padding:7px 10px;background:#14211fe8;color:#e2f5e9;border-radius:4px;font:12px/1.4 monospace;pointer-events:none';
  const stage = viewport && document.querySelector(viewport);
  if (stage) hud.style.position = 'absolute';
  (stage || document.body).append(hud);
  let lastHits = -1,
    lastFeet = -1;
  function line(x, y, z, X, Y, Z, color) {
    pos[cursor] = x;
    pos[cursor + 1] = y;
    pos[cursor + 2] = z;
    pos[cursor + 3] = X;
    pos[cursor + 4] = Y;
    pos[cursor + 5] = Z;
    const tint = lineColors.get(color);
    rgb[cursor] = rgb[cursor + 3] = tint.r;
    rgb[cursor + 1] = rgb[cursor + 4] = tint.g;
    rgb[cursor + 2] = rgb[cursor + 5] = tint.b;
    cursor += 6;
  }
  function link(p, q, color) {
    line(p.x, p.y, p.z, q.x, q.y, q.z, color);
  }
  function ring(x, y, z, r, color) {
    for (let i = 0; i < 16; i++) {
      line(x + ringX[i] * r, y, z + ringZ[i] * r, x + ringX[i + 1] * r, y, z + ringZ[i + 1] * r, color);
    }
  }
  function rectangle(x, y, z, hx, hz, c, s, color) {
    for (let i = 0; i < 4; i++) {
      const u = i === 0 || i === 3 ? -hx : hx,
        v = i < 2 ? -hz : hz;
      const j = (i + 1) % 4,
        uu = j === 0 || j === 3 ? -hx : hx,
        vv = j < 2 ? -hz : hz;
      line(x + c * u + s * v, y, z - s * u + c * v, x + c * uu + s * vv, y, z - s * uu + c * vv, color);
    }
  }
  function cross(p, r, color) {
    line(p.x - r, p.y, p.z, p.x + r, p.y, p.z, color);
    line(p.x, p.y, p.z - r, p.x, p.y, p.z + r, color);
  }
  function local(p, object) {
    object.localToWorld(p);
    return p.applyMatrix4(inverse);
  }
  function transform(arr, offset, out) {
    return out.fromArray(arr, offset).applyMatrix4(m);
  }
  function addCapsule(part, p, q, r, s) {
    const { record, kind } = part;
    part.p.copy(p);
    part.q.copy(q);
    part.r = r;
    part.s = s;
    part.lengthSq = p.distanceToSquared(q);
    markers[markerCount++] = part;
    // Sweep a sphere down the short bone axis. Skip obstacles with disjoint
    // height and planar bounds before measuring signed distance.
    const pad = Math.max(r, s),
      x0 = Math.min(p.x, q.x) - pad,
      x1 = Math.max(p.x, q.x) + pad;
    const z0 = Math.min(p.z, q.z) - pad,
      z1 = Math.max(p.z, q.z) + pad;
    for (const o of nav.obstacles) {
      if (
        o === record.agent.support ||
        o.top < Math.min(p.y, q.y) - pad ||
        o.bottom > Math.max(p.y, q.y) + pad
      )
        continue;
      const range = o.radius ?? Math.hypot(o.hx, o.hz);
      if (o.x + range < x0 || o.x - range > x1 || o.z + range < z0 || o.z - range > z1) continue;
      let lo = 0,
        hi = 1;
      for (let k = 0; k < 10; k++) {
        const u = (2 * lo + hi) / 3,
          w = (lo + 2 * hi) / 3;
        if (sweepGap(o, p, q, r, s, u) < sweepGap(o, p, q, r, s, w)) hi = w;
        else lo = u;
      }
      const penetration = -Math.min(
        sweepGap(o, p, q, r, s, 0),
        sweepGap(o, p, q, r, s, 1),
        sweepGap(o, p, q, r, s, (lo + hi) / 2),
      );
      if (penetration > 0.0001) {
        encounter(record, o.name);
        const contact = record.pool[record.contacts];
        contact.part = kind;
        contact.obstacle = o.name;
        contact.penetration = penetration;
        record.report.contacts[record.contacts++] = contact;
      }
    }
  }
  return () => {
    if (changed()) setup();
    cursor = markerCount = 0;
    root.updateWorldMatrix(true, false);
    inverse.copy(root.matrixWorld).invert();
    for (const s of nav.surfaces)
      rectangle(
        (s.x0 + s.x1) / 2,
        s.y + 0.012,
        (s.z0 + s.z1) / 2,
        (s.x1 - s.x0) / 2,
        (s.z1 - s.z0) / 2,
        1,
        0,
        surfaceColor,
      );
    for (const o of nav.obstacles) {
      const y = o.bottom + 0.016;
      if (o.radius !== undefined) ring(o.x, y, o.z, o.radius, solidColor);
      else rectangle(o.x, y, o.z, o.hx, o.hz, o.cos, o.sin, solidColor);
    }
    let peopleCount = 0;
    for (const record of records) {
      const { agent } = record,
        { actor, route, position: p } = agent;
      if (actor && !actor.g.visible) continue;
      record.hits = record.contacts = record.footError = 0;
      diagnostics.people[peopleCount++] = record.report;
      if (route)
        for (let i = 1; i < route.points.length; i++) {
          const [x, z] = route.points[i - 1],
            [X, Z] = route.points[i],
            n = Math.ceil(Math.hypot(x - X, z - Z) / 0.12);
          for (let k = 0; k < n; k++) {
            const u = k / n,
              t = (k + 1) / n,
              xx = x + (X - x) * u,
              zz = z + (Z - z) * u,
              XX = x + (X - x) * t,
              ZZ = z + (Z - z) * t;
            line(xx, nav.floor(xx, zz) + 0.029, zz, XX, nav.floor(XX, ZZ) + 0.029, ZZ, pathColor);
          }
        }
      ring(p.x, p.y + 0.027, p.z, agent.reserved, good);
      if (!actor) {
        addCapsule(
          record.parts[0],
          a.set(p.x, p.y + agent.radius, p.z),
          b.set(p.x, p.y + agent.height - agent.radius, p.z),
          agent.radius,
          agent.radius,
        );
        continue;
      }
      const rig = actor.g,
        scale = rig.scale.y,
        d = actor.dynamics;
      rig.updateWorldMatrix(true, false);
      m.multiplyMatrices(inverse, rig.matrixWorld);
      if (d) {
        for (let i = 0; i < d.capsules.length; i += 8)
          addCapsule(
            record.parts[i / 8],
            transform(d.capsules, i, a),
            transform(d.capsules, i + 4, b),
            d.capsules[i + 3] * scale,
            d.capsules[i + 7] * scale,
          );
        for (const panel of d.panels) {
          const edges = panel.links,
            pts = panel.position;
          for (let j = 0; j < edges.length; j += 2)
            link(transform(pts, edges[j] * 3, a), transform(pts, edges[j + 1] * 3, b), 0x66d3e5);
        }
        for (const chain of d.chains)
          for (let i = 3; i < chain.position.length; i += 3)
            link(transform(chain.position, i - 3, a), transform(chain.position, i, b), 0xffb6cb);
        for (let j = 0; j < d.supportCount; j++)
          link(
            transform(d.support, j * 3, a),
            transform(d.support, ((j + 1) % d.supportCount) * 3, b),
            pathColor,
          );
        cross(transform(d.com, 0, a), 0.055 * scale, pathColor);
        for (const side of actor.rig?.sides ?? empty)
          for (const name of twistNames) {
            const bone = actor.skeleton.bones[side[name]];
            if (bone) link(local(a.set(0, 0, 0), bone), local(b.set(0.074, 0, 0), bone), 0xca8fff);
          }
      }
      for (const foot of actor.feet ?? empty)
        for (const name of soleNames) {
          const sole = foot[name];
          local(v.copy(sole), foot.ankle);
          // A seated oarsman braces on a moving deck. Sample its local board
          // height in the hull frame before plotting the contact in the scene.
          let error;
          if (agent.deckHeight) {
            foot.ankle.localToWorld(w.copy(sole));
            actor.g.parent.worldToLocal(w);
            error = Math.abs(w.y - agent.deckHeight(w.x, w.z));
          } else error = Math.abs(v.y - nav.floor(v.x, v.z));
          if (foot.planted) record.footError = Math.max(record.footError, error);
          cross(v, 0.021 * scale, foot.planted ? (error > 0.02 * scale ? bad : good) : pathColor);
        }
      for (let i = 0; i < record.props.length; i++) {
        const prop = record.props[i];
        if (prop.object.visible) {
          prop.object.getWorldScale(axis);
          a.copy(prop.center ?? v.set(0, 0, 0));
          b.copy(a);
          const k = prop.axis ?? 'y';
          a[k] -= prop.halfLength ?? 0;
          b[k] += prop.halfLength ?? 0;
          addCapsule(
            record.parts[(d?.names.length ?? 0) + i],
            local(a, prop.object),
            local(b, prop.object),
            prop.radius * axis.y,
            prop.radius * axis.y,
          );
        }
      }
    }
    for (let i = 0; i < markerCount; i++) {
      const c = markers[i],
        ray = c.axis;
      for (let j = 0; j < i; j++) {
        const other = markers[j];
        const same = c.record === other.record;
        if (same) {
          if (!c.pairNames[other.index]) continue;
        } else if (c.record.agent.position.distanceToSquared(other.record.agent.position) > 4) continue;
        const segment = other.axis;
        // Alternating projection onto two finite segments finds closest axis points.
        v.copy(c.p);
        let t = 0,
          u = 0;
        for (let n = 0; n < 6; n++) {
          u = other.lengthSq > 1e-12 ? segment.closestPointToPointParameter(v, true) : 0;
          segment.at(u, w);
          t = c.lengthSq > 1e-12 ? ray.closestPointToPointParameter(w, true) : 0;
          ray.at(t, v);
        }
        if (
          v.distanceTo(w) <
          T.MathUtils.lerp(c.r, c.s, t) + T.MathUtils.lerp(other.r, other.s, u) - 0.0001
        ) {
          if (same) encounter(c.record, c.pairNames[other.index]);
          else {
            encounter(c.record, other.record.name);
            encounter(other.record, c.record.name);
          }
        }
      }
    }
    for (let i = 0; i < markerCount; i++) {
      const c = markers[i];
      const color =
        c.record.hits || c.record.footError > 0.02 * (c.record.agent.actor?.g.scale.y ?? 1) ? bad : good;
      link(c.p, c.q, color);
      ring(c.p.x, c.p.y, c.p.z, c.r, color);
      ring(c.q.x, c.q.y, c.q.z, c.s, color);
    }
    let intersections = 0,
      footErrors = 0;
    for (const r of records) {
      if (r.agent.actor && !r.agent.actor.g.visible) continue;
      intersections += r.hits;
      r.report.footError = r.footError;
      r.report.obstacles.length = r.hits;
      r.report.contacts.length = r.contacts;
      if (r.footError > 0.02 * (r.agent.actor?.g.scale.y ?? 1)) footErrors++;
      // Materials can be shared by multiple instances. Tint only this actor's
      // visible render layers, restoring their actual material after recovery.
      const invalid = r.hits > 0 || r.footError > 0.02 * (r.agent.actor?.g.scale.y ?? 1);
      if (r.agent.instance) {
        const { mesh, index } = r.agent.instance;
        mesh.setColorAt(index, palette.setHex(invalid ? bad : 0xffffff));
        mesh.instanceColor.needsUpdate = true;
      }
      for (const t of r.layers) t.mesh.material = invalid ? t.tint : t.original;
    }
    diagnostics.intersections = intersections;
    diagnostics.footErrors = footErrors;
    diagnostics.people.length = peopleCount;
    if (intersections !== lastHits || footErrors !== lastFeet) {
      hud.textContent = 'People · ' + intersections + ' intersections · ' + footErrors + ' contact errors';
      lastHits = intersections;
      lastFeet = footErrors;
    }
    points.needsUpdate = colors.needsUpdate = true;
    geometry.setDrawRange(0, cursor / 3);
  };
}
