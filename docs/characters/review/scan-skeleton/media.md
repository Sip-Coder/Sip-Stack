# Axon View scan comparison

The fitted columns use the live Sippy and Roma inspection models. The reference columns use the supplied BoneHub scans in their CT acquisition pose. Both source scans bring the hands toward the pelvis. In Axon their arms follow the walk rig. The skull, ribs, pelvis, hands and feet use the corresponding male or female donor.

Measurements cover [posed containment](pose-fit.md), [muscle registration](tissue-registration.md), [landmarks](landmarks.md), [distal fitting](fitting-evidence.md), [femoral axes](high-femur-axes.jpg) and [load and rendering performance](performance.md).

The final studio stills, raised-leg studies, film and native taps use runtime commit `8e89ab6`. The capture record includes the input-resource and review-media hashes. [Direct capture record](review-capture.json)

The final Sippy Mobile running-crease correction in `bbd734db` reproduces every photographed neutral and raised state. All six complete posed models and all 32 corroborating native photos match the direct capture.

## Turnarounds

| Character | Mobile | High |
|---|---|---|
| Sippy | [Four views](sippy-mobile.jpg) | [Four views](sippy-high.jpg) |
| Roma | [Four views](roma-mobile.jpg) | [Four views](roma-high.jpg) |

The upper row of each sheet comes from main at `85d3ad1`. In each row the cameras are front, anatomical left, back, and 32° from front with 4° elevation. Every full-body plate uses the same orthographic scale. Each render uses its tier’s production Axon scene, geometry, lighting, shaders and display canvas. The camera fixture fixes the framing before each render. A return to the front camera after the three-quarter shot reproduced the initial pixels on both tiers and heroes.

## Compare the layers

- The main and candidate muscle layers are photographed in isolation with the same front and shoulder cameras for each character. [Before and after muscle geometry](muscle-before-after.jpg)

- The muscle plate compares the supplied High BodyParts3D atlas in its source pose with Sippy and Roma. The front, back and shoulder crops show the groups present in the supplied 323-mesh set. Named superficial groups absent from that set include pectoralis major and deltoid. Sippy uses all 323 groups. Roma uses 263 fitted BodyParts3D groups and 76 subject-specific Andreassen female lower-limb muscles. [Muscle atlas, Sippy and Roma](muscle-atlas.jpg)
- The female limb plate isolates all 76 Andreassen donor groups in the source and fitted Roma. Each pair uses one orthographic view and normalizes the depicted region to the same height. The raw source comes from the female donor chunks in the pinned Human-Atlas archive. [Visible Human Female source and fitted muscles](female-donor.jpg) · [Muscle and skin source records](../../assets/MUSCLE-SKIN-LICENSE.md)
- The skin plate compares the male and female HuBMAP Visible Human skin envelopes to the original human character models in opaque and ghost skin. The dataset appears only as source renders for proportion review. [Skin proportions and ghost mode](skin-proportions.jpg)

- The side-by-side scan plate normalizes each supplied skeleton to the standing height of its corresponding hero for display. This preserves the donor’s internal proportions and shows where the rig fit changes them. [Acquisition pose and rig fit](source-to-rig.jpg)
- The close-ups use the same magnification for the source and fitted versions. The anterior and superior views isolate both hip bones and the sacrum. The shoulder view includes the clavicles, scapulae, upper arms, sternum and superior ribs. [Pelvis and shoulder girdle](girdles.jpg)
- The opaque and ghost hip crops render skin, muscles and bones simultaneously under both poses. The ghost partner exposes the hip structures beneath the character shell. The opaque images also show the existing junctions between the torso and upper-thigh character meshes. [Neutral and raised-leg hip envelope](hip-envelope.jpg)
- The raised-leg study uses 18 fixed 60 Hz ticks. Each hero’s skeleton, muscle and skin columns show the same pose through the same camera. HAELE 3D’s staggered leg raises serve as the movement reference. [Raised-leg registration and reference](raised-leg-reference.jpg) · [HAELE 3D clip](https://x.com/haele3d/status/2122343603762548994)
- The soft-tissue study compares the pectoral region and shoulder attachments to two time points from omarsar0’s anatomy explorer. The lower row shows what remains visible through the ghost shell. The excerpts are cropped for this review. [Tissue and ghost skin](tissue-and-ghost.jpg) · [omarsar0 clip](https://x.com/omarsar0/status/2097353640792985816)
- The film records the actual High Axon canvas as its live slider travels from 0% to 100%, the camera orbits once, and the body reassembles. Both heroes use the axial layout. Runtime picker state supplies each character name and explode percentage. H.264 · 1024 × 684 · 24.0 s. [Axial explode and orbit](axial-orbit.mp4)

A Mobile-tier touchscreen run tapped the clavicle, scapula, hip bone and femur on the visible skeleton. The native chooser confirmed the selected mesh and the adjacent panel displayed its world-axis dimensions in inches. [Four native taps and their measurements](tap-measurements.jpg)

## Opaque-hip render check

The following results compare every pixel in the 650 × 500 hip crop with all internal anatomy shown under opaque skin, then with only the opaque character skin shown. Camera, studio and skin materials stay fixed. Each count covers the entire crop. Reflections, edges and contact shading can change a pixel as well as a visible protrusion. Full-pose depth sampling provides an independent surface test.

| Hero | Pose | Pixels with any RGB difference | Pixels changing by more than 3 levels in any channel |
|---|---|---:|---:|
| Sippy | neutral | 0 | 0 |
| Sippy | raised leg | 0 | 0 |
| Roma | neutral | 0 | 0 |
| Roma | raised leg | 0 | 0 |

## Scan fidelity before rig fitting

The four delivery meshes were checked against the supplied GLBs before posing. Each of the two donor scans and two tiers was photographed from the front, side and 33° oblique at 590 × 680 pixels. The skull and pelvis were also isolated and enlarged. The silhouette comparisons include openings in each structure. IoU measures the intersection area of the two masks divided by their union. The final column gives the greatest distance from an unmatched pixel to the other foreground mask in these views.

| Camera crop | Lowest IoU across subjects, tiers and views | Largest foreground discrepancy |
|---|---:|---:|
| Whole skeleton | 0.99481 | 1.00 px |
| Skull | 0.99768 | 2.83 px |
| Pelvis | 0.99741 | 2.00 px |

The geometry study independently measures distances between the source triangles and the delivery triangles before fitting. [Skeleton surface measurements](scan-lod-surface.json)

For the supplied BodyParts3D surfaces, 24 further comparisons used both tiers, four camera headings and three regions at 590 × 680. The lowest IoUs across angles and tiers were 0.99862 for the whole body, 0.99777 for the isolated shoulder groups and 0.99893 for the isolated hip groups. The largest foreground discrepancies were 1.41, 2.00 and 1.41 pixels respectively. [Muscle surface and silhouette measurements](muscle-lod-surface.json)

Skeleton meshes from *Visible-Human-3d-Models* by Seyed Hamidreza Alavi and Malte Asseln, BoneHub, University of Twente. CC BY 4.0. Derived from Andreassen et al., *Scientific Data* 10, 34 (2023), and CT data from the U.S. National Library of Medicine Visible Human Project. Sip-Stack simplified, compressed, fitted and locally reconstructed the meshes for the inspector. [Asset credits and license](../../assets/SKELETON-LICENSE.md) · [Dataset](https://doi.org/10.57967/hf/10464) · [Source study](https://doi.org/10.1038/s41597-022-01905-2)

BodyParts3D, © The Database Center for Life Science, licensed under CC BY 4.0. The archive lists the Feb 27, 2025 license change. Older OBJ distribution headers name CC BY-SA 2.1 Japan. Sip-Stack fitted the supplied atlas to the male and female character skeletons and added tendon and fiber shading. [DBCLS archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/)

The two review-only skin models are by Kristen Browne and Heidi Schlehlein for the HuBMAP Human Reference Atlas. The source frames use the original male v1.4 and female v1.5 models in their acquisition stance under a neutral material, with uniform scaling for display. Both are licensed CC BY 4.0. [Male v1.4](https://doi.org/10.48539/HBM953.DCMN.563) · [Female v1.5](https://doi.org/10.48539/HBM453.MVPL.398) · [Archived source revision](https://github.com/hubmapconsortium/hra-kg/tree/27d6d49/digital-objects/ref-organ)
