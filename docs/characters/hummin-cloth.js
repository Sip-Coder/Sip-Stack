// The moving apron and its connected belt track the actual articulated chassis.
import * as T from 'three';

const { lerp, clamp, smoothstep } = T.MathUtils;

export function fitMovingApron(rig, apron, { mounts, beltFace, buckle }) {
  const { formedChest, moving, bibNode, strapNode, flaps } = apron;
  const hipProfile = [
    [-0.034, 0.048],
    [-0.019, 0.081],
    [0.015, 0.084],
    [0.045, 0.072],
    [0.061, 0.063],
  ].map(([h, r]) => [h, r * 1.28, r * 0.68 * 1.23 * (1 + 0.21 * smoothstep(h, 0.025, 0.051)), 0]);
  const legProfile = [
    [-0.216, 0.039],
    [-0.206, 0.049],
    [-0.151, 0.061],
    [-0.092, 0.064],
    [-0.052, 0.062],
    [-0.036, 0.049],
  ].map(([h, r]) => [h, r * 0.88, r * 0.88, -0.01]);
  const bodies = [
    [rig.chest, formedChest, 0],
    [rig.hips, hipProfile, 0],
    [rig.thighL, legProfile, 0.004],
    [rig.thighR, legProfile, -0.004],
  ];
  const beltTurn = new T.Quaternion();
  const point = new T.Vector3(),
    back = new T.Vector3(),
    forward = new T.Vector3();
  function pushOut(p, profile, cx, pad) {
    const y = p.y;
    if (y < profile[0][0] - pad || y > profile.at(-1)[0] + pad) return false;
    let i = 1;
    while (i < profile.length - 1 && y > profile[i][0]) i++;
    const a = profile[i - 1],
      b = profile[i],
      t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const rx = lerp(a[1], b[1], t) + pad,
      rz = lerp(a[2], b[2], t) + pad,
      origin = lerp(a[3], b[3], t);
    const u = (p.x - cx) / rx;
    if (Math.abs(u) >= 1) return false;
    const target = origin + Math.sqrt(1 - u * u) * rz + pad;
    if (p.z >= target) return false;
    p.z = target;
    return true;
  }
  // At the two side gores the warp wraps around the thigh. Slide outward
  // along the local transverse axis there, preserving the turned-back edge.
  function pushSide(p, profile, cx, pad, sign) {
    const y = p.y;
    if (y < profile[0][0] - pad || y > profile.at(-1)[0] + pad) return false;
    let i = 1;
    while (i < profile.length - 1 && y > profile[i][0]) i++;
    const a = profile[i - 1],
      b = profile[i],
      t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const u = (p.z - lerp(a[3], b[3], t)) / (lerp(a[2], b[2], t) + pad);
    if (Math.abs(u) >= 1) return false;
    const mark = cx + sign * (lerp(a[1], b[1], t) + pad) * Math.sqrt(1 - u * u);
    if (sign * (p.x - mark) >= 0) return false;
    p.x = mark;
    return true;
  }
  function prepareWrinkles() {
    for (const fabric of moving) {
      fabric.rest = fabric.mesh.geometry.attributes.position.array.slice();
      if (fabric.pattern) {
        // Unfold the resting garment along its original sewn stations. Both
        // plies travel together, retaining the leather gauge at each edge.
        const rest = fabric.rest, half = rest.length / 2;
        for (let k = 0; k < half; k += 3) {
          const i = k / 3, point = fabric.pattern((i % 43) / 42, Math.floor(i / 43) / 23);
          rest[half + k] += point.x - rest[k];
          rest[half + k + 1] += point.y - rest[k + 1];
          rest[half + k + 2] += point.z - rest[k + 2];
          rest[k] = point.x;
          rest[k + 1] = point.y;
          rest[k + 2] = point.z;
        }
      }
      fabric.wrinkle = new Float32Array(fabric.rest.length / 6);
      for (let i = 0; i < fabric.wrinkle.length; i++) {
        const x = fabric.rest[3 * i],
          y = fabric.rest[3 * i + 1];
        fabric.wrinkle[i] =
          Math.sin(Math.PI * clamp((-y + 0.006) / 0.145, 0, 1)) ** 2 *
          Math.sin(100 * y + fabric.sign * 46 * x);
      }
      fabric.colliders = bodies.map(([joint, profile, cx]) => ({
        joint,
        profile,
        cx,
        toBody: new T.Matrix4(),
        toMesh: new T.Matrix4(),
      }));
    }
  }
  // Reuse the existing buffers during fixed-step cloth updates. Accumulating
  // area-weighted triangle normals preserves the cut-edge and pocket highlights.
  function updateNormals(geometry) {
    const indices = geometry.index.array,
      p = geometry.attributes.position.array,
      attr = geometry.attributes.normal,
      n = attr.array;
    n.fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const a = 3 * indices[i],
        b = 3 * indices[i + 1],
        c = 3 * indices[i + 2];
      const ux = p[b] - p[a],
        uy = p[b + 1] - p[a + 1],
        uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a],
        vy = p[c + 1] - p[a + 1],
        vz = p[c + 2] - p[a + 2];
      const x = uy * vz - uz * vy,
        y = uz * vx - ux * vz,
        z = ux * vy - uy * vx;
      n[a] += x;
      n[a + 1] += y;
      n[a + 2] += z;
      n[b] += x;
      n[b + 1] += y;
      n[b + 2] += z;
      n[c] += x;
      n[c + 1] += y;
      n[c + 2] += z;
    }
    for (let i = 0; i < n.length; i += 3) {
      const d = Math.sqrt(n[i] ** 2 + n[i + 1] ** 2 + n[i + 2] ** 2) || 1;
      n[i] /= d;
      n[i + 1] /= d;
      n[i + 2] /= d;
    }
    attr.needsUpdate = true;
  }
  function crease(frame) {
    const bend = Math.min(0.0075, Math.abs(rig.chest.rotation.x) * 0.008 + Math.abs(frame.turn) * 0.0006);
    // Compression shortens the bib from its fixed shoulder fasteners. Pockets,
    // tools and saddle stitching stay on the same reinforced piece of leather.
    const knee = Math.max(-rig.thighL.rotation.x, -rig.thighR.rotation.x);
    const compression = smoothstep(knee + Math.max(0, rig.chest.rotation.x) * 0.57, 0.47, 1.72);
    const bow = smoothstep(rig.chest.rotation.x, 0.12, 0.38);
    const bowRelease = frame.emote >= 0 ? bow : 0;
    const bank = smoothstep(Math.abs(frame.turn), 0.55, 2.0);
    const poseFlex = Math.max(
      knee,
      Math.abs(rig.chest.rotation.y) * 2.4,
      Math.abs(rig.chest.rotation.x) * 2,
      Math.abs(frame.turn),
      Math.max(0, frame.emote) * 4,
      Math.min(1, frame.speed / 2),
    );
    const wrapped = 1 - smoothstep(poseFlex, 0.12, 0.48);
    const dartOpening = 0.032 * bowRelease + 0.045 * bank + 0.018 * smoothstep(knee, 0.84, 1.4);
    const gather = Math.min(0.72, 0.64 * compression + 0.2 * bow);
    bibNode.scale.y = 1 - gather;
    bibNode.position.y = 0.067 * gather;
    const greeting = frame.emote >= 0 ? 0.0075 * Math.sin(Math.PI * frame.emote) ** 2 : 0;
    bibNode.position.z = 0.029 * gather + 0.024 * bowRelease + greeting;
    strapNode.scale.z = 1 + 0.27 * gather + 12 * greeting;
    strapNode.position.z = 0.0091 * gather + 0.29 * greeting;
    // The split skirt swings from the waist. Its roots track the shaped bib
    // hem as it gathers; the free leather resists some of the torso twist.
    rig.chest.updateMatrix();
    beltTurn.identity().slerp(rig.chest.quaternion, 0.94);
    for (let i = 0; i < flaps.length; i++) {
      const flap = flaps[i];
      flap.position
        .set(0, -0.077 + 0.065 * gather, 0.088 + 0.007 * (1 - wrapped) + 0.023 * bowRelease)
        .applyMatrix4(rig.chest.matrix);
      flap.quaternion.premultiply(beltTurn);
    }

    rig.root.updateWorldMatrix(true, true);
    for (const fabric of moving) {
      const { mesh, rest, type, colliders } = fabric;
      const p = mesh.geometry.attributes.position,
        half = p.count / 2;
      for (const c of colliders) {
        c.toBody.copy(c.joint.matrixWorld).invert().multiply(mesh.matrixWorld);
        c.toMesh.copy(c.toBody).invert();
      }
      const pad = type === 'towel' ? 0.018 : 0.0072;
      for (let i = 0; i < half; i++) {
        const k = i * 3,
          x = rest[k],
          y = rest[k + 1],
          z = rest[k + 2];
        const fold = bend * fabric.wrinkle[i];
        // The side darts open over a twisting pelvis and a bow. Their
        // leverage grows towards the free outer selvage, leaving the center
        // of the bib and the neutral cut fixed.
        const outer = clamp((Math.abs(x) - 0.017) / 0.087, 0, 1);
        const release = type === 'flap' ? outer * outer * smoothstep(y, -0.13, -0.065) * dartOpening : 0;
        const wrappedZ =
          type === 'flap' ? lerp(0.009 - 0.044 * (x / 0.112) ** 2 + 0.19 * y, z, wrapped) : z;
        // The free corners slide around a tucked knee instead of climbing
        // straight over its hinge. The reinforced waistband stays on its cut.
        const hemRelease =
          type === 'flap' && frame.state === 'roll'
            ? 0.07 *
              smoothstep(knee, 0.65, 1.36) *
              smoothstep(-y, 0.1, 0.16) *
              smoothstep(Math.abs(x), 0.068, 0.098)
            : 0;
        forward.set(x + Math.sign(x) * hemRelease, y, wrappedZ + fold + release);
        for (let body = 0; body < colliders.length; body++) {
          const c = colliders[body];
          point.copy(forward).applyMatrix4(c.toBody);
          const side = type === 'flap' && wrapped > 0.93 && Math.abs((i % 43) - 21) > 15;
          if (side && body > 1 && i % 43 > 21 !== (body === 2)) continue;
          const moved = side
            ? pushSide(
                point,
                c.profile,
                c.cx,
                0.0048 + 0.009 * smoothstep(point.y, -0.079, -0.035),
                Math.sign(x),
              )
            : pushOut(point, c.profile, c.cx, pad);
          if (moved) forward.copy(point).applyMatrix4(c.toMesh);
        }
        // Move both grains together. The cut edge retains its physical gauge.
        const j = (i + half) * 3;
        back.set(rest[j] - x, rest[j + 1] - y, rest[j + 2] - z).add(forward);
        p.setXYZ(i, forward.x, forward.y, forward.z);
        p.setXYZ(i + half, back.x, back.y, back.z);
      }
      p.needsUpdate = true;
      updateNormals(mesh.geometry);
      mesh.geometry.computeBoundingSphere();
    }
  }
  const pos = apron.panel.geometry.attributes.position;
  const field = beltFace.geometry.attributes.position;
  const tangent = new T.Vector3(),
    base = new T.Vector3();
  function placeGear() {
    // The band shares the skirt's exact fabric stations and follows their
    // collision displacement. Offset radially, including around the hips.
    for (let i = 0; i < field.count; i++) {
      const row = (Math.floor(i / 31) % 5) + 3,
        col = (i % 31) + 6,
        source = row * 43 + col;
      const angle = (col / 21 - 1) * 1.18,
        gauge = i < 155 ? 0.014 : 0.0124;
      field.setXYZ(
        i,
        pos.getX(source) + gauge * Math.sin(angle),
        pos.getY(source),
        pos.getZ(source) + gauge * Math.cos(angle),
      );
    }
    field.needsUpdate = true;
    updateNormals(beltFace.geometry);
    beltFace.geometry.computeBoundingSphere();
    const tuck = T.MathUtils.smoothstep(Math.max(-rig.thighL.rotation.x, -rig.thighR.rotation.x), 0.6, 1.3);
    for (const a of mounts) {
      const k = 5 * 43 + a.cell;
      base.fromBufferAttribute(pos, k);
      tangent.fromBufferAttribute(pos, k + 1).sub(base);
      const tilt = Math.atan2(-tangent.z, tangent.x) * 0.5;
      const slope = Math.tan(tilt);
      const cx = base.x,
        cy = base.y + 0.001 + 0.014 * tuck;
      let support = base.z + 0.009;
      for (let row = 1; row < 20; row++)
        for (let col = Math.max(0, a.cell - 7); col <= Math.min(42, a.cell + 7); col++) {
          const i = row * 43 + col,
            dx = pos.getX(i) - cx,
            dy = pos.getY(i) - cy;
          if (Math.abs(dx) < 0.034 && dy < 0.012 && dy > -0.065)
            support = Math.max(support, pos.getZ(i) + slope * dx + 0.008);
        }
      a.frame.position.set(cx, cy, support + 0.008 + 0.01 * tuck);
      a.frame.scale.y = 1 - 0.32 * tuck;
      a.frame.rotation.y = tilt;
    }
    const mid = 2 * 31 + 15;
    buckle.position.set(field.getX(mid), field.getY(mid), field.getZ(mid) + 0.002);
  }
  prepareWrinkles();
  return frame => {
    crease(frame);
    placeGear();
  };
}
