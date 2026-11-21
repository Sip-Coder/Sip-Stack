export function setModelDetail(root, tier) {
  const high = tier === 'high';
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (node.userData.highDetail) node.visible = high;
    if (node.userData.mobileGeometry) {
      node.userData.highGeometry ??= node.geometry;
      node.geometry = high ? node.userData.highGeometry : node.userData.mobileGeometry;
      if (!node.isSkinnedMesh && !node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
    }
    if (Array.isArray(node.material)) {
      for (const mat of node.material) mat.userData.surfaceDetail?.setTier(high);
    } else {
      node.material.userData.surfaceDetail?.setTier(high);
    }
  });
}
