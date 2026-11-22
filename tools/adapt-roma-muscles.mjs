// Run offline with the exact BoneHub and male atlas inputs. Sippy and Roma's
// BoneHub and Andreassen files never enter this deformation pipeline.
import { registerHooks } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({ resolve(specifier, context, next) {
    const file = specifier === 'three' ? 'build/three.module.js'
      : specifier.startsWith('three/addons/') ? 'examples/jsm/' + specifier.slice(13) : null;
    return file ? { url: pathToFileURL(resolve(root, file)).href, shortCircuit: true } : next(specifier, context);
  } });
}

const { MeshoptEncoder } = await import(process.env.MESHOPT_ROOT
  ? pathToFileURL(resolve(process.env.MESHOPT_ROOT, 'meshopt_encoder.js')) : 'meshoptimizer/encoder');
const { Vector3, Triangle, MathUtils } = await import('three');
const { createActor } = await import('../docs/characters/rig.js');
const { heights } = await import('../docs/characters/ui.js');
const { prepareSourceAnatomy } = await import('../docs/characters/diagram-source-anatomy.js');
const { attachmentSpecs } = await import('./roma-attachment-anchors.mjs');
await MeshoptEncoder.ready;

const assetPath = new URL('../docs/characters/assets/', import.meta.url);
const reviewPath = new URL('../docs/characters/review/source-true-anatomy/', import.meta.url);
const inch = 0.0254;
const point = (values) => new Vector3().fromArray(values);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requested = process.argv.slice(2);
const tiers = requested.length ? requested : ['mobile', 'high'];

function corticalSurfaces(parts) {
  return parts.filter((p) => p.scanNode).map((part) => {
    const input = part.mesh.geometry;
    const data = new Float64Array(input.attributes.position.count * 3);
    const v = new Vector3();
    for (let i = 0; i < input.attributes.position.count; i++)
      v.fromBufferAttribute(input.attributes.position, i).applyMatrix4(part.sourceMatrix).toArray(data, i * 3);
    return { name: part.scanNode, bounds: part.bounds, positions: data, indices: input.index.array };
  });
}

function cortex(surfaces, seed, candidates) {
  const triangle = new Triangle(), nearest = new Vector3(), target = new Vector3();
  let distance = Infinity, name;
  for (const surface of surfaces) {
    if (!candidates(surface.name) || surface.bounds.distanceToPoint(seed) ** 2 >= distance) continue;
    const { positions, indices } = surface;
    for (let k = 0; k < indices.length; k += 3) {
      triangle.a.fromArray(positions, indices[k] * 3);
      triangle.b.fromArray(positions, indices[k+1] * 3);
      triangle.c.fromArray(positions, indices[k+2] * 3);
      triangle.closestPointToPoint(seed, nearest);
      const d = nearest.distanceToSquared(seed);
      if (d < distance) { distance = d; name = surface.name; target.copy(nearest); }
    }
  }
  if (!name) throw Error('No female cortex available for a muscle anchor');
  return { bone: name, target };
}

function closeVertex(data, hint, used) {
  let index = -1, best = Infinity;
  const v = new Vector3();
  for (let i = 0; i < data.length / 3; i++) {
    if (used.has(i)) continue;
    const d = v.fromArray(data, i * 3).distanceToSquared(hint);
    if (d < best) { best = d; index = i; }
  }
  return index;
}

function direction(data, center) {
  const p = new Vector3(), next = new Vector3(), axis = new Vector3(0.31, 0.94, 0.16).normalize();
  for (let step = 0; step < 12; step++) {
    next.set(0, 0, 0);
    for (let i = 0; i < data.length; i += 3) {
      p.fromArray(data, i).sub(center);
      next.addScaledVector(p, p.dot(axis));
    }
    if (next.lengthSq() > 1e-16) axis.copy(next).normalize();
  }
  return axis;
}

function candidateBones(part) {
  const side = part.joint.endsWith('L') ? '_LEFT' : part.joint.endsWith('R') ? '_RIGHT' : '';
  const matches = {
    upperArm: /HUMERUS|CLAVICLE|SCAPULA|RIB_[1-6]_/,
    forearm: /HUMERUS|RADIUS|ULNA/,
    hand: /RADIUS|ULNA|METACARPAL|PHALANX|CAPITATE|HAMATE|TRAPEZ|SCAPHOID/,
    thigh: /HIP|FEMUR|SACRUM|TIBIA/,
    shin: /FEMUR|TIBIA|FIBULA|CALCANEUS/,
    foot: /TIBIA|FIBULA|CALCANEUS|CUNEIFORM|METATARSAL|PHALANX|TALUS|CUBOID/,
  };
  if (side) {
    const region = matches[part.joint.slice(0,-1)] ?? /SCAPULA|HUMERUS/;
    return (name) => region.test(name) && (name.endsWith(side) || name === 'SACRUM');
  }
  const pattern = {
    hips: /HIP|SACRUM|COCCYX|VERTEBRA_L|FEMUR/,
    head: /CRANI|MAXILLA|MANDIBLE|VERTEBRA_C|HYOID/,
    chest: /VERTEBRA|RIB_|STERNUM|CLAVICLE|SCAPULA|HIP/,
  }[part.joint];
  return (name) => !!pattern?.test(name);
}

function sectionFactor(part) {
  const id = part.muscleNode.toLowerCase();
  if (/pectoralis_major/.test(id)) return 0.72;
  if (/deltoid|trapezius/.test(id)) return 0.80;
  if (/biceps_brachii/.test(id)) return 0.79;
  if (/rectus_abdominis|external_oblique|internal_oblique|latissimus/.test(id)) return 0.83;
  if (/^upperArm|^forearm/.test(part.joint)) return 0.87;
  if (/^hand|^foot|head/.test(part.joint)) return 0.96;
  return 0.91;
}

function volume(positions, indices, center) {
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  let total = 0;
  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(positions, indices[i] * 3).sub(center);
    b.fromArray(positions, indices[i+1] * 3).sub(center);
    c.fromArray(positions, indices[i+2] * 3).sub(center);
    total += a.dot(b.cross(c));
  }
  return Math.abs(total / 6 / inch ** 3);
}

function adapt(part, rig, cortices) {
  const geometry = part.mesh.geometry;
  const rest = Float64Array.from(geometry.attributes.position.array);
  const world = rest.slice(), baseline = rest.slice();
  const v = new Vector3(), right = new Vector3(), center = new Vector3(), offset = new Vector3();
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < world.length; i += 3) {
    v.fromArray(rest, i).applyMatrix4(part.sourceMatrix).toArray(world, i);
    center.add(v);
  }
  center.multiplyScalar(3 / world.length);
  const axis = direction(world, center);
  const shape = sectionFactor(part);
  for (let i = 0; i < world.length; i += 3) {
    v.fromArray(world, i).sub(center);
    const t = v.dot(axis);
    min = Math.min(min, t); max = Math.max(max, t);
    v.multiplyScalar(shape).addScaledVector(axis, (1 - shape) * t).add(center).toArray(baseline, i);
  }

  const span = max-min;
  const spec = attachmentSpecs(part.muscleNode, part.joint);
  const used = new Set(), anchors = [];
  function add(spec, index) {
    if (index < 0 || used.has(index)) return;
    const named = cortices.some((p) => p.name === spec.bone);
    const seed = spec.target
      ? point(spec.target).applyMatrix4(rig.anatomy.normalization).multiplyScalar(rig.height)
      : new Vector3().fromArray(baseline, index * 3);
    const { bone, target } = cortex(cortices, seed, named ? (name) => name === spec.bone : candidateBones(part));
    const original = new Vector3().fromArray(world, index * 3);
    const delta = target.clone().sub(new Vector3().fromArray(baseline, index * 3));
    anchors.push({ index, bone, role: spec.role, original, target, delta, atlasLandmark: named });
    used.add(index);
  }
  for (const anchor of spec)
    add(anchor, closeVertex(rest, point(anchor.point), used));
  if (!anchors.length) {
    add({ role: 'inferred proximal boundary' }, closeVertex(world, center.clone().addScaledVector(axis, max), used));
    add({ role: 'inferred distal boundary' }, closeVertex(world, center.clone().addScaledVector(axis, min), used));
  }

  const adapted = new Float64Array(world.length);
  const local = new Float32Array(world.length);
  const inv = rig[part.joint].matrixWorld.clone().invert();
  const radius = Math.max(0.009, span * 0.37);
  for (let i = 0; i < world.length; i += 3) {
    right.fromArray(world, i);
    v.fromArray(baseline, i);
    let sum = 0, weight = 0;
    offset.set(0, 0, 0);
    for (const anchor of anchors) {
      const t = right.distanceTo(anchor.original) / radius;
      if (t >= 1) continue;
      const influence = (1-t) ** 4 * (4*t+1);
      offset.addScaledVector(anchor.delta, influence);
      sum += influence;
      weight = Math.max(weight, influence);
    }
    if (sum) v.addScaledVector(offset, weight / sum);
    v.toArray(adapted, i);
  }
  for (const anchor of anchors) anchor.target.toArray(adapted, 3*anchor.index);
  let maxPinResidualIn = 0, maxPinTravelIn = 0;
  for (let i = 0; i < adapted.length; i += 3) v.fromArray(adapted,i).applyMatrix4(inv).toArray(local,i);
  for (const anchor of anchors) {
    v.fromArray(local, 3*anchor.index).applyMatrix4(rig[part.joint].matrixWorld);
    maxPinResidualIn = Math.max(maxPinResidualIn, v.distanceTo(anchor.target) / inch);
    maxPinTravelIn = Math.max(maxPinTravelIn, anchor.delta.length() / inch);
  }

  const indices = geometry.index.array;
  const fromIn3 = volume(world, indices, center), toIn3 = volume(adapted, indices, center);
  return {
    part, local, anchors,
    report: {
      muscle: part.muscleNode, file: part.sourceFile, sourceNode: part.sourceNode, joint: part.joint,
      triangles: indices.length / 3, crossSectionScale: shape,
      beforeIn3: fromIn3, afterIn3: toIn3, volumeChangePercent: fromIn3 > 1e-8 ? 100*(toIn3/fromIn3-1) : null,
      maxPinResidualIn, maxPinTravelIn,
      anchors: anchors.map(({ index, bone, role, atlasLandmark, target }) =>
        ({ index, bone, role, atlasLandmark, femaleCorticalTargetIn: target.toArray().map((n) => n/inch) })),
    },
  };
}

function encodePack(results, shareAlike) {
  const meshopt = 'EXT_meshopt_compression';
  const round = (length) => Math.ceil(length / 4) * 4;
  const gltf = {
    asset: { version:'2.0', generator:'Sip Studios Roma cortical muscle adaptation',
      copyright: shareAlike
        ? 'Adapted from male atlas. Z-Anatomy, derived from BodyParts3D, CC BY-SA 4.0, https://github.com/Z-Anatomy/Models-of-human-anatomy.'
        : 'Adapted from male atlas. BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.' },
    extensionsUsed: [meshopt, 'KHR_mesh_quantization'], extensionsRequired: [meshopt, 'KHR_mesh_quantization'],
    scene: 0, scenes: [{ nodes: [] }], meshes: [], nodes: [],
    accessors: [], bufferViews: [], buffers: [],
  };
  const blocks = [];
  let byteOffset = 0, fallback = 0;
  function add(array, count, componentType, type, mode, extra = {}, filter = 'NONE') {
    const stride = array.byteLength / count;
    const input = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const data = mode === 'ATTRIBUTES'
      ? MeshoptEncoder.encodeVertexBufferLevel(input, count, stride, 3, 0)
      : MeshoptEncoder.encodeIndexBuffer(input, count, stride);
    gltf.bufferViews.push({
      buffer: 1, byteOffset: fallback, byteLength: input.length,
      ...(mode === 'ATTRIBUTES' ? { byteStride: stride, target: 34962 } : { target:34963 }),
      extensions: { [meshopt]: { buffer:0, byteOffset, byteLength:data.length, byteStride:stride, count, mode, filter } },
    });
    const aligned = Buffer.alloc(round(data.length)); aligned.set(data); blocks.push(aligned);
    byteOffset += aligned.length;
    fallback += round(input.length);
    return gltf.accessors.push({ bufferView: gltf.bufferViews.length-1, count, componentType, type, ...extra }) - 1;
  }

  for (const { part, local, report } of results) {
    const geometry = part.mesh.geometry.clone();
    const position = geometry.attributes.position;
    position.array = local;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const count = position.count;
    const translation = geometry.boundingBox.min.toArray();
    const size = geometry.boundingBox.getSize(new Vector3());
    const step = Math.max(size.x, size.y, size.z, 1e-8) / 65535;
    const quantized = new Uint16Array(count * 4), normals = new Float32Array(count * 4);
    const sourceNormals = geometry.attributes.normal.array;
    for (let i = 0; i < count; i++) {
      const normalLength = Math.hypot(...sourceNormals.subarray(i*3,i*3+3)) || 1;
      for (let a = 0; a < 3; a++) {
        quantized[i*4+a] = Math.round((local[i*3+a] - translation[a]) / step);
        normals[i*4+a] = sourceNormals[i*3+a] / normalLength;
      }
    }
    report.maxPackQuantizationIn = step * Math.sqrt(3) / 2 * heights[1] / inch;
    report.maxPinResidualIn += report.maxPackQuantizationIn;
    const attrs = {
      POSITION: add(quantized,count,5123,'VEC3','ATTRIBUTES',{
        min:[0,0,0], max:[size.x,size.y,size.z].map((length) => Math.round(length/step)),
      }),
      NORMAL: add(MeshoptEncoder.encodeFilterOct(normals,count,4,8),count,5120,'VEC3','ATTRIBUTES',
        { normalized:true },'OCTAHEDRAL'),
    };
    if (geometry.attributes.uv)
      attrs.TEXCOORD_0 = add(MeshoptEncoder.encodeFilterExp(geometry.attributes.uv.array,count,8,13,'SharedComponent'),
        count,5126,'VEC2','ATTRIBUTES',{},'EXPONENTIAL');
    const color = geometry.attributes.color;
    if (color) {
      const rgb = new Uint8Array(count*4);
      for (let i = 0; i < count; i++) {
        rgb[i*4] = Math.round(255 * MathUtils.clamp(color.getX(i),0,1));
        rgb[i*4+1] = Math.round(255 * MathUtils.clamp(color.getY(i),0,1));
        rgb[i*4+2] = Math.round(255 * MathUtils.clamp(color.getZ(i),0,1));
        rgb[i*4+3] = 255;
      }
      attrs.COLOR_0 = add(rgb,count,5121,'VEC3','ATTRIBUTES',{ normalized:true });
    }
    const idx = geometry.index.array;
    const indices = add(idx,idx.length,idx.BYTES_PER_ELEMENT===2?5123:5125,'SCALAR','TRIANGLES');
    const name = part.muscleNode;
    const extras = { name: part.sourcePart, rigJoint: part.joint, adaptation: 'adapted from male atlas' };
    const mesh = gltf.meshes.push({ name, extras, primitives:[{ attributes:attrs, indices }] })-1;
    gltf.scenes[0].nodes.push(gltf.nodes.push({ mesh, name, translation, scale:[step,step,step] })-1);
    geometry.dispose();
  }
  gltf.buffers = [{ byteLength:byteOffset }, { byteLength:fallback, extensions:{ [meshopt]:{ fallback:true } } }];
  const json = Buffer.from(JSON.stringify(gltf)), header = Buffer.alloc(28+round(json.length),32);
  header.write('glTF');
  header.writeUInt32LE(2,4);
  header.writeUInt32LE(header.length+byteOffset,8);
  header.writeUInt32LE(round(json.length),12);
  header.write('JSON',16);
  json.copy(header,20);
  header.writeUInt32LE(byteOffset,header.length-8);
  header.write('BIN\0',header.length-4);
  return Buffer.concat([header,...blocks]);
}

for (const tier of tiers) {
  const rig = createActor('roma', heights[1]);
  const parts = [];
  const prepare = await prepareSourceAnatomy('roma', tier, undefined, { upperOnly:true, repairs:false, rawUpper:true });
  prepare(rig, parts);
  const cortices = corticalSurfaces(parts);
  const surfaces = parts.filter((p) => p.muscleNode).map((p) => adapt(p, rig, cortices));
  const packs = [];
  for (const family of ['bp3d','zanatomy']) {
    const shareAlike = family === 'zanatomy';
    const selected = surfaces.filter(({ part }) => /Z-Anatomy/.test(part.source) === shareAlike);
    if (shareAlike ? selected.length !== 4 : selected.length !== 251) throw Error('Wrong adapted inventory');
    const file = 'roma-adapted-' + family + '-' + tier + '-meshopt.glb';
    const data = encodePack(selected, shareAlike);
    await writeFile(new URL(file, assetPath), data);
    packs.push({ file, bytes: data.length, sha256: sha256(data), parts: selected.length });
  }
  await writeFile(new URL('roma-muscle-adaptation-' + tier + '.json',reviewPath), JSON.stringify({
    tier,
    method: 'Cross-section scaling along the dominant fibre axis followed by a compact radial displacement. Named major attachments and inferred deep-muscle endpoints are projected onto the actual female BoneHub triangle surfaces. Exact pins are stored in the adapted bind frame. Volumes are absolute oriented-triangle estimates in cubic inches, including source surfaces with open boundaries.',
    packs, meshes: surfaces.map((p) => p.report),
  },null,2)+'\n');
  console.log(tier, packs.map((p) => [p.file,p.parts,p.bytes]));
}
