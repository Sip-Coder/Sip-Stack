// Rewrap the 76 Visible Human Female publication STLs with lossless meshopt.
// Source surfaces are mirrored at the pinned research repository in the credit manifest.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceDir, destination, report] = process.argv.slice(2);
if (!sourceDir || !destination || !report)
  throw new Error('Expected VHF_surfaces directory, GLB destination, and proof JSON destination');
const dependency = (name) => process.env.MESHOPT_ROOT
  ? pathToFileURL(resolve(process.env.MESHOPT_ROOT, 'meshopt_' + name + (name === 'decoder' ? '.mjs' : '.js')))
  : 'meshoptimizer/' + name;
const { MeshoptEncoder } = await import(dependency('encoder'));
const { MeshoptDecoder } = await import(dependency('decoder'));
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);

const sourceRepo = 'https://github.com/ingvilddevold/muscle-growth';
const sourceCommit = '16b27795d6b8d1db06f7523f9d9eedea959935ae';
// STL is millimetres, +X toward anatomical right and +Z up. Pose the common
// origin as a single root. The shift is the balanced nearest-surface median
// across 13 matching BoneHub lower-limb bones, with the axes and unit scale fixed.
const publicationFrame = [
  -0.001, 0, 0, 0,
  0, 0, 0.001, 0,
  0, 0.001, 0, 0,
  0.78431655, 0.002244, -0.68446198, 1,
];
const credits = 'Thor E. Andreassen, Donald R. Hume, Landon D. Hamilton, Karen E. Walker, Sean E. Higinbotham, Kevin B. Shelburne. 2023. Three Dimensional Lower Extremity Musculoskeletal Geometry of the Visible Human Female and Male. https://doi.org/10.1038/s41597-022-01905-2. CC BY 4.0, https://creativecommons.org/licenses/by/4.0/. Visible Human Project data from the U.S. National Library of Medicine. Original STL mirror: ' + sourceRepo + '/tree/' + sourceCommit + '/data/VHF_surfaces. Lossless geometry compression and scene placement by Sip Studies. See MUSCLE-SKIN-LICENSE.md.';
const { mapping } = JSON.parse(await readFile(new URL('../docs/characters/review/scan-skeleton/female-muscle-mapping.json', import.meta.url), 'utf8'));
const names = new Map(mapping.map((part) => [part.atlasId, part]));
const stls = [];
for (const side of ['Left', 'Right']) {
  for (const file of (await readdir(join(sourceDir, side))).sort()) {
    const match = /^VHF_(Left|Right)_Muscle_(\w+)_smooth\.stl$/.exec(file);
    if (match) stls.push({ file: join(side, file), id: 'VHF:' + match[1].toLowerCase() + '-' + match[2] });
  }
}
if (stls.length !== 76 || stls.some(({ id }) => !names.has(id)))
  throw new Error('Expected all 76 individually identified Visible Human Female publication STLs');

const extension = 'EXT_meshopt_compression';
const gltf = {
  asset: { version: '2.0', copyright: credits, generator: 'Sip Studies lossless Visible Human Female packaging' },
  extensionsUsed: [extension, 'KHR_mesh_quantization'],
  extensionsRequired: [extension, 'KHR_mesh_quantization'],
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ name: 'VHF publication acquisition frame', matrix: publicationFrame, children: [] }],
  meshes: [], accessors: [], bufferViews: [], buffers: [],
};
const blocks = [], evidence = [];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
let packedLength = 0, rawLength = 0;
const aligned = (length) => Math.ceil(length / 4) * 4;

function accessor(array, count, itemSize, componentType, mode, options = {}, filter = 'NONE') {
  const raw = bytesOf(array);
  const stride = raw.length / count;
  const packed = mode === 'ATTRIBUTES'
    ? MeshoptEncoder.encodeVertexBufferLevel(raw, count, stride, 3, 0)
    : MeshoptEncoder.encodeIndexBuffer(raw, count, stride);
  const decoded = new Uint8Array(raw.length);
  MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, packed, mode, filter);
  if (mode === 'ATTRIBUTES' && filter === 'NONE' && !raw.equals(bytesOf(decoded)))
    throw new Error('Lossless stream changed its data');
  const padded = Buffer.alloc(aligned(packed.length));
  padded.set(packed);
  blocks.push(padded);
  gltf.bufferViews.push({
    buffer: 1, byteOffset: rawLength, byteLength: raw.length,
    target: mode === 'ATTRIBUTES' ? 34962 : 34963,
    ...(mode === 'ATTRIBUTES' ? { byteStride: stride } : {}),
    extensions: { [extension]: {
      buffer: 0, byteOffset: packedLength, byteLength: packed.length,
      byteStride: stride, count, mode, filter,
    } },
  });
  gltf.accessors.push({
    bufferView: gltf.bufferViews.length - 1, componentType,
    count, type: itemSize === 1 ? 'SCALAR' : 'VEC3', ...options,
  });
  packedLength += padded.length;
  rawLength += aligned(raw.length);
  return { index: gltf.accessors.length - 1, decoded };
}

function stlCorners(bytes, file) {
  const count = bytes.length >= 84 ? bytes.readUInt32LE(80) : 0;
  const binary = count > 0 && 84 + count * 50 === bytes.length;
  if (binary) {
    const corners = new Uint32Array(count * 9);
    for (let tri = 0; tri < count; tri++) {
      for (let j = 0; j < 9; j++) corners[tri * 9 + j] = bytes.readUInt32LE(96 + tri * 50 + j * 4);
    }
    return corners;
  }
  const source = bytes.toString('ascii');
  if (!/^\s*solid\b/i.test(source)) throw new Error('Invalid STL ' + file);
  const rows = [...source.matchAll(/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)];
  if (!rows.length || rows.length % 3) throw new Error('Incomplete STL ' + file);
  const positions = Float32Array.from(rows.flatMap((match) => match.slice(1).map(Number)));
  if (!positions.every(Number.isFinite)) throw new Error('Invalid decimal STL vertex ' + file);
  return new Uint32Array(positions.buffer);
}

function indexCorners(corners) {
  const positionBits = [], indices = [], seen = new Map();
  for (let i = 0; i < corners.length; i += 3) {
    const [x, y, z] = corners.subarray(i, i + 3);
    const key = x + '/' + y + '/' + z;
    let index = seen.get(key);
    if (index === undefined) {
      index = positionBits.length / 3;
      seen.set(key, index);
      positionBits.push(x, y, z);
    }
    indices.push(index);
  }
  const vertices = Uint32Array.from(positionBits);
  return {
    positions: new Float32Array(vertices.buffer),
    indices: Uint32Array.from(indices),
  };
}

function reorder({ positions, indices }) {
  const ordered = indices.slice();
  const [remap, count] = MeshoptEncoder.reorderMesh(ordered, true, true);
  if (count * 3 !== positions.length) throw new Error('A source vertex was discarded');
  const inverse = new Uint32Array(count);
  const originalBits = new Uint32Array(positions.buffer), bits = new Uint32Array(positions.length);
  for (let old = 0; old < count; old++) {
    const index = remap[old];
    inverse[index] = old;
    bits.set(originalBits.subarray(old * 3, old * 3 + 3), index * 3);
  }
  return {
    positions: new Float32Array(bits.buffer),
    indices: count <= 65535 ? Uint16Array.from(ordered) : ordered,
    inverse,
  };
}

function orientedFace(a, b, c) {
  if (b < a && b <= c) return b + '/' + c + '/' + a;
  if (c < a && c < b) return c + '/' + a + '/' + b;
  return a + '/' + b + '/' + c;
}

function assertSourceFaces(before, after, inverse, file) {
  // Triangle encoding and locality can permute faces or rotate their corner
  // lists. Count exact oriented triples so duplicates and winding are audited.
  const faces = new Map();
  for (let i = 0; i < before.length; i += 3) {
    const face = orientedFace(before[i], before[i + 1], before[i + 2]);
    faces.set(face, (faces.get(face) || 0) + 1);
  }
  for (let i = 0; i < after.length; i += 3) {
    const face = orientedFace(inverse[after[i]], inverse[after[i + 1]], inverse[after[i + 2]]);
    const count = faces.get(face);
    if (!count) throw new Error('Source triangle changed in ' + file);
    if (count === 1) faces.delete(face);
    else faces.set(face, count - 1);
  }
  if (faces.size) throw new Error('Missing source triangles in ' + file);
}

function geometryData(positions, indices) {
  const normals = new Float32Array(positions.length / 3 * 4);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], positions[i]);
    max[axis] = Math.max(max[axis], positions[i]);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = 3 * indices[i], b = 3 * indices[i + 1], c = 3 * indices[i + 2];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let j = 0; j < 3; j++) {
      const n = 4 * indices[i + j];
      normals[n] += nx;
      normals[n + 1] += ny;
      normals[n + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 4) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (!length) normals[i + 1] = 1;
    else for (let j = 0; j < 3; j++) normals[i + j] /= length;
  }
  return { min, max, normals };
}

for (const { file, id } of stls) {
  const input = await readFile(join(sourceDir, file));
  const original = stlCorners(input, file);
  const source = indexCorners(original);
  const { positions, indices, inverse } = reorder(source);
  const vertexCount = positions.length / 3;
  const { min, max, normals } = geometryData(positions, indices);
  const positionData = accessor(positions, vertexCount, 3, 5126, 'ATTRIBUTES', { min, max });
  const indexData = accessor(indices, indices.length, 1, indices.BYTES_PER_ELEMENT === 2 ? 5123 : 5125, 'TRIANGLES');
  const decodedBits = new Uint32Array(positionData.decoded.buffer);
  const decodedIndices = new indices.constructor(indexData.decoded.buffer);
  const sourceBits = new Uint32Array(source.positions.buffer);
  for (let i = 0; i < decodedBits.length; i++) {
    if (decodedBits[i] !== sourceBits[3 * inverse[Math.floor(i / 3)] + i % 3])
      throw new Error('Source vertex changed in ' + file);
  }
  assertSourceFaces(source.indices, decodedIndices, inverse, file);
  // Normals are auxiliary presentation data. Their compression does not touch
  // the positions and cannot alter either topology or oriented triangle corners.
  const normal = accessor(MeshoptEncoder.encodeFilterOct(normals, vertexCount, 4, 8), vertexCount,
    3, 5120, 'ATTRIBUTES', { normalized: true }, 'OCTAHEDRAL');
  const { node, counterpart, region } = names.get(id);
  const extras = { name: id, atlasCounterpart: counterpart, region };
  gltf.meshes.push({
    name: node, extras, primitives: [{
      attributes: { POSITION: positionData.index, NORMAL: normal.index }, indices: indexData.index,
    }],
  });
  gltf.nodes[0].children.push(gltf.nodes.length);
  gltf.nodes.push({ name: node, mesh: gltf.meshes.length - 1 });
  evidence.push({
    sourcePath: file, sourceSha256: sha256(input), sourceCornerSha256: sha256(bytesOf(original)),
    node, vertices: vertexCount, triangles: indices.length / 3, maxGeometryResidualInches: 0,
  });
}

gltf.buffers.push({ byteLength: packedLength }, { byteLength: rawLength, extensions: { [extension]: { fallback: true } } });
const json = Buffer.from(JSON.stringify(gltf));
const header = Buffer.alloc(28 + aligned(json.length), 0x20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(header.length + packedLength, 8);
header.writeUInt32LE(aligned(json.length), 12);
header.write('JSON', 16);
json.copy(header, 20);
header.writeUInt32LE(packedLength, header.length - 8);
header.write('BIN\0', header.length - 4);
const output = Buffer.concat([header, ...blocks]);
await writeFile(destination, output);
await writeFile(report, JSON.stringify({
  sourceRepo, sourceCommit, sourceDirectory: 'data/VHF_surfaces', publicationFrame,
  packedSha256: sha256(output), packedBytes: output.length, meshes: evidence,
}, null, 2) + '\n');
console.log(evidence.length + ' meshes, ' + evidence.reduce((sum, item) => sum + item.triangles, 0).toLocaleString() + ' exact source triangles, ' + output.length.toLocaleString() + ' bytes');
