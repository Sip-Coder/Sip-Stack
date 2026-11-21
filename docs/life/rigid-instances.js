import * as T from 'three';

// Repeated moving parts keep their authored hierarchy (including oarlocks and
// wing wrists). Only geometry with identical material and render state shares
// a draw. A source may change owner, e.g. a quay case loaded onto a boat.
export function instanceRigidParts(parent, roots) {
  const bins = new Map(), sources = new Set();
  parent.updateWorldMatrix(true, true);
  const handedness = Math.sign(parent.matrixWorld.determinant());
  for (const root of roots) root.traverse(part => {
    if (sources.has(part) || !part.isMesh || part.isInstancedMesh || part.isSkinnedMesh || part.isBatchedMesh ||
        !part.layers.mask || part.morphTargetInfluences || part.geometry.isInstancedBufferGeometry ||
        Array.isArray(part.material) || part.material.transparent || part.material.transmission ||
        part.onBeforeRender !== T.Object3D.prototype.onBeforeRender ||
        part.onAfterRender !== T.Object3D.prototype.onAfterRender ||
        part.matrixWorld.determinant() * handedness <= 0) return;
    sources.add(part);
    const key = [part.geometry.id, part.material.id, part.layers.mask, part.renderOrder,
      +part.castShadow, +part.receiveShadow, part.customDepthMaterial?.id, part.customDistanceMaterial?.id].join('/');
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(part);
  });
  const batches = [], measured = new Set(), bindings = new Map();
  for (const parts of bins.values()) {
    if (parts.length < 2) continue;
    const first = parts[0], mesh = new T.InstancedMesh(first.geometry, first.material, parts.length);
    mesh.name = 'Instances · ' + (first.name || first.geometry.type);
    mesh.layers.mask = first.layers.mask;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.customDepthMaterial = first.customDepthMaterial;
    mesh.customDistanceMaterial = first.customDistanceMaterial;
    mesh.renderOrder = first.renderOrder;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // Moving owners need no per-frame bounding sphere rebuild.
    mesh.frustumCulled = false;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      part.layers.disableAll();
      bindings.set(part, {mesh, index});
      for (let p=part; p && p!==parent; p=p.parent)
        if (p.userData.scaleRef) measured.add(p);
    }
    parent.add(mesh);
    batches.push({mesh, parts});
  }
  const inverse = new T.Matrix4(), relative = new T.Matrix4(), hidden = new T.Matrix4().makeScale(0,0,0);
  function update(measure) {
    parent.updateWorldMatrix(true, false);
    inverse.copy(parent.matrixWorld).invert();
    for (const {mesh, parts} of batches) {
      let last = -1;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        let visible = true, measuring = false;
        let owner = part;
        while (owner && owner !== parent) {
          if (!owner.visible) visible = false;
          if (owner === measure) measuring = true;
          owner = owner.parent;
        }
        if (owner && (visible || measuring)) {
          part.updateWorldMatrix(true, false);
          mesh.setMatrixAt(i, relative.multiplyMatrices(inverse, part.matrixWorld));
          last = i;
        } else mesh.setMatrixAt(i, hidden);
      }
      mesh.count = last + 1;
      mesh.visible = last >= 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  for (const object of measured) {
    const parts = [];
    object.traverse(p => { if (p.isMesh) parts.push(bindings.get(p) || {mesh:p}); });
    object.userData.scaleParts = parts;
    // The dimension tool opens folded wings / reveals hidden LOD parts for a
    // neutral measurement. Flush that pose into the same uploaded instances.
    object.userData.syncScaleInstances = update;
  }
  update();
  return update;
}
