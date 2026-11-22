// BoneHub supplies one node per source segment. The named repairs below add
// only cartilage and articular surfaces absent from the CT acquisition.
import { Color, Matrix4, Vector3 } from 'three';

const cortex = new Color('#eee5cf'),
  cartilage = new Color('#dfd9c5');
const fingers = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
const toes = ['great toe', 'second toe', 'third toe', 'fourth toe', 'fifth toe'];

export function scanPartName(node) {
  const [name] = node.split(/_(LEFT|RIGHT)$/);
  const side = node.endsWith('_LEFT') ? 'Left ' : node.endsWith('_RIGHT') ? 'Right ' : '';
  if (name === 'SKULL_CRANIAL_MAXILLA') return 'Cranium and maxilla';
  if (name === 'SKULL_MANDIBLE') return 'Mandible';
  if (name === 'SACRUM') return 'Sacrum and coccyx';
  if (name === 'HIP') return side + 'hip bone';
  if (name.startsWith('VERTEBRA_')) {
    const level = name.slice(9);
    const region = { C: 'Cervical', T: 'Thoracic', L: 'Lumbar' }[level[0]];
    return region + ' vertebra ' + level;
  }
  if (name.startsWith('PHALANGE_')) {
    const [, limb, digit] = name.split('_');
    return side + (limb === 'HAND' ? fingers : toes)[Number(digit) - 1] + ' phalanges';
  }
  const word = name.toLowerCase().replaceAll('_', ' ');
  return side ? side + word : word[0].toUpperCase() + word.slice(1);
}

function points(mesh, matrix) {
  const data = mesh.geometry.attributes.position;
  const result = [];
  for (let i = 0; i < data.count; i++) {
    const p = new Vector3().fromBufferAttribute(data, i).applyMatrix4(mesh.matrixWorld);
    result.push(matrix ? p.applyMatrix4(matrix) : p);
  }
  return result;
}

function sample(surface, score, count) {
  // Bone ends are oblique in the scan. Use a small patch of nearby vertices
  // on the actual bone, rather than the center of its bounding box.
  const scored = surface.map((p) => ({ p, d: score(p) })).sort((a, b) => a.d - b.d);
  const patch = scored.slice(0, count);
  return patch.reduce((sum, { p }) => sum.add(p), new Vector3()).multiplyScalar(1 / patch.length);
}

function addCartilage(rig, fitted, part) {
  const toChest = new Matrix4().copy(rig.chest.matrixWorld).invert();
  const world = (p) => p.clone().applyMatrix4(rig.chest.matrixWorld);
  const sternum = points(fitted.get('STERNUM'), toChest);
  const min = Math.min(...sternum.map((p) => p.y)),
    max = Math.max(...sternum.map((p) => p.y));
  const sternX = sternum.reduce((sum, p) => sum + p.x, 0) / sternum.length;
  const levels = [0.9, 0.69, 0.54, 0.42, 0.31, 0.22, 0.15];
  for (const side of ['LEFT', 'RIGHT']) {
    const sign = side === 'LEFT' ? 1 : -1;
    let previous;
    for (let rib = 1; rib <= 10; rib++) {
      const outline = points(fitted.get('RIB_' + rib + '_' + side), toChest);
      const front = Math.max(...outline.map((p) => p.z)),
        back = Math.min(...outline.map((p) => p.z));
      // The posterior vertebral end is also medial. Exclude it before sampling
      // the anteromedial rim where the bony rib changes to hyaline cartilage.
      const anterior = outline.filter((p) => p.z >= front - (front - back) * 0.39);
      const root = sample(anterior, (p) => sign * (p.x - sternX) - 0.32 * (p.z - front), 5);
      let end;
      if (rib <= 7) {
        const y = min + (max - min) * levels[rib - 1];
        end = sample(sternum, (p) => Math.abs(p.y - y) * 2.8 - sign * (p.x - sternX), 5);
      } else {
        // The false ribs join the upper cartilage's lateral limb.
        end = previous[0].clone().lerp(previous[1], rib === 8 ? 0.65 : 0.41);
      }
      const bend = root.clone().lerp(end, 0.43);
      bend.y -= Math.min(0.007, root.distanceTo(end) * 0.13);
      bend.z += Math.min(0.002, root.distanceTo(end) * 0.06);
      previous = [root, bend, end];
      const radius = rib === 1 ? 0.0036 : rib > 7 ? 0.0024 : 0.003;
      part((sign > 0 ? 'Left ' : 'Right ') + 'costal cartilage ' + rib + ' (reconstruction)', 'skeleton', ({ sweep, high }) => {
        sweep(
          previous.map(world),
          [
            [radius, radius * 0.7],
            [radius * 1.08, radius * 0.78],
            [radius, radius * 0.72],
          ],
          cartilage,
          { rows: high ? 10 : 7, sides: high ? 8 : 6 },
        );
      });
    }
  }
}

function addElbow(rig, side, fitted, shoulder, part) {
  const label = side === 'LEFT' ? 'Left ' : 'Right ';
  const height = rig.height,
    { elbow, wrist, headCenter, fore } = shoulder;
  const down = wrist.clone().sub(elbow).normalize();
  const forward = new Vector3(0, 0, 1).transformDirection(fore.matrixWorld);
  const outward = new Vector3(1, 0, 0).transformDirection(fore.matrixWorld).multiplyScalar(shoulder.s);
  const at = (x, along, z) =>
    elbow
      .clone()
      .addScaledVector(outward, x * height)
      .addScaledVector(down, along * height)
      .addScaledVector(forward, z * height);
  const upArm = headCenter.clone().sub(elbow).normalize();
  const humerus = points(fitted.get('HUMERUS_' + side));
  const radius = points(fitted.get('RADIUS_' + side));
  const ulna = points(fitted.get('ULNA_' + side));

  // Project a cap back into the surviving cortex. Where a subject retains
  // their articular end, the distance gate preserves the scanned joint.
  function join(surface, end, shaft, width) {
    const nearest = sample(surface, (p) => p.distanceToSquared(end), 5);
    if (end.distanceTo(nearest) < height * width * 0.8) return null;
    return nearest.addScaledVector(shaft, height * width * 0.65);
  }
  const capitulum = at(0.008, -0.001, 0.0015);
  const trochlea = at(-0.003, 0, 0);
  const cut = join(humerus, trochlea, upArm, 0.006);
  let flare;
  if (cut) {
    // Distal metaphysis broadens into the medial epicondyle. The distal
    // spool has two lips and a narrow groove for the ulnar trochlear notch.
    part(label + 'distal humerus and trochlea (reconstruction)', 'skeleton', ({ sweep, high }) => {
      // The acquisition cylinder clips several inches of shaft on a diagonal.
      // A cap on the final pointed vertex alone leaves a pin-sized connection.
      // Start inside a complete shaft section and widen across the oblique cut.
      const station = height * 0.061;
      const start = sample(humerus, (p) => Math.abs(p.clone().sub(elbow).dot(upArm) - station), 28);
      const distalShaft = start.clone().lerp(cut, 0.53);
      flare = trochlea.clone().addScaledVector(upArm, height * 0.01);
      sweep(
        [start, distalShaft, cut, flare, trochlea],
        [
          [0.0024, 0.0026],
          [0.0049, 0.0044],
          [0.0067, 0.0049],
          [0.011, 0.006],
          [0.01, 0.0048],
        ],
        cortex,
        { across: outward, rows: high ? 11 : 7, sides: high ? 14 : 9 },
      );
      sweep(
        [at(-0.012, -0.001, 0), at(-0.008, 0.001, 0), trochlea, at(0.001, -0.0004, 0)],
        [
          [0.004, 0.004],
          [0.0062, 0.006],
          [0.0041, 0.0043],
          [0.0051, 0.0052],
        ],
        cortex,
        { across: forward, rows: 9, sides: high ? 14 : 9 },
      );
    });
  }
  if (join(humerus, capitulum, upArm, 0.0049)) {
    part(label + 'humeral capitulum (reconstruction)', 'skeleton', ({ sweep }) => {
      const p = flare ?? sample(humerus, (v) => v.distanceToSquared(capitulum), 5);
      sweep(
        [
          p,
          capitulum.clone().addScaledVector(upArm, 0.005 * height),
          capitulum,
          capitulum.clone().addScaledVector(upArm, -0.0045 * height),
        ],
        [
          [0.003, 0.003],
          [0.004, 0.004],
          [0.0054, 0.0057],
          [0.0017, 0.002],
        ],
        cortex,
        { across: outward, rows: 10, sides: 10 },
      );
    });
  }
  const radialHead = at(0.008, 0.0075, 0.001);
  const radialStart = join(radius, radialHead, down, 0.005);
  if (radialStart)
    part(label + 'radial head (reconstruction)', 'skeleton', ({ net, high }) => {
      // An annulus and an inset center form the shallow fovea at the radial head.
      const neck = radialHead.clone().addScaledVector(down, height * 0.006);
      const profile = [
        [radialStart, 0.003],
        [neck, 0.0038],
        [radialHead, 0.0057],
        [radialHead.clone().addScaledVector(down, -height * 0.0015), 0.0053],
        [radialHead.clone().addScaledVector(down, height * 0.0003), 0.0012],
      ];
      net(
        profile.length,
        high ? 18 : 12,
        (i, j, t, a) =>
          profile[i][0]
            .clone()
            .addScaledVector(outward, height * profile[i][1] * Math.cos(a))
            .addScaledVector(forward, height * profile[i][1] * Math.sin(a)),
        cortex,
        true,
        shoulder.s > 0,
      );
    });
  const olecranon = at(-0.004, -0.0045, -0.008);
  const ulnarStart = join(ulna, olecranon, down, 0.005);
  if (ulnarStart)
    part(label + 'ulnar olecranon and coronoid (reconstruction)', 'skeleton', ({ sweep, high }) => {
      const base = at(-0.004, 0.013, -0.003),
        rear = at(-0.004, 0.004, -0.009);
      sweep(
        [ulnarStart, base, rear, olecranon, at(-0.004, -0.005, -0.004)],
        [
          [0.0038, 0.004],
          [0.0058, 0.0057],
          [0.0056, 0.0038],
          [0.0052, 0.0032],
          [0.0034, 0.0018],
        ],
        cortex,
        { across: outward, rows: high ? 16 : 11, sides: high ? 12 : 9 },
      );
      sweep(
        [base, at(-0.004, 0.008, 0.002), at(-0.004, 0.005, 0.0045)],
        [
          [0.0049, 0.0036],
          [0.0055, 0.0033],
          [0.0031, 0.0016],
        ],
        cortex,
        { across: outward, rows: 7, sides: 9 },
      );
    });
}

export function repairScanJoints(rig, parts, fitted, part) {
  const first = parts.length;
  addCartilage(rig, fitted, part);
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    const fore = rig['forearm' + side];
    addElbow(rig, side === 'L' ? 'LEFT' : 'RIGHT', fitted, {
      s: sign,
      fore,
      elbow: fore.getWorldPosition(new Vector3()),
      wrist: rig['hand' + side].getWorldPosition(new Vector3()),
      headCenter: rig['upperArm' + side].getWorldPosition(new Vector3()),
    }, part);
  }
  for (const entry of parts.slice(first)) entry.source = 'Procedural reconstruction';
}
