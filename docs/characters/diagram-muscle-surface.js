// Fibre charts live in the original BP3D coordinates. The same labelled belly
// and attachments therefore keep their finish through posing and across heroes.
import { Color, Float32BufferAttribute, MathUtils, Vector3 } from 'three';
import { coverAtlasContacts } from './diagram-scan-envelope.js';
import { fitMuscleFolds } from './diagram-fascia.js';

const belly = new Color('#8e2732'),
  tendon = new Color('#e8e0d1');
const clamp = MathUtils.clamp,
  smooth = MathUtils.smoothstep;

function principalDirection(positions, center, across) {
  let xx = 0,
    xy = 0,
    xz = 0,
    yy = 0,
    yz = 0,
    zz = 0;
  const v = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i).sub(center);
    if (across) v.addScaledVector(across, -v.dot(across));
    xx += v.x * v.x;
    xy += v.x * v.y;
    xz += v.x * v.z;
    yy += v.y * v.y;
    yz += v.y * v.z;
    zz += v.z * v.z;
  }
  v.set(xx >= yy && xx >= zz ? 1 : 0, yy > xx && yy >= zz ? 1 : 0, zz > xx && zz > yy ? 1 : 0);
  for (let i = 0; i < 10; i++) {
    const { x, y, z } = v;
    v.set(xx * x + xy * y + xz * z, xy * x + yy * y + yz * z, xz * x + yz * y + zz * z).normalize();
  }
  return v;
}

function atlasPoint(point) {
  return Array.isArray(point) ? new Vector3(...point) : point;
}

// Return the real atlas vertices closest to the source attachment annotations.
// The source does not label tendon material on individual triangles.
function attachmentSites(positions, samples) {
  const sites = [],
    q = new Vector3();
  for (const anchor of samples || []) {
    const p = atlasPoint(anchor.source);
    if (!p || !Number.isFinite(p.x)) continue;
    let distance = Infinity,
      nearest = anchor.index ?? 0;
    for (let i = 0; anchor.index == null && i < positions.count; i++) {
      const d = q.fromBufferAttribute(positions, i).distanceToSquared(p);
      if (d < distance) {
        nearest = i;
        distance = d;
      }
    }
    sites.push({
      p: new Vector3().fromBufferAttribute(positions, nearest),
      insertion: /insertion|distal/i.test(anchor.role),
    });
  }
  return sites;
}

// These broad sheets expose long aponeuroses and narrow terminal tendons.
// Locate them in the shared donor frame. The cortical registration sites
// include points inside those sheets and are unsuitable as pigment masks.
function sheetTendon(node) {
  const band = (d, core, edge) => 1 - smooth(Math.abs(d), core, edge);
  if (node.includes('pectoralis_major')) {
    const clavicular = node.includes('clavicular'), abdominal = node.includes('abdominal');
    return (x, y) => {
      const humeral = smooth(x, 0.156, 0.180) * smooth(y, 1.280, 1.327);
      let medial;
      if (clavicular) medial = band(y - (1.375 + 0.34 * x), 0.0012, 0.007) * (1 - smooth(x, 0.062, 0.101));
      else if (abdominal) medial = band(y - (1.178 + 0.55 * (x - 0.05)), 0.0015, 0.008) * (1 - smooth(x, 0.070, 0.101));
      else medial = 1 - smooth(x, 0.005, 0.013);
      return Math.max(0.48 * medial, 0.86 * humeral);
    };
  }
  if (node.includes('latissimus_dorsi')) {
    return (x, y) => {
      // The thoracolumbar fascia broadens toward the posterior iliac crest.
      // Its oblique border converges on the lower thoracic spinous line.
      const lumbar = 1 - smooth(y, 0.950, 1.243);
      const fasciaWidth = 0.005 + 0.075 * lumbar;
      const fascia = 1 - smooth(x, fasciaWidth * 0.56, fasciaWidth);
      const humeral = smooth(x, 0.152, 0.179) * smooth(y, 1.259, 1.323);
      return Math.max((0.35 + 0.40 * lumbar) * fascia, 0.87 * humeral);
    };
  }
  if (node.includes('trapezius')) {
    const ascending = node.includes('ascending'), descending = node.includes('descending');
    return (x, y) => {
      // A thin midline raphe widens gradually at the cervicothoracic origin.
      const width = 0.004 + 0.010 * band(y - 1.445, 0.002, 0.065);
      const raphe = (1 - smooth(x, width * 0.25, width)) * 0.62;
      const blade = ascending
        ? band(y - (1.372 + 0.26 * (x - 0.071)), 0.0018, 0.006) * smooth(x, 0.065, 0.104)
        : smooth(x, descending ? 0.105 : 0.135, descending ? 0.133 : 0.161);
      return Math.max(raphe, 0.76 * blade);
    };
  }
  if (node.includes('rectus_abdominis')) {
    return (x, y) => {
      // The three relief grooves on the donor's anterior wall slope gently
      // across the paired bellies. The uppermost inscription is incomplete.
      const lower = band(y - (1.020 - 0.055 * (x - 0.035)), 0.0012, 0.0045);
      const middle = band(y - (1.079 - 0.11 * (x - 0.035)), 0.0014, 0.0048);
      const upper = band(y - (1.147 - 0.19 * (x - 0.035)), 0.0010, 0.0042) * (1 - smooth(x, 0.038, 0.056));
      const inscribed = Math.max(lower, middle, upper) * smooth(x, 0.005, 0.013) * (1 - smooth(x, 0.047, 0.070));
      const pubic = 1 - smooth(y, 0.853, 0.886);
      const costal = smooth(y, 1.225, 1.248);
      return Math.max(0.52 * inscribed, 0.75 * pubic, 0.48 * costal);
    };
  }
  return null;
}

export function prepareAtlasMuscle(sourceGeometry, fittedGeometry, nodeName, attachmentSamples) {
  const positions = sourceGeometry.attributes.position,
    count = positions.count;
  const sites = attachmentSites(positions, attachmentSamples);
  const q = new Vector3(),
    center = new Vector3(),
    origin = new Vector3(),
    insertion = new Vector3();
  for (let i = 0; i < count; i++) center.add(q.fromBufferAttribute(positions, i));
  center.divideScalar(count);
  let origins = 0,
    insertions = 0;
  for (const site of sites) {
    if (site.insertion) {
      insertion.add(site.p);
      insertions++;
    } else {
      origin.add(site.p);
      origins++;
    }
  }
  const axis = principalDirection(positions, center);
  if (origins && insertions) {
    const reference = insertion.divideScalar(insertions).sub(origin.divideScalar(origins));
    // The shoulder and hip fans widen toward their several origins. Their
    // anatomical fibre axis can differ from the long side of the fan.
    if (reference.lengthSq() > 1e-8) axis.copy(reference).normalize();
  }
  const transverse = principalDirection(positions, center, axis);
  const along = new Float32Array(count),
    across = new Float32Array(count);
  let lo = Infinity,
    hi = -Infinity,
    left = Infinity,
    right = -Infinity;
  for (let i = 0; i < count; i++) {
    q.fromBufferAttribute(positions, i).sub(center);
    const y = (along[i] = q.dot(axis)),
      x = (across[i] = q.dot(transverse));
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  const length = Math.max(1e-6, hi - lo),
    width = Math.max(1e-6, right - left);
  const bins = 11,
    minima = new Array(bins).fill(Infinity),
    maxima = new Array(bins).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    const row = clamp(Math.round(((along[i] - lo) / length) * (bins - 1)), 0, bins - 1);
    minima[row] = Math.min(minima[row], across[i]);
    maxima[row] = Math.max(maxima[row], across[i]);
  }
  // Smooth section width so the fibres fan and converge along the surface.
  // This open transverse chart has no seam across an atlas triangle.
  const centers = [],
    widths = [];
  for (let i = 0; i < bins; i++) {
    let min = Infinity,
      max = -Infinity;
    for (let j = Math.max(i - 1, 0); j <= Math.min(i + 1, bins - 1); j++) {
      min = Math.min(min, minima[j]);
      max = Math.max(max, maxima[j]);
    }
    centers.push(Number.isFinite(min) ? (min + max) * 0.5 : (left + right) * 0.5);
    widths.push(Number.isFinite(min) ? Math.max(width * 0.3, max - min) : width);
  }
  const longTendon = /digitorum|pollicis|hallucis|tibialis|gastrocnemius|soleus|carpi|palmaris_longus/i.test(
    nodeName,
  );
  const fan = /pectoralis|latissimus|oblique|aponeurosis|gluteus|trapezius|deltoid/i.test(nodeName);
  const uv = new Float32Array(count * 2),
    colors = new Float32Array(count * 3);
  const tint = new Color();
  const sheet = sheetTendon(nodeName);
  for (let i = 0; i < count; i++) {
    const t = clamp((along[i] - lo) / length, 0, 1),
      row = t * (bins - 1),
      a = Math.min(bins - 2, Math.floor(row)),
      b = row - a;
    const rowCenter = MathUtils.lerp(centers[a], centers[a + 1], b);
    const rowWidth = MathUtils.lerp(widths[a], widths[a + 1], b);
    uv[2 * i] = 0.5 + (across[i] - rowCenter) / (rowWidth * 0.72 + width * 0.28);
    uv[2 * i + 1] = t;
    q.fromBufferAttribute(positions, i);
    let pale = sheet ? sheet(Math.abs(q.x), q.y) : 0;
    if (!sheet) {
      for (const site of sites) {
        const radius = length * (site.insertion ? (longTendon ? 0.28 : 0.16) : fan ? 0.15 : 0.095);
        pale = Math.max(pale, 1 - smooth(q.distanceTo(site.p) / radius, 0.2, 1));
      }
    }
    // The broad central tendon lies on the superior dome of the diaphragm.
    if (nodeName === 'diaphragm')
      pale = Math.max(
        pale,
        smooth(t, 0.52, 0.92) * (1 - smooth(Math.abs(across[i] - (left + right) * 0.5) / width, 0.18, 0.45)),
      );
    // On the small deep slips without explicit bone insertions, only their
    // narrowing terminal fibres take on a connective-tissue tint.
    if (!sites.length)
      pale = Math.max(
        pale,
        (1 - smooth(Math.min(t, 1 - t), 0.025, 0.14)) * (1 - smooth(rowWidth / width, 0.42, 0.85)) * 0.85,
      );
    tint
      .copy(belly)
      .lerp(tendon, clamp(pale, 0, 1))
      .toArray(colors, 3 * i);
  }
  fittedGeometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  fittedGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

// In a flexed pose, a long triangle can cut across a genuine concavity even
// when its three vertices are inside. Bring the neighbouring vertices around
// the fold. A shared atlas edge and a cortical insertion stay shared.
function fitTissueFolds(geometry, fit, pinned, height) {
  const positions = geometry.attributes.position,
    ix = geometry.index.array;
  const count = positions.count,
    edges = new Set(),
    guides = [];
  const a = new Vector3(),
    b = new Vector3(),
    v = new Vector3();
  const minimum = (height * 0.007) ** 2;
  for (let i = 0; i < ix.length; i += 3) {
    const face = [ix[i], ix[i + 1], ix[i + 2]];
    let large = false;
    for (let j = 0; j < 3; j++) {
      const e = face[j],
        f = face[(j + 1) % 3];
      a.fromBufferAttribute(positions, e);
      b.fromBufferAttribute(positions, f);
      if (a.distanceToSquared(b) < minimum) continue;
      const key = Math.min(e, f) * count + Math.max(e, f);
      large = true;
      if (edges.has(key)) continue;
      edges.add(key);
      guides.push([e, f]);
    }
    if (large) guides.push(face);
  }
  const changes = new Float32Array(count * 3),
    largest = new Float32Array(count);
  for (let pass = 0; pass < 5; pass++) {
    let contacts = 0;
    for (const guide of guides) {
      a.set(0, 0, 0);
      let free = 0;
      for (const id of guide) {
        a.add(v.fromBufferAttribute(positions, id));
        if (!pinned.has(id)) free++;
      }
      if (!free) continue;
      a.divideScalar(guide.length);
      const push = fit(b.copy(a)).sub(a);
      const d = push.length();
      if (d < height * 0.0015) continue;
      contacts++;
      push.multiplyScalar(guide.length / free);
      for (const id of guide) {
        if (pinned.has(id)) continue;
        changes[3 * id] += push.x * d;
        changes[3 * id + 1] += push.y * d;
        changes[3 * id + 2] += push.z * d;
        largest[id] = Math.max(largest[id], push.length());
      }
    }
    if (!contacts) break;
    for (let i = 0; i < count; i++) {
      if (!largest[i]) continue;
      a.fromBufferAttribute(positions, i);
      b.fromArray(changes, 3 * i).normalize();
      fit(a.addScaledVector(b, Math.min(largest[i], height * 0.012) * 0.75));
      positions.setXYZ(i, a.x, a.y, a.z);
    }
    changes.fill(0);
    largest.fill(0);
  }
}

// Correct each muscle section coherently before touching any remaining
// superficial fibres. Deep bellies retain their original registered shape.
// Retain the original atlas triangles everywhere the posed cover allows.
// On a folded surface, opposing triangle normals can cancel at a shared
// vertex. Use its largest surviving incident face for a stable shading normal.
function restoreCancelledNormals(geometry) {
  const normal = geometry.attributes.normal,
    position = geometry.attributes.position;
  const missing = new Map();
  for (let i = 0; i < normal.count; i++) {
    const lengthSq = normal.getX(i) ** 2 + normal.getY(i) ** 2 + normal.getZ(i) ** 2;
    if (lengthSq < 1e-12) missing.set(i, 0);
  }
  if (!missing.size) return;
  const index = geometry.index.array;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let i = 0; i < index.length; i += 3) {
    const ia = index[i],
      ib = index[i + 1],
      ic = index[i + 2];
    if (!missing.has(ia) && !missing.has(ib) && !missing.has(ic)) continue;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib).sub(a);
    c.fromBufferAttribute(position, ic).sub(a);
    b.cross(c);
    const areaSq = b.lengthSq();
    if (areaSq === 0) continue;
    b.normalize();
    for (let j = i; j < i + 3; j++) {
      const vertex = index[j];
      if (areaSq > (missing.get(vertex) ?? Infinity)) {
        missing.set(vertex, areaSq);
        normal.setXYZ(vertex, b.x, b.y, b.z);
      }
    }
  }
}

// At the axillary fold, nearby atlas vertices can project onto opposite
// sides of a skin crease. Redistribute excessive edge strain through the
// original triangle network before refining a chord. A cortical endpoint
// stays pinned, and a correction is accepted only inside the posed skin.
function relaxSheetEdges(geometry, donor, fit, pinned, height) {
  const pos = geometry.attributes.position, original = donor.attributes.position;
  const faces = geometry.index.array, seen = new Set(), edges = [];
  const a = new Vector3(), b = new Vector3(), delta = new Vector3();
  for (let i = 0; i < faces.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const from = faces[i + j], to = faces[i + (j + 1) % 3];
      const key = Math.min(from, to) * pos.count + Math.max(from, to);
      if (seen.has(key)) continue;
      seen.add(key);
      const rest = a.fromBufferAttribute(original, from).distanceTo(b.fromBufferAttribute(original, to));
      edges.push([from, to, height * 0.0015 + rest * 2.8]);
    }
  }
  const candidate = new Vector3();
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (const [from, to, limit] of edges) {
      a.fromBufferAttribute(pos, from);
      b.fromBufferAttribute(pos, to);
      delta.subVectors(b, a);
      const length = delta.length();
      if (length < limit + height * 0.0001) continue;
      delta.multiplyScalar((length - limit) * 0.46 / length);
      if (!pinned.has(from) && fit.inside(candidate.copy(a).add(delta))) {
        pos.setXYZ(from, candidate.x, candidate.y, candidate.z);
        changed = true;
      }
      if (!pinned.has(to) && fit.inside(candidate.copy(b).sub(delta))) {
        pos.setXYZ(to, candidate.x, candidate.y, candidate.z);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

export function fitAtlasMuscles(parts, rig, atlas, selectEnvelope) {
  const p = new Vector3(),
    before = new Vector3();
  const contacts = [];
  const rows = 9,
    eps = rig.height * 1e-7;
  for (const part of parts) {
    if (!part.muscleNode) continue;
    const { fit, thinSheet } = selectEnvelope(part);
    const g = part.mesh.geometry,
      pos = g.attributes.position,
      uv = g.attributes.uv;
    const cortical = new Set((part.attachments || []).map((anchor) => anchor.index));
    const moves = Array.from({ length: rows }, () => new Vector3());
    const lengths = new Float64Array(rows);
    let touched = 0;
    for (let i = 0; i < pos.count; i++) {
      before.fromBufferAttribute(pos, i);
      const delta = fit(p.copy(before)).sub(before),
        length = delta.length();
      if (length < eps) continue;
      const band = clamp(Math.round(uv.getY(i) * (rows - 1)), 0, rows - 1);
      moves[band].addScaledVector(delta, length);
      lengths[band] += length;
      touched++;
    }
    if (!touched && !thinSheet) {
      // A broad adductor can bridge the groin with every original vertex
      // safely inside each leg. Check its long, sparsely triangulated edge.
      if (part.region !== 'adductor') continue;
      fitMuscleFolds(g, fit, rig.height * 0.0016, contacts);
      g.computeVertexNormals();
      g.computeBoundingBox();
      g.computeBoundingSphere();
      continue;
    }
    for (let j = 0; j < rows; j++) if (lengths[j]) moves[j].multiplyScalar((thinSheet ? 0 : 0.75) / lengths[j]);
    for (let i = 0; i < pos.count; i++) {
      const row = clamp(uv.getY(i) * (rows - 1), 0, rows - 1),
        a = Math.min(rows - 2, Math.floor(row)),
        b = row - a;
      if (cortical.has(i)) continue;
      before.fromBufferAttribute(pos, i);
      p.copy(before)
        .addScaledVector(moves[a], 1 - b)
        .addScaledVector(moves[a + 1], b);
      fit(p);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    if (thinSheet) relaxSheetEdges(g, atlas.get(part.muscleNode), fit, cortical, rig.height);
    fitTissueFolds(g, fit, cortical, rig.height);
    // A few long source edges still cross a deep skin crease after the
    // bend, particularly where their endpoints must stay pinned to cortex.
    // Only refine actual exterior chords; the ordinary tissue reserve should
    // never add triangles on an interior muscle.
    // Thin sheets wrap tight creases under the jaw and between the upper
    // arm and chest. Resolve those folds at a finer sampling pitch.
    const sheet = /platysma|pectoralis/.test(part.muscleNode);
    const pitch = rig.height * (sheet ? 0.0011 : 0.0033);
    fitMuscleFolds(g, fit, pitch, contacts);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
  coverAtlasContacts(parts, contacts, rig.height);
  for (const part of parts) if (part.muscleNode) restoreCancelledNormals(part.mesh.geometry);
}
