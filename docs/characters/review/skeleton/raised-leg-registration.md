# Raised-leg registration

Both figures use the live High character builders. The sample advances the controller at 60 Hz for 18 ticks, raises the left thigh through 70° of forward rotation and 14° of abduction over the first 15 ticks, bends the knee through 92° and dorsiflexes the foot 18°. Each character’s ordinary skin, face and garment updates run before the inspection model freezes. The plate combines three photographs from that single model. [View the plate](raised-leg.jpg)

The left column shows the skeleton. The middle column adds the muscle layer over the same bones. The right column shows the inspection skin, eyes and hair. Sippy supplies a continuous posed body surface. Roma’s covered torso, limbs and the feet inside both heroes’ trainers use the inspection surfaces. Her exposed face, hands, eyes and hair come from the live costume model. Roma’s inspection skin spans each knee and elbow using continuous rings across the joint. Sippy’s covered groin forms a sharp crease at this degree of hip flexion.

## Joint positions

The table gives positions in inches above the scene floor, with +X toward anatomical left and +Z forward. Each marker projects through the same 620 × 900 orthographic view in all three columns. Both heroes share a camera at −39.0° azimuth and 1.7° elevation and a scale of 12.02 camera pixels per inch. The photographs use the same supersampling and rescale uniformly together on the plate.

The pivot offset measures the 3D distance from the anatomical marker to the unmodified animation joint. The final column gives the distances from the marker to the nearest actual skin triangle along the viewing direction and the reverse direction. Those independent intersections put each marker between the displayed surfaces. They describe the three joint locations. The full-pose acceptance check separately tests bone and muscle coverage across the model.

| Hero | Joint | World X, Y, Z (in) | Camera X, Y (px) | Animation pivot offset (in) | Skin toward / away from camera (in) |
| --- | --- | --- | --- | --- | --- |
| Sippy | Hip | 2.25, 36.20, -0.65 | 309.1, 434.0 | 1.71 | 3.46 / 1.97 |
| Sippy | Knee | 6.47, 28.77, 11.50 | 440.5, 525.7 | 3.18 | 0.99 / 2.20 |
| Sippy | Ankle | 7.31, 16.18, 8.24 | 423.6, 675.9 | 0.52 | 0.36 / 0.96 |
| Roma | Hip | 2.95, 32.01, -0.10 | 319.9, 484.3 | 0.69 | 2.91 / 1.97 |
| Roma | Knee | 6.50, 26.99, 14.05 | 460.1, 547.8 | 0.74 | 0.96 / 1.88 |
| Roma | Ankle | 7.00, 14.50, 8.38 | 421.8, 696.2 | 0.52 | 1.29 / 1.02 |

## Articulation and articular clearance

- **Sippy**. The raised femur is 60.0° from vertical, knee flexion is 72.8°, and the ankle lies 12.51 in above the supporting ankle. A ray from the femoral head toward the acetabulum meets the ball at 0.895 in and the socket at 0.931 in, giving 0.036 in clearance before the two displayed radii are rounded.
- **Roma**. The raised femur is 71.0° from vertical, knee flexion is 94.3°, and the ankle lies 11.06 in above the supporting ankle. A ray from the femoral head toward the acetabulum meets the ball at 0.796 in and the socket at 0.831 in, giving 0.036 in clearance before the two displayed radii are rounded.

## Raised-leg surface coverage

The six-direction check separately compares actual bone and muscle triangles against the frontmost skin triangle at each sample. It uses a 448 × 448 grid and a 0.020 in depth tolerance. Hair and clothes are excluded from the skin test.

| Hero | Tier | Interior surface samples | Exposed samples | Deepest viewing-ray difference (in) |
| --- | --- | ---: | ---: | ---: |
| Sippy | High | 61,836 | 256 | 22.199 |
| Sippy | Mobile | 61,521 | 236 | 22.191 |
| Roma | High | 69,436 | 0 | 0.000 |
| Roma | Mobile | 69,192 | 0 | 0.000 |

Sippy’s trouser-conformed skin pinches inward at the sharply flexed groin. The exposed surfaces belong to the proximal femur and adjacent thigh muscles. An independent nearest-triangle measurement on the visible femur samples found about 1.4 in maximum distance to the actual skin, with a median of 0.7 in. The much larger viewing-ray differences in the table occur where the next skin surface lies across an air gap. Roma passed both tiers.

Replay this fixture from the repository root with the local Three.js 0.170.0 package. Use High and Mobile to check all six surface views.

```sh
THREE_ROOT=/path/to/three node tools/check-axon-skeleton.mjs sippy high leg-raise
THREE_ROOT=/path/to/three node tools/check-axon-skeleton.mjs roma high leg-raise
```

Sippy’s drawn knee follows the actual posed patellar skin ring. Its offset from the rig knee is visible in the measurements. The visible raised knee follows the inspection skin on Roma and the continuous costumed body on Sippy.
