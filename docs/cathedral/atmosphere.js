import * as T from 'three';
import { Masonry, seeded } from './geometry.js';

const stoneNoise = `
float stoneHash(vec3 p) {
  p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z);
}
float mineral(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(stoneHash(i),stoneHash(i+vec3(1,0,0)),f.x),
                 mix(stoneHash(i+vec3(0,1,0)),stoneHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(stoneHash(i+vec3(0,0,1)),stoneHash(i+vec3(1,0,1)),f.x),
                 mix(stoneHash(i+vec3(0,1,1)),stoneHash(i+vec3(1)),f.x),f.y),f.z);
}`;
export function marble(instanced=false) {
  const mat=new T.MeshStandardMaterial({color:0xd6c9bd,roughness:.82,metalness:.025});
  mat.customProgramCacheKey=()=>instanced?'shaft-marble':'cut-marble';
  mat.onBeforeCompile=s=>{
    const vary='varying vec3 vStone; varying float vHeight; varying float vCarve;';
    s.vertexShader=vary+'\n'+s.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vec4 block = vec4(position,1.);
      #ifdef USE_INSTANCING
        block = instanceMatrix * block;
      #endif
      vStone=(modelMatrix * block).xyz;
      vHeight=${instanced?'position.y*.104':'clamp((vStone.y-9.)*.055,0.,1.)'};
      vCarve=max(0.,-normal.y);
    `);
    s.fragmentShader=vary+'\n'+stoneNoise+'\n'+s.fragmentShader
      .replace('#include <color_fragment>',`
        #include <color_fragment>
        float cloud=mineral(vStone*.47);
        float wave=vStone.y*.68+vStone.x*.26+vStone.z*.17+3.8*cloud+mineral(vStone*1.35)*.7;
        float joint=abs(fract(vStone.y*1.58+.17)-.5);
        float course=(1.-smoothstep(.006,.018+fwidth(vStone.y)*1.58,joint))*smoothstep(.015,.07,.09-fwidth(vStone.y));
        vec2 stoneUV=abs(inverseTransformDirection(normalize(vNormal),viewMatrix).y)>.85?vStone.xz:vec2(vStone.x*.81+vStone.z*.60,vStone.y);
        vec2 cell=vec2(stoneUV.x*.62+.5*mod(floor(vStone.y*1.58+.67),2.),vStone.y*1.58+.67);
        float cut=abs(fract(cell.x)-.5);
        float seam=(1.-smoothstep(.008,.022+fwidth(cell.x),cut))*smoothstep(.012,.085,.10-fwidth(cell.x));
        float blockTone=stoneHash(vec3(floor(cell),14.0))*.048;
        float vein=1.-smoothstep(.04,.32+fwidth(wave),abs(sin(wave)));
        float curvature=length(fwidth(normalize(vNormal)))/max(.02,length(fwidth(vStone)));
        float grime=clamp(vCarve*.53+curvature*.035,0.,.55)*(.95-.37*clamp(vHeight,0.,1.));
        diffuseColor.rgb*=mix(vec3(.80,.78,.77),vec3(1.06),cloud)*(1.-vein*.16)*(1.-grime)*(1.-course*.11-seam*.075-blockTone);
      `)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=.70+.20*cloud;')
      .replace('#include <opaque_fragment>',`
        // Each fixture sits below its shaft. Octagonal facets facing the
        // street receive a warmer wash than the back of the carving.
        float face=.22+.78*max(0.,dot(inverseTransformDirection(normal,viewMatrix),normalize(vec3(-.48,-.20,.85))));
        float uplight=${instanced?'(.23+1.55*exp(-2.35*vHeight))':'(.13+.19*exp(-2.*vHeight))'};
        outgoingLight+=diffuseColor.rgb*vec3(1.54,.57,.115)*uplight*face*(1.-grime);
        #include <opaque_fragment>
      `);
  };
  return mat;
}

// Bake spherical, tileable cloud noise once. The sky has no per-frame
// raymarch or imported image and supplies the reflection in the dark glass.
function skyMap() {
  const w=1024,h=512, c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d'), img=ctx.createImageData(w,h);
  const rng=seeded(1826), n=Float32Array.from({length:65536},rng);
  const fade=t=>t*t*(3-2*t), lerp=(a,b,t)=>a+(b-a)*t;
  function noise(x,y) {
    const ix=Math.floor(x), iy=Math.floor(y), u=fade(x-ix),v=fade(y-iy);
    const sample=(a,b)=>n[(a&255)+256*(b&255)];
    return lerp(lerp(sample(ix,iy),sample(ix+1,iy),u),lerp(sample(ix,iy+1),sample(ix+1,iy+1),u),v);
  }
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const elev=Math.PI*(.5-y/h), altitude=Math.sin(elev);
    const t=Math.min(1,Math.max(0,altitude*1.95))**.65;
    const angle=2*Math.PI*x/w, low=Math.max(0,1-Math.abs(altitude)*3);
    const rose=(.5+.5*Math.cos(angle+1.55))*low;
    const d=1/(Math.max(altitude,0)+.095), a=Math.cos(angle)*d, b=Math.sin(angle)*d;
    let f=noise(a*1.2,b*1.65)*.50+noise(a*2.4,b*3.3)*.27+noise(a*5,b*6.9)*.15+noise(a*10,b*13)*.08;
    const cloud=fade(Math.min(1,Math.max(0,(f-.30)*2.6)))*Math.min(1,Math.max(0,altitude*16));
    const i=4*(x+w*y);
    for(let j=0;j<3;j++) {
      const horizon=[108,111,138][j];
      const glow=Math.min(1,Math.max(0,altitude*15))*rose;
      const base=lerp(horizon+[26,7,8][j]*glow,[19,34,74][j],t);
      img.data[i+j]=lerp(base,lerp([153,140,165][j],[72,77,115][j],t),cloud*.77);
    }
    img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex=new T.CanvasTexture(c); tex.colorSpace=T.SRGBColorSpace;
  tex.mapping=T.EquirectangularReflectionMapping; return tex;
}

export function atmosphere(scene,mobile) {
  const sky=skyMap(); scene.background=sky; scene.environment=sky; scene.environmentIntensity=.26;
  scene.fog=new T.FogExp2(0x6c6f8a,.0073);
  const city=new Masonry(), roofs=new Masonry(), lamps=new Masonry(), rng=seeded(2743);
  for(let x=-210;x<=210;x+=9) for(let z=-225;z<=190;z+=9) {
    if(Math.abs(x)<26 && z<43 && z>-69) continue;
    const bx=x+rng()*3, bz=z+rng()*3, h=2+rng()*4, w=4+rng()*4, d=4+rng()*3;
    city.box(bx,-5+h*.5,bz,w,h,d);
    const roof=new T.CylinderGeometry(.01,1,1,4); roof.rotateY(Math.PI/4);
    roof.scale(w*.72,1.8,d*.72); roofs.put(roof,bx,h-4.15,bz);
    if(rng()<.27) lamps.box(bx+.7,h-6.0,bz+d*.5+.035,.30,.43,.08);
  }
  // Distant towers, campanili and chimney stacks break up the roofline.
  for(let i=0;i<180;i++) {
    const a=rng()*Math.PI*2, dist=70+rng()*160, x=Math.cos(a)*dist,z=Math.sin(a)*dist;
    const h=4+rng()**2*13, r=1.1+rng()*2.5;
    city.box(x,-4+h*.5,z,r*2,h,r*1.65);
    city.box(x,h-4,z,r*2.1,.38,r*1.8);
    if(i%3===0) roofs.profile(x,h-3.85,z,[[0,r],[.3,r*1.15],[2.3+rng()*2,0]],6);
  }
  city.box(0,-5.5,0,1800,1,1800);
  city.addTo(scene,new T.MeshStandardMaterial({color:0x54556b,roughness:1}),false);
  roofs.addTo(scene,new T.MeshStandardMaterial({color:0x584a59,roughness:.93}),false);
  lamps.addTo(scene,new T.MeshBasicMaterial({color:new T.Color(1.7,.83,.30)}),false);
  scene.add(new T.HemisphereLight(0xafc7ff,0x685765,1.02));
  const moon=new T.DirectionalLight(0xb9cbff,1.18); moon.position.set(-24,32,-16); scene.add(moon);
  function spot(pos,target,power,angle,distance) {
    const l=new T.SpotLight(0xffbb6b,power,distance,angle,.68,1.6);
    l.position.set(...pos); l.target.position.set(...target); l.castShadow=true;
    l.shadow.mapSize.setScalar(mobile?512:1024); l.shadow.bias=-.00028; l.shadow.normalBias=.035;
    l.shadow.camera.near=.5; scene.add(l,l.target);
  }
  spot([-6,7,31],[0,21,23],480,.67,48);
  spot([11,12,29],[7,29,21],355,.61,40);
  spot([-3,22,-9],[0,39,-18],585,.65,43);
}
