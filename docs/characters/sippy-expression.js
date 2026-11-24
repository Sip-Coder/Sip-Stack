import * as T from 'three';

// Follow the cheek surface at rest and at both expression endpoints so the lip
// and upper teeth stay set into the face throughout a smile or a focus.
export function seatSippyMouth(parent, field, incisor) {
  const make = (color, roughness) => new T.MeshStandardMaterial({ color, roughness });
  const mouth = make('#5a2b25', 0.56), enamel = make('#f5e7d6', 0.39), lip = make('#be7c63', 0.58);
  // Rebind the original sculpt and its morph endpoints as a single uniform fit.
  const scale = 0.76;
  function depth(x, y) {
    const z = field.front(x, y);
    return (Number.isFinite(z) ? z : incisor[2]) + field.nose(x, y) + 0.00135;
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
          const hx = field.xM + x * scale, hy = field.yM + (y - 0.032) * scale;
          v.push(hx, hy, depth(hx, hy) + z * scale);
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
    const m = new T.Mesh(g, material);
    const names = { opening: 'Mouth cavity', teeth: 'Teeth', upper: 'Upper lip', lower: 'Lower lip' };
    m.name = names[layer];
    m.userData.anatomicalSkin = names[layer];
    if (layer === 'upper' || layer === 'lower') m.userData.faceRegion = 'lips';
    parent.add(m);
    pieces.push(m);
  }
  sew('opening', mouth);
  sew('teeth', enamel);
  sew('upper', lip);
  sew('lower', lip);
  return (smile, concentration, cue) => {
    const smiling = Math.max(smile, (cue?.mouthOpen ?? 0) * 0.8);
    const surprise = cue?.surprise ?? 0, asymmetry = cue?.asymmetry ?? 0;
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
