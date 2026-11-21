# Heros browser performance

Both revisions ran in headless Chromium 155.0.8059.79 with ANGLE Vulkan SwiftShader on an AMD EPYC 9V74 host (five visible logical CPUs, four CPUs of cgroup quota). Both used the same 800 × 680 CSS viewport and DPR 1. The WebGL canvas was 497 × 449 pixels. The FPS figures describe this software renderer.

The left side of each arrow is main at `a59620d`. The right side uses the application files committed at `ebbf2ad`. Their recorded hashes match that revision. The raw measurements retain the per-frame timings, resource lists, submitted mesh names and content hashes of the served source files. [Before](before.json) · [After](after.json)

## Navigation and selection

Each tier starts at the normal `/#heros` route in a fresh context. Sippy reports navigation to the first visible hero. Roma and Hummin report their first selections. Lineup enters after the three characters have been seen. Body transfer and module counts are cumulative through each presentation.

| Tier | Presented | Time from action (s) | Gzip and binary body (KiB) | Browser transfer (KiB) | JS modules |
|---|---|---:|---:|---:|---:|
| Mobile | Sippy | 30.53 → 5.68 | 558.3 → 428.6 | 576.1 → 438.0 | 54 → 25 |
| Mobile | Roma | 1.88 → 1.18 | 558.3 → 441.8 | 576.1 → 452.0 | 54 → 28 |
| Mobile | Hummin | 1.75 → 1.97 | 558.3 → 479.2 | 576.1 → 491.8 | 54 → 36 |
| Mobile | Lineup | 1.18 → 0.87 | 558.3 → 479.2 | 576.1 → 491.8 | 54 → 36 |
| High | Sippy | 30.40 → 7.12 | 558.3 → 428.6 | 576.1 → 438.0 | 54 → 25 |
| High | Roma | 3.21 → 1.43 | 558.3 → 441.8 | 576.1 → 452.0 | 54 → 28 |
| High | Hummin | 3.36 → 1.98 | 558.3 → 479.2 | 576.1 → 491.8 | 54 → 36 |
| High | Lineup | 2.32 → 0.94 | 558.3 → 479.2 | 576.1 → 491.8 | 54 → 36 |

## Interactive floor

| Tier | Actor | Pose step (ms) | Script/frame (ms) | Draws/frame, mean | Draws/frame, maximum | Rendered FPS |
|---|---|---:|---:|---:|---:|---:|
| Mobile | Sippy | 16.26 → 0.24 | 201.1 → 4.1 | 851.8 → 58.9 | 854 → 80 | 4.18 → 7.02 |
| Mobile | Roma | 115.82 → 0.03 | 1,602.2 → 2.2 | 433.2 → 28.7 | 438 → 36 | 0.62 → 12.69 |
| Mobile | Hummin | 2.37 → 0.85 | 39.6 → 4.8 | 298.8 → 56.9 | 302 → 78 | 6.41 → 10.65 |
| Mobile | Lineup | 120.63 → 1.07 | 1,577.2 → 10.0 | 1,569.0 → 140.2 | 1,569 → 186 | 0.63 → 5.79 |
| High | Sippy | 17.16 → 0.10 | 305.6 → 3.4 | 1,145.9 → 65.8 | 1,150 → 83 | 1.84 → 3.25 |
| High | Roma | 148.93 → 0.03 | 1,923.8 → 2.3 | 433.2 → 30.0 | 438 → 36 | 0.52 → 7.42 |
| High | Hummin | 1.85 → 0.64 | 22.1 → 4.3 | 322.3 → 72.8 | 326 → 90 | 3.07 → 4.07 |
| High | Lineup | 171.01 → 0.80 | 2,384.2 → 8.1 | 1,889.0 → 163.5 | 1,889 → 201 | 0.41 → 2.17 |

## Measurement

- A fresh browser context opens `/#heros` with an empty HTTP cache, Fast 4G emulation (9 Mbps down, 1.5 Mbps up, 60 ms latency) and 4× CPU throttling. The picker forces the reported tier. The clock stops at the first browser presentation opportunity after an actual mesh beneath the requested actor's root submits a perspective color draw and the stage reveals its canvas. Lineup requires draws from all three roots.
- Each cold tour uses Sippy, Roma, Hummin, then Lineup. Each new picker action is timed from its click. The shared local server uses gzip level 6 for HTML, CSS and JavaScript, relays the pinned Three r170 package on the same throttled connection, and uses system fonts. Chromium Resource Timing supplies the encoded body length, transfer size including browser-accounted headers, and unique loaded JavaScript module paths. Each tier has one independent cold tour. Repeat trials are appropriate for comparing small changes in load latency.
- The separate interactive run opens the real floor with its existing review controls and unthrottled CPU and network. Each actor and tier has a fresh browser context. Pose timing uses eight warm-up steps followed by eight batches of four actual fixed steps at running input (all three idle controllers in Lineup). Each batch includes the controller, model pose, final support correction and HUD update. Script/frame is elapsed time inside the application's rendering `requestAnimationFrame` callback, including synchronous driver stalls. FPS counts actual draw-producing animation frames across the 12-frame sample during a held movement key. The raw WebGL count covers indexed, array and instanced draws on every render target, including shadow refreshes and the screen output pass.

## Reproduce

Install Python Playwright, Chromium, and the unpacked `three@0.170.0` npm package. Run from the speed checkout with paths to the detached baseline, Chromium executable, and Three package root. The comparison checks both direct-load reductions and the brief's per-actor, Lineup and draw-call budgets.

```bash
export CHROME=/usr/bin/chromium
export THREE_ROOT=/path/to/three-r170
python tools/benchmark-heros.py --repo /path/to/baseline --output /tmp/heros-before.json
python tools/benchmark-heros.py --repo . --output /tmp/heros-after.json
python tools/check-heros-performance.py /tmp/heros-before.json /tmp/heros-after.json
```
