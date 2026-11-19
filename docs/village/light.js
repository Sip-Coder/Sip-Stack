import * as T from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// The same analytical sky supplies the visible background and filtered PBR radiance.
export function coastalLight(renderer, scene, hemi, sun, sea) {
  const sky = new Sky(),
    skyScene = new T.Scene();
  sky.scale.setScalar(320);
  skyScene.add(sky);
  const scattering = sky.material.uniforms;
  scattering.turbidity.value = 3.35;
  scattering.rayleigh.value = 1.05;
  scattering.mieCoefficient.value = 0.0042;
  scattering.mieDirectionalG.value = 0.82;
  // Wisps occupy a high cloud deck. Forward scatter warms their sunward margins.
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace(
      'void main() {',
      `
    float hashCloud(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float clouds(vec2 p){
      vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hashCloud(i),hashCloud(i+vec2(1,0)),f.x),mix(hashCloud(i+vec2(0,1)),hashCloud(i+1.),f.x),f.y);
    }
    void main() {`,
    )
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `
      vec2 p=direction.xz/(max(.03,direction.y)+.15)*vec2(2.5,5.7);
      float field=clouds(p)*.53+clouds(p*2.1)*.28+clouds(p*4.4)*.13+clouds(p*9.1)*.06;
      float cloud=smoothstep(.46,.74,field)*smoothstep(.01,.20,direction.y)*.49;
      vec3 mist=mix(vec3(.72,.79,.86),vec3(1.75,1.35,.96),pow(max(cosTheta,0.),3.));
      vec3 twilight=mix(vec3(.44,.29,.32),vec3(.075,.108,.208),smoothstep(.0,.65,direction.y));
      retColor=mix(twilight,retColor,smoothstep(-.055,.065,vSunDirection.y));
      retColor=mix(retColor,mist*(.39+.61*smoothstep(-.1,.25,vSunDirection.y)),cloud);
      gl_FragColor=vec4(retColor,1.);`,
    );
  const floatTarget = renderer.extensions.has('EXT_color_buffer_float');
  const gen = floatTarget ? new T.PMREMGenerator(renderer) : null;
  const cube = new T.WebGLCubeRenderTarget(256, {
    type: floatTarget ? T.HalfFloatType : T.UnsignedByteType,
    generateMipmaps: true,
    minFilter: T.LinearMipmapLinearFilter,
  });
  const capture = new T.CubeCamera(0.1, 500, cube);
  let env,
    pending = true;
  const a = new T.Color(),
    b = new T.Color();
  const keys = [
    {
      sun: [18, 19, 15],
      direct: '#fff2d8',
      intensity: 2.65,
      sky: '#adcbde',
      ground: '#bc9e7b',
      horizon: '#d9e2dc',
      zenith: '#83b5d0',
      hemi: 1.05,
    },
    {
      sun: [-25, 13, 5.5],
      direct: '#ffce98',
      intensity: 3.25,
      sky: '#c5d4d7',
      ground: '#ba8f67',
      horizon: '#f2cda6',
      zenith: '#84abc4',
      hemi: 0.76,
    },
    {
      sun: [-22, -1.1, -9],
      direct: '#d6a3a1',
      intensity: 0.27,
      sky: '#99a4c8',
      ground: '#7c6873',
      horizon: '#ba979c',
      zenith: '#4e6386',
      hemi: 0.6,
    },
  ];
  scene.fog = new T.FogExp2(0xdabda1, 0.0088);
  function change(value) {
    const i = value <= 0.5 ? 0 : 1,
      f = i === 0 ? value * 2 : (value - 0.5) * 2,
      l = keys[i],
      r = keys[i + 1];
    const color = (key, dest) => dest.copy(a.set(l[key])).lerp(b.set(r[key]), f);
    sun.position.set(...l.sun).lerp(new T.Vector3(...r.sun), f);
    const solar = sea.sunDir.value.copy(sun.position).normalize();
    scattering.sunPosition.value.copy(solar).multiplyScalar(450000);
    sun.target.position.set(0, 2, -4);
    color('direct', sun.color);
    sun.intensity = T.MathUtils.lerp(l.intensity, r.intensity, f);
    color('sky', hemi.color);
    color('ground', hemi.groundColor);
    hemi.intensity = T.MathUtils.lerp(l.hemi, r.hemi, f);
    color('horizon', scene.fog.color);
    sea.horizon.value.copy(scene.fog.color);
    color('zenith', sea.zenith.value);
    sea.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
    sea.dusk.value = Math.max(0, value * 2 - 1);
    scene.environmentIntensity = 0.36 - 0.23 * sea.dusk.value;
    renderer.toneMappingExposure = 1.0 + sea.dusk.value * 0.1;
    renderer.shadowMap.needsUpdate = true;
    pending = true;
  }
  function captureSky() {
    if (!pending) return;
    const clear = renderer.autoClear;
    renderer.autoClear = true;
    capture.update(renderer, skyScene);
    scene.background = cube.texture;
    if (gen) {
      env = gen.fromCubemap(cube.texture, env);
      scene.environment = env.texture;
    }
    renderer.autoClear = clear;
    pending = false;
  }
  return {
    change,
    captureSky,
    restore() {
      pending = true;
    },
  };
}
