// Original field equipment, built in the local space of Roma's fitted joints.
import * as T from 'three';

const TAU = Math.PI * 2;

// Leather goods have flat panels and rounded corners. Shape horizontal rings
// around a superellipse so the gusset tapers independently of the front panel.
function leatherCase(rows, exponent = 0.53, segments = 40) {
  const positions = [],
    indices = [],
    uv = [];
  for (const [j, [y, rx, rz, cz = 0, cx = 0]] of rows.entries()) {
    for (let i = 0; i < segments; i++) {
      const a = (i * TAU) / segments,
        sx = Math.sin(a),
        sz = Math.cos(a);
      positions.push(
        cx + rx * Math.sign(sx) * Math.abs(sx) ** exponent,
        y,
        cz + rz * Math.sign(sz) * Math.abs(sz) ** exponent,
      );
      uv.push(i / segments, j / (rows.length - 1));
      if (j > 0) {
        const p = (j - 1) * segments + i,
          q = (j - 1) * segments + ((i + 1) % segments);
        indices.push(p, q, p + segments, p + segments, q, q + segments);
      }
    }
  }
  const top = (rows.length - 1) * segments;
  for (let i = 1; i < segments - 1; i++) indices.push(0, i + 1, i, top, top + i, top + i + 1);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// The harness turns over a shoulder. Its width is measured across the shoulder
// while the narrow edge follows the strap normal, including across the crest.
function strapGeometry(points, halfWidth, halfDepth) {
  const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  const geometry = new T.TubeGeometry(path, 30, 1, 8, false);
  const position = geometry.attributes.position;
  const at = new T.Vector3(),
    tangent = new T.Vector3(),
    across = new T.Vector3(),
    normal = new T.Vector3();
  for (let j = 0; j <= 30; j++) {
    const t = j / 30;
    path.getPointAt(t, at);
    path.getTangentAt(t, tangent);
    across.set(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    normal.crossVectors(across, tangent).normalize();
    for (let i = 0; i <= 8; i++) {
      const angle = (TAU * i) / 8;
      const w = Math.cos(angle) * halfWidth,
        d = Math.sin(angle) * halfDepth;
      position.setXYZ(
        j * 9 + i,
        at.x + across.x * w + normal.x * d,
        at.y + across.y * w + normal.y * d,
        at.z + across.z * w + normal.z * d,
      );
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

// The back panel has two padded load-bearing ribs with a central channel for
// the diagonal satchel sling. Their outer ply is sewn into the rigid case.
function backpackPads(chest, leather) {
  const cols = 7,
    rows = 14,
    sideCount = cols * rows,
    pads = [];
  for (const sign of [-1, 1]) {
    const geo = new T.BufferGeometry(),
      points = [],
      index = [];
    for (let face = 0; face < 2; face++)
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const v = row / (rows - 1),
            u = col / (cols - 1),
            round = 0.8 + 0.2 * Math.sin(Math.PI * v);
          const x = sign * (0.009 + 0.049 * u) * round,
            y = -0.058 + 0.154 * v;
          if (!face) points.push(new T.Vector3(x, y, -0.08));
        }
    for (let i = 0; i < points.length; i++) {
      const row = Math.floor(i / cols),
        col = i % cols;
      if (col < cols - 1 && row < rows - 1) {
        index.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
        const b = i + sideCount;
        index.push(b, b + cols, b + 1, b + 1, b + cols, b + cols + 1);
      }
      const rim = (a, b) => index.push(a, a + sideCount, b, b, a + sideCount, b + sideCount);
      if (!row && col < cols - 1) rim(i, i + 1);
      if (row === rows - 1 && col < cols - 1) rim(i + 1, i);
      if (!col && row < rows - 1) rim(i + cols, i);
      if (col === cols - 1 && row < rows - 1) rim(i, i + cols);
    }
    if (sign < 0)
      for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    const pos = new T.Float32BufferAttribute(new Float32Array(sideCount * 6), 3),
      norm = pos.clone();
    pos.setUsage(T.DynamicDrawUsage);
    norm.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', norm);
    geo.setIndex(index);
    geo.boundingSphere = new T.Sphere(new T.Vector3(0, 0.02, -0.073), 0.16);
    const mesh = new T.Mesh(geo, leather);
    mesh.name = 'Roma backpack contact pad ' + (sign > 0 ? 'L' : 'R');
    mesh.castShadow = mesh.receiveShadow = true;
    chest.add(mesh);
    pads.push({ mesh, points, seat: points.map((p) => p.clone()), rail: null });
  }
  return pads;
}

function bindBracelet(body, group) {
  const high = body.geometry,
    wrist = group.parent,
    point = new T.Vector3(),
    xform = new T.Matrix4();
  const samples = [high, body.userData.mobileGeometry ?? high].map((geometry) => {
    body.geometry = geometry;
    xform.copy(wrist.matrixWorld).invert().multiply(body.matrixWorld);
    const ids = [],
      joint = geometry.attributes.skinIndex,
      weight = geometry.attributes.skinWeight;
    const side = wrist.name.slice(-1);
    const inWrist = body.skeleton.bones.map(
      (b) => b.name.startsWith('hand' + side) || b.name.startsWith('forearm' + side),
    );
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      let influence = 0;
      for (let j = 0; j < 4; j++)
        if (inWrist[joint.getComponent(i, j)]) influence += weight.getComponent(i, j);
      if (influence < 0.7) continue;
      body.getVertexPosition(i, point).applyMatrix4(xform);
      if (point.y >= -0.045 && point.y <= 0.038 && point.x * point.x + point.z * point.z < 0.00145)
        ids.push(i);
    }
    return Int32Array.from(ids);
  });
  body.geometry = high;
  return () => {
    xform.copy(wrist.matrixWorld).invert().multiply(body.matrixWorld);
    let extent = 1;
    for (const i of samples[Number(body.geometry !== high)]) {
      body.getVertexPosition(i, point).applyMatrix4(xform);
      if (point.y < -0.015 || point.y > 0.008) continue;
      extent = Math.max(extent, Math.hypot(point.x / 0.0209, point.z / 0.0155) + 0.035);
    }
    group.scale.set(extent, 1, extent);
  };
}

export function makeRomaFieldKit(rig, materials, tools) {
  const { bag, leather, strap, brass, gold, cream, purple, green } = materials;
  const { node, oval, thread, ring, add } = tools;
  const pack = node(rig.chest),
    harness = node(rig.chest),
    compass = node(rig.chest);
  pack.position.set(0, 0.009, -0.005);
  pack.scale.set(0.84, 1.11, 0.74);
  pack.rotation.x = 0.145;
  pack.name = 'Roma field backpack';
  harness.name = 'Roma shoulder harness';
  compass.name = 'Roma compass necklace';
  const packZ = -0.131;
  const belts = [];
  const pads = backpackPads(rig.chest, leather);
  let wristFit;
  add(
    pack,
    leatherCase(
      [
        [-0.085, 0.066, 0.023, packZ],
        [-0.08, 0.083, 0.03, packZ],
        [-0.058, 0.088, 0.033, packZ],
        [0.049, 0.084, 0.036, packZ - 0.001],
        [0.091, 0.077, 0.029, packZ],
        [0.104, 0.066, 0.019, packZ],
      ].map(([y, width, depth, z]) => [y, width, depth * 0.7, z - depth * 0.3]),
    ),
    leather,
  );
  add(
    pack,
    leatherCase([
      [0.012, 0.061, 0.006, -0.171],
      [0.02, 0.075, 0.009, -0.168],
      [0.058, 0.081, 0.015, -0.159],
      [0.088, 0.078, 0.016, -0.149],
      [0.105, 0.068, 0.016, -0.134],
      [0.107, 0.061, 0.009, -0.126],
    ]),
    strap,
  );
  for (const side of [-1, 1]) {
    // Two shoulder straps disappear into their matching brass adjustment loops.
    // The rear shoulder tabs are integral to their pack; the front sections
    // follow the clavicle toward the armhole, leaving the sternum unobstructed.
    // The pack clips to the leather waist belt. Its front harness tabs drop
    // beside the hoodie to two hip anchors, leaving the armholes unobstructed.
    const points = [
      [side * 0.052, 0.089, -0.087],
      [side * 0.058, 0.13, -0.072],
      [side * 0.064, 0.147, -0.026],
      [side * 0.067, 0.144, 0.026],
      [side * 0.068, 0.12, 0.06],
      [side * 0.071, 0.09, 0.068],
      [side * 0.066, 0.06, 0.066],
      [side * 0.06, 0.03, 0.063],
      [side * 0.054, 0.005, 0.06],
      [side * 0.05, -0.023, 0.06],
      [side * 0.045, -0.041, 0.06],
    ];
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    const mesh = new T.Mesh(strapGeometry(points, 0.008, 0.0021), strap);
    mesh.name = 'Roma padded shoulder strap ' + (side > 0 ? 'L' : 'R');
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    mesh.geometry.attributes.normal.setUsage(T.DynamicDrawUsage);
    mesh.geometry.boundingSphere = new T.Sphere(new T.Vector3(0, 0.045, 0), 0.28);
    harness.add(mesh);
    const guides = Array.from({ length: 31 }, (_, i) => curve.getPointAt(i / 30));
    const across = new T.Vector3(1, 0, 0),
      direction = new T.Vector3(),
      lastAcross = across.clone(),
      strapNormal = new T.Vector3();
    const guidesWithEdges = [];
    for (let i = 0; i < guides.length; i++) {
      curve.getTangentAt(i / 30, direction);
      outward(guides[i], strapNormal);
      across.crossVectors(direction, strapNormal).normalize();
      if (across.dot(lastAcross) < 0) across.negate();
      lastAcross.copy(across);
      const width = 0.008 - 0.0028 * T.MathUtils.smoothstep(i, 16, 23);
      for (const side of [-1, 0, 1])
        guidesWithEdges.push(guides[i].clone().addScaledVector(across, side * width));
    }
    belts.push({
      mesh,
      guides: guidesWithEdges,
      points: guidesWithEdges.map((p) => p.clone()),
      centers: guides.map((p) => p.clone()),
      rail: null,
    });
    // Two horizontal stitching runs on the flap and a narrow, burnished edge.
    thread(
      pack,
      brass,
      [
        [side * 0.006, 0.015, -0.178],
        [side * 0.04, 0.016, -0.178],
        [side * 0.063, 0.022, -0.177],
        [side * 0.075, 0.045, -0.172],
      ],
      0.0007,
    );
    const x = 0.042 * side;
    add(
      pack,
      strapGeometry(
        [
          [x, 0.041, -0.178],
          [x, 0.025, -0.179],
          [x, 0.004, -0.17],
          [x, -0.018, -0.167],
        ],
        0.006,
        0.0021,
      ),
      leather,
    );
    thread(
      pack,
      brass,
      [
        [x - 0.007, 0.006, -0.174],
        [x - 0.007, 0.015, -0.177],
        [x + 0.007, 0.015, -0.177],
        [x + 0.007, 0.006, -0.174],
        [x - 0.007, 0.006, -0.174],
      ],
      0.0012,
    );
  }
  // Two earned badges are set into the leather flap, one with a compass rose
  // and one with a tiny grape cluster. Their embossed marks face the rear.
  function badge(x, y, radius, grape) {
    const z = -0.174;
    add(pack, new T.CylinderGeometry(radius, radius, 0.0032, 20), brass, x, y, z, 1, 1, 1, Math.PI / 2);
    add(
      pack,
      new T.CylinderGeometry(radius * 0.81, radius * 0.8, 0.0019, 20),
      grape ? green : cream,
      x,
      y,
      z - 0.0019,
      1,
      1,
      1,
      Math.PI / 2,
    );
    if (grape) {
      for (const [dx, dy] of [
        [-0.32, 0.23],
        [0.32, 0.23],
        [0, -0.24],
      ])
        oval(pack, gold, x + radius * dx, y + radius * dy, z - 0.0034, radius * 0.21, radius * 0.21, 0.001);
    } else {
      const r = radius * 0.62;
      thread(
        pack,
        brass,
        [
          [x - r * 0.35, y - r * 0.32, z - 0.0034],
          [x + r * 0.38, y + r, z - 0.0034],
          [x + r * 0.24, y - r * 0.28, z - 0.0034],
        ],
        0.0008,
      );
    }
  }
  badge(-0.032, 0.053, 0.0105, false);
  badge(0.027, 0.055, 0.009, true);
  thread(
    pack,
    leather,
    [
      [-0.025, 0.102, -0.128],
      [-0.02, 0.116, -0.127],
      [0, 0.121, -0.126],
      [0.02, 0.116, -0.127],
      [0.025, 0.102, -0.128],
    ],
    0.003,
  );

  // The local x axis of the hip bag points away from the wearer. Its strap
  // solver attaches to the two rings along z as the bag tips with a step.
  add(
    bag,
    leatherCase(
      [
        [-0.07, 0.011, 0.031],
        [-0.067, 0.021, 0.042],
        [-0.051, 0.023, 0.048],
        [-0.014, 0.023, 0.047],
        [-0.003, 0.014, 0.04],
      ],
      0.46,
    ),
    leather,
  );
  add(
    bag,
    leatherCase(
      [
        [-0.044, 0.002, 0.03, 0, -0.024],
        [-0.039, 0.0045, 0.042, 0, -0.024],
        [-0.016, 0.006, 0.048, 0, -0.021],
        [-0.001, 0.005, 0.043, 0, -0.014],
        [0.003, 0.003, 0.037, 0, -0.007],
      ],
      0.52,
    ),
    strap,
  );
  thread(
    bag,
    brass,
    [
      [-0.028, -0.024, -0.042],
      [-0.028, -0.037, -0.034],
      [-0.027, -0.043, 0],
      [-0.028, -0.037, 0.034],
      [-0.028, -0.024, 0.042],
    ],
    0.00075,
  );
  // A slotted inside divider and hem surround the stash compartment at the mouth.
  thread(
    bag,
    leather,
    [
      [-0.001, 0.0005, -0.035],
      [-0.001, 0.0012, 0],
      [-0.001, 0.0005, 0.035],
    ],
    0.0021,
  );
  oval(bag, leather, -0.028, -0.043, 0, 0.0035, 0.011, 0.006);
  oval(bag, brass, -0.031, -0.039, 0, 0.0025, 0.0035, 0.004);
  for (const side of [-1, 1]) ring(bag, brass, 0, -0.003, side * 0.041, 0.0067, 0.0015, 0, Math.PI * 0.5);

  // A V chain terminates in an actual raised compass dial at sternum height.
  const z = 0.072,
    cy = 0.079;
  for (const side of [-1, 1])
    thread(
      compass,
      gold,
      [
        [side * 0.032, 0.16, 0.057],
        [side * 0.03, 0.139, 0.055],
        [side * 0.02, 0.117, 0.061],
        [side * 0.008, 0.097, 0.07],
        [0, cy + 0.014, z],
      ],
      0.00115,
    );
  ring(compass, gold, 0, cy + 0.015, z, 0.0035, 0.00105);
  add(compass, new T.CylinderGeometry(0.0125, 0.012, 0.003, 28), brass, 0, cy, z, 1, 1, 1, Math.PI / 2);
  add(
    compass,
    new T.CylinderGeometry(0.0099, 0.0099, 0.0013, 24),
    cream,
    0,
    cy,
    z + 0.0019,
    1,
    1,
    1,
    Math.PI / 2,
  );
  ring(compass, gold, 0, cy, z + 0.0027, 0.0108, 0.00125);
  // The two facets form an actual compass needle above an enamel dial.
  // The contrasting point stays legible at the controller's front distance.
  const needle = (dx, dy, mat) => {
    const shape = new T.Shape();
    shape.moveTo(-0.0028, -0.0015);
    shape.lineTo(dx, dy);
    shape.lineTo(0.0028, 0.0015);
    shape.closePath();
    add(compass, new T.ShapeGeometry(shape), mat, 0, cy, z + 0.0036);
  };
  needle(0.0037, 0.0084, green);
  needle(-0.0037, -0.0084, brass);
  oval(compass, gold, 0, cy, z + 0.0043, 0.0017, 0.0017, 0.0012);
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2,
      x = Math.sin(angle),
      y = Math.cos(angle);
    thread(
      compass,
      brass,
      [
        [0.007 * x, cy + 0.007 * y, z + 0.003],
        [0.009 * x, cy + 0.009 * y, z + 0.003],
      ],
      0.00045,
    );
  }

  const braceletGroups = [];
  const beadShape = new T.SphereGeometry(1, 12, 8);
  for (const [side, joint] of [
    [-1, rig.handR],
    [1, rig.handL],
  ]) {
    const cuff = node(joint, 0, -0.012, 0);
    cuff.name = 'Roma beaded bracelets ' + (side > 0 ? 'L' : 'R');
    braceletGroups.push(cuff);
    // Oval strung beads follow the wrist taper and keep the palm free.
    const colors = side < 0 ? [green, brass, purple, leather] : [purple, brass, cream, green];
    const bands = side < 0 ? 3 : 2;
    for (let band = 0; band < bands; band++) {
      const wy = 0.003 + band * 0.0051,
        rx = 0.0245 - band * 0.00055,
        rz = 0.0195 - band * 0.00035;
      for (let i = 0; i < 14; i++) {
        const a = (TAU * (i + band * 0.36)) / 14,
          bead = (i + band) % 4 === 0 ? 0.0028 : 0.0031;
        add(
          cuff,
          beadShape,
          colors[(i + band) % colors.length],
          rx * Math.cos(a),
          wy + 0.001 * Math.sin(a),
          rz * Math.sin(a),
          bead,
          bead * 0.81,
          bead,
        );
      }
    }
  }
  const tangent = new T.Vector3(),
    across = new T.Vector3(),
    normal = new T.Vector3(),
    unit = new T.Vector3();
  function outward(point, direction) {
    const crown =
      T.MathUtils.smoothstep(point.y, 0.096, 0.147) *
      (1 - T.MathUtils.smoothstep(Math.abs(point.z), 0.026, 0.076));
    direction.set(point.x * 0.44, (0.05 + crown) * 0.105, point.z).normalize();
  }
  const profile = Array.from({ length: 9 }, (_, i) => [Math.cos((TAU * i) / 8), Math.sin((TAU * i) / 8)]);
  return {
    fit(torso, bind, supportLower, padSupport) {
      if (!wristFit) wristFit = braceletGroups.map((g) => bindBracelet(torso[2], g));
      for (const fit of wristFit) fit();
      for (const pad of pads) {
        if (!pad.rail)
          pad.rail = bind(rig.chest, padSupport, pad.points, (_, axis) => axis.set(0, 0, -1), 0.0048);
        pad.rail.refresh();
        for (let i = 0; i < pad.points.length; i++) {
          if (!pad.rail.seat(i, pad.seat[i])) pad.seat[i].copy(pad.points[i]);
          supportLower(pad.seat[i]);
        }
      }
      for (const belt of belts) {
        if (!belt.rail) belt.rail = bind(rig.chest, torso, belt.guides, outward, 0.0096);
        belt.rail.refresh();
        const { centers, mesh } = belt,
          pos = mesh.geometry.attributes.position,
          normals = mesh.geometry.attributes.normal;
        for (let i = 0; i < belt.points.length; i++) {
          if (!belt.rail.seat(i, belt.points[i])) belt.points[i].copy(belt.guides[i]);
          const point = belt.points[i];
          const hood =
            T.MathUtils.smoothstep(-point.z, 0.03, 0.052) *
            T.MathUtils.smoothstep(point.y, 0.102, 0.126) *
            (1 - T.MathUtils.smoothstep(point.y, 0.144, 0.161));
          point.y += 0.006 * hood;
          point.z -= 0.007 * hood;
          supportLower(point);
        }
        for (let i = 0; i < centers.length; i++) centers[i].copy(belt.points[3 * i + 1]);
        for (let i = 0; i < centers.length; i++) {
          const center = centers[i];
          tangent.subVectors(centers[Math.min(i + 1, 30)], centers[Math.max(i - 1, 0)]).normalize();
          across.subVectors(belt.points[3 * i + 2], belt.points[3 * i]).normalize();
          normal.crossVectors(across, tangent).normalize();
          for (let j = 0; j < 9; j++) {
            const cs = profile[j][0],
              sn = profile[j][1];
            unit
              .copy(center)
              .lerp(belt.points[3 * i + (cs < 0 ? 0 : 2)], Math.abs(cs))
              .addScaledVector(normal, 0.00165 * sn);
            pos.setXYZ(i * 9 + j, unit.x, unit.y, unit.z);
            unit
              .copy(across)
              .multiplyScalar(cs / 0.008)
              .addScaledVector(normal, sn / 0.0021)
              .normalize();
            normals.setXYZ(i * 9 + j, unit.x, unit.y, unit.z);
          }
        }
        pos.needsUpdate = normals.needsUpdate = true;
      }
    },
    settlePads(sling, normals) {
      for (const pad of pads) {
        const geo = pad.mesh.geometry,
          pos = geo.attributes.position,
          count = pad.points.length;
        for (let i = 0; i < count; i++) {
          const p = pad.points[i],
            seat = pad.seat[i],
            col = i % 7,
            row = Math.floor(i / 7);
          const bevel = Math.max(1 - Math.min(col, 6 - col), 1 - Math.min(row, 13 - row), 0);
          let z = seat.z - 0.0015 - 0.003 * bevel;
          // The sling is sandwiched between the padding and jacket. Compress
          // only the leather below the narrow strip, retaining the pad either side.
          for (let j = 1; j < sling.length; j++) {
            const a = sling[j - 1],
              b = sling[j];
            if (a.z > -0.035 && b.z > -0.035) continue;
            const dx = b.x - a.x,
              dy = b.y - a.y,
              denom = dx * dx + dy * dy;
            const t =
              denom > 1e-12 ? T.MathUtils.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / denom, 0, 1) : 0;
            const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
            if (d >= 0.025) continue;
            const w = 1 - T.MathUtils.smoothstep(d, 0.013, 0.025);
            const space = a.z + t * (b.z - a.z) - 0.006;
            if (space < z) z += w * (space - z);
          }
          pos.setXYZ(i, p.x, p.y, z);
          pos.setXYZ(i + count, p.x, p.y, Math.min(z - 0.002, -0.103));
        }
        pos.needsUpdate = true;
        normals(geo);
      }
    },
    liftCrossbody(center) {
      if (center.y < -0.052) return;
      outward(center, normal);
      for (const belt of belts) {
        for (let i = 1; i < belt.centers.length; i++) {
          const a = belt.centers[i - 1],
            b = belt.centers[i];
          tangent.subVectors(b, a);
          const len = tangent.lengthSq();
          if (len < 1e-10) continue;
          const t = T.MathUtils.clamp(unit.subVectors(center, a).dot(tangent) / len, 0, 1);
          unit.copy(a).addScaledVector(tangent, t);
          across.subVectors(center, unit);
          const distance = across.lengthSq();
          if (distance > 0.027 * 0.027) continue;
          const above = across.dot(normal),
            lateral = Math.sqrt(Math.max(0, distance - above * above));
          const rise = 0.009 * (1 - T.MathUtils.smoothstep(lateral, 0.013, 0.025));
          if (above < rise) center.addScaledVector(normal, rise - above);
        }
      }
    },
    register(layer) {
      const layers = (parents, swatches) =>
        parents.flatMap((parent) => swatches.map((mat) => layer(parent, mat)).filter(Boolean));
      return {
        backpack: [
          ...layers([pack], [leather, strap, brass, gold, green, cream]),
          ...pads.map((p) => p.mesh),
        ],
        packStraps: belts.map((b) => b.mesh),
        compass: layers([compass], [gold, brass, cream, green]),
        bracelets: layers(braceletGroups, [leather, green, brass, purple, cream]),
      };
    },
  };
}
