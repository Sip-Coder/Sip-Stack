// Compare the neutral hair silhouettes exported on either side of a groom edit.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [baseline, archiveDirectory = 'docs/characters/assets/hair'] = process.argv.slice(2);
if (!baseline) throw new Error('Supply the baseline commit and optional candidate archive directory.');
if (process.env.THREE_ROOT) {
  const three = process.env.THREE_ROOT;
  registerHooks({
    resolve(name, context, next) {
      if (name === 'three') return {
        url: pathToFileURL(resolve(three, 'build/three.module.js')).href, shortCircuit: true,
      };
      if (name.startsWith('three/addons/')) return {
        url: pathToFileURL(resolve(three, 'examples/jsm', name.slice(13))).href, shortCircuit: true,
      };
      return next(name, context);
    },
  });
}

const { Vector3 } = await import('three');
const { decodeHair } = await import('../../docs/characters/hair-groom.js');
const size = 320;

async function surface(bytes, hero, tier) {
  const glb = gunzipSync(bytes);
  const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const { scene } = await decodeHair(buffer, hero, tier);
  const parts = [];
  const p = new Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.hairPart === 'headband') return;
    const points = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
      mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).clone());
    parts.push({ points, indices: mesh.geometry.index.array });
  });
  return parts;
}

function project(parts, yaw) {
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const patches = parts.map(({ points, indices }) => {
    const pixels = points.map(p => {
      const x = p.x * c - p.z * s, y = p.y;
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x);
      bounds[3] = Math.max(bounds[3], y);
      return [x, y];
    });
    return { pixels, indices };
  });
  return { patches, bounds };
}

function coverage({ patches }, left, bottom, scale) {
  const mask = new Uint8Array(size * size);
  for (const { pixels, indices } of patches) {
    const view = pixels.map(([x, y]) => [(x - left) * scale + 2, (y - bottom) * scale + 2]);
    for (let i = 0; i < indices.length; i += 3) {
      const a = view[indices[i]], b = view[indices[i + 1]], c = view[indices[i + 2]];
      const xLo = Math.ceil(Math.min(a[0], b[0], c[0]) - 0.5);
      const xHi = Math.floor(Math.max(a[0], b[0], c[0]) - 0.5);
      const yLo = Math.ceil(Math.min(a[1], b[1], c[1]) - 0.5);
      const yHi = Math.floor(Math.max(a[1], b[1], c[1]) - 0.5);
      const edge = (from, to, x, y) => (to[0] - from[0]) * (y - from[1]) - (to[1] - from[1]) * (x - from[0]);
      if (!edge(a, b, c[0], c[1])) continue;
      for (let y = yLo; y <= yHi; y++) for (let x = xLo; x <= xHi; x++) {
        const ab = edge(a, b, x + 0.5, y + 0.5);
        const bc = edge(b, c, x + 0.5, y + 0.5);
        const ca = edge(c, a, x + 0.5, y + 0.5);
        if ((ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0)) mask[y * size + x] = 1;
      }
    }
  }
  return mask;
}

const percent = value => +(100 * value).toFixed(2);
const results = [];
for (const name of ['sippy', 'roma']) for (const tier of ['mobile', 'high']) {
  const path = `docs/characters/assets/hair/${name}-${tier}.glb.gz`;
  const old = await surface(execFileSync('git', ['show', `${baseline}:${path}`]), name, tier);
  const now = await surface(await readFile(resolve(archiveDirectory, `${name}-${tier}.glb.gz`)), name, tier);
  for (const yaw of [0, 45, 90, 180]) {
    const a = project(old, yaw), b = project(now, yaw);
    const left = Math.min(a.bounds[0], b.bounds[0]), bottom = Math.min(a.bounds[1], b.bounds[1]);
    const right = Math.max(a.bounds[2], b.bounds[2]), top = Math.max(a.bounds[3], b.bounds[3]);
    const scale = (size - 4) / Math.max(right - left, top - bottom);
    const prior = coverage(a, left, bottom, scale), next = coverage(b, left, bottom, scale);
    let common = 0, union = 0;
    for (let i = 0; i < prior.length; i++) {
      common += prior[i] & next[i];
      union += prior[i] | next[i];
    }
    const span = (box, axis) => box[axis + 2] - box[axis];
    results.push({
      name, tier, yaw, overlapPercent: percent(common / union),
      widthChangePercent: percent(span(b.bounds, 0) / span(a.bounds, 0) - 1),
      heightChangePercent: percent(span(b.bounds, 1) / span(a.bounds, 1) - 1),
    });
  }
}
console.log(JSON.stringify({ baseline, resolution: size, results }, null, 2));
