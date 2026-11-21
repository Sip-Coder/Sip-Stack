// Browser half of check-scale.mjs. Bounds are derived from the render vertices,
// including per-instance transforms, after every ancestor has updated matrixWorld.
import * as T from 'three';
import { worker } from '../docs/life/people.js';
import { buildForCheck } from '../docs/assets/sip-village.js';
import { buildHarbor } from '../docs/assets/sip-craft-harbor.js';
import { cellar } from '../docs/assets/sip-creek-cellar.js';
import { grove } from '../docs/assets/sip-creek-grove.js';
import { seeded, contacts } from '../docs/assets/sip-creek-land.js';
import { materials } from '../docs/assets/sip-creek-materials.js';
import * as creekScene from '../docs/assets/sip-creek.js';

// Minimum counts are an independent inventory of the production scenes. A
// missing registration fails even when other chairs, windows or gulls remain.
const inventory = {
  village: {
    'lane wall': 5,
    belfry: 1,
    olive: 27,
    cypress: 80,
    'terrace rise': 6,
    riser: 60,
    tread: 60,
    'handrail height': 24,
    door: 15,
    storey: 22,
    window: 121,
    'basket press': 1,
    'steel tank': 3,
    'red vat': 1,
    'bottle rack': 1,
    'bottle end': 24,
    'fortified barrel': 6,
    'lamp post': 3,
    'flower clump': 10,
    'café table': 4,
    'café chair': 12,
    'chair seat': 12,
    umbrella: 3,
    'umbrella rim': 3,
    bollard: 5,
    'quay barrel': 3,
    'vine post': 12,
    crate: 2,
    workbench: 2,
    'loggia post': 5,
    bench: 2,
    boat: 7,
    oar: 14,
    buoy: 7,
    'wine case': 9,
    tumbler: 1,
    'wine glass': 1,
    bottle: 1,
    carafe: 1,
    basket: 1,
    'tasting glass': 1,
    swallow: 6,
    butterfly: 8,
  },
  tidelight: {
    'vine trellis': 4,
    storey: 1,
    'awning stanchion': 2,
    'terrace rail': 1,
    'bar table': 1,
    amphora: 3,
    cypress: 3,
    window: 4,
    riser: 26,
    tread: 26,
    'handrail height': 10,
    lighthouse: 1,
    'lamp post': 3,
    boat: 1,
    oar: 2,
    bollard: 6,
    gull: 5,
    fish: 8,
    butterfly: 5,
    'tasting glass': 1,
  },
  creek: {
    'vine trellis': 35,
    'platform plank': 14,
    'cask cradle': 1,
    barrel: 2,
    'wine glass': 2,
    bottle: 1,
    'lamp post': 1,
    lantern: 1,
    boat: 1,
    oar: 2,
    kingfisher: 1,
    songbird: 4,
    fish: 9,
    dragonfly: 9,
    butterfly: 7,
    firefly: 32,
  },
};
// The public design targets are independent of builder metadata. Changing a
// size and its declaration together must still fail for the audited objects.
const nominal = {
  'wine glass': [0.21, 0.085, 0.085],
  tumbler: [0.11, 0.075, 0.075],
  carafe: [0.25, 0.12, 0.12],
  bottle: [0.3, 0.075, 0.075],
  'bottle end': [null, 0.075, null],
  'café table': [0.75, 0.7, 0.7],
  'café chair': [0.875, 0.44, 0.44],
  'chair seat': [0.45, 0.44, 0.44],
  umbrella: [2.5, 2.6, 2.6],
  'umbrella rim': [2.1, null, null],
  'bar table': [1.025, 0.65, 0.65],
  'terrace rail': [0.975, null, null],
  amphora: [0.9, 0.38, 0.38],
  'wine case': [0.3, 0.5, 0.33],
  bench: [0.45, null, 0.42],
  gull: [null, 1.4, 0.6],
  swallow: [null, 0.33, 0.18],
  kingfisher: [null, 0.25, 0.165],
  songbird: [null, 0.24, 0.14],
  fish: [null, null, 0.35],
  butterfly: [null, 0.06, null],
  dragonfly: [null, 0.115, null],
  firefly: [null, null, 0.018],
};
function nominalFor(scene, kind, name) {
  if (scene === 'village' && kind === 'storey') return [2.9, null, null];
  if (scene === 'village' && kind === 'window') return [1.3, 0.8, null];
  if (scene === 'village' && kind === 'door' && /house|front/i.test(name)) return [2.05, 0.875, null];
  if (scene === 'creek' && kind === 'barrel')
    return /lying/i.test(name) ? [0.7, 0.7, 0.95] : [0.95, 0.7, 0.7];
  if (scene === 'creek' && kind === 'oar') return [null, null, 1.9];
  return nominal[kind];
}
const aliases = {
  'cafe table': 'café table',
  'cafe chair': 'café chair',
  'house door': 'door',
  'lane door': 'door',
  'house storey': 'storey',
  'storey height': 'storey',
  'stair tread': 'tread',
  'stair riser': 'riser',
  'boat length': 'boat',
  'oar length': 'oar',
  'water tumbler': 'tumbler',
  'wine bottle': 'bottle',
  trout: 'fish',
  finch: 'songbird',
  'songbird finch': 'songbird',
  'flower clump': 'flower clump',
  'bottle rack end': 'bottle end',
  'barrel lying': 'barrel',
  'barrel standing': 'barrel',
};
const normalize = (k) => k.trim().toLowerCase().replace(/[-_]/g, ' ');
const canonical = (k) => aliases[normalize(k)] || normalize(k);
const vec = () => new T.Vector3(),
  matrix = () => new T.Matrix4();
const names = ['height', 'width', 'depth'];
const round = (n) => Number(n.toFixed(5));
const inst = matrix(),
  world = matrix(),
  local = matrix(),
  quat = new T.Quaternion(),
  pt = vec(),
  scale = vec(),
  origin = vec();

function meshParts(object, instance) {
  const parts = object.userData.scaleParts;
  if (parts) return parts;
  if (object.isInstancedMesh) return [{ mesh: object, index: instance }];
  const all = [];
  object.traverse((o) => {
    if (o.isMesh) all.push({ mesh: o });
  });
  return all;
}
function worldMatrix(mesh, i, out) {
  out.copy(mesh.matrixWorld);
  if (i !== undefined && i !== null) {
    if (!mesh.isInstancedMesh || i < 0 || i >= mesh.count)
      throw Error('Invalid rendered instance ' + i + ' on ' + mesh.name);
    mesh.getMatrixAt(i, inst);
    out.multiply(inst);
  }
  return out;
}
function bounds(object, instance) {
  const parts = meshParts(object, instance);
  const orient = matrix(),
    frame = object.userData.scaleFrame;
  if (frame?.isObject3D) orient.copy(frame.matrixWorld);
  else if (frame?.isMatrix4) orient.copy(frame);
  else if (instance !== undefined) worldMatrix(object, instance, orient);
  else orient.copy(object.matrixWorld);
  orient.decompose(origin, quat, scale);
  // Remove only the reference frame's rotation/translation. Inverting its full
  // matrix would cancel the physical scale of a crate on a carried load.
  const axes = matrix().compose(origin, quat.normalize(), vec().setScalar(1)).invert();
  const box = new T.Box3(),
    physical = new T.Box3();
  let vertices = 0;
  for (const { mesh, index, start = 0, count } of parts) {
    const position = mesh.geometry?.getAttribute('position');
    if (!position) throw Error('Registered object lacks render geometry: ' + object.name);
    if (!mesh.parent) throw Error('Registered object refers to a detached source mesh: ' + object.name);
    if (start < 0 || start + (count ?? 0) > position.count)
      throw Error('Invalid merged vertex range on ' + object.name);
    const indices =
      mesh.isInstancedMesh && index === undefined ? Array.from({ length: mesh.count }, (_, i) => i) : [index];
    for (const i of indices) {
      worldMatrix(mesh, i, world);
      local.multiplyMatrices(axes, world);
      for (let j = start; j < start + (count ?? position.count - start); j++) {
        pt.fromBufferAttribute(position, j).applyMatrix4(local);
        box.expandByPoint(pt);
        pt.fromBufferAttribute(position, j).applyMatrix4(world);
        physical.expandByPoint(pt);
        vertices++;
      }
    }
  }
  if (!vertices || box.isEmpty()) throw Error('Registered item has no drawable vertices: ' + object.name);
  const size = box.getSize(vec());
  return { dimensions: [size.y, size.x, size.z], physical, vertices };
}

function sampleObjects(scene, key, unit, out, failures) {
  const rows = [];
  scene.traverse((o) => {
    const ref = o.userData.scaleRef;
    if (!ref) return;
    if (ref.scene !== key) failures.push(key + '/' + ref.name + ' registered to ' + ref.scene);
    const kind = canonical(ref.kind);
    const wings = [];
    if (['gull', 'kingfisher', 'swallow', 'songbird'].includes(kind)) {
      o.traverse((p) => {
        if (/^wing[+-]?1$|^wrist[+-]?1$|^bird head$/.test(p.name)) {
          wings.push([p, p.quaternion.clone()]);
          p.quaternion.identity();
        }
      });
      o.updateWorldMatrix(true, true);
    }
    o.userData.syncScaleInstances?.(o);
    const instances =
      o.isInstancedMesh && !o.userData.scaleParts
        ? Array.from({ length: o.count }, (_, i) => i)
        : [undefined];
    if (!instances.length) failures.push(key + '/' + ref.name + ' has no rendered instances');
    for (const i of instances) {
      const label = i === undefined ? ref.name : ref.name + ' ' + (i + 1),
        { dimensions, physical, vertices } = bounds(o, i);
      const actual = dimensions.map((n) => n / unit),
        design = ref.metres;
      if (!Array.isArray(design) || design.length !== 3 || design.every((n) => n === null))
        throw Error('Invalid design dimensions on ' + label);
      const errors = actual.map((n, j) => (design[j] === null ? null : n / design[j] - 1));
      for (let j = 0; j < 3; j++)
        if (errors[j] !== null && (!Number.isFinite(errors[j]) || Math.abs(errors[j]) > 0.100001))
          failures.push(
            key + '/' + label + ' ' + names[j] + ': ' + round(actual[j]) + ' m vs ' + design[j] + ' m',
          );
      const target = nominalFor(key, kind, label);
      if (target)
        for (let j = 0; j < 3; j++)
          if (target[j] !== null && Math.abs(actual[j] / target[j] - 1) > 0.100001)
            failures.push(
              key +
                '/' +
                label +
                ' ' +
                names[j] +
                ' ' +
                round(actual[j]) +
                ' m outside ±10% of independent ' +
                target[j] +
                ' m target',
            );
      const row = {
        kind,
        name: label,
        actual: actual.map(round),
        reference: design,
        delta: errors.map((n) => (n === null ? null : round(n))),
        vertices,
      };
      out.dimensions.push(row);
      rows.push({ ...row, physical, object: o });
    }
    for (const [p, q] of wings) p.quaternion.copy(q);
    if (wings.length) o.updateWorldMatrix(true, true);
    o.userData.syncScaleInstances?.();
  });
  out.inventory = {};
  for (const [kind, minimum] of Object.entries(inventory[key])) {
    const found = rows.filter((r) => r.kind === kind).length;
    out.inventory[kind] = { minimum, found };
    if (found < minimum)
      failures.push(key + ' missing ' + kind + ' registrations: ' + found + ' of ' + minimum);
  }
  const subtype = (kind, re) => rows.some((r) => r.kind === kind && re.test(r.name.toLowerCase()));
  if (key === 'village')
    for (const [kind, re] of [
      ['door', /house|front/],
      ['door', /lane|cellar/],
      ['wine case', /quay|boat|static|stack/],
      ['wine case', /porter|carried/],
    ])
      if (!subtype(kind, re)) failures.push(key + ' missing ' + re.source + ' ' + kind);
  if (key === 'creek')
    for (const form of ['lying', 'standing'])
      if (!subtype('barrel', new RegExp(form))) failures.push(key + ' missing ' + form + ' barrel');
  return rows;
}

function stature(geometry, scale) {
  const pos = geometry.attributes.position,
    tissue = geometry.attributes.tissue;
  let sole = Infinity,
    crown = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    sole = Math.min(sole, pos.getY(i));
    if (!tissue || tissue.getX(i) === 0) crown = Math.max(crown, pos.getY(i));
  }
  return (crown - sole) * scale;
}
function checkService(rows, unit, out, failures) {
  const items = rows.filter((r) => ['wine glass', 'tumbler', 'bottle', 'carafe'].includes(r.kind));
  const tables = rows.filter((r) => r.kind === 'café table');
  const stem = items.find((r) => r.kind === 'wine glass');
  if (!stem || !tables.length) return;
  function detail(name, actual, min, max) {
    const pass = Number.isFinite(actual) && actual >= min - 1e-6 && actual <= max + 1e-6;
    out.details.push({ name, value: round(actual), min, max, units: 'm', pass });
    if (!pass) failures.push('village/' + name + ' ' + round(actual) + ' m outside ' + min + '–' + max);
  }
  const pos = stem.object.geometry.getAttribute('position'),
    center = stem.physical.getCenter(vec());
  const rings = new Map();
  for (let i = 0; i < pos.count; i++) {
    pt.fromBufferAttribute(pos, i).applyMatrix4(stem.object.matrixWorld);
    const y = round((pt.y - stem.physical.min.y) / unit),
      r = Math.hypot(pt.x - center.x, pt.z - center.z) / unit;
    rings.set(y, Math.max(rings.get(y) || 0, r));
  }
  const profile = [...rings];
  const narrow = profile.filter(([y, r]) => y > 0.008 && r <= 0.005).map(([y]) => y);
  detail(
    'Wine-glass foot diameter',
    2 * Math.max(...profile.filter(([y]) => y <= 0.01).map(([, r]) => r)),
    0.075 * 0.9,
    0.075 * 1.1,
  );
  detail('Wine-glass narrow stem length', Math.max(...narrow) - Math.min(...narrow), 0.08 * 0.9, 0.08 * 1.1);
  detail(
    'Wine-glass bowl diameter',
    2 * Math.max(...profile.filter(([y]) => y > 0.09).map(([, r]) => r)),
    0.085 * 0.9,
    0.085 * 1.1,
  );
  const tabletop = tables.reduce((a, b) =>
    a.physical.getCenter(vec()).distanceToSquared(center) <
    b.physical.getCenter(vec()).distanceToSquared(center)
      ? a
      : b,
  );
  const tc = tabletop.physical.getCenter(vec());
  for (const item of items) {
    const p = item.physical.getCenter(vec());
    detail(
      item.name + ' contact gap above tabletop',
      Math.abs(item.physical.min.y - tabletop.physical.max.y) / unit,
      0,
      0.005,
    );
    const rim =
      tabletop.actual[1] * 0.5 -
      Math.hypot(p.x - tc.x, p.z - tc.z) / unit -
      Math.max(item.actual[1], item.actual[2]) * 0.5;
    detail(item.name + ' clearance inside table rim', rim, 0, tabletop.actual[1] * 0.5);
  }
}

function checkPeople(scene, key, rows, unit, out, failures) {
  const measure = (name, value, min, max, units = 'm') => {
    const pass = Number.isFinite(value) && value >= min - 1e-6 && value <= max + 1e-6;
    out.ergonomics.push({ name, value: Number.isFinite(value) ? round(value) : null, min, max, units, pass });
    if (!pass) failures.push(key + '/' + name + ' ' + value + ' ' + units + ' outside ' + min + '–' + max);
  };
  const actors = [];
  for (const { a, name } of window.probedActors) {
    if (!scene.getObjectById(a.g.id)) continue;
    const h = stature(a.low.geometry, a.g.getWorldScale(vec()).y / unit);
    actors.push({ a, name, h });
    measure(name + ' adult stature', h, 1.5, 1.95);
  }
  const vat = scene.getObjectByName('Tasting group');
  if (vat)
    for (let i = 0; i < vat.count; i++) {
      const m = worldMatrix(vat, i, matrix());
      const h = stature(vat.geometry, vec().setFromMatrixColumn(m, 1).length() / unit);
      measure('Cantina neighbour ' + (i + 1) + ' adult stature', h, 1.5, 1.95);
      actors.push({ name: 'Cantina neighbour ' + (i + 1), h });
    }
  const expected = { village: 10, tidelight: 2, creek: 1 }[key];
  // Village has seven articulated adults and three additional baked crowd bodies.
  if (actors.length !== expected)
    failures.push(key + ' missing expected adult bodies (' + actors.length + ' of ' + expected + ')');
  const anatomical = actors.filter((p) => p.a),
    tallest = Math.max(...actors.map((v) => v.h));
  const tables = rows.filter((r) => r.kind === 'café table' || r.kind === 'bar table');
  for (const table of tables) {
    const seated = table.kind === 'café table',
      center = table.physical.getCenter(vec());
    const guest = anatomical
      .filter((p) => /Taster|guest/i.test(p.name))
      .sort(
        (a, b) =>
          a.a.g.getWorldPosition(vec()).distanceToSquared(center) -
          b.a.g.getWorldPosition(vec()).distanceToSquared(center),
      )[0];
    if (!guest) continue;
    measure(
      table.name + ' / ' + guest.name + ' stature',
      table.actual[0] / guest.h,
      seated ? 0.4 : 0.55,
      seated ? 0.47 : 0.65,
      'ratio',
    );
    if (!seated) {
      const wrist = guest.a.hands[0].getWorldPosition(vec());
      measure(guest.name + ' free wrist below bar top', (table.physical.max.y - wrist.y) / unit, 0.1, 0.35);
    }
  }
  if (key === 'village') {
    for (const d of rows.filter((r) => r.kind === 'door'))
      measure(d.name + ' overhead clearance', d.actual[0] - tallest, 0.1, Infinity);
    seatFixture(scene, rows, unit, measure);
  }
  if (key === 'creek') {
    const cooper = actors.find((p) => p.name === 'Cooper');
    const cask = rows.find((r) => r.kind === 'barrel' && /lying/.test(r.name.toLowerCase()));
    if (cask && cooper) {
      const { a } = cooper,
        hip = a.hip.getWorldPosition(vec()).y,
        shoulder = a.rig.bones[a.rig.sides[0].arm].getWorldPosition(vec()).y;
      measure(
        'Lying cask crown above cooper hip',
        (cask.physical.max.y - hip) / unit,
        0,
        (shoulder - hip) / unit,
      );
    }
  }
}

// Fit a production skeleton to a café chair. The rower's long reach targets a
// bilge forward of its seat. A chair instead needs the ankles under the knees.
// Solve the two physical link lengths to a deck contact one femur forward of
// the hip, then measure the actual posed knee and both ends of the shoe.
function seatFixture(scene, rows, unit, measure) {
  const nav = scene.userData.peopleNav,
    fixture = worker(scene, 2, unit, 'Taster');
  const { g, rig } = fixture;
  for (const chair of rows.filter((r) => r.kind === 'chair seat')) {
    const center = chair.physical.getCenter(vec()),
      above = chair.physical.max.y,
      ground = nav.floor(center.x, center.z);
    fixture.skeleton.pose();
    g.position.set(center.x, above - (rig.bind[rig.hip].y - 0.07) * g.scale.y, center.z);
    g.quaternion.copy(
      (chair.object.userData.scaleFrame || chair.object).getWorldQuaternion(new T.Quaternion()),
    );
    g.updateWorldMatrix(true, true);
    let maxGap = 0,
      kneeHeight = 0;
    for (let i = 0; i < 2; i++) {
      const side = rig.sides[i],
        thigh = rig.bones[side.thigh],
        shin = rig.bones[side.shin],
        ankle = rig.bones[side.ankle];
      const foot = fixture.feet[i],
        a = shin.position.length(),
        b = ankle.position.length();
      const hip = g.worldToLocal(thigh.getWorldPosition(vec()));
      const target = hip.clone();
      target.z += a;
      const worldTarget = g.localToWorld(target.clone());
      worldTarget.y = nav.floor(worldTarget.x, worldTarget.z) - foot.heel.y * g.scale.y;
      target.copy(g.worldToLocal(worldTarget)).sub(hip);
      const reach = target.length(),
        axis = target.clone().normalize();
      const along = (a * a - b * b + reach * reach) / (2 * reach);
      const ortho = vec().set(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
      const upper = axis
        .clone()
        .multiplyScalar(along)
        .addScaledVector(ortho, Math.sqrt(Math.max(0, a * a - along * along)));
      thigh.quaternion.setFromUnitVectors(shin.position.clone().normalize(), upper.clone().normalize());
      const lower = target.clone().sub(upper).applyQuaternion(thigh.quaternion.clone().invert()).normalize();
      shin.quaternion.setFromUnitVectors(ankle.position.clone().normalize(), lower);
      ankle.quaternion.copy(thigh.quaternion).multiply(shin.quaternion).invert();
      g.updateWorldMatrix(true, true);
      for (const point of [foot.heel, foot.toe]) {
        const p = ankle.localToWorld(point.clone());
        maxGap = Math.max(maxGap, Math.abs(p.y - nav.floor(p.x, p.z)) / unit);
      }
      kneeHeight += ((shin.getWorldPosition(vec()).y - ground) * 0.5) / unit;
    }
    measure(chair.name + ' / fitted knee height', (above - ground) / unit / kneeHeight, 0.85, 1.15, 'ratio');
    measure(chair.name + ' fitted sole clearance', maxGap, 0, 0.02);
  }
  g.removeFromParent();
}

function treadDimensions(node, p, unit) {
  const item = p.treadGeometry;
  if (!item) return null;
  const a = item.mesh.geometry.attributes.position;
  worldMatrix(item.mesh, item.index, world).premultiply(matrix().copy(node.matrixWorld).invert());
  let front = -Infinity,
    back = Infinity,
    top = -Infinity,
    base = Infinity;
  for (let i = 0; i < a.count; i++) {
    pt.fromBufferAttribute(a, i).applyMatrix4(world);
    const along = p.dx * pt.x + p.dz * pt.z;
    front = Math.max(front, along);
    back = Math.min(back, along);
    top = Math.max(top, pt.y);
    base = Math.min(base, pt.y);
  }
  return { run: (front - back) / unit, rise: (top - base) / unit, top, centre: (front + back) * 0.5 };
}
// Raycast the actual rendered cylinder for this flight only. A vertical
// centreline estimate does not detect a detached or rotated handrail mesh.
function railHeight(frame, tread, unit) {
  const flight = tread.flight,
    item = flight.railGeometry;
  if (!item?.mesh?.parent) return null;
  const mesh = new T.Mesh(item.mesh.geometry, item.mesh.material);
  worldMatrix(item.mesh, item.index, mesh.matrixWorld);
  const origin = vec()
    .set(
      tread.noseX + tread.dz * flight.railOffset,
      tread.y + 3 * unit,
      tread.noseZ - tread.dx * flight.railOffset,
    )
    .applyMatrix4(frame.matrixWorld);
  const down = vec().set(0, -1, 0).transformDirection(frame.matrixWorld);
  const ray = new T.Raycaster(origin, down),
    hit = ray.intersectObject(mesh, false)[0];
  return hit ? (frame.worldToLocal(hit.point).y - tread.y) / unit : null;
}
function checkSteps(scene, key, unit, out, failures) {
  scene.traverse((node) => {
    const nav = node.userData.peopleNav;
    if (!nav) return;
    const patches = nav.surfaces.filter((s) => s.tread);
    if (!patches.length && key !== 'creek') failures.push(key + ' lacks registered walkable treads');
    for (const p of patches) {
      const actual = treadDimensions(node, p, unit);
      if (!actual) {
        failures.push(key + '/tread ' + p.index + ' missing its render geometry');
        continue;
      }
      if (
        Math.abs(actual.top - p.y) > 0.001 * unit ||
        Math.abs(actual.centre - (p.cx * p.dx + p.cz * p.dz)) > 0.001 * unit ||
        Math.abs(actual.run - p.pitch / unit) > 0.001 ||
        Math.abs(actual.rise - p.rise / unit) > 0.001
      )
        failures.push(key + '/tread ' + p.index + ' render geometry disagrees with walkable top or nosing');
      const r = actual.rise,
        t = actual.run,
        k = 2 * r + t;
      const rail = railHeight(node, p, unit);
      if (rail === null || rail < 0.86 || rail > 0.97)
        failures.push(key + '/' + p.id + ' no rail at 0.86–0.97 m above nosing; measured ' + rail);
      const dimensionsPass = r > 0 && r <= 0.19 && t >= 0.25 && k >= 0.6 - 1e-6 && k <= 0.66 + 1e-6;
      const pass = dimensionsPass && rail >= 0.86 && rail <= 0.97;
      out.treads.push({
        flight: p.flight?.name || p.flight?.id || 'stairs',
        index: p.index,
        rise: round(r),
        run: round(t),
        twiceRisePlusRun: round(k),
        railHeight: rail === null ? null : round(rail),
        pass,
      });
      if (!dimensionsPass)
        failures.push(key + '/tread ' + p.index + ' riser ' + r + ' run ' + t + ' 2R+T ' + k);
    }
  });
}

export default async function run({ ref } = {}) {
  const { SCENE_M } = await import('../docs/life/scale.js');
  const report = { failures: [], scenes: {} };
  for (const key of ['village', 'tidelight', 'creek']) {
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera();
    camera.position.set(2, 2, 3);
    window.probedActors = [];
    const out = { dimensions: [], ergonomics: [], details: [], treads: [] };
    report.scenes[key] = out;
    try {
      if (key === 'village') {
        const world = buildForCheck(scene);
        world.life(0, camera, 'High');
      } else if (key === 'tidelight') {
        const update = buildHarbor(
          scene,
          { seaTime: { value: 0 }, storm: { value: 0.1 } },
          new T.DataTexture(),
        );
        update(0, 0.1, camera, 2);
      } else {
        const rng = seeded(381799),
          time = { value: 0 },
          contact = contacts(),
          { wood } = materials(time, { value: 1 }, contact);
        grove(scene, rng, time, wood, () => {}, contact);
        const station = cellar(scene, wood, rng);
        station.update(0, camera, false);
        if (!creekScene.buildCreekSkiff || !creekScene.buildCreekWildlife)
          report.failures.push('Creek missing production wildlife/skiff construction');
        else {
          creekScene.buildCreekSkiff(scene, station.nav);
          const animals = creekScene.buildCreekWildlife(scene);
          if (typeof animals === 'function') animals(0, false, camera, true);
        }
      }
      scene.updateMatrixWorld(true);
      const rows = sampleObjects(scene, key, SCENE_M[key], out, report.failures);
      if (key === 'village') checkService(rows, SCENE_M[key], out, report.failures);
      checkPeople(scene, key, rows, SCENE_M[key], out, report.failures);
      checkSteps(scene, key, SCENE_M[key], out, report.failures);
    } catch (error) {
      report.failures.push(key + ' scene measurement failed: ' + error.message);
    }
  }
  return report;
}
