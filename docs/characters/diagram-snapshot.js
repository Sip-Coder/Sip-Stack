// Freeze the same positions, normals, UVs and bind-space shader inputs that the
// live WebGL draw uses. Static part geometry is independent of the animated rig.
import * as T from 'three';

function posedNormals(mesh) {
  const g = mesh.geometry,
    source = g.attributes.normal;
  const morphs = g.morphAttributes.normal ?? [],
    weights = mesh.morphTargetInfluences;
  const worldNormal = new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const base = new T.Vector3(),
    v = new T.Vector3(),
    delta = new T.Vector3(),
    temp = new T.Vector3();
  const matrices =
    mesh.isSkinnedMesh &&
    mesh.skeleton.bones.map((bone, i) =>
      new T.Matrix3().setFromMatrix4(
        new T.Matrix4()
          .copy(mesh.bindMatrixInverse)
          .multiply(bone.matrixWorld)
          .multiply(mesh.skeleton.boneInverses[i])
          .multiply(mesh.bindMatrix),
      ),
    );
  const ids = g.attributes.skinIndex,
    skin = g.attributes.skinWeight;
  const out = new Float32Array(source.count * 3);
  for (let i = 0; i < source.count; i++) {
    base.fromBufferAttribute(source, i);
    v.copy(base);
    for (let j = 0; j < morphs.length; j++)
      if (weights[j]) {
        delta.fromBufferAttribute(morphs[j], i);
        if (!g.morphTargetsRelative) delta.sub(base);
        v.addScaledVector(delta, weights[j]);
      }
    if (matrices) {
      temp.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const weight = skin.getComponent(i, k);
        if (weight)
          temp.addScaledVector(delta.copy(v).applyMatrix3(matrices[ids.getComponent(i, k)]), weight);
      }
      v.copy(temp);
    }
    v.applyNormalMatrix(worldNormal).toArray(out, i * 3);
  }
  return out;
}

export function freezeSurface(mesh) {
  const g = mesh.geometry,
    count = g.attributes.position.count;
  const world = new Float32Array(count * 3),
    v = new T.Vector3();
  for (let i = 0; i < count; i++)
    mesh
      .getVertexPosition(i, v)
      .applyMatrix4(mesh.matrixWorld)
      .toArray(world, 3 * i);
  return { world, normals: posedNormals(mesh), mirrored: mesh.matrixWorld.determinant() < 0 };
}

// Roma and Hummin already batch disjoint authored patches at construction.
// Trace their original triangle connectivity, then classify complete patches.
export function components(mesh, split, snapshot) {
  const g = mesh.geometry,
    pos = g.attributes.position,
    ix = g.index;
  const end = Math.min(ix?.count ?? pos.count, g.drawRange.start + g.drawRange.count);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = Array.isArray(mesh.material) ? g.groups : [{ start: 0, count: end, materialIndex: 0 }];
  const pieces = [],
    byMaterial = new Map();
  for (const group of groups) {
    const mat = group.materialIndex,
      start = Math.max(g.drawRange.start, group.start);
    if (!materials[mat]?.visible) continue;
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    const list = byMaterial.get(mat);
    for (let j = start; j + 2 < Math.min(end, group.start + group.count); j += 3)
      list.push(ix ? ix.getX(j) : j, ix ? ix.getX(j + 1) : j + 1, ix ? ix.getX(j + 2) : j + 2);
  }
  for (const [materialIndex, vertices] of byMaterial) {
    const roots = new Int32Array(pos.count).fill(-1);
    function root(i) {
      let r = i;
      while (roots[r] >= 0) r = roots[r];
      while (i !== r) {
        const next = roots[i];
        roots[i] = r;
        i = next;
      }
      return r;
    }
    function join(a, b) {
      a = root(a);
      b = root(b);
      if (a !== b) roots[b] = a;
    }
    if (split) {
      if (!ix) {
        const same = new Map();
        for (const i of vertices) {
          const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].join(',');
          if (same.has(key)) join(i, same.get(key));
          else same.set(key, i);
        }
      }
      for (let i = 0; i < vertices.length; i += 3) {
        join(vertices[i], vertices[i + 1]);
        join(vertices[i], vertices[i + 2]);
      }
    }
    const patches = new Map();
    for (let i = 0; i < vertices.length; i += 3) {
      const key = split ? root(vertices[i]) : 0;
      if (!patches.has(key)) patches.set(key, []);
      patches.get(key).push(vertices[i], vertices[i + 1], vertices[i + 2]);
    }
    for (const ids of patches.values()) {
      const unique = new Set(ids),
        localBox = new T.Box3(),
        worldBox = new T.Box3(),
        v = new T.Vector3();
      for (const i of unique) {
        localBox.expandByPoint(v.fromBufferAttribute(pos, i));
        worldBox.expandByPoint(v.fromArray(snapshot.world, i * 3));
      }
      const color = g.attributes.color
        ? new T.Color().fromBufferAttribute(g.attributes.color, ids[0]).getHexString()
        : '';
      pieces.push({
        ids,
        material: materials[materialIndex],
        materialIndex,
        color,
        triangles: ids.length / 3,
        index: pieces.length,
        vertexCount: unique.size,
        worldCenter: worldBox.getCenter(new T.Vector3()),
        objectCenter: localBox.getCenter(new T.Vector3()),
      });
    }
  }
  for (const piece of pieces) piece.count = pieces.length;
  return pieces;
}

// Keep vertex data in each finish. Baking a mirrored eye carrier reverses
// winding just as the live renderer's frontFace does.
export function joinPart(patches, resources) {
  const positions = [],
    normals = [],
    uv = [],
    colors = [],
    rest = [],
    indices = [];
  const materials = [],
    groups = new Map();
  for (const patch of patches) {
    if (!groups.has(patch.material)) groups.set(patch.material, []);
    groups.get(patch.material).push(patch);
  }
  const geometry = new T.BufferGeometry();
  for (const [source, list] of groups) {
    const start = indices.length;
    for (const { ids, mesh, snapshot } of list) {
      const { world, normals: ns, mirrored } = snapshot,
        g = mesh.geometry.attributes,
        used = new Map();
      for (let j = 0; j < ids.length; j++) {
        const k = j % 3;
        const i = ids[mirrored && k ? j + (k === 1 ? 1 : -1) : j];
        if (!used.has(i)) {
          used.set(i, positions.length / 3);
          const p = i * 3;
          positions.push(world[p], world[p + 1], world[p + 2]);
          normals.push(ns[p], ns[p + 1], ns[p + 2]);
          rest.push(g.position.getX(i), g.position.getY(i), g.position.getZ(i));
          uv.push(g.uv?.getX(i) ?? 0, g.uv?.getY(i) ?? 0);
          colors.push(g.color?.getX(i) ?? 1, g.color?.getY(i) ?? 1, g.color?.getZ(i) ?? 1);
        }
        indices.push(used.get(i));
      }
    }
    geometry.addGroup(start, indices.length - start, materials.length);
    materials.push(resources.material(source));
  }
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('diagramRest', new T.Float32BufferAttribute(rest, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new T.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
  mesh.renderOrder = Math.max(...patches.map((p) => p.mesh.renderOrder));
  return mesh;
}

export function snapshotResources() {
  const textures = new Map(),
    materials = new Set(),
    materialCopies = new Map();
  function texture(source) {
    if (!textures.has(source)) {
      const t = source.clone();
      t.needsUpdate = true;
      textures.set(source, t);
    }
    return textures.get(source);
  }
  function material(source) {
    if (materialCopies.has(source)) return materialCopies.get(source);
    // Material.copy normally serializes userData, including builder-only texture
    // state. Copy the render properties and rebind only actual shader uniforms.
    const m = new source.constructor().copy(Object.assign(Object.create(source), { userData: {} }));
    for (const [key, value] of Object.entries(m)) if (value?.isTexture) m[key] = texture(value);
    m.name = source.name || source.userData.blueprintId || 'Painted surface';
    const compile = source.onBeforeCompile,
      key = source.customProgramCacheKey();
    m.onBeforeCompile = (shader, renderer) => {
      const builtins = new Set(Object.keys(shader.uniforms));
      compile.call(m, shader, renderer);
      shader.vertexShader =
        'attribute vec3 diagramRest;\n' +
        shader.vertexShader
          .replace(/eyePoint\s*=\s*position\.xy/g, 'eyePoint=diagramRest.xy')
          .replace(/sipRest\s*=\s*position\b/g, 'sipRest=diagramRest');
      for (const [name, uniform] of Object.entries(shader.uniforms))
        if (!builtins.has(name)) {
          const value = uniform.value;
          shader.uniforms[name] = { value: value?.isTexture ? texture(value) : (value?.clone?.() ?? value) };
        }
    };
    m.customProgramCacheKey = () => key + '-diagram-rest-v1';
    materialCopies.set(source, m);
    materials.add(m);
    return m;
  }
  function dispose(parts) {
    const shapes = new Set();
    for (const { mesh } of parts) {
      mesh.removeFromParent();
      shapes.add(mesh.geometry);
      for (const mat of [].concat(mesh.material)) materials.add(mat);
    }
    for (const g of shapes) g.dispose();
    for (const m of materials) m.dispose();
    for (const texture of textures.values()) texture.dispose();
    materialCopies.clear();
    materials.clear();
    textures.clear();
  }
  return { material, dispose };
}
