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
import { villageStairs } from '../life/stairs.js';
import { peopleNav } from '../life/nav.js';
import { m, SCENE_M, scaleSpec } from '../life/scale.js';
import { villageLife } from '../life/village.js';
import { villageCanvas } from '../village/canvas.js';
import { instanceRigidParts } from '../life/rigid-instances.js';
import { batchStaticMeshes } from '../life/static-batches.js';
import { cutter, crate, tableService } from '../life/harbor.js';
import { primePeople, finishPeople, restorePeople } from '../life/scene-people.js';
import { warmShaders } from './sip-warm.js';

const motionMQ = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => motionMQ.matches;
const $ = (s, r = document) => r.querySelector(s);
const PI = Math.PI;
const metres = value => m('village', value);

/* ---------- small helpers ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const col = (hex, dl = 0, ds = 0) => new THREE.Color(hex).offsetHSL(0, ds, dl);
const jit = (R, hex, a = .03) => col(hex, (R() - .5) * a * 2, (R() - .5) * a);
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
  constructor(nav,frame) { this.items = {}; this.nav = nav; this.frame=frame; this.tag = null; this.measuring=[]; this.references=[]; }
  // A fixture can span several instancing batches. Keep the actual instance
  // slots together for metre checks without issuing a draw call per part.
  measure(kind, dimensions, name, build, yaw=0) {
    const ref = new THREE.Object3D();
    ref.name=name; ref.rotation.y=yaw; ref.updateMatrix(); ref.matrixAutoUpdate=false;
    scaleSpec(ref,'village',kind,dimensions,name);
    ref.userData.scaleParts=[];
    this.references.push(ref); this.measuring.push(ref);
    build();
    this.measuring.pop();
    return ref;
  }
  push(kind, p, s, c, r) {
    (this.items[kind] ||= []).push([p, s, c, r, this.measuring.length ? this.measuring.slice() : null]);
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
      list.forEach(([p, s, c, r, refs], i) => {
        if(refs)for(const ref of refs)ref.userData.scaleParts.push({mesh,index:i});
        o.position.set(...p); o.scale.set(...s); o.rotation.set(...(r || [0, 0, 0])); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c instanceof THREE.Color ? c : new THREE.Color(c));
      });
      mesh.castShadow = !/^win|lamp/.test(kind); mesh.receiveShadow = true; mesh.frustumCulled = false;
      if (kind === 'foliage' || kind === 'grass' || kind === 'leaf') mesh.userData.detail = kind;
      if (kind === 'grass' || kind === 'leaf' || kind === 'rail') mesh.castShadow = false;
      parent.add(mesh);
    }
    if (this.references.length) {
      const catalog = new THREE.Group();
      catalog.name = 'Measured Village instances';
      catalog.visible = false;
      catalog.matrixAutoUpdate = false;
      for (const ref of this.references) catalog.add(ref);
      parent.add(catalog);
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
function house(R, k, { x, z, w, d, base, floors, color, bloom, seed, name }) {
  const r = rng(seed),
    fh = metres(2.9),
    h = floors * fh + 0.15,
    top = base + h;
  const x0 = x - w / 2,
    x1 = x + w / 2,
    z0 = z - d / 2,
    z1 = z + d / 2;
  const plaster = jit(R, color, 0.015);
  for (let f = 0; f < floors; f++)
    k.measure('storey', [2.9, null, null], name + ' storey ' + (f + 1), () => {
      k.box(x0, x1, base + f * fh, base + (f + 1) * fh, z0, z1, plaster, 'plaster');
    });
  k.box(x0, x1, base + floors * fh, top, z0, z1, plaster, 'plaster');
  k.box(x0 - 0.02, x1 + 0.02, base, base + 0.3, z0 - 0.02, z1 + 0.02, col(color, -0.12));
  k.box(x0 - 0.05, x1 + 0.05, top - 0.1, top + 0.03, z0 - 0.05, z1 + 0.05, col(color, 0.07));
  const ov = 0.2,
    rh = Math.min(w, d) * 0.3;
  if (w >= d)
    k.push('roof', [x, top + 0.03, z], [d + ov * 2, rh, w + ov * 2], col(color, -0.04), [0, PI / 2, 0]);
  else k.push('roof', [x, top + 0.03, z], [w + ov * 2, rh, d + ov * 2], col(color, -0.04));
  layTiles(k, x, top + 0.03, z, w + ov * 2, d + ov * 2, rh, w >= d, r);
  if (r() < 0.8) k.box(x1 - 0.6, x1 - 0.3, top, top + rh + 0.35, z - 0.15, z + 0.15, col(color, -0.05));
  const cols = Math.max(2, Math.floor(w / metres(1.78))),
    step = w / cols,
    door = Math.floor(cols / 2);
  const sh = ['#365c51', '#566641', '#486259', '#53635b', '#516b5d'][seed % 5];
  // Wall-local metres. Positive z points out of the facade on all four sides.
  function windowAt(wx, wy, wz, side, face, floor, col) {
    const c = Math.cos(side),
      s = Math.sin(side);
    function panel(dx, dy, dz, width, height, depth, colour, kind = 'wood') {
      k.push(
        kind,
        [wx + metres(c * dx + s * dz), wy + metres(dy), wz + metres(-s * dx + c * dz)],
        [metres(width), metres(height), metres(depth)],
        colour,
        [0, side, 0],
      );
    }
    k.measure(
      'window',
      [1.3, 0.8, null],
      name + ' ' + face + ' window ' + (floor + 1) + '-' + (col + 1),
      () => {
        panel(0, 0, 0.021, 0.8, 1.3, 0.041, '#40494c', r() < 0.45 ? 'winLit' : 'winDark');
      },
      side,
    );
    panel(0, 0.705, 0.043, 0.94, 0.09, 0.09, colourTrim);
    panel(0, -0.704, 0.075, 0.99, 0.088, 0.16, '#d4c8b7');
    panel(0, 0, 0.046, 0.039, 1.3, 0.018, '#a6957d');
    panel(0, -0.085, 0.046, 0.8, 0.034, 0.018, '#a6957d');
    const closed = r() < 0.1;
    for (const sign of [-1, 1]) {
      const cx = sign * (closed ? 0.2 : 0.625);
      panel(cx, 0, closed ? 0.082 : 0.036, 0.392, 1.34, 0.06, sh);
      for (let i = 0; i < 6; i++)
        panel(cx, -0.49 + i * 0.195, closed ? 0.121 : 0.076, 0.34, 0.044, 0.026, sh);
    }
  }
  const colourTrim = col(color, 0.07);
  for (let f = 0; f < floors; f++) {
    const wy = base + f * fh + metres(1.62);
    for (let i = 0; i < cols; i++) {
      const wx = x0 + step * (i + 0.5);
      if (!f && i === door) {
        const threshold = base + metres(0.1),
          doorH = metres(2.08),
          doorW = metres(0.88);
        k.measure('door', [2.08, 0.88, null], name + ' front door', () => {
          k.box(
            wx - doorW / 2,
            wx + doorW / 2,
            threshold,
            threshold + doorH,
            z1,
            z1 + metres(0.07),
            r() < 0.5 ? '#3f5f4b' : '#6a4630',
            'wood',
          );
        });
        for (let j = 1; j < 6; j++) {
          const bx = wx - doorW / 2 + (j * doorW) / 6;
          k.box(
            bx - 0.004,
            bx + 0.004,
            threshold + 0.018,
            threshold + doorH - 0.018,
            z1 + metres(0.07),
            z1 + metres(0.081),
            '#49392d',
            'wood',
          );
        }
        k.box(
          wx - doorW / 2 - 0.027,
          wx + doorW / 2 + 0.027,
          base,
          threshold,
          z1 + 0.008,
          z1 + metres(0.3),
          '#aa9983',
        );
      } else windowAt(wx, wy, z1, 0, 'front', f, i);
      windowAt(wx, wy, z0, PI, 'rear', f, i);
    }
    if (f > 0 && r() < 0.35) {
      const y = base + f * fh;
      k.box(x0 + 0.15, x1 - 0.15, y - 0.065, y, z1, z1 + 0.38, '#d9cfbb');
      for (const ry of [0.4, 0.96])
        k.box(
          x0 + 0.15,
          x1 - 0.15,
          y + metres(ry),
          y + metres(ry + 0.045),
          z1 + 0.34,
          z1 + 0.38,
          '#373631',
          'rail',
        );
      for (let bx = x0 + 0.17; bx < x1 - 0.15; bx += 0.16)
        k.push('rail', [bx, y + metres(0.49), z1 + 0.36], [0.025, metres(0.98), 0.028], '#423e31');
      for (let i = 0; i < 4; i++)
        k.ball(
          x0 + 0.3 + r() * (w - 0.6),
          y + 0.12,
          z1 + 0.26,
          0.09 + r() * 0.05,
          r() < 0.5 ? C.bloom[i % 4] : C.green,
        );
    }
    for (const sign of [-1, 1]) {
      if (r() < 0.13) continue;
      const nz = Math.max(1, Math.floor(d / metres(2.05)));
      for (let i = 0; i < nz; i++)
        windowAt(
          sign < 0 ? x0 : x1,
          wy,
          z0 + ((i + 0.5) * d) / nz,
          (sign * PI) / 2,
          sign < 0 ? 'west' : 'east',
          f,
          i,
        );
    }
  }
  // Patinated rainwater stack, sill brackets and the stone corbels under the eaves.
  k.cyl(x1 - 0.08, base + h * 0.5, z1 + 0.064, 0.035, h, '#735d48');
  for (let f = 0; f < floors; f++)
    k.cyl(x1 - 0.08, base + f * fh + 0.41, z1 + 0.064, 0.042, 0.052, '#4d483b');
  for (let j = 0; j < cols * 2; j++)
    k.push(
      'stone',
      [x0 + ((j + 0.5) * w) / (cols * 2), top - 0.13, z1 + 0.051],
      [0.08, 0.14, 0.13],
      '#cec0a0',
    );
  if (bloom) {
    const bx = bloom > 0 ? x1 - 0.25 : x0 + 0.25;
    for (let j = 0; j < 48; j++) {
      const t = j / 48,
        xx = bx + 0.16 * Math.sin(t * 13) + 0.23 * Math.sin(t * 5) + (r() - 0.5) * 0.46;
      k.push(
        'leaf',
        [xx, base + 0.15 + t * (h - 0.35), z1 + 0.105 + r() * 0.065],
        [0.072, 0.12, 0.055],
        j % 5 ? '#546644' : '#a64655',
        [r(), r() * 4, r()],
      );
    }
    for (let i = 0; i < 32; i++)
      k.push(
        'flower',
        [bx + (r() - 0.5) * 0.48, base + 0.3 + (i * h) / 38, z1 + 0.14 + r() * 0.08],
        [0.15, 0.17, 0.11],
        C.bloom[i % 4],
        [0, r() * 0.8 - 0.4, r() * 3],
      );
  }
  return top + 0.03 + rh + 0.055;
}

function vineRow(R, kFor, z, top, x0, x1) {
  for (let x = x0; x <= x1 + 1e-6; x += .6) {
    const k = kFor(x);
    k.cyl(x, top + .25, z, .035, .5, '#5b4128');
    for(let n=0;n<50;n++) {
      const dx=(R()-.5)*.66,dy=R()*.31,dz=(R()-.5)*.32;
      k.push('leaf',[x+dx,top+.45+dy,z+dz],[.19,.21,.17],jit(R, n%4?'#57733c':'#89964e',.055),[R()*1.25-.48,R()*6.28,R()*1.5-.75]);
    }
    for (const dx of [-.13,.14]) for(let j=0;j<8;j++) {
      const a=j*2.4,rad=.055*(1-j/10);
      k.ball(x+dx+Math.cos(a)*rad,top+.52-j*.018,z+.12+Math.sin(a)*rad,.035,j%3?'#503348':'#71465c');
    }
  }
  for(const px of [x0-.3,x1+.3]){const kit=kFor(px);kit.measure('vine post',[1.5,null,null],'Vine trellis '+px+' '+z,()=>kit.cyl(px,top+.45,z,metres(.067),metres(1.5),'#7d6a55'));}
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

function rocksAlong(R, k, axis, fixed, a0, a1, y0, y1, n, scale = 1) {
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, R()), y = lerp(y0, y1, R()), s = (.22 + R() * .37) * scale;
    const p = axis === 'x' ? [a, y, fixed - .10 + (R() - .3) * .18] : [fixed + (R() - .3) * .25, y, a];
    k.push('rock', p, [s * (1 + R() * .5), s * (.7 + R() * .4), s], jit(R, R() < .5 ? C.rock : C.rockDark, .05), [R() * 3, R() * 3, R() * 3]);
  }
}

/* ---------- the village ---------- */
function buildWorld(scene) {
  // Every scene build recreates the same inventory, including after a remount.
  const R = rng(20261103);
  const nav = peopleNav(scene,'.vl-stage'), k = new Kit(nav), slab = new THREE.Group(), ks = new Kit(nav,slab);
  const kFor = x => (x >= 6 ? ks : k);
  const dyn = {}, panels = [];

  // strata under everything (the cutaway block)
  k.box(-10, 10, -3, -2.1, -10, 10, C.bed);
  k.box(-10, 10, -2.1, -1.25, -10, 10, C.soil);
  k.box(-10, 10, -1.25, -.9, -10, 10, C.sand);
  for (let i = 0; i < 70; i++) { const x = lerp(-9.8, 9.8, R()), z = R() < .5 ? 10 : -10; k.push('rock', [x, lerp(-2.9, -1.4, R()), z], [.12 + R() * .15, .1, .08], jit(R, '#9b8a76', .08), [R(), R(), R()]); }
  for (let i = 0; i < 40; i++) { const z = lerp(-9.8, 9.8, R()); k.push('rock', [10, lerp(-2.9, -1.4, R()), z], [.08, .1, .12 + R() * .15], jit(R, '#9b8a76', .08), [R(), R(), R()]); }

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
    for (let i = 0; i < 26; i++) kk.push('rock', [lerp(a + .2, b - .2, R()), lerp(4.7, 6.1, R()), R() < .5 ? -7.5 : -10], [.12 + R() * .12, .1, .1], jit(R, '#bfa98a', .06), [R(), R(), R()]);
  }
  for (let i = 0; i < 16; i++) ks.push('rock', [10, lerp(4.7, 6.1, R()), lerp(-9.8, -7.7, R())], [.1, .1, .12 + R() * .12], jit(R, '#bfa98a', .06), [R(), R(), R()]);
  // roots on the inner cut face (visible once the slab slides out)
  for (const z of [-8.1, -8.9, -9.6]) {
    k.box(5.95, 6.04, 4.2, 6.95, z - .03, z + .03, '#e2cfa8');
    for (let i = 0; i < 5; i++) { const y = lerp(4.5, 6.6, R()), L = .4 + R() * .5, s = R() < .5 ? -1 : 1; k.push('box', [6.0, y, z + s * L * .35], [.08, .035, L], '#d9c39a', [s * (.6 + R() * .4), 0, 0]); }
  }

  // cliff faces
  rocksAlong(R, k, 'x', 1.55, -10, 2.7, -.7, .8, 40); rocksAlong(R, k, 'x', 1.55, 4.9, 10, -.7, .8, 22);
  // The quay is revetted. Exposed boulders belong at the tidal foot of the wall.

  rocksAlong(R, k, 'z', 10.05, -7.5, 1.5, -.5, 2.8, 34, .7); rocksAlong(R, k, 'z', 10.05, -7.4, -4.6, 3, 4.6, 10, .8);
  rocksAlong(R, k, 'z', -10.05, -10, 1.5, -.5, 2.8, 26); rocksAlong(R, k, 'z', -10.05, -10, -1.5, 3, 6.5, 16);
  // dry-stone walls on vine terraces


  // seabed
  for (let i = 0; i < 46; i++) k.push('rock', [lerp(-9.6, 9.6, R()), -.85, lerp(2, 9.6, R())], [.15 + R() * .35, .12 + R() * .2, .15 + R() * .3], jit(R, '#a99a84', .08), [R(), R(), R()]);
  for (let i = 0; i < 60; i++) { const x = lerp(-9.6, 9.6, R()), z = lerp(2, 9.6, R()), h = .2 + R() * .45; k.cyl(x, -.9 + h / 2, z, .025, h, jit(R, '#4d7a4a', .08), [(R() - .5) * .4, 0, (R() - .5) * .4]); }

  villageStairs(scene,nav);

  // houses (left side, stepping up the hill)
  const H = [
    { x: -8.65, z: -3.1, w: 2.6, d: 2.6, base: 3, floors: 2, color: '#e3a07a', bloom: 1 },
    { x: -6.0, z: -3.0, w: 2.5, d: 2.8, base: 3, floors: 2, color: '#e8c27c' },
    { x: -3.45, z: -3.1, w: 2.4, d: 2.6, base: 3, floors: 2, color: '#a9b8c9', bloom: -1 },
    { x: -.95, z: -3.0, w: 2.3, d: 2.8, base: 3, floors: 2, color: '#efc98f' },
    { x: -8.1, z: -6.1, w: 3.2, d: 2.6, base: 5, floors: 2, color: '#f0d39a' },
    { x: -4.8, z: -6.0, w: 2.9, d: 2.8, base: 5, floors: 3, color: '#e7a98c', bloom: 1 },
    { x: -1.65, z: -6.1, w: 2.6, d: 2.6, base: 5, floors: 2, color: '#9fb0c2' },
    { x: -7.3, z: -8.85, w: 3.0, d: 2.2, base: 7, floors: 2, color: '#e2b47a' },
    { x: -3.7, z: -8.85, w: 3.4, d: 2.2, base: 7, floors: 3, color: '#e59a7c' },
    { x: -.35, z: -8.85, w: 2.5, d: 2.2, base: 7, floors: 2, color: '#f2dcae', bloom: 1 },
  ];
  H.forEach((h, i) => {
    // Preserve the rear building line and leave a full metre of terrace at
    // each entrance: a 30 cm stone stoop and 70 cm of clear walking space.
    const edge=h.base===3?-1.5:h.base===5?-4.5:-7.5;
    const rear=h.z-h.d/2,front=Math.min(h.z+h.d/2,edge-metres(1));
    h.z=(front+rear)/2;h.d=front-rear;
    h.name='House '+(i+1);
    h.roofHeight=house(R, k,{...h,seed:100+i*17});
    nav.box(h.name.toLowerCase(),h.x,h.z,h.w/2,h.d/2,h.base,h.roofHeight);
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
    k.measure('lane wall',[2.50,null,null],lane+' cellar portal wall',()=>k.box(c-.5,c+.5,3,3+metres(2.50),-4.53,-4.4,'#ddd0b6'));
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
    scaleSpec(pivot,'village','door',[2.15,1.26,null],lane+' lane cellar door');
    scene.add(pivot); dyn.doors[lane] = pivot;
  });
  k.tag = 'press and tank';
  {
    // white: basket press + small steel tank
    const c = LANE_X.white;
    k.measure('basket press', [0.84, 1.04, 1.04], 'Basket press chamber', () => {
      k.cyl(c - 0.25, 3.3, -3.4, metres(0.5), metres(0.83), '#b58a5a');
      for (let i = 0; i < 10; i++) {
        const a = (i * PI) / 5,
          xx = c - 0.25 + Math.cos(a) * metres(0.5),
          zz = -3.4 + Math.sin(a) * metres(0.5);
        k.box(xx - 0.02, xx + 0.02, 3.05, 3.56, zz - 0.02, zz + 0.02, '#7b5534');
      }
    });
    k.cyl(c - 0.25, 3.6, -3.4, 0.32, 0.06, '#6f4a2c');
    k.cyl(c - 0.25, 3.95, -3.4, 0.03, 0.7, '#55565a', null, 'metal');
    k.measure('steel tank', [1.5, 0.67, 0.67], 'White lane steel tank body', () =>
      k.cyl(c + 0.38, 3.5, -3.9, metres(0.335), metres(1.5), C.steel, null, 'metal'),
    );
    k.push('cone', [c + 0.38, 4.02, -3.9], [0.2, 0.14, 0.2], '#b9c1c4');
  }
  {
    const c = LANE_X.rose;
    for (const [dx, dz] of [
      [-0.28, -3.8],
      [0.28, -3.5],
    ]) {
      k.measure('steel tank', [1.67, 0.67, 0.67], 'Rosé tank ' + dx + ' body', () =>
        k.cyl(c + dx, 3.55, dz, metres(0.335), metres(1.67), C.steel, null, 'metal'),
      );
      k.cyl(c + dx, 3.7, dz, 0.205, 0.12, '#e49a9a');
      k.push('cone', [c + dx, 4.1, dz], [0.2, 0.12, 0.2], '#b9c1c4');
    }
  }
  k.tag = 'red vat';
  {
    const c = LANE_X.red;
    k.measure('red vat', [1.0, 1.5, 1.5], 'Open red fermenter', () => {
      k.cyl(c, 3.33, -3.65, metres(0.75), metres(1.0), '#8a5a36');
      k.cyl(c, 3.335, -3.65, 0.46, 0.07, '#4b4b4b');
      k.cyl(c, 3.62, -3.65, 0.42, 0.04, '#4a1622');
    });
  }
  k.tag = 'bottle rack';
  {
    const c = LANE_X.sparkling;
    k.measure('bottle rack', [1.54, null, null], 'Sparkling lane riddling rack', () => {
      for (const side of [-1, 1]) {
        k.push('box', [c, 3.5, -3.55 + side * 0.17], [1.0, 0.95, 0.06], '#a07a50', [side * 0.32, 0, 0]);
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++) {
            const y = 3.2 + j * 0.27;
            k.measure(
              'bottle end',
              [null, 0.075, 0.075],
              'Rack ' + side + ' bottle ' + (j * 4 + i + 1),
              () => {
                k.ball(
                  c - 0.36 + i * 0.24,
                  y,
                  -3.55 + side * 0.23 + (y - 3.5) * Math.sin(side * 0.32),
                  metres(0.0375),
                  '#22402c',
                );
              },
            );
          }
      }
    });
  }
  k.tag = 'barrel';
  {
    const c = LANE_X.fortified,
      r = metres(0.35),
      length = metres(0.95),
      floor = 3.06;
    for (let layer = 0; layer < 3; layer++) {
      const count = 3 - layer,
        y = floor + r + layer * (r * Math.sqrt(3));
      for (let i = 0; i < count; i++) {
        const x = c + (i - (count - 1) / 2) * 2 * r;
        k.measure('fortified barrel', [0.7, 0.7, 0.95], 'Fortified lane barrel ' + layer + '-' + i, () => {
          k.cyl(x, y, -3.7, r, length, '#7b4a2a', [PI / 2, 0, 0]);
          for (const dz of [-0.29, 0.29])
            k.cyl(x, y, -3.7 + length * dz, r + 0.002, metres(0.045), '#3d3a36', [PI / 2, 0, 0]);
        });
      }
    }
    k.cyl(c - 0.5, 3.25, -2.8, 0.1, 0.38, '#c7a15a');
  }
  k.tag='yard lamp and cistern';
  // yard lamp
  k.measure('lamp post',[2.50,null,null],'Cellar yard lamp post',()=>k.cyl(5.3,3.75,-2.1,metres(.05),metres(2.50),'#2f2f2c')); k.push('lamp', [5.3, 4.55, -2.1], [.11, .11, .11], '#fff');
  k.cyl(9.4, 3.35, -2.25, .32, .7, '#b9c6c3'); // yard cistern

  k.tag=null;
  // ---- quay: café terrace, crates, rinse corner ----
  k.floor('cantina',-9.7, -5, 1.05, 1.1, -1.4, 1.4, '#c98b6b');
  const deckY = 1.1;
  for (let i = 0; i < 10; i++) {
    const x = -9.58 + i * 0.49,
      diam = 0.32 + 0.06 * R(),
      r = metres(diam / 2);
    k.measure('flower clump', [null, diam, null], 'Cantina flower pot ' + (i + 1), () => {
      k.cyl(x, deckY + metres(0.1), 1.34, metres(0.11), metres(0.2), C.terra);
      k.push('ball', [x, deckY + metres(0.24), 1.34], [r, r * 0.72, r * 0.86], C.green);
      for (let j = 0; j < 3; j++)
        k.push(
          'flower',
          [x + (j - 1) * r * 0.33, deckY + metres(0.27) + r * 0.09 * (j % 2), 1.34 + r * 0.61],
          [r * 0.7, r * 0.72, r * 0.48],
          C.bloom[(i + j) % 4],
          [0, (j - 1) * 0.27, 0],
        );
    });
  }
  let tableIndex = 0;
  const table = (x, z, umbrella) => {
    const name = 'Cantina table ' + ++tableIndex,
      top = deckY + metres(0.75);
    nav.circle('café table', x, z, metres(0.35), deckY, top);
    k.measure('café table', [0.75, 0.7, 0.7], name, () => {
      k.cyl(x, deckY + metres(0.018), z, metres(0.2), metres(0.036), '#3a3733');
      k.cyl(x, deckY + metres(0.365), z, metres(0.038), metres(0.73), '#3a3733');
      k.cyl(x, top - metres(0.016), z, metres(0.35), metres(0.032), '#f3eee4');
    });
    for (const [dx, dz] of [
      [-0.55, 0],
      [0.55, 0],
      [0, -0.55],
    ]) {
      const cx = x + metres(dx),
        cz = z + metres(dz),
        yaw = Math.atan2(-dx, -dz),
        c = Math.cos(yaw),
        s = Math.sin(yaw);
      const chairName = name + ' chair ' + (dx < 0 ? 'west' : dx > 0 ? 'east' : 'north');
      const part = (px, py, pz, w, h, d, tint) =>
        k.push(
          'wood',
          [cx + metres(c * px + s * pz), deckY + metres(py), cz + metres(-s * px + c * pz)],
          [metres(w), metres(h), metres(d)],
          tint,
          [0, yaw, 0],
        );
      nav.box('café chair', cx, cz, metres(0.22), metres(0.22), deckY, deckY + metres(0.88), yaw);
      k.measure(
        'café chair',
        [0.88, 0.44, 0.44],
        chairName,
        () => {
          k.measure(
            'chair seat',
            [0.45, 0.44, 0.44],
            chairName + ' seat',
            () => {
              for (const xx of [-0.18, 0.18])
                for (const zz of [-0.18, 0.18]) part(xx, 0.204, zz, 0.035, 0.408, 0.035, '#655a45');
              part(0, 0.428, 0, 0.44, 0.044, 0.44, '#547264');
            },
            yaw,
          );
          for (const xx of [-0.18, 0.18]) part(xx, 0.662, -0.197, 0.036, 0.436, 0.04, '#52675b');
          part(0, 0.8, -0.198, 0.396, 0.14, 0.04, '#2f5b52');
        },
        yaw,
      );
    }
    if (umbrella)
      k.measure('umbrella', [2.5, 2.6, 2.6], name + ' umbrella', () => {
        k.measure('umbrella rim', [2.1, null, null], name + ' umbrella rim', () => {
          k.cyl(x, deckY + metres(1.05), z, metres(0.025), metres(2.1), '#dfd6c6');
          k.cyl(x, deckY + metres(2.085), z, metres(1.3), metres(0.03), '#914c2c');
        });
        k.push('cone', [x, deckY + metres(2.3), z], [metres(1.3), metres(0.4), metres(1.3)], '#f7f2e8');
      });
  };
  // The café awning follows the quay frontage in alternating woven panels.
  for(let i=0;i<13;i++) {
    const ax=-9.8+i*.34;
    panels.push([ax,3.34,-1.38,.343,.83,-1.38,0,i%2?'#ece0c6':'#9a5141'],
      [ax,3.21,-.986,.343,.115,0,0,i%2?'#e5d7bb':'#99513e']);
  }
  table(-8.6, .35, true); table(-8.3, -.85, true); table(-6.6, .5, false); table(-6.75, -.9, true);
  k.tag='lamp';
  k.measure('lamp post',[2.8,null,null],'Cantina lamp post',()=>k.cyl(-5.4,1.90,-1.2,metres(.05),metres(2.8),'#2f2f2c')); k.push('lamp', [-5.4, 2.8, -1.2], [.11, .11, .11], '#fff');
  k.tag='quay bollard';
  // bollards + crates + barrels near the quay edge
  for (const x of [-3.5,-.5,2.5,6,9])k.measure('bollard',[.67,.40,.40],'Quay bollard '+x,()=>k.cyl(x,1.25,1.25,metres(.20),metres(.67),'#3d3b38'));
  k.tag='quay barrel';
  for (const [x, z] of [[2.6, -.9], [3.0, -.9], [2.8, -1.2]]) k.measure('quay barrel',[.92,.57,.57],'Quay barrel '+x+' '+z,()=>k.cyl(x,1.33,z,metres(.285),metres(.92),'#7b4a2a'));
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
  k.measure('lamp post',[2.8,null,null],'Pier lamp post',()=>k.cyl(4.4,1.85,6.75,metres(.05),metres(2.8),'#2f2f2c')); k.push('lamp', [4.4, 2.75, 6.75], [.11, .11, .11], '#fff');
  const fenders = new THREE.Group(), rubber = new THREE.MeshStandardMaterial({color:'#222',roughness:.9});
  for (const [x, z] of [[3.05,2.6],[4.55,3.0],[5.6,7.05],[7.6,7.05]]) {
    const tire=new THREE.Mesh(new THREE.TorusGeometry(.17,.06,6,14),rubber);
    tire.position.set(x,.7,z); tire.rotation.y=z<4?PI/2:0;
    fenders.add(tire);
  }
  batchStaticMeshes(fenders);
  scene.add(fenders);

  k.tag=null;
  // laundry lines
  const line = (xa, xb, y, z) => {
    k.box(xa, xb, y - .01, y + .01, z - .01, z + .01, '#efe8dc');
    for (let x = xa + .3; x < xb - .2; x += .42) {
      panels.push([x,y,z,.28,.36,0,1,['#f4f1ea','#9fc3d6','#e7b3a3','#d8e6da','#e9d58f'][Math.floor(R()*5)]]);
    }
  };
  line(-9.7, -4.8, 5.9, -1.55); line(-6.4, -3.1, 8.5, -4.55); line(-5.2, -.8, 10.6, -7.6);

  villageCanvas(scene,panels);

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
  for (const z of harvestRows) { registerRow(z,5); vineRow(R, () => k, z, 5, 2.5, 9.7); }
  for (const z of [-8.1, -8.9, -9.6]) { registerRow(z,7); vineRow(R, kFor, z, 7, 2.5, 9.7); }

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
  k.measure('crate',[.45,.67,.58],'Vineyard picking bin 1',()=>k.box(3.15,3.55,5.05,5.32,-5.55,-5.2,'#b88a55'));
  k.measure('crate',[.39,.67,.58],'Vineyard picking bin 2',()=>k.box(3.6,4.0,5.05,5.28,-6.3,-5.95,'#a97a47'));
  k.tag='workbench';
  k.measure('workbench',[.77,null,null],'Cellar lab bench',()=>k.box(7.5,8.75,3.04,3.5,-2.15,-1.58,'#efe6d4'));
  k.cyl(7.75, 3.64, -1.85, .07, .24, '#d8e6da', null, 'metal');
  k.cyl(8.05, 3.62, -1.78, .055, .18, '#f3e0d8', null, 'metal');
  k.box(8.3, 8.58, 3.5, 3.58, -2.05, -1.7, '#fffaf1');
  k.measure('workbench',[.77,null,null],'Coopering bench',()=>k.box(3.2,4.45,3.04,3.46,-2.2,-1.58,'#8a5a36'));
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
  const buoyShell = new THREE.Mesh(new THREE.LatheGeometry([[.035,-.155],[.075,-.11],[.096,-.04],[.091,.051],[.06,.1],[.025,.118]].map(([r,y])=>new THREE.Vector2(r,y)),16),
    new THREE.MeshStandardMaterial({color:'#c66d37',roughness:.64}));
  buoyShell.castShadow=buoyShell.receiveShadow=true;
  const buoyBand = new THREE.Mesh(new THREE.CylinderGeometry(.095,.096,.031,16),
    new THREE.MeshStandardMaterial({color:'#e8d8bf'}));
  for (const [x, z] of [[0, 8.9], [-4.3, 3.1], [7, 4.4], [-8.2, 8.3], [2.6, 5.2], [-1, 6], [6.4, 9.4]]) {
    const m=new THREE.Group(); m.add(buoyShell.clone(),buoyBand.clone());
    m.position.set(x,.58,z);scene.add(m);scaleSpec(m,'village','buoy',[.45,.32,.32],'Mooring buoy '+(dyn.buoys.length+1));dyn.buoys.push(m);
  }

  // Case bounds follow the same pitched deck and the same lift tween as the mesh.
  const caseFrame = new THREE.Matrix4(),
    halfCase = [0.25, 0.15, 0.165];
  function caseBounds(object, obstacle) {
    object.updateWorldMatrix(true, false);
    caseFrame.copy(scene.matrixWorld).invert().multiply(object.matrixWorld);
    const e = caseFrame.elements,
      angle = Math.atan2(e[8], e[10]),
      c = Math.cos(angle),
      s = Math.sin(angle);
    obstacle.x = e[12] + e[4] * halfCase[1];
    obstacle.z = e[14] + e[6] * halfCase[1];
    const y = e[13] + e[5] * halfCase[1];
    let hx = 0,
      hy = 0,
      hz = 0;
    for (let i = 0; i < 3; i++) {
      const j = 4 * i,
        r = halfCase[i];
      hx += Math.abs(c * e[j] - s * e[j + 2]) * r;
      hy += Math.abs(e[j + 1]) * r;
      hz += Math.abs(s * e[j] + c * e[j + 2]) * r;
    }
    obstacle.angle = angle;
    obstacle.cos = c;
    obstacle.sin = s;
    obstacle.hx = hx;
    obstacle.hz = hz;
    obstacle.bottom = y - hy;
    obstacle.top = y + hy;
  }
  dyn.cases = [];
  for (let i = 0; i < 8; i++) {
    const box = crate(),
      w = metres(0.5),
      d = metres(0.33),
      h = metres(0.3);
    box.scale.setScalar(SCENE_M.village);
    scene.add(box);
    scaleSpec(box, 'village', 'wine case', [0.3, 0.5, 0.33], 'Static quay / boat wine case ' + (i + 1));
    const layer = Math.floor(i / 4),
      column = i % 2,
      row = Math.floor(i / 2) % 2;
    const qa = new THREE.Vector3(6.25 + column * (w + 0.008), 1.05 + layer * h, -0.25 + row * (d + 0.008));
    // Two stacks on each of the fore/aft thwarts. The bottoms sit directly on their planks.
    const bo = new THREE.Vector3(
      column ? 0.46 : -0.58,
      0.286 + 0.043 / 2 + (layer * h) / dyn.caseBoat.scale.y,
      ((row - 0.5) * (d + 0.008)) / dyn.caseBoat.scale.y,
    );
    box.position.copy(qa);
    const obstacle = nav.box('wine case', 0, 0, w / 2, d / 2, 0, h, 0, box);
    obstacle.updateBounds = () => caseBounds(box, obstacle);
    obstacle.updateBounds();
    dyn.cases.push({ m: box, qa, bo, obstacle, onBoat: false });
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
  dyn.pour=tableService(scene,-6.6,deckY+metres(.75),.5);

  // lamps (night)
  dyn.lamps = [[-5.4, 2.7, -1.0], [5.3, 4.4, -1.9], [4.4, 2.6, 6.6]].map(p => { const l = new THREE.PointLight('#ffc27a', 0, 9, 1.4); l.position.set(...p); scene.add(l); return l; });

  dyn.syncHarbor = instanceRigidParts(scene,[...dyn.boats.map(boat=>boat.b),...dyn.buoys,...dyn.cases.map(c=>c.m)]);
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
  const uprightCase = new THREE.Quaternion();
  function setLoaded(on) {
    state.loaded = on;
    syncToggles();
    if (dyn) {
      for (let i = 0; i < dyn.cases.length; i++) {
        const cargo = dyn.cases[i],
          box = cargo.m;
        scene.attach(box); // Pick up from the current world pose, including an interrupted transfer.
        box.scale.setScalar(SCENE_M.village);
        const start = box.position.clone(),
          rotation = box.quaternion.clone();
        cargo.onBoat = false;
        tween('case' + i, 0, 1, 900 + i * 70, (t) => {
          if (on && t >= 1) {
            dyn.caseBoat.add(box);
            box.scale.setScalar(SCENE_M.village / dyn.caseBoat.scale.y);
            box.position.copy(cargo.bo);
            box.quaternion.identity();
            cargo.onBoat = true;
          } else {
            const end = on ? scene.worldToLocal(dyn.caseBoat.localToWorld(pv.copy(cargo.bo))) : cargo.qa;
            const u = ease(t);
            box.position.lerpVectors(start, end, u);
            box.position.y += Math.sin(u * PI) * 1.2;
            box.quaternion.slerpQuaternions(rotation, on ? dyn.caseBoat.quaternion : uprightCase, u);
          }
          cargo.obstacle.updateBounds();
        });
      }
    }
    return on ? 'Cases loaded · tap again to unload' : 'Cases back on the quay';
  }
  function setPour(n) {
    state.pour = n;
    syncToggles();
    if (dyn) {
      const p = dyn.pour;
      tween('water', p.wf.scale.y, n >= 1 ? 1 : 0.01, 600, p.setWater);
      tween('wine', p.wine.scale.y, n >= 2 ? 1 : 0.01, 600, p.setWine);
      p.bottle.visible = n >= 2;
    }
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
    dyn.syncHarbor();
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
    for(const c of d.cases)if(c.onBoat)c.obstacle.updateBounds();
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
