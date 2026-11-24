// Loaded only when a reader opens an Axon skin fit study.
import { Color, MeshBasicMaterial } from 'three';

export const fitScale = [
  { inches: 0, color: '#263e7d' },
  { inches: 1 / 16, color: '#4388be' },
  { inches: 3 / 8, color: '#40a78f' },
  { inches: 3 / 4, color: '#efbf68' },
  { inches: 1.5, color: '#bd4b36' },
];

export const fitLimitIn = fitScale.at(-1).inches;

export function fitFingerprint(geometry) {
  const { position } = geometry.attributes;
  let hash = 2166136261;
  // Quantize the frozen metre coordinates to 0.004 in before the revision check.
  for (let i = 0; i < position.array.length; i++)
    hash = Math.imul(hash ^ Math.round(position.array[i] * 10000), 16777619);
  for (const i of geometry.index.array) hash = Math.imul(hash ^ i, 16777619);
  return (hash >>> 0).toString(16);
}

export async function loadSkinFit(model, tier, signal) {
  const url = new URL('./assets/skin-wrap-gap-' + model.name + '-' + tier + '.json', import.meta.url);
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Skin fit measurements returned HTTP ' + response.status);
    const data = await response.json();
    if (data.name !== model.name || data.tier !== tier || data.colorLimitIn !== fitLimitIn)
      throw new Error('Skin fit measurements belong to a different model');
    const parts = new Map(model.parts.filter((p) => p.layer === 'skin').map((p) => [p.id, p]));
    const distances = new Map();
    for (const { id, bytes, fingerprint } of data.parts) {
      const part = parts.get(id);
      const values = atob(bytes);
      if (!part || values.length !== part.mesh.geometry.attributes.position.count ||
          fitFingerprint(part.mesh.geometry) !== fingerprint)
        throw new Error('Skin fit measurements belong to an older skin surface');
      distances.set(id, values);
    }
    return { data, distances };
  } catch (error) {
    if (!signal.aborted) error.assetURL = url.href;
    throw error;
  }
}

export function createHeatMaterial() {
  const material = new MeshBasicMaterial();
  const colors = fitScale.map((step) => new Color(step.color));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.axonFitColors = { value: colors };
    shader.vertexShader = 'attribute float axonSkinGap;\nvarying float axonGap, axonFitShape;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        axonGap = axonSkinGap;
        axonFitShape = abs(normalize(normalMatrix * normal).z);`);
    shader.fragmentShader = 'uniform vec3 axonFitColors[5];\nvarying float axonGap, axonFitShape;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (axonGap < 0.0) diffuseColor.rgb = vec3(0.27, 0.29, 0.29);
        else if (axonGap < 0.0625) diffuseColor.rgb = mix(axonFitColors[0], axonFitColors[1], axonGap * 16.0);
        else if (axonGap < 0.375) diffuseColor.rgb = mix(axonFitColors[1], axonFitColors[2], (axonGap - 0.0625) / 0.3125);
        else if (axonGap < 0.75) diffuseColor.rgb = mix(axonFitColors[2], axonFitColors[3], (axonGap - 0.375) / 0.375);
        else diffuseColor.rgb = mix(axonFitColors[3], axonFitColors[4], (axonGap - 0.75) / 0.75);
        // Mild view-facing shading preserves surface relief without a light-dependent scale.
        diffuseColor.rgb *= mix(0.84, 1.0, axonFitShape);`);
  };
  return material;
}
