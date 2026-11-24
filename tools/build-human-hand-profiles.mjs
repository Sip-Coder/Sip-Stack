// Read the shipped anatomy in the same neutral wrists as Axon View and write
// a compact palmar cross-section and five independent phalanx profiles.
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const root = resolve(process.env.THREE_ROOT);
  registerHooks({ resolve(specifier, context, next) {
    const entry = specifier === 'three' ? 'build/three.module.js'
      : specifier.startsWith('three/addons/') ? 'examples/jsm/' + specifier.slice(13) : null;
    return entry ? { url: pathToFileURL(resolve(root, entry)).href, shortCircuit: true } : next(specifier, context);
  } });
}
const { Vector3, Matrix4 } = await import('three');
const { createActor } = await import('../docs/characters/rig.js');
const { prepareSourceAnatomy } = await import('../docs/characters/diagram-source-anatomy.js');
const fetchSource = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  options?.signal?.throwIfAborted();
  if (String(input).startsWith('file:')) return new Response(await readFile(new URL(input)));
  return fetchSource(input, options);
};
const up = new Vector3(0, 1, 0);
const sides = 12;
const angles = Array.from({ length: sides }, (_, i) => Math.PI * 2 * i / sides);
const quantize = values => values.map(x => Math.round(x * 10000));

function wristSpace(part, inverse) {
  const g = part.mesh.geometry;
  const matrix = new Matrix4().multiplyMatrices(inverse, part.sourceMatrix);
  const points = Array.from({ length: g.attributes.position.count }, (_, i) =>
    new Vector3().fromBufferAttribute(g.attributes.position, i).applyMatrix4(matrix));
  return { name: part.scanNode ?? part.muscleNode, layer: part.layer, points, index: g.index.array };
}

function section(parts, axis, height) {
  const cut = [];
  for (const { points, index } of parts) {
    const distance = points.map(p => p.dot(axis) - height);
    for (let j = 0; j < index.length; j += 3) {
      for (let k = 0; k < 3; k++) {
        const a = index[j + k], b = index[j + (k + 1) % 3];
        if ((distance[a] < 0) === (distance[b] < 0)) continue;
        cut.push(points[a].clone().lerp(points[b], distance[a] / (distance[a] - distance[b])));
      }
    }
  }
  return cut;
}

function extent(points, axis) {
  return points.reduce(([lower, upper], point) => {
    const value = point.dot(axis);
    return [Math.min(lower, value), Math.max(upper, value)];
  }, [Infinity, -Infinity]);
}

function palmProfile(parts, floor) {
  const radial = angles.map(a => new Vector3(Math.sin(a), 0, Math.cos(a)));
  const stations = [floor,-0.037,-0.031,-0.024,-0.017,-0.010,-0.004,0.002,0.008];
  return stations.map(y => {
    // Carry the last palmar section across the metacarpal-head rim. At the
    // distal edge the only sections below it are individual digit paths.
    const cut = section(parts, up, Math.max(y, floor + 0.0035));
    const [left, right] = extent(cut, radial[3]);
    const [back, front] = extent(cut, radial[0]);
    const center = new Vector3((left + right) / 2, y, (front + back) / 2);
    const support = radial.map(axis => extent(cut, axis)[1] - center.dot(axis) + 0.0015);
    const radius = radial.map(axis => Math.min(...radial.map((n, i) => {
      const t = axis.dot(n);
      return t < 1e-6 ? Infinity : support[i] / t;
    })));
    return quantize([y, center.x, center.z, ...radius]);
  });
}

function digitProfile(parts, softTissue, side, i) {
  const forward = new Vector3(0, 0, 1);
  // The fixed curled acquisitions turn into the palm. Slice obliquely so
  // each phalanx continues into the next even where an upright plane doubles back.
  const axis = new Vector3(side === 'L' ? -0.83 : 1.22, -1, 0).normalize();
  const depth = forward.clone().cross(axis).normalize();
  const [start, end] = extent(parts.flatMap(part => part.points), axis);
  return [0.014, 0.10, 0.21, 0.35, 0.50, 0.66, 0.81, 0.92, 0.987].map((t, station) => {
    const level = start + (end - start) * t;
    const points = section(parts, axis, level);
    let [near, far] = extent(points, depth);
    const [left, right] = extent(points, forward);
    // Catch tendon sections that still follow this donor digit. The atlas
    // also has tendon strips displaced from the phalanges in this scan pose.
    const initialNear = near, initialFar = far;
    for (const point of section(softTissue, axis, level)) {
      const z = point.z, d = point.dot(depth);
      if (z < left || z > right || d < initialNear - 0.0018 || d > initialFar + 0.0018) continue;
      near = Math.min(near, d);
      far = Math.max(far, d);
    }
    const center = axis.clone().multiplyScalar(level).addScaledVector(depth, (near + far) / 2)
      .addScaledVector(forward, (left + right) / 2);
    const thickness = Math.max(0.0012, (far - near) * 0.5 + 0.00155);
    const width = Math.max(0.0010, (right - left) * 0.5 + 0.00095);
    if (!Number.isFinite(center.x + center.y + center.z + thickness + width))
      throw Error('Missing donor hand surface at ' + side + '/' + i + '/' + station);
    return quantize([...center.toArray(), thickness, width]);
  });
}

const profiles = {};
for (const hero of ['sippy', 'roma']) {
  const rig = createActor(hero, 1), parts = [];
  for (const tier of ['high', 'mobile']) {
    const load = await prepareSourceAnatomy(hero, tier, undefined, { repairs: false });
    load(rig, parts);
  }
  profiles[hero] = {};
  for (const side of ['L', 'R']) {
    const wrist = 'hand' + side;
    const inverse = rig[wrist].matrixWorld.clone().invert();
    const names = side === 'L' ? 'LEFT' : 'RIGHT';
    const selected = parts.filter(p => p.joint === wrist ||
      (p.joint === 'forearm' + side && /^(RADIUS|ULNA)_/.test(p.scanNode ?? '')))
      .map(p => wristSpace(p, inverse));
    const palmBones = selected.filter(p => p.layer === 'skeleton' &&
      !/^(PHALANGE_HAND|METACARPAL_1_)/.test(p.name));
    const palmParts = selected.filter(p => !/^PHALANGE_HAND/.test(p.name) &&
      !/^METACARPAL_1_/.test(p.name));
    const softTissue = selected.filter(p => p.layer === 'muscles');
    const digits = Array.from({ length: 5 }, (_, k) => {
      const i = k + 1;
      return digitProfile(selected.filter(p => p.name === 'PHALANGE_HAND_' + i + '_' + names ||
        (i === 1 && p.name === 'METACARPAL_1_' + names)), softTissue, side, i);
    });
    // Follow the cascade of the real metacarpal heads across the palm. The
    // palm ends over the metacarpal heads, leaving the digit joints separate.
    const knuckles = [5, 4, 3, 2].map(i => {
      const group = palmBones.filter(p => p.name === 'METACARPAL_' + i + '_' + names);
      const [lowest] = extent(group.flatMap(p => p.points), up);
      const cut = section(group, up, lowest + 0.003);
      const [back, front] = extent(cut, new Vector3(0, 0, 1));
      return quantize([(back + front) / 2, lowest - 0.0010]);
    });
    const floor = Math.min(...knuckles.map(p => p[1])) / 10000;
    profiles[hero][side] = { palm: palmProfile(palmParts, floor), knuckles, digits };
  }
}
for (const [hero, hands] of Object.entries(profiles)) {
  const source = '// Generated by tools/build-human-hand-profiles.mjs from the shipped wrist-space anatomy.\n'
    + '// Values are in 1/10000 of standing height.\nexport const handProfiles = '
    + JSON.stringify(hands) + ';\n';
  await writeFile(new URL('../docs/characters/' + hero + '-hand-data.js', import.meta.url), source);
}
