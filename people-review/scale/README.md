# Scale and stair review

[Watch the 16-second stair reel](stairs-up-and-down.mp4). The camera follows the same worker up and down the first flight on Mobile. Each eight-second segment samples the running scene at 12 frames per second and plays in real time.

## Matched scene views

Each pair uses the same world-space camera target, offset, lens, scene time and High quality setting. The left column uses main at `411f01d`.

| Subject | Before | After |
| --- | --- | --- |
| Village cantina table and glassware | [Before](before-cantina.jpg) | [After](after-cantina.jpg) |
| Village stairs from the side | [Before](before-stairs-side.jpg) | [After](after-stairs-side.jpg) |
| Village stairs from a three-quarter angle | [Before](before-stairs-quarter.jpg) | [After](after-stairs-quarter.jpg) |
| Tidelight standing table and terrace | [Before](before-tidelight-terrace.jpg) | [After](after-tidelight-terrace.jpg) |
| Sip Creek cooper and inspection cask | [Before](before-cooper-cask.jpg) | [After](after-cooper-cask.jpg) |

## Wildlife next to a person

The orthographic review views place a production animal at elbow height beside a worker from its scene. Both retain their world scale. The right column of each plate magnifies the same specimen. Its scale bar gives the distance across the image plane. The smaller birds, insects and firefly body keep their actual scene size in the worker view.

| Scene | Specimens | Before | After |
| --- | --- | --- | --- |
| Village | Swallow and butterfly | [Before](before-wildlife-village.jpg) | [After](after-wildlife-village.jpg) |
| Tidelight Coast | Gull, harbour fish and butterfly | [Before](before-wildlife-tidelight.jpg) | [After](after-wildlife-tidelight.jpg) |
| Sip Creek | Kingfisher, finch, trout, dragonfly, butterfly and firefly | [Before](before-wildlife-creek.jpg) | [After](after-wildlife-creek.jpg) |

## Rendered triangles and draw calls

Production renderer counters from a warmed, shadow-refresh frame at four seconds in Chromium/SwiftShader. Each scene uses the same overview camera on both revisions at an 844 × 720 viewport. Counts include every pass in the frame, so reflected, shadowed and re-rendered triangles contribute each time. The baseline is main at `411f01d`.

| Scene | Tier | Triangles before | Triangles after | Δ triangles | Draws before | Draws after | Δ draws |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Village | Mobile | 1,406,899 | 1,357,019 | -49,880 (-3.5%) | 454 | 460 | +6 |
| Village | Medium | 2,395,347 | 2,315,933 | -79,414 (-3.3%) | 709 | 703 | -6 |
| Village | High | 3,202,122 | 3,095,507 | -106,615 (-3.3%) | 942 | 937 | -5 |
| Tidelight Coast | Mobile | 178,692 | 179,176 | +484 (+0.3%) | 138 | 142 | +4 |
| Tidelight Coast | Medium | 360,225 | 361,193 | +968 (+0.3%) | 254 | 262 | +8 |
| Tidelight Coast | High | 399,073 | 400,041 | +968 (+0.2%) | 254 | 262 | +8 |
| Sip Creek | Mobile | 707,924 | 709,052 | +1,128 (+0.2%) | 166 | 154 | -12 |
| Sip Creek | Medium | 1,267,950 | 1,269,678 | +1,728 (+0.1%) | 308 | 288 | -20 |
| Sip Creek | High | 1,586,250 | 1,587,978 | +1,728 (+0.1%) | 308 | 288 | -20 |

The scale probe records individual prop and animal measurements in the [scale report](../scale-report.md).
