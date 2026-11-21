// Offline asset build. Install the pinned dependencies from SKELETON-LICENSE.md
// in a scratch directory beside this script. No build dependencies ship to browsers.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { basename } from 'node:path';

const [input, output] = process.argv.slice(2);
const match = input && /^(male|female)-(mobile|high)-meshopt\.glb$/.exec(basename(input));
if (!match || !output) {
  throw Error('Usage: node prepare-scan-lod.mjs {male|female}-{mobile|high}-meshopt.glb output.glb');
}
const [, sex, tier] = match;
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);

// Keep the support points of each bone in 26 directions plus its open CT-cut
// edges. All retained positions come directly from the supplied quantized mesh.
const preserveExtremities = {
  simplify(indices, positions, stride, target, error, flags) {
    const vertexCount = positions.length / stride;
    const locked = new Uint8Array(vertexCount);
    const directions = [-1, 0, 1];
    for (const x of directions) {
      for (const y of directions) {
        for (const z of directions) {
          if (x === 0 && y === 0 && z === 0) continue;
          let maximum = -Infinity;
          let extremity = 0;
          for (let i = 0; i < vertexCount; i++) {
            const j = i * stride;
            const distance = x * positions[j] + y * positions[j + 1] + z * positions[j + 2];
            if (distance > maximum) {
              maximum = distance;
              extremity = i;
            }
          }
          locked[extremity] = 1;
        }
      }
    }
    return MeshoptSimplifier.simplifyWithAttributes(
      indices, positions, stride, new Float32Array(0), 0, [], locked, target, error,
      [...flags, 'PreserveFolds'],
    );
  },
};

function targetRatio(name) {
  if (sex === 'male' && tier === 'high' && name === 'VERTEBRA_T6') return 1;
  if (name === 'SKULL_CRANIAL_MAXILLA') return tier === 'mobile' ? 1 : 0.55;
  const girdleOrSkull = /SKULL|HIP_|SCAPULA|SACRUM|CLAVICLE/.test(name);
  if (tier === 'mobile') return girdleOrSkull ? 0.86 : 0.75;
  return girdleOrSkull ? 0.46 : 0.35;
}

let originalTriangles = 0;
let fittedTriangles = 0;
const minimum = tier === 'mobile' ? 112 : 220;
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  for (const primitive of mesh.listPrimitives()) {
    const original = primitive.getIndices().getCount() / 3;
    simplifyPrimitive(primitive, {
      simplifier: preserveExtremities,
      ratio: Math.min(1, Math.max(minimum / original, targetRatio(node.getName()))),
      error: 0.01,
      lockBorder: true,
    });
    originalTriangles += original;
    fittedTriangles += primitive.getIndices().getCount() / 3;
  }
}
await document.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
document.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, document);
console.log(basename(output), originalTriangles, '→', fittedTriangles, 'triangles');
