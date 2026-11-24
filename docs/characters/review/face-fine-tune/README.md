# Heros face fine-tune

This page records the initial PR #28 review at `1009294`. The current pass adds modest head scaling, facial fat and original-sheet comparisons. [Revision v3 evidence](v3/README.md)

The comparison starts at `94deb9d`, the PR #27 merge. Both faces use the original BoneHub skull at standing scale. The mandibles rotate about their paired CT condyles. The face shell takes its radial sections from the closed skulls and registered BodyParts3D meshes, with separate modelling for the eyelids, nostrils, lips and ears. Axon loads the 35 facial muscles for the selected hero when a face study is opened. [Skull and muscle proof](anatomy.md) · [Regional gap measurements](face-measurements.md)

| High bare face, width × height × depth in inches | Before | Revised |
| --- | --- | --- |
| Sippy | 8.970 × 10.389 × 11.190 | 5.904 × 9.196 × 8.463 |
| Roma | 9.286 × 9.981 × 10.347 | 6.147 × 8.286 × 8.478 |

The geometry audit matched 56 Sippy and 53 Roma protected body and wardrobe surfaces per tier. Each hero uses a common base complexion on the face, ears, neck and visible body skin. Sippy’s folded hood uses a single 24.064° rigid tilt to clear the new jaw. The check preserves its vertices, triangle connectivity and relative normals, and finds no clothing in front of the mouth in seven neutral views on either tier. [Dimensions and clearance receipt](head-and-mouth-check.json)

The four approved groom files decode to the original `d116849` geometry, materials and control bones. The High archives use lossless gzip repacking. The refit seats each groom on the new scalp while retaining the original motion. Roma’s forward lock still partly covers her visible eye in the strict profile. [Hair fit, hashes and motion](hair-fit.md)

[Face and hair plates, overlays and films](media.md) · [Cold loads, warmed frames and browser guardrails](performance.md)
