import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from './sip-craft-sky.js';

import { flock } from '../life/birds.js';
import { peopleNav } from '../life/nav.js';
import { worker, rankPeople } from '../life/people.js';
import { cutter, clothPanel, floatHull, tastingGlass } from '../life/harbor.js';
import { trout, insects } from '../life/wildlife.js';
import { wind } from '../life/forms.js';
import { hullWave } from './sip-craft-water.js';

export function buildHarbor(scene, u, grain) {
  const rng = seeded(381);
  const group = new THREE.Group();
  scene.add(group);
  const nav=peopleNav(scene,'.craft-stage');
  let obstacle;
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra });
  const clay = mat('#914c2c'),
    sand = mat('#edd4a8'),
    mint = mat('#d8e6da'),
    teal = mat('#1a5552'),
    mauve = mat('#817985');
  const lamp = mat('#f4daab', { emissive: '#ffc17b', emissiveIntensity: 1.6 });
  function mesh(geometry, material, x, y, z, parent = group) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(w,h,d,m,x,y,z,p) {
    if(obstacle && !p) nav.box(obstacle,x,z,w/2,d/2,y-h/2,y+h/2);
    return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,p);
  }
  function deck(name,w,h,d,m,x,y,z,tread=false) {
    nav.surface(name,x-w/2,x+w/2,z-d/2,z+d/2,y+h/2,tread);
    return box(w,h,d,m,x,y,z);
  }
  const cyl = (a, b, h, m, x, y, z, n = 32) => mesh(new THREE.CylinderGeometry(a, b, h, n), m, x, y, z);
  function weathered(material, masonry = false) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grain = { value: grain };
      shader.vertexShader =
        'varying vec3 surfaceP,surfaceN;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        surfaceP=(modelMatrix*vec4(position,1.)).xyz;surfaceN=normalize(mat3(modelMatrix)*normal);`,
        );
      shader.fragmentShader =
        'uniform sampler2D grain;varying vec3 surfaceP,surfaceN;\n' +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
          vec3 w=abs(surfaceN);w/=max(.001,w.x+w.y+w.z);
          vec3 p=surfaceP*1.4;
          vec3 gr=texture2D(grain,p.zy).rgb*w.x+texture2D(grain,p.xz).rgb*w.y+texture2D(grain,p.xy).rgb*w.z;
          diffuseColor.rgb*=.65+gr.b*.65;
          ${
            masonry
              ? `float y=surfaceP.y*6.8+gr.b*.08;
          float x=(surfaceP.x+surfaceP.z*.87)*3.4+.5*mod(floor(y),2.)+gr.b*.13;
          vec2 seam=abs(fract(vec2(x,y))-.5);
          float mortar=smoothstep(.42,.487,max(seam.x,seam.y))*(1.-smoothstep(.035,.26,fwidth(x)));
          diffuseColor.rgb*=1.-mortar*.33;
          diffuseColor.rgb*=.92+.15*fract(sin(dot(floor(vec2(x,y)),vec2(24.2,33.4)))*235.4);`
              : ''
          }`,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
          normal=normalize(normal+mat3(viewMatrix)*vec3(gr.r-.5,(gr.g-.5)*.54,gr.g-.5)*.32);`,
          );
    };
    material.customProgramCacheKey = () => (masonry ? 'coast-ashlar' : 'coast-patina');
    return material;
  }
  weathered(mint, true);
  weathered(sand, true);
  weathered(clay);
  // Ground the terrace furniture and trellises on tiers without screen-space AO.
  const contactMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { opacity: { value: 0.25 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float opacity;void main(){float d=length((vUv-.5)*2.);float a=(1.-smoothstep(.28,1.,d))*opacity;gl_FragColor=vec4(.035,.075,.065,a);}`,
  });
  function contact(x, y, z, w, d) {
    const m = mesh(new THREE.PlaneGeometry(w, d), contactMaterial, x, y, z);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = false;
    m.receiveShadow = false;
  }
  contact(-2.6, 2.758, -0.15, 3.5, 2.8);
  for (const [x, z] of [
    [-4.1, -2.7],
    [-0.9, -3.6],
    [-5.2, -1.9],
  ])
    contact(x, 2.758, z, 0.9, 0.9);
  const grape = mat('#684659');
  const vine = mat('#546237');
  vine.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { seaTime: u.seaTime, storm: u.storm });
    shader.vertexShader =
      'uniform float seaTime,storm;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      transformed.x+=.015*(1.+storm)*sin(position.x*3.+seaTime*1.9+position.z);`,
      );
  };
  // Vine trellises follow the crown of the island.
  for(let row=0;row<4;row++) nav.box('vine row',-2.63,-3.4+row*.8,2.20,.21,2.68,3.36);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 9; col++) {
      const x = -4.55 + col * 0.48,
        z = -3.4 + row * 0.8;
      box(0.035, 0.68, 0.035, clay, x, 3.02, z);
      mesh(new THREE.IcosahedronGeometry(0.21, 1), vine, x, 3.2, z).scale.set(1.35, 0.65, 1);
      if (col < 8) box(0.48, 0.025, 0.025, mauve, x + 0.24, 3.12, z);
      if (col % 3 === 0) mesh(new THREE.SphereGeometry(0.045, 6, 4), grape, x, 3.04, z + 0.13);
    }
  // Limestone tasting house with a terracotta roof, glazed arches, and warm windows.
  obstacle='tasting house';
  box(2.35, 1.55, 1.6, mint, -2.6, 3.48, -0.15);
  obstacle=null;
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.35, 0);
  roofShape.lineTo(1.35, 0);
  roofShape.lineTo(0, 0.85);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.95, bevelEnabled: false });
  roofGeo.translate(0, 0, -0.975);
  mesh(roofGeo, clay, -2.6, 4.25, -0.15);
  // Limewashed front gable, attic oculus and a brick sill.
  const face = new THREE.BufferGeometry();
  face.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-3.94, 4.25, 0.828, -1.26, 4.25, 0.828, -2.6, 5.09, 0.828], 3),
  );
  face.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  face.computeVertexNormals();
  mesh(face, mint, 0, 0, 0);
  mesh(new THREE.CircleGeometry(0.127, 24), teal, -2.6, 4.62, 0.835);
  mesh(new THREE.TorusGeometry(0.139, 0.024, 6, 24), sand, -2.6, 4.62, 0.844);
  box(0.022, 0.23, 0.015, sand, -2.6, 4.62, 0.853);
  box(0.23, 0.022, 0.015, sand, -2.6, 4.62, 0.853);
  // Individual roof courses and chimney give the silhouette a handmade scale.
  for (let side of [-1, 1])
    for (let i = 0; i < 9; i++) {
      const tile = box(0.19, 0.045, 2.02, clay, -2.6 + side * (0.08 + i * 0.15), 5.05 - i * 0.095, -0.15);
      tile.rotation.z = -side * 0.56;
    }
  const tiles = ['#ad6746', '#b37855', '#a45b3d', '#b87950'].map((c) => weathered(mat(c)));
  for (const side of [-1, 1])
    for (let row = 0; row < 9; row++)
      for (let j = 0; j < 18; j++) {
        const x = (row + 0.55) * 0.15;
        const barrel = mesh(
          new THREE.CylinderGeometry(0.052, 0.059, 0.21, 8),
          tiles[Math.floor(rng() * 4)],
          -2.6 + side * x,
          5.12 - x * 0.631,
          -1.1 + j * 0.113,
        );
        barrel.rotation.z = side * 1.008;
      }
  box(0.25, 0.8, 0.3, sand, -3.35, 4.75, -0.55);
  box(0.35, 0.08, 0.4, clay, -3.35, 5.16, -0.55);
  for (let i = 0; i < 8; i++) box(0.25, 0.1, 0.12, sand, -3.64 + i * 0.3, 3.02, 0.68);
  for (let side of [-1, 1])
    for (let i = 0; i < 6; i++) box(0.18, 0.12, 0.16, sand, -2.6 + side * 1.18, 2.85 + i * 0.24, 0.65);
  box(2.6, 0.12, 1.8, sand, -2.6, 4.22, -0.15);
  obstacle='awning stanchion';
  for (let x of [-3.4, -1.8]) box(0.08, 1.25, 0.08, teal, x, 3.45, 1.65);
  const awning = clothPanel(2.3, 1.15, '#b47750');
  awning.position.set(-2.6, 4.06, 1.18);
  awning.rotation.x = -1.44;
  scene.add(awning);
  // Terrace railings, a table, wine amphorae and cypress silhouettes.
  obstacle='terrace rail';
  for (let i = 0; i < 9; i++) box(0.04, 0.4, 0.04, teal, -4.05 + i * 0.37, 3.05, 1.8);
  box(3.1, 0.035, 0.035, teal, -2.55, 3.25, 1.8);
  obstacle=null;
  nav.circle('tasting table',-2.5,1.1,.31,2.84,3.385);
  cyl(0.31, 0.31, 0.07, sand, -2.5, 3.35, 1.1);
  cyl(0.035, 0.06, 0.48, teal, -2.5, 3.08, 1.1);
  for (let i = 0; i < 3; i++) {
    const a = mesh(new THREE.SphereGeometry(0.19, 14, 12), clay, -4.4 + i * 0.42, 2.98, 0.45);
    a.scale.y = 1.35;
    nav.circle('amphora',a.position.x,a.position.z,.19,2.72,3.30);
    cyl(0.08, 0.065, 0.12, clay, -4.4 + i * 0.42, 3.24, 0.45);
  }
  for (const [x, z] of [
    [-4.1, -2.7],
    [-0.9, -3.6],
    [-5.2, -1.9],
  ]) {
    nav.circle('cypress',x,z,.21,2.70,4.85);
    cyl(0.045, 0.065, 0.7, clay, x, 3.05, z);
    for (let k = 0; k < 32; k++) {
      const a = rng() * 6.28,
        y = k / 32,
        r = 0.17 * Math.pow(Math.sin(0.28 + y * 2.75), 0.7);
      const leaf = mesh(
        new THREE.IcosahedronGeometry(0.13, 1),
        vine,
        x + r * Math.cos(a),
        3.02 + y * 1.65,
        z + r * Math.sin(a),
      );
      leaf.scale.set(1 - y * 0.64, 2.1, 1 - y * 0.64);
    }
  }
  // Fine masonry seams and mint-painted gallery rings on the lighthouse.
  for (let i = 0; i < 11; i++)
    cyl(0.49 + (10 - i) * 0.017, 0.49 + (10 - i) * 0.017, 0.012, sand, 4.4, 0.68 + i * 0.29, -2.25);
  cyl(0.7, 0.7, 0.09, sand, 4.4, 3.72, -2.25);
  cyl(0.71, 0.71, 0.045, teal, 4.4, 4.48, -2.25);
  function towerOpening(y, w, h) {
    const a = -0.37,
      r = 0.69 - ((y - 0.55) * 0.2) / 3.4;
    const x = 4.4 + r * Math.sin(a),
      z = -2.25 + r * Math.cos(a);
    const trim = box(w + 0.069, h + 0.075, 0.05, sand, x, y, z);
    trim.rotation.y = a;
    const sash = box(w, h, 0.06, teal, x + 0.035 * Math.sin(a), y, z + 0.035 * Math.cos(a));
    sash.rotation.y = a;
    const pane = box(
      w * 0.65,
      h * 0.69,
      0.016,
      mauve,
      x + 0.074 * Math.sin(a),
      y + 0.012,
      z + 0.074 * Math.cos(a),
    );
    pane.rotation.y = a;
  }
  towerOpening(1.03, 0.26, 0.58);
  for (let i = 0; i < 3; i++) towerOpening(1.67 + i * 0.65, 0.145, 0.26);
  for (let i = 0; i < 4; i++) {
    box(0.29, 0.65, 0.025, teal, -3.4 + i * 0.52, 3.55, 0.665);
    box(0.2, 0.48, 0.03, lamp, -3.4 + i * 0.52, 3.55, 0.685);
  }
  deck('tasting terrace',2.8, 0.12, 1.4, sand, -2.6, 2.82, 1.15);
  for (let i = 0; i < 16; i++) {
    const h = 2.64 - i * 0.124,
      x = -1.38 + i * 0.084,
      z = 1.23 + i * 0.083;
    box(1.18, h + 0.15, 0.22, sand, x, h * 0.5 - 0.07, z);
    deck('stair tread',1.22, 0.055, 0.24, mauve, x, h, z,true);
  }
  // Detached lighthouse, breakwater and lantern gallery.

  nav.circle('lighthouse',4.4,-2.25,.68,.55,3.95);
  cyl(0.48, 0.68, 3.4, mint, 4.4, 2.25, -2.25);
  cyl(0.557, 0.591, 0.5, clay, 4.4, 2.62, -2.25);
  cyl(0.76, 0.76, 0.12, teal, 4.4, 3.91, -2.25);
  cyl(0.2, 0.2, 0.51, lamp, 4.4, 4.23, -2.25);
  mesh(new THREE.ConeGeometry(0.79, 0.6, 32), clay, 4.4, 4.86, -2.25);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(0.035, 0.54, 0.035, teal, 4.4 + Math.cos(a) * 0.62, 4.2, -2.25 + Math.sin(a) * 0.62);
  }
  const beacon = new THREE.PointLight('#ffcf86', 18, 10, 2);
  beacon.position.set(4.4, 4.3, -2.25);
  group.add(beacon);
  // A small procedural glow keeps the lamp legible through rain without
  // making bloom wash out the lighthouse silhouette.
  const haloPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5),
        i = (y * 64 + x) * 4;
      haloPixels[i] = 255;
      haloPixels[i + 1] = 180;
      haloPixels[i + 2] = 96;
      haloPixels[i + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - d), 2.8));
    }
  const haloTexture = new THREE.DataTexture(haloPixels, 64, 64, THREE.RGBAFormat);
  haloTexture.needsUpdate = true;
  const haloMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    color: '#ffd3a0',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.18,
  });
  const halo = new THREE.Sprite(haloMaterial);
  halo.position.copy(beacon.position);
  halo.scale.set(2.8, 2.8, 1);
  group.add(halo);
  // Soft, additive lighthouse shaft with radial falloff (no opaque cone silhouette).
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0.1 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float strength;void main(){float a=pow(sin(vUv.x*3.14159),3.)*pow(vUv.y,1.5)*strength;gl_FragColor=vec4(1.,.77,.39,a);}`,
  });
  const beamPivot = new THREE.Group();
  beamPivot.position.set(4.4, 4.3, -2.25);
  group.add(beamPivot);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 13, 48, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.x = 6.5;
  beamPivot.add(beam);
  // Pier, lanterns and a little sailing boat.
  deck('pier subfloor',5, 0.16, 0.85, clay, 1.4, 0.62, 2.5);
  for (let i = 0; i < 6; i++) {
    box(0.08, 0.9, 0.08, teal, -0.8 + i * 0.86, 0.25, 2.2);
    box(0.08, 0.9, 0.08, teal, -0.8 + i * 0.86, 0.25, 2.8);
  }
  const lanterns = [];
  obstacle='pier lantern';
  for (const x of [-0.6, 1.1, 3.1]) {
    box(0.23, 0.027, 0.035, teal, x + 0.103, 1.78, 2.8);
    box(0.027, 0.27, 0.035, teal, x, 1.65, 2.8);
    const hanger = new THREE.Group();
    hanger.position.set(x + 0.192, 1.78, 2.8);
    group.add(hanger);
    lanterns.push(hanger);
    box(0.045, 0.9, 0.045, teal, x, 1.08, 2.8);
    mesh(new THREE.SphereGeometry(0.105, 12, 8), lamp, 0, -0.2, 0, hanger);
  }
  obstacle=null;
  const rig = cutter('#e6dac3', '#286564', true),
    boat = rig.root;
  boat.name = 'Tidelight cutter';
  boat.position.set(3, 0, 4.2);
  boat.rotation.y = 0.74 - Math.PI / 2;
  group.add(boat);
  nav.box('cutter',0,0,1.1,.43,-.115,.375,0,boat);
  const pennant = clothPanel(0.45, 0.13, '#af5942', 'flag');
  pennant.position.set(0.33, 1.78, 0);
  boat.add(pennant);
  const iron = mat('#353f3d', { metalness: 0.66, roughness: 0.43 }),
    brass = mat('#aa8957', { metalness: 0.76, roughness: 0.34 });
  const lens = mat('#b8d7c0', { metalness: 0.45, roughness: 0.13 });
  // Fresnel lens with concentric prisms and two continuous balcony rails.
  const glazing = new THREE.MeshPhysicalMaterial({
    color: '#b0d6cd',
    metalness: 0.34,
    roughness: 0.11,
    transparent: true,
    opacity: 0.21,
    depthWrite: false,
    side: THREE.DoubleSide,
    clearcoat: 1,
  });
  cyl(0.59, 0.59, 0.53, glazing, 4.4, 4.24, -2.25, 12);
  for (let i = 0; i < 9; i++)
    cyl(0.27 - Math.abs(i - 4) * 0.009, 0.23, 0.033, lens, 4.4, 4.01 + i * 0.054, -2.25, 48);
  function ring(radius, tube, y, m) {
    const r = mesh(new THREE.TorusGeometry(radius, tube, 6, 64), m, 4.4, y, -2.25);
    r.rotation.x = Math.PI / 2;
  }
  for (const h of [3.98, 4.12]) ring(0.73, 0.014, h, iron);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    box(0.018, 0.3, 0.018, iron, 4.4 + 0.73 * Math.cos(a), 3.99, -2.25 + 0.73 * Math.sin(a));
  }
  ring(0.72, 0.026, 4.51, brass);
  cyl(0.04, 0.066, 0.32, brass, 4.4, 5.23, -2.25);
  // Turn the plain awning into a scalloped canvas and the pier into timber planks.
  const canvas = mat('#c9af81'),
    darkWood = mat('#655443');
  weathered(darkWood);
  for (const hanger of lanterns) {
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.071, 8), iron, 0, -0.033, 0, hanger);
    mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.055, 8), iron, 0, -0.295, 0, hanger);
    mesh(new THREE.CylinderGeometry(0.045, 0.14, 0.093, 8), iron, 0, -0.075, 0, hanger);
    for (const dx of [-0.075, 0.075]) box(0.016, 0.2, 0.017, iron, dx, -0.2, 0.06, hanger);
  }
  for (let i = 0; i < 15; i++) box(0.139, 0.07, 0.025, i % 2 ? clay : canvas, -3.64 + i * 0.149, 3.96, 1.75);
  // Plank gaps are narrower than a sole. Their continuous tread plane
  // preserves support as the heel crosses a joint between boards.
  nav.surface('pier planking',-1.04-.059,-1.04+38*.13+.059,2.5-.455,2.5+.455,.714+.034/2);
  for (let i = 0; i < 39; i++) {
    const board = box(0.118, 0.034, 0.91, darkWood, -1.04 + i * 0.13, 0.714, 2.5);
    board.rotation.y = (rng() - 0.5) * 0.012;
  }
  for (const x of [-0.76, 0.96, 2.68]) {
    for (const z of [2.13, 2.87]) {
      nav.circle('mooring post',x,z,.061,-.16,.80);
      cyl(0.052, 0.061, 0.96, darkWood, x, 0.32, z, 10);
      for (let i = 0; i < 3; i++) cyl(0.06, 0.06, 0.018, brass, x, 0.71 + i * 0.023, z, 10);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = -3.4 + i * 0.52;
    box(0.023, 0.48, 0.018, iron, x, 3.55, 0.71);
    box(0.21, 0.026, 0.018, iron, x, 3.57, 0.71);
    box(0.31, 0.055, 0.13, sand, x, 3.27, 0.7);
  }
  const flights = flock(scene, {
    kind: 'gull',
    count: 5,
    center: [-0.5, 5.65, -0.9],
    radii: [4.9, 3.1],
    perch: [-2.6, 5.15, -0.15],
    scale: 0.64,
    obstacles: [
      [4.4, 5.3, -2.25, 1.15],
      [-2.6, 5.1, -0.15, 1.65],
    ],
  });
  const fish = trout(scene, 8, 2.05, 3.83, (x, z, t) => hullWave(x, z, t, u.storm.value), 0.72);
  const insectsAtVines = insects(scene, 'butterfly', 5, [-3.1, 3.48, -2.49], [1.02, 0.22, 0.48], 0.34);
  const dockhand = worker(scene, 7, 0.51, 'Pier hand');
  nav.place(dockhand,1.64,2.54,.71);
  const guest = worker(scene, 6, 0.49, 'Terrace taster');
  nav.place(guest,-1.89,1.16,-1.52,.06);
  const people=[dockhand,guest];
  const taste = tastingGlass(guest);
  nav.agents.find(a=>a.actor===guest).props=[taste.prop];
  // Batch static architecture by material. Keep moving elements and the light
  // shaft separate so their transforms remain independent.
  const batches = new Map();
  group.updateMatrixWorld(true);
  for (const child of [...group.children]) {
    if (!child.isMesh || child.isSprite || child.material.transparent) continue;
    const key = child.material;
    if (!batches.has(key)) batches.set(key, []);
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    g.applyMatrix4(child.matrixWorld);
    batches.get(key).push(g);
    group.remove(child);
    child.geometry.dispose();
  }
  for (const [material, parts] of batches) {
    const merged = new THREE.Mesh(mergeGeometries(parts), material);
    merged.castShadow = true;
    merged.receiveShadow = true;
    group.add(merged);
    parts.forEach((p) => p.dispose());
  }
  return (t, w, camera, tier) => {
    nav.begin(t);
    beacon.intensity = 1.4 + w * 5;
    lamp.emissiveIntensity = 0.3 + w * 2;
    beamMat.uniforms.strength.value = 0.012 + w * 0.11;
    beamPivot.rotation.y = t * 0.22 + 0.6;
    haloMaterial.opacity = 0.13 + w * 0.21;
    for (const hanger of lanterns) hanger.rotation.z = wind(t, hanger.position.x, 2.8) * (0.045 + 0.048 * w);
    floatHull(boat, t, hullWave, w, 0.009);
    pennant.userData.billow(t, 3, 4.2);
    awning.userData.billow(t, -2.6, 1.18);
    flights(t, tier === 0, camera);
    fish(t, tier === 0);
    insectsAtVines(t, tier === 0, false);
    dockhand.pose(t, 'talk',nav.floor);
    guest.dynamics.load(.31,.16,1.28,.23);
    guest.pose(t,'taste',nav.floor);
    taste(t);
    rankPeople(people,camera,tier===0,tier===2);
    nav.draw();
  };
}
