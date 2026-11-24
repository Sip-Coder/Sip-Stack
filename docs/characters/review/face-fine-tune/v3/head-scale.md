# Head scale and proportions

The front turnarounds define the sheet ratios. The marks are the crown of the hair, the bottom of the chin and the lowest sneaker sole, sampled in the original 1,536 × 1,024 sheets. Shoulder-length hair below the chin is outside the head height. The live ratio uses the same crown-to-chin and crown-to-floor definition on both tiers. [Sippy sheet](../../../../../characters-review/reference-sheets/4-sippy-sheet.png) · [Roma sheet](../../../../../characters-review/reference-sheets/3-roma-sheet.png)

| Hero | Sheet marks, crown / chin / sole in px | Sheet ratio | `94deb9d` High | Initial PR #28 High | Revised High | Revised Mobile | Uniform scale |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy | 34 / 91 / 401 | 15.53% | 15.19% | 13.74% | 15.55% | 15.55% | 1.16× |
| Roma | 38 / 90 / 357 | 16.30% | 15.49% | 13.05% | 16.36% | 16.36% | 1.31× |

The skin and bone dimensions are measured from indexed neutral Axon surfaces. The bare face shell excludes the individually modelled ears, lips and neck join. The skull column includes the posed mandible.

| Hero | Tier | Bare face shell W × H × D | Face shell with ears W × H × D | Posed skull W × H × D |
| --- | --- | ---: | ---: | ---: |
| Sippy | Mobile | 6.84 × 10.51 × 9.41 in | 7.93 × 10.51 × 9.41 in | 6.20 × 9.96 × 9.23 in |
| Sippy | High | 6.84 × 10.51 × 9.41 in | 7.93 × 10.51 × 9.41 in | 6.20 × 9.97 × 9.24 in |
| Roma | Mobile | 7.98 × 10.65 × 10.59 in | 8.73 × 10.65 × 10.59 in | 7.37 × 10.11 × 10.12 in |
| Roma | High | 7.98 × 10.65 × 10.59 in | 8.73 × 10.65 × 10.59 in | 7.38 × 10.11 × 10.13 in |

The center of C1 stays fixed. The skull’s source vertices, triangle indices and relative jaw rotation match the original. The neutral surface check matches all 56 protected Sippy and 53 protected Roma body and wardrobe surfaces on each tier. The original head joint keeps the cervical and body binding. The dedicated head assembly carries the face, ears, teeth, facial fat and muscle meshes, groom and headband. [Skull and facial layer proof](../anatomy.md) · [Geometry and proportions receipt](head-scale-check.json)

The locomotion check records the larger displayed height and applies the existing height and guide-motion tolerances in source-head-size units. Its stance, ground clearance, gait, roll, gesture and prop tests passed on both tiers for all three characters. [Locomotion check](../../../../../tools/check-heros-motion.mjs)
