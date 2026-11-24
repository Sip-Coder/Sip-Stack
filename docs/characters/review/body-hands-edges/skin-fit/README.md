# Skin fit review

The plates compare PR #27 at `ff47e21` with the revised build at `7b9df68`. The harness fixes the Axon canvas height for each device and uses the same orbit, viewport and quality for both builds. The plates keep the native pixels around each figure. The baseline uses the revised diagnostic controls with the historical posed geometry and its own measured gap data.

- [Phone overlays and heatmaps](skin-fit-phone.png) at 412 × 915 CSS px, 2.6× display DPR and Mobile quality.
- [Desktop overlays and heatmaps](skin-fit-desktop.png) at 1,440 × 960 CSS px, 1× display DPR and High quality.
- [Clothing fit](outfit-fit.png) from the native simulator.
- [Hand fit and finger separation](hand-fit.md) in matched Mobile and High close-ups.
- [Sippy and Roma turnaround](skin-fit-turnaround.mp4) with one five-second High-quality orbit per hero.

Nearest-muscle gap is the unsigned distance from a sampled skin vertex to the closest muscle triangle. The support distance also includes the BoneHub skeleton and Roma’s existing tissue pads. The mean is weighted by incident skin triangle area, and the max is the largest sampled value. Gray pixels show unsampled geometry. The plates color the muscle distance on the same scale for both builds. The largest muscle gaps occur at the feet, where the underlying muscle data is sparse. Treat the values as distances to the available anatomy across the wrap.

| Hero | Quality | Muscle mean, in | Muscle max, in | Support mean, in | Support max, in | Projected exposure |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Sippy | Mobile | 0.71 → 0.40 | 2.97 → 3.57 | 0.62 → 0.31 | 2.79 → 1.73 | 0.63% → 0.86% |
| Roma | Mobile | 1.06 → 0.76 | 8.10 → 8.47 | 0.71 → 0.36 | 3.48 → 2.87 | 0.38% → 0.83% |
| Sippy | High | 0.71 → 0.40 | 2.97 → 3.57 | 0.61 → 0.31 | 2.79 → 1.71 | 0.65% → 0.88% |
| Roma | High | 1.06 → 0.76 | 8.10 → 8.47 | 0.71 → 0.36 | 3.48 → 2.86 | 0.38% → 0.83% |

Projected exposure is the share of overlapping pixels where support projects more than 0.04 in in front of skin across six 512 × 512 views. It uses the heatmap’s body mask, so projected skull overlap near its neck boundary can affect the count. The full-layer coverage check also includes the face skin.

The capture ledger records the photo hashes, device dimensions, source checkouts, sample totals and native film frames. [Capture ledger](capture.json) · [Source and coverage checks](wrap-verification.md) · [Performance and recovery](performance.md)
