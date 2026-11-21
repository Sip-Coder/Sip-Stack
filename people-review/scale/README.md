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

## Original scale revision

The original scale revision (`8fb067e`) recorded these production renderer counters from a warmed, shadow-refresh frame at four seconds in Chromium/SwiftShader. Each scene uses the same overview camera on both revisions at an 844 × 720 viewport. Counts include every pass in the frame, so reflected, shadowed and re-rendered triangles contribute each time. The baseline is main at `411f01d`.

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

## Current complete-frame draw counts

Each run sampled five camera positions from start to finish, including fresh shadow maps on tiers that use them. Chromium 155 rendered the three live scenes at 800 × 700 CSS pixels with SwiftShader. Counts include every submission to the scene canvas for a complete frame. The extended run added 24 moving frames per scene and tier. The final replay at `e9743ca` added three moving frames per scene and tier after the cloth changes.

| Scene | Tier | Extended peak draws | Final replay peak draws | Final peak depth draws | Median draws across 24 moving frames |
| --- | --- | ---: | ---: | ---: | ---: |
| Village | Mobile | 214 | 214 | 74 | 141 |
| Village | High | 263 | 243 | 74 | 239.5 |
| Tidelight Coast | Mobile | 120 | 120 | 0 | 98.5 |
| Tidelight Coast | High | 183 | 183 | 59 | 161.5 |
| Sip Creek | Mobile | 94 | 94 | 0 | 83 |
| Sip Creek | High | 154 | 154 | 59 | 142 |

All six combinations stayed below 300 draws. Tidelight Coast and Sip Creek omit directional shadows on Mobile. On the final source all three scenes also recovered from forced WebGL context loss, showed a populated framebuffer, and updated only the visible scene’s worker physics.

The source fingerprints, camera counts, software-rendered frame rates and measurement revisions are in the [render record](render-checks.json). The [geometry checks](optimized-checks.json) and [worker-physics checks](optimized-physics.json) cover scale, stairs and motion. To repeat the draw run, serve `docs/` locally and run `THREE_ROOT=/path/to/three-0.170.0 python tools/check-scene-draws.py http://localhost:8000/`.

## Final scale and contact checks

The scene, rig, scale and motion suites passed on `e9743ca` at both detail levels. They measured 827 objects and all 86 treads, with 60 in Village and 26 in Tidelight. On each tier the stair walker ascended and descended all 60 Village treads without missing a step or intersecting a riser. Across 245 nosing crossings the minimum swing clearance was 2.807 in. Across 2,133 rail-hand samples the maximum palm-to-rail gap was 0.906 in. The maximum planted-foot slip on the stairs was 0.008 in. [Geometry results and source fingerprint](optimized-checks.json)

The timed worker-physics run used Chromium’s 4× CPU slowdown and 120 simulated seconds per trace. The strict 2 ms per-frame gate still fails in all six traces. The total number of measured frames above 2 ms fell from 216 to 75. The highest single reading was 82.7 ms in the Village spike trace. Means include shared-host scheduling and garbage collection. [Full timing distributions](optimized-physics.json)

| Scene | Steady mean, previous → final (ms) | Spike mean, previous → final (ms) | Final frames over 2 ms, steady / spike |
| --- | ---: | ---: | ---: |
| Village | 0.522 → 0.259 | 0.580 → 0.293 | 32 / 26 |
| Tidelight Coast | 0.064 → 0.059 | 0.077 → 0.044 | 9 / 3 |
| Sip Creek | 0.042 → 0.035 | 0.052 → 0.026 | 4 / 1 |

The apron, skirt and scarf each passed the original 1,800-frame garment test for lower-body clearance and triangle inversion. A second check sampled indexed cloth triangle centroids and edge midpoints every twelfth frame. In these 150 sampled poses per garment, all three cleared the pelvis, thighs and shins. Swinging hands still penetrated the apron in 13 poses (up to 0.727 in) and the skirt in 46 (up to 1.110 in). The scarf cleared the sampled arm and hand capsules throughout. The source record includes the sample frames, faces and body part at the deepest contacts. [Garment contact witnesses](optimized-physics.json)
