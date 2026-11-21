// A pelvic ring and lower skeleton registered to the playable hero's posed
// joint frames. Positions and angles below use +Z anterior and +X left.
import * as T from 'three';
import { ivory, joint, lerp, local, tau, v } from './diagram-fabricator.js';
import { buildFoot } from './diagram-foot.js';
import { sippyLegFit } from './diagram-leg-fit.js';

const rad = Math.PI / 180;

function frame(node, height) {
  const origin = node.getWorldPosition(v());
  const rotation = node.getWorldQuaternion(new T.Quaternion()).normalize();
  return (x, y, z) => v(x, y, z).applyQuaternion(rotation).multiplyScalar(height).add(origin);
}

function pelvicFrame(rig, roma) {
  if(roma)return frame(rig.hips,rig.height);
  // Sippy's fork and lower-waist skin are sewn to the torso bind frame.
  // Turn the rigid pelvic ring about that actual waist pivot as the wearer
  // flexes. Its neutral centre is still the unmodified animation hip origin.
  const waist=rig.chest;
  const shift=waist.position.clone().negate().divide(waist.scale);
  const origin=waist.localToWorld(shift);
  const rotation=waist.getWorldQuaternion(new T.Quaternion()).normalize();
  return (x,y,z)=>v(x,y,z).applyQuaternion(rotation).multiplyScalar(rig.height).add(origin);
}

function line(a, b, t) {
  return a.clone().lerp(b, t);
}

// The stylized waist sets the lateral limit of the alae. Both inlet, notch
// and pubic arch are cut into actual bone surfaces and remain open spaces.
export function pelvisLandmarks(rig, roma) {
  const h = rig.height, place = pelvicFrame(rig,roma);
  const tilt = (roma ? 37 : 31) * rad;
  const s1 = place(0, roma ? .044 : .047, roma ? -.017 : -.020);
  const s1Normal = place(0, Math.cos(tilt), Math.sin(tilt)).sub(place(0, 0, 0)).normalize();
  const s1Forward = place(0, -Math.sin(tilt), Math.cos(tilt)).sub(place(0, 0, 0)).normalize();
  const s1Depth = roma ? .0088 : .013;
  const base = {
    place, s1, sacralBase: s1, s1Normal, s1Forward, s1Depth,
    promontory: s1.clone().addScaledVector(s1Forward, s1Depth*h),
    sacralTip: place(0, roma ? -.014 : -.024, roma ? -.027 : -.030),
    coccyx: place(0, roma ? -.029 : -.040, roma ? -.018 : -.016),
    symphysis: place(0, -.011, roma ? .024 : .019),
    pubicArchApex: place(0, -.017, roma ? .023 : .018),
  };
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const P = (x, y, z) => place(sign*x, y, z);
    const hip = rig['thigh'+side], shin = rig['shin'+side], foot = rig['foot'+side];
    const hPlace = local(hip);
    const crestX = roma ? .077 : .0505;
    const crest = P(crestX, roma ? .069 : .075, -.002);
    const asis = P(crestX*(roma ? .77 : .72), roma ? .048 : .053, roma ? .025 : .016);
    const psis = P(roma ? .024 : .020, roma ? .043 : .048, roma ? -.034 : -.037);
    const aiis = P(roma ? .052 : .0395, .025, roma ? .022 : .015);
    const pubis = P(.003, -.009, roma ? .024 : .019);
    const ischium = P(roma ? .043 : .028, roma ? -.0317 : -.043, roma ? -.0128 : -.019);
    const inferiorPubis = P(.002, -.017, roma ? .023 : .018);
    const ramusDrop = roma ? .0095 : .020;
    const ramus = P(.002+ramusDrop*Math.tan((roma ? 45 : 30)*rad), -.017-ramusDrop, roma ? .021 : .016);
    const sciaticApex = P(roma ? .033 : .025, roma ? .015 : .012, roma ? -.016 : -.013);
    const notchWidth = (roma ? 82 : 55) * rad;
    const notchDepth = roma ? .014 : .021;
    const notchHalfHeight = notchDepth*Math.tan(notchWidth/2);
    const sciaticUpper = P(roma ? .026 : .022, (roma ? .015 : .012)+notchHalfHeight,
      (roma ? -.016 : -.013)-notchDepth);
    const sciaticSpine = P(roma ? .035 : .031, (roma ? .015 : .012)-notchHalfHeight,
      (roma ? -.016 : -.013)-notchDepth);
    const center = P(roma ? .044 : .0315, -.004, roma ? -.0015 : -.009);
    const radius = (roma ? 1.6 : 1.8)*.0254/2;
    const axis = P(1, -.30, .27).sub(P(0,0,0)).normalize();
    const fit = roma ? null : sippyLegFit(rig,side);
    const knee = fit?.knee ?? hPlace(shin.position.x-sign*(roma ? .011 : .008),shin.position.y,
      shin.position.z+(roma ? -.002 : -.018));
    const distal = knee.clone().sub(center).normalize();
    // Preserve the measured neck/shaft angle as the real knee bends: the
    // fixed acetabulum is the proximal pivot and the wearer supplies the knee.
    const lateral = hPlace(sign,0,0).sub(hPlace(0,0,0)).projectOnPlane(distal).normalize();
    const front = v().crossVectors(distal,lateral).multiplyScalar(sign).normalize();
    const version = (roma ? 13 : 10)*rad, inclination = 127*rad;
    const length = center.distanceTo(knee), neck = h*(roma ? .025 : .018);
    const shaft = neck*Math.cos(inclination)+Math.sqrt(length*length-(neck*Math.sin(inclination))**2);
    const axial = (length*length+neck*neck-shaft*shaft)/(2*length);
    const offset = Math.sqrt(neck*neck-axial*axial);
    const junction = center.clone().addScaledVector(distal,axial)
      .addScaledVector(lateral,offset*Math.cos(version)).addScaledVector(front,-offset*Math.sin(version));
    const down = knee.clone().sub(junction).normalize();
    const outer = lateral.clone().projectOnPlane(down).normalize();
    const forward = v().crossVectors(down,outer).multiplyScalar(sign).normalize();
    const shaftPoint = (t, x = 0, z = 0) => line(junction,knee,t).addScaledVector(outer,x*h)
      .addScaledVector(forward,(z+.0045*Math.sin(t*Math.PI))*h);
    const greaterTrochanter = junction.clone().addScaledVector(down,-axial+.001*h)
      .addScaledVector(outer,.003*h);
    const lesserTrochanter = shaftPoint(.10,-.006,-.0055);
    const glutealTuberosity = shaftPoint(.18,.0045,-.006);
    const lineaAspera = shaftPoint(.45,0,-.006);
    const medialCondyle=shaftPoint(.977,-.0060,-.002), lateralCondyle=shaftPoint(.975,.0060,-.002);
    const ankle=local(foot)(0,.005,-.006);
    const shinDown=ankle.clone().sub(knee).normalize();
    const shinOut=local(shin)(sign,0,0).sub(local(shin)(0,0,0)).projectOnPlane(shinDown).normalize();
    const shinForward=v().crossVectors(shinDown,shinOut).multiplyScalar(sign).normalize();
    const shinPoint=fit ? fit.shinPath(ankle,shinOut,shinForward) : (t,x=0,z=0)=>line(knee,ankle,t).addScaledVector(shinOut,x*h)
      .addScaledVector(shinForward,(z-(roma?.0025:.006)*Math.sin(Math.PI*t))*h);
    const patella=fit?.patella ?? shaftPoint(.983,0,.013);
    const tibialTuberosity=shinPoint(.095,roma?.0045:.0054,.010);
    base[side] = {
      sign, P, crest, anteriorCrest:asis, posteriorCrest:psis, asis, psis, aiis,
      ilium:line(psis,crest,.34), pubis, ischium, ischialTuberosity:ischium, inferiorPubis, ramus,
      sciaticUpper, sciaticApex, sciaticSpine,
      acetabulum:center, femoralHead:center.clone(), headRadius:radius, socketAxis:axis, junction,
      shaftPoint, down, outer, forward, greaterTrochanter, lesserTrochanter,
      glutealTuberosity, lineaAspera, medialCondyle, lateralCondyle, knee, patella,
      tibialTuberosity, ankle, shinPoint, shinDown, shinOut, shinForward,
    };
  }
  return base;
}

// Orient each patch against its known exterior; mirrors share one shape and
// both pick from the outward-facing surface.
function face(vertices, indices, a,b,c,normal) {
  const d = v().subVectors(vertices[b],vertices[a]).cross(v().subVectors(vertices[c],vertices[a]));
  if(d.lengthSq()<1e-20)return;
  if(d.dot(normal)>0)indices.push(a,b,c); else indices.push(a,c,b);
}

// Shape the surrounding cortex away from the articular hollow. The support
// direction differs for each column; the rounded lining is a separate surface.
function corticalSurface(l, h, normal) {
  const radius=l.headRadius+.0025*h;
  const fade=radius*.7;
  return p=>{
    const radial=p.clone().sub(l.acetabulum);
    const along=radial.dot(normal), across=radial.addScaledVector(normal,-along).length();
    const shoulder=T.MathUtils.smoothstep(across,radius*.78,radius+fade);
    if(shoulder<1 && along<radius) p.addScaledVector(normal,(radius-along)*(1-shoulder));
    return p;
  };
}

function boneWing({surface,high}, l, h, female) {
  const {P,crest,asis,psis,aiis,sciaticApex,sciaticUpper,acetabulum}=l;
  const outer=P(1,0,0).sub(P(0,0,0)).normalize();
  const up = P(0,1,0).sub(P(0,0,0)).normalize();
  const fit = corticalSurface(l,h,up);
  const lower = new T.CatmullRomCurve3([
    sciaticUpper, line(sciaticUpper,sciaticApex,.52), sciaticApex,
    P(female?.038:.031,.013,-.011), acetabulum.clone().addScaledVector(outer,-.001*h)
      .add(P(0,.010,0).sub(P(0,0,0))), aiis,
  ]);
  const upper = new T.CatmullRomCurve3([
    psis, P(female?.043:.033,female?.058:.062,-.027),
    P(female?.067:.048,female?.066:.072,-.017),crest,
    P(female?.069:.044,female?.066:.070,.011), asis,
  ]);
  const n=high?19:12, rows=high?8:5, stride=n+1, layer=rows*stride;
  const verts=[],idx=[];
  for(const wall of [-1,1])for(let j=0;j<rows;j++)for(let i=0;i<=n;i++){
    const u=i/n,t=j/(rows-1),p=lower.getPoint(u).lerp(upper.getPoint(u),t);
    // The concavity of the iliac fossa stands inside the outer gluteal fan.
    const hollow=Math.sin(Math.PI*t)*Math.sin(Math.PI*u);
    const thickness=(female?.0016:.0024)+.0015*Math.abs(2*t-1);
    p.addScaledVector(outer,(wall*thickness-.008*hollow)*h);
    verts.push(fit(p));
  }
  for(let j=0;j<rows-1;j++)for(let i=0;i<n;i++){
    const a=j*stride+i,b=a+1,c=b+stride,d=a+stride;
    for(let k=0;k<2;k++){
      const s=k*layer,norm=outer.clone().multiplyScalar(k?1:-1);
      face(verts,idx,a+s,b+s,c+s,norm);face(verts,idx,a+s,c+s,d+s,norm);
    }
  }
  const border=[];
  for(let i=0;i<=n;i++)border.push(i);
  for(let j=1;j<rows;j++)border.push(j*stride+n);
  for(let i=n-1;i>=0;i--)border.push((rows-1)*stride+i);
  for(let j=rows-2;j>0;j--)border.push(j*stride);
  const middle=line(lower.getPoint(.5),upper.getPoint(.5),.5);
  for(let i=0;i<border.length;i++){
    const a=border[i],b=border[(i+1)%border.length],norm=line(verts[a],verts[b],.5).sub(middle);
    face(verts,idx,a,b,b+layer,norm);face(verts,idx,a,b+layer,a+layer,norm);
  }
  surface(verts,idx);
}

function acetabularCup({surface,high},l,h) {
  const axis=l.socketAxis, center=l.acetabulum, up=l.P(0,1,0).sub(l.P(0,0,0))
    .projectOnPlane(axis).normalize(), forward=v().crossVectors(axis,up).normalize();
  const sides=high?24:14, rows=high?8:5, radius=l.headRadius+.0008;
  const vertices=[],indices=[];
  const inner=rows*sides;
  for(let wall=0;wall<2;wall++)for(let i=0;i<rows;i++)for(let j=0;j<sides;j++){
    const f=i/(rows-1),a=tau*j/sides;
    // The inferior acetabular notch interrupts the lunate articular rim.
    const angle=.045+f*(1.53-.34*Math.max(0,-Math.cos(a))**10);
    const u=axis.clone().multiplyScalar(-Math.cos(angle)).addScaledVector(up,Math.sin(angle)*Math.cos(a))
      .addScaledVector(forward,Math.sin(angle)*Math.sin(a));
    vertices.push(center.clone().addScaledVector(u,radius+wall*h*(.0022+.0016*f)));
  }
  for(let i=0;i<rows-1;i++)for(let j=0;j<sides;j++){
    const a=i*sides+j,b=i*sides+(j+1)%sides,c=b+sides,d=a+sides;
    for(let w=0;w<2;w++){
      const s=w*inner,n=vertices[a+s].clone().sub(center).multiplyScalar(w?1:-1);
      face(vertices,indices,a+s,b+s,c+s,n);face(vertices,indices,a+s,c+s,d+s,n);
    }
  }
  // The deep articular fossa is closed on both the articular and cortical sides.
  for(let w=0;w<2;w++){
    const pole=vertices.length, normal=axis.clone().multiplyScalar(w?-1:1);
    vertices.push(center.clone().addScaledVector(axis,-radius-w*h*.0022));
    for(let i=0;i<sides;i++)face(vertices,indices,pole,w*inner+i,w*inner+(i+1)%sides,normal);
  }
  const start=(rows-1)*sides;
  for(let j=0;j<sides;j++){
    const a=start+j,b=start+(j+1)%sides,n=axis.clone().multiplyScalar(start?1:-1);
    face(vertices,indices,a,b,b+inner,n);face(vertices,indices,a,b+inner,a+inner,n);
  }
  surface(vertices,indices);
}

function buildRing(rig,female,part,p) {
  const h=rig.height;
  for(const [side,label] of [['L','Left'],['R','Right']]){
    const l=p[side],{P}=l;
    part(label+' hip bone','skeleton',tools=>{
      const {sweep,ellipsoid,cord}=tools;
      boneWing(tools,l,h,female);
      acetabularCup(tools,l,h);
      // The obturator opening is bounded by superior and inferior pubic
      // rami and a separate posterior ischial column, not a painted hole.
      const crest=new T.CatmullRomCurve3([l.psis,P(female?.055:.042,female?.061:.069,-.021),
        l.crest,P(female?.069:.044,female?.066:.070,.011),l.asis]);
      sweep(crest.getPoints(7),[[.0015,.0016],[.0027,.002],[.0024,.002],[.0018,.002]],ivory,
        {across:l.P(0,1,0).sub(l.P(0,0,0)),rows:tools.high?20:13,sides:tools.high?9:6});
      const anterior=P(0,.12,1).sub(P(0,0,0)).normalize();
      const dorsal=P(0,-.18,-1).sub(P(0,0,0)).normalize();
      const medial=l.socketAxis.clone().negate();
      const rim=(direction)=>l.acetabulum.clone().addScaledVector(direction,l.headRadius+.002*h)
        .addScaledVector(medial,.002*h);
      const upperPubis=[rim(anterior),
        P(female?.034:.024,-.001,female?.020:.012),P(female?.017:.013,-.004,female?.029:.019),l.pubis];
      sweep(upperPubis,[[.006,.004],[.0042,.0038],[.0037,.0032],[.0042,.0033]],ivory,{rows:13,sides:9,fit:corticalSurface(l,h,anterior)});
      sweep([l.pubis,l.inferiorPubis,l.ramus,l.ischium],[[.0043,.004],[.0033,.0031],
        [.0038,.0038],[female?.005:.006,.005]],ivory,{rows:15,sides:9});
      const posterior=l.P(female?.037:.030,-.026,-.013);
      sweep([l.ischium,posterior,rim(dorsal),l.sciaticApex],
        [[.0055,.006],[.004,.005],[.0068,.0055],[.003,.004]],ivory,{rows:15,sides:9,fit:corticalSurface(l,h,dorsal)});
      sweep([l.sciaticApex,line(l.sciaticApex,l.sciaticSpine,.70),l.sciaticSpine],
        [[.004,.004],[.0031,.0027],[.001,.001]],ivory,{rows:7,sides:7});
      const mound=(x,y,z)=>l.ischium.clone().add(l.P(l.sign*x,y,z).sub(l.P(0,0,0)));
      ellipsoid(mound,0,.002,0,female?.005:.0055,.005,female?.0067:.007);
      const brim=[l.pubis,P(female?.032:.021,.001,female?.024:.015),
        P(female?.047:.033,.013,.010),P(female?.045:.032,.022,-.009),
        P(female?.029:.020,.034,-.021),P(female?.019:.014,.041,-.020)];
      cord(brim,[.0024,.0016],ivory,{rows:15,sides:7,fit:corticalSurface(l,h,medial)});
    });
  }
  buildSacrum(part,p,h,female);
}

function buildSacrum(part,p,h,female) {
  const xAxis=p.place(1,0,0).sub(p.place(0,0,0)).normalize();
  const peak=p.place(0,female?.012:.009,female?-.032:-.038);
  const sweep=new T.CatmullRomCurve3([p.s1,peak,p.sacralTip]);
  part('Sacrum','skeleton',({surface,cord,high})=>{
    const levels=[0,.064,.12,.25,.295,.34,.445,.505,.54,.64,.69,.725,.81,.85,.92,1];
    const columns=[-1,-.80,-.69,-.32,-.17,0,.17,.32,.69,.80,1];
    const rows=levels.length, cols=columns.length, stride=rows*cols;
    p.s1PlaneVertices=columns.map((_,i)=>i).concat(columns.map((_,i)=>stride+cols-1-i));
    const points=[],indices=[];
    const width=t=>lerp(female?.028:.022,.0037,t**.82);
    const depth=t=>lerp(p.s1Depth,.0032,t);
    function vertex(t,x,wall){
      const at=sweep.getPoint(t), rounded=Math.sqrt(Math.max(.015,1-x*x));
      const ridges=[.072,.302,.505,.69,.85].reduce((sum,level)=>
        sum+Math.exp(-(((t-level-.030*x*x)/.022)**2)),0);
      const relief=wall===0?.0019*ridges*rounded*(1-t):0;
      at.addScaledVector(xAxis,x*width(t)*h);
      return at.addScaledVector(p.s1Forward,(wall===0?1:-1)*(rounded*depth(t)+relief)*h);
    }
    for(let w=0;w<2;w++)for(const t of levels)for(const x of columns)points.push(vertex(t,x,w));
    const count=high?12:8;
    for(let row=0;row<rows-1;row++)for(let col=0;col<cols-1;col++){
      const a=row*cols+col,b=a+1,c=b+cols,d=a+cols;
      const perforated=(col===2||col===7)&&[2,5,8,11].includes(row);
      const mouths=[];
      for(let w=0;w<2;w++){
        const off=w*stride, corners=[a+off,b+off,c+off,d+off];
        const normal=p.s1Forward.clone().multiplyScalar(w?-1:1);
        if(!perforated){
          face(points,indices,corners[0],corners[1],corners[2],normal);
          face(points,indices,corners[0],corners[2],corners[3],normal);
          continue;
        }
        // Ventral foramina are wider than their paired dorsal outlets.
        // The rim passes all the way through the fused sacral segments.
        const rim=[], far=w?.66:1, x0=columns[col],x1=columns[col+1],
          t0=levels[row],t1=levels[row+1], quarter=count/4;
        for(let j=0;j<count;j++){
          const angle=-3*Math.PI/4+j*tau/count;
          rim.push(points.length);
          points.push(vertex((t0+t1)/2+Math.sin(angle)*(t1-t0)*.44*far,
            (x0+x1)/2+Math.cos(angle)*(x1-x0)*.46*far,w));
        }
        for(let k=0;k<4;k++){
          const next=(k+1)%4;
          face(points,indices,corners[k],corners[next],rim[next*quarter],normal);
          for(let z=0;z<quarter;z++){
            const i=k*quarter+z;
            face(points,indices,corners[k],rim[(i+1)%count],rim[i],normal);
          }
        }
        mouths.push(rim);
      }
      if(perforated){
        const center=mouths.flat().reduce((sum,j)=>sum.add(points[j]),v()).multiplyScalar(.5/count);
        for(let i=0;i<count;i++){
          const j=(i+1)%count,u=mouths[0][i],n=mouths[0][j],z=mouths[1][j],r=mouths[1][i];
          const normal=center.clone().sub(line(points[u],points[r],.5));
          face(points,indices,u,n,z,normal);face(points,indices,u,z,r,normal);
        }
      }
    }
    const border=[];
    for(let i=0;i<cols;i++)border.push(i);
    for(let j=1;j<rows;j++)border.push(j*cols+cols-1);
    for(let i=cols-2;i>=0;i--)border.push((rows-1)*cols+i);
    for(let j=rows-2;j>0;j--)border.push(j*cols);
    const mid=sweep.getPoint(.50);
    for(let i=0;i<border.length;i++){
      const a=border[i],b=border[(i+1)%border.length];
      const normal=a<cols&&b<cols?p.s1Normal:line(points[a],points[b],.5).sub(mid);
      face(points,indices,a,b,b+stride,normal);face(points,indices,a,b+stride,a+stride,normal);
    }
    surface(points,indices);
    const posterior=[.02,.23,.48,.72,.90].map(t=>sweep.getPoint(t).addScaledVector(
      p.s1Forward,-h*lerp(p.s1Depth-.001,.003,t)));
    cord(posterior,[.0029,.0018],ivory,{rows:12,sides:7});
    // The auricular buttress joins each ala to the facing sacroiliac surface.
    for(const side of ['L','R']){
      const hip=p[side], P=hip.P;
      const baseRadius=female?.021:.016;
      cord([p.s1.clone().addScaledVector(xAxis,hip.sign*baseRadius*h),
        P(female?.023:.018,female?.038:.041,female?-.024:-.028),
        line(hip.psis,hip.sciaticUpper,.18)],
        [.0045,.0055],ivory,{rows:7,sides:high?9:7});
    }
  });
  part('Coccyx','skeleton',({sweep})=>{
    const tip=p.coccyx;
    sweep([p.sacralTip,line(p.sacralTip,tip,.32).addScaledVector(p.s1Forward,-.003*h),
      line(p.sacralTip,tip,.64).addScaledVector(p.s1Forward,-.002*h),tip],
      [[.0038,.003],[.0034,.0028],[.0024,.002],[.0019,.0018],[.0007,.001]],
      ivory,{rows:12,sides:8});
  });
}

function shaftLoft(tools, points, lateral, anterior, h, rings, section) {
  const {high,surface}=tools,sides=high?18:12,verts=[],ids=[];
  for(const [t,rx,rz] of rings){
    const center=points(t);
    for(let j=0;j<sides;j++){
      const [x,z]=section(t,Math.cos(tau*j/sides),Math.sin(tau*j/sides));
      verts.push(center.clone().addScaledVector(lateral,x*rx*h).addScaledVector(anterior,z*rz*h));
    }
  }
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++){
    const a=i*sides+j,b=i*sides+(j+1)%sides,c=b+sides,d=a+sides;
    const norm=verts[a].clone().sub(points(rings[i][0]));
    face(verts,ids,a,b,c,norm);face(verts,ids,a,c,d,norm);
  }
  const direction=points(1).sub(points(0)).normalize();
  for(const row of [0,rings.length-1]){
    const start=row*sides,norm=direction.clone().multiplyScalar(row?1:-1);
    for(let i=1;i<sides-1;i++)face(verts,ids,start,start+i,start+i+1,norm);
  }
  surface(verts,ids);
}

function buildFemur(rig,female,l,label,part) {
  const h=rig.height;
  part(label+' femur','skeleton',tools=>{
    const {net,sweep,ellipsoid,high}=tools;
    const ball=l.femoralHead, along=ball.clone().sub(l.junction).normalize();
    const lat=l.forward, tangent=lat.clone().projectOnPlane(along).normalize();
    const binormal=v().crossVectors(along,tangent).normalize();
    // Offset the small foveal depression posteroinferior to the pole; the
    // medial head remains spherical across the cartilage-bearing region.
    net(high?15:10,high?21:14,(_i,_j,t,a)=>{
      const phi=(t-.5)*3.11, ring=Math.cos(phi), tip=Math.sin(phi);
      const dir=along.clone().multiplyScalar(tip).addScaledVector(tangent,ring*Math.cos(a))
        .addScaledVector(binormal,ring*Math.sin(a));
      const dimple=.075*Math.exp(-((tip-.82)**2/.012+(ring*Math.cos(a)+.47)**2/.028));
      return ball.clone().addScaledVector(dir,l.headRadius*(1-dimple));
    },ivory);
    const n=l.headRadius/h, narrow=female?.0057:.0067;
    sweep([line(ball,l.junction,.27),line(ball,l.junction,.62),l.junction,l.shaftPoint(.05)],
      [[n*.82,n*.82],[narrow,narrow*.94],[narrow*1.31,narrow*1.38],[narrow*1.15,narrow*1.22]],ivory,
      {across:l.forward,rows:high?12:8,sides:high?14:9});
    const base=female?.0070:.0076;
    shaftLoft(tools,l.shaftPoint,l.outer,l.forward,h,[
      [0,base*1.22,base*1.25],[.08,base*1.14,base*1.15],[.22,base,base*1.02],
      [.44,base*.88,base*.91],[.64,base*.87,base*.91],[.79,base*1.00,base*1.00],
      [.87,base*1.18,base*1.13],[.94,base*1.54,base*1.22],[.975,base*1.52,base*1.15],
    ],(_t,c,s)=>[c,s]);
    const point=(x,y,z)=>l.greaterTrochanter.clone().addScaledVector(l.outer,l.sign*x*h)
      .addScaledVector(l.down,-y*h).addScaledVector(l.forward,z*h);
    ellipsoid(point,0,-.001,0,.0058,.0097,.0060);
    const lesser=(x,y,z)=>l.lesserTrochanter.clone().addScaledVector(l.outer,l.sign*x*h)
      .addScaledVector(l.down,-y*h).addScaledVector(l.forward,z*h);
    ellipsoid(lesser,0,0,0,.0036,.0047,.0038);
    sweep([l.greaterTrochanter,l.shaftPoint(.033,.003,.005),l.lesserTrochanter],
      [[.0029,.0022],[.0016,.0012],[.0018,.0017]],ivory,{rows:9,sides:7});
    sweep([l.shaftPoint(.06,.003,-.007),l.glutealTuberosity,l.lineaAspera,
      l.shaftPoint(.68,-.001,-.006),l.shaftPoint(.87,-.003,-.007)],
      [[.0020,.0018],[.0021,.0016],[.0013,.0013],[.0018,.0012]],ivory,{rows:13,sides:7});
    // Two posterior articular condyles flank the intercondylar notch. The
    // cartilage-bearing front lips slope into the central patellar sulcus.
    for(const medial of [true,false]){
      const offset=medial?-.0059:.0060;
      const condyle=(x,y,z)=>l.shaftPoint(.974,offset+l.sign*x,z-.001)
        .addScaledVector(l.down,-y*h);
      ellipsoid(condyle,0,medial?-.0007:0,-.0022,.0049,.0064,.0094);
      const lip=[l.shaftPoint(.915,offset*.76,.005),l.shaftPoint(.946,offset*.95,.0083),
        l.shaftPoint(.979,offset,.0073),l.shaftPoint(.989,offset,.003)];
      sweep(lip,[[.0025,.0022],[.0037,.0028],[.0034,.0027],[.0024,.0022]],joint,{rows:8,sides:7});
    }
  });
}

function buildLeg(rig,female,l,label,part) {
  const h=rig.height;
  part(label+' tibia','skeleton',tools=>{
    const scale=female?.93:1;
    const shape=(t,c,s)=>{
      // The posterior calf surface is rounded; the anterior border of the
      // shaft meets its two flat faces in a distinct subcutaneous crest.
      const ridge=Math.sin(Math.PI*Math.min(1,(t+.08)/1.18))*.85;
      return [c*scale,s>0?lerp(s,Math.max(0,1-Math.abs(c))*.97,ridge):s*.82];
    };
    // Register the broad tibial plateau beneath both condyles. Sippy's
    // narrow leg has less space medial to the patellar equator.
    const tibial=(t,x=0,z=0)=>{
      const plateau=female ? 0 : .0033*(1-T.MathUtils.smoothstep(t,.08,.25));
      return l.shinPoint(t,x-.002+plateau,z);
    };
    shaftLoft(tools,tibial,l.shinOut,l.shinForward,h,[
      [.020,.0108,.009],[.032,.013,.0105],[.055,.012,.0102],[.100,.0094,.0082],
      [.173,.0078,.0077],[.31,.0068,.0071],[.50,.0058,.0068],
      [.70,.0051,.0055],[.83,.0054,.0056],[.935,.0065,.0063],[.988,.0081,.0068],
    ],shape);
    const bump=(x,y,z)=>l.tibialTuberosity.clone().addScaledVector(l.shinOut,l.sign*x*h)
      .addScaledVector(l.shinDown,-y*h).addScaledVector(l.shinForward,z*h);
    tools.ellipsoid(bump,0,.0005,-.0025,.0033,.0061,.0032);
    tools.sweep([l.shinPoint(.91,-.006,-.001),l.shinPoint(.965,-.009,-.002),
      l.shinPoint(1.012,-.010,-.001)],[[.0038,.0040],[.0038,.0049],[.0024,.0037]],ivory,{rows:9,sides:8});
  });
  part(label+' fibula','skeleton',tools=>{
    const fib=(t)=>l.shinPoint(t,lerp(.0117,.0108,t),lerp(-.0055,-.0023,t));
    shaftLoft(tools,fib,l.shinOut,l.shinForward,h,[
      [.055,.0034,.0041],[.069,.0041,.0046],[.084,.0039,.0042],[.122,.0027,.0030],
      [.22,.0026,.0028],[.50,.0024,.0025],[.74,.0022,.0023],[.90,.0025,.003],
      [.966,.0033,.0041],[1.015,.0032,.0038],[1.032,.0016,.0022],
    ],(t,c,s)=>[c*(female?.93:1),s]);
  });
  part(label+' patella','skeleton',({bands})=>{
    const place=(x,y,z)=>l.patella.clone().addScaledVector(l.outer,l.sign*x*h)
      .addScaledVector(l.down,-y*h).addScaledVector(l.forward,z*h);
    bands(place,[[-.008,.0008,.0011,0],[-.006,.003,.0024,.0009],
      [-.002,.006,.0035,.0014],[.002,.0072,.0038,.0013],
      [.006,.0064,.0032,0],[.0077,.0046,.0023,-.0007]],ivory,14);
  });
}

export function buildLower(rig, roma, part, pelvis=pelvisLandmarks(rig,roma)) {
  buildRing(rig,roma,part,pelvis);
  for(const [side,label] of [['L','Left'],['R','Right']]){
    buildFemur(rig,roma,pelvis[side],label,part);
    buildLeg(rig,roma,pelvis[side],label,part);
    buildFoot(rig,roma,side,part);
  }
}
