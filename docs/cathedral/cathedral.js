import * as T from 'three';
import { V, Masonry, statue, pinnacle, seeded } from './geometry.js';
import { marble } from './atmosphere.js';

function arch(x,spring,z,r,rise,segments=12) {
  const points=[];
  for(let i=0;i<=segments;i++) {
    const a=i/segments*Math.PI/3;
    points.push(V(x+r-2*r*Math.cos(a),spring+rise*Math.sin(a)/Math.sin(Math.PI/3),z));
  }
  return points.concat(points.slice(0,-1).reverse().map(p=>V(2*x-p.x,p.y,z)));
}
function ring(batch,x,y,z,r,t) {
  const path=[];
  for(let i=0;i<=32;i++) {
    const a=i*Math.PI/16; path.push(V(x+r*Math.cos(a),y+r*Math.sin(a),z));
  }
  batch.line(path,t);
}
function rose(batch,x,y,z,r,petals=6) {
  ring(batch,x,y,z,r,.045*r+.025);
  ring(batch,x,y,z,r*.88,.034*r+.015);
  const c=r*.51, a=Math.sin(Math.PI/petals), lobe=c*a;
  for(let i=0;i<petals;i++) {
    const angle=2*Math.PI*i/petals+Math.PI/2;
    ring(batch,x+Math.cos(angle)*c,y+Math.sin(angle)*c,z,lobe,.032*r+.012);
  }
  ring(batch,x,y,z,(c-lobe)*.97,.034*r+.015);
  const foil=[];
  for(let i=0;i<=petals*12;i++) {
    const a=i*2*Math.PI/(petals*12);
    const radius=r*(.69+.15*Math.sqrt(Math.abs(Math.sin((a-Math.PI/2)*petals*.5))));
    foil.push(V(x+radius*Math.cos(a),y+radius*Math.sin(a),z+.025));
  }
  batch.line(foil,.028*r+.012);
}

function windowBay(stone,shadow,glass,x,bottom,z,r,stem,rise,ornate) {
  const spring=bottom+stem, face=z+.12;
  const archPts=arch(x,spring,z,r,rise);
  const outline=[[x-r,bottom],...archPts.map(p=>[p.x,p.y]),[x+r,bottom]];
  glass.panel(outline,0,0,z,.07);
  function moulding(m,spread,depth,radius) {
    const pts=arch(x,spring,depth,r+spread,rise+spread*1.25);
    m.line([V(x-r-spread,bottom,depth),...pts,V(x+r+spread,bottom,depth)],radius);
  }
  moulding(shadow,.23,z+.03,.30);
  moulding(stone,.44,z+.07,.20); moulding(stone,.20,face,.115);
  moulding(stone,.01,face+.03,.065);
  const panes=ornate?6:2;
  for(let i=0;i<panes;i++) {
    const subR=r/panes, xx=x-r+(2*i+1)*subR;
    stone.line(arch(xx,spring,face,subR,subR*1.6,6),ornate?.06:.046);
    if(i) stone.beam(V(xx-subR,bottom,face),V(xx-subR,spring,face),ornate?.085:.055);
    if(ornate) {
      // Two cusps below each small lancet.
      for(const sign of [-1,1]) stone.line(arch(xx+sign*subR*.49,spring-.24,face,subR*.49,subR*.75,4),.04);
    }
  }
  if(ornate) {
    for(const sign of [-1,1]) {
      stone.line(arch(x+sign*r*.5,spring,face,r*.5,rise*.54),.112);
      rose(stone,x+sign*r*.48,spring+rise*.28,face,.50,4);
    }
    rose(stone,x,spring+rise*.55,face,r*.38,8);
    stone.box(x,bottom+stem*.45,face,r*2,.17,.19);
    stone.box(x,bottom+stem*.48,face,r*2,.055,.2);
  }
  stone.box(x,bottom-.13,z+.05,2*r+1,.26,.5);
}

function inscription(scene) {
  const canvas=document.createElement('canvas'); canvas.width=1536; canvas.height=128;
  const c=canvas.getContext('2d'), text='SIP STUDIES · MMXXVI';
  c.font='58px Georgia, serif'; c.textBaseline='middle';
  const widths=[...text].map(ch=>c.measureText(ch).width+12);
  let x=(canvas.width-widths.reduce((a,b)=>a+b,0))/2;
  [...text].forEach((ch,i)=>{
    c.fillStyle='#f4dfba'; c.fillText(ch,x+1.6,68.5);
    c.fillStyle='#51483f'; c.fillText(ch,x,66); x+=widths[i];
  });
  const tex=new T.CanvasTexture(canvas); tex.colorSpace=T.SRGBColorSpace; tex.anisotropy=4;
  const plate=new T.Mesh(new T.PlaneGeometry(11.2,.99),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
  plate.position.set(0,21.52,23.86); scene.add(plate);
}

export function buildCathedral(scene,mobile) {
  const stone=new Masonry(), seam=new Masonry(), roof=new Masonry(), glass=new Masonry(), gold=new Masonry();
  const placements=[], rng=seeded(182611);
  function spire(x,y,z,height,width=1) {
    const matrix=new T.Matrix4().compose(V(x,y,z),new T.Quaternion(),V(height*.1*width,height*.1,height*.1*width));
    placements.push({center:V(x,y+height*.5,z),matrix,level:-1});
  }

  // Long ridge and stepped aisle roofs, with individual standing seams.
  const roofEnd=22.4, back=-56, length=roofEnd-back, mid=(back+roofEnd)/2;
  const roofY=x=>Math.abs(x)<=6.4 ? 22.2-Math.abs(x)*.54 : 15.9-(Math.abs(x)-6.4)*.26;
  stone.box(0,6.50,mid,29.4,14.2,length);
  stone.box(0,15.1,mid,12.8,6.95,length);
  for(const s of [-1,1]) {
    for(const [inner,outer] of [[0,6.4],[6.5,14.8]]) {
      const xi=s*inner,xo=s*outer,yi=inner===0?22.2:15.9,yo=roofY(xo);
      roof.panel([[xi,yi],[xo,yo],[xo,yo-.36],[xi,yi-.36]],0,0,back,length);
      for(let z=back;z<=roofEnd;z+=2.15) stone.beam(V(xi,yi+.04,z),V(xo,yo+.04,z),.085);
      for(let i=1;i<6;i++) {
        const t=i/6;
        seam.box(xi+(xo-xi)*t,yi+(yo-yi)*t+.012,mid,.035,.03,length);
      }
    }
    for(const [xx,h] of [[6.35,19.0],[14.65,14.2]]) {
      const x=s*xx;
      stone.box(x,h,mid,.55,.48,length);
      stone.box(x,h+.97,mid,.40,.22,length);
      for(let z=back;z<roofEnd;z+=1.39) {
        stone.profile(x,h+.2,z,[[0,.21],[.13,.23],[.38,.11],[.61,.19],[.72,.21]],6);
      }
    }
    for(let z=-54;z<=21;z+=5.4) {
      const bay=Math.round((z+54)/5.4);
      const h=8.4+rng()*2.3+(bay%4===1?3.0:0);
      // A pair of deep clerestory lights on each side of the raised nave.
      for(const dz of [1.65,3.70]) {
        const lights=new Masonry(), frames=new Masonry(), r=.61;
        const path=arch(0,1.16,0,r,1);
        lights.panel([[-r,0],...path.map(p=>[p.x,p.y]),[r,0]],0,0,0,.045);
        frames.line([V(-r,0,.06),...arch(0,1.16,.06,r,1),V(r,0,.06)],.084);
        frames.beam(V(0,0,.06),V(0,1.54,.06),.055);
        for(const [source,dest] of [[lights,glass],[frames,stone]]) {
          const g=source.finish(); g.rotateY(s*Math.PI/2); dest.put(g,s*6.41,16.15,z+dz);
        }
      }
      stone.box(s*14.1,6.95,z,1.55,14.5,1.34);
      spire(s*14.1,14.05,z,h,1.03);
      spire(s*6.3,19.1,z,6.6+rng()*1.65,.87);
      spire(s*10.5,15.05,z+2.35,4.5+rng()*1.15,.85);
      spire(s*14.65,14.98,z+2.72,2.6,.83);
      // Figure niches on alternating outer piers pass at lens height
      // during the descending sweep.
      if(Math.round((z+54)/5.4)%2===0) {
        const sx=s*14.12;
        stone.profile(sx,18.1,z+.76,[[0,.29],[.36,.50],[.51,.48]]);
        statue(stone,sx,18.61,z+.76,1.72);
        stone.profile(sx,20.18,z+.76,[[0,.48],[.14,.51],[.94,.04]],6);
      }
      // A tall concave undercut leaves daylight between the flyer and aisle.
      const points=[[s*6.4,21.0],[s*8.7,20.4],[s*13.9,16.95],[s*14.1,14.6]];
      for(let i=0;i<=16;i++) {
        const t=i/16;
        points.push([s*(13.85-7.45*t),15.10+4.65*Math.sin(t*Math.PI*.50)**.69]);
      }
      stone.panel(points,0,0,z-.36,.72);
      stone.line([V(s*6.4,21.08,z),V(s*8.7,20.46,z),V(s*14,16.98,z)],.19);
      for(let k=0;k<5;k++) {
        const f=(k+1)/6;
        const xa=s*(7.15+5.25*f), xb=xa+s*.84, ya=20.86-(Math.abs(xa)-7.15)*.58;
        stone.beam(V(xa,ya,z),V(xa,ya+.55,z),.072);
        stone.beam(V(xa,ya+.55,z),V(xb,ya+.07,z),.083);
        stone.profile(s*(8.7+5.2*f),20.45-3.48*f,z,[[0,.15],[.21,.22],[.6,.025]],5);
      }
    }
  }
  for(let z=-52;z<21;z+=5.4) spire(0,22.18,z,2.1,.85);

  // Octagonal crossing lantern, pierced drum, corona of pinnacles, gold figure.
  const cz=-17;
  stone.profile(0,20,cz,[[0,6.15],[1.4,6.15],[1.7,6.42],[1.99,5.8],[2.4,5.72],
    [4.8,4.5],[5.1,4.85],[5.4,4.8],[5.7,4.23],[9.4,4.23],[9.7,4.65],[10.0,4.61],[10.25,3.85],
    [13.6,2.66],[13.9,2.95],[14.2,2.9],[14.45,2.24],[17.8,1.63],[18.0,1.9],[18.3,1.6]],8);
  for(let i=0;i<8;i++) {
    const a=Math.PI/8+i*Math.PI/4, dx=Math.cos(a),dz=Math.sin(a);
    spire(dx*5.43,23.0,cz+dz*5.43,8.8,1.05);
    spire(dx*3.80,29.85,cz+dz*3.8,8.0,.84);
    spire(dx*2.1,34.10,cz+dz*2.1,6.4,.69);
    const aa=a+Math.PI/8, xx=Math.cos(aa), zz=Math.sin(aa);
    const slit=new Masonry();
    const pts=arch(0,1.9,0,.65,1.0);
    slit.panel([[-.65,0],...pts.map(p=>[p.x,p.y]),[.65,0]],0,0,0,.09);
    const g=slit.finish(); g.rotateY(Math.atan2(xx,zz)); glass.put(g,xx*3.91,25.9,cz+zz*3.91);
  }
  // Radial clustered piers and recessed lancets wrap the real octagonal
  // planes of both drum stages, instead of facing only the opening camera.
  for(const [base,radius,h] of [[25.6,4.05,3.80],[30.35,3.65,3.40],[34.5,2.06,3.15]]) {
    for(let i=0;i<8;i++) {
      const a=Math.PI/4*(i+1), radial=V(Math.cos(a),0,Math.sin(a)), side=V(-radial.z,0,radial.x);
      const r=radius*.21;
      const local=p=>V(radial.x*radius+side.x*p.x,base+p.y,cz+radial.z*radius+side.z*p.x);
      const arc=arch(0,h*.57,0,r,h*.34,6);
      stone.line([V(-r,0,0),...arc,V(r,0,0)].map(local),.11);
      for(const k of [-1,1]) {
        const foot=local(V(k*(r+.24),0,0)), head=foot.clone(); head.y+=h;
        stone.beam(foot,head,.18,.13);
        stone.profile(head.x,head.y-.26,head.z,[[0,.17],[.16,.26],[.29,.19]]);
      }
    }
  }
  spire(0,37.75,cz,12.4,1.52);
  gold.profile(0,49.41,cz,[[0,.24],[.17,.31],[.37,.19],[.48,.23]]);
  statue(gold,0,49.87,cz,1.85);
  gold.beam(V(-.14,50.88,cz),V(-.54,51.38,cz+.04),.077,.055);
  gold.beam(V(.24,50.91,cz),V(.48,51.16,cz+.08),.081,.054);

  // West front. Recessed glazing, layered archivolts, cut-stone courses,
  // figurative niches and a pierced gallery provide scale in the close shot.
  for(const [x,w,base,peak] of [[0,12.2,22.5,27.5],[-9.1,6.05,17.7,21.7],[9.1,6.05,17.7,21.7],[-14.0,3.8,14.7,17.7],[14.0,3.8,14.7,17.7]]) {
    stone.panel([[-w/2,-1],[w/2,-1],[w/2,base],[0,peak],[-w/2,base]],x,0,21.8,1.2);
    stone.line([V(x-w/2,base,23.11),V(x,peak,23.11),V(x+w/2,base,23.11)],.22);
    for(let i=0;i<=12;i++) {
      const t=i/12, xx=x-w/2+w*t, yy=base+(peak-base)*(1-Math.abs(2*t-1));
      stone.profile(xx,yy,23.12,[[0,.14],[.18,.19],[.63,.026]],5);
    }
    // Blind lancets in the gable follow its rake. Narrow paired ribs and
    // a deeply set central foil cast distinct shadows in the last shot.
    const count=w>10?13:7;
    for(let i=0;i<count;i++) {
      const u=(i+.5)/count, gx=x+(u-.5)*(w-.55);
      const foot=base+.12, tip=base+(peak-base)*(1-Math.abs(2*u-1))-.38;
      if(tip<foot+.38 || (w>10 && Math.abs(gx)<1.12)) continue;
      const rr=w/count*.32, start=tip-rr*1.65;
      stone.line([V(gx-rr,foot,23.07),...arch(gx,start,23.07,rr,rr*1.65,4),V(gx+rr,foot,23.07)],.072);
    }
    spire(x,peak-.08,22.85,w>10?3.6:2.5,.86);
    if(x) windowBay(stone,seam,glass,x,7,23.05,w*.27,4.25,3.2,false);
    for(let y=2.2;y<base-.4;y+=2.3) seam.box(x,y,23.025,w-.1,.035,.04);
  }
  windowBay(stone,seam,glass,0,8.25,23.14,3.57,5.75,5.43,true);
  stone.box(0,21.52,23.36,11.81,.99,.92);
  for(const y of [20.92,22.12]) {
    stone.box(0,y,23.35,12.05,.21,1.16);
    seam.box(0,y-.14,23.30,11.87,.072,1.07);
  }
  for(let i=-15;i<=15;i++) {
    const x=i*.37;
    stone.box(x,20.68,23.59,.15,.23,.32);
    stone.profile(x,22.25,23.5,[[0,.115],[.11,.14],[.20,.025]],5);
  }
  // Slender colonnettes carry the archivolts past the window head, with
  // small foliate capitals at the springing line.
  for(const side of [-1,1]) for(let j=0;j<3;j++) {
    const x=side*(3.68+j*.23);
    stone.beam(V(x,8.1,23.46),V(x,14.04,23.46),.102,.087);
    for(const y of [8.18,13.84]) stone.profile(x,y,23.46,[[0,.14],[.12,.19],[.25,.11]],8);
  }
  for(const side of [-1,1]) for(let j=0;j<5;j++) {
    const x=side*(1.2+j*.67);
    const base=19.85-(j/4)**1.6*2.64;
    stone.line([V(x-.19,base,23.15),...arch(x,20.13,23.15,.19,.34,4),V(x+.19,base,23.15)],.059);
  }
  inscription(scene);
  rose(stone,0,24.19,23.12,.87);
  for(const s of [-1,1]) {
    for(const [xx,top] of [[5.58,23.1],[12.0,18.0],[15.7,14.8]]) {
      const x=s*xx;
      stone.box(x,(top-1)*.5,23.22,1.02,top+1,1.6);
      for(const off of [-.43,.43]) stone.beam(V(x+off,0,24.01),V(x+off,top,24.01),.13);
      spire(x,top-.1,23.28,xx<6?8.65:7.25,.96);
      for(const y of [9.1,15.5]) {
        if(y>top-2) continue;
        stone.profile(x,y-.8,24.2,[[0,.23],[.33,.45],[.52,.55],[.66,.53],[.72,.61]]);
        statue(stone,x,y-.04,24.32,2.32);
        stone.profile(x,y+2.02,24.16,[[0,.63],[.15,.66],[.24,.48],[1.48,.04]],6);
      }
    }
  }
  stone.addTo(scene,marble());
  seam.addTo(scene,new T.MeshStandardMaterial({color:0x746867,roughness:.9}));
  roof.addTo(scene,new T.MeshStandardMaterial({color:0x9a959b,roughness:.84}));
  glass.addTo(scene,new T.MeshStandardMaterial({color:0x323c54,roughness:.34,metalness:.68,envMapIntensity:.75}));
  gold.addTo(scene,new T.MeshStandardMaterial({color:0xffcd68,emissive:0xb96e18,emissiveIntensity:.55,metalness:.65,roughness:.26}));

  const sharedStone=marble(true);
  const batches=[0,1,2].map(level=>{
    const mesh=new T.InstancedMesh(pinnacle(level),sharedStone,placements.length);
    mesh.castShadow=true; mesh.receiveShadow=true; mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(mesh); return mesh;
  });
  // Use hysteresis so the detail does not chatter around a distance boundary.
  function updateLOD(camera) {
    let changed=false;
    for(const p of placements) {
      const d=p.center.distanceTo(camera.position);
      const near=(mobile?14:23)+(p.level===2?3:0), mid=(mobile?36:59)+(p.level===1?4:0);
      const level=d<near?2:d<mid?1:0;
      if(level!==p.level) {p.level=level; changed=true;}
    }
    if(!changed) return;
    batches.forEach(b=>b.count=0);
    for(const p of placements) {const batch=batches[p.level]; batch.setMatrixAt(batch.count++,p.matrix);}
    batches.forEach(b=>b.instanceMatrix.needsUpdate=true);
  }
  return updateLOD;
}
