import * as T from 'three';

// Recover the anterior support from the 94deb9d sculpture. Only the five
// lower-face sections needed by the original expression paths are sampled.
function originalLipSupport() {
  const rows = [
    [0.006, 0.015, 0.018, 0.005], [0.012, 0.031, 0.031, 0.006],
    [0.025, 0.045, 0.039, 0.0035], [0.042, 0.051, 0.046, 0.001],
    [0.053, 0.0545, 0.049, 0], [0.067, 0.058, 0.052, 0],
  ];
  const profile = new T.CatmullRomCurve3(rows.map(([y, x, z]) => new T.Vector3(x, y, z)), false, 'catmullrom', 0.32);
  const offset = new T.CatmullRomCurve3(rows.map(([y, , , z]) => new T.Vector3(z, y, 0)), false, 'catmullrom', 0.32);
  const positions = new Float32Array(9 * 37 * 3);
  const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  for (let j = 0; j < 9; j++) {
    const t = (j + 1) / 10, point = profile.getPoint(t), cz = offset.getPoint(t).x;
    for (let i = 0; i < 37; i++) {
      const a = (i < 18 ? i + 54 : i - 18) / 72 * (2 * Math.PI);
      const x = Math.fround(point.x * Math.sin(a)), y = Math.fround(point.y);
      const z = Math.fround(cz + point.z * Math.cos(a));
      const ax = Math.abs(x), front = T.MathUtils.smoothstep(z, 0.001, 0.031);
      const cheek = bell(y, 0.062, 0.017) * bell(ax, 0.039, 0.017);
      const jaw = bell(y, 0.028, 0.015) * bell(ax, 0.038, 0.017);
      const brow = bell(y, 0.088, 0.008) * bell(ax, 0.026, 0.020);
      const orbit = bell(y, 0.077, 0.013) * bell(ax, 0.026, 0.016);
      const dorsum = 0.0087 * bell(x, 0, 0.008) * bell(y, 0.066, 0.021);
      const tip = 0.0150 * bell(x, 0, 0.0086) * bell(y, 0.0525, 0.0083);
      const ala = 0.0064 * bell(ax, 0.0072, 0.0060) * bell(y, 0.0493, 0.0053);
      const philtrum = 0.0020 * bell(ax, 0.0036, 0.0028) * bell(y, 0.0395, 0.0060);
      const at = 3 * (37 * j + i);
      positions[at] = x + Math.sign(x) * front * (0.0017 * cheek + 0.0012 * jaw);
      positions[at + 1] = y;
      positions[at + 2] = z + front * (0.0066 * cheek + 0.0051 * brow + 0.0024 * jaw - 0.0046 * orbit +
        dorsum + tip + ala + philtrum + 0.0040 * bell(y, 0.017, 0.011) * bell(x, 0, 0.015));
    }
  }
  function triangle(x, y, i, j, k) {
    const ax = positions[i], ay = positions[i + 1];
    const bx = positions[j] - ax, by = positions[j + 1] - ay;
    const cx = positions[k] - ax, cy = positions[k + 1] - ay;
    const area = bx * cy - by * cx;
    if (area <= 1e-12) return -Infinity;
    const u = ((x - ax) * cy - (y - ay) * cx) / area;
    const v = (bx * (y - ay) - by * (x - ax)) / area;
    if (u < -0.00001 || v < -0.00001 || u + v > 1.00001) return -Infinity;
    return positions[i + 2] * (1 - u - v) + positions[j + 2] * u + positions[k + 2] * v;
  }
  return (x, y) => {
    const stride = 37 * 3;
    let row = 0;
    while (row < 7 && y > positions[(row + 1) * stride + 1]) row++;
    // Preserve the old angular traversal order at the shared centre edge.
    for (let i = 0; i < 36; i++) {
      const a = row * stride + (i + 18) % 36 * 3;
      const b = a + 3;
      const z = Math.max(triangle(x, y, a, b, a + stride), triangle(x, y, b, b + stride, a + stride));
      if (Number.isFinite(z)) return z;
    }
    return -Infinity;
  };
}

// Re-seat the original lip sculpt and all five expressions as one rigidly
// translated surface in world space, cancelling the new carrier scale.
export function seatSippyMouth(parent, field, incisor, headScale = 1) {
  const make = (color, roughness) => new T.MeshStandardMaterial({ color, roughness });
  const mouth = new T.MeshPhysicalMaterial({ color: '#5a2b25', roughness: 0.56, specularIntensity: 0.37 });
  const enamel = make('#f5e7d6', 0.39), lip = make('#be7c63', 0.58);
  const depth = originalLipSupport(), origin = depth(0, 0.032);
  const sx = 1.103448275862069 / headScale, sy = 1.2152009186969581 / headScale, sz = 1.2894854274872642 / headScale;
  const xM = field.xM, yM = field.yM + 0.0022;
  const zM = Math.max(incisor[2] + 0.0054 / headScale, field.front(xM, yM)) + 0.00105;
  // Bring the continuous face under the old oral surface through the full
  // expression envelope. The surrounding cheeks retain their anatomical fit.
  field.mouthDepth = (x, y, z) => {
    const xx = (x - xM) / sx, yy = (y - yM) / sy + 0.032;
    const { smoothstep, lerp } = T.MathUtils;
    const edge = Math.abs(xx);
    const lipTop = lerp(0.0408, 0.0425, smoothstep(edge, 0.009, 0.022));
    const t = (1 - smoothstep(edge, 0.026, 0.039)) *
      smoothstep(yy, 0.011, 0.016) * (1 - smoothstep(yy, lipTop, lipTop + 0.006));
    const source = t ? depth(xx, Math.min(yy, lipTop)) : -Infinity;
    if (!Number.isFinite(source)) return z;
    const contour = zM + (source - origin - 0.00076) * sz;
    // Carry the original neutral vermilion into the skin without extending
    // the fixed skin forward to the wider surprise and laugh endpoints.
    const outward = smoothstep(yy, 0.023, 0.027) * (1 - smoothstep(yy, 0.035, 0.040));
    return lerp(z, contour, t * (contour > z ? outward : 1));
  };
  const pieces = [];
  function sew(layer, material) {
    const cols = 32,
      rows = layer === 'opening' || layer === 'teeth' ? 2 : 6;
    const indices = [],
      g = new T.BufferGeometry();
    function expression(lift, focus, round = 0, asymmetry = 0) {
      const v = [];
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= cols; i++) {
          const t = j / rows,
            u = (2 * i) / cols - 1,
            teeth = layer === 'teeth';
          const s = teeth ? 0.86 * u : u,
            fade = Math.max(0, 1 - s * s);
          const x = s * (0.0219 + 0.0035 * lift - 0.0015 * focus - 0.0105 * round);
          const corners = (0.0031 + 0.0044 * lift - 0.0038 * focus - 0.0049 * round) * s * s;
          const line = 0.032 + corners + (0.0007 + 0.0042 * asymmetry) * s * Math.abs(s);
          const high = line + fade * (0.0008 + 0.0021 * lift - 0.0003 * focus + 0.0057 * round);
          const low = line - fade * (0.0019 + 0.009 * lift - 0.0009 * focus + 0.0109 * round);
          let y, z;
          if (layer === 'opening') {
            y = T.MathUtils.lerp(low, high, t);
            z = 0.00038;
          } else if (teeth) {
            y = high - fade * (0.00006 + 0.0027 * lift) * (1 - t);
            z = 0.00059;
          } else {
            const top = layer === 'upper';
            const width = top ? 0.0017 + 0.00075 * Math.exp(-((Math.abs(s) - 0.32) ** 2) / 0.015) : 0.0028;
            const edge = top ? high : low;
            y = top ? edge + t * width * fade : edge - (1 - t) * width * fade;
            const edgeWeight = top ? 1 - t : t;
            z = -0.00010 + 0.00065 * edgeWeight + (0.00115 - 0.00025 * focus) * Math.sin(t * Math.PI) * fade;
          }
          const support = depth(x, y);
          v.push(x, y, (Number.isFinite(support) ? support : 0.032) + z);
        }
      return new T.Float32BufferAttribute(v, 3);
    }
    g.setAttribute('position', expression(0, 0));
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * (cols + 1) + i;
        indices.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
      }
    g.setIndex(indices);
    g.computeVertexNormals();
    g.morphAttributes.position = [
      expression(1, 0), expression(0, 1), expression(0, 0, 1),
      expression(0.45, 0, 0, 1), expression(0.45, 0, 0, -1),
    ];
    // Morph the shading normals along with the cheek and lower lip.
    g.morphAttributes.normal = g.morphAttributes.position.map((a) => {
      const posed = new T.BufferGeometry();
      posed.setAttribute('position', a);
      posed.setIndex(g.index);
      posed.computeVertexNormals();
      const normals = posed.attributes.normal;
      posed.dispose();
      return normals;
    });
    for (const a of [g.attributes.position, ...g.morphAttributes.position])
      for (let i = 0; i < a.count; i++)
        a.setXYZ(i, xM + a.getX(i) * sx, yM + (a.getY(i) - 0.032) * sy, zM + (a.getZ(i) - origin) * sz);
    const normals = new T.Matrix3().set(1 / sx, 0, 0, 0, 1 / sy, 0, 0, 0, 1 / sz);
    for (const a of [g.attributes.normal, ...g.morphAttributes.normal]) a.applyNormalMatrix(normals);
    const m = new T.Mesh(g, material);
    const names = { opening: 'Mouth cavity', teeth: 'Teeth', upper: 'Upper lip', lower: 'Lower lip' };
    m.name = names[layer];
    m.userData.anatomicalSkin = names[layer];
    if (layer === 'upper' || layer === 'lower') m.userData.faceRegion = 'lips';
    parent.add(m);
    pieces.push(m);
  }
  sew('opening', mouth);
  sew('teeth', enamel);
  sew('upper', lip);
  sew('lower', lip);
  return (smile, concentration, cue) => {
    const smiling = Math.max(smile, (cue?.mouthOpen ?? 0) * 0.8);
    const surprise = cue?.surprise ?? 0, asymmetry = cue?.asymmetry ?? 0;
    for (const piece of pieces) {
      const smirk = Math.abs(asymmetry) * (1 - surprise);
      piece.morphTargetInfluences[0] = smiling * (1 - concentration) * (1 - surprise - smirk);
      piece.morphTargetInfluences[1] = concentration * (1 - surprise - smirk);
      piece.morphTargetInfluences[2] = surprise;
      piece.morphTargetInfluences[3] = asymmetry >= 0 ? smirk : 0;
      piece.morphTargetInfluences[4] = asymmetry < 0 ? smirk : 0;
    }
  };
}
