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
  const grainPixels = new Uint8Array(256 * 256 * 4);
  let seed = 3041;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  // Fine pores over mottled dye. A few short abraded fibres show the lighter
  // grain where tools and buckles have rubbed through the finish.
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const dye = 10 * Math.sin(x * 0.11 + 2.4 * Math.sin(y * 0.08)) + 7 * Math.cos(y * 0.14 + x * 0.092);
      const val = 176 + dye + 48 * random() - (random() < 0.06 ? 31 : 0);
      grainPixels[i] = val + 11;
      grainPixels[i + 1] = val;
      grainPixels[i + 2] = val - 8;
      grainPixels[i + 3] = 255;
    }
  for (let n = 0; n < 125; n++) {
    const x = random() * 256,
      y = random() * 256,
      l = 2 + random() * 15,
      a = random() * Math.PI;
    for (let j = 0; j < l; j++) {
      const i = 4 * (256 * (Math.floor(y + j * Math.sin(a)) & 255) + (Math.floor(x + j * Math.cos(a)) & 255));
      grainPixels[i] = 239;
      grainPixels[i + 1] = 217;
      grainPixels[i + 2] = 190;
    }
  }
  const grain = new T.DataTexture(grainPixels, 256, 256);
  grain.wrapS = grain.wrapT = T.RepeatWrapping;
  grain.generateMipmaps = true;
  grain.minFilter = T.LinearMipmapLinearFilter;
  grain.magFilter = T.LinearFilter;
  grain.needsUpdate = true;
  const leather = surface('#513b2d', 0.72, 0.015, {
    map: grain,
    bumpMap: grain,
    bumpScale: 0.00016,
    sheen: 0.24,
    sheenColor: new T.Color('#8d6850'),
  });
  const leatherEdge = surface('#b18e65', 0.74);
  const darkLeather = surface('#382b24', 0.6, 0.02, { map: grain, bumpMap: grain, bumpScale: 0.00014 });
  const thread = surface('#c5a680', 0.91);
  const linen = surface('#dcd5bd', 0.92, 0, { sheen: 0.38 });
  const wovenStripe = surface('#753b38', 0.84);
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
  function plate(parent, mat, rows, dome = 0.008, roundedHem = 0) {
    const pos = [],
      uv = [],
      ids = [];
    for (const [y, left, right, z] of rows) {
      for (let j = 0; j <= 10; j++) {
        const u = j / 10;
        const curve = 1 - (2 * u - 1) ** 2;
        const skirt = T.MathUtils.smoothstep(rows[0][0] - y, 0, rows[0][0] - rows.at(-1)[0]);
        pos.push(T.MathUtils.lerp(left, right, u), y - roundedHem * curve * skirt, z + dome * curve);
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
  // A closed leather band can pass over a shoulder crest and continue down
  // the back. Its edge and outer face catch the light separately.
  function strap(parent, knots, width) {
    const path = new T.CatmullRomCurve3(knots.map((p) => new T.Vector3(...p)));
    const verts = [],
      uv = [],
      index = [],
      tangent = new T.Vector3(),
      widthAxis = new T.Vector3(),
      normal = new T.Vector3();
    const axis = new T.Vector3(1, 0, 0),
      p = new T.Vector3();
    const steps = 24;
    for (let j = 0; j <= steps; j++) {
      path.getPointAt(j / steps, p);
      path.getTangentAt(j / steps, tangent);
      normal.crossVectors(axis, tangent).normalize();
      widthAxis.crossVectors(tangent, normal).normalize();
      for (const [u, h] of [
        [-0.5, -0.0014],
        [0.5, -0.0014],
        [0.5, 0.0014],
        [-0.5, 0.0014],
      ]) {
        verts.push(
          p.x + widthAxis.x * u * width + normal.x * h,
          p.y + widthAxis.y * u * width + normal.y * h,
          p.z + widthAxis.z * u * width + normal.z * h,
        );
        uv.push(u + 0.5, j / steps);
      }
      if (j)
        for (let k = 0; k < 4; k++) {
          const a = (j - 1) * 4 + k,
            b = (j - 1) * 4 + ((k + 1) % 4);
          index.push(a, a + 4, b, b, a + 4, b + 4);
        }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    part(parent, g, darkLeather);
    for (const sign of [-1, 1])
      for (let i = 0; i < 17; i++) {
        const ends = [];
        for (const t of [i / 17 + 0.009, i / 17 + 0.038]) {
          path.getPointAt(t, p);
          path.getTangentAt(t, tangent);
          normal.crossVectors(axis, tangent).normalize();
          widthAxis.crossVectors(tangent, normal).normalize();
          ends.push(
            p
              .clone()
              .addScaledVector(widthAxis, sign * width * 0.36)
              .addScaledVector(normal, 0.0018)
              .toArray(),
          );
        }
        rod(parent, thread, ends[0], ends[1], 0.00058);
      }
  }
  function flatTool(parent, material, outline, depth) {
    const shape = new T.Shape();
    for (const [i, [x, y]] of outline.entries()) i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    shape.closePath();
    return part(
      parent,
      new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelThickness: 0.0007,
        bevelSize: 0.00065,
      }),
      material,
    );
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
  // The face sits inside a broad cast dome; the outer service pods account
  // for the rest of the width between the two shoulder caps.
  const rx = 0.127,
    ry = 0.0905,
    rz = 0.107,
    cy = 0.0665;
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
      float lift=.055*expression.w*(p.x>0.?1.:-.45);
      vec2 e=vec2(abs(p.x)-.438, (p.y-.080-lift)/max(expression.x,.048));
      vec2 shape=e/vec2(.205,.36);
      float d=length(shape)-1.;
      float aa=max(.022, fwidth(d));
      float eye=1.-smoothstep(-aa,aa,d);
      // Lift the lower lid into a friendly arc at rest; narrow it on the run.
      eye*=1.-.93*smoothstep(.68,.94,expression.w)*smoothstep(-.07,.055,-shape.y-.02+.70*shape.x*shape.x);
      eye*=1.-expression.y*smoothstep(.012,.080,e.y-.075-e.x*.50);
      float spiralD=abs(sin(atan(shape.y,shape.x)-length(shape)*7.1));
      float spiral=(1.-smoothstep(.18,.44,spiralD))*(1.-smoothstep(.82,1.03,length(shape)));
      eye=mix(eye,spiral,expression.z);
      float browY=.60+lift+.09*(1.-pow(min(1.,abs(e.x)/.21),2.))+.18*expression.y*e.x;
      float brow=(1.-smoothstep(.021,.048,abs(p.y-browY)))*(1.-smoothstep(.162,.215,abs(e.x)));
      float smileCurve=-.49+.16*pow(min(1.,abs(p.x)/.255),2.);
      float lip=(1.-smoothstep(.035,.068,abs(p.y-smileCurve)))*(1.-smoothstep(.225,.26,abs(p.x)));
      float halo=.17*exp(-3.8*max(d,0.))+.08*exp(-13.*abs(p.y-smileCurve)-8.*abs(p.x));
      totalEmissiveRadiance += vec3(.08,1.03,1.65)*(1.32*max(eye,lip)+.83*brow+halo);
      totalEmissiveRadiance += vec3(.001,.003,.004)*(1.+sin(screenUV.y*140.));`,
      );
  };
  visor(screen, 1.043, 0.63, 0.00185);
  for (const s of [-1, 1]) {
    const ear = group(head, s * 0.114, 0.066, -0.004);
    ear.rotation.z = (-s * PI) / 2;
    ear.scale.setScalar(1.21);
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
  // The short receiver whisker is mounted on the port service pod. Its
  // hinge sits below the crown even when the spring points straight up.
  const antenna = group(head, -0.128, 0.063, -0.017);
  rod(antenna, titanium, [0, 0, 0], [-0.004, 0.022, -0.013], 0.0039, 0.0025);
  rod(antenna, graphite, [-0.004, 0.019, -0.011], [-0.016, 0.053, -0.037], 0.0025, 0.0019);
  oval(antenna, agedBrass, -0.016, 0.053, -0.037, 0.0048, 0.0051, 0.0048);
  oval(antenna, cyan, -0.016, 0.055, -0.037, 0.0035, 0.0033, 0.0035);
  for (const s of [-1, 1]) {
    // Service seam curves over the back of the helmet, terminating at the ear bearing.
    const seam = [];
    for (let j = 0; j <= 20; j++) {
      const a = (j / 20) * 1.55,
        lon = s * (1.65 + 0.66 * Math.sin(a)),
        lat = 0.041 + (1.26 * a) / 1.55;
      seam.push([
        (rx + 0.0007) * Math.sin(lon) * Math.cos(lat),
        cy + (ry + 0.0007) * Math.sin(lat),
        -0.001 + (rz + 0.0007) * Math.cos(lon) * Math.cos(lat),
      ]);
    }
    line(head, titanium, seam, 0.00082);
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
  for (const s of [-1, 1]) oval(head, titanium, s * 0.077, 0.08, -0.087, 0.0035, 0.0035, 0.0025);
  oval(head, agedBrass, 0, 0.098, -0.101, 0.006, 0.006, 0.0028);
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
      [0.016, 0.093],
      [0.074, 0.11],
      [0.115, 0.109],
      [0.143, 0.079],
      [0.153, 0.043],
      [0.151, 0],
    ],
    0.69,
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
    const side = (left, right) => (s > 0 ? [left, right] : [-right, -left]);
    plate(
      rig.chest,
      porcelain,
      [
        [0.15, ...side(0.009, 0.034), 0.042],
        [0.14, ...side(0.009, 0.045), 0.055],
        [0.127, ...side(0.012, 0.043), 0.067],
        [0.108, ...side(0.026, 0.029), 0.075],
      ],
      0.002,
    );
    const wing = shell(
      rig.chest,
      graphite,
      [
        [0.003, 0.005],
        [0.01, 0.007],
        [0.024, 0.013],
        [0.032, 0.014],
        [0.035, 0.01],
        [0.035, 0],
      ],
      0.55,
      0,
      0.11,
      0.081,
    );
    wing.rotation.z = -s * (PI * 0.5 - 0.08);
    strap(
      rig.chest,
      [
        [s * 0.061, 0.064, 0.069],
        [s * 0.075, 0.119, 0.056],
        [s * 0.069, 0.147, 0.0],
        [s * 0.075, 0.118, -0.055],
        [s * 0.051, 0.057, -0.074],
        [-s * 0.057, -0.051, -0.052],
      ],
      0.019,
    );
    buckle(rig.chest, s * 0.069, 0.096, 0.068, 0.009, 0.008);
    oval(rig.chest, agedBrass, s * 0.064, 0.068, 0.07, 0.0035, 0.0035, 0.002);
  }
  oval(rig.chest, rubber, 0, 0.11, 0.083, 0.008, 0.01, 0.0075);
  plate(
    rig.chest,
    leather,
    [
      [0.077, -0.071, 0.071, 0.056],
      [0.069, -0.075, 0.075, 0.058],
      [0.031, -0.07, 0.07, 0.063],
      [0.003, -0.077, 0.077, 0.057],
      [-0.043, -0.083, 0.083, 0.049],
      [-0.082, -0.079, 0.079, 0.049],
    ],
    0.024,
    0.017,
  );
  // Gusseted pocket faces are raised off the bib to accommodate the tools.
  plate(
    rig.chest,
    darkLeather,
    [
      [0.004, -0.068, 0.018, 0.078],
      [0.001, -0.07, 0.018, 0.081],
      [-0.04, -0.064, 0.02, 0.08],
      [-0.052, -0.049, 0.012, 0.08],
    ],
    0.005,
  );
  plate(
    rig.chest,
    darkLeather,
    [
      [0.002, 0.025, 0.062, 0.077],
      [-0.005, 0.022, 0.067, 0.078],
      [-0.038, 0.023, 0.064, 0.073],
      [-0.045, 0.029, 0.056, 0.073],
    ],
    0.004,
  );
  for (const s of [-1, 1]) {
    line(
      rig.chest,
      leatherEdge,
      [
        [s * 0.069, 0.076, 0.061],
        [s * 0.055, 0.074, 0.068],
        [0, 0.074, 0.081],
      ],
      0.00125,
    );
    for (let k = 0; k < 11; k++) {
      const x = s * (0.0058 + k * 0.0058),
        z = 0.059 + 0.023 * (1 - (x / 0.075) ** 2);
      rod(rig.chest, thread, [x - 0.0016, 0.068, z + 0.001], [x + 0.0016, 0.068, z + 0.001], 0.00065);
    }
  }
  for (const x of [-0.063, 0.015, 0.029, 0.058])
    for (let k = 0; k < 7; k++) {
      const y = -0.006 - k * 0.0051;
      rod(rig.chest, thread, [x, y, 0.083], [x + 0.0007, y - 0.0027, 0.083], 0.00063);
    }
  line(
    rig.chest,
    leatherEdge,
    [
      [-0.068, 0.003, 0.081],
      [-0.032, 0.003, 0.086],
      [0.018, 0.003, 0.082],
    ],
    0.0017,
  );
  line(
    rig.chest,
    leatherEdge,
    [
      [0.024, 0, 0.077],
      [0.044, 0, 0.085],
      [0.063, 0, 0.078],
    ],
    0.0016,
  );

  // Tools pivot at the mouth of the pocket; the handles pass behind the
  // pocket lip while their polished heads remain readable in silhouette.
  const tools = group(rig.chest, -0.045, -0.001, 0.079);
  const wrench = group(tools, -0.006, 0.002, -0.001);
  wrench.rotation.z = 0.13;
  flatTool(
    wrench,
    titanium,
    [
      [-0.003, -0.02],
      [0.003, -0.02],
      [0.003, 0.026],
      [0.01, 0.031],
      [0.011, 0.04],
      [0.008, 0.045],
      [0.003, 0.036],
      [-0.002, 0.035],
      [-0.006, 0.039],
      [-0.005, 0.047],
      [-0.012, 0.042],
      [-0.013, 0.033],
      [-0.004, 0.025],
    ],
    0.0024,
  );
  oval(wrench, graphite, 0, 0.014, 0.0031, 0.0011, 0.009, 0.0006);
  const spiral = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * PI * 5.5;
    spiral.push([0.024 + 0.0046 * Math.cos(a), 0.0008 + i * 0.00062, -0.001 + 0.0046 * Math.sin(a)]);
  }
  line(tools, titanium, spiral, 0.00125);
  rod(tools, agedBrass, [0.025, 0.024, -0.001], [0.025, 0.033, -0.001], 0.0024);
  rod(tools, darkLeather, [0.013, 0.032, -0.001], [0.038, 0.034, -0.001], 0.0033);
  rod(tools, agedBrass, [0.013, 0.032, -0.001], [0.016, 0.0324, -0.001], 0.0036);
  rod(tools, agedBrass, [0.035, 0.0337, -0.001], [0.038, 0.034, -0.001], 0.0036);

  const pen = group(rig.chest, 0.045, -0.003, 0.077);
  pen.rotation.z = -0.14;
  rod(pen, graphite, [0, -0.011, 0], [0, 0.038, 0], 0.0036);
  rod(pen, agedBrass, [0, 0.028, 0], [0, 0.031, 0], 0.0039);
  rod(pen, titanium, [0.002, 0.037, 0.003], [0.003, 0.018, 0.004], 0.0011);
  oval(pen, cyan, 0, 0.038, 0, 0.0026, 0.0018, 0.0026);
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
  const backYoke = oval(rig.chest, darkLeather, 0, 0.035, -0.07, 0.02, 0.021, 0.004);
  backYoke.rotation.z = PI / 4;
  oval(rig.chest, agedBrass, 0, 0.035, -0.074, 0.0042, 0.0042, 0.002);
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
    const sides = (inner, outer) => (s > 0 ? [-inner, outer] : [-outer, inner]);
    plate(
      flap,
      leather,
      [
        [0.016, ...sides(0.045, 0.041), 0.032],
        [-0.05, ...sides(0.046, 0.044), 0.031],
        [-0.11, ...sides(0.046, 0.041), 0.038],
        [-0.119, ...sides(0.044, 0.033), 0.038],
      ],
      0.013,
      0.005,
    );
    if (s === 1) flap.position.z += 0.002;
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
    if (s === 1) {
      // A service towel is folded over the hip pocket. The hem follows the
      // same fluted cross section as the woven body, including both wine stripes.
      function towelBand(top, bottom, material) {
        const verts = [],
          idx = [];
        const edge = (u, v) => {
          const fold = 0.0043 * Math.cos(u * PI * 4.6 + 0.45 * v);
          return [
            -0.026 + 0.05 * u + 0.0034 * Math.sin(v * 1.8),
            0.012 - 0.092 * v + 0.003 * Math.sin(PI * u * 2.8) * v,
            0.042 + 0.019 * v + fold,
          ];
        };
        for (let k = 0; k <= 3; k++)
          for (let j = 0; j <= 16; j++) {
            verts.push(...edge(j / 16, T.MathUtils.lerp(top, bottom, k / 3)));
            if (j && k) {
              const b = k * 17 + j;
              idx.push(b - 18, b - 1, b, b - 18, b, b - 17);
            }
          }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        part(flap, g, material);
      }
      for (const [top, bottom, m] of [
        [0, 0.72, linen],
        [0.72, 0.745, wovenStripe],
        [0.745, 0.8, linen],
        [0.8, 0.86, wovenStripe],
        [0.86, 1, linen],
      ])
        towelBand(top, bottom, m);
    }
    flaps.push(flap);
    oval(upper, rubber, 0, 0, 0, 0.032, 0.031, 0.035);
    oval(upper, enamel, s * 0.008, -0.011, -0.001, 0.043, 0.04, 0.049);
    shell(
      upper,
      enamel,
      [
        [-0.152, 0.027],
        [-0.144, 0.034],
        [-0.114, 0.041],
        [-0.079, 0.045],
        [-0.048, 0.043],
        [-0.03, 0.03],
      ],
      1.11,
      s * 0.007,
      0,
      0,
    );
    rod(upper, graphite, [0, -0.175, 0], [0, -0.029, 0], 0.016, 0.019);
    shell(
      upper,
      titanium,
      [
        [-0.157, 0.023],
        [-0.144, 0.034],
      ],
      1.11,
      s * 0.007,
      0,
      0,
    );
    pivot(fore, 0, 0, 0, 0.02, 0.041);
    rod(fore, graphite, [0, -0.136, -0.003], [0, 0.002, -0.003], 0.014, 0.017);
    shell(
      fore,
      porcelain,
      [
        [-0.127, 0.019],
        [-0.118, 0.025],
        [-0.08, 0.032],
        [-0.05, 0.037],
        [-0.032, 0.034],
        [-0.026, 0.021],
      ],
      0.91,
    );
    shell(
      fore,
      titanium,
      [
        [-0.128, 0.02],
        [-0.118, 0.025],
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
    oval(thigh, graphite, 0, 0, 0, 0.044, 0.042, 0.045);
    // Broad floating patella and side fasteners sit over the actuator joint.
    oval(shin, graphite, s * 0.038, -0.06, 0.015, 0.006, 0.01, 0.009);
    oval(shin, titanium, s * 0.043, -0.06, 0.015, 0.0012, 0.005, 0.005);
    line(
      shin,
      titanium,
      [
        [s * 0.038, -0.088, 0.02],
        [s * 0.033, -0.115, 0.024],
        [s * 0.03, -0.16, 0.019],
      ],
      0.001,
    );
    oval(upper, titanium, s * 0.046, -0.011, 0, 0.003, 0.018, 0.017);
    oval(upper, graphite, s * 0.049, -0.011, 0, 0.002, 0.014, 0.013);
    oval(upper, cyan, s * 0.0505, -0.011, 0, 0.0016, 0.008, 0.007);

    rod(thigh, graphite, [0, -0.229, 0], [0, -0.017, 0], 0.023, 0.027);
    shell(
      thigh,
      enamel,
      [
        [-0.216, 0.039],
        [-0.206, 0.049],
        [-0.151, 0.061],
        [-0.092, 0.064],
        [-0.052, 0.062],
        [-0.036, 0.049],
      ],
      1.09,
      s * 0.004,
      0,
      0,
    );
    shell(
      thigh,
      titanium,
      [
        [-0.223, 0.034],
        [-0.209, 0.048],
      ],
      1.09,
      s * 0.004,
      0,
      0,
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
    pivot(shin, 0, 0, 0, 0.037, 0.075);
    oval(shin, porcelain, 0, -0.002, 0.02, 0.034, 0.032, 0.026);
    rod(shin, graphite, [0, -0.225, 0], [0, -0.011, 0], 0.02, 0.025);
    shell(
      shin,
      porcelain,
      [
        [-0.202, 0.031],
        [-0.19, 0.04],
        [-0.135, 0.05],
        [-0.08, 0.054],
        [-0.044, 0.05],
        [-0.032, 0.037],
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
        [-0.047, 0.034],
        [-0.045, 0.038],
        [-0.037, 0.04],
        [-0.03, 0.038],
      ],
      1.47,
      0,
      0,
      0.018,
    );
    shell(
      foot,
      enamel,
      [
        [-0.037, 0.038],
        [-0.034, 0.04],
        [-0.023, 0.04],
        [-0.014, 0.036],
        [0.002, 0.021],
        [0.008, 0.015],
        [0.008, 0],
      ],
      1.46,
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

  // Give the chassis a low, forward centre of volume, the way a deep-drawn
  // shell swells around a battery pack. Apply the same form to the leather
  // over it, so the straps, darted bib and pocket lips stay on the surface.
  function belly(y) {
    return 1 - T.MathUtils.smoothstep(y, -0.067, 0.142);
  }
  function formChassis(geometry) {
    const pos = geometry.attributes.position,
      norm = geometry.attributes.normal;
    const n = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      const b = belly(y),
        slope = (belly(y + 0.0001) - belly(y - 0.0001)) / 0.0002;
      const broad = 1 + 0.405 * b,
        deep = 1 + 0.45 * b;
      pos.setXYZ(i, x * broad, y, z * deep + 0.01 * b);
      // Inverse-transpose of the form's Jacobian retains smooth enamel and
      // a continuous specular highlight around its changing cross section.
      const nx = norm.getX(i) / broad,
        nz = norm.getZ(i) / deep;
      n.set(nx, norm.getY(i) - slope * (0.405 * x * nx + (0.45 * z + 0.01) * nz), nz).normalize();
      norm.setXYZ(i, n.x, n.y, n.z);
    }
  }
  for (const hinge of [tools, pen]) {
    const b = belly(hinge.position.y);
    hinge.position.x *= 1 + 0.405 * b;
    hinge.position.z = hinge.position.z * (1 + 0.45 * b) + 0.01 * b + 0.003;
  }
  for (const flap of flaps) {
    flap.position.x *= 1.24;
    flap.position.z += 0.015;
    flap.scale.x = 1.28;
    flap.scale.z = 1.1;
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
      if (parent === rig.chest) formChassis(baked);
      if (parent === rig.hips) baked.scale(1.28, 1, 1.23);
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

  rig.secondary ??= {};
  rig.secondary.hummin = { apron: flaps[0], antenna, tools };
  let toolAngle = 0,
    toolVelocity = 0,
    mastAngle = 0,
    mastVelocity = 0,
    lastSpeed = 0,
    lastVy = 0;
  let springL = 0,
    velocityL = 0,
    springR = 0,
    velocityR = 0,
    servo = 0,
    servoVelocity = 0;
  let lastTime = -1;
  return function animate(frame) {
    const { dt, time, speed, state, emote } = frame;
    if (time <= lastTime) {
      springL = springR = -0.09;
      velocityL = velocityR = 0;
      servo = servoVelocity = toolAngle = toolVelocity = mastAngle = mastVelocity = 0;
      lastSpeed = speed;
      lastVy = frame.vy;
      expression.value.set(1, 0, 0, 0);
    }
    lastTime = time;
    // Allow the elbows to clear the rounded flank through the arm swing.
    rig.upperArmL.rotation.z += 0.135;
    rig.upperArmR.rotation.z -= 0.135;

    // Stowage and service antenna are driven by the same root impulses as the
    // apron. Each has its own restoring torque and damping at the fixed step.
    const accel = dt > 0 ? T.MathUtils.clamp((speed - lastSpeed) / dt, -20, 20) : 0;
    const jolt = dt > 0 ? T.MathUtils.clamp((frame.vy - lastVy) / dt, -22, 22) : 0;
    lastSpeed = speed;
    lastVy = frame.vy;
    const stride = Math.sin((frame.phase ?? 0) * 2) * Math.min(1, speed / 3.9);
    const mastTarget = T.MathUtils.clamp(
      -0.014 * accel - 0.008 * jolt + 0.15 * stride + 0.052 * frame.turn,
      -0.48,
      0.48,
    );
    const toolTarget = T.MathUtils.clamp(
      0.008 * accel + 0.005 * jolt - 0.13 * stride - 0.025 * frame.turn,
      -0.35,
      0.35,
    );
    mastVelocity += ((mastTarget - mastAngle) * 120 - 11 * mastVelocity) * dt;
    toolVelocity += ((toolTarget - toolAngle) * 105 - 13 * toolVelocity) * dt;
    mastAngle += mastVelocity * dt;
    toolAngle += toolVelocity * dt;
    antenna.rotation.x = mastAngle;
    tools.rotation.z = toolAngle;
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
