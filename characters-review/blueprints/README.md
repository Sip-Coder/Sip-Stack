# Heros character blueprints

Each design sheet was drawn from Jonathan’s character art and committed before model fitting. The source file, seven illustrations and palette at each design commit are available for comparison with the posed model. [Turnaround workflow reference](https://x.com/soya_da_yoot/status/2123456611880448269)

| Hero | Original design | Rendered model | Overlay | Measurements |
| --- | --- | --- | --- | --- |
| Sippy | [Blueprint](sippy/blueprint.jpg) · [design commit](https://github.com/Sip-Coder/Sip-Stack/commit/6b8aab5) | [Seven views](sippy/model.jpg) | [Silhouettes](sippy/overlay.jpg) | [Landmark, colour and silhouette results](sippy/match.json) |
| Roma | [Blueprint](roma/blueprint.jpg) · [design commit](https://github.com/Sip-Coder/Sip-Stack/commit/b07c68f) | [Seven views](roma/model.jpg) | [Silhouettes](roma/overlay.jpg) | [Landmark, colour and silhouette results](roma/match.json) |
| Hummin | [Blueprint](hummin/blueprint.jpg) · [design commit](https://github.com/Sip-Coder/Sip-Stack/commit/b1c98ce) | [Seven views](hummin/model.jpg) | [Silhouettes](hummin/overlay.jpg) | [Landmark, colour and silhouette results](hummin/match.json) |

## Reading the overlays

Dark teal marks agreement, ochre shows design-only coverage and blue shows model-only coverage. Intersection over union divides the number of pixels occupied by both figures by the number occupied by either figure. Open spaces between limbs and edges of carried objects contribute to the score. The threshold is 0.92 on the front and both anatomical profiles. The other four views show the fit from behind, above and on the diagonals.

The orthographic camera frame is 512 × 768 pixels, centered at half the nominal height and spanning 1.20 heights vertically. All seven views share this scale. The model is captured after 42 grounded idle ticks. Vertical landmarks run down from the crown, while groom or dome width runs between its two outermost points. Each landmark’s tolerance is 1.5 percentage points of nominal height. The `landmarks.json` in each model directory identifies the sampled mesh vertices.

The material check renders the production materials in a neutral D65 booth with an 18% grey surround. It measures representative surface regions for finishes with more than one colour, including the iris, pupil and fabric stripes. The material’s procedural maps, vertex colours, gloss, emission and transparency contribute to the measurement. Each sampled sRGB colour is compared with its authored swatch using CIEDE2000, with a maximum ΔE₀₀ of 6. The rendered swatches and per-material readings are in each `model/` directory.

## Reproducing the measurements

From the repository root, use Three.js 0.170.0, Chromium, Python with Playwright, NumPy and Pillow, and DejaVu fonts for the printed sheets. `THREE_ROOT` points to a local Three.js package. `CHROME` overrides the default Chromium executable.

```sh
THREE_ROOT=/path/to/three python tools/blueprints/render-models.py
python tools/blueprints/check-match.py
python tools/blueprints/sheets.py
```

Each command accepts `--hero sippy`, `--hero roma` or `--hero hummin` to inspect one character. The seven camera angles are defined in [views.json](../../tools/blueprints/views.json).
