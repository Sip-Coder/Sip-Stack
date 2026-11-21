// Hummin batches his production shell by joint, finish and garment registration.
// Reassemble the original castings and mechanisms from their connected patches.
// In each cylinder the barrel and two end caps are separate indexed islands.
const shell = (name) => ({ name, layer: 'skin' });
const frame = (name) => ({ name, layer: 'skeleton' });
const drive = (name) => ({ name, layer: 'muscles' });
const kit = (name) => ({ name, layer: 'clothes' });
const half = (x) => (x > 0 ? 'Left' : 'Right');
const catalogs = new WeakMap();
const clothes = {
  bib: 'Denim apron bib',
  badgePocket: 'Emblem patch pocket',
  apronSkirt: 'Denim apron skirt',
  strapL: 'Left apron strap',
  strapR: 'Right apron strap',
  toolPocket: 'Double tool pocket',
  penPocket: 'Pen sleeve',
  towel: 'Folded service cloth',
  wrench: 'Open-end wrench',
  corkscrew: 'Corkscrew',
  pen: 'Inspection pen',
  belt: 'Waist belt',
  frontBelt: 'Front belt and buckle',
  pouchL: 'Left leather pouch',
  pouchR: 'Right leather pouch',
  rearPack: 'Rear pack',
  scarf: 'Knitted scarf collar',
  scarfTail: 'Scarf tail',
};

function catalog(rig) {
  const registered = new Map(),
    mounts = new Map();
  for (const [id, pieces] of Object.entries(rig.garments.surfaces)) {
    for (const mesh of pieces) {
      registered.set(mesh, id);
      // Trim, stitches and clasps are separate material draws under these frames.
      if (
        ['pouchL', 'pouchR', 'rearPack', 'badgePocket', 'bib', 'strapL', 'toolPocket'].includes(id) &&
        mesh.name !== 'Rear mounting pad'
      )
        mounts.set(mesh.parent, id);
    }
  }
  const value = { registered, mounts };
  catalogs.set(rig, value);
  return value;
}

function headPart(c, id, mat, receiver, antenna) {
  const p = c.objectCenter;
  if (receiver) return shell(half(receiver.position.x) + ' service receiver');
  if (antenna) return shell('Receiver antenna');
  if (id === 'head') return shell('Ceramic helmet dome');
  if (mat === 'visor') return shell('OLED visor and eye display');
  if (mat === 'rubber' || (mat === 'steel' && c.index === 0)) return shell('Visor bezel and seal');
  if (mat === 'brass') return shell('Rear service badge');
  if (p.z < -0.06) return shell(mat === 'darkMetal' ? 'Rear helmet vents' : 'Rear service fasteners');
  if (p.z < 0) return shell('Helmet panel seams');
  if (mat === 'darkMetal' && Math.abs(p.x) < 0.02) return shell('Chin smile inset');
  return shell('Visor fasteners');
}

function handPart(side, mat, i, fine) {
  const name = side + ' ';
  if ((mat === 'darkMetal' && !fine && i < 3) || (mat === 'rubber' && i < 2))
    return drive(name + 'wrist bearing and bellows');
  if (mat === 'pearl' && i === 0) return shell(name + 'palm casting');
  if ((mat === 'pearl' && i === 13) || (mat === 'ceramicRim' && i === 20))
    return shell(name + 'thumb plates');
  if (mat === 'darkMetal' && !fine && i >= 7) return drive(name + 'thumb flexure');
  // Four sequential fingers. The index sits next to the thumb on either hand.
  let finger;
  if (mat === 'pearl') finger = Math.floor((i - 1) / 3);
  else if (mat === 'ceramicRim') finger = Math.floor(i / 5);
  else if (mat === 'steel' || fine) finger = Math.floor(i / 6);
  else finger = i - (mat === 'rubber' ? 2 : 3);
  if (side === 'Right') finger = 3 - finger;
  const digit = ['index', 'middle', 'ring', 'little'][finger];
  if (!digit) throw new Error('Unexpected Hummin finger island ' + i + ' in ' + mat);
  return mat === 'pearl' || mat === 'ceramicRim' || fine
    ? shell(name + digit + ' finger plates')
    : drive(name + digit + ' finger hinge');
}

function limbPart(joint, mesh, c, mat) {
  const side = joint.endsWith('L') ? 'Left' : 'Right',
    prefix = side + ' ';
  const i = c.index,
    fine = mesh.userData.highDetail;
  const kind = joint.slice(0, -1);
  if (kind === 'hand') return handPart(side, mat, i, fine);
  if (kind === 'upperArm') {
    if (mat === 'rubber') return drive(prefix + 'shoulder ball bearing');
    if (mat === 'darkMetal' && !fine && i >= 1 && i <= 3) return frame(prefix + 'upper-arm spar');
    if (
      mesh.name.startsWith('pauldron') ||
      mat === 'cyan' ||
      (mat === 'darkMetal' && !fine && i === 4) ||
      (mat === 'steel' && i === 8)
    )
      return shell(prefix + 'shoulder armor');
    return shell(prefix + (mat === 'pearl' && i === 0 ? 'upper-arm casting' : 'upper-arm service panel'));
  }
  if (kind === 'forearm') {
    if (mat === 'darkMetal' && !fine && i >= 3 && i <= 5) return frame(prefix + 'forearm spar');
    if (
      mat === 'rubber' ||
      mat === 'brass' ||
      (mat === 'steel' && i < 6) ||
      (mat === 'darkMetal' && !fine && (i < 3 || i >= 8))
    )
      return drive(prefix + 'elbow hinge and bellows');
    return shell(prefix + (mat === 'ceramicRim' ? 'forearm casting' : 'forearm service panel'));
  }
  if (kind === 'thigh') {
    if (mat === 'darkMetal' && !fine && i === 0) return drive(prefix + 'hip ball bearing');
    if (mat === 'darkMetal' && !fine && i >= 1 && i <= 3) return frame(prefix + 'thigh spar');
    return shell(prefix + (mat === 'pearl' && i === 0 ? 'thigh casting' : 'thigh service panel'));
  }
  if (kind === 'shin') {
    if (
      mesh.name.startsWith('hinge') ||
      mat === 'brass' ||
      mat === 'rubber' ||
      (mat === 'steel' && i >= 2 && i <= 7) ||
      (mat === 'darkMetal' && !fine && i < 2)
    )
      return drive(prefix + 'knee hinge and bellows');
    if (mat === 'darkMetal' && !fine && i >= 4 && i <= 6) return frame(prefix + 'shin spar');
    if (mat === 'steel' && i >= 15) return drive(prefix + 'rear calf pushrod');
    if (
      (mat === 'pearl' && i === 0) ||
      (mat === 'steel' && i === 0) ||
      (mat === 'darkMetal' && !fine && (i === 2 || i === 3))
    )
      return shell(prefix + 'kneecap');
    return shell(prefix + (mat === 'pearl' && i === 1 ? 'shin casting' : 'shin service panel'));
  }
  if (kind === 'foot') {
    if (mat === 'steel' || (mat === 'darkMetal' && i === 0)) return drive(prefix + 'ankle ball and cuff');
    if (mat === 'cyan' || mat === 'darkMetal') return shell(prefix + 'toe lamp and gasket');
    return shell(prefix + (mat === 'rubber' ? 'boot outsole' : 'ceramic toe casting'));
  }
  throw new Error('Unknown Hummin joint ' + joint);
}

export function describeHummin(rig, mesh, c) {
  const { registered, mounts } = catalogs.get(rig) ?? catalog(rig);
  const id = registered.get(mesh),
    mat = c.material.userData.blueprintId;
  if (clothes[id]) {
    if (mesh.name === 'Scarf tassels') return kit('Scarf fringe');
    if (mesh.name === 'Rear mounting pad') return kit('Rear pack mounting pads');
    return kit(clothes[id]);
  }
  if (mat === 'berry' || mesh.name.startsWith('Embroidered grape bib'))
    return kit('Embroidered grape crest');
  let joint, receiver, antenna, mount;
  for (let node = mesh; node; node = node.parent) {
    if (node.name === 'Service receiver') receiver = node;
    if (node === rig.secondary.hummin.antenna) antenna = true;
    if (!mount && mounts.has(node)) mount = mounts.get(node);
    if (rig[node.name] === node) {
      joint = node.name;
      break;
    }
  }
  const p = c.objectCenter;
  if (joint === 'head') return headPart(c, id, mat, receiver, antenna);
  if (joint === 'chest') {
    if (id === 'chassis')
      return c.index === 0 ? shell('Chest shell') : frame(half(p.x) + ' shoulder tie rod');
    if (mount === 'rearPack') return kit('Rear pack');
    if (mat === 'emblem') return kit('Emblem patch pocket');
    // Each pocket carries the same stitch pattern. The left shoulder harness
    // crosses over to the right rear hip; island order keeps its trim attached.
    if (mount === 'toolPocket') return kit(c.index < c.count / 2 ? 'Double tool pocket' : 'Pen sleeve');
    if (mount === 'strapL') return kit(c.index < c.count / 2 ? 'Left apron strap' : 'Right apron strap');
    if (mat === 'stitch') return kit('Denim apron bib');
    if (mat === 'rubber' || mat === 'steel') {
      return p.y > 0.145 ? drive('Neck swivel bearing and bellows') : shell('Rear chest cover fasteners');
    }
    if (mat === 'darkMetal') return shell('Rear chest vents');
  }
  if (joint === 'hips') {
    if (id === 'pelvis') return shell('Pelvic housing');
    if (mat === 'rubber') return drive('Waist swivel bellows');
    if (mount === 'pouchL' || mount === 'pouchR') return kit(clothes[mount]);
    if (mat === 'brass') return kit('Front belt and buckle');
  }
  if (joint && /[LR]$/.test(joint)) return limbPart(joint, mesh, c, mat);
  throw new Error('Unregistered Hummin assembly ' + [joint, id, mat, mount].join('/'));
}
