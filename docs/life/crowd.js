// Pose one low-resolution rig at load and bake its vertex displacements.
// Each group of background workers then costs a single instanced draw.
import * as T from 'three';
import { worker } from './people.js';
import { distantSurface } from './appearance.js';
export function gathering(parent, variant, unit, placements) {
  const rig = worker(new T.Group(), variant, unit, 'talk', true),
    geo = rig.low.geometry.clone(),
    pos = rig.low.geometry.attributes.position;
  const frames = 24,
    width = pos.count;
  const data = new Float32Array(width * frames * 4);
  const skeleton = rig.low.skeleton,
    joints = geo.attributes.skinIndex.array,
    weights = geo.attributes.skinWeight.array;
  const matrices = new Float32Array(skeleton.bones.length * 16),
    delta = new T.Matrix4();
  for (let frame = 0; frame < frames; frame++) {
    rig.pose(frame * 0.25, 'talk');
    rig.g.updateMatrixWorld(true);
    // Bake the same model-space matrices as SkinnedMesh once per joint, then
    // stream the four influences per vertex directly into the texture.
    for (let j = 0; j < skeleton.bones.length; j++) {
      delta.multiplyMatrices(rig.low.bindMatrixInverse, skeleton.bones[j].matrixWorld);
      delta.multiply(skeleton.boneInverses[j]).toArray(matrices, 16 * j);
    }
    for (let i = 0; i < width; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i),
        k = 4 * (width * frame + i);
      for (let lane = 0; lane < 4; lane++) {
        const influence = 4 * i + lane,
          weight = weights[influence],
          j = 16 * joints[influence];
        if (weight === 0) continue;
        data[k] += weight * (matrices[j] * x + matrices[j + 4] * y + matrices[j + 8] * z + matrices[j + 12]);
        data[k + 1] +=
          weight * (matrices[j + 1] * x + matrices[j + 5] * y + matrices[j + 9] * z + matrices[j + 13]);
        data[k + 2] +=
          weight * (matrices[j + 2] * x + matrices[j + 6] * y + matrices[j + 10] * z + matrices[j + 14]);
      }
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
  const m = distantSurface.clone();
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
  batch.userData.restorePeopleCrowd = () => {
    atlas.needsUpdate = true;
  };
  batch.name = 'Tasting group';
  parent.add(batch);
  for (const m of rig.layers) m.geometry.dispose();
  rig.low.geometry.dispose();
  if (rig.low.skeleton !== rig.skeleton) rig.low.skeleton.dispose();
  rig.skeleton.dispose();
  return (t) => {
    clock.value = t;
  };
}
