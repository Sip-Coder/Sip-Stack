# Source wrap verification

The review compares `ff47e21` with implementation `7b9df68`. The offline skin builder cuts the neutral donor triangles at body stations. Samples follow the outermost anatomical contact, with 1/16–3/8 in of target subcutaneous offset chosen by region. The joint ridges and bony landmarks receive thinner offsets. Nearby samples close the gaps between discrete source parts. Roma’s wrap includes her existing soft-tissue pads. Garment ease is applied after the skin fit. [Standing body-layer order](../../../../../tools/heros-checks.md#body-layer-order)

## Axon distance measurements

The heatmap measures each surface vertex to the nearest muscle triangle in the neutral pose. The mean is weighted by its share of skin area. The maximum is the largest sampled distance. The support figures also count donor bones and Roma’s fat pads. These unsigned distances include the effect of sparse muscle coverage, especially at the toes. The character faces and hair sit outside the measured body mask.

| Hero | Tier | Muscle mean, before → after | Muscle max, before → after | Support mean, before → after | Support max, before → after |
| --- | --- | ---: | ---: | ---: | ---: |
| Sippy | Mobile | 0.710 → 0.402 in | 2.966 → 3.572 in | 0.618 → 0.310 in | 2.793 → 1.732 in |
| Sippy | High | 0.706 → 0.397 in | 2.966 → 3.572 in | 0.614 → 0.306 in | 2.791 → 1.705 in |
| Roma | Mobile | 1.060 → 0.758 in | 8.102 → 8.474 in | 0.711 → 0.364 in | 3.477 → 2.868 in |
| Roma | High | 1.059 → 0.757 in | 8.102 → 8.474 in | 0.710 → 0.362 in | 3.477 → 2.863 in |

## Six-view projected coverage

The separate full-layer depth audit checks whether the source anatomy projects beyond the skin by more than 0.04 in or outside its outline. It includes face skin and the existing joint reconstructions. The Axon diagnostic also reports a local projection count using its smaller body-only mask. Each count is defined by its own test surface.

| Hero | Tier | Final samples | Bare depth, before → after | Bare silhouette, before → after | Dressed depth, before → after | Dressed silhouette, before → after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Sippy | Mobile | 138,703 | 345 → 99 | 13 → 30 | 34 → 74 | 0 → 2 |
| Sippy | High | 139,112 | 363 → 133 | 15 → 42 | 38 → 79 | 0 → 5 |
| Roma | Mobile | 145,629 | 92 → 9 | 6 → 0 | 0 → 0 | 0 → 0 |
| Roma | High | 145,715 | 101 → 8 | 6 → 0 | 0 → 0 | 0 → 0 |

Sippy’s remaining coverage misses concentrate around independently placed wrist components and tendons. The revised shape keeps the digits separated while following the curled donor pose. Pelvis and neck joins remain visible in isolated skin at some angles. [Hand clearance and isolated comparison](hand-fit.md)

The dressed source-rig dimensions matched the previous PR head. The independent Axon test verified 503 source-true Sippy parts and 219 source-true Roma parts in neutral and walking poses on each tier, with a worst drawn-position residual below 0.000005 in. The original muscle and skeleton archives are byte-identical. The head geometry fingerprints matched the previous head for both humans, and Hummin’s inspection meshes and materials matched. All six motion cases and four hair-motion cases passed. The human roll support now samples the active detail tier, with denser sampling of fitted rigid clothing.

Both diagnostics passed forced WebGL context loss on Mobile and High for both heroes. The previous pixels stayed visible through the loss and were reproduced after restore. Turning the mode off restored the earlier frame and controls. The replay also switched an active High map to Mobile and switched from a human map to Hummin without fetching a Hummin map. [Axon browser receipts](axon-recovery.json)
