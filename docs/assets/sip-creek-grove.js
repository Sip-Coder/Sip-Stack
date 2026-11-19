import * as T from 'three';
import { m, scaleSpec } from '../life/scale.js';
import { V, seeded, ground, channel, breadth, surface, tau, lerp } from './sip-creek-land.js';

// Bake a compound twig at load. Transparent margins and mipmapped leaf edges
// retain the holes between the leaves as the canopy recedes.
function twigMap(vine = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d'),
    rng = seeded(vine ? 630 : 184);
  function line(x, y, u, v, width, color) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(u, v);
    c.stroke();
  }
  function leaf(x, y, angle, length) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    const w = length * (vine ? 0.53 : 0.3),
      v = Math.floor(lerp(32, 62, rng()));
    c.fillStyle = 'hsl(' + lerp(55, 82, rng()) + ' 36% ' + v + '%)';
    c.beginPath();
    c.moveTo(0, 0);
    if (vine) {
      c.lineTo(-w * 0.9, -length * 0.22);
      c.lineTo(-w * 0.64, -length * 0.38);
      c.lineTo(-w, -length * 0.63);
      c.lineTo(-w * 0.33, -length * 0.69);
      c.lineTo(0, -length);
      c.lineTo(w * 0.32, -length * 0.69);
      c.lineTo(w, -length * 0.63);
      c.lineTo(w * 0.65, -length * 0.38);
      c.lineTo(w * 0.9, -length * 0.22);
    } else {
      c.bezierCurveTo(-w, -length * 0.32, -w * 0.68, -length * 0.72, 0, -length);
      c.bezierCurveTo(w * 0.72, -length * 0.69, w, -length * 0.38, 0, 0);
    }
    c.closePath();
    c.fill();
    line(0, 0, 0, -length * 0.89, 1, 'rgba(221,224,144,.52)');
    if (vine)
      for (const side of [-1, 1]) line(0, 0, side * w * 0.71, -length * 0.54, 0.8, 'rgba(208,214,136,.63)');
    c.restore();
  }
  line(130, 248, 118, 34, 4, '#6a6343');
  for (let j = 0; j < 7; j++)
    for (const sign of [-1, 1]) {
      const y = 222 - j * 27 + rng() * 11,
        span = (92 - j * 7) * (0.82 + rng() * 0.23),
        x = 128 - j * 1.4;
      line(x, y, x + sign * span, y - 37, 2.2, '#746b46');
      for (let k = 1; k <= 4; k++) {
        const u = k / 4,
          bx = x + sign * span * u,
          by = y - u * 37,
          sz = (vine ? 32 : 25) * (0.72 + rng() * 0.44);
        leaf(bx, by, sign * (0.34 + rng() * 0.48), sz);
        leaf(bx, by, sign * (1.6 + rng() * 0.72), sz);
      }
    }
  leaf(118, 43, 0.03, 29);
  const tex = new T.DataTexture(c.getImageData(0, 0, 256, 256).data, 256, 256);
  tex.flipY = true;
  tex.colorSpace = T.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
// Paint both levels of a feathered frond, including the serrations of the pinnae.
function frondMap(conifer) {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 256;
  const ctx = c.getContext('2d'),
    rng = seeded(conifer ? 1381 : 1301);
  function stem(x, y, xx, yy, color, w) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(xx, yy);
    ctx.stroke();
  }
  stem(97, 253, 94, 14, conifer ? '#675d48' : '#9b9c53', 3);
  for (let j = 1; j < 22; j++)
    for (const sign of [-1, 1]) {
      const u = j / 23,
        y = 251 - u * 232,
        l = (conifer ? 0.8 : 1) * 72 * Math.sin(Math.PI * u) ** 0.65 * (1 - 0.34 * u),
        xx = 95 + sign * l,
        yy = y - 18 - u * 12;
      const hue = conifer ? 95 : 76;
      stem(96, y, xx, yy, 'hsl(' + hue + ' 32% 38%)', 1.8);
      for (let k = 0; k < 14; k++) {
        const f = k / 14,
          x = 96 + sign * l * f,
          cy = lerp(y, yy, f),
          size = (2 + 6 * Math.sin(f * Math.PI)) * (conifer ? 1.75 : 1);
        for (const side of [-1, 1]) {
          ctx.fillStyle =
            'hsl(' + (hue + rng() * 12) + ' 35% ' + (conifer ? 24 + rng() * 17 : 32 + rng() * 29) + '%)';
          ctx.beginPath();
          ctx.moveTo(x, cy);
          ctx.lineTo(x + sign * (size + 3), cy + side * size * 0.83 - 2.4);
          ctx.lineTo(x + sign * 3, cy + side * 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  const tex = new T.DataTexture(ctx.getImageData(0, 0, 192, 256).data, 192, 256);
  tex.flipY = true;
  tex.colorSpace = T.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function plantMaterial(time, options, sway) {
  const m = new T.MeshStandardMaterial({ roughness: 0.92, side: T.DoubleSide, ...options });
  m.customProgramCacheKey = () => String(sway);
  m.onBeforeCompile = (s) => {
    s.uniforms.breeze = time;
    s.vertexShader =
      'uniform float breeze;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vec3 foot=instanceMatrix[3].xyz;
      float gust=sin(foot.z*.65+foot.x*.32+breeze*.94)+.34*sin(breeze*1.9+foot.x*1.8);
      transformed.x+=gust*${sway.toFixed(3)}*max(0.,position.y+.32);
      transformed.z+=gust*${(sway * 0.47).toFixed(3)}*max(0.,position.y+.32);`,
      );
  };
  return m;
}
export function grove(scene, rng, time, wood, setDensity, contact) {
  const transform = new T.Object3D(),
    up = V(0, 1, 0),
    delta = V(0, 0, 0),
    tint = new T.Color();
  function batch(geometry, material) {
    return { geometry, material, instances: [] };
  }
  function put(batch, x, y, z, sx, sy, sz, rx, ry, rz, color) {
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    transform.rotation.set(rx, ry, rz);
    transform.updateMatrix();
    batch.instances.push([transform.matrix.clone(), color]);
  }
  function limb(batch, a, b, r, color) {
    delta.subVectors(b, a);
    const length = delta.length();
    transform.position.copy(a).lerp(b, 0.5);
    transform.quaternion.setFromUnitVectors(up, delta.normalize());
    transform.scale.set(r, length, r);
    transform.updateMatrix();
    batch.instances.push([transform.matrix.clone(), color]);
  }
  function finish(batch, density, cast = false) {
    if (!batch.instances.length) return;
    const mesh = new T.InstancedMesh(batch.geometry, batch.material, batch.instances.length);
    // Nested, shuffled subsets retain detail on every tree at each density.
    if (density) {
      const shuffle = seeded(81326);
      for (let i = batch.instances.length - 1; i > 0; i--) {
        const j = Math.floor(shuffle() * (i + 1)),
          saved = batch.instances[i];
        batch.instances[i] = batch.instances[j];
        batch.instances[j] = saved;
      }
    }
    batch.instances.forEach(([m, c], i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint.set(c));
    });
    mesh.receiveShadow = true;
    mesh.castShadow = cast;
    scene.add(mesh);
    if (density) setDensity(mesh, density);
    return mesh;
  }
  const cylinder = new T.CylinderGeometry(0.74, 1, 1, 8);
  const branches = batch(cylinder, wood);
  const card = new T.PlaneGeometry(1, 1, 2, 2);
  // Give the card a shallow cup. Canopy light varies across a spray.
  const p = card.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -0.25 * p.getX(i) ** 2 + 0.12 * p.getY(i));
  card.computeVertexNormals();
  const foliage = batch(card, plantMaterial(time, { map: twigMap(), alphaTest: 0.32 }, 0.067));
  const palette = ['#b4b78a', '#c1bc83', '#bcc096', '#8caa86', '#c3ae70'];
  for (let i = 0; i < 96; i++) {
    const sign = i % 2 ? 1 : -1,
      z = lerp(-34, 17, rng());
    let x = channel(z) + sign * (breadth(z) + 2 + rng() ** 1.5 * 17);
    if (z < -7 && x > -13 && x < 17) continue; // orchard clearing
    const y = ground(x, z),
      h = lerp(3.4, 10.8, rng()),
      bark = ['#655548', '#796b57', '#574e41', '#978b6f'][i % 4];
    contact.stamp(x, z, h * 0.22, h * 0.2, 0.74);
    const base = V(x, y - 0.22, z),
      fork = V(x + rng() * 0.55, y + h * 0.54, z + 0.3 * rng());
    limb(branches, base, fork, h * 0.034, bark);
    for (let r = 0; r < 5; r++) {
      const a = (r * tau) / 5 + rng(),
        l = 0.6 + rng() * 1.25;
      const end = V(x + Math.cos(a) * l, 0, z + Math.sin(a) * l);
      end.y = ground(end.x, end.z) + 0.035;
      limb(branches, V(x, y + 0.29, z), end, h * 0.015, bark);
    }
    const color = palette[i % palette.length];
    for (let j = 0; j < 7; j++) {
      const a = j * 2.399 + rng() * 0.5,
        reach = h * (0.13 + rng() * 0.15);
      const joint = V(
        fork.x + Math.cos(a) * reach * 0.6,
        fork.y + h * 0.15,
        fork.z + Math.sin(a) * reach * 0.6,
      );
      const tip = V(x + Math.cos(a) * reach, y + h * (0.77 + rng() * 0.23), z + Math.sin(a) * reach);
      limb(branches, fork, joint, h * 0.016, bark);
      limb(branches, joint, tip, h * 0.009, bark);
      for (let k = 0; k < 9; k++) {
        const theta = rng() * tau,
          rad = (0.12 + rng()) * h * 0.13,
          sz = h * (0.16 + rng() * 0.09);
        put(
          foliage,
          tip.x + rad * Math.cos(theta),
          tip.y + (rng() - 0.5) * h * 0.17,
          tip.z + rad * Math.sin(theta),
          sz,
          sz * 1.25,
          sz,
          (rng() - 0.5) * 1.8,
          theta,
          (rng() - 0.5) * 1.8,
          color,
        );
      }
    }
  }
  // Spruce form a broken subcanopy behind the deciduous banks. Sloped whorls
  // overlap at the centre while the outer needles break up the silhouette.
  const spruce = batch(card, plantMaterial(time, { map: frondMap(true), alphaTest: 0.22 }, 0.042));
  for (let i = 0; i < 155; i++) {
    const distant = i > 57,
      z = distant ? -32 - rng() * 14 : lerp(-19, 16, rng());
    const x = distant ? lerp(-39, 39, rng()) : channel(z) + (i % 2 ? 1 : -1) * (breadth(z) + 5 + rng() * 11);
    if (!distant && z < -7 && x > -14 && x < 18) continue;
    const y = ground(x, z),
      height = lerp(4, 9.5, rng()),
      spread = height * (0.16 + rng() * 0.05);
    limb(branches, V(x, y - 0.15, z), V(x + 0.08, y + height * 0.86, z), height * 0.016, '#685c49');
    for (let level = 0; level < 9; level++) {
      const u = level / 9,
        cy = y + height * (0.16 + 0.8 * u),
        r = spread * (1 - u * 0.89);
      for (let k = 0; k < 7; k++) {
        const a = (k * tau) / 7 + level * 1.38 + rng() * 0.28;
        put(
          spruce,
          x + Math.sin(a) * r * 0.39,
          cy,
          z + Math.cos(a) * r * 0.39,
          r * 1.15,
          r * 1.97,
          r,
          0.94 + rng() * 0.23,
          a,
          0.08 * (rng() - 0.5),
          ['#83a18c', '#96a58d', '#c0be8c'][level % 3],
        );
        // Rotate each whorl in world space, then pitch the frond out from the trunk.
        const inst = spruce.instances.at(-1);
        transform.rotation.set(1.86 + rng() * 0.27, a, 0, 'YXZ');
        transform.updateMatrix();
        inst[0].copy(transform.matrix);
      }
    }
  }
  transform.rotation.order = 'XYZ';
  finish(spruce, [0.52, 0.78, 1], true);

  const logBase = V(-2.65, ground(-2.65, 8.75) + 0.23, 8.75),
    logTip = V(-1.51, surface(6.4) + 0.32, 6.4);
  limb(branches, logBase, logTip, 0.145, '#868074');
  limb(branches, logBase.clone().lerp(logTip, 0.62), V(-2.42, surface(7.3) + 0.56, 7.3), 0.067, '#887960');
  finish(branches, null, true);
  finish(foliage, [0.65, 0.82, 1], true);

  function grassGeometry() {
    const verts = [],
      cols = [];
    function triangle(a, b, c, shade) {
      verts.push(...a, ...b, ...c);
      for (const v of [shade * 0.72, shade, shade * 0.9]) cols.push(v * 0.87, v, v * 0.72);
    }
    const n = 11;
    for (let j = 0; j < n; j++) {
      const a = j * 2.399 + rng() * 0.3,
        dx = Math.cos(a),
        dz = Math.sin(a),
        l = 0.35 + rng() * 0.55;
      const point = (u, off = 0) => [dx * l * u - dz * off, u * (1.19 - 0.4 * u) * l, dz * l * u + dx * off];
      for (let k = 0; k < 7; k++) {
        const t = k / 7,
          u = (k + 1) / 7,
          w = 0.041 * (1 - t);
        triangle(point(t, -w), point(t, w), point(u), 0.9);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }
  for (const fern of [true, false]) {
    const frond = card.clone();
    frond.translate(0, 0.5, 0);
    const plants = fern
      ? batch(frond, plantMaterial(time, { map: frondMap(false), alphaTest: 0.24 }, 0.08))
      : batch(grassGeometry(), plantMaterial(time, { vertexColors: true }, 0.14));
    for (let i = 0; i < (fern ? 570 : 2200); i++) {
      const z = lerp(-23, 15, rng()),
        s = i % 2 ? 1 : -1,
        x = channel(z) + s * (breadth(z) + lerp(0.12, fern ? 3.8 : 5.3, rng()));
      if (x > 1.9 && x < 5.8 && z < -10 && z > -17) continue;
      const size = lerp(0.26, fern ? 1.35 : 0.97, rng()),
        shade = ['#b1ad62', '#688143', '#9b9b52'];
      if (fern) {
        for (let k = 0; k < 8; k++) {
          const a = k * 2.399 + i,
            len = size * (0.47 + rng() * 0.46);
          put(plants, x, ground(x, z) - 0.025, z, len * 0.61, len, len, 0, 0, 0, '#b4c091');
          transform.rotation.set(0.61 + rng() * 0.7, a, 0, 'YXZ');
          transform.updateMatrix();
          plants.instances.at(-1)[0].copy(transform.matrix);
        }
        transform.rotation.order = 'XYZ';
      } else put(plants, x, ground(x, z) - 0.03, z, size, size, size, 0, rng() * tau, 0, shade[i % 3]);
    }
    finish(plants, [0.48, 0.76, 1]);
  }
  const reeds = batch(new T.CylinderGeometry(0.65, 1, 1, 5), plantMaterial(time, {}, 0.022));
  const heads = batch(new T.CapsuleGeometry(0.03, 0.175, 3, 8), plantMaterial(time, {}, 0.055));
  for (let clump = 0; clump < 29; clump++) {
    const z0 = lerp(-20, 13, rng()),
      x0 = channel(z0) + (clump % 2 ? 1 : -1) * (breadth(z0) - 0.08);
    for (let i = 0; i < 5; i++) {
      const x = x0 + (rng() - 0.5) * 0.65,
        z = z0 + (rng() - 0.5) * 0.65,
        y = ground(x, z),
        h = 0.65 + rng() * 0.78;
      put(reeds, x, y + h * 0.5, z, 0.018, h, 0.018, 0, 0, 0, '#858953');
      if (i % 2 === 0) put(heads, x, y + h - 0.09, z, 1, 1, 1, 0, 0, 0, '#624a33');
    }
  }
  finish(reeds);
  finish(heads);

  // Gnarled cordons carry individually lobed leaves and tapered grape bunches.
  const posts = batch(new T.BoxGeometry(1, 1, 1), wood),
    cordons = batch(cylinder, wood);
  const vines = batch(card, plantMaterial(time, { map: twigMap(true), alphaTest: 0.32 }, 0.046));
  const grapes = batch(
    new T.SphereGeometry(1, 8, 6),
    new T.MeshPhysicalMaterial({ roughness: 0.51, clearcoat: 0.15 }),
  );
  const postHeight = m('creek', 2.12), berryRadius = m('creek', .009);
  for (let row = 0; row < 7; row++) {
    const z = -9.75 - Math.floor(row / 2) * 2.45 - (row % 2 ? 6.7 : 0);
    for (let j = 0; j < 13; j++) {
      const x = (row % 2 ? 4.1 : -19.3) + j * 1.28,
        y = ground(x, z);
      const tip = V(x + 0.12, y + 1.22, z);
      limb(cordons, V(x - 0.09, y, z), tip, 0.059, '#72573f');
      limb(cordons, tip, V(x + 1.38, ground(x + 1.38, z) + 1.18, z + 0.08), 0.036, '#736445');
      if (j % 3 === 0) put(posts, x, y + 0.94, z, m('creek', .125), postHeight, m('creek', .13), 0, 0.12, -0.042, '#c9ae80');
      for (let k = 0; k < 10; k++)
        put(
          vines,
          x + rng() * 1.3,
          y + 1.22 + rng() * 0.43,
          z + (rng() - 0.5) * 0.42,
          0.62,
          0.68,
          0.56,
          rng() * 0.7,
          rng() * tau,
          rng() * 0.76,
          '#b8b080',
        );
      for (let k = 0; k < 3; k++) {
        const bx = x + k * 0.43,
          by = y + 1.16 + rng() * 0.15,
          bz = z + 0.18;
        for (let b = 0; b < 21; b++) {
          const u = b / 21,
            a = b * 2.399,
            r = m('creek', .027) * (1 - u) ** 0.6;
          put(
            grapes,
            bx + Math.cos(a) * r,
            by - u * m('creek', .085),
            bz + Math.sin(a) * r,
            berryRadius,
            berryRadius * 1.07,
            berryRadius,
            0,
            0,
            0,
            ['#443045', '#5e455c', '#796177'][b % 3],
          );
        }
      }
    }
  }
  scaleSpec(finish(posts, null, true), 'creek', 'vine trellis', [2.12,.125,.13], 'Grove cordon posts');
  finish(cordons, null, true);
  finish(vines, null, true);
  finish(grapes, [0.37, 0.68, 1]);
}
