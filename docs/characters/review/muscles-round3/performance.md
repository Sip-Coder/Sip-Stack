# Axon load and rendering measurements

All four first-open times measure scrolling from a populated Heros floor to the next browser presentation opportunity after the selected, fully populated Axon image reaches the display canvas. Each median uses three fresh visits. Stable picker inventories, selected tiers, real GLB transfers, actual GPU draws and the isolated bone triangle counts are verified on every visit.

## First opening of Axon View

| Tier | Hero | PR #23 before | Baked after | Pre-scan main | 1.5× cap | After / pre-scan | Wire bytes before → after | Runtime path before → after |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Mobile | Sippy | 23.50 s | 4.44 s | 5.03 s | 7.55 s | 0.88× | 1,122,993 → 2,351,269 | main-thread fit → baked |
| Mobile | Roma | 18.07 s | 3.51 s | 3.15 s | 4.73 s | 1.11× | 1,248,644 → 1,963,281 | main-thread fit → baked |
| High | Sippy | 21.56 s | 6.36 s | 6.17 s | 9.26 s | 1.03× | 1,585,129 → 3,487,601 | main-thread fit → baked |
| High | Roma | 20.93 s | 5.19 s | 3.80 s | 5.70 s | 1.37× | 1,784,900 → 3,017,241 | main-thread fit → baked |

PR #23 at `1eab056` is the before build. The cap uses the recorded `85d3ad1` procedural build that preceded scanned anatomy. The slowest of the three Roma High visits reached 5.832 s, 0.129 s above the 5.703 s median-based threshold. Its other visits took 5.192 and 4.943 s. All twelve baked opens used the selected primary and share-alike packs. Each GLB was requested once. No raw atlases or fit Workers were loaded on those visits. The baked downloads include the prepared skin and clothing as well as anatomy, so first-open transfer increases. Removing raw fitting from the UI thread reduces elapsed time. Wire bytes include response headers, JavaScript, CSS and geometry. [Before first-open ledgers](first-open-before.json) · [After first-open ledgers](first-open-after.json) · [Pre-scan timing record](../scan-skeleton/inspector-before.json)

| Tier | Hero | Primary GLB bytes | Separate CC BY-SA GLB bytes | Deferred JS, gzip bytes | Pickable muscles | Muscle triangles | All geometry draws + studio finishing draw |
|---|---|---:|---:|---:|---:|---:|---:|
| Mobile | Sippy | 1,942,988 | 373,112 | 31,859 | 361 | 209,950 | 33 + 1 |
| Mobile | Roma | 1,596,768 | 331,344 | 31,859 | 365 | 176,054 | 9 + 1 |
| High | Sippy | 2,938,224 | 514,208 | 31,859 | 361 | 361,628 | 33 + 1 |
| High | Roma | 2,458,464 | 523,608 | 31,859 | 365 | 325,904 | 9 + 1 |

## Cold navigation

Each cell shows PR #23 → this branch. Medians cover five fresh navigations per route and tier. The first frame contains the requested character or village. Time to interactive includes a real input that moved the character or camera.

| Tier | Route | Transfer, decimal KB | HTTP requests | ES modules | First populated frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | Heros | 384.7 → 385.3 | 26 → 26 | 22 → 22 | 6.18 → 4.42 | 8.28 → 5.62 |
| Mobile | Village | 516.4 → 516.5 | 62 → 62 | 56 → 56 | 10.06 → 6.70 | 17.73 → 11.40 |
| High | Heros | 384.7 → 385.3 | 26 → 26 | 22 → 22 | 7.21 → 4.56 | 11.51 → 5.88 |
| High | Village | 516.4 → 516.5 | 62 → 62 | 56 → 56 | 16.04 → 9.87 | 22.90 → 12.65 |

The Heros medians finished below Village on all five metrics at both detail tiers. The cold-route ledgers contain zero Axon GLBs, fit Workers or decoder modules. [Before route ledgers](routes-before.json) · [After route ledgers](routes-after.json)

## Rendering and recovery

- Twenty World/Outline/Village/Heros cycles produced 558 sampled stage frames (301 Heros, 257 Village), zero black frames and zero default-framebuffer clears on Heros. Both tiers restored the walking floor after forced context loss and shader rewarming. Injected transient module failures recovered and persistent faults stopped after a single reload. [Guardrail run](guardrails.txt)
- Axon shared one live GL context. It rendered 41 populated inspection frames. During 263 offscreen floor draws, it made zero geometry draws, finishing draws or copies. A 250 ms injected stall on High Sippy peaked at 1 geometry pass and 1 finishing pass per frame. [Native WebGL and readback evidence](native-render.json)
- Both Hummin models matched PR #23 for all 135 parts, including transforms, material and texture data, vertex attributes and indices. Mobile has 94,740 triangles and High has 142,444. [Per-tier SHA-256 results](hummin-identity.json)
- A missing primary Sippy pack and a missing Roma share-alike pack each started one real dedicated Worker. A selectable 170-bone preview appeared while the full model loaded. A superseded job was terminated and transient module or asset failures recovered through the site’s reload path. [Fallback, cancellation and recovery records](loading-recovery.json)

## Reproduction

The lab used Chromium 155.0.8059.79, ANGLE Vulkan SwiftShader, an 800 × 680 viewport, DPR 1 and reduced motion. The controlled HTTP/1.1 server served the pinned Three.js r170 distribution locally, with gzip level 6 for text, 60 ms latency, 9 Mbps downstream, 1.5 Mbps upstream and 4× CPU slowdown. A fresh process/profile disabled HTTP and shader disk caches for each visit. Mobile and High are verified application detail tiers. The repeated first-open runs used the same four browser CPU cores. Shared host load varied during the baseline and cold-route tests, so the Heros/Village within-build comparison is the more direct timing test. The response ledgers give exact transfer and request counts. Source hashes for all served files are recorded in each JSON ledger.

```sh
export THREE_ROOT=/path/to/three-0.170.0
python tools/benchmark-skeleton-inspector.py --repo "$BASE" --output /tmp/first-open-before.json
python tools/benchmark-skeleton-inspector.py --repo . --time-baseline docs/characters/review/scan-skeleton/inspector-before.json --output /tmp/first-open-after.json
python tools/benchmark-route-load.py --repo "$BASE" --audit --output /tmp/routes-before.json
python tools/benchmark-route-load.py --repo . --audit --output /tmp/routes-after.json
python tools/compare-route-load.py /tmp/routes-before.json /tmp/routes-after.json
python tools/check-axon-performance.py --repo . --output /tmp/native-render.json
python tools/check-characters.py "$SITE_URL" --system-fonts
```
