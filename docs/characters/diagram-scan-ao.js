// Local ambient visibility for the Mobile bone atlas. Voxelize the complete posed
// cortical surfaces, then sample a cosine-weighted hemisphere at each vertex.
// Neighboring bones contribute at the joints; distant limbs stay independent.
const directions = [];
for (let i = 0; i < 18; i++) {
  const y = 1 - (2 * (i + 0.5)) / 18,
    radius = Math.sqrt(1 - y * y),
    angle = i * Math.PI * (3 - Math.sqrt(5));
  directions.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
}

export function bakeScanAO(fitted) {
  const geometries = [...fitted.values()];
  if (!geometries.length) return;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);
  }
  const cell = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 192;
  if (!(cell > 0)) return;
  // Empty padding covers the longest visibility ray and keeps all lookups in bounds.
  const pad = 10,
    inv = 1 / cell;
  const nx = Math.ceil((maxX - minX) * inv) + pad * 2 + 1;
  const ny = Math.ceil((maxY - minY) * inv) + pad * 2 + 1;
  const nz = Math.ceil((maxZ - minZ) * inv) + pad * 2 + 1;
  const plane = nx * ny,
    occupied = new Uint8Array(plane * nz);
  for (const geometry of geometries) {
    const p = geometry.attributes.position,
      ids = geometry.index?.array;
    const count = ids?.length ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const a = ids ? ids[i] : i,
        b = ids ? ids[i + 1] : i + 1,
        c = ids ? ids[i + 2] : i + 2;
      const x = (p.getX(a) - minX) * inv + pad,
        y = (p.getY(a) - minY) * inv + pad,
        z = (p.getZ(a) - minZ) * inv + pad;
      const ux = (p.getX(b) - p.getX(a)) * inv,
        uy = (p.getY(b) - p.getY(a)) * inv,
        uz = (p.getZ(b) - p.getZ(a)) * inv;
      const vx = (p.getX(c) - p.getX(a)) * inv,
        vy = (p.getY(c) - p.getY(a)) * inv,
        vz = (p.getZ(c) - p.getZ(a)) * inv;
      const steps = Math.max(
        1,
        Math.ceil(
          Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz), Math.abs(vx), Math.abs(vy), Math.abs(vz)),
        ),
      );
      for (let j = 0; j <= steps; j++) {
        const u = j / steps;
        for (let k = 0; k <= steps - j; k++) {
          const v = k / steps;
          occupied[
            Math.floor(x + ux * u + vx * v) +
              nx * Math.floor(y + uy * u + vy * v) +
              plane * Math.floor(z + uz * u + vz * v)
          ] = 1;
        }
      }
    }
  }
  for (const geometry of geometries) {
    const { position, normal, color } = geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      const a = normal.getX(i),
        b = normal.getY(i),
        c = normal.getZ(i);
      const x = (position.getX(i) - minX) * inv + pad + a * 1.15;
      const y = (position.getY(i) - minY) * inv + pad + b * 1.15;
      const z = (position.getZ(i) - minZ) * inv + pad + c * 1.15;
      let obstruction = 0,
        sum = 0;
      for (const [dx, dy, dz] of directions) {
        const weight = dx * a + dy * b + dz * c;
        if (weight <= 0) continue;
        sum += weight;
        for (let distance = 1; distance <= 6; distance++) {
          if (
            occupied[
              Math.floor(x + dx * distance) +
                nx * Math.floor(y + dy * distance) +
                plane * Math.floor(z + dz * distance)
            ]
          ) {
            obstruction += weight * (1 - 0.075 * distance);
            break;
          }
        }
      }
      const visibility = 1 - (0.72 * obstruction) / Math.max(sum, 1e-6);
      color.setXYZ(i, visibility, visibility, visibility);
    }
    color.needsUpdate = true;
  }
}
