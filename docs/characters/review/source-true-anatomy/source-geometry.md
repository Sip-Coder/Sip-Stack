# Source geometry verification

The audit decodes the restored source GLBs with Three’s standard GLTFLoader. It compares each source mesh to the live inspection mesh and its actual vertex and index range submitted by Axon. It checks one character-wide scale, perpendicular rotation columns and a positive determinant on every mesh. The residual measures the greatest vertex distance after that same matrix. Each drawn index and its winding match the source. [Per-mesh data](source-geometry-proof.json) · [Source file checksums](source-files.json) · [Audit tool](../../../../tools/check-source-anatomy.mjs)

The audit repeats the comparison in the production neutral pose and at simulation step 42 of a walk. The tolerance is 0.00001 in and covers rounding when the draw buffers store 32-bit float coordinates. Elbow reconstructions and costal cartilage are separate additions. Roma’s male-donor upper-body adaptations are listed separately and excluded from the source geometry result.

| Character and tier | BoneHub meshes | Unchanged muscles | Uniform scale | Neutral max residual | Walk max residual |
|---|---:|---:|---:|---:|---:|
| Sippy Mobile | 142 | 361 | 0.9868402 | 0.000004661 in | 0.000004827 in |
| Sippy High | 142 | 361 | 0.9868402 | 0.000004688 in | 0.000004890 in |
| Roma Mobile | 143 | 76 | 1.0158755 | 0.000004749 in | 0.000004794 in |
| Roma High | 143 | 76 | 1.0158755 | 0.000004728 in | 0.000004882 in |

The lossless Visible Human Female loader retains all 76 source STL muscle surfaces. The pack builder compares every indexed coordinate triple with the original float32 bytes and counts every oriented triangle, including duplicates. The same file serves Mobile and High. The separate registration of the publication scanner origin uses one proper axis rotation, one unit conversion and one translation. The nearest-vertex comparison between these publication bones and their 13 independently segmented BoneHub counterparts had a largest per-bone 95th percentile of 0.44 in. Those are differences between segmentations and frames. The muscle shapes and topology remain exact. [Per-STL proof](andreassen-stl-proof.json) · [Source and license](../../assets/MUSCLE-SKIN-LICENSE.md)

## Reproduce

With Node.js 24 and Three.js 0.170.0 installed, set `THREE_ROOT` to the directory containing the pinned Three.js distribution. Run the following from the repository root.

```sh
THREE_ROOT=/path/to/three node tools/check-source-anatomy.mjs /tmp/source-geometry-proof.json
```
