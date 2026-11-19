// Sip-Stack · Village — a procedural Three.js wine-coast teaching diorama.
// Original Sip Studies work. Lazy-loaded by sip-app.js only when the Village tab opens.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { surface, breeze } from '../village/surfaces.js';
import { roofTile, blade, stone, vineLeaf, flowerSpray, layTiles, landscape } from '../village/landscape.js';
import { harbor, swell } from '../village/harbor.js';
import { coastalLight } from '../village/light.js';
import { autoTier, pipeline } from '../village/renderer.js';
import { duration, chapters, chapter, pose } from '../village/camera.js';
import { PINS, LANES, LANE_X } from './sip-village-content.js';
import { peopleNav } from '../life/nav.js';
import { villageLife } from '../life/village.js';
import { cutter, crate, clothPanel, tableService } from '../life/harbor.js';
import { wind } from '../life/forms.js';
import { primePeople, finishPeople, restorePeople } from '../life/scene-people.js';
import { warmShaders } from './sip-warm.js';

const motionMQ = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => motionMQ.matches;
const $ = (s, r = document) => r.querySelector(s);
const PI = Math.PI;

/* ---------- small helpers ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261103);
const col = (hex, dl = 0, ds = 0) => new THREE.Color(hex).offsetHSL(0, ds, dl);
const jit = (hex, a = .03) => col(hex, (R() - .5) * a * 2, (R() - .5) * a);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/* ---------- shared geometry + materials ---------- */
const G = {
  stone, tile: roofTile(), blade: blade(), spire: new THREE.ConeGeometry(1,1,4), leaf: vineLeaf(), spray: flowerSpray(), crown:new THREE.IcosahedronGeometry(1,1),
  box: new THREE.BoxGeometry(1, 1, 1),
  rock: new THREE.IcosahedronGeometry(1, 1),
  ball: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 14),
  roof: (() => { const s = new THREE.Shape(); s.moveTo(-.5, 0); s.lineTo(.5, 0); s.lineTo(0, 1); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -.5); return g; })(),
};
const M = {
  std: surface('mineral'), plaster: surface('plaster'), wood: surface('wood'), stone: surface('stone'),
  tile: surface('tile'), foliage: surface('leaf'), grass: surface('grass'),
  rock: surface('stone'),
  leaf: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .9, flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .35, metalness: .55 }),
  winDark: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .3 }),
  winLit: new THREE.MeshStandardMaterial({ color: '#fff', roughness: .3, emissive: '#ffbe62', emissiveIntensity: 0 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf86', emissiveIntensity: 0 }),
};
M.blades=surface('leaf'); M.blades.vertexColors=true;
M.flower=new THREE.MeshStandardMaterial({roughness:.92,vertexColors:true,side:THREE.DoubleSide});
M.blades.side = M.grass.side = M.tile.side = THREE.DoubleSide;
const KIND = { plaster:['box','plaster'], wood:['box','wood'], rail:['box','metal'], stone:['stone','stone'],
  tile:['tile','tile'], foliage:['crown','foliage'], leaf:['leaf','blades'], flower:['spray','flower'], grass:['blade','grass'], spire:['spire','tile'], box: ['box', 'std'], rock: ['rock', 'rock'], ball: ['ball', 'leaf'], cyl: ['cyl', 'std'], cone: ['cone', 'std'], roof: ['roof', 'std'], metal: ['cyl', 'metal'], winDark: ['box', 'winDark'], winLit: ['box', 'winLit'], lamp: ['ball', 'lamp'] };

// Kit collects many small parts and turns each kind into one InstancedMesh (few draw calls).
class Kit {
  constructor(nav,frame) { this.items = {}; this.nav = nav; this.frame=frame; this.tag = null; }
  push(kind, p, s, c, r) {
    (this.items[kind] ||= []).push([p, s, c, r]);
    if (!this.nav || !this.tag) return;
    const [x,y,z]=p, [w,h,d]=s;
    if (kind === 'cyl' || kind === 'metal' || kind === 'cone') {
      if (r && Math.abs(r[0])>1.4) this.nav.box(this.tag,x,z,w,h/2,y-w,y+w);
      else this.nav.circle(this.tag,x,z,w,y-h/2,y+h/2);
    } else if (['wood','box','rail'].includes(kind)) {
      const pitch=Math.abs(r?.[0] || 0), cy=Math.cos(pitch), sy=Math.sin(pitch);
      this.nav.box(this.tag,x,z,w/2,(d*cy+h*sy)/2,y-(h*cy+d*sy)/2,y+(h*cy+d*sy)/2,r?.[1] || 0);
    }
  }
  floor(name,x0,x1,y0,y1,z0,z1,color,tread=false) {
    const tag=this.tag; this.tag=null;
    this.box(x0,x1,y0,y1,z0,z1,color);
    this.tag=tag;
    this.nav.surface(name,x0,x1,z0,z1,y1,tread,this.frame);
  }
  box(x0, x1, y0, y1, z0, z1, c, kind = 'box') { this.push(kind, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], c); }
  ball(x, y, z, r, c, sy = 1) { this.push(C.bloom.includes(c) ? 'flower' : 'ball', [x, y, z], [r, r * sy, r], c); }
  cyl(x, y, z, r, h, c, rot, kind = 'cyl') { this.push(kind, [x, y, z], [r, h, r], c, rot); }
  build(parent) {
    const o = new THREE.Object3D();
    for (const [kind, list] of Object.entries(this.items)) {
      if(kind==='leaf' || kind==='foliage') {
        const random=rng(257);
        for(let i=list.length-1;i>0;i--) {
          const j=Math.floor(random()*(i+1)), item=list[i];
          list[i]=list[j];list[j]=item;
        }
      }
      const [g, m] = KIND[kind];
      const mesh = new THREE.InstancedMesh(G[g], M[m], list.length);
      list.forEach(([p, s, c, r], i) => {
        o.position.set(...p); o.scale.set(...s); o.rotation.set(...(r || [0, 0, 0])); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c instanceof THREE.Color ? c : new THREE.Color(c));
      });
      mesh.castShadow = !/^win|lamp/.test(kind); mesh.receiveShadow = true; mesh.frustumCulled = false;
      if (kind === 'foliage' || kind === 'grass' || kind === 'leaf') mesh.userData.detail = kind;
      if (kind === 'grass' || kind === 'leaf' || kind === 'rail') mesh.castShadow = false;
      parent.add(mesh);
    }
    return parent;
  }
}

/* ---------- palette ---------- */
const C = {
  rock: '#a59d91', rockDark: '#8a8277', pave: '#cfc0a2', sand: '#d2b07a', soil: '#8a5a3c', bed: '#6e6157',
  topsoil: '#5d4230', subsoil: '#a8784e', vine: '#5f8a3c', vineDark: '#47702f', grape: '#4b2340', terra: '#b9603a',
  shutter: '#4f7d5b', bloom: ['#c23b7a', '#d94f8f', '#a8326a', '#e06aa0'], green: '#557f3d', wood: '#9a6b42', steel: '#c9d1d4',
};

/* ---------- builders ---------- */
function house(k, { x, z, w, d, base, floors, color, bloom, seed }) {
  const r = rng(seed), fh = 1.05, h = floors * fh + .25, top = base + h;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  k.box(x0, x1, base, top, z0, z1, jit(color, .015), 'plaster');
  k.box(x0 - .02, x1 + .02, base, base + .3, z0 - .02, z1 + .02, col(color, -.12));
  k.box(x0 - .05, x1 + .05, top - .1, top + .03, z0 - .05, z1 + .05, col(color, .07));
  const ov = .2, rh = Math.min(w, d) * .3;
  if (w >= d) k.push('roof', [x, top + .03, z], [d + ov * 2, rh, w + ov * 2], col(color,-.04), [0, PI / 2, 0]);
  else k.push('roof', [x, top + .03, z], [w + ov * 2, rh, d + ov * 2], col(color,-.04));
  layTiles(k,x,top+.03,z,w+ov*2,d+ov*2,rh,w>=d,r);
  if (r() < .8) k.box(x1 - .6, x1 - .3, top, top + rh + .35, z - .15, z + .15, col(color, -.05));
  const cols = Math.max(2, Math.floor(w / .78)), step = w / cols, door = Math.floor(cols / 2);
  const sh = ['#365c51','#566641','#486259','#53635b','#516b5d'][seed%5];
  for (let f = 0; f < floors; f++) {
    const wy = base + .32 + f * fh + .5;
    for (let c = 0; c < cols; c++) {
      const wx = x0 + step * (c + .5);
      if (f === 0 && c === door) { k.box(wx - .2, wx + .2, base + .02, base + .82, z1, z1 + .04, r() < .5 ? '#3f5f4b' : '#6a4630','wood');
        for(let n=0;n<5;n++) k.box(wx-.15+n*.074,wx-.142+n*.074,base+.06,base+.77,z1+.04,z1+.054,'#46392c');
        k.box(wx-.24,wx+.24,base,base+.08,z1+.02,z1+.19,'#aa9983'); continue; }
      k.box(wx-.188,wx+.188,wy+.236,wy+.286,z1,z1+.06,col(color,.07));
      k.box(wx - .15, wx + .15, wy - .23, wy + .23, z1, z1 + .03, '#40494c', r() < .5 ? 'winLit' : 'winDark');
      if (r() < .18) k.box(wx - .17, wx + .17, wy - .25, wy + .25, z1, z1 + .05, sh);
      else { k.box(wx - .32, wx - .17, wy - .25, wy + .25, z1, z1 + .045, sh); k.box(wx + .17, wx + .32, wy - .25, wy + .25, z1, z1 + .045, sh); }
      for(const side of [-1,1]) for(let j=0;j<5;j++) k.push('wood',[wx+side*.244,wy-.168+j*.082,z1+.055],[.126,.028,.033],sh,[-.19,0,0]);
      k.box(wx-.012,wx+.012,wy-.23,wy+.23,z1+.031,z1+.042,'#ad987d');
      k.box(wx-.15,wx+.15,wy-.045,wy-.025,z1+.031,z1+.042,'#a99880');
      k.box(wx - .2, wx + .2, wy - .29, wy - .25, z1, z1 + .09, '#ece3d1');
      if (r() < .22) { k.box(wx - .18, wx + .18, wy - .38, wy - .29, z1 + .02, z1 + .14, C.terra); for (let i = 0; i < 3; i++) k.ball(wx - .12 + i * .12, wy - .27, z1 + .1, .07, C.bloom[i % 4]); }
    }
    if (f > 0 && r() < .3) {
      k.box(x0 + .15, x1 - .15, wy - .44, wy - .38, z1, z1 + .38, '#d9cfbb');
      for (const ry of [wy-.35,wy-.13]) k.box(x0+.15,x1-.15,ry,ry+.031,z1+.34,z1+.38,'#373631','rail');
      for(let bx=x0+.17;bx<x1-.15;bx+=.16) k.push('rail',[bx,wy-.235,z1+.36],[.025,.26,.028],'#423e31',[0,0,.05*Math.sin(bx*8)]);
      for(const bx of [x0+.16,x1-.16]) k.push('rail',[bx,wy-.12,z1+.19],[.032,.032,.38],'#353830');
      for (let i = 0; i < 4; i++) k.ball(x0 + .3 + r() * (w - .6), wy - .3, z1 + .26, .09 + r() * .05, r() < .5 ? C.bloom[i % 4] : C.green);
    }
    for (const sx of [x0, x1]) {
      if (r() < .13) continue;
      const nz = Math.max(1, Math.floor(d / 1.1));
      for (let c = 0; c < nz; c++) {
        const wz = z0 + (d / nz) * (c + .5), s = sx === x1 ? 1 : -1;
        k.box(sx + s * .0, sx + s * .03, wy - .23, wy + .23, wz - .15, wz + .15, '#40494c', r() < .45 ? 'winLit' : 'winDark');
        for(const sign of [-1,1]) for(let j=0;j<5;j++) k.push('wood',[sx+s*.055,wy-.164+j*.081,wz+sign*.245],[.039,.027,.124],sh,[0,0,s*.18]);
        k.box(sx,sx+s*.11,wy-.28,wy-.235,wz-.19,wz+.19,'#bdaf93');
        k.box(sx+s*.031,sx+s*.043,wy-.23,wy+.23,wz-.011,wz+.011,'#93876e');
        k.box(sx, sx + s * .045, wy - .25, wy + .25, wz - .32, wz - .17, sh); k.box(sx, sx + s * .045, wy - .25, wy + .25, wz + .17, wz + .32, sh);
      }
    }
  }
  for(let f=0;f<floors;f++) for(let i=0;i<cols;i++) {
    const xx=x0+(i+.5)*step,yy=base+.8+f*fh;
    k.box(xx-.16,xx+.16,yy-.26,yy+.24,z0-.033,z0,'#323f3e','winDark');
    for(const sign of [-1,1]) k.push('wood',[xx+sign*.24,yy-.01,z0-.04],[.14,.52,.048],sh);
    k.box(xx-.19,xx+.19,yy-.29,yy-.25,z0-.11,z0,'#cbbea4');
  }
  // Patinated rainwater stack, sill brackets and the stone corbels under the eaves.
  k.cyl(x1-.08,base+h*.5,z1+.064,.035,h,'#735d48');
  for(let f=0;f<floors;f++) k.cyl(x1-.08,base+f*fh+.41,z1+.064,.042,.052,'#4d483b');
  for(let j=0;j<cols*2;j++) k.push('stone',[x0+(j+.5)*w/(cols*2),top-.13,z1+.051],[.080,.14,.13],'#cec0a0');
  if (bloom) {
    const bx = bloom > 0 ? x1 - .25 : x0 + .25;
    for(let j=0;j<48;j++) {
      const t=j/48,xx=bx+.16*Math.sin(t*13)+.23*Math.sin(t*5)+(r()-.5)*.46;
      k.push('leaf',[xx,base+.15+t*(h-.35),z1+.105+r()*.065],[.072,.12,.055],j%5?'#546644':'#a64655',[r(),r()*4,r()]);
    }
    for (let i=0;i<32;i++) k.push('flower',[bx+(r()-.5)*.48,base+.3+i*h/38,z1+.14+r()*.08],[.15,.17,.11],C.bloom[i%4],[0,r()*.8-.4,r()*3]);
  }
  return top;
}

function vineRow(kFor, z, top, x0, x1) {
  for (let x = x0; x <= x1 + 1e-6; x += .6) {
    const k = kFor(x);
    k.cyl(x, top + .25, z, .035, .5, '#5b4128');
    for(let n=0;n<50;n++) {
      const dx=(R()-.5)*.66,dy=R()*.31,dz=(R()-.5)*.32;
      k.push('leaf',[x+dx,top+.45+dy,z+dz],[.19,.21,.17],jit(n%4?'#57733c':'#89964e',.055),[R()*1.25-.48,R()*6.28,R()*1.5-.75]);
    }
    for (const dx of [-.13,.14]) for(let j=0;j<8;j++) {
      const a=j*2.4,rad=.055*(1-j/10);
      k.ball(x+dx+Math.cos(a)*rad,top+.52-j*.018,z+.12+Math.sin(a)*rad,.035,j%3?'#503348':'#71465c');
    }
  }
  for (const px of [x0 - .3, x1 + .3]) kFor(px).cyl(px, top + .45, z, .04, .9, '#7d6a55');
  for(let px=x0+.9;px<x1;px+=1.8) kFor(px).cyl(px,top+.42,z-.03,.026,.84,'#877352',[0,0,.045*Math.sin(px)]);
  for(let px=x0;px<x1;px+=.6) {
    const end=Math.min(px+.6,x1); kFor((px+end)/2).push('rail',[(px+end)/2,top+.72,z],[(end-px),.018,.021],'#594f3f');
  }
  // drip line + emitters (infrastructure, always there)
  const kL = kFor(x0), kR = kFor(x1), split = kL !== kR;
  const mid = split ? 6 : x1 + .3;
  if (split) { kL.box(x0 - .3, 6, top + .02, top + .06, z + .12, z + .16, '#26292b'); kR.box(6, x1 + .3, top + .02, top + .06, z + .12, z + .16, '#26292b'); }
  else kL.box(x0 - .3, x1 + .3, top + .02, top + .06, z + .12, z + .16, '#26292b');
  kL.box(x0 - .3, mid, top + .54, top + .56, z - .01, z + .01, '#3a3a36');
  if (split) kR.box(6, x1 + .3, top + .54, top + .56, z - .01, z + .01, '#3a3a36');
}

function rocksAlong(k, axis, fixed, a0, a1, y0, y1, n, scale = 1) {
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, R()), y = lerp(y0, y1, R()), s = (.22 + R() * .37) * scale;
    const p = axis === 'x' ? [a, y, fixed - .10 + (R() - .3) * .18] : [fixed + (R() - .3) * .25, y, a];
    k.push('rock', p, [s * (1 + R() * .5), s * (.7 + R() * .4), s], jit(R() < .5 ? C.rock : C.rockDark, .05), [R() * 3, R() * 3, R() * 3]);
  }
}

/* ---------- the village ---------- */
function buildWorld(scene) {
  const nav = peopleNav(scene,'.vl-stage'), k = new Kit(nav), slab = new THREE.Group(), ks = new Kit(nav,slab);
  const kFor = x => (x >= 6 ? ks : k);
  const dyn = { canvas: [] };

  // strata under everything (the cutaway block)
  k.box(-10, 10, -3, -2.1, -10, 10, C.bed);
  k.box(-10, 10, -2.1, -1.25, -10, 10, C.soil);
  k.box(-10, 10, -1.25, -.9, -10, 10, C.sand);
  for (let i = 0; i < 70; i++) { const x = lerp(-9.8, 9.8, R()), z = R() < .5 ? 10 : -10; k.push('rock', [x, lerp(-2.9, -1.4, R()), z], [.12 + R() * .15, .1, .08], jit('#9b8a76', .08), [R(), R(), R()]); }
  for (let i = 0; i < 40; i++) { const z = lerp(-9.8, 9.8, R()); k.push('rock', [10, lerp(-2.9, -1.4, R()), z], [.08, .1, .12 + R() * .15], jit('#9b8a76', .08), [R(), R(), R()]); }

  // terraces: quay A, B (houses + cantina yard), C (houses + vines), D (houses + vines)
  k.box(-10, 10, -.9, 1, -1.5, 1.5, C.rock); k.floor('terrace',-10, 10, 1, 1.05, -1.5, 1.5, C.pave);
  k.box(-10, 10, -.9, 3, -4.5, -1.5, C.rock); k.floor('terrace',-10, 2, 3, 3.05, -4.5, -1.5, C.pave); k.floor('terrace',2, 10, 3, 3.04, -4.5, -1.5, '#d8c9ab');
  k.box(-10, 2, -.9, 5, -7.5, -4.5, C.rock); k.floor('terrace',-10, 2, 5, 5.05, -7.5, -4.5, C.pave);
  k.box(2, 10, -.9, 4.5, -7.5, -4.5, C.rock); k.box(2, 10, 4.5, 4.62, -7.5, -4.5, C.subsoil); k.floor('terrace',2, 10, 4.62, 5, -7.5, -4.5, C.topsoil);
  k.box(-10, 2, -.9, 7, -10, -7.5, C.rock); k.floor('terrace',-10, 2, 7, 7.05, -10, -7.5, C.pave);
  // D vines: layered so the cut face reads as strata (static half x2..6, sliding slab x6..10)
  for (const [kk, a, b] of [[k, 2, 6], [ks, 6, 10]]) {
    kk.box(a, b, -.9, 4.6, -10, -7.5, C.rock);
    kk.box(a, b, 4.6, 6.2, -10, -7.5, C.subsoil);
    kk.floor('terrace',a, b, 6.2, 7, -10, -7.5, C.topsoil);
    for (let i = 0; i < 26; i++) kk.push('rock', [lerp(a + .2, b - .2, R()), lerp(4.7, 6.1, R()), R() < .5 ? -7.5 : -10], [.12 + R() * .12, .1, .1], jit('#bfa98a', .06), [R(), R(), R()]);
  }
  for (let i = 0; i < 16; i++) ks.push('rock', [10, lerp(4.7, 6.1, R()), lerp(-9.8, -7.7, R())], [.1, .1, .12 + R() * .12], jit('#bfa98a', .06), [R(), R(), R()]);
  // roots on the inner cut face (visible once the slab slides out)
  for (const z of [-8.1, -8.9, -9.6]) {
    k.box(5.95, 6.04, 4.2, 6.95, z - .03, z + .03, '#e2cfa8');
    for (let i = 0; i < 5; i++) { const y = lerp(4.5, 6.6, R()), L = .4 + R() * .5, s = R() < .5 ? -1 : 1; k.push('box', [6.0, y, z + s * L * .35], [.08, .035, L], '#d9c39a', [s * (.6 + R() * .4), 0, 0]); }
  }

  // cliff faces
  rocksAlong(k, 'x', 1.55, -10, 2.7, -.7, .8, 40); rocksAlong(k, 'x', 1.55, 4.9, 10, -.7, .8, 22);
  // The quay is revetted. Exposed boulders belong at the tidal foot of the wall.

  rocksAlong(k, 'z', 10.05, -7.5, 1.5, -.5, 2.8, 34, .7); rocksAlong(k, 'z', 10.05, -7.4, -4.6, 3, 4.6, 10, .8);
  rocksAlong(k, 'z', -10.05, -10, 1.5, -.5, 2.8, 26); rocksAlong(k, 'z', -10.05, -10, -1.5, 3, 6.5, 16);
  // dry-stone walls on vine terraces


  // seabed
  for (let i = 0; i < 46; i++) k.push('rock', [lerp(-9.6, 9.6, R()), -.85, lerp(2, 9.6, R())], [.15 + R() * .35, .12 + R() * .2, .15 + R() * .3], jit('#a99a84', .08), [R(), R(), R()]);
  for (let i = 0; i < 60; i++) { const x = lerp(-9.6, 9.6, R()), z = lerp(2, 9.6, R()), h = .2 + R() * .45; k.cyl(x, -.9 + h / 2, z, .025, h, jit('#4d7a4a', .08), [(R() - .5) * .4, 0, (R() - .5) * .4]); }

  // stairs between levels (x .8..1.8)
  for (const [y0, y1, zs] of [[1, 3, .1], [3, 5, -2.9], [5, 7, -5.9]]) {
    const n = 8, dz = 1.6 / n;
    for (let i = 0; i < n; i++) k.floor('stair tread',.8, 1.8, y0, y0 + (i + 1) * (y1 - y0) / n, zs - (i + 1) * dz, zs - i * dz, jit('#c9b99b', .03),true);
    k.tag='stair rail';
    k.box(1.8, 1.9, y0, y1 + .25, zs - 1.6, zs, '#b3a58c');
    k.tag=null;
  }

  // houses (left side, stepping up the hill)
  const H = [
    { x: -8.65, z: -3.1, w: 2.6, d: 2.6, base: 3, floors: 3, color: '#e3a07a', bloom: 1 },
    { x: -6.0, z: -3.0, w: 2.5, d: 2.8, base: 3, floors: 4, color: '#e8c27c' },
    { x: -3.45, z: -3.1, w: 2.4, d: 2.6, base: 3, floors: 3, color: '#a9b8c9', bloom: -1 },
    { x: -.95, z: -3.0, w: 2.3, d: 2.8, base: 3, floors: 4, color: '#efc98f' },
    { x: -8.1, z: -6.1, w: 3.2, d: 2.6, base: 5, floors: 4, color: '#f0d39a' },
    { x: -4.8, z: -6.0, w: 2.9, d: 2.8, base: 5, floors: 5, color: '#e7a98c', bloom: 1 },
    { x: -1.65, z: -6.1, w: 2.6, d: 2.6, base: 5, floors: 3, color: '#9fb0c2' },
    { x: -7.3, z: -8.85, w: 3.0, d: 2.2, base: 7, floors: 4, color: '#e2b47a' },
    { x: -3.7, z: -8.85, w: 3.4, d: 2.2, base: 7, floors: 5, color: '#e59a7c' },
    { x: -.35, z: -8.85, w: 2.5, d: 2.2, base: 7, floors: 3, color: '#f2dcae', bloom: 1 },
  ];
  H.forEach((h, i) => {
    nav.box('house '+(i+1),h.x,h.z,h.w/2,h.d/2,h.base,h.base+h.floors*1.05);
    house(k, { ...h, seed: 100 + i * 17 });
  });

  // Maritime pines with forked limbs and layered, windswept crowns.
  const pine = (x, y, z, s = 1) => {
    nav.circle('pine',x,z,.16*s,y,y+2.2*s);
    k.cyl(x, y + 1.1 * s, z, .1 * s, 2.2 * s, '#6b4b33', [.12, 0, -.1]);
    for(let i=0;i<8;i++) {
      const a=i*2.40, arm=(.34+R()*.39)*s, dx=Math.cos(a),dz=Math.sin(a);
      k.cyl(x+arm*dx*.52,y+1.87*s,z+arm*dz*.52,.058*s,.96*s,'#74644d',[dz*.69,0,-dx*.69]);
      for(let j=0;j<11;j++) {
        const radius=(.19+R()*.21)*s;
        k.push('foliage',[x+arm*dx+(R()-.5)*.53*s,y+(2.2+R()*.37)*s,z+arm*dz+(R()-.5)*.53*s],
          [radius,radius*.71,radius],j%3?'#435b41':'#627453',[R(),R()*3,R()]);
      }
    }
  };
  pine(-9.2, 7, -9.3, 1.1); pine(1.4, 7, -9.5, .95); pine(9.4, 3, -2.0, .8);
  k.push('cone', [-9.6, 2.4, -1.15], [.32, 2.7, .32], '#3f5e36'); k.cyl(-9.6, 1.2, -1.15, .06, .4, '#6b4b33');

  // ---- cantina yard: five making lanes, each behind its own door ----
  dyn.doors = {}; dyn.glow = {};
  Object.entries(LANE_X).forEach(([lane, c]) => {
    const lc = LANES[lane].color;
    k.floor('making lane',c - .7, c + .7, 3.04, 3.06, -4.45, -2.2, col(lc, .18));
    k.tag='lane wall and door frame';
    k.box(c + .78, c + .82, 3.04, 3.3, -4.45, -2.6, '#b8aa90');
    k.box(c - .5, c + .5, 3, 4.5, -4.53, -4.4, '#ddd0b6');
    k.box(c - .38, c + .38, 3, 4.32, -4.47, -4.39, '#2b201a');
    k.cyl(c, 4.75, -4.38, .17, .05, lc, [PI / 2, 0, 0]);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(.7, 1.25), new THREE.MeshBasicMaterial({ color: col(lc, .1), transparent: true, opacity: 0 }));
    glow.position.set(c, 3.66, -4.385); scene.add(glow); dyn.glow[lane] = glow;
    const pivot = new THREE.Group(); pivot.position.set(c - .38, 3, -4.36);
    nav.box(lane+' door',.378,.02,.378,.052,.01,1.30,0,pivot);
    const door=new Kit();
    for(let j=0;j<6;j++)door.box(j*.126,j*.126+.122,.011,1.29,-.023,.023,col(lc,(j%3-1)*.018),'wood');
    for(const y of [.21,1.05]){
      door.box(.012,.733,y,y+.082,.023,.064,'#725c45','wood');
      door.box(.006,.28,y+.024,y+.057,.067,.078,'#474842','rail');
    }
    door.box(.644,.682,.54,.69,.026,.041,'#786448','rail');
    door.push('ball',[.669,.617,.06],[.033,.027,.041],'#926c44');
    door.build(pivot);
    scene.add(pivot); dyn.doors[lane] = pivot;
  });
  k.tag='press and tank';
  { // white: basket press + small steel tank
    const c = LANE_X.white;
    k.cyl(c - .25, 3.3, -3.4, .3, .5, '#b58a5a'); for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; k.box(c - .25 + Math.cos(a) * .3 - .02, c - .25 + Math.cos(a) * .3 + .02, 3.05, 3.56, -3.4 + Math.sin(a) * .3 - .02, -3.4 + Math.sin(a) * .3 + .02, '#7b5534'); }
    k.cyl(c - .25, 3.6, -3.4, .32, .06, '#6f4a2c'); k.cyl(c - .25, 3.95, -3.4, .03, .7, '#55565a', null, 'metal');
    k.cyl(c + .38, 3.5, -3.9, .2, .9, C.steel, null, 'metal'); k.push('cone', [c + .38, 4.02, -3.9], [.2, .14, .2], '#b9c1c4');
  }
  { const c = LANE_X.rose; for (const [dx, dz] of [[-.28, -3.8], [.28, -3.5]]) { k.cyl(c + dx, 3.55, dz, .2, 1, C.steel, null, 'metal'); k.cyl(c + dx, 3.7, dz, .205, .12, '#e49a9a'); k.push('cone', [c + dx, 4.1, dz], [.2, .12, .2], '#b9c1c4'); } }
  k.tag='red vat';
  { const c = LANE_X.red; k.cyl(c, 3.33, -3.65, .45, .6, '#8a5a36'); k.cyl(c, 3.335, -3.65, .46, .07, '#4b4b4b'); k.cyl(c, 3.62, -3.65, .42, .04, '#4a1622'); }
  k.tag='bottle rack';
  { const c = LANE_X.sparkling;
    for (const s of [-1, 1]) { k.push('box', [c, 3.5, -3.55 + s * .17], [1.0, .95, .06], '#a07a50', [s * .32, 0, 0]);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const y = 3.2 + j * .27; k.ball(c - .36 + i * .24, y, -3.55 + s * .23 + (y - 3.5) * Math.sin(s * .32), .045, '#22402c'); } }
  }
  k.tag='barrel';
  { const c = LANE_X.fortified;
    [[3, 3.22], [2, 3.62], [1, 4.02]].forEach(([n, y]) => { for (let i = 0; i < n; i++) { const x = c + (i - (n - 1) / 2) * .42; k.cyl(x, y, -3.7, .2, .5, '#7b4a2a', [PI / 2, 0, 0]); k.cyl(x, y, -3.7, .205, .05, '#3d3a36', [PI / 2, 0, 0]); } });
    k.cyl(c - .5, 3.25, -2.8, .1, .38, '#c7a15a');
  }
  k.tag='yard lamp and cistern';
  // yard lamp
  k.cyl(5.3, 3.75, -2.1, .03, 1.5, '#2f2f2c'); k.push('lamp', [5.3, 4.55, -2.1], [.11, .11, .11], '#fff');
  k.cyl(9.4, 3.35, -2.25, .32, .7, '#b9c6c3'); // yard cistern

  k.tag=null;
  // ---- quay: café terrace, crates, rinse corner ----
  k.floor('cantina',-9.7, -5, 1.05, 1.1, -1.4, 1.4, '#c98b6b');
  for (let x = -9.6; x < -5; x += .5) k.ball(x, 1.25, 1.35, .14 + R() * .06, R() < .6 ? C.bloom[Math.floor(R() * 4)] : C.green);
  const table = (x, z, umbrella) => {
    nav.circle('café table',x,z,.42,1.10,1.825);
    k.cyl(x, 1.45, z, .04, .7, '#3a3733'); k.cyl(x, 1.8, z, .42, .05, '#f3eee4');
    for (const [dx, dz] of [[-.55, 0], [.55, 0], [0, -.55]]) { nav.box('café chair',x+dx,z+dz,.14,.14,1.10,1.8); k.box(x+dx-.14,x+dx+.14,1.44,1.50,z+dz-.13,z+dz+.13,'#547264','wood');
      for(const sx of [-.10,.10]) for(const sz of [-.10,.10]) k.push('wood',[x+dx+sx,1.285,z+dz+sz],[.028,.36,.029],'#655a45'); k.box(x + dx - .13, x + dx + .13, 1.5, 1.8, z + dz - .14, z + dz - .1, '#2f5b52'); }
    if (umbrella) { k.cyl(x, 2.3, z, .03, 1.5, '#f3eee4'); k.push('cone', [x, 3.05, z], [.95, .45, .95], '#f7f2e8'); k.push('cone', [x, 2.95, z], [.97, .18, .97], '#914C2C'); }
  };
  // The café awning follows the quay frontage in alternating woven panels.
  for(let i=0;i<13;i++) {
    const ax=-9.8+i*.34;
    const panel=clothPanel(.343,.83,i%2?'#ece0c6':'#9a5141');
    panel.position.set(ax,3.34,-1.38); panel.rotation.x=-1.38;scene.add(panel);dyn.canvas.push(panel);
    const valance=clothPanel(.343,.115,i%2?'#e5d7bb':'#99513e');
    valance.position.set(ax,3.21,-.986);scene.add(valance);dyn.canvas.push(valance);
  }
  table(-8.6, .35, true); table(-8.3, -.85, true); table(-6.6, .5, false); table(-6.75, -.9, true);
  k.tag='lamp';
  k.cyl(-5.4, 1.9, -1.2, .03, 1.7, '#2f2f2c'); k.push('lamp', [-5.4, 2.8, -1.2], [.11, .11, .11], '#fff');
  k.tag='quay bollard';
  // bollards + crates + barrels near the quay edge
  for (const x of [-3.5, -.5, 2.5, 6, 9]) k.cyl(x, 1.25, 1.25, .12, .4, '#3d3b38');
  k.tag='quay barrel';
  for (const [x, z] of [[2.6, -.9], [3.0, -.9], [2.8, -1.2]]) k.cyl(x, 1.33, z, .17, .55, '#7b4a2a');
  k.tag='rinse equipment';
  // rinse corner: trough + settling tank
  k.box(7.6, 8.6, 1.05, 1.38, -1.25, -.7, '#9a948a'); k.box(7.65, 8.55, 1.3, 1.34, -1.2, -.75, '#7fbcc0');
  k.cyl(9.2, 1.6, -.9, .45, 1.1, '#b9c6c3', null, 'metal'); k.push('cone', [9.2, 2.25, -.9], [.45, .2, .45], '#9fb0b0');
  k.tag=null;
  // pier (L)
  k.box(3, 4.6, -.9, .95, 1.5, 7, '#b5a68b'); k.box(4.6, 9.3, -.9, .95, 5.6, 7, '#b5a68b');
  k.floor('pier',3, 4.6, .95, 1.0, 1.5, 7, '#cbbd9f'); k.floor('pier',4.6, 9.3, .95, 1.0, 5.6, 7, '#cbbd9f');
  k.tag='pier fitting';
  for (const [x, z] of [[3.15, 3], [4.45, 4.5], [6, 6.85], [8, 6.85], [9.15, 5.75]]) k.cyl(x, 1.15, z, .1, .3, '#3d3b38');
  for (let i = 0; i < 5; i++) k.box(4.6, 4.66, .2 + i * .18, .23 + i * .18, 3.6, 4.0, '#6b5a45');
  k.cyl(4.4, 1.85, 6.75, .03, 1.7, '#2f2f2c'); k.push('lamp', [4.4, 2.75, 6.75], [.11, .11, .11], '#fff');
  for (const [x, z] of [[3.05, 2.6], [4.55, 3.0], [5.6, 7.05], [7.6, 7.05]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(.17, .06, 6, 14), M.std); t.material = new THREE.MeshStandardMaterial({ color: '#222', roughness: .9 }); t.position.set(x, .7, z); t.rotation.y = Math.abs(x - 3.05) < .1 || Math.abs(x - 4.55) < .1 ? PI / 2 : 0; scene.add(t); }

  k.tag=null;
  // laundry lines
  dyn.laundry = [];
  const line = (xa, xb, y, z) => {
    k.box(xa, xb, y - .01, y + .01, z - .01, z + .01, '#efe8dc');
    for (let x = xa + .3; x < xb - .2; x += .42) {
      const p = new THREE.Group(); p.position.set(x, y, z);
      const cl = clothPanel(.28,.36,['#f4f1ea','#9fc3d6','#e7b3a3','#d8e6da','#e9d58f'][Math.floor(R()*5)]);
      cl.position.y = -.2; cl.castShadow = true; p.add(cl); scene.add(p); dyn.laundry.push(p);
    }
  };
  line(-9.7, -4.8, 5.9, -1.55); line(-6.4, -3.1, 8.5, -4.55); line(-5.2, -.8, 10.6, -7.6);

  const registerRow = (z,y) => {
    if(y<7) nav.box('vine row',6.1,z,3.92,.17,y,y+.88);
    else {
      nav.box('vine row',4.09,z,1.91,.17,y,y+.88);
      nav.box('vine row',8.01,z,2.01,.17,y,y+.88,0,slab);
    }
  };
  // vines on C and D (rows follow the terraces)
  // Leave turning space for a loaded picking basket between the two working rows.
  const harvestRows=[-5.16,-6.29,-7.0];
  for (const z of harvestRows) { registerRow(z,5); vineRow(() => k, z, 5, 2.5, 9.7); }
  for (const z of [-8.1, -8.9, -9.6]) { registerRow(z,7); vineRow(kFor, z, 7, 2.5, 9.7); }

  // drip effects (wet patches at each vine foot)
  dyn.dripA = new Kit(); dyn.dripB = new Kit();
  for (const [z, top] of [...harvestRows.map(z=>[z,5]),[-8.1,7],[-8.9,7],[-9.6,7]])
    for (let x = 2.5; x <= 9.71; x += .6) { const kk = x >= 6 && top === 7 ? dyn.dripB : dyn.dripA; kk.cyl(x, top + .015, z + .12, .3, .025, '#2e2620'); kk.ball(x + .12, top + .1, z + .16, .05, '#8fe0f0'); kk.ball(x - .1, top + .07, z + .16, .04, '#8fe0f0'); }
  const dripA = dyn.dripA.build(new THREE.Group()), dripB = dyn.dripB.build(new THREE.Group());
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#2c1d14', transparent: true, opacity: .55 }));
  bulb.scale.set(.5, .7, 1); bulb.rotation.y = PI / 2; bulb.position.set(6.06, 6.4, -8.9); dripA.add(bulb);
  dripA.visible = dripB.visible = false; scene.add(dripA); slab.add(dripB);
  dyn.drip = [dripA, dripB];

  k.tag='soil auger';
  // Equip-grade cues: auger on the soil terrace, picking bins, lab bench, barrel workbench.
  k.cyl(7.25, 7.48, -8.25, .028, .95, '#3e4246', null, 'metal');
  k.box(6.95, 7.55, 7.9, 7.98, -8.32, -8.18, '#914C2C');
  k.tag='picking bin';
  k.box(3.15, 3.55, 5.05, 5.32, -5.55, -5.2, '#b88a55');
  k.box(3.6, 4.0, 5.05, 5.28, -6.3, -5.95, '#a97a47');
  k.tag='workbench';
  k.box(7.5, 8.75, 3.04, 3.5, -2.15, -1.58, '#efe6d4');
  k.cyl(7.75, 3.64, -1.85, .07, .24, '#d8e6da', null, 'metal');
  k.cyl(8.05, 3.62, -1.78, .055, .18, '#f3e0d8', null, 'metal');
  k.box(8.3, 8.58, 3.5, 3.58, -2.05, -1.7, '#fffaf1');
  k.box(3.2, 4.45, 3.04, 3.46, -2.2, -1.58, '#8a5a36');
  k.cyl(3.55, 3.66, -1.88, .16, .46, '#7b4a2a', [PI / 2, 0, 0]);
  k.box(3.95, 4.28, 3.46, 3.54, -2.05, -1.72, '#c4a574');

  k.tag=null;
  landscape(scene,k,ks,R);
  k.build(scene); ks.build(slab); scene.add(slab); dyn.slab = slab;

  dyn.sea = harbor(scene);

  // boats
  dyn.boats = [];
  for (const [x, z, ry, c, s] of [[1.4, 3.2, .35, '#f4f1ea', '#2f6f9f'], [-2.6, 4.7, -.25, '#f4f1ea', '#914C2C'], [5.45, 3.6, PI / 2, '#eae4d6', '#1A5552'], [1.6, 7.2, .9, '#f4f1ea', '#2f6f9f'], [-6.8, 6.4, .4, '#efe9dc', '#3c7aa8'], [8.3, 8.05, 0, '#f6f2ea', '#1A5552'], [-3.6, 8.3, -.5, '#f4f1ea', '#914C2C']]) {
    const fittings = cutter(c,s), b=fittings.root; b.position.set(x, .3, z); b.rotation.y = ry; scene.add(b); b.name="Village boat "+(dyn.boats.length+1);dyn.boats.push({b,stroke:fittings.stroke,grips:fittings.grips,seat:fittings.seat,shafts:fittings.shafts,deckHeight:fittings.deckHeight});
    nav.box(b.name,0,0,1.1,.43,-.115,.375,0,b);
  }
  dyn.caseBoat = dyn.boats[5].b;
  // buoys
  dyn.buoys = [];
  for (const [x, z] of [[0, 8.9], [-4.3, 3.1], [7, 4.4], [-8.2, 8.3], [2.6, 5.2], [-1, 6], [6.4, 9.4]]) {
    const m=new THREE.Group(),shell=new THREE.Mesh(new THREE.LatheGeometry([[.035,-.155],[.075,-.11],[.096,-.04],[.091,.051],[.06,.1],[.025,.118]].map(([r,y])=>new THREE.Vector2(r,y)),16),new THREE.MeshStandardMaterial({color:'#c66d37',roughness:.64}));
    shell.castShadow=shell.receiveShadow=true;m.add(shell);
    const band=new THREE.Mesh(new THREE.CylinderGeometry(.095,.096,.031,16),new THREE.MeshStandardMaterial({color:'#e8d8bf'}));m.add(band);
    m.position.set(x,.58,z);scene.add(m);dyn.buoys.push(m);
  }

  // cases (move between quay and boat)
  dyn.cases = [];
  for (let i = 0; i < 8; i++) {
    const m=crate();scene.add(m);
    const qa = new THREE.Vector3(6.25 + (i % 2) * .42, 1.05 + Math.floor(i / 4) * .27, -.25 + (Math.floor(i / 2) % 2) * .34);
    const bo = new THREE.Vector3((i % 4 - 1.5) * .4, .42 + Math.floor(i / 4) * .27, ((i % 2) - .5) * .32);
    m.position.copy(qa); nav.box('wine case',0,0,.205,.156,-.009,.248,0,m); dyn.cases.push({ m, qa, bo });
  }

  // rinse loop: spill (off) vs. pipe loop (on)
  const spill = new THREE.Group();
  const sm = new THREE.MeshStandardMaterial({ color: '#7fb9c4', transparent: true, opacity: .8, roughness: .2 });
  const s1 = new THREE.Mesh(G.box, sm); s1.scale.set(.2, .03, 2.25); s1.position.set(8.1, 1.075, .38); spill.add(s1);
  const s2 = new THREE.Mesh(G.box, sm); s2.scale.set(.2, .5, .04); s2.position.set(8.1, .8, 1.53); spill.add(s2);
  const plume = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: '#8a7a5a', transparent: true, opacity: .45, depthWrite: false }));
  plume.rotation.x = -PI / 2; plume.scale.set(1.1, .7, 1); plume.position.set(8.1, .565, 2.4); spill.add(plume);
  scene.add(spill);
  const curve = new THREE.CatmullRomCurve3([[8.6, 1.3, -.95], [8.9, 1.5, -.95], [9.2, 2.3, -.9], [9.7, 2.6, -1.3], [9.75, 3.3, -1.6], [9.4, 3.7, -2.25]].map(p => new THREE.Vector3(...p)));
  const loop = new THREE.Group();
  const recycle=new THREE.MeshPhysicalMaterial({color:'#54a9a3',roughness:.23,clearcoat:.61});
  recycle.onBeforeCompile=shader=>{
    shader.uniforms.flowTime=breeze;
    shader.vertexShader='varying float pipeU;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npipeU=uv.x;');
    shader.fragmentShader='varying float pipeU;uniform float flowTime;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=.8+.52*pow(.5+.5*cos(44.*pipeU-flowTime*3.5),5.);');
  };
  loop.add(new THREE.Mesh(new THREE.TubeGeometry(curve,56,.046,10,false),recycle));
  loop.visible=false;scene.add(loop);dyn.rinse={spill,loop};
  dyn.pour=tableService(scene);

  // lamps (night)
  dyn.lamps = [[-5.4, 2.7, -1.0], [5.3, 4.4, -1.9], [4.4, 2.6, 6.6]].map(p => { const l = new THREE.PointLight('#ffc27a', 0, 9, 1.4); l.position.set(...p); scene.add(l); return l; });

  dyn.life=villageLife(scene,dyn.boats,swell,H,nav);
  return dyn;
}

/* ---------- public mount ---------- */
export function mountVillage(root, { onPin } = {}) {
  const stage = $('.vl-stage', root), pinsEl = $('.vl-pins', stage), note = $('.vl-note', root);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); }
  catch (e) { stage.classList.add('no-gl'); $('.vl-loading', stage).textContent = 'This browser could not start 3D. The pins below still open every note.'; }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(47, 1, .12, 390);
  const state = { drip: false, cut: false, reuse: false, loaded: false, pour: 0, door: null, light: 'golden', orbit: still(), pin: null };
  let dirty=true, warmed=false, contextGeneration=0;
  let shown = false, stageVisible = false, craftActive = document.body.dataset.craftVisible === 'true';
  const otherSceneActive = () => craftActive || document.body.dataset.creekVisible === 'true';
  const tw = {}; // tweens: key -> {from,to,t0,dur,apply}
  const tween = (key, from, to, dur, apply) => { if (still() || (shown && stageVisible && otherSceneActive())) { apply(to); delete tw[key]; return; } tw[key] = { from, to, t0: performance.now(), dur, apply }; };

  const deck=$('.vl-deck',root), track=$('.vl-track input',deck), clockLabel=$('.vl-track output',deck);
  const play=$('[data-act="play"]',deck), orbit=$('[data-act="orbit"]',deck), quality=$('.vl-quality',deck);
  const chapterLabel=$('.vl-chapter b',stage), status=$('.vl-loading',stage);
  let dyn, controls, hemi, sun, lighting, post, automatic, lost=false;
  let elapsed=0, playing=!still(), lastChapter=-1, lastSecond=-1, flightStamp=null;

  const HOME = { target: new THREE.Vector3(.4, 4.5, -2), theta: .53, phi: 1.12, r: 36 };
  if (renderer) {
    automatic=autoTier(renderer);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'vl-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    stage.prepend(renderer.domElement);
    hemi = new THREE.HemisphereLight('#fff', '#888', 1); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff', 2); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
    scene.add(sun, sun.target);
    dyn = buildWorld(scene);
    lighting=coastalLight(renderer,scene,hemi,sun,dyn.sea.uniforms,automatic);
    post=pipeline(renderer,scene,camera,dyn.sea,sun);
    post.quality(automatic); quality.options[0].textContent='Auto · '+automatic;
    controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: !still(), dampingFactor: .08, minZoom: .7, maxZoom: 4, minDistance:2.1, maxDistance:74, minPolarAngle: .12, maxPolarAngle: 1.52, screenSpacePanning: true, autoRotateSpeed: .55, zoomToCursor: true });
    controls.addEventListener('start', () => { delete tw.cam; });
    resetView(true);
  }

  function resetView(instant) {
    if (!controls) return;
    const end = new THREE.Vector3().setFromSphericalCoords(HOME.r*Math.max(1,.95/camera.aspect), HOME.phi, HOME.theta).add(HOME.target);
    const fromP = camera.position.clone(), fromT = controls.target.clone(), fromZ = camera.zoom;
    const apply = t => { const e = ease(t); camera.position.lerpVectors(fromP, end, e); controls.target.lerpVectors(fromT, HOME.target, e); camera.zoom = lerp(fromZ, 1, e); camera.updateProjectionMatrix(); };
    if (instant || still()) { camera.position.copy(end); controls.target.copy(HOME.target); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); delete tw.cam; return; }
    tween('cam', 0, 1, 700, apply);
  }
  function focusOn(v, z = 1.45) {
    if (!controls) return;
    const dest = new THREE.Vector3(...v); dest.y = lerp(dest.y, 3.6, .35);
    const offset = camera.position.clone().sub(controls.target);
    const fromT = controls.target.clone(), fromZ = camera.zoom, toZ = Math.max(camera.zoom, z);
    tween('cam', 0, 1, 650, t => { const e = ease(t); controls.target.lerpVectors(fromT, dest, e); camera.position.copy(controls.target).add(offset); camera.zoom = lerp(fromZ, toZ, e); camera.updateProjectionMatrix(); });
  }
  let fittedWidth = 0, fittedHeight = 0;
  function fit() {
    if (!renderer) return;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    // Assigning canvas dimensions clears its drawing buffer, even if unchanged.
    if (w === fittedWidth && h === fittedHeight) return;
    fittedWidth = w; fittedHeight = h; dirty=true;
    camera.aspect=w/h; camera.fov=camera.aspect<.95?58:47; camera.updateProjectionMatrix(); post.resize(w,h);
  }

  /* ---- state setters (each returns the note's action line) ---- */
  function setLight(value) {
    state.light=value; const n=Math.max(0,(value-.57)/.43);
    const label=value<.25?'Morning':value>.75?'Dusk':'Golden hour';
    $('.vl-settings output',deck).textContent=label;
    $('.vl-sun',deck).setAttribute('aria-valuetext',label);
    if(!lighting) return;
    lighting.change(value); M.winLit.emissiveIntensity=n*n*3.7; M.lamp.emissiveIntensity=n*n*5;
    for(const lamp of dyn.lamps) lamp.intensity=n*n*8;
    renderStill();
  }
  function syncTransport() {
    stage.dataset.guided=String(!state.orbit);
    orbit.setAttribute('aria-pressed',String(state.orbit));
    play.textContent=playing?'Pause':'Play';
    if(controls) controls.enabled=state.orbit;
    const beat=chapter(elapsed), sec=Math.floor(elapsed);
    if(beat!==lastChapter) { chapterLabel.textContent=chapters[beat]; lastChapter=beat; }
    if(sec!==lastSecond) { clockLabel.textContent='0:'+String(sec).padStart(2,'0')+' / 0:20';lastSecond=sec; }
    track.value=elapsed;
  }
  function guided(time,run) {
    if(!controls) return;
    delete tw.cam; state.orbit=false; playing=run; flightStamp=null; elapsed=time;
    camera.zoom=1; camera.updateProjectionMatrix();
    pose(elapsed,camera,controls.target); syncTransport(); renderStill();
  }
  function freeOrbit() {
    if(!controls) return;
    playing=false; state.orbit=true; syncTransport(); controls.update();
  }
  function setDrip(on) { state.drip = on; dyn?.drip.forEach(g => { g.visible = on; }); syncToggles(); return on ? 'Drip on · damp root zone, dry leaves' : 'Drip off · the soil holds what the rain left'; }
  function setCut(on) {
    state.cut = on; syncToggles();
    if (dyn) { const from = dyn.slab.position.x, s = dyn.slab; tween('slab', from, on ? 4.6 : 0, 900, v => { s.position.x = v; if(v===0 || v===4.6) renderer.shadowMap.needsUpdate=true; }); }
    return on ? 'Slab slid out · roots and strata in view' : 'Slab back in place';
  }
  function setReuse(on) { state.reuse = on; if (dyn) { dyn.rinse.loop.visible = on; dyn.rinse.spill.visible = !on; } syncToggles(); return on ? 'Loop on · rinse water settles, then climbs back to the yard' : 'Loop off · rinse water spills into the harbor'; }
  function setLoaded(on) {
    state.loaded = on; syncToggles();
    if (dyn) for (const [i, c] of dyn.cases.entries()) {
      const a = c.m.position.clone(); c.onBoat=false;
      tween('case' + i, 0, 1, 900 + i * 70, t => { const bp = dyn.caseBoat.localToWorld(pv.copy(c.bo)), end = on ? bp : c.qa; const e = ease(t); c.m.position.lerpVectors(a, end, e); c.m.position.y += Math.sin(e * PI) * 1.2; c.onBoat = on && t >= 1; if(!on)c.m.rotation.set(0,0,0); });
    }
    return on ? 'Cases loaded · tap again to unload' : 'Cases back on the quay';
  }
  function setPour(n) {
    state.pour = n; syncToggles();
    if (dyn) { const p = dyn.pour; tween('water', p.wf.scale.y, n >= 1 ? 1 : .01, 600, v => { p.wf.scale.y = v; }); tween('wine', p.wine.scale.y, n >= 2 ? 1 : .01, 600, v => { p.wine.scale.y = v; }); p.bottle.visible = n >= 2; }
    return ['Glasses cleared · tap to pour water first', 'Water poured · tap again for the wine', 'Wine poured · tap again to clear'][n];
  }
  function setDoor(lane) {
    state.door = lane; syncToggles();
    if (dyn) for (const [l, pv] of Object.entries(dyn.doors)) {
      const open = l === lane;
      tween('door' + l, pv.rotation.y, open ? -1.9 : 0, 650, v => { pv.rotation.y = v; });
      dyn.glow[l].material.opacity = open ? .85 : 0;
    }
    return lane ? `${LANES[lane].name} door open · the other four lanes stay shut` : 'All five lane doors shut';
  }

  /* ---- HUD: pins, toggles, list ---- */
  const pinBtns = {};
  for (const p of PINS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vl-pin'; b.dataset.pin = p.id; b.textContent = p.n;
    b.setAttribute('aria-label', `Pin ${p.n}: ${p.t}`);
    b.addEventListener('click', e => { e.stopPropagation(); open(p.id); });
    pinsEl.append(b); pinBtns[p.id] = b;
  }
  const list = $('.vl-list', root);
  list.innerHTML = PINS.map(p => `<li><button type="button" data-pin="${p.id}"><b>${p.n}</b>${p.t}</button></li>`).join('');
  list.addEventListener('click', e => { const b = e.target.closest('button[data-pin]'); if (b) open(b.dataset.pin); });

  const toggles = $('.vl-toggles', root);
  toggles.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.t;
    if (k === 'drip') say('drip', setDrip(!state.drip));
    if (k === 'cut') say('soil', setCut(!state.cut));
    if (k === 'reuse') say('rinse', setReuse(!state.reuse));
    if (k === 'cases') say('cases', setLoaded(!state.loaded));
    if (k === 'pour') say('table', setPour((state.pour + 1) % 3));
  });
  const hud = deck;
  hud.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    switch(b.dataset.act) {
      case 'play': guided(elapsed>=duration?0:elapsed,!playing); break;
      case 'replay': guided(0,true); break;
      case 'orbit': if(state.orbit) guided(elapsed,false); else freeOrbit(); break;
      case 'reset': freeOrbit(); resetView(); break;
    }
  });
  track.addEventListener('input',()=>guided(track.valueAsNumber,false));
  $('.vl-sun',deck).addEventListener('input',e=>setLight(e.target.valueAsNumber/100));
  quality.addEventListener('change', () => {
    const tier = quality.value === 'auto' ? automatic : quality.value;
    post?.quality(tier);
    lighting?.quality(tier);
    if (dyn) ambient(T);
    flightStamp = null;
    renderStill();
  });
  function syncToggles() {
    const on = { drip: state.drip, cut: state.cut, reuse: state.reuse, cases: state.loaded, pour: state.pour > 0 };
    toggles.querySelectorAll('button[data-t]').forEach(b => b.setAttribute('aria-pressed', String(!!on[b.dataset.t])));
    const pl = toggles.querySelector('[data-t="pour"] span'); if (pl) pl.textContent = ['Pour water', 'Pour wine', 'Clear glasses'][state.pour];
    const ob = hud.querySelector('[data-act="orbit"]'); if (ob) ob.setAttribute('aria-pressed', String(state.orbit));
  }
  // toggles update the note only if that pin's note is already open
  function say(pinId, act) { if (state.pin === pinId) $('.act', note).textContent = act; }

  /* ---- notes ---- */
  function open(id, { quiet = false } = {}) {
    dirty=true;
    const p = PINS.find(x => x.id === id); if (!p) return;
    if(!state.orbit && controls) { freeOrbit(); resetView(true); }
    const again = state.pin === id;
    let act = 'Drag to look around · tap another pin';
    if (id === 'terraces') act = 'Try pin 2 (drip) and pin 3 (soil cut)';
    if (id === 'drip') act = setDrip(again ? !state.drip : true);
    if (id === 'soil') act = setCut(again ? !state.cut : true);
    if (p.lane) act = setDoor(again && state.door === p.lane ? null : p.lane);
    if (id === 'rinse') act = setReuse(again ? !state.reuse : true);
    if (id === 'cases') act = setLoaded(again ? !state.loaded : !state.loaded);
    if (id === 'table') act = setPour(again ? (state.pour + 1) % 3 : Math.max(1, state.pour));
    if (id === 'auger') act = setCut(again ? !state.cut : true);
    if (id === 'press') act = setDoor(again && state.door === 'white' ? null : 'white');
    if (id === 'tanks') act = setDoor(again && state.door === 'red' ? null : 'red');
    if (id === 'barrels') act = 'Quay barrels · the cellar row, not a making-style door';
    if (id === 'lab') act = 'Lab bench in view · jars and a clipboard';
    if (id === 'bench') act = 'Workbench in view · stave, hoop, and a barrel on its side';
    if (id === 'berry') act = 'Vine terrace · skin, pulp, and seed';
    state.pin = id;
    Object.values(pinBtns).forEach(b => b.classList.toggle('active', b.dataset.pin === id));
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.pin === id)));
    note.hidden = false;
    note.innerHTML = `<button class="x" type="button" aria-label="Close note">×</button><div class="k">Village · pin ${p.n} of ${PINS.length}</div><h4>${p.t}</h4><p>${p.b}</p>` +
      `<div class="row"><span class="act"><b>What changed</b> ${act}</span>` +
      `<a class="to-outline" href="#outline/${p.chart}">Outline →</a>` +
      `</div>`;
    $('.x', note).addEventListener('click', close);
    if (!quiet) focusOn(anchor(p).toArray(), p.zoom || 1.45);
    onPin?.(id);
  }
  function close() {
    state.pin = null; note.hidden = true; note.innerHTML = '';
    Object.values(pinBtns).forEach(b => b.classList.remove('active'));
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', 'false'));
    onPin?.(null);
  }
  const _v = new THREE.Vector3();
  function anchor(p) { _v.set(...p.at); if (p.slab && dyn) _v.x += dyn.slab.position.x; return _v; }

  /* ---- click on props (invisible hit volumes) ---- */
  const hits = [];
  if (renderer) {
    const hm = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    for (const p of PINS) for (const [x0, x1, y0, y1, z0, z1] of p.hit) {
      const m = new THREE.Mesh(G.box, hm); m.scale.set(x1 - x0, y1 - y0, z1 - z0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.userData.pin = p.id;
      m.visible=false; (p.slab ? dyn.slab : scene).add(m); hits.push(m);
    }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const vol = o => Math.abs(o.scale.x * o.scale.y * o.scale.z);
    const pick = e => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const found = ray.intersectObjects(hits, false);
      if (!found.length) return;
      found.sort((a, b) => vol(a.object) - vol(b.object));
      return found[0].object.userData.pin;
    };
    let down = null;
    renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
      if (moved < 7 && dt < 600) { const id = pick(e); if (id) open(id); }
    });
    let last = 0;
    renderer.domElement.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || e.buttons) return; const n = performance.now(); if (n - last < 60) return; last = n; renderer.domElement.style.cursor = pick(e) ? 'pointer' : ''; });
  }

  /* ---- keyboard ---- */
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.body.classList.contains('dive-open')) return;
      if (state.pin) { const id = state.pin; close(); pinBtns[id]?.focus(); }
      return;
    }
    if (!controls || !stage.contains(e.target) || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','r','R'].includes(e.key)) return;
    freeOrbit();
    const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
    let used = true;
    if (e.key === 'ArrowLeft') sph.theta -= .14; else if (e.key === 'ArrowRight') sph.theta += .14;
    else if (e.key === 'ArrowUp') sph.phi = Math.max(controls.minPolarAngle, sph.phi - .1);
    else if (e.key === 'ArrowDown') sph.phi = Math.min(controls.maxPolarAngle, sph.phi + .1);
    else if (e.key === '+' || e.key === '=') { camera.zoom = Math.min(controls.maxZoom, camera.zoom * 1.18); camera.updateProjectionMatrix(); }
    else if (e.key === '-' || e.key === '_') { camera.zoom = Math.max(controls.minZoom, camera.zoom / 1.18); camera.updateProjectionMatrix(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); resetView(); return; }
    else used = false;
    if (!used) return;
    e.preventDefault();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph)); controls.update();
  });

  /* ---- loop ---- */
  const clock = new THREE.Clock(); let T = 3, running = false;
  const pv = new THREE.Vector3();
  const ns='http://www.w3.org/2000/svg';
  const leaders=document.createElementNS(ns,'svg'); leaders.classList.add('vl-leaders'); leaders.setAttribute('aria-hidden','true'); pinsEl.prepend(leaders);
  const pinLayout=PINS.map(p=>{
    const line=document.createElementNS(ns,'line'); leaders.append(line);
    return {p,b:pinBtns[p.id],line,x:0,y:0,ax:0,ay:0,off:false};
  });
  const previousCamera=new THREE.Matrix4(), previousProjection=new THREE.Matrix4();
  let previousSlab=NaN, previousWidth=0, previousHeight=0;
  function placePins() {
    if(!state.orbit) return;
    const w=fittedWidth,h=fittedHeight;
    if(previousCamera.equals(camera.matrixWorld) && previousProjection.equals(camera.projectionMatrix) &&
      previousSlab===dyn.slab.position.x && previousWidth===w && previousHeight===h) return;
    previousCamera.copy(camera.matrixWorld);previousProjection.copy(camera.projectionMatrix);
    previousSlab=dyn.slab.position.x;previousWidth=w;previousHeight=h;
    for(const point of pinLayout) {
      pv.copy(anchor(point.p)).project(camera);
      point.ax=point.x=(pv.x+1)*w/2;point.ay=(1-pv.y)*h/2;point.y=point.ay-16;
      point.off=Math.abs(pv.x)>1||Math.abs(pv.y)>1||Math.abs(pv.z)>1;
      point.b.classList.toggle('off',point.off);
      point.line.style.display=point.off?'none':'';
    }
    // Spread clustered cantina pins, retaining a leader to each true 3D anchor.
    for(let pass=0;pass<18;pass++) for(let i=0;i<pinLayout.length;i++) {
      const a=pinLayout[i];if(a.off) continue;
      for(let j=i+1;j<pinLayout.length;j++) {
        const b=pinLayout[j];if(b.off) continue;
        const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
        if(dist>=33) continue;
        const push=(33-dist)*.51,ux=dist>.01?dx/dist:1,uy=dist>.01?dy/dist:0;
        a.x-=ux*push;a.y-=uy*push;b.x+=ux*push;b.y+=uy*push;
      }
      a.x=THREE.MathUtils.clamp(a.x,15,w-15);a.y=THREE.MathUtils.clamp(a.y,18,h-18);
    }
    for(const q of pinLayout) if(!q.off) {
      q.b.style.transform=`translate(${q.x.toFixed(1)}px,${(q.y+6).toFixed(1)}px) translate(-50%,-50%)`;
      q.line.setAttribute('x1',q.ax);q.line.setAttribute('y1',q.ay);q.line.setAttribute('x2',q.x);q.line.setAttribute('y2',q.y);
    }
  }
  function draw() {
    if(!warmed || renderer.getContext().isContextLost()) return;
    if(!state.orbit) pose(elapsed,camera,controls.target);
    else controls.update();
    lighting.captureSky(); post.render(); placePins();
    renderer.domElement.style.visibility='visible';status.hidden=true;
    finishPeople(renderer, scene, camera, post.target);
  }
  function animate() {
    if(still() && !playing && !dirty) { clock.getDelta(); return; }
    dirty=false;
    const delta=clock.getDelta(), dt = Math.min(delta,.1), now = performance.now();
    for (const k2 in tw) { const t=tw[k2]; const u = Math.min(1, (now - t.t0) / t.dur); t.apply(typeof t.from === 'number' && typeof t.to === 'number' && k2 !== 'cam' && !k2.startsWith('case') ? lerp(t.from, t.to, ease(u)) : u); if (u >= 1) delete tw[k2]; }
    if (!still()) {
      T += dt; ambient(T);
    }
    if (playing) {
      const flightDelta=flightStamp===null?0:(now-flightStamp)/1000;
      const next=Math.min(duration,elapsed+flightDelta), changed=Math.floor(elapsed)!==Math.floor(next);
      elapsed=next;
      if(elapsed>=duration) playing=false;
      if(changed || chapter(elapsed)!==lastChapter || !playing) syncTransport();
      else track.value=elapsed;
    }
    draw();
    if (playing) flightStamp=flightStamp===null?performance.now():now;
  }
  function ambient(t) {
    const d=dyn;
    breeze.value=t; d.sea.uniforms.t.value=t;
    d.life(t,camera,quality.value==='auto'?automatic:quality.value);
    const rowboat=d.boats[6].b;
    d.sea.uniforms.oarWake.value.set(rowboat.position.x,rowboat.position.z,Math.cos(rowboat.rotation.y),-Math.sin(rowboat.rotation.y));
    for(const m of d.buoys)m.position.y=.56+swell(m.position.x,m.position.z,t);
    for(const c of d.cases)if(c.onBoat){d.caseBoat.localToWorld(c.m.position.copy(c.bo));c.m.quaternion.copy(d.caseBoat.quaternion);}
    for(const p of d.laundry){
      p.rotation.x=wind(t,p.position.x,p.position.z)*.22;
      p.children[0].userData.billow(t,p.position.x,p.position.z);
    }
    for(const p of d.canvas)p.userData.billow(t,p.position.x,p.position.z);

  }
  function frame() { if (running) animate(); }

  // Only one diorama animates at a time. The lower scenes take priority if
  // stages are partly visible together; a single on-demand render keeps
  // the visible Village responsive to its controls while its loop is paused.
  let stillFrame = 0;
  function renderStill() {
    dirty=true;
    if (stillFrame || lost || !renderer || !shown || !stageVisible || !otherSceneActive() || document.hidden || running) return;
    stillFrame = requestAnimationFrame(() => {
      stillFrame = 0;
      if (lost || !shown || !stageVisible || !otherSceneActive() || document.hidden || running) return;
      // Finish any in-flight interaction once; do not leave a half-open door
      // or an unfinished camera move frozen during the overlap.
      for (const [key, transition] of Object.entries(tw)) { transition.apply(transition.to); delete tw[key]; }
      camera.lookAt(controls.target);
      draw();
    });
  }
  function syncLoop() {
    const shouldRun = !!renderer && !lost && shown && stageVisible && !otherSceneActive() && !document.hidden;
    if (shouldRun === running) return;
    running = shouldRun; flightStamp=null;
    if (running) { dirty=true;fit(); clock.getDelta(); renderer.setAnimationLoop(frame); }
    else renderer?.setAnimationLoop(null);
  }
  new IntersectionObserver(([entry]) => {
    stageVisible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
    syncLoop();
    renderStill();
  }).observe(stage);
  document.addEventListener('sip:craft-visibility', event => {
    craftActive = !!event.detail?.active;
    syncLoop();
    renderStill();
  });
  document.addEventListener('sip:creek-visibility', () => { syncLoop(); renderStill(); });
  document.addEventListener('visibilitychange', () => { syncLoop(); renderStill(); });
  $('.village-wrap', root).addEventListener('click', renderStill, true);
  controls?.addEventListener('change', renderStill);

  const ro = new ResizeObserver(() => { fit(); renderStill(); });
  ro.observe(stage);
  fit(); setLight(.5); syncTransport(); syncToggles();
  if(controls) { if(state.orbit) resetView(true); else pose(0,camera,controls.target); }
  renderer?.domElement.addEventListener('webglcontextlost',e=>{
    e.preventDefault();contextGeneration++;lost=true;warmed=false;syncLoop();renderer.domElement.style.visibility='hidden';
    status.hidden=false;status.textContent='Restoring the village…';
  });
  renderer?.domElement.addEventListener('webglcontextrestored',()=>{
    const generation = contextGeneration;
    lost=false;lighting.restore();renderer.shadowMap.needsUpdate=true;
    restorePeople(scene);
    warmShaders(renderer, [[scene, camera, post.target]]).then(() => {
      if (lost || generation !== contextGeneration) return;
      warmed = true; dirty = true; syncLoop(); renderStill();
    });
  });
  if (dyn) ambient(T); // place people and props even when motion is reduced
  // Hold the first frame until the shaders are linked; the canvas stays hidden meanwhile.
  if (!renderer) warmed = true;
  else {
    primePeople(scene, automatic === 'High');
    lighting.captureSky(); // scene.environment is part of every lit shader's key
    warmShaders(renderer, [[scene, camera, post.target]]).then(ms => {
    if (contextGeneration !== 0) return;
    warmed = true; console.info(`Village shaders ready in ${Math.round(ms)} ms (${automatic} tier)`);
    dirty = true; renderStill();
  });
  }
  motionMQ.addEventListener?.('change', () => { if(still()) {freeOrbit();resetView(true);} });

  return {
    show(pin) {
      shown = true; syncLoop();
      if (pin && PINS.some(p => p.id === pin)) { if (state.pin !== pin) open(pin); }
      renderStill();
    },
    hide() { shown = false; syncLoop(); },
    close, open, state,
  };
}
