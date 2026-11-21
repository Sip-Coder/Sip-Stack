// Each rendered triangle must fit in a single measured solid. The three
// corners suffice because an ellipsoid is convex. This includes both plies,
// the rim stitching face ring, and whichever index buffer the active LOD uses.
export function checkBandCoverage(T, mesh, colliders) {
  const sectors = colliders.filter((spec) => spec.role === 'band');
  const { geometry } = mesh;
  const positions = geometry.getAttribute('position');
  const count = geometry.index?.count ?? positions.count;
  const vertex = new T.Vector3();
  const rows = sectors.map(({ node, center, radii }) => {
    if (!radii || !center) throw Error('A headband sector must expose its fitted ellipsoid');
    const transform = new T.Matrix4().copy(node.matrixWorld).invert().multiply(mesh.matrixWorld);
    const origin = new T.Vector3(...center), scale = new T.Vector3(...radii);
    const radiiAtVertices = new Float64Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      mesh.getVertexPosition(i, vertex).applyMatrix4(transform).sub(origin).divide(scale);
      radiiAtVertices[i] = vertex.length();
    }
    return radiiAtVertices;
  });
  let maxTriangleRadius = 0;
  for (let i = 0; i < count; i += 3) {
    const a = geometry.index ? geometry.index.getX(i) : i;
    const b = geometry.index ? geometry.index.getX(i + 1) : i + 1;
    const c = geometry.index ? geometry.index.getX(i + 2) : i + 2;
    let radius = Infinity;
    for (const row of rows) radius = Math.min(radius, Math.max(row[a], row[b], row[c]));
    maxTriangleRadius = Math.max(maxTriangleRadius, radius);
  }
  return { sectors: sectors.length, vertices: positions.count, triangles: count / 3, maxTriangleRadius };
}
