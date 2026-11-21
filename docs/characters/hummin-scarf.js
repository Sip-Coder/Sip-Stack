// A single knitted loop winds around the collar bearing. The two overlapping
// folds are shaped into its outer wall; the scarf is hollow around the neck.
import * as T from 'three';

export function makeScarf(rig, wool, apron) {
  const tau = Math.PI * 2;
  const center = (a) =>
    0.171 -
    0.017 * Math.max(0, Math.cos(a)) ** 2 -
    0.016 * Math.max(0, -Math.cos(a)) ** 2 +
    0.001 * Math.sin(a);
  const height = (a) =>
    0.01 + 0.021 * Math.max(0, Math.cos(a)) ** 2 + 0.016 * Math.max(0, -Math.cos(a)) ** 2;
  const meridian = [
    [0, 0.918],
    [0.04, 0.955],
    [0.12, 1.02],
    [0.23, 1.05],
    [0.34, 1],
    [0.43, 0.936],
    [0.53, 1.015],
    [0.66, 1.04],
    [0.78, 1.006],
    [0.88, 0.962],
    [0.96, 0.95],
    [1, 0.915],
    [0.99, 0.877],
    [0.86, 0.887],
    [0.2, 0.904],
    [0.02, 0.885],
    [0, 0.918],
  ];
  const n = 128,
    pos = [],
    uv = [],
    indices = [];
  for (let v = 0; v < meridian.length; v++) {
    const [h, rim] = meridian[v];
    for (let i = 0; i <= n; i++) {
      const a = (tau * i) / n,
        sa = Math.sin(a),
        ca = Math.cos(a);
      const r = rim * (1 + 0.014 * Math.sin(32 * a + 5 * h));
      const twist = 0.004 * Math.sin(a - 0.2) * (h - 0.4);
      const width = 0.094 - 0.023 * Math.exp(-((ca / 0.5) ** 2));
      const y = center(a) + height(a) * (2 * h - 1) + twist;
      const taper = 1 - 0.16 * ca ** 4 * T.MathUtils.smoothstep(y, 0.117, 0.15);
      pos.push(sa * width * r, y, ca * (ca > 0 ? 0.103 : 0.088) * r * (1 - 0.18 * h ** 3) * taper + 0.002);
      uv.push(i / n, h + 0.12 * Math.sin(a));
      if (i && v) {
        const b = v * (n + 1) + i;
        indices.push(b - n - 2, b - n - 1, b, b - n - 2, b, b - 1);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const tucked = g.attributes.position.clone();
  for (let i = 0; i < tucked.count; i++) {
    const y = tucked.getY(i);
    tucked.setY(i, y - 0.018 * T.MathUtils.smoothstep(y, 0.155, 0.182));
  }
  g.morphAttributes.position = [tucked];
  const collar = new T.Mesh(g, wool);
  collar.name = 'scarf';
  collar.castShadow = collar.receiveShadow = true;
  rig.chest.add(collar);
  apron.surfaces.scarf = [collar];
  apron.pairs.push({ outer: 'scarf', inner: 'chassis' }, { outer: 'scarf', inner: 'head' });

  // The loose end slips under the left side of the cowl, then rests outside
  // the apron straps. The rounded hem carries individually twisted tassels.
  const tail = new T.Group();
  tail.name = 'Scarf free end';
  rig.chest.add(tail);
  tail.position.set(0.077, 0.125, 0.083);
  const profile = [
    [0, 0, 0, 0.0083],
    [0.02, 0.01, 0.007, 0.015],
    [0.06, 0.015, 0.011, 0.017],
    [0.102, 0.023, 0.011, 0.018],
    [0.14, 0.027, 0.006, 0.018],
    [0.161, 0.028, 0.004, 0.018],
    [0.179, 0.029, 0.003, 0.018],
  ];
  const at = (u, v) => {
    const d = 0.179 * v;
    let i = 1;
    while (i + 1 < profile.length && d > profile[i][0]) i++;
    const a = profile[i - 1],
      b = profile[i];
    const t = (d - a[0]) / (b[0] - a[0]);
    const smooth = t * t * (3 - 2 * t);
    const lateral = T.MathUtils.lerp(a[1], b[1], smooth);
    const z = T.MathUtils.lerp(a[2], b[2], t);
    const width = T.MathUtils.lerp(a[3], b[3], t);
    const across = 2 * u - 1;
    const tuck = 1 - T.MathUtils.smoothstep(v, 0, 0.19);
    return new T.Vector3(
      lateral + width * across - 0.006 * tuck,
      -d + 0.003 * across * v * v + 0.0115 * tuck,
      z + 0.0022 * Math.sin(across * 4 + 0.6 * v) - 0.006 * across - 0.006 * tuck,
    );
  };
  const mesh = apron.patch(tail, 'scarfTail', wool, 12, 42, at, 0.0022);
  const strands = [];
  for (let i = 0; i < 11; i++) {
    const p = at((i + 0.5) / 11, 1),
      length = 0.014 + 0.005 * (1 + Math.cos(i * 1.7));
    const strand = new T.CatmullRomCurve3([
      p.clone().add(new T.Vector3(0, 0.0008, -0.0006)),
      p.clone().add(new T.Vector3(0.0009, -length * 0.38, 0.0005)),
      p.clone().add(new T.Vector3(0.0005 * Math.sin(i), -length * 0.66, 0.0011)),
      p.clone().add(new T.Vector3(0.0015 * Math.sin(i * 0.81), -length, 0.0015)),
    ]);
    const yarn = new T.TubeGeometry(strand, 8, 0.00113, 5, false);
    const ends = Array.from(yarn.index.array);
    const last = 8 * 6;
    for (let j = 1; j < 4; j++) ends.push(0, j + 1, j, last, last + j, last + j + 1);
    yarn.setIndex(ends);
    strands.push(yarn);
  }
  const fringeGeom = apron.merge(strands);
  const fringe = new T.Mesh(fringeGeom, wool);
  fringe.name = 'Scarf tassels';
  fringe.castShadow = fringe.receiveShadow = true;
  tail.add(fringe);
  apron.surfaces.scarfTail.push(fringe);
  for (const geometry of strands) geometry.dispose();
  apron.pairs.push({ outer: 'scarfTail', inner: 'bib' }, { outer: 'scarfTail', inner: 'scarf' });
  let swing = 0,
    velocity = 0,
    lastTime = -1;
  function step(frame, accel, jolt) {
    if (frame.time <= lastTime) swing = velocity = 0;
    lastTime = frame.time;
    const drive = T.MathUtils.clamp(
      0.006 * accel +
        0.003 * jolt +
        0.06 * frame.turn +
        0.045 * Math.sin(frame.phase) * Math.min(1, frame.speed / 3.9),
      -0.16,
      0.16,
    );
    velocity += ((drive - swing) * 88 - velocity * 13) * frame.dt;
    swing += velocity * frame.dt;
    tail.rotation.z = swing * 0.26;
    const knee = Math.max(-rig.thighL.rotation.x, -rig.thighR.rotation.x, 0);
    const raisedKnee = T.MathUtils.smoothstep(knee, 0.52, 1.3);
    // The knit bunches over the bent thigh instead of dragging through the knee bearing.
    tail.scale.y = 1 - 0.36 * raisedKnee;
    tail.position.z =
      0.083 + 0.008 * raisedKnee + (frame.emote >= 0 ? 0.008 * Math.sin(Math.PI * frame.emote) ** 2 : 0);
    tail.rotation.x =
      -0.06 -
      Math.abs(swing) * 0.77 -
      0.28 * raisedKnee -
      0.49 * T.MathUtils.smoothstep(rig.chest.rotation.x, 0.14, 0.38);
    const raised = Math.max(Math.abs(rig.upperArmL.rotation.z), Math.abs(rig.upperArmR.rotation.z));
    collar.position.y = 0.001 * raisedKnee - 0.002 * T.MathUtils.smoothstep(raised, 1.4, 2.5);
    collar.scale.z = 1 + 0.11 * raisedKnee;
    collar.morphTargetInfluences[0] = Math.max(
      raisedKnee,
      T.MathUtils.smoothstep(raised, 1.4, 2.5),
      T.MathUtils.smoothstep(rig.chest.rotation.x, 0.14, 0.31),
    );
    collar.scale.x =
      1 - 0.42 * T.MathUtils.smoothstep(raised, 1.4, 2.5) - 0.09 * T.MathUtils.smoothstep(knee, 0.8, 1.4);
  }
  return { tail, mesh, step };
}
