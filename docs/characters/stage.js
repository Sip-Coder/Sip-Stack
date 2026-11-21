import * as T from 'three';
import { warmShaders } from '../assets/sip-warm.js';
import { PROPS, groundHeight } from './motion.js';

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
// Solid panels of the same finish share a single instanced draw.
function boxes(parent, parts, roughness, castShadow) {
  const material = new T.MeshStandardMaterial({ roughness });
  const mesh = new T.InstancedMesh(new T.BoxGeometry(), material, parts.length);
  const matrix = new T.Matrix4(),
    color = new T.Color();
  parts.forEach(([w, h, d, x, y, z, tint], i) => {
    mesh.setMatrixAt(i, matrix.makeScale(w, h, d).setPosition(x, y, z));
    mesh.setColorAt(i, color.set(tint));
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
}
function props(scene) {
  const solids = [],
    trim = [];
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
      const ramp = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x85948e, roughness: 0.76 }));
      ramp.castShadow = ramp.receiveShadow = true;
      ramp.position.set(x, 0, z);
      scene.add(ramp);
    } else {
      solids.push([w, h, d, x, h / 2, z, kind === 'crate' ? 0x977754 : 0x85948e]);
      if (kind !== 'crate') continue;
      for (const side of [-1, 1]) {
        for (const y of [0.08, h - 0.08])
          trim.push([w, 0.08, 0.012, x, y, z + side * (d / 2 + 0.004), 0x594f40]);
        for (let i = 1; i < 5; i++)
          trim.push([
            0.004,
            h - 0.2,
            0.006,
            x + w * (i / 5 - 0.5),
            h / 2,
            z + side * (d / 2 + 0.006),
            0x594f40,
          ]);
      }
    }
  }
  boxes(scene, solids, 0.84, true);
  boxes(scene, trim, 0.67, false);
}
function ruler(scene) {
  const group = new T.Group();
  const foot = 0.3048;
  const span = 3 * foot;
  const parts = [];
  for (let i = 0; i < 6; i++)
    parts.push([0.045, foot / 2, 0.045, 0, ((i + 0.5) * foot) / 2, 0, i % 2 ? 0xd5dbcd : 0x224d47]);
  for (const y of [0, foot, 2 * foot, span]) parts.push([0.14, 0.012, 0.05, 0, y, 0, 0x224d47]);
  boxes(group, parts, 0.9, false);
  const label = document.createElement('canvas');
  label.width = 176;
  label.height = 80;
  const c = label.getContext('2d');
  c.fillStyle = '#243f39';
  c.fillRect(0, 0, 176, 80);
  c.fillStyle = '#fffbed';
  c.textAlign = 'center';
  c.font = '500 50px sans-serif';
  c.fillText('3 ft', 88, 57);
  const tex = new T.CanvasTexture(label);
  tex.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex }));
  sprite.scale.set(0.33, 0.15, 1);
  sprite.position.set(0, span + 0.11, 0);
  group.add(sprite);
  group.position.set(1.68, 0.001, 0);
  group.visible = false;
  scene.add(group);
  return group;
}
// Baked radial occlusion approximates diffuse light blocked at the sole, in
// addition to the directional shadow. It fades continuously as each foot lifts.
export function contactShadows(scene, rig) {
  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = 64;
  const ctx = stamp.getContext('2d');
  const falloff = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  falloff.addColorStop(0, 'rgba(40,31,26,.6)');
  falloff.addColorStop(0.42, 'rgba(40,31,26,.38)');
  falloff.addColorStop(1, 'rgba(40,31,26,0)');
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, 64, 64);
  const map = new T.CanvasTexture(stamp);
  map.colorSpace = T.SRGBColorSpace;
  const geometry = new T.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI * 0.5);
  const shadows = [rig.footL, rig.footR].map((ankle) => {
    const pad = new T.Mesh(geometry, new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
    pad.renderOrder = 1;
    scene.add(pad);
    return { ankle, pad };
  });
  const tmp = new T.Vector3();
  return () => {
    for (const { ankle, pad } of shadows) {
      ankle.getWorldPosition(tmp);
      const floor = groundHeight(tmp.x, tmp.z);
      const lift = Math.max(0, tmp.y - floor - 0.05 * rig.height);
      // Raised test props already receive the real directional shadow all the
      // way to their edges; a planar stamp should only fall on the grid.
      pad.visible = rig.root.visible && floor === 0 && lift < 0.45;
      if (!pad.visible) continue;
      pad.position.set(tmp.x, 0.0017, tmp.z);
      pad.scale.set(rig.height * (0.108 + 0.13 * lift), 1, rig.height * (0.19 + 0.09 * lift));
      pad.rotation.y = rig.root.rotation.y;
      pad.material.opacity = 0.56 * (1 - T.MathUtils.smoothstep(lift, 0, 0.45));
    }
  };
}

// Pack the studio lights directly into Three's 16-pixel CubeUV layout. Wider
// lobes in successive roughness bands approximate prefiltered softboxes, so
// first paint and context restoration need no GPU environment bake.
function studioReflections() {
  const faceSize = 16,
    width = 7 * 3 * faceSize,
    height = 4 * faceSize;
  const data = new Uint8Array(width * height * 4);
  const bands = [0.21, 0.305, 0.4, 0.53, 0.67, 0.8, 1];
  const lights = [
    [-3, 3, 4, '#fff0dc', 5.7, 16],
    [3.5, 1.4, 1, '#ebf6ff', 3.3, 25],
    [0.8, 4, -3, '#ffdfb7', 4.1, 24],
    [0, 1.4, 5, '#e9effa', 1.1, 9],
  ].map(([x, y, z, tint, power, sharpness]) => ({
    direction: new T.Vector3(x, y, z).normalize(),
    color: new T.Color(tint).multiplyScalar(power),
    sharpness,
  }));
  const n = new T.Vector3();
  for (const [band, roughness] of bands.entries()) {
    const lobes = lights.map(({ direction, color, sharpness }) => {
      const exponent = 1 / (1 / sharpness + 0.48 * roughness ** 4);
      return { direction, color: color.clone().multiplyScalar((exponent + 1) / (sharpness + 1)), exponent };
    });
    for (let face = 0; face < 6; face++) {
      for (let y = 0; y < faceSize; y++)
        for (let x = 0; x < faceSize; x++) {
          const u = (2 * (x - 0.5)) / (faceSize - 2) - 1,
            v = (2 * (y - 0.5)) / (faceSize - 2) - 1;
          switch (face) {
            case 0:
              n.set(1, v, u);
              break;
            case 1:
              n.set(-u, 1, -v);
              break;
            case 2:
              n.set(-u, v, 1);
              break;
            case 3:
              n.set(-1, v, -u);
              break;
            case 4:
              n.set(-u, -1, v);
              break;
            case 5:
              n.set(u, v, -1);
              break;
          }
          n.normalize();
          let r = 0.21,
            g = 0.23,
            b = 0.22;
          for (const light of lobes) {
            const amount = Math.max(0, n.dot(light.direction)) ** light.exponent;
            r += light.color.r * amount;
            g += light.color.g * amount;
            b += light.color.b * amount;
          }
          const offset =
            4 * (((face >= 3 ? faceSize : 0) + y) * width + (band * 3 + (face % 3)) * faceSize + x);
          // Linear radiance up to 8 encoded in normalized bytes. The environment
          // intensity restores this range in the physical materials.
          data[offset] = Math.round((r * 255) / 8);
          data[offset + 1] = Math.round((g * 255) / 8);
          data[offset + 2] = Math.round((b * 255) / 8);
          data[offset + 3] = 255;
        }
    }
  }
  const texture = new T.DataTexture(data, width, height);
  texture.mapping = T.CubeUVReflectionMapping;
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
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
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color('#c4d3d0');
  scene.fog = new T.FogExp2(scene.background, 0.035);
  const camera = new T.PerspectiveCamera(34, 1, 0.035, 80);
  const target = new T.WebGLRenderTarget(1, 1, {
    type: renderer.extensions.has('EXT_color_buffer_float') ? T.HalfFloatType : T.UnsignedByteType,
  });
  // A single offscreen beauty target keeps the previous frame on the canvas
  // until a complete replacement is ready. Present with Three's usual ACES
  // tone mapping and sRGB conversion in one opaque fullscreen triangle.
  const present = new T.Scene();
  const screenCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const triangle = new T.BufferGeometry();
  triangle.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  triangle.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const screen = new T.Mesh(
    triangle,
    new T.MeshBasicMaterial({ map: target.texture, depthTest: false, depthWrite: false }),
  );
  screen.frustumCulled = false;
  present.add(screen);
  const sky = new T.HemisphereLight(0xfff4e8, 0x979eaa, 1.18);
  scene.add(sky);
  const key = new T.DirectionalLight(0xffecce, 2.5),
    rim = new T.DirectionalLight(0xe4f6ff, 1.65);
  scene.add(key, key.target, rim, rim.target);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 5, bottom: -4, near: 0.05, far: 28 });
  key.shadow.bias = -0.00028;
  key.shadow.normalBias = 0.004;
  ground(scene);
  props(scene);
  const scale = ruler(scene);
  scene.environmentIntensity = 0.61 * 8;
  let tier,
    fitWidth = 0,
    fitHeight = 0,
    renderScale = 1,
    shadowAge = 0;
  let environment;
  function warm() {
    scene.environment = environment ??= studioReflections();
    return warmShaders(renderer, [
      [scene, camera, target],
      [present, screenCamera, null],
    ]);
  }
  function invalidateShadow() {
    shadowAge = 0;
    renderer.shadowMap.needsUpdate = true;
  }
  // Release old GPU storage during loss. The retained CPU reflection texture
  // can be uploaded again in the restored context on its next warm/draw.
  function releaseTargets() {
    environment?.dispose();
    key.shadow.map?.dispose();
    key.shadow.map = null;
    target.dispose();
    fitWidth = 0;
    invalidateShadow();
  }
  function autoTier() {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    // Heros has two mesh budgets. Village's Mobile and Medium GPU classes
    // both use the lighter artwork and single-sample render target here.
    if (
      /swiftshader|llvmpipe|mali|adreno|powervr|apple gpu|intel|iris|radeon.*graphics/i.test(gpu) ||
      (matchMedia('(pointer: coarse)').matches && devicePixelRatio >= 2) ||
      devicePixelRatio > 2 ||
      renderer.capabilities.maxTextureSize < 8192
    )
      return 'mobile';
    return 'high';
  }
  function quality(q) {
    if (q === tier) return;
    tier = q;
    renderScale = q === 'high' ? 1.25 : 1;
    fitWidth = 0;
    key.shadow.mapSize.setScalar(q === 'high' ? 1024 : 512);
    key.shadow.map?.dispose();
    key.shadow.map = null;
    const samples = Math.min(q === 'high' ? 2 : 0, renderer.capabilities.maxSamples);
    if (target.samples !== samples) {
      target.dispose();
      target.samples = samples;
    }
    invalidateShadow();
  }
  function fit() {
    const w = el.clientWidth,
      h = el.clientHeight;
    if (!w || !h) return false;
    if (w !== fitWidth || h !== fitHeight) {
      fitWidth = w;
      fitHeight = h;
      const ratio = Math.min(
        renderScale,
        devicePixelRatio || 1,
        Math.sqrt((tier === 'high' ? 1450000 : 520000) / (w * h)),
      );
      renderer.setDrawingBufferSize(w, h, ratio);
      target.setSize(canvas.width, canvas.height);
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
    autoTier,
    invalidateShadow,
    warm,
    releaseTargets,
    lighting,
    illuminate,
    draw() {
      // Cache the expensive directional map between animation samples. Foot
      // contact stamps still follow the live soles on every presented frame.
      if (++shadowAge >= (tier === 'high' ? 4 : 8)) invalidateShadow();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(present, screenCamera);
    },
  };
}
