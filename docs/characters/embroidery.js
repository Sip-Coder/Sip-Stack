// A vine worked in satin stitch. All three colours share the same curved ground,
// so an emblem can follow a sleeve or apron without a separate backing plane.
import * as T from 'three';

export function addVineEmbroidery(
  parent,
  { x = 0, y = 0, z = 0, width, height, side = 0, radius, rotation = 0, style, materials },
) {
  const badge = new T.Group();
  badge.name = style === 'apron' ? 'Embroidered grape bib' : 'Embroidered sleeve vine';
  badge.position.set(x, y, z);
  badge.rotation.y = (side * Math.PI) / 2 + rotation;
  parent.add(badge);

  // Coordinates below are relative to the motif, with the thread relief and
  // the horizontal arc applied in model space. The middle thread of each berry
  // follows its equator and adjacent stitches shorten over the shoulders.
  function sew(detail) {
    const blocks = new Map();
    function thread(material, points, weight) {
      if (!blocks.has(material)) blocks.set(material, { positions: [], index: [] });
      const { positions, index } = blocks.get(material);
      const start = positions.length / 3;
      const around = detail ? 4 : 2;
      for (let n = 0; n < points.length; n++) {
        const [u, v, relief = 0] = points[n];
        const before = points[Math.max(0, n - 1)],
          after = points[Math.min(points.length - 1, n + 1)];
        const dx = (after[0] - before[0]) * width,
          dy = (after[1] - before[1]) * height;
        const length = Math.hypot(dx, dy) || 1;
        const thickness = weight * width * (n === 0 || n === points.length - 1 ? 0.5 : 1);
        for (let j = 0; j <= around; j++) {
          const angle = (Math.PI * j) / around;
          const across = -Math.cos(angle) * thickness;
          const px = width * u - (across * dy) / length;
          const py = height * v + (across * dx) / length;
          const pz = width * (0.004 + relief) + Math.sin(angle) * thickness;
          if (radius)
            positions.push(
              (radius + pz) * Math.sin(px / radius),
              py,
              (radius + pz) * Math.cos(px / radius) - radius,
            );
          else positions.push(px, py, pz);
          if (n && j) {
            const k = start + n * (around + 1) + j;
            index.push(k - around - 2, k - 1, k, k - around - 2, k, k - around - 1);
          }
        }
      }
    }
    function vine(from, via, to, size) {
      const points = [];
      const count = detail ? 15 : 8;
      for (let k = 0; k <= count; k++) {
        const t = k / count,
          s = 1 - t;
        points.push([0, 1].map((i) => s * s * from[i] + 2 * s * t * via[i] + t * t * to[i]));
      }
      thread(materials.thread, points, size);
    }
    function leaf(base, tip, breadth) {
      const dx = tip[0] - base[0],
        dy = tip[1] - base[1],
        norm = Math.hypot(dx, dy);
      const at = (t, across, h) => [
        base[0] + dx * t - (dy / norm) * across,
        base[1] + dy * t + (dx / norm) * across,
        h,
      ];
      const stitches = detail ? 14 : 7;
      for (let n = 1; n < stitches; n++) {
        const t = n / stitches;
        const wing = breadth * Math.sin(Math.PI * t) * (1 - 0.23 * t) * (n % 3 === 0 ? 0.83 : 1);
        for (const s of [-1, 1])
          thread(
            materials.leaf,
            [
              at(t, s * wing, 0.001),
              at(t - 0.045, s * wing * 0.56, 0.009),
              at(Math.max(0, t - 0.12), 0, 0.006),
            ],
            detail ? 0.012 : 0.023,
          );
      }
      thread(materials.thread, [at(0, 0, 0.009), at(0.46, 0, 0.012), at(0.96, 0, 0.005)], 0.007);
    }
    function grape(cx, cy, r, skew) {
      const count = detail ? 8 : 4;
      for (let j = 0; j < count; j++) {
        const a = (2 * (j + 0.5)) / count - 1,
          chord = Math.sqrt(1 - a * a);
        const points = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 3 - 1,
            b = t * chord;
          const relief = 0.008 + 0.043 * Math.sqrt(Math.max(0, 1 - a * a - b * b));
          points.push([cx + (a + skew * b) * r, cy + ((b - skew * a) * r * width) / height, relief]);
        }
        thread(materials.berry, points, (r / count) * 1.2);
      }
    }

    vine([0.07, 0.44], [0.18, 0.24], [-0.08, 0.08], 0.017);
    vine([0.045, 0.2], [-0.1, 0.34], [-0.23, 0.31], 0.01);
    if (style !== 'apron') {
      leaf([-0.09, 0.29], [-0.44, 0.43], 0.072);
      leaf([0.06, 0.22], [0.4, 0.34], 0.093);
      leaf([0.05, 0.21], [0.37, 0.07], 0.059);
      vine([0.08, 0.34], [0.02, 0.48], [-0.07, 0.44], 0.009);
    }
    // The back and side berries overlap toward the hanging tip.
    for (const [gx, gy, r, angle] of [
      [-0.2, 0.045, 0.094, -0.18],
      [0.15, 0.052, 0.092, 0.2],
      [-0.19, -0.088, 0.105, 0.12],
      [0.176, -0.093, 0.1, -0.09],
      [-0.09, -0.23, 0.1, 0.19],
      [0.08, -0.245, 0.098, -0.12],
      [-0.02, -0.372, 0.088, 0.18],
      [-0.011, -0.119, 0.112, -0.14],
      [-0.028, 0.048, 0.106, 0.08],
    ])
      grape(gx, gy, r, angle);
    return new Map(
      Array.from(blocks, ([material, data]) => {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(data.positions, 3));
        g.setIndex(data.index);
        g.computeVertexNormals();
        return [material, g];
      }),
    );
  }
  const mobile = sew(false);
  for (const [material, geometry] of sew(true)) {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = badge.name + ' / ' + (material.name || material.userData.blueprintId || 'rayon');
    mesh.receiveShadow = true;
    mesh.userData.patternPiece = true;
    mesh.userData.mobileGeometry = mobile.get(material);
    badge.add(mesh);
  }
  return badge;
}
