# Hair load and rendering checks

The cleanup release was measured at `bce7b96` on PR #26. Each cold Heros visit includes one complete selected groom, its first native WebGL draw at the requested tier, and the first accepted movement input.

| Tier | Cold route | Transferred KB | HTTP requests | JS modules | First frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | Village | 516.5 | 62 | 56 | 7.98 | 13.62 |
| Mobile | PR #25 Heros · Sippy | 390.8 | 30 | 26 | 6.16 | 8.36 |
| Mobile | Previous PR #26 · Sippy | 465.8 | 35 | 30 | 4.03 | 5.39 |
| Mobile | Cleanup · Sippy | 428.0 | 35 | 30 | 3.72 | 4.98 |
| High | Village | 516.5 | 62 | 56 | 14.27 | 20.01 |
| High | PR #25 Heros · Sippy | 390.8 | 30 | 26 | 4.86 | 7.32 |
| High | Previous PR #26 · Sippy | 507.7 | 35 | 30 | 4.03 | 6.09 |
| High | Cleanup · Sippy | 443.1 | 35 | 30 | 3.85 | 5.69 |

Each Sippy timing cell uses five fresh Chromium profiles. The Village comparisons use ten prior visits from PR #25. All 61 served file hashes match the cleanup revision. The prior PR #26 timing rows retain their original isolated measurements from `3884cb2`. [PR #25 runs](routes-before.json) · [Cleanup runs](routes-after.json) · [Previous PR #26 runs](https://github.com/Sip-Coder/Sip-Stack/blob/d1168498fd73685b1b69a2f8fcd7ea6272df65a3/docs/characters/review/hair-mastery/routes-after.json)

| Tier | Remembered Roma route | Transferred KB | HTTP requests | JS modules | First frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | PR #25 Heros | 369.3 | 28 | 24 | 8.76 | 12.57 |
| Mobile | Previous PR #26 | 461.9 | 32 | 27 | 3.07 | 4.25 |
| Mobile | Cleanup | 458.7 | 32 | 27 | 2.95 | 4.11 |
| High | PR #25 Heros | 369.3 | 28 | 24 | 9.95 | 16.02 |
| High | Previous PR #26 | 500.0 | 32 | 27 | 3.20 | 4.73 |
| High | Cleanup | 492.9 | 31 | 26 | 3.15 | 4.36 |

Both selected heroes beat Village on all five cold metrics on both tiers, including the faster archived Village timing medians. The Roma rows use three fresh sessions per tier with Roma selected by the saved picker. [PR #25 Roma](roma-before.json) · [Cleanup Roma](roma-after.json) · [Archived Village timings](../source-true-anatomy/routes-after.json)

The resource cutoff is the first rendered frame moved by input. Roma’s secondary motion loads asynchronously after movement starts. The 31-request High visits had already drawn the full groom and accepted movement by the time `roma-secondary.js` was in flight. The High visit where both secondary modules had arrived transferred 498.8 KB across 32 requests and 27 JavaScript modules. Those totals also beat Village. [Native Roma draw records](roma-after.json)

| Hero | Tier | Gzip wire bytes | GLB bytes (meshopt) | Triangles | Rig joints |
|---|---|---:|---:|---:|---:|
| Sippy | Mobile | 24,779 | 50,216 | 4,744 | 6 |
| Sippy | High | 39,828 | 80,900 | 9,392 | 6 |
| Roma | Mobile | 81,446 | 166,792 | 12,910 | 24 |
| Roma | High | 116,262 | 235,316 | 21,000 | 24 |

The wire total includes the complete archive and HTTP headers. The archive is gzip- and meshopt-compressed. Each ledger verifies the JavaScript graph, hero, tier and the complete rendered groom triangle count.

## Browser guardrails

- All native hair draws wrote depth with blending, alpha testing and alpha-to-coverage disabled on both tiers.
- Holding Roma’s first hair archive preserved every pixel of the previous frame. Switching away left World visible. Hummin requested zero hair archives, and the Heros simulator used one WebGL context.
- A missing groom produced one recovery reload per hero and the correct groom repainted.
- Forced loss recovered the simulator on Mobile and High with zero GL errors. An injected Mobile warm-up rejection preserved the target and repainted. [Guardrail log](guardrails.txt)
- For each hero, visible Axon View retained its pixels during High context loss and rewarmed to the same picture. Character Ref also retained its High portrait during loss and repainted on Mobile. GL error reads stayed zero throughout. [Study log](guardrails.txt)
- Five four-tab cycles on Mobile sampled 134 visible frames, 0 black frames and 0 default-framebuffer clears. [Guardrail log](guardrails.txt)
- Five four-tab cycles on High sampled 140 visible frames, 0 black frames and 0 default-framebuffer clears. [Guardrail log](guardrails.txt)
- Sippy’s sampled walking hair-bone sweep changed from 13.70° to 0.00° when reduced motion was enabled live.
- Roma’s sampled walking hair-bone sweep changed from 17.59° to 0.00° when reduced motion was enabled live.

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
python tools/check-axon-view.py "$SITE_URL" --system-fonts
python tools/check-character-ref.py "$SITE_URL" --system-fonts
```
