// Sip-Stack · Village — teaching pins (original Sip Studies wording).
// Each pin: n, chart (Outline link), t (title), b (note), at (anchor), hit (click volumes), act (what tapping changes).
export const LANES = {
  white: { name: 'White', color: '#e8dfb4' },
  rose: { name: 'Rosé', color: '#e49a9a' },
  red: { name: 'Red', color: '#7a2232' },
  sparkling: { name: 'Champagne', color: '#cdb46a' },
  fortified: { name: 'Fortified', color: '#8a5426' },
};
export const LANE_X = { white: 2.9, rose: 4.5, red: 6.1, sparkling: 7.7, fortified: 9.3 };
const door = (id, n, t, b, up) => ({
  id, n, chart: '05', t, b, lane: id, zoom: 2.1,
  at: [LANE_X[id], up ? 5.75 : 5.05, -4.25],
  hit: [[LANE_X[id] - .6, LANE_X[id] + .6, 3, 4.6, -4.6, -2.9]],
});
export const PINS = [
  { id: 'terraces', n: 1, chart: '01', t: 'Steps that hold the hill',
    b: 'Each stone-backed step keeps topsoil from sliding toward the sea and slows hard rain so it soaks in instead of running off. Rows follow the contour, so every vine gets morning sun and a breeze through its leaves.',
    at: [4.2, 6.7, -6], hit: [[2, 10, 5, 6.2, -7.5, -4.6]] },
  { id: 'drip', n: 2, chart: '01', t: 'Water the roots, not the leaves',
    b: 'A thin line along each row drips at the foot of the vine only when the soil runs dry. Wet leaves invite mildew; a damp root zone keeps roots reaching down. Tap to switch the drip and watch where the water lands.',
    at: [3.3, 8.3, -8.7], hit: [[2, 6, 7, 8.1, -10, -7.6]] },
  { id: 'soil', n: 3, chart: '01', t: 'Read the cut', slab: true,
    b: 'Slide the corner slab out to see the hillside in section: dark topsoil, stony subsoil, then rock. Roots follow the cracks down toward stored water, which is how terraced vines ride out a dry summer.',
    at: [8.2, 8.7, -8.8], hit: [[6, 10, -0.9, 8, -10, -7.5]] },
  door('white', 4, 'White lane · press first', 'White grapes go to the press soon after picking, and the juice leaves the skins right away. Clean, cool juice ferments on its own so the fruit stays bright and fresh.', false),
  door('rose', 5, 'Rosé lane · a short visit with the skins', 'Red grapes rest with their juice for a few hours, just long enough to tint it. The color is a choice made by the clock; then the juice is pressed off and fermented much like a white.', true),
  door('red', 6, 'Red lane · the skins stay in', 'Crushed red grapes ferment with skins and seeds together. The skins float up into a cap, and pushing it back down keeps it wet so color and grip move into the wine.', false),
  door('sparkling', 7, 'Champagne lane · the second ferment', 'A finished still wine is bottled with a little sugar and yeast and sealed. The bubbles are born inside the bottle. Slow turns in the rack walk the spent yeast to the neck so it can be taken out.', true),
  door('fortified', 8, 'Fortified lane · spirit sets the pace', 'Grape spirit is added during or after fermentation, which stops the yeast and lifts the strength. In a solera, a little wine is drawn from the oldest row and topped up from younger rows, so the years blend.', false),
  { id: 'rinse', n: 9, chart: '07', t: 'Rinse water gets a second job',
    b: 'Water from washing barrels, crates, and the deck collects in a settling tank instead of running into the harbor. Once settled and cleaned, it climbs back to wash the yard again. Tap to compare the loop with a straight spill.',
    zoom: 2, at: [9.1, 2.9, -0.7], hit: [[7.4, 9.8, 1, 2.4, -1.4, -0.3]] },
  { id: 'cases', n: 10, chart: '07', t: 'Lighter cases, lighter wake',
    b: 'Every case the boat carries costs fuel. Lighter bottles and returnable crates fit more wine into each trip and leave less waste behind. Tap to load the boat or bring the cases back to the quay.',
    zoom: 2, at: [8.3, 2.1, 7.9], hit: [[7.1, 9.5, .2, 1.4, 7.3, 8.7], [5.9, 7.3, 1, 2, -.6, .6]] },
  { id: 'table', n: 11, chart: '09', t: 'Water first, then the wine',
    b: 'At the harbor table every guest is offered a glass of water before the first pour. Hospitality starts with care, then the wine tells its story. Culture · Credible · Catalyze · Legacy.',
    zoom: 3.2, at: [-6.6, 2.5, .5], hit: [[-7.3, -5.9, 1, 2.3, -.1, 1.2]] },
];
export const CHART_NAMES = { '01': 'Vineyard', '05': 'Making Styles', '07': 'Bottle to Shelf', '09': 'Table Service' };
