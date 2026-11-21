import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const vertexShader = 'varying vec2 st;void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}';

// Use the opaque color and depth twice: first to shade contacts, then as ray
// intersections for water. Land and architecture only need one beauty draw.
class CoastPass extends Pass {
  constructor(land, water, camera, opaque) {
    super();
    this.needsSwap = false;
    Object.assign(this, { land, water, camera, opaque });
    this.base = new FullScreenQuad(
      new T.ShaderMaterial({
        uniforms: {
          colorMap: { value: opaque.texture },
          depthMap: { value: opaque.depthTexture },
          clip: { value: new T.Vector2(camera.near, camera.far) },
          invProjection: { value: camera.projectionMatrixInverse },
          eye: { value: camera.matrixWorld },
          haze: { value: land.fog.color },
          invSize: { value: new T.Vector2() },
          ao: { value: true },
        },
        depthFunc: T.AlwaysDepth,
        depthWrite: true,
        vertexShader,
        fragmentShader: `uniform sampler2D colorMap,depthMap;uniform vec2 clip,invSize;uniform mat4 invProjection,eye;uniform vec3 haze;uniform bool ao;varying vec2 st;
      float depth(float z){return clip.x*clip.y/(clip.y-z*(clip.y-clip.x));}
      void main(){
        float z=texture2D(depthMap,st).r,d=depth(z),occ=0.;
        if(ao && d<50.){
          float angle=2.39996,rad=clamp(.29/(max(d,.1)*invSize.y),2.,30.);
          for(int i=0;i<12;i++){
            float a=float(i)*angle;
            vec2 off=vec2(cos(a),sin(a))*sqrt((float(i)+.5)/12.)*invSize*rad;
            float diff=d-depth(texture2D(depthMap,st+off).r);
            occ+=smoothstep(.025,.17,diff)*(1.-smoothstep(.23,.76,diff));
          }
        }
        vec3 rgb=texture2D(colorMap,st).rgb*(1.-occ*.043);
        if(z<.99999){
          vec4 pos=invProjection*vec4(st*2.-1.,z*2.-1.,1.);
          float elevation=(eye*vec4(pos.xyz/pos.w,1.)).y;
          float saltMist=(1.-exp(-d*.019))*exp(-max(elevation,0.)*.28);
          rgb=mix(rgb,haze,saltMist*.44);
        }
        gl_FragColor=vec4(rgb,1.);
        gl_FragDepth=z;
      }`,
      }),
    );
  }
  render(renderer, write, read) {
    renderer.setRenderTarget(this.opaque);
    renderer.clear();
    renderer.render(this.land, this.camera);
    renderer.setRenderTarget(read);
    this.base.render(renderer);
    renderer.render(this.water, this.camera);
  }
}
export function makePipeline(renderer, land, water, camera, opaque, u) {
  const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: true });
  const composer = new EffectComposer(renderer, target),
    base = new CoastPass(land, water, camera, opaque);
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.16, 0.36, 1.22);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, ...u },
    vertexShader,
    fragmentShader: `
    uniform sampler2D tDiffuse;uniform float seaTime,storm;varying vec2 st;
    float hash(vec2 p){return fract(sin(dot(p,vec2(81.2,25.6)))*17891.2);}
    float rain(vec2 uv,vec2 scale,float speed) {
      uv.x+=uv.y*(.14+storm*.10);vec2 p=uv*scale;
      p.y+=seaTime*speed+hash(vec2(floor(p.x),.3))*11.;
      vec2 id=floor(p),f=fract(p);
      float line=1.-smoothstep(.018,.16,abs(f.x-.5));
      return line*smoothstep(.04,.37,f.y)*(1.-smoothstep(.48,.98,f.y))*step(.72,hash(id));
    }
    void main(){
      vec3 c=texture2D(tDiffuse,st).rgb;
      if(storm>.33){
        float streaks=rain(st,vec2(104.,4.3),13.)+.48*rain(st*1.63+.13,vec2(97.,6.1),19.);
        float sheets=.5+.5*sin(st.x*13.+st.y*4.+seaTime*.8);
        c=mix(c,vec3(.48,.58,.66),smoothstep(.33,1.,storm)*(.09*streaks+.026*sheets));
      }
      float lum=dot(c,vec3(.2126,.7152,.0722));
      c*=mix(vec3(.965,.992,1.025),vec3(1.028,1.006,.975),smoothstep(.09,1.2,lum));
      c*=1.-.095*pow(length((st-.5)*1.42),2.);
      gl_FragColor=vec4(c,1.);
    }`,
  });
  const aa = new SMAAPass(1, 1),
    out = new OutputPass();
  // Fullscreen stages run at different clip-space depths. None of them
  // may inherit geometry depth or leave depth in a reused ping-pong target.
  Object.assign(grade.uniforms, u);
  for (const m of [grade.material, aa.materialBlend, aa.materialEdges, aa.materialWeights, out.material]) {
    m.depthTest = false;
    m.depthWrite = false;
  }
  aa.clear = true;
  for (const pass of [base, bloom, grade, aa, out]) composer.addPass(pass);
  return {
    draw(dt) {
      composer.render(dt);
    },
    size(w, h, mobile) {
      aa.enabled = !mobile;
      composer.setSize(w, h);
      opaque.setSize(w, h);
      base.base.material.uniforms.invSize.value.set(1 / w, 1 / h);
      base.base.material.uniforms.ao.value = !mobile;
      bloom.setSize(Math.ceil(w * (mobile ? 0.5 : 0.75)), Math.ceil(h * (mobile ? 0.5 : 0.75)));
    },
  };
}
