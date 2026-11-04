// Sip-Stack · Academy mode. Five guilds, fifteen campuses, original field boards.
import {
  GUIDES, GUILDS, CAMPUSES, WINE_STOPS, WINE_BY_ID, DIVES, SAMPLES, campusStops, fullStops, tasteHTML, fieldGuideHTML, EQUIP_INDEX,
} from './sip-depth-data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEY = 'sip-stack:academy:v1';

const ink = '#2a221d';
const leaf = '#3d6b45';
const leaf2 = '#2c5236';
const wood = '#8a5a36';
const grape = '#6a2030';
const steel = '#d7e0e4';
const sand = '#edd4a8';
const clay = '#914C2C';
const teal = '#1A5552';

function loadProg() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { seen: {} }; }
  catch { return { seen: {} }; }
}
function saveProg(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private */ } }
function markSeen(campus, n) {
  const p = loadProg();
  const set = new Set(p.seen[campus] || []);
  set.add(n);
  p.seen[campus] = [...set];
  p.last = { campus, n };
  saveProg(p);
  return p;
}

function el(name, attrs, inner = '') {
  const a = Object.entries(attrs).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` ${k}="${v}"`).join('');
  return `<${name}${a}>${inner}</${name}>`;
}
const hot = (id, active) => (id === active ? 'on' : 'dim');

function person(x, y, shirt, name, state) {
  return `<g data-hot="${name}" class="${hot(name, state)}" transform="translate(${x} ${y})">
    <ellipse cx="0" cy="52" rx="18" ry="5" fill="#000" opacity=".12"/>
    <rect x="-7" y="30" width="6" height="18" rx="2" fill="#2c3140"/>
    <rect x="2" y="30" width="6" height="18" rx="2" fill="#2c3140"/>
    <rect x="-11" y="14" width="6" height="16" rx="2" fill="${shirt}"/>
    <rect x="6" y="14" width="6" height="16" rx="2" fill="${shirt}"/>
    <rect x="-9" y="10" width="18" height="24" rx="5" fill="${shirt}"/>
    <circle cx="0" cy="2" r="8" fill="#e2b08a"/>
    <ellipse cx="0" cy="-6" rx="8" ry="3.5" fill="${sand}"/>
  </g>`;
}
function vine(x, state, id) {
  return `<g data-hot="${id || ''}" class="${id ? hot(id, state) : 'on'}" transform="translate(${x} 0)">
    <rect x="-3" y="168" width="6" height="78" fill="#5b4128"/>
    <path d="M-3 150 C 20 140, 40 170, 8 188" fill="none" stroke="#5b4128" stroke-width="3"/>
    <ellipse cx="0" cy="150" rx="34" ry="18" fill="${leaf}"/>
    <ellipse cx="18" cy="162" rx="20" ry="12" fill="${leaf2}"/>
    <circle cx="-8" cy="176" r="5" fill="${grape}"/>
    <circle cx="6" cy="180" r="4" fill="#4b2340"/>
  </g>`;
}
function tank(x, y, h, liquid, id, state, open) {
  return `<g data-hot="${id || ''}" class="${id ? hot(id, state) : 'on'}">
    <rect x="${x}" y="${y}" width="70" height="${h}" rx="10" fill="${steel}" stroke="${ink}" stroke-width="1.6"/>
    <rect x="${x + 6}" y="${y + h * 0.38}" width="58" height="${h * 0.52}" rx="6" fill="${liquid}"/>
    ${open
      ? `<ellipse cx="${x + 35}" cy="${y + 8}" rx="26" ry="8" fill="${grape}" stroke="${ink}" stroke-width="1"/>`
      : `<ellipse cx="${x + 35}" cy="${y}" rx="28" ry="9" fill="#c5d0d4" stroke="${ink}" stroke-width="1.4"/>`}
    <rect x="${x + 62}" y="${y + 18}" width="16" height="6" rx="2" fill="${teal}"/>
  </g>`;
}
function barrel(x, y, id, state) {
  return `<g data-hot="${id || ''}" class="${id ? hot(id, state) : 'on'}" transform="translate(${x} ${y})">
    <ellipse cx="0" cy="0" rx="28" ry="16" fill="#6e4328" stroke="${ink}" stroke-width="1.3"/>
    <ellipse cx="0" cy="0" rx="28" ry="16" fill="none" stroke="#3d2918" stroke-width="4" stroke-dasharray="2 10"/>
    <rect x="-4" y="-18" width="8" height="10" rx="2" fill="${sand}" stroke="${ink}"/>
  </g>`;
}
function skyGround(sky = '#e7f0ea') {
  return `<rect width="640" height="340" fill="${sky}"/>
    <rect y="210" width="640" height="130" fill="#e6d2ac"/>
    <path d="M0 210 C 120 180, 240 230, 360 200 C 460 180, 540 210, 640 190 V 210 H 0 Z" fill="#d7c093"/>
    <rect y="300" width="640" height="40" fill="#c4a56a" opacity=".35"/>`;
}
function shed(x, id, state) {
  return `<g data-hot="${id || ''}" class="${id ? hot(id, state) : 'on'}">
    <rect x="${x}" y="150" width="90" height="70" fill="#f4e7cf" stroke="${ink}" stroke-width="1.4"/>
    <path d="M${x - 8} 150 L${x + 45} 112 L${x + 98} 150 Z" fill="${clay}" stroke="${ink}"/>
    <rect x="${x + 34}" y="172" width="22" height="48" fill="#6b4a32"/>
    <rect x="${x + 108}" y="168" width="36" height="28" rx="4" fill="${teal}" stroke="${ink}"/>
    <path d="M${x + 70} 128 V168" stroke="${teal}" stroke-width="3"/>
  </g>`;
}

function drawWine(stop, on) {
  const s = on;
  switch (stop.id) {
    case 'campus':
      return skyGround() + vine(120) + vine(210, s, 'wires') + vine(300) +
        `<g data-hot="post" class="${hot('post', s)}"><rect x="78" y="120" width="10" height="150" fill="#6b5344"/><path d="M88 140 H40" stroke="#6b5344" stroke-width="4"/></g>` +
        `<path data-hot="wires" class="${hot('wires', s)}" d="M88 150 H520" stroke="#c9a227" stroke-width="3" fill="none"/>` +
        shed(470, 'shed', s);
    case 'team':
      return skyGround('#e5f2ea') + vine(80) + vine(240) + vine(400) + vine(560) +
        person(180, 150, teal, 'sippy', s) + person(320, 158, clay, 'roma', s) + person(460, 150, '#817985', 'hummin', s) +
        `<g data-hot="hummin" class="${hot('hummin', s)}"><rect x="488" y="168" width="22" height="28" rx="2" fill="#fffaf1" stroke="${ink}"/><path d="M492 176 H506 M492 182 H504 M492 188 H500" stroke="${teal}" stroke-width="1.4"/></g>`;
    case 'regions':
      return `<rect width="640" height="340" fill="#f3ead8"/>
        <g data-hot="cool" class="${hot('cool', s)}"><path d="M0 340 L0 120 L300 40 L320 340 Z" fill="#c9ddd4"/><path d="M40 200 C 80 160, 140 190, 180 150" fill="none" stroke="${leaf}" stroke-width="8"/><circle cx="150" cy="90" r="28" fill="#f7f3ea" stroke="${teal}" stroke-width="3"/></g>
        <g data-hot="warm" class="${hot('warm', s)}"><path d="M320 340 L300 80 L640 150 L640 340 Z" fill="#efd0a4"/><circle cx="520" cy="78" r="26" fill="#f0b429"/><rect x="430" y="200" width="70" height="36" rx="6" fill="${wood}"/><circle cx="450" cy="188" r="8" fill="#f4e7c8"/><circle cx="478" cy="186" r="8" fill="#e2b15a"/></g>
        <text x="24" y="36" fill="${teal}" font-family="Fraunces, Georgia, serif" font-size="18">Cool program</text>
        <text x="430" y="36" fill="${clay}" font-family="Fraunces, Georgia, serif" font-size="18">Warm program</text>`;
    case 'rain':
      return skyGround('#d5e4ea') +
        `<g data-hot="cloud" class="${hot('cloud', s)}"><ellipse cx="120" cy="64" rx="46" ry="22" fill="#f7f4ee"/><ellipse cx="150" cy="58" rx="28" ry="16" fill="#fff"/><path d="M100 90 v18 M120 96 v22 M146 90 v16" stroke="${teal}" stroke-width="2"/></g>` +
        vine(230, s, 'leaf') +
        `<g data-hot="emitter" class="${hot('emitter', s)}"><path d="M80 230 H520" stroke="#222" stroke-width="4"/><circle cx="250" cy="230" r="7" fill="${teal}"/><circle cx="250" cy="248" r="10" fill="#7ec8d4" opacity=".8"/></g>` +
        `<g data-hot="topsoil" class="${hot('topsoil', s)}"><rect x="400" y="214" width="200" height="36" fill="#5d4030"/><text x="412" y="236" fill="#f4e7cf" font-size="13" font-family="Inter, sans-serif">topsoil</text></g>` +
        `<g data-hot="rock" class="${hot('rock', s)}"><rect x="400" y="250" width="200" height="50" fill="#a89880"/><path d="M420 270 C 450 290, 470 255, 520 275" fill="none" stroke="#e7d3b0" stroke-width="3"/><text x="412" y="292" fill="${ink}" font-size="13" font-family="Inter, sans-serif">rock</text></g>`;
    case 'berry':
      return `<rect width="640" height="340" fill="#f6efe2"/>
        <g data-hot="root" class="${hot('root', s)}"><path d="M80 300 C 70 240, 100 220, 120 200" fill="none" stroke="#c4a574" stroke-width="6"/><text x="24" y="250" fill="${ink}" font-size="13" font-family="Inter, sans-serif">root</text></g>
        <g data-hot="cane" class="${hot('cane', s)}"><path d="M120 200 C 160 180, 200 160, 250 140" fill="none" stroke="#6b4a32" stroke-width="7"/><text x="150" y="130" fill="${ink}" font-size="13" font-family="Inter, sans-serif">cane</text></g>
        <g data-hot="leaf" class="${hot('leaf', s)}"><ellipse cx="300" cy="78" rx="50" ry="22" fill="${leaf}" transform="rotate(-20 300 78)"/></g>
        <g data-hot="skin" class="${hot('skin', s)}"><circle cx="430" cy="180" r="78" fill="#7a2340" stroke="${ink}" stroke-width="2"/></g>
        <g data-hot="pulp" class="${hot('pulp', s)}"><circle cx="430" cy="180" r="58" fill="#e7b3c4"/></g>
        <g data-hot="seed" class="${hot('seed', s)}"><ellipse cx="410" cy="176" rx="8" ry="12" fill="#6b4a2a"/><ellipse cx="448" cy="186" rx="7" ry="11" fill="#5a3d24"/></g>`;
    case 'harvest':
      return skyGround('#f3ead0') + vine(70) + vine(150, s, 'snip') + vine(230) +
        `<g data-hot="sample" class="${hot('sample', s)}"><rect x="300" y="150" width="28" height="36" rx="4" fill="#fff" stroke="${ink}"/><rect x="304" y="166" width="20" height="16" fill="#e7d27a"/></g>` +
        `<g data-hot="pad" class="${hot('pad', s)}"><rect x="430" y="188" width="160" height="70" fill="#efe6d4" stroke="${ink}"/><rect x="450" y="200" width="40" height="28" fill="${grape}" opacity=".8"/><text x="500" y="222" fill="${ink}" font-size="13" font-family="Inter, sans-serif">pad</text></g>` +
        person(200, 150, teal, 'snip', s);
    case 'crush':
      return `<rect width="640" height="340" fill="#f6efe4"/>
        <rect y="230" width="640" height="110" fill="#d9c7a4"/>
        <g data-hot="sort" class="${hot('sort', s)}"><rect x="40" y="160" width="150" height="16" fill="${wood}"/><circle cx="70" cy="156" r="8" fill="${grape}"/><circle cx="100" cy="154" r="7" fill="${leaf}"/><circle cx="130" cy="156" r="8" fill="${grape}"/></g>
        <g data-hot="destem" class="${hot('destem', s)}"><rect x="240" y="140" width="120" height="70" rx="8" fill="${steel}" stroke="${ink}"/><circle cx="300" cy="175" r="18" fill="none" stroke="${clay}" stroke-width="4"/></g>
        <g data-hot="auger" class="${hot('auger', s)}"><path d="M430 120 h80 l-16 80 h-48 z" fill="#c4b39a" stroke="${ink}"/><rect x="452" y="200" width="36" height="40" fill="${wood}"/></g>`;
    case 'ferment':
      return `<rect width="640" height="340" fill="#f4ecdf"/>
        <rect y="250" width="640" height="90" fill="#e4d2b0"/>` +
        tank(80, 90, 160, '#f4e7c8', '', s, false) +
        tank(200, 70, 180, grape, 'cap', s, true) +
        `<g data-hot="punch" class="${hot('punch', s)}"><rect x="248" y="40" width="8" height="90" fill="${wood}"/><ellipse cx="252" cy="44" rx="16" ry="6" fill="${clay}"/></g>` +
        `<g data-hot="temp" class="${hot('temp', s)}"><rect x="430" y="120" width="18" height="70" rx="8" fill="#fff" stroke="${ink}"/><rect x="434" y="150" width="10" height="34" fill="${clay}"/></g>`;
    case 'crossroads': {
      const doors = [
        ['white', '#e8dfb4', 40], ['rose', '#e7a3a8', 160], ['red', '#7a2232', 280], ['champ', '#d4c27a', 400], ['fort', '#8a5426', 520],
      ];
      return `<rect width="640" height="340" fill="#2c3338"/>
        <rect y="230" width="640" height="110" fill="#3d342c"/>
        <text x="24" y="36" fill="#f4ead8" font-family="Fraunces, Georgia, serif" font-size="18">Five doors · open one</text>` +
        doors.map(([id, color, x]) => {
          const open = s === id;
          return `<g data-hot="${id}" class="${hot(id, s)}">
            <rect x="${x}" y="70" width="90" height="160" fill="#1c1917" stroke="#f4ead8"/>
            <rect x="${x + (open ? 48 : 6)}" y="82" width="${open ? 36 : 78}" height="136" fill="${color}" stroke="${ink}" transform="${open ? `rotate(-18 ${x + 48} 150)` : ''}"/>
            ${open ? `<circle cx="${x + 45}" cy="150" r="8" fill="${teal}"/>` : ''}
          </g>`;
        }).join('');
    }
    case 'lab':
      return `<rect width="640" height="340" fill="#eef3f2"/>
        <rect x="40" y="190" width="560" height="18" fill="${wood}"/>
        <g data-hot="sugar" class="${hot('sugar', s)}"><rect x="80" y="140" width="36" height="50" rx="4" fill="#fff" stroke="${ink}"/><rect x="86" y="160" width="24" height="22" fill="#f0e2a8"/></g>
        <g data-hot="sulfur" class="${hot('sulfur', s)}"><rect x="230" y="120" width="70" height="70" fill="#fffaf1" stroke="${ink}"/><path d="M240 140 H290 M240 152 H280 M240 164 H270" stroke="${teal}"/></g>
        <g data-hot="clear" class="${hot('clear', s)}"><rect x="380" y="145" width="22" height="46" fill="#f7f7f7" stroke="${ink}"/><rect x="410" y="150" width="22" height="41" fill="#f3e0ea" stroke="${ink}"/><rect x="440" y="155" width="22" height="36" fill="${grape}" stroke="${ink}"/></g>
        <g data-hot="fault" class="${hot('fault', s)}"><rect x="510" y="100" width="80" height="48" rx="6" fill="${clay}"/><text x="524" y="128" fill="#fff" font-size="13" font-family="Inter, sans-serif">hold lot</text></g>`;
    case 'barrels':
      return `<rect width="640" height="340" fill="#3a332e"/>
        <rect y="250" width="640" height="90" fill="#2a2420"/>` +
        [0, 1, 2, 3].map(i => barrel(120 + i * 110, 200, i === 0 ? 'oak' : i === 2 ? 'toast' : '', s)).join('') +
        `<g data-hot="toast" class="${hot('toast', s)}"><path d="M300 150 q20 -30 40 0" fill="#e7a04a" opacity=".8"/></g>` +
        `<g data-hot="bung" class="${hot('bung', s)}"><rect x="430" y="150" width="14" height="22" rx="3" fill="${sand}" stroke="${ink}"/><text x="460" y="168" fill="#f4ead8" font-size="13" font-family="Inter, sans-serif">top up</text></g>`;
    case 'bench':
      return `<rect width="640" height="340" fill="#f3ead8"/>
        <rect x="60" y="200" width="520" height="22" fill="${wood}" stroke="${ink}"/>
        <g data-hot="stave" class="${hot('stave', s)}"><rect x="100" y="150" width="18" height="70" rx="3" fill="#c4a574" stroke="${ink}"/><rect x="130" y="150" width="18" height="70" rx="3" fill="#b08a55" stroke="${ink}"/></g>
        <g data-hot="hoop" class="${hot('hoop', s)}"><ellipse cx="300" cy="170" rx="40" ry="18" fill="none" stroke="#444" stroke-width="6"/><rect x="340" y="150" width="10" height="36" fill="${clay}"/></g>
        <g data-hot="wash" class="${hot('wash', s)}"><rect x="460" y="120" width="8" height="90" fill="${steel}" stroke="${ink}"/><circle cx="464" cy="210" r="10" fill="${teal}"/></g>`;
    case 'finish':
      return `<rect width="640" height="340" fill="#e7eef0"/>` +
        tank(60, 80, 170, '#f4e7c8', 'cold', s, false) +
        `<g data-hot="cold" class="${hot('cold', s)}"><path d="M140 120 H200 V200 H140" fill="none" stroke="${teal}" stroke-width="4"/><text x="150" y="110" fill="${teal}" font-size="13" font-family="Inter, sans-serif">cold</text></g>` +
        `<g data-hot="filter" class="${hot('filter', s)}"><rect x="280" y="120" width="110" height="70" rx="8" fill="${steel}" stroke="${ink}"/><circle cx="310" cy="155" r="14" fill="#9fd"/><circle cx="350" cy="155" r="14" fill="#9fd"/></g>` +
        `<g data-hot="taste" class="${hot('taste', s)}"><path d="M500 150 h24 l8 40 h-40 z" fill="none" stroke="${ink}" stroke-width="2"/><rect x="504" y="172" width="20" height="14" fill="${grape}"/></g>`;
    case 'give':
      return skyGround('#e5f3ef') +
        `<g data-hot="rinse" class="${hot('rinse', s)}"><path d="M40 200 H200 V250 H80" fill="none" stroke="${teal}" stroke-width="6"/><circle cx="80" cy="250" r="16" fill="#8fd0d4"/></g>` +
        `<g data-hot="glass" class="${hot('glass', s)}"><path d="M300 120 h28 l6 70 h-40 z" fill="#e7f4f2" stroke="${ink}" opacity=".9"/><path d="M360 120 h22 l4 70 h-30 z" fill="#e7f4f2" stroke="${teal}" stroke-width="2"/></g>` +
        `<g data-hot="rain" class="${hot('rain', s)}"><rect x="470" y="150" width="50" height="70" fill="${teal}"/><path d="M460 150 h70 l-35 -28 z" fill="${clay}"/></g>`;
    case 'bottle':
      return `<rect width="640" height="340" fill="#f7f1e6"/>
        <rect y="240" width="640" height="100" fill="#e4d3b4"/>
        <g data-hot="fill" class="${hot('fill', s)}"><rect x="70" y="70" width="120" height="28" fill="${steel}" stroke="${ink}"/><path d="M100 98 v40 M140 98 v40" stroke="${teal}" stroke-width="3"/></g>` +
        [0, 1, 2, 3].map(i => `<path d="M${100 + i * 28} 150 h16 l4 50 h-24 z" fill="#214232" stroke="${ink}"/>`).join('') +
        `<g data-hot="cork" class="${hot('cork', s)}"><rect x="300" y="140" width="70" height="40" fill="${wood}" stroke="${ink}"/><rect x="318" y="124" width="16" height="20" fill="#e7d7b0"/></g>` +
        `<g data-hot="case" class="${hot('case', s)}"><rect x="450" y="180" width="80" height="50" fill="#c4965c" stroke="${ink}"/><rect x="470" y="160" width="80" height="50" fill="#b8884e" stroke="${ink}"/></g>`;
    case 'passport':
      return `<rect width="640" height="340" fill="#f8f4ec"/>
        <g data-hot="place"><rect x="180" y="50" width="280" height="240" rx="8" fill="#fffaf1" stroke="${ink}" stroke-width="2"/>
          <rect x="200" y="70" width="240" height="36" fill="${grape}"/>
          <text x="214" y="94" fill="#fff" font-family="Fraunces, Georgia, serif" font-size="18">Coast Lot</text>
        </g>
        <g data-hot="place" class="${hot('place', s)}"><text x="214" y="140" fill="${ink}" font-size="16" font-family="Inter, sans-serif">North terrace · estate</text></g>
        <g data-hot="lot" class="${hot('lot', s)}"><text x="214" y="180" fill="${ink}" font-size="16" font-family="Inter, sans-serif">Lot 22 · harvested dawn</text><rect x="210" y="160" width="180" height="28" fill="none" stroke="${teal}" stroke-width="2"/></g>
        <g data-hot="abv" class="${hot('abv', s)}"><text x="214" y="230" fill="${clay}" font-size="20" font-family="Fraunces, Georgia, serif">12.5%</text></g>`;
    case 'flight': {
      const cols = [['white', '#f4e7c8', 70], ['rose', '#e7a3a8', 180], ['red', grape, 290], ['champ', '#f7f3ea', 400], ['fort', '#8a5426', 510]];
      return `<rect width="640" height="340" fill="#f6efe4"/>
        <rect x="40" y="230" width="560" height="16" fill="${wood}"/>` +
        cols.map(([id, fill, x]) => `<g data-hot="${id}" class="${hot(id, s)}"><path d="M${x} 120 h36 l8 70 h-52 z" fill="#f7fbfb" stroke="${ink}" stroke-width="${s === id ? 2.4 : 1}"/><rect x="${x + 6}" y="150" width="28" height="36" fill="${fill}"/></g>`).join('');
    }
    case 'journey':
      return skyGround('#e7f0ea') +
        `<g data-hot="shade" class="${hot('shade', s)}"><path d="M40 80 H260 V200 H40 Z" fill="#000" opacity=".08"/><rect x="70" y="150" width="70" height="40" fill="#c4965c"/></g>` +
        `<g data-hot="truck" class="${hot('truck', s)}"><rect x="250" y="150" width="150" height="70" fill="#f4f1ea" stroke="${ink}"/><rect x="400" y="170" width="50" height="50" fill="${teal}"/><circle cx="290" cy="230" r="14" fill="#222"/><circle cx="380" cy="230" r="14" fill="#222"/></g>` +
        `<g data-hot="boat" class="${hot('boat', s)}"><path d="M470 230 Q 520 270 590 230 L560 210 H500 Z" fill="#f4f1ea" stroke="${ink}"/><rect x="510" y="180" width="36" height="24" fill="#c4965c"/></g>`;
    case 'market':
      return `<rect width="640" height="340" fill="#f7f1e6"/>
        <g data-hot="walls" class="${hot('walls', s)}"><rect x="40" y="60" width="40" height="200" fill="${wood}"/><rect x="90" y="80" width="70" height="16" fill="#f4e7c8"/><rect x="90" y="110" width="70" height="16" fill="${grape}"/><rect x="90" y="140" width="70" height="16" fill="#e7a3a8"/><rect x="90" y="170" width="70" height="16" fill="#d4c27a"/><rect x="90" y="200" width="70" height="16" fill="#8a5426"/></g>
        <g data-hot="chill" class="${hot('chill', s)}"><rect x="250" y="80" width="140" height="160" rx="6" fill="#d9eef2" stroke="${teal}"/><rect x="270" y="110" width="16" height="40" fill="#214232"/></g>
        <g data-hot="fifo" class="${hot('fifo', s)}"><rect x="440" y="150" width="150" height="90" fill="#efe6d4" stroke="${ink}" stroke-dasharray="4 3"/><text x="460" y="190" fill="${ink}" font-size="14" font-family="Inter, sans-serif">oldest up first</text></g>`;
    case 'list':
      return `<rect width="640" height="340" fill="#f8f4ec"/>
        <g data-hot="styles" class="${hot('styles', s)}"><rect x="60" y="40" width="250" height="260" fill="#fffaf1" stroke="${ink}"/>
          <text x="80" y="78" fill="${teal}" font-size="16" font-family="Inter, sans-serif">Water</text>
          <text x="80" y="110" fill="${ink}" font-size="15" font-family="Inter, sans-serif">White</text>
          <text x="80" y="140" fill="${ink}" font-size="15" font-family="Inter, sans-serif">Rosé</text>
          <text x="80" y="170" fill="${ink}" font-size="15" font-family="Inter, sans-serif">Red</text>
          <text x="80" y="200" fill="${ink}" font-size="15" font-family="Inter, sans-serif">Champagne</text>
          <text x="80" y="230" fill="${ink}" font-size="15" font-family="Inter, sans-serif">Fortified</text>
        </g>
        <g data-hot="btg" class="${hot('btg', s)}"><rect x="360" y="80" width="200" height="70" rx="8" fill="${sand}" stroke="${ink}"/><text x="380" y="120" fill="${ink}" font-size="16" font-family="Inter, sans-serif">by the glass</text></g>
        <g data-hot="water" class="${hot('water', s)}"><rect x="360" y="180" width="200" height="70" rx="8" fill="${teal}"/><text x="380" y="220" fill="#fff" font-size="16" font-family="Inter, sans-serif">water first</text></g>`;
    case 'handoff':
      return skyGround('#f6efe4') +
        `<rect x="180" y="200" width="280" height="16" rx="4" fill="#f7f3ea" stroke="${ink}"/>` +
        person(80, 140, teal, 'greet', s) +
        `<g data-hot="water" class="${hot('water', s)}"><path d="M240 150 h20 l6 36 h-32 z" fill="#f7fbfb" stroke="${ink}"/><rect x="246" y="166" width="12" height="16" fill="#9fd0dc"/></g>` +
        `<g data-hot="present" class="${hot('present', s)}"><path d="M420 130 h22 l4 48 h-30 z" fill="#214232"/><rect x="424" y="118" width="14" height="16" fill="#e7d7b0"/></g>`;
    case 'sip':
      return `<rect width="640" height="340" fill="#f8f1e4"/>
        <rect x="80" y="230" width="480" height="18" fill="${wood}"/>
        <g data-hot="nose" class="${hot('nose', s)}"><path d="M160 90 h70 l16 110 h-102 z" fill="#f7fbfb" stroke="${ink}" stroke-width="2"/><rect x="176" y="140" width="46" height="50" fill="${grape}"/></g>
        <g data-hot="sip" class="${hot('sip', s)}"><circle cx="400" cy="150" r="36" fill="none" stroke="${clay}" stroke-width="3"/><text x="372" y="156" fill="${clay}" font-size="14" font-family="Inter, sans-serif">sip</text></g>
        <g data-hot="word" class="${hot('word', s)}"><rect x="470" y="120" width="120" height="80" fill="#fffaf1" stroke="${ink}"/><text x="488" y="166" fill="${ink}" font-family="Fraunces, Georgia, serif" font-size="18">bright</text></g>`;
    default:
      return skyGround();
  }
}

function drawSample(scene, on) {
  if (scene === 'beer-gate') {
    return skyGround('#efe6c8') +
      `<g data-hot="barley" class="${hot('barley', on)}"><rect x="60" y="180" width="8" height="50" fill="#c4a15a"/><rect x="90" y="160" width="8" height="70" fill="#c4a15a"/><rect x="120" y="170" width="8" height="60" fill="#b8924a"/><ellipse cx="94" cy="150" rx="40" ry="16" fill="#e6c56a"/></g>` +
      `<g data-hot="hops" class="${hot('hops', on)}"><path d="M260 240 V80 M300 240 V70 M340 240 V90" stroke="${leaf2}" stroke-width="4"/><circle cx="300" cy="120" r="10" fill="#d6e27a"/></g>` +
      `<g data-hot="water" class="${hot('water', on)}"><rect x="470" y="150" width="16" height="70" fill="${steel}" stroke="${ink}"/><path d="M478 220 v20" stroke="${teal}" stroke-width="4"/></g>`;
  }
  if (scene === 'beer-mash') {
    return `<rect width="640" height="340" fill="#f6efe2"/>` +
      tank(80, 70, 180, '#e6c56a', 'bed', on, true) +
      `<g data-hot="lauter" class="${hot('lauter', on)}"><path d="M200 200 H340" stroke="${teal}" stroke-width="6"/><circle cx="340" cy="200" r="8" fill="#f4e7c8" stroke="${ink}"/></g>` +
      tank(400, 90, 150, '#f0d48a', 'wort', on, false);
  }
  if (scene === 'beer-pour') {
    return `<rect width="640" height="340" fill="#f8f3e8"/>
      <rect x="60" y="230" width="520" height="16" fill="${wood}"/>` +
      tank(70, 60, 160, '#e2b15a', 'tank', on, false) +
      `<g data-hot="glass" class="${hot('glass', on)}"><path d="M300 110 h50 l10 90 h-70 z" fill="#f7fbfb" stroke="${ink}"/><rect x="312" y="150" width="34" height="40" fill="#e2b15a"/><rect x="312" y="130" width="34" height="22" fill="#f4f1ea"/></g>` +
      `<g data-hot="water" class="${hot('water', on)}"><path d="M470 120 h30 l8 70 h-46 z" fill="#f7fbfb" stroke="${teal}"/><rect x="478" y="150" width="18" height="30" fill="#9fd0dc"/></g>`;
  }
  if (scene === 'spirit-gate') {
    return skyGround('#f3e6d4') +
      `<g data-hot="grain" class="${hot('grain', on)}"><rect x="50" y="170" width="120" height="50" fill="#e6c56a"/></g>` +
      `<g data-hot="copper" class="${hot('copper', on)}"><path d="M280 200 C 280 120, 360 120, 360 200" fill="#c46a43" stroke="${ink}"/><rect x="300" y="200" width="40" height="40" fill="#a85632"/></g>` +
      `<g data-hot="house" class="${hot('house', on)}"><rect x="450" y="120" width="120" height="100" fill="#6b5344"/><text x="468" y="170" fill="#f4ead8" font-size="13" font-family="Inter, sans-serif">warehouse</text></g>`;
  }
  if (scene === 'spirit-stills') {
    const potOn = on === 'pot' || on === 'split';
    const colOn = on === 'column' || on === 'split';
    return `<rect width="640" height="340" fill="#2f3438"/>
      <text x="24" y="40" fill="#f4ead8" font-family="Fraunces, Georgia, serif" font-size="18">Pot or column · not both at once</text>
      <g data-hot="pot" opacity="${potOn ? 1 : .35}"><path d="M80 250 C 80 120, 250 120, 250 250 Z" fill="#c46a43" stroke="#f4ead8"/><rect x="150" y="90" width="16" height="40" fill="#e7b08a"/></g>
      <g data-hot="column" opacity="${colOn ? 1 : .35}"><rect x="420" y="60" width="54" height="200" fill="#d7e0e4" stroke="#f4ead8"/><path d="M430 90 H464 M430 120 H464 M430 150 H464 M430 180 H464" stroke="${teal}"/></g>
      <g data-hot="split"><rect x="270" y="250" width="100" height="36" rx="8" fill="#1c1917" stroke="#f4ead8"/><text x="286" y="274" fill="#f4ead8" font-size="13" font-family="Inter, sans-serif">keep apart</text></g>`;
  }
  if (scene === 'spirit-glass') {
    return `<rect width="640" height="340" fill="#3a332e"/>` +
      barrel(140, 180, 'cask', on) +
      `<g data-hot="proof" class="${hot('proof', on)}"><rect x="280" y="120" width="16" height="90" rx="6" fill="#fff" stroke="${ink}"/><rect x="284" y="160" width="8" height="40" fill="${clay}"/></g>` +
      `<g data-hot="glass" class="${hot('glass', on)}"><path d="M460 100 h40 l-4 50 h-32 z" fill="#f7fbfb" stroke="#f4ead8"/><rect x="468" y="120" width="24" height="24" fill="#8a5426"/><path d="M530 110 h20 l6 40 h-32 z" fill="none" stroke="#9fd0dc"/></g>`;
  }
  return skyGround();
}

function drawGate(campus, on) {
  const stops = campusStops(campus);
  const a = stops[0]?.title || campus.rooms;
  const b = stops[Math.floor(stops.length / 2)]?.title || campus.service;
  const c = stops[stops.length - 1]?.title || 'Service';
  const soon = campus.play === 'soon';
  return skyGround(campus.guild === 'source' ? '#d5e8ea' : campus.guild === 'energy' ? '#efe6f2' : '#e7f0ea') +
    `<text x="24" y="36" fill="${ink}" font-family="Fraunces, Georgia, serif" font-size="20">${campus.name} campus</text>` +
    `<g data-hot="yard" class="${hot('yard', on)}"><rect x="40" y="150" width="160" height="90" fill="#f4e7cf" stroke="${ink}"/><path d="M32 150 h176 l-88 -36 z" fill="${clay}"/></g>` +
    `<g data-hot="hall" class="${hot('hall', on)}"><rect x="240" y="120" width="160" height="120" fill="${steel}" stroke="${ink}"/><rect x="300" y="180" width="40" height="60" fill="${wood}"/></g>` +
    `<g data-hot="service" class="${hot('service', on)}"><rect x="450" y="160" width="150" height="80" fill="${sand}" stroke="${ink}"/><circle cx="500" cy="200" r="14" fill="#f7fbfb" stroke="${teal}"/></g>` +
    (soon ? `<text x="24" y="320" fill="${clay}" font-size="14" font-family="Inter, sans-serif">Adventure forthcoming · the campus is here</text>` : '') +
    `<!-- ${a} / ${b} / ${c} -->`;
}

function gateSpots(campus) {
  const stops = campusStops(campus);
  const pick = (i, id, x) => {
    const s = stops[i];
    return { id, x, y: 150, label: s ? s.title : campus.service, note: s ? s.note : campus.rooms, changed: 'Entry scene' };
  };
  if (!stops.length) {
    return [
      { id: 'yard', x: 120, y: 180, label: 'Yard', note: campus.rooms, changed: 'Yard in view' },
      { id: 'hall', x: 320, y: 160, label: 'Hall', note: campus.signal, changed: 'Hall in view' },
      { id: 'service', x: 520, y: 180, label: campus.service, note: `Service ends at the ${campus.service.toLowerCase()}.`, changed: 'Service counter marked' },
    ];
  }
  const mid = Math.floor((stops.length - 1) / 2);
  return [
    { ...pick(0, 'yard', 120), y: 180 },
    { ...pick(mid, 'hall', 320), y: 160 },
    { ...pick(stops.length - 1, 'service', 520), y: 190 },
  ];
}

function drawBeer(stop, on) {
  const H = id => `data-hot="${id}" class="${hot(id, on)}"`;
  const floor = `<rect width="640" height="340" fill="#f4ecdf"/><rect y="236" width="640" height="104" fill="#e3d0ae"/>`;
  const door = (id, x, fill) => `<g ${H(id)}><rect x="${x}" y="78" width="120" height="150" fill="#241c18" stroke="${ink}"/><rect x="${x + (on === id ? 70 : 10)}" y="92" width="${on === id ? 40 : 100}" height="124" fill="${fill}" stroke="${ink}"/></g>`;
  switch (stop.scene) {
    case 'yard':
      return skyGround('#efe6c8') +
        `<g ${H('barley')}><rect x="70" y="168" width="8" height="60" fill="#c4a15a"/><rect x="100" y="150" width="8" height="78" fill="#c4a15a"/><ellipse cx="110" cy="150" rx="46" ry="16" fill="#e6c56a"/></g>` +
        `<g ${H('field')}><rect x="40" y="190" width="140" height="40" fill="#d7b15a"/></g>` +
        `<g ${H('hops')}><path d="M280 230 V90 M320 230 V70 M360 230 V100" stroke="${leaf2}" stroke-width="4"/><circle cx="320" cy="120" r="12" fill="#d6e27a"/></g>` +
        `<g ${H('hall')}><rect x="250" y="120" width="140" height="110" fill="#f4e7cf" stroke="${ink}"/><path d="M242 120 h156 l-78 -28 z" fill="${clay}"/></g>` +
        `<g ${H('water')}><rect x="490" y="150" width="18" height="80" fill="${steel}" stroke="${ink}"/><path d="M499 230 v18" stroke="${teal}" stroke-width="4"/></g>` +
        `<g ${H('tap')}><path d="M500 140 h36 l8 60 h-52 z" fill="#f7fbfb" stroke="${ink}"/><rect x="508" y="160" width="24" height="28" fill="#e2b15a"/></g>`;
    case 'water':
      return floor + tank(70, 70, 160, '#d5eef2', 'source', on, false) +
        `<g ${H('minerals')}><rect x="280" y="150" width="28" height="40" fill="#fff" stroke="${ink}"/><rect x="320" y="160" width="28" height="30" fill="#f0e2a8" stroke="${ink}"/></g>` +
        `<g ${H('taste')}><path d="M480 130 h30 l8 50 h-46 z" fill="#f7fbfb" stroke="${teal}"/><rect x="488" y="155" width="18" height="20" fill="#9fd0dc"/></g>`;
    case 'malt':
      return floor +
        `<g ${H('steep')}><rect x="60" y="90" width="90" height="120" rx="8" fill="#c4a574" stroke="${ink}"/></g>` +
        `<g ${H('floor')}><rect x="220" y="170" width="180" height="50" fill="#e6c56a" stroke="${ink}"/></g>` +
        `<g ${H('kiln')}><rect x="460" y="80" width="110" height="140" fill="#6b5344"/><path d="M490 70 h50 l-10 30 h-30 z" fill="${clay}"/></g>`;
    case 'hop':
      return `<rect width="640" height="340" fill="#f7f3e4"/>` +
        `<g ${H('cone')}><ellipse cx="180" cy="170" rx="70" ry="90" fill="#c5d36a" stroke="${ink}"/><ellipse cx="180" cy="170" rx="24" ry="50" fill="#f4e27a"/></g>` +
        `<g ${H('bitter')}><circle cx="360" cy="150" r="36" fill="#8a9a3a" stroke="${ink}"/><text x="336" y="156" fill="#fff" font-size="14" font-family="Inter, sans-serif">boil</text></g>` +
        `<g ${H('aroma')}><circle cx="510" cy="170" r="36" fill="#d6e27a" stroke="${ink}"/><text x="484" y="176" fill="${ink}" font-size="14" font-family="Inter, sans-serif">late</text></g>`;
    case 'yeast':
      return floor +
        `<g ${H('pitch')}><rect x="80" y="80" width="70" height="140" rx="30" fill="${steel}" stroke="${ink}"/><ellipse cx="115" cy="110" rx="24" ry="10" fill="#f4f1ea"/></g>` +
        `<g ${H('scope')}><rect x="280" y="140" width="80" height="16" fill="#222"/><circle cx="300" cy="148" r="22" fill="#9fd" stroke="${ink}"/></g>` +
        `<g ${H('backup')}><rect x="480" y="150" width="36" height="50" rx="6" fill="#d8e6da" stroke="${teal}"/></g>`;
    case 'mill':
      return floor +
        `<g ${H('roller')}><circle cx="140" cy="160" r="36" fill="#888" stroke="${ink}"/><circle cx="190" cy="160" r="36" fill="#aaa" stroke="${ink}"/></g>` +
        `<g ${H('husk')}><ellipse cx="340" cy="180" rx="40" ry="16" fill="#e6c56a" stroke="${ink}"/></g>` +
        `<g ${H('grist')}><rect x="470" y="140" width="90" height="80" fill="#c4a574" stroke="${ink}"/></g>`;
    case 'mash':
      return floor + tank(60, 70, 160, '#e6c56a', 'bed', on, true) +
        `<g ${H('lauter')}><path d="M180 190 H340" stroke="${teal}" stroke-width="6"/></g>` +
        tank(420, 90, 140, '#f0d48a', 'wort', on, false);
    case 'kettle':
      return floor +
        `<g ${H('boil')}><ellipse cx="140" cy="150" rx="70" ry="50" fill="${steel}" stroke="${ink}"/><path d="M100 110 q20 -30 40 0 q20 -30 40 0" fill="none" stroke="#bbb" stroke-width="3"/></g>` +
        `<g ${H('clock')}><circle cx="340" cy="150" r="40" fill="#fffaf1" stroke="${ink}"/><path d="M340 150 L340 120" stroke="${clay}" stroke-width="3"/></g>` +
        `<g ${H('whirl')}><circle cx="510" cy="170" r="48" fill="none" stroke="${teal}" stroke-width="4"/><circle cx="510" cy="170" r="10" fill="#c4a574"/></g>`;
    case 'cgate':
      return `<rect width="640" height="340" fill="#2c3338"/>` +
        `<g ${H('hot')}><rect x="40" y="80" width="180" height="180" fill="#6b3a2a"/><text x="70" y="170" fill="#f4ead8" font-size="16" font-family="Inter, sans-serif">hot side</text></g>` +
        `<g ${H('exch')}><rect x="270" y="120" width="100" height="80" fill="${steel}" stroke="#f4ead8"/></g>` +
        `<g ${H('cold')}><rect x="430" y="80" width="170" height="180" fill="#1A5552"/><text x="460" y="170" fill="#f4ead8" font-size="16" font-family="Inter, sans-serif">cold side</text></g>`;
    case 'clean':
      return floor +
        `<g ${H('cip')}><rect x="70" y="100" width="90" height="120" rx="8" fill="${steel}" stroke="${ink}"/><path d="M80 140 H150" stroke="${teal}" stroke-width="4"/></g>` +
        `<g ${H('rinse')}><path d="M280 120 v80" stroke="${teal}" stroke-width="6"/><circle cx="280" cy="210" r="10" fill="#9fd0dc"/></g>` +
        `<g ${H('sign')}><rect x="430" y="130" width="140" height="70" fill="#fffaf1" stroke="${teal}"/><text x="454" y="170" fill="${teal}" font-size="16" font-family="Inter, sans-serif">signed</text></g>`;
    case 'ferment':
      return floor + tank(80, 60, 180, '#e2b15a', 'foam', on, true) +
        `<g ${H('temp')}><rect x="300" y="110" width="16" height="80" rx="8" fill="#fff" stroke="${ink}"/><rect x="304" y="150" width="8" height="34" fill="${clay}"/></g>` +
        `<g ${H('sample')}><circle cx="500" cy="180" r="16" fill="${grape}"/><rect x="490" y="196" width="20" height="28" fill="#fff" stroke="${ink}"/></g>`;
    case 'paths':
      return `<rect width="640" height="340" fill="#2c3338"/><text x="24" y="40" fill="#f4ead8" font-family="Fraunces, Georgia, serif" font-size="18">Three paths · open one</text>` +
        door('ale', 50, '#e2b15a') + door('lager', 250, '#f4e7c8') + door('mixed', 450, '#7a8f4a');
    case 'brite':
      return floor + tank(70, 70, 160, '#f7f3ea', 'chill', on, false) +
        `<g ${H('clear')}><rect x="280" y="140" width="26" height="70" fill="#f7f7f7" stroke="${ink}"/><rect x="320" y="150" width="26" height="60" fill="#f3e0c8" stroke="${ink}"/></g>` +
        `<g ${H('gas')}><circle cx="500" cy="150" r="28" fill="none" stroke="${teal}" stroke-width="4"/><circle cx="500" cy="150" r="8" fill="#9fd"/></g>`;
    case 'wood':
      return `<rect width="640" height="340" fill="#3a332e"/>` +
        `<g ${H('foeder')}>${barrel(160, 190, '', on)}</g>` +
        `<g ${H('bugs')}><rect x="280" y="140" width="100" height="60" fill="#fffaf1"/><text x="296" y="176" fill="${ink}" font-size="14" font-family="Inter, sans-serif">culture</text></g>` +
        `<g ${H('months')}><text x="460" y="180" fill="#f4ead8" font-family="Fraunces, Georgia, serif" font-size="28">|| |||</text></g>`;
    case 'lab':
      return `<rect width="640" height="340" fill="#eef3f2"/><rect x="40" y="200" width="560" height="16" fill="${wood}"/>` +
        `<g ${H('density')}><rect x="90" y="120" width="20" height="80" rx="8" fill="#fff" stroke="${ink}"/></g>` +
        `<g ${H('co2')}><circle cx="300" cy="160" r="30" fill="#d8e6da" stroke="${teal}"/></g>` +
        `<g ${H('taste')}><path d="M460 120 h30 l8 50 h-46 z" fill="#f7fbfb" stroke="${ink}"/><rect x="468" y="145" width="18" height="20" fill="#e2b15a"/></g>`;
    case 'compass':
      return `<rect width="640" height="340" fill="#f8f4ec"/>` +
        [['pale', '#f4e7c8', 70], ['dark', '#5a3318', 210], ['tart', '#d07a8a', 350], ['strong', '#e2b15a', 490]].map(([id, fill, x]) => `<g ${H(id)}><path d="M${x} 150 L${x + 80} 110 L${x + 80} 230 Z" fill="${fill}" stroke="${ink}" opacity="${on === id ? 1 : .45}"/></g>`).join('');
    case 'give':
      return skyGround('#e5f3ef') +
        `<g ${H('grain')}><rect x="60" y="170" width="100" height="50" fill="#c4a574"/></g>` +
        `<g ${H('heat')}><path d="M250 200 H420" stroke="${clay}" stroke-width="6"/><path d="M300 160 q20 -24 0 -40" fill="none" stroke="${clay}" stroke-width="3"/></g>` +
        `<g ${H('water')}><path d="M470 160 H580 V230 H500" fill="none" stroke="${teal}" stroke-width="6"/></g>`;
    case 'pack':
      return floor +
        `<g ${H('keg')}><rect x="80" y="110" width="70" height="100" rx="12" fill="${steel}" stroke="${ink}"/></g>` +
        `<g ${H('can')}><rect x="280" y="120" width="40" height="80" rx="6" fill="#d7e0e4" stroke="${ink}"/></g>` +
        `<g ${H('cold')}><rect x="430" y="150" width="150" height="70" fill="#d9eef2" stroke="${teal}"/></g>`;
    case 'pass':
      return `<rect width="640" height="340" fill="#f8f4ec"/><rect x="170" y="50" width="300" height="240" rx="8" fill="#fffaf1" stroke="${ink}"/>` +
        `<g ${H('style')}><text x="196" y="120" fill="${ink}" font-family="Fraunces, Georgia, serif" font-size="22">House pale</text></g>` +
        `<g ${H('lot')}><text x="196" y="180" fill="${teal}" font-size="16" font-family="Inter, sans-serif">Lot B22</text><rect x="190" y="156" width="120" height="32" fill="none" stroke="${teal}"/></g>` +
        `<g ${H('date')}><text x="196" y="240" fill="${clay}" font-size="16" font-family="Inter, sans-serif">keep cold</text></g>`;
    case 'menu':
      return floor +
        `<g ${H('dock')}><rect x="50" y="150" width="120" height="70" fill="#d9eef2" stroke="${teal}"/></g>` +
        `<g ${H('lines')}><path d="M220 120 V230 M260 120 V230 M300 120 V230" stroke="${teal}" stroke-width="4"/></g>` +
        `<g ${H('board')}><rect x="400" y="70" width="180" height="160" fill="#1c1917"/><text x="420" y="120" fill="#f4ead8" font-size="16" font-family="Inter, sans-serif">Water</text><text x="420" y="160" fill="#e2b15a" font-size="16" font-family="Inter, sans-serif">Pale</text><text x="420" y="200" fill="#f4ead8" font-size="16" font-family="Inter, sans-serif">Dark</text></g>`;
    case 'pour':
      return `<rect width="640" height="340" fill="#f8f3e8"/><rect x="80" y="240" width="480" height="16" fill="${wood}"/>` +
        `<g ${H('glass')}><path d="M120 90 h70 l14 110 h-98 z" fill="#f7fbfb" stroke="${ink}" stroke-width="2"/></g>` +
        `<g ${H('head')}><rect x="134" y="130" width="48" height="28" fill="#f4f1ea"/><rect x="134" y="158" width="48" height="36" fill="#e2b15a"/></g>` +
        `<g ${H('water')}><path d="M460 110 h36 l8 70 h-52 z" fill="#f7fbfb" stroke="${teal}"/><rect x="470" y="145" width="20" height="28" fill="#9fd0dc"/></g>`;
    default:
      return floor;
  }
}

function boardSVG(campus, stopN, spotId) {
  const full = fullStops(campus.id);
  if (full && stopN > 0) {
    const stop = full[stopN - 1];
    const on = spotId || stop.spots[0].id;
    const svg = campus.id === 'beer' ? drawBeer(stop, on) : drawWine(stop, on);
    return { svg, spots: stop.spots, spot: stop.spots.find(s => s.id === on) || stop.spots[0] };
  }
  const sample = SAMPLES[campus.id]?.[stopN];
  if (sample) {
    const on = spotId || sample.spots[0].id;
    return { svg: drawSample(sample.scene, on), spots: sample.spots, spot: sample.spots.find(s => s.id === on) || sample.spots[0] };
  }
  const spots = gateSpots(campus);
  const on = spotId || 'hall';
  return { svg: drawGate(campus, on), spots, spot: spots.find(s => s.id === on) || spots[0] };
}

function ring(seen, total) {
  const p = total ? seen / total : 0;
  const c = 2 * Math.PI * 16;
  return `<svg class="ac-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="#eadcc4" stroke-width="4"/><circle cx="20" cy="20" r="16" fill="none" stroke="#1A5552" stroke-width="4" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 20 20)"/></svg>`;
}

export function mountAcademy(root) {
  root.innerHTML = `<div class="ac-atlas"></div><div class="ac-player" hidden></div>`;
  const atlas = $('.ac-atlas', root);
  const player = $('.ac-player', root);
  const state = { campus: null, n: 1, spot: null, tab: null };

  function renderAtlas(guildId) {
    state.campus = null;
    player.hidden = true;
    atlas.hidden = false;
    const prog = loadProg();
    const guild = GUILDS.find(g => g.id === guildId) || null;
    atlas.innerHTML = `
      <div class="ac-head">
        <p class="eyebrow">Academy · 5 guilds · 15 campuses</p>
        <h2>Pick a campus. <em>Wine and beer play all 22.</em></h2>
        <p class="ac-lead">Spirits opens three sample stops. The other campuses keep a stop list and an entry scene. Equipment index: ${EQUIP_INDEX} tools across 15 campuses.</p>
      </div>
      <div class="ac-guilds" role="tablist" aria-label="Guilds">
        <button type="button" role="tab" data-guild="" aria-selected="${!guild}">All</button>
        ${GUILDS.map(g => `<button type="button" role="tab" data-guild="${g.id}" aria-selected="${guild?.id === g.id}">${g.name}</button>`).join('')}
      </div>
      <div class="ac-grid">
        ${CAMPUSES.filter(c => !guild || c.guild === guild.id).map(c => {
          const stops = campusStops(c);
          const seen = (prog.seen[c.id] || []).length;
          const badge = fullStops(c.id) ? `${stops.length} playable` : c.play === 'sample' ? `3 of ${stops.length} playable` : c.play === 'soon' ? 'Forthcoming' : `${stops.length} stops · entry scene`;
          return `<article class="ac-card" data-campus="${c.id}">
            <p class="ac-g">${GUILDS.find(g => g.id === c.guild).name}${c.equip ? ` · ${c.equip}` : ''}</p>
            <h3>${c.name}</h3>
            <p class="ac-sig">${c.signal}</p>
            <p class="ac-rooms">${c.rooms}</p>
            <p class="ac-badge">${ring(c.play === 'soon' ? 0 : seen, stops.length || 1)}<span>${badge}${seen ? ` · ${seen} opened` : ''}</span></p>
            <button type="button" data-enter="${c.id}">${c.play === 'soon' ? 'View campus' : 'Enter'}</button>
          </article>`;
        }).join('')}
      </div>`;
  }

  function stopMeta(campus, n) {
    const full = fullStops(campus.id);
    if (full) return full[n - 1];
    const list = campusStops(campus);
    const row = list[n - 1];
    if (!row) return null;
    const sample = SAMPLES[campus.id]?.[n];
    return {
      n, id: `s${n}`, title: row.title, note: row.note, guide: n % 3 === 1 ? 'Sippy' : n % 3 === 2 ? 'Roma' : 'Hummin',
      spots: sample ? sample.spots : gateSpots(campus),
      dive: null, taste: false, playable: row.playable, chart: null,
    };
  }

  function renderPlayer() {
    const campus = CAMPUSES.find(c => c.id === state.campus);
    const list = campusStops(campus);
    const total = Math.max(list.length, 1);
    if (campus.play === 'soon') state.n = 1;
    state.n = Math.min(Math.max(1, state.n), total || 1);
    const meta = campus.play === 'soon' ? {
      n: 1, title: campus.name + ' campus', note: campus.rooms + ' Adventure forthcoming.', guide: 'Sippy', spots: gateSpots(campus),
    } : stopMeta(campus, state.n);
    if (!state.spot || !meta.spots.some(s => s.id === state.spot)) state.spot = meta.spots[0].id;
    const board = boardSVG(campus, campus.play === 'soon' ? 0 : state.n, state.spot);
    const spot = board.spot;
    const guide = GUIDES[meta.guide] || GUIDES.Sippy;
    const prog = campus.play === 'soon' ? loadProg() : markSeen(campus.id, state.n);
    const seen = (prog.seen[campus.id] || []).length;
    const fullStop = fullStops(campus.id)?.[state.n - 1] || null;
    const wine = campus.id === 'wine' ? fullStop : null;
    atlas.hidden = true;
    player.hidden = false;
    player.innerHTML = `
      <div class="ac-playhead">
        <button type="button" class="ac-back" data-back>← Campuses</button>
        <div class="ac-stopn"><b>Stop ${campus.play === 'soon' ? '—' : state.n} of ${campus.play === 'soon' ? '—' : total}</b><span>${campus.name}</span></div>
        <div class="ac-nav">
          <button type="button" data-dir="-1" ${state.n <= 1 || campus.play === 'soon' ? 'disabled' : ''}>Previous</button>
          <button type="button" data-dir="1" ${state.n >= total || campus.play === 'soon' ? 'disabled' : ''}>Next</button>
        </div>
        <p class="ac-seen">${ring(seen, total)} ${seen} / ${total || 0} opened</p>
      </div>
      <div class="ac-stage-wrap">
        <div class="ac-stage">
          <svg viewBox="0 0 640 340" class="ac-svg" role="img" aria-label="${meta.title}">${board.svg}</svg>
          ${board.spots.map(sp => `<button type="button" class="ac-spot${sp.id === spot.id ? ' on' : ''}" style="left:${(sp.x / 640 * 100).toFixed(1)}%;top:${(sp.y / 340 * 100).toFixed(1)}%" data-spot="${sp.id}" aria-pressed="${sp.id === spot.id}">${sp.label}</button>`).join('')}
          <i class="ac-drop" style="left:${(spot.x / 640 * 100).toFixed(1)}%;top:${(spot.y / 340 * 100).toFixed(1)}%" aria-hidden="true"></i>
        </div>
        <aside class="ac-note sip-note">
          <p class="k">${guideName(meta.guide)} · ${guide.role}</p>
          <h3>${meta.title}</h3>
          <p>${meta.note}</p>
          <p class="spot-note"><b>${spot.label}.</b> ${spot.note}</p>
          <p class="act"><b>What changed</b> ${spot.changed}</p>
          <div class="row">
            ${wine ? `<a href="#world/${wine.chart}/arc-${wine.id}">World ${wine.chart} →</a><a href="#outline/${wine.chart}/${wine.id}">Outline →</a>` : ''}
            ${wine?.dive ? `<button type="button" data-open-dive="${wine.dive}">Deep dive</button>` : ''}
            ${!fullStop && campus.play !== 'soon' ? `<span class="muted">${meta.playable ? 'Sample stop' : 'On the list · entry scene stays'}</span>` : ''}
          </div>
          ${fullStop?.taste ? tasteHTML() : ''}
          ${campus.id === 'wine' ? fieldGuideHTML() : ''}
        </aside>
      </div>
      ${campus.note ? `<p class="ac-campus-note">${campus.note}</p>` : ''}
      ${list.length ? `<ol class="ac-rail">${list.map(st => `<li><button type="button" data-n="${st.n}" aria-current="${st.n === state.n}" class="${st.playable ? 'play' : ''}"><b>${st.n}</b>${st.title}</button></li>`).join('')}</ol>` : `<p class="ac-campus-note">${campus.rooms}</p>`}
    `;
    player.querySelector(`[data-n="${state.n}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function guideName(name) { return name || 'Sippy'; }

  function show(id, n) {
    if (!id) return renderAtlas(null);
    if (id.startsWith('guild-')) return renderAtlas(id.slice(6));
    const campus = CAMPUSES.find(c => c.id === id);
    if (!campus) return renderAtlas(null);
    const changedCampus = state.campus !== campus.id;
    state.campus = campus.id;
    if (n) state.n = n;
    else if (changedCampus || !state.n) {
      const last = loadProg().last;
      state.n = last?.campus === campus.id ? last.n : 1;
    }
    if (changedCampus || n) state.spot = null;
    renderPlayer();
  }

  root.addEventListener('click', e => {
    const g = e.target.closest('[data-guild]');
    if (g && atlas.contains(g)) {
      location.hash = g.dataset.guild ? `academy/guild-${g.dataset.guild}` : 'academy';
      return;
    }
    const enter = e.target.closest('[data-enter]');
    if (enter) {
      location.hash = `academy/${enter.dataset.enter}`;
      return;
    }
    if (!player.contains(e.target)) return;
    if (e.target.closest('[data-back]')) { location.hash = 'academy'; return; }
    const dir = e.target.closest('[data-dir]');
    if (dir && !dir.disabled) {
      state.n += Number(dir.dataset.dir);
      state.spot = null;
      location.hash = `academy/${state.campus}/${state.n}`;
      return;
    }
    const spot = e.target.closest('[data-spot]');
    if (spot) { state.spot = spot.dataset.spot; renderPlayer(); return; }
    const jump = e.target.closest('[data-n]');
    if (jump) {
      state.n = Number(jump.dataset.n);
      state.spot = null;
      location.hash = `academy/${state.campus}/${state.n}`;
      return;
    }
    const dive = e.target.closest('[data-open-dive]');
    if (dive) dispatchEvent(new CustomEvent('sip:dive', { detail: Number(dive.dataset.dive) }));
  });

  document.addEventListener('keydown', e => {
    if (document.body.dataset.mode !== 'academy' || player.hidden) return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { const b = $('[data-dir="1"]', player); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
    else if (e.key === 'ArrowLeft') { const b = $('[data-dir="-1"]', player); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
    else if (e.key === 'Escape') { if (!$('#dive') || $('#dive').hidden) location.hash = 'academy'; }
    else if (/^[1-9]$/.test(e.key)) {
      const buttons = $$('.ac-spot', player);
      const hit = buttons[Number(e.key) - 1];
      if (hit) { e.preventDefault(); hit.click(); }
    }
  });

  return { show, get state() { return state; } };
}

export { DIVES };
