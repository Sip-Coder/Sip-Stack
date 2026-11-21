import { SCENE_M, scaleSpec } from './scale.js';
import { stairWalk } from './stair-walk.js';
import { cellarRake } from './tasks.js';
import * as T from 'three';
import { worker, rankPeople } from './people.js';
import { flock } from './birds.js';
import { crate, basket, tastingGlass, floatHull } from './harbor.js';
import { insects } from './wildlife.js';
import { gathering } from './crowd.js';
import { smooth } from './forms.js';

// Integrating the speed ramp keeps the travelled distance and each arrival
// exact, with a short stationary interval to turn or work at the destination.
function workRoute(length, speed, hold) {
  const ramp=.28, duration=length/speed+ramp, half=duration+hold;
  const result={forward:true, moving:false, distance:0, pause:0};
  return t=>{
    const loop=t%(2*half), time=loop%half;
    result.forward=loop<half;result.moving=time<duration;
    result.pause=Math.max(0,time-duration)/hold;
    const remaining=Math.max(0,duration-time);
    const d=time<ramp?speed*time*time/(2*ramp)
      :remaining<ramp?length-speed*remaining*remaining/(2*ramp):speed*(time-ramp*.5);
    result.distance=result.forward?d:length-d;
    return result;
  };
}

export function villageLife(scene, boats, swell, houses, nav) {
  const picker = worker(scene, 0, SCENE_M.village, 'Harvester'),
    docker = worker(scene, 1, SCENE_M.village, 'Porter'),
    host = worker(scene, 2, SCENE_M.village, 'Taster'),
    cellarman = worker(scene, 3, SCENE_M.village, 'Cellar worker'),
    walker = worker(scene, 4, SCENE_M.village, 'Stair walker'),
    rower = worker(boats[6].b, 5, SCENE_M.village, 'Oarsman');
  const guest = worker(scene, 6, SCENE_M.village, 'Cantina guest');
  nav.place(guest,-7.85,-.17,1.32);
  nav.place(host,-7.30,.03,-1.9,.055);
  nav.place(cellarman,6.32,-2.90,-2.85,.053);
  const basketRadius=.19, caseRadius=.25;
  const harvester=nav.place(picker,4.47,-5.7,Math.PI/2,basketRadius*picker.g.scale.y);
  const harvestRoute=nav.route(harvester,[[8.19,-5.70]]);
  const porter=nav.place(docker,5.38,.65,-Math.PI/2,caseRadius*SCENE_M.village);
  const dockRoute=nav.route(porter,[[3.8,.7],[3.8,6.3],[8.55,6.22]]);
  const climbStairs=stairWalk(scene,nav,walker);
  const harvestClock=workRoute(harvestRoute.total,1.20*SCENE_M.village,3);
  const porterClock=workRoute(dockRoute.total,1.18*SCENE_M.village,.40);
  const neighbours=[];
  const background=[[-5.82,-.28,-1.1,1],[-5.29,.06,-2.13,.94],[-5.75,.57,.23,1.015]].map(([x,z,angle,scale],i)=>{
    const record=nav.place(null,x,z,angle,.018,{name:'Cantina neighbour '+(i+1),unit:SCENE_M.village*scale});
    neighbours.push(record);
    return [...record.position.toArray(),angle,scale];
  });
  const people = [picker, docker, host, cellarman, walker, rower, guest];
  const hamper = basket(picker),
    berry = new T.Group(),
    grapeMaterial = new T.MeshPhysicalMaterial({ color: '#67445d', roughness: 0.52, sheen: 0.3 });
  const berryShape = new T.SphereGeometry(0.010, 10, 7);
  for (let i = 0; i < 14; i++) {
    const bead = new T.Mesh(berryShape, grapeMaterial),
      a = i * 2.399,
      r = 0.021 * (1 - i / 17);
    bead.position.set(r * Math.sin(a), -0.005 * i, r * Math.cos(a));
    berry.add(bead);
  }
  berry.position.set(0, -0.095, 0.01);
  picker.hands[1].add(berry);
  const pickTarget = new T.Object3D();
  picker.g.add(pickTarget);
  const toBasket = new T.Vector3(),
    pickGrips = [hamper.socket, pickTarget], carryBasket = [hamper.socket,null];
  const taste = tastingGlass(host);
  nav.agents.find(a=>a.actor===host).props=[taste.prop];
  const cargo = crate();
  // Clothing stature varies. Cargo retains the same external dimensions as a quay case.
  cargo.scale.setScalar(SCENE_M.village / docker.g.scale.y);
  scaleSpec(cargo, 'village', 'wine case', [.30, .50, .33], 'Carried wine case');
  cargo.position.set(0, -0.05, 0.36);
  docker.hip.add(cargo);
  const handles = [-1, 1].map((side) => {
    const grip = new T.Object3D();
    grip.position.set(side * 0.244, 0.263, -0.068);
    cargo.add(grip);
    return grip;
  });
  const rake = new T.Mesh(
    new T.CylinderGeometry(0.017, 0.021, 0.92, 10),
    new T.MeshStandardMaterial({ color: '#785c44' }),
  );
  rake.position.set(0, -0.36, 0.018);
  const workRake=cellarRake(cellarman,rake);
  harvester.props=[{object:hamper.body,radius:basketRadius,center:new T.Vector3(0,.10,0)}];
  porter.props=[{object:cargo,radius:caseRadius,center:new T.Vector3(0,.15,0)}];
  nav.agents.find(a=>a.actor===cellarman).props=[{object:rake,radius:.02,halfLength:.46}];
  rower.g.rotation.y = Math.PI / 2;
  rower.g.position.copy(boats[6].seat);
  // The pelvis joint sits above the ischial contact on the thwart.
  rower.g.position.y -= (rower.hip.position.y - .07) * rower.g.scale.y;
  const passenger={name:rower.g.name,actor:rower,position:new T.Vector3(),seated:true,deckHeight:boats[6].deckHeight,
    radius:rower.g.scale.y*.285,reserved:rower.g.scale.y*.315,height:rower.g.scale.y*1.79,
    props:boats[6].shafts,support:nav.obstacles.find(o=>o.name===boats[6].b.name)};
  nav.agents.push(passenger);
  const grips = [boats[6].grips[1], boats[6].grips[0]];
  const flights = flock(scene, {
    sceneKey: 'village', kind: 'swallow',
    count: 6,
    center: [0.4, 14, -4.8],
    radii: [8, 3.4],
    perch: [houses[0].x, houses[0].roofHeight, houses[0].z],
    obstacles: houses.map(({ x, z, w, d, roofHeight }) => [
      x,
      roofHeight,
      z,
      Math.hypot(w, d) * 0.5 + 0.28,
    ]),
  });
  const pollinators = insects(scene, 'butterfly', 8, [4.2, 5.83, -5.38], [1.05, 0.22, 0.25], 'village');
  const gatheringRoot = new T.Group();
  scene.add(gatheringRoot);
  const crowd=gathering(gatheringRoot,7,SCENE_M.village,background);
  const crowdMesh=gatheringRoot.getObjectByName('Tasting group');
  neighbours.forEach((agent,index)=>{agent.instance={mesh:crowdMesh,index};});
  return (t, camera, quality) => {
    const mobile = quality === 'Mobile',
      high = quality === 'High';
    nav.begin(t);
    crowd(t);
    const harvest=harvestClock(t),move=harvest.moving;
    nav.follow(harvester,harvest.distance,harvest.forward,move ? undefined : -2.42);
    picker.dynamics.load(2.4,-.2,1,.29);
    picker.pose(t, move ? 'walk' : 'pick',nav.floor);
    hamper.settle();
    berry.visible = false;
    if (!move) {
      const phase = harvest.pause,
        deposit = smooth((phase - 0.25) / 0.46) * (1 - smooth((phase - 0.73) / 0.27));
      hamper.body.getWorldPosition(toBasket);
      picker.g.worldToLocal(toBasket);
      toBasket.y += 0.38;
      toBasket.x += .093; // Drop grapes over the inside edge of the opening.
      pickTarget.position.set(0.24, 1.39, 0.46).lerp(toBasket, deposit);
      picker.grasp(pickGrips);
      berry.visible = phase > 0.17 && phase < 0.71;
    } else picker.grasp(carryBasket);
    const dock=porterClock(t),forward=dock.forward;
    nav.follow(porter,dock.distance,forward);
    cargo.visible = forward;
    docker.dynamics.load(forward?8.4:0,0,1,.29);
    docker.pose(t, forward ? 'carry' : 'walk', nav.floor);
    if(forward){const lag=docker.dynamics.lag;cargo.position.set(lag[0],-.05+lag[1],.50+lag[2]);docker.grasp(handles);}
    host.dynamics.load(.31,.16,1.28,.23);
    host.pose(t, 'taste',nav.floor);
    taste(t);
    guest.pose(t, 'talk',nav.floor);
    cellarman.dynamics.load(1.1,0,1.17,.31);
    cellarman.pose(t, 'inspect',nav.floor);
    workRake(t);
    climbStairs(t);
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
    rower.dynamics.load(2.2,0,1.1,.22);
    rower.pose(t, 'row',boats[6].deckHeight);
    rower.grasp(grips);
    rower.g.getWorldPosition(passenger.position); scene.worldToLocal(passenger.position);
    rankPeople(people,camera,mobile,high);
    nav.draw();
    flights(t, mobile, camera);
    pollinators(t, mobile, false);
  };
}
