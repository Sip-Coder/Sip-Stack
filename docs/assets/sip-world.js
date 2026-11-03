// Sip-Stack · World (isometric 3x3) + Outline (Mermaid) dual view.
// Original Sip Studies teaching graphics. Plain SVG, no build step.
// v2 "diorama" pass: cel-banded faces, ink silhouettes, soft cast shadows, grain.
// v4 "elevate" pass: denser props, far backdrop + mood layer, per-chart toolbar toggles (opt groups)
// that redraw geometry, shared note dock with the Village.

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

const CX = Math.cos(Math.PI / 6);
let U = 14, OX = 120, OY = 46; // per-scene camera (stacked scenes zoom out a touch)
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
    `<filter id="${CUR.k}s" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="5"/></filter>` +
    `<linearGradient id="${CUR.k}m" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#ffb35c" stop-opacity=".46"/><stop offset=".55" stop-color="#f3a46a" stop-opacity=".12"/><stop offset="1" stop-color="#7a3d22" stop-opacity=".2"/></linearGradient>` +
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
  const H = o.H ?? 0.95, t = Math.min(0.28, H * 0.45), soil = o.soil || mix(PAL.soil, c, .25);
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
  for (let i = 0; i < (H > 0.6 ? 16 : 0); i++) {
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
  const [bx, by] = P(cx, cy, opts.z || 0);
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
    (opts.hat ? `<ellipse cx="${bx}" cy="${by - 16.6}" rx="4.6" ry="1.3" fill="${opts.hat}" stroke="${LINE}" stroke-width=".5"/><path d="M${bx - 2.2},${by - 16.8} q2.2,-3.4 4.4,0 z" fill="${opts.hat}" stroke="${LINE}" stroke-width=".5"/>` : '') +
    (opts.apron ? `<path d="M${bx - 1.9},${by - 10.2} h3.8 l.5,5.4 h-4.8 z" fill="${opts.apron}" stroke="${LINE}" stroke-width=".45"/>` : '') +
    (opts.extra || '') +
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

/* ---------- v3 helpers: people with jobs, flows, stacked layers, pins ---------- */
const pp = (x, y) => `${f(x)},${f(y)}`;
// tools drawn in screen space at the hand point (x,y)
const TOOLS = {
  shears: (x, y) => `<path d="M${pp(x, y)}l3.4,-2.8M${pp(x, y)}l3.6,-1.1" stroke="${dark(PAL.steel, .2)}" stroke-width="1" stroke-linecap="round"/><circle cx="${f(x)}" cy="${f(y)}" r="1" fill="${PAL.clay}" stroke="${LINE}" stroke-width=".4"/>`,
  clip: (x, y) => `<rect x="${f(x - .4)}" y="${f(y - 4.8)}" width="3.8" height="4.8" rx=".4" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".5"/><path d="M${pp(x + .3, y - 3.5)}h2.4M${pp(x + .3, y - 2.4)}h2.4M${pp(x + .3, y - 1.3)}h1.5" stroke="${FINE}" stroke-width=".4"/><rect x="${f(x + .7)}" y="${f(y - 5.3)}" width="1.4" height="1" fill="${PAL.mustard}" stroke="${LINE}" stroke-width=".3"/>`,
  basket: (x, y, c = PAL.red) => `<path d="M${pp(x - 1.6, y - 1.4)}h5.2l-.8,3.6h-3.6z" fill="${PAL.wood}" stroke="${LINE}" stroke-width=".5"/><circle cx="${f(x + .2)}" cy="${f(y - 1.9)}" r="1" fill="${c}" stroke="${LINE}" stroke-width=".3"/><circle cx="${f(x + 1.9)}" cy="${f(y - 2)}" r="1" fill="${c}" stroke="${LINE}" stroke-width=".3"/>`,
  paddle: (x, y) => `<path d="M${pp(x - 1, y - 3)}l4.4,9" stroke="${PAL.wood}" stroke-width="1.1" stroke-linecap="round"/><path d="M${pp(x + 2.2, y + 6.6)}l3.2,-1.4l.7,1.4l-3.2,1.4z" fill="${dark(PAL.wood, .2)}" stroke="${LINE}" stroke-width=".4"/>`,
  glass: (x, y, c = PAL.red) => `<path d="M${pp(x - 1.3, y - 4.4)}h2.6q0,2.4 -1.3,2.6v1.6h1v.5h-2.6v-.5h1v-1.6q-1.3,-.2 -1.3,-2.6z" fill="rgba(251,245,234,.95)" stroke="${LINE}" stroke-width=".4"/><path d="M${pp(x - 1.1, y - 3.3)}h2.2q-.2,1.3 -1.1,1.4q-.9,-.1 -1.1,-1.4z" fill="${c}"/>`,
  bottle: (x, y, c = PAL.teal) => `<path d="M${pp(x - .9, y + 1)}h1.8v-4.6l-.4,-.9v-1.6h-1v1.6l-.4,.9z" fill="${c}" stroke="${LINE}" stroke-width=".45"/><rect x="${f(x - .9)}" y="${f(y - 2.2)}" width="1.8" height="1.4" fill="${PAL.cream}"/>`,
  thief: (x, y) => `<path d="M${pp(x, y - 4)}l1,8" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/><path d="M${pp(x, y - 4)}l1,8" stroke="rgba(251,245,234,.95)" stroke-width="1.3" stroke-linecap="round"/><path d="M${pp(x + .6, y + 1)}l.4,3" stroke="${PAL.red}" stroke-width="1" stroke-linecap="round"/>`,
  jug: (x, y) => `<path d="M${pp(x - 1.4, y + 1)}h3l-.3,-4.6l.9,-.8h-4.3l.5,.8z" fill="${mix(PAL.water, '#ffffff', .45)}" stroke="${LINE}" stroke-width=".45"/><path d="M${pp(x + 1.6, y - 3)}q1.4,.4 .4,2.2" stroke="${LINE}" stroke-width=".45" fill="none"/>`,
  case: (x, y) => `<rect x="${f(x - 2)}" y="${f(y - 3.4)}" width="4.6" height="3.4" fill="${light(PAL.wood, .35)}" stroke="${LINE}" stroke-width=".5"/><path d="M${pp(x - 2, y - 2.1)}h4.6" stroke="${FINE}" stroke-width=".4"/>`,
  tray: (x, y) => `<ellipse cx="${f(x + .6)}" cy="${f(y - .6)}" rx="3.2" ry="1" fill="${PAL.steel}" stroke="${LINE}" stroke-width=".45"/>` + `<path d="M${pp(x - .2, y - 4.4)}h1.8q0,1.7 -.9,1.9v1.7M${pp(x + 1.4, y - 4.4)}h1.8q0,1.7 -.9,1.9v1.7" stroke="${LINE}" stroke-width=".4" fill="rgba(251,245,234,.9)"/>`,
  bottlePour: (x, y, c = PAL.red) => `<g transform="rotate(62 ${f(x)} ${f(y)})"><path d="M${pp(x - .9, y + 1)}h1.8v-4.6l-.4,-.9v-1.6h-1v1.6l-.4,.9z" fill="${c}" stroke="${LINE}" stroke-width=".45"/></g>`,
  none: () => '',
};
function worker(cx, cy, c, tool = 'none', o = {}) {
  const z = o.z || 0, [bx, by] = P(cx, cy, z);
  const fl = o.flip ? -1 : 1, hx = bx + 2.8 * fl, hy = by - 8.2;
  const draw = TOOLS[tool](hx, hy, o.tc);
  const arm = `<path d="M${pp(bx + 1.6 * fl, by - 11)}L${pp(hx, hy)}" stroke="${dark(c, .2)}" stroke-width="1.5" stroke-linecap="round"/><circle cx="${f(hx)}" cy="${f(hy)}" r=".85" fill="${PAL.skin}" stroke="${LINE}" stroke-width=".35"/>`;
  const toolG = `<g class="tool" style="transform-origin:${f(bx + 1.6 * fl)}px ${f(by - 11)}px;--delay:${o.delay ?? 0}s">` +
    (o.flip ? `<g transform="translate(${f(2 * hx)},0) scale(-1,1)">${TOOLS[tool](hx, hy, o.tc)}</g>` : draw) + arm + `</g>`;
  const fig = figure(cx, cy, c, { z, hat: o.hat, apron: o.apron, hair: o.hair, cls: o.cls ?? 'chore', style: `--delay:${o.delay ?? 0}s`, extra: toolG });
  return { d: cx + cy + z * 0.01 + 0.35, s: fig.s };
}
// walking loop: item drawn at pts[0]; animateMotion carries it around the closed path
function walk(item, pts, dur, delay = 0, cls = 'walker') {
  const [x0, y0] = P(...pts[0]);
  const d = pts.map((p, i) => { const [x, y] = P(...p); return (i ? 'L' : 'M') + pp(x - x0, y - y0); }).join('') + 'Z';
  return { d: item.d, s: `<g class="${cls}">${item.s}<animateMotion dur="${dur}s" begin="${-delay}s" repeatCount="indefinite" path="${d}"/></g>` };
}
// dashed flow path with travelling packets (diegetic "how it moves" line)
function flow(pts, c = PAL.clay, o = {}) {
  const d = pts.map((p, i) => { const [x, y] = P(...p); return (i ? 'L' : 'M') + pp(x, y); }).join('') + (o.close ? 'Z' : '');
  const dur = o.dur ?? 6, n = o.packets ?? 0;
  let s = `<path class="flow" d="${d}" stroke="${c}" stroke-width="${o.w ?? .9}" fill="none" stroke-dasharray="2.2 2.2" stroke-linecap="round" opacity="${o.op ?? .9}"/>`;
  for (let i = 0; i < n; i++)
    s += `<g>${o.packet || `<circle r="${o.r ?? 1.4}" fill="${o.pc ?? c}" stroke="${LINE}" stroke-width=".4"/>`}<animateMotion dur="${dur}s" begin="${-(i * dur / n).toFixed(2)}s" repeatCount="indefinite" path="${d}"/></g>`;
  return { d: o.d ?? -40, s };
}
function birds(n, seed, y0 = 4, spread = 30) {
  const r = rng(seed); let s = '';
  for (let i = 0; i < n; i++) {
    const y = y0 + r() * spread, dur = 16 + r() * 10, k = 0.7 + r() * 0.5;
    s += `<g><g transform="scale(${f(k)})"><path class="flap" style="--delay:${f(-r())}s" d="M-2.8,0q1.4,-1.8 2.8,0q1.4,-1.8 2.8,0" stroke="${LINE}" stroke-width=".7" fill="none" stroke-linecap="round"/></g>` +
      `<animateMotion dur="${f(dur)}s" begin="${f(-r() * dur)}s" repeatCount="indefinite" path="M-6,${f(y)}q70,-12 130,2t130,-8"/></g>`;
  }
  return { d: 2000, s };
}
function leafG(x, y, k = 1, c = PAL.leaf, rot = 0) {
  return `<path transform="translate(${f(x)},${f(y)}) rotate(${rot}) scale(${k})" d="M0,0c-1,-.6 -2.8,-.6 -3,-2.6c1,.1 1.3,-.9 .8,-1.8c1,.4 1.6,-.1 2.2,-1.2c.6,1.1 1.2,1.6 2.2,1.2c-.5,.9 -.2,1.9 .8,1.8c-.2,2 -2,2 -3,2.6z" fill="${c}" stroke="${LINE}" stroke-width="${f(.45 / k)}"/><path transform="translate(${f(x)},${f(y)}) rotate(${rot}) scale(${k})" d="M0,0v-4" stroke="${dark(c, .35)}" stroke-width="${f(.3 / k)}"/>`;
}
function vine(x, y, o = {}) {
  const cz = o.cz ?? 1.45;
  const t = box(x - 0.06, y - 0.06, 0, 0.12, 0.12, cz - 0.2, dark(PAL.wood, .15), { thin: true });
  const b = bush(x, y, cz, o.leaf ?? PAL.leaf);
  const [lx, ly] = P(x, y, cz);
  let s = t.s + b.s + leafG(lx - 6.4, ly - 6, .9, light(o.leaf ?? PAL.leaf, .12), -30) + leafG(lx + 6.6, ly - 4, .8, dark(o.leaf ?? PAL.leaf, .08), 35);
  if (o.grape !== false) s += cluster(x + 0.22, y + 0.42, cz - 0.42, o.grape ?? PAL.red, o.br ?? 1.0).s;
  return { d: x + y + 0.45, s };
}
// horizontal barrel lying along y; front head faces the viewer
function circ3(cx, cy, cz, r, n = 18) { return Array.from({ length: n }, (_, i) => P(cx + r * Math.cos(i * 2 * Math.PI / n), cy, cz + r * Math.sin(i * 2 * Math.PI / n))); }
function hbarrel(x, y, z, r = 0.42, len = 1.1, c = PAL.wood, o = {}) {
  const back = circ3(x, y, z + r, r * 0.92), front = circ3(x, y + len, z + r, r), mid = circ3(x, y + len / 2, z + r, r * 1.08);
  const body = hull([...back, ...front, ...mid]);
  const poly = q => q.map(v => v.map(f).join(',')).join(' ');
  let s = `<polygon points="${poly(body)}" fill="${c}" stroke="${LINE}" stroke-width=".8" stroke-linejoin="round"/>`;
  for (const t of [0.22, 0.78]) { const h = circ3(x, y + len * t, z + r, r * 1.06); s += `<polyline points="${poly(h.slice(9).concat([h[0]]))}" fill="none" stroke="${dark(PAL.steel, .35)}" stroke-width="1.1"/>`; }
  s += `<polygon points="${poly(front)}" fill="${light(c, .25)}" stroke="${LINE}" stroke-width=".7"/>`;
  s += `<polygon points="${poly(circ3(x, y + len, z + r, r * 0.72))}" fill="none" stroke="${FINE}" stroke-width=".4"/>`;
  const [bx, by] = P(x, y + len * 0.5, z + r * 2.05);
  s += `<circle cx="${f(bx)}" cy="${f(by)}" r=".9" fill="${dark(c, .4)}" stroke="${LINE}" stroke-width=".35"/>`; // bung
  if (o.chalk) { const [cx2, cy2] = P(x, y + len, z + r); s += `<path d="M${pp(cx2 - 2, cy2 - 1)}h3M${pp(cx2 - 1.6, cy2 + .6)}h2.2" stroke="#fff" stroke-width=".55" opacity=".85"/>`; }
  if (z === 0 && !o.noShadow) castShadow(rectFoot(x - r, y, 2 * r, len), 2 * r);
  return { d: x + y + len / 2 + z * 0.01, s };
}
function amphora(x, y, c = PAL.terra, k = 1) {
  const [bx, by] = P(x, y, 0);
  const W = 4.6 * k, H = 14 * k;
  const d = `M${pp(bx - 1.6 * k, by - H)}q-${f(W)},${f(H * .25)} -${f(W * .7)},${f(H * .55)}q${f(W * .2)},${f(H * .4)} ${f(W * .7 + 1.6 * k)},${f(H * .45)}q${f(W * .9)},-${f(H * .05)} ${f(W * .9)},-${f(H * .45)}q0,-${f(H * .3)} -${f(W * .9 - 1.6 * k)},-${f(H * .55)}z`;
  let s = `<ellipse cx="${f(bx + 2)}" cy="${f(by)}" rx="${f(5 * k)}" ry="${f(1.8 * k)}" fill="${LINE}" opacity=".18"/>`;
  s += `<path d="${d}" fill="${bandGrad(c)}" stroke="${LINE}" stroke-width=".8" stroke-linejoin="round"/>`;
  s += `<ellipse cx="${f(bx)}" cy="${f(by - H)}" rx="${f(1.9 * k)}" ry="${f(.7 * k)}" fill="${dark(c, .35)}" stroke="${LINE}" stroke-width=".5"/>`;
  s += `<path d="M${pp(bx - W * .55, by - H * .55)}q${f(W * .55)},${f(1.6 * k)} ${f(W * 1.1)},0" stroke="${FINE}" stroke-width=".4" fill="none"/>`;
  return { d: x + y + 0.2, s };
}
function ladder(x, y, z0, h, lean = 0.5) {
  let s = seg3([x, y, z0], [x - lean, y, z0 + h], .9, PAL.wood) + seg3([x + 0.3, y, z0], [x + 0.3 - lean, y, z0 + h], .9, PAL.wood);
  for (let i = 1; i < 5; i++) { const t = i / 5; s += seg3([x - lean * t, y, z0 + h * t], [x + 0.3 - lean * t, y, z0 + h * t], .6, dark(PAL.wood, .2)); }
  return { d: x + y + 0.6, s };
}
function hoseReel(x, y) {
  const [bx, by] = P(x, y, 0.35);
  return { d: x + y + 0.2, s: box(x - 0.2, y - 0.1, 0, 0.4, 0.2, 0.12, PAL.steel, { thin: true, noShadow: true }).s +
    `<circle cx="${f(bx)}" cy="${f(by)}" r="4" fill="${PAL.teal}" stroke="${LINE}" stroke-width=".7"/><circle cx="${f(bx)}" cy="${f(by)}" r="2.4" fill="none" stroke="${light(PAL.teal, .4)}" stroke-width="1.1"/><circle cx="${f(bx)}" cy="${f(by)}" r=".8" fill="${PAL.mustard}"/>` };
}
function bucket(x, y, z = 0, c = PAL.steel, inside = PAL.water) {
  const k = cyl(x, y, z, 0.2, 0.32, c, { lid: false, noShadow: z !== 0 });
  const [bx, by] = P(x, y, z + 0.32);
  return { d: k.d, s: k.s + `<ellipse cx="${f(bx)}" cy="${f(by + .3)}" rx="2.4" ry="1.2" fill="${inside}" opacity=".9"/>` };
}
function steam(x, y, z, n = 3, c = PAL.cream) {
  const [px, py] = P(x, y, z); let s = '';
  for (let i = 0; i < n; i++) s += `<circle class="puff" style="--delay:${(i * 1.1).toFixed(2)}s" cx="${f(px)}" cy="${f(py - 2)}" r="2.2" fill="${c}" stroke="${LINE}" stroke-width=".45"/>`;
  return { d: x + y + z * 0.01 + 1, s };
}
function chip(x, y, z, text, c = PAL.cream, tc = LINE) { // tiny hand-lettered tag stuck on a thing
  const [px, py] = P(x, y, z), w = text.length * 2.6 + 3;
  return { d: x + y + z * 0.01 + 0.6, s: `<rect x="${f(px - w / 2)}" y="${f(py - 3.2)}" width="${f(w)}" height="4.6" rx=".8" fill="${c}" stroke="${LINE}" stroke-width=".45"/><text x="${f(px)}" y="${f(py + .2)}" text-anchor="middle" class="chip" fill="${tc}">${text}</text>` };
}
function pallet(x, y, w = 1.2, d = 1.0) { return box(x, y, 0, w, d, 0.16, light(PAL.wood, .25), { thin: true, planks: 2 }); }
function cases(x, y, z, nx, ny, nz, c = PAL.sand, s = 0.42) {
  const out = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (k === nz - 1 && (i + j) % 3 === 2) continue; // irregular top layer
    out.push(box(x + i * s, y + j * s, z + k * s * 0.8, s - 0.03, s - 0.03, s * 0.8 - 0.02, k % 2 ? light(c, .1) : c, { thin: true, noShadow: z + k > 0 }));
  }
  return out;
}
// state + zone wrappers (driven by sip-app.js)
const when = (state, item, on = false) => ({ d: item.d, s: `<g class="st${on ? ' on' : ''}" data-when="${state}">${item.s}</g>` });
const Z = (key, item) => ({ d: item.d, s: `<g class="zone hs" data-zone="${key}" data-hs="${key}">${item.s}</g>` });
const group = (d, items) => ({ d, s: items.slice().sort((a, b) => a.d - b.d).map(i => i.s).join('') });
// toolbar option groups: <g class="op" data-k data-v> shown when the scene's option k === v (driven by sip-app.js).
// Shadows cast inside travel with the group so hidden props never leave a ghost shadow.
function optG(k, v, fn, on = false, d) {
  const n = CUR.shadows.length, r = fn(), sh = CUR.shadows.splice(n);
  const arr = (Array.isArray(r) ? r : [r]).slice().sort((a, b) => a.d - b.d);
  const shG = sh.length ? `<g fill="${LINE}" opacity=".2" filter="url(#${CUR.k}b)">${sh.join('')}</g>` : '';
  return { d: d ?? arr[arr.length - 1].d, s: `<g class="op${on ? ' on' : ''}" data-k="${k}" data-v="${v}">${shG}${arr.map(i => i.s).join('')}</g>` };
}
// conversational leader tag with a numbered, clickable pin
function tag(at, key, n, title, sub, dx, dy) {
  const [x, y] = P(...at), ex = x + dx, ey = y + dy, L = dx < 0, tx = ex + (L ? -8 : 8), an = L ? 'end' : 'start';
  const w = Math.max(title.length * 4.1, (sub || '').length * 2.9) + 4;
  return `<g class="hs tag" data-hs="${key}" tabindex="0" role="button" aria-label="${title}: open the Sip Studies note">` +
    `<rect class="hit" x="${f(L ? tx - w : tx - 2)}" y="${f(ey - 6.2)}" width="${f(w)}" height="${sub ? 15 : 9}" fill="transparent"/>` +
    `<path class="leader" d="M${pp(x, y)}L${pp(ex, ey)}L${pp(ex + (L ? -6 : 6), ey)}"/>` +
    `<text class="t1" x="${f(tx)}" y="${f(ey + 2)}" text-anchor="${an}">${title}</text>` +
    (sub ? `<text class="t2" x="${f(tx)}" y="${f(ey + 8)}" text-anchor="${an}">${sub}</text>` : '') +
    `<g class="pin"><circle class="hit" cx="${f(x)}" cy="${f(y)}" r="8" fill="transparent"/><circle class="ring" cx="${f(x)}" cy="${f(y)}" r="4.4"/><circle class="core" cx="${f(x)}" cy="${f(y)}" r="3.4"/><text class="pn" x="${f(x)}" y="${f(y + 1.55)}" text-anchor="middle">${n}</text></g></g>`;
}
// stacked cutaway level under the ground slab (dollhouse view: front + right walls removed)
function cave(o = {}) {
  const top = o.top ?? -0.42, h = o.h ?? 2.3, zf = top - h, fh = 0.45, wall = o.wall ?? mix(PAL.sand, PAL.mauve, .25), floorC = o.floor ?? mix(PAL.sand, PAL.wood, .2);
  const it = [];
  let s = box(0, 0, zf - fh, 8, 8, fh, floorC, { noShadow: true }).s;
  for (let i = 1; i < 8; i++) s += seg3([i, 0.05, zf], [i, 7.95, zf], .35) + seg3([0.05, i, zf], [7.95, i, zf], .35);
  s += fill([[0, 0, zf], [0, 8, zf], [0, 8, top], [0, 0, top]], light(wall, .08)) + fill([[0, 0, zf], [8, 0, zf], [8, 0, top], [0, 0, top]], dark(wall, .1));
  for (let r = 1; r < 5; r++) { const zz = zf + h * r / 5; s += seg3([0, 0.1, zz], [0, 7.9, zz], .35) + seg3([0.1, 0, zz], [7.9, 0, zz], .35); }
  s += fill([[0, 0, zf], [0, 8, zf], [0, 8, top], [0, 0, top]], `url(#${CUR.k}v)`, 'opacity=".25"');
  it.push({ d: -300, s });
  it.push({ d: 15.6, s: box(7.62, 7.62, zf, 0.38, 0.38, h, dark(wall, .15), { noShadow: true, thin: true }).s });
  return { it, zf, top, h };
}
/* ---------- v4 prop kit (denser scenes) ---------- */
function chair(x, y, c = PAL.wood, back = 'n') { // little bistro chair; back on the n/e/s/w side
  const it = [box(x, y, 0.42, 0.42, 0.42, 0.06, light(c, .1), { thin: true, noShadow: true })];
  for (const [dx, dy] of [[0, 0], [0.36, 0], [0, 0.36], [0.36, 0.36]]) it.push(box(x + dx, y + dy, 0, 0.06, 0.06, 0.42, dark(c, .2), { thin: true, noShadow: true }));
  const bk = { n: [x, y, 0.42, 0.06], s: [x, y + 0.36, 0.42, 0.06], w: [x, y, 0.06, 0.42], e: [x + 0.36, y, 0.06, 0.42] }[back];
  it.push(box(bk[0], bk[1], 0.48, bk[2], bk[3], 0.5, c, { thin: true, noShadow: true }));
  castShadow(rectFoot(x, y, 0.42, 0.42), 0.5);
  return group(x + y + 0.42, it);
}
function plate(x, y, z, food = PAL.sage) {
  const [px, py] = P(x, y, z);
  return { d: x + y + z * 0.01 + 0.15, s: `<ellipse cx="${f(px)}" cy="${f(py)}" rx="4.4" ry="2.2" fill="#fffaf1" stroke="${LINE}" stroke-width=".5"/><ellipse cx="${f(px)}" cy="${f(py)}" rx="2.8" ry="1.3" fill="none" stroke="${FINE}" stroke-width=".35"/>` +
    (food ? `<ellipse cx="${f(px - .4)}" cy="${f(py - .4)}" rx="1.7" ry=".9" fill="${food}" stroke="${LINE}" stroke-width=".35"/><circle cx="${f(px + 1.1)}" cy="${f(py - .2)}" r=".7" fill="${PAL.terra}" stroke="${LINE}" stroke-width=".3"/>` : '') };
}
function candle(x, y, z) {
  const [px, py] = P(x, y, z);
  return { d: x + y + z * 0.01 + 0.3, s: `<rect x="${f(px - .8)}" y="${f(py - 3.6)}" width="1.6" height="3.6" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".4"/><path class="flick" d="M${pp(px, py - 6.2)}q1,1.4 0,2.4q-1,-1 0,-2.4z" fill="${PAL.mustard}" stroke="${LINE}" stroke-width=".3"/><circle class="glow" cx="${f(px)}" cy="${f(py - 5)}" r="4" fill="${PAL.mustard}" opacity=".2"/>` };
}
function jar(x, y, z, c = PAL.soil, h = 0.34) { const k = cyl(x, y, z, 0.13, h, 'rgba(240,236,224,1)', { lid: false, noShadow: z !== 0 }); const [bx, by] = P(x, y, z), [, ty] = P(x, y, z + h * 0.6); return { d: k.d, s: k.s + `<rect x="${f(bx - 1.6)}" y="${f(ty)}" width="3.2" height="${f(by - ty)}" fill="${c}" opacity=".85"/>` }; }
function tent(x, y, w, d, h, c = PAL.teal) { // pop-up shade canopy
  const it = [];
  for (const [dx, dy] of [[0, 0], [w, 0], [0, d], [w, d]]) it.push(box(x + dx - 0.04, y + dy - 0.04, 0, 0.08, 0.08, h, dark(PAL.steel, .3), { thin: true, noShadow: true }));
  const T = [[x - 0.1, y - 0.1, h], [x + w + 0.1, y - 0.1, h], [x + w + 0.1, y + d + 0.1, h], [x - 0.1, y + d + 0.1, h]];
  let s = fill(T, light(c, .15)) + ink(T, .8);
  for (let i = 1; i < 4; i++) s += seg3([x - 0.1 + (w + 0.2) * i / 4, y - 0.1, h], [x - 0.1 + (w + 0.2) * i / 4, y + d + 0.1, h], .4, 'rgba(255,255,255,.45)');
  const V = [[x - 0.1, y + d + 0.1, h], [x + w + 0.1, y + d + 0.1, h], [x + w + 0.1, y + d + 0.1, h - 0.22], [x - 0.1, y + d + 0.1, h - 0.22]];
  s += fill(V, c) + ink(V, .6);
  castShadow(rectFoot(x, y, w, d), 0.6);
  it.push({ d: x + y + w + d + 0.2, s });
  return it;
}
function wheelbarrow(x, y, c = PAL.teal, load = PAL.soil) {
  const tray = box(x, y, 0.3, 0.75, 0.45, 0.28, c, { thin: true, noShadow: true });
  const [lx, ly] = P(x + 0.38, y + 0.22, 0.58);
  const wheel = cyl(x + 0.85, y + 0.22, 0, 0.16, 0.08, '#3b332e', { noShadow: true, lid: false });
  castShadow(rectFoot(x, y, 0.9, 0.45), 0.5);
  return { d: x + y + 0.7, s: tray.s + `<ellipse cx="${f(lx)}" cy="${f(ly)}" rx="4.6" ry="1.7" fill="${load}" stroke="${LINE}" stroke-width=".4"/>` + wheel.s + seg3([x, y + 0.05, 0.45], [x - 0.45, y + 0.05, 0.6], .9, PAL.wood) + seg3([x, y + 0.4, 0.45], [x - 0.45, y + 0.4, 0.6], .9, PAL.wood) };
}
function station(x, y) { // vineyard weather station: mast, cups, rain gauge
  const m = box(x - 0.05, y - 0.05, 0, 0.1, 0.1, 2.5, dark(PAL.steel, .25), { thin: true });
  const [cx0, cy0] = P(x, y, 2.55);
  let s = m.s + `<g class="spin" style="transform-origin:${f(cx0)}px ${f(cy0)}px">` + [0, 1, 2].map(i => { const a = i * 2.094; return `<path d="M${pp(cx0, cy0)}L${pp(cx0 + Math.cos(a) * 4, cy0 + Math.sin(a) * 1.6)}" stroke="${LINE}" stroke-width=".5"/><circle cx="${f(cx0 + Math.cos(a) * 4)}" cy="${f(cy0 + Math.sin(a) * 1.6)}" r="1" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".4"/>`; }).join('') + `</g>`;
  s += box(x + 0.05, y - 0.15, 1.5, 0.3, 0.12, 0.38, PAL.cream, { thin: true, noShadow: true }).s;
  const [rx, ry] = P(x + 0.2, y - 0.09, 1.7);
  s += `<rect x="${f(rx - .7)}" y="${f(ry - 1)}" width="1.4" height="2" fill="${PAL.water}"/>`;
  return { d: x + y + 0.2, s };
}
function bareVine(x, y, o = {}) { // winter: trunk + cordon arms + short spurs, no leaves
  const cz = o.cz ?? 1.45;
  const t = box(x - 0.06, y - 0.06, 0, 0.12, 0.12, cz - 0.1, dark(PAL.wood, .15), { thin: true });
  let s = t.s + seg3([x - 0.5, y, cz - 0.05], [x + 0.5, y, cz - 0.05], 1.5, dark(PAL.wood, .2));
  for (const dx of [-0.42, -0.16, 0.16, 0.42]) { const [a, b] = P(x + dx, y, cz - 0.05); s += `<path d="M${pp(a, b)}l${f(dx * 2)},-3.6" stroke="${dark(PAL.wood, .05)}" stroke-width=".9" stroke-linecap="round"/><circle cx="${f(a + dx * 2)}" cy="${f(b - 3.6)}" r=".55" fill="${PAL.terra}"/>`; }
  return { d: x + y + 0.45, s };
}
function canes(x, y) { // cut canes bundled on the ground after pruning
  const [px, py] = P(x, y, 0); let s = '';
  for (let i = 0; i < 6; i++) s += `<path d="M${pp(px - 6 + i * .4, py - i * .5)}l11,-3.4" stroke="${i % 2 ? PAL.wood : dark(PAL.wood, .2)}" stroke-width=".9" stroke-linecap="round"/>`;
  return { d: x + y + 0.1, s: s + `<path d="M${pp(px - .6, py - 3.4)}l.8,3.2" stroke="${PAL.mustard}" stroke-width="1"/>` };
}
function thermo(x, y, z, level, c = PAL.clay) { // small thermometer on a post (cool → warm)
  const [px, py] = P(x, y, z);
  return { d: x + y + z * 0.01 + 0.5, s: `<rect x="${f(px - 1.3)}" y="${f(py - 9)}" width="2.6" height="9" rx="1.3" fill="#fffaf1" stroke="${LINE}" stroke-width=".45"/><rect x="${f(px - .5)}" y="${f(py - 1.2 - 6.4 * level)}" width="1" height="${f(6.4 * level)}" fill="${c}"/><circle cx="${f(px)}" cy="${f(py - .9)}" r="1.4" fill="${c}" stroke="${LINE}" stroke-width=".35"/>` };
}
function hoseLine(pts, c = PAL.teal) { // a hose snaking across a floor
  const d = pts.map((p, i) => { const [x, y] = P(...p); return (i ? 'L' : 'M') + pp(x, y); }).join('');
  return { d: -38, s: `<path d="${d}" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` };
}
function crowd(x, y, c, o = {}) { return figure(x, y, c, { cls: o.cls ?? 'bob', style: `--delay:${o.delay ?? 0}s`, hat: o.hat, hair: o.hair, z: o.z }); }
// far layer: soft hills / sea line behind the block, clipped to the backdrop disc
function backdrop(kind, c) {
  const k = CUR.k, tint = c || PAL.sage;
  const hills = kind === 'sea'
    ? `<path d="M30,58 Q80,50 120,54 T210,52 V170 H30 Z" fill="${mix(PAL.water, '#ffffff', .3)}" opacity=".6"/><path d="M30,62 Q90,58 140,61 T212,59M40,70 Q90,66 140,69 T212,67" stroke="#fff" stroke-width=".8" fill="none" opacity=".7"/>`
    : `<path d="M28,70 Q60,30 98,52 Q136,18 172,46 Q196,34 214,52 V170 H28 Z" fill="${mix(tint, '#ffffff', .35)}" opacity=".55"/><path d="M28,82 Q74,52 122,70 Q168,50 214,66 V170 H28 Z" fill="${mix(tint, '#ffffff', .15)}" opacity=".5"/>` +
      Array.from({ length: 9 }, (_, i) => `<path d="M${40 + i * 20},${70 - (i % 3) * 6 - (i > 3 && i < 6 ? 6 : 0)} l2.2,-7 l2.2,7z" fill="${mix(tint, LINE, .4)}" opacity=".4"/>`).join('');
  return `<clipPath id="${k}c"><circle cx="120" cy="84" r="80"/></clipPath><g clip-path="url(#${k}c)" class="far">${hills}` +
    `<circle class="sun" cx="170" cy="32" r="9" fill="${PAL.mustard}" opacity=".0"/></g>`;
}
/* ---------- the nine scenes (v3: stacked layers, people with jobs, pins) ---------- */
function roots(face, u, z0, z1, seed, c = dark(PAL.wood, .1)) { // root strands on a cut face (y=8 front or x=8 right)
  const r = rng(seed), at = (a, z) => face === 'y' ? P(a, 8, z) : P(8, a, z);
  let s = '';
  for (let k = 0; k < 3; k++) {
    let a = u + (r() - .5) * .2, z = z0, d = '';
    const [sx, sy] = at(a, z); d = `M${pp(sx, sy)}`;
    while (z > z1) { a += (r() - .5) * .5 + (k - 1) * .12; z -= .25 + r() * .2; const [x, y] = at(a, Math.max(z, z1)); d += `L${pp(x, y)}`; }
    s += `<path d="${d}" stroke="${c}" stroke-width="${k === 1 ? 1.1 : .6}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return s;
}
function bulb(u, zTop, rx, rz, c = PAL.water) { // wetting bulb on the front cut face
  const q = Array.from({ length: 13 }, (_, i) => P(u + rx * Math.cos(Math.PI * i / 12), 8, zTop - rz * Math.sin(Math.PI * i / 12)));
  return `<polygon points="${q.map(v => v.map(f).join(',')).join(' ')}" fill="${c}" opacity=".42" stroke="${dark(c, .2)}" stroke-width=".4" stroke-dasharray="1.2 1"/>`;
}
const SCENES = {
  '01'() { // Vineyard & vine training, with a fold-out soil cut
    const it = [ground(PAL.sage, 1, { H: 0.9, tufts: 22 })], r = rng(11);
    const rows = [1.3, 3.7, 6.1], vx = [1.5, 2.7, 5.0, 6.2];
    it.push(stripe(0.2, 6.85, 7.6, 0.95, mix(PAL.sand, PAL.soil, .3), { cols: 10 }));
    let grav = ''; for (let i = 0; i < 40; i++) { const [gx, gy] = P(0.3 + r() * 7.4, 6.9 + r() * 0.85, 0); grav += `<circle cx="${f(gx)}" cy="${f(gy)}" r="${f(.3 + r() * .45)}" fill="${dark(PAL.sand, .25 + r() * .2)}"/>`; }
    it.push({ d: -44, s: grav });
    for (const y of rows) {
      it.push(stripe(0.2, y - 0.32, 7.6, 0.75, mix(PAL.soil, PAL.sage, .38), { rows: 2 }));
      let straw = ''; for (let i = 0; i < 26; i++) { const [sx, sy] = P(0.3 + r() * 7.4, y - 0.28 + r() * 0.66, 0); straw += `<path d="M${pp(sx, sy)}l${f(1 + r() * 1.4)},${f(-.4 + r() * .8)}" stroke="${PAL.mustard}" stroke-width=".45" opacity=".8"/>`; }
      it.push({ d: -43, s: straw });
      it.push(box(0.3, y - 0.12, 0, 0.3, 0.3, 2.45, dark(PAL.wood, .1), { thin: true }));
      it.push(line3([0.42, y + 0.05, 2.3], [-0.0, y + 0.55, 0], .5, dark(PAL.steel, .3)));
      for (const x of [3.85, 7.3]) it.push(box(x, y - 0.06, 0, 0.18, 0.18, 2.25, PAL.wood, { thin: true }));
      for (const z of [0.95, 1.55, 2.05]) it.push(line3([0.6, y + 0.03, z], [7.3, y + 0.03, z], .5, dark(PAL.steel, .35)));
      it.push(box(6.85, y - 0.04, 0.88, 0.22, 0.12, 0.14, PAL.mustard, { thin: true, noShadow: true }));
      it.push(line3([0.6, y + 0.12, 0.28], [7.3, y + 0.12, 0.28], 1.1, dark(PAL.teal, .3)));
      vx.forEach((x, i) => {
        it.push(optG('season', 'summer', () => vine(x, y, { cz: 1.6, grape: PAL.red }), true));
        it.push(optG('season', 'winter', () => bareVine(x, y, { cz: 1.6 })));
        it.push(when('wet', drop(x + 0.12, y + 0.16, 0.28, (i * .6 + y * .3) % 2.4), true));
      });
    }
    it.push(ladder(4.15, 1.55, 0, 2.0, .45));
    it.push(worker(3.3, 6.8, PAL.clay, 'shears', { hat: PAL.sand }));
    it.push(worker(5.65, 6.8, PAL.teal, 'none', { hat: PAL.mustard, delay: .6 }));
    const [fx, fy] = P(5.9, 6.3, 1.4);
    it.push({ d: 12.5, s: `<g class="drip" style="--delay:1.2s;--ty:16px">${leafG(fx, fy, .7, light(PAL.leaf, .2), 20)}</g>` });
    it.push(walk(worker(0.7, 4.95, PAL.mauve, 'clip', { cls: 'walker' }), [[0.7, 4.95, 0], [7.2, 4.95, 0], [7.2, 2.55, 0], [0.7, 2.55, 0]], 20));
    it.push(hoseReel(7.45, 7.3)); it.push(bucket(1.5, 7.45)); it.push(crate(6.55, 7.05, 0, 0.45)); it.push(crate(6.6, 7.1, 0.45, 0.36, PAL.terra));
    it.push(sign(7.55, 0.4, 'block 3'));
    // v4 density: rain tank feeding the drip, weather mast, row-end roses, barrow, winter canes
    it.push(Z('tank', cyl(0.6, 7.3, 0, 0.42, 1.05, mix(PAL.water, PAL.steel, .4), { hoops: [0.35, 0.7] })));
    it.push(Z('tank', chip(0.6, 7.3, 1.3, 'rain', PAL.mint)));
    it.push(line3([0.95, 7.2, 0.25], [0.6, 6.25, 0.28], 1.1, dark(PAL.teal, .3)));
    it.push(Z('station', station(7.72, 4.9)));
    for (const y of rows) it.push(bush(7.72, y + 0.06, 0, mix(PAL.leaf, PAL.sage, .3), { berries: '#d9607a' }));
    it.push(wheelbarrow(2.05, 7.1));
    it.push(crate(4.5, 7.25, 0, 0.42, PAL.wood));
    for (const y of rows) it.push(optG('season', 'winter', () => [canes(2.1, y + 0.45), canes(5.6, y + 0.45)]));
    let frost = ''; for (let i = 0; i < 46; i++) { const [px, py] = P(0.3 + r() * 7.4, 0.3 + r() * 7.4, 0); frost += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(.4 + r() * .5)}" fill="#fff" opacity=".85"/>`; }
    it.push(optG('season', 'winter', () => ({ d: -42, s: frost })));
    it.push(birds(3, 1, 0, 22));
    // soil-cut faces on the top slab: roots + wetting bulbs
    let face = ''; for (const x of vx) face += roots('y', x, 0, -0.9, x * 10);
    for (const y of rows) face += roots('x', y, 0, -0.9, y * 10 + 3);
    it.push({ d: -99, s: face });
    it.push(when('wet', { d: -98.5, s: vx.map(x => bulb(x + .1, -0.05, .48, .55)).join('') }, true));
    // under slab: subsoil + rock, roots chase water down
    const und = [];
    let us = box(0, 0, -3.05, 8, 8, 1.95, mix(PAL.clay, PAL.sand, .42), { noShadow: true }).s;
    us += fill([[0, 8, -3.05], [8, 8, -3.05], [8, 8, -2.35], [0, 8, -2.35]], mix(PAL.mauve, PAL.sand, .3)) + fill([[8, 0, -3.05], [8, 8, -3.05], [8, 8, -2.35], [8, 0, -2.35]], dark(mix(PAL.mauve, PAL.sand, .3), .2));
    for (let i = 0; i < 22; i++) { const side = i % 2, u = 0.3 + r() * 7.4, v = -2.45 - r() * 0.5; const [px, py] = side ? P(8, u, v) : P(u, 8, v); us += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(1 + r())}" ry="${f(.6 + r() * .4)}" fill="${dark(PAL.mauve, .2)}" stroke="${LINE}" stroke-width=".35"/>`; }
    for (const x of vx) us += roots('y', x, -1.1, -2.5, x * 7 + 1);
    for (const y of rows) us += roots('x', y, -1.1, -2.4, y * 7 + 5);
    und.push({ d: -300, s: us });
    return { bg: PAL.mint, it, state: 'wet', opts: { season: 'summer' }, under: { it: und, open: 16 }, labels: [
      tag([3.85, 1.3, 2.05], 'trellis', 1, 'trellis wires', 'shoots up, air through', -12, -12),
      tag([6.2, 6.1, 2.3], 'canopy', 2, 'leaf pulling', 'sun on the fruit zone', 26, 8),
      tag([3.3, 6.8, 1.2], 'prune', 3, 'pruner', 'two buds a spur', -36, 2),
      tag([7.3, 1.3, 2.3], 'post', 4, 'end post', 'keeps the wire tight', 10, -16),
      tag([1.5, 6.1, 0.28], 'drip', 5, 'drip line', 'roots, not leaves', -26, 22),
    ], ulabels: [tag([6.2, 8, -1.9], 'soil', 6, 'soil cut', 'tap · unfold layers', 26, 8)] };
  },
  '02'() { return familyScene(2, { fams: [['crisp', 'Crisp', PAL.mint, 0.85, mix(PAL.white, '#ffffff', .55)], ['floral', 'Floral', mix(PAL.mauve, '#ffffff', 0.55), 1.3, mix(PAL.white, PAL.sand, .2)], ['rich', 'Rich', mix(PAL.gold, PAL.sand, 0.2), 1.8, PAL.gold]],
    grape: PAL.white, groundC: PAL.sand, bg: PAL.mint, count: '11 whites', leafC: [PAL.leaf, mix(PAL.leaf, PAL.mustard, .3), mix(PAL.leaf, PAL.gold, .45)], corner: 'bench', subs: ['zest · cold', 'blossom · perfume', 'round · creamy'] }); },
  '03'() { return familyScene(3, { fams: [['light', 'Light', mix(PAL.clay, '#ffffff', 0.55), 0.85, '#b6495a'], ['medium', 'Medium', mix(PAL.clay, '#ffffff', 0.25), 1.4, '#86304a'], ['bold', 'Bold', PAL.clay, 1.95, '#4a1d2c']],
    grape: PAL.red, groundC: mix(PAL.mauve, PAL.sand, 0.55), bg: mix(PAL.mauve, '#ffffff', .6), count: '14 reds', leafC: [PAL.leaf, mix(PAL.leaf, PAL.red, .25), mix(PAL.leaf, PAL.red, .45)], corner: 'barrel', subs: ['thin skin · bright', 'the flexible middle', 'thick skin · grip'] }); },
  '04'() { // Harvest & field gear
    const it = [ground(PAL.sage, 4, { tufts: 16 })], r = rng(44);
    // cover crop rows with flowers (right block)
    it.push(stripe(4.3, 0.2, 3.5, 3.4, mix(PAL.mustard, PAL.sage, .35), { rows: 5 }));
    let fl = ''; for (let i = 0; i < 70; i++) { const [px, py] = P(4.4 + r() * 3.3, 0.3 + r() * 3.2, 0); const c = [PAL.mustard, '#fff3d6', PAL.terra, mix(PAL.mauve, '#fff', .3)][i % 4]; fl += `<path d="M${pp(px, py)}v-${f(2 + r() * 2)}" stroke="${dark(PAL.sage, .35)}" stroke-width=".45"/><circle cx="${f(px)}" cy="${f(py - 2.4 - r() * 1.6)}" r="${f(.7 + r() * .4)}" fill="${c}" stroke="${LINE}" stroke-width=".25"/>`; }
    it.push({ d: -44, s: fl });
    // vine rows left block with pickers
    for (const y of [0.8, 2.3]) {
      it.push(stripe(0.2, y - 0.3, 3.8, 0.7, mix(PAL.soil, PAL.sage, .4)));
      for (const x of [0.4, 3.7]) it.push(box(x, y - 0.06, 0, 0.14, 0.14, 1.9, PAL.wood, { thin: true }));
      it.push(line3([0.45, y, 1.2], [3.75, y, 1.2], .5, dark(PAL.steel, .35)));
      for (const x of [1.0, 2.0, 3.0]) {
        it.push(when('ripe', vine(x, y, { cz: 1.35, grape: PAL.red }), true));
        it.push(when('early', vine(x, y, { cz: 1.35, grape: mix(PAL.sage, PAL.red, .25) })));
      }
    }
    it.push(worker(1.5, 1.5, PAL.clay, 'shears', { hat: PAL.sand }));
    it.push(worker(2.6, 3.0, PAL.teal, 'basket', { hat: PAL.mustard, delay: .4, flip: true }));
    // path with bins flowing to the trailer, then crush pad
    it.push(stripe(0.2, 3.75, 7.6, 0.7, mix(PAL.sand, PAL.soil, .35), { cols: 12 }));
    const binPk = `<g transform="translate(-3,-5)"><path d="M0,1h6l-.6,4h-4.8z" fill="${PAL.clay}" stroke="${LINE}" stroke-width=".5"/><circle cx="2" cy="1" r="1" fill="${PAL.red}"/><circle cx="4" cy=".8" r="1" fill="${PAL.red}"/></g>`;
    it.push(flow([[0.5, 4.1, 0], [4.2, 4.1, 0], [5.4, 4.1, 0], [5.4, 5.6, 0]], PAL.clay, { packets: 3, dur: 8, packet: binPk, d: -30 }));
    it.push(walk(worker(0.6, 4.25, PAL.mauve, 'basket', { cls: 'walker' }), [[0.6, 4.25, 0], [3.8, 4.25, 0], [3.8, 4.05, 0], [0.6, 4.05, 0]], 11, 3));
    // tractor + bin trailer
    const tx = 0.7, ty = 5.0;
    it.push(box(tx, ty, 0.35, 1.7, 0.95, 0.65, PAL.teal));
    it.push(box(tx, ty, 1.0, 0.8, 0.95, 0.75, light(PAL.teal, 0.3)));
    it.push(box(tx + 0.05, ty + 0.05, 1.75, 0.9, 0.85, 0.08, dark(PAL.teal, .2), { flat: true, thin: true }));
    it.push(box(tx + 1.4, ty + 0.25, 1.0, 0.12, 0.12, 0.6, LINE, { thin: true }));
    it.push(steam(tx + 1.46, ty + 0.31, 1.62, 3, '#e8e2d8'));
    const [hlx, hly] = P(tx + 1.7, ty + 0.75, 0.75);
    it.push({ d: 8.4, s: `<circle cx="${f(hlx)}" cy="${f(hly)}" r="5" fill="${PAL.mustard}" opacity=".25" class="glow"/><circle cx="${f(hlx)}" cy="${f(hly)}" r="1.3" fill="#fff6d0" stroke="${LINE}" stroke-width=".5"/>` });
    it.push(cyl(tx + 0.3, ty + 1.05, 0, 0.42, 0.22, '#3b332e', { noShadow: true }));
    it.push(cyl(tx + 1.45, ty + 1.05, 0, 0.3, 0.2, '#3b332e', { noShadow: true }));
    it.push(line3([tx - 0.05, ty + 0.5, 0.4], [tx - 0.45, ty + 0.5, 0.4], 1.1, LINE));
    it.push(box(tx - 0.55, ty + 1.6, 0.25, 1.9, 0.9, 0.12, PAL.wood, { thin: true, noShadow: true }));
    it.push(crate(tx - 0.45, ty + 1.68, 0.37, 0.55, PAL.clay)); it.push(crate(tx + 0.2, ty + 1.68, 0.37, 0.55, PAL.clay)); it.push(crate(tx + 0.85, ty + 1.68, 0.37, 0.55, PAL.clay));
    // crush pad: house with open door, receiving bin, sorting table
    it.push(house(5.6, 5.9, 2.1, 1.9, 1.2, 0.8, PAL.cream, PAL.clay, { chimney: [6.0, 6.3, 0.5] }));
    it.push(box(4.4, 5.3, 0, 0.9, 0.9, 0.7, PAL.steel, { planks: 2 }));
    it.push(box(4.45, 5.35, 0.7, 0.8, 0.8, 0.04, PAL.red, { flat: true, thin: true, noShadow: true }));
    it.push(box(4.3, 6.6, 0.75, 1.1, 0.5, 0.08, PAL.wood, { flat: true, thin: true }));
    for (const [x, y] of [[4.35, 6.62], [5.3, 6.62], [4.35, 7.0], [5.3, 7.0]]) it.push(box(x, y, 0, 0.06, 0.06, 0.75, LINE, { thin: true, noShadow: true }));
    it.push(worker(4.9, 7.5, PAL.teal, 'none', { apron: PAL.cream, delay: .3 }));
    it.push(hoseReel(7.5, 4.9)); it.push(bucket(7.0, 4.95));
    it.push(tree(7.3, 3.4, '#7fa37a', 2.4));
    // v4 density: beehives in the cover crop, crew shade + water cooler, stacked empty bins, catch tank
    for (const [x, y] of [[6.6, 0.5], [7.2, 0.7]]) { it.push(box(x, y, 0, 0.42, 0.42, 0.22, PAL.cream, { thin: true })); it.push(box(x, y, 0.22, 0.42, 0.42, 0.2, PAL.mustard, { thin: true, noShadow: true })); it.push(box(x - 0.03, y - 0.03, 0.42, 0.48, 0.48, 0.06, PAL.wood, { thin: true, noShadow: true, flat: true })); }
    const [bhx, bhy] = P(6.9, 0.4, 0.9);
    it.push({ d: 7.6, s: [0, 1, 2].map(i => `<circle class="blink" style="--delay:${i * .4}s" cx="${f(bhx + i * 4 - 4)}" cy="${f(bhy - (i % 2) * 3)}" r=".8" fill="${PAL.mustard}" stroke="${LINE}" stroke-width=".3"/>`).join('') });
    it.push(...tent(4.7, 2.45, 0.95, 0.85, 1.25, PAL.teal).map(q => Z('crewwater', q)));
    it.push(Z('crewwater', cyl(5.15, 2.85, 0, 0.22, 0.55, PAL.teal, { hoops: [0.6] })));
    it.push(Z('crewwater', box(4.8, 2.6, 0, 0.3, 0.3, 0.3, PAL.cream, { thin: true })));
    for (let k = 0; k < 3; k++) it.push(box(0.15, 3.05, k * 0.18, 0.5, 0.45, 0.17, PAL.clay, { thin: true, noShadow: k > 0 }));
    it.push(Z('crush', cyl(3.85, 5.75, 0, 0.34, 0.85, mix(PAL.water, PAL.steel, .45), { hoops: [0.4] })));
    it.push(optG('rinse', 'on', () => [
      flow([[4.3, 6.85, 0.02], [3.9, 6.5, 0.02], [3.85, 6.1, 0.02]], dark(PAL.water, .25), { packets: 3, dur: 3.5, pc: PAL.water, r: 1.1, d: 9.6 }),
      flow([[4.0, 5.55, 0.75], [4.5, 5.45, 0.75]], PAL.teal, { packets: 2, dur: 2.4, pc: PAL.mint, r: 1, d: 10.1 }),
      chip(3.85, 5.75, 1.1, 'reuse', PAL.mint)]));
    it.push(optG('rinse', 'off', () => chip(3.85, 5.75, 1.1, 'catch', PAL.cream), true));
    // dawn pick: indigo wash, stars, headlights + headlamps on
    let stars = ''; for (let i = 0; i < 18; i++) stars += `<circle class="blink" style="--delay:${f(r() * 1.5)}s" cx="${f(40 + r() * 160)}" cy="${f(6 + r() * 38)}" r="${f(.5 + r() * .5)}" fill="#fff8e0"/>`;
    const lampAt = (x, y, z, rr = 6) => { const [lx2, ly2] = P(x, y, z); return `<circle cx="${f(lx2)}" cy="${f(ly2)}" r="${rr}" fill="#ffe7a0" opacity=".42"/><circle cx="${f(lx2)}" cy="${f(ly2)}" r="1.1" fill="#fff6d0"/>`; };
    it.push(optG('dawn', 'on', () => ({ d: 1990, s: `<linearGradient id="${CUR.k}dw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2a4f" stop-opacity=".55"/><stop offset=".6" stop-color="#4b4a72" stop-opacity=".28"/><stop offset="1" stop-color="#f0a46a" stop-opacity=".22"/></linearGradient>` +
      `<rect x="-12" y="-4" width="264" height="198" fill="url(#${CUR.k}dw)" style="mix-blend-mode:multiply" pointer-events="none"/>` + stars +
      lampAt(0.7 + 1.7, 5.0 + 0.75, 0.75, 12) + lampAt(1.5, 1.5, 1.25) + lampAt(2.6, 3.0, 1.25) + lampAt(0.6, 4.25, 1.25) + lampAt(4.9, 7.5, 1.25) + lampAt(6.0, 6.3, 1.9, 9) })));
    it.push(birds(4, 4, 0, 24));
    return { bg: mix(PAL.mustard, '#ffffff', .6), it, state: 'ripe', opts: { dawn: 'off', rinse: 'off' }, labels: [
      tag([2.0, 0.8, 1.6], 'pick', 1, 'pick date', 'tap · early vs ripe', -10, -16),
      tag([1.5, 1.5, 1.1], 'crew', 2, 'pickers', 'whole clusters, small bins', -34, -10),
      tag([6.0, 1.6, 0.3], 'cover', 3, 'cover crop', 'flowers hold the soil', 18, -14),
      tag([1.0, 5.5, 1.8], 'tractor', 4, 'tractor', 'lights for dawn picks', -18, 30),
      tag([4.85, 5.75, 0.75], 'crush', 5, 'crush pad', 'sort, then destem', 30, -2),
      tag([3.6, 4.1, 0.1], 'bins', 6, 'bins on the path', 'fast · cool · gentle', -6, 40)] };
  },
  '05'() { // Wine making styles: five yards on top, cave level below
    const it = [ground(PAL.sand, 5, { H: 0.42, tufts: 6, tuft: mix(PAL.sage, LINE, .3) })], r = rng(55);
    const yard = (x, y, w, d, c) => it.push(stripe(x, y, w, d, c, { rows: 3, cols: 3 }));
    yard(0.25, 0.25, 3.5, 3.5, mix(PAL.mint, '#ffffff', .2)); yard(4.25, 0.25, 3.5, 3.5, mix(PAL.terra, '#ffffff', .62));
    yard(0.25, 4.25, 3.5, 3.5, mix(PAL.clay, '#ffffff', .62)); yard(4.25, 4.25, 3.5, 3.5, mix(PAL.mauve, '#ffffff', .55));
    // water channel cross + flow
    it.push(stripe(3.8, 0.2, 0.4, 7.6, mix(PAL.water, '#ffffff', .25))); it.push(stripe(0.2, 3.8, 7.6, 0.4, mix(PAL.water, '#ffffff', .25)));
    it.push(flow([[4.0, 0.3, 0], [4.0, 7.7, 0]], dark(PAL.water, .2), { packets: 4, dur: 7, pc: PAL.water, r: 1.1, d: -35 }));
    it.push(flow([[0.3, 4.0, 0], [7.7, 4.0, 0]], dark(PAL.water, .2), { packets: 4, dur: 7, pc: PAL.water, r: 1.1, d: -35 }));
    it.push(lamp(4.25, 4.25));
    // rinse loop: channel water caught, filtered, and sent back to the hoses (toolbar switch)
    it.push(Z('water', cyl(7.55, 3.6, 0, 0.32, 0.9, mix(PAL.water, PAL.steel, .4), { hoops: [0.5] })));
    it.push(optG('loop', 'on', () => [flow([[7.7, 4.0, 0.02], [7.55, 3.95, 0.3]], dark(PAL.water, .25), { packets: 2, dur: 2, pc: PAL.water, r: 1, d: 11.3 }),
      flow([[7.6, 3.25, 0.05], [7.75, 0.3, 0.05], [4.3, 0.28, 0.05]], PAL.teal, { packets: 4, dur: 6, pc: PAL.mint, r: 1.1, d: -20 }), chip(7.55, 3.6, 1.2, 'reused', PAL.mint)]));
    it.push(optG('loop', 'off', () => chip(7.55, 3.6, 1.2, 'to drain', PAL.cream), true));
    // WHITE (back): basket press, juice tray, cool steel tank
    const W = [];
    W.push(box(0.7, 1.0, 0, 1.3, 1.3, 0.2, PAL.steel, { thin: true }));
    W.push(cyl(1.35, 1.65, 0.2, 0.5, 0.8, light(PAL.wood, .2), { staves: true, hoops: [0.15, 0.85], noShadow: true }));
    W.push(box(1.28, 1.58, 1.0, 0.14, 0.14, 0.8, dark(PAL.steel, .3), { thin: true, noShadow: true }));
    W.push(line3([0.85, 1.65, 1.6], [1.85, 1.65, 1.6], 1.2, PAL.wood));
    W.push(drop(1.95, 2.3, 0.2, 0)); W.push(bucket(2.15, 2.45, 0, PAL.steel, PAL.white));
    W.push(cyl(2.9, 1.0, 0, 0.45, 1.7, PAL.steel, { hoops: [0.3, 0.7] }));
    W.push(chip(2.9, 1.0, 1.2, '12°C', PAL.mint));
    W.push(worker(1.0, 2.9, PAL.teal, 'none', { apron: PAL.cream }));
    W.push(cyl(2.2, 0.55, 0, 0.3, 1.15, PAL.steel, { hoops: [0.5] }));
    for (let k = 0; k < 2; k++) W.push(box(0.4, 0.4, k * 0.3, 0.6, 0.5, 0.28, PAL.mint, { thin: true, noShadow: k > 0 }));
    { const [gx, gy] = P(0.7, 0.65, 0.6); W.push({ d: 1.3, s: [0, 1, 2, 3].map(i => `<circle cx="${f(gx - 2 + i * 1.4)}" cy="${f(gy - (i % 2))}" r="1.1" fill="${PAL.white}" stroke="${LINE}" stroke-width=".3"/>`).join('') }); }
    W.push(optG('style', 'white', () => { const [mx, my] = P(3.2, 2.9, 0); return [
      { d: 6.1, s: `<path d="M${pp(mx - 6, my)}q6,-6.5 12,0z" fill="${mix(PAL.soil, PAL.white, .3)}" stroke="${LINE}" stroke-width=".5"/><circle cx="${f(mx - 2)}" cy="${f(my - 2)}" r=".7" fill="${dark(PAL.white, .3)}"/><circle cx="${f(mx + 1.5)}" cy="${f(my - 2.6)}" r=".7" fill="${dark(PAL.white, .3)}"/>` },
      drop(1.95, 2.3, 0.2, 0.6), drop(1.95, 2.3, 0.2, 1.2), chip(3.2, 2.9, 0.6, 'skins out first', PAL.mint),
      flow([[2.15, 2.4, 0.3], [2.9, 1.6, 0.6]], dark(PAL.white, .3), { packets: 2, dur: 2.6, pc: PAL.white, r: 1, d: 3.6 })]; }));
    it.push(...W.map(i => Z('white', i)));
    // ROSÉ (right): pink sight-glass tanks + skin-contact timer
    const R = [];
    for (const [x, y, h] of [[5.0, 1.0, 1.6], [6.3, 0.9, 1.9], [6.8, 2.3, 1.4]]) {
      R.push(cyl(x, y, 0, 0.45, h, PAL.steel, { hoops: [0.5] }));
      const [gx, gy] = P(x, y + 0.45, h * 0.5);
      R.push({ d: x + y + 0.5, s: `<rect x="${f(gx - .8)}" y="${f(gy - 6)}" width="1.6" height="9" rx=".8" fill="${mix(PAL.terra, '#ffffff', .45)}" stroke="${LINE}" stroke-width=".45"/>` });
    }
    R.push(chip(6.9, 3.25, 0.25, '4 hrs', mix(PAL.terra, '#ffffff', .5)));
    R.push(worker(5.3, 3.2, PAL.mauve, 'clip', { delay: .5 }));
    R.push(box(7.0, 0.45, 0.12, 0.55, 0.35, 0.3, PAL.teal, { thin: true, noShadow: true }));
    R.push(cyl(7.1, 0.85, 0, 0.12, 0.12, '#3b332e', { noShadow: true, lid: false })); R.push(cyl(7.45, 0.85, 0, 0.12, 0.12, '#3b332e', { noShadow: true, lid: false }));
    R.push(hoseLine([[7.0, 0.7, 0.2], [6.2, 1.6, 0], [5.4, 1.5, 0]], PAL.terra));
    R.push(optG('style', 'rose', () => [chip(5.1, 2.6, 1.35, 'pink · press off', mix(PAL.terra, '#ffffff', .3)), bucket(5.9, 2.9, 0, PAL.steel, mix(PAL.terra, '#ffffff', .25)), drop(6.3, 1.4, 0.3, 0.2),
      ...[[5.0, 1.0, 1.6], [6.3, 0.9, 1.9], [6.8, 2.3, 1.4]].map(([x, y, h]) => { const [gx, gy] = P(x, y + 0.45, h * 0.5); return { d: x + y + 0.55, s: `<rect x="${f(gx - .55)}" y="${f(gy - 2.5)}" width="1.1" height="5.4" rx=".55" fill="${PAL.terra}"/>` }; })]));
    it.push(...R.map(i => Z('rose', i)));
    // RED (left): open-top fermenters, catwalk, punch-down
    const Rd = [];
    for (const [x, y] of [[1.0, 5.2], [2.4, 5.0]]) {
      Rd.push(cyl(x, y, 0, 0.55, 1.15, light(PAL.wood, .1), { staves: true, hoops: [0.2, 0.8], lid: false }));
      const [mx, my] = P(x, y, 1.08);
      Rd.push({ d: x + y + 0.1, s: `<ellipse cx="${f(mx)}" cy="${f(my)}" rx="${f(.55 * U * 1.2247 * .86)}" ry="${f(.55 * U * .7071 * .86)}" fill="#4a1d2c"/><circle cx="${f(mx - 2)}" cy="${f(my - .4)}" r="1" fill="#7a3048"/><circle cx="${f(mx + 2.2)}" cy="${f(my + .5)}" r=".9" fill="#7a3048"/>` });
    }
    Rd.push(steam(2.4, 5.0, 1.2, 2, '#f1e3e3'));
    Rd.push(box(1.0, 6.0, 0, 1.6, 0.5, 0.75, PAL.wood, { planks: 2 }));
    Rd.push(worker(1.6, 6.15, PAL.clay, 'paddle', { z: 0.75, delay: .2 }));
    Rd.push(ladder(2.75, 6.5, 0, 0.75, .2));
    Rd.push(cases(0.5, 7.0, 0, 2, 1, 2, PAL.clay, .4)[0]);
    Rd.push(cyl(3.05, 6.85, 0, 0.38, 0.6, light(PAL.wood, .15), { staves: true, hoops: [0.2, 0.8] }));
    Rd.push(box(2.98, 6.78, 0.6, 0.14, 0.14, 0.55, dark(PAL.steel, .3), { thin: true, noShadow: true }));
    Rd.push(hoseLine([[0.4, 4.5, 0], [1.6, 4.6, 0], [2.0, 5.6, 0]], PAL.clay));
    Rd.push(optG('style', 'red', () => { const out = [chip(1.7, 4.6, 1.55, 'days on skins', mix(PAL.clay, '#ffffff', .5)), steam(1.0, 5.2, 1.2, 3, '#c78b9c'), chip(3.45, 7.1, 0.75, 'press after', PAL.cream)];
      const [mx, my] = P(3.05, 6.85, 0.62); out.push({ d: 9.95, s: `<ellipse cx="${f(mx)}" cy="${f(my)}" rx="4.6" ry="2.6" fill="#4a1d2c"/>` }); return out; }));
    it.push(...Rd.map(i => Z('red', i)));
    // CHAMPAGNE (front): tirage table + crown caps, stair hatch to the cave
    const C = [];
    C.push(box(4.8, 4.8, 0, 1.6, 0.6, 0.7, PAL.wood, { planks: 2 }));
    for (let i = 0; i < 5; i++) C.push(bottle(4.95 + i * 0.3, 5.1, 0.7, PAL.teal, 0.38));
    C.push(worker(5.6, 5.85, PAL.teal, 'bottle', { tc: PAL.teal }));
    C.push(box(6.5, 6.4, 0, 1.0, 1.1, 0.05, dark(PAL.mauve, .45), { flat: true, thin: true, noShadow: true }));
    for (let i = 0; i < 4; i++) C.push({ d: 14, s: seg3([6.55, 6.5 + i * 0.25, 0.06], [7.45, 6.5 + i * 0.25, 0.06], .6, light(PAL.mauve, .4)) });
    C.push(chip(7.0, 6.9, 0.5, 'down to cave', PAL.cream));
    C.push(...cases(4.55, 6.55, 0, 2, 2, 2, mix(PAL.mauve, '#ffffff', .4), .4));
    C.push(box(6.6, 4.5, 0, 0.9, 0.7, 0.5, PAL.steel, { planks: 2 }));
    C.push(optG('style', 'champ', () => { const out = []; for (let i = 0; i < 5; i++) { const [cx2, cy2] = P(4.95 + i * 0.3, 5.1, 1.55); out.push({ d: 10.5 + i * .01, s: `<rect x="${f(cx2 - 1.1)}" y="${f(cy2 - 1.2)}" width="2.2" height="1.2" fill="${PAL.mustard}" stroke="${LINE}" stroke-width=".3"/>` }); }
      out.push(chip(7.05, 4.85, 0.75, 'cap · rest on lees', PAL.cream));
      out.push(mover(crate(6.6, 6.5, 0.06, 0.4, mix(PAL.mauve, '#ffffff', .3)), [6.6, 6.5, 0.06], [7.1, 7.0, -0.6], 3.2, 0, ''));
      return out; }));
    it.push(...C.map(i => Z('champ', i)));
    it.push(birds(2, 5, 0, 16));
    // CAVE (under): riddling racks + solera; cool, lamp-lit
    const cv = cave({ top: -0.42, h: 2.3, wall: mix(PAL.sand, PAL.mauve, .3) }), zf = cv.zf, und = cv.it;
    // riddling racks along the right opening
    for (const y of [1.2, 3.0, 4.8]) {
      const q = [[6.6, y, zf], [6.6, y + 1.3, zf], [7.3, y + 1.3, zf + 1.7], [7.3, y, zf + 1.7]];
      let s = fill(q, PAL.wood) + fill(q, hatch(), 'opacity=".4"') + ink(q, .7);
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const [hx, hy] = P(6.75 + a * 0.13, y + 0.18 + b * 0.3, zf + 0.35 + a * 0.32); s += `<circle cx="${f(hx)}" cy="${f(hy)}" r="1.1" fill="${dark(PAL.teal, .35)}" stroke="${LINE}" stroke-width=".3"/>`; }
      und.push(Z('champ', { d: 6.9 + y, s }));
    }
    und.push(Z('champ', worker(7.6, 2.6, PAL.mauve, 'none', { z: zf, delay: .8, flip: true })));
    // solera: three tiers of barrels along the front opening
    const S = [];
    for (let t = 0; t < 3; t++) for (let i = 0; i < 4 - t; i++) S.push(hbarrel(0.9 + i * 1.0 + t * 0.5, 6.2, zf + t * 0.78, 0.38, 1.05, t === 2 ? light(PAL.wood, .12) : PAL.wood, { chalk: true, noShadow: true }));
    S.push(cyl(5.6, 7.1, zf, 0.25, 0.6, mix(PAL.sand, '#ffffff', .2), { noShadow: true }));
    S.push(chip(5.6, 7.1, zf + 1.0, 'grape spirit', PAL.sand));
    S.push(walk(worker(0.6, 7.6, PAL.clay, 'thief', { z: zf, cls: 'walker' }), [[0.6, 7.6, zf], [5.0, 7.6, zf]], 12));
    S.push(optG('style', 'fort', () => [flow([[5.6, 7.1, zf + 0.6], [5.1, 7.0, zf + 1.3], [3.9, 6.75, zf + 1.6]], PAL.mustard, { packets: 3, dur: 3, pc: PAL.gold, r: 1.1, d: 14.5 }), chip(5.6, 7.1, zf + 1.65, 'early = sweet', PAL.sand)]));
    S.push(box(5.2, 7.4, zf, 0.6, 0.4, 0.5, PAL.wood, { planks: 2, noShadow: true }));
    und.push(...S.map(i => Z('fort', i)));
    // bottles resting on their lees (sur lattes stack) + chalk board
    { const [sx0, sy0] = P(3.0, 1.4, zf); let st = ''; for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 7 - rr; k++) st += `<circle cx="${f(sx0 + k * 3.4 + rr * 1.7)}" cy="${f(sy0 - 2 - rr * 2.8)}" r="1.4" fill="${dark(PAL.teal, .3)}" stroke="${LINE}" stroke-width=".35"/>`; und.push(Z('champ', { d: 5, s: st })); }
    und.push(Z('champ', optG('style', 'champ', () => chip(3.6, 1.4, zf + 1.4, 'bottles on lees', PAL.cream))));
    und.push({ d: 1, s: fill([[0.02, 2.4, zf + 0.8], [0.02, 3.6, zf + 0.8], [0.02, 3.6, zf + 1.6], [0.02, 2.4, zf + 1.6]], '#2f3a36', `stroke="${PAL.wood}" stroke-width="1"`) + seg3([0.02, 2.6, zf + 1.35], [0.02, 3.3, zf + 1.35], .5, '#fff') + seg3([0.02, 2.6, zf + 1.1], [0.02, 3.1, zf + 1.1], .5, '#fff') });
    const [lx, ly] = P(3.5, 0.05, zf + 1.9);
    und.push({ d: -250, s: `<circle cx="${f(lx)}" cy="${f(ly)}" r="10" fill="${PAL.mustard}" opacity=".18" class="glow"/><circle cx="${f(lx)}" cy="${f(ly)}" r="1.6" fill="#fff3c4" stroke="${LINE}" stroke-width=".5"/>` });
    return { bg: mix(PAL.terra, '#ffffff', .72), it, opts: { style: 'none', loop: 'off' }, under: { it: und, open: 20 }, labels: [
      tag([1.35, 1.65, 1.6], 'white', 1, 'White', 'press first, juice only', -14, -16),
      tag([6.3, 0.9, 1.9], 'rose', 2, 'Rosé', 'hours on skins', 14, -14),
      tag([1.0, 5.2, 1.15], 'red', 3, 'Red', 'ferment on skins', -30, -6),
      tag([5.6, 4.8, 0.9], 'champ', 4, 'Champagne', 'second ferment in bottle', 26, -20),
      tag([6.6, 4.0, 0], 'water', 5, 'water channel', 'rinse · reuse', 30, 6),
    ], ulabels: [
      tag([7.0, 4.2, zf + 1.2], 'riddle', 6, 'riddling racks', 'turn · tilt · settle', 22, 4),
      tag([2.0, 7.25, zf + 1.4], 'fort', 7, 'Fortified', 'solera + spirit', -26, 6),
      tag([7.8, 7.8, zf + 0.4], 'cellar', 8, 'cave level', 'tap · unfold floors', 18, 16)] };
  },
  '06'() { // Aging & vessel patterns: steel → clay → oak, reductive to oxidative
    const it = [ground(mix(PAL.sand, PAL.mauve, 0.15), 6, { tufts: 4 })], r = rng(66);
    const lanes = [[0.25, PAL.mint], [2.85, mix(PAL.terra, '#ffffff', .62)], [5.45, PAL.sand]];
    lanes.forEach(([x, c]) => it.push(stripe(x, 0.25, 2.3, 6.2, c, { rows: 7 })));
    it.push(stripe(0.25, 6.6, 7.5, 1.15, mix(PAL.cream, PAL.sand, .3), { cols: 8 }));
    // STEEL
    const S = [];
    for (const [x, y, rr, h] of [[1.1, 1.3, 0.62, 2.3], [1.5, 3.4, 0.55, 1.9], [1.1, 5.3, 0.5, 1.6]]) {
      S.push(cyl(x, y, 0, rr, h, PAL.steel, { hoops: [0.55, 0.75] }));
      const [gx, gy] = P(x + rr * 0.7, y + rr * 0.7, 0.2), [, gt] = P(x, y, h * 0.85);
      S.push({ d: x + y + rr + 0.1, s: `<rect x="${f(gx - .7)}" y="${f(gt)}" width="1.4" height="${f(gy - gt)}" rx=".7" fill="rgba(251,245,234,.9)" stroke="${LINE}" stroke-width=".4"/><rect x="${f(gx - .5)}" y="${f(gt + (gy - gt) * 0.12)}" width="1" height="${f((gy - gt) * 0.86)}" fill="${PAL.white}"/><circle cx="${f(gx + 2.2)}" cy="${f(gy - 1)}" r="1" fill="${PAL.clay}" stroke="${LINE}" stroke-width=".35"/>` });
    }
    S.push(chip(1.1, 1.3, 2.55, 'topped up', PAL.mint));
    S.push(worker(2.2, 2.4, PAL.teal, 'clip', { delay: .3 }));
    S.push(flow([[1.6, 3.95, 0.05], [2.1, 4.6, 0.05], [1.5, 5.8, 0.05]], dark(PAL.teal, .2), { w: 1.2, d: -30 }));
    it.push(...S.map(i => Z('steel', i)));
    // CLAY amphorae in a gravel bed
    const C = [];
    let gr = ''; for (let i = 0; i < 50; i++) { const [px, py] = P(3.0 + r() * 2.0, 1.0 + r() * 4.6, 0); gr += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(.3 + r() * .4)}" fill="${dark(PAL.sand, .3)}"/>`; }
    C.push({ d: -42, s: gr });
    for (const [x, y, k] of [[3.4, 1.3, 1], [4.6, 1.8, .9], [3.6, 3.0, 1.05], [4.7, 3.6, .95], [3.7, 4.9, .9]]) C.push(amphora(x, y, PAL.terra, k));
    C.push(worker(4.3, 5.6, PAL.mauve, 'none', { delay: .7 }));
    it.push(...C.map(i => Z('clay', i)));
    // OAK racks, two tiers
    const O = [];
    for (const y of [1.0, 3.4]) {
      O.push(box(5.75, y, 0, 1.9, 1.4, 0.12, dark(PAL.wood, .25), { thin: true }));
      for (const x of [6.15, 7.15]) O.push(hbarrel(x, y + 0.1, 0.12, 0.42, 1.2, PAL.wood, { chalk: true, noShadow: true }));
      O.push(hbarrel(6.65, y + 0.1, 0.96, 0.42, 1.2, light(PAL.wood, .1), { chalk: true, noShadow: true }));
    }
    O.push(glass(6.3, 2.5, 0.95, PAL.red));
    O.push(worker(7.4, 5.4, PAL.clay, 'thief', { flip: true }));
    O.push(cyl(6.3, 5.6, 0, 0.22, 0.55, PAL.steel, { lid: false }));
    O.push(chip(6.3, 5.6, 0.8, 'top-up', PAL.sand));
    it.push(...O.map(i => Z('oak', i)));
    // LEES table (front middle)
    const L = [];
    L.push(box(2.6, 6.8, 0, 1.9, 0.7, 0.7, PAL.wood, { planks: 2 }));
    L.push(cyl(3.0, 7.15, 0.7, 0.24, 0.6, 'rgba(240,236,224,1)', { noShadow: true }));
    const [jx, jy] = P(3.0, 7.15, 0.7);
    L.push({ d: 10.2, s: `<rect x="${f(jx - 3.4)}" y="${f(jy - 2.6)}" width="6.8" height="2.4" fill="${mix(PAL.sand, PAL.wood, .3)}" opacity=".9"/><rect x="${f(jx - 3.4)}" y="${f(jy - 7.6)}" width="6.8" height="5" fill="${PAL.white}" opacity=".55"/>` });
    for (let i = 0; i < 4; i++) L.push(bottle(3.6 + i * 0.22, 7.1, 0.7, PAL.teal, 0.4));
    L.push(worker(4.0, 7.75, PAL.teal, 'glass', { tc: PAL.white, delay: .9 }));
    it.push(...L.map(i => Z('lees', i)));
    // v4 density: floor drain + hose, cellar hygrometer, humidifier mist, empty-glass pallet, mop bucket
    it.push({ d: -39, s: fill([[1.75, 4.45, 0.01], [2.2, 4.45, 0.01], [2.2, 4.8, 0.01], [1.75, 4.8, 0.01]], dark(PAL.steel, .45), `stroke="${LINE}" stroke-width=".5"`) + [0, 1, 2].map(i => seg3([1.8, 4.53 + i * 0.1, 0.02], [2.15, 4.53 + i * 0.1, 0.02], .4, '#ddd')).join('') });
    it.push(hoseLine([[0.35, 6.3, 0], [1.2, 6.15, 0], [1.9, 4.7, 0]], PAL.teal));
    it.push(box(2.66, 0.32, 0, 0.08, 0.08, 1.3, PAL.wood, { thin: true }));
    it.push(thermo(2.7, 0.36, 1.3, 0.72, PAL.teal)); it.push(chip(2.7, 0.36, 1.95, '75% rh', PAL.mint));
    it.push(Z('oak', cyl(5.75, 6.0, 0, 0.2, 0.42, PAL.cream, { hoops: [0.5] }))); it.push(Z('oak', steam(5.75, 6.0, 0.5, 3, '#f4f8f6')));
    it.push(pallet(0.45, 6.85, 1.3, 0.8));
    { const [px0, py0] = P(0.55, 7.55, 0.16); let gl = ''; for (let rr = 0; rr < 3; rr++) for (let k = 0; k < 6 - rr; k++) gl += `<ellipse cx="${f(px0 + 2.2 + k * 2.6 + rr * 1.3)}" cy="${f(py0 - 2 - rr * 2.2 - k * 1.3)}" rx="1.3" ry="1.1" fill="${mix(PAL.teal, '#ffffff', .25)}" stroke="${LINE}" stroke-width=".35"/>`; it.push({ d: 8.6, s: gl }); }
    it.push(bucket(5.25, 7.35, 0, PAL.mustard, PAL.water)); it.push(line3([5.25, 7.35, 0.3], [5.05, 7.1, 1.3], .9, PAL.wood));
    // one year on (toolbar): tallies, top-up chips, sealed amphorae, thicker lees, a cobweb
    it.push(optG('age', 'old', () => { const out = [];
      for (const y of [1.0, 3.4]) for (const x of [6.15, 7.15]) { const [tx, ty] = P(x, y + 1.3, 0.54); out.push({ d: x + y + 1.95, s: `<text x="${f(tx)}" y="${f(ty + 1)}" text-anchor="middle" class="chip" fill="#fff">IIII I</text>` }); }
      out.push(chip(6.65, 3.25, 2.05, 'top up · it evaporates', PAL.sand));
      for (const [x, y, k] of [[3.4, 1.3, 1], [4.6, 1.8, .9], [3.6, 3.0, 1.05], [4.7, 3.6, .95], [3.7, 4.9, .9]]) { const [bx, by] = P(x, y, 0); out.push({ d: x + y + 0.25, s: `<ellipse cx="${f(bx)}" cy="${f(by - 14 * k - .4)}" rx="${f(2.6 * k)}" ry="${f(1.1 * k)}" fill="${dark(PAL.terra, .25)}" stroke="${LINE}" stroke-width=".5"/>` }); }
      out.push(chip(4.1, 2.4, 1.45, 'sealed · 8 months', PAL.cream));
      out.push(chip(1.5, 3.4, 2.3, 'still fresh', PAL.mint));
      const [jx2, jy2] = P(3.0, 7.15, 0.7); out.push({ d: 10.3, s: `<rect x="${f(jx2 - 3.4)}" y="${f(jy2 - 4.4)}" width="6.8" height="1.9" fill="${mix(PAL.sand, PAL.wood, .3)}" opacity=".95"/>` });
      return out; }));
    it.push(optG('age', 'young', () => chip(6.65, 3.25, 2.05, 'new oak · toasty', PAL.sand), true));
    it.push(flow([[0.6, 6.4, 0], [7.5, 6.4, 0]], PAL.clay, { packets: 4, dur: 9, d: -30, packet: `<circle r="1.6" fill="#fff" stroke="${PAL.teal}" stroke-width=".5"/><text y="1" text-anchor="middle" class="chip" fill="${PAL.teal}">O₂</text>` }));
    it.push(birds(2, 6, 0, 14));
    return { bg: mix(PAL.mauve, '#ffffff', .62), it, opts: { age: 'young' }, labels: [
      tag([1.1, 1.3, 2.3], 'steel', 1, 'Steel', 'sealed · fresh', -14, -14),
      tag([3.4, 1.3, 1.0], 'clay', 2, 'Clay', 'breathes, no wood', 6, -36),
      tag([6.65, 1.1, 1.8], 'oak', 3, 'Oak', 'slow breath, spice', 8, -26),
      tag([7.4, 5.4, 1.4], 'thief', 4, 'wine thief', 'taste before you choose', 20, 10),
      tag([3.0, 7.15, 1.2], 'lees', 5, 'lees jar', 'yeast = cream', -28, 14),
      tag([4.6, 6.4, 0], 'scale', 6, 'reductive → oxidative', 'tap a lane to focus', 10, 40)] };
  },
  '07'() { // Bottle to shelf: filler → closure → label → case → pallet → door
    const it = [ground(PAL.mint, 7, { tuft: mix(PAL.leaf, LINE, .2), tufts: 8 })];
    it.push(stripe(0.2, 4.6, 5.4, 3.2, mix(PAL.steel, PAL.mint, .5), { rows: 4, cols: 6 }));
    // conveyor
    it.push(box(0.4, 3.0, 0, 5.2, 1.0, 0.7, PAL.mauve));
    it.push({ d: 3.95, s: fill([[0.45, 3.1, 0.71], [5.55, 3.1, 0.71], [5.55, 3.9, 0.71], [0.45, 3.9, 0.71]], dark(PAL.mauve, .45)) + Array.from({ length: 12 }, (_, i) => seg3([0.6 + i * 0.42, 3.1, 0.71], [0.6 + i * 0.42, 3.9, 0.71], .5, 'rgba(255,255,255,.3)')).join('') });
    for (const x of [0.6, 2.4, 4.2, 5.4]) it.push(box(x, 3.9, 0, 0.1, 0.1, 0.7, LINE, { thin: true, noShadow: true }));
    // tank + pipe
    it.push(cyl(1.1, 1.2, 0, 0.8, 2.2, PAL.steel, { hoops: [0.3, 0.7] }));
    it.push(chip(1.1, 1.2, 1.6, 'filtered', PAL.mint));
    it.push(line3([1.1, 1.9, 0.9], [1.1, 3.2, 1.6], 1.4, dark(PAL.steel, .3)));
    // filler carousel
    it.push(cyl(1.2, 3.5, 0.71, 0.45, 0.9, PAL.steel, { noShadow: true, hoops: [0.7] }));
    const [cx0, cy0] = P(1.2, 3.5, 1.61);
    it.push({ d: 4.75, s: `<g>` + Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return `<circle class="blink" style="--delay:${(i * 0.25).toFixed(2)}s" cx="${f(cx0 + Math.cos(a) * 5.4)}" cy="${f(cy0 + Math.sin(a) * 3.1)}" r="1" fill="${PAL.mustard}" stroke="${LINE}" stroke-width=".3"/>`; }).join('') + `</g>` });
    // closure station (gantry + plunger)
    it.push(box(2.4, 2.95, 0.71, 0.12, 0.12, 1.3, dark(PAL.steel, .2), { thin: true, noShadow: true }));
    it.push(box(2.4, 3.9, 0.71, 0.12, 0.12, 1.3, dark(PAL.steel, .2), { thin: true, noShadow: true }));
    it.push(box(2.35, 2.95, 2.0, 0.24, 1.1, 0.3, PAL.teal, { thin: true, noShadow: true }));
    const [kx, ky] = P(2.47, 3.5, 2.0);
    it.push({ d: 6.1, s: `<g class="press"><rect x="${f(kx - 1)}" y="${f(ky)}" width="2" height="5" fill="${PAL.steel}" stroke="${LINE}" stroke-width=".4"/></g>` });
    it.push(when('cork', chip(2.55, 4.15, 1.45, 'cork', PAL.sand), true));
    it.push(when('screw', chip(2.55, 4.15, 1.45, 'screwcap', PAL.steel)));
    // v4 density: empty glass in, QC light box, label rolls, stretch wrap on the finished stack
    it.push(Z('filler', pallet(2.35, 0.35, 1.25, 1.05)));
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) it.push(Z('filler', bottle(2.6 + a * 0.38, 0.6 + b * 0.33, 0.16, mix(PAL.teal, '#ffffff', .35), 0.36)));
    it.push(Z('filler', chip(2.95, 0.9, 1.05, 'empty glass in', PAL.cream)));
    it.push(box(2.55, 1.75, 0, 0.95, 0.5, 0.72, PAL.wood, { planks: 2 }));
    it.push(box(2.65, 1.8, 0.72, 0.4, 0.34, 0.4, '#fff6d8', { thin: true, noShadow: true }));
    { const [qx, qy] = P(2.85, 1.97, 0.95); it.push({ d: 4.6, s: `<circle class="glow" cx="${f(qx)}" cy="${f(qy)}" r="6" fill="#fff3c4" opacity=".3"/>` }); }
    it.push(bottle(3.3, 2.05, 0.72, PAL.red, 0.42));
    it.push(worker(3.25, 2.6, PAL.mauve, 'clip', { delay: .9 }));
    it.push(Z('label', group(4.9, [box(3.85, 2.05, 1.4, 0.55, 0.3, 0.06, PAL.wood, { thin: true, noShadow: true, flat: true }), cyl(3.98, 2.2, 1.46, 0.12, 0.18, '#fff', { noShadow: true }), cyl(4.27, 2.2, 1.46, 0.12, 0.18, PAL.cream, { noShadow: true })])));
    // labeler
    it.push(box(3.7, 2.4, 0, 0.8, 0.6, 1.4, PAL.cream, { planks: 2 }));
    const [rx, ry] = P(4.1, 3.0, 1.0);
    it.push({ d: 6.9, s: `<g class="spin" style="transform-origin:${f(rx)}px ${f(ry)}px"><circle cx="${f(rx)}" cy="${f(ry)}" r="3.4" fill="#fff" stroke="${LINE}" stroke-width=".6"/><path d="M${pp(rx - 3.4, ry)}h6.8M${pp(rx, ry - 3.4)}v6.8" stroke="${PAL.clay}" stroke-width=".6"/></g>` });
    // bottles riding the line (two closure states)
    for (const [g, k] of [['standard', 0.8], ['light', 0.62]]) {
      const movers = [];
      for (let i = 0; i < 5; i++) {
        const b = bottle(0.6, 3.5, 0.7, [PAL.teal, PAL.clay, PAL.teal, mix(PAL.terra, '#fff', .3), PAL.red][i], k);
        movers.push({ ...mover(b, [0.6, 3.5, 0.7], [5.4, 3.5, 0.7], 7.5, i * 1.5), d: 7.0 });
      }
      it.push(optG('glass', g, () => movers, g === 'standard', 7.0));
    }
    it.push(worker(3.3, 4.5, PAL.teal, 'none', { delay: .2 }));
    it.push(worker(5.6, 2.6, PAL.clay, 'case', { flip: true, delay: .5 }));
    // pallet → jack → shop door
    const jack = group(6, [pallet(3.8, 5.6, 1.3, 1.0), ...cases(3.85, 5.65, 0.16, 3, 2, 2, PAL.sand, .42), worker(3.5, 6.2, PAL.mauve, 'none', { cls: 'walker' })]);
    it.push(noShadow(() => walk(jack, [[3.6, 5.6, 0], [3.6, 5.6, 0], [4.6, 5.6, 0], [4.6, 5.6, 0]], 9)));
    it.push(...cases(0.6, 5.4, 0, 3, 2, 3, PAL.sand, .42));
    it.push({ d: 7.2, s: fill([[0.58, 6.26, 0], [1.88, 6.26, 0], [1.88, 6.26, 0.98], [0.58, 6.26, 0.98]], 'rgba(255,255,255,.35)', `stroke="rgba(255,255,255,.8)" stroke-width=".5"`) + fill([[1.88, 5.38, 0], [1.88, 6.26, 0], [1.88, 6.26, 0.98], [1.88, 5.38, 0.98]], 'rgba(255,255,255,.25)', `stroke="rgba(255,255,255,.8)" stroke-width=".5"`) });
    it.push(optG('glass', 'standard', () => chip(1.2, 6.2, 1.5, 'standard glass', PAL.cream), true));
    it.push(optG('glass', 'light', () => chip(1.2, 6.2, 1.5, 'light glass · less carbon', PAL.mint)));
    // truck at the shop door: closed with cases waiting on the dock, or cut away and loaded (toolbar)
    it.push(optG('load', 'dock', () => [box(5.9, 0.6, 0.35, 1.7, 2.8, 1.6, PAL.cream, { noShadow: true }),
      { d: 6.9, s: fill([[7.6, 0.9, 0.9], [7.6, 3.1, 0.9], [7.6, 3.1, 1.45], [7.6, 0.9, 1.45]], PAL.clay) }], true));
    it.push(optG('load', 'dock', () => [pallet(4.65, 4.35, 1.1, 0.9), ...cases(4.7, 4.4, 0.16, 2, 2, 2, PAL.sand, .42), chip(5.2, 4.8, 1.15, 'waiting on the dock', PAL.cream)], true));
    it.push(optG('load', 'truck', () => [box(5.9, 0.6, 0.35, 1.7, 2.8, 0.1, dark(PAL.cream, .1), { noShadow: true, thin: true }),
      box(5.9, 0.6, 0.45, 0.08, 2.8, 1.5, dark(PAL.cream, .18), { noShadow: true, thin: true }), box(5.9, 0.6, 0.45, 1.7, 0.08, 1.5, dark(PAL.cream, .12), { noShadow: true, thin: true }),
      ...cases(6.05, 0.75, 0.45, 3, 5, 3, PAL.sand, .45), chip(6.75, 2.0, 2.05, 'loaded · cool · shaded', PAL.mint)]));
    it.push(box(5.9, 3.4, 0.35, 1.7, 1.0, 1.1, PAL.clay, { noShadow: true }));
    it.push({ d: 8.0, s: fill([[7.6, 3.55, 0.95], [7.6, 4.25, 0.95], [7.6, 4.25, 1.35], [7.6, 3.55, 1.35]], mix(PAL.water, '#fff', .3), `stroke="${LINE}" stroke-width=".55"`) });
    castShadow(rectFoot(5.9, 0.6, 1.7, 3.8), 1.8);
    it.push(cyl(7.65, 1.3, 0, 0.34, 0.16, '#3b332e', { noShadow: true, lid: false })); it.push(cyl(7.65, 3.9, 0, 0.34, 0.16, '#3b332e', { noShadow: true, lid: false }));
    it.push(house(6.2, 5.6, 1.6, 1.9, 1.3, 0.7, PAL.sand, PAL.teal));
        it.push(birds(3, 7, 0, 20));
    return { bg: mix(PAL.water, '#ffffff', .55), it, state: 'cork', opts: { load: 'dock', glass: 'standard' }, labels: [
      tag([1.1, 1.2, 2.2], 'tank', 1, 'settled tank', 'clear before glass', -14, -12),
      tag([1.2, 3.5, 1.6], 'filler', 2, 'filler', 'same level, little air', -30, 8),
      tag([2.47, 3.5, 2.3], 'close', 3, 'cork or screwcap', 'tap to switch', 6, -34),
      tag([4.1, 2.7, 1.4], 'label', 4, 'labeler', 'who · where · when', 10, -26),
      tag([4.4, 6.1, 1.0], 'case', 5, 'cases on a pallet', '12 to a case', -20, 34),
      tag([6.9, 6.5, 1.8], 'door', 6, 'shop door', 'keep it cool en route', 18, 6)] };
  },
  '08'() { // Wine shop floor on top, FIFO stockroom below
    const it = [ground(PAL.cream, 8, { H: 0.42, tufts: 0, soil: mix(PAL.wood, PAL.sand, .35) })];
    it.push(stripe(0.2, 0.2, 7.6, 7.6, mix(PAL.cream, PAL.sand, .35), { rows: 8, cols: 8 }));
    it.push(stripe(1.6, 5.4, 4.2, 1.4, mix(PAL.clay, '#ffffff', .55), { rows: 2 }));
    const styles = [['whites', mix(PAL.white, PAL.mint, .3), [PAL.white, mix(PAL.white, PAL.gold, .4), PAL.mint]], ['reds', PAL.clay, [PAL.red, PAL.clay, '#4a1d2c']],
      ['rosé', mix(PAL.terra, '#ffffff', .45), [mix(PAL.terra, '#fff', .4), mix(PAL.terra, '#fff', .2)]], ['bubbles', PAL.mauve, [PAL.teal, dark(PAL.teal, .2)]], ['fortified', PAL.wood, [PAL.wood, PAL.red]]];
    styles.forEach(([name, c, bc], i) => {
      const x = 0.35 + i * 1.28, W = [];
      W.push(box(x, 0.4, 0, 1.15, 0.6, 2.0, PAL.wood, { planks: 3 }));
      W.push(box(x, 0.4, 2.0, 1.15, 0.6, 0.16, c, { thin: true, noShadow: true }));
      for (let s = 0; s < 3; s++) for (let b = 0; b < 3; b++) {
        const bt = bottle(x + 0.22 + b * 0.36, 1.05, 0.22 + s * 0.6, bc[(b + s) % bc.length], 0.38);
        W.push(i === 2 && s === 1 ? optG('restock', 'off', () => bt, true) : bt);
      }
      W.push(chip(x + 0.6, 1.0, i % 2 ? 2.4 : 2.85, name, light(c, .25)));
      it.push(...W.map(q => Z('walls', q)));
    });
    // chilled case with condensation
    const K = [box(6.85, 1.6, 0, 0.95, 2.6, 2.3, PAL.teal)];
    K.push({ d: 9.2, s: fill([[7.8, 1.75, 0.25], [7.8, 4.05, 0.25], [7.8, 4.05, 2.05], [7.8, 1.75, 2.05]], 'rgba(216,230,218,.62)', `stroke="${LINE}" stroke-width=".6"`) + [0.85, 1.45].map(z => seg3([7.8, 1.75, z], [7.8, 4.05, z], .5)).join('') + seg3([7.8, 2.9, 0.25], [7.8, 2.9, 2.05], .5) + seg3([7.8, 1.95, 1.9], [7.8, 2.4, 1.45], .7, 'rgba(255,255,255,.9)') });
    for (let i = 0; i < 6; i++) K.push(bottle(7.82, 1.95 + i * 0.36, 0.3 + (i % 2) * 0.6, [PAL.white, PAL.teal, mix(PAL.terra, '#fff', .4)][i % 3], 0.38));
    for (let i = 0; i < 4; i++) K.push(drop(7.82, 2.1 + i * 0.55, 1.9 - (i % 2) * 0.5, i * 0.6));
    it.push(...K.map(q => Z('chill', q)));
    // tasting counter
    const T = [box(2.4, 3.2, 0, 2.6, 0.8, 1.0, mix(PAL.sand, PAL.wood, 0.25), { planks: 2 })];
    T.push(box(2.3, 3.1, 1.0, 2.8, 1.0, 0.08, dark(PAL.wood, .1), { flat: true, thin: true, noShadow: true }));
    T.push(glass(3.0, 3.6, 1.08, PAL.white)); T.push(glass(3.6, 3.7, 1.08, PAL.red)); T.push(glass(4.2, 3.6, 1.08, mix(PAL.terra, '#fff', .4)));
    T.push(worker(3.4, 2.7, PAL.teal, 'bottlePour', { tc: PAL.red, apron: PAL.cream, flip: false }));
    T.push(worker(3.9, 4.6, PAL.mauve, 'glass', { tc: PAL.red, delay: .6, flip: true }));
    it.push(...T.map(q => Z('counter', q)));
    // checkout
    const Ck = [box(0.5, 4.2, 0, 1.0, 2.2, 1.0, PAL.clay)];
    Ck.push(box(0.65, 4.4, 1.0, 0.5, 0.5, 0.35, PAL.mint, { thin: true, noShadow: true }));
    Ck.push(bottle(0.85, 5.6, 1.0, PAL.red, 0.42)); Ck.push(box(0.7, 5.9, 1.0, 0.35, 0.3, 0.45, PAL.sand, { thin: true, noShadow: true }));
    Ck.push(worker(0.3, 5.2, PAL.teal, 'none', { delay: .1 }));
    it.push(...Ck.map(q => Z('checkout', q)));
    it.push(walk(worker(5.6, 6.6, PAL.clay, 'basket', { cls: 'walker', tc: PAL.teal }), [[5.6, 6.6, 0], [2.0, 6.6, 0], [2.0, 5.1, 0], [5.6, 5.1, 0]], 16));
    // stair hatch
    it.push(box(6.3, 5.9, 0, 1.3, 1.6, 0.04, dark(PAL.wood, .45), { flat: true, thin: true, noShadow: true }));
    for (let i = 0; i < 5; i++) it.push({ d: 13, s: seg3([6.35, 6.0 + i * 0.3, 0.05], [7.55, 6.0 + i * 0.3, 0.05], .7, light(PAL.wood, .3)) });
    it.push(chip(6.95, 6.7, 0.5, 'stock ↓', PAL.cream));
    it.push(bush(7.4, 4.9, 0, PAL.leaf));
    // v4 density: staff-picks island, basket stack, browsing guests, door mat, gift bags
    const Is = [box(0.45, 6.75, 0, 1.0, 0.85, 0.7, mix(PAL.sand, PAL.wood, .35), { planks: 2 })];
    for (const [a, b, z] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0.5, 0.5, 0.42]]) Is.push(bottle(0.7 + a * 0.45, 6.92 + b * 0.38, 0.7 + z, [PAL.red, PAL.white, PAL.teal, mix(PAL.terra, '#fff', .3), PAL.wood][Math.floor(a + b * 2 + (z ? 4 : 0)) % 5], 0.42));
    Is.push(chip(0.95, 7.6, 0.45, 'staff picks', PAL.mint));
    it.push(...Is.map(q => Z('walls', q)));
    for (let k = 0; k < 3; k++) it.push(box(0.35, 3.3, k * 0.14, 0.5, 0.4, 0.13, k % 2 ? PAL.teal : light(PAL.teal, .15), { thin: true, noShadow: k > 0 }));
    it.push(crowd(1.9, 1.8, PAL.mustard, { delay: .3 })); it.push(crowd(4.6, 1.9, PAL.sage, { delay: 1.1 }));
    it.push(stripe(2.6, 7.3, 1.4, 0.45, PAL.teal, { cols: 4 }));
    for (const [x, c] of [[1.7, PAL.clay], [1.95, PAL.mint]]) it.push(box(x, 4.45, 1.0, 0.2, 0.14, 0.3, c, { thin: true, noShadow: true }));
    // restock (toolbar): a gap on the rosé wall, the oldest case comes up the stair
    it.push(optG('restock', 'on', () => [chip(3.2, 0.9, 1.0, 'gap · bring up 1st', PAL.mint), worker(6.95, 6.3, PAL.mauve, 'case', { flip: true, delay: .2 })]));
    // round-up jar at checkout (toolbar)
    it.push(optG('roundup', 'on', () => { const j = cyl(0.95, 4.95, 1.0, 0.16, 0.32, 'rgba(235,245,244,1)', { noShadow: true, lid: false }); const [jx, jy] = P(0.95, 4.95, 1.12);
      return [{ d: j.d, s: j.s + [[-1, 0], [1, -.6], [0, -1.6]].map(([dx, dy]) => `<ellipse cx="${f(jx + dx)}" cy="${f(jy + dy)}" rx="1.2" ry=".6" fill="${PAL.mustard}" stroke="${LINE}" stroke-width=".3"/>`).join('') + `<path d="M${pp(jx, jy - 7)}q1.6,2.4 0,3.4q-1.6,-1 0,-3.4z" fill="${PAL.water}" stroke="${LINE}" stroke-width=".35"/>` }, chip(0.6, 4.6, 1.75, 'round up · water', PAL.mint)]; }));
    // STOCKROOM (under)
    const cv = cave({ top: -0.42, h: 2.2, wall: mix(PAL.sand, PAL.wood, .3) }), zf = cv.zf, und = cv.it;
    const fifo = [['1st', 1.0], ['2nd', 2.8], ['3rd', 4.6]];
    for (const [n, x] of fifo) {
      const P1 = [pallet(x, 6.4, 1.3, 1.1)].map(p => ({ d: p.d, s: box(x, 6.4, zf, 1.3, 1.1, 0.16, light(PAL.wood, .25), { thin: true, planks: 2, noShadow: true }).s }));
      und.push(Z('stock', group(x + 7, [...P1, ...cases(x + 0.05, 6.45, zf + 0.16, 3, 2, n === '1st' ? 2 : 3, PAL.sand, .42), chip(x + 0.65, 7.5, zf + 1.5, n, n === '1st' ? PAL.mint : PAL.cream)])));
      if (n === '1st') und.push(optG('restock', 'on', () => ({ d: x + 7.1, s: fill([[x - 0.08, 6.32, zf + 0.01], [x + 1.38, 6.32, zf + 0.01], [x + 1.38, 7.58, zf + 0.01], [x - 0.08, 7.58, zf + 0.01]], 'none', `stroke="${PAL.teal}" stroke-width="1.4" stroke-dasharray="3 2"`) })));
    }
    und.push(flow([[6.4, 7.6, zf + 0.05], [0.6, 7.6, zf + 0.05]], PAL.clay, { packets: 3, dur: 8, d: 20, r: 1.2 }));
    und.push(Z('stock', walk(worker(6.2, 7.5, PAL.mauve, 'case', { z: zf, cls: 'walker', flip: true }), [[6.2, 7.5, zf], [0.8, 7.5, zf]], 10)));
    // dock along the right opening
    und.push(Z('dock', group(13, [{ d: 0, s: box(6.6, 1.0, zf, 1.1, 1.2, 0.16, light(PAL.wood, .25), { thin: true, noShadow: true }).s }, ...cases(6.65, 1.05, zf + 0.16, 2, 2, 2, PAL.clay, .42)])));
    und.push(Z('dock', worker(7.6, 3.2, PAL.teal, 'clip', { z: zf, flip: true, delay: .4 })));
    und.push(ladder(7.3, 5.4, zf, 2.2, .35));
    const [lx, ly] = P(3.5, 0.05, zf + 1.8);
    und.push({ d: -250, s: `<circle cx="${f(lx)}" cy="${f(ly)}" r="9" fill="${PAL.mustard}" opacity=".18" class="glow"/><circle cx="${f(lx)}" cy="${f(ly)}" r="1.5" fill="#fff3c4" stroke="${LINE}" stroke-width=".5"/>` });
    return { bg: mix(PAL.sand, '#ffffff', .45), it, opts: { restock: 'off', roundup: 'off' }, under: { it: und, open: 20 }, labels: [
      tag([2.2, 0.7, 2.2], 'walls', 1, 'style walls', 'shop by taste', -16, -12),
      tag([7.3, 2.9, 2.3], 'chill', 2, 'chilled case', 'whites · rosé · bubbles', 22, 2),
      tag([3.6, 3.6, 1.5], 'counter', 3, 'tasting counter', 'one step from what you like', -34, -30),
      tag([1.0, 5.3, 1.0], 'checkout', 4, 'checkout', 'wrap · temp tip · ID', -30, 6),
    ], ulabels: [
      tag([3.4, 7.0, zf + 1.3], 'stock', 5, 'stockroom · FIFO', 'tap · unfold floors', -14, 30),
      tag([7.2, 1.6, zf + 1.2], 'dock', 6, 'back dock', 'check the invoice', 22, 4)] };
  },
  '09'() { // Table service: water first, then wine
    const it = [ground(mix(PAL.sand, PAL.clay, 0.12), 9, { tufts: 4, soil: mix(PAL.wood, PAL.sand, .3) })];
    it.push(stripe(0.2, 2.2, 7.6, 5.6, mix(PAL.sand, PAL.clay, .2), { rows: 7 }));
    it.push(stripe(2.2, 3.9, 3.6, 2.8, mix(PAL.teal, '#ffffff', .7), { rows: 3, cols: 3 }));
    // back bar shelf + bar
    it.push(box(0.5, 0.15, 0, 6.8, 0.35, 2.6, dark(PAL.wood, .1), { planks: 3, noShadow: true }));
    for (let s = 0; s < 2; s++) for (let i = 0; i < 9; i++) it.push(bottle(0.85 + i * 0.72, 0.42, 1.25 + s * 0.65, [PAL.red, PAL.teal, PAL.mustard, PAL.clay, PAL.wood][(i + s) % 5], 0.4));
    const B = [box(0.5, 0.8, 0, 6.8, 1.0, 1.3, PAL.wood, { planks: 3 })];
    B.push(box(0.4, 0.7, 1.3, 7.0, 1.2, 0.1, dark(PAL.wood, .25), { flat: true, thin: true, noShadow: true }));
    for (let i = 0; i < 6; i++) B.push(bottle(2.7 + i * 0.62, 1.15, 1.4, [PAL.red, PAL.clay, PAL.teal, PAL.mustard, mix(PAL.terra, '#ffffff', .4), PAL.red][i], 0.55));
    it.push(...B.map((q, i) => Z('btg', i > 1 ? { ...q, d: 5.3 + i * 0.01 } : q)));
    const I = [cyl(1.5, 1.3, 1.4, 0.4, 0.55, PAL.steel, { hoops: [0.4], noShadow: true }), bottle(1.5, 1.3, 1.75, PAL.teal, 0.5)];
    const [ix, iy] = P(1.5, 1.3, 1.95);
    I.push({ d: 3.4, s: [[-3, 0], [2.6, .4], [-.4, 1.2], [3.6, -.6]].map(([dx, dy]) => `<rect x="${f(ix + dx - 1)}" y="${f(iy + dy - 1)}" width="2" height="2" fill="#f4fbfb" stroke="${LINE}" stroke-width=".3" transform="rotate(20 ${f(ix + dx)} ${f(iy + dy)})"/>`).join('') });
    I.push(drop(1.85, 1.65, 1.6, 0.4));
    I.push(optG('ice', 'water', () => ({ d: 3.45, s: `<ellipse cx="${f(ix)}" cy="${f(iy + 1)}" rx="5.4" ry="2.4" fill="${PAL.water}" opacity=".75"/>` + chip(2.05, 1.75, 1.42, 'ice + water', PAL.mint).s })));
    I.push(optG('ice', 'dry', () => chip(2.05, 1.75, 1.42, 'ice only', PAL.cream), true));
    it.push(...I.map(q => Z('ice', { ...q, d: 5.25 + q.d * 0.001 })));
    for (const x of [1.4, 3.6, 5.8]) { it.push(cyl(x, 2.3, 0.75, 0.3, 0.1, PAL.clay, { noShadow: true })); it.push(box(x - 0.05, 2.25, 0, 0.1, 0.1, 0.75, LINE, { thin: true })); }
    for (const x of [2.2, 4.4, 6.4]) { const [px, py] = P(x, 3.0, 3.5), [, qy] = P(x, 3.0, 2.4); it.push({ d: 30, s: `<path d="M${pp(px, py - 18)}V${f(qy)}" stroke="${LINE}" stroke-width=".5"/><path d="M${pp(px - 3, qy + 2)}q3,-5 6,0z" fill="${PAL.mustard}" stroke="${LINE}" stroke-width=".5"/><circle cx="${f(px)}" cy="${f(qy + 4)}" r="5" fill="${PAL.mustard}" opacity=".2" class="glow"/>` }); }
    // table with water + wine states
    it.push(box(2.6, 4.3, 1.0, 2.8, 2.0, 0.18, PAL.cream, { flat: true }));
    castShadow(rectFoot(2.6, 4.3, 2.8, 2.0), 0.9);
    for (const [x, y] of [[2.7, 4.4], [5.2, 4.4], [2.7, 6.1], [5.2, 6.1]]) it.push(box(x, y, 0, 0.12, 0.12, 1.0, PAL.wood, { thin: true, noShadow: true }));
    it.push(Z('water', cyl(3.15, 5.0, 1.18, 0.28, 0.75, mix(PAL.water, '#ffffff', .35))));
    // chairs behind the table, candle, service in three states: water → wine → clear
    for (const x of [3.1, 4.4]) it.push(chair(x, 3.75, PAL.wood, 'n'));
    it.push(candle(4.3, 5.35, 1.18));
    for (const [x, y] of [[3.8, 4.75], [4.9, 4.9], [3.7, 5.9], [4.8, 6.0]]) {
      for (const st of ['water', 'wine']) { it.push(Z('water', when(st, glass(x - 0.3, y + 0.1, 1.18, PAL.water), st === 'water'))); it.push(when(st, plate(x - 0.15, y + 0.45, 1.18), st === 'water')); }
      it.push(when('water', glass(x, y, 1.18, 'rgba(251,245,234,.2)'), true));
      it.push(when('wine', glass(x, y, 1.18, PAL.red)));
      const [nx, ny] = P(x - 0.1, y + 0.4, 1.18);
      it.push(when('clear', { d: x + y + 0.2, s: `<path d="M${pp(nx - 3, ny)}l3,-1.6l3,1.6l-3,1.6z" fill="#fffaf1" stroke="${LINE}" stroke-width=".45"/><path d="M${pp(nx, ny - 1.6)}v3.2" stroke="${PAL.clay}" stroke-width=".5"/>` }));
    }
    it.push(when('clear', chip(4.0, 5.3, 1.75, 'reset for the next table', PAL.mint)));
    it.push(when('clear', walk(worker(5.6, 6.9, PAL.teal, 'tray', { cls: 'walker', apron: PAL.cream }), [[5.6, 6.9, 0], [6.3, 6.9, 0], [6.3, 2.6, 0], [6.3, 6.9, 0]], 9)));
    // v4 density: service station with decanter + napkins, a two-top with guests
    it.push(box(0.3, 4.0, 0, 0.85, 0.55, 0.85, dark(PAL.wood, .05), { planks: 2 }));
    { const dc = cyl(0.55, 4.25, 0.85, 0.2, 0.22, 'rgba(240,236,224,1)', { noShadow: true, lid: false }); const [dx2, dy2] = P(0.55, 4.25, 0.95); it.push({ d: dc.d + 0.1, s: dc.s + `<rect x="${f(dx2 - .7)}" y="${f(dy2 - 9)}" width="1.4" height="6" fill="rgba(240,236,224,.95)" stroke="${LINE}" stroke-width=".4"/><ellipse cx="${f(dx2)}" cy="${f(dy2 + .6)}" rx="2.6" ry="1.1" fill="${PAL.red}" opacity=".85"/>` }); }
    for (let k = 0; k < 3; k++) it.push(box(0.85, 4.15, 0.85 + k * 0.07, 0.25, 0.3, 0.06, k % 2 ? PAL.cream : '#fff', { thin: true, noShadow: true, flat: true }));
    it.push(bush(7.3, 5.4, 0, mix(PAL.leaf, PAL.sage, .3), { berries: PAL.terra }));
    it.push(figure(2.2, 5.3, PAL.mauve, { cls: 'bob' })); it.push(figure(5.9, 5.6, PAL.clay, { cls: 'bob', style: '--delay:.8s' }));
    // pour: server at the table (jug first, then bottle)
    it.push(when('water', worker(4.3, 6.9, PAL.teal, 'jug', { apron: PAL.cream }), true));
    it.push(when('wine', worker(4.3, 6.9, PAL.teal, 'bottlePour', { apron: PAL.cream, tc: PAL.red })));
    // runner with tray loops bar ↔ table
    it.push(walk(worker(6.4, 2.6, PAL.teal, 'tray', { cls: 'walker', apron: PAL.cream }), [[6.4, 2.6, 0], [6.4, 4.0, 0], [6.4, 6.9, 0], [6.4, 4.0, 0]], 12));
    // host stand + menu
    const H = [box(0.6, 6.4, 0, 0.6, 0.5, 1.1, PAL.teal, { planks: 2 }), worker(1.1, 7.4, PAL.clay, 'none', { delay: .4 })];
    const [mx, my] = P(0.9, 6.65, 1.1);
    H.push({ d: 7.6, s: `<path d="M${pp(mx - 3, my)}l3,-2.2l3,2.2l-3,1.2z" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".5"/><path d="M${pp(mx, my - 2.2)}v3.4" stroke="${FINE}" stroke-width=".4"/>` });
    it.push(...H.map(q => Z('host', q)));
    const M = [box(1.6, 3.2, 0, 0.12, 0.12, 1.2, PAL.wood, { thin: true })];
    const [sx, sy] = P(1.66, 3.26, 1.2);
    M.push({ d: 4.9, s: `<rect x="${f(sx - 3.4)}" y="${f(sy - 8)}" width="6.8" height="8.4" rx=".6" fill="${PAL.cream}" stroke="${LINE}" stroke-width=".55"/><path d="M${pp(sx - 2.4, sy - 6)}h4.8M${pp(sx - 2.4, sy - 4.4)}h3.6M${pp(sx - 2.4, sy - 2.8)}h4.2M${pp(sx - 2.4, sy - 1.2)}h3" stroke="${PAL.clay}" stroke-width=".45"/>` });
    it.push(...M.map(q => Z('menu', q)));
    for (const [x, y] of [[1.0, 5.0], [7.2, 7.3]]) it.push(bush(x, y, 0, PAL.leaf));
    it.push(lamp(7.3, 3.2));
    return { bg: mix(PAL.terra, '#ffffff', .7), it, state: 'water', opts: { ice: 'dry' }, labels: [
      tag([3.15, 5.0, 1.95], 'water', 1, 'water first', 'tap · then pour wine', -44, 8),
      tag([4.6, 1.15, 2.3], 'btg', 2, 'by the glass', 'open bottles, fresh pours', 14, -22),
      tag([1.5, 1.3, 2.1], 'ice', 3, 'ice bucket', 'ice + water, faster', -18, -12),
      tag([4.3, 6.9, 1.3], 'pour', 4, 'the pour', 'taste for the host', 26, 16),
      tag([0.9, 6.65, 1.3], 'host', 5, 'host steps', 'greet & seat', -4, 30),
      tag([1.66, 3.26, 1.6], 'menu', 6, 'menu stand', 'sorted by style', -30, -8)] };
  },
};
// 02 + 03: three family platforms, catalogue pads, analyst + tasting/barrel corner
function familyScene(seed, c) {
  const it = [ground(c.groundC, seed, { tuft: mix(PAL.sage, LINE, .3), tufts: 12 })], r = rng(seed * 13);
  const n = c.fams.length, pads = c.count.startsWith('11') ? 11 : 14, perRow = Math.ceil(pads / 2);
  // catalogue pads (back)
  for (let k = 0; k < pads; k++) {
    const row = Math.floor(k / perRow), col = k % perRow, x = 0.3 + col * (5.0 / perRow), y = 0.35 + row * 0.85, w = 5.0 / perRow - 0.12;
    it.push(Z('pads', stripe(x, y, w, 0.7, mix(PAL.soil, c.groundC, .45), { rows: 2 })));
    const [px, py] = P(x + w / 2, y + 0.35, 0), fc = c.leafC[k % 3];
    it.push(Z('pads', { d: x + y + 0.7, s: `<path d="M${pp(px, py)}v-6" stroke="${PAL.wood}" stroke-width=".7"/>` + leafG(px - 1.8, py - 5.6, .55, fc, -30) + leafG(px + 1.8, py - 6.2, .5, dark(fc, .1), 30) + `<circle cx="${f(px - .8)}" cy="${f(py - 3)}" r="1" fill="${c.grape}" stroke="${LINE}" stroke-width=".3"/><circle cx="${f(px + .6)}" cy="${f(py - 2.6)}" r="1" fill="${c.grape}" stroke="${LINE}" stroke-width=".3"/>` }));
    // trait-pad mode: each pad flags its family (colour + initial) so the eleven/fourteen sort into three
    const fam = c.fams[k % 3], [qx, qy] = P(x + w * 0.85, y + 0.12, 0);
    it.push(optG('traits', 'on', () => ({ d: x + y + 0.75, s: fill([[x + 0.04, y + 0.04, 0.01], [x + w - 0.04, y + 0.04, 0.01], [x + w - 0.04, y + 0.66, 0.01], [x + 0.04, y + 0.66, 0.01]], fam[2], `opacity=".7" stroke="${dark(fam[2], .4)}" stroke-width=".6"`) +
      `<path d="M${pp(qx, qy)}v-9" stroke="${LINE}" stroke-width=".55"/><path d="M${pp(qx, qy - 9)}h5.4l-1.2,1.8l1.2,1.8h-5.4z" fill="${dark(fam[2], .15)}" stroke="${LINE}" stroke-width=".4"/><text x="${f(qx + 2.2)}" y="${f(qy - 6.3)}" text-anchor="middle" class="chip" fill="${LINE}">${fam[1][0]}</text>` })));
  }
  // family platforms with mini vines + leaf chips; selected family glows
  c.fams.forEach(([key, name, col, h, glassC], i) => {
    const x = 0.7 + i * 2.35, y = 4.0 - i * 0.15, F = [];
    F.push(when(key, { d: -41, s: fill([[x - 0.2, y - 0.2, 0], [x + 1.75, y - 0.2, 0], [x + 1.75, y + 1.75, 0], [x - 0.2, y + 1.75, 0]], PAL.mustard, `opacity=".35" stroke="${PAL.clay}" stroke-width=".8" stroke-dasharray="2 1.4"`) }, i === 0));
    F.push(box(x, y, 0, 1.55, 1.55, h, col, { planks: Math.round(h / 0.42) }));
    F.push(vine(x + 0.45, y + 0.5, { cz: h + 0.7, grape: c.grape, br: 0.95, leaf: c.leafC[i] }));
    F.push(vine(x + 1.1, y + 1.05, { cz: h + 0.6, grape: c.grape, br: 0.95, leaf: c.leafC[i] }));
    F.push(chip(x + 0.8, y + 1.55, h * 0.45, c.subs[i], light(col, .35)));
    F.push(box(x + 0.02, y + 2.02, 0, 0.08, 0.08, 0.55, PAL.wood, { thin: true, noShadow: true }));
    F.push(thermo(x + 0.06, y + 2.06, 0.55, [0.28, 0.55, 0.86][i], [PAL.teal, PAL.mustard, PAL.clay][i]));
    F.push(crate(x + 1.62, y + 0.2, 0, 0.4, light(PAL.wood, .1)));
    F.push({ d: x + y + 2.3, s: [0, 1, 2].map(j => { const [bx2, by2] = P(x + 1.74 + j * 0.1, y + 0.34, 0.42); return `<circle cx="${f(bx2)}" cy="${f(by2)}" r="1.1" fill="${c.grape}" stroke="${LINE}" stroke-width=".3"/>`; }).join('') });
    it.push(...F.map(q => Z(key, q)));
  });
  // corner: tasting bench (whites) or barrel corner (reds)
  const K = [];
  if (c.corner === 'bench') {
    K.push(box(5.6, 0.6, 0, 2.0, 0.9, 0.85, PAL.wood, { planks: 2 }));
    K.push(box(5.6, 0.4, 0.85, 2.0, 0.12, 0.7, PAL.cream, { thin: true, noShadow: true }));
    c.fams.forEach(([key, , , , glassC], i) => { K.push(when(key, glass(6.0 + i * 0.55, 1.05, 0.85, glassC), i === 0)); });
    c.fams.forEach(([key], i) => K.push(optG('compare', 'off', () => glass(6.0 + i * 0.55, 1.35, 0.85, 'rgba(251,245,234,.25)'), true)));
    c.fams.forEach(([key, , , , glassC], i) => K.push(optG('compare', 'on', () => glass(6.0 + i * 0.55, 1.35, 0.85, glassC))));
    K.push(optG('compare', 'on', () => chip(6.55, 1.75, 0.85, 'side by side', PAL.mint)));
    K.push(jar(5.75, 1.25, 0.85, PAL.soil)); K.push(jar(7.35, 0.95, 0.85, mix(PAL.soil, PAL.sand, .5)));
    K.push(bucket(7.4, 1.8, 0, PAL.steel, PAL.white));
    K.push(worker(6.6, 2.1, PAL.clay, 'glass', { tc: c.fams[0][4], delay: .4 }));
  } else {
    K.push(hbarrel(5.9, 0.5, 0, 0.45, 1.2, PAL.wood, { chalk: true }));
    K.push(hbarrel(6.9, 0.5, 0, 0.45, 1.2, PAL.wood, { chalk: true }));
    K.push(hbarrel(6.4, 0.55, 0.88, 0.42, 1.1, light(PAL.wood, .1), { noShadow: true }));
    K.push(box(7.3, 2.0, 0, 0.12, 0.6, 1.4, PAL.cream, { thin: true }));
    const [nx, ny] = P(7.3, 2.3, 1.1);
    K.push({ d: 9.9, s: `<path d="M${pp(nx - 2.4, ny - 4)}h3M${pp(nx - 2.4, ny - 2.4)}h2.2M${pp(nx - 2.4, ny - .8)}h3" stroke="${PAL.clay}" stroke-width=".5"/>` });
    K.push(worker(6.3, 2.3, PAL.teal, 'glass', { tc: c.fams[2][4], delay: .4 }));
    K.push(cyl(5.55, 2.85, 0, 0.42, 0.85, PAL.wood, { staves: true, hoops: [0.2, 0.8] }));
    K.push(optG('compare', 'on', () => c.fams.map(([key, , , , glassC], i) => glass(5.3 + i * 0.25, 2.7 + i * 0.12, 0.85, glassC))));
  }
  it.push(...K.map(q => Z(c.corner, q)));
  it.push(stripe(0.3, 6.5, 7.4, 1.2, mix(c.groundC, PAL.soil, .3), { cols: 8 }));
  it.push(walk(worker(0.6, 7.0, PAL.teal, 'basket', { cls: 'walker', tc: c.grape }), [[0.6, 7.0, 0], [7.2, 7.0, 0], [7.2, 3.3, 0], [7.2, 7.0, 0]], 16));
  it.push(Z('notes', worker(1.8, 6.4, PAL.mauve, 'clip', { hat: PAL.sand, delay: .8 })));
  it.push(bush(7.4, 6.0, 0, PAL.sage, { berries: c.grape }));
  // v4 density: site board (cool → warm), sample jars shelf, picking bin, posts along the pads
  it.push(box(4.0, 6.65, 0, 1.0, 0.4, 0.55, PAL.wood, { planks: 2 }));
  for (let j = 0; j < 4; j++) it.push(jar(4.15 + j * 0.24, 6.85, 0.55, [PAL.soil, mix(PAL.soil, PAL.sand, .5), dark(PAL.soil, .2), PAL.sand][j], 0.28));
  it.push(box(5.6, 7.05, 0, 0.7, 0.5, 0.42, PAL.clay, { planks: 2 }));
  for (const x of [0.22, 5.42]) it.push(box(x, 0.3, 0, 0.08, 0.08, 1.0, PAL.wood, { thin: true }));
  it.push(line3([0.26, 0.34, 0.85], [5.46, 0.34, 0.85], .45, dark(PAL.steel, .35)));
  it.push(birds(2, seed, 0, 18));
  const labels = c.fams.map(([key, name, , h], i) => tag([0.7 + i * 2.35 + 0.78, 4.0 - i * 0.15 + 1.55, h * 0.2], key, i + 1, name, 'tap · taste it', [-26, 2, 22][i], [44, 34, 26][i]));
  labels.push(tag([2.4, 0.7, 0.4], 'pads', 4, `${c.count}`, 'leaf + berry clues', -12, -18));
  labels.push(tag([6.6, 1.0, 1.6], c.corner, 5, c.corner === 'bench' ? 'tasting bench' : 'barrel corner', c.corner === 'bench' ? 'same pour, white card' : 'oak frames bold', -2, -38));
  labels.push(tag([1.8, 6.4, 1.4], 'notes', 6, 'field notes', 'patterns, not a list', -12, 30));
  return { bg: c.bg, it, state: c.fams[0][0], opts: { traits: 'off', compare: 'off' }, labels };
}

/* ---------- in-place teaching notes for World pins + zones (original Sip Studies copy) ----------
   Each entry: t = title, b = body. Optional: state (set scene state), cycle (toggle between states),
   explode (unfold stacked layers), focus (dim other zones). sip-app.js renders the popover. */
export const HOTSPOTS = {
  '01': {
    trellis: { t: 'Trellis wires', b: 'Catch wires hold shoots upright so the leaves form a thin, tidy wall. Sun reaches the fruit, air moves through, and mildew has fewer damp days to work with.' },
    canopy: { t: 'Leaf pulling', b: 'The trainee pulls a few leaves on the morning-sun side of the fruit zone. Clusters get light and dry fast after rain. Pull too many and grapes sunburn.' },
    prune: { t: 'Winter pruning', b: 'Cut last year’s cane back to a couple of buds per spur. Fewer buds means fewer, riper clusters. This one cut sets the size of the whole crop.' },
    post: { t: 'End post & tensioner', b: 'The braced end post anchors the row; the small ratchet keeps wires tight so the canopy does not sag when the fruit gets heavy.' },
    drip: { t: 'Drip line', b: 'Emitters water the root zone, not the leaves. Tap again to switch the line off and on and watch the wet bulbs in the soil cut. A little stress keeps berries small and flavorful.', cycle: ['wet', 'dry'] },
    soil: { t: 'Soil cut', b: 'The layers unfold: topsoil, then clay, then rock. Roots chase water downward; a vine that works for water gives smaller berries with more concentration. Tap again to fold it back.', explode: true },
    season: { t: 'Winter pruning view', b: 'Leaves gone, canes cut back to short spurs, trimmings bundled in the row, frost on the ground. Winter is when the grower decides how much fruit the vine can carry next year.' },
    station: { t: 'Weather mast', b: 'Wind cups and a rain gauge tell the crew when mildew pressure is high and how long the drip should run. Measure first, water second.' },
    tank: { t: 'Rain tank', b: 'Rain off the shed roof is stored for the drip line. Every liter caught here is a liter not pumped from the ground.' },
  },
  '02': {
    crisp: { t: 'Crisp whites', b: 'High acid, citrus and green apple, usually fermented cool in steel and served cold. Cool sites push grapes this way. The bench now pours a Crisp glass.', state: 'crisp', focus: 'crisp' },
    floral: { t: 'Floral whites', b: 'Aromatic grapes: blossom, stone fruit, sometimes a touch of sweetness. Winemakers keep it cool and skip new oak to protect the perfume.', state: 'floral', focus: 'floral' },
    rich: { t: 'Rich whites', b: 'Fuller body and riper fruit, often with oak or lees aging for a creamy texture. Warmer sites and later picking lean this way.', state: 'rich', focus: 'rich' },
    pads: { t: 'Catalogue pads', b: 'Eleven whites, one pad each. Leaf shape and berry color help you name a vine in the field. Group them by family and you learn patterns, not a list.' },
    bench: { t: 'Tasting bench', b: 'Same pour size, same temperature, white card behind the glass. Read color first (pale lemon to gold), then nose, then how the acid feels.' },
    notes: { t: 'Field notes', b: 'The analyst walks the platforms logging site, ripeness, and family for each white. Tap a family pin to pour it at the bench.' },
    traits: { t: 'Trait pads', b: 'Every catalogue pad now flags its family (C, F, R). Eleven names sort into three patterns you can taste. The thermometers show why: cooler sites lean Crisp, warmer sites lean Rich.' },
    compare: { t: 'Compare pour', b: 'All three families side by side, same pour, same temperature, white card behind. Read color first, then the nose, then how the acid feels.' },
  },
  '03': {
    light: { t: 'Light reds', b: 'Thin skins, bright red fruit, gentle tannin. Short skin contact and a slight chill show them best.', state: 'light', focus: 'light' },
    medium: { t: 'Medium reds', b: 'Fruit, acid, and tannin in balance. The flexible middle: with or without oak, friendly with most food.', state: 'medium', focus: 'medium' },
    bold: { t: 'Bold reds', b: 'Thick skins, dark fruit, firm tannin, deep color. Longer skin contact and oak barrels frame the grip.', state: 'bold', focus: 'bold' },
    pads: { t: 'Catalogue pads', b: 'Fourteen reds, one pad each, grouped by weight. Skin thickness is the clue: thicker skin, more color and tannin in the glass.' },
    barrel: { t: 'Barrel corner', b: 'Oak adds spice and lets a trickle of air in, softening tannin over months. The note board tracks punch-downs per day during fermentation.' },
    notes: { t: 'Field notes', b: 'The analyst walks the platforms logging skin, color, and family for each red. Tap a family pin to see it lift.' },
    traits: { t: 'Trait pads', b: 'Every catalogue pad now flags its weight (L, M, B). Fourteen reds sort into three patterns. Skin thickness is the thread: thin skins stay Light, thick skins go Bold.' },
    compare: { t: 'Compare pour', b: 'Light, Medium, and Bold side by side on the barrel head. Tilt each glass over a white card: light reds let the card show through the rim, bold reds hide it.' },
  },
  '04': {
    pick: { t: 'Pick date', b: 'Sugar, acid, and the taste of skins and seeds decide the day. Tap again to swap early and ripe fruit: early keeps acid for sparkling and crisp whites, ripe builds body for bold reds.', cycle: ['ripe', 'early'] },
    crew: { t: 'Hand-picking crew', b: 'Pickers cut whole clusters into small bins so the berries at the bottom are not crushed by the weight above. Gentle fruit means cleaner juice.' },
    cover: { t: 'Cover crop', b: 'Flowers between rows feed pollinators, hold the soil in rain, and compete with the vines for water so they do not overgrow.' },
    tractor: { t: 'Tractor & trailer', b: 'Headlights for pre-dawn picks when fruit is cool; a hitch for the bin trailer. Cool fruit arrives fresher and needs less chilling.' },
    crush: { t: 'Crush pad', b: 'Receiving bin, then the sorting table where the crew pulls leaves and bad berries before destemming. Rinse water from the hose reel is caught for reuse.' },
    bins: { t: 'Bins on the path', b: 'Bins ride the path straight to the pad. Speed matters: warm, split grapes start fermenting on their own.' },
    dawn: { t: 'Dawn pick', b: 'The crew starts in the dark with headlamps and tractor lights so fruit reaches the pad cool. Cool grapes stay fresh and need less energy to chill.' },
    rinse: { t: 'Rinse catch', b: 'Rinse water from the sorting table runs to a catch tank, settles, and goes back to wash the next bins instead of running off the pad.' },
    crewwater: { t: 'Crew shade & water', b: 'Shade and cold water at the row end. Harvest days start early and run hot; drinking water for the pickers is part of the plan.' },
  },
  '05': {
    white: { t: 'White · press first', b: 'White grapes are pressed right away and only the juice ferments, cool and clean, usually in steel. No skins means very little tannin.', opt: { style: 'white' }, focus: 'white' },
    rose: { t: 'Rosé · hours on skins', b: 'Red grapes rest on their skins for hours, not days, until the juice turns pink. Then it is pressed and fermented like a white.', opt: { style: 'rose' }, focus: 'rose' },
    red: { t: 'Red · ferment on skins', b: 'Crushed red grapes ferment with their skins in open-top tanks. Punch-downs push the floating cap back in to pull color and tannin, then the wine is pressed.', opt: { style: 'red' }, focus: 'red' },
    champ: { t: 'Champagne · second ferment', b: 'Traditional method: dry base wine plus a little sugar and yeast, capped in bottle. The bubbles form inside, then bottles rest on their lees down in the cool cave.', opt: { style: 'champ' }, focus: 'champ' },
    riddle: { t: 'Riddling racks', b: 'Bottles are turned and tipped a little each day until the spent yeast slides into the neck. The neck is frozen and the plug popped out (disgorging), then topped and corked.', focus: 'champ', explode: 'open' },
    fort: { t: 'Fortified · add grape spirit', b: 'Grape spirit goes in during or after fermentation. Added early it stops the ferment and keeps the wine sweet; added after, the wine stays dry. Many age in a solera, young barrels topping up old.', opt: { style: 'fort' }, focus: 'fort', explode: 'open' },
    water: { t: 'Water channel', b: 'Every yard rinses into one channel. A cellar can use several liters of water per liter of wine, so catching and reusing it is the Give-Back here.' },
    cellar: { t: 'Cave level', b: 'Floors unfold: the four making yards on top, the cool cave below where bubbles and fortified wines take their time. Tap again to fold it back.', explode: true },
    loop: { t: 'Rinse loop', b: 'With the loop on, channel water is caught in the corner tank, filtered, and piped back along the wall to the hoses instead of going down the drain.' },
  },
  '06': {
    steel: { t: 'Steel · sealed', b: 'Closed, temperature-controlled, almost no oxygen. Fruit stays fresh and crisp. Tanks are kept topped up so there is no air gap (ullage) on top.', focus: 'steel' },
    clay: { t: 'Clay amphora', b: 'Clay breathes a little like oak but adds no wood flavor. A middle path: rounder texture, no vanilla.', focus: 'clay' },
    oak: { t: 'Oak · slow breath', b: 'Air trickles in through the staves; tannin softens and toasted wood adds vanilla and spice. Wine evaporates, so the bung comes out for topping up.', focus: 'oak' },
    thief: { t: 'Wine thief', b: 'The cellar hand draws a sample through the bung hole and tastes before deciding: more time, blend, or bottle.', focus: 'oak' },
    lees: { t: 'Lees', b: 'Lees are spent yeast. Resting on them, and stirring now and then, gives a creamy, bready texture. Think sparkling wines and rich whites.', focus: 'lees' },
    age: { t: 'One year on', b: 'A year later: chalk tallies on the barrels, a top-up because oak lets wine evaporate, amphorae sealed with clay, a thicker lees layer in the jar. The steel tank looks the same, and that is the point.' },
    scale: { t: 'Reductive → oxidative', b: 'Left lane keeps air out, right lane lets more in, and the O₂ dots show the drift. Most wines live somewhere between. Tap a lane to focus it; tap again to clear.' },
  },
  '07': {
    tank: { t: 'Settled tank', b: 'Wine is settled or filtered clear and checked one last time before it meets glass.' },
    filler: { t: 'Filler', b: 'The carousel fills every bottle to the same level with as little air contact as possible.' },
    close: { t: 'Cork or screwcap', b: 'Tap again to switch. Cork lets in a tiny amount of oxygen over the years; a screwcap seals tighter, keeps fruit fresh, and avoids cork taint.', cycle: ['cork', 'screw'] },
    label: { t: 'Labeler', b: 'Front and back labels tell who made it, where, the vintage, and alcohol. The roll spins on as bottles pass.' },
    case: { t: 'Cases & pallet', b: 'Twelve bottles to a case, cases stacked on a pallet, and the pallet jack rolls it to the dock. Lighter glass means lower shipping carbon.' },
    door: { t: 'Shop door', b: 'The truck carries wine to distributors and shops. Keep it cool and out of the sun the whole way.' },
    load: { t: 'Dock or truck', b: 'Cases wait on the dock until the truck is ready, then load in one go: cool, shaded, stacked tight. Switch to see the truck cut away with its load.' },
    glass: { t: 'Lighter glass', b: 'A lighter bottle holds the same wine and weighs less on every pallet and truck. Less weight per case means less fuel from cellar to shelf.' },
  },
  '08': {
    walls: { t: 'Style walls', b: 'Shelves are grouped by style (whites, reds, rosé, bubbles, fortified) so a guest finds wine by taste, not by alphabet.', focus: 'walls' },
    chill: { t: 'Chilled case', b: 'Whites, rosé, and sparkling ready to drink tonight. The condensation tells you it is cold.', focus: 'chill' },
    counter: { t: 'Tasting counter', b: 'Small pours help a guest choose. Ask what they already like, then suggest one style step away.', focus: 'counter' },
    checkout: { t: 'Checkout', b: 'Ring it up, wrap the bottle, give a serving-temperature tip, and check ID.', focus: 'checkout' },
    stock: { t: 'Stockroom · FIFO', b: 'First in, first out: the oldest pallet goes up to the floor before newer ones. The floors unfold so you can see the back stock. Tap again to fold.', explode: true, focus: 'stock' },
    dock: { t: 'Back dock', b: 'Deliveries arrive here and get checked against the invoice before they join the FIFO line.', explode: 'open', focus: 'dock' },
    restock: { t: 'Restock from the 1st pallet', b: 'A gap opens on the rosé wall. The floors unfold and the oldest pallet (marked 1st) supplies the case, so nothing sits in the back too long.' },
    roundup: { t: 'Round-up jar', b: 'Guests can round up at checkout. The jar funds clean-water work, the Give-Back for this chart.' },
  },
  '09': {
    water: { t: 'Water first', b: 'Seat guests, pour water, then wine, then clear and reset. Tap again to run the service and watch the table change.', cycle: ['water', 'wine', 'clear'] },
    clear: { t: 'Clear & reset', b: 'Plates and glasses leave on a tray, napkins are refolded, and the table is reset before the next guests sit down.' },
    btg: { t: 'By the glass', b: 'Open bottles for single pours. Whites and bubbles sit in ice, reds at cellar temperature.', focus: 'btg' },
    ice: { t: 'Ice bucket', b: 'Ice plus water chills a bottle much faster than ice alone, because water touches the whole bottle.', focus: 'ice' },
    pour: { t: 'The pour', b: 'Present the bottle, pour a small taste for the host, then fill guests about a third of the glass so the wine can breathe.', cycle: ['water', 'wine'] },
    host: { t: 'Host steps', b: 'Greet, seat, hand over the list, and ask what the table is celebrating.', focus: 'host' },
    menu: { t: 'Menu stand', b: 'The wine list is sorted by style so guests choose by taste, with a water note on top.', focus: 'menu' },
  },
};
// key aliases for zones that share a note
for (const id of ['02', '03']) HOTSPOTS[id].notes ??= HOTSPOTS[id].pads;

/* ---------- per-chart toolbar (Village-style state toggles that redraw the scene) ----------
   Switch: { icon, label, on, off, note, act: [onText, offText] }. Radio: { label, options: [{ icon, label, set, note, act }], clear? }.
   Effects: state (scene state), opt { key: value } (option groups), explode (unfold layers), focus (dim other zones). */
const fam = (keys, names, icons, verb) => ({ label: 'Family', options: keys.map((k, i) => ({ icon: icons[i], label: names[i], set: { state: k, focus: k }, note: k, act: `${names[i]} ${verb} · others dimmed` })), clear: { focus: '' } });
export const TOGGLES = {
  '01': [
    { icon: '💧', label: 'Drip line', on: { state: 'wet' }, off: { state: 'dry' }, note: 'drip', act: ['Drip on · wet bulbs in the soil cut', 'Drip off · the vine works for water'] },
    { icon: '⛰', label: 'Soil cut', on: { explode: true }, off: { explode: false }, note: 'soil', act: ['Layers unfolded · roots chase water', 'Layers folded back'] },
    { icon: '✂', label: 'Winter prune', on: { opt: { season: 'winter' } }, off: { opt: { season: 'summer' } }, note: 'season', act: ['Winter · bare spurs, cut canes, frost', 'Summer · canopy and fruit are back'] },
  ],
  '02': [fam(['crisp', 'floral', 'rich'], ['Crisp', 'Floral', 'Rich'], ['🍋', '🌼', '🧈'], 'poured at the bench'),
    { icon: '🏷', label: 'Trait pads', on: { opt: { traits: 'on' } }, off: { opt: { traits: 'off' } }, note: 'traits', act: ['Pads flagged by family', 'Pad flags off'] },
    { icon: '🥂', label: 'Compare', on: { opt: { compare: 'on' }, focus: '' }, off: { opt: { compare: 'off' } }, note: 'compare', act: ['All three poured side by side', 'Back to one pour'] }],
  '03': [fam(['light', 'medium', 'bold'], ['Light', 'Medium', 'Bold'], ['🍒', '🍇', '🫐'], 'lifted'),
    { icon: '🏷', label: 'Trait pads', on: { opt: { traits: 'on' } }, off: { opt: { traits: 'off' } }, note: 'traits', act: ['Pads flagged by weight', 'Pad flags off'] },
    { icon: '🥂', label: 'Compare', on: { opt: { compare: 'on' }, focus: '' }, off: { opt: { compare: 'off' } }, note: 'compare', act: ['Three weights on the barrel head', 'Back to one pour'] }],
  '04': [
    { label: 'Pick date', options: [{ icon: '🟢', label: 'Early', set: { state: 'early' }, note: 'pick', act: 'Early pick · acid kept for crisp and sparkling' }, { icon: '🍇', label: 'Ripe', set: { state: 'ripe' }, note: 'pick', act: 'Ripe pick · body for bold reds' }] },
    { icon: '🌙', label: 'Dawn pick', on: { opt: { dawn: 'on' } }, off: { opt: { dawn: 'off' } }, note: 'dawn', act: ['Before sunrise · lamps on, fruit stays cool', 'Daylight'] },
    { icon: '♻', label: 'Rinse catch', on: { opt: { rinse: 'on' } }, off: { opt: { rinse: 'off' } }, note: 'rinse', act: ['Rinse water caught and reused', 'Catch tank idle'] },
  ],
  '05': [
    { label: 'Making style', options: [
      { icon: '🥂', label: 'White', set: { focus: 'white', opt: { style: 'white' }, explode: false }, note: 'white', act: 'White lane · skins out, juice to cool steel' },
      { icon: '🌸', label: 'Rosé', set: { focus: 'rose', opt: { style: 'rose' }, explode: false }, note: 'rose', act: 'Rosé lane · hours on skins, then press off' },
      { icon: '🍷', label: 'Red', set: { focus: 'red', opt: { style: 'red' }, explode: false }, note: 'red', act: 'Red lane · cap punched down, days on skins' },
      { icon: '🍾', label: 'Champagne', set: { focus: 'champ', opt: { style: 'champ' }, explode: true }, note: 'champ', act: 'Champagne lane · capped bottles go down to the cave' },
      { icon: '🥃', label: 'Fortified', set: { focus: 'fort', opt: { style: 'fort' }, explode: true }, note: 'fort', act: 'Fortified lane · grape spirit into the solera' }],
      clear: { focus: '', opt: { style: 'none' }, explode: false } },
    { icon: '♻', label: 'Rinse loop', on: { opt: { loop: 'on' } }, off: { opt: { loop: 'off' } }, note: 'loop', act: ['Loop on · channel water reused', 'Loop off · water to drain'] },
  ],
  '06': [
    { label: 'Vessel', options: [{ icon: '🛢', label: 'Steel', set: { focus: 'steel' }, note: 'steel', act: 'Steel lane · sealed and fresh' }, { icon: '🏺', label: 'Clay', set: { focus: 'clay' }, note: 'clay', act: 'Clay lane · breathes, no wood' }, { icon: '🪵', label: 'Oak', set: { focus: 'oak' }, note: 'oak', act: 'Oak lane · slow breath, spice' }], clear: { focus: '' } },
    { icon: '⏳', label: 'One year on', on: { opt: { age: 'old' } }, off: { opt: { age: 'young' } }, note: 'age', act: ['A year later · tallies, top-ups, seals', 'Fresh fill'] },
  ],
  '07': [
    { label: 'Closure', options: [{ icon: '🍾', label: 'Cork', set: { state: 'cork' }, note: 'close', act: 'Cork · a tiny breath over the years' }, { icon: '🔩', label: 'Screwcap', set: { state: 'screw' }, note: 'close', act: 'Screwcap · tight seal, fresh fruit' }] },
    { icon: '🚚', label: 'Load truck', on: { opt: { load: 'truck' } }, off: { opt: { load: 'dock' } }, note: 'load', act: ['Loaded · truck cut away to show the cases', 'Cases waiting on the dock'] },
    { icon: '🍃', label: 'Light glass', on: { opt: { glass: 'light' } }, off: { opt: { glass: 'standard' } }, note: 'glass', act: ['Lighter bottles on the line', 'Standard bottles on the line'] },
  ],
  '08': [
    { icon: '⬇', label: 'Stockroom', on: { explode: true }, off: { explode: false }, note: 'stock', act: ['Floors unfolded · FIFO pallets below', 'Floors folded'] },
    { icon: '📦', label: 'Restock', on: { opt: { restock: 'on' }, explode: true }, off: { opt: { restock: 'off' } }, note: 'restock', act: ['Gap on the wall · the 1st pallet supplies it', 'Walls full'] },
    { icon: '💧', label: 'Round-up', on: { opt: { roundup: 'on' } }, off: { opt: { roundup: 'off' } }, note: 'roundup', act: ['Round-up jar on the counter', 'Jar put away'] },
  ],
  '09': [
    { label: 'Service', options: [{ icon: '💧', label: 'Water', set: { state: 'water' }, note: 'water', act: 'Water poured first' }, { icon: '🍷', label: 'Wine', set: { state: 'wine' }, note: 'pour', act: 'Wine poured · a third of the glass' }, { icon: '🧺', label: 'Clear', set: { state: 'clear' }, note: 'clear', act: 'Cleared · reset for the next table' }] },
    { icon: '🧊', label: 'Ice + water', on: { opt: { ice: 'water' } }, off: { opt: { ice: 'dry' } }, note: 'ice', act: ['Ice and water · chills faster', 'Ice only · slower chill'] },
  ],
};

const CAM = { '01': { U: 12.2, OY: 28 }, '05': { U: 12.2, OY: 30 }, '08': { U: 12.2, OY: 30 } };
export function sceneSVG(id, { labels = true, title = '' } = {}) {
  beginScene();
  const cam = CAM[id] || {};
  U = cam.U ?? 14; OY = cam.OY ?? 46;
  const { it, labels: lb = [], ulabels = [], bg = PAL.mint, under, state, far = 'hills', farC, opts = {} } = SCENES[id]();
  it.sort((a, b) => a.d - b.d);
  const base = it.filter(i => i.d <= -50), rest = it.filter(i => i.d > -50);
  const [, gy] = P(8, 8, under ? -3.2 : -0.95);
  const top = base.map(i => i.s).join('') +
    `<g fill="${LINE}" opacity=".2" filter="url(#${CUR.k}b)">${CUR.shadows.join('')}</g>` +
    rest.map(i => i.s).join('') + (labels ? `<g class="labels">${lb.join('')}</g>` : '');
  let lower = '';
  if (under) {
    under.it.sort((a, b) => a.d - b.d);
    lower = `<g class="layer lo">${under.it.map(i => i.s).join('')}</g>`;
  }
  const out = `<svg xmlns="${NS}" class="scene${under ? ' stacked' : ''}" data-scene="${id}"${state ? ` data-state="${state}"` : ''}${Object.entries(opts).map(([k, v]) => ` data-o-${k}="${v}"`).join('')} viewBox="-12 -4 264 198" role="img" aria-label="${title}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">` +
    defs() +
    `<circle cx="120" cy="84" r="80" fill="${bg}" opacity=".55"/>` +
    `<circle cx="120" cy="84" r="80" fill="url(#${CUR.k}v)" opacity=".5"/>` +
    backdrop(far, farC) +
    `<ellipse cx="128" cy="${f(gy + 10)}" rx="112" ry="12" fill="${LINE}" opacity=".07" filter="url(#${CUR.k}s)"/>` +
    `<ellipse cx="126" cy="${f(gy + 6)}" rx="86" ry="6.5" fill="${LINE}" opacity=".1" filter="url(#${CUR.k}b)"/>` +
    lower +
    (under ? `<g class="layer hi" style="--lift:-3px;--open:-${under.open}px">${top}</g>` : top) +
    `<rect class="mood" x="-12" y="-4" width="264" height="198" fill="url(#${CUR.k}m)" pointer-events="none"/>` +
    (under && labels ? `<g class="labels lo">${ulabels.join('')}</g>` : '') + `</svg>`;  // lower pins stay on top so they remain clickable
  CUR = null; U = 14; OY = 46;
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
