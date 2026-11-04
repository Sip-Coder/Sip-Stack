import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Original procedural miniature. No models, textures, or teaching pins shared with Village.
export function mountCraft(root) {
  const stage = root.querySelector('.craft-stage'), status = root.querySelector('.craft-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  stage.prepend(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Tidelight Coast. Drag to orbit, arrow keys rotate, plus and minus zoom. Weather and motion controls follow the scene.');
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#817985');
  scene.fog = new THREE.FogExp2('#817985', .021);
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 120);
  camera.position.set(16, 12.5, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.1, 0); controls.enableDamping = false; controls.enablePan = false;
  controls.minDistance = 19; controls.maxDistance = 38; controls.minPolarAngle = .48; controls.maxPolarAngle = 1.35;
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .5, .6, 1.05);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  const hemi = new THREE.HemisphereLight('#d8e6da', '#4e3945', 2.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe0a1', 4); sun.position.set(-8, 15, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12}); sun.shadow.bias = -.001; scene.add(sun);
  const fill = new THREE.DirectionalLight('#73cfc6', 1.2); fill.position.set(6,5,-8); scene.add(fill);
  const group = new THREE.Group(); scene.add(group);
  const mat = (color, extra={}) => new THREE.MeshStandardMaterial({color,roughness:.78,...extra});
  const clay = mat('#914c2c'), sand = mat('#edd4a8'), mint = mat('#d8e6da'), teal = mat('#1a5552'), mauve = mat('#817985');
  const lamp = mat('#edd4a8',{emissive:'#ffbd68',emissiveIntensity:3});
  function mesh(geometry,material,x,y,z,parent=group) { const m=new THREE.Mesh(geometry,material); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m; }
  const box=(w,h,d,m,x,y,z,p)=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,p);
  const cyl=(a,b,h,m,x,y,z,n=32)=>mesh(new THREE.CylinderGeometry(a,b,h,n),m,x,y,z);
  // A floating slab of ocean, with cut geological strata and terraced vines.
  box(16,.65,12,teal,0,-1,0);
  box(15.7,.12,11.7,mat('#d8e6da',{metalness:.4,roughness:.3}),0,-1.38,0);
  for(let i=0;i<4;i++) {
    const rock=mesh(new THREE.CylinderGeometry(3.9-i*.42,4.3-i*.4,.85,9),i%2?sand:mauve,-2.5,.05+i*.64,-1.8);
    rock.scale.z=.88; rock.rotation.y=.13;
  }
  const top=cyl(2.65,3.15,.4,sand,-2.5,2.55,-1.8,9); top.scale.z=.88;
  // Vine trellises follow the crown of the island.
  for(let row=0;row<4;row++) for(let col=0;col<9;col++) {
    const x=-4.55+col*.48,z=-3.4+row*.8;
    box(.035,.68,.035,clay,x,3.02,z);
    mesh(new THREE.IcosahedronGeometry(.22,1),teal,x,3.2,z).scale.set(1.35,.65,1);
    if(col<8) box(.48,.025,.025,mauve,x+.24,3.12,z);
    if(col%3===0) mesh(new THREE.SphereGeometry(.045,6,4),mat('#715165'),x,3.04,z+.13);
  }
  // Limestone tasting house with a terracotta roof, glazed arches, and warm windows.
  box(2.35,1.55,1.6,mint,-2.6,3.48,-.15);
  const roofShape=new THREE.Shape();roofShape.moveTo(-1.35,0);roofShape.lineTo(1.35,0);roofShape.lineTo(0,.85);roofShape.closePath();
  const roofGeo=new THREE.ExtrudeGeometry(roofShape,{depth:1.95,bevelEnabled:false});roofGeo.translate(0,0,-.975);
  mesh(roofGeo,clay,-2.6,4.25,-.15);
  // Individual roof courses and chimney give the silhouette a handmade scale.
  for(let side of [-1,1])for(let i=0;i<9;i++){
    const tile=box(.19,.045,2.02,clay,-2.6+side*(.08+i*.15),5.05-i*.095,-.15);tile.rotation.z=-side*.56;
  }
  box(.25,.8,.3,sand,-3.35,4.75,-.55);
  box(.35,.08,.4,clay,-3.35,5.16,-.55);
  for(let i=0;i<8;i++)box(.25,.1,.12,sand,-3.64+i*.3,3.02,.68);
  for(let side of [-1,1])for(let i=0;i<6;i++)box(.18,.12,.16,sand,-2.6+side*1.18,2.85+i*.24,.65);
  box(2.6,.12,1.8,sand,-2.6,4.22,-.15);
  for(let x of [-3.4,-1.8])box(.08,1.25,.08,teal,x,3.45,1.65);
  const awning=box(2.3,.06,1.15,clay,-2.6,4.06,1.18);awning.rotation.x=.13;
  // Terrace railings, a table, wine amphorae and cypress silhouettes.
  for(let i=0;i<9;i++)box(.04,.4,.04,teal,-4.05+i*.37,3.05,1.8);
  box(3.1,.035,.035,teal,-2.55,3.25,1.8);
  cyl(.31,.31,.07,sand,-2.5,3.35,1.1);cyl(.035,.06,.48,teal,-2.5,3.08,1.1);
  for(let i=0;i<3;i++){const a=mesh(new THREE.SphereGeometry(.19,14,12),clay,-4.4+i*.42,2.98,.45);a.scale.y=1.35;cyl(.08,.065,.12,clay,-4.4+i*.42,3.24,.45);}
  for(const [x,z] of [[-4.1,-2.7],[-.9,-3.6],[-5.2,-1.9]]){cyl(.045,.065,.7,clay,x,3.05,z);mesh(new THREE.SphereGeometry(.23,16,12),teal,x,3.75,z).scale.y=3.5;}
  // Chipped stones around the tidal ledge avoid a perfectly machined coast.
  for(let i=0;i<34;i++){const a=i/34*Math.PI*2,r=3.8+Math.sin(i*4.7)*.25;const stone=mesh(new THREE.DodecahedronGeometry(.25+(i%4)*.07,0),i%3?sand:mauve,-2.5+Math.cos(a)*r,.32+Math.sin(i)*.15,-1.8+Math.sin(a)*r*.85);stone.scale.set(1.4,.7,1);stone.rotation.set(i*.4,i*.8,0);}
  // Fine masonry seams and mint-painted gallery rings on the lighthouse.
  for(let i=0;i<11;i++)cyl(.49+(10-i)*.017,.49+(10-i)*.017,.018,mauve,4.4,.68+i*.29,-2.25);
  cyl(.7,.7,.09,sand,4.4,3.72,-2.25);
  cyl(.71,.71,.045,teal,4.4,4.48,-2.25);
  box(.24,.5,.04,teal,4.4,1,-1.64);
  for(let i=0;i<3;i++)box(.12,.28,.035,teal,4.4,1.8+i*.55,-1.7-i*.035);
  for(let i=0;i<4;i++) { box(.29,.65,.025,teal,-3.4+i*.52,3.55,.665); box(.2,.48,.03,lamp,-3.4+i*.52,3.55,.685); }
  box(2.8,.12,1.4,sand,-2.6,2.82,1.15);
  for(let i=0;i<5;i++) box(1.5,.22,.37,sand,-.6,2.4-i*.4,.3+i*.45);
  // Detached lighthouse, breakwater and lantern gallery.
  cyl(1.18,1.5,.6,mauve,4.4,.3,-2.25,9);
  cyl(.48,.68,3.4,mint,4.4,2.25,-2.25);
  cyl(.5,.53,.18,clay,4.4,2.55,-2.25);
  cyl(.76,.76,.12,teal,4.4,3.91,-2.25);
  cyl(.43,.43,.65,lamp,4.4,4.23,-2.25);
  mesh(new THREE.ConeGeometry(.79,.6,32),clay,4.4,4.86,-2.25);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;box(.035,.54,.035,teal,4.4+Math.cos(a)*.62,4.2,-2.25+Math.sin(a)*.62);}
  const beacon=new THREE.PointLight('#ffcf86',18,10,2); beacon.position.set(4.4,4.3,-2.25);group.add(beacon);
  // Soft, additive lighthouse shaft with radial falloff (no opaque cone silhouette).
  const beamMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{strength:{value:.1}},vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform float strength;void main(){float a=pow(sin(vUv.x*3.14159),3.)*pow(vUv.y,1.5)*strength;gl_FragColor=vec4(1.,.77,.39,a);}`});
  const beamPivot=new THREE.Group();beamPivot.position.set(4.4,4.3,-2.25);group.add(beamPivot);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(2.4,13,48,1,true),beamMat);beam.rotation.z=Math.PI/2;beam.position.x=6.5;beamPivot.add(beam);
  // Pier, lanterns and a little sailing boat.
  box(5,.16,.85,clay,1.4,.62,2.5);
  for(let i=0;i<6;i++){box(.08,.9,.08,teal,-.8+i*.86,.25,2.2);box(.08,.9,.08,teal,-.8+i*.86,.25,2.8);}
  for(const x of [-.6,1.1,3.1]) {box(.045,.9,.045,teal,x,1.08,2.8);mesh(new THREE.SphereGeometry(.105,12,8),lamp,x,1.58,2.8);}
  const boat=new THREE.Group();boat.position.set(3,.25,4.2);group.add(boat);
  mesh(new THREE.SphereGeometry(1,24,12),clay,0,0,0,boat).scale.set(.38,.19,.95);
  box(.035,1.7,.035,teal,0,.9,0,boat);
  const sailGeo=new THREE.BufferGeometry();sailGeo.setAttribute('position',new THREE.Float32BufferAttribute([.02,1.65,0,.02,.4,0,.02,.45,.77],3));sailGeo.computeVertexNormals();mesh(sailGeo,new THREE.MeshStandardMaterial({color:'#edd4a8',side:THREE.DoubleSide}),0,0,0,boat);
  // Ocean: analytic wave normals, Fresnel reflection, bent seabed caustics, crest foam.
  const waterUniforms={time:{value:0},storm:{value:.15}};
  const water=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,vertexShader:`
    uniform float time,storm; varying vec3 vP; varying vec3 vN;
    float wave(vec2 p){return sin(p.x*1.7+time*1.4)*cos(p.y*1.3+time*.8)*(.035+storm*.15)+sin(p.x*3.6+p.y*2.8-time*2.)*(.02+storm*.065);}
    void main(){vec3 p=position;p.z+=wave(p.xy);float e=.03;vec3 n=normalize(vec3((wave(p.xy-vec2(e,0.))-wave(p.xy+vec2(e,0.)))/(2.*e),(wave(p.xy-vec2(0.,e))-wave(p.xy+vec2(0.,e)))/(2.*e),1.));vec4 world=modelMatrix*vec4(p,1.);vP=world.xyz;vN=normalize(mat3(modelMatrix)*n);gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform float time,storm;varying vec3 vP;varying vec3 vN;
    void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vP);float f=pow(1.-max(dot(n,v),0.),3.);vec2 q=vP.xz+n.xz*.7;float c=pow(.5+.5*sin(q.x*4.+sin(q.y*3.+time)) ,8.)*pow(.5+.5*cos(q.y*5.-time*.6),3.);vec3 sea=mix(vec3(.025,.18,.17),vec3(.022,.075,.105),storm);sea+=vec3(.18,.25,.16)*c*(1.-storm)*.35;sea=mix(sea,mix(vec3(.35,.54,.48),vec3(.20,.26,.32),storm),f*.8);float lace=pow(.5+.5*sin(q.x*31.+sin(q.y*23.-time*2.)),3.)*(.5+.5*sin(q.y*37.+q.x*17.+time));float foam=smoothstep(.10,.23,vP.y)*storm*lace*.85;float edge=smoothstep(7.65,8.,abs(vP.x))+smoothstep(5.65,6.,abs(vP.z));sea=mix(sea,vec3(.77,.86,.79),clamp(foam+edge*.24,0.,.72));float spec=pow(max(dot(reflect(-normalize(vec3(-.7,1.,.4)),n),v),0.),150.);sea+=vec3(1.,.76,.4)*spec*(1.-storm)*2.;gl_FragColor=vec4(sea,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  const ocean=mesh(new THREE.PlaneGeometry(16,12,160,120),water,0,0,0);ocean.rotation.x=-Math.PI/2;ocean.castShadow=false;
  // Continuous ribbons spill off all four cut edges, fading into mist below the slab.
  const spillMat=new THREE.ShaderMaterial({uniforms:waterUniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,vertexShader:`varying vec2 vUv;uniform float time,storm;void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*4.+time*3.)*.025*(1.+storm);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying vec2 vUv;uniform float time,storm;void main(){float streak=pow(.5+.5*sin(vUv.x*180.+sin(vUv.y*12.-time*5.)),5.);float a=pow(vUv.y,1.6)*(.17+streak*.55);gl_FragColor=vec4(mix(vec3(.24,.61,.55),vec3(.78,.86,.8),streak),a);}`});
  for(const [w,x,z,rot] of [[16,0,6,0],[16,0,-6,0],[12,8,0,Math.PI/2],[12,-8,0,Math.PI/2]]) {const m=mesh(new THREE.PlaneGeometry(w,2.3,100,12),spillMat,x,-1.15,z);m.rotation.y=rot;m.castShadow=false;}
  // Deterministic atmosphere, so screenshots and resting compositions are repeatable.
  let seed=91;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const count=900, rainPos=new Float32Array(count*6), rainBase=Array.from({length:count},()=>[rand()*22-11,rand()*12,rand()*18-9]);
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
  const rainMat=new THREE.LineBasicMaterial({color:'#d8e6da',transparent:true,opacity:0,depthWrite:false}); const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;group.add(rain);
  const mistGeo=new THREE.BufferGeometry(),mistPos=new Float32Array(180*3);for(let i=0;i<180;i++) {mistPos[i*3]=rand()*16-8;mistPos[i*3+1]=-1.8+rand()*.7;mistPos[i*3+2]=rand()*12-6;}
  mistGeo.setAttribute('position',new THREE.BufferAttribute(mistPos,3));
  const mistMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{storm:{value:.15}},vertexShader:`void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=80./-p.z;gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform float storm;void main(){float a=pow(max(0.,1.-length(gl_PointCoord-.5)*2.),2.);gl_FragColor=vec4(.65,.8,.75,a*(.15+storm*.25));}`});group.add(new THREE.Points(mistGeo,mistMat));
  const birds=[];for(let i=0;i<5;i++){const b=new THREE.Group();for(const side of [-1,1]){const wing=box(.34,.025,.08,mint,side*.16,0,0,b);wing.rotation.z=side*.3;}group.add(b);birds.push(b);}
  // A quiet sun/moon disc behind the miniature; scene fog carries the weather.
  const skyUniforms={storm:{value:.15},time:{value:0}};
  const sky=new THREE.Mesh(new THREE.SphereGeometry(65,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyUniforms,vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDir;uniform float storm,time;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float f=0.;float a=.5;for(int i=0;i<5;i++){f+=noise(p)*a;p=p*2.03+3.1;a*=.5;}return f;}
  void main(){float h=normalize(vDir).y+.55;vec3 horizon=mix(vec3(.14,.22,.21),vec3(.12,.18,.22),storm);vec3 zenith=mix(vec3(.018,.07,.085),vec3(.018,.035,.065),storm);vec3 c=mix(horizon,zenith,smoothstep(-.15,.7,h));vec2 q=vDir.xz*.085+vec2(time*.012,0.);float cloud=fbm(q+fbm(q*.6));float body=smoothstep(.35,.7,cloud);c=mix(c,vec3(.13,.18,.2)*(cloud+.25),body*storm*.85);c+=vec3(.12,.1,.075)*smoothstep(.5,.75,cloud)*(1.-storm)*.25;gl_FragColor=vec4(c,1.);}` }));scene.add(sky);
  const disc=mesh(new THREE.SphereGeometry(1.6,32,24),new THREE.MeshBasicMaterial({color:'#edd4a8'}),-9,5,-16);disc.castShadow=false;
  const slider=root.querySelector('.craft-weather'),cycleButton=root.querySelector('.craft-cycle'),pauseButton=root.querySelector('.craft-pause');
  let weather=.15,target=.15,t=0,visible=false,paused=reduced.matches,cycle=false,last=0,lost=false;
  function pauseUI(){pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'Resume motion':'Pause motion';}
  pauseUI();
  function paint(dt=0){
    if(!paused){t+=dt; if(cycle){target=(1-Math.cos(t*.14))/2;slider.value=Math.round(target*100);}weather=THREE.MathUtils.damp(weather,target,1.7,dt);}else weather=target;
    skyUniforms.storm.value=weather;skyUniforms.time.value=t;waterUniforms.time.value=t;waterUniforms.storm.value=weather;mistMat.uniforms.storm.value=weather;
    scene.background.set('#526a65').lerp(new THREE.Color('#101e2a'),weather);scene.fog.color.copy(scene.background);scene.fog.density=.009+weather*.015;
    hemi.intensity=1.5-weather*.7;sun.intensity=3.2-weather*2.9;fill.intensity=1+weather*.65;
    beacon.intensity=10+weather*24;lamp.emissiveIntensity=1.7+weather*3;beamMat.uniforms.strength.value=.015+weather*.11;beamPivot.rotation.y=t*.22+.6;
    bloom.strength=.28+weather*.4;disc.material.color.set('#edd4a8').lerp(new THREE.Color('#817985'),weather);
    boat.position.y=.25+Math.sin(t*1.4)*(.025+weather*.1);boat.rotation.z=Math.sin(t*1.3)*(.025+weather*.08);
    rainMat.opacity=Math.max(0,weather-.25)*.4;
    rainBase.forEach(([x,y,z],i)=>{const h=((y-t*(9+weather*5))%12+12)%12;rainPos.set([x,h,z,x-.14-weather*.23,h+.4,z+.05],i*6);});rainGeo.attributes.position.needsUpdate=true;
    birds.forEach((b,i)=>{const a=t*.15+i*1.3;b.position.set(Math.cos(a)*5,6+i*.25+Math.sin(t+i)*.15,Math.sin(a)*3-2);b.rotation.y=-a;b.children.forEach((w,j)=>w.rotation.z=(j?1:-1)*(.2+Math.sin(t*5+i)*.35));b.scale.setScalar(1-weather*.6);});
    controls.update();composer.render();
  }
  function frame(now){if(!visible||lost)return;const dt=Math.min((now-last)/1000||0,.05);last=now;paint(dt);}
  function fit(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);composer.setSize(w,h);camera.aspect=w/h;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(37)/2)*Math.max(1,1.18/camera.aspect)));camera.updateProjectionMatrix();if(visible&&!lost)paint();}
  const ro=new ResizeObserver(fit);ro.observe(stage);
  slider.addEventListener('input',()=>{target=Number(slider.value)/100;cycle=false;cycleButton.setAttribute('aria-pressed','false');if(paused)paint();});
  cycleButton.addEventListener('click',()=>{cycle=!cycle;cycleButton.setAttribute('aria-pressed',String(cycle));if(cycle){paused=false;pauseUI();}});
  pauseButton.addEventListener('click',()=>{paused=!paused;pauseUI();});
  root.querySelector('.craft-reset').addEventListener('click',()=>{camera.position.set(16,12.5,20);controls.target.set(0,1.1,0);controls.update();});
  reduced.addEventListener('change',()=>{paused=reduced.matches;cycle=false;cycleButton.setAttribute('aria-pressed','false');pauseUI();});
  renderer.domElement.addEventListener('keydown',e=>{const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);if(e.key==='ArrowLeft')s.theta-=.12;else if(e.key==='ArrowRight')s.theta+=.12;else if(e.key==='ArrowUp')s.phi=Math.max(.48,s.phi-.1);else if(e.key==='ArrowDown')s.phi=Math.min(1.35,s.phi+.1);else if(e.key==='+'||e.key==='=')s.radius=Math.max(19,s.radius-1);else if(e.key==='-')s.radius=Math.min(38,s.radius+1);else return;e.preventDefault();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;renderer.setAnimationLoop(null);status.hidden=false;status.textContent='Graphics paused. Refresh to restore the coast.';});
  fit();paint();status.hidden=true;
  return {setVisible(value){visible=value;last=performance.now();renderer.setAnimationLoop(value&&!lost?frame:null);if(value&&!lost)fit();}};
}
