import {
  Bone, BufferAttribute, BufferGeometry, Group, MathUtils, Matrix4, Mesh, MeshPhysicalMaterial,
  ShaderChunk, Skeleton, SkinnedMesh, Vector2, Vector3,
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
      (0.092 * facing * pow(grazing, 36.0));
  #endif
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );`,
);
function strandFinish(across, detail) {
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.46,
    specularIntensity: 0.38,
    anisotropy: 0.72,
  });
  material.name = 'Chocolate hair';
  material.userData.blueprintId = 'hair';
  const pitch = { value: new Vector2(across, detail) };
  material.onBeforeCompile = shader => {
    shader.uniforms.strandPitch = pitch;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 strandPitch;')
      .replace('#include <lights_physical_pars_fragment>', fiberLighting)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_ANISOTROPY
          // U runs with each strand. V unrolls the section across the guide.
          // Small coherent offsets stagger neighbors without breaking their flow.
          float along = vUv.x;
          float across = vUv.y;
          float drift = sin(6.2831853 * (1.3 * along + 3.0 * across));
          float grain = across + 0.0035 * drift + 0.0018 * sin(6.2831853 * (2.1 * along + 7.0 * across));
          vec2 lane = strandPitch * grain;
          vec2 visible = 1.0 - smoothstep(vec2(0.18), vec2(0.53), fwidth(lane));
          vec2 phase = 6.2831853 * lane + vec2(0.0, 0.53 * drift);
          vec2 ridge = cos(phase);
          float variation = 0.86 + 0.14 * sin(6.2831853 * (2.0 * across + 0.32 * along));
          float slope = variation * dot(visible * sin(phase), vec2(0.125, 0.063));
          normal = normalize(normal + tbn[1] * slope);
          float valley = smoothstep(0.0, 0.91, -ridge.x) * visible.x;
          float gleam = smoothstep(0.46, 0.97, ridge.x) * visible.x;
          diffuseColor.rgb *= 1.0 - 0.19 * valley + 0.07 * gleam * variation + 0.035 * visible.y * ridge.y;
          roughnessFactor *= 1.0 + 0.12 * valley - 0.07 * gleam;
        #endif`)
      .replace('#include <opaque_fragment>', `#ifdef USE_ANISOTROPY
        float fiberRim = 1.0 - max(0.0, dot(normalize(vViewPosition), nonPerturbedNormal));
        outgoingLight += 0.08 * diffuseColor.rgb * fiberRim * fiberRim * fiberRim;
      #endif
      #include <opaque_fragment>`);
  };
  return material;
}

// Sippy maps each small lock separately. Roma stretches the visible face of
// each wave over most of V so the surface carries about sixteen fine strands.
const hair = {
  sippy: strandFinish(11, 32),
  roma: strandFinish(18, 47),
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
  return { scene, name, tier };
}

// Fit the authored bind frame to each real-size scalp. All locks, strand
// attributes, bone lengths and the Roma band remain in the original GLB.
const scalpBind = {
  sippy: { scale: [0.7210, 0.8653, 1.0706], offset: [0.00372, -0.02821, 0.01445], tilt: -0.1332 },
  roma: { scale: [0.6753, 0.8607, 0.9684], offset: [0.00122, -0.03992, -0.01371], tilt: 0.1986 },
};

// Blender's scalp-root strip precedes the comb meshes in Sippy's packed
// primitive. Roma's scalp is a separate primitive. Only these backing strips
// follow the new section radii. The visible curls and fibers keep their shape.
const sippyScalpVertices = { high: 714, mobile: 520 };
const { smoothstep } = MathUtils;
const romaTempleSweep = 0.013;
function reseatedGeometry(source, positions) {
  const geometry = new BufferGeometry();
  geometry.setIndex(source.index);
  for (const [key, attribute] of Object.entries(source.attributes)) geometry.setAttribute(key, attribute);
  return geometry.setAttribute('position', positions);
}

function seatScalp(asset, mount) {
  const rows = mount.parent.userData.faceShell;
  if (asset.seatedScalp || !rows) return asset.seatedScalp;
  const sippy = asset.name === 'sippy';
  const name = sippy ? 'Sippy scalp, comb and nape' : 'Roma scalp underlay';
  const mesh = asset.scene.getObjectByName(name);
  const source = mesh.geometry, a = source.attributes.position;
  const n = sippy ? sippyScalpVertices[asset.tier] : a.count;
  const apex = rows.at(-1), sectors = apex.length - 3;
  const lastY = apex[0] / 1e5;
  const { uv } = source.attributes;
  const v = new Vector3(), mix = (a, b, f) => a + (b - a) * f;
  const positions = new BufferAttribute(new Float32Array(a.count * 3), 3);
  asset.scene.updateMatrixWorld(true);
  mount.updateMatrix();
  const toMesh = mount.matrix.clone().multiply(mesh.matrixWorld).invert();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld);
    const along = uv.getX(i);
    const crownFan = along >= 0.995 && (sippy || (Math.abs(v.x) < 0.0001 && v.y > 0.1526));
    if (crownFan) {
      v.set(apex[1] / 1e5, lastY + 0.0007, apex[2] / 1e5);
    } else {
      const azimuth = Math.atan2(v.x, v.z + 0.006);
      v.applyMatrix4(mount.matrix);
      // The occipital edge and ear opening sit lower on the true skull.
      // Keep the cloth and decorative strands in their approved bind.
      const rear = (1 - Math.cos(azimuth)) / 2;
      const edge = Math.max(0, 1 - along * 2) ** 2;
      v.y -= edge * (sippy ? 0.007 * rear : 0.003 * (1 - rear));
      // Recede the backing toward the fibers at the temple and beneath the
      // curls across Roma's forehead; the nape retains its existing seat.
      const temple = Math.abs(azimuth);
      v.y += edge * (sippy
        ? 0.008 * smoothstep(temple, 0.7, 1.1) * (1 - smoothstep(temple, 1.55, 2.1))
        : (0.008 + 0.0018 * Math.sin(5 * azimuth)) * (1 - smoothstep(temple, 0.45, 1.32)));
      const y = Math.min(v.y, lastY - 0.0008) * 1e5;
      const next = rows.findIndex(row => row[0] >= y);
      const lo = rows[Math.max(0, next - 1)], hi = rows[next];
      const f = lo === hi ? 0 : (y - lo[0]) / (hi[0] - lo[0]);
      const x = mix(lo[1], hi[1], f) / 1e5, z = mix(lo[2], hi[2], f) / 1e5;
      const angle = Math.atan2(v.x - x, v.z - z);
      const sector = (angle / (2 * Math.PI) * sectors + sectors) % sectors;
      const first = Math.floor(sector), second = (first + 1) % sectors, t = sector - first;
      const radius = mix(mix(lo[3 + first], lo[3 + second], t), mix(hi[3 + first], hi[3 + second], t), f) / 1e5;
      // The thin offset clears the finer skin triangulation at the root seat.
      const lift = mix(0.00035, sippy ? 0.0015 : 0.0019, Math.min(along * 10, 1));
      const nape = sippy ? 0.0045 * rear ** 6 * Math.min(along * 20, 1) * Math.max(0, 1 - along * 3) : 0;
      v.set(x + (radius + lift + nape) * Math.sin(angle), y / 1e5, z + (radius + lift + nape) * Math.cos(angle));
    }
    v.applyMatrix4(toMesh);
    positions.setXYZ(i, v.x, v.y, v.z);
  }
  for (let i = n; i < a.count; i++) positions.setXYZ(i, a.getX(i), a.getY(i), a.getZ(i));
  return asset.seatedScalp = { mesh, geometry: reseatedGeometry(source, positions) };
}

function seatRomaWaves(asset, mount) {
  if (asset.seatedWaves) return asset.seatedWaves;
  const result = new Map(), p = new Vector3(), shift = new Matrix4().makeTranslation(0, 0, -romaTempleSweep);
  asset.scene.updateMatrixWorld(true);
  mount.updateMatrix();
  for (const mesh of asset.scene.children) {
    const region = mesh.userData.hairRegion;
    const temple = region === 'temple', fixed = mesh.name.startsWith('Roma fixed ');
    if (!temple && region !== 'front' && !fixed) continue;
    const matrix = mount.matrix.clone();
    if (temple) matrix.multiply(shift);
    if (mesh.isSkinnedMesh) {
      const { bones, boneInverses } = mesh.skeleton;
      matrix.multiply(bones[0].matrixWorld).multiply(boneInverses[0]);
    } else matrix.multiply(mesh.matrixWorld);
    const inverse = matrix.clone().invert();
    const source = mesh.geometry.attributes.position;
    const positions = new BufferAttribute(new Float32Array(source.count * 3), 3);
    for (let i = 0; i < source.count; i++) {
      p.fromBufferAttribute(source, i).applyMatrix4(matrix);
      // Keep the crown and ends. The curved drape clears the outside of the
      // eye without moving the patterned band or narrowing the full groom.
      const eyeLevel = smoothstep(p.y, 0.005, 0.019) * (1 - smoothstep(p.y, 0.036, 0.067));
      p.z -= Math.max(0, p.z - 0.025) * eyeLevel * smoothstep(Math.abs(p.x), 0.024, 0.036);
      p.applyMatrix4(inverse);
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    result.set(mesh, reseatedGeometry(mesh.geometry, positions));
  }
  return asset.seatedWaves = result;
}

export function attachHair(head, asset, groom) {
  if (!groom) {
    const bind = scalpBind[asset.name];
    const mount = new Group();
    mount.name = 'Scalp hair bind';
    mount.position.fromArray(bind.offset);
    mount.rotation.x = bind.tilt;
    mount.scale.fromArray(bind.scale);
    head.add(mount);
    groom = { head: mount, version: 0 };
  }
  const group = asset.scene.clone(true), copies = new Map();
  function pair(from, to) {
    copies.set(from, to);
    from.children.forEach((child, i) => pair(child, to.children[i]));
  }
  pair(asset.scene, group);
  const scalp = seatScalp(asset, groom.head);
  if (scalp) copies.get(scalp.mesh).geometry = scalp.geometry;
  if (asset.name === 'roma')
    for (const [source, shape] of seatRomaWaves(asset, groom.head)) copies.get(source).geometry = shape;
  const bindings = [];
  let band;
  for (const [original, mesh] of copies) {
    if (mesh.isMesh && mesh.userData.hairBand) {
      band = { points: mesh.userData.hairBand, radius: mesh.userData.hairBandRadius };
    }
    if (!mesh.isSkinnedMesh) continue;
    const skeleton = original.skeleton;
    mesh.bind(new Skeleton(skeleton.bones.map(bone => copies.get(bone)), skeleton.boneInverses), original.bindMatrix);
    let points = mesh.userData.hairChain;
    if (asset.name === 'roma' && mesh.userData.hairRegion === 'temple') {
      mesh.skeleton.bones[0].position.z -= romaTempleSweep;
      points = points.map(([x, y, z]) => [x, y, z - romaTempleSweep]);
    }
    bindings.push({
      mesh,
      bones: mesh.skeleton.bones,
      points,
      region: mesh.userData.hairRegion,
    });
  }
  groom.group?.removeFromParent();
  groom.bindings?.forEach(({ mesh }) => mesh.skeleton.dispose());
  groom.head.add(group);
  return Object.assign(groom, { group, bindings, band, tier: asset.tier, version: groom.version + 1 });
}
