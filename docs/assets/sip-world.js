// Sip-Stack · World (isometric 3x3) + Outline (Mermaid) dual view.
// Original Sip Studies teaching graphics. Plain SVG, no build step.

const NS = 'http://www.w3.org/2000/svg';
const LINE = '#3a312b';
const PAL = {
  clay: '#914C2C', teal: '#1A5552', mauve: '#817985', mint: '#D8E6DA', sand: '#EDD4A8',
  paper: '#f4ead8', wood: '#8a5a3c', sage: '#a9bfa6', leaf: '#5f8a6e', gold: '#d9c27a',
  white: '#d7d39a', red: '#5e2f3f', steel: '#b9b4bd', cream: '#fbf5ea', water: '#7fb3b0',
};

/* ---------- color + iso helpers ---------- */
function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
const light = (c, t = 0.22) => mix(c, '#ffffff', t);
const dark = (c, t = 0.18) => mix(c, '#1c1410', t);

const U = 14, CX = Math.cos(Math.PI / 6), OX = 120, OY = 44;
const P = (x, y, z = 0) => [OX + (x - y) * CX * U, OY + (x + y) * 0.5 * U - z * U];
const pts = (arr) => arr.map(p => P(...p).map(n => n.toFixed(1)).join(',')).join(' ');
const poly = (arr, fill, extra = '') =>
  `<polygon points="${pts(arr)}" fill="${fill}" stroke="${LINE}" stroke-width=".7" stroke-linejoin="round" ${extra}/>`;

/* ---------- primitives (each returns {d: depth, s: svg}) ---------- */
function box(x, y, z, w, d, h, c, extra = '') {
  const s =
    poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], c, extra) +
    poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], dark(c), extra) +
    poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], light(c), extra);
  return { d: x + w / 2 + y + d / 2 + z * 0.01, s };
}
function slab(c, x = 0, y = 0, w = 8, d = 8, h = 0.55) {
  return { d: -100, s: box(x, y, -h, w, d, h, c).s };
}
function house(x, y, w, d, h, roofH, wall, roof, opts = {}) {
  let s = box(x, y, 0, w, d, h, wall).s;
  s += poly([[x, y + d, h], [x + w, y + d, h], [x + w, y + d / 2, h + roofH], [x, y + d / 2, h + roofH]], roof);
  s += poly([[x + w, y, h], [x + w, y + d, h], [x + w, y + d / 2, h + roofH]], dark(wall, 0.08));
  // door on front (y+d) face
  const dw = Math.min(0.7, w * 0.25), dx = x + w * 0.5 - dw / 2;
  s += poly([[dx, y + d, 0], [dx + dw, y + d, 0], [dx + dw, y + d, h * 0.55], [dx, y + d, h * 0.55]], dark(wall, 0.45));
  // window on side
  s += poly([[x + w, y + d * 0.3, h * 0.45], [x + w, y + d * 0.6, h * 0.45], [x + w, y + d * 0.6, h * 0.75], [x + w, y + d * 0.3, h * 0.75]], PAL.sand);
  if (opts.chimney) {
    const [cx, cy, ch] = opts.chimney;
    s += box(cx, cy, h, 0.45, 0.45, ch, dark(wall, 0.1)).s;
    const [px, py] = P(cx + 0.22, cy + 0.22, h + ch);
    for (let i = 0; i < 3; i++)
      s += `<circle class="puff" style="--delay:${(i * 1.05).toFixed(2)}s" cx="${px}" cy="${py - 3}" r="3.2" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".5"/>`;
  }
  return { d: x + w / 2 + y + d / 2, s };
}
function cyl(cx, cy, z, r, h, c, opts = {}) {
  const [bx, by] = P(cx, cy, z), [, ty] = P(cx, cy, z + h);
  const rx = r * U * 1.2247, ry = r * U * 0.7071;
  let s = `<path d="M${bx - rx},${by} L${bx - rx},${ty} A${rx},${ry} 0 0 0 ${bx + rx},${ty} L${bx + rx},${by} A${rx},${ry} 0 0 1 ${bx - rx},${by} Z" fill="${c}" stroke="${LINE}" stroke-width=".7"/>`;
  // right-side shading
  s += `<path d="M${bx + rx * 0.35},${by + ry * 0.94} L${bx + rx * 0.35},${ty + ry * 0.94} A${rx},${ry} 0 0 0 ${bx + rx},${ty} L${bx + rx},${by} A${rx},${ry} 0 0 1 ${bx + rx * 0.35},${by + ry * 0.94} Z" fill="${dark(c, 0.14)}" stroke="none"/>`;
  if (opts.hoops) for (const t of opts.hoops) {
    const hy = by - (by - ty) * t;
    s += `<path d="M${bx - rx},${hy} A${rx},${ry} 0 0 0 ${bx + rx},${hy}" fill="none" stroke="${LINE}" stroke-width=".7"/>`;
  }
  s += `<ellipse cx="${bx}" cy="${ty}" rx="${rx}" ry="${ry}" fill="${light(c, 0.2)}" stroke="${LINE}" stroke-width=".7"/>`;
  return { d: cx + cy + z * 0.01, s };
}
function bottle(cx, cy, z, c, scale = 1) {
  const a = cyl(cx, cy, z, 0.22 * scale, 0.9 * scale, c);
  const b = cyl(cx, cy, z + 0.9 * scale, 0.08 * scale, 0.45 * scale, c);
  return { d: a.d, s: a.s + b.s };
}
function glass(cx, cy, z, fill) {
  const [bx, by] = P(cx, cy, z);
  return { d: cx + cy + 0.2, s:
    `<path d="M${bx - 2.6},${by - 9} L${bx + 2.6},${by - 9} L${bx + 0.5},${by - 4} L${bx + 0.5},${by - 0.6} L${bx + 2},${by} L${bx - 2},${by} L${bx - 0.5},${by - 0.6} L${bx - 0.5},${by - 4} Z" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".6"/>` +
    `<path d="M${bx - 2},${by - 7.6} L${bx + 2},${by - 7.6} L${bx + 0.6},${by - 4.6} L${bx - 0.6},${by - 4.6} Z" fill="${fill}"/>` };
}
function figure(cx, cy, c, opts = {}) {
  const [bx, by] = P(cx, cy, 0);
  const cls = opts.cls || '';
  return { d: cx + cy + 0.3, s:
    `<g class="${cls}" ${opts.style ? `style="${opts.style}"` : ''}>` +
    `<ellipse cx="${bx}" cy="${by}" rx="3.4" ry="1.6" fill="${LINE}" opacity=".18"/>` +
    `<path d="M${bx - 3},${by - 1} L${bx - 2.2},${by - 11} Q${bx},${by - 13} ${bx + 2.2},${by - 11} L${bx + 3},${by - 1} Z" fill="${c}" stroke="${LINE}" stroke-width=".7"/>` +
    `<circle cx="${bx}" cy="${by - 15}" r="3" fill="${PAL.sand}" stroke="${LINE}" stroke-width=".7"/></g>` };
}
function cluster(cx, cy, z, c, r = 1.7) {
  const [bx, by] = P(cx, cy, z);
  const rows = [[0, -6, 3], [-1, -3, 2], [0, 0, 1]];
  let s = `<path d="M${bx},${by - 10} q 3,-4 7,-3 q -3,3 -7,3" fill="${PAL.leaf}" stroke="${LINE}" stroke-width=".6"/>`;
  s += `<path d="M${bx},${by - 11} L${bx},${by - 7}" stroke="${LINE}" stroke-width=".8"/>`;
  for (const [off, dy, n] of rows)
    for (let i = 0; i < n; i++) {
      const x = bx + (i - (n - 1) / 2) * r * 2 + off * 0;
      s += `<circle cx="${x.toFixed(1)}" cy="${(by + dy).toFixed(1)}" r="${r}" fill="${c}" stroke="${LINE}" stroke-width=".5"/>`;
    }
  return { d: cx + cy + z * 0.01 + 0.5, s };
}
function bush(cx, cy, z, c) {
  const [bx, by] = P(cx, cy, z);
  return { d: cx + cy + z * 0.01 + 0.2, s:
    `<g class="sway"><circle cx="${bx - 4}" cy="${by - 3}" r="4.4" fill="${c}" stroke="${LINE}" stroke-width=".6"/>` +
    `<circle cx="${bx + 3.5}" cy="${by - 3.5}" r="4.2" fill="${dark(c, 0.08)}" stroke="${LINE}" stroke-width=".6"/>` +
    `<circle cx="${bx}" cy="${by - 7}" r="4.6" fill="${light(c, 0.12)}" stroke="${LINE}" stroke-width=".6"/></g>` };
}
function line3(a, b, w = 0.6, c = LINE, extra = '') {
  const [x1, y1] = P(...a), [x2, y2] = P(...b);
  return { d: (a[0] + a[1] + b[0] + b[1]) / 2, s: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" ${extra}/>` };
}
function mover(item, from, to, dur, delay = 0) {
  const [x1, y1] = P(...from), [x2, y2] = P(...to);
  return { d: item.d, s: `<g class="mover" style="--tx:${(x2 - x1).toFixed(1)}px;--ty:${(y2 - y1).toFixed(1)}px;--dur:${dur}s;--delay:${delay}s">${item.s}</g>` };
}
function drop(cx, cy, z, delay) {
  const [bx, by] = P(cx, cy, z);
  return { d: cx + cy + 0.1, s: `<path class="drip" style="--delay:${delay}s;--ty:${U * z - 2}px" d="M${bx},${by - 2.4} q 1.6,2.4 0,3.4 q -1.6,-1 0,-3.4 Z" fill="${PAL.water}" stroke="${LINE}" stroke-width=".4"/>` };
}
function label(at, text, dx, dy, small = false) {
  const [x, y] = P(...at), ex = x + dx, ey = y + dy;
  const anchor = dx < 0 ? 'end' : 'start';
  return `<circle class="dot" cx="${x}" cy="${y}" r="1.2"/><path class="leader" d="M${x},${y} L${ex},${ey} L${ex + (dx < 0 ? -6 : 6)},${ey}"/>` +
    `<text class="lbl${small ? ' s' : ''}" x="${ex + (dx < 0 ? -8 : 8)}" y="${ey + 3}" text-anchor="${anchor}">${text}</text>`;
}
const stripe = (x, y, w, d, c) => ({ d: -50, s: poly([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]], c, 'stroke-width=".4"') });

/* ---------- the nine scenes ---------- */
const SCENES = {
  '01'() { // Vine Training & Canopy Care
    const it = [slab(PAL.sage)];
    for (const y of [1.2, 3.9, 6.6]) {
      it.push(stripe(0.2, y - 0.25, 7.6, 0.9, mix(PAL.wood, PAL.sage, 0.55)));
      for (const x of [0.5, 3.9, 7.2]) it.push(box(x, y, 0, 0.25, 0.25, 2.3, PAL.wood));
      it.push(line3([0.6, y + 0.1, 1.5], [7.3, y + 0.1, 1.5]));
      it.push(line3([0.6, y + 0.1, 2.1], [7.3, y + 0.1, 2.1]));
      for (const x of [1.4, 2.6, 5.0, 6.2]) {
        it.push(bush(x, y + 0.2, 1.5, PAL.leaf));
        it.push(cluster(x + 0.25, y + 0.55, 1.15, PAL.red, 1.1));
      }
      for (let i = 0; i < 3; i++) it.push(drop(1.6 + i * 2.2, y + 0.5, 0.9, i * 0.7 + y * 0.2));
    }
    it.push(mover(figure(0.2, 2.7, PAL.clay), [0.2, 2.7, 0], [7.8, 2.7, 0], 9));
    return { it, labels: [label([6.2, 6.8, 2.4], 'canopy', 18, 22), label([7.3, 1.3, 2.1], 'trellis wire', 10, -12, true)] };
  },
  '02'() { // White grapes — species analysis
    const it = [slab(PAL.sand)];
    const fam = [['Crisp', PAL.mint, 0.9], ['Floral', mix(PAL.mauve, '#ffffff', 0.55), 1.4], ['Rich', mix(PAL.gold, PAL.sand, 0.2), 1.9]];
    fam.forEach(([, c, h], i) => {
      const x = 1 + i * 2.4, y = 4.6 - i * 0.2;
      it.push(box(x, y, 0, 1.5, 1.5, h, c));
      it.push(cluster(x + 0.75, y + 0.75, h, PAL.white, 1.6));
    });
    for (let i = 0; i < 4; i++) it.push(box(5.4, 0.9, i * 0.22, 1.9, 1.4, 0.18, i % 2 ? PAL.cream : PAL.mint));
    it.push(figure(2.2, 7.4, PAL.teal, { cls: 'bob' }));
    return { it, labels: [
      label([1.75, 6.1, 0.3], 'Crisp', -14, 16), label([4.15, 5.9, 0.3], 'Floral', 4, 22), label([7.3, 5.15, 0.9], 'Rich', 14, 14),
      label([6.3, 1.6, 0.9], '11 varieties', 14, -18, true)] };
  },
  '03'() { // Red grapes — species analysis
    const it = [slab(mix(PAL.mauve, PAL.sand, 0.55))];
    const fam = [['Light', mix(PAL.clay, '#ffffff', 0.55), 0.9], ['Medium', mix(PAL.clay, '#ffffff', 0.25), 1.5], ['Bold', PAL.clay, 2.1]];
    fam.forEach(([, c, h], i) => {
      const x = 1 + i * 2.4, y = 4.6 - i * 0.2;
      it.push(box(x, y, 0, 1.5, 1.5, h, c));
      it.push(cluster(x + 0.75, y + 0.75, h, i === 0 ? '#9a4a5a' : PAL.red, 1.6));
    });
    for (let i = 0; i < 5; i++) it.push(box(5.4, 0.9, i * 0.22, 1.9, 1.4, 0.18, i % 2 ? PAL.cream : PAL.sand));
    it.push(cyl(1.6, 1.6, 0, 0.6, 1.2, PAL.wood, { hoops: [0.25, 0.75] }));
    it.push(figure(2.4, 7.4, PAL.teal, { cls: 'bob' }));
    return { it, labels: [
      label([1.75, 6.1, 0.3], 'Light', -14, 16), label([4.15, 5.9, 0.3], 'Medium', 4, 22), label([7.3, 5.15, 1.0], 'Bold', 14, 14),
      label([6.3, 1.6, 1.1], '14 varieties', 14, -18, true)] };
  },
  '04'() { // Harvest & Field Gear
    const it = [slab(PAL.sage)];
    it.push(stripe(4.2, 0.2, 3.6, 3.6, PAL.gold));
    for (let r = 0; r < 4; r++) it.push(stripe(4.4, 0.4 + r * 0.9, 3.2, 0.12, dark(PAL.gold, 0.15)));
    for (const y of [0.8, 2.4]) for (const x of [0.8, 2.4]) it.push(bush(x, y, 0.4, PAL.leaf));
    it.push(box(6.4, 5.6, 0, 0.18, 0.18, 3, PAL.wood)); it.push(bush(6.5, 5.7, 2.6, '#7fa37a'));
    // tractor
    it.push(box(1.0, 5.0, 0.3, 1.8, 1.0, 0.7, PAL.teal));
    it.push(box(1.0, 5.0, 1.0, 0.8, 1.0, 0.8, light(PAL.teal, 0.3)));
    it.push(cyl(2.4, 6.1, 0, 0.35, 0.18, LINE));
    // bins rolling to the house
    for (let i = 0; i < 3; i++)
      it.push(mover(box(2.4, 4.3, 0, 0.55, 0.55, 0.4, PAL.clay), [2.4, 4.3, 0], [6.6, 4.3, 0], 6, i * 2));
    it.push(house(5.6, 6.0, 2.0, 1.8, 1.2, 0.8, PAL.cream, PAL.clay));
    return { it, labels: [label([6.1, 2.0, 0], 'grain & hops', 18, -26, true), label([1.6, 1.6, 0.9], 'grapes', -10, -14, true), label([7.6, 6.9, 1.0], 'making house', 14, 14, true)] };
  },
  '05'() { // Making Houses
    const it = [slab(PAL.sand)];
    it.push(stripe(0.3, 6.9, 7.4, 0.6, mix(PAL.sand, LINE, 0.1)));
    it.push(house(0.4, 3.8, 2.2, 2.4, 1.3, 0.9, mix(PAL.clay, '#ffffff', 0.35), PAL.clay));
    it.push(house(3.0, 2.2, 2.1, 2.4, 1.8, 0.9, mix(PAL.teal, '#ffffff', 0.45), PAL.teal, { chimney: [3.4, 2.6, 1.0] }));
    it.push(house(5.6, 0.4, 2.0, 2.3, 2.2, 0.9, mix(PAL.mauve, '#ffffff', 0.4), PAL.mauve, { chimney: [6.2, 0.8, 1.4] }));
    it.push(cyl(7.0, 4.0, 0, 0.55, 1.0, '#c07a4a')); it.push(cyl(7.0, 4.0, 1.0, 0.22, 0.6, '#c07a4a'));
    for (let i = 0; i < 3; i++) it.push(mover(cyl(0.2, 7.2, 0, 0.18, 0.3, PAL.water), [0.2, 7.2, 0], [7.6, 7.2, 0], 7, i * 2.3));
    return { it, labels: [label([1.5, 6.2, 1.0], 'Cellar', -14, 12), label([4.05, 4.6, 0.6], 'Brew House', -10, 40), label([6.6, 2.7, 2.0], 'Still House', 20, 6), label([7.5, 4.0, 0.6], 'pot still', 12, 14, true)] };
  },
  '06'() { // Aging Patterns & Country Styles
    const it = [slab(mix(PAL.sand, PAL.mauve, 0.15))];
    const lanes = [PAL.mint, PAL.sand, mix(PAL.clay, '#ffffff', 0.6)];
    lanes.forEach((c, i) => it.push(stripe(0.3 + i * 2.6, 0.3, 2.2, 7.4, c)));
    it.push(cyl(1.4, 3.0, 0, 0.7, 2.2, PAL.steel, { hoops: [0.5] }));
    it.push(cyl(1.4, 5.6, 0, 0.55, 1.6, PAL.steel));
    it.push(box(3.2, 2.2, 0, 1.6, 1.0, 1.6, PAL.wood));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const [bx, by] = P(3.2 + 1.6, 2.2 + 0.15 + c * 0.22, 0.35 + r * 0.45);
      it.push({ d: 5.5, s: `<circle cx="${bx}" cy="${by}" r="1.7" fill="${PAL.teal}" stroke="${LINE}" stroke-width=".4"/>` });
    }
    it.push(box(3.3, 5.2, 0, 1.4, 1.4, 0.2, PAL.cream));
    for (const [x, y] of [[6.0, 2.0], [7.2, 2.0], [6.0, 4.6], [7.2, 4.6]]) it.push(cyl(x, y, 0, 0.55, 1.1, PAL.wood, { hoops: [0.2, 0.8] }));
    it.push(cyl(6.6, 3.3, 1.1, 0.55, 1.1, PAL.wood, { hoops: [0.2, 0.8] }));
    return { it, labels: [label([1.4, 3.0, 2.2], 'Fresh', -12, -14), label([4.0, 2.7, 1.6], 'Rested', -4, -26), label([6.6, 3.3, 2.2], 'Wood', 14, -16), label([4.0, 5.9, 0.2], 'label clues', 8, 30, true)] };
  },
  '07'() { // Bottle to Shelf
    const it = [slab(PAL.mint)];
    it.push(box(0.4, 3.0, 0, 5.2, 1.0, 0.7, PAL.mauve));
    it.push(stripe(0.4, 3.0, 5.2, 1.0, PAL.mauve));
    it.push(cyl(1.1, 1.2, 0, 0.8, 2.2, PAL.steel, { hoops: [0.3, 0.7] }));
    for (let i = 0; i < 4; i++) it.push(mover(bottle(0.6, 3.5, 0.7, PAL.teal, 0.9), [0.6, 3.5, 0.7], [5.4, 3.5, 0.7], 6, i * 1.5));
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) it.push(box(4.4 + i * 0.7, 5.0 + j * 0.7, 0, 0.6, 0.6, 0.6, PAL.sand));
    // truck
    it.push(box(5.9, 0.6, 0.35, 1.7, 2.8, 1.6, PAL.cream));
    it.push(box(5.9, 3.4, 0.35, 1.7, 1.0, 1.1, PAL.clay));
    it.push(cyl(7.65, 1.3, 0, 0.32, 0.15, LINE)); it.push(cyl(7.65, 3.9, 0, 0.32, 0.15, LINE));
    return { it, labels: [label([1.1, 1.2, 2.2], 'tank', -10, -12, true), label([3.0, 3.5, 1.4], 'bottle · can · keg', -14, 34, true), label([6.75, 2.0, 1.95], 'shop door', 12, -14, true)] };
  },
  '08'() { // Retail Floor
    const it = [slab(PAL.cream)];
    it.push(stripe(0.3, 6.4, 2.2, 1.3, mix(PAL.sand, LINE, 0.12)));
    for (let i = 0; i < 3; i++) {
      const x = 0.6 + i * 2.1;
      it.push(box(x, 0.5, 0, 1.6, 0.7, 2.2, PAL.wood));
      for (let s = 0; s < 3; s++) for (let b = 0; b < 4; b++)
        it.push(bottle(x + 0.25 + b * 0.38, 1.25, 0.25 + s * 0.68, [PAL.clay, PAL.teal, PAL.gold][(b + s + i) % 3], 0.42));
    }
    it.push(box(4.0, 3.6, 0, 2.2, 0.9, 1.0, mix(PAL.sand, PAL.wood, 0.25)));
    for (let b = 0; b < 5; b++) it.push(bottle(4.25 + b * 0.42, 4.05, 1.0, [PAL.clay, PAL.teal, PAL.gold, PAL.red, PAL.teal][b], 0.5));
    it.push(box(6.8, 1.0, 0, 1.0, 2.8, 2.4, PAL.teal));
    it.push(poly([[6.8, 1.2, 0.3], [6.8, 3.6, 0.3], [6.8, 3.6, 2.1], [6.8, 1.2, 2.1]], 'rgba(216,230,218,.55)'));
    it.push(box(1.0, 4.4, 0, 2.6, 1.0, 1.0, PAL.clay));
    it.push(box(2.8, 4.5, 1.0, 0.6, 0.5, 0.4, PAL.mint));
    it.push(figure(2.0, 3.8, PAL.teal, { cls: 'bob' }));
    it.push(mover(figure(7.6, 6.2, PAL.mauve), [7.6, 6.2, 0], [4.2, 6.2, 0], 7));
    for (let i = 0; i < 3; i++) it.push(mover(box(0.6, 6.7, 0, 0.6, 0.6, 0.5, PAL.sand), [0.6, 6.7, 0], [0.6, 4.0, 0], 5, i * 1.7));
    return { it, labels: [label([1.0, 4.9, 0.8], 'checkout', -12, -16, true), label([7.3, 1.0, 2.4], 'beer cooler', 10, -14, true), label([1.2, 6.9, 0.3], 'back dock · FIFO', -10, 22, true)] };
  },
  '09'() { // Table & Tap
    const it = [slab(mix(PAL.sand, PAL.clay, 0.12))];
    // bar + taps
    it.push(box(0.5, 0.6, 0, 6.8, 1.1, 1.3, PAL.wood));
    it.push(box(2.6, 0.9, 1.3, 0.25, 0.25, 1.0, PAL.steel));
    it.push(box(2.0, 0.85, 2.2, 1.4, 0.35, 0.25, PAL.steel));
    for (const x of [2.2, 2.7, 3.2]) it.push(box(x, 1.0, 1.6, 0.12, 0.12, 0.6, [PAL.clay, PAL.gold, PAL.teal][Math.round((x - 2.2) * 2)]));
    for (let i = 0; i < 4; i++) it.push(bottle(4.6 + i * 0.5, 0.9, 1.3, [PAL.teal, PAL.clay, PAL.gold, PAL.red][i], 0.55));
    // table
    it.push(box(2.6, 4.3, 1.0, 2.8, 2.0, 0.18, PAL.cream));
    for (const [x, y] of [[2.7, 4.4], [5.2, 4.4], [2.7, 6.1], [5.2, 6.1]]) it.push(box(x, y, 0, 0.12, 0.12, 1.0, PAL.wood));
    it.push(cyl(3.2, 5.0, 1.18, 0.3, 0.75, PAL.water));
    it.push(glass(3.9, 5.1, 1.18, PAL.water)); it.push(glass(4.6, 5.0, 1.18, PAL.red)); it.push(glass(4.4, 5.8, 1.18, PAL.gold));
    it.push(figure(6.2, 5.4, PAL.teal, { cls: 'bob' }));
    it.push(figure(1.9, 6.6, PAL.mauve)); it.push(figure(4.2, 7.4, PAL.clay));
    for (const [x, y] of [[1.0, 5.0], [7.0, 7.2]]) it.push(bush(x, y, 0, PAL.leaf));
    return { it, labels: [label([3.2, 5.0, 1.95], 'water first', -16, -16), label([2.7, 1.0, 2.4], 'tap', -8, -12, true), label([6.2, 5.4, 1.2], 'host steps', 16, 18, true)] };
  },
};

export function sceneSVG(id, { labels = true, title = '' } = {}) {
  const { it, labels: lb } = SCENES[id]();
  it.sort((a, b) => a.d - b.d);
  return `<svg xmlns="${NS}" class="scene" viewBox="0 0 240 180" role="img" aria-label="${title}">` +
    `<ellipse cx="120" cy="166" rx="108" ry="10" fill="${LINE}" opacity=".08"/>` +
    it.map(i => i.s).join('') + (labels ? lb.join('') : '') + `</svg>`;
}

/* ---------- card icons (Clay line icons) ---------- */
export const ICONS = {
  '01': '<path d="M5 19c6 0 12-5 12-14C9 5 5 10 5 19zm0 0l7-7"/>',
  '02': '<circle cx="9" cy="9" r="2.3"/><circle cx="14" cy="9" r="2.3"/><circle cx="11.5" cy="13" r="2.3"/><circle cx="11.5" cy="17.4" r="2"/><path d="M11.5 6.5V3m0 0c2 0 4 1 4 2"/>',
  '03': '<g fill="currentColor"><circle cx="9" cy="9" r="2.3"/><circle cx="14" cy="9" r="2.3"/><circle cx="11.5" cy="13" r="2.3"/><circle cx="11.5" cy="17.4" r="2"/></g><path d="M11.5 6.5V3m0 0c2 0 4 1 4 2"/>',
  '04': '<path d="M4 10h16l-2 9H6zM8 10l2-5m6 5l-2-5"/>',
  '05': '<path d="M3 20V10l9-6 9 6v10zM10 20v-5h4v5M16 7V3h2v5.5"/>',
  '06': '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M6 5c-1 4-1 10 0 14m12-14c1 4 1 10 0 14M6 19c0 1 3 2 6 2s6-1 6-2M5.5 9.5h13M5.5 14.5h13"/>',
  '07': '<path d="M10 3h4v4l2 3v11H8V10l2-3zM8 13h8"/>',
  '08': '<path d="M4 4v16M20 4v16M4 8h16M4 13h16M4 18h16M8 8v-2m4 7v-2m4 7v-2"/>',
  '09': '<path d="M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v6m-4 0h8M7.6 7h8.8"/>',
};
