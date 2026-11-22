import {
  Bone, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshPhysicalMaterial,
  ShaderChunk, Skeleton, SkinnedMesh,
} from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// A faint shifted fiber highlight complements the physical tangent lobe.
// The glTF tangent points from the dark root toward the lighter tip.
const fiberLighting = ShaderChunk.lights_physical_pars_fragment.replace(
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  `#ifdef USE_ANISOTROPY
    vec3 halfFiber = normalize(directLight.direction + geometryViewDir);
    vec3 rootLobe = normalize(material.anisotropyT - 0.21 * geometryNormal);
    float fiberDot = dot(rootLobe, halfFiber);
    float grazing = sqrt(max(0.0, 1.0 - fiberDot * fiberDot));
    float facing = smoothstep(-0.5, 0.12, fiberDot);
    reflectedLight.directSpecular += irradiance * material.diffuseColor *
      (0.12 * facing * pow(grazing, 31.0));
  #endif
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );`,
);
function strandFinish(across, roughness) {
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness,
    specularIntensity: 0.48,
    anisotropy: 0.75,
  });
  material.name = 'Chocolate hair';
  material.userData.blueprintId = 'hair';
  const pitch = { value: across };
  material.onBeforeCompile = shader => {
    shader.uniforms.strandPitch = pitch;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float strandPitch;')
      .replace('#include <lights_physical_pars_fragment>', fiberLighting)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_ANISOTROPY
          // U follows the guide. Tiny V fibers vary in reflectance while the
          // curved carrier supplies the normal for the continuous gloss band.
          float fiberPhase = vUv.y * strandPitch + 0.29 * sin(9.7 * vUv.x + 6.2831853 * vUv.y);
          float fiberCoverage = 1.0 - smoothstep(0.20, 0.67, fwidth(fiberPhase));
          float fiberSeed = fract(floor(fiberPhase) * 0.61803398875);
          float fiberCenter = 0.5 + 0.24 * (fiberSeed - 0.5);
          float fiberDistance = abs(fract(fiberPhase) - fiberCenter);
          float fiberLight = (1.0 - smoothstep(0.06, 0.34 + 0.11 * fiberSeed, fiberDistance))
            * mix(0.65, 1.0, fiberSeed);
          float fiberContrast = fiberCoverage * (fiberLight - 0.43);
          diffuseColor.rgb *= 1.0 + 0.18 * fiberContrast;
          roughnessFactor *= 1.0 - 0.25 * fiberContrast;
        #endif`)
      .replace('#include <opaque_fragment>', `#ifdef USE_ANISOTROPY
        float fiberRim = 1.0 - max(0.0, dot(normalize(vViewPosition), nonPerturbedNormal));
        outgoingLight += 0.08 * diffuseColor.rgb * fiberRim * fiberRim * fiberRim;
      #endif
      #include <opaque_fragment>`);
  };
  return material;
}

const hair = {
  // Calibrated to the new carrier widths and each d116849 primary fiber pitch.
  sippy: strandFinish(1344, 0.39),
  roma: strandFinish(224, 0.34),
};

const schema = {
  POSITION: ['position', 3], NORMAL: ['normal', 3], TANGENT: ['tangent', 4],
  TEXCOORD_0: ['uv', 2], COLOR_0: ['color'], JOINTS_0: ['skinIndex', 4], WEIGHTS_0: ['skinWeight', 4],
};
const components = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array,
  5125: Uint32Array, 5126: Float32Array,
};

// This reader handles the single-primitive, texture-free GLBs produced by
// pack-groom. Decode before attaching the rig so the first draw has every lock.
export async function decodeHair(buffer, name, tier) {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== buffer.byteLength || header.getUint32(16, true) !== 0x4e4f534a)
    throw new Error('Invalid hair GLB header');
  const jsonLength = header.getUint32(12, true), bin = 28 + jsonLength;
  if (header.getUint32(bin - 4, true) !== 0x004e4942) throw new Error('Missing hair GLB data');
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  await MeshoptDecoder.ready;
  const blocks = gltf.bufferViews.map(view => {
    const packed = view.extensions?.EXT_meshopt_compression;
    if (!packed) return new Uint8Array(buffer, bin + (view.byteOffset ?? 0), view.byteLength);
    const bytes = new Uint8Array(packed.count * packed.byteStride);
    MeshoptDecoder.decodeGltfBuffer(bytes, packed.count, packed.byteStride,
      new Uint8Array(buffer, bin + (packed.byteOffset ?? 0), packed.byteLength),
      packed.mode, packed.filter ?? 'NONE');
    return bytes;
  });
  const attrs = new Map();
  function attribute(id) {
    if (attrs.has(id)) return attrs.get(id);
    const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const Type = components[a.componentType], step = Type.BYTES_PER_ELEMENT;
    const block = blocks[a.bufferView], stride = (view.byteStride ?? width * step) / step;
    const values = new Type(block.buffer, block.byteOffset + (a.byteOffset ?? 0),
      stride * (a.count - 1) + width);
    let packed = values;
    if (stride !== width) {
      packed = new Type(a.count * width);
      for (let i = 0; i < a.count; i++)
        for (let j = 0; j < width; j++) packed[i * width + j] = values[i * stride + j];
    }
    const attr = new BufferAttribute(packed, width, a.normalized ?? false);
    attrs.set(id, attr);
    return attr;
  }
  const joints = new Set(gltf.skins.flatMap(s => s.joints));
  const scene = new Group();
  scene.name = name + ' authored hair';
  const nodes = gltf.nodes.map((node, i) => {
    let object;
    if (node.mesh === undefined) object = joints.has(i) ? new Bone() : new Group();
    else {
      const { attributes, indices, material } = gltf.meshes[node.mesh].primitives[0];
      const g = new BufferGeometry();
      for (const [semantic, id] of Object.entries(attributes)) {
        const [name, width] = schema[semantic], attr = attribute(id);
        if (width && attr.itemSize !== width) throw new Error('Invalid hair attribute ' + semantic);
        g.setAttribute(name, attr);
      }
      g.setIndex(attribute(indices));
      let finish = hair[name];
      if (node.extras.hairPart === 'headband') {
        const properties = gltf.materials[material].pbrMetallicRoughness;
        finish = new MeshPhysicalMaterial({ vertexColors: true, roughness: properties.roughnessFactor ?? 1 });
        finish.color.fromArray(properties.baseColorFactor ?? [1, 1, 1]);
        finish.name = 'Patterned red cloth';
      }
      object = node.skin === undefined ? new Mesh(g, finish) : new SkinnedMesh(g, finish);
      object.castShadow = true;
      object.receiveShadow = true;
      // A skinned lock can swing beyond its original bind bounds.
      if (object.isSkinnedMesh) object.frustumCulled = false;
    }
    object.name = node.name ?? '';
    object.userData = node.extras ?? {};
    if (object.isMesh) object.userData.dynamicPose = true;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  gltf.nodes.forEach((node, i) => {
    for (const child of node.children ?? []) nodes[i].add(nodes[child]);
  });
  for (const i of gltf.scenes[gltf.scene ?? 0].nodes) scene.add(nodes[i]);
  gltf.nodes.forEach((node, i) => {
    if (node.skin === undefined) return;
    const skin = gltf.skins[node.skin], data = attribute(skin.inverseBindMatrices);
    nodes[i].bind(new Skeleton(skin.joints.map(j => nodes[j]),
      skin.joints.map((_, j) => new Matrix4().fromArray(data.array, j * 16))), new Matrix4());
  });
  if (!nodes.some(n => n.isSkinnedMesh)) throw new Error('Missing strategic hair locks');
  return { scene, tier };
}

export function attachHair(head, asset, groom = { head, version: 0 }) {
  const group = asset.scene.clone(true), copies = new Map();
  function pair(from, to) {
    copies.set(from, to);
    from.children.forEach((child, i) => pair(child, to.children[i]));
  }
  pair(asset.scene, group);
  const bindings = [];
  let band;
  for (const [original, mesh] of copies) {
    if (mesh.isMesh && mesh.userData.hairBand) {
      band = { points: mesh.userData.hairBand, radius: mesh.userData.hairBandRadius };
    }
    if (!mesh.isSkinnedMesh) continue;
    const skeleton = original.skeleton;
    mesh.bind(new Skeleton(skeleton.bones.map(bone => copies.get(bone)), skeleton.boneInverses), original.bindMatrix);
    bindings.push({
      mesh,
      bones: mesh.skeleton.bones,
      points: mesh.userData.hairChain,
      region: mesh.userData.hairRegion,
    });
  }
  groom.group?.removeFromParent();
  groom.bindings?.forEach(({ mesh }) => mesh.skeleton.dispose());
  head.add(group);
  return Object.assign(groom, { group, bindings, band, tier: asset.tier, version: groom.version + 1 });
}
