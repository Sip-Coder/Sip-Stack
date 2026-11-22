// Original hand form with a separate palm mound, webbing and opposing thumb.
import * as T from 'three';
import { sampleExterior } from './human-exterior.js';

const mix = T.MathUtils.lerp;
const clamp = T.MathUtils.clamp;
const corners = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
// Six consistently oriented cells meet along the body diagonal. A shared face
// uses the same diagonal from either side, including between adjacent fingers.
const tetrahedra = [[0,1,2,6], [0,2,3,6], [0,3,7,6], [0,7,4,6], [0,4,5,6], [0,5,1,6]];

function fingers() {
  const digits = [];
  for (let j = 0; j < 4; j++) {
    const z = 0.0143 - j * 0.0096,
      l = [0.02, 0.025, 0.023, 0.017][j],
      b = -0.03 + 0.002 * Math.abs(j - 1),
      x = 0.006 - 0.0015 * Math.abs(j - 1),
      r = 0.0048 - 0.00035 * Math.abs(j - 1);
    digits.push({
      points: [
        [x, b + 0.004, z],
        [x + 0.001, b - 0.005, z - 0.0005],
        [x - 0.0007, b - l * 0.52, z + 0.0002],
        [x - 0.0046, b - l * 0.84, z + 0.0016],
        [x - (0.011 + 0.001 * j), b - l * 0.98, z + 0.0052],
      ],
      radius: r,
    });
  }
  digits.push({
    points: [
      [-0.009, -0.01, 0.006],
      [-0.015, -0.014, 0.017],
      [-0.017, -0.021, 0.026],
      [-0.013, -0.028, 0.029],
      [-0.006, -0.03, 0.027],
    ],
    radius: 0.0063,
  });
  return digits;
}

// Store segment tangents and their influence bounds once. Most voxels are
// outside every finger and only need the elliptical palm field.
const digits = fingers().map(({ points, radius }, finger) => {
  const margin = radius * 1.07 + 0.009;
  return {
    minX: Math.min(...points.map(p => p[0])) - margin,
    maxX: Math.max(...points.map(p => p[0])) + margin,
    minY: Math.min(...points.map(p => p[1])) - margin,
    maxY: Math.max(...points.map(p => p[1])) + margin,
    minZ: Math.min(...points.map(p => p[2])) - margin,
    maxZ: Math.max(...points.map(p => p[2])) + margin,
    zScale: finger === 4 ? 1 : 1.32,
    segments: points.slice(1).map(([x, y, z], i) => {
      const [ax, ay, az] = points[i];
      const dx = x - ax, dy = y - ay, dz = z - az;
      return { ax, ay, az, dx, dy, dz, invLength: 1 / (dx*dx + dy*dy + dz*dz),
        radius: radius * mix(1.07, 0.72, i / (points.length - 1)),
        taper: radius * (0.72 - 1.07) / (points.length - 1) };
    }),
  };
});
const palm = [
  [-0.041, 0.009, 0.013, 0.001],
  [-0.033, 0.016, 0.019, 0],
  [-0.02, 0.017, 0.021, 0.002],
  [-0.008, 0.016, 0.018, 0.001],
  [0.008, 0.014, 0.014, 0.001],
];

function handField(x, y, z) {
  let d = 1;
  if (y > -0.046) {
    let j = 0;
    while (j + 2 < palm.length && y > palm[j + 1][0]) j++;
    const a = palm[j],
      b = palm[j + 1],
      t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const rx = mix(a[1], b[1], t),
      rz = mix(a[2], b[2], t),
      cz = mix(a[3], b[3], t);
    d = Math.max((Math.hypot(x / rx, (z - cz) / rz) - 1) * Math.min(rx, rz), palm[0][0] - y);
  }
  if (y < -0.003)
    for (const finger of digits) {
      if (x < finger.minX || x > finger.maxX || y < finger.minY || y > finger.maxY ||
          z < finger.minZ || z > finger.maxZ) continue;
      let fd = 1;
      for (const seg of finger.segments) {
        const sx = x-seg.ax, sy = y-seg.ay, sz = z-seg.az;
        const t = clamp((sx*seg.dx + sy*seg.dy + sz*seg.dz) * seg.invLength, 0, 1);
        const ex = sx - t*seg.dx, ey = sy - t*seg.dy, ez = (sz - t*seg.dz)*finger.zScale;
        fd = Math.min(fd, Math.sqrt(ex*ex + ey*ey + ez*ez) - seg.radius - t*seg.taper);
      }
      const k = 0.00025 + 0.00175 * T.MathUtils.smoothstep(y, -0.044, -0.033),
        h = Math.max(0, k - Math.abs(fd - d));
      d = Math.min(fd, d) - (h * h) / (4 * k);
    }
  return d;
}

// Sample only the fingers at sculpt resolution. A horizontal slice at the
// wrist supplies a single ordered ring that the forearm can sew directly.
const handCache = new Map();
function sculptHand(step) {
  if (handCache.has(step)) return handCache.get(step);
  const limits = [
    [-0.027, 0.025],
    [-0.062, 0.005],
    [-0.024, 0.039],
  ];
  const axes = limits.map(([a, b]) => {
    const n = Math.ceil((b - a) / step);
    return Array.from({ length: n + 1 }, (_, i) => mix(a, b, i / n));
  });
  const [xs, ys, zs] = axes;
  const nx = xs.length, ny = ys.length, plane = nx * ny;
  const offsets = corners.map(([x,y,z]) => x + y*nx + z*plane);
  const values = new Float32Array(plane*zs.length);
  const pos = [], indices = [], ring = [], cache = new Map();
  for (let k=0; k<zs.length; k++)
    for (let j=0; j<ny; j++)
      for (let i=0; i<nx; i++)
        values[k*plane+j*nx+i] = handField(xs[i],ys[j],zs[k]);
  let origin = 0, column = 0, row = 0, depth = 0;
  function crossing(a,b) {
    const ia=origin+offsets[a], ib=origin+offsets[b];
    const key=Math.min(ia,ib)*values.length+Math.max(ia,ib);
    if (cache.has(key)) return cache.get(key);
    const t = clamp(values[ia] / (values[ia]-values[ib]), .001,.999);
    const first=corners[a], second=corners[b];
    const id=pos.length;
    pos.push([1.14*mix(xs[column+first[0]],xs[column+second[0]],t),
      1.06*mix(ys[row+first[1]],ys[row+second[1]],t),
      1.14*mix(zs[depth+first[2]],zs[depth+second[2]],t)]);
    if (row+first[1] === ny-1 && row+second[1] === ny-1) ring.push(id);
    cache.set(key,id);
    return id;
  }
  function triangle(a,b,c,inside,outside) {
    const p=pos[a], q=pos[b], r=pos[c];
    const ux=q[0]-p[0],uy=q[1]-p[1],uz=q[2]-p[2];
    const vx=r[0]-p[0],vy=r[1]-p[1],vz=r[2]-p[2];
    const from=corners[inside], to=corners[outside];
    const facing=(uy*vz-uz*vy)*(to[0]-from[0]) +
      (uz*vx-ux*vz)*(to[1]-from[1]) +(ux*vy-uy*vx)*(to[2]-from[2]);
    if (facing>0) indices.push(a,b,c);
    else indices.push(a,c,b);
  }
  const inside=[],outside=[];
  for (depth=0;depth<zs.length-1;depth++)
    for (row=0;row<ny-1;row++)
      for (column=0;column<nx-1;column++) {
        origin=depth*plane+row*nx+column;
        let mask=0;
        for (let n=0;n<8;n++) if (values[origin+offsets[n]]<0) mask|=1<<n;
        if (mask===0 || mask===255) continue;
        for (const tetra of tetrahedra) {
          inside.length=outside.length=0;
          for (const c of tetra) ((mask & (1<<c)) ? inside : outside).push(c);
          if (!inside.length || !outside.length) continue;
          if (inside.length===2) {
            const [a,b]=inside, [c,d]=outside;
            const ac=crossing(a,c), ad=crossing(a,d), bc=crossing(b,c), bd=crossing(b,d);
            triangle(ac,ad,bd,a,c);triangle(ac,bd,bc,a,c);
          } else {
            const [one]=inside.length===1 ? inside : outside;
            const [a,b,c]=inside.length===1 ? outside : inside;
            triangle(crossing(one,a),crossing(one,b),crossing(one,c),inside[0],outside[0]);
          }
        }
      }
  const shape = { pos, indices, ring };
  handCache.set(step, shape);
  return shape;
}


export function buildExplorerHands(rig, material) {
  const geometry = (detail) => {
    const hand = sculptHand(detail);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(hand.pos.flat(), 3));
    g.setIndex(hand.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  const hands = {};
  for (const side of ['L', 'R']) {
    const h = rig['hand' + side];
    const wrist = rig.exterior['arm' + side][0];
    const width = sampleExterior(rig.exterior['arm' + side], wrist[0], Math.PI / 2)[2] / 0.0155;
    const depth = sampleExterior(rig.exterior['arm' + side], wrist[0], 0)[2] / 0.0155;
    const hand = new T.Mesh(geometry(0.0047), material);
    hand.userData.mobileGeometry = geometry(0.0054);
    hand.userData.anatomicalSkin = (side === 'L' ? 'Left' : 'Right') + ' hand';
    hand.name = hand.userData.anatomicalSkin;
    const sign = side === 'L' ? 1 : -1;
    hand.scale.set(sign * T.MathUtils.clamp(width * 1.19, 1.20, 1.46),
      side === 'L' ? 1.46 : 1.26, T.MathUtils.clamp(depth * 1.02, 1.04, 1.43));
    hand.position.set(wrist[1] - rig.anatomy.joints['hand' + side].x, 0, wrist[2] - rig.anatomy.joints['hand' + side].z);
    hand.castShadow = hand.receiveShadow = true;
    h.add(hand);
    hands[side] = hand;
  }
  return hands;
}
