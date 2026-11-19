import * as T from 'three';
import { worker } from './people.js';
import { flock } from './birds.js';
import { crate, basket, tastingGlass, floatHull } from './harbor.js';
import { insects } from './wildlife.js';
import { gathering } from './crowd.js';
import { smooth } from './forms.js';

const dock = [
  [6.5, 1.05, 0.9],
  [3.8, 1.05, 1],
  [3.8, 1, 6.3],
  [8.6, 1, 6.3],
];
function dockHeight(x, z) {
  return z > 1.5 ? 1 : 1.05;
}
function stairHeight(x, z) {
  for (let i = 0; i < 3; i++) {
    const depth = 0.1 - i * 3 - z;
    if (depth < 0) return 1.05 + i * 2;
    if (depth < 1.6) return 1 + i * 2 + 0.25 * (Math.floor(depth / 0.2) + 1);
  }
  return 7.05;
}
export function villageLife(scene, boats, swell) {
  const picker = worker(scene, 0, 0.61, 'Harvester'),
    docker = worker(scene, 1, 0.6, 'Porter'),
    host = worker(scene, 2, 0.61, 'Taster'),
    cellarman = worker(scene, 3, 0.6, 'Cellar worker'),
    walker = worker(scene, 4, 0.61, 'Stair walker'),
    rower = worker(boats[6].b, 5, 0.53, 'Oarsman');
  const guest = worker(scene, 6, 0.59, 'Cantina guest');
  guest.g.position.set(-7.76, 1.1, 0.14);
  guest.g.rotation.y = 1.02;
  const people = [picker, docker, host, cellarman, walker, rower, guest];
  const hamper = basket(picker.hands[0]),
    berry = new T.Group(),
    grapeMaterial = new T.MeshPhysicalMaterial({ color: '#67445d', roughness: 0.52, sheen: 0.3 });
  const berryShape = new T.SphereGeometry(0.028, 10, 7);
  for (let i = 0; i < 14; i++) {
    const bead = new T.Mesh(berryShape, grapeMaterial),
      a = i * 2.399,
      r = 0.042 * (1 - i / 17);
    bead.position.set(r * Math.sin(a), -0.007 * i, r * Math.cos(a));
    berry.add(bead);
  }
  berry.position.set(0, -0.12, 0.01);
  picker.hands[1].add(berry);
  const pickTarget = new T.Object3D();
  picker.g.add(pickTarget);
  const toBasket = new T.Vector3(),
    pickGrips = [null, pickTarget];
  const taste = tastingGlass(host);
  const cargo = crate();
  cargo.scale.setScalar(1.45);
  cargo.position.set(0, -0.05, 0.36);
  docker.hip.add(cargo);
  const rake = new T.Mesh(
    new T.CylinderGeometry(0.017, 0.021, 0.92, 10),
    new T.MeshStandardMaterial({ color: '#785c44' }),
  );
  rake.position.set(0, -0.36, 0.018);
  cellarman.hands[1].add(rake);
  cellarman.g.position.set(6.67, 3.04, -3.34);
  cellarman.g.rotation.y = -2.21;
  rower.g.rotation.y = Math.PI / 2;
  rower.g.position.set(-0.08, 0.31 - 0.865 * rower.g.scale.y, 0);
  const grips = [boats[6].grips[1], boats[6].grips[0]];
  const flights = flock(scene, {
    kind: 'swallow',
    count: 6,
    center: [0.4, 10, -5.4],
    radii: [8, 3.4],
    perch: [-8.65, 7.27, -3.1],
    scale: 0.38,
    obstacles: [
      [-4.9, 11.6, -6.3, 3.5],
      [-0.95, 7.15, -3, 1.6],
    ],
  });
  const pollinators = insects(scene, 'butterfly', 8, [4.2, 5.83, -5.38], [1.05, 0.22, 0.25], 0.42);
  const lengths = dock.slice(1).map((p, i) => Math.hypot(p[0] - dock[i][0], p[2] - dock[i][2]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const gatheringRoot = new T.Group();
  scene.add(gatheringRoot);
  let crowd;
  return (t, camera, quality) => {
    const mobile = quality === 'Mobile',
      high = quality === 'High';
    guest.g.visible = !mobile;
    gatheringRoot.visible = high;
    if (high && !crowd)
      crowd = gathering(gatheringRoot, 7, 0.57, [
        [-5.92, 1.1, -0.21, -1.1, 1],
        [-5.52, 1.1, 0.08, -2.13, 0.94],
        [-5.94, 1.1, 0.42, 0.23, 1.07],
      ]);
    if (high) crowd(t);
    const beat = t % 18,
      move = beat < 6 || (beat >= 9 && beat < 15);
    const x = beat < 6 ? 3.15 + beat * 0.62 : beat < 9 ? 6.87 : beat < 15 ? 6.87 - (beat - 9) * 0.62 : 3.15;
    picker.g.position.set(x, 5, -5.71);
    picker.g.rotation.y = move ? (beat < 6 ? Math.PI / 2 : -Math.PI / 2) : Math.PI * 0.93;
    picker.pose(t, move ? 'walk' : 'pick');
    hamper.settle(picker.g);
    berry.visible = false;
    if (!move) {
      const phase = ((beat % 9) - 6) / 3,
        deposit = smooth((phase - 0.25) / 0.46) * (1 - smooth((phase - 0.73) / 0.27));
      hamper.body.getWorldPosition(toBasket);
      picker.g.worldToLocal(toBasket);
      toBasket.y += 0.38;
      pickTarget.position.set(0.24, 1.39, 0.46).lerp(toBasket, deposit);
      picker.grasp(pickGrips);
      berry.visible = phase > 0.17 && phase < 0.71;
    }
    const d = (t * 0.72) % (2 * total),
      forward = d < total;
    let distance = forward ? d : 2 * total - d,
      i = 0;
    while (i < lengths.length - 1 && distance > lengths[i]) distance -= lengths[i++];
    const a = dock[i],
      b = dock[i + 1],
      u = distance / lengths[i],
      sign = forward ? 1 : -1;
    docker.g.position.set(
      T.MathUtils.lerp(a[0], b[0], u),
      T.MathUtils.lerp(a[1], b[1], u),
      T.MathUtils.lerp(a[2], b[2], u),
    );
    docker.g.rotation.y = Math.atan2(sign * (b[0] - a[0]), sign * (b[2] - a[2]));
    cargo.visible = forward;
    docker.pose(t, forward ? 'carry' : 'walk', dockHeight);
    host.g.position.set(-7.34, 1.1, -0.12);
    host.g.rotation.y = 0.88;
    host.pose(t, 'taste');
    taste(t);
    guest.pose(t, 'talk');
    cellarman.pose(t, 'inspect');
    const climb = (t * 0.43) % 17.0,
      z = 0.6 - (climb < 8.5 ? climb : 17 - climb);
    const tread = stairHeight(1.3, z),
      next = stairHeight(1.3, z - 0.085),
      prior = stairHeight(1.3, z + 0.085);
    walker.g.position.set(1.3, (tread * 2 + next + prior) * 0.25, z);
    walker.g.rotation.y = climb < 8.5 ? Math.PI : 0;
    walker.pose(t, 'walk', stairHeight);
    for (let j = 0; j < boats.length; j++) {
      const boat = boats[j],
        rowing = j === 6;
      if (rowing) {
        boat.b.position.x = -3.6 + 0.72 * Math.sin(t * 0.28);
        boat.b.position.z = 8.3 + 0.44 * Math.cos(t * 0.28);
        boat.b.rotation.y = Math.atan2(0.44 * Math.sin(t * 0.28), 0.72 * Math.cos(t * 0.28));
      }
      floatHull(boat.b, t, swell, 0, 0.426);
      boat.stroke(t, rowing);
    }
    rower.pose(t, 'row');
    rower.grasp(grips);
    for (const actor of people) actor.lod(camera, mobile);
    flights(t, mobile, camera);
    pollinators(t, mobile, false);
  };
}
