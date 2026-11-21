// Tileable material studies drawn from weave, pores, grain and brushed-metal
// functions. RG encode tangent-space slopes, B roughness variation, A cavity AO.
import * as T from 'three';
export { setModelDetail } from './model-tier.js';

const tiles = new Map();
const profiles = {
  skin: [38, 0.027],
  hair: [14, 0.12],
  silk: [27, 0.09],
  cotton: [22, 0.17],
  wool: [21, 0.22],
  gold: [24, 0.11],
  leather: [13, 0.22],
  metal: [19, 0.11],
};

function tile(kind, size) {
  const key = kind + size;
  if (tiles.has(key)) return tiles.get(key);
  const pixels = new Uint8Array(size * size * 4);
  const phase = 2 * Math.PI;
  function grain(x, y) {
    const a = x * phase,
      b = y * phase;
    const warp = Math.sin(4 * a + 3 * b) * 0.4 + Math.sin(3 * a - 5 * b) * 0.2;
    if (kind === 'skin' || kind === 'leather') {
      const pores = Math.abs(
        Math.sin(5 * a + 0.85 * Math.cos(3 * b)) * Math.cos(6 * b + 0.7 * Math.sin(4 * a)),
      );
      const crease = Math.pow(1 - pores, kind === 'skin' ? 12 : 7);
      return 0.52 - crease * 0.42 + 0.07 * Math.sin(11 * a + 7 * b + warp);
    }
    if (kind === 'metal' || kind === 'hair')
      return 0.5 + 0.2 * Math.sin(13 * a + warp + 0.3 * Math.sin(b)) + 0.12 * Math.cos(7 * a + 3 * b);
    const warpThread = Math.cos(8 * a + 0.18 * Math.sin(7 * b));
    const weftThread = Math.cos(8 * b + 0.18 * Math.sin(7 * a));
    return (
      0.48 +
      0.19 * (warpThread + weftThread) +
      0.11 * Math.sin(4 * a) * Math.sin(4 * b) * (warpThread - weftThread)
    );
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        h = grain(u, v),
        i = 4 * (y * size + x),
        eps = 1 / 256;
      const dx = (grain(u + eps, v) - grain(u - eps, v)) * 2.0;
      const dy = (grain(u, v + eps) - grain(u, v - eps)) * 2.0;
      pixels[i] = T.MathUtils.clamp(128 - dx * 127, 0, 255);
      pixels[i + 1] = T.MathUtils.clamp(128 - dy * 127, 0, 255);
      pixels[i + 2] = Math.round(65 + h * 145);
      pixels[i + 3] = Math.round(190 + h * 65);
    }
  const tex = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  tex.name = kind + ' surface grain ' + size;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tiles.set(key, tex);
  return tex;
}

export function detailMaterial(material, kind) {
  if (material.userData.surfaceDetail || !profiles[kind]) return material;
  const [frequency, strength] = profiles[kind];
  const data = {
    kind,
    map: { value: null },
    setTier(high) { this.map.value = tile(kind, high ? 128 : 32); },
  };
  material.userData.surfaceDetail = data;
  const prior = material.onBeforeCompile,
    priorKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    prior.call(this, shader, renderer);
    // Isolated authoring views that never select a tier use the full finish.
    if (!data.map.value) data.setTier(true);
    shader.uniforms.sipSurfaceTile = data.map;
    shader.vertexShader =
      'varying vec3 sipRest;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsipRest = position;',
      );
    shader.fragmentShader =
      'uniform sampler2D sipSurfaceTile;\nvarying vec3 sipRest;\n' + shader.fragmentShader;
    const fabric = ['silk', 'wool', 'cotton', 'gold'].includes(kind);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Oblique in bind space, including the return across seams, with hardware mip filtering.
        vec2 sipUV=vec2(sipRest.x+.59*sipRest.z,sipRest.y-.41*sipRest.z)*${frequency.toFixed(1)};
        vec4 sipDetail=texture2D(sipSurfaceTile,sipUV);
        roughnessFactor=clamp(roughnessFactor+(sipDetail.b-.5)*.16,.045,1.);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec3 sipDPx=dFdx(-vViewPosition), sipDPy=dFdy(-vViewPosition);
        vec2 sipUVx=dFdx(sipUV),sipUVy=dFdy(sipUV);
        vec3 sipS=cross(sipDPy,normal)*sipUVx.x+cross(normal,sipDPx)*sipUVy.x;
        vec3 sipT=cross(sipDPy,normal)*sipUVx.y+cross(normal,sipDPx)*sipUVy.y;
        float sipScale=inversesqrt(max(1.e-12,max(dot(sipS,sipS),dot(sipT,sipT))));
        normal=normalize(normal+(sipS*(2.*sipDetail.r-1.)+sipT*(2.*sipDetail.g-1.))*sipScale*${strength.toFixed(2)});`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse*=mix(1.,sipDetail.a,${kind === 'skin' ? '0.22' : '0.80'});
        ${
          kind === 'skin'
            ? `#if NUM_DIR_LIGHTS > 0
          float sipNL=dot(normal,directionalLights[0].direction);
          float sipWrap=max(0.,(sipNL+.36)/1.36)-max(0.,sipNL);
          reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*vec3(.53,.23,.14)*sipWrap;
        #endif`
            : ''
        }
        ${fabric ? 'reflectedLight.indirectSpecular+=diffuseColor.rgb*.08*pow(1.-abs(dot(normal,normalize(vViewPosition))),3.);' : ''}`,
      );
  };
  material.customProgramCacheKey = () => priorKey + '-surface-v1-' + kind;
  material.needsUpdate = true;
  return material;
}
