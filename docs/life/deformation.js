// Distance-field weights, pose-space correctives and a dual-quaternion palette.
// The model, its sockets and all bind coordinates share the same metre scale.
import * as T from 'three';

const clamp = T.MathUtils.clamp;
const metre = new T.Matrix4(),
  local = new T.Matrix4(),
  qr = new T.Quaternion(),
  tr = new T.Vector3(),
  scale = new T.Vector3();
const dx = new T.Vector3(),
  dq0 = new T.Quaternion(),
  dq1 = new T.Quaternion(),
  conj = new T.Quaternion();
const paletteGLSL = `
uniform sampler2D jointDQ;
void dualSkin(out vec4 realQ, out vec4 dualQ) {
  vec4 reference=texelFetch(jointDQ,ivec2(0,int(skinIndex.x)),0);
  realQ=vec4(0.); dualQ=vec4(0.);
  for(int j=0;j<4;j++){
    int id=int(skinIndex[j]);
    vec4 q=texelFetch(jointDQ,ivec2(0,id),0);
    float w=skinWeight[j]*(dot(q,reference)<0.?-1.:1.);
    realQ+=w*q;dualQ+=w*texelFetch(jointDQ,ivec2(1,id),0);
  }
  float len=max(length(realQ),.00001);
  realQ/=len;dualQ/=len;dualQ-=realQ*dot(realQ,dualQ);
}
vec3 qRotate(vec3 p,vec4 q){return p+2.*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
vec3 qTranslation(vec4 r,vec4 d){return 2.*(r.w*d.xyz-d.w*r.xyz+cross(r.xyz,d.xyz));}
`;
function dqMaterial(material, texture) {
  const m = material.clone(),
    original = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  m.onBeforeCompile = function (s, renderer) {
    original.call(material, s, renderer);
    s.uniforms.jointDQ = { value: texture };
    s.vertexShader = s.vertexShader
      .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + paletteGLSL)
      .replace('#include <skinbase_vertex>', 'vec4 dqReal,dqDual; dualSkin(dqReal,dqDual);')
      .replace(
        '#include <skinnormal_vertex>',
        `objectNormal=qRotate(objectNormal,dqReal);
        #ifdef USE_TANGENT
          objectTangent=qRotate(objectTangent,dqReal);
        #endif`,
      )
      .replace(
        '#include <skinning_vertex>',
        'transformed=qRotate(transformed,dqReal)+qTranslation(dqReal,dqDual);',
      );
  };
  m.customProgramCacheKey = () => key + '-sip-dq-v1';
  return m;
}

// Restrict heat diffusion to the connected anatomical chain. Nearby thighs
// and hands can be millimetres apart in the bind pose but must never cross-bind.
function heatFields(r) {
  const fields = new Map();
  function register(owners, nodes, sigma) {
    const records = nodes.map(([joint, x, y, z, amplitude = 1]) => ({ joint, x, y, z, amplitude }));
    const field = { records, sigma };
    for (const joint of owners) fields.set(joint, field);
  }
  function at(id, y, z = 0, x = 0, amplitude = 1) {
    const p = r.bind[id];
    return [id, p.x + x, p.y + y, p.z + z, amplitude];
  }
  for (const a of r.sides) {
    register(
      [a.arm, a.armTwist, a.elbow, a.foreTwist, a.deltoid, a.elbowTip, a.hand],
      [
        at(r.chest, 0.127, 0, a.x * 0.51, 0.9),
        at(a.deltoid, 0.046, 0, -a.s * 0.017),
        at(a.arm, -0.065),
        at(a.armTwist, -0.016),
        at(a.armTwist, -0.106),
        at(a.elbowTip, 0, 0, 0, 0.26),
        at(a.elbow, -0.036),
        at(a.foreTwist, 0.045),
        at(a.foreTwist, -0.051),
        at(a.hand, 0.006),
        at(a.hand, -0.049),
        at(a.hand, -0.115),
      ],
      0.055,
    );
    register(
      [a.thigh, a.thighTwist, a.shin, a.kneecap, a.glute],
      [
        at(r.hip, 0.085, 0, a.h * 0.68),
        at(a.glute, 0.014, -0.02, 0, 0.65),
        at(a.thigh, -0.065),
        at(a.thighTwist, 0.052),
        at(a.thighTwist, -0.058),
        at(a.thighTwist, -0.147),
        at(a.kneecap, 0.015, 0, 0, 2.25),
        at(a.shin, -0.023),
        at(a.shin, -0.107),
        at(a.shin, -0.235),
        at(a.shin, -0.336),
        at(a.ankle, -0.004),
      ],
      0.079,
    );
  }
  register(
    [r.spine, r.spine2, r.spine3, r.chest, r.hip],
    [
      at(r.hip, -0.065),
      at(r.hip, 0.036),
      at(r.spine, -0.035),
      at(r.spine2, 0),
      at(r.spine3, 0.01),
      at(r.chest, 0.015),
      at(r.chest, 0.125),
      at(r.neck, -0.005, 0, 0, 0.4),
    ],
    0.07,
  );
  register(
    [r.neck, r.neck2],
    [at(r.chest, 0.174), at(r.neck, -0.007), at(r.neck2, -0.002), at(r.head, 0.018)],
    0.023,
  );
  return fields;
}
function applyWeights(g, fields, r) {
  const si = g.attributes.skinIndex,
    sw = g.attributes.skinWeight,
    p = g.attributes.position;
  const sums = new Float64Array(r.bones.length),
    joints = new Int16Array(4),
    weights = new Float64Array(4);
  for (let i = 0; i < p.count; i++) {
    const owner = si.getX(i),
      f = fields.get(owner);
    if (!f) continue;
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const samples = f.records,
      divisor = -0.5 / (f.sigma * f.sigma);
    sums.fill(0);
    for (const n of samples) {
      sums[n.joint] += n.amplitude * Math.exp(divisor * ((x - n.x) ** 2 + (y - n.y) ** 2 + (z - n.z) ** 2));
    }
    weights.fill(0);
    joints.fill(owner);
    for (const n of samples) {
      const w = sums[n.joint];
      if (!w) continue;
      sums[n.joint] = 0;
      let k = 0;
      while (k < 4 && weights[k] > w) k++;
      if (k === 4) continue;
      for (let j = 3; j > k; j--) {
        weights[j] = weights[j - 1];
        joints[j] = joints[j - 1];
      }
      weights[k] = w;
      joints[k] = n.joint;
    }
    const total = weights[0] + weights[1] + weights[2] + weights[3];
    if (total === 0) continue;
    si.setXYZW(i, joints[0], joints[1], joints[2], joints[3]);
    sw.setXYZW(i, weights[0] / total, weights[1] / total, weights[2] / total, weights[3] / total);
  }
}
function reduced(master, r, level) {
  const keep = new Set();
  if (level === 2) {
    for (let j = 0; j <= r.hem; j++) keep.add(j);
    for (const a of r.sides) {
      keep.add(a.foreTwist);
      keep.add(a.thighTwist);
    }
  } else {
    for (let j = 0; j < r.bones.length; j++) keep.add(j);
    for (const a of r.sides) for (const finger of a.fingers) keep.delete(finger[1]);
    for (const id of [...r.hair.slice(1), ...r.straps.slice(1)]) keep.delete(id);
  }
  const ids = [...keep].sort((a, b) => a - b),
    bones = ids.map((id) => r.bones[id]);
  const skeleton = new T.Skeleton(
    bones,
    ids.map((id) => master.boneInverses[id]),
  );
  const lut = new Uint16Array(master.bones.length);
  for (let j = 0; j < lut.length; j++) {
    let b = master.bones[j];
    while (!keep.has(r.bones.indexOf(b)) && b.isBone) b = b.parent;
    const n = bones.indexOf(b);
    lut[j] = Math.max(0, n);
  }
  return { skeleton, lut };
}
function drivers(r) {
  const list = [];
  for (const a of r.sides)
    for (const [joint, prox, distal, axisName] of [
      [a.elbow, [a.arm, a.armTwist, a.elbowTip], [a.elbow, a.foreTwist], 'x'],
      [a.shin, [a.thigh, a.thighTwist, a.kneecap], [a.shin, a.ankle], 'x'],
      [a.arm, [r.chest, a.deltoid], [a.arm, a.armTwist], 'z'],
      [a.thigh, [r.hip, a.glute], [a.thigh, a.thighTwist], 'x'],
      [a.hand, [a.elbow, a.foreTwist], [a.hand], 'y'],
    ])
      list.push({ joint, prox, distal, axisName });
  return list;
}
function correctives(mesh, r, list, dual) {
  const geo = mesh.geometry,
    p = geo.attributes.position,
    si = geo.attributes.skinIndex,
    sw = geo.attributes.skinWeight;
  const shapes = geo.morphAttributes.position || [],
    bindings = [];
  for (const d of list) {
    const pivot = r.bind[d.joint],
      limit = d.joint === r.sides[0].hand || d.joint === r.sides[1].hand ? 0.078 : 0.12;
    let delta90, delta140;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) - pivot.x,
        y = p.getY(i) - pivot.y,
        z = p.getZ(i) - pivot.z;
      if (x * x + y * y + z * z > limit * limit) continue;
      let w = 0,
        u = 0;
      for (let k = 0; k < 4; k++) {
        const bone = si.getComponent(i, k),
          weight = sw.getComponent(i, k);
        if (d.prox.includes(bone)) u += weight;
        if (d.distal.includes(bone)) w += weight;
      }
      if (u < 0.005 || w < 0.005) continue;
      if (!delta90) {
        delta90 = new Float32Array(p.count * 3);
        delta140 = new Float32Array(p.count * 3);
      }
      // In a two-frame sampled bend the transverse component of a mixed rigid
      // rotation contracts by |(1-w)+w*exp(i*theta)|. Restore its radius about
      // the segment's long axis; cap the inverse near a deeply folded joint.
      const fraction = w / (u + w),
        radialX = d.axisName === 'x' ? 0 : x,
        radialZ = d.axisName === 'z' ? 0 : z;
      for (const [angle, delta] of [
        [90, delta90],
        [140, delta140],
      ]) {
        const contraction = Math.sqrt(
          1 - 2 * fraction * (1 - fraction) * (1 - Math.cos((angle * Math.PI) / 180)),
        );
        const gain = Math.min(0.6, 1 / contraction - 1) * (u + w) * (dual ? 0.07 : 1);
        delta[i * 3] = radialX * gain;
        delta[i * 3 + 2] = radialZ * gain;
      }
    }
    if (delta90) {
      const start = shapes.length;
      for (const [delta, angle] of [
        [delta90, 90],
        [delta140, 140],
      ]) {
        const attr = new T.BufferAttribute(delta, 3);
        attr.name = r.bones[d.joint].name + ' ' + d.joint + ' ' + angle;
        shapes.push(attr);
      }
      bindings.push({ start, joint: d.joint });
    }
  }
  if (bindings.length) {
    geo.morphAttributes.position = shapes;
    geo.morphTargetsRelative = true;
    mesh.updateMorphTargets();
  }
  return bindings;
}
export function createDeformation(r) {
  const fields = heatFields(r),
    controls = drivers(r),
    tiers = [],
    layers = [];
  let texture = null,
    master = null;
  let bakedRevision = -1,
    revision = 0;
  function prepare(mesh, level) {
    const g = mesh.geometry;
    master ??= mesh.skeleton;
    applyWeights(g, fields, r);
    if (level < 2) {
      const bindings = correctives(mesh, r, controls, level === 0);
      if (bindings.length) layers.push({ mesh, bindings });
    }
    if (level) {
      tiers[level] ??= reduced(master, r, level);
      const { skeleton, lut } = tiers[level],
        si = g.attributes.skinIndex;
      for (let i = 0; i < si.array.length; i++) si.array[i] = lut[si.array[i]];
      mesh.bind(skeleton, new T.Matrix4());
    } else {
      if (!texture) {
        texture = new T.DataTexture(
          new Float32Array(r.bones.length * 8),
          2,
          r.bones.length,
          T.RGBAFormat,
          T.FloatType,
        );
        texture.name = 'Character dual quaternions';
        texture.needsUpdate = true;
      }
      mesh.material = dqMaterial(mesh.material, texture);
      mesh.customDepthMaterial = dqMaterial(
        new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }),
        texture,
      );
      mesh.customDistanceMaterial = dqMaterial(new T.MeshDistanceMaterial(), texture);
      mesh.onBeforeRender = mesh.onBeforeShadow = refresh;
      mesh.userData.dualPalette = texture;
    }
    return mesh;
  }
  function palette() {
    if (!texture || !master) return;
    const data = texture.image.data;
    // Remove the external hierarchy (including non-unit actor scale). Skinning
    // is entirely in model space; Three applies modelViewMatrix afterwards.
    local.copy(r.bones[r.hip].parent.matrixWorld).invert();
    for (let i = 0; i < r.bones.length; i++) {
      metre.multiplyMatrices(local, r.bones[i].matrixWorld).multiply(master.boneInverses[i]);
      metre.decompose(tr, qr, scale);
      qr.normalize();
      const k = i * 8,
        x = qr.x,
        y = qr.y,
        z = qr.z,
        w = qr.w;
      data[k] = x;
      data[k + 1] = y;
      data[k + 2] = z;
      data[k + 3] = w;
      data[k + 4] = 0.5 * (tr.x * w + tr.y * z - tr.z * y);
      data[k + 5] = 0.5 * (-tr.x * z + tr.y * w + tr.z * x);
      data[k + 6] = 0.5 * (tr.x * y - tr.y * x + tr.z * w);
      data[k + 7] = -0.5 * (tr.x * x + tr.y * y + tr.z * z);
    }
    texture.needsUpdate = true;
    bakedRevision = revision;
  }
  function refresh() {
    if (bakedRevision !== revision) palette();
  }
  function driveCorrectives() {
    revision++;
    for (const group of layers)
      for (const binding of group.bindings) {
        const angle = (r.bones[binding.joint].quaternion.angleTo(unit) * 180) / Math.PI,
          start = binding.start;
        group.mesh.morphTargetInfluences[start] = angle < 90 ? angle / 90 : clamp((140 - angle) / 50, 0, 1);
        group.mesh.morphTargetInfluences[start + 1] = clamp((angle - 90) / 50, 0, 1);
      }
  }
  function restore() {
    bakedRevision = -1;
    if (texture) texture.needsUpdate = true;
    if (master?.boneTexture) master.boneTexture.needsUpdate = true;
    for (const tier of tiers) if (tier?.skeleton.boneTexture) tier.skeleton.boneTexture.needsUpdate = true;
  }
  return { prepare, palette, driveCorrectives, restore };
}
const unit = new T.Quaternion();
// Identical to the production color/depth deformation for headless contact and
// inverted-triangle checks. The caller updates world matrices and palette once.
export function skinPoint(mesh, i, out) {
  T.Mesh.prototype.getVertexPosition.call(mesh, i, out);
  const palette = mesh.userData.dualPalette;
  if (!palette) return mesh.applyBoneTransform(i, out);
  const g = mesh.geometry,
    si = g.attributes.skinIndex,
    sw = g.attributes.skinWeight,
    d = palette.image.data;
  const ref = si.getX(i) * 8;
  let x = 0,
    y = 0,
    z = 0,
    w = 0,
    ex = 0,
    ey = 0,
    ez = 0,
    ew = 0;
  for (let j = 0; j < 4; j++) {
    const k = si.getComponent(i, j) * 8;
    const a =
      sw.getComponent(i, j) *
      (d[ref] * d[k] + d[ref + 1] * d[k + 1] + d[ref + 2] * d[k + 2] + d[ref + 3] * d[k + 3] < 0 ? -1 : 1);
    x += a * d[k];
    y += a * d[k + 1];
    z += a * d[k + 2];
    w += a * d[k + 3];
    ex += a * d[k + 4];
    ey += a * d[k + 5];
    ez += a * d[k + 6];
    ew += a * d[k + 7];
  }
  const inv = 1 / Math.hypot(x, y, z, w);
  dq0.set(x * inv, y * inv, z * inv, w * inv);
  dq1.set(ex * inv, ey * inv, ez * inv, ew * inv);
  dq1.multiply(conj.copy(dq0).conjugate());
  dx.set(2 * dq1.x, 2 * dq1.y, 2 * dq1.z);
  return out.applyQuaternion(dq0).add(dx);
}
