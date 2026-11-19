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
  const nav=peopleNav(station,'.creek-stage');
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
  function cask(x, y, z, scale, lying) {
    const barrel = new T.Group();
    barrel.position.set(x, y, z);
    barrel.scale.setScalar(scale);
    if (lying) barrel.rotation.x = Math.PI / 2;
    station.add(barrel);
    const profile = [
      [-0.76, 0.48],
      [-0.65, 0.52],
      [-0.39, 0.58],
      [0, 0.615],
      [0.39, 0.58],
      [0.65, 0.52],
      [0.76, 0.48],
    ];
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
    mesh(barrel, staves, staveWood, 0, 0, 0);
    mesh(barrel, new T.CylinderGeometry(0.472, 0.472, 1.48, 56), endgrain, 0, 0, 0);
    for (const [yy, r] of [
      [-0.68, 0.52],
      [-0.43, 0.582],
      [-0.15, 0.614],
      [0.15, 0.614],
      [0.43, 0.582],
      [0.68, 0.52],
    ]) {
      metalRing(barrel, yy, r, 0.058);
    }
    if (!lying)
      for (const offset of [-0.3, -0.12, 0.08, 0.28]) {
        const length = 2 * Math.sqrt(0.46 ** 2 - offset ** 2);
        box(barrel, offset, 0.743, 0, 0.006, 0.004, length, iron);
      }
    const belly=Math.max(...profile.map(p=>p[1]))*scale, end=profile.at(-1)[0]*scale;
    const obstacle=lying ? nav.box('inspection cask',x,z,belly,end,y-belly,y+belly)
      : nav.circle('standing cask',x,z,belly,y-end,y+end);
    obstacle.stave={profile,scale,lying,y};
    barrel.userData.staveSurface=obstacle;
    return barrel;
  }
  // The downhill edge of the small cooper's platform rests on stone footings.
  nav.surface('cooper platform',-3.35/2,3.35/2,-1.1-.158/2,-1.1+13*.17+.158/2,.023+.15/2);
  for (let j = 0; j < 14; j++) box(station, 0, 0.023, -1.1 + j * 0.17, 3.35, 0.15, 0.158);
  for (const z of [-0.54, 0.49]) {
    nav.box('cask cradle',-.42,z,.65,.085,.13,.70);
    box(station, -0.42, 0.3, z, 1.23, 0.33, 0.17);
    for (const side of [-1, 1])
      box(station, -0.42 + side * 0.47, 0.45, z, 0.16, 0.45, 0.17).rotation.z = -side * 0.42;
  }
  const main = cask(-0.42, 1.04, 0, 1.1, true);
  cask(1.08, 0.71, -0.51, 0.83, false);
  const label = document.createElement('canvas');
  label.width = label.height = 512;
  const c = label.getContext('2d');
  const face = c.createImageData(512, 512);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const plank = Math.floor((x + 15) / 94),
        u = (x + 15) % 94;
      const bend = 3.8 * Math.sin(y * 0.008 + plank) + 2.3 * Math.sin(y * 0.024 + x * 0.008);
      const pores = Math.sin((x + bend) * 1.17) + 0.6 * Math.cos(x * 0.38 + y * 0.013 + plank);
      const rings = Math.sin(Math.hypot((x + plank * 34) * 0.83, (y - 188 - plank * 96) * 0.24) * 0.45);
      const seam = u < 2 ? -0.32 : u < 4 ? 0.06 : 0;
      const tone = 0.88 + plank * 0.021 + 0.026 * pores + 0.029 * rings + 0.085 * rng() + seam;
      const i = (y * 512 + x) * 4;
      face.data.set([181 * tone, 144 * tone, 98 * tone, 255], i);
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
    new T.CircleGeometry(0.469, 64),
    new T.MeshStandardMaterial({ map: ink, roughness: 0.79, polygonOffset: true, polygonOffsetFactor: -1 }),
    0,
    0.749,
    0,
  );
  seal.rotation.x = -Math.PI / 2;
  seal.castShadow = false;
  const tap = mesh(main, new T.CylinderGeometry(0.043, 0.049, 0.16, 12), bronze, 0, 0.82, 0.31);
  box(tap, 0, 0.045, -0.065, 0.18, 0.034, 0.036, bronze);
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
  for (const xx of [0.91, 1.26]) {
    const y = 1.34,
      z = -0.45;
    mesh(station, new T.CylinderGeometry(0.08, 0.085, 0.014, 20), glass, xx, y, z);
    mesh(station, new T.CylinderGeometry(0.009, 0.011, 0.13, 10), glass, xx, y + 0.069, z);
    const bowl = [
      new T.Vector2(0.012, 0),
      new T.Vector2(0.073, 0.036),
      new T.Vector2(0.091, 0.093),
      new T.Vector2(0.067, 0.2),
    ];
    mesh(station, new T.LatheGeometry(bowl, 32), glass, xx, y + 0.13, z);
    mesh(station, new T.CylinderGeometry(0.084, 0.049, 0.067, 24), wine, xx, y + 0.184, z);
  }
  const bottle = new T.MeshPhysicalMaterial({
    color: '#303c25',
    roughness: 0.2,
    metalness: 0.08,
    clearcoat: 0.75,
  });
  const profile = [
    [0.055, 0],
    [0.071, 0.024],
    [0.071, 0.235],
    [0.067, 0.26],
    [0.028, 0.31],
    [0.024, 0.421],
    [0.031, 0.424],
    [0.031, 0.445],
  ];
  mesh(
    station,
    new T.LatheGeometry(
      profile.map(([r, h]) => new T.Vector2(r, h)),
      32,
    ),
    bottle,
    1.12,
    1.345,
    -0.65,
  );
  mesh(
    station,
    new T.CylinderGeometry(0.0715, 0.0715, 0.115, 32),
    standard('#c2b38d', 0.82),
    1.12,
    1.47,
    -0.65,
  );
  nav.box('lamp post',-1.39,-.59,.055,.055,.025,2.075);
  box(station, -1.39, 1.05, -0.59, 0.11, 2.05, 0.11);
  box(station, -1.19, 2.06, -0.59, 0.52, 0.08, 0.1);
  const lamp = standard('#ffde9c', 0.42);
  lamp.emissive.set('#ffbc65');
  const lx = -0.99,
    ly = 1.76,
    lz = -0.59;
  const hanger = new T.Group();
  station.add(hanger);
  mesh(hanger, new T.CylinderGeometry(0.016, 0.016, 0.16, 8), iron, lx, 1.98, lz);
  mesh(hanger, new T.CylinderGeometry(0.095, 0.19, 0.11, 4), iron, lx, ly + 0.14, lz).rotation.y =
    Math.PI / 4;
  box(hanger, lx, ly, lz, 0.205, 0.21, 0.205, lamp);
  box(hanger, lx, ly - 0.13, lz, 0.28, 0.046, 0.28, iron);
  for (const dx of [-0.11, 0.11])
    for (const dz of [-0.11, 0.11]) box(hanger, lx + dx, ly, lz + dz, 0.024, 0.23, 0.024, iron);
  hanger.position.set(lx, 2.03, lz);
  for (const part of hanger.children) part.position.sub(hanger.position);
  const cooper = worker(station, 7, 0.92, 'Cooper');
  nav.place(cooper,.63,.20,-Math.PI/2);
  const touchStaves=inspectCask(cooper,main);
  const glow = new T.PointLight('#ffbd72', 4, 8, 2);
  glow.position.set(lx, ly + 0.02, lz + 0.2);
  station.add(glow);
  function light(night) {
    glow.intensity = night ? 15 : 1.1;
    lamp.emissiveIntensity = night ? 4.3 : 0.04;
  }
  return {
    light,nav,
    update(t,camera,mobile,high=true) {
      nav.begin(t);
      cooper.pose(t, 'inspect',nav.floor);
      touchStaves(t);
      cooper.lod(camera,mobile,true,high);
      nav.draw();
      hanger.rotation.z = wind(t, 3.8, -14) * 0.059;
    },
  };
}
