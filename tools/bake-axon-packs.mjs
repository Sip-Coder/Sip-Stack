// Recreate the neutral inspection assets from the same posed rig used by the
// Worker. Node 24, three@0.170.0 and meshoptimizer@1.3.0. THREE_ROOT and
// MESHOPT_ROOT may point to unpacked npm packages instead of node_modules.
import { writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({
    resolve(specifier, context, next) {
      const file =
        specifier === 'three'
          ? 'build/three.module.js'
          : specifier.startsWith('three/addons/')
            ? 'examples/jsm/' + specifier.slice(13)
            : null;
      return file
        ? { url: pathToFileURL(resolve(root, file)).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const { MeshoptEncoder: encoder } = await import(
  process.env.MESHOPT_ROOT
    ? pathToFileURL(resolve(process.env.MESHOPT_ROOT, 'meshopt_encoder.js'))
    : 'meshoptimizer/encoder'
);
const { REVISION } = await import('three');
if (REVISION !== '170') throw new Error('The baker requires three@0.170.0');
await encoder.ready;
const { buildDiagramModel } = await import('../docs/characters/diagram-fit-model.js');
const { describeAxonMaterial } = await import('../docs/characters/diagram-baked-material.js');
const { decodeAxonPack } = await import('../docs/characters/diagram-baked-pack.js');
const output = new URL('../docs/characters/assets/', import.meta.url);
const sa = 'Z-Anatomy · CC BY-SA 4.0';
const stride4 = (n) => Math.ceil(n / 4) * 4;
const bytesOf = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const type = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' };
const primaryCredit =
  'Visible Human CT skeleton by S. H. Alavi and M. Asseln (BoneHub), after Andreassen et al. and the NLM Visible Human Project. BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. Visible Human Female muscles, where present, by Andreassen et al. under CC BY 4.0. Source anatomy adapted and compressed by Sip Studies. CC BY 4.0 applies to these licensed anatomical components (https://creativecommons.org/licenses/by/4.0/). Original stylized skin, hair and apparel by Sip Studies. See SKELETON-LICENSE.md and MUSCLE-SKIN-LICENSE.md.';
const shareAlikeCredit =
  'Latissimus dorsi and rectus abdominis derived from Z-Anatomy (https://github.com/Z-Anatomy/Models-of-human-anatomy), based on BodyParts3D, © The Database Center for Life Science. Sip Studies fitted, colored and compressed these surfaces. This adaptation is licensed under CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/. See MUSCLE-SKIN-LICENSE.md.';

function groupParts(parts) {
  const batches = new Map();
  for (const part of parts) {
    const { geometry, material, renderOrder } = part.mesh;
    const indices = geometry.index.array;
    const groups = Array.isArray(material)
      ? geometry.groups
      : [{ start: 0, count: indices.length, materialIndex: 0 }];
    for (const { start, count, materialIndex } of groups) {
      const finish = Array.isArray(material) ? material[materialIndex] : material;
      const key = [part.layer, renderOrder, finish.id].join('/');
      if (!batches.has(key)) batches.set(key, { layer: part.layer, renderOrder, finish, spans: [] });
      let lo = Infinity,
        hi = -1;
      for (let i = start; i < start + count; i++) {
        lo = Math.min(lo, indices[i]);
        hi = Math.max(hi, indices[i]);
      }
      batches.get(key).spans.push({ part, geometry, start, count, lo, hi });
    }
  }
  return batches.values();
}

// Repeated atlas names and anchor labels otherwise dominate the GLB JSON.
// Named parts and ranges stay discoverable in ordinary glTF inspection tools.
function partTable(parts) {
  const strings = [],
    keys = new Map();
  const intern = (value) => {
    if (value == null) return -1;
    if (!keys.has(value)) {
      keys.set(value, strings.length);
      strings.push(value);
    }
    return keys.get(value);
  };
  const rows = parts.map((part) => {
    const { geometry } = part.mesh;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const bounds = [...min.toArray(), ...max.toArray()].map((x) => Math.round(x * 1e6));
    const row = [
      part.order,
      part.name,
      intern(part.layer),
      intern(part.source),
      geometry.index.count / 3,
      bounds,
    ];
    if (part.scanNode) row.push({ scanNode: part.scanNode });
    if (part.muscleNode)
      row.push({
        muscleNode: part.muscleNode,
        atlasNode: part.atlasNode === part.muscleNode ? undefined : part.atlasNode,
        sourcePart: part.sourcePart,
        region: intern(part.region),
        anchors: part.attachments.map(({ index, role, bone, source, target, delta }) => [
          index,
          intern(role),
          intern(bone),
          ...[source, target, delta].flatMap((v) => v.toArray().map((x) => Math.round(x * 1e6))),
        ]),
      });
    return row;
  });
  return {
    partColumns: ['order', 'name', 'layerKey', 'sourceKey', 'triangles', 'boundsAt1e6', 'anatomy'],
    strings,
    parts: rows,
  };
}

function makePack(name, tier, parts, shareAlike) {
  const ext = 'EXT_meshopt_compression';
  const license = shareAlike ? 'CC BY-SA 4.0' : 'CC BY 4.0';
  const asset = {
    version: '2.0',
    generator: 'Sip Studies offline Axon baker',
    copyright: shareAlike ? shareAlikeCredit : primaryCredit,
    extras: {
      axon: {
        version: 2,
        name,
        tier,
        license,
        licenseScope: shareAlike
          ? 'All four fitted Z-Anatomy surfaces'
          : 'CC BY 4.0 covers the CT and muscle atlas surfaces. Sip Studies retains its original character artwork.',
        ...partTable(parts),
      },
    },
  };
  const gltf = {
    asset,
    extensionsUsed: [ext, 'KHR_mesh_quantization'],
    extensionsRequired: [ext, 'KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const chunks = [];
  let encodedOffset = 0,
    rawOffset = 0;
  const materials = new Map();
  function accessor(data, count, stride, mode, componentType, size, options = {}, filter = 'NONE') {
    const compressed =
      mode === 'ATTRIBUTES'
        ? encoder.encodeVertexBufferLevel(bytesOf(data), count, stride, 3, 0)
        : encoder.encodeGltfBuffer(bytesOf(data), count, stride, mode, 0);
    const view = {
      buffer: 1,
      byteOffset: rawOffset,
      byteLength: count * stride,
      target: mode === 'ATTRIBUTES' ? 34962 : 34963,
      extensions: {
        [ext]: {
          buffer: 0,
          byteOffset: encodedOffset,
          byteLength: compressed.length,
          count,
          byteStride: stride,
          mode,
          filter,
        },
      },
    };
    if (mode === 'ATTRIBUTES') view.byteStride = stride;
    chunks.push(compressed, new Uint8Array(stride4(compressed.length) - compressed.length));
    encodedOffset += stride4(compressed.length);
    rawOffset += stride4(view.byteLength);
    const bufferView = gltf.bufferViews.push(view) - 1;
    return gltf.accessors.push({ bufferView, componentType, count, type: type[size], ...options }) - 1;
  }
  for (const { layer, renderOrder, finish, spans } of groupParts(parts)) {
    const n = spans.reduce((s, r) => s + r.hi - r.lo + 1, 0);
    const ni = spans.reduce((s, r) => s + r.count, 0);
    const floats = (key, size, missing = 0) => {
      const array = new Float32Array(n * size);
      let cursor = 0;
      for (const { geometry, lo, hi } of spans) {
        const input = geometry.attributes[key],
          length = (hi - lo + 1) * size;
        if (input) {
          if (input.itemSize !== size || !(input.array instanceof Float32Array))
            throw new Error('Unexpected source attribute ' + key);
          array.set(input.array.subarray(lo * size, (hi + 1) * size), cursor);
        } else if (missing) array.fill(missing, cursor, cursor + length);
        cursor += length;
      }
      return array;
    };
    const position = floats('position', 3),
      nr = floats('normal', 3);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < position.length; ++i) {
      min[i % 3] = Math.min(min[i % 3], position[i]);
      max[i % 3] = Math.max(max[i % 3], position[i]);
    }
    const step = Math.max(...max.map((x, j) => x - min[j]), 1e-9) / 32767;
    const quantized = new Uint16Array(n * 4),
      normals = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const len = Math.hypot(nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]) || 1;
      for (let j = 0; j < 3; ++j) {
        quantized[i * 4 + j] = Math.round((position[i * 3 + j] - min[j]) / step);
        normals[i * 4 + j] = nr[i * 3 + j] / len;
      }
    }
    const attrs = {
      POSITION: accessor(quantized, n, 8, 'ATTRIBUTES', 5123, 3, {
        min: [0, 0, 0],
        max: max.map((v, i) => Math.round((v - min[i]) / step)),
      }),
      NORMAL: accessor(
        encoder.encodeFilterOct(normals, n, 4, 8),
        n,
        4,
        'ATTRIBUTES',
        5120,
        3,
        { normalized: true },
        'OCTAHEDRAL',
      ),
    };
    if (finish.vertexColors) {
      const colors = floats('color', 3, 1),
        rgba = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 3; j++)
          rgba[i * 4 + j] = Math.round(255 * Math.max(0, Math.min(1, colors[i * 3 + j])));
        rgba[i * 4 + 3] = 255;
      }
      attrs.COLOR_0 = accessor(rgba, n, 4, 'ATTRIBUTES', 5121, 4, { normalized: true });
    }
    const key = finish.customProgramCacheKey();
    if (layer === 'muscles' || key.includes('explorer-quilt')) {
      const uv = floats('uv', 2);
      if (uv.every((x) => x >= 0 && x <= 1)) {
        // Eleven effective bits in a standard normalized UV accessor keep the
        // chart error below 1/3600 of one repeat, including wrap seams.
        const fixed = Uint16Array.from(uv, (x) => Math.round((Math.round(x * 2047) * 65535) / 2047));
        attrs.TEXCOORD_0 = accessor(fixed, n, 4, 'ATTRIBUTES', 5123, 2, { normalized: true });
      } else {
        attrs.TEXCOORD_0 = accessor(
          encoder.encodeFilterExp(uv, n, 8, 15, 'SharedComponent'),
          n,
          8,
          'ATTRIBUTES',
          5126,
          2,
          {},
          'EXPONENTIAL',
        );
      }
    }
    if (key.includes('corneal-iris')) {
      const rest = floats('diagramRest', 3);
      attrs._DIAGRAM_REST = accessor(
        encoder.encodeFilterExp(rest, n, 12, 19, 'SharedComponent'),
        n,
        12,
        'ATTRIBUTES',
        5126,
        3,
        {},
        'EXPONENTIAL',
      );
    }
    const indices = n <= 65535 ? new Uint16Array(ni) : new Uint32Array(ni);
    let v = 0,
      k = 0;
    const ranges = [];
    for (const { part, geometry, start, count, lo, hi } of spans) {
      const vertices = hi - lo + 1;
      ranges.push([part.order, v, vertices, k, count, lo]);
      for (let j = start; j < start + count; j++) indices[k++] = v + geometry.index.array[j] - lo;
      v += vertices;
    }
    const index = accessor(
      indices,
      ni,
      indices.BYTES_PER_ELEMENT,
      'TRIANGLES',
      indices.BYTES_PER_ELEMENT === 2 ? 5123 : 5125,
      1,
    );
    if (!materials.has(finish)) {
      const description = describeAxonMaterial(finish);
      const mat = {
        name: finish.name || layer,
        extras: { finish: description },
        pbrMetallicRoughness: {
          baseColorFactor: [...finish.color.toArray(), finish.opacity],
          metallicFactor: finish.metalness,
          roughnessFactor: finish.roughness,
        },
        doubleSided: finish.side === 2,
        alphaMode: finish.transparent ? 'BLEND' : 'OPAQUE',
      };
      const extension = (key, settings) => {
        (mat.extensions ??= {})[key] = settings;
        if (!gltf.extensionsUsed.includes(key)) gltf.extensionsUsed.push(key);
      };
      if (finish.isMeshPhysicalMaterial) {
        if (finish.specularIntensity !== 1 || finish.specularColor.getHex() !== 0xffffff)
          extension('KHR_materials_specular', {
            specularFactor: finish.specularIntensity,
            specularColorFactor: finish.specularColor.toArray(),
          });
        if (finish.sheen)
          extension('KHR_materials_sheen', {
            sheenColorFactor: finish.sheenColor.toArray().map((c) => c * finish.sheen),
            sheenRoughnessFactor: finish.sheenRoughness,
          });
      }
      if (finish.emissive?.getHex())
        mat.emissiveFactor = finish.emissive.toArray().map((x) => x * finish.emissiveIntensity);
      materials.set(finish, gltf.materials.push(mat) - 1);
    }
    const meshName = layer + ' / ' + (finish.name || 'tissue');
    const mesh =
      gltf.meshes.push({
        name: meshName,
        extras: { layer, renderOrder, ranges },
        primitives: [{ attributes: attrs, indices: index, material: materials.get(finish) }],
      }) - 1;
    const node =
      gltf.nodes.push({ mesh, name: meshName, translation: min, scale: [step, step, step] }) - 1;
    gltf.scenes[0].nodes.push(node);
  }
  gltf.buffers.push(
    { byteLength: encodedOffset },
    { byteLength: rawOffset, extensions: { [ext]: { fallback: true } } },
  );
  const json = Buffer.from(JSON.stringify(gltf)),
    jl = stride4(json.length);
  const bin = Buffer.concat(chunks);
  const result = Buffer.alloc(28 + jl + bin.length);
  result.write('glTF');
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jl, 12);
  result.write('JSON', 16);
  result.fill(32, 20, 20 + jl);
  json.copy(result, 20);
  result.writeUInt32LE(bin.length, 20 + jl);
  result.write('BIN\0', 24 + jl);
  bin.copy(result, 28 + jl);
  return result;
}

const pending = [];
const [onlyName, onlyTier] = process.argv.slice(2);
for (const name of onlyName ? [onlyName] : ['sippy', 'roma']) {
  for (const tier of onlyTier ? [onlyTier] : ['mobile', 'high']) {
    if (!['sippy', 'roma'].includes(name) || !['mobile', 'high'].includes(tier))
      throw new Error('Expected [sippy|roma] [mobile|high]');
    const model = await buildDiagramModel(name, tier);
    try {
      for (const [order, part] of model.parts.entries()) part.order = order;
      for (const shareAlike of [false, true]) {
        const parts = model.parts.filter((p) => (p.source === sa) === shareAlike);
        if (shareAlike && parts.length !== 4)
          throw new Error('Expected exactly four separately licensed Z-Anatomy surfaces');
        const pack = makePack(name, tier, parts, shareAlike);
        const license = shareAlike ? 'CC BY-SA 4.0' : 'CC BY 4.0';
        const decoded = await decodeAxonPack(
          pack.buffer.slice(pack.byteOffset, pack.byteOffset + pack.byteLength),
          { name, tier, license },
        );
        if (decoded.parts.length !== parts.length) throw new Error('Pack lost named parts');
        for (let i = 0; i < parts.length; i++) {
          const raw = parts[i],
            baked = decoded.parts[i];
          if (raw.id !== baked.id || baked.order !== raw.order || baked.source !== raw.source)
            throw new Error('Part metadata mismatch: ' + raw.id);
          const a = raw.mesh.geometry,
            b = baked.mesh.geometry;
          if (
            a.index.count !== b.index.count ||
            a.attributes.position.count !== b.attributes.position.count
          )
            throw new Error('Part topology mismatch: ' + raw.id);
          for (let j = 0; j < a.attributes.position.array.length; j++)
            if (Math.abs(a.attributes.position.array[j] - b.attributes.position.array[j]) > 0.00006)
              throw new Error('Position drift: ' + raw.id);
        }
        decoded.dispose();
        const file = new URL('axon-' + name + '-' + tier + (shareAlike ? '-sa' : '') + '.glb', output);
        pending.push({ file, pack, count: parts.length });
      }
    } finally {
      model.dispose();
    }
  }
}

// Validate the entire requested set before replacing either license sibling.
for (const { file, pack, count } of pending) {
  await writeFile(file, pack);
  console.log(file.pathname.split('/').pop(), count, 'parts,', pack.length, 'bytes');
}
