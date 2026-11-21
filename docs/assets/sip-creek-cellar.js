import { batchStaticMeshes } from '../life/static-batches.js';
import { SCENE_M, m, scaleSpec } from '../life/scale.js';
import { inspectCask } from '../life/tasks.js';
import * as T from 'three';
import { ground, tau } from './sip-creek-land.js';

import { peopleNav } from '../life/nav.js';
import { worker } from '../life/people.js';
import { wind } from '../life/forms.js';
export function cellar(scene, wood, rng) {
  const station = new T.Group();
  station.position.set(3.8, ground(3.8, -14), -14);
  station.rotation.y = -0.52;
  scene.add(station);
  const nav = peopleNav(station, '.creek-stage');
  const standard = (color, roughness, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const iron = standard('#474440', 0.49, 0.72),
    bronze = standard('#896a3c', 0.42, 0.66),
    endgrain = standard('#ad8356', 0.82);
  function mesh(parent, g, m, x, y, z) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(parent, x, y, z, w, h, d, m = wood) {
    return mesh(parent, new T.BoxGeometry(w, h, d), m, x, y, z);
  }
  const metalRing = (parent, y, r, h) =>
    mesh(parent, new T.CylinderGeometry(r, r, h, 56, 1, true), iron, 0, y, 0);
  // A 225 L Bordeaux barrique, measured at the outer staves. Barrel-local Y
  // follows the stave grain. The same profile supplies both render and contact.
  const metres = (n) => m('creek', n);
  const deckY = 0.023 + 0.15 / 2;
  const halfLength = 0.475,
    bellyRadius = 0.35,
    inspectAxisHeight = 0.596;
  const profile = [
    [-halfLength, 0.273],
    [-0.406, 0.296],
    [-0.244, 0.33],
    [0, bellyRadius],
    [0.244, 0.33],
    [0.406, 0.296],
    [halfLength, 0.273],
  ];
  function cask(x, z, lying) {
    const y = deckY + metres(lying ? inspectAxisHeight : halfLength);
    const scale = SCENE_M.creek;
    const barrel = new T.Group();
    barrel.position.set(x, y, z);
    barrel.scale.setScalar(scale);
    if (lying) barrel.rotation.x = Math.PI / 2;
    station.add(barrel);
    const vertices = [],
      colors = [],
      indices = [],
      color = new T.Color();
    for (let k = 0; k < 30; k++) {
      const lo = (k * tau) / 30 + 0.005,
        hi = ((k + 1) * tau) / 30 - 0.005,
        start = vertices.length / 3;
      color.setScalar(0.72 + 0.34 * rng());
      for (const [yy, r] of profile)
        for (const a of [lo, hi]) {
          vertices.push(r * Math.sin(a), yy, r * Math.cos(a));
          colors.push(color.r, color.g, color.b);
        }
      for (let j = 0; j < profile.length - 1; j++) {
        const a = start + j * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const staves = new T.BufferGeometry();
    staves.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    staves.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    staves.setIndex(indices);
    staves.computeVertexNormals();
    const staveWood = wood.clone();
    staveWood.onBeforeCompile = wood.onBeforeCompile;
    staveWood.customProgramCacheKey = wood.customProgramCacheKey;
    staveWood.vertexColors = true;
    const staveMesh = mesh(barrel, staves, staveWood, 0, 0, 0);
    scaleSpec(
      staveMesh,
      'creek',
      'barrel',
      lying ? [0.7, 0.7, 0.95] : [0.95, 0.7, 0.7],
      lying ? 'Lying inspection barrique' : 'Standing tasting barrique',
    );
    staveMesh.userData.scaleFrame = station;
    mesh(barrel, new T.CylinderGeometry(0.269, 0.269, 0.93, 56), endgrain, 0, 0, 0);
    for (const [yy, r] of [
      [-0.425, 0.295],
      [-0.269, 0.33],
      [-0.094, 0.347],
      [0.094, 0.347],
      [0.269, 0.33],
      [0.425, 0.295],
    ]) {
      metalRing(barrel, yy, r, 0.035);
    }
    if (!lying)
      for (const offset of [-0.17, -0.07, 0.046, 0.16]) {
        const length = 2 * Math.sqrt(0.258 ** 2 - offset ** 2);
        box(barrel, offset, 0.466, 0, 0.003, 0.002, length, iron);
      }
    const belly = Math.max(...profile.map((p) => p[1])) * scale,
      end = profile.at(-1)[0] * scale;
    const obstacle = lying
      ? nav.box('inspection cask', x, z, belly, end, y - belly, y + belly)
      : nav.circle('standing cask', x, z, belly, y - end, y + end);
    obstacle.stave = { profile, scale, lying, y };
    barrel.userData.staveSurface = obstacle;
    return barrel;
  }
  // The downhill edge of the small cooper's platform rests on stone footings.
  nav.surface(
    'cooper platform',
    -3.35 / 2,
    3.35 / 2,
    -1.1 - 0.158 / 2,
    -1.1 + 13 * 0.17 + 0.158 / 2,
    0.023 + 0.15 / 2,
  );
  for (let j = 0; j < 14; j++) {
    const plank = box(station, 0, 0.023, -1.1 + j * 0.17, 3.35, 0.15, 0.158);
    scaleSpec(plank, 'creek', 'platform plank', [0.16, 3.65, 0.17], 'Cooper platform timber ' + (j + 1));
  }
  // Two saddle blocks support the underside at the radius of their own
  // stave cross-section. Their wider feet bear directly on the platform.
  const cradle = new T.Group();
  cradle.position.set(-0.42, deckY, 0);
  cradle.scale.setScalar(SCENE_M.creek);
  station.add(cradle);
  for (const z of [-0.115, 0.115]) {
    const edge = Math.abs(z) - 0.035;
    const r = T.MathUtils.lerp(bellyRadius, 0.33, edge / 0.244);
    const shape = new T.Shape();
    shape.moveTo(-0.31, 0);
    shape.lineTo(0.31, 0);
    shape.lineTo(0.31, 0.135);
    shape.lineTo(0.104, 0.135);
    for (let i = 0; i <= 12; i++) {
      const x = 0.104 - (i * 0.208) / 12;
      shape.lineTo(x, inspectAxisHeight - Math.sqrt(r * r - x * x));
    }
    shape.lineTo(-0.104, 0.135);
    shape.lineTo(-0.31, 0.135);
    shape.closePath();
    mesh(cradle, new T.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false }), wood, 0, 0, z - 0.035);
    nav.box(
      'cask cradle',
      cradle.position.x,
      metres(z),
      metres(0.31),
      metres(0.035),
      deckY,
      deckY + metres(0.269),
    );
  }
  scaleSpec(cradle, 'creek', 'cask cradle', [0.27, 0.62, 0.3], 'Cooper’s saddle cradle');
  const main = cask(-0.42, 0, true);
  const upright = cask(1.08, -0.51, false);
  const label = document.createElement('canvas');
  label.width = label.height = 512;
  const c = label.getContext('2d');
  const face = c.createImageData(512, 512);
  // Each scanline crosses six planks. The end-grain centre and low
  // frequency bend are constant across the width of each plank.
  for (let y = 0; y < 512; y++) {
    for (let plank = 0; plank < 6; plank++) {
      const start = plank * 94 - 15,
        end = Math.min(512, start + 94);
      const slowBend = 3.8 * Math.sin(y * 0.008 + plank);
      const dy = (y - 188 - plank * 96) * 0.24;
      for (let x = Math.max(0, start); x < end; x++) {
        const u = x - start;
        const bend = slowBend + 2.3 * Math.sin(y * 0.024 + x * 0.008);
        const pores = Math.sin((x + bend) * 1.17) + 0.6 * Math.cos(x * 0.38 + y * 0.013 + plank);
        const rings = Math.sin(Math.hypot((x + plank * 34) * 0.83, dy) * 0.45);
        const seam = u < 2 ? -0.32 : u < 4 ? 0.06 : 0;
        const tone = 0.88 + plank * 0.021 + 0.026 * pores + 0.029 * rings + 0.085 * rng() + seam;
        const i = (y * 512 + x) * 4;
        face.data[i] = 181 * tone;
        face.data[i + 1] = 144 * tone;
        face.data[i + 2] = 98 * tone;
        face.data[i + 3] = 255;
      }
    }
  }
  c.putImageData(face, 0, 0);
  c.translate(256, 256);
  c.strokeStyle = c.fillStyle = '#483421';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(0, 0, 185, 0, tau);
  c.stroke();
  c.textAlign = 'center';
  c.font = '29px Georgia';
  c.fillText('S I P   C R E E K', 0, -74);
  c.font = 'italic 42px Georgia';
  c.fillText('Estate', 0, 61);
  c.font = '19px Georgia';
  c.fillText('W A T E R   T O   W I N E', 0, 106);
  for (let row = 0; row < 4; row++)
    for (let j = 0; j < 4 - row; j++) {
      c.beginPath();
      c.arc((j - (3 - row) / 2) * 17, -47 + row * 15, 8.5, 0, tau);
      c.fill();
    }
  const ink = new T.DataTexture(c.getImageData(0, 0, 512, 512).data, 512, 512);
  ink.flipY = true;
  ink.colorSpace = T.SRGBColorSpace;
  ink.generateMipmaps = true;
  ink.minFilter = T.LinearMipmapLinearFilter;
  ink.magFilter = T.LinearFilter;
  ink.needsUpdate = true;
  const seal = mesh(
    main,
    new T.CircleGeometry(0.267, 64),
    new T.MeshStandardMaterial({ map: ink, roughness: 0.79, polygonOffset: true, polygonOffsetFactor: -1 }),
    0,
    0.467,
    0,
  );
  seal.rotation.x = -Math.PI / 2;
  seal.castShadow = false;
  const tap = mesh(main, new T.CylinderGeometry(0.025, 0.028, 0.1, 12), bronze, 0, 0.51, 0.177);
  box(tap, 0, 0.027, -0.037, 0.103, 0.019, 0.021, bronze);
  // Two tasting stems on the standing cask, each with a separate dark-red meniscus.
  const glass = new T.MeshPhysicalMaterial({
    color: '#d9e7df',
    metalness: 0.08,
    roughness: 0.13,
    transparent: true,
    opacity: 0.33,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const wine = new T.MeshPhysicalMaterial({ color: '#660d2e', roughness: 0.3, clearcoat: 0.16 });
  const lidY = upright.position.y + metres(0.467);
  for (const [i, dx] of [-0.128, 0.124].entries()) {
    const stem = new T.Group();
    stem.position.set(upright.position.x + metres(dx), lidY, upright.position.z + metres(0.055));
    stem.scale.setScalar(SCENE_M.creek);
    station.add(stem);
    const profile = [
      [0.0375, 0],
      [0.0375, 0.003],
      [0.007, 0.008],
      [0.004, 0.013],
      [0.004, 0.087],
      [0.014, 0.093],
      [0.035, 0.11],
      [0.0425, 0.143],
      [0.039, 0.181],
      [0.032, 0.21],
    ];
    mesh(
      stem,
      new T.LatheGeometry(
        profile.map(([r, y]) => new T.Vector2(r, y)),
        32,
      ),
      glass,
      0,
      0,
      0,
    );
    mesh(stem, new T.CylinderGeometry(0.039, 0.026, 0.04, 24), wine, 0, 0.129, 0);
    scaleSpec(stem, 'creek', 'wine glass', [0.21, 0.085, 0.085], 'Cellar tasting glass ' + (i + 1));
  }
  const bottle = new T.MeshPhysicalMaterial({
    color: '#303c25',
    roughness: 0.2,
    metalness: 0.08,
    clearcoat: 0.75,
  });
  const bottleRoot = new T.Group();
  bottleRoot.position.set(upright.position.x + metres(0.035), lidY, upright.position.z - metres(0.115));
  bottleRoot.scale.setScalar(SCENE_M.creek);
  station.add(bottleRoot);
  const bottleProfile = [
    [0.03, 0],
    [0.0375, 0.014],
    [0.0375, 0.176],
    [0.035, 0.19],
    [0.014, 0.218],
    [0.012, 0.282],
    [0.015, 0.285],
    [0.015, 0.3],
  ];
  mesh(
    bottleRoot,
    new T.LatheGeometry(
      bottleProfile.map(([r, y]) => new T.Vector2(r, y)),
      32,
    ),
    bottle,
    0,
    0,
    0,
  );
  mesh(bottleRoot, new T.CylinderGeometry(0.0378, 0.0378, 0.081, 32), standard('#c2b38d', 0.82), 0, 0.097, 0);
  scaleSpec(bottleRoot, 'creek', 'bottle', [0.3, 0.075, 0.075], 'Cellar tasting bottle');
  nav.box('lamp post', -1.39, -0.59, 0.055, 0.055, 0.025, 2.075);
  scaleSpec(
    box(station, -1.39, 1.05, -0.59, 0.11, metres(2.23), 0.11),
    'creek',
    'lamp post',
    [2.23, null, null],
    'Cooper platform lamp',
  );
  box(station, -1.19, 2.06, -0.59, 0.52, 0.08, 0.1);
  const lamp = standard('#ffde9c', 0.42);
  lamp.emissive.set('#ffbc65');
  const lx = -0.99,
    ly = 1.76,
    lz = -0.59;
  const hanger = new T.Group();
  station.add(hanger);
  mesh(hanger, new T.CylinderGeometry(0.016, 0.016, 0.16, 8), iron, lx, 1.98, lz);
  mesh(hanger, new T.CylinderGeometry(0.095, 0.19, 0.11, 4), iron, lx, ly + 0.14, lz).rotation.y = Math.PI / 4;
  scaleSpec(
    box(hanger, lx, ly, lz, 0.205, 0.21, 0.205, lamp),
    'creek',
    'lantern',
    [0.22, 0.22, 0.22],
    'Copper lantern glazing',
  );
  box(hanger, lx, ly - 0.13, lz, 0.28, 0.046, 0.28, iron);
  for (const dx of [-0.11, 0.11])
    for (const dz of [-0.11, 0.11]) box(hanger, lx + dx, ly, lz + dz, 0.024, 0.23, 0.024, iron);
  hanger.position.set(lx, 2.03, lz);
  for (const part of hanger.children) part.position.sub(hanger.position);
  // The lantern swings around its own pivot. All the cooper's wood, iron
  // bands and furnishings are rigid relative to the platform, including
  // the casks themselves; their measurement frames remain in place.
  batchStaticMeshes(hanger);
  batchStaticMeshes(station, { exclude: new Set([hanger]), worldSpaceMaterials: new Set([wood]) });
  const cooper = worker(station, 7, SCENE_M.creek, 'Cooper');
  nav.place(cooper, 0.215, 0, -Math.PI / 2);
  // Keep the stave working arc in comfortable reach for this cooper's stature.
  // The foot solver bends the knees around the two planted soles.
  const workTop = main.position.y + metres(bellyRadius) - deckY;
  cooper.g.userData.inspectLowering = Math.max(0, 0.99 - workTop / cooper.g.scale.y);
  const touchStaves = inspectCask(cooper, main);
  const glow = new T.PointLight('#ffbd72', 4, 8, 2);
  glow.position.set(lx, ly + 0.02, lz + 0.2);
  station.add(glow);
  function light(night) {
    glow.intensity = night ? 15 : 1.1;
    lamp.emissiveIntensity = night ? 4.3 : 0.04;
  }
  return {
    light,
    nav,
    update(t, camera, mobile, high = true) {
      nav.begin(t);
      cooper.pose(t, 'inspect', nav.floor);
      touchStaves(t);
      cooper.lod(camera, mobile, true, high);
      nav.draw();
      hanger.rotation.z = wind(t, 3.8, -14) * 0.059;
    },
  };
}
