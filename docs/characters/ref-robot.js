// These are inputs to Hummin's live visor controller. Its OLED shader draws
// the phosphor curves, eyelids and smile; the sheet never redraws a face.
const displayFrames = {
  neutral: { state: 'idle', time: 2, emote: -1, speed: 0 },
  surprised: { state: 'jump', time: 2, emote: -1, speed: 0 },
  focused: { state: 'run', time: 2, emote: -1, speed: 3.5 },
  wink: { state: 'idle', time: 2, emote: 0.22, speed: 0 },
  hearts: { state: 'idle', time: 2, emote: 0.55, speed: 0 },
  roll: { state: 'roll', time: 2, emote: -1, speed: 0 },
  sleepy: { state: 'idle', time: 9.2, emote: -1, speed: 0 },
  blink: { state: 'idle', time: 1, emote: -1, speed: 0 },
};
export const robotExpressions = Object.keys(displayFrames);
export function robotExpressionFrame(key) {
  if (!Object.hasOwn(displayFrames, key)) throw new Error('Unknown Hummin display pose: ' + key);
  return { ...displayFrames[key] };
}

// Every entry names connected geometry in the live model's Axon View catalog.
// A multi-part bound keeps sewn trim and hardware in the same camera study.
export const robotTargets = {
  head: ['Ceramic helmet dome', 'Right service receiver', 'Left service receiver', 'Receiver antenna'],
  face: ['OLED visor and eye display', 'Visor bezel and seal'],
  forearmPlate: ['Right forearm service panel', 'Right forearm casting'],
  elbow: ['Right elbow hinge and bellows'],
  bibPatch: ['Embroidered grape crest', 'Emblem patch pocket'],
  scarfWeave: ['Knitted scarf collar'],
  fringe: ['Scarf fringe'],
  toolRoll: ['Double tool pocket', 'Pen sleeve', 'Open-end wrench', 'Corkscrew', 'Inspection pen'],
  beltPouch: ['Right leather pouch'],
  pack: ['Rear pack', 'Rear pack mounting pads'],
  boot: ['Left ceramic toe casting', 'Left boot outsole', 'Left ankle ball and cuff'],
  toe: ['Left toe lamp and gasket'],
  ear: ['Left service receiver'],
  antenna: ['Receiver antenna'],
};

export const robotGroups = [
  {
    id: 'materials',
    title: 'Details & materials',
    panels: [
      { id: 'ceramic', label: 'Ceramic forearm plate', target: 'forearmPlate', yaw: -0.72, elevation: 0.1 },
      {
        id: 'joint',
        label: 'Elbow hinge & bellows',
        target: 'elbow',
        yaw: -1.46,
        elevation: 0.08,
        padding: 1.65,
      },
      {
        id: 'bib',
        label: 'Embroidered denim pocket',
        target: 'bibPatch',
        yaw: -0.1,
        elevation: 0.04,
        padding: 1.4,
      },
      { id: 'knit', label: 'Knitted scarf collar', target: 'scarfWeave', yaw: -0.32, elevation: -0.06 },
    ],
  },
  {
    id: 'accessories',
    title: 'Accessories',
    panels: [
      {
        id: 'tools',
        label: 'Wrench, corkscrew & pen',
        target: 'toolRoll',
        yaw: -0.22,
        elevation: 0.22,
        padding: 1.34,
      },
      {
        id: 'pouch',
        label: 'Leather belt pouch',
        target: 'beltPouch',
        yaw: -0.51,
        elevation: 0.12,
        padding: 1.55,
      },
      { id: 'fringe', label: 'Scarf fringe', target: 'fringe', yaw: 0.55, elevation: 0, padding: 2.2 },
      {
        id: 'pack',
        label: 'Rear service pack',
        target: 'pack',
        yaw: Math.PI + 0.29,
        elevation: 0.1,
        padding: 1.35,
      },
    ],
  },
  {
    id: 'footwear',
    title: 'Footwear',
    panels: [
      {
        id: 'foot',
        label: 'Boot casting & sole',
        target: 'boot',
        yaw: 1.83,
        elevation: 0.05,
        padding: 1.32,
      },
      { id: 'toe', label: 'Toe lamp & gasket', target: 'toe', yaw: 0.24, elevation: 0.16, padding: 1.45 },
    ],
  },
  {
    id: 'receivers',
    title: 'Antenna & receivers',
    panels: [
      {
        id: 'receiver',
        label: 'Receiver & cyan ring',
        target: 'ear',
        yaw: 1.39,
        elevation: 0.06,
        padding: 1.44,
      },
      {
        id: 'antenna',
        label: 'Receiver antenna',
        target: 'antenna',
        yaw: 2.09,
        elevation: 0.1,
        padding: 1.75,
      },
    ],
  },
];

export const robotPalette = [
  { label: 'Pearl enamel', target: 'Ceramic helmet dome', materialId: 'pearl' },
  { label: 'Visor glass', target: 'OLED visor and eye display', materialId: 'visor' },
  { label: 'Cyan lamp', target: 'Left toe lamp and gasket', materialId: 'cyan' },
  { label: 'Scarf knit', target: 'Knitted scarf collar', materialId: 'scarf' },
  { label: 'Apron denim', target: 'Denim apron bib', materialId: 'denim' },
  { label: 'Pouch leather', target: 'Right leather pouch', materialId: 'leather' },
];
