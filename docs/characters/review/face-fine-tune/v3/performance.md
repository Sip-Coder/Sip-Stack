# Face revision load, motion and renderer checks

The revised runtime is `a6e8d51`. Main is `94deb9d` and the initial PR is `1009294`. Prior timings are the existing pinned SwiftShader runs. The current floor trials are fresh and confirm loaded resources by SHA-256. The baseline receipt verification records which archived assets exactly match main. Mobile warm timing uses `5032096`. The final checkout changes only the desktop startup branch, and the active Mobile startup path and shared floor have identical behavior. Absolute timing depends on the software renderer and available CPU. [Baseline receipt verification](../verified-baselines.json)

## Phone physics and cold input

The initial PR screenshot used manual review. Manual ticks advance the position without updating the live rate sample. The previous sampled value stays on screen. In fresh native live phone captures under SwiftShader, main showed 1 Hz for Sippy and 2 Hz for Roma at the screenshot. V3 showed 1 Hz for both. The live sampler reported 1–5 Hz on main and in v3 during those software captures. The clock test preserved the 60 Hz nominal step, fractional carry, cap of two ticks per render callback and the 40/50 Hz quality thresholds. [Live phone receipts](capture.json) · [Renderer and clock checks](guardrails.txt)

The initial face pass added 13,158 native Mobile triangles and seven draw groups on Sippy versus main. A Node isolation probe measured a similar median walk step for the original and initial PR, 0.034 ms each. The real cold endpoint includes scheduling and the software renderer waiting for a movement frame. V3 starts the selected phone groom transfer alongside the builder. Desktop keeps tier choice ahead of groom transfer so a requested High visit charges only its selected asset. Two crossover visits per variant on the initial PR requested its groom earlier with the same 38 requests and 33 modules. Timings varied under shared machine load. In the full floor run Sippy Mobile accepted input at 5.81 s. The archived runs measured 5.92 s on main and 8.21 s on the initial PR. [Isolated request crossover](startup-profile.json)

## Cold floor load

Each v3 actor and tier used three fresh Chromium processes, 4× CPU throttling, 60 ms latency and 9 Mbps download. Mobile is 412 × 915 CSS pixels at 2.6× display DPR. The desktop High timing viewport is 800 × 680 at DPR 1. The comparison endpoint is the first accepted movement frame with native groom geometry. Counts are medians.

### Mobile

| Actor | Visits | Transfer KB | Requests | JS modules | First frame s | Accepted input s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy main | 3 | 470.8 | 36 | 31 | 3.86 | 5.92 |
| Sippy initial PR | 3 | 477.9 | 38 | 33 | 5.20 | 8.21 |
| Sippy v3 | 3 | 478.1 | 38 | 33 | 3.78 | 5.81 |
| Roma main | 3 | 465.8 | 33 | 28 | 3.31 | 4.67 |
| Roma initial PR | 3 | 478.6 | 35 | 30 | 3.95 | 6.53 |
| Roma v3 | 3 | 480.1 | 35 | 30 | 3.20 | 5.01 |
| Village | 5 | 516.5 | 62 | 56 | 5.03 | 8.18 |

[Sippy main](../../body-hands-edges/skin-fit/after-sippy-mobile.json) · [Sippy initial PR](../after-sippy-mobile-cold.json) · [Sippy v3](after-sippy-mobile-cold.json) · [Roma main](../../body-hands-edges/skin-fit/after-roma-mobile.json) · [Roma initial PR](../after-roma-mobile-cold.json) · [Roma v3](after-roma-mobile-cold.json) · [Village](../../body-hands-edges/cold-candidate.json)

### High

| Actor | Visits | Transfer KB | Requests | JS modules | First frame s | Accepted input s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy main | 1 | 512.7 | 36 | 31 | 3.73 | 5.58 |
| Sippy initial PR | 3 | 515.3 | 38 | 33 | 5.09 | 7.23 |
| Sippy v3 | 3 | 515.5 | 38 | 33 | 5.01 | 7.01 |
| Roma main | 1 | 509.8 | 34 | 29 | 4.18 | 6.08 |
| Roma initial PR | 3 | 511.7 | 35 | 30 | 4.61 | 6.68 |
| Roma v3 | 3 | 513.3 | 35 | 30 | 3.57 | 5.30 |
| Village | 1 | 516.5 | 62 | 56 | 7.27 | 9.80 |

[Sippy main](../../body-hands-edges/skin-fit/after-sippy-high.json) · [Sippy initial PR](../after-sippy-high-cold.json) · [Sippy v3](after-sippy-high-cold.json) · [Roma main](../../body-hands-edges/skin-fit/after-roma-high.json) · [Roma initial PR](../after-roma-high-cold.json) · [Roma v3](after-roma-high-cold.json) · [Village](../../body-hands-edges/high-candidate.json)

The complete-load receipts count the movement-triggered secondary modules. Village charged 516,509 bytes, 62 requests and 56 modules on each tier. The candidate totals use the largest value observed in each group.

| Complete floor | Bytes | Requests | JS modules | Bytes below Village | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Sippy Mobile | 478,071 | 38 | 33 | 38,438 | Pass |
| Roma Mobile | 480,149 | 35 | 30 | 36,360 | Pass |
| Sippy High | 515,455 | 38 | 33 | 1,054 | Pass |
| Roma High | 513,259 | 35 | 30 | 3,250 | Pass |

Sippy’s exterior data uses a smaller lossless integer representation. Its 5,549 decoded coordinates match exactly. An isolated packing check matched triangle indices, positions and normals for all 56 protected body and wardrobe surfaces on each tier. The combined profile and decoder saved 2,800 gzip bytes in the isolation check. [Lossless packing proof](body-profile-packing.json)

## Warmed motion

Frame intervals include software rendering and browser scheduling. The CPU draw callback measures submission. Three visits per v3 actor and tier captured 30 moving frames per visit on Mobile and 20 per visit on High. Heros walks with hair motion active, and Village orbits its camera.

### Mobile

| Actor | Frame p50 ms | Frame p95 ms | CPU draw p50 ms | CPU draw p95 ms | Frames/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sippy main | 266.60 | 350.00 | 3.15 | 4.65 | 3.7 |
| Sippy initial PR | 333.30 | 459.96 | 2.90 | 5.40 | 3.1 |
| Sippy v3 | 283.30 | 409.96 | 2.85 | 3.87 | 3.3 |
| Roma main | 250.00 | 533.30 | 2.45 | 5.55 | 3.7 |
| Roma initial PR | 316.70 | 530.00 | 2.95 | 5.25 | 3.1 |
| Roma v3 | 266.70 | 380.04 | 2.65 | 4.83 | 3.5 |
| Village | 900.00 | 1886.64 | 7.60 | 12.93 | 0.8 |

[Sippy main](../../body-hands-edges/skin-fit/after-sippy-frame.json) · [Sippy initial PR](../after-sippy-mobile-frame.json) · [Sippy v3](after-sippy-mobile-frame.json) · [Roma main](../../body-hands-edges/skin-fit/after-roma-frame.json) · [Roma initial PR](../after-roma-mobile-frame.json) · [Roma v3](after-roma-mobile-frame.json) · [Village](../../body-hands-edges/frame-main.json)

### High

| Actor | Frame p50 ms | Frame p95 ms | CPU draw p50 ms | CPU draw p95 ms | Frames/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sippy main | 250.00 | 316.61 | 3.50 | 6.82 | 3.9 |
| Sippy initial PR | 233.40 | 426.61 | 3.10 | 5.44 | 4.2 |
| Sippy v3 | 200.00 | 256.66 | 3.20 | 8.15 | 4.9 |
| Roma main | 200.00 | 255.00 | 2.85 | 5.30 | 5.1 |
| Roma initial PR | 200.00 | 366.75 | 2.85 | 4.39 | 5.0 |
| Roma v3 | 200.00 | 288.30 | 2.85 | 5.28 | 5.1 |
| Village | 1599.90 | 3061.48 | 8.30 | 13.94 | 0.6 |

[Sippy main](../before-sippy-high-frame.json) · [Sippy initial PR](../after-sippy-high-frame.json) · [Sippy v3](after-sippy-high-frame.json) · [Roma main](../before-roma-high-frame.json) · [Roma initial PR](../after-roma-high-frame.json) · [Roma v3](after-roma-high-frame.json) · [Village](../before-village-high-frame.json)

## Browser guardrails

- Ten four-tab cycles sampled 307 visible frames. The test recorded zero black frames, unintended clears, and browser JavaScript or GL errors.
- Mobile retained internal DPR 1.5, the existing pixel cap and active MSAA. Both tiers repainted after forced context loss. An injected warm-up error repainted the preserved target. The hidden floor produced zero presents.
- Opaque groom drawing, recovery after a failed request, retained previous image on delayed actor switching, and both Character Ref and Axon context recovery passed.
- Hummin’s live tier identities and all four decoded approved groom GLBs match main by SHA-256. Both credits and the core render and recovery sources remain at their recorded identities.
- The cold floor produced zero face muscle or face fat requests. Native Axon checks confirmed deferred face layers on both tiers. [Axon receipts](after-face-axon.json)

[Renderer receipts](guardrails.txt) · [Render source identity](renderer-source-identity.json) · [Groom loading and recovery](after-groom-loading.json) · [Approved groom identity](groom-identity.json) · [Hummin identity](after-hummin.json)
