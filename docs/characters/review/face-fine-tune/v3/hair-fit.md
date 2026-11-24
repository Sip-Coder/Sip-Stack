# V3 hair fit

The fitted grooms follow the head assembly around the atlas at 1.16× for Sippy and 1.31× for Roma. Retracting the opaque backing at Sippy’s temple lets the original combs define the edge. Roma’s forehead backing follows the feathered roots, and the front waves curve rearward at eye level. The measurements below use the frozen runtime at `5032096`. [Runtime fit](../../../hair-groom.js)

Rays through Roma’s High fitted eye windows at nine angles from −90° to 90° found zero hair hits among the eye samples visible in the bare head. Each strict side view retained all eight visible bare-eye samples.

The four source GLBs match the approved decoded SHA-256 fingerprints at `d116849`. Every raw silhouette comparison at 0°, 45°, 90°, and 180° overlaps 100%. The same four gzip archives are served as in the first PR #28 review. Roma’s mounted red headband scales by 1.31 on all three axes, including its pattern. The mounted envelope includes the permitted local fit. [Envelope check](../../../../../tools/hair/check-groom-envelope.mjs)

| Hero | Tier | PR #28 first review W × H × D (in) | V3 W × H × D (in) |
| --- | --- | ---: | ---: |
| Sippy | Mobile | 6.242 × 7.079 × 8.139 | 7.137 × 8.212 × 9.441 |
| Sippy | High | 6.248 × 7.080 × 8.121 | 7.109 × 8.213 × 9.420 |
| Roma | Mobile | 10.180 × 10.930 × 12.072 | 13.336 × 14.318 × 15.807 |
| Roma | High | 10.307 × 10.933 × 12.225 | 13.502 × 14.322 × 16.015 |

The full deployed-actor motion fixture passed both tiers and heroes. It exercises idle, walk, turns, shake, tilt, run, jump, roll, and reduced motion against the scalp, ears, shoulders, collar, neck, and headband as applicable. All four shakes returned three rebounds with zero sampled tip penetrations. [Motion check](../../../../../tools/check-hair-motion.mjs)

| Hero | Tier | Peak lag (in) | Settle (s) |
| --- | --- | ---: | ---: |
| Sippy | Mobile | 0.329 | 1.23 |
| Sippy | High | 0.337 | 1.23 |
| Roma | Mobile | 0.477 | 1.53 |
| Roma | High | 0.492 | 1.52 |
