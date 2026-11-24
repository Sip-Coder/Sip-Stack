# Camera match and likeness measurements

The six High-quality native views use the frozen floor at `a6e8d51`. Both builds use their matched camera for each pose. Frames are 516 × 558 px with a 15.512 in vertical aperture at the focus plane. The sheets do not specify lens metadata. The nominal 85–105 mm focal choices approximate the viewing directions and foreshortening. A single two-dimensional similarity aligns three or four visible anchors per image. Held-out features measure the residual likeness. Colors and geometry remain as rendered. [Marked features](reference-landmarks.png) · [50% onion skin](reference-onion-skin.png)

| Hero and view | Yaw / pitch | Equivalent lens | Held-out RMS native px | Projected RMS in | Head with groom IoU | ΔE00 forehead / cheek / neck |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sippy front | 0° / 0° | 85 mm | 24.6 | 0.684 | 0.785 | 5.3 / 2.6 / 12.9 |
| Sippy three quarter | -42° / -2° | 90 mm | 37.1 | 1.032 | 0.725 | 3.3 / 1.8 / 6.1 |
| Sippy profile | -90° / 0° | 105 mm | 40.3 | 1.121 | 0.484 | 17.6 / 20.6 / 20.4 |
| Roma front | 0° / 0° | 85 mm | 21.3 | 0.593 | 0.663 | 1.2 / 8.6 / 21.0 |
| Roma three quarter | -42° / -14° | 85 mm | 34.1 | 0.949 | 0.684 | 9.9 / 14.4 / 10.2 |
| Roma profile | 90° / 0° | 105 mm | 43.1 | 1.198 | 0.719 | 14.0 / 2.9 / 11.3 |

Pixel RMS is the held-out displacement after camera alignment expressed at native review resolution. Inches project that screen displacement onto the actual focus plane. Head with groom IoU uses the intersection and union of manually traced visible outlines clipped to the same reference panel. Individual features passed over in the strict profile are the ones hidden by hair or the far side of the face. Raw color differences include the sheets’ painted highlights and shadow, especially around the neck and profile.

| Hero | Sheet forehead | Sheet cheek | Sheet neck | Hair crown to chin / standing height |
| --- | --- | --- | --- | ---: |
| Sippy | `#dd9573` | `#e49360` | `#be734c` | 15.53% |
| Roma | `#e29467` | `#cd703b` | `#a7572e` | 16.30% |

[Reference sample coordinates, hashes and palette](reference-colors.json) · [Point and outline annotations](reference-landmarks.json) · [All per-point errors and alignment parameters](reference-metrics.json)

## Remaining likeness differences

The new eye sizes favor the sheet expression over a literal fit to the orbital opening. That preserves the visible globe at phone size. The strict profiles still show a narrow iris and some lid edges remain sharp.

Sippy retains the 94deb9d mouth contour and expression. The fitted profile still shows a projecting chin and bands around the mouth and cheek. Roma’s lipstick and cheek volume read in the three-quarter view, and her jaw still looks more angular than the sheet.

The supplied groom shapes and pattern remain the source. Moving the fringe improves Roma’s profile without creating the curls or highlights of the painted sheet. Closer likeness would require a separate sculpt and groom pass for the remaining silhouettes and transitions, plus lighting matched to the sheet rather than the live stage.
