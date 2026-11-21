// Field stowage follows the arc of the rear waist. Each bag is a rolled-
// leather case with a shaped lid, gusseted corners and brass closure.
import * as T from 'three';

export function fitPouches(rig, apron, m, parts) {
  const { darkLeather, leather, leatherEdge, thread, agedBrass } = m;
  const { group, rod, oval, line } = parts;
  function casework(name, x, y, z, angle, width, height, depth, base) {
    const frame = group(name === 'rearPack' ? rig.chest : apron.skirt, x, y, z);
    frame.rotation.y = angle;
    const radius = 0.004;
    const outline = new T.Shape();
    outline.moveTo(-width / 2 + radius, 0);
    outline.lineTo(width / 2 - radius, 0);
    outline.quadraticCurveTo(width / 2, 0, width / 2, -radius);
    outline.lineTo(width / 2, -height + radius);
    outline.quadraticCurveTo(width / 2, -height, width / 2 - radius, -height);
    outline.lineTo(-width / 2 + radius, -height);
    outline.quadraticCurveTo(-width / 2, -height, -width / 2, -height + radius);
    outline.lineTo(-width / 2, -radius);
    outline.quadraticCurveTo(-width / 2, 0, -width / 2 + radius, 0);
    const geometry = new T.ExtrudeGeometry(outline, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.0022,
      bevelThickness: 0.0022,
      bevelSegments: 3,
      curveSegments: 5,
    });
    const backShape = (x, y) => {
      const t = T.MathUtils.clamp(-y / height, 0, 1);
      return name === 'rearPack'
        ? -0.015 * (Math.exp((-t * t) / 0.006) + 0.8 * Math.exp(-((1 - t) ** 2) / 0.006))
        : 0;
    };
    if (name === 'rearPack') {
      // The pannier has rounded top and bottom gussets. Carry the buckle
      // stitching across the same turn as the lid of the bag.
      const attr = geometry.attributes.position;
      for (let i = 0; i < attr.count; i++)
        attr.setZ(i, attr.getZ(i) + backShape(attr.getX(i), attr.getY(i)));
      geometry.computeVertexNormals();
    }
    const body = new T.Mesh(geometry, base);
    body.name = name;
    body.castShadow = body.receiveShadow = true;
    frame.add(body);
    (apron.surfaces[name] ??= []).push(body);
    apron.pairs.push({ outer: name, inner: 'chassis' }, { outer: name, inner: 'belt' });
    const lid = (u, v) => {
      const t = u * 2 - 1;
      const y = 0.0002 - v * height * (0.45 - 0.13 * t * t);
      return new T.Vector3(
        t * (width / 2 - 0.0018),
        y,
        depth +
          (name === 'rearPack' ? 0.005 : 0.0034) +
          0.0017 * (1 - t * t) +
          backShape((t * width) / 2, y),
      );
    };
    apron.patch(frame, name, leather, 14, 8, lid, 0.0011);
    const hem = [];
    for (let i = 0; i <= 12; i++) {
      const q = lid(i / 12, 0.96);
      q.z += 0.00046;
      hem.push(q.toArray());
    }
    line(frame, leatherEdge, hem, 0.00074);
    for (let i = 0; i < 12; i++) {
      const q = lid((i + 0.12) / 12, 0.88),
        r = lid((i + 0.64) / 12, 0.88);
      q.z += 0.00062;
      r.z += 0.00062;
      rod(frame, thread, q.toArray(), r.toArray(), 0.00042);
    }
    const clasp = lid(0.5, 0.73);
    oval(frame, agedBrass, clasp.x, clasp.y, clasp.z + 0.001, 0.0032, 0.0032, 0.001);
    return frame;
  }
  // The back pad fills the hollow between the bag and its rounded host.
  // The recessed center channel clears the crossing leather shoulder straps.
  const mount = group(rig.chest, 0, 0, 0);
  for (const side of [-1, 1]) {
    const centers = [
      [-0.058, -0.084, 0.004, 0.019],
      [-0.046, -0.086, 0.01, 0.02],
      [-0.019, -0.09, 0.011, 0.016],
      [0.007, -0.093, 0.012, 0.015],
      [0.031, -0.086, 0.012, 0.02],
      [0.069, -0.085, 0.012, 0.022],
      [0.095, -0.085, 0.011, 0.021],
      [0.108, -0.084, 0.006, 0.015],
    ];
    const p = [],
      indices = [],
      uv = [];
    const slices = 20;
    for (let j = 0; j < centers.length; j++) {
      const [y, cz, rx, rz] = centers[j];
      for (let k = 0; k <= slices; k++) {
        const a = (k / slices) * Math.PI * 2;
        p.push(side * 0.053 + rx * Math.sin(a), y, cz + rz * Math.cos(a));
        uv.push(k / slices, j / (centers.length - 1));
        if (j && k) {
          const i = j * (slices + 1) + k;
          indices.push(i - slices - 2, i - slices - 1, i, i - slices - 2, i, i - 1);
        }
      }
    }
    for (let k = 1; k < slices - 1; k++) {
      const end = (centers.length - 1) * (slices + 1);
      indices.push(0, k + 1, k, end, end + k, end + k + 1);
    }
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    geom.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    const cushion = new T.Mesh(geom, darkLeather);
    cushion.name = 'Rear mounting pad';
    cushion.receiveShadow = cushion.castShadow = true;
    mount.add(cushion);
    (apron.surfaces.rearPack ??= []).push(cushion);
  }
  casework('rearPack', 0, 0.114, -0.106, Math.PI, 0.13, 0.183, 0.015, darkLeather);
  const mounts = [];
  for (const [side, id] of [
    [1, 'pouchL'],
    [-1, 'pouchR'],
  ]) {
    const frame = casework(id, 0, 0, 0, 0, 0.047, 0.055, 0.0095, leather);
    mounts.push({ frame, cell: side === 1 ? 31 : 11, side });
  }
  const beltFace = apron.patch(
    apron.skirt,
    'frontBelt',
    leather,
    30,
    4,
    (u, v) => {
      const p = apron.pattern((6 + u * 30) / 42, (3 + v * 4) / 23);
      p.z += 0.008;
      return p;
    },
    0.0015,
  );
  apron.pairs.push({ outer: 'frontBelt', inner: 'apronSkirt' });
  const buckle = group(apron.skirt, 0, 0, 0);
  const loop = [];
  for (let k = 0; k <= 36; k++) {
    const a = (2 * Math.PI * k) / 36;
    loop.push([0.015 * Math.cos(a), 0.009 * Math.sin(a), 0.001]);
  }
  line(buckle, agedBrass, loop, 0.0021);
  rod(buckle, agedBrass, [0, -0.005, 0.001], [0.005, 0.005, 0.001], 0.00125);
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
    apron.updateNormals(beltFace.geometry);
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
  return placeGear;
}
