// Pose one low-resolution rig at load and bake its vertex displacements.
// Each group of background workers then costs a single instanced draw.
import * as T from 'three';
import { worker } from './people.js';
export function gathering(parent, variant, unit, placements) {
  const rig = worker(new T.Group(), variant, unit, 'talk'),
    geo = rig.low.geometry.clone(),
    pos = geo.attributes.position;
  const frames = 24,
    width = pos.count,
    data = new Float32Array(width * frames * 4),
    v = new T.Vector3();
  for (let frame = 0; frame < frames; frame++) {
    rig.pose(frame * 0.25, 'talk');
    rig.g.updateMatrixWorld(true);
    rig.skeleton.update();
    for (let i = 0; i < width; i++) {
      v.fromBufferAttribute(pos, i);
      rig.low.applyBoneTransform(i, v);
      const k = (frame * width + i) * 4;
      data[k] = v.x;
      data[k + 1] = v.y;
      data[k + 2] = v.z;
    }
  }
  const atlas = new T.DataTexture(data, width, frames, T.RGBAFormat, T.FloatType);
  atlas.needsUpdate = true;
  const clock = { value: 0 };
  function sample(shader) {
    shader.uniforms.poses = { value: atlas };
    shader.uniforms.crowdTime = clock;
    shader.vertexShader =
      'uniform sampler2D poses;uniform float crowdTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `float frame=mod(crowdTime*4.+float(gl_InstanceID)*7.,24.);
       ivec2 a=ivec2(gl_VertexID,int(frame)),b=ivec2(gl_VertexID,(int(frame)+1)%24);
       vec3 transformed=mix(texelFetch(poses,a,0).xyz,texelFetch(poses,b,0).xyz,fract(frame));`,
      );
  }
  const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  m.onBeforeCompile = sample;
  const batch = new T.InstancedMesh(geo, m, placements.length),
    dummy = new T.Object3D();
  batch.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
  batch.customDepthMaterial.onBeforeCompile = sample;
  batch.castShadow = batch.receiveShadow = true;
  placements.forEach(([x, y, z, a, scale], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.y = a;
    dummy.scale.setScalar(rig.g.scale.x * scale);
    dummy.updateMatrix();
    batch.setMatrixAt(i, dummy.matrix);
  });
  batch.name = 'Tasting group';
  parent.add(batch);
  for (const m of rig.layers) m.geometry.dispose();
  rig.low.geometry.dispose();
  rig.skeleton.dispose();
  return (t) => {
    clock.value = t;
  };
}
