// Original cutaway anatomy registered to the live actor's posed joints.
// The rendered world-space points are also used for picking and measurements.
import * as T from 'three';

const tau = Math.PI * 2;
const lerp = T.MathUtils.lerp;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const ivory = new T.Color('#dfc69c'),
  joint = new T.Color('#a9b6a5');
const muscle = new T.Color('#a5483d'),
  fibre = new T.Color('#c97760'),
  tendon = new T.Color('#e6c7a1');
const romaSkin = new T.Color('#d5956e'),
  sippySkin = new T.Color('#dfa071');

function fabricator(tier, height, parts) {
  const high = tier === 'high';
  const materials = new Map();
  function part(name, layer, assemble, fitPoint) {
    const pos = [],
      ink = [],
      idx = [];
    function vert(p, color) {
      if (fitPoint) p = fitPoint(p);
      pos.push(p.x, p.y, p.z);
      ink.push(color.r, color.g, color.b);
      return pos.length / 3 - 1;
    }
    // A capped loft keeps every measure on the actual visible surface.
    function net(rowCount, sides, get, color, cap = true, reverse = false) {
      const firstIndex = idx.length;
      const first = pos.length / 3;
      for (let i = 0; i < rowCount; i++) {
        const t = i / (rowCount - 1);
        for (let j = 0; j < sides; j++) {
          const a = (tau * j) / sides;
          vert(get(i, j, t, a), typeof color === 'function' ? color(t, a) : color);
          if (i) {
            const b = first + (i - 1) * sides + j,
              next = first + (i - 1) * sides + ((j + 1) % sides);
            idx.push(b, next, next + sides, b, next + sides, b + sides);
          }
        }
      }
      if (cap) {
        const last = first + (rowCount - 1) * sides;
        for (let i = 1; i < sides - 1; i++)
          idx.push(first, first + i + 1, first + i, last, last + i, last + i + 1);
      }
      if (reverse) {
        for (let i = firstIndex; i < idx.length; i += 3) {
          const second = idx[i + 1];
          idx[i + 1] = idx[i + 2];
          idx[i + 2] = second;
        }
      }
    }
    function sweep(points, radii, color = ivory, options = {}) {
      const curve = new T.CatmullRomCurve3(points);
      const rows = options.rows ?? (high ? 18 : 11),
        sides = options.sides ?? (high ? 12 : 8);
      let basis = options.across?.clone() || v(1, 0, 0),
        up,
        center,
        rx,
        rz;
      net(
        rows,
        sides,
        (i, j, t, a) => {
          if (j === 0) {
            center = curve.getPoint(t);
            if (options.fit) options.fit(center);
            const axis = curve.getTangent(t);
            basis.addScaledVector(axis, -axis.dot(basis));
            if (basis.lengthSq() < 0.00001) {
              basis = Math.abs(axis.z) < 0.85 ? v(0, 0, 1) : v(0, 1, 0);
              basis.addScaledVector(axis, -axis.dot(basis));
            }
            basis.normalize();
            up = v().crossVectors(axis, basis).normalize();
            const u = t * (radii.length - 1),
              k = Math.min(radii.length - 2, Math.floor(u));
            rx = height * lerp(radii[k][0], radii[k + 1][0], u - k);
            rz = height * lerp(radii[k][1], radii[k + 1][1], u - k);
          }
          const vertex = center
            .clone()
            .addScaledVector(basis, rx * Math.cos(a))
            .addScaledVector(up, rz * Math.sin(a));
          return options.fit ? options.fit(vertex) : vertex;
        },
        color,
      );
    }
    function bands(place, rings, color = ivory, sides = high ? 28 : 16) {
      net(
        rings.length,
        sides,
        (i, j, t, a) => {
          const [y, rx, rz, cz = 0, cx = 0] = rings[i];
          // Mirrored face charts reverse their ring parameter to preserve
          // outward normals in world space on both anatomical sides.
          const theta = place.mirrored ? -a : a;
          return place(cx + rx * Math.cos(theta), y, cz - rz * Math.sin(theta));
        },
        color,
      );
    }
    function ellipsoid(place, x, y, z, rx, ry, rz, color = ivory) {
      const n = high ? 12 : 8,
        rings = [];
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (i / n - 0.5),
          r = Math.max(0.025, Math.cos(a));
        rings.push([y + ry * Math.sin(a), rx * r, rz * r, z, x]);
      }
      bands(place, rings, color, high ? 20 : 12);
    }
    function cord(points, radius, color = ivory, options = {}) {
      const cross = Array.isArray(radius) ? radius : [radius, radius];
      sweep(points, [cross, cross], color, options);
    }
    function longBone(points, width, depth = width, options = {}) {
      const diameters = [0.63, 1.16, 0.94, 0.62, 0.53, 0.57, 0.65, 0.86, 1.22, 0.84];
      sweep(
        points,
        diameters.map((k) => [width * k, depth * k]),
        ivory,
        options,
      );
    }
    function belly(points, width, depth, options = {}) {
      const shape = options.shape || [0.15, 0.32, 0.72, 0.96, 1, 0.82, 0.5, 0.22, 0.13];
      sweep(
        points,
        shape.map((k) => [width * k, depth * k]),
        (t, a) => {
          const attachment = 0.85 * Math.exp(-((t / 0.14) ** 2)) + 0.9 * Math.exp(-(((1 - t) / 0.15) ** 2));
          return muscle
            .clone()
            .lerp(fibre, 0.18 + 0.17 * Math.cos(a * 5 + 0.9 * Math.sin(Math.PI * t)) ** 2)
            .lerp(tendon, attachment);
        },
        options,
      );
    }
    function surface(vertices, indices, color = ivory) {
      const offset = pos.length / 3;
      for (const point of vertices) vert(point, color);
      for (const index of indices) idx.push(offset + index);
    }
    assemble({ high, net, surface, bands, ellipsoid, longBone, belly, cord, sweep });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(ink, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingBox();
    if (!materials.has(layer))
      materials.set(
        layer,
        new T.MeshStandardMaterial({
          vertexColors: true,
          roughness: layer === 'muscles' ? 0.65 : 0.82,
        }),
      );
    const mesh = new T.Mesh(g, materials.get(layer));
    mesh.name = name;
    parts.push({ name, mesh, layer, source: 'authored' });
  }
  return part;
}

function local(node) {
  return (x, y, z) => v(x, y, z).applyMatrix4(node.matrixWorld);
}
function track(node, child) {
  const place = local(node),
    d = child.position;
  return (t, x = 0, z = 0) => place(d.x * t + x, d.y * t, d.z * t + z);
}
function path(place, coordinates) {
  return coordinates.map((p) => place(...p));
}

export {
  fabricator,
  local,
  track,
  path,
  ivory,
  joint,
  muscle,
  fibre,
  tendon,
  romaSkin,
  sippySkin,
  tau,
  lerp,
  v,
};
