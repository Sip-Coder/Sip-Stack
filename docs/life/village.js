import { cellarRake } from './tasks.js';
import * as T from 'three';
import { worker, rankPeople } from './people.js';
import { flock } from './birds.js';
import { crate, basket, tastingGlass, floatHull } from './harbor.js';
import { insects } from './wildlife.js';
import { gathering } from './crowd.js';
import { smooth } from './forms.js';

export function villageLife(scene, boats, swell, houses, nav) {
  const picker = worker(scene, 0, 0.61, 'Harvester'),
    docker = worker(scene, 1, 0.6, 'Porter'),
    host = worker(scene, 2, 0.61, 'Taster'),
    cellarman = worker(scene, 3, 0.6, 'Cellar worker'),
    walker = worker(scene, 4, 0.61, 'Stair walker'),
    rower = worker(boats[6].b, 5, 0.53, 'Oarsman');
  const guest = worker(scene, 6, 0.59, 'Cantina guest');
  nav.place(guest,-7.85,-.17,1.32);
  nav.place(host,-7.30,.03,-1.9,.055);
  nav.place(cellarman,6.32,-2.90,-2.85,.053);
  const basketRadius=.19, caseRadius=.206, caseScale=1.45;
  const harvester=nav.place(picker,4.47,-5.7,Math.PI/2,basketRadius*picker.g.scale.y);
  const harvestRoute=nav.route(harvester,[[8.19,-5.70]]);
  const porter=nav.place(docker,5.38,.65,-Math.PI/2,caseRadius*caseScale*docker.g.scale.y);
  const dockRoute=nav.route(porter,[[3.8,.7],[3.8,6.3],[8.55,6.22]]);
  const climber=nav.place(walker,1.28,.61,Math.PI);
  const stairRoute=nav.route(climber,[[1.28,-7.85]]);
  const neighbours=[];
  const background=[[-5.82,-.28,-1.1,1],[-5.29,.06,-2.13,.94],[-5.75,.57,.23,1.07]].map(([x,z,angle,scale],i)=>{
    const record=nav.place(null,x,z,angle,.018,{name:'Cantina neighbour '+(i+1),unit:.57*scale});
    neighbours.push(record);
    return [...record.position.toArray(),angle,scale];
  });
  const people = [picker, docker, host, cellarman, walker, rower, guest];
  const hamper = basket(picker),
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
    pickGrips = [hamper.socket, pickTarget], carryBasket = [hamper.socket,null];
  const taste = tastingGlass(host);
  nav.agents.find(a=>a.actor===host).props=[taste.prop];
  const cargo = crate();
  cargo.scale.setScalar(caseScale);
  cargo.position.set(0, -0.05, 0.36);
  docker.hip.add(cargo);
  const handles = [-1, 1].map((side) => {
    const grip = new T.Object3D();
    grip.position.set(side * 0.2, 0.24, -0.052);
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
  porter.props=[{object:cargo,radius:caseRadius,center:new T.Vector3(0,.12,0)}];
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
    kind: 'swallow',
    count: 6,
    center: [0.4, 14, -4.8],
    radii: [8, 3.4],
    perch: [-8.65, 7.27, -3.1],
    scale: 0.38,
    obstacles: houses.map(({ x, z, w, d, base, floors }) => [
      x,
      base + floors * 1.05 + 0.28 + Math.min(w, d) * 0.3,
      z,
      Math.hypot(w, d) * 0.5 + 0.28,
    ]),
  });
  const pollinators = insects(scene, 'butterfly', 8, [4.2, 5.83, -5.38], [1.05, 0.22, 0.25], 0.42);
  const gatheringRoot = new T.Group();
  scene.add(gatheringRoot);
  const crowd=gathering(gatheringRoot,7,.57,background);
  const crowdMesh=gatheringRoot.getObjectByName('Tasting group');
  neighbours.forEach((agent,index)=>{agent.instance={mesh:crowdMesh,index};});
  return (t, camera, quality) => {
    const mobile = quality === 'Mobile',
      high = quality === 'High';
    nav.begin(t);
    crowd(t);
    const beat = t % 18,
      move = beat < 6 || (beat >= 9 && beat < 15);
    const harvestFraction=beat<6 ? beat/6 : beat<9 ? 1 : beat<15 ? 1-(beat-9)/6 : 0;
    nav.follow(harvester,harvestFraction*harvestRoute.total,beat<9,move ? undefined : -2.42);
    picker.dynamics.load(2.4,-.2,1,.29);
    picker.pose(t, move ? 'walk' : 'pick',nav.floor);
    hamper.settle();
    berry.visible = false;
    if (!move) {
      const phase = ((beat % 9) - 6) / 3,
        deposit = smooth((phase - 0.25) / 0.46) * (1 - smooth((phase - 0.73) / 0.27));
      hamper.body.getWorldPosition(toBasket);
      picker.g.worldToLocal(toBasket);
      toBasket.y += 0.38;
      toBasket.x += .093; // Drop grapes over the inside edge of the opening.
      pickTarget.position.set(0.24, 1.39, 0.46).lerp(toBasket, deposit);
      picker.grasp(pickGrips);
      berry.visible = phase > 0.17 && phase < 0.71;
    } else picker.grasp(carryBasket);
    const d=(t*.72)%(2*dockRoute.total), forward=d<dockRoute.total;
    nav.follow(porter,forward ? d : 2*dockRoute.total-d,forward);
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
    const climb=(t*.43)%(2*stairRoute.total), up=climb<stairRoute.total;
    nav.follow(climber,up ? climb : 2*stairRoute.total-climb,up);
    walker.pose(t,'walk',nav.floor);
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
