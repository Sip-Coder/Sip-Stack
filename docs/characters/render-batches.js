// Pack rigid surfaces in the local space of their animated joint. One attribute
// carries each opaque finish's roughness and metalness, so screws, enamel and
// rubber can share a draw without losing their painted colours or highlights.
import * as T from 'three';

const paintedMaterials = new Map();
const solidFinishes = new Set([
  'pearl',
  'ceramicRim',
  'steel',
  'darkMetal',
  'rubber',
  'brass',
  'leatherEdge',
  'stitch',
  'emblem',
  'berry',
]);
const staticAttributes = new Set(['position', 'normal', 'uv', 'color']);

function paint(side) {
  if (paintedMaterials.has(side)) return paintedMaterials.get(side);
  const material = new T.MeshStandardMaterial({ vertexColors: true, side });
  material.name = 'Painted hardware and fabric';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute vec2 surfaceFinish; varying vec2 finish;\n' +
      shader.vertexShader.replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n finish = surfaceFinish;',
      );
    shader.fragmentShader =
      'varying vec2 finish;\n' +
      shader.fragmentShader
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n roughnessFactor = finish.x;',
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\n metalnessFactor = finish.y;',
        );
  };
  paintedMaterials.set(side, material);
  return material;
}

function finishFor(mesh, hero) {
  const m = mesh.material;
  if (
    !m.isMeshStandardMaterial ||
    m.transparent ||
    m.map ||
    m.alphaMap ||
    m.aoMap ||
    m.lightMap ||
    m.displacementMap ||
    m.envMap ||
    m.transmission ||
    m.opacity !== 1 ||
    m.emissive?.getHex() ||
    m.normalMap ||
    m.bumpMap ||
    m.roughnessMap ||
    m.metalnessMap ||
    m.alphaTest ||
    m.flatShading ||
    m.depthWrite === false ||
    m.polygonOffset ||
    (m.onBeforeCompile !== T.Material.prototype.onBeforeCompile &&
      !(hero === 'hummin' && solidFinishes.has(m.userData.blueprintId)))
  )
    return m;
  return paint(m.side);
}

function movable(mesh) {
  return (
    !compatible(mesh.geometry) ||
    (mesh.userData.mobileGeometry && !compatible(mesh.userData.mobileGeometry)) ||
    mesh.isSkinnedMesh ||
    mesh.isInstancedMesh ||
    mesh.userData.dynamicPose ||
    mesh.morphTargetInfluences?.length ||
    mesh.children.length
  );
}

function compatible(g) {
  const a = g.attributes;
  return (
    a.normal &&
    !Object.keys(g.morphAttributes).length &&
    a.position.usage === T.StaticDrawUsage &&
    !Number.isFinite(g.drawRange.count) &&
    Object.keys(a).every((key) => staticAttributes.has(key) && !a[key].isInterleavedBufferAttribute) &&
    a.position.array instanceof Float32Array &&
    a.normal.array instanceof Float32Array &&
    (!a.uv || a.uv.array instanceof Float32Array) &&
    (!a.color || a.color.itemSize === 3)
  );
}

function pack(parts, material, mobile) {
  let vertexCount = 0,
    indexCount = 0,
    hasIndex = false;
  const painted = paintedMaterials.get(material.side) === material;
  const schemas = parts.map(({ mesh }) => {
    const g = (mobile && mesh.userData.mobileGeometry) || mesh.userData.highGeometry || mesh.geometry;
    vertexCount += g.attributes.position.count;
    indexCount += g.index?.count ?? g.attributes.position.count;
    hasIndex ||= !!g.index;
    return g;
  });
  const pos = new Float32Array(3 * vertexCount),
    normals = new Float32Array(3 * vertexCount);
  const uv = new Float32Array(2 * vertexCount);
  const color = painted || material.vertexColors ? new Float32Array(3 * vertexCount) : null;
  const finish = painted ? new Uint8Array(2 * vertexCount) : null;
  const index = hasIndex
    ? vertexCount <= 65535
      ? new Uint16Array(indexCount)
      : new Uint32Array(indexCount)
    : null;
  const p = new T.Vector3(),
    n = new T.Vector3(),
    nm = new T.Matrix3(),
    identity = new T.Matrix4();
  let v = 0,
    k = 0;
  for (let j = 0; j < parts.length; j++) {
    const { mesh, matrix } = parts[j],
      g = schemas[j],
      attr = g.attributes,
      count = attr.position.count;
    if (matrix.equals(identity)) {
      pos.set(attr.position.array, v * 3);
      normals.set(attr.normal.array, v * 3);
    } else {
      nm.getNormalMatrix(matrix);
      for (let i = 0; i < count; i++) {
        p.fromBufferAttribute(attr.position, i)
          .applyMatrix4(matrix)
          .toArray(pos, (i + v) * 3);
        n.fromBufferAttribute(attr.normal, i)
          .applyNormalMatrix(nm)
          .toArray(normals, (i + v) * 3);
      }
    }
    if (attr.uv) uv.set(attr.uv.array, v * 2);
    const src = mesh.material;
    if (color)
      for (let i = 0; i < count; i++) {
        const off = (i + v) * 3,
          rgb = src.vertexColors && attr.color;
        color[off] = (painted ? src.color.r : 1) * (rgb ? rgb.getX(i) : 1);
        color[off + 1] = (painted ? src.color.g : 1) * (rgb ? rgb.getY(i) : 1);
        color[off + 2] = (painted ? src.color.b : 1) * (rgb ? rgb.getZ(i) : 1);
      }
    if (finish) {
      const rough = Math.round(src.roughness * 255),
        metal = Math.round(src.metalness * 255);
      for (let i = v; i < v + count; i++) {
        finish[2 * i] = rough;
        finish[2 * i + 1] = metal;
      }
    }
    if (index) {
      const a = g.index?.array,
        end = a?.length ?? count;
      for (let i = 0; i < end; i++) index[k++] = v + (a ? a[i] : i);
    }
    v += count;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(normals, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  if (color) g.setAttribute('color', new T.BufferAttribute(color, 3));
  if (finish) g.setAttribute('surfaceFinish', new T.BufferAttribute(finish, 2, true));
  if (index) g.setIndex(new T.BufferAttribute(index, 1));
  return g;
}

// A skinned pocket may interleave patch and binding triangles hundreds of
// times. The skin weights and all vertex IDs are unchanged when those opaque
// triangles are ordered by finish in the element buffer.
function consolidateGroups(geometry, materials) {
  const groups = geometry.groups;
  if (
    groups.length <= materials.length ||
    Number.isFinite(geometry.drawRange.count) ||
    materials.some((m) => m.transparent || m.depthWrite === false)
  )
    return;
  const byMaterial = new Map();
  let count = 0;
  for (const group of groups) {
    if (!byMaterial.has(group.materialIndex)) byMaterial.set(group.materialIndex, []);
    byMaterial.get(group.materialIndex).push(group);
    count += group.count;
  }
  if (byMaterial.size === groups.length) return;
  const original = geometry.index?.array;
  const indices =
    geometry.attributes.position.count <= 65535 ? new Uint16Array(count) : new Uint32Array(count);
  geometry.clearGroups();
  let written = 0;
  for (const [index, ranges] of byMaterial) {
    const start = written;
    for (const range of ranges) {
      if (original) {
        indices.set(original.subarray(range.start, range.start + range.count), written);
        written += range.count;
      } else {
        for (let i = 0; i < range.count; i++) indices[written++] = range.start + i;
      }
    }
    geometry.addGroup(start, written - start, index);
  }
  geometry.setIndex(new T.BufferAttribute(indices, 1));
}

function broadShadow(mesh, bounds, rootHeight) {
  if (!mesh.castShadow || !mesh.isMesh || mesh.userData.highDetail || mesh.material.transparent)
    return false;
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  g.boundingBox.getSize(bounds);
  const m = mesh.matrixWorld.elements;
  const x = bounds.x * Math.hypot(m[0], m[1], m[2]),
    y = bounds.y * Math.hypot(m[4], m[5], m[6]);
  const z = bounds.z * Math.hypot(m[8], m[9], m[10]);
  return x * y + y * z + z * x > 0.016 * rootHeight * rootHeight;
}

export function optimizeCharacter(rig) {
  // Non-rigid skin, expression morphs, cloth and shader-driven displays keep
  // their own draw. Their real geometry remains available for locomotion.
  const { root } = rig;
  root.updateWorldMatrix(true, true);
  const groups = new Map(),
    joints = new Set(rig.joints),
    bounds = new T.Vector3();
  function collect(node, anchor) {
    if (!node.isMesh && (node.isBone || joints.has(node) || node.userData.dynamicPose || !node.visible))
      anchor = node;
    if (node.isMesh) {
      if (Array.isArray(node.material)) {
        consolidateGroups(node.geometry, node.material);
        if (node.userData.mobileGeometry) consolidateGroups(node.userData.mobileGeometry, node.material);
      }
      node.castShadow = broadShadow(node, bounds, rig.height);
      if (!movable(node) && !Array.isArray(node.material) && node.visible && !node.material.transparent) {
        const material = finishFor(node, rig.name);
        let byFinish = groups.get(anchor);
        if (!byFinish) groups.set(anchor, (byFinish = new Map()));
        const key = [material.uuid, node.renderOrder, node.layers.mask, !!node.userData.highDetail].join(
          ':',
        );
        let bin = byFinish.get(key);
        if (!bin) byFinish.set(key, (bin = { material, parts: [] }));
        const matrix = new T.Matrix4().copy(anchor.matrixWorld).invert().multiply(node.matrixWorld);
        if (node.parent === anchor) matrix.copy(node.matrix);
        // A mirrored mesh would reverse triangle winding in a shared draw.
        if (matrix.determinant() > 0) bin.parts.push({ mesh: node, matrix });
      }
      anchor = node;
    }
    for (const child of node.children) collect(child, anchor);
  }
  collect(root, root);
  for (const [anchor, bins] of groups)
    for (const { material, parts } of bins.values()) {
      if (parts.length < 2) continue;
      const m = new T.Mesh(pack(parts, material, false), material);
      if (parts.some(({ mesh }) => !!mesh.userData.mobileGeometry))
        m.userData.mobileGeometry = pack(parts, material, true);
      m.name = anchor.name + ' geometry';
      m.renderOrder = parts[0].mesh.renderOrder;
      m.layers.mask = parts[0].mesh.layers.mask;
      m.userData.highDetail = !!parts[0].mesh.userData.highDetail;
      m.castShadow = parts.some(({ mesh }) => mesh.castShadow);
      m.receiveShadow = parts.some(({ mesh }) => mesh.receiveShadow);
      anchor.add(m);
      for (const { mesh } of parts) mesh.removeFromParent();
    }
}
