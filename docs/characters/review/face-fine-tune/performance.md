# Face pass load, motion and renderer checks

The before runtime is `94deb9d`. The revised floor runtime is `7783002`. Both used Chromium 155.0.8059.79 with ANGLE SwiftShader. Archived baseline measurements were reused where the served resources match `94deb9d` by SHA-256. The High warm runs are new. An earlier comparison process continued in the background during candidate timing. Each candidate's complete cold asset counts and transfer totals agreed across all visits. [Baseline receipt verification](verified-baselines.json)

## Cold floor load

Each visit uses a fresh Chromium process with cache disabled, 4× CPU throttling, 60 ms latency and 9 Mbps download. Mobile uses 412 × 915 at display DPR 2.6. High uses 800 × 680 at DPR 1. The table counts attempted requests and ES modules through the first accepted movement frame after the selected actor and complete native groom have drawn. Timings are medians.

### Mobile phone

| Actor and revision | Visits | Transfer KB | Requests | JS modules | First frame s | Accepted input s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy before | 3 | 470.8 | 36 | 31 | 3.86 | 5.92 |
| Sippy revised | 3 | 477.9 | 38 | 33 | 5.20 | 8.21 |
| Roma before | 3 | 465.8 | 33 | 28 | 3.31 | 4.67 |
| Roma revised | 3 | 478.6 | 35 | 30 | 3.95 | 6.53 |
| Village | 5 | 516.5 | 62 | 56 | 5.03 | 8.18 |

[Baseline Sippy](../body-hands-edges/skin-fit/after-sippy-mobile.json) · [Baseline Roma](../body-hands-edges/skin-fit/after-roma-mobile.json) · [Village](../body-hands-edges/cold-candidate.json) · [Revised Sippy](after-sippy-mobile-cold.json) · [Revised Roma](after-roma-mobile-cold.json)

### High desktop

| Actor and revision | Visits | Transfer KB | Requests | JS modules | First frame s | Accepted input s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy before | 1 | 512.7 | 36 | 31 | 3.73 | 5.58 |
| Sippy revised | 3 | 515.3 | 38 | 33 | 5.09 | 7.23 |
| Roma before | 1 | 509.8 | 34 | 29 | 4.18 | 6.08 |
| Roma revised | 3 | 511.7 | 35 | 30 | 4.61 | 6.68 |
| Village | 1 | 516.5 | 62 | 56 | 7.27 | 9.80 |

[Baseline Sippy](../body-hands-edges/skin-fit/after-sippy-high.json) · [Baseline Roma](../body-hands-edges/skin-fit/after-roma-high.json) · [Village](../body-hands-edges/high-candidate.json) · [Revised Sippy](after-sippy-high-cold.json) · [Revised Roma](after-roma-high-cold.json)

The complete-load rows also charge the deferred motion modules. Each cumulative candidate value is the maximum measured across three cold visits. Village used 516,509 bytes, 62 requests and 56 modules on each tier. A positive margin indicates bytes below Village.

| Complete candidate floor | Bytes | Requests | JS modules | Bytes below Village | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Sippy Mobile | 477,872 | 38 | 33 | 38,637 | Pass |
| Roma Mobile | 478,636 | 35 | 30 | 37,873 | Pass |
| Sippy High | 515,256 | 38 | 33 | 1,253 | Pass |
| Roma High | 511,746 | 35 | 30 | 4,763 | Pass |

## Warmed motion

The tests record three visits and 30 successive native submitted frames per actor on Mobile, and three visits and 20 frames per actor on High. Heros walks forward with hair motion active. Village orbits its camera. Frame intervals include Chromium scheduling and SwiftShader backpressure. The draw callback measures CPU submission. Each table reports the median of the visit-level statistics from this test environment.

### Mobile phone

| Actor and revision | Frame interval p50 ms | Frame interval p95 ms | Draw callback p50 ms | Draw callback p95 ms | Frames/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sippy before | 266.60 | 350.00 | 3.15 | 4.65 | 3.7 |
| Sippy revised | 333.30 | 459.96 | 2.90 | 5.40 | 3.1 |
| Roma before | 250.00 | 533.30 | 2.45 | 5.55 | 3.7 |
| Roma revised | 316.70 | 530.00 | 2.95 | 5.25 | 3.1 |
| Village | 900.00 | 1886.64 | 7.60 | 12.93 | 0.8 |

[Baseline Sippy](../body-hands-edges/skin-fit/after-sippy-frame.json) · [Baseline Roma](../body-hands-edges/skin-fit/after-roma-frame.json) · [Village](../body-hands-edges/frame-main.json) · [Revised Sippy](after-sippy-mobile-frame.json) · [Revised Roma](after-roma-mobile-frame.json)

### High desktop

| Actor and revision | Frame interval p50 ms | Frame interval p95 ms | Draw callback p50 ms | Draw callback p95 ms | Frames/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sippy before | 250.00 | 316.61 | 3.50 | 6.82 | 3.9 |
| Sippy revised | 233.40 | 426.61 | 3.10 | 5.44 | 4.2 |
| Roma before | 200.00 | 255.00 | 2.85 | 5.30 | 5.1 |
| Roma revised | 200.00 | 366.75 | 2.85 | 4.39 | 5.0 |
| Village | 1599.90 | 3061.48 | 8.30 | 13.94 | 0.6 |

[Baseline Sippy](before-sippy-high-frame.json) · [Baseline Roma](before-roma-high-frame.json) · [Village](before-village-high-frame.json) · [Revised Sippy](after-sippy-high-frame.json) · [Revised Roma](after-roma-high-frame.json)

Some whole-floor frame intervals increased compared with main. Sippy Mobile p50 rose from 266.60 to 333.30 ms. Roma Mobile p50 rose from 250.00 to 316.70 ms. Sippy High p95 rose from 316.61 to 426.61 ms. Roma High p95 rose from 255.00 to 366.75 ms.

## Groom payload and recovery

The approved groom asset baselines match `d116849` byte for byte on `94deb9d`. The two High archives use tighter lossless gzip compression. The decoded GLBs match all four approved assets byte for byte. Geometry and rig counts track the groom's structural rendering work. The live frame table above measures the entire floor with motion enabled. [Decoded groom GLB hashes](groom-glb-identity.json)

| Actor and tier | Groom bytes before → revised | Triangles before → revised | Skinned triangles before → revised | Rig joints before → revised |
| --- | ---: | ---: | ---: | ---: |
| Sippy Mobile | 62,417 → 62,417 | 8,578 → 8,578 | 864 → 864 | 6 → 6 |
| Sippy High | 104,313 → 99,801 | 15,848 → 15,848 | 1,320 → 1,320 | 6 → 6 |
| Roma Mobile | 79,167 → 79,167 | 10,422 → 10,422 | 2,416 → 2,416 | 24 → 24 |
| Roma High | 117,284 → 112,276 | 16,764 → 16,764 | 4,048 → 4,048 | 24 → 24 |

The demand-load check held the previous image during a delayed actor switch. Blocking the first groom request triggered one `sip-recover` reload on each hero and repainted the selected character. Reduced motion kept the groom joints nearly stationary during an otherwise active walk. [Baseline groom GLBs](before-groom-assets.json) · [Revised groom and recovery receipts](after-groom-loading.json)

## Axon face-muscle network and rendering

A throttled session per actor and tier tracks requests and the first changed Axon image read back from the rendered canvas. Each cell reports transfer, requests and elapsed seconds for the named action. The inspection browser shared the machine with review captures. Both the Heros floor and ordinary Axon opening produced zero face atlas requests. The explicit Face heatmap loaded the face data and muscle atlas. Switching to Face overlay reused those resources. The Axon browser checks exercise the final cancellation edit on this floor runtime. The served `axon-view.js` has SHA-256 `699b83ef5d98e3c011e14ac07c1d08e9632b37b42fe3bfe441909162a1670c75`.

| Actor and tier | Before Axon open | Revised Axon open | First face heatmap | Face overlay after heatmap |
| --- | ---: | ---: | ---: | ---: |
| Sippy Mobile | 1,592.1 KB · 20 · 25.90 s | 1,594.6 KB · 21 · 44.81 s | 3,697.0 KB · 4 · 14.41 s | 0.0 KB · 0 · 13.13 s |
| Roma Mobile | 9,231.2 KB · 20 · 30.81 s | 9,233.7 KB · 21 · 66.68 s | 3,935.5 KB · 4 · 21.69 s | 0.0 KB · 0 · 15.32 s |
| Sippy High | 3,108.1 KB · 20 · 12.56 s | 3,110.6 KB · 21 · 22.14 s | 3,700.5 KB · 4 · 16.51 s | 0.0 KB · 0 · 9.88 s |
| Roma High | 11,148.8 KB · 20 · 25.21 s | 11,151.3 KB · 21 · 40.82 s | 3,939.2 KB · 4 · 18.12 s | 0.0 KB · 0 · 9.34 s |

[Baseline Axon receipts](../body-hands-edges/skin-fit/after-axon.json) · [Revised face Axon receipts](after-face-axon.json)

## Browser guardrails

- Ten four-tab cycles sampled 281 visible frames across Mobile and High. The harness observed zero black frames, unintended default-framebuffer clears or browser JavaScript or GL invalid-operation errors.
- The Mobile canvas retained DPR 1.5, active multisampling and the existing 520,000-pixel ceiling. Both tiers restored from context loss and rendered with `GL_NO_ERROR`. The injected Mobile `sip-warm` rejection returned to the preserved target and repainted. The hidden floor made no canvas presents and resumed painting on return.
- Both grooms drew with opaque depth-writing materials. Character Ref preserved its portrait and repainted on Mobile after forced context loss. Axon recovered and both studies painted with `GL_NO_ERROR` for Sippy and Roma.
- Hummin’s live Axon inventory, geometry, transforms and materials produced identical SHA-256 identities to `94deb9d` on Mobile and High.

[Renderer checks](renderer-checks.txt) · [Renderer and recovery source hashes](renderer-source-identity.json) · [Hummin identity receipts](after-hummin.json)
