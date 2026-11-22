// Fibre charts and pigments are display attributes. Source positions and
// triangle indices stay exactly as decoded from the donor asset.
import { Color, Float32BufferAttribute, MathUtils, Vector3 } from 'three';

const belly = new Color('#8e2732'),
  tendon = new Color('#e8e0d1');
const clamp = MathUtils.clamp,
  smooth = MathUtils.smoothstep;

function principalDirection(positions, center, across) {
  let xx = 0,
    xy = 0,
    xz = 0,
    yy = 0,
    yz = 0,
    zz = 0;
  const v = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i).sub(center);
    if (across) v.addScaledVector(across, -v.dot(across));
    xx += v.x * v.x;
    xy += v.x * v.y;
    xz += v.x * v.z;
    yy += v.y * v.y;
    yz += v.y * v.z;
    zz += v.z * v.z;
  }
  v.set(xx >= yy && xx >= zz ? 1 : 0, yy > xx && yy >= zz ? 1 : 0, zz > xx && zz > yy ? 1 : 0);
  for (let i = 0; i < 10; i++) {
    const { x, y, z } = v;
    v.set(xx * x + xy * y + xz * z, xy * x + yy * y + yz * z, xz * x + yz * y + zz * z).normalize();
  }
  return v;
}

// These broad sheets expose long aponeuroses and narrow terminal tendons.
// Locate them in the shared donor frame. The cortical registration sites
// include points inside those sheets and are unsuitable as pigment masks.
function sheetTendon(node) {
  const band = (d, core, edge) => 1 - smooth(Math.abs(d), core, edge);
  if (node.includes('pectoralis_major')) {
    const clavicular = node.includes('clavicular'), abdominal = node.includes('abdominal');
    return (x, y) => {
      const humeral = smooth(x, 0.156, 0.180) * smooth(y, 1.280, 1.327);
      let medial;
      if (clavicular) medial = band(y - (1.375 + 0.34 * x), 0.0012, 0.007) * (1 - smooth(x, 0.062, 0.101));
      else if (abdominal) medial = band(y - (1.178 + 0.55 * (x - 0.05)), 0.0015, 0.008) * (1 - smooth(x, 0.070, 0.101));
      else medial = 1 - smooth(x, 0.005, 0.013);
      return Math.max(0.48 * medial, 0.86 * humeral);
    };
  }
  if (node.includes('latissimus_dorsi')) {
    return (x, y) => {
      // The thoracolumbar fascia broadens toward the posterior iliac crest.
      // Its oblique border converges on the lower thoracic spinous line.
      const lumbar = 1 - smooth(y, 0.950, 1.243);
      const fasciaWidth = 0.005 + 0.075 * lumbar;
      const fascia = 1 - smooth(x, fasciaWidth * 0.56, fasciaWidth);
      const humeral = smooth(x, 0.152, 0.179) * smooth(y, 1.259, 1.323);
      return Math.max((0.35 + 0.40 * lumbar) * fascia, 0.87 * humeral);
    };
  }
  if (node.includes('trapezius')) {
    const ascending = node.includes('ascending'), descending = node.includes('descending');
    return (x, y) => {
      // A thin midline raphe widens gradually at the cervicothoracic origin.
      const width = 0.004 + 0.010 * band(y - 1.445, 0.002, 0.065);
      const raphe = (1 - smooth(x, width * 0.25, width)) * 0.62;
      const blade = ascending
        ? band(y - (1.372 + 0.26 * (x - 0.071)), 0.0018, 0.006) * smooth(x, 0.065, 0.104)
        : smooth(x, descending ? 0.105 : 0.135, descending ? 0.133 : 0.161);
      return Math.max(raphe, 0.76 * blade);
    };
  }
  if (node.includes('rectus_abdominis')) {
    return (x, y) => {
      // The three relief grooves on the donor's anterior wall slope gently
      // across the paired bellies. The uppermost inscription is incomplete.
      const lower = band(y - (1.020 - 0.055 * (x - 0.035)), 0.0012, 0.0045);
      const middle = band(y - (1.079 - 0.11 * (x - 0.035)), 0.0014, 0.0048);
      const upper = band(y - (1.147 - 0.19 * (x - 0.035)), 0.0010, 0.0042) * (1 - smooth(x, 0.038, 0.056));
      const inscribed = Math.max(lower, middle, upper) * smooth(x, 0.005, 0.013) * (1 - smooth(x, 0.047, 0.070));
      const pubic = 1 - smooth(y, 0.853, 0.886);
      const costal = smooth(y, 1.225, 1.248);
      return Math.max(0.52 * inscribed, 0.75 * pubic, 0.48 * costal);
    };
  }
  return null;
}

export function shadeSourceMuscle(geometry, nodeName, authored = false) {
  if (geometry.hasAttribute('uv') && geometry.hasAttribute('color')) return;
  const positions = geometry.attributes.position, count = positions.count;
  const q = new Vector3(), center = new Vector3();
  for (let i = 0; i < count; i++) center.add(q.fromBufferAttribute(positions, i));
  center.divideScalar(count);
  const axis = principalDirection(positions, center);
  const transverse = principalDirection(positions, center, axis);
  const along = new Float32Array(count),
    across = new Float32Array(count);
  let lo = Infinity,
    hi = -Infinity,
    left = Infinity,
    right = -Infinity;
  for (let i = 0; i < count; i++) {
    q.fromBufferAttribute(positions, i).sub(center);
    const y = (along[i] = q.dot(axis)),
      x = (across[i] = q.dot(transverse));
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  const length = Math.max(1e-6, hi - lo),
    width = Math.max(1e-6, right - left);
  const bins = 11,
    minima = new Array(bins).fill(Infinity),
    maxima = new Array(bins).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    const row = clamp(Math.round(((along[i] - lo) / length) * (bins - 1)), 0, bins - 1);
    minima[row] = Math.min(minima[row], across[i]);
    maxima[row] = Math.max(maxima[row], across[i]);
  }
  // Smooth section width so the fibres fan and converge along the surface.
  // This open transverse chart has no seam across an atlas triangle.
  const centers = [],
    widths = [];
  for (let i = 0; i < bins; i++) {
    let min = Infinity,
      max = -Infinity;
    for (let j = Math.max(i - 1, 0); j <= Math.min(i + 1, bins - 1); j++) {
      min = Math.min(min, minima[j]);
      max = Math.max(max, maxima[j]);
    }
    centers.push(Number.isFinite(min) ? (min + max) * 0.5 : (left + right) * 0.5);
    widths.push(Number.isFinite(min) ? Math.max(width * 0.3, max - min) : width);
  }
  const longTendon = /digitorum|pollicis|hallucis|tibialis|gastrocnemius|soleus|carpi|palmaris_longus/i.test(
    nodeName,
  );
  const uv = new Float32Array(count * 2),
    colors = new Float32Array(count * 3);
  const tint = new Color();
  const sheet = authored ? null : sheetTendon(nodeName);
  for (let i = 0; i < count; i++) {
    const t = clamp((along[i] - lo) / length, 0, 1),
      row = t * (bins - 1),
      a = Math.min(bins - 2, Math.floor(row)),
      b = row - a;
    const rowCenter = MathUtils.lerp(centers[a], centers[a + 1], b);
    const rowWidth = MathUtils.lerp(widths[a], widths[a + 1], b);
    uv[2 * i] = 0.5 + (across[i] - rowCenter) / (rowWidth * 0.72 + width * 0.28);
    uv[2 * i + 1] = t;
    q.fromBufferAttribute(positions, i);
    let pale = sheet ? sheet(Math.abs(q.x), q.y) : 0;
    // The broad central tendon lies on the superior dome of the diaphragm.
    if (nodeName === 'diaphragm')
      pale = Math.max(
        pale,
        smooth(t, 0.52, 0.92) * (1 - smooth(Math.abs(across[i] - (left + right) * 0.5) / width, 0.18, 0.45)),
      );
    // On the small deep slips without explicit bone insertions, only their
    // narrowing terminal fibres take on a connective-tissue tint.
    if (!sheet) {
      const taper = 1 - smooth(rowWidth / width, 0.35, 0.76);
      const limit = longTendon ? 0.31 : 0.13;
      pale = Math.max(pale, (1 - smooth(Math.min(t, 1 - t), 0.018, limit)) * taper * 0.93);
    }
    tint
      .copy(belly)
      .lerp(tendon, clamp(pale, 0, 1))
      .toArray(colors, 3 * i);
  }
  if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (!geometry.hasAttribute('color')) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

