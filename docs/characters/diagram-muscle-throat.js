// Use the space anterior to the posed cervical cortex and beneath the real
// chin. A common transverse transform keeps adjacent vocal folds and
// suprahyoid slips distinct through deep neck flexion.
import { Box3, Ray, Vector3 } from 'three';
const point = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
export const deepThroat =
  /vocalis|arytenoid|pharynge|veli_palatini|hyoglossus|genioglossus|digastric|uvular|thyrohyoid|stylohyoid|geniohyoid|mylohyoid/;

function anteriorCortex(ray, bones, origin, forward) {
  const a = point(),
    b = point(),
    c = point(),
    hit = point();
  let anterior = -Infinity;
  for (const g of bones) {
    if (!ray.intersectsBox(g.boundingBox)) continue;
    const pos = g.attributes.position,
      ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      a.fromBufferAttribute(pos, ix[i]);
      b.fromBufferAttribute(pos, ix[i + 1]);
      c.fromBufferAttribute(pos, ix[i + 2]);
      if (ray.intersectTriangle(a, b, c, false, hit))
        anterior = Math.max(anterior, hit.sub(origin).dot(forward));
    }
  }
  return anterior;
}

export function throatChart(trunk, fit, lm, atlas) {
  const step = 0.008,
    start = 1.445,
    stations = [],
    inside = fit.hasReserve ?? fit.inside;
  const bones = [...lm.scan.bones].filter(([key]) => /^VERTEBRA_C/.test(key)).map(([, g]) => g);
  const donor = Array.from({ length: 21 }, () => new Box3()),
    v = point();
  for (const [id, g] of atlas) {
    if (!deepThroat.test(id)) continue;
    const attr = g.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      v.fromBufferAttribute(attr, i);
      const j = Math.min(20, Math.max(0, Math.round((v.y - start) / step)));
      // Include both neighboring sections so a tendon crossing the sample
      // plane retains the same ordering as it passes the cartilage.
      for (let k = Math.max(0, j - 1); k <= Math.min(20, j + 1); k++) donor[k].expandByPoint(v);
    }
  }
  for (let j = 0; j < donor.length; j++) {
    const y = start + j * step,
      box = donor[j];
    const origin = trunk(point(0, y, 0));
    const forward = trunk(point(0, y, 0.01)).sub(origin);
    const scaleZ = forward.length() * 100;
    forward.normalize();
    const from = origin.clone().addScaledVector(forward, 0.25),
      ray = new Ray(from, forward.clone().negate());
    const wall = anteriorCortex(ray, bones, origin, forward) / scaleZ + 0.0012;
    const spans = [];
    let span;
    for (let i = 0; i <= 65; i++) {
      const z = -0.089 + i * 0.003;
      const safe = z >= wall && [-0.01, 0, 0.01].every((x) => inside(trunk(point(x, y, z))));
      if (safe) {
        if (!span) {
          span = { lo: z, hi: z };
          spans.push(span);
        } else span.hi = z;
      } else span = null;
    }
    const use = spans.sort((a, b) => b.hi - b.lo - (a.hi - a.lo))[0];
    if (!use || box.isEmpty()) {
      stations.push(stations.at(-1) ?? { scale: 1, shift: 0 });
      continue;
    }
    const lo = use.lo + 0.0006,
      hi = use.hi - 0.0006;
    const scale = Math.max(0.12, Math.min(1, (hi - lo) / Math.max(0.003, box.max.z - box.min.z)));
    const shift = Math.max(lo - box.min.z * scale, Math.min(0, hi - box.max.z * scale));
    stations.push({ scale, shift });
  }
  return (p) => {
    const t = Math.min(stations.length - 1, Math.max(0, (p.y - start) / step)),
      i = Math.min(stations.length - 2, Math.floor(t)),
      f = t - i;
    const a = stations[i],
      b = stations[i + 1],
      scale = a.scale + (b.scale - a.scale) * f,
      shift = a.shift + (b.shift - a.shift) * f;
    return trunk(point(p.x, p.y, p.z * scale + shift));
  };
}
