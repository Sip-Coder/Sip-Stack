// Sip-Stack · World (isometric 3x3) + Outline (Mermaid) dual view.
// Original Sip Studies teaching graphics. Plain SVG, no build step.
// v2 "diorama" pass: cel-banded faces, ink silhouettes, soft cast shadows, grain.

const NS = 'http://www.w3.org/2000/svg';
const LINE = '#2e2520';           // silhouette ink
const FINE = 'rgba(46,37,32,.55)'; // inner detail lines
const PAL = {
  clay: '#914C2C', teal: '#1A5552', mauve: '#817985', mint: '#D8E6DA', sand: '#EDD4A8',
  terra: '#c46a43', sage: '#a7bc9c', mustard: '#d4a640',
  paper: '#f4ead8', wood: '#8a5a3c', leaf: '#5f8a6e', gold: '#d9b45a',
  white: '#dcd58f', red: '#5e2f3f', steel: '#b7b3bc', cream: '#fbf5ea', water: '#7fb3b0',
  skin: '#e7c49b', soil: '#b88a62',
};

/* ---------- color + iso helpers ---------- */
function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
const light = (c, t = 0.24) => mix(c, '#fff8ec', t);
const dark = (c, t = 0.2) => mix(c, '#1c1410', t);
const f = n => +n.toFixed(2);

const U = 14, CX = Math.cos(Math.PI / 6), OX = 120, OY = 46;
const P = (x, y, z = 0) => [OX + (x - y) * CX * U, OY + (x + y) * 0.5 * U - z * U];
const pts = arr => arr.map(p => P(...p).map(f).join(',')).join(' ');
const fill = (arr, c, extra = '') => `<polygon points="${pts(arr)}" fill="${c}" ${extra}/>`;
const ink = (arr, w = 1.05) => `<polygon points="${pts(arr)}" fill="none" stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round"/>`;
const seg3 = (a, b, w = 0.4, c = FINE) => { const [x1, y1] = P(...a), [x2, y2] = P(...b); return `<path d="M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`; };

// deterministic jitter per scene
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- per-SVG defs (unique ids; each scene may render twice) ---------- */
let SEQ = 0, CUR = null;
function beginScene() {
  const k = `sx${++SEQ}`;
  CUR = { k, grads: new Map(), shadows: [] };
}
function bandGrad(c) { // hard-stop cel bands: light | mid | dark (cylinders, bottles)
  if (!CUR.grads.has(c)) CUR.grads.set(c, `${CUR.k}g${CUR.grads.size}`);
  return `url(#${CUR.grads.get(c)})`;
}
function defs() {
  let g = '';
  for (const [c, id] of CUR.grads)
    g += `<linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0">` +
      `<stop offset="0" stop-color="${light(c, .32)}"/><stop offset=".26" stop-color="${light(c, .32)}"/>` +
      `<stop offset=".26" stop-color="${c}"/><stop offset=".64" stop-color="${c}"/>` +
      `<stop offset=".64" stop-color="${dark(c, .2)}"/><stop offset="1" stop-color="${dark(c, .3)}"/></linearGradient>`;
  return `<defs>${g}` +
    `<pattern id="${CUR.k}h" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(-32)"><path d="M0,0V2" stroke="${LINE}" stroke-width=".28" opacity=".5"/></pattern>` +
    `<filter id="${CUR.k}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.15"/></filter>` +
    `<filter id="${CUR.k}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.25" numOctaves="2" seed="${SEQ % 97}" result="t"/>` +
    `<feColorMatrix in="t" values="0 0 0 0 .16  0 0 0 0 .12  0 0 0 0 .09  1.5 0 0 0 -.62" result="m"/>` +
    `<feComposite in="m" in2="SourceGraphic" operator="in" result="s"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge></filter>` +
    `<radialGradient id="${CUR.k}v" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#fff8ec" stop-opacity=".9"/><stop offset="1" stop-color="#fff8ec" stop-opacity="0"/></radialGradient>` +
    `</defs>`;
}
const hatch = () => `url(#${CUR.k}h)`;

/* ---------- cast shadows (light from upper-left; shadows fall screen-right) ---------- */
function hull(p) {
  p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function castShadow(foot, h, z = 0) { // foot: [[x,y],...] world footprint
  const k = Math.min(h, 3.2);
  const all = [];
  for (const [x, y] of foot) { all.push(P(x, y, z)); all.push(P(x + k * 0.62, y - k * 0.18, z)); }
  CUR.shadows.push(`<polygon points="${hull(all).map(q => q.map(f).join(',')).join(' ')}"/>`);
}
const rectFoot = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const circFoot = (cx, cy, r) => Array.from({ length: 12 }, (_, i) => [cx + r * Math.cos(i * Math.PI / 6), cy + r * Math.sin(i * Math.PI / 6)]);

/* ---------- primitives (each returns {d: depth, s: svg}) ---------- */
function box(x, y, z, w, d, h, c, o = {}) {
  const F = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
  const R = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
  const T = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
  let s = fill(F, c) + fill(R, dark(c, .22)) + fill(T, light(c, .3));
  if (h > 0.35 && !o.flat) { // ground-contact band (ambient occlusion)
    const b = Math.min(0.32, h * 0.2);
    s += fill([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + b], [x, y + d, z + b]], dark(c, .1), 'opacity=".7"');
    s += fill([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + b], [x + w, y, z + b]], dark(c, .32), 'opacity=".7"');
  }
  if (h > 0.25 && !o.flat) s += fill(R, hatch(), 'opacity=".55"');
  if (o.planks) for (let i = 1; i < o.planks; i++) { const zz = z + (h * i) / o.planks; s += seg3([x, y + d, zz], [x + w, y + d, zz]) + seg3([x + w, y + d, zz], [x + w, y, zz]); }
  // inner edges (fine) + rim highlight + silhouette (heavy)
  s += seg3([x + w, y + d, z + h], [x, y + d, z + h], .45) + seg3([x + w, y + d, z + h], [x + w, y, z + h], .45) + seg3([x + w, y + d, z + h], [x + w, y + d, z], .45);
  if (w > 0.4 && d > 0.4) s += seg3([x + 0.12, y + d - 0.02, z + h], [x + w - 0.08, y + d - 0.02, z + h], .55, 'rgba(255,250,240,.75)');
  s += ink([[x, y + d, z], [x + w, y + d, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h], [x, y + d, z + h]], o.thin ? .7 : 1.05);
  if (z === 0 && !o.noShadow && h > 0.15) castShadow(rectFoot(x, y, w, d), h);
  return { d: x + w / 2 + y + d / 2 + z * 0.01, s };
}
function stripe(x, y, w, d, c, o = {}) {
  let s = fill([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]], c, `stroke="${FINE}" stroke-width=".4"`);
  if (o.rows) for (let i = 1; i < o.rows; i++) s += seg3([x + 0.1, y + (d * i) / o.rows, 0], [x + w - 0.1, y + (d * i) / o.rows, 0], .35);
  if (o.cols) for (let i = 1; i < o.cols; i++) s += seg3([x + (w * i) / o.cols, y + 0.1, 0], [x + (w * i) / o.cols, y + d - 0.1, 0], .35);
  return { d: -50, s };
}
function ground(c, seed, o = {}) { // 8x8 diorama base with strata
  const H = 0.95, t = 0.28, soil = o.soil || mix(PAL.soil, c, .25);
  const T = [[0, 0, 0], [8, 0, 0], [8, 8, 0], [0, 8, 0]];
  let s = '';
  // front (y=8) and right (x=8) faces, two strata each
  s += fill([[0, 8, -H], [8, 8, -H], [8, 8, -t], [0, 8, -t]], soil);
  s += fill([[8, 0, -H], [8, 8, -H], [8, 8, -t], [8, 0, -t]], dark(soil, .2));
  s += fill([[8, 0, -H], [8, 8, -H], [8, 8, -t], [8, 0, -t]], hatch(), 'opacity=".45"');
  s += fill([[0, 8, -t], [8, 8, -t], [8, 8, 0], [0, 8, 0]], dark(c, .14));
  s += fill([[8, 0, -t], [8, 8, -t], [8, 8, 0], [8, 0, 0]], dark(c, .3));
  // strata pebbles
  const r = rng(seed * 7919);
  for (let i = 0; i < 16; i++) {
    const side = i % 2, u = 0.3 + r() * 7.4, v = -t - 0.12 - r() * (H - t - 0.24);
    const [px, py] = side ? P(8, u, v) : P(u, 8, v);
    s += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(0.8 + r() * 0.9)}" ry="${f(0.45 + r() * 0.35)}" fill="${dark(soil, .25 + r() * .15)}" opacity=".55"/>`;
  }
  s += seg3([0, 8, -t], [8, 8, -t], .45) + seg3([8, 8, -t], [8, 0, -t], .45) + seg3([8, 8, 0], [8, 8, -H], .45);
  // top with grain
  s += `<g filter="url(#${CUR.k}n)">${fill(T, c)}</g>`;
  s += seg3([0.15, 7.9, 0], [7.85, 7.9, 0], .7, 'rgba(255,250,240,.7)') + seg3([7.9, 7.85, 0], [7.9, 0.15, 0], .6, 'rgba(255,250,240,.45)');
  // grass tufts / specks
  const tuft = o.tuft ?? dark(c, .3);
  for (let i = 0; i < (o.tufts ?? 14); i++) {
    const [px, py] = P(0.3 + r() * 7.4, 0.3 + r() * 7.4, 0);
    s += `<path d="M${f(px - 1.4)},${f(py)}l.7,-2.1M${f(px)},${f(py)}l.1,-2.8M${f(px + 1.3)},${f(py)}l-.6,-2" stroke="${tuft}" stroke-width=".5" stroke-linecap="round" fill="none"/>`;
  }
  s += ink([[0, 8, -H], [8, 8, -H], [8, 0, -H], [8, 0, 0], [0, 0, 0], [0, 8, 0]], 1.25);
  return { d: -100, s };
}
function house(x, y, w, d, h, roofH, wall, roof, opts = {}) {
  let s = box(x, y, 0, w, d, h, wall).s;
  const e = 0.18; // eave overhang
  const front = [[x - e, y + d + e, h - 0.05], [x + w + e, y + d + e, h - 0.05], [x + w + e, y + d / 2, h + roofH], [x - e, y + d / 2, h + roofH]];
  const gable = [[x + w, y, h], [x + w, y + d, h], [x + w, y + d / 2, h + roofH]];
  s += fill(gable, dark(wall, .2)) + fill(gable, hatch(), 'opacity=".5"') + ink(gable, .7);
  // gable vent
  const [gx, gy] = P(x + w, y + d / 2, h + roofH * 0.42);
  s += `<circle cx="${f(gx)}" cy="${f(gy)}" r="1.5" fill="${dark(wall, .45)}" stroke="${LINE}" stroke-width=".5"/>`;
  s += fill(front, roof);
  // shingle courses + ridge cap + eave band
  for (let i = 1; i < 4; i++) {
    const t = i / 4, yy = y + d + e - (d / 2 + e) * t, zz = h - 0.05 + (roofH + 0.05) * t;
    s += seg3([x - e + 0.05, yy, zz], [x + w + e - 0.05, yy, zz], .45);
  }
  s += fill([[x - e, y + d + e, h - 0.05], [x + w + e, y + d + e, h - 0.05], [x + w + e, y + d + e - 0.12, h + 0.04], [x - e, y + d + e - 0.12, h + 0.04]], dark(roof, .3));
  s += seg3([x - e, y + d / 2, h + roofH], [x + w + e, y + d / 2, h + roofH], .9, light(roof, .35));
  s += ink(front, 1.05);
  // door with frame + step
  const dw = Math.min(0.7, w * 0.25), dx = x + w * 0.5 - dw / 2, dh = Math.min(h * 0.62, 1.1);
  s += fill([[dx - 0.07, y + d, 0], [dx + dw + 0.07, y + d, 0], [dx + dw + 0.07, y + d, dh + 0.07], [dx - 0.07, y + d, dh + 0.07]], light(wall, .45));
  s += fill([[dx, y + d, 0], [dx + dw, y + d, 0], [dx + dw, y + d, dh], [dx, y + d, dh]], dark(wall, .5)) + ink([[dx, y + d, 0], [dx + dw, y + d, 0], [dx + dw, y + d, dh], [dx, y + d, dh]], .55);
  const [kx, ky] = P(dx + dw * 0.78, y + d, dh * 0.5);
  s += `<circle cx="${f(kx)}" cy="${f(ky)}" r=".55" fill="${PAL.mustard}"/>`;
  s += box(dx - 0.12, y + d, 0, dw + 0.24, 0.22, 0.1, light(PAL.steel, .2), { noShadow: true, flat: true, thin: true }).s;
  // windows: side wall (two) + front (one, if wide)
  const win = (pA, pB, z0, z1, side) => {
    const q = side ? [[x + w, pA, z0], [x + w, pB, z0], [x + w, pB, z1], [x + w, pA, z1]] : [[pA, y + d, z0], [pB, y + d, z0], [pB, y + d, z1], [pA, y + d, z1]];
    const mid = (pA + pB) / 2, zm = (z0 + z1) / 2;
    return fill(q, mix(PAL.sand, '#fff6d8', .4)) + fill(side ? [[x + w, pA, z0], [x + w, pB, z0], [x + w, pB, zm], [x + w, pA, zm]] : [[pA, y + d, z0], [pB, y + d, z0], [pB, y + d, zm], [pA, y + d, zm]], PAL.mustard, 'opacity=".35"') +
      (side ? seg3([x + w, mid, z0], [x + w, mid, z1], .45) + seg3([x + w, pA, zm], [x + w, pB, zm], .45) : seg3([mid, y + d, z0], [mid, y + d, z1], .45) + seg3([pA, y + d, zm], [pB, y + d, zm], .45)) + ink(q, .6);
  };
  s += win(y + d * 0.14, y + d * 0.4, h * 0.42, h * 0.78, true) + win(y + d * 0.58, y + d * 0.84, h * 0.42, h * 0.78, true);
  if (w > 1.9) s += win(x + 0.22, x + 0.22 + w * 0.17, h * 0.42, h * 0.78, false);
  if (opts.chimney) {
    const [cx, cy, ch] = opts.chimney;
    s += box(cx, cy, h + roofH * 0.3, 0.45, 0.45, ch, dark(wall, .15), { noShadow: true }).s;
    s += box(cx - 0.06, cy - 0.06, h + roofH * 0.3 + ch, 0.57, 0.57, 0.12, dark(wall, .35), { noShadow: true, flat: true, thin: true }).s;
    const [px, py] = P(cx + 0.22, cy + 0.22, h + roofH * 0.3 + ch + 0.12);
    for (let i = 0; i < 3; i++)
      s += `<circle class="puff" style="--delay:${(i * 1.05).toFixed(2)}s" cx="${f(px)}" cy="${f(py - 3)}" r="3.2" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".55"/>`;
  }
  castShadow(rectFoot(x, y, w, d), h + roofH * 0.6);
  return { d: x + w / 2 + y + d / 2, s };
}
function cyl(cx, cy, z, r, h, c, opts = {}) {
  const [bx, by] = P(cx, cy, z), [, ty] = P(cx, cy, z + h);
  const rx = r * U * 1.2247, ry = r * U * 0.7071;
  const body = `M${f(bx - rx)},${f(by)} L${f(bx - rx)},${f(ty)} A${f(rx)},${f(ry)} 0 0 0 ${f(bx + rx)},${f(ty)} L${f(bx + rx)},${f(by)} A${f(rx)},${f(ry)} 0 0 1 ${f(bx - rx)},${f(by)} Z`;
  let s = `<path d="${body}" fill="${bandGrad(c)}"/>`;
  if (opts.staves) for (const k of [-0.62, -0.22, 0.2, 0.6]) {
    const sx = bx + rx * k, dy = ry * Math.sqrt(1 - k * k);
    s += `<path d="M${f(sx)},${f(ty + dy)}L${f(sx)},${f(by + dy)}" stroke="${FINE}" stroke-width=".4"/>`;
  }
  if (h * U > 6) s += `<path d="${body}" fill="${hatch()}" opacity=".18"/>`;
  if (opts.hoops) for (const t of opts.hoops) {
    const hy = by - (by - ty) * t;
    s += `<path d="M${f(bx - rx)},${f(hy)} A${f(rx)},${f(ry)} 0 0 0 ${f(bx + rx)},${f(hy)}" fill="none" stroke="${dark(opts.hoopC || PAL.steel, .35)}" stroke-width="1.5"/>`;
    s += `<path d="M${f(bx - rx)},${f(hy)} A${f(rx)},${f(ry)} 0 0 0 ${f(bx + rx)},${f(hy)}" fill="none" stroke="${LINE}" stroke-width=".35"/>`;
  }
  s += `<path d="M${f(bx - rx)},${f(by)} A${f(rx)},${f(ry)} 0 0 0 ${f(bx + rx)},${f(by)}" fill="none" stroke="${dark(c, .35)}" stroke-width=".9" opacity=".5" transform="translate(0,-.9)"/>`;
  s += `<ellipse cx="${f(bx)}" cy="${f(ty)}" rx="${f(rx)}" ry="${f(ry)}" fill="${light(c, .3)}"/>`;
  if (opts.lid !== false && rx > 4) s += `<ellipse cx="${f(bx)}" cy="${f(ty + 0.4)}" rx="${f(rx * 0.74)}" ry="${f(ry * 0.74)}" fill="none" stroke="${FINE}" stroke-width=".45"/>`;
  s += `<path d="${body}" fill="none" stroke="${LINE}" stroke-width="${rx < 3 ? .7 : 1.05}" stroke-linejoin="round"/>`;
  s += `<ellipse cx="${f(bx)}" cy="${f(ty)}" rx="${f(rx)}" ry="${f(ry)}" fill="none" stroke="${LINE}" stroke-width="${rx < 3 ? .55 : .75}"/>`;
  if (z === 0 && !opts.noShadow) castShadow(circFoot(cx, cy, r), h);
  return { d: cx + cy + z * 0.01, s };
}
function bottle(cx, cy, z, c, scale = 1) { // screen-space silhouette bottle, cel-banded
  const [bx, by] = P(cx, cy, z);
  const W = 3.1 * scale, H = 11 * scale, N = 1.05 * scale, SH = 3 * scale, NK = 4.6 * scale, ey = 1.2 * scale;
  const d = `M${f(bx - W)},${f(by)} L${f(bx - W)},${f(by - H)} Q${f(bx - W)},${f(by - H - SH)} ${f(bx - N)},${f(by - H - SH * 1.3)} L${f(bx - N)},${f(by - H - SH - NK)} L${f(bx + N)},${f(by - H - SH - NK)} L${f(bx + N)},${f(by - H - SH * 1.3)} Q${f(bx + W)},${f(by - H - SH)} ${f(bx + W)},${f(by - H)} L${f(bx + W)},${f(by)} Q${f(bx)},${f(by + ey * 1.4)} ${f(bx - W)},${f(by)} Z`;
  let s = `<path d="${d}" fill="${bandGrad(c)}"/>`;
  s += `<rect x="${f(bx - W)}" y="${f(by - H * 0.72)}" width="${f(W * 2)}" height="${f(H * 0.4)}" fill="${PAL.cream}" opacity=".92"/>`;
  s += `<rect x="${f(bx + W * 0.28)}" y="${f(by - H * 0.72)}" width="${f(W * 0.72)}" height="${f(H * 0.4)}" fill="${LINE}" opacity=".12"/>`;
  s += `<rect x="${f(bx - N - 0.15)}" y="${f(by - H - SH - NK - 0.3)}" width="${f(2 * N + 0.3)}" height="${f(1.5 * scale)}" fill="${PAL.mustard}"/>`;
  s += `<path d="M${f(bx - W * 0.55)},${f(by - H * 0.15)}V${f(by - H * 0.28)}M${f(bx - W * 0.55)},${f(by - H * 0.82)}V${f(by - H * 0.95)}" stroke="#fff" stroke-width="${f(0.7 * scale)}" opacity=".7" stroke-linecap="round"/>`;
  s += `<path d="${d}" fill="none" stroke="${LINE}" stroke-width="${scale < 0.6 ? .55 : .8}" stroke-linejoin="round"/>`;
  return { d: cx + cy + z * 0.01 + 0.05, s };
}
function glass(cx, cy, z, fillC) {
  const [bx, by] = P(cx, cy, z);
  return { d: cx + cy + 0.2, s:
    `<ellipse cx="${f(bx)}" cy="${f(by)}" rx="2.4" ry=".9" fill="${LINE}" opacity=".15"/>` +
    `<path d="M${bx - 2.8},${by - 9.5} L${bx + 2.8},${by - 9.5} Q${bx + 2.6},${by - 4.4} ${bx + 0.5},${by - 4} L${bx + 0.5},${by - 0.7} L${bx + 2.1},${by} L${bx - 2.1},${by} L${bx - 0.5},${by - 0.7} L${bx - 0.5},${by - 4} Q${bx - 2.6},${by - 4.4} ${bx - 2.8},${by - 9.5} Z" fill="rgba(251,245,234,.92)" stroke="${LINE}" stroke-width=".65" stroke-linejoin="round"/>` +
    `<path d="M${bx - 2.45},${by - 7.4} L${bx + 2.45},${by - 7.4} Q${bx + 2.2},${by - 4.8} ${bx},${by - 4.5} Q${bx - 2.2},${by - 4.8} ${bx - 2.45},${by - 7.4} Z" fill="${fillC}"/>` +
    `<path d="M${bx - 1.7},${by - 8.8} q-.3,2 .1,3.4" stroke="#fff" stroke-width=".6" fill="none" opacity=".85" stroke-linecap="round"/>` };
}
function figure(cx, cy, c, opts = {}) {
  const [bx, by] = P(cx, cy, 0);
  const cls = opts.cls || '';
  const hair = opts.hair || dark(PAL.wood, .3);
  return { d: cx + cy + 0.3, s:
    `<g class="${cls}" ${opts.style ? `style="${opts.style}"` : ''}>` +
    `<ellipse cx="${f(bx + 1.5)}" cy="${f(by + 0.3)}" rx="4" ry="1.5" fill="${LINE}" opacity=".2"/>` +
    `<g class="legs"><path class="leg l" d="M${bx - 1.1},${by - 5.6} L${bx - 1.5},${by - 0.2}" stroke="${dark(PAL.teal, .45)}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path class="leg r" d="M${bx + 1.1},${by - 5.6} L${bx + 1.5},${by - 0.2}" stroke="${dark(PAL.teal, .55)}" stroke-width="1.5" stroke-linecap="round"/></g>` +
    `<path d="M${bx - 3},${by - 5} L${bx - 2.4},${by - 11.4} Q${bx},${by - 13.2} ${bx + 2.4},${by - 11.4} L${bx + 3},${by - 5} Z" fill="${c}"/>` +
    `<path d="M${bx + 0.6},${by - 12.9} Q${bx + 1.8},${by - 12.6} ${bx + 2.4},${by - 11.4} L${bx + 3},${by - 5} L${bx + 0.6},${by - 5} Z" fill="${dark(c, .25)}"/>` +
    `<path d="M${bx - 3},${by - 5} L${bx - 2.4},${by - 11.4} Q${bx},${by - 13.2} ${bx + 2.4},${by - 11.4} L${bx + 3},${by - 5} Z" fill="none" stroke="${LINE}" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M${bx - 2.6},${by - 10.6} q-1.3,2.6 -.6,4.8" stroke="${LINE}" stroke-width=".6" fill="none" stroke-linecap="round"/>` +
    `<circle cx="${bx}" cy="${by - 15.4}" r="2.9" fill="${PAL.skin}" stroke="${LINE}" stroke-width=".8"/>` +
    `<path d="M${bx - 2.9},${by - 15.6} A2.9,2.9 0 0 1 ${bx + 2.9},${by - 15.6} Q${bx + 0.6},${by - 16.8} ${bx - 2.9},${by - 15.6} Z" fill="${hair}" stroke="${LINE}" stroke-width=".55"/>` +
    `</g>` };
}
function cluster(cx, cy, z, c, r = 1.7) {
  const [bx, by] = P(cx, cy, z);
  const rows = [[-6.4, 3], [-3.3, 2], [-0.4, 1]];
  let s = `<path d="M${bx},${by - 10.4} q 3.4,-4.4 7.6,-3.2 q -3.2,3.4 -7.6,3.2" fill="${PAL.leaf}" stroke="${LINE}" stroke-width=".55"/>`;
  s += `<path d="M${bx + 0.8},${by - 9.6} q 2.6,-2 5.2,-2.4" stroke="${dark(PAL.leaf, .3)}" stroke-width=".35" fill="none"/>`;
  s += `<path d="M${bx},${by - 11.4} q -.6,2 0,3.6" stroke="${LINE}" stroke-width=".8" fill="none"/>`;
  for (const [dy, n] of rows)
    for (let i = 0; i < n; i++) {
      const x = bx + (i - (n - 1) / 2) * r * 1.9;
      s += `<circle cx="${f(x)}" cy="${f(by + dy)}" r="${r}" fill="${c}" stroke="${LINE}" stroke-width=".5"/>` +
        `<circle cx="${f(x + r * 0.32)}" cy="${f(by + dy + r * 0.3)}" r="${f(r * 0.55)}" fill="${dark(c, .2)}" opacity=".5"/>` +
        `<circle cx="${f(x - r * 0.35)}" cy="${f(by + dy - r * 0.38)}" r="${f(r * 0.3)}" fill="#fff" opacity=".7"/>`;
    }
  return { d: cx + cy + z * 0.01 + 0.5, s };
}
function bush(cx, cy, z, c, o = {}) {
  const [bx, by] = P(cx, cy, z);
  const lobes = [[-4.6, -3, 4.2, 0], [4, -3.2, 4.1, .14], [-1.6, -7.4, 4.4, -.06], [2.4, -7, 3.8, .06], [0.2, -2.2, 4.4, .04]];
  let s = `<g class="sway" style="--delay:${f((cx + cy) * 0.37 % 3)}s">`;
  if (z === 0) s += `<ellipse cx="${f(bx + 3)}" cy="${f(by + 0.4)}" rx="7.4" ry="2.4" fill="${LINE}" opacity=".16"/>`;
  for (const [dx, dy, r, t] of lobes)
    s += `<circle cx="${f(bx + dx)}" cy="${f(by + dy)}" r="${r}" fill="${t > 0 ? dark(c, t) : light(c, -t + .04)}" stroke="${LINE}" stroke-width=".7"/>`;
  s += `<path d="M${f(bx - 3.6)},${f(by - 9.2)} a3,3 0 0 1 3.4,-1.4 M${f(bx - 6.8)},${f(by - 4.6)} a3,3 0 0 1 2.4,-2.4" stroke="${light(c, .45)}" stroke-width=".8" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M${f(bx + 2.6)},${f(by - 1.4)} q2,.6 3.6,-.6" stroke="${dark(c, .35)}" stroke-width=".5" fill="none"/>`;
  if (o.berries) for (const [dx, dy] of [[-3, -2], [2.6, -5], [-0.4, -8.6]]) s += `<circle cx="${f(bx + dx)}" cy="${f(by + dy)}" r=".9" fill="${o.berries}" stroke="${LINE}" stroke-width=".3"/>`;
  return { d: cx + cy + z * 0.01 + 0.2, s: s + '</g>' };
}
function tree(cx, cy, c, hgt = 2.6) {
  const t = box(cx - 0.12, cy - 0.12, 0, 0.24, 0.24, hgt, PAL.wood, { thin: true });
  const b1 = bush(cx, cy, hgt - 0.3, c), b2 = bush(cx + 0.2, cy + 0.2, hgt + 0.35, light(c, .08));
  castShadow(circFoot(cx, cy, 0.6), hgt + 1);
  return { d: cx + cy + 0.4, s: t.s + b1.s + b2.s };
}
function crate(x, y, z, s = 0.55, c = PAL.wood) {
  const b = box(x, y, z, s, s, s, light(c, .15), { planks: 3, thin: s < 0.5 });
  return b;
}
function line3(a, b, w = 0.6, c = LINE, extra = '') {
  const [x1, y1] = P(...a), [x2, y2] = P(...b);
  return { d: (a[0] + a[1] + b[0] + b[1]) / 2, s: `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${extra}/>` };
}
function lamp(x, y) {
  const post = box(x, y, 0, 0.14, 0.14, 2.4, dark(PAL.teal, .2), { thin: true, noShadow: true });
  const [lx, ly] = P(x + 0.07, y + 0.07, 2.55);
  return { d: x + y + 0.2, s: post.s + `<circle cx="${f(lx)}" cy="${f(ly)}" r="5" fill="${PAL.mustard}" opacity=".18" class="glow"/><circle cx="${f(lx)}" cy="${f(ly)}" r="1.9" fill="${light(PAL.mustard, .35)}" stroke="${LINE}" stroke-width=".6"/>` };
}
function sign(x, y, text, c = PAL.teal) {
  const post = box(x, y, 0, 0.12, 0.12, 1.2, PAL.wood, { thin: true, noShadow: true });
  const [sx, sy] = P(x + 0.06, y + 0.06, 1.35);
  const w = text.length * 3.3 + 6;
  return { d: x + y + 0.3, s: post.s + `<rect x="${f(sx - w / 2)}" y="${f(sy - 5)}" width="${f(w)}" height="7" rx="1.2" fill="${c}" stroke="${LINE}" stroke-width=".7"/><text x="${f(sx)}" y="${f(sy + 0.1)}" text-anchor="middle" class="sgn">${text}</text>` };
}
function mover(item, from, to, dur, delay = 0, cls = '') {
  const [x1, y1] = P(...from), [x2, y2] = P(...to);
  return { d: item.d, s: `<g class="mover ${cls}" style="--tx:${f(x2 - x1)}px;--ty:${f(y2 - y1)}px;--dur:${dur}s;--delay:${delay}s">${item.s}</g>` };
}
function noShadow(fn) { const n = CUR.shadows.length; const r = fn(); CUR.shadows.length = n; return r; }
function drop(cx, cy, z, delay) {
  const [bx, by] = P(cx, cy, z);
  return { d: cx + cy + 0.1, s: `<path class="drip" style="--delay:${delay}s;--ty:${f(U * z - 2)}px" d="M${f(bx)},${f(by - 2.6)} q 1.8,2.6 0,3.7 q -1.8,-1.1 0,-3.7 Z" fill="${PAL.water}" stroke="${LINE}" stroke-width=".45"/>` };
}
function label(at, text, dx, dy, small = false) {
  const [x, y] = P(...at), ex = x + dx, ey = y + dy;
  const anchor = dx < 0 ? 'end' : 'start';
  return `<path class="leader" d="M${f(x)},${f(y)} L${f(ex)},${f(ey)} L${f(ex + (dx < 0 ? -6 : 6))},${f(ey)}"/><circle class="dot" cx="${f(x)}" cy="${f(y)}" r="1.5"/>` +
    `<text class="lbl${small ? ' s' : ''}" x="${f(ex + (dx < 0 ? -8 : 8))}" y="${f(ey + 3)}" text-anchor="${anchor}">${text}</text>`;
}

/* ---------- the nine scenes ---------- */
const SCENES = {
  '01'() { // Vine Training & Canopy Care
    const it = [ground(PAL.sage, 1)];
    for (const y of [1.2, 3.9, 6.6]) {
      it.push(stripe(0.2, y - 0.25, 7.6, 0.9, mix(PAL.soil, PAL.sage, 0.45), { rows: 3 }));
      for (const x of [0.5, 3.9, 7.2]) it.push(box(x, y, 0, 0.25, 0.25, 2.3, PAL.wood, { thin: true }));
      it.push(line3([0.6, y + 0.1, 1.5], [7.3, y + 0.1, 1.5], .55));
      it.push(line3([0.6, y + 0.1, 2.1], [7.3, y + 0.1, 2.1], .55));
      for (const x of [1.4, 2.6, 5.0, 6.2]) {
        it.push(bush(x, y + 0.2, 1.5, PAL.leaf));
        it.push(cluster(x + 0.25, y + 0.55, 1.15, PAL.red, 1.1));
      }
      for (let i = 0; i < 3; i++) it.push(drop(1.6 + i * 2.2, y + 0.5, 0.9, i * 0.7 + y * 0.2));
    }
    it.push(noShadow(() => mover(figure(0.2, 2.7, PAL.clay), [0.2, 2.7, 0], [7.8, 2.7, 0], 9, 0, 'walker')));
    it.push(crate(7.3, 5.2, 0, 0.5)); it.push(crate(7.35, 5.25, 0.5, 0.42, PAL.terra));
    return { bg: PAL.mint, it, labels: [label([6.2, 6.8, 2.4], 'canopy', 18, 22), label([4.0, 1.3, 2.1], 'trellis wire', -10, -16, true)] };
  },
  '02'() { // White grapes — species analysis
    const it = [ground(PAL.sand, 2, { tuft: mix(PAL.sage, LINE, .3) })];
    it.push(stripe(0.6, 6.5, 6.8, 0.9, mix(PAL.sand, PAL.soil, .35), { cols: 6 }));
    const fam = [['Crisp', PAL.mint, 0.9], ['Floral', mix(PAL.mauve, '#ffffff', 0.55), 1.4], ['Rich', mix(PAL.gold, PAL.sand, 0.2), 1.9]];
    fam.forEach(([, c, h], i) => {
      const x = 1 + i * 2.4, y = 4.6 - i * 0.2;
      it.push(box(x, y, 0, 1.5, 1.5, h, c, { planks: Math.round(h / 0.45) }));
      it.push(cluster(x + 0.75, y + 0.75, h, PAL.white, 1.6));
    });
    for (let i = 0; i < 4; i++) it.push(box(5.4, 0.9, i * 0.22, 1.9, 1.4, 0.18, i % 2 ? PAL.cream : PAL.mint, { flat: true, thin: true, noShadow: i > 0 }));
    it.push(bush(1.3, 1.4, 0, PAL.sage, { berries: PAL.white })); it.push(bush(2.5, 0.8, 0, PAL.leaf, { berries: PAL.white }));
    it.push(figure(2.2, 7.4, PAL.teal, { cls: 'bob' }));
    return { bg: PAL.mint, it, labels: [
      label([1.75, 6.1, 0.3], 'Crisp', -14, 16), label([4.15, 5.9, 0.3], 'Floral', 4, 22), label([7.3, 5.15, 0.9], 'Rich', 14, 14),
      label([6.3, 1.6, 0.9], '11 varieties', 14, -18, true)] };
  },
  '03'() { // Red grapes — species analysis
    const it = [ground(mix(PAL.mauve, PAL.sand, 0.55), 3)];
    it.push(stripe(0.6, 6.5, 6.8, 0.9, mix(PAL.mauve, PAL.soil, .45), { cols: 6 }));
    const fam = [['Light', mix(PAL.clay, '#ffffff', 0.55), 0.9], ['Medium', mix(PAL.clay, '#ffffff', 0.25), 1.5], ['Bold', PAL.clay, 2.1]];
    fam.forEach(([, c, h], i) => {
      const x = 1 + i * 2.4, y = 4.6 - i * 0.2;
      it.push(box(x, y, 0, 1.5, 1.5, h, c, { planks: Math.round(h / 0.45) }));
      it.push(cluster(x + 0.75, y + 0.75, h, i === 0 ? '#9a4a5a' : PAL.red, 1.6));
    });
    for (let i = 0; i < 5; i++) it.push(box(5.4, 0.9, i * 0.22, 1.9, 1.4, 0.18, i % 2 ? PAL.cream : PAL.sand, { flat: true, thin: true, noShadow: i > 0 }));
    it.push(cyl(1.6, 1.6, 0, 0.6, 1.2, PAL.wood, { hoops: [0.2, 0.8], staves: true }));
    it.push(cyl(2.9, 1.2, 0, 0.45, 0.9, PAL.wood, { hoops: [0.22, 0.78], staves: true }));
    it.push(figure(2.4, 7.4, PAL.teal, { cls: 'bob' }));
    return { bg: mix(PAL.mauve, '#ffffff', .6), it, labels: [
      label([1.75, 6.1, 0.3], 'Light', -14, 16), label([4.15, 5.9, 0.3], 'Medium', 4, 22), label([7.3, 5.15, 1.0], 'Bold', 14, 14),
      label([6.3, 1.6, 1.1], '14 varieties', 14, -18, true)] };
  },
  '04'() { // Harvest & Field Gear (wine grapes; mustard = flowering cover crop between rows)
    const it = [ground(PAL.sage, 4)];
    it.push(stripe(4.2, 0.2, 3.6, 3.6, PAL.mustard, { rows: 6 }));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const [px, py] = P(4.45 + c * 0.58, 0.5 + r * 0.6, 0);
      it.push({ d: -45, s: `<path d="M${f(px)},${f(py)}l-.6,-3.4M${f(px)},${f(py)}l.7,-3.6M${f(px)},${f(py)}l0,-4" stroke="${dark(PAL.mustard, .35)}" stroke-width=".55" stroke-linecap="round"/>` });
    }
    for (const y of [0.8, 2.4]) for (const x of [0.8, 2.4]) it.push(bush(x, y, 0.0, PAL.leaf, { berries: PAL.red }));
    it.push(tree(6.6, 5.6, '#7fa37a', 2.8));
    // tractor
    it.push(box(1.0, 5.0, 0.3, 1.8, 1.0, 0.7, PAL.teal));
    it.push(box(1.0, 5.0, 1.0, 0.8, 1.0, 0.8, light(PAL.teal, 0.3)));
    it.push(box(1.05, 5.1, 1.8, 0.9, 0.85, 0.08, dark(PAL.teal, .2), { flat: true, thin: true }));
    it.push(box(2.45, 5.35, 1.0, 0.12, 0.12, 0.55, LINE, { thin: true }));
    it.push(cyl(1.25, 6.05, 0, 0.42, 0.22, '#3b332e', { noShadow: true }));
    it.push(cyl(2.45, 6.05, 0, 0.3, 0.2, '#3b332e', { noShadow: true }));
    // bins rolling to the house
    for (let i = 0; i < 3; i++)
      it.push(noShadow(() => mover(crate(2.4, 4.3, 0, 0.55, PAL.clay), [2.4, 4.3, 0], [6.6, 4.3, 0], 6, i * 2)));
    it.push(house(5.6, 6.0, 2.0, 1.8, 1.2, 0.8, PAL.cream, PAL.clay));
    return { bg: mix(PAL.mustard, '#ffffff', .6), it, labels: [label([6.1, 2.0, 0], 'cover crop', 18, -26, true), label([1.6, 1.6, 0.9], 'grapes', -10, -14, true), label([7.6, 6.9, 1.0], 'crush pad', 14, 14, true)] };
  },
  '05'() { // Wine Making Styles: five separate lanes (Red · White · Rosé · Champagne · Fortified)
    const it = [ground(PAL.sand, 5, { tufts: 10, tuft: mix(PAL.sage, LINE, .3) })];
    it.push(stripe(0.3, 6.9, 7.4, 0.6, mix(PAL.sand, LINE, 0.12), { cols: 12 }));
    // Red cellar (clay) · White cellar (mint) · Champagne house (mauve)
    it.push(house(0.4, 3.8, 2.2, 2.4, 1.3, 0.9, mix(PAL.clay, '#ffffff', 0.35), PAL.clay));
    it.push(house(3.0, 2.2, 2.1, 2.4, 1.5, 0.9, mix(PAL.mint, '#ffffff', 0.2), PAL.teal));
    it.push(house(5.6, 0.4, 2.0, 2.3, 1.9, 0.9, mix(PAL.mauve, '#ffffff', 0.4), PAL.mauve));
    // Rosé: short-skin-contact steel tank, blush band
    it.push(cyl(7.0, 4.0, 0, 0.55, 1.3, PAL.steel, { hoops: [0.4, 0.9] }));
    it.push(cyl(7.0, 4.0, 1.3, 0.2, 0.18, mix(PAL.terra, '#ffffff', 0.45), { noShadow: true }));
    // Fortified: barrel stack (solera-style rows)
    for (const [x, y] of [[0.7, 1.0], [1.8, 1.0]]) it.push(cyl(x, y, 0, 0.5, 0.95, PAL.wood, { hoops: [0.2, 0.7], staves: true }));
    it.push(cyl(1.25, 1.0, 0.95, 0.45, 0.85, PAL.wood, { hoops: [0.2, 0.6], staves: true }));
    it.push(lamp(5.2, 6.3));
    for (let i = 0; i < 3; i++) it.push(noShadow(() => mover(cyl(0.2, 7.2, 0, 0.18, 0.3, PAL.water), [0.2, 7.2, 0], [7.6, 7.2, 0], 7, i * 2.3)));
    return { bg: mix(PAL.terra, '#ffffff', .72), it, labels: [label([1.5, 6.2, 1.0], 'Red', -14, 12), label([4.05, 4.6, 0.6], 'White', -10, 40), label([6.6, 2.7, 2.0], 'Champagne', 20, 6), label([7.5, 4.0, 0.6], 'Rosé', 12, 14), label([1.25, 1.0, 1.8], 'Fortified', -10, -14)] };
  },
  '06'() { // Aging & Vessel Patterns (wine styles)
    const it = [ground(mix(PAL.sand, PAL.mauve, 0.15), 6, { tufts: 6 })];
    const lanes = [PAL.mint, PAL.sand, mix(PAL.clay, '#ffffff', 0.6)];
    lanes.forEach((c, i) => it.push(stripe(0.3 + i * 2.6, 0.3, 2.2, 7.4, c, { rows: 8 })));
    it.push(cyl(1.4, 3.0, 0, 0.7, 2.2, PAL.steel, { hoops: [0.5] }));
    it.push(cyl(1.4, 5.6, 0, 0.55, 1.6, PAL.steel, { hoops: [0.3] }));
    it.push(box(3.2, 2.2, 0, 1.6, 1.0, 1.6, PAL.wood, { planks: 3 }));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const [bx, by] = P(3.2 + 1.6, 2.2 + 0.15 + c * 0.22, 0.32 + r * 0.45);
      it.push({ d: 5.5, s: `<ellipse cx="${f(bx)}" cy="${f(by)}" rx="1.6" ry="1.9" fill="${PAL.teal}" stroke="${LINE}" stroke-width=".45"/><circle cx="${f(bx - .4)}" cy="${f(by - .6)}" r=".45" fill="#fff" opacity=".7"/>` });
    }
    it.push(box(3.3, 5.2, 0, 1.4, 1.4, 0.2, PAL.cream, { flat: true }));
    it.push(bottle(3.7, 5.7, 0.2, PAL.teal, 0.55)); it.push(bottle(4.2, 5.8, 0.2, PAL.clay, 0.55));
    for (const [x, y] of [[6.0, 2.0], [7.2, 2.0], [6.0, 4.6], [7.2, 4.6]]) it.push(cyl(x, y, 0, 0.55, 1.1, PAL.wood, { hoops: [0.2, 0.8], staves: true }));
    it.push(cyl(6.6, 3.3, 1.1, 0.55, 1.1, PAL.wood, { hoops: [0.2, 0.8], staves: true }));
    return { bg: mix(PAL.mauve, '#ffffff', .62), it, labels: [label([1.4, 3.0, 2.2], 'Steel', -12, -14), label([4.0, 2.7, 1.6], 'Lees & bottle', 8, -30), label([6.6, 3.3, 2.2], 'Oak', 14, -16), label([4.0, 5.9, 0.2], 'reductive ↔ oxidative', 8, 30, true)] };
  },
  '07'() { // Bottle to Shelf
    const it = [ground(PAL.mint, 7, { tuft: mix(PAL.leaf, LINE, .2) })];
    it.push(box(0.4, 3.0, 0, 5.2, 1.0, 0.7, PAL.mauve));
    it.push({ d: 3.95, s: fill([[0.45, 3.1, 0.71], [5.55, 3.1, 0.71], [5.55, 3.9, 0.71], [0.45, 3.9, 0.71]], dark(PAL.mauve, .45)) + [1, 2, 3, 4, 5].map(i => seg3([0.45 + i * 0.85, 3.1, 0.71], [0.45 + i * 0.85, 3.9, 0.71], .5, 'rgba(255,255,255,.35)')).join('') });
    it.push(cyl(1.1, 1.2, 0, 0.8, 2.2, PAL.steel, { hoops: [0.3, 0.7] }));
    it.push(line3([1.1, 1.9, 0.9], [0.8, 3.2, 0.75], 1.4, dark(PAL.steel, .3)));
    for (let i = 0; i < 4; i++) it.push(mover(bottle(0.6, 3.5, 0.7, PAL.teal, 0.9), [0.6, 3.5, 0.7], [5.4, 3.5, 0.7], 6, i * 1.5));
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) it.push(crate(4.4 + i * 0.7, 5.0 + j * 0.7, 0, 0.6, PAL.sand));
    it.push(crate(4.75, 5.35, 0.6, 0.6, PAL.sand));
    // truck
    it.push(box(5.9, 0.6, 0.35, 1.7, 2.8, 1.6, PAL.cream, { noShadow: true }));
    it.push({ d: 6.9, s: fill([[7.6, 0.9, 0.9], [7.6, 3.1, 0.9], [7.6, 3.1, 1.45], [7.6, 0.9, 1.45]], PAL.clay) });
    it.push(box(5.9, 3.4, 0.35, 1.7, 1.0, 1.1, PAL.clay, { noShadow: true }));
    it.push({ d: 8.0, s: fill([[7.6, 3.55, 0.95], [7.6, 4.25, 0.95], [7.6, 4.25, 1.35], [7.6, 3.55, 1.35]], mix(PAL.water, '#fff', .3), `stroke="${LINE}" stroke-width=".55"`) });
    castShadow(rectFoot(5.9, 0.6, 1.7, 3.8), 1.8);
    it.push(cyl(7.65, 1.3, 0, 0.34, 0.16, '#3b332e', { noShadow: true, lid: false })); it.push(cyl(7.65, 3.9, 0, 0.34, 0.16, '#3b332e', { noShadow: true, lid: false }));
    return { bg: mix(PAL.water, '#ffffff', .55), it, labels: [label([1.1, 1.2, 2.2], 'tank', -10, -12, true), label([3.0, 3.5, 1.4], 'glass · cork · screwcap', -14, 34, true), label([6.75, 2.0, 1.95], 'shop door', 12, -14, true)] };
  },
  '08'() { // Wine Shop Floor
    const it = [ground(PAL.cream, 8, { tufts: 0, soil: mix(PAL.wood, PAL.sand, .35) })];
    it.push(stripe(0.2, 0.2, 7.6, 7.6, mix(PAL.cream, PAL.sand, .35), { rows: 8, cols: 8 }));
    it.push(stripe(0.3, 6.4, 2.2, 1.3, mix(PAL.sand, LINE, 0.12), { cols: 4 }));
    for (let i = 0; i < 3; i++) {
      const x = 0.6 + i * 2.1;
      it.push(box(x, 0.5, 0, 1.6, 0.7, 2.2, PAL.wood, { planks: 3 }));
      for (let s = 0; s < 3; s++) for (let b = 0; b < 4; b++)
        it.push(bottle(x + 0.25 + b * 0.38, 1.25, 0.25 + s * 0.68, [PAL.clay, PAL.teal, PAL.mustard][(b + s + i) % 3], 0.42));
    }
    it.push(box(4.0, 3.6, 0, 2.2, 0.9, 1.0, mix(PAL.sand, PAL.wood, 0.25), { planks: 2 }));
    for (let b = 0; b < 5; b++) it.push(bottle(4.25 + b * 0.42, 4.05, 1.0, [PAL.clay, PAL.teal, PAL.mustard, PAL.red, PAL.teal][b], 0.5));
    it.push(box(6.8, 1.0, 0, 1.0, 2.8, 2.4, PAL.teal));
    it.push({ d: 8.6, s: fill([[6.8, 1.2, 0.3], [6.8, 3.6, 0.3], [6.8, 3.6, 2.1], [6.8, 1.2, 2.1]], 'rgba(216,230,218,.6)', `stroke="${LINE}" stroke-width=".6"`) +
      [0.85, 1.5].map(z => seg3([6.8, 1.2, z], [6.8, 3.6, z], .5)).join('') + seg3([6.8, 2.4, 0.3], [6.8, 2.4, 2.1], .5) +
      seg3([6.8, 1.45, 1.95], [6.8, 1.9, 1.5], .7, 'rgba(255,255,255,.85)') });
    it.push(box(1.0, 4.4, 0, 2.6, 1.0, 1.0, PAL.clay));
    it.push(box(2.8, 4.5, 1.0, 0.6, 0.5, 0.4, PAL.mint, { thin: true }));
    it.push(figure(2.0, 3.8, PAL.teal, { cls: 'bob' }));
    it.push(mover(figure(7.6, 6.2, PAL.mauve), [7.6, 6.2, 0], [4.2, 6.2, 0], 7, 0, 'walker'));
    for (let i = 0; i < 3; i++) it.push(noShadow(() => mover(crate(0.6, 6.7, 0, 0.6, PAL.sand), [0.6, 6.7, 0], [0.6, 4.0, 0], 5, i * 1.7)));
    return { bg: mix(PAL.sand, '#ffffff', .45), it, labels: [label([1.0, 4.9, 0.8], 'checkout', -12, -16, true), label([7.8, 3.0, 1.2], 'chilled case', 6, 20, true), label([1.2, 6.9, 0.3], 'back dock · FIFO', 10, 30, true)] };
  },
  '09'() { // Table Service
    const it = [ground(mix(PAL.sand, PAL.clay, 0.12), 9, { tufts: 4, soil: mix(PAL.wood, PAL.sand, .3) })];
    it.push(stripe(0.2, 2.2, 7.6, 5.6, mix(PAL.sand, PAL.clay, .2), { rows: 7 }));
    // wine bar: by-the-glass bottles + ice bucket for whites & bubbles
    it.push(box(0.5, 0.6, 0, 6.8, 1.1, 1.3, PAL.wood, { planks: 3 }));
    it.push(box(0.4, 0.5, 1.3, 7.0, 1.3, 0.1, dark(PAL.wood, .25), { flat: true, thin: true, noShadow: true }));
    it.push(cyl(1.6, 1.1, 1.4, 0.4, 0.55, PAL.steel, { hoops: [0.4], noShadow: true }));
    it.push(bottle(1.6, 1.1, 1.75, PAL.teal, 0.5));
    for (let i = 0; i < 7; i++) it.push(bottle(2.6 + i * 0.6, 0.9, 1.4, [PAL.red, PAL.clay, PAL.teal, PAL.mustard, mix(PAL.terra, '#ffffff', .4), PAL.red, PAL.wood][i], 0.55));
    for (const x of [1.4, 3.6, 5.8]) { it.push(cyl(x, 2.3, 0.75, 0.3, 0.1, PAL.clay, { noShadow: true })); it.push(box(x - 0.05, 2.25, 0, 0.1, 0.1, 0.75, LINE, { thin: true })); }
    // table
    it.push(box(2.6, 4.3, 1.0, 2.8, 2.0, 0.18, PAL.cream, { flat: true }));
    castShadow(rectFoot(2.6, 4.3, 2.8, 2.0), 0.9);
    for (const [x, y] of [[2.7, 4.4], [5.2, 4.4], [2.7, 6.1], [5.2, 6.1]]) it.push(box(x, y, 0, 0.12, 0.12, 1.0, PAL.wood, { thin: true, noShadow: true }));
    it.push(cyl(3.2, 5.0, 1.18, 0.3, 0.75, PAL.water));
    it.push(glass(3.9, 5.1, 1.18, PAL.water)); it.push(glass(4.6, 5.0, 1.18, PAL.red)); it.push(glass(4.4, 5.8, 1.18, PAL.mustard));
    it.push(figure(6.2, 5.4, PAL.teal, { cls: 'bob' }));
    it.push(figure(1.9, 6.6, PAL.mauve)); it.push(figure(4.2, 7.4, PAL.clay));
    for (const [x, y] of [[1.0, 5.0], [7.0, 7.2]]) it.push(bush(x, y, 0, PAL.leaf));
    it.push(lamp(7.2, 3.2));
    return { bg: mix(PAL.terra, '#ffffff', .7), it, labels: [label([3.2, 5.0, 1.95], 'water first', -16, -16), label([3.8, 1.0, 2.4], 'by the glass', -8, -12, true), label([6.2, 5.4, 1.2], 'host steps', 16, 18, true)] };
  },
};

export function sceneSVG(id, { labels = true, title = '' } = {}) {
  beginScene();
  const { it, labels: lb, bg = PAL.mint } = SCENES[id]();
  it.sort((a, b) => a.d - b.d);
  const base = it.filter(i => i.d <= -50), rest = it.filter(i => i.d > -50);
  const out = `<svg xmlns="${NS}" class="scene" viewBox="-12 -4 264 198" role="img" aria-label="${title}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">` +
    defs() +
    `<circle cx="120" cy="84" r="80" fill="${bg}" opacity=".55"/>` +
    `<circle cx="120" cy="84" r="80" fill="url(#${CUR.k}v)" opacity=".5"/>` +
    `<ellipse cx="128" cy="166" rx="100" ry="9" fill="${LINE}" opacity=".12" filter="url(#${CUR.k}b)"/>` +
    base.map(i => i.s).join('') +
    `<g fill="${LINE}" opacity=".2" filter="url(#${CUR.k}b)">${CUR.shadows.join('')}</g>` +
    rest.map(i => i.s).join('') + (labels ? `<g class="labels">${lb.join('')}</g>` : '') + `</svg>`;
  CUR = null;
  return out;
}

/* ---------- card icons (Clay line icons) ---------- */
export const ICONS = {
  '01': '<path d="M5 19c6 0 12-5 12-14C9 5 5 10 5 19zm0 0l7-7"/>',
  '02': '<circle cx="9" cy="9" r="2.3"/><circle cx="14" cy="9" r="2.3"/><circle cx="11.5" cy="13" r="2.3"/><circle cx="11.5" cy="17.4" r="2"/><path d="M11.5 6.5V3m0 0c2 0 4 1 4 2"/>',
  '03': '<g fill="currentColor"><circle cx="9" cy="9" r="2.3"/><circle cx="14" cy="9" r="2.3"/><circle cx="11.5" cy="13" r="2.3"/><circle cx="11.5" cy="17.4" r="2"/></g><path d="M11.5 6.5V3m0 0c2 0 4 1 4 2"/>',
  '04': '<path d="M4 10h16l-2 9H6zM8 10l2-5m6 5l-2-5"/>',
  '05': '<path d="M12 3v5M12 8L4 20M12 8l-4 12M12 8v12M12 8l4 12M12 8l8 12"/><circle cx="12" cy="8" r="1.4"/>',
  '06': '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M6 5c-1 4-1 10 0 14m12-14c1 4 1 10 0 14M6 19c0 1 3 2 6 2s6-1 6-2M5.5 9.5h13M5.5 14.5h13"/>',
  '07': '<path d="M10 3h4v4l2 3v11H8V10l2-3zM8 13h8"/>',
  '08': '<path d="M4 4v16M20 4v16M4 8h16M4 13h16M4 18h16M8 8v-2m4 7v-2m4 7v-2"/>',
  '09': '<path d="M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v6m-4 0h8M7.6 7h8.8"/>',
};
