# Superficial muscle registration

Each row compares one shipped inspection model with the offline fit and the previous inspection model at `1eab056`. The comparison uses six fixed cameras, the same projected scale and a 448 × 448 depth raster. A sample counts as formerly exposed bone when the old model's nearest triangle belongs to the skeleton and an added muscle covers that pixel in the new model. Changes to previously present muscles and growth into empty silhouette pixels are excluded from this count.

| Figure and tier | Muscles, BP3D / VHF / Z | New named parts | Pins to bone | Largest baked pin-to-target gap | Front bone pixels covered | Baked silhouette overlap across six views |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy Mobile | 357/0/4 | 38 | 743 | 0.0015 in | 2,733 / 6,012 | 99.975%–99.989% |
| Sippy High | 357/0/4 | 38 | 746 | 0.0015 in | 2,592 / 5,765 | 99.938%–100.000% |
| Roma Mobile | 285/76/4 | 26 | 741 | 0.0015 in | 1,453 / 5,703 | 99.942%–99.984% |
| Roma High | 285/76/4 | 26 | 745 | 0.0014 in | 1,483 / 5,771 | 99.974%–99.995% |

## What was checked

- Both tiers retain all 38 bilateral surfaces listed in the brief on each character. Sippy gains 34 BodyParts3D surfaces and four Z-Anatomy surfaces. Roma gains 22 and four, respectively. Her existing 76 Andreassen Visible Human Female surfaces include the eight quadriceps and four gastrocnemius heads. Each donor's original mesh identifier, side, body region, stable picker ID and cortical targets were checked. The 323-part BodyParts3D atlas includes some deep soft-tissue attachments without a named cortical target.
- For each named addition, the fit audit measures the area-weighted belly center, looks up its expected same-side bones, and computes endpoint distance to the nearest triangle of the designated fitted bone. All target surfaces include longitudinal and transverse fibre coordinates, varying belly/tendon vertex colors and a roughness of 0.3. The skin interior uses the existing stylized characters.
- On both rectus abdominis meshes, pale vertex colors form three distinct central transverse bands. Their occupied donor-height bins span approximately 0.31–0.63 in. About 85% of original rectus vertices retain deep belly color. These are visual surface markings authored in the donor coordinate system. Other broad sheets have dedicated humeral, sternal, spinal and iliac margins. The JSON reports each sheet's sampled color fractions.
- The pose audit checks neutral, three walk frames, three run frames, three roll frames and a left leg raise for each figure and tier. Across the 44 fitted poses and 3,980,221 skin/interior depth comparisons, zero interior samples exceeded the skin by the tolerance of 0.020 in. The baked neutral models passed a separate six-view skin check. These observations describe the sampled poses and projections.
- The bake audit decodes the same licensed GLBs as the browser. Four named latissimus/rectus muscles occupy the separate CC BY-SA pack in every character/tier pair. Silhouette overlap is the intersection over union of all projected skeleton and muscle pixels in the raw and decoded models.

[Per-view and per-pose measurements](anatomy-checks.json) · [Donor and endpoint audit](../../../../tools/check-muscle-registration.mjs) · [Baked GLB comparison](../../../../tools/check-baked-anatomy.mjs) · [Pose audit](../../../../tools/check-axon-skeleton.mjs)

## Reproduce

Use Three.js 0.170.0 for these tools. `THREE_ROOT` can point to its unpacked npm directory. In the comparison command, supply a clean checkout of PR #23 at `1eab056` as the first argument.

```sh
node tools/check-muscle-registration.mjs
node tools/check-baked-anatomy.mjs /path/to/pr23
for hero in sippy roma; do
  for tier in mobile high; do
    node tools/check-axon-skeleton.mjs "$hero" "$tier" rest walk run roll leg-raise
  done
done
```
