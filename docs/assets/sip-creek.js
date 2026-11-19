import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { contacts, landscape, seeded, V, surface, ground } from './sip-creek-land.js';
import { atmosphere, materials, lightSettings } from './sip-creek-materials.js';
import { grove } from './sip-creek-grove.js';
import { stream, streamHeight } from './sip-creek-water.js';
import { cellar } from './sip-creek-cellar.js';
import { cutter, floatHull } from '../life/harbor.js';
import { tube } from '../life/forms.js';
import { flock } from '../life/birds.js';
import { insects, trout } from '../life/wildlife.js';
import { primePeople, finishPeople, restorePeople } from '../life/scene-people.js';
import { warmShaders } from './sip-warm.js';

const tiers = ['Mobile', 'Medium', 'High'],
  duration = 20;
function automaticTier(renderer, w) {
  const gl = renderer.getContext(),
    info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  if (w < 600 || /SwiftShader|llvmpipe|Mali-G5|Adreno.*[34]\d\d/i.test(gpu)) return 0;
  if (matchMedia('(pointer: coarse)').matches || devicePixelRatio > 2 || /Intel|Iris|UHD/i.test(gpu))
    return 1;
  return renderer.capabilities.maxTextureSize >= 8192 ? 2 : 1;
}
const spline = (points) => new T.CatmullRomCurve3(points.map((p) => V(...p)));
const flight = spline([
  [-0.83, 3.3, 12.8],
  [-0.16, 2.1, 8.3],
  [1.34, 2.12, 4.0],
  [0.74, 1.79, -0.55],
  [-1.12, 2.09, -4.8],
  [-2.13, 2.32, -7.75],
  [0.05, 2.65, -9.86],
  [1.66, 2.14, -10.93],
]);
const gaze = spline([
  [0.67, 1.55, 5.28],
  [0.65, 0.89, 3.05],
  [0.2, 0.55, -1.92],
  [-1.0, 0.55, -3.22],
  [-2.83, 1.79, -10.4],
  [-5.67, 2.14, -10.32],
  [3.39, 1.93, -14.5],
  [3.69, 1.53, -14.06],
]);
const beats = ['The spring', 'The stepping stones', 'The vineyard edge', 'The cooper’s barrel'];
const quad = 'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}';

export function buildCreekSkiff(scene, nav) {
  const skiff = cutter('#b7c7b5', '#395c5b', false, 'creek');
  skiff.root.name = 'Creek skiff';
  skiff.root.position.set(1.35, 0, -13);
  skiff.root.rotation.y = 1.45;
  scene.add(skiff.root);
  nav.box(skiff.root.name,0,0,1.1,.43,-.115,.375,0,skiff.root);
  const stakeZ = -14.38,
    stakeX = 2.25,
    stakeY = ground(stakeX, stakeZ);
  const tether = new T.MeshStandardMaterial({ color: '#8d7655', roughness: 0.86 });
  tube(
    scene,
    [
      [stakeX, stakeY - 0.06, stakeZ],
      [stakeX, stakeY + 0.42, stakeZ],
    ],
    0.044,
    tether,
    4,
  );
  tube(
    scene,
    [
      [1.47, surface(-14) + 0.42, -14],
      [1.76, surface(-14) + 0.29, -14.19],
      [stakeX, stakeY + 0.38, stakeZ],
    ],
    0.012,
    tether,
    12,
  );
  return skiff;
}

export function buildCreekWildlife(scene) {
  const kingfisher = flock(scene, {
    sceneKey: 'creek', kind: 'kingfisher',
    count: 1,
    center: [-1.2, 2.48, 6.1],
    radii: [1.8, 2.6],
    perch: [-1.51, surface(6.4) + 0.45, 6.4],
    obstacles: [[-2.4, 2.0, 7.2, 0.68]],
  });
  const finches = flock(scene, {
    sceneKey: 'creek', kind: 'songbird',
    count: 4,
    center: [0.3, 3.7, -7.6],
    radii: [3.2, 2.1],
    perch: [4.1, ground(4.1, -16.45) + 1.915, -16.45],
  });
  const troutPool = trout(scene, 9, 0.84, 4.42, (x, z) => surface(z), 0.85, 'creek', 0.35);
  const dragonflies = insects(
    scene,
    'dragonfly',
    9,
    [-0.37, surface(5.1) + 0.54, 5.1],
    [1.48, 0.22, 1.62],
    'creek',
  );
  const butterflies = insects(scene, 'butterfly', 7, [-2.35, 1.83, -7.8], [1.4, 0.34, 1.12], 'creek');
  const fireflies = insects(scene, 'firefly', 32, [-0.17, 1.55, -2.6], [2.7, 0.72, 13.4], 'creek');
  return (t, mobile, camera, dusk) => {
    kingfisher(t, mobile, camera);
    finches(t, mobile, camera);
    troutPool(t, mobile);
    dragonflies(t, mobile, false);
    butterflies(t, mobile, false);
    fireflies(t, mobile, dusk);
  };
}

export function mountCreek(root) {
  const find = (s) => root.querySelector(s),
    stage = find('.creek-stage'),
    status = find('.creek-loading');
  const play = find('.creek-pause'),
    orbit = find('.creek-orbit'),
    slider = find('.creek-time'),
    beat = find('.creek-beat'),
    quality = find('.creek-quality');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new T.WebGLRenderer({
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.01;
  renderer.autoClear = false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.style.visibility = 'hidden';
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Sip Creek guided flight. In Free orbit, drag or use arrow keys to orbit, and plus or minus to zoom.',
  );
  stage.prepend(canvas);
  const scene = new T.Scene(),
    overlay = new T.Scene(),
    camera = new T.PerspectiveCamera(49, 1, 0.075, 135);
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enablePan = false;
  controls.minDistance = 1.15;
  controls.maxDistance = 15;
  controls.maxPolarAngle = Math.PI * 0.485;
  const rng = seeded(381799),
    time = { value: 0 },
    daylight = { value: 1 },
    densities = [];
  function detail(mesh, fractions) {
    densities.push({ mesh, max: mesh.count, fractions });
  }
  const contact = contacts();
  const { soil, rock, wood, mineral } = materials(time, daylight, contact);
  const updateLOD = landscape(scene, rng, soil, rock, detail, contact);
  grove(scene, rng, time, wood, detail, contact);
  contact.stamp(3.8, -14, 2.35, 1.54, 0.82);
  const lantern = cellar(scene, wood, rng);
  const skiff = buildCreekSkiff(scene, lantern.nav);
  const wildlife = buildCreekWildlife(scene);
  let lastShadow = -1;
  const hdr =
    renderer.extensions.has('EXT_color_buffer_float') ||
    renderer.extensions.has('EXT_color_buffer_half_float');
  const type = hdr ? T.HalfFloatType : T.UnsignedByteType;
  const sky = atmosphere(scene, renderer, daylight, hdr);
  const hemi = new T.HemisphereLight('#f2e8c8', '#777353', 1.15);
  const sun = new T.DirectionalLight();
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 18, bottom: -18, near: 0.5, far: 70 });
  sun.shadow.normalBias = 0.022;
  sun.shadow.bias = -0.00017;
  scene.add(hemi, sun, sun.target);
  // Leaves drifting on the water share the forest's illumination.
  const leafLight = new T.HemisphereLight();
  overlay.add(leafLight);
  const opaque = new T.WebGLRenderTarget(1, 1, {
    type,
    depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
  });
  const creek = stream(overlay, rng, time, sky.uniforms, mineral, opaque, camera);
  const composer = new EffectComposer(renderer, new T.WebGLRenderTarget(1, 1, { type }));
  const air = new T.ShaderMaterial({
    depthTest: true,
    depthFunc: T.AlwaysDepth,
    depthWrite: true,
    vertexShader: quad,
    uniforms: {
      ...sky.uniforms,
      opaqueColor: { value: opaque.texture },
      opaqueDepth: { value: opaque.depthTexture },
      mineral,
      time,
      inverseProjection: { value: camera.projectionMatrixInverse },
      cameraWorld: { value: camera.matrixWorld },
      texel: { value: new T.Vector2() },
      mist: { value: 1 },
      occlusion: { value: 1 },
      nearFar: { value: new T.Vector2(camera.near, camera.far) },
      haze: { value: new T.Color() },
    },
    fragmentShader: `varying vec2 uv0;uniform sampler2D opaqueColor,opaqueDepth,mineral;
    uniform vec2 texel,nearFar;uniform mat4 inverseProjection,cameraWorld;uniform vec3 haze,solar,lightDir;
    uniform float daylight,time,occlusion,mist;
    float eye(float d){return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
    void main(){
      float raw=texture2D(opaqueDepth,uv0).r,d=eye(raw);
      vec3 rgb=texture2D(opaqueColor,uv0).rgb;
      vec4 q=inverseProjection*vec4(uv0*2.-1.,raw*2.-1.,1.);vec3 local=q.xyz/q.w;
      vec3 ray=normalize(mat3(cameraWorld)*local),origin=cameraWorld[3].xyz;
      float shade=0.;
      if(occlusion>.5 && raw<.9998){
        vec3 tangentCross=cross(dFdx(local),dFdy(local));
        vec3 N=tangentCross*inversesqrt(max(dot(tangentCross,tangentCross),1e-20));
        for(int i=0;i<8;i++){
          float a=float(i)*2.39996;vec2 offset=vec2(cos(a),sin(a))*clamp(82./d,2.,24.)*(.44+.08*float(i))*texel;
          vec2 uv=clamp(uv0+offset,0.,1.);float ds=texture2D(opaqueDepth,uv).r;
          vec4 h=inverseProjection*vec4(uv*2.-1.,ds*2.-1.,1.);vec3 delta=h.xyz/h.w-local;
          float len=length(delta);shade+=max(dot(N,delta/max(.001,len))-.12,0.)*(1.-smoothstep(.04,.68,len));
        }
      }
      rgb*=1.-shade*.10;
      // Integrate low mist and the illuminated gaps in the canopy along the view ray.
      float span=min(length(local),38.),fog=0.,shafts=0.;
      for(int j=0;j<6;j++){
        vec3 p=origin+ray*(float(j)+.5)*span/6.;
        float valley=exp(-abs(p.x-sin(p.z*.24))* .32);
        float low=exp(-max(p.y-.5,0.)*.95)*valley;
        vec2 cookie=(p.xz-lightDir.xz*p.y/max(.18,lightDir.y))*.084;
        float gap=smoothstep(.44,.66,texture2D(mineral,cookie+sin(time*.11)*.009).r);
        fog+=low;shafts+=gap*(.12+low)*exp(-max(p.y-6.,0.)*.75);
      }
      fog=1.-exp(-fog*span*.0019*mist);rgb=mix(rgb,haze,fog);
      rgb+=solar*daylight*shafts*span*.0017*(.35+.65*pow(max(dot(ray,lightDir),0.),3.));
      gl_FragColor=vec4(rgb,1.);gl_FragDepth=raw;
    }`,
  });
  const background = new ShaderPass(air);
  composer.addPass(background);
  // Preserve the copied opaque depth in this buffer while drawing water and spray.
  const waterPass = {
    enabled: true,
    needsSwap: false,
    setSize() {},
    render(r, write, read) {
      r.setRenderTarget(read);
      r.render(overlay, camera);
    },
  };
  composer.addPass(waterPass);
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.19, 0.35, 1.18);
  composer.addPass(bloom);
  const aa = new SMAAPass(1, 1);
  aa.clear = true;
  composer.addPass(aa);
  if (type === T.UnsignedByteType) {
    for (const rt of [
      aa.edgesRT,
      aa.weightsRT,
      bloom.renderTargetBright,
      ...bloom.renderTargetsHorizontal,
      ...bloom.renderTargetsVertical,
    ])
      rt.texture.type = type;
  }
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: quad,
    fragmentShader: `
    varying vec2 uv0;uniform sampler2D tDiffuse;
    void main(){vec3 c=texture2D(tDiffuse,uv0).rgb;float l=dot(c,vec3(.2126,.7152,.0722));
      c*=mix(vec3(.956,.985,1.026),vec3(1.035,1.006,.966),smoothstep(.03,1.35,l));
      c*=1.-.11*dot(uv0-.5,uv0-.5);gl_FragColor=vec4(c,1.);}`,
  });
  grade.material.depthTest = false;
  grade.material.depthWrite = false;
  composer.addPass(grade);
  const output = new OutputPass();
  output.material.depthTest = false;
  output.material.depthWrite = false;
  output.clear = false;
  composer.addPass(output);

  let tier = 0,
    light = 'afternoon',
    visible = false,
    contextGeneration = 0,
    lost = false,
    playing = !reduced.matches,
    free = false,
    first = true,
    frame = 0,
    last = null,
    elapsed = 0,
    ambient = 0;
  let width = 0,
    height = 0,
    tick = -1,
    chapter = -1,
    moodDirty = true;
  const look = V(0, 0, 0),
    offset = V(0, 0, 0),
    spherical = new T.Spherical();
  function fit() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    const ratio = Math.min(
      devicePixelRatio || 1,
      [1, 1.35, 1.65][tier],
      Math.sqrt([420000, 920000, 1800000][tier] / (w * h)),
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    const px = renderer.getDrawingBufferSize(creek.uniforms.viewport.value);
    opaque.setSize(px.x, px.y);
    air.uniforms.texel.value.set(1 / px.x, 1 / px.y);
    bloom.setSize(px.x * (tier === 0 ? 0.5 : 0.75), px.y * (tier === 0 ? 0.5 : 0.75));
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 59 : 47;
    camera.updateProjectionMatrix();
  }
  function selectQuality() {
    const wasMobile = tier === 0;
    tier = quality.value === 'auto' ? automaticTier(renderer, stage.clientWidth) : Number(quality.value);
    if (wasMobile !== (tier === 0)) moodDirty = true;
    quality.options[0].textContent = 'Auto · ' + tiers[automaticTier(renderer, stage.clientWidth)];
    for (const { mesh, max, fractions } of densities) mesh.count = Math.ceil(max * fractions[tier]);
    renderer.shadowMap.enabled = tier > 0;
    sun.shadow.mapSize.setScalar(tier === 2 ? 2048 : 1024);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    renderer.shadowMap.needsUpdate = true;
    air.uniforms.occlusion.value = tier > 0 ? 1 : 0;
    creek.uniforms.reflectSteps.value = [0, 0, 16][tier];
    width = 0;
    queue();
  }
  function selectLight(name) {
    light = name;
    moodDirty = true;
    for (const b of root.querySelectorAll('[data-light]'))
      b.setAttribute('aria-pressed', String(b.dataset.light === name));
    queue();
  }
  function applyLight() {
    sky.apply(light, tier === 0);
    air.uniforms.mist.value = light === 'morning' ? 3.8 : 1;
    const m = lightSettings[light];
    sun.color.set(m.sun);
    sun.intensity = m.strength;
    sun.target.position.set(0, 0.7, -4);
    sun.position.copy(sky.uniforms.lightDir.value).multiplyScalar(32).add(sun.target.position);
    hemi.color.set(m.air);
    hemi.groundColor.set(light === 'night' ? '#495465' : '#84785c');
    hemi.intensity = m.ambient;
    leafLight.color.copy(hemi.color);
    leafLight.groundColor.copy(hemi.groundColor);
    leafLight.intensity = m.ambient * 1.6;
    air.uniforms.haze.value.copy(scene.fog.color);
    lantern.light(light === 'night' || light === 'blue');
    renderer.shadowMap.needsUpdate = true;
    moodDirty = false;
  }
  function pose() {
    const u = elapsed / duration,
      e = 0.42 * u + 0.58 * u * u * (3 - 2 * u);
    flight.getPoint(e, camera.position);
    gaze.getPoint(e, look);
    camera.lookAt(look);
  }
  function draw(now) {
    frame = 0;
    if (!warmed || !visible || lost || document.hidden || renderer.getContext().isContextLost()) return;
    fit();
    const dt = last === null ? 0 : Math.max(0, (now - last) * 0.001);
    last = now;
    if (playing) {
      ambient += dt;
      if (!free) {
        elapsed = Math.min(duration, elapsed + dt);
        if (elapsed === duration) {
          playing = false;
          buttons();
        }
      }
    }
    if (!free) pose();
    if (moodDirty) applyLight();
    updateLOD(camera, tier);
    time.value = ambient;
    creek.update(ambient);
    const mobile = tier === 0;
    lantern.update(ambient,camera,mobile,tier===2);
    floatHull(skiff.root, ambient, streamHeight, 0, 0.015);
    wildlife(ambient, mobile, camera, daylight.value < 0.5);
    if (!mobile && Math.abs(ambient - lastShadow) > 0.2) {
      renderer.shadowMap.needsUpdate = true;
      lastShadow = ambient;
    }
    renderer.setRenderTarget(opaque);
    renderer.clear();
    renderer.render(scene, camera);
    composer.render(0);
    renderer.setRenderTarget(null);
    if (first) {
      canvas.style.visibility = 'visible';
      finishPeople(renderer, scene, camera, opaque);
      status.hidden = true;
      first = false;
    }
    const step = Math.round(elapsed * 10);
    if (step !== tick) {
      slider.value = String(step / 10);
      tick = step;
    }
    const which = free ? 4 : elapsed < 5.3 ? 0 : elapsed < 11 ? 1 : elapsed < 16.3 ? 2 : 3;
    if (chapter !== which) {
      beat.textContent = free ? 'Free orbit · drag to look' : beats[which];
      chapter = which;
    }
    if (playing) queue();
  }
  function queue() {
    if (!frame && visible && !lost && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function suspend() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = null;
  }
  function buttons() {
    play.textContent = playing ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(!playing));
    orbit.setAttribute('aria-pressed', String(free));
    slider.disabled = free;
    controls.enabled = free;
  }
  function guide(t, run) {
    elapsed = ambient = t;
    free = false;
    playing = run;
    last = null;
    buttons();
    queue();
  }
  orbit.addEventListener('click', () => {
    if (free) {
      guide(elapsed, playing);
      return;
    }
    free = true;
    controls.target.copy(look);
    buttons();
    controls.update();
    queue();
  });
  play.addEventListener('click', () => {
    if (!free && elapsed === duration) {
      guide(0, true);
      return;
    }
    playing = !playing;
    last = null;
    buttons();
    queue();
  });
  find('.creek-replay').addEventListener('click', () => guide(0, true));
  find('.creek-reset').addEventListener('click', () => guide(0, playing));
  slider.addEventListener('input', () => guide(slider.valueAsNumber, false));
  quality.addEventListener('change', selectQuality);
  for (const b of root.querySelectorAll('[data-light]'))
    b.addEventListener('click', () => selectLight(b.dataset.light));
  controls.addEventListener('change', queue);
  canvas.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
    event.preventDefault();
    if (!free) orbit.click();
    spherical.setFromVector3(offset.copy(camera.position).sub(controls.target));
    if (event.key === 'ArrowLeft') spherical.theta -= 0.09;
    if (event.key === 'ArrowRight') spherical.theta += 0.09;
    if (event.key === 'ArrowUp') spherical.phi -= 0.08;
    if (event.key === 'ArrowDown') spherical.phi += 0.08;
    if (event.key === '+' || event.key === '=') spherical.radius *= 0.9;
    if (event.key === '-') spherical.radius *= 1.1;
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    controls.update();
    queue();
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      playing = false;
      buttons();
      queue();
    }
  });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextGeneration++;
    warmed = false;
    lost = true;
    suspend();
    first = true;
    canvas.style.visibility = 'hidden';
    status.hidden = false;
    status.textContent = 'Restoring Sip Creek…';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    const generation = contextGeneration;
    lost = false;
    moodDirty = true;
    renderer.shadowMap.needsUpdate = true;
    restorePeople(scene);
    applyLight();
    warmShaders(renderer, [[scene, camera, opaque], [overlay, camera, opaque]]).then(() => {
      if (lost || generation !== contextGeneration) return;
      warmed = true;
      queue();
    });
  });
  new ResizeObserver(() => {
    if (quality.value === 'auto' && tier !== automaticTier(renderer, stage.clientWidth)) selectQuality();
    else queue();
  }).observe(stage);
  selectQuality();
  buttons();
  // Hold the first frame until the shaders are linked; the canvas stays hidden meanwhile.
  let warmed = false;
  primePeople(scene, tier === 2);
  if (moodDirty) applyLight(); // fog and scene.environment are part of every lit shader's key
  warmShaders(renderer, [
    [scene, camera, opaque],
    [overlay, camera, opaque],
  ]).then((ms) => {
    if (contextGeneration !== 0) return;
    warmed = true;
    console.info(`Sip Creek shaders ready in ${Math.round(ms)} ms (tier ${tier})`);
    queue();
  });
  return {
    setVisible(value) {
      visible = value;
      if (value) queue();
      else suspend();
    },
  };
}
