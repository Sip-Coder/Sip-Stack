// The orbital rim and lip contours follow the same sculpted surface as the cheeks.
import * as T from 'three';

// The sculpt is an indexed stack of horizontal sections. Look up anterior
// triangles in the two bracketing sections, including the actual cheek offsets.
function sampleCheek(geometry, around) {
  const p = geometry.attributes.position;
  const layers = (p.count - 2 * (around + 1)) / around - 1;
  function triangleZ(x, y, i, j, k) {
    const ax = p.getX(i),
      ay = p.getY(i),
      bx = p.getX(j) - ax,
      by = p.getY(j) - ay;
    const cx = p.getX(k) - ax,
      cy = p.getY(k) - ay,
      area = bx * cy - by * cx;
    if (area <= 1e-12) return -Infinity;
    const u = ((x - ax) * cy - (y - ay) * cx) / area,
      v = (bx * (y - ay) - by * (x - ax)) / area;
    if (u < -0.00001 || v < -0.00001 || u + v > 1.00001) return -Infinity;
    return p.getZ(i) * (1 - u - v) + p.getZ(j) * u + p.getZ(k) * v;
  }
  return (x, y) => {
    let row = 0;
    while (row < layers - 1 && y > p.getY((row + 1) * around)) row++;
    const start = row * around;
    for (let i = 0; i < around; i++) {
      const a = start + i,
        b = start + ((i + 1) % around);
      if (Math.max(p.getZ(a), p.getZ(b), p.getZ(a + around), p.getZ(b + around)) < 0) continue;
      const z = Math.max(triangleZ(x, y, a, b, a + around), triangleZ(x, y, b, b + around, a + around));
      if (Number.isFinite(z)) return z;
    }
    return -Infinity;
  };
}

function mesh(parent, geometry, material) {
  const m = new T.Mesh(geometry, material);
  m.castShadow = m.receiveShadow = true;
  m.userData.patternPiece = true;
  parent.add(m);
  return m;
}
// Guide the skin from the outer lid across the orbital rim to the cheek.
// Sample the actual sculpt so the canthi turn into the brow and cheek in profile.
function orbitalRim(eye, depth, material, side) {
  const sectors = 48,
    rows = 5;
  const vertices = [],
    index = [];
  const point = new T.Vector3();
  eye.updateMatrix();
  const toEye = eye.matrix.clone().invert();
  for (let i = 0; i < sectors; i++) {
    const a = (2 * Math.PI * i) / sectors,
      x = Math.cos(a),
      y = Math.sin(a);
    const innerX = 0.0196 * x,
      innerY = 0.01625 * y;
    const outerX = (0.0228 + 0.0012 * side * x) * x,
      outerY = (y > 0 ? 0.021 : 0.0205) * y;
    point.set(outerX, outerY, 0);
    point.applyMatrix4(eye.matrix);
    const skinZ = depth(point.x, point.y);
    if (Number.isFinite(skinZ)) {
      point.z = skinZ;
      point.applyMatrix4(toEye);
    } else point.set(outerX, outerY, -0.003);
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1),
        lift = Math.sin(t * Math.PI);
      const edge = Math.max(0, 1 - 0.7 * side * x);
      vertices.push(
        T.MathUtils.lerp(innerX, point.x, t),
        T.MathUtils.lerp(innerY, point.y, t),
        T.MathUtils.lerp(0.00075, point.z - 0.0007, t) + 0.00065 * lift * edge,
      );
      if (j < rows - 1) {
        const k = i * rows + j,
          n = ((i + 1) % sectors) * rows + j;
        index.push(k, k + 1, n, n, k + 1, n + 1);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return mesh(eye, g, material);
}

// Follow the cheek surface at rest and at both expression endpoints so the lip
// and upper teeth stay set into the face throughout a smile or a focus.
function sculptSmile(parent, surfaceDepth, mouth, enamel, lip) {
  function depth(x, y) {
    const z = surfaceDepth(x, y);
    return Number.isFinite(z) ? z : 0.032;
  }
  const pieces = [];
  function sew(layer, material) {
    const cols = 32,
      rows = layer === 'opening' || layer === 'teeth' ? 2 : 6;
    const indices = [],
      g = new T.BufferGeometry();
    function expression(lift, focus, round = 0, asymmetry = 0) {
      const v = [];
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= cols; i++) {
          const t = j / rows,
            u = (2 * i) / cols - 1,
            teeth = layer === 'teeth';
          const s = teeth ? 0.86 * u : u,
            fade = Math.max(0, 1 - s * s);
          const x = s * (0.0219 + 0.0035 * lift - 0.0015 * focus - 0.0105 * round);
          const corners = (0.0031 + 0.0044 * lift - 0.0038 * focus - 0.0049 * round) * s * s;
          const line = 0.032 + corners + (0.0007 + 0.0042 * asymmetry) * s * Math.abs(s);
          const high = line + fade * (0.0008 + 0.0021 * lift - 0.0003 * focus + 0.0057 * round);
          const low = line - fade * (0.0019 + 0.009 * lift - 0.0009 * focus + 0.0109 * round);
          let y, z;
          if (layer === 'opening') {
            y = T.MathUtils.lerp(low, high, t);
            z = 0.00038;
          } else if (teeth) {
            y = high - fade * (0.00006 + 0.0027 * lift) * (1 - t);
            z = 0.00059;
          } else {
            const top = layer === 'upper';
            const width = top ? 0.0017 + 0.00075 * Math.exp(-((Math.abs(s) - 0.32) ** 2) / 0.015) : 0.0028;
            const edge = top ? high : low;
            y = top ? edge + t * width * fade : edge - (1 - t) * width * fade;
            const edgeWeight = top ? 1 - t : t;
            z = -0.00010 + 0.00065 * edgeWeight + (0.00115 - 0.00025 * focus) * Math.sin(t * Math.PI) * fade;
          }
          v.push(x, y, depth(x, y) + z);
        }
      return new T.Float32BufferAttribute(v, 3);
    }
    g.setAttribute('position', expression(0, 0));
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * (cols + 1) + i;
        indices.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
      }
    g.setIndex(indices);
    g.computeVertexNormals();
    g.morphAttributes.position = [
      expression(1, 0), expression(0, 1), expression(0, 0, 1),
      expression(0.45, 0, 0, 1), expression(0.45, 0, 0, -1),
    ];
    // Morph the shading normals along with the cheek and lower lip.
    g.morphAttributes.normal = g.morphAttributes.position.map((a) => {
      const posed = new T.BufferGeometry();
      posed.setAttribute('position', a);
      posed.setIndex(g.index);
      posed.computeVertexNormals();
      const normals = posed.attributes.normal;
      posed.dispose();
      return normals;
    });
    const m = mesh(parent, g, material);
    pieces.push(m);
  }
  sew('opening', mouth);
  sew('teeth', enamel);
  sew('upper', lip);
  sew('lower', lip);
  return (smiling, concentration, surprise = 0, asymmetry = 0) => {
    for (const piece of pieces) {
      const smirk = Math.abs(asymmetry) * (1 - surprise);
      piece.morphTargetInfluences[0] = smiling * (1 - concentration) * (1 - surprise - smirk);
      piece.morphTargetInfluences[1] = concentration * (1 - surprise - smirk);
      piece.morphTargetInfluences[2] = surprise;
      piece.morphTargetInfluences[3] = asymmetry >= 0 ? smirk : 0;
      piece.morphTargetInfluences[4] = asymmetry < 0 ? smirk : 0;
    }
  };
}

export function fitExpression(skull, around, mouth, enamel, lip) {
  const depth = sampleCheek(skull.geometry, around);
  return {
    surfaceDepth: depth,
    orbit: (eye, skin, side) => orbitalRim(eye, depth, skin, side),
    smile: sculptSmile(skull.parent, depth, mouth, enamel, lip),
  };
}
