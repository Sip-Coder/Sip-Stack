// Targets are the names of visible parts in Axon View. The reference model
// supplies their posed bounds and samples the actual finishes for each swatch.
import { heights, labels, names } from './ui.js';
import { robotExpressions, robotGroups, robotPalette } from './ref-robot.js';

const standardExpressions = [
  ['neutral', 'Neutral'],
  ['smile', 'Smile'],
  ['laugh', 'Laugh'],
  ['excited', 'Excited'],
  ['curious', 'Curious'],
  ['thinking', 'Thinking'],
  ['surprised', 'Surprised'],
  ['focused', 'Focused'],
  ['wink', 'Wink'],
  ['confident', 'Confident'],
];
const displayLabels = { hearts: 'Heart eyes', roll: 'Roll spiral', sleepy: 'Sleepy', blink: 'Blink' };

const profiles = {
  sippy: {
    role: 'Beverage explorer and guide',
    age: 'Late 20s to early 30s',
    build: 'Lean and long-limbed',
    personality: 'Curious, approachable and creative',
  },
  roma: {
    role: 'Learning guide and beverage explorer',
    age: '20s to 30s',
    build: 'Compact with rounded shoulders',
    personality: 'Curious, inclusive and energetic',
  },
  hummin: {
    role: 'AI sommelier and beverage companion',
    age: 'Service age unrecorded',
    build: 'Broad shell with articulated limbs',
    personality: 'Curious, helpful, analytical and playful',
  },
};

const romaExpressions = [
  ['neutral', 'Neutral'], ['smile', 'Happy'], ['curious', 'Curious'],
  ['surprised', 'Surprised'], ['thinking', 'Thinking'], ['wink', 'Wink'],
  ['laugh', 'Laugh'], ['focused', 'Focused'], ['determined', 'Determined'],
];

const views = [
  ['front', 'Front'],
  ['three-quarter', '¾ front'],
  ['right', 'Right side'],
  ['back', 'Back'],
  ['rear-three-quarter', '¾ back'],
];

const faceViews = [
  views[0], views[1], ['profile', 'Profile'], views[4], ['upward', 'Upward angle'],
];

const modes = [
  ['wireframe', 'Wireframe'],
  ['diffuse', 'Solid (diffuse)'],
  ['clay', 'Clay'],
  ['topology', 'Topology'],
];

function panel(id, label, target, options) {
  return { id, label, target, view: 'front', mode: 'color', expression: 'neutral', available: true, ...options };
}

function group(id, title, panels) {
  return { id, title, panels };
}

// Detail cameras look toward the part from its exposed side. Anatomical left
// is +X on the live rigs; a positive yaw brings that side toward the camera.
function detail(id, label, target, yaw = 0, elevation = 0) {
  return panel(id, label, target, { yaw, elevation });
}

const sippyGroups = [
  group('materials', 'Details & materials', [
    detail('collar', 'Standing collar', 'Standing collar', 0.36, 0.19),
    detail('binding', 'Zipper binding', 'Left zipper and binding', 0.20),
    detail('vine', 'Grapevine embroidery', 'Left sleeve embroidery', 1.32),
    detail('quilt', 'Diamond quilting', 'Quilted vest', -0.27, 0.06),
    detail('hem', 'Split vest hem', 'Left split vest hem', 2.56, -0.12),
    detail('cargo', 'Cargo pocket stitching', 'Left cargo pocket', 1.24, 0.08),
  ]),
  group('accessories', 'Accessories', [
    detail('headphone', 'Headphone cup', 'Left headphone cup and emblem', 0.97, 0.06),
    detail('watch', 'Wristwatch', 'Wristwatch dial and case', 1.43, 0.17),
    detail('backpack', 'Leather backpack', 'Leather backpack case', 2.76, 0.08),
  ]),
  group('footwear', 'Footwear', [
    detail('trainer', 'Laced trainer', 'Left sneaker upper and tongue', 0.56, 0.23),
    detail('sole', 'Layered sole', 'Left sneaker sole and panels', 1.32, -0.14),
  ]),
  group('hair', 'Hair', [
    detail('quiff', 'Swept quiff', 'Scalp and crest', 0.57, 0.21),
    detail('forelock', 'Tapered forelock', 'Forelock crest', -0.63, 0.09),
  ]),
];

const romaGroups = [
  group('materials', 'Details & materials', [
    detail('hood', 'Folded cream hood', 'Rolled hood', 0, 0.47),
    detail('jacket', 'Field jacket panels', 'Field jacket body', -0.37, 0.03),
    panel('vine', 'Sleeve embroidery (isolated)', 'Left sleeve embroidery', { yaw: 1.35, isolate: true }),
    panel('cargo', 'Bellows pocket flap', 'Left cargo pocket flap', { yaw: 1.28, elevation: 0.09, expression: 'smile' }),
    detail('buckle', 'Belt buckle', 'Belt buckle', 0.08),
  ]),
  group('accessories', 'Accessories', [
    detail('compass', 'Compass pendant', 'Compass pendant and chain', 0.16),
    detail('fieldbag', 'Crossbody field bag', 'Crossbody pouch', -1.28, 0.05),
    detail('backpack', 'Backpack flap', 'Backpack flap', 2.9, 0.12),
    detail('beads', 'Beaded bracelet', 'Left beaded bracelet', 1.18, 0.16),
  ]),
  group('footwear', 'Footwear', [
    detail('trainer', 'Purple high-top', 'Left shoe upper', 0.58, 0.22),
    detail('sole', 'Cream sole', 'Left shoe sole', 1.30, -0.15),
  ]),
  group('hair', 'Hair & headband', [
    detail('headband', 'Embroidered headband', 'Embroidered headband', -0.63, 0.28),
    detail('waves', 'Face-framing waves', 'Left temple waves', 0.82, 0.12),
  ]),
];

function swatch(label, target, materialId) {
  return { label, target, ...(materialId ? { materialId } : {}) };
}

const palettes = {
  sippy: [
    swatch('Charcoal quilt', 'Quilted vest', 'quilt'),
    swatch('Burgundy fleece', 'Left hoodie sleeve', 'hoodie'),
    swatch('Cream twill', 'Left trouser leg', 'trousers'),
    swatch('Dark chestnut', 'Scalp and crest', 'hair'),
    swatch('Saddle leather', 'Leather backpack case', 'leather'),
    swatch('Brass', 'Left headphone cup and emblem', 'gold'),
  ],
  roma: [
    swatch('Mustard canvas', 'Field jacket body'),
    swatch('Emerald twill', 'Left jogger leg'),
    swatch('Cream knit', 'Rolled hood'),
    swatch('Plum leather', 'Left shoe upper'),
    swatch('Woven red', 'Embroidered headband'),
    swatch('Chocolate brown', 'Left temple waves'),
    swatch('Field leather', 'Backpack flap'),
  ],
  hummin: robotPalette,
};

function expressionPanels(name) {
  const entries = name === 'roma' ? romaExpressions : standardExpressions;
  const requested = entries.map(([id, label]) =>
    panel('expression-' + id, label, 'face', { expression: id, available: name !== 'hummin' || robotExpressions.includes(id) }),
  );
  if (name === 'hummin') {
    for (const id of robotExpressions) {
      if (Object.hasOwn(displayLabels, id))
        requested.push(panel('expression-' + id, displayLabels[id], 'face', { expression: id }));
    }
  }
  return requested;
}

function standingHeight(metres) {
  const inches = Math.round(metres / 0.0254);
  return Math.floor(inches / 12) + ' ft ' + (inches % 12) + ' in';
}

export function sheetFor(name) {
  const i = names.indexOf(name);
  if (i < 0) throw new Error('Unknown Character Ref model: ' + name);
  const robot = name === 'hummin';
  const details = robot
    ? robotGroups.map(({ id, title, panels }) =>
        group(id, title, panels.map((item) => panel(item.id, item.label, item.target, item))))
    : name === 'sippy' ? sippyGroups : romaGroups;
  return {
    name,
    label: labels[i],
    profile: { ...profiles[name], height: standingHeight(heights[i]) },
    palette: palettes[name],
    portrait: panel('portrait', 'Full-length portrait', 'body', { yaw: -0.32, elevation: 0.025 }),
    groups: [
      group('turnaround', 'Turnaround', views.map(([view, label]) =>
        panel('turn-' + view, label, 'body', { view }))),
      group('modes', 'Render modes', modes.map(([mode, label]) =>
        panel('mode-' + mode, label, 'body', { mode, view: 'three-quarter', showTriangles: true }))),
      group('face', robot ? 'Visor & head study' : 'Face study', faceViews.map(([view, label]) =>
        panel('face-' + view, label, 'head', { view, padding: robot ? 1.13 : 1.08 }))),
      group('expressions', robot ? 'Display expressions' : 'Expressions', expressionPanels(name)),
      ...details,
    ],
  };
}
