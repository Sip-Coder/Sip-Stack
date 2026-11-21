// Fit thin solids around both walls of the woven band. Adjacent longitudinal
// cuts share vertices. Convexity then encloses each triangle between them.
import * as T from 'three';

export function fitBandSectors(mesh, groomProfiles) {
  const { position, uv } = mesh.geometry.attributes;
  const count = groomProfiles.length * 2;
  const sectors = [];
  const a = new T.Vector3(), b = new T.Vector3();
  for (let index = 0; index < count; index++) {
    const start = index / count, end = (index + 1) / count;
    const left = new T.Box3(), right = new T.Box3(), front = new T.Box3(), back = new T.Box3();
    const samples = [];
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (u < start - 1e-5 || u > end + 1e-5) continue;
      const point = new T.Vector3().fromBufferAttribute(position, i);
      samples.push(point);
      if (Math.abs(u - start) < 1e-5) left.expandByPoint(point);
      if (Math.abs(u - end) < 1e-5) right.expandByPoint(point);
      if (v < 0.01) back.expandByPoint(point);
      if (v > 0.99) front.expandByPoint(point);
    }
    const along = right.getCenter(a).sub(left.getCenter(b)).normalize().clone();
    const across = front.getCenter(a).sub(back.getCenter(b)).normalize().clone();
    const normal = new T.Vector3().crossVectors(along, across).normalize();
    across.crossVectors(normal, along).normalize();
    const basis = new T.Matrix4().makeBasis(along, across, normal);
    const inverse = basis.clone().transpose(), box = new T.Box3();
    for (const p of samples) box.expandByPoint(p.applyMatrix4(inverse));
    const center = box.getCenter(new T.Vector3()), radii = box.getSize(new T.Vector3()).multiplyScalar(0.5);
    radii.z = Math.max(0.00075, radii.z);
    radii.addScalar(0.0001);
    let enclosing = 1;
    for (const p of samples) enclosing = Math.max(enclosing, a.copy(p).sub(center).divide(radii).length());
    radii.multiplyScalar(enclosing);
    const node = new T.Group();
    node.name = 'Roma headband sector ' + (index + 1);
    node.position.copy(center).applyMatrix4(basis);
    node.quaternion.setFromRotationMatrix(basis);
    mesh.add(node);
    // One broad fitted section keeps the clumps combed over each pair of
    // patches. The material triangles meet the much thinner measured fabric.
    sectors.push({
      role: 'band', node, center: [0, 0, 0], radii: radii.toArray(), protectsFaces: true,
      fabric: true, groomProfile: index % 2 === 0 ? groomProfiles[index / 2] : null,
    });
  }
  return sectors;
}
