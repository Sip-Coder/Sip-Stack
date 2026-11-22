// Compare the production source anatomy with the authored body shell from six
// views. Scratch world positions below are for the depth test only.
import { registerHooks } from 'node:module';
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

const T = await import('three');
const { depthViews, raster } = await import('./axon-depth.mjs');
const { buildDiagramModel } = await import('../docs/characters/diagram-parts.js');
const { createSourceRig } = await import('../docs/characters/source-rig.js');
const { romaExterior } = await import('../docs/characters/roma-exterior-data.js');

const inch = 0.0254;
const softTissue = ['breast', 'gluteal-fat', 'hip-fat'];
const resolution = 512;
const allowance = 0.04 * inch;
const hair = /hair|curl|brow|lash|sideburn|quiff|wave|scalp|forelock|tapered lock|fringe/i;
const [onlyName, onlyTier] = process.argv.slice(2);

function worldParts(parts) {
  const point = new T.Vector3();
  return parts.map((part) => {
    const { mesh, sourceMatrix } = part;
    if (!sourceMatrix) return part;
    const attr = mesh.geometry.attributes.position;
    const points = new Float32Array(attr.count * 3);
    for (let i = 0; i < attr.count; i++)
      point.fromBufferAttribute(attr, i).applyMatrix4(sourceMatrix).toArray(points, i * 3);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(points, 3));
    geometry.setIndex(mesh.geometry.index);
    return { ...part, mesh: { geometry } };
  });
}

function measure(parts) {
  const interior = worldParts(parts.filter((p) => p.layer === 'skeleton' || p.layer === 'muscles' ||
    softTissue.includes(p.layer)));
  const skin = parts.filter((p) => p.layer === 'skin' && !hair.test(p.name));
  const outside = [...skin, ...parts.filter((p) => p.layer === 'clothes')];
  const bounds = new T.Box3();
  for (const { mesh } of [...interior, ...skin]) {
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    bounds.union(g.boundingBox);
  }
  const center = bounds.getCenter(new T.Vector3());
  const scale = resolution / (1.10 * bounds.getSize(new T.Vector3()).length());
  const totals = { tested: 0, skinDepth: 0, skinSilhouette: 0, outfitDepth: 0, outfitSilhouette: 0 };
  const byPart = new Map();
  const views = depthViews.map(([yaw, pitch]) => {
    const tissues = raster(interior, center, scale, resolution, yaw, pitch);
    const bare = raster(skin, center, scale, resolution, yaw, pitch).depth;
    const dressed = raster(outside, center, scale, resolution, yaw, pitch).depth;
    const stats = { tested: 0, skinDepth: 0, skinSilhouette: 0, outfitDepth: 0, outfitSilhouette: 0 };
    for (let i = 0; i < tissues.depth.length; i++) {
      if (tissues.winners[i] < 0) continue;
      stats.tested++;
      const bareGap = tissues.depth[i] - bare[i], dressedGap = tissues.depth[i] - dressed[i];
      for (const [gap, kind] of [[bareGap, 'skin'], [dressedGap, 'outfit']]) {
        if (gap <= allowance) continue;
        stats[kind + (gap === Infinity ? 'Silhouette' : 'Depth')]++;
        const part = interior[tissues.winners[i]];
        const key = part.name;
        if (!byPart.has(key)) byPart.set(key, { name: key, layer: part.layer, skin: 0, outfit: 0, maximumDepthIn: 0 });
        const entry = byPart.get(key);
        entry[kind]++;
        if (Number.isFinite(gap)) entry.maximumDepthIn = Math.max(entry.maximumDepthIn, gap / inch);
      }
    }
    for (const [key, result] of Object.entries(stats)) totals[key] += result;
    return { yaw, pitch, ...stats };
  });
  return {
    resolution, depthToleranceIn: allowance / inch, ...totals, views,
    parts: [...byPart.values()].sort((a, b) => b.skin + b.outfit - a.skin - a.outfit),
  };
}

function waistToHip() {
  const { joints } = createSourceRig('roma');
  const hips = joints.hips.y, chest = joints.chest.y;
  const sections = romaExterior.torso.map(([y, , , ...radii]) => {
    const turn = Math.cos(2 * Math.PI / radii.length);
    let circumference = 0;
    for (const [i, a] of radii.entries()) {
      const b = radii[(i + 1) % radii.length];
      circumference += Math.sqrt(a*a + b*b - 2*a*b*turn);
    }
    return { height: y / 10000, circumference: circumference / 10000 };
  });
  const waist = Math.min(...sections.filter((s) =>
    s.height >= hips + 0.33 * (chest - hips) && s.height <= hips + 0.79 * (chest - hips))
    .map((s) => s.circumference));
  const hip = Math.max(...sections.filter((s) => Math.abs(s.height - hips) <= 0.048)
    .map((s) => s.circumference));
  return { ratio: waist / hip, waistIn: waist * 1.68 / inch, hipIn: hip * 1.68 / inch };
}

for (const name of onlyName ? [onlyName] : ['sippy', 'roma']) {
  for (const tier of onlyTier ? [onlyTier] : ['mobile', 'high']) {
    const model = await buildDiagramModel(name, tier);
    try {
      const body = name === 'roma' ? { waistToHip: waistToHip() } : {};
      console.log(JSON.stringify({ name, tier, ...body, ...measure(model.parts) }));
    }
    finally { model.dispose(); }
  }
}
