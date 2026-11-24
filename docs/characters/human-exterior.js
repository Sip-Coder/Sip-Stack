// The skin loft uses sections cut directly through the posed source anatomy.
// Only the original offset skin is attached to the clothing and skinning rig.
import * as T from 'three';

const tau = Math.PI * 2;
const { lerp, smoothstep, clamp } = T.MathUtils;

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
    ...sample(crotch, lowerRibs, 13),
    ...sample(lowerRibs, shoulderLine, 14),
    ...sample(shoulderLine, jaw, 11),
    jaw,
  ];
  for (const side of ['L', 'R']) {
    const shoulder = joints['upperArm' + side], elbow = joints['forearm' + side], wrist = joints['hand' + side];
    const femur = joints['thigh' + side], knee = joints['shin' + side], ankle = joints['foot' + side];
    const sleeveHead = at(shoulder, elbow, -0.17);
    const thighTop = at(femur, knee, -0.10);
    lines['arm' + side] = [...sample(wrist, elbow, 13), ...sample(elbow, sleeveHead, 16), sleeveHead];
    lines['leg' + side] = [...sample(ankle, knee, 14), ...sample(knee, thighTop, 14), thighTop];
    const sole = ankle.clone();
    // The articulated feet's CT surfaces set the true width, toe box and heel.
    sole.y = 0.0005;
    lines['foot' + side] = [...sample(sole, ankle, 10), ankle.clone().add(new T.Vector3(0, 0.008, 0))];
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
  const radius = lerp(sectionRadius(a, angle / tau), sectionRadius(b, angle / tau), v);
  return [lerp(a[1], b[1], v), lerp(a[2], b[2], v), radius];
}

function sectionRadius(row, turn) {
  const columns = row.length - 3;
  const index = ((turn * columns) % columns + columns) % columns;
  const left = Math.floor(index), right = (left + 1) % columns;
  return lerp(row[3 + left], row[3 + right], index - left);
}

export function attachExteriorProfile(rig, data) {
  // Distances are recorded in units of 1/10000 of standing height.
  const profiles = Object.fromEntries(Object.entries(data).map(([key, rows]) => [
    key, rows.map((r) => r.map((n) => n * 0.0001)),
  ]));
  rig.exterior = profiles;
}

// Pattern coordinates choose a height and angle on the skin. Cloth adds
// ease over the adjacent skin samples it spans between fabric vertices.
function fabricSection(profile, y, angle) {
  const [x, z, direct] = sampleExterior(profile, y, angle);
  const dx = Math.sin(angle), dz = Math.cos(angle);
  const turn = Math.PI / (profile[0].length - 3);
  let radius = direct;
  for (const [dy, da] of [[-0.007, 0], [0.007, 0], [0, -turn], [0, turn]]) {
    const [cx, cz, skin] = sampleExterior(profile, y + dy, angle + da);
    radius = Math.max(radius, (cx - x) * dx + (cz - z) * dz + skin * Math.cos(da));
  }
  return [x, z, radius];
}

export function exteriorPoint(rig, region, y, angle, ease) {
  const [x, z, skinRadius] = fabricSection(rig.exterior[region], y, angle);
  const radius = skinRadius + ease;
  return [x + radius * Math.sin(angle), y, z + radius * Math.cos(angle)];
}

// At the fly, the two thigh shells pass through the torso section. Cut the
// shared waistband around their outermost intersection, then let it fall
// back onto the torso just above the thigh caps.
export function hipExteriorPoint(rig, y, angle, ease) {
  const [x, z, torso] = fabricSection(rig.exterior.torso, y, angle);
  const dx = Math.sin(angle), dz = Math.cos(angle);
  let radius = torso;
  for (const key of ['legL', 'legR']) {
    const profile = rig.exterior[key];
    const end = profile.at(-1)[0];
    if (y > end + 0.014 || y < profile[0][0]) continue;
    const columns = profile[0].length - 3;
    const [cx, cz] = sampleExterior(profile, y, 0);
    let hit = torso;
    let across = 0, along = 0;
    for (let i = 0; i <= columns; i++) {
      const a = i * tau / columns;
      const r = sampleExterior(profile, y, a)[2];
      const px = cx - x + r * Math.sin(a), pz = cz - z + r * Math.cos(a);
      const nextAcross = px * dz - pz * dx, nextAlong = px * dx + pz * dz;
      if (i && (across <= 0) !== (nextAcross <= 0))
        hit = Math.max(hit, lerp(along, nextAlong, across / (across - nextAcross)));
      across = nextAcross;
      along = nextAlong;
    }
    radius = Math.max(radius, lerp(torso, hit, 1 - smoothstep(y, end, end + 0.014)));
  }
  return [x + (radius + ease) * dx, y, z + (radius + ease) * dz];
}

export function exteriorSkinWeights(rig, region, y) {
  const { joints } = rig.anatomy;
  if (region === 'torso') {
    if (y >= joints.chest.y + 0.085)
      return ['head', 'chest', smoothstep(y, joints.head.y - 0.022, joints.head.y + 0.012)];
    return ['chest', 'hips', smoothstep(y, joints.hips.y - 0.025, joints.chest.y + 0.026)];
  }
  const side = region.at(-1);
  if (region.startsWith('foot')) return ['foot' + side, 'foot' + side, 1];
  const arm = region.startsWith('arm');
  const upper = (arm ? 'upperArm' : 'thigh') + side;
  const lower = (arm ? 'forearm' : 'shin') + side;
  const pivot = joints[lower].y;
  return [upper, lower, smoothstep(y, pivot - 0.021, pivot + 0.021)];
}

export function addExteriorShell(rig, tone) {
  const material = new T.MeshStandardMaterial({ color: tone, roughness: 0.59 });
  material.userData.blueprintId = 'skin';
  const segments = rig.joints;
  const { joints } = rig.anatomy;
  const make = (key, rows, sides) => {
    const xyz = [], uv = [], indices = [], skin = [], weight = [];
    const binding = rows.map(([y]) => {
      const [upper, lower, fraction] = exteriorSkinWeights(rig, key, y);
      return [segments.indexOf(rig[upper]), segments.indexOf(rig[lower]), fraction];
    });
    const knee = joints['shin' + key.at(-1)]?.y;
    const kneeRow = knee !== undefined && key.startsWith('leg')
      ? rows.reduce((i, r, j) => Math.abs(r[0] - knee) < Math.abs(rows[i][0] - knee) ? j : i, 0)
      : -1;
    function put(x, y, z, u, j) {
      const [upper, lower, fraction] = binding[j];
      xyz.push(x, y, z);
      uv.push(u, j / (rows.length - 1));
      skin.push(upper, lower, 0, 0);
      weight.push(fraction, 1 - fraction, 0, 0);
      return xyz.length / 3 - 1;
    }
    for (const [j, row] of rows.entries()) {
      const [y, x, z] = row;
      for (let i = 0; i < sides; i++) {
        const a = tau * i / sides;
        const radius = sectionRadius(row, i / sides);
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
    const wrap = make(key, rows, rows[0].length - 3);
    const skin = new T.SkinnedMesh(wrap.g, material);
    skin.name = names[key];
    skin.userData.anatomicalSkin = names[key];
    skin.frustumCulled = false;
    rig.root.add(skin);
    skin.bind(skeleton);
    anatomy.push(skin);
    if (wrap.knees.length) knees[key.at(-1)] = { mesh: skin, vertices: { high: wrap.knees, mobile: wrap.knees } };
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
  const width = Math.max(...foot.flatMap(([y, x]) =>
    [-Math.PI / 2, Math.PI / 2].map(angle => sampleExterior(foot, y, angle)[2] + Math.abs(x - joint.x))));
  const toe = Math.max(...foot.map((r) => r[3] + r[2] - joint.z));
  return {
    x: Math.max(pattern.x, (width + 0.004) / pattern.halfWidth),
    z: Math.max(pattern.z, (toe + 0.008) / pattern.toe),
    floor: -joint.y - 0.001,
  };
}

export function explorerTorso(rig, [x, station, z], ease, oldHip, oldShoulder) {
  const y = torsoStation(rig, station, oldHip, oldShoulder);
  return exteriorPoint(rig, 'torso', y, Math.atan2(x, z), ease);
}

export function explorerLimb(rig, side, leg, [x, station, z], ease, oldUpper, oldLower) {
  const pivot = rig.anatomy.joints[(leg ? 'thigh' : 'upperArm') + side];
  const y = limbStation(rig, side, leg, station, oldUpper, oldLower).y + pivot.y;
  return exteriorPoint(rig, (leg ? 'leg' : 'arm') + side, y, Math.atan2(x, z), ease);
}
