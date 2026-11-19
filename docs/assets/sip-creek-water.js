import * as T from 'three';
import { channel, breadth, surface, obstacles, lerp, smoothstep, clamp, tau } from './sip-creek-land.js';
import { skyGLSL, waterHeightGLSL } from './sip-creek-materials.js';

function current(x, z) {
  let dx = -(channel(z + 0.05) - channel(z - 0.05)) * 10,
    dz = -1,
    white = 0;
  for (const stone of obstacles) {
    const u = (x - stone.x) / stone.r,
      v = (z - stone.z) / stone.r;
    const wake = Math.exp(-u * u * 1.4 - v * v * 0.84);
    dx += u * wake * 2.8;
    dz += wake * 0.76;
    white = Math.max(
      white,
      Math.exp(-((Math.hypot(u * 0.76, v) - 0.9) ** 2) * 11) * 0.73,
      Math.exp(-u * u * 4 - (v + 1.3) ** 2) * 0.59,
    );
  }
  const fall = Math.exp(-((z - 6.89) ** 2) * 9) + Math.exp(-((z - 1.12) ** 2) * 14);
  return [dx, dz - fall * 0.45, Math.min(1, white + fall * 0.48)];
}
function flowMap() {
  const w = 96,
    h = 256,
    pixels = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = lerp(-5, 5, (i + 0.5) / w),
        z = lerp(-25, 17, (j + 0.5) / h),
        [u, v, foam] = current(x, z),
        k = (j * w + i) * 4;
      pixels[k] = 255 * clamp(0.5 + u * 0.25, 0, 1);
      pixels[k + 1] = 255 * clamp(0.5 + v * 0.25, 0, 1);
      pixels[k + 2] = 255 * foam;
      pixels[k + 3] = 255;
    }
  const tex = new T.DataTexture(pixels, w, h);
  tex.magFilter = tex.minFilter = T.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
export function stream(scene, rng, time, sky, mineral, opaque, camera) {
  const verts = [],
    idx = [],
    width = 32,
    length = 300;
  for (let j = 0; j <= length; j++)
    for (let i = 0; i <= width; i++) {
      const z = lerp(-25, 17, j / length),
        x = channel(z) + (breadth(z) + 0.92) * ((i / width) * 2 - 1);
      verts.push(x, surface(z), z);
      if (i < width && j < length) {
        const a = j * (width + 1) + i,
          b = a + width + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  const uniforms = {
    ...sky,
    time,
    mineral,
    flowField: { value: flowMap() },
    sceneColor: { value: opaque.texture },
    sceneDepth: { value: opaque.depthTexture },
    viewport: { value: new T.Vector2() },
    clipRange: { value: new T.Vector2(camera.near, camera.far) },
    reflectSteps: { value: 0 },
    proj: { value: camera.projectionMatrix },
  };
  const m = new T.ShaderMaterial({
    uniforms,
    vertexShader: `
    uniform float time;varying vec3 wp;varying float eyeZ;
    void main(){wp=position;wp.y+=.012*sin(wp.z*3.1+time*1.9+wp.x)+.009*sin(wp.x*3.3+wp.z*1.4+time);
      vec4 eye=viewMatrix*vec4(wp,1.);eyeZ=-eye.z;gl_Position=projectionMatrix*eye;}`,
    fragmentShader: `${skyGLSL}
    uniform float time;uniform int reflectSteps;
    uniform vec2 viewport,clipRange;uniform sampler2D flowField,mineral,sceneColor,sceneDepth;uniform mat4 proj;
    varying vec3 wp;varying float eyeZ;
    float depthAt(vec2 uv){float d=texture2D(sceneDepth,uv).r;return clipRange.x*clipRange.y/(clipRange.y-d*(clipRange.y-clipRange.x));}
    vec2 ripples(vec2 p){
      vec2 n=texture2D(mineral,p*vec2(.61,1.26)).gb-.5;
      n+=(texture2D(mineral,p.yx*vec2(1.48,1.21)).gb-.5)*.50;
      float angle=p.y*13.+p.x*4.3+3.*sin(p.x*1.81+p.y*.8);
      return n*.24+vec2(.028,.061)*cos(angle)/(1.+fwidth(angle)*2.);
    }
    void main(){
      vec2 uv=gl_FragCoord.xy/viewport;vec3 field=texture2D(flowField,(wp.xz+vec2(5.,25.))/vec2(10.,42.)).rgb;
      vec2 velocity=(field.rg-.5)*4.;float phase=fract(time*.34),other=fract(phase+.5);
      vec2 n=mix(ripples(wp.xz-velocity*phase*1.5),ripples(wp.xz-velocity*other*1.5),abs(phase*2.-1.));
      vec3 N=normalize(vec3(n.x,1.,n.y+.043*cos(wp.z*3.1+time*1.9+wp.x)));
      vec3 V=normalize(cameraPosition-wp),R=reflect(-V,N);float nv=clamp(dot(N,V),0.,1.);
      float thickness=max(0.,depthAt(uv)-eyeZ);
      vec2 refr=clamp(uv+vec2(n.x,n.y)*min(.08,thickness*.032)/max(1.,eyeZ*.21),.001,.999);
      if(depthAt(refr)<eyeZ)refr=uv;
      vec3 bed=texture2D(sceneColor,refr).rgb;
      vec3 transmit=exp(-vec3(.84,.32,.24)*min(thickness,4.8));
      vec3 body=bed*transmit+vec3(.025,.099,.083)*(1.-transmit)*(.36+.64*daylight);
      float fresnel=.022+.978*pow(1.-nv,5.);
      vec3 reflected=skyColor(R)*vec3(.83,.91,.94);
      // March the reflected view ray into the opaque color/depth pair. Missing
      // or disoccluded samples resolve to the same sky used for the environment.
      vec3 ray=(viewMatrix*vec4(R,0.)).xyz,eye=(viewMatrix*vec4(wp,1.)).xyz;
      for(int i=1;i<=16;i++){
        if(i>reflectSteps)break;
        float t=.13*float(i)+.054*float(i*i);
        vec3 q=eye+ray*t;vec4 clip=proj*vec4(q,1.);
        vec2 st=clip.xy/clip.w*.5+.5;
        if(clip.w<=0.||any(lessThan(st,vec2(.004)))||any(greaterThan(st,vec2(.996))))break;
        float gap=-q.z-depthAt(st);
        if(gap>0.&&gap<.18+t*.12){
          vec2 edge=min(st,1.-st);reflected=mix(reflected,texture2D(sceneColor,st).rgb,smoothstep(.005,.08,min(edge.x,edge.y)));break;
        }
      }
      vec3 c=mix(body,reflected,clamp(fresnel+.09,0.,1.));
      float glint=pow(max(dot(N,normalize(V+lightDir)),0.),245.);
      c+=solar*glint*(3.9*daylight+.27);
      vec2 froth=wp.xz*vec2(3.8,3.2)-velocity*time*.40;
      float noise=texture2D(mineral,froth*.27).r;
      vec2 curl=texture2D(mineral,froth*.55).gb-.5;
      float cell=length(fract(froth*3.4+noise*3.+curl*2.)-.5);
      float bubbles=1.-smoothstep(.024,.105+fwidth(cell),abs(cell-.30));
      float foam=smoothstep(.47,.80,field.b*.77+noise*.52)*(bubbles*.27+.39*smoothstep(.49,.64,noise));
      c=mix(c,mix(vec3(.25,.35,.42),vec3(.82,.86,.72),daylight),foam);
      gl_FragColor=vec4(c,1.);
    }`,
  });
  scene.add(new T.Mesh(g, m));
  const leafShape = new T.Shape();
  leafShape.moveTo(0, -0.09);
  leafShape.quadraticCurveTo(-0.1, -0.015, -0.025, 0.085);
  leafShape.lineTo(0, 0.14);
  leafShape.quadraticCurveTo(0.11, 0.03, 0, -0.09);
  const leafG = new T.ShapeGeometry(leafShape, 6);
  leafG.rotateX(-Math.PI / 2);
  const leaves = new T.InstancedMesh(
    leafG,
    new T.MeshStandardMaterial({ color: '#d39a4b', side: T.DoubleSide, roughness: 0.52 }),
    32,
  );
  scene.add(leaves);
  leaves.frustumCulled = false;
  // Integrate fixed streamlines once. Scrubbing samples the same paths in either direction.
  const tracks = [],
    dummy = new T.Object3D();
  for (let i = 0; i < leaves.count; i++) {
    const path = [],
      offset = rng(),
      speed = 0.28 + rng() * 0.23;
    let z = 15,
      x = channel(z) + (rng() - 0.5) * 2.7;
    while (z > -24) {
      path.push(x, z);
      const [u, v] = current(x, z);
      z -= 0.13;
      x += (0.13 * u) / Math.max(0.16, -v);
      x = clamp(x, channel(z) - breadth(z) + 0.35, channel(z) + breadth(z) - 0.35);
    }
    tracks.push({ path, offset, speed });
  }
  const positions = [],
    seeds = [];
  for (let i = 0; i < 190; i++) {
    const s = obstacles[i % obstacles.length],
      x = s.x + (rng() - 0.5) * s.r * 2,
      z = s.z - s.r * (0.65 + rng() * 0.42);
    positions.push(x, surface(z), z);
    seeds.push(rng(), rng());
  }
  function motes(coords, phases, night) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(coords, 3));
    geo.setAttribute('seed', new T.Float32BufferAttribute(phases, 2));
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: night ? T.AdditiveBlending : T.NormalBlending,
      uniforms: { time, viewport: uniforms.viewport, daylight: sky.daylight },
      vertexShader: `
        attribute vec2 seed;uniform float time;uniform vec2 viewport;varying float fade;
        void main(){vec3 p=position;
          ${
            night
              ? `p.x+=sin(time*.61+seed.x*21.)*.33;p.y+=sin(time*.84+seed.y*12.)*.14;p.z+=cos(time*.42+seed.x*12.)*.37;
            fade=pow(.5+.5*sin(time*1.66+seed.x*32.),2.);`
              : `float t=fract(time*(1.08+seed.y*.9)+seed.x);p.z-=t*.31;p.x+=(seed.x-.5)*t*.19;
            p.y+=.016+4.*t*(1.-t)*(.06+seed.y*.12);fade=sin(t*3.14159)*.67;`
          }
          vec4 eye=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*eye;
          gl_PointSize=clamp(viewport.y*${night ? '.048' : '.011'}/max(.1,-eye.z),1.4,${night ? '12.' : '4.'});}`,
      fragmentShader: `varying float fade;uniform float daylight;void main(){float d=length(gl_PointCoord-.5)*2.;
        gl_FragColor=vec4(${night ? 'vec3(3.2,2.05,.47)' : 'mix(vec3(.33,.42,.49),vec3(.93,.96,.88),daylight)'},fade*exp(-d*d*5.)*(1.-smoothstep(.65,1.,d)));}`,
    });
    const o = new T.Points(geo, material);
    o.frustumCulled = false;
    scene.add(o);
    return o;
  }
  motes(positions, seeds, false);
  positions.length = seeds.length = 0;
  for (let i = 0; i < 85; i++) {
    const z = lerp(-19, 14, rng());
    positions.push(channel(z) + (rng() - 0.5) * 7, surface(z) + 0.22 + rng() * 1.32, z);
    seeds.push(rng(), rng());
  }
  const flies = motes(positions, seeds, true);
  function update(t) {
    flies.visible = sky.daylight.value < 0.5;
    for (let i = 0; i < tracks.length; i++) {
      const { path, offset, speed } = tracks[i],
        n = path.length / 2 - 1;
      const f = (offset * n + (t * speed) / 0.13) % n,
        k = Math.floor(f) * 2,
        u = f % 1;
      const z = lerp(path[k + 1], path[k + 3], u);
      dummy.position.set(
        lerp(path[k], path[k + 2], u),
        surface(z) + 0.032 + 0.008 * Math.sin(t + offset * 22),
        z,
      );
      dummy.rotation.set(0.03 * Math.sin(t), offset * tau + Math.sin(t * 0.4 + i) * 0.18, 0);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }
  return { uniforms, update };
}
