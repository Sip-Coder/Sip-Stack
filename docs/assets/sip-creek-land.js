// All distances are metres. Positive z feeds the spring, negative z drains to the vineyard.
import * as T from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export const { lerp, smoothstep, clamp } = T.MathUtils;
export const V = (x, y, z) => new T.Vector3(x, y, z);
export const tau = Math.PI * 2;
export function seeded(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
export const channel = (z) => 1.18 * Math.sin(z * 0.24) + 0.33 * Math.cos(z * 0.61);
export const breadth = (z) => 2.05 + 0.35 * Math.sin(z * 0.45) + 0.18 * Math.cos(z * 0.8);
export const surface = (z) =>
  0.021 * (z + 22) + 0.32 * smoothstep(z, 6.8, 7.5) + 0.23 * smoothstep(z, 1, 1.55);
export function ground(x, z) {
  const d = Math.abs(x - channel(z)) - breadth(z);
  const wrinkle =
    0.11 * Math.sin(x * 1.8 + z * 0.57) * Math.cos(z * 1.4) + 0.12 * Math.sin(x * 0.51 - z * 0.7);
  return (
    surface(z) -
    0.62 +
    1.08 * smoothstep(d, -1.1, 0.85) +
    smoothstep(d, 0.6, 8) * (1.05 + 0.46 * Math.sin(z * 0.5)) +
    wrinkle +
    0.19 * Math.sin(z * 0.76) * smoothstep(-d, 0.5, 1.9)
  );
}

// Isolated boulders split the current at the two shelves and the crossing.
export const riffles = [
  [-1.28, 7.2, 0.85],
  [0.48, 7.5, 0.78],
  [1.6, 7.1, 0.68],
  [-0.95, 1.4, 0.73],
  [0.66, 1.6, 0.61],
  [-1.48, -1.8, 0.65],
  [-0.43, -2.15, 0.71],
  [0.58, -2.52, 0.72],
  [1.59, -2.89, 0.66],
];
export function bedrock(x, z, r) {
  return { x: x + channel(z), z, r };
}
export const obstacles = riffles.map(([x, z, r]) => bedrock(x, z, r));

// A world-space baked contact term keeps stones and roots grounded on all tiers.
export function contacts() {
  const size = 512,
    data = new Uint8Array(size * size).fill(255),
    scale = size / 48;
  const texture = new T.DataTexture(data, size, size, T.RedFormat);
  texture.minFilter = texture.magFilter = T.LinearFilter;
  function stamp(x, z, rx, rz, strength) {
    const u = (x + 24) * scale,
      v = (z + 30) * scale,
      a = rx * scale,
      b = rz * scale;
    for (let j = Math.max(0, Math.floor(v - b)); j < Math.min(size, v + b); j++)
      for (let i = Math.max(0, Math.floor(u - a)); i < Math.min(size, u + a); i++) {
        const r = ((i - u) / a) ** 2 + ((j - v) / b) ** 2;
        if (r < 1) data[j * size + i] = Math.min(data[j * size + i], 255 * (1 - strength * (1 - r) ** 1.75));
      }
  }
  texture.needsUpdate = true;
  return { value: texture, stamp };
}
export function landscape(scene, rng, soil, rock, setDensity, contact) {
  const positions = [],
    colors = [],
    indices = [];
  const bed = new T.Color('#80775d'),
    sand = new T.Color('#bd9f76'),
    mud = new T.Color('#514532'),
    grass = new T.Color('#76753e');
  const tint = new T.Color(),
    nx = 160,
    nz = 200;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      // Concentrate samples along the banks, allow a much wider forest floor beyond.
      const u = (i / nx) * 2 - 1,
        z = lerp(-49, 23, j / nz),
        x = channel(z) + u * 8 + u ** 5 * 39;
      const y = ground(x, z),
        h = y - surface(z);
      positions.push(x, y, z);
      tint
        .copy(bed)
        .lerp(sand, smoothstep(h, -0.5, -0.12))
        .lerp(mud, smoothstep(h, -0.1, 0.34))
        .lerp(grass, smoothstep(h + 0.24 * Math.sin(z * 1.8 + x), 0.4, 1.15));
      colors.push(tint.r, tint.g, tint.b);
      if (i < nx && j < nz) {
        const a = j * (nx + 1) + i,
          b = a + nx + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const land = new T.Mesh(geo, soil);
  land.receiveShadow = true;
  scene.add(land);

  const dummy = new T.Object3D();
  const palette = ['#87847c', '#716962', '#bab29c', '#817362', '#797e72', '#a29b8a'];
  const stoneFamilies = [];
  // Three differently fractured families avoid a repeated silhouette.
  for (let k = 0; k < 3; k++) {
    function weathered(detail) {
      const raw = new T.IcosahedronGeometry(1, detail);
      raw.deleteAttribute('normal');
      raw.deleteAttribute('uv');
      const shape = mergeVertices(raw);
      raw.dispose();
      const p = shape.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const n =
          1 + 0.09 * Math.sin(x * 6 + k) * Math.cos(z * 5 - y * 4) + 0.065 * Math.cos(y * 8 + z * 4 + k);
        p.setXYZ(i, x * n + 0.11 * y, Math.sign(y) * Math.pow(Math.abs(y), 0.8) * n, z * n);
      }
      shape.computeVertexNormals();
      return shape;
    }
    const large = new T.InstancedMesh(weathered(4), rock, 95);
    const distant = new T.InstancedMesh(weathered(2), rock, 95);
    const placements = [];
    const gravel = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), rock, 1255);
    for (let i = 0; i < large.count + gravel.count; i++) {
      let z = lerp(-24, 16, rng()),
        x = channel(z) + (rng() - 0.5) * 8.4;
      let r = 0.035 + 0.13 * rng() ** 2,
        lift = 0.2;
      if (i < 95) {
        r = 0.19 + 0.64 * rng() ** 2;
        x = channel(z) + (rng() < 0.5 ? -1 : 1) * (breadth(z) + lerp(-0.55, 1.5, rng()));
      }
      if (k === 0 && i < obstacles.length) {
        ({ x, z, r } = obstacles[i]);
        lift = 0.73;
      }
      if (x > 1.95 && x < 5.9 && z < -11.4 && z > -16.1) x += 4;
      const y = ground(x, z);
      dummy.position.set(x, lift === 0.73 ? surface(z) - 0.16 : y + r * lift, z);
      dummy.scale.set(r * (1.13 + rng() * 0.55), r * (0.57 + rng() * 0.3), r * (0.83 + rng() * 0.45));
      dummy.rotation.set(rng() * 0.36, rng() * tau, rng() * 0.28);
      dummy.updateMatrix();
      const mesh = i < 95 ? large : gravel,
        index = i < 95 ? i : i - 95;
      mesh.setMatrixAt(index, dummy.matrix);
      contact.stamp(x + 0.08 * r, z + 0.09 * r, r * 2.1, r * 1.7, i < 95 ? 0.81 : 0.49);
      mesh.setColorAt(index, tint.set(palette[Math.floor(rng() * palette.length)]));
      if (i < 95)
        placements.push({
          matrix: dummy.matrix.clone(),
          point: dummy.position.clone(),
          color: tint.clone(),
          near: false,
        });
    }
    large.castShadow = distant.castShadow = true;
    // Each batch can receive any of these placements as the camera travels.
    large.frustumCulled = distant.frustumCulled = false;
    distant.count = 0;
    distant.setColorAt(0, tint);
    stoneFamilies.push({ large, distant, placements });
    for (const mesh of [large, distant, gravel]) {
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    setDensity(gravel, [0.42, 0.72, 1]);
  }
  // Folded ridgelines recede in actual scene fog. The valley stays open downstream.
  for (let row = 0; row < 3; row++) {
    const verts = [],
      idx = [],
      cols = [];
    for (let j = 0; j <= 12; j++)
      for (let i = 0; i <= 120; i++) {
        const x = i * 1.6 - 96,
          depth = j / 12,
          z = -31 - row * 12 - depth * 12;
        const peaks =
          3.8 +
          row * 1.95 +
          2.4 * Math.sin(x * 0.12 + row) +
          1.7 * Math.sin(x * 0.23 + row * 2) +
          0.53 * Math.sin(x * 0.64);
        const y =
          -1 +
          peaks * Math.sin(depth * 2.1) +
          1.1 * Math.cos(x * 0.52 + depth * 5) * depth +
          0.35 * Math.sin(x * 1.14 + depth * 6) * depth;
        verts.push(x, y, z);
        tint
          .set(['#506047', '#61715e', '#758379'][row])
          .multiplyScalar(0.82 + 0.19 * Math.sin(x * 0.31 + depth * 3));
        cols.push(tint.r, tint.g, tint.b);
        if (i < 120 && j < 12) {
          const a = j * 121 + i;
          idx.push(a, a + 1, a + 121, a + 1, a + 122, a + 121);
        }
      }
    const hill = new T.BufferGeometry();
    hill.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    hill.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    hill.setIndex(idx);
    hill.computeVertexNormals();
    scene.add(new T.Mesh(hill, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  }
  const last = V(Infinity, 0, 0);
  let oldTier = -1;
  return function updateLOD(camera, tier) {
    if (tier === oldTier && last.distanceToSquared(camera.position) < 0.85) return;
    oldTier = tier;
    last.copy(camera.position);
    for (const { large, distant, placements } of stoneFamilies) {
      large.count = distant.count = 0;
      for (const p of placements) {
        const limit = (tier === 2 ? 14 : tier === 1 ? 9 : 5) + (p.near ? 1 : 0);
        p.near = p.point.distanceToSquared(last) < limit * limit;
        const mesh = p.near ? large : distant,
          index = mesh.count++;
        mesh.setMatrixAt(index, p.matrix);
        mesh.setColorAt(index, p.color);
      }
      large.instanceMatrix.needsUpdate = distant.instanceMatrix.needsUpdate = true;
      large.instanceColor.needsUpdate = distant.instanceColor.needsUpdate = true;
    }
  };
}
