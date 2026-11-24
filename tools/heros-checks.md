# Heros regression checks

## Body layer order

Build every hero body from the inside out. Establish the bones and their joint landmarks first. Wrap the muscles around the bones, then derive the skin from the muscle and the underlying bony landmarks. For a mechanical hero, follow the same order with the frame, actuators and shell.

Keep the skin close to the anatomy so the silhouette and surface relief follow it. Add fullness only where the character design deliberately calls for it. Fit the clothing over the finished skin with its own ease. Before approving a body pass, inspect the layer overlay and clearance in Axon View.

## Playable speed rigs

Use Node 22.15 or newer with the same Three.js 0.170.0 package as the site. The command builds the original procedural models, applies production batching and selects each detail tier in the same order as the tab. It exercises all three heroes on High and Mobile without opening Chromium or using a GPU.

```sh
THREE_ROOT=/path/to/unpacked/three node tools/check-characters-motion.mjs --speed
```

Append `sippy`, `roma` or `hummin` to isolate a character. The equivalent standalone entry point is `tools/check-heros-motion.mjs`. Both return JSON and exit nonzero on failure. Measurements appear in metres, seconds and degrees to match the simulation.

- Walk and run speeds, forward lean, hip bob and inward turn bank are measured from the posed transforms. Actual heel, forefoot and middle-third triangle sections establish touchdown order, pitch, midfoot support and planted drift. The original 0.02 m drift limit and 0.001 m midfoot-at-run-touchdown limit apply.
- Every visible vertex, including its active skin weights and morphs, contributes to the standing height and ground extrema on every fixed tick of a running shoulder roll on level ground. The original roll allowance is 0.0001 m below ground through 0.01 m above it.
- The suite verifies jump, landing, crate blocking, step ascent and ramp traversal. For each greeting it follows a real hand vertex relative to the chest through onset, excursion and return.
- It tests all five Sippy quiff groups, six Roma wave groups and Hummin's antenna. For each, the farthest actual vertex is followed in its mount frame, with a second, stationary run on the same simulation clock to account for idle motion. Each guide must travel over 0.0005 m, stay below 0.15 m excursion and 0.06 m per tick, and settle to within 0.0015 m of the idle trace by 1.65 seconds after release. These are guide-level smoke checks for the simplified rigs.

Use `tools/check-characters.py` for the actual WebGL tab, navigation, controls and recovery. `tools/benchmark-heros.py` measures loading and rendering performance. The geometry command does not measure either.

## Reproducing the detailed character-art checks

The merged PR #16 tree at `a59620d` includes the models and exact checkers for the previous dense art. From a separate checkout of that commit, with Three.js 0.170.0 and Chromium installed, run the following commands.

```sh
THREE_ROOT=/path/to/unpacked/three node tools/check-characters-motion.mjs
THREE_ROOT=/path/to/unpacked/three CHARACTERS_HAIR_MOBILE=only node tools/check-characters-motion.mjs
THREE_ROOT=/path/to/unpacked/three node tools/check-characters-garments.mjs
THREE_ROOT=/path/to/unpacked/three CHARACTERS_TIER=mobile node tools/check-characters-garments.mjs
THREE_ROOT=/path/to/unpacked/three python tools/blueprints/render-models.py
python tools/blueprints/check-match.py
```

The historical suite covers the individually simulated hair ribbons, 86-pose accessory and scalp collision probes, the 1,095-tick ribbon strain audit, the old multi-ply seam and body registries, and the named anatomical and material bindings for the frozen seven-view illustrations. The speed rigs combine or replace those parts. The current geometry suite does not certify per-ribbon contacts, per-layer garment clipping or D65 swatch and silhouette agreement. Reading the existing PR #16 `match.json` or comparing its saved image files only reproduces that historical capture.
