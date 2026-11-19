import * as T from 'three';
import { peopleNav } from '../docs/life/nav.js';

export function runNavigationCases() {
  const scene = new T.Group(),
    nav = peopleNav(scene),
    failures = [];
  nav.surface('test deck', -3, 3, -2, 2, 0);
  nav.box('stack', 0, 0, 0.34, 0.48, 0, 1.1, Math.PI / 7);
  function actor(name, x, z) {
    const g = new T.Group();
    scene.add(g);
    g.name = name;
    g.scale.setScalar(0.55);
    return nav.place({ g }, x, z);
  }
  const pedestrian = actor('walker', -2, 0);
  const route = nav.route(pedestrian, [[2, 0]]);
  let clearance = Infinity,
    turn = 0;
  for (let frame = 0; frame <= 300; frame++) {
    const t = frame / 30,
      forward = t < 6;
    nav.begin(t);
    const yaw = pedestrian.actor.g.rotation.y;
    nav.follow(pedestrian, forward ? Math.min(route.total, t) : Math.max(0, route.total - (t - 6)), forward);
    const p = pedestrian.position;
    clearance = Math.min(
      clearance,
      nav.clearance(p.x, p.y + 0.005, p.z, pedestrian.reserved, pedestrian.height),
    );
    if (frame)
      turn = Math.max(
        turn,
        Math.abs(
          Math.atan2(
            Math.sin(yaw - pedestrian.actor.g.rotation.y),
            Math.cos(yaw - pedestrian.actor.g.rotation.y),
          ),
        ) * 30,
      );
  }
  if (route.points.length < 3 || clearance <= 0) failures.push('navigation/blocked segment');
  if (turn > pedestrian.turnRate + 1e-5) failures.push('navigation/turn rate');
  const displaced = actor('standing', 0, 0).position;
  if (nav.clearance(displaced.x, 0.005, displaced.z, 0.55 * 0.315, 1) <= 0)
    failures.push('navigation/standing correction');
  const hinge = new T.Group();
  hinge.position.set(-2, 0, 1);
  scene.add(hinge);
  const door = nav.box('door', 0.45, 0, 0.45, 0.035, 0, 1.3, 0, hinge);
  hinge.rotation.y = Math.PI / 2;
  nav.begin(11);
  if (Math.abs(door.x + 2) > 1e-6 || Math.abs(door.z - 0.55) > 1e-6)
    failures.push('navigation/moving footprint');
  // These paths are planned before their occupants enter the crossing.
  const street = peopleNav(new T.Group());
  street.surface('crossing', -3, 3, -2, 2, 0);
  function approaching(name, x, z, tx, tz) {
    const g = new T.Group();
    g.name = name;
    g.scale.setScalar(0.55);
    const agent = street.place({ g }, x, z);
    street.route(agent, [[tx, tz]]);
    return agent;
  }
  const east = approaching('east', -1.5, 0.01, 1.5, 0.01),
    north = approaching('north', 0, 1.51, 0, -1.49);
  let separation = Infinity;
  for (let frame = 0; frame <= 200; frame++) {
    const t = frame / 30;
    street.begin(t);
    for (const a of [east, north]) street.follow(a, Math.min(a.route.total, 0.7 * t));
    separation = Math.min(
      separation,
      east.position.distanceTo(north.position) - east.reserved - north.reserved,
    );
  }
  if (separation < 0 || east.position.x < 1.45 || north.position.z > -1.44)
    failures.push('navigation/crossing');
  return {
    failures,
    routePoints: route.points.length,
    minimumRouteClearance: clearance,
    maximumTurnRate: turn,
    nearestPersonClearance: separation,
    movingDoorAngle: door.angle,
  };
}
