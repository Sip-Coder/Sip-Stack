// The seat is cut in two gores. Their lower edges follow the posed leg
// openings all the way round, and their upper edges join at the fly and
// seat under one waistband. The rear vents are sewn to the back jacket row.
import * as T from 'three';
import { bindCloth } from './sippy-skin.js';
import { shell } from './sippy-tailoring.js';

const tau = Math.PI * 2,
  lerp = T.MathUtils.lerp,
  around = 56,
  rows = 14;
const v = () => new T.Vector3();

function seam(name, mesh, base, count, closed, target) {
  const high = Array.from({ length: count }, (_, i) => base + i);
  return {
    name,
    edge: {
      mesh,
      closed,
      indices: { high, mobile: high.filter((x, i) => i % 2 === 0 || (!closed && i === count - 1)) },
    },
    target,
  };
}

function sampleRow(attr, offset, count, u, out) {
  const f = (((u % 1) + 1) % 1) * count,
    i = Math.floor(f),
    t = f - i,
    j = (i + 1) % count;
  return out.set(
    lerp(attr.getX(offset + i), attr.getX(offset + j), t),
    lerp(attr.getY(offset + i), attr.getY(offset + j), t),
    lerp(attr.getZ(offset + i), attr.getZ(offset + j), t),
  );
}

// Each grid cell stores the rear face of every posed triangle touching its
// x/y rectangle. Applying that support to all four corners of a tail cell
// protects the entire cloth triangle, including the space between vertices.
export function rearGrid(meshes, chest, sense = 1) {
  const cols = 26,
    bands = 42,
    bin = 0.011,
    minX = -0.143,
    minY = -0.31,
    grid = new Float32Array(cols * bands),
    entries = [],
    inv = new T.Matrix4(),
    tr = new T.Matrix4();
  const col = (x) => T.MathUtils.clamp(Math.floor((x - minX) / bin), 0, cols - 1),
    row = (y) => T.MathUtils.clamp(Math.floor((y - minY) / bin), 0, bands - 1);
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    entries.push({ m, p, data: new Float32Array(p.count * 3), idx: m.geometry.index });
  }
  return {
    update() {
      inv.copy(chest.matrixWorld).invert();
      grid.fill(Infinity);
      for (const { m, p, data, idx } of entries) {
        m.updateWorldMatrix(true, false);
        tr.multiplyMatrices(inv, m.matrixWorld);
        const e = tr.elements;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i),
            y = p.getY(i),
            z = p.getZ(i),
            k = i * 3;
          data[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
          data[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          data[k + 2] = sense * (e[2] * x + e[6] * y + e[10] * z + e[14]);
        }
        for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i) * 3,
            b = idx.getX(i + 1) * 3,
            c = idx.getX(i + 2) * 3;
          const lowY = Math.min(data[a + 1], data[b + 1], data[c + 1]),
            highY = Math.max(data[a + 1], data[b + 1], data[c + 1]);
          if (highY < minY || lowY > minY + bands * bin) continue;
          const x0 = col(Math.min(data[a], data[b], data[c])),
            x1 = col(Math.max(data[a], data[b], data[c]));
          const y0 = row(lowY),
            y1 = row(highY),
            rear = Math.min(data[a + 2], data[b + 2], data[c + 2]);
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              const k = y * cols + x;
              grid[k] = Math.min(grid[k], rear);
            }
        }
      }
    },
    support(x0, x1, y0, y1) {
      let rear = Infinity;
      for (let y = row(y0), r = row(y1); y <= r; y++)
        for (let x = col(x0), c = col(x1); x <= c; x++) rear = Math.min(rear, grid[y * cols + x]);
      return rear - 0.0015;
    },
  };
}

export function fitHipSeams(suit) {
  const { rig, surfaces, add } = suit,
    chest = rig.chest,
    rise = surfaces['trouser-rise'][0],
    jacket = surfaces['quilted-vest'][0],
    parts = [],
    tails = [];
  const seams = (rig.garments.seams ??= []);
  rig.garments.hips = { columns: around, top: rows };
  const upper = v(),
    lower = v(),
    front = v(),
    back = v(),
    up = v(),
    start = v(),
    end = v(),
    tPoint = v(),
    chestInv = new T.Matrix4(),
    tr = new T.Matrix4(),
    tailInv = new T.Matrix4(),
    legInv = new T.Matrix4();
  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const name = 'trousers-' + side,
      leg = surfaces[name][0],
      layer = add(
        name,
        chest,
        shell(
          rows,
          around,
          (f, u, inner) => [
            (0.05 + f * 0.005) * Math.sin(u * tau) + sign * 0.061,
            f * 0.04,
            (0.052 - inner * 0.0013) * Math.cos(u * tau),
          ],
          true,
        ),
        leg.material,
        true,
      );
    layer.name = 'sippy-seat-' + side;
    const geometry = layer.geometry;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const sphere = bounds.getBoundingSphere(new T.Sphere());
    geometry.boundingSphere = sphere;
    // Both index sets share these animated vertices. A close hand camera can
    // see the posed seat while the unposed pattern lies outside the frustum.
    layer.userData.mobileGeometry.boundingBox = bounds;
    layer.userData.mobileGeometry.boundingSphere = sphere;
    parts.push({ sign, leg, layer, bounds, sphere });
    seams.push(seam('hip-' + side, layer, 0, around, true, leg));
  }
  const arcs = [];
  for (const { layer, sign } of parts) {
    const offset = rows * around,
      arc = (begin) => {
        const high = Array.from({ length: around / 2 + 1 }, (_, i) => offset + ((i + begin) % around));
        return {
          mesh: layer,
          closed: false,
          indices: { high, mobile: high.filter((n, i) => i % 2 === 0) },
        };
      };
    const outer = arc(sign > 0 ? 0 : around / 2);
    seams.push({ name: 'seat-' + (sign > 0 ? 'L' : 'R') + '-waist', edge: outer, target: rise });
    arcs.push(arc(sign > 0 ? around / 2 : 0));
  }
  seams.push({ name: 'crotch', edge: arcs[0], mate: arcs[1] });
  seams.push(seam('waist', rise, 14 * 56, 56, true, surfaces['hoodie']));
  const vest = surfaces['hoodie'][0],
    riseRest = rise.geometry.attributes.position.array.slice();
  const grid = rearGrid([...surfaces['trousers-L'], ...surfaces['trousers-R'], rise], chest);
  suit.lowerBackSupport = grid;
  for (const m of surfaces['split-back']) {
    const sign = m.parent.name.endsWith('L') ? 1 : -1,
      count = 19,
      total = count * 19 * 2;
    tails.push({ m, sign, data: new Float32Array(total * 3) });
    seams.push(seam('tail-' + (sign === 1 ? 'L' : 'R'), m, 18 * count, count, false, jacket));
  }
  {
    chest.updateWorldMatrix(true, false);
    chestInv.copy(chest.matrixWorld).invert();
    const rp = rise.geometry.attributes.position,
      vp = vest.geometry.attributes.position;
    // Trace the true waistcoat lining, using the very same warp columns on
    // both detail tiers. A uniform seam allowance fits its varying curvature.
    for (let h = 0; h < 2; h++)
      for (let j = 0; j < 56; j++) {
        const a = (tau * j) / 56,
          base = 37 * 56 + j,
          pad = 0.00084 + h * 0.00135;
        let k = 0;
        for (let i = 0; i <= 14; i++) {
          const index = (h * 15 + i) * 56 + j,
            y = rp.getY(index);
          while (k < 35 && vp.getY(base + 56 * (k + 1)) < y) k++;
          const lo = base + 56 * k,
            hi = lo + 56;
          const y0 = vp.getY(lo),
            f = T.MathUtils.clamp((y - y0) / (vp.getY(hi) - y0), 0, 1);
          const mix = 1 - T.MathUtils.smoothstep(y0 - y, 0, 0.01);
          rp.setXYZ(
            index,
            lerp(riseRest[index * 3], lerp(vp.getX(lo), vp.getX(hi), f) - pad * Math.sin(a), mix),
            y,
            lerp(riseRest[index * 3 + 2], lerp(vp.getZ(lo), vp.getZ(hi), f) - pad * Math.cos(a), mix),
          );
        }
      }
    rp.needsUpdate = true;
    for (const { sign, leg, layer, bounds, sphere } of parts) {
      bounds.makeEmpty();
      leg.updateWorldMatrix(true, false);
      tr.multiplyMatrices(chestInv, leg.matrixWorld);
      up.setFromMatrixColumn(tr, 1).normalize();
      legInv.copy(tr).invert();
      const p = layer.geometry.attributes.position,
        n = layer.geometry.attributes.normal,
        lp = leg.geometry.attributes.position;
      for (let h = 0; h < 2; h++)
        for (let j = 0; j < around; j++) {
          const u = j / around,
            a = u * tau,
            cut = sign * Math.sin(a) < 0;
          sampleRow(rp, h * 15 * 56, 56, u, upper);
          sampleRow(rp, h * 15 * 56, 56, 0, front);
          sampleRow(rp, h * 15 * 56, 56, 0.5, back);
          if (cut) {
            upper.x = sign * (0.00032 + h * 0.00055);
            upper.z = lerp(back.z, front.z, 0.5 + 0.5 * Math.cos(a));
          }
          const beltY = upper.y - 0.00065;
          upper.y = beltY - (cut ? 0.055 * Math.abs(Math.sin(a)) : 0);
          // Keep a submillimetre sewing allowance at the original leg edge.
          lower
            .fromBufferAttribute(lp, (h * 45 + 44) * around + j)
            .applyMatrix4(tr)
            .addScaledVector(up, 0.00055);
          const dist = lower.distanceTo(upper);
          start.copy(lower).addScaledVector(up, Math.min(0.03, 0.38 * dist));
          end.copy(upper);
          end.y -= Math.min(0.025, dist * 0.27);
          for (let i = 0; i <= rows; i++) {
            const f = i / rows,
              g = 1 - f,
              index = (h * (rows + 1) + i) * around + j;
            tPoint.set(
              g * g * g * lower.x + 3 * g * g * f * start.x + 3 * g * f * f * end.x + f * f * f * upper.x,
              Math.min(
                beltY,
                g * g * g * lower.y + 3 * g * g * f * start.y + 3 * g * f * f * end.y + f * f * f * upper.y,
              ),
              g * g * g * lower.z + 3 * g * g * f * start.z + 3 * g * f * f * end.z + f * f * f * upper.z,
            );
            if (i > 0 && i < rows) {
              tPoint.applyMatrix4(legInv);
              tPoint.y = Math.max(-0.0893 + i * 0.00011, tPoint.y);
              tPoint.applyMatrix4(tr);
              // The inseam turns from the leg into the centre crease. Keep
              // its facing panels on their own side while the pelvis twists.
              const ease = T.MathUtils.smoothstep(i, 0, 3);
              tPoint.x = sign * lerp(sign * tPoint.x, Math.max(0.0004 + 0.00065 * h, sign * tPoint.x), ease);
            }
            p.setXYZ(index, tPoint.x, tPoint.y, tPoint.z);
            bounds.expandByPoint(tPoint);
          }
        }
      bounds.getBoundingSphere(sphere);
      // The marker normals stay attached to the independent panels as the cut
      // curves over a tucked thigh.
      for (let h = 0; h < 2; h++)
        for (let i = 0; i <= rows; i++)
          for (let j = 0; j < around; j++) {
            const index = (h * (rows + 1) + i) * around + j,
              lo = (h * (rows + 1) + Math.max(0, i - 1)) * around + j,
              hi = (h * (rows + 1) + Math.min(rows, i + 1)) * around + j,
              l = index - j + ((j + around - 1) % around),
              r = index - j + ((j + 1) % around);
            start.fromBufferAttribute(p, r);
            end.fromBufferAttribute(p, l);
            start.sub(end);
            end.fromBufferAttribute(p, hi);
            tPoint.fromBufferAttribute(p, lo);
            end.sub(tPoint);
            start
              .cross(end)
              .normalize()
              .multiplyScalar(h ? -1 : 1);
            n.setXYZ(index, start.x, start.y, start.z);
          }
      p.needsUpdate = n.needsUpdate = true;
    }
    grid.update();
    const jp = jacket.geometry.attributes.position;
    for (const { m, sign, data } of tails) {
      const count = 19,
        knotRow = 4,
        t = knotRow / 44,
        open =
          0.205 +
          0.185 * T.MathUtils.smoothstep(t, 0.41, 0.9) +
          0.076 * Math.exp(-(((t - 0.985) / 0.12) ** 2));
      m.parent.updateWorldMatrix(true, false);
      tailInv.copy(m.parent.matrixWorld).invert().multiply(chest.matrixWorld);
      for (let h = 0; h < 2; h++)
        for (let j = 0; j < count; j++) {
          const a = Math.PI - sign * lerp(0.037, 0.88, j / 18),
            f = ((a - open) / (tau - 2 * open)) * 68,
            k = Math.floor(f);
          start.fromBufferAttribute(jp, knotRow * 69 + k);
          end.fromBufferAttribute(jp, knotRow * 69 + k + 1);
          start.lerp(end, f - k);
          const pad = h ? 0.0005 : 0.0011;
          start.x += Math.sin(a) * pad;
          start.z += Math.cos(a) * pad;
          for (let i = 0; i < 19; i++) {
            const q = (18 - i) / 18,
              length = 0.033 + 0.008 * Math.sin((j / 18) * Math.PI),
              drop = q * length,
              v = ((h * 19 + i) * 19 + j) * 3;
            data[v] = start.x * (1 + 0.055 * q);
            data[v + 1] = start.y - drop;
            data[v + 2] = start.z - 0.0022 * q - 0.0025 * q * q - m.parent.rotation.x * drop * 0.65;
          }
        }
      for (let h = 0; h < 2; h++)
        for (let i = 0; i < 18; i++)
          for (let j = 0; j < 18; j++) {
            const a = ((h * 19 + i) * 19 + j) * 3,
              b = a + 3,
              c = a + 57,
              d = c + 3;
            const bound = grid.support(
              Math.min(data[a], data[b], data[c], data[d]),
              Math.max(data[a], data[b], data[c], data[d]),
              Math.min(data[a + 1], data[b + 1], data[c + 1], data[d + 1]),
              Math.max(data[a + 1], data[b + 1], data[c + 1], data[d + 1]),
            );
            data[a + 2] = Math.min(data[a + 2], bound - h * 0.00015);
            data[b + 2] = Math.min(data[b + 2], bound - h * 0.00015);
            if (i !== 17) {
              data[c + 2] = Math.min(data[c + 2], bound - h * 0.00015);
              data[d + 2] = Math.min(data[d + 2], bound - h * 0.00015);
            }
          }
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        tPoint.fromArray(data, i * 3).applyMatrix4(tailInv);
        p.setXYZ(i, tPoint.x, tPoint.y, tPoint.z);
      }
      p.needsUpdate = true;
    }
  }
  for (const { layer, leg } of parts) {
    bindCloth(layer, [leg.parent, chest], (i, g) => [0, 1, T.MathUtils.smoothstep(g.attributes.uv.getY(i), 0, 1)]);
  }
}
