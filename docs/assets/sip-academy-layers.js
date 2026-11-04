// Academy-only story layers drawn on top of a World isometric scene.
// Screen space inside the scene viewBox (-12 -4 264 198). Original Sip Studies.

const ink = '#2a221d';
const clay = '#914C2C';
const teal = '#1A5552';
const sand = '#EDD4A8';
const mauve = '#817985';
const wood = '#8a5a36';
const grape = '#6a2030';

const WHO = {
  sippy: { fill: teal, name: 'Sippy' },
  roma: { fill: clay, name: 'Roma' },
  hummin: { fill: mauve, name: 'Hummin' },
};

function fig(x, y, who, tool) {
  const fill = WHO[who].fill;
  const toolSvg = {
    shears: `<path d="M${x + 6} ${y - 8} l5 -6 m0 2 l5 1" stroke="${ink}" stroke-width=".9" fill="none"/>`,
    glass: `<path d="M${x + 5} ${y - 20} h5 l1 7 h-7 z" fill="#f4e7c8" stroke="${ink}" stroke-width=".55"/>`,
    book: `<rect x="${x + 5}" y="${y - 18}" width="7" height="5" fill="#fffaf1" stroke="${ink}" stroke-width=".45"/>`,
    punch: `<rect x="${x + 6}" y="${y - 30}" width="1.6" height="14" fill="${wood}"/><ellipse cx="${x + 6.8}" cy="${y - 31}" rx="2.4" ry="1" fill="${clay}"/>`,
    point: `<path d="M${x + 6} ${y - 14} l12 -4" stroke="${clay}" stroke-width="1.1" fill="none"/>`,
    basket: `<path d="M${x + 4} ${y - 6} h7 l-1 4 h-5 z" fill="#c4a574" stroke="${ink}" stroke-width=".45"/>`,
    hose: `<path d="M${x + 6} ${y - 10} q8 4 4 12" stroke="${teal}" stroke-width="1.2" fill="none"/>`,
  }[tool] || '';
  return `<g class="fig">
    <ellipse cx="${x}" cy="${y + 8}" rx="6" ry="1.6" fill="#000" opacity=".16"/>
    <rect x="${x - 2.6}" y="${y - 1}" width="1.8" height="7" rx=".5" fill="#2c3140"/>
    <rect x="${x + .8}" y="${y - 1}" width="1.8" height="7" rx=".5" fill="#2c3140"/>
    <rect x="${x - 3.4}" y="${y - 11}" width="6.8" height="9" rx="1.4" fill="${fill}"/>
    <circle cx="${x}" cy="${y - 14.5}" r="2.8" fill="#e2b08a"/>
    <ellipse cx="${x}" cy="${y - 17}" rx="3" ry="1.1" fill="${sand}"/>
    ${toolSvg}
    <text x="${x}" y="${y + 14}" text-anchor="middle" font-size="4" font-weight="700" fill="${ink}">${WHO[who].name}</text>
  </g>`;
}

function sky(kind) {
  if (kind === 'sun') return `<g class="sky"><circle cx="28" cy="16" r="7" fill="#f0b429"/><path d="M28 4 v4 M28 24 v4 M16 16 h4 M36 16 h4" stroke="#f0b429" stroke-width="1"/></g>`;
  if (kind === 'frost') return `<g class="sky"><rect x="-12" y="-4" width="264" height="36" fill="#e7f2f8" opacity=".55"/><g fill="#fff" opacity=".9">${[12, 28, 46, 70, 96, 120].map(x => `<circle cx="${x}" cy="14" r="1.1"/>`).join('')}</g></g>`;
  if (kind === 'rain') return `<g class="sky" stroke="${teal}" stroke-width=".7" opacity=".8">${[18, 32, 48, 64, 80].map(x => `<path d="M${x} 6 l-3 8"/>`).join('')}</g>`;
  if (kind === 'night') return `<g class="sky"><rect x="-12" y="-4" width="264" height="42" fill="#1c2430" opacity=".28"/><circle cx="210" cy="14" r="2" fill="#f7e7a2"/></g>`;
  if (kind === 'heat') return `<g class="sky"><circle cx="220" cy="14" r="8" fill="#e26a3a" opacity=".9"/></g>`;
  return '';
}

function chip(x, y, text) {
  const w = text.length * 3.15 + 6;
  return `<g class="story-chip"><rect x="${x}" y="${y}" width="${w}" height="8" rx="1.5" fill="${teal}"/><text x="${x + w / 2}" y="${y + 5.5}" text-anchor="middle" font-size="4.2" font-weight="700" fill="#fff">${text}</text></g>`;
}

function plate(x, y, w, h, title) {
  return { x, y, w, h, open: `<g class="plate"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#fffaf1" stroke="${ink}" stroke-width=".7"/><text x="${x + 4}" y="${y + 8}" font-size="5" font-weight="700" fill="${clay}">${title}</text>` , close: '</g>' };
}

function soilCut(big, wet) {
  const p = plate(big ? 132 : 168, big ? 8 : 22, big ? 120 : 84, big ? 168 : 120, wet ? 'ROOTS WET' : 'SOIL CUT');
  const x = p.x + 8, y = p.y + 16, w = p.w - 16;
  const bands = [
    ['#5d4030', 0, 18, 'topsoil'],
    ['#a8784e', 18, 22, 'stone'],
    ['#c4b49a', 40, 28, 'rock'],
  ];
  const roots = `<path d="M${x + 18} ${y} C ${x + 10} ${y + 20}, ${x + 28} ${y + 36}, ${x + 16} ${y + 62}" fill="none" stroke="#e7d3b0" stroke-width="1.4"/>
    <path d="M${x + 40} ${y + 4} C ${x + 48} ${y + 24}, ${x + 30} ${y + 40}, ${x + 46} ${y + 64}" fill="none" stroke="#e7d3b0" stroke-width="1.1"/>`;
  const bulbs = wet ? `<ellipse cx="${x + 22}" cy="${y + 16}" rx="8" ry="3" fill="#7ec8d4" opacity=".85"/><ellipse cx="${x + 48}" cy="${y + 18}" rx="7" ry="2.6" fill="#7ec8d4" opacity=".75"/>` : '';
  const graft = big ? `<rect x="${x + w - 28}" y="${y - 2}" width="4" height="14" fill="${wood}"/><rect x="${x + w - 36}" y="${y + 10}" width="20" height="3" fill="${clay}"/><text x="${x + w - 34}" y="${y + 22}" font-size="3.6" fill="${ink}">graft</text><text x="${x + 4}" y="${y + 78}" font-size="3.6" fill="${ink}">you taste the wood above this line</text>` : '';
  return p.open + bands.map(([c, dy, h, name]) => `<rect x="${x}" y="${y + dy}" width="${w}" height="${h}" fill="${c}"/><text x="${x + 3}" y="${y + dy + 8}" font-size="3.6" fill="#fffaf1">${name}</text>`).join('') + roots + bulbs + graft + p.close;
}

function berryCut(thick, big) {
  const p = plate(big ? 128 : 162, big ? 6 : 16, big ? 124 : 90, big ? 172 : 128, thick ? 'THICK SKIN' : 'THIN SKIN');
  const skin = thick ? (big ? 11 : 7) : (big ? 3 : 2.4);
  const r = big ? 42 : 28;
  const cx = p.x + p.w / 2, cy = p.y + (big ? 70 : 58);
  const labels = big ? `<text x="${cx + r + 2}" y="${cy - r + 8}" font-size="3.6" fill="${ink}">skin</text><text x="${cx - 8}" y="${cy + 4}" font-size="3.6" fill="${ink}">pulp</text><text x="${cx - 10}" y="${cy + 16}" font-size="3.4" fill="${wood}">seed</text><text x="${p.x + 6}" y="${p.y + 150}" font-size="3.8" fill="${ink}">${thick ? 'days in the tank' : 'hours, then press'}</text>` : '';
  return p.open + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${grape}"/><circle cx="${cx}" cy="${cy}" r="${Math.max(4, r - skin)}" fill="#e7b3c4"/><ellipse cx="${cx - 6}" cy="${cy}" rx="3" ry="5" fill="${wood}"/><ellipse cx="${cx + 7}" cy="${cy + 4}" rx="2.6" ry="4" fill="${wood}"/>${labels}<text x="${p.x + 6}" y="${p.y + (big ? 164 : 112)}" font-size="3.6" fill="${ink}">${thick ? 'skin stays in the tank' : 'short contact, pale glass'}</text>` + p.close;
}

function barrelCut(year, big) {
  const p = plate(big ? 124 : 158, big ? 6 : 18, big ? 128 : 94, big ? 172 : 130, year ? 'ONE YEAR ON' : 'FRESH FILL');
  const gap = year ? (big ? 22 : 16) : 4;
  const stave = big ? `<path d="M${p.x + 18} ${p.y + 40} q-6 30 0 70" fill="none" stroke="#c4a574" stroke-width="2"/><text x="${p.x + 8}" y="${p.y + 36}" font-size="3.4" fill="${ink}">stave</text><text x="${p.x + 78}" y="${p.y + 36}" font-size="3.4" fill="${ink}">toast inside</text>` : '';
  return p.open + stave + `<rect x="${p.x + (big ? 36 : 22)}" y="${p.y + (big ? 40 : 28)}" width="${big ? 58 : 50}" height="${big ? 90 : 70}" rx="6" fill="#6e4328" stroke="${ink}" stroke-width=".6"/>
    <rect x="${p.x + (big ? 42 : 28)}" y="${p.y + (big ? 48 : 34)}" width="${big ? 46 : 38}" height="${gap}" fill="#d7e6ea"/>
    <rect x="${p.x + (big ? 42 : 28)}" y="${p.y + (big ? 48 : 34) + gap}" width="${big ? 46 : 38}" height="${(big ? 74 : 64) - gap}" fill="${grape}"/>
    <text x="${p.x + 8}" y="${p.y + (big ? 156 : 112)}" font-size="3.6" fill="${ink}">${year ? 'gap = ullage · top up' : 'bung in · no tally yet'}</text>` + p.close;
}

function labBench(which, big) {
  const p = plate(big ? 124 : 156, big ? 6 : 16, big ? 128 : 96, big ? 172 : 132, big ? 'LAB · THREE GLASSES' : 'LAB SAMPLE');
  const fills = { steel: '#f4e7c8', oak: grape, lees: '#e7dcc0', fault: '#c46a43' };
  const fill = fills[which] || '#f4e7c8';
  return p.open + [0, 1, 2].map(i => `<path d="M${p.x + 14 + i * 26} ${p.y + 36} h12 l2 28 h-16 z" fill="#f7fbfb" stroke="${ink}" stroke-width=".45"/><rect x="${p.x + 16 + i * 26}" y="${p.y + 48}" width="8" height="14" fill="${i === 1 ? fill : '#f4e7c8'}" opacity="${i === 1 ? 1 : .45}"/>`).join('') + `<rect x="${p.x + 12}" y="${p.y + 78}" width="70" height="28" fill="#fff" stroke="${ink}" stroke-width=".45"/><text x="${p.x + 16}" y="${p.y + 90}" font-size="3.6" fill="${ink}">lot · vessel · taste</text><text x="${p.x + 16}" y="${p.y + 98}" font-size="3.6" fill="${teal}">${which}</text>` + p.close;
}

function bins(kind) {
  const p = plate(160, 20, 92, 124, kind === 'early' ? 'EARLY · ACID' : kind === 'ripe' ? 'RIPE · BODY' : 'DAWN PICK');
  const color = kind === 'early' ? '#c4d48a' : '#6a2030';
  return p.open + `<rect x="${p.x + 14}" y="${p.y + 28}" width="28" height="22" fill="${wood}"/><circle cx="${p.x + 24}" cy="${p.y + 36}" r="4" fill="${color}"/><circle cx="${p.x + 32}" cy="${p.y + 40}" r="3.5" fill="${color}"/><text x="${p.x + 10}" y="${p.y + 68}" font-size="3.8" fill="${ink}">${kind === 'early' ? 'seeds still sharp' : kind === 'ripe' ? 'seeds brown' : 'lamps on · fruit cool'}</text>` + (kind === 'crew' ? `<circle cx="${p.x + 70}" cy="${p.y + 24}" r="4" fill="#f7e7a2"/>` : '') + p.close;
}

function capTank() {
  const p = plate(160, 14, 92, 132, 'RED CAP');
  return p.open + `<rect x="${p.x + 22}" y="${p.y + 24}" width="48" height="70" rx="4" fill="#d7e0e4" stroke="${ink}" stroke-width=".6"/><rect x="${p.x + 26}" y="${p.y + 48}" width="40" height="40" fill="${grape}"/><rect x="${p.x + 26}" y="${p.y + 36}" width="40" height="14" fill="#4a1622"/><rect x="${p.x + 44}" y="${p.y + 16}" width="2" height="24" fill="${wood}"/><text x="${p.x + 8}" y="${p.y + 112}" font-size="3.6" fill="${ink}">skins floating · punch down</text>` + p.close;
}

function doorRow(open) {
  const names = ['white', 'rose', 'red', 'champ', 'fort'];
  const colors = { white: '#e8dfb4', rose: '#e7a3a8', red: grape, champ: '#d4c27a', fort: '#8a5426', none: '#3a332e' };
  const p = plate(148, 18, 104, 120, open ? open.toUpperCase() + ' ONLY' : 'NO DOOR YET');
  return p.open + names.map((n, i) => {
    const on = n === open;
    return `<rect x="${p.x + 8 + (i % 5) * 19}" y="${p.y + 28}" width="16" height="36" fill="${on ? colors[n] : '#2a2420'}" stroke="${on ? teal : '#111'}" stroke-width="${on ? 1 : .4}"/><text x="${p.x + 16 + i * 19}" y="${p.y + 78}" text-anchor="middle" font-size="3" fill="${ink}">${n[0].toUpperCase()}</text>`;
  }).join('') + `<text x="${p.x + 8}" y="${p.y + 100}" font-size="3.5" fill="${ink}">${open ? 'other four stay shut' : 'sort first'}</text>` + p.close;
}

function glasses(mode) {
  const p = plate(158, 18, 94, 120, mode === 'water' ? 'WATER FIRST' : mode === 'wine' ? 'A THIRD' : 'ONE STYLE EACH');
  const fills = mode === 'water' ? ['#9fd0dc', '#9fd0dc'] : mode === 'wine' ? ['#9fd0dc', grape] : [sand, '#e7a3a8', grape, '#f7f3ea', '#8a5426'];
  return p.open + fills.map((c, i) => `<path d="M${p.x + 10 + i * 16} ${p.y + 28} h8 l1 16 h-10 z" fill="#f7fbfb" stroke="${ink}" stroke-width=".4"/><rect x="${p.x + 12 + i * 16}" y="${p.y + 36}" width="5" height="7" fill="${c}"/>`).join('') + p.close;
}

function spurs() {
  const p = plate(164, 22, 88, 116, 'BARE SPURS');
  const posts = [0, 1, 2].map(i => `<rect x="${p.x + 16 + i * 22}" y="${p.y + 36}" width="3" height="28" fill="${'#5b4128'}"/><path d="M${p.x + 17 + i * 22} ${p.y + 40} l8 -6 m-8 8 l-7 -4" stroke="${'#5b4128'}" stroke-width="1.1" fill="none"/>`).join('');
  return p.open + posts + `<text x="${p.x + 8}" y="${p.y + 84}" font-size="3.6" fill="${ink}">leaves gone · frame stays</text><text x="${p.x + 8}" y="${p.y + 96}" font-size="3.6" fill="${ink}">this sets next year’s crop</text>` + p.close;
}

function tankCut() {
  const p = plate(164, 20, 88, 120, 'RAIN TANK');
  return p.open + `<path d="M${p.x + 20} ${p.y + 28} h20 l6 8 v-20 h-10 z" fill="${clay}"/><rect x="${p.x + 36}" y="${p.y + 36}" width="28" height="40" rx="3" fill="${teal}"/><rect x="${p.x + 40}" y="${p.y + 52}" width="20" height="20" fill="#7ec8d4"/><text x="${p.x + 8}" y="${p.y + 96}" font-size="3.6" fill="${ink}">roof → tank, not leaves</text>` + p.close;
}

function crew(list) {
  return list.map((c, i) => fig(18 + i * 28 + (c.dx || 0), 156, c.who, c.tool)).join('');
}

function crates(label) {
  const p = plate(160, 24, 92, 112, label);
  return p.open + `<rect x="${p.x + 16}" y="${p.y + 40}" width="22" height="16" fill="#c4965c" stroke="${ink}" stroke-width=".4"/><rect x="${p.x + 40}" y="${p.y + 32}" width="22" height="16" fill="#b8884e" stroke="${ink}" stroke-width=".4"/><rect x="${p.x + 30}" y="${p.y + 52}" width="22" height="16" fill="#a97a47" stroke="${ink}" stroke-width=".4"/><text x="${p.x + 8}" y="${p.y + 90}" font-size="3.6" fill="${ink}">shade · one load</text>` + p.close;
}

function crewFor(stopId, beatId) {
  const table = {
    campus: { row: [['sippy', 'point'], ['roma', 'glass'], ['hummin', 'book']], frame: [['sippy', 'shears'], ['hummin', 'book']], tank: [['sippy', 'hose'], ['hummin', 'book']] },
    team: { on: [['sippy', 'hose'], ['roma', 'glass'], ['hummin', 'book']], off: [['sippy', 'point'], ['roma', 'glass'], ['hummin', 'book']], leaf: [['sippy', 'point'], ['roma', 'glass']] },
    regions: { both: [['roma', 'glass'], ['sippy', 'point'], ['hummin', 'book']], cool: [['roma', 'glass'], ['hummin', 'book']], warm: [['roma', 'glass'], ['sippy', 'point']] },
    rain: { roots: [['hummin', 'book'], ['sippy', 'hose'], ['roma', 'point']], shut: [['hummin', 'book'], ['sippy', 'point']], leaves: [['roma', 'point'], ['sippy', 'hose']] },
    berry: { three: [['roma', 'glass'], ['hummin', 'book'], ['sippy', 'point']], thin: [['roma', 'glass']], thick: [['roma', 'glass'], ['hummin', 'book']] },
    harvest: { early: [['sippy', 'basket'], ['roma', 'point'], ['hummin', 'book']], ripe: [['sippy', 'basket'], ['roma', 'glass']], crew: [['sippy', 'basket'], ['roma', 'point']] },
    crush: { all: [['sippy', 'basket'], ['hummin', 'book']], loop: [['hummin', 'hose'], ['sippy', 'point']], channel: [['hummin', 'hose']] },
    ferment: { red: [['roma', 'point'], ['sippy', 'punch']], cap: [['sippy', 'punch'], ['roma', 'glass']], wait: [['roma', 'glass'], ['hummin', 'book']] },
    crossroads: { white: [['sippy', 'point']], rose: [['sippy', 'point'], ['roma', 'glass']], red: [['sippy', 'punch'], ['roma', 'glass']], champ: [['hummin', 'book'], ['sippy', 'point']], fort: [['hummin', 'book'], ['roma', 'glass']] },
    lab: { steel: [['hummin', 'book'], ['roma', 'glass']], oak: [['roma', 'glass'], ['hummin', 'book']], lees: [['roma', 'glass'], ['hummin', 'book']] },
    barrels: { young: [['hummin', 'book'], ['roma', 'glass']], year: [['hummin', 'book'], ['sippy', 'point']], taste: [['roma', 'glass'], ['hummin', 'book']] },
    bench: { marks: [['hummin', 'shears'], ['sippy', 'point']], young: [['hummin', 'shears']], smell: [['hummin', 'point'], ['roma', 'glass']] },
    finish: { cold: [['roma', 'glass'], ['hummin', 'book']], clay: [['roma', 'glass']], oak: [['roma', 'glass'], ['hummin', 'book']] },
    give: { light: [['hummin', 'point'], ['sippy', 'basket']], heavy: [['hummin', 'point']], dock: [['sippy', 'basket']] },
    bottle: { cork: [['sippy', 'point'], ['hummin', 'book']], screw: [['hummin', 'book'], ['sippy', 'point']], fill: [['sippy', 'point']] },
    passport: { label: [['hummin', 'book']], cork: [['hummin', 'book'], ['sippy', 'point']], case: [['sippy', 'basket'], ['hummin', 'book']] },
    flight: { counter: [['roma', 'glass'], ['sippy', 'point'], ['hummin', 'book']], walls: [['sippy', 'point']], chill: [['roma', 'glass']] },
    journey: { truck: [['sippy', 'basket'], ['hummin', 'book']], dock: [['sippy', 'point']], heavy: [['sippy', 'basket']] },
    market: { walls: [['sippy', 'point'], ['hummin', 'book']], fifo: [['hummin', 'book'], ['sippy', 'basket']], cold: [['roma', 'glass']] },
    list: { till: [['sippy', 'point'], ['roma', 'book']], walls: [['sippy', 'point']], glass: [['roma', 'glass']] },
    handoff: { water: [['sippy', 'glass'], ['roma', 'point']], host: [['sippy', 'point'], ['hummin', 'book']], list: [['roma', 'book'], ['sippy', 'point']] },
    sip: { pour: [['roma', 'glass'], ['hummin', 'book']], nose: [['roma', 'glass']], ice: [['sippy', 'point'], ['roma', 'glass']] },
  };
  const row = table[stopId]?.[beatId] || [['sippy', 'point'], ['roma', 'glass'], ['hummin', 'book']];
  return crew(row.map(([who, tool], i) => ({ who, tool, dx: i * 4 })));
}

function plateFor(stopId, beatId, dive) {
  if (dive && (stopId === 'rain' || beatId === 'graft' || beatId === 'phylloxera' || beatId === 'soil' || beatId === 'drip' || beatId === 'save')) {
    return soilCut(true, beatId === 'drip' || beatId === 'roots' || beatId === 'leaf');
  }
  if (dive && (stopId === 'berry' || beatId === 'vinifera' || beatId === 'american' || beatId === 'clones' || beatId === 'hybrids')) {
    return berryCut(beatId === 'vinifera' || beatId === 'thick', true);
  }
  if (dive && (stopId === 'lab' || beatId === 'numbers' || beatId === 'sulfur' || beatId === 'clear' || beatId === 'fault' || beatId === 'log')) {
    return labBench(beatId === 'fault' ? 'fault' : beatId === 'log' ? 'oak' : 'steel', true);
  }
  if (dive && (stopId === 'barrels' || beatId === 'ullage' || beatId === 'time' || beatId === 'species' || beatId === 'toast' || beatId === 'care')) {
    return barrelCut(beatId === 'ullage' || beatId === 'time' || beatId === 'care' || beatId === 'year', true);
  }
  if (stopId === 'campus' && beatId === 'tank') return tankCut();
  if (stopId === 'campus' && beatId === 'frame') return spurs();
  if (stopId === 'rain' || stopId === 'team') return soilCut(false, beatId === 'roots' || beatId === 'on' || beatId === 'leaves');
  if (stopId === 'berry') return berryCut(beatId === 'thick');
  if (stopId === 'harvest') return bins(beatId);
  if (stopId === 'ferment') return capTank();
  if (stopId === 'crush') return doorRow(null);
  if (stopId === 'crossroads') return doorRow(beatId);
  if (stopId === 'lab' || stopId === 'finish') return labBench(beatId === 'oak' ? 'oak' : beatId === 'lees' ? 'lees' : 'steel');
  if (stopId === 'barrels' || stopId === 'bench') return barrelCut(beatId === 'year' || beatId === 'marks' || beatId === 'smell');
  if (stopId === 'handoff') return glasses('water');
  if (stopId === 'sip') return glasses(beatId === 'pour' || beatId === 'nose' ? 'wine' : 'wine');
  if (stopId === 'flight' || stopId === 'list') return glasses('flight');
  if (stopId === 'journey' || stopId === 'give' || stopId === 'market') return crates(beatId === 'light' ? 'LIGHT GLASS' : beatId === 'heavy' ? 'HEAVY GLASS' : beatId === 'fifo' ? 'OLDEST UP' : 'THE LOAD');
  if (stopId === 'bottle' || stopId === 'passport') return glasses('wine');
  return '';
}

function skyFor(stopId, beatId) {
  if (beatId === 'frame' || beatId === 'phylloxera') return sky('frost');
  if (beatId === 'crew' || beatId === 'cloud') return sky('night');
  if (beatId === 'tank' || beatId === 'leaves' || beatId === 'shut' || stopId === 'rain') return sky('rain');
  if (beatId === 'truck' || beatId === 'heavy') return sky('heat');
  if (stopId === 'campus' || stopId === 'team' || stopId === 'harvest') return sky('sun');
  return sky('sun');
}

export function storyMarkup(stopId, beatId, dive) {
  const title = (beatId || '').replace(/-/g, ' ').toUpperCase();
  return `<g class="ac-over" data-story="${stopId}:${beatId}" data-dive="${dive ? '1' : '0'}">
    ${skyFor(stopId, beatId)}
    ${plateFor(stopId, beatId, dive)}
    ${crewFor(stopId, beatId)}
    ${chip(8, 2, dive ? 'DEEP · ' + title : title)}
  </g>`;
}
