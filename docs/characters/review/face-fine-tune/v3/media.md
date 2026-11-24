# Heros face revision

The evidence compares main at `94deb9d` and revised floor at `a6e8d51`. Each live pair uses the same lens and lighting. The target rows preserve the official sheet views, including Roma’s right-facing three-quarter portrait and left-facing profile. The phone pictures are Mobile quality at 412 × 915 CSS px and 2.6× DPR. The desktop pictures are High quality at 1,440 × 960 CSS px. [Capture manifest](capture.json)

The target rows come from the original team-supplied sheets at their own scale. Full sheets are in the repository’s characters-review/reference-sheets directory outside the published site.

| Hero | Phone | Desktop |
| --- | --- | --- |
| Sippy | [Comparison](compare-sippy-phone.png) | [Comparison](compare-sippy-desktop.png) |
| Roma | [Comparison](compare-roma-phone.png) | [Comparison](compare-roma-desktop.png) |

The default stage captures use the live idle simulator after its HUD begins sampling. The display rate records the capture host’s software rendering cadence. Each figure is captured on the running clock after live render sampling begins. [Default phone framing](phone-default.png) · [HUD and timing explanation](performance.md)

## Design review

| Item | Verdict | Evidence |
| --- | --- | --- |
| 1 · Eyes, lids and lashes | Partly. The eye build targets 87.5% of the main globe diameter and the visible spans measure about 86.2%. Lids and lashes read from the front. Some socket edges are hard and the iris is still narrow in profile. | [Matched views](design-eyes.png) |
| 2 · Lips and expression | Partly. Sippy’s prior contour and smile are restored and Roma has a fuller lip with lipstick. The underside of Sippy’s mouth still reads sharply in profile. | [Matched views](design-lips.png) |
| 3 · Olive complexion | Partly. Both use a shared sheet-derived tone on face, ears, neck and hands. The matched light shows residual color and shading differences in the profile and neck. | [Matched views](design-complexion.png) |
| 4 · Eyebrows | Partly. The brows gain an arch and taper. Their height and thickness still vary from the sheets. | [Matched views](design-eyebrows.png) |
| 5 · Button nose | Partly. The openings are tucked from the front. Sippy’s profile shows two sharp changes in the bridge-to-tip contour. | [Matched views](design-nose.png) |
| 6 · Cheekbones | Partly. The measured Sippy malar depths now agree within 0.002 in. Horizontal bands remain under parts of the cheek and mouth. | [Matched views](design-cheekbones.png) |
| 7 · Jaw and chin | Not met. Both necks remain visible. Sippy’s chin still projects in profile and Roma’s lower outline remains angular. | [Matched views](design-jaw.png) |
| 8 · Brow ridge | Partly. The side brow depths moved from roughly 0.8–1.0 in to roughly 0.3 in. The profile transition still appears sharper than in the sheets. | [Matched views](design-forehead.png) |
| 9 · Hair | Partly. Roma’s fringe edge is softer and the lead curl clears her profile. A thin profile iris and visible dark Sippy temple areas remain. | [Matched views](design-hair.png) |

[Camera match, landmarks and onion skin](reference-fit.md)

[Axon skin, fat, muscle and skull](axon-face-overlay.png) · [Facial fat isolated](axon-face-fat.png) · [Axon gap heatmap](axon-face-heatmap.png)

[Turnaround film](face-turnaround.mp4) · [Blink, smile and open-mouth film](face-expressions.mp4)
