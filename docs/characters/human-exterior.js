// The skin is an original radial loft over sampled sections of the rigid
// donor anatomy. All distances here are in standing-height units. The source
// anatomy never runs through the dress patterns or the skinning matrices.
import * as T from 'three';

const tau = Math.PI * 2;
const { lerp, smoothstep, clamp } = T.MathUtils;
const columns = 24;
const radians = (i) => i * tau / columns;

export const exteriorRegions = {
  torso: ['hips', 'chest', 'neck', 'spine'],
  armL: ['upperArmL', 'forearmL'],
  armR: ['upperArmR', 'forearmR'],
  legL: ['thighL', 'shinL'],
  legR: ['thighR', 'shinR'],
  footL: ['footL'],
  footR: ['footR'],
};

export function exteriorStationLines(rig) {
  const { joints, skullBounds } = rig.anatomy;
  const lines = {};
  const at = (a, b, t) => a.clone().lerp(b, t);
  function sample(a, b, count, offset = 0) {
    return Array.from({ length: count }, (_, i) => at(a, b, (i + offset) / count));
  }
  const pelvis = joints.hips;
  const neck = joints.head;
  const ribCage = joints.chest;
  const crotch = pelvis.clone().add(new T.Vector3(0, -0.07, 0.007));
  const jaw = neck.clone();
  jaw.y = Math.max(neck.y + 0.002, (skullBounds?.min.y ?? neck.y) + 0.015);
  const shoulderLine = at(joints.upperArmL, joints.upperArmR, 0.5);
  const lowerRibs = at(pelvis, ribCage, 0.82);
  lines.torso = [
    ...sample(crotch, lowerRibs, 9),
    ...sample(lowerRibs, shoulderLine, 9),
    ...sample(shoulderLine, jaw, 8),
    jaw,
  ];
  for (const side of ['L', 'R']) {
    const shoulder = joints['upperArm' + side], elbow = joints['forearm' + side], wrist = joints['hand' + side];
    const femur = joints['thigh' + side], knee = joints['shin' + side], ankle = joints['foot' + side];
    const sleeveHead = at(shoulder, elbow, -0.17);
    const thighTop = at(femur, knee, -0.10);
    lines['arm' + side] = [...sample(wrist, elbow, 10), ...sample(elbow, sleeveHead, 13), sleeveHead];
    lines['leg' + side] = [...sample(ankle, knee, 12), ...sample(knee, thighTop, 12), thighTop];
    const sole = ankle.clone();
    // The articulated feet's CT surfaces set the true width, toe box and heel.
    sole.y = 0.0005;
    lines['foot' + side] = [...sample(sole, ankle, 9), ankle.clone().add(new T.Vector3(0, 0.008, 0))];
  }
  return lines;
}

function calculateSection(rows, y) {
  let hi = 1;
  while (hi < rows.length - 1 && y > rows[hi][0]) hi++;
  const a = rows[hi - 1], b = rows[hi];
  const v = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  return { a, b, v };
}

export function sampleExterior(profile, y, angle) {
  const { a, b, v } = calculateSection(profile, y);
  const index = ((angle / tau * columns) % columns + columns) % columns;
  const left = Math.floor(index), right = (left + 1) % columns;
  const radius = lerp(
    lerp(a[3 + left], a[3 + right], index - left),
    lerp(b[3 + left], b[3 + right], index - left), v,
  );
  return [lerp(a[1], b[1], v), lerp(a[2], b[2], v), radius];
}

export function attachExteriorProfile(rig, data) {
  // Distances are recorded in units of 1/10000 of standing height.
  const profiles = Object.fromEntries(Object.entries(data).map(([key, rows]) => [
    key, rows.map((r) => r.map((n) => n * 0.0001)),
  ]));
  rig.exterior = profiles;
}

export function coverExterior(rig, region, point, clearance, center) {
  const y = point[1];
  const rows = rig.exterior[region];
  if (y < rows[0][0] || y > rows.at(-1)[0]) return point;
  const { a, b, v } = calculateSection(rows, y);
  const x0 = lerp(a[1], b[1], v), z0 = lerp(a[2], b[2], v);
  const dx = point[0] - (center?.[0] ?? x0), dz = point[2] - (center?.[1] ?? z0);
  const angle = Math.atan2(dx, dz);
  const [, , radius] = sampleExterior(rows, y, angle);
  const width = Math.max(radius + clearance, Math.hypot(dx, dz));
  return [x0 + width * Math.sin(angle), y, z0 + width * Math.cos(angle)];
}

export function addExteriorShell(rig, tone) {
  const material = new T.MeshStandardMaterial({ color: tone, roughness: 0.59 });
  material.userData.blueprintId = 'skin';
  const segments = rig.joints;
  const { joints } = rig.anatomy;
  const make = (key, rows, sides) => {
    const xyz = [], uv = [], indices = [], skin = [], weight = [];
    const knee = joints['shin' + key.at(-1)]?.y;
    const kneeRow = knee !== undefined && key.startsWith('leg')
      ? rows.reduce((i, r, j) => Math.abs(r[0] - knee) < Math.abs(rows[i][0] - knee) ? j : i, 0)
      : -1;
    function put(x, y, z, u, j) {
      let upper = 'chest', lower = 'hips', fraction;
      if (key === 'torso') {
        if (y >= joints.chest.y + 0.085) {
          upper = 'head'; lower = 'chest';
          fraction = smoothstep(y, joints.head.y - 0.022, joints.head.y + 0.012);
        } else {
          fraction = smoothstep(y, joints.hips.y - 0.025, joints.chest.y + 0.026);
        }
      } else {
        const side = key.at(-1);
        const arm = key.startsWith('arm'), foot = key.startsWith('foot');
        upper = foot ? 'foot' + side : (arm ? 'upperArm' : 'thigh') + side;
        lower = foot ? upper : (arm ? 'forearm' : 'shin') + side;
        const pivot = joints[lower].y;
        fraction = foot ? 1 : smoothstep(y, pivot - 0.021, pivot + 0.021);
      }
      xyz.push(x, y, z);
      uv.push(u, j / (rows.length - 1));
      skin.push(segments.indexOf(rig[upper]), segments.indexOf(rig[lower]), 0, 0);
      weight.push(fraction, 1 - fraction, 0, 0);
      return xyz.length / 3 - 1;
    }
    for (const [j, row] of rows.entries()) {
      const [y, x, z] = row;
      for (let i = 0; i < sides; i++) {
        const a = tau * i / sides;
        const [, , radius] = sampleExterior(rows, y, a);
        put(x + radius * Math.sin(a), y, z + radius * Math.cos(a), i / sides, j);
      }
    }
    for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i < sides; i++) {
      const a = j * sides + i, b = j * sides + (i + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
    // Seal covered stumps. These small fans are part of the original skin,
    // beneath the neighboring shell. They never create or modify bone.
    for (const [row, first] of [[0, true], [rows.length - 1, false]]) {
      const [y, x, z] = rows[row], a = put(x, y, z, 0.5, row);
      for (let i = 0; i < sides; i++) {
        const b = row * sides + i, c = row * sides + (i + 1) % sides;
        indices.push(a, first ? c : b, first ? b : c);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skin, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(weight, 4));
    g.setIndex(indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return { g, knees: kneeRow < 0 ? [] : Array.from({ length: sides }, (_, i) => kneeRow * sides + i) };
  };
  const anatomy = [];
  const names = { torso: 'Subcutaneous torso and neck', armL: 'Left arm skin', armR: 'Right arm skin',
    legL: 'Left leg skin', legR: 'Right leg skin', footL: 'Left foot skin', footR: 'Right foot skin' };
  rig.root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(segments);
  const knees = {};
  for (const [key, rows] of Object.entries(rig.exterior)) {
    const high = make(key, rows, columns);
    const mobile = make(key, rows, columns);
    const skin = new T.SkinnedMesh(high.g, material);
    skin.name = names[key];
    skin.userData.anatomicalSkin = names[key];
    skin.userData.mobileGeometry = mobile.g;
    skin.frustumCulled = false;
    rig.root.add(skin);
    skin.bind(skeleton);
    anatomy.push(skin);
    if (high.knees.length) knees[key.at(-1)] = { mesh: skin, vertices: { high: high.knees, mobile: mobile.knees } };
  }
  return { meshes: anatomy, knees };
}

export function seatExplorerHead(rig, head, shape) {
  const box = rig.anatomy.skullBounds;
  const center = box.getCenter(new T.Vector3()).sub(rig.anatomy.joints.head);
  const extent = box.getSize(new T.Vector3());
  // The scan fixes the jaw-to-crown height and depth. Keep the art-directed
  // fullness of the face, expressive eyes and oversized sweep of the hair.
  head.scale.set(
    Math.max(shape.width, extent.x * 1.31) / shape.baseWidth,
    (extent.y + 0.025) / shape.height,
    Math.max(shape.depth, extent.z * 1.18) / shape.baseDepth,
  );
  head.position.set(center.x, center.y - shape.middle * head.scale.y, center.z + shape.front);
}

export function shapeExplorerCrown(rig, head) {
  rig.root.updateMatrixWorld(true);
  const worldToRoot = rig.root.matrixWorld.clone().invert();
  const former = rig.anatomy.skullBounds.max.y - 0.018;
  const target = rig.anatomy.skullBounds.max.y + 0.018;
  const point = new T.Vector3(), transform = new T.Matrix4();
  let peak = -Infinity;
  head.traverse((mesh) => {
    if (!mesh.isMesh) return;
    transform.multiplyMatrices(worldToRoot, mesh.matrixWorld);
    const a = mesh.geometry.attributes.position;
    for (let i = 0; i < a.count; i++)
      peak = Math.max(peak, point.fromBufferAttribute(a, i).applyMatrix4(transform).y);
  });
  if (peak <= target) return;
  const shrink = (target - former) / (peak - former);
  const reverse = new T.Matrix4();
  head.traverse((mesh) => {
    if (!mesh.isMesh || mesh.name === 'sippy-face-sculpt') return;
    transform.multiplyMatrices(worldToRoot, mesh.matrixWorld);
    reverse.copy(transform).invert();
    for (const slot of ['geometry', 'mobileGeometry']) {
      const holder = slot === 'geometry' ? mesh : mesh.userData;
      const input = holder[slot];
      if (!input) continue;
      // The groom shares its original source geometry across live/authored
      // views. Carry both LODs in this actor's own geometry.
      let g;
      const a = input.attributes.position;
      for (let i = 0; i < a.count; i++) {
        point.fromBufferAttribute(a, i).applyMatrix4(transform);
        if (point.y <= former) continue;
        g ??= input.clone();
        point.y = former + (point.y - former) * shrink;
        point.applyMatrix4(reverse);
        g.attributes.position.setXYZ(i, point.x, point.y, point.z);
      }
      if (!g) continue;
      g.computeVertexNormals();
      g.computeBoundingSphere();
      holder[slot] = g;
    }
  });
}

// Hem and cuff stations follow the actual hinge positions. Existing textile
// ease, panel folds, stitching and authored local ornaments are kept.
export function limbStation(rig, side, leg, y, oldUpper, oldLower) {
  const [hingeKey, endKey] = leg ? ['shin', 'foot'] : ['forearm', 'hand'];
  const hinge = rig[hingeKey + side].position;
  const end = rig[endKey + side].position;
  const upper = Math.min(1, -y / oldUpper);
  const lower = Math.max(0, (-y - oldUpper) / oldLower);
  return new T.Vector3().addScaledVector(hinge, upper).addScaledVector(end, lower);
}

export function torsoStation(rig, y, oldHip, oldShoulder) {
  const joints = rig.anatomy.joints;
  const shoulders = (joints.upperArmL.y + joints.upperArmR.y) * 0.5;
  const lower = (shoulders - joints.hips.y) / (oldShoulder - oldHip);
  const upper = Math.max(0.52, (rig.anatomy.skullBounds.min.y - shoulders - 0.011) / 0.047);
  return y <= oldShoulder ? joints.hips.y + (y - oldHip) * lower : shoulders + (y - oldShoulder) * upper;
}

export function sneakerRoom(rig, side, pattern) {
  const foot = rig.exterior['foot' + side], joint = rig.anatomy.joints['foot' + side];
  const width = Math.max(...foot.map((r) => r[9] + Math.abs(r[1] - joint.x)), ...foot.map((r) => r[21] + Math.abs(r[1] - joint.x)));
  const toe = Math.max(...foot.map((r) => r[3] + r[2] - joint.z));
  return {
    x: Math.max(pattern.x, (width + 0.004) / pattern.halfWidth),
    z: Math.max(pattern.z, (toe + 0.008) / pattern.toe),
    floor: -joint.y - 0.001,
  };
}

export function explorerTorso(rig, point, clearance, oldHip, oldShoulder, zCenter = 0) {
  const chest = rig.anatomy.joints.chest;
  const y = torsoStation(rig, point[1], oldHip, oldShoulder);
  const z = point[2] - zCenter;
  const width = rig.anatomy.thoraxBounds.getSize(new T.Vector3()).x;
  const ease = clamp(width / (rig.name === 'sippy' ? 0.196 : 0.183), 0.79, 1.05);
  return coverExterior(rig, 'torso', [chest.x + point[0] * ease, y, chest.z + z],
    clearance, [chest.x, chest.z]);
}

export function explorerLimb(rig, side, leg, point, clearance, oldUpper, oldLower) {
  const key = (leg ? 'thigh' : 'upperArm') + side;
  const pivot = rig.anatomy.joints[key];
  const c = limbStation(rig, side, leg, point[1], oldUpper, oldLower).add(pivot);
  const original = [c.x + point[0], c.y, c.z + point[2]];
  return coverExterior(rig, (leg ? 'leg' : 'arm') + side, original, clearance, [c.x, c.z]);
}
