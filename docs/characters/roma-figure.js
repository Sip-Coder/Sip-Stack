// Grade Roma's anatomical sculpture, fitted garment patterns and articulated
// rest skeleton together. The animation operates on these physical bind shapes.
import * as T from 'three';

export const romaFigure = {
  hips: 0.4224,
  chest: 0.522,
  knee: 0.24,
  ankle: 0.047,
  torsoX: 1.15,
  torsoY: 0.83,
  torsoZ: 1.22,
};

function gradePoint(x, y, z, leg, out, arm = false) {
  const f = romaFigure;
  let height;
  if (y >= 0.52) height = f.chest + (y - 0.64) * f.torsoY;
  else if (y >= 0.275) height = f.knee + ((y - 0.275) * (f.hips - f.knee)) / 0.245;
  else height = f.ankle + ((y - 0.047) * (f.knee - f.ankle)) / 0.228;
  if (arm) height -= 0.039 * (1 - T.MathUtils.smoothstep(y, 0.468, 0.625));
  const calf = leg ? 1 - T.MathUtils.smoothstep(y, 0.435, 0.526) : 0;
  const stride = Math.sign(x) * (0.073 + (Math.abs(x) - 0.065) * 1.56);
  const lowerCalf = leg
    ? T.MathUtils.smoothstep(y, 0.065, 0.09) * (1 - T.MathUtils.smoothstep(y, 0.143, 0.181))
    : 0;
  const calfBack = leg ? 0.007 * (1 - T.MathUtils.smoothstep(y, 0.18, 0.28)) : 0;
  out.set(
    T.MathUtils.lerp(x * f.torsoX, stride, calf),
    height,
    z *
      (leg
        ? T.MathUtils.lerp(1.47, 1.04, T.MathUtils.smoothstep(y, 0.16, 0.48)) * (1 + 0.19 * lowerCalf)
        : f.torsoZ) -
      calfBack,
  );
  // Shape the jacket breast and its fitted bodice together above the waist.
  // Apply the same grade to every morph target as to the relaxed sculpture.
  out.z +=
    0.0105 *
    T.MathUtils.smoothstep(y, 0.659, 0.677) *
    (1 - T.MathUtils.smoothstep(y, 0.699, 0.728)) *
    T.MathUtils.smoothstep(z, 0.006, 0.048) *
    (1 - T.MathUtils.smoothstep(Math.abs(x), 0.098, 0.122));
  return out;
}

export function fitRomaFigure(rig, patterns, nodes, cuffs, jacket, buckle) {
  const f = romaFigure,
    p = new T.Vector3(),
    q = new T.Vector3();
  for (const mesh of patterns)
    for (const g of [mesh.geometry, mesh.userData.mobileGeometry]) {
      const base = g.attributes.position,
        morphs = g.morphAttributes.position ?? [];
      for (let i = 0; i < base.count; i++) {
        const x = base.getX(i),
          y = base.getY(i),
          z = base.getZ(i);
        const region = g.userData.anatomicalRegions?.[i];
        const leg = region === 3;
        const arm = region === undefined ? Math.abs(x) > 0.103 && y < 0.67 : region === 1 || region === 2;
        gradePoint(x, y, z, leg, p, arm);
        for (const m of morphs) {
          gradePoint(x + m.getX(i), y + m.getY(i), z + m.getZ(i), leg, q, arm);
          q.sub(p);
          m.setXYZ(i, q.x, q.y, q.z);
        }
        if (mesh === patterns[0]) {
          // Allow tailoring ease over the real deltoid where it rolls into the
          // biceps at high flexion. The exposed neck and hands keep their contour.
          const cap =
            T.MathUtils.smoothstep(Math.abs(x), 0.078, 0.123) *
            T.MathUtils.smoothstep(y, 0.672, 0.74) *
            (1 - T.MathUtils.smoothstep(y, 0.793, 0.825));
          const sleeve =
            T.MathUtils.smoothstep(Math.abs(x), 0.09, 0.115) *
            T.MathUtils.smoothstep(y, 0.49, 0.55) *
            (1 - T.MathUtils.smoothstep(y, 0.72, 0.76));
          const d = 0.008 * (cap + 0.4 * sleeve),
            normal = g.attributes.normal;
          p.x -= normal.getX(i) * d;
          p.y -= normal.getY(i) * d;
          p.z -= normal.getZ(i) * d;
        }
        if (mesh === patterns[0] && y > 0.794) {
          const neck =
            T.MathUtils.smoothstep(y, 0.796, 0.843) * (1 - T.MathUtils.smoothstep(Math.abs(x), 0.033, 0.052));
          p.y += 0.022 * neck;
          p.x *= 1 + 0.1 * neck;
        }
        base.setXYZ(i, p.x, p.y, p.z);
      }
      base.needsUpdate = true;
      // Smooth normals across the two physical plies and the stitched waist.
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) {
        p.fromBufferAttribute(n, i);
        p.set(p.x / f.torsoX, p.y / f.torsoY, p.z / f.torsoZ).normalize();
        n.setXYZ(i, p.x, p.y, p.z);
      }
      if (mesh === patterns[0]) g.computeVertexNormals();
      g.computeBoundingSphere();
    }
  for (const j of rig.joints) {
    const old = nodes.get(j),
      parent = nodes.get(j.parent);
    const isLeg = /^(thigh|shin|foot)/.test(j.name);
    gradePoint(old.x, old.y, old.z, isLeg, p, /Arm|forearm|hand/.test(j.name));
    if (j === rig.head) p.y = 0.701;
    if (parent)
      gradePoint(
        parent.x,
        parent.y,
        parent.z,
        isLeg && j.parent !== rig.hips,
        q,
        /Arm|forearm|hand/.test(j.parent.name),
      );
    else q.set(0, 0, 0);
    j.position.copy(p.sub(q));
  }
  for (const child of rig.chest.children)
    if (child.isMesh) {
      child.scale.x *= f.torsoX;
      child.scale.y *= f.torsoY;
      child.scale.z *= f.torsoZ;
    }
  jacket.scale.multiply(new T.Vector3(f.torsoX, f.torsoY, f.torsoZ));
  for (const child of rig.hips.children)
    if (child.isMesh && !child.geometry.userData.isSkirt) {
      child.scale.x *= f.torsoX;
      child.scale.y *= f.torsoY;
      child.scale.z *= f.torsoZ;
    }
  buckle.position.multiply(new T.Vector3(f.torsoX, f.torsoY, f.torsoZ));
  buckle.scale.multiplyScalar(1.12);
  for (const side of ['L', 'R']) {
    for (const child of rig['foot' + side].children)
      if (child.isMesh) {
        child.scale.x *= 1.43;
        child.scale.z *= 1.1;
      }
    cuffs[side].scale.set(1.2, 1, 1.14);
    for (const nail of rig['hand' + side].children)
      if (nail.name === 'Roma nail plate') {
        nail.position.x *= f.torsoX;
        nail.position.y *= 0.761;
        nail.position.z *= f.torsoZ;
        nail.scale.multiply(new T.Vector3(f.torsoX, 0.86, f.torsoZ));
      }
  }
}

export function originalRomaJoints(rig) {
  rig.root.updateMatrixWorld(true);
  const inverse = rig.root.matrixWorld.clone().invert();
  return new Map(
    rig.joints.map((j) => [j, new T.Vector3().setFromMatrixPosition(j.matrixWorld).applyMatrix4(inverse)]),
  );
}
