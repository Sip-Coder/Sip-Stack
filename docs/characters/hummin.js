// Hummin's enamel shells, bellows, display and leatherwork are built in rig-local
// units. The sole is .047 below its ankle and the helmet is .157 above its pivot.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;

export function buildHummin(rig) {
  const surface = (color, roughness, metalness = 0, extra = {}) =>
    new T.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
  const enamel = surface('#ece6d8', 0.29, 0.18, { clearcoat: 0.8, clearcoatRoughness: 0.19 });
  const porcelain = surface('#fff8e9', 0.24, 0.13, { clearcoat: 0.75 });
  const titanium = surface('#8c918a', 0.32, 0.78);
  const graphite = surface('#222c2e', 0.42, 0.42);
  const rubber = surface('#182021', 0.72);
  const agedBrass = surface('#ab8551', 0.35, 0.72);
  // Original hide grain. Fine pores modulate reflectance and grazing-light relief.
  const grainPixels = new Uint8Array(128 * 128 * 4);
  let seed = 3041;
  for (let i = 0; i < grainPixels.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 186 + (seed >>> 26) - ((seed & 31) === 0 ? 40 : 0);
    grainPixels[i] = grainPixels[i + 1] = grainPixels[i + 2] = value;
    grainPixels[i + 3] = 255;
  }
  const grain = new T.DataTexture(grainPixels, 128, 128);
  grain.wrapS = grain.wrapT = T.RepeatWrapping;
  grain.generateMipmaps = true;
  grain.minFilter = T.LinearMipmapLinearFilter;
  grain.magFilter = T.LinearFilter;
  grain.needsUpdate = true;
  const leather = surface('#69503c', 0.69, 0.02, {
    map: grain,
    bumpMap: grain,
    bumpScale: 0.00014,
    sheen: 0.2,
    sheenColor: new T.Color('#946d4b'),
  });
  const leatherEdge = surface('#967555', 0.7);
  const darkLeather = surface('#423329', 0.58);
  const cyan = surface('#78eaff', 0.26, 0.21, { emissive: '#39c9ff', emissiveIntensity: 1.45 });

  // The slim horizontal skirt follows both the resting curve of the shell
  // and the line of a swinging thigh. Flexible leather is isolated from metal.
  const staticGroups = new Map();
  function part(parent, geometry, material, x = 0, y = 0, z = 0) {
    const piece = new T.Mesh(geometry, material);
    piece.position.set(x, y, z);
    parent.add(piece);
    if (!staticGroups.has(parent)) staticGroups.set(parent, []);
    staticGroups.get(parent).push(piece);
    return piece;
  }
  const group = (parent, x, y, z) => {
    const node = new T.Group();
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  };
  function oval(parent, mat, x, y, z, rx, ry, rz) {
    const mesh = part(parent, new T.SphereGeometry(1, 24, 16), mat, x, y, z);
    mesh.scale.set(rx, ry, rz);
    return mesh;
  }
  function rod(parent, mat, start, end, radius, capRadius = radius) {
    const a = new T.Vector3(...start),
      b = new T.Vector3(...end);
    const axis = b.clone().sub(a);
    const mesh = part(parent, new T.CylinderGeometry(capRadius, radius, axis.length(), 12), mat);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis.normalize());
  }
  function line(parent, mat, points, radius, smooth = true) {
    const path = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      false,
      'centripetal',
    );
    return part(
      parent,
      new T.TubeGeometry(path, smooth ? Math.max(10, points.length * 4) : points.length, radius, 6, false),
      mat,
    );
  }
  function shell(parent, mat, profile, depth = 1, x = 0, y = 0, z = 0) {
    const g = new T.LatheGeometry(
      profile.map(([h, r]) => new T.Vector2(r, h)),
      32,
    );
    const mesh = part(parent, g, mat, x, y, z);
    mesh.scale.z = depth;
    return mesh;
  }
  function plate(parent, mat, rows, dome = 0.008) {
    const pos = [],
      uv = [],
      ids = [];
    for (const [y, left, right, z] of rows) {
      for (let j = 0; j <= 10; j++) {
        const u = j / 10;
        pos.push(T.MathUtils.lerp(left, right, u), y, z + dome * (1 - (2 * u - 1) ** 2));
        uv.push(u * (right - left) * 18, y * 18);
      }
    }
    for (let i = 1; i < rows.length; i++)
      for (let j = 0; j < 10; j++) {
        const b = i * 11 + j;
        ids.push(b - 11, b, b - 10, b - 10, b, b + 1);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ids);
    g.computeVertexNormals();
    return part(parent, g, mat);
  }
  function pivot(parent, x, y, z, radius, thickness) {
    function disc(mat, r, length, offset) {
      const disk = part(parent, new T.CylinderGeometry(r, r, length, 28), mat, x + offset, y, z);
      disk.rotation.z = PI / 2;
    }
    disc(graphite, radius, thickness, 0);
    for (const side of [-1, 1]) {
      const outer = side * thickness * 0.5;
      disc(titanium, radius * 0.79, 0.0018, outer);
      disc(rubber, radius * 0.61, 0.002, outer + side * 0.0011);
      disc(agedBrass, radius * 0.26, 0.002, outer + side * 0.00175);
    }
  }
  function buckle(parent, x, y, z, w, h) {
    line(
      parent,
      agedBrass,
      [
        [x - w, y + h, z],
        [x + w, y + h, z],
        [x + w, y - h, z],
        [x - w, y - h, z],
        [x - w, y + h, z],
      ],
      0.00185,
      false,
    );
    rod(parent, agedBrass, [x, y - 0.003, z + 0.001], [x, y + h + 0.002, z + 0.001], 0.0012);
  }

  // Rounded visor plates follow the same curved helmet rather than sitting
  // on a flat billboard. UVs carry the coordinate system of the OLED glass.
  const head = rig.head;
  const rx = 0.091,
    ry = 0.086,
    rz = 0.08,
    cy = 0.071;
  oval(head, enamel, 0, cy, -0.001, rx, ry, rz);
  function visor(material, width, height, lift) {
    const p = [],
      uv = [],
      idx = [];
    const steps = 88,
      rings = 12;
    for (let row = 0; row <= rings; row++) {
      const radius = row / rings;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * PI * 2;
        const sx = radius * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.53;
        const sy = radius * Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.63;
        const lon = width * sx,
          lat = height * sy + 0.005;
        p.push(
          (rx + lift) * Math.sin(lon) * Math.cos(lat),
          cy + (ry + lift) * Math.sin(lat),
          (rz + lift) * Math.cos(lon) * Math.cos(lat) - 0.001,
        );
        uv.push(0.5 + 0.5 * sx, 0.5 + 0.5 * sy);
        if (row && i) {
          const b = row * (steps + 1) + i;
          idx.push(b - steps - 2, b - 1, b, b - steps - 2, b, b - steps - 1);
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    part(head, g, material);
  }
  visor(titanium, 1.09, 0.692, 0.00105);
  visor(rubber, 1.074, 0.669, 0.00145);
  const screen = surface('#0c1821', 0.19, 0.35, {
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: '#020710',
  });
  const expression = { value: new T.Vector4(1, 0, 0, 0) };
  screen.onBeforeCompile = (shader) => {
    shader.uniforms.expression = expression;
    shader.vertexShader =
      'varying vec2 screenUV;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nscreenUV = uv;');
    shader.fragmentShader =
      'varying vec2 screenUV; uniform vec4 expression;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      vec2 p=screenUV*2.-1.;
      float side=sign(p.x);
      vec2 e=vec2(abs(p.x)-.436, (p.y-.135)/max(expression.x,.048));
      vec2 shape=e/vec2(.17,.295);
      float d=length(shape)-1.;
      float aa=max(.022, fwidth(d));
      float eye=1.-smoothstep(-aa,aa,d);
      // Lift the lower lid into a friendly arc at rest; narrow it on the run.
      eye*=1.-smoothstep(.52,.81,expression.w)*smoothstep(-.07,.055,-shape.y-.06+.56*shape.x*shape.x);
      eye*=1.-expression.y*smoothstep(.012,.080,e.y-.075-e.x*.50);
      float spiralD=abs(sin(atan(shape.y,shape.x)-length(shape)*7.1));
      float spiral=(1.-smoothstep(.18,.44,spiralD))*(1.-smoothstep(.82,1.03,length(shape)));
      eye=mix(eye,spiral,expression.z);
      float smileCurve=-.46+.16*pow(min(1.,abs(p.x)/.255),2.);
      float lip=(1.-smoothstep(.035,.068,abs(p.y-smileCurve)))*(1.-smoothstep(.225,.26,abs(p.x)));
      float halo=.17*exp(-3.8*max(d,0.))+.08*exp(-13.*abs(p.y-smileCurve)-8.*abs(p.x));
      totalEmissiveRadiance += vec3(.08,1.03,1.65)*(1.45*max(eye,lip)+halo);
      totalEmissiveRadiance += vec3(.004,.009,.011)*(1.+sin(screenUV.y*46.));`,
      );
  };
  visor(screen, 1.043, 0.63, 0.00185);
  for (const s of [-1, 1]) {
    const ear = group(head, s * 0.082, 0.071, -0.001);
    ear.rotation.z = (-s * PI) / 2;
    shell(
      ear,
      graphite,
      [
        [-0.009, 0.029],
        [-0.004, 0.033],
        [0.009, 0.032],
        [0.013, 0.028],
      ],
      1,
    );
    shell(
      ear,
      titanium,
      [
        [0.008, 0.032],
        [0.012, 0.032],
        [0.014, 0.027],
      ],
      1,
    );
    shell(
      ear,
      cyan,
      [
        [0.013, 0.027],
        [0.015, 0.026],
        [0.0155, 0.0225],
      ],
      1,
    );
    shell(
      ear,
      graphite,
      [
        [0.014, 0.0225],
        [0.016, 0.022],
        [0.017, 0.002],
        [0.017, 0],
      ],
      1,
    );
    oval(ear, titanium, 0, 0.016, 0, 0.013, 0.002, 0.013);
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * PI) / 3 + 0.5;
      oval(ear, graphite, Math.sin(a) * 0.029, 0.013, Math.cos(a) * 0.029, 0.002, 0.0015, 0.002);
    }
  }
  // Narrow vents, countersunk screws and a brass service mark read from the
  // trailing camera. Each vent follows the curvature of the rear enclosure.
  for (let i = 0; i < 3; i++) {
    const lat = -0.26 - i * 0.11;
    const points = [];
    for (let j = -4; j <= 4; j++) {
      const lon = j * (0.115 - i * 0.012);
      points.push([
        rx * Math.sin(lon) * Math.cos(lat),
        cy + ry * Math.sin(lat),
        -0.001 - rz * Math.cos(lon) * Math.cos(lat),
      ]);
    }
    line(head, graphite, points, 0.0013);
  }
  for (const s of [-1, 1]) oval(head, titanium, s * 0.056, 0.079, -0.065, 0.0032, 0.0032, 0.002);
  oval(head, agedBrass, 0, 0.101, -0.0765, 0.0057, 0.0057, 0.0025);
  // Short, alternating ribs allow the head and waist to rotate independently.
  for (let i = 0; i < 5; i++) {
    shell(
      rig.chest,
      i % 2 ? titanium : rubber,
      [
        [0.155 + i * 0.008, 0.032],
        [0.162 + i * 0.008, 0.032],
      ],
      0.85,
    );
  }
  shell(
    rig.chest,
    enamel,
    [
      [-0.071, 0.06],
      [-0.061, 0.077],
      [0.016, 0.086],
      [0.074, 0.11],
      [0.122, 0.106],
      [0.143, 0.079],
      [0.153, 0.043],
      [0.151, 0],
    ],
    0.64,
  );
  shell(
    rig.hips,
    graphite,
    [
      [-0.034, 0.048],
      [-0.019, 0.081],
      [0.015, 0.084],
      [0.045, 0.072],
      [0.061, 0.063],
    ],
    0.68,
  );
  for (let i = 0; i < 3; i++)
    shell(
      rig.hips,
      rubber,
      [
        [0.047 + i * 0.01, 0.068],
        [0.053 + i * 0.01, 0.068],
      ],
      0.76,
    );

  // Tailored collar, bow, bib, adjustable leather shoulder straps and brass hardware.
  for (const s of [-1, 1]) {
    const collar = oval(rig.chest, porcelain, s * 0.022, 0.132, 0.038, 0.023, 0.027, 0.01);
    collar.rotation.z = -s * 0.62;
    const bow = oval(rig.chest, graphite, s * 0.015, 0.114, 0.064, 0.018, 0.012, 0.009);
    bow.rotation.z = s * 0.22;
    line(
      rig.chest,
      darkLeather,
      [
        [s * 0.064, 0.066, 0.055],
        [s * 0.074, 0.117, 0.048],
        [s * 0.07, 0.143, 0.004],
        [s * 0.077, 0.116, -0.048],
        [s * 0.064, 0.046, -0.058],
      ],
      0.0085,
    );
    line(
      rig.chest,
      leatherEdge,
      [
        [s * 0.07, 0.069, 0.059],
        [s * 0.081, 0.118, 0.049],
        [s * 0.077, 0.147, 0.005],
        [s * 0.082, 0.114, -0.047],
      ],
      0.00105,
    );
    buckle(rig.chest, s * 0.069, 0.096, 0.057, 0.009, 0.008);
    oval(rig.chest, agedBrass, s * 0.064, 0.068, 0.062, 0.0035, 0.0035, 0.002);
  }
  oval(rig.chest, rubber, 0, 0.113, 0.066, 0.0065, 0.011, 0.01);
  plate(
    rig.chest,
    leather,
    [
      [0.076, -0.068, 0.068, 0.049],
      [0.061, -0.071, 0.071, 0.053],
      [0.014, -0.067, 0.067, 0.052],
      [-0.04, -0.072, 0.072, 0.048],
      [-0.087, -0.075, 0.075, 0.044],
    ],
    0.016,
  );
  line(
    rig.chest,
    leatherEdge,
    [
      [-0.064, 0.072, 0.053],
      [0, 0.069, 0.067],
      [0.064, 0.072, 0.053],
    ],
    0.00145,
  );
  plate(
    rig.chest,
    darkLeather,
    [
      [0.002, -0.053, 0.032, 0.063],
      [-0.006, -0.053, 0.035, 0.064],
      [-0.042, -0.046, 0.031, 0.059],
      [-0.051, -0.032, 0.017, 0.061],
    ],
    0.005,
  );
  line(
    rig.chest,
    leatherEdge,
    [
      [-0.05, -0.004, 0.066],
      [-0.043, -0.04, 0.063],
      [-0.023, -0.046, 0.065],
      [0.019, -0.047, 0.062],
      [0.031, -0.04, 0.062],
    ],
    0.001,
  );
  // Corkscrew and tasting pencil tucked inside the breast pocket.
  rod(rig.chest, agedBrass, [-0.035, -0.004, 0.07], [-0.037, 0.021, 0.067], 0.002);
  rod(rig.chest, darkLeather, [-0.049, 0.02, 0.068], [-0.027, 0.023, 0.067], 0.0032);
  rod(rig.chest, titanium, [-0.013, -0.003, 0.07], [-0.008, 0.024, 0.068], 0.002);
  oval(rig.chest, agedBrass, -0.008, 0.024, 0.068, 0.0034, 0.0034, 0.0028);
  // Two rows of waxed saddle stitching follow the upper bib and pocket.
  for (let i = -9; i <= 9; i++) {
    const x = i * 0.0064,
      z = 0.053 + 0.014 * (1 - (x / 0.065) ** 2);
    rod(rig.chest, leatherEdge, [x - 0.0019, 0.064, z + 0.001], [x + 0.0019, 0.064, z + 0.001], 0.00058);
  }
  for (let i = 0; i < 8; i++) {
    const y = -0.006 - i * 0.0045;
    rod(rig.chest, leatherEdge, [-0.047, y, 0.066], [-0.047, y - 0.002, 0.066], 0.00056);
  }
  shell(
    rig.hips,
    darkLeather,
    [
      [0.011, 0.087],
      [0.029, 0.087],
    ],
    0.76,
  );
  buckle(rig.hips, 0, 0.021, 0.068, 0.014, 0.007);
  line(
    rig.chest,
    darkLeather,
    [
      [-0.065, 0.058, -0.055],
      [0, 0.01, -0.066],
      [0.062, -0.041, -0.051],
    ],
    0.0055,
  );
  line(
    rig.chest,
    darkLeather,
    [
      [0.065, 0.058, -0.055],
      [0, 0.01, -0.067],
      [-0.062, -0.041, -0.051],
    ],
    0.0055,
  );

  const flaps = [];
  for (const [suffix, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const upper = rig['upperArm' + suffix],
      fore = rig['forearm' + suffix],
      hand = rig['hand' + suffix];
    const thigh = rig['thigh' + suffix],
      shin = rig['shin' + suffix],
      foot = rig['foot' + suffix];
    const flap = group(rig.hips, s * 0.039, 0.012, 0.026);
    const skew = s * 0.004;
    plate(
      flap,
      leather,
      [
        [0.002, -0.04, 0.04, 0.023],
        [-0.05, -0.042, 0.042, 0.03],
        [-0.115, -0.037 + skew, 0.037 + skew, 0.038],
        [-0.122, -0.03 + skew, 0.031 + skew, 0.038],
      ],
      0.013,
    );
    line(
      flap,
      leatherEdge,
      [
        [-0.032 + skew, -0.111, 0.042],
        [-0.022 + skew, -0.117, 0.049],
        [0.02 + skew, -0.117, 0.046],
        [0.031 + skew, -0.111, 0.041],
      ],
      0.001,
    );
    flaps.push(flap);
    oval(upper, rubber, 0, 0, 0, 0.032, 0.031, 0.035);
    oval(upper, enamel, s * 0.008, -0.011, -0.001, 0.039, 0.035, 0.042);
    shell(
      upper,
      enamel,
      [
        [-0.142, 0.019],
        [-0.139, 0.024],
        [-0.11, 0.028],
        [-0.065, 0.032],
        [-0.042, 0.032],
        [-0.031, 0.024],
      ],
      0.95,
    );
    rod(upper, graphite, [0, -0.175, 0], [0, -0.029, 0], 0.016, 0.019);
    shell(
      upper,
      titanium,
      [
        [-0.146, 0.019],
        [-0.139, 0.024],
      ],
      0.95,
    );
    pivot(fore, 0, 0, 0, 0.02, 0.041);
    rod(fore, graphite, [0, -0.136, -0.003], [0, 0.002, -0.003], 0.014, 0.017);
    shell(
      fore,
      porcelain,
      [
        [-0.123, 0.016],
        [-0.118, 0.021],
        [-0.075, 0.024],
        [-0.049, 0.029],
        [-0.032, 0.028],
        [-0.026, 0.021],
      ],
      0.91,
    );
    shell(
      fore,
      titanium,
      [
        [-0.122, 0.018],
        [-0.118, 0.021],
      ],
      0.91,
    );
    line(
      fore,
      graphite,
      [
        [s * 0.02, -0.107, 0],
        [s * 0.024, -0.077, 0],
        [s * 0.028, -0.045, 0],
      ],
      0.00095,
    );
    oval(hand, graphite, 0, -0.004, 0, 0.015, 0.017, 0.017);
    oval(hand, enamel, s * 0.002, -0.023, 0.002, 0.02, 0.023, 0.016);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * 0.0082,
        long = 0.013 * (1 - 0.12 * Math.abs(k - 1.3)),
        y = -0.04;
      oval(hand, rubber, x, y, 0.001, 0.0038, 0.0046, 0.0043);
      const middle = [x, y - long, 0.0038];
      rod(hand, porcelain, [x, y - 0.001, 0.001], middle, 0.0047, 0.0044);
      oval(hand, graphite, ...middle, 0.0041, 0.0041, 0.0043);
      rod(hand, enamel, [x, middle[1] - 0.001, 0.0042], [x, middle[1] - 0.009, 0.009], 0.0043, 0.0035);
      oval(hand, porcelain, x, middle[1] - 0.009, 0.009, 0.0034, 0.0038, 0.0037);
    }
    rod(hand, graphite, [-s * 0.014, -0.018, 0.006], [-s * 0.024, -0.034, 0.011], 0.0056);
    oval(hand, enamel, -s * 0.021, -0.027, 0.009, 0.007, 0.01, 0.0065);
    oval(hand, porcelain, -s * 0.025, -0.038, 0.013, 0.005, 0.008, 0.005);
    oval(thigh, graphite, 0, 0, 0, 0.041, 0.04, 0.04);
    rod(thigh, graphite, [0, -0.229, 0], [0, -0.017, 0], 0.023, 0.027);
    shell(
      thigh,
      enamel,
      [
        [-0.21, 0.025],
        [-0.204, 0.031],
        [-0.137, 0.038],
        [-0.082, 0.043],
        [-0.047, 0.041],
        [-0.033, 0.033],
      ],
      1.03,
    );
    shell(
      thigh,
      titanium,
      [
        [-0.215, 0.026],
        [-0.207, 0.031],
      ],
      1.04,
    );
    line(
      thigh,
      graphite,
      [
        [s * 0.032, -0.194, 0.006],
        [s * 0.04, -0.122, 0.007],
        [s * 0.041, -0.081, 0.012],
      ],
      0.0013,
    );
    pivot(shin, 0, 0, 0, 0.032, 0.065);
    oval(shin, porcelain, 0, -0.002, 0.02, 0.028, 0.026, 0.018);
    rod(shin, graphite, [0, -0.225, 0], [0, -0.011, 0], 0.02, 0.025);
    shell(
      shin,
      porcelain,
      [
        [-0.2, 0.021],
        [-0.192, 0.026],
        [-0.125, 0.03],
        [-0.071, 0.037],
        [-0.046, 0.036],
        [-0.034, 0.029],
      ],
      1.02,
    );
    shell(
      shin,
      graphite,
      [
        [-0.203, 0.02],
        [-0.196, 0.025],
      ],
      0.99,
    );
    rod(shin, titanium, [s * 0.015, -0.19, -0.017], [s * 0.021, -0.035, -0.022], 0.0035);
    oval(foot, graphite, 0, 0.001, 0, 0.022, 0.026, 0.021);
    // Radial sections keep the outsole flat, with a small rocker under the toe.
    shell(
      foot,
      rubber,
      [
        [-0.047, 0],
        [-0.047, 0.027],
        [-0.045, 0.03],
        [-0.037, 0.032],
        [-0.03, 0.03],
      ],
      1.78,
      0,
      0,
      0.018,
    );
    shell(
      foot,
      enamel,
      [
        [-0.037, 0.03],
        [-0.034, 0.032],
        [-0.023, 0.032],
        [-0.014, 0.029],
        [0.002, 0.021],
        [0.008, 0.015],
        [0.008, 0],
      ],
      1.76,
      0,
      0,
      0.018,
    );
    line(
      foot,
      titanium,
      [
        [s * 0.03, -0.031, 0.018],
        [s * 0.022, -0.032, 0.055],
        [0, -0.032, 0.071],
      ],
      0.0015,
    );
  }

  // Pack rigid details by joint and finish. A knuckle, seam or rivet adds
  // geometry, but it does not require its own draw call.
  for (const [parent, pieces] of staticGroups) {
    const buckets = new Map();
    for (const mesh of pieces) {
      mesh.updateMatrix();
      const g = mesh.geometry;
      if (!g.attributes.uv)
        g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const baked = g.index ? g.toNonIndexed() : g.clone();
      baked.applyMatrix4(mesh.matrix);
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(baked);
      parent.remove(mesh);
      g.dispose();
    }
    for (const [material, geometries] of buckets) {
      const mesh = new T.Mesh(mergeGeometries(geometries), material);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      for (const g of geometries) g.dispose();
    }
  }

  let springL = 0,
    velocityL = 0,
    springR = 0,
    velocityR = 0,
    servo = 0,
    servoVelocity = 0;
  return function animate(frame) {
    const { dt, time, speed, state, emote } = frame;
    const beat = emote >= 0 ? Math.sin(PI * emote) ** 2 : 0;
    const bow = emote >= 0 ? Math.sin(PI * T.MathUtils.clamp((emote - 0.18) / 0.76, 0, 1)) ** 2 : 0;
    // Acceleration-limited servo tracking allows a small settling overshoot.
    const targetYaw =
      T.MathUtils.clamp(frame.turn, -1.5, 1.5) * 0.06 + (Math.sin(time * 0.73) * 0.035) / (1 + speed);
    servoVelocity += ((targetYaw - servo) * 180 - servoVelocity * 18) * dt;
    servo += servoVelocity * dt;
    head.rotation.y += servo;
    head.rotation.z += beat * 0.24;
    head.rotation.x += bow * 0.12;
    rig.chest.rotation.x += bow * 0.38;
    rig.forearmR.rotation.x -= bow * 0.58;
    rig.upperArmR.rotation.z += bow * 0.1;
    const run = state === 'run' ? 1 : 0;
    const turnIn = 1 - Math.exp(-dt * 17);
    expression.value.y += (run - expression.value.y) * turnIn;
    expression.value.z += ((state === 'roll' ? 1 : 0) - expression.value.z) * turnIn;
    const blink = Math.min(1, Math.abs(((time + 1.3) % 4.6) - 2.3) / 0.1);
    const emoteBlink = emote >= 0 ? Math.min(1, Math.abs(emote - 0.24) / 0.065) : 1;
    expression.value.x = Math.max(0.05, Math.min(blink, emoteBlink) * (1 - 0.12 * expression.value.y));
    expression.value.w = state === 'idle' ? 0.45 + 0.33 * Math.sin(time * 0.85) + beat * 0.44 : 0;
    const tug = Math.min(0.26, Math.abs(frame.vy) * 0.045) + speed * 0.02;
    const aimL = Math.min(0, rig.thighL.rotation.x) * 0.84 - 0.09 - tug;
    const aimR = Math.min(0, rig.thighR.rotation.x) * 0.84 - 0.09 - tug;
    velocityL += ((aimL - springL) * 160 - velocityL * 20) * dt;
    velocityR += ((aimR - springR) * 160 - velocityR * 20) * dt;
    springL += velocityL * dt;
    springR += velocityR * dt;
    flaps[0].rotation.x = Math.min(springL, aimL + 0.065);
    flaps[1].rotation.x = Math.min(springR, aimR + 0.065);
  };
}
