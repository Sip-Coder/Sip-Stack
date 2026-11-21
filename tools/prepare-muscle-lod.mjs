// Offline only. Pinned dependencies and the two source files are in MUSCLE-SKIN-LICENSE.md.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { basename } from 'node:path';

const [input, output] = process.argv.slice(2);
const match = input && /^bp3d-muscles-(mobile|high)-meshopt\.glb$/.exec(basename(input));
if (!match || !output) throw Error('Expected a BodyParts3D tier GLB and the output file name');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const mobile = match[1] === 'mobile';
const inch = 0.0254;

// A named muscle can contain separated intercostal slips or fine tendons.
// Keep one triangle around each support extremity per connected component.
function protectedVertices(indices, positions) {
  const count = positions.length / 3;
  const locked = new Uint8Array(count);
  const roots = Uint32Array.from({ length: count }, (_, i) => i);
  const face = new Int32Array(count).fill(-1);
  function root(i) {
    while (roots[i] !== i) {
      roots[i] = roots[roots[i]];
      i = roots[i];
    }
    return i;
  }
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.subarray(i, i + 3);
    roots[root(b)] = root(a);
    roots[root(c)] = root(a);
    face[a] = face[b] = face[c] = i;
  }
  const components = new Map();
  for (let i = 0; i < count; i++) {
    if (face[i] < 0) continue;
    const group = root(i);
    if (!components.has(group)) components.set(group, []);
    components.get(group).push(i);
  }
  for (const component of components.values()) {
    if (component.length <= 24) {
      for (const vertex of component) locked[vertex] = 1;
      continue;
    }
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
      if (!x && !y && !z) continue;
      let maximum = -Infinity, best;
      for (const i of component) {
        const j = i * 3;
        const distance = x * positions[j] + y * positions[j + 1] + z * positions[j + 2];
        if (distance > maximum) { maximum = distance; best = i; }
      }
      const k = face[best];
      for (let j = k; j < k + 3; j++) locked[indices[j]] = 1;
    }
  }
  return locked;
}

function surface(indices, position) {
  const geometry = new BufferGeometry().setAttribute('position', position);
  geometry.setIndex(new BufferAttribute(indices, 1));
  return new MeshBVH(geometry, { indirect: true });
}

// Sample vertices referenced by each surface, and every triangle centroid, in both directions.
// The imported meshes use isotropic quantization. Perform the distance check at donor scale.
function withinTolerance(from, to, scale) {
  const position = from.geometry.attributes.position, indices = from.geometry.index.array;
  const used = new Set(indices), point = new Vector3(), vertex = new Vector3(), nearest = {};
  let aboveFineTolerance = 0;
  const allowedFineOutliers = Math.floor((used.size + indices.length / 3) * .01);
  function accepts() {
    const d = to.closestPointToPoint(point, nearest).distance * scale;
    if (d > .09 * inch) return false;
    if (d > .025 * inch && ++aboveFineTolerance > allowedFineOutliers) return false;
    return true;
  }
  for (const i of used) {
    point.fromBufferAttribute(position, i);
    if (!accepts()) return false;
  }
  for (let i = 0; i < indices.length; i += 3) {
    point.set(0, 0, 0);
    for (let j = i; j < i + 3; j++) point.add(vertex.fromBufferAttribute(position, indices[j]));
    point.multiplyScalar(1 / 3);
    if (!accepts()) return false;
  }
  return true;
}

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const scales = node.getWorldScale();
  if (Math.max(...scales) - Math.min(...scales) > 1e-7) throw Error('Expected isotropic input');
  for (const primitive of mesh.listPrimitives()) {
    const triangles = primitive.getIndices().getCount() / 3;
    const minimum = mobile ? 28 : 46;
    if (triangles <= minimum) continue;
    simplifyPrimitive(primitive, {
      ratio: Math.max(minimum / triangles, mobile ? .30 : .17),
      lockBorder: true,
      simplifier: {
        simplify(indices, positions, stride, target, _, flags) {
          const position = new BufferAttribute(positions, stride);
          const original = surface(indices, position);
          const locked = protectedVertices(indices, positions);
          for (const error of [.025, .012, .006, .003, .0015, .00075]) {
            const [reduced] = MeshoptSimplifier.simplifyWithAttributes(
              indices, positions, stride, new Float32Array(), 0, [], locked, target, error,
              [...flags, 'PreserveFolds'],
            );
            if (reduced.length < minimum * 3) continue;
            const candidate = surface(reduced, position);
            if (withinTolerance(original, candidate, scales[0]) && withinTolerance(candidate, original, scales[0])) {
              return [reduced, error];
            }
          }
          return [indices, 0];
        },
      },
    });
  }
}
await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
doc.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
