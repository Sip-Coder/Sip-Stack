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

// From index to little finger: knuckle set, fingertip set, base, length,
// knuckle radius and flexion. Both hands share the same sculpt at the wrist.
const explorerDigits = [
  [0.0146, 0.0198, -0.0275, 0.0246, 0.00415, 0.0057],
  [0.0044, 0.0069, -0.0290, 0.0271, 0.00445, 0.0068],
  [-0.0057, -0.0078, -0.0280, 0.0255, 0.00420, 0.0080],
  [-0.0153, -0.0215, -0.0255, 0.0210, 0.00365, 0.0098],
].map(([knuckle, tip, base, length, radius, flexion]) => ({
  radius,
  points: [
    [0.0043, base + 0.003, knuckle],
    [0.0054, base - length * 0.23, mix(knuckle, tip, 0.22)],
    [0.0048 - flexion * 0.25, base - length * 0.58, mix(knuckle, tip, 0.63)],
    [0.0040 - flexion * 0.66, base - length * 0.86, mix(knuckle, tip, 0.87)],
    [0.0040 - flexion, base - length, tip],
  ],
})).concat({
  radius: 0.0058,
  points: [
    [-0.008, -0.007, 0.008],
    [-0.013, -0.012, 0.017],
    [-0.017, -0.019, 0.023],
    [-0.0165, -0.026, 0.0275],
    [-0.0145, -0.031, 0.0288],
  ],
});

// Store segment tangents and their influence bounds once. Most voxels are
// outside every finger and only need the elliptical palm field.
const digits = explorerDigits.map(({ points, radius }, finger) => {
  // Short line segments follow a continuous centreline through the joints.
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  const sections = curve.getSpacedPoints(8).map(p => p.toArray());
  const margin = radius * 1.07 + 0.009;
  return {
    minX: Math.min(...sections.map(p => p[0])) - margin,
    maxX: Math.max(...sections.map(p => p[0])) + margin,
    minY: Math.min(...sections.map(p => p[1])) - margin,
    maxY: Math.max(...sections.map(p => p[1])) + margin,
    minZ: Math.min(...sections.map(p => p[2])) - margin,
    maxZ: Math.max(...sections.map(p => p[2])) + margin,
    zScale: finger === 4 ? 1 : 1.23,
    segments: sections.slice(1).map(([x, y, z], i) => {
      const [ax, ay, az] = sections[i];
      const dx = x - ax, dy = y - ay, dz = z - az;
      return { ax, ay, az, dx, dy, dz, invLength: 1 / (dx*dx + dy*dy + dz*dz),
        radius: radius * mix(1.07, 0.80, i / (sections.length - 1)),
        taper: radius * (0.80 - 1.07) / (sections.length - 1) };
    }),
  };
});
const nailFinishes = explorerDigits.map(({ points, radius }) => {
  const tip = new T.Vector3(...points.at(-1)), next = new T.Vector3(...points.at(-2));
  const length = next.clone().sub(tip).normalize();
  const dorsal = new T.Vector3(1, 0, 0).projectOnPlane(length).normalize();
  return {
    center: tip.lerp(next, 0.42),
    length,
    dorsal,
    width: dorsal.clone().cross(length),
    radius,
  };
});
const palm = [
  [-0.036, 0.0075, 0.014, -0.0005],
  [-0.028, 0.0135, 0.019, -0.0010],
  [-0.018, 0.0155, 0.020, 0.0015],
  [-0.008, 0.0158, 0.0178, 0.0015],
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
      const k = 0.00022 + 0.00155 * T.MathUtils.smoothstep(y, -0.040, -0.029),
        h = Math.max(0, k - Math.abs(fd - d));
      d = Math.min(fd, d) - (h * h) / (4 * k);
    }
  return d;
}

// Keep the fine grid local to the hand so both character tiers can draw
// open webs and rounded fingertips without resampling the arm.
const handCache = new Map();
function sculptHand(step) {
  if (handCache.has(step)) return handCache.get(step);
  const limits = [
    [-0.027, 0.025],
    [-0.063, 0.005],
    [-0.028, 0.039],
  ];
  const axes = limits.map(([a, b]) => {
    const n = Math.ceil((b - a) / step);
    return Array.from({ length: n + 1 }, (_, i) => mix(a, b, i / n));
  });
  const [xs, ys, zs] = axes;
  const nx = xs.length, ny = ys.length, plane = nx * ny;
  const offsets = corners.map(([x,y,z]) => x + y*nx + z*plane);
  const values = new Float32Array(plane*zs.length);
  const pos = [], normals = [], colors = [], indices = [], cache = new Map();
  for (let k=0; k<zs.length; k++)
    for (let j=0; j<ny; j++)
      for (let i=0; i<nx; i++)
        values[k*plane+j*nx+i] = handField(xs[i],ys[j],zs[k]);
  let origin = 0, column = 0, row = 0, depth = 0;
  const gradient = new T.Vector3(), point = new T.Vector3(), delta = new T.Vector3();
  function crossing(a,b) {
    const ia=origin+offsets[a], ib=origin+offsets[b];
    const key=Math.min(ia,ib)*values.length+Math.max(ia,ib);
    if (cache.has(key)) return cache.get(key);
    const first=corners[a], second=corners[b];
    const ax=xs[column+first[0]], ay=ys[row+first[1]], az=zs[depth+first[2]];
    const bx=xs[column+second[0]], by=ys[row+second[1]], bz=zs[depth+second[2]];
    const difference = values[ia]-values[ib];
    const t = clamp(values[ia] / difference, .001,.999);
    const id=pos.length;
    point.set(mix(ax,bx,t),mix(ay,by,t),mix(az,bz,t));
    const { x, y, z } = point, s = 0.0006;
    gradient.set(handField(x+s,y,z) - handField(x-s,y,z),
      handField(x,y+s,z) - handField(x,y-s,z), handField(x,y,z+s) - handField(x,y,z-s));
    pos.push([1.14*point.x, 1.06*point.y, 1.14*point.z]);
    gradient.set(gradient.x/1.14, gradient.y/1.06, gradient.z/1.14).normalize();
    normals.push(gradient.x, gradient.y, gradient.z);
    let nail = 0;
    for (const { center, dorsal, length, width, radius } of nailFinishes) {
      delta.subVectors(point, center);
      const profile = Math.hypot(delta.dot(length) / (radius*0.78), delta.dot(width) / (radius*0.61));
      nail = Math.max(nail, (1 - T.MathUtils.smoothstep(profile, 0.45, 1.15)) *
        T.MathUtils.smoothstep(delta.dot(dorsal) / radius, 0.25, 0.58));
    }
    colors.push(1 - 0.09*nail, 1 - 0.20*nail, 1 - 0.10*nail);
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
  const shape = { pos, normals, colors, indices };
  handCache.set(step, shape);
  return shape;
}


export function buildExplorerHands(rig, material) {
  const geometry = (detail) => {
    const hand = sculptHand(detail);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(hand.pos.flat(), 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(hand.normals, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(hand.colors, 3));
    g.setIndex(hand.indices);
    g.computeBoundingSphere();
    return g;
  };
  const finish = material.clone();
  finish.vertexColors = true;
  for (const side of ['L', 'R']) {
    const h = rig['hand' + side];
    const wrist = rig.exterior['arm' + side][0];
    const width = sampleExterior(rig.exterior['arm' + side], wrist[0], Math.PI / 2)[2] / 0.0155;
    const depth = sampleExterior(rig.exterior['arm' + side], wrist[0], 0)[2] / 0.0155;
    const hand = new T.Mesh(geometry(0.0035), finish);
    hand.userData.mobileGeometry = geometry(0.0038);
    hand.userData.anatomicalSkin = (side === 'L' ? 'Left' : 'Right') + ' hand';
    hand.name = hand.userData.anatomicalSkin;
    const sign = side === 'L' ? 1 : -1;
    hand.scale.set(sign * T.MathUtils.clamp(width * 1.19, 1.20, 1.46),
      side === 'L' ? 1.46 : 1.26, T.MathUtils.clamp(depth * 1.02, 1.04, 1.43));
    hand.position.set(wrist[1] - rig.anatomy.joints['hand' + side].x, 0, wrist[2] - rig.anatomy.joints['hand' + side].z);
    hand.castShadow = hand.receiveShadow = true;
    h.add(hand);
  }
}
