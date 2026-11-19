import * as T from 'three';
import { seeded, skyLookup } from './sip-craft-sky.js';

// Direction, wavelength, amplitude, steepness. Use the same dispersion relation
// for the hull and impact spray as for the rendered surface.
const swells = [
  [0.22, 0.98, 5.8, 0.095, 0.64],
  [-0.44, 0.9, 3.2, 0.061, 0.66],
  [0.68, 0.73, 1.69, 0.034, 0.56],
  [-0.79, 0.61, 0.81, 0.018, 0.49],
  [0.35, 0.94, 0.43, 0.009, 0.39],
  [0.94, 0.34, 0.22, 0.004, 0.34],
];
const waveCode = swells
  .map(
    ([x, z, l, a, s]) =>
      `swell(vec2(${x},${z}),${((Math.PI * 2) / l).toFixed(6)},${a},${s},p,pos,dx,dz,compression);`,
  )
  .join('\n');
export function hullWave(x, z, t, w) {
  let h = 0;
  for (let i = 0; i < swells.length; i++) {
    const band = swells[i],
      k = (2 * Math.PI) / band[2];
    h += band[3] * (1 + w * 1.85) * Math.sin(k * (x * band[0] + z * band[1]) - Math.sqrt(3.8 * k) * t);
  }
  return h;
}

function seaTexture() {
  const size = 256,
    cells = 12,
    random = seeded(119),
    features = [];
  for (let i = 0; i < cells * cells; i++) features.push([0.18 + 0.64 * random(), 0.18 + 0.64 * random()]);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const px = ((i % size) / size) * cells,
      pz = (Math.floor(i / size) / size) * cells;
    const cx = Math.floor(px),
      cz = Math.floor(pz);
    let a = 9,
      b = 9;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx,
          z = cz + dz,
          p = features[((x + cells) % cells) + ((z + cells) % cells) * cells];
        const d = Math.hypot(x + p[0] - px, z + p[1] - pz);
        if (d < a) {
          b = a;
          a = d;
        } else if (d < b) b = d;
      }
    const u = (px / cells) * Math.PI * 2,
      v = (pz / cells) * Math.PI * 2;
    data[i * 4] =
      127 +
      Math.round(
        55 * Math.sin(9 * u + 5 * v + 2 * Math.sin(v * 3)) + 57 * Math.sin(11 * u - 6 * v + Math.sin(u * 5)),
      );
    data[i * 4 + 1] =
      127 +
      Math.round(
        54 * Math.cos(6 * u + 8 * v + 1.8 * Math.sin(v * 2)) +
          52 * Math.cos(4 * u - 12 * v + Math.sin(u * 4)),
      );
    data[i * 4 + 2] = 255 * (1 - Math.min(1, (b - a) * 4.8));
    data[i * 4 + 3] = 255;
  }
  const tex = new T.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.minFilter = T.LinearMipMapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// The near coast gets most of the vertices. The outer rings extend through
// the haze to the far clip, including when the viewer orbits away from land.
function seaGrid(rings, sectors) {
  const xyz = [0, 0, 0],
    indices = [];
  for (let i = 1; i <= rings; i++) {
    const t = i / rings,
      radius = 22 * t + 205 * t ** 6;
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * 2 * Math.PI;
      xyz.push(radius * Math.cos(a), 0, radius * Math.sin(a));
      const b = 1 + (i - 1) * sectors + j,
        c = 1 + (i - 1) * sectors + ((j + 1) % sectors);
      if (i === 1) indices.push(0, c, b);
      else indices.push(b - sectors, c, b, c - sectors, c, b - sectors);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
  g.setIndex(indices);
  return g;
}
export function buildSea(scene, u, sky, opaque, camera) {
  const uniforms = {
    ...u,
    skyMap: { value: sky },
    detailMap: { value: seaTexture() },
    landColor: { value: opaque.texture },
    landDepth: { value: opaque.depthTexture },
    physicalSize: { value: new T.Vector2() },
    projection: { value: camera.projectionMatrix },
    clipPlanes: { value: new T.Vector2(camera.near, camera.far) },
    ssr: { value: false },
  };
  const water = new T.ShaderMaterial({
    uniforms,
    vertexShader: `
    uniform float seaTime,storm;
    varying vec3 wP,wN; varying float crest;
    void swell(vec2 dir,float k,float a,float steep,vec2 p,inout vec3 pos,inout vec3 dx,inout vec3 dz,inout float compression){
      float phase=k*dot(dir,p)-sqrt(3.8*k)*seaTime;
      float sn=sin(phase),cs=cos(phase);a*=1.+1.85*storm;
      pos+=a*vec3(steep*dir.x*cs,sn,steep*dir.y*cs);
      vec3 slope=a*k*vec3(-steep*dir.x*sn,cs,-steep*dir.y*sn);
      dx+=dir.x*slope;dz+=dir.y*slope;compression+=steep*a*k*sn;
    }
    void main(){
      vec2 p=position.xz;vec3 pos=position,dx=vec3(1,0,0),dz=vec3(0,0,1);
      float compression=0.;${waveCode}
      wP=pos;wN=normalize(cross(dz,dx));crest=compression;
      gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.);
    }`,
    fragmentShader: `
    uniform sampler2D skyMap,detailMap,landColor,landDepth;
    uniform vec2 physicalSize,clipPlanes; uniform mat4 projection;
    uniform vec3 sunDir;uniform float storm,seaTime,flash;uniform bool ssr;
    varying vec3 wP,wN;varying float crest;
    ${skyLookup}
    float depthAt(vec2 uv){
      float z=texture2D(landDepth,uv).r;
      return clipPlanes.x*clipPlanes.y/(clipPlanes.y-z*(clipPlanes.y-clipPlanes.x));
    }
    vec3 reflected(vec3 ray,vec3 vp,vec3 fallback){
      vec3 d=mat3(viewMatrix)*ray;
      float stride=.18;
      for(int i=0;i<16;i++){
        vp+=d*stride;stride*=1.19;
        vec4 projected=projection*vec4(vp,1.);
        vec2 uv=projected.xy/projected.w*.5+.5;
        if(projected.w<=0. || any(lessThan(uv,vec2(.002))) || any(greaterThan(uv,vec2(.998))))break;
        float diff=-vp.z-depthAt(uv);
        if(diff>=0. && diff<stride*1.9){
          vec2 edge=min(uv,1.-uv);
          return mix(fallback,texture2D(landColor,uv).rgb,smoothstep(.0,.08,min(edge.x,edge.y)));
        }
      }
      return fallback;
    }
    void main() {
      vec2 p=wP.xz;float t=seaTime;
      vec3 v=normalize(cameraPosition-wP); float dist=length(cameraPosition-wP);
      vec2 warp=texture2D(detailMap,p*.068+vec2(.008*t,0.)).rg-.5;
      vec2 q=p*vec2(.52,.71)+warp*.13;
      vec3 tex=texture2D(detailMap,q+vec2(-.047*t,.011*t)).rgb;
      vec3 crossSea=texture2D(detailMap,vec2(-p.y,p.x)*1.42+warp*.25+.035*t).rgb;
      vec2 ripple=(tex.rg-.5)*.105+(crossSea.rg-.5)*.056;
      vec2 drop=p*4.;vec2 cell=floor(drop);
      float phase=fract(t*1.6+fract(sin(dot(cell,vec2(37.2,15.7)))*417.8));
      vec2 radial=fract(drop)-.5;float rr=length(radial);
      ripple+=storm*storm*radial/(rr+.04)*cos(78.*(rr-phase*.56))*exp(-18.*abs(rr-phase*.56))*(1.-phase)*.063;
      vec3 n=normalize(wN+vec3(ripple.x,0.,ripple.y)*(1.-smoothstep(22.,75.,dist)));
      vec3 ray=reflect(-v,n);vec2 uv=gl_FragCoord.xy/physicalSize;
      vec3 vp=(viewMatrix*vec4(wP,1.)).xyz;
      float island=length((p-vec2(-2.55,-1.85))*vec2(1.,1.16))-4.77;
      float tower=length((p-vec2(4.4,-2.25))*vec2(1.,1.18))-1.82;
      float beach=max(p.y-(3.65-.067*(p.x+4.8)*(p.x+4.8)+.24*sin(p.x*1.6)),max(-8.-p.x,p.x-1.));
      float shore=min(island,min(tower,beach));
      float depth=clamp(.22+max(shore,0.)*.76+warp.x*.27,.08,18.);
      vec2 refr=clamp(uv+n.xz*.008,vec2(.001),vec2(.999));
      if(depthAt(refr)<-vp.z)refr=uv;
      float behind=depthAt(refr)+vp.z;
      depth=min(depth,max(.04,behind));
      vec3 trans=exp(-depth*vec3(1.27,.58,.39));
      vec3 deep=mix(vec3(.009,.080,.096),vec3(.009,.050,.063),storm);
      vec3 bed=mix(vec3(.31,.35,.218)*(.63+.49*tex.b),texture2D(landColor,refr).rgb,1.-smoothstep(1.,4.,behind));
      float caustic=texture2D(detailMap,p*.82+n.xz*.47+vec2(-.036*t,.012*t)).b;
      bed*=1.+.69*caustic*caustic*(1.-storm)*exp(-depth*.82);
      vec3 sea=mix(deep,bed,trans);
      vec3 mirror=texture2D(skyMap,skyUV(normalize(vec3(ray.x,abs(ray.y),ray.z)))).rgb;
      if(ssr && dist<32.)mirror=reflected(ray,vp+mat3(viewMatrix)*n*.055,mirror);
      float nv=max(0.,dot(n,v)),f=.0204+.9796*pow(1.-nv,5.);
      vec3 radiance=mix(sea,mirror,clamp(f,0.,.96));
      float subsurface=max(0.,crest+.03)*pow(max(0.,dot(-v,sunDir)),2.);
      radiance+=vec3(.034,.17,.13)*subsurface*(1.-storm*.67);
      float rough=.043+storm*.049,nh=max(0.,dot(n,normalize(sunDir+v)));
      float a2=rough*rough,den=nh*nh*(a2-1.)+1.;
      float glint=a2/(3.14159*den*den+.00001);
      radiance+=vec3(1.,.59,.26)*min(5.,glint*.064)*(1.-storm)*max(0.,dot(n,sunDir));
      float breaker=sin(shore*8.-t*2.8+warp.x*4.);
      float wash=(1.-smoothstep(.0,1.5+storm*.65,abs(shore-.27)))*(.42+.5*breaker);
      float whitecap=smoothstep(.17,.50,crest)*( .24+.76*storm);
      float lace=clamp(tex.b*.95+crossSea.b*.62,0.,1.);
      float froth=smoothstep(.14,.87,(wash+whitecap)*(lace+.34));
      vec2 mooring=p-vec2(3.,4.2);
      float along=dot(mooring,vec2(.738,.674)),across=abs(dot(mooring,vec2(-.674,.738)));
      float hullEdge=abs(across-.39*max(0.,1.-along*along));
      froth+=exp(-24.*hullEdge)*(1.-smoothstep(.85,1.16,abs(along)))*(.12+.09*sin(7.*along-t*3.))*lace;
      radiance=mix(radiance,mix(vec3(.79,.87,.77),vec3(.44,.55,.57),storm),froth);
      float mist=(1.-exp(-dist*(.005+storm*.022)))*exp(-max(wP.y,0.)*.05);
      vec3 horizon=texture2D(skyMap,skyUV(normalize(vec3(-v.x,.028,-v.z)))).rgb;
      gl_FragColor=vec4(mix(radiance*(1.+flash*.35),horizon,mist),1.);
    }`,
  });
  const grids = [seaGrid(58, 112), seaGrid(96, 192), seaGrid(148, 256)];
  const ocean = new T.Mesh(grids[1], water);
  scene.add(ocean);
  // Ballistic droplets are emitted in packets as the incident swell reaches
  // each rock face. Stable phase offsets avoid popping an entire ring at once.
  const rng = seeded(8113),
    positions = [],
    seeds = [];
  for (let i = 0; i < 1300; i++) {
    const a = rng() * Math.PI * 2,
      isTower = i % 3 === 0;
    const cx = isTower ? 4.4 : -2.55,
      cz = isTower ? -2.25 : -1.85,
      r = isTower ? 1.83 : 4.9;
    positions.push(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r * 0.85);
    seeds.push(rng(), rng(), rng());
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('seed', new T.Float32BufferAttribute(seeds, 3));
  const spray = new T.Points(
    g,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute vec3 seed; uniform float seaTime,storm;uniform vec2 physicalSize;varying float alpha;
    void main(){float t=fract(seaTime*(.64+.32*seed.x)+seed.y);
      float impact=smoothstep(-.12,.77,sin(position.z*1.25+position.x*.33-seaTime*1.99));
      vec3 p=position;p.x+=t*t*(.22+storm*1.25)+t*(seed.z-.5)*.51;p.z+=t*(seed.x-.42)*.55;
      p.y+=sin(3.14159*t)*(.14+storm*.59)*(.34+.98*seed.z)*impact;
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(physicalSize.y*(.007+seed.x*.012)/-mv.z,1.,8.);
      alpha=sin(3.14159*t)*impact*(.21+storm*.46);}`,
      fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.72,.83,.84,alpha*(1.-smoothstep(.12,1.,r)));}`,
    }),
  );
  scene.add(spray);
  return {
    size: uniforms.physicalSize.value,
    tier(level) {
      ocean.geometry = grids[level];
      uniforms.ssr.value = level === 2;
      g.setDrawRange(0, [300, 760, 1300][level]);
    },
  };
}
