# Source geometry verification

The audit decodes the restored source GLBs with Three’s standard GLTFLoader. It compares each source mesh to the live inspection mesh and its actual vertex and index range submitted by Axon. It checks one character-wide scale, perpendicular rotation columns and a positive determinant on every mesh. The residual measures the greatest vertex distance after that same matrix. Each drawn index and its winding match the source. [Per-mesh data](source-geometry-proof.json) · [Source file checksums](source-files.json) · [Audit tool](../../../../tools/check-source-anatomy.mjs)

The audit repeats the comparison in the production upright bind pose and at simulation step 42 of a walk. The tolerance is 0.00001 in and covers rounding when the draw buffers store 32-bit float coordinates. Elbow reconstructions and costal cartilage are separate additions. Roma’s male-donor upper-body adaptations are listed separately and excluded from the source geometry result.

| Character and tier | BoneHub meshes | Unchanged muscles | Uniform scale | Neutral max residual | Walk max residual |
|---|---:|---:|---:|---:|---:|
| Sippy Mobile | 142 | 361 | 0.9868402 | 0.000004652 in | 0.000004827 in |
| Sippy High | 142 | 361 | 0.9868402 | 0.000004711 in | 0.000004890 in |
| Roma Mobile | 143 | 76 | 1.0158755 | 0.000004734 in | 0.000004794 in |
| Roma High | 143 | 76 | 1.0158755 | 0.000004744 in | 0.000004882 in |

The lossless Visible Human Female loader retains all 76 source STL muscle surfaces. The pack builder compares every indexed coordinate triple with the original float32 bytes and counts every oriented triangle, including duplicates. The same file serves Mobile and High. The separate registration of the publication scanner origin uses one proper axis rotation, one unit conversion and one translation. The nearest-vertex comparison between these publication bones and their 13 independently segmented BoneHub counterparts had a largest per-bone 95th percentile of 0.44 in. Those are differences between segmentations and frames. The muscle shapes and topology remain exact. [Per-STL proof](andreassen-stl-proof.json) · [Source and license](../../assets/MUSCLE-SKIN-LICENSE.md)

## Reproduce

With Node.js 24 and Three.js 0.170.0 installed, set `THREE_ROOT` to the directory containing the pinned Three.js distribution. Run the following from the repository root.

```sh
THREE_ROOT=/path/to/three node tools/check-source-anatomy.mjs /tmp/source-geometry-proof.json
```

## Roma’s adapted upper-body muscles

The separate Roma check loads the released meshopt GLBs through Three’s standard GLTFLoader, places them in the production rig’s upright bind frame and measures actual decoded anchor vertices against the named BoneHub triangles. The 255 adapted surfaces per tier include 251 BodyParts3D meshes and four Z-Anatomy meshes. Each of the separate license packs and each mesh carries its adaptation label. [Audit results](roma-adaptation-audit.json) · [Audit tool](../../../../tools/check-roma-adaptation.mjs)

| Tier | Anchors | Named landmarks | Largest cortical anchor gap | Male atlas volume estimate | Adapted volume estimate |
|---|---:|---:|---:|---:|---:|
| Mobile | 526 | 192 | 0.000160 in | 500.70 in³ | 365.39 in³ |
| High | 526 | 192 | 0.000155 in | 510.86 in³ | 374.22 in³ |

The maximum difference between any independently decoded muscle volume and its reported estimate was 0.000494 in³. Some source surfaces have open boundaries, so summed oriented-triangle volumes are comparative estimates. The cortical distances describe the bind frame. [Mobile adaptation report](roma-muscle-adaptation-mobile.json) · [High adaptation report](roma-muscle-adaptation-high.json)
