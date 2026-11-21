// Sippy's skin rounds the knee over a set of articulated cross-sections.
// Read those same cross-sections after the snapshot pose has been applied.
import { Vector3 } from 'three';

const jointRow = 9;
const kneeMedial = .009;
const sample = () => new Vector3();

function between(a, b, t) {
  return a.clone().lerp(b, t);
}

export function sippyLegFit(rig, side) {
  const binding = rig.blueprint.knee[side === 'L' ? 0 : 1].parts[0];
  const mesh = binding.mesh;
  const tier = mesh.geometry === mesh.userData.mobileGeometry ? 'mobile' : 'high';
  const ids = binding.vertices[tier];
  const h = rig.height, sign = side === 'L' ? 1 : -1;
  const n = ids.length, start = ids[0] - n * jointRow;
  const skinPoint = i => mesh.getVertexPosition(i, sample()).applyMatrix4(mesh.matrixWorld);
  const rings = Array.from({ length: jointRow + 2 }, (_, i) => {
    const startRing = start + i * n;
    const front = skinPoint(startRing), back = skinPoint(startRing + n / 2);
    const left = skinPoint(startRing + n / 4), right = skinPoint(startRing + 3 * n / 4);
    return {
      center: front.clone().add(back).add(left).add(right).multiplyScalar(.25),
      outer: left.sub(right).normalize().multiplyScalar(sign),
      forward: front.sub(back).normalize(),
      level: mesh.geometry.attributes.position.getY(startRing),
    };
  });
  const joint = rings[jointRow], knee = joint.center.clone().addScaledVector(joint.outer, -kneeMedial * h);
  const shin = rings.slice(0, jointRow + 1).reverse();
  const foot = rig['foot' + side];

  function path(stations, t, x, z) {
    let i = 0;
    while (i < stations.length - 2 && t > stations[i + 1].t) i++;
    const a = stations[i], b = stations[i + 1], s = (t - a.t) / (b.t - a.t);
    return between(a.center, b.center, s)
      .addScaledVector(between(a.outer, b.outer, s).normalize(), x * h)
      .addScaledVector(between(a.forward, b.forward, s).normalize(), z * h);
  }
  function shinPath(ankle, outer, forward) {
    const stations = shin.slice(0, -1).map(r => {
      const t = (joint.level - r.level) / (joint.level - shin.at(-1).level);
      return { ...r, t, center: r.center.clone().addScaledVector(r.outer, -kneeMedial * (1 - t) * h) };
    });
    stations.push({ t: 1, center: ankle, outer, forward });
    const axis = ankle.clone().sub(knee).normalize();
    for (const section of stations) {
      const center = between(knee, ankle, section.t);
      const bow = section.center.clone().sub(center).projectOnPlane(axis).clampLength(0, .007 * h);
      section.center = center.add(bow);
    }
    return (t, x = 0, z = 0) => {
      const point = path(stations, t, x, z);
      // The two ankle prominences bracket the talus within the shoe collar.
      // The distal tip can extend below the plafond as the shank pitches.
      const s = Math.min(1, Math.max(0, (t - .86) / .14));
      const end = foot.localToWorld(sample().set(sign * x, .005 - (t - 1) * .211, -.006 + z));
      return point.lerp(end, s * s * (3 - 2 * s));
    };
  }
  return { knee, shinPath,
    patella: knee.clone().addScaledVector(joint.forward, .013 * h)
      .addScaledVector(rings[10].center.clone().sub(knee).normalize(), .004 * h) };
}
