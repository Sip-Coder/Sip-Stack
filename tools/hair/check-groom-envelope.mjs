// Compare the neutral hair silhouettes exported on either side of a groom edit.
// For an unchanged groom with a new bind, add --mounted /path/to/baseline/checkout.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [baseline, option, priorCheckout] = process.argv.slice(2);
const mounted = option === '--mounted';
const archiveDirectory = mounted || !option ? 'docs/characters/assets/hair' : option;
if (!baseline || (mounted && !priorCheckout))
  throw new Error('Supply a baseline commit and an optional archive directory or --mounted <baseline checkout>.');
if (mounted && execFileSync('git', ['-C', priorCheckout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !==
    execFileSync('git', ['rev-parse', baseline], { encoding: 'utf8' }).trim())
  throw new Error('The mounted baseline checkout must match the baseline commit.');
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

const { Box3, Vector3 } = await import('three');
const { decodeHair } = await import('../../docs/characters/hair-groom.js');
const size = 320, inchesPerMeter = 39.37007874;

async function surface(bytes, hero, tier) {
  const glb = gunzipSync(bytes);
  const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const { scene } = await decodeHair(buffer, hero, tier);
  scene.updateMatrixWorld(true);
  return collect(scene, new Vector3(), 1);
}

function collect(scene, origin, unit) {
  const parts = [];
  const p = new Vector3();
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const points = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
      mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).sub(origin).multiplyScalar(unit).clone());
    parts.push({ points, indices: mesh.geometry.index.array, band: mesh.userData.hairPart === 'headband' });
  });
  return parts;
}

async function mountedSurface(checkout, hero, tier) {
  const root = pathToFileURL(resolve(checkout) + '/docs/characters/');
  const [{ loadAvatar }, { createActor }, { names, heights }] = await Promise.all(
    ['avatar-builder.js', 'rig.js', 'ui.js'].map(name => import(new URL(name, root))));
  const build = await loadAvatar(hero, tier);
  const rig = createActor(hero, heights[names.indexOf(hero)]);
  build(rig);
  rig.root.updateMatrixWorld(true);
  return collect(rig.groom.group, rig.head.getWorldPosition(new Vector3()), inchesPerMeter);
}

function dimensions(parts, band) {
  const points = parts.filter(part => part.band === band).flatMap(part => part.points);
  if (!points.length) return undefined;
  const box = new Box3().setFromPoints(points);
  return box.getSize(new Vector3()).toArray().map(value => +value.toFixed(3));
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
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assets = [], results = [];
for (const name of ['sippy', 'roma']) for (const tier of ['mobile', 'high']) {
  const path = `docs/characters/assets/hair/${name}-${tier}.glb.gz`;
  const oldBytes = execFileSync('git', ['show', `${baseline}:${path}`]);
  const newBytes = await readFile(resolve(archiveDirectory, `${name}-${tier}.glb.gz`));
  const [before, after] = await Promise.all(mounted
    ? [mountedSurface(priorCheckout, name, tier), mountedSurface('.', name, tier)]
    : [surface(oldBytes, name, tier), surface(newBytes, name, tier)]);
  const glbSha256 = { before: digest(gunzipSync(oldBytes)), after: digest(gunzipSync(newBytes)) };
  const measure = parts => ({ hair: dimensions(parts, false), band: dimensions(parts, true) });
  assets.push({ name, tier, transferBytes: { before: oldBytes.length, after: newBytes.length },
    glbSha256, ...(mounted && { dimensionsInchesXYZ: { before: measure(before), after: measure(after) } }) });
  const old = before.filter(part => !part.band), now = after.filter(part => !part.band);
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
console.log(JSON.stringify({ baseline, mounted, resolution: size, assets, results }, null, 2));
