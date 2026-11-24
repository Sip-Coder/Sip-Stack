# Hummin in Bots

[Matched design comparisons](hummin-likeness.jpg) show the original sheets, the Blender-exported GLB and a 50% overlay for the front, elevated three-quarter and left-profile views. Each uses the original [orthographic camera settings](../../tools/blueprints/views.json) and the neutral pose. The [seven original design views](../blueprints/hummin/design/) inform the full model.

- [Phone](bots-phone.png) · [Desktop](bots-desktop.png)
- [Turnaround](hummin-turnaround.mp4) · [Blink and smile](hummin-blink-smile.mp4)

Open `#bots` to orbit with a mouse, touch or the arrow keys. The expression buttons play the GLB’s two face animations. The idle clip moves the head with the feet planted. With reduced motion enabled, Turnaround advances in quarter turns.

## Build the GLB

From the repository root, use Blender 4.3.2 and gltfpack 1.1.0. The Blender scripts create the helmet, display, articulated shells, apron and scarf. The asset stores PBR materials, two eye morphs for Blink and one mouth morph for Smile.

```sh
blender -b --factory-startup --python-exit-code 1 --python tools/bots/hummin.py -- /tmp/hummin.raw.glb
npx --yes gltfpack@1.1.0 -cc -kn -ke -vp 15 -vn 10 -i /tmp/hummin.raw.glb -o docs/bots/hummin.glb
```

## Check the browser

Install Python Playwright and Chromium. Point the harness to the unpacked npm packages for Three.js 0.170.0 and Mermaid 11. The harness starts its own server from `docs/` and prints the phone comparison and browser checks.

```sh
python tools/bots/check_viewer.py --three /path/to/three --mermaid /path/to/mermaid --output /tmp/bots-check.json
```
