# Source anatomy load measurements

The comparisons use merged PR #24 at `80e1cdf`. The table reports medians of three fresh Axon visits per hero and tier. The first complete frame includes the full anatomical inventory, the rebuilt skin and clothes, and the normal Axon controls. The measured face-pass checkout is `4c54a10`. [Pre-face anatomy measurements](pre-face/README.md)

| Hero | Tier | PR #24 complete | Source complete | Compared with #24 | Available-layers preview | Wire KB, #24 → source |
|---|---|---:|---:|---:|---:|---:|
| Sippy | Mobile | 4.69 s | 4.87 s | 1.04× | — | 2,351.3 → 1,596.9 |
| Roma | Mobile | 3.67 s | 15.60 s | 4.25× | 4.83 s | 1,963.3 → 9,236.0 |
| Sippy | High | 6.34 s | 7.43 s | 1.17× | — | 3,487.6 → 3,112.9 |
| Roma | High | 5.10 s | 18.75 s | 3.68× | 8.03 s | 3,017.2 → 11,153.6 |

Roma’s complete first open exceeds PR #24’s timing on both tiers. The original Andreassen file adds 7,072,248 bytes on both tiers. The shaped 9 Mbps connection takes at least 6.29 seconds for that file alone. The inspector first paints the available anatomy and labels the pending female lower-limb surfaces. Compared with PR #24’s complete frame, Roma’s preview took 1.32× on Mobile and 1.57× on High. The complete time includes the female pack’s download, decode, upload and presentation. [Baseline Axon visits](first-open-before.json) · [Source Axon visits and per-asset timings](first-open-after.json)

| Hero | Tier | Source GLB count | Bone triangles | Muscle triangles | All scene draws | Studio finish draws |
|---|---|---:|---:|---:|---:|---:|
| Sippy | Mobile | 4 | 75,522 | 212,590 | 32 | 1 |
| Roma | Mobile | 4 | 75,606 | 1,477,218 | 18 | 1 |
| Sippy | High | 4 | 259,342 | 461,730 | 32 | 1 |
| Roma | High | 4 | 255,282 | 1,691,930 | 18 | 1 |

Each visit received the selected source assets once. The renderer poses each original or pre-adapted anatomical part with a rigid transform and the character’s common scale. The normal path started zero Workers. The benchmark verified native drawing of the complete figure and isolated skeleton.

## Cold navigation

Each cell shows PR #24 → this branch. Five fresh navigations per route and tier contributed to each median. The interaction time ends when a real movement input changes the character or camera.

| Tier | Route | Transfer, decimal KB | HTTP requests | JS modules | First populated frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | Village | 516.5 → 516.5 | 62 → 62 | 56 → 56 | 6.74 → 6.87 | 11.09 → 10.95 |
| Mobile | Heros | 385.3 → 390.8 | 26 → 30 | 22 → 26 | 4.24 → 4.29 | 5.46 → 5.70 |
| High | Village | 516.5 → 516.5 | 62 → 62 | 56 → 56 | 9.14 → 9.10 | 12.30 → 11.43 |
| High | Heros | 385.3 → 390.8 | 26 → 30 | 22 → 26 | 4.53 → 3.85 | 6.57 → 5.89 |

Heros remains lighter and faster than Village on all five cold-route metrics at both tiers. The Heros cold ledgers show zero scans and zero anatomy decoder modules. [Baseline navigation visits](routes-before.json) · [Source navigation visits](routes-after.json)

The Village sample set was retained after checking every one of its 61 actual response files by SHA-256 against this checkout. Those visits ran at `2fc3102`.

## Rendering and recovery

- The four-tab run sampled 580 frames across 20 cycles. It recorded 0 black frames and 0 default-framebuffer clears. Forced driver loss and an injected shader warm failure both recovered. [Rendering guardrail log](guardrails.txt)
- Axon shared a single WebGL context and presented 47 native images. The walking floor submitted 162 draws while Axon was offscreen. Axon submitted 0 passes and 0 canvas copies during that interval. [Native WebGL measurements](native-render.json)
- All 135 Hummin inspection parts matched PR #24 on both tiers by a hash of transforms, indices, vertex attributes, material settings and texture data. [Hummin identity report](hummin-identity.json)
- Character Ref, the cold floor and Hummin opened with zero scan requests. A held Sippy source request could be superseded by Hummin. Injected Sippy and Roma source request failures each triggered one reload and recovered through the local Retry control. [Demand and recovery report](loading-recovery.json)
- Character Ref painted 38 Sippy panels and 37 Roma panels on each tier. The expression panels were visually distinct. The live sheet retained photos through context loss, rendered updated clothing from the source builder and recovered from a stale module. Axon also passed orbit, layer isolation and opacity, part picking, ghost skin, touch, context recovery and gamepad checks. [Interactive browser checks](interactive-browser.txt)

## Reproduction

Use Chromium 155.0.8059.79 and Three.js 0.170.0. The 800 × 680 sessions used DPR 1, reduced motion, SwiftShader, 60 ms latency, 9 Mbps downstream, 1.5 Mbps upstream and 4× CPU slowdown. HTTP and shader caches were disabled. The GLB files used meshopt. The ledgers include SHA-256 for the served files.

```sh
export THREE_ROOT=/path/to/three-0.170.0
python tools/benchmark-skeleton-inspector.py --repo "$BASE" --output /tmp/first-open-before.json
python tools/benchmark-skeleton-inspector.py --source-geometry --output /tmp/first-open-after.json
python tools/benchmark-route-load.py --repo "$BASE" --audit --output /tmp/routes-before.json
python tools/benchmark-route-load.py --audit --output /tmp/routes-after.json
python tools/compare-route-load.py /tmp/routes-before.json /tmp/routes-after.json
python tools/check-characters.py "$SITE_URL" --system-fonts
python tools/check-axon-performance.py --output /tmp/native-render.json
python tools/check-scan-loading.py "$SITE_URL" --system-fonts --report /tmp/loading-recovery.json
node tools/check-hummin-identity.mjs "$BASE" .
```
