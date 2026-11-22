// npm install --prefix /tmp/axon-worker esbuild@0.25.12 three@0.170.0
// NODE_PATH=/tmp/axon-worker/node_modules node tools/build-axon-worker.mjs
// Only the missing-pack Worker requests this artifact. Bundle the fitting
// modules because document import maps are unavailable in dedicated Workers.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const root = dirname(fileURLToPath(new URL('../docs/characters/diagram-fit-worker.js', import.meta.url)));
const three = process.env.THREE_ROOT || resolve(dirname(require.resolve('three')), '..');
const notice = readFileSync(join(three, 'LICENSE'), 'utf8');
const output = join(root, 'diagram-worker.generated.js');
const result = await build({
  absWorkingDir: root,
  entryPoints: ['diagram-worker-stream.js'],
  outfile: output, write: false,
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  legalComments: 'eof', external: ['node:fs/promises'],
  banner: { js: '/*! Generated with tools/build-axon-worker.mjs.\n' +
    'Bundled Three.js addons and meshoptimizer are licensed under MIT.\n' +
    'Meshoptimizer copyright (c) 2016-2022 Arseny Kapoulkine.\n' + notice + '*/' },
  plugins: [{
    name: 'worker-dependencies',
    setup(build) {
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'page' }));
      build.onLoad({ filter: /.*/, namespace: 'page' }, () => ({ contents: 'module.exports=self.axonThree;' }));
      build.onResolve({ filter: /^three\/addons\// }, ({ path }) => ({
        path: join(three, 'examples/jsm', path.slice('three/addons/'.length)),
      }));
      build.onResolve({ filter: /^\.\/(hummin|diagram-hummin|diagram-robot)\.js$/ }, ({ path }) => ({
        path, namespace: 'unused-robot',
      }));
      build.onLoad({ filter: /.*/, namespace: 'unused-robot' }, () => ({
        contents: 'throw Error("Human-only fitting worker");',
      }));
    },
  }],
});
const bundle = result.outputFiles[0].contents;
if (process.argv.includes('--check')) {
  if (!readFileSync(output).equals(bundle)) throw new Error('Rebuild the Axon worker for the current fitter');
} else {
  writeFileSync(output, bundle);
}
