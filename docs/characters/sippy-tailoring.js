// Each pattern follows the same reference body. Inner cloth faces and joined
// edge strips give the cutaway fronts, hems, and cuffs a real thickness.
import * as T from 'three';
import { explorerTorso, explorerLimb, torsoStation, limbStation } from './human-exterior.js';
import { articulatedSleeve, bindCloth } from './sippy-skin.js';

const tau = 2 * Math.PI;
const lerp = T.MathUtils.lerp;
const smooth = T.MathUtils.smoothstep;
const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

function piece(parent, name, geometry, material, skinned = false) {
  const mesh = skinned ? new T.SkinnedMesh(geometry, material) : new T.Mesh(geometry, material);
  mesh.name = 'sippy-' + name;
  mesh.userData.patternPiece = true;
  if (geometry.userData.mobileGeometry) mesh.userData.mobileGeometry = geometry.userData.mobileGeometry;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Rectangular pattern cut on an arbitrary curved surface. Both surfaces
// share the edge vertices with the turned hem, including the front opening.
export function shell(along, around, point, closed = false) {
  const verts = [],
    uv = [];
  const columns = closed ? around : around + 1,
    plane = (along + 1) * columns;
  const vertex = (r, c) => r * columns + (closed ? c % columns : c);
  for (let inside = 0; inside < 2; inside++)
    for (let r = 0; r <= along; r++)
      for (let c = 0; c < columns; c++) {
        verts.push(...point(r / along, c / around, inside));
        uv.push(c / around, r / along);
      }
  function stitch(stepRows, stepCols) {
    const triangles = [];
    const quad = (a, b, c, d) => triangles.push(a, b, c, b, d, c);
    for (let r = 0; r < along; r += stepRows)
      for (let c = 0; c < around; c += stepCols) {
        const nr = Math.min(along, r + stepRows),
          nc = Math.min(around, c + stepCols);
        const a = vertex(r, c),
          b = vertex(r, nc),
          d = vertex(nr, c),
          e = vertex(nr, nc);
        quad(a, b, d, e);
        quad(a + plane, d + plane, b + plane, e + plane);
      }
    for (let c = 0; c < around; c += stepCols) {
      const nc = Math.min(around, c + stepCols),
        a = vertex(0, c),
        b = vertex(0, nc),
        q = vertex(along, c),
        e = vertex(along, nc);
      quad(a, a + plane, b, b + plane);
      quad(q, e, q + plane, e + plane);
    }
    if (!closed)
      for (let r = 0; r < along; r += stepRows) {
        const nr = Math.min(along, r + stepRows),
          a = vertex(r, 0),
          b = vertex(nr, 0),
          q = vertex(r, around),
          e = vertex(nr, around);
        quad(a, b, a + plane, b + plane);
        quad(q, q + plane, e, e + plane);
      }
    return triangles;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.userData.pattern = { along, around, columns };
  g.setIndex(stitch(1, 1));
  g.computeVertexNormals();
  const mobile = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(g.attributes)) mobile.setAttribute(name, attribute);
  mobile.setIndex(stitch(1, around > 16 ? 2 : 1));
  g.userData.mobileGeometry = mobile;
  return g;
}

function interpolate(rows, y, i) {
  let j = 1;
  while (j + 1 < rows.length && rows[j][0] < y) j++;
  const a = rows[j - 1],
    b = rows[j],
    t = T.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  // Cubic Hermite interpolation with central differences; preserve fitted
  // straight pattern edges as well as the softly padded shoulders.
  const prev = rows[Math.max(0, j - 2)],
    next = rows[Math.min(rows.length - 1, j + 1)];
  const d0 = ((b[i] - prev[i]) * (b[0] - a[0])) / (b[0] - prev[0]),
    d1 = ((next[i] - a[i]) * (b[0] - a[0])) / (next[0] - a[0]);
  return (
    a[i] * (1 - t) * (1 - t) * (1 + 2 * t) +
    b[i] * t * t * (3 - 2 * t) +
    d0 * t * (1 - t) * (1 - t) -
    d1 * t * t * (1 - t)
  );
}

const torso = [
  [-0.149, 0.105, 0.066, -0.003],
  [-0.115, 0.109, 0.07, 0.001],
  [-0.058, 0.105, 0.078, 0.004],
  [0, 0.105, 0.077, 0.007],
  [0.058, 0.119, 0.077, 0.006],
  [0.103, 0.128, 0.075, 0.001],
  [0.133, 0.134, 0.066, -0.003],
  [0.15, 0.121, 0.05, -0.003],
  [0.162, 0.071, 0.038, -0.002],
  [0.171, 0.035, 0.027, 0.001],
  [0.179, 0.028, 0.026, 0.002],
];
function draftTorso(y, a, scale, lift = 0) {
  const sx = Math.sin(a),
    cz = Math.cos(a);
  const w = interpolate(torso, y, 1),
    depth = interpolate(torso, y, 2),
    z = interpolate(torso, y, 3);
  // Pectoral volume under the vest, collarbone and the hollow beside the
  // spine. These landmarks persist through each successive fitted layer.
  const chest =
    0.0041 * gauss(y, 0.105, 0.039) * gauss(Math.abs(sx), 0.51, 0.34) +
    0.0024 * gauss(y, 0.151 - 0.014 * Math.abs(sx), 0.008) * gauss(Math.abs(sx), 0.5, 0.34);
  const back = 0.0019 * gauss(y, 0.078, 0.063) * gauss(Math.abs(sx), 0.49, 0.33);
  return [
    sx * ((1 + 0.11 * (1 - smooth(y, 0.01, 0.066))) * scale * w + lift),
    y,
    z +
      cz * (scale * (depth + (cz > 0 ? chest : back)) + lift) +
      Math.max(0, cz) ** 3 * (0.012 + 0.012 * (1 - smooth(y, -0.055, 0.032))) * (1 - smooth(y, 0.06, 0.115)),
  ];
}
function jacketY(v, a) {
  const hem = -0.126 + 0.014 * Math.cos(a) - 0.007 * Math.sin(a) ** 2;
  const y = lerp(hem, 0.181 - 0.027 * Math.sin(a) ** 2, v);
  // The sleeveless zip vest finishes at the jogger waistband.
  return y + 0.017 * (1 - smooth(y, -0.09, 0.035));
}
function waistY(v, a) {
  const c = Math.max(0, Math.cos(a)),
    side = Math.abs(Math.sin(a));
  const hem = -0.094 - 0.012 * c + 0.002 * c * gauss(side, 0, 0.16);
  const neckline = 0.216 - 0.05 * c ** 3;
  const y = lerp(hem, neckline, v);
  return y - 0.023 * (1 - smooth(y, -0.077, 0.02));
}
function clothStrip(parent, name, mat, line, radius) {
  const curve = new T.CatmullRomCurve3(line.map((p) => new T.Vector3(...p)));
  const g = new T.TubeGeometry(curve, Math.max(8, Math.ceil(line.length / 2)), radius, 4, false);
  const m = piece(parent, name, g, mat);
  m.userData.highDetail = true;
  return m;
}

export function cutExplorerLayers(rig, mats) {
  const { white, suit, waistcoat, lapel, trousers, edge } = mats,
    chest = rig.chest;
  const chestOrigin = rig.anatomy.joints.chest;
  const oldHip = -0.1045, oldShoulder = 0.135;
  const torsoY = (y) => torsoStation(rig, y, oldHip, oldShoulder) - chestOrigin.y;
  const torsoPoint = (y, a, scale, lift = 0) => {
    const original = draftTorso(y, a, scale, lift);
    const waist = gauss(y, -0.025, 0.08);
    const x = original[0] * (0.86 - 0.085 * waist);
    const z = original[2] * (0.91 - 0.025 * waist);
    const clearance = 0.0024 + (0.044 + 0.017 * Math.max(0, Math.cos(a))) * Math.max(0, scale - 0.892) + lift;
    const measured = explorerTorso(rig, [x, y, z], clearance, oldHip, oldShoulder);
    return [measured[0] - chestOrigin.x, measured[1] - chestOrigin.y, measured[2] - chestOrigin.z];
  };
  const collarSeat = torsoY(0.157);
  const neckPoint = (a, y, radius, depth, lift = 0) => [
    Math.sin(a) * (radius + lift), collarSeat + y,
    rig.anatomy.joints.head.z - chestOrigin.z + Math.cos(a) * (depth + lift),
  ];
  const surfaces = {},
    pairs = [],
    updates = [];
  const add = (name, parent, geom, material, skinned = false) => {
    const m = piece(parent, name, geom, material, skinned);
    (surfaces[name] ??= []).push(m);
    return m;
  };
  const beneath = (outer, inner) => pairs.push({ outer, inner });
  add(
    'shirt',
    chest,
    shell(
      15,
      24,
      (v, u, inner) => torsoPoint(lerp(-0.076, 0.171, v), u * tau, 0.892, inner ? -0.00125 : 0),
      true,
    ),
    white,
  );
  beneath('shirt', 'body');
  // The trouser rise closes the fork between both legs. It sits under the
  // hoodie, with a small lip above the waistband for the tucked shirt.
  add(
    'trouser-rise',
    chest,
    shell(
      14,
      28,
      (v, u, inner) => torsoPoint(lerp(-0.163, -0.0628, v), u * tau, 0.9255, inner ? -0.00135 : 0),
      true,
    ),
    trousers,
  );
  beneath('trouser-rise', 'body');
  add(
    'hoodie',
    chest,
    shell(
      18,
      28,
      (v, u, inner) => {
        const a = u * tau;
        return torsoPoint(waistY(v, a), a, 0.947, inner ? -0.00135 : 0);
      },
      true,
    ),
    waistcoat,
  );
  beneath('hoodie', 'shirt');
  function jacketPoint(v, u, inside) {
    const open = 0.205 + 0.185 * smooth(v, 0.41, 0.9) + 0.076 * gauss(v, 0.985, 0.12);
    const a = lerp(open, tau - open, u),
      y = jacketY(v, a);
    return torsoPoint(y, a, 1, inside ? -0.0016 : 0);
  }
  add('quilted-vest', chest, shell(24, 36, jacketPoint), suit);
  beneath('quilted-vest', 'hoodie');
  beneath('quilted-vest', 'shirt');
  for (const side of [-1, 1]) {
    // Padded zipper tapes follow the front opening from the neckline to the hem.
    const slope = (v, u, inside) => {
      const open = 0.205 + 0.185 * smooth(v, 0.41, 0.9) + 0.076 * gauss(v, 0.985, 0.12);
      const a = side * (open + 0.015 + 0.056 * u);
      return torsoPoint(jacketY(v, a), a, 1, inside ? 0.0029 : 0.0047);
    };
    add('zipper-plackets', chest, shell(20, 4, slope), lapel);
    const line = [];
    for (let i = 0; i <= 44; i++) line.push(slope(i / 44, 0.87, false));
    clothStrip(chest, 'lapel-topstitch', edge, line, 0.00043);
    const seam = [];
    for (let i = 0; i <= 40; i++) seam.push(jacketPoint(i / 40, side === 1 ? 0.011 : 0.989, false));
    clothStrip(chest, 'jacket-front-binding', edge, seam, 0.00056);
  }
  beneath('zipper-plackets', 'quilted-vest');
  beneath('zipper-plackets', 'hoodie');
  const collarPoint = (v, u, inner) => {
    const a = lerp(0.48, tau - 0.48, u);
    const top = waistY(1, a);
    return torsoPoint(lerp(top - 0.013, top + 0.015, v), a, 0.947,
      (inner ? 0.0015 : 0.0032) + 0.0015 * Math.sin(Math.PI * v));
  };
  add('collar', chest, shell(6, 32, collarPoint), waistcoat);
  beneath('collar', 'shirt');
  beneath('collar', 'hoodie');
  const tails = [];
  for (const s of [-1, 1]) {
    const pivot = new T.Group();
    pivot.position.set(0, torsoY(-0.062), 0);
    chest.add(pivot);
    pivot.name = 'sippy-tail-' + (s === 1 ? 'L' : 'R');
    tails.push(pivot);
    const tail = (v, u, inner) => {
      const a = Math.PI + s * lerp(0.035, 0.89, u);
      const hem = -0.155 - 0.026 * Math.sin(u * Math.PI * 0.78),
        y = lerp(hem, -0.061, v);
      const p = torsoPoint(Math.max(-0.125, y), a, 1.02, inner ? 0.0039 : 0.0055);
      p[1] = torsoY(y) - pivot.position.y;
      p[2] -= 0.014 * (1 - v) * (1 - v);
      return p;
    };
    add('split-back', pivot, shell(18, 18, tail), suit);
  }
  beneath('split-back', 'quilted-vest');
  rig.garments = { surfaces, pairs, seams: [] };
  return { add, beneath, surfaces, tails, updates, rig, limbs: {}, torsoPoint, torsoY, neckPoint };
}

// A single articulated pattern runs across each elbow and knee. Slices
// rotate progressively into the lower joint while their centres follow a
// circular fillet around the bend. Shirtsleeves and skin use the same centres.
export function fitLimb(suit, side, leg, mats) {
  const { rig, add, beneath, updates } = suit;
  const joint = rig[(leg ? 'thigh' : 'upperArm') + side],
    lower = rig[(leg ? 'shin' : 'forearm') + side];
  const oldUpper = leg ? 0.245 : 0.176, oldLower = leg ? 0.228 : 0.143;
  const pivot = -oldUpper;
  const rows = leg
    ? [
        [-0.435, 0.026, 0.03, 0.001],
        [-0.424, 0.027, 0.031, -0.002],
        [-0.41, 0.038, 0.041, -0.005],
        [-0.37, 0.038, 0.045, -0.005],
        [-0.312, 0.041, 0.047, -0.008],
        [-0.278, 0.038, 0.045, -0.008],
        [-0.257, 0.04, 0.051, -0.008],
        [-0.235, 0.043, 0.051, -0.009],
        [-0.17, 0.048, 0.056, -0.015],
        [-0.104, 0.0555, 0.064, -0.013],
        [-0.062, 0.054, 0.064, -0.007],
        [-0.032, 0.043, 0.051, -0.004],
      ]
    : [
        [-0.322, 0.03, 0.03, 0.0],
        [-0.314, 0.03, 0.031, 0.0],
        [-0.295, 0.029, 0.028, 0.0],
        [-0.264, 0.028, 0.029, 0.001],
        [-0.227, 0.031, 0.034, 0.001],
        [-0.195, 0.031, 0.035, 0.0],
        [-0.177, 0.031, 0.033, -0.0],
        [-0.158, 0.032, 0.035, 0.0],
        [-0.112, 0.036, 0.037, 0.001],
        [-0.071, 0.039, 0.041, 0.001],
        [-0.043, 0.041, 0.045, -0.001],
        [-0.016, 0.041, 0.044, -0.001],
        [0.0, 0.036, 0.039, -0.002],
        [0.01, 0.02, 0.026, -0.002],
        [0.015, 0.014, 0.018, -0.001],
        [0.03, 0.009, 0.011, 0],
        [0.042, 0.0012, 0.0016, 0],
      ];
  const binder = articulatedSleeve(joint, lower, leg);
  const origin = rig.anatomy.joints[joint.name];
  const place = (xyz, clearance = 0.006) => {
    const measured = explorerLimb(rig, side, leg, xyz, clearance, oldUpper, oldLower);
    return measured.map((value, i) => value - origin.getComponent(i));
  };
  binder.place = place;
  binder.station = (y) => limbStation(rig, side, leg, y, oldUpper, oldLower);
  suit.limbs[(leg ? 'leg' : 'arm') + side] = binder;
  updates.push(binder.step);
  const key = (leg ? 'trousers-' : 'sleeve-') + side;
  function tube(name, mat, shrink, y0, y1, thick, n, nr) {
    const shape = shell(
      n,
      nr,
      (v, u, inner) => {
        const y = lerp(y0, y1, v),
          a = tau * u,
          cs = Math.cos(a),
          sn = Math.sin(a);
        const radius = inner ? -thick : 0,
          gx = interpolate(rows, y, 1) * shrink + radius,
          gz = interpolate(rows, y, 2) * shrink + radius;
        const knee = leg ? 0.0025 * gauss(y, pivot, 0.029) * Math.max(0, cs) : 0;
        const sleeveCurve = leg ? 1 : lerp(0.89, 1, smooth(y, -0.14, -0.019));
        return place([
          Math.sign(sn) * Math.abs(sn) ** sleeveCurve * gx,
          y,
          interpolate(rows, y, 3) + Math.sign(cs) * Math.abs(cs) ** sleeveCurve * (gz + knee),
        ], (leg ? 0.010 : shrink < 1 ? 0.0035 : 0.008 - 0.003 * smooth(y, -0.12, -0.025)) + radius);
      },
      true,
    );
    const m = add(name, joint, shape, mat, true);
    binder.bind(m);
    return m;
  }
  if (leg) {
    tube(key, mats.trousers, 1, rows[0][0], -0.048, 0.00145, 22, 28);
    beneath(key, 'body');
  } else {
    const sh = 'shirtsleeve-' + side;
    tube(sh, mats.white, 0.808, -0.317, 0.01, 0.00125, 18, 16);
    beneath(sh, 'body');
    tube(key, mats.waistcoat, 1, -0.312, 0.042, 0.00145, 28, 20);
    const { x, y, z } = joint.position, sign = side === 'L' ? 1 : -1;
    const crown = shell(11, 20, (t, u, inner) => {
      const a = tau * u, sideEase = Math.sin(Math.PI * t);
      const r = inner ? -0.002 : 0;
      return [
        x + sign * lerp(-0.056, 0.033, t),
        y + 0.020 - 0.046 * t ** 1.55 + 0.012 * gauss(t, 0.61, 0.22) +
          Math.sin(a) * (0.009 + 0.018 * sideEase + r),
        z + Math.cos(a) * (0.016 + 0.026 * sideEase + r),
      ];
    }, true);
    const yoke = add('shoulder-' + side, rig.chest, crown, mats.waistcoat, true);
    bindCloth(yoke, [rig.chest, joint], (i, g) => [0, 1, smooth(g.attributes.uv.getY(i), 0.12, 0.88)]);
    beneath(key, sh);
    beneath(key, 'body');
  }

}

export function anatomyRegions(suit, neck) {
  const result = [];
  function add(mesh, classify) {
    const regions = {},
      g = mesh.geometry,
      idx = g.index,
      p = g.attributes.position;
    const count = (idx ? idx.count : p.count) / 3;
    for (let i = 0; i < count; i++) {
      const a = idx ? idx.getX(i * 3) : i * 3,
        b = idx ? idx.getX(i * 3 + 1) : i * 3 + 1,
        c = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
      const y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
      for (const key of classify(y)) (regions[key] ??= []).push(i);
    }
    result.push({ mesh, regions });
  }
  for (const [name, meshes] of Object.entries(suit.surfaces))
    for (const m of meshes) {
      if (name === 'quilted-vest') add(m, (y) => (y > 0.13 ? ['torso', 'shoulders'] : ['torso']));
      else if (name === 'collar') add(m, () => ['neck']);
      else if (name.startsWith('trousers')) add(m, () => ['legs']);
      else if (name.startsWith('sleeve-'))
        add(m, (y) => (y > -0.018 ? ['shoulders'] : y < -0.178 ? ['distalArms'] : []));
    }
  for (const m of neck.children) if (m.isMesh) add(m, () => ['neck']);
  return result;
}

// Give the shoulder pattern a turned-under armscye and the lower jacket a
// sliding lining. Both are fitted in chest space after the sleeves and legs
// take their final pose, so a lifted knee can carry the hem up with it.
export function fitOpenings(suit) {
  const { rig, surfaces } = suit,
    chest = rig.chest,
    inv = new T.Matrix4(),
    mx = new T.Matrix4();
  const torsoPieces = [],
    legs = [],
    extras = [];
  for (const [id, parts] of Object.entries(surfaces)) {
    for (const m of parts) {
      if (id.startsWith('trousers-')) legs.push(m);
      if (!['shirt', 'hoodie', 'quilted-vest', 'zipper-plackets', 'split-back', 'trouser-rise'].includes(id))
        continue;
      const p = m.geometry.attributes.position,
        rest = p.array.slice();
      const item = { m, rest, id };
      torsoPieces.push(item);
    }
  }
  const authored = new Set(Object.values(surfaces).flat());
  for (const m of chest.children) {
    if (!m.isMesh || authored.has(m)) continue;
    const p = m.geometry.attributes.position;
    m.updateMatrix();
    const e = m.matrix.elements;
    if (Math.abs(e[5] - 1) > 0.00001 || Math.abs(e[13]) > 0.00001) continue;
    if (p.array.some((v, i) => i % 3 === 1 && v < 0.065))
      extras.push({ m, rest: p.array.slice(), id: 'trim' });
  }
  torsoPieces.push(...extras);
  const cache = [];
  for (const leg of legs) {
    const a = leg.geometry.attributes.position;
    cache.push({ leg, a });
  }
  let restHeight;
  return function () {
    chest.updateWorldMatrix(true, false);
    inv.copy(chest.matrixWorld).invert();
    let highest = -Infinity;
    for (const { leg, a } of cache) {
      leg.updateWorldMatrix(true, false);
      mx.multiplyMatrices(inv, leg.matrixWorld);
      const e = mx.elements,
        p = a.array;
      for (let k = 0; k < p.length; k += 3) {
        const y = e[1] * p[k] + e[5] * p[k + 1] + e[9] * p[k + 2] + e[13];
        highest = Math.max(highest, y);
      }
    }
    restHeight ??= highest;
    const rise = Math.min(0.09, Math.max(0, highest - restHeight - 0.017)),
      top = suit.torsoY(0.066), bottom = suit.torsoY(-0.166);
    const compression = rise / (top - bottom);
    for (const { m, rest, id } of torsoPieces) {
      const p = m.geometry.attributes.position;
      if (id === 'split-back') continue;
      for (let k = 1; k < rest.length; k += 3) {
        const y = rest[k];
        p.array[k] = y + Math.max(0, top - y) * compression;
      }
      p.needsUpdate = true;
    }
  };
}
