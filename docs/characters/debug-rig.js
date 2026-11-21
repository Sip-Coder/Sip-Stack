import * as T from 'three';

export function debugRig(scene, rig, controller) {
  const links = [
    ['hips', 'chest'],
    ['chest', 'head'],
  ];
  for (const side of ['L', 'R']) {
    for (const [a, b] of [
      ['chest', 'upperArm'],
      ['upperArm', 'forearm'],
      ['forearm', 'hand'],
      ['hips', 'thigh'],
      ['thigh', 'shin'],
      ['shin', 'foot'],
    ]) {
      links.push([a === 'chest' || a === 'hips' ? a : a + side, b + side]);
    }
  }
  const points = new Float32Array((links.length + 1) * 6),
    geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(points, 3).setUsage(T.DynamicDrawUsage));
  const graph = new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0x42ffe7, depthTest: false }));
  graph.renderOrder = 8;
  graph.frustumCulled = false;
  scene.add(graph);
  const capsule = new T.Mesh(
    new T.CapsuleGeometry(controller.capsuleRadius, rig.height - 2 * controller.capsuleRadius, 3, 10),
    new T.MeshBasicMaterial({
      color: 0xf3a13a,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  scene.add(capsule);
  const feet = controller.contacts.map(() => {
    const m = new T.Mesh(
      new T.SphereGeometry(0.035, 10, 8),
      new T.MeshBasicMaterial({ color: 0xff713a, depthTest: false }),
    );
    m.renderOrder = 9;
    scene.add(m);
    return m;
  });
  const point = new T.Vector3();
  return () => {
    graph.visible = capsule.visible = rig.root.visible;
    let i = 0;
    for (const link of links)
      for (const name of link) {
        point.setFromMatrixPosition(rig[name].matrixWorld);
        point.toArray(points, i);
        i += 3;
      }
    point.copy(rig.root.position);
    point.y += 0.16;
    point.toArray(points, i);
    point.addScaledVector(controller.velocity, 0.32).toArray(points, i + 3);
    geo.attributes.position.needsUpdate = true;
    capsule.position.copy(rig.root.position);
    capsule.position.y += rig.height / 2;
    for (let j = 0; j < feet.length; j++) {
      feet[j].visible = rig.root.visible && controller.contacts[j].planted;
      feet[j].position.copy(controller.contacts[j].support);
    }
  };
}
