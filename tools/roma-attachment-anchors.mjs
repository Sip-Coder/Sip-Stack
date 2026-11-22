// Landmarks in the unchanged BP3D/Z donor scene in metres. Positive X is
// anatomical left. Match to a source vertex before registration. The female
// destination is a closest point on the named BoneHub cortical triangle.
export function attachmentSpecs(id, joint) {
  id = id.toLowerCase();
  const side = /(^|_)left(_|$)/.test(id) ? 'L' : /(^|_)right(_|$)/.test(id) ? 'R' : joint?.at(-1);
  // Midline structures may have naming without a laterality token.
  const sign = side === 'R' ? -1 : 1;
  const suffix = side === 'R' ? '_RIGHT' : '_LEFT';
  const axial = (bone, [x, y, z], role = 'origin') => ({ bone, point: [sign * x, y, z], role });
  const bilateral = (bone, point, role) => axial(bone + suffix, point, role);
  const spinal = (level, point, role) => axial('VERTEBRA_' + level, point, role);
  const rib = (level, point, role) => bilateral('RIB_' + level, point, role);

  if (/deltoid_/.test(id)) {
    const insertion = bilateral('HUMERUS', [0.202, 1.276, -0.027], 'insertion');
    if (/clavicular/.test(id)) return [
      bilateral('CLAVICLE', [0.091, 1.412, 0.008]),
      bilateral('CLAVICLE', [0.137, 1.419, -0.006]),
      insertion,
    ];
    if (/spinal/.test(id)) return [
      bilateral('SCAPULA', [0.084, 1.378, -0.095]),
      bilateral('SCAPULA', [0.152, 1.406, -0.062]),
      insertion,
    ];
    return [bilateral('SCAPULA', [0.158, 1.414, -0.026]), insertion];
  }

  if (/pectoralis_major/.test(id)) {
    const insertion = bilateral('HUMERUS', [0.182, 1.35, -0.016], 'insertion');
    if (/clavicular/.test(id)) return [
      bilateral('CLAVICLE', [0.027, 1.386, 0.039]),
      bilateral('CLAVICLE', [0.082, 1.404, 0.009]),
      insertion,
    ];
    // The abdominal slip attaches to aponeurosis. The adjacent costal root
    // is an explicitly sampled registration witness for that soft tissue.
    if (/abdominal/.test(id)) return [rib(7, [0.052, 1.18, 0.102]), insertion];
    return [
      axial('STERNUM', [0.008, 1.365, 0.068]),
      axial('STERNUM', [0.008, 1.243, 0.105]),
      rib(5, [0.037, 1.263, 0.097]),
      insertion,
    ];
  }

  if (/trapezius_/.test(id)) {
    if (/descending/.test(id)) return [
      axial('SKULL_CRANIAL_MAXILLA', [0.003, 1.578, -0.085]),
      spinal('C7', [0.003, 1.452, -0.093]),
      bilateral('CLAVICLE', [0.127, 1.421, -0.017], 'insertion'),
    ];
    if (/transverse/.test(id)) return [
      spinal('T1', [0.003, 1.441, -0.095]),
      spinal('T4', [0.003, 1.38, -0.111]),
      bilateral('SCAPULA', [0.157, 1.413, -0.051], 'insertion'),
    ];
    return [
      spinal('T7', [0.003, 1.297, -0.119]),
      spinal('T12', [0.004, 1.135, -0.111]),
      bilateral('SCAPULA', [0.09, 1.382, -0.094], 'insertion'),
    ];
  }

  if (/biceps_brachii/.test(id)) return [
    bilateral('SCAPULA', /long/.test(id) ? [0.155, 1.409, -0.024] : [0.135, 1.399, -0.004]),
    bilateral('RADIUS', [0.209, 1.068, -0.028], 'insertion'),
  ];
  if (/latissimus_dorsi/.test(id)) return [
    spinal('T7', [0.004, 1.272, -0.125]),
    spinal('L2', [0.004, 1.063, -0.102]),
    bilateral('HIP', [0.085, 0.974, -0.097]),
    bilateral('HUMERUS', [0.182, 1.328, -0.031], 'insertion'),
  ];
  if (/rectus_abdominis/.test(id)) return [
    bilateral('HIP', [0.016, 0.846, 0.035]),
    rib(5, [0.076, 1.235, 0.086], 'insertion'),
    axial('STERNUM', [0.011, 1.227, 0.103], 'insertion'),
  ];

  const humeralTubercle = bilateral('HUMERUS', [0.187, 1.385, -0.026], 'insertion');
  if (/supraspinatus/.test(id))
    return [bilateral('SCAPULA', [0.069, 1.399, -0.079]), humeralTubercle];
  if (/infraspinatus/.test(id))
    return [bilateral('SCAPULA', [0.079, 1.348, -0.099]), humeralTubercle];
  if (/teres_minor/.test(id))
    return [bilateral('SCAPULA', [0.108, 1.303, -0.085]), humeralTubercle];
  if (/subscapularis/.test(id)) return [
    bilateral('SCAPULA', [0.081, 1.36, -0.073]),
    bilateral('HUMERUS', [0.165, 1.384, -0.006], 'insertion'),
  ];
  if (/teres_major/.test(id)) return [
    bilateral('SCAPULA', [0.089, 1.266, -0.099]),
    bilateral('HUMERUS', [0.169, 1.352, -0.027], 'insertion'),
  ];
  if (/coracobrachialis/.test(id)) return [
    bilateral('SCAPULA', [0.133, 1.399, -0.006]),
    bilateral('HUMERUS', [0.185, 1.247, -0.03], 'insertion'),
  ];
  if (/brachialis/.test(id)) return [
    bilateral('HUMERUS', [0.185, 1.277, -0.032]),
    bilateral('ULNA', [0.202, 1.076, -0.025], 'insertion'),
  ];
  if (/anconeus/.test(id)) return [
    bilateral('HUMERUS', [0.23, 1.131, -0.047]),
    bilateral('ULNA', [0.211, 1.05, -0.051], 'insertion'),
  ];
  if (/triceps/.test(id)) return [
    /long/.test(id) ? bilateral('SCAPULA', [0.144, 1.364, -0.052]) :
      bilateral('HUMERUS', [0.193, 1.312, -0.047]),
    bilateral('ULNA', [0.213, 1.105, -0.049], 'insertion'),
  ];
  if (/pectoralis_minor/.test(id)) return [
    rib(3, [0.071, 1.333, 0.068]),
    rib(5, [0.084, 1.261, 0.062]),
    bilateral('SCAPULA', [0.129, 1.397, -0.016], 'insertion'),
  ];
  if (/subclavius/.test(id)) return [
    rib(1, [0.035, 1.385, 0.03]),
    bilateral('CLAVICLE', [0.098, 1.408, -0.02], 'insertion'),
  ];
  if (/serratus_anterior/.test(id)) return [
    rib(4, [0.117, 1.318, 0.051]),
    rib(8, [0.116, 1.161, 0.02]),
    bilateral('SCAPULA', [0.076, 1.359, -0.1], 'insertion'),
  ];
  if (/rhomboid/.test(id)) return [
    /minor/.test(id) ? spinal('T1', [0.001, 1.444, -0.099]) : spinal('T4', [0.001, 1.32, -0.099]),
    bilateral('SCAPULA', [0.075, 1.362, -0.099], 'insertion'),
  ];
  if (/levator_scapulae/.test(id)) return [
    spinal('C3', [0.023, 1.523, -0.032]),
    bilateral('SCAPULA', [0.081, 1.388, -0.087], 'insertion'),
  ];
  if (/sternocleidomastoid/.test(id)) return [
    axial('STERNUM', [0.004, 1.378, 0.047]),
    bilateral('CLAVICLE', [0.041, 1.393, 0.022]),
    axial('SKULL_CRANIAL_MAXILLA', [0.055, 1.565, -0.052], 'insertion'),
  ];
  if (/external_oblique/.test(id)) return [
    rib(6, [0.117, 1.27, 0.075]),
    rib(9, [0.119, 1.188, 0.041]),
    bilateral('HIP', [0.102, 1.013, -0.063], 'insertion'),
  ];
  if (/diaphragm/.test(id)) return [
    axial('STERNUM', [0, 1.226, 0.091]),
    spinal('L2', [0.019, 1.075, -0.038]),
    rib(11, [0.103, 1.119, -0.054], 'insertion'),
  ];
  if (/serratus_posterior/.test(id)) {
    const upper = /superior/.test(id);
    return [
      spinal(upper ? 'T1' : 'T12', [0.001, upper ? 1.448 : 1.139, -0.087]),
      rib(upper ? 4 : 10, upper ? [0.092, 1.328, -0.089] : [0.098, 1.161, -0.08], 'insertion'),
    ];
  }
  if (/scalenus/.test(id)) return [
    spinal('C4', [0.024, 1.49, -0.03]),
    rib(/posterior/.test(id) ? 2 : 1, [0.054, 1.414, -0.024], 'insertion'),
  ];
  if (/brachioradialis|fj1487/.test(id)) return [
    bilateral('HUMERUS', [0.226, 1.157, -0.037]),
    bilateral('RADIUS', [0.239, 0.895, 0.005], 'insertion'),
  ];
  if (/supinator|fj1505/.test(id)) return [
    bilateral('HUMERUS', [0.23, 1.131, -0.047]),
    bilateral('RADIUS', [0.217, 1.036, -0.025], 'insertion'),
  ];
  if (/pronator_teres/.test(id)) return [
    bilateral('HUMERUS', [0.18, 1.12, -0.034]),
    bilateral('RADIUS', [0.224, 0.99, -0.018], 'insertion'),
  ];
  if (/pronator_quadratus/.test(id)) return [
    bilateral('ULNA', [0.229, 0.924, -0.007]),
    bilateral('RADIUS', [0.261, 0.923, 0.008], 'insertion'),
  ];
  if (/flexor_carpi|palmaris_longus|fj1502/.test(id))
    return [bilateral('HUMERUS', [0.18, 1.12, -0.034])];
  if (/extensor_(carpi|digitorum|digiti_minimi)|fj1492/.test(id))
    return [bilateral('HUMERUS', [0.23, 1.131, -0.047])];

  // Hip transitions in the male atlas, if a same-subject female surface is
  // absent in the selected roster. The female lower-limb files remain rigid.
  if (/gluteus_maximus/.test(id)) return [
    bilateral('HIP', [0.074, 0.987, -0.096]),
    axial('SACRUM', [0.01, 0.917, -0.105]),
    bilateral('FEMUR', [0.128, 0.773, -0.06], 'insertion'),
  ];
  if (/gluteus_(medius|minimus)/.test(id)) return [
    bilateral('HIP', [0.102, 1.013, -0.063]),
    bilateral('HIP', [0.115, 0.975, -0.004]),
    bilateral('FEMUR', [0.137, 0.858, -0.034], 'insertion'),
  ];
  if (/psoas_major|iliacus/.test(id)) return [
    /iliacus/.test(id) ? bilateral('HIP', [0.102, 1.013, -0.063]) : spinal('L2', [0.026, 1.101, -0.024]),
    bilateral('FEMUR', [0.094, 0.812, -0.031], 'insertion'),
  ];
  if (/piriformis/.test(id)) return [
    axial('SACRUM', [0.038, 0.93, -0.079]),
    bilateral('FEMUR', [0.137, 0.858, -0.034], 'insertion'),
  ];
  return [];
}
