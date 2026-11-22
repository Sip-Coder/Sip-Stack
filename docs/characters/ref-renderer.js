// Photograph the live reference rig in the simulator's context. The caller
// schedules one visible panel at a time and owns the finished 2D photographs.
import * as T from 'three';
import { warmShaders } from '../assets/sip-warm.js';

const views = {
  front: [0, 0],
  'three-quarter': [Math.PI / 4, 0],
  right: [-Math.PI / 2, 0],
  profile: [-Math.PI / 2, 0],
  back: [Math.PI, 0],
  'rear-three-quarter': [(-3 * Math.PI) / 4, 0],
  upward: [0.15, -0.36],
};

function diffuseFinish(source) {
  // Builder metadata can contain authoring graphs. The real texture maps and
  // shader hooks are sufficient here, including the eyes, visor and embroidery.
  const m = new source.constructor().copy(Object.assign(Object.create(source), { userData: {} }));
  m.onBeforeCompile = (shader, renderer) => {
    source.onBeforeCompile.call(source, shader, renderer);
    const lit =
      source.isMeshStandardMaterial ||
      source.isMeshPhysicalMaterial ||
      source.isMeshPhongMaterial ||
      source.isMeshLambertMaterial;
    const output = lit
      ? 'diffuseColor.rgb * (0.77 + 0.23 * max(0.0, dot(normal, normalize(vec3(-0.35,0.65,0.8))))) + totalEmissiveRadiance'
      : 'diffuseColor.rgb';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'outgoingLight = ' + output + ';\n#include <opaque_fragment>',
    );
  };
  m.customProgramCacheKey = () => source.customProgramCacheKey() + '|reference-diffuse';
  return m;
}

// An unshared corner index provides true barycentric coordinates for every
// original triangle, including UV seams, morphs and skin weights. Rasterize
// the faces with depth testing so back-facing and hidden edges cannot build up.
function triangleCorners(source) {
  if (!source.index) return source;
  const subset = new T.BufferGeometry();
  subset.setIndex(source.index);
  for (const key of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    if (source.attributes[key]) subset.setAttribute(key, source.attributes[key]);
    if (source.morphAttributes[key]) subset.morphAttributes[key] = source.morphAttributes[key];
  }
  subset.morphTargetsRelative = source.morphTargetsRelative;
  subset.groups = source.groups;
  const result = subset.toNonIndexed();
  result.setDrawRange(source.drawRange.start, source.drawRange.count);
  return result;
}

function edgeFinish(topology) {
  const m = new T.MeshStandardMaterial({ roughness: 1, flatShading: topology });
  m.onBeforeCompile = (s) => {
    s.vertexShader =
      'varying vec3 cornerWeights;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      int cornerId=gl_VertexID % 3;
      cornerWeights=vec3(cornerId==0,cornerId==1,cornerId==2);`,
      );
    s.fragmentShader =
      'varying vec3 cornerWeights;\n' +
      s.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      // The target has two samples per output dimension. Derivatives convert
      // barycentric widths to final photographic pixels, independent of depth.
      vec3 footprint=max(2.0*fwidth(cornerWeights),vec3(.00001));
      vec3 edgeDistance=cornerWeights/footprint;
      float d=min(min(edgeDistance.x,edgeDistance.y),edgeDistance.z);
      float altitude=1.0/max(max(footprint.x,footprint.y),footprint.z);
      float coverage=1.0-smoothstep(.02,.64,d);
      float legibility=smoothstep(.24,2.6,altitude);
      float studioShade=.5+.5*dot(normal,normalize(vec3(-.42,.68,.72)));
      vec3 faceInk=${topology ? 'mix(vec3(.032,.11,.13),vec3(.30,.61,.58),studioShade)' : 'mix(vec3(.009,.022,.032),vec3(.025,.052,.068),studioShade)'};
      vec3 lineInk=${topology ? 'vec3(.010,.033,.034)' : 'vec3(.69,.93,.87)'};
      outgoingLight=mix(faceInk,lineInk,coverage*mix(${topology ? '.39' : '.13'},.98,legibility));
      #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => (topology ? 'reference-facets-v1' : 'reference-wire-v1');
  return m;
}

function printPass(texture) {
  const scene = new T.Scene();
  scene.name = 'Character Ref print';
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const material = new T.ShaderMaterial({
    uniforms: { picture: { value: texture }, toneMappingExposure: { value: 1.06 } },
    vertexShader:
      'varying vec2 paperUV; void main() {paperUV=position.xy*.5+.5;gl_Position=vec4(position,1.);}',
    fragmentShader: `uniform sampler2D picture;
      varying vec2 paperUV;
      #include <tonemapping_pars_fragment>
      void main() {gl_FragColor=vec4(ACESFilmicToneMapping(texture2D(picture,paperUV).rgb),1.);}`,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    scene,
    camera: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createRefRenderer(stage) {
  const renderer = stage.renderer;
  const scene = new T.Scene();
  scene.name = 'Character Ref';
  const paper = new T.Color('#d4d9d1'),
    blueprintPaper = new T.Color('#29434d');
  scene.background = paper;
  const sky = new T.HemisphereLight(0xfff9ed, 0xafbac4, 1.02);
  const key = new T.DirectionalLight(0xfff4e5, 2.5);
  const rim = new T.DirectionalLight(0xe3f0ff, 1.52);
  scene.add(sky, key, key.target, rim, rim.target);
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 40);
  const beauty = new T.WebGLRenderTarget(1, 1, {
    type: renderer.extensions.has('EXT_color_buffer_float') ? T.HalfFloatType : T.UnsignedByteType,
  });
  const photo = new T.WebGLRenderTarget(1, 1, { colorSpace: T.SRGBColorSpace, depthBuffer: false });
  const print = printPass(beauty.texture);
  const studio = {
    wireframe: edgeFinish(false),
    topology: edgeFinish(true),
    clay: new T.MeshStandardMaterial({ color: '#c8aa92', roughness: 0.8 }),
  };
  const stats = {
    renders: 0,
    submitted: 0,
    cancelled: 0,
    warms: 0,
    lastDraws: 0,
    peakDraws: 0,
    lastTriangles: 0,
    lastLines: 0,
    contextLosses: 0,
    disposed: false,
  };
  const groups = new Map(),
    outlines = new Map(),
    diffuse = new Map(),
    warmed = new Set(),
    listeners = new AbortController();
  const direction = new T.Vector3(),
    side = new T.Vector3(),
    up = new T.Vector3();
  const origin = new T.Vector3(),
    extent = new T.Vector3();
  let current,
    inUse,
    retired,
    nodes = [],
    readBuffer,
    epoch = 0,
    lost = false,
    queue = Promise.resolve();

  function dropModel() {
    for (const m of diffuse.values()) m.dispose();
    diffuse.clear();
    for (const [source, { geometry }] of outlines) if (source !== geometry) geometry.dispose();
    outlines.clear();
    groups.clear();
    nodes = [];
    current = null;
    retired = null;
    warmed.clear();
  }
  function releaseModel(model) {
    if (!model || current !== model) return;
    if (inUse === model) retired = model;
    else dropModel();
  }
  function bind(model, subject) {
    if (current !== model) {
      dropModel();
      current = model;
    }
    if (!groups.has(subject)) {
      const list = [];
      subject.traverse((o) => {
        if (o.isMesh) list.push({ mesh: o, source: o.material, shape: o.geometry, modes: new Map() });
      });
      groups.set(subject, list);
    }
    nodes = groups.get(subject);
  }
  function finish(source, mode) {
    if (!source.visible) return source;
    if (studio[mode]) return studio[mode];
    if (!diffuse.has(source)) diffuse.set(source, diffuseFinish(source));
    return diffuse.get(source);
  }
  function apply(mode) {
    for (const row of nodes) {
      const shape = row.shape;
      if (mode === 'wireframe' || mode === 'topology') {
        const stamp = shape.attributes.position.version + ':' + (shape.attributes.normal?.version ?? 0);
        let old = outlines.get(shape);
        if (!old || old.stamp !== stamp) {
          if (old && old.geometry !== shape) old.geometry.dispose();
          old = { stamp, geometry: triangleCorners(shape) };
          outlines.set(shape, old);
        }
        row.mesh.geometry = old.geometry;
      } else row.mesh.geometry = shape;
      if (mode === 'color') row.mesh.material = row.source;
      else {
        if (!row.modes.has(mode))
          row.modes.set(
            mode,
            Array.isArray(row.source) ? row.source.map((m) => finish(m, mode)) : finish(row.source, mode),
          );
        row.mesh.material = row.modes.get(mode);
      }
    }
  }
  function frame(model, panel, w, h) {
    const target = panel.target ?? 'body',
      box = model.bounds(target);
    if (!box || box.isEmpty() || !Number.isFinite(box.max.lengthSq() + box.min.lengthSq()))
      throw new Error('No posed geometry for reference target ' + target);
    box.getCenter(origin);
    box.getSize(extent);
    const [defaultYaw, defaultElevation] = views[panel.view] ?? views.front;
    const yaw = panel.yaw ?? defaultYaw,
      elevation = panel.elevation ?? panel.pitch ?? defaultElevation;
    direction.set(
      Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation),
    );
    side.set(Math.cos(yaw), 0, -Math.sin(yaw));
    up.crossVectors(direction, side);
    const aspect = w / h;
    let width, height;
    if (target === 'body') {
      // All five turnarounds use the same world-to-pixel scale and sole line:
      // the widest possible horizontal projection fits even on a narrow card.
      width = Math.hypot(extent.x, extent.z);
      height = extent.y;
    } else {
      width = Math.abs(side.x) * extent.x + Math.abs(side.z) * extent.z;
      height = Math.abs(up.x) * extent.x + Math.abs(up.y) * extent.y + Math.abs(up.z) * extent.z;
    }
    const padding =
      panel.padding ??
      (target === 'body'
        ? 1.115
        : target === 'face'
          ? 1.15
          : target === 'head' || target === 'portrait'
            ? 1.13
            : 1.2);
    const half = Math.max(0.009, height, width / aspect) * padding * 0.5;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.position.copy(origin).addScaledVector(direction, 7);
    camera.lookAt(origin);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // The softboxes rotate with the study camera, so rear hardware and the
    // dark hairline receive the same light as the face and front seams.
    key.target.position.copy(origin);
    rim.target.position.copy(origin);
    key.position
      .copy(origin)
      .addScaledVector(side, -3.4)
      .addScaledVector(up, 4.1)
      .addScaledVector(direction, 4.5);
    rim.position
      .copy(origin)
      .addScaledVector(side, 3.5)
      .addScaledVector(up, 2.6)
      .addScaledVector(direction, -2.9);
  }

  async function warm(mode, allowed) {
    if (warmed.has(mode)) return;
    // Pinned r170 polls programs through mutable material records. Holds on
    // the actual programs let a superseded rig or context loss cancel safely.
    const adapter = {
      getRenderTarget: () => renderer.getRenderTarget(),
      setRenderTarget: (t) => renderer.setRenderTarget(t),
      compileAsync(s, c, lights) {
        if (!allowed()) return Promise.resolve();
        const materials = renderer.compile(s, c, lights);
        const programs = [
          ...new Set(Array.from(materials, (m) => renderer.properties.get(m).currentProgram)),
        ];
        return new Promise((resolve) => {
          function check() {
            if (!allowed() || programs.every((p) => p.isReady())) resolve();
            else setTimeout(check, 10);
          }
          check();
        });
      },
    };
    const jobs = [[scene, camera, beauty]];
    if (!warmed.has('print')) jobs.push([print.scene, print.camera, photo]);
    stats.warms++;
    await warmShaders(adapter, jobs);
    if (allowed()) {
      warmed.add(mode);
      warmed.add('print');
    }
  }

  async function photograph(model, panel, w, h, canPresent) {
    const version = epoch;
    const allowed = () =>
      version === epoch &&
      !lost &&
      !stats.disposed &&
      !document.hidden &&
      !renderer.getContext().isContextLost() &&
      canPresent();
    function cancelled() {
      stats.cancelled++;
      return null;
    }
    if (!allowed()) return cancelled();
    if (!(w > 0 && h > 0 && Number.isFinite(w + h))) return cancelled();
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const mode = panel.mode ?? 'color';
    if (!['color', 'diffuse', 'wireframe', 'clay', 'topology'].includes(mode))
      throw new Error('Unknown reference material mode ' + mode);
    model.pose(panel.expression ?? panel.pose ?? 'neutral');
    const subject = panel.isolate ? model.isolate(panel.target) : model.root;
    bind(model, subject);
    inUse = model;
    const parent = subject.parent;
    scene.add(subject);
    try {
      subject.updateMatrixWorld(true);
      frame(model, panel, w, h);
      scene.background = mode === 'wireframe' ? blueprintPaper : paper;
      scene.environment = stage.scene.environment;
      scene.environmentIntensity = stage.scene.environmentIntensity;
      const sampling = mode === 'wireframe' || mode === 'topology' ? 2 : 1;
      beauty.setSize(w * sampling, h * sampling);
      photo.setSize(w, h);
      if (readBuffer?.length !== w * h * 4) readBuffer = new Uint8Array(w * h * 4);
      apply(mode);
      await warm(subject.uuid + '/' + mode, allowed);
      if (!allowed()) return cancelled();
      // All target changes occur synchronously. Three returns a fenced PBO
      // readback; the simulator resumes with its own framebuffer immediately.
      const gl = renderer.getContext(),
        pack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
      const previous = renderer.getRenderTarget(),
        face = renderer.getActiveCubeFace(),
        mip = renderer.getActiveMipmapLevel();
      const shadow = renderer.shadowMap.needsUpdate,
        autoClear = renderer.autoClear;
      const info = renderer.info,
        render = info.render,
        autoReset = info.autoReset;
      const { calls, triangles, lines, points } = render;
      let pending;
      try {
        renderer.autoClear = false;
        info.autoReset = false;
        renderer.setRenderTarget(beauty);
        renderer.render(scene, camera);
        stats.submitted++;
        if (!allowed()) return cancelled();
        renderer.setRenderTarget(photo);
        renderer.render(print.scene, print.camera);
        stats.submitted++;
        stats.lastDraws = render.calls - calls;
        stats.peakDraws = Math.max(stats.peakDraws, stats.lastDraws);
        stats.lastTriangles = render.triangles - triangles;
        stats.lastLines = render.lines - lines;
        pending = renderer.readRenderTargetPixelsAsync(photo, 0, 0, w, h, readBuffer);
      } finally {
        renderer.setRenderTarget(previous, face, mip);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
        renderer.shadowMap.needsUpdate = shadow;
        renderer.autoClear = autoClear;
        info.autoReset = autoReset;
        Object.assign(render, { calls, triangles, lines, points });
      }
      await pending;
      if (!allowed()) return cancelled();
      const image = new ImageData(w, h),
        stride = w * 4;
      for (let y = 0; y < h; y++) {
        const at = (h - y - 1) * stride;
        image.data.set(readBuffer.subarray(at, at + stride), y * stride);
      }
      stats.renders++;
      return image;
    } catch (error) {
      if (!allowed()) return cancelled();
      throw error;
    } finally {
      apply('color');
      subject.removeFromParent();
      parent?.add(subject);
      inUse = null;
      if (retired === model) dropModel();
    }
  }

  const opts = { signal: listeners.signal };
  stage.canvas.addEventListener(
    'webglcontextlost',
    () => {
      epoch++;
      lost = true;
      stats.contextLosses++;
      // Drop the old context's listeners before the live sheet can retire
      // its cloned models. Finished photographs belong to the DOM.
      apply('color');
      current?.releaseGPU();
      dropModel();
      for (const m of Object.values(studio)) m.dispose();
      print.dispose();
      beauty.dispose();
      photo.dispose();
    },
    opts,
  );
  stage.canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
    },
    opts,
  );
  function render(model, panel, w, h, canPresent = () => true) {
    const next = queue.then(() => photograph(model, panel, w, h, canPresent));
    queue = next.catch(() => {});
    return next;
  }
  function dispose() {
    if (stats.disposed) return;
    epoch++;
    stats.disposed = true;
    listeners.abort();
    // The current awaited readback/warm must restore any temporarily assigned
    // actor finishes before its material references are released.
    queue.then(() => {
      dropModel();
      beauty.dispose();
      photo.dispose();
      print.dispose();
      for (const m of Object.values(studio)) m.dispose();
    });
  }
  return { render, stats, releaseModel, dispose };
}
