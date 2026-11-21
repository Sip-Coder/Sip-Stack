// Place the source articular head in the opposing scanned fossa. The CT
// subjects were imaged unloaded. Keep a small living joint space and blend
// the proximal translation into the re-posed shaft before its distal joint.
import { Ray, Vector3, MathUtils } from 'three';

function hitDistance(geometry, center, direction) {
  const pos = geometry.attributes.position,
    index = geometry.index.array;
  const ray = new Ray(center, direction),
    a = new Vector3(),
    b = a.clone(),
    c = a.clone(),
    hit = a.clone();
  let nearest = Infinity;
  for (let i = 0; i < index.length; i += 3) {
    a.fromBufferAttribute(pos, index[i]);
    b.fromBufferAttribute(pos, index[i + 1]);
    c.fromBufferAttribute(pos, index[i + 2]);
    if (ray.intersectTriangle(a, b, c, false, hit)) nearest = Math.min(nearest, hit.distanceTo(center));
  }
  return nearest;
}

// A scapular glenoid has an oblique bearing plane. Identify the central
// articular facets facing the actual head, using triangle area so that a
// coarser LOD cannot bias the direction toward a densely sampled rim.
function glenoidBearing(geometry, center, approximate, height) {
  const a = new Vector3(),
    b = a.clone(),
    c = a.clone(),
    p = a.clone(),
    n = a.clone(),
    d = a.clone(),
    ab = a.clone(),
    ac = a.clone();
  const sum = new Vector3(),
    pos = geometry.attributes.position,
    ids = geometry.index.array;
  for (let k = 0; k < ids.length; k += 3) {
    a.fromBufferAttribute(pos, ids[k]);
    b.fromBufferAttribute(pos, ids[k + 1]);
    c.fromBufferAttribute(pos, ids[k + 2]);
    p.copy(a)
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    d.subVectors(center, p);
    const r = d.length();
    if (r < 0.008 * height || r > 0.024 * height) continue;
    d.divideScalar(r);
    const bearing = d.dot(approximate);
    if (bearing < 0.67) continue;
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = n.length();
    if (area === 0) continue;
    const facing = n.divideScalar(area).dot(d);
    if (facing < 0.72) continue;
    sum.addScaledVector(d, area * facing * bearing);
  }
  return sum.lengthSq() > 0 ? sum.normalize() : approximate;
}

function seat(ball, socket, center, axis, end, h) {
  const direction = axis.clone().negate().normalize();
  const up = new Vector3(0, 1, 0).projectOnPlane(direction).normalize();
  const forward = new Vector3().crossVectors(direction, up);
  const samples = [];
  for (const [u, v] of [
    [0, 0],
    [0.1, 0],
    [-0.1, 0],
    [0, 0.1],
    [0, -0.1],
  ]) {
    const ray = direction.clone().addScaledVector(up, u).addScaledVector(forward, v).normalize();
    const a = hitDistance(ball, center, ray),
      b = hitDistance(socket, center, ray);
    if (Number.isFinite(a + b) && Math.abs(b - a) < 0.035) samples.push(b - a);
  }
  if (samples.length < 3) return;
  samples.sort((a, b) => a - b);
  const move = MathUtils.clamp(samples[Math.floor(samples.length / 2)] - 0.0025, -0.008, 0.015);
  const pos = ball.attributes.position,
    p = new Vector3(),
    down = end.clone().sub(center).normalize();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const distance = p.clone().sub(center).dot(down);
    const weight = 1 - MathUtils.smoothstep(distance, 0.037 * h, 0.13 * h);
    p.addScaledVector(direction, move * weight);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  center.addScaledVector(direction, move);
  ball.computeVertexNormals();
  ball.computeBoundingBox();
  ball.computeBoundingSphere();
}

export function seatScanJoints(fitted, landmarks, height) {
  for (const [side, suffix] of [
    ['L', '_LEFT'],
    ['R', '_RIGHT'],
  ]) {
    const hip = landmarks.pelvis[side],
      arm = landmarks.shoulders[side];
    seat(
      fitted.get('FEMUR' + suffix),
      fitted.get('HIP' + suffix),
      hip.femoralHead,
      hip.socketAxis,
      hip.knee,
      height,
    );
    arm.shoulderNormal.copy(
      glenoidBearing(fitted.get('SCAPULA' + suffix), arm.headCenter, arm.shoulderNormal, height),
    );
    seat(
      fitted.get('HUMERUS' + suffix),
      fitted.get('SCAPULA' + suffix),
      arm.headCenter,
      arm.shoulderNormal,
      arm.elbow,
      height,
    );
  }
}
