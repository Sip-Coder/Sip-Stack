// Roma's face is sculpted in one head-local frame. The continuous skin and
// eye relief share the same surface, so profile shots show a single silhouette.
import * as T from 'three';

const tau = 2 * Math.PI;
const { clamp, lerp, smoothstep } = T.MathUtils;
const gaussian = (x, y, wx, wy) => Math.exp(-((x / wx) ** 2 + (y / wy) ** 2));
const sections = [
  [0.003, 0.002, 0.003, 0.018],
  [0.009, 0.022, 0.025, 0.017],
  [0.022, 0.039, 0.039, 0.014],
  [0.039, 0.053, 0.048, 0.01],
  [0.06, 0.062, 0.054, 0.007],
  [0.08, 0.068, 0.055, 0.004],
  [0.1, 0.066, 0.055, 0.003],
  [0.122, 0.061, 0.051, 0],
  [0.14, 0.046, 0.043, -0.002],
  [0.149, 0.019, 0.023, -0.005],
  [0.151, 0.002, 0.004, -0.006],
];

function section(y) {
  let i = 1;
  while (i < sections.length - 1 && sections[i][0] < y) i++;
  const a = sections[i - 1],
    b = sections[i];
  const prev = sections[Math.max(0, i - 2)],
    next = sections[Math.min(sections.length - 1, i + 1)];
  const d = b[0] - a[0],
    t = clamp((y - a[0]) / d, 0, 1);
  const t2 = t * t,
    t3 = t2 * t;
  return [1, 2, 3].map(
    (k) =>
      (2 * t3 - 3 * t2 + 1) * a[k] +
      ((t3 - 2 * t2 + t) * d * (b[k] - prev[k])) / (b[0] - prev[0]) +
      (-2 * t3 + 3 * t2) * b[k] +
      ((t3 - t2) * d * (next[k] - a[k])) / (next[0] - a[0]),
  );
}

function relief(x, y) {
  const ax = Math.abs(x);
  return (
    0.0067 * gaussian(x, y - 0.069, 0.009, 0.025) +
    0.0128 * gaussian(x, y - 0.0515, 0.0104, 0.0103) +
    0.0052 * gaussian(ax - 0.008, y - 0.0469, 0.0051, 0.0047) +
    0.0065 * gaussian(ax - 0.039, y - 0.066, 0.017, 0.012) -
    0.0047 * gaussian(ax - 0.028, y - 0.084, 0.019, 0.013) +
    0.0026 * gaussian(ax - 0.025, y - 0.102, 0.021, 0.0075) +
    0.0035 * gaussian(x, y - 0.033, 0.026, 0.009) +
    0.0028 * gaussian(x, y - 0.017, 0.018, 0.01)
  );
}

function zAt(x, y) {
  const [rx, rz, offset] = section(y);
  const front = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
  return offset + front * (rz + relief(x, y));
}

function buildSkin(head, h, c) {
  const skin = new T.Color(c.skin),
    pigment = new T.Color(),
    shade = new T.Color('#bc7557');
  const blush = new T.Color('#c36654'),
    lids = new T.Color('#a76255'),
    light = new T.Color('#eea981');
  h.face(head, 72, 46, (u, v) => {
    // Put the joined edge at the back, where the hair covers the scalp.
    const y = lerp(0.003, 0.151, v),
      [rx, rz, offset] = section(y),
      a = u * tau - Math.PI;
    const x = rx * Math.sin(a),
      front = Math.cos(a),
      face = Math.max(0, front);
    const cheek = gaussian(Math.abs(x) - 0.0365, y - 0.06, 0.021, 0.0107);
    const nose = gaussian(x, y - 0.048, 0.013, 0.0084);
    const orbit = gaussian(Math.abs(x) - 0.032, y - 0.094, 0.021, 0.005);
    pigment
      .copy(skin)
      .lerp(shade, 0.21 * (1 - face) + 0.09 * gaussian(x, y - 0.012, 0.05, 0.018))
      .lerp(light, face * 0.22 * gaussian(x, y - 0.108, 0.04, 0.021))
      .lerp(blush, face * (0.68 * cheek + 0.48 * nose))
      .lerp(lids, face * orbit * 0.38);
    return [x, y, offset + rz * front + face * relief(x, y), pigment];
  });

  // Freckles follow the cheek relief and vary by side, size and colour.
  const freckles = [
    [0.012, 0.059, 0.47],
    [0.019, 0.064, 0.63],
    [0.023, 0.055, 0.54],
    [0.027, 0.061, 0.83],
    [0.031, 0.065, 0.44],
    [0.034, 0.057, 0.64],
    [0.039, 0.061, 0.74],
    [0.044, 0.056, 0.52],
    [0.046, 0.068, 0.34],
    [0.051, 0.061, 0.54],
  ];
  for (const side of [-1, 1])
    for (const [i, [offset, height, strength]] of freckles.entries()) {
      if (side > 0 && i === 2) continue;
      const x = side * offset + 0.0009 * Math.sin(i * 2 + side);
      const y = height + 0.002 * Math.sin(i * 1.9 + side);
      const radius = 0.00045 + 0.00053 * strength;
      const tone = skin.clone().lerp(new T.Color('#a45d49'), 0.85 * strength);
      h.face(head, 1, 8, (r, u) => {
        const angle = u * tau,
          a = x + r * radius * Math.cos(angle),
          b = y + 0.8 * r * radius * Math.sin(angle);
        return [a, b, zAt(a, b) + 0.00045, tone];
      });
    }
}

function buildEye(head, h, s) {
  const cx = 0.0274,
    cy = 0.081,
    w = 0.0198;
  const eye = h.group(head, 'eye ' + s, s * cx, cy, 0, true);
  eye.scale.x = s;
  const eyeball = (x, y) =>
    zAt(s * (cx + x), cy + y) +
    0.00115 +
    0.0042 * Math.max(0, 1 - (x / w) ** 2 - (y / 0.0145) ** 2);
  const contour = (x, top) => {
    const norm = clamp(x / w, -1, 1),
      roundness = Math.sqrt(Math.max(0, 1 - norm * norm));
    return 0.0016 * norm + roundness * (top ? 0.0128 - 0.0018 * norm : -0.0087 - 0.0008 * norm);
  };
  const white = new T.Color('#fff4e7'),
    corners = new T.Color('#c49685'),
    tint = new T.Color();
  h.face(eye, 26, 11, (u, v) => {
    const a = 2 * u - 1,
      x = w * a,
      y = lerp(contour(x, false), contour(x, true), v);
    tint.copy(white).lerp(corners, 0.51 * Math.abs(a) ** 4 + 0.1 * v ** 4);
    return [x, y, eyeball(x, y), tint];
  });
  const iris = h.group(eye, 'eye iris ' + s, 0, 0, 0, true);
  const walnut = new T.Color('#493022'),
    cognac = new T.Color('#865630'),
    limbal = new T.Color('#281d19');
  h.face(iris, 8, 36, (r, u) => {
    const angle = u * tau,
      x = -0.0007 + r * 0.0109 * Math.cos(angle);
    const y = clamp(
      0.001 + r * 0.0112 * Math.sin(angle),
      contour(x, false) + 0.00016,
      contour(x, true) - 0.00016,
    );
    const fibres =
      0.52 + 0.23 * Math.sin(13 * angle + 4 * r) + 0.12 * Math.sin(19 * angle - 10 * r);
    const caramel = 0.42 - 0.26 * Math.sin(angle) + fibres * 0.3;
    tint
      .copy(walnut)
      .lerp(cognac, clamp(caramel, 0, 0.85))
      .lerp(limbal, smoothstep(r, 0.78, 1));
    return [x, y, eyeball(x, y) + 0.00023, tint];
  });
  h.face(iris, 4, 24, (r, u) => {
    const angle = u * tau,
      x = -0.0007 + r * 0.0065 * Math.cos(angle),
      y = 0.001 + r * 0.0071 * Math.sin(angle);
    return [x, y, eyeball(x, y) + 0.00052, '#1b1312'];
  });
  const shine = s * 0.0028 - 0.0007;
  h.oval(
    iris,
    '#fff8ec',
    shine,
    0.0057,
    eyeball(shine, 0.0057) + 0.0008,
    0.0019,
    0.0021,
    0.00035,
    0,
    0,
    0,
    false,
    10,
  );
  const low = -s * 0.0037 - 0.0007;
  h.oval(
    iris,
    '#efddbf',
    low,
    -0.0035,
    eyeball(low, -0.0035) + 0.0008,
    0.00082,
    0.0007,
    0.0003,
    0,
    0,
    0,
    false,
    8,
  );

  const upper = [],
    lower = [];
  for (let i = 0; i <= 16; i++) {
    const x = w * (i / 8 - 1),
      hi = contour(x, true),
      lo = contour(x, false);
    upper.push([x, hi, eyeball(x, hi) + 0.00034]);
    lower.push([x, lo, eyeball(x, lo) + 0.00019]);
  }
  upper.push([w + 0.0022, 0.0034, zAt(s * (cx + w + 0.0022), cy + 0.0034) + 0.00068]);
  h.thread(eye, '#35211d', upper, 0.00121, {
    segments: 20,
    sides: 6,
    widths: [0.24, 0.65, 1.15, 1.22, 0.13],
  });
  h.thread(eye, '#a56a52', lower, 0.00066, {
    segments: 16,
    sides: 4,
    widths: [0.1, 0.68, 0.96, 0.59, 0.13],
  });
  // The folded skin over the lid shades its upper rim. The lash remains
  // attached to its edge when the eye squints.
  const lid = new T.Color('#b97661'),
    lidEdge = new T.Color('#8f5448');
  h.face(eye, 27, 4, (u, v) => {
    const x = (2 * u - 1) * w,
      top = contour(x, true);
    const rise = Math.sin(Math.PI * u) * (0.0022 + 0.0023 * u);
    const y = top + rise * v;
    const plane = zAt(s * (cx + x), cy + y);
    tint.copy(lidEdge).lerp(lid, v);
    return [x, y, lerp(eyeball(x, top) - 0.0004, plane + 0.00027, v), tint];
  });
  // When a lid closes the lash traces the cheek instead of compressing the
  // open eye into a flat stripe. Its clearance is driven by the same blink.
  const closed = h.group(head, 'closed eyelid ' + s, s * cx, cy, 0, true);
  closed.scale.x = s;
  const crescent = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 8 - 1,
      x = u * w;
    const y = 0.0046 * (1 - u * u) + 0.00078 * u - 0.0013;
    crescent.push([x, y, zAt(s * (cx + x), cy + y) + 0.0006]);
  }
  h.thread(closed, '#422923', crescent, 0.00102, {
    segments: 18,
    sides: 5,
    widths: [0.13, 0.91, 1, 0.72, 0.1],
  });

  const browBase = 0.104;
  const brow = h.group(head, 'brow ' + s, s * cx, browBase, 0, true);
  const browTint = new T.Color('#412720'),
    browTip = new T.Color('#75493b');
  h.face(brow, 27, 5, (u, v) => {
    const x = lerp(-0.0165, 0.0222, u);
    const arch = 0.003 + 0.0059 * Math.sin(Math.PI * u ** 1.26) - 0.0038 * u * u;
    const thickness = 0.0053 * Math.sin(Math.PI * u ** 0.51) ** 0.65;
    const y = arch + ((2 * v - 1) * thickness) / 2;
    tint.copy(browTint).lerp(browTip, 0.16 * Math.abs(2 * v - 1) + 0.31 * smoothstep(u, 0.76, 1));
    return [
      s * x,
      y,
      zAt(s * (cx + x), browBase + y) + 0.00077 + 0.00066 * Math.sin(Math.PI * v),
      tint,
    ];
  });
  return { eye, iris, brow, closed, browBase, cy, side: s };
}

function buildMouth(head) {
  const geometry = new T.BufferGeometry();
  const index = [],
    colors = [],
    rest = [],
    morph = [[], [], [], []];
  // Connect the warm rose cupid's bow to lifted cheek dimples. Each pose
  // shares corresponding vertices for the cavity, teeth, and two lips.
  const tones = [
    ['#4b2225', '#6b3737'],
    ['#f4e7d9', '#fff3e6'],
    ['#a14b40', '#d18371'],
    ['#9b473e', '#c56c5d'],
  ].map(([a, b]) => [new T.Color(a), new T.Color(b)]);
  // Half width, corner lift and bias, upper and lower opening, tooth height.
  const poses = [
    [0.0212, 0.0058, 0.0008, 0.0006, 0.0007, 0],
    [0.0246, 0.0082, 0.0012, 0.0048, 0.0072, 0.0031],
    [0.0106, 0.002, 0, 0.0073, 0.0081, 0],
    [0.0239, 0.0061, 0.0034, 0.0027, 0.0035, 0.00205],
    [0.0203, 0.0012, 0.0003, 0.00022, 0.0003, 0],
  ];
  const tint = new T.Color();
  const origin = 0.0318;
  function sample(u, v, part, pose) {
    const [width, cornerLift, bias, upper, lower, teeth] = poses[pose];
    const a = 2 * u - 1,
      x = a * width;
    const envelope = Math.max(0, 1 - a * a) ** 0.86;
    const corner = cornerLift * Math.abs(a) ** 2.25 + bias * a;
    const top = corner + upper * envelope;
    const low = corner - lower * envelope;
    const cupid = (0.0017 + 0.0014 * gaussian(Math.abs(a) - 0.23, 0, 0.16, 1)) * envelope;
    const volume = Math.sin(Math.PI * v) * envelope;
    let y, z;
    if (part === 0) {
      y = lerp(low, top, v);
      z = 0.00073;
    } else if (part === 1) {
      y = top + (teeth ? -teeth * (1 - v) : 0.0001) * envelope;
      z = 0.0011;
    } else if (part === 2) {
      y = low - (1 - v) * 0.0037 * envelope;
      z = 0.00075 + volume * 0.0023;
    } else {
      y = top + v * cupid;
      z = 0.00081 + volume * 0.0017;
    }
    return [x, origin + y, zAt(x, origin + y) + z];
  }
  const columns = 34,
    rows = 5,
    patchSize = (columns + 1) * (rows + 1);
  for (let part = 0; part < tones.length; part++)
    for (let row = 0; row <= rows; row++)
      for (let col = 0; col <= columns; col++) {
        const u = col / columns,
          v = row / rows;
        rest.push(...sample(u, v, part, 0));
        for (let i = 0; i < morph.length; i++) morph[i].push(...sample(u, v, part, i + 1));
        tint
          .copy(tones[part][0])
          .lerp(tones[part][1], part < 2 ? v : 0.28 + 0.45 * Math.sin(Math.PI * v));
        colors.push(tint.r, tint.g, tint.b);
        if (row && col) {
          const d = part * patchSize + row * (columns + 1) + col;
          index.push(d - columns - 2, d - columns - 1, d - 1, d - columns - 1, d, d - 1);
        }
      }
  geometry.setIndex(index);
  geometry.setAttribute('position', new T.Float32BufferAttribute(rest, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.morphAttributes.position = morph.map((p) => new T.Float32BufferAttribute(p, 3));
  // Carry the surface normals through the morph so highlights follow the lips.
  const normalShape = geometry.clone();
  geometry.morphAttributes.normal = geometry.morphAttributes.position.map((position) => {
    normalShape.setAttribute('position', position);
    normalShape.computeVertexNormals();
    return normalShape.attributes.normal.clone();
  });
  normalShape.dispose();
  const finish = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.58,
    side: T.DoubleSide,
  });
  const mesh = new T.Mesh(geometry, finish);
  mesh.name = 'Roma smile';
  head.add(mesh);
  return mesh;
}

function headband(head, h) {
  const band = (u, v) => {
    const a = (u - 0.5) * Math.PI * 1.03,
      t = 2 * v - 1,
      arch = Math.cos(a);
    return [
      0.002 + (0.079 - 0.0019 * t) * Math.sin(a),
      0.073 +
        0.087 * arch -
        0.008 * t * (0.38 + 0.62 * arch) +
        0.0007 * Math.cos((t * Math.PI) / 2),
      0.021 + 0.008 * arch + 0.01 * t,
    ];
  };
  h.face(head, 44, 7, (u, v) => [...band(u, v), v < 0.13 || v > 0.87 ? '#b94442' : '#8f2831']);
  for (let i = 1; i <= 12; i++) {
    const points = [];
    for (let j = 0; j <= 10; j++) {
      const a = (j * tau) / 10;
      const u = i / 13 + 0.024 * Math.sin(a) * (1 - 0.3 * Math.cos(a));
      const v = 0.5 + 0.29 * Math.cos(a) + 0.13 * Math.sin(a);
      const p = band(u, v);
      p[1] += 0.00063 * Math.cos((u - 0.5) * Math.PI);
      p[0] += 0.00063 * Math.sin((u - 0.5) * Math.PI);
      points.push(p);
    }
    h.thread(head, '#e5bf8b', points, 0.00038, { segments: 13, sides: 3 });
  }
}

export function buildRomaFace(head, h, c) {
  buildSkin(head, h, c);
  for (const s of [-1, 1]) {
    h.oval(head, c.skin, s * 0.062, 0.059, -0.001, 0.011, 0.017, 0.008, 0, 0, -s * 0.24);
    h.oval(head, '#be795d', s * 0.067, 0.059, 0.0034, 0.0044, 0.01, 0.005);
    h.oval(head, c.gold, s * 0.068, 0.047, 0.0063, 0.0029, 0.0031, 0.003, 0, 0, 0, true, 12);
    h.ring(head, c.gold, s * 0.07, 0.032, 0.0078, 0.0111, 0.0142, 0.00145, s * 0.32);
    const nostril = [
      [0.0043, 0.0452],
      [0.0062, 0.045],
      [0.0087, 0.0456],
      [0.0103, 0.0467],
    ];
    h.thread(
      head,
      '#713f34',
      nostril.map(([x, y]) => [s * x, y, zAt(s * x, y) + 0.00029]),
      0.00054,
      { segments: 12, sides: 5, widths: [0.1, 0.8, 1, 0.05] },
    );
  }
  const eyes = [-1, 1].map((s) => buildEye(head, h, s));
  const mouth = buildMouth(head);
  headband(head, h);
  return { eyes, mouth };
}

export function poseRomaFace(facial, frame, lift) {
  const t = frame.time,
    emote = frame.emote;
  const cue = frame.faceCue;
  const blink = Math.exp(-(((((t + 1.1) % 4.4) - 0.15) / 0.045) ** 2));
  const smile = cue?.smile ?? lift * 0.71;
  const surprise = cue?.surprise ?? 0;
  const focus = cue?.focus ?? 0;
  const wink = cue?.wink ?? (emote < 0 ? 0 : Math.exp(-(((emote - 0.57) / 0.075) ** 2)));
  const squint = cue?.squint ?? 0;
  const browLift = cue?.browLift ?? lift * 0.33;
  const asymmetry = cue?.asymmetry ?? lift * 0.3;
  for (const { eye, iris, brow, closed, browBase, cy, side } of facial.eyes) {
    const closure = Math.max(
      cue ? 0 : blink,
      side < 0 ? wink : 0,
      0.96 * smoothstep(squint, 0.61, 0.92),
    );
    eye.scale.y = clamp(
      (1 - 0.965 * closure) * (1 + 0.2 * surprise - 0.45 * squint - 0.15 * focus),
      0.034,
      1.2,
    );
    eye.position.y = cy - 0.0021 * closure;
    eye.position.z = -0.0072 * smoothstep(closure, 0.72, 0.94);
    closed.position.z = -0.006 * (1 - smoothstep(closure, 0.75, 0.94));
    const gazeX = cue?.gazeX ?? 0,
      gazeY = cue?.gazeY ?? 0;
    iris.position.set(side * gazeX * 0.0021, gazeY * 0.0014, 0.0006 * Math.abs(gazeX));
    brow.position.y =
      browBase + 0.0033 * browLift + 0.0025 * surprise + 0.0033 * asymmetry * side - 0.0026 * focus;
    brow.rotation.z = side * (-0.035 * browLift + 0.15 * focus) + 0.09 * asymmetry;
  }
  const weights = facial.mouth.morphTargetInfluences;
  weights[0] = smile * (1 - surprise);
  weights[1] = surprise * (1 - 0.4 * smile);
  weights[2] = 0.52 * Math.abs(asymmetry) * (1 - smile) * (1 - surprise) * (1 - focus);
  weights[3] = 0.72 * focus * (1 - smile) * (1 - surprise);
  facial.mouth.rotation.z = 0.013 * asymmetry - 0.01 * focus;
}
