import { Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { atlasCharts, atlasRegion } from './diagram-muscle-charts.js';
import { corticalProjector, muscleSites, peripheralSites } from './diagram-muscle-insertions.js';
import { muscleDisplayName } from './diagram-muscle-names.js';
import { makeOrbitalAtlasFit } from './diagram-muscle-orbits.js';
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
      offset.addScaledVector(a.delta, w);
    }
    if (sum) {
      const attenuation = 1 / (1 + (min / (radius * radius)) ** 2);
      base.addScaledVector(offset, attenuation / sum);
    }
    pos.setXYZ(i, base.x, base.y, base.z);
  }
  return anchors;
}

export function addScanMuscles(rig, roma, parts, atlas, lm) {
  const project = corticalProjector(lm);
  const charts = atlasCharts(rig, roma, lm, project),
    orbital = makeOrbitalAtlasFit(rig, lm, atlas, parts);
  const material = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3 });
  lm.scan.attachments = [];
  for (const [id, source] of atlas) {
    const center = source.boundingBox.getCenter(v());
    const side = sideOf(id, center),
      s = side === 'L' ? 1 : -1,
      frames = charts[side];
    const eye = orbital(id),
      region = eye ? 'orbit' : atlasRegion(id, source);
    let transform;
    if (eye) transform = eye;
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
  fitAtlasMuscles(parts, rig, lm);
}
