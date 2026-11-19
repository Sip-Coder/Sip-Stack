// Pose the same production geometry and use the renderer's deformation convention.
import * as T from 'three';
import { worker } from '../docs/life/people.js';

const vector = () => new T.Vector3();
const radians = T.MathUtils.degToRad;
const cross = vector(),
  first = vector(),
  second = vector(),
  normal = vector(),
  predicted = vector();
const palette = new T.Matrix4(),
  transform = new T.Matrix3();
const round = (n) => Math.round(n * 1e5) / 1e5;

function polygonArea(points) {
  const area = vector(),
    origin = points[0];
  for (let i = 1; i + 1 < points.length; i++) {
    area.add(cross.crossVectors(first.copy(points[i]).sub(origin), second.copy(points[i + 1]).sub(origin)));
  }
  return area.length() * 0.5;
}

// Main's loft builder emitted one consecutive u=0..1 sequence per closed loop.
// Locate the actual section nearest the anatomical landmark, across its skin and clothes.
function originalLoop(meshes, target) {
  let found,
    score = Infinity;
  for (const mesh of meshes) {
    const { uv, position } = mesh.geometry.attributes;
    for (let i = 0; i < uv.count; ) {
      const start = i++;
      while (i < uv.count && uv.getX(i) > 0) i++;
      const indices = Array.from({ length: i - start }, (_, n) => n + start);
      if (indices.length < 3) continue;
      const points = indices.map((n) => vector().fromBufferAttribute(position, n));
      if (polygonArea(points) < 0.0008) continue;
      const center = points.reduce((a, v) => a.add(v), vector()).multiplyScalar(1 / points.length);
      const distance = center.distanceToSquared(target);
      if (distance < score) {
        score = distance;
        found = { mesh, indices };
      }
    }
  }
  return found;
}

function measureSurface(mesh, indices) {
  const g = mesh.geometry,
    position = g.attributes.position;
  const ring = indices.map((n) => vector().fromBufferAttribute(position, n));
  const rest = Array.from({ length: position.count }, (_, i) => vector().fromBufferAttribute(position, i));
  const near = rest.map((p) => ring.some((r) => p.distanceToSquared(r) <= 0.05 ** 2));
  const faces = [];
  // Neighbourhood is measured from the joint's surface loop, so a broad shoulder
  // and a narrow wrist both include the outer skin within five centimetres.
  for (let k = 0; k < g.index.count; k += 3) {
    const ids = [g.index.getX(k), g.index.getX(k + 1), g.index.getX(k + 2)];
    if (!ids.some((id) => near[id])) continue;
    const [a, b, c] = ids.map((n) => rest[n]);
    const restNormal = vector().crossVectors(first.copy(b).sub(a), second.copy(c).sub(a));
    if (restNormal.lengthSq() < 1e-16) continue;
    faces.push({ ids, restNormal: restNormal.normalize() });
  }
  return { mesh, indices, faces, area: polygonArea(ring) };
}

function examine(surface, skinPoint) {
  const { mesh, indices, faces, area } = surface;
  const { skinWeight, skinIndex, position } = mesh.geometry.attributes;
  const deformed = Array(position.count);
  const point = (id) => (deformed[id] ||= skinPoint(mesh, id, vector()));
  const rotations = mesh.skeleton.bones.map((bone, i) => {
    palette
      .multiplyMatrices(mesh.bindMatrixInverse, bone.matrixWorld)
      .multiply(mesh.skeleton.boneInverses[i])
      .multiply(mesh.bindMatrix);
    return transform.setFromMatrix4(palette).clone();
  });
  let flips = 0;
  for (const { ids, restNormal } of faces) {
    // Compare face winding to its undeformed normal transported by the local
    // bone frames. A 120° knee flex rotates a healthy triangle past world-up.
    predicted.set(0, 0, 0);
    for (const id of ids) {
      for (let j = 0; j < 4; j++) {
        const weight = skinWeight.getComponent(id, j);
        if (weight)
          predicted.addScaledVector(
            first.copy(restNormal).applyMatrix3(rotations[skinIndex.getComponent(id, j)]),
            weight,
          );
      }
    }
    const [a, b, c] = ids.map(point);
    normal.crossVectors(first.copy(b).sub(a), second.copy(c).sub(a));
    if (normal.lengthSq() < 1e-16 || normal.dot(predicted) <= 0) flips++;
  }
  return {
    areaRatio: round(polygonArea(indices.map(point)) / area),
    flippedTriangles: flips,
    triangles: faces.length,
  };
}

function weights(meshes) {
  let invalid = 0,
    four = 0,
    vertices = 0,
    triangles = 0;
  for (const mesh of meshes.filter((m) => m.isSkinnedMesh)) {
    const { skinWeight, skinIndex, position } = mesh.geometry.attributes;
    triangles += mesh.geometry.index.count / 3;
    for (let i = 0; i < position.count; i++) {
      vertices++;
      let sum = 0,
        n = 0,
        bad = false;
      for (let j = 0; j < 4; j++) {
        const w = skinWeight.getComponent(i, j),
          bone = skinIndex.getComponent(i, j);
        sum += w;
        if (w > 1e-6) n++;
        if (
          !Number.isFinite(w) ||
          w < 0 ||
          !Number.isInteger(bone) ||
          bone < 0 ||
          bone >= mesh.skeleton.bones.length
        )
          bad = true;
      }
      if (n === 4) four++;
      if (bad || Math.abs(sum - 1) > 0.0001) invalid++;
    }
  }
  return { vertices, triangles, invalid, four };
}

async function inspectVariant(baseline, variant, job) {
  const scene = new T.Scene(),
    actor = worker(scene, variant, 1.76, job);
  const camera = new T.PerspectiveCamera();
  actor.g.scale.setScalar(1);
  actor.lod(camera, false);
  const sk = actor.skeleton,
    bones = actor.rig?.bones || sk.bones;
  const skinPoint = baseline
    ? (mesh, id, out) => mesh.getVertexPosition(id, out)
    : (await import('../docs/life/deformation.js')).skinPoint;
  const report = { failures: [], bones: bones.length, tiers: [] };
  for (let tier = 0; tier < 2; tier++) {
    actor.setLOD?.(tier, false);
    const meshes = actor.tiers?.[tier] || (tier === 0 ? actor.layers : [actor.low]);
    const info = { tier, weights: weights(meshes), poses: {} };
    if (info.weights.invalid) report.failures.push('LOD' + tier + ' invalid weights');
    const poses = [
      ['elbow90', -90, 0, 0, 0, ['Elbow', 'Forearm']],
      ['wrist+80', 0, 80, 0, 0, ['Forearm', 'Elbow']],
      ['wrist-80', 0, -80, 0, 0, ['Forearm', 'Elbow']],
      ['elbow90wrist+80', -90, 80, 0, 0, ['Elbow', 'Forearm']],
      ['elbow90wrist-80', -90, -80, 0, 0, ['Elbow', 'Forearm']],
      ['knee120', 0, 0, 120, 0, ['Knee']],
      ['shoulder90', 0, 0, 0, -90, ['Shoulder']],
    ];
    for (let i = 0; i < 2; i++) {
      const prefix = i ? 'right' : 'left';
      const original = (name) => bones.filter((b) => b.name === name)[i];
      const side = actor.rig?.sides[i];
      const joint = (key, name) => (side ? bones[side[key]] : original(name));
      const elbow = joint('elbow', 'elbow'),
        wrist = joint('hand', 'wrist'),
        knee = joint('shin', 'knee'),
        shoulder = joint('arm', 'shoulder');
      // Restore both bind-pose translations and orientations, after the actor's initial idle.
      sk.pose();
      scene.updateMatrixWorld(true);
      const regions = {};
      for (const [key, at] of Object.entries({
        Elbow: elbow,
        Forearm: wrist,
        Knee: knee,
        Shoulder: shoulder,
      })) {
        const target = at.getWorldPosition(vector());
        if (key === 'Forearm') target.lerp(elbow.getWorldPosition(vector()), 0.5);
        const mesh = meshes.find((m) => m.geometry.userData.loops?.[prefix + key]?.length);
        const chosen = mesh
          ? { mesh, indices: mesh.geometry.userData.loops[prefix + key] }
          : baseline && originalLoop(meshes, target);
        if (!chosen) {
          report.failures.push('LOD' + tier + ' missing ' + key + ' surface loop');
          continue;
        }
        regions[key] = measureSurface(chosen.mesh, chosen.indices);
      }
      for (const [name, flex, roll, bend, abduction, keys] of poses) {
        sk.pose();
        elbow.rotation.x = radians(flex);
        wrist.rotation.y = radians(roll);
        knee.rotation.x = radians(bend);
        shoulder.rotation.z = radians(i ? -abduction : abduction);
        actor.rig?.update();
        scene.updateMatrixWorld(true);
        sk.update();
        actor.rig?.palette();
        info.poses[name] ||= {};
        for (const key of keys) {
          if (!regions[key]) continue;
          const result = examine(regions[key], skinPoint);
          info.poses[name][prefix + key] = result;
          if (
            !result.triangles ||
            result.flippedTriangles ||
            !Number.isFinite(result.areaRatio) ||
            result.areaRatio < 0.85
          )
            report.failures.push('LOD' + tier + ' ' + name + ' ' + prefix + key);
        }
      }
    }
    report.tiers.push(info);
  }
  return report;
}

export default async function runRig({ baseline }) {
  const actors = [
    [0, 'Harvester'],
    [1, 'Porter'],
    [2, 'Taster'],
    [3, 'Cellar worker'],
    [4, 'Stair walker'],
    [5, 'Oarsman'],
    [6, 'Cantina guest'],
    [7, 'Cooper'],
    [7, 'Pier hand'],
    [6, 'Terrace taster'],
  ];
  let report;
  for (const [variant, name] of actors) {
    const spec = await inspectVariant(baseline, variant, name);
    report ??= { ...spec, failures: [], variants: {} };
    const summary = spec.tiers.map((t) => {
      const probes = Object.values(t.poses).flatMap((p) => Object.values(p));
      return {
        tier: t.tier,
        minAreaRatio: Math.min(...probes.map((p) => p.areaRatio)),
        flippedTriangles: probes.reduce((n, p) => n + p.flippedTriangles, 0),
        weights: t.weights,
      };
    });
    report.variants[name] = { bones: spec.bones, tiers: summary };
    report.failures.push(...spec.failures.map((f) => name + ' ' + f));
    window.probedActors.length = 0;
    // Fixture actors are isolated; release CPU geometry before generating the next one.
    globalThis.gc?.();
  }
  return report;
}
