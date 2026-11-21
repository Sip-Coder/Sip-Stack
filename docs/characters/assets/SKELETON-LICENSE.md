# Visible Human skeleton meshes

“Visible-Human-3d-Models” by Seyed Hamidreza Alavi and Malte Asseln (BoneHub, University of Twente) is licensed under Creative Commons Attribution 4.0 International. The dataset is identified by DOI 10.57967/hf/10464. [Dataset and attribution](https://huggingface.co/datasets/BoneHub/visible-human-3d-models) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

BoneHub’s work derives from T. E. Andreassen et al., “Three Dimensional Lower Extremity Musculoskeletal Geometry of the Visible Human Female and Male,” *Scientific Data* **10**, 34 (2023), DOI 10.1038/s41597-022-01905-2. The original CT data come from the U.S. National Library of Medicine Visible Human Project. [Paper](https://doi.org/10.1038/s41597-022-01905-2) · [Visible Human Project](https://www.nlm.nih.gov/research/visible/visible_human.html)

## Adaptations for Sip-Stack

The four skeleton GLBs in this directory contain simplified, quantized and meshopt-compressed surfaces from the male and female CT segmentations. A second offline simplification of the supplied GLBs preserves each named node and locks the cortex at extrema in 26 directions per bone. These adaptations retain the source license. Axon View reorients and fits the separate bones to Sippy and Roma in each pose. Procedural elbow repairs and costal cartilage supplement regions absent from the scans. Sip-Stack authors the skin and clothed character models. The [muscle atlas has separate provenance](MUSCLE-SKIN-LICENSE.md).

| Character | Packaged asset | Bone meshes | Supplied triangles | Shipped triangles |
|---|---|---:|---:|---:|
| Sippy | [Male, Mobile](skeleton-male-mobile.glb) | 142 | 72,106 | 60,808 |
| Sippy | [Male, High](skeleton-male-high.glb) | 142 | 253,370 | 108,906 |
| Roma | [Female, Mobile](skeleton-female-mobile.glb) | 143 | 73,066 | 61,794 |
| Roma | [Female, High](skeleton-female-high.glb) | 143 | 250,916 | 108,400 |

[Source and shipped SHA-256 fingerprints, bytes and bidirectional surface measurements](../review/scan-skeleton/scan-lod-surface.json)

## Reproduce a packaged GLB

Copy the [offline preparation script](../../../tools/prepare-scan-lod.mjs) into a scratch directory alongside the supplied `*-meshopt.glb` files. Install its dependencies there, then run it once for each asset. The site loads the meshopt decoder from the same pinned Three.js distribution as its renderer.

```sh
npm install @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 meshoptimizer@1.3.0
node prepare-scan-lod.mjs male-mobile-meshopt.glb skeleton-male-mobile.glb
```
