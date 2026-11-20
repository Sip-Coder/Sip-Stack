// Each ring is a cross-section of a removable rigid casting: joint-local
// height, transverse and sagittal radii scales, lateral/fore-aft offsets and
// vertical adjustment. The casting keeps this shape throughout articulation.
const profiles = {
  thigh: [
    [-0.245, 0.74, 0.69, 0.001, -0.018, 0],
    [-0.219, 0.56, 0.54, -0.0005, -0.015, 0],
    [-0.2, 0.66, 0.55, -0.002, -0.012, 0],
    [-0.14, 0.67, 0.56, -0.002, -0.01, 0],
    [-0.08, 0.68, 0.57, -0.001, -0.005, 0],
    [-0.04, 0.79, 0.65, 0, -0.002, 0],
    [0.02, 0.95, 0.86, 0, 0, 0],
  ],
  shin: [
    [-0.222, 0.97, 0.96, 0, -0.002, 0],
    [-0.2, 0.65, 0.57, 0.002, -0.004, 0],
    [-0.18, 0.6, 0.53, 0.002, -0.007, 0],
    [-0.16, 0.69, 0.6, 0.001, -0.009, 0],
    [-0.09, 0.78, 0.67, 0.001, -0.01, 0],
    [-0.04, 0.71, 0.66, 0.002, -0.014, 0],
    [-0.015, 0.87, 0.8, 0.003, -0.02, 0],
    [0.001, 0.93, 0.82, 0.004, -0.02, 0],
    [0.025, 0.62, 0.62, 0.004, -0.02, 0],
    [0.045, 0.59, 0.65, 0.004, -0.019, 0],
  ],
  foot: [
    [-0.047, 0.94, 1.1, 0.002, 0.001, 0],
    [-0.033, 0.94, 1.1, 0.002, 0.0005, 0],
    [-0.014, 0.88, 0.92, 0.002, -0.004, 0],
    [-0.003, 1.0, 0.9, 0.002, -0.014, 0],
    [0.002, 1.05, 1.05, 0.002, -0.014, 0.005],
    [0.031, 1.06, 1.1, 0, -0.006, 0.009],
  ],
  upperArm: [
    [-0.176, 0.89, 0.83, 0, 0.002, 0],
    [-0.127, 0.86, 0.86, 0.001, 0.001, 0],
    [-0.055, 0.78, 0.83, 0.006, 0.002, 0],
    [-0.034, 0.82, 0.86, 0.007, 0.001, 0.003],
    [0, 1.03, 0.93, 0.006, 0, 0.006],
    [0.035, 1.09, 0.92, 0.009, 0, 0.009],
  ],
  forearm: [
    [-0.145, 0.88, 0.88, 0, 0.001, -0.006],
    [-0.11, 0.98, 0.87, 0.001, 0.001, -0.003],
    [-0.062, 1.01, 0.91, 0.001, 0, 0],
    [-0.028, 0.96, 0.91, 0, 0.002, 0],
    [0.03, 0.99, 0.91, 0, 0.003, 0],
  ],
  hand: [
    [-0.08, 1.11, 0.98, -0.009, 0.002, -0.018],
    [-0.045, 1.15, 1, -0.008, 0.002, -0.012],
    [-0.018, 1.08, 1, -0.005, 0.001, -0.008],
    [0.018, 0.96, 0.98, 0, 0.001, -0.003],
  ],
};

// Shape both detail tiers in the same joint frame. Inverse-transpose normal
// transport preserves the molded highlight across the change in curvature.
export function fitCasting(g, joint) {
  const rows = profiles[joint.name.slice(0, -1)];
  if (!rows) return;
  const side = joint.name.endsWith('L') ? 1 : -1,
    p = g.attributes.position,
    n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    let hi = 1;
    while (hi + 1 < rows.length && y > rows[hi][0]) hi++;
    const a = rows[hi - 1],
      b = rows[hi],
      dy = b[0] - a[0];
    const u = Math.max(0, Math.min(1, (y - a[0]) / dy));
    const t = u * u * (3 - 2 * u),
      s = (6 * u * (1 - u)) / dy;
    const sx = a[1] + (b[1] - a[1]) * t,
      sz = a[2] + (b[2] - a[2]) * t;
    p.setXYZ(
      i,
      x * sx + side * (a[3] + (b[3] - a[3]) * t),
      y + a[5] + (b[5] - a[5]) * t,
      z * sz + a[4] + (b[4] - a[4]) * t,
    );
    const nx = n.getX(i) / sx,
      nz = n.getZ(i) / sz;
    const ny =
      (n.getY(i) -
        s * ((x * (b[1] - a[1]) + side * (b[3] - a[3])) * nx + (z * (b[2] - a[2]) + (b[4] - a[4])) * nz)) /
      (1 + s * (b[5] - a[5]));
    const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    n.setXYZ(i, nx * inv, ny * inv, nz * inv);
  }
}
