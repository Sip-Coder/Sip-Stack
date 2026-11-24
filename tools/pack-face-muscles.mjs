// Repackage the named BodyParts3D v3 binary STLs for the two Axon face modes.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceDir, outDir] = process.argv.slice(2);
if (!sourceDir || !outDir) throw new Error('Expected STL directory and GLB output directory');
const meshopt = (name) => process.env.MESHOPT_ROOT
  ? pathToFileURL(resolve(process.env.MESHOPT_ROOT, `meshopt_${name}.${name === 'decoder' ? 'mjs' : 'js'}`))
  : 'meshoptimizer/' + name;
const { MeshoptEncoder } = await import(meshopt('encoder'));
const { MeshoptDecoder } = await import(meshopt('decoder'));
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const registration = JSON.parse(await readFile(new URL('../docs/characters/review/face-fine-tune/face-muscle-registration.json', import.meta.url), 'utf8'));
const license = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html · https://creativecommons.org/licenses/by/4.0/';
const extension = 'EXT_meshopt_compression';
const align = (n) => Math.ceil(n / 4) * 4;
const bytes = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

function readStl(input) {
  const count = input.readUInt32LE(80);
  if (input.length !== 84 + 50 * count) throw new Error('Expected exact binary STL');
  const indices = new Uint32Array(count * 3), positions = [], vertexByBits = new Map();
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) {
      const offset = 96 + i * 50 + j * 12;
      const key = input.toString('hex', offset, offset + 12);
      let vertex = vertexByBits.get(key);
      if (vertex === undefined) {
        vertex = positions.length / 3;
        vertexByBits.set(key, vertex);
        positions.push(input.readFloatLE(offset), input.readFloatLE(offset + 4), input.readFloatLE(offset + 8));
      }
      indices[i * 3 + j] = vertex;
    }
  }
  return { positions: Float32Array.from(positions), indices };
}

function headPlacement(matrix) {
  // STL axes are +Y posterior and +Z superior with positions in millimetres.
  return [
    ...matrix.map((row, i) => i === 3 ? 0 : row[0] / 1000),
    ...matrix.map((row, i) => i === 3 ? 0 : -row[2] / 1000),
    ...matrix.map((row, i) => i === 3 ? 0 : row[1] / 1000),
    ...matrix.map((row) => row[3]),
  ];
}

function bakeRegistration(positions, matrix) {
  for (let i = 0; i < positions.length; i += 3) {
    const x = Math.fround(positions[i] / 1000);
    const y = Math.fround(positions[i + 2] / 1000);
    const z = Math.fround(-positions[i + 1] / 1000);
    for (let row = 0; row < 3; row++) {
      const [a, b, c, d] = matrix[row];
      positions[i + row] = x * a + y * b + z * c + d;
    }
  }
}

for (const [hero, parts] of Object.entries(registration.positions)) {
  const gltf = {
    asset: { version: '2.0', generator: 'Sip Studies · BodyParts3D v3 face', copyright: license },
    extensionsUsed: [extension], extensionsRequired: [extension], scene: 0,
    scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [],
  };
  let binLength = 0, rawLength = 0;
  const blocks = [];
  function accessor(array, width, type, bounds) {
    const raw = bytes(array), index = width === 1;
    const count = array.length / width, stride = raw.length / count;
    const mode = index ? 'TRIANGLES' : 'ATTRIBUTES';
    const packed = index ? MeshoptEncoder.encodeIndexBuffer(raw, count, stride)
      : MeshoptEncoder.encodeVertexBufferLevel(raw, count, stride, 3, 0);
    const decoded = new Uint8Array(raw.length);
    MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, packed, mode, 'NONE');
    if (index) {
      const after = new array.constructor(decoded.buffer);
      for (let i = 0; i < count; i += 3) {
        const start = [0, 1, 2].find((j) => array[i + j] === after[i] &&
          array[i + (j + 1) % 3] === after[i + 1] && array[i + (j + 2) % 3] === after[i + 2]);
        if (start === undefined) throw new Error('Index codec changed an oriented triangle');
      }
    } else if (!raw.equals(bytes(decoded))) throw new Error('Position codec changed a vertex');
    gltf.accessors.push({ bufferView: gltf.bufferViews.length, componentType: type,
      count, type: index ? 'SCALAR' : 'VEC3', ...bounds });
    gltf.bufferViews.push({ buffer: 1, byteOffset: rawLength, byteLength: raw.length,
      target: index ? 34963 : 34962, ...(index ? {} : { byteStride: stride }),
      extensions: { [extension]: { buffer: 0, byteOffset: binLength, byteLength: packed.length, byteStride: stride, count, mode } } });
    const block = Buffer.alloc(align(packed.length));
    block.set(packed);
    blocks.push(block);
    binLength += block.length;
    rawLength += align(raw.length);
    return gltf.accessors.length - 1;
  }
  for (const [name, { id, sha256, matrix }] of Object.entries(parts)) {
    const source = await readFile(join(sourceDir, id + '.stl'));
    if (createHash('sha256').update(source).digest('hex') !== sha256)
      throw new Error('Wrong anatomical source bytes for ' + id);
    const { positions, indices } = readStl(source);
    if (hero === 'roma') bakeRegistration(positions, matrix);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
      min[i % 3] = Math.min(min[i % 3], positions[i]);
      max[i % 3] = Math.max(max[i % 3], positions[i]);
    }
    const short = positions.length / 3 <= 65535;
    const p = accessor(positions, 3, 5126, { min, max });
    const ix = accessor(short ? Uint16Array.from(indices) : indices, 1, short ? 5123 : 5125);
    const displayName = name[0].toUpperCase() + name.slice(1);
    gltf.meshes.push({ name: id, extras: { name: id, displayName, region: 'face', rigJoint: 'head' },
      primitives: [{ attributes: { POSITION: p }, indices: ix }] });
    gltf.scenes[0].nodes.push(gltf.nodes.length);
    gltf.nodes.push({ name: id, mesh: gltf.meshes.length - 1,
      ...(hero === 'sippy' ? { matrix: headPlacement(matrix) } : {}) });
  }
  gltf.buffers = [{ byteLength: binLength }, { byteLength: rawLength, extensions: { [extension]: { fallback: true } } }];
  const json = Buffer.from(JSON.stringify(gltf));
  const header = Buffer.alloc(28 + align(json.length), 0x20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + binLength, 8);
  header.writeUInt32LE(align(json.length), 12);
  header.write('JSON', 16);
  json.copy(header, 20);
  header.writeUInt32LE(binLength, header.length - 8);
  header.write('BIN\0', header.length - 4);
  const output = join(outDir, `${hero}-face-bp3d-meshopt.glb`);
  await writeFile(output, Buffer.concat([header, ...blocks]));
  console.log(hero, gltf.meshes.length, 'meshes', binLength, 'packed bytes');
}
