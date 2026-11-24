// Bake the Axon diagnostic against the shipped triangle buffers and poses.
// THREE_ROOT and MESH_BVH_ROOT can point to Three r170 and three-mesh-bvh 0.8.3.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const faceOnly = args.includes('--face');
const [checkout = '.', output = 'docs/characters/assets', selected, quality] = args.filter((arg) => arg !== '--face');
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
const [{ BufferAttribute, BufferGeometry, Box3, DoubleSide, Ray, Vector3 }, { MeshBVH },
  { faceStudyFocus, faceStudyParts, fitFingerprint, fitLimitIn }, { depthViews, raster }] = await Promise.all([
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

const faceRegions = [
  'Forehead', 'Orbit', 'Cheek', 'Nose', 'Lips', 'Jaw', 'Chin', 'Ears', 'Neck join', 'Scalp',
];
const coreFace = /^Face(?: skin)?$/i;
const neck = /^(?:Neck|(?:Face to |Subcutaneous torso and )neck(?: join)?)$/i;
const lids = /^(?:Left|Right) (?:(?:upper|lower) eyelid|orbital rim)$/i;
const lips = /^(?:Upper|Lower) lip$/i;

function bounds(parts) {
  const box = new Box3();
  for (const { mesh: { geometry } } of parts) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
  }
  return box;
}

function faceClassifier(model, skin, skull) {
  const shell = bounds(skin.filter((part) => coreFace.test(part.name)));
  const head = bounds(skull.filter((part) => /^SKULL_/.test(part.scanNode ?? part.sourceNode)));
  const headX = head.getCenter(new Vector3()).x, halfHead = (head.max.x - head.min.x) / 2;
  const neckFloor = head.min.y - 1.75 * inch;
  const sizes = shell.getSize(new Vector3());
  const eyeSurface = model.parts.filter(({ name }) => /^(?:Left|Right) (?:sclera|cornea and iris|eyeball|eye|eye globe)$/i.test(name));
  const lidSurface = skin.filter(({ name }) => lids.test(name));
  const eyes = bounds(eyeSurface.length ? eyeSurface : lidSurface);
  const mouth = bounds(skin.filter(({ name }) => lips.test(name)));

  function classify(p, name) {
    if (/^(?:Left|Right) ear$/i.test(name)) return 'Ears';
    if (lips.test(name)) return 'Lips';
    if (lids.test(name)) return 'Orbit';
    if (neck.test(name)) {
      return !/^Subcutaneous/i.test(name) || (p.y >= neckFloor && Math.abs(p.x - headX) < 0.95 * halfHead) ?
        'Neck join' : undefined;
    }
    const side = Math.abs(p.x - headX) / sizes.x;
    const back = p.z < shell.min.z + 0.6 * sizes.z;
    if (back) return p.y >= eyes.min.y ? 'Scalp' : 'Neck join';
    if (p.y >= eyes.max.y + 0.10 * inch) return 'Forehead';
    if (p.y <= mouth.min.y - 0.08 * inch) return side <= 0.20 ? 'Chin' : 'Jaw';
    if (p.y >= mouth.max.y + 0.10 * inch && side < 0.13) return 'Nose';
    if (p.y >= eyes.min.y - 0.08 * inch && p.x >= eyes.min.x - 0.1 * inch && p.x <= eyes.max.x + 0.1 * inch)
      return 'Orbit';
    return p.y >= mouth.min.y + 0.06 * inch ? 'Cheek' : 'Jaw';
  }
  return { classify, shell, head };
}

function dimensionsIn(box) {
  const size = box.getSize(new Vector3()).divideScalar(inch);
  return { width: round(size.x), height: round(size.y), depth: round(size.z) };
}

async function landmarkDepths(model, scope, skull, muscle) {
  if (!model.headFrame) return undefined;
  const { faceLandmarks } = await import('../docs/characters/source-face-landmarks.js');
  const at = faceLandmarks[model.name], frame = model.headFrame;
  const inchesPerUnit = new Vector3().setFromMatrixScale(frame).x / inch;
  const toHead = frame.clone().invert();
  const axis = (coordinate, sense) => {
    const p = new Vector3(), out = new Vector3();
    const cranium = skull.find((part) => part.scanNode === 'SKULL_CRANIAL_MAXILLA');
    const xyz = cranium.mesh.geometry.attributes.position;
    let extreme = -Infinity;
    for (let i = 0; i < xyz.count; i++) {
      p.fromBufferAttribute(xyz, i).applyMatrix4(toHead);
      if (p[coordinate] * sense <= extreme) continue;
      extreme = p[coordinate] * sense;
      out.copy(p);
    }
    return out.toArray();
  };
  const surface = tree(scope.skin.filter((p) => coreFace.test(p.name)));
  const cheeks = tree(muscle.filter((p) => /Masseter|Buccinator/i.test(p.name))) ?? false;
  const earSurface = tree(scope.skin.filter((p) => / ear$/i.test(p.name)));
  const front = [0, 0, 1];
  const ray = new Ray(), origin = new Vector3();
  const sample = (label, landmark, mark, direction, targetIn, targetSurface = surface, nearest = null) => {
    origin.fromArray(mark).applyMatrix4(frame);
    ray.direction.fromArray(direction).transformDirection(frame);
    const earRoot = targetSurface && targetSurface === earSurface;
    ray.origin.copy(origin);
    if (!earRoot) {
      // Trace inward to see the outer surface even over exposed bone.
      ray.origin.addScaledVector(ray.direction, 3.5 * inch);
      ray.direction.negate();
    }
    const contact = targetSurface?.raycastFirst(ray, DoubleSide, 0, (earRoot ? 2 : 4.5) * inch);
    const surfaceDepth = contact ? round(earRoot ? contact.distance / inch : 3.5 - contact.distance / inch) : null;
    const muscleDistance = nearest !== null;
    return {
      label, landmark, targetIn,
      originHeadIn: mark.map((value) => round(value * inchesPerUnit)),
      depthIn: muscleDistance ? (nearest && contact ? round(nearest.closestPointToPoint(contact.point, hit).distance / inch) : null)
        : surfaceDepth,
      method: muscleDistance ? 'nearest masseter or buccinator from skin contact' :
        earRoot ? 'first outward ear contact' : 'directional surface offset',
    };
  };
  function lipDepth(label, landmark, mark) {
    const geometry = scope.skin.find((p) => p.name === label)?.mesh.geometry;
    const xyz = geometry?.attributes.position;
    let depth = -Infinity;
    for (let i = 0; xyz && i < xyz.count; i++) {
      point.fromBufferAttribute(xyz, i).applyMatrix4(toHead);
      if (Math.abs(point.x - mark[0]) * inchesPerUnit <= 0.10)
        depth = Math.max(depth, (point.z - mark[2]) * inchesPerUnit);
    }
    return {
      label, landmark, targetIn: [0.45, 0.55],
      originHeadIn: mark.map((value) => round(value * inchesPerUnit)),
      depthIn: Number.isFinite(depth) ? round(depth) : null,
      method: 'forward projection from incisor plane to central lip crest',
    };
  }
  const samples = [
    sample('Crown', 'Superior cranium extremum', axis('y', 1), [0, 1, 0], [0.2, 0.3]),
    sample('Back of scalp', 'Posterior cranium extremum', axis('z', -1), [0, 0, -1], [0.2, 0.3]),
    sample('Forehead', 'Glabella', at.glabella, front, [0.2, 0.25]),
    sample('Nasion', 'Nasion', at.nasion, front, [0.25, 0.25]),
    sample('Chin', 'Pogonion', at.pogonion, front, [0.4, 0.45]),
    sample('Under-chin', 'Menton', at.menton, [0, -0.82, 0.57], [0.3, 0.3]),
    lipDepth('Upper lip', 'Upper incisor', at.upperIncisor),
    lipDepth('Lower lip', 'Lower incisor', at.incisor),
  ];
  for (const [side, sign, display] of [['L', 1, 'left'], ['R', -1, 'right']]) {
    const malar = at.malar[side], gonion = at.gonion[side];
    const midCheek = new Vector3(...malar).lerp(new Vector3(...gonion), 0.54).toArray();
    samples.push(
      sample('Brow ridge, ' + display, 'Superior orbital rim', at.orbit[side].superior, front, [0.2, 0.25]),
      sample('Cheekbone, ' + display, 'Malar point', malar, [0.67 * sign, 0, 0.74], [0.2, 0.3]),
      sample('Mid-cheek, ' + display, 'Probe between malar and gonion', midCheek, [0.65 * sign, 0, 0.76],
        [0.45, 0.6], surface, cheeks),
      sample('Jaw angle, ' + display, 'Gonion', gonion, [0.8 * sign, -0.1, 0.6], [0.4, 0.4]),
      sample('Ear, ' + display, 'External auditory meatus', at.meatus[side], [sign, 0, 0.12], [0.4, 0.8],
        earSurface),
    );
  }
  return samples;
}

async function measureFace(model) {
  const { signal } = new AbortController();
  const added = (await Promise.all([model.loadFaceAnatomy?.(signal), model.loadFaceFat?.(signal)]))
    .flatMap(parts => parts ?? []);
  const scope = faceStudyParts(model, added);
  const skull = scope.skull.map(posed), muscle = scope.muscle.map(posed);
  const craniumOrJaw = part => /^SKULL_/.test(part.scanNode ?? part.sourceNode);
  const muscleTree = tree(muscle), skullTree = tree(skull.filter(craniumOrJaw));
  const cervicalTree = tree(skull.filter(part => !craniumOrJaw(part)));
  const fatTree = tree(scope.fat.map(posed));
  const { classify, shell, head } = faceClassifier(model, scope.skin, skull);
  const regions = new Map(faceRegions.map((label) => [label, { label, samples: 0,
    muscle: { weighted: 0, maximum: 0, area: 0 }, support: { weighted: 0, maximum: 0, area: 0 },
    bone: { weighted: 0, maximum: 0, area: 0 },
  }]));
  const parts = scope.skin.map(({ id, name, mesh }) => {
    const g = mesh.geometry, positions = g.attributes.position;
    const map = Buffer.alloc(positions.count);
    const weights = areaWeights(g);
    for (let i = 0; i < positions.count; i++) {
      if (!weights[i]) continue;
      const label = classify(point.fromBufferAttribute(positions, i), name);
      if (!label) continue;
      const nearestMuscle = muscleTree.closestPointToPoint(point, hit).distance / inch;
      const nearestBone = skullTree.closestPointToPoint(point, hit).distance / inch;
      let nearestSupport = Math.min(nearestMuscle, nearestBone);
      for (const additionalSupport of [cervicalTree, fatTree]) {
        const contact = additionalSupport?.closestPointToPoint(point, hit, 0, nearestSupport * inch);
        if (contact) nearestSupport = Math.min(nearestSupport, contact.distance / inch);
      }
      const region = regions.get(label);
      region.samples++;
      for (const [metric, distance] of [['muscle', nearestMuscle], ['support', nearestSupport], ['bone', nearestBone]]) {
        const stats = region[metric];
        stats.weighted += distance * weights[i];
        stats.maximum = Math.max(stats.maximum, distance);
        stats.area += weights[i];
      }
      // Zero marks vertices outside the sampled face and upper neck.
      map[i] = 1 + Math.round(254 * Math.min(1, nearestMuscle / fitLimitIn));
    }
    return { id, vertices: positions.count, fingerprint: fitFingerprint(g), bytes: map.toString('base64') };
  });
  const groups = Array.from(regions.values());
  if (groups.some((region) => !region.samples)) throw new Error('Missing a face region on ' + model.name);
  return {
    focus: faceStudyFocus(scope.skull),
    facialFatPads: scope.fat.length,
    samples: groups.reduce((sum, region) => sum + region.samples, 0),
    headDimensionsIn: { skin: dimensionsIn(shell), skull: dimensionsIn(head) },
    muscle: all(groups, 'muscle'), support: all(groups, 'support'), bone: all(groups, 'bone'),
    landmarks: await landmarkDepths(model, scope, skull, muscle),
    regions: groups.map(({ label, samples, muscle, support, bone }) =>
      ({ label, samples, muscle: report(muscle), support: report(support), bone: report(bone) })),
    parts,
  };
}

await mkdir(output, { recursive: true });
for (const name of selected ? [selected] : ['sippy', 'roma']) {
  for (const tier of quality ? [quality] : ['mobile', 'high']) {
    const model = await buildDiagramModel(name, tier);
    try {
      const file = `skin-wrap-gap-${name}-${tier}.json`;
      if (faceOnly) {
        const data = JSON.parse(await readFile(resolve(checkout, 'docs/characters/assets', file), 'utf8'));
        data.face = await measureFace(model);
        await writeFile(resolve(output, file), JSON.stringify(data) + '\n');
        console.log(JSON.stringify({ name, tier, ...data.face, parts: undefined }));
        continue;
      }
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
      await writeFile(resolve(output, file), JSON.stringify(data) + '\n');
      console.log(JSON.stringify({ ...data, parts: undefined }));
    } finally {
      model.dispose();
    }
  }
}
