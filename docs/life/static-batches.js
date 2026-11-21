import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merge only rigid, opaque leaf meshes. The caller supplies any articulated or
// independently toggled subtrees. Their animation stays in its authored frame.
export function batchStaticMeshes(root, { exclude = new Set(), worldSpaceMaterials = new Set() } = {}) {
  const bins = new Map();
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const rootParity = Math.sign(inverse.determinant());
  function collect(node) {
    if (exclude.has(node) || !node.visible || node.isLOD || node.isBone || (node.isGroup && node.renderOrder))
      return;
    if (node.children.length) {
      for (const child of node.children) collect(child);
      return;
    }
    if (!node.isMesh || !node.layers.mask || node.isInstancedMesh || node.isSkinnedMesh || node.isBatchedMesh)
      return;
    const material = node.material,
      geometry = node.geometry;
    if (
      Array.isArray(material) ||
      !material.visible ||
      material.transparent ||
      material.transmission ||
      material.isShaderMaterial ||
      node.morphTargetInfluences ||
      node.customDepthMaterial ||
      node.customDistanceMaterial ||
      node.onBeforeRender !== T.Object3D.prototype.onBeforeRender ||
      node.onAfterRender !== T.Object3D.prototype.onAfterRender ||
      node.onBeforeShadow !== T.Object3D.prototype.onBeforeShadow ||
      node.onAfterShadow !== T.Object3D.prototype.onAfterShadow ||
      (material.onBeforeCompile !== T.Material.prototype.onBeforeCompile &&
        !worldSpaceMaterials.has(material))
    )
      return;
    if (
      !geometry?.attributes.position ||
      geometry.isInstancedBufferGeometry ||
      Number.isFinite(geometry.drawRange.count) ||
      geometry.drawRange.start ||
      node.matrixWorld.determinant() * rootParity <= 0
    )
      return;
    const signature = [];
    for (const name of Object.keys(geometry.attributes).sort()) {
      const attribute = geometry.attributes[name];
      if (
        attribute.isInterleavedBufferAttribute ||
        attribute.isInstancedBufferAttribute ||
        attribute.usage !== T.StaticDrawUsage
      )
        return;
      signature.push(name, attribute.array.constructor.name, attribute.itemSize, attribute.normalized);
    }
    const key = [
      material.id,
      node.castShadow,
      node.receiveShadow,
      node.renderOrder,
      node.layers.mask,
      node.frustumCulled,
      ...signature,
    ].join('/');
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(node);
  }
  for (const child of root.children) collect(child);

  const ranges = new Map(),
    batches = [];
  const matrix = new T.Matrix4();
  for (const meshes of bins.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const g = mesh.geometry.clone();
      if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
      return g.applyMatrix4(matrix.multiplyMatrices(inverse, mesh.matrixWorld));
    });
    const geometry = mergeGeometries(parts);
    const source = meshes[0],
      batch = new T.Mesh(geometry, source.material);
    batch.name = `${root.name || 'Set'} · ${source.material.name || 'rigid surfaces'}`;
    batch.castShadow = source.castShadow;
    batch.receiveShadow = source.receiveShadow;
    batch.renderOrder = source.renderOrder;
    batch.layers.mask = source.layers.mask;
    batch.frustumCulled = source.frustumCulled;
    batches.push(batch);
    let start = 0;
    for (const mesh of meshes) {
      const count = mesh.geometry.attributes.position.count;
      ranges.set(mesh, { mesh: batch, start, count });
      start += count;
    }
  }
  if (ranges.size) {
    // Scale references can describe individual buffer ranges or several solids
    // beneath a measuring frame. Always redirect them to the vertices that draw.
    let scene = root;
    while (scene.parent) scene = scene.parent;
    scene.traverse((node) => {
      if (!node.userData.scaleRef) return;
      let parts = node.userData.scaleParts;
      if (!parts) {
        parts = [];
        node.traverse((child) => {
          if (child.isMesh) parts.push({ mesh: child });
        });
      }
      if (!parts.some((part) => ranges.has(part.mesh))) return;
      node.userData.scaleParts = parts.map((part) => {
        const range = ranges.get(part.mesh);
        if (!range) return part;
        const offset = part.start ?? 0;
        return { mesh: range.mesh, start: range.start + offset, count: part.count ?? range.count - offset };
      });
    });
    for (const mesh of ranges.keys()) {
      if (mesh.userData.scaleRef)
        mesh.visible = false; // Keep the measuring frame and its orientation.
      else mesh.removeFromParent();
    }
    root.add(...batches);
  }
  return { meshesBefore: ranges.size, meshesAfter: batches.length };
}
