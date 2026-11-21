# Character Ref performance

On Mobile detail, Heros displayed its first character in 3.68 seconds and responded to movement in 4.80 seconds. Village took 5.82 and 10.03 seconds in the same browser lab. Across all ten cold Heros visits, the browser requested no Character Ref or Axon View module or stylesheet before the first accepted movement.

## Cold navigation

Each row is the median of five fresh visits. Heros and Village alternated within each tier. A successful frame had to show Sippy or the populated village, and a real keyboard input had to move the character or Village camera. Transfer includes the HTTP document and actual response bytes received through that input. KB is decimal.

| Tier | Route | Build | Transfer KB | Requests | ES modules | First populated frame (s) | Accepted input (s) |
|---|---|---|---:|---:|---:|---:|---:|
| Mobile | Heros | Axon base | 383.0 | 26 | 22 | 3.80 | 5.01 |
| Mobile | Heros | With Character Ref | 383.1 | 26 | 22 | 3.68 | 4.80 |
| Mobile | Village | Axon base | 515.9 | 62 | 56 | 5.79 | 10.10 |
| Mobile | Village | With Character Ref | 515.9 | 62 | 56 | 5.82 | 10.03 |
| High | Heros | Axon base | 384.0 | 26 | 22 | 3.78 | 5.40 |
| High | Heros | With Character Ref | 384.1 | 26 | 22 | 3.69 | 5.25 |
| High | Village | Axon base | 515.9 | 62 | 56 | 9.28 | 11.75 |
| High | Village | With Character Ref | 515.9 | 62 | 56 | 9.15 | 11.55 |

The fully received Heros response set grew by **81 bytes**, from 384,038 to 384,119. On some runs, movement was acknowledged while the 1,039-byte Sippy secondary-motion module was in flight. The before rows reuse the preceding Axon PR’s measured visits. All 80 recorded source hashes were independently matched against the stacked base at `f006c60` and the pinned Three r170 package. All 80 after-run fingerprints match the Character Ref release at `1d548b0` and that same package. [Baseline records and source provenance](route-load-before.json) · [Fresh Character Ref records](route-load-after.json)

Both sets used Chromium 155.0.8059.79 on ANGLE SwiftShader, 800 × 680 CSS pixels, DPR 1, reduced motion, a new process and profile per visit, disabled service workers and caches, and system fonts. Both used the same HTTP/1.1 loopback server, gzip level 6, mirrored Three 0.170.0, emulated 9 Mbps down, 1.5 Mbps up, 60 ms network latency and 4× CPU throttling. The audit verified actual rendered geometry, tier-specific shadow settings and ES module identity for every visit.

## Thumbnail rendering and cache

The production page used the simulator’s one WebGL context. Across both tiers, all 202 eligible panels submitted real geometry and a print pass to that context, then copied their final pixels to a 2D thumbnail. The 202 prints landed in 202 distinct browser frames. The rendered images contained 19–149 sampled RGB color bins each.

| Character | Live panels per tier | Peak Mobile GL draws in a sheet frame | Peak High GL draws in a sheet frame |
|---|---:|---:|---:|
| Sippy | 35 | 53 | 56 |
| Roma | 31 | 24 | 24 |
| Hummin | 35 | 51 | 63 |

On ordinary Refresh, the page rebuilt Hummin’s High model and validated its thumbnail signatures. All 35 full RGBA buffers retained their SHA-256 hashes, with zero new scene submissions or thumbnail copies. After scrolling back to the simulator, 90 real floor draws occurred while the hidden sheet submitted zero draws and copies. Scrolling back into the unchanged sheet triggered revalidation and reused the cached images. The probe matched all 56 served rendering-source fingerprints against release `1d548b0` and the Three mirror. [Native draw counts, context, panel hashes and source fingerprints](render-budget.json)

## Reproduction

Install Chromium and Python Playwright, set `THREE_ROOT` to an extracted Three 0.170.0 npm package, and set `BASE` to a clean checkout of `f006c603171dd5b6207ee233874e7b506ef8e09b`. Run the two cold suites with exclusive access to CPU and GPU.

```sh
python tools/benchmark-route-load.py --repo "$BASE" --audit --output /tmp/ref-before.json
python tools/benchmark-route-load.py --repo . --audit --output /tmp/ref-after.json
python tools/compare-route-load.py /tmp/ref-before.json /tmp/ref-after.json
python tools/check-character-ref-performance.py --output /tmp/ref-render-budget.json
```

## Cost of opening the sheet

A separate single-core Chromium 155 probe without a GL context measured the CPU work after opening Character Ref. Constructing Sippy Mobile’s complete production rig and preparing its reference data took 1.27 seconds, including a 737 ms main-thread task. Roma Mobile took 187 ms and Hummin Mobile took 940 ms. Extraction yields between batches, but a production builder can still pause interaction while constructing its geometry. First-visit Heros figures above exclude this deferred work. [Model-construction samples](model-construction.json)
