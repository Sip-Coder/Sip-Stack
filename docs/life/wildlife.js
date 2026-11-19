import * as T from 'three';
import { Sections, tau, seed } from './forms.js';

function schoolGeometry() {
  const f = new Sections(),
    axial = ([x, y, z]) => [x, z, -y];
  f.loft(
    [
      [-0.395, 0.014, 0.014],
      [-0.368, 0.053, 0.049],
      [-0.302, 0.072, 0.085],
      [-0.19, 0.102, 0.119],
      [-0.015, 0.101, 0.128],
      [0.164, 0.076, 0.096],
      [0.286, 0.042, 0.048],
      [0.346, 0.027, 0.028],
    ],
    '#ad9780',
    24,
    0,
    axial,
  );
  // Olive dorsal mantle against the silver belly, with a thin rose lateral line.
  f.loft(
    [
      [-0.348, 0.042, 0.024, 0, 0.035],
      [-0.27, 0.072, 0.058, 0, 0.045],
      [-0.08, 0.094, 0.069, 0, 0.063],
      [0.14, 0.07, 0.052, 0, 0.052],
      [0.31, 0.027, 0.028, 0, 0.02],
    ],
    '#777d57',
    22,
    0,
    axial,
  );
  for (const s of [-1, 1]) {
    f.loft(
      [
        [-0.316, 0.012, 0.016, s * 0.062, 0.03],
        [-0.303, 0.019, 0.019, s * 0.073, 0.03],
        [-0.288, 0.013, 0.013, s * 0.071, 0.03],
      ],
      '#242c26',
      12,
      0,
      axial,
    );
    f.loft(
      [
        [0.282, 0.013, 0.023, 0, 0],
        [0.346, 0.011, 0.057, 0, s * 0.031],
        [0.428, 0.009, 0.071, 0, s * 0.074],
        [0.493, 0.004, 0.021, 0, s * 0.115],
      ],
      '#8d765e',
      12,
      0,
      axial,
    );
    f.loft(
      [
        [-0.164, 0.012, 0.01, s * 0.079, -0.013],
        [-0.11, 0.031, 0.019, s * 0.109, -0.033],
        [-0.02, 0.017, 0.008, s * 0.14, -0.067],
      ],
      '#a28a70',
      10,
      0,
      axial,
    );
  }
  f.loft(
    [
      [0.088, 0.013, 0.095, 0, -0.01],
      [0.139, 0.01, 0.079, 0, -0.052],
      [0.191, 0.005, 0.039, 0, -0.079],
    ],
    '#777551',
    12,
  );
  const g = f.geometry(),
    col = g.attributes.color,
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      z = p.getZ(i);
    if (Math.abs(y) < 0.035 && z > -0.26 && z < 0.25 && Math.abs(p.getX(i)) > 0.065)
      col.setXYZ(i, col.getX(i) * 1.19, col.getY(i) * 0.76, col.getZ(i) * 0.83);
  }
  return g;
}
export function trout(scene, count, centerX, centerZ, height, radius = 1) {
  const time = { value: 0 },
    m = new T.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.39,
      clearcoat: 0.34,
      metalness: 0.18,
      side: T.DoubleSide,
    });
  m.onBeforeCompile = (s) => {
    s.uniforms.swimTime = time;
    s.vertexShader =
      'uniform float swimTime; varying vec3 flank;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nflank=position; float tail=1.-smoothstep(-.50,.30,position.z); transformed.x+=tail*tail*.12*sin(position.z*10.+swimTime*6.+instanceMatrix[3].x*2.);',
      );
    s.fragmentShader =
      'uniform float swimTime;varying vec3 flank;\n' +
      s.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 p=flank.zy*vec2(76.,80.);p.x+=mod(floor(p.y),2.)*.5;
      float scale=length(fract(p)-.5);float edge=smoothstep(.32,.49,scale);
      float pattern=fract(sin(dot(floor(p*.42),vec2(91.71,43.3)))*4263.);
      diffuseColor.rgb*=1.-.23*edge-.44*step(.78,pattern)*smoothstep(-.01,.08,flank.y);
      diffuseColor.rgb+=vec3(.09,.12,.08)*pow(.5+.5*sin(flank.z*27.+sin(flank.y*42.+swimTime*2.)),8.);`,
      );
  };
  const shoal = new T.InstancedMesh(schoolGeometry(), m, count);
  shoal.name = 'Trout';
  shoal.frustumCulled = false;
  shoal.receiveShadow = true;
  shoal.castShadow = true;
  scene.add(shoal);
  const dummy = new T.Object3D();
  return (t, mobile) => {
    time.value = t;
    shoal.count = mobile ? Math.ceil(count / 2) : count;
    for (let i = 0; i < shoal.count; i++) {
      const a = t * 0.47 + i * 1.43,
        z = centerZ + radius * 1.22 * Math.sin(a),
        x = centerX + radius * Math.cos(a) + 0.13 * Math.sin(2 * a + i);
      dummy.position.set(x, height(x, z, t) - 0.18 - 0.045 * (1 + Math.cos(a + i)), z);
      dummy.rotation.set(
        0.026 * Math.sin(a),
        Math.atan2(-Math.sin(a), 1.22 * Math.cos(a)),
        0.11 * Math.cos(a),
      );
      dummy.scale.setScalar(0.53 + 0.078 * (i % 4));
      dummy.updateMatrix();
      shoal.setMatrixAt(i, dummy.matrix);
    }
    shoal.instanceMatrix.needsUpdate = true;
  };
}
function insectGeometry(kind) {
  const f = new Sections(),
    fly = kind === 'dragonfly',
    night = kind === 'firefly';
  const body = fly ? '#32868b' : night ? '#514333' : '#493b30',
    axial = ([x, y, z]) => [x, z, -y];
  const len = fly ? 0.31 : 0.13,
    rad = fly ? 0.018 : 0.031;
  for (let i = 0; i < 8; i++) {
    const r = rad * (1 - i * 0.06),
      z = (i * len) / 8;
    f.loft(
      [
        [z, r, r],
        [z + 0.006, r * 1.12, r * 1.12],
        [z + len / 8, r * 0.92, r * 0.94],
      ],
      night && i > 4 ? '#ffe57c' : i % 3 ? body : '#847c54',
      10,
      0,
      axial,
    );
  }
  f.loft(
    [
      [-0.088, 0.018, 0.02],
      [-0.063, 0.044, 0.045],
      [-0.023, 0.048, 0.043],
      [0.016, 0.032, 0.029],
    ],
    body,
    16,
    0,
    axial,
  );
  for (const s of [-1, 1])
    f.loft(
      [
        [-0.105, 0.013, 0.016, s * 0.034],
        [-0.084, 0.026, 0.031, s * 0.033],
        [-0.065, 0.02, 0.02, s * 0.034],
      ],
      fly ? '#496a56' : '#332d29',
      12,
      0,
      axial,
    );
  const bodyCount = f.p.length / 3;
  // Wing contours are tapered at the hinge and vein tips; a raised midrib catches sky light.
  for (const s of [-1, 1])
    for (let k = 0; k < 2; k++) {
      const span = fly ? 0.31 : night ? 0.093 : 0.214,
        breadth = fly ? 0.038 : night ? 0.024 : 0.104;
      f.loft(
        [
          [0, 0.005, 0.01],
          [span * 0.2, 0.007, breadth * 0.48],
          [span * 0.56, 0.008, breadth],
          [span * 0.83, 0.005, breadth * (k ? 0.8 : 1.15)],
          [span, 0.001, 0.007],
        ],
        fly ? '#afd6d0' : night ? '#8f7453' : k ? '#bd753a' : '#d89950',
        12,
        0,
        ([x, y, z]) => [s * y, 0.013 + x + y * 0.06, z - 0.03 + k * 0.056 + y * (k ? -0.39 : 0.23)],
      );
    }
  const g = f.geometry(),
    wing = new Float32Array(g.attributes.position.count);
  wing.fill(1, bodyCount);
  g.setAttribute('wing', new T.BufferAttribute(wing, 1));
  return g;
}
export function insects(scene, kind, count, center, spread, size) {
  const time = { value: 0 },
    night = kind === 'firefly',
    fly = kind === 'dragonfly';
  const m = new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.46,
    iridescence: fly ? 0.76 : 0.22,
    side: T.DoubleSide,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.insectTime = time;
    s.uniforms.dragon = { value: Number(fly) };
    s.uniforms.firefly = { value: Number(night) };
    s.vertexShader =
      'attribute float wing;uniform float insectTime,dragon;varying float membrane;varying vec3 markings;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
       markings=position;membrane=wing;
       float a=wing*(mix(.71,.20,dragon)+sin(insectTime*mix(16.,39.,dragon)+instanceMatrix[3].z*2.)*mix(.70,.37,dragon));
       transformed.x*=cos(a);transformed.y+=abs(position.x)*sin(a);`,
      );
    s.fragmentShader =
      'uniform float insectTime,dragon,firefly;varying float membrane;varying vec3 markings;\n' +
      s.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      if(membrane>.5){
        vec2 q=vec2(abs(markings.x),markings.z);
        float vein=smoothstep(.72,.99,cos(q.y*205.+q.x*61.+2.*sin(q.x*18.)));
        diffuseColor.rgb*=1.-vein*.36;
        if(dragon>.5)diffuseColor.rgb+=vec3(.12,.24,.20)*pow(.5+.5*sin(q.x*62.+insectTime*3.),5.);
        else {diffuseColor.rgb*=1.-.62*smoothstep(.145,.21,q.x);
          diffuseColor.rgb+=vec3(.52,.46,.31)*smoothstep(.8,1.,sin(q.y*141.))*smoothstep(.15,.18,q.x);}
      }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
      if(firefly>.5 && markings.z<-.075 && membrane<.5) totalEmissiveRadiance+=vec3(2.8,1.9,.3)*(.55+.45*sin(insectTime*2.+markings.z));`,
        );
  };
  const batch = new T.InstancedMesh(insectGeometry(kind), m, count),
    dummy = new T.Object3D();
  batch.name = kind;
  batch.frustumCulled = false;
  batch.castShadow = !night;
  batch.receiveShadow = true;
  scene.add(batch);
  let lights;
  if (night) {
    lights = new T.InstancedMesh(
      new T.PlaneGeometry(1, 1),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        uniforms: { clock: time },
        vertexShader: `uniform float clock;varying vec2 haloUv;varying float intensity;
        void main(){haloUv=uv-.5;intensity=pow(.5+.5*sin(clock*1.9+float(gl_InstanceID)*2.41),2.);
        vec4 eye=modelViewMatrix*instanceMatrix*vec4(0.,0.,-.1,1.);
        eye.xy+=position.xy*.14;gl_Position=projectionMatrix*eye;}`,
        fragmentShader: `varying vec2 haloUv;varying float intensity;void main(){float r=length(haloUv)*2.;
        gl_FragColor=vec4(2.1,1.69,.47,intensity*exp(-7.*r*r)*(1.-smoothstep(.64,1.,r)));}`,
      }),
      count,
    );
    lights.instanceMatrix = batch.instanceMatrix;
    lights.frustumCulled = false;
    scene.add(lights);
  }
  const random = seed(739),
    seeds = Array.from({ length: count }, () => random() * tau);
  return (t, mobile, dusk) => {
    time.value = t;
    batch.visible = !night || dusk;
    batch.count = mobile ? Math.ceil(count * 0.55) : count;
    if (lights) {
      lights.visible = batch.visible;
      lights.count = batch.count;
    }
    if (!batch.visible) return;
    for (let i = 0; i < batch.count; i++) {
      const ph = seeds[i],
        a = t * (fly ? 0.97 : 0.65) + ph;
      dummy.position.set(
        center[0] + spread[0] * (0.7 * Math.cos(a) + 0.3 * Math.sin(ph * 3)),
        center[1] + spread[1] * (0.65 * Math.sin(a * 1.67) + 0.35 * Math.cos(ph)),
        center[2] + spread[2] * Math.sin(a * 0.93 + ph),
      );
      dummy.rotation.set(
        0.12 * Math.sin(2 * a),
        Math.atan2(-spread[0] * Math.sin(a), spread[2] * Math.cos(a * 0.93 + ph)),
        0.14 * Math.cos(a),
      );
      dummy.scale.setScalar(size * (0.85 + 0.24 * Math.sin(ph) ** 2));
      dummy.updateMatrix();
      batch.setMatrixAt(i, dummy.matrix);
    }
    batch.instanceMatrix.needsUpdate = true;
  };
}
