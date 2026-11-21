// Hummin's cast shells, OLED display and fitted field gear share the articulated rig.
// The normalized sole plane sits 0.047 below each ankle.
import * as T from 'three';
import { secondaryMotion } from './secondary.js';
import { fitCasting, fieldCasting } from './hummin-shell-fit.js';
import { fitArmor } from './hummin-panels.js';
import { detailMaterial } from './material-detail.js';
import { weave } from './hummin-textiles.js';
import { makeScarf } from './hummin-scarf.js';
import { fitPouches } from './hummin-pouches.js';
import { makeApron } from './hummin-leather.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;

export function buildHummin(rig) {
  // The battery bay sits behind the axis of the sole. Keep the shoulder and
  // helmet pivots over their support bearings when locating the rib casting.
  // Grow the cranial unit above its lower bearing and keep the articulated
  // figure at its specified standing height. Feet and floor contact stay local.
  rig.root.scale.multiplyScalar(1 / 1.078);
  rig.chest.position.z = -0.0078;
  rig.head.position.z = 0.005;
  rig.upperArmL.position.z = rig.upperArmR.position.z = 0.0078;
  for (const s of ['L', 'R']) {
    const sign = s === 'L' ? 1 : -1;
    rig['upperArm' + s].position.x = sign * 0.125;
    rig['upperArm' + s].position.y -= 0.007;
    rig['forearm' + s].position.y *= 0.84;
    rig['hand' + s].position.y *= 0.82;
    rig['thigh' + s].position.x = sign * 0.071;
  }
  const surface = (color, roughness, metalness = 0, extra = {}) =>
    new T.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
  const enamel = surface('#fffae4', 0.29, 0.18, { clearcoat: 0.8, clearcoatRoughness: 0.19 });
  const porcelain = surface('#c4bca7', 0.24, 0.13, { clearcoat: 0.75 });
  const titanium = surface('#b0b5b4', 0.32, 0.78);
  const graphite = surface('#424545', 0.42, 0.42);
  const rubber = surface('#0a0d0c', 0.72);
  const agedBrass = surface('#c1a05a', 0.35, 0.72);
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
      const i =
        4 * (256 * (Math.floor(y + j * Math.sin(a)) & 255) + (Math.floor(x + j * Math.cos(a)) & 255));
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
  const leather = surface('#8a6548', 0.72, 0.015, {
    map: grain,
    bumpMap: grain,
    bumpScale: 0.00016,
    sheen: 0.24,
    sheenColor: new T.Color('#8d6850'),
  });
  const leatherEdge = surface('#a0784c', 0.74);
  const darkLeather = surface('#815939', 0.6, 0.02, { map: grain, bumpMap: grain, bumpScale: 0.00014 });
  const thread = surface('#bf9f72', 0.91);
  const denim = weave(surface('#3e5d81', 0.86, 0, { sheen: 0.3 }), false);
  const denimEdge = weave(surface('#647d9f', 0.88, 0, { sheen: 0.25 }), false);
  const scarf = weave(surface('#edcc93', 0.92, 0, { sheen: 0.44 }), true);
  const emblem = surface('#e0b969', 0.74, 0.07, { sheen: 0.26 });
  const berry = surface('#6a4c6c', 0.86, 0, { sheen: 0.32 });
  const cyan = surface('#42a0bf', 0.26, 0.21, { emissive: '#3fc9bd', emissiveIntensity: 0.78 });

  for (const [id, mat] of Object.entries({
    pearl: enamel,
    ceramicRim: porcelain,
    steel: titanium,
    darkMetal: graphite,
    rubber,
    brass: agedBrass,
    leather,
    leatherEdge,
    pocket: darkLeather,
    stitch: thread,
    denim,
    denimEdge,
    scarf,
    emblem,
    berry,
    cyan,
  }))
    mat.userData.blueprintId = id;

  for (const mat of [enamel, porcelain, titanium, graphite]) detailMaterial(mat, 'metal');
  for (const mat of [leather, darkLeather, leatherEdge]) detailMaterial(mat, 'leather');
  for (const mat of [denim, denimEdge, scarf, emblem, berry, thread]) detailMaterial(mat, 'cotton');
  detailMaterial(agedBrass, 'gold');
  // The saddle stitches use the cut pattern's UV coordinates. Even the free
  // hem carries its stitch row when the panels flex around a raised knee.
  const leatherCompile = leather.onBeforeCompile,
    leatherKey = leather.customProgramCacheKey();
  leather.onBeforeCompile = function (shader, renderer) {
    leatherCompile.call(this, shader, renderer);
    shader.vertexShader =
      'varying vec2 stitchUV;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nstitchUV=uv;');
    shader.fragmentShader =
      'varying vec2 stitchUV;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 seamEdge=min(stitchUV,1.-stitchUV);
      float welt=1.-smoothstep(.010,.026,min(seamEdge.x,seamEdge.y));
      vec2 lineWidth=max(fwidth(stitchUV)*.7,vec2(.002));
      float sewn=(1.-smoothstep(.002,.002+lineWidth.x,abs(seamEdge.x-.032)))*smoothstep(.10,.25,fract(32.*stitchUV.y))*(1.-smoothstep(.71,.86,fract(32.*stitchUV.y)));
      sewn=max(sewn,(1.-smoothstep(.002,.002+lineWidth.y,abs(1.-stitchUV.y-.027)))*smoothstep(.10,.25,fract(30.*stitchUV.x))*(1.-smoothstep(.71,.86,fract(30.*stitchUV.x))));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.17,.091,.046),.23*welt);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.32,.224,.143),sewn*.84);`,
      );
  };
  leather.customProgramCacheKey = () => leatherKey + '-saddle-stitch';

  // The slim horizontal skirt follows both the resting curve of the shell
  // and the line of a swinging thigh. Flexible leather is isolated from metal.
  const staticGroups = new Map();
  const features = Object.create(null);
  function mark(mesh, id) {
    mesh.userData.measureFeature = id;
    return mesh;
  }

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
    const mesh = part(parent, new T.SphereGeometry(1, 18, 12), mat, x, y, z);
    mesh.userData.mobileGeometry = new T.SphereGeometry(1, 10, 7);
    mesh.scale.set(rx, ry, rz);
    return mesh;
  }
  function rod(parent, mat, start, end, radius, capRadius = radius) {
    const a = new T.Vector3(...start),
      b = new T.Vector3(...end);
    const axis = b.clone().sub(a);
    const mesh = part(parent, new T.CylinderGeometry(capRadius, radius, axis.length(), 8), mat);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis.normalize());
    return mesh;
  }
  function line(parent, mat, points, radius, smooth = true) {
    const path = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      false,
      'centripetal',
    );
    return part(
      parent,
      new T.TubeGeometry(path, smooth ? Math.max(6, points.length * 2) : points.length, radius, 5, false),
      mat,
    );
  }
  function shell(parent, mat, profile, depth = 1, x = 0, y = 0, z = 0) {
    const rings = profile.slice();
    const cuff = rings[0][0] === rings.at(-1)[0] && rings[0][1] === rings.at(-1)[1];
    if (!cuff && rings[0][1] !== 0) rings.unshift([rings[0][0], 0]);
    if (!cuff && rings.at(-1)[1] !== 0) rings.push([rings.at(-1)[0], 0]);
    const g = new T.LatheGeometry(
      rings.map(([h, r]) => new T.Vector2(r, h)),
      22,
    );
    const mesh = part(parent, g, mat, x, y, z);
    mesh.userData.mobileGeometry = new T.LatheGeometry(g.parameters.points, 12);
    mesh.scale.z = depth;
    return mesh;
  }
  // Profile cut from steel stock, with the ground chamfer around the jaw.
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
      const disk = part(parent, new T.CylinderGeometry(r, r, length, 18), mat, x + offset, y, z);
      disk.rotation.z = PI / 2;
      return disk;
    }
    const hub = disc(graphite, radius, thickness, 0);
    for (const side of [-1, 1]) {
      const outer = side * thickness * 0.5;
      disc(titanium, radius * 0.79, 0.0018, outer);
      disc(rubber, radius * 0.61, 0.002, outer + side * 0.0011);
      disc(agedBrass, radius * 0.26, 0.002, outer + side * 0.00175);
    }
    return hub;
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
  oval(head, enamel, 0, cy, -0.001, rx, ry, rz).userData.garmentSurface = 'head';
  function visor(material, width, height, lift) {
    const p = [],
      uv = [],
      idx = [];
    const steps = 52,
      rings = 8;
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
    return part(head, g, material);
  }
  visor(titanium, 1.09, 0.692, 0.00105);
  visor(rubber, 1.074, 0.669, 0.00145);
  const screen = surface('#000b11', 0.19, 0.35, {
    clearcoat: 0.15,
    specularIntensity: 0.066,
    clearcoatRoughness: 0.1,
    emissive: '#000105',
  });
  const phosphor = { value: new T.Color('#53c4cc') };
  const mood = { value: new T.Vector3() };
  screen.userData.blueprintId = 'visor';
  screen.userData.finishInks = { cyan: phosphor.value };
  screen.userData.blueprintSamples = [
    { id: 'visor', uv: [0.5, 0.68], uvWidth: 0.028 },
    { id: 'cyan', uv: [0.719, 0.514], uvWidth: 0.018 },
  ];
  const expression = { value: new T.Vector4(1, 0, 0, 0) };
  screen.onBeforeCompile = (shader) => {
    shader.uniforms.expression = expression;
    shader.uniforms.phosphor = phosphor;
    shader.uniforms.mood = mood;
    shader.vertexShader =
      'varying vec2 screenUV;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nscreenUV = uv;');
    shader.fragmentShader =
      'varying vec2 screenUV; uniform vec4 expression; uniform vec3 phosphor; uniform vec3 mood;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      vec2 p=screenUV*2.-1.;
      float dx=abs(p.x)-.438;
      float openness=max(.08,expression.x*(1.-.9*mood.y*step(0.,p.x))*(1.-.72*mood.z));
      float arch=-.14+openness*(.165-3.8*dx*dx)+.22*expression.y*dx;
      float lineDistance=abs(p.y-arch)/sqrt(1.+pow(7.6*dx*openness,2.));
      float cap=max(abs(dx)-.171,0.);
      float arc=1.-smoothstep(.031,.047,length(vec2(lineDistance,cap)));
      vec2 e=vec2(dx,(p.y+.115)/openness);
      float dotEye=1.-smoothstep(.088,.109,length(e*vec2(1.,.75)));
      float eye=mix(arc,dotEye,expression.w);
      vec2 h=e*vec2(4.8,3.7); h.y+=.12;
      h.y-=.46*sqrt(abs(h.x));
      float heart=1.-smoothstep(.61,.72,length(h));
      eye=mix(eye,heart,mood.x);
      vec2 sp=e/vec2(.19,.31);
      float spiral=(1.-smoothstep(.17,.42,abs(sin(atan(sp.y,sp.x)-length(sp)*7.1))))*(1.-smoothstep(.82,1.03,length(sp)));
      eye=mix(eye,spiral,expression.z);
      float browCurve=.36+.07*(1.-pow(min(1.,abs(dx)/.20),2.))+.38*expression.y*dx;
      float brow=(1.-smoothstep(.015,.035,abs(p.y-browCurve)))*(1.-smoothstep(.14,.19,abs(dx)));
      float smileCurve=-.42+.14*pow(min(1.,abs(p.x)/.24),2.);
      float lip=(1.-smoothstep(.026,.047,abs(p.y-smileCurve)))*(1.-smoothstep(.20,.245,abs(p.x)));
      float halo=.10*exp(-18.*max(0.,lineDistance-.03)-18.*cap);
      totalEmissiveRadiance += phosphor*(1.28*max(eye,lip)+.37*expression.y*brow+halo);
      totalEmissiveRadiance += vec3(.001,.003,.004)*(1.+sin(screenUV.y*140.));`,
      );
  };
  mark(visor(screen, 1.043, 0.63, 0.00185), 'display');
  for (const s of [-1, 1]) {
    const ear = group(head, s * 0.114, 0.066, -0.004);
    ear.name = 'Service receiver';
    ear.rotation.z = (-s * PI) / 2;
    ear.scale.set(1.01, 1.14, 1.12);
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
  const antenna = group(head, 0.12, 0.046, -0.033);
  antenna.userData.dynamicPose = true;
  antenna.scale.set(-0.28, 0.78, 1.0);
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
  // The visor can be removed independently of the dome. Six slotted
  // fasteners sit in countersunk bosses immediately outside the OLED seal.
  for (const side of [-1, 1])
    for (const lat of [-0.42, 0.0, 0.42]) {
      const theta = side * (1.23 - 0.13 * Math.abs(lat));
      const n = new T.Vector3(
        (Math.sin(theta) * Math.cos(lat)) / rx,
        Math.sin(lat) / ry,
        (Math.cos(theta) * Math.cos(lat)) / rz,
      ).normalize();
      const center = new T.Vector3(
        rx * Math.sin(theta) * Math.cos(lat),
        cy + ry * Math.sin(lat),
        -0.001 + rz * Math.cos(theta) * Math.cos(lat),
      );
      const boss = part(
        head,
        new T.CylinderGeometry(0.0033, 0.0043, 0.0019, 16),
        graphite,
        ...center.clone().addScaledVector(n, 0.0006).toArray(),
      );
      boss.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
      const bolt = part(
        head,
        new T.CylinderGeometry(0.0026, 0.003, 0.0011, 12),
        titanium,
        ...center.clone().addScaledVector(n, 0.0018).toArray(),
      );
      bolt.quaternion.copy(boss.quaternion);
      const d = new T.Vector3(0, 1, 0).cross(n).normalize().multiplyScalar(0.00165);
      center.addScaledVector(n, 0.00243);
      rod(
        head,
        graphite,
        center.clone().sub(d).toArray(),
        center.clone().add(d).toArray(),
        0.00034,
      ).userData.highDetail = true;
    }
  // Short, alternating ribs allow the head and waist to rotate independently.
  shell(
    rig.chest,
    rubber,
    [
      [0.145, 0.037],
      [0.151, 0.041],
      [0.193, 0.039],
      [0.2, 0.039],
    ],
    0.92,
  );
  for (let i = 0; i < 5; i++) {
    shell(
      rig.chest,
      i % 2 ? titanium : rubber,
      [
        [0.155 + i * 0.008, 0.043],
        [0.162 + i * 0.008, 0.043],
      ],
      0.85,
    );
  }
  const chestShell = shell(
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
  chestShell.userData.garmentSurface = 'chassis';
  // A screw-retained rear cover vents the battery compartment. Slot lengths
  // step around the shoulder straps and follow the curved casting surface.
  for (let j = 0; j < 4; j++) {
    const y = 0.08 + j * 0.0052,
      length = 0.023 - 0.0027 * j;
    const rear = (x) => -0.69 * Math.sqrt(0.1095 ** 2 - x * x) - 0.00065;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const x = length * (i / 4 - 1);
      pts.push([x, y, rear(x)]);
    }
    line(rig.chest, graphite, pts, 0.00115);
  }
  for (const side of [-1, 1]) {
    const x = side * 0.029,
      z = -0.69 * Math.sqrt(0.109 ** 2 - x * x);
    oval(rig.chest, titanium, x, 0.091, z - 0.0012, 0.0026, 0.0026, 0.0011);
    rod(
      rig.chest,
      rubber,
      [x - 0.0011, 0.0905, z - 0.0022],
      [x + 0.0011, 0.0915, z - 0.0022],
      0.00034,
    ).userData.highDetail = true;
  }
  const hipShell = shell(
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
  hipShell.userData.garmentSurface = 'pelvis';
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

  for (const sign of [-1, 1]) {
    const tie = rod(
      rig.chest,
      enamel,
      [sign * 0.071, 0.143, -0.003],
      [sign * 0.126, 0.148, -0.003],
      0.0095,
      0.01,
    );
    tie.userData.garmentSurface = 'chassis';
  }
  const apron = makeApron(
    rig,
    { leather, darkLeather, leatherEdge, thread, agedBrass, denim, denimEdge, emblem, berry },
    { group, line, rod, oval, buckle },
  );
  const { flaps, tools, pen } = apron;
  const neckwear = makeScarf(rig, scarf, apron);
  const gear = fitPouches(
    rig,
    apron,
    { leather, darkLeather, leatherEdge, thread, agedBrass },
    { group, rod, oval, line },
  );
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
  const worm = line(tools, titanium, spiral, 0.00125).geometry;
  const ends = Array.from(worm.index.array),
    sides = worm.parameters.radialSegments,
    lastRing = worm.attributes.position.count - (sides + 1);
  for (let k = 1; k < sides - 1; k++) ends.push(0, k + 1, k, lastRing, lastRing + k, lastRing + k + 1);
  worm.setIndex(ends);
  rod(tools, agedBrass, [0.025, 0.024, -0.001], [0.025, 0.033, -0.001], 0.0024);
  rod(tools, darkLeather, [0.013, 0.032, -0.001], [0.038, 0.034, -0.001], 0.0033);
  rod(tools, agedBrass, [0.013, 0.032, -0.001], [0.016, 0.0324, -0.001], 0.0036);
  rod(tools, agedBrass, [0.035, 0.0337, -0.001], [0.038, 0.034, -0.001], 0.0036);

  pen.rotation.z = -0.14;
  rod(pen, graphite, [0, -0.011, 0], [0, 0.038, 0], 0.0036);
  rod(pen, agedBrass, [0, 0.028, 0], [0, 0.031, 0], 0.0039);
  rod(pen, titanium, [0.002, 0.037, 0.003], [0.003, 0.018, 0.004], 0.0011);
  oval(pen, cyan, 0, 0.038, 0, 0.0026, 0.0018, 0.0026);
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
    oval(upper, rubber, 0, 0, 0, 0.032, 0.031, 0.035);
    mark(
      oval(upper, enamel, s * 0.008, -0.011, -0.001, 0.046, 0.039, 0.054),
      'pauldron' + suffix,
    ).userData.garmentSurface = 'upperArm' + suffix;
    const upperShell = shell(
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
    upperShell.userData.garmentSurface = 'upperArm' + suffix;
    fitArmor(upperShell, s, 'upperArm', { graphite, titanium, enamel }, { part, rod });
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
    const foreShell = shell(
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
    foreShell.userData.garmentSurface = 'forearm' + suffix;
    fitArmor(foreShell, s, 'forearm', { graphite, titanium, enamel }, { part, rod });
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
    // Fabric-reinforced bellows keep the wrist and elbow bearings sealed.
    for (const [joint, start, r, count] of [
      [fore, -0.021, 0.018, 4],
      [hand, 0.006, 0.014, 4],
      [shin, -0.025, 0.027, 3],
    ]) {
      for (let j = 0; j < count; j++) {
        const y = start + j * 0.0037;
        shell(
          joint,
          j % 2 ? rubber : graphite,
          [
            [y, r * 0.95],
            [y + 0.0009, r * 1.13],
            [y + 0.0025, r],
            [y + 0.0031, r * 0.96],
          ],
          0.98,
        );
      }
    }
    oval(hand, graphite, 0, -0.004, 0, 0.015, 0.017, 0.017);
    oval(hand, enamel, s * 0.002, -0.023, 0.002, 0.02, 0.023, 0.016);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * 0.0082,
        long = 0.013 * (1 - 0.12 * Math.abs(k - 1.3)),
        y = -0.04;
      // The dorsal knuckle shield floats over a darker elastomer flexure;
      // a narrow transverse pivot pin catches light on either side.
      oval(hand, porcelain, x, -0.035, 0.0105, 0.0041, 0.0053, 0.0044);
      rod(hand, titanium, [x - 0.0051, -0.041, 0.005], [x + 0.0051, -0.041, 0.005], 0.0019);
      oval(hand, rubber, x, y, 0.001, 0.0038, 0.0046, 0.0043);
      const middle = [x, y - long, 0.0038];
      rod(hand, porcelain, [x, y - 0.001, 0.001], middle, 0.0047, 0.0044);
      rod(hand, titanium, [x - 0.005, middle[1], middle[2]], [x + 0.005, middle[1], middle[2]], 0.00165);
      for (let j = 0; j < 2; j++)
        rod(
          hand,
          graphite,
          [x - 0.0033, y - 0.0038 - j * 0.0017, 0.0058],
          [x + 0.0033, y - 0.0038 - j * 0.0017, 0.0058],
          0.00038,
        ).userData.highDetail = true;
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
    const thighShell = shell(
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
    thighShell.userData.garmentSurface = 'thigh' + suffix;
    fitArmor(thighShell, s, 'thigh', { graphite, titanium, enamel }, { part, rod });
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
    mark(pivot(shin, 0, 0, 0, 0.037, 0.075), 'hinge' + suffix);
    oval(shin, graphite, 0, -0.002, 0.02, 0.036, 0.033, 0.027);
    oval(shin, enamel, 0, -0.001, 0.04, 0.037, 0.032, 0.021).userData.garmentSurface = 'shin' + suffix;
    rod(shin, graphite, [0, -0.225, 0], [0, -0.011, 0], 0.02, 0.025);
    const shinShell = shell(
      shin,
      enamel,
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
    shinShell.userData.garmentSurface = 'shin' + suffix;
    fitArmor(shinShell, s, 'shin', { graphite, titanium, enamel }, { part, rod });
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
    mark(
      shell(
        foot,
        titanium,
        [
          [-0.002, 0.023],
          [0.004, 0.029],
          [0.018, 0.032],
          [0.027, 0.032],
          [0.031, 0.026],
        ],
        0.91,
      ),
      'ankle' + suffix,
    );
    // Radial sections keep the outsole flat, with a small rocker under the toe.
    shell(
      foot,
      rubber,
      [
        [-0.047, 0],
        [-0.047, 0.045],
        [-0.045, 0.05],
        [-0.037, 0.054],
        [-0.03, 0.051],
      ],
      1.28,
      0,
      0,
      0.018,
    );
    shell(
      foot,
      enamel,
      [
        [-0.037, 0.05],
        [-0.034, 0.054],
        [-0.023, 0.054],
        [-0.016, 0.053],
        [-0.005, 0.049],
        [0.007, 0.038],
        [0.019, 0.027],
        [0.019, 0],
      ],
      1.28,
      0,
      0,
      0.018,
    );
    // A recessed wraparound lens follows the toe's rocker. Its dark gasket
    // separates the glowing strip from the warm enamel along the whole arc.
    const toe = (radius, y) =>
      Array.from({ length: 19 }, (_, k) => {
        const a = -1.05 + (k * 2.1) / 18;
        return [radius * Math.sin(a), y, 0.018 + 1.28 * radius * Math.cos(a)];
      });
    line(foot, graphite, toe(0.0548, -0.0258), 0.0055);
    mark(line(foot, cyan, toe(0.0573, -0.0255), 0.0035), 'bootLight' + suffix);
  }

  // Give the chassis a low, forward centre of volume, the way a deep-drawn
  // shell swells around a battery pack. Apply the same form to the leather
  // over it, so the straps, darted bib and pocket lips stay on the surface.
  function belly(y) {
    return 1 - T.MathUtils.smoothstep(y, -0.067, 0.142);
  }
  function extraBreadth(y) {
    return 0.29 * T.MathUtils.smoothstep(y, -0.057, 0.018) * (1 - T.MathUtils.smoothstep(y, 0.093, 0.151));
  }
  const torsoOffset = (h) =>
    0.014 * T.MathUtils.smoothstep(h, -0.078, 0.005) * (1 - T.MathUtils.smoothstep(h, 0.089, 0.144));
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
      const offset = torsoOffset(y);
      const offsetSlope = (torsoOffset(y + 0.0001) - torsoOffset(y - 0.0001)) / 0.0002;
      const addition = extraBreadth(y);
      const addSlope = (extraBreadth(y + 0.0001) - extraBreadth(y - 0.0001)) / 0.0002;
      const broad = 0.913 + 0.33 * b + addition,
        deep = 0.91 + 0.26 * b + 0.35 * addition;
      pos.setXYZ(i, x * broad, y, z * deep + 0.0025 * b + offset);
      // Inverse-transpose of the form's Jacobian retains smooth enamel and
      // a continuous specular highlight around its changing cross section.
      const nx = norm.getX(i) / broad,
        nz = norm.getZ(i) / deep;
      n.set(
        nx,
        norm.getY(i) -
          (slope * 0.33 + addSlope) * x * nx -
          ((0.26 * slope + 0.35 * addSlope) * z + 0.0025 * slope + offsetSlope) * nz,
        nz,
      ).normalize();
      norm.setXYZ(i, n.x, n.y, n.z);
    }
  }
  // Low crown roll on the porcelain helmet, before the visor seal is seated.
  // A broader upper quarter softens the profile without raising the top.
  function domeCasting(geometry) {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal;
    const v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const u = T.MathUtils.clamp((y - 0.07) / 0.085, 0, 1),
        f =
          1 -
          0.07 * u * u * (3 - 2 * u) +
          0.35 * u ** 6 +
          0.25 * (1 - T.MathUtils.smoothstep(y, -0.024, 0.007)),
        df =
          (-0.07 * 6 * u * (1 - u) + 2.1 * u ** 5) / 0.085 -
          (0.25 *
            (T.MathUtils.smoothstep(y + 0.0001, -0.024, 0.007) -
              T.MathUtils.smoothstep(y - 0.0001, -0.024, 0.007))) /
            0.0002;
      const nx = n.getX(i) / f,
        nz = n.getZ(i) / f;
      p.setXYZ(i, x * f, y, z * f - 0.01 * u * u);
      v.set(nx, n.getY(i) - df * (x * nx + z * nz) + ((0.02 * u) / 0.085) * nz, nz).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  // Pack rigid details by joint and finish. A knuckle, seam or rivet adds
  // geometry, but it does not require its own draw call.
  function bake(geometry, mesh, parent) {
    if (!geometry.attributes.uv)
      geometry.setAttribute(
        'uv',
        new T.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2),
      );
    // A smooth ring vertex serves several triangles. Fit its casting once and
    // preserve that index through both the joint and final render batches.
    const baked = geometry;
    if (!baked.index) {
      const count = baked.attributes.position.count;
      const indices = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
      for (let i = 0; i < count; i++) indices[i] = i;
      baked.setIndex(new T.BufferAttribute(indices, 1));
    }
    baked.applyMatrix4(mesh.matrix);
    fitCasting(baked, parent);
    fieldCasting(baked, parent);
    if (parent === rig.upperArmL || parent === rig.upperArmR) baked.scale(1, 0.84, 1);
    if (parent === rig.forearmL || parent === rig.forearmR) baked.scale(1, 0.82, 1);
    if (parent === rig.chest) formChassis(baked);
    if (parent === rig.head) domeCasting(baked);
    if (parent === rig.hips) {
      baked.scale(1.28, 1, 1.23);
      const pos = baked.attributes.position,
        n = baked.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i),
          z = pos.getZ(i),
          t = T.MathUtils.clamp((y - 0.025) / 0.026, 0, 1);
        const depth = 1 + 0.21 * t * t * (3 - 2 * t),
          slope = (0.21 * 6 * t * (1 - t)) / 0.026;
        const nx = n.getX(i),
          nz = n.getZ(i) / depth,
          ny = n.getY(i) - slope * z * nz,
          l = 1 / (Math.hypot(nx, ny, nz) || 1);
        pos.setZ(i, z * depth);
        n.setXYZ(i, nx * l, ny * l, nz * l);
      }
    }
    return baked;
  }
  for (const [parent, pieces] of staticGroups) {
    const buckets = new Map();
    for (const mesh of pieces) {
      mesh.updateMatrix();
      const g = mesh.geometry;
      const hand =
        parent === rig.handL
          ? 'handL'
          : parent === rig.handR
            ? 'handR'
            : parent === pen
              ? 'pen'
              : parent === tools
                ? 'corkscrew'
                : parent === wrench
                  ? 'wrench'
                  : '';
      const name = mesh.userData.garmentSurface ?? hand,
        fine = mesh.userData.highDetail ?? false;
      const feature = mesh.userData.measureFeature || '';
      const key = name + mesh.material.uuid + fine + feature;
      if (!buckets.has(key))
        buckets.set(key, {
          material: mesh.material,
          name,
          fine,
          feature,
          geometries: [],
          mobile: [],
          lower: false,
        });
      const bucket = buckets.get(key),
        high = bake(g, mesh, parent);
      bucket.geometries.push(high);
      if (mesh.userData.mobileGeometry) {
        bucket.mobile.push(bake(mesh.userData.mobileGeometry, mesh, parent));
        bucket.lower = true;
        mesh.userData.mobileGeometry.dispose();
      } else bucket.mobile.push(high);
      parent.remove(mesh);
      g.dispose();
    }
    for (const { material, name, fine, feature, geometries, mobile, lower } of buckets.values()) {
      const mesh = new T.Mesh(mergeGeometries(geometries), material);
      if (lower) mesh.userData.mobileGeometry = mergeGeometries(mobile);
      if (fine) mesh.userData.highDetail = true;
      mesh.castShadow = mesh.receiveShadow = true;
      if (name) (apron.surfaces[name] ??= []).push(mesh);
      if (feature) {
        mesh.name = feature;
        features[feature] = mesh;
      }
      parent.add(mesh);
      for (const g of new Set([...geometries, ...mobile])) g.dispose();
    }
  }

  apron.pairs.push(
    { outer: 'belt', inner: 'pelvis' },
    { outer: 'penPocket', inner: 'pen' },
    { outer: 'toolPocket', inner: 'wrench' },
    { outer: 'toolPocket', inner: 'corkscrew' },
  );
  rig.garments = {
    surfaces: apron.surfaces,
    pairs: apron.pairs,
    bodies: [
      'chassis',
      'pelvis',
      'head',
      ...['thigh', 'upperArm', 'forearm', 'hand', 'shin'].flatMap((key) => [key + 'L', key + 'R']),
    ],
  };
  rig.explorer = { bootLights: [features.bootLightL, features.bootLightR], display: features.display };
  const measured = (label, parts) => ({ label, parts });
  const paired = (key, caption) => ['L', 'R'].map((s) => measured(caption + ' ' + s, [features[key + s]]));
  const dome = measured('Pearl helmet casting, excluding side receivers', apron.surfaces.head);
  // The widest ring of ceramic supports the helmet through a shoulder roll.
  // Keep its real surface vertices even when another trim wins a hull direction.
  const casting = apron.surfaces.head[0];
  const latitudes = casting.geometry.attributes.uv;
  const ring = [];
  for (let i = 0; i < latitudes.count; i++)
    if (latitudes.getY(i) === 0.5 && latitudes.getX(i) < 1) ring.push(i);
  casting.userData.rollContactIndices = ring;
  const glass = features.display,
    uv = glass.geometry.attributes.uv;
  const eyes = [1, -1].map((side) => {
    const vertices = [];
    for (let i = 0; i < uv.count; i++) {
      const dx = (2 * uv.getX(i) - 1 - side * 0.438) / 0.205,
        dy = 2 * uv.getY(i) - 1 - (0.025 - 3.8 * (dx * 0.205) ** 2);
      if (Math.abs(dx) < 0.9 && Math.abs(dy) < 0.045) vertices.push(i);
    }
    return measured('Active phosphor aperture ' + (side > 0 ? 'L' : 'R'), [{ mesh: glass, vertices }]);
  });
  rig.blueprint = {
    groom: measured('Dome casting and ear receivers', [
      ...apron.surfaces.head,
      ...head.children.filter((p) => p.name === 'Service receiver'),
    ]),
    chin: dome,
    eyes,
    shoulders: paired('pauldron', 'Crest of enamel shoulder cup'),
    waist: measured('Midpoint of leather waist cinch', apron.surfaces.belt),
    knee: paired('hinge', 'Center of knee hinge drum'),
    ankleCuff: paired('ankle', 'Ankle ball cuff'),
  };
  // The dome and service receivers sit on a single machined collar.
  const helmetHousing = new T.Group();
  helmetHousing.name = 'Helmet housing';
  for (const part of [...head.children]) helmetHousing.add(part);
  helmetHousing.scale.set(1.17, 1.427, 1.15);
  helmetHousing.position.set(0, 0.011, 0.0055);
  head.add(helmetHousing);
  rig.secondary ??= {};
  rig.secondary.hummin = { apron: flaps[0], antenna, tools, scarf: neckwear.tail };
  const secondary = secondaryMotion(rig, './hummin-secondary.js', { apron, gear, neckwear, antenna, tools });
  let servo = 0, servoVelocity = 0;
  let lastTime = -1;
  return function animate(frame) {
    const { dt, time, speed, state, emote } = frame;
    if (time <= lastTime) {
      servo = servoVelocity = 0;
      expression.value.set(1, 0, 0, 0);
    }
    lastTime = time;
    // Allow the elbows to clear the rounded flank through the arm swing.
    const armSpread = 0.092 + 0.013 * Math.min(1, Math.abs(frame.turn));
    rig.upperArmL.rotation.z += armSpread;
    rig.forearmL.rotation.z -= 0.042;
    rig.upperArmR.rotation.z -= armSpread;
    rig.forearmR.rotation.z += 0.042;
    rig.upperArmL.position.x =
      0.125 + 0.018 * T.MathUtils.smoothstep(Math.abs(rig.upperArmL.rotation.z), 1.5, 2.5);
    rig.upperArmR.position.x =
      -0.125 - 0.018 * T.MathUtils.smoothstep(Math.abs(rig.upperArmR.rotation.z), 1.5, 2.5);

    const beat = emote >= 0 ? Math.sin(PI * emote) ** 2 : 0;
    const bow = emote >= 0 ? Math.sin(PI * T.MathUtils.clamp((emote - 0.18) / 0.76, 0, 1)) ** 2 : 0;
    // Acceleration-limited servo tracking allows a small settling overshoot.
    const targetYaw =
      T.MathUtils.clamp(frame.turn, -1.5, 1.5) * 0.06 + (Math.sin(time * 0.73) * 0.035) / (1 + speed);
    servoVelocity += ((targetYaw - servo) * 180 - servoVelocity * 18) * dt;
    servo += servoVelocity * dt;
    // The large visor rides on a short gimbal; limit pitch under the knit
    // collar and let the torso provide the remainder of the service bow.
    head.rotation.x *= 0.5;
    head.rotation.z *= 0.55;
    head.rotation.y += servo;
    head.rotation.z += beat * 0.12;
    head.rotation.x += bow * 0.065;
    rig.chest.rotation.x += bow * 0.38;
    rig.forearmR.rotation.x -= bow * 0.58;
    rig.upperArmR.rotation.z -= bow * 0.085;
    const run = state === 'run' ? 1 : 0;
    const turnIn = 1 - Math.exp(-dt * 17);
    expression.value.y += (run - expression.value.y) * turnIn;
    expression.value.z += ((state === 'roll' ? 1 : 0) - expression.value.z) * turnIn;
    const blink = Math.min(1, Math.abs(((time + 1.3) % 4.6) - 2.3) / 0.1);
    expression.value.x = Math.max(0.05, blink * (1 - 0.12 * expression.value.y));
    expression.value.w += ((state === 'jump' ? 1 : 0) - expression.value.w) * turnIn;
    mood.value.x =
      emote >= 0
        ? T.MathUtils.smoothstep(emote, 0.37, 0.55) * (1 - T.MathUtils.smoothstep(emote, 0.74, 0.89))
        : 0;
    mood.value.y = emote >= 0 ? Math.exp(-((emote - 0.22) ** 2) / 0.002) : 0;
    const idleCycle = time % 13.5;
    mood.value.z =
      state === 'idle' && emote < 0
        ? T.MathUtils.smoothstep(idleCycle, 8.5, 9.0) * (1 - T.MathUtils.smoothstep(idleCycle, 9.4, 9.9))
        : 0;
    secondary(frame);
  };
}
