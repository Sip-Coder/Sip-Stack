import * as T from 'three';

export const sunDirection = new T.Vector3(0.295, 0.122, -0.95).normalize();
export const skyLookup = `
  vec2 skyUV(vec3 d) {
    return vec2(atan(d.z,d.x)*0.159154943+0.5, asin(clamp(d.y,-1.,1.))*0.318309886+0.5);
  }
`;
export function seeded(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// Periodic, mip-filtered density volume. Generate it once, then sample the same
// air mass for the background, the glitter path and the environment capture.
function densityTexture() {
  const size = 64,
    data = new Uint8Array(size ** 3),
    random = seeded(6047);
  // Each lattice plane is shared by every interpolated slice between it
  // and its neighbour. Expand in X, then Y, then Z in the same order as
  // trilinear interpolation. Keep the intermediate values in doubles.
  for (const cells of [4, 8, 16, 32, 64]) {
    const grid = new Float32Array(cells ** 3);
    for (let i = 0; i < grid.length; i++) grid[i] = random();
    const weight = 128 * (4 / cells);
    if (cells === size) {
      for (let i = 0; i < data.length; i++) data[i] += Math.round(grid[i] * weight);
      continue;
    }
    const first = new Uint8Array(size), next = new Uint8Array(size), blend = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const value = i * cells / size, lo = Math.floor(value), t = value - lo;
      first[i] = lo; next[i] = (lo + 1) % cells; blend[i] = t * t * (3 - 2 * t);
    }
    const rows = new Float64Array(cells * size);
    const planes = new Float64Array(cells * size * size);
    const lerp = T.MathUtils.lerp;
    for (let z = 0; z < cells; z++) {
      for (let y = 0; y < cells; y++) {
        const offset = (z * cells + y) * cells;
        for (let x = 0; x < size; x++) {
          rows[y * size + x] = lerp(grid[offset + first[x]], grid[offset + next[x]], blend[x]);
        }
      }
      for (let y = 0; y < size; y++) {
        const from = first[y] * size, to = next[y] * size, offset = (z * size + y) * size;
        for (let x = 0; x < size; x++) {
          planes[offset + x] = lerp(rows[from + x], rows[to + x], blend[y]);
        }
      }
    }
    const area = size * size;
    for (let z = 0; z < size; z++) {
      const from = first[z] * area, to = next[z] * area;
      for (let i = 0; i < area; i++) {
        data[z * area + i] += Math.round(lerp(planes[from + i], planes[to + i], blend[z]) * weight);
      }
    }
  }
  const tex = new T.Data3DTexture(data, size, size, size);
  tex.format = T.RedFormat;
  tex.wrapS = tex.wrapT = tex.wrapR = T.RepeatWrapping;
  tex.minFilter = T.LinearMipMapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function buildSky(renderer, scene, uniforms, view) {
  const target = new T.WebGLRenderTarget(512, 256, { type: T.HalfFloatType, depthBuffer: false });
  target.texture.wrapS = T.RepeatWrapping;
  target.texture.mapping = T.EquirectangularReflectionMapping;
  const screen = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false });
  const quadScene = new T.Scene(),
    camera = new T.Camera();
  const sky = new T.ShaderMaterial({
    uniforms: {
      ...uniforms,
      densityMap: { value: densityTexture() },
      cheap: { value: false },
      panorama: { value: true },
      invProj: { value: view.projectionMatrixInverse },
      viewWorld: { value: view.matrixWorld },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 st;void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      precision highp sampler3D;
      uniform sampler3D densityMap;
      uniform vec3 sunDir;
      uniform float seaTime,storm,flash,afterglow;
      uniform bool cheap,panorama; uniform mat4 invProj,viewWorld;
      varying vec2 st;
      float cloud(vec3 p) {
        vec3 q=p*vec3(.036,.055,.036)+vec3(seaTime*.0013,0.,seaTime*.0004);
        float n=textureLod(densityMap,q,0.).r*.65+textureLod(densityMap,q*2.71+.34,0.).r*.25+textureLod(densityMap,q*7.2+.19,0.).r*.10;
        return smoothstep(.539-storm*.136,.656-storm*.117,n);
      }
      void main(){
        float lon=(st.x-.5)*6.2831853, lat=(st.y-.5)*3.14159265;
        vec3 d=vec3(cos(lon)*cos(lat),sin(lat),sin(lon)*cos(lat));
        if(!panorama){
          vec4 viewRay=invProj*vec4(st*2.-1.,1.,1.);
          d=normalize(mat3(viewWorld)*viewRay.xyz);
        }
        float h=max(d.y,0.), mu=dot(d,sunDir);
        // Optical path through the lower aerosol layer and upper Rayleigh layer.
        float mass=1./(h+.085), rayleigh=.75*(1.+mu*mu);
        vec3 transmit=exp(-mass*vec3(.035,.078,.16));
        vec3 sky=vec3(.105,.29,.53)*rayleigh*(.38+.62*transmit)
          +vec3(.95,.52,.32)*(1.-transmit)*exp(-h*4.2);
        float mie=.028/pow(max(.026,1.23-1.2*mu),1.22);
        sky+=vec3(1.,.38,.10)*mie;
        sky=mix(sky,vec3(.10,.15,.205)*(.45+.82*exp(-3.*h)),storm*.95);
        vec3 sun=vec3(10.,5.9,2.3)*(1.-smoothstep(.78,1.,storm))*smoothstep(.99987,.99997,mu);
        vec3 air=sky+sun;
        if(d.y>0.){
          float horiz=smoothstep(0.,.09,h), denom=max(h,.045);
          vec3 p=d*(8./denom);
          float alpha=0.; vec3 scatter=vec3(0.);
          for(int i=0;i<9;i++){
            float y=(float(i)+.5)/9.;
            if(cheap) y=.46;
            vec3 q=p+d*(y*6./denom);
            float rho=cloud(q)*sin(y*3.14159);
            float optical=1.-exp(-rho*(cheap?3.3:.48)/max(.42,h));
            float light=cheap?1.-.65*rho:exp(-2.7*cloud(q+sunDir*4.)-1.2*cloud(q+sunDir*9.));
            vec3 col=mix(vec3(.205,.222,.30),vec3(1.14,.73,.48),light);
            col=mix(col,col*vec3(.24,.30,.39),storm*.90);
            col+=vec3(.63,.75,1.)*(flash+afterglow*.32)*(.14+.86*pow(max(0.,dot(d,normalize(vec3(-.33,.21,-1.)))),7.));
            scatter+=(1.-alpha)*optical*col; alpha+=(1.-alpha)*optical;
            if(cheap || alpha>.98) break;
          }
          float veil=texture(densityMap,vec3(d.xz/max(.065,h)*vec2(.28,1.83)+vec2(seaTime*.001,0.),.6)).r;
          air+=vec3(.30,.21,.17)*smoothstep(.51,.73,veil)*(1.-storm)*smoothstep(0.,.19,h);
          air=mix(air,air*(1.-alpha)+scatter,horiz);
          air+=sun*(1.-storm)*.18;
        }
        gl_FragColor=vec4(air,1.);
      }`,
  });
  quadScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), sky));
  const dome = new T.Mesh(
    new T.PlaneGeometry(2, 2),
    new T.ShaderMaterial({
      uniforms: { skyMap: { value: screen.texture } },
      depthWrite: false,
      vertexShader: `varying vec2 st;void main(){st=uv;gl_Position=vec4(position.xy,1.,1.);}`,
      fragmentShader: `varying vec2 st;uniform sampler2D skyMap;void main(){gl_FragColor=texture2D(skyMap,st);}`,
    }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  scene.add(dome);
  const generator = new T.PMREMGenerator(renderer);
  let environment,
    lastTime = -Infinity,
    lastWeather = -1,
    lastFlash = -1,
    probeWeather = -1;
  function invalidate() {
    lastTime = -Infinity;
    probeWeather = -1;
  }
  return {
    texture: target.texture,
    size(w, h, mobile) {
      screen.setSize(Math.ceil(w * 0.5), Math.ceil(h * 0.5));
      sky.uniforms.cheap.value = mobile;
      invalidate();
    },
    update() {
      const t = uniforms.seaTime.value,
        w = uniforms.storm.value,
        f = uniforms.flash.value + uniforms.afterglow.value * 0.32;
      const prev = renderer.getRenderTarget();
      view.updateMatrixWorld();
      sky.uniforms.panorama.value = false;
      renderer.setRenderTarget(screen);
      renderer.render(quadScene, camera);
      renderer.setRenderTarget(prev);
      if (
        Math.abs(t - lastTime) < 0.28 &&
        Math.abs(w - lastWeather) < 0.014 &&
        Math.abs(f - lastFlash) < 0.03
      )
        return;
      sky.uniforms.panorama.value = true;
      renderer.setRenderTarget(target);
      renderer.render(quadScene, camera);
      renderer.setRenderTarget(prev);
      lastTime = t;
      lastWeather = w;
      lastFlash = f;
      if (probeWeather < 0 || Math.abs(probeWeather - w) > 0.28) {
        environment = generator.fromEquirectangular(target.texture, environment);
        scene.environment = environment.texture;
        probeWeather = w;
      }
    },
    invalidate,
  };
}
