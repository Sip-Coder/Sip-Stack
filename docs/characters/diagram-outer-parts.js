// Labels follow the actual explorer sewing patterns and authored facial pieces.
// The compact Roma builder merges individual patches by parent and finish. Its
// vertex pigments, joint, and original patch order distinguish those pieces.
const skin = (name) => ({ name, layer: 'skin' });
const kit = (name) => ({ name, layer: 'clothes' });
const sideName = (x) => (x > 0 ? 'Left' : 'Right');

// World-space observer positions include travel and heading. Measure the
// lateral coordinate along the posed actor's own anatomical axis in metres.
function anatomicalX(rig, point) {
  const m = rig.root.matrixWorld.elements;
  return (
    ((point.x - m[12]) * m[0] + (point.y - m[13]) * m[1] + (point.z - m[14]) * m[2]) /
    Math.hypot(m[0], m[1], m[2])
  );
}

export function describeRoma(rig, mesh, c) {
  const id = mesh.name.replace(/^Roma /, ''),
    { index: i, color, objectCenter: p } = c;
  const side = sideName(anatomicalX(rig, c.worldCenter));
  if (id.startsWith('eye ')) {
    const labels = ['sclera', 'iris rim', 'iris', 'pupil', 'catchlights', 'catchlights', 'upper eyelash'];
    return skin(side + ' ' + labels[i]);
  }
  if (id.startsWith('brow ')) return skin(side + ' eyebrow');
  if (id === 'smile') return skin(['Mouth opening', 'Teeth', 'Lower lip', 'Upper lip'][i]);
  if (id === 'face and band') {
    if (c.material.metalness > 0.1) return kit(side + ' hoop earring');
    if (color === 'b94442' || color === 'e5bf8b') return kit('Embroidered headband');
    if (color === '572d32') return skin('Nostrils');
    return skin(Math.abs(p.x) > 0.05 ? side + ' ear' : 'Face');
  }
  if (id.includes('waves')) return skin(side + ' ' + id.split(' ')[0] + ' waves');
  if (id.includes('crown')) return skin('Parted crown and fringe');
  if (id.startsWith('hand'))
    return color === 'd5956e' ? skin(side + ' hand') : kit(side + ' beaded bracelet');
  if (id.startsWith('upperArm')) return kit(side + ' sleeve embroidery');
  if (id === 'field backpack') {
    if (c.material.metalness > 0.1) return kit(i < 2 ? side + ' pack fastener' : 'Pack badges');
    return kit(['Backpack case', 'Backpack flap', 'Right pack tab', 'Left pack tab', 'Backpack handle'][i]);
  }
  if (id === 'chest') {
    if (color === 'd5956e') return skin('Neck');
    if (color === '855932') return kit(side + ' shoulder strap');
    if (color === 'ddcbb1') return kit('Rolled hood');
    if ((color === 'eee1cd' || color === 'b18e53') && Math.abs(p.x) > 0.012)
      return kit(side + ' hood drawcord');
    return kit('Compass pendant and chain');
  }
  if (id.startsWith('foot'))
    return kit(
      side + ' ' + (['shoe sole', 'shoe upper', 'toe cap'][i] ?? (i === 7 ? 'shoe piping' : 'shoelaces')),
    );
  if (id.startsWith('pocket')) return kit(side + ' cargo pocket' + (i === 1 ? ' flap' : ''));
  if (id === 'crossbody pouch')
    return kit(c.material.metalness > 0.1 ? 'Pouch snap' : i === 0 ? 'Crossbody pouch' : 'Pouch flap');
  if (id === 'hips')
    return kit(
      color === '285b51' ? 'Trouser waistband' : color === '855932' ? 'Leather belt' : 'Belt buckle',
    );
  if (id === 'tailored explorer clothes') {
    if (color === 'eee1cd') return kit('Hoodie body');
    if (color === '69452f') return kit('Crossbody strap');
    if (color === '49766a') return kit(side + ' jogger leg');
    return kit(Math.abs(p.x) < 0.02 ? 'Field jacket body' : side + ' jacket sleeve');
  }
  throw new Error('Unregistered Roma mesh: ' + mesh.name);
}

export function sippyCatalog(rig) {
  const surfaces = new Map();
  for (const [id, pieces] of Object.entries(rig.garments.surfaces))
    for (const mesh of pieces) surfaces.set(mesh, id);
  const label = {
    shirt: 'T-shirt body',
    hoodie: 'Hoodie body',
    'trouser-rise': 'Trouser waistband',
    'quilted-vest': 'Quilted vest',
    collar: 'Standing collar',
    hood: 'Folded hood',
  };
  return (_rig, mesh, c) => {
    const id = surfaces.get(mesh),
      mat = c.material.userData.blueprintId,
      p = c.worldCenter;
    const x = anatomicalX(rig, p),
      side = sideName(x),
      named = [];
    for (let n = mesh; n; n = n.parent) if (n.name) named.push(n.name);
    const path = named.join('/'),
      name = mesh.name;
    if (id === 'body') return skin('Continuous body, limbs and hands');
    if (id === 'body-head') return skin('Face');
    if (path.includes('sippy-head/')) {
      if (path.includes('sippy-brow')) return skin(side + ' eyebrow');
      if (path.includes('sippy-quiff-')) {
        const no = Number(/sippy-quiff-(\d+)/.exec(path)[1]);
        return skin('Quiff lock ' + (no + 1));
      }
      if (path.includes('sippy-taper-')) {
        const [, s, i] = /sippy-taper-(-?1)-(\d+)/.exec(path);
        return skin(sideName(Number(s)) + ' tapered lock ' + (Number(i) + 1));
      }
      if (/sippy-face-[LR]/.test(path)) return skin(side + ' forelock');
      if (mat === 'hair') return skin(Math.abs(x) > 0.1 ? side + ' sideburn' : 'Scalp and crest');
      if (mat === 'sclera')
        return skin(c.material.userData.blueprintSamples ? side + ' cornea and iris' : 'Teeth');
      if (mat === 'mouth') return skin('Mouth opening');
      if (mat === 'lips') return skin(c.objectCenter.y > 0.033 ? 'Upper lip' : 'Lower lip');
      if (Array.isArray(mesh.material))
        return skin(
          side + (mesh.material[0].userData.blueprintId === 'pupil' ? ' upper eyelid' : ' lower eyelid'),
        );
      if (mesh.parent.parent?.name === 'sippy-head') return skin(side + ' orbital rim');
      if (Math.abs(x) > 0.1) return skin(side + ' ear');
      if (Math.abs(x) < 0.027) return skin(mat === 'flush' ? 'Nostrils' : 'Nose');
      return skin(side + ' cheek freckles');
    }
    if (named.some((n) => /^hand[LR]$/.test(n))) return skin(side + ' fingernails and knuckles');
    if (label[id]) return kit(label[id]);
    if (id === 'cargo-pockets') return kit(side + ' cargo pocket');
    if (id === 'backpack-straps') return kit(side + ' shoulder strap');
    if (id?.startsWith('shirtsleeve-')) return kit(side + ' T-shirt sleeve');
    if (id?.startsWith('sleeve-')) return kit(side + ' hoodie sleeve');
    if (id?.startsWith('shoulder-')) return kit(side + ' shoulder yoke');
    if (id?.startsWith('trousers-'))
      return kit(side + (name.includes('seat') ? ' trouser seat panel' : ' trouser leg'));
    if (id === 'split-back') return kit(side + ' split vest hem');
    if (id === 'zipper-plackets' || name.includes('topstitch') || name.includes('front-binding'))
      return kit(side + ' zipper and binding');
    if (path.includes('Embroidered sleeve vine')) return kit(side + ' sleeve embroidery');
    if (path.includes('Sippy hood drawcords')) return kit(side + ' hood drawcord');
    if (path.includes('headphones')) {
      if (Math.abs(x) < 0.04) return kit('Headphone band');
      return kit(side + (mat === 'pad' ? ' headphone cushion' : ' headphone cup and emblem'));
    }
    if (path.includes('Sippy explorer backpack')) {
      if (id === 'backpack') return kit('Leather backpack case');
      if (path.includes('Curved satchel flap')) return kit('Curved backpack flap');
      if (Math.abs(x) > 0.028) return kit(side + ' pack buckle and tab');
      return kit(mat === 'leather' ? 'Backpack handle' : 'Backpack piping');
    }
    if (named.some((n) => /^forearm[LR]$/.test(n))) {
      if (mat === 'cuff' || mat === 'hoodie') return kit(side + ' ribbed wrist cuff');
      return kit(mat === 'leather' ? 'Wristwatch strap' : 'Wristwatch dial and case');
    }
    if (named.some((n) => /^foot[LR]$/.test(n))) {
      if (mat === 'trousers') return kit(side + ' gathered ankle cuff');
      if (mat === 'shirt') return kit(side + ' sock');
      if (mat === 'shoe') return kit(side + ' sneaker upper and tongue');
      if (c.triangles === 60 && p.y - rig.root.matrixWorld.elements[13] > 0.07) return kit(side + ' shoelaces');
      return kit(side + ' sneaker sole and panels');
    }
    throw new Error('Unregistered Sippy mesh: ' + path);
  };
}
