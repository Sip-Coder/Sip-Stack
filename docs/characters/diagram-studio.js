// Human inspection only. The simulator lends its WebGL context for one geometry
// pass and one studio composite. The shadow and AO require no extra anatomy draw.
import * as T from 'three';

export function shadeTissue(shader, layer, ghost) {
  if (layer === 'muscles') {
    shader.vertexShader =
      'varying vec2 fiberUv;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfiberUv = uv;');
    shader.fragmentShader =
      'varying vec2 fiberUv;\n' +
      shader.fragmentShader
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
       float tendonWeight = smoothstep(0.19, 0.78, diffuseColor.g / max(diffuseColor.r, 0.001));
       roughnessFactor = mix(0.30, 0.56, tendonWeight);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
       // Derivatives map the chart's circumferential coordinate to the actual
       // tangent plane of each fascicle. Suppress frequencies below pixel size.
       float fiberPhase = fiberUv.x * 18.0 + 0.12 * sin(fiberUv.y * 9.0);
       float filtered = 1.0 - smoothstep(0.12, 0.48, fwidth(fiberPhase));
       vec3 du = dFdx(-vViewPosition), dv = dFdy(-vViewPosition);
       vec3 tu = cross(dv, normal), tv = cross(normal, du);
       float det = dot(du, tu);
       vec3 across = sign(det) * (dFdx(fiberUv.x) * tu + dFdy(fiberUv.x) * tv);
       across /= max(length(across), 1e-9);
       normal = normalize(normal + across * filtered * sin(6.2831853 * fiberPhase) * mix(0.14, 0.06, tendonWeight));`,
        );
  }
  if (layer === 'skin') {
    shader.uniforms.axonGhost = ghost;
    shader.vertexShader =
      'varying vec3 shellNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nshellNormal = normalMatrix * normal;',
      );
    shader.fragmentShader =
      'varying vec3 shellNormal; uniform float axonGhost;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float edge = 1.0 - abs(normalize(shellNormal).z);
       #if NUM_DIR_LIGHTS > 0 && defined(STANDARD)
       float nl = dot(normal, directionalLights[0].direction);
       float wrap = max(0.0, (nl + 0.38) / 1.38) - max(0.0, nl);
       outgoingLight += diffuseColor.rgb * vec3(0.70, 0.32, 0.19) * wrap;
       #endif
       if (axonGhost > 0.5) {
         float fresnel = pow(clamp(edge, 0.0, 1.0), 2.15);
         outgoingLight = mix(vec3(0.40,0.55,0.59), vec3(0.92,1.0,1.00), fresnel);
         diffuseColor.a *= 0.052 + 0.50 * fresnel;
       }
       #include <opaque_fragment>`,
      );
  }
}

const vertex = `
  varying vec2 st;
  void main(){st = position.xy*0.5+0.5; gl_Position=vec4(position.xy,0.0,1.0);}`;
const fragment = `
  uniform sampler2D beauty;
  uniform vec2 pixelSize;
  #ifdef SCREEN_AO
  uniform sampler2D depthField;
  uniform vec2 zRange;
  #endif
  uniform vec2 viewSize;
  uniform mat4 cameraWorld;
  uniform vec4 feet[8];
  uniform vec2 spread[8];
  uniform vec3 paperTop, paperBottom;
  varying vec2 st;
  #ifdef SCREEN_AO
  float zAt(vec2 uv) { return -mix(zRange.x, zRange.y, texture2D(depthField,uv).r); }
  float visibility() {
    float z = zAt(st);
    if(z < -zRange.y + 0.01) return 1.0;
    // Reconstruct the orthographic view-space surface normal. On silhouettes
    // choose the derivative that stays on the foreground surface.
    float left=zAt(st-vec2(pixelSize.x,0.))-z, right=zAt(st+vec2(pixelSize.x,0.))-z;
    float down=zAt(st-vec2(0.,pixelSize.y))-z, up=zAt(st+vec2(0.,pixelSize.y))-z;
    vec3 n = normalize(vec3(-(abs(left)<abs(right)?-left:right)/(pixelSize.x*viewSize.x),
                            -(abs(down)<abs(up)?-down:up)/(pixelSize.y*viewSize.y), 1.0));
    float occ = 0.0;
    for (int i=0;i<SCREEN_AO;i++) {
      float t=(float(i)+0.5)/float(SCREEN_AO);
      float a=float(i)*2.3999632;
      vec2 xy=vec2(cos(a),sin(a))*(0.005+0.052*t);
      float dz=zAt(st+xy/viewSize)-z;
      vec3 delta=vec3(xy,dz);
      float r=length(delta);
      occ += max(0.0, dot(n,delta)/max(r,0.001)-0.08) * (1.0-smoothstep(0.018,0.082,r));
    }
    return clamp(1.0-2.35*occ/float(SCREEN_AO),0.43,1.0);
  }
  #endif
  void main(){
    vec4 lit=texture2D(beauty,st);
    vec4 leftColor=texture2D(beauty,st-vec2(pixelSize.x,0.));
    vec4 rightColor=texture2D(beauty,st+vec2(pixelSize.x,0.));
    vec4 downColor=texture2D(beauty,st-vec2(0.,pixelSize.y));
    vec4 upColor=texture2D(beauty,st+vec2(0.,pixelSize.y));
    float edgeCount = abs(leftColor.a-lit.a)+abs(rightColor.a-lit.a)+abs(downColor.a-lit.a)+abs(upColor.a-lit.a);
    if (edgeCount>0.85 && edgeCount<3.15)
      lit=mix(lit,0.25*(leftColor+rightColor+downColor+upColor),0.38);
    // Orthographic rays meet the floor beneath each actual left/right foot.
    // Raised feet cast a wider, fainter contact patch on the same floor.
    vec3 origin=(cameraWorld*vec4((st-0.5)*viewSize,0.,1.)).xyz;
    vec3 dir=-cameraWorld[2].xyz;
    float contact=0.0;
    if(dir.y < -0.002) for(int i=0;i<8;i++) {
      if(feet[i].w <= 0.0) continue;
      vec2 p=(origin+dir*((feet[i].y-origin.y)/dir.y)).xz-feet[i].xz;
      vec2 q=p/spread[i];
      vec2 broad=q*vec2(.58,.73);
      float shadow=feet[i].w*(0.23*exp(-1.8*dot(q,q))+0.14*exp(-1.25*dot(broad,broad)));
      contact=max(contact,shadow);
    }
    vec3 room = mix(paperBottom,paperTop,smoothstep(-0.12,1.16,st.y));
    room *= (1.-contact)*(1.-0.045*dot(st-0.5,st-0.5));
    #ifdef SCREEN_AO
    lit.rgb *= visibility();
    #endif
    gl_FragColor=vec4(lit.rgb+room*(1.-lit.a),1.0);
    #include <colorspace_fragment>
  }`;

export function createHumanStudio() {
  const lights = new T.Group();
  const lamp = (color, strength, x, y, z) => {
    const spot = new T.DirectionalLight(color, strength);
    spot.position.set(x, y, z);
    lights.add(spot);
  };
  lights.add(new T.HemisphereLight(0xf4f4ff, 0xa58c7f, 0.65));
  lamp(0xfff3df, 2.8, -3.8, 5.2, 4.2);
  lamp(0xc3d6ee, 0.58, 4.2, 1.2, 2.6);
  lamp(0xfff5e6, 2.05, 2.0, 3.1, -3.6);
  const stage = new T.Scene(),
    camera = new T.Camera();
  stage.name = 'Axon Studio Composite';
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const uniforms = {
    beauty: { value: null },
    depthField: { value: null },
    zRange: { value: new T.Vector2() },
    pixelSize: { value: new T.Vector2() },
    viewSize: { value: new T.Vector2() },
    cameraWorld: { value: new T.Matrix4() },
    feet: { value: Array.from({ length: 8 }, () => new T.Vector4()) },
    spread: { value: Array.from({ length: 8 }, () => new T.Vector2()) },
    paperTop: { value: new T.Color('#747c7b') },
    paperBottom: { value: new T.Color('#a4aaa5') },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const tri = new T.Mesh(geometry, material);
  tri.frustumCulled = false;
  stage.add(tri);
  let renderTarget, tier;
  function releaseTarget() {
    renderTarget?.dispose();
    renderTarget = null;
    uniforms.beauty.value = uniforms.depthField.value = null;
  }
  function configure(quality) {
    if (tier === quality && renderTarget) return;
    renderTarget?.dispose();
    tier = quality;
    renderTarget = new T.WebGLRenderTarget(1, 1, {
      colorSpace: T.SRGBColorSpace,
      depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
    });
    uniforms.beauty.value = renderTarget.texture;
    uniforms.depthField.value = renderTarget.depthTexture;
    material.defines = { SCREEN_AO: quality === 'high' ? 16 : 4 };
    material.needsUpdate = true;
  }
  function resize(width, height) {
    renderTarget.setSize(width, height);
    uniforms.pixelSize.value.set(1 / width, 1 / height);
  }
  let soleGroups = [];
  function setSubject(parts) {
    // Bony, muscular, skinned and shod feet each have their own contact area.
    // A cropped shoulder or pelvis study has no soles and casts no floor decal.
    const groups = new Map();
    parts.forEach((part, index) => {
      const { name, layer } = part;
      if (!/calcaneus|metatarsal|plantar foot|foot inside trainer|shoe sole|sneaker sole/i.test(name)) return;
      const side = /(?:left|right)/i.exec(name)?.[0].toLowerCase();
      if (!side) return;
      const key = layer + '/' + side;
      if (!groups.has(key)) groups.set(key, { layer, parts: [], bounds: new T.Box3() });
      let box = part.bounds;
      if (!box) {
        const geometry = part.mesh.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        box = geometry.boundingBox;
      }
      groups.get(key).parts.push({ index, box });
    });
    soleGroups = [...groups.values()];
  }
  const footBox = new T.Box3(),
    translated = new T.Vector3();
  function composite(renderer, ortho, layers, output, offsets, amount) {
    uniforms.cameraWorld.value.copy(ortho.matrixWorld);
    uniforms.viewSize.value.set(ortho.right - ortho.left, ortho.top - ortho.bottom).divideScalar(ortho.zoom);
    uniforms.zRange.value.set(ortho.near, ortho.far);
    for (const foot of uniforms.feet.value) foot.w = 0;
    let floor = Infinity;
    for (const { layer, parts, bounds } of soleGroups) {
      bounds.makeEmpty();
      const group = layers.get(layer)?.group;
      if (!group?.visible) continue;
      for (const { index, box } of parts) {
        translated.copy(group.position);
        if (amount && offsets) translated.addScaledVector(offsets[index], amount);
        bounds.union(footBox.copy(box).translate(translated));
      }
      floor = Math.min(floor, bounds.min.y);
    }
    soleGroups.forEach(({ bounds }, i) => {
      if (bounds.isEmpty() || i >= 8) return;
      const lift = bounds.min.y - floor;
      const strength = Math.exp(-lift / 0.09);
      uniforms.feet.value[i].set(
        (bounds.min.x + bounds.max.x) / 2,
        floor - 0.003,
        (bounds.min.z + bounds.max.z) / 2,
        strength,
      );
      uniforms.spread.value[i].set(
        Math.max(0.045, (bounds.max.x - bounds.min.x) * 0.65) + lift * 0.4,
        Math.max(0.075, (bounds.max.z - bounds.min.z) * 0.6) + lift * 0.4,
      );
    });
    renderer.setRenderTarget(output);
    renderer.render(stage, camera);
  }
  function dispose() {
    geometry.dispose();
    material.dispose();
    renderTarget?.dispose();
  }
  return {
    lights,
    stage,
    camera,
    configure,
    setSubject,
    releaseTarget,
    resize,
    composite,
    dispose,
    get target() {
      return renderTarget;
    },
  };
}
