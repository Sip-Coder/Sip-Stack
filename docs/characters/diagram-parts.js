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

export async function buildDiagramModel(name, tier) {
  if (!names.includes(name) || !['mobile', 'high'].includes(tier))
    throw new Error('Unknown character or geometry tier');
  const build = await builders[name](),
    rig = createActor(name, heights[names.indexOf(name)]);
  const resources = snapshotResources(),
    parts = [];
  try {
    const pose = build(rig),
      ctrl = createController(rig);
    setModelDetail(rig.root, tier);
    const neutral = { x: 0, z: 0, run: false, roll: false, jump: false, emote: false };
    // A fixed neutral frame puts the soles down and leaves the eyes open. Stay
    // ahead of the final render batcher to keep the original pattern pieces.
    for (let i = 0; i < 12; i++) {
      pose(ctrl.step(FIXED_DT, neutral));
      ctrl.finishPose();
    }
    rig.root.updateMatrixWorld(true);
    const describe =
      name === 'sippy'
        ? sippyCatalog(rig)
        : name === 'roma'
          ? describeRoma
          : (await import('./diagram-hummin.js')).describeHummin;
    const byName = new Map();
    rig.root.traverseVisible((mesh) => {
      if (!mesh.isMesh) return;
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
    const { addInnerLayers } = await import('./diagram-anatomy.js');
    await addInnerLayers(rig, name, tier, parts);
    for (const part of parts) part.id = part.layer + '/' + part.name;
    let disposed = false;
    return {
      parts,
      dispose() {
        if (disposed) return;
        disposed = true;
        resources.dispose(parts);
      },
    };
  } catch (error) {
    resources.dispose(parts);
    throw error;
  } finally {
    // This construction rig is never drawn: it owns no GPU allocations. Some
    // unrendered geometries/textures are cached by the live builders (Roma in
    // particular), so leave those shared assets in the production cache.
    rig.root.clear();
  }
}
