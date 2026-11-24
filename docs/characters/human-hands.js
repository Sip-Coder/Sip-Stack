// Continuous wrist and digit skin from the posed donor's offline sections.
import * as T from 'three';

const { lerp: mix, clamp, smoothstep } = T.MathUtils;
const tau = Math.PI * 2;
const columns = 12;
const alongFingers = new T.Vector3(0, 0, 1);
const handGeometry = new Map();
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

function segment(a, b, widthA, widthB, thicknessA, thicknessB) {
  const delta = b.clone().sub(a), length = delta.length();
  const axis = delta.clone().divideScalar(length);
  const across = alongFingers.clone().projectOnPlane(axis).normalize();
  const depth = across.clone().cross(axis);
  return { a, axis, length, across, depth, widthA, widthB, thicknessA, thicknessB };
}

function prepareHand(data, side) {
  const palm = data.palm.map(row => row.map(x => x * 0.0001));
  const knuckles = data.knuckles.map(row => row.map(x => x * 0.0001));
  const profiles = data.digits.map(rows => rows.map(row => row.map(x => x * 0.0001)));
  const digits = [], nails = [], bounds = new T.Box3();
  const outward = new T.Vector3(side === 'L' ? 1 : -1, 0, 0);
  for (const profile of profiles) {
    const path = profile.map(p => new T.Vector3().fromArray(p));
    const box = new T.Box3().setFromPoints(path).expandByScalar(
      Math.max(...profile.map(p => Math.max(p[3], p[4]))) + 0.0025);
    bounds.union(box);
    digits.push({ bounds: box, segments: path.slice(1).map((next, i) =>
      segment(path[i], next, profile[i][4], profile[i + 1][4], profile[i][3], profile[i + 1][3])) });
    const end = path.at(-1), next = path.at(-2), length = next.clone().sub(end).normalize();
    const dorsal = outward.clone().projectOnPlane(length).normalize();
    nails.push({ center: end.clone().lerp(next, 0.45), length, dorsal, width: dorsal.clone().cross(length),
      radius: Math.max(profile.at(-2)[4], 0.0030) });
  }
  for (const [y, x, z, ...radial] of palm) {
    const r = Math.max(...radial) + 0.0025;
    bounds.expandByPoint(new T.Vector3(x - r, y - 0.0025, z - r));
    bounds.expandByPoint(new T.Vector3(x + r, y + 0.0025, z + r));
  }
  const limits = ['x', 'y', 'z'].map(key => [bounds.min[key], bounds.max[key]]);
  // The upper palm is deliberately open where it overlaps the fitted sleeve-side skin.
  limits[1][1] = palm.at(-1)[0];
  const delta = new T.Vector3(), point = new T.Vector3();
  const rowsAt = (rows, value) => {
    let i = 0;
    while (i + 2 < rows.length && value > rows[i + 1][0]) i++;
    const a = rows[i], b = rows[i + 1];
    return [a, b, clamp((value - a[0]) / (b[0] - a[0]), 0, 1)];
  };
  function field(x, y, z) {
    let palmDistance = 1, web = palm[0][0];
    if (y > palm[0][0] - 0.0025) {
      const [a, b, u] = rowsAt(palm, y);
      const px = x - mix(a[1], b[1], u), pz = z - mix(a[2], b[2], u);
      const angle = (Math.atan2(px, pz) / tau * columns + columns) % columns;
      const i = Math.floor(angle), j = (i + 1) % columns;
      const border = mix(mix(a[i + 3], b[i + 3], u), mix(a[j + 3], b[j + 3], u), angle - i);
      const [left, right, t] = rowsAt(knuckles, z);
      web = mix(left[1], right[1], t);
      const radial = Math.hypot(px, pz) - border, lower = web - y;
      const lip = Math.max(0, 0.003 - Math.abs(radial - lower));
      palmDistance = Math.max(radial, lower) + lip * lip / 0.012;
    }
    point.set(x, y, z);
    let digitDistance = 1;
    for (const digit of digits) {
      if (!digit.bounds.containsPoint(point)) continue;
      for (const { a, axis, length, across, depth, widthA, widthB, thicknessA, thicknessB } of digit.segments) {
        delta.subVectors(point, a);
        const at = delta.dot(axis), t = clamp(at / length, 0, 1);
        const width = mix(widthA, widthB, t), thickness = mix(thicknessA, thicknessB, t);
        const cap = Math.min(width, thickness);
        const x = delta.dot(across) / width, y = delta.dot(depth) / thickness;
        const z = (at - t * length) / cap;
        const distance = (Math.sqrt(x * x + y * y + z * z) - 1) * cap;
        digitDistance = Math.min(digitDistance, distance);
      }
    }
    // Round the joins at the web. The individual digit fields stay separate
    // farther from the palm, including inside the fingers' curled arc.
    const blend = 0.0044 * smoothstep(y, web - 0.006, web + 0.003);
    const bridge = Math.max(0, blend - Math.abs(palmDistance - digitDistance));
    return Math.min(palmDistance, digitDistance) - (bridge > 0 ? bridge * bridge / (4 * blend) : 0);
  }
  return { limits, field, nails };
}

function sculptHand({ limits, field, nails }, step) {
  const axes = limits.map(([a, b], axis) => {
    const n = Math.ceil((b - a) / step[axis]);
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
        values[k*plane+j*nx+i] = field(xs[i],ys[j],zs[k]);
  let origin = 0, column = 0, row = 0, depth = 0;
  const gradient = new T.Vector3(), point = new T.Vector3(), delta = new T.Vector3();
  const low = new T.Vector3(), high = new T.Vector3();
  const lattice = [nx, ny, zs.length], strides = [1, nx, plane];
  const spacing = [xs[1] - xs[0], ys[1] - ys[0], zs[1] - zs[0]];
  function normal(index, corner, result) {
    const current = [column + corner[0], row + corner[1], depth + corner[2]];
    for (let axis = 0; axis < 3; axis++) {
      const before = Number(current[axis] > 0), after = Number(current[axis] + 1 < lattice[axis]);
      const rise = values[index + after * strides[axis]] - values[index - before * strides[axis]];
      result.setComponent(axis, rise / ((after + before) * spacing[axis]));
    }
    return result;
  }
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
    pos.push(point.toArray());
    gradient.lerpVectors(normal(ia, first, low), normal(ib, second, high), t).normalize();
    normals.push(gradient.x, gradient.y, gradient.z);
    let nail = 0;
    for (const { center, dorsal, length, width, radius } of nails) {
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
    const facing = (uy*vz-uz*vy) * (to[0]-from[0]) * spacing[0] +
      (uz*vx-ux*vz) * (to[1]-from[1]) * spacing[1] +
      (ux*vy-uy*vx) * (to[2]-from[2]) * spacing[2];
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
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(pos.flat(), 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}


export function buildExplorerHands(rig, skin, profiles) {
  const material = skin?.isMaterial ? skin.clone() : new T.MeshStandardMaterial({ color: skin, roughness: 0.62 });
  material.vertexColors = true;
  material.userData.blueprintId = 'skin';
  for (const side of ['L', 'R']) {
    const key = rig.name + side;
    if (!handGeometry.has(key)) {
      const profile = prepareHand(profiles[side], side);
      // Keep the most samples across the narrow gaps between digits.
      handGeometry.set(key, [sculptHand(profile, [0.0035, 0.0035, 0.0029]),
        sculptHand(profile, [0.004, 0.004, 0.0033])]);
    }
    const [high, mobile] = handGeometry.get(key);
    // Draw owners may dispose their buffers independently on a context rebuild.
    const skinHand = new T.Mesh(high.clone(), material);
    skinHand.userData.mobileGeometry = mobile.clone();
    skinHand.userData.anatomicalSkin = skinHand.name = (side === 'L' ? 'Left' : 'Right') + ' hand';
    skinHand.castShadow = skinHand.receiveShadow = true;
    rig['hand' + side].add(skinHand);
  }
}
