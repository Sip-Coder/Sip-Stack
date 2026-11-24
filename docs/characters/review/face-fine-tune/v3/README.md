# Heros face revision v3

The revised faces use a 1.16× uniform head scale for Sippy and 1.31× for Roma, each around its BoneHub atlas. The front-turnaround crown-to-chin ratios are 15.53% and 16.30% on the sheets and 15.55% and 16.36% in the revised models. The skull, jaw, muscles, fat, features and grooms share each hero’s scale. The original hand, body and wardrobe geometry matched the previous protected meshes on both tiers. [Head scale and dimensions](head-scale.md)

The original Sippy and Roma sheets are stored outside `docs/`. Both files passed their supplied MD5 checks. The crop receipt records exact 7 × 7 source patches and the material colors used in the real-time renderer. [Sippy’s original sheet](../../../../../characters-review/reference-sheets/4-sippy-sheet.png) · [Roma’s original sheet](../../../../../characters-review/reference-sheets/3-roma-sheet.png) · [Complexion samples](reference-colors.json)

| Source patch | Sippy | Roma |
| --- | --- | --- |
| Forehead | `#dd9573` | `#e29467` |
| Cheek outside the blush | `#e49360` | `#cd703b` |
| Neck | `#be734c` | `#a7572e` |
| Live base material | `#b16446` | `#bd6a45` |

Each head has 16 new facial pads between muscle and skin. The authoring floor uses published bone-to-skin tissue means. Axon can isolate the pads with a dedicated control and requests them after an explicit face or fat-layer selection. [Regional thickness and published inputs](face-measurements.md) · [Isolated pads](axon-face-fat.png) · [Layer overlay](axon-face-overlay.png)

Sippy’s original lip positions match `94deb9d` within 0.000001 in after reseating. The collar-clearance probe found zero occlusions in seven angles on both tiers. The separate cavity probe exercises the neutral, smile and surprise poses. Roma’s upper and lower lip surfaces use a fuller volume and a terracotta lipstick informed by her sheet. [Original lip proof](sippy-original-lip-proof.json) · [Mouth cavity proof](mouth-clearance.json) · [Expression film](face-expressions.mp4)

The review shows the native character reference renders beside the exact sheets. Camera studies include measured landmark residuals, silhouette overlap and complexion differences. [Review plates and films](media.md) · [Reference fit results](reference-fit.md) · [50% onion skins](reference-onion-skin.png) · [Hair fit and motion](hair-fit.md) · [Load, frame and browser checks](performance.md)
