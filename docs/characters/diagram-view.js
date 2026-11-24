// An orthographic study of the selected actor. Each draw uses the simulator’s
// existing WebGL context; the 2D canvas retains its last finished photograph.
import * as T from 'three';
import { axialOffsets, displaceBatch } from './diagram-explode.js';
import { warmShaders } from '../assets/sip-warm.js';

const axis = new T.Vector3(0.84, 0.13, -0.53).normalize();
const isoYaw = Math.PI / 4,
  isoPitch = Math.asin(1 / Math.sqrt(3));
const clamp = T.MathUtils.clamp;

function ranges(parts, start) {
  const batches = new Map();
  for (let number = start; number < parts.length; number++) {
    const part = parts[number];
    const { geometry, material, renderOrder } = part.mesh;
    const pos = geometry.attributes.position;
    const total = geometry.index?.count ?? pos.count;
    const start = geometry.drawRange.start;
    const end = Math.min(total, start + geometry.drawRange.count);
    const groups = Array.isArray(material) ? geometry.groups : [{ start: 0, count: total }];
    for (const group of groups) {
      const finish = Array.isArray(material) ? material[group.materialIndex] : material;
      const first = Math.max(start, group.start),
        last = Math.min(end, group.start + group.count);
      if (!finish?.visible || last <= first) continue;
      const key = JSON.stringify([part.layer, finish.id, renderOrder]);
      if (!batches.has(key)) batches.set(key, { layer: part.layer, finish, renderOrder, spans: [] });
      // Multi-finish snapshot meshes store each finish's vertices together.
      // Preserve indexing (including UV seams), instead of expanding triangles.
      let lo = first,
        hi = last - 1;
      if (part.sourceMatrix && first === 0 && last === total) {
        lo = 0;
        hi = pos.count - 1;
      } else if (geometry.index) {
        lo = Infinity;
        hi = -1;
        const ix = geometry.index.array;
        for (let j = first; j < last; j++) {
          lo = Math.min(lo, ix[j]);
          hi = Math.max(hi, ix[j]);
        }
      }
      batches.get(key).spans.push({ geometry, number, first, last, lo, hi, matrix: part.sourceMatrix });
    }
  }
  return batches.values();
}

function copySpatial(array, output, offset, lo, hi, matrix, bounds) {
  const e = matrix?.elements;
  const scale = e && !bounds ? 1 / Math.hypot(e[0], e[1], e[2]) : 1;
  const tx = bounds && e ? e[12] : 0,
    ty = bounds && e ? e[13] : 0,
    tz = bounds && e ? e[14] : 0;
  const ax = e ? e[0] * scale : 1, bx = e ? e[4] * scale : 0, cx = e ? e[8] * scale : 0;
  const ay = e ? e[1] * scale : 0, by = e ? e[5] * scale : 1, cy = e ? e[9] * scale : 0;
  const az = e ? e[2] * scale : 0, bz = e ? e[6] * scale : 0, cz = e ? e[10] * scale : 1;
  for (let i = lo * 3, end = (hi + 1) * 3; i < end; i += 3, offset += 3) {
    const x = array[i], y = array[i + 1], z = array[i + 2];
    const a = output[offset] = ax * x + bx * y + cx * z + tx;
    const b = output[offset + 1] = ay * x + by * y + cy * z + ty;
    const c = output[offset + 2] = az * x + bz * y + cz * z + tz;
    if (!bounds) continue;
    bounds.min.x = Math.min(bounds.min.x, a);
    bounds.min.y = Math.min(bounds.min.y, b);
    bounds.min.z = Math.min(bounds.min.z, c);
    bounds.max.x = Math.max(bounds.max.x, a);
    bounds.max.y = Math.max(bounds.max.y, b);
    bounds.max.z = Math.max(bounds.max.z, c);
  }
}

function bake(spans) {
  const vertexCount = spans.reduce((n, s) => n + s.hi - s.lo + 1, 0);
  const indexCount = spans.reduce((n, s) => n + s.last - s.first, 0);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const partIds = new Float32Array(vertexCount);
  const geometry = new T.BufferGeometry();
  const bounds = new T.Box3();
  const attrs = new Map();
  for (const { geometry: source } of spans)
    for (const [name, attr] of Object.entries(source.attributes))
      if (!attrs.has(name)) attrs.set(name, attr.itemSize);
  for (const [name, size] of attrs) {
    const values = new Float32Array(vertexCount * size);
    if (name === 'color') values.fill(1);
    geometry.setAttribute(name, new T.BufferAttribute(values, size));
  }
  let v = 0,
    i = 0;
  for (const { geometry: source, lo, hi, first, last, number, matrix } of spans) {
    const n = hi - lo + 1;
    for (const [name, size] of attrs) {
      const attr = source.getAttribute(name);
      if (!attr) continue;
      const target = geometry.attributes[name].array;
      if (name === 'position') copySpatial(attr.array, target, v * size, lo, hi, matrix, bounds);
      else if (matrix && name === 'normal') copySpatial(attr.array, target, v * size, lo, hi, matrix);
      else target.set(attr.array.subarray(lo * size, (hi + 1) * size), v * size);
    }
    partIds.fill(number, v, v + n);
    const ix = source.index?.array;
    for (let j = first; j < last; j++) indices[i++] = v + (ix ? ix[j] : j) - lo;
    v += n;
  }
  geometry.setIndex(new T.BufferAttribute(indices, 1));
  geometry.setAttribute('axonPart', new T.BufferAttribute(partIds, 1));
  geometry.boundingBox = bounds;
  geometry.boundingSphere = bounds.getBoundingSphere(new T.Sphere());
  return geometry;
}

// Flatten only the draw copies. Preserve source-relative index ranges for
// proof and picking, and retain the posed positions for exploded views.
export function buildDisplayBatches(parts, start = 0) {
  return Array.from(ranges(parts, start), (batch) => {
    const geometry = bake(batch.spans), position = geometry.attributes.position;
    let start = 0, indexStart = 0;
    const spans = batch.spans.map(({ number, lo, hi, first: sourceFirst, last: sourceLast }) => {
      const first = start;
      start += hi - lo + 1;
      const indexCount = sourceLast - sourceFirst;
      const span = { position, number, lo: first, hi: start - 1, indexStart, indexCount, sourceLo: lo };
      indexStart += indexCount;
      return span;
    });
    return { ...batch, geometry, spans };
  });
}

function studyMaterial(source, chosen, hovered, tissue) {
  const material = source.clone(),
    compile = source.onBeforeCompile;
  const key = source.customProgramCacheKey();
  if (tissue?.layer === 'skeleton') {
    material.roughness = 0.82;
    material.metalness = 0;
  }
  // Offscreen targets normally skip display tone mapping in Three. Apply its
  // ACES curve once, before the target's native sRGB conversion and readback.
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(source, shader, renderer);
    if (tissue) tissue.shade(shader, tissue.layer, tissue.ghost);
    shader.uniforms.axonSelected = chosen;
    shader.uniforms.axonHovered = hovered;
    shader.uniforms.toneMappingExposure = { value: 1.06 };
    shader.vertexShader =
      'attribute float axonPart; varying float partId;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npartId = axonPart;');
    shader.fragmentShader =
      'uniform float axonSelected; uniform float axonHovered; varying float partId;\n' +
      '#ifndef TONE_MAPPING\n#include <tonemapping_pars_fragment>\n#endif\n' +
      shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `
          #ifdef TONE_MAPPING
            #include <tonemapping_fragment>
          #else
            gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
          #endif
          if (abs(partId - axonSelected) < 0.25)
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.46, 0.055), 0.59);
          else if (abs(partId - axonHovered) < 0.25)
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.65, 0.22), 0.46);`,
      );
  };
  material.customProgramCacheKey = () => key + '|axon-study|' + (tissue?.layer || 'actor');
  return material;
}

export function createDiagramView(stage, canvas, { layerOrder = [], onSelect, onHover, onPaint, onError } = {}) {
  const renderer = stage.renderer,
    ctx = canvas.getContext('2d', { alpha: false });
  const scene = new T.Scene();
  scene.name = 'Axon View';
  const originalBackground = new T.Color('#a2aea8');
  scene.background = originalBackground;
  const key = new T.DirectionalLight(0xfff9ee, 2.25);
  key.position.set(-3, 5, 4);
  const fill = new T.DirectionalLight(0xe6eff5, 1.15);
  fill.position.set(4, 3, -2);
  const originalLights = new T.Group();
  originalLights.add(new T.HemisphereLight(0xfffbf2, 0xb1b9bc, 1.15), key, fill);
  scene.add(originalLights);
  const previousClear = new T.Color();
  let studio, studioModule, studioRequest = 0;
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const target = new T.WebGLRenderTarget(1, 1, { colorSpace: T.SRGBColorSpace });
  const stats = {
    renders: 0,
    draws: 0,
    postDraws: 0,
    totalDraws: 0,
    studio: false,
    ambientOcclusion: 'none',
    ghost: false,
    peakDraws: 0,
    triangles: 0,
    warms: 0,
    visible: false,
    ready: false,
    disposed: false,
    tier: 'mobile',
    parts: 0,
    batches: 0,
  };
  const layers = new Map(),
    layersState = new Map(),
    chosen = { value: -1 },
    hovered = { value: -1 },
    ghost = { value: 0 };
  const direction = new T.Vector3(),
    centre = new T.Vector3(),
    right = new T.Vector3(),
    up = new T.Vector3();
  const corner = new T.Vector3(),
    shift = new T.Vector3(),
    projected = new T.Vector3();
  const baseBounds = new T.Box3();
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2(),
    hits = [];
  let model,
    meshes = [],
    spacing = 1,
    explode = 0,
    layout = 'axial',
    offsets = null,
    lastDisplacement = 0,
    yaw = isoYaw,
    pitch = isoPitch,
    mag = 1;
  let fitMode = 'off', heatMaterial, ordinaryGhost = false;
  let sequence = 0,
    lastPainted = -1,
    warmed = -1,
    compiling = -1,
    raf = 0,
    dirty = true,
    lost = false,
    inFrame = false;
  let buffer,
    picture,
    width,
    height,
    reading = false;
  const listeners = new AbortController();
  const signal = listeners.signal;

  function layerState(id) {
    if (!layersState.has(id)) layersState.set(id, { visible: true, opacity: 1 });
    return layersState.get(id);
  }
  function syncLayer(id) {
    const layer = layers.get(id);
    if (!layer) return;
    const state = layerState(id);
    const visible = fitMode === 'off' ? state.visible : id === 'skin' ||
      (fitMode === 'overlay' && ['muscles', 'breast', 'gluteal-fat', 'hip-fat'].includes(id));
    const opacity = fitMode === 'off' ? state.opacity : 1;
    layer.group.visible = visible && opacity > 0;
    for (const mesh of layer.group.children) {
      const source = mesh.userData.finish,
        m = mesh.material;
      if (m === heatMaterial) continue;
      m.opacity = source.opacity * opacity;
      const shell = stats.studio && ghost.value && id === 'skin';
      const translucent = !!(shell || source.transparent || opacity < 1);
      if (m.transparent !== translucent) {
        m.transparent = translucent;
        m.needsUpdate = true;
      }
      m.depthWrite = source.depthWrite && opacity === 1 && !shell;
      if (!source.transparent) m.forceSinglePass = true;
    }
  }
  function changed() {
    if (stats.disposed) return;
    dirty = true;
    stats.ready = false;
    schedule();
  }
  function drawable() {
    return stats.visible && inFrame && !!model && !stats.disposed && !document.hidden && !lost;
  }
  function schedule() {
    if (dirty && drawable() && !raf && !reading && compiling !== sequence) raf = requestAnimationFrame(paint);
  }
  function releaseDrawResources() {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      mesh.userData.studyMaterial.dispose();
    }
    heatMaterial?.dispose();
  }
  function clearMeshes() {
    releaseDrawResources();
    heatMaterial = undefined;
    for (const layer of layers.values()) scene.remove(layer.group);
    meshes = [];
    layers.clear();
  }
  function setModel(next, tier = 'mobile') {
    if (stats.disposed) return;
    const request = ++studioRequest;
    if (next === model && tier === stats.tier) return;
    const human = next?.name === 'sippy' || next?.name === 'roma';
    if (human && !studio) {
      import('./diagram-studio.js').then((module) => {
        if (request !== studioRequest || stats.disposed) return;
        studioModule = module;
        studio = module.createHumanStudio();
        scene.add(studio.lights);
        setModel(next, tier);
      }).catch((error) => { if (request === studioRequest) onError?.(error); });
      return;
    }
    stats.studio = human;
    stats.ambientOcclusion = human ? 'screen-space' : 'none';
    stats.ghost = human && !!ghost.value;
    originalLights.visible = !human;
    scene.background = human ? null : originalBackground;
    if (studio) studio.lights.visible = human;
    if (human) {
      studio.configure(tier);
      studio.setSubject(next.parts);
    } else {
      studio?.releaseTarget();
    }
    sequence++;
    stats.ready = false;
    chosen.value = hovered.value = -1;
    const resume = model?.partial && next && !next.partial && next.dispose === model.dispose && stats.tier === tier;
    const first = resume ? model.parts.length : 0;
    if (!resume) {
      clearMeshes();
      baseBounds.makeEmpty();
    }
    model = next;
    offsets = null;
    lastDisplacement = resume && lastDisplacement !== 0 ? -1 : 0;
    stats.tier = tier;
    stats.parts = next?.parts.length ?? 0;
    stats.batches = 0;
    if (model) {
      const ids = new Set(model.parts.map((p) => p.layer));
      for (const id of [...new Set([...layerOrder, ...ids])].filter((id) => ids.has(id))) {
        if (layers.has(id)) continue;
        const group = new T.Group();
        group.name = id;
        scene.add(group);
        layers.set(id, { group, index: layers.size, box: new T.Box3() });
      }
      for (const b of buildDisplayBatches(model.parts, first)) {
        const { geometry } = b;
        const tissue = human ? { shade: studioModule.shadeTissue, layer: b.layer, ghost } : null;
        const finish = studyMaterial(b.finish, chosen, hovered, tissue);
        const mesh = new T.Mesh(geometry, finish);
        mesh.renderOrder = b.renderOrder;
        mesh.userData.finish = b.finish;
        mesh.userData.studyMaterial = finish;
        if (b.layer !== 'skeleton') mesh.userData.sourceSpans = b.spans;
        meshes.push(mesh);
        const layer = layers.get(b.layer);
        layer.group.add(mesh);
        layer.box.union(geometry.boundingBox);
        baseBounds.union(geometry.boundingBox);
      }
      if (model.name !== 'hummin') offsets = axialOffsets(model.parts, baseBounds);
      spacing = 0.58 * (baseBounds.max.y - baseBounds.min.y || 1.8);
      for (const id of layers.keys()) syncLayer(id);
      stats.batches = meshes.length;
    }
    changed();
  }

  function fitCamera(aspect) {
    const axial = offsets && layout === 'axial';
    const spread = fitMode === 'off' ? explode : 0;
    const amount = axial ? spread : 0;
    if (amount !== lastDisplacement) {
      for (const [id, layer] of layers) {
        if (id === 'skeleton') continue;
        layer.box.makeEmpty();
        for (const mesh of layer.group.children) {
          displaceBatch(mesh, offsets, amount);
          layer.box.union(mesh.geometry.boundingBox);
        }
      }
      lastDisplacement = amount;
    }
    direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    up.crossVectors(direction, right);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minD = Infinity,
      maxD = -Infinity;
    for (const layer of layers.values()) {
      if (axial) shift.set(0, 0, 0);
      else shift.copy(axis).multiplyScalar((layer.index - (layers.size - 1) / 2) * spacing * spread);
      layer.group.position.copy(shift);
      if (!layer.group.visible || layer.box.isEmpty()) continue;
      const { min, max } = layer.box;
      for (let k = 0; k < 8; k++) {
        corner.set(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & 4 ? max.z : min.z).add(shift);
        const x = corner.dot(right),
          y = corner.dot(up),
          d = corner.dot(direction);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minD = Math.min(minD, d);
        maxD = Math.max(maxD, d);
      }
    }
    if (Number.isFinite(minX)) {
      centre
        .copy(right)
        .multiplyScalar((minX + maxX) * 0.5)
        .addScaledVector(up, (minY + maxY) * 0.5)
        .addScaledVector(direction, (minD + maxD) * 0.5);
      const half = (0.535 * Math.max(0.08, maxY - minY, (maxX - minX) / aspect)) / mag;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.position.copy(centre).addScaledVector(direction, 12);
      camera.lookAt(centre);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }
    scene.updateMatrixWorld(true);
  }

  function size() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return false;
    const high = stats.tier === 'high';
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      high ? 1.25 : 1,
      Math.sqrt((high ? 900000 : 480000) / (w * h)),
    );
    width = Math.max(1, Math.round(w * ratio));
    height = Math.max(1, Math.round(h * ratio));
    if (target.width !== width || target.height !== height || !buffer) {
      target.setSize(width, height);
      buffer = new Uint8Array(width * height * 4);
      picture = ctx.createImageData(width, height);
    }
    if (stats.studio) studio.resize(width, height);
    fitCamera(w / h);
    return true;
  }

  // Three r170's compileAsync polls materials by looking up their current GL
  // program. A picker change can dispose those materials during that wait.
  // Keep the program handles from this exact compilation and stop polling on
  // replacement/loss; sip-warm still handles target binding and warm failures.
  const warmer = {
    getRenderTarget: () => renderer.getRenderTarget(),
    setRenderTarget: (target) => renderer.setRenderTarget(target),
    compileAsync(s, c, lights) {
      const seq = sequence;
      const materials = renderer.compile(s, c, lights);
      const programs = [...new Set(Array.from(materials, (m) => renderer.properties.get(m).currentProgram))];
      return new Promise((resolve) => {
        function check() {
          if (seq !== sequence || renderer.getContext().isContextLost() || programs.every((p) => p.isReady()))
            resolve();
          else setTimeout(check, 10);
        }
        check();
      });
    },
  };

  async function paint() {
    raf = 0;
    if (!dirty || !drawable() || !size()) return;
    scene.environment = stage.scene.environment;
    scene.environmentIntensity = stats.studio ? 0.48 : stage.scene.environmentIntensity;
    if (warmed !== sequence) {
      const seq = sequence;
      compiling = seq;
      stats.warms++;
      const jobs = stats.studio
        ? [[scene, camera, studio.target], [studio.stage, studio.camera, target]]
        : [[scene, camera, target]];
      warmShaders(warmer, jobs).then(() => {
        if (seq !== sequence) return;
        warmed = seq;
        compiling = -1;
        schedule();
      });
      return;
    }
    const previous = renderer.getRenderTarget(),
      face = renderer.getActiveCubeFace(),
      mip = renderer.getActiveMipmapLevel();
    const info = renderer.info,
      render = info.render;
    const { calls, triangles, points, lines } = render,
      autoReset = info.autoReset;
    const shadow = renderer.shadowMap.needsUpdate;
    const seq = sequence,
      gl = renderer.getContext();
    const packBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    renderer.getClearColor(previousClear);
    const clearAlpha = renderer.getClearAlpha();
    let readback;
    dirty = false;
    reading = true;
    try {
      // Queue a fenced readback, then return the simulator's framebuffer and
      // pixel-pack binding immediately. Only the in-flight image is allocated.
      try {
        info.autoReset = false;
        if (stats.studio) renderer.setClearColor(0, 0);
        renderer.setRenderTarget(stats.studio ? studio.target : target);
        // The simulator may composite with autoClear disabled. Both color and
        // sampled depth belong exclusively to this photograph and camera.
        if (stats.studio) renderer.clear(true, true, false);
        renderer.render(scene, camera);
        stats.draws = render.calls - calls;
        stats.triangles = render.triangles - triangles;
        if (stats.studio) studio.composite(renderer, camera, layers, target, offsets, lastDisplacement);
        stats.totalDraws = render.calls - calls;
        stats.postDraws = stats.totalDraws - stats.draws;
        readback = renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, buffer);
        stats.peakDraws = Math.max(stats.peakDraws, stats.draws);
      } finally {
        if (stats.studio) renderer.setClearColor(previousClear, clearAlpha);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer);
        renderer.setRenderTarget(previous, face, mip);
        renderer.shadowMap.needsUpdate = shadow;
        Object.assign(render, { calls, triangles, lines, points });
        info.autoReset = autoReset;
      }
      await readback;
      if (seq !== sequence || !drawable() || gl.isContextLost()) {
        dirty = true;
        return;
      }
      const stride = width * 4;
      for (let y = 0; y < height; y++) {
        const offset = (height - 1 - y) * stride;
        picture.data.set(buffer.subarray(offset, offset + stride), y * stride);
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.putImageData(picture, 0, 0);
      lastPainted = seq;
      stats.ready = !dirty;
      stats.renders++;
      onPaint?.(stats);
      if (hoverPending && stats.ready && !hoverFrame) hoverFrame = requestAnimationFrame(sampleHover);
    } catch (error) {
      if (seq === sequence && !gl.isContextLost()) {
        if (onError) onError(error);
        else console.error('Axon View render failed', error);
      }
    } finally {
      reading = false;
      schedule();
    }
  }

  function setVisible(value) {
    if (stats.disposed) return;
    stats.visible = !!value;
    if (stats.visible) schedule();
    else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  function setExplode(value) {
    const next = clamp(value, 0, 1);
    if (next !== explode) {
      explode = next;
      changed();
    }
  }
  function setLayout(value) {
    if (value !== layout) {
      layout = value;
      changed();
    }
  }
  function setLayer(id, { visible, opacity }) {
    const state = layerState(id);
    if (visible !== undefined) state.visible = !!visible;
    if (opacity !== undefined) state.opacity = clamp(opacity, 0, 1);
    syncLayer(id);
    changed();
  }
  function setGhost(enabled) {
    if (ordinaryGhost === !!enabled) return;
    ordinaryGhost = !!enabled;
    if (fitMode !== 'off') return;
    ghost.value = Number(ordinaryGhost);
    stats.ghost = stats.studio && ordinaryGhost;
    syncLayer('skin');
    changed();
  }
  function setSkinFit(mode, fitModule, distances) {
    if (mode === fitMode) return;
    const skin = layers.get('skin');
    if (mode !== 'off' && (!skin || model.partial || !stats.studio)) return;
    if (mode === 'heatmap' && !heatMaterial) {
      heatMaterial = fitModule.createHeatMaterial();
      for (const mesh of skin.group.children) {
        const gaps = new Float32Array(mesh.geometry.attributes.position.count).fill(-1);
        for (const { number, lo, hi, sourceLo } of mesh.userData.sourceSpans) {
          const value = distances.get(model.parts[number].id);
          if (!value) continue;
          for (let i = 0; i <= hi - lo; i++)
            gaps[lo + i] = fitModule.fitLimitIn * value.charCodeAt(sourceLo + i) / 255;
        }
        mesh.geometry.setAttribute('axonSkinGap', new T.BufferAttribute(gaps, 1));
      }
    }
    fitMode = mode;
    stats.skinFit = mode;
    ghost.value = Number(mode === 'overlay' || (mode === 'off' && ordinaryGhost));
    stats.ghost = stats.studio && !!ghost.value;
    for (const mesh of skin?.group.children ?? [])
      mesh.material = mode === 'heatmap' ? heatMaterial : mesh.userData.studyMaterial;
    for (const id of layers.keys()) syncLayer(id);
    sequence++;
    changed();
  }
  function select(part) {
    if (hovered.value !== -1) clearHover();
    const number = part ? (model?.parts.indexOf(part) ?? -1) : -1;
    if (number !== chosen.value) {
      chosen.value = number;
      changed();
      onSelect?.(model?.parts[number] ?? null);
    }
  }
  function underPointer(clientX, clientY) {
    if (lastPainted !== sequence || !drawable()) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) * 2) / rect.width - 1, 1 - ((clientY - rect.top) * 2) / rect.height);
    raycaster.setFromCamera(pointer, camera);
    hits.length = 0;
    // Raycaster does not honor ancestor visibility.
    for (const layer of layers.values())
      if (layer.group.visible) raycaster.intersectObjects(layer.group.children, false, hits);
    // The translucent shell lets a pointer reach the visible anatomy underneath.
    // Its own parts remain selectable in isolation and through the part list.
    const nearest = hits[0];
    const hit = ghost.value && stats.studio && nearest?.object.parent.name === 'skin'
      ? hits.find((item) => item.object.parent.name !== 'skin') ?? nearest
      : nearest;
    return hit ? model.parts[hit.object.geometry.attributes.axonPart.getX(hit.face.a)] : null;
  }
  function pick(clientX, clientY) {
    // A pointer-down may queue removal of its hover tint. The visible geometry
    // is still valid while that color-only photograph is in flight.
    if (lastPainted !== sequence || !drawable()) return null;
    const part = underPointer(clientX, clientY);
    select(part);
    return part;
  }
  function hover(part) {
    const number = part ? model.parts.indexOf(part) : -1;
    if (hovered.value === number) return;
    hovered.value = number;
    changed();
    onHover?.(part);
  }
  let hoverFrame = 0, hoverX = 0, hoverY = 0, hoverPending = false;
  function sampleHover() {
    hoverFrame = 0;
    if (stats.studio && stats.ready && drawable() && !pointers.size) {
      hoverPending = false;
      hover(underPointer(hoverX, hoverY));
    }
  }
  function clearHover() {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
    hoverPending = false;
    hover(null);
  }
  function project(part) {
    const layer = layers.get(part?.layer);
    if (!layer || !layer.group.visible) return null;
    const bounds = part.bounds ?? part.mesh.geometry.boundingBox;
    bounds.getCenter(projected).add(layer.group.position);
    if (lastDisplacement) projected.addScaledVector(offsets[model.parts.indexOf(part)], lastDisplacement);
    projected.project(camera);
    return {
      x: ((projected.x + 1) * canvas.clientWidth) / 2,
      y: ((1 - projected.y) * canvas.clientHeight) / 2,
    };
  }
  function orbit(dx, dy) {
    yaw += dx;
    pitch = clamp(pitch + dy, -1.46, 1.46);
    changed();
  }
  function zoom(factor) {
    mag = clamp(mag * factor, 0.55, 6);
    changed();
  }
  function resetView() {
    yaw = isoYaw;
    pitch = isoPitch;
    mag = 1;
    changed();
  }

  const pointers = new Map();
  let drag = false,
    pinch = 0;
  function distance() {
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      clearHover();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) drag = false;
      else if (pointers.size === 2) {
        drag = true;
        pinch = distance();
      }
    },
    { signal },
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) {
        if (!stats.studio || e.pointerType !== 'mouse' || !drawable()) return;
        hoverPending = true;
        hoverX = e.clientX;
        hoverY = e.clientY;
        if (!hoverFrame) hoverFrame = requestAnimationFrame(sampleHover);
        return;
      }
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2) {
        const d = distance();
        if (d > 1 && pinch > 1) zoom(d / pinch);
        pinch = d;
      } else if (pointers.size === 1) {
        drag ||= Math.hypot(p.x - p.startX, p.y - p.startY) > 4;
        if (drag) orbit(-dx * 0.008, dy * 0.008);
      }
    },
    { signal },
  );
  canvas.addEventListener(
    'pointerup',
    (e) => {
      if (pointers.delete(e.pointerId) && !drag && !pointers.size) pick(e.clientX, e.clientY);
    },
    { signal },
  );
  canvas.addEventListener('lostpointercapture', (e) => pointers.delete(e.pointerId), { signal });
  canvas.addEventListener('pointerleave', clearHover, { signal });
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId), { signal });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!drawable()) return;
      e.preventDefault();
      zoom(Math.exp(-clamp(e.deltaY * (e.deltaMode ? 12 : 1), -200, 200) * 0.002));
    },
    { signal, passive: false },
  );

  const resize = new ResizeObserver(changed);
  resize.observe(canvas);
  const intersect = new IntersectionObserver(([entry]) => {
    inFrame = entry.isIntersecting;
    if (inFrame) schedule();
  });
  intersect.observe(canvas);
  document.addEventListener('visibilitychange', schedule, { signal });
  stage.canvas.addEventListener(
    'webglcontextlost',
    () => {
      lost = true;
      sequence++;
      stats.ready = false;
      releaseDrawResources();
      target.dispose();
      studio?.releaseTarget();
      dirty = true;
    },
    { signal },
  );
  stage.canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      if (stats.studio) studio.configure(stats.tier);
      changed();
    },
    { signal },
  );

  function dispose() {
    if (stats.disposed) return;
    setVisible(false);
    sequence++;
    stats.disposed = true;
    stats.ready = false;
    cancelAnimationFrame(hoverFrame);
    listeners.abort();
    resize.disconnect();
    intersect.disconnect();
    clearMeshes();
    target.dispose();
    studio?.dispose();
    model = null;
    buffer = picture = null;
  }
  return {
    stats,
    setModel,
    setVisible,
    setExplode,
    setLayout,
    setLayer,
    setGhost,
    setSkinFit,
    select,
    pick,
    project,
    orbit,
    zoom,
    resetView,
    dispose,
  };
}
