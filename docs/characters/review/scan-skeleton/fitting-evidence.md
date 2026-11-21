# Fitted hands, feet and left-side registration

## Anatomical left in Chromium

Chromium 155.0.8059.79 decoded the shipped GLBs and built the neutral production Axon models. In the source, both left femoral centers lie to the positive-X side of their right counterparts. For each fitted skeleton, a front orthographic camera at +Z cast a ray through the middle third of each femoral shaft. The table reports the closest hit among **all** skeletal meshes, the actual part label and the hit position in inches relative to the rig origin. In this front view, anatomical left appears to the viewer’s right.

| Hero and tier | First hit at +X | Front screen X | First hit at −X | Front screen X |
|---|---:|---:|---:|---:|
| Sippy Mobile | Left femur, +4.29 in | 55.2% | Right femur, -3.94 in | 45.2% |
| Sippy High | Left femur, +3.66 in | 54.4% | Right femur, -3.87 in | 45.2% |
| Roma Mobile | Left femur, +3.45 in | 54.2% | Right femur, -3.65 in | 45.5% |
| Roma High | Left femur, +3.48 in | 54.2% | Right femur, -3.49 in | 45.7% |

## Wrist and shoe fit

Hand reach is the distance from the live wrist pivot to the farthest vertex of the middle finger’s scanned phalanges. Foot length projects all tarsal, metatarsal and toe vertices onto the posed ankle’s forward axis. Shoe fill divides that span by the length of the actual covered foot mesh inside the trainer. Each cell gives left / right values for a production neutral pose.

| Hero and tier | Wrist to middle fingertip (in) | Bony foot length (in) | Shoe fill | Depth samples across 11 poses | Exposed |
|---|---:|---:|---:|---:|---:|
| Sippy Mobile | 3.73 / 3.73 | 5.76 / 5.81 | 89.7% / 90.5% | 34,877 | 0 |
| Sippy High | 3.73 / 3.72 | 5.75 / 5.81 | 89.7% / 90.5% | 35,084 | 0 |
| Roma Mobile | 3.86 / 3.86 | 6.20 / 6.18 | 90.2% / 89.8% | 40,786 | 0 |
| Roma High | 3.86 / 3.86 | 6.21 / 6.18 | 90.2% / 89.8% | 40,727 | 0 |

The coverage run used every scanned hand and foot bone on both sides and the production skin triangles. It used the same six 448 × 448 barycentric depth comparisons and 0.020 in tolerance as the full-body check. Each hero and tier contributed one neutral pose, three walk frames, three run frames, three roll frames and one raised left leg. Across the 44 cases, 151,474 hand and foot surface samples stayed inside skin. Clothing and hair were excluded. [Pose sampler and depth test](../../../../tools/check-axon-skeleton.mjs)

## Hummin compared with main

A fresh production build at main `85d3ad1` and the candidate produced the same SHA-256 for each tier. The signature includes ordered part names, layers, sources and transforms, all geometry attributes and indices, material groups, PBR properties, shader hooks and procedural texture bytes.

| Tier | Parts | Triangles | Geometry and material SHA-256 on both builds |
|---|---:|---:|---|
| Mobile | 135 | 94,740 | `ba9e05c349b6dc0d881f37bb59a210a22572de0308307e7223162d6f0e31e937` |
| High | 135 | 142,444 | `450d2bf2aa0480250934fd550a391c6721110d89ba72615e4e8fcf70d0b177f5` |

## Posed cortical surfaces

In the neutral High models, the measured iliac breadth is 9.70 in for Sippy and 10.74 in for Roma. This is 13.8% and 16.2% of their illustrated standing heights. The wider female pelvis, female L6 vertebra and shorter female clavicular span remain visible. The corresponding shoulder spans across the clavicles are 14.02 in and 12.36 in. Sippy’s pelvis and upper thigh share a continuous skin edge. A shallow inguinal crease remains at high flexion. Roma’s raised thigh has a rounded contour. A short edge under the pelvis and local facets are visible in the close-up.

The glenoid and acetabulum come from the same donor as each scanned upper arm and thigh. Five rays through each seated joint sample the gap between the two cortical surfaces. The table gives the largest observed gap across both sides and all eleven snapshots per tier.

Bone containment uses the production character skin and the shipped tier's CT bones, elbow reconstructions and costal cartilage. It samples six orthographic directions for standing, walking, running, rolling and a raised leg. Each sample is a covered image pixel. The allowed depth difference is 0.020 in. The depth comparison excludes garments, hair and muscles, so they cannot hide an exposed cortical surface.

| Hero and tier | Bone depth samples | Exposed | Largest shoulder gap (in) | Largest hip gap (in) |
|---|---:|---:|---:|---:|
| Sippy Mobile | 579,201 | 0 | 0.162 | 0.156 |
| Sippy High | 578,444 | 0 | 0.163 | 0.159 |
| Roma Mobile | 662,233 | 0 | 0.148 | 0.177 |
| Roma High | 663,071 | 0 | 0.159 | 0.169 |

Run `AXON_BONES_ONLY=1 THREE_ROOT=/path/to/three node tools/check-axon-skeleton.mjs sippy mobile rest walk run roll leg-raise` with Three.js r170, then repeat for each hero and tier. The combined muscle and bone check uses the same command with the environment variable omitted. [Per-pose results](bone-containment.json)
