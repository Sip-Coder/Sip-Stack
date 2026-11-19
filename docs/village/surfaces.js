// One periodic, mipmapped relief field. RGBA packs mineral colour, relief, porosity and cavity occlusion.
// A second projection at an incommensurate scale breaks repetitions across long walls.
import * as T from 'three';

function grainTexture() {
  const size = 256,
    bytes = new Uint8Array(size * size * 4);
  function noise(x, y, cells) {
    const ix = Math.floor(x * cells),
      iy = Math.floor(y * cells);
    const hash = (i, j) => {
      let h = Math.imul((i % cells) + 13, 374761393) ^ Math.imul((j % cells) + 71, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const a = x * cells - ix,
      b = y * cells - iy;
    const u = a * a * (3 - 2 * a),
      v = b * b * (3 - 2 * b);
    return T.MathUtils.lerp(
      T.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u),
      T.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u),
      v,
    );
  }
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = i / size,
        y = j / size,
        k = (i + j * size) * 4;
      const cloud = noise(x, y, 5) * 0.5 + noise(x, y, 13) * 0.31 + noise(x, y, 37) * 0.19;
      const grit = noise(x, y, 122),
        relief = noise(x, y, 41) * 0.46 + grit * 0.54;
      bytes.set(
        [
          255 * cloud,
          255 * relief,
          255 * (grit * 0.6 + cloud * 0.4),
          255 * (0.76 + 0.24 * Math.min(1, relief * 1.66)),
        ],
        k,
      );
    }
  const map = new T.DataTexture(bytes, size, size);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.anisotropy = 4;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}
const map = grainTexture();
export const breeze = { value: 0 };

export function surface(type) {
  const m = new T.MeshPhysicalMaterial({ roughness: type === 'tile' ? 0.71 : 0.91 });
  m.customProgramCacheKey = () => 'village-' + type;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.reliefMap = { value: map };
    shader.uniforms.breeze = breeze;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 surfacePos, surfaceAxis, localPoint;
      uniform float breeze;
    `,
      )
      .replace(
        '#include <project_vertex>',
        `
      vec4 samplePoint = vec4(transformed,1.);
      vec3 axis = objectNormal;
      #ifdef USE_INSTANCING
        samplePoint = instanceMatrix * samplePoint;
        mat3 basis=mat3(instanceMatrix);
        axis=basis*(axis/vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2])));
      #endif
      surfaceAxis = normalize(mat3(modelMatrix) * axis);
      surfacePos = (modelMatrix * samplePoint).xyz;
      localPoint = position;
      ${
        type === 'leaf' || type === 'grass'
          ? `
        float sway = sin(breeze*1.6 + surfacePos.x*1.3 + surfacePos.z)*.7 + sin(breeze*2.8 + surfacePos.x*2.5)*.3;
        transformed.x += sway * ${type === 'grass' ? '.38*pow(clamp(position.y,0.,1.),2.)' : '.09*(position.y+.6)'};
      `
          : ''
      }
      #include <project_vertex>
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 surfacePos, surfaceAxis, localPoint;
      uniform sampler2D reliefMap;
      vec4 field(vec3 p,vec3 w) {
        return texture2D(reliefMap,p.yz)*w.x + texture2D(reliefMap,p.zx)*w.y + texture2D(reliefMap,p.xy)*w.z;
      }
    `,
      )
      .replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      vec3 w = pow(abs(normalize(surfaceAxis)),vec3(5.)); w /= max(dot(w,vec3(1.)),.001);
      vec4 broad = field(surfacePos*.13,w);
      vec3 p = surfacePos * ${type === 'wood' ? 'vec3(1.7,.18,1.7)' : '1.12'} + broad.rrr*.15;
      vec4 detail = field(p,w);
      float grit = detail.g;
      diffuseColor.rgb *= (.66 + .58*broad.r + .20*detail.r) * (.87 + grit*.23);
      ${
        type === 'plaster'
          ? `
        vec3 edge = abs(localPoint);
        float corner = max(min(edge.x,edge.y),max(min(edge.y,edge.z),min(edge.x,edge.z)));
        float chips = smoothstep(.43,.492,corner) * smoothstep(.49,.69,detail.r+.14*grit);
        float damp = (1.-smoothstep(-.50,-.32+(.55-broad.r)*.6,localPoint.y)) * (.3+.7*broad.r);
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.37,.27,.175),chips*.84);
        diffuseColor.rgb *= vec3(1.) - damp * vec3(.39,.33,.29);
      `
          : ''
      }
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (detail.b-.5)*.31,.25,1.);
    `,
      )
      .replace(
        '#include <aomap_fragment>',
        `
      #include <aomap_fragment>
      reflectedLight.indirectDiffuse *= detail.a;
    `,
      )
      .replace(
        '#include <fog_fragment>',
        `
      #ifdef USE_FOG
        float haze=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth*(.68+1.15*exp(-max(0.,surfacePos.y)*.13)));
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,haze);
      #endif
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
      #include <normal_fragment_maps>
      vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
      vec3 rx = cross(dy,normal), ry = cross(normal,dx);
      float det = dot(dx,rx);
      normal = normalize(abs(det)*normal - sign(det)*.008*(dFdx(grit)*rx + dFdy(grit)*ry) + normal*1e-10);
    `,
      );
  };
  return m;
}
