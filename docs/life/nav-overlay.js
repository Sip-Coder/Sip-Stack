// On-demand WebGL overlay. Every measurement uses the same transforms as the
// skinned character, including station or hull rotation.
import * as T from 'three';
import { pointGap } from './nav.js';

const surfaceColor = 0x4ca2d8,
  solidColor = 0xd98650,
  pathColor = 0xffda60,
  good = 0x58e2b1,
  bad = 0xff332e;
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
  const pos = [],
    rgb = [],
    palette = new T.Color(),
    v = new T.Vector3(),
    w = new T.Vector3();
  const a = new T.Vector3(),
    b = new T.Vector3(),
    m = new T.Matrix4(),
    inverse = new T.Matrix4(),
    axis = new T.Vector3();
  const markers = [];
  const hud = document.createElement('output');
  hud.setAttribute('aria-label', 'People diagnostics');
  hud.style.cssText =
    'position:fixed;bottom:16px;left:12px;z-index:20;padding:7px 10px;background:#14211fe8;color:#e2f5e9;border-radius:4px;font:12px/1.4 monospace;pointer-events:none';
  const stage = viewport && document.querySelector(viewport);
  if (stage) hud.style.position = 'absolute';
  (stage || document.body).append(hud);
  let lastLabel = '';
  function line(x, y, z, X, Y, Z, color) {
    pos.push(x, y, z, X, Y, Z);
    palette.setHex(color);
    rgb.push(palette.r, palette.g, palette.b, palette.r, palette.g, palette.b);
  }
  function link(p, q, color) {
    line(p.x, p.y, p.z, q.x, q.y, q.z, color);
  }
  function ring(x, y, z, r, color) {
    for (let i = 0; i < 16; i++) {
      const u = (i * Math.PI) / 8,
        t = ((i + 1) * Math.PI) / 8;
      line(x + Math.cos(u) * r, y, z + Math.sin(u) * r, x + Math.cos(t) * r, y, z + Math.sin(t) * r, color);
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
  function addCapsule(record, p, q, r, s, kind) {
    markers.push({ record, p: p.clone(), q: q.clone(), r, s, kind });
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
      const gap = (t) =>
        pointGap(o, p.x + t * (q.x - p.x), p.y + t * (q.y - p.y), p.z + t * (q.z - p.z)) - (r + t * (s - r));
      for (let k = 0; k < 10; k++) {
        const u = (2 * lo + hi) / 3,
          w = (lo + 2 * hi) / 3;
        if (gap(u) < gap(w)) hi = w;
        else lo = u;
      }
      const penetration = -Math.min(gap(0), gap(1), gap((lo + hi) / 2));
      if (penetration > 0.0001) {
        record.obstacles.add(o.name);
        record.contacts.push({ part: kind, obstacle: o.name, penetration });
      }
    }
  }
  return () => {
    pos.length = rgb.length = markers.length = 0;
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
    const records = [];
    for (const agent of nav.agents) {
      const { actor, route, position: p } = agent;
      if (actor && !actor.g.visible) continue;
      const record = { name: agent.name, agent, obstacles: new Set(), contacts: [], footError: 0 };
      records.push(record);
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
          record,
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
      const transform = (arr, offset, out) => out.fromArray(arr, offset).applyMatrix4(m);
      if (d) {
        for (let i = 0; i < d.capsules.length; i += 8)
          addCapsule(
            record,
            transform(d.capsules, i, a),
            transform(d.capsules, i + 4, b),
            d.capsules[i + 3] * scale,
            d.capsules[i + 7] * scale,
            d.names[i / 8],
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
        for (const side of actor.rig?.sides ?? [])
          for (const id of [side.armTwist, side.foreTwist, side.thighTwist]) {
            const bone = actor.skeleton.bones[id];
            if (bone) link(local(a.set(0, 0, 0), bone), local(b.set(0.074, 0, 0), bone), 0xca8fff);
          }
      }
      for (const foot of actor.feet ?? [])
        for (const sole of [foot.heel, foot.toe]) {
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
      for (const prop of agent.props ?? [])
        if (prop.object.visible) {
          prop.object.getWorldScale(axis);
          a.copy(prop.center ?? v.set(0, 0, 0));
          b.copy(a);
          const k = prop.axis ?? 'y';
          a[k] -= prop.halfLength ?? 0;
          b[k] += prop.halfLength ?? 0;
          addCapsule(
            record,
            local(a, prop.object),
            local(b, prop.object),
            prop.radius * axis.y,
            prop.radius * axis.y,
            'held prop',
          );
        }
    }
    for (let i = 0; i < markers.length; i++) {
      const c = markers[i],
        ray = new T.Line3(c.p, c.q);
      for (let j = 0; j < i; j++) {
        const other = markers[j];
        const same = c.record === other.record;
        if (same) {
          const core = (k) => /pelvis|abdomen|thorax|head|thigh|shin/.test(k);
          const upper = (k) => /abdomen|thorax|head/.test(k);
          if (
            !(
              (c.kind === 'held prop' && core(other.kind)) ||
              (other.kind === 'held prop' && core(c.kind)) ||
              (c.kind?.endsWith('hand') && upper(other.kind)) ||
              (other.kind?.endsWith('hand') && upper(c.kind))
            )
          )
            continue;
        } else if (c.record.agent.position.distanceToSquared(other.record.agent.position) > 4) continue;
        const segment = new T.Line3(other.p, other.q);
        // Alternating projection onto two finite segments finds closest axis points.
        v.copy(c.p);
        let t = 0,
          u = 0;
        for (let n = 0; n < 6; n++) {
          u = other.p.distanceToSquared(other.q) > 1e-12 ? segment.closestPointToPointParameter(v, true) : 0;
          segment.at(u, w);
          t = c.p.distanceToSquared(c.q) > 1e-12 ? ray.closestPointToPointParameter(w, true) : 0;
          ray.at(t, v);
        }
        if (
          v.distanceTo(w) <
          T.MathUtils.lerp(c.r, c.s, t) + T.MathUtils.lerp(other.r, other.s, u) - 0.0001
        ) {
          if (same) c.record.obstacles.add(c.kind + ' / ' + other.kind);
          else {
            c.record.obstacles.add(other.record.name);
            other.record.obstacles.add(c.record.name);
          }
        }
      }
    }
    for (const c of markers) {
      const color =
        c.record.obstacles.size || c.record.footError > 0.02 * (c.record.agent.actor?.g.scale.y ?? 1)
          ? bad
          : good;
      link(c.p, c.q, color);
      ring(c.p.x, c.p.y, c.p.z, c.r, color);
      ring(c.q.x, c.q.y, c.q.z, c.s, color);
    }
    let intersections = 0,
      footErrors = 0;
    for (const r of records) {
      intersections += r.obstacles.size;
      if (r.footError > 0.02 * (r.agent.actor?.g.scale.y ?? 1)) footErrors++;
      // Materials can be shared by multiple instances. Tint only this actor's
      // visible render layers, restoring their actual material after recovery.
      const invalid = r.obstacles.size > 0 || r.footError > 0.02 * (r.agent.actor?.g.scale.y ?? 1);
      if (r.agent.instance) {
        const { mesh, index } = r.agent.instance;
        mesh.setColorAt(index, palette.setHex(invalid ? bad : 0xffffff));
        mesh.instanceColor.needsUpdate = true;
      }
      for (const mesh of r.agent.actor ? [r.agent.actor.low, ...r.agent.actor.layers] : []) {
        if (!mesh?.isMesh) continue;
        if (invalid && !mesh.userData.navOriginal) {
          const orig = mesh.material,
            tint = orig.clone();
          tint.color.set(0xff1111);
          tint.onBeforeCompile = orig.onBeforeCompile;
          tint.customProgramCacheKey = orig.customProgramCacheKey;
          mesh.userData.navOriginal = orig;
          mesh.material = tint;
        } else if (!invalid && mesh.userData.navOriginal) {
          mesh.material.dispose();
          mesh.material = mesh.userData.navOriginal;
          delete mesh.userData.navOriginal;
        }
      }
    }
    nav.diagnostics = {
      intersections,
      footErrors,
      people: records.map((r) => ({
        name: r.name,
        obstacles: [...r.obstacles],
        contacts: r.contacts,
        footError: r.footError,
      })),
    };
    const label = 'People · ' + intersections + ' intersections · ' + footErrors + ' contact errors';
    if (label !== lastLabel) {
      hud.textContent = label;
      lastLabel = label;
    }
    let points = geometry.getAttribute('position'),
      colors = geometry.getAttribute('color');
    if (!points || points.array.length < pos.length) {
      const size = Math.ceil(pos.length / 3072) * 3072;
      if (points) geometry.dispose();
      points = new T.BufferAttribute(new Float32Array(size), 3).setUsage(T.DynamicDrawUsage);
      colors = new T.BufferAttribute(new Float32Array(size), 3).setUsage(T.DynamicDrawUsage);
      geometry.setAttribute('position', points);
      geometry.setAttribute('color', colors);
    }
    points.array.set(pos);
    colors.array.set(rgb);
    points.needsUpdate = colors.needsUpdate = true;
    geometry.setDrawRange(0, pos.length / 3);
  };
}
