import * as T from 'three';
import { seeded, tau, V } from './sip-creek-land.js';

export const lightSettings = {
  morning: {
    sun: '#ffe4ac',
    sky: '#89afc6',
    air: '#d6dbcf',
    fog: '#c4d2ca',
    strength: 2.65,
    ambient: 1.12,
    dir: [-0.72, 0.32, -0.61],
  },
  afternoon: {
    sun: '#fff1cb',
    sky: '#70a8ce',
    air: '#e1e7d1',
    fog: '#acbdbe',
    strength: 3.0,
    ambient: 1.05,
    dir: [-0.43, 0.63, -0.66],
  },
  golden: {
    sun: '#ffcd8d',
    sky: '#819eb4',
    air: '#ead0a2',
    fog: '#d2b891',
    strength: 3.1,
    ambient: 1.12,
    dir: [-0.62, 0.38, -0.69],
  },
  blue: {
    sun: '#cadffb',
    sky: '#445c82',
    air: '#ab98aa',
    fog: '#8992a0',
    strength: 1.13,
    ambient: 0.96,
    dir: [-0.38, 0.46, -0.79],
  },
  night: {
    sun: '#b2d5ff',
    sky: '#101e37',
    air: '#455672',
    fog: '#34465c',
    strength: 0.52,
    ambient: 0.56,
    dir: [-0.22, 0.45, -0.87],
  },
};
export const waterHeightGLSL =
  'float waterY(float z){return .021*(z+22.)+.32*smoothstep(6.8,7.5,z)+.23*smoothstep(1.,1.55,z);}';
const grainGLSL = `
uniform sampler2D mineral, contactMap;
uniform float creekTime, daylight;
varying vec3 creekP;
${waterHeightGLSL}
vec4 sampleGround(vec2 uv){
  vec4 a=texture2D(mineral,uv);
  vec4 b=texture2D(mineral,mat2(.81,-.59,.59,.81)*uv*.63+vec2(.27,.49));
  return mix(a,b,.48);
}
vec4 strata(vec3 p,vec3 n){
  vec3 w=pow(abs(n),vec3(4.));w/=max(.001,w.x+w.y+w.z);
  return sampleGround(p.yz)*w.x+sampleGround(p.xz)*w.y+sampleGround(p.xy)*w.z;
}
float canopy(vec2 p){
  vec2 uv=p*.083+vec2(.012,.008)*sin(creekTime*.42+p*.23);
  return smoothstep(.36,.60,texture2D(mineral,uv).r);
}
float caustics(vec2 p){
  p=p*4.5+vec2(creekTime*.50,-creekTime*.36);
  vec2 a=sin(p+sin(p.yx*1.7)*1.6);
  vec2 b=cos(p*1.14+sin(p.yx*1.2+1.2)*1.5);
  return pow(1.-min(1.,abs(a.x+a.y*.65)),7.)*.6+pow(1.-min(1.,abs(b.y+b.x*.7)),9.)*.4;
}`;

// Periodic lattice octaves bake a multiscale mineral field, grooves and normal slopes.
function mineralMap() {
  const size = 256,
    rng = seeded(159),
    grids = [4, 8, 16, 32, 64, 128].map((n) => Float32Array.from({ length: n * n }, rng));
  function field(x, y) {
    let value = 0,
      weight = 0.46;
    for (const grid of grids) {
      const n = Math.sqrt(grid.length),
        u = (x * n) / size,
        v = (y * n) / size,
        i = Math.floor(u),
        j = Math.floor(v);
      const a = u - i,
        b = v - j,
        s = a * a * (3 - 2 * a),
        t = b * b * (3 - 2 * b);
      const at = (dx, dy) => grid[((j + dy + n) % n) * n + ((i + dx + n) % n)];
      value +=
        weight *
        T.MathUtils.lerp(T.MathUtils.lerp(at(0, 0), at(1, 0), s), T.MathUtils.lerp(at(0, 1), at(1, 1), s), t);
      weight *= 0.56;
    }
    return value;
  }
  const data = new Uint8Array(size * size * 4),
    heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) heights[y * size + x] = field(x, y);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x,
        h = heights[i];
      data[4 * i] = Math.min(255, h * 255);
      data[4 * i + 1] = T.MathUtils.clamp(128 + (heights[y * size + ((x + 1) % size)] - h) * 1300, 0, 255);
      data[4 * i + 2] = T.MathUtils.clamp(128 + (heights[((y + 1) % size) * size + x] - h) * 1300, 0, 255);
      data[4 * i + 3] = rng() * 255;
    }
  const tex = new T.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
export function materials(time, daylight, contactMap) {
  const mineral = { value: mineralMap() };
  function pbr(kind, options = {}) {
    const mat = new T.MeshPhysicalMaterial({ roughness: 0.85, ...options });
    mat.customProgramCacheKey = () => kind;
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { mineral, creekTime: time, daylight, contactMap });
      s.vertexShader =
        'varying vec3 creekP;\n' +
        s.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
        vec4 creekLocal=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        creekLocal=instanceMatrix*creekLocal;
        #endif
        creekP=(modelMatrix*creekLocal).xyz;`,
        );
      s.fragmentShader =
        grainGLSL +
        '\n' +
        s.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
        vec3 worldN=normalize(vNormal*mat3(viewMatrix));
        vec3 bp=creekP;
        ${kind === 'wood' ? 'bp*=vec3(3.2,.23,3.2);' : ''}
        vec4 baseGrain=strata(bp*.61,worldN);
        vec4 detail=strata(bp*5.8,worldN);
        float damp=1.-smoothstep(-.025,.15,creekP.y-waterY(creekP.z));
        float fleck=texture2D(mineral,bp.xz*1.8).a;
        diffuseColor.rgb*=(.49+.88*baseGrain.r+.32*detail.r)*(.86+.24*fleck);
        ${
          kind === 'soil'
            ? `float humus=smoothstep(.44,.65,baseGrain.r)*smoothstep(.22,.56,creekP.y-waterY(creekP.z));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.088,.061,.032)*(.6+detail.r),humus*.61);`
            : ''
        }
        ${
          kind === 'wood'
            ? `float fibre=texture2D(mineral,bp.xz*.45+vec2(bp.y*.17)).r;
        float rings=sin((bp.x+bp.z)*32.+baseGrain.r*32.+fibre*18.);
        diffuseColor.rgb*=(.90+.10*rings)*(.66+fibre*.64);`
            : ''
        }
        ${
          kind === 'rock'
            ? `float moss=smoothstep(.57,.88,worldN.y+(baseGrain.r-.54)*2.4+(detail.r-.52)*.75-damp*.91);
        float vein=1.-smoothstep(.008,.052,abs(sin(bp.y*12.+bp.x*3.+baseGrain.r*10.)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.41,.40,.33),vein*.13);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.087,.018)*(.36+detail.r*1.52),moss*.76);`
            : ''
        }
        diffuseColor.rgb*=mix(1.,.73,damp)*mix(.72,1.08,canopy(creekP.xz));
        ${kind === 'soil' ? 'diffuseColor.rgb*=texture2D(contactMap,(creekP.xz+vec2(24.,30.))/48.).r;' : ''}
        diffuseColor.rgb+=diffuseColor.rgb*caustics(creekP.xz)*damp*daylight*.88;`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor*(.79+.28*baseGrain.r)-damp*.26,.2,1.);',
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
           vec3 dpx=dFdx(vViewPosition),dpy=dFdy(vViewPosition);
           float relief=baseGrain.r*.046+detail.r*.004;
           vec3 R1=cross(dpy,normal),R2=cross(normal,dpx);
           float det=dot(dpx,R1);
           // At a subpixel silhouette a derivative quad can collapse. Keep the
           // geometric normal when that quad provides no usable tangent frame.
           vec3 perturbed=abs(det)*normal+sign(det)*(dFdx(relief)*R1+dFdy(relief)*R2);
           float norm2=dot(perturbed,perturbed);
           if(norm2>1e-18 && abs(det)>1e-10)normal=perturbed*inversesqrt(norm2);`,
          );
    };
    return mat;
  }
  return {
    soil: pbr('soil', { vertexColors: true }),
    rock: pbr('rock'),
    wood: pbr('wood', { color: '#917453' }),
    mineral,
  };
}

export const skyGLSL = `
uniform vec3 zenith, horizon, solar, lightDir;
uniform float daylight;
float skyHash(vec2 p){return fract(sin(dot(p,vec2(23.17,89.51)))*15731.41);}
float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+1.),f.x),f.y);}
vec3 skyColor(vec3 d){
  float mu=max(dot(d,lightDir),0.);
  float path=exp(-max(d.y,0.)*3.5);
  vec3 col=mix(zenith,horizon,path);
  vec2 cloud=d.xz/max(.12,d.y+.12)*vec2(1.2,3.1);
  float cirrus=skyNoise(cloud)*.58+skyNoise(cloud*2.14)*.29+skyNoise(cloud*4.27)*.13;
  col=mix(col,horizon+solar*.27,smoothstep(.55,.81,cirrus)*.46*daylight*smoothstep(.02,.23,d.y));
  col+=solar*daylight*(.09*pow(mu,10.)+.52*pow(mu,160.));
  float disk=smoothstep(.99986,.99996,mu);
  return col+solar*disk*mix(2.2,9.,daylight);
}`;
export function atmosphere(scene, renderer, daylight) {
  const uniforms = {
    zenith: { value: new T.Color() },
    horizon: { value: new T.Color() },
    solar: { value: new T.Color() },
    lightDir: { value: V(0, 1, 0) },
    daylight,
  };
  const sky = new T.Mesh(
    new T.SphereGeometry(90, 32, 20),
    new T.ShaderMaterial({
      uniforms,
      side: T.BackSide,
      depthWrite: false,
      vertexShader:
        'varying vec3 ray; void main(){ray=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        skyGLSL + '\nvarying vec3 ray; void main(){gl_FragColor=vec4(skyColor(normalize(ray)),1.);}',
    }),
  );
  sky.renderOrder = -100;
  scene.add(sky);
  const skyOnly = new T.Scene();
  skyOnly.add(sky.clone());
  const pmrem = new T.PMREMGenerator(renderer);
  let env;
  function apply(name) {
    const m = lightSettings[name];
    uniforms.zenith.value.set(m.sky);
    uniforms.horizon.value.set(m.air);
    uniforms.solar.value.set(m.sun);
    uniforms.lightDir.value.fromArray(m.dir).normalize();
    daylight.value = name === 'night' ? 0.04 : name === 'blue' ? 0.45 : 1;
    scene.fog = new T.FogExp2(m.fog, name === 'night' ? 0.033 : 0.019);
    const previous = env;
    env = pmrem.fromScene(skyOnly, 0.025, 0.1, 110);
    scene.environment = env.texture;
    previous?.dispose();
    scene.environmentIntensity = 0.48;
  }
  return { apply, uniforms };
}
