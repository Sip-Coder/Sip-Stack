// Calfskin shoulder strap and turned lower garment edges, in the same pose as the cloth.
import * as T from 'three';
import { detailMaterial } from './material-detail.js';

const section = [
  [-1, -0.38],
  [-0.92, -0.9],
  [0.92, -0.9],
  [1, -0.38],
  [1, 0.38],
  [0.92, 0.9],
  [-0.92, 0.9],
  [-1, 0.38],
];

// The strap's cross section maps its two broad faces to 1/8 and 5/8 of
// the UV strip. Two waxed saddle-stitch rows run just inside their edges.
function saddleStitch(leather) {
  const width = 256,
    height = 32,
    rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width,
        v = (y + 0.5) / height;
      const face = u >= 0.625 && u <= 0.75 ? 0.625 : 0.125;
      const seam = Math.min(Math.abs(u - face - 0.013), Math.abs(u - face - 0.112));
      const thread = Math.max(0, 1 - (seam / 0.0045) ** 2 - ((v - 0.45) / 0.32) ** 2);
      const at = 4 * (y * width + x);
      rgba[at] = 101 + 86 * thread;
      rgba[at + 1] = 67 + 64 * thread;
      rgba[at + 2] = 53 + 49 * thread;
      rgba[at + 3] = 255;
    }
  const tile = new T.DataTexture(rgba, width, height);
  tile.colorSpace = T.SRGBColorSpace;
  tile.wrapT = T.RepeatWrapping;
  tile.repeat.y = 152;
  tile.magFilter = T.LinearFilter;
  tile.minFilter = T.LinearMipmapLinearFilter;
  tile.generateMipmaps = true;
  tile.needsUpdate = true;
  const result = new T.MeshStandardMaterial({ color: 0xffffff, roughness: leather.roughness, map: tile });
  return detailMaterial(result, 'leather');
}

function stripGeometry(rows, columns, wrap, closeCrossSection = true) {
  const index = [],
    uv = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      uv.push(col / (wrap ? columns : columns - 1), row / (rows - 1));
      if (row === rows - 1 || (!wrap && col === columns - 1)) continue;
      const a = row * columns + col,
        b = row * columns + ((col + 1) % columns);
      index.push(a, b, a + columns, a + columns, b, b + columns);
    }
  }
  if (closeCrossSection && wrap) {
    for (let col = 1; col < columns - 1; col++) {
      index.push(0, col + 1, col);
      const last = (rows - 1) * columns;
      index.push(last, last + col, last + col + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute(
    'position',
    new T.BufferAttribute(new Float32Array(rows * columns * 3), 3).setUsage(T.DynamicDrawUsage),
  );
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

// Keep the normal accumulator on the mesh; these narrow pieces deform at
// fixed-step rate even when two rendering frames share the same simulation.
function refreshNormals(geometry) {
  const p = geometry.attributes.position.array,
    indices = geometry.index.array;
  if (!geometry.attributes.normal)
    geometry.setAttribute(
      'normal',
      new T.BufferAttribute(new Float32Array(p.length), 3).setUsage(T.DynamicDrawUsage),
    );
  const n = geometry.attributes.normal.array;
  n.fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    for (let j = i; j < i + 3; j++) {
      const k = indices[j] * 3;
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  for (let k = 0; k < n.length; k += 3) {
    const x = n[k],
      y = n[k + 1],
      z = n[k + 2],
      inverse = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    n[k] *= inverse;
    n[k + 1] *= inverse;
    n[k + 2] *= inverse;
  }
  geometry.attributes.normal.needsUpdate = true;
}

function mesh(parent, geometry, material, name) {
  const result = new T.Mesh(geometry, material);
  result.name = name;
  result.castShadow = result.receiveShadow = true;
  result.frustumCulled = false;
  parent.add(result);
  return result;
}

function turnedHem(cloth, count, closed, material, name) {
  const geometry = stripGeometry(4, count, closed, false);
  const edge = mesh(cloth, geometry, material, name);
  const p = geometry.attributes.position,
    source = cloth.geometry.attributes.position;
  const a = new T.Vector3(),
    along = new T.Vector3(),
    inward = new T.Vector3();
  const radial = new T.Vector3(),
    direction = new T.Vector3();
  // The folded edge shares the outer sewing line and turns under the cloth.
  const fold = [
    [0, 0],
    [-0.0011, -0.00025],
    [-0.0018, -0.0011],
    [0.0017, -0.0017],
  ];
  function update() {
    for (let col = 0; col < count; col++) {
      a.fromBufferAttribute(source, col);
      along
        .fromBufferAttribute(source, count + col)
        .sub(a)
        .normalize();
      direction.fromBufferAttribute(source, (col + 1) % count).sub(a);
      if (!closed && col === count - 1)
        direction
          .fromBufferAttribute(source, col - 1)
          .sub(a)
          .negate();
      inward.crossVectors(direction, along).normalize();
      radial.set(a.x, 0, a.z);
      if (inward.dot(radial) < 0) inward.negate();
      for (let row = 0; row < fold.length; row++) {
        const [d, n] = fold[row];
        p.setXYZ(
          row * count + col,
          a.x + d * along.x + n * inward.x,
          a.y + d * along.y + n * inward.y,
          a.z + d * along.z + n * inward.z,
        );
      }
    }
    p.needsUpdate = true;
    refreshNormals(geometry);
  }
  update();
  return { edge, update };
}

// Cross-sections of the animated skirt in hip space. For each jacket vertex,
// intersect its radial plane with the actual skirt triangles and take the
// outermost piece of fabric at that height. A small interval also protects
// the span between adjacent jacket vertices when the knees lift the skirt.
function radialEnvelope(garment) {
  const positions = garment.geometry.attributes.position,
    index = garment.geometry.index.array;
  // Retain the slice storage across poses, including deep folds where one
  // azimuth can cut the same cloth ring more than once.
  const bins = Array.from({ length: 64 }, () => new Float32Array(256));
  const used = new Uint32Array(bins.length);
  const vec = new T.Vector3();
  const angles = new Float32Array(positions.count);
  const heights = new Float32Array(positions.count);
  const tau = Math.PI * 2;
  const angleScale = bins.length / tau;
  const tanX = Array.from({ length: 64 }, (_, i) => Math.sin(i / angleScale));
  const tanZ = Array.from({ length: 64 }, (_, i) => Math.cos(i / angleScale));
  function refresh() {
    used.fill(0);
    for (let i = 0; i < positions.count; i++) {
      vec.fromBufferAttribute(positions, i);
      angles[i] = (Math.atan2(vec.x, vec.z) + tau) % tau;
      heights[i] = vec.y;
    }
    for (let tri = 0; tri < index.length; tri += 3) {
      const a = index[tri],
        b = index[tri + 1],
        c = index[tri + 2];
      const base = angles[a];
      // Unwrap the two neighbouring angles with respect to this vertex.
      let second = angles[b],
        third = angles[c];
      if (second - base > Math.PI) second -= tau;
      else if (second - base < -Math.PI) second += tau;
      if (third - base > Math.PI) third -= tau;
      else if (third - base < -Math.PI) third += tau;
      const lo = Math.min(base, second, third),
        hi = Math.max(base, second, third);
      for (let k = Math.ceil(lo * angleScale); k <= Math.floor(hi * angleScale); k++) {
        const slot = (k + bins.length) % bins.length;
        let r0 = 0,
          h0 = 0,
          r1 = 0,
          h1 = 0,
          n = 0;
        for (let edge = 0; edge < 3; edge++) {
          const i = index[tri + edge],
            j = index[tri + ((edge + 1) % 3)];
          const ix = positions.getX(i),
            iz = positions.getZ(i),
            jx = positions.getX(j),
            jz = positions.getZ(j);
          const left = ix * tanZ[slot] - iz * tanX[slot],
            right = jx * tanZ[slot] - jz * tanX[slot];
          if (left < 0 === right < 0 || left === right) continue;
          const t = left / (left - right),
            r = (ix + (jx - ix) * t) * tanX[slot] + (iz + (jz - iz) * t) * tanZ[slot];
          if (r < 0) continue;
          const h = heights[i] + (heights[j] - heights[i]) * t;
          if (n++ === 0) {
            r0 = r;
            h0 = h;
          } else {
            r1 = r;
            h1 = h;
          }
        }
        if (n === 2) {
          const head = used[slot];
          if (head + 4 > bins[slot].length) {
            const more = new Float32Array(bins[slot].length * 2);
            more.set(bins[slot]);
            bins[slot] = more;
          }
          const bin = bins[slot];
          bin[head] = h0;
          bin[head + 1] = r0;
          bin[head + 2] = h1;
          bin[head + 3] = r1;
          used[slot] = head + 4;
        }
      }
    }
  }
  function radius(y, angle, margin) {
    let result = 0;
    const slot = Math.round(((angle + tau) % tau) * angleScale) % bins.length;
    for (let neighbour = -1; neighbour <= 1; neighbour++) {
      const neighbourSlot = (slot + neighbour + bins.length) % bins.length;
      const bin = bins[neighbourSlot];
      for (let i = 0; i < used[neighbourSlot]; i += 4) {
        const y0 = bin[i],
          y1 = bin[i + 2],
          a = bin[i + 1],
          b = bin[i + 3];
        if (y + margin < Math.min(y0, y1) || y - margin > Math.max(y0, y1)) continue;
        const edgeY = (b - a) * (y1 - y0) > 0 ? y + margin : y - margin;
        const mix = T.MathUtils.clamp((edgeY - y0) / (y1 - y0 || 0.00001), 0, 1);
        result = Math.max(result, a + mix * (b - a));
      }
    }
    return result;
  }
  return { refresh, radius };
}

export function fitRomaAccessories(rig, bag, skirt, jacket, leather, lining, silk) {
  const envelope = radialEnvelope(skirt);
  const jacketEnvelope = radialEnvelope(jacket);
  const chestToJacket = new T.Matrix4(),
    jacketToChest = new T.Matrix4();
  const jacketToHips = new T.Matrix4(),
    hipsToJacket = new T.Matrix4();
  const shellPoint = new T.Vector3();
  const jacketPosition = jacket.geometry.attributes.position;
  const rowCount = Math.min(4, Math.floor(jacketPosition.count / 41));
  const freePosition = new Float32Array(rowCount * 41 * 3);
  const lowerPositions = jacketPosition.array.subarray(0, freePosition.length);
  const bagSupportHeights = [-0.067, -0.039, -0.015];
  function release() {
    jacketPosition.array.set(freePosition);
  }
  const frontClasp = new T.Vector3(),
    backClasp = new T.Vector3();
  const waypoints = Array.from({ length: 15 }, () => new T.Vector3());
  const path = new T.CatmullRomCurve3(waypoints);
  const samples = 49;
  const geometry = stripGeometry(samples, section.length, true);
  const strap = mesh(rig.chest, geometry, saddleStitch(leather), 'Roma stitched saddle strap');
  const hem = turnedHem(skirt, 64, true, silk, 'Roma turned dress hem');
  const jacketHem = turnedHem(jacket, 41, false, lining, 'Roma jacket hem facing');
  const positions = geometry.attributes.position;
  const chestToHips = new T.Matrix4(),
    hipsToChest = new T.Matrix4();
  const centers = Array.from({ length: samples }, () => new T.Vector3());
  const tangent = new T.Vector3(),
    side = new T.Vector3(),
    normal = new T.Vector3(),
    v = new T.Vector3();
  const inv = new T.Matrix4(),
    axis = new T.Vector3();
  const arm = Array.from({ length: 4 }, () => new T.Vector3());
  const sleeveRadius = [0.043, 0.038, 0.029];
  const nearest = new T.Vector3(),
    limb = new T.Vector3(),
    away = new T.Vector3();
  function avoidSleeve(center) {
    for (let i = 0; i < sleeveRadius.length; i++) {
      limb.subVectors(arm[i + 1], arm[i]);
      const t = T.MathUtils.clamp(
        away.subVectors(center, arm[i]).dot(limb) / Math.max(0.0001, limb.lengthSq()),
        0,
        1,
      );
      nearest.copy(arm[i]).addScaledVector(limb, t);
      away.subVectors(center, nearest);
      const d = away.length();
      if (d < sleeveRadius[i] && d > 0.0001) center.addScaledVector(away, (sleeveRadius[i] - d) / d);
    }
  }
  function update() {
    jacket.updateWorldMatrix(true, false);
    rig.hips.updateWorldMatrix(true, false);
    jacketToHips.copy(rig.hips.matrixWorld).invert().multiply(jacket.matrixWorld);
    hipsToJacket.copy(jacketToHips).invert();
    envelope.refresh();
    // The waist belt and the skirt move with the pelvis. Fit the lower jacket
    // to their posed cross-sections, so its weighted hem can pass over either.
    freePosition.set(lowerPositions);
    let coatMoved = false;
    for (let i = 0; i < rowCount * 41; i++) {
      shellPoint.fromBufferAttribute(jacketPosition, i).applyMatrix4(jacketToHips);
      const a = Math.atan2(shellPoint.x, shellPoint.z),
        r = Math.hypot(shellPoint.x, shellPoint.z);
      const beltRadius = 1 / Math.hypot(Math.sin(a) / 0.098, Math.cos(a) / 0.075);
      const skirtRadius = envelope.radius(shellPoint.y, a, 0.012);
      const outside = Math.max(
        skirtRadius + 0.007,
        Math.abs(shellPoint.y - 0.07) < 0.037 ? beltRadius + 0.006 : 0,
      );
      if (r < outside && r > 0.001) {
        shellPoint.x *= outside / r;
        shellPoint.z *= outside / r;
        shellPoint.applyMatrix4(hipsToJacket);
        jacketPosition.setXYZ(i, shellPoint.x, shellPoint.y, shellPoint.z);
        coatMoved = true;
      }
    }
    jacketPosition.needsUpdate = true;
    if (coatMoved) refreshNormals(jacket.geometry);
    jacketEnvelope.refresh();
    chestToJacket.copy(jacket.matrixWorld).invert().multiply(rig.chest.matrixWorld);
    jacketToChest.copy(chestToJacket).invert();
    // The pouch rests against the back of the hip. Lift it away only when the
    // moving skirt actually fills that space, keeping the load under its strap.
    const bagAngle = Math.atan2(-0.128, -0.085);
    let bagRadius = Math.hypot(0.128, 0.085);
    for (const dy of bagSupportHeights) {
      bagRadius = Math.max(bagRadius, envelope.radius(bag.position.y + dy, bagAngle, 0.012) + 0.046);
    }
    bag.position.x = bagRadius * Math.sin(bagAngle);
    bag.position.z = bagRadius * Math.cos(bagAngle);
    bag.updateWorldMatrix(true, false);
    inv.copy(rig.chest.matrixWorld).invert();
    // Both strap ends stay in the real brass rings as the bag swings.
    frontClasp.set(0, 0.004, 0.041).applyMatrix4(bag.matrixWorld).applyMatrix4(inv);
    backClasp.set(0, 0.004, -0.041).applyMatrix4(bag.matrixWorld).applyMatrix4(inv);
    waypoints[0].copy(frontClasp);
    waypoints[2].set(-0.089, -0.038, 0.056);
    waypoints[1].lerpVectors(frontClasp, waypoints[2], 0.48);
    waypoints[1].x -= 0.009;
    waypoints[3].set(-0.055, -0.004, 0.064);
    waypoints[4].set(0.003, 0.059, 0.08);
    waypoints[5].set(0.041, 0.11, 0.079);
    waypoints[6].set(0.058, 0.154, 0.065);
    waypoints[7].set(0.059, 0.174, 0.025);
    waypoints[8].set(0.059, 0.175, -0.014);
    waypoints[9].set(0.052, 0.156, -0.057);
    waypoints[10].set(0.018, 0.084, -0.098);
    waypoints[11].set(-0.045, 0.018, -0.111);
    waypoints[12].set(-0.09, -0.034, -0.101);
    waypoints[13].lerpVectors(backClasp, waypoints[12], 0.46);
    waypoints[14].copy(backClasp);
    chestToHips.copy(rig.hips.matrixWorld).invert().multiply(rig.chest.matrixWorld);
    hipsToChest.copy(chestToHips).invert();
    rig.upperArmR.getWorldPosition(arm[0]).applyMatrix4(inv);
    rig.forearmR.getWorldPosition(arm[1]).applyMatrix4(inv);
    rig.handR.getWorldPosition(arm[2]).applyMatrix4(inv);
    arm[3].set(0, -0.067, 0.004).applyMatrix4(rig.handR.matrixWorld).applyMatrix4(inv);
    for (let row = 0; row < samples; row++) {
      const center = path.getPoint(row / (samples - 1), centers[row]);
      if (center.y > 0.032 || row === 0 || row === samples - 1) continue;
      v.copy(center).applyMatrix4(chestToHips);
      const a = Math.atan2(v.x, v.z),
        r = Math.hypot(v.x, v.z);
      const outside = envelope.radius(v.y, a, 0.015) + 0.012;
      if (r < outside && r > 0.001) {
        v.x *= outside / r;
        v.z *= outside / r;
        center.copy(v).applyMatrix4(hipsToChest);
      }
      v.copy(center).applyMatrix4(chestToJacket);
      const jacketAngle = Math.atan2(v.x, v.z),
        jacketRadius = Math.hypot(v.x, v.z);
      const coatClearance = jacketEnvelope.radius(v.y, jacketAngle, 0.012) + 0.009;
      if (jacketRadius < coatClearance && jacketRadius > 0.001) {
        v.x *= coatClearance / jacketRadius;
        v.z *= coatClearance / jacketRadius;
        center.copy(v).applyMatrix4(jacketToChest);
      }
      avoidSleeve(center);
    }
    for (let row = 0; row < samples; row++) {
      const center = centers[row];
      tangent
        .copy(centers[Math.min(row + 1, samples - 1)])
        .sub(centers[Math.max(0, row - 1)])
        .normalize();
      // Gradually rotate the flat strap over the crown of the shoulder.
      normal.set(center.x * 0.35, Math.max(0, (center.y - 0.118) * 2.1), center.z).normalize();
      side.crossVectors(tangent, normal).normalize();
      normal.crossVectors(side, tangent).normalize();
      for (let col = 0; col < section.length; col++) {
        const [w, d] = section[col];
        axis
          .copy(center)
          .addScaledVector(side, w * 0.0053)
          .addScaledVector(normal, d * 0.00125);
        positions.setXYZ(row * section.length + col, axis.x, axis.y, axis.z);
      }
    }
    positions.needsUpdate = true;
    refreshNormals(geometry);
    hem.update();
    jacketHem.update();
  }
  update();
  return { strap, hem: hem.edge, jacketHem: jacketHem.edge, release, update };
}
