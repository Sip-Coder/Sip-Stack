# CT skeleton landmark checklist

These measurements use the frozen neutral Axon models. Widths project the fitted cortical vertices onto the rig’s pelvic left–right axis. Q-angle is the coronal angle between the anterior superior iliac spine, the center of the patella and the tibial tuberosity. The iliac and tibial points are on the fitted cortical meshes. The spine estimates use the orientations of central anterior endplate triangles, area-weighted in the rig’s sagittal plane. [Measurement code](../../../../tools/check-axon-skeleton.mjs)

| Hero and tier | Iliac breadth | Clavicular span | Q-angle, left / right | T2–T12 thoracic | T12–sacral lumbar |
|---|---:|---:|---:|---:|---:|
| Sippy Mobile | 9.69 in | 14.01 in | 12.46° / 11.29° | 42.24° | 17.19° |
| Sippy High | 9.70 in | 14.02 in | 12.85° / 11.30° | 39.55° | 15.22° |
| Roma Mobile | 10.73 in | 12.35 in | 17.04° / 16.50° | 28.45° | 19.78° |
| Roma High | 10.74 in | 12.36 in | 16.67° / 16.41° | 20.20° | 19.34° |

The High figures’ iliac breadths are 13.8% and 16.2% of their respective illustrated standing heights. The donor reference proportions in the brief are about 14.9% and 17.3%. The upper thoracic estimate is sensitive to LOD, especially on Roma. [Bone fitting and containment](fitting-evidence.md)

| Region | What was verified | Measurement still open |
|---|---|---|
| Shoulder | Each side retains a CT clavicle and triangular scapula, including its spine, acromion, coracoid and glenoid on the same cortical surface. Five rays per shoulder test contact with the humeral head. The largest absolute sampled gap across both characters, tiers and eleven poses was 0.163 in. | Individual clavicle centerline arc length and separate process dimensions. |
| Pelvis and hip | Both os coxae, both femoral heads and the sacral unit remain. The inlet, pubic arch and obturator foramina can be inspected in the girdle plate. Five rays per hip test the fit of the head into the socket. Largest absolute sampled gap was 0.177 in. | A direct subpubic angle and a numerical femoral neck–shaft angle on each posed femur. The earlier 127° figure is a design target. |
| Rib cage and spine | Each figure has the sternum and 12 paired scanned ribs. The inspector adds the costal cartilage. Each spine contains C1–C7 and T1–T12. Sippy has L1–L5, Roma retains the donor’s L6. The sacrum and terminal coccygeal region share a single source node. | Independent counts of coccygeal segments and an endplate measure of cervical curvature. |
| Limbs and digits | The scan contains paired femora, tibiae, fibulae, humeri, radii and ulnae. Truncated elbow ends have original reconstructions. Each hand has eight named carpals, five metacarpals and five digit meshes with fused phalanges. Each foot retains tarsals, five metatarsals and five digit meshes. | Separate interphalangeal bone measurements and physical femur, tibia and humerus lengths in the posed model. |
| Skull | The cranial/maxillary unit and mandible are separate scan groups on both figures. The fitted skull passes the eye, eyelid, hair and head-envelope checks in both tiers. | Individual brow, gonial and mastoid angles. |

Each High model’s measured wrist-to-middle-fingertip reach is 3.73 / 3.72 in for Sippy and 3.86 / 3.86 in for Roma, shown left / right. Neutral bony foot lengths are 5.75 / 5.81 in and 6.21 / 6.18 in. [Extremity measurements](fitting-evidence.md) · [Girdle comparison](girdles.jpg) · [Head registration](head-registration.json) · [Per-pose joint seating](bone-containment.json)
