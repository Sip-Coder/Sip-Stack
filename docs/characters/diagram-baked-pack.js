// These ordinary glTF 2.0 assets already contain neutral, fitted vertices. The
// draw batches share one meshopt stream per attribute. Named parts and their
// index ranges remain available for picking, landmarks and reassembly.
import { Box3, BufferAttribute, BufferGeometry, Mesh, Sphere, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { restoreAxonMaterial } from './diagram-baked-material.js';

const arrayType = {
  5120: Int8Array,
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const meaning = {
  POSITION: 'position',
  NORMAL: 'normal',
  COLOR_0: 'color',
  TEXCOORD_0: 'uv',
  _DIAGRAM_REST: 'diagramRest',
};
const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function partGeometry(pieces) {
  pieces.sort((a, b) => a.originalStart - b.originalStart);
  const material = pieces.map((s) => s.finish);
  const length = Math.max(...pieces.map((s) => s.originalStart + s.vertices));
  const geometry = new BufferGeometry();
  const formats = new Map();
  for (const p of pieces)
    for (const [key, attr] of Object.entries(p.geometry.attributes)) formats.set(key, attr);
  for (const [key, attr] of formats) {
    const size = attr.itemSize;
    const single = pieces.length === 1 ? pieces[0] : null;
    if (single && !single.originalStart) {
      const a = attr.array.subarray(single.lo * size, (single.lo + single.vertices) * size);
      geometry.setAttribute(key, new BufferAttribute(a, size, attr.normalized));
      continue;
    }
    const result = new attr.array.constructor(length * size);
    if (key === 'color') result.fill(attr.normalized ? 255 : 1);
    for (const p of pieces) {
      const data = p.geometry.attributes[key];
      if (data)
        result.set(data.array.subarray(p.lo * size, (p.lo + p.vertices) * size), p.originalStart * size);
    }
    geometry.setAttribute(key, new BufferAttribute(result, size, attr.normalized));
  }
  const elementCount = pieces.reduce((n, p) => n + p.count, 0);
  const indices = length > 65535 ? new Uint32Array(elementCount) : new Uint16Array(elementCount);
  let output = 0;
  for (const [i, p] of pieces.entries()) {
    const src = p.geometry.index.array;
    geometry.addGroup(output, p.count, i);
    const shift = p.originalStart - p.lo;
    for (let j = p.first; j < p.first + p.count; j++) indices[output++] = src[j] + shift;
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
  const mesh = new Mesh(geometry, material.length === 1 ? material[0] : material);
  mesh.renderOrder = pieces[0].renderOrder;
  return mesh;
}

export async function decodeAxonPack(buffer, { name, tier, license, materials = new Map() }) {
  const file = new DataView(buffer);
  if (
    file.getUint32(0, true) !== 0x46546c67 ||
    file.getUint32(4, true) !== 2 ||
    file.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error('Invalid Axon GLB header');
  const jsonLength = file.getUint32(12, true),
    binStart = 28 + jsonLength;
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const meta = gltf.asset?.extras?.axon;
  if (meta?.version !== 2 || meta.name !== name || meta.tier !== tier || meta.license !== license)
    throw new Error('Unexpected Axon character, tier or license');
  const shareAlike = license === 'CC BY-SA 4.0';
  if (
    (shareAlike && meta.parts.length !== 4) ||
    meta.parts.some((row) => (meta.strings[row[3]] === 'Z-Anatomy · CC BY-SA 4.0') !== shareAlike)
  )
    throw new Error('Unexpected source in licensed Axon pack');
  await MeshoptDecoder.ready;
  const ownedMaterials = [];
  const finishMaterials = gltf.materials.map(({ extras }) => {
    const key = JSON.stringify(extras.finish);
    if (!materials.has(key)) {
      const finish = restoreAxonMaterial(extras.finish);
      materials.set(key, finish);
      ownedMaterials.push(finish);
    }
    return materials.get(key);
  });
  function unpack(index) {
    const a = gltf.accessors[index],
      view = gltf.bufferViews[a.bufferView];
    const e = view.extensions.EXT_meshopt_compression,
      Constructor = arrayType[a.componentType];
    const packed = new Uint8Array(buffer, binStart + e.byteOffset, e.byteLength);
    const bytes = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(bytes, e.count, e.byteStride, packed, e.mode, e.filter);
    return {
      items: new Constructor(bytes.buffer),
      a,
      stride: e.byteStride / Constructor.BYTES_PER_ELEMENT,
    };
  }
  const parts = [],
    byOrder = new Map();
  for (const [order, partName, layer, source, triangles, q, anatomy] of meta.parts) {
    const bounds = new Box3(
      new Vector3().fromArray(q).multiplyScalar(1e-6),
      new Vector3().fromArray(q, 3).multiplyScalar(1e-6),
    );
    const p = {
      order,
      name: partName,
      layer: meta.strings[layer],
      source: meta.strings[source],
      bounds,
      triangles,
    };
    p.id = p.layer + '/' + p.name;
    if (anatomy?.scanNode) p.scanNode = anatomy.scanNode;
    if (anatomy?.muscleNode) {
      const { muscleNode, atlasNode, region, sourcePart, anchors } = anatomy;
      Object.assign(p, {
        muscleNode,
        atlasNode: atlasNode ?? muscleNode,
        region: meta.strings[region],
        sourcePart,
      });
      Object.defineProperty(p, 'attachments', {
        enumerable: true,
        configurable: true,
        get() {
          const sites = anchors.map(([index, role, bone, ...v]) => ({
            index,
            role: meta.strings[role],
            bone: meta.strings[bone],
            source: new Vector3().fromArray(v, 0).multiplyScalar(1e-6),
            target: new Vector3().fromArray(v, 3).multiplyScalar(1e-6),
            delta: new Vector3().fromArray(v, 6).multiplyScalar(1e-6),
          }));
          Object.defineProperty(p, 'attachments', { value: sites });
          return sites;
        },
      });
    }
    byOrder.set(order, { p, pieces: [] });
    parts.push(p);
  }
  const batches = [];
  for (const node of gltf.nodes) {
    const source = gltf.meshes[node.mesh];
    const { layer, renderOrder, ranges } = source.extras,
      prim = source.primitives[0];
    const finish = finishMaterials[prim.material],
      geometry = new BufferGeometry();
    for (const [semantic, index] of Object.entries(prim.attributes)) {
      const { items, a, stride } = unpack(index);
      const size = width[a.type];
      let array = items;
      if (semantic === 'POSITION') {
        array = new Float32Array(a.count * 3);
        for (let i = 0; i < a.count; i++)
          for (let j = 0; j < 3; j++)
            array[i * 3 + j] = items[i * stride + j] * node.scale[j] + node.translation[j];
        geometry.boundingBox = new Box3(
          new Vector3(...node.translation),
          new Vector3(...a.max)
            .multiply(new Vector3(...node.scale))
            .add(new Vector3(...node.translation)),
        );
      } else if (stride !== size) {
        array = new items.constructor(a.count * size);
        for (let i = 0; i < a.count; i++)
          for (let j = 0; j < size; j++) array[i * size + j] = items[i * stride + j];
      }
      geometry.setAttribute(meaning[semantic], new BufferAttribute(array, size, !!a.normalized));
    }
    geometry.setIndex(new BufferAttribute(unpack(prim.indices).items, 1));
    const spans = [];
    for (const [order, lo, vertices, first, count, originalStart] of ranges) {
      const entry = byOrder.get(order);
      if (!entry || entry.p.layer !== layer) throw new Error('Unknown part in Axon batch');
      spans.push({ partId: entry.p.id, lo, hi: lo + vertices - 1 });
      entry.pieces.push({ geometry, finish, renderOrder, lo, vertices, first, count, originalStart });
    }
    batches.push({ layer, finish, renderOrder, geometry, spans });
  }
  // The normal UI draws shared batches and uses the part bounds above. Only
  // callers inspecting individual triangles need a separate mesh and index.
  const inspected = [];
  for (const { p, pieces } of byOrder.values()) {
    if (!pieces.length) throw new Error('Empty Axon surface ' + p.id);
    Object.defineProperty(p, 'mesh', {
      enumerable: true,
      configurable: true,
      get() {
        const mesh = partGeometry(pieces);
        mesh.name = p.name;
        if (p.scanNode) mesh.geometry.userData.scanNode = p.scanNode;
        inspected.push(mesh.geometry);
        Object.defineProperty(p, 'mesh', { value: mesh });
        return mesh;
      },
    });
  }
  return {
    parts,
    batches,
    dispose() {
      for (const geometry of inspected) geometry.dispose();
      for (const b of batches) b.geometry.dispose();
      for (const finish of ownedMaterials) finish.dispose();
    },
  };
}
