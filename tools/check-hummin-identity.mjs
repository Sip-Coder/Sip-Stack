// Compare the actual Hummin inspection meshes from two local checkouts.
// THREE_ROOT=/path/to/three-r170 node tools/check-hummin-identity.mjs BEFORE AFTER
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [before, after = '.'] = process.argv.slice(2);
if (!before) throw new Error('Supply a checkout of the baseline revision');
if (process.env.THREE_ROOT) {
  const three = resolve(process.env.THREE_ROOT);
  registerHooks({
    resolve(specifier, context, next) {
      const file = specifier === 'three'
        ? 'build/three.module.js'
        : specifier.startsWith('three/addons/')
          ? 'examples/jsm/' + specifier.slice('three/addons/'.length)
          : '';
      return file ? { url: pathToFileURL(resolve(three, file)).href, shortCircuit: true } : next(specifier, context);
    },
  });
}

const materialProperties = [
  'name', 'type', 'color', 'vertexColors', 'roughness', 'metalness', 'emissive',
  'emissiveIntensity', 'clearcoat', 'clearcoatRoughness', 'specularIntensity', 'specularColor',
  'transparent', 'opacity', 'alphaTest', 'side', 'depthTest', 'depthWrite', 'blending',
  'toneMapped', 'wireframe',
];
const textureProperties = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

function addData(hash, data) {
  hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
}

function addMetadata(hash, value) {
  hash.update(JSON.stringify(value) ?? 'undefined');
}

function addAttribute(hash, attribute) {
  if (!attribute) {
    addMetadata(hash, null);
    return;
  }
  addMetadata(hash, [attribute.itemSize, attribute.normalized, attribute.array.constructor.name, attribute.array.length]);
  addData(hash, attribute.array);
}

function addGeometry(hash, geometry) {
  for (const name of Object.keys(geometry.attributes).sort()) {
    addMetadata(hash, name);
    addAttribute(hash, geometry.getAttribute(name));
  }
  for (const name of Object.keys(geometry.morphAttributes).sort()) {
    addMetadata(hash, name);
    for (const attribute of geometry.morphAttributes[name]) addAttribute(hash, attribute);
  }
  addAttribute(hash, geometry.index);
  addMetadata(hash, [geometry.groups, geometry.morphTargetsRelative, geometry.drawRange]);
}

function addMaterial(hash, material) {
  for (const name of materialProperties) {
    const value = material[name];
    addMetadata(hash, [name, value?.toArray ? value.toArray() : value]);
  }
  addMetadata(hash, material.onBeforeCompile?.toString());
  addMetadata(hash, material.customProgramCacheKey?.toString());
  for (const name of textureProperties) {
    const texture = material[name];
    addMetadata(hash, [
      name, texture?.type, texture?.format, texture?.repeat.toArray(), texture?.offset.toArray(),
      texture?.colorSpace, texture?.image?.width, texture?.image?.height,
    ]);
    if (texture?.image?.data) addData(hash, texture.image.data);
  }
}

async function inspect(repo, tier) {
  const module = pathToFileURL(resolve(repo, 'docs/characters/diagram-parts.js'));
  const { buildDiagramModel } = await import(module.href);
  const model = await buildDiagramModel('hummin', tier);
  const hash = createHash('sha256');
  let triangles = 0;
  for (const { name, layer, mesh, source } of model.parts) {
    addMetadata(hash, [name, layer, source, mesh.matrix.toArray()]);
    addGeometry(hash, mesh.geometry);
    for (const material of [].concat(mesh.material)) addMaterial(hash, material);
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  }
  const result = { parts: model.parts.length, triangles, sha256: hash.digest('hex') };
  model.dispose();
  return result;
}

const rows = [];
for (const tier of ['mobile', 'high']) {
  const prior = await inspect(before, tier);
  const current = await inspect(after, tier);
  if (JSON.stringify(prior) !== JSON.stringify(current)) {
    throw new Error('Hummin ' + tier + ' identity differs: ' + JSON.stringify({ prior, current }));
  }
  rows.push({ tier, parts: prior.parts, triangles: prior.triangles, baselineSha256: prior.sha256, candidateSha256: current.sha256 });
}
const revision = (repo) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
console.log(JSON.stringify({ baseline: revision(before), candidate: revision(after), rows }, null, 2));
