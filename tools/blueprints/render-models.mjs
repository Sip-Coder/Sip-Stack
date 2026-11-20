// Browser-side renderer. Geometry, shaders, texture maps and animation all come
// from the same character modules as the Heros tab. No design artwork is loaded.
import * as T from 'three';
import { createActor } from '/characters/rig.js';
import { FIXED_DT, createController } from '/characters/motion.js';
import { setModelDetail } from '/characters/material-detail.js';
import { buildSippy } from '/characters/sippy.js';
import { buildRoma } from '/characters/roma.js';
import { buildHummin } from '/characters/hummin.js';
import { names, heights } from '/characters/ui.js';

const builders = { sippy: buildSippy, roma: buildRoma, hummin: buildHummin };
const neutral = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };
const swatchSize = 128;

function inventory(root) {
  const byMaterial = new Map();
  root.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const [slot, mat] of slots.entries()) {
      if (!mat.visible || !mat.colorWrite || (mat.transparent && mat.opacity === 0)) continue;
      let entry = byMaterial.get(mat);
      if (!entry) {
        const index = byMaterial.size + 1;
        entry = { index, mat, sources: [], name: mat.name || mat.userData.blueprintId || mat.type };
        byMaterial.set(mat, entry);
      }
      entry.sources.push({ mesh, slot });
    }
  });
  return byMaterial;
}

function projectJoints(rig, camera, { width, height }) {
  const data = {};
  for (const joint of rig.joints) {
    const world = joint.getWorldPosition(new T.Vector3());
    const p = world.clone().project(camera);
    data[joint.name] = {
      world: world.toArray(),
      pixel: [((p.x + 1) * width) / 2, ((1 - p.y) * height) / 2],
    };
  }
  return data;
}

function buildCoverage(entries) {
  const replacements = new Map();
  for (const [mat, entry] of entries) {
    // Exact byte labels, R + 256G + 65536B. Colour conversion is invertible for
    // byte sRGB. No MSAA here so edges never invent an extra material ID.
    const i = entry.index;
    const identity = new T.MeshBasicMaterial({
      color: new T.Color('rgb(' + (i & 255) + ',' + ((i >> 8) & 255) + ',' + ((i >> 16) & 255) + ')'),
      side: mat.side,
      toneMapped: false,
      fog: false,
      polygonOffset: mat.polygonOffset,
      polygonOffsetUnits: mat.polygonOffsetUnits,
      polygonOffsetFactor: mat.polygonOffsetFactor,
    });
    if (mat.alphaTest > 0) {
      identity.alphaTest = mat.alphaTest;
      identity.alphaMap = mat.alphaMap;
      // An albedo map can supply alpha; its RGB must not tint material IDs.
      if (mat.map) {
        identity.map = mat.map;
        identity.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            '#ifdef USE_MAP\ndiffuseColor.a *= texture2D(map, vMapUv).a;\n#endif',
          );
        };
      }
    }
    replacements.set(mat, identity);
  }
  const hidden = new T.MeshBasicMaterial({ visible: false });
  return (mat) => replacements.get(mat) ?? hidden;
}

function materialRanges({ mesh, slot }) {
  const g = mesh.geometry;
  const total = g.index?.count ?? g.getAttribute('position').count;
  const start = g.drawRange.start,
    end = Math.min(total, start + g.drawRange.count);
  const groups = Array.isArray(mesh.material)
    ? g.groups.filter((group) => group.materialIndex === slot)
    : [{ start: 0, count: total }];
  return groups
    .map((group) => {
      const offset = Math.max(start, group.start);
      return { start: offset, count: Math.min(end, group.start + group.count) - offset };
    })
    .filter((group) => group.count > 0);
}

// A custom UV/XY reading must identify a real point on a drawn triangle of
// this material. This prevents sampling off the mesh to obtain a desired colour.
function footprintWitness(entry, sample, space) {
  const point = sample[space];
  if (!point) return null;
  if (point.length !== 2 || !point.every(Number.isFinite))
    throw Error('Invalid ' + space + ' footprint for ' + entry.name);
  const a = new T.Vector2(),
    b = new T.Vector2(),
    c = new T.Vector2();
  const p = new T.Vector2(...point);
  for (const source of entry.sources) {
    const { mesh } = source,
      g = mesh.geometry,
      sourceAttr = g.getAttribute(space === 'xy' ? 'position' : 'uv');
    if (!sourceAttr) continue;
    function get(i, vec) {
      const id = g.index ? g.index.getX(i) : i;
      return vec.set(sourceAttr.getX(id), sourceAttr.getY(id));
    }
    for (const group of materialRanges(source))
      for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
        get(i, a);
        get(i + 1, b);
        get(i + 2, c);
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (Math.abs(area) < 1e-16) continue;
        const u = ((p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x)) / area;
        const v = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / area;
        if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
          return { mesh: mesh.name || mesh.parent.name, triangle: Math.floor(i / 3), space, point };
      }
  }
  throw Error(
    'No drawn triangle contains ' +
      space +
      ' footprint ' +
      point +
      ' for ' +
      entry.name +
      ' / ' +
      sample.id,
  );
}

function sourceColors(entry) {
  if (!entry.mat.vertexColors) return null;
  const values = [];
  for (const { mesh, slot } of entry.sources) {
    const g = mesh.geometry,
      c = g.getAttribute('color'),
      index = g.index;
    const groups = materialRanges({ mesh, slot });
    if (!c) throw Error('Missing production color attribute on ' + entry.name + ' / ' + mesh.name);
    for (const group of groups) {
      const count = Math.min(72, group.count);
      for (let j = 0; j < count; j++) {
        const n = group.start + Math.floor(((j + 0.5) * group.count) / count);
        const v = index ? index.getX(n) : n;
        values.push([c.getX(v), c.getY(v), c.getZ(v)]);
      }
    }
  }
  if (!values.length) throw Error('No production vertex colours for ' + entry.name);
  // Retain all three channels of each observed color instead of constructing a
  // synthetic RGB from unrelated channel percentiles.
  values.sort(
    (a, b) =>
      0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2] - (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]),
  );
  return values;
}

function renderSwatches(renderer, entries, booth, camera, strict) {
  const atlas = document.createElement('canvas');
  const plans = [];
  for (const entry of entries.values()) {
    const mat = entry.mat;
    if (!mat.isMeshStandardMaterial && !mat.isMeshBasicMaterial)
      throw Error('Unmeasured material type: ' + mat.type + ' / ' + entry.name);
    const samples = mat.userData.blueprintSamples || [{ id: mat.userData.blueprintId }];
    if (!samples.length) throw Error('Empty sample list for ' + entry.name);
    const colors = sourceColors(entry);
    for (const sample of samples) {
      if (strict && !sample.id) throw Error('Unbound material: ' + entry.name + ' #' + entry.index);
      if (
        (sample.width !== undefined && !(sample.width > 0)) ||
        (sample.uvWidth !== undefined && !(sample.uvWidth > 0))
      )
        throw Error('Invalid swatch width for ' + entry.name);
      const footprint = [
        footprintWitness(entry, sample, 'xy'),
        footprintWitness(entry, sample, 'uv'),
      ].filter(Boolean);
      plans.push({ entry, sample, colors, footprint });
    }
  }
  const cols = Math.min(8, plans.length);
  atlas.width = cols * swatchSize;
  atlas.height = Math.ceil(plans.length / cols) * swatchSize;
  const canvas2d = atlas.getContext('2d', { willReadFrequently: true });
  renderer.setSize(swatchSize, swatchSize, false);
  const samples = [];
  for (const [n, { entry, sample, colors, footprint }] of plans.entries()) {
    const mat = entry.mat,
      center = sample.xy || [0, 0],
      width = sample.width ?? 0.067;
    const uv = sample.uv || [0.5, 0.5],
      uvWidth = sample.uvWidth ?? 1;
    const surface = new T.PlaneGeometry(width, width, 16, 16);
    surface.translate(center[0], center[1], sample.z || 0);
    const tex = surface.getAttribute('uv');
    for (let i = 0; i < tex.count; i++)
      tex.setXY(i, uv[0] + (tex.getX(i) - 0.5) * uvWidth, uv[1] + (tex.getY(i) - 0.5) * uvWidth);
    if (colors) {
      const length = surface.getAttribute('position').count;
      const a = new Float32Array(length * 3);
      for (let i = 0; i < length; i++)
        a.set(colors[Math.floor(((((i * 149) % length) + 0.5) * colors.length) / length)], i * 3);
      surface.setAttribute('color', new T.BufferAttribute(a, 3));
    }
    const swatch = new T.Mesh(surface, mat);
    // The shader sees real object-space coordinates, including inks whose
    // motif is defined by surface position instead of a texture's UVs.
    swatch.position.set(-center[0], -center[1], -(sample.z || 0));
    booth.add(swatch);
    camera.left = camera.bottom = -width / 2;
    camera.right = camera.top = width / 2;
    camera.updateProjectionMatrix();
    renderer.render(booth, camera);
    const col = n % cols,
      row = Math.floor(n / cols);
    canvas2d.drawImage(renderer.domElement, col * swatchSize, row * swatchSize);
    booth.remove(swatch);
    surface.dispose();
    samples.push({
      id: sample.id ?? null,
      material: entry.name + ' #' + entry.index,
      index: entry.index,
      type: mat.type,
      base: mat.color ? '#' + mat.color.getHexString() : null,
      footprint,
      roughness: mat.roughness,
      metalness: mat.metalness,
      opacity: mat.opacity,
      texture: !!mat.map,
      vertexColors: !!mat.vertexColors,
      boundMeshes: entry.sources.length,
      source: entry.sources[0].mesh.name || entry.sources[0].mesh.parent?.name,
      tile: [col * swatchSize, row * swatchSize, swatchSize, swatchSize],
    });
  }
  return { atlas: atlas.toDataURL('image/png'), samples };
}

function calibrateBooth(renderer, booth, camera) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const read = canvas.getContext('2d', { willReadFrequently: true });
  camera.left = camera.bottom = -0.5;
  camera.right = camera.top = 0.5;
  camera.updateProjectionMatrix();
  const material = new T.MeshPhysicalMaterial({ roughness: 1, metalness: 0, ior: 1, specularIntensity: 0 });
  const geometry = new T.PlaneGeometry(1, 1);
  const plane = new T.Mesh(geometry, material);
  booth.add(plane);
  const readings = [];
  for (const value of [0, 0.18, 1]) {
    material.color.setRGB(value, value, value);
    renderer.render(booth, camera);
    read.drawImage(renderer.domElement, 0, 0, 8, 8);
    const rgb = Array.from(read.getImageData(4, 4, 1, 1).data).slice(0, 3);
    const expected = Math.round(
      T.ColorManagement.fromWorkingColorSpace(new T.Color(value, value, value), T.SRGBColorSpace).r * 255,
    );
    if (rgb.some((channel) => Math.abs(channel - expected) > 3))
      throw Error('D65 radiometric control failed at ' + value + ': ' + rgb + ' expected ' + expected);
    readings.push({ linear: value, expectedSrgbByte: expected, rgb });
  }
  booth.remove(plane);
  geometry.dispose();
  material.dispose();
  return readings;
}

export async function setup(hero, spec, strict, withLandmarks) {
  const height = heights[names.indexOf(hero)];
  const rig = createActor(hero, height);
  const animate = builders[hero](rig);
  setModelDetail(rig.root, 'high');
  const ctrl = createController(rig);
  ctrl.reset(0, 0);
  for (let i = 0; i < 42; i++) {
    animate(ctrl.step(FIXED_DT, neutral));
    ctrl.finishPose();
  }
  rig.root.updateMatrixWorld(true);
  const landmarks = withLandmarks
    ? (await import('/tools/blueprints/measure-landmarks.mjs')).measureRigLandmarks(rig, 'high')
    : null;
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.setSize(spec.width, spec.height, false);
  renderer.setClearColor(0x000000, 0);
  const errors = [];
  renderer.debug.onShaderError = (gl, p, v, f) =>
    errors.push([gl.getProgramInfoLog(p), gl.getShaderInfoLog(v), gl.getShaderInfoLog(f)].join('\n'));
  const scene = new T.Scene();
  scene.add(rig.root);
  const probe = new T.Scene();
  probe.background = new T.Color(0xffffff);
  const pmrem = new T.PMREMGenerator(renderer),
    env = pmrem.fromScene(probe, 0, 0.1, 10);
  const hemi = new T.HemisphereLight(0xffffff, 0x909090, 0.7);
  const key = new T.DirectionalLight(0xffffff, 2.0),
    rim = new T.DirectionalLight(0xffffff, 0.8);
  key.position.set(-3, 5, 4);
  rim.position.set(3, 4, -5);
  scene.add(hemi, key, rim);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.48;
  const span = spec.verticalSpanHeights * height;
  const halfX = (span * spec.width) / spec.height / 2,
    halfY = span / 2;
  const camera = new T.OrthographicCamera(-halfX, halfX, halfY, -halfY, 0.01, 12 * height);
  const lookAt = new T.Vector3(...spec.lookAtHeights).multiplyScalar(height);
  const entries = inventory(rig.root),
    label = buildCoverage(entries);
  const originals = [];
  rig.root.traverseVisible((mesh) => {
    if (mesh.isMesh) originals.push([mesh, mesh.material]);
  });
  function check() {
    if (errors.length) throw Error('Shader failed: ' + errors.join('\n'));
  }
  function view(name) {
    const [az, el] = spec.views[name].map(T.MathUtils.degToRad);
    camera.up.set(0, Math.abs(Math.cos(el)) < 1e-8 ? 0 : 1, Math.abs(Math.cos(el)) < 1e-8 ? -1 : 0);
    camera.position
      .set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
      .multiplyScalar(4 * height)
      .add(lookAt);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    check();
    const rgba = renderer.domElement.toDataURL('image/png');
    for (const [mesh, m] of originals) mesh.material = Array.isArray(m) ? m.map(label) : label(m);
    renderer.render(scene, camera);
    check();
    const ids = renderer.domElement.toDataURL('image/png');
    for (const [mesh, m] of originals) mesh.material = m;
    return {
      rgba,
      ids,
      camera: {
        world: camera.matrixWorld.toArray(),
        projection: camera.projectionMatrix.toArray(),
        joints: projectJoints(rig, camera, spec),
      },
    };
  }
  function materials() {
    // D65 flat-field integrating dome. Constant linear environment radiance 1
    // gives 1 normalized diffuse irradiance (irradiance/pi); real specular,
    // emission, transparency, texture, weave and vertex tint remain enabled.
    const booth = new T.Scene();
    booth.background = new T.Color().setRGB(0.18, 0.18, 0.18);
    booth.environment = env.texture;
    booth.environmentIntensity = 1;
    const front = new T.OrthographicCamera(-1, 1, 1, -1, 0.001, 2);
    front.position.set(0, 0, 0.5);
    front.lookAt(0, 0, 0);
    const result = renderSwatches(renderer, entries, booth, front, strict);
    check();
    return { ...result, calibration: calibrateBooth(renderer, booth, front), materialCount: entries.size };
  }
  return { view, materials, landmarks };
}
