// Replaceable die-cast armor bolted to a scalloped undertray. Sections are
// described in the part's own polar coordinates so the joints can rotate freely.
import * as T from 'three';

const { lerp, smoothstep, clamp } = T.MathUtils;
export function fitArmor(mesh, side, kind, m, parts) {
  const profile = mesh.geometry.parameters.points.filter((p) => p.x > 0);
  const lo = profile[0].y,
    hi = profile.at(-1).y,
    span = hi - lo;
  const limb = kind === 'thigh' || kind === 'shin',
    depth = mesh.scale.z;
  function radius(h) {
    let i = 1;
    while (i < profile.length - 1 && h > profile[i].y) i++;
    const a = profile[i - 1],
      b = profile[i];
    return lerp(a.x, b.x, clamp((h - a.y) / (b.y - a.y), 0, 1));
  }
  function stamp(theta, t) {
    const ridge = kind === 'shin' ? 0.1 : kind === 'forearm' ? 0.085 : 0.068;
    const sweep = Math.sin(t * Math.PI);
    // Three unequal lobes give light a tibial ridge, convex lateral muscle
    // and a shallow flat face where the service plate seats.
    const front = Math.cos(theta),
      outer = Math.sin(theta) * side;
    return 1 - sweep * (0.045 + ridge * (1 - front * front) + 0.04 * Math.max(0, -outer));
  }
  function shape(g) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        h = p.getY(i),
        z = p.getZ(i),
        a = Math.atan2(x, z);
      const f = stamp(a, (h - lo) / span);
      p.setXYZ(i, x * f, h, z * f);
    }
    g.computeVertexNormals();
  }
  shape(mesh.geometry);
  if (mesh.userData.mobileGeometry) shape(mesh.userData.mobileGeometry);
  const center = (limb ? 0.34 : 0.49) * side,
    arc = limb ? 0.91 : 0.8;
  const surface = (u, v, offset) => {
    const t = lerp(0.09, 0.91, v);
    const chamfer = 0.28 * (Math.max(0, 1 - v / 0.13) + Math.max(0, (v - 0.83) / 0.17));
    const theta = center + (2 * u - 1) * arc * (1 - chamfer) + side * 0.12 * Math.sin(v * Math.PI);
    const y = lerp(lo, hi, t);
    const r = radius(y) * stamp(theta, t) + offset;
    return [
      mesh.position.x + r * Math.sin(theta),
      mesh.position.y + y,
      mesh.position.z + r * depth * Math.cos(theta),
    ];
  };
  function build(steps, rows, lift, edgeInset) {
    const p = [],
      uv = [],
      index = [],
      w = steps + 1,
      face = w * (rows + 1);
    for (let k = 0; k < 2; k++)
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= steps; i++) {
          const u = i / steps,
            v = j / rows;
          const edge = Math.min(u, 1 - u, v, 1 - v);
          const bevel = smoothstep(edge, 0, 0.1);
          p.push(
            ...surface(
              lerp(edgeInset, 1 - edgeInset, u),
              lerp(edgeInset, 1 - edgeInset, v),
              k ? lift - 0.00125 : lift + 0.00145 * bevel,
            ),
          );
          uv.push(u, v);
          if (i && j) {
            const n = k * face + j * w + i;
            if (!k) index.push(n - w - 1, n - w, n, n - w - 1, n, n - 1);
            else index.push(n - w - 1, n, n - w, n - w - 1, n - 1, n);
          }
        }
    const rim = [];
    for (let i = 0; i < steps; i++) rim.push(i);
    for (let j = 0; j < rows; j++) rim.push(j * w + steps);
    for (let i = steps; i > 0; i--) rim.push(rows * w + i);
    for (let j = rows; j > 0; j--) rim.push(j * w);
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i],
        b = rim[(i + 1) % rim.length];
      index.push(a, b + face, b, a, a + face, b + face);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }
  for (const [mat, lift, inset] of [
    [m.graphite, 0.0006, 0],
    [m.titanium, 0.002, 0.018],
    [m.enamel, 0.0032, 0.032],
  ]) {
    const piece = parts.part(mesh.parent, build(12, 12, lift, inset), mat);
    piece.userData.mobileGeometry = build(7, 7, lift, inset);
    if (mat === m.enamel) piece.userData.garmentSurface = mesh.userData.garmentSurface;
  }
  for (const v of [0.17, 0.83]) {
    const [x, y, z] = surface(side > 0 ? 0.8 : 0.2, v, 0.0045);
    const n = new T.Vector3(x - mesh.position.x, 0, (z - mesh.position.z) / depth ** 2).normalize();
    const along = new T.Vector3(1, 0, 0).cross(n).normalize();
    const screw = parts.part(
      mesh.parent,
      new T.CylinderGeometry(limb ? 0.0033 : 0.0027, limb ? 0.0036 : 0.0029, 0.0013, 12),
      m.titanium,
      x,
      y,
      z,
    );
    screw.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
    const axis = new T.Vector3()
      .crossVectors(n, along)
      .addScaledVector(along, 0.72)
      .normalize()
      .multiplyScalar(0.00155);
    const pos = new T.Vector3(x, y, z).addScaledVector(n, 0.00085);
    parts.rod(
      mesh.parent,
      m.graphite,
      pos.clone().sub(axis).toArray(),
      pos.clone().add(axis).toArray(),
      0.00043,
    ).userData.highDetail = true;
  }
}
