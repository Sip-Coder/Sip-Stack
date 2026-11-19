import { footPlant } from './feet.js';
import * as T from 'three';
import { extendRig, armSolver } from './rig.js';
import { seed, wind, tau } from './forms.js';
import { makeAppearance } from './appearance.js';
import { createDynamics } from './physics.js';
export { rankPeople, finishPeopleLoad } from './appearance.js';

// height, build, shoulder, waist, layers, hair and work clothes
const wardrobe = [
  [1.67, 1.05, 0.91, 1.08, 'straw', '#393126', '#426554', '#594942'],
  [1.84, 1.14, 1.13, 1.08, 'vest', '#382d2b', '#ac644d', '#42474b'],
  [1.71, 0.96, 0.93, 0.89, 'apron', '#452d22', '#f0e3cc', '#3c5155'],
  [1.68, 1.12, 1.04, 1.14, 'cap', '#93867b', '#817487', '#514e43'],
  [1.78, 0.89, 0.97, 0.87, 'skirt', '#583a2e', '#a9563e', '#2a5752'],
  [1.82, 1.05, 1.09, 1.0, 'cap', '#37312c', '#54778a', '#534a40'],
  [1.57, 1.01, 0.9, 1.12, 'scarf', '#b3a59b', '#e3c49a', '#785953'],
  [1.88, 0.94, 1.04, 0.91, 'vest', '#584534', '#d8ddca', '#565348'],
];
const tones = ['#9c674c', '#c68a63', '#c99774', '#aa775b', '#d9a381', '#86573f', '#ba8969', '#c08d69'];

const contactGeometry = new T.PlaneGeometry(0.25, 0.4);
contactGeometry.rotateX(-Math.PI / 2);
const contactMaterial = new T.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  vertexShader:
    'varying vec2 footprint;void main(){footprint=(uv-.5)*2.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:
    'varying vec2 footprint;void main(){float d=dot(footprint,footprint);gl_FragColor=vec4(.055,.036,.024,.27*(1.-smoothstep(.01,.98,d)));}',
});
export function worker(parent, variant, unit, job, bulk = false) {
  let identity = 91238 + variant * 147;
  for (const letter of job) identity = Math.imul(identity, 31) + letter.charCodeAt(0);
  const rand = seed(identity);
  const [stature, body, frame, waist, style, hair, shirt, pants] = wardrobe[variant % 8];
  const height = stature * (0.983 + 0.034 * rand()),
    build = body * (0.975 + 0.05 * rand()),
    shoulder = frame * (0.98 + 0.04 * rand());
  const skin = new T.Color(tones[variant % 8]).offsetHSL(0, (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.025),
    g = new T.Group();
  g.name = job;
  const bones = [],
    bind = [];
  function bone(name, x, y, z, parentIndex) {
    const b = new T.Bone();
    b.name = name;
    const p = new T.Vector3(x, y, z);
    bind.push(p);
    b.position.copy(p);
    if (parentIndex !== undefined) {
      b.position.sub(bind[parentIndex]);
      bones[parentIndex].add(b);
    }
    bones.push(b);
    return bones.length - 1;
  }
  const hip = bone('pelvis', 0, 0.89, 0),
    spine = bone('lumbar', 0, 1.04, 0, hip),
    chest = bone('chest', 0, 1.29, 0, spine),
    neck = bone('neck', 0, 1.49, 0, chest),
    head = bone('head', 0, 1.54, 0, neck);
  const sides = [-1, 1].map((s) => {
    const x = s * 0.205 * shoulder,
      h = s * 0.098 * build;
    const clav = bone('clavicle', s * 0.055, 1.43, 0, chest),
      arm = bone('shoulder', x, 1.43, 0, clav),
      elbow = bone('elbow', x + s * 0.033, 1.14, -0.015, arm),
      hand = bone('wrist', x + s * 0.042, 0.903, 0.014, elbow);
    const thigh = bone('hip', h, 0.89, 0, hip),
      shin = bone('knee', h, 0.481, 0.008, thigh),
      ankle = bone('ankle', h, 0.078, 0, shin);
    return { s, x, h, arm, elbow, hand, thigh, shin, ankle };
  });
  const hem = bone('hem', 0, 1.06, 0, spine);
  const rig = extendRig({ bones, bind, bone, hip, spine, chest, neck, head, hem, sides, style });
  g.add(bones[hip]);
  g.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);
  const appearance = makeAppearance(
    {
      rig,
      bones,
      bind,
      hip,
      spine,
      chest,
      neck,
      head,
      sides,
      skin,
      pants,
      shirt,
      hair,
      style,
      build,
      shoulder,
      waist,
      variant,
    },
    g,
    skeleton,
    bulk,
  );
  const { tiers, layers } = appearance,
    low = tiers[2][0];
  const skinRoot = new T.Group();
  skinRoot.scale.setScalar((unit * height) / 1.76);
  skinRoot.add(g);
  skinRoot.name = job;
  if (!bulk) skinRoot.userData.preparePeopleLOD = appearance.ensure;
  g.name = '';
  parent.add(skinRoot);
  const prints = sides.map(() => {
    const shadow = new T.Mesh(contactGeometry, contactMaterial);
    skinRoot.add(shadow);
    return shadow;
  });
  const dynamics = createDynamics({
    root: skinRoot,
    rig,
    style,
    build,
    waist,
    clothColor: style === 'apron' ? '#586e69' : style === 'scarf' ? '#964e3f' : pants,
    seed: identity,
  });
  const world = new T.Vector3(),
    lens = new T.Vector3();
  let currentLevel = 2,
    currentAction = job;
  function setLOD(level, mobile = false) {
    currentLevel = bulk ? 2 : level;
    appearance.select(currentLevel);
    dynamics.setLOD(currentLevel, mobile);
  }
  setLOD(2);
  function lod(camera, mobile, allowMedium = true, allowHigh = true) {
    skinRoot.getWorldPosition(world);
    camera.getWorldPosition(lens);
    appearance.aim(lens);
    const d = world.distanceTo(lens) / skinRoot.matrixWorld.getMaxScaleOnAxis();
    const close = d < (currentLevel === 0 ? 6.9 : 6);
    const mid = d < (currentLevel < 2 ? 20.7 : 18);
    setLOD(!mobile && allowHigh && close ? 0 : mid && (!mobile || allowMedium) ? 1 : 2, mobile);
    dynamics.finish();
  }
  const gait = footPlant(skinRoot, bones, sides, bones[hip], prints);
  const { grasp, release, palms, grips, gripErrors } = armSolver(rig);
  let travel = 0,
    prevX = NaN,
    prevZ = 0;
  const phase = rand() * tau;
  function pose(t, action = job, floor = null) {
    release();
    currentAction = action;
    const pos = skinRoot.position,
      sc = skinRoot.scale.y;
    const dist = Number.isFinite(prevX) ? Math.hypot(pos.x - prevX, pos.z - prevZ) / sc : 0;
    if (dist < 1.8) travel += dist;
    prevX = pos.x;
    prevZ = pos.z;
    const walking = action === 'walk' || action === 'carry',
      stride = job === 'Stair walker' ? 0.55 : action === 'carry' ? 0.89 : 1.02,
      cycle = travel / stride,
      sway = walking ? Math.sin(tau * cycle) : Math.sin(t * 0.81 + phase) * 0.34;
    const work = 0.5 - 0.5 * Math.cos(t * 1.8 + phase),
      stroke = Math.sin(t * 2),
      breath = Math.sin(t * 1.75 + phase);
    const pelvis = bones[hip];
    pelvis.position.set(
      0.018 * sway,
      0.869 + (walking ? 0.015 * Math.cos(cycle * tau * 2) : breath * 0.004),
      0,
    );
    pelvis.rotation.set(0, 0.058 * sway, 0.026 * sway);
    bones[chest].rotation.set(0.018 * breath, -0.105 * sway, -0.018 * sway);
    bones[spine].rotation.x =
      action === 'pick'
        ? 0.23 * work
        : action === 'inspect'
          ? 0.18 + 0.12 * work
          : action === 'row'
            ? 0.12 * stroke
            : 0;
    bones[head].rotation.set(
      action === 'pick' || action === 'inspect' ? 0.16 + 0.14 * work : 0.025 * breath,
      0.19 * Math.sin(t * 0.67 + phase),
      -0.026 * sway,
    );
    bones[hem].rotation.set(0.03 * wind(t, pos.x, pos.z), 0, 0.021 * sway);
    for (let i = 0; i < 2; i++) {
      const { s, thigh, shin, ankle, arm, elbow, hand, h } = sides[i],
        p = (cycle + i * 0.5) % 1;
      let reach = walking ? 0.53 * Math.sin(tau * p) : 0.06,
        bend = -0.23 - 0.06 * work,
        spread = 0.065;
      if (action === 'row') {
        reach = -0.71 - 0.42 * stroke;
        bend = -0.82 + 0.49 * stroke;
        bones[thigh].rotation.x = -1.54;
        bones[shin].rotation.x = 1.27;
      }
      if (action === 'carry') {
        reach = -0.62;
        bend = -1.05;
        spread = 0.09;
      }
      if (action === 'pick') {
        reach = i ? -0.64 - work * 0.89 : -0.36;
        bend = i ? -0.8 + 0.62 * work : -1.01;
      }
      if (action === 'taste') {
        reach = i ? -0.37 - 0.4 * work : -0.13;
        bend = i ? -0.98 - 1.1 * work : -0.31;
      }
      if (action === 'inspect') {
        reach = -0.84 - 0.3 * work;
        bend = -0.52 + 0.25 * work;
      }
      if (action === 'talk' && i) {
        reach = -0.29 - 0.24 * work;
        bend = -0.82 - 0.3 * work;
        spread = 0.21 * work;
      }
      bones[arm].rotation.set(reach, 0, s * spread);
      bones[elbow].rotation.x = bend;
      const pronation =
        action === 'carry'
          ? 0.44
          : action === 'row'
            ? 0.7 + 0.13 * stroke
            : action === 'taste'
              ? 0.22 + 0.55 * work
              : action === 'inspect'
                ? 0.35 + 0.22 * work
                : action === 'pick'
                  ? 0.26 + 0.3 * work
                  : 0.1 + 0.06 * sway;
      bones[hand].rotation.set(-0.08 * breath, s * pronation, 0);
    }
    appearance.animate(t, action, phase);
    dynamics.pose(t, action);
    gait.solve(t, action, cycle, stride, floor, dynamics);
    rig.update();
  }
  pose(0);
  return {
    g: skinRoot,
    get action() {
      return currentAction;
    },
    feet: gait.feet,
    tiers,
    setLOD,
    aim: appearance.aim,
    dynamics,
    pose,
    grasp,
    palms,
    targets: grips,
    gripErrors,
    rig,
    lod,
    low,
    hands: sides.map((s) => bones[s.hand]),
    hip: bones[hip],
    layers,
    skeleton,
  };
}
