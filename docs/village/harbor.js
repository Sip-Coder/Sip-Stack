import * as T from 'three';

// Rectilinear rings keep vertex density near the moorings and let the same surface
// reach the horizon. All waves use world coordinates, including the boat samples.
const waves = [
  [0.89, 0.46, 0.052, 3.8, 1.52],
  [-0.33, 0.94, 0.033, 2.13, 1.86],
  [0.62, -0.78, 0.014, 0.94, 2.42],
];
export function swell(x, z, t) {
  let y = 0;
  for (const w of waves) y += w[2] * Math.sin(((w[0] * x + w[1] * z) * Math.PI * 2) / w[3] - t * w[4]);
  return y;
}
export function harbor(scene) {
  const geo = new T.PlaneGeometry(2, 2, 168, 168);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const spread = (v) => Math.sign(v) * (Math.abs(v) * 16 + Math.abs(v) ** 7 * 187);
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, spread(pos.getX(i)), 0.53, spread(pos.getZ(i)));
  geo.computeBoundingSphere();
  const uniforms = {
    t: { value: 0 },
    sunDir: { value: new T.Vector3() },
    sunColor: { value: new T.Color() },
    horizon: { value: new T.Color() },
    zenith: { value: new T.Color() },
    opaque: { value: null },
    sceneDepth: { value: null },
    useSSR: { value: false },
    dusk: { value: 0 },
  };
  const mat = new T.ShaderMaterial({
    uniforms,
    vertexShader: `
    uniform float t;
    varying vec3 seaPos,seaNormal;
    void wave(vec2 d,float amp,float lengthW,float speed,inout vec3 p,inout vec2 gradient) {
      float k=6.283185/lengthW, phase=k*dot(position.xz,d)-t*speed;
      p.y+=amp*sin(phase);
      p.xz+=.47*amp*d*cos(phase);
      gradient+=k*amp*d*cos(phase);
    }
    void main(){
      vec3 p=position; vec2 g=vec2(0.);
      ${waves.map((w) => 'wave(vec2(' + w[0] + ',' + w[1] + '),' + w.slice(2).join(',') + ',p,g);').join('\n')}
      seaPos=p;seaNormal=normalize(vec3(-g.x,1.,-g.y));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }`,
    fragmentShader: `
    uniform float t,dusk; uniform vec3 sunDir,sunColor,horizon,zenith;
    uniform sampler2D opaque,sceneDepth; uniform bool useSSR;
    uniform mat4 projectionMatrix;
    varying vec3 seaPos,seaNormal;
    float boxDistance(vec2 p,vec2 mid,vec2 halfSize) {
      vec2 d=abs(p-mid)-halfSize; return length(max(d,0.))+min(max(d.x,d.y),0.);
    }
    float ripple(vec2 p) {
      return sin(p.x*9.8+p.y*7.4+t*2.7+.8*sin(p.y*4.7-t))*.55
           + sin(p.x*6.2-p.y*13.2-t*2.3+sin(p.x*3.9+t))*.45;
    }
    void main() {
      vec2 p=seaPos.xz;
      vec3 V=normalize(cameraPosition-seaPos);
      float dist=length(cameraPosition-seaPos);
      float micro=1.-smoothstep(17.,57.,dist);
      vec3 N=normalize(seaNormal+vec3(ripple(p)*.058,0.,ripple(p.yx+.8)*.047)*micro);
      vec3 R=reflect(-V,N);
      float fres=.0204+.9796*pow(1.-max(dot(N,V),0.),5.);
      vec3 sky=mix(horizon,zenith,pow(clamp(R.y,0.,1.),.63));
      vec3 refl=sky;
      if(useSSR && dist<52.) {
        vec3 origin=(viewMatrix*vec4(seaPos+N*.11,1.)).xyz, dir=mat3(viewMatrix)*R;
        float travel=.15;
        for(int i=0;i<22;i++) {
          vec3 ray=origin+dir*travel;
          vec4 clip=projectionMatrix*vec4(ray,1.);
          vec3 ndc=clip.xyz/clip.w*.5+.5;
          if(clip.w<=0.||any(lessThan(ndc.xy,vec2(0.)))||any(greaterThan(ndc.xy,vec2(1.)))) break;
          float sampleZ=texture2D(sceneDepth,ndc.xy).r;
          float hit=ndc.z-sampleZ;
          if(hit>0. && hit<.00005+travel*.000035) {
            vec2 edge=smoothstep(vec2(0.),vec2(.07),min(ndc.xy,1.-ndc.xy));
            refl=mix(sky,texture2D(opaque,ndc.xy).rgb,edge.x*edge.y*.34);
            break;
          }
          travel+=.19+travel*.16;
        }
      }
      float land=boxDistance(p,vec2(0.,-6.),vec2(10.,7.5));
      float jetty=min(boxDistance(p,vec2(3.8,4.25),vec2(.80,2.75)),boxDistance(p,vec2(6.94,6.30),vec2(2.35,.7)));
      float shore=max(.01,min(land,jetty));
      float depth=.27+min(17.,.39*shore+.19*abs(sin(p.x*.51+p.y*.29)));
      vec3 trans=exp(-vec3(.92,.39,.28)*depth/max(.38,V.y));
      vec3 scatter=mix(vec3(.009,.091,.118),vec3(.024,.25,.209),clamp(sunDir.y,0.,1.));
      float veins=abs(sin(p.x*4.1+sin(p.y*3.+t*.55))+sin(p.y*3.3+sin(p.x*3.7-t*.71)));
      float caustic=pow(1.-smoothstep(.02,.25,veins),2.)*micro;
      vec3 bed=vec3(.104,.267,.205)*(.80+.44*caustic+.1*sin(p.x*9.+sin(p.y*6.)));
      vec3 water=mix(scatter,bed,trans)*(1.-dusk*.68);
      vec3 H=normalize(V+sunDir);
      float glint=pow(max(dot(N,H),0.),270.)*1.7 + .11*pow(max(dot(N,H),0.),24.);
      vec3 color=mix(water,refl,clamp(fres+.09,0.,1.))+sunColor*glint;
      float lace=sin(shore*33.-t*2.+1.4*ripple(p))*.5+.5;
      float foam=(1.-smoothstep(.02,.35+.12*sin(t+p.x*2.),shore))*smoothstep(.2,.84,lace)*micro;
      color=mix(color,vec3(.73,.81,.71)*(1.-dusk*.65),foam*.76);
      color=mix(color,horizon,1.-exp(-.000048*dist*dist));
      gl_FragColor=vec4(color,1.);
    }`,
  });
  const water = new T.Mesh(geo, mat);
  water.name = 'Harbor surface';
  scene.add(water);
  return { water, uniforms };
}
