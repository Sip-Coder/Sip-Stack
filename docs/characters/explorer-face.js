import * as T from 'three';
import { sampleExterior } from './human-exterior.js';

const tau = 2 * Math.PI;
const { clamp, lerp, smoothstep } = T.MathUtils;
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const material = (color, roughness = 0.59, extra) =>
  new T.MeshStandardMaterial({ color, roughness, ...extra });

function geometry(columns, rows, hide, reverse = false) {
  const g = new T.BufferGeometry();
  const index = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < columns - 1; i++) {
    if (hide?.(i, j)) continue;
    const a = j * columns + i, b = a + 1;
    if (reverse) index.push(a, a + columns, b, b, a + columns, b + columns);
    else index.push(a, b, a + columns, b, b + columns, a + columns);
  }
  g.setIndex(index);
  g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(columns * rows * 3), 3));
  return g;
}

function part(parent, name, shape, mat, region, animated = false) {
  const mesh = new T.Mesh(shape, mat);
  mesh.name = name;
  mesh.userData.anatomicalSkin = name;
  if (region) mesh.userData.faceRegion = region;
  if (animated) {
    shape.attributes.position.setUsage(T.DynamicDrawUsage);
    mesh.userData.dynamicPose = true;
  }
  parent.add(mesh);
  return mesh;
}

function surface(mesh, columns, rows, sample, pigment) {
  const g = mesh.geometry, positions = g.attributes.position;
  let colors = g.attributes.color;
  if (pigment && !colors) {
    colors = new T.BufferAttribute(new Float32Array(positions.count * 3), 3);
    g.setAttribute('color', colors);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const k = j * columns + i, u = i / (columns - 1), v = j / (rows - 1);
    const xyz = sample(u, v, i, j);
    positions.setXYZ(k, ...xyz);
    if (pigment) colors.setXYZ(k, ...pigment(u, v, xyz));
  }
  if (pigment) colors.needsUpdate = true;
  positions.needsUpdate = true;
  g.computeVertexNormals();
  return mesh;
}

function facePaint(tone) {
  const mat = material(tone, 0.62, { vertexColors: true, side: T.DoubleSide });
  mat.userData.blueprintId = 'skin';
  mat.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vFacePoint;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvec3 sipRest = position; vFacePoint = sipRest;');
    shader.fragmentShader = `
varying vec3 vFacePoint;
float pore(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
` + shader.fragmentShader.replace('#include <color_fragment>', `
#include <color_fragment>
vec2 freckles = vFacePoint.xy * 370.0;
vec2 fcell = floor(freckles);
vec2 foffset = vec2(pore(fcell), pore(fcell.yx + 13.0)) * .46 + .27;
float fd = length(fract(freckles) - foffset);
float fm = (1.0 - smoothstep(.075, .29, fd)) * step(.71, pore(fcell + 8.0));
fm *= smoothstep(.027, .047, vFacePoint.z) * exp(-pow((vFacePoint.y - .013) * 140.0, 2.0));
diffuseColor.rgb *= mix(vec3(1.0), vec3(.75, .63, .52), fm * .34);
`).replace('#include <roughnessmap_fragment>', `
#include <roughnessmap_fragment>
float tzone = exp(-pow(vFacePoint.x * 89.0, 2.0));
roughnessFactor += .055 - .12 * tzone * smoothstep(.02, .05, vFacePoint.z);
`).replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
vec2 grain = vFacePoint.xy * 1190.0;
float bandwidth = max(fwidth(grain.x), fwidth(grain.y));
vec2 micro = sin(grain * 6.2831853) * (.012 * (1.0 - smoothstep(.18, .48, bandwidth)));
normal = normalize(normal + vec3(micro, 0.0));
`).replace('#include <opaque_fragment>', `
outgoingLight += diffuseColor.rgb * vec3(.032, .014, .009) * pow(1.0 - max(0.0, normal.z), 2.0);
#include <opaque_fragment>
`);
  };
  mat.customProgramCacheKey = () => 'explorer-face-skin';
  return mat;
}

const tangent = (x, y) => x * y > 0 ? Math.sign(x) * Math.min(Math.abs(x), Math.abs(y)) : 0;
function monotone(a, b, c, d, t) {
  const before = b - a, width = c - b, after = d - c;
  return lerp(b, c, t) + t * (1 - t) *
    ((1 - t) * (tangent(before, width) - width) - t * (tangent(width, after) - width));
}

function sectionField(rows, marks, roma) {
  const stations = rows.map(row => row.map(v => v / 100000));
  const y0 = stations[0][0], y1 = stations.at(-1)[0];
  const xN = lerp(marks.nasion[0], marks.piriform[0], 0.66);
  const yN = lerp(marks.nasalBone[1], marks.piriform[1], 0.78);
  const xM = (marks.incisor[0] + marks.upperIncisor[0]) / 2;
  const yM = marks.upperIncisor[1] + (roma ? 0.0011 : 0.0026);

  function rowAt(y) {
    const j = Math.max(0, Math.min(stations.length - 2, Math.floor((y - y0) / (y1 - y0) * (stations.length - 1))));
    const a = stations[j], b = stations[j + 1];
    return [stations[j - 1] ?? a, a, b, stations[j + 2] ?? b, clamp((y - a[0]) / (b[0] - a[0]), 0, 1)];
  }

  function radial(y, angle, ring = rowAt(y)) {
    const [p, a, b, q, v] = ring;
    const turn = ((angle / tau * 36) % 36 + 36) % 36, i = Math.floor(turn);
    const ii = (i + 1) % 36, f = turn - i;
    const around = row => lerp(row[i + 3], row[ii + 3], f);
    const r = monotone(around(p), around(a), around(b), around(q), v);
    return [monotone(p[1], a[1], b[1], q[1], v) + r * Math.sin(angle), y,
      monotone(p[2], a[2], b[2], q[2], v) + r * Math.cos(angle)];
  }

  function nose(x, y) {
    const wing = Math.abs(x - xN);
    const bridge = 0.0022 * bell(wing, 0, 0.0059) * bell(y, marks.nasalBone[1] - 0.005, 0.007);
    const tip = (roma ? 0.0062 : 0.0059) * bell(wing, 0, 0.0078) * bell(y, yN - 0.0007, 0.0050);
    const ala = 0.0043 * bell(wing, 0.0056, 0.0033) * bell(y, yN - 0.0027, 0.0029);
    const column = 0.0037 * bell(wing, 0, 0.0025) * bell(y, yN - 0.0046, 0.0029);
    const recess = 0.0015 * bell(wing, 0.0043, 0.0015) * bell(y, yN - 0.0049 + 0.10 * wing, 0.00135);
    return bridge + tip + ala + column - recess;
  }

  function front(x, y) {
    const row = rowAt(y);
    let best = -Infinity, prev = radial(y, -Math.PI / 2, row);
    for (let i = -8; i <= 9; i++) {
      const next = radial(y, tau * i / 36, row);
      if ((x >= prev[0] && x <= next[0]) || (x <= prev[0] && x >= next[0])) {
        const f = (x - prev[0]) / (next[0] - prev[0] || 1);
        best = Math.max(best, lerp(prev[2], next[2], f));
      }
      prev = next;
    }
    return best;
  }
  return { front, radial, y0, y1, xN, yN, xM, yM, nose };
}

function eyePaint(roma, radius, gaze) {
  const mat = material('#f7e8d6', 0.49);
  const tint = { value: new T.Color(roma ? '#704322' : '#693d1f') };
  mat.onBeforeCompile = shader => {
    shader.uniforms.eyeGaze = gaze;
    shader.uniforms.eyeRadius = { value: radius };
    shader.uniforms.irisTint = tint;
    shader.vertexShader = 'varying vec2 eyePoint;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\neyePoint = position.xy;');
    shader.fragmentShader =
      'uniform vec2 eyeGaze; uniform float eyeRadius; uniform vec3 irisTint; varying vec2 eyePoint;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `
#include <color_fragment>
vec2 p = (eyePoint-eyeGaze) / (eyeRadius*.585);
float r = length(p), a = atan(p.y, p.x), aa = max(.017, fwidth(r));
float fibres = .52 + .25*sin(a*27.+r*7.) + .23*sin(a*41.-r*5.);
vec3 iris = irisTint*(.65+.38*fibres-.26*p.y);
iris = mix(iris, vec3(.017,.008,.005), smoothstep(.70,1.,r));
iris = mix(vec3(.009,.004,.003), iris, smoothstep(.56-aa,.56+aa,r));
diffuseColor.rgb = mix(iris,diffuseColor.rgb,smoothstep(1.-aa,1.+aa,r));
float glint = 1.-smoothstep(.087,.136,length(p-vec2(-.33,.39)));
glint += .40*(1.-smoothstep(.040,.078,length(p-vec2(.22,-.28))));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95,.87,.73), min(glint,.96));
`);
  };
  mat.customProgramCacheKey = () => 'explorer-iris';
  return mat;
}

function eyeSocket(orbit, side, field, roma, height) {
  // The resting sclera spans on 94deb9d were 2.604 and 2.697 inches.
  // Preserve their appeal at 87.5% of that span after the uniform head scale.
  const r = (roma ? 2.697 : 2.604) * 0.0254 * 0.875 / (2 * height);
  const x = orbit.center[0] + side * 0.0013;
  const y = orbit.center[1] + 0.0004;
  const z = field.front(x, y) - 0.64 * r;
  const stretch = 0.88, open = r * 0.985;
  function dome(xx, yy) {
    return z + stretch * Math.sqrt(Math.max(0, r ** 2 - (xx - x) ** 2 - (yy - y) ** 2));
  }
  function margin(u, upper, blink) {
    const q = 2 * u - 1;
    const arch = Math.max(0, 1 - q ** 2) ** 0.64;
    const tilt = side * q * (roma ? 0.00122 : 0.00075);
    const xx = x + q * open, yy = y + tilt + r * arch * lerp(
      upper ? (roma ? 0.53 : 0.54) : (roma ? -0.37 : -0.40), -0.12, blink);
    return [xx, yy, dome(xx, yy) + 0.00031];
  }
  return { orbit, side, x, y, z, r, open, dome, margin };
}

function eyeParts(head, socket, field, skin, roma) {
  const { orbit, side, x, y, z, r, dome, margin } = socket;
  const name = side === 1 ? 'Left' : 'Right';
  const lens = new T.Group();
  lens.name = name + ' eye';
  lens.position.set(x, y, z);
  lens.userData.dynamicPose = true;
  head.add(lens);
  const aim = { value: new T.Vector2() };
  const cols = 25, rows = 7;
  const globe = part(lens, name + ' eye', geometry(cols, 9), eyePaint(roma, r, aim), null, true);

  const browPigment = material(0xffffff, 0.64, { vertexColors: true, side: T.DoubleSide });
  const liner = material(roma ? '#2c1611' : '#3d2217', 0.68, { side: T.DoubleSide });
  const lowerLiner = material(roma ? '#714332' : '#855139', 0.74, { side: T.DoubleSide });
  const lids = [], lashes = [];
  for (const upper of [false, true]) {
    const label = name + (upper ? ' upper' : ' lower');
    const shell = part(head, label + ' eyelid', geometry(cols, rows, undefined, !upper), skin, 'orbit', true);
    const line = part(head, label + ' lash line', geometry(cols, 2), upper ? liner : lowerLiner, null, true);
    const count = upper ? (roma ? 7 : 4) : 0;
    const tips = count ? part(head, label + ' lashes',
      geometry(3, 2 * count, (_, j) => j % 2 === 1), liner, null, true) : null;
    const direction = upper ? 1 : -1;
    const rim = Array.from({ length: cols }, (_, i) => {
      const u = i / (cols - 1), [xx, yy] = margin(u, upper, 0);
      const ox = x + (xx - x) * 1.23;
      const oy = yy + direction * (0.0017 + 0.0043 * Math.sin(Math.PI * u));
      const contact = field.face(ox, oy), d = 0.00085;
      const nx = field.face(ox - d, oy) - field.face(ox + d, oy);
      const ny = field.face(ox, oy - d) - field.face(ox, oy + d);
      const normal = new T.Vector3(Number.isFinite(nx) ? nx : 0, Number.isFinite(ny) ? ny : 0, 2 * d).normalize();
      return [ox, oy, Number.isFinite(contact) ? contact : z, normal];
    });
    lids.push(shell);
    lashes.push({ upper, shell, line, count, tips, direction, rim });
  }

  const duct = part(head, name + ' tear duct', new T.SphereGeometry(0.00065, 8, 5), material('#a5614a', .68));
  const [dx, dy, dz] = margin(side > 0 ? 0.045 : 0.955, false, 0);
  duct.position.set(dx, dy, dz + 0.00014);
  duct.scale.set(1.20, 0.55, 0.50);

  const eyebrow = part(head, name + ' eyebrow', geometry(25, 5), browPigment, null, true);
  const browY = orbit.superior[1] + (roma ? 0.0027 : 0.0018);
  let lastBlink, lastBrowLift, lastFocus;

  function gaze(cue, time) {
    const across = cue?.gazeX ?? (cue ? 0 : Math.sin(time * 0.67) * 0.27);
    const up = cue?.gazeY ?? (cue ? 0 : Math.sin(time * 0.83) * 0.20);
    aim.value.set(r * (side * 0.057 + 0.145 * across), r * (0.025 + 0.132 * up));
  }

  function pose(blink, cue, smile, focus) {
    const openStep = Math.round(blink * 48) / 48;
    if (openStep !== lastBlink) surface(globe, cols, 9, (u, v) => {
      // Expose only the section of the spheroid inside the moving lid margins.
      const [ax, ay] = margin(u, false, openStep);
      const [, by] = margin(u, true, openStep);
      const yy = lerp(ay, by, v);
      return [ax - x, yy - y, dome(ax, yy) - z];
    });
    if (openStep !== lastBlink) for (const { upper, shell, line, count, tips, direction, rim } of lashes) {
      surface(shell, cols, rows, (u, v, i) => {
        const [xx, yy, zz] = margin(u, upper, openStep);
        const [ox, oy, contact] = rim[i];
        const cx = lerp(xx, ox, v), cy = lerp(yy, oy, v);
        const cover = dome(cx, cy) + 0.00017;
        const roll = 0.00027 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u);
        const inner = Math.max(cover, lerp(zz, contact, v) + roll);
        const blend = smoothstep(v, 0.12, 1);
        // The outer rim enters the same face surface before the crease ends.
        return [cx, cy, lerp(inner, contact - 0.00045, blend)];
      }, (u, v) => {
        const tint = (1 - v) ** 2 * Math.sin(Math.PI * u) * (upper ? 0.11 : 0.06);
        return [1 - 0.28 * tint, 1 - 0.77 * tint, 1 - 0.87 * tint];
      });
      const normal = shell.geometry.attributes.normal, sample = new T.Vector3();
      for (let j = 0; j < rows; j++) {
        const join = 0.32 + 0.68 * smoothstep(j / (rows - 1), 0, 0.78);
        for (let i = 0; i < cols; i++) {
          const at = j * cols + i;
          sample.fromBufferAttribute(normal, at).lerp(rim[i][3], join).normalize();
          normal.setXYZ(at, sample.x, sample.y, sample.z);
        }
      }
      normal.needsUpdate = true;
      surface(line, cols, 2, (u, v) => {
        const [xx, yy, zz] = margin(u, upper, openStep);
        const taper = Math.sin(Math.PI * u) ** 0.54;
        const band = upper ? (roma ? 0.00109 : 0.00083) : 0.00038;
        const cy = yy + direction * (v - 0.16) * taper * band;
        return [xx, cy, Math.max(dome(xx, cy) + 0.00032, zz + 0.00015)];
      });
      if (tips) surface(tips, 3, count * 2, (u, _, i, j) => {
        const at = 0.55 + Math.floor(j / 2) * 0.37 / (count - 1);
        const [xx, yy, zz] = margin(side > 0 ? at : 1 - at, true, openStep);
        const length = (roma ? 0.00215 : 0.00118) * (0.57 + 0.55 * at), tip = j % 2;
        return [xx + side * length * (0.50 * tip) + (u - 0.5) * (tip ? 0.00001 : 0.00019),
          yy + length * tip, zz + 0.00038 + 0.00032 * tip];
      });
    }
    lastBlink = openStep;
    const rise = (cue?.browLift ?? 0.45 * Math.max(smile, focus)) * 0.0023 +
      (cue?.surprise ?? 0) * 0.0017 + side * (cue?.asymmetry ?? 0) * 0.0013;
    if (rise === lastBrowLift && focus === lastFocus) return;
    lastBrowLift = rise;
    lastFocus = focus;
    surface(eyebrow, 25, 5, (u, v) => {
      const q = 2 * u - 1;
      const xx = x + side * (q * r * 1.06 + 0.00055);
      const crest = roma ? 0.50 : 0.46;
      const arch = u < crest ? 0.44 + 0.56 * (u / crest) ** 0.83 : 1 - ((u - crest) / (1 - crest)) ** 1.48;
      const width = (roma ? 0.0038 : 0.0044) * Math.sin(Math.PI * u) ** 0.15 * (1.37 - 0.94 * u);
      const yy = browY + (roma ? 0.0048 : 0.0039) * arch + rise -
        q * (0.00085 + 0.0014 * focus) + (v - 0.5) * width;
      return [xx, yy, field.face(xx, yy) + 0.00096 + 0.00064 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u)];
    }, (u, v) => {
      const band = 0.77 + 0.23 * Math.sin(Math.PI * v) + 0.07 * Math.sin(147 * u + 2 * v);
      return [0.035 * band, 0.017 * band, 0.010 * band];
    });
  }

  return { pose, gaze, globe, lids };
}

function lips(head, field, marks) {
  const shell = material(0xffffff, 0.36, { vertexColors: true, side: T.DoubleSide });
  const sparse = { side: T.DoubleSide };
  const upper = part(head, 'Upper lip', geometry(27, 8), shell, 'lips', true);
  const lower = part(head, 'Lower lip', geometry(27, 8), shell, 'lips', true);
  const cavity = part(head, 'Mouth cavity', geometry(27, 2), material('#451d1a', 0.82, sparse), null, true);
  const teeth = part(head, 'Teeth', geometry(33, 4), material(0xffffff, 0.38, { ...sparse, vertexColors: true }), null, true);
  const lipstick = new T.Color('#bd5138');
  const border = new T.Color('#80301f');
  const shade = new T.Color();
  const width = 0.0175;
  const { xM, yM } = field;
  function oralSurface(x, y, q) {
    const depth = field.front(x, y);
    const incisor = marks.upperIncisor[2] - 0.010 * q ** 2;
    return Number.isFinite(depth) ? Math.max(incisor, depth + field.nose(x, y)) : incisor;
  }

  function pose(smile, focus, cue) {
    const surprise = cue?.surprise ?? 0;
    const opened = T.MathUtils.clamp(cue?.mouthOpen ?? (0.66 * smile + 0.27 * surprise), 0, 1);
    function shape(u) {
      const q = 2 * u - 1, taper = Math.max(0, 1 - q ** 2) ** 0.72;
      const x = xM + q * width * (1 + 0.08 * smile - 0.10 * surprise);
      const y = yM + (0.0015 + smile * 0.0033) * q ** 2 - 0.0010 * focus +
        (cue?.asymmetry ?? 0) * 0.0015 * q;
      const aperture = (0.00010 + 0.0046 * opened) * taper;
      const z = oralSurface(x, y, q);
      return [x, y, z, taper, aperture, q];
    }
    const mouth = Array.from({ length: 27 }, (_, i) => shape(i / 26));
    for (const [mesh, direction] of [[upper, 1], [lower, -1]]) {
      surface(mesh, 27, 8, (u, v, i) => {
        const [x, y, z, taper, aperture, q] = mouth[i];
        const bow = direction === 1 ? 0.61 + 0.43 * bell(Math.abs(q), 0.28, 0.17) : 1;
        const height = (direction === 1 ? 0.0045 : 0.0049) * taper * bow;
        const yy = y + direction * (aperture + height * v);
        const fitted = oralSurface(x, yy, q);
        const line = Math.max(z + 0.00132 * taper, fitted + 0.00042);
        const borderZ = fitted + 0.00029;
        const pillow = Math.sin(Math.PI * v) * (direction === 1 ? 0.0026 : 0.0032);
        return [x, yy, lerp(line, borderZ, v) + pillow * taper];
      }, (u, v) => shade.copy(lipstick).lerp(border,
        0.46 * (1 - v) ** 5 + 0.19 * v ** 4 + 0.19 * Math.abs(u * 2 - 1) ** 2).toArray());
    }
    surface(cavity, 27, 2, (u, v, i) => {
      const [x, y, z, taper, aperture, q] = mouth[i];
      const yy = y + (v * 2 - 1) * (aperture + 0.00009);
      return [x, yy, Math.max(z + 0.00119 * taper, oralSurface(x, yy, q) + 0.00025)];
    });
    teeth.visible = opened > 0.16;
    if (teeth.visible) surface(teeth, 33, 4, (u, v) => {
      const [x, y, z, taper, aperture, q] = shape(0.15 + 0.7 * u);
      const upper = v > .45;
      const beside = taper * (upper ? 0.0019 : 0.0013);
      const upperSet = Math.min(y + aperture - 0.00018, marks.upperIncisor[1] + 0.0042 + 0.0045 * smile);
      const lowerSet = Math.max(y - aperture + 0.00018, marks.incisor[1] - 0.0043 * opened);
      const yy = upper ? upperSet - (1 - v) * beside : lowerSet + v * beside;
      return [x, yy, Math.max(z + 0.00135 * taper + 0.00014, oralSurface(x, yy, q) + 0.0004)];
    }, (u, v) => {
      const lines = 0.82 + 0.18 * Math.abs(Math.cos(u * Math.PI * 8)) ** 0.36;
      return [0.98 * lines, 0.85 * lines, 0.69 * lines];
    });
  }
  return pose;
}

function ear(head, side, marks, skin, roma) {
  const partName = side === 1 ? 'Left ear' : 'Right ear';
  const [x, y, z] = marks.meatus[side === 1 ? 'L' : 'R'];
  const ear = part(head, partName, geometry(41, 23), skin, 'ears');
  const rx = roma ? 0.0094 : 0.0104, ry = roma ? 0.0154 : 0.0159;
  const centerX = x + side * (roma ? 0.0079 : 0.0082);
  const centerZ = z + 0.0017;
  surface(ear, 41, 23, (u, v) => {
    const t = tau * u;
    const r = Math.sin(Math.PI * v), ang = r * Math.cos(t), h = r * Math.sin(t);
    const fore = v >= 0.5;
    const helix = fore ? 0.0030 * bell(r, .80, 0.105) * smoothstep(h, -.83, -.54) : 0;
    const bowl = fore ? -0.00165 * bell(r, 0.36, .27) : 0;
    const antihelix = fore ? 0.00142 * bell(r, .53, .12) * smoothstep(ang, -.36, .29) : 0;
    const tragus = fore ? 0.0022 * bell(ang, -.41, .16) * bell(h, -.10, .22) : 0;
    const lobe = fore ? 0.0017 * bell(h, -.74, .25) * bell(ang, -.13, .45) : 0;
    const d = (fore ? 0.0041 : 0.0034) * -Math.cos(Math.PI * v) + helix + bowl + antihelix + tragus + lobe;
    return [centerX + side * (rx * ang * 0.82 + 0.55 * d + 0.14 * ry * h),
      y + ry * h - 0.0003,
      centerZ - 0.57 * rx * ang + 0.83 * d - 0.15 * ry * h];
  }, (u, v) => {
    const r = Math.sin(Math.PI * v);
    const red = (v > .5 ? 0.26 : 0.08) * bell(r, .44, .31);
    return [1 + 0.09 * red, 1 - 0.94 * red, 1 - 1.03 * red];
  });
  if (roma) {
    const gold = material('#dbb05b', 0.31, { metalness: 0.67 });
    const hoop = new T.Mesh(new T.TorusGeometry(0.0094, 0.00112, 8, 29), gold);
    hoop.name = partName + 'ring';
    hoop.userData.faceAccessory = true;
    hoop.position.set(centerX + side * 0.0011, y - ry - 0.0068, centerZ + 0.0037);
    hoop.scale.set(0.82, 1.11, 1);
    hoop.rotation.y = side * 0.25;
    head.add(hoop);
  }
}

function faceDepth(field, sockets, x, y, support = field.front(x, y)) {
  let z = support + field.nose(x, y);
  for (const eye of sockets) {
    const dx = (x - eye.x) / eye.open;
    if (Math.abs(dx) >= 1.13 || Math.abs(y - eye.y) >= eye.r) continue;
    const u = clamp(0.5 + 0.5 * dx, 0, 1);
    const upper = y > eye.y;
    const [, edgeY] = eye.margin(u, upper, 0);
    const signed = (y - edgeY) * (upper ? 1 : -1);
    const cover = (1 - smoothstep(Math.abs(dx), .82, 1.13)) *
      (1 - smoothstep(signed, 0.0008, 0.0058));
    const socket = eye.dome(x, y) + 0.00057 - 0.0026 * (1 - smoothstep(signed, -.0030, 0));
    z = lerp(z, socket, cover);
  }
  return z;
}

function sculpt(head, field, skin, roma) {
  const rowCount = 58, columns = 101;
  const face = part(head, 'Face', geometry(columns, rowCount), skin);
  surface(face, columns, rowCount, (u, v, i, j) => {
    const q = 2 * u - 1;
    const a = Math.sign(q) * Math.PI * (0.38 * Math.abs(q) + 0.62 * Math.abs(q) ** 2.3);
    // Give the undercut of the alae six adjacent rows within 1/8 inch.
    const tip = field.yN - 0.003;
    const y = j < 23 ? lerp(field.y0, tip - 0.0065, j / 23)
      : j < 35 ? lerp(tip - 0.0065, tip + 0.0055, (j - 23) / 12)
      : lerp(tip + 0.0055, field.y1, (j - 35) / (rowCount - 36));
    const p = field.radial(y, a);
    if (Math.abs(a) < Math.PI / 2) {
      p[2] = field.face(p[0], y, p[2]);
      p[2] = field.mouthDepth?.(...p) ?? p[2];
    }
    return p;
  }, (u, v, [x, y, z]) => {
    const cheek = bell(Math.abs(x - field.xM), roma ? 0.024 : 0.025, .010) *
      bell(y, field.yN + .004, .011) * smoothstep(z, .027, .046);
    const nose = bell(x, field.xN, .008) * bell(y, field.yN - .001, .006);
    const warm = (roma ? .63 : .54) * cheek + .30 * nose;
    return [1 + .041 * warm, 1 - .145 * warm, 1 - .24 * warm];
  });
  return face;
}

function neckJoin(rig, parent, field, skin) {
  const origin = rig.anatomy.joints.head;
  const mount = rig.headAssembly;
  const scale = mount.scale.x;
  const profile = rig.exterior.torso;
  const y0 = profile.at(-4)[0];
  const join = part(parent, 'Face to neck join', geometry(37, 10), skin, 'neck');
  surface(join, 37, 10, (u, v) => {
    const angle = (0.41 + u * 1.18) * Math.PI;
    const flap = Math.sin(Math.PI * u) ** 0.5;
    const y1 = -0.004 + 0.017 * flap;
    const bodyY = lerp(y0, origin.y + mount.position.y + scale * y1, v);
    const [x, z, r] = sampleExterior(profile, Math.min(bodyY, profile.at(-1)[0]), angle);
    const [sx, , sz] = field.radial(y1, angle);
    const [dx, dz] = [Math.sin(angle), Math.cos(angle)];
    const skinR = r + (-0.0007 + 0.0018 * Math.sin(Math.PI * v)) * flap;
    const t = smoothstep(v, 0.25, 1);
    return [lerp((x - origin.x - mount.position.x + dx * skinR) / scale, sx - dx * 0.00055, t),
      (bodyY - origin.y - mount.position.y) / scale,
      lerp((z - origin.z - mount.position.z + dz * skinR) / scale, sz - dz * 0.00055, t)];
  }, () => [1, 1, 1]);
}

export function buildExplorerFace(rig, hero, tone, shell, marks, seatMouth) {
  const roma = hero === 'roma';
  const shade = new T.Color(tone);
  const field = sectionField(shell, marks, roma);
  const parent = new T.Group();
  parent.name = roma ? 'face and band' : 'sippy-head';
  const carrier = rig.headAssembly;
  const scale = carrier.scale.x;
  carrier.userData.faceShell = shell;
  carrier.add(parent);
  const skin = facePaint(shade);
  const sockets = [-1, 1].map(side =>
    eyeSocket(marks.orbit[side === 1 ? 'L' : 'R'], side, field, roma, rig.height * scale));
  const inch = 0.0254 / (rig.height * scale);
  const pins = sockets.map(({ orbit }) => [orbit.superior, 0.285]);
  pins.push([marks.glabella, 0.225]);
  field.face = (x, y, support) => {
    let z = faceDepth(field, sockets, x, y, support);
    for (const [[xx, yy, zz], depth] of pins)
      z = lerp(z, zz + depth * inch, bell(x, xx, 0.0058) * bell(y, yy, 0.0049));
    return z;
  };
  const eyes = sockets.map(socket => eyeParts(parent, socket, field, skin, roma));
  const mouth = seatMouth ? seatMouth(parent, field, marks.upperIncisor, scale) : lips(parent, field, marks);
  const head = sculpt(parent, field, skin, roma);
  neckJoin(rig, parent, field, skin);
  for (const side of [-1, 1]) ear(parent, side, marks, skin, roma);

  let signature = '';
  function pose(f, lift = 0) {
    const { time, faceCue: cue, emote, state } = f;
    const phase = roma ? (time + .285) % 3.71 : (time + .13) % 4.2;
    const duration = roma ? .14 : .16;
    const blink = cue?.blink ?? (cue ? 0 : phase < duration ? Math.sin(Math.PI * phase / duration) : 0);
    const laugh = state === 'run' ? (roma ? .68 : .74) + (roma ? .13 : .14) * Math.sin(f.phase * 2) : 0;
    const smile = cue?.smile ?? Math.max(lift, laugh, .22 * Number(state === 'walk'));
    const focus = cue?.focus ?? bell(emote, .56, .10);
    const wink = cue?.wink ?? bell(emote, .86, .042);
    const close = Math.max(blink, focus * .32, cue?.squint ?? laugh * .17, state === 'roll' ? .35 : 0);
    // Fixed review poses need no animation allocation on successive frames.
    eyes.forEach(eye => eye.gaze(cue, time));
    const surprise = cue?.surprise ?? (!roma && state === 'jump' ? Math.min(1, .36 + Math.abs(f.vy) * .15) : 0);
    const key = [close, smile, focus, wink, cue?.mouthOpen, cue?.browLift, surprise, cue?.asymmetry].join(',');
    if (key === signature) return;
    signature = key;
    const expression = surprise && cue?.surprise == null ? { ...cue, surprise } : cue;
    eyes.forEach((eye, i) => eye.pose(Math.max(close, i === (roma ? 0 : 1) ? wink : 0), expression, smile, focus));
    mouth(smile, focus, expression);
  }
  pose({ time: 0, faceCue: { smile: 0, blink: 0 }, emote: -1, state: 'idle' });
  return { parent, pose, head, eyes: eyes.map(eye => eye.globe), skin: [head, ...eyes.flatMap(eye => eye.lids)] };
}
