// A private instance of the real playable rig. The sheet can sample an authored
// expression while the simulator continues to move independently.
import * as T from 'three';
import { createActor } from './rig.js';
import { createController, FIXED_DT } from './motion.js';
import { optimizeCharacter } from './render-batches.js';
import { setModelDetail } from './model-tier.js';
import { heights, names } from './ui.js';
import { freezeSurface, components, joinPart, snapshotResources } from './diagram-snapshot.js';
import { describeRoma, sippyCatalog } from './diagram-outer-parts.js';
import { loadAvatar } from './avatar-builder.js';
const still = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };
const humanCues = {
  sippy: {
    neutral: {},
    smile: { faceCue: { smile: 0.78, squint: 0.64, browLift: 0.18 } },
    laugh: { faceCue: { smile: 1, squint: 0.91, browLift: 0.29 } },
    excited: { faceCue: { smile: 0.99, surprise: 0.16, browLift: 0.82, gazeY: 0.1 } },
    curious: { faceCue: { smile: 0.17, browLift: 0.56, gazeX: 0.32, asymmetry: 0.43 } },
    thinking: { emote: 0.56, faceCue: { focus: 0.42, squint: 0.28, gazeX: -0.46, gazeY: -0.43, asymmetry: -0.5 } },
    surprised: { faceCue: { surprise: 1, browLift: 1, gazeY: 0.16 } },
    focused: { faceCue: { focus: 0.96, squint: 0.45, gazeY: -0.18 } },
    wink: { faceCue: { smile: 0.65, wink: 1, squint: 0.18, asymmetry: 0.33 } },
    confident: { faceCue: { smile: 0.37, squint: 0.15, browLift: 0.21, gazeX: -0.23, asymmetry: 0.72 } },
  },
  roma: {
    neutral: {},
    smile: { faceCue: { smile: 0.91, squint: 0.61, browLift: 0.24 } },
    curious: { faceCue: { smile: 0.19, surprise: 0.16, browLift: 0.69, gazeX: 0.27, gazeY: 0.3, asymmetry: 0.58 } },
    surprised: { faceCue: { surprise: 0.92, browLift: 1, gazeY: 0.2 } },
    thinking: { emote: 0.44, faceCue: { focus: 0.33, squint: 0.17, browLift: 0.42, gazeX: 0.56, gazeY: 0.38, asymmetry: -0.46 } },
    wink: { faceCue: { smile: 0.7, wink: 1, squint: 0.13, asymmetry: 0.35 } },
    laugh: { faceCue: { smile: 1, squint: 0.91, browLift: 0.54, gazeY: 0.09 } },
    focused: { faceCue: { focus: 0.89, squint: 0.4, gazeY: -0.13, asymmetry: 0.24 } },
    determined: { faceCue: { smile: 0.10, focus: 0.9, squint: 0.18, browLift: 0.16, gazeX: -0.16, asymmetry: 0.49 } },
  },
};
function humanCue(name, key) {
  const cues = humanCues[name];
  if (!cues || !Object.hasOwn(cues, key))
    throw new Error('Unknown expression for ' + name + ': ' + key);
  return cues[key];
}

const neutralTime = 12 * FIXED_DT;
const offset = 2166136261;
const mix = (h, x) => Math.imul(h ^ x, 16777619) >>> 0;
function textHash(s, h = offset) {
  for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
  return h;
}
function bytesHash(array, h = offset) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let i = 0;
  for (; i + 3 < bytes.length; i += 4)
    h = mix(h, bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
  for (; i < bytes.length; i++) h = mix(h, bytes[i]);
  return mix(h, bytes.length);
}
// Per-vertex digests let a single original Roma batch retain separate dependency
// records for its jacket, trousers and strap. A dye edit does not change shape.
function vertexDigests(g) {
  const shape = new Uint32Array(g.attributes.position.count).fill(offset);
  const finish = new Uint32Array(shape.length).fill(offset);
  const attrs = { ...g.attributes };
  for (const [name, list] of Object.entries(g.morphAttributes)) list.forEach((a, i) => (attrs[name + i] = a));
  for (const [key, a] of Object.entries(attrs)) {
    const target = /^(color|uv|tangent)/.test(key) ? finish : shape;
    const raw = a.array,
      bits = raw instanceof Float32Array ? new Uint32Array(raw.buffer, raw.byteOffset, raw.length) : raw;
    const layout = textHash(key + a.itemSize + ':' + a.normalized);
    for (let i = 0; i < target.length; i++) {
      let h = mix(target[i], layout);
      for (let k = 0; k < a.itemSize; k++) h = mix(h, bits[i * a.itemSize + k]);
      target[i] = h;
    }
  }
  return { shape, finish };
}

function materialHooks(source) {
  const probe = {
    vertexShader: T.ShaderLib.standard.vertexShader,
    fragmentShader: T.ShaderLib.standard.fragmentShader,
    uniforms: {},
  };
  source.onBeforeCompile(probe, null);
  return probe;
}
function finishKey(m, probe, textureKeys) {
  const fields = [
    'color',
    'roughness',
    'metalness',
    'emissive',
    'emissiveIntensity',
    'opacity',
    'side',
    'transparent',
    'vertexColors',
    'alphaTest',
    'clearcoat',
    'clearcoatRoughness',
    'sheen',
    'sheenColor',
    'anisotropy',
    'specularIntensity',
    'specularColor',
    'bumpScale',
    'normalScale',
    'depthWrite',
    'polygonOffset',
  ];
  const values = fields.map((f) => m[f]?.toArray?.() ?? m[f] ?? null);
  const lamps = {};
  let h = textHash(JSON.stringify(values));
  function texture(t) {
    if (!textureKeys.has(t)) {
      const im = t.source.data;
      let key = textHash(
        JSON.stringify([
          t.name,
          im?.width,
          im?.height,
          t.colorSpace,
          t.format,
          t.type,
          t.wrapS,
          t.wrapT,
          t.repeat.toArray(),
          t.offset.toArray(),
          t.rotation,
        ]),
      );
      if (im?.data && ArrayBuffer.isView(im.data)) key = bytesHash(im.data, key);
      textureKeys.set(t, key);
    }
    return textureKeys.get(t);
  }
  for (const [k, t] of Object.entries(m)) if (t?.isTexture) h = mix(textHash(k, h), texture(t));
  for (const [k, { value }] of Object.entries(probe.uniforms)) {
    if (value?.isTexture) h = mix(textHash(k, h), texture(value));
    else lamps[k] = value;
  }
  return { hash: textHash(probe.fragmentShader, textHash(probe.vertexShader, h)), lamps };
}

function ownDrawResources(root) {
  const geometries = new Map(),
    materials = new Map(),
    textures = new Map(),
    skeletons = new Set();
  function texture(t) {
    if (!textures.has(t)) {
      const copy = t.clone();
      copy.needsUpdate = true;
      textures.set(t, copy);
    }
    return textures.get(t);
  }
  function material(source) {
    if (materials.has(source)) return materials.get(source);
    const copy = new source.constructor().copy(Object.assign(Object.create(source), { userData: {} }));
    for (const [key, v] of Object.entries(copy)) if (v?.isTexture) copy[key] = texture(v);
    const compile = source.onBeforeCompile,
      key = source.customProgramCacheKey();
    copy.onBeforeCompile = (shader, renderer) => {
      const builtin = new Set(Object.keys(shader.uniforms));
      compile.call(source, shader, renderer);
      for (const [k, u] of Object.entries(shader.uniforms))
        if (!builtin.has(k) && u.value?.isTexture) shader.uniforms[k] = { value: texture(u.value) };
      // Face and visor vector uniforms stay connected to this private rig's pose.
    };
    copy.customProgramCacheKey = () => key;
    materials.set(source, copy);
    return copy;
  }
  root.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    if (!geometries.has(mesh.geometry)) geometries.set(mesh.geometry, mesh.geometry.clone());
    mesh.geometry = geometries.get(mesh.geometry);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material) : material(mesh.material);
    if (mesh.skeleton) skeletons.add(mesh.skeleton);
  });
  function releaseGPU() {
    for (const s of skeletons) s.dispose();
    for (const g of geometries.values()) g.dispose();
    for (const m of materials.values()) m.dispose();
    for (const t of textures.values()) t.dispose();
  }
  function dispose() {
    root.removeFromParent();
    root.clear();
    releaseGPU();
    skeletons.clear();
    geometries.clear();
    materials.clear();
    textures.clear();
  }
  return { releaseGPU, dispose };
}
// Weight the authored dye by rendered triangle area: narrow, densely tessellated
// embroidery should not outweigh the much larger cloth underneath it.
function pigment(patches, materialId) {
  const tones = new Map(),
    color = new T.Color(),
    tint = new T.Color(),
    sample = new T.Color();
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  for (const patch of patches) {
    const { material, indices, world, mesh } = patch;
    if (materialId && material.userData.blueprintId !== materialId) continue;
    const dye = material.vertexColors && mesh.geometry.attributes.color;
    for (let j = 0; j < indices.length; j += 3) {
      const i0 = indices[j],
        i1 = indices[j + 1],
        i2 = indices[j + 2];
      a.fromArray(world, i0 * 3);
      b.fromArray(world, i1 * 3).sub(a);
      c.fromArray(world, i2 * 3).sub(a);
      const area = b.cross(c).length();
      if (!area) continue;
      color.copy(material.color);
      if (dye) {
        tint
          .fromBufferAttribute(dye, i0)
          .add(sample.fromBufferAttribute(dye, i1))
          .add(sample.fromBufferAttribute(dye, i2))
          .multiplyScalar(1 / 3);
        color.multiply(tint);
      }
      const hex = color.getHex(),
        bucket = ((hex >> 19) << 10) | (((hex >> 11) & 31) << 5) | ((hex >> 3) & 31);
      let tone = tones.get(bucket);
      if (!tone) tones.set(bucket, (tone = [0, 0, 0, 0]));
      tone[0] += area;
      tone[1] += color.r * area;
      tone[2] += color.g * area;
      tone[3] += color.b * area;
    }
  }
  const tone = Array.from(tones.values()).sort((a, b) => b[0] - a[0])[0];
  if (!tone) throw Error('Missing palette finish: ' + materialId);
  return '#' + color.setRGB(tone[1] / tone[0], tone[2] / tone[0], tone[3] / tone[0]).getHexString();
}

const viewAngles = {
  front: [0, 0],
  'three-quarter': [Math.PI / 4, 0],
  right: [-Math.PI / 2, 0],
  profile: [-Math.PI / 2, 0],
  back: [Math.PI, 0],
  'rear-three-quarter': [(-3 * Math.PI) / 4, 0],
  upward: [0.15, -0.36],
};
function projection(box, axis) {
  const cen = box.getCenter(new T.Vector3()),
    half = box.getSize(new T.Vector3()).multiplyScalar(0.5);
  return [cen.dot(axis), half.dot(new T.Vector3(Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)))];
}

// Let typing, keyboard navigation and viewport changes run between construction
// batches. The selected hero's production builder itself is synchronous.
async function yieldForInput(alive) {
  if (!alive()) throw new DOMException('Reference superseded', 'AbortError');
  if (typeof window === 'undefined') return;
  if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else await new Promise((resolve) => setTimeout(resolve, 0));
  if (!alive()) throw new DOMException('Reference superseded', 'AbortError');
}

export async function buildRefModel(name, tier, alive = () => true) {
  if (!names.includes(name) || !['high', 'mobile'].includes(tier))
    throw Error('Unknown reference character or tier');
  const build = await loadAvatar(name, tier),
    human = name !== 'hummin';
  const robot = human ? null : await import('./ref-robot.js');
  const describeRobot = human ? null : (await import('./diagram-hummin.js')).describeHummin;
  const rig = createActor(name, heights[names.indexOf(name)]);
  let drawResources,
    disposed = false;
  try {
    await yieldForInput(alive);
    const animate = build(rig),
      root = rig.root;
    await yieldForInput(alive);
    const ctrl = createController(rig);
    await rig.loadSecondary();
    const describe = name === 'sippy' ? sippyCatalog(rig) : name === 'roma' ? describeRoma : describeRobot;
    let current = null;
    const frames = new Map(),
      textureKeys = new WeakMap(),
      finishes = new Map();
    const parts = new Map(),
      partHead = [],
      partFace = [],
      boundsCache = new Map();
    function pose(key = 'neutral') {
      if (key === current) return;
      // A repeatable upright carrier keeps running/jumping facial studies in
      // view. Facial morphs, gesture joints and OLED uniforms are all written
      // by the normal live animator, including its filtered robot expressions.
      const cue = robot ? robot.robotExpressionFrame(key) : humanCue(name, key);
      ctrl.reset();
      // Rewind stateful visor easing, gaze servos and secondary springs even
      // when the requested clip happens later in time than the previous one.
      animate({ ...ctrl.step(FIXED_DT, still), time: -1, dt: 0 });
      ctrl.reset();
      const end = cue.time ?? neutralTime;
      const steps = key === 'neutral' ? 12 : 32;
      for (let i = 0; i < steps; i++) {
        const base = ctrl.step(FIXED_DT, still);
        animate({ ...base, ...cue, time: end - (steps - 1 - i) * FIXED_DT });
        ctrl.finishPose();
      }
      root.updateMatrixWorld(true);
      current = key;
      boundsCache.clear();
    }
    pose('neutral');
    setModelDetail(root, tier);
    const specs = robot?.robotPalette ?? (await import('./ref-panels.js')).sheetFor(name).palette;
    const palettePatches = new Map(specs.map((s) => [s.target, []]));
    let triangles = 0;
    const tierSources = new Map();
    root.traverseVisible((mesh) => {
      if (mesh.isMesh) tierSources.set(mesh, mesh.geometry);
    });
    let deadline = performance.now() + 10;
    for (const mesh of tierSources.keys()) {
      if (performance.now() >= deadline) {
        await yieldForInput(alive);
        deadline = performance.now() + 10;
      }
      const snapshot = freezeSurface(mesh),
        digests = vertexDigests(mesh.geometry);
      for (const c of components(mesh, name !== 'sippy', snapshot)) {
        const { name: label, layer } = describe(rig, mesh, c),
          ids = Array.from(new Set(c.ids));
        if (!finishes.has(c.material))
          finishes.set(c.material, finishKey(c.material, materialHooks(c.material), textureKeys));
        const paint = finishes.get(c.material);
        let shape = offset,
          finish = paint.hash;
        for (const i of c.ids) {
          shape = mix(shape, digests.shape[i]);
          finish = mix(finish, digests.finish[i]);
        }
        const p = {
          mesh,
          parent: mesh.parent,
          ids,
          indices: c.ids,
          material: c.material,
          shape,
          finish,
          paint,
        };
        palettePatches
          .get(label)
          ?.push({ mesh, material: c.material, indices: c.ids, world: snapshot.world });
        if (!parts.has(label)) parts.set(label, []);
        parts.get(label).push(p);
        triangles += c.triangles;
        let ancestor = mesh.parent;
        while (ancestor && ancestor !== rig.head) ancestor = ancestor.parent;
        if (ancestor === rig.head) {
          partHead.push(label);
          if (
            layer === 'skin' &&
            !/hair|scalp|crest|quiff|tapered|sideburn|forelock|waves|crown|fringe/i.test(label)
          )
            partFace.push(label);
        }
      }
    }
    const aliases = { ...robot?.robotTargets };
    aliases.body = [...parts.keys()];
    aliases.head ??= [...new Set(partHead)];
    aliases.face ??= [...new Set(partFace)];
    aliases.portrait = [
      ...new Set([
        ...aliases.head,
        ...(name === 'sippy'
          ? ['Standing collar']
          : name === 'roma'
            ? ['Neck', 'Rolled hood']
            : ['Knitted scarf collar']),
      ]),
    ];
    const palette = specs.map(({ label, target, materialId }) => ({
      name: label,
      hex: pigment(palettePatches.get(target), materialId),
    }));
    palettePatches.clear();
    setModelDetail(root, 'high');
    await yieldForInput(alive);
    optimizeCharacter(rig);
    setModelDetail(root, tier);
    // The optimizer removes and packs rigid source meshes. Restore the exact
    // LOD on retired CPU sources before looking up their captured vertex IDs.
    for (const [mesh, geometry] of tierSources) if (!mesh.parent) mesh.geometry = geometry;
    tierSources.clear();
    await yieldForInput(alive);
    drawResources = ownDrawResources(root);
    const crops = new Map();
    function isolate(target) {
      const key = current + '/' + JSON.stringify(target);
      if (crops.has(key)) return crops.get(key).root;
      const records = [],
        resources = snapshotResources(),
        group = new T.Group();
      const snapshots = new Map();
      try {
        for (const id of Array.isArray(target) ? target : (aliases[target] ?? [target])) {
          const pieces = parts.get(id);
          if (!pieces) throw Error('Unknown reference target: ' + id);
          const patches = pieces.map((p) => {
            if (!snapshots.has(p.mesh)) {
              if (!p.mesh.parent) p.mesh.matrixWorld.multiplyMatrices(p.parent.matrixWorld, p.mesh.matrix);
              snapshots.set(p.mesh, freezeSurface(p.mesh));
            }
            return { mesh: p.mesh, material: p.material, ids: p.indices, snapshot: snapshots.get(p.mesh) };
          });
          const mesh = joinPart(patches, resources);
          mesh.name = id;
          group.add(mesh);
          records.push({ mesh });
        }
        crops.set(key, { root: group, dispose: () => resources.dispose(records) });
        return group;
      } catch (error) {
        resources.dispose(records);
        throw error;
      }
    }
    function measure(id) {
      if (boundsCache.has(id)) return boundsCache.get(id);
      if (!parts.has(id)) throw Error('Unknown reference target: ' + id);
      const box = new T.Box3(),
        v = new T.Vector3(),
        xyz = new Float32Array(3),
        bits = new Uint32Array(xyz.buffer);
      let positions = offset;
      for (const { mesh, parent, ids } of parts.get(id)) {
        if (!mesh.parent) mesh.matrixWorld.multiplyMatrices(parent.matrixWorld, mesh.matrix);
        for (const i of ids) {
          mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
          box.expandByPoint(v);
          xyz[0] = v.x;
          xyz[1] = v.y;
          xyz[2] = v.z;
          positions = mix(mix(mix(positions, bits[0]), bits[1]), bits[2]);
        }
      }
      const measurement = { box, positions };
      boundsCache.set(id, measurement);
      return measurement;
    }
    function bounds(target = 'body') {
      const ids = Array.isArray(target) ? target : (aliases[target] ?? [target]),
        b = new T.Box3();
      for (const id of ids) b.union(measure(id).box);
      return b;
    }
    // Geometry and dyed finishes are content-hashed once. At each distinct
    // expression, add the real pose, morph weights and live shader uniforms.
    function state() {
      if (frames.has(current)) return frames.get(current);
      const result = new Map(),
        inks = new Map();
      for (const [id, patches] of parts) {
        const { box, positions } = measure(id);
        let shape = positions,
          finish = offset;
        for (const p of patches) {
          shape = mix(shape, p.shape);
          if (!inks.has(p.paint))
            inks.set(
              p.paint,
              textHash(
                JSON.stringify(Object.entries(p.paint.lamps).map(([k, v]) => [k, v?.toArray?.() ?? v])),
              ),
            );
          finish = mix(mix(finish, p.finish), inks.get(p.paint));
        }
        result.set(id, { shape, finish, box: box.clone() });
      }
      frames.set(current, result);
      return result;
    }
    function signature(panel, width = 1, height = 1) {
      const expression = panel.expression ?? panel.pose ?? 'neutral',
        target = panel.target ?? 'body';
      pose(expression);
      const poseParts = state(),
        box = bounds(target),
        def = viewAngles[panel.view] ?? viewAngles.front;
      const yaw = panel.yaw ?? def[0],
        pitch = panel.elevation ?? panel.pitch ?? def[1];
      const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
        up = new T.Vector3(
          -Math.sin(yaw) * Math.sin(pitch),
          Math.cos(pitch),
          -Math.cos(yaw) * Math.sin(pitch),
        );
      const [cx, halfX] = projection(box, right),
        [cy, halfY] = projection(box, up);
      const pad =
        panel.padding ??
        (target === 'body'
          ? 1.115
          : target === 'face'
            ? 1.15
            : target === 'head' || target === 'portrait'
              ? 1.13
              : 1.2);
      const aspect = width / height,
        extent = Math.max(0.0045, halfX / aspect, halfY) * pad;
      const coloured = !['clay', 'topology', 'wireframe'].includes(panel.mode);
      let hash = textHash(
        JSON.stringify([
          name,
          tier,
          expression,
          panel.mode,
          panel.view,
          yaw,
          pitch,
          target,
          pad,
          box.min,
          box.max,
        ]),
      );
      const isolatedIds = new Set(Array.isArray(target) ? target : (aliases[target] ?? [target]));
      for (const [id, { shape, finish, box: region }] of poseParts) {
        const [x, w] = projection(region, right),
          [y, height] = projection(region, up);
        if (
          panel.isolate
            ? isolatedIds.has(id)
            : target === 'body' ||
              (Math.abs(x - cx) <= extent * aspect + w && Math.abs(y - cy) <= extent + height)
        ) {
          hash = mix(hash, shape);
          if (coloured) hash = mix(hash, finish);
        }
      }
      return hash.toString(36);
    }
    function releaseCrops() {
      for (const crop of crops.values()) crop.dispose();
      crops.clear();
    }
    return {
      root,
      pose,
      bounds,
      signature,
      isolate,
      triangles,
      palette,
      releaseGPU() {
        releaseCrops();
        drawResources.releaseGPU();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        releaseCrops();
        drawResources.dispose();
        parts.clear();
        boundsCache.clear();
        frames.clear();
        finishes.clear();
      },
    };
  } catch (error) {
    drawResources?.dispose();
    rig.root.clear();
    throw error;
  }
}
