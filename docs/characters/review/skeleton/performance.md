# Human skeleton performance

Values compare main at `702e298` with the inspection geometry at `67b6ba4`. The browser selected each production actor and detail level, scrolled into Axon View and isolated the skeleton. Every skeleton triangle reported by the picker was also submitted by WebGL.

## Axon View

| Tier | Actor | Pickable bone groups | Skeleton triangles | Change | Isolated draws | All-layer draws | First opening (s) |
|---|---|---|---|---|---|---|---|
| Mobile | Sippy | 101 → 204 | 37,068 → 49,704 | +34.1% | 1 → 1 | 31 → 31 | 3.56 → 5.36 |
| Mobile | Roma | 101 → 204 | 36,908 → 49,664 | +34.6% | 1 → 1 | 7 → 7 | 2.01 → 3.00 |
| High | Sippy | 101 → 204 | 71,580 → 82,798 | +15.7% | 1 → 1 | 31 → 31 | 4.21 → 6.50 |
| High | Roma | 101 → 204 | 71,420 → 82,742 | +15.9% | 1 → 1 | 7 → 7 | 2.69 → 3.65 |

Opening time is the median of three fresh Chromium processes per actor and tier. The selected walking actor had already rendered at its requested detail. The timer starts at the first scroll that reveals Axon View and ends on the browser frame after its first real readback reached the 2D display canvas. The scroll keeps Character Ref out of view. Timing includes deferred imports, production model construction, shader preparation, rendering and readback. Each visit used the network and CPU conditions below.

| First Axon opening | Deferred ES modules | Uncompressed JS bytes | Gzip JS body bytes |
|---|---|---|---|
| Main | 6 | 78,712 | 26,856 |
| Candidate | 17 | 202,245 | 67,347 |

First opening loaded 40,491 additional gzip bytes. JS sizes sum the resource timings for scripts fetched between the scroll and the first displayed diagram. The JSON lists each module and its encoded and decoded size. [Main opening and geometry](inspector-before.json) · [Candidate opening and geometry](inspector-after.json)

## Cold Heros and Village

| Tier | Route | Transfer (decimal KB) | Requests | ES modules | First populated frame (s) | First accepted movement (s) |
|---|---|---|---|---|---|---|
| Mobile | Heros | 384.2 → 384.2 | 26 → 26 | 22 → 22 | 3.81 → 4.31 | 5.07 → 5.42 |
| Mobile | Village | 515.9 → 515.9 | 62 → 62 | 56 → 56 | 5.90 → 6.18 | 9.93 → 10.59 |
| High | Heros | 384.2 → 384.2 | 26 → 26 | 22 → 22 | 3.90 → 3.79 | 5.39 → 5.60 |
| High | Village | 515.9 → 515.9 | 62 → 62 | 56 → 56 | 9.20 → 8.97 | 11.27 → 11.58 |

Each row is the median of five paired cold visits per revision and tier. Heros moved Sippy and Village moved its camera in response to a real keyboard event. Transfer includes the document and all bytes received through that input, even when movement triggered a module still in flight. The rendered-geometry and module audits followed the timed endpoint. All 80 recorded cold-path source fingerprints are identical between builds. The skeleton and its procedural builders appeared only after opening Axon View. [Main cold evidence](route-load-before.json) · [Candidate cold evidence](route-load-after.json)

## Walking floor and offscreen cost

| Tier | Active floor selection | Pose step (ms) | Peak floor draws per frame |
|---|---|---|---|
| Mobile | Sippy | 0.15 → 0.15 | 80 → 80 |
| Mobile | Roma | 0.03 → 0.03 | 36 → 36 |
| Mobile | Hummin | 0.63 → 1.20 | 78 → 78 |
| Mobile | Lineup | 0.84 → 1.17 | 186 → 186 |
| High | Sippy | 0.12 → 0.19 | 83 → 83 |
| High | Roma | 0.05 → 0.03 | 36 → 36 |
| High | Hummin | 0.60 → 0.66 | 90 → 90 |
| High | Lineup | 0.98 → 0.82 | 201 → 201 |

The 42 source fingerprints for the walking floor also matched main. The floor suite uses an unthrottled CPU and forces a real shadow update during sampling. It includes postprocessing and shadow passes in the draw counts. Software rendering limits the absolute frame rate. [Main floor](floor-before.json) · [Candidate floor](floor-after.json)

The native offscreen probe saw 157 floor draws while the hidden Axon block produced 0 WebGL submissions and 0 2D copies. It used one live WebGL context and rendered at most 1 diagram pass per frame after a 250 ms stall. [Native guardrails](render-budget-after.json)

## Reproduction

Use Python Playwright and Chromium with an extracted Three 0.170.0 npm package as `THREE_ROOT`. The lab used headless Chromium 155.0.8059.79, ANGLE Vulkan SwiftShader, 800 × 680 CSS pixels, DPR 1 and reduced motion. Navigation and inspector timing used loopback HTTP with gzip level 6, a pinned local Three mirror, system fonts, 60 ms network latency, 9 Mbps down, 1.5 Mbps up and 4× CPU throttling. Run the suites with exclusive access to the browser and CPU. Set `BASE` to a clean checkout of `702e298`.

```sh
python tools/benchmark-route-load.py --repo "$BASE" --audit --output /tmp/routes-main.json
python tools/benchmark-route-load.py --repo . --audit --output /tmp/routes-new.json
python tools/compare-route-load.py /tmp/routes-main.json /tmp/routes-new.json
python tools/benchmark-skeleton-inspector.py --repo "$BASE" --output /tmp/axon-main.json
python tools/benchmark-skeleton-inspector.py --repo . --baseline /tmp/axon-main.json --output /tmp/axon-new.json
python tools/benchmark-heros.py --repo "$BASE" --output /tmp/floor-main.json
python tools/benchmark-heros.py --repo . --output /tmp/floor-new.json
python tools/check-heros-performance.py characters-review/performance/before.json /tmp/floor-new.json
python tools/check-axon-performance.py --output /tmp/axon-guardrails.json
```

The historical speed gate compares against its archived pre-optimization build, including its strict improvement requirement on first-load bytes and modules. The tables above compare the candidate with the current main checkout.
