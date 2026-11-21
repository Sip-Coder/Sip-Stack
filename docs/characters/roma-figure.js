// Grade Roma's anatomical sculpture, fitted garment patterns and articulated
// rest skeleton together. The animation operates on these physical bind shapes.
import * as T from 'three';

export const romaFigure = {
  hips: 0.490,
  chest: 0.6052,
  knee: 0.259,
  ankle: 0.047,
  torsoX: 0.94,
  torsoY: 0.96,
  torsoZ: 0.96,
};

function gradePoint(x, y, z, leg, out, arm = false, pattern = false) {
  const f = romaFigure;
  let height;
  if (y >= 0.52) height = f.chest + (y - 0.64) * f.torsoY;
  else if (y >= 0.275) height = f.knee + ((y - 0.275) * (f.hips - f.knee)) / 0.245;
  else height = f.ankle + ((y - 0.047) * (f.knee - f.ankle)) / 0.228;
  if (arm) height += 0.006 * (1 - T.MathUtils.smoothstep(y, 0.468, 0.625));
  const calf = leg ? 1 - T.MathUtils.smoothstep(y, 0.435, 0.526) : 0;
  // Grade both stride centres without reversing the individual points of
  // the shared trouser fork across the sagittal plane.
  const stride = .91*x - Math.sign(x)*.00815*T.MathUtils.smoothstep(Math.abs(x), 0, .035);
  const lowerCalf = leg
    ? T.MathUtils.smoothstep(y, 0.065, 0.09) * (1 - T.MathUtils.smoothstep(y, 0.143, 0.181))
    : 0;
  const calfBack = leg ? 0.002 * (1 - T.MathUtils.smoothstep(y, 0.18, 0.28)) : 0;
  out.set(
    T.MathUtils.lerp(x * f.torsoX, stride, calf),
    height,
    z *
      (leg
        ? T.MathUtils.lerp(1.06, 0.99, T.MathUtils.smoothstep(y, 0.16, 0.48)) * (1 + 0.055 * lowerCalf)
        : f.torsoZ) -
      calfBack,
  );
  if (leg && pattern) {
    // Carry the knee cloth and underlying patella gently back from the shin,
    // retaining the athletic calf at its widest point and the ankle attachment.
    const knee = T.MathUtils.smoothstep(y, .118, .266) * (1-T.MathUtils.smoothstep(y,.323,.46));
    const calf = Math.exp(-(((y-.204)/.052)**2));
    out.z -= .010*knee + .075*z*calf;
    out.x -= .055*(x-Math.sign(x)*.065)*calf;
  }
  // Shape the jacket breast and its fitted bodice together above the waist.
  // Apply the same grade to every morph target as to the relaxed sculpture.
  out.z +=
    0.0045 *
    T.MathUtils.smoothstep(y, 0.659, 0.677) *
    (1 - T.MathUtils.smoothstep(y, 0.699, 0.728)) *
    T.MathUtils.smoothstep(z, 0.006, 0.048) *
    (1 - T.MathUtils.smoothstep(Math.abs(x), 0.098, 0.122));
  const shoulderCut=T.MathUtils.smoothstep(Math.abs(x),.069,.153)*T.MathUtils.smoothstep(y,.647,.743)*(1-T.MathUtils.smoothstep(y,.810,.837));
  out.x-=Math.sign(x)*.029*shoulderCut;
  out.y-=.006*shoulderCut;
  const yokeRise=T.MathUtils.smoothstep(Math.abs(x),.049,.087)*Math.exp(-(((y-.785)/.029)**2));
  out.y+=.010*yokeRise;
  if(arm){
    // Keep the curved upper arm while tapering the actual forearm and the
    // matching jacket shell through the elbow gathers to the wrist.
    const taper=T.MathUtils.smoothstep(y,.455,.503)*(1-T.MathUtils.smoothstep(y,.626,.701));
    out.x-=.23*taper*(x-Math.sign(x)*.144);
    out.z*=1-.14*taper;
    const finger=1-T.MathUtils.smoothstep(y,.398,.468);
    out.x-=.16*finger*(x-Math.sign(x)*.144);
    out.y+=.0115*finger;
    const elbow=T.MathUtils.smoothstep(y,.555,.615)*(1-T.MathUtils.smoothstep(y,.683,.745));
    const inside=1-T.MathUtils.smoothstep(Math.abs(x),.112,.147);
    out.x+=Math.sign(x)*elbow*(.0035+.0055*inside);
  }
  if(arm) out.x-=Math.sign(x)*.016*(1-T.MathUtils.smoothstep(y,.63,.77));
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
        const isCargo = mesh === patterns[3];
        const leg = region === 3 || (isCargo && y < .554 && Math.abs(x) > .016);
        const arm = !isCargo && (region === undefined ? Math.abs(x) > 0.103 && y < 0.67 : region === 1 || region === 2);
        gradePoint(x, y, z, leg, p, arm, true);
        for (const m of morphs) {
          gradePoint(x + m.getX(i), y + m.getY(i), z + m.getZ(i), leg, q, arm, true);
          q.sub(p);
          m.setXYZ(i, q.x, q.y, q.z);
        }
        if (mesh === patterns[1] && !g.userData.chestAnchors?.has(i)) {
          // Round the inward wall of the underarm gusset. A straight offset
          // of the chest pattern cuts across the biceps at its narrowest.
          const medial = T.MathUtils.smoothstep(Math.abs(x),.080,.101) *
            (1-T.MathUtils.smoothstep(Math.abs(x),.121,.138)) *
            (1-T.MathUtils.smoothstep(Math.abs(z),.011,.040)) *
            T.MathUtils.smoothstep(y,.633,.656) * (1-T.MathUtils.smoothstep(y,.701,.747));
          p.x-=Math.sign(x)*.0125*medial;
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
          // Continue the throat under the jaw while retaining the sternocleidomastoid
          // taper and the wider base flowing into the clavicles.
          p.y += 0.040 * neck;
          p.z -= 0.004 * neck;
          p.x *= 1 - 0.09 * neck;
        }
        if (isCargo && leg) {
          // Give the trouser inseam more ease than the outside seam while
          // preserving the previously cut sagittal profile of the calf.
          const side = Math.sign(x);
          const crossLeg = x - side*.065;
          const ease = T.MathUtils.smoothstep(y,.117,.178)*(1-T.MathUtils.smoothstep(y,.35,.408));
          const flank = T.MathUtils.smoothstep(Math.abs(crossLeg),.004,.028);
          p.x += ease*flank*(.0044*Math.sign(crossLeg)-.0012*side);
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
    if (j === rig.head) p.y = 0.831;
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
    if (child.isMesh && !child.geometry.userData.isHoodieHem) {
      child.scale.x *= f.torsoX;
      child.scale.y *= f.torsoY;
      child.scale.z *= f.torsoZ;
    }
  buckle.position.multiply(new T.Vector3(f.torsoX, f.torsoY, f.torsoZ));
  buckle.scale.multiplyScalar(1.12);
  for (const side of ['L', 'R']) {
    for (const child of rig['foot' + side].children)
      if (child.isMesh) {
        child.scale.x *= 1.08;
        child.scale.z *= 1.02;
      }
    cuffs[side].scale.set(1, 1, 1);
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
