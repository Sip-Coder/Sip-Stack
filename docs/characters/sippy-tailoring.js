// Each pattern follows the same reference body. Inner cloth faces and joined
// edge strips give the cutaway fronts, hems, and cuffs a real thickness.
import * as T from 'three';
import { exteriorPoint, exteriorSkinWeights, hipExteriorPoint, explorerLimb, torsoStation, limbStation } from './human-exterior.js';
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

const shirtEase = 0.0025, hoodieEase = 0.0051, vestEase = 0.008;
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
  return y - 0.030 * (1 - smooth(y, -0.077, 0.02));
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
  const chestSpace = p => p.map((value, i) => value - chestOrigin.getComponent(i));
  const torsoPoint = (y, a, ease) =>
    chestSpace(hipExteriorPoint(rig, torsoStation(rig, y, oldHip, oldShoulder), a, ease));
  const pointOnVest = (y, a, trim = 0) => torsoPoint(y, a, vestEase + trim);
  const collarSeat = torsoY(0.233);
  const neckPoint = (a, y, ease) =>
    chestSpace(exteriorPoint(rig, 'torso', chestOrigin.y + collarSeat + y, a, ease));
  const surfaces = {},
    pairs = [],
    updates = [];
  const add = (name, parent, geom, material, skinned = false) => {
    const m = piece(parent, name, geom, material, skinned);
    (surfaces[name] ??= []).push(m);
    return m;
  };
  const torsoBones = ['chest', 'hips', 'head'];
  const wrap = (name, parent, geometry, material) => {
    const garment = add(name, parent, geometry, material, true);
    bindCloth(garment, torsoBones.map(key => rig[key]), (i, g) => {
      const y = chestOrigin.y + g.attributes.position.getY(i);
      const [upper, lower, onUpper] = exteriorSkinWeights(rig, 'torso', y);
      return [torsoBones.indexOf(lower), torsoBones.indexOf(upper), onUpper];
    });
    return garment;
  };
  const beneath = (outer, inner) => pairs.push({ outer, inner });
  wrap(
    'shirt',
    chest,
    shell(
      15,
      24,
      (v, u, inner) => torsoPoint(lerp(-0.076, 0.171, v), u * tau, shirtEase - (inner ? 0.00125 : 0)),
      true,
    ),
    white,
  );
  beneath('shirt', 'body');
  // The trouser rise closes the fork between both legs. It sits under the
  // hoodie, with a small lip above the waistband for the tucked shirt.
  wrap(
    'trouser-rise',
    chest,
    shell(
      14,
      28,
      (v, u, inner) => torsoPoint(lerp(-0.165, -0.053, v), u * tau, 0.0064 - (inner ? 0.00135 : 0)),
      true,
    ),
    trousers,
  );
  beneath('trouser-rise', 'body');
  wrap(
    'hoodie',
    chest,
    shell(
      18,
      28,
      (v, u, inner) => {
        const a = u * tau;
        const hemTurn = 0.0026 * (1 - smooth(v, 0, 0.15));
        return torsoPoint(waistY(v, a), a, hoodieEase + hemTurn - (inner ? 0.00135 : 0));
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
    return pointOnVest(y, a, inside ? -0.0016 : 0);
  }
  wrap('quilted-vest', chest, shell(24, 36, jacketPoint), suit);
  beneath('quilted-vest', 'hoodie');
  beneath('quilted-vest', 'shirt');
  for (const side of [-1, 1]) {
    // Padded zipper tapes follow the front opening from the neckline to the hem.
    const slope = (v, u, inside) => {
      const open = 0.205 + 0.185 * smooth(v, 0.41, 0.9) + 0.076 * gauss(v, 0.985, 0.12);
      const a = side * (open + 0.015 + 0.056 * u);
      return pointOnVest(jacketY(v, a), a, inside ? 0.0012 : 0.003);
    };
    wrap('zipper-plackets', chest, shell(20, 4, slope), lapel);
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
    return torsoPoint(lerp(top - 0.013, top + 0.015, v), a,
      hoodieEase + (inner ? 0.0015 : 0.0032) + 0.0015 * Math.sin(Math.PI * v));
  };
  wrap('collar', chest, shell(6, 32, collarPoint), waistcoat);
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
      const p = pointOnVest(Math.max(-0.125, y), a, inner ? 0.003 : 0.0046);
      p[1] = torsoY(y) - pivot.position.y;
      p[2] -= 0.014 * (1 - v) * (1 - v);
      return p;
    };
    add('split-back', pivot, shell(18, 18, tail), suit);
  }
  beneath('split-back', 'quilted-vest');
  rig.garments = { surfaces, pairs, seams: [] };
  return { add, beneath, surfaces, tails, updates, rig, limbs: {}, pointOnVest, torsoY, neckPoint };
}

// A single articulated pattern runs across each elbow and knee. Slices
// rotate progressively into the lower joint while their centres follow a
// circular fillet around the bend. Shirtsleeves and skin use the same centres.
export function fitLimb(suit, side, leg, mats) {
  const { rig, add, beneath, updates } = suit;
  const joint = rig[(leg ? 'thigh' : 'upperArm') + side],
    lower = rig[(leg ? 'shin' : 'forearm') + side];
  const oldUpper = leg ? 0.245 : 0.176, oldLower = leg ? 0.228 : 0.143;
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
  const ease = leg
    ? (y, a) => 0.006 + 0.0014 * gauss(y, -0.25, 0.07) * Math.max(0, Math.cos(a))
    : (y, a) => 0.0043 + 0.0011 * gauss(y, -0.18, 0.052) * (0.5 + 0.5 * Math.cos(a));
  function tube(name, mat, allowance, y0, y1, thick, n, nr) {
    const shape = shell(
      n,
      nr,
      (v, u, inner) => {
        const y = lerp(y0, y1, v), a = tau * u;
        return place([Math.sin(a), y, Math.cos(a)], allowance(y, a) - (inner ? thick : 0));
      },
      true,
    );
    const m = add(name, joint, shape, mat, true);
    binder.bind(m);
    return m;
  }
  if (leg) {
    tube(key, mats.trousers, ease, -0.435, -0.048, 0.00145, 25, 28);
    beneath(key, 'body');
  } else {
    const sh = 'shirtsleeve-' + side;
    // Keep the three wrist bands as a cuff facing tucked under the sleeve.
    tube(sh, mats.white, () => 0.0019, -0.317, -0.2625, 0.00125, 3, 20);
    beneath(sh, 'body');
    tube(key, mats.waistcoat, ease, -0.312, 0.030, 0.00145, 29, 24);
    const [, skinTopX, skinTopZ] = rig.exterior['arm' + side].at(-1);
    const crown = shell(7, 24, (t, u, inner) => {
      const a = u * tau, y = lerp(0.028, 0.039, t);
      const p = place([Math.sin(a), y, Math.cos(a)], ease(y, a) - (inner ? 0.00145 : 0));
      // Follow the wrapped deltoid to its top, then close the fabric head.
      // This hides the end rim while keeping the contour at the sleeve seam.
      const closed = smooth(y, 0.031, 0.039) * 0.995;
      p[0] = lerp(p[0], skinTopX - origin.x, closed);
      p[2] = lerp(p[2], skinTopZ - origin.z, closed);
      return p;
    }, true);
    const yoke = add('shoulder-' + side, joint, crown, mats.waistcoat, true);
    binder.bind(yoke);
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
