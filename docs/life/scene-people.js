import { warmGarmentMesh } from './cloth.js';
import { finishPeopleLoad } from './appearance.js';
import { warmShaders } from '../assets/sip-warm.js';

export function primePeople(scene, high) {
  let representative, hasGarment = false;
  scene.traverse((node) => {
    hasGarment ||= node.userData.hasPeopleGarment;
    if (!representative && node.userData.preparePeopleLOD) representative = node.userData.preparePeopleLOD;
  });
  if (hasGarment) scene.add(warmGarmentMesh());
  if (representative) {
    representative(1);
    if (high) representative(0);
  }
}

const started = new WeakSet();
export function finishPeople(renderer, scene, camera, target) {
  if (started.has(scene)) return;
  started.add(scene);
  finishPeopleLoad(scene).then(() => {
    if (renderer.getContext().isContextLost()) return;
    const jobs = [],
      variants = new Set();
    scene.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const key =
        mesh.material.customProgramCacheKey() + '/' + (mesh.geometry.morphAttributes.position?.length || 0);
      if (!variants.has(key)) {
        variants.add(key);
        jobs.push([mesh, camera, target, scene]);
      }
    });
    return warmShaders(renderer, jobs);
  });
}

// CPU pose and simulation buffers survive a WebGL context loss. Re-upload the
// new textures before the hidden canvas is allowed to draw the recovered pose.
export function restorePeople(scene) {
  scene.traverse((node) => {
    node.userData.restorePeopleCrowd?.();
    const nav = node.userData.peopleNav;
    if (!nav) return;
    for (const { actor } of nav.agents) {
      if (!actor?.rig) continue;
      actor.rig.restore();
      actor.dynamics.restore();
    }
  });
}
