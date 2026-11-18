import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SavePass } from 'three/addons/postprocessing/SavePass.js';
import { atmosphere } from './atmosphere.js';
import { buildCathedral } from './cathedral.js';

const duration=16;
const curve=points=>new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
// The last second holds the carving, then optically dissolves into the
// saved opening shot. Both splines stay on the roof side of the horizon.
const flight=curve([[-23,42,38],[-16.0,41.0,32],[-1.4,39.2,23.0],[11.9,32.4,13.6],
  [17.1,26.4,21.9],[13.9,23.3,34.0],[6.9,22.9,40.1],[2.45,21.4,40.6]]);
const gaze=curve([[2.1,33.5,-17],[1.4,34.7,-16],[1.5,33.8,-10],[7.4,24.1,1.0],
  [11.75,21.9,15.2],[4.5,19.6,21.8],[.30,18.0,23],[0,17.05,23.3]]);
const quad='varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
const grade={
  uniforms:{tDiffuse:{value:null}}, vertexShader:quad,
  fragmentShader:`uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb; float l=dot(c,vec3(.2126,.7152,.0722));
    c*=mix(vec3(.93,.972,1.075),vec3(1.045,1.012,.95),smoothstep(.12,1.45,l));
    gl_FragColor=vec4(c,1.);}`
};
const dissolve={
  uniforms:{tDiffuse:{value:null},opening:{value:null},amount:{value:0}},vertexShader:quad,
  fragmentShader:`uniform sampler2D tDiffuse,opening; uniform float amount; varying vec2 vUv;
    void main(){gl_FragColor=mix(texture2D(tDiffuse,vUv),texture2D(opening,vUv),amount);}`
};

export async function start() {
  const $=id=>document.getElementById(id);
  const stage=$('stage'), status=$('status'), time=$('time'), play=$('play'), orbit=$('orbit');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mobile=matchMedia('(pointer: coarse)').matches || Math.min(innerWidth,innerHeight)<600;
  const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.03;
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false; renderer.shadowMap.needsUpdate=true;
  const canvas=renderer.domElement;
  canvas.setAttribute('aria-label','A guided flight over the marble spires and pointed west window');
  stage.prepend(canvas);
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(47,1,.35,1100);
  atmosphere(scene,mobile);
  const updateLOD=buildCathedral(scene,mobile);
  const controls=new OrbitControls(camera,canvas);
  Object.assign(controls,{enabled:false,enablePan:false,minDistance:6,maxDistance:82,minPolarAngle:.20,maxPolarAngle:Math.PI*.495});
  const look=new T.Vector3();
  let elapsed=0, playing=!reduced.matches, free=false, lost=false, ready=false;
  let last=null, frameId=0, width=0,height=0, openingValid=false;
  const floatType=renderer.extensions.has('EXT_color_buffer_float') ? T.HalfFloatType : T.UnsignedByteType;
  const buffer=new T.WebGLRenderTarget(1,1,{type:floatType});
  // Multisample the scene target as well as running post AA on thin carvings.
  buffer.samples=mobile?0:Math.min(2,renderer.capabilities.maxSamples);
  const composer=new EffectComposer(renderer,buffer);
  const beauty=new RenderPass(scene,camera); composer.addPass(beauty);
  const ao=mobile?null:new SSAOPass(scene,camera,1,1,12);
  if(ao) {
    ao.kernelRadius=1.5; ao.minDistance=.0004; ao.maxDistance=.018; composer.addPass(ao);
  }
  const bloom=new UnrealBloomPass(new T.Vector2(1,1),mobile?.15:.23,.30,1.05);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(grade)); composer.addPass(new OutputPass());
  const aa=new SMAAPass(1,1); composer.addPass(aa);
  const save=new SavePass(new T.WebGLRenderTarget(1,1,{depthBuffer:false}));
  composer.addPass(save);
  const finish=new ShaderPass(dissolve);
  finish.material.depthTest=false; finish.material.depthWrite=false;
  finish.uniforms.opening.value=save.renderTarget.texture;
  // Intermediate passes clear their own depth buffers. The visible target
  // receives one opaque full-screen triangle with clearing disabled.
  const composite = finish.render.bind(finish);
  finish.render = (...args) => {
    const previous = renderer.autoClear;
    renderer.autoClear = false;
    try { composite(...args); } finally { renderer.autoClear = previous; }
  };
  composer.addPass(finish);
  if(floatType===T.UnsignedByteType) {
    for(const target of [aa.edgesRT,aa.weightsRT,bloom.renderTargetBright,...bloom.renderTargetsHorizontal,...bloom.renderTargetsVertical]) target.texture.type=floatType;
    if(ao) for(const target of [ao.ssaoRenderTarget,ao.normalRenderTarget,ao.blurRenderTarget]) target.texture.type=floatType;
  }
  await Promise.all([aa.areaTexture.image.decode(),aa.searchTexture.image.decode()]);
  function pose(t) {
    const u=T.MathUtils.clamp(t/15.45,0,1);
    const eased=.64*u+.36*u*u*(3-2*u);
    flight.getPoint(eased,camera.position); gaze.getPoint(eased,look);
    // Keep both flanking statues in the last portrait frame. Dollying
    // back retains the perspective of the arch and its inscription.
    const distance=camera.position.distanceTo(look);
    const halfView=Math.tan(T.MathUtils.degToRad(camera.fov*.5))*camera.aspect;
    const extra=Math.max(0,6.95/(distance*halfView)-1)*T.MathUtils.smoothstep(t,9.5,13.4);
    camera.position.sub(look).multiplyScalar(1+extra).add(look);
    camera.lookAt(look);
  }
  function resize() {
    const w=stage.clientWidth,h=stage.clientHeight;
    if(w===width && h===height) return;
    width=w; height=h;
    const ratio=Math.min(devicePixelRatio,mobile?1.45:1.6,Math.sqrt((mobile?950000:2400000)/(w*h)));
    renderer.setPixelRatio(ratio); renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.fov=w/h<.85?55:46; camera.updateProjectionMatrix();
    composer.setPixelRatio(ratio); composer.setSize(w,h);
    const physical=renderer.getDrawingBufferSize(new T.Vector2());
    ao?.setSize(Math.ceil(physical.x*.64),Math.ceil(physical.y*.64));
    bloom.setSize(Math.ceil(physical.x*(mobile?.42:.75)),Math.ceil(physical.y*(mobile?.42:.75)));
    openingValid=false;
  }
  function draw() {
    if(!ready || lost || document.hidden) return;
    resize();
    if(!openingValid) {
      const pos=camera.position.clone(), rot=camera.quaternion.clone();
      pose(0); updateLOD(camera); save.enabled=true;
      // Warm the opening into an offscreen target. Only a fully composed
      // frame may touch the preserved default framebuffer.
      composer.renderToScreen=false; finish.uniforms.amount.value=0;
      composer.render(); composer.renderToScreen=true; save.enabled=false;
      camera.position.copy(pos); camera.quaternion.copy(rot); openingValid=true;
    }
    if(!free) pose(elapsed);
    updateLOD(camera);
    finish.uniforms.amount.value=free?0:T.MathUtils.smoothstep(elapsed,15.45,duration);
    composer.render();
    canvas.style.visibility='visible'; status.hidden=true;
    const stamp=Math.floor(elapsed);
    time.value=elapsed.toFixed(2);
    $('clock').textContent='00:'+String(stamp).padStart(2,'0')+' / 00:16';
    $('chapter').textContent=free?'Free orbit · drag to turn, scroll to zoom':
      elapsed<5?'The central spire':elapsed<10.25?'The flying buttresses':'The west window';
  }
  function requestDraw() {
    if(!frameId && ready && !lost && !document.hidden) frameId=requestAnimationFrame(frame);
  }
  function frame(now) {
    frameId=0;
    if(playing && !free && last!==null) elapsed=(elapsed+(now-last)/1000)%duration;
    last=now; draw();
    if(playing && !free) requestDraw();
  }
  function showControls() {
    play.textContent=playing?'Pause':'Play'; play.disabled=free;
    time.disabled=free; orbit.setAttribute('aria-pressed',String(free));
  }
  function guided(t,run) {
    controls.enabled=false; free=false; playing=run; elapsed=t; last=null;
    showControls(); requestDraw();
  }
  play.addEventListener('click',()=>guided(elapsed,!playing));
  $('replay').addEventListener('click',()=>guided(0,true));
  time.addEventListener('input',()=>guided(time.valueAsNumber,false));
  orbit.addEventListener('click',()=>{
    if(free) return guided(elapsed,playing);
    free=true; controls.enabled=true; controls.target.copy(look); controls.update();
    showControls(); requestDraw();
  });
  controls.addEventListener('change',()=>{if(free) requestDraw();});
  reduced.addEventListener('change',()=>{if(reduced.matches) guided(elapsed,false);});
  new ResizeObserver(requestDraw).observe(stage);
  function suspend() { cancelAnimationFrame(frameId); frameId=0; last=null; }
  document.addEventListener('visibilitychange',()=>{if(document.hidden) suspend(); else requestDraw();});
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault(); lost=true; suspend(); canvas.style.visibility='hidden';
    status.hidden=false; status.textContent='Restoring the rooftop…';
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    lost=false; openingValid=false; renderer.shadowMap.needsUpdate=true; requestDraw();
  });
  stage.querySelectorAll('button,input').forEach(control=>control.disabled=false);
  showControls(); ready=true; requestDraw();
}
