# CT skeleton landmark checklist

These measurements use the frozen neutral Axon models. Widths project the fitted cortical vertices onto the rig’s pelvic left–right axis. Q-angle is the coronal angle between the anterior superior iliac spine, the center of the patella and the tibial tuberosity. The iliac and tibial points are on the fitted cortical meshes. The spine estimates use the orientations of central anterior endplate triangles, area-weighted in the rig’s sagittal plane. [Measurement code](../../../../tools/check-axon-skeleton.mjs)

| Hero and tier | Iliac breadth | Clavicular span | Q-angle, left / right | T2–T12 thoracic | T12–sacral lumbar |
|---|---:|---:|---:|---:|---:|
| Sippy Mobile | 9.69 in | 14.01 in | 12.73° / 11.52° | 42.24° | 17.19° |
| Sippy High | 9.70 in | 14.02 in | 13.14° / 11.52° | 39.55° | 15.22° |
| Roma Mobile | 10.73 in | 12.35 in | 17.15° / 16.59° | 28.45° | 19.78° |
| Roma High | 10.74 in | 12.36 in | 16.77° / 16.50° | 20.20° | 19.34° |

The High figures’ iliac breadths are 13.8% and 16.2% of their respective illustrated standing heights. The donor reference proportions in the brief are about 14.9% and 17.3%. The upper thoracic estimate is sensitive to LOD, especially on Roma. [Bone fitting and containment](fitting-evidence.md)

| Region | What was verified | Measurement still open |
|---|---|---|
| Shoulder | Each side retains a CT clavicle and triangular scapula, including its spine, acromion, coracoid and glenoid on the same cortical surface. Five rays per shoulder test contact with the humeral head. The largest absolute sampled gap across both characters, tiers and eleven poses was 0.163 in. | Centerline arc length along the S-curve and separate process dimensions. |
| Pelvis and hip | Both os coxae, both femoral heads and the sacral unit remain. The inlet, pubic arch and obturator foramina can be inspected in the girdle plate. Five rays per hip test the fit of the head into the socket. Largest absolute sampled gap was 0.174 in. | The subpubic angle and the inclination in moving poses. The neutral High inclination is measured below. |
| Rib cage and spine | Each figure has the sternum and 12 paired scanned ribs. The inspector adds the costal cartilage. Each spine contains C1–C7 and T1–T12. Sippy has L1–L5, Roma retains the donor’s L6. The sacrum and terminal coccygeal region share a single source node. | Independent counts of coccygeal segments and an endplate measure of cervical curvature. |
| Limbs and digits | The scan contains paired femora, tibiae, fibulae, humeri, radii and ulnae. Truncated elbow ends have original reconstructions. Each hand has eight named carpals, five metacarpals and five digit meshes with fused phalanges. Each foot retains tarsals, five metatarsals and five digit meshes. | Separate interphalangeal bone dimensions and complete humerus lengths including reconstructed elbow surfaces. |
| Skull | The cranial/maxillary unit and mandible are separate scan groups on both figures. The fitted skull passes the eye, eyelid, hair and head-envelope checks in both tiers. | Individual brow, gonial and mastoid angles. |

Each High model’s measured wrist-to-middle-fingertip reach is 3.73 / 3.72 in for Sippy and 3.86 / 3.86 in for Roma, shown left / right. Neutral bony foot lengths are 5.75 / 5.81 in and 6.21 / 6.18 in. [Extremity measurements](fitting-evidence.md) · [Girdle comparison](girdles.jpg) · [Head registration](head-registration.json) · [Per-pose joint seating](bone-containment.json)

## Clavicles and long bones in the neutral High figures

| Character | Clavicle, left / right | Femur, left / right | Tibia, left / right |
|---|---:|---:|---:|
| Sippy | 6.52 / 6.35 in | 18.58 / 18.61 in | 15.37 / 15.36 in |
| Roma | 5.72 / 5.64 in | 15.88 / 15.82 in | 14.13 / 14.13 in |

| Femoral neck–shaft inclination | High donor | Initial rig fit at `19359b9` | Corrected rig fit | Corrected minus donor |
|---|---:|---:|---:|---:|
| Sippy left | 132.44° | 142.35° | 133.02° | +0.58° |
| Sippy right | 131.62° | 142.12° | 132.16° | +0.55° |
| Roma left | 123.23° | 132.23° | 124.31° | +1.08° |
| Roma right | 121.29° | 130.25° | 122.14° | +0.85° |

Lengths use the longest straight-line distance between any two fitted cortex vertices of that individual bone. They include the breadth of the bone’s ends. The neck–shaft estimate fits a sphere to the superior, medial head cap, then finds the smallest closed polygonal cross-section between the head and trochanter. The neck line joins the sphere center to the section’s area centroid. The shaft line fits nine cross-section centroids through the middle third of the diaphysis. The plate overlays both axes on orthographic renderings of those same final triangles. [Front and profile views](high-femur-axes.jpg)

The first fit stretched the proximal surface toward the knee and increased the four angles by 8.96° to 10.50°. The correction in `8e89ab6` applies one scale around the head and neck and adjusts length farther down the shaft. The same cortical measurement now stays within 1.08° of each donor while retaining the illustrated hip and knee positions. The earlier character target was about 127°. The actual donor angles span 121.29°–132.44°. [Pre-correction measurements](high-femur-fit-before.json)

Varying the cap depth, shaft range and neck search window gives fitted ranges of 132.77°–133.33° and 132.01°–132.49° on Sippy, and 124.31°–124.33° and 122.14°–122.19° on Roma, shown left then right. These three-dimensional surface estimates depend on the anatomical definition of the neck midline.

To reproduce the comparison, export the selected neutral cortex geometry into scratch and run the cross-section audit with NumPy, SciPy and Pillow. The machine-readable results include cap-fit residuals, both parameter variations, shaft direction and head/neck coordinates. [Numerical evidence](high-long-bones.json) · [Geometry exporter](../../../../tools/export-axon-cortices.mjs) · [Axis and plate generation](../../../../tools/measure-femoral-axes.py)

```sh
THREE_ROOT=/path/to/three node tools/export-axon-cortices.mjs /tmp/axon-high-cortices
python tools/measure-femoral-axes.py /tmp/axon-high-cortices --plate /tmp/axon-femur-axes.jpg
```
