# Axon View performance

On Mobile detail, the first populated Heros frame appeared at 3.80 seconds, compared with 5.79 seconds for Village. Heros made 26 requests, including 22 JavaScript modules, on both tiers. Across all ten cold Heros visits, none requested the Axon stylesheet, inspector, renderer or procedural layer builders before the first accepted movement.

## Cold navigation

Each cell is the median of five fresh visits. Each round alternated Heros and Village. Times start at direct navigation. The first frame must show Sippy or the populated village; accepted input must change the position of Sippy or the Village camera. Transfer is the HTTP document and all response bytes received through that movement, including partially received requests. KB is decimal.

| Tier | Route | Build | Transfer KB | Requests | ES modules | First populated frame (s) | Accepted input (s) |
|---|---|---|---:|---:|---:|---:|---:|
| Mobile | Heros | Before | 383.4 | 26 | 22 | 3.65 | 4.60 |
| Mobile | Heros | After | 383.0 | 26 | 22 | 3.80 | 5.01 |
| Mobile | Village | Before | 515.9 | 62 | 56 | 5.91 | 9.85 |
| Mobile | Village | After | 515.9 | 62 | 56 | 5.79 | 10.10 |
| High | Heros | Before | 383.4 | 26 | 22 | 3.54 | 5.19 |
| High | Heros | After | 384.0 | 26 | 22 | 3.78 | 5.40 |
| High | Village | Before | 515.9 | 62 | 56 | 8.51 | 11.17 |
| High | Village | After | 515.9 | 62 | 56 | 9.28 | 11.75 |

The final complete Heros response set measured 384,038 bytes, up 672 bytes from the baseline. Some runs accepted movement while the 1,039-byte demand-loaded Sippy secondary module was in flight. The 80 recorded source fingerprints in each run were checked against the baseline at `b04e518`, the release implementation at `055b276`, and the pinned Three package. The reports retain each request ledger and ES module verification. [Before](route-load-before.json) · [After](route-load-after.json)

The runs used Chromium 155.0.8059.79 on ANGLE SwiftShader, 800 × 680 CSS pixels, DPR 1, reduced motion, and a fresh process and profile each time. Both routes used the same loopback HTTP/1.1 server, gzip level 6, local Three r170 mirror, system fonts, 9 Mbps down, 1.5 Mbps up, 60 ms network latency and 4× CPU throttling. The tier labels refer to the actual selected detail level. These are browser lab measurements on a software renderer.

## Visible and offscreen rendering

The native WebGL probe measured the assembled, midpoint and fully exploded diagrams, then made every layer translucent and selected a part. The peak includes every WebGL draw in a diagram presentation frame, including any other scene that submitted draws in that frame.

| Character | Peak Mobile draws | Peak High draws |
|---|---:|---:|
| Sippy | 31 | 31 |
| Roma | 7 | 7 |
| Hummin | 29 | 29 |

The browser created one WebGL context for the floor and diagram. The orthographic scene rendered once per invalidated presentation frame and submitted no draw or 2D blit while the floor moved with the inspector fully offscreen. A 250 ms main-thread stall produced at most one diagram pass per presentation frame. The browser presented 43 diagram images. Each had at least 51 sampled RGB color bins. The loaded sources matched release `055b276`. [Native draw counts, frame submissions, pixel checks and loaded source fingerprints](render-budget.json)

## Reproduction

Install Python Playwright and Chromium. Set `THREE_ROOT` to the extracted Three 0.170.0 npm package. From the candidate checkout, set `BASE` to a clean checkout of the before revision, `b04e5184f8d4e8ae74c32b55e2d74825c500a8f2`. Allow the two timing runs exclusive use of CPU and GPU.

```sh
python tools/benchmark-route-load.py --repo "$BASE" --audit --output /tmp/axon-before.json
python tools/benchmark-route-load.py --repo . --audit --output /tmp/axon-after.json
python tools/compare-route-load.py /tmp/axon-before.json /tmp/axon-after.json
python tools/check-axon-performance.py --output /tmp/axon-render.json
```
