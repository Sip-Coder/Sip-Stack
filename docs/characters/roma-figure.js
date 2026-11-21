// Grade Roma's anatomical sculpture, fitted garment patterns and articulated
// rest skeleton together. The animation operates on these physical bind shapes.
import * as T from 'three';

export const romaFigure = {
  hips: 0.49,
  chest: 0.6052,
  knee: 0.259,
  ankle: 0.047,
  torsoX: 0.94,
  torsoY: 0.96,
  torsoZ: 0.96,
};

function gradePoint(x, y, z, leg, out, arm = false, pattern = false, relaxedCut = true) {
  const f = romaFigure;
  let height;
  if (y >= 0.52) height = f.chest + (y - 0.64) * f.torsoY;
  else if (y >= 0.275) height = f.knee + ((y - 0.275) * (f.hips - f.knee)) / 0.245;
  else height = f.ankle + ((y - 0.047) * (f.knee - f.ankle)) / 0.228;
  if (arm) height += 0.006 * (1 - T.MathUtils.smoothstep(y, 0.468, 0.625));
  const calf = leg ? 1 - T.MathUtils.smoothstep(y, 0.435, 0.526) : 0;
  // Grade both stride centres without reversing the individual points of
  // the shared trouser fork across the sagittal plane.
  const stride = 0.91 * x - Math.sign(x) * 0.00815 * T.MathUtils.smoothstep(Math.abs(x), 0, 0.035);
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
    const knee = T.MathUtils.smoothstep(y, 0.118, 0.266) * (1 - T.MathUtils.smoothstep(y, 0.323, 0.46));
    const calf = Math.exp(-(((y - 0.204) / 0.052) ** 2));
    out.z -= 0.01 * knee + 0.075 * z * calf;
    out.x -= 0.055 * (x - Math.sign(x) * 0.065) * calf;
    // The back of the calf tapers above the ankle, widens at the gastrocnemius
    // and draws in again behind the knee. Shape the skin and cloth together.
    const h = out.y;
    const midCalf = T.MathUtils.smoothstep(h, 0.123, 0.168) * (1 - T.MathUtils.smoothstep(h, 0.195, 0.218));
    out.z -= midCalf * (0.0028 * T.MathUtils.smoothstep(z, 0.018, 0.040) -
      0.0032 * (1 - T.MathUtils.smoothstep(z, -0.032, -0.018)));
    out.z -= 0.0032 * Math.exp(-(((h - 0.114) / 0.022) ** 2)) * (1 - T.MathUtils.smoothstep(z, -0.026, -0.016));
    out.z += 0.0032 * Math.exp(-(((h - 0.218) / 0.014) ** 2)) * T.MathUtils.smoothstep(z, 0.018, 0.044);
    const lowerThigh = T.MathUtils.smoothstep(h, 0.267, 0.295) * (1 - T.MathUtils.smoothstep(h, 0.326, 0.343));
    out.z += lowerThigh * (0.002 * T.MathUtils.smoothstep(z, 0.014, 0.043) -
      0.0028 * (1 - T.MathUtils.smoothstep(z, -0.034, -0.014)));
    // Grade the flesh and the trouser pattern together through the upper thigh.
    const upperThigh = T.MathUtils.smoothstep(y, 0.355, 0.422) * (1 - T.MathUtils.smoothstep(y, 0.48, 0.51));
    out.z -= upperThigh * (0.068 * out.z + 0.0012);
  }
  // Shape the jacket breast and its fitted bodice together above the waist.
  // Apply the same grade to every morph target as to the relaxed sculpture.
  out.z +=
    0.0045 *
    T.MathUtils.smoothstep(y, 0.659, 0.677) *
    (1 - T.MathUtils.smoothstep(y, 0.699, 0.728)) *
    T.MathUtils.smoothstep(z, 0.006, 0.048) *
    (1 - T.MathUtils.smoothstep(Math.abs(x), 0.098, 0.122));
  const shoulderCut =
    T.MathUtils.smoothstep(Math.abs(x), 0.069, 0.153) *
    T.MathUtils.smoothstep(y, 0.647, 0.743) *
    (1 - T.MathUtils.smoothstep(y, 0.81, 0.837));
  out.x -= Math.sign(x) * 0.029 * shoulderCut;
  out.y -= 0.006 * shoulderCut;
  const yokeRise =
    T.MathUtils.smoothstep(Math.abs(x), 0.049, 0.087) * Math.exp(-(((y - 0.785) / 0.029) ** 2));
  out.y += 0.01 * yokeRise;
  if (arm) {
    // Keep the curved upper arm while tapering the actual forearm and the
    // matching jacket shell through the elbow gathers to the wrist.
    const taper = T.MathUtils.smoothstep(y, 0.455, 0.503) * (1 - T.MathUtils.smoothstep(y, 0.626, 0.701));
    out.x -= 0.23 * taper * (x - Math.sign(x) * 0.144);
    out.z *= 1 - 0.14 * taper;
    const finger = 1 - T.MathUtils.smoothstep(y, 0.398, 0.468);
    out.x -= 0.16 * finger * (x - Math.sign(x) * 0.144);
    out.y += 0.0115 * finger;
    const elbow = T.MathUtils.smoothstep(y, 0.555, 0.615) * (1 - T.MathUtils.smoothstep(y, 0.683, 0.745));
    const inside = 1 - T.MathUtils.smoothstep(Math.abs(x), 0.112, 0.147);
    out.x += Math.sign(x) * elbow * (0.0035 + 0.0055 * inside);
  }
  if (arm) {
    const side = Math.sign(x);
    out.x -= side * 0.016 * (1 - T.MathUtils.smoothstep(y, 0.63, 0.77));
    // Narrow the relaxed palm around its own knuckle line, with a gentle
    // transition through the wrist. The jacket shoulders keep their ease.
    const wrist = 1 - T.MathUtils.smoothstep(y, 0.444, 0.509);
    out.x -= wrist * (side * 0.004 + 0.13 * (x - side * 0.131));
  }
  if (!pattern || !relaxedCut) return out;
  // Let the collarbones sweep outward into the sleeve instead of leaving a
  // notch beside the crew neck. The lateral deltoid falls into a soft cap.
  const ax = Math.abs(out.x),
    yFit = out.y;
  const cap = T.MathUtils.smoothstep(ax, 0.09, 0.133) * Math.exp(-(((yFit - 0.746) / 0.03) ** 2));
  out.x -= Math.sign(x) * 0.007 * cap;
  const clavicle =
    T.MathUtils.smoothstep(ax, 0.024, 0.043) *
    (1 - T.MathUtils.smoothstep(ax, 0.075, 0.102)) *
    Math.exp(-(((yFit - 0.756) / 0.026) ** 2));
  out.y += 0.014 * clavicle;
  if (arm) {
    const inner =
      T.MathUtils.smoothstep(ax, 0.092, 0.108) *
      (1 - T.MathUtils.smoothstep(ax, 0.115, 0.136)) *
      Math.exp(-(((yFit - 0.572) / 0.046) ** 2));
    const outer = T.MathUtils.smoothstep(ax, 0.14, 0.159) * Math.exp(-(((yFit - 0.644) / 0.034) ** 2));
    out.x -= Math.sign(x) * (0.0095 * inner + 0.0035 * outer);
  }
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
        const leg = region === 3 || (isCargo && y < 0.554 && Math.abs(x) > 0.016);
        const arm =
          !isCargo && (region === undefined ? Math.abs(x) > 0.103 && y < 0.67 : region === 1 || region === 2);
        gradePoint(x, y, z, leg, p, arm, true);
        const overheadMorph = g.userData.raisedSleeveMorph + (x < 0 ? 1 : 0);
        for (let k = 0; k < morphs.length; k++) {
          const m = morphs[k];
          // The deltoid rolls up over the clavicle on an overhead reach.
          // Unfold the restful shoulder drape onto its elevated yoke frame.
          const relaxedCut = k !== overheadMorph || y < 0.64;
          gradePoint(x + m.getX(i), y + m.getY(i), z + m.getZ(i), leg, q, arm, true, relaxedCut);
          q.sub(p);
          m.setXYZ(i, q.x, q.y, q.z);
        }
        if (mesh === patterns[1] && !g.userData.chestAnchors?.has(i)) {
          // The breast panels follow the hoodie at the rib cage above the sewn waist.
          const breast =
            T.MathUtils.smoothstep(p.z, 0.019, 0.065) *
            (1 - T.MathUtils.smoothstep(Math.abs(p.x), 0.067, 0.102)) *
            (1 - T.MathUtils.smoothstep(p.y, 0.651, 0.713));
          p.z -= 0.0045 * breast;
          // Round the inward wall of the underarm gusset. A straight offset
          // of the chest pattern cuts across the biceps at its narrowest.
          const medial =
            T.MathUtils.smoothstep(Math.abs(x), 0.08, 0.101) *
            (1 - T.MathUtils.smoothstep(Math.abs(x), 0.121, 0.138)) *
            (1 - T.MathUtils.smoothstep(Math.abs(z), 0.011, 0.04)) *
            T.MathUtils.smoothstep(y, 0.633, 0.656) *
            (1 - T.MathUtils.smoothstep(y, 0.701, 0.747));
          p.x -= Math.sign(x) * 0.0125 * medial;
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
          p.y += 0.04 * neck;
          p.z -= 0.004 * neck;
          p.x *= 1 - 0.09 * neck;
        }
        if (isCargo && leg) {
          // Give the trouser inseam more ease than the outside seam while
          // preserving the previously cut sagittal profile of the calf.
          const side = Math.sign(x);
          const crossLeg = x - side * 0.065;
          const ease = T.MathUtils.smoothstep(y, 0.117, 0.178) * (1 - T.MathUtils.smoothstep(y, 0.35, 0.408));
          const flank = T.MathUtils.smoothstep(Math.abs(crossLeg), 0.004, 0.028);
          p.x += ease * flank * (0.0044 * Math.sign(crossLeg) - 0.0012 * side);
          const kneeToThigh =
            T.MathUtils.smoothstep(y, 0.193, 0.258) * (1 - T.MathUtils.smoothstep(y, 0.402, 0.459));
          p.x -= side * 0.0039 * kneeToThigh * T.MathUtils.smoothstep(Math.abs(x), 0, 0.025);
          const upperHip =
            T.MathUtils.smoothstep(y, 0.43, 0.484) * (1 - T.MathUtils.smoothstep(y, 0.519, 0.551));
          p.x -= side * 0.012 * upperHip * T.MathUtils.smoothstep(Math.abs(x), 0.073, 0.112);
          const thigh = T.MathUtils.smoothstep(y, 0.29, 0.351) * (1 - T.MathUtils.smoothstep(y, 0.405, 0.48));
          const backward =
            T.MathUtils.smoothstep(y, 0.355, 0.42) * (1 - T.MathUtils.smoothstep(y, 0.491, 0.526));
          p.z += thigh * (0.085 * z - 0.0015) - 0.0045 * backward;
          // Leave a little extra cloth in the bend behind the patella.
          const behindKnee =
            T.MathUtils.smoothstep(y, 0.23, 0.266) * (1 - T.MathUtils.smoothstep(y, 0.285, 0.33));
          p.z -= behindKnee * (1 - T.MathUtils.smoothstep(z, -0.014, 0.008)) * 0.0045;
        }
        if (isCargo) {
          // The joggers gather at the waist and carry more ease over the
          // seat than along the soft front panel beneath the darts.
          const rise = T.MathUtils.smoothstep(p.y, 0.479, 0.504) * (1 - T.MathUtils.smoothstep(p.y, 0.530, 0.557));
          p.z += rise * (0.005 * T.MathUtils.smoothstep(p.z, 0.010, 0.041) -
            0.008 * (1 - T.MathUtils.smoothstep(p.z, -0.043, -0.014)));
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
        nail.position.x *= 0.87 * f.torsoX;
        nail.position.y *= 0.761;
        nail.position.z *= f.torsoZ;
        nail.scale.multiply(new T.Vector3(0.87 * f.torsoX, 0.86, f.torsoZ));
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
