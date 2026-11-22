// Coordinates in the anatomical frames below are metres. Use the joint's
// rotation without its costume scaling, so an endplate angle stays an angle.
import * as T from 'three';
import { lerp, local, tau, v } from './diagram-fabricator.js';

const inch = 0.0254,
  radians = Math.PI / 180;
function frame(origin, q) {
  q.normalize();
  const inverse = q.clone().invert();
  return {
    point: (x, y, z) => v(x, y, z).applyQuaternion(q).add(origin),
    direction: (x, y, z) => v(x, y, z).applyQuaternion(q),
    from: (p) => p.clone().sub(origin).applyQuaternion(inverse),
  };
}

// Intersect the actual posed torso at horizontal stations. A nearest positive
// radial crossing ignores the arm beyond the intervening gap on Sippy.
export function skinGauge(parts, chest, low, high, rings = 29, rays = 24) {
  const p = parts.find(
    (p) => p.name === 'Continuous body, limbs and hands' || p.name === 'Covered torso and hips',
  );
  if (!p) throw new Error('Build the covered and live skin surfaces before fitting the rib cage');
  const g = p.mesh.geometry,
    a = g.attributes.position,
    ix = g.index;
  const pos = new Float32Array(3 * a.count),
    point = v();
  for (let i = 0; i < a.count; i++) chest.from(point.fromBufferAttribute(a, i)).toArray(pos, 3 * i);
  const rows = Array.from({ length: rings }, () => new Float32Array(rays).fill(Infinity));
  const ss = Array.from({ length: rays }, (_, i) => Math.sin((i * tau) / rays)),
    cs = ss.map((_, i) => Math.cos((i * tau) / rays));
  const step = (high - low) / (rings - 1),
    triCount = ix?.count ?? a.count,
    intersections = new Float64Array(4);
  for (let k = 0; k < triCount; k += 3) {
    const ids = [
      3 * (ix ? ix.getX(k) : k),
      3 * (ix ? ix.getX(k + 1) : k + 1),
      3 * (ix ? ix.getX(k + 2) : k + 2),
    ];
    const y0 = pos[ids[0] + 1],
      y1 = pos[ids[1] + 1],
      y2 = pos[ids[2] + 1];
    const first = Math.max(0, Math.ceil((Math.min(y0, y1, y2) - low) / step));
    const last = Math.min(rings - 1, Math.floor((Math.max(y0, y1, y2) - low) / step));
    for (let r = first; r <= last; r++) {
      const y = low + r * step;
      let found = 0;
      for (let j = 0; j < 3; j++) {
        const i = ids[j],
          n = ids[(j + 1) % 3];
        if (pos[i + 1] > y === pos[n + 1] > y) continue;
        const t = (y - pos[i + 1]) / (pos[n + 1] - pos[i + 1]);
        intersections[found++] = lerp(pos[i], pos[n], t);
        intersections[found++] = lerp(pos[i + 2], pos[n + 2], t);
      }
      if (found !== 4) continue;
      const [ax, az, bx, bz] = intersections;
      for (let d = 0; d < rays; d++) {
        const u = ax * cs[d] - az * ss[d],
          w = bx * cs[d] - bz * ss[d];
        if (u > 0 === w > 0) continue;
        const t = u / (u - w),
          radius = lerp(ax, bx, t) * ss[d] + lerp(az, bz, t) * cs[d];
        if (radius > 0) rows[r][d] = Math.min(rows[r][d], radius);
      }
    }
  }
  return (y, angle) => {
    const s = T.MathUtils.clamp((y - low) / step, 0, rings - 1.00001),
      i = Math.floor(s);
    const t = T.MathUtils.euclideanModulo((angle / tau) * rays, rays),
      j = Math.floor(t),
      next = (j + 1) % rays;
    function row(r) {
      const a = rows[r][j],
        b = rows[r][next];
      if (!Number.isFinite(a) || !Number.isFinite(b)) return Math.min(a, b);
      return lerp(a, b, t - j);
    }
    const a = row(i),
      b = row(i + 1);
    return Number.isFinite(a + b) ? lerp(a, b, s - i) : Math.min(a, b);
  };
}

function sagittalCurve(lower, span, start, end, emphasis = 1) {
  const angles = (t) => lerp(start, end, t ** emphasis),
    samples = [lower.z];
  for (let i = 0; i < 64; i++) samples.push(samples[i] + (span / 64) * Math.tan(angles((i + 0.5) / 64)));
  return {
    angle: angles,
    at(t) {
      const p = T.MathUtils.clamp(t, 0, 1) * 64,
        i = Math.min(63, Math.floor(p));
      return v(lower.x, lower.y + span * t, lerp(samples[i], samples[i + 1], p - i));
    },
  };
}

export function thoraxLandmarks(rig, roma, pelvis, parts, head) {
  const H = rig.height,
    chest = frame(rig.chest.getWorldPosition(v()), rig.chest.getWorldQuaternion(new T.Quaternion()));
  const socketOrigin = pelvis.place(0, 0, 0);
  const axis = (x, y, z) => pelvis.place(x, y, z).sub(socketOrigin).normalize();
  const hips = frame(
    socketOrigin,
    new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(axis(1, 0, 0), axis(0, 1, 0), axis(0, 0, 1)),
    ),
  );
  const s1 = hips.from(pelvis.s1),
    up = hips.direction(0, 1, 0),
    forward = hips.direction(0, 0, 1);
  const sacralTilt = Math.atan2(pelvis.s1Normal.dot(forward), pelvis.s1Normal.dot(up));
  const thorLumbar = sacralTilt - (roma ? 58 : 50) * radians;
  const lumbarSpan = (roma ? 6.5 : 7) * inch;
  const lumbar = sagittalCurve(s1, lumbarSpan, sacralTilt, thorLumbar, roma ? 0.8 : 0.67);
  const chestOffset = rig.chest.position.clone().multiply(rig.hips.getWorldScale(v()));
  const t12 = lumbar.at(1).sub(chestOffset);
  // The lower junction rides S1. The upper junction meets the chest-fixed
  // T12, sharing its displacement over all five intervertebral spaces.
  const shift = hips.from(chest.point(t12.x, t12.y, t12.z)).sub(lumbar.at(1));
  const fittedLumbar = {
    at: (t) => lumbar.at(t).addScaledVector(shift, t * t * (3 - 2 * t)),
    angle: (t) =>
      Math.atan2(
        Math.tan(lumbar.angle(t)) * lumbarSpan + 6 * t * (1 - t) * shift.z,
        lumbarSpan + 6 * t * (1 - t) * shift.y,
      ),
  };
  const shoulder = chest.from(rig.upperArmL.getWorldPosition(v()));
  const t1Height = shoulder.y + 0.005 * H,
    interval = (t1Height - t12.y) / 12;
  // T2 superior and T12 inferior are eleven vertebral intervals apart.
  const thoracic = sagittalCurve(t12, interval * 12, thorLumbar, thorLumbar + (35 * radians * 12) / 11);
  // The column rides the chest; its flexible cervical end articulates under
  // the actual occipital condyles as the wearer bows or tucks the chin.
  const atlas = chest.from(head?.atlas ?? local(rig.chest)(0, roma ? 0.252 : 0.246, roma ? -0.014 : -0.007));
  const t1 = thoracic.at(1),
    neckSpan = atlas.y - t1.y;
  const restAtlas = head?.atlasChestLocal
    ? chest.from(rig.chest.localToWorld(head.atlasChestLocal.clone()))
    : atlas;
  const protraction = roma ? 0 : Math.max(0, atlas.z - restAtlas.z);
  const cervicalAt = (t) => {
    // The resting curve continues the thoracic endplate into the neck.
    // Head protraction distributes forward travel over the lower cervical
    // joints while keeping the atlas beneath the occipital condyles.
    const slope0 = neckSpan * Math.tan(thoracic.angle(1)),
      slope1 = neckSpan * Math.tan(-12 * radians);
    const t2 = t * t,
      t3 = t2 * t;
    return v(
      atlas.x * (3 * t2 - 2 * t3),
      lerp(t1.y, atlas.y, t),
      (2 * t3 - 3 * t2 + 1) * t1.z +
        (t3 - 2 * t2 + t) * slope0 +
        (-2 * t3 + 3 * t2) * atlas.z +
        (t3 - t2) * slope1 +
        (roma ? 0 : 0.21 * inch) * 16 * t2 * (1 - t) * (1 - t) +
        protraction *
          Math.sin(Math.PI * (t + 0.48 * t * (1 - t))) *
          (1.12 + 0.52 * (1 - t) ** 2 + 0.32 * t * t),
    );
  };
  const cervical = {
    at: cervicalAt,
    angle: (t) => {
      const lo = Math.max(0, t - 0.001),
        hi = Math.min(1, t + 0.001);
      return Math.atan2(cervicalAt(hi).z - cervicalAt(lo).z, neckSpan * (hi - lo));
    },
  };
  const spineLevels = new Map();
  function levels(prefix, n, curve, f) {
    for (let j = 0; j < n; j++) {
      const index = n - j,
        name = prefix + index,
        t = (j + 0.5) / n;
      const a = curve.at(t),
        lower = curve.at(j / n),
        upper = curve.at((j + 1) / n);
      const angle = curve.angle(t),
        xi = f.direction(1, 0, 0),
        half = (upper.y - lower.y) * 0.37;
      const point = (x, y, z) => {
        const tilt = lerp(
          curve.angle(j / n),
          curve.angle((j + 1) / n),
          T.MathUtils.clamp(0.5 + y / (2 * half), 0, 1),
        );
        return f.point(a.x + x, a.y + y - z * Math.sin(tilt), a.z + z * Math.cos(tilt));
      };
      const width =
        prefix === 'L'
          ? lerp(0.94, 0.78, (j + 0.5) / n) * inch * (roma ? 0.9 : 1)
          : prefix === 'T'
            ? lerp(0.78, 0.53, (j + 0.5) / n) * inch * (roma ? 0.92 : 1)
            : lerp(0.5, 0.36, (j + 0.5) / n) * inch * (roma ? 0.92 : 1);
      const depth = width * (prefix === 'C' ? 0.62 : prefix === 'T' ? 0.91 : 0.75);
      // Endplate plane inclinations are sampled at the actual superior and
      // inferior rings, indexed on the mesh after tessellation.
      const topTilt = curve.angle((j + 1) / n);
      const bottomTilt = curve.angle(j / n);
      const transverse =
        prefix === 'T'
          ? H * lerp(0.015, 0.021, j / (n - 1))
          : prefix === 'L'
            ? H * (0.015 + 0.005 * Math.sin((Math.PI * j) / (n - 1)))
            : H * 0.011;
      const tail = prefix === 'T' ? H * 0.017 : prefix === 'L' ? H * 0.012 : H * 0.008;
      const spinous = point(0, -half * (prefix === 'T' ? 1.35 : 0.45), -depth * 0.72 - tail);
      spineLevels.set(name, {
        name,
        index,
        prefix,
        frame: f,
        local: a,
        center: f.point(a.x, a.y, a.z),
        point,
        transverse,
        spinous,
        half,
        width,
        depth,
        xi,
        angle,
        superiorNormal: f.direction(0, Math.cos(topTilt), Math.sin(topTilt)),
        inferiorNormal: f.direction(0, Math.cos(bottomTilt), Math.sin(bottomTilt)),
      });
    }
  }
  levels('L', 5, fittedLumbar, hips);
  levels('T', 12, thoracic, chest);
  levels('C', 7, cervical, chest);
  const body = (name) => spineLevels.get(name);
  const localY = (n) => body('T' + n).local.y;
  const notchY = localY(2),
    angleY = (localY(4) + localY(5)) * 0.5;
  const sternLength = (roma ? 5.92 : 6.38) * inch,
    tipY = notchY - sternLength * 0.977;
  const gauge = skinGauge(parts, chest, Math.min(t12.y - 4.5 * interval, tipY) - 0.016, t1Height + 0.008);
  // Posterior processes retain their attachment length up to the wearer’s
  // posterior fascia. This matters particularly at the kyphotic apex when
  // the very shallow Sippy torso flexes over the upper lumbar spine.
  for (const level of spineLevels.values()) {
    if (level.prefix === 'C') continue;
    const tip = chest.from(level.spinous),
      floor = 0.23 * inch - gauge(tip.y, Math.PI);
    if (tip.z < floor) level.spinous = chest.point(tip.x, tip.y, floor);
  }
  const radialScale = roma ? 0.909 : 1,
    clear = 0.69 * inch;
  const sternZ = (y) => {
    const t = T.MathUtils.clamp((notchY - y) / (notchY - tipY), 0, 1);
    return Math.min(
      gauge(y, 0) - clear,
      H * radialScale * (0.022 + 0.012 * Math.sin(Math.PI * t) + 0.004 * t) +
        0.105 * inch * Math.max(0, 1 - Math.abs(y - angleY) / (0.65 * inch)),
    );
  };
  const stern = (x, y, dz = 0) => chest.point(x, y, sternZ(y) + dz);
  const ribs = { L: [], R: [] },
    cartilages = { L: [], R: [] };
  const widths = [0.46, 0.61, 0.74, 0.84, 0.92, 0.98, 1, 0.999, 0.95, 0.86, 0.74, 0.57];
  const depths = [0.52, 0.69, 0.79, 0.87, 0.95, 0.985, 1, 0.995, 0.97, 0.91, 0.79, 0.65];
  const maxWidth = Math.min(0.0529 * H * radialScale, gauge(localY(7) - 1.7 * interval, Math.PI / 2) - clear);
  const maxDepth = Math.min(
    (roma ? 0.0276 : 0.036) * H,
    0.5 * (gauge(localY(7), 0) + gauge(localY(7), Math.PI)) - clear,
  );
  const sideSign = (side) => (side === 'L' ? 1 : -1);
  for (const side of ['L', 'R']) {
    const sign = sideSign(side);
    for (let n = 1; n <= 12; n++) {
      const l = body('T' + n),
        w = maxWidth * widths[n - 1],
        d = maxDepth * depths[n - 1],
        y = l.local.y;
      const cut = n >= 11;
      let drop =
        (n === 1 ? 2.1 : n === 2 ? 2.7 : 3.6) * interval + (roma ? 2 * d * Math.tan(5 * radians) : 0);
      const head = l.point(sign * l.width * 0.87, 0, -l.depth * 0.3);
      const endX = cut ? (n === 12 ? 0.97 : 0.93) : n < 5 ? 0.43 : n < 8 ? 0.53 : 0.63;
      function outer(x, t, z) {
        x *= sign * w;
        z *= d;
        const h = y - drop * t,
          r = Math.hypot(x, z);
        const limit = gauge(h, Math.atan2(x, z)) - clear;
        const scale = Math.min(1, Math.max(0.3, limit / r));
        return chest.point(x * scale, h, z * scale);
      }
      if (!cut) {
        // Rib inclination is measured between the actual head and anterior end
        // in the sagittal plane. Adjust for their differently sized chests.
        const inclination = (n === 1 ? 25 : n === 2 ? 28 : n === 3 ? 32 : 30) + (roma ? 5 : 0);
        for (let step = 0; step < 2; step++) {
          const end = chest.from(outer(endX, 1, 0.95));
          drop = (end.z - chest.from(head).z) * Math.tan(inclination * radians);
        }
      }
      // The tubercle meets its transverse process before the posterior
      // angle. T1 needs the broadest process even on its short first rib.
      const tubercleX = cut ? 0.24 : Math.min(0.88, l.transverse / w);
      const angleX = Math.max(0.45, tubercleX + 0.07);
      const rib = [
        head,
        outer(tubercleX, 0.02, -0.78),
        outer(angleX, 0.055, -1),
        outer(Math.max(0.79, angleX + 0.025), 0.22, -0.86),
        outer(0.985, 0.48, -0.36),
      ];
      if (cut) {
        rib.push(outer(1, 0.72, -0.12), outer(endX, 0.95, n === 12 ? 0.02 : 0.25));
      } else {
        rib.push(
          outer(0.996, 0.65, 0.16),
          outer(0.89, 0.82, 0.6),
          outer(0.69, 0.94, 0.86),
          outer(endX, 1, 0.95),
        );
      }
      const curve = new T.CatmullRomCurve3(rib);
      ribs[side][n] = curve;
      if (!cut) {
        // The smooth part of the rib tubercle and the distal transverse
        // process share this articular point, just medial to the rib angle.
        l.costalFacet ??= {};
        l.costalFacet[side] = rib[1];
      }
      if (!cut) {
        const begin = rib.at(-1);
        let end;
        if (n <= 7) {
          const yAttach =
            n === 1
              ? notchY - 0.09 * sternLength
              : n === 2
                ? angleY
                : lerp(angleY, tipY + 0.15 * sternLength, (n - 2) / 5);
          end = stern(sign * inch * (n <= 2 ? 0.46 : 0.32) * (roma ? 0.9 : 1), yAttach);
        } else end = cartilages[side][n - 1].getPoint(0.31);
        const p = chest.from(begin),
          q = chest.from(end);
        const mid = chest.point(
          lerp(p.x, q.x, 0.48),
          lerp(p.y, q.y, 0.44) - 0.004 * H,
          Math.min(gauge((p.y + q.y) / 2, 0) - clear, Math.max(p.z, q.z) + 0.0015 * H),
        );
        cartilages[side][n] = new T.CatmullRomCurve3([begin, mid, end]);
      }
    }
  }
  function posteriorRib(side, n, lateral) {
    const curve = ribs[side][n];
    if (lateral === undefined) return curve.points[2].clone();
    const x = Math.abs(lateral),
      limit = 0.45;
    let lo = 0,
      hi = limit;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (Math.abs(chest.from(curve.getPoint(mid)).x) < x) lo = mid;
      else hi = mid;
    }
    return curve.getPoint((lo + hi) / 2);
  }
  return {
    H,
    roma,
    chest,
    gauge,
    spineLevels,
    ribs,
    cartilages,
    stern,
    notchY,
    angleY,
    tipY,
    sternLength,
    vertebra: (n) => body(n).center.clone(),
    spinous: (n) => body(n).spinous.clone(),
    rib: (side, n, t) => ribs[side][n].getPoint(t),
    cartilage: (side, n, t) => cartilages[side][n].getPoint(t),
    posteriorRib,
    clavicularNotch: (side) => stern(sideSign(side) * inch * (roma ? 0.56 : 0.64), notchY - 0.06 * inch),
    manubrium: stern(0, notchY - 0.38 * inch),
    sternalAngle: stern(0, angleY),
    xiphoid: stern(0, tipY),
  };
}
