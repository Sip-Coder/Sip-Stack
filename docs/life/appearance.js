// All measurements are in rig metres. Each surface is sampled from the same
// anatomical sections at three resolutions. A covered patch emits its garment
// shell in place of skin; they cannot separate or z-fight in a bent pose.
import * as T from 'three';
import { openBodice } from './junctions.js';
import { tau, sat, smooth } from './forms.js';

const { sin, cos, abs, pow, exp } = Math;
const mix = T.MathUtils.lerp;
const bell = (x, w) => exp((-x * x) / (w * w));
const polar = (v, exponent) => Math.sign(v) * pow(abs(v), exponent);
const pigment = (value) => new T.Color(value);
const SKIN = 0,
  CLOTH = 1,
  LEATHER = 2,
  HAIR = 3,
  EYE = 4;
let skinCloth;
export const distantSurface = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });

function material() {
  if (skinCloth) return skinCloth;
  skinCloth = new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.75,
    sheen: 0.16,
    sheenColor: 0xf1c7a6,
  });
  skinCloth.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float tissue; varying float substance; varying vec3 restPoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsubstance=tissue;restPoint=position;',
      );
    shader.fragmentShader =
      'varying float substance; varying vec3 restPoint;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        if (substance > 2.5 && substance < 3.5) {
          float radial=atan(restPoint.x,restPoint.z+.007);
          float lift=restPoint.y-1.62;
          float flow=radial+lift*(3.6+1.5*cos(radial))+.038*sin(radial*3.+lift*18.);
          float strand=flow*265.+1.7*sin(flow*41.);
          float filament=cos(strand)*(1.-smoothstep(.4,2.3,fwidth(strand)));
          float lock=sin(flow*19.+.5*sin(flow*8.+lift*23.));
          diffuseColor.rgb*=1.+.19*filament+.16*lock;
        }
        if (substance < .1) {
          vec3 p=restPoint*310.;
          float mottling=sin(p.x*.83+p.z)*sin(p.y+p.x*.21)+.45*sin((p.z+p.y)*2.3);
          diffuseColor.rgb*=vec3(1.+.020*mottling,1.-.011*mottling,1.-.024*mottling);
        }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        float skinMask=1.-smoothstep(.05,.5,substance),wet=step(3.5,substance);
        float tzone=exp(-3500.*restPoint.x*restPoint.x)*smoothstep(1.59,1.66,restPoint.y)*smoothstep(.055,.084,restPoint.z);
        roughnessFactor=mix(mix(.78,.57-.19*tzone,skinMask),.17,wet);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        vec2 textile=restPoint.xy*2200.+restPoint.z*233.;
        float detailFade=1.-smoothstep(.24,1.6,max(fwidth(textile.x),fwidth(textile.y)));
        vec2 warp=sin(textile)*cos(textile.yx*.5);
        normal=normalize(normal+detailFade*(skinMask*.027+(1.-wet)*(1.-skinMask)*.047)*vec3(warp,0.));`,
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse+=skinMask*diffuseColor.rgb*vec3(.074,.027,.014)*(1.-max(dot(normal,geometryViewDir),0.));`,
        );
  };
  return skinCloth;
}

// Parametric patches share indices across the seam. Normals come from the
// finished (sculpted and offset) positions, including their angular derivatives.
class Surface {
  constructor(level) {
    this.level = level;
    this.xyz = [];
    this.rgb = [];
    this.tissue = [];
    this.joints = [];
    this.weights = [];
    this.indices = [];
    this.loops = {};
    this.faceMask = [];
    this.uv = [];
  }
  patch(n, m, sample, { caps = false, inward = false } = {}) {
    const base = this.xyz.length / 3;
    const tri = (a, b, c) => {
      if (inward) this.indices.push(c, b, a);
      else this.indices.push(a, b, c);
    };
    for (let j = 0; j <= m; j++)
      for (let i = 0; i < n; i++) {
        const u = i / n,
          v = j / m,
          [x, y, z, bone, col, kind, j2 = bone, weight = 0, blink = 0] = sample(u * tau, v, j);
        this.xyz.push(x, y, z);
        this.rgb.push(col.r, col.g, col.b);
        this.tissue.push(kind);
        this.uv.push(u, v);
        this.joints.push(bone, j2, 0, 0);
        this.weights.push(1 - weight, weight, 0, 0);
        this.faceMask.push(blink);
        if (j) {
          const a = base + j * n + i,
            b = base + j * n + ((i + 1) % n);
          tri(a - n, b - n, a);
          tri(a, b - n, b);
        }
      }
    if (caps)
      for (let i = 1; i < n - 1; i++) {
        tri(base, base + i + 1, base + i);
        const top = base + m * n;
        tri(top, top + i, top + i + 1);
      }
    return base;
  }
  geometry() {
    const geo = new T.BufferGeometry();
    for (const [name, arr, n] of [
      ['position', this.xyz, 3],
      ['color', this.rgb, 3],
      ['uv', this.uv, 2],
      ['tissue', this.tissue, 1],
      ['blinkMask', this.faceMask, 1],
      ['skinWeight', this.weights, 4],
    ])
      geo.setAttribute(name, new T.Float32BufferAttribute(arr, n));
    geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.joints, 4));
    geo.setIndex(this.indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.userData.loops = this.loops;
    return geo;
  }
}
function buildGeometry(spec, level) {
  const { bind, hip, spine, chest, neck, head, sides, rig, style, build, shoulder, variant } = spec;
  const female = [2, 4, 6].includes(variant),
    old = variant === 3 || variant === 6;
  const skin = pigment(spec.skin),
    blush = skin.clone().lerp(pigment('#a66153'), 0.2),
    shirt = pigment(spec.shirt),
    trousers = pigment(spec.pants);
  const stitched = shirt.clone().multiplyScalar(0.83),
    hair = pigment(spec.hair),
    highlight = hair.clone().offsetHSL(0, 0, 0.064);
  const boot = pigment('#614533'),
    welt = pigment('#37332e'),
    lip = skin.clone().lerp(pigment('#a86561'), 0.55),
    iris = pigment(variant % 3 ? '#5d5339' : '#698278');
  const browColor = hair.clone().lerp(skin, 0.22);
  const nostril = skin.clone().multiplyScalar(0.58),
    lidLine = skin.clone().multiplyScalar(0.51);
  const white = pigment('#d9cfc0'),
    ink = pigment('#342c29'),
    glint = pigment('#fffdf3'),
    vest = pigment('#524b3e'),
    linen = pigment('#d7c9a9'),
    apron = pigment('#586e69');
  const body = new Surface(level);
  const count = (hi, mid, far) => {
    const value = level === 0 ? hi : level === 1 ? mid : far;
    if (value < 9) return value;
    return Math.ceil(value * (level === 0 ? 0.84 : level === 1 ? 0.56 : 0.64));
  };

  // Section rows are y, half-width, half-depth, centre x/z and nearest joint.
  // Anatomical landmarks retain their exact ring at every resolution.
  function profile(rows, n, div, paint, sculpt = null, loops = {}, focusFace = false) {
    if (level === 2 && rows.length > 4) {
      const keys = new Set([0, rows.length - 1, ...Object.values(loops)]);
      for (let j = 1; j < rows.length - 1; j += 2) keys.add(j);
      const retained = [...keys].sort((a, b) => a - b);
      rows = retained.map((j) => rows[j]);
      loops = Object.fromEntries(Object.entries(loops).map(([name, j]) => [name, retained.indexOf(j)]));
    }
    const steps = (rows.length - 1) * div;
    const start = body.indices.length;
    const first = body.patch(
      n,
      steps,
      (a, v, j) => {
        const k = Math.min(rows.length - 2, Math.floor(j / div)),
          t = j / div - k,
          A = rows[k],
          B = rows[k + 1];
        const y = mix(A[0], B[0], t),
          w = mix(A[1], B[1], t),
          d = mix(A[2], B[2], t),
          xx = mix(A[3], B[3], t),
          zz = mix(A[4], B[4], t);
        if (focusFace) a -= 0.6 * sin(a);
        const sn = sin(a),
          cs = cos(a);
        let x = w * polar(sn, 0.89),
          z = d * polar(cs, 0.86);
        const vertex = [xx + x, y, zz + z, A[5], paint[0], paint[1], B[5], t];
        if (sculpt) sculpt(vertex, a, y, sn, cs, w, d, xx, zz);
        return vertex;
      },
      { caps: true },
    );
    for (const [label, row] of Object.entries(loops))
      body.loops[label] = Array.from({ length: n }, (_, i) => first + row * div * n + i);
    return { first, start, n, steps };
  }
  function oval(joint, xc, yc, zc, w, h, d, color, kind, n, m) {
    body.patch(
      n,
      m,
      (a, v) => {
        const b = (v - 0.5) * Math.PI,
          r = Math.max(0.006, cos(b));
        return [
          xc + w * r * sin(a),
          yc + h * sin(b),
          zc + d * r * cos(a),
          joint,
          color,
          kind,
          joint,
          0,
          level === 2 && kind === EYE ? 1 : 0,
        ];
      },
      { caps: true },
    );
  }
  const shoulderWidth = (female ? 0.206 : 0.228) * shoulder,
    hipWidth = (female ? 0.184 : 0.163) * build;
  const waistWidth = female ? hipWidth * 0.72 : shoulderWidth / 1.4;
  const chestWidth = Math.max(waistWidth + 0.017, shoulderWidth * 0.92);
  const torso = [
    [0.88, hipWidth, 0.112, 0, -0.011, hip],
    [0.941, hipWidth * 0.99, 0.117, 0, -0.015, hip],
    [0.987, waistWidth * 1.055, 0.106, 0, -0.007, spine],
    [0.994, waistWidth * 1.06, 0.109, 0, -0.007, spine],
    [1.011, waistWidth * 1.05, 0.105, 0, -0.005, spine],
    [1.014, waistWidth * 1.075, 0.109, 0, -0.004, spine],
    [1.028, waistWidth * 1.05, 0.103, 0, -0.003, spine],
    [1.067, waistWidth, 0.091, 0, 0.005, spine],
    [1.123, waistWidth * 1.04, 0.098, 0, 0.006, spine],
    [1.194, chestWidth * 0.92, 0.109, 0, 0.007, chest],
    [1.267, chestWidth, 0.123, 0, 0.007, chest],
    [1.323, chestWidth * 1.01, 0.125, 0, 0.011, chest],
    [1.381, shoulderWidth, 0.109, 0, 0.002, chest],
    [1.426, shoulderWidth * 0.98, 0.084, 0, -0.004, chest],
    [1.456, shoulderWidth * 0.72, 0.071, 0, -0.002, chest],
    [1.478, 0.067, 0.057, 0, 0.002, neck],
  ];
  const torsoPatch = profile(
    torso,
    2 * Math.ceil(count(48, 34, 16) / 2),
    count(2, 1, 1),
    [shirt, CLOTH],
    (v, a, y, sn, cs) => {
      const side = abs(sn),
        front = Math.max(0, cs),
        rear = Math.max(0, -cs);
      v[2] +=
        0.011 * front * bell(y - 1.325, 0.06) * (1 - bell(v[0], 0.02)) -
        0.008 * rear * bell(y - 1.38, 0.07) * side;
      v[2] += 0.015 * front * bell(y - 1.34, 0.067) * (female ? 1 : 0) - 0.013 * rear * bell(y - 0.92, 0.058);
      const isVest = style === 'vest' && y > 1.005 && y < 1.447 - 0.1 * front ** 7;
      const isApron =
        style === 'apron' && front > 0.54 && abs(v[0]) < 0.12 - 0.036 * sat((y - 1.03) / 0.29) && y < 1.338;
      let fabricColor = isVest ? vest : isApron ? apron : shirt;
      if (y < 1.005) fabricColor = trousers;
      if (y >= 0.994 && y <= 1.011) fabricColor = boot;
      if (y > 1.009 && y < 1.038) v[1] += 0.008 * sin(a * 2 + 0.6) + 0.003 * cos(a * 5);
      if (y > 1.028 && y < 1.45 && front > 0.64 && abs(v[0]) < 0.006) fabricColor = stitched;
      if (y >= 1.29 && y < 1.35 && front > 0.45 && v[0] > 0.058 && v[0] < 0.111) fabricColor = stitched;
      const offset =
        0.003 + (isVest || isApron ? 0.004 : 0) + 0.0017 * Math.sin(a * 10.0 + y * 14) * bell(y - 1.16, 0.15);
      v[0] += sn * offset;
      v[2] += cs * offset;
      v[4] = fabricColor;
    },
  );

  const junctions = openBodice(body, torsoPatch, hip);
  profile(
    [
      [1.445, 0.067, 0.058, 0, -0.001, chest],
      [1.483, 0.058, 0.054, 0, 0, neck],
      [1.523, 0.049, 0.049, 0, 0.004, neck],
      [1.565, 0.06, 0.055, 0, 0.002, head],
    ],
    count(32, 21, 12),
    1,
    [skin, SKIN],
    (v, a, y, sn, cs) => {
      v[2] += (female ? 0.002 : 0.006) * bell(y - 1.516, 0.013) * Math.max(0, cs) ** 8;
      v[0] += 0.0035 * sn * bell(abs(sn) - (0.47 + 0.33 * sat((y - 1.46) / 0.1)), 0.12);
    },
  );
  const collar = style === 'scarf' ? pigment('#964e3f') : linen;
  profile(
    [
      [1.451, 0.087, 0.078, 0, 0.004, chest],
      [1.473, 0.077, 0.065, 0, 0.002, neck],
      [1.49, 0.062, 0.057, 0, 0.002, neck],
    ],
    count(28, 18, 12),
    1,
    [collar, CLOTH],
    (v, a) => {
      v[1] -= 0.024 * Math.max(0, cos(a)) ** 6;
    },
  );
  // Body height 1.766 m, chin-to-crown 0.236 m (7.48 heads).
  const skull = [
    [1.532, 0.03, 0.037, 0, 0.028],
    [1.545, 0.052, 0.058, 0, 0.024],
    [1.559, 0.069, 0.067, 0, 0.012],
    [1.58, 0.079, 0.074, 0, 0.007],
    [1.603, 0.085, 0.078, 0, 0.005],
    [1.628, 0.092, 0.084, 0, 0.002],
    [1.648, 0.093, 0.088, 0, -0.001],
    [1.672, 0.091, 0.089, 0, -0.001],
    [1.705, 0.088, 0.089, 0, -0.003],
    [1.737, 0.076, 0.081, 0, -0.007],
    [1.758, 0.054, 0.059, 0, -0.008],
    [1.768, 0.013, 0.015, 0, -0.008],
  ].map((row) => [...row, head]);
  if (level === 0) {
    for (const y of [1.575, 1.582, 1.586, 1.607, 1.612, 1.617]) {
      const i = skull.findIndex((row) => row[0] > y),
        A = skull[i - 1],
        B = skull[i],
        q = (y - A[0]) / (B[0] - A[0]);
      skull.splice(i, 0, [y, mix(A[1], B[1], q), mix(A[2], B[2], q), 0, mix(A[4], B[4], q), head]);
    }
  }
  function facets(v, a, y, sn, cs) {
    const x = abs(v[0]),
      front = Math.max(0, cs);
    v[2] +=
      front *
      (0.012 * bell(y - 1.631, 0.021) * bell(x - 0.054, 0.023) -
        0.0115 * bell(y - 1.654, 0.0095) * bell(x - 0.038, 0.016) +
        0.005 * bell(y - 1.646, 0.009) * bell(x - 0.04, 0.023) +
        0.007 * bell(y - 1.672, 0.009) * bell(x - 0.037, 0.024) +
        0.009 * bell(y - 1.584, 0.016) * bell(x, 0.035) +
        0.008 * bell(y - 1.55, 0.011) * bell(x, 0.025));
    // Nose bridge, dorsum, the two alae, philtrum and upper/lower vermilion
    // are continuous with the cheeks and jaw, including their attachment normals.
    if (cs > 0) {
      const bridge = 0.015 * bell(x, 0.0095) * bell(y - 1.64, 0.03);
      const tip = 0.026 * bell(x, 0.0115) * bell(y - 1.614, 0.012);
      const ala = 0.012 * bell(x - 0.012, 0.0047) * bell(y - 1.61, 0.0065);
      const lower = 0.0046 * bell(x, 0.018) * bell(y - 1.578, 0.0032);
      const upper = 0.0044 * bell(x - 0.006, 0.014) * bell(y - 1.585, 0.0037);
      v[2] +=
        front *
        (bridge + tip + ala + lower + upper + 0.0018 * bell(x - 0.004, 0.0024) * bell(y - 1.594, 0.007));
      if (lower + upper > 0.0018) v[4] = lip;
      else if ((x > 0.033 && x < 0.07 && abs(y - 1.627) < 0.016) || tip + ala > 0.021) v[4] = blush;
      if (abs(x - 0.01) < 0.0032 && abs(y - 1.607) < 0.0018) v[4] = nostril;
    }
    if (y < 1.607 && cs > -0.25) {
      v[3] = rig.jaw;
      v[6] = head;
      v[7] = smooth((y - 1.565) / 0.042);
    }
    if (old && cs > 0.5 && y > 1.615 && y < 1.672) {
      v[2] -= 0.0016 * bell(x - 0.053 - 0.31 * (y - 1.654), 0.005);
    }
    if (y > 1.608 && y < 1.642 && x > 0.034 && cs > 0.3) {
      v[6] = sides[v[0] > 0 ? 1 : 0].cheek;
      v[7] = 0.38 * bell(y - 1.624, 0.018);
    }
  }
  // Evaluate the skin outside the eyelid opening on the same polar sections.
  function faceDepth(x, y) {
    let i = 1;
    while (i < skull.length - 1 && skull[i][0] < y) i++;
    const A = skull[i - 1],
      B = skull[i],
      t = sat((y - A[0]) / (B[0] - A[0]));
    const sn = polar(T.MathUtils.clamp(x / mix(A[1], B[1], t), -1, 1), 1 / 0.89);
    const cs = Math.sqrt(1 - sn * sn);
    const v = [x, y, mix(A[4], B[4], t) + mix(A[2], B[2], t) * polar(cs, 0.86), head];
    facets(v, Math.asin(sn), y, sn, cs);
    return v[2];
  }
  const skullPatch = profile(skull, count(68, 40, 18), count(2, 2, 1), [skin, SKIN], facets, {}, true);
  function openSockets() {
    const { first, start, n, steps } = skullPatch,
      holes = [];
    const index = (j, i) => first + j * n + ((i + n) % n);
    const nearest = (end, value, get) => {
      let best = 0;
      for (let i = 1; i < end; i++) if (abs(get(i) - value) < abs(get(best) - value)) best = i;
      return best;
    };
    const row = (y) => nearest(steps + 1, y, (j) => body.xyz[index(j, 0) * 3 + 1]);
    const bottom = row(1.636),
      top = row(1.673),
      middle = row(1.654);
    for (const side of sides) {
      const offset = Math.floor(n * 0.24);
      const column = (x) =>
        nearest(offset * 2 + 1, x, (i) => body.xyz[index(middle, i - offset) * 3]) - offset;
      const left = column(side.s * 0.038 - 0.0235),
        right = column(side.s * 0.038 + 0.0235);
      const rim = [];
      for (let i = left; i < right; i++) rim.push(index(top, i));
      for (let j = top; j > bottom; j--) rim.push(index(j, right));
      for (let i = right; i > left; i--) rim.push(index(bottom, i));
      for (let j = bottom; j < top; j++) rim.push(index(j, left));
      holes.push({ bottom, top, left, right, rim });
    }
    // Remove the two patches beneath the globes. Eyelid annuli reuse the
    // surrounding skull indices, including the shared normal at that boundary.
    const all = body.indices.slice(start);
    body.indices.length = start;
    for (let j = 0; j < steps; j++)
      for (let i = 0; i < n; i++) {
        const column = i > n / 2 ? i - n : i;
        if (holes.some((h) => column >= h.left && column < h.right && j >= h.bottom && j < h.top)) continue;
        const k = (j * n + i) * 6;
        for (let t = 0; t < 6; t++) body.indices.push(all[k + t]);
      }
    for (let k = steps * n * 6; k < all.length; k++) body.indices.push(all[k]);
    return holes.map((h) => h.rim);
  }
  const socketRims = level < 2 ? openSockets() : [];
  for (const side of sides) {
    const { s } = side;
    oval(head, s * 0.091, 1.635, -0.003, 0.0135, 0.03, 0.018, blush, SKIN, count(20, 14, 8), count(10, 6, 4));
    if (level < 2)
      oval(
        head,
        s * 0.102,
        1.637,
        -0.002,
        0.004,
        0.017,
        0.009,
        skin.clone().multiplyScalar(0.69),
        SKIN,
        12,
        6,
      );
    const eye = bind[side.eye],
      ex = eye.x,
      ey = eye.y,
      ez = eye.z - 0.0045,
      r = 0.0132;
    if (level < 2) {
      oval(side.eye, ex, ey, ez, r, r, r, white, EYE, count(32, 20), count(12, 8));
      // Concentric iris patches follow the convex anterior surface of the eye.
      const irisColours = [ink, iris, iris.clone().multiplyScalar(1.16), ink];
      body.patch(count(36, 22), 4, (a, v, j) => {
        const rad = 0.00585 * v + 0.00003;
        return [
          ex + rad * sin(a),
          ey + rad * cos(a),
          ez + Math.sqrt(r * r - rad * rad) + 0.00028,
          side.eye,
          irisColours[[0, 0, 1, 2, 3][j]],
          EYE,
        ];
      });
      oval(side.eye, ex - 0.0024, ey + 0.0029, ez + 0.0129, 0.0014, 0.001, 0.0005, glint, EYE, 8, 4);
      const rim = socketRims[side.s < 0 ? 0 : 1],
        n = rim.length,
        rows = count(5, 3);
      const first = body.patch(n, rows, (angle, v) => {
        const k = Math.round((angle / tau) * n) % n,
          outer = rim[k] * 3;
        const ox = body.xyz[outer],
          oy = body.xyz[outer + 1],
          oz = body.xyz[outer + 2];
        const theta = Math.atan2((ox - ex) / 0.024, (oy - ey) / 0.017),
          xn = sin(theta),
          yn = cos(theta);
        const upper = yn >= 0,
          innerX = 0.012 * xn;
        const innerY = (upper ? 0.0042 : 0.0027) * polar(yn, 1.42) + 0.0007 * xn * s;
        const x = mix(ex + innerX, ox, v),
          y = mix(ey + innerY, oy, v);
        const globe = Math.sqrt(Math.max(0.000001, r * r - (x - ex) ** 2 - (y - ey) ** 2));
        const z =
          mix(Math.max(faceDepth(x, y), ez + globe + 0.00055), oz, smooth(v)) +
          0.00055 * bell(v - 0.24, 0.15) * (1 - v);
        return [
          x,
          y,
          z,
          upper ? side.upperLid : side.lowerLid,
          v < 0.01 ? (upper ? lidLine : blush) : skin,
          SKIN,
          head,
          smooth(v),
        ];
      });
      const edge = first + rows * n,
        end = body.indices.length;
      for (let i = end - 6 * n; i < end; i++)
        if (body.indices[i] >= edge) body.indices[i] = rim[body.indices[i] - edge];
    } else {
      oval(head, ex, ey, ez + 0.011, 0.014, 0.0038, 0.0016, ink, EYE, 10, 3);
    }
    if (level < 2) {
      body.patch(
        count(16, 10),
        count(6, 4),
        (a, v) => {
          const length = v * 0.04 - 0.02,
            x = ex + s * length;
          const y =
            ey +
            0.013 +
            0.0035 * cos((v - 0.4) * Math.PI) +
            0.0014 * cos(a) * (1 - 0.75 * Math.abs(2 * v - 1));
          return [
            x,
            y,
            faceDepth(x, y) + 0.0015 + 0.0013 * sin(a),
            side.brow,
            browColor,
            HAIR,
            side.outerBrow,
            v,
          ];
        },
        { caps: true, inward: s < 0 },
      );
    }
  }
  if (level < 2) {
    const crease = pigment('#694039');
    body.patch(
      count(20, 12),
      count(6, 4),
      (a, v) => {
        const x = (v - 0.5) * 0.049,
          taper = 1 - (2 * v - 1) ** 2;
        const y = 1.581 + 0.0017 * (2 * v - 1) ** 2 + 0.00085 * cos(a) * taper;
        return [
          x,
          y,
          faceDepth(x, y) + 0.001 + 0.0005 * sin(a),
          rig.jaw,
          crease,
          SKIN,
          sides[x < 0 ? 0 : 1].lip,
          1 - taper,
        ];
      },
      { caps: true },
    );
  }
  // A coiffure follows the very same cranial sections under the fringe.
  // The swept tips darken towards the roots; a nape lock trails on spring bones.
  const bob = style === 'skirt' || style === 'apron' || style === 'scarf';
  const cap = (a, v) => {
    const front = (1 + cos(a)) * 0.5;
    const lo =
      (bob ? 1.569 : 1.608) +
      front * (bob ? 0.13 : 0.094) +
      0.007 * sin(a * 3 + 0.7) -
      0.008 * bell(abs(Math.atan2(sin(a), cos(a))) - 1.08, 0.15) +
      0.0025 * sin(a * 17);
    const y = mix(lo, 1.768, sin(v * Math.PI * 0.5));
    let k = 1;
    while (k < skull.length - 1 && skull[k][0] < y) k++;
    const A = skull[k - 1],
      B = skull[k],
      q = sat((y - A[0]) / (B[0] - A[0]));
    const ridges = 0.0011 * cos(a * 21 + v * 5 + 0.6 * sin(a * 7));
    const puff = 0.007 + 0.009 * (1 - front) * (bob ? 1 : 0) + ridges * (1 - v);
    return [
      (mix(A[1], B[1], q) + puff) * polar(sin(a), 0.88),
      y + 0.005 * v,
      (mix(A[2], B[2], q) + puff) * polar(cos(a), 0.85) + mix(A[4], B[4], q),
      head,
      Math.sin(a * 13 + v * 3) > 0.92 ? highlight : hair,
      HAIR,
    ];
  };
  body.patch(count(88, 48, 22), count(12, 7, 4), cap, { caps: true });
  if (bob) {
    const chain = rig.hair;
    profile(
      [
        [1.556, 0.012, 0.012, 0, -0.107, chain[2]],
        [1.574, 0.027, 0.025, 0, -0.104, chain[2]],
        [1.6, 0.036, 0.032, 0, -0.1, chain[1]],
        [1.624, 0.039, 0.033, 0, -0.095, chain[0]],
        [1.65, 0.021, 0.024, 0, -0.09, head],
      ],
      count(28, 16, 10),
      1,
      [hair, HAIR],
      (v, a) => {
        if (cos(a * 13) > 0.82) v[4] = highlight;
      },
    );
  }
  if (style === 'straw' || style === 'cap') {
    const straw = style === 'straw',
      c = straw ? pigment('#c5a16a') : pigment('#536768');
    profile(
      [
        [1.707, 0.097, 0.102, 0, -0.005],
        [1.71, straw ? 0.167 : 0.101, straw ? 0.15 : 0.128, 0, 0.007],
        [1.716, straw ? 0.166 : 0.103, straw ? 0.148 : 0.128, 0, 0.007],
        [1.723, 0.102, 0.103, 0, -0.005],
        [1.735, 0.095, 0.1, 0, -0.006],
        [1.766, 0.086, 0.082, 0, -0.009],
        [1.782, 0.059, 0.051, 0, -0.01],
        [1.782, 0.012, 0.013, 0, -0.008],
      ].map((r) => [...r, head]),
      count(44, 28, 16),
      1,
      [c, CLOTH],
      (v, a, y) => {
        if (y >= 1.723 && y < 1.736) v[4] = welt;
        if (y < 1.723) v[1] += 0.005 * sin(2 * a + 0.6);
      },
    );
  }
  for (const side of sides) {
    const { s, h, x, arm, elbow, hand, thigh, shin, ankle, toe } = side;
    const label = s < 0 ? 'left' : 'right',
      wrist = bind[hand];
    const leg = [
      [0.091, 0.045, 0.047, -0.002, shin],
      [0.13, 0.049, 0.05, -0.004, shin],
      [0.18, 0.046, 0.05, -0.006, shin],
      [0.252, 0.054, 0.064, -0.015, shin],
      [0.326, 0.068, 0.078, -0.018, shin],
      [0.397, 0.065, 0.068, -0.01, shin],
      [0.444, 0.056, 0.056, 0, shin],
      [0.481, 0.06, 0.062, 0.008, shin],
      [0.521, 0.065, 0.065, 0.003, thigh],
      [0.59, 0.075, 0.084, -0.004, thigh],
      [0.712, 0.085, 0.094, -0.006, thigh],
      [0.768, 0.089, 0.101, -0.009, thigh],
      [0.799, 0.089, 0.101, -0.007, thigh],
    ].map(([y, w, d, z, j]) => [y, w * build, d, h, z, j]);
    const legPatch = profile(
      leg,
      2 * Math.ceil(Math.max(12, count(32, 20, 14)) / 2),
      count(2, 1, 1),
      [trousers, CLOTH],
      (v, a, y, sn, cs) => {
        const f = Math.max(0, cs),
          lateral = sn * s;
        v[2] += 0.009 * f ** 4 * bell(y - 0.482, 0.032) - 0.005 * Math.max(0, -cs) * bell(y - 0.321, 0.05);
        v[0] += 0.006 * s * bell(y - 0.711, 0.084) * (lateral + 0.4);
        const seam = 0.0019 * sin(a * 8 + (y - 0.43) * 22) * bell(y - 0.449, 0.073);
        v[0] += seam * sn;
        v[2] += seam * cs;
      },
      { [label + 'Knee']: 7 },
    );
    junctions.trouser(legPatch, s);
    profile(
      [
        [0.001, 0.051, 0.127, h, 0.055, ankle],
        [0.009, 0.057, 0.13, h, 0.055, ankle],
        [0.018, 0.058, 0.13, h, 0.055, ankle],
        [0.032, 0.06, 0.128, h, 0.055, ankle],
        [0.05, 0.057, 0.117, h, 0.047, ankle],
        [0.074, 0.053, 0.08, h, 0.022, ankle],
        [0.103, 0.047, 0.057, h, 0.001, ankle],
        [0.129, 0.047, 0.054, h, -0.002, ankle],
      ],
      count(28, 16, 12),
      1,
      [boot, LEATHER],
      (v, a, y, sn, cs) => {
        const toeBox = smooth((v[2] - 0.045) / 0.12);
        v[0] -= s * 0.009 * toeBox;
        v[1] += 0.012 * bell(v[2] - 0.012, 0.032) * smooth((1 - sn * s) * 0.5) * (1 - smooth(y / 0.04));
        if (y <= 0.018) v[4] = welt;
        v[6] = toe;
        v[7] = smooth((v[2] - 0.059) / 0.076);
      },
    );
    const armRows = [
      [0.898, 0.025, 0.027, 0.042, 0.014, hand],
      [0.924, 0.028, 0.029, 0.042, 0.011, elbow],
      [0.978, 0.032, 0.039, 0.041, 0.003, elbow],
      [1.035, 0.043, 0.045, 0.04, -0.003, elbow],
      [1.091, 0.045, 0.046, 0.038, -0.011, elbow],
      [1.14, 0.039, 0.042, 0.033, -0.015, elbow],
      [1.171, 0.045, 0.043, 0.031, -0.009, arm],
      [1.209, 0.049, 0.049, 0.024, -0.004, arm],
      [1.221, 0.053, 0.054, 0.023, -0.002, arm],
      [1.234, 0.054, 0.055, 0.023, -0.001, arm],
      [1.283, 0.058, 0.06, 0.02, 0.004, arm],
      [1.345, 0.06, 0.069, 0.011, 0.002, arm],
      [1.391, 0.065, 0.07, 0.005, 0, arm],
      [1.43, 0.061, 0.059, -0.007, -0.004, arm],
      [1.452, 0.044, 0.045, -0.017, -0.006, arm],
      [1.465, 0.017, 0.025, -0.026, -0.005, arm],
    ].map(([y, w, d, dx, z, j]) => [y, w * build, d, x + s * dx, z, j]);
    const mitten = level === 2;
    const palm = mitten
      ? [
          [-0.15, 0.012, 0.02],
          [-0.136, 0.017, 0.032],
          [-0.098, 0.019, 0.041],
        ]
      : [[-0.092, 0.011, 0.04]];
    palm.push([-0.077, 0.017, 0.047], [-0.059, 0.021, 0.048], [-0.035, 0.023, 0.042], [-0.014, 0.021, 0.032]);
    const palmRows = palm.map(([y, w, d]) => [wrist.y + y, w, d, wrist.x, wrist.z + 0.003, hand]);
    const palmLength = palmRows.length;
    const sleeve = profile(
      [...palmRows, ...armRows.filter((row) => row[0] <= 1.43)],
      Math.max(12, count(32, 20, 14)),
      count(2, 1, 1),
      [skin, SKIN],
      (v, a, y, sn, cs) => {
        v[2] += 0.007 * cs * bell(y - 1.306, 0.065) - 0.004 * Math.max(0, -cs) ** 3 * bell(y - 1.141, 0.022);
        v[0] += 0.004 * s * Math.max(0, sn * s) * bell(y - 1.392, 0.035);
        if (y > 1.283) {
          const u = sat((y - 1.283) / 0.147),
            angle = 1.28 * u * u;
          const radial = v[0] - (x + s * mix(0.02, -0.007, u));
          v[0] = x + s * (0.02 + 0.022 * sin(Math.PI * u) + 0.028 * u * u) + radial * cos(angle);
          v[1] = y - 0.045 * u * u + radial * s * sin(angle);
        }
        if (y >= 1.221) {
          v[4] = y < 1.235 ? stitched : shirt;
          v[5] = CLOTH;
        } else if (y > 1.124 && cs < -0.22) v[4] = blush;
      },
      {
        [label + 'Forearm']: palmLength + 3,
        [label + 'Elbow']: palmLength + 5,
        [label + 'Shoulder']: palmLength + 13,
      },
    );
    junctions.sleeve(sleeve, s);

    for (let digit = mitten ? 4 : 0; digit < 5; digit++) {
      const chain = side.fingers[digit],
        thumb = digit === 4;
      const radii = [0.0101, 0.0104, 0.0097, 0.0083, 0.0114],
        r = radii[digit],
        j = chain.map((id) => bind[id]);
      const tEnd = thumb ? 1.8 : 1.72;
      const tip = j[1].clone().lerp(j[2], tEnd);
      // Distal pad, DIP, middle phalanx, PIP, proximal phalanx, then knuckle.
      const rows = [
        [tip, 0.29, 2],
        [tip.clone().lerp(j[2], 0.24), 0.78, 2],
        [j[2], 0.89, 2],
        [j[2].clone().lerp(j[1], 0.42), 0.8, 1],
        [j[1], 0.98, 1],
        [j[1].clone().lerp(j[0], 0.58), 0.93, 0],
        [j[0], 1.07, 0],
      ].map(([p, k, link]) => [p.y, r * k, r * k * 0.96, p.x, p.z, mitten ? hand : chain[link]]);
      profile(rows, count(14, 9, 10), 1, [skin, SKIN], (v, a, y, sn) => {
        if (sn * s > 0.55 && abs(y - j[1].y) < 0.004) v[4] = blush;
      });
      if (!mitten) {
        const y = mix(tip.y, j[2].y, 0.52),
          z = mix(tip.z, j[2].z, 0.52),
          xx = mix(tip.x, j[2].x, 0.52);
        oval(
          chain[2],
          xx + s * 0.007,
          y,
          z,
          0.0022,
          0.0064,
          0.0056,
          lip.clone().lerp(skin, 0.55),
          SKIN,
          count(10, 6),
          count(4, 3),
        );
      }
    }
  }
  if (level === 2 && bob) {
    const shell = style === 'scarf' ? collar : style === 'apron' ? apron : trousers;
    if (style === 'scarf') {
      profile(
        [
          [1.259, 0.02, 0.008, -0.085, 0.132, rig.hem],
          [1.34, 0.029, 0.009, -0.072, 0.139, chest],
          [1.426, 0.024, 0.009, -0.044, 0.11, chest],
          [1.473, 0.02, 0.007, 0, 0.073, neck],
        ],
        10,
        1,
        [shell, CLOTH],
      );
    } else {
      profile(
        [
          [0.647, 0.221 * build, 0.171],
          [0.694, 0.218 * build, 0.168],
          [0.81, 0.203 * build, 0.156],
          [0.94, 0.194 * build, 0.143],
          [1.045, 0.169 * spec.waist, 0.129],
        ].map(([y, w, d]) => [y, w, d, 0, 0, rig.hem]),
        12,
        1,
        [shell, CLOTH],
        (v, a, y, sn, cs) => {
          const pleat = 0.008 * cos(a * 8) * (1 - sat((y - 0.647) / 0.4));
          v[0] += pleat * sn;
          v[2] += pleat * cs;
        },
      );
    }
  }
  if (level < 2) {
    const [root, tip] = rig.straps;
    profile(
      [
        [1.068, 0.007, 0.003, -0.153, 0.067, tip],
        [1.092, 0.009, 0.003, -0.158, 0.064, tip],
        [1.175, 0.013, 0.003, -0.167, 0.063, root],
        [1.249, 0.012, 0.003, -0.177, 0.074, root],
        [1.3, 0.011, 0.003, -0.176, 0.083, chest],
      ],
      count(10, 8),
      1,
      [welt, LEATHER],
    );
  }
  return body.geometry();
}

const lodWorld = new T.Vector3(),
  cameraWorld = new T.Vector3(),
  otherWorld = new T.Vector3();
const frustum = new T.Frustum(),
  viewProjection = new T.Matrix4(),
  bodySphere = new T.Sphere();
const blinkAt = (e) =>
  e < 0 || e > 0.17 ? 0 : e < 0.055 ? smooth(e / 0.055) : e < 0.086 ? 1 : 1 - smooth((e - 0.086) / 0.084);
const rigIdentity = new T.Matrix4();
export function makeAppearance(spec, group, skeleton, bulk = false) {
  const { bones, rig, sides } = spec;
  const tiers = [[], [], []],
    layers = [];
  function ensure(level) {
    if (tiers[level].length) return tiers[level][0];
    if (bulk && level !== 2) return null;
    const geometry = buildGeometry(spec, level),
      mesh = new T.SkinnedMesh(geometry, level === 2 ? distantSurface : material());
    mesh.name = 'Worker LOD ' + level;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    mesh.bind(skeleton, rigIdentity);
    rig.prepare(mesh, level);
    mesh.visible = level === 2;
    tiers[level].push(mesh);
    if (level < 2) layers.push(mesh);
    return mesh;
  }
  ensure(2);
  const rest = sides.map((s) => ({
    brow: bones[s.brow].position.y,
    outer: bones[s.outerBrow].position.y,
    cheek: bones[s.cheek].position.y,
    lip: bones[s.lip].position.y,
    lipX: bones[s.lip].position.x,
    lipZ: bones[s.lip].position.z,
    eyeZ: bones[s.eye].position.z,
  }));
  const low = tiers[2][0],
    blinkPositions = low.geometry.attributes.position,
    blinkMask = low.geometry.attributes.blinkMask;
  const lowEyes = [];
  for (let i = 0; i < blinkMask.count; i++) if (blinkMask.getX(i)) lowEyes.push(i, blinkPositions.getY(i));
  let current = 2,
    blinkTime = 0.8 + 0.05 * spec.variant,
    blinkNumber = 0,
    lastTime = -1,
    previousBlink = -1;
  const target = new T.Vector3(),
    look = new T.Vector3(),
    talkTarget = new T.Vector3();
  let hasTarget = false,
    hasTalkTarget = false,
    lastFix = -1,
    fixX = 0,
    fixY = 0,
    fromX = 0,
    fromY = 0;
  function animate(t, action, phase) {
    if (t < lastTime) {
      blinkTime = 0.8 + 0.05 * spec.variant;
      blinkNumber = 0;
      lastFix = -1;
    }
    lastTime = t;
    if (t > blinkTime + 0.25) {
      blinkTime += 2 + 4 * (0.5 + 0.5 * sin(++blinkNumber * 71.32 + phase));
      if (blinkTime < t) blinkTime = t + 0.1;
    }
    const elapsed = t - blinkTime;
    if (current === 2) {
      const blink = blinkAt(elapsed);
      if (blink !== previousBlink) {
        for (let i = 0; i < lowEyes.length; i += 2)
          blinkPositions.setY(lowEyes[i], 1.654 + (1 - blink * 0.9) * (lowEyes[i + 1] - 1.654));
        blinkPositions.needsUpdate = true;
        previousBlink = blink;
      }
      return;
    }
    const n = Math.floor((t + phase) * 1.18);
    if (n !== lastFix) {
      lastFix = n;
      fromX = fixX;
      fromY = fixY;
      const task = action === 'inspect' || action === 'pick' || action === 'row' || action === 'taste';
      if ((hasTarget && n % 4 === 0) || (action === 'talk' && hasTalkTarget)) {
        look.copy(action === 'talk' && hasTalkTarget ? talkTarget : target);
        bones[spec.head].worldToLocal(look);
        fixX = T.MathUtils.clamp(Math.atan2(look.x, Math.max(0.04, look.z)), -0.34, 0.34);
        fixY = T.MathUtils.clamp(-Math.atan2(look.y - 0.114, Math.max(0.04, look.z)), -0.19, 0.26);
      } else {
        fixX = sin(n * 3.27 + phase) * 0.19;
        fixY = (task ? 0.17 : 0.013) + 0.05 * cos(n * 5.17 + phase);
      }
    }
    const q = smooth(((t + phase) * 1.18 - n) / (1.18 * 0.035));
    const gazeX = mix(fromX, fixX, q) + 0.003 * sin(t * 27 + phase),
      gazeY = mix(fromY, fixY, q) + 0.002 * cos(t * 21 + phase);
    const talk = action === 'talk' ? 0.5 + 0.5 * sin(t * 8.4 + phase) * cos(t * 2.3) : 0;
    const taste = action === 'taste' ? 0.5 - 0.5 * cos(t * 1.8 + phase) : 0;
    const work = action === 'inspect' || action === 'pick' ? 0.7 : 0;
    bones[rig.jaw].rotation.x = talk * 0.1 + taste * 0.038;
    for (let i = 0; i < 2; i++) {
      const s = sides[i],
        b = blinkAt(elapsed - i * 0.009),
        r = rest[i];
      bones[s.eye].rotation.set(gazeY, gazeX, 0);
      bones[s.eye].position.z = r.eyeZ - 0.0025 * b;
      bones[s.upperLid].rotation.x = gazeY * 0.36 + 0.48 * b + 0.04 * work;
      bones[s.lowerLid].rotation.x = gazeY * 0.23 - 0.29 * b - 0.055 * work;
      const lift = 0.0028 * talk - 0.0019 * work + 0.0006 * sin(t * 1.1 + phase + i);
      bones[s.brow].position.y = r.brow + lift;
      bones[s.outerBrow].position.y = r.outer + lift * (0.63 + 0.23 * i);
      bones[s.cheek].position.y = r.cheek + 0.0018 * taste + 0.0012 * b;
      bones[s.lip].position.y = r.lip + 0.0024 * taste + 0.0012 * talk - 0.0014 * work;
      bones[s.lip].position.x = r.lipX + s.s * (talk * 0.0018 - taste * 0.0012);
      bones[s.lip].position.z = r.lipZ - 0.0016 * taste - 0.0008 * work;
    }
  }
  function select(level) {
    if (level === current) return;
    ensure(level);
    tiers[current][0].visible = false;
    tiers[level][0].visible = true;
    current = level;
  }
  function aim(camera, other) {
    target.copy(camera);
    hasTarget = true;
    if (other === undefined) return;
    hasTalkTarget = Boolean(other);
    if (other) {
      other.getWorldPosition(talkTarget);
      talkTarget.y += 1.65 * other.matrixWorld.getMaxScaleOnAxis();
    }
  }
  return { tiers, layers, animate, select, ensure, aim };
}

// Every scene calls this after placing/posing its actors. Keep the closest two
// visible bodies in the mobile allocation, breaking distance ties by list order.
export function rankPeople(people, camera, mobile, high = true) {
  let first = -1,
    second = -1,
    near = Infinity,
    next = Infinity;
  camera.getWorldPosition(cameraWorld);
  frustum.setFromProjectionMatrix(
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    p.g.getWorldPosition(lodWorld);
    bodySphere.center.set(0, 0.88, 0).applyMatrix4(p.g.matrixWorld);
    bodySphere.radius = 0.94 * p.g.matrixWorld.getMaxScaleOnAxis();
    if (!p.g.visible || !frustum.intersectsSphere(bodySphere)) continue;
    const d = bodySphere.center.distanceToSquared(cameraWorld);
    if (d < near) {
      second = first;
      next = near;
      first = i;
      near = d;
    } else if (d < next) {
      second = i;
      next = d;
    }
  }
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    let neighbour = null,
      nearest = Infinity;
    if (p.action === 'talk') {
      p.g.getWorldPosition(lodWorld);
      for (let k = 0; k < people.length; k++)
        if (k !== i && people[k].g.visible) {
          people[k].g.getWorldPosition(otherWorld);
          const d = otherWorld.distanceToSquared(lodWorld);
          if (d < nearest) {
            neighbour = people[k].g;
            nearest = d;
          }
        }
    }
    p.aim?.(cameraWorld, neighbour);
    p.lod(camera, mobile, i === first || i === second, high);
  }
}

// Fill the remaining cache after the first visible frame, one mesh per idle
// turn. Explicit warm-up and camera activation can always claim a tier first.
const pendingScenes = new WeakMap();
export function finishPeopleLoad(scene) {
  if (pendingScenes.has(scene)) return pendingScenes.get(scene);
  const remaining = [];
  for (const level of [1, 0])
    scene.traverse((n) => {
      if (n.userData.preparePeopleLOD) remaining.push([n.userData.preparePeopleLOD, level]);
    });
  const idle = globalThis.requestIdleCallback
    ? (fn) => requestIdleCallback(fn, { timeout: 250 })
    : (fn) => setTimeout(fn, 32);
  const finished = new Promise((resolve, reject) => {
    let i = 0;
    function next() {
      try {
        if (i === remaining.length) {
          resolve();
          return;
        }
        const [ensure, level] = remaining[i++];
        ensure(level);
        idle(next);
      } catch (error) {
        reject(error);
      }
    }
    idle(next);
  });
  pendingScenes.set(scene, finished);
  return finished;
}
