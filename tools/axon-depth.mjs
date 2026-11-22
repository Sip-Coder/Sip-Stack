import * as T from 'three';

export const depthViews = [
  [0, 0],
  [Math.PI, 0],
  [Math.PI / 2, 0],
  [-Math.PI / 2, 0],
  [0.69, 0.32],
  [-2.43, -0.3],
];

export function raster(parts, centre, scale, fixture, yaw, pitch) {
  const cs = Math.cos(yaw),
    ss = Math.sin(yaw),
    ct = Math.cos(pitch),
    st = Math.sin(pitch);
  const depth = new Float32Array(fixture ** 2).fill(-Infinity);
  const winners = new Int32Array(fixture ** 2).fill(-1);
  for (let id = 0; id < parts.length; id++) {
    const part = parts[id],
      g = part.mesh.geometry,
      a = g.getAttribute('position'),
      idx = g.index.array;
    const u = new Float32Array(a.count),
      v = new Float32Array(a.count),
      d = new Float32Array(a.count);
    for (let j = 0; j < a.count; j++) {
      const x = a.getX(j) - centre.x,
        y = a.getY(j) - centre.y,
        z = a.getZ(j) - centre.z;
      u[j] = (x * cs - z * ss) * scale + fixture / 2;
      v[j] = (y * ct - (x * ss + z * cs) * st) * scale + fixture / 2;
      d[j] = (x * ss + z * cs) * ct + y * st;
    }
    for (let i = 0; i < idx.length; i += 3) {
      const j = idx[i],
        b = idx[i + 1],
        c = idx[i + 2];
      const ux = u[b] - u[j],
        vx = v[b] - v[j],
        uy = u[c] - u[j],
        vy = v[c] - v[j];
      const det = ux * vy - uy * vx;
      if (Math.abs(det) < 1e-8) continue;
      const x0 = Math.max(0, Math.ceil(Math.min(u[j], u[b], u[c]) - 0.5)),
        x1 = Math.min(fixture - 1, Math.floor(Math.max(u[j], u[b], u[c]) - 0.5)),
        y0 = Math.max(0, Math.ceil(Math.min(v[j], v[b], v[c]) - 0.5)),
        y1 = Math.min(fixture - 1, Math.floor(Math.max(v[j], v[b], v[c]) - 0.5));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - u[j],
            dy = y + 0.5 - v[j],
            m = (dx * vy - dy * uy) / det,
            n = (ux * dy - vx * dx) / det;
          if (m < 0 || n < 0 || m + n > 1) continue;
          const z = d[j] + m * (d[b] - d[j]) + n * (d[c] - d[j]),
            at = y * fixture + x;
          if (z > depth[at]) {
            depth[at] = z;
            winners[at] = id;
          }
        }
    }
  }
  return { depth, winners };
}

const inch = 0.0254;
const describe = (value) => +value.toFixed(3);

// Rasterize the actual deformed triangle buffers with barycentric depth.
// Compare at each pixel with skin only, never with the boot or garment exterior.
export function coverage(parts, H, pelvis) {
  const bonesOnly = process.env.AXON_BONES_ONLY === '1';
  const layers = bonesOnly ? ['skeleton', 'skin'] : ['skeleton', 'muscles', 'skin'];
  const visible = parts.filter(
    (p) =>
      layers.includes(p.layer) &&
      !/hair|curl|brow|lash|sideburn|quiff|wave|crest and|scalp and|forelock|tapered lock|fringe/i.test(
        p.name,
      ),
  );
  const bounds = new T.Box3();
  for (const p of visible) {
    const g = p.mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    bounds.union(g.boundingBox);
  }
  const centre = bounds.getCenter(new T.Vector3());
  const fixture = 448,
    scale = fixture / (H * 1.09);
  const counts = new Map(),
    witnesses = {},
    femurRegions = {};
  let sampled = 0,
    exposed = 0,
    worst = 0;
  const skinParts = visible.filter((p) => p.layer === 'skin');
  const interiors = visible.filter((p) => p.layer !== 'skin');
  for (const [yaw, pitch] of depthViews) {
    const cs = Math.cos(yaw),
      ss = Math.sin(yaw),
      ct = Math.cos(pitch),
      st = Math.sin(pitch);
    const { depth: skin } = raster(skinParts, centre, scale, fixture, yaw, pitch);
    const { depth: inner, winners } = raster(interiors, centre, scale, fixture, yaw, pitch);
    for (let k = 0; k < inner.length; k++) {
      if (winners[k] < 0) continue;
      sampled++;
      if (inner[k] <= skin[k] + 0.0005) continue;
      exposed++;
      if (Number.isFinite(skin[k])) worst = Math.max(worst, inner[k] - skin[k]);
      const name = interiors[winners[k]].name;
      counts.set(name, (counts.get(name) || 0) + 1);
      if (/ femur$/.test(name) || (process.env.SKELETON_WITNESSES && !witnesses[name])) {
        const u = ((k % fixture) + 0.5 - fixture / 2) / scale,
          v = (Math.floor(k / fixture) + 0.5 - fixture / 2) / scale;
        const dy = v * ct + inner[k] * st,
          dz = inner[k] * ct - v * st;
        const world = [centre.x + cs * u + ss * dz, centre.y + dy, centre.z - ss * u + cs * dz];
        if (!witnesses[name]) witnesses[name] = world;
        if (pelvis && / femur$/.test(name)) {
          const hip = pelvis[name.startsWith('Left') ? 'L' : 'R'];
          const axis = hip.knee.clone().sub(hip.femoralHead);
          const t = new T.Vector3(...world).sub(hip.femoralHead).dot(axis) / axis.lengthSq();
          const region = t < 0.33 ? 'proximal' : t < 0.72 ? 'shaft' : 'distal';
          femurRegions[region] = (femurRegions[region] || 0) + 1;
        }
      }
    }
  }
  return {
    ...(bonesOnly ? { layers: 'skeleton against skin' } : {}),
    sampled,
    exposedFemurByRegion: femurRegions,
    ...(process.env.SKELETON_WITNESSES
      ? {
          worldWitnessesInches: Object.fromEntries(
            Object.entries(witnesses).map(([name, xyz]) => [name, xyz.map((n) => describe(n / inch))]),
          ),
        }
      : {}),
    exposed,
    maximumRayDepthInches: describe(worst / inch),
    parts: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])),
  };
}
