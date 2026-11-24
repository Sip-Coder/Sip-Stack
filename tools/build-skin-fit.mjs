// Bake the Axon diagnostic against the shipped triangle buffers and poses.
// THREE_ROOT and MESH_BVH_ROOT can point to Three r170 and three-mesh-bvh 0.8.3.
import { mkdir, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout = '.', output = 'docs/characters/assets', selected, quality] = process.argv.slice(2);
const { THREE_ROOT, MESH_BVH_ROOT } = process.env;
if (THREE_ROOT || MESH_BVH_ROOT) {
  registerHooks({ resolve(name, context, next) {
    const addon = 'three/addons/';
    let file;
    if (THREE_ROOT && name === 'three') file = resolve(THREE_ROOT, 'build/three.module.js');
    if (THREE_ROOT && name.startsWith(addon)) file = resolve(THREE_ROOT, 'examples/jsm', name.slice(addon.length));
    if (MESH_BVH_ROOT && name === 'three-mesh-bvh') file = resolve(MESH_BVH_ROOT, 'src/index.js');
    return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(name, context);
  } });
}
const [{ BufferAttribute, BufferGeometry, Box3, Vector3 }, { MeshBVH },
  { fitFingerprint, fitLimitIn }, { depthViews, raster }] = await Promise.all([
    import('three'), import('three-mesh-bvh'), import('../docs/characters/diagram-skin-fit.js'), import('./axon-depth.mjs'),
  ]);
const modelURL = pathToFileURL(resolve(checkout, 'docs/characters/diagram-parts.js'));
const { buildDiagramModel } = await import(modelURL);
const inch = 0.0254;
const round = (value) => Math.round(value * 1000) / 1000;
const point = new Vector3();
const hit = { point: new Vector3(), distance: 0 };
const soft = new Set(['breast', 'gluteal-fat', 'hip-fat']);
const wrapped = /^(?:Subcutaneous torso and neck|(?:Left|Right) (?:arm skin|leg skin|foot skin|hand))$/;

function posed(part) {
  const original = part.mesh.geometry;
  if (!part.sourceMatrix) return part;
  const pos = original.attributes.position;
  const xyz = new Float32Array(3 * pos.count);
  for (let i = 0; i < pos.count; i++)
    point.fromBufferAttribute(pos, i).applyMatrix4(part.sourceMatrix).toArray(xyz, 3 * i);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(xyz, 3));
  geometry.setIndex(original.index);
  return { ...part, mesh: { geometry } };
}

function tree(parts) {
  if (!parts.length) return null;
  const geometries = parts.map((item) => item.mesh.geometry);
  const xyz = new Float32Array(geometries.reduce((sum, g) => sum + g.attributes.position.array.length, 0));
  const indices = new Uint32Array(geometries.reduce((sum, g) => sum + g.index.count, 0));
  let v = 0, t = 0;
  for (const g of geometries) {
    const positions = g.attributes.position.array;
    xyz.set(positions, v);
    for (const i of g.index.array) indices[t++] = i + v / 3;
    v += positions.length;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(xyz, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return new MeshBVH(geometry);
}

function areaWeights(geometry) {
  const pos = geometry.attributes.position;
  const weights = new Float64Array(pos.count);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const index = geometry.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const x = index[i], y = index[i + 1], z = index[i + 2];
    a.fromBufferAttribute(pos, x);
    b.fromBufferAttribute(pos, y).sub(a);
    c.fromBufferAttribute(pos, z).sub(a);
    const share = b.cross(c).length() / 6;
    weights[x] += share;
    weights[y] += share;
    weights[z] += share;
  }
  return weights;
}

function summarize(gaps, weights) {
  let weighted = 0, maximum = 0, area = 0;
  for (let i = 0; i < gaps.length; i++) {
    weighted += gaps[i] * weights[i];
    maximum = Math.max(maximum, gaps[i]);
    area += weights[i];
  }
  return { weighted, maximum, area };
}

function report({ weighted, maximum, area }) {
  return { meanIn: round(weighted / area), maxIn: round(maximum) };
}

function all(parts, kind) {
  return report({
    weighted: parts.reduce((sum, p) => sum + p[kind].weighted, 0),
    area: parts.reduce((sum, p) => sum + p[kind].area, 0),
    maximum: Math.max(...parts.map((p) => p[kind].maximum)),
  });
}

function depthCheck(skin, parts) {
  const bounds = new Box3();
  for (const part of skin) {
    part.mesh.geometry.computeBoundingBox();
    bounds.union(part.mesh.geometry.boundingBox);
  }
  const resolution = 512, toleranceIn = 0.04;
  const centre = bounds.getCenter(new Vector3());
  const scale = resolution / (1.10 * bounds.getSize(new Vector3()).length());
  let screened = 0, exposed = 0, worst = 0;
  for (const [yaw, pitch] of depthViews) {
    const outer = raster(skin, centre, scale, resolution, yaw, pitch).depth;
    const inner = raster(parts, centre, scale, resolution, yaw, pitch).depth;
    for (let i = 0; i < outer.length; i++) {
      if (!Number.isFinite(outer[i]) || !Number.isFinite(inner[i])) continue;
      screened++;
      const depthIn = (inner[i] - outer[i]) / inch;
      if (depthIn <= toleranceIn) continue;
      exposed++;
      worst = Math.max(worst, depthIn);
    }
  }
  return { resolution, views: depthViews.length, toleranceIn, overlappingPixels: screened, exposedPixels: exposed,
    maxDepthIn: round(worst) };
}

await mkdir(output, { recursive: true });
for (const name of selected ? [selected] : ['sippy', 'roma']) {
  for (const tier of quality ? [quality] : ['mobile', 'high']) {
    const model = await buildDiagramModel(name, tier);
    try {
      const skin = model.parts.filter((p) => p.layer === 'skin' && wrapped.test(p.name));
      if (skin.length !== 9) throw new Error('Missing a wrapped skin part on ' + name + '/' + tier);
      const muscles = model.parts.filter((p) => p.layer === 'muscles').map(posed);
      const other = model.parts.filter((p) => (p.layer === 'skeleton' && p.sourceMatrix) || soft.has(p.layer)).map(posed);
      const muscleTree = tree(muscles), otherTree = tree(other);
      const parts = skin.map(({ id, mesh }) => {
        const g = mesh.geometry, positions = g.attributes.position;
        const m = new Float32Array(positions.count), s = new Float32Array(positions.count);
        const map = Buffer.alloc(positions.count);
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i);
          m[i] = muscleTree.closestPointToPoint(point, hit).distance / inch;
          const closest = otherTree?.closestPointToPoint(point, hit, 0, m[i] * inch);
          s[i] = closest ? Math.min(m[i], closest.distance / inch) : m[i];
          map[i] = Math.round(255 * Math.min(1, m[i] / fitLimitIn));
        }
        const weights = areaWeights(g);
        return {
          id, vertices: positions.count, fingerprint: fitFingerprint(g), bytes: map.toString('base64'),
          muscle: summarize(m, weights), support: summarize(s, weights),
        };
      });
      const data = {
        name, tier, colorLimitIn: fitLimitIn,
        samples: parts.reduce((sum, p) => sum + p.vertices, 0),
        muscle: all(parts, 'muscle'), support: all(parts, 'support'),
        projectedExposure: depthCheck(skin, [...muscles, ...other]),
        parts: parts.map((p) => ({ ...p, muscle: report(p.muscle), support: report(p.support) })),
      };
      await writeFile(resolve(output, `skin-wrap-gap-${name}-${tier}.json`), JSON.stringify(data) + '\n');
      console.log(JSON.stringify({ ...data, parts: undefined }));
    } finally {
      model.dispose();
    }
  }
}
