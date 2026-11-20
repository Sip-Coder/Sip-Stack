// The contact sheet and the geometry probe drive identical production poses.
import { FIXED_DT } from '/characters/motion.js';

export const garmentPoses = [
  'stand',
  'walk',
  'run',
  'overhead',
  'crouch',
  'roll',
  'turn',
  'apex',
  'emote25',
  'emote50',
  'emote56', // Sippy's sniff and Hummin's bow reach their crest here.
  'emote75',
];

export function poseGarment(rig, controller, animate, id) {
  if (!garmentPoses.includes(id)) throw Error('Unknown garment pose ' + id);
  controller.reset(-22, -22);
  const input = { x: 0, z: 0, jump: false, roll: false, run: false, emote: false };
  function tick(extension = 0) {
    const f = controller.step(FIXED_DT, input);
    if (id === 'overhead') {
      // Abduct both arms above the head in the scapular plane, elbows relaxed.
      for (const [side, sign] of [
        ['L', 1],
        ['R', -1],
      ]) {
        rig['upperArm' + side].rotation.z += sign * 2.72 * extension;
        rig['upperArm' + side].rotation.x -= 0.24 * extension;
        rig['forearm' + side].rotation.x -= 0.12 * extension;
      }
    } else if (id === 'crouch') {
      const thigh = -1.17 * extension,
        knee = 2.12 * extension;
      // Preserve the ankle height as the hips descend over the bent legs.
      rig.hips.position.y -= 0.245 * (1 - Math.cos(thigh)) + 0.228 * (1 - Math.cos(thigh + knee));
      rig.chest.rotation.x += 0.44 * extension;
      for (const side of ['L', 'R']) {
        rig['thigh' + side].rotation.set(thigh, 0, 0);
        rig['shin' + side].rotation.set(knee, 0, 0);
        rig['foot' + side].rotation.set(-thigh - knee, 0, 0);
        rig['upperArm' + side].rotation.x -= 0.65 * extension;
      }
    }
    animate(f);
    controller.finishPose();
    return f;
  }
  for (let i = 0; i < 36; i++) tick();
  if (id === 'overhead' || id === 'crouch') for (let i = 0; i < 48; i++) tick(Math.min(1, (i + 1) / 30));
  if (['walk', 'run', 'roll', 'turn', 'apex'].includes(id)) {
    input.z = 1;
    input.run = id !== 'walk';
    for (let i = 0; i < 52; i++) tick();
    if (id === 'roll' || id === 'apex') {
      input[id === 'roll' ? 'roll' : 'jump'] = true;
      tick();
      input.jump = input.roll = false;
      for (let i = 0; i < (id === 'roll' ? 18 : 29); i++) tick();
    } else if (id === 'turn') {
      for (let i = 1; i <= 23; i++) {
        input.x = Math.sin(i * 0.085);
        input.z = Math.cos(i * 0.085);
        tick();
      }
    }
  } else if (id.startsWith('emote')) {
    const samples = Math.round(((2.1 / FIXED_DT) * Number(id.slice(5))) / 100);
    for (let i = 0; i < samples; i++) {
      input.emote = i === 0;
      tick();
    }
  }
  rig.root.updateMatrixWorld(true);
  return controller.frame;
}
