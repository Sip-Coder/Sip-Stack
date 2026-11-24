# Visible Human skeleton meshes

“Visible-Human-3d-Models” by Seyed Hamidreza Alavi and Malte Asseln (BoneHub, University of Twente) is licensed under Creative Commons Attribution 4.0 International. The dataset is identified by DOI 10.57967/hf/10464. [Dataset and attribution](https://huggingface.co/datasets/BoneHub/visible-human-3d-models) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

BoneHub’s work derives from T. E. Andreassen et al., “Three Dimensional Lower Extremity Musculoskeletal Geometry of the Visible Human Female and Male,” *Scientific Data* **10**, 34 (2023), DOI 10.1038/s41597-022-01905-2. The original CT data come from the U.S. National Library of Medicine Visible Human Project. [Paper](https://doi.org/10.1038/s41597-022-01905-2) · [Visible Human Project](https://www.nlm.nih.gov/research/visible/visible_human.html)

## Packaged source files

These GLBs match the supplied Mobile and High exports byte for byte. The supplied exports used tier-specific simplification, position quantization and meshopt compression to package the scans. Axon draws each supplied bone in a separate rigid pose with a single uniform character scale. Procedural elbow repairs and costal cartilage are separately labeled. [Source file fingerprints](../review/source-true-anatomy/source-files.json) · [Muscle sources and permitted adaptations](MUSCLE-SKIN-LICENSE.md)

| Character | Source pack | Meshes | Source triangles |
|---|---|---:|---:|
| Sippy | [Male, Mobile](skeleton-male-mobile.glb) | 142 | 72,106 |
| Sippy | [Male, High](skeleton-male-high.glb) | 142 | 253,370 |
| Roma | [Female, Mobile](skeleton-female-mobile.glb) | 143 | 73,066 |
| Roma | [Female, High](skeleton-female-high.glb) | 143 | 250,916 |

For the face inspection, each source mandible rotates about its two CT condyles. The cranium and maxilla keep their donor pose and the same character scale. [Per-mesh source and draw checks](../review/source-true-anatomy/source-geometry-proof.json) · [Facial landmarks and jaw verification](../review/face-fine-tune/anatomy.md)
