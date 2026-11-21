// The walking Sippy skin is sewn to his cargo pattern. At maximum hip flexion
// that pattern pinches the upper thigh flat. Preserve the inspection skin's
// topology and its shared groin seam, and reconstruct the covered cross
// sections around the posed femoral shaft. No walking vertices are modified.
import { Vector3 } from 'three';

export function restoreThighVolume(parts, rig, pelvis) {
  supportPelvicRing(parts, rig, pelvis);
  if (rig.name !== 'sippy') return;
  const body = parts.find(p => p.name === 'Continuous body, limbs and hands').mesh.geometry;
  const src = rig.secondary.sippy.body.geometry;
  const sourceIndex = src.index.array, frozenIndex = body.index.array;
  if (sourceIndex.length !== frozenIndex.length) throw new Error('Incomplete continuous Sippy skin');
  // joinPart deduplicates and reorders the vertices while retaining the
  // triangle sequence. Recover the live knee ring's corresponding vertex IDs.
  const remap = new Uint32Array(src.attributes.position.count);
  for (let i = 0; i < sourceIndex.length; i++) remap[sourceIndex[i]] = frozenIndex[i];
  const positions = body.attributes.position;
  const point = idx => new Vector3().fromBufferAttribute(positions, remap[idx]);
  const radiusX = [0.025, 0.027, 0.029, 0.030, 0.029, 0.031, 0.035, 0.038, 0.041, 0.042, 0.043, 0.043, 0.041, 0.039];
  const radiusZ = [0.028, 0.028, 0.029, 0.030, 0.030, 0.032, 0.036, 0.040, 0.043, 0.045, 0.047, 0.047, 0.046, 0.045];
  const stations = [-0.29, -0.16, -0.065, 0, 0.08, 0.21, 0.34, 0.49, 0.62, 0.69, 0.76, 0.83, 0.90, 0.97];
  const h = rig.height;
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const knee = rig.blueprint.knee[s === 1 ? 0 : 1].parts[0];
    const ids = knee.vertices[src === knee.mesh.userData.mobileGeometry ? 'mobile' : 'high'];
    const n = ids.length, start = ids[0], hip = pelvis[side];
    const kneeCenter = new Vector3();
    for (const id of ids) kneeCenter.add(point(id));
    kneeCenter.divideScalar(n);
    const top = hip.junction.clone().lerp(hip.femoralHead, 0.25);
    const up = top.clone().sub(kneeCenter).normalize(), length = kneeCenter.distanceTo(top);
    const cross = hip.outer.clone().multiplyScalar(s).projectOnPlane(up).normalize();
    const front = new Vector3().crossVectors(cross, up).normalize();
    const cortex = [];
    const legCortex=[];
    const shankUp=hip.knee.clone().sub(hip.ankle).normalize();
    const thighUp=top.clone().sub(hip.knee).normalize();
    const jointRef=hip.knee;
    const full = side === 'L' ? 'LEFT' : 'RIGHT';
    for (const bone of parts.filter(p => ['FEMUR_', 'PATELLA_', 'TIBIA_', 'FIBULA_'].some(id => p.scanNode === id + full))) {
      const a = bone.mesh.geometry.attributes.position;
      for (let j = 0; j < a.count; j++) {
        const v = new Vector3().fromBufferAttribute(a,j);
        if(v.distanceTo(jointRef)<h*.083)legCortex.push(v.clone());
        if(!/^(FEMUR|PATELLA)_/.test(bone.scanNode)) continue;
        v.sub(kneeCenter);
        cortex.push([v.dot(up) / length, v.dot(cross), v.dot(front)]);
      }
    }
    for (let k = 0; k < stations.length; k++) {
      const t = stations[k];
      const offset = k - 3;
      const begin = start + offset * n + Number(offset >= 6);
      const center = kneeCenter.clone().lerp(top, t);
      const old = new Vector3();
      for (let j = 0; j < n; j++) old.add(point(begin + j));
      old.divideScalar(n);
      if (t < 0) center.copy(old);
      const xr = radiusX[k] * h, zr = radiusZ[k] * h;
      const cx = center.clone().sub(kneeCenter).dot(cross), cz = center.clone().sub(kneeCenter).dot(front);
      let scale = 1;
      const range = k < 2 ? 0.04 : 0.068;
      for (const [level, x, z] of cortex) {
        if (Math.abs(level - t) > range) continue;
        const dist = Math.hypot((x - cx) / xr, (z - cz) / zr);
        scale = Math.max(scale, dist + 0.19);
      }
      // At the knee the skin rings transition from the tangent of the calf
      // to the tangent of the thigh. A stack of thigh-normal ellipses folds
      // back on itself during a running stride, uncovering the medial condyle.
      if(offset>=-2 && offset<=2){
        const mix=Math.max(0,Math.min(1,(t+.16)/.37));
        const tangent=shankUp.clone().lerp(thighUp,mix*mix*(3-2*mix)).normalize();
        const sideAxis=hip.outer.clone().multiplyScalar(s).projectOnPlane(tangent).normalize();
        const faceAxis=new Vector3().crossVectors(sideAxis,tangent).normalize();
        const mid=jointRef.clone().addScaledVector(t<0?shankUp:thighUp,t*length);
        let radius=h*.033;
        for(const q of legCortex){
          const local=q.clone().sub(mid), along=local.dot(tangent);
          if(Math.abs(along)>h*.021)continue;
          radius=Math.max(radius,Math.hypot(local.dot(sideAxis),local.dot(faceAxis)) + h*.006);
        }
        for(let j=0;j<n;j++){
          const angle=2*Math.PI*j/n;
          const q=mid.clone().addScaledVector(sideAxis,radius*Math.sin(angle))
            .addScaledVector(faceAxis,radius*Math.cos(angle));
          positions.setXYZ(remap[begin+j],q.x,q.y,q.z);
        }
        continue;
      }
      const shankBlend = Math.max(0, -t / 0.29);
      for (let j = 0; j < n; j++) {
        const a = 2 * Math.PI * j / n;
        const target = center.clone()
          .addScaledVector(cross, xr * scale * Math.sin(a))
          .addScaledVector(front, zr * scale * Math.cos(a));
        target.lerp(point(begin + j), shankBlend);
        positions.setXYZ(remap[begin + j], target.x, target.y, target.z);
      }
    }
  }
  body.computeVertexNormals();
  body.computeBoundingBox();
  body.computeBoundingSphere();
}

// Support the covered abdominal and gluteal wall on each subject's own
// iliac flare and sacrum. Convex angular stations keep the iliac crest
// readable without copying the bone's facets into the skin.
function supportPelvicRing(parts, rig, pelvis) {
  const roma = rig.name === 'roma';
  const body = parts.find(p => p.name === (roma ? 'Covered torso and hips' : 'Continuous body, limbs and hands')).mesh.geometry;
  const positions = body.attributes.position, h = rig.height;
  const origin = pelvis.place(0, 0, 0);
  const xAxis = pelvis.place(1, 0, 0).sub(origin).normalize();
  const yAxis = pelvis.place(0, 1, 0).sub(origin).normalize();
  const zAxis = pelvis.place(0, 0, 1).sub(origin).normalize();
  const levels = 34, sectors = 32, bottom = -0.060 * h, step = 0.007 * h;
  const profile = new Float32Array(levels * sectors);
  const v = new Vector3();
  for (const p of parts.filter(p => ['HIP_LEFT', 'HIP_RIGHT', 'SACRUM', 'FEMUR_LEFT', 'FEMUR_RIGHT'].includes(p.scanNode) || /^VERTEBRA_L/.test(p.scanNode))) {
    const a = p.mesh.geometry.attributes.position;
    for (let j = 0; j < a.count; j++) {
      v.fromBufferAttribute(a, j).sub(origin);
      const x = v.dot(xAxis), z = v.dot(zAxis), y = v.dot(yAxis);
      if (p.scanNode.startsWith('FEMUR') && y < -0.070 * h) continue;
      const radius = Math.hypot(x,z);
      const k = Math.round((y - bottom) / step);
      const turn = Math.atan2(x, z) / (2 * Math.PI);
      const l = Math.round(turn * sectors);
      for (let dk = -3; dk <= 3; dk++) {
        if (k + dk < 0 || k + dk >= levels) continue;
        for (let dl = -2; dl <= 2; dl++) {
          const index = (k + dk) * sectors + (l + dl + sectors) % sectors;
          const padding = h * (0.006 - 0.0004 * dk * dk - 0.0007 * dl * dl);
          profile[index] = Math.max(profile[index], radius + padding);
        }
      }
    }
  }
  const remap = new Set();
  if (roma) {
    for (let j = 0; j < positions.count; j++) remap.add(j);
  } else {
    const src = rig.secondary.sippy.body.geometry;
    const n = rig.blueprint.knee[0].parts[0].vertices[src === rig.secondary.sippy.body.userData.mobileGeometry ? 'mobile' : 'high'].length;
    const base = src.index.array, out = body.index.array;
    // The seven uninterrupted lower trunk rings precede the sleeve opening.
    for (let i = 0; i < base.length; i++) if (base[i] < 7 * n) remap.add(out[i]);
  }
  for (const j of remap) {
    v.fromBufferAttribute(positions, j).sub(origin);
    const x = v.dot(xAxis), z = v.dot(zAxis), y = v.dot(yAxis), radius = Math.hypot(x,z);
    if (radius < 0.002 * h) continue;
    const k = Math.round((y - bottom) / step), l = Math.round(Math.atan2(x, z) / (2 * Math.PI) * sectors);
    if (k < -1 || k > levels) continue;
    const outer = profile[Math.min(levels - 1, Math.max(0,k)) * sectors + (l + sectors) % sectors];
    if (outer <= radius) continue;
    v.addScaledVector(xAxis, x / radius * (outer - radius)).addScaledVector(zAxis, z / radius * (outer - radius)).add(origin);
    positions.setXYZ(j, v.x, v.y, v.z);
  }
  body.computeVertexNormals();
  body.computeBoundingBox();
  body.computeBoundingSphere();
}

export function supportShoulders(parts, rig) {
  const roma = rig.name === 'roma', h = rig.height;
  const body = parts.find(p => p.name === (roma ? 'Covered torso and hips' : 'Continuous body, limbs and hands')).mesh.geometry;
  const position = body.attributes.position, v = new Vector3();
  const trunk = new Set();
  const right = new Vector3(1,0,0).transformDirection(rig.chest.matrixWorld);
  const up = new Vector3(0,1,0).transformDirection(rig.chest.matrixWorld);
  const forward = new Vector3(0,0,1).transformDirection(rig.chest.matrixWorld);
  const level = rig.upperArmL.getWorldPosition(new Vector3()).lerp(rig.upperArmR.getWorldPosition(new Vector3()), 0.5);
  if (roma) {
    for (let j = 0; j < position.count; j++) trunk.add(j);
    for (const side of ['Left','Right']) {
      const g = parts.find(p => p.name === side + ' covered arm').mesh.geometry;
      const a = g.attributes.position;
      const sign = side === 'Left' ? 1 : -1;
      for (let j = 0; j < a.count; j++) {
        v.fromBufferAttribute(a,j).sub(level);
        const x = sign * v.dot(right) / h, y = v.dot(up) / h, z = v.dot(forward) / h;
        const belly = Math.exp(-(((x - 0.090) / 0.034) ** 2) - ((y + 0.019) / 0.027) ** 2);
        v.addScaledVector(up, -0.013 * h * belly)
          .addScaledVector(forward, z * h * 0.22 * belly).add(level);
        a.setXYZ(j, v.x, v.y, v.z);
      }
      g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    }
  } else {
    const src = rig.secondary.sippy.body.geometry;
    const source = src.index.array, out = body.index.array;
    const remap = new Uint32Array(src.attributes.position.count);
    for (let i = 0; i < source.length; i++) remap[source[i]] = out[i];
    for (const [side, sign] of [['L',1],['R',-1]]) {
      const ref = rig.blueprint.knee[side === 'L' ? 0 : 1].parts[0];
      const ring = ref.vertices[src === ref.mesh.userData.mobileGeometry ? 'mobile' : 'high'];
      const n = ring.length;
      const get = i => new Vector3().fromBufferAttribute(position, remap[i]);
      for (let k = 0; k < 11; k++) {
        // The continuous skin has eleven rings along its sewn sleeve crown.
        // Inner arc forms the anterior and posterior axillary folds; outer
        // arc covers the tubercle and broad head of the deltoid.
        const base = ring[0] + (23 + k) * n + 1;
        const center = new Vector3();
        for (let j = 0; j < n; j++) center.add(get(base + j));
        center.divideScalar(n);
        const around = get(base + n/4).sub(get(base + 3*n/4)).multiplyScalar(0.5);
        const front = get(base).sub(get(base + n/2)).multiplyScalar(0.5);
        const f = k / 10;
        for (let j = 0; j < n; j++) {
          const sin = Math.sin(2*Math.PI*j/n), cos = Math.cos(2*Math.PI*j/n);
          const hollow = Math.max(0, -sign * sin);
          const cap = Math.sin(f * Math.PI);
          const q = center.clone()
            .addScaledVector(around, sin * (1.21 + 0.33*cap + 0.35*hollow))
            .addScaledVector(front, cos * (1.38 + 0.52*cap))
            .addScaledVector(up, -h * (0.012 + 0.026*cap) * hollow * (0.25 + f))
            .addScaledVector(right, -sign * h * 0.014 * hollow * cap);
          position.setXYZ(remap[base+j], q.x,q.y,q.z);
        }
      }
      // Torso rings below and around the sleeve opening, excluding the collar.
      for (let i = 0; i < 12*n - 4; i++) trunk.add(remap[i]);
    }
  }
  for (const j of trunk) {
    v.fromBufferAttribute(position,j).sub(level);
    const x = v.dot(right) / h, y = v.dot(up) / h, z = v.dot(forward) / h;
    const lateral = Math.min(1, Math.max(0, (Math.abs(x)-0.025)/0.042));
    const volume = Math.exp(-(((y + 0.045)/0.057)**2)) * lateral*lateral;
    v.addScaledVector(right, Math.sign(x) * h * volume * (roma ? .010 : .023))
      .addScaledVector(forward, h * z * .17 * volume).add(level);
    position.setXYZ(j,v.x,v.y,v.z);
  }
  body.computeVertexNormals(); body.computeBoundingBox(); body.computeBoundingSphere();
}
