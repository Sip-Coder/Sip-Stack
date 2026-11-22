import { Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { atlasCharts, atlasRegion } from './diagram-muscle-charts.js';
import { corticalProjector, muscleSites, peripheralSites } from './diagram-muscle-insertions.js';
import { skinGauge } from './diagram-thorax.js';
import { muscleDisplayName } from './diagram-muscle-names.js';
import { makeOrbitalAtlasFit } from './diagram-muscle-orbits.js';
import { muscleEnvelope } from './diagram-fascia.js';
import { deepThroat, throatChart } from './diagram-muscle-throat.js';
import { prepareAtlasMuscle, fitAtlasMuscles } from './diagram-muscle-surface.js';

const v = () => new Vector3();
function sideOf(id, center) {
  if (/(^|_)left(_|$)/.test(id)) return 'L';
  if (/(^|_)right(_|$)/.test(id)) return 'R';
  return center.x >= 0 ? 'L' : 'R';
}
function partTitle(id, center) {
  let label = id.replace(/_FJ\w+$/, '').replaceAll('_', ' ');
  if (!/(^| )(left|right)( |$)/.test(label) && Math.abs(center.x) > 0.008)
    label = (center.x > 0 ? 'left ' : 'right ') + label;
  // Some source meshes share the base anatomy name, yet are distinct parts.
  // Keep a stable unique picker key for each FJ element.
  if (/_FJ\w+$/.test(id)) label += ' (' + id.split('_').at(-1) + ')';
  return label[0].toUpperCase() + label.slice(1);
}

function nearestIndex(a, seed) {
  const p = v();
  let best = Infinity,
    index = 0;
  for (let i = 0; i < a.count; i++) {
    const d = p.fromBufferAttribute(a, i).distanceToSquared(seed);
    if (d < best) {
      best = d;
      index = i;
    }
  }
  return index;
}

// Diffuse each origin correction through its own neighborhood; the braced
// shape and intervening tendon path continue to follow the segment charts.
// Inverse-distance weights interpolate the constraints at their own vertices.
function attach(geometry, source, chart, sites, project, mirror) {
  const pos = geometry.attributes.position,
    donor = source.attributes.position;
  const bounds = source.boundingBox.getSize(v());
  const radius = Math.max(0.025, bounds.length() * 0.75);
  const anchors = [];
  for (const spec of sites) {
    const seed = spec.source.clone();
    if (mirror) seed.x *= -1;
    const index = nearestIndex(donor, seed);
    if (anchors.some((a) => a.index === index)) continue;
    const src = v().fromBufferAttribute(donor, index),
      mapped = chart(src);
    const target = project(spec.bone, spec.hint ?? mapped);
    anchors.push({
      bone: spec.bone,
      index,
      source: src,
      role: spec.role,
      influenceRadius: spec.influenceRadius,
      target,
      delta: target.clone().sub(mapped),
    });
  }
  if (anchors.length > 1) anchors.at(-1).role = 'insertion';
  const offset = v(),
    raw = v();
  for (let i = 0; i < pos.count; i++) {
    const base = chart(raw.fromBufferAttribute(donor, i));
    let sum = 0,
      min = Infinity;
    offset.set(0, 0, 0);
    for (const a of anchors) {
      const d2 = raw.distanceToSquared(a.source);
      min = Math.min(min, d2);
      if (d2 < 1e-14) {
        offset.copy(a.delta);
        sum = 1;
        break;
      }
      const w = 1 / (d2 * d2);
      sum += w;
      const falloff = a.influenceRadius ? 1 / (1 + (d2 / a.influenceRadius ** 2) ** 2) : 1;
      offset.addScaledVector(a.delta, w * falloff);
    }
    if (sum) {
      const attenuation = 1 / (1 + (min / (radius * radius)) ** 2);
      base.addScaledVector(offset, attenuation / sum);
    }
    pos.setXYZ(i, base.x, base.y, base.z);
  }
  return anchors;
}

// Adult superficial sheets cover the wall of a much deeper thorax. A
// skeletal chart alone lets the character's fitted ribs and deep abdominal
// muscles poke through them. Seat the sheets in the subcutaneous layer,
// preserving their relief, attachment footprints and moving humeral slips.
const superficialTrunk = /pectoralis_major|rectus_abdominis|latissimus_dorsi|trapezius/;

function subcutaneousSheet(lm, parts, height, envelope) {
  const { chest } = lm.thorax;
  const low = Math.min(...['L', 'R'].map((side) => chest.from(lm.pelvis[side].pubis).y));
  const high = Math.max(...['L', 'R'].map((side) => chest.from(lm.shoulders[side].acromion).y));
  const skinRadius = skinGauge(parts, chest, low, high, 79, 72);
  const donor = v(), world = v(), sample = v(), chestForward = chest.direction(0, 0, 1);
  const smooth = (x) => {
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  };
  return (id, geometry, source, anchors, shoulder) => {
    if (!superficialTrunk.test(id)) return;
    const positions = geometry.attributes.position;
    const pectoral = id.includes('pectoralis_major');
    const posteriorFold = id.includes('latissimus_dorsi');
    const { sternoclavicular, headCenter, axes } = shoulder;
    const span = headCenter.clone().sub(sternoclavicular).dot(axes.x);
    for (let i = 0; i < positions.count; i++) {
      donor.fromBufferAttribute(source.attributes.position, i);
      const local = chest.from(world.fromBufferAttribute(positions, i));
      const radius = Math.hypot(local.x, local.z);
      const outer = skinRadius(local.y, Math.atan2(local.x, local.z));
      if (radius < height * 0.006) continue;
      let nearestSq = Infinity;
      for (const anchor of anchors) nearestSq = Math.min(nearestSq, donor.distanceToSquared(anchor.source));
      const free = smooth(Math.sqrt(nearestSq) / 0.037);
      const axial = 1 - smooth((Math.abs(donor.x) - 0.118) / 0.052) * smooth((donor.y - 1.269) / 0.099);
      const edge = smooth((local.y - low) / (height * 0.016)) * smooth((high - local.y) / (height * 0.016));
      const space = Number.isFinite(outer) ? Math.min(height * 0.035, Math.max(0, outer - height * 0.00075 - radius)) : 0;
      const shift = 0.96 * space * free * axial * edge / radius;
      world.copy(chest.point(local.x * (1 + shift), local.y, local.z * (1 + shift)));
      if (pectoral || posteriorFold) {
        // Wrap the converging lateral fan over the anterior axillary fold
        // before it descends to the humeral lip. A straight interpolation
        // from ribs to humerus would cut diagonally across the hollow.
        const t = world.clone().sub(sternoclavicular).dot(axes.x) / span;
        const slip = posteriorFold
          ? smooth((donor.y - 1.221) / 0.086) * smooth((Math.abs(donor.x) - 0.074) / 0.042)
          : smooth((donor.y - 1.201) / 0.113);
        const wrap = smooth((t - 0.43) / 0.25) * (1 - smooth((t - 0.83) / 0.24)) * slip * free;
        const roof = sternoclavicular.clone().lerp(shoulder.acromioclavicular, Math.min(1, t / 0.83));
        roof.lerp(headCenter, smooth((t - 0.80) / 0.22));
        const offset = world.clone().sub(roof);
        const dy = offset.dot(axes.y), dz = offset.dot(axes.z);
        const under = height * 0.0065, depth = height * 0.008;
        if (dy < 0) world.addScaledVector(axes.y, (-under * Math.tanh(-dy / under) - dy) * wrap);
        const bias = posteriorFold ? -0.65 : 0.45;
        world.addScaledVector(axes.z, (depth * (bias + Math.tanh(dz / depth - bias)) - dz) * wrap);
      }
      // The stylized back is particularly shallow. Register the free wall
      // against the actual anterior/posterior skin intersection as well as
      // the radial section. This keeps rib relief beneath the continuous
      // fan between the donor's real margins, even in an oblique view.
      const outward = pectoral || id.includes('rectus_abdominis') ? 1 : -1;
      const wall = free * (1 - smooth((Math.abs(donor.x) - 0.128) / 0.04))
        * smooth((donor.y - 0.86) / 0.12) * (1 - smooth((donor.y - 1.37) / 0.06));
      if (wall > 0 && envelope.inside(world)) {
        let inner = 0, outer = height * 0.023;
        for (let j = 0; j < 7; j++) {
          const d = (inner + outer) / 2;
          if (envelope.inside(sample.copy(world).addScaledVector(chestForward, outward * d))) inner = d;
          else outer = d;
        }
        const travel = Math.max(0, inner - height * 0.00115);
        world.addScaledVector(chestForward, outward * travel * wall * 0.96);
      }
      world.toArray(positions.array, i * 3);
    }
  };
}

export function addScanMuscles(rig, roma, parts, atlas, lm) {
  const project = corticalProjector(lm);
  const charts = atlasCharts(rig, roma, lm, project),
    orbital = makeOrbitalAtlasFit(rig, lm, atlas, parts);
  const fit = muscleEnvelope(parts, rig.height),
    oral = throatChart(charts.L.trunk, fit, lm, atlas);
  const seatSheet = subcutaneousSheet(lm, parts, rig.height, fit);
  const material = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3 });
  lm.scan.attachments = [];
  for (const [id, source] of atlas) {
    const center = source.boundingBox.getCenter(v());
    const side = sideOf(id, center),
      s = side === 'L' ? 1 : -1,
      frames = charts[side];
    const eye = orbital(id),
      region = eye ? 'orbit' : deepThroat.test(id) ? 'oral' : atlasRegion(id, source);
    let transform;
    if (eye) transform = eye;
    else if (region === 'oral') transform = oral;
    else if (region === 'shoulder') transform = frames.cuff;
    else if (['gluteal', 'adductor', 'hip'].includes(region)) transform = (p) => frames.hipWarp(region, p);
    else transform = frames[region];
    // Four named parts in the supplied 2013 atlas are mirrored relative to
    // their anatomical label. Retain the label and restore the named side.
    const mirror = s * center.x < -0.006 && /middle_pharyngeal_constrictor|flexor_pollicis_brevis/.test(id);
    const reflected = v(),
      chart = mirror
        ? (p) => {
            reflected.copy(p);
            reflected.x *= -1;
            return transform(reflected);
          }
        : transform;
    let sites = eye ? [] : muscleSites(id, side, lm, source);
    const peripheral = peripheralSites(id, side, source, region);
    if (!sites.length) sites = peripheral;
    else if (sites.length === 1 && peripheral.length && sites[0].role === 'origin')
      sites.push(peripheral.at(-1));
    const g = source.clone();
    if (mirror) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) [ix[i], ix[i + 1]] = [ix[i + 1], ix[i]];
    }
    const anchors = attach(g, source, chart, sites, project, mirror);
    seatSheet(id, g, source, anchors, lm.shoulders[side]);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    prepareAtlasMuscle(source, g, id, anchors);
    const label = muscleDisplayName(source, partTitle(id, center));
    const mesh = new Mesh(g, material);
    mesh.name = label;
    const tissue = {
      name: label,
      layer: 'muscles',
      mesh,
      muscleNode: id,
      atlasNode: id,
      region,
      sourcePart: source.userData.sourcePart,
      source: source.userData.sourceAtlas ?? 'BodyParts3D · DBCLS',
      attachments: anchors,
    };
    parts.push(tissue);
    for (const a of anchors)
      lm.scan.attachments.push({ muscle: id, bone: a.bone, point: a.target, index: a.index, role: a.role });
  }
  // Some fitted ribs lie within 0.16 in of the skin. The generic coarse-grid
  // reserve can move an entire back sheet behind those ribs. For these broad
  // thin sheets, check the actual skin triangles around each marginal point.
  const probe = v(), clearance = rig.height * 0.0008;
  const hasClearance = (p) => {
    if (fit.hasReserve(p)) return true;
    for (const axis of ['x', 'y', 'z']) {
      probe.copy(p);
      probe[axis] += clearance;
      if (!fit.inside(probe)) return false;
      probe[axis] -= 2 * clearance;
      if (!fit.inside(probe)) return false;
    }
    return fit.inside(p);
  };
  const coarse = v(), between = v();
  const thin = (p) => {
    if (hasClearance(p)) return p;
    fit(coarse.copy(p));
    if (!hasClearance(coarse)) return p.copy(coarse);
    let near = 0, far = 1;
    for (let i = 0; i < 6; i++) {
      const fraction = (near + far) / 2;
      if (hasClearance(between.lerpVectors(p, coarse, fraction))) far = fraction;
      else near = fraction;
    }
    return p.lerp(coarse, far);
  };
  thin.hasReserve = hasClearance;
  thin.inside = fit.inside;
  // The broad costal and spinal roots retain their subcutaneous seat.
  // As the humerus swings, the insertion ends of both axillary walls share
  // the shoulder's deeper reserve across the narrowing chest-arm crease.
  const foldEnvelopes = Object.fromEntries(['L', 'R'].map((side) => {
    const arm = rig['upperArm' + side].rotation;
    // Opposed arm swing twists the posterior sheet across Sippy's continuous
    // back. A bilateral forward tuck folds the skin and sheet together.
    const otherArm = rig[side === 'L' ? 'upperArmR' : 'upperArmL'].rotation;
    const swing = roma
      ? Math.hypot(arm.x, arm.y, Math.max(0, Math.abs(arm.z) - 0.09))
      : Math.max(0, -arm.x) * Math.min(1, Math.max(0, otherArm.x) / 0.24);
    const t = Math.min(1, Math.max(0, swing - 0.03) / 0.21);
    const reserve = t * t * (3 - 2 * t);
    const cutaneous = v(), deep = v();
    const fitFold = (p) => {
      if (!reserve) return thin(p);
      // In the continuous shell a fibre already seated under the skin
      // should retain its local relief over the posterior ribs.
      if (!roma && hasClearance(p)) return p;
      if (reserve === 1) return fit(p);
      cutaneous.copy(p);
      thin(cutaneous);
      return p.lerpVectors(cutaneous, fit(deep.copy(p)), reserve);
    };
    fitFold.inside = fit.inside;
    fitFold.hasReserve = hasClearance;
    return [side, fitFold];
  }));
  fitAtlasMuscles(parts, rig, atlas, (part) => {
    if (!superficialTrunk.test(part.muscleNode)) return { fit };
    const crossesFold = part.region === 'axillary' && (roma || /latissimus/.test(part.muscleNode));
    const fold = crossesFold && foldEnvelopes[part.muscleNode.startsWith('left_') ? 'L' : 'R'];
    return { fit: fold || thin, thinSheet: true };
  });
}
