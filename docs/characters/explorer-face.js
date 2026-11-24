import * as T from 'three';
import { sampleExterior } from './human-exterior.js';

const tau = 2 * Math.PI;
const { clamp, lerp, smoothstep } = T.MathUtils;
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const material = (color, roughness = 0.59, extra) =>
  new T.MeshStandardMaterial({ color, roughness, ...extra });

function geometry(columns, rows, hide) {
  const g = new T.BufferGeometry();
  const index = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < columns - 1; i++) {
    if (hide?.(i, j)) continue;
    const a = j * columns + i, b = a + 1;
    index.push(a, b, a + columns, b, b + columns, a + columns);
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
  const mat = material(tone, 0.59, { vertexColors: true });
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
diffuseColor.rgb *= mix(vec3(1.0), vec3(.70, .55, .47), fm * .40);
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
outgoingLight += diffuseColor.rgb * vec3(.047, .024, .016) * pow(1.0 - max(0.0, normal.z), 2.0);
#include <opaque_fragment>
`);
  };
  mat.customProgramCacheKey = () => 'explorer-face-skin';
  return mat;
}

function sectionField(rows, marks, roma) {
  const stations = rows.map(row => row.map(v => v / 100000));
  const y0 = stations[0][0], y1 = stations.at(-1)[0];
  const xN = lerp(marks.nasion[0], marks.piriform[0], 0.66);
  const yN = lerp(marks.nasalBone[1], marks.piriform[1], 0.78);
  const xM = (marks.incisor[0] + marks.upperIncisor[0]) / 2;
  const yM = marks.upperIncisor[1] + (roma ? 0.0011 : 0.0018);

  function rowAt(y) {
    const j = Math.max(0, Math.min(stations.length - 2, Math.floor((y - y0) / (y1 - y0) * (stations.length - 1))));
    const a = stations[j], b = stations[j + 1];
    return [a, b, T.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1)];
  }

  function radial(y, angle, ring = rowAt(y)) {
    const [a, b, v] = ring;
    const turn = ((angle / tau * 36) % 36 + 36) % 36, i = Math.floor(turn);
    const ii = (i + 1) % 36, f = turn - i;
    const r = lerp(lerp(a[i + 3], a[ii + 3], f), lerp(b[i + 3], b[ii + 3], f), v);
    return [lerp(a[1], b[1], v) + r * Math.sin(angle), y, lerp(a[2], b[2], v) + r * Math.cos(angle)];
  }

  function nose(x, y) {
    const wing = Math.abs(x - xN);
    const bridge = 0.0028 * bell(wing, 0, 0.0051) * bell(y, marks.nasalBone[1] - 0.007, 0.007);
    const tip = (roma ? 0.0077 : 0.0074) * bell(wing, 0, roma ? 0.0066 : 0.0075) * bell(y, yN - 0.0012, 0.0067);
    const ala = 0.0049 * bell(wing, 0.0058, 0.0030) * bell(y, yN - 0.0026, 0.0030);
    const column = 0.0055 * bell(wing, 0, 0.0023) * bell(y, yN - 0.0042, 0.0032);
    const groove = 0.0011 * bell(wing, 0.0021, 0.0011) * bell(y, yM + 0.0038, 0.0043);
    const fold = 0.0011 * bell(wing, 0, 0.008) * bell(y, yM - 0.0058, 0.0022);
    return bridge + tip + ala + column + groove - fold;
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

function iris(eye, r, roma) {
  const leather = material(0xffffff, 0.37, { vertexColors: true, side: T.DoubleSide });
  const disk = part(eye, eye.name.replace(' eye', '') + ' iris', geometry(37, 8), leather);
  const color = new T.Color();
  surface(disk, 37, 8, (u, v) => {
    const a = u * tau, s = (roma ? 0.50 : 0.48) * r * (1 - v);
    return [s * Math.cos(a), s * Math.sin(a), Math.sqrt(r * r - s * s) + 0.00008];
  }, (u, v, [x, y]) => {
    const ray = 0.5 + 0.25 * Math.sin(u * tau * 27 + v * 5) + 0.25 * Math.sin(u * tau * 41 - v * 4);
    const glint = (bell(x / r, -0.16, 0.085) * bell(y / r, 0.22, 0.09)) +
      0.42 * (bell(x / r, 0.12, 0.061) * bell(y / r, -0.20, 0.068));
    if (v > 0.56) color.setRGB(0.013, 0.007, 0.006);
    else color.setRGB(0.125 + 0.15 * ray, 0.057 + 0.080 * ray, 0.024 + 0.026 * ray)
      .multiplyScalar(0.33 + 0.67 * smoothstep(v, 0, 0.21));
    return color.lerp(new T.Color('#fff1da'), Math.min(0.91, glint)).toArray();
  });
}

function eyeParts(head, orbit, side, field, skin, roma) {
  const name = side === 1 ? 'Left' : 'Right';
  const [x, y, rim] = orbit.center;
  const h = Math.abs(orbit.superior[1] - orbit.inferior[1]);
  const r = clamp(h * 0.54, 0.01025, 0.01080);
  const open = r * 0.90;
  const z = rim - 0.0047;
  const globeDepth = 0.91;
  const lens = new T.Group();
  lens.name = name + ' eye';
  lens.position.set(x, y, z);
  lens.userData.dynamicPose = true;
  head.add(lens);
  lens.scale.z = globeDepth;
  const globe = part(lens, name + ' eye', new T.SphereGeometry(r, 22, 15), material('#f0e3cd', 0.53));
  iris(lens, r, roma);

  const shades = material(0xffffff, 0.62, { vertexColors: true, side: T.DoubleSide });
  const lining = material(roma ? '#3c231d' : '#634334', 0.74, { side: T.DoubleSide });
  const lashes = material(roma ? '#241613' : '#3f261d', 0.66, { side: T.DoubleSide });
  const lashSet = [];
  const lids = [-1, 1].map(direction => {
    const upper = direction === 1;
    const label = name + (upper ? ' upper' : ' lower');
    const shell = part(head, label + ' eyelid', geometry(23, 6), skin, 'orbit', true);
    const waterline = part(head, label + ' lash line', geometry(23, 2), lining, null, true);
    const streaks = part(head, label + ' lashes', geometry(3, 2 * (upper ? 6 : 4), (_, j) => j % 2 === 1), lashes, null, true);
    lashSet.push({ upper, shell, waterline, streaks });
    return shell;
  });

  const duct = part(head, name + ' tear duct', new T.SphereGeometry(0.0011, 10, 6), material(roma ? '#ac5d55' : '#ac6b59', .65));
  const ductX = x - side * open * 0.93;
  duct.position.set(ductX, y - 0.0007, z + 0.0044);
  duct.scale.set(1, .55, .62);

  const eyebrow = part(head, name + ' eyebrow', geometry(23, 5), shades, null, true);
  const browY = orbit.superior[1] + (roma ? 0.0041 : 0.0028);
  const faceZ = (sx, sy) => field.front(sx, sy) + field.nose(sx, sy);

  function edge(u, upper, blink) {
    const q = 2 * u - 1;
    const arch = Math.max(0, 1 - q ** 2) ** 0.72;
    const xx = q * open;
    const trend = side * q * (roma ? 0.0012 : 0.00055);
    const yy = trend + arch * lerp(upper ? r * 0.53 : -r * 0.38, -r * 0.115, blink);
    const spherical = z + globeDepth * Math.sqrt(Math.max(0, r * r - xx * xx - yy * yy));
    return [x + xx, y + yy, spherical + 0.00064];
  }

  const gaze = (cue, time) => {
    lens.rotation.y = (cue?.gazeX ?? (cue ? 0 : Math.sin(time * 0.67) * 0.27)) * 0.18;
    lens.rotation.x = -(cue?.gazeY ?? (cue ? 0 : Math.sin(time * 0.83) * 0.20)) * 0.16;
  };
  const rimContact = lashSet.map(({ upper }) => Array.from({ length: 23 }, (_, i) => {
    const u = i / 22, [xx, yy] = edge(u, upper, 0);
    const a = x + (xx - x) * 1.34;
    const b = yy + (upper ? 1 : -1) * (0.0020 + 0.0067 * Math.sin(Math.PI * u));
    const contact = faceZ(a, b);
    return [a, b, Number.isFinite(contact) ? contact - 0.00105 : z - 0.001];
  }));

  function pose(blink, cue, smile, focus) {
    for (const [strip, { upper, shell, waterline, streaks }] of lashSet.entries()) {
      const direction = upper ? 1 : -1;
      surface(shell, 23, 6, (u, v, i) => {
        const [xx, yy, zz] = edge(u, upper, blink);
        const [outerX, outerY, depth] = rimContact[strip][i];
        const ox = lerp(xx, outerX, v), oy = lerp(yy, outerY, v);
        const ball = z + globeDepth * Math.sqrt(Math.max(0, r ** 2 - (ox - x) ** 2 - (oy - y) ** 2)) + 0.00013;
        const flare = upper ? 0.00067 * Math.sin(v * Math.PI * 2.0) : 0.00021 * Math.sin(v * Math.PI);
        return [ox, oy, Math.max(lerp(zz, depth, v) + flare, lerp(ball, depth, smoothstep(v, 0.65, 1)))];
      }, (u, v) => {
        const tint = (1 - v) * (upper ? 0.24 : 0.18) * Math.sin(Math.PI * u);
        return [1 - 0.12 * tint, 1 - 0.38 * tint, 1 - 0.54 * tint];
      });
      surface(waterline, 23, 2, (u, v) => {
        const [xx, yy, zz] = edge(u, upper, blink);
        const strength = Math.sin(Math.PI * u) ** 0.48;
        return [xx, yy + direction * v * strength * (upper ? (roma ? 0.00094 : 0.00069) : (roma ? 0.00046 : 0.00037)),
          zz + 0.00021];
      });
      const count = upper ? 6 : 4;
      surface(streaks, 3, 2 * count, (u, _, i, j) => {
        const k = Math.floor(j / 2);
        const lift = (j % 2) * u;
        const where = 0.48 + 0.42 * k / (count - 1);
        const [xx, yy, zz] = edge(side > 0 ? where : 1 - where, upper, blink);
        const length = (roma ? (upper ? 0.0016 : .00065) : (upper ? .0009 : .00042)) * (0.65 + where * 0.40);
        return [xx + side * length * 0.49 * (j % 2) + (u - 0.5) * (j % 2 ? 0.00003 : 0.00020),
          yy + direction * length * (j % 2), zz + 0.00027 + 0.00037 * lift];
      });
    }
    surface(eyebrow, 23, 5, (u, v) => {
      const q = u * 2 - 1;
      const xx = x + side * q * r * 1.19;
      const up = (cue?.browLift ?? 0.45 * Math.max(smile, focus)) * 0.0023 +
        (cue?.surprise ?? 0) * 0.0017 + side * (cue?.asymmetry ?? 0) * 0.0013;
      const arc = roma ? 0.0031 * Math.sin(Math.PI * u ** 0.95)
        : 0.0023 * (u < 0.65 ? (u / 0.65) ** 0.68 : 1 - ((u - 0.65) / 0.35) ** 1.35);
      const width = (roma ? 0.0030 : 0.0045) * Math.sin(Math.PI * u) ** .23 * (1.50 - 0.97 * u);
      const yy = browY + arc + up - q * (0.0009 + 0.0014 * focus) + (v - .5) * width;
      return [xx, yy, faceZ(xx, yy) + 0.00092 + 0.00040 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u)];
    }, (u, v) => {
      const band = 0.7 + 0.3 * Math.sin(Math.PI * v) + 0.09 * Math.sin(147 * u + 2 * v);
      return [0.048 * band, 0.024 * band, 0.017 * band];
    });
  }

  return { pose, gaze, globe, lids, x, y, z, r, open };
}

function lips(head, field, marks) {
  const shell = material(0xffffff, 0.42, { vertexColors: true, side: T.DoubleSide });
  const sparse = { side: T.DoubleSide };
  const upper = part(head, 'Upper lip', geometry(27, 8), shell, 'lips', true);
  const lower = part(head, 'Lower lip', geometry(27, 8), shell, 'lips', true);
  const cavity = part(head, 'Mouth cavity', geometry(27, 2), material('#451d1a', 0.82, sparse), null, true);
  const teeth = part(head, 'Teeth', geometry(33, 4), material(0xffffff, 0.38, { ...sparse, vertexColors: true }), null, true);
  const smileColor = new T.Color('#b45345');
  const border = new T.Color('#923c31');
  const shade = new T.Color();
  const width = 0.0163;
  const { xM, yM } = field;

  function pose(smile, focus, cue) {
    const surprise = cue?.surprise ?? 0;
    const opened = T.MathUtils.clamp(cue?.mouthOpen ?? (0.66 * smile + 0.27 * surprise), 0, 1);
    function shape(u) {
      const q = 2 * u - 1, taper = Math.max(0, 1 - q ** 2) ** 0.69;
      const x = xM + q * width * (1 + 0.08 * smile - 0.10 * surprise);
      const y = yM + (0.0009 + smile * 0.0036) * q ** 2 - 0.0012 * focus +
        (cue?.asymmetry ?? 0) * 0.0015 * q;
      const aperture = (0.00020 + 0.0052 * opened) * taper;
      const front = field.front(x, y);
      const z = Math.max(Number.isFinite(front) ? front : 0.032, marks.upperIncisor[2] - 0.010 * q ** 2);
      return [x, y, z, taper, aperture, q];
    }
    const mouth = Array.from({ length: 27 }, (_, i) => shape(i / 26));
    for (const [mesh, direction] of [[upper, 1], [lower, -1]]) {
      surface(mesh, 27, 8, (u, v, i) => {
        const [x, y, z, taper, aperture, q] = mouth[i];
        const bow = direction === 1 ? (0.54 + 0.46 * bell(Math.abs(q), .25, .18)) : 1;
        const height = (direction === 1 ? 0.00325 : 0.00415) * taper * bow;
        const yy = y + direction * (aperture + height * v);
        const fitted = field.front(x, yy);
        const line = z + 0.00115 * taper;
        const borderZ = Number.isFinite(fitted) ? fitted + 0.00068 * taper : z;
        return [x, yy, lerp(line, borderZ, v) + 0.00270 * taper * Math.sin(Math.PI * v) - 0.0001 * q ** 8];
      }, (u, v) => shade.copy(smileColor).lerp(border,
        0.27 + 0.46 * (1 - v) ** 4 + 0.20 * Math.abs(u * 2 - 1)).toArray());
    }
    surface(cavity, 27, 2, (u, v, i) => {
      const [x, y, z, taper, aperture] = mouth[i];
      return [x, y + (v * 2 - 1) * (aperture + 0.00009), z + 0.00114 * taper];
    });
    teeth.visible = opened > 0.16;
    if (teeth.visible) surface(teeth, 33, 4, (u, v) => {
      const [x, y, z, taper, aperture] = shape(0.15 + 0.7 * u);
      const upper = v > .45;
      const beside = taper * (upper ? 0.0019 : 0.0013);
      const upperSet = Math.min(y + aperture - 0.00018, marks.upperIncisor[1] + 0.0042 + 0.0045 * smile);
      const lowerSet = Math.max(y - aperture + 0.00018, marks.incisor[1] - 0.0043 * opened);
      return [x, upper ? upperSet - (1 - v) * beside : lowerSet + v * beside,
        z + 0.00135 * taper + 0.00014];
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

function sculpt(head, field, marks, eyes, skin, roma) {
  const rowCount = 58, columns = 101;
  const map = [];
  const turn = u => {
    const q = 2 * u - 1;
    return Math.sign(q) * Math.PI * (0.38 * Math.abs(q) + 0.62 * Math.abs(q) ** 2.3);
  };
  const noseW = roma ? 0.0052 : 0.0058;
  const noseY = field.yN - 0.0043;
  const nostrils = [-1, 1].map(side => [field.xN + side * noseW, noseY + side * 0.0003, side]);
  const gap = (x, y, [cx, cy, side]) => {
    const dx = x - cx, dy = y - cy - side * 0.17 * dx;
    return (dx / 0.0021) ** 2 + (dy / 0.00114) ** 2;
  };
  for (let j = 0; j < rowCount; j++) {
    const y = lerp(field.y0, field.y1, j / (rowCount - 1));
    const row = [];
    for (let i = 0; i < columns; i++) {
      const a = turn(i / (columns - 1));
      const p = field.radial(y, a);
      if (Math.abs(a) < Math.PI / 2) {
        p[2] += field.nose(p[0], y);
        for (const [name, point] of [['nasion', marks.nasion], ['glabella', marks.glabella]]) {
          const weight = bell(p[0], point[0], 0.0050) * bell(y, point[1], name === 'nasion' ? 0.0039 : 0.0059);
          p[2] = lerp(p[2], Math.min(p[2], point[2] + 0.0037), weight * 0.75);
        }
        for (const eye of eyes) {
          const dx = (p[0] - eye.x) / (eye.open * 1.11), dy = (y - eye.y) / (eye.r * 0.72);
          const weight = 1 - smoothstep(dx * dx + dy * dy, 0.45, 1.36);
          p[2] = lerp(p[2], Math.min(p[2], eye.z + 0.0021), weight);
        }
        // A shallow anatomical break under the columella and alar wings.
        for (const hole of nostrils) p[2] -= 0.0034 * Math.exp(-0.88 * gap(p[0], y, hole));
      }
      row.push(p);
    }
    map.push(row);
  }
  const face = part(head, 'Face', geometry(columns, rowCount, (i, j) => {
    const a = map[j][i], b = map[j + 1][i + 1];
    if (Math.abs(i / (columns - 1) - 0.5) > 0.12) return false;
    return nostrils.some(hole => gap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, hole) < 1);
  }), skin);
  surface(face, columns, rowCount, (u, v, i, j) => map[j][i], (u, v, [x, y, z]) => {
    const cheekX = (Math.abs(marks.malar.L[0]) + Math.abs(marks.malar.R[0])) * .40;
    const cheek = bell(Math.abs(x - field.xM), cheekX, .0095) * bell(y, marks.malar.L[1] - .001, .0086)
      * smoothstep(z, .020, .043);
    const nose = bell(x, field.xN, .008) * bell(y, field.yN - .001, .0052);
    const warm = (roma ? .75 : .54) * cheek + .55 * nose;
    const philtrum = bell(x, field.xM, .0021) * bell(y, field.yM + .0042, .0035);
    return [1 + .027 * warm, 1 - .233 * warm - .035 * philtrum, 1 - .315 * warm - .04 * philtrum];
  });
  // Concave opaque interiors sit behind the actual openings, in the alar wall.
  const interior = material('#632e29', 0.86, { side: T.DoubleSide, vertexColors: true });
  nostrils.forEach(([x, y, side], i) => {
    const bore = part(head, (i ? 'Left' : 'Right') + ' nostril', geometry(23, 6), interior, 'nose');
    surface(bore, 23, 6, (u, v) => {
      const a = u * tau, r = 1 - v, dx = 0.00234 * r * Math.cos(a);
      const yy = y + 0.00127 * r * Math.sin(a) + side * 0.17 * dx;
      const xx = x + dx, wall = field.front(xx, yy) + field.nose(xx, yy);
      return [xx, yy, wall - 0.0015 - 0.0032 * v];
    }, (u, v) => [0.87 - .69 * v, .67 - .58 * v, .63 - .55 * v]);
  });
  return face;
}

function neckJoin(rig, parent, field, skin) {
  const origin = rig.anatomy.joints.head;
  const profile = rig.exterior.torso;
  const y0 = profile.at(-3)[0] - origin.y;
  const join = part(parent, 'Face to neck join', geometry(37, 10), skin, 'neck');
  surface(join, 37, 10, (u, v) => {
    const angle = (0.41 + u * 1.18) * Math.PI;
    const flap = Math.sin(Math.PI * u) ** 0.5;
    const y1 = -0.0008 + 0.017 * flap;
    const y = lerp(y0, y1, v);
    const [x, z, r] = sampleExterior(profile, Math.min(origin.y + y, profile.at(-1)[0]), angle);
    const [sx, , sz] = field.radial(y1, angle);
    const [dx, dz] = [Math.sin(angle), Math.cos(angle)];
    const skinR = r + (-0.0010 + 0.0019 * Math.sin(Math.PI * v)) * flap;
    const t = smoothstep(v, 0.25, 1);
    return [lerp(x - origin.x + dx * skinR, sx - dx * 0.00065, t), y,
      lerp(z - origin.z + dz * skinR, sz - dz * 0.00065, t)];
  }, () => [1, 1, 1]);
}

export function buildExplorerFace(rig, hero, tone, shell, marks, seatMouth) {
  const roma = hero === 'roma';
  const shade = new T.Color(tone);
  const field = sectionField(shell, marks, roma);
  const parent = new T.Group();
  parent.name = roma ? 'face and band' : 'sippy-head';
  rig.head.userData.faceShell = shell;
  rig.head.add(parent);
  const paint = facePaint(shade);
  const skin = material(shade, 0.59, { vertexColors: true, side: T.DoubleSide });
  const eyes = [-1, 1].map(side => eyeParts(parent, marks.orbit[side === 1 ? 'L' : 'R'], side, field, skin, roma));
  const head = sculpt(parent, field, marks, eyes, paint, roma);
  if (roma) neckJoin(rig, parent, field, skin);
  const mouth = seatMouth ? seatMouth(parent, field, marks.upperIncisor) : lips(parent, field, marks);
  for (const side of [-1, 1]) ear(parent, side, marks, skin, roma);

  let signature = '';
  function pose(f, lift = 0) {
    const { time, faceCue: cue, emote, state } = f;
    const phase = roma ? (time + .285) % 3.71 : (time + .13) % 4.2;
    const duration = roma ? .14 : .16;
    const blink = cue?.blink ?? (cue ? 0 : phase < duration ? Math.sin(Math.PI * phase / duration) : 0);
    const laugh = state === 'run' ? .68 + .13 * Math.sin(f.phase * 2) : 0;
    const smile = cue?.smile ?? Math.max(lift, laugh, .22 * Number(state === 'walk'));
    const focus = cue?.focus ?? bell(emote, .56, .10);
    const wink = cue?.wink ?? bell(emote, .86, .042);
    const close = Math.max(blink, focus * .32, cue?.squint ?? laugh * .17, state === 'roll' ? .35 : 0);
    // Fixed review poses need no animation allocation on successive frames.
    eyes.forEach(eye => eye.gaze(cue, time));
    const key = [close, smile, focus, wink, cue?.mouthOpen, cue?.browLift, cue?.surprise, cue?.asymmetry].join(',');
    if (key === signature) return;
    signature = key;
    eyes.forEach((eye, i) => eye.pose(Math.max(close, i === 0 ? wink : 0), cue, smile, focus));
    mouth(smile, focus, cue);
  }
  pose({ time: 0, faceCue: { smile: 0, blink: 0 }, emote: -1, state: 'idle' });
  return { parent, pose, head, eyes: eyes.map(eye => eye.globe), skin: [head, ...eyes.flatMap(eye => eye.lids)] };
}
