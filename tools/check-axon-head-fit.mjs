// Run with THREE_ROOT pointing to the unpacked three@0.170.0 package, e.g.
// THREE_ROOT=/path/to/three node tools/check-axon-head-fit.mjs [sippy|roma] [mobile|high]
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT) {
  const directory = resolve(process.env.THREE_ROOT);
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  if (manifest.version !== '0.170.0') throw Error('Expected three@0.170.0');
  registerHooks({
    resolve(specifier, context, next) {
      const entry =
        specifier === 'three'
          ? 'build/three.module.js'
          : specifier.startsWith('three/addons/')
            ? 'examples/jsm/' + specifier.slice(13)
            : null;
      return entry
        ? { url: pathToFileURL(resolve(directory, entry)).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const T = await import('three');
if (T.REVISION !== '170') throw Error('Expected three@0.170.0');
const { createActor } = await import('../docs/characters/rig.js');
const { createController, FIXED_DT } = await import('../docs/characters/motion.js');
const { snapshotDiagramModel } = await import('../docs/characters/diagram-fit-model.js');
const { setModelDetail } = await import('../docs/characters/model-tier.js');
const { names, heights } = await import('../docs/characters/ui.js');
const { posedSurface, compareSurfaces } = await import('./characters-surfaces.mjs');
const bones = /^(Cranium and maxilla|Mandible)$/;
const muscles =
  /^(left|right)_(?:(?:inferior|superior)_(?:rectus|oblique)|(?:lateral|medial)_rectus|levator_palpebrae_superioris)$/i;
const key = (part) => part.muscleNode ?? part.atlasNode ?? part.name;
const eyes = /cornea|sclera|pupil|iris|eyelid|eyelash/i;
const hair = /crest|sideburn|waves|forelock|fringe|tapered lock|quiff lock/i;

function checks(parts, axis) {
  const face = posedSurface(parts.find((p) => p.name === 'Face').mesh);
  const entries = parts
    .filter(
      (p) =>
        bones.test(p.name) ||
        muscles.test(key(p)) ||
        (p.layer === 'skin' && (eyes.test(p.name) || hair.test(p.name))),
    )
    .map((p) => ({ name: key(p), shape: posedSurface(p.mesh) }));
  const orbit = entries.filter((e) => eyes.test(e.name)),
    groom = entries.filter((e) => hair.test(e.name));
  const internal = entries.filter((e) => bones.test(e.name) || muscles.test(e.name));
  if (
    !orbit.length ||
    !groom.length ||
    internal.filter((e) => muscles.test(e.name)).length !== 14 ||
    internal.filter((e) => bones.test(e.name)).length !== 2
  )
    throw Error('Incomplete live facial inventory');
  const result = {
    insideVertices: 0,
    outsideVertices: 0,
    skinCrossings: 0,
    orbitalBoneCrossings: 0,
    eyeLidCrossings: 0,
    hairCrossings: 0,
  };
  const ray = new T.Ray(),
    hit = new T.Vector3();
  function hitsSkin(node) {
    if (!ray.intersectsBox(node.box)) return false;
    if (node.leaves)
      return node.leaves.some((t) => ray.intersectTriangle(t.v[0], t.v[1], t.v[2], false, hit));
    return hitsSkin(node.left) || hitsSkin(node.right);
  }
  function crossings(a, b) {
    const result = compareSurfaces(a, b);
    return result.crossings + result.coplanar;
  }
  for (const { name, shape } of internal) {
    result.skinCrossings += crossings(shape, face);
    for (const p of shape.points) {
      ray.origin.copy(p);
      ray.direction.copy(axis);
      const positive = hitsSkin(face.tree);
      ray.direction.negate();
      if (positive && hitsSkin(face.tree)) result.insideVertices++;
      else result.outsideVertices++;
    }
    if (muscles.test(name)) {
      const cranium = internal.find((e) => e.name === 'Cranium and maxilla');
      result.orbitalBoneCrossings += crossings(shape, cranium.shape);
    }
    for (const e of orbit) result.eyeLidCrossings += crossings(shape, e.shape);
    for (const e of groom) result.hairCrossings += crossings(shape, e.shape);
  }
  return result;
}

const args = process.argv.slice(2),
  heroes = args[0] ? [args[0]] : ['sippy', 'roma'],
  tiers = args[1] ? [args[1]] : ['mobile', 'high'];
if (heroes.some((n) => !['sippy', 'roma'].includes(n)) || tiers.some((n) => !['mobile', 'high'].includes(n)))
  throw Error('Expected [sippy|roma] [mobile|high]');
for (const hero of heroes) {
  const build = (await import(`../docs/characters/${hero}.js`))[
    hero === 'sippy' ? 'buildSippy' : 'buildRoma'
  ];
  for (const tier of tiers)
    for (const state of ['idle', 'blink', 'walk', 'run', 'roll', 'roll-tuck']) {
      const rig = createActor(hero, heights[names.indexOf(hero)]),
        pose = build(rig),
        control = createController(rig);
      setModelDetail(rig.root, tier);
      const input = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };
      const tick = () => {
        pose(control.step(FIXED_DT, input));
        control.finishPose();
      };
      for (let step = 0; step < 12; step++) tick();
      if (state === 'blink') {
        const peak = hero === 'sippy' ? 4.15 : 3.45;
        for (let step = 12; step < Math.round(peak / FIXED_DT); step++) tick();
      } else if (state !== 'idle') {
        input.run = state !== 'walk';
        input.z = -0.9;
        for (let step = 0; step < 45; step++) tick();
        if (state.startsWith('roll')) {
          input.roll = true;
          const frame = state === 'roll-tuck' ? 17 : 13;
          for (let step = 0; step < frame; step++) {
            tick();
            input.roll = false;
          }
        }
      }
      let transverse;
      const model = await snapshotDiagramModel(rig, tier, ({ head }) => {
        transverse = head
          .place(1, 0, 0)
          .sub(head.place(0, 0, 0))
          .normalize();
      });
      try {
        const result = checks(model.parts, transverse);
        console.log(JSON.stringify({ hero, tier, state, ...result }));
        if (
          result.outsideVertices ||
          result.orbitalBoneCrossings ||
          result.skinCrossings ||
          result.eyeLidCrossings ||
          result.hairCrossings
        )
          process.exitCode = 1;
      } finally {
        model.dispose();
      }
    }
}
