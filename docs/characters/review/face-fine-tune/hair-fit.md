# Hair fit on the BoneHub scalps

The bind seats both approved grooms on the source-size head. The new head-local mounts carry the authored curls, fibers, colors and strategic joints. The opaque scalp backing strips meet the sampled skin, including Sippy’s lower nape. Roma’s patterned band travels with the curls in the same bind frame. The front and three-quarter views show Roma’s face clearly. Her forward curl still partly obscures the eye in strict profile. [Bind and scalp fit](../../hair-groom.js)

The extracted GLBs match the approved `d116849` SHA-256 hashes. All four raw silhouette comparisons at 0°, 45°, 90° and 180° overlap 100% for each hero and tier. The High gzip archives use lossless repacking. The numbers below measure the groom on the actual neutral actor, where changing the bind reduces the envelope in inches. [Envelope check](../../../../tools/hair/check-groom-envelope.mjs)

| Hero | Tier | 94deb9d width × height × depth | Face pass width × height × depth | Groom transfer, before → after |
|---|---|---:|---:|---:|
| Sippy | Mobile | 9.40 × 8.48 × 10.24 in | 6.24 × 7.08 × 8.14 in | 62,417 → 62,417 B |
| Sippy | High | 9.37 × 8.52 × 10.20 in | 6.25 × 7.08 × 8.12 in | 104,313 → 99,801 B |
| Roma | Mobile | 15.53 × 13.50 × 14.32 in | 10.18 × 10.93 × 12.07 in | 79,167 → 79,167 B |
| Roma | High | 15.72 × 13.58 × 14.37 in | 10.31 × 10.93 × 12.23 in | 117,284 → 112,276 B |

Roma’s High headband mounted envelope is 10.83 × 6.58 × 2.57 in before and 7.10 × 5.63 × 2.86 in after. Depth is along the neutral character’s forward axis and includes the pitch of the cloth arc.

## Motion and loading

The stopped-shake fixture measures tip displacement in inches along the mounted frame’s scaled axes. Both baselines passed the existing motion gates. The refit retains the authored spring lengths, pins the roots and adjusts Roma’s head-turn lag for the shorter mounted travel. The four after runs each produce three rebounds with zero sampled tip penetrations, and reduced motion suppresses rebounding. [Motion check](../../../../tools/check-hair-motion.mjs)

| Hero | Tier | Peak tip lag, before → after | Maximum guide separation, before → after | Settle, before → after |
|---|---|---:|---:|---:|
| Sippy | Mobile | 0.357 → 0.286 in | 0.112 → 0.091 in | 1.23 → 1.23 s |
| Sippy | High | 0.366 → 0.293 in | 0.113 → 0.092 in | 1.23 → 1.23 s |
| Roma | Mobile | 0.514 → 0.364 in | 1.331 → 0.941 in | 1.53 → 1.53 s |
| Roma | High | 0.527 → 0.376 in | 1.330 → 0.944 in | 1.77 → 1.52 s |

Chromium’s loading fixture passed before and after. Each selected Mobile groom fetched once. A delayed selection kept the previous frame visible. Sippy and Roma both repainted after the simulated missing-asset recovery. Hummin issued zero groom requests. [Loading and recovery check](../../../../tools/check-hair-loading.py)

Run the checks with `THREE_ROOT` pointing to Three.js 0.170.0. The checkout used for the baseline was `94deb9d`.

```sh
node tools/hair/check-groom-envelope.mjs d116849
node tools/hair/check-groom-envelope.mjs 94deb9d --mounted /path/to/baseline
node tools/check-hair-motion.mjs /path/to/baseline
node tools/check-hair-motion.mjs
python tools/check-hair-loading.py --output /tmp/face-hair-loading.json
```
