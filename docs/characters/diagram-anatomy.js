// Original cutaway anatomy registered to the live actor's posed joints.
// The rendered world-space points are also used for picking and measurements.
import * as T from 'three';

const tau = Math.PI * 2;
const lerp = T.MathUtils.lerp;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const ivory = new T.Color('#dfc69c'), joint = new T.Color('#a9b6a5');
const muscle = new T.Color('#a5483d'), fibre = new T.Color('#c97760'), tendon = new T.Color('#e6c7a1');
const romaSkin = new T.Color('#d5956e'), sippySkin = new T.Color('#dfa071');
const digitNames = ['Index', 'Middle', 'Ring', 'Little', 'Thumb'];

function fabricator(tier, height, parts) {
  const high = tier === 'high';
  const materials = new Map();
  function part(name, layer, assemble) {
    const pos = [], ink = [], idx = [];
    function vert(p, color) {
      pos.push(p.x, p.y, p.z);
      ink.push(color.r, color.g, color.b);
      return pos.length / 3 - 1;
    }
    // A capped loft keeps every measure on the actual visible surface.
    function net(rowCount, sides, get, color, cap = true) {
      const first = pos.length / 3;
      for (let i = 0; i < rowCount; i++) {
        const t = i / (rowCount - 1);
        for (let j = 0; j < sides; j++) {
          const a = tau * j / sides;
          vert(get(i, j, t, a), typeof color === 'function' ? color(t, a) : color);
          if (i) {
            const b = first + (i - 1) * sides + j, next = first + (i - 1) * sides + (j + 1) % sides;
            idx.push(b, next, next + sides, b, next + sides, b + sides);
          }
        }
      }
      if (cap) {
        const last = first + (rowCount - 1) * sides;
        for (let i = 1; i < sides - 1; i++) idx.push(first, first + i + 1, first + i, last, last + i, last + i + 1);
      }
    }
    function sweep(points, radii, color = ivory, options = {}) {
      const curve = new T.CatmullRomCurve3(points);
      const rows = options.rows ?? (high ? 18 : 11), sides = options.sides ?? (high ? 12 : 8);
      let basis = options.across?.clone() || v(1, 0, 0), up, center, rx, rz;
      net(rows, sides, (i, j, t, a) => {
        if (j === 0) {
          center = curve.getPoint(t);
          const axis = curve.getTangent(t);
          basis.addScaledVector(axis, -axis.dot(basis));
          if (basis.lengthSq() < 0.00001) {
            basis = Math.abs(axis.z) < .85 ? v(0, 0, 1) : v(0, 1, 0);
            basis.addScaledVector(axis, -axis.dot(basis));
          }
          basis.normalize();
          up = v().crossVectors(axis, basis).normalize();
          const u = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(u));
          rx = height * lerp(radii[k][0], radii[k + 1][0], u - k);
          rz = height * lerp(radii[k][1], radii[k + 1][1], u - k);
        }
        return center.clone().addScaledVector(basis, rx * Math.cos(a)).addScaledVector(up, rz * Math.sin(a));
      }, color);
    }
    function bands(place, rings, color = ivory, sides = high ? 28 : 16) {
      net(rings.length, sides, (i, j, t, a) => {
        const [y, rx, rz, cz = 0, cx = 0] = rings[i];
        return place(cx + rx * Math.cos(a), y, cz - rz * Math.sin(a));
      }, color);
    }
    function ellipsoid(place, x, y, z, rx, ry, rz, color = ivory) {
      const n = high ? 12 : 8, rings = [];
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (i / n - .5), r = Math.max(.025, Math.cos(a));
        rings.push([y + ry * Math.sin(a), rx * r, rz * r, z, x]);
      }
      bands(place, rings, color, high ? 20 : 12);
    }
    function cord(points, radius, color = ivory, options = {}) {
      const cross = Array.isArray(radius) ? radius : [radius, radius];
      sweep(points, [cross, cross], color, options);
    }
    function longBone(points, width, depth = width, options = {}) {
      const diameters = [.63, 1.16, .94, .62, .53, .57, .65, .86, 1.22, .84];
      sweep(points, diameters.map(k => [width*k, depth*k]), ivory, options);
    }
    function belly(points, width, depth, options = {}) {
      const shape = options.shape || [.15, .32, .72, .96, 1, .82, .5, .22, .13];
      sweep(points, shape.map(k => [width*k, depth*k]), (t, a) => {
        const attachment = .85*Math.exp(-((t/.14)**2)) + .9*Math.exp(-(((1-t)/.15)**2));
        return muscle.clone().lerp(fibre, .18+.17*Math.cos(a*5+.9*Math.sin(Math.PI*t))**2)
          .lerp(tendon, attachment);
      }, options);
    }
    assemble({ bands, ellipsoid, longBone, belly, cord, sweep });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(ink, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingBox();
    if (!materials.has(layer)) materials.set(layer, new T.MeshStandardMaterial({
      vertexColors: true, roughness: layer === 'muscles' ? .65 : .82,
    }));
    const mesh = new T.Mesh(g, materials.get(layer));
    mesh.name = name;
    parts.push({ name, mesh, layer, source: 'authored' });
  }
  return part;
}

function local(node) {
  return (x, y, z) => v(x, y, z).applyMatrix4(node.matrixWorld);
}
function track(node, child) {
  const place = local(node), d = child.position;
  return (t, x = 0, z = 0) => place(d.x*t + x, d.y*t, d.z*t + z);
}
function path(place, coordinates) {
  return coordinates.map(p => place(...p));
}

// Eye sockets are real apertures bounded by the brow, maxilla and zygomatic
// arches. The back of the cranial vault can be seen through the apertures.
function headParts(rig, roma, part) {
  const frame = rig.root.getObjectByName(roma ? 'face and band' : 'sippy-head');
  const base = local(frame);
  const w = roma ? .061 : .054, h = roma ? .143 : .121, d = roma ? .051 : .044;
  const face = (x, y, z) => base(w*x, .005 + h*y, (roma ? .003 : -.001) + d*z);
  part('Cranial vault', 'skeleton', ({ bands }) => {
    bands(face, [[.34,.31,.38,-.31],[.43,.62,.46,-.32],[.56,.83,.56,-.29],
      [.67,.86,.65,-.17],[.73,.86,.73,-.11],[.83,.73,.65,-.14],
      [.91,.54,.52,-.16],[.97,.27,.28,-.15],[.985,.045,.08,-.15]]);
  });
  for (const s of [-1,1]) {
    const prefix = s === 1 ? 'Left' : 'Right';
    const p = (x,y,z) => face(s*x,y,z);
    part(prefix+' orbital rim and cheekbone','skeleton',({ cord })=>{
      cord(path(p,[[.10,.49,.69],[.15,.59,.72],[.38,.66,.70],[.62,.65,.60],
        [.76,.57,.43],[.72,.47,.47],[.52,.415,.63],[.30,.42,.71],[.10,.49,.69]]), [.0031,.0037]);
      cord(path(p,[[.76,.53,.41],[.84,.49,.13],[.81,.49,-.19],[.69,.52,-.37]]), .0036);
    });
  }
  part('Maxilla and nasal aperture','skeleton',({ cord, bands })=>{
    bands(face,[[.185,.31,.12,.56],[.215,.40,.18,.52],[.265,.415,.19,.47],[.31,.28,.13,.47]]);
    for (const s of [-1,1]) {
      cord(path(face,[[s*.51,.445,.62],[s*.39,.37,.63],[s*.32,.29,.66],[s*.22,.24,.68]]),.0035);
      cord(path(face,[[0,.59,.70],[s*.10,.49,.77],[s*.17,.36,.77],[s*.13,.31,.72],[0,.325,.72]]),.0024);
    }
  });
  part('Mandible','skeleton',({ sweep })=>{
    const jaw = (x,y,z) => face(x*(roma?.90:1),y+(roma?.016:0),z);
    sweep(path(jaw,[[-.73,.48,-.18],[-.72,.32,-.15],[-.64,.15,-.06],[-.40,.105,.39],
      [0,.085,.57],[.40,.105,.39],[.64,.15,-.06],[.72,.32,-.15],[.73,.48,-.18]]),
      [[.0027,.0033],[.0054,.0056],[.0052,.0051],[.0054,.0056],[.0027,.0033]],
      ivory,{across:v(0,1,0),rows:28});
  });
  for (const s of [-1,1]) {
    const p = (x,y,z) => face(s*x,y,z), side=s===1?'Left ':'Right ';
    part(side+'temporalis','muscles',({belly})=>{
      belly(path(p,[[.64,.83,-.06],[.77,.72,.02],[.77,.59,.13],[.66,.39,.14]]),
        .012,.0038,{across:v(0,1,0)});
    });
    part(side+'orbicularis oculi','muscles',({sweep})=>{
      sweep(path(p,[[.14,.51,.75],[.23,.59,.74],[.44,.61,.72],[.62,.56,.63],
        [.64,.51,.61],[.49,.455,.71],[.28,.46,.76],[.14,.51,.75]]),
        [[.0025,.0024],[.0036,.0026],[.0030,.0025],[.0031,.0021],[.0025,.0024]],fibre,
        {across:v(0,1,0),rows:20});
    });
    part(side+'zygomaticus major','muscles',({belly})=>{
      belly(path(p,[[.65,.45,.58],[.56,.39,.63],[.43,.33,.68],[.32,.27,.71]]),.0037,.0024);
    });
    part((s===1?'Left':'Right')+' masseter','muscles',({belly})=>{
      belly(path(p,[[.68,.46,.20],[.72,.39,.13],[.66,.27,.09],[.57,.17,.10]]), .008,.004);
    });
  }
}

function axialParts(rig, roma, part) {
  const shoulder = rig.upperArmL.position.y;
  const chest = local(rig.chest), hips = local(rig.hips);
  const hi = v().setFromMatrixPosition(rig.head.matrixWorld);
  const ac = (x,t,z) => chest(x, shoulder*t, z);
  const neck = (t,x,z) => chest(x,shoulder,-.004+z).lerp(
    local(rig.head)(x, .013,z-.003),t);
  const ribScale = roma ? 1.1 : 1;
  const spine = t => {
    if (t > .81) return neck((t-.81)/.19,0,roma ? -.0075 : .003);
    const p0 = hips(0,.004,-.015), p1 = ac(0,.98,-.018);
    return p0.lerp(p1,t/.81).addScaledVector(v(0,0,1),
      rig.height*(.010*Math.sin(2*Math.PI*t/.81)-.0045*Math.sin(Math.PI*t/.81)));
  };
  const levels = [5,12,7], groups = ['Lumbar','Thoracic','Cervical'];
  let start = 0;
  for (let region = 0; region < levels.length; region++) {
    const end = [.29,.81,1][region], count = levels[region];
    for (let i = 0; i < count; i++) {
      const t = lerp(start,end,(i+.45)/count);
      const center = spine(t), point=(x,y,z)=>center.clone().add(v(x,y,z).multiplyScalar(rig.height));
      const width = lerp(.010,roma?.0065:.0055,t), thick = spine(t+.002).distanceTo(spine(t-.002)) *
        ((end-start)/count)/(.004*rig.height)*.38;
      part(groups[region]+' vertebra '+['L','T','C'][region]+(count-i),'skeleton',({bands,cord})=>{
        bands(point,[[-thick,width*.88,width*.69,.002],[0,width,width*.8,.002],
          [thick,width*.9,width*.72,.002]],ivory,12);
        cord(path(point,[[-width*1.55,0,-.005],[-width*.72,0,-.0035],
          [0,-.001,-.007],[width*.72,0,-.0035],[width*1.55,0,-.005]]),.0018);
        const spineLength = region === 2 ? .006 : .0125;
        cord(path(point,[[0,0,-.004],[0,-thick,-spineLength*.8],[0,-thick*1.1,-spineLength]]),.0018);
      });
    }
    start=end;
  }
  part('Sacrum','skeleton',({bands})=>{
    bands((x,y,z)=>hips(x,y,z+.005),[[-.037,.004,.004,-.019],[-.026,.012,.006,-.023],
      [-.004,.019,.007,-.021],[.012,.022,.006,-.018],[.017,.013,.004,-.016]]);
  });
  for (const s of [-1,1]) {
    const side=s===1?'Left ':'Right ', p=(x,y,z)=>hips(s*x*(roma?.95:.81),y,z+.002);
    part(side+'hip bone','skeleton',({sweep,cord})=>{
      // Fan the broad iliac crest above a narrow acetabulum and a patent
      // obturator foramen. The pubic rami meet at the anterior symphysis.
      sweep(path(p,[[.018,.012,-.018],[.034,.021,-.020],[.049,.017,-.015],
        [.050,.003,-.005],[.046,-.010,.001]]),
        [[.003,.004],[.011,.015],[.010,.021],[.009,.014],[.007,.010]],ivory,
        {across:v(0,1,0)});
      cord(path(p,[[.046,-.008,.002],[.035,-.010,.016],[.013,-.014,.020],[.004,-.021,.019],
        [.015,-.034,.007],[.033,-.039,-.004],[.044,-.024,-.012],[.046,-.008,.002]]),.0042);
    });
    part(side+'clavicle','skeleton',({cord})=>{
      const shoulderJoint = local(s===1?rig.upperArmL:rig.upperArmR)(s*(roma?-.006:-.030),-.014,0);
      cord([...path(ac,[[s*.006,.77,.026],[s*.032,.84,.023],[s*.060,.91,.011]]),shoulderJoint],.0032);
    });
    part(side+'scapula','skeleton',({sweep,cord})=>{
      sweep(path(ac,[[s*.032,.16,-.022],[s*.042,.45,-.025],[s*.055,.72,-.020],
        [s*.074,.90,-.009]]),[[.001,.002],[.010,.0025],[.015,.0035],[.005,.003]],
        ivory,{across:v(1,0,0)});
      cord(path(ac,[[s*.032,.52,-.027],[s*.049,.75,-.026],[s*.078,.91,-.006]]),.0035);
    });
    for (let i=0;i<12;i++) {
      const u=i/11, y=.79-.9*u, w=(.043+.018*Math.sin(Math.PI*u))*(1-.22*u*u)*ribScale;
      const ribs=(x,t,z)=>ac(s*x,t,z);
      const endX = i>=10 ? w*.81 : i>=7 ? .010+(i-7)*.005 : .0038;
      const zEnd=i>=10 ? .004 : .036-.011*u;
      part(side+'rib '+(i+1),'skeleton',({sweep})=>{
        sweep(path(ribs,[[.007,y,-.021],[w*.65,y+.016,-.034],[w,y-.055,-.006],
          [w*.94,y-.107,.013],[endX,y-.14+(i>=7?.025*(i-7):0),zEnd]]),
          [[.0022,.0018],[.0031,.0020],[.0030,.0020],[.0023,.0017],[.0018,.0014]],
          (t)=>t>.80&&i<10?joint:ivory,{across:v(0,1,0),rows:17});
      });
    }
  }
  part('Sternum','skeleton',({sweep})=>{
    sweep(path(ac,[[0,.84,.029],[0,.72,.037],[0,.55,.038],[0,.31,.036],[0,.14,.032]]),
      [[.006,.002],[.008,.003],[.005,.0025],[.0045,.002],[.0013,.0014]]);
  });

  for (const s of [-1,1]) {
    const side=s===1?'Left ':'Right ', m=(x,t,z)=>ac(s*x,t,z);
    const bundle=(name,anchors,w,d,opts)=>part(side+name,'muscles',({belly})=>belly(path(m,anchors),w,d,opts));
    bundle('pectoralis major',[[.006,.40,.034],[.021,.49,.037],[.039,.59,.031],[.061,.76,.019],[.080,.92,.005]],.018,.0065,{across:v(0,1,0)});
    bundle('external oblique',[[.046,.25,.018],[.046,.03,.020],[.043,-.26,.021],[.033,-.53,.020]],.010,.0048);
    bundle('latissimus dorsi',[[.017,-.33,-.022],[.030,-.05,-.026],[.045,.26,-.025],[.061,.64,-.012]],
      .012,.005);
    bundle('trapezius',[[.012,1.09,-.014],[.027,.88,-.021],[.057,.78,-.024],[.077,.81,-.015]],
      .014,.006);
    part(side+'erector spinae','muscles',({belly})=>{
      const anchors=[.08,.25,.49,.72,.82].map(t=>spine(t).add(v(s*.010,0,-.002).multiplyScalar(rig.height)));
      belly(anchors,.006,.0038);
    });
    part(side+'serratus anterior','muscles',({belly})=>{
      for(let i=0;i<4;i++){
        const t=.38-i*.12;
        belly(path(m,[[.043,t+.05,.025],[.052,t+.04,.016],[.056,t+.12,-.001]]),.0036,.0024);
      }
    });
    part(side+'rectus abdominis','muscles',({belly})=>{
      for(let j=0;j<4;j++){
        const t0=-.58+j*.196;
        belly(path(m,[[.011,t0,.030],[.012,t0+.089,.037],[.013,t0+.181,.033]]),.0105,.007,
          {rows:9,shape:[.51,.91,1,.95,.52]});
      }
    });
    part(side+'sternocleidomastoid','muscles',({belly})=>{
      const low = m(.012,.85,.010), top=hi.clone().add(v(s*(roma?.015:.008),.010,.002).multiplyScalar(rig.height));
      belly([low,low.clone().lerp(top,.52).add(v(0,0,.001)),top],.0032,.0025);
    });
    part(side+'gluteus maximus','muscles',({belly})=>{
      belly(path((x,y,z)=>hips(s*x,y,z),[[.018,.014,-.020],[.031,-.006,-.026],[.043,-.024,-.022],
        [.052,-.037,-.012]]),.018,.008);
    });
  }
}

function limbs(rig, roma, part) {
  for (const [side,s] of [['L',1],['R',-1]]) {
    const prefix=side==='L'?'Left ':'Right ';
    const arm=rig['upperArm'+side], elbow=rig['forearm'+side], wrist=rig['hand'+side],
      hip=rig['thigh'+side], knee=rig['shin'+side], ankle=rig['foot'+side];
    const legDepth = roma ? 0 : -.017;
    const armAxis=track(arm,elbow), legAxis=track(hip,knee);
    // The live shoulder and femoral pivot sit outboard of their surface sockets.
    // Follow the medial humeral head and femoral neck into each drawn shaft.
    const medial = (t, range) => (1-T.MathUtils.smoothstep(t,0,range));
    const upper=(t,x=0,z=0)=>armAxis(t,x-s*(roma?0:.033)*medial(t,.43),z),
      femur=(t,x=0,z=0)=>legAxis(t,x-s*(roma?0:.029)*medial(t,.46),z-(roma?0:.009)*medial(t,.48)),
      lower=track(elbow,wrist), shin=track(knee,ankle);
    const kneeCap = (x,y,z)=>local(knee)(x,y,z+legDepth);
    const hand=(x,y,z)=>local(wrist)(s*x*(roma?1:1.14),y*(roma?1:1.06),z*(roma?1:1.14)), foot=(x,y,z)=>local(ankle)(s*x,y,z);
    const draw = (name,layer,fn)=>part(prefix+name,layer,fn);
    draw('humerus','skeleton',({longBone,ellipsoid})=>{
      longBone(path(upper,[[.06,0,0],[.32,s*.001,.001],[.70,s*.001,-.001],[.97,0,0]]),.008,.007);
      ellipsoid(local(arm),-s*(roma?.001:.032),-.013,0,.009,.009,.008);
    });
    draw('radius','skeleton',({longBone})=>{
      longBone(path(lower,[[.025,-s*.005,.004],[.28,-s*.007,.003],[.71,-s*.006,.005],
        [.985,-s*.005,.004]]),.0044,.0042);
    });
    draw('ulna','skeleton',({longBone})=>{
      longBone(path(lower,[[-.008,s*.002,-.004],[.23,s*.004,-.005],[.64,s*.004,-.004],
        [.967,s*.003,-.003]]),.0048,.004);
    });
    draw('femur','skeleton',({longBone,ellipsoid})=>{
      longBone(path(femur,[[.025,-s*.010,0],[.085,s*.004,-.003],[.23,s*.004,legDepth*.70],
        [.57,s*.002,legDepth],[.96,0,legDepth]]),.0105,.0103);
      ellipsoid(local(hip),-s*(roma?.009:.035),-.005,roma?0:-.005,.009,.009,.010);
    });
    draw('tibia','skeleton',({longBone})=>{
      longBone(path(shin,[[.022,0,legDepth],[.11,-s*.002,legDepth*.95],
        [.42,-s*.002,legDepth*.55],[.72,-s*.002,-.002],[.99,-s*.002,.0005]]),.009,.0085);
    });
    draw('fibula','skeleton',({longBone})=>{
      longBone(path(shin,[[.089,s*.012,legDepth-.003],[.38,s*.013,legDepth*.70-.004],
        [.75,s*.009,-.005],[1,s*.009,-.002]]),.0035,.0037);
    });
    draw('patella','skeleton',({bands})=>{
      bands(kneeCap,[[-.013,.002,.002,.014],[-.008,.006,.003,.016],[.000,.009,.004,.017],
        [.006,.008,.004,.016],[.009,.005,.002,.015]],ivory,14);
    });
    draw('carpal bones','skeleton',({ellipsoid})=>{
      for(let j=0;j<2;j++) for(let i=0;i<4;i++){
        if(roma) ellipsoid(hand,(i-1.5)*.0062,-.003-j*.005,.001+(j%2)*.002,.0038,.0034,.0039);
        else ellipsoid(hand,.002+(j%2)*.001,-.003-j*.004,(i-1.5)*.0060,.0034,.0034,.0041);
      }
    });
    for(let k=0;k<5;k++){
      const thumb=k===4, fingerLength=[.021,.025,.023,.018][k];
      let points;
      if(roma){
        const x=(k-1.5)*.0087;
        points=thumb?[[-.004,-.006,.003],[-.011,-.014,.007],[-.017,-.024,.011],[-.021,-.030,.013]]:
          [[x*.55,-.006,.001],[x*.75,-.017,.003],[x,-.031,.006],
            [x,-.036-fingerLength*.30,.008],[x*.96,-.036-fingerLength*.59,.009],
            [x*.90,-.035-fingerLength*.84,.010]];
      } else {
        const z=.0143-k*.0096, l=[.020,.025,.023,.017][k], b=-.030+.002*Math.abs(k-1), x=.006-.0015*Math.abs(k-1);
        points=thumb?[[-.003,-.006,.004],[-.015,-.014,.017],[-.016,-.021,.026],[-.013,-.027,.029],[-.007,-.029,.027]]:
          [[.001,-.006,z*.47],[.003,-.019,z*.88],[x,b+.002,z],
            [x+.0004,b-l*.40,z],[x-.0037,b-l*.75,z+.0012],[x-.0095,b-l*.95,z+.0043]];
      }
      const p=path(hand,points);
      draw(digitNames[k].toLowerCase()+' metacarpal and phalanges','skeleton',({longBone})=>{
        const knuckle=thumb?1:2;
        longBone(p.slice(0,knuckle+1),thumb?.0026:.0024,.0023,{rows:8,sides:7});
        for(let j=knuckle;j<p.length-1;j++)
          longBone([p[j].clone().lerp(p[j+1],.05),p[j].clone().lerp(p[j+1],.97)],
            thumb?.0016:(roma?.00195:.00105),roma?.0018:.00105,{rows:7,sides:6});
      });
    }
    draw('calcaneus and talus','skeleton',({ellipsoid})=>{
      ellipsoid(foot,0,-.023,-.008,.014,.010,.016);
      ellipsoid(foot,-.001,-.009,-.003,.012,.009,.012);
    });
    draw('midfoot tarsals','skeleton',({ellipsoid})=>{
      for(let k=0;k<4;k++) ellipsoid(foot,(k-1.5)*.007,-.019,.012+(k%2)*.005,.0065,.006,.009);
    });
    for(let k=0;k<5;k++){
      const x=(k-2)*.0068,z=.059-.0035*k, a=foot(x*.67,-.020,.015),b=foot(x,-.029,z-.022);
      draw((k===0?'great toe':'toe '+(k+1))+' metatarsal and phalanges','skeleton',({longBone})=>{
        const segments=k===0?2:3;
        longBone([a,a.clone().lerp(b,.50).add(v(0,.002,0)),b], k===0?.0036:.0026,.0028,{rows:8});
        for(let j=0;j<segments;j++){
          const t0=j/segments,t1=(j+.94)/segments;
          longBone([foot(x,-.027-.002*t0,lerp(z-.021,z,t0)),foot(x*.98,-.027-.002*t1,lerp(z-.021,z,t1))],
            k===0?.0033:.0020,.002,{rows:7,sides:7});
        }
      });
    }

    function bundle(name,curve,pts,w,d){
      draw(name,'muscles',({belly})=>belly(path(curve,pts),w*(roma?1.08:1),d*(roma?1.12:1)));
    }
    bundle('deltoid',upper,[[.026,-s*.003,0],[.08,s*.003,0],[.16,s*.008,-.001],[.34,s*.006,-.001]],.008,.008);
    bundle('biceps brachii',upper,[[.04,0,.003],[.28,-s*.001,.006],[.50,0,.011],[.73,-s*.002,.010],[.99,0,.005]],.007,.0055);
    bundle('triceps brachii',upper,[[.08,-s*.002,-.002],[.32,s*.001,-.008],[.53,s*.002,-.011],[.79,0,-.012],[.99,.001,-.006]],.010,.007);
    bundle('forearm flexors',lower,[[.012,-s*.005,.003],[.22,-s*.004,.011],[.44,-s*.006,.011],[.78,-s*.004,.007],[.98,-s*.003,.005]],.0078,.006);
    bundle('forearm extensors',lower,[[.025,s*.005,-.003],[.23,s*.005,-.009],[.45,s*.006,-.009],[.81,s*.003,-.006],[.99,s*.002,-.004]],.007,.005);
    bundle('rectus femoris',femur,[[.01,-s*.004,.004],[.24,0,.016+legDepth*.4],[.48,0,.019+legDepth*.8],
      [.74,-s*.001,.016+legDepth],[.99,0,.014+legDepth]],.012,.007);
    bundle('vastus lateralis',femur,[[.10,s*.004,.002],[.27,s*.014,legDepth*.5],[.49,s*.018,legDepth*.85],
      [.77,s*.010,legDepth+.007],[.96,s*.004,legDepth+.012]],.007,.010);
    bundle('hamstrings',femur,[[.026,-s*.005,-.014],[.24,-s*.004,legDepth*.8-.014],
      [.47,-s*.002,legDepth-.016],[.76,0,legDepth-.011],[.99,s*.006,legDepth-.007]],.012,.0067);
    bundle('gastrocnemius',shin,[[.015,0,legDepth-.007],[.20,s*.005,legDepth-.012],[.37,s*.002,legDepth*.9-.015],
      [.60,0,legDepth*.5-.012],[.90,0,-.009]],.010,.007);
    bundle('tibialis anterior',shin,[[.09,s*.006,legDepth+.008],[.26,s*.009,legDepth*.8+.008],
      [.51,s*.009,legDepth*.5+.009],[.81,s*.003,.005],[.99,-s*.001,.006]],.0055,.004);
    draw('Achilles tendon','muscles',({sweep})=>{
      sweep(path(shin,[[.53,0,legDepth*.6-.014],[.73,0,-.014],[.94,0,-.012],[1.08,0,-.012]]),
        [[.0046,.003],[.0035,.0023],[.0025,.0018],[.003,.0024]],tendon);
    });
    draw('thenar muscles','muscles',({belly})=>{
      const pts=roma?[[-.005,-.003,.003],[-.009,-.013,.007],[-.012,-.022,.009],[-.016,-.027,.010]]:
        [[-.003,-.005,.005],[-.007,-.014,.009],[-.010,-.020,.014],[-.014,-.025,.025]];
      belly(path(hand,pts),roma?.0045:.0028,roma?.003:.0021);
    });
    draw('plantar foot muscles','muscles',({belly})=>{
      belly(path(foot,[[0,-.030,-.017],[-.006,-.030,.007],[-.006,-.031,.036],[-.010,-.031,.055]]),.011,.0035);
    });
  }
}

// Roma's shipped costume covers her trunk and limbs, which have no underlying
// skin triangles there. These inspection-only sections meet her real neck and
// wrists; her exposed face and fingers are taken directly from the live model.
function coveredSkin(rig, roma, part) {
  if (!roma) {
    // The live cut between each inner thigh and the torso is normally hidden
    // by the jogger seat. Give the anterior hip and gluteal fold a continuous
    // cutaway without replacing the original, selectable skinned body.
    part('Covered hip and upper thigh contours','skin',({bands})=>{
      for(const sign of [-1,1]) {
        const place=(x,y,z)=>local(rig.hips)(sign*x,y,sign*z);
        bands(place,[[-.157,.019,.026,-.002,.059],[-.137,.031,.035,-.002,.059],
          [-.118,.039,.041,-.002,.059],[-.102,.046,.045,-.001,.058],
          [-.089,.050,.048,.000,.056],[-.078,.050,.051,.001,.054],
          [-.064,.048,.052,.000,.050],[-.042,.049,.054,-.001,.043],
          [-.018,.050,.054,-.003,.034],[.004,.047,.054,-.006,.027],
          [.025,.040,.048,-.006,.024],[.042,.032,.039,-.007,.020]],sippySkin,32);
      }
    });
  }
  if(roma){
    const cols=24, place=local(rig.chest);
    part('Covered torso and hips','skin',({bands})=>{
      bands(place,[[-.155,.039,.029,-.002],[-.137,.067,.044,-.001],[-.114,.079,.048,-.001],
        [-.084,.073,.049,.001],[-.051,.067,.044,.001],[-.008,.065,.046,.002],
        [.040,.073,.050,.002],[.089,.089,.050,0],[.118,.096,.047,-.002],
        [.137,.080,.040,-.001],[.152,.057,.032,.001],[.160,.031,.026,.001]],romaSkin,cols);
    });
    for(const [side,sign] of [['L',1],['R',-1]]){
      const label=side==='L'?'Left ':'Right ',arm=rig['upperArm'+side],elbow=rig['forearm'+side],
        hip=rig['thigh'+side],knee=rig['shin'+side];
      part(label+'covered arm','skin',({bands,sweep})=>{
        const torso=local(rig.chest), humerus=local(arm);
        sweep([torso(sign*.054,.131,-.003),torso(sign*.076,.132,-.003),
          humerus(-sign*.011,-.006,-.002),humerus(-sign*.001,-.025,0)],
          [[.019,.025],[.019,.026],[.018,.024],[.014,.020]],romaSkin,{across:v(0,1,0)});
        bands(local(arm),[[-.164,.021,.022,.001,sign*.010],[-.144,.024,.024,.002,sign*.009],
          [-.092,.028,.029,.002,sign*.006],[-.039,.031,.030,.001,sign*.001],
          [-.010,.027,.027,-.002,-sign*.004],[.009,.019,.023,-.003,-sign*.010],
          [.015,.005,.010,-.004,-sign*.016]],romaSkin);
        bands(local(elbow),[[-.149,.014,.013,0,sign*.002],[-.134,.016,.016,0,sign*.002],
          [-.092,.021,.021,0,sign*.002],[-.042,.025,.024,0,sign*.001],
          [-.012,.023,.023,.001],[.002,.020,.021,0]],romaSkin);
      });
      part(label+'covered leg','skin',({bands})=>{
        bands(local(hip),[[-.238,.022,.025,-.001],[-.217,.029,.032,-.002],
          [-.159,.037,.040,-.001],[-.088,.043,.045,.001],[-.027,.044,.047,-.002],
          [.016,.035,.041,-.004,-sign*.004],[.024,.018,.023,-.003,-sign*.008]],romaSkin);
        bands(local(knee),[[-.214,.018,.020,-.002],[-.175,.020,.022,-.003],
          [-.123,.028,.032,-.004],[-.077,.035,.037,-.005],[-.043,.033,.034,-.003],
          [-.013,.026,.029,-.002],[.011,.022,.024,-.001]],romaSkin);
      });
    }
  }
  // Both actors' original body cuts stop at their ankle. Match the shoe last
  // with a low rounded heel, arch and forefoot under their actual trainers.
  for(const side of ['L','R']){
    const place=local(rig['foot'+side]);
    part((side==='L'?'Left':'Right')+' foot inside trainer','skin',({bands})=>{
      bands(place,[[-.037,.019,.041,.021],[-.033,.024,.050,.022],[-.026,.027,.052,.021],
        [-.020,.026,.049,.020],[-.014,.023,.035,.010],[0,.017,.021,-.001],
        [.015,.016,.019,-.002],[.023,.012,.015,-.002]],roma?romaSkin:sippySkin);
    });
  }
}

export async function addInnerLayers(rig,name,tier,parts) {
  rig.root.updateWorldMatrix(true,true);
  if (name === 'hummin') {
    const { addRobotInterior } = await import('./diagram-robot.js');
    addRobotInterior(rig,tier,parts);
    return;
  }
  const roma = name === 'roma';
  const part = fabricator(tier,rig.height,parts);
  headParts(rig,roma,part);
  axialParts(rig,roma,part);
  limbs(rig,roma,part);
  coveredSkin(rig,roma,part);
}
