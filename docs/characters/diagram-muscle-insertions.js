// Point pairs are anatomical features in the supplied DBCLS rest chart.
// For each paired feature the source endpoint is the nearest REAL vertex of
// that muscle. Its destination is the closest point on the named posed CT
// triangle, seeded by the feature (e.g. AIIS, rather than the hip center).
import { Triangle, Vector3 } from 'three';
const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

export function corticalProjector(landmarks) {
  const tri = new Triangle(),
    hit = v(),
    cache = new Map();
  const project = (bone, seed) => {
    const key =
      bone +
      ' ' +
      seed
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(',');
    if (cache.has(key)) return cache.get(key).clone();
    const g = landmarks.scan.bones.get(bone);
    if (!g) throw new Error('Unknown CT attachment ' + bone);
    const pos = g.attributes.position,
      ix = g.index.array,
      out = v();
    let best = Infinity;
    for (let i = 0; i < ix.length; i += 3) {
      tri.a.fromBufferAttribute(pos, ix[i]);
      tri.b.fromBufferAttribute(pos, ix[i + 1]);
      tri.c.fromBufferAttribute(pos, ix[i + 2]);
      tri.closestPointToPoint(seed, hit);
      const d = hit.distanceToSquared(seed);
      if (d < best) {
        best = d;
        out.copy(hit);
      }
    }
    cache.set(key, out);
    return out.clone();
  };
  return project;
}

export function muscleSites(id, side, lm, geometry) {
  const s = side === 'L' ? 1 : -1,
    suffix = side === 'L' ? '_LEFT' : '_RIGHT';
  const a = lm.shoulders[side],
    b = lm.pelvis[side],
    t = lm.thorax,
    h = lm.head.sides[side];
  const site = (bone, xyz, hint, role = 'origin') => ({
    bone,
    source: v(s * xyz[0], xyz[1], xyz[2]),
    hint,
    role,
  });
  const bone = (n, xyz, hint, role) => site(n + suffix, xyz, hint, role);
  const hip = (xyz, hint) => bone('HIP', xyz, hint);
  const femur = (xyz, hint) => bone('FEMUR', xyz, hint, 'insertion');
  const scap = (xyz, hint) => bone('SCAPULA', xyz, hint);
  const hum = (xyz, hint, role = 'insertion') => bone('HUMERUS', xyz, hint, role);
  const shin = (xyz, hint) => bone('TIBIA', xyz, hint, 'insertion');
  const vertebra = (level, xyz, role) => site('VERTEBRA_' + level, xyz, t.spinous(level), role);
  const rib = (level, xyz, along, role) => bone('RIB_' + level, xyz, t.rib(side, level, along), role);
  const crest = hip([0.102, 1.013, -0.063], b.crest),
    asis = hip([0.125, 0.975, 0.026], b.asis);
  const pubis = hip([0.021, 0.868, 0.028], b.pubis),
    ischium = hip([0.054, 0.829, -0.062], b.ischium);
  const trochanter = femur([0.137, 0.858, -0.034], b.greaterTrochanter);
  const lesser = femur([0.094, 0.812, -0.031], b.lesserTrochanter);
  const medialTibia = shin([0.049, 0.386, -0.01], b.shinPoint(0.11, -0.007, 0.003));
  const humeralTubercle = hum([0.187, 1.385, -0.026], a.headCenter.clone().addScaledVector(a.axes.x, 0.029));
  const medialEpic = a.humerusAt(0.974, -0.007, 0.001),
    lateralEpic = a.humerusAt(0.976, 0.008, 0.001);
  const humMedial = hum([0.18, 1.12, -0.034], medialEpic, 'origin'),
    humLateral = hum([0.23, 1.131, -0.047], lateralEpic, 'origin');
  const calc = bone('CALCANEUS', [0.076, 0.024, -0.063], null, 'insertion');
  if (/gluteus_maximus/.test(id))
    return [
      hip([0.074, 0.987, -0.096], b.posteriorCrest),
      site('SACRUM', [0.01, 0.917, -0.105], lm.pelvis.sacralTip),
      femur([0.128, 0.773, -0.06], b.glutealTuberosity),
    ];
  if (/gluteus_medius|minimus/.test(id) && /gluteus/.test(id))
    return [crest, hip([0.115, 0.975, -0.004], b.anteriorCrest), trochanter];
  if (/adductor_(magnus|longus|brevis|minimus)|pectineus/.test(id)) {
    const level = /magnus/.test(id) ? 0.89 : /longus/.test(id) ? 0.59 : /brevis/.test(id) ? 0.41 : 0.28;
    const dest = femur([0.092, 0.865 - level * 0.42, -0.026], b.shaftPoint(level, -0.004, -0.004));
    return /magnus/.test(id)
      ? [pubis, ischium, dest, femur([0.061, 0.468, -0.028], b.medialCondyle)]
      : [pubis, dest];
  }
  if (/gracilis/.test(id)) return [pubis, medialTibia];
  if (/tensor_fasciae/.test(id)) return [asis]; // Distal insertion is fascia lata.
  if (/piriformis/.test(id)) return [site('SACRUM', [0.038, 0.93, -0.079], lm.pelvis.s1), trochanter];
  if (/obturator_|gemellus|quadratus_femoris/.test(id)) return [ischium, trochanter];
  if (/psoas_major/.test(id)) return [vertebra('L2', [0.026, 1.101, -0.024]), lesser];
  if (/iliacus/.test(id)) return [crest, asis, lesser];
  if (/sartorius/.test(id)) return [asis, medialTibia];
  if (/semimembranosus|semitendinosus/.test(id)) return [ischium, medialTibia];
  if (/biceps_femoris/.test(id))
    return [
      /short/.test(id) ? femur([0.111, 0.694, -0.041], b.lineaAspera) : ischium,
      bone('FIBULA', [0.113, 0.438, -0.032], b.shinPoint(0.06, 0.011, -0.003), 'insertion'),
    ];
  if (/rectus_femoris/.test(id))
    return [
      hip([0.119, 0.951, 0.023], b.aiis),
      bone('PATELLA', [0.08, 0.468, 0.032], b.patella, 'insertion'),
    ];
  if (/vastus/.test(id))
    return [
      femur([0.11, 0.808, -0.031], b.shaftPoint(0.15, 0.001, -0.003)),
      bone('PATELLA', [0.077, 0.467, 0.031], b.patella, 'insertion'),
    ];
  if (/soleus|gastrocnemius|superficial_muscle_of_posterior_compartment_of_leg/.test(id)) {
    const kneeOrigin =
      /gastrocnemius|FJ1429/.test(id) || (!/FJ1437|soleus/.test(id) && geometry.boundingBox.max.y > 0.48);
    return [
      kneeOrigin
        ? femur([0.076, 0.482, -0.04], b.shaftPoint(0.971, 0, -0.006))
        : bone('FIBULA', [0.107, 0.412, -0.033], b.shinPoint(0.108, 0.011, -0.002)),
      calc,
    ];
  }
  if (/popliteus|deep_muscle_of_posterior_compartment_of_leg/.test(id))
    return [
      femur([0.106, 0.47, -0.041], b.lateralCondyle),
      shin([0.061, 0.385, -0.041], b.shinPoint(0.154, -0.005, -0.005)),
    ];
  if (/supraspinatus/.test(id)) return [scap([0.069, 1.399, -0.079], a.superior), humeralTubercle];
  if (/infraspinatus/.test(id)) return [scap([0.079, 1.348, -0.099], a.medialBorder[1]), humeralTubercle];
  if (/subscapularis/.test(id))
    return [scap([0.081, 1.36, -0.073], a.medialBorder[1]), hum([0.165, 1.384, -0.006], a.humeralInsertion)];
  if (/teres_minor/.test(id)) return [scap([0.108, 1.303, -0.085], a.lateralLower), humeralTubercle];
  if (/teres_major/.test(id))
    return [scap([0.089, 1.266, -0.099], a.inferior), hum([0.169, 1.352, -0.027], a.humeralInsertion)];
  if (/coracobrachialis/.test(id))
    return [
      scap([0.133, 1.399, -0.006], a.coracoid),
      hum([0.185, 1.247, -0.03], a.humerusAt(0.51, -0.004, 0.001)),
    ];
  if (/brachialis/.test(id))
    return [
      hum([0.185, 1.277, -0.032], a.humerusAt(0.43, 0, 0.004), 'origin'),
      bone('ULNA', [0.202, 1.076, -0.025], a.forearmAt(0.095, -0.003, 0.003), 'insertion'),
    ];
  if (/anconeus/.test(id))
    return [humLateral, bone('ULNA', [0.211, 1.05, -0.051], a.forearmAt(0.145, -0.003, -0.004), 'insertion')];
  if (/pectoralis_minor/.test(id))
    return [
      rib(3, [0.071, 1.333, 0.068], 0.81),
      rib(5, [0.084, 1.261, 0.062], 0.8),
      scap([0.129, 1.397, -0.016], a.coracoid),
    ];
  if (/subclavius/.test(id))
    return [
      rib(1, [0.035, 1.385, 0.03], 0.92),
      bone('CLAVICLE', [0.098, 1.408, -0.02], a.clavicle[2], 'insertion'),
    ];
  if (/serratus_anterior/.test(id))
    return [
      rib(4, [0.117, 1.318, 0.051], 0.68),
      rib(8, [0.116, 1.161, 0.02], 0.68),
      scap([0.076, 1.359, -0.1], a.medialBorder[1]),
    ];
  if (/rhomboid/.test(id))
    return [
      vertebra(/minor/.test(id) ? 'T1' : 'T4', [0.001, /minor/.test(id) ? 1.444 : 1.32, -0.099]),
      scap([0.075, 1.362, -0.099], a.medialBorder[1]),
    ];
  if (/levator_scapulae/.test(id))
    return [vertebra('C3', [0.023, 1.523, -0.032]), scap([0.081, 1.388, -0.087], a.superior)];
  if (/sternocleidomastoid/.test(id))
    return [
      site('STERNUM', [0.004, 1.378, 0.047], t.manubrium),
      bone('CLAVICLE', [0.041, 1.393, 0.022], a.clavicle[0]),
      site('SKULL_CRANIAL_MAXILLA', [0.055, 1.565, -0.052], h.mastoid, 'insertion'),
    ];
  if (/external_oblique/.test(id))
    return [rib(6, [0.117, 1.27, 0.075], 0.72), rib(9, [0.119, 1.188, 0.041], 0.7), crest];
  if (/coccygeus/.test(id))
    return [
      hip([0.047, 0.874, -0.066], b.sciaticSpine),
      site('SACRUM', [0.009, 0.896, -0.091], lm.pelvis.coccyx, 'insertion'),
    ];
  if (/sternothyroid|sternohyoid/.test(id)) return [site('STERNUM', [0.012, 1.384, 0.037], t.manubrium)];
  if (/scalenus/.test(id))
    return [
      vertebra('C4', [0.024, 1.49, -0.03]),
      rib(/posterior/.test(id) ? 2 : 1, [0.054, 1.414, -0.024], 0.48, 'insertion'),
    ];
  if (/flexor_carpi|flexor_digitorum_superficialis|extensor_carpi|extensor_digiti_minimi/.test(id)) {
    if (geometry.boundingBox.max.y < 1.1) return [];
    return [/flexor/.test(id) ? humMedial : humLateral];
  }
  // All six intercostal pieces are multi-level groups. Each space gets
  // its own superior and inferior rib attachment so it bends with the cage.
  if (/intercostal_muscle/.test(id)) {
    const sites = [],
      anterior = /internal_|innermost/.test(id);
    const y = [1.396, 1.376, 1.352, 1.322, 1.295, 1.266, 1.236, 1.205, 1.177, 1.151, 1.128, 1.106];
    const x = [0.068, 0.086, 0.103, 0.118, 0.127, 0.131, 0.133, 0.132, 0.128, 0.121, 0.113, 0.1];
    for (let n = 1; n < 12; n++) {
      const at = (n, shift, role) =>
        bone(
          'RIB_' + n,
          [x[n - 1] * (anterior ? 0.88 : 1), y[n - 1] + shift, anterior ? 0.044 : -0.01],
          null,
          role,
        );
      sites.push(at(n, -0.006, 'origin'), at(n + 1, 0.007, 'insertion'));
    }
    return sites;
  }
  if (/diaphragm/.test(id))
    return [
      site('STERNUM', [0, 1.226, 0.091], t.xiphoid),
      site('VERTEBRA_L2', [0.019, 1.075, -0.038], t.vertebra('L2')),
      rib(11, [0.103, 1.119, -0.054], 0.78, 'insertion'),
    ];
  if (/serratus_posterior/.test(id)) {
    const upper = /superior/.test(id);
    return [
      vertebra(upper ? 'T1' : 'T12', [0.001, upper ? 1.448 : 1.139, -0.087]),
      rib(upper ? 4 : 10, upper ? [0.092, 1.328, -0.089] : [0.098, 1.161, -0.08], 0.28, 'insertion'),
    ];
  }
  if (/iliocostalis|longissimus|spinalis|postvertebral|rotator|intertransversarius|splenius/.test(id)) {
    const box = geometry.boundingBox,
      center = box.getCenter(v());
    const levelAt = (y) =>
      y < 1.155
        ? 'L' + Math.min(5, Math.max(1, Math.round(1 + (1.151 - y) / 0.035)))
        : y < 1.434
          ? 'T' + Math.min(12, Math.max(1, Math.round(1 + (1.424 - y) / 0.025)))
          : 'C' + Math.min(7, Math.max(1, Math.round(7 - (y - 1.434) / 0.019)));
    const pointAt = (y) => [Math.abs(center.x), y, center.z];
    const low = box.min.y < 0.99 ? crest : site('VERTEBRA_' + levelAt(box.min.y), pointAt(box.min.y), null);
    const high = /capitis/.test(id)
      ? site('SKULL_CRANIAL_MAXILLA', pointAt(box.max.y), h.mastoid, 'insertion')
      : site('VERTEBRA_' + levelAt(box.max.y), pointAt(box.max.y), null, 'insertion');
    return [low, high];
  }
  if (/rectus_capitis|obliquus_capitis|longus_capitis/.test(id)) {
    const low = geometry.boundingBox.min.y,
      from = /longus/.test(id) ? 'C4' : low < 1.536 ? 'C2' : 'C1';
    return [
      site('VERTEBRA_' + from, [0.025, low, -0.053], null),
      /obliquus_capitis_inferior/.test(id)
        ? site('VERTEBRA_C1', [0.032, 1.539, -0.033], null, 'insertion')
        : site('SKULL_CRANIAL_MAXILLA', [0.029, geometry.boundingBox.max.y, -0.062], null, 'insertion'),
    ];
  }
  if (/geniohyoid|genioglossus|mylohyoid/.test(id))
    return [site('SKULL_MANDIBLE', [0.004, 1.51, 0.055], null)];
  if (/stylohyoid|stylopharyngeus|tensor_veli_palatini|levator_veli_palatini/.test(id))
    return [site('SKULL_CRANIAL_MAXILLA', [0.034, geometry.boundingBox.max.y, -0.012], null)];
  if (/omohyoid/.test(id)) return [scap([0.103, 1.394, -0.075], a.superior)];
  if (/platysma/.test(id)) return [site('SKULL_MANDIBLE', [0.046, 1.521, 0.042], h.gonion, 'insertion')];
  // Other attachment families (phalangeal tendons, oral/cervical soft tissue,
  // fascial sheets) retain their actual source endpoints in the segmented fit.
  return [];
}

// Long, thin flexors span several segments. Retain the donor's tendon path
// through every joint, and seat only its distal endpoint on the corresponding
// metacarpal/phalanx (some parts stop at the wrist, before the finger slip).
export function peripheralSites(id, side, g, region) {
  const suffix = side === 'L' ? '_LEFT' : '_RIGHT',
    center = g.boundingBox.getCenter(v());
  const { min, max } = g.boundingBox,
    s = side === 'L' ? 1 : -1;
  const end = (bone, p, role) => ({ bone: bone + suffix, source: p, hint: null, role });
  const xz = (y) => v(center.x, y, center.z);
  const proximal = (b) => end(b, xz(max.y), 'origin'),
    distal = (b) => end(b, xz(min.y), 'insertion');
  const digit = /pollicis|hallucis/.test(id) ? 1 : /minimi/.test(id) ? 5 : 2;
  if (['leg', 'flexHallux', 'extendHallux', 'flexToes', 'extendToes'].includes(region)) {
    if (/_foot|hallucis_brevis|flexor_accessorius|digitorum_brevis|abductor_hallucis/.test(id)) {
      const plantar = /plantar_interosseous|lumbrical|opponens/.test(id);
      const j = /fourth/.test(id) ? 5 : /third/.test(id) ? 4 : /second/.test(id) ? 3 : digit;
      const heel = v(center.x, center.y, min.z),
        toe = v(s * (digit === 5 ? 0.148 : digit === 1 ? 0.066 : 0.104), center.y, max.z);
      return [
        end(plantar ? 'METATARSAL_' + j : 'CALCANEUS', heel, 'origin'),
        end('PHALANGE_FOOT_' + j, toe, 'insertion'),
      ];
    }
    const fibular = /fibularis|hallucis_longus|extensor_digitorum/.test(id),
      target = /fibularis_(brevis|tertius)/.test(id) ? 5 : digit;
    const dist = end(
      /tibialis_anterior|fibularis/.test(id)
        ? 'METATARSAL_' + target
        : /tibialis_posterior/.test(id)
          ? 'NAVICULAR'
          : 'PHALANGE_FOOT_' + target,
      v(center.x, min.y, max.z),
      'insertion',
    );
    return [proximal(fibular ? 'FIBULA' : 'TIBIA'), dist];
  }
  if (region === 'arm' || region === 'thumb') {
    const palm = max.y < 0.895;
    if (palm)
      return [proximal(/pollicis/.test(id) ? 'TRAPEZIUM' : 'HAMATE'), distal('PHALANGE_HAND_' + digit)];
    if (/posterior_compartment_of_forearm_FJ1505|^deep_muscle_of_posterior_compartment_of_forearm$/.test(id))
      return [proximal('HUMERUS'), distal('RADIUS')]; // Supinator.
    if (/anterior_compartment_of_forearm/.test(id)) return [proximal('HUMERUS')]; // Palmaris longus terminates in palmar aponeurosis.
    if (/_FJ1487|^superficial_muscle_of_posterior_compartment_of_forearm$/.test(id))
      return [proximal('HUMERUS'), distal('RADIUS')]; // Brachioradialis.
    if (/pronator_quadratus/.test(id))
      return [
        end('ULNA', v(s * 0.229, center.y, center.z), 'origin'),
        end('RADIUS', v(s * 0.269, center.y, center.z), 'insertion'),
      ];
    const from = /extensor_pollicis|extensor_indicis|profundus/.test(id)
      ? 'ULNA'
      : /pollicis|abductor_|extensor_carpi/.test(id)
        ? 'RADIUS'
        : 'ULNA';
    const to = /carpi_ulnaris/.test(id)
      ? 'METACARPAL_5'
      : /carpi_radialis/.test(id)
        ? 'METACARPAL_2'
        : min.y < 0.839
          ? 'PHALANGE_HAND_' + digit
          : 'METACARPAL_' + digit;
    return [proximal(from), distal(to)];
  }
  return [];
}
