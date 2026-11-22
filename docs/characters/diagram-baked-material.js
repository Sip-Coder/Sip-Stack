// Freeze the live actor's PBR settings and its small authored shader edits.
// Both the offline writer and the recovery Worker use the same representation.
import { MeshStandardMaterial, MeshPhysicalMaterial, Color, Vector2 } from 'three';

const defaults = {
  MeshStandardMaterial: new MeshStandardMaterial(),
  MeshPhysicalMaterial: new MeshPhysicalMaterial(),
};
const properties = [
  'name',
  'color',
  'emissive',
  'emissiveIntensity',
  'metalness',
  'roughness',
  'clearcoat',
  'clearcoatRoughness',
  'ior',
  'specularIntensity',
  'specularColor',
  'sheen',
  'sheenRoughness',
  'sheenColor',
  'transmission',
  'opacity',
  'transparent',
  'alphaTest',
  'side',
  'depthWrite',
  'depthTest',
  'vertexColors',
  'flatShading',
  'polygonOffset',
  'polygonOffsetFactor',
  'polygonOffsetUnits',
  'toneMapped',
  'blending',
  'forceSinglePass',
  'visible',
  'envMapIntensity',
];
const stages = {
  vertexShader: ['begin_vertex', 'uv_vertex'],
  fragmentShader: ['color_fragment', 'roughnessmap_fragment'],
};
const separator = '\n// AXON-BUILD-MARKER\n';

export function describeAxonMaterial(material) {
  const base = defaults[material.type];
  if (!base) throw new Error('Unsupported inspection finish ' + material.type);
  const props = {};
  for (const key of properties) {
    const value = material[key];
    if (value?.isColor) {
      if (!value.equals(base[key])) props[key] = value.toArray();
    } else if (value !== base[key]) props[key] = value;
  }
  if (Object.values(material).some((value) => value?.isTexture)) {
    throw new Error('Texture-backed inspection finishes require an embedded glTF texture');
  }
  const shader = { uniforms: {} };
  for (const [stage, chunks] of Object.entries(stages))
    shader[stage] = separator + chunks.map((c) => '#include <' + c + '>').join(separator);
  material.onBeforeCompile(shader);
  const patches = {};
  for (const [stage, chunks] of Object.entries(stages)) {
    const [head, ...body] = shader[stage].split(separator);
    if (body.length !== chunks.length) throw new Error('Unsupported shader change on ' + material.name);
    const changed = {};
    if (head.trim() && head.trim() !== 'attribute vec3 diagramRest;') changed.head = head;
    body.forEach((code, i) => {
      if (code !== '#include <' + chunks[i] + '>') changed[chunks[i]] = code;
    });
    if (Object.keys(changed).length) patches[stage] = changed;
  }
  const uniforms = {};
  for (const [name, { value }] of Object.entries(shader.uniforms)) {
    if (value?.isColor || value?.isVector2)
      uniforms[name] = [value.isColor ? 'rgb' : 'xy', ...value.toArray()];
    else if (typeof value === 'number') uniforms[name] = value;
    else throw new Error('Unsupported inspection shader uniform ' + name);
  }
  return {
    type: material.type,
    props,
    ...(Object.keys(patches).length
      ? {
          patches,
          uniforms,
          shaderKey: material.customProgramCacheKey(),
        }
      : {}),
  };
}

export function restoreAxonMaterial({ type, props, patches, uniforms, shaderKey }) {
  const Constructor = defaults[type]?.constructor;
  if (!Constructor) throw new Error('Unknown inspection finish ' + type);
  const material = new Constructor();
  for (const [key, value] of Object.entries(props)) {
    if (material[key]?.isColor) material[key].fromArray(value);
    else material[key] = value;
  }
  if (patches) {
    material.customProgramCacheKey = () => shaderKey;
    material.onBeforeCompile = (shader) => {
      for (const [stage, { head = '', ...chunks }] of Object.entries(patches)) {
        for (const [chunk, code] of Object.entries(chunks))
          shader[stage] = shader[stage].replace('#include <' + chunk + '>', code);
        shader[stage] = head + shader[stage];
      }
      for (const [name, value] of Object.entries(uniforms)) {
        const uniform = Array.isArray(value)
          ? (value[0] === 'rgb' ? new Color() : new Vector2()).fromArray(value, 1)
          : value;
        shader.uniforms[name] = { value: uniform };
      }
    };
  }
  return material;
}
