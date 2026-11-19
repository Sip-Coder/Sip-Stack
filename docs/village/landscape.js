import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surface } from './surfaces.js';

export const stone = new RoundedBoxGeometry(1, 1, 1, 1, 0.12);
// Folded leaf blades keep their venation and serrated silhouette at close range.
export function vineLeaf() {
  const rim = [
    [0, -0.48],
    [0.18, -0.28],
    [0.38, -0.3],
    [0.3, -0.11],
    [0.52, -0.06],
    [0.44, 0.1],
    [0.51, 0.21],
    [0.23, 0.2],
    [0.25, 0.37],
    [0.1, 0.34],
    [0, 0.58],
    [-0.12, 0.34],
    [-0.25, 0.39],
    [-0.22, 0.19],
    [-0.48, 0.25],
    [-0.43, 0.1],
    [-0.54, -0.04],
    [-0.32, -0.11],
    [-0.38, -0.28],
    [-0.17, -0.27],
  ];
  const verts = [0, 0, 0.14],
    colors = [0.88, 0.94, 0.7],
    idx = [];
  rim.forEach(([x, y], i) => {
    verts.push(x, y, 0.035 * Math.sin(i * 1.8));
    colors.push(0.7 + 0.13 * (i % 2), 0.81 + 0.09 * (i % 2), 0.59);
    idx.push(0, i + 1, ((i + 1) % rim.length) + 1);
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function flowerSpray() {
  const pts = [],
    colors = [],
    idx = [];
  for (let j = 0; j < 12; j++) {
    const a = j * 2.4,
      rad = 0.65 * Math.sqrt(j / 12),
      x = Math.cos(a) * rad,
      y = Math.sin(a) * rad,
      z = 0.45 * Math.cos(rad * 1.7);
    for (let k = 0; k < 5; k++) {
      const b = (k * Math.PI * 2) / 5 + j,
        n = pts.length / 3;
      pts.push(
        x,
        y,
        z,
        x + Math.cos(b - 0.5) * 0.22,
        y + Math.sin(b - 0.5) * 0.22,
        z + 0.09,
        x + Math.cos(b + 0.5) * 0.22,
        y + Math.sin(b + 0.5) * 0.22,
        z + 0.1,
      );
      colors.push(0.54, 0.46, 0.36, 1, 0.9, 0.79, 0.93, 0.79, 0.72);
      idx.push(n, n + 1, n + 2);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function roofTile() {
  const vertices = [],
    indices = [];
  for (let row = 0; row < 2; row++)
    for (let j = 0; j <= 6; j++) {
      const a = (j * Math.PI) / 6,
        r = row ? 0.49 : 0.43;
      vertices.push(Math.cos(a) * r, Math.sin(a) * r, row - 0.5);
      if (row && j) {
        const i = row * 7 + j;
        indices.push(i - 8, i - 7, i, i - 8, i, i - 1);
      }
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function blade() {
  const g = new T.BufferGeometry();
  g.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      [-0.5, 0, 0, 0.5, 0, 0, -0.22, 0.58, 0.11, 0.34, 0.58, 0.11, 0.24, 1, 0.26],
      3,
    ),
  );
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  g.computeVertexNormals();
  return g;
}

export function layTiles(k, x, y, z, w, d, h, across, random) {
  const length = across ? w : d,
    span = across ? d : w;
  const angle = Math.atan2(h, span / 2),
    run = Math.hypot(h, span / 2);
  const n = Math.ceil(length / 0.23),
    rows = Math.ceil(run / 0.48);
  for (const side of [-1, 1])
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < n; col++) {
        const along = ((col + 0.5) / n - 0.5) * length,
          down = (row + 0.5) / rows;
        const off = (side * down * span) / 2;
        const c = new T.Color().setHSL(
          0.046 + random() * 0.018,
          0.39 + random() * 0.14,
          0.32 + random() * 0.14,
          T.SRGBColorSpace,
        );
        k.push(
          'tile',
          [x + (across ? along : off), y + h * (1 - down) + 0.015, z + (across ? off : along)],
          [length / n, 0.16, run / rows + 0.06],
          c,
          across ? [angle * side, 0, 0] : [angle * side, Math.PI / 2, 0, 'YXZ'],
        );
      }
}
export function masonry(k, x0, x1, z, low, high, random) {
  const courses = Math.ceil((high - low) / 0.28),
    step = (high - low) / courses;
  for (let row = 0; row < courses; row++) {
    let x = x0;
    while (x < x1 - 0.015) {
      const width = Math.min(x1 - x, 0.3 + random() * 0.59);
      k.push(
        'stone',
        [x + width / 2, low + step * (row + 0.5), z + random() * 0.052],
        [width - 0.008, step * (0.9 + random() * 0.13), 0.19 + random() * 0.09],
        new T.Color().setHSL(
          0.086 + random() * 0.025,
          0.1 + random() * 0.16,
          0.4 + random() * 0.19,
          T.SRGBColorSpace,
        ),
        [0, 0, (random() - 0.5) * 0.056],
      );
      x += width;
    }
  }
}

export function cypress(k, x, y, z, s, r) {
  k.nav?.circle('cypress',x,z,.25*s,y,y+3*s);
  k.cyl(x, y + s * 0.72, z, s * 0.09, s * 1.42, '#584c37');
  for (let n = 0; n < 15; n++) {
    const t = n / 15,
      thick = s * (0.14 + 0.23 * Math.sin(Math.PI * t)) * (1 - t * 0.55);
    k.push(
      'foliage',
      [x + (r() - 0.5) * thick * 0.7, y + s * (0.55 + 2.55 * t), z + (r() - 0.5) * thick * 0.7],
      [thick, thick * 2.2, thick],
      n % 3 ? '#435535' : '#576344',
      [0, r() * 6, 0],
    );
  }
}
export function olive(k, x, y, z, s, r) {
  k.nav?.circle('olive tree',x,z,.17*s,y,y+2.2*s);
  k.cyl(x, y + 0.53 * s, z, s * 0.14, s * 1.12, '#695c47', [0, 0, 0.13]);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.4,
      dx = Math.cos(a),
      dz = Math.sin(a);
    k.cyl(x + dx * 0.25 * s, y + 1.08 * s, z + dz * 0.25 * s, 0.067 * s, 0.96 * s, '#746852', [
      dz * 0.64,
      0,
      -dx * 0.64,
    ]);
    for (let j = 0; j < 7; j++) {
      const rad = (0.28 + r() * 0.3) * s;
      k.push(
        'foliage',
        [
          x + (dx * 0.63 + (r() - 0.5) * 0.57) * s,
          y + (1.5 + r() * 0.35) * s,
          z + (dz * 0.6 + (r() - 0.5) * 0.55) * s,
        ],
        [rad, rad * 0.73, rad],
        j % 3 ? '#788167' : '#929d79',
        [r(), r() * 5, r()],
      );
    }
  }
}

function civicSquare(k, r) {
  k.nav?.surface('piazza',-11,2,-17,-10,7.075);
  k.box(-11, 2, -0.95, 7.02, -17, -10, '#857d67');
  masonry(k, -11, 2, -10.05, 5.8, 7.03, r);
  for (let j = 0; j < 12; j++)
    for (let i = 0; i < 21; i++) {
      const x = -10.7 + i * 0.61 + (j % 2) * 0.17,
        z = -16.67 + j * 0.56;
      k.push('stone', [x, 7.035, z], [0.618, 0.08, 0.555], j % 4 ? '#b5a78e' : '#a8987f');
    }
  // The arched belfry is open on all four sides. A real bell hangs between its piers.
  const x = -6,
    z = -13.7,
    b = 7.06;
  k.nav?.box('belfry',x,z,1.14,1.14,b,15.72);
  k.box(x - 1, x + 1, b, 13.4, z - 1, z + 1, '#d5b08a', 'plaster');
  for (const h of [7.4, 11.75, 13.4, 15.55])
    k.box(x - 1.14, x + 1.14, h, h + 0.17, z - 1.14, z + 1.14, '#ead7b1');
  for (const dx of [-0.82, 0.82])
    for (const dz of [-0.82, 0.82]) k.push('stone', [x + dx, 14.55, z + dz], [0.41, 1.92, 0.41], '#d7bc91');
  for (const side of [-1, 1])
    for (let j = 0; j < 11; j++) {
      const a = ((j + 0.5) * Math.PI) / 11,
        dx = Math.cos(a) * 0.79,
        yy = 14.7 + Math.sin(a) * 0.65;
      k.push('stone', [x + dx, yy, z + side * 0.82], [0.24, 0.31, 0.42], '#e4cba5', [0, 0, a - Math.PI / 2]);
      k.push('stone', [x + side * 0.82, yy, z + dx], [0.42, 0.31, 0.24], '#e4cba5', [Math.PI / 2 - a, 0, 0]);
    }
  k.cyl(x, 14.58, z, 0.36, 0.49, '#615039');
  k.cyl(x, 14.34, z, 0.44, 0.1, '#837048');
  k.push('spire', [x, 16.52, z], [1.54, 1.83, 1.54], '#925e42', [0, Math.PI / 4, 0]);
  k.cyl(x, 17.64, z, 0.034, 0.56, '#594632');
  k.ball(x, 17.41, z, 0.12, '#ae8d53');
  for (const side of [-1, 1]) {
    k.cyl(x, 12.61, z + side * 1.012, 0.44, 0.05, '#e8d6aa', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      k.push(
        'box',
        [x + 0.35 * Math.sin(a), 12.61 + 0.35 * Math.cos(a), z + side * 1.049],
        [0.022, 0.075, 0.018],
        '#4f4334',
        [0, 0, -a],
      );
    }
    k.push('box', [x + 0.07, 12.71, z + side * 1.064], [0.036, 0.27, 0.019], '#483c30', [0, 0, -0.6]);
    k.push('box', [x - 0.09, 12.65, z + side * 1.067], [0.028, 0.21, 0.021], '#483c30', [0, 0, 1.13]);
  }
  // Stone quoins, the clock facing the piazza, and a carved entry surround.
  for (const dx of [-0.92, 0.92])
    for (const dz of [-0.92, 0.92])
      for (let row = 0; row < 15; row++)
        k.push(
          'stone',
          [x + dx, 7.22 + row * 0.409, z + dz],
          [row % 2 ? 0.31 : 0.43, 0.38, row % 2 ? 0.43 : 0.31],
          row % 3 ? '#d0b798' : '#bba283',
        );
  k.cyl(x + 1.038, 12.65, z, 0.49, 0.095, '#876e48', [0, 0, Math.PI / 2]);
  k.cyl(x + 1.09, 12.65, z, 0.422, 0.026, '#eee1bd', [0, 0, Math.PI / 2]);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    k.push(
      'box',
      [x + 1.112, 12.65 + 0.35 * Math.cos(a), z + 0.35 * Math.sin(a)],
      [0.022, 0.068, 0.024],
      '#453d31',
      [a, 0, 0],
    );
  }
  k.push('box', [x + 1.13, 12.72, z - 0.085], [0.018, 0.24, 0.032], '#42382e', [-0.91, 0, 0]);
  k.push('box', [x + 1.132, 12.61, z + 0.13], [0.02, 0.32, 0.029], '#42382e', [-1.26, 0, 0]);
  k.push('wood', [x + 1.024, 7.94, z], [0.08, 1.75, 1.03], '#564132');
  for (const sign of [-1, 1])
    k.push('stone', [x + 1.082, 7.93, z + sign * 0.58], [0.23, 1.76, 0.2], '#ccb799');
  for (let j = 0; j <= 12; j++) {
    const a = (j * Math.PI) / 12;
    k.push(
      'stone',
      [x + 1.08, 8.8 + Math.sin(a) * 0.55, z + 0.55 * Math.cos(a)],
      [0.22, 0.17, 0.2],
      '#decaac',
      [Math.PI / 2 - a, 0, 0],
    );
  }
  for (let i = 0; i < 2; i++)
    k.push(
      'stone',
      [x + 1.19 + i * 0.2, 7.13 - i * 0.042, z],
      [0.34, 0.2 - i * 0.07, 1.58 + i * 0.2],
      '#b2a28c',
    );
  // A small shaded loggia bounds the upper square.
  const az = -15.66;
  k.nav?.box('loggia wall',-5.6,az-.69,3.325,.085,7.065,9.015);
  k.push('plaster', [-5.6, 8.04, az - 0.69], [6.65, 1.95, 0.17], '#caac89');
  for (let i = 0; i < 5; i++) {
    const xx = -8.86 + i * 1.62;
    k.nav?.box('loggia post',xx,az,.12,.12,7.025,8.475);
    k.push('stone', [xx, 7.75, az], [0.22, 1.45, 0.24], '#c5af8e');
    k.push('stone', [xx, 8.48, az], [0.31, 0.14, 0.33], '#e4cfaa');
    if (i === 4) break;
    for (let j = 0; j < 11; j++) {
      const a = ((j + 0.5) * Math.PI) / 11;
      k.push(
        'stone',
        [xx + 0.81 + Math.cos(a) * 0.8, 8.46 + Math.sin(a) * 0.51, az],
        [0.23, 0.21, 0.25],
        '#cfb999',
        [0, 0, a - Math.PI / 2],
      );
    }
  }
  k.push('roof', [-5.63, 9.02, az - 0.31], [1.27, 0.31, 7.19], '#ae7553', [0, Math.PI / 2, 0]);
  layTiles(k, -5.63, 9.02, az - 0.31, 7.19, 1.27, 0.31, true, r);
  olive(k, -9.05, 7.1, -13.2, 1.28, r);
  cypress(k, 0.86, 7, -15.8, 1.28, r);
  cypress(k, -10.45, 7, -16.1, 1.48, r);
  for (const x of [-4, -0.5]) {
    k.nav?.box('piazza bench',x,-12.995,.64,.165,7.075,7.53);
    k.box(x - 0.64, x + 0.64, 7.44, 7.53, -13.16, -12.83, '#815b39');
    for (const dx of [-0.49, 0.49])
      k.box(x + dx - 0.09, x + dx + 0.09, 7.08, 7.44, -13.13, -12.88, '#9d937e');
  }
}

export function landscape(scene, k, slab, r) {
  civicSquare(k, r);
  for (const [a, b, z, lo, hi, kit] of [
    [-10, 3, 1.51, 0.27, 1.02, k],
    [4.65, 10, 1.51, 0.27, 1.02, k],
    [-10, 0.76, -1.49, 1.05, 3, k],
    [1.95, 10, -1.49, 1.05, 3, k],
    [-10, 0.76, -4.48, 3.05, 5, k],
    [-10, 0.76, -7.48, 5.05, 7, k],
    [2, 6, -7.52, 5, 7, k],
    [6, 10, -7.52, 5, 7, slab],
    [3, 9.3, 7, 0.3, 1, k],
  ])
    masonry(kit, a, b, z, lo, hi, r);
  for (const [x, y, z, s] of [
    [10, 5, -7, 0.66],
    [1.8, 5, -7.1, 0.77],
    [-9.9, 3, -4, 1.03],
    [-10.4, 7, -11.8, 1.03],
  ])
    cypress(k, x, y, z, s, r);
  olive(k, 2.55, 7, -9.75, 0.66, r);
  for (let i = 0; i < 3700; i++) {
    const x = 2.15 + r() * 7.77,
      upper = r() > 0.47,
      z = upper ? -7.61 - r() * 2.32 : -4.67 - r() * 2.7,
      y = upper ? 7 : 5;
    // Leave a worn walking strip in each aisle.
    if (Math.abs(Math.sin(((z + (upper ? 8.1 : 5.25)) * Math.PI) / 0.87)) > 0.83) continue;
    const target = upper && x >= 6 ? slab : k;
    target.push(
      'grass',
      [x, y, z],
      [0.021 + r() * 0.028, 0.09 + r() * 0.16, 0.06],
      i % 5 ? '#8c8a49' : '#bba15f',
      [0, r() * 6.28, 0],
    );
  }
  // Continuous rocky spur from the piazza into the inland hills. Keep the
  // right terrace edge clear so the teaching slab can slide into open space.
  const points = [],
    faces = [],
    tints = [];
  const coastHeight = (x, z) => {
    const left = Math.max(0, -10 - x),
      behind = Math.max(0, -z - 10);
    const taper = Math.min(1, Math.max(0, (1.9 - z) / 6));
    if (x <= -10)
      return (
        -1.75 +
        taper * (1 + Math.min(7.55, Math.max(0, -z) * 0.91 + 1.35)) -
        0.35 * left -
        0.038 * left * left +
        0.44 * Math.sin(x * 1.65 + z * 0.82) +
        0.28 * Math.sin(z * 2.52 - x)
      );
    return (
      Math.min(8.4, 6.63 + behind * 0.1) -
      Math.max(0, x - 1.6) * 1.66 +
      0.28 * Math.sin(x * 1.03 + z * 0.52) +
      0.25 * Math.sin(z * 1.49)
    );
  };
  for (let j = 0; j <= 74; j++)
    for (let i = 0; i <= 65; i++) {
      const x = -30 + i * 0.62,
        z = 2 - j * 0.6,
        y = coastHeight(x, z),
        n = points.length / 3;
      points.push(x, y, z);
      const c = new T.Color().setHSL(
        0.103 + 0.075 * r(),
        0.12 + 0.17 * r(),
        0.27 + r() * 0.15,
        T.SRGBColorSpace,
      );
      tints.push(c.r, c.g, c.b);
      if (i && j && (x <= -10.05 || z <= -17.12 || (z <= -10.2 && x >= 2.1)))
        faces.push(n - 67, n - 66, n, n - 67, n, n - 1);
    }
  const base = new T.BufferGeometry();
  base.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  base.setAttribute('color', new T.Float32BufferAttribute(tints, 3));
  base.setIndex(faces);
  base.computeVertexNormals();
  const soil = surface('hills');
  soil.vertexColors = true;
  const spur = new T.Mesh(base, soil);
  spur.receiveShadow = true;
  scene.add(spur);
  for (let i = 0; i < 110; i++) {
    const x = -18 + r() * 20,
      z = -11 - r() * 29;
    if (x > -10 && z > -17.4) continue;
    const y = coastHeight(x, z) - 0.06;
    if (y < 0.8) continue;
    if (i % 4 === 0) olive(k, x, y, z, 0.72 + r() * 0.57, r);
    else cypress(k, x, y, z, 0.52 + r() * 0.65, r);
  }
  // Layered headlands behind the cutaway; their irregular ridges recede into marine haze.
  for (let layer = 0; layer < 3; layer++) {
    const verts = [],
      indices = [],
      colors = [];
    const cols = 151,
      rows = 24;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = (i / (cols - 1) - 0.5) * 350,
          u = j / (rows - 1),
          depth = 22 + layer * 39;
        const ridge =
          5.7 +
          layer * 3.1 +
          3.65 * Math.sin(x * 0.047 + layer * 2) +
          2.35 * Math.sin(x * 0.16 + 1) +
          0.88 * Math.sin(x * 0.46) +
          0.39 * Math.sin(x * 0.89);
        const crest = Math.sin(u * Math.PI) ** 0.83;
        const y = -2.9 + crest * (Math.max(2, ridge) + 2.1 * Math.sin(x * 0.39 + u * 7) * Math.sin(u * 3.14));
        const z = -depth - u * 32 + 4 * Math.sin(x * 0.106 + layer) + 1.2 * Math.sin(x * 0.62) + r() * 0.7;
        verts.push(x, y, z);
        const c = new T.Color().setHSL(
          0.18 + r() * 0.035,
          0.12 + r() * 0.1,
          0.25 + 0.16 * r() + 0.065 * layer,
          T.SRGBColorSpace,
        );
        colors.push(c.r, c.g, c.b);
        const n = j * cols + i;
        if (i && j) indices.push(n - cols - 1, n - cols, n, n - cols - 1, n, n - 1);
      }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = surface('hills');
    mat.vertexColors = true;
    const mesh = new T.Mesh(geo, mat);
    scene.add(mesh);
  }
}
