import * as T from 'three';
import { Sections, finish, seed, smooth, sat, wind, tau } from './forms.js';

// height, build, shoulder, waist, layers, hair and work clothes
const wardrobe = [
  [1.67, 1.05, 0.91, 1.08, 'straw', '#393126', '#426554', '#594942'],
  [1.84, 1.14, 1.13, 1.08, 'vest', '#382d2b', '#ac644d', '#42474b'],
  [1.71, 0.96, 0.93, 0.89, 'apron', '#452d22', '#f0e3cc', '#3c5155'],
  [1.68, 1.12, 1.04, 1.14, 'cap', '#93867b', '#817487', '#514e43'],
  [1.78, 0.89, 0.97, 0.87, 'skirt', '#583a2e', '#a9563e', '#2a5752'],
  [1.82, 1.05, 1.09, 1.0, 'cap', '#37312c', '#54778a', '#534a40'],
  [1.57, 1.01, 0.9, 1.12, 'scarf', '#b3a59b', '#e3c49a', '#785953'],
  [1.88, 0.94, 1.04, 0.91, 'vest', '#584534', '#d8ddca', '#565348'],
];
const tones = ['#9c674c', '#c68a63', '#c99774', '#aa775b', '#d9a381', '#86573f', '#ba8969', '#c08d69'];
const leather = '#5b4233',
  sole = '#393635';

const contactGeometry = new T.PlaneGeometry(0.25, 0.4);
contactGeometry.rotateX(-Math.PI / 2);
const contactMaterial = new T.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  vertexShader:
    'varying vec2 footprint;void main(){footprint=(uv-.5)*2.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:
    'varying vec2 footprint;void main(){float d=dot(footprint,footprint);gl_FragColor=vec4(.055,.036,.024,.27*(1.-smoothstep(.01,.98,d)));}',
});
export function worker(parent, variant, unit, job) {
  let identity = 91238 + variant * 147;
  for (const letter of job) identity = Math.imul(identity, 31) + letter.charCodeAt(0);
  const rand = seed(identity);
  const [stature, body, frame, waist, style, hair, shirt, pants] = wardrobe[variant % 8];
  const height = stature * (0.983 + 0.034 * rand()),
    build = body * (0.975 + 0.05 * rand()),
    shoulder = frame * (0.98 + 0.04 * rand());
  const skin = new T.Color(tones[variant % 8]).offsetHSL(0, (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.025),
    g = new T.Group();
  g.name = job;
  const bones = [],
    bind = [];
  function bone(name, x, y, z, parentIndex) {
    const b = new T.Bone();
    b.name = name;
    const p = new T.Vector3(x, y, z);
    bind.push(p);
    b.position.copy(p);
    if (parentIndex !== undefined) {
      b.position.sub(bind[parentIndex]);
      bones[parentIndex].add(b);
    }
    bones.push(b);
    return bones.length - 1;
  }
  const hip = bone('pelvis', 0, 0.89, 0),
    spine = bone('lumbar', 0, 1.04, 0, hip),
    chest = bone('chest', 0, 1.29, 0, spine),
    neck = bone('neck', 0, 1.49, 0, chest),
    head = bone('head', 0, 1.54, 0, neck);
  const sides = [-1, 1].map((s) => {
    const x = s * 0.205 * shoulder,
      h = s * 0.098 * build;
    const clav = bone('clavicle', s * 0.055, 1.43, 0, chest),
      arm = bone('shoulder', x, 1.43, 0, clav),
      elbow = bone('elbow', x + s * 0.033, 1.14, -0.015, arm),
      hand = bone('wrist', x + s * 0.042, 0.903, 0.014, elbow);
    const thigh = bone('hip', h, 0.89, 0, hip),
      shin = bone('knee', h, 0.481, 0.008, thigh),
      ankle = bone('ankle', h, 0.078, 0, shin);
    return { s, x, h, arm, elbow, hand, thigh, shin, ankle };
  });
  const hem = bone('hem', 0, 1.06, 0, spine);
  const skinForm = [],
    fabric = [],
    detail = [],
    coarse = new Sections();
  function part(form, joint, color, rings, count = 16, shape) {
    const p = bind[joint];
    const sections = rings.map(([y, w, d, x = 0, z = 0, j = joint, k = j, b = 0]) => [
      p.y + y,
      w,
      d,
      p.x + x,
      p.z + z,
      j,
      k,
      b,
    ]);
    form.push([sections, color, count, joint, shape]);
    if (count >= 14 || (joint === head && count >= 10))
      coarse.loft(sections, color, Math.min(count, 8), joint, shape);
  }
  const S = (j, c, r, n, shape) => part(skinForm, j, c, r, n, shape);
  const F = (j, c, r, n, shape) => part(fabric, j, c, r, n, shape);
  const D = (j, c, r, n, shape) => part(detail, j, c, r, n, shape);
  const torso = [
    [-0.035, 0.158 * waist, 0.116, 0, -0.008, hip],
    [0.045, 0.17 * waist, 0.124, 0, -0.011, hip, spine, 0.25],
    [0.156, 0.149 * waist, 0.108, 0, 0.002, spine],
    [0.272, 0.174 * build, 0.125, 0, 0.014, spine, chest, 0.6],
    [0.416, 0.208 * shoulder, 0.136, 0, 0.013, chest],
    [0.524, 0.211 * shoulder, 0.103, 0, -0.014, chest],
    [0.565, 0.147 * shoulder, 0.085, 0, -0.012, chest],
    [0.59, 0.072, 0.065, 0, 0.003, neck],
  ];
  const drape = (p, a, r) => {
    const pleat = 0.0036 * Math.cos(8 * a + 0.7 * r) + 0.0018 * Math.sin(a * 15 - r);
    p[0] += pleat * Math.sin(a);
    p[2] += pleat * Math.cos(a);
    return p;
  };
  F(hip, shirt, torso, 30, drape);
  // Narrow placket, buttonholes and a welt pocket sit on the face of the shirt.
  if (style !== 'vest') {
    F(
      hip,
      shirt,
      [
        [0.13, 0.014, 0.006, 0.001, 0.112, spine],
        [0.25, 0.015, 0.006, 0, 0.132, spine, chest, 0.5],
        [0.41, 0.014, 0.007, 0, 0.151, chest],
        [0.49, 0.014, 0.006, 0, 0.11, chest],
      ],
      10,
    );
    for (let i = 0; i < 4; i++) {
      const y = 0.19 + i * 0.077,
        z = i === 3 ? 0.142 : 0.121 + i * 0.01;
      D(
        hip,
        '#9b8f7b',
        [
          [y, 0.006, 0.003, 0, z, i > 1 ? chest : spine],
          [y + 0.009, 0.006, 0.003, 0, z, i > 1 ? chest : spine],
        ],
        10,
      );
    }
    F(
      chest,
      new T.Color(shirt).offsetHSL(0, 0, -0.038),
      [
        [-0.03, 0.032, 0.005, 0.098, 0.118],
        [0.041, 0.042, 0.005, 0.1, 0.126],
        [0.048, 0.04, 0.006, 0.1, 0.125],
      ],
      12,
    );
  }
  F(
    hip,
    pants,
    [
      [-0.082, 0.14 * build, 0.107],
      [0.01, 0.181 * build, 0.123],
      [0.115, 0.159 * waist, 0.111],
    ],
    20,
  );
  F(
    spine,
    leather,
    [
      [-0.054, 0.17 * waist, 0.125],
      [-0.026, 0.169 * waist, 0.123],
    ],
    24,
  );
  S(neck, skin, [
    [-0.043, 0.072, 0.067],
    [0.026, 0.061, 0.059],
    [0.109, 0.069, 0.067],
  ]);
  S(
    head,
    skin,
    [
      [0.001, 0.042, 0.055, 0, 0.017],
      [0.026, 0.071, 0.071, 0, 0.013],
      [0.068, 0.085, 0.084, 0, 0.005],
      [0.104, 0.094, 0.091, 0, 0.001],
      [0.142, 0.09, 0.092, 0, -0.004],
      [0.184, 0.082, 0.082, 0, -0.008],
      [0.211, 0.052, 0.063, 0, -0.009],
      [0.22, 0.016, 0.024],
    ],
    24,
  );
  // Cheek planes, recessed lids, brows, philtrum, lips, ears and nose bridge.
  for (const s of [-1, 1]) {
    S(
      head,
      skin,
      [
        [0.061, 0.006, 0.009, s * 0.089, -0.006],
        [0.082, 0.015, 0.021, s * 0.09, -0.004],
        [0.115, 0.009, 0.017, s * 0.091, -0.003],
      ],
      10,
    );
    S(
      head,
      skin,
      [
        [0.072, 0.008, 0.005, s * 0.045, 0.068],
        [0.086, 0.03, 0.012, s * 0.043, 0.071],
        [0.102, 0.015, 0.006, s * 0.039, 0.075],
      ],
      16,
    );
    D(
      head,
      '#805a48',
      [
        [0.109, 0.016, 0.003, s * 0.037, 0.084],
        [0.114, 0.022, 0.005, s * 0.037, 0.084],
        [0.119, 0.015, 0.003, s * 0.037, 0.084],
      ],
      12,
    );
    D(
      head,
      '#d5bc9d',
      [
        [0.11, 0.013, 0.002, s * 0.037, 0.088],
        [0.114, 0.018, 0.003, s * 0.037, 0.088],
        [0.117, 0.011, 0.002, s * 0.037, 0.088],
      ],
      12,
    );
    D(
      head,
      '#453831',
      [
        [0.109, 0.003, 0.002, s * 0.037, 0.092],
        [0.114, 0.005, 0.002, s * 0.037, 0.092],
        [0.118, 0.003, 0.001, s * 0.037, 0.091],
      ],
      10,
    );
    D(
      head,
      hair,
      [
        [0.123, 0.013, 0.003, s * 0.038, 0.084],
        [0.129, 0.025, 0.006, s * 0.038, 0.084],
        [0.134, 0.013, 0.002, s * 0.038, 0.083],
      ],
      12,
    );
  }
  S(
    head,
    skin,
    [
      [0.072, 0.012, 0.009, 0, 0.093],
      [0.079, 0.018, 0.016, 0, 0.1],
      [0.087, 0.013, 0.018, 0, 0.101],
      [0.115, 0.008, 0.009, 0, 0.091],
      [0.13, 0.009, 0.005, 0, 0.084],
    ],
    14,
  );
  D(
    head,
    '#a06755',
    [
      [0.041, 0.012, 0.004, 0, 0.089],
      [0.046, 0.024, 0.005, 0, 0.089],
      [0.051, 0.015, 0.004, 0, 0.088],
    ],
    14,
  );
  D(
    head,
    '#724d40',
    [
      [0.047, 0.02, 0.0015, 0, 0.093],
      [0.048, 0.021, 0.0015, 0, 0.093],
    ],
    12,
  );
  // Sample the skull profile at the height of each lock. A swept hairline
  // at the temples and nape keeps the scalp covered even on the coarse mesh.
  const skull = [
    [0.001, 0.042, 0.055, 0.017],
    [0.026, 0.071, 0.071, 0.013],
    [0.068, 0.085, 0.084, 0.005],
    [0.104, 0.094, 0.091, 0.001],
    [0.142, 0.09, 0.092, -0.004],
    [0.184, 0.082, 0.082, -0.008],
    [0.211, 0.052, 0.063, -0.009],
    [0.22, 0.016, 0.024, -0.009],
  ];
  const bob = style === 'skirt' || style === 'apron' || style === 'scarf';
  function lockSurface(p, a, r) {
    const v = r / 8,
      front = (1 + Math.cos(a)) * 0.5;
    const hairline = (bob ? 0.034 : 0.071) + front * (bob ? 0.124 : 0.082) + 0.008 * Math.cos(a * 3 + 0.4);
    const y = hairline + (0.224 - hairline) * Math.sin(v * Math.PI * 0.5);
    let j = 1;
    while (j < skull.length - 1 && skull[j][0] < y) j++;
    const lo = skull[j - 1],
      hi = skull[j],
      q = sat((y - lo[0]) / (hi[0] - lo[0]));
    const puff =
      (0.012 + 0.005 * Math.sin(a * 17 + 2 * v)) * (1 - 0.43 * v) + 0.009 * (1 - front) * (bob ? 1 : 0);
    const x = (T.MathUtils.lerp(lo[1], hi[1], q) + puff) * Math.sin(a);
    const z = (T.MathUtils.lerp(lo[2], hi[2], q) + puff) * Math.cos(a) + T.MathUtils.lerp(lo[3], hi[3], q);
    return [x, bind[head].y + y + 0.008 * v, z];
  }
  const cap = Array.from({ length: 9 }, (_, i) => [i / 8, 0.1, 0.1]);
  D(head, hair, cap, 48, lockSurface);
  // Lay fine ridges over the shell, converging toward an off-centre part.
  for (let k = 0; k < 44; k++) {
    const a = (k * tau) / 44,
      colour = new T.Color(hair).offsetHSL(0, 0, 0.012 + 0.048 * rand());
    const strand = [];
    for (let j = 0; j < 8; j++) {
      const u = j / 8,
        pt = lockSurface(null, a + 0.2 * u, j);
      strand.push([pt[1] - bind[head].y, 0.0018 + 0.0015 * (1 - u), 0.0024, pt[0], pt[2]]);
    }
    D(head, colour, strand, 5);
  }
  if (bob)
    D(
      head,
      hair,
      [
        [0.028, 0.021, 0.026, 0, -0.081],
        [0.039, 0.042, 0.043, 0, -0.091],
        [0.079, 0.054, 0.048, 0, -0.098],
        [0.109, 0.046, 0.047, 0, -0.093],
        [0.126, 0.027, 0.03, 0, -0.091],
      ],
      18,
    );
  if (style === 'straw' || style === 'cap') {
    const straw = style === 'straw',
      hat = straw ? '#c5a476' : '#576568';
    F(
      head,
      hat,
      [
        [0.158, 0.093, 0.097],
        [0.162, straw ? 0.169 : 0.108, straw ? 0.153 : 0.129, 0, 0.012],
        [0.173, 0.102, 0.101],
        [0.18, 0.095, 0.097],
        [0.224, 0.081, 0.081, 0, -0.009],
        [0.239, 0.049, 0.051, 0, -0.009],
      ],
      28,
    );
    F(
      head,
      leather,
      [
        [0.171, 0.099, 0.102],
        [0.183, 0.096, 0.1],
      ],
      26,
    );
  }
  if (style === 'vest') {
    F(
      hip,
      '#53473e',
      torso.slice(1, -1).map(([y, w, d, x, z, ...rest]) => [y, w + 0.014, d + 0.018, x, z, ...rest]),
      30,
      (p, a, r) => {
        // Drop only the front neckline. Match the chest circumference at the
        // bottom of the V so the linen stays inside the wool as the ribs turn.
        if (r === 5) {
          const cut = Math.max(0, Math.cos(a)) ** 8;
          p[1] -= 0.137 * cut;
          p[2] += 0.061 * cut;
        }
        return p;
      },
    );
    for (let i = 0; i < 4; i++)
      D(
        chest,
        '#c09e66',
        [
          [-0.16 + i * 0.078, 0.008, 0.004, 0, 0.137],
          [-0.149 + i * 0.078, 0.008, 0.004, 0, 0.138],
        ],
        8,
      );
  }
  if (['skirt', 'apron', 'scarf'].includes(style)) {
    F(
      hem,
      style === 'apron' ? '#63756d' : pants,
      [
        [-0.41, 0.232 * build, 0.169, 0, 0.002],
        [-0.34, 0.224, 0.168],
        [-0.17, 0.213 * build, 0.153],
        [-0.081, 0.191 * waist, 0.154],
        [0.01, 0.174 * waist, 0.136],
      ],
      28,
      (p, a, r) => {
        const f = 1 + 0.038 * Math.sin(a * 10) * (1 - r / 4);
        p[0] *= f;
        p[2] *= f;
        return p;
      },
    );
  }
  if (style === 'apron') {
    F(
      chest,
      '#63756d',
      [
        [-0.247, 0.124, 0.009, 0, 0.118, spine],
        [-0.14, 0.112, 0.008, 0, 0.144, spine, chest, 0.5],
        [0.006, 0.083, 0.009, 0, 0.15],
        [0.045, 0.081, 0.009, 0, 0.135],
      ],
      16,
    );
  }
  F(
    neck,
    style === 'scarf' ? '#914c42' : '#d5c5ac',
    [
      [-0.033, 0.088, 0.085],
      [0, 0.077, 0.071],
      [0.023, 0.068, 0.067],
    ],
    20,
  );
  for (const { s, x, arm, elbow, hand, thigh, shin, ankle } of sides) {
    F(
      thigh,
      pants,
      [
        [-0.419, 0.062, 0.066, 0, 0.007, shin],
        [-0.36, 0.068, 0.075, 0, 0.003, thigh, shin, 0.35],
        [-0.21, 0.085 * build, 0.093],
        [-0.075, 0.095 * build, 0.107, 0, -0.004],
        [0.034, 0.092 * build, 0.096],
      ],
      18,
    );
    F(
      shin,
      pants,
      [
        [-0.374, 0.052, 0.059, 0, -0.007],
        [-0.32, 0.059, 0.066, 0, -0.009],
        [-0.16, 0.071, 0.082, 0, -0.018],
        [-0.061, 0.066, 0.077],
        [0.022, 0.061, 0.068],
      ],
      16,
    );
    D(
      ankle,
      sole,
      [
        [-0.077, 0.063, 0.132, 0, 0.055],
        [-0.055, 0.066, 0.137, 0, 0.055],
      ],
      20,
    );
    D(
      ankle,
      leather,
      [
        [-0.055, 0.066, 0.134, 0, 0.055],
        [-0.032, 0.065, 0.133, 0, 0.055],
        [0.003, 0.058, 0.105, 0, 0.036],
        [0.041, 0.055, 0.067],
        [0.073, 0.051, 0.059],
      ],
      20,
    );
    S(
      arm,
      skin,
      [
        [-0.29, 0.041, 0.042, s * 0.033, -0.014, elbow],
        [-0.24, 0.049, 0.047, s * 0.027, -0.006],
        [-0.12, 0.058, 0.061, s * 0.014],
        [0.014, 0.056, 0.064],
      ],
      16,
    );
    F(
      arm,
      shirt,
      [
        [-0.211, 0.061, 0.06, s * 0.027],
        [-0.186, 0.067, 0.066, s * 0.026],
        [-0.12, 0.066, 0.069, s * 0.019],
        [-0.031, 0.074, 0.077],
        [0.022, 0.071, 0.065, -s * 0.017],
        [0.043, 0.049, 0.04, -s * 0.031],
      ],
      18,
    );
    F(
      arm,
      '#cebea2',
      [
        [-0.212, 0.062, 0.061, s * 0.027],
        [-0.195, 0.066, 0.065, s * 0.026],
      ],
      16,
    );
    S(
      elbow,
      skin,
      [
        [-0.237, 0.029, 0.031, s * 0.009, 0.028, hand],
        [-0.18, 0.036, 0.036, s * 0.007, 0.018],
        [-0.07, 0.048, 0.048, s * 0.005, 0.005],
        [0.022, 0.04, 0.044],
      ],
      16,
    );
    S(
      hand,
      skin,
      [
        [-0.139, 0.014, 0.016, 0, 0.014],
        [-0.117, 0.027, 0.024, 0, 0.01],
        [-0.079, 0.034, 0.028],
        [-0.041, 0.036, 0.023],
        [0.006, 0.028, 0.027],
      ],
      14,
    );
    S(
      hand,
      skin,
      [
        [-0.091, 0.009, 0.012, -s * 0.042, 0.016],
        [-0.065, 0.014, 0.014, -s * 0.041, 0.009],
        [-0.037, 0.016, 0.017, -s * 0.027, 0.004],
      ],
      12,
    );
  }
  const layers = [];
  g.add(bones[hip]);
  g.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);
  function nearLayers() {
    for (const [parts, kind] of [
      [skinForm, 'skin'],
      [fabric, 'cloth'],
      [detail, 'detail'],
    ]) {
      const form = new Sections();
      for (const entry of parts) form.loft(...entry);
      const mesh = new T.SkinnedMesh(form.geometry(true), finish(kind));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      g.add(mesh);
      mesh.bind(skeleton, new T.Matrix4());
      layers.push(mesh);
      parts.length = 0;
    }
  }
  const skinRoot = new T.Group();
  skinRoot.scale.setScalar((unit * height) / 1.76);
  parent.add(skinRoot);
  skinRoot.add(g);
  skinRoot.name = job;
  g.name = '';
  const low = new T.SkinnedMesh(coarse.geometry(true), finish('detail'));
  low.bind(skeleton, new T.Matrix4());
  low.castShadow = low.receiveShadow = true;
  low.frustumCulled = false;
  g.add(low);
  const prints = sides.map(() => {
    const shadow = new T.Mesh(contactGeometry, contactMaterial);
    skinRoot.add(shadow);
    return shadow;
  });
  const world = new T.Vector3();
  function lod(camera, mobile) {
    skinRoot.getWorldPosition(world);
    const simple = mobile || world.distanceToSquared(camera.position) > (unit * 23) ** 2;
    if (!simple && !layers.length) nearLayers();
    low.visible = simple;
    for (const m of layers) m.visible = !simple;
  }
  // Solve wrists to moving oar handles in shoulder space. The elbow bends
  // outward on the recovery stroke, retaining a consistent anatomical pole.
  const goal = new T.Vector3(),
    axis = new T.Vector3(),
    pole = new T.Vector3(),
    upper = new T.Vector3(),
    lower = new T.Vector3();
  function grasp(targets) {
    for (let i = 0; i < 2; i++) {
      const leg = sides[i],
        arm = bones[leg.arm],
        elbow = bones[leg.elbow],
        wrist = bones[leg.hand];
      if (!targets[i]) continue;
      targets[i].getWorldPosition(goal);
      arm.parent.worldToLocal(goal);
      goal.sub(arm.position);
      const a = elbow.position.length(),
        b = wrist.position.length(),
        d = T.MathUtils.clamp(goal.length(), 0.06, a + b - 0.0001);
      axis.copy(goal).normalize();
      pole.set(leg.s * 0.62, -0.85, -0.38);
      pole.addScaledVector(axis, -pole.dot(axis)).normalize();
      const along = (a * a + d * d - b * b) / (2 * d);
      upper
        .copy(axis)
        .multiplyScalar(along)
        .addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
      lower.copy(axis).multiplyScalar(d).sub(upper);
      arm.quaternion.setFromUnitVectors(goal.copy(elbow.position).normalize(), upper.normalize());
      elbow.quaternion.copy(arm.quaternion).invert();
      lower.applyQuaternion(elbow.quaternion).normalize();
      elbow.quaternion.setFromUnitVectors(goal.copy(wrist.position).normalize(), lower);
    }
  }
  let travel = 0,
    prevX = NaN,
    prevZ = 0;
  const phase = rand() * tau;
  function pose(t, action = job, floor = null) {
    const pos = skinRoot.position,
      sc = skinRoot.scale.y;
    const dist = Number.isFinite(prevX) ? Math.hypot(pos.x - prevX, pos.z - prevZ) / sc : 0;
    if (dist < 1.8) travel += dist;
    prevX = pos.x;
    prevZ = pos.z;
    const walking = action === 'walk' || action === 'carry',
      cycle = travel / 1.1,
      sway = walking ? Math.sin(tau * cycle) : Math.sin(t * 0.81 + phase) * 0.34;
    const work = 0.5 - 0.5 * Math.cos(t * 1.8 + phase),
      stroke = Math.sin(t * 2),
      breath = Math.sin(t * 1.75 + phase);
    const pelvis = bones[hip];
    pelvis.position.set(
      0.018 * sway,
      0.869 + (walking ? 0.015 * Math.cos(cycle * tau * 2) : breath * 0.004),
      0,
    );
    pelvis.rotation.set(0, 0.058 * sway, 0.026 * sway);
    bones[chest].rotation.set(0.018 * breath, -0.105 * sway, -0.018 * sway);
    bones[spine].rotation.x =
      action === 'pick'
        ? 0.23 * work
        : action === 'inspect'
          ? 0.18 + 0.12 * work
          : action === 'row'
            ? 0.12 * stroke
            : 0;
    bones[head].rotation.set(
      action === 'pick' || action === 'inspect' ? 0.16 + 0.14 * work : 0.025 * breath,
      0.19 * Math.sin(t * 0.67 + phase),
      -0.026 * sway,
    );
    bones[hem].rotation.set(0.03 * wind(t, pos.x, pos.z), 0, 0.021 * sway);
    for (let i = 0; i < 2; i++) {
      const { s, thigh, shin, ankle, arm, elbow, hand, h } = sides[i],
        p = (cycle + i * 0.5) % 1;
      // Stance moves backward exactly as far as the pelvis travels. The swing
      // returns heel-first; solve thigh and shin from the target ankle and tread.
      const swing = sat((p - 0.6) / 0.4),
        z = walking ? (p < 0.6 ? (0.3 - p) * 1.1 : (-0.3 + 0.6 * smooth(swing)) * 1.1) : 0.028 * s;
      const lift = walking ? Math.sin(swing * Math.PI) * 0.115 : 0;
      const floorY = floor
        ? (floor(
            pos.x + (h * Math.cos(skinRoot.rotation.y) + z * Math.sin(skinRoot.rotation.y)) * sc,
            pos.z + (z * Math.cos(skinRoot.rotation.y) - h * Math.sin(skinRoot.rotation.y)) * sc,
          ) -
            pos.y) /
          sc
        : 0;
      const rise = lift + floorY;
      prints[i].visible = action !== 'row';
      prints[i].position.set(h, floorY + 0.005, z + 0.047);
      const down = pelvis.position.y - 0.078 - rise,
        d = Math.min(0.81, Math.hypot(z, down)),
        knee = Math.acos(T.MathUtils.clamp((d * d - 0.409 ** 2 - 0.403 ** 2) / (2 * 0.409 * 0.403), -1, 1));
      bones[thigh].rotation.x =
        -Math.atan2(z, down) - Math.atan2(0.403 * Math.sin(knee), 0.409 + 0.403 * Math.cos(knee));
      bones[shin].rotation.x = knee;
      bones[ankle].rotation.x =
        -bones[thigh].rotation.x - knee + (walking ? 0.31 * Math.sin(swing * tau) : 0);
      let reach = walking ? 0.53 * Math.sin(tau * p) : 0.06,
        bend = -0.23 - 0.06 * work,
        spread = 0.065;
      if (action === 'row') {
        reach = -0.71 - 0.42 * stroke;
        bend = -0.82 + 0.49 * stroke;
        bones[thigh].rotation.x = -1.54;
        bones[shin].rotation.x = 1.27;
      }
      if (action === 'carry') {
        reach = -0.62;
        bend = -1.05;
        spread = 0.09;
      }
      if (action === 'pick') {
        reach = i ? -0.64 - work * 0.89 : -0.36;
        bend = i ? -0.8 + 0.62 * work : -1.01;
      }
      if (action === 'taste') {
        reach = i ? -0.37 - 0.4 * work : -0.13;
        bend = i ? -0.98 - 1.1 * work : -0.31;
      }
      if (action === 'inspect') {
        reach = -0.84 - 0.3 * work;
        bend = -0.52 + 0.25 * work;
      }
      if (action === 'talk' && i) {
        reach = -0.29 - 0.24 * work;
        bend = -0.82 - 0.3 * work;
        spread = 0.21 * work;
      }
      bones[arm].rotation.set(reach, 0, s * spread);
      bones[elbow].rotation.x = bend;
      bones[hand].rotation.x = -0.08 * breath;
    }
  }
  pose(0);
  return {
    g: skinRoot,
    pose,
    grasp,
    lod,
    low,
    hands: sides.map((s) => bones[s.hand]),
    hip: bones[hip],
    layers,
    skeleton,
  };
}
