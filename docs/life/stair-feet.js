// Stable heel/toe targets in the navigation surface's coordinate system.
// Consecutive schedule entries alternate feet, including the steps of a turn.
import * as T from 'three';

const ease = T.MathUtils.smoothstep,
  lerp = T.MathUtils.lerp;
export function stairFeet(root, feet, sides, pelvis) {
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  function footprint(path, index, side, foot, out) {
    path.point(index, out);
    const tread = path.tread(index),
      yaw = path.facing(index),
      sc = root.scale.y;
    const lateral = side.h * sc;
    let advance = -0.5 * (foot.heel.z + foot.toe.z) * sc;
    if (tread && Math.cos(yaw) * tread.dz + Math.sin(yaw) * tread.dx > 0.85) {
      // Keep the toe back from the next riser while keeping the heel on this tread.
      advance = 0.5 * tread.pitch - 0.0215 * path.unit - foot.toe.z * sc;
    }
    const co = Math.cos(yaw),
      sn = Math.sin(yaw);
    out.x += lateral * co + advance * sn;
    out.z += advance * co - lateral * sn;
  }
  return function solve(path) {
    const n = Math.floor(path.step),
      u = path.step - n,
      sc = root.scale.y;
    const pos = root.position,
      yaw = root.rotation.y,
      cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    for (let i = 0; i < 2; i++) {
      const f = feet[i],
        s = sides[i];
      const lead = ((n % 2) + 2) % 2 === i,
        previous = lead ? n : n - 1,
        next = previous + 2;
      const planted = lead || u < 0.035;
      const swing = lead ? 0 : T.MathUtils.clamp((u - 0.035) / 0.965, 0, 1);
      footprint(path, previous, s, f, a);
      footprint(path, next, s, f, b);
      const t0 = path.tread(previous),
        t1 = path.tread(next);
      const flight = t0 || t1;
      const sideways = flight ? ease(swing, 0.24, 0.78) : ease(swing, 0.03, 0.95);
      const yaw0 = path.facing(previous),
        yaw1 = path.facing(next);
      f.yaw = yaw0 + sideways * Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0));
      f.hold.copy(a);
      f.from.copy(a);
      f.target.lerpVectors(a, b, sideways);
      const ascending = b.y > a.y + 1e-5,
        descending = b.y < a.y - 1e-5,
        clear = 0.072 * path.unit;
      let height = a.y;
      if (!planted) {
        if (flight) {
          const mid = path.point(previous + 1, c).y;
          // Raise the knee before translating the toe across a vertical face.
          // On the way down, the rear of the shoe must clear the upper nosing first.
          if (ascending) {
            height = lerp(a.y, mid + clear, ease(swing, 0, 0.235));
            height += (b.y - mid) * ease(swing, 0.24, 0.49);
            height -= clear * ease(swing, 0.79, 1);
          } else if (descending) {
            height += clear * ease(swing, 0, 0.23);
            height += (mid - a.y) * ease(swing, 0.53, 0.73);
            height += (b.y - mid - clear) * ease(swing, 0.81, 1);
          } else height += clear * (ease(swing, 0, 0.24) - ease(swing, 0.77, 1));
        } else height = lerp(a.y, b.y, sideways) + 0.075 * sc * Math.sin(Math.PI * swing);
      }
      const descent = path.direction < 0;
      // Toe-first descent rotates around the planted toe until the heel settles.
      f.pitch = descent ? (planted ? 0.055 * (1 - ease(u, 0, 0.23)) : 0.055 * ease(swing, 0.81, 1)) : 0;
      const pitch = f.pitch,
        toe = f.toe;
      const dz = toe.y * (0 - Math.sin(pitch)) + toe.z * (1 - Math.cos(pitch));
      const dx = (f.target.x - pos.x + dz * sc * Math.sin(f.yaw)) / sc;
      const zz = (f.target.z - pos.z + dz * sc * Math.cos(f.yaw)) / sc;
      f.model.set(
        dx * cy - zz * sy,
        (height - pos.y) / sc - toe.y * Math.cos(pitch) + toe.z * Math.sin(pitch),
        dx * sy + zz * cy,
      );
      f.phase = lead ? u * 0.5 : 0.5 + u * 0.5;
      f.swing = swing;
      f.planted = planted;
      f.height = height;
    }
    path.point(n - 1, a);
    path.point(n, b);
    path.point(n + 1, c);
    // Carry the pelvis from one support midpoint to the next without pulling
    // it toward the trailing ankle. The lead knee has room to extend under load.
    const supportingHeight = lerp((a.y + b.y) * 0.5, (b.y + c.y) * 0.5, u);
    const stepping = Math.abs(c.y - a.y) > 1e-5;
    pelvis.position.y = (supportingHeight - pos.y) / sc + (stepping ? 0.757 : 0.78);
  };
}
