// A pelvic ring and lower skeleton registered to the playable hero's posed
// joint frames. Positions and angles below use +Z anterior and +X left.
import * as T from 'three';
import { lerp, local, v } from './diagram-fabricator.js';
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
