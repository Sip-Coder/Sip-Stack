import * as T from 'three';
import { FIXED_DT } from '/characters/motion.js';

// A single point can move with the entire head. Average a cross-section of
// rendered vertices at each station, then measure directions in head space.
function strandStations(chain) {
  const end = chain.rest.length - 1;
  const surfaces = chain.surfaces.map((s) => {
    const matrix = s.toMesh.clone().invert();
    return { s, matrix };
  });
  return [0, 0.25, 0.75, 1].map((fraction) => {
    const candidates = [];
    for (const { s, matrix } of surfaces) {
      const values = Array.from(s.segment, (segment, i) => (segment + s.fraction[i]) / end);
      const best = Math.min(...values.map((u) => Math.abs(u - fraction)));
      values.forEach((u, i) => {
        if (Math.abs(u - fraction) <= best + 0.006) candidates.push({ mesh: s.mesh, i, matrix });
      });
    }
    const p = new T.Vector3();
    return () => {
      const mean = new T.Vector3();
      for (const { mesh, i, matrix } of candidates)
        mean.add(p.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(matrix));
      return mean.divideScalar(candidates.length);
    };
  });
}
const degrees = T.MathUtils.radToDeg;
const average = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function quantile(a, f) {
  const v = [...a].sort((x, y) => x - y),
    i = (v.length - 1) * f,
    j = Math.floor(i);
  return T.MathUtils.lerp(v[j], v[Math.ceil(i)], i - j);
}
function distribution(a) {
  return {
    min: Math.min(...a),
    p25: quantile(a, 0.25),
    median: quantile(a, 0.5),
    p75: quantile(a, 0.75),
    max: Math.max(...a),
  };
}
function meanDirection(a) {
  return a.reduce((sum, p) => sum.add(p), new T.Vector3()).normalize();
}
function angularRange(a) {
  let minimum = 1;
  for (let i = 0; i < a.length; i += 2)
    for (let j = i + 1; j < a.length; j += 2) minimum = Math.min(minimum, a[i].dot(a[j]));
  return degrees(Math.acos(T.MathUtils.clamp(minimum, -1, 1)));
}
function strongestFrequency(signal, minHz, maxHz) {
  const mean = average(signal),
    x = signal.map((v) => v - mean);
  let hz = minHz,
    power = 0;
  for (let f = minHz; f <= maxHz; f += 0.015) {
    let c = 0,
      s = 0;
    x.forEach((v, i) => {
      const a = 2 * Math.PI * f * i * FIXED_DT;
      c += v * Math.cos(a);
      s += v * Math.sin(a);
    });
    const strength = c * c + s * s;
    if (strength > power) {
      power = strength;
      hz = f;
    }
  }
  return hz;
}
function harmonicShare(series, hz) {
  const mid = average(series),
    n = series.length,
    omega = 2 * Math.PI * hz * FIXED_DT;
  let c = 0,
    s = 0,
    total = 0;
  series.forEach((v, i) => {
    const q = v - mid;
    c += q * Math.cos(omega * i);
    s += q * Math.sin(omega * i);
    total += q * q;
  });
  return total ? Math.min(1, (2 * (c * c + s * s)) / (n * total)) : 0;
}
function phaseLag(driver, driven, hz) {
  function angle(data) {
    const mid = average(data);
    let c = 0,
      s = 0;
    data.forEach((v, i) => {
      const a = 2 * Math.PI * hz * i * FIXED_DT;
      c += (v - mid) * Math.cos(a);
      s += (v - mid) * Math.sin(a);
    });
    return Math.atan2(s, c);
  }
  const delta = angle(driven) - angle(driver);
  return Math.atan2(Math.sin(delta), Math.cos(delta)) / (2 * Math.PI * hz * FIXED_DT);
}
// Sample settling against the same face, shoulder and coat poses at the same
// breathing phase. Replay counteracts normal idle motion when isolating the
// remaining kinetic response to a stop.
export function captureIdleMotion(rig, system) {
  const nodes = new Set(),
    frames = [];
  for (const node of [...system.colliders.map((c) => c.node), ...system.chains.map((c) => c.group)])
    for (let p = node; p; p = p.parent) {
      nodes.add(p);
      if (p === rig.root) break;
    }
  function pose(item, time) {
    let i = 0;
    for (const node of nodes) {
      node.position.fromArray(item.pose, i);
      node.quaternion.fromArray(item.pose, i + 3);
      node.scale.fromArray(item.pose, i + 7);
      i += 10;
    }
    rig.root.updateMatrixWorld(true);
    system.step({ ...item.frame, time });
  }
  return {
    remember(frame) {
      const coords = new Float64Array(nodes.size * 10);
      let i = 0;
      for (const n of nodes) {
        n.position.toArray(coords, i);
        n.quaternion.toArray(coords, i + 3);
        n.scale.toArray(coords, i + 7);
        i += 10;
      }
      frames.push({ pose: coords, frame: { ...frame } });
    },
    replay(read) {
      let time = 100;
      for (let j = frames.length - 1; j >= 0; j--) pose(frames[j], (time += FIXED_DT));
      frames.forEach((item, i) => {
        pose(item, (time += FIXED_DT));
        read(i);
      });
    },
  };
}

export function checkFlorence({ rig, controller, input, animate, name, height, result, check }) {
  if (!rig.hair) return;
  const api = rig.secondary[name],
    system = rig.hair,
    tracks = system.chains.map((chain) => ({
      chain,
      stations: strandStations(chain),
      frames: [],
      role: chain.role || 'mass',
      name: chain.group.name,
    }));
  const idleDrivers = captureIdleMotion(rig, system);
  const panels = [];
  if (name === 'roma')
    for (const [type, pairs] of Object.entries(api.panels ?? {}))
      for (const [i, pair] of pairs.entries())
        panels.push({ type, name: i ? 'back' : 'front', mesh: api[type], ...pair, frames: [] });
  const heights = [],
    hipHeights = [],
    breathing = [];
  const driveHz = 1.25,
    amplitude = 0.014;
  controller.reset(-12, -15);
  Object.assign(input, { x: 0, z: 0, run: false, jump: false, roll: false, emote: false });
  // Each window retains several uninterrupted steady cycles. The final
  // calibrated lateral input uses a real attached rig and the production
  // animator, allowing a signed root-to-tip lag without phase ambiguity.
  const idleEnd = 438,
    walkEnd = 636,
    runEnd = 805,
    stopEnd = 1035,
    end = stopEnd + 216;
  let stopped;
  const m = new T.Matrix4(),
    q = new T.Vector3(),
    headInverse = new T.Matrix4();
  for (let i = 0; i < end; i++) {
    input.z = i >= idleEnd && i < runEnd ? 1 : 0;
    input.run = i >= walkEnd && i < runEnd;
    const f = controller.step(FIXED_DT, input);
    if (i >= stopEnd)
      rig.hips.position.x += amplitude * Math.sin(2 * Math.PI * driveHz * (i - stopEnd) * FIXED_DT);
    animate(f);
    controller.finishPose();
    rig.root.updateMatrixWorld(true);
    if (i >= runEnd && f.speed < 0.02 && stopped == null) stopped = i;
    breathing.push(rig.chest.rotation.x);
    hipHeights.push(rig.hips.getWorldPosition(q).y);
    if (stopped != null && i < stopEnd) idleDrivers.remember(f);
    heights.push(rig.head.getWorldPosition(q).y);

    headInverse.copy(rig.head.matrixWorld).invert();
    for (const track of tracks) {
      const p = track.stations.map((sample) => sample());
      m.multiplyMatrices(headInverse, track.chain.group.matrixWorld);
      const h = p.map((v) => v.clone().applyMatrix4(m).multiplyScalar(height));
      const worldTip = p[3].clone().applyMatrix4(track.chain.group.matrixWorld);
      track.restTip ??= p[3].clone();
      const rigidTip = track.restTip.clone().applyMatrix4(track.chain.group.matrixWorld);
      track.frames.push({
        prox: h[1].clone().sub(h[0]).normalize(),
        distal: h[3].clone().sub(h[2]).normalize(),
        chord: h[3].clone().sub(h[0]).normalize(),
        root: h[0],
        tip: h[3],
        worldTip,
        rigidTip,
        span: h[3].distanceTo(h[0]),
      });
    }
    for (const panel of panels) {
      const pos = panel.mesh.geometry.attributes.position;
      const tip = new T.Vector3().fromBufferAttribute(pos, panel.tip),
        pin = new T.Vector3().fromBufferAttribute(pos, panel.anchor);
      const scale = panel.mesh.getWorldScale(new T.Vector3());
      panel.equilibrium ??= tip.clone();
      const rigid = panel.equilibrium.clone().applyMatrix4(panel.mesh.matrixWorld),
        world = tip.clone().applyMatrix4(panel.mesh.matrixWorld);
      panel.frames.push({
        direction: tip.clone().sub(pin).multiply(scale).normalize(),
        radius: Math.hypot(tip.x * scale.x, tip.z * scale.z),
        localTipM: tip.clone().multiply(scale),
        rigidX: rigid.x,
        worldX: world.x,
        rigidY: rigid.y,
        worldY: world.y,
      });
    }
  }
  const idle = [80, idleEnd],
    walk = [idleEnd + 53, walkEnd],
    run = [walkEnd + 50, runEnd],
    response = [stopEnd + 24, end];
  const residualAngles = tracks.map(() => []);
  idleDrivers.replay((i) => {
    headInverse.copy(rig.head.matrixWorld).invert();
    tracks.forEach((track, j) => {
      m.multiplyMatrices(headInverse, track.chain.group.matrixWorld);
      const a = track.stations[2]().applyMatrix4(m),
        b = track.stations[3]().applyMatrix4(m);
      residualAngles[j].push(
        degrees(
          b
            .sub(a)
            .normalize()
            .angleTo(track.frames[stopped + i].distal),
        ),
      );
    });
  });
  const rows = tracks.map((track, index) => {
    const read = (key, window) => track.frames.slice(...window).map((f) => f[key]);
    const range = (key, w) => angularRange(read(key, w));
    const resting = meanDirection(read('distal', [stopEnd - 100, stopEnd]));
    const air = track.frames.slice(stopped, stopEnd).map((f) => degrees(f.distal.angleTo(resting)));
    const pos = read('root', walk),
      rootDelta = new T.Box3().setFromPoints(pos).getSize(new T.Vector3()).length();
    const drift = read('distal', idle);
    const axis = drift
      .slice(1)
      .reduce((f, p) => (p.distanceToSquared(drift[0]) > f.distanceToSquared(drift[0]) ? p : f), drift[0])
      .clone()
      .sub(drift[0])
      .normalize();
    const idleSignal = drift.map((p) => p.dot(axis));
    const idleHz = strongestFrequency(idleSignal, 0.12, 1.4);
    const chestBreath = breathing.slice(...idle),
      breathHz = strongestFrequency(chestBreath, 0.12, 0.7);
    const idleBreathCoherence = harmonicShare(idleSignal, breathHz);
    const h = hipHeights.slice(...walk),
      lo = quantile(h, 0.25),
      hi = quantile(h, 0.75);
    const walkFrames = track.frames.slice(...walk),
      lower = walkFrames.filter((_, i) => h[i] < lo),
      upper = walkFrames.filter((_, i) => h[i] > hi);
    const span = (data) => average(data.map((f) => f.span));
    const drop = (data) => average(data.map((f) => Math.abs(f.root.y - f.tip.y)));
    const compressedSpanMm = (span(upper) - span(lower)) * 1000,
      compressedDropMm = (drop(upper) - drop(lower)) * 1000;
    const calibrate = track.frames.slice(...response),
      gait = track.frames.slice(...walk);
    const bobHz = strongestFrequency(heights.slice(...walk), 1, 4);
    return {
      name: track.name,
      role: track.role,
      segments: track.chain.nodes.length - 1,
      walkDeg: range('distal', walk),
      runDeg: range('distal', run),
      idleDeg: range('distal', idle),
      rootWalkDeg: range('prox', walk),
      chordWalkDeg: range('chord', walk),
      rootTravelMm: rootDelta * 1000,
      lagFrames: phaseLag(
        calibrate.map((f) => f.rigidTip.x),
        calibrate.map((f) => f.worldTip.x),
        driveHz,
      ),
      walkBobLagFrames: phaseLag(
        gait.map((f) => f.rigidTip.y),
        gait.map((f) => f.worldTip.y),
        bobHz,
      ),
      idleHz,
      idleBreathCoherence,
      compressedSpanMm,
      compressedDropMm,
      fromIdleMeanSettleS: (air.findLastIndex((v) => v > 3) + 1) * FIXED_DT,
      settleS: (residualAngles[index].findLastIndex((v) => v > 3) + 1) * FIXED_DT,
    };
  });
  const groups = {};
  for (const [key, population] of [
    ['all', rows],
    ['face', rows.filter((r) => r.role === 'face')],
    ['mass', rows.filter((r) => r.role !== 'face')],
  ]) {
    if (!population.length) continue;
    const metrics = (groups[key] = {});
    for (const field of [
      'walkDeg',
      'runDeg',
      'idleDeg',
      'idleHz',
      'rootWalkDeg',
      'chordWalkDeg',
      'rootTravelMm',
      'lagFrames',
      'walkBobLagFrames',
      'idleBreathCoherence',
      'compressedSpanMm',
      'compressedDropMm',
      'settleS',
    ])
      metrics[field] = distribution(population.map((r) => r[field]));
  }
  // Measure actual width changes among neighboring, distinct tips, grouped
  // by the sign of the world-space head velocity on the same walk step.
  const fanning = [],
    faceIndependence = [];
  for (const track of tracks.filter((t) => t.role === 'face')) {
    const mass = tracks
      .filter((t) => t.role !== 'face')
      .sort(
        (a, b) =>
          track.frames[walk[0]].tip.distanceToSquared(a.frames[walk[0]].tip) -
          track.frames[walk[0]].tip.distanceToSquared(b.frames[walk[0]].tip),
      )[0];
    if (!mass) continue;
    const angles = [];
    for (let i = walk[0]; i < walk[1]; i++)
      angles.push(degrees(track.frames[i].distal.angleTo(mass.frames[i].distal)));
    faceIndependence.push({
      pair: [track.name, mass.name],
      independentRangeDeg: Math.max(...angles) - Math.min(...angles),
    });
  }
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k];
    let neighbor = null,
      nearest = Infinity;
    for (let j = 0; j < tracks.length; j++)
      if (j !== k) {
        const d = track.frames[walk[0]].tip.distanceTo(tracks[j].frames[walk[0]].tip);
        if (d > 1e-4 && d < nearest) {
          nearest = d;
          neighbor = tracks[j];
        }
      }
    if (!neighbor) continue;
    const ascending = [],
      descending = [];
    for (let i = walk[0]; i < walk[1]; i++) {
      const d = track.frames[i].tip.distanceTo(neighbor.frames[i].tip);
      (heights[i] > heights[i - 1] ? ascending : descending).push(d);
    }
    fanning.push({
      pair: [track.name, neighbor.name],
      spreadMm: (Math.max(...ascending, ...descending) - Math.min(...ascending, ...descending)) * 1000,
      upMinusDownMm: (average(ascending) - average(descending)) * 1000,
    });
  }
  result.secondary.florence = {
    reference: {
      file: 'florence-hair.mp4',
      durationS: 6,
      frames: 144,
      fps: 24,
      visibleActions: ['walk', 'combat idle'],
    },
    requestedRanges: { walkTipDeg: [10, 20], idleTipDeg: [1, 3], settledErrorDeg: 3 },
    engineeringBounds: {
      lagFrames: [0.3, 12],
      idleMaxHz: 0.55,
      maximumIndividualIdleDeg: 4.5,
      everyClumpSettleLimitS: 1.5,
      rootTravelMaxMm: 3,
    },
    sourceFps: 24,
    measurementHz: 1 / FIXED_DT,
    angularMeasure: 'peak-to-peak 3D arc between rendered distal tangents',
    calibratedInputHz: driveHz,
    breathHz: strongestFrequency(breathing.slice(...idle), 0.12, 0.7),
    groups,
    rows,
    faceIndependence,
    idleStyleOutliers: rows
      .filter((r) => r.idleDeg < 1 || r.idleDeg > 3)
      .map((r) => ({ lock: r.name, idleDeg: r.idleDeg })),
    settleReference: 'same recorded idle bones and breathing, after an idle warmup',
    fanning: {
      rangeMm: distribution(fanning.map((p) => p.spreadMm)),
      upMinusDownMm: distribution(fanning.map((p) => p.upMinusDownMm)),
    },
    cloth: {},
  };
  const report = result.secondary.florence;
  const all = groups.all;
  check(
    rows.every((r) => r.segments === 3 || r.segments === 4),
    'Florence 3–4 articulated segments per lock',
  );
  check(!!groups.face && !!groups.mass, 'Florence independent face and mass locks');
  check(
    Object.values(groups).every((g) => g.walkDeg.median >= 10 && g.walkDeg.median <= 20),
    'Florence median walk tip range 10–20 degrees in face and mass regions',
  );
  check(
    Object.values(groups).every((g) => g.idleDeg.median >= 1 && g.idleDeg.median <= 3),
    'Florence median idle tip range 1–3 degrees in face and mass regions',
  );
  check(
    all.idleHz.median < 0.55 && all.idleBreathCoherence.median > 0.45,
    'Florence low-frequency chest-breathing sway',
  );
  check(
    faceIndependence.length && faceIndependence.every((p) => p.independentRangeDeg > 0.5),
    'Florence measured independence of face strands',
  );
  check(
    all.compressedSpanMm.median > 0.02 || all.compressedDropMm.median > 0.02,
    'Florence compression on downstep',
  );
  check(all.lagFrames.median > 0.3 && all.lagFrames.median < 12, 'Florence positive tip lag');
  check(
    all.rootTravelMm.median < 3 && all.rootWalkDeg.median < all.walkDeg.median,
    'Florence roots follow the head',
  );
  for (const row of rows) {
    check(row.settleS < 1.5, 'Florence ' + row.name + ' settle within three degrees');
    check(row.idleDeg <= 4.5, 'Florence ' + row.name + ' sustained idle motion exceeds 4.5 degrees');
  }
  check(
    report.fanning.rangeMm.median > 0.1 && report.fanning.upMinusDownMm.p75 > 0.05,
    'Florence independent tip spread rises on upswing',
  );
  for (const panel of panels) {
    const range = (w) => angularRange(panel.frames.slice(...w).map((f) => f.direction));
    const neutral = meanDirection(panel.frames.slice(stopEnd - 100, stopEnd).map((f) => f.direction));
    const air = panel.frames.slice(stopped, stopEnd).map((f) => degrees(f.direction.angleTo(neutral)));
    const forced = panel.frames.slice(...response),
      gait = panel.frames.slice(...walk),
      breath = panel.frames.slice(...idle);
    const breathComponents = {};
    for (const axis of ['x', 'y', 'z']) {
      const series = breath.map((f) => f.localTipM[axis]),
        range = Math.max(...series) - Math.min(...series);
      const coherence = harmonicShare(series, report.breathHz);
      breathComponents[axis] = { peakToPeakMm: range * 1000, frequencyPowerFraction: coherence };
    }
    const stats = {
      walkDeg: range(walk),
      runDeg: range(run),
      idleDeg: range(idle),
      lagFrames: phaseLag(
        forced.map((f) => f.rigidX),
        forced.map((f) => f.worldX),
        driveHz,
      ),
      walkBobLagFrames: phaseLag(
        gait.map((f) => f.rigidY),
        gait.map((f) => f.worldY),
        strongestFrequency(hipHeights.slice(...walk), 1, 4),
      ),
      bobFlareMm: (Math.max(...gait.map((f) => f.radius)) - Math.min(...gait.map((f) => f.radius))) * 1000,
      idleBreathingMm:
        (Math.max(...breath.map((f) => f.radius)) - Math.min(...breath.map((f) => f.radius))) * 1000,
      bobFlareCoherence: harmonicShare(
        gait.map((f) => f.radius),
        strongestFrequency(hipHeights.slice(...walk), 1, 4),
      ),
      breathComponents,
      idleBreathCoherence: harmonicShare(
        breath.map((f) => f.radius),
        report.breathHz,
      ),
      settleS: (air.findLastIndex((v) => v > 3) + 1) * FIXED_DT,
    };
    (report.cloth[panel.type] ??= {})[panel.name] = stats;
  }
  if (name === 'roma') {
    check(panels.length >= 4, 'Roma garment upper and lower material markers');
    for (const part of Object.values(report.cloth.jacket ?? {})) {
      check(part.walkDeg < all.walkDeg.median && part.walkDeg > 0.2, 'Roma tailored panel stiffer than hair');
      check(part.lagFrames > 0.1 && part.lagFrames < 4, 'Roma tailored panel has bounded inertial lag');
      check(
        part.bobFlareMm > 0.2 &&
          part.bobFlareCoherence > 0.05 &&
          part.idleBreathingMm > 0.05 &&
          Object.values(part.breathComponents).some(
            (c) => c.peakToPeakMm > 0.15 && c.frequencyPowerFraction > 0.35,
          ),
        'Roma cloth visible bob and breathing',
      );
      check(part.settleS < 1.5, 'Roma cloth settles within three degrees');
    }
  }
}
