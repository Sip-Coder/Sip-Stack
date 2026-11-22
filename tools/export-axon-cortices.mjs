// Save only the six paired neutral High bones used by the landmark audit.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [destination, checkout = fileURLToPath(new URL('..', import.meta.url))] = process.argv.slice(2);
if (!destination) throw Error('Usage: node export-axon-cortices.mjs scratch-directory [checkout]');
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
const { REVISION } = await import('three');
if (REVISION !== '170') throw Error('Expected three@0.170.0');
const component = (file) => pathToFileURL(resolve(checkout, 'docs/characters', file)).href;
const fitModule = existsSync(resolve(checkout, 'docs/characters/diagram-fit-model.js'))
  ? 'diagram-fit-model.js' : 'diagram-parts.js';
const { buildDiagramModel } = await import(component(fitModule));
const { loadSkeletonScan } = await import(component('diagram-scan-source.js'));
const selected = /^(FEMUR|CLAVICLE|TIBIA)_(LEFT|RIGHT)$/;
function geometryBuffers(geometry) {
  return {
    vertices: Array.from(geometry.attributes.position.array),
    indices: Array.from(geometry.index.array),
  };
}
await mkdir(destination, { recursive: true });
for (const name of ['sippy', 'roma']) {
  const model = await buildDiagramModel(name, 'high');
  try {
    const scan = await loadSkeletonScan(name, 'high');
    const fitted = Object.fromEntries(
      model.parts
        .filter((p) => selected.test(p.scanNode))
        .map((p) => [p.scanNode, geometryBuffers(p.mesh.geometry)]),
    );
    const donor = Object.fromEntries(
      [...scan].filter(([id]) => id.startsWith('FEMUR_')).map(([id, g]) => [id, geometryBuffers(g)]),
    );
    await Promise.all([
      writeFile(resolve(destination, name + '-high-cortices.json'), JSON.stringify(fitted)),
      writeFile(resolve(destination, 'source-' + name + '-high-cortices.json'), JSON.stringify(donor)),
    ]);
  } finally {
    model.dispose();
  }
}
