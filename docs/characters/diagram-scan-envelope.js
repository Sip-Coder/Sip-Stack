// Continuous signed displacement against the posed skin. The source CT blade
// is wider than the deep shirt-arm crease in these bodies. Fit its cortex to
// the actual deltoid/trunk surface without replacing it with a loft or plate.
import { Box3, Ray, Triangle, Vector3 } from 'three';

function hierarchy(triangles) {
  const box = new Box3();
  for (const entry of triangles) box.union(entry.box);
  if (triangles.length <= 12) return { box, triangles };
  const length = box.getSize(new Vector3());
  const axis = length.x > length.y && length.x > length.z ? 'x' : length.y > length.z ? 'y' : 'z';
  triangles.sort((a, b) => a.center[axis] - b.center[axis]);
  const half = triangles.length >>> 1;
  return { box, left: hierarchy(triangles.slice(0, half)), right: hierarchy(triangles.slice(half)) };
}

function chart(part) {
  const g = part.mesh.geometry,
    pos = g.attributes.position,
    ids = g.index.array,
    triangles = [];
  const points = Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i));
  for (let i = 0; i < ids.length; i += 3) {
    const triangle = new Triangle(points[ids[i]], points[ids[i + 1]], points[ids[i + 2]]);
    const normal = triangle.getNormal(new Vector3());
    if (normal.lengthSq() < 0.9) continue;
    triangles.push({
      triangle,
      normal,
      ids: [ids[i], ids[i + 1], ids[i + 2]],
      box: new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]),
      center: triangle.getMidpoint(new Vector3()),
    });
  }
  return hierarchy(triangles);
}

function distance2(box, p) {
  const x = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
  const y = Math.max(box.min.y - p.y, 0, p.y - box.max.y);
  const z = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  return x * x + y * y + z * z;
}

function nearestSurface(tree, p) {
  const nearest = new Vector3(),
    hit = new Vector3(),
    toward = new Vector3();
  let best = Infinity,
    surface = null;
  function visit(node) {
    if (distance2(node.box, p) > best) return;
    if (node.triangles) {
      for (const e of node.triangles) {
        if (distance2(e.box, p) > best) continue;
        e.triangle.closestPointToPoint(p, hit);
        const d = p.distanceToSquared(hit);
        if (d < best) {
          best = d;
          nearest.copy(hit);
          surface = e;
        }
      }
    } else {
      const l = distance2(node.left.box, p),
        r = distance2(node.right.box, p);
      visit(l < r ? node.left : node.right);
      visit(l < r ? node.right : node.left);
    }
  }
  visit(tree);
  if (!surface) return null;
  toward.subVectors(p, nearest);
  const distance = Math.sqrt(best);
  const signed = toward.dot(surface.normal) >= 0 ? distance : -distance;
  const normal =
    distance < 1e-7 ? surface.normal.clone() : toward.normalize().multiplyScalar(signed < 0 ? -1 : 1);
  return { signed, normal, surface };
}

function displacement(tree, p, pad) {
  const result = nearestSurface(tree, p);
  if (!result) return { signed: Infinity, delta: new Vector3() };
  const { signed, normal: n } = result;
  // Reserve tissue near the boundary. Neighboring interior cortex moves
  // smoothly with the outer part to retain the scan's grooves and ridges.
  if (signed < -pad * 2) return { signed, delta: new Vector3() };
  const d = signed >= 0 ? signed + pad : (signed + pad * 2) ** 2 / (4 * pad);
  return { signed, delta: n.multiplyScalar(-d) };
}

export function scanEnvelope(parts, roma, h) {
  const families = new Map();
  function surface(name) {
    if (!families.has(name)) {
      const part = parts.find((p) => p.name === name);
      if (!part) throw Error('Missing posed inspection skin ' + name);
      families.set(name, chart(part));
    }
    return families.get(name);
  }
  const voxel = h * 0.0024;
  return (side, region) => {
    const pad = h * 0.002;
    const prefix = side === 'L' ? 'Left ' : 'Right ';
    const names = roma
      ? region === 'trunk'
        ? ['Covered torso and hips']
        : region === 'calf'
          ? [prefix + 'covered leg', prefix + 'foot inside trainer']
          : region === 'scapula'
            ? ['Covered torso and hips', prefix + 'covered arm']
            : [prefix + 'covered arm', prefix + 'hand']
      : region === 'calf'
        ? ['Continuous body, limbs and hands', prefix + 'foot inside trainer']
        : ['Continuous body, limbs and hands'];
    // Rigid scan pieces need the actual nearest skin triangle. Voxel blending
    // below smooths local deformation of flexible fitted surfaces.
    if (region === 'trunk') {
      const torso = surface(names[0]);
      return (p) => p.add(displacement(torso, p, pad).delta);
    }
    const trees = names.map(surface),
      memo = new Map(),
      sample = new Vector3();
    function corner(i, j, k) {
      const hash = ((i + 2048) * 4096 + j + 2048) * 4096 + k + 2048;
      let out = memo.get(hash);
      if (!out) {
        sample.set(i * voxel, j * voxel, k * voxel);
        let best;
        for (const tree of trees) {
          if (best && distance2(tree.box, sample) > Math.max(pad * pad * 4, best.signed ** 2)) continue;
          const d = displacement(tree, sample, pad);
          if (!best || d.signed < best.signed) best = d;
          if (best.signed < -pad * 2) break;
        }
        out = best.delta;
        memo.set(hash, out);
      }
      return out;
    }
    return (p) => {
      const x = p.x / voxel,
        y = p.y / voxel,
        z = p.z / voxel,
        i = Math.floor(x),
        j = Math.floor(y),
        k = Math.floor(z);
      const coord = [x - i, y - j, z - k],
        delta = new Vector3();
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++)
          for (let c = 0; c < 2; c++) {
            const weight =
              (a ? coord[0] : 1 - coord[0]) * (b ? coord[1] : 1 - coord[1]) * (c ? coord[2] : 1 - coord[2]);
            delta.addScaledVector(corner(i + a, j + b, k + c), weight);
          }
      return p.add(delta);
    };
  };
}

// A scapular blade spans the postero-lateral thorax and the upper arm. In
// Sippy that junction narrows markedly underneath his deltoid. The blade
// follows the continuous *upper* skin corridor through the axilla, avoiding
// chords across air between two independently closest skin surfaces.
export function shoulderBridge(parts, thorax, arm, h, roma) {
  const s = arm.s,
    frame = thorax.chest,
    head = frame.from(arm.headCenter),
    pitch = 0.0028;
  const x0 = 0,
    z0 = head.z - 0.078;
  const nx = Math.ceil((Math.abs(head.x) * 1.16 - x0) / pitch) + 1,
    nz = 64;
  const bins = Array.from({ length: nx * nz }, () => []);
  const names = roma
    ? ['Covered torso and hips', (s === 1 ? 'Left' : 'Right') + ' covered arm']
    : ['Continuous body, limbs and hands'];
  for (const part of parts.filter((p) => names.includes(p.name))) {
    const g = part.mesh.geometry,
      a = g.attributes.position,
      ix = g.index.array;
    const coords = Array.from({ length: a.count }, (_, i) => {
      const q = frame.from(new Vector3().fromBufferAttribute(a, i));
      q.x = (q.x * s - x0) / pitch;
      q.z = (q.z - z0) / pitch;
      return q;
    });
    for (let i = 0; i < ix.length; i += 3) {
      const a = coords[ix[i]],
        b = coords[ix[i + 1]],
        c = coords[ix[i + 2]];
      if (Math.min(a.y, b.y, c.y) > head.y + 0.08 || Math.max(a.y, b.y, c.y) < head.y - 0.13) continue;
      const du = b.x - a.x,
        dv = b.z - a.z,
        eu = c.x - a.x,
        ev = c.z - a.z,
        den = du * ev - dv * eu;
      if (Math.abs(den) < 1e-6) continue;
      for (
        let x = Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x)));
        x <= Math.min(nx - 1, Math.floor(Math.max(a.x, b.x, c.x)));
        x++
      ) {
        for (
          let z = Math.max(0, Math.ceil(Math.min(a.z, b.z, c.z)));
          z <= Math.min(nz - 1, Math.floor(Math.max(a.z, b.z, c.z)));
          z++
        ) {
          const u = ((x - a.x) * ev - (z - a.z) * eu) / den,
            v = (du * (z - a.z) - dv * (x - a.x)) / den;
          if (u >= 0 && v >= 0 && u + v <= 1) bins[x * nz + z].push(a.y + u * (b.y - a.y) + v * (c.y - a.y));
        }
      }
    }
  }
  const bands = bins.map((hits) => {
    hits.sort((a, b) => b - a);
    if (hits.length < 1) return null;
    const top = hits[0],
      bottom = hits[1] ?? head.y - 0.14;
    if (top - bottom < 0.006 || top < head.y - 0.048) return null;
    return [bottom + 0.0042, top - 0.0042];
  });
  // A safe rectangle on either side of a sampled contour prevents a coarse
  // cortical edge from grazing the sharp underside of a deltoid seam.
  const inner = bands.map((b, idx) => {
    if (!b) return null;
    const x = Math.floor(idx / nz),
      z = idx % nz;
    let lo = b[0],
      hi = b[1];
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      if (x + dx < 0 || x + dx >= nx || z + dz < 0 || z + dz >= nz) continue;
      const s = bands[(x + dx) * nz + z + dz];
      if (!s) return null;
      lo = Math.max(lo, s[0]);
      hi = Math.min(hi, s[1]);
    }
    return hi > lo ? [lo, hi] : null;
  });
  function project(x, z, y) {
    const i = Math.max(0, Math.min(nx - 1, x));
    const iz = Math.max(0, Math.min(nz - 1, z));
    // Favor the posterior lamina. Only move forward or upward if the skin
    // section at its measured depth ends before the blade.
    let best = Infinity,
      outY = y,
      outZ = z0 + iz * pitch;
    for (let dz = -20; dz <= 20; dz++) {
      const k = iz + dz;
      if (k < 0 || k >= nz) continue;
      const b = inner[i * nz + k];
      if (!b) continue;
      const dy = Math.max(b[0] - y, 0, y - b[1]);
      const cost = dy * dy + dz * dz * pitch * pitch * 0.72;
      if (cost < best) {
        best = cost;
        outY = Math.max(b[0], Math.min(b[1], y));
        outZ = z0 + k * pitch;
      }
    }
    return [outY, outZ];
  }
  return (point) => {
    const q = frame.from(point);
    const x = (s * q.x - x0) / pitch,
      z = (q.z - z0) / pitch;
    if (x < 0 || x >= nx - 1 || z < 0 || z >= nz - 1) return point;
    const i = Math.floor(x),
      j = Math.floor(z),
      dx = x - i,
      dz = z - j;
    let y = 0,
      depth = 0;
    for (let a = 0; a <= 1; a++)
      for (let b = 0; b <= 1; b++) {
        const weight = (a ? dx : 1 - dx) * (b ? dz : 1 - dz);
        const r = project(i + a, j + b, q.y);
        y += weight * r[0];
        depth += weight * r[1];
      }
    return frame.point(q.x, y, depth);
  };
}

// The thin axillary folds were sewn to the clothing pattern. Supply the final
// superficial tissue over the scan's projecting processes using the actual
// illustrated skin vertices. No second skin or invisible occluder is added.
const outwardRay = new Vector3(0.31, 0.21, 1).normalize();

// The sleeve and trunk surfaces share crease vertices with opposing face
// normals. An odd/even interior test resolves them geometrically.
function insideSkin(tree, p) {
  const ray = new Ray(p, outwardRay),
    crossing = new Vector3();
  const distances = [];
  function visit(node) {
    if (!ray.intersectsBox(node.box)) return;
    if (!node.triangles) {
      visit(node.left);
      visit(node.right);
      return;
    }
    for (const { triangle } of node.triangles) {
      if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, crossing)) {
        const d = crossing.distanceToSquared(p);
        if (!distances.some((old) => Math.abs(old - d) < 1e-10)) distances.push(d);
      }
    }
  }
  visit(tree);
  return distances.length % 2 === 1;
}

// Retain superficial tissue over a flexing pair of joint surfaces. The two
// axes meet smoothly where the adult CT plateau or epicondyles broaden.
function supportJointFold(g, pivot, endA, endB, height, span, fullness, subset) {
  const segmentA = endA.clone().sub(pivot).normalize(),
    segmentB = endB.clone().sub(pivot).normalize();
  const a = g.attributes.position,
    v = new Vector3();
  for (let i = 0; i < a.count; i++) {
    if (subset && !subset.has(i)) continue;
    v.fromBufferAttribute(a, i).sub(pivot);
    const axis = v.dot(segmentA) > v.dot(segmentB) ? segmentA : segmentB;
    const along = v.dot(axis),
      range = height * span;
    if (Math.abs(along) > range) continue;
    const radial = v.clone().addScaledVector(axis, -along);
    const taper = Math.max(0, 1 - (along / range) ** 2);
    v.addScaledVector(radial, fullness * taper * taper).add(pivot);
    a.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

export function coverArticularProcesses(parts, landmarks, rig) {
  const bones = landmarks.scan.bones;
  const roma = rig.name === 'roma',
    h = rig.height,
    whole = 'Continuous body, limbs and hands';
  for (const side of ['LEFT', 'RIGHT']) {
    const label = side === 'LEFT' ? 'Left' : 'Right';
    const axisSide = side === 'LEFT' ? 'L' : 'R';
    const leg = landmarks.pelvis[axisSide],
      arm = landmarks.shoulders[axisSide];
    const legSkin = parts.find((p) => p.name === (roma ? label + ' covered leg' : whole)).mesh.geometry;
    let kneeRings;
    if (!roma) {
      const src = rig.secondary.sippy.body.geometry;
      const ref = rig.blueprint.knee[side === 'LEFT' ? 0 : 1].parts[0];
      const ids = ref.vertices[src === ref.mesh.userData.mobileGeometry ? 'mobile' : 'high'];
      const low = ids[0] - 3 * ids.length,
        high = ids[0] + 6 * ids.length;
      kneeRings = new Set();
      for (let j = 0; j < src.index.count; j++) {
        const id = src.index.array[j];
        if (id >= low && id < high) kneeRings.add(legSkin.index.array[j]);
      }
    }
    supportJointFold(legSkin, leg.knee, leg.ankle, leg.femoralHead, h, 0.066, 0.16, kneeRings);
    if (roma) {
      const armSkin = parts.find((p) => p.name === label + ' covered arm').mesh.geometry;
      supportJointFold(armSkin, arm.elbow, arm.wrist, arm.headCenter, h, 0.093, 0.085);
    }
    const regions = [
      [
        ['SCAPULA', 'CLAVICLE', 'HUMERUS'],
        roma ? ['Covered torso and hips', label + ' covered arm'] : [whole],
      ],
      [['ULNA', 'RADIUS'], roma ? [label + ' covered arm', label + ' hand'] : [whole]],
      [
        ['TIBIA', 'FIBULA', 'PATELLA', 'FEMUR'],
        roma
          ? [label + ' covered leg', label + ' foot inside trainer']
          : [whole, label + ' foot inside trainer'],
      ],
    ];
    // In flexion the true femoral neck passes under the anterior inguinal
    // fold. The lower-density sewn thigh can otherwise intersect its cortex
    // between the final circular band and the actual pelvic saddle.
    if (!roma && rig.secondary.sippy.body.geometry === rig.secondary.sippy.body.userData.mobileGeometry) {
      const pelvisUp = landmarks.pelvis
        .place(0, 1, 0)
        .sub(landmarks.pelvis.place(0, 0, 0))
        .normalize();
      const thighDown = leg.knee.clone().sub(leg.femoralHead).normalize();
      if (thighDown.dot(pelvisUp) > -0.97) regions.push([['FEMUR'], [whole]]);
    }
    for (const [nodes, names] of regions) {
      // Sippy's sewn calf/condyle rings already follow the scanned cortex.
      // Further nearest-surface displacement can buckle the flexed knee.
      if (!roma && nodes.includes('TIBIA')) continue;
      const skins = parts.filter((p) => names.includes(p.name));
      const samples = [];
      for (const name of nodes) {
        const g = bones.get(name + '_' + side),
          a = g.attributes.position,
          ix = g.index.array;
        const points = Array.from({ length: a.count }, (_, i) => new Vector3().fromBufferAttribute(a, i));
        const proximalFemur = nodes.length === 1 && name === 'FEMUR';
        const joint = proximalFemur
          ? leg.femoralHead
          : rig['shin' + axisSide].getWorldPosition(new Vector3());
        const radius = h * (proximalFemur ? 0.07 : 0.058);
        const include = (point) => name !== 'FEMUR' || point.distanceTo(joint) < radius;
        for (const p of points) if (include(p)) samples.push(p);
        const edges = new Set();
        for (let i = 0; i < ix.length; i += 3) {
          const u = points[ix[i]],
            v = points[ix[i + 1]],
            w = points[ix[i + 2]];
          if (!include(u) && !include(v) && !include(w)) continue;
          samples.push(
            u
              .clone()
              .add(v)
              .add(w)
              .multiplyScalar(1 / 3),
          );
          for (let j = 0; j < 3; j++) {
            const k = ix[i + j],
              l = ix[i + ((j + 1) % 3)],
              key = Math.min(k, l) * a.count + Math.max(k, l);
            if (!edges.has(key)) {
              edges.add(key);
              samples.push(points[k].clone().lerp(points[l], 0.5));
            }
          }
        }
      }
      if (nodes.length === 1 && nodes[0] === 'FEMUR') {
        // The donor neck is already seated. Only lift sewn vertices at
        // actual contacts, retaining the other side of the flexion crease.
        coverAtlasContacts(parts, samples, h);
        continue;
      }
      let candidates = samples;
      for (let pass = 0; pass < 4; pass++) {
        const trees = skins.map(chart),
          edits = skins.map(() => new Map()),
          near = [];
        // Signed distance is 1-Lipschitz. If a cell centre has this
        // clearance, no vertex or face sample in its cube can touch skin.
        const voxel = h * 0.005,
          diagonal = voxel * Math.sqrt(3) * 0.5;
        const cells = new Map(),
          cellPoint = new Vector3();
        for (const p of candidates) {
          if (pass === 0) {
            const x = Math.floor(p.x / voxel),
              y = Math.floor(p.y / voxel),
              z = Math.floor(p.z / voxel);
            const key = ((x + 2048) * 4096 + y + 2048) * 4096 + z + 2048;
            let safe = cells.get(key);
            if (safe === undefined) {
              cellPoint.set((x + 0.5) * voxel, (y + 0.5) * voxel, (z + 0.5) * voxel);
              safe = trees.some((tree) => {
                if (distance2(tree.box, cellPoint) > 0) return false;
                const hit = nearestSurface(tree, cellPoint);
                return hit && Math.abs(hit.signed) > diagonal + h * 0.008 && insideSkin(tree, cellPoint);
              });
              cells.set(key, safe);
            }
            if (safe) continue;
          }
          let best = null,
            index = 0,
            clearance = Infinity;
          for (let j = 0; j < trees.length; j++) {
            const hit = nearestSurface(trees[j], p);
            if (!hit) continue;
            const d = Math.abs(hit.signed);
            const signed = insideSkin(trees[j], p) ? -d : d;
            if (signed < clearance) {
              best = hit;
              index = j;
              clearance = signed;
            }
            if (clearance < -h * 0.008) break;
          }
          if (!best || clearance < -h * 0.008 || clearance > h * 0.035) continue;
          near.push(p);
          if (clearance < -h * 0.0018) continue;
          const d = clearance + h * 0.004;
          const away = best.normal.multiplyScalar((best.signed < 0 ? -1 : 1) * (clearance < 0 ? -1 : 1));
          for (const i of best.surface.ids) {
            const field = edits[index],
              o = field.get(i) || { sum: new Vector3(), max: 0 };
            o.sum.addScaledVector(away, d * d);
            o.max = Math.max(o.max, d);
            field.set(i, o);
          }
        }
        if (edits.every((e) => !e.size)) break;
        // A later pass only resolves the processes which originally contacted
        // this skin; unaffected cortex is unchanged.
        candidates = near;
        for (let j = 0; j < skins.length; j++) {
          if (!edits[j].size) continue;
          const g = skins[j].mesh.geometry,
            a = g.attributes.position,
            byPoint = new Map();
          const key = (i) => [a.getX(i), a.getY(i), a.getZ(i)].map((v) => Math.round(v * 1e6)).join('/');
          for (const [i, field] of edits[j]) {
            const k = key(i),
              old = byPoint.get(k);
            if (!old || field.max > old.max) byPoint.set(k, field);
          }
          for (let i = 0; i < a.count; i++) {
            const field = byPoint.get(key(i));
            if (!field) continue;
            const v = new Vector3()
              .fromBufferAttribute(a, i)
              .addScaledVector(field.sum.clone().normalize(), Math.min(field.max, h * 0.013) * 1.1);
            a.setXYZ(i, v.x, v.y, v.z);
          }
          g.computeVertexNormals();
          g.computeBoundingBox();
          g.computeBoundingSphere();
        }
      }
    }
  }
}

// Preserve the drawn character skin at a tendon crossing. Tiny residual
// contacts underneath the clavicle, ankle and thumb need the skin's own
// crease to open as it would over a flexing tendon. Only the existing local
// cutaneous vertices move; the outer layers share their original topology.
export function coverAtlasContacts(parts, contacts, height) {
  if (!contacts.length) return;
  const samples = new Map();
  for (const point of contacts) {
    const key = point.x + '/' + point.y + '/' + point.z;
    const sample = samples.get(key);
    if (sample) sample.weight++;
    else samples.set(key, {point, weight: 1});
  }
  const skin = parts.filter(
    (p) =>
      p.layer === 'skin' &&
      /^(Continuous body, limbs and hands|Face|Neck|Covered torso and hips|(?:Left|Right) (?:covered (?:leg|arm)|hand|foot inside trainer))$/.test(
        p.name,
      ),
  );
  const margin = height * 0.0023,
    limit = height * 0.008;
  for (let pass = 0; pass < 2; pass++) {
    const trees = new Map(),
      edits = new Map();
    let moved = false;
    for (const {point: p, weight} of samples.values()) {
      let best,
        dst,
        d = limit;
      for (const part of skin) {
        const g = part.mesh.geometry;
        if (distance2(g.boundingBox, p) > d * d) continue;
        if (!trees.has(g)) trees.set(g, chart(part));
        const tree = trees.get(g),
          hit = nearestSurface(tree, p);
        if (!hit) continue;
        if (insideSkin(tree, p)) {
          best = null;
          break;
        }
        const distance = Math.abs(hit.signed);
        if (distance <= d) {
          d = distance;
          best = hit;
          dst = g;
        }
      }
      if (!best) continue;
      const direction = best.normal.clone().multiplyScalar(best.signed < 0 ? -1 : 1);
      const byVertex = edits.get(dst) || new Map();
      edits.set(dst, byVertex);
      for (const id of best.surface.ids) {
        const prev = byVertex.get(id) || { sum: new Vector3(), max: 0 };
        const step = d + margin;
        prev.sum.addScaledVector(direction, step * step * weight);
        prev.max = Math.max(prev.max, step);
        byVertex.set(id, prev);
      }
    }
    for (const [g, field] of edits) {
      const pos = g.attributes.position,
        shared = new Map(),
        v = new Vector3();
      const key = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((t) => Math.round(t * 1e6)).join('/');
      for (const [id, correction] of field) {
        const k = key(id),
          old = shared.get(k);
        if (!old || old.max < correction.max) shared.set(k, correction);
      }
      for (let i = 0; i < pos.count; i++) {
        const corr = shared.get(key(i));
        if (!corr) continue;
        const normal = new Vector3().fromBufferAttribute(g.attributes.normal, i).normalize();
        const alignment = corr.sum.normalize().dot(normal);
        if(alignment <= .12) continue;
        const offset = Math.min(height*.0025, corr.max/Math.max(alignment,.55));
        v.fromBufferAttribute(pos, i).addScaledVector(normal, offset);
        pos.setXYZ(i, v.x, v.y, v.z);
        moved = true;
      }
      g.computeBoundingBox();
      g.computeBoundingSphere();
      g.computeVertexNormals();
    }
    if (!moved) break;
  }
}
