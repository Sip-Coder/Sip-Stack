// Authored cartilage and missing articular surfaces remain separate meshes.
import * as T from 'three';

const tau = Math.PI * 2;
const lerp = T.MathUtils.lerp;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const ivory = new T.Color('#dfc69c');
function fabricator(tier, height, parts) {
  const high = tier === 'high';
  const materials = new Map();
  function part(name, layer, assemble) {
    const pos = [],
      ink = [],
      idx = [];
    function vert(p, color) {
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
          return center.clone()
            .addScaledVector(basis, rx * Math.cos(a))
            .addScaledVector(up, rz * Math.sin(a));
        },
        color,
      );
    }
    assemble({ high, net, sweep });
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
          name: layer,
          roughness: 0.82,
        }),
      );
    const mesh = new T.Mesh(g, materials.get(layer));
    mesh.name = name;
    parts.push({ name, mesh, layer, source: 'authored' });
  }
  return part;
}

export { fabricator };
