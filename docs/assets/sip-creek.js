// Sip Creek · an original Sip Studies waterside miniature.
// This renderer belongs only to the additional creek playground.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const PI = Math.PI;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a), 0, 1); return t*t*(3-2*t); };
function random(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const bend = z => .68 * Math.sin(z * .23) + .25 * Math.sin(z * .52);
function ground(x, z) {
  const d = Math.abs(x - bend(z));
  const bank = smooth(1.8, 4.2, d);
  return mix(-.52, .38 + .12*Math.sin(z*.38) + .05*Math.sin(x*1.1+z*.8), bank)
    + smooth(3.3, 10, d) * (1.1 + .16*Math.cos(z*.4))
    + (Math.sin(x*1.8+z*.7)*Math.cos(z*1.35-x*.4))*.035;
}

const moods = {
  afternoon: { top:'#396b72', horizon:'#a8c9b8', fog:'#a0bfae', water:'#15443f', skyWater:'#70a59a', sun:'#fff0c9', hemi:'#d8e6da', ground:'#887d71', hemiPower:1.25, sunPower:2.85, lamp:1.3, sparkle:.9 },
  golden: { top:'#858092', horizon:'#edd4a8', fog:'#c7b49e', water:'#285957', skyWater:'#f6cf91', sun:'#ffc77c', hemi:'#ffe4bf', ground:'#765b4a', hemiPower:1.1, sunPower:2.9, lamp:2.0, sparkle:1.1 },
  blue: { top:'#354c68', horizon:'#817985', fog:'#657b80', water:'#244d58', skyWater:'#8ba9bb', sun:'#b4cde7', hemi:'#a6c6d8', ground:'#514f60', hemiPower:1.0, sunPower:1.45, lamp:2.6, sparkle:1.0 },
  night: { top:'#132c42', horizon:'#3e5766', fog:'#273e4c', water:'#163c48', skyWater:'#719ba4', sun:'#a4c8dc', hemi:'#789cb9', ground:'#303e50', hemiPower:.65, sunPower:.65, lamp:4.2, sparkle:.75 },
};

export function mountCreek(root) {
  const stage = root.querySelector('.creek-stage');
  const status = root.querySelector('.creek-loading');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 650;
  // Preserve the last completed image during compositing and avoid resizing on every show.
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, preserveDrawingBuffer: true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.15 : 1.4));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Sip Creek, a waterside tasting shelter. Drag to look, pinch to zoom, or use the arrow and plus and minus keys.');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c1d7c8', .023);
  const camera = new THREE.PerspectiveCamera(42, 1, .08, 100);
  const home = new THREE.Vector3(1.4, 2.25, 11.6);
  const homeTarget = new THREE.Vector3(-.35, 1.05, -5.3);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(homeTarget);
  controls.enableDamping = false; controls.enablePan = false;
  controls.minDistance = 11; controls.maxDistance = 26;
  controls.minPolarAngle = .8; controls.maxPolarAngle = 1.47;
  controls.minAzimuthAngle = -.55; controls.maxAzimuthAngle = .55;
  controls.update();

  // On touch/small screens use a single full-scene output instead of the 11 bloom
  // targets. Both paths retain the refraction pass and animated water glints.
  let composer, bloom;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1,1), .23, .55, 1.1);
    composer.addPass(bloom);
    const output = new OutputPass();
    output.material.depthTest = false; output.material.depthWrite = false;
    composer.addPass(output);
  }
  const refraction = new THREE.WebGLRenderTarget(1, 1, { type:THREE.UnsignedByteType, depthBuffer:true });
  const halfFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  // Composer's bloom uses half-float targets; retain the low-cost direct path on
  // systems without the required color attachment support.
  if (composer && !halfFloat) { composer.dispose(); bloom.dispose(); composer = null; bloom = null; }

  const light = new THREE.HemisphereLight('#d8e6da','#887d71',1.5); scene.add(light);
  const sun = new THREE.DirectionalLight('#fff0c9',3.1);
  sun.position.set(-8, 12, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  Object.assign(sun.shadow.camera, {left:-13,right:13,top:13,bottom:-13,near:.1,far:50});
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
  sun.target.position.set(0,0,-5); scene.add(sun, sun.target);
  const mat = (color, extra={}) => new THREE.MeshStandardMaterial({color, roughness:.86, ...extra});
  const sand = mat('#c9ab7d'), clay = mat('#914c2c'), mauve = mat('#817985');
  const teal = mat('#1a5552'), pale = mat('#d8e6da'), wood = mat('#554139');
  const lamp = mat('#ffdda2', {emissive:'#ffc076',emissiveIntensity:.22});
  function add(geometry, material, x,y,z, parent=scene) {
    const m = new THREE.Mesh(geometry, material); m.position.set(x,y,z);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w,h,d, material,x,y,z,parent) { return add(new THREE.BoxGeometry(w,h,d),material,x,y,z,parent); }
  function sphere(material,x,y,z,sx,sy,sz,parent) {
    const mesh=add(new THREE.SphereGeometry(1,16,12),material,x,y,z,parent); mesh.scale.set(sx,sy,sz); return mesh;
  }
  function cylinder(r1,r2,h,material,x,y,z,parent,segments=12) {return add(new THREE.CylinderGeometry(r1,r2,h,segments),material,x,y,z,parent);}
  const rng = random(49107);
  // Two quiet painted ridges close the horizon and layer the background behind
  // the shelter. Their shallow valley keeps the view following the water.
  function ridge(z, color, phase, height) {
    const silhouette=new THREE.Shape();silhouette.moveTo(-30,-4);
    for(let x=-30;x<=30;x+=1.5){const valley=smooth(2,12,Math.abs(x));const y=1.35+valley*height+.32*Math.sin(x*.27+phase)+.16*Math.sin(x*.67-phase);silhouette.lineTo(x,y);}
    silhouette.lineTo(30,-4);silhouette.closePath();
    const mesh=add(new THREE.ShapeGeometry(silhouette),new THREE.MeshBasicMaterial({color,fog:false,side:THREE.DoubleSide}),0,0,z);mesh.castShadow=false;mesh.receiveShadow=false;return mesh;
  }
  const farRidge=ridge(-31,'#a1c2b3',.7,3.4),nearRidge=ridge(-26,'#789e8c',2.1,2.5);

  // A continuous sculpted bed rises naturally into two banks. Color varies by
  // height, so the wet creek edge reads as soil rather than a hard seam.
  const nx=80,nz=128, positions=[], terrainColors=[], indices=[];
  const soil=new THREE.Color('#a58b69'), bank=new THREE.Color('#8c9b79'), bed=new THREE.Color('#31574d');
  for(let iz=0;iz<=nz;iz++) for(let ix=0;ix<=nx;ix++) {
    const x=mix(-12,12,ix/nx),z=mix(-23,13,iz/nz), y=ground(x,z), d=Math.abs(x-bend(z));
    positions.push(x,y,z);
    const col=bed.clone().lerp(soil,smooth(1.7,3.1,d)).lerp(bank,smooth(2.9,5.8,d)*.76);
    col.multiplyScalar(.92 + .08*Math.sin(x*2.7+z*1.6)); terrainColors.push(col.r,col.g,col.b);
    if(ix<nx && iz<nz) {const a=iz*(nx+1)+ix,b=a+nx+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const terrain = new THREE.BufferGeometry(); terrain.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));terrain.setAttribute('color',new THREE.Float32BufferAttribute(terrainColors,3));terrain.setIndex(indices);terrain.computeVertexNormals();
  add(terrain,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),0,0,0);

  // A bed of individually colored rounded pebbles is visible through the water.
  const pebbleGeometry = new THREE.SphereGeometry(1,9,6);
  const pebbles = new THREE.InstancedMesh(pebbleGeometry,mat('#ffffff',{roughness:.95}),mobile?230:400);
  const dummy = new THREE.Object3D(); const pebbleColors=['#665e63','#9b856d','#c0ad91','#41635b','#915e48','#a5b9a6'];
  for(let i=0;i<pebbles.count;i++) {
    const z=mix(-22,12,rng()),x=bend(z)+mix(-2.45,2.45,rng()),r=mix(.055,.22,rng());
    dummy.position.set(x,ground(x,z)+r*.33,z);dummy.rotation.set(rng()*.5,rng()*PI,0);dummy.scale.set(r*(1+rng()),r*.46,r*(1+rng()));dummy.updateMatrix();
    pebbles.setMatrixAt(i,dummy.matrix);pebbles.setColorAt(i,new THREE.Color(pebbleColors[Math.floor(rng()*pebbleColors.length)]));
  }
  pebbles.receiveShadow=true;scene.add(pebbles);

  // Contact shadows are individual, quiet translucent discs under the largest rocks.
  const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;void main(){float d=length(vUv-.5)*2.;gl_FragColor=vec4(.055,.105,.085,pow(max(0.,1.-d),1.6)*.48);}`});
  const stoneColors=['#817985','#909a91','#a7998f','#72817c'];
  for(let i=0;i<30;i++) {
    const z=mix(-20,10,rng()), side=rng()<.5?-1:1, x=bend(z)+side*mix(2.05,5.5,rng());
    const r=mix(.27,.82,rng()),y=ground(x,z);
    const sh=add(new THREE.CircleGeometry(1,20),shadowMaterial,x,y+.025,z);sh.rotation.x=-PI/2;sh.scale.set(r*1.5,r,1);sh.castShadow=false;sh.receiveShadow=false;
    const stone=sphere(mat(stoneColors[i%stoneColors.length]),x,y+r*.42,z,r*1.3,r*.58,r*.9);stone.rotation.y=rng()*PI;
  }
  // Tufts are batched: soft mint blades and deeper evergreen blades.
  // Three tapered, gently bent blades form each tuft, with no cone silhouette.
  const blades=[];
  for(let k=0;k<3;k++){const a=k*PI/3,c=Math.cos(a),sn=Math.sin(a);blades.push(-c*.35,0,-sn*.35,c*.35,0,sn*.35,c*.55,.45,sn*.55,-c*.35,0,-sn*.35,c*.55,.45,sn*.55,-c*.55,.45,-sn*.55,-c*.55,.45,-sn*.55,c*.55,.45,sn*.55,c*.18,1,sn*.18);}
  const tuftGeometry=new THREE.BufferGeometry();tuftGeometry.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));tuftGeometry.computeVertexNormals();
  const tufts = new THREE.InstancedMesh(tuftGeometry,mat('#ffffff',{side:THREE.DoubleSide}),mobile?650:1100);
  for(let i=0;i<tufts.count;i++) {
    const z=mix(-23,12,rng()),side=rng()<.5?-1:1,x=bend(z)+side*mix(2.45,10.5,rng());
    const h=mix(.10,.44,rng());dummy.position.set(x,ground(x,z)+h*.43,z);dummy.rotation.set((rng()-.5)*.25,rng()*PI,(rng()-.5)*.3);dummy.scale.set(.10+rng()*.09,h,.10+rng()*.09);dummy.updateMatrix();
    tufts.setMatrixAt(i,dummy.matrix);tufts.setColorAt(i,new THREE.Color(['#769e82','#658b73','#527f68','#a2baa0'][i%4]));
  }
  tufts.receiveShadow=true;scene.add(tufts);
  // Rounded low shrubs, clustered instead of a repeated wallpaper pattern.
  for(let i=0;i<28;i++) {
    const z=mix(-21,10,rng()),side=rng()<.5?-1:1,x=bend(z)+side*mix(3.7,10,rng()),r=mix(.23,.7,rng()),y=ground(x,z);
    const leaf=mat(['#7d9e83','#98b89c','#6d907d','#b6d0b3'][i%4]);
    for(let n=0;n<3;n++)sphere(leaf,x+(rng()-.5)*r,y+r*.45,z+(rng()-.5)*r,r*.63,r*.56,r*.60);
  }

  // Layered riverbank trees frame the view and give the creek a near, middle,
  // and far distance.  Batched rounded foliage keeps this affordable on phones.
  const treeSites=[[-7.5,7,4.1], [7.8,5,4.5], [-7.6,-13,4.0], [7.3,-11,4.5], [-8.5,-20,4.7], [8.5,-20,4.0]];
  const leavesPerTree=mobile?42:72;
  const canopy=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),mat('#ffffff',{roughness:1}),treeSites.length*leavesPerTree);
  const leafPalette=['#426f5c','#527e65','#668b70','#799b7f','#9bb69a'];
  function branch(x1,y1,z1,x2,y2,z2,r){
    const length=Math.hypot(x2-x1,y2-y1,z2-z1),mid=new THREE.Vector3((x1+x2)/2,(y1+y2)/2,(z1+z2)/2);
    const b=add(new THREE.CylinderGeometry(r*.55,r,length,8),wood,mid.x,mid.y,mid.z);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(x2-x1,y2-y1,z2-z1).normalize());return b;
  }
  treeSites.forEach(([x,z,height],treeIndex)=>{
    const y=ground(x,z),crown=y+height;
    cylinder(.13,.27,height,wood,x,y+height/2,z,undefined,10);
    for(let j=0;j<5;j++){const a=j*PI*2/5+treeIndex*.7;branch(x,y+height*.58,z,x+Math.cos(a)*1.25,crown+.25,z+Math.sin(a)*.9,.09);}
    for(let j=0;j<leavesPerTree;j++){
      const a=rng()*PI*2,r=Math.sqrt(rng())*1.9;
      dummy.position.set(x+Math.cos(a)*r,crown+(rng()-.5)*1.6,z+Math.sin(a)*r*.75);
      dummy.rotation.set(rng()*.4,rng()*PI,0);
      const size=mix(.22,.48,rng());dummy.scale.set(size*1.35,size*.62,size*.85);
      dummy.updateMatrix();const index=treeIndex*leavesPerTree+j;canopy.setMatrixAt(index,dummy.matrix);canopy.setColorAt(index,new THREE.Color(leafPalette[Math.floor(rng()*leafPalette.length)]));
    }
  });
  canopy.castShadow=true;canopy.receiveShadow=true;scene.add(canopy);
  // Near-bank leaves and seed heads frame the water and strengthen the macro scale.
  const broadleaf=mat('#75967c',{side:THREE.DoubleSide});
  for(const [x,z] of [[-4.3,7],[-3.35,3.9],[4.35,6.2],[3.8,1.8],[-3.65,-1.6],[3.7,-5.2]]){
    const y=ground(x,z);
    for(let j=0;j<5;j++){
      const angle=(j-2)*.38;
      const blade=sphere(broadleaf,x+Math.sin(angle)*.18,y+.20,z+Math.cos(angle)*.12,.08,.35,.14);
      blade.rotation.z=-angle*.9;blade.rotation.x=.17;
    }
    for(let j=0;j<3;j++){
      const dx=(j-1)*.12;branch(x+dx,y,z,x+dx*2,y+.72,z,.018);
      sphere(mauve,x+dx*2,y+.74,z,.035,.12,.035);
    }
  }

  // Sip's open tasting shelter sits on the left bank; a vine pergola and a
  // water-first table make the miniature its own place, not a borrowed house.
  const shelter=new THREE.Group();shelter.position.set(-5.2,ground(-5.2,-7.1),-7.1);scene.add(shelter);
  box(4.35,.25,3.35,sand,0,.12,0,shelter);
  for(const x of [-1.8,1.8]) for(const z of [-1.25,1.25]) box(.14,2.45,.14,wood,x,1.45,z,shelter);
  box(4.35,.18,3.4,clay,0,2.67,0,shelter).rotation.z=-.07;
  box(4.5,.07,3.55,sand,0,2.78,0,shelter).rotation.z=-.07;
  for(let z=-1.3;z<=1.31;z+=.52)box(4.1,.07,.055,wood,0,2.55,z,shelter);
  // The rear wall and luminous windows give the open shelter a warm focal point.
  box(3.45,1.55,.13,sand,0,1.42,-1.26,shelter);
  box(.78,1.37,.05,teal,0,1.10,-1.17,shelter);
  for(const x of [-1.15,1.15]) {
    box(.66,.68,.08,wood,x,1.64,-1.16,shelter);
    box(.51,.54,.09,lamp,x,1.64,-1.10,shelter);
    box(.035,.56,.10,wood,x,1.64,-1.04,shelter);
  }
  box(3.6,.12,.12,wood,0,.92,-1.25,shelter);
  for(let x=-1.65;x<=1.7;x+=.37)box(.05,.8,.05,wood,x,.53,-1.25,shelter);
  // Round table, carafe and two small cups; the glass is water-colored.
  cylinder(.74,.74,.10,sand,0,.88,.15,shelter,28);cylinder(.075,.16,.75,wood,0,.46,.15,shelter);
  const glass=mat('#b8ded7',{roughness:.22,metalness:.08});
  cylinder(.11,.16,.35,glass,-.15,1.11,.13,shelter,18);
  cylinder(.06,.09,.16,glass,.22,1.02,.3,shelter,12);
  cylinder(.06,.09,.16,glass,-.43,1.02,.38,shelter,12);
  for(const x of [-1.7,1.7]) {
    const bulb=sphere(lamp,x,2.27,.88,.12,.12,.12,shelter);bulb.castShadow=false;
  }
  const warm=new THREE.PointLight('#ffbf7e',2,12,2);warm.position.set(-5.2,shelter.position.y+2.3,-6.2);scene.add(warm);
  // Trellis rails and grape clusters to signal a working vineyard.
  const tx=-7.6,tz=-12,ty=ground(tx,tz);
  for(let i=0;i<5;i++)box(.11,1.8,.11,wood,tx+i*.95,ty+.9,tz);
  for(const y of [.7,1.3])box(4,.055,.055,wood,tx+1.9,ty+y,tz);
  for(let i=0;i<13;i++) {
    const x=tx+i*.3;sphere(teal,x,ty+1.35,tz,.25,.20,.19);
    if(i%2===0) sphere(mat('#756278'),x,ty+1.02,tz+.1,.085,.15,.08);
  }
  // Weathered stepping stones lead from the bank toward the table.
  for(let i=0;i<6;i++) {const z=-3.4-i*.54,x=-2.8-i*.36,y=ground(x,z);const stone=sphere(mauve,x,y+.055,z,.32,.09,.25);stone.rotation.y=i*.7;}

  const skyUniforms={top:{value:new THREE.Color(moods.afternoon.top)},horizon:{value:new THREE.Color(moods.afternoon.horizon)}};
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,uniforms:skyUniforms,vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform vec3 top,horizon;varying vec3 vP;void main(){float t=smoothstep(-.15,.65,normalize(vP).y);gl_FragColor=vec4(mix(horizon,top,t),1.);\n${composer?'':'#include <tonemapping_fragment>\n#include <colorspace_fragment>'}}`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(80,32,20),skyMaterial);sky.renderOrder=-100;scene.add(sky);

  // Refraction samples a separate scene-color target; the visible water remains
  // a single continuous stream with small normal waves and sparse sun glints.
  const waterUniforms = {
    time:{value:0}, viewport:{value:new THREE.Vector2(1,1)}, refract:{value:refraction.texture},
    tint:{value:new THREE.Color(moods.afternoon.water)}, reflection:{value:new THREE.Color(moods.afternoon.skyWater)},
    glint:{value:moods.afternoon.sparkle}, sunDir:{value:new THREE.Vector3(-.5,.82,.3).normalize()},
  };
  const wpos=[], windices=[], wu=56,wv=160;
  for(let j=0;j<=wv;j++)for(let i=0;i<=wu;i++) {
    const z=mix(-23,13,j/wv),x=bend(z)+mix(-2.85,2.85,i/wu);wpos.push(x,0,z);
    if(i<wu && j<wv){const a=j*(wu+1)+i,b=a+wu+1;windices.push(a,a+1,b,b,a+1,b+1);}
  }
  const waterGeometry=new THREE.BufferGeometry();waterGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wpos,3));waterGeometry.setIndex(windices);waterGeometry.computeVertexNormals();
  const directChunks = composer ? '' : '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
  const waterMaterial = new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,vertexShader:`
    uniform float time; varying vec3 worldP; varying vec3 normalW;
    float wave(vec2 p){return sin(p.x*2.8+p.y*.8-time*1.7)*.028 + sin(p.y*2.3-p.x*.7-time*1.15)*.018 + sin(p.x*5.3+p.y*3.8-time*2.1)*.008;}
    void main(){vec3 p=position;p.y+=wave(p.xz);float e=.025;vec2 q=p.xz;vec3 n=normalize(vec3(wave(q-vec2(e,0.))-wave(q+vec2(e,0.)),2.*e,wave(q-vec2(0.,e))-wave(q+vec2(0.,e))));vec4 w=modelMatrix*vec4(p,1.);worldP=w.xyz;normalW=normalize(mat3(modelMatrix)*n);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float time,glint;uniform sampler2D refract;uniform vec2 viewport;uniform vec3 tint,reflection,sunDir;varying vec3 worldP,normalW;
    void main(){vec3 n=normalize(normalW),view=normalize(cameraPosition-worldP);float fresnel=pow(clamp(1.-max(dot(n,view),0.),0.,1.),3.);
      vec2 uv=gl_FragCoord.xy/viewport+n.xz*.018;vec3 bottom=texture2D(refract,clamp(uv,vec2(.001),vec2(.999))).rgb;
      vec3 water=mix(bottom*vec3(.72,1.02,.91),tint,.32);water=mix(water,reflection,.08+fresnel*.42);
      float sun=pow(max(dot(reflect(-sunDir,n),view),0.),210.)*glint*1.4;
      float sparkle=pow(max(0.,sin(worldP.x*13.+sin(worldP.z*5.+time)) * sin(worldP.z*14.-time*2.)),46.) * glint * .20;
      water+=vec3(1.,.88,.58)*(sun+sparkle);gl_FragColor=vec4(water,1.);${directChunks}}`});
  const water=new THREE.Mesh(waterGeometry,waterMaterial);water.position.y=.015;water.receiveShadow=true;scene.add(water);

  // Original lobed grape leaves drift downstream in the clear water.
  const leafShape=new THREE.Shape();leafShape.moveTo(0,-.34);leafShape.bezierCurveTo(-.13,-.24,-.26,-.28,-.30,-.07);leafShape.lineTo(-.16,-.08);leafShape.bezierCurveTo(-.35,.02,-.29,.16,-.18,.20);leafShape.lineTo(-.10,.10);leafShape.bezierCurveTo(-.14,.30,-.05,.36,0,.29);leafShape.bezierCurveTo(.05,.36,.14,.30,.10,.10);leafShape.lineTo(.18,.20);leafShape.bezierCurveTo(.29,.16,.35,.02,.16,-.08);leafShape.lineTo(.30,-.07);leafShape.bezierCurveTo(.26,-.28,.13,-.24,0,-.34);leafShape.closePath();
  const leafGeo=new THREE.ShapeGeometry(leafShape,12), leafMats=[mat('#edd4a8',{side:THREE.DoubleSide}),mat('#c9a46e',{side:THREE.DoubleSide}),mat('#b7ba86',{side:THREE.DoubleSide})];
  const floating=[];
  for(let i=0;i<12;i++) {
    const leaf=add(leafGeo,leafMats[i%3],0,.06,0);leaf.rotation.x=-PI/2;const size=mix(.45,.9,rng());leaf.scale.setScalar(size);leaf.castShadow=false;
    floating.push({leaf,phase:rng(),offset:mix(-1.5,1.5,rng()),speed:mix(.13,.25,rng()),rot:rng()*PI*2});
  }
  // A few skimming glints around the near water give depth without foam.
  const glintGeo=new THREE.BufferGeometry(),glintPositions=new Float32Array(26*3);
  for(let i=0;i<26;i++){const z=mix(-17,11,rng());glintPositions[i*3]=bend(z)+mix(-2.2,2.2,rng());glintPositions[i*3+1]=.08;glintPositions[i*3+2]=z;}
  glintGeo.setAttribute('position',new THREE.BufferAttribute(glintPositions,3));
  const glintMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:waterUniforms.time,strength:waterUniforms.glint},vertexShader:`uniform float time;varying float vA;void main(){vA=.5+.5*sin(time*2.2+position.x*4.+position.z*3.);vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(20./-p.z,1.,4.);gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform float strength;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.08,.5,d))*pow(vA,6.)*.7;gl_FragColor=vec4(vec3(1.,.89,.68)*strength,a);}`});
  const glints=new THREE.Points(glintGeo,glintMat);scene.add(glints);

  const colors={top:new THREE.Color(moods.afternoon.top),horizon:new THREE.Color(moods.afternoon.horizon),fog:new THREE.Color(moods.afternoon.fog),water:new THREE.Color(moods.afternoon.water),skyWater:new THREE.Color(moods.afternoon.skyWater),sun:new THREE.Color(moods.afternoon.sun),hemi:new THREE.Color(moods.afternoon.hemi),ground:new THREE.Color(moods.afternoon.ground)};
  const targetColors=Object.fromEntries(Object.entries(colors).map(([key,value])=>[key,value.clone()]));
  let mood=moods.afternoon, elapsed=0, visible=false, lost=false, paused=reduced.matches, last=0, fittedWidth=0, fittedHeight=0;
  let hemiPower=mood.hemiPower,sunPower=mood.sunPower,lampPower=mood.lamp,sparkle=mood.sparkle;
  let interacting=false;const driftAxis=new THREE.Vector3(0,1,0),driftOffset=new THREE.Vector3();
  controls.addEventListener('start',()=>{interacting=true;});controls.addEventListener('end',()=>{interacting=false;});
  const pauseButton=root.querySelector('.creek-pause');
  function selectLight(name) {
    if(!moods[name]) return;
    mood=moods[name];Object.keys(targetColors).forEach(key=>targetColors[key].set(mood[key]));
    root.querySelectorAll('.creek-light button[data-light]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.light===name)));
    if(paused && visible && !lost)paint(0,true);
  }
  function showPause() {pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'Resume motion':'Pause motion';}
  function syncLoop(){last=performance.now();renderer.setAnimationLoop(visible&&!lost&&!paused?frame:null);}
  function paint(dt=0,immediate=false) {
    if(!paused)elapsed+=dt;
    const blend=immediate ? 1 : 1-Math.exp(-dt*2.1);
    Object.keys(colors).forEach(key=>colors[key].lerp(targetColors[key],blend));
    hemiPower=mix(hemiPower,mood.hemiPower,blend);sunPower=mix(sunPower,mood.sunPower,blend);lampPower=mix(lampPower,mood.lamp,blend);sparkle=mix(sparkle,mood.sparkle,blend);
    skyUniforms.top.value.copy(colors.top);skyUniforms.horizon.value.copy(colors.horizon);scene.fog.color.copy(colors.fog);
    farRidge.material.color.copy(colors.fog).multiplyScalar(1.02);nearRidge.material.color.copy(colors.fog).multiplyScalar(.68);
    waterUniforms.tint.value.copy(colors.water);waterUniforms.reflection.value.copy(colors.skyWater);waterUniforms.glint.value=sparkle;waterUniforms.time.value=elapsed;
    light.color.copy(colors.hemi);light.groundColor.copy(colors.ground);light.intensity=hemiPower;sun.color.copy(colors.sun);sun.intensity=sunPower;lamp.emissiveIntensity=lampPower;warm.intensity=lampPower*3.2;
    floating.forEach(({leaf,phase,offset,speed,rot})=>{const z=10-((phase*30+elapsed*speed)%30);leaf.position.set(bend(z)+offset,.075+Math.sin(elapsed*1.5+phase*20)*.015,z);leaf.rotation.z=rot+Math.sin(elapsed*.35+phase*10)*.18;});
    controls.update();
    const wasAutoClear=renderer.autoClear;
    try {
      renderer.autoClear=false;renderer.shadowMap.needsUpdate=true;
      // Clear only the offscreen refraction target; never expose an intermediate
      // empty default framebuffer while the scene is being composed.
      water.visible=false;renderer.setRenderTarget(refraction);renderer.clear(true,true,true);renderer.render(scene,camera);water.visible=true;
      renderer.setRenderTarget(null);
      if(composer) composer.render();
      else {
        // The opaque sky covers every pixel; clear depth only before the direct
        // mobile render so stale depth cannot hide the next completed frame.
        renderer.clearDepth();renderer.render(scene,camera);
      }
    } finally {water.visible=true;renderer.setRenderTarget(null);renderer.autoClear=wasAutoClear;}
  }
  function frame(now) {
    if(!visible || lost || paused)return;
    if(now-last < (mobile ? 1000/30 : 1000/45))return;
    const dt=Math.min((now-last)/1000,.05);last=now;
    // A bounded, very slow sway composes with the visitor's chosen orbit;
    // it never runs during a drag or while motion is paused.
    if(!interacting){const angle=(Math.sin((elapsed+dt)*.25)-Math.sin(elapsed*.25))*.025;driftOffset.copy(camera.position).sub(controls.target).applyAxisAngle(driftAxis,angle);const theta=Math.atan2(driftOffset.x,driftOffset.z);if(theta>=controls.minAzimuthAngle&&theta<=controls.maxAzimuthAngle)camera.position.copy(controls.target).add(driftOffset);}
    paint(dt);
  }
  function fit() {
    const w=stage.clientWidth,h=stage.clientHeight;
    if(!w||!h||(w===fittedWidth&&h===fittedHeight))return false;
    fittedWidth=w;fittedHeight=h;renderer.setSize(w,h,false);if(composer)composer.setSize(w,h);
    renderer.getDrawingBufferSize(waterUniforms.viewport.value);
    refraction.setSize(Math.max(1,Math.round(w*(mobile?.50:.65))),Math.max(1,Math.round(h*(mobile?.50:.65))));
    camera.aspect=w/h;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(42)/2)*Math.max(1,1.0/camera.aspect)));camera.updateProjectionMatrix();
    if(visible&&!lost)paint(0,paused);return true;
  }
  new ResizeObserver(fit).observe(stage);
  root.querySelectorAll('.creek-light button[data-light]').forEach(button=>button.addEventListener('click',()=>selectLight(button.dataset.light)));
  pauseButton.addEventListener('click',()=>{paused=!paused;showPause();syncLoop();});
  root.querySelector('.creek-reset').addEventListener('click',()=>{camera.position.copy(home);controls.target.copy(homeTarget);controls.update();if(paused&&visible&&!lost)paint(0,true);});
  controls.addEventListener('change',()=>{if(paused&&visible&&!lost)requestAnimationFrame(()=>{if(paused&&visible&&!lost)paint(0,true);});});
  reduced.addEventListener('change',()=>{paused=reduced.matches;showPause();syncLoop();if(paused&&visible&&!lost)paint(0,true);});
  canvas.addEventListener('keydown',event=>{
    const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
    if(event.key==='ArrowLeft')spherical.theta=Math.max(controls.minAzimuthAngle,spherical.theta-.10);
    else if(event.key==='ArrowRight')spherical.theta=Math.min(controls.maxAzimuthAngle,spherical.theta+.10);
    else if(event.key==='ArrowUp')spherical.phi=Math.max(controls.minPolarAngle,spherical.phi-.07);
    else if(event.key==='ArrowDown')spherical.phi=Math.min(controls.maxPolarAngle,spherical.phi+.07);
    else if(event.key==='+'||event.key==='=')spherical.radius=Math.max(controls.minDistance,spherical.radius-1);
    else if(event.key==='-')spherical.radius=Math.min(controls.maxDistance,spherical.radius+1);
    else return;
    event.preventDefault();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;renderer.setAnimationLoop(null);status.hidden=false;status.textContent='Graphics paused. Restoring Sip Creek… Refresh if it does not return.';});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;status.hidden=true;syncLoop();if(visible)paint(0,paused);});
  showPause();selectLight('afternoon');fit();
  status.hidden=true;
  return {setVisible(value){if(value===visible)return;visible=value;syncLoop();if(value&&!lost&&!fit())paint(0,paused);}};
}
