# Explorer design sheets

Sippy’s headphones rest on his collarbones above a charcoal quilted vest. Roma’s red headband, mustard jacket, emerald cargos and separate field bag follow her individual explorer design. Hummin wears cream armor, a tan knitted scarf and an indigo work apron. The sheets use feet and inches.

| Hero | Original artwork | Production model | Comparison | Geometry and colour |
| --- | --- | --- | --- | --- |
| Sippy | [Design sheet](sippy/blueprint.jpg) | [Turnaround](sippy/model.jpg) | [Side by side](sippy/comparison.jpg) · [Silhouette overlay](sippy/overlay.jpg) | [Measurements](sippy/match.json) |
| Roma | [Design sheet](roma/blueprint.jpg) | [Turnaround](roma/model.jpg) | [Side by side](roma/comparison.jpg) · [Silhouette overlay](roma/overlay.jpg) | [Measurements](roma/match.json) |
| Hummin | [Design sheet](hummin/blueprint.jpg) | [Turnaround](hummin/model.jpg) | [Side by side](hummin/comparison.jpg) · [Silhouette overlay](hummin/overlay.jpg) | [Measurements](hummin/match.json) |

## Registration

The illustrations use independently drawn contour stations, clumps, equipment outlines and brush strokes. The same orthographic camera specification projects both the construction art and the animated model. Each figure stands in a fixed 512 × 768 frame spanning 1.20 standing heights. SHA-256 digests cover the design targets and all seven illustrations for each hero. The match check verifies these inputs before reading the model masks. [Fixed design inputs](design-freeze.json) · [Camera specification](../../tools/blueprints/views.json)

After 42 grounded idle ticks, the renderer measures named vertices on the live High and Mobile meshes. The maximum landmark error is 1.5 percentage points of nominal height. Human chin measurements also verify the explorer head-to-body proportions. Each overlay shows agreement in dark teal, design-only pixels in ochre and model-only pixels in blue. The IoU threshold is 0.92 for front, anatomical left and anatomical right, including open spaces between arms and legs.

The material check renders every bound production material in a neutral D65 booth with an 18% grey surround. Procedural maps, vertex colours, gloss, alpha and emission remain active. The measured sRGB colours are compared against the fixed design swatches with CIEDE2000 and a maximum ΔE₀₀ of 6. Material codes with more than one optical appearance, including Sippy's illustrated eyes and Hummin’s screen, have separate sample regions.

## Reproduce

The design renderer uses Python, NumPy, SciPy, Pillow and a C compiler. The real-model capture uses Three.js 0.170.0, Chromium, Python Playwright, NumPy and Pillow. The printed sheets use DejaVu. Set `THREE_ROOT` to an unpacked Three.js package. Set `CHROME` when Chromium has a different executable path.

```sh
python tools/blueprints/sippy-art.py
python tools/blueprints/roma-art.py
python tools/blueprints/hummin-art.py
THREE_ROOT=/path/to/three python tools/blueprints/render-models.py
python tools/blueprints/check-match.py
python tools/blueprints/sheets.py
```

Pass `--hero sippy`, `--hero roma` or `--hero hummin` to the capture, comparison or sheet tools to run an individual hero. The latter two commands also accept an alternate capture directory via `--out`.
