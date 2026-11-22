# Hair load and rendering checks

The finer-strand release was measured at `3884cb2` on PR #26. The cold path includes the selected hero’s complete groom and its first native WebGL draw at the selected quality. The input endpoint measures when the actor moves.

| Tier | Cold route | Transferred KB | HTTP requests | JS modules | First frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | Village | 516.5 | 62 | 56 | 7.98 | 13.62 |
| Mobile | PR #25 Heros · Sippy | 390.8 | 30 | 26 | 6.16 | 8.36 |
| Mobile | Initial PR #26 · Sippy | 458.7 | 35 | 30 | 3.99 | 5.74 |
| Mobile | Finer strands · Sippy | 465.8 | 35 | 30 | 4.03 | 5.39 |
| High | Village | 516.5 | 62 | 56 | 14.27 | 20.01 |
| High | PR #25 Heros · Sippy | 390.8 | 30 | 26 | 4.86 | 7.32 |
| High | Initial PR #26 · Sippy | 495.1 | 35 | 30 | 4.18 | 5.99 |
| High | Finer strands · Sippy | 507.7 | 35 | 30 | 4.03 | 6.09 |

Each Sippy cell uses five fresh Chromium profiles. Village reuses the ten visits from PR #25 after SHA-256 validation of all 61 served files against the finer cut. The initial PR #26 timing rows come from the release at `b5cf3fa`. Its measured responses match the initial PR #26 tip `c2604a7` by SHA-256. [PR #25 runs](routes-before.json) · [Finer release runs](routes-after.json) · [Initial PR #26 runs](https://github.com/Sip-Coder/Sip-Stack/blob/c2604a71caaece7dbc7897bc2d2aa8a9a7cb7667/docs/characters/review/hair-mastery/routes-after.json)

| Tier | Remembered Roma route | Transferred KB | HTTP requests | JS modules | First frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | PR #25 Heros | 369.3 | 28 | 24 | 8.76 | 12.57 |
| Mobile | Initial PR #26 | 454.8 | 32 | 27 | 2.91 | 3.93 |
| Mobile | Finer strands | 461.9 | 32 | 27 | 3.07 | 4.25 |
| High | PR #25 Heros | 369.3 | 28 | 24 | 9.95 | 16.02 |
| High | Initial PR #26 | 489.3 | 32 | 27 | 3.32 | 4.78 |
| High | Finer strands | 500.0 | 32 | 27 | 3.20 | 4.73 |

Both selected heroes beat Village on all five repeated cold metrics at both tiers, including the faster archived Village timing medians. The Roma rows use three fresh sessions per tier with Roma selected by the saved picker. [PR #25 Roma](roma-before.json) · [Finer Roma](roma-after.json) · [Archived Village](../source-true-anatomy/routes-after.json)

| Hero | Tier | Gzip wire bytes | GLB bytes (meshopt) | Triangles | Rig joints |
|---|---|---:|---:|---:|---:|
| Sippy | Mobile | 62,417 | 98,580 | 8,578 | 6 |
| Sippy | High | 104,313 | 164,888 | 15,848 | 6 |
| Roma | Mobile | 79,167 | 154,056 | 10,422 | 24 |
| Roma | High | 117,284 | 217,240 | 16,764 | 24 |

The browser charges the full archive response and headers. The streamed gzip container unwraps before meshopt decoding. The ledgers identify the selected builder, exact tier, archive and rendered groom triangle count.

The study shader fix at `8466f15` renamed one local in the hair shader and left its math unchanged. That was the sole change to any served cold file and added 3 gzip bytes to the shader module. One fresh cold visit per hero and tier on the fixed commit verified the transfer, import graph and complete native groom draw. The byte totals rose by exactly three per visit and request and module counts were identical. The smoke latencies were collected during media and study rendering. The timing medians above remain from the isolated repeated visits. [Sippy retest](routes-after.json) · [Roma retest](roma-after.json)

## Browser guardrails

- Native hair draws were fully opaque on both tiers. The check confirmed depth writes with alpha testing, alpha-to-coverage and GL blending disabled.
- A held Roma response preserved every pixel of the preceding frame and left World visible after switching away. Hummin requested zero hair archives. The simulator used one WebGL context.
- A deliberately missing groom triggered one recovery reload for each hero. The selected groom repainted.
- Forced loss restored and repainted both quality tiers with zero GL errors. The Mobile run rejected one warm-up and still returned to the preserved target. With the study views active after the shader fix, each hero’s High portrait retained every pixel across context loss and the Mobile portrait repainted with zero GL errors. [Guardrail log](guardrails.txt)
- Five four-tab cycles on Mobile sampled 151 visible frames, 0 black frames and 0 default-framebuffer clears. [Guardrail log](guardrails.txt)
- Five four-tab cycles on High sampled 150 visible frames, 0 black frames and 0 default-framebuffer clears. [Guardrail log](guardrails.txt)
- Sippy’s sampled walking hair-bone sweep changed from 13.72° to 0.00° when reduced motion was enabled live.
- Roma’s sampled walking hair-bone sweep changed from 19.17° to 0.00° when reduced motion was enabled live.

[Asset and browser checks](groom-checks.json)

## Reproduce

Chromium 155.0.8059.79 with SwiftShader, Three.js 0.170.0, 800 × 680 at DPR 1, reduced motion, 60 ms latency, 9 Mbps down, 1.5 Mbps up and 4× CPU throttling. Each timed visit used a new Chromium process with HTTP and shader caches disabled.

```sh
export THREE_ROOT=/path/to/three-0.170.0
python tools/benchmark-route-load.py --repo "$BASE" --audit --output /tmp/groom-before.json
python tools/benchmark-route-load.py --repo "$GROOM" --audit --output /tmp/groom-after.json
python tools/compare-route-load.py /tmp/groom-before.json /tmp/groom-after.json
python tools/benchmark-route-load.py --repo "$BASE" --hero roma --routes heros --audit --rounds 3 --output /tmp/roma-before.json
python tools/benchmark-route-load.py --repo "$GROOM" --hero roma --routes heros --audit --rounds 3 --output /tmp/roma-after.json
python tools/check-hair-loading.py --repo "$GROOM" --output /tmp/groom-checks.json
python tools/check-characters.py "$SITE_URL" --system-fonts
```
