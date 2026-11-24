# Sippy fit and hand verification

The production comparison uses PR #24 at `b450863`, main at `e8c6ed6`, and the revised models at `9017de7`. [Side-by-side plates and turnaround](media.md)

## Garment silhouette

Measurements come from cuts through the posed shirt, hoodie, vest, and collar meshes on High. Midriff and ribcage cuts are at 37% and 68% of the distance from the pelvis to the shoulder line. PR #24 has a different rig, so its cuts compare the relative silhouette.

| Section | PR #24 | Main | Revision |
| --- | ---: | ---: | ---: |
| Midriff width | 13.09 in | 13.20 in | 12.58 in |
| Midriff depth | — | 12.65 in | 12.20 in |
| Ribcage width | 13.03 in | 14.06 in | 13.48 in |

From 3.36 to 8.41 in off center, the upper garment silhouette drops 2.24 in on the left and 2.53 in on the right. On main the corresponding drops were 0.60 and 0.52 in. The collar covers the main shoulder opening, and the cream cuff facing ends inside the burgundy sleeve. Roma’s waist-to-hip ratio is 0.742, and the front and profile views show the existing waist and hip curve.

## Finger separation

On both tiers, a cut through four fingers on each hand shows open gaps. The cuts are 4.23 in from the left wrist mesh origin and 3.65 in from the right. Main has one fused island at those stations.

| Tier | Narrowest gap at those cuts | Lateral grid interval | Triangles per hand |
| --- | ---: | ---: | ---: |
| Mobile | 0.631 in | about 0.42 in | 4,512 |
| High | 0.578 in | about 0.39 in | 5,620 |

Each hand is one connected surface. Its wrist boundary sits inside the sleeve cuff. The thumb is opposed and the other four fingers are gently flexed. The same relaxed sculpt rides the existing wrist through animation. Nail color is part of the skin mesh.

## Protected geometry and pose

- The dressed source-rig check reproduced the same joint dimensions and uniform scale as main in idle, walk, run, jump and roll.
- The canonical geometry audit checked all 503 source-true Sippy meshes and 219 source-true Roma meshes in both tiers and in neutral and walk poses. The greatest drawn-position residual was below 0.000005 in. The anatomy archives and Roma’s adapted muscle pack match main byte for byte.
- The head geometry, material and transform fingerprints matched main for Sippy and Roma on both tiers. Hummin’s 135 inspection parts per tier matched main by geometry and material hash. Hair archives and authoring files match main, and all four existing hair motion checks passed.
- All six Heros motion cases passed on the existing rig. In the six-view Axon coverage check, the revised Sippy had zero torso or shoulder penetrations and zero dressed silhouette leaks on both tiers. The finer hand reveals a few more neutral depth mismatches at the wrist and fingers against the existing donor pose. Dressed depth pixels across all six 512-pixel views rose from 16 to 34 on Mobile and 19 to 38 on High.
