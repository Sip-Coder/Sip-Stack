// Procedural flights share one frame for their rendered treads, navigation
// surfaces, measured dimensions and handrail. Local +Z is uphill.
import * as T from 'three';
import { SCENE_M, scaleSpec } from './scale.js';

const boxGeometry = new T.BoxGeometry(1, 1, 1);
const barGeometry = new T.CylinderGeometry(1, 1, 1, 10);
const up = new T.Vector3(0, 1, 0);

// Capture transforms in the builder's local frame. All six Village flights
// share five draws (treads, bars/posts, landings and two stone core shapes).
function instances(parent) {
  const bins = new Map();
  const cores = new Map();
  function add(frame, geometry, material, part, color) {
    let materials = bins.get(geometry);
    if (!materials) {
      materials = new Map();
      bins.set(geometry, materials);
    }
    let items = materials.get(material);
    if (!items) {
      items = [];
      materials.set(material, items);
    }
    part.updateMatrix();
    const matrix = part.matrix.clone();
    if (frame !== parent) {
      frame.updateMatrix();
      matrix.premultiply(frame.matrix);
    }
    const ref = { mesh: null, index: items.length };
    items.push({ matrix, color, ref });
    return ref;
  }
  function finish() {
    for (const [geometry, materials] of bins)
      for (const [material, items] of materials) {
        const mesh = new T.InstancedMesh(geometry, material, items.length);
        mesh.castShadow = mesh.receiveShadow = true;
        for (const { ref, color, matrix } of items) {
          ref.mesh = mesh;
          mesh.setMatrixAt(ref.index, matrix);
          if (color) mesh.setColorAt(ref.index, color);
        }
        parent.add(mesh);
      }
  }
  return { add, finish, cores };
}

function measure(frame, part, scene, kind, metres, name) {
  const ref = new T.Object3D();
  frame.add(ref);
  ref.userData.scaleParts = [part];
  ref.userData.scaleFrame = frame;
  scaleSpec(ref, scene, kind, metres, name);
}

function landing(geometry, parent, nav, name, x0, x1, z0, z1, bottom, top, material) {
  const mesh = new T.Object3D();
  mesh.position.set((x0 + x1) / 2, (bottom + top) / 2, (z0 + z1) / 2);
  mesh.scale.set(x1 - x0, top - bottom, z1 - z0);
  geometry.add(parent, boxGeometry, material, mesh);
  nav.surface(name, x0, x1, z0, z1, top);
}

function flight(geometry, parent, nav, materials, spec) {
  const { scene, name, x, z, y, yTop, dx, dz, count, pitchM, widthM, side, base = y } = spec;
  const unit = SCENE_M[scene],
    width = widthM * unit,
    pitch = pitchM * unit,
    rise = (yTop - y) / count;
  const run = count * pitch,
    angle = Math.atan2(dx, dz),
    railRadius = 0.022 * unit,
    railOffset = side * (width / 2 - railRadius * 1.5);
  const frame = new T.Group();
  frame.name = name;
  frame.position.set(x, y, z);
  frame.rotation.y = angle;
  parent.add(frame);
  const matrix = new T.Object3D();
  const slopeFactor = Math.hypot(1, rise / pitch);
  // Height refers to the TOP of the cylindrical rail directly above each
  // nosing. Its vertical section is wider than its normal radius on a slope.
  const railStart = new T.Vector3(
    x + dz * railOffset,
    y + rise + unit * 0.9 - railRadius * slopeFactor,
    z - dx * railOffset,
  );
  const railEnd = railStart.clone().add(new T.Vector3(dx * run, count * rise, dz * run));
  const data = {
    name,
    x,
    z,
    y,
    dx,
    dz,
    rise,
    pitch,
    width,
    side,
    railOffset,
    railRadius,
    railStart,
    railEnd,
    treads: [],
  };
  nav.flights.push(data);
  // A separate solid core supports the nosings. Its top follows the underside
  // of the lowest corner of each tread, so their visible tops never intersect.
  const coreKey = [count, width, pitch, rise, base - y].map((v) => v.toFixed(6)).join('/');
  let prism = geometry.cores.get(coreKey);
  if (!prism) {
    const core = new T.Shape();
    core.moveTo(0, base - y - 0.012);
    core.lineTo(run, base - y - 0.012);
    for (let i = count - 1; i >= 0; i--) {
      core.lineTo((i + 1) * pitch, i * rise);
      core.lineTo(i * pitch, i * rise);
    }
    core.closePath();
    prism = new T.ExtrudeGeometry(core, { depth: width, bevelEnabled: false });
    prism.rotateY(-Math.PI / 2);
    prism.translate(width / 2, 0, 0);
    geometry.cores.set(coreKey, prism);
  }
  geometry.add(frame, prism, materials.stone, matrix);
  for (let i = 0; i < count; i++) {
    const travel = (i + 0.5) * pitch,
      cy = y + (i + 1) * rise;
    const cx = x + dx * travel,
      cz = z + dz * travel;
    matrix.position.set(0, (i + 0.5) * rise, travel);
    matrix.scale.set(width, rise, pitch);
    matrix.updateMatrix();
    const part = geometry.add(
      frame,
      boxGeometry,
      materials.step,
      matrix,
      new T.Color().setScalar(0.92 + (0.08 * ((i * 7) % 11)) / 10),
    );
    const tread = nav.stairTread(data, i + 1, cx, cz, cy);
    tread.riserGeometry = tread.treadGeometry = part;
    measure(frame, part, scene, 'riser', [rise / unit, null, null], name + ' riser ' + (i + 1));
    measure(frame, part, scene, 'tread', [null, widthM, pitchM], name + ' tread ' + (i + 1));
    if (i % 3 === 0 || i === count - 1) {
      const postInset = 0.018 * unit,
        h = unit * 0.9 + (rise / pitch) * postInset;
      matrix.position.set(railOffset, cy - y + h / 2, i * pitch + postInset);
      matrix.scale.set(0.0175 * unit, h, 0.0175 * unit);
      const part = geometry.add(frame, barGeometry, materials.rail, matrix);
      measure(frame, part, scene, 'handrail height', [0.9, null, null], name + ' rail post ' + (i + 1));
      nav.circle(
        name + ' rail post',
        tread.noseX + dx * postInset + dz * railOffset,
        tread.noseZ + dz * postInset - dx * railOffset,
        0.0175 * unit,
        cy,
        cy + h,
      );
    }
  }
  const rail = new T.Object3D();
  const slope = new T.Vector3(0, count * rise, run);
  rail.position.set(railOffset, railStart.y - y + slope.y / 2, run / 2);
  rail.scale.set(railRadius, slope.length() + 2 * railRadius, railRadius);
  rail.quaternion.setFromUnitVectors(up, slope.normalize());
  data.railGeometry = geometry.add(frame, barGeometry, materials.rail, rail);
  for (let i = 0; i < count; i++) {
    const a = railStart.clone().lerp(railEnd, i / count),
      b = railStart.clone().lerp(railEnd, (i + 1) / count);
    const obstacle = nav.box(
      name + ' handrail',
      (a.x + b.x) / 2,
      (a.z + b.z) / 2,
      railRadius,
      pitch / 2 + railRadius,
      a.y - railRadius,
      b.y + railRadius,
      angle,
    );
    obstacle.rail = { a, b, radius: railRadius };
  }
  return data;
}

export function villageStairs(scene, nav) {
  const geometry = instances(scene);
  const materials = {
    step: new T.MeshStandardMaterial({ color: '#ccbea7', roughness: 0.9 }),
    stone: new T.MeshStandardMaterial({ color: '#ac9d86', roughness: 0.95 }),
    rail: new T.MeshStandardMaterial({ color: '#514c40', roughness: 0.62, metalness: 0.28 }),
  };
  for (let tier = 0; tier < 3; tier++) {
    const edge = -1.5 - 3 * tier,
      base = 1.05 + 2 * tier,
      startZ = edge + 0.48;
    const layout = { scene: 'village', count: 10, pitchM: 0.28, widthM: 0.89, side: -1, dx: 0, base };
    const lower = flight(geometry, scene, nav, materials, {
      ...layout,
      name: 'Flight ' + (tier * 2 + 1),
      x: 1.045,
      z: startZ,
      y: base,
      yTop: base + 1,
      dz: 1,
    });
    const endZ = startZ + lower.pitch * 10,
      half = lower.width / 2;
    landing(
      geometry,
      scene,
      nav,
      'Half landing',
      lower.x - half,
      1.63 + half,
      endZ,
      endZ + 0.49,
      base,
      base + 1,
      materials.stone,
    );
    const upper = flight(geometry, scene, nav, materials, {
      ...layout,
      name: 'Flight ' + (tier * 2 + 2),
      x: 1.63,
      z: endZ,
      y: base + 1,
      yTop: base + 2,
      dz: -1,
    });
    landing(
      geometry,
      scene,
      nav,
      'Terrace bridge',
      upper.x - half,
      upper.x + half,
      edge,
      startZ,
      base,
      base + 2,
      materials.stone,
    );
  }
  geometry.finish();
}

export function coastStairs(scene, nav, materials) {
  const parent = new T.Group();
  parent.name = 'Tidelight stairs';
  scene.add(parent);
  const geometry = instances(parent);
  const top = -1.2,
    unit = SCENE_M.tidelight,
    z = 1.61;
  const rise = 2.88 - 0.731,
    count = Math.round(rise / (0.167 * unit)),
    bottom = top + count * 0.28 * unit;
  // Run along the terrace wall. The lower landing turns onto the pier without
  // covering any pier planks or intersecting the existing mooring posts.
  flight(geometry, parent, nav, materials, {
    scene: 'tidelight',
    name: 'Tasting terrace flight',
    x: bottom,
    z,
    y: 0.731,
    yTop: 2.88,
    dx: -1,
    dz: 0,
    count,
    pitchM: 0.28,
    widthM: 1.16,
    side: 1,
    base: -0.07,
  });
  landing(
    geometry,
    parent,
    nav,
    'Pier stair landing',
    bottom,
    bottom + 0.54,
    z - 0.29,
    2.045,
    -0.07,
    0.731,
    materials.stone,
  );
  geometry.finish();
}
