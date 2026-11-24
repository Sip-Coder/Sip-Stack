# Hand fit and finger separation

The plate compares the right-hand skin at `ff47e21` with both revised quality tiers. The isolated Character Ref renders use the neutral pose and the same camera aperture within each row. The wrist edge sits inside the sleeve on the assembled character. [Native hand plate](hand-fit.png)

The hand bake cuts palm and wrist sections through the donor bone and muscle. Each digit follows its phalanges, and the fit includes nearby tendon sections that follow the same path. The palm closes over the metacarpal heads and blends into the fingers at the web, leaving channels between the curled fingers. [Hand section generator](../../../../../tools/build-human-hand-profiles.mjs)

| Hero | Mean nearest support before | Mean nearest support after | Largest sampled distance after | Phalanx vertices enclosed before | Phalanx vertices enclosed after | Smallest finger clearance at the measured slices |
| --- | --- | --- | --- | --- | --- | --- |
| Sippy | 0.801–0.814 in | 0.169–0.173 in | 0.727 in | 11.5–27.3% | 92.3–98.6% | 0.202–0.237 in |
| Roma | 0.201–0.218 in | 0.138–0.145 in | 0.486 in | 3.6–3.7% | 93.1–97.4% | 0.120–0.202 in |

The ranges cover two hands at two tiers. Nearest-support values are per-vertex distances from skin to the shipped High bone and muscle triangles assigned to the same wrist, with the cuff overlap excluded. The enclosure check samples phalanx vertices against the hand skin. Each revised hand has an oblique section with four separate closed loops through the non-thumb fingers. Clearance is the smallest gap between loop boundaries on that section. The thumb is visible in the render.

The donor wrist pose gives the new digits a tighter curl. Some pre-existing muscle-atlas tendon strips sit outside the donor digit tracks. Uncovered source vertices extend up to 0.784 in from Sippy's hand skin and 1.788 in from Roma's. These strips remain in the Axon overlay so the donor mismatch stays visible.
