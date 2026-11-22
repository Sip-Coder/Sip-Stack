import { createActor } from './rig.js';
import { createController, FIXED_DT } from './motion.js';
import { setModelDetail } from './model-tier.js';
import { heights, names } from './ui.js';
import { freezeSurface, components, joinPart, snapshotResources } from './diagram-snapshot.js';
import { describeRoma, sippyCatalog } from './diagram-outer-parts.js';

const builders = {
  sippy: () => import('./sippy.js').then((m) => m.buildSippy),
  roma: () => import('./roma.js').then((m) => m.buildRoma),
  hummin: () => import('./hummin.js').then((m) => m.buildHummin),
};

async function prepareInterior(name, tier, signal, options) {
  if (name === 'hummin') {
    const { addRobotInterior } = await import('./diagram-robot.js');
    return (rig, parts) => addRobotInterior(rig, tier, parts);
  }
  const { prepareSourceAnatomy } = await import('./diagram-source-anatomy.js');
  signal?.throwIfAborted();
  return prepareSourceAnatomy(name, tier, signal, options);
}

export async function buildDiagramModel(name, tier, signal, onPartial) {
  if (!names.includes(name) || !['mobile', 'high'].includes(tier))
    throw new Error('Unknown character or geometry tier');
  const rig = createActor(name, heights[names.indexOf(name)]);
  const staged = name === 'roma' && !!onPartial;
  try {
    // Build the authored exterior while the same hero's native anatomy loads.
    const [interior] = await Promise.all([
      prepareInterior(name, tier, signal, { upperOnly: staged }),
      builders[name]().then((build) => {
        signal?.throwIfAborted();
        const pose = build(rig), ctrl = createController(rig);
        setModelDetail(rig.root, tier);
        const neutral = { x: 0, z: 0, run: false, roll: false, jump: false, emote: false };
        for (let i = 0; i < 12; i++) {
          pose(ctrl.step(FIXED_DT, neutral));
          ctrl.finishPose();
        }
      }),
    ]);
    signal?.throwIfAborted();
    const model = await snapshotDiagramModel(rig, tier, undefined, interior);
    if (!staged) return model;

    // The original Andreassen surfaces are much larger than the other packs.
    // First show the actual loaded layers, then add every full lower-limb mesh.
    await onPartial({ ...model, parts: model.parts.slice(), partial: true });
    signal?.throwIfAborted();
    const { prepareFemaleLowerLimbs } = await import('./diagram-source-anatomy.js');
    const addLowerLimbs = await prepareFemaleLowerLimbs(signal);
    signal?.throwIfAborted();
    const start = model.parts.length;
    addLowerLimbs(rig, model.parts);
    registerParts(model.parts.slice(start));
    return model;
  } finally {
    // This construction rig is never drawn and its builder's shared resources
    // can also belong to the simulator. The snapshot owns the draw resources.
    rig.root.clear();
  }
}

function registerParts(parts) {
  for (const part of parts)
    part.id = part.layer + '/' + (part.sourceFile ? part.sourceFile + '/' + part.sourceNode : part.name);
}

// Inspection and pose verification freeze exactly the same deformed triangles.
export async function snapshotDiagramModel(rig, tier, inspect, interior) {
  const name = rig.name, resources = snapshotResources(), parts = [];
  try {
    rig.root.updateMatrixWorld(true);
    const describe =
      name === 'sippy'
        ? sippyCatalog(rig)
        : name === 'roma'
          ? describeRoma
          : (await import('./diagram-hummin.js')).describeHummin;
    const byName = new Map();
    rig.root.traverse((mesh) => {
      if (!mesh.isMesh || (!mesh.visible && !mesh.userData.studyOnly)) return;
      for (let parent = mesh.parent; parent; parent = parent.parent) if (!parent.visible) return;
      const snapshot = freezeSurface(mesh);
      for (const component of components(mesh, name !== 'sippy', snapshot)) {
        const { name: partName, layer } = describe(rig, mesh, component);
        const key = layer + '/' + partName;
        if (!byName.has(key)) byName.set(key, { name: partName, layer, patches: [] });
        byName.get(key).patches.push({ ...component, mesh, snapshot });
      }
    });
    for (const { name, layer, patches } of byName.values()) {
      const mesh = joinPart(patches, resources);
      mesh.name = name;
      parts.push({ name, layer, mesh, source: 'Live character geometry' });
    }
    const addInnerLayers = interior ?? await prepareInterior(name, tier);
    const landmarks = addInnerLayers(rig, parts);
    inspect?.(landmarks);
    registerParts(parts);
    let disposed = false;
    return {
      name,
      parts,
      fitPath: name === 'hummin' ? 'procedural' : 'source geometry',
      dispose() {
        if (disposed) return;
        disposed = true;
        resources.dispose(parts);
      },
    };
  } catch (error) {
    resources.dispose(parts);
    throw error;
  }
}
