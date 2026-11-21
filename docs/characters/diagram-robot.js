// Sectioned service assemblies for Hummin's closed castings. The longitudinal
// limb spars, visible joints and seals come from the simulator's own meshes.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fitCasting, fieldCasting } from './hummin-shell-fit.js';

const titanium = 0x84949a,
  graphite = 0x36444b,
  milled = 0xb3bbc0;
const copper = 0xb56e49,
  brass = 0xc2a169,
  winding = 0x944c35;

export function addRobotInterior(rig, tier, parts) {
  rig.root.updateWorldMatrix(true, true);
  const high = tier === 'high';
  const steps = high ? 16 : 10;
  const up = new T.Vector3(0, 1, 0);
  const material = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.38 });
  const ink = new T.Color();
  let pieces = [];

  function coat(geometry, tint) {
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(3 * count);
    ink.set(tint);
    for (let i = 0; i < count; i++) ink.toArray(colors, 3 * i);
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    pieces.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
  }
  function box(x, y, z, w, h, d, tint) {
    coat(new T.BoxGeometry(w, h, d).translate(x, y, z), tint);
  }
  function pin(a, b, rad, tint, endRadius = rad, sides = steps) {
    const start = new T.Vector3(...a);
    const axis = new T.Vector3(...b).sub(start);
    const g = new T.CylinderGeometry(endRadius, rad, axis.length(), sides);
    const center = start.addScaledVector(axis, 0.5);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up, axis.normalize()));
    coat(g.translate(center.x, center.y, center.z), tint);
  }
  function rail(points, r, tint) {
    for (let i = 1; i < points.length; i++) pin(points[i - 1], points[i], r, tint, r, 8);
  }
  function cutPlate(outline, windows, z, depth, tint) {
    const shape = new T.Shape(outline.map(([x, y]) => new T.Vector2(x, y)));
    for (const [x, y, rx, ry] of windows) {
      const hole = new T.Path();
      hole.absellipse(x, y, rx, ry, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const g = new T.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.0008,
      bevelSize: 0.001,
      bevelSegments: 1,
      curveSegments: high ? 8 : 4,
    });
    coat(g.translate(0, 0, z), tint);
  }
  function finish(name, layer, joint, cast = false) {
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    pieces = [];
    if (cast) {
      // Use the same lateral offsets and changing cross-sections as the shell,
      // including the shortened arms and the rocker under the foot.
      fitCasting(geometry, joint);
      fieldCasting(geometry, joint);
      if (joint === rig.upperArmL || joint === rig.upperArmR) geometry.scale(1, 0.84, 1);
      if (joint === rig.forearmL || joint === rig.forearmR) geometry.scale(1, 0.82, 1);
    }
    geometry.applyMatrix4(joint.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    parts.push({ name, layer, mesh, source: 'authored' });
  }

  // A slotted backplate carries the shoulder loads into two lumbar rails.
  cutPlate(
    [
      [-0.026, -0.056],
      [-0.05, -0.029],
      [-0.064, 0.07],
      [-0.059, 0.108],
      [-0.034, 0.124],
      [0.034, 0.124],
      [0.059, 0.108],
      [0.064, 0.07],
      [0.05, -0.029],
      [0.026, -0.056],
    ],
    [
      [-0.029, 0.05, 0.014, 0.04],
      [0.029, 0.05, 0.014, 0.04],
      [0, -0.019, 0.017, 0.01],
    ],
    -0.032,
    0.008,
    graphite,
  );
  for (const sign of [-1, 1]) {
    rail(
      [
        [sign * 0.024, -0.049, -0.024],
        [sign * 0.046, 0.01, -0.014],
        [sign * 0.06, 0.094, 0.003],
        [sign * 0.05, 0.119, -0.021],
      ],
      0.0046,
      milled,
    );
    for (const y of [-0.025, 0.098])
      pin([sign * 0.039, y, -0.035], [sign * 0.039, y, -0.026], 0.0035, brass, 0.0035, 6);
  }
  finish('Thoracic load frame', 'skeleton', rig.chest);
  pin([-0.073, 0.136, -0.003], [0.073, 0.136, -0.003], 0.009, titanium);
  for (const sign of [-1, 1])
    rail(
      [
        [sign * 0.046, 0.1, -0.024],
        [sign * 0.059, 0.122, 0.001],
        [sign * 0.072, 0.139, -0.003],
      ],
      0.005,
      graphite,
    );
  finish('Shoulder crossmember', 'skeleton', rig.chest);

  for (const sign of [-1, 1]) {
    rail(
      [
        [sign * 0.016, 0.056, -0.007],
        [sign * 0.019, 0.092, -0.013],
        [sign * 0.024, 0.126, -0.02],
      ],
      0.006,
      milled,
    );
    box(sign * 0.03, 0.068, -0.008, 0.009, 0.013, 0.014, graphite);
  }
  pin([-0.032, 0.068, -0.008], [0.032, 0.068, -0.008], 0.006, graphite);
  finish('Lumbar carriage', 'skeleton', rig.hips);
  cutPlate(
    [
      [-0.065, 0.019],
      [-0.057, -0.008],
      [-0.026, -0.022],
      [0.026, -0.022],
      [0.057, -0.008],
      [0.065, 0.019],
      [0.042, 0.042],
      [-0.042, 0.042],
    ],
    [
      [-0.032, 0.01, 0.011, 0.009],
      [0.032, 0.01, 0.011, 0.009],
    ],
    -0.023,
    0.009,
    titanium,
  );
  for (const s of [-1, 1])
    rail(
      [
        [s * 0.056, 0.017, -0.018],
        [s * 0.059, 0.023, 0.015],
        [s * 0.021, 0.035, 0.025],
      ],
      0.005,
      graphite,
    );
  pin([-0.024, 0.034, 0.025], [0.024, 0.034, 0.025], 0.005, milled);
  finish('Pelvic trunnion cradle', 'skeleton', rig.hips);

  // The removable dome is fastened to an open cage around the display cavity.
  const housing = rig.head.getObjectByName('Helmet housing');
  for (const s of [-1, 1]) {
    rail(
      [
        [s * 0.033, -0.004, 0.019],
        [s * 0.079, 0.027, -0.007],
        [s * 0.08, 0.077, -0.049],
        [s * 0.049, 0.112, -0.052],
        [s * 0.032, 0.127, -0.021],
      ],
      0.0044,
      titanium,
    );
    rail(
      [
        [s * 0.067, 0.023, 0.045],
        [s * 0.089, 0.056, 0.026],
        [s * 0.08, 0.077, -0.049],
      ],
      0.0037,
      milled,
    );
    box(s * 0.06, 0.031, 0.049, 0.015, 0.012, 0.009, graphite);
  }
  for (const [y, z, half] of [
    [0.125, -0.022, 0.032],
    [0.029, 0.047, 0.064],
    [-0.002, 0.02, 0.035],
  ])
    pin([-half, y, z], [half, y, z], 0.0045, graphite);
  finish('Cranial display carrier', 'skeleton', housing);

  // Motor laminations, copper winding sectors, shaft and two machined flanges.
  function motor(center, axis, radius, length) {
    const c = new T.Vector3(...center),
      a = new T.Vector3(...axis).normalize();
    const e = new T.Vector3(0, 0, 1).cross(a).normalize(),
      f = a.clone().cross(e);
    const point = (along, x = 0, y = 0) =>
      c.clone().addScaledVector(a, along).addScaledVector(e, x).addScaledVector(f, y).toArray();
    pin(point(-length * 0.56), point(length * 0.56), radius * 0.46, milled);
    pin(point(-length * 0.38), point(length * 0.38), radius * 0.82, graphite);
    const sectors = high ? 10 : 8;
    for (let k = 0; k < sectors; k++) {
      const angle = (k * 2 * Math.PI) / sectors;
      const x = Math.cos(angle) * radius * 0.755,
        y = Math.sin(angle) * radius * 0.755;
      pin(
        point(-length * 0.38, x, y),
        point(length * 0.38, x, y),
        radius * 0.2,
        k % 2 ? winding : copper,
        radius * 0.2,
        6,
      );
    }
    for (const side of [-1, 1]) {
      pin(point(side * length * 0.38), point(side * length * 0.49), radius, titanium);
      pin(point(side * length * 0.49), point(side * length * 0.54), radius * 0.72, graphite);
      for (let j = 0; j < 3; j++) {
        const angle = (j * 2 * Math.PI) / 3 + 0.24;
        const x = Math.cos(angle) * radius * 0.78,
          y = Math.sin(angle) * radius * 0.78;
        pin(
          point(side * length * 0.49, x, y),
          point(side * length * 0.52, x, y),
          radius * 0.096,
          brass,
          radius * 0.096,
          6,
        );
      }
    }
  }
  function linear(start, end, radius) {
    const base = new T.Vector3(...start),
      span = new T.Vector3(...end).sub(base);
    const p = (t) => base.clone().addScaledVector(span, t).toArray();
    pin(p(0), p(1), radius * 0.43, milled);
    pin(p(0.045), p(0.62), radius, copper);
    for (const t of [0.06, 0.13, 0.54, 0.59]) pin(p(t), p(t + 0.025), radius * 1.1, graphite);
    pin(p(0.62), p(0.68), radius * 0.76, brass);
    for (const t of [0, 1]) {
      const [x, y, z] = p(t);
      pin([x - radius * 0.72, y, z], [x + radius * 0.72, y, z], radius * 0.62, titanium);
    }
  }
  motor([0, 0.168, 0], [0, 1, 0], 0.03, 0.032);
  finish('Neck azimuth drive', 'muscles', rig.chest);
  motor([0, 0.044, 0.002], [0, 1, 0], 0.041, 0.031);
  finish('Waist slew motor', 'muscles', rig.hips);

  for (const [suffix, s, side] of [
    ['L', 1, 'Left'],
    ['R', -1, 'Right'],
  ]) {
    const upper = rig['upperArm' + suffix],
      fore = rig['forearm' + suffix],
      hand = rig['hand' + suffix];
    const thigh = rig['thigh' + suffix],
      shin = rig['shin' + suffix],
      foot = rig['foot' + suffix];
    linear([s * 0.032, -0.049, 0.013], [s * 0.063, 0.095, 0.017], 0.0115);
    finish(side + ' trunk pitch actuator', 'muscles', rig.chest);
    motor([s * 0.005, -0.027, 0], [1, 0, 0], 0.024, 0.038);
    finish(side + ' shoulder torque motor', 'muscles', upper, true);
    linear([s * 0.007, -0.049, 0.022], [s * 0.004, -0.144, 0.015], 0.008);
    finish(side + ' elbow flexion drive', 'muscles', upper, true);
    linear([s * 0.007, -0.037, 0.019], [s * 0.005, -0.115, 0.012], 0.006);
    finish(side + ' wrist extension drive', 'muscles', fore, true);
    box(s * 0.002, -0.023, 0.002, 0.023, 0.018, 0.012, titanium);
    for (const x of [-0.009, 0, 0.009]) pin([x, -0.024, 0.003], [x, -0.035, 0.003], 0.0026, graphite);
    finish(side + ' palm carrier', 'skeleton', hand, true);
    motor([s * 0.007, -0.037, 0], [1, 0, 0], 0.027, 0.046);
    finish(side + ' hip torque motor', 'muscles', thigh, true);
    linear([s * 0.013, -0.06, 0.029], [s * 0.008, -0.208, 0.016], 0.0095);
    finish(side + ' knee extension drive', 'muscles', thigh, true);
    linear([-s * 0.013, -0.044, 0.023], [-s * 0.01, -0.185, 0.013], 0.0092);
    finish(side + ' ankle traction drive', 'muscles', shin, true);
    rail(
      [
        [-0.024, -0.024, 0.049],
        [-0.018, -0.021, 0.015],
        [-0.013, -0.016, -0.022],
        [0.013, -0.016, -0.022],
        [0.018, -0.021, 0.015],
        [0.024, -0.024, 0.049],
      ],
      0.0042,
      graphite,
    );
    for (const [y, z, span] of [
      [-0.022, 0.034, 0.019],
      [-0.017, -0.017, 0.012],
    ])
      pin([-span, y, z], [span, y, z], 0.0038, milled);
    finish(side + ' foot load bed', 'skeleton', foot, true);
  }
}
