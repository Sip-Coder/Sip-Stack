// The field educator. All dimensions here are fractions of standing height.
import * as T from 'three';
import { secondaryMotion } from './secondary.js';
import { outfitExplorer, quiltFinish } from './sippy-explorer.js';
import { fitExpression } from './sippy-expression.js';
import { fitHipSeams } from './sippy-hips.js';
import { buildExplorerHands } from './sippy-body.js';
import { cutExplorerLayers, fitLimb, anatomyRegions, fitOpenings } from './sippy-tailoring.js';
import { addExteriorShell, attachExteriorProfile, seatExplorerHead, shapeExplorerCrown } from './human-exterior.js';
import { sippyExterior } from './sippy-exterior-data.js';

const tau = Math.PI * 2;
const vec = (x, y, z) => new T.Vector3(x, y, z);
const group = (parent, x = 0, y = 0, z = 0) => {
  const g = new T.Group();
  parent.add(g);
  g.position.set(x, y, z);
  return g;
};

function surface(color, roughness = 0.65, extra = {}) {
  const Material = extra.specularIntensity === undefined ? T.MeshStandardMaterial : T.MeshPhysicalMaterial;
  return new Material({ color, roughness, ...extra });
}
function mesh(parent, shape, material, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(shape, material);
  m.position.set(x, y, z);
  m.castShadow = !material.transparent;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
let unitOval;
function ellipsoid(p, mat, x, y, z, rx, ry, rz) {
  unitOval ??= new T.SphereGeometry(1, 10, 7);
  const shape = unitOval.clone();
  shape.scale(rx, ry, rz);
  return mesh(p, shape, mat, x, y, z);
}
// Cross sections are [height, half width, half depth, forward offset].
// The offset gives the jaw, shoes, nose and tailored jacket independent profiles.
function rings(rows, count = 40) {
  const vertices = [],
    indices = [];
  const profiles = new T.CatmullRomCurve3(
    rows.map((r) => vec(r[1], r[0], r[2])),
    false,
    'catmullrom',
    0.32,
  );
  const offsets = new T.CatmullRomCurve3(
    rows.map((r) => vec(r[3] || 0, r[0], 0)),
    false,
    'catmullrom',
    0.32,
  );
  const layers = (rows.length - 1) * 2;
  for (let j = 0; j <= layers; j++) {
    const v = profiles.getPoint(j / layers),
      offset = offsets.getPoint(j / layers).x;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * tau;
      vertices.push(v.x * Math.sin(angle), v.y, offset + v.z * Math.cos(angle));
      if (j < layers) {
        const a = j * count + i,
          b = j * count + ((i + 1) % count);
        indices.push(a, b, a + count, b, b + count, a + count);
      }
    }
  }
  // Isolate cap normals from the side loop. Sharing the end fan would
  // darken the first pinstripe at every cuff, knee and jacket hem.
  for (const j of [0, layers]) {
    const row = rows[j === 0 ? 0 : rows.length - 1],
      center = vertices.length / 3;
    vertices.push(0, row[0], row[3] || 0);
    for (let i = 0; i < count; i++) {
      const k = (j * count + i) * 3;
      vertices.push(vertices[k], vertices[k + 1], vertices[k + 2]);
    }
    for (let i = 0; i < count; i++) {
      const a = center + 1 + i,
        b = center + 1 + ((i + 1) % count);
      if (j === 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function stroke(parent, mat, coords, w, facets = 7) {
  const path = new T.CatmullRomCurve3(coords.map((c) => vec(...c)));
  path.arcLengthDivisions = Math.max(12, coords.length * 6);
  return mesh(parent, new T.TubeGeometry(path, Math.max(4, coords.length * 2), w, Math.min(facets, 5)), mat);
}
// Tapered locks, brows and fingers have elliptical, continuously turning sections.
function sweep(parent, mat, coords, width, depth, thickEnd = 0.04) {
  const path = new T.CatmullRomCurve3(
    coords.map((c) => vec(...c)),
    false,
    'catmullrom',
    0.45,
  );
  path.arcLengthDivisions = coords.length * 8;
  const n = coords.length * 2,
    sides = 8,
    p = [],
    index = [];
  const frames = path.computeFrenetFrames(n, false);
  for (let i = 0; i <= n; i++) {
    const u = i / n,
      center = path.getPointAt(u);
    const scale = thickEnd + (1 - thickEnd) * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.48);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * tau;
      const v = center
        .clone()
        .addScaledVector(frames.normals[i], width * Math.cos(a) * scale)
        .addScaledVector(frames.binormals[i], depth * Math.sin(a) * scale);
      p.push(v.x, v.y, v.z);
      if (i < n) {
        const k = i * sides + j,
          next = i * sides + ((j + 1) % sides);
        index.push(k, next, k + sides, next, next + sides, k + sides);
      }
    }
  }
  for (const i of [0, n]) {
    const tip = path.getPointAt(i / n),
      center = p.length / 3;
    p.push(tip.x, tip.y, tip.z);
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j,
        b = i * sides + ((j + 1) % sides);
      if (i === 0) index.push(center, b, a);
      else index.push(center, a, b);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return mesh(parent, g, mat);
}
function panel(parent, mat, outline) {
  const poly = outline.map(([x, y]) => new T.Vector2(x, y));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(outline.flat(), 3));
  g.setIndex(T.ShapeUtils.triangulateShape(poly, []).flat());
  g.computeVertexNormals();
  return mesh(parent, g, mat);
}

// Iris, limbus, pupil, wet catchlight and sclera share one corneal dome.
// The iris remains embedded as the gaze shifts behind its anatomical lids.
function eyeSurface(parent) {
  const gaze = { value: new T.Vector2() };
  const mat = surface('#f7eee0', 0.36, { specularIntensity: 0.30 });
  const iris = new T.Color('#604021'),
    pupil = new T.Color('#190e0a'),
    catchlight = new T.Color('#fff9ec');
  mat.userData.blueprintId = 'sclera';
  mat.userData.finishInks = { iris, pupil, catchlight };
  mat.userData.blueprintSamples = [
    { id: 'sclera', xy: [0.014, 0.002], width: 0.002 },
    { id: 'iris', xy: [0.0076, -0.002], width: 0.0013 },
    { id: 'pupil', xy: [0.0007, 0.0016], width: 0.0015 },
    { id: 'catchlight', xy: [-0.0026, 0.00625], width: 0.0004 },
  ];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.eyeGaze = gaze;
    shader.uniforms.irisTint = { value: iris };
    shader.uniforms.pupilTint = { value: pupil };
    shader.uniforms.glintTint = { value: catchlight };
    shader.vertexShader =
      'varying vec2 eyePoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\neyePoint=position.xy;',
      );
    shader.fragmentShader =
      'uniform vec2 eyeGaze; uniform vec3 irisTint,pupilTint,glintTint; varying vec2 eyePoint;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 p=(eyePoint-eyeGaze-vec2(0.,.0009))/vec2(.0102,.0111);
      float r=length(p), a=atan(p.y,p.x), aa=max(.012,fwidth(r));
      float ray=.5+.5*sin(a*43.+sin(11.*a)*2.7+r*9.)*sin(a*17.-r*7.);
      float honey=(.46-.46*p.y)*(.66+.34*ray);
      vec3 iris=irisTint*(.54+.85*honey);
      iris*=.77+.23*smoothstep(.53,.76,r);
      iris=mix(iris,vec3(.022,.013,.009),smoothstep(.81,.98,r));
      iris=mix(pupilTint,iris,smoothstep(.52-aa,.52+aa,r));
      diffuseColor.rgb=mix(iris,diffuseColor.rgb,smoothstep(1.-aa,1.+aa,r));
      float c=1.-smoothstep(.080,.108,length(p-vec2(-.32,.40)));
      c+=.29*(1.-smoothstep(.044,.063,length(p-vec2(.30,-.34))));
      diffuseColor.rgb=mix(diffuseColor.rgb,glintTint,min(c,1.));`,
      );
  };
  mat.customProgramCacheKey = () => 'sippy-corneal-iris';
  ellipsoid(parent, mat, 0, 0, 0, 0.0196, 0.0162, 0.0084);
  return gaze.value;
}

// The two lids glide over the convex eye (including the iris), so a blink
// keeps the volume of the eyeball. Their lash edges are part of the same skin.
function eyelid(parent, skin, lash, upper, side) {
  const cols = 28,
    rows = 4,
    count = (cols + 1) * (rows + 1);
  const positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3);
  const geometry = new T.BufferGeometry(),
    index = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = j * (cols + 1) + i;
      if (upper) index.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
      else index.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
    }
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
  geometry.setIndex(index);
  const lid = mesh(parent, geometry, [lash, skin]);
  lid.frustumCulled = false;
  geometry.addGroup(0, cols * 6, 0);
  geometry.addGroup(cols * 6, index.length - cols * 6, 1);
  const offsets = [0, 0.047, 0.32, 0.68, 1];
  function sample(closure) {
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * 2 - 1,
        radius = Math.sqrt(Math.max(0, 1 - x * x));
      const seam = upper ? 0.61 - 0.71 * closure : -0.55 + 0.45 * closure;
      for (let j = 0; j <= rows; j++) {
        const f = offsets[j],
          tilt = 0.055 * side * x * (1 - f),
          y = radius * (T.MathUtils.lerp(seam, upper ? 1 : -1, f) + tilt);
        const k = (j * (cols + 1) + i) * 3;
        positions[k] = 0.02 * x;
        positions[k + 1] = 0.0168 * y;
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        positions[k + 2] = 0.00038 + 0.0091 * z;
        const nx = x / 0.02,
          ny = y / 0.0168,
          nz = z / 0.0091,
          length = Math.hypot(nx, ny, nz) || 1;
        normals[k] = nx / length;
        normals[k + 1] = ny / length;
        normals[k + 2] = nz / length;
      }
    }
  }
  const stops = 3;
  geometry.morphAttributes.position = [];
  geometry.morphAttributes.normal = [];
  for (let i = 1; i <= stops; i++) {
    sample(i / stops);
    geometry.morphAttributes.position.push(new T.Float32BufferAttribute(positions.slice(), 3));
    geometry.morphAttributes.normal.push(new T.Float32BufferAttribute(normals.slice(), 3));
  }
  sample(0);
  lid.updateMorphTargets();
  return (closure) => {
    const t = T.MathUtils.clamp(closure, 0, 1) * stops;
    for (let i = 0; i < stops; i++) lid.morphTargetInfluences[i] = Math.max(0, 1 - Math.abs(t - (i + 1)));
  };
}

function modelFaceFinish(material, g) {
  const face = material.clone();
  face.vertexColors = true;
  const colour = new T.Color(), pigments = [];
  const p = g.attributes.position;
  const flush = new T.Color('#edc5c3'), shade = new T.Color('#bfa998');
  const bell = (v, center, width) => Math.exp(-(((v - center) / width) ** 2));
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(p.getX(i)), y = p.getY(i), z = p.getZ(i);
    const front = T.MathUtils.smoothstep(z, 0.004, 0.044);
    const cheeks = bell(x, 0.037, 0.020) * bell(y, 0.060, 0.022);
    const tip = bell(x, 0, 0.012) * bell(y, 0.054, 0.011);
    const jaw = bell(y, 0.023, 0.025) * front;
    colour.setRGB(1, 1, 1).lerp(flush, (0.39 * cheeks + 0.28 * tip) * front).lerp(shade, 0.16 * jaw);
    pigments.push(colour.r, colour.g, colour.b);
  }
  g.setAttribute('color', new T.Float32BufferAttribute(pigments, 3));
  // Use resting face coordinates so pigment stays on the surface at all
  // angles, in Character Ref and Axon too, without a texture request.
  face.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 skinSite;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvec3 sipRest = position; skinSite = sipRest;',
    );
    shader.fragmentShader = 'varying vec3 skinSite;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      [
        '#include <color_fragment>',
        'vec2 freckles = skinSite.xy * 510.0;',
        'vec2 site = floor(freckles);',
        'float seed = fract(52.9829189*fract(dot(site,vec2(.06711056,.00583715))));',
        'vec2 spot = fract(vec2(seed*37.9,seed*117.37))*.54+.23;',
        'float r = length(fract(freckles)-spot);',
        'vec2 q=vec2((skinSite.y-.066)/.011,(abs(skinSite.x)-.027)/.036);',
        'float mask = exp(-dot(q,q));',
        'float soft = min(.18,max(.027,fwidth(r)));',
        'float speckle = (1.0-smoothstep(.16-soft,.16+soft,r));',
        'speckle *= step(seed,.30*mask)*smoothstep(.023,.045,skinSite.z);',
        'diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.63,.47,.37),speckle*.73);',
      ].join('\n'),
    );
  };
  face.customProgramCacheKey = () => 'sippy-face-pigment';
  return face;
}

export function buildSippy(rig, attachGroom) {
  attachExteriorProfile(rig, sippyExterior);
  const skin = surface('#dfa477', 0.62),
    blush = surface('#cd8e75', 0.65);
  const hair = surface('#2d1b16', 0.49, { specularIntensity: 0.36 }),
    black = surface('#5a3429', 0.61, { specularIntensity: 0.24 });
  const white = surface('#f5e5c5', 0.64),
    mouth = surface('#5a2b25', 0.56, { specularIntensity: 0.37 }),
    lip = surface('#be7c63', 0.58);
  const suit = surface('#39393c', 0.76),
    trousers = surface('#f1e1c0', 0.79),
    waistcoat = surface('#841e32', 0.78),
    lapel = surface('#1d1d24', 0.71),
    edge = lapel;
  const gold = surface('#c5a35b', 0.36, { metalness: 0.57 }),
    button = surface('#54565b', 0.46, { metalness: 0.45 }),
    leather = surface('#79132b', 0.7),
    welt = surface('#e7dac2', 0.69),
    saddle = surface('#884c19', 0.6),
    saddleEdge = surface('#aa723b', 0.59),
    cargoSeam = surface('#c2b18b', 0.76),
    knit = surface('#630b23', 0.83),
    pad = surface('#171721', 0.8);
  const enamel = surface('#f5e7d6', 0.39);
  for (const [id, mat] of Object.entries({
    skin,
    flush: blush,
    lips: lip,
    mouth,
    sclera: enamel,
    hair,
    pupil: black,
    quilt: suit,
    trousers,
    hoodie: waistcoat,
    binding: lapel,
    shirt: white,
    gold,
    metal: button,
    shoe: leather,
    sole: welt,
    leather: saddle,
    saddleEdge,
    cargoSeam,
    cuff: knit,
    pad,
  }))
    mat.userData.blueprintId = id;
  const head = rig.head,
    chest = rig.chest;
  quiltFinish(suit);
  const headSkin = group(head);
  headSkin.name = 'sippy-head';
  seatExplorerHead(rig, headSkin, { width: 0.128, depth: 0.111, baseWidth: 0.116,
    baseDepth: 0.104, height: 0.122, middle: 0.067, front: 0.003 });
  const cheekRows = [
    [0.006, 0.015, 0.018, 0.005],
    [0.012, 0.031, 0.031, 0.006],
    [0.025, 0.045, 0.039, 0.0035],
    [0.042, 0.051, 0.046, 0.001],
    [0.053, 0.0545, 0.049, 0],
    [0.067, 0.058, 0.052, 0],
    [0.080, 0.056, 0.050, -0.001],
    [0.094, 0.055, 0.051, -0.002],
    [0.107, 0.052, 0.045, -0.003],
    [0.119, 0.036, 0.032, -0.007],
    [0.128, 0.01, 0.01, -0.008],
  ];
  // Shape the cheek planes and the shallow orbit into the same continuous
  // surface as the jaw. A broad warm face sits beneath the raised brow bone.
  const cheekColumns = 72,
    faceShape = rings(cheekRows, cheekColumns);
  const facePos = faceShape.attributes.position;
  const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  for (let i = 0; i < facePos.count; i++) {
    const x = facePos.getX(i),
      ax = Math.abs(x),
      y = facePos.getY(i),
      z = facePos.getZ(i);
    const front = T.MathUtils.smoothstep(z, 0.001, 0.031),
      flank = bump(ax, 0.039, 0.017);
    const cheek = bump(y, 0.062, 0.017) * flank,
      jaw = bump(y, 0.028, 0.015) * bump(ax, 0.038, 0.017);
    const brow = bump(y, 0.088, 0.008) * bump(ax, 0.026, 0.020);
    const orbit = bump(y, 0.077, 0.013) * bump(ax, 0.026, 0.016);
    // Continuous facial relief across the nasal bridge, tip and philtrum.
    const dorsum = 0.0087 * bump(x, 0, 0.008) * bump(y, 0.066, 0.021);
    const tip = 0.0150 * bump(x, 0, 0.0086) * bump(y, 0.0525, 0.0083);
    const ala = 0.0064 * bump(ax, 0.0072, 0.0060) * bump(y, 0.0493, 0.0053);
    const philtrum = 0.0020 * bump(ax, 0.0036, 0.0028) * bump(y, 0.0395, 0.0060);
    facePos.setXYZ(
      i,
      x + Math.sign(x) * front * (0.0017 * cheek + 0.0012 * jaw),
      y,
      z +
        front *
          (0.0066 * cheek + 0.0051 * brow + 0.0024 * jaw - 0.0046 * orbit +
            dorsum + tip + ala + philtrum + 0.0040 * bump(y, 0.017, 0.011) * bump(x, 0, 0.015)),
    );
  }
  faceShape.computeVertexNormals();
  const skullMesh = mesh(headSkin, faceShape, modelFaceFinish(skin, faceShape));
  skullMesh.name = 'sippy-face-sculpt';
  skullMesh.userData.patternPiece = true;
  const expression = fitExpression(skullMesh, cheekColumns, mouth, enamel, lip);
  const orbitalRims = [];
  const neck = group(chest);
  neck.name = 'sippy-neck';
  for (const s of [-1, 1]) {
    const ear = ellipsoid(headSkin, skin, s * 0.055, 0.061, -0.001, 0.0115, 0.018, 0.0097);
    ear.rotation.z = -s * 0.21;
    ellipsoid(headSkin, blush, s * 0.061, 0.060, 0.0042, 0.0056, 0.0115, 0.0050);
    stroke(
      headSkin,
      skin,
      [
        [s * 0.061, 0.067, 0.009],
        [s * 0.056, 0.063, 0.01],
        [s * 0.059, 0.054, 0.011],
      ],
      0.0017,
    );
  }
  // Eyelid rims frame the iris; light catches the cornea independently of the gaze.
  const corneas = [];
  const gazes = [],
    lids = [],
    brows = [];
  for (const s of [-1, 1]) {
    const eyeX = s * 0.0244, eyeY = 0.0750;
    const eyeZ = expression.surfaceDepth(eyeX, eyeY) - 0.0023;
    const eye = group(headSkin, eyeX, eyeY, eyeZ);
    eye.rotation.y = s * 0.27;
    eye.rotation.z = s * 0.030;
    eye.scale.set(0.91, 0.84, 1.0);
    orbitalRims.push(expression.orbit(eye, skin, s));
    const gaze = eyeSurface(eye);
    corneas.unshift(eye.children.at(-1));
    lids.push(eyelid(eye, skin, black, true, s), eyelid(eye, skin, skin, false, s));
    gazes.push(gaze);
    const browX = s * 0.025, browY = 0.0945;
    const browZ = expression.surfaceDepth(browX, browY);
    const brow = group(headSkin, browX, browY, browZ);
    brow.name = 'sippy-brow-' + (s === 1 ? 'L' : 'R');
    brow.userData.dynamicPose = true;
    brows.push(brow);
    sweep(
      brow,
      hair,
      [[-0.015, -0.0035], [-0.009, .0001], [0.002, .0037], [.012, .0019], [.020, -.0027]]
        .map(([x, y]) => [x * s, y, expression.surfaceDepth(browX + x * s, browY + y) - browZ + 0.0023]),
      0.0035, 0.0028, 0.24,
    );
  }
  for (const s of [-1, 1]) {
    const x = s * 0.0065, y = 0.0478;
    const nostril = ellipsoid(headSkin, blush, x, y, expression.surfaceDepth(x, y), 0.0022, 0.0011, 0.0007);
    nostril.rotation.z = s * 0.31;
  }
  const materials = { skin, white, suit, waistcoat, lapel, trousers, edge, gold };
  const tailoring = cutExplorerLayers(rig, materials),
    tails = tailoring.tails;
  const exploreMats = {
    suit,
    trousers,
    waistcoat,
    lapel,
    white,
    gold,
    leather,
    welt,
    saddle,
    saddleEdge,
    cargoSeam,
    knit,
    pad,
    button,
  };
  buildExplorerHands(rig, skin);
  for (const side of ['L', 'R']) {
    fitLimb(tailoring, side, false, materials);
    fitLimb(tailoring, side, true, materials);
  }
  const explorer = outfitExplorer(rig, tailoring, exploreMats, {
    group,
    mesh,
    ellipsoid,
    rings,
    stroke,
    sweep,
    panel,
    vec,
  });
  const { pack, drawcord } = explorer;
  for (const node of [pack, drawcord, ...tails]) node.userData.dynamicPose = true;
  shapeExplorerCrown(rig, headSkin);
  const groom = attachGroom?.(headSkin);
  rig.groom = groom;
  rig.secondary ??= {};
  // Keep the actual face and collar surfaces available to the review tools.
  const faceSkin = headSkin.children
    .filter((part) => part === skullMesh || (part.isMesh && part.material === skin))
    .concat(orbitalRims);
  fitOpenings(tailoring)();
  fitHipSeams(tailoring);
  explorer.bakeFit();
  const g = tailoring.surfaces;
  const body = addExteriorShell(rig, skin.color);
  g.body = body.meshes;
  g['body-head'] = [skullMesh];
  tailoring.beneath('collar', 'body-head');
  tailoring.beneath('collar', 'body');
  const collarSkin = [
    ...tailoring.surfaces.collar,
    ...tailoring.surfaces['quilted-vest'],
    ...tailoring.surfaces['zipper-plackets'],
  ];
  rig.secondary.sippy = {
    tail: tails[0],
    pack,
    drawcord,
    faceSkin,
    collarSkin,
    neckSkin: [],
    upperBack: tailoring.surfaces['quilted-vest'],
    bodyParts: anatomyRegions(tailoring, neck),
  };
  const feature = (label, ...parts) => ({ label, parts });
  const edgeBinding = (mesh, start, count) => {
    const high = Array.from({ length: count }, (_, i) => start + i);
    return { mesh, vertices: { high, mobile: high.filter((_, i) => i % 2 === 0) } };
  };
  rig.blueprint = {
    groom: {
      label: 'Scalp-seated part and swept crown',
      get parts() { return groom ? [groom.group] : []; },
    },
    chin: feature('Mandibular skin under the laugh line', skullMesh),
    eyes: corneas.map((m, i) => feature('Corneal dome over the iris ' + (i ? 'R' : 'L'), m)),
    waist: feature('Top trouser-rise band', edgeBinding(g['trouser-rise'][0], 14 * rig.garments.hips.columns, rig.garments.hips.columns)),
    shoulders: ['L', 'R'].map((s) =>
      feature('Outer shoulder sleeve head ' + s, ...g['shoulder-' + s], g['sleeve-' + s][0]),
    ),
    knee: ['L', 'R'].map((s) =>
      feature('Patella equator ' + s, body.knees[s]),
    ),
    ankleCuff: ['L', 'R'].map((s) =>
      feature('Lower trouser cuff ' + s, edgeBinding(g['trousers-' + s][0], 0, rig.garments.hips.columns)),
    ),
  };
  const secondary = secondaryMotion(rig, './sippy-secondary.js', { groom, tails, pack, drawcord });
  return function animate(f) {
    const t = f.time;
    const cue = f.faceCue;
    const blinkTime = (t + 0.13) % 4.2,
      blink = blinkTime < 0.16 ? Math.sin((Math.PI * blinkTime) / 0.16) : 0;
    const focus = f.emote >= 0 ? Math.sin(Math.PI * f.emote) ** 0.8 : 0;
    const thinking = f.emote < 0 ? 0 : Math.exp(-((f.emote - 0.56) ** 2) / 0.01);
    const wink = cue?.wink ?? (f.emote < 0 ? 0 : Math.exp(-(((f.emote - 0.86) / 0.042) ** 2)));
    const curious = f.emote < 0 ? 0 : Math.exp(-(((f.emote - 0.22) / 0.13) ** 2));
    const rise = cue?.surprise ?? (f.state === 'jump' ? Math.min(1, 0.36 + Math.abs(f.vy) * 0.15) : 0);
    const laugh = f.state === 'run' ? 0.74 + 0.14 * Math.sin(f.phase * 2) : 0;
    const smiling = cue?.smile ?? Math.max(laugh, focus, 0.22 * Number(f.state === 'walk'));
    const concentrating = cue?.focus ?? thinking;
    const asymmetry = cue?.asymmetry ?? 0;
    expression.smile(smiling, concentrating, rise, asymmetry);

    for (let i = 0; i < 2; i++) {
      const close = Math.max(
        cue ? 0 : blink,
        concentrating * (i === 0 ? 0.31 : 0.24),
        i === 1 ? wink : 0,
        cue?.squint ?? laugh * 0.17,
        f.state === 'roll' ? 0.36 : 0,
      );
      lids[i * 2](close);
      lids[i * 2 + 1](close);
      const side = i === 0 ? -1 : 1;
      brows[i].position.y =
        0.0945 + 0.0036 * (cue?.browLift ?? focus) + 0.0027 * rise -
        0.0013 * concentrating + 0.0023 * side * asymmetry +
        (cue ? 0 : 0.0009 * Math.sin(t * 1.1 + i) + curious * (i === 0 ? 0.0028 : 0.0007));
      brows[i].rotation.z = side * (0.16 * concentrating - 0.10 * smiling) - 0.10 * asymmetry;

      gazes[i].y = cue ? 0.0026 * (cue.gazeY ?? 0) : -0.0018 * focus + 0.0009 * Math.sin(t * 0.85);
      gazes[i].x = cue ? 0.0026 * (cue.gazeX ?? 0) : 0.0016 * Math.sin(t * 0.67);
    }
    // Sippy raises his left wrist to check the time and glances toward the dial.
    const resting = 1 / (1 + f.speed * f.speed * 0.4);
    rig.upperArmL.rotation.z += 0.003 * resting;
    rig.upperArmR.rotation.z -= 0.003 * resting;
    rig.forearmL.rotation.x += 0.042 * resting - 1.3 * focus;
    rig.forearmR.rotation.x += 0.043 * resting;
    rig.upperArmL.rotation.x -= 0.47 * focus;
    rig.upperArmL.rotation.z += 0.092 * focus;
    rig.head.rotation.y += 0.32 * focus;
    rig.head.rotation.x += 0.18 * focus;
    for (let i = 0; i < tailoring.updates.length; i++) tailoring.updates[i]();
    secondary(f);
  };
}
