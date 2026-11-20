import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { warmShaders } from '../assets/sip-warm.js';
import { PROPS } from './motion.js';

function ground(scene) {
  const material = new T.MeshStandardMaterial({ color: 0xa9b3ad, roughness: 0.98 });
  material.onBeforeCompile = (s) => {
    s.vertexShader =
      'varying vec2 metre;\n' +
      s.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nmetre=(modelMatrix*vec4(transformed,1.)).xz;',
      );
    s.fragmentShader =
      'varying vec2 metre;\n' +
      s.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 grid=abs(fract(metre+.5)-.5)/max(fwidth(metre),vec2(.0001));
      float line=1.-smoothstep(.12,1.2,min(grid.x,grid.y));
      vec2 major=abs(fract(metre*.2+.5)-.5)/max(fwidth(metre*.2),vec2(.0001));
      float bold=1.-smoothstep(.3,1.55,min(major.x,major.y));
      diffuseColor.rgb*=1.-(.16*line+.10*bold)*(1.-smoothstep(.14,.60,max(fwidth(metre.x),fwidth(metre.y))));`,
      );
  };
  const plane = new T.Mesh(new T.PlaneGeometry(4000, 4000), material);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);
}
function props(scene) {
  const cork = new T.MeshStandardMaterial({ color: 0x977754, roughness: 0.88 });
  const trim = new T.MeshStandardMaterial({ color: 0x594f40, roughness: 0.67 });
  const block = new T.MeshStandardMaterial({ color: 0x85948e, roughness: 0.76 });
  function box(w, h, d, x, y, z, m) {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    scene.add(o);
    return o;
  }
  for (const { x, z, width: w, height: h, depth: d, kind } of PROPS) {
    if (kind === 'ramp') {
      const outline = new T.Shape();
      outline.moveTo(-d / 2, 0);
      outline.lineTo(d / 2, h);
      outline.lineTo(d / 2, 0);
      outline.closePath();
      const g = new T.ExtrudeGeometry(outline, { depth: w, bevelEnabled: false });
      g.rotateY(-Math.PI / 2);
      g.translate(w / 2, 0, 0);
      const ramp = new T.Mesh(g, block);
      ramp.castShadow = ramp.receiveShadow = true;
      ramp.position.set(x, 0, z);
      scene.add(ramp);
    } else if (kind === 'crate') {
      box(w, h, d, x, h / 2, z, cork);
      for (const s of [-1, 1]) {
        for (const y of [0.08, h - 0.08]) box(w, 0.08, 0.012, x, y, z + s * (d / 2 + 0.004), trim);
        for (let i = 1; i < 5; i++)
          box(0.004, h - 0.2, 0.006, x + w * (i / 5 - 0.5), h / 2, z + s * (d / 2 + 0.006), trim);
      }
    } else box(w, h, d, x, h / 2, z, block);
  }
}
function ruler(scene) {
  const group = new T.Group(),
    ink = new T.MeshStandardMaterial({ color: '#224d47' }),
    pale = new T.MeshStandardMaterial({ color: '#d5dbcd' });
  for (let i = 0; i < 10; i++) {
    const mark = new T.Mesh(new T.BoxGeometry(0.045, 0.1, 0.045), i % 2 ? pale : ink);
    mark.position.y = i * 0.1 + 0.05;
    group.add(mark);
  }
  for (const y of [0.01, 1]) {
    const line = new T.Mesh(new T.BoxGeometry(0.14, 0.012, 0.05), ink);
    line.position.y = y;
    group.add(line);
  }
  const label = document.createElement('canvas');
  label.width = 176;
  label.height = 80;
  const c = label.getContext('2d');
  c.fillStyle = '#243f39';
  c.fillRect(0, 0, 176, 80);
  c.fillStyle = '#fffbed';
  c.textAlign = 'center';
  c.font = '500 50px sans-serif';
  c.fillText('1 m', 88, 57);
  const tex = new T.CanvasTexture(label);
  tex.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex }));
  sprite.scale.set(0.33, 0.15, 1);
  sprite.position.set(0, 1.11, 0);
  group.add(sprite);
  group.position.set(1.68, 0.001, 0);
  group.visible = false;
  scene.add(group);
  return group;
}
// Synthetic studio reflection cards give the helmet, glass and satin distinct highlights.
function studioReflections() {
  const room = new T.Scene();
  room.background = new T.Color().setRGB(0.21, 0.23, 0.22);
  const origin = new T.Vector3();
  function panel(x, y, z, width, height, color, luminance) {
    const material = new T.MeshBasicMaterial({ color, toneMapped: false });
    material.color.multiplyScalar(luminance);
    const card = new T.Mesh(new T.PlaneGeometry(width, height), material);
    card.position.set(x, y, z);
    card.lookAt(origin);
    room.add(card);
  }
  panel(-3, 3, 4, 3.8, 2.2, '#fff0dc', 4.1);
  panel(3.5, 1.4, 1, 0.9, 4.2, '#ebf6ff', 2.4);
  panel(0.8, 4, -3, 4.0, 1.2, '#ffdfb7', 3.1);
  panel(0, -4, 0, 14, 14, '#83918b', 0.57);
  return room;
}

export function createStage(el) {
  const renderer = new T.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.style.visibility = 'hidden';
  canvas.setAttribute(
    'aria-label',
    'Character movement test. Use WASD to move. Click to control the camera.',
  );
  el.prepend(canvas);
  renderer.autoClear = false;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color('#c4d3d0');
  scene.fog = new T.FogExp2(scene.background, 0.035);
  const camera = new T.PerspectiveCamera(34, 1, 0.035, 80);
  const target = new T.WebGLRenderTarget(1, 1, {
    type: renderer.extensions.has('EXT_color_buffer_float') ? T.HalfFloatType : T.UnsignedByteType,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const output = new OutputPass();
  output.material.depthTest = output.material.depthWrite = false;
  composer.addPass(output);
  const sky = new T.HemisphereLight(0xfff2df, 0x8b9b9b, 1.4);
  scene.add(sky);
  const key = new T.DirectionalLight(0xffecce, 2.5),
    rim = new T.DirectionalLight(0xe4f6ff, 1.65);
  scene.add(key, key.target, rim, rim.target);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 5, bottom: -4, near: 0.05, far: 28 });
  key.shadow.bias = -0.00028;
  key.shadow.normalBias = 0.009;
  ground(scene);
  props(scene);
  const scale = ruler(scene);
  const softbox = studioReflections(),
    pmrem = target.texture.type === T.HalfFloatType ? new T.PMREMGenerator(renderer) : null;
  let env,
    tier = 'high',
    fitWidth = 0,
    fitHeight = 0,
    ratio = 1,
    renderScale = 1;
  function warm() {
    if (pmrem) {
      env?.dispose();
      env = pmrem.fromScene(softbox, 0.04);
      scene.environment = env.texture;
      scene.environmentIntensity = 0.47;
    }
    return warmShaders(renderer, [[scene, camera, composer.readBuffer]]);
  }
  function quality(q) {
    tier = q;
    renderScale = q === 'high' ? 1.6 : 1;
    fitWidth = 0;
    key.shadow.mapSize.setScalar(q === 'high' ? 1024 : 512);
    key.shadow.map?.dispose();
    key.shadow.map = null;
    const samples = Math.min(q === 'high' ? 4 : 0, renderer.capabilities.maxSamples);
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      rt.samples = samples;
      rt.dispose();
    }
  }
  function fit() {
    const w = el.clientWidth,
      h = el.clientHeight;
    if (!w || !h) return false;
    if (w !== fitWidth || h !== fitHeight) {
      fitWidth = w;
      fitHeight = h;
      ratio = Math.min(
        renderScale,
        devicePixelRatio || 1,
        Math.sqrt((tier === 'high' ? 1450000 : 520000) / (w * h)),
      );
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    return true;
  }
  function lighting(golden) {
    key.color.set(golden ? '#ffbc78' : '#ffecce');
    sky.color.set(golden ? '#ffdfb5' : '#fff2df');
    rim.color.set(golden ? '#ffdeaa' : '#e4f6ff');
    scene.background.set(golden ? '#e6ceb8' : '#c4d3d0');
    scene.fog.color.copy(scene.background);
  }
  function illuminate(p) {
    key.target.position.set(p.x, p.y + 0.6, p.z);
    key.position.set(p.x - 3.5, p.y + 6, p.z + 3.2);
    rim.target.position.copy(key.target.position);
    rim.position.set(p.x + 2, p.y + 4, p.z - 4);
  }
  return {
    scene,
    camera,
    canvas,
    scale,
    fit,
    quality,
    warm,
    lighting,
    illuminate,
    draw() {
      composer.render(0);
    },
  };
}

export function debugRig(scene, rig, controller) {
  const links = [
    ['hips', 'chest'],
    ['chest', 'head'],
  ];
  for (const side of ['L', 'R']) {
    for (const [a, b] of [
      ['chest', 'upperArm'],
      ['upperArm', 'forearm'],
      ['forearm', 'hand'],
      ['hips', 'thigh'],
      ['thigh', 'shin'],
      ['shin', 'foot'],
    ]) {
      links.push([a === 'chest' || a === 'hips' ? a : a + side, b + side]);
    }
  }
  const points = new Float32Array((links.length + 1) * 6),
    geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(points, 3).setUsage(T.DynamicDrawUsage));
  const graph = new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0x42ffe7, depthTest: false }));
  graph.renderOrder = 8;
  graph.frustumCulled = false;
  scene.add(graph);
  const capsule = new T.Mesh(
    new T.CapsuleGeometry(controller.capsuleRadius, rig.height - 2 * controller.capsuleRadius, 3, 10),
    new T.MeshBasicMaterial({
      color: 0xf3a13a,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  scene.add(capsule);
  const feet = controller.contacts.map(() => {
    const m = new T.Mesh(
      new T.SphereGeometry(0.035, 10, 8),
      new T.MeshBasicMaterial({ color: 0xff713a, depthTest: false }),
    );
    m.renderOrder = 9;
    scene.add(m);
    return m;
  });
  const point = new T.Vector3();
  return () => {
    graph.visible = capsule.visible = rig.root.visible;
    let i = 0;
    for (const link of links)
      for (const name of link) {
        point.setFromMatrixPosition(rig[name].matrixWorld);
        point.toArray(points, i);
        i += 3;
      }
    point.copy(rig.root.position);
    point.y += 0.16;
    point.toArray(points, i);
    point.addScaledVector(controller.velocity, 0.32).toArray(points, i + 3);
    geo.attributes.position.needsUpdate = true;
    capsule.position.copy(rig.root.position);
    capsule.position.y += rig.height / 2;
    for (let j = 0; j < feet.length; j++) {
      feet[j].visible = rig.root.visible && controller.contacts[j].planted;
      feet[j].position.copy(controller.contacts[j].support);
    }
  };
}
