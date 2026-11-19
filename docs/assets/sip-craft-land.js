import * as T from 'three';
import { seeded } from './sip-craft-sky.js';

// RGB stores two tangent slopes and grain height. Both derivatives wrap at the
// tile boundary. Mipmaps filter the finest grain out as a cliff recedes.
export function stoneTexture() {
  const size = 256,
    heights = new Float32Array(size * size),
    rng = seeded(8683);
  for (const cells of [4, 8, 16, 32, 64, 128, 256]) {
    const grid = Float32Array.from({ length: cells * cells }, rng);
    const get = (x, y) => grid[(x % cells) + cells * (y % cells)];
    for (let i = 0; i < heights.length; i++) {
      const x = ((i % size) * cells) / size,
        y = ((i >> 8) * cells) / size,
        a = Math.floor(x),
        b = Math.floor(y);
      let u = x - a,
        v = y - b;
      u *= u * (3 - 2 * u);
      v *= v * (3 - 2 * v);
      heights[i] +=
        T.MathUtils.lerp(
          T.MathUtils.lerp(get(a, b), get(a + 1, b), u),
          T.MathUtils.lerp(get(a, b + 1), get(a + 1, b + 1), u),
          v,
        ) * Math.pow(4 / cells, 0.66);
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < heights.length; i++) {
    const x = i % size,
      y = i >> 8;
    data[4 * i] = T.MathUtils.clamp(128 + (heights[((x + 1) % size) + y * size] - heights[i]) * 1100, 0, 255);
    data[4 * i + 1] = T.MathUtils.clamp(
      128 + (heights[x + ((y + 1) % size) * size] - heights[i]) * 1100,
      0,
      255,
    );
    data[4 * i + 2] = Math.min(255, heights[i] * 118);
    data[4 * i + 3] = 255;
  }
  const tex = new T.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function buildLand(scene, u, grain) {
  const rng = seeded(423);
  function material(isSand) {
    const m = new T.MeshPhysicalMaterial({ roughness: 0.87, color: 0xffffff, vertexColors: true });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { grain: { value: grain }, seaTime: u.seaTime, storm: u.storm });
      s.vertexShader =
        'varying vec3 landP,landN;\n' +
        s.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
        landP=(modelMatrix*vec4(transformed,1.)).xyz;landN=normalize(mat3(modelMatrix)*objectNormal);`,
        );
      s.fragmentShader =
        `varying vec3 landP,landN;
        uniform sampler2D grain;uniform float seaTime,storm;
        vec3 tri(vec3 p,vec3 w){return texture2D(grain,p.zy).rgb*w.x+texture2D(grain,p.xz).rgb*w.y+texture2D(grain,p.xy).rgb*w.z;}
        ` +
        s.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
        vec3 w=pow(abs(normalize(landN)),vec3(4.));w/=max(.001,w.x+w.y+w.z);
        vec3 g=tri(landP*.78,w), micro=tri(landP*3.93+g.b*.25,w);
        float fracture=abs(fract(landP.x*.92+landP.z*.66+.15*g.b+landP.y*.22)-.5);
        float joint=1.-smoothstep(.004,.028+micro.b*.016,fracture);
        float shale=1.-smoothstep(.08,.48,abs(sin((landP.y+landP.z*.07+g.b*.07)*35.)));

        float dip=landP.y+.14*sin(landP.x*.74)+landP.z*.077+g.b*.10;
        float bedding=sin(dip*29.)*.5+.5;
        float wet=1.-smoothstep(.04,.36+storm*.16+.09*sin(seaTime*1.5+landP.x),landP.y+g.b*.08);
        float band=smoothstep(-.15,.06,landP.y)*(1.-smoothstep(.14,.42,landP.y+g.b*.12));
        diffuseColor.rgb*=.59+g.b*.46+micro.b*.38;
        ${
          isSand
            ? 'diffuseColor.rgb*=mix(1.,.48,wet);'
            : `diffuseColor.rgb*=(.85+.11*bedding+.20*smoothstep(.44,.60,g.b))*(1.-joint*.23)*(1.-shale*.18);
        diffuseColor.rgb+=vec3(.077,.065,.046)*smoothstep(.52,.65,g.b)*micro.b;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.36,.57,.32),band*.83);
        diffuseColor.rgb*=1.-.42*wet;`
        }`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor=mix(.91,.17+.10*g.b,wet);',
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
        vec2 slopes=(g.rg-.5)*.64+(micro.rg-.5)*.41;
        vec3 localSlope=vec3(slopes.y*w.x+slopes.x*(w.y+w.z),slopes.y*(w.x+w.z),slopes.x*w.x+slopes.y*w.y);
        normal=normalize(normal+mat3(viewMatrix)*localSlope);`,
          );
    };
    m.customProgramCacheKey = () => (isSand ? 'tidelight-sand' : 'tidelight-rock');
    return m;
  }
  const rock = material(false),
    sand = material(true);
  function geometry(vertices, colors, indices, mat) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mesh = new T.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  // Each ring pair marks a bedding plane. Coherent fractures run through
  // successive layers, with smaller ledges eroding independently.
  function promontory(cx, cz, rx, rz, height, seed, distant = false) {
    const n = distant ? 92 : 112,
      layers = distant ? 16 : 27,
      verts = [],
      cols = [],
      idx = [];
    const palette = ['#9b8872', '#ae9c82', '#a18e77', '#b2a18a', '#9c8b79', '#a4937f'].map(
      (c) => new T.Color(c),
    );
    const topColor = new T.Color(distant ? '#69704d' : '#868057');
    for (let j = 0; j <= layers; j++) {
      const k = j / layers,
        cap = j === layers;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const fault =
          0.063 * Math.sin(3 * a + seed) +
          0.055 * Math.cos(5 * a - seed) +
          0.043 * Math.sin(9 * a + seed) +
          0.023 * Math.cos(18 * a - seed);
        const cleft = Math.pow(Math.max(0, Math.cos(a * 11 + 0.8 * Math.sin(3 * a) + k * 0.85)), 12);
        const ledge = (0.004 + 0.011 * Math.sin(a * 5 + seed)) * Math.sin(j * 1.78 + Math.sin(a * 2.0));
        const ridge = ledge + 0.029 * Math.sin(a * 21 + Math.sin(k * 2.2)) - 0.084 * cleft;
        const r = cap ? 0.02 : 1.15 - k * 0.24 + fault + ridge;
        const x = cx + rx * Math.cos(a) * r,
          z = cz + rz * Math.sin(a) * r;
        const uplift = distant
          ? height * (0.19 * Math.sin(3 * a + seed) + 0.16 * Math.sin(5 * a + 1))
          : 0.09 * Math.sin(4 * a + seed);
        const y =
          -0.82 +
          (height + 0.82) * Math.min(1, j / (layers - 1)) +
          (cap ? 0 : uplift * k) +
          0.035 * Math.sin(i * 1.6 + j * 0.33);
        verts.push(x, y, z);
        const col = j >= layers - 1 ? topColor : palette[Math.floor((j + seed) % palette.length)];
        const v = 0.89 + 0.2 * rng();
        cols.push(col.r * v, col.g * v, col.b * v);
        if (j) {
          const b = j * n + i,
            c = j * n + ((i + 1) % n);
          idx.push(b - n, b, c - n, b, c, c - n);
        }
      }
    }
    for (let i = 1; i < n - 1; i++) idx.push(n * layers, n * layers + i + 1, n * layers + i);
    return geometry(verts, cols, idx, rock);
  }
  promontory(-2.55, -1.85, 4.55, 3.9, 2.75, 2);
  promontory(4.4, -2.25, 1.72, 1.45, 0.67, 4);
  promontory(-27, -17, 13, 9, 8.2, 7, true);
  promontory(48, -31, 17, 11, 5.9, 3, true);
  promontory(-13, -23, 1.75, 2.1, 3.7, 8, true);
  promontory(-10, -25, 1.06, 1.3, 2.15, 11, true);
  promontory(-46, -47, 22, 14, 11.6, 5, true);
  promontory(54, -70, 29, 14, 6.6, 1, true);
  // Fallen bedding planes and fractured buttresses interrupt the main face.
  // Each block has an uneven crown, a broken corner and a short talus apron.
  const blocks = [],
    blockColors = [],
    blockIndices = [];
  function outcrop(cx, cy, cz, a, width, height, depth) {
    const sides = 7,
      base = blocks.length / 3,
      tones = [0.73, 0.9, 0.84, 1.08];
    const facets = Array.from({ length: sides }, () => 0.76 + 0.35 * rng());
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < sides; i++) {
        const theta = (i / sides) * Math.PI * 2,
          r = facets[i] * (j === 3 ? 0.69 : 1.0);
        const x = Math.cos(theta) * width * r,
          z = Math.sin(theta) * depth * r;
        blocks.push(
          cx + x * Math.cos(a) - z * Math.sin(a),
          cy + height * (j / 3 + 0.068 * Math.cos(i * 2.7)),
          cz + x * Math.sin(a) + z * Math.cos(a),
        );
        const f = tones[j] * (0.91 + 0.14 * rng());
        blockColors.push(0.337 * f, 0.267 * f, 0.205 * f);
        const v = base + j * sides + i,
          n = base + j * sides + ((i + 1) % sides);
        if (j) blockIndices.push(v - sides, v, n - sides, v, n, n - sides);
        if (j === 3 && i > 1) blockIndices.push(base + j * sides, v, v - 1);
      }
  }
  for (let i = 0; i < 88; i++) {
    const a = rng() * Math.PI * 2,
      r = 1.04 + 0.09 * rng();
    const x = -2.55 + Math.cos(a) * 4.55 * r,
      z = -1.85 + Math.sin(a) * 3.9 * r;
    const h = 0.18 + 2.12 * rng() ** 2;
    outcrop(x, -0.16, z, a, 0.24 + rng() * 0.37, h, 0.18 + rng() * 0.46);
  }
  geometry(blocks, blockColors, blockIndices, rock);
  // The original cut shelf and pebble bed sit below the open swells. A
  // submerged apron rounds off the visible edge as the shelf falls into blue water.
  const shelfVertices = [],
    shelfColors = [],
    shelfIndices = [];
  const shelfTone = new T.Color('#a39d81');
  function seabed(x, z) {
    const edge = Math.max(Math.abs(x) / 7.85, Math.abs(z) / 5.88);
    return (
      -0.76 -
      0.11 * Math.sin(x * 1.6 + z * 0.53) -
      0.065 * Math.sin(z * 2.7) -
      3.6 * T.MathUtils.smoothstep(edge, 0.85, 1.25)
    );
  }
  for (let j = 0; j <= 52; j++)
    for (let i = 0; i <= 68; i++) {
      const x = (i / 68 - 0.5) * 19.8,
        z = (j / 52 - 0.5) * 15;
      shelfVertices.push(x, seabed(x, z), z);
      const f = 0.79 + 0.17 * rng();
      shelfColors.push(shelfTone.r * f, shelfTone.g * f, shelfTone.b * f);
      const b = j * 69 + i;
      if (i && j) shelfIndices.push(b - 70, b - 1, b, b - 70, b, b - 69);
    }
  geometry(shelfVertices, shelfColors, shelfIndices, sand).castShadow = false;
  const pebbles = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    new T.MeshStandardMaterial({ roughness: 0.59 }),
    310,
  );
  const pebble = new T.Object3D(),
    pebbleTone = new T.Color();
  for (let i = 0; i < pebbles.count; i++) {
    const x = (rng() - 0.5) * 15.3,
      z = (rng() - 0.5) * 11.3,
      r = 0.035 + 0.14 * rng() ** 2;
    pebble.position.set(x, seabed(x, z) + r * 0.17, z);
    pebble.rotation.set(0.32 * rng(), 6.28 * rng(), 0);
    pebble.scale.set(1.3 * r, 0.45 * r, r);
    pebble.updateMatrix();
    pebbles.setMatrixAt(i, pebble.matrix);
    pebbles.setColorAt(
      i,
      pebbleTone.setHSL(0.085 + 0.065 * rng(), 0.1 + 0.16 * rng(), 0.32 + 0.34 * rng(), T.SRGBColorSpace),
    );
  }
  pebbles.receiveShadow = true;
  scene.add(pebbles);
  // A shelving foreshore sweeps round the lee of the vineyard. Two hollows
  // cut through its ledge, intersecting level pool surfaces above mean tide.
  const vx = [],
    colors = [],
    ix = [],
    pools = [
      [-5.5, 2.05, 0.47],
      [-4.15, 2.52, 0.32],
    ];
  const beachColor = new T.Color('#c4ae89');
  for (let j = 0; j <= 28; j++)
    for (let i = 0; i <= 80; i++) {
      const x = -8 + (i / 80) * 9,
        z = -0.2 + (j / 28) * 5;
      const edge = 3.65 - 0.067 * (x + 4.8) ** 2 + 0.24 * Math.sin(x * 1.6);
      let y =
        (edge - z) * 0.23 +
        0.038 * Math.sin(x * 7 + z * 5) -
        0.85 * (1 - T.MathUtils.smoothstep(x, -8, -6.7)) -
        0.8 * T.MathUtils.smoothstep(x, -0.7, 1);
      for (const [px, pz, r] of pools) y -= 0.45 * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (r * r));
      vx.push(x, y, z);
      colors.push(beachColor.r, beachColor.g, beachColor.b);
      if (i && j) {
        const b = j * 81 + i;
        ix.push(b - 82, b - 1, b, b - 82, b, b - 81);
      }
    }
  geometry(vx, colors, ix, sand);
  const poolMat = new T.MeshPhysicalMaterial({
    color: '#56726a',
    metalness: 0.34,
    roughness: 0.085,
    clearcoat: 1,
  });
  for (const [x, z, r] of pools) {
    const pool = new T.Mesh(new T.CircleGeometry(r * 1.26, 40), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.185, z);
    scene.add(pool);
  }
  const object = new T.Object3D(),
    color = new T.Color();
  function stones(count, shell) {
    const batch = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, shell ? 0 : 1),
      new T.MeshStandardMaterial({ roughness: shell ? 0.83 : 0.53 }),
      count,
    );
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2,
        tower = i % 4 === 0;
      const r = (tower ? 1.72 : 4.55) * (1.02 + 0.17 * rng());
      const x = (tower ? 4.4 : -2.55) + Math.cos(a) * r,
        z = (tower ? -2.25 : -1.85) + Math.sin(a) * r * 0.85;
      const s = shell ? 0.018 + rng() * 0.035 : 0.075 + rng() ** 2 * 0.36;
      object.position.set(x, shell ? 0.09 + rng() * 0.16 : -0.04 + rng() * 0.1, z);
      object.scale.set(s * 1.42, s * 0.74, s);
      object.rotation.set(rng() * 0.42, a, rng() * 0.36);
      object.updateMatrix();
      batch.setMatrixAt(i, object.matrix);
      batch.setColorAt(
        i,
        color.setHSL(
          0.09 + rng() * 0.055,
          0.12 + rng() * 0.13,
          shell ? 0.53 + rng() * 0.21 : 0.24 + rng() * 0.25,
          T.SRGBColorSpace,
        ),
      );
    }
    batch.castShadow = !shell;
    batch.receiveShadow = true;
    scene.add(batch);
    return batch;
  }
  stones(380, false);
  const barnacles = stones(750, true);
  // Instanced tussocks share a bent, tapered blade fan. Only the tips move.
  const blades = [],
    bladeColors = [];
  for (let i = 0; i < 12; i++) {
    const a = rng() * 6.28,
      x = Math.cos(a) * rng() * 0.13,
      z = Math.sin(a) * rng() * 0.13,
      h = 0.13 + rng() * 0.32;
    blades.push(x - 0.013, 0, z, x + 0.013, 0, z, x + Math.cos(a) * 0.1, h, z + Math.sin(a) * 0.12);
    bladeColors.push(0.1, 0.12, 0.037, 0.13, 0.14, 0.045, 0.46, 0.43, 0.22);
  }
  const bg = new T.BufferGeometry();
  bg.setAttribute('position', new T.Float32BufferAttribute(blades, 3));
  bg.setAttribute('color', new T.Float32BufferAttribute(bladeColors, 3));
  bg.computeVertexNormals();
  const grassMat = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 0.96 });
  grassMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { seaTime: u.seaTime, storm: u.storm });
    s.vertexShader =
      'uniform float seaTime,storm;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      transformed.x+=position.y*position.y*(.4+storm*1.9)*sin(seaTime*2.+instanceMatrix[3].x*1.4+instanceMatrix[3].z);`,
      );
  };
  const grass = new T.InstancedMesh(bg, grassMat, 1150);
  for (let i = 0; i < grass.count; i++) {
    const a = rng() * 6.28,
      r = 0.7 + rng() * 0.18;
    object.position.set(-2.55 + 4.55 * Math.cos(a) * r, 2.76, -1.85 + 3.9 * Math.sin(a) * r);
    object.rotation.set(0, rng() * 6.28, 0);
    object.scale.setScalar(0.4 + rng() * 0.64);
    object.updateMatrix();
    grass.setMatrixAt(i, object.matrix);
  }
  scene.add(grass);
  return (mobile) => {
    grass.count = mobile ? 470 : 1150;
    barnacles.visible = !mobile;
  };
}
