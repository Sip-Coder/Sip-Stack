import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { m, SCENE_M, scaleSpec } from './scale.js';
import { Sections, finish, mesh, tube, wind, tau } from './forms.js';

const material = (color, roughness = 0.78) =>
  new T.MeshStandardMaterial({ color, roughness, side: T.DoubleSide });
const rope = material('#a78b64'),
  oak = material('#9b7048'),
  iron = material('#4c5149'),
  canvas = material('#e4d6b4');
function plank(parent, w, h, d, x, y, z, m = oak) {
  const o = mesh(parent, new T.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}
// Merge immobile fittings once, keeping oars and occupants in independent frames.
export function batchParts(parent) {
  parent.updateMatrixWorld(true);
  const inverse = parent.matrixWorld.clone().invert(),
    bins = new Map();
  for (const o of [...parent.children]) {
    if (!o.isMesh) continue;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    if (!bins.has(o.material)) bins.set(o.material, []);
    bins.get(o.material).push(g);
    parent.remove(o);
    o.geometry.dispose();
  }
  for (const [m, parts] of bins) {
    mesh(parent, mergeGeometries(parts), m);
    for (const g of parts) g.dispose();
  }
}
let cargoPattern;
export function crate() {
  if (cargoPattern) return cargoPattern.clone(true);
  const g = new T.Group();
  // A 12-bottle wooden case, in metres, with its bottom on the load surface.
  const width = .50, height = .30, depth = .33, board = .021;
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      const y = .055 + row * .095;
      plank(g, width, .080, board, 0, y, side * (depth - board) / 2);
      plank(g, board, .080, depth - 2 * board, side * (width - board) / 2, y, 0);
    }
    for (const end of [-1, 1])
      plank(g, .028, height, .029, side * .214, height / 2, end * .129, iron);
  }
  plank(g, width - board, .024, depth - board, 0, .012, 0);
  batchParts(g);
  cargoPattern = g;
  return g.clone(true);
}
// The prop pose is authoritative. IK brings the palm to its socket, leaving
// the mass-spring lag independent of the arm that follows it.
export function basket(actor) {
  const socket=new T.Group(),g=new T.Group();actor.g.add(socket);socket.add(g);
  g.position.y=-.37;
  const grip={body:g,socket};
  grip.settle=()=>{
    const lag=actor.dynamics.lag;
    socket.position.set(-.176+lag[0],1.20+lag[1],.36+lag[2]);
    socket.rotation.z=-lag[0]*1.8;socket.rotation.x=lag[2]*1.8;
  };
  const reeds = new Sections(),
    fruit = new Sections();
  for (let i = 0; i < 11; i++) {
    const y = i * 0.018,
      r = 0.12 + y * 0.24;
    reeds.loft(
      [
        [y, r, r * 0.82],
        [y + 0.005, r + 0.006, r * 0.82 + 0.006],
        [y + 0.017, r + 0.003, r * 0.82 + 0.003],
      ],
      i % 2 ? '#ae8759' : '#ba9563',
      30,
    );
  }
  for (let i = 0; i < 13; i++) {
    const a = i * 2.399,
      r = 0.103 * Math.sqrt(i / 13),
      x = r * Math.sin(a),
      z = r * Math.cos(a);
    fruit.loft(
      [
        [0.164, 0.02, 0.023, x, z],
        [0.18, 0.041, 0.037, x, z],
        [0.21, 0.032, 0.028, x, z],
        [0.226, 0.008, 0.009, x, z],
      ],
      i % 3 ? '#674858' : '#796078',
      10,
    );
  }
  mesh(g, reeds.geometry(), finish('detail'));
  mesh(g, fruit.geometry(), finish('detail'));
  tube(
    g,
    [
      [-0.16, 0.19, 0],
      [-0.125, 0.31, 0],
      [0, 0.37, 0],
      [0.125, 0.31, 0],
      [0.16, 0.19, 0],
    ],
    0.014,
    rope,
  );
  scaleSpec(g, 'village', 'basket', [.365, .335, .272], 'Picking basket');
  return grip;
}
export function tastingGlass(actor, scene = 'village') {
  const goal=new T.Object3D(),g=new T.Group();
  actor.g.add(goal);goal.add(g);
  const toPerson = SCENE_M[scene] / actor.g.scale.y;
  g.scale.setScalar(toPerson);
  g.position.y=-.047 * toPerson;
  const profile = [
    [.032, 0], [.032, .005], [.004, .013], [.0035, .079],
    [.018, .085], [.034, .112], [.038, .143], [.029, .187],
  ];
  scaleSpec(g, scene, 'tasting glass', [.187, .076, .076], 'Held tasting glass');
  const glass = new T.MeshPhysicalMaterial({
    color: '#e0ebe3',
    roughness: 0.16,
    transparent: true,
    opacity: 0.49,
    side: T.DoubleSide,
    depthWrite: false,
  });
  mesh(
    g,
    new T.LatheGeometry(
      profile.map(([x, y]) => new T.Vector2(x, y)),
      24,
    ),
    glass,
  );
  const wine = new Sections();
  wine.loft(
    [
      [0.086, 0.016, 0.016],
      [0.11, 0.031, 0.031],
      [0.135, 0.036, 0.036],
    ],
    '#78263e',
    24,
  );
  mesh(g, wine.geometry(), finish('detail'));
  const wrists=[null,goal],lip=new T.Vector3(),head=actor.skeleton.bones.find(b=>b.name==='head');
  const taste=t=>{
    const sip=.5-.5*Math.cos(t*1.23),lag=actor.dynamics.lag;
    head.localToWorld(lip.set(.012,.047,.103));actor.g.worldToLocal(lip);
    goal.position.set(.205,1.11,.28);
    lip.y-=.119 * toPerson;lip.z+=.102 * toPerson;
    goal.position.lerp(lip,sip).x+=lag[0];
    goal.position.y+=lag[1];goal.position.z+=lag[2];
    goal.rotation.x=-.75*sip;actor.grasp(wrists);
  };
  taste.prop={object:g,radius:.038,center:new T.Vector3(0,.12,0),halfLength:.024};
  return taste;
}
function cutterPattern(color, stripe, sail) {
  const root = new T.Group(),
    hull = new T.Group();
  root.add(hull);
  const p = [],
    c = [],
    uv = [],
    idx = [];
  const bands = [
    [-0.115, 0.02, 'stripe'],
    [0.008, 0.44, 'stripe'],
    [0.111, 0.74, 'stripe'],
    [0.158, 0.82, 'paint'],
    [0.207, 0.88, 'stripe'],
    [0.239, 0.92, 'paint'],
    [0.287, 0.96, 'paint'],
    [0.35, 1, 'paint'],
    [0.375, 0.99, '#735137'],
    [0.366, 0.949, '#bc945f'],
    [0.28, 0.89, '#a57b52'],
    [0.18, 0.73, '#a27a52'],
    [0.09, 0.43, '#875f40'],
    [0.087, 0, '#7b593e'],
  ];
  const palette = {paint:color, stripe}, paintRanges=[], shellMaterial=finish('wood');
  for (const s of [-1, 1])
    for (let j = 1; j < bands.length; j++) {
      const n = p.length / 3,
        band = bands[j][2],
        tint = new T.Color(palette[band] ?? band);
      if (band in palette) paintRanges.push({ start:idx.length, count:32*6, band });
      for (let i = 0; i <= 32; i++)
        for (let k = 0; k < 2; k++) {
          const u = i / 16 - 1,
            [y, r] = bands[j - 1 + k],
            beam = 0.43 * (1 - Math.abs(u) ** 1.78);
          p.push(u * 1.1, y + 0.132 * Math.abs(u) ** 3, s * (0.008 + r * beam + (k === 1 ? 0.004 : 0)));
          c.push(tint.r, tint.g, tint.b);
          uv.push(i / 32, k);
          if (i && k === 1) {
            const a = n + i * 2;
            idx.push(a - 2, a - 1, a, a, a - 1, a + 1);
          }
        }
    }
  const g = new T.BufferGeometry();
  for (const [name, a, n] of [
    ['position', p, 3],
    ['uv', uv, 2],
    ['color', c, 3],
  ])
    g.setAttribute(name, new T.Float32BufferAttribute(a, n));
  g.setIndex(idx);
  g.computeVertexNormals();
  mesh(hull, g, shellMaterial);
  const seat = new T.Vector3();
  for (const x of [-0.58, -0.08, 0.46]) {
    const thwart = plank(hull, 0.16, 0.043, 0.76 * (1 - Math.abs(x) ** 1.78), x, 0.286, 0);
    if (x === -.08) seat.copy(thwart.position).y += thwart.geometry.parameters.height / 2;
  }
  const deckHeight = x => .204 + .094 * Math.abs(Math.round(x / .103) * .103) ** 3;
  // Bilge boards follow the waterplane right into the ends of the open hull.
  for (let i = -9; i <= 9; i++) {
    const x = i * 0.103,
      beam = 0.72 * (1 - Math.abs(x / 1.1) ** 1.78);
    plank(hull, 0.103, 0.026, beam, x, deckHeight(x) - .013, 0);
  }
  for (let i = 0; i < 3; i++) {
    const points = [];
    for (let k = 0; k <= 28; k++) {
      const a = (k * tau) / 28;
      points.push([
        0.48 + (0.075 + i * 0.012) * Math.cos(a),
        0.318 + i * 0.004,
        0.06 + (0.07 + i * 0.014) * Math.sin(a),
      ]);
    }
    tube(hull, points, 0.008, rope, 32);
  }
  if (sail) {
    plank(hull, 0.032, 1.53, 0.032, 0.1, 1.1, 0);
    plank(hull, 0.85, 0.029, 0.028, -0.29, 0.51, 0);
    for (const s of [-1, 1]) {
      const pp = [],
        ii = [],
        uu = [];
      for (let j = 0; j <= 12; j++)
        for (let i = 0; i <= 10; i++) {
          const v = j / 12,
            u = i / 10;
          pp.push(
            0.1 + s * u * (1 - v) * (s === 1 ? 0.82 : 0.94),
            0.5 + v * 1.29 + 0.069 * u * (1 - v),
            0.025 + 0.134 * Math.sin(Math.PI * u) * (1 - v),
          );
          uu.push(u, v);
          const a = j * 11 + i;
          if (j && i) ii.push(a - 12, a - 11, a, a - 12, a, a - 1);
        }
      const sailcloth = new T.BufferGeometry();
      sailcloth.setAttribute('position', new T.Float32BufferAttribute(pp, 3));
      sailcloth.setAttribute('uv', new T.Float32BufferAttribute(uu, 2));
      sailcloth.setIndex(ii);
      sailcloth.computeVertexNormals();
      mesh(hull, sailcloth, canvas);
      tube(
        hull,
        [
          [s * 0.99, 0.45, 0],
          [s * 0.55, 1.02, 0.01],
          [0.1, 1.82, 0],
        ],
        0.007,
        rope,
      );
    }
  }
  // Raised locks leave space for the rower's knees beneath the return stroke.
  for(const sign of [-1,1]) plank(hull,.055,.061,.058,-.025,.390,sign*.402);
  batchParts(hull);
  for (const s of [-1, 1]) {
    const lock = new T.Group();
    lock.position.set(-.025, .410, s * .393);
    root.add(lock);
    const stick = new Sections();
    stick.loft(
      [
        [-0.227, 0.022, 0.023],
        [-0.165, 0.021, 0.023],
        [0.32, 0.016, 0.017],
        [0.46, 0.019, 0.023],
        [0.57, 0.024, 0.056],
        [0.91, 0.021, 0.073],
        [0.95, 0.009, 0.052],
      ],
      '#b99562',
      12,
      0,
      ([x, y, z]) => [z, x, s * y],
    );
    mesh(lock, stick.geometry(), finish('wood'));
    const grip = new T.Object3D();
    grip.position.z = -s * .201;
    lock.add(grip);
    grip.name = 'Oar grip';
  }
  const paintKey = JSON.stringify([color,stripe]);
  const shell = hull.children.find(part=>part.material===shellMaterial);
  shell.name='Painted planking';
  return {root, seat, deckHeight, paintRanges, shells:new Map([[paintKey,shell.geometry]])};
}

const cutterPatterns = new Map();
export function cutter(color, stripe, sail = false, scene = 'village') {
  // A boat gets its own complete transform hierarchy, including two oarlocks
  // and two grip sockets. The mould, fixed fittings and oar geometry are shared.
  if (!cutterPatterns.has(sail)) cutterPatterns.set(sail,cutterPattern(color,stripe,sail));
  const pattern = cutterPatterns.get(sail), root = pattern.root.clone(true);
  const shell = root.getObjectByName('Painted planking'), paintKey = JSON.stringify([color,stripe]);
  if (!pattern.shells.has(paintKey)) {
    const source = shell.geometry, painted = new T.BufferGeometry();
    for (const [name,attribute] of Object.entries(source.attributes)) painted.setAttribute(name,attribute);
    const colors = source.attributes.color.clone();
    const shades = {paint:new T.Color(color),stripe:new T.Color(stripe)};
    for (const {start,count,band} of pattern.paintRanges) {
      const shade=shades[band];
      for(let i=start;i<start+count;i++) colors.setXYZ(i,shade.r,shade.g,shade.b);
    }
    painted.setAttribute('color',colors);
    pattern.shells.set(paintKey,painted);
  }
  shell.geometry = pattern.shells.get(paintKey);
  // The common hull mould is 2.2 pattern units between the bow and stern.
  const length = scene === 'creek' ? 2.4 : scene === 'tidelight' ? 4.4 : 3.67;
  const oarLength = scene === 'creek' ? 1.9 : scene === 'tidelight' ? 2.35 : 1.96;
  root.scale.setScalar(m(scene, length) / 2.2);
  const beam = scene === 'creek' ? 0.95 : scene === 'tidelight' ? 1.70 : 1.43;
  scaleSpec(shell, scene, 'boat', [null, length, beam], 'Cutter hull');
  const seat=pattern.seat.clone(), deckHeight=pattern.deckHeight;
  const oars=root.children.slice(1), grips=oars.map(lock=>lock.getObjectByName('Oar grip'));
  for (let i = 0; i < oars.length; i++) {
    const lock = oars[i];
    lock.scale.z = m(scene, oarLength) / (1.177 * root.scale.z);
    scaleSpec(lock.children[0], scene, 'oar', [null, null, oarLength], i ? 'Starboard oar' : 'Port oar');
  }
  function stroke(t, active) {
    for (let i = 0; i < 2; i++) {
      const s = i * 2 - 1;
      oars[i].rotation.set(
        active ? s * (0.12 + 0.26 * Math.cos(t * 2)) : s * 0.075,
        active ? s * (0.55 * Math.sin(t * 2)) : s * 1.04,
        0,
        'YXZ',
      );
    }
  }
  stroke(0, false);
  const shafts=oars.map((lock,i)=>({object:lock,radius:.027,axis:'z',center:new T.Vector3(0,0,(2*i-1)*.3615),halfLength:.5885}));
  return { root, stroke, grips, seat, shafts, deckHeight };
}
// Sample the water under bow, stern, port and starboard in hull coordinates.
export function floatHull(g, t, height, weather = 0, offset = 0) {
  const a = g.rotation.y,
    c = Math.cos(a),
    s = Math.sin(a),
    { x, z } = g.position;
  const fore = height(x + c * 0.84, z - s * 0.84, t, weather),
    aft = height(x - c * 0.84, z + s * 0.84, t, weather);
  const port = height(x - s * 0.33, z - c * 0.33, t, weather),
    star = height(x + s * 0.33, z + c * 0.33, t, weather);
  g.position.y = (fore + aft + port + star) * 0.25 + offset;
  g.rotation.order = 'YXZ';
  g.rotation.z = Math.atan2(fore - aft, 1.68);
  g.rotation.x = -Math.atan2(star - port, 0.66);
}
export function clothPanel(w, h, color, axis = 'hem') {
  const geo = new T.PlaneGeometry(w, h, 10, 7),
    pos = geo.attributes.position;
  const rest = pos.array.slice(),
    normal = geo.attributes.normal,
    m = material(color),
    o = new T.Mesh(geo, m);
  o.castShadow = o.receiveShadow = true;
  o.userData.billow = (t, x, z) => {
    const gust = wind(t, x, z);
    for (let i = 0; i < pos.count; i++) {
      const k = i * 3,
        u = rest[k] / w + 0.5,
        v = 0.5 - rest[k + 1] / h,
        weight = axis === 'flag' ? u : v;
      const angle = u * 11 + v * 2 - t * 2,
        ripple = 0.036 * Math.sin(angle),
        slope = 0.036 * Math.cos(angle);
      const size = axis === 'flag' ? w : h,
        displacement = 0.12 * gust + ripple;
      pos.setZ(i, weight * displacement * size);
      const dx = (size / w) * (weight * 11 * slope + (axis === 'flag' ? displacement : 0));
      const dy = (-size / h) * (weight * 2 * slope + (axis === 'hem' ? displacement : 0));
      const inv = 1 / Math.hypot(dx, dy, 1);
      normal.setXYZ(i, -dx * inv, -dy * inv, inv);
    }
    pos.needsUpdate = normal.needsUpdate = true;
  };
  return o;
}

// The fill meshes start at the bottoms of their bowls.
export function tableService(scene, x = -6.6, top = 1.1 + m('village', 0.75), z = 0.5) {
  const service = new T.Group();
  service.name = 'Cantina table service';
  service.position.set(x, top, z);
  service.scale.setScalar(SCENE_M.village);
  scene.add(service);
  const glass = new T.MeshPhysicalMaterial({
    color: '#dce9df',
    roughness: 0.13,
    clearcoat: 1,
    transparent: true,
    opacity: 0.3,
    side: T.DoubleSide,
    depthWrite: false,
  });
  function turn(profile, x, y, z, surface) {
    const shape = profile.map(([radius, height]) => new T.Vector2(radius, height));
    const object = mesh(service, new T.LatheGeometry(shape, 32), surface);
    object.position.set(x, y, z);
    object.castShadow = !surface.transparent;
    return object;
  }
  // Profiles and offsets are metres in the tabletop frame. The solid glasses
  // keep their original dimensions while the controls vary their liquid depth.
  const tumbler = turn(
    [
      [0.03, 0],
      [0.032, 0.004],
      [0.0375, 0.106],
      [0.037, 0.11],
      [0.034, 0.108],
      [0.032, 0.013],
      [0.03, 0.007],
    ],
    -0.15,
    0,
    0.035,
    glass,
  );
  scaleSpec(tumbler, 'village', 'tumbler', [0.11, 0.075, 0.075], 'Cantina water tumbler');
  const wf = turn(
    [
      [0.001, 0],
      [0.03, 0.003],
      [0.034, 0.08],
      [0.033, 0.082],
      [0.001, 0.08],
    ],
    -0.15,
    0.008,
    0.035,
    new T.MeshPhysicalMaterial({
      color: '#b1d8d9',
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      clearcoat: 0.5,
    }),
  );
  const stemmed = turn(
    [
      [0.001, 0],
      [0.0375, 0.0015],
      [0.036, 0.0035],
      [0.007, 0.007],
      [0.0035, 0.012],
      [0.0035, 0.087],
      [0.008, 0.095],
      [0.027, 0.108],
      [0.0425, 0.142],
      [0.0415, 0.164],
      [0.0325, 0.21],
      [0.0305, 0.21],
      [0.0395, 0.164],
      [0.04, 0.142],
      [0.025, 0.11],
      [0.007, 0.099],
    ],
    0.15,
    0,
    -0.035,
    glass,
  );
  scaleSpec(stemmed, 'village', 'wine glass', [0.21, 0.085, 0.085], 'Cantina stemmed glass');
  const wine = turn(
    [
      [0.001, 0],
      [0.007, 0.003],
      [0.024, 0.016],
      [0.038, 0.044],
      [0.038, 0.046],
      [0.001, 0.045],
    ],
    0.15,
    0.099,
    -0.035,
    new T.MeshPhysicalMaterial({ color: '#6b213c', roughness: 0.18, clearcoat: 0.67 }),
  );
  const bottle = turn(
    [
      [0.032, 0],
      [0.0365, 0.006],
      [0.0375, 0.017],
      [0.0375, 0.194],
      [0.033, 0.212],
      [0.015, 0.233],
      [0.0116, 0.281],
      [0.0135, 0.286],
      [0.0135, 0.3],
      [0.01, 0.3],
    ],
    -0.015,
    0,
    0.175,
    new T.MeshPhysicalMaterial({ color: '#324433', roughness: 0.23, clearcoat: 0.74 }),
  );
  scaleSpec(bottle, 'village', 'bottle', [0.3, 0.075, 0.075], 'Cantina wine bottle');
  const label = mesh(bottle, new T.CylinderGeometry(0.0377, 0.0377, 0.074, 32, 1, true), material('#cdbfa5'));
  label.position.y = 0.1;
  const carafe = turn(
    [
      [0.043, 0],
      [0.052, 0.01],
      [0.06, 0.06],
      [0.058, 0.112],
      [0.04, 0.152],
      [0.024, 0.183],
      [0.024, 0.231],
      [0.033, 0.247],
      [0.032, 0.25],
      [0.029, 0.249],
      [0.021, 0.231],
    ],
    -0.015,
    0,
    -0.165,
    glass,
  );
  scaleSpec(carafe, 'village', 'carafe', [0.25, 0.12, 0.12], 'Cantina carafe');
  // Both glass profiles end at their inner floor. Fit every liquid ring inside
  // that same wall as the level moves up the taper, including a partial pour.
  function fillControl(liquid, vessel) {
    const rings = liquid.geometry.parameters.points;
    const wall = vessel.geometry.parameters.points;
    return level => {
      let width = 1;
      for (const ring of rings) {
        const height = liquid.position.y + ring.y * level;
        let i = wall.length - 1;
        while (i > 1 && wall[i - 1].y < height) i--;
        const low = wall[i], high = wall[i - 1];
        const radius = T.MathUtils.lerp(low.x, high.x, (height - low.y) / (high.y - low.y));
        width = Math.min(width, (0.985 * radius) / ring.x);
      }
      liquid.scale.set(width, level, width);
      liquid.visible = level > 0.010001;
    };
  }
  const setWater = fillControl(wf, tumbler);
  const setWine = fillControl(wine, stemmed);
  setWater(0.01);
  setWine(0.01);
  bottle.visible = false;
  return { wf, wine, bottle, setWater, setWine };
}
