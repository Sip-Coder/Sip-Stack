import * as T from 'three';
import { Sections, finish, mesh, smooth, sat, tau } from './forms.js';

// Shaft, graduated barbs and dark trailing margin. Geometry gives each primary
// a curved leading edge; the map supplies detail as it turns into the light.
let plumage;
function featherMaterial() {
  if (plumage) return plumage;
  const w = 32,
    h = 96,
    pixels = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / w - 0.5,
        y = j / h,
        k = (j * w + i) * 4;
      const shaft = Math.exp(-Math.abs(x) * 70),
        barbs = Math.sin(j * 2.7 - Math.abs(x) * 25);
      const v = 198 + shaft * 49 + 12 * barbs - 17 * Math.abs(x) + 17 * y;
      pixels.set([v, v, v, 255], k);
    }
  const map = new T.DataTexture(pixels, w, h);
  map.colorSpace = T.SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  map.needsUpdate = true;
  plumage = new T.MeshStandardMaterial({ map, vertexColors: true, side: T.DoubleSide, roughness: 0.74 });
  return plumage;
}
class Feathers {
  constructor() {
    this.p = [];
    this.i = [];
    this.uv = [];
    this.c = [];
  }
  add(x, y, z, dx, dy, dz, width, color) {
    const n = this.p.length / 3,
      l = Math.hypot(dx, dz),
      tint = new T.Color(color);
    for (let j = 0; j <= 6; j++) {
      const f = j / 6,
        w = width * (0.014 + Math.sin(Math.PI * Math.pow(f, 0.83)) ** 0.65);
      for (let k = -1; k <= 1; k++) {
        this.p.push(
          x + f * dx + (k * w * dz) / l,
          y + dy * f + 0.022 * Math.sin(f * Math.PI) - 0.009 * Math.abs(k),
          z + f * dz - (k * w * dx) / l,
        );
        this.uv.push(0.5 + 0.5 * k, f);
        this.c.push(tint.r, tint.g, tint.b);
        if (j && k < 1) {
          const a = n + j * 3 + k + 1;
          this.i.push(a - 3, a - 2, a, a, a - 2, a + 1);
        }
      }
    }
  }
  build(parent) {
    const g = new T.BufferGeometry();
    for (const [n, a, s] of [
      ['position', this.p, 3],
      ['uv', this.uv, 2],
      ['color', this.c, 3],
    ])
      g.setAttribute(n, new T.Float32BufferAttribute(a, s));
    g.setIndex(this.i);
    g.computeVertexNormals();
    return mesh(parent, g, featherMaterial());
  }
}
const species = {
  gull: ['#e8e2d3', '#909da5', '#39424a', '#d79f45', 1, 0.24],
  swallow: ['#e0bb94', '#304e62', '#263843', '#434041', 0.72, 0.24],
  kingfisher: ['#c4824d', '#286f7a', '#34575c', '#473e37', 0.9, 0.38],
  songbird: ['#d0af86', '#8a705a', '#665341', '#6d5440', 0.84, 0.17],
};
const models = new Map();
function bird(kind) {
  if (models.has(kind)) return models.get(kind).clone(true);
  const [belly, back, tip, bill, span, beak] = species[kind],
    root = new T.Group();
  const coat = new Sections();
  const lengthwise = ([x, y, z]) => [x, z, -y];
  coat.loft(
    [
      [-0.27, 0.024, 0.033, 0, 0.065],
      [-0.2, 0.102, 0.105, 0, 0.08],
      [-0.07, 0.141, 0.143, 0, 0.014],
      [0.095, 0.153, 0.125],
      [0.24, 0.113, 0.091, 0, 0.02],
      [0.38, 0.036, 0.034, 0, 0.035],
    ],
    belly,
    22,
    0,
    lengthwise,
  );
  // Grade the mantle into the flanks on the same surface, with fine broken
  // bars along the shoulders. This avoids intersecting a second skin.
  const body = coat.geometry(),
    bp = body.attributes.position,
    bc = body.attributes.color;
  const dark = new T.Color(back),
    light = new T.Color(belly),
    shade = new T.Color();
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i),
      y = bp.getY(i),
      z = bp.getZ(i);
    const blend = smooth((y + 0.012 - 0.07 * z) / 0.093);
    shade
      .copy(light)
      .lerp(dark, blend)
      .multiplyScalar(1 + 0.035 * Math.cos(x * 62 + z * 47));
    bc.setXYZ(i, shade.r, shade.g, shade.b);
  }
  mesh(root, body, finish('detail'));
  const head = new T.Group();
  head.name = 'bird head';
  head.position.set(0, 0.092, 0.207);
  root.add(head);
  const face = new Sections();
  face.loft(
    [
      [-0.101, 0.017, 0.024, 0, -0.016],
      [-0.077, 0.077, 0.082],
      [-0.005, 0.103, 0.098],
      [0.061, 0.084, 0.081],
      [0.095, 0.046, 0.059],
      [0.11, 0.014, 0.023],
    ],
    kind === 'kingfisher' || kind === 'swallow' ? back : belly,
    20,
  );
  if (kind === 'swallow' || kind === 'kingfisher') {
    face.loft(
      [
        [-0.085, 0.018, 0.014, 0, 0.056],
        [-0.061, 0.063, 0.028, 0, 0.059],
        [-0.043, 0.067, 0.032, 0, 0.059],
        [-0.024, 0.045, 0.022, 0, 0.074],
      ],
      kind === 'swallow' ? '#a96143' : '#f0dcc0',
      20,
    );
  }
  face.loft(
    [
      [-beak, 0.005, 0.005, 0, -0.006],
      [-beak * 0.92, 0.014, 0.012, 0, -0.001],
      [-0.104, 0.042, 0.03, 0, 0.015],
      [-0.07, 0.043, 0.033, 0, 0.013],
    ],
    bill,
    12,
    0,
    lengthwise,
  );
  for (const s of [-1, 1]) {
    face.loft(
      [
        [0.012, 0.009, 0.017, s * 0.086, 0.035],
        [0.026, 0.016, 0.02, s * 0.089, 0.036],
        [0.044, 0.01, 0.012, s * 0.086, 0.037],
      ],
      '#302c29',
      12,
    );
    face.loft(
      [
        [0.03, 0.003, 0.004, s * 0.103, 0.041],
        [0.036, 0.003, 0.004, s * 0.102, 0.041],
      ],
      '#e7dbc4',
      8,
    );
  }
  mesh(head, face.geometry(), finish('detail'));
  const tail = new Feathers();
  for (let j = -4; j <= 4; j++)
    tail.add(
      j * 0.012,
      0.041,
      -0.2,
      j * 0.025,
      -0.018,
      -0.27 - (kind === 'swallow' ? Math.abs(j) * 0.059 : 0),
      0.044,
      back,
    );
  tail.build(root);
  for (const s of [-1, 1]) {
    const shoulder = new T.Group();
    root.add(shoulder);
    shoulder.name = 'wing' + s;
    shoulder.position.set(s * 0.084, 0.047, 0.014);
    const wrist = new T.Group();
    wrist.name = 'wrist' + s;
    wrist.position.set(s * 0.39 * span, 0.03, -0.06);
    shoulder.add(wrist);
    // The continuous cambered armwing carries the secondaries. Its tapered
    // handwing leaves the last few primaries free to fan apart at the tip.
    const armwing = new Sections(),
      handwing = new Sections();
    const alongWing = ([x, y, z]) => [s * y, x, z];
    armwing.loft(
      [
        [-0.025, 0.04, 0.119, 0, -0.018],
        [0.13 * span, 0.046, 0.152, 0.012, -0.034],
        [0.26 * span, 0.035, 0.151, 0.027, -0.059],
        [0.4 * span, 0.021, 0.108, 0.031, -0.069],
      ],
      back,
      18,
      0,
      alongWing,
    );
    handwing.loft(
      [
        [-0.015, 0.023, 0.116, 0, -0.023],
        [0.12 * span, 0.021, 0.104, -0.005, -0.03],
        [0.27 * span, 0.017, 0.093, -0.014, -0.061],
        [0.43 * span, 0.008, 0.039, -0.022, -0.099],
        [0.51 * span, 0.004, 0.009, -0.031, -0.138],
      ],
      back,
      16,
      0,
      alongWing,
    );
    mesh(shoulder, armwing.geometry(), finish('detail'));
    mesh(wrist, handwing.geometry(), finish('detail'));
    const inner = new Feathers(),
      outer = new Feathers();
    for (let j = 0; j < 10; j++) {
      const f = j / 9;
      inner.add(
        s * 0.34 * span * f,
        0.021 * f,
        0.099 - 0.088 * f,
        s * (0.12 + 0.02 * f),
        -0.02,
        -0.34 + 0.035 * f,
        0.055,
        back,
      );
      inner.add(
        s * 0.33 * span * f,
        0.025 + 0.015 * f,
        0.116 - 0.088 * f,
        s * 0.09,
        0.005,
        -0.215,
        0.059,
        new T.Color(back).offsetHSL(0, 0, j % 3 ? 0.018 : 0.055),
      );
      outer.add(
        s * 0.086 * f,
        0.011 * f,
        0.082 - 0.1 * f,
        s * (0.55 - 0.037 * j) * span,
        -0.045 + 0.003 * j,
        -0.18 - 0.008 * j,
        0.053,
        j < 5 ? tip : back,
      );
      outer.add(
        s * 0.073 * f,
        0.017,
        0.088 - 0.1 * f,
        s * (0.32 - 0.015 * j) * span,
        -0.018,
        -0.13,
        0.047,
        back,
      );
    }
    inner.build(shoulder).name = 'coverts';
    outer.build(wrist);
  }
  const feet = new Sections();
  for (const s of [-1, 1]) {
    feet.loft(
      [
        [-0.142, 0.01, 0.013, s * 0.05, 0.014],
        [-0.125, 0.014, 0.022, s * 0.05, 0],
        [-0.046, 0.013, 0.016, s * 0.05, -0.012],
      ],
      bill,
      8,
    );
    for (let k = -1; k <= 1; k++)
      feet.loft(
        [
          [-0.148, 0.009, 0.033, s * 0.05 + k * 0.014, 0.028],
          [-0.14, 0.011, 0.032, s * 0.05 + k * 0.014, 0.025],
        ],
        bill,
        6,
      );
  }
  mesh(root, feet.geometry(), finish('detail'));
  models.set(kind, root);
  return root.clone(true);
}
// Steering integrates separation, alignment, cohesion and terrain clearance in
// bounded time steps. Perching is a timed landing/hop/preen/departure sequence.
export function flock(scene, { kind, count, center, radii, perch, scale, obstacles = [] }) {
  const birds = [],
    aim = new T.Vector3(),
    steer = new T.Vector3(),
    delta = new T.Vector3(),
    home = new T.Vector3(...perch);
  for (let i = 0; i < count; i++) {
    const root = bird(kind),
      a = i * 2.399;
    root.name = kind + ' ' + (i + 1);
    root.scale.setScalar(scale);
    scene.add(root);
    root.position.set(
      center[0] + radii[0] * Math.cos(a),
      center[1] + 0.22 * Math.sin(i),
      center[2] + radii[1] * Math.sin(a),
    );
    birds.push({
      root,
      v: new T.Vector3(-Math.sin(a), 0, Math.cos(a)),
      w: [-1, 1].map((s) => root.getObjectByName('wing' + s)),
      coverts: root.children
        .filter((o) => o.name.startsWith('wing'))
        .map((o) => o.getObjectByName('coverts')),
      tips: [-1, 1].map((s) => root.getObjectByName('wrist' + s)),
      head: root.getObjectByName('bird head'),
    });
  }
  let last = null;
  return (t, mobile = false, camera = null) => {
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i],
        g = b.root,
        p = g.position,
        clock = (t + i * 7) % 27,
        percher = i === 0;
      g.visible = !mobile || i < Math.ceil(count * 0.65);
      if (!g.visible) continue;
      const fine = !mobile && (!camera || camera.position.distanceToSquared(p) < (18 * scale) ** 2);
      for (const card of b.coverts) card.visible = fine;
      const perchBlend = percher ? 1 - smooth((clock - 7) / 2) * (1 - smooth((clock - 22) / 5)) : 0;
      const rest = percher && clock < 7;
      const a = t * (kind === 'swallow' ? 0.32 : 0.22) + i * 0.75;
      aim.set(
        center[0] + radii[0] * Math.cos(a),
        center[1] + Math.sin(a * 2 + i) * 0.38,
        center[2] + radii[1] * Math.sin(a),
      );
      steer.copy(aim).sub(p).multiplyScalar(0.88);
      for (let j = 0; j < birds.length; j++)
        if (i !== j && birds[j].root.visible) {
          delta.copy(p).sub(birds[j].root.position);
          const d = delta.lengthSq();
          if (d < scale * scale * 4) steer.addScaledVector(delta, 1.25 / (0.04 + d));
          if (d < 12) steer.addScaledVector(birds[j].v, 0.09).addScaledVector(delta, -0.032);
        }
      for (const obstacle of obstacles) {
        delta.set(p.x - obstacle[0], 0, p.z - obstacle[2]);
        if (p.y < obstacle[1] + scale && delta.lengthSq() < obstacle[3] ** 2) {
          steer.y += 2;
          steer.addScaledVector(delta, 1.5);
        }
      }
      b.v.lerp(steer.clampLength(0.25, kind === 'swallow' ? 4 : 2.8), 1 - Math.exp(-dt * 2.3));
      const heading = Math.atan2(b.v.x, b.v.z),
        turn = Math.sin(heading - g.rotation.y);
      if (rest) {
        const hop = Math.sin(Math.PI * sat((clock - 3.2) / 0.36));
        p.copy(home);
        p.y += scale * (0.148 + 0.12 * hop);
        p.x += scale * 0.11 * smooth((clock - 3.2) / 0.36);
      } else {
        p.addScaledVector(b.v, dt);
        if (percher && clock > 22) p.lerp(home, 1 - Math.exp(-dt * (0.2 + 5 * perchBlend)));
      }
      if (!rest) g.rotation.y += Math.atan2(turn, Math.cos(heading - g.rotation.y)) * Math.min(1, dt * 5);
      g.rotation.z = rest ? 0 : -turn * 0.47;
      b.head.rotation.set(
        rest ? 0.55 * smooth((clock - 4) / 0.8) : 0.035,
        rest ? 0.92 * Math.sin(clock) : 0,
        0,
      );
      const folded = perchBlend,
        flap = Math.sin(t * (kind === 'gull' ? 5.9 : 11.7) + i * 2),
        beat = (0.21 + 0.79 * smooth((Math.sin(t * 0.79 + i) + 0.3) * 2)) * (1 - folded);
      for (let k = 0; k < 2; k++) {
        const side = k * 2 - 1;
        b.w[k].rotation.set(
          0,
          side * 1.19 * folded,
          side * (0.12 + 0.62 * flap * beat - 0.36 * folded),
          'YXZ',
        );
        b.tips[k].rotation.set(
          0,
          side * (0.25 * Math.max(0, flap) * beat + 1.31 * folded),
          -side * (0.1 + 0.25 * Math.max(0, flap) * beat),
        );
      }
    }
  };
}
