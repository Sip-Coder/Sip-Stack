# Hair load and rendering checks

The comparison stacks the groom release at `b5cf3fa` on PR #25 at `654d73b`. The cold path includes the selected hero’s complete groom and the first native WebGL draw at the selected quality. Input time ends when the actor actually moves.

| Tier | Cold route | Transferred KB | HTTP requests | JS modules | First frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | Village | 516.5 | 62 | 56 | 7.98 | 13.62 |
| Mobile | PR #25 Heros · Sippy | 390.8 | 30 | 26 | 6.16 | 8.36 |
| Mobile | Groom Heros · Sippy | 458.7 | 35 | 30 | 3.99 | 5.74 |
| High | Village | 516.5 | 62 | 56 | 14.27 | 20.01 |
| High | PR #25 Heros · Sippy | 390.8 | 30 | 26 | 4.86 | 7.32 |
| High | Groom Heros · Sippy | 495.1 | 35 | 30 | 4.18 | 5.99 |

Each cell uses five fresh Chromium profiles. Village reuses the ten visits from the exact PR #25 run after SHA-256 validation of all 61 served files against the groom commit. Timing samples from the PR #25 run span cache-free browser trials while other render work was active. The archived responses also match by SHA-256. Their earlier Sippy first frames were 4.29 s on Mobile and 3.85 s on High, with input accepted at 5.70 s and 5.89 s, respectively. [PR #25 runs](routes-before.json) · [Groom release runs](routes-after.json) · [Archived PR #25 runs](../source-true-anatomy/routes-after.json)

| Tier | Remembered Roma route | Transferred KB | HTTP requests | JS modules | First frame, s | First accepted input, s |
|---|---|---:|---:|---:|---:|---:|
| Mobile | PR #25 Heros | 369.3 | 28 | 24 | 8.76 | 12.57 |
| Mobile | Groom Heros | 454.8 | 32 | 27 | 2.91 | 3.93 |
| High | PR #25 Heros | 369.3 | 28 | 24 | 9.95 | 16.02 |
| High | Groom Heros | 489.3 | 32 | 27 | 3.32 | 4.78 |

Both selected heroes beat Village on all five cold metrics at both tiers. Both also beat the faster archived Village timing medians.

These rows use three fresh sessions per tier with Roma selected by the saved picker. [PR #25 Roma sessions](roma-before.json) · [Groom Roma sessions](roma-after.json)

| Hero | Tier | Gzip wire bytes | GLB bytes (meshopt) | Triangles | Rig joints |
|---|---|---:|---:|---:|---:|
| Sippy | Mobile | 56,099 | 87,276 | 8,780 | 6 |
| Sippy | High | 92,418 | 143,572 | 15,918 | 6 |
| Roma | Mobile | 72,802 | 126,460 | 9,118 | 24 |
| Roma | High | 107,308 | 176,572 | 15,088 | 24 |

The browser charges the full archived response, including headers. The streamed gzip container is unwrapped before meshopt decoding. The ledgers include the selected builder, exact tier, archive path and rendered groom triangles. Hair uses opaque surfaces and shares the simulator’s context.

## Browser guardrails

- Holding Roma’s first hair response preserved every pixel of the preceding frame. The delayed selection left World visible. Selecting Hummin issued zero hair requests, and the simulator used one WebGL context.
- An injected 404 for each hero’s hair archive triggered one `sip-recover` reload, then the correct hero painted.
- Forced context loss recovered on Mobile and High with `gl.getError()` returning zero. The Mobile run rejected one shader warm and still drew the preserved target.
- With Character Ref and Axon View active, Roma’s High portrait retained identical pixels through context loss and the Mobile portrait repainted. The browser recorded zero invalid resource deletes and zero GL errors. The follow-up changed only the lazy study renderers. Every file in the cold ledgers retained its measured SHA-256. [Guardrail log](guardrails.txt)
- Across 20 four-tab cycles on Mobile, Chromium sampled 571 visible frames, 0 black frames and 0 default-framebuffer clears. [Guardrail log](guardrails.txt)
- Across 5 four-tab cycles on High, Chromium sampled 137 visible frames, 0 black frames and 0 default-framebuffer clears. [Guardrail log](guardrails.txt)
- Sippy’s sampled walking hair-bone sweep changed from 4.97° to 0.00° when reduced motion was enabled live.
- Roma’s sampled walking hair-bone sweep changed from 8.98° to 0.00° when reduced motion was enabled live.

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
