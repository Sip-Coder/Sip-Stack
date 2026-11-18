// Accumulate fixed masonry into a small set of draws. The same tools build
// unit pinnacle prototypes, scaled and distributed by the instance batches.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V = (x, y, z) => new T.Vector3(x, y, z);
const up = V(0, 1, 0);
export function seeded(seed) {
  return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
}
export class Masonry {
  constructor() { this.parts = []; }
  put(geometry, x = 0, y = 0, z = 0) {
    geometry.translate(x, y, z);
    geometry.deleteAttribute('uv');
    this.parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  }
  box(x,y,z,w,h,d) { this.put(new T.BoxGeometry(w,h,d), x,y,z); }
  // Rings are (height, radius) pairs. Projecting bands and sloping caps
  // are part of the silhouette at every distance.
  profile(x,y,z,rings,sides=8,phase=Math.PI/8) {
    const positions = [];
    for (let j=1; j<rings.length; j++) {
      const ring = (i,k) => {
        const a = phase + i*2*Math.PI/sides, [h,r] = rings[k];
        return [Math.cos(a)*r, h, Math.sin(a)*r];
      };
      for(let i=0;i<sides;i++) {
        const a=ring(i,j-1), b=ring(i,j), c=ring(i+1,j), d=ring(i+1,j-1);
        positions.push(...a,...b,...c,...a,...c,...d);
      }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(positions,3)); g.computeVertexNormals();
    this.put(g,x,y,z);
  }
  beam(a,b,r,top=r,sides=6) {
    const delta=b.clone().sub(a);
    const g=new T.CylinderGeometry(top,r,delta.length(),sides);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up,delta.normalize()));
    this.put(g,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
  }
  line(points,r) {
    // Joined cross-sections keep the mouldings continuous at the crown
    // of a pointed arch, even when viewed from very close range.
    const pos=[], sides=6, tangent=new T.Vector3(), axis=new T.Vector3();
    const radial=new T.Vector3(), cross=new T.Vector3(), prev=[];
    for(let k=0;k<points.length;k++) {
      tangent.subVectors(points[Math.min(k+1,points.length-1)],points[Math.max(k-1,0)]).normalize();
      if(!k) axis.set(Math.abs(tangent.z)<.8?0:1,0,Math.abs(tangent.z)<.8?1:0);
      radial.copy(axis).addScaledVector(tangent,-axis.dot(tangent)).normalize();
      cross.crossVectors(tangent,radial); axis.copy(radial);
      const next=[];
      for(let j=0;j<sides;j++) {
        const a=j*2*Math.PI/sides;
        next.push(points[k].clone().addScaledVector(radial,r*Math.cos(a)).addScaledVector(cross,r*Math.sin(a)));
      }
      if(k) for(let j=0;j<sides;j++) {
        const n=(j+1)%sides;
        for(const v of [prev[j],prev[n],next[n],prev[j],next[n],next[j]]) pos.push(v.x,v.y,v.z);
      }
      prev.splice(0,sides,...next);
    }
    const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.computeVertexNormals(); this.put(g);
  }
  // Extrude a silhouette lying in the xy plane towards the viewer.
  panel(points,x,y,z,depth) {
    const shape=new T.Shape(points.map(([a,b])=>new T.Vector2(a,b)));
    this.put(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false}),x,y,z);
  }
  finish() { const g=mergeGeometries(this.parts); this.parts.length=0; return g; }
  addTo(scene,material,shadow=true) {
    const mesh=new T.Mesh(this.finish(),material);
    mesh.castShadow=shadow; mesh.receiveShadow=shadow; scene.add(mesh); return mesh;
  }
}

export function statue(batch,x,y,z,h) {
  const r=h*.19;
  batch.profile(x,y,z,[[0,r],[.06*h,r*1.15],[.11*h,r*.83],[.16*h,r*.9],
    [.28*h,r*.7],[.47*h,r*.56],[.62*h,r*.8],[.70*h,r*.67],[.75*h,r*.36]],9);
  batch.profile(x,y+.72*h,z,[[0,r*.34],[.04*h,r*.53],[.115*h,r*.48],[.155*h,r*.30],[.16*h,0]],8);
  // Folded robe, bent arms, and the projecting edge of the mantle.
  for(const s of [-1,1]) {
    batch.beam(V(x+s*r*.6,y+h*.65,z),V(x+s*r*.78,y+h*.51,z+r*.45),r*.28,r*.21);
    batch.beam(V(x+s*r*.78,y+h*.51,z+r*.45),V(x+s*r*.18,y+h*.57,z+r*.82),r*.21,r*.18);
    batch.beam(V(x+s*r*.20,y+h*.51,z+r*.57),V(x+s*r*.54,y+h*.13,z+r*.75),r*.17,r*.08);
  }
}

// Each prototype is ten units tall. Riblets, gablets and hooked leaves
// disappear progressively while the eight-sided core keeps its silhouette.
export function pinnacle(detail) {
  const m=new Masonry();
  m.profile(0,0,0,[[0,1],[.17,1],[.28,.85],[.47,.83],[.58,.95],[.73,.76],
    [1.05,.72],[1.14,.78],[1.25,detail ? .45 : .68],
    [3.25,detail ? .40 : .65],[3.5,.64],[3.68,.80],[3.82,.78],[3.93,.65]],8);
  m.profile(0,3.82,0,[[0,.65],[.32,.72],[.42,.62],[.54,.68],[4.91,.11],[5.05,.17],[5.24,.09],[5.78,0]],8);
  m.profile(0,9.01,0,[[0,.09],[.09,.19],[.22,.21],[.33,.10],[.42,.13],[.60,0]],6);
  if(detail>0) {
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4+Math.PI/8, cx=Math.cos(a), cz=Math.sin(a);
      m.beam(V(.73*cx,.55,.73*cz),V(.67*cx,3.65,.67*cz),.12,.095,5);
      // Open pointed arcade between the eight outer colonnettes.
      const next=a+Math.PI/4, mx=(cx+Math.cos(next))*.335, mz=(cz+Math.sin(next))*.335;
      const tip=V(mx,3.45,mz);
      for(const [ux,uz] of [[cx,cz],[Math.cos(next),Math.sin(next)]]) {
        m.line([V(.68*ux,2.84,.68*uz), V(.64*ux+mx*.07,3.14,.64*uz+mz*.07),tip],.075);
      }
      if(i%2===0) {
        m.profile(.67*cx,3.5,.67*cz,[[0,.28],[.20,.31],[1.24,0]],4);
      }
      if(detail===2 || i%2===0) {
        for(let n=0;n<(detail===2?6:3);n++) {
          const f=(n+.6)/(detail===2?7:4), y=4.4+4.35*f, r=.65*(1-f), leaf=.20*(1-f)+.05;
          const p=V(cx*r,y,cz*r), q=V(cx*(r+leaf),y+.09,cz*(r+leaf));
          m.beam(p,q,leaf*.72,leaf*.6,4);
          m.beam(q,V(q.x+cx*.02,y+leaf*1.85,q.z+cz*.02),leaf*.65,.009,4);
        }
      }
    }
  }
  return m.finish();
}
