# Skin wrap load and renderer checks

The before runtime is `ff47e21`. The revised runtime is `7b9df68`. Both used Chromium 155.0.8059.79 with ANGLE SwiftShader. [Before runtime SHA-256 verification](verified-before.json)

## Cold floor load

Each visit uses a fresh Chromium process with cache disabled, 4× CPU throttling, 60 ms latency and 9 Mbps download. Mobile uses 412 × 915 at display DPR 2.6. High uses 800 × 680 at DPR 1. The cutoff is the first accepted movement frame after the real selected actor and its complete native groom have drawn. Each run audits the ES module graph, moving geometry, and real 512 or 1024 px shadow tier.

### Mobile phone

| Actor and revision | Visits | Transfer KB | Requests | JS modules | First frame s | Accepted input s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy before | 3 | 466.3 | 35 | 30 | 3.97 | 6.02 |
| Sippy after | 3 | 470.8 | 36 | 31 | 3.86 | 5.92 |
| Roma before | 3 | 462.0 | 32 | 27 | 3.68 | 5.45 |
| Roma after | 3 | 465.8 | 33 | 28 | 3.31 | 4.67 |
| Village | 5 | 516.5 | 62 | 56 | 5.03 | 8.18 |

### High desktop

| Actor and revision | Visits | Transfer KB | Requests | JS modules | First frame s | Accepted input s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy before | 1 | 502.1 | 34 | 29 | 3.86 | 5.32 |
| Sippy after | 1 | 512.7 | 36 | 31 | 3.73 | 5.58 |
| Roma before | 1 | 494.3 | 31 | 26 | 3.34 | 4.66 |
| Roma after | 1 | 509.8 | 34 | 29 | 4.18 | 6.08 |
| Village | 1 | 516.5 | 62 | 56 | 7.27 | 9.80 |

The largest revision transfers through completion of both deferred motion modules were 470.8 KB for Sippy Mobile, 471.7 KB for Roma Mobile, 512.7 KB for Sippy High and 509.8 KB for Roma High. Both heroes stayed below Village on bytes, requests and JavaScript modules. Archived Village receipts match the served files byte for byte. The baseline Sippy receipts match the before runtime. [Sippy baseline Mobile](../final-mobile.json) · [Sippy baseline High](../final-high.json) · [Roma baseline Mobile](before-roma-mobile.json) · [Roma baseline High](before-roma-high.json) · [Village Mobile](../cold-candidate.json) · [Village High](../high-candidate.json)

[Revised Sippy Mobile](after-sippy-mobile.json) · [Revised Sippy High](after-sippy-high.json) · [Revised Roma Mobile](after-roma-mobile.json) · [Revised Roma High](after-roma-high.json)

## Warmed Mobile motion

Each visit records 30 consecutive live submitted frames after the character and secondary motion are warm, with three visits per actor. Heros walks forward. Village orbits its camera. Submission intervals include Chromium scheduling and software-renderer backpressure. The CPU draw callback records the submit cost.

| Actor and revision | Frame interval p50 ms | Frame interval p95 ms | Draw callback p50 ms | Draw callback p95 ms | Frames/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sippy before | 266.70 | 466.60 | 2.60 | 4.45 | 3.8 |
| Sippy after | 266.60 | 350.00 | 3.15 | 4.65 | 3.7 |
| Roma before | 266.60 | 429.94 | 2.60 | 6.39 | 3.6 |
| Roma after | 250.00 | 533.30 | 2.45 | 5.55 | 3.7 |
| Village | 900.00 | 1886.64 | 7.60 | 12.93 | 0.8 |

The revised Mobile scene retains DPR 1.5, active multisampling and the existing 520,000-pixel ceiling. [Sippy baseline](../final-frame.json) · [Roma baseline](before-roma-frame.json) · [Village baseline](../frame-main.json) · [Revised Sippy](after-sippy-frame.json) · [Revised Roma](after-roma-frame.json)

## Explicit Axon load

A separate throttled session verifies the first complete native Axon photograph after scrolling it into view and an actual changed photograph for each selected Skin fit mode. These are one-visit inspection measurements. The revised inspection timings include contention from concurrent review captures. No anatomy or fit asset appeared on the floor path. The first default Axon photograph defers all fit assets until the Skin fit control is used.

| Actor and tier | Before Axon open KB | Revised Axon open KB | First heatmap KB · repaint | Switch to overlay KB · repaint |
| --- | ---: | ---: | ---: | ---: |
| Sippy Mobile | 1,590.2 | 1,592.1 | 21.3 · 6.96 s | 0.0 · 10.22 s |
| Roma Mobile | 9,229.3 | 9,231.2 | 21.3 · 5.75 s | 0.0 · 6.92 s |
| Sippy High | 3,106.1 | 3,108.1 | 24.8 · 4.67 s | 0.0 · 4.75 s |
| Roma High | 11,146.8 | 11,148.8 | 24.9 · 2.65 s | 0.0 · 3.99 s |

[Before Axon receipts](before-axon.json) · [Revised Axon receipts](after-axon.json)

## Browser guardrails

- The floor restored and repainted on both tiers with `GL_NO_ERROR`. An injected Mobile compile rejection exercised `sip-warm`, preserved the target and repainted.
- Ten four-tab cycles sampled 267 visible frames across Mobile and High with zero black frames or unintended default-framebuffer clears.
- Axon held its visible image during forced High context loss. Character Ref retained the portrait during context loss and repainted on Mobile. Both Sippy and Roma restored their studies with `GL_NO_ERROR`.
- Missing-groom injection repeated the single `sip-recover` reload per hero and repainted the selected hero. Floor visits charged the complete selected groom.

[Renderer checks](renderer-checks.txt) · [Groom recovery receipts](after-recovery.json)
